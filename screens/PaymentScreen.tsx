import React, { useState, useEffect, useRef } from 'react';
import { CartItem, Product, Screen, TransactionDetails } from '../types';
import { Numpad } from '../components/Numpad';
import { CreateClientModal, ClientData } from '../components/CreateClientModal';
import { CartItemRow } from '../components/CartItemRow';
import { DiscountModal } from '../components/DiscountModal';
import ComandaLabelHeaderButton from '../components/ComandaLabelHeaderButton';
import { logger } from '../lib/logger';
import { formatCurrency } from '../lib/formatters';
import { useClients } from '../hooks/useClients';
import { useCashRegister } from '../hooks/useCashRegister';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { usePermissions } from '../hooks/usePermissions';
import { useTablesWriteGate } from '../hooks/useTablesWriteGate';
import TablesReadOnlyBanner from '../components/TablesReadOnlyBanner';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

interface PaymentScreenProps {
    onNavigate: (screen: Screen) => void;
    onProcessPayment: (details: TransactionDetails) => void;
    removeFromCart: (product: CartItem) => void;
    updateQuantity: (product: CartItem, delta: number) => void;
    updateCartItem?: (product: CartItem, updates: Partial<CartItem>) => void;
    cart: CartItem[];
    total: number;
    tableName?: string;
    tableId?: string; // For order tracking
    onConfirmOrder?: () => void; // Confirm order to notify kitchen
    deliveryClientName?: string; // Pre-assigned client for delivery orders
    isDelivery?: boolean; // Whether this is a delivery order
    onEditProduct?: (product: Product) => void;
    isOrderSent?: boolean; // Whether the order has been sent to kitchen
    onSetOrderSent?: (sent: boolean) => void; // Callback to update sent status
    onAssignClient?: (client: { id: string; name: string; phone?: string; address?: string }) => void;
    saleOrigin?: 'tables' | 'orders' | 'scanner';
    onClearCart?: () => void;
    isCatalogMode?: boolean;
    /** Enviar comanda de los items nuevos a impresión (modo mesa, sin finalizar venta) */
    onSendCommanda?: () => void;
    // Selección de etiquetas de comanda (Localizador / Mesa / Tipo de pedido)
    // elevada a App.tsx. El header del carrito la muestra en el botón "Pedido".
    comandaLabelSelection?: { locator?: string; table?: string; takeaway?: string };
    onComandaLabelSelectionChange?: (selection: { locator?: string; table?: string; takeaway?: string }) => void;
}

const safeEvaluate = (expression: string): number => {
    try {
        if (!expression) return 0;
        if (/^[\d.]+$/.test(expression)) return parseFloat(expression) || 0;
        const src = expression.replace(/%/g, '/100').replace(/[^0-9+\-*/().\s]/g, '').trim();
        if (!src) return 0;
        let pos = 0;
        const skip = () => { while (src[pos] === ' ') pos++; };
        const parseFactor = (): number => {
            skip();
            if (src[pos] === '(') { pos++; const v = parseExpr(); if (src[pos] === ')') pos++; return v; }
            let s = '';
            if (src[pos] === '-') s += src[pos++];
            while (/[\d.]/.test(src[pos] ?? '')) s += src[pos++];
            return parseFloat(s) || 0;
        };
        const parseTerm = (): number => {
            let left = parseFactor(); skip();
            while (src[pos] === '*' || src[pos] === '/') {
                const op = src[pos++]; skip(); const right = parseFactor();
                left = op === '*' ? left * right : (right !== 0 ? left / right : 0); skip();
            }
            return left;
        };
        const parseExpr = (): number => {
            let left = parseTerm(); skip();
            while (src[pos] === '+' || src[pos] === '-') {
                const op = src[pos++]; skip(); const right = parseTerm();
                left = op === '+' ? left + right : left - right; skip();
            }
            return left;
        };
        const result = parseExpr();
        return isFinite(result) && !isNaN(result) ? result : 0;
    } catch {
        return parseFloat(expression) || 0;
    }
};

export const PaymentScreen: React.FC<PaymentScreenProps> = ({ onNavigate, onProcessPayment, removeFromCart, updateQuantity, updateCartItem, cart, total, tableName, tableId, onConfirmOrder, deliveryClientName, isDelivery = false, onEditProduct, isOrderSent = false, onSetOrderSent, onAssignClient, saleOrigin = 'tables', onClearCart, isCatalogMode = false, onSendCommanda, comandaLabelSelection = {}, onComandaLabelSelectionChange }) => {
    const { showToast } = useToast();
    const { profile } = useAuth();
    const { canFinalizeSale } = usePermissions();
    const canSell = canFinalizeSale();

    // Gate de escritura de mesas (modelo Usuario Eje). En modo mesa:
    //  - el observador en solo lectura no puede editar la orden ni cobrar (Req 5.4, 16.1);
    //  - el Eje offline puede cobrar aunque no tenga `canFinalizeSale` (Req 4.2).
    const tablesGate = useTablesWriteGate();
    const isTableMode = !!tableId;
    const tablesReadOnly = isTableMode && tablesGate.readOnly;
    const canSellTables = canSell || (tablesGate.soyEje && !tablesGate.isOnline);
    const puedeCobrar = isTableMode ? (canSellTables && !tablesReadOnly) : canSell;

    const blockTableWrite = (): boolean => {
        if (tablesReadOnly) {
            showToast(tablesGate.readOnlyMessage ?? 'Mesas en solo lectura sin conexión', 'warning');
            return true;
        }
        return false;
    };
    const isAdmin = profile?.role === 'Administrador';
    // DEBUG: Removed noisy logger for props

    const { clients, createClient, addPayment, updateClient } = useClients();
    const { addCashIn, activeShift } = useCashRegister();
    const [isClientSearchOpen, setIsClientSearchOpen] = useState(false);
    const [clientSearchQuery, setClientSearchQuery] = useState('');
    const [highlightedClientIndex, setHighlightedClientIndex] = useState(-1);

    // Siempre volver al menú (eliminamos pantalla de órdenes)
    const backScreen = saleOrigin === 'scanner' ? Screen.PHOTO_ORDER : saleOrigin !== 'tables' ? Screen.SELL : Screen.MENU;

    // Modo mesa: hay items "nuevos" (no enviados) para poder enviar comanda.
    const SENT_STATUSES = ['preparing', 'ready', 'served'];
    const hasPendingNewItems = !!tableId && cart.some(it => !(it as any).parentOrderItemId && !SENT_STATUSES.includes((it as any).status || 'pending'));
    const [step, setStep] = useState<'summary' | 'payment'>(() => {
        // Si viene del escáner de fotos/listas, ir directo a la pantalla de pago
        if (saleOrigin === 'scanner') {
            return 'payment';
        }
        const skipSummary = sessionStorage.getItem('bistro_payment_skip_summary');
        if (skipSummary) {
            sessionStorage.removeItem('bistro_payment_skip_summary');
            return 'payment';
        }
        // Por defecto, mostrar resumen del carrito primero
        return 'summary';
    });
    const [method, setMethod] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    // Discount state (stored as strings to allow expressions "10+5")
    const [discount, setDiscount] = useState<string>('');
    const [discountPercent, setDiscountPercent] = useState<string>('');

    // Cash State
    const [cashGiven, setCashGiven] = useState<string>('');

    const [creditNote, setCreditNote] = useState<string>('');
    const [creditDueDate, setCreditDueDate] = useState<string>('');
    const [creditAbonoAmount, setCreditAbonoAmount] = useState<string>('');
    const [creditAbonoNote, setCreditAbonoNote] = useState<string>('');
    const [creditAbonoPaymentMethod, setCreditAbonoPaymentMethod] = useState<string>('');

    const [isMixedPayment, setIsMixedPayment] = useState(false);
    const [mixedAmounts, setMixedAmounts] = useState<Record<string, string>>({});

    // Customer State - initialize with deliveryClientName if available
    const [showCreateClientModal, setShowCreateClientModal] = useState(false);
    const [assignedClient, setAssignedClient] = useState(() => deliveryClientName || ''); // Initialize with current prop value
    const [selectedClient, setSelectedClient] = useState<{ id: string; name: string; id_number?: string; phone?: string } | null>(null);

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
            setAssignedClient(editClientForm.name.trim());
            setIsEditingClient(false);
        } catch {
            // silently fail
        } finally {
            setIsSavingClient(false);
        }
    };

    // Sync client from props when deliveryClientName changes
    useEffect(() => {
        logger.log('[PaymentScreen] Client sync effect - deliveryClientName:', deliveryClientName, 'clients.length:', clients.length);

        if (deliveryClientName) {
            // Always update the display name immediately
            logger.log('[PaymentScreen] Setting assignedClient to:', deliveryClientName);
            setAssignedClient(deliveryClientName);

            // Try to find and select the real client from the list (for client_id)
            const found = clients.find(c => c.name === deliveryClientName);
            if (found) {
                logger.log('[PaymentScreen] Found client in list:', found.id, found.name);
                setSelectedClient({ id: found.id, name: found.name, id_number: found.id_number, phone: found.phone });
            }
        }
    }, [deliveryClientName, clients]);

    useEffect(() => {
        if (saleOrigin === 'scanner') {
            setStep('payment');
        }
    }, [saleOrigin]);

    const filteredClients = clients.filter(c =>
        c.name.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
        c.phone?.includes(clientSearchQuery) ||
        c.id_number?.toLowerCase().includes(clientSearchQuery.toLowerCase())
    );

    const handleSelectClient = (client: { id: string; name: string; phone?: string; address?: string; id_number?: string }) => {
        setSelectedClient({ id: client.id, name: client.name, id_number: client.id_number, phone: client.phone });
        setAssignedClient(client.name);
        setClientSearchQuery('');
        setIsClientSearchOpen(false);
        setHighlightedClientIndex(-1);
        // Sync with App.tsx
        if (onAssignClient) {
            onAssignClient({
                id: client.id,
                name: client.name,
                phone: client.phone,
                address: client.address
            });
        }
    };

    const handleClientSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!clientSearchQuery || filteredClients.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedClientIndex(prev => (prev < filteredClients.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedClientIndex(prev => (prev > 0 ? prev - 1 : filteredClients.length - 1));
        } else if (e.key === 'Enter' && highlightedClientIndex >= 0 && highlightedClientIndex < filteredClients.length) {
            e.preventDefault();
            const c = filteredClients[highlightedClientIndex];
            handleSelectClient({ id: c.id, name: c.name, id_number: c.id_number, phone: c.phone, address: c.address });
        } else if (e.key === 'Escape') {
            setIsClientSearchOpen(false);
            setHighlightedClientIndex(-1);
        }
    };



    // Discount Modal Logic
    const [discountItem, setDiscountItem] = useState<CartItem | null>(null);
    const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    const handleApplyDiscount = (value: number, type: 'percent' | 'amount') => {
        if (!discountItem || !updateCartItem) return;

        const updates: Partial<CartItem> = {
            discount: type === 'amount' ? value : undefined,
            discountPercent: type === 'percent' ? value : undefined,
        };

        updateCartItem(discountItem, updates);
        setDiscountItem(null);
    };



    // Numpad State
    const [activeInput, setActiveInput] = useState<string | null>(null);

    // Computed numeric values for logic
    const numericDiscount = safeEvaluate(discount);
    const finalTotal = Math.round(Math.max(0, total - numericDiscount) / 50) * 50;

    const numericCashGiven = safeEvaluate(cashGiven);
    const change = numericCashGiven - finalTotal;

    const mixedTotal: number = (Object.values(mixedAmounts) as string[]).reduce((sum, v) => sum + safeEvaluate(v), 0);
    const mixedRemaining = finalTotal - mixedTotal;

    const handleMixedAmountChange = (methodName: string, value: string) => {
        setMixedAmounts(prev => ({ ...prev, [methodName]: value }));
    };

    const [paymentMode, setPaymentMode] = useState<'payment' | 'credit'>('payment');

    // Payment Methods State
    const { paymentMethods, updatePaymentMethods, isComandaLabelShortcutEnabled } = useBusinessSettings();
    const [isAddingMethod, setIsAddingMethod] = useState(false);
    const [isEditingMethods, setIsEditingMethods] = useState(false);
    const [newMethodName, setNewMethodName] = useState('');
    const [editingMethod, setEditingMethod] = useState<{ index: number; value: string } | null>(null);

    const handleAddMethod = () => {
        if (!newMethodName.trim()) {
            setIsAddingMethod(false);
            return;
        }
        const formattedName = newMethodName.trim().charAt(0).toUpperCase() + newMethodName.trim().slice(1);
        if (!paymentMethods.includes(formattedName)) {
            updatePaymentMethods([...paymentMethods, formattedName]);
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

    // Auto-abrir numpad cuando se selecciona Efectivo (solo móvil)



    // Helper to format input string with separators (handling expressions roughly)
    const formatInput = (val: string) => {
        if (!val) return '';
        // Replace integers with formatted versions, preserve operators
        return val.replace(/\d+/g, (n) => formatCurrency(parseFloat(n)));
    };

    // Dynamic scale for large numbers
    const getFontSize = (val: string) => {
        const len = val.length + 1; // Account for '$'
        if (len > 12) return 'text-xs';
        if (len > 9) return 'text-sm';
        if (len > 7) return 'text-base';
        if (len > 5) return 'text-lg';
        return 'text-2xl';
    };

    const handleUpdateDiscountPercent = (val: string) => {
        setDiscountPercent(val);
        // Calculate numeric discount amount if val is a simple number
        if (val === '') {
            setDiscount('');
            setDiscount('');
            return;
        }
        // Only auto-calculate other field if it's a finished number, not an expression
        const pct = parseFloat(val);
        if (!isNaN(pct) && /^\d+(\.\d+)?$/.test(val)) {
            const amt = (total * pct) / 100;
            setDiscount(amt.toFixed(0));
        }
    };

    const cashSectionRef = useRef<HTMLDivElement>(null);
    const mixedSectionRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to cash section when Efectivo is selected
    useEffect(() => {
        if (method === 'Efectivo' && cashSectionRef.current) {
            // Small delay to ensure render
            setTimeout(() => {
                cashSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    }, [method]);

    useEffect(() => {
        if (isMixedPayment && mixedSectionRef.current) {
            setTimeout(() => {
                mixedSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    }, [isMixedPayment]);

    const handleUpdateDiscountAmount = (val: string) => {
        setDiscount(val);
        if (val === '') {
            setDiscountPercent('');
            return;
        }
        const amt = parseFloat(val);
        if (!isNaN(amt) && total > 0 && /^\d+(\.\d+)?$/.test(val)) {
            const pct = (amt / total) * 100;
            setDiscountPercent(pct.toFixed(0));
        }
    };

    const handlePadPress = (key: string) => {
        if (!activeInput) return;

        let currentVal = '';
        let setVal: (v: string) => void = () => { };

        switch (activeInput) {
            case 'discountPercent':
                currentVal = discountPercent;
                setVal = handleUpdateDiscountPercent;
                break;
            case 'discountAmount':
                currentVal = discount;
                setVal = handleUpdateDiscountAmount;
                break;
            case 'cashGiven':
                currentVal = cashGiven;
                setVal = setCashGiven;
                break;
            case 'creditAbonoAmount':
                currentVal = creditAbonoAmount;
                setVal = setCreditAbonoAmount;
                break;
            default:
                if (activeInput?.startsWith('mixed-')) {
                    const m = activeInput.replace('mixed-', '');
                    currentVal = mixedAmounts[m] || '';
                    setVal = (v) => handleMixedAmountChange(m, v);
                }
                break;
        }

        if (key === 'backspace') {
            setVal(currentVal.slice(0, -1));
        } else if (key === 'C') {
            setVal('');
        } else if (key === 'check' || key === '=') {
            // Evaluate and commit
            const result = safeEvaluate(currentVal);
            const formatted = Math.round(result * 100) / 100;
            setVal(formatted.toString());
        } else {
            // Append key (number or operator)
            if (key === '.' && currentVal.includes('.') && !/[+\-*/]/.test(currentVal)) return; // Simple check, improved via eval later

            if (currentVal === '0' && key !== '.' && !['+', '-', '*', '/', '%'].includes(key)) {
                setVal(key);
            } else {
                setVal(currentVal + key);
            }
        }
    };

    const handleFinalize = async () => {
        if (isProcessing) return;
        const now = new Date();
        const dateString = now.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

        const customerName = selectedClient?.name || (paymentMode === 'credit' ? 'Cliente Crédito' : 'Consumidor Final');

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
                    creditAbono: safeEvaluate(creditAbonoAmount) > 0 ? safeEvaluate(creditAbonoAmount) : undefined,
                    creditAbonoMethod: safeEvaluate(creditAbonoAmount) > 0 ? (creditAbonoPaymentMethod || creditAbonoNote || 'Abono inicial') : undefined,
                    creditDueDate: creditDueDate || undefined,
                });
                const abonoNum = safeEvaluate(creditAbonoAmount);
                if (abonoNum > 0 && selectedClient?.id) {
                    const noteLabel = creditAbonoPaymentMethod || creditAbonoNote || 'Abono inicial';
                    await addPayment(selectedClient.id, abonoNum, noteLabel);
                    if (activeShift) {
                        const methodMap: Record<string, string> = {
                            'Efectivo': 'cash', 'Tarjeta': 'card', 'Nequi': 'nequi',
                            'Daviplata': 'daviplata', 'Transferencia': 'transfer', 'Otro': 'other',
                        };
                        const dbMethod = methodMap[creditAbonoPaymentMethod] || creditAbonoPaymentMethod.toLowerCase() || 'cash';
                        await addCashIn(abonoNum, `Abono de: ${selectedClient.name} · Abono inicial`, dbMethod);
                    }
                }
            } else if (isMixedPayment) {
                const splitPayments = Object.entries(mixedAmounts)
                    .filter(([, v]: [string, string]) => safeEvaluate(v) > 0)
                    .map(([m, v]: [string, string]) => ({ method: m, amount: safeEvaluate(v) }));
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

    const renderMobileSummary = () => (
        <div className="flex flex-col h-full min-h-0 bg-white dark:bg-background-dark animate-[fadeIn_0.3s_ease-out]">
            {/* Header Compacto */}
            <header className="bg-white dark:bg-surface-dark px-3 py-2 border-b border-gray-100 dark:border-gray-800 shrink-0 sticky top-0 z-40">
                {/* Row 1: Back + Badge + Menu */}
                <div className="flex items-center justify-between min-h-[40px]">
                    {!isClientSearchOpen ? (
                        <>
                            <div className="flex items-center gap-2">
                                {/* Flecha de volver: siempre visible en mobile para navegación */}
                                <button
                                    onClick={() => onNavigate(backScreen)}
                                    className="size-7 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 active:scale-95"
                                    title="Volver"
                                >
                                    <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                                </button>
                                {/* Badge tipo de orden — móvil: chip compacto; tablet (md+): chip con icono, color saturado y texto más legible */}
                                {isDelivery ? (
                                    <div className="px-2 py-0.5 md:px-2.5 md:py-1 rounded md:rounded-lg font-bold text-[9px] md:text-xs uppercase md:normal-case tracking-wide md:tracking-normal bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 md:dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 flex items-center gap-1 md:gap-1.5">
                                        <span className="size-1 rounded-full bg-amber-500 md:hidden"></span>
                                        <span className="material-symbols-outlined text-[16px] hidden md:inline leading-none">delivery_dining</span>
                                        Domicilio
                                    </div>
                                ) : tableName === 'Orden Rápida' || !tableName ? (
                                    <div className="px-2 py-0.5 md:px-2.5 md:py-1 rounded md:rounded-lg font-bold text-[9px] md:text-xs uppercase md:normal-case tracking-wide md:tracking-normal bg-purple-50 dark:bg-purple-900/30 text-purple-600 md:text-purple-700 dark:text-purple-400 md:dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 flex items-center gap-1 md:gap-1.5">
                                        <span className="size-1 rounded-full bg-purple-500 md:hidden"></span>
                                        Orden Rápida
                                    </div>
                                ) : (
                                    <div className="px-2 py-0.5 md:px-2.5 md:py-1 rounded md:rounded-lg font-bold text-[9px] md:text-xs uppercase md:normal-case tracking-wide md:tracking-normal bg-gray-100 md:bg-emerald-50 dark:bg-gray-800 md:dark:bg-emerald-900/30 text-gray-600 md:text-emerald-700 dark:text-gray-400 md:dark:text-emerald-300 border border-gray-200 md:border-emerald-200 dark:border-gray-700 md:dark:border-emerald-800/50 flex items-center gap-1 md:gap-1.5">
                                        <span className="size-1 rounded-full bg-green-500 md:hidden"></span>
                                        <span className="material-symbols-outlined text-[16px] hidden md:inline leading-none">restaurant</span>
                                        {tableName.replace(/^T-/, 'Mesa ')}
                                    </div>
                                )}
                                {/* Botón Pedido (variante compact para header móvil). Solo se
                                    muestra en modo Catálogo y si el negocio lo tiene habilitado. */}
                                <ComandaLabelHeaderButton
                                    selection={comandaLabelSelection}
                                    onChange={(next) => onComandaLabelSelectionChange?.(next)}
                                    enabled={isComandaLabelShortcutEnabled}
                                    isCatalogMode={isCatalogMode}
                                    compact
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Cliente: solo visible en móvil chico (< 431px) y fuera del flujo de escaneo */}
                                {saleOrigin !== 'scanner' && (
                                    <div className="flex items-center gap-2 min-[431px]:hidden">
                                        {assignedClient ? (
                                            <div className="flex items-center gap-0.5 max-w-[200px]">
                                                <button
                                                    onClick={() => setIsClientSearchOpen(true)}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-l-full bg-gray-50 dark:bg-gray-800 border border-r-0 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all group"
                                                    title="Cambiar cliente"
                                                >
                                                    <span className="text-xs font-bold text-text-main dark:text-white truncate">
                                                        {assignedClient}
                                                    </span>
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        setAssignedClient('');
                                                        setSelectedClient(null);
                                                        if (onAssignClient) {
                                                            onAssignClient({ id: '', name: '', phone: '', address: '' });
                                                        }
                                                    }}
                                                    className="flex items-center justify-center size-[30px] rounded-r-full bg-gray-50 dark:bg-gray-800 border border-l-0 border-gray-200 dark:border-gray-700 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                    title="Quitar cliente"
                                                >
                                                    <span className="material-symbols-outlined text-[14px]">close</span>
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setIsClientSearchOpen(true)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 hover:border-primary hover:text-primary text-gray-400 transition-all group active:scale-95"
                                            >
                                                <span className="material-symbols-outlined text-[18px] group-hover:scale-110 transition-transform">person_add</span>
                                                <span className="text-xs font-bold">Cliente</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                                {cart.length > 0 && (
                                    <button
                                        onClick={() => setShowClearConfirm(true)}
                                        className="size-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 active:scale-95 transition-colors"
                                        title="Limpiar orden"
                                    >
                                        <span className="material-symbols-outlined text-[20px]">mop</span>
                                    </button>
                                )}
                            </div>
                        </>
                    ) : (
                        // Search Mode
                        <div className="flex items-center gap-2 w-full animate-[fadeIn_0.2s]">
                            <div className="relative flex-1">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
                                    <span className="material-symbols-outlined text-[18px]">search</span>
                                </span>
                                <input
                                    type="text"
                                    value={clientSearchQuery}
                                    onChange={(e) => {
                                        setClientSearchQuery(e.target.value);
                                        setHighlightedClientIndex(-1);
                                    }}
                                    onKeyDown={handleClientSearchKeyDown}
                                    placeholder="Buscar cliente..."
                                    autoFocus
                                    autoComplete="off"
                                    className="w-full pl-9 pr-3 py-1.5 bg-gray-100 dark:bg-gray-800 border-none rounded-lg text-sm text-text-main dark:text-white placeholder:text-gray-400 focus:ring-1 focus:ring-primary"
                                />
                                {clientSearchQuery && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden z-50 max-h-48 overflow-y-auto">
                                        {filteredClients.length > 0 ? (
                                            filteredClients.map((client, idx) => (
                                                <button
                                                    key={client.id}
                                                    onMouseEnter={() => setHighlightedClientIndex(idx)}
                                                    onClick={() => {
                                                        handleSelectClient({ id: client.id, name: client.name, id_number: client.id_number, phone: client.phone, address: client.address });
                                                    }}
                                                    className={`w-full text-left px-3 py-2 flex flex-col border-b border-gray-50 dark:border-gray-800 last:border-0 ${highlightedClientIndex === idx ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                                                >
                                                    <span className="text-xs font-bold text-gray-900 dark:text-white">{client.name}</span>
                                                    {client.phone && <span className="text-[10px] text-gray-500">{client.phone}</span>}
                                                </button>
                                            ))
                                        ) : (
                                            <div className="p-3 text-center">
                                                <p className="text-xs text-gray-500">No se encontraron resultados</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => {
                                    setIsClientSearchOpen(false); // Close search when opening modal
                                    setShowCreateClientModal(true);
                                }}
                                className="size-9 bg-primary/10 text-primary border border-primary/20 rounded-lg flex items-center justify-center active:scale-95"
                                title="Crear Cliente"
                            >
                                <span className="material-symbols-outlined text-[20px]">add</span>
                            </button>
                            <button
                                onClick={() => {
                                    setIsClientSearchOpen(false);
                                    setClientSearchQuery('');
                                }}
                                className="size-9 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg flex items-center justify-center active:scale-95 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>
                    )}
                </div>
                {/* Row 2: Title + items count */}
                {!isClientSearchOpen && (
                    <div className="flex items-center justify-between mt-1.5">
                        <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Detalles</h2>
                        <span className="text-[10px] text-gray-400 font-medium">{cart.length} items</span>
                    </div>
                )}
                {/* Banner de solo lectura en modo mesa: distingue observador offline
                    de eje sin conexión (Req 5.3, 16.3). */}
                {tablesReadOnly && tablesGate.readOnlyMessage && (
                    <div className="mt-2">
                        <TablesReadOnlyBanner
                            reason={tablesGate.readOnlyReason}
                            message={tablesGate.readOnlyMessage}
                            compact
                        />
                    </div>
                )}
            </header>

            {/* Items Lista Compacta */}
            <div className="flex-1 overflow-y-auto min-h-0 pb-36">
                {(() => {
                    const topItems = [...cart].filter(it => !it.parentOrderItemId).reverse();
                    const renderRow = (item: typeof topItems[number], index: number) => {
                        const children = cart.filter(c => c.parentOrderItemId === item.orderItemId);
                        return (
                            <CartItemRow
                                key={item.orderItemId || `local-${item.id}-${index}-${item.cookingTerm || ''}-${(item.removedIngredients || []).join(',')}`}
                                item={item}
                                index={index}
                                onRemove={() => { if (blockTableWrite()) return; removeFromCart(item); children.forEach(c => removeFromCart(c)); }}
                                onUpdateQuantity={(delta) => { if (blockTableWrite()) return; updateQuantity(item, delta); children.forEach(c => updateQuantity(c, delta)); }}
                                onEditProduct={(isCatalogMode && onEditProduct) ? () => onEditProduct(item as any) : undefined}
                                onDiscount={() => setDiscountItem(item)}
                                defaultExpanded={isCatalogMode}
                                flat={isCatalogMode}
                                readOnly={tablesReadOnly}
                                modifierTags={children.map(c => c.name)}
                                extraAmount={children.reduce((s, c) => s + c.price * c.quantity, 0)}
                            />
                        );
                    };

                    // Modo mesa con items ya enviados a cocina: separar nuevos / enviados con divisor.
                    if (tableId) {
                        const newItems = topItems.filter(it => !SENT_STATUSES.includes((it as any).status || 'pending'));
                        const sentItems = topItems.filter(it => SENT_STATUSES.includes((it as any).status || ''));
                        if (sentItems.length > 0) {
                            let idx = 0;
                            return (
                                <>
                                    {newItems.map(item => renderRow(item, idx++))}
                                    <div className="flex items-center gap-2 py-2 px-3">
                                        <div className="flex-1 h-px bg-slate-200 dark:bg-gray-700" />
                                        <span className="text-[11px] font-semibold text-slate-400">Comanda enviada</span>
                                        <div className="flex-1 h-px bg-slate-200 dark:bg-gray-700" />
                                    </div>
                                    {sentItems.map(item => renderRow(item, idx++))}
                                </>
                            );
                        }
                    }

                    return topItems.map((item, index) => renderRow(item, index));
                })()}

                {cart.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 text-text-secondary opacity-50">
                        <span className="material-symbols-outlined text-5xl mb-3">shopping_cart_off</span>
                        <p className="font-medium text-sm">Tu orden está vacía</p>
                    </div>
                )}
            </div>

            {/* FAB Enviar Comanda — flotante en el área del carrito, justo encima
                del footer. Solo en modo mesa con items nuevos pendientes. */}
            {onSendCommanda && tableId && hasPendingNewItems && !tablesReadOnly && (
                <button
                    onClick={() => { if (!tablesGate.verifyCanWriteNow()) { showToast(tablesGate.readOnlyMessage ?? 'Mesas en solo lectura sin conexión', 'warning'); return; } onSendCommanda(); }}
                    title="Enviar comanda a cocina"
                    className="absolute bottom-[100px] right-4 z-30 flex items-center gap-2 h-11 px-4 rounded-full bg-white dark:bg-gray-800 border border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400 text-[13px] font-bold shadow-lg shadow-emerald-900/10 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 active:scale-95 transition-all"
                >
                    <span className="material-symbols-outlined text-[18px]">print</span>
                    Enviar Comanda
                </button>
            )}

            {/* Footer Flotante */}
            <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-surface-dark border-t border-gray-100 dark:border-gray-800 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-30">
                <div className="max-w-[430px] mx-auto p-3">
                    <div className="flex gap-2">
                        <button
                            onClick={() => onNavigate(backScreen)}
                            className="h-14 px-5 rounded-xl font-bold text-sm border border-primary bg-primary text-[#102218] flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all hover:bg-primary/85 shadow-sm"
                            title="Agregar más productos"
                        >
                            <span className="material-symbols-outlined text-[18px]">add</span>
                            Agregar
                        </button>

                        <button
                            onClick={() => { if (puedeCobrar) setStep('payment'); }}
                            disabled={cart.length === 0 || !puedeCobrar}
                            title={!puedeCobrar ? (tablesReadOnly ? (tablesGate.readOnlyMessage ?? 'Mesas en solo lectura') : 'No tienes permiso para finalizar ventas') : undefined}
                            className={`flex-1 h-14 rounded-xl font-bold text-lg shadow-lg transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 disabled:cursor-not-allowed ${cart.length === 0 || !puedeCobrar ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 shadow-none' : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-gray-900/20 dark:shadow-none hover:bg-gray-800 dark:hover:bg-gray-100'}`}
                        >
                            <span className={`material-symbols-outlined text-[20px] ${cart.length === 0 || !puedeCobrar ? 'text-gray-500 dark:text-gray-400' : 'text-primary'}`}>{puedeCobrar ? 'payments' : 'lock'}</span>
                            Pagar
                            <span className="font-black">${formatCurrency(total)}</span>
                        </button>
                    </div>
                </div>
            </div>

            {showClearConfirm && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[100] flex items-center justify-center animate-[fadeIn_0.15s_ease-out]">
                    <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 mx-4 max-w-sm w-full animate-[fadeIn_0.2s_ease-out]">
                        <div className="flex flex-col items-center text-center gap-3">
                            <div className="size-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                                <span className="material-symbols-outlined text-red-500 text-[24px]">mop</span>
                            </div>
                            <h3 className="text-lg font-semibold text-text-main dark:text-white">¿Limpiar orden?</h3>
                            <p className="text-sm text-gray-500">Se eliminarán todos los productos del carrito.</p>
                            <div className="flex gap-3 w-full mt-2">
                                <button
                                    onClick={() => setShowClearConfirm(false)}
                                    className="flex-1 h-10 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => {
                                        onClearCart?.();
                                        setShowClearConfirm(false);
                                        onNavigate(backScreen);
                                    }}
                                    className="flex-1 h-10 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors"
                                >
                                    Limpiar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    // Tabs de modo de pago (Pago Directo / Crédito). Se renderizan en el
    // header del layout móvil/tablet, no dentro del body — por eso `renderPaymentContent`
    // ya no las incluye. Se extraen aquí para evitar duplicar el markup.
    const renderPaymentModeTabs = (compact = false) => (
        <div className={`flex ${compact ? 'p-0.5' : 'p-1'} bg-slate-100/80 dark:bg-gray-800/40 rounded-xl relative z-10 select-none`}>
            <button
                onClick={() => setPaymentMode('payment')}
                className={`flex-1 ${compact ? 'py-2 px-2' : 'py-2.5 px-3'} rounded-lg font-bold text-[11px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5
                    ${paymentMode === 'payment'
                        ? 'bg-white dark:bg-gray-750 text-slate-800 dark:text-slate-100 shadow-sm border border-slate-200/50 dark:border-gray-700/50'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-350'}`}
            >
                <span className="material-symbols-outlined text-[16px]">payments</span>
                Pago Directo
            </button>
            <button
                onClick={() => setPaymentMode('credit')}
                className={`flex-1 ${compact ? 'py-2 px-2' : 'py-2.5 px-3'} rounded-lg font-bold text-[11px] uppercase tracking-wider transition-all flex items-center justify-center gap-1.5
                    ${paymentMode === 'credit'
                        ? 'bg-white dark:bg-gray-750 text-slate-800 dark:text-slate-100 shadow-sm border border-slate-200/50 dark:border-gray-700/50'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-350'}`}
            >
                <span className="material-symbols-outlined text-[16px]">assignment_ind</span>
                Crédito
            </button>
        </div>
    );

    // --- SHARED CONTENT (Used only for Mobile now) ---
    const renderPaymentContent = () => (
        <>
            {/* Customer Search */}
            {/* Customer Search with Dropdown */}
            <div className="relative z-20">
                <label htmlFor="payment-client-search" className="text-sm font-bold text-text-main dark:text-white mb-2 block">
                    Asignar a Cliente {paymentMode === 'credit' && <span className="text-red-500">*</span>}
                </label>
                <div className="relative group flex gap-2">
                    <div className="relative flex-1">
                        {selectedClient ? (
                            <div className="flex flex-col gap-1.5">
                                <div className="h-[46px] flex items-center justify-between p-1.5 bg-white dark:bg-gray-800/40 border border-slate-200 dark:border-gray-800 rounded-xl shadow-sm animate-[fadeIn_0.2s]">
                                    <div className="flex items-center gap-2 bg-slate-50 dark:bg-gray-800/60 py-1 pl-1.5 pr-3 rounded-lg border border-slate-200/60 dark:border-gray-700/60 h-full flex-1 min-w-0">
                                        <div className="size-6 shrink-0 bg-slate-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-slate-650 dark:text-slate-350">
                                            <span className="material-symbols-outlined text-[14px]">person</span>
                                        </div>
                                        <span className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">
                                            {selectedClient.name}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-0.5 shrink-0 ml-1">
                                        <button
                                            onClick={handleOpenEditClient}
                                            className="size-8 flex items-center justify-center text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-gray-800 rounded-full transition-all"
                                            title="Editar cliente"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">edit</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                setSelectedClient(null);
                                                setAssignedClient('');
                                                setClientSearchQuery('');
                                                setIsEditingClient(false);
                                            }}
                                            className="size-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-full transition-all"
                                            title="Remover cliente"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">close</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Panel de edición inline */}
                                {isEditingClient && (
                                    <div className="bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-gray-800 rounded-xl p-3 space-y-2.5 animate-[fadeIn_0.15s_ease-out]">
                                        <div className="flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-[15px] text-slate-500 dark:text-slate-400">edit</span>
                                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Editar datos del cliente</span>
                                        </div>
                                        <input
                                            autoFocus
                                            type="text"
                                            value={editClientForm.name}
                                            onChange={e => setEditClientForm(p => ({ ...p, name: e.target.value }))}
                                            placeholder="Nombre"
                                            autoComplete="off"
                                            className="w-full px-3 py-2.5 text-sm font-semibold bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl outline-none focus:border-slate-400 dark:focus:border-gray-700 text-slate-800 dark:text-slate-100 placeholder:text-gray-400 transition-colors"
                                        />
                                        <input
                                            type="tel"
                                            value={editClientForm.phone}
                                            onChange={e => setEditClientForm(p => ({ ...p, phone: e.target.value }))}
                                            placeholder="Teléfono"
                                            autoComplete="off"
                                            className="w-full px-3 py-2.5 text-sm font-semibold bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl outline-none focus:border-slate-400 dark:focus:border-gray-700 text-slate-800 dark:text-slate-100 placeholder:text-gray-400 transition-colors"
                                        />
                                        <input
                                            type="text"
                                            value={editClientForm.address}
                                            onChange={e => setEditClientForm(p => ({ ...p, address: e.target.value }))}
                                            placeholder="Dirección"
                                            autoComplete="off"
                                            className="w-full px-3 py-2.5 text-sm font-semibold bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-xl outline-none focus:border-slate-400 dark:focus:border-gray-700 text-slate-800 dark:text-slate-100 placeholder:text-gray-400 transition-colors"
                                        />
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleSaveEditClient}
                                                disabled={!editClientForm.name.trim() || isSavingClient}
                                                className="flex-1 h-10 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors border border-transparent"
                                            >
                                                {isSavingClient ? (
                                                    <svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                                ) : (
                                                    <><span className="material-symbols-outlined text-[16px]">check</span>Guardar</>  
                                                )}
                                            </button>
                                            <button
                                                onClick={() => setIsEditingClient(false)}
                                                className="h-10 px-4 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-bold hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
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
                                    id="payment-client-search"
                                    type="text"
                                    value={clientSearchQuery}
                                    onChange={(e) => {
                                        setClientSearchQuery(e.target.value);
                                        setIsClientSearchOpen(true);
                                        setHighlightedClientIndex(-1);
                                        if (!e.target.value) setSelectedClient(null);
                                    }}
                                    onFocus={() => setIsClientSearchOpen(true)}
                                    onKeyDown={handleClientSearchKeyDown}
                                    // onBlur={() => setTimeout(() => setIsClientSearchOpen(false), 200)} // Removed to prevent closing when clicking dropdown
                                    autoComplete="off"
                                    className="w-full pl-4 pr-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium text-text-main dark:text-white placeholder:text-gray-400 shadow-sm text-sm outline-none"
                                    placeholder="Buscar cliente..."
                                />

                                {/* Dropdown */}
                                {isClientSearchOpen && clientSearchQuery && filteredClients.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto">
                                        {filteredClients.map((client, idx) => (
                                            <button
                                                key={client.id}
                                                onMouseEnter={() => setHighlightedClientIndex(idx)}
                                                onClick={() => handleSelectClient({ id: client.id, name: client.name, id_number: client.id_number, phone: client.phone, address: client.address })}
                                                className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-3 border-b border-gray-50 dark:border-gray-700/50 last:border-none ${highlightedClientIndex === idx ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                                            >
                                                <div className="size-8 bg-primary/10 dark:bg-primary/20 rounded-full flex items-center justify-center">
                                                    <span className="material-symbols-outlined text-primary text-[16px]">person</span>
                                                </div>
                                                <div className="flex-1">
                                                    <p className="text-sm font-bold text-text-main dark:text-white">{client.name}</p>
                                                    <p className="text-xs text-gray-500">{client.phone || 'Sin teléfono'}</p>
                                                </div>
                                                {client.current_debt > 0 && (
                                                    <span className="text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">
                                                        Deuda: ${formatCurrency(client.current_debt)}
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    <button
                        onClick={() => setShowCreateClientModal(true)}
                        className="h-[46px] px-3 shrink-0 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-800 hover:border-slate-350 dark:hover:border-gray-700 text-slate-650 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-gray-800/50 rounded-xl flex items-center justify-center gap-1 transition-all active:scale-95 shadow-sm"
                        title="Crear Nuevo Cliente"
                    >
                        <span className="material-symbols-outlined text-[18px]">person_add</span>
                        <span className="text-xs font-bold uppercase tracking-wider">Crear</span>
                    </button>
                </div>
            </div>

            {/* Discount Input - Split */}
            <div>
                <label htmlFor="payment-discount-percent" className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 block">Descuento</label>
                <div className="flex items-center gap-2">
                    <div className="relative group flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">%</span>
                        <input
                            id="payment-discount-percent"
                            type="text"
                            inputMode="none"
                            readOnly
                            value={discountPercent}
                            onClick={() => setActiveInput('discountPercent')}
                            autoComplete="off"
                            className={`w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border rounded-xl transition-all font-medium text-slate-800 dark:text-slate-100 placeholder:text-gray-400 shadow-sm text-sm cursor-pointer outline-none
                                ${activeInput === 'discountPercent' ? 'border-slate-400 dark:border-gray-700 ring-2 ring-slate-400/10' : 'border-slate-200 dark:border-gray-800'}`}
                            placeholder="0"
                        />
                    </div>
                    <span className="text-gray-400 font-bold">=</span>
                    <div className="relative group flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                        <input
                            type="text"
                            inputMode="none"
                            readOnly
                            value={discount}
                            onClick={() => setActiveInput('discountAmount')}
                            autoComplete="off"
                            className={`w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-800 border rounded-xl transition-all font-medium text-slate-800 dark:text-slate-100 placeholder:text-gray-400 shadow-sm text-sm cursor-pointer outline-none
                                ${activeInput === 'discountAmount' ? 'border-slate-400 dark:border-gray-700 ring-2 ring-slate-400/10' : 'border-slate-200 dark:border-gray-800'}`}
                            placeholder="0.00"
                        />
                    </div>
                </div>
            </div>

            {paymentMode === 'payment' ? (
                <>
                    {/* Mixed Payment Toggle */}
                    <button
                        onClick={() => {
                            setIsMixedPayment(prev => !prev);
                            setMethod('');
                            setMixedAmounts({});
                            setCashGiven('');
                        }}
                        className={`w-full py-3 mb-4 rounded-xl border font-bold text-sm uppercase tracking-wide flex items-center justify-center gap-2 transition-all shadow-sm
                            ${isMixedPayment
                                ? 'border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 dark:border-slate-700'
                                : 'border-slate-200 dark:border-gray-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-350 bg-white dark:bg-gray-800/40 hover:border-slate-300 dark:hover:border-gray-700'}`}
                    >
                        <span className="material-symbols-outlined text-[20px]">call_split</span>
                        Pago Dividido
                    </button>

                    {isMixedPayment ? (
                        <div ref={mixedSectionRef} className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
                            <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-100">Dividir entre métodos</h3>
                            <div className="space-y-3">
                                {paymentMethods.map(m => (
                                    <div key={m} className="flex items-center gap-3">
                                        <span className="text-sm font-bold text-slate-650 dark:text-slate-355 w-28 truncate">{m}</span>
                                        <div className="relative group flex-1">
                                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-lg">$</span>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                value={mixedAmounts[m] ? formatInput(mixedAmounts[m]) : ''}
                                                onChange={(e) => {
                                                    const rawValue = e.target.value.replace(/\D/g, '');
                                                    handleMixedAmountChange(m, rawValue);
                                                }}
                                                onFocus={() => setActiveInput(`native-mixed-${m}`)}
                                                onBlur={() => setActiveInput(null)}
                                                autoComplete="off"
                                                placeholder="0"
                                                className={`w-full h-[52px] pl-10 pr-4 font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-gray-800/40 border border-slate-200 dark:border-gray-800 rounded-2xl focus:outline-none transition-all shadow-sm placeholder:text-gray-350 ${getFontSize(formatInput(mixedAmounts[m] || ''))}
                                                ${activeInput === `native-mixed-${m}` ? 'border-slate-400 dark:border-gray-700 ring-2 ring-slate-400/10' : 'hover:border-slate-300 dark:hover:border-gray-700'}`}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className={`flex items-center justify-between p-4 rounded-2xl border transition-colors ${mixedRemaining === 0
                                    ? 'border-emerald-250 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900/30'
                                    : mixedRemaining < 0
                                        ? 'border-rose-250 bg-rose-50/50 dark:bg-rose-950/20 dark:border-rose-900/30'
                                        : 'border-amber-250 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/30'
                                }`}>
                                <span className={`text-sm font-bold uppercase tracking-widest flex items-center gap-1.5 ${mixedRemaining === 0 ? 'text-emerald-600 dark:text-emerald-450' : mixedRemaining < 0 ? 'text-rose-600 dark:text-rose-450' : 'text-amber-600 dark:text-amber-450'}`}>
                                    {mixedRemaining === 0 ? <><span className="material-symbols-outlined text-emerald-500 text-xl">check_circle</span> Completo</> : mixedRemaining < 0 ? 'Excedido' : 'Restante'}
                                </span>
                                <span className={`text-2xl font-black tracking-tight ${mixedRemaining === 0 ? 'text-emerald-600 dark:text-emerald-400'
                                        : mixedRemaining < 0 ? 'text-rose-600 dark:text-rose-455'
                                            : 'text-amber-600 dark:text-amber-400'
                                    }`}>
                                    ${formatCurrency(Math.abs(mixedRemaining))}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="font-semibold text-lg text-slate-800 dark:text-slate-100">Método de Pago</h3>
                                    {/* Métodos de pago fijos: no se pueden crear, renombrar ni borrar */}
                                </div>
                                <div className="grid grid-cols-3 gap-3 sm:gap-4">
                                    {paymentMethods.map((m, idx) => {
                                        const isSelected = method === m;
                                        const isEfectivo = m === 'Efectivo';
                                        const isTargeted = editingMethod?.index === idx;

                                        return (
                                            <button
                                                key={m}
                                                onClick={() => {
                                                    if (!isEditingMethods) { setMethod(m); return; }
                                                    if (!isEfectivo) setEditingMethod({ index: idx, value: m });
                                                }}
                                                className={`relative flex items-center justify-center h-14 sm:h-16 rounded-2xl border transition-all duration-200 overflow-visible
                                                    ${!isEditingMethods && isSelected
                                                        ? 'border-slate-800 dark:border-slate-350 bg-white dark:bg-gray-800/80 shadow-md ring-1 ring-slate-800 dark:ring-slate-350 scale-[1.02]'
                                                        : isEditingMethods && isTargeted
                                                            ? 'border-slate-300 bg-slate-50 dark:border-gray-655 dark:bg-gray-800/80 ring-2 ring-slate-200 dark:ring-gray-700'
                                                            : 'border-slate-200 dark:border-gray-800 bg-white dark:bg-surface-dark hover:border-slate-300 dark:hover:border-gray-700 hover:scale-[1.01]'}
                                                    ${isEditingMethods && !isEfectivo && !isTargeted ? 'animate-[wiggle_0.2s_infinite]' : ''}
                                                    ${isEditingMethods && !isEfectivo ? 'cursor-pointer' : ''}
                                                `}
                                            >
                                                {isEditingMethods && !isEfectivo && (
                                                    <div
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteMethod(m); }}
                                                        className="absolute -top-1.5 -right-1.5 size-5 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800/50 text-red-400 rounded-full flex items-center justify-center z-20 hover:bg-red-500 hover:text-white transition-all cursor-pointer"
                                                    >
                                                        <span className="material-symbols-outlined text-[11px] font-bold">close</span>
                                                    </div>
                                                )}
                                                <span className={`font-bold text-xs px-1 text-center leading-tight transition-colors ${!isEditingMethods && isSelected
                                                        ? 'text-slate-900 dark:text-white'
                                                        : isEditingMethods && isTargeted
                                                            ? 'text-slate-900 dark:text-gray-200'
                                                            : 'text-slate-500 dark:text-slate-400'
                                                    }`}>{m}</span>
                                            </button>
                                        );
                                    })}

                                </div>

                                {/* Edit bar - clean, below grid */}
                                {isEditingMethods && editingMethod !== null && (
                                    <div className="mt-3 flex items-center gap-1.5 bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-gray-800 rounded-2xl px-3 py-2 animate-[fadeIn_0.15s]">
                                        <span className="material-symbols-outlined text-[15px] text-slate-450 shrink-0">edit</span>
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
                                            className="flex-1 min-w-0 text-sm font-semibold bg-transparent border-none outline-none text-slate-800 dark:text-slate-100 placeholder:text-gray-400"
                                            placeholder="Renombrar..."
                                        />
                                        <button
                                            onMouseDown={(e) => { e.preventDefault(); handleRenameMethod(editingMethod.index, editingMethod.value); }}
                                            aria-label="Guardar"
                                            className="size-8 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">check</span>
                                        </button>
                                        <button
                                            onMouseDown={(e) => { e.preventDefault(); setEditingMethod(null); }}
                                            className="size-7 bg-slate-200 dark:bg-gray-700 text-slate-500 rounded-lg flex items-center justify-center shrink-0 hover:bg-slate-300 dark:hover:bg-gray-600 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">close</span>
                                        </button>
                                    </div>
                                )}

                                {/* Add bar - clean, below grid */}
                                {isAdmin && isAddingMethod && (
                                    <div className="mt-3 flex items-center gap-1.5 bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-gray-800 rounded-2xl px-3 py-2 animate-[fadeIn_0.15s]">
                                        <span className="material-symbols-outlined text-[15px] text-slate-450 shrink-0">add</span>
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
                                            className="flex-1 min-w-0 text-sm font-semibold bg-transparent border-none outline-none text-slate-800 dark:text-slate-100 placeholder:text-gray-400"
                                            placeholder="Nombre del método..."
                                        />
                                        <button
                                            onMouseDown={(e) => { e.preventDefault(); handleAddMethod(); }}
                                            aria-label="Agregar"
                                            className="size-8 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">check</span>
                                        </button>
                                        <button
                                            onMouseDown={(e) => { e.preventDefault(); setIsAddingMethod(false); setNewMethodName(''); }}
                                            className="size-7 bg-slate-200 dark:bg-gray-700 text-slate-500 rounded-lg flex items-center justify-center shrink-0 hover:bg-slate-300 dark:hover:bg-gray-600 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">close</span>
                                        </button>
                                    </div>
                                )}
                            </div>

                            {method === 'Efectivo' && (
                                <div ref={cashSectionRef} className="mt-4 animate-[fadeIn_0.2s_ease-out]">
                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Cash Input Section */}
                                        <div className="space-y-2">
                                            <label htmlFor="payment-cash-given" className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase">
                                                Efectivo Recibido
                                            </label>
                                            <div className="relative group">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-800 dark:text-slate-100 font-bold text-xl">$</span>
                                                <input
                                                    id="payment-cash-given"
                                                    type="text"
                                                    inputMode="none"
                                                    readOnly
                                                    value={formatInput(cashGiven)}
                                                    onClick={() => setActiveInput('cashGiven')}
                                                    autoComplete="off"
                                                    placeholder={formatCurrency(finalTotal)}
                                                    className={`w-full h-[60px] pl-8 pr-4 font-bold text-slate-800 dark:text-slate-100 bg-white dark:bg-gray-800/40 border border-slate-200 dark:border-gray-800 rounded-2xl focus:outline-none transition-all shadow-sm placeholder:text-gray-400 cursor-pointer ${getFontSize(formatInput(cashGiven))}
                                        ${activeInput === 'cashGiven' ? 'border-slate-400 dark:border-gray-700 ring-2 ring-slate-400/10' : 'border-slate-200 hover:border-slate-300 dark:border-gray-800 dark:hover:border-gray-700'}`}
                                                />
                                            </div>
                                        </div>

                                        {/* Change Display */}
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase">
                                                Cambio
                                            </label>
                                            <div className="h-[60px] flex items-center justify-between px-4 bg-rose-50/50 dark:bg-rose-950/20 rounded-2xl border border-rose-100 dark:border-rose-900/30">
                                                <span className="text-2xl font-black text-rose-600 dark:text-rose-450 tracking-tight">
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
            ) : (
                <div className="flex-1 space-y-4">
                    {/* Abono inicial */}
                    <div>
                        <label htmlFor="payment-credit-due-date" className="block text-sm font-bold text-text-main dark:text-white mb-2">Fecha de Pago Acordada <span className="text-red-500">*</span></label>
                        <input
                            id="payment-credit-due-date"
                            type="date"
                            value={creditDueDate}
                            min={new Date().toISOString().split('T')[0]}
                            onChange={(e) => setCreditDueDate(e.target.value)}
                            autoComplete="off"
                            className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm font-bold text-text-main dark:text-white shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all mb-4"
                        />
                    </div>
                    <div>
                        <label htmlFor="payment-credit-abono" className="block text-sm font-bold text-text-main dark:text-white mb-2">Abono inicial <span className="text-gray-400 font-normal">(opcional)</span></label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                            <input
                                id="payment-credit-abono"
                                type="text"
                                inputMode="numeric"
                                value={creditAbonoAmount}
                                onChange={(e) => {
                                    const raw = e.target.value.replace(/\D/g, '');
                                    setCreditAbonoAmount(raw ? Number(raw).toLocaleString('es-ES') : '');
                                }}
                                placeholder="0"
                                autoComplete="off"
                                className="w-full pl-12 pr-4 py-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-base font-bold text-text-main dark:text-white placeholder:text-gray-400 shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            />
                        </div>
                        {safeEvaluate(creditAbonoAmount) > 0 && activeShift && (
                            <div className="mt-2">
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Medio de pago</label>
                                <div className="grid grid-cols-3 gap-1.5">
                                    {paymentMethods.map(m => (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => setCreditAbonoPaymentMethod(m)}
                                            className={`py-1.5 px-1 rounded-lg border text-[11px] font-bold transition-all truncate ${creditAbonoPaymentMethod === m
                                                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                                                    : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'
                                                }`}
                                        >
                                            {m}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {safeEvaluate(creditAbonoAmount) > 0 && !activeShift && (
                            <input
                                type="text"
                                value={creditAbonoNote}
                                onChange={(e) => setCreditAbonoNote(e.target.value)}
                                autoComplete="off"
                                placeholder="Descripción del abono (ej: Pago en efectivo)"
                                className="mt-2 w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-sm text-text-main dark:text-white placeholder:text-gray-400 shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                            />
                        )}
                    </div>
                    {/* Nota de crédito */}
                    <div>
                        <label htmlFor="payment-credit-note" className="block text-xs font-semibold text-text-secondary mb-1.5">Nota de Crédito</label>
                        <textarea id="payment-credit-note" rows={3} placeholder="Agregar notas adicionales..." value={creditNote} onChange={(e) => setCreditNote(e.target.value)} className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-text-main dark:text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all resize-none" />
                    </div>
                </div>
            )}
        </>
    );

    const renderMobilePayment = () => (
        <div className="flex flex-col h-full bg-background-light dark:bg-background-dark animate-slideInRight">
            <header className="bg-surface-light dark:bg-surface-dark px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0 shadow-[0_2px_10px_rgba(0,0,0,0.03)] z-20 flex items-center gap-3 sticky top-0">
                <button
                    onClick={() => onNavigate(backScreen)}
                    className="group size-10 flex items-center justify-center rounded-xl bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm text-text-secondary hover:text-text-main transition-all active:scale-95 shrink-0"
                    title="Volver"
                >
                    <span className="material-symbols-outlined text-[22px] group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
                </button>
                {/* Tabs Pago Directo / Crédito ocupan el espacio del antiguo título. */}
                <div className="flex-1 min-w-0">
                    {renderPaymentModeTabs(true)}
                </div>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
                {renderPaymentContent()}
            </div>

            <div className="p-4 bg-surface-light dark:bg-surface-dark border-t border-gray-200 dark:border-gray-800 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] pb-safe">
                <div className="flex justify-between items-end mb-4 px-1">
                    <span className="text-xs font-bold text-text-secondary uppercase tracking-widest">Total a Pagar</span>
                    <span className="text-3xl font-black text-text-main dark:text-white tracking-tighter">${formatCurrency(finalTotal)}</span>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => onNavigate(backScreen)}
                        className="h-14 px-5 rounded-xl font-bold text-sm border border-primary bg-primary text-[#102218] flex items-center justify-center gap-1.5 active:scale-[0.97] transition-all hover:bg-primary/85 shadow-sm"
                        title="Agregar más productos"
                    >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                        Agregar
                    </button>
                    <button
                        onClick={handleFinalize}
                        disabled={(paymentMode === 'payment' && !isMixedPayment && !method) || (isMixedPayment && mixedRemaining !== 0) || (paymentMode === 'credit' && !creditDueDate) || isProcessing}
                        className={`flex-1 h-14 rounded-xl font-bold text-lg shadow-lg transition-all transform active:scale-[0.98] flex items-center justify-center gap-2 ${(paymentMode === 'payment' && !isMixedPayment && !method) || (isMixedPayment && mixedRemaining !== 0) || isProcessing ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed shadow-none' : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-gray-900/20 dark:shadow-none hover:bg-gray-800 dark:hover:bg-gray-100'}`}
                    >
                        {isProcessing ? (
                            <>
                                <svg className="animate-spin size-5" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Procesando...
                            </>
                        ) : (
                            <>
                                {paymentMode === 'payment' ? 'Finalizar Venta' : 'Confirmar Crédito'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <div className="flex-1 h-full overflow-hidden flex flex-col relative">
            {/* Render for Mobile */}
            {step === 'summary' ? renderMobileSummary() : renderMobilePayment()}

            {activeInput && !activeInput.startsWith('native-') && (
                <Numpad
                    onPress={handlePadPress}
                    onClose={() => setActiveInput(null)}
                    className="absolute bottom-0 left-0 right-0 z-50"
                >
                    {activeInput === 'cashGiven' && (
                        <div className="px-4 pb-4 animate-[fadeIn_0.2s]">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Efectivo Recibido</label>
                                    <div className={`h-14 flex items-center px-2 rounded-xl border ring-1 ring-gray-900/5 ${activeInput === 'cashGiven' ? 'bg-white dark:bg-zinc-800 border-gray-900 dark:border-white' : 'bg-gray-50 border-transparent'}`}>
                                        <span className={`font-bold text-gray-900 dark:text-white ${getFontSize(formatInput(cashGiven))}`}>
                                            ${formatInput(cashGiven) || '0'}
                                        </span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cambio</label>
                                    <div className="h-14 flex items-center px-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50">
                                        <span className={`font-bold text-red-600 dark:text-red-400 ${getFontSize(formatCurrency(change))}`}>
                                            ${change >= 0 ? formatCurrency(change) : '0'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {(activeInput === 'discountPercent' || activeInput === 'discountAmount') && (
                        <div className="px-3 pb-3">
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onPointerDown={() => setActiveInput('discountPercent')}
                                    className={`text-left p-2 rounded-xl border transition-all ${activeInput === 'discountPercent' ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-zinc-800/50'}`}
                                >
                                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">Descuento %</span>
                                    <div className="flex items-baseline gap-1 mt-0.5">
                                        <span className={`text-xl font-black ${activeInput === 'discountPercent' ? 'text-primary' : 'text-gray-700 dark:text-gray-200'}`}>
                                            {discountPercent || '0'}
                                        </span>
                                        <span className="text-sm font-bold text-gray-400">%</span>
                                    </div>
                                </button>
                                <button
                                    onPointerDown={() => setActiveInput('discountAmount')}
                                    className={`text-left p-2 rounded-xl border transition-all ${activeInput === 'discountAmount' ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-zinc-800/50'}`}
                                >
                                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">Descuento $</span>
                                    <div className="flex items-baseline gap-1 mt-0.5">
                                        <span className="text-sm font-bold text-gray-400">$</span>
                                        <span className={`text-xl font-black ${activeInput === 'discountAmount' ? 'text-primary' : 'text-gray-700 dark:text-gray-200'}`}>
                                            {discount || '0'}
                                        </span>
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}
                </Numpad>
            )}

            {/* Create Client Modal */}
            {showCreateClientModal && (
                <CreateClientModal
                    onClose={() => setShowCreateClientModal(false)}
                    onSave={async (data) => {
                        try {
                            const newClient = await createClient({
                                name: data.name,
                                phone: data.phone,
                                email: data.email,
                                address: data.address,
                                id_number: data.idNumber,
                            });
                            if (newClient) {
                                handleSelectClient({ id: newClient.id, name: newClient.name });
                            }
                            setShowCreateClientModal(false);
                        } catch (e) {
                            console.error(e);
                        }
                    }}
                />
            )}
            {/* Discount Modal */}
            {discountItem && (
                <DiscountModal
                    onClose={() => setDiscountItem(null)}
                    onApply={handleApplyDiscount}
                    itemName={discountItem.name}
                    itemPrice={discountItem.price * discountItem.quantity}
                    initialDiscount={discountItem.discount}
                    initialDiscountPercent={discountItem.discountPercent}
                />
            )}
        </div>
    );
};
