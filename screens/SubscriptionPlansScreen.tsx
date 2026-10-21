import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { SubscriptionPlan } from '../context/AuthContext';
import { Screen } from '../types';
import {
    WOMPI_PUBLIC_KEY,
    SUPABASE_URL,
    loadWompiWidget,
    WompiResult
} from '../src/config/wompi';
import { getRealEmail, isValidEmail } from '../lib/formatters';
import { openCustomPlanCheckout, waitForPaymentApplied } from '../lib/customPlanCheckout';

interface Plan {
    id: string;
    name: string;
    price_monthly: number;
    features: string[];
    trial_duration: number;
    trial_interval: 'day' | 'minute';
    requires_card?: boolean;
    initial_period_months?: number;
}


export const SubscriptionPlansScreen: React.FC<{ onNavigate: (screen: Screen) => void }> = ({ onNavigate }) => {
    const { profile, checkSubscription, hasActiveSubscription, isNewTrial, clearNewTrialFlag, refreshProfile } = useAuth();
    const [plans, setPlans] = useState<Plan[]>([]);
    const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
    const [loading, setLoading] = useState(true);
    const [processingPlanId, setProcessingPlanId] = useState<string | null>(null); // Track which plan is processing
    const [error, setError] = useState<string | null>(null);
    const [widgetLoaded, setWidgetLoaded] = useState(false);
    const [hasUsedTrial, setHasUsedTrial] = useState(false); // Track if user already used trial
    const [prevSubscriptionStatus, setPrevSubscriptionStatus] = useState<string | null>(null); // 'trial', 'active', 'promo', null

    // Selector de ciclo de cobro: mensual o trimestral
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'quarterly'>('monthly');

    const displayedPlans = useMemo(() => {
        const filtered = plans.filter((p) => {
            if (billingCycle === 'monthly') {
                return p.initial_period_months === 1 || p.name.toLowerCase().includes('mensual');
            } else {
                return p.initial_period_months === 3 || p.name.toLowerCase().includes('trimestral');
            }
        });
        return (filtered.length > 0 ? filtered : plans).sort((a, b) => a.price_monthly - b.price_monthly);
    }, [plans, billingCycle]);

    // Flow state
    const [flowStep, setFlowStep] = useState<'plans' | 'trial_started' | 'payment_success' | 'payment_pending' | 'promo_success' | 'card_payment'>('plans');
    const [promoMonths, setPromoMonths] = useState(0);
    const [transactionResult, setTransactionResult] = useState<WompiResult['transaction'] | null>(null);

    // Card form state (for native card payment)
    const [cardForm, setCardForm] = useState({ number: '', cvc: '', expMonth: '', expYear: '', cardHolder: '' });
    const [cardProcessing, setCardProcessing] = useState(false);

    // Promo code state
    const [promoCode, setPromoCode] = useState('');
    const [promoValidation, setPromoValidation] = useState<{ valid?: boolean; reason?: string; duration_months?: number } | null>(null);
    const [promoLoading, setPromoLoading] = useState(false);
    const [promoRedeeming, setPromoRedeeming] = useState(false);

    // Email requerido para el pago (cuentas creadas por teléfono no tienen correo real)
    const [showEmailPrompt, setShowEmailPrompt] = useState(false);
    const [pendingPaymentPlan, setPendingPaymentPlan] = useState<Plan | null>(null);
    const [paymentEmail, setPaymentEmail] = useState('');
    const [savingPaymentEmail, setSavingPaymentEmail] = useState(false);

    // Task 4.9: AbortController para cortar la observación de la activación
    // (poll de solo lectura a subscription_invoices) si la pantalla se desmonta
    // mientras esperamos que el webhook refleje el pago.
    const pollAbortRef = useRef<AbortController | null>(null);
    useEffect(() => {
        return () => pollAbortRef.current?.abort();
    }, []);
    const startPollingAbort = () => {
        pollAbortRef.current?.abort();
        pollAbortRef.current = new AbortController();
        return pollAbortRef.current.signal;
    };

    // Load Wompi Widget script
    useEffect(() => {
        loadWompiWidget()
            .then(() => setWidgetLoaded(true))
            .catch(() => setError('Error cargando el widget de pago'));
    }, []);

    useEffect(() => {
        fetchPlans();
        checkIfUsedTrial();
    }, []);

    // Detect fresh registration and show welcome screen
    useEffect(() => {
        const justRegistered = localStorage.getItem('just_registered');
        if (!justRegistered) return;
        localStorage.removeItem('just_registered');

        // Si hay pending_promo_code, dejar que ese useEffect lo maneje
        if (localStorage.getItem('pending_promo_code')) return;

        setSelectedPlan({ id: '', name: 'Mensual', price_monthly: 35000, features: [], trial_duration: 15, trial_interval: 'day' });
        setFlowStep('trial_started');
        clearNewTrialFlag();
    }, []);

    useEffect(() => {
        const pendingCode = localStorage.getItem('pending_promo_code');
        if (!pendingCode || !profile?.business_id || !profile?.id) return;
        localStorage.removeItem('pending_promo_code');
        setPromoCode(pendingCode);

        const autoRedeem = async () => {
            try {
                const valRes = await fetch(`${SUPABASE_URL}/functions/v1/manage-promo-codes?action=validate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: pendingCode.trim() })
                });
                const valData = await valRes.json();
                if (!valData.valid) return;

                const redeemRes = await fetch(`${SUPABASE_URL}/functions/v1/manage-promo-codes?action=redeem`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: pendingCode.trim(), business_id: profile.business_id, user_id: profile.id })
                });
                const redeemData = await redeemRes.json();
                if (redeemData.success) {
                    await checkSubscription();
                    setPromoMonths(redeemData.duration_months || valData.duration_months || 3);
                    setFlowStep('promo_success');
                }
            } catch (err) {
                console.error('[PromoAutoRedeem] Error:', err);
            }
        };
        autoRedeem();
    }, [profile?.business_id, profile?.id]);

    // Check if user already has a subscription and what its last status was
    const checkIfUsedTrial = async () => {
        if (!profile?.business_id) return;

        const { data } = await supabase
            .from('business_subscriptions')
            .select('id, status')
            .eq('business_id', profile.business_id)
            .maybeSingle();

        setHasUsedTrial(!!data);
        if (data) setPrevSubscriptionStatus(data.status);
    };


    const fetchPlans = async () => {
        try {
            const { data, error } = await supabase
                .from('subscription_plans')
                .select('*')
                .eq('is_active', true)
                .is('assigned_business_id', null)   // Excluye planes personalizados del catálogo público (defensivo — la RLS ya lo hace)
                .order('price_monthly', { ascending: true });

            if (error) throw error;
            
            // Ocultamos el 'Plan Pruebas Internas' del frontend
            const visiblePlans = (data || []).filter(plan => plan.name !== 'Plan Pruebas Internas');
            setPlans(visiblePlans);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // Open Wompi Widget for payment (delegates to shared helper in lib/customPlanCheckout.ts)
    const handleOpenWompiWidget = useCallback(async (plan: Plan, emailOverride?: string) => {
        if (!profile?.business_id || !widgetLoaded) {
            setError('El widget de pago no está listo. Por favor espera unos segundos.');
            return;
        }

        // El pago requiere un correo real. Las cuentas creadas por teléfono solo
        // tienen el correo interno @bistro.temp, así que lo pedimos antes de cobrar.
        const customerEmail = emailOverride || getRealEmail(profile.email);
        if (!customerEmail) {
            setPendingPaymentPlan(plan);
            setPaymentEmail('');
            setShowEmailPrompt(true);
            return;
        }

        setProcessingPlanId(plan.id);
        setError(null);
        setSelectedPlan(plan);

        await openCustomPlanCheckout({
            profile,
            // Cast: el shape de `plan` en esta pantalla proviene de `subscription_plans`
            // y contiene los campos requeridos por SubscriptionPlan (id, name, price_monthly, ...).
            plan: plan as unknown as SubscriptionPlan,
            customerEmail,
            onApproved: async (tx) => {
                setTransactionResult(tx);
                // El webhook (service_role) resuelve el plan y el periodo (bonus
                // de primer pago, Trimestral, Anual…) desde la referencia canónica
                // y activa la suscripción. Aquí solo observamos y refrescamos.
                await handlePaymentApproved(plan, tx);
                setProcessingPlanId(null);
            },
            onPending: (tx) => {
                setTransactionResult(tx);
                setFlowStep('payment_pending');
                setProcessingPlanId(null);
            },
            onDeclined: (msg) => {
                setError(`Pago rechazado: ${msg}`);
                setProcessingPlanId(null);
            },
            onError: (err) => {
                console.error('[Wompi] Error:', err);
                setError(err.message || 'Error iniciando el pago');
                setProcessingPlanId(null);
            },
        });
    }, [profile, widgetLoaded]);

    // Handle approved payment
    // La activación y el registro de factura son autoridad ÚNICA del webhook
    // `wompi-webhook` (service_role), que resuelve el negocio, el plan y el
    // periodo (bonus de primer pago, Trimestral, Anual…) desde la referencia
    // canónica del pago. El cliente ya NO escribe en business_subscriptions ni
    // subscription_invoices (Req 4.6): solo OBSERVA (lectura) hasta que el
    // webhook aplique el pago y refresca el estado con checkSubscription().
    const handlePaymentApproved = async (_plan: Plan, tx: WompiResult['transaction']) => {
        if (!profile?.business_id) return;

        const { applied } = await waitForPaymentApplied({
            wompiTransactionId: tx.id,
            signal: startPollingAbort(),
        });
        await checkSubscription();
        // El pago fue aprobado por Wompi, así que mostramos la pantalla de éxito
        // igual que antes. Si el webhook aún no reflejó la activación
        // (applied === false), el estado se completará en segundos vía el
        // checkSubscription periódico del propio flujo; no es un error.
        setFlowStep('payment_success');
    };

    // Start Trial without payment
    // El inicio de prueba lo hace el servidor: la edge function
    // `start-trial-subscription` (service_role) valida la sesión, que el
    // llamante es admin del negocio y que el negocio no haya usado el trial, y
    // escribe status='trial' con la duración del plan. El cliente ya NO hace el
    // upsert directo (Req 4.6): solo invoca la función y refresca el estado.
    const handleStartTrial = async (plan: Plan) => {
        if (!profile?.business_id) {
            setError('No se encontró información del negocio.');
            return;
        }

        setProcessingPlanId(plan.id);
        setError(null);
        setSelectedPlan(plan);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                setError('Tu sesión expiró. Vuelve a iniciar sesión para continuar.');
                return;
            }

            const res = await fetch(`${SUPABASE_URL}/functions/v1/start-trial-subscription`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                },
                body: JSON.stringify({ businessId: profile.business_id, planId: plan.id }),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok || !data.success) {
                // Mensajes claros por código de estado. El 409 (el negocio ya usó
                // su prueba) es una condición esperada, no un fallo del sistema.
                let msg: string;
                switch (res.status) {
                    case 401:
                        msg = 'Tu sesión expiró. Vuelve a iniciar sesión para continuar.';
                        break;
                    case 403:
                        msg = data.error || 'No tienes permisos para iniciar la prueba de este negocio.';
                        break;
                    case 404:
                        msg = data.error || 'El plan seleccionado no está disponible.';
                        break;
                    case 409:
                        msg = 'Este negocio ya usó su período de prueba.';
                        // Puede que ya tenga una suscripción activa: refrescamos
                        // para que la app refleje el estado real.
                        await checkSubscription();
                        break;
                    default:
                        msg = data.error || 'No se pudo iniciar el período de prueba.';
                }
                setError(msg);
                return;
            }

            await checkSubscription();
            setFlowStep('trial_started');

        } catch (err: any) {
            setError(err.message || 'Error al iniciar el período de prueba');
        } finally {
            setProcessingPlanId(null);
        }
    };

    // Handle card payment with native form
    const handleCardPaymentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile?.business_id || !selectedPlan) return;

        setCardProcessing(true);
        setError(null);

        try {
            // 1. Tokenize card with Wompi public key
            const tokenRes = await fetch('https://production.wompi.co/v1/tokens/cards', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${WOMPI_PUBLIC_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    number: cardForm.number.replace(/\s/g, ''),
                    cvc: cardForm.cvc,
                    exp_month: cardForm.expMonth,
                    exp_year: cardForm.expYear,
                    card_holder: cardForm.cardHolder
                })
            });

            const tokenData = await tokenRes.json();
            if (tokenData.error) throw new Error(tokenData.error.reason || 'Tarjeta no válida');

            const token = tokenData.data;

            // 2. Save card to payment_sources (set as default, deactivate others first)
            await supabase
                .from('payment_sources')
                .update({ is_default: false })
                .eq('business_id', profile.business_id);

            const { error: sourceError } = await supabase
                .from('payment_sources')
                .insert({
                    business_id: profile.business_id,
                    card_token: token.id,
                    wompi_source_id: token.id,
                    card_last_four: token.last_four,
                    card_brand: token.brand,
                    card_exp_month: token.exp_month,
                    card_exp_year: token.exp_year,
                    is_active: true,
                    is_default: true
                });

            if (sourceError) throw sourceError;

            // 3. Tarjeta guardada — procesar cobro real vía Widget
            setCardForm({ number: '', cvc: '', expMonth: '', expYear: '', cardHolder: '' });
            setFlowStep('plans');
            await handleOpenWompiWidget(selectedPlan!);

        } catch (err: any) {
            setError(err.message || 'Error procesando el pago');
        } finally {
            setCardProcessing(false);
        }
    };

    // DELETED: handleCardTrialPlan ($0 tokenization flow removed)
    // Replaced by handleCardPaymentSubmit above

    // Handle plan selection
    const handleSelectPlan = (plan: Plan) => {
        setSelectedPlan(plan);
        if (!hasUsedTrial && plan.trial_duration > 0) {
            handleStartTrial(plan);
        } else {
            handleOpenWompiWidget(plan);
        }
    };

    // Guarda el correo ingresado para el pago y reanuda el flujo de cobro
    const handleConfirmPaymentEmail = async () => {
        const email = paymentEmail.trim();
        if (!isValidEmail(email)) {
            setError('Ingresa un correo electrónico válido.');
            return;
        }

        setSavingPaymentEmail(true);
        setError(null);
        try {
            const { error: authError } = await supabase.auth.updateUser({ email });
            if (authError) throw authError;

            await refreshProfile();

            const planToPay = pendingPaymentPlan;
            setShowEmailPrompt(false);
            setPendingPaymentPlan(null);
            setPaymentEmail('');

            // Reanudar el cobro ahora que el perfil tiene correo real.
            // Pasamos el correo explícitamente para evitar el closure con el perfil viejo.
            if (planToPay) {
                await handleOpenWompiWidget(planToPay, email);
            }
        } catch (err: any) {
            setError(err.message || 'No se pudo guardar el correo. Intenta de nuevo.');
        } finally {
            setSavingPaymentEmail(false);
        }
    };



    if (loading) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-[#f0f4f3] dark:bg-[#0d1c14]">
                <div className="text-center">
                    <div className="animate-spin rounded-full size-10 border-b-2 border-emerald-600 mx-auto"></div>
                    <p className="mt-4 text-gray-500 dark:text-gray-400">Cargando planes...</p>
                </div>
            </div>
        );
    }

    // Native Card Payment Screen
    if (flowStep === 'card_payment') {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-[#f0f4f3] dark:bg-[#0d1c14] p-4">
                <div className="w-full max-w-md">
                    <div className="bg-white dark:bg-gray-900 rounded-none border border-gray-200 dark:border-gray-800 shadow-md overflow-hidden">
                        {/* Header */}
                        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-6">
                            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">{selectedPlan?.name}</p>
                            <p className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                                {profile?.business_id === '9ab00944-b41b-47bd-b595-9aaea024d777' ? '—' : <>${selectedPlan?.price_monthly.toLocaleString('es-CO')} <span className="text-lg text-gray-400 font-medium">COP</span></>}
                            </p>
                        </div>

                        {error && (
                            <div className="mx-5 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-2">
                                <span className="material-symbols-outlined text-red-500 text-base">error</span>
                                <p className="text-sm text-red-600 dark:text-red-400 flex-1">{error}</p>
                                <button onClick={() => setError(null)}><span className="material-symbols-outlined text-red-400 text-sm">close</span></button>
                            </div>
                        )}

                        {/* Card Form */}
                        <form onSubmit={handleCardPaymentSubmit} className="p-5 space-y-4">
                            <div className="relative">
                                <input
                                    type="text"
                                    id="cardNumberSub"
                                    value={cardForm.number}
                                    onChange={e => {
                                        let val = e.target.value.replace(/\D/g, '');
                                        val = val.replace(/(\d{4})/g, '$1 ').trim();
                                        setCardForm({ ...cardForm, number: val })
                                    }}
                                    className="block px-3 pb-2.5 pt-5 w-full text-base font-mono text-gray-900 bg-transparent border border-gray-400 rounded-none appearance-none dark:text-white dark:border-gray-600 focus:outline-none focus:ring-1 focus:border-emerald-500 focus:ring-emerald-500 peer"
                                    placeholder=" "
                                    maxLength={19}
                                    required
                                />
                                <label htmlFor="cardNumberSub" className="absolute text-gray-500 duration-300 transform -translate-y-4 scale-75 top-4 z-10 origin-[0] start-2.5 peer-focus:text-emerald-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-4 bg-white dark:bg-gray-900 px-1 pointer-events-none">
                                    Número de tarjeta
                                </label>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="relative">
                                    <input
                                        type="text"
                                        id="expDateSub"
                                        value={cardForm.expMonth + (cardForm.expMonth.length === 2 && cardForm.expYear === '' ? '' : cardForm.expYear ? '/' + cardForm.expYear : '')}
                                        onChange={e => {
                                            let val = e.target.value.replace(/\D/g, '');
                                            let month = val.slice(0, 2);
                                            let year = val.slice(2, 4);
                                            setCardForm({ ...cardForm, expMonth: month, expYear: year });
                                        }}
                                        className="block px-3 pb-2.5 pt-5 w-full text-base font-mono text-gray-900 bg-transparent border border-gray-400 rounded-none appearance-none dark:text-white dark:border-gray-600 focus:outline-none focus:ring-1 focus:border-emerald-500 focus:ring-emerald-500 peer"
                                        placeholder=" "
                                        maxLength={5}
                                        required
                                    />
                                    <label htmlFor="expDateSub" className="absolute text-gray-500 duration-300 transform -translate-y-4 scale-75 top-4 z-10 origin-[0] start-2.5 peer-focus:text-emerald-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-4 bg-white dark:bg-gray-900 px-1 pointer-events-none">
                                        MM/AA
                                    </label>
                                </div>
                                <div className="relative">
                                    <input
                                        type="password"
                                        id="cvcSub"
                                        value={cardForm.cvc}
                                        onChange={e => setCardForm({ ...cardForm, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                                        className="block px-3 pb-2.5 pt-5 w-full text-base font-mono text-gray-900 bg-transparent border border-gray-400 rounded-none appearance-none dark:text-white dark:border-gray-600 focus:outline-none focus:ring-1 focus:border-emerald-500 focus:ring-emerald-500 peer"
                                        placeholder=" "
                                        maxLength={4}
                                        required
                                    />
                                    <label htmlFor="cvcSub" className="absolute text-gray-500 duration-300 transform -translate-y-4 scale-75 top-4 z-10 origin-[0] start-2.5 peer-focus:text-emerald-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-4 bg-white dark:bg-gray-900 px-1 pointer-events-none">
                                        Código de seguridad
                                    </label>
                                </div>
                            </div>

                            <div className="relative">
                                <input
                                    type="text"
                                    id="cardHolderSub"
                                    value={cardForm.cardHolder}
                                    onChange={e => setCardForm({ ...cardForm, cardHolder: e.target.value })}
                                    className="block px-3 pb-2.5 pt-5 w-full text-base text-gray-900 bg-transparent border border-gray-400 rounded-none appearance-none dark:text-white dark:border-gray-600 focus:outline-none focus:ring-1 focus:border-emerald-500 focus:ring-emerald-500 peer"
                                    placeholder=" "
                                    required
                                />
                                <label htmlFor="cardHolderSub" className="absolute text-gray-500 duration-300 transform -translate-y-4 scale-75 top-4 z-10 origin-[0] start-2.5 peer-focus:text-emerald-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-4 bg-white dark:bg-gray-900 px-1 pointer-events-none">
                                    Nombre del titular
                                </label>
                            </div>

                            <button
                                type="submit"
                                disabled={cardProcessing}
                                className="w-full py-3.5 bg-gray-900 hover:bg-black dark:bg-white dark:hover:bg-gray-100 disabled:opacity-50 text-white dark:text-gray-900 font-bold rounded-none transition-all flex items-center justify-center gap-2 shadow-sm"
                            >
                                {cardProcessing ? (
                                    <><div className="animate-spin size-4 border-2 border-white border-t-transparent rounded-full" /><span>Procesando...</span></>
                                ) : (
                                    <><span className="material-symbols-outlined text-base">credit_card</span><span>Pagar y Guardar Tarjeta</span></>
                                )}
                            </button>
                        </form>

                        {/* Divider */}
                        <div className="flex items-center gap-3 px-5 pb-2">
                            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                            <span className="text-xs text-gray-400">o pagar con</span>
                            <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                        </div>

                        {/* Widget Button (PSE/Nequi) */}
                        <div className="px-5 pb-5">
                            <button
                                onClick={() => { setFlowStep('plans'); handleOpenWompiWidget(selectedPlan!); }}
                                disabled={!widgetLoaded || cardProcessing}
                                className="w-full py-3 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-none transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-40"
                            >
                                <span className="material-symbols-outlined text-base">account_balance</span>
                                PSE / Nequi / Bancolombia
                            </button>
                            <p className="text-center text-xs text-gray-400 mt-2">Esta opción no guarda la tarjeta para autorenovación</p>
                        </div>

                        {/* Back */}
                        <div className="px-5 pb-5">
                            <button
                                onClick={() => { setFlowStep('plans'); setError(null); }}
                                className="w-full py-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm flex items-center justify-center gap-1 transition-colors"
                            >
                                <span className="material-symbols-outlined text-base">arrow_back</span>
                                Volver a planes
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Shared welcome features
    const welcomeFeatures = [
        { icon: 'point_of_sale', text: 'Ventas y facturación' },
        { icon: 'inventory_2', text: 'Control de inventario' },
        { icon: 'group', text: 'Gestión de clientes' },
        { icon: 'bar_chart', text: 'Reportes en tiempo real' },
    ];

    // Promo Code Success Screen
    if (flowStep === 'promo_success') {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-[#0d1c14] dark:via-[#0d1c14] dark:to-[#1a2e23] p-4 relative overflow-hidden">
                <div className="absolute top-10 left-10 size-72 bg-amber-200/30 dark:bg-amber-900/10 rounded-full blur-3xl" />
                <div className="absolute bottom-10 right-10 size-56 bg-purple-200/20 dark:bg-purple-900/10 rounded-full blur-3xl" />

                <div className="max-w-md w-full relative z-10">
                    <div className="text-center mb-6 animate-[fadeIn_0.5s_ease-out]">
                        <div className="text-5xl mb-3">🎉</div>
                        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                            ¡Bienvenido a <span className="text-primary">Bistro</span><span className="text-amber-600 dark:text-amber-400">POS</span>!
                        </h1>
                    </div>

                    <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-xl shadow-gray-200/50 dark:shadow-none animate-[fadeIn_0.6s_ease-out]">
                        <div className="bg-gradient-to-r from-purple-500 to-violet-600 rounded-xl p-4 mb-5 text-white text-center">
                            <span className="material-symbols-outlined text-3xl mb-1 block opacity-90">confirmation_number</span>
                            <p className="text-sm font-medium opacity-90">Código promocional activado</p>
                            <p className="text-2xl font-extrabold">{promoMonths} meses de servicio</p>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-5">
                            {welcomeFeatures.map((f) => (
                                <div key={f.text} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5">
                                    <span className="material-symbols-outlined text-primary text-lg">{f.icon}</span>
                                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{f.text}</span>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={() => onNavigate(Screen.SELL)}
                            className="w-full py-3.5 bg-primary hover:bg-primary-hover text-stone-900 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0"
                        >
                            <span className="material-symbols-outlined text-[20px]">rocket_launch</span>
                            Explorar Mi Negocio
                        </button>
                    </div>

                    <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4">
                        Todo listo para gestionar tu negocio como un profesional ✨
                    </p>
                </div>
            </div>
        );
    }

    // Payment Success Screen
    if (flowStep === 'payment_success') {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-[#0d1c14] dark:via-[#0d1c14] dark:to-[#1a2e23] p-4 relative overflow-hidden">
                <div className="absolute top-10 left-10 size-72 bg-amber-200/30 dark:bg-amber-900/10 rounded-full blur-3xl" />
                <div className="absolute bottom-10 right-10 size-56 bg-emerald-200/20 dark:bg-emerald-900/10 rounded-full blur-3xl" />

                <div className="max-w-md w-full relative z-10">
                    <div className="text-center mb-6 animate-[fadeIn_0.5s_ease-out]">
                        <div className="text-5xl mb-3">🎊</div>
                        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                            ¡Pago <span className="text-emerald-600 dark:text-emerald-400">Exitoso</span>!
                        </h1>
                    </div>

                    <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-xl shadow-gray-200/50 dark:shadow-none animate-[fadeIn_0.6s_ease-out]">
                        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl p-4 mb-5 text-white text-center">
                            <span className="material-symbols-outlined text-3xl mb-1 block opacity-90">verified</span>
                            <p className="text-sm font-medium opacity-90">Plan activado correctamente</p>
                            <p className="text-2xl font-extrabold">
                                {profile?.business_id === '9ab00944-b41b-47bd-b595-9aaea024d777' ? 'Activado' : `$${selectedPlan?.price_monthly.toLocaleString('es-CO')} COP`}
                            </p>
                        </div>

                        {transactionResult && (
                            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5 mb-4 text-center">
                                <p className="text-xs text-gray-400 dark:text-gray-500">
                                    Ref: {transactionResult.id} · {transactionResult.paymentMethodType}
                                </p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 mb-5">
                            {welcomeFeatures.map((f) => (
                                <div key={f.text} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5">
                                    <span className="material-symbols-outlined text-primary text-lg">{f.icon}</span>
                                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{f.text}</span>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={() => onNavigate(Screen.SELL)}
                            className="w-full py-3.5 bg-primary hover:bg-primary-hover text-stone-900 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0"
                        >
                            <span className="material-symbols-outlined text-[20px]">rocket_launch</span>
                            Explorar Mi Negocio
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Payment Pending Screen
    if (flowStep === 'payment_pending') {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-[#0d1c14] dark:via-[#0d1c14] dark:to-[#1a2e23] p-4">
                <div className="max-w-md w-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-200 dark:border-gray-800 p-8 text-center shadow-xl shadow-gray-200/50 dark:shadow-none">
                    <div className="size-16 bg-amber-100 dark:bg-amber-900/20 rounded-full flex items-center justify-center mx-auto mb-5">
                        <span className="material-symbols-outlined text-amber-600 dark:text-primary text-4xl animate-spin" style={{ animationDuration: '3s' }}>progress_activity</span>
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Procesando tu Pago</h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mb-5">
                        Tu pago está siendo verificado. Esto puede tomar unos minutos.
                        Recibirás una confirmación cuando se complete.
                    </p>
                    <button
                        onClick={() => { setFlowStep('plans'); setError(null); }}
                        className="w-full py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-medium flex items-center justify-center gap-2 transition-all"
                    >
                        <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                        Volver a Planes
                    </button>
                </div>
            </div>
        );
    }

    // Trial Started Screen
    if (flowStep === 'trial_started') {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-[#0d1c14] dark:via-[#0d1c14] dark:to-[#1a2e23] p-4 relative overflow-hidden">
                <div className="absolute top-10 left-10 size-72 bg-amber-200/30 dark:bg-amber-900/10 rounded-full blur-3xl" />
                <div className="absolute bottom-10 right-10 size-56 bg-orange-200/20 dark:bg-orange-900/10 rounded-full blur-3xl" />

                <div className="max-w-md w-full relative z-10">
                    <div className="text-center mb-6 animate-[fadeIn_0.5s_ease-out]">
                        <div className="text-5xl mb-3">👋</div>
                        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                            ¡Bienvenido a <span className="text-primary">Bistro</span><span className="text-amber-600 dark:text-amber-400">POS</span>!
                        </h1>
                    </div>

                    <div className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-xl shadow-gray-200/50 dark:shadow-none animate-[fadeIn_0.6s_ease-out]">
                        <div className="bg-gradient-to-r from-amber-400 to-orange-500 rounded-xl p-4 mb-5 text-stone-900 text-center">
                            <span className="material-symbols-outlined text-3xl mb-1 block opacity-80">timer</span>
                            <p className="text-sm font-semibold opacity-80">Tu prueba gratuita está activa</p>
                            <p className="text-2xl font-extrabold">
                                {selectedPlan?.trial_duration || 15} {selectedPlan?.trial_interval === 'minute' ? 'minutos' : 'días'} gratis
                            </p>
                        </div>

                        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-4">
                            Explora todas las herramientas sin compromiso
                        </p>

                        <div className="grid grid-cols-2 gap-2 mb-5">
                            {welcomeFeatures.map((f) => (
                                <div key={f.text} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5">
                                    <span className="material-symbols-outlined text-primary text-lg">{f.icon}</span>
                                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{f.text}</span>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={() => onNavigate(Screen.SELL)}
                            className="w-full py-3.5 bg-primary hover:bg-primary-hover text-stone-900 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0"
                        >
                            <span className="material-symbols-outlined text-[20px]">rocket_launch</span>
                            Explorar Mi Negocio
                        </button>
                    </div>

                    <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4">
                        Sin tarjeta de crédito · Cancela cuando quieras
                    </p>
                </div>
            </div>
        );
    }

    // Plan Selection (Default View)
    return (
        <div className="min-h-screen w-full bg-[#f8fafc] dark:bg-[#0b1120] py-12 px-4 font-sans">
            <div className="max-w-5xl mx-auto">
                <div className="text-center mb-8">
                    <h2 className="font-display text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight">Elige tu Plan</h2>
                    <p className="mt-2 text-slate-500 dark:text-slate-400 text-sm sm:text-base max-w-xl mx-auto">
                        Potencia tu negocio con las herramientas que necesitas para facturar, ordenar tus cuentas y crecer
                    </p>
                </div>

                {/* Switch Mensual / Trimestral */}
                <div className="flex items-center justify-center mb-10">
                    <div className="inline-flex p-1 rounded-2xl bg-slate-200/80 dark:bg-slate-800 border border-slate-300/50 dark:border-slate-700 shadow-inner">
                        <button
                            type="button"
                            onClick={() => setBillingCycle('monthly')}
                            className={`px-6 py-2 rounded-xl text-sm font-display font-bold transition-all ${
                                billingCycle === 'monthly'
                                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            Mensual
                        </button>
                        <button
                            type="button"
                            onClick={() => setBillingCycle('quarterly')}
                            className={`px-6 py-2 rounded-xl text-sm font-display font-bold transition-all flex items-center gap-2 ${
                                billingCycle === 'quarterly'
                                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <span>Trimestral</span>
                            <span className="px-2 py-0.5 text-[10px] font-black bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-full border border-emerald-300/50 dark:border-emerald-500/30">
                                -15% Ahorro
                            </span>
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="mb-6 max-w-2xl mx-auto bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 p-4 rounded-xl flex items-center gap-3">
                        <span className="material-symbols-outlined text-red-500">error</span>
                        <div className="flex-1">
                            <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error}</p>
                        </div>
                        <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 dark:hover:text-red-300">
                            <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                    </div>
                )}

                {/* Plan Cards List */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 items-stretch max-w-4xl mx-auto">
                    {displayedPlans.map((plan) => {
                        const isTrial = !hasUsedTrial && plan.trial_duration > 0;
                        const isPro = plan.name.toLowerCase().includes('pro');
                        const cleanName = plan.name.replace(/\s*\(Mensual\)|\s*\(Trimestral\)/gi, '').trim();
                        const durationSuffix = billingCycle === 'monthly' ? '/mes' : '/trimestre';
                        const monthlyEquivalent = billingCycle === 'quarterly' ? Math.round(plan.price_monthly / 3) : null;
                        const planDescription = isPro
                            ? 'Control avanzado para restaurantes y bares: comandas, mesas, recetas, stock y personal ilimitado.'
                            : 'Todo lo esencial para ventas de mostrador y retail: caja diaria, inventario, clientes y facturación.';

                        return (
                            <div
                                key={plan.id}
                                className={`bg-white dark:bg-slate-900/90 rounded-[2rem] border overflow-hidden transition-all duration-300 flex flex-col h-full relative ${
                                    isPro
                                        ? 'border-2 border-amber-400 dark:border-amber-500/80 shadow-xl shadow-amber-500/10 hover:shadow-2xl hover:shadow-amber-500/20 ring-4 ring-amber-400/10 dark:ring-amber-500/10'
                                        : 'border border-slate-200 dark:border-slate-800 shadow-lg shadow-slate-200/50 dark:shadow-none hover:shadow-xl hover:border-slate-300 dark:hover:border-slate-700'
                                }`}
                            >
                                {isPro && (
                                    <div className="absolute top-0 right-0 bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 text-[11px] font-display font-black px-4 py-1.5 rounded-bl-2xl uppercase tracking-wider shadow-sm flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[14px]">star</span>
                                        Recomendado
                                    </div>
                                )}

                                {/* Header Card */}
                                <div className="p-6 sm:p-7 flex flex-col justify-center border-b border-slate-100 dark:border-slate-800 bg-gradient-to-b from-slate-50/70 to-white dark:from-slate-800/40 dark:to-slate-900/20 text-center">
                                    <h3 className="font-display text-2xl font-bold text-slate-900 dark:text-white mb-1 tracking-tight">{cleanName}</h3>
                                    <p className="text-[13px] text-slate-600 dark:text-slate-300 mb-4 min-h-[40px] flex items-center justify-center leading-snug px-1">
                                        {planDescription}
                                    </p>

                                    <div className="flex flex-col items-center justify-center mb-4">
                                        <div className="flex items-baseline justify-center gap-1.5">
                                            <span className="font-display text-4xl sm:text-5xl font-black text-slate-900 dark:text-white tracking-tight">
                                                {profile?.business_id === '9ab00944-b41b-47bd-b595-9aaea024d777' ? '—' : `$${plan.price_monthly.toLocaleString('es-CO')}`}
                                            </span>
                                            <span className="font-display text-slate-500 dark:text-slate-400 text-sm font-bold">
                                                {profile?.business_id === '9ab00944-b41b-47bd-b595-9aaea024d777' ? '' : durationSuffix}
                                            </span>
                                        </div>
                                        {monthlyEquivalent && (
                                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-xs font-semibold border border-emerald-200/60 dark:border-emerald-800/40 mt-2">
                                                <span className="material-symbols-outlined text-[14px]">savings</span>
                                                <span>Equivale a ${monthlyEquivalent.toLocaleString('es-CO')}/mes</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col items-center gap-2 mb-4 min-h-[28px]">
                                        {isTrial && (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-display font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40">
                                                <span className="material-symbols-outlined text-[16px]">timer</span>
                                                {plan.trial_duration} días gratis de prueba
                                            </span>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => handleSelectPlan(plan)}
                                        disabled={processingPlanId !== null}
                                        className={`w-full py-3.5 rounded-xl font-display font-bold text-sm shadow-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                                            processingPlanId === plan.id
                                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                                                : isTrial
                                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/25 hover:shadow-emerald-600/40 hover:-translate-y-0.5 active:translate-y-0'
                                                    : isPro
                                                        ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-slate-950 font-black shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 hover:-translate-y-0.5 active:translate-y-0'
                                                        : 'bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 shadow-lg shadow-slate-900/15 hover:shadow-slate-900/25 hover:-translate-y-0.5 active:translate-y-0'
                                        }`}
                                    >
                                        {processingPlanId === plan.id ? (
                                            <><div className="animate-spin rounded-full size-5 border-2 border-current border-t-transparent opacity-70" /><span>Procesando...</span></>
                                        ) : isTrial ? (
                                            <span>Iniciar Prueba Gratis</span>
                                        ) : (
                                            <span>Elegir {cleanName}</span>
                                        )}
                                    </button>
                                </div>

                                {/* Features List */}
                                <div className="p-6 sm:p-7 flex-1 bg-slate-50/40 dark:bg-slate-900/40">
                                    <p className="font-display text-xs font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary text-[18px]">verified</span>
                                        ¿Qué incluye tu plan?
                                    </p>
                                    <ul className="flex flex-col gap-2.5">
                                        {Array.isArray(plan.features) && plan.features.map((feature, idx) => {
                                            const cleanText = feature.replace(/^★\s*/, '').trim();
                                            const isSavings = cleanText.toLowerCase().includes('ahorro');
                                            const isParentPlanIncluded = cleanText.toLowerCase().includes('todo lo incluido');
                                            const hasAI = /\bIA\b/.test(cleanText);

                                            return (
                                                <li
                                                    key={`feature-${idx}`}
                                                    className={`flex items-start gap-3 text-[13px] sm:text-sm py-0.5 transition-colors ${
                                                        isSavings
                                                            ? 'font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/30 -mx-1 px-2.5 py-1.5 rounded-xl border border-emerald-200/60 dark:border-emerald-800/40'
                                                            : isParentPlanIncluded
                                                                ? 'font-bold text-slate-900 dark:text-white'
                                                                : hasAI
                                                                    ? 'font-medium text-slate-800 dark:text-slate-100'
                                                                    : 'text-slate-600 dark:text-slate-300'
                                                    }`}
                                                >
                                                    <div
                                                        className={`size-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                                                            isSavings
                                                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                                                : isPro
                                                                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                                                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                                        }`}
                                                    >
                                                        <span className="material-symbols-outlined text-[13px] font-bold">
                                                            {isSavings ? 'percent' : 'check'}
                                                        </span>
                                                    </div>
                                                    <span className="leading-snug flex-1">
                                                        {cleanText}
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Compact Promo Code Section */}
                <div className="mt-8 text-center">
                    <div className="inline-block relative">
                        <button
                            onClick={() => {
                                const el = document.getElementById('promo-input-container');
                                if (el) el.classList.toggle('hidden');
                            }}
                            className="text-sm font-medium text-purple-600 dark:text-purple-400 hover:text-purple-700 hover:underline flex items-center justify-center gap-1 mx-auto"
                        >
                            <span className="material-symbols-outlined text-[18px]">confirmation_number</span>
                            ¿Tienes un código promocional?
                        </button>

                        <div id="promo-input-container" className="hidden absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 p-3 animate-[fadeIn_0.2s_ease-out] z-10">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={promoCode}
                                    onChange={(e) => {
                                        setPromoCode(e.target.value.toUpperCase());
                                        setPromoValidation(null);
                                    }}
                                    placeholder="CóDIGO"
                                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-sm font-mono uppercase focus:ring-2 focus:ring-purple-500 outline-none"
                                />
                                <button
                                    onClick={async () => {
                                        if (!promoCode.trim()) return;
                                        setPromoLoading(true);
                                        setPromoValidation(null);
                                        try {
                                            const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-promo-codes?action=validate`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ code: promoCode.trim() })
                                            });
                                            const data = await res.json();
                                            setPromoValidation(data);
                                        } catch {
                                            setPromoValidation({ valid: false, reason: 'Error de conexión' });
                                        } finally {
                                            setPromoLoading(false);
                                        }
                                    }}
                                    disabled={promoLoading || !promoCode.trim()}
                                    className="px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                                >
                                    {promoLoading ? <div className="size-3 border-2 border-white/50 border-t-white rounded-full animate-spin" /> : 'OK'}
                                </button>
                            </div>

                            {promoValidation && (
                                <div className={`mt-2 text-xs p-2 rounded-lg text-left ${promoValidation.valid ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                                    {promoValidation.valid ? (
                                        <div className="flex flex-col gap-1">
                                            <span className="font-bold flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                                Código válido
                                            </span>
                                            <span>{promoValidation.duration_months} meses de servicio incluidos</span>
                                            <button
                                                onClick={async () => {
                                                    if (!profile?.business_id || !profile?.id) return;
                                                    setPromoRedeeming(true);
                                                    try {
                                                        const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-promo-codes?action=redeem`, {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ code: promoCode.trim(), business_id: profile.business_id, user_id: profile.id })
                                                        });
                                                        const data = await res.json();
                                                        if (data.success) {
                                                            await checkSubscription();
                                                            setPromoMonths(data.duration_months || promoValidation?.duration_months || 3);
                                                            setFlowStep('promo_success');
                                                        } else {
                                                            setPromoValidation({ valid: false, reason: data.error });
                                                        }
                                                    } catch {
                                                        setPromoValidation({ valid: false, reason: 'Error' });
                                                    } finally {
                                                        setPromoRedeeming(false);
                                                    }
                                                }}
                                                disabled={promoRedeeming}
                                                className="mt-1 w-full py-1.5 bg-emerald-600 text-white rounded text-xs font-bold shadow-sm"
                                            >
                                                {promoRedeeming ? 'Activando...' : 'Canjear Ahora'}
                                            </button>
                                        </div>
                                    ) : (
                                        <span className="flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[14px]">error</span>
                                            {promoValidation.reason}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="mt-12 pt-8 border-t border-slate-200/60 dark:border-slate-800/60 max-w-3xl mx-auto text-center">
                    <div className="flex flex-wrap items-center justify-center gap-6 text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-medium">
                        <span className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-base">verified_user</span>
                            Pagos cifrados 100% seguros
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-amber-500 text-base">lock</span>
                            Pasarela oficial Wompi Bancolombia
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-blue-500 text-base">check_circle</span>
                            Sin contratos forzosos · Cancela cuando quieras
                        </span>
                    </div>
                </div>
            </div>

            {/* Modal: pedir correo antes de pagar (cuentas creadas por teléfono) */}
            {showEmailPrompt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl max-w-md w-full p-6 animate-[slideInUp_0.3s_ease-out]">
                        <div className="flex items-start gap-3 mb-4">
                            <div className="size-11 bg-primary/15 rounded-full flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-primary text-2xl">mail</span>
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-gray-900 dark:text-white">Necesitamos tu correo</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                    Lo usaremos para enviarte la factura y los comprobantes de tu pago.
                                </p>
                            </div>
                        </div>

                        <input
                            type="email"
                            autoFocus
                            value={paymentEmail}
                            onChange={(e) => setPaymentEmail(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !savingPaymentEmail) handleConfirmPaymentEmail(); }}
                            placeholder="tucorreo@ejemplo.com"
                            className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
                        />

                        {error && (
                            <p className="mt-2 text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[14px]">error</span>
                                {error}
                            </p>
                        )}

                        <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 mt-5">
                            <button
                                type="button"
                                onClick={() => { setShowEmailPrompt(false); setPendingPaymentPlan(null); setError(null); }}
                                disabled={savingPaymentEmail}
                                className="w-full sm:w-auto px-5 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmPaymentEmail}
                                disabled={savingPaymentEmail}
                                className="w-full sm:w-auto px-6 py-2 bg-primary hover:bg-primary-hover text-[#102218] text-sm font-bold rounded-lg shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {savingPaymentEmail ? (
                                    <>
                                        <div className="size-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    'Continuar al pago'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
