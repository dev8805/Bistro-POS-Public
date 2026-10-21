import { supabase } from './supabase';
import type { UserProfile } from '../types';
import { WOMPI_PUBLIC_KEY, SUPABASE_URL } from '../src/config/wompi';
import type { SubscriptionPlan } from '../context/AuthContext';
import { markPaymentInProgress } from './paymentToastFlag';
import { buildPaymentReference } from './paymentReference';

export interface WompiTransaction {
    id: string;
    status: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING';
    statusMessage?: string;
    reference: string;
    amountInCents: number;
    paymentMethodType: string;
}

export interface OpenCustomPlanCheckoutParams {
    profile: UserProfile;
    plan: SubscriptionPlan;
    /**
     * Correo del pagador. Es opcional: si no lo pasamos, Wompi lo pide dentro
     * de su propio widget en la vista "Insert your contact information". Útil
     * para cuentas creadas por SMS OTP (que tienen correo sintético
     * `@bistro.temp`) y para pantallas de bloqueo donde el usuario no puede
     * acceder al perfil para configurarlo.
     */
    customerEmail?: string;
    onApproved: (tx: WompiTransaction) => Promise<void> | void;
    onPending: (tx: WompiTransaction) => void;
    onDeclined: (message: string) => void;
    onError: (error: Error) => void;
    /**
     * (Task 14) Se dispara si un pago PENDING no llega a resolverse en los
     * 5 minutos de polling. Sirve para mostrar un toast "El pago sigue en
     * verificación". Si el consumidor no lo pasa, no ocurre nada extra al
     * agotar el timeout (el toast inicial de `onPending` ya avisó al usuario).
     */
    onPendingTimeout?: () => void;
    /**
     * (Task 14) Permite al consumidor pasar un AbortSignal que cancela el
     * polling si el componente que inició el pago se desmonta. Se invoca justo
     * antes de arrancar el polling, así que cada checkout puede tener su propio
     * controller sin acumular listeners.
     */
    getAbortSignal?: () => AbortSignal | undefined;
}

/**
 * Consulta el estado real de una transacción en el endpoint público de Wompi.
 * Reintenta cada 5s hasta 60 veces (5 minutos total). Cortés con AbortSignal
 * para detener el bucle si el componente se desmonta.
 *
 * Devuelve:
 * - APPROVED  → el pago quedó aprobado; el llamador debe ejecutar la lógica de éxito.
 * - DECLINED  → el pago fue rechazado/void/error; el llamador debe notificar sin tocar BD.
 * - TIMEOUT   → se agotaron los 5 minutos sin resolución, o el signal fue abortado.
 *
 * Devuelve también el `tx` refrescado cuando la respuesta HTTP es válida, para
 * que el llamador pueda pasarlo a `onApproved` con datos actualizados.
 *
 * Requerimientos: 10.1, 10.2, 10.3, 10.4, 10.5.
 */
const pollTransactionStatus = async (
    txId: string,
    signal?: AbortSignal
): Promise<{ status: 'APPROVED' | 'DECLINED' | 'TIMEOUT'; tx: WompiTransaction | null }> => {
    const MAX_ATTEMPTS = 60;   // 60 × 5s = 5 minutos
    const INTERVAL_MS = 5000;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (signal?.aborted) return { status: 'TIMEOUT', tx: null };

        // Espera intervalada con soporte de abort (rechaza para cortar el sleep).
        try {
            await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(resolve, INTERVAL_MS);
                if (signal) {
                    const onAbort = () => {
                        clearTimeout(timer);
                        reject(new DOMException('Aborted', 'AbortError'));
                    };
                    signal.addEventListener('abort', onAbort, { once: true });
                }
            });
        } catch {
            return { status: 'TIMEOUT', tx: null };
        }

        if (signal?.aborted) return { status: 'TIMEOUT', tx: null };

        try {
            const res = await fetch(`https://production.wompi.co/v1/transactions/${txId}`, { signal });
            if (!res.ok) continue; // reintento en el siguiente ciclo
            const json = await res.json();
            const data = json?.data;
            const status = data?.status as string | undefined;

            const refreshed: WompiTransaction | null = data
                ? {
                    id: data.id,
                    status: (status as WompiTransaction['status']) ?? 'PENDING',
                    statusMessage: data.status_message,
                    reference: data.reference,
                    amountInCents: data.amount_in_cents,
                    paymentMethodType: data.payment_method_type,
                }
                : null;

            if (status === 'APPROVED') return { status: 'APPROVED', tx: refreshed };
            if (status === 'DECLINED' || status === 'ERROR' || status === 'VOIDED') {
                return { status: 'DECLINED', tx: refreshed };
            }
            // Sigue en PENDING → continuar polling.
        } catch (err) {
            if ((err as { name?: string }).name === 'AbortError') {
                return { status: 'TIMEOUT', tx: null };
            }
            // Error de red transitorio: reintentar en el siguiente ciclo.
        }
    }
    return { status: 'TIMEOUT', tx: null };
};

/**
 * Abre el checkout de Wompi mediante Web Checkout oficial a pantalla completa (redirección).
 *
 * Utiliza el Web Checkout oficial de Wompi redirigiendo a https://checkout.wompi.co/p/
 * con los parámetros de la transacción y la firma criptográfica HMAC generada por la
 * Edge Function. Elimina cualquier glitch de altura, iframes incrustados o bloqueos visuales.
 * Al completarse o cancelarse el pago, Wompi redirige de regreso a Bistro (redirect-url)
 * donde usePostPaymentToast valida la activación de la suscripción.
 */
export const openCustomPlanCheckout = async (
    params: OpenCustomPlanCheckoutParams
): Promise<void> => {
    const {
        profile,
        plan,
        customerEmail,
        onError,
    } = params;

    try {
        const amountInCents = Math.round(Number(plan.price_monthly) * 100);
        // Referencia canónica `bsub_<businessId>_<planId>_<timestamp>`: el webhook
        // resuelve negocio + plan (y por tanto el periodo) sin ambigüedad.
        const reference = buildPaymentReference(profile.business_id, plan.id);

        // Firma HMAC del monto (edge function en producción).
        const sigRes = await fetch(`${SUPABASE_URL}/functions/v1/generate-payment-signature`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reference, amountInCents, currency: 'COP' }),
        });
        const sigData = await sigRes.json();
        if (!sigData.success) {
            throw new Error(sigData.error || 'Error generando firma de pago');
        }

        // Marca en sessionStorage el pago en curso para que usePostPaymentToast
        // detecte la activación al regresar a Bistro y muestre el toast.
        if (profile.business_id) {
            markPaymentInProgress(reference, profile.business_id);
        }

        // URL limpia de retorno a Bistro (evita acumular query params previos)
        const redirectUrl = window.location.href.split('?')[0];

        // Construcción de la URL de Wompi Web Checkout
        const checkoutUrl = new URL('https://checkout.wompi.co/p/');
        checkoutUrl.searchParams.set('public-key', WOMPI_PUBLIC_KEY);
        checkoutUrl.searchParams.set('currency', 'COP');
        checkoutUrl.searchParams.set('amount-in-cents', amountInCents.toString());
        checkoutUrl.searchParams.set('reference', reference);
        checkoutUrl.searchParams.set('signature:integrity', sigData.signature);
        checkoutUrl.searchParams.set('redirect-url', redirectUrl);

        if (customerEmail) {
            checkoutUrl.searchParams.set('customer-data:email', customerEmail);
        }
        if (profile.full_name) {
            checkoutUrl.searchParams.set('customer-data:full-name', profile.full_name);
        }
        if (profile.phone) {
            checkoutUrl.searchParams.set('customer-data:phone-number', profile.phone);
            checkoutUrl.searchParams.set('customer-data:phone-number-prefix', '+57');
        }

        // Redirige al usuario al Web Checkout a pantalla completa de Wompi
        window.location.href = checkoutUrl.toString();
    } catch (err: unknown) {
        onError(err instanceof Error ? err : new Error(String(err)));
    }
};

/**
 * Espera (SOLO LECTURA) a que el webhook `wompi-webhook` refleje el pago aplicado.
 *
 * La activación y el registro de factura son autoridad ÚNICA del servidor: el
 * webhook (service_role) inserta la fila en `subscription_invoices` con el
 * `wompi_transaction_id` y extiende `business_subscriptions`. El cliente ya NO
 * escribe nada (lo bloquean el trigger `enforce_subscription_write_authority` y
 * la RLS de facturas). Este helper solo OBSERVA: hace polling de
 * `subscription_invoices` filtrando por `wompi_transaction_id` (la RLS deja al
 * negocio dueño leer sus facturas) hasta ver la factura que prueba que el
 * webhook aplicó el pago. En cuanto aparece, el llamador refresca su estado con
 * `checkSubscription()`.
 *
 * No lanza: devuelve `{ applied: true }` si vio la factura, o `{ applied: false }`
 * si se agotó el tiempo o se abortó. El webhook puede tardar unos segundos, así
 * que un `false` NO es un error: el llamador debe mostrar un mensaje amable
 * ("la activación puede tardar unos segundos en reflejarse"), no un error.
 *
 * Los tiempos siguen el patrón de `pollTransactionStatus` (misma espera
 * intervalada abortable), acotados a una ventana corta para una confirmación
 * ágil en la UI.
 *
 * Requerimientos: 4.6.
 */
export const waitForPaymentApplied = async (params: {
    wompiTransactionId: string;
    signal?: AbortSignal;
    maxAttempts?: number;
    intervalMs?: number;
}): Promise<{ applied: boolean }> => {
    const { wompiTransactionId, signal, maxAttempts = 20, intervalMs = 3000 } = params;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (signal?.aborted) return { applied: false };

        // Lectura: ¿ya existe la factura que inserta el webhook para esta tx?
        try {
            const { data, error } = await supabase
                .from('subscription_invoices')
                .select('id')
                .eq('wompi_transaction_id', wompiTransactionId)
                .maybeSingle();
            if (!error && data) return { applied: true };
        } catch {
            // Error de red transitorio: reintentar en el siguiente ciclo.
        }

        // Espera intervalada con soporte de abort (salvo tras el último intento).
        if (attempt < maxAttempts - 1) {
            try {
                await new Promise<void>((resolve, reject) => {
                    const timer = setTimeout(resolve, intervalMs);
                    if (signal) {
                        signal.addEventListener(
                            'abort',
                            () => {
                                clearTimeout(timer);
                                reject(new DOMException('Aborted', 'AbortError'));
                            },
                            { once: true }
                        );
                    }
                });
            } catch {
                return { applied: false };
            }
        }
    }

    return { applied: false };
};
