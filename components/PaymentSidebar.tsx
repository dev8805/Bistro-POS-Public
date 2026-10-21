import React, { useState, useEffect, useRef } from 'react';
import { TransactionDetails } from '../types';
import { CreateClientModal, ClientData } from './CreateClientModal';
import { useClients } from '../hooks/useClients';
import { useCashRegister } from '../hooks/useCashRegister';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { usePermissions } from '../hooks/usePermissions';
import { formatCurrency } from '../lib/formatters';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

interface PaymentSidebarProps {
    total: number;
    onProcessPayment: (details: TransactionDetails) => void;
    onBack: () => void;
    tableId?: string; // Pass table ID for order tracking
    onConfirmOrder?: () => void; // Confirm order to notify kitchen
    deliveryClientName?: string; // Pre-assigned client for delivery orders
    saleOrigin?: 'tables' | 'orders' | 'scanner'; // Where the sale originated from
    showInlineBack?: boolean; // Muestra la flecha de volver en la fila de tabs (modo catálogo)
}

export const PaymentSidebar: React.FC<PaymentSidebarProps> = ({ total, onProcessPayment, onBack, tableId, onConfirmOrder, deliveryClientName, saleOrigin = 'tables', showInlineBack = false }) => {
    const { clients, createClient, addPayment, updateClient } = useClients();
    const { addCashIn, activeShift } = useCashRegister();
    const { showToast } = useToast();
    const { profile } = useAuth();
    const { canFinalizeSale } = usePermissions();
    const canSell = canFinalizeSale();
    const isAdmin = profile?.role === 'Administrador';
    const [method, setMethod] = useState('');
    const [paymentMode, setPaymentMode] = useState<'payment' | 'credit'>('payment');
    const cashSectionRef = useRef<HTMLDivElement>(null);
    const cashInputRef = useRef<HTMLInputElement>(null);
    const creditDateInputRef = useRef<HTMLInputElement>(null);
    const sidebarRef = useRef<HTMLDivElement>(null);
    const mixedSectionRef = useRef<HTMLDivElement>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [kbIndex, setKbIndex] = useState(-1);

    useEffect(() => {
        setTimeout(() => sidebarRef.current?.focus(), 100);
    }, []);

    useEffect(() => {
        if (method === 'Efectivo' && cashSectionRef.current) {
            setTimeout(() => {
                cashSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
                cashInputRef.current?.focus();
            }, 50);
        }
    }, [method]);

    const [cashGiven, setCashGiven] = useState<string>('');
    const { paymentMethods, updatePaymentMethods } = useBusinessSettings();
    const [isAddingMethod, setIsAddingMethod] = useState(false);
    const [isEditingMethods, setIsEditingMethods] = useState(false);
    const [newMethodName, setNewMethodName] = useState('');
    const [editingMethod, setEditingMethod] = useState<{ index: number; value: string } | null>(null);

    const [discount, setDiscount] = useState<string>('');
    const [discountPercent, setDiscountPercent] = useState<string>('');
    const [creditNote, setCreditNote] = useState<string>('');
    const [creditDueDate, setCreditDueDate] = useState<string>('');
    const [creditAbonoAmount, setCreditAbonoAmount] = useState<string>('');
    const [creditAbonoNote, setCreditAbonoNote] = useState<string>('');
    const [creditAbonoPaymentMethod, setCreditAbonoPaymentMethod] = useState<string>('');

    const [isMixedPayment, setIsMixedPayment] = useState(false);
    const [mixedAmounts, setMixedAmounts] = useState<Record<string, string>>({});

    useEffect(() => {
        if (isMixedPayment && mixedSectionRef.current) {
            setTimeout(() => {
                mixedSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
            }, 100);
        }
    }, [isMixedPayment]);

    // Client State - now with real client object
    const [showCreateClientModal, setShowCreateClientModal] = useState(false);
    const [showClientDropdown, setShowClientDropdown] = useState(false);
    const [clientSearch, setClientSearch] = useState('');
    const [selectedClient, setSelectedClient] = useState<{ id: string; name: string; id_number?: string; phone?: string } | null>(null);
    const [highlightedClientIndex, setHighlightedClientIndex] = useState(-1);

    // Inline client edit state
    const [isEditingClient, setIsEditingClient] = useState(false);
    const [editClientForm, setEditClientForm] = useState({ name: '', phone: '', address: '' });
    const [isSavingClient, setIsSavingClient] = useState(false);

    const handleOpenEditClient = () => {
        if (!selectedClient) return;
        const found = clients.find(c => c.id === selectedClient.id);
        setEditClientForm({
            name: selectedClient.name,
            phone: found?.phone || '',
            address: found?.address || '',
        });
        setIsEditingClient(true);
    };

    const handleSaveEditClient = async () => {
        if (!selectedClient?.id || !editClientForm.name.trim() || isSavingClient) return;
        setIsSavingClient(true);
        try {
            await updateClient(selectedClient.id, {
                name: editClientForm.name.trim(),
                phone: editClientForm.phone.trim() || undefined,
                address: editClientForm.address.trim() || undefined,
            });
            setSelectedClient(prev => prev ? { ...prev, name: editClientForm.name.trim(), phone: editClientForm.phone.trim() } : prev);
            setIsEditingClient(false);
        } catch {
            // silently fail, user can retry
        } finally {
            setIsSavingClient(false);
        }
    };

    // Computed: client to display (selectedClient takes priority, then deliveryClientName as fallback)
    const displayClient = selectedClient || (deliveryClientName ? { id: '', name: deliveryClientName } : null);

    // Sync client ID when clients load (we already have the name from deliveryClientName)
    useEffect(() => {
        if (deliveryClientName && clients.length > 0 && !selectedClient) {
            const foundClient = clients.find(c => c.name === deliveryClientName);
            if (foundClient) {
                setSelectedClient({ id: foundClient.id, name: foundClient.name, id_number: foundClient.id_number, phone: foundClient.phone || undefined });
            }
        }
    }, [deliveryClientName, clients, selectedClient]);

    // Filter clients based on search query
    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
        (c.phone && c.phone.includes(clientSearch)) ||
        (c.id_number && c.id_number.toLowerCase().includes(clientSearch.toLowerCase()))
    ).slice(0, 5); // Limit to 5 results

    // Helper to parse float safely (handles formatted strings like "1.000")
    const parseVal = (val: string) => {
        if (!val) return 0;
        return parseFloat(val.replace(/\./g, '')) || 0;
    };

    const numericDiscount = parseVal(discount);
    const finalTotal = Math.round(Math.max(0, total - numericDiscount) / 50) * 50;

    useEffect(() => {
        if (finalTotal === 0) setCashGiven('');
    }, [finalTotal]);

    const numericCashGiven = parseVal(cashGiven);
    const change = numericCashGiven - finalTotal;

    const mixedTotal: number = (Object.values(mixedAmounts) as string[]).reduce((sum, v) => sum + parseVal(v), 0);
    const mixedRemaining = finalTotal - mixedTotal;

    const handleMixedAmountChange = (methodName: string, value: string) => {
        const raw = value.replace(/\D/g, '');
        if (!raw) {
            setMixedAmounts(prev => ({ ...prev, [methodName]: '' }));
            return;
        }
        setMixedAmounts(prev => ({ ...prev, [methodName]: Number(raw).toLocaleString('es-ES') }));
    };

    const handleDiscountPercentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        // Allow valid decimal numbers only
        if (!/^\d*\.?\d{0,2}$/.test(val)) return;

        setDiscountPercent(val);
        if (val === '') {
            setDiscount('');
            return;
        }
        const pct = parseFloat(val);
        if (!isNaN(pct)) {
            const amt = (total * pct) / 100;
            setDiscount(amt.toFixed(0));
        }
    };

    const handleDiscountAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (!/^\d*\.?\d{0,2}$/.test(val)) return;

        setDiscount(val);
        if (val === '') {
            setDiscountPercent('');
            return;
        }
        const amt = parseFloat(val);
        if (!isNaN(amt) && total > 0) {
            const pct = (amt / total) * 100;
            setDiscountPercent(pct.toFixed(0));
        }
    };

    const handleCashGivenChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Remove non-digits
        const raw = e.target.value.replace(/\D/g, '');

        if (!raw) {
            setCashGiven('');
            return;
        }

        // Format with thousands separators (es-ES uses dots)
        const formatted = Number(raw).toLocaleString('es-ES');
        setCashGiven(formatted);
    };

    const handleFinalize = async () => {
        if (isProcessing) return;
        const now = new Date();
        const dateString = now.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

        const customerName = selectedClient?.name || clientSearch || (paymentMode === 'credit' ? 'Cliente Crédito' : 'Consumidor Final');

        if (paymentMode === 'credit' && !selectedClient) {
            showToast('Para ventas a crédito debes seleccionar un cliente registrado', 'warning');
            return;
        }

        if (paymentMode === 'payment' && !isMixedPayment && !method) return;
        if (isMixedPayment && mixedRemaining !== 0) return;

        setIsProcessing(true);
        try {
            if (paymentMode === 'credit') {
                await onProcessPayment({
                    type: 'credit',
                    customer: customerName,
                    amount: finalTotal,
                    method: 'Crédito Local',
                    date: dateString,
                    client_id: selectedClient?.id,
                    client_id_number: selectedClient?.id_number,
                    customerPhone: selectedClient?.phone,
                    table_id: tableId,
                    note: creditNote || undefined,
                    userDiscount: numericDiscount,
                    creditAbono: parseVal(creditAbonoAmount) > 0 ? parseVal(creditAbonoAmount) : undefined,
                    creditAbonoMethod: parseVal(creditAbonoAmount) > 0 ? (creditAbonoPaymentMethod || creditAbonoNote || 'Abono inicial') : undefined,
                    creditDueDate: creditDueDate || undefined,
                });
                const abonoNum = parseVal(creditAbonoAmount);
                if (abonoNum > 0 && selectedClient?.id) {
                    const noteLabel = creditAbonoPaymentMethod || creditAbonoNote || 'Abono inicial';
                    const methodMap: Record<string, string> = {
                        'Efectivo': 'cash', 'Tarjeta': 'card', 'Nequi': 'nequi',
                        'Daviplata': 'daviplata', 'Transferencia': 'transfer', 'Otro': 'other',
                    };
                    const dbMethod = methodMap[creditAbonoPaymentMethod] || creditAbonoPaymentMethod.toLowerCase() || 'cash';
                    await addPayment(selectedClient.id, abonoNum, noteLabel, dbMethod, activeShift?.id || undefined);
                    if (navigator.onLine && activeShift) {
                        await addCashIn(abonoNum, `Abono de: ${selectedClient.name} · Abono inicial`, dbMethod);
                    }
                }
            } else if (isMixedPayment) {
                const splitPayments = Object.entries(mixedAmounts)
                    .filter(([, v]: [string, string]) => parseVal(v) > 0)
                    .map(([m, v]: [string, string]) => ({ method: m, amount: parseVal(v) }));
                await onProcessPayment({
                    type: 'cash',
                    customer: customerName,
                    amount: finalTotal,
                    method: 'Mixto',
                    date: dateString,
                    client_id: selectedClient?.id,
                    client_id_number: selectedClient?.id_number,
                    customerPhone: selectedClient?.phone,
                    table_id: tableId,
                    splitPayments,
                    userDiscount: numericDiscount,
                });
            } else {
                await onProcessPayment({
                    type: 'cash',
                    customer: customerName,
                    amount: finalTotal,
                    change: method === 'Efectivo' ? change : 0,
                    method: method,
                    date: dateString,
                    client_id: selectedClient?.id,
                    client_id_number: selectedClient?.id_number,
                    customerPhone: selectedClient?.phone,
                    table_id: tableId,
                    userDiscount: numericDiscount,
                });
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const handleClientSave = async (data: ClientData) => {
        try {
            const newClient = await createClient({
                name: data.name,
                phone: data.phone,
                email: data.email,
                address: data.address,
                id_number: data.idNumber,
                credit_limit: 0,
            });

            if (newClient) {
                setSelectedClient({ id: newClient.id, name: newClient.name, id_number: newClient.id_number });
                setClientSearch(newClient.name);
            }
        } catch (error) {
            console.error('Error creating client:', error);
            showToast('Error al crear el cliente', 'error');
        }
    };

    const handleSelectClient = (client: { id: string; name: string; id_number?: string; phone?: string }) => {
        setSelectedClient(client);
        setClientSearch(client.name);
        setShowClientDropdown(false);
        setHighlightedClientIndex(-1);
    };

    const handleClientSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!showClientDropdown || filteredClients.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedClientIndex(prev => (prev < filteredClients.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedClientIndex(prev => (prev > 0 ? prev - 1 : filteredClients.length - 1));
        } else if (e.key === 'Enter' && highlightedClientIndex >= 0 && highlightedClientIndex < filteredClients.length) {
            e.preventDefault();
            const c = filteredClients[highlightedClientIndex];
            handleSelectClient({ id: c.id, name: c.name, id_number: c.id_number, phone: c.phone || undefined });
        } else if (e.key === 'Escape') {
            setShowClientDropdown(false);
            setHighlightedClientIndex(-1);
        }
    };

    const handleAddMethod = () => {
        if (!newMethodName.trim()) {
            setIsAddingMethod(false);
            return;
        }
        // Capitalize first letter
        const formattedName = newMethodName.trim().charAt(0).toUpperCase() + newMethodName.trim().slice(1);

        if (!paymentMethods.includes(formattedName)) {
            const updated = [...paymentMethods, formattedName];
            updatePaymentMethods(updated);
            setMethod(formattedName);
        }
        setNewMethodName('');
        setIsAddingMethod(false);
    };

    const handleDeleteMethod = (methodToDelete: string) => {
        if (methodToDelete === 'Efectivo') return;
        const updated = paymentMethods.filter(m => m !== methodToDelete);
        updatePaymentMethods(updated);
        if (method === methodToDelete) setMethod('');
    };

    const handleRenameMethod = (index: number, newName: string) => {
        const trimmed = newName.trim();
        if (!trimmed || trimmed === paymentMethods[index]) {
            setEditingMethod(null);
            return;
        }
        const formatted = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
        const updated = [...paymentMethods];
        updated[index] = formatted;
        updatePaymentMethods(updated);
        if (method === paymentMethods[index]) setMethod(formatted);
        setEditingMethod(null);
    };

    // Keyboard navigation items
    const navItems: { type: string; id: string; action: () => void }[] = [
        { type: 'tab', id: 'tab-payment', action: () => setPaymentMode('payment') },
        { type: 'tab', id: 'tab-credit', action: () => setPaymentMode('credit') },
        ...(paymentMode === 'payment'
            ? paymentMethods.map(m => ({ type: 'method', id: `method-${m}`, action: () => setMethod(m) }))
            : []),
        { type: 'finalize', id: 'finalize', action: handleFinalize },
    ];

    useEffect(() => {
        const el = sidebarRef.current;
        if (!el) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setKbIndex(prev => (prev < navItems.length - 1 ? prev + 1 : 0));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setKbIndex(prev => (prev > 0 ? prev - 1 : navItems.length - 1));
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                setKbIndex(prev => (prev < navItems.length - 1 ? prev + 1 : 0));
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setKbIndex(prev => (prev > 0 ? prev - 1 : navItems.length - 1));
            } else if (e.key === 'Enter' && kbIndex >= 0 && kbIndex < navItems.length) {
                e.preventDefault();
                navItems[kbIndex].action();
            }
        };

        el.addEventListener('keydown', handleKeyDown);
        return () => el.removeEventListener('keydown', handleKeyDown);
    }, [kbIndex, navItems.length, paymentMode, paymentMethods, method]);

    return (
        <div ref={sidebarRef} tabIndex={0} className="flex flex-col flex-1 min-h-0 animate-[fadeIn_0.2s_ease-out] relative outline-none">
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 pb-2">
                <div className="space-y-3">

                    {/* Payment Mode Tabs */}
                    <div className="flex items-stretch gap-2">
                        {showInlineBack && (
                            <button
                                onClick={onBack}
                                title="Volver al carrito"
                                aria-label="Volver al carrito"
                                className="shrink-0 w-11 flex items-center justify-center rounded-xl bg-slate-100/80 dark:bg-gray-800/40 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-gray-700 transition-all active:scale-95"
                            >
                                <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                            </button>
                        )}
                        <div className="flex-1 flex p-1 bg-slate-100/80 dark:bg-gray-800/40 rounded-xl">
                        <button
                            onClick={() => setPaymentMode('payment')}
                            className={`flex-1 h-11 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all text-xs uppercase tracking-wide
                                ${paymentMode === 'payment'
                                    ? 'bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 shadow-sm border border-slate-200/50 dark:border-gray-600/50'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}
                                ${kbIndex === 0 ? 'ring-2 ring-slate-400/50 scale-[1.02]' : ''}`}
                        >
                            Pago Directo
                        </button>
                        <button
                            onClick={() => setPaymentMode('credit')}
                            className={`flex-1 h-11 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-all text-xs uppercase tracking-wide
                                ${paymentMode === 'credit'
                                    ? 'bg-white dark:bg-gray-700 text-slate-800 dark:text-slate-100 shadow-sm border border-slate-200/50 dark:border-gray-600/50'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}
                                ${kbIndex === 1 ? 'ring-2 ring-slate-400/50 scale-[1.02]' : ''}`}
                        >
                            Crédito
                        </button>
                        </div>
                    </div>

                    {/* Customer Input with Autocomplete */}
                    <div>
                        <label htmlFor="sidebar-client-search" className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5 block">
                            Asignar a Cliente {paymentMode === 'credit' && <span className="text-rose-500">*</span>}
                        </label>
                        <div className="relative group flex gap-2">
                            <div className="relative flex-1">
                                {displayClient ? (
                                    <div className="flex flex-col gap-1.5">
                                        <div className="h-11 flex items-center justify-between p-1.5 bg-white dark:bg-gray-800/40 border border-slate-200 dark:border-gray-800 rounded-xl shadow-sm">
                                            <div className="flex items-center gap-2 bg-slate-50 dark:bg-gray-800/60 py-1 pl-1.5 pr-3 rounded-lg border border-slate-200/60 dark:border-gray-700/60 h-full flex-1 min-w-0">
                                                <div className="size-6 shrink-0 bg-slate-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300">
                                                    <span className="material-symbols-outlined text-[14px]">person</span>
                                                </div>
                                                <span className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">
                                                    {displayClient.name}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-0.5 shrink-0 ml-1">
                                                {selectedClient?.id && (
                                                    <button
                                                        onClick={handleOpenEditClient}
                                                        className="size-8 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-250 hover:bg-slate-100 dark:hover:bg-gray-700/80 rounded-full transition-all"
                                                        title="Editar cliente"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">edit</span>
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => {
                                                        setSelectedClient(null);
                                                        setClientSearch('');
                                                        setIsEditingClient(false);
                                                    }}
                                                    className="size-8 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-full transition-all"
                                                    title="Remover cliente"
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">close</span>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Panel de edición inline */}
                                        {isEditingClient && (
                                            <div className="bg-slate-50/50 dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800/60 rounded-xl p-3 space-y-2.5 animate-[fadeIn_0.15s_ease-out]">
                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                    <span className="material-symbols-outlined text-[14px] text-slate-500 dark:text-slate-400">edit</span>
                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Editar datos del cliente</span>
                                                </div>
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    value={editClientForm.name}
                                                    onChange={e => setEditClientForm(p => ({ ...p, name: e.target.value }))}
                                                    placeholder="Nombre"
                                                    autoComplete="off"
                                                    className="w-full px-3 py-2 text-xs font-semibold bg-white dark:bg-gray-950 border border-slate-200 dark:border-gray-800 rounded-lg outline-none focus:border-slate-400 dark:focus:border-gray-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 transition-colors"
                                                />
                                                <input
                                                    type="tel"
                                                    value={editClientForm.phone}
                                                    onChange={e => setEditClientForm(p => ({ ...p, phone: e.target.value }))}
                                                    placeholder="Teléfono"
                                                    autoComplete="off"
                                                    className="w-full px-3 py-2 text-xs font-semibold bg-white dark:bg-gray-950 border border-slate-200 dark:border-gray-800 rounded-lg outline-none focus:border-slate-400 dark:focus:border-gray-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 transition-colors"
                                                />
                                                <input
                                                    type="text"
                                                    value={editClientForm.address}
                                                    onChange={e => setEditClientForm(p => ({ ...p, address: e.target.value }))}
                                                    placeholder="Dirección"
                                                    autoComplete="off"
                                                    className="w-full px-3 py-2 text-xs font-semibold bg-white dark:bg-gray-950 border border-slate-200 dark:border-gray-800 rounded-lg outline-none focus:border-slate-400 dark:focus:border-gray-700 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 transition-colors"
                                                />
                                                <div className="flex gap-1.5 pt-0.5">
                                                    <button
                                                        onClick={handleSaveEditClient}
                                                        disabled={!editClientForm.name.trim() || isSavingClient}
                                                        className="flex-1 h-8 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 disabled:opacity-50 hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
                                                    >
                                                        {isSavingClient ? (
                                                            <svg className="animate-spin size-3.5 text-current" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                                        ) : (
                                                            <><span className="material-symbols-outlined text-[13px]">check</span>Guardar</>
                                                        )}
                                                    </button>
                                                    <button
                                                        onClick={() => setIsEditingClient(false)}
                                                        className="h-8 px-3 bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-slate-300 rounded-lg text-[11px] font-bold hover:bg-slate-200 dark:hover:bg-gray-750 transition-colors"
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <input
                                            id="sidebar-client-search"
                                            type="text"
                                            value={clientSearch}
                                            onChange={(e) => {
                                                setClientSearch(e.target.value);
                                                setShowClientDropdown(true);
                                                setHighlightedClientIndex(-1);
                                                if (!e.target.value) {
                                                    setSelectedClient(null);
                                                }
                                            }}
                                            onFocus={() => setShowClientDropdown(true)}
                                            onKeyDown={handleClientSearchKeyDown}
                                            autoComplete="off"
                                            className="w-full pl-4 pr-3 py-2 h-11 bg-white dark:bg-gray-800/40 border border-slate-200 dark:border-gray-800 rounded-xl focus:border-slate-400 dark:focus:border-gray-700 focus:ring-1 focus:ring-slate-400/20 transition-all text-sm font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-400 outline-none shadow-sm"
                                            placeholder="Nombre, teléfono o documento..."
                                        />
                                    </>
                                )}

                                {/* Client Dropdown */}
                                {showClientDropdown && clientSearch && filteredClients.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl z-50 overflow-hidden shadow-lg">
                                        {filteredClients.map((client, idx) => (
                                            <button
                                                key={client.id}
                                                onMouseEnter={() => setHighlightedClientIndex(idx)}
                                                onClick={() => handleSelectClient({ id: client.id, name: client.name, id_number: client.id_number, phone: client.phone || undefined })}
                                                className={`w-full px-3 py-2 text-left transition-colors flex items-center gap-2 ${highlightedClientIndex === idx ? 'bg-slate-100 dark:bg-slate-800/60' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                                            >
                                                <div className="size-7 bg-slate-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                                                    <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 text-[16px]">person</span>
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{client.name}</p>
                                                    <p className="text-xs text-slate-500">{client.phone || 'Sin teléfono'}</p>
                                                </div>
                                                {client.current_debt > 0 && (
                                                    <span className="text-xs font-semibold text-rose-500 dark:text-rose-450">
                                                        Deuda: ${formatCurrency(client.current_debt)}
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => setShowCreateClientModal(true)}
                                className="h-11 px-3.5 shrink-0 bg-white dark:bg-gray-800/40 border border-slate-200 dark:border-gray-800 hover:border-slate-300 dark:hover:border-gray-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-gray-800/60 rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-sm"
                                title="Crear Nuevo Cliente"
                            >
                                <span className="material-symbols-outlined text-[18px]">person_add</span>
                                <span className="text-xs font-bold uppercase tracking-wider">Crear</span>
                            </button>
                        </div>
                    </div>

                    {/* Discount Input - Split */}
                    <div>
                        <label htmlFor="sidebar-discount-percent" className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5 block">Descuento</label>
                        <div className="flex items-center gap-2">
                            <div className="relative group flex-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
                                <input
                                    id="sidebar-discount-percent"
                                    type="text"
                                    inputMode="decimal"
                                    value={discountPercent}
                                    onChange={handleDiscountPercentChange}
                                    autoComplete="off"
                                    className="w-full pl-8 pr-3 py-2 h-11 bg-white dark:bg-gray-800/40 border border-slate-200 dark:border-gray-800 rounded-xl transition-all text-sm font-bold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:border-slate-400 dark:focus:border-gray-700 focus:ring-1 focus:ring-slate-400/20 outline-none shadow-sm"
                                    placeholder="0"
                                />
                            </div>
                            <span className="text-slate-400 font-bold">=</span>
                            <div className="relative group flex-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={discount}
                                    onChange={handleDiscountAmountChange}
                                    autoComplete="off"
                                    className="w-full pl-8 pr-3 py-2 h-11 bg-white dark:bg-gray-800/40 border border-slate-200 dark:border-gray-800 rounded-xl transition-all text-sm font-bold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:border-slate-400 dark:focus:border-gray-700 focus:ring-1 focus:ring-slate-400/20 outline-none shadow-sm"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                    </div>

                    {paymentMode === 'payment' && (
                        <>
                            {/* Mixed Payment Toggle */}
                            <button
                                onClick={() => {
                                    setIsMixedPayment(prev => !prev);
                                    setMethod('');
                                    setMixedAmounts({});
                                    setCashGiven('');
                                }}
                                className={`w-full h-11 rounded-xl border font-bold text-xs uppercase tracking-wide flex items-center justify-center gap-2 transition-all shadow-sm
                                    ${isMixedPayment
                                        ? 'border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 dark:border-slate-700'
                                        : 'border-slate-200 dark:border-gray-850 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 bg-white dark:bg-gray-800/40 hover:border-slate-300 dark:hover:border-gray-700'}`}
                            >
                                <span className="material-symbols-outlined text-[18px]">call_split</span>
                                Pago Mixto
                            </button>

                            {isMixedPayment ? (
                                <div ref={mixedSectionRef} className="space-y-3 animate-[fadeIn_0.2s_ease-out]">
                                    <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Dividir entre métodos</h3>
                                    {paymentMethods.map(m => (
                                        <div key={m} className="flex items-center gap-3">
                                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300 w-24 truncate">{m}</span>
                                            <div className="relative flex-1">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={mixedAmounts[m] || ''}
                                                    onChange={(e) => handleMixedAmountChange(m, e.target.value)}
                                                    placeholder="0"
                                                    autoComplete="off"
                                                    className="w-full pl-7 pr-3 py-3 bg-white dark:bg-gray-800/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:border-slate-400 dark:focus:border-gray-700 focus:ring-1 focus:ring-slate-400/20 outline-none transition-all shadow-sm"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                    <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border transition-colors ${mixedRemaining === 0
                                        ? 'border-emerald-250 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/30'
                                        : mixedRemaining < 0
                                            ? 'border-rose-250 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-900/30'
                                            : 'border-amber-250 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/30'
                                        }`}>
                                        <span className={`text-xs font-bold ${mixedRemaining === 0 ? 'text-emerald-600 dark:text-emerald-400' : mixedRemaining < 0 ? 'text-rose-600 dark:text-rose-450' : 'text-amber-600 dark:text-amber-400'}`}>
                                            {mixedRemaining === 0 ? '✓ Completo' : mixedRemaining < 0 ? 'Excedido' : 'Restante'}
                                        </span>
                                        <span className={`text-lg font-black ${mixedRemaining === 0 ? 'text-emerald-600 dark:text-emerald-400'
                                            : mixedRemaining < 0 ? 'text-rose-600 dark:text-rose-455'
                                                : 'text-amber-600 dark:text-amber-400'
                                            }`}>
                                            ${formatCurrency(Math.abs(mixedRemaining))}
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Method Grid */}
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Método de Pago</h3>
                                            {/* Métodos de pago fijos: no se pueden crear, renombrar ni borrar */}
                                        </div>

                                        {/* Cards Grid */}
                                        <div className="grid grid-cols-3 gap-2">
                                            {paymentMethods.map((m, mIdx) => {
                                                const isSelected = method === m;
                                                const kbActive = kbIndex === mIdx + 2;
                                                const isEfectivo = m === 'Efectivo';
                                                const isTargeted = editingMethod?.index === mIdx;

                                                return (
                                                    <button
                                                        key={m}
                                                        onClick={() => {
                                                            if (!isEditingMethods) { setMethod(m); return; }
                                                            if (!isEfectivo) setEditingMethod({ index: mIdx, value: m });
                                                        }}
                                                        className={`relative flex items-center justify-center h-11 rounded-xl border transition-all overflow-visible shadow-sm
                                                            ${!isEditingMethods && isSelected
                                                                ? 'border-slate-800 dark:border-slate-200 bg-slate-50 dark:bg-gray-800 text-slate-900 dark:text-white font-bold ring-1 ring-slate-800 dark:ring-slate-200'
                                                                : isEditingMethods && isTargeted
                                                                    ? 'border-slate-300 bg-slate-100 dark:border-gray-600 dark:bg-gray-800/80 ring-2 ring-slate-200 dark:ring-gray-700'
                                                                    : 'border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-800/40 hover:border-slate-300 dark:hover:border-gray-700'}
                                                            ${kbActive && !isEditingMethods ? 'ring-2 ring-slate-400/40 dark:ring-white/40 scale-[1.03]' : ''}
                                                            ${isEditingMethods && !isEfectivo && !isTargeted ? 'animate-[wiggle_0.2s_infinite]' : ''}
                                                            ${isEditingMethods && !isEfectivo ? 'cursor-pointer' : ''}
                                                        `}
                                                    >
                                                        {isEditingMethods && !isEfectivo && (
                                                            <div
                                                                onClick={(e) => { e.stopPropagation(); handleDeleteMethod(m); }}
                                                                className="absolute -top-1.5 -right-1.5 size-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900 text-rose-500 rounded-full flex items-center justify-center z-20 hover:bg-rose-500 hover:text-white transition-all cursor-pointer shadow-sm"
                                                            >
                                                                <span className="material-symbols-outlined text-[9px] font-bold">close</span>
                                                            </div>
                                                        )}
                                                        <span className={`font-bold text-xs px-1 text-center leading-tight ${!isEditingMethods && isSelected
                                                            ? 'text-slate-900 dark:text-white'
                                                            : isEditingMethods && isTargeted
                                                                ? 'text-slate-900 dark:text-slate-100'
                                                                : 'text-slate-500 dark:text-slate-400'
                                                            }`}>{m}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Edit bar — shown below grid when a card is selected for renaming */}
                                        {isEditingMethods && editingMethod !== null && (
                                            <div className="mt-2 flex items-center gap-2 bg-slate-50 dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl px-3 py-2 animate-[fadeIn_0.15s] shadow-sm">
                                                <span className="material-symbols-outlined text-[14px] text-slate-400 shrink-0">edit</span>
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    value={editingMethod.value}
                                                    onChange={(e) => setEditingMethod({ index: editingMethod.index, value: e.target.value })}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleRenameMethod(editingMethod.index, editingMethod.value);
                                                        if (e.key === 'Escape') setEditingMethod(null);
                                                    }}
                                                    autoComplete="off"
                                                    className="flex-1 text-xs font-semibold bg-transparent border-none outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
                                                    placeholder="Nuevo nombre..."
                                                />
                                                <button
                                                    onMouseDown={(e) => { e.preventDefault(); handleRenameMethod(editingMethod.index, editingMethod.value); }}
                                                    className="h-6 px-2.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-md text-[10px] font-bold flex items-center gap-1 shrink-0 hover:opacity-90 transition-opacity"
                                                >
                                                    <span className="material-symbols-outlined text-[11px]">check</span>
                                                    Guardar
                                                </button>
                                                <button
                                                    onMouseDown={(e) => { e.preventDefault(); setEditingMethod(null); }}
                                                    className="size-6 bg-slate-150 dark:bg-gray-800 text-slate-500 rounded-md flex items-center justify-center shrink-0 hover:bg-slate-250 dark:hover:bg-gray-700 transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-[12px]">close</span>
                                                </button>
                                            </div>
                                        )}

                                        {/* Add bar — shown below grid when adding */}
                                        {isAdmin && isAddingMethod && (
                                            <div className="mt-2 flex items-center gap-2 bg-slate-50 dark:bg-gray-900/40 border border-slate-200 dark:border-gray-800 rounded-xl px-3 py-2 animate-[fadeIn_0.15s] shadow-sm">
                                                <span className="material-symbols-outlined text-[14px] text-slate-400 shrink-0">add</span>
                                                <input
                                                    type="text"
                                                    autoFocus
                                                    value={newMethodName}
                                                    onChange={(e) => setNewMethodName(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') handleAddMethod();
                                                        if (e.key === 'Escape') { setIsAddingMethod(false); setNewMethodName(''); }
                                                    }}
                                                    autoComplete="off"
                                                    className="flex-1 text-xs font-semibold bg-transparent border-none outline-none text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
                                                    placeholder="Nombre del método..."
                                                />
                                                <button
                                                    onMouseDown={(e) => { e.preventDefault(); handleAddMethod(); }}
                                                    className="h-6 px-2.5 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-md text-[10px] font-bold flex items-center gap-1 shrink-0 hover:opacity-90 transition-opacity"
                                                >
                                                    <span className="material-symbols-outlined text-[11px]">check</span>
                                                    Agregar
                                                </button>
                                                <button
                                                    onMouseDown={(e) => { e.preventDefault(); setIsAddingMethod(false); setNewMethodName(''); }}
                                                    className="size-6 bg-slate-150 dark:bg-gray-800 text-slate-500 rounded-md flex items-center justify-center shrink-0 hover:bg-slate-250 dark:hover:bg-gray-700 transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-[12px]">close</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {method === 'Efectivo' && (
                                        <div ref={cashSectionRef} className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1.5">
                                                    <label htmlFor="sidebar-cash-given" className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">Efectivo Recibido</label>
                                                    <div className="relative group">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-450 dark:text-slate-400 font-bold text-lg">$</span>
                                                        <input
                                                            id="sidebar-cash-given"
                                                            ref={cashInputRef}
                                                            type="text"
                                                            inputMode="decimal"
                                                            value={cashGiven}
                                                            onChange={handleCashGivenChange}
                                                            autoComplete="off"
                                                            placeholder={formatCurrency(finalTotal)}
                                                            className="w-full h-11 pl-7 pr-3 text-base font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-gray-850 border-2 border-slate-200 dark:border-gray-800 rounded-2xl focus:outline-none focus:border-slate-400 dark:focus:border-gray-700 focus:ring-0 transition-all placeholder:text-slate-400 shadow-sm"
                                                        />
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">CAMBIO</label>
                                                    <div className="h-11 flex items-center justify-between px-4 bg-rose-50/50 dark:bg-rose-950/20 rounded-2xl border-2 border-rose-100 dark:border-rose-900/30">
                                                        <span className="text-xl font-black text-rose-600 dark:text-rose-400 tracking-tight">
                                                            ${change >= 0 ? formatCurrency(change) : '0'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </>
                    )}

                    {paymentMode === 'credit' && (
                        <div className="space-y-4">
                            {/* Fecha de pago acordada */}
                            <div>
                                <label htmlFor="sidebar-credit-due-date" className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 block">
                                    Fecha de Pago Acordada <span className="text-red-500">*</span>
                                </label>
                                <div className="relative flex items-center">
                                    <input
                                        id="sidebar-credit-due-date"
                                        ref={creditDateInputRef}
                                        type="date"
                                        value={creditDueDate}
                                        min={new Date().toISOString().split('T')[0]}
                                        onChange={(e) => setCreditDueDate(e.target.value)}
                                        autoComplete="off"
                                        className="w-full pl-3 pr-24 py-3 bg-white dark:bg-gray-800/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100 focus:border-slate-400 dark:focus:border-gray-700 focus:ring-1 focus:ring-slate-400/20 outline-none transition-all shadow-sm cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0"
                                        onClick={(e) => {
                                            try {
                                                (e.target as HTMLInputElement).showPicker?.();
                                            } catch {}
                                        }}
                                    />
                                    <button
                                        type="button"
                                        tabIndex={-1}
                                        onClick={() => {
                                            try {
                                                creditDateInputRef.current?.showPicker?.();
                                                creditDateInputRef.current?.focus();
                                            } catch {
                                                creditDateInputRef.current?.focus();
                                            }
                                        }}
                                        className="absolute right-2 flex items-center gap-1 px-2.5 py-1 bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-bold transition-all shadow-sm pointer-events-auto"
                                    >
                                        <span>Elegir</span>
                                        <span className="material-symbols-outlined text-[16px]">calendar_month</span>
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label htmlFor="sidebar-credit-abono" className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 block">Abono inicial <span className="text-slate-400 dark:text-slate-500 font-normal">(opcional)</span></label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-450 dark:text-slate-400 font-bold">$</span>
                                    <input
                                        id="sidebar-credit-abono"
                                        type="text"
                                        inputMode="numeric"
                                        value={creditAbonoAmount}
                                        onChange={(e) => {
                                            const raw = e.target.value.replace(/\D/g, '');
                                            setCreditAbonoAmount(raw ? Number(raw).toLocaleString('es-ES') : '');
                                        }}
                                        placeholder="0"
                                        autoComplete="off"
                                        className="w-full pl-8 pr-3 py-3 bg-white dark:bg-gray-800/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm font-bold text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:border-slate-400 dark:focus:border-gray-700 focus:ring-1 focus:ring-slate-400/20 outline-none transition-all shadow-sm"
                                    />
                                </div>
                                {parseVal(creditAbonoAmount) > 0 && activeShift && (
                                    <div className="mt-2.5">
                                        <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-450 uppercase mb-1.5">Medio de pago</label>
                                        <div className="grid grid-cols-3 gap-1.5">
                                            {paymentMethods.map(m => (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    onClick={() => setCreditAbonoPaymentMethod(m)}
                                                    className={`py-1.5 px-1 rounded-lg border text-[11px] font-bold transition-all truncate ${creditAbonoPaymentMethod === m
                                                        ? 'border-slate-800 dark:border-slate-200 bg-slate-50 dark:bg-gray-800 text-slate-900 dark:text-white ring-1 ring-slate-800 dark:ring-slate-200 shadow-sm'
                                                        : 'border-slate-200 dark:border-gray-850 text-slate-500 hover:border-slate-350 dark:hover:border-gray-700'
                                                        }`}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {parseVal(creditAbonoAmount) > 0 && !activeShift && (
                                    <input
                                        type="text"
                                        value={creditAbonoNote}
                                        onChange={(e) => setCreditAbonoNote(e.target.value)}
                                        autoComplete="off"
                                        placeholder="Descripción del abono (ej: Pago en efectivo)"
                                        className="mt-2 w-full px-3 py-2.5 bg-white dark:bg-gray-800/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-450 focus:border-slate-450 dark:focus:border-gray-750 focus:ring-1 focus:ring-slate-400/20 outline-none transition-all shadow-sm"
                                    />
                                )}
                            </div>
                            {/* Nota de crédito */}
                            <div>
                                <label htmlFor="sidebar-credit-note" className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1.5 block">Nota de Crédito</label>
                                <textarea id="sidebar-credit-note" className="w-full p-3 bg-white dark:bg-gray-800/40 border border-slate-200 dark:border-gray-800 rounded-xl text-sm text-slate-800 dark:text-slate-100 resize-none h-20 focus:border-slate-400 dark:focus:border-gray-750 focus:ring-1 focus:ring-slate-400/20 outline-none transition-all shadow-sm" placeholder="Observaciones..." value={creditNote} onChange={(e) => setCreditNote(e.target.value)} />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer fijo */}
            <div className="shrink-0 p-4 border-t border-slate-200/80 dark:border-gray-850 bg-white dark:bg-gray-900/60 backdrop-blur-md flex items-center justify-between gap-4 shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.03)]">
                <div className="flex flex-col flex-1 pl-1">
                    <span className="text-[10px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-widest">Total a Pagar</span>
                    <span className="text-2xl font-black text-slate-900 dark:text-slate-50 font-display leading-tight">
                        ${formatCurrency(finalTotal)}
                    </span>
                </div>

                <button
                    onClick={handleFinalize}
                    disabled={!canSell || (paymentMode === 'payment' && !isMixedPayment && !method) || (isMixedPayment && mixedRemaining !== 0) || (paymentMode === 'credit' && (!selectedClient || !creditDueDate)) || isProcessing}
                    title={!canSell ? 'No tienes permiso para finalizar ventas' : undefined}
                    className={`flex-[1.5] h-12 rounded-xl font-bold text-base transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm 
                        ${!canSell || (paymentMode === 'payment' && !isMixedPayment && !method) || (isMixedPayment && mixedRemaining !== 0) || (paymentMode === 'credit' && (!selectedClient || !creditDueDate)) || isProcessing 
                            ? 'bg-slate-100 dark:bg-gray-800 text-slate-400 dark:text-slate-650 cursor-not-allowed' 
                            : 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-950'}
                        ${kbIndex === navItems.length - 1 && canSell ? 'ring-[3px] ring-slate-400/50 scale-[1.02] bg-slate-900 text-white dark:bg-white dark:text-slate-950' : ''}`}
                >
                    {isProcessing ? (
                        <svg className="animate-spin size-5 text-current" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                    ) : !canSell ? (
                        <>
                            No tienes permiso
                            <span className="material-symbols-outlined text-xl">lock</span>
                        </>
                    ) : (
                        <>
                            {paymentMode === 'payment' ? 'Finalizar Venta' : 'Confirmar Crédito'}
                            <span className="material-symbols-outlined text-xl">check_circle</span>
                        </>
                    )}
                </button>
            </div>

            {/* Create Client Modal */}
            {
                showCreateClientModal && (
                    <CreateClientModal
                        onClose={() => setShowCreateClientModal(false)}
                        onSave={handleClientSave}
                    />
                )
            }
        </div >
    );
};
