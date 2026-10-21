import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useRefunds, RefundItemInput } from '../../hooks/useRefunds';
import { useBusinessPaymentMethods } from '../../lib/paymentMethods';
import { formatQty } from '../../lib/formatters';

interface SearchResult {
    id: string;
    order_number: number;
    display_number: string | null;
    customer_name: string | null;
    total: number;
    created_at: string;
    payment_method?: string;
}

interface RefundSaleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onDone?: () => void;
    hasOpenShift: boolean;
    /** Si se pasa, el modal omite la búsqueda y carga esta venta directamente (uso desde SalesScreen). */
    presetOrder?: SearchResult | null;
}

interface RefundLine {
    order_item_id: string;
    product_name: string;
    sold: number;
    alreadyRefunded: number;
    unit_price: number;
    total_price: number;
    isRetail: boolean;
    qty: number;
    restock: boolean;
}

const REFUND_REASONS = [
    'Producto defectuoso',
    'Cliente insatisfecho',
    'Error en la venta',
    'Otro',
];

const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat('es-CO', { style: 'decimal', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

export const RefundSaleModal: React.FC<RefundSaleModalProps> = ({ isOpen, onClose, onDone, hasOpenShift, presetOrder }) => {
    const { profile } = useAuth();
    const { showToast } = useToast();
    const { processSaleRefund } = useRefunds();
    const paymentMethods = useBusinessPaymentMethods();

    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState<SearchResult[]>([]);
    const [selectedOrder, setSelectedOrder] = useState<SearchResult | null>(null);
    const [lines, setLines] = useState<RefundLine[]>([]);
    const [loadingLines, setLoadingLines] = useState(false);
    const [method, setMethod] = useState('cash');
    const [reasonOption, setReasonOption] = useState('');
    const [reasonCustom, setReasonCustom] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const goOnline = () => setIsOnline(true);
        const goOffline = () => setIsOnline(false);
        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);

    const resetAll = useCallback(() => {
        setQuery(''); setResults([]); setSelectedOrder(null); setLines([]);
        setMethod('cash'); setReasonOption(''); setReasonCustom(''); setSubmitting(false);
    }, []);

    const handleClose = useCallback(() => {
        if (submitting) return;
        resetAll();
        onClose();
    }, [submitting, resetAll, onClose]);

    const handleSearch = useCallback(async () => {
        const term = query.trim();
        if (!term || !profile?.business_id) return;
        setSearching(true);
        try {
            const numeric = /^\d+$/.test(term);
            let q = supabase
                .from('orders')
                .select('id, order_number, display_number, customer_name, total, created_at, payment_method')
                .eq('business_id', profile.business_id)
                .eq('status', 'completed')
                .order('created_at', { ascending: false })
                .limit(15);
            if (numeric) {
                q = q.or(`order_number.eq.${term},display_number.ilike.%${term}%`);
            } else {
                q = q.or(`customer_name.ilike.%${term}%,display_number.ilike.%${term}%`);
            }
            const { data, error } = await q;
            if (error) throw error;
            setResults(data || []);
        } catch (err: any) {
            console.error('Error buscando venta:', err);
            showToast('Error al buscar la venta', 'error');
        } finally {
            setSearching(false);
        }
    }, [query, profile?.business_id, showToast]);

    const handleSelectOrder = useCallback(async (order: SearchResult) => {
        setSelectedOrder(order);
        setLoadingLines(true);
        try {
            const [itemsRes, refundedRes] = await Promise.all([
                supabase
                    .from('order_items')
                    .select('id, product_name, quantity, unit_price, total_price, status, product:products(type)')
                    .eq('order_id', order.id),
                supabase
                    .from('sale_refund_items')
                    .select('order_item_id, quantity, refund:sale_refunds!inner(order_id)')
                    .eq('refund.order_id', order.id),
            ]);

            const refundedByItem: Record<string, number> = {};
            (refundedRes.data || []).forEach((r: any) => {
                refundedByItem[r.order_item_id] = (refundedByItem[r.order_item_id] || 0) + Number(r.quantity || 0);
            });

            const built: RefundLine[] = (itemsRes.data || [])
                .filter((it: any) => it.status !== 'canceled')
                .map((it: any) => {
                    const isRetail = it.product?.type === 'simple';
                    return {
                        order_item_id: it.id,
                        product_name: it.product_name,
                        sold: Number(it.quantity || 0),
                        alreadyRefunded: refundedByItem[it.id] || 0,
                        unit_price: Number(it.unit_price || 0),
                        total_price: Number(it.total_price || 0),
                        isRetail,
                        qty: 0,
                        restock: isRetail,
                    };
                });
            setLines(built);
        } catch (err: any) {
            console.error('Error cargando ítems de la venta:', err);
            showToast('Error al cargar la venta', 'error');
        } finally {
            setLoadingLines(false);
        }
    }, [showToast]);

    // Modo precargado (desde SalesScreen): al abrir, saltar la búsqueda y cargar la venta.
    useEffect(() => {
        if (isOpen && presetOrder && !selectedOrder) {
            handleSelectOrder(presetOrder);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, presetOrder?.id]);

    const setLineQty = (orderItemId: string, delta: number) => {
        setLines(prev => prev.map(l => {
            if (l.order_item_id !== orderItemId) return l;
            const pending = l.sold - l.alreadyRefunded;
            const next = Math.max(0, Math.min(pending, l.qty + delta));
            return { ...l, qty: next };
        }));
    };

    const toggleRestock = (orderItemId: string) => {
        setLines(prev => prev.map(l => l.order_item_id === orderItemId ? { ...l, restock: !l.restock } : l));
    };

    const totalToRefund = useMemo(() => {
        return lines.reduce((sum, l) => {
            if (l.qty <= 0 || l.sold <= 0) return sum;
            return sum + Math.round((l.total_price / l.sold) * l.qty);
        }, 0);
    }, [lines]);

    const reason = reasonOption === 'Otro' ? reasonCustom.trim() : reasonOption;
    const isCredit = selectedOrder?.payment_method === 'credit';
    const canConfirm = isOnline && hasOpenShift && totalToRefund > 0 && !!reason && !submitting;

    const handleConfirm = useCallback(async () => {
        if (!selectedOrder || !canConfirm) return;
        const items: RefundItemInput[] = lines
            .filter(l => l.qty > 0)
            .map(l => ({ order_item_id: l.order_item_id, quantity: l.qty, restock: l.isRetail && l.restock }));

        setSubmitting(true);
        const result = await processSaleRefund(selectedOrder.id, items, method, reason);
        setSubmitting(false);

        if (result.success) {
            showToast(`Devolución registrada: $${formatCurrency(result.total || totalToRefund)}`, 'success');
            resetAll();
            onDone?.();
            onClose();
        } else {
            showToast(result.message || 'No se pudo registrar la devolución', 'error');
        }
    }, [selectedOrder, canConfirm, lines, method, reason, processSaleRefund, showToast, totalToRefund, resetAll, onDone, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/50 sm:p-4 animate-fadeIn"
            onClick={handleClose}
            role="dialog"
            aria-label="Devolución de venta"
        >
            <div
                className="bg-white dark:bg-[#151e32] w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header fijo */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">Devolución de venta</h3>
                    <button
                        onClick={handleClose}
                        disabled={submitting}
                        aria-label="Cerrar"
                        className="size-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 disabled:opacity-50"
                    >
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>

                {/* Avisos (solo si aplica) */}
                {!isOnline && (
                    <div className="mx-5 mt-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px]">wifi_off</span>
                            Sin conexión: las devoluciones requieren internet.
                        </p>
                    </div>
                )}
                {isOnline && !hasOpenShift && (
                    <div className="mx-5 mt-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                        <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px]">lock</span>
                            Debes tener un turno abierto para registrar una devolución.
                        </p>
                    </div>
                )}

                {/* Cuerpo scrollable */}
                <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-4">
                    {/* Paso 1: buscar venta */}
                    {!selectedOrder && (
                        <div className="space-y-3">
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                                    <input
                                        type="text"
                                        value={query}
                                        onChange={e => setQuery(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                                        placeholder="Buscar venta (#, cliente)"
                                        disabled={!isOnline}
                                        className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-white dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 focus:border-slate-400 focus:ring-1 focus:ring-slate-300/40 text-sm outline-none disabled:opacity-50"
                                    />
                                </div>
                                <button
                                    onClick={handleSearch}
                                    disabled={!isOnline || searching || !query.trim()}
                                    className="px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-[#102218] hover:bg-[#1d3a2a] transition-colors disabled:opacity-50"
                                >
                                    {searching ? 'Buscando…' : 'Buscar'}
                                </button>
                            </div>

                            <div className="space-y-1.5">
                                {results.map(r => (
                                    <button
                                        key={r.id}
                                        onClick={() => handleSelectOrder(r)}
                                        className="w-full text-left px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors flex items-center justify-between gap-2"
                                    >
                                        <span className="text-sm text-slate-700 dark:text-slate-200 truncate">
                                            <span className="font-bold">#{r.display_number || r.order_number}</span>
                                            {' · '}{r.customer_name || 'Consumidor Final'}
                                        </span>
                                        <span className="text-sm font-bold text-slate-900 dark:text-white shrink-0">${formatCurrency(r.total)}</span>
                                    </button>
                                ))}
                                {!searching && query.trim() && results.length === 0 && (
                                    <p className="text-xs text-slate-400 text-center py-4">Sin resultados</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Paso 2 + 3: armar devolución */}
                    {selectedOrder && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-bold text-slate-900 dark:text-white">
                                    Venta #{selectedOrder.display_number || selectedOrder.order_number}
                                    <span className="font-medium text-slate-500"> · {selectedOrder.customer_name || 'Consumidor Final'}</span>
                                </p>
                                <button
                                    onClick={() => { setSelectedOrder(null); setLines([]); }}
                                    className={`text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 ${presetOrder ? 'hidden' : ''}`}
                                >
                                    Cambiar
                                </button>
                            </div>

                            {loadingLines ? (
                                <p className="text-xs text-slate-400 text-center py-6">Cargando ítems…</p>
                            ) : (
                                <div className="space-y-2">
                                    {lines.map(l => {
                                        const pending = l.sold - l.alreadyRefunded;
                                        return (
                                            <div key={l.order_item_id} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2.5">
                                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{l.product_name}</p>
                                                    <span className="text-[11px] text-slate-400 shrink-0">pendiente {formatQty(pending)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => setLineQty(l.order_item_id, -1)}
                                                            disabled={l.qty <= 0}
                                                            aria-label="Quitar"
                                                            className="size-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">remove</span>
                                                        </button>
                                                        <span className="w-8 text-center text-sm font-bold text-slate-900 dark:text-white">{formatQty(l.qty)}</span>
                                                        <button
                                                            onClick={() => setLineQty(l.order_item_id, 1)}
                                                            disabled={l.qty >= pending}
                                                            aria-label="Agregar"
                                                            className="size-8 flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40"
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">add</span>
                                                        </button>
                                                    </div>
                                                    {l.isRetail ? (
                                                        <button
                                                            onClick={() => toggleRestock(l.order_item_id)}
                                                            className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"
                                                            aria-label="Reingresar al inventario"
                                                        >
                                                            <span className={`size-5 rounded-md border-2 flex items-center justify-center ${l.restock ? 'bg-[#102218] border-[#102218]' : 'border-slate-300 dark:border-slate-600'}`}>
                                                                {l.restock && <span className="material-symbols-outlined text-white text-[14px]">check</span>}
                                                            </span>
                                                            Reingresar
                                                        </button>
                                                    ) : (
                                                        <span className="text-[11px] text-slate-400">sin reingreso</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {lines.length === 0 && (
                                        <p className="text-xs text-slate-400 text-center py-4">Esta venta no tiene ítems devolvibles</p>
                                    )}
                                </div>
                            )}

                            {/* Aviso venta a crédito: no afecta caja */}
                            {isCredit && (
                                <div className="px-3 py-2.5 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-slate-700">
                                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                        <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>
                                        Venta a crédito
                                    </p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                        No reflejará movimiento en caja. El monto se descontará de la deuda del cliente.
                                    </p>
                                </div>
                            )}

                            {/* Método de devolución (solo si NO es crédito: en crédito no se devuelve dinero) */}
                            {!isCredit && (
                                <div>
                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Método de devolución</p>
                                    <div className="space-y-1.5">
                                        {paymentMethods.map(pm => (
                                            <button
                                                key={pm.id}
                                                onClick={() => setMethod(pm.mappedId)}
                                                className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors flex items-center gap-2 ${method === pm.mappedId ? 'border-[#102218] bg-emerald-50 dark:bg-emerald-900/20 text-slate-900 dark:text-white font-semibold' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'}`}
                                            >
                                                <span className={`size-4 rounded-full border-2 flex items-center justify-center ${method === pm.mappedId ? 'border-[#102218]' : 'border-slate-300 dark:border-slate-600'}`}>
                                                    {method === pm.mappedId && <span className="size-2 rounded-full bg-[#102218]" />}
                                                </span>
                                                {pm.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Motivo */}
                            <div>
                                <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Motivo *</p>
                                <div className="space-y-1.5">
                                    {REFUND_REASONS.map(r => (
                                        <button
                                            key={r}
                                            onClick={() => setReasonOption(r)}
                                            className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors flex items-center gap-2 ${reasonOption === r ? 'border-[#102218] bg-emerald-50 dark:bg-emerald-900/20 text-slate-900 dark:text-white font-semibold' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'}`}
                                        >
                                            <span className={`size-4 rounded-full border-2 flex items-center justify-center ${reasonOption === r ? 'border-[#102218]' : 'border-slate-300 dark:border-slate-600'}`}>
                                                {reasonOption === r && <span className="size-2 rounded-full bg-[#102218]" />}
                                            </span>
                                            {r}
                                        </button>
                                    ))}
                                </div>
                                {reasonOption === 'Otro' && (
                                    <input
                                        type="text"
                                        autoFocus
                                        value={reasonCustom}
                                        onChange={e => setReasonCustom(e.target.value)}
                                        placeholder="Escribe el motivo…"
                                        className="mt-2 w-full px-3 py-2.5 rounded-lg bg-white dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 focus:border-slate-400 focus:ring-1 focus:ring-slate-300/40 text-sm outline-none"
                                    />
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer fijo */}
                {selectedOrder && (
                    <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-4 shrink-0">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-medium text-slate-500">Total a devolver</span>
                            <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">${formatCurrency(totalToRefund)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleClose}
                                disabled={submitting}
                                className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirm}
                                disabled={!canConfirm}
                                className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white bg-[#102218] hover:bg-[#1d3a2a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                            >
                                {submitting && <span className="material-symbols-outlined text-base animate-spin">sync</span>}
                                Devolver ${formatCurrency(totalToRefund)}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RefundSaleModal;
