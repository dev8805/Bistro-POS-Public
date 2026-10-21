import React, { useLayoutEffect, useRef, useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Screen } from '../types';
import { useGracePeriodStatus } from '../hooks/useGracePeriodStatus';
import { useCustomPlan } from '../hooks/useCustomPlan';
import { usePermissions } from '../hooks/usePermissions';
import { useToast } from '../context/ToastContext';
import { openCustomPlanCheckout, waitForPaymentApplied } from '../lib/customPlanCheckout';
import { getRealEmail } from '../lib/formatters';
import CustomPlanCard from './CustomPlanCard';
import type { SubscriptionPlan } from '../context/AuthContext';

interface GracePeriodBannerProps {
    onNavigate: (screen: Screen) => void;
}

const DISMISS_KEY = 'grace_banner_dismissed';

export const GracePeriodBanner: React.FC<GracePeriodBannerProps> = ({ onNavigate }) => {
    const { profile, checkSubscription } = useAuth();
    const { isInGrace, isUrgent } = useGracePeriodStatus();
    const { hasCustomPlan, customPlan, customPlans } = useCustomPlan();
    const { hasPermission } = usePermissions();
    const { showToast } = useToast();
    const bannerRef = useRef<HTMLDivElement>(null);
    // Task 14: AbortController para cortar el polling PENDING si el banner se
    // desmonta mientras Wompi todavía no resolvió el estado.
    const pollAbortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        return () => pollAbortRef.current?.abort();
    }, []);

    const startPollingAbort = () => {
        pollAbortRef.current?.abort();
        pollAbortRef.current = new AbortController();
        return pollAbortRef.current.signal;
    };

    // Selector de planes personalizados: al pulsar "Pagar" no se abre Wompi
    // directo, sino un modal con los planes del negocio (Mensual/Trimestral/
    // Anual, según tenga) para que el admin elija cuál pagar.
    const [showPlanPicker, setShowPlanPicker] = useState(false);
    const [paying, setPaying] = useState(false);

    // Meseros nunca ven este banner: no toman decisiones de facturación y su UI
    // debe seguir despejada. Se decide ANTES del useLayoutEffect para que no
    // reserve espacio en el layout global (--grace-banner-h se queda en 0).
    const isMesero = profile?.role === 'Mesero';

    // Solo quien tenga permiso `admin_settings` (dueño/admin) puede iniciar el pago
    // o navegar al selector de planes. Cajeros ven el aviso pero sin botón.
    const canPay = hasPermission('admin_settings');

    // Dismiss por día: el usuario puede ocultar el banner y reaparece al día siguiente
    // (o si cierra sesión y vuelve a entrar, según se maneje el localStorage).
    const [dismissed, setDismissed] = useState<boolean>(() => {
        try {
            const todayKey = new Date().toDateString();
            return localStorage.getItem(DISMISS_KEY) === todayKey;
        } catch {
            return false;
        }
    });

    // Si el estado de gracia cambia (ej. la suscripción se renovó y volvió a activa,
    // luego vuelve a vencer), limpiar el dismiss para no perder el aviso.
    useEffect(() => {
        if (!isInGrace) {
            setDismissed(false);
        }
    }, [isInGrace]);

    const shouldShow = isInGrace && !dismissed && !isMesero;

    // El banner es fijo (position: fixed), así que no ocupa espacio en el flujo.
    // Medimos su altura real y la exponemos en `--grace-banner-h` para que el
    // layout (App.tsx y Sidebar) reserve exactamente ese espacio con padding-top.
    // La altura varía por breakpoint: en móvil el botón se apila en otra fila,
    // por eso NO se puede usar un valor fijo. ResizeObserver mantiene el valor al día.
    // Cuando el banner se oculta (dismissed o fuera de gracia), la variable vuelve a 0.
    useLayoutEffect(() => {
        const root = document.documentElement;
        if (!shouldShow) {
            root.style.setProperty('--grace-banner-h', '0px');
            return;
        }
        const el = bannerRef.current;
        if (!el) return;

        const updateHeight = () => {
            root.style.setProperty('--grace-banner-h', `${el.offsetHeight}px`);
        };
        updateHeight();

        const observer = new ResizeObserver(updateHeight);
        observer.observe(el);
        window.addEventListener('resize', updateHeight);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateHeight);
            root.style.setProperty('--grace-banner-h', '0px');
        };
    }, [shouldShow, isUrgent, canPay, hasCustomPlan]);

    // Early return para meseros: no montar nada (ni banner, ni variable CSS).
    if (isMesero) return null;

    const handleDismiss = () => {
        try {
            localStorage.setItem(DISMISS_KEY, new Date().toDateString());
        } catch { }
        setDismissed(true);
    };

    const handleRenew = () => {
        onNavigate(Screen.SUBSCRIPTION_PLANS);
    };

    const handlePayCustomPlan = async (planToPay?: SubscriptionPlan) => {
        const target = planToPay || customPlan;
        if (!profile || !target) return;
        // El correo es opcional en el helper: si no hay real (cuenta SMS OTP
        // con @bistro.temp), Wompi lo pide dentro de su widget. Evita frustrar
        // al usuario en un flujo crítico como el banner de gracia.
        const customerEmail = getRealEmail(profile.email) || undefined;
        setPaying(true);
        try {
        await openCustomPlanCheckout({
            profile,
            plan: target,
            customerEmail,
            getAbortSignal: startPollingAbort,
            onApproved: async (tx) => {
                // El webhook (service_role) activa la suscripción. Aquí solo
                // OBSERVAMOS (lectura) hasta que se refleje y refrescamos el
                // estado; el cliente ya no escribe la activación (Req 4.6).
                const { applied } = await waitForPaymentApplied({
                    wompiTransactionId: tx.id,
                    signal: startPollingAbort(),
                });
                await checkSubscription();
                if (applied) {
                    showToast(
                        '¡Gracias por tu pago!',
                        'success',
                        5000,
                        'Tu suscripción está activa. Sigue disfrutando de Bistro.'
                    );
                } else {
                    showToast(
                        '¡Gracias por tu pago!',
                        'info',
                        6000,
                        'Tu pago fue aprobado; la activación puede tardar unos segundos en reflejarse.'
                    );
                }
            },
            onPending: () => {
                showToast('Pago en proceso. Estamos verificando con el banco.', 'info');
            },
            onPendingTimeout: () => {
                showToast(
                    'El pago sigue en verificación. Refresca la pantalla en unos minutos o volveremos a habilitar tu acceso automáticamente cuando el banco confirme.',
                    'info'
                );
            },
            onDeclined: (message) => {
                showToast(message, 'error');
            },
            onError: (error) => {
                showToast(error.message, 'error');
            },
        });
        } finally {
            setPaying(false);
        }
    };

    if (!shouldShow) return null;

    // Paleta warm bistro: ámbar como color primario del sistema para el estado normal,
    // rojo para las últimas 24h (urgente). Sin fondos oscuros ni sombras.
    const bgColor = isUrgent
        ? 'bg-red-50 dark:bg-red-950/40 border-red-400'
        : 'bg-amber-50 dark:bg-amber-950/30 border-amber-400';

    const titleColor = isUrgent
        ? 'text-red-900 dark:text-red-200'
        : 'text-amber-900 dark:text-amber-200';

    const messageColor = isUrgent
        ? 'text-red-800/90 dark:text-red-300/90'
        : 'text-amber-800/90 dark:text-amber-300/90';

    const iconColor = isUrgent
        ? 'text-red-500 dark:text-red-400'
        : 'text-amber-500 dark:text-amber-400';

    const closeBtnColor = isUrgent
        ? 'text-red-700 hover:text-red-900 hover:bg-red-100 dark:text-red-300 dark:hover:text-red-100 dark:hover:bg-red-900/40'
        : 'text-amber-700 hover:text-amber-900 hover:bg-amber-100 dark:text-amber-300 dark:hover:text-amber-100 dark:hover:bg-amber-900/40';

    const btnColor = isUrgent
        ? 'bg-red-500 hover:bg-red-600 text-white'
        : 'bg-amber-400 hover:bg-amber-500 text-stone-900';

    const icon = isUrgent ? 'error' : 'schedule';

    const title = isUrgent
        ? 'Último día de acceso ⚠️'
        : 'Tu suscripción ha finalizado';

    const message = isUrgent
        ? 'Hoy se suspende el acceso a tu negocio. Por favor renueva hoy para seguir operando sin interrupciones.'
        : 'Por favor, realiza la renovación de tu plan hoy mismo para asegurar que tu negocio siga operando sin interrupciones.';

    return (
        <>
        <div ref={bannerRef} className="fixed top-0 left-0 right-0 z-[70]">
            <div
                className={`border-b ${bgColor} px-4 py-2.5 md:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3`}
                role="alert"
                aria-live="assertive"
            >
                <div className="flex items-start gap-3 min-w-0">
                    <span className={`material-symbols-outlined text-xl mt-0.5 flex-shrink-0 ${iconColor}`}>
                        {icon}
                    </span>
                    <div className="min-w-0">
                        <p className={`font-bold text-sm ${titleColor}`}>
                            {title}
                        </p>
                        <p className={`text-xs mt-0.5 max-w-2xl ${messageColor}`}>
                            {message}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-1 w-full sm:w-auto flex-shrink-0">
                    {canPay && hasCustomPlan && (
                        <button
                            onClick={() => setShowPlanPicker(true)}
                            className={`flex-1 sm:flex-none px-4 py-2 font-bold text-xs rounded-lg transition-colors whitespace-nowrap ${btnColor}`}
                        >
                            Pagar
                        </button>
                    )}
                    {canPay && !hasCustomPlan && (
                        <button
                            onClick={handleRenew}
                            className={`flex-1 sm:flex-none px-4 py-2 font-bold text-xs rounded-lg transition-colors whitespace-nowrap ${btnColor}`}
                        >
                            Renovar ahora
                        </button>
                    )}
                    <button
                        onClick={handleDismiss}
                        className={`p-2 rounded-lg transition-colors flex-shrink-0 ${closeBtnColor}`}
                        aria-label="Ocultar por hoy"
                        title="Ocultar por hoy"
                    >
                        <span className="material-symbols-outlined text-base">close</span>
                    </button>
                </div>
            </div>
        </div>

        {showPlanPicker && (
            <div
                className="fixed inset-0 z-[80] flex items-center justify-center p-4"
                role="dialog"
                aria-modal="true"
                aria-label="Elige tu plan personalizado"
            >
                <div
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    role="button"
                    tabIndex={-1}
                    aria-label="Cerrar"
                    onClick={() => { if (!paying) setShowPlanPicker(false); }}
                    onKeyDown={(e) => { if (e.key === 'Escape' && !paying) setShowPlanPicker(false); }}
                />
                <div className="relative z-10 w-full max-w-md animate-[scaleIn_0.15s_ease-out]">
                    <CustomPlanCard
                        plan={customPlan ?? undefined}
                        plans={customPlans}
                        canPay={canPay}
                        onPay={handlePayCustomPlan}
                        isSubmitting={paying}
                    />
                    <button
                        type="button"
                        onClick={() => setShowPlanPicker(false)}
                        disabled={paying}
                        aria-label="Cancelar"
                        tabIndex={0}
                        className="mt-4 w-full text-center text-sm text-white/90 underline hover:text-white disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        )}
        </>
    );
};
