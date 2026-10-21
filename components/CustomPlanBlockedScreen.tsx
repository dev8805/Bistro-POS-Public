import React from 'react';
import type { SubscriptionPlan } from '../context/AuthContext';
import CustomPlanCard from './CustomPlanCard';

interface CustomPlanBlockedScreenProps {
    /** Plan único (compat legacy) */
    plan: SubscriptionPlan;
    /** Todos los planes personalizados del negocio (Mensual, Trimestral, Anual…) */
    plans?: SubscriptionPlan[];
    canPay: boolean;
    onPay: (plan: SubscriptionPlan) => void;
    onLogout: () => void;
    isSubmitting?: boolean;
}

/**
 * Pantalla de bloqueo completa que se muestra cuando el negocio con plan
 * personalizado agotó el período de gracia. Reemplaza la pantalla neutra
 * "contacta a soporte" que veía el 10001 cuando aún no había pago autónomo.
 *
 * - Admin (`canPay=true`): ve la CustomPlanCard con botón "Pagar ahora".
 * - Empleado sin admin_settings: NO llega aquí — App.tsx lo manda a la
 *   pantalla actual "contacta a soporte".
 */
const CustomPlanBlockedScreen: React.FC<CustomPlanBlockedScreenProps> = ({
    plan,
    plans,
    canPay,
    onPay,
    onLogout,
    isSubmitting = false,
}) => {
    return (
        <div className="min-h-screen w-full bg-gradient-to-br from-gray-50 via-white to-emerald-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/20 flex flex-col items-center justify-center px-6 py-10 gap-6">
            <div className="text-center max-w-md">
                <span className="material-symbols-outlined text-5xl text-amber-500">lock_clock</span>
                <h1 className="mt-3 text-2xl font-bold text-stone-900 dark:text-white">
                    Tu suscripción está vencida
                </h1>
                <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
                    Renueva para volver a operar. El pago reactiva tu negocio al instante.
                </p>
            </div>

            <CustomPlanCard
                plan={plan}
                plans={plans}
                canPay={canPay}
                onPay={onPay}
                isSubmitting={isSubmitting}
            />

            <button
                type="button"
                onClick={onLogout}
                aria-label="Cerrar sesión"
                tabIndex={0}
                className="text-sm text-stone-500 dark:text-slate-400 underline hover:text-stone-700 dark:hover:text-slate-200"
            >
                Cerrar sesión
            </button>
        </div>
    );
};

export default CustomPlanBlockedScreen;
