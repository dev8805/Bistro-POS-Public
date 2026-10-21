
import React, { useState, useEffect, useRef } from 'react';
import { Screen } from '../types';
import { useClients } from '../hooks/useClients';
import { formatCurrency } from '../lib/formatters';
import { useToast } from '../context/ToastContext';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { ScreenLoader } from '../components/ScreenLoader';
import { isSameDayInTz, formatDateInTz } from '../lib/timezone';
import { AppButton } from '../components/ui/AppButton';
import { downloadTransactionHistoryPDF } from '../lib/shareTransactionHistory';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { useCashRegister } from '../hooks/useCashRegister';
import { PhoneInput } from '../components/PhoneInput';
import { EmailReceiptModal } from '../components/EmailReceiptModal';
import { supabase } from '../lib/supabase';

interface ClientsScreenProps {
    onNavigate: (screen: Screen) => void;
    isOnline?: boolean;
}


export const ClientsScreen: React.FC<ClientsScreenProps> = ({ onNavigate, isOnline = true }) => {
    const { showToast } = useToast();
    const { timezone, paymentMethods, businessName } = useBusinessSettings();
    const { confirmAction } = useConfirmDialog();
    const {
        clients,
        loading,
        createClient,
        updateClient,
        addDebt,
        addPayment,
        clearTransactions,
        deleteTransaction,
        deleteClient,
        refetch,
    } = useClients();


    const { addCashIn, activeShift, reverseCashMovement } = useCashRegister();
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
    const [debtEmailClient, setDebtEmailClient] = useState<typeof clients[0] | null>(null);

    // Trigger de animación de gráficos: parte en false y pasa a true en el siguiente
    // frame, garantizando que el browser pinte el estado inicial (barras a 0%) antes
    // de que arranque la transición CSS hacia los valores reales.
    const [chartsReady, setChartsReady] = useState(false);
    useEffect(() => {
        if (loading) return;
        const id = requestAnimationFrame(() => {
            requestAnimationFrame(() => setChartsReady(true));
        });
        return () => cancelAnimationFrame(id);
    }, [loading]);

    const handleSendDebtEmail = async (recipientEmail: string): Promise<boolean> => {
        if (!debtEmailClient) return false;
        try {
            const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
            const response = await fetch(`${SUPABASE_URL}/functions/v1/send-receipt-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: recipientEmail,
                    businessName,
                    businessPhone: null,
                    total: debtEmailClient.current_debt,
                    date: new Date().toLocaleDateString('es-CO'),
                    emailType: 'debt_reminder',
                    clientName: debtEmailClient.name,
                }),
            });
            return response.ok;
        } catch {
            return false;
        }
    };

    const handleWhatsAppClick = (e: React.MouseEvent, client: typeof clients[0]) => {
        e.stopPropagation();
        if (!client.phone) return;

        let phoneParam = '';
        const rawPhone = client.phone.replace(/\D/g, '');
        if (rawPhone) {
            const phone = rawPhone.startsWith('57') ? rawPhone : `57${rawPhone}`;
            phoneParam = `phone=${phone}&`;
        }

        const message = `Hola ${client.name}, te escribimos de *${businessName}* para recordarte que tienes un saldo pendiente por valor de *$${formatCurrency(client.current_debt)}*.`;
        const encodedMsg = encodeURIComponent(message);
        const nativeUrl = `whatsapp://send?${phoneParam}text=${encodedMsg}`;
        const webUrl = `https://web.whatsapp.com/send?${phoneParam}text=${encodedMsg}`;

        let appOpened = false;
        const handleBlur = () => { appOpened = true; };
        window.addEventListener('blur', handleBlur);

        window.location.href = nativeUrl;

        setTimeout(() => {
            window.removeEventListener('blur', handleBlur);
            if (!appOpened) {
                const width = 800;
                const height = 600;
                const left = (window.innerWidth - width) / 2;
                const top = (window.innerHeight - height) / 2;
                window.open(webUrl, 'WhatsApp', `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`);
            }
        }, 1500);
    };

    const handleDeleteClient = async (client: typeof clients[0]) => {
        const confirmed = await confirmAction({
            title: `¿Eliminar a ${client.name}?`,
            message: client.current_debt > 0
                ? `Este cliente tiene una deuda de $${formatCurrency(client.current_debt)}. Se eliminará de la lista pero no se borrarán sus datos.`
                : 'Se eliminará de la lista de clientes.',
            confirmText: 'Eliminar',
            variant: 'danger',
        });
        if (!confirmed) return;
        try {
            await deleteClient(client.id);
            if (selectedClient?.id === client.id) setSelectedClient(null);
            showToast('Cliente eliminado', 'success');
        } catch {
            showToast('Error al eliminar cliente', 'error');
        }
    };

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedClient, setSelectedClient] = useState<typeof clients[0] | null>(null);

    const handleCloseClientDetail = () => {
        if (agingBucketOrigin) {
            setSelectedAgingBucket(agingBucketOrigin);
            setAgingBucketOrigin(null);
        }
        setSelectedClient(null);
    };

    const subviewPushedRef = useRef(false);

    useEffect(() => {
        const isMobile = window.innerWidth < 768;
        if (!isMobile) return;

        if (selectedClient && !subviewPushedRef.current) {
            window.history.pushState({ subview: 'client-detail' }, '');
            subviewPushedRef.current = true;
        }
        if (!selectedClient) {
            subviewPushedRef.current = false;
        }
    }, [selectedClient]);

    useEffect(() => {
        const isMobile = window.innerWidth < 768;
        if (!isMobile) return;

        const handlePopState = (e: PopStateEvent) => {
            if (subviewPushedRef.current) {
                subviewPushedRef.current = false;
                (window as any).__subviewHandledBack = true;
                handleCloseClientDetail();
            }
        };
        window.addEventListener('popstate', handlePopState, true);
        return () => window.removeEventListener('popstate', handlePopState, true);
    }, []);

    const [showTransactionModal, setShowTransactionModal] = useState<'debt' | 'payment' | null>(null);

    useEffect(() => {
        if (!selectedClient || showTransactionModal) return;
        const fresh = clients.find(c => c.id === selectedClient.id);
        if (fresh) setSelectedClient(fresh);
    }, [clients, showTransactionModal]);

    const [showNewClientModal, setShowNewClientModal] = useState(false);
    const [clientToEdit, setClientToEdit] = useState<typeof clients[0] | null>(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [editingCreditLimit, setEditingCreditLimit] = useState(false);
    const [inlineCreditLimit, setInlineCreditLimit] = useState('');

    // Form States with formatting
    const [newClientLimit, setNewClientLimit] = useState('');
    const [transactionAmount, setTransactionAmount] = useState('');
    const [isSavingClient, setIsSavingClient] = useState(false);
    const [isSubmittingTransaction, setIsSubmittingTransaction] = useState(false);
    const [monitorFilter, setMonitorFilter] = useState<'todos' | 'vencidos' | 'aldia'>('todos');
    const [monitorSearch, setMonitorSearch] = useState('');
    const [selectedAgingBucket, setSelectedAgingBucket] = useState<'current' | 'days30' | 'days60' | 'overdue' | null>(null);
    const [agingBucketOrigin, setAgingBucketOrigin] = useState<'current' | 'days30' | 'days60' | 'overdue' | null>(null);
    const [sheetDragY, setSheetDragY] = useState(0);
    const sheetDragStartY = useRef<number | null>(null);
    const sheetRef = useRef<HTMLDivElement>(null);
    const sheetDragYRef = useRef(0);

    const getClientDueDate = (client: any) => {
        const lastDebt = client.transactions?.filter((t: any) => t.type === 'debt')?.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())?.[0];
        return lastDebt?.due_date ? new Date(lastDebt.due_date) : null;
    };

    const isClientVencido = (client: any) => {
        if (client.current_debt <= 0) return false;
        const due = getClientDueDate(client);
        if (!due) return true; // Legacy debts without due date are considered vencido if they have debt
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const d = new Date(due);
        d.setHours(0, 0, 0, 0);
        return d < today;
    };

    // Aging report calculations
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const agingBuckets = { current: 0, days30: 0, days60: 0, overdue: 0 };
    clients.filter(c => c.current_debt > 0).forEach(client => {
        const isVencido = isClientVencido(client);

        if (!isVencido) {
            agingBuckets.current += client.current_debt;
        } else {
            let diffDays = 0;
            const due = getClientDueDate(client);
            if (due) {
                const d = new Date(due);
                d.setHours(0, 0, 0, 0);
                diffDays = Math.ceil((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
            } else {
                const lastDebt = client.transactions?.filter(t => t.type === 'debt').sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
                if (lastDebt) {
                    const created = new Date(lastDebt.created_at);
                    created.setHours(0, 0, 0, 0);
                    diffDays = Math.ceil((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
                }
            }

            if (diffDays <= 30) agingBuckets.days30 += client.current_debt;
            else if (diffDays <= 60) agingBuckets.days60 += client.current_debt;
            else agingBuckets.overdue += client.current_debt;
        }
    });
    const agingMax = Math.max(agingBuckets.current, agingBuckets.days30, agingBuckets.days60, agingBuckets.overdue, 1);

    const getClientDiffDays = (client: any): number => {
        const due = getClientDueDate(client);
        if (due) {
            const d = new Date(due);
            d.setHours(0, 0, 0, 0);
            return Math.ceil((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        }
        const lastDebt = client.transactions?.filter((t: any) => t.type === 'debt').sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        if (lastDebt) {
            const created = new Date(lastDebt.created_at);
            created.setHours(0, 0, 0, 0);
            return Math.ceil((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
        }
        return 0;
    };

    const getClientsForBucket = (bucket: 'current' | 'days30' | 'days60' | 'overdue') =>
        clients.filter(c => {
            if (c.current_debt <= 0) return false;
            const isVencido = isClientVencido(c);
            if (bucket === 'current') return !isVencido;
            const diff = getClientDiffDays(c);
            if (bucket === 'days30') return isVencido && diff <= 30;
            if (bucket === 'days60') return isVencido && diff > 30 && diff <= 60;
            return isVencido && diff > 60;
        }).sort((a, b) => b.current_debt - a.current_debt);

    const agingSheetClients = selectedAgingBucket ? getClientsForBucket(selectedAgingBucket) : [];
    const agingSheetInfo = selectedAgingBucket ? ({
        current: { title: 'Al Día', color: '#4dcba1', textCls: 'text-emerald-600 dark:text-emerald-400' },
        days30:  { title: 'Vencidos 1–30 días', color: '#fbbf24', textCls: 'text-amber-600 dark:text-amber-400' },
        days60:  { title: 'Vencidos 31–60 días', color: '#f97316', textCls: 'text-orange-600 dark:text-orange-400' },
        overdue: { title: 'Vencidos +60 días',   color: '#e11d48', textCls: 'text-rose-600 dark:text-rose-400' },
    } as const)[selectedAgingBucket] : null;

    // Swipe-to-dismiss: se registra con passive:false para poder llamar preventDefault
    // y evitar que el pull-to-refresh del navegador interfiera
    useEffect(() => {
        const el = sheetRef.current;
        if (!el || !selectedAgingBucket) return;

        const onTouchStart = (e: TouchEvent) => {
            sheetDragStartY.current = e.touches[0].clientY;
            sheetDragYRef.current = 0;
        };

        const onTouchMove = (e: TouchEvent) => {
            if (sheetDragStartY.current === null) return;
            const dy = e.touches[0].clientY - sheetDragStartY.current;
            if (dy > 0) {
                e.preventDefault();
                sheetDragYRef.current = dy;
                setSheetDragY(dy);
            }
        };

        const onTouchEnd = () => {
            const dy = sheetDragYRef.current;
            if (dy > 80) {
                setSelectedAgingBucket(null);
            }
            setSheetDragY(0);
            sheetDragYRef.current = 0;
            sheetDragStartY.current = null;
        };

        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', onTouchEnd, { passive: true });

        return () => {
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', onTouchEnd);
        };
    }, [selectedAgingBucket]);

    const top5Debtors = [...clients]
        .filter(c => c.current_debt > 0)
        .sort((a, b) => b.current_debt - a.current_debt)
        .slice(0, 5);
    const monitorClients = clients
        .filter(c => {
            const matchSearch = c.name.toLowerCase().includes(monitorSearch.toLowerCase()) || (c.phone && c.phone.includes(monitorSearch));
            const vencido = isClientVencido(c);
            const matchFilter = monitorFilter === 'todos' || (monitorFilter === 'vencidos' && vencido) || (monitorFilter === 'aldia' && !vencido);
            return matchSearch && matchFilter;
        })
        .sort((a, b) => b.current_debt - a.current_debt);

    const formatNumber = (value: string) => {
        // Remove non-numeric characters
        const rawValue = value.replace(/\D/g, '');
        // Add dots every 3 digits
        return rawValue.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    };

    const parseNumber = (value: string) => {
        return parseFloat(value.replace(/\./g, '')) || 0;
    };

    const filteredClients = clients
        .filter(c =>
            c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (c.phone && c.phone.includes(searchQuery))
        )
        .sort((a, b) => a.name.localeCompare(b.name));

    const totalReceivable = clients.reduce((sum, c) => sum + c.current_debt, 0);
    const totalDebtors = clients.filter(c => c.current_debt > 0).length;

    const collectedToday = clients.reduce((total, client) => {
        const now = new Date();
        const clientPayments = client.transactions?.filter(t =>
            t.type === 'payment' &&
            isSameDayInTz(new Date(t.created_at), now, timezone)
        ) || [];
        return total + clientPayments.reduce((sum, t) => sum + t.amount, 0);
    }, 0);

    const collectedThisMonth = clients.reduce((total, client) => {
        const now = new Date();
        const clientPayments = client.transactions?.filter(t => {
            if (t.type !== 'payment') return false;
            const tDate = new Date(t.created_at);
            return tDate.getMonth() === now.getMonth() && tDate.getFullYear() === now.getFullYear();
        }) || [];
        return total + clientPayments.reduce((sum, t) => sum + t.amount, 0);
    }, 0);

    const totalVencido = agingBuckets.days30 + agingBuckets.days60 + agingBuckets.overdue;

    const formatCurrencyK = (v: number) => {
        if (v === 0) return '$0k';
        if (v >= 1000) return '$' + (v / 1000).toFixed(0) + 'k';
        return '$' + v.toString();
    };

    const handleClientFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsSavingClient(true);
        const formData = new FormData(e.currentTarget);
        const name = formData.get('name') as string;
        const phone = formData.get('phone') as string;
        const email = formData.get('email') as string;
        const id_number = formData.get('id_number') as string;
        const address = formData.get('address') as string;
        const limit = parseNumber(newClientLimit);

        try {
            if (clientToEdit) {
                await updateClient(clientToEdit.id, {
                    name,
                    phone,
                    email,
                    id_number,
                    address,
                    credit_limit: limit,
                });
                if (selectedClient?.id === clientToEdit.id) {
                    setSelectedClient({ ...selectedClient, name, phone, email, id_number, address, credit_limit: limit });
                }
            } else {
                await createClient({
                    name,
                    phone,
                    email,
                    id_number,
                    address,
                    credit_limit: limit,
                });
            }
            setShowNewClientModal(false);
            setClientToEdit(null);
            setNewClientLimit('');
        } catch (error) {
            console.error('Error saving client:', error);
            showToast('Error al guardar el cliente', 'error');
        } finally {
            setIsSavingClient(false);
        }
    };

    const handleAddTransaction = async (note: string, dueDate?: string) => {
        if (!selectedClient || !showTransactionModal || isSubmittingTransaction) return;

        const rawAmount = parseNumber(transactionAmount);
        if (rawAmount <= 0) return;
        const amount = showTransactionModal === 'debt'
            ? Math.round(Math.max(0, rawAmount) / 50) * 50
            : rawAmount;

        setIsSubmittingTransaction(true);
        try {
            if (showTransactionModal === 'debt') {
                await addDebt(selectedClient.id, amount, note, undefined, dueDate);
            } else {
                const methodMap: Record<string, string> = {
                    'Efectivo': 'cash', 'Tarjeta': 'card', 'Nequi': 'nequi',
                    'Daviplata': 'daviplata', 'Transferencia': 'transfer', 'Otro': 'other',
                };
                const dbMethod = methodMap[selectedPaymentMethod] || selectedPaymentMethod.toLowerCase() || 'cash';
                await addPayment(selectedClient.id, amount, note, dbMethod, activeShift?.id || undefined);
                if (navigator.onLine && activeShift) {
                    await addCashIn(amount, `Abono de: ${selectedClient.name}${note ? ' · ' + note : ''}`, dbMethod);
                }
            }
            setShowTransactionModal(null);
            setTransactionAmount('');
            setSelectedPaymentMethod('');
        } catch (error: any) {
            console.error('Error adding transaction:', error);
            showToast(error.message || 'Error al procesar la transacción', 'error');
        } finally {
            setIsSubmittingTransaction(false);
        }
    };

    const getDynamicFontSize = (value: number) => {
        const length = value.toFixed(0).length + 1;
        if (length > 10) return 'text-lg';
        if (length > 8) return 'text-xl';
        if (length > 6) return 'text-2xl';
        return 'text-3xl';
    };

    if (!isOnline || !navigator.onLine) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center h-full bg-background-light dark:bg-background-dark p-8 text-center gap-5">
                <div className="size-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>wifi_off</span>
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Sin conexión</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-xs">
                        Las cuentas por cobrar requieren internet para cargar los datos de clientes.
                    </p>
                </div>
            </div>
        );
    }

    if (loading) return <ScreenLoader />;

    return (
        <div className="flex-1 flex flex-col h-full bg-background-light dark:bg-background-dark overflow-hidden animate-fadeIn">
            {/* Header */}
            <header className="shrink-0 bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-800 z-10">
                <div className="flex items-center justify-between gap-3 px-4 md:px-6 h-14">
                    <h1 className="text-[15px] font-semibold text-text-main dark:text-white tracking-tight whitespace-nowrap">
                        Cuentas por Cobrar
                    </h1>
                    <button
                        onClick={() => { setClientToEdit(null); setNewClientLimit(''); setShowNewClientModal(true); }}
                        className="shrink-0 flex items-center gap-1.5 h-8 px-3 bg-primary hover:bg-primary-hover text-[#102218] text-[12px] font-bold rounded-lg transition-colors shadow-sm"
                        aria-label="Registrar nuevo cliente"
                    >
                        <span className="material-symbols-outlined text-[16px]">person_add</span>
                        <span className="hidden sm:inline">Nuevo Cliente</span>
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-0 md:py-4 md:px-8 bg-gray-50 dark:bg-black/20">
                <div className="max-w-5xl mx-auto space-y-4 md:space-y-6 p-4 md:p-0">

                    {/* ═══ RESUMEN GERENCIAL ═══ */}
                    <div className="space-y-4 md:space-y-6">
                            {/* KPI Cards */}
                            <div className="flex gap-2 overflow-x-auto lg:grid lg:grid-cols-3 lg:gap-4 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                                <div className="min-w-[115px] shrink-0 lg:min-w-0 bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 border-l-4 border-l-gray-400 p-2.5 lg:p-5 flex flex-col justify-center">
                                    <p className="text-[9px] lg:text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 lg:mb-1.5 leading-tight">
                                        <span className="lg:hidden">Por Cobrar</span>
                                        <span className="hidden lg:block">Total Por Cobrar</span>
                                    </p>
                                    <p className="text-sm lg:text-[28px] font-black text-text-main dark:text-white leading-tight">${formatCurrency(totalReceivable)}</p>
                                    <p className="hidden lg:flex text-[11px] text-gray-500 mt-2 items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[14px]">info</span>
                                        Capital inmovilizado en la calle
                                    </p>
                                </div>
                                <div className="min-w-[115px] shrink-0 lg:min-w-0 bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 border-l-4 border-l-rose-500 p-2.5 lg:p-5 flex flex-col justify-center">
                                    <p className="text-[9px] lg:text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 lg:mb-1.5 leading-tight">
                                        <span className="lg:hidden">Vencido</span>
                                        <span className="hidden lg:block">Vencido {'>'} 1 Día</span>
                                    </p>
                                    <p className="text-sm lg:text-[28px] font-black text-rose-600 dark:text-rose-500 leading-tight">${formatCurrency(totalVencido)}</p>
                                    <p className="hidden lg:flex text-[11px] text-rose-500 mt-2 items-center gap-1.5 font-medium">
                                        <span className="material-symbols-outlined text-[14px]">warning</span>
                                        Requiere acción de cobro inmediata
                                    </p>
                                </div>
                                <div className="min-w-[115px] shrink-0 lg:min-w-0 bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 border-l-4 border-l-emerald-500 p-2.5 lg:p-5 flex flex-col justify-center">
                                    <p className="text-[9px] lg:text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1 lg:mb-1.5 leading-tight">
                                        <span className="lg:hidden">Este Mes</span>
                                        <span className="hidden lg:block">Cobrado Este Mes</span>
                                    </p>
                                    <p className="text-sm lg:text-[28px] font-black text-emerald-600 dark:text-emerald-500 leading-tight">${formatCurrency(collectedThisMonth)}</p>
                                    <p className="hidden lg:flex text-[11px] text-emerald-600 dark:text-emerald-500 mt-2 items-center gap-1.5 font-medium">
                                        <span className="material-symbols-outlined text-[14px]">check</span>
                                        Flujo de caja positivo generado
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 md:gap-6">
                                {/* Aging Report Vertical */}
                                <div className="bg-white dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5 md:p-6 flex flex-col min-h-[350px]">
                                    <h3 className="text-base font-semibold text-text-main dark:text-white mb-1">Antigüedad de Saldos</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-8">Muestra cómo se distribuye la deuda según el tiempo de atraso.</p>

                                    <div className="relative flex-1 flex items-end ml-8 mb-2">
                                        {/* Horizontal Grid */}
                                        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                                            {Array.from({ length: 6 }).map((_, i) => {
                                                // 5 grid lines: 100%, 80%, 60%, 40%, 20%, 0%
                                                const val = agingMax - (i * (agingMax / 5));
                                                return (
                                                    <div key={`gridline-${i}`} className="w-full border-t border-gray-100 dark:border-gray-800/60 flex items-center h-0 relative">
                                                        <span className="absolute -left-9 text-[10px] text-gray-400 dark:text-gray-500 -translate-y-1/2 w-7 text-right">
                                                            {formatCurrencyK(val)}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Bars */}
                                        <div className="relative z-10 w-full h-full flex items-end justify-around pb-[1px]">
                                            {([
                                                { label: 'Al Día', mobileLabel: 'Al Día', value: agingBuckets.current, color: 'bg-[#4dcba1]', bucket: 'current' as const },
                                                { label: '1-30 Días Venc.', mobileLabel: '1-30d', value: agingBuckets.days30, color: 'bg-[#fbbf24]', bucket: 'days30' as const },
                                                { label: '31-60 Días Venc.', mobileLabel: '31-60d', value: agingBuckets.days60, color: 'bg-[#f97316]', bucket: 'days60' as const },
                                                { label: '+60 Días Venc.', mobileLabel: '+60d', value: agingBuckets.overdue, color: 'bg-[#e11d48]', bucket: 'overdue' as const },
                                            ]).map((bucket, i) => (
                                                <div
                                                    key={bucket.label}
                                                    className={`flex flex-col items-center w-1/5 group h-full justify-end relative hover:z-30 transition-opacity duration-300 ${selectedAgingBucket && selectedAgingBucket !== bucket.bucket ? 'opacity-25' : 'opacity-100'} ${bucket.value > 0 ? 'cursor-pointer' : ''}`}
                                                    onClick={() => bucket.value > 0 && setSelectedAgingBucket(bucket.bucket)}
                                                    role={bucket.value > 0 ? 'button' : undefined}
                                                    aria-label={bucket.value > 0 ? `Ver clientes ${bucket.label}` : undefined}
                                                    tabIndex={bucket.value > 0 ? 0 : -1}
                                                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && bucket.value > 0 && setSelectedAgingBucket(bucket.bucket)}
                                                >
                                                    <div
                                                        className={`w-full ${bucket.color}/80 rounded-t-sm hover:brightness-110 shadow-sm relative group transition-[filter,transform] duration-300 ${selectedAgingBucket === bucket.bucket ? 'brightness-110 scale-x-105' : ''}`}
                                                        style={{
                                                            height: chartsReady ? `${(bucket.value / agingMax) * 100}%` : '0%',
                                                            minHeight: chartsReady && bucket.value > 0 ? '4px' : '0',
                                                            transition: `height 800ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 110}ms, filter 300ms, transform 300ms`,
                                                        }}
                                                    >
                                                        {bucket.value > 0 && (
                                                            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-gray-600 dark:text-gray-300 whitespace-nowrap pointer-events-none">
                                                                {formatCurrencyK(bucket.value)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="absolute -bottom-6 text-[9px] sm:text-[10px] text-gray-500 dark:text-gray-400 font-bold whitespace-nowrap text-center w-full px-1">
                                                        <span className="hidden sm:inline">{bucket.label}</span>
                                                        <span className="sm:hidden">{bucket.mobileLabel}</span>
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Top 5 Deudores */}
                                <div className="bg-white dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-5 md:p-6 flex flex-col">
                                    <h3 className="text-base font-semibold text-text-main dark:text-white mb-1">Top 5 Deudores Críticos</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">Clientes con mayores montos vencidos.</p>

                                    <div className="flex-1 space-y-4 md:space-y-5">
                                        {top5Debtors.length === 0 ? (
                                            <div className="py-8 text-center text-gray-400 text-sm">¡Sin deudas pendientes! 🎉</div>
                                        ) : (
                                            top5Debtors.map((client, idx) => (
                                                <button type="button" key={client.id} className="flex items-center gap-3 w-full text-left group" onClick={() => setSelectedClient(client)}>
                                                    <div className="size-6 md:size-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-[11px] font-bold text-gray-500 dark:text-gray-400 shrink-0 group-hover:bg-primary/20 transition-colors">
                                                        {idx + 1}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[13px] font-medium text-text-main dark:text-white truncate group-hover:text-primary transition-colors">{client.name}</p>
                                                    </div>
                                                    <span className="text-[13px] font-bold text-rose-600 dark:text-rose-500 shrink-0">
                                                        ${formatCurrency(client.current_debt)}
                                                    </span>
                                                </button>
                                            ))
                                        )}
                                    </div>

                                    <button
                                        onClick={() => document.getElementById('cartera-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                        className="mt-6 w-full bg-[#1a1a1a] dark:bg-gray-800 text-white py-2.5 rounded-lg text-xs font-bold hover:bg-black dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-1.5"
                                    >
                                        Ver Lista Completa <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                                    </button>
                                </div>
                            </div>
                    </div>

                    {/* ═══ CARTERA ═══ */}
                    <div id="cartera-section" className="space-y-4">
                            {/* Toolbar */}
                            <div className="bg-white dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm p-3 md:p-4 flex flex-col lg:flex-row items-center justify-between gap-4">
                                <div className="relative w-full lg:w-[350px]">
                                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">search</span>
                                    <input
                                        type="text"
                                        placeholder="Buscar cliente o factura..."
                                        value={monitorSearch}
                                        onChange={e => setMonitorSearch(e.target.value)}
                                        className="w-full h-10 pl-10 pr-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-text-main dark:text-white outline-none focus:border-gray-300 transition-colors shadow-sm"
                                    />
                                </div>
                                <div className="flex items-center gap-2 w-full lg:w-auto overflow-x-auto pb-1 lg:pb-0">
                                    {(['todos', 'vencidos', 'aldia'] as const).map(f => {
                                        const isSelected = monitorFilter === f;

                                        return (
                                            <button
                                                key={f}
                                                onClick={() => setMonitorFilter(f)}
                                                className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all border ${isSelected
                                                        ? 'bg-[#1a1a1a] text-white border-[#1a1a1a] shadow-md dark:bg-white dark:text-[#1a1a1a] dark:border-white'
                                                        : 'bg-white text-gray-500 border-gray-200 hover:text-gray-900 hover:border-gray-300 hover:bg-gray-50 dark:bg-[#1a1a1a] dark:text-gray-400 dark:border-gray-700 dark:hover:text-white dark:hover:bg-gray-800'
                                                    }`}
                                            >
                                                {f === 'todos' ? 'Todos' : f === 'vencidos' ? 'Solo Vencidos' : 'Al Día'}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Table */}
                            <div className="bg-white dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                                {/* Table Header */}
                                <div className="hidden lg:grid grid-cols-[1.5fr_1fr_1fr_1fr_auto_1.5fr] gap-4 px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-800/20 text-[10px] uppercase tracking-[0.1em] font-bold text-gray-500">
                                    <div>Cliente</div>
                                    <div>Vencimiento</div>
                                    <div className="text-center">Estado</div>
                                    <div className="text-right">Saldo Pendiente</div>
                                    <div className="text-center w-[80px]">Acción</div>
                                    <div className="text-right"></div>
                                </div>
                                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {monitorClients.map(client => {
                                        const isVencido = isClientVencido(client);
                                        const dueDate = getClientDueDate(client);
                                        const formattedDate = dueDate ? dueDate.toISOString().split('T')[0] : '—';

                                        let statusText = 'Al día';
                                        if (isVencido) {
                                            if (dueDate) {
                                                const today = new Date();
                                                today.setHours(0, 0, 0, 0);
                                                const d = new Date(dueDate);
                                                d.setHours(0, 0, 0, 0);
                                                const diffTime = today.getTime() - d.getTime();
                                                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                                statusText = diffDays > 0 ? `${diffDays} día${diffDays === 1 ? '' : 's'} venc.` : 'Vencido';
                                            } else {
                                                statusText = 'Vencido';
                                            }
                                        }

                                        return (
                                            <div key={client.id} className="group">
                                                {/* Mobile View */}
                                                <div className="lg:hidden px-4 py-4 flex flex-col gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                                                    <button type="button" className="flex justify-between items-start w-full text-left" onClick={() => setSelectedClient(client)}>
                                                        <div>
                                                            <p className="text-sm font-bold text-text-main dark:text-white">{client.name}</p>
                                                            <p className="text-[11px] text-gray-400 mt-0.5">Vencimiento: {formattedDate}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-sm font-black text-gray-900 dark:text-white">${formatCurrency(client.current_debt)}</p>
                                                            <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${isVencido ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                                {statusText}
                                                            </span>
                                                        </div>
                                                    </button>
                                                    <div className="flex justify-between items-center border-t border-gray-100 dark:border-gray-800 pt-3">
                                                        <div className="flex items-center gap-3">
                                                            <button onClick={(e) => handleWhatsAppClick(e, client)} className="text-[#25D366] hover:scale-110 transition-transform" aria-label="WhatsApp">
                                                                <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]">
                                                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a5.8 5.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                                                                </svg>
                                                            </button>
                                                            <button onClick={(e) => { e.stopPropagation(); setDebtEmailClient(client); }} className="text-gray-400 hover:text-blue-500 hover:scale-110 transition-all flex items-center justify-center p-1" aria-label="Email">
                                                                <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]">
                                                                    <path d="M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67z" />
                                                                    <path d="M22.5 6.908V6.75a3 3 0 00-3-3h-15a3 3 0 00-3 3v.158l9.714 5.978a1.5 1.5 0 001.572 0L22.5 6.908z" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                        <button onClick={(e) => { e.stopPropagation(); setSelectedClient(client); }} className="group/btn flex items-center gap-1.5">
                                                            <span className="text-[12px] font-bold text-gray-900 dark:text-white underline decoration-gray-300 group-hover/btn:decoration-gray-900 dark:decoration-gray-600 dark:group-hover/btn:decoration-white underline-offset-4 transition-all pb-1">Ver movimientos</span>
                                                            <span className="material-symbols-outlined text-[14px] text-gray-400 group-hover/btn:translate-x-0.5 transition-transform pb-1">arrow_forward</span>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Desktop View */}
                                                <div className="hidden lg:grid grid-cols-[1.5fr_1fr_1fr_1fr_auto_1.5fr] gap-4 px-6 py-4 items-center hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors cursor-pointer" onClick={() => setSelectedClient(client)}>
                                                    <p className="text-sm font-bold text-text-main dark:text-white truncate">{client.name}</p>
                                                    <p className="text-[13px] text-gray-500 dark:text-gray-400">{formattedDate}</p>
                                                    <div className="flex justify-center">
                                                        <span className={`px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${isVencido ? 'bg-[#fef2f2] text-[#ef4444] border border-[#fecaca]' : 'bg-[#ecfdf5] text-[#10b981] border border-[#a7f3d0]'}`}>
                                                            {statusText}
                                                        </span>
                                                    </div>
                                                    <p className="text-[14px] font-black text-right text-gray-900 dark:text-white">${formatCurrency(client.current_debt)}</p>
                                                    <div className="flex items-center justify-center gap-2.5 w-[80px]">
                                                        <button onClick={(e) => handleWhatsAppClick(e, client)} title="WhatsApp" className="text-[#25D366] hover:scale-110 transition-transform">
                                                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]">
                                                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a5.8 5.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                                                            </svg>
                                                        </button>
                                                        <button onClick={(e) => { e.stopPropagation(); setDebtEmailClient(client); }} title="Enviar recordatorio por correo" className="text-gray-400 hover:text-blue-500 hover:scale-110 transition-all flex items-center justify-center p-1">
                                                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-[18px] h-[18px]">
                                                                <path d="M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67z" />
                                                                <path d="M22.5 6.908V6.75a3 3 0 00-3-3h-15a3 3 0 00-3 3v.158l9.714 5.978a1.5 1.5 0 001.572 0L22.5 6.908z" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                    <div className="flex justify-end">
                                                        <button onClick={(e) => { e.stopPropagation(); setSelectedClient(client); }} className="group/btn flex items-center gap-1.5">
                                                            <span className="text-[12px] font-bold text-gray-900 dark:text-white underline decoration-gray-300 group-hover/btn:decoration-gray-900 dark:decoration-gray-600 dark:group-hover/btn:decoration-white underline-offset-4 transition-all">
                                                                Ver movimientos
                                                            </span>
                                                            <span className="material-symbols-outlined text-[15px] text-gray-400 dark:text-gray-500 group-hover/btn:translate-x-0.5 transition-transform">arrow_forward</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {monitorClients.length === 0 && (
                                        <div className="px-6 py-16 text-center text-gray-400 text-sm">
                                            <span className="material-symbols-outlined text-4xl block mb-2 opacity-50">search_off</span>
                                            <p>No se encontraron registros</p>
                                        </div>
                                    )}
                                </div>
                                {/* Footer */}
                                <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-surface-dark flex items-center justify-between">
                                    <p className="text-[13px] text-gray-500">Mostrando {monitorClients.length} registros</p>
                                    <p className="text-[13px] text-gray-500">
                                        Total en vista: <span className="font-black text-gray-900 dark:text-white ml-1">${formatCurrency(monitorClients.reduce((s, c) => s + c.current_debt, 0))}</span>
                                    </p>
                                </div>
                            </div>
                    </div>



                </div>
            </div>

            {/* Client Detail Overlay / Sidebar */}
            {selectedClient && (
                <div className="fixed inset-0 md:left-[var(--sidebar-w,15rem)] z-[56] animate-[fadeIn_0.2s_ease-out]">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" role="button" tabIndex={-1} onClick={handleCloseClientDetail} onKeyDown={(e) => e.key === 'Escape' && handleCloseClientDetail()} aria-label="Cerrar"></div>

                    {/* Full screen small mobile / Sidebar for larger screens */}
                    <div className="relative min-[767px]:absolute min-[767px]:right-0 min-[767px]:top-0 min-[767px]:bottom-0 min-[767px]:w-[480px] min-[767px]:max-w-[calc(100%-3rem)] bg-surface-light dark:bg-surface-dark w-full h-full min-[767px]:border-l flex flex-col shadow-2xl border-0 border-gray-200 dark:border-gray-700 overflow-hidden min-[767px]:animate-[slideInRight_0.3s_ease-out]">

                        {/* ── INFO DEL CLIENTE ── */}
                        <div className="flex flex-col border-gray-100 dark:border-gray-800 bg-white dark:bg-surface-dark shrink-0">

                            {/* Header: flecha atrás + nombre + Editar */}
                            <div className="px-4 py-3 md:px-5 md:py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <button
                                            onClick={handleCloseClientDetail}
                                            className="size-8 flex items-center justify-center rounded-full text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
                                            aria-label="Volver"
                                        >
                                            <span className="material-symbols-outlined text-xl">arrow_back</span>
                                        </button>
                                        <h2 className="text-base font-semibold text-gray-900 dark:text-white leading-tight truncate">{selectedClient.name}</h2>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button
                                            onClick={() => handleDeleteClient(selectedClient)}
                                            className="px-2.5 h-7 text-[10px] font-bold text-red-500 hover:text-white hover:bg-red-500 transition-colors bg-red-50 dark:bg-red-900/20 dark:hover:bg-red-600 rounded-full border border-red-200 dark:border-red-800"
                                            title="Eliminar cliente"
                                        >
                                            Eliminar
                                        </button>
                                        <button
                                            onClick={() => {
                                                setClientToEdit(selectedClient);
                                                setNewClientLimit(formatNumber(selectedClient.credit_limit.toString()));
                                                setShowNewClientModal(true);
                                            }}
                                            className="px-2.5 h-7 text-[10px] font-bold text-gray-500 hover:text-primary transition-colors bg-gray-50 dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700"
                                            title="Editar información"
                                        >
                                            Editar
                                        </button>
                                    </div>
                                </div>
                                {/* Datos de contacto */}
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                                    {selectedClient.phone && (
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[12px]">call</span>
                                            {selectedClient.phone}
                                        </p>
                                    )}
                                    {selectedClient.email && (
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1 truncate">
                                            <span className="material-symbols-outlined text-[12px]">mail</span>
                                            {selectedClient.email}
                                        </p>
                                    )}
                                    {selectedClient.id_number && (
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[12px]">badge</span>
                                            {selectedClient.id_number}
                                        </p>
                                    )}
                                    {selectedClient.address && (
                                        <p className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1 truncate">
                                            <span className="material-symbols-outlined text-[12px]">location_on</span>
                                            {selectedClient.address}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Balance Cards - stacked on desktop for legibility */}
                            <div className="px-4 py-3 md:px-5 grid grid-cols-2 gap-2 bg-gray-50/50 dark:bg-black/20 shrink-0">
                                <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 p-3 rounded-xl relative overflow-hidden">
                                    <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wide relative z-10">Deuda Actual</p>
                                    <p className="text-xl font-black text-red-700 dark:text-red-400 mt-0.5 relative z-10">${formatCurrency(selectedClient.current_debt)}</p>
                                </div>
                                <div className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-3 rounded-xl relative overflow-hidden">
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Abonos</p>
                                    <p className="text-xl font-black text-green-600 dark:text-green-400 mt-0.5">
                                        ${formatCurrency(selectedClient.transactions?.filter(t => t.type === 'payment').reduce((s, t) => s + t.amount, 0) ?? 0)}
                                    </p>
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="px-4 md:px-5 flex gap-2 py-3 shrink-0">
                                <button
                                    onClick={() => { setTransactionAmount(''); setShowTransactionModal('debt'); }}
                                    className="group flex-1 h-11 bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 hover:border-red-200 dark:hover:border-red-900/50 hover:bg-red-50/50 dark:hover:bg-red-900/10 text-gray-700 dark:text-gray-200 rounded-xl transition-all flex items-center justify-center gap-2"
                                >
                                    <div className="size-6 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                                        <span className="material-symbols-outlined text-sm">remove</span>
                                    </div>
                                    <div className="flex flex-col items-start leading-none">
                                        <span className="text-[8px] font-bold text-gray-400 uppercase tracking-wide">Registrar</span>
                                        <span className="text-xs font-black text-gray-800 dark:text-gray-100 group-hover:text-red-600 dark:group-hover:text-red-400">Deuda</span>
                                    </div>
                                </button>
                                <button
                                    onClick={() => { setTransactionAmount(''); setShowTransactionModal('payment'); }}
                                    className="group flex-1 h-11 bg-primary hover:bg-primary-hover text-[#102218] rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5"
                                >
                                    <div className="size-6 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                                        <span className="material-symbols-outlined text-sm">add</span>
                                    </div>
                                    <div className="flex flex-col items-start leading-none">
                                        <span className="text-[8px] font-bold text-[#102218]/80 uppercase tracking-wide">Registrar</span>
                                        <span className="text-xs font-black">Abono</span>
                                    </div>
                                </button>
                            </div>


                        </div>

                        {/* ── HISTORIAL DE MOVIMIENTOS ── */}
                        <div className="flex-1 flex flex-col min-h-0">
                            <div className="px-4 py-3 md:px-6 md:py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-surface-dark shrink-0">
                                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 text-xs md:text-sm uppercase tracking-wide">
                                    <span className="material-symbols-outlined text-gray-400 text-lg">history</span>
                                    Historial de Movimientos
                                    <span className="ml-1 text-[10px] font-bold bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full">
                                        {selectedClient.transactions?.length ?? 0}
                                    </span>
                                </h3>
                                <div className="flex items-center gap-1">
                                    {(selectedClient.transactions?.length ?? 0) > 0 && (
                                        <>
                                            {/* Móvil: Compartir URL */}
                                            <button
                                                onClick={async () => {
                                                    const token = selectedClient.id.replace(/-/g, '').substring(0, 12);
                                                    const url = `${window.location.origin}/ch/${token}`;
                                                    if (navigator.share) {
                                                        try {
                                                            await navigator.share({ url, title: `Historial de ${selectedClient.name}` });
                                                            return;
                                                        } catch (e) {
                                                            if ((e as Error).name === 'AbortError') return;
                                                        }
                                                    }
                                                    await navigator.clipboard.writeText(url).catch(() => {});
                                                    showToast('Enlace copiado', 'success');
                                                }}
                                                className="md:hidden size-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                title="Compartir historial"
                                                aria-label="Compartir historial"
                                            >
                                                <span className="material-symbols-outlined text-lg">share</span>
                                            </button>
                                            {/* Desktop: WhatsApp → abre chat con URL */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const token = selectedClient.id.replace(/-/g, '').substring(0, 12);
                                                    const url = `${window.location.origin}/ch/${token}`;
                                                    const rawPhone = (selectedClient.phone || '').replace(/\D/g, '');
                                                    const phone = rawPhone ? (rawPhone.startsWith('57') ? rawPhone : `57${rawPhone}`) : '';
                                                    const phoneParam = phone ? `phone=${phone}&` : '';
                                                    const message = encodeURIComponent(`Hola ${selectedClient.name}, aquí puedes ver el historial de tu cuenta en *${businessName}*:\n${url}`);
                                                    const nativeUrl = `whatsapp://send?${phoneParam}text=${message}`;
                                                    const webUrl = `https://web.whatsapp.com/send?${phoneParam}text=${message}`;
                                                    let appOpened = false;
                                                    const handleBlur = () => { appOpened = true; };
                                                    window.addEventListener('blur', handleBlur);
                                                    window.location.href = nativeUrl;
                                                    setTimeout(() => {
                                                        window.removeEventListener('blur', handleBlur);
                                                        if (!appOpened) {
                                                            const w = 800, h = 600;
                                                            window.open(webUrl, 'WhatsApp', `width=${w},height=${h},left=${(window.innerWidth - w) / 2},top=${(window.innerHeight - h) / 2},scrollbars=yes,resizable=yes`);
                                                        }
                                                    }, 1500);
                                                }}
                                                className="hidden md:flex items-center gap-1 h-8 px-2.5 rounded-lg text-[#25D366] hover:bg-[#25D366]/10 transition-colors"
                                                title="Compartir historial por WhatsApp"
                                                aria-label="Enviar historial por WhatsApp"
                                            >
                                                <svg viewBox="0 0 24 24" fill="currentColor" className="size-4">
                                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.489-1.761-1.663-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a5.8 5.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                                                </svg>
                                                <span className="text-xs font-semibold">WhatsApp</span>
                                            </button>
                                            {/* Desktop: Descargar PDF con texto */}
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await downloadTransactionHistoryPDF(selectedClient.name, selectedClient.current_debt, selectedClient.transactions || [], businessName);
                                                    } catch {
                                                        showToast('Error al generar el PDF', 'error');
                                                    }
                                                }}
                                                className="hidden md:flex items-center gap-1 h-8 px-2.5 rounded-lg text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                title="Descargar PDF"
                                                aria-label="Descargar PDF"
                                            >
                                                <span className="material-symbols-outlined text-lg">download</span>
                                                <span className="text-xs font-semibold">Descargar</span>
                                            </button>
                                            <button
                                                onClick={() => setShowClearConfirm(true)}
                                                className="text-xs text-red-500 hover:text-red-600 font-bold transition-colors ml-1"
                                            >
                                                Limpiar
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-5">
                                <div className="space-y-2">
                                    {(selectedClient.transactions || [])
                                        .slice()
                                        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                        .map((tx) => {
                                            const hasProducts = tx.order_items && tx.order_items.length > 0;
                                            const noteParts = tx.note?.split(' · ');
                                            const creditNote = noteParts && noteParts.length > 1 ? noteParts.slice(1).join(' · ') : null;
                                            const fallbackNote = !hasProducts ? tx.note : null;
                                            return (
                                                <div key={tx.id} className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600 transition-colors">
                                                    <div className="flex items-center gap-2.5 mb-1.5">
                                                        <div className={`size-7 rounded-full flex items-center justify-center shrink-0 ${tx.type === 'payment'
                                                            ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                                                            : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                                            }`}>
                                                            <span className="material-symbols-outlined text-sm">
                                                                {tx.type === 'payment' ? 'savings' : 'receipt'}
                                                            </span>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            {tx.type === 'payment' && (
                                                                <span className="text-[10px] font-bold uppercase tracking-wide text-green-600 dark:text-green-400">Abono</span>
                                                            )}
                                                            <p className="text-[10px] text-gray-400">{formatDateInTz(tx.created_at, timezone, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                                        </div>
                                                        <span className={`font-black text-sm shrink-0 ${tx.type === 'payment' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                            {tx.type === 'payment' ? '+' : '-'}${formatCurrency(tx.amount)}
                                                        </span>
                                                        <button
                                                            onClick={async () => {
                                                                const isPayment = tx.type === 'payment';
                                                                const confirmed = await confirmAction({
                                                                    title: isPayment ? '¿Eliminar este abono?' : '¿Eliminar esta deuda?',
                                                                    message: isPayment
                                                                        ? `Se eliminará el abono de $${formatCurrency(tx.amount)} y se sumará de vuelta a la deuda del cliente.`
                                                                        : `Se eliminará la deuda de $${formatCurrency(tx.amount)} y se restará del saldo del cliente.`,
                                                                    confirmText: 'Eliminar',
                                                                    variant: 'danger',
                                                                });
                                                                if (!confirmed) return;
                                                                try {
                                                                    await deleteTransaction(tx.id);
                                                                    if (isPayment && activeShift) {
                                                                        await reverseCashMovement(tx.amount, '', 'out');
                                                                        window.dispatchEvent(new CustomEvent('payment-reversed'));
                                                                    }
                                                                    showToast(isPayment ? 'Abono eliminado' : 'Deuda eliminada', 'success');
                                                                } catch {
                                                                    showToast(isPayment ? 'Error al eliminar el abono' : 'Error al eliminar la deuda', 'error');
                                                                }
                                                            }}
                                                            className="size-6 flex items-center justify-center rounded-full text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                                                            aria-label={tx.type === 'payment' ? 'Eliminar abono' : 'Eliminar deuda'}
                                                        >
                                                            <span className="material-symbols-outlined text-sm">delete</span>
                                                        </button>
                                                    </div>
                                                    <div className="pl-[38px] space-y-0.5">
                                                        {hasProducts && tx.order_items!.map((item, idx) => {
                                                            const itemCanceled = item.status === 'canceled';
                                                            return (
                                                            <div key={`orderitem-${idx}`} className="flex items-baseline justify-between gap-2">
                                                                <p className={`text-xs truncate ${itemCanceled ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-300'}`}>
                                                                    <span className="font-bold text-gray-400 mr-1">{item.quantity}×</span>
                                                                    {item.product_name}{itemCanceled ? ' (anulado)' : ''}
                                                                </p>
                                                                <span className={`text-[10px] shrink-0 text-gray-400 ${itemCanceled ? 'line-through' : ''}`}>${formatCurrency(item.unit_price * item.quantity)}</span>
                                                            </div>
                                                            );
                                                        })}
                                                        {creditNote && (
                                                            <p className="text-[10px] text-gray-400 italic border-t border-gray-100 dark:border-gray-700/50 pt-1 mt-1">
                                                                "{creditNote}"
                                                            </p>
                                                        )}
                                                        {!hasProducts && fallbackNote && !creditNote && (
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{fallbackNote}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    {(!selectedClient.transactions || selectedClient.transactions.length === 0) && (
                                        <div className="flex flex-col items-center justify-center py-16 opacity-40">
                                            <span className="material-symbols-outlined text-5xl text-gray-300 dark:text-gray-600 mb-3">receipt_long</span>
                                            <p className="text-gray-400 text-sm">No hay movimientos registrados.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {/* New Client Modal */}
            {
                showNewClientModal && (
                    <div className="fixed inset-0 md:left-[var(--sidebar-w,15rem)] z-[60] flex items-end md:items-center justify-center md:p-4 animate-[fadeIn_0.2s_ease-out]">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" role="button" tabIndex={-1} onClick={() => setShowNewClientModal(false)} onKeyDown={(e) => e.key === 'Escape' && setShowNewClientModal(false)} aria-label="Cerrar"></div>
                        <div className="relative bg-white dark:bg-surface-dark md:rounded-2xl rounded-t-3xl w-full max-w-sm p-6 shadow-2xl border border-gray-200 dark:border-gray-700 animate-[slideUp_0.3s_ease-out] md:animate-none">
                            <div className="flex justify-between items-start mb-6">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    {clientToEdit ? 'Editar Información' : 'Registrar Nuevo Cliente'}
                                </h3>
                                <button
                                    onClick={() => setShowNewClientModal(false)}
                                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                >
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            <form onSubmit={handleClientFormSubmit} className="space-y-4">
                                <div>
                                    <label htmlFor="client-name" className="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre Completo <span className="text-red-500">*</span></label>
                                    <input
                                        id="client-name"
                                        name="name"
                                        type="text"
                                        required
                                        className="w-full h-11 px-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-text-main dark:text-white text-sm focus:ring-2 focus:ring-primary focus:border-primary transition-colors outline-none"
                                        placeholder="Ej: Juan Pérez"
                                        defaultValue={clientToEdit?.name}
                                        autoFocus
                                    />
                                </div>

                                <div>
                                    <label htmlFor="client-id-number" className="block text-xs font-bold text-gray-500 uppercase mb-1">Número de Identificación <span className="text-red-500">*</span></label>
                                    <input
                                        id="client-id-number"
                                        name="id_number"
                                        type="text"
                                        required
                                        className="w-full h-11 px-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-text-main dark:text-white text-sm focus:ring-2 focus:ring-primary focus:border-primary transition-colors outline-none"
                                        placeholder="Ej: 1234567890"
                                        defaultValue={clientToEdit?.id_number}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Teléfono <span className="text-red-500">*</span></label>
                                    <PhoneInput
                                        name="phone"
                                        defaultValue={clientToEdit?.phone ?? ''}
                                        required
                                    />
                                </div>

                                <div>
                                    <label htmlFor="client-email" className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
                                    <input
                                        id="client-email"
                                        name="email"
                                        type="email"
                                        className="w-full h-11 px-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-text-main dark:text-white text-sm focus:ring-2 focus:ring-primary focus:border-primary transition-colors outline-none"
                                        placeholder="Ej: cliente@email.com"
                                        defaultValue={clientToEdit?.email}
                                    />
                                </div>

                                <div>
                                    <label htmlFor="client-address" className="block text-xs font-bold text-gray-500 uppercase mb-1">Dirección</label>
                                    <input
                                        id="client-address"
                                        name="address"
                                        type="text"
                                        className="w-full h-11 px-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-text-main dark:text-white text-sm focus:ring-2 focus:ring-primary focus:border-primary transition-colors outline-none"
                                        placeholder="Ej: Calle 123 #45-67"
                                        defaultValue={clientToEdit?.address}
                                    />
                                </div>

                                <div>
                                    <label htmlFor="credit-limit" className="block text-xs font-bold text-gray-500 uppercase mb-1">Cupo de Crédito</label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 font-bold">$</span>
                                        <input
                                            id="credit-limit"
                                            name="limit"
                                            type="text"
                                            inputMode="numeric"
                                            aria-label="Cupo de Crédito"
                                            value={newClientLimit}
                                            onChange={(e) => setNewClientLimit(formatNumber(e.target.value))}
                                            className="w-full h-11 pl-7 pr-4 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-text-main dark:text-white text-sm font-bold focus:ring-2 focus:ring-primary focus:border-primary transition-colors outline-none"
                                            placeholder="0"
                                        />
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-1">Límite máximo que se le puede fiar.</p>
                                </div>

                                <div className="pt-4">
                                    <AppButton
                                        type="submit"
                                        isLoading={isSavingClient}
                                        className="w-full h-12 bg-primary hover:bg-primary-hover text-[#102218] font-bold rounded-xl shadow-md shadow-primary/20 transition-all flex items-center justify-center"
                                    >
                                        {clientToEdit ? 'Actualizar Cliente' : 'Guardar Cliente'}
                                    </AppButton>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Add Transaction Modal */}
            {
                showTransactionModal && (
                    <div className="fixed inset-0 md:left-[var(--sidebar-w,15rem)] z-[60] flex items-end md:items-center justify-center md:p-4 animate-[fadeIn_0.2s_ease-out]">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" role="button" tabIndex={-1} onClick={() => setShowTransactionModal(null)} onKeyDown={(e) => e.key === 'Escape' && setShowTransactionModal(null)} aria-label="Cerrar"></div>
                        <div className="relative bg-white dark:bg-surface-dark md:rounded-2xl rounded-t-3xl w-full max-w-sm p-6 shadow-2xl border border-gray-200 dark:border-gray-700 animate-[slideUp_0.3s_ease-out] md:animate-none">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                                {showTransactionModal === 'debt' ? 'Agregar Nueva Deuda' : 'Registrar Abono'}
                            </h3>
                            <p className="text-sm text-gray-500 mb-6">Para: <span className="font-bold text-text-main dark:text-white">{selectedClient?.name}</span></p>

                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    const formData = new FormData(e.currentTarget);
                                    const note = formData.get('note') as string;
                                    const dueDateStr = formData.get('dueDate') as string;
                                    let dueDate;
                                    if (showTransactionModal === 'debt' && dueDateStr) {
                                        const d = new Date(dueDateStr + 'T12:00:00');
                                        dueDate = d.toISOString();
                                    }
                                    handleAddTransaction(note, dueDate);
                                }}
                                className="space-y-4"
                            >
                                <div>
                                    <label htmlFor="transaction-amount" className="block text-xs font-bold text-gray-500 uppercase mb-1">Monto</label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 font-bold">$</span>
                                        <input
                                            id="transaction-amount"
                                            name="amount"
                                            type="text"
                                            autoFocus
                                            required
                                            value={transactionAmount}
                                            onChange={(e) => setTransactionAmount(formatNumber(e.target.value))}
                                            className="w-full h-12 pl-7 pr-4 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-text-main dark:text-white text-lg font-bold focus:ring-2 focus:ring-primary focus:border-primary transition-colors outline-none"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="transaction-note" className="block text-xs font-bold text-gray-500 uppercase mb-1">Descripción</label>
                                    <input
                                        id="transaction-note"
                                        name="note"
                                        type="text"
                                        className="w-full h-11 px-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-text-main dark:text-white text-sm focus:ring-2 focus:ring-primary focus:border-primary transition-colors outline-none"
                                        placeholder={showTransactionModal === 'debt' ? "Ej: Compra de almuerzo" : "Ej: Pago en efectivo"}
                                    />
                                </div>
                                {showTransactionModal === 'debt' && (
                                    <div>
                                        <label htmlFor="transaction-due-date" className="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha de pago <span className="text-red-500">*</span></label>
                                        <input
                                            id="transaction-due-date"
                                            name="dueDate"
                                            type="date"
                                            required
                                            className="w-full h-11 px-3 text-gray-400 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-text-main dark:text-white text-sm focus:ring-2 focus:ring-primary focus:border-primary transition-colors outline-none"
                                        />
                                    </div>
                                )}
                                {showTransactionModal === 'payment' && activeShift && (
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Medio de pago</label>
                                        <div className="grid grid-cols-3 gap-1.5">
                                            {paymentMethods.map(m => (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    onClick={() => setSelectedPaymentMethod(m)}
                                                    className={`py-2 px-1 rounded-lg border text-xs font-bold transition-all truncate ${selectedPaymentMethod === m
                                                            ? 'border-[#009459] bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                                                            : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300 dark:hover:border-gray-600'
                                                        }`}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {showTransactionModal === 'payment' && !activeShift && (
                                    <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-3 py-2.5 text-sm text-amber-800 dark:text-amber-300">
                                        <span className="material-symbols-outlined text-base shrink-0 mt-0.5">warning</span>
                                        <span>No hay turno activo. El abono quedará registrado en la deuda del cliente, pero <strong>no entrará a la caja</strong>. Abre un turno antes si necesitas cuadrar el efectivo.</span>
                                    </div>
                                )}
                                <div className="flex gap-3 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowTransactionModal(null)}
                                        className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmittingTransaction || parseNumber(transactionAmount) <= 0 || (showTransactionModal === 'payment' && !!activeShift && !selectedPaymentMethod)}
                                        className={`flex-1 py-3 text-white font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 ${showTransactionModal === 'debt'
                                            ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20'
                                            : 'bg-green-600 hover:bg-green-700 shadow-green-600/20'
                                            } ${isSubmittingTransaction || parseNumber(transactionAmount) <= 0 || (showTransactionModal === 'payment' && !!activeShift && !selectedPaymentMethod) ? 'opacity-70 cursor-not-allowed' : ''}`}
                                    >
                                        {isSubmittingTransaction ? (
                                            <><svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Procesando...</>
                                        ) : 'Confirmar'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Clear History Confirmation Modal */}
            {
                showClearConfirm && selectedClient && (
                    <div className="fixed inset-0 md:left-[var(--sidebar-w,15rem)] z-[70] flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" role="button" tabIndex={-1} onClick={() => setShowClearConfirm(false)} onKeyDown={(e) => e.key === 'Escape' && setShowClearConfirm(false)} aria-label="Cerrar"></div>
                        <div className="relative bg-white dark:bg-surface-dark rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-gray-200 dark:border-gray-700">
                            <div className="text-center">
                                <div className="size-14 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                                    <span className="material-symbols-outlined text-3xl text-red-600 dark:text-red-400">delete_forever</span>
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">¿Limpiar historial?</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                                    Se eliminarán todos los movimientos de <span className="font-bold text-gray-700 dark:text-gray-200">{selectedClient.name}</span> y la deuda se reiniciará a $0. Esta acción no se puede deshacer.
                                </p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowClearConfirm(false)}
                                        className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={async () => {
                                            try {
                                                await clearTransactions(selectedClient.id);
                                                setShowClearConfirm(false);
                                            } catch (error) {
                                                console.error('Error clearing history:', error);
                                                showToast('Error al limpiar el historial', 'error');
                                            }
                                        }}
                                        className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md shadow-red-600/20 transition-colors"
                                    >
                                        Limpiar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* ── BOTTOM SHEET: Clientes por rango de antigüedad ── */}
            {selectedAgingBucket && agingSheetInfo && (
                <div
                    className="fixed inset-0 md:left-[var(--sidebar-w,15rem)] z-[65]"
                    role="button"
                    tabIndex={-1}
                    onClick={() => setSelectedAgingBucket(null)}
                    onKeyDown={(e) => e.key === 'Escape' && setSelectedAgingBucket(null)}
                    aria-label="Cerrar panel"
                >
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
                    <div
                        ref={sheetRef}
                        className="absolute bottom-0 left-0 right-0 rounded-t-2xl max-h-[75vh] animate-[slideUp_0.25s_ease-out] md:bottom-0 md:top-0 md:left-auto md:right-0 md:w-[420px] md:max-h-none md:rounded-none md:rounded-l-2xl md:animate-[slideInRight_0.3s_ease-out] bg-white dark:bg-surface-dark shadow-2xl flex flex-col"
                        style={sheetDragY > 0 ? { transform: `translateY(${sheetDragY}px)`, transition: 'none' } : { transition: 'transform 0.3s ease' }}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-label={agingSheetInfo.title}
                    >
                        {/* Handle — solo en móvil */}
                        <div className="flex md:hidden justify-center pt-3 pb-1 shrink-0">
                            <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
                        </div>

                        {/* Header */}
                        <div className="px-5 pt-2 md:pt-5 pb-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="size-3 rounded-full shrink-0" style={{ backgroundColor: agingSheetInfo.color }} />
                                    <h3 className={`text-[15px] font-bold ${agingSheetInfo.textCls}`}>{agingSheetInfo.title}</h3>
                                </div>
                                <button
                                    onClick={() => setSelectedAgingBucket(null)}
                                    className="size-7 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    aria-label="Cerrar"
                                >
                                    <span className="material-symbols-outlined text-[16px] text-gray-500">close</span>
                                </button>
                            </div>
                            <div className="flex items-baseline gap-3 mt-2">
                                <span className="text-[22px] font-black text-text-main dark:text-white">
                                    ${formatCurrency(agingSheetClients.reduce((s, c) => s + c.current_debt, 0))}
                                </span>
                                <span className="text-[12px] text-gray-500">
                                    {agingSheetClients.length} {agingSheetClients.length === 1 ? 'cliente' : 'clientes'}
                                </span>
                            </div>
                        </div>

                        {/* Lista de clientes */}
                        <div className="flex-1 overflow-y-auto">
                            {agingSheetClients.length === 0 ? (
                                <div className="py-12 text-center text-gray-400 text-sm">No hay clientes en este rango</div>
                            ) : (
                                agingSheetClients.map(client => {
                                    const diff = getClientDiffDays(client);
                                    return (
                                        <div
                                            key={client.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => { setAgingBucketOrigin(selectedAgingBucket); setSelectedAgingBucket(null); setSelectedClient(client); }}
                                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (setAgingBucketOrigin(selectedAgingBucket), setSelectedAgingBucket(null), setSelectedClient(client))}
                                            className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-50 dark:border-gray-800/60 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                                        >
                                            <div className="size-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-[13px] font-bold text-gray-600 dark:text-gray-300 shrink-0 uppercase">
                                                {client.name.charAt(0)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[14px] font-semibold text-text-main dark:text-white truncate">{client.name}</p>
                                                <p className="text-[12px] text-gray-500">
                                                    {selectedAgingBucket === 'current'
                                                        ? 'Al día'
                                                        : `${diff} día${diff !== 1 ? 's' : ''} vencido`}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <span className={`text-[14px] font-bold ${selectedAgingBucket === 'current' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-500'}`}>
                                                    ${formatCurrency(client.current_debt)}
                                                </span>
                                                {client.phone && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleWhatsAppClick(e, client); }}
                                                        className="size-8 flex items-center justify-center rounded-lg bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
                                                        aria-label={`WhatsApp ${client.name}`}
                                                    >
                                                        <svg className="size-4 text-green-600 dark:text-green-400" viewBox="0 0 24 24" fill="currentColor">
                                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zm-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884z" />
                                                        </svg>
                                                    </button>
                                                )}
                                                <span className="material-symbols-outlined text-[16px] text-gray-400">arrow_forward_ios</span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}

            <EmailReceiptModal
                isOpen={debtEmailClient !== null}
                onClose={() => setDebtEmailClient(null)}
                onSend={handleSendDebtEmail}
            />
        </div >
    );
};
