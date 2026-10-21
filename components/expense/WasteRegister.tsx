import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { offlineQueue } from '../../lib/offlineQueue';
import { saveAdminProducts, getAdminProducts } from '../../lib/offlineStorage';
import { useAuth } from '../../context/AuthContext';
import { useProducts, Product } from '../../hooks/useProducts';
import { formatCurrency } from '../../lib/formatters';
import { useToast } from '../../context/ToastContext';
import { useConfirmDialog } from '../../context/ConfirmDialogContext';
import { useExpenses } from '../../hooks/useExpenses';
import { useInventoryLots } from '../../hooks/useInventoryLots';
import { useBusinessSettings } from '../../context/BusinessSettingsContext';
import { AppButton } from '../ui/AppButton';
import { formatDateInTz } from '../../lib/timezone';
import {
    ExpenseSubComponentProps,
    formatWithThousands,
    parseCleanNumber,
    getLocalDateValue,
    formatExpenseDateLabel,
} from './shared';

export const WasteRegister: React.FC<ExpenseSubComponentProps> = ({ onClose, onSave }) => {
    const { showToast } = useToast();
    const { confirmAction } = useConfirmDialog();
    const { profile } = useAuth();
    const { timezone } = useBusinessSettings();
    const { products } = useProducts();
    const { reasons, addReason, deleteReason, fetchReasons, wastages, wastagesLoading, fetchWastages, updateWastage, deleteWastage } = useExpenses();
    const { deductFifoForWastage } = useInventoryLots();

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const dateInputRef = useRef<HTMLInputElement>(null);
    const reasonSectionRef = useRef<HTMLDivElement>(null);
    const sidebarContainerRef = useRef<HTMLDivElement>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [expenseDate, setExpenseDate] = useState<string>(getLocalDateValue);
    const [wasteTab, setWasteTab] = useState<'register' | 'history'>('register');

    // Waste items
    const [wasteItems, setWasteItems] = useState([{
        id: Date.now().toString(), quantity: '', productSearch: '',
        selectedProduct: null as Product | null, amount: '', showProductList: false
    }]);
    const [selectedReason, setSelectedReason] = useState('');
    const [description, setDescription] = useState('');
    const [measureUnit] = useState<string>('UNIDADES');

    // Reason management
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [newValue, setNewValue] = useState('');
    const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
    const [categorySearch, setCategorySearch] = useState('');

    const [searchAnchorRect, setSearchAnchorRect] = useState<DOMRect | null>(null);
    const [searchActiveIndex, setSearchActiveIndex] = useState<number | null>(null);

    const updateSearchAnchor = (el: HTMLInputElement | null, idx: number) => {
        if (el) {
            setSearchAnchorRect(el.getBoundingClientRect());
            setSearchActiveIndex(idx);
        }
    };

    const handleToggleReasonDropdown = () => {
        const nextState = !isCategoryDropdownOpen;
        setIsCategoryDropdownOpen(nextState);
        setCategorySearch('');
        if (nextState) {
            setTimeout(() => {
                reasonSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 60);
        }
    };

    // History edit
    const [editingWastageId, setEditingWastageId] = useState<string | null>(null);
    const [editWasteAmount, setEditWasteAmount] = useState('');
    const [editWasteReason, setEditWasteReason] = useState('');
    const [editWasteDescription, setEditWasteDescription] = useState('');
    const [editWasteQuantity, setEditWasteQuantity] = useState('');

    useEffect(() => {
        fetchReasons();
    }, [fetchReasons]);

    useEffect(() => {
        if (wasteTab !== 'history') return;
        fetchWastages();
    }, [wasteTab, fetchWastages]);

    const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

    const formatWastageDate = (dateStr: string): string => {
        if (!dateStr) return '';
        if (!dateStr.includes('T') && dateStr.includes('-')) {
            const [y, m, d] = dateStr.split('-');
            return `${parseInt(d, 10)} ${MONTHS_SHORT[parseInt(m, 10) - 1]} ${y}`;
        }
        const d = formatDateInTz(dateStr, timezone, { day: 'numeric', month: 'short', year: 'numeric' }).replace(/ de /gi, ' ').replace(/\./g, '');
        const t = new Date(dateStr).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone }).toLowerCase().replace(/\./g, '').replace(/\s/g, '');
        return `${d} · ${t}`;
    };

    const handleOpenDatePicker = () => {
        if (dateInputRef.current) {
            try { (dateInputRef.current as any).showPicker(); }
            catch { dateInputRef.current.click(); }
        }
    };

    const getFilteredProducts = (search: string) => {
        return products.filter(p =>
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.barcode?.toLowerCase().includes(search.toLowerCase())
        ).slice(0, 10);
    };

    const handleWasteItemChange = (index: number, updates: Record<string, any>) => {
        setWasteItems(prev => {
            const newItems = [...prev];
            newItems[index] = { ...newItems[index], ...updates };

            if ('quantity' in updates) {
                if (newItems[index].selectedProduct && newItems[index].selectedProduct!.cost > 0) {
                    const qty = parseFloat(updates.quantity) || 0;
                    newItems[index].amount = (qty * newItems[index].selectedProduct!.cost).toString();
                }
            }
            return newItems;
        });
    };

    const handleWasteItemSelectProduct = (index: number, product: Product) => {
        if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
        setWasteItems(prev => {
            const newItems = [...prev];
            const currentItem = newItems[index];
            if (typeof document !== 'undefined' && currentItem?.id) {
                (document.getElementById(`waste-product-${currentItem.id}`) as HTMLInputElement)?.blur();
                (document.getElementById(`waste-qty-${currentItem.id}`) as HTMLInputElement)?.blur();
            }
            newItems[index].selectedProduct = product;
            newItems[index].productSearch = product.name;
            newItems[index].showProductList = false;

            if (product.cost > 0) {
                const qty = parseInt(newItems[index].quantity) || 1;
                newItems[index].amount = (qty * product.cost).toString();
            }

            return newItems;
        });
    };

    const addWasteItem = () => {
        setWasteItems(prev => [
            ...prev,
            { id: Date.now().toString(), quantity: '', productSearch: '', selectedProduct: null, amount: '', showProductList: false }
        ]);
    };

    const removeWasteItem = (index: number) => {
        if (wasteItems.length > 1) setWasteItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleStartEditWaste = (w: typeof wastages[0]) => {
        setEditingWastageId(w.id);
        setEditWasteAmount(String(w.amount));
        setEditWasteReason(w.reason || '');
        setEditWasteDescription(w.description || '');
        setEditWasteQuantity(String(w.quantity));
    };

    const handleSaveEditWaste = async () => {
        if (!editingWastageId) return;
        try {
            await updateWastage(editingWastageId, {
                amount: parseFloat(editWasteAmount) || 0,
                reason: editWasteReason,
                description: editWasteDescription,
                quantity: parseFloat(editWasteQuantity) || 1,
            });
            setEditingWastageId(null);
            showToast('Merma actualizada', 'success');
        } catch {
            showToast('Error al actualizar', 'error');
        }
    };

    const handleDeleteWastage = async (id: string) => {
        const confirmed = await confirmAction({
            title: '¿Eliminar esta merma?',
            message: 'Esta acción no se puede deshacer.',
            confirmText: 'Eliminar',
            variant: 'danger'
        });
        if (!confirmed) return;
        try {
            await deleteWastage(id);
            showToast('Merma eliminada', 'success');
        } catch {
            showToast('Error al eliminar', 'error');
        }
    };

    const handleAddNew = async () => {
        if (!newValue.trim()) return;
        try {
            await addReason(newValue.trim());
            setSelectedReason(newValue.trim().toUpperCase());
            setNewValue('');
            setIsAddingNew(false);
        } catch {
            showToast('Error al crear motivo', 'error');
        }
    };

    const handleDeleteItem = async (item: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const confirmed = await confirmAction({
            title: `¿Eliminar "${item}"?`,
            message: 'Esta acción no se puede deshacer.',
            confirmText: 'Eliminar',
            variant: 'danger'
        });
        if (!confirmed) return;
        try {
            await deleteReason(item);
            if (selectedReason === item) setSelectedReason('');
        } catch {
            showToast('Error al eliminar', 'error');
        }
    };

    const handleSave = async () => {
        if (isSubmitting) return;

        const validWastages = wasteItems.filter(item => item.selectedProduct && (parseInt(item.quantity) || 0) > 0);
        if (validWastages.length === 0) {
            showToast('Agrega al menos un producto a la merma', 'error');
            return;
        }

        const invalidStockItems = validWastages.filter(item => item.selectedProduct!.stock == null || item.selectedProduct!.stock <= 0);
        if (invalidStockItems.length > 0) {
            showToast(`No puedes registrar merma de productos sin stock (${invalidStockItems.map(i => i.selectedProduct!.name).join(', ')})`, 'error');
            return;
        }

        const overStockItems = validWastages.filter(
            item => (parseInt(item.quantity) || 0) > (item.selectedProduct!.stock || 0)
        );
        if (overStockItems.length > 0) {
            showToast(`La cantidad de merma supera el stock disponible (${overStockItems.map(i => i.selectedProduct!.name).join(', ')})`, 'error');
            return;
        }


        if (!navigator.onLine) {
            if (!profile?.business_id || !profile?.id) {
                showToast('Sin conexión y sin sesión válida', 'error');
                return;
            }

            setIsSubmitting(true);
            try {
                // Stock optimista en IDB
                const cached = await getAdminProducts();
                const updated = cached.map(p => {
                    const match = validWastages.find(i => i.selectedProduct!.id === p.id);
                    if (!match) return p;
                    return { ...p, stock: Math.max(0, (p.stock || 0) - (parseInt(match.quantity) || 0)) };
                });
                await saveAdminProducts(updated);

                window.dispatchEvent(new CustomEvent('wastage-stock-updated', {
                    detail: { items: validWastages.map(i => ({ productId: i.selectedProduct!.id, quantity: parseInt(i.quantity) || 0 })) }
                }));

                // Encolar cada merma
                for (const item of validWastages) {
                    await offlineQueue.add(
                        'shrinkage',
                        {
                            productId: item.selectedProduct!.id,
                            productName: item.selectedProduct!.name,
                            quantity: parseInt(item.quantity) || 0,
                            amount: parseFloat(item.amount) || 0,
                            reason: selectedReason || 'GENERAL',
                            description,
                            date: new Date(expenseDate + 'T12:00:00').toISOString(),
                        },
                        profile.business_id,
                        profile.id,
                    );
                }

                showToast('Merma encolada — se sincronizará al recuperar internet', 'success');
                onClose();
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        setIsSubmitting(true);
        try {
            for (const item of validWastages) {
                const wasteQty = parseInt(item.quantity) || 0;

                // 1. Insert wastage record and get its ID
                const waste = await onSave({
                    type: 'waste',
                    mode: 'manual',
                    amount: parseFloat(item.amount) || 0,
                    description,
                    product: item.selectedProduct!.name,
                    productId: item.selectedProduct!.id,
                    quantity: wasteQty,
                    measureUnit,
                    category: undefined,
                    reason: selectedReason,
                    payment_method: undefined,
                    isCredit: null,
                    creditorName: undefined,
                    date: new Date(expenseDate + 'T12:00:00').toISOString()
                });

                // 2. Apply FIFO deduction on lots
                if (waste?.id) {
                    await deductFifoForWastage(item.selectedProduct!.id, waste.id, wasteQty);
                }

                // 3. Update products.stock
                if (item.selectedProduct!.stock != null) {
                    const newStock = Math.max(0, item.selectedProduct!.stock - wasteQty);
                    await supabase
                        .from('products')
                        .update({ stock: newStock })
                        .eq('id', item.selectedProduct!.id);

                    window.dispatchEvent(new CustomEvent('wastage-stock-updated', {
                        detail: { items: [{ productId: item.selectedProduct!.id, quantity: wasteQty }] }
                    }));
                }
            }
            onClose();
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div ref={sidebarContainerRef} className="relative w-full max-w-md h-full bg-surface-light dark:bg-surface-dark shadow-2xl overflow-hidden flex flex-col animate-[slideInRight_0.4s_cubic-bezier(0.16,1,0.3,1)]">
            {/* Header */}
            <div className="px-8 pt-8 pb-4 flex justify-between items-center bg-surface-light dark:bg-surface-dark shrink-0">
                <div className="bg-gray-100 dark:bg-gray-800/80 px-5 py-2 rounded-full border border-gray-200/50 dark:border-gray-700/50">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400">
                        REGISTRO DE MERMA
                    </h2>
                </div>
                <button onClick={onClose} className="size-9 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-[#256c44] dark:text-primary transition-all active:scale-90">
                    <span className="material-symbols-outlined text-[28px] font-bold">close</span>
                </button>
            </div>

            {/* Tabs */}
            <div className="flex px-8 border-b border-border-light dark:border-border-dark">
                <button
                    onClick={() => setWasteTab('register')}
                    className={`flex-1 py-4 flex items-center justify-center gap-2 font-bold text-sm relative transition-all ${wasteTab === 'register' ? 'text-text-main dark:text-white' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    Registro
                    {wasteTab === 'register' && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-status-error rounded-t-full"></div>}
                </button>
                <button
                    onClick={() => setWasteTab('history')}
                    className={`flex-1 py-4 flex items-center justify-center gap-2 font-bold text-sm relative transition-all ${wasteTab === 'history' ? 'text-text-main dark:text-white' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    Historial
                    {wasteTab === 'history' && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-status-error rounded-t-full"></div>}
                </button>
            </div>

            <div
                ref={scrollContainerRef}
                onScroll={() => {
                    if (searchActiveIndex !== null) {
                        const el = document.getElementById(`waste-product-${wasteItems[searchActiveIndex]?.id}`) as HTMLInputElement | null;
                        if (el) {
                            setSearchAnchorRect(el.getBoundingClientRect());
                        }
                    }
                }}
                className="flex-1 overflow-y-auto no-scrollbar bg-surface-light dark:bg-surface-dark custom-scrollbar"
            >
                {/* History */}
                {wasteTab === 'history' && (
                    <div className="px-8 py-6 flex-1 flex flex-col overflow-hidden">
                        {wastagesLoading ? (
                            <div className="flex flex-col items-center justify-center py-16 gap-3">
                                <div className="animate-spin size-8 border-3 border-gray-300 border-t-status-error rounded-full" />
                                <p className="text-xs text-gray-400 font-bold">Cargando historial...</p>
                            </div>
                        ) : wastages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 gap-3">
                                <span className="material-symbols-outlined text-4xl text-gray-300">delete_sweep</span>
                                <p className="text-sm text-gray-400 font-bold">Sin mermas registradas</p>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto space-y-2 -mx-2 px-2">
                                {wastages.map(w => (
                                    <div key={w.id} className="bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded-xl p-3 transition-all hover:shadow-sm">
                                        {editingWastageId === w.id ? (
                                            <div className="space-y-3">
                                                <div className="flex gap-2">
                                                    <div className="w-20">
                                                        <label htmlFor={`edit-waste-qty-${w.id}`} className="block text-[9px] font-black text-gray-400 mb-1 uppercase">Cant.</label>
                                                        <input id={`edit-waste-qty-${w.id}`} type="text" inputMode="numeric" value={editWasteQuantity} onChange={e => setEditWasteQuantity(e.target.value.replace(/[^0-9]/g, ''))} className="w-full h-9 px-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-black text-center outline-none focus:border-status-error" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <label htmlFor={`edit-waste-amount-${w.id}`} className="block text-[9px] font-black text-gray-400 mb-1 uppercase">Monto</label>
                                                        <div className="relative">
                                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
                                                            <input id={`edit-waste-amount-${w.id}`} type="text" inputMode="numeric" value={formatWithThousands(editWasteAmount)} onChange={e => setEditWasteAmount(parseCleanNumber(e.target.value))} className="w-full h-9 pl-7 pr-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-black outline-none focus:border-status-error" />
                                                        </div>
                                                    </div>
                                                    <div className="flex-1">
                                                        <label htmlFor={`edit-waste-reason-${w.id}`} className="block text-[9px] font-black text-gray-400 mb-1 uppercase">Motivo</label>
                                                        <select id={`edit-waste-reason-${w.id}`} value={editWasteReason} onChange={e => setEditWasteReason(e.target.value)} className="w-full h-9 px-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-bold outline-none focus:border-status-error">
                                                            {reasons.map(r => <option key={r} value={r}>{r}</option>)}
                                                        </select>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label htmlFor={`edit-waste-desc-${w.id}`} className="block text-[9px] font-black text-gray-400 mb-1 uppercase">Observación</label>
                                                    <input id={`edit-waste-desc-${w.id}`} type="text" value={editWasteDescription} onChange={e => setEditWasteDescription(e.target.value)} className="w-full h-9 px-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-bold outline-none focus:border-status-error" placeholder="Sin observación" />
                                                </div>
                                                <div className="flex gap-2">
                                                    <button onClick={() => setEditingWastageId(null)} className="flex-1 h-8 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-xs font-bold">Cancelar</button>
                                                    <button onClick={handleSaveEditWaste} className="flex-1 h-8 bg-status-error text-white rounded-lg text-xs font-bold">Guardar</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-2">
                                                <div className="flex justify-between items-start gap-3">
                                                    <div className="flex-1 min-w-0 flex flex-col items-start gap-1">
                                                        <div className="flex items-center gap-1.5 w-full flex-wrap sm:flex-nowrap">
                                                            <span className="text-[13px] font-black leading-tight text-text-main dark:text-white truncate">{w.product_name || 'Sin producto'}</span>
                                                            <span className="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-md shrink-0">×{w.quantity}</span>
                                                        </div>
                                                        <span className="text-[8px] px-2 py-0.5 rounded-md bg-red-50 border border-red-100 dark:border-red-900/40 dark:bg-red-900/20 text-red-500 dark:text-red-400 font-black uppercase tracking-wider shrink-0">{w.reason || 'General'}</span>
                                                    </div>
                                                    <div className="flex flex-col items-end shrink-0 gap-1">
                                                        <div className="flex flex-col items-end leading-tight">
                                                            <span className="text-[13px] font-black text-status-error">${formatWithThousands(String(Math.round(w.amount)))}</span>
                                                            <span className="text-[9px] text-gray-400 font-bold">{formatWastageDate(w.date || w.created_at)}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1 mt-1">
                                                            <button onClick={() => handleStartEditWaste(w)} className="size-7 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-blue-500 transition-colors" aria-label="Editar merma" tabIndex={0}>
                                                                <span className="material-symbols-outlined text-[16px]">edit</span>
                                                            </button>
                                                            <button onClick={() => handleDeleteWastage(w.id)} className="size-7 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors" aria-label="Eliminar merma" tabIndex={0}>
                                                                <span className="material-symbols-outlined text-[16px]">delete</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                                {w.description && w.description !== 'Ajuste de inventario' && (
                                                    <p className="text-[10px] text-gray-400 italic bg-gray-50 dark:bg-gray-800/50 p-1.5 rounded-md truncate">📝 {w.description}</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Register View */}
                {wasteTab === 'register' && (
                    <div className="px-8 py-6 flex-1 flex flex-col space-y-5">
                        {/* Date */}
                        <div className="flex items-center justify-between h-11 px-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl">
                            <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-[18px] text-gray-400">calendar_month</span>
                                <span className={`text-sm font-bold ${expenseDate !== getLocalDateValue() ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'}`}>
                                    {formatExpenseDateLabel(expenseDate)}
                                </span>
                            </div>
                            <button type="button" onClick={handleOpenDatePicker} className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                                Elegir
                            </button>
                            <input ref={dateInputRef} type="date" value={expenseDate} max={getLocalDateValue()} onChange={e => setExpenseDate(e.target.value)} className="absolute opacity-0 size-0 pointer-events-none" tabIndex={-1} />
                        </div>

                        {/* Waste items */}
                        <div className="space-y-3">
                            {wasteItems.map((item, index) => (
                                <div key={item.id} className="flex flex-row items-center gap-3 relative" style={{ zIndex: item.showProductList ? 60 : 20 - index }}>
                                    <div className="w-[70px] lg:w-24 shrink-0">
                                        <label htmlFor={`waste-qty-${item.id}`} className="block text-[9px] font-black text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-[0.10em] truncate">CANT.</label>
                                        <input
                                            id={`waste-qty-${item.id}`}
                                            type="number"
                                            value={item.quantity}
                                            onChange={e => handleWasteItemChange(index, { quantity: e.target.value })}
                                            onWheel={e => (e.target as HTMLInputElement).blur()}
                                            onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                                            min="1"
                                            placeholder="0"
                                            className="w-full h-10 px-1 lg:px-3 bg-white dark:bg-gray-800/30 border border-gray-300 dark:border-gray-600 rounded-[14px] focus:ring-2 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all text-lg font-black text-center text-gray-800 dark:text-white shadow-sm"
                                        />
                                    </div>

                                    <div className="flex-1 relative min-w-0">
                                        <label htmlFor={`waste-product-${item.id}`} className="block text-[9px] font-black text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-[0.10em] truncate">PRODUCTO AFECTADO</label>
                                        <div className="relative group">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                                <span className="material-symbols-outlined text-[18px]">search</span>
                                            </span>
                                            <input
                                                id={`waste-product-${item.id}`}
                                                type="text"
                                                value={item.productSearch}
                                                onChange={e => {
                                                    handleWasteItemChange(index, { productSearch: e.target.value, selectedProduct: null, showProductList: true });
                                                    updateSearchAnchor(e.target, index);
                                                }}
                                                onFocus={e => {
                                                    handleWasteItemChange(index, { showProductList: true });
                                                    updateSearchAnchor(e.target, index);
                                                }}
                                                onBlur={() => setTimeout(() => {
                                                    handleWasteItemChange(index, { showProductList: false });
                                                    setSearchAnchorRect(null);
                                                    setSearchActiveIndex(null);
                                                }, 250)}
                                                className="w-full h-10 pl-9 pr-3 bg-white dark:bg-gray-800/30 border border-gray-300 dark:border-gray-600 rounded-[14px] focus:ring-2 focus:ring-red-500/10 focus:border-red-500 outline-none transition-all text-gray-800 dark:text-white font-bold text-[13px] shadow-sm truncate"
                                                placeholder="Buscar producto..."
                                            />
                                        </div>
                                    </div>

                                    {wasteItems.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removeWasteItem(index)}
                                            className="size-10 flex items-center justify-center bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-500 rounded-[14px] mt-4 lg:mt-5 transition-colors shrink-0"
                                        >
                                            <span className="material-symbols-outlined text-[20px]">delete</span>
                                        </button>
                                    )}
                                </div>
                            ))}

                            {/* Botón manual para agregar más productos a la merma */}
                            <div className="flex justify-start pt-0.5">
                                <button
                                    type="button"
                                    onClick={addWasteItem}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-red-500 hover:text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 rounded-xl transition-all active:scale-95"
                                >
                                    <span className="material-symbols-outlined text-[16px]">add</span>
                                    <span>Agregar</span>
                                </button>
                            </div>
                        </div>

                        {/* Reason dropdown */}
                        <div ref={reasonSectionRef}>
                            <div className="flex items-center justify-between mb-3">
                                <label className="block text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-[0.15em]">MOTIVO DE MERMA</label>
                                <button onClick={() => setIsAddingNew(!isAddingNew)} className="text-[10px] font-semibold text-gray-800 dark:text-gray-200 border-b border-gray-800 dark:border-gray-200 leading-tight hover:opacity-60 transition-opacity">
                                    Crear motivo
                                </button>
                            </div>

                            <div className="relative w-full lg:w-96 z-40">
                                <button
                                    type="button"
                                    onClick={handleToggleReasonDropdown}
                                    className={`w-full h-14 px-5 bg-white dark:bg-black/20 border-2 rounded-[20px] outline-none font-black text-sm uppercase tracking-wider text-left flex items-center justify-between shadow-sm transition-all ${isCategoryDropdownOpen ? 'border-red-500 ring-2 ring-red-500/10' : 'border-gray-300 dark:border-gray-700 hover:border-gray-400'} ${!selectedReason ? 'text-gray-400 dark:text-gray-500' : 'text-gray-800 dark:text-white'}`}
                                >
                                    <span>{selectedReason || 'Elegir motivo'}</span>
                                    <span className={`material-symbols-outlined transition-transform duration-300 ${isCategoryDropdownOpen ? 'rotate-180 text-red-500' : 'text-gray-400'}`}>expand_more</span>
                                </button>

                                {isCategoryDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-30" onClick={() => setIsCategoryDropdownOpen(false)} />
                                        <div className="absolute top-[calc(100%+8px)] left-0 w-full bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-[20px] shadow-xl overflow-hidden text-sm font-bold animate-[fadeIn_0.15s_ease-out] z-40 flex flex-col">
                                            <div className="border-b border-gray-100 dark:border-gray-700 p-2 relative shrink-0">
                                                <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">search</span>
                                                <input type="text" value={categorySearch} onChange={(e) => setCategorySearch(e.target.value)} placeholder="Buscar motivo..." className="w-full h-10 pl-10 pr-4 bg-gray-50 dark:bg-gray-900/50 border border-transparent focus:border-red-500/30 focus:bg-white dark:focus:bg-gray-800 rounded-xl outline-none transition-all text-xs font-bold text-gray-700 dark:text-gray-200 uppercase" />
                                            </div>
                                            <div className="max-h-56 overflow-y-auto w-full py-2">
                                                {reasons.filter(item => item.toLowerCase().includes(categorySearch.toLowerCase())).map(item => {
                                                    const isSelected = selectedReason === item;
                                                    return (
                                                        <div key={item} className={`flex flex-row items-center hover:bg-gray-50 dark:hover:bg-gray-700 w-full group transition-colors ${isSelected ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                                                            <button type="button" onClick={() => { setSelectedReason(item); setIsCategoryDropdownOpen(false); }} className={`flex-1 px-5 py-3.5 text-left uppercase tracking-wider flex items-center justify-between ${isSelected ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'}`}>
                                                                {item}
                                                                {isSelected && <span className="material-symbols-outlined text-lg">check_circle</span>}
                                                            </button>
                                                            <button type="button" onClick={(e) => handleDeleteItem(item, e)} className="px-4 py-3.5 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 dark:text-gray-600 dark:hover:text-red-400" title="Eliminar">
                                                                <span className="material-symbols-outlined text-[20px] block">delete</span>
                                                            </button>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </>
                                )}

                                {isAddingNew && (
                                    <div className="flex items-center gap-2 animate-[fadeIn_0.2s_ease-out] w-full mt-3">
                                        <input type="text" value={newValue} onChange={e => setNewValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddNew()} placeholder="Escribe nuevo..." className="w-full h-11 bg-white dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 focus:outline-none focus:ring-0 focus:border-red-500 transition-all text-sm font-bold text-gray-800 dark:text-white uppercase placeholder:normal-case shadow-sm" autoFocus />
                                        <button onClick={handleAddNew} disabled={!newValue.trim()} className="h-12 px-5 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white rounded-xl text-sm font-black tracking-widest uppercase transition-colors shadow-lg shadow-red-500/30 whitespace-nowrap active:scale-[0.98]">Guardar</button>
                                        <button onClick={() => { setIsAddingNew(false); setNewValue(''); }} className="size-12 flex items-center justify-center bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-xl transition-colors active:scale-[0.98]">
                                            <span className="material-symbols-outlined text-[20px]">close</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Waste total value */}
                        {wasteItems.some(i => i.selectedProduct) && (
                            <div className="flex flex-col items-center">
                                <label htmlFor="waste-total-value" className="text-[10px] font-black text-gray-600 dark:text-gray-400 mb-3 uppercase tracking-[0.15em]">VALOR TOTAL DE MERMA</label>
                                <div className="relative group w-full max-w-[240px]">
                                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-2xl">$</span>
                                    <input
                                        id="waste-total-value"
                                        type="text"
                                        value={formatWithThousands(wasteItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0).toString())}
                                        readOnly
                                        className="w-full h-14 pl-12 pr-6 bg-white dark:bg-black/20 border-2 border-transparent rounded-[20px] outline-none font-black text-3xl text-center text-gray-800 dark:text-white shadow-sm tabular-nums"
                                    />
                                </div>
                                <div className="mt-2 space-y-1 w-full max-w-[240px]">
                                    {wasteItems.filter(item => item.selectedProduct && (parseInt(item.quantity) || 0) > 0).map(item => (
                                        <p key={item.id} className="text-[10px] text-gray-400 font-bold text-center truncate">
                                            {item.quantity} {item.selectedProduct!.name} × ${formatCurrency(item.selectedProduct!.cost)} = ${formatCurrency(parseFloat(item.amount) || 0)}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="pt-4 lg:mt-auto">
                            {(() => {
                                const isSaveDisabled =
                                    wasteItems.filter(item => item.selectedProduct && (parseInt(item.quantity) || 0) > 0).length === 0 ||
                                    !selectedReason ||
                                    wasteItems.some(item => item.selectedProduct && (item.selectedProduct.stock == null || item.selectedProduct.stock <= 0));

                                return (
                                    <AppButton
                                        onClick={handleSave}
                                        disabled={isSaveDisabled}
                                        isLoading={isSubmitting}
                                        className={`w-full h-14 font-black rounded-2xl transition-all text-base active:scale-[0.98] ${
                                            isSaveDisabled
                                                ? 'bg-gray-200 dark:bg-gray-800 text-black dark:text-white cursor-not-allowed shadow-none border border-gray-300 dark:border-gray-700 opacity-90'
                                                : 'bg-status-error hover:bg-red-600 text-white shadow-xl shadow-status-error/20 hover:shadow-status-error/30'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-2xl">check_circle</span>
                                        CONFIRMAR REGISTRO
                                    </AppButton>
                                );
                            })()}
                        </div>
                    </div>
                )}
            </div>

            {/* Dropdown flotante de sugerencias de productos */}
            {searchAnchorRect && searchActiveIndex !== null && typeof document !== 'undefined' && (() => {
                const activeItem = wasteItems[searchActiveIndex];
                if (!activeItem || !activeItem.showProductList || !activeItem.productSearch) return null;
                const matches = getFilteredProducts(activeItem.productSearch);
                if (matches.length === 0) return null;

                const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
                const gap = 6;
                const sidebarRect = sidebarContainerRef.current?.getBoundingClientRect();

                const left = sidebarRect ? sidebarRect.left : searchAnchorRect.left;
                const width = sidebarRect ? sidebarRect.width : searchAnchorRect.width;

                const style: React.CSSProperties = !isDesktop
                    ? {
                        position: 'fixed',
                        left,
                        bottom: window.innerHeight - searchAnchorRect.top + gap,
                        width,
                        maxHeight: Math.min(260, Math.max(120, searchAnchorRect.top - 16)),
                        zIndex: 130,
                    }
                    : {
                        position: 'fixed',
                        left,
                        top: searchAnchorRect.bottom + gap,
                        width,
                        maxHeight: Math.min(260, Math.max(120, window.innerHeight - searchAnchorRect.bottom - 16)),
                        zIndex: 130,
                    };

                return createPortal(
                    <div
                        style={style}
                        className="overflow-y-auto custom-scrollbar bg-white dark:bg-gray-800 shadow-2xl animate-[fadeIn_0.1s_ease-out] border border-gray-200 dark:border-gray-700"
                    >
                        {matches.map(product => (
                            <button
                                key={product.id}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onPointerDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
                                        document.activeElement.blur();
                                    }
                                    handleWasteItemSelectProduct(searchActiveIndex, product);
                                    setSearchAnchorRect(null);
                                    setSearchActiveIndex(null);
                                }}
                                className="w-full text-left hover:bg-gray-50 dark:hover:bg-gray-700 font-medium flex justify-between items-center transition-colors border-b border-gray-100 dark:border-gray-700/50 last:border-b-0 px-8 py-3.5"
                            >
                                <span className="text-gray-800 dark:text-white text-sm font-semibold truncate mr-3">
                                    {product.name}
                                </span>
                                <span className="text-gray-400 text-xs font-bold shrink-0">
                                    Stock: {product.stock ?? 'N/A'}
                                </span>
                            </button>
                        ))}
                    </div>,
                    document.body
                );
            })()}
        </div>
    );
};
