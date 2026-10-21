import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { SubscriptionPlan } from '../context/AuthContext';
import { Screen } from '../types';
import { useToast } from '../context/ToastContext';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { SubscriptionPlansScreen } from './SubscriptionPlansScreen';
import { ScreenLoader } from '../components/ScreenLoader';
import CustomPlanCard from '../components/CustomPlanCard';
import { WOMPI_PUBLIC_KEY } from '../src/config/wompi';
import { getRealEmail } from '../lib/formatters';
import { useCustomPlan } from '../hooks/useCustomPlan';
import { usePermissions } from '../hooks/usePermissions';
import { openCustomPlanCheckout, waitForPaymentApplied } from '../lib/customPlanCheckout';
import { HIDDEN_PRICES_BUSINESS_ID } from '../lib/specialBusinesses';

interface Subscription {
    id: string;
    plan_id: string;
    status: string;
    current_period_start: string;
    current_period_end: string;
    next_billing_date: string;
    retry_count: number;
    plan: {
        name: string;
        price_monthly: number;
        features: string[];
    };
}

interface PaymentMethod {
    id: string;
    card_brand: string;
    card_last_four: string;
    card_exp_month: string;
    card_exp_year: string;
    is_default: boolean;
}

interface Invoice {
    id: string;
    amount: number;
    status: string;
    created_at: string;
    paid_at: string | null;
    wompi_transaction_id: string | null;
}

interface RedeemedPromo {
    code: string;
    duration_months: number;
    redeemed_at: string;
}
type Tab = 'overview' | 'history' | 'details' | 'plans';

const detectCardBrand = (number: string): string => {
    const cleanNumber = number.replace(/\s/g, '');
    if (cleanNumber.startsWith('4')) return 'visa';
    if (/^(5[1-5]|222[1-9]|22[3-9]|2[3-6]|27[0-1]|2720)/.test(cleanNumber)) return 'mastercard';
    if (/^(34|37)/.test(cleanNumber)) return 'amex';
    return 'generic';
};

const getCardBrandLogo = (brand: string) => {
    const b = brand.toLowerCase().trim();
    if (b.includes('visa')) {
        return (
            <svg className="w-10 h-6" viewBox="0 0 24 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Visa">
                <path d="M15.3 3.5h-2.1L10.9 9.3 9.6 4.3c-.2-.7-.7-1.1-1.4-1.1H5.1v.4c.6.1 1.3.3 1.7.5.3.1.4.3.3.6L5.3 11.5h2.2l3.3-8 2 8h2.2L17.2 3.5h-1.9z" fill="#1A1F71"/>
                <path d="M2.5 3.5H.1l-.1.4c1.8.5 3 .9 4 1.4L2.5 11.5h2.2l3.3-8H2.5z" fill="#F79E1B"/>
            </svg>
        );
    }
    if (b.includes('mastercard')) {
        return (
            <svg className="w-10 h-6" viewBox="0 0 24 15" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Mastercard">
                <circle cx="8" cy="7.5" r="6" fill="#EB001B"/>
                <circle cx="14" cy="7.5" r="6" fill="#F79E1B" fillOpacity="0.85"/>
            </svg>
        );
    }
    if (b.includes('amex') || b.includes('american')) {
        return (
            <div className="px-1.5 py-0.5 bg-sky-600 text-white rounded text-[9px] font-bold tracking-wider leading-none">AMEX</div>
        );
    }
    return (
        <span className="material-symbols-outlined text-xl text-gray-400 dark:text-gray-500">credit_card</span>
    );
};

export const SubscriptionManagementScreen: React.FC<{ onNavigate: (screen: Screen) => void }> = ({ onNavigate }) => {
    const { profile, checkSubscription } = useAuth();
    const { showToast } = useToast();
    const { confirmAction } = useConfirmDialog();
    const { hasCustomPlan, customPlan, customPlans } = useCustomPlan();
    const { hasPermission } = usePermissions();
    const [payingCustomPlan, setPayingCustomPlan] = useState(false);
    // Task 14: AbortController para cortar el polling PENDING si la pantalla se
    // desmonta mientras Wompi todavía no resolvió el estado.
    const pollAbortRef = useRef<AbortController | null>(null);
    useEffect(() => {
        return () => pollAbortRef.current?.abort();
    }, []);
    const startPollingAbort = useCallback(() => {
        pollAbortRef.current?.abort();
        pollAbortRef.current = new AbortController();
        return pollAbortRef.current.signal;
    }, []);
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [redeemedPromo, setRedeemedPromo] = useState<RedeemedPromo | null>(null);
    const [loading, setLoading] = useState(true);

    // Modal States
    const [showContactModal, setShowContactModal] = useState(false);
    const [showAddCardModal, setShowAddCardModal] = useState(false);
    const [processingAction, setProcessingAction] = useState(false);

    // Form States
    const [contactForm, setContactForm] = useState({ fullName: '', phone: '' });
    const [cardForm, setCardForm] = useState({
        number: '',
        cvc: '',
        expMonth: '',
        expYear: '',
        cardHolder: ''
    });
    const [isCvcFocused, setIsCvcFocused] = useState(false);

    useEffect(() => {
        if (profile) {
            setContactForm({
                fullName: profile.full_name || '',
                phone: profile.phone || ''
            });
        }
    }, [profile]);

    useEffect(() => {
        if (profile?.business_id) {
            fetchSubscriptionData();
        }
    }, [profile]);

    const fetchSubscriptionData = async () => {
        if (!profile?.business_id) return;

        try {
            // Fetch subscription
            const { data: subData } = await supabase
                .from('business_subscriptions')
                .select(`
                    *,
                    plan:subscription_plans(*)
                `)
                .eq('business_id', profile.business_id)
                .single();

            if (subData) {
                setSubscription(subData as any);
            }

            // Fetch redeemed promo code for this business
            const { data: promoData } = await supabase
                .from('promo_codes')
                .select('code, duration_months, redeemed_at')
                .eq('redeemed_business_id', profile.business_id)
                .eq('status', 'used')
                .order('redeemed_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (promoData) {
                setRedeemedPromo(promoData);
            }

            // Fetch payment methods
            const { data: pmData } = await supabase
                .from('payment_sources')
                .select('*')
                .eq('business_id', profile.business_id)
                .eq('is_active', true);

            setPaymentMethods(pmData || []);

            // Fetch invoices
            if (subData) {
                const { data: invData } = await supabase
                    .from('subscription_invoices')
                    .select('*')
                    .eq('subscription_id', subData.id)
                    .order('created_at', { ascending: false })
                    .limit(10);

                setInvoices(invData || []);
            }
        } catch (error) {
            console.error('Error fetching subscription data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateContact = async (e: React.FormEvent) => {
        e.preventDefault();
        setProcessingAction(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name: contactForm.fullName,
                    phone: contactForm.phone
                })
                .eq('id', profile?.id);

            if (error) throw error;

            showToast('Datos de contacto actualizados correctamente', 'success');
            setShowContactModal(false);
        } catch (error) {
            console.error('Error updating contact:', error);
            showToast('Error al actualizar datos de contacto', 'error');
        } finally {
            setProcessingAction(false);
        }
    };

    const handleAddCard = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile?.business_id) return;

        setProcessingAction(true);
        try {
            // 1. Tokenize Card
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
            if (tokenData.error) throw new Error(tokenData.error.reason || 'Error al validar tarjeta');

            const token = tokenData.data;

            // 2. Desmarcar default anterior y guardar nueva tarjeta
            await supabase
                .from('payment_sources')
                .update({ is_default: false })
                .eq('business_id', profile.business_id);

            const { error } = await supabase
                .from('payment_sources')
                .insert({
                    business_id: profile.business_id,
                    card_token: token.id,
                    card_last_four: token.last_four,
                    card_brand: token.brand,
                    card_exp_month: token.exp_month,
                    card_exp_year: token.exp_year,
                    wompi_source_id: token.id,
                    is_active: true,
                    is_default: true
                });

            if (error) throw error;

            showToast('Método de pago agregado correctamente', 'success');
            setShowAddCardModal(false);
            setCardForm({ number: '', cvc: '', expMonth: '', expYear: '', cardHolder: '' });
            fetchSubscriptionData();
        } catch (error: any) {
            console.error('Error adding card:', error);
            showToast(error.message || 'Error al agregar método de pago', 'error');
        } finally {
            setProcessingAction(false);
        }
    };

    const handleDeletePaymentMethod = async (id: string) => {
        if (paymentMethods.length <= 1) {
            showToast('Debes mantener al menos un método de pago activo.', 'warning');
            return;
        }

        const confirmed = await confirmAction({
            title: '¿Eliminar este método de pago?',
            message: 'Esta acción no se puede deshacer y este método de pago dejará de estar disponible para tu facturación.',
            confirmText: 'Eliminar',
            variant: 'danger'
        });
        if (!confirmed) return;

        try {
            // Check if the card being deleted is default
            const cardToDelete = paymentMethods.find(pm => pm.id === id);
            const isDefault = cardToDelete?.is_default;

            const { error } = await supabase
                .from('payment_sources')
                .update({ is_active: false })
                .eq('id', id);

            if (error) throw error;

            // If we deleted a default card, make another one default automatically
            if (isDefault) {
                const remainingCard = paymentMethods.find(pm => pm.id !== id);
                if (remainingCard) {
                    await supabase
                        .from('payment_sources')
                        .update({ is_default: true })
                        .eq('id', remainingCard.id);
                }
            }

            fetchSubscriptionData();
        } catch (error) {
            console.error('Error deleting payment method:', error);
            showToast('Error al eliminar método de pago', 'error');
        }
    };

    const handleSetDefaultPaymentMethod = async (id: string) => {
        if (!profile?.business_id) return;
        try {
            // First set all to false
            await supabase
                .from('payment_sources')
                .update({ is_default: false })
                .eq('business_id', profile.business_id);

            // Then set selected to true
            const { error } = await supabase
                .from('payment_sources')
                .update({ is_default: true })
                .eq('id', id);

            if (error) throw error;
            fetchSubscriptionData();
        } catch (error) {
            console.error('Error setting default payment method:', error);
            showToast('Error al establecer método principal', 'error');
        }
    };

    const handlePayCustomPlan = useCallback(async (planToPay?: SubscriptionPlan) => {
        const targetPlan = planToPay || customPlan;
        if (!profile || !targetPlan || !profile.business_id) return;
        // El correo es opcional en el helper: si no hay real (cuenta SMS OTP
        // con @bistro.temp), Wompi lo pide dentro de su widget. Mantiene
        // consistencia con el banner de gracia y la pantalla de bloqueo.
        const customerEmail = getRealEmail(profile.email) || undefined;
        setPayingCustomPlan(true);
        await openCustomPlanCheckout({
            profile,
            plan: targetPlan,
            customerEmail,
            getAbortSignal: startPollingAbort,
            onApproved: async (tx) => {
                try {
                    // El webhook (service_role) activa/extiende la suscripción e
                    // inserta la factura. Aquí solo OBSERVAMOS (lectura) hasta que
                    // se refleje y refrescamos el estado; el cliente ya no escribe.
                    const { applied } = await waitForPaymentApplied({
                        wompiTransactionId: tx.id,
                        signal: startPollingAbort(),
                    });
                    await checkSubscription();
                    await fetchSubscriptionData();
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
                } finally {
                    setPayingCustomPlan(false);
                }
            },
            onPending: () => {
                showToast('Pago en proceso. Confirmaremos cuando el banco responda.', 'info');
                setPayingCustomPlan(false);
            },
            onPendingTimeout: () => {
                showToast(
                    'El pago sigue en verificación. Refresca la pantalla en unos minutos o volveremos a habilitar tu acceso automáticamente cuando el banco confirme.',
                    'info'
                );
            },
            onDeclined: (msg) => {
                showToast(`Pago rechazado: ${msg}`, 'error');
                setPayingCustomPlan(false);
            },
            onError: (err) => {
                showToast(err.message || 'Error abriendo el pago', 'error');
                setPayingCustomPlan(false);
            },
        });
    }, [profile, customPlan, checkSubscription, showToast, startPollingAbort]);

    const getStatusBadge = (status: string) => {
        const styles = {
            trial: 'bg-blue-100 text-blue-800',
            active: 'bg-green-100 text-green-800',
            past_due: 'bg-yellow-100 text-yellow-800',
            canceled: 'bg-red-100 text-red-800',
        };
        const labels = {
            trial: 'Prueba gratuita de 7 días',
            active: 'Activo',
            past_due: 'Vencido',
            canceled: 'Cancelado',
        };
        return (
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[status as keyof typeof styles]}`}>
                {labels[status as keyof typeof labels]}
            </span>
        );
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('es-CO', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0
        }).format(amount);
    };

    if (loading) return <ScreenLoader />;

    if (!subscription) {
        return (
            <div className="flex items-center justify-center w-full h-full bg-[#f0f4f3] dark:bg-[#0d1c14] animate-fadeIn">
                <div className="text-center">
                    <span className="material-symbols-outlined text-5xl text-gray-400 dark:text-gray-500">credit_card_off</span>
                    <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">No tienes una suscripción activa</h3>
                    <p className="mt-2 text-gray-500 dark:text-gray-400 text-sm">Selecciona un plan para comenzar</p>
                    <button
                        onClick={() => onNavigate(Screen.SUBSCRIPTION_PLANS)}
                        className="mt-5 px-5 py-2.5 bg-primary hover:bg-primary-hover text-stone-900 rounded-xl font-bold transition-colors text-sm shadow-lg shadow-primary/20"
                    >
                        Ver Planes
                    </button>
                </div>
            </div>
        );
    }

    const planName = subscription?.plan?.name ?? 'Plan activo';
    const displayPlanName = planName === 'Plan Pruebas Internas' ? 'Promocional' : planName;

    return (
        <div className="flex-1 w-full h-full overflow-y-auto bg-[#f0f4f3] dark:bg-[#0d1c14] p-4 md:p-6 animate-fadeIn">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1">Facturación y Pagos</h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">Gestiona tu suscripción y métodos de pago</p>
                </div>

                {/* Tabs */}
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl overflow-hidden shadow-lg shadow-gray-200/50 dark:shadow-none">
                    <div className="flex border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
                        {[
                            { id: 'overview', label: 'Resumen', icon: 'dashboard' },
                            { id: 'plans', label: 'Planes', icon: 'workspace_premium' },
                            { id: 'details', label: 'Pagos', icon: 'credit_card' },
                            { id: 'history', label: 'Historial', icon: 'history' },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as Tab)}
                                className={`flex-1 px-4 py-3 font-medium transition-all flex items-center justify-center gap-1.5 text-sm whitespace-nowrap ${activeTab === tab.id
                                    ? 'text-stone-900 dark:text-white border-b-2 border-primary dark:border-primary bg-primary/10 dark:bg-primary/20'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                    }`}
                            >
                                <span className="material-symbols-outlined text-base">{tab.icon}</span>
                                <span className="hidden sm:inline">{tab.label}</span>
                            </button>
                        ))}
                    </div>

                    <div className="p-5 md:p-6">
                        {/* Overview Tab */}
                        {activeTab === 'overview' && (
                            <div className="space-y-5">
                                <div>
                                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Resumen General</h2>
                                    <p className="text-gray-500 dark:text-gray-400 text-sm">Resumen de tu suscripción y pagos</p>
                                </div>

                                {/* Contact Details */}
                                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 md:p-5 border border-gray-100 dark:border-gray-800 animate-cardEntry" style={{ animationDelay: '60ms' }}>
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Detalles de Contacto</h3>
                                        <button
                                            onClick={() => setShowContactModal(true)}
                                            className="text-amber-700 hover:text-amber-800 dark:text-amber-500 dark:hover:text-amber-400 text-xs font-bold uppercase tracking-wide hover:underline decoration-2 underline-offset-2 transition-all"
                                        >
                                            Gestionar
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="size-12 bg-primary/20 dark:bg-primary/30 rounded-full flex items-center justify-center text-primary-text dark:text-primary text-base font-bold">
                                            {profile?.full_name?.charAt(0) || 'U'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-gray-900 dark:text-white font-medium text-sm truncate">{profile?.full_name || 'Usuario'}</p>
                                            {getRealEmail(profile?.email) && <p className="text-gray-500 dark:text-gray-400 text-xs truncate">{getRealEmail(profile?.email)}</p>}
                                        </div>
                                        <div className="text-right hidden sm:block">
                                            <p className="text-gray-400 dark:text-gray-500 text-xs">Teléfono</p>
                                            <span className="text-gray-900 dark:text-white text-xs font-medium">{profile?.phone || 'No registrado'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Current Plan */}
                                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 md:p-5 border border-gray-100 dark:border-gray-800 animate-cardEntry" style={{ animationDelay: '140ms' }}>
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Plan Actual</h3>
                                        <button
                                            onClick={() => setActiveTab('plans')}
                                            className="text-amber-700 hover:text-amber-800 dark:text-amber-500 dark:hover:text-amber-400 text-xs font-bold uppercase tracking-wide hover:underline decoration-2 underline-offset-2 transition-all"
                                        >
                                            Cambiar Plan
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-3 bg-white dark:bg-gray-900 rounded-lg p-3 border border-gray-100 dark:border-gray-800">
                                        <span className="material-symbols-outlined text-2xl text-primary dark:text-primary">{redeemedPromo ? 'confirmation_number' : 'workspace_premium'}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                                <p className="text-gray-900 dark:text-white font-semibold text-sm">
                                                    {redeemedPromo ? 'Código Promocional' : `Plan ${displayPlanName}`}
                                                </p>
                                                {getStatusBadge(subscription.status)}
                                            </div>
                                            <p className="text-gray-500 dark:text-gray-400 text-xs">
                                                {redeemedPromo
                                                    ? `${redeemedPromo.duration_months} meses de servicio · Vence ${formatDate(subscription.current_period_end)}`
                                                    : `${profile?.business_id === HIDDEN_PRICES_BUSINESS_ID ? 'Plan activo' : `${formatCurrency(subscription?.plan?.price_monthly ?? 0)}/${displayPlanName === 'Anual' ? 'año' : 'mes'}`}${hasCustomPlan && subscription.status === 'active' ? ` · Vence ${formatDate(subscription.current_period_end)}` : ''}`
                                                }
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Payment Details */}
                                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 md:p-5 border border-gray-100 dark:border-gray-800 animate-cardEntry" style={{ animationDelay: '220ms' }}>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-lg text-amber-500">payments</span>
                                            Métodos de Pago
                                        </h3>
                                        <button
                                            onClick={() => setActiveTab('details')}
                                            className="text-amber-700 hover:text-amber-800 dark:text-amber-500 dark:hover:text-amber-400 text-xs font-bold uppercase tracking-wider hover:underline decoration-2 underline-offset-2 transition-all"
                                        >
                                            Detalles
                                        </button>
                                    </div>
                                    <div className="space-y-3">
                                        {paymentMethods.length === 0 ? (
                                            <div className="text-center py-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm">
                                                <span className="material-symbols-outlined text-gray-300 dark:text-gray-600 text-3xl mb-1 block">credit_card_off</span>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">No hay métodos de pago registrados</p>
                                            </div>
                                        ) : (
                                            paymentMethods.map((pm) => (
                                                <div key={pm.id} className="flex items-center gap-3 bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-100 dark:border-gray-800/80 hover:border-amber-500/30 hover:shadow-md transition-all duration-300 select-none group">
                                                    <div className="w-12 h-8 bg-gradient-to-br from-stone-800 to-black border border-stone-700/30 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
                                                        {getCardBrandLogo(pm.card_brand)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-gray-900 dark:text-white font-mono font-bold text-sm tracking-wider">
                                                            •••• {pm.card_last_four}
                                                        </p>
                                                        <p className="text-gray-500 dark:text-gray-400 text-[11px] mt-0.5 font-medium">
                                                            Vence {pm.card_exp_month}/{pm.card_exp_year}
                                                        </p>
                                                    </div>
                                                    {pm.is_default && (
                                                        <span className="px-2 py-0.5 bg-amber-500/10 dark:bg-amber-500/20 text-amber-800 dark:text-amber-400 border border-amber-500/20 rounded-full text-[10px] font-bold tracking-wider uppercase">
                                                            Principal
                                                        </span>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Billing History Preview */}
                                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 md:p-5 border border-gray-100 dark:border-gray-800 animate-cardEntry" style={{ animationDelay: '300ms' }}>
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Historial de Facturación</h3>
                                        <button
                                            onClick={() => setActiveTab('history')}
                                            className="text-amber-700 hover:text-amber-800 dark:text-amber-500 dark:hover:text-amber-400 text-xs font-bold uppercase tracking-wide hover:underline decoration-2 underline-offset-2 transition-all"
                                        >
                                            Ver Historial
                                        </button>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="border-b border-gray-200 dark:border-gray-700">
                                                    <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium text-xs">Factura</th>
                                                    <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium text-xs">Monto</th>
                                                    <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium text-xs hidden sm:table-cell">Fecha</th>
                                                    <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium text-xs">Estado</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {invoices.slice(0, 3).map((invoice) => (
                                                    <tr key={invoice.id} className="border-b border-gray-100 dark:border-gray-800">
                                                        <td className="py-2 px-3 text-gray-900 dark:text-white text-xs">Plan {displayPlanName}</td>
                                                        <td className="py-2 px-3 text-gray-900 dark:text-white font-medium text-xs">{profile?.business_id === HIDDEN_PRICES_BUSINESS_ID ? '—' : formatCurrency(invoice.amount)}</td>
                                                        <td className="py-2 px-3 text-gray-500 dark:text-gray-400 text-xs hidden sm:table-cell">{formatDate(invoice.created_at)}</td>
                                                        <td className="py-2 px-3">
                                                            {invoice.status === 'paid' ? (
                                                                <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
                                                                    Pagado
                                                                </span>
                                                            ) : (
                                                                <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs font-medium">
                                                                    Fallido
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* History Tab */}
                        {activeTab === 'history' && (
                            <div className="space-y-5">
                                <div>
                                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Historial de Facturación</h2>
                                    <p className="text-gray-500 dark:text-gray-400 text-sm">Resumen del historial de pagos de tu suscripción</p>
                                </div>

                                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-800">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-100 dark:bg-gray-800">
                                            <tr>
                                                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium text-xs">Factura</th>
                                                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium text-xs">Monto</th>
                                                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium text-xs hidden sm:table-cell">Fecha</th>
                                                <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium text-xs">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {invoices.map((invoice) => (
                                                <tr key={invoice.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-white dark:hover:bg-gray-900/50">
                                                    <td className="py-3 px-4 text-gray-900 dark:text-white">Plan {displayPlanName}</td>
                                                    <td className="py-3 px-4 text-gray-900 dark:text-white font-medium">{profile?.business_id === HIDDEN_PRICES_BUSINESS_ID ? '—' : formatCurrency(invoice.amount)}</td>
                                                    <td className="py-3 px-4 text-gray-500 dark:text-gray-400 hidden sm:table-cell">{formatDate(invoice.created_at)}</td>
                                                    <td className="py-3 px-4">
                                                        {invoice.status === 'paid' ? (
                                                            <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium flex items-center gap-1 w-fit">
                                                                <span className="material-symbols-outlined text-xs">check_circle</span>
                                                                Pagado
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full text-xs font-medium">
                                                                Fallido
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Details Tab */}
                        {activeTab === 'details' && (
                            <div className="space-y-5">
                                <div>
                                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Detalles de Pago</h2>
                                    <p className="text-gray-500 dark:text-gray-400 text-sm">Resumen de tu suscripción y métodos de pago</p>
                                    {subscription.status === 'trial' && !redeemedPromo && (
                                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 mt-4">
                                            <p className="text-blue-700 dark:text-blue-400 font-medium text-sm">
                                                {profile?.business_id === HIDDEN_PRICES_BUSINESS_ID
                                                    ? `Tu próximo pago se procesará el ${formatDate(subscription.next_billing_date)}`
                                                    : <>Tu próximo pago de {formatCurrency(subscription?.plan?.price_monthly ?? 0)} se procesará el{' '}
                                                {formatDate(subscription.next_billing_date)}</>}
                                            </p>
                                        </div>
                                    )}
                                    {redeemedPromo && (
                                        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-3 mt-4">
                                            <p className="text-purple-700 dark:text-purple-400 font-medium text-sm">
                                                Servicio activo por código promocional · {redeemedPromo.duration_months} meses hasta el {formatDate(subscription.current_period_end)}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Auto Renewal (Oculto temporalmente) */}
                                {/* 
                                <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 md:p-5">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-0.5">Habilitar renovación automática</h3>
                                            <p className="text-gray-500 dark:text-gray-400 text-xs text-balance">
                                                Esta opción renovará automáticamente tu plan de suscripción 
                                                cuando termine el ciclo actual. (*Pendiente de implementación en backend)
                                            </p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input type="checkbox" className="sr-only peer" defaultChecked />
                                            <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                        </label>
                                    </div>
                                </div>
                                */}

                                {/* Contact Details */}
                                <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 md:p-5">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Detalles de Contacto</h3>
                                        <button
                                            onClick={() => setShowContactModal(true)}
                                            className="text-xs text-amber-700 hover:text-amber-800 dark:text-amber-500 dark:hover:text-amber-400 font-bold uppercase tracking-wide hover:underline decoration-2 underline-offset-2 transition-all"
                                        >
                                            Editar
                                        </button>
                                    </div>
                                    <p className="text-gray-500 dark:text-gray-400 text-xs mb-3">¿A quién debemos contactar si es necesario?</p>
                                    <div className="flex items-center gap-3">
                                        <div className="size-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-base font-bold">
                                            {profile?.full_name?.charAt(0) || 'U'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-gray-900 dark:text-white font-medium text-sm">{profile?.full_name || 'Usuario'}</p>
                                            {getRealEmail(profile?.email) && <p className="text-gray-500 dark:text-gray-400 text-xs">{getRealEmail(profile?.email)}</p>}
                                        </div>
                                        <div className="text-right hidden sm:block">
                                            <p className="text-gray-400 dark:text-gray-500 text-xs">Teléfono</p>
                                            <p className="text-gray-700 dark:text-gray-300 text-xs">{profile?.phone || 'No registrado'}</p>
                                            <span className="text-emerald-700 dark:text-emerald-400 text-xs font-bold uppercase">Activo</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Payment Methods */}
                                <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 md:p-5">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                                        <div>
                                            <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-lg text-amber-500">payments</span>
                                                Métodos de Pago
                                            </h3>
                                            <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5">Selecciona el método de pago predeterminado o cambia los detalles</p>
                                        </div>
                                        <button
                                            onClick={() => setShowAddCardModal(true)}
                                            className="px-3.5 py-2 bg-primary hover:bg-primary-hover text-stone-900 rounded-xl font-bold text-xs transition-all shadow-sm hover:shadow-md flex items-center justify-center gap-1.5 self-start sm:self-auto"
                                        >
                                            <span className="material-symbols-outlined text-sm font-bold">add_card</span>
                                            Agregar Método
                                        </button>
                                    </div>
                                    <div className="space-y-3 mt-4">
                                        {paymentMethods.length === 0 ? (
                                            <div className="text-center py-8 bg-gray-50/50 dark:bg-gray-800/20 rounded-xl border border-gray-100 dark:border-gray-800/80 shadow-sm">
                                                <span className="material-symbols-outlined text-gray-300 dark:text-gray-600 text-4xl mb-1 block">credit_card_off</span>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">No hay métodos de pago registrados</p>
                                            </div>
                                        ) : (
                                            paymentMethods.map((pm) => (
                                                <div key={pm.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-stone-900 border border-gray-100 dark:border-stone-850 hover:border-amber-500/20 dark:hover:border-amber-400/20 rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300 select-none group">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-14 h-9 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform duration-300 relative overflow-hidden ${
                                                            pm.card_brand.toLowerCase().includes('visa') ? 'bg-gradient-to-br from-blue-900 via-indigo-950 to-stone-950 border border-blue-500/20' :
                                                            pm.card_brand.toLowerCase().includes('mastercard') ? 'bg-gradient-to-br from-stone-900 via-red-950 to-stone-950 border border-red-500/10' :
                                                            pm.card_brand.toLowerCase().includes('amex') || pm.card_brand.toLowerCase().includes('american') ? 'bg-gradient-to-br from-teal-800 via-teal-950 to-stone-950 border border-teal-500/20' :
                                                            'bg-gradient-to-br from-stone-800 via-stone-900 to-black border border-stone-750'
                                                        }`}>
                                                            {/* Mini virtual card chip */}
                                                            <div className="absolute top-1 left-1.5 w-3 h-2.5 bg-gradient-to-br from-yellow-300 via-yellow-400 to-yellow-200 rounded-sm opacity-60 shadow-inner" />
                                                            {/* Brand logo container */}
                                                            <div className="relative z-10 scale-90">
                                                                {getCardBrandLogo(pm.card_brand)}
                                                            </div>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-gray-900 dark:text-white font-mono font-bold text-sm tracking-wider flex items-center gap-2">
                                                                •••• {pm.card_last_four}
                                                                {pm.is_default && (
                                                                    <span className="px-2 py-0.5 bg-amber-500/10 dark:bg-amber-500/20 text-amber-800 dark:text-amber-400 border border-amber-500/20 rounded-full text-[9px] font-bold tracking-wider uppercase">
                                                                        Principal
                                                                    </span>
                                                                )}
                                                            </p>
                                                            <p className="text-gray-500 dark:text-gray-400 text-xs mt-0.5 font-medium flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-[10px] text-gray-400">calendar_today</span>
                                                                Expira {pm.card_exp_month}/{pm.card_exp_year}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 border-gray-100 dark:border-stone-850 pt-3 sm:pt-0">
                                                        {!pm.is_default ? (
                                                            <button
                                                                onClick={() => handleSetDefaultPaymentMethod(pm.id)}
                                                                className="text-amber-600 hover:text-amber-700 dark:text-amber-500 dark:hover:text-amber-400 text-xs font-bold transition-all uppercase tracking-wider hover:underline"
                                                            >
                                                                Hacer Principal
                                                            </button>
                                                        ) : (
                                                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1 bg-emerald-500/5 dark:bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                                                                <span className="material-symbols-outlined text-sm font-bold">check_circle</span>
                                                                Activo
                                                            </span>
                                                        )}
                                                        <button
                                                            onClick={() => handleDeletePaymentMethod(pm.id)}
                                                            className="p-2 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 rounded-xl hover:bg-gray-100 dark:hover:bg-stone-800 transition-all flex items-center justify-center border border-transparent hover:border-gray-200 dark:hover:border-stone-700"
                                                            aria-label="Eliminar método de pago"
                                                        >
                                                            <span className="material-symbols-outlined text-lg">delete</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}


                        {/* Plans Tab */}
                        {activeTab === 'plans' && (
                            hasCustomPlan && customPlan ? (
                                <div className="space-y-4">
                                    <div className="mb-4">
                                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Tu Plan Personalizado</h2>
                                        <p className="text-gray-500 dark:text-gray-400 text-sm">Renueva tu suscripción cuando quieras. Elige tu periodicidad de pago.</p>
                                    </div>
                                    <CustomPlanCard
                                        plans={customPlans}
                                        canPay={hasPermission('admin_settings')}
                                        onPay={handlePayCustomPlan}
                                        isSubmitting={payingCustomPlan}
                                        businessId={profile?.business_id}
                                        userId={profile?.id}
                                        onCodeRedeemed={async () => { await checkSubscription(); await fetchSubscriptionData(); }}
                                    />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="mb-4">
                                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Renovar o Cambiar Plan</h2>
                                        <p className="text-gray-500 dark:text-gray-400 text-sm">Explora las opciones disponibles y selecciona el mejor plan para tu negocio.</p>
                                    </div>
                                    <div className="border border-gray-200 dark:border-gray-800 rounded-2xl bg-white dark:bg-[#0d1c14]">
                                        <div className="relative">
                                            <SubscriptionPlansScreen onNavigate={onNavigate} />
                                        </div>
                                    </div>
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>

            {/* Contact Modal */}
            {showContactModal && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-none p-5 max-w-md w-full shadow-xl">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Editar Datos de Contacto</h3>
                        <form onSubmit={handleUpdateContact} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre Completo</label>
                                <input
                                    type="text"
                                    value={contactForm.fullName}
                                    onChange={e => setContactForm({ ...contactForm, fullName: e.target.value })}
                                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Teléfono</label>
                                <input
                                    type="tel"
                                    value={contactForm.phone}
                                    onChange={e => setContactForm({ ...contactForm, phone: e.target.value })}
                                    className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-2.5 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                                    placeholder="+57 300 123 4567"
                                />
                            </div>
                            <div className="flex gap-3 mt-5">
                                <button
                                    type="button"
                                    onClick={() => setShowContactModal(false)}
                                    className="flex-1 px-4 py-2.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-white rounded-lg transition-colors text-sm font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={processingAction}
                                    className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary-hover text-stone-900 rounded-lg transition-colors disabled:opacity-50 text-sm font-bold shadow-sm"
                                >
                                    {processingAction ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Add Card Modal */}
            {showAddCardModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 max-w-md w-full shadow-2xl animate-cardEntry">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Agregar Método de Pago</h3>
                            <button
                                type="button"
                                onClick={() => { setShowAddCardModal(false); setIsCvcFocused(false); }}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all flex items-center justify-center"
                                aria-label="Cerrar modal"
                            >
                                <span className="material-symbols-outlined text-xl">close</span>
                            </button>
                        </div>

                        {/* Interactive live card preview (Premium 3D Flip) */}
                        <div className="w-full h-48 [perspective:1000px] mb-8 select-none">
                            <div 
                                className={`relative w-full h-full rounded-2xl shadow-2xl transition-transform duration-700 [transform-style:preserve-3d] ${
                                    isCvcFocused ? '[transform:rotateY(180deg)]' : ''
                                }`}
                            >
                                {/* Card Front */}
                                <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-stone-900 via-stone-950 to-stone-900 text-white p-6 rounded-2xl border border-amber-500/20 flex flex-col justify-between overflow-hidden [backface-visibility:hidden]">
                                    {/* Holographic glowing backgrounds */}
                                    <div className="absolute -right-16 -top-16 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
                                    <div className="absolute -left-16 -bottom-16 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
                                    
                                    {/* Top row with chip and wireless & logo */}
                                    <div className="flex justify-between items-start relative z-10">
                                        <div className="flex items-center gap-3">
                                            {/* Golden Metallic Chip */}
                                            <div className="w-11 h-8 bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-200 rounded-lg relative overflow-hidden shadow-md border border-amber-400/20">
                                                <div className="absolute inset-x-0 top-1/2 h-[1px] bg-stone-900/30" />
                                                <div className="absolute inset-y-0 left-1/2 w-[1px] bg-stone-900/30" />
                                                <div className="absolute inset-1.5 border border-stone-900/20 rounded-md" />
                                            </div>
                                            {/* Wireless contactless symbol */}
                                            <svg className="w-5 h-5 text-gray-400/80 transform rotate-90" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M12 3C7.03 3 3 7.03 3 12C3 16.97 7.03 21 12 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                                <path d="M12 6C8.69 6 6 8.69 6 12C6 15.31 8.69 18 12 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                                <path d="M12 9C10.34 9 9 10.34 9 12C9 13.66 10.34 15 12 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                            </svg>
                                        </div>
                                        <div className="h-8 flex items-center justify-center bg-white/5 backdrop-blur-md px-3 py-1 rounded-xl border border-white/10 shadow-sm transition-all duration-300">
                                            {getCardBrandLogo(detectCardBrand(cardForm.number))}
                                        </div>
                                    </div>

                                    {/* Card Number */}
                                    <div className="text-xl tracking-[0.18em] text-white/95 my-auto font-mono text-center font-semibold drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] select-all relative z-10">
                                        {cardForm.number || '•••• •••• •••• ••••'}
                                    </div>

                                    {/* Footer with Cardholder & Expiry */}
                                    <div className="flex justify-between items-end text-xs relative z-10 border-t border-white/5 pt-3">
                                        <div className="flex-1 min-w-0 pr-4">
                                            <span className="text-[8px] uppercase tracking-wider text-stone-400 font-bold block mb-0.5">Titular</span>
                                            <span className="font-semibold block truncate uppercase tracking-wider text-white/90 font-mono">
                                                {cardForm.cardHolder || 'NOMBRE DEL TITULAR'}
                                            </span>
                                        </div>
                                        <div className="text-right flex-shrink-0 font-mono font-semibold text-white/90">
                                            <span className="text-[8px] uppercase tracking-wider text-stone-400 font-bold block mb-0.5">Vence</span>
                                            <span>
                                                {(cardForm.expMonth || 'MM') + '/' + (cardForm.expYear || 'AA')}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Card Back */}
                                <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-stone-900 via-stone-950 to-stone-900 text-white rounded-2xl border border-amber-500/20 flex flex-col justify-between overflow-hidden [backface-visibility:hidden] [transform:rotateY(180deg)]">
                                    {/* Magnetic Stripe */}
                                    <div className="w-full h-10 bg-black/95 mt-5" />

                                    {/* CVC section */}
                                    <div className="px-6 flex flex-col gap-1.5">
                                        <span className="text-[8px] uppercase tracking-wider text-stone-400 font-bold text-right pr-2">Código de Seguridad (CVC)</span>
                                        <div className="w-full h-9 bg-stone-850 rounded-lg flex items-center justify-between px-3 border border-stone-750 shadow-inner relative">
                                            {/* Signature lines */}
                                            <div className="flex flex-col gap-1 w-2/3 opacity-25">
                                                <div className="h-0.5 bg-white w-full" />
                                                <div className="h-0.5 bg-white w-5/6" />
                                                <div className="h-0.5 bg-white w-4/5" />
                                            </div>
                                            {/* Highlighted CVC value */}
                                            <span className="font-mono font-bold text-sm tracking-wider text-amber-400 bg-black/50 px-2 py-0.5 rounded border border-amber-400/20">
                                                {cardForm.cvc || '•••'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Back Footer info */}
                                    <div className="px-6 pb-5 flex justify-between items-center text-[8px] text-stone-500 font-sans tracking-wide">
                                        <span>BISTRO POS CO</span>
                                        <span>WOMPI SECURED</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <form onSubmit={handleAddCard} className="space-y-4">
                            <div className="relative">
                                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5" htmlFor="cardNumber">
                                    Número de tarjeta
                                </label>
                                <input
                                    type="text"
                                    id="cardNumber"
                                    value={cardForm.number}
                                    onFocus={() => setIsCvcFocused(false)}
                                    onChange={e => {
                                        let val = e.target.value.replace(/\D/g, '');
                                        val = val.replace(/(\d{4})/g, '$1 ').trim();
                                        setCardForm({ ...cardForm, number: val })
                                    }}
                                    className="w-full bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-mono text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                                    placeholder="0000 0000 0000 0000"
                                    maxLength={19}
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="relative">
                                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5" htmlFor="expDate">
                                        MM/AA
                                    </label>
                                    <input
                                        type="text"
                                        id="expDate"
                                        value={cardForm.expMonth + (cardForm.expMonth.length === 2 && cardForm.expYear === '' ? '' : cardForm.expYear ? '/' + cardForm.expYear : '')}
                                        onFocus={() => setIsCvcFocused(false)}
                                        onChange={e => {
                                            let val = e.target.value.replace(/\D/g, '');
                                            let month = val.slice(0, 2);
                                            let year = val.slice(2, 4);
                                            setCardForm({ ...cardForm, expMonth: month, expYear: year });
                                        }}
                                        className="w-full bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-mono text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-center"
                                        placeholder="MM/AA"
                                        maxLength={5}
                                        required
                                    />
                                </div>
                                <div className="relative">
                                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5" htmlFor="cvc">
                                        Código de seguridad
                                    </label>
                                    <input
                                        type="password"
                                        id="cvc"
                                        value={cardForm.cvc}
                                        onFocus={() => setIsCvcFocused(true)}
                                        onBlur={() => setIsCvcFocused(false)}
                                        onChange={e => setCardForm({ ...cardForm, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                                        className="w-full bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-mono text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-center"
                                        placeholder="•••"
                                        maxLength={4}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="relative">
                                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5" htmlFor="cardHolder">
                                    Nombre del titular
                                </label>
                                <input
                                    type="text"
                                    id="cardHolder"
                                    value={cardForm.cardHolder}
                                    onFocus={() => setIsCvcFocused(false)}
                                    onChange={e => setCardForm({ ...cardForm, cardHolder: e.target.value })}
                                    className="w-full bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                                    placeholder="Nombre completo"
                                    required
                                />
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => { setShowAddCardModal(false); setIsCvcFocused(false); }}
                                    className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-white rounded-xl transition-colors text-sm font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={processingAction}
                                    className="flex-1 px-4 py-3 bg-primary hover:bg-primary-hover text-stone-900 rounded-xl transition-colors disabled:opacity-50 text-sm font-bold shadow-md shadow-primary/10"
                                >
                                    {processingAction ? 'Procesando...' : 'Guardar Tarjeta'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
