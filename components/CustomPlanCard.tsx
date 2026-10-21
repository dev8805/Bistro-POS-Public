import React, { useState } from 'react';
import type { SubscriptionPlan } from '../context/AuthContext';

interface CustomPlanCardProps {
    /** Plan único (compat legacy) — si se pasa, se muestra solo ese plan */
    plan?: SubscriptionPlan;
    /** Múltiples planes personalizados del negocio (nuevo) */
    plans?: SubscriptionPlan[];
    canPay: boolean;
    onPay: (plan: SubscriptionPlan) => void;
    isSubmitting?: boolean;
    /** business_id y user_id para redimir código promo */
    businessId?: string;
    userId?: string;
    /** Callback después de canjear código exitosamente */
    onCodeRedeemed?: () => void;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const formatCOP = (value: number): string => {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
    }).format(value);
};

const getPeriodLabel = (months: number): string => {
    if (months === 1) return 'Mensual';
    if (months === 3) return 'Trimestral';
    if (months === 12) return 'Anual';
    return `${months} meses`;
};

const getPeriodSuffix = (months: number): string => {
    if (months === 1) return '/mes';
    if (months === 3) return '/trimestre';
    if (months === 12) return '/año';
    return `/${months} meses`;
};

const getExtensionLabel = (months: number): string => {
    if (months === 1) return 'Cada pago aprobado extiende tu suscripción 1 mes.';
    if (months === 3) return 'Cada pago aprobado extiende tu suscripción 3 meses.';
    if (months === 12) return 'Cada pago aprobado extiende tu suscripción 12 meses.';
    return `Cada pago aprobado extiende tu suscripción ${months} meses.`;
};

/** Sección reutilizable de input de código promo */
const PromoCodeSection: React.FC<{
    businessId: string;
    userId: string;
    planId?: string;
    onRedeemed?: () => void;
}> = ({ businessId, userId, planId, onRedeemed }) => {
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ success?: boolean; message?: string } | null>(null);

    const handleRedeem = async () => {
        if (!code.trim()) return;
        setLoading(true);
        setResult(null);

        try {
            const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-promo-codes?action=redeem`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: code.trim(),
                    business_id: businessId,
                    user_id: userId,
                    plan_id: planId,
                }),
            });
            const data = await res.json();

            if (data.success) {
                const endDate = data.subscription_end ? new Date(data.subscription_end).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
                const durationLabel = data.duration_days && data.duration_days > 0
                    ? `${data.duration_days} día${data.duration_days > 1 ? 's' : ''}`
                    : `${data.duration_months} mes${data.duration_months > 1 ? 'es' : ''}`;
                setResult({ success: true, message: `¡Código activado! Tu suscripción se extendió ${durationLabel}.${endDate ? ` Próximo pago: ${endDate}.` : ''}` });
                setCode('');
                onRedeemed?.();
            } else {
                setResult({ success: false, message: data.error || 'Código no válido' });
            }
        } catch {
            setResult({ success: false, message: 'Error de conexión. Intenta de nuevo.' });
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleRedeem();
        }
    };

    return (
        <div className="mt-5 pt-5 border-t border-stone-200 dark:border-slate-700">
            <p className="text-xs font-semibold text-stone-500 dark:text-slate-400 mb-2">¿Tienes un código?</p>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={code}
                    onChange={e => { setCode(e.target.value.toUpperCase()); setResult(null); }}
                    onKeyDown={handleKeyDown}
                    placeholder="BISTRO-XXXX"
                    className="flex-1 px-3 py-2.5 rounded-lg border border-stone-200 dark:border-slate-600 bg-stone-50 dark:bg-slate-700/50 text-sm font-mono font-bold text-stone-900 dark:text-white placeholder-stone-400 dark:placeholder-slate-500 outline-none focus:border-amber-400 dark:focus:border-amber-500 transition-colors"
                    aria-label="Código promocional"
                    tabIndex={0}
                    disabled={loading}
                />
                <button
                    type="button"
                    onClick={handleRedeem}
                    disabled={loading || !code.trim()}
                    className="px-4 py-2.5 rounded-lg bg-stone-800 dark:bg-slate-600 text-white text-xs font-bold transition-colors hover:bg-stone-700 dark:hover:bg-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Canjear código"
                    tabIndex={0}
                >
                    {loading ? '...' : 'Canjear'}
                </button>
            </div>
            {result && (
                <p className={`mt-2 text-xs font-medium ${result.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                    {result.message}
                </p>
            )}
        </div>
    );
};

/**
 * Card del plan personalizado. Soporta un solo plan (legacy) o múltiples planes
 * (mensual, trimestral, anual) para que el dueño del negocio elija cuál pagar.
 *
 * - Cuando `canPay=false` el botón se OCULTA (no solo se deshabilita).
 * - El monto se formatea en COP con Intl.NumberFormat, sin decimales.
 * - Esta card es la superficie autorizada para mostrar el monto del plan
 *   personalizado, aún cuando el negocio tenga la regla de precios ocultos.
 * - Incluye sección de código promo si se pasan businessId y userId.
 */
const CustomPlanCard: React.FC<CustomPlanCardProps> = ({ plan, plans, canPay, onPay, isSubmitting = false, businessId, userId, onCodeRedeemed }) => {
    // Resolver los planes a mostrar
    const allPlans: SubscriptionPlan[] = plans && plans.length > 0
        ? plans
        : (plan ? [plan] : []);

    const [selectedIndex, setSelectedIndex] = useState(0);
    const selectedPlan = allPlans[selectedIndex] ?? allPlans[0];

    if (allPlans.length === 0) return null;

    const handlePayClick = () => {
        if (isSubmitting || !selectedPlan) return;
        onPay(selectedPlan);
    };

    const handlePayKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handlePayClick();
        }
    };

    const showPromoSection = canPay && businessId && userId;

    // Si solo hay 1 plan, mostrar card simple (legacy)
    if (allPlans.length === 1) {
        const thePlan = allPlans[0];
        return (
            <div className="max-w-md mx-auto rounded-2xl border border-stone-200 bg-white shadow-sm p-6 dark:border-slate-700 dark:bg-slate-800">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-bold text-stone-900 dark:text-white">{thePlan.name}</h3>
                        <p className="text-sm text-stone-500 dark:text-slate-400">Plan {getPeriodLabel(thePlan.initial_period_months).toLowerCase()} personalizado</p>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        Activo
                    </span>
                </div>

                <div className="mt-6">
                    <p className="text-3xl font-extrabold text-stone-900 dark:text-white">
                        {formatCOP(Number(thePlan.price_monthly))}
                        <span className="ml-1 text-sm font-medium text-stone-500 dark:text-slate-400">{getPeriodSuffix(thePlan.initial_period_months)}</span>
                    </p>
                    <p className="mt-2 text-xs text-stone-500 dark:text-slate-400">
                        {getExtensionLabel(thePlan.initial_period_months)}
                    </p>
                </div>

                {canPay && (
                    <button
                        type="button"
                        onClick={handlePayClick}
                        onKeyDown={handlePayKeyDown}
                        disabled={isSubmitting}
                        aria-label={`Pagar ${thePlan.name} por ${formatCOP(Number(thePlan.price_monthly))}`}
                        tabIndex={0}
                        className="mt-6 w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-stone-900 shadow-sm transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isSubmitting ? 'Abriendo pago...' : 'Pagar ahora'}
                    </button>
                )}

                {showPromoSection && (
                    <PromoCodeSection
                        businessId={businessId}
                        userId={userId}
                        planId={thePlan.id}
                        onRedeemed={onCodeRedeemed}
                    />
                )}
            </div>
        );
    }

    // Múltiples planes: mostrar selector de periodicidad
    return (
        <div className="max-w-md mx-auto rounded-2xl border border-stone-200 bg-white shadow-sm p-6 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold text-stone-900 dark:text-white">Tu plan personalizado</h3>
                    <p className="text-sm text-stone-500 dark:text-slate-400">Elige la periodicidad de pago</p>
                </div>
                <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    Activo
                </span>
            </div>

            {/* Selector de periodicidad */}
            <div className="mt-5 grid gap-2" style={{ gridTemplateColumns: `repeat(${allPlans.length}, 1fr)` }}>
                {allPlans.map((p, i) => (
                    <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedIndex(i)}
                        className={`rounded-xl px-3 py-3 text-center transition-all border ${
                            selectedIndex === i
                                ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-500'
                                : 'border-stone-200 bg-stone-50 dark:border-slate-600 dark:bg-slate-700/50'
                        }`}
                        aria-label={`Seleccionar plan ${getPeriodLabel(p.initial_period_months)}`}
                        tabIndex={0}
                    >
                        <div className={`text-xs font-bold ${
                            selectedIndex === i
                                ? 'text-amber-700 dark:text-amber-300'
                                : 'text-stone-600 dark:text-slate-300'
                        }`}>
                            {getPeriodLabel(p.initial_period_months)}
                        </div>
                        <div className={`text-sm font-extrabold mt-1 ${
                            selectedIndex === i
                                ? 'text-stone-900 dark:text-white'
                                : 'text-stone-500 dark:text-slate-400'
                        }`}>
                            {formatCOP(Number(p.price_monthly))}
                        </div>
                    </button>
                ))}
            </div>

            {/* Detalle del seleccionado */}
            {selectedPlan && (
                <div className="mt-5">
                    <p className="text-3xl font-extrabold text-stone-900 dark:text-white">
                        {formatCOP(Number(selectedPlan.price_monthly))}
                        <span className="ml-1 text-sm font-medium text-stone-500 dark:text-slate-400">{getPeriodSuffix(selectedPlan.initial_period_months)}</span>
                    </p>
                    <p className="mt-2 text-xs text-stone-500 dark:text-slate-400">
                        {getExtensionLabel(selectedPlan.initial_period_months)}
                    </p>
                </div>
            )}

            {canPay && selectedPlan && (
                <button
                    type="button"
                    onClick={handlePayClick}
                    onKeyDown={handlePayKeyDown}
                    disabled={isSubmitting}
                    aria-label={`Pagar plan ${getPeriodLabel(selectedPlan.initial_period_months)} por ${formatCOP(Number(selectedPlan.price_monthly))}`}
                    tabIndex={0}
                    className="mt-6 w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-stone-900 shadow-sm transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isSubmitting ? 'Abriendo pago...' : `Pagar ${getPeriodLabel(selectedPlan.initial_period_months).toLowerCase()}`}
                </button>
            )}

            {showPromoSection && selectedPlan && (
                <PromoCodeSection
                    businessId={businessId}
                    userId={userId}
                    planId={selectedPlan.id}
                    onRedeemed={onCodeRedeemed}
                />
            )}
        </div>
    );
};

export default CustomPlanCard;
