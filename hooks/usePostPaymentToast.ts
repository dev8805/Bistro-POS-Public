import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { readPaymentFlag, clearPaymentFlag } from '../lib/paymentToastFlag';

/**
 * Dispara el toast "¡Gracias por tu pago!" cuando el usuario vuelve a Bistro
 * desde un pago con redirect (PSE, Botón Bancolombia).
 *
 * Flujo:
 * 1. `openCustomPlanCheckout` escribe un flag antes de abrir el widget.
 * 2. Si el pago se resuelve inline (tarjeta/Nequi) el propio checkout limpia
 *    el flag y muestra el toast desde `onApproved`.
 * 3. Si hay redirect, la app se remonta al volver. Este hook:
 *    - Detecta el flag.
 *    - Si la suscripción ya está activa → dispara toast + limpia flag.
 *    - Si aún no llega el webhook, hace polling breve (10 intentos, 30 s)
 *      revalidando la suscripción, y cuando pasa a activa dispara el toast.
 *    - Si el polling se agota sin éxito, deja el flag para que un mount
 *      posterior dentro de los 30 min lo reintente. Pasado ese tiempo el flag
 *      expira solo (ver `paymentToastFlag.ts`).
 *
 * `firedRef` evita que el toast se dispare más de una vez en la misma sesión.
 */
export const usePostPaymentToast = (): void => {
    const { hasActiveSubscription, loading, profile, checkSubscription } = useAuth();
    const { showToast } = useToast();
    const firedRef = useRef(false);
    const pollingRef = useRef<number | null>(null);

    useEffect(() => {
        if (loading || !profile || firedRef.current) return;

        const flag = readPaymentFlag();
        if (!flag) return;

        // Solo disparar para el mismo negocio que originó el pago. Si otro
        // usuario abrió sesión en el navegador, el flag no le corresponde.
        if (flag.businessId !== profile.business_id) return;

        if (hasActiveSubscription) {
            firedRef.current = true;
            clearPaymentFlag();
            if (pollingRef.current !== null) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
            showToast(
                '¡Gracias por tu pago!',
                'success',
                5000,
                'Tu suscripción está activa. Sigue disfrutando de Bistro.'
            );
            return;
        }

        // Aún no activo — arrancar polling breve para atrapar el webhook.
        if (pollingRef.current !== null) return;
        let attempts = 0;
        const MAX_ATTEMPTS = 10; // 10 × 3s = 30s
        pollingRef.current = window.setInterval(() => {
            attempts++;
            void checkSubscription();
            if (attempts >= MAX_ATTEMPTS && pollingRef.current !== null) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        }, 3000);

        return () => {
            if (pollingRef.current !== null) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
        };
    }, [hasActiveSubscription, loading, profile, checkSubscription, showToast]);
};
