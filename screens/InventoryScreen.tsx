import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Screen } from '../types';
import { useInventory, InventoryProduct, InventoryIngredient, AdjustmentRecord } from '../hooks/useInventory';
import { InventoryNumpad } from '../components/InventoryNumpad';
import { ScreenLoader } from '../components/ScreenLoader';
import { useToast } from '../context/ToastContext';
import { formatQty } from '../lib/formatters';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useExpenses } from '../hooks/useExpenses';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { logInventoryAdjustment } from '../lib/auditClient';

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

interface InventoryScreenProps {
    onNavigate: (screen: Screen) => void;
    isOnline?: boolean;
}

type TabType = 'products' | 'ingredients';

interface CountedItem {
    id: string;
    countedStock: number | null;
    hasChange: boolean;
    systemStock?: number;
    cost?: number;
}

const AdjustmentBanner: React.FC<{ onDismiss: () => void }> = ({ onDismiss }) => {
    return (
        <div className="relative flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl shrink-0 overflow-hidden animate-[fadeIn_0.3s_ease-out]">
            <span className="material-symbols-outlined text-amber-500 text-xl shrink-0">info</span>
            <p className="text-sm text-amber-800 dark:text-amber-200 flex-1 leading-snug">
                Para modificar o revertir ajustes negativos, abre el <strong>Historial</strong> antes de realizar nuevas ventas o compras de los productos.
            </p>
            <button onClick={onDismiss} className="shrink-0 text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 transition-colors">
                <span className="material-symbols-outlined text-base">close</span>
            </button>
        </div>
    );
};

export const InventoryScreen: React.FC<InventoryScreenProps> = ({ onNavigate, isOnline = true }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState<string>('');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const {
        products,
        ingredients,
        categories,
        totalProductsCount,
        loading,
        loadingMore,
        hasMore,
        loadMore,
        updateProductStock,
        updateIngredientStock,
        updateMultipleStocks,
        undoInventoryAdjustment,
        hasMovementsAfter,
        refetch,
    } = useInventory({
        searchQuery: debouncedSearchQuery,
        categoryFilter,
        isOnline,
    });
    const { showToast } = useToast();

    const [activeTab, setActiveTab] = useState<TabType>('products');
    const [isHistorySidebarOpen, setIsHistorySidebarOpen] = useState(false);
    const [showOnlyDifferences, setShowOnlyDifferences] = useState(false);
    const [pendingAdjustments, setPendingAdjustments] = useState<AdjustmentRecord[]>([]);

    const [firstLoadDone, setFirstLoadDone] = useState(false);
    useEffect(() => {
        if (!loading) {
            setFirstLoadDone(true);
        }
    }, [loading]);

    const { profile } = useAuth();
    const { wastages, fetchWastages, wastagesLoading } = useExpenses();
    const { confirmAction } = useConfirmDialog();
    const [revertibleIds, setRevertibleIds] = useState<Set<string>>(new Set());
    const [revertingId, setRevertingId] = useState<string | null>(null);
    const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
    const [editHistoryQty, setEditHistoryQty] = useState<number>(1);

    useEffect(() => {
        if (isHistorySidebarOpen) {
            fetchWastages();
            if (profile?.business_id) {
                supabase
                    .rpc('get_revertible_adjustment_ids', { p_business_id: profile.business_id })
                    .then(({ data }) => {
                        setRevertibleIds(new Set((data || []).map((r: { wastage_id: string }) => r.wastage_id)));
                    });
            }
        }
    }, [isHistorySidebarOpen, fetchWastages, profile?.business_id]);

    // State for counted stocks
    const [countedProducts, setCountedProducts] = useState<Record<string, CountedItem>>({});
    const [countedIngredients, setCountedIngredients] = useState<Record<string, CountedItem>>({});

    const [saving, setSaving] = useState<string | null>(null);
    const [savingAll, setSavingAll] = useState(false);

    // Numpad state for mobile
    const [numpadActive, setNumpadActive] = useState<{ id: string; type: 'product' | 'ingredient'; systemStock: number; cost: number; name: string; unit: string } | null>(null);
    const [numpadValue, setNumpadValue] = useState('');
    const [numpadShield, setNumpadShield] = useState(false);

    const handleCloseNumpad = () => {
        setNumpadActive(null);
        setNumpadValue('');
        setNumpadShield(true);
        setTimeout(() => setNumpadShield(false), 350);
    };

    // Filter products (el filtro por texto y categoría ya lo realiza Supabase con paginación de a 10)
    const filteredProducts = useMemo(() => {
        if (showOnlyDifferences) {
            return products.filter(p => {
                const counted = countedProducts[p.id]?.countedStock;
                const hasDiff = counted !== null && counted !== undefined && counted !== p.stock;
                return hasDiff;
            });
        }
        return products;
    }, [products, showOnlyDifferences, countedProducts]);

    // Filter ingredients
    const filteredIngredients = useMemo(() => {
        return ingredients.filter(i => {
            const matchesSearch = i.name.toLowerCase().includes(searchQuery.toLowerCase());

            if (showOnlyDifferences) {
                const counted = countedIngredients[i.id]?.countedStock;
                const hasDiff = counted !== null && counted !== undefined && counted !== i.stock;
                return matchesSearch && hasDiff;
            }

            return matchesSearch;
        });
    }, [ingredients, searchQuery, showOnlyDifferences, countedIngredients]);

    // Scroll infinito para cargar de a 10 productos más
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (activeTab !== 'products') return;
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop - clientHeight < 150) {
            loadMore();
        }
    };

    // Handle counted stock change
    const handleCountedChange = (id: string, value: string, type: 'product' | 'ingredient', systemStock: number, cost: number = 0) => {
        const numValue = value === '' ? null : parseFloat(value.replace(/,/g, '.'));
        const setter = type === 'product' ? setCountedProducts : setCountedIngredients;

        setter(prev => ({
            ...prev,
            [id]: {
                id,
                countedStock: numValue,
                hasChange: numValue !== null && numValue !== systemStock,
                systemStock,
                cost,
            }
        }));
    };

    // Handle numpad open
    const handleOpenNumpad = (id: string, type: 'product' | 'ingredient', systemStock: number, cost: number, name: string, unit: string) => {
        const currentValue = type === 'product'
            ? countedProducts[id]?.countedStock
            : countedIngredients[id]?.countedStock;
        setNumpadValue(currentValue !== null && currentValue !== undefined ? String(currentValue) : '');
        setNumpadActive({ id, type, systemStock, cost, name, unit });
    };

    // Handle numpad key press
    const handleNumpadPress = (key: string) => {
        if (!numpadActive) return;

        if (key === 'check') {
            handleCountedChange(numpadActive.id, numpadValue, numpadActive.type, numpadActive.systemStock, numpadActive.cost);
            handleCloseNumpad();
        } else if (key === 'C') {
            setNumpadValue('');
        } else if (key === 'backspace') {
            setNumpadValue(prev => prev.slice(0, -1));
        } else if (key === '=') {
            const result = safeEvaluate(numpadValue.replace(/,/g, '.'));
            if (result !== 0 || numpadValue.trim() === '0') {
                setNumpadValue(String(Math.round(result * 100) / 100));
            }
        } else if (['+', '-', '*', '/', '%'].includes(key)) {
            setNumpadValue(prev => prev + key);
        } else {
            // Number or decimal
            if (key === '.' && numpadValue.includes('.')) return;
            if (key === ',' && numpadValue.includes(',')) return;
            const char = key === '.' ? ',' : key;
            setNumpadValue(prev => prev + char);
        }
    };

    // Round to 2 decimals
    const roundStock = (num: number) => Math.round(num * 100) / 100;

    // Calculate difference
    const getDifference = (systemStock: number, countedStock: number | null | undefined): number | null => {
        if (countedStock === null || countedStock === undefined) return null;
        return roundStock(countedStock - systemStock);
    };

    // Format currency
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'decimal',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };

    // Save individual product
    const handleSaveProduct = async (product: InventoryProduct) => {
        const counted = countedProducts[product.id];
        if (!counted || counted.countedStock === null) return;

        setSaving(product.id);
        try {
            const result = await updateProductStock(product.id, counted.countedStock);
            if (result.adjustment) {
                setPendingAdjustments(prev => [...prev, result.adjustment!]);
                logInventoryAdjustment([{
                    name: result.adjustment.productName,
                    quantity: result.adjustment.quantity,
                    value: result.adjustment.value,
                    unit: result.adjustment.unit,
                }]);
            }
            setCountedProducts(prev => {
                const newState = { ...prev };
                delete newState[product.id];
                return newState;
            });
        } catch (error) {
            console.error('Error saving product stock:', error);
            showToast('Error al guardar el stock', 'error');
        } finally {
            setSaving(null);
        }
    };

    // Save individual ingredient
    const handleSaveIngredient = async (ingredient: InventoryIngredient) => {
        const counted = countedIngredients[ingredient.id];
        if (!counted || counted.countedStock === null) return;

        setSaving(ingredient.id);
        try {
            await updateIngredientStock(ingredient.id, counted.countedStock);
            setCountedIngredients(prev => {
                const newState = { ...prev };
                delete newState[ingredient.id];
                return newState;
            });
        } catch (error) {
            console.error('Error saving ingredient stock:', error);
            showToast('Error al guardar el stock', 'error');
        } finally {
            setSaving(null);
        }
    };

    // Save all changes
    const handleSaveAll = async () => {
        const productChanges = (Object.entries(countedProducts) as [string, CountedItem][])
            .filter(([_, item]) => item.countedStock !== null && item.hasChange)
            .map(([id, item]) => ({ id, newStock: item.countedStock!, type: 'product' as const }));

        const ingredientChanges = (Object.entries(countedIngredients) as [string, CountedItem][])
            .filter(([_, item]) => item.countedStock !== null && item.hasChange)
            .map(([id, item]) => ({ id, newStock: item.countedStock!, type: 'ingredient' as const }));

        const allChanges = [...productChanges, ...ingredientChanges];

        if (allChanges.length === 0) {
            showToast('No hay cambios para guardar', 'warning');
            return;
        }

        setSavingAll(true);
        try {
            const result = await updateMultipleStocks(allChanges);
            if (result.adjustments.length > 0) {
                setPendingAdjustments(prev => [...prev, ...result.adjustments]);
                logInventoryAdjustment(result.adjustments.map(a => ({
                    name: a.productName,
                    quantity: a.quantity,
                    value: a.value,
                    unit: a.unit,
                })));
            }
            setCountedProducts({});
            setCountedIngredients({});
            showToast(`${allChanges.length} stock(s) actualizados correctamente`, 'success');
        } catch (error) {
            console.error('Error saving all stocks:', error);
            showToast('Error al guardar los cambios', 'error');
        } finally {
            setSavingAll(false);
        }
    };

    // Deshacer ajuste negativo
    const handleUndoAdjustment = useCallback(async (adj: AdjustmentRecord) => {
        const blocked = await hasMovementsAfter(adj.productId, adj.timestamp);
        if (blocked) {
            showToast('No se puede revertir: ya hay ventas o compras posteriores de este producto.', 'error');
            setPendingAdjustments(prev => prev.filter(a => a.wastageId !== adj.wastageId));
            return;
        }
        const ok = await undoInventoryAdjustment(adj.wastageId, adj.productId, adj.quantity);
        if (ok) {
            setPendingAdjustments(prev => prev.filter(a => a.wastageId !== adj.wastageId));
            showToast(`Ajuste de ${adj.productName} revertido correctamente.`, 'success');
        } else {
            showToast('Error al revertir el ajuste.', 'error');
        }
    }, [hasMovementsAfter, undoInventoryAdjustment, showToast]);

    // Al enfocar la pantalla, verificar ajustes pendientes y descartarlos si ya hay movimientos
    useEffect(() => {
        if (pendingAdjustments.length === 0) return;
        const checkAll = async () => {
            const stillPending: AdjustmentRecord[] = [];
            for (const adj of pendingAdjustments) {
                const blocked = await hasMovementsAfter(adj.productId, adj.timestamp);
                if (!blocked) stillPending.push(adj);
            }
            setPendingAdjustments(stillPending);
        };
        checkAll();
    }, []);

    // Count total changes
    const totalChanges = useMemo(() => {
        const productChanges = (Object.values(countedProducts) as CountedItem[]).filter(i => i.hasChange).length;
        const ingredientChanges = (Object.values(countedIngredients) as CountedItem[]).filter(i => i.hasChange).length;
        return productChanges + ingredientChanges;
    }, [countedProducts, countedIngredients]);

    // Calculate summary
    const summary = useMemo(() => {
        let totalDiffUnits = 0;
        let totalDiffValue = 0;
        let itemsWithDiff = 0;

        Object.values(countedProducts).forEach(item => {
            if (item.countedStock !== null && item.countedStock !== undefined && item.systemStock !== undefined) {
                const diff = roundStock(item.countedStock - item.systemStock);
                if (diff !== 0) {
                    totalDiffUnits += diff;
                    totalDiffValue += diff * (item.cost || 0);
                    itemsWithDiff++;
                }
            }
        });

        Object.values(countedIngredients).forEach(item => {
            if (item.countedStock !== null && item.countedStock !== undefined && item.systemStock !== undefined) {
                const diff = roundStock(item.countedStock - item.systemStock);
                if (diff !== 0) {
                    totalDiffUnits += diff;
                    totalDiffValue += diff * (item.cost || 0);
                    itemsWithDiff++;
                }
            }
        });

        return { totalDiffUnits, totalDiffValue, itemsWithDiff };
    }, [countedProducts, countedIngredients]);

    // Helper para renderizar el resumen
    const renderSummaryContent = (isDesktop: boolean) => (
        <div className={`${isDesktop
            ? 'hidden lg:flex items-center gap-4 px-4 border-l border-gray-200 dark:border-gray-700 h-8'
            : 'bg-white dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-gray-700 px-3 sm:px-4 py-2.5 shrink-0 flex flex-wrap items-center gap-x-4 sm:gap-x-6 gap-y-2 text-sm shadow-sm lg:hidden'
            }`}>

            <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] uppercase text-text-secondary font-bold tracking-wide shrink-0">Unidades</span>
                <span className={`font-black truncate max-w-[100px] ${summary.totalDiffUnits >= 0 ? 'text-status-success' : 'text-status-error'}`} title={String(summary.totalDiffUnits)}>
                    {summary.totalDiffUnits >= 0 ? '+' : ''}{formatQty(summary.totalDiffUnits)}
                </span>
            </div>

            <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 hidden sm:block shrink-0"></div>

            <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] uppercase text-text-secondary font-bold tracking-wide shrink-0">Valor</span>
                <span className={`font-black truncate max-w-[120px] ${summary.totalDiffValue >= 0 ? 'text-status-success' : 'text-status-error'}`} title={formatCurrency(Math.abs(summary.totalDiffValue))}>
                    ${formatCurrency(Math.abs(summary.totalDiffValue))}
                </span>
            </div>
        </div>
    );
    const revertibleItems = wastages.filter(w => w.reason === 'AJUSTE DE INVENTARIO' && revertibleIds.has(w.id));

    const historySidebarContent = (
        <div className="fixed inset-0 z-[70] flex items-center justify-end">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]" role="button" tabIndex={-1} onClick={() => setIsHistorySidebarOpen(false)} onKeyDown={(e) => e.key === 'Escape' && setIsHistorySidebarOpen(false)} aria-label="Cerrar"></div>

            <div className="relative w-full max-w-md h-full bg-surface-light dark:bg-surface-dark shadow-2xl overflow-hidden flex flex-col animate-[slideInRight_0.4s_cubic-bezier(0.16,1,0.3,1)]">
                {/* Header */}
                <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-4 flex justify-between items-center bg-surface-light dark:bg-surface-dark shrink-0">
                    <div className="bg-amber-100 dark:bg-amber-900/30 px-4 sm:px-5 py-2 rounded-full border border-amber-200/50 dark:border-amber-700/50">
                        <h2 className="text-[10px] font-black uppercase tracking-[0.15em] text-amber-700 dark:text-amber-400">
                            HISTORIAL DE AJUSTES
                        </h2>
                    </div>
                    <button onClick={() => setIsHistorySidebarOpen(false)} className="size-9 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white transition-all active:scale-90">
                        <span className="material-symbols-outlined text-[28px] font-bold">close</span>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar bg-surface-light dark:bg-surface-dark custom-scrollbar">
                    {wastagesLoading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <div className="animate-spin size-10 sm:size-12 border-4 border-amber-500 border-t-transparent rounded-full" />
                            <p className="text-sm text-gray-400 font-bold mt-2">Cargando historial...</p>
                        </div>
                    ) : revertibleItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 px-6 text-center">
                            <span className="material-symbols-outlined text-5xl sm:text-6xl text-gray-300 mb-2">history</span>
                            <p className="text-sm sm:text-base text-gray-500 font-bold">Sin ajustes revertibles</p>
                            <p className="text-xs text-gray-400">Los ajustes pasados no son revertibles porque el producto ya tuvo ventas o compras posteriores.</p>
                        </div>
                    ) : (
                        <div className="p-4 sm:p-6 md:p-8 space-y-3">
                            {revertibleItems.map(w => {
                                const dateStr = w.created_at ? new Date(w.created_at).toLocaleDateString() : w.date;
                                const isEditing = editingHistoryId === w.id;
                                return (
                                    <div key={w.id} className="bg-white dark:bg-gray-800/40 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 transition-all hover:shadow-sm">
                                        {isEditing ? (
                                            <div className="space-y-3">
                                                <div className="flex items-center gap-2 justify-between">
                                                    <span className="text-sm font-black text-text-main dark:text-white truncate">{w.product_name}</span>
                                                    <button onClick={() => setEditingHistoryId(null)} className="text-gray-400 hover:text-gray-600 shrink-0">
                                                        <span className="material-symbols-outlined text-lg">close</span>
                                                    </button>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-black uppercase text-gray-400 mb-1">Cantidad a descontar (corrección)</label>
                                                    <input
                                                        type="number"
                                                        min={1}
                                                        value={editHistoryQty}
                                                        onChange={e => setEditHistoryQty(Math.max(1, parseInt(e.target.value) || 1))}
                                                        className="w-full h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm font-black text-center outline-none focus:border-amber-500"
                                                    />
                                                    <p className="text-[10px] text-gray-400 mt-1">Valor original: {w.quantity} unidades. Se revertirá y guardará la nueva cantidad.</p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button onClick={() => setEditingHistoryId(null)} className="flex-1 h-9 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-bold text-gray-500 hover:bg-gray-50 transition-colors">
                                                        Cancelar
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            const confirmed = await confirmAction({ title: '¿Corregir y revertir?', message: 'Se revertirá el ajuste y se aplicará la nueva cantidad.', confirmText: 'Confirmar', variant: 'danger' });
                                                            if (!confirmed) return;
                                                            setRevertingId(w.id);
                                                            const undone = await undoInventoryAdjustment(w.id, w.product_id!, w.quantity);
                                                            if (!undone) { showToast('Error al revertir', 'error'); setRevertingId(null); return; }
                                                            if (editHistoryQty > 0) {
                                                                const prod = products.find(p => p.id === w.product_id);
                                                                await updateProductStock(w.product_id!, (prod?.stock ?? 0) - editHistoryQty);
                                                            }
                                                            showToast('Ajuste corregido', 'success');
                                                            setEditingHistoryId(null);
                                                            fetchWastages();
                                                            refetch();
                                                            setRevertingId(null);
                                                        }}
                                                        disabled={revertingId === w.id}
                                                        className="flex-1 h-9 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors disabled:opacity-50"
                                                    >
                                                        {revertingId === w.id ? 'Guardando...' : 'Guardar corrección'}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                <div className="flex-1 min-w-0 flex flex-col items-start gap-1">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-sm font-black text-text-main dark:text-white truncate">{w.product_name || 'Sin producto'}</span>
                                                        <span className="text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-900/30 px-2 py-0.5 rounded-lg shrink-0">-{w.quantity} uds.</span>
                                                    </div>
                                                    <span className="text-xs text-gray-400">{dateStr}</span>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <button
                                                        onClick={() => { setEditingHistoryId(w.id); setEditHistoryQty(w.quantity); }}
                                                        className="text-xs font-bold px-3 py-2 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                                    >
                                                        Editar
                                                    </button>
                                                    <button
                                                        onClick={async () => {
                                                            const confirmed = await confirmAction({ title: '¿Revertir Ajuste?', message: 'El stock del producto volverá a su valor anterior.', confirmText: 'Revertir', variant: 'danger' });
                                                            if (!confirmed) return;
                                                            setRevertingId(w.id);
                                                            const success = await undoInventoryAdjustment(w.id, w.product_id!, w.quantity);
                                                            if (success) { showToast('Ajuste revertido', 'success'); fetchWastages(); refetch(); }
                                                            else showToast('Error al revertir', 'error');
                                                            setRevertingId(null);
                                                        }}
                                                        disabled={revertingId === w.id}
                                                        className="text-xs font-bold px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors disabled:opacity-50"
                                                    >
                                                        {revertingId === w.id ? 'Revirtiendo...' : 'Revertir'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    if (!isOnline) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center h-full bg-background-light dark:bg-background-dark p-8 text-center gap-5">
                <div className="size-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>wifi_off</span>
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Sin conexión</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-xs">
                        El conteo de stock requiere internet para cargar el inventario actualizado.
                    </p>
                </div>
            </div>
        );
    }

    if (!firstLoadDone && loading) return <ScreenLoader />;

    return (
        <div className="flex-1 flex flex-col h-full bg-background-light dark:bg-background-dark overflow-hidden animate-fadeIn">
            {/* Header - Compacto en móvil */}
            <header className="shrink-0 bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-800 px-3 py-3 md:px-6 md:py-0 md:h-14 flex items-center justify-between z-10">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                        <h1 className="text-lg md:text-xl font-semibold text-text-main dark:text-white tracking-tight truncate">
                            Conteo de Stock
                        </h1>
                        <p className="text-[10px] md:text-xs text-gray-500 hidden sm:block">Verificación de inventario físico</p>
                    </div>
                </div>
                {totalChanges > 0 && (
                    <button
                        onClick={handleSaveAll}
                        disabled={savingAll}
                        className="flex items-center gap-1.5 px-3 md:px-4 h-9 md:h-10 bg-primary text-primary-text font-bold rounded-xl hover:bg-primary-hover transition-colors shadow-md shadow-primary/20 disabled:opacity-50 text-sm shrink-0"
                    >
                        {savingAll && (
                            <span className="animate-spin material-symbols-outlined text-base">progress_activity</span>
                        )}
                        Guardar ({totalChanges})
                    </button>
                )}
            </header>

            <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-black/20 p-2 sm:p-3 md:p-4 gap-2 sm:gap-3 md:gap-4">
                {/* Banner ajuste negativo — Estático */}
                {pendingAdjustments.length > 0 && (
                    <AdjustmentBanner
                        onDismiss={() => setPendingAdjustments([])}
                    />
                )}
                {/* Controls Container - Stacked on mobile, Row on Desktop */}
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 shrink-0">
                    {/* Left Group: Tabs + Summary */}
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                        {/* Tabs */}
                        <div className="flex gap-1.5 sm:gap-2 shrink-0">
                            <button
                                onClick={() => setActiveTab('products')}
                                className={`flex-1 md:flex-none flex items-center justify-center px-4 md:px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all ${activeTab === 'products'
                                    ? 'bg-primary text-primary-text shadow-md shadow-primary/20'
                                    : 'bg-surface-light dark:bg-surface-dark text-text-secondary dark:text-gray-300 border border-border-light dark:border-border-dark hover:bg-gray-50'
                                    }`}
                            >
                                Productos ({totalProductsCount || products.length})
                            </button>
                            {ingredients.length > 0 && (
                                <button
                                    onClick={() => setActiveTab('ingredients')}
                                    className={`flex-1 md:flex-none flex items-center justify-center px-4 md:px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${activeTab === 'ingredients'
                                        ? 'bg-primary text-primary-text shadow-md shadow-primary/20'
                                        : 'bg-surface-light dark:bg-surface-dark text-text-secondary dark:text-gray-300 border border-border-light dark:border-border-dark hover:bg-gray-50'
                                        }`}
                                >
                                    Ingredientes ({ingredients.length})
                                </button>
                            )}
                            <button
                                onClick={() => setIsHistorySidebarOpen(true)}
                                className="flex-1 md:flex-none flex items-center justify-center px-4 md:px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all whitespace-nowrap bg-surface-light dark:bg-surface-dark text-text-secondary dark:text-gray-300 border border-border-light dark:border-border-dark hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                                <span className="material-symbols-outlined text-[16px] mr-1.5 pt-0.5">history</span>
                                Historial
                            </button>
                        </div>

                        {/* Summary Desktop - Insertado en grupo izquierdo */}
                        {summary.itemsWithDiff > 0 && renderSummaryContent(true)}
                    </div>

                    {/* Filters (Right Group) */}
                    <div className="flex items-center gap-2 lg:gap-3 shrink-0 lg:flex-none">
                        <div className="relative flex-1 min-w-0 lg:w-72 lg:flex-none">
                            <input
                                type="text"
                                placeholder="Buscar..."
                                className="w-full h-10 pl-9 pr-8 rounded-xl border-none bg-white dark:bg-surface-dark ring-1 ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-primary/50 text-sm transition-all outline-none text-text-main dark:text-white placeholder:text-gray-400"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-lg pointer-events-none">search</span>
                            {loading && debouncedSearchQuery ? (
                                <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-primary animate-spin text-[18px]">progress_activity</span>
                            ) : searchQuery ? (
                                <button
                                    onClick={() => { setSearchQuery(''); setDebouncedSearchQuery(''); }}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center justify-center"
                                >
                                    <span className="material-symbols-outlined text-[18px]">close</span>
                                </button>
                            ) : null}
                        </div>

                            {activeTab === 'products' && (
                                <div className="relative shrink-0 w-[120px] sm:w-[150px]">
                                    <select
                                        value={categoryFilter}
                                        onChange={(e) => setCategoryFilter(e.target.value)}
                                        className={`w-full h-10 pl-3 pr-8 rounded-xl border-none bg-white dark:bg-surface-dark ring-1 ring-gray-200 dark:ring-gray-700 focus:ring-2 focus:ring-primary/50 text-sm outline-none truncate cursor-pointer ${categoryFilter === '' ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white font-medium'}`}
                                    >
                                        <option value="" disabled hidden className="text-gray-500">Elegir categoría</option>
                                        <option value="all" className="text-gray-800 dark:text-gray-100">Todo</option>
                                        {categories.map(cat => (
                                            <option key={cat} value={cat} className="text-gray-800 dark:text-gray-100">{cat}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <label className="flex items-center justify-center size-10 rounded-xl bg-white dark:bg-surface-dark ring-1 ring-gray-200 dark:ring-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-all shrink-0 relative" title="Ver solo diferencias">
                                <input
                                    type="checkbox"
                                    checked={showOnlyDifferences}
                                    onChange={(e) => setShowOnlyDifferences(e.target.checked)}
                                    className="size-4 text-primary rounded border-gray-300 focus:ring-primary"
                                />
                                {showOnlyDifferences && (
                                    <span className="absolute -top-1 -right-1 size-2.5 bg-primary rounded-full ring-2 ring-gray-50 dark:ring-black"></span>
                                )}
                            </label>
                        </div>
                </div>

                {/* Summary Panel - Mobile (Compacto) */}
                {summary.itemsWithDiff > 0 && renderSummaryContent(false)}

                {/* Content - Cards en móvil, Tabla en desktop */}
                <div className="flex-1 bg-white dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
                    {/* Table Header - Solo desktop */}
                    <div className="hidden lg:grid grid-cols-12 gap-2 px-4 py-3 bg-background-light dark:bg-gray-900/50 border-b border-border-light dark:border-border-dark text-xs font-bold text-text-secondary uppercase tracking-wider shrink-0">
                        <div className="col-span-4">Producto</div>
                        <div className="col-span-2 text-center">Stock en Sistema</div>
                        <div className="col-span-2 text-center">Conteo Físico</div>
                        <div className="col-span-2 text-center">Ajuste</div>
                        <div className="col-span-2 text-right">Valor</div>
                    </div>

                    {/* Content Body */}
                    <div onScroll={handleScroll} className="flex-1 overflow-y-auto custom-scrollbar">
                        {activeTab === 'products' ? (
                            filteredProducts.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 sm:py-20 text-center px-4">
                                    {loading ? (
                                        <>
                                            <span className="material-symbols-outlined text-4xl text-primary animate-spin mb-3">progress_activity</span>
                                            <p className="text-sm sm:text-base text-gray-500 font-medium">Cargando productos...</p>
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-5xl sm:text-6xl text-gray-300 mb-3 sm:mb-4">inventory_2</span>
                                            <p className="text-sm sm:text-base text-gray-500 font-medium">No hay productos</p>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="p-2 sm:p-3 space-y-2 sm:space-y-3">
                                    {filteredProducts.map(product => {
                                        const counted = countedProducts[product.id]?.countedStock;
                                        const diff = getDifference(product.stock ?? 0, counted);
                                        const diffValue = diff !== null ? diff * product.cost : null;
                                        const hasChange = countedProducts[product.id]?.hasChange;

                                        return (
                                            <div key={product.id}>
                                                {/* Mobile Card Layout - Diseño notorio */}
                                                <div className={`lg:hidden rounded-xl border-[1.5px] shadow-sm transition-all ${hasChange
                                                    ? 'border-amber-400 bg-amber-50/80 dark:bg-amber-900/20 dark:border-amber-500/60 shadow-amber-200/50 dark:shadow-amber-900/20'
                                                    : 'border-gray-300/80 bg-white dark:bg-surface-dark dark:border-gray-600 hover:shadow-md hover:border-gray-400/60'
                                                    }`}>
                                                    {/* Encabezado del producto */}
                                                    <div className="flex items-center justify-between gap-3 p-3 pb-2">
                                                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                            {product.image_url ? (
                                                                <div
                                                                    className="size-10 rounded-lg bg-cover bg-center shrink-0 border border-gray-200 dark:border-gray-700"
                                                                    style={{ backgroundImage: `url('${product.image_url}')` }}
                                                                />
                                                            ) : (
                                                                <div className="size-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0 border border-gray-200 dark:border-gray-700">
                                                                    <span className="material-symbols-outlined text-gray-400 text-lg">inventory_2</span>
                                                                </div>
                                                            )}
                                                            <div className="min-w-0">
                                                                <p className="font-semibold text-sm text-text-main dark:text-white truncate">{product.name}</p>
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-background-light dark:bg-gray-800 text-text-secondary dark:text-gray-300 font-medium">{product.category_name}</span>
                                                            </div>
                                                        </div>
                                                        {counted !== null && counted !== undefined && !hasChange && (
                                                            <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold shrink-0">
                                                                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                                                Coincide
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Campos de conteo */}
                                                    <div className="flex items-center gap-3 px-3 pb-3">
                                                        <div className="flex-1">
                                                            <span className="text-[10px] uppercase tracking-wider text-text-secondary dark:text-gray-300 font-semibold">Stock en sistema</span>
                                                            <div className="mt-1 font-bold text-base text-text-main dark:text-white bg-background-light/80 dark:bg-gray-800/60 px-3 py-2 rounded-lg text-center border border-border-light/50 dark:border-border-dark/50">
                                                                {formatQty(product.stock ?? 0)} <span className="text-xs font-normal text-text-muted dark:text-gray-400 ml-1">{product.unit}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex-1">
                                                            <span className="text-[10px] uppercase tracking-wider text-gray-600 dark:text-gray-300 font-semibold">Conteo físico</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenNumpad(product.id, 'product', product.stock ?? 0, product.cost, product.name, product.unit)}
                                                                disabled={(product.stock ?? 0) < 0}
                                                                title={(product.stock ?? 0) < 0 ? 'No se puede ajustar un stock negativo' : undefined}
                                                                className={`mt-1 w-full h-10 text-center text-base font-bold rounded-lg border-2 outline-none transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-200 dark:disabled:hover:border-gray-600 disabled:active:scale-100 ${hasChange
                                                                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                                                    : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white'
                                                                    } hover:border-primary/50 active:scale-[0.98]`}
                                                            >
                                                                {counted != null ? formatQty(counted) : <span className="text-gray-400">Ingresa</span>}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Resultado del ajuste */}
                                                    {diff !== null && (
                                                        diff === 0 ? (
                                                            <div className="flex items-center gap-2 px-3 py-2.5 rounded-b-xl bg-emerald-50 dark:bg-emerald-900/20 border-t border-emerald-100 dark:border-emerald-900/40">
                                                                <span className="material-symbols-outlined text-emerald-500 text-base" style={{ fontVariationSettings: "'FILL' 1" }}>task_alt</span>
                                                                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Concordancia — el físico coincide con el sistema</span>
                                                            </div>
                                                        ) : (
                                                            <div className={`flex flex-col px-3 py-2 rounded-b-xl ${diff > 0 ? 'bg-status-success/10 dark:bg-emerald-900/20' : 'bg-status-error/10 dark:bg-red-900/20'}`}>
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className="material-symbols-outlined text-sm" style={{ color: diff > 0 ? '#10b981' : '#ef4444' }}>
                                                                            {diff > 0 ? 'trending_up' : 'trending_down'}
                                                                        </span>
                                                                        <span className={`text-sm font-bold ${diff > 0 ? 'text-status-success' : 'text-status-error'}`}>
                                                                            {diff > 0 ? '+' : ''}{formatQty(diff)} unidades
                                                                        </span>
                                                                    </div>
                                                                    {diffValue !== null && (
                                                                        <span className={`text-sm font-bold ${diffValue > 0 ? 'text-status-success' : 'text-status-error'}`}>
                                                                            {diffValue > 0 ? '+' : ''}${formatCurrency(diffValue)}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {diff < 0 && (
                                                                    <span className="text-[10px] text-rose-500 font-medium mt-1 pl-6">* Se registrará como merma</span>
                                                                )}
                                                            </div>
                                                        )
                                                    )}
                                                </div>

                                                {/* Desktop Table Row */}
                                                <div className={`hidden lg:grid grid-cols-12 gap-2 px-4 py-2 items-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${hasChange ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
                                                    <div className="col-span-4 flex items-center gap-3">
                                                        {product.image_url ? (
                                                            <div
                                                                className="size-12 rounded-lg bg-cover bg-center shrink-0 border border-gray-200 dark:border-gray-700"
                                                                style={{ backgroundImage: `url('${product.image_url}')` }}
                                                            />
                                                        ) : (
                                                            <div className="size-12 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0">
                                                                <span className="material-symbols-outlined text-gray-400 text-base">inventory_2</span>
                                                            </div>
                                                        )}
                                                        <div className="min-w-0">
                                                            <p className="font-bold text-sm text-gray-900 dark:text-white truncate">{product.name}</p>
                                                            <p className="text-xs text-gray-400 truncate">{product.category_name}</p>
                                                        </div>
                                                    </div>
                                                    <div className="col-span-2 text-center">
                                                        <span className="font-bold text-sm text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                                                            {formatQty(product.stock ?? 0)} <span className="text-xs font-normal text-gray-500 dark:text-gray-400 ml-0.5">{product.unit}</span>
                                                        </span>
                                                    </div>
                                                    <div className="col-span-2 text-center">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            placeholder="-"
                                                            disabled={(product.stock ?? 0) < 0}
                                                            title={(product.stock ?? 0) < 0 ? 'No se puede ajustar un stock negativo' : undefined}
                                                            className={`w-20 h-8 text-center text-sm font-bold rounded-lg border outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-400 ${hasChange
                                                                ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                                                                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white'
                                                                } focus:ring-1 focus:ring-primary focus:border-primary`}
                                                            value={counted ?? ''}
                                                            onChange={(e) => handleCountedChange(product.id, e.target.value, 'product', product.stock ?? 0, product.cost)}
                                                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                        />
                                                    </div>
                                                    <div className="col-span-2 text-center flex flex-col items-center justify-center">
                                                        {diff !== null && (
                                                            diff === 0 ? (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 text-xs font-bold shadow-sm shadow-emerald-100/50 dark:shadow-none" title="El conteo coincide perfectamente con el sistema">
                                                                    <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                                                    Coincide
                                                                </span>
                                                            ) : (
                                                                <div className="flex flex-col items-center gap-0.5">
                                                                    <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                                                        diff > 0 
                                                                            ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-900' 
                                                                            : 'bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 border-rose-100 dark:border-rose-900'
                                                                    }`}>
                                                                        {diff > 0 ? '+' : ''}{formatQty(diff)}
                                                                    </span>
                                                                    {diff < 0 && (
                                                                        <span className="text-[9px] text-rose-500 font-semibold tracking-wide uppercase mt-0.5" title="Se registrará como merma">* Merma</span>
                                                                    )}
                                                                </div>
                                                            )
                                                        )}
                                                    </div>
                                                    <div className="col-span-2 text-right">
                                                        {diffValue !== null && (
                                                            <span className={`font-bold text-sm ${diffValue > 0 ? 'text-status-success' : diffValue < 0 ? 'text-status-error' : 'text-gray-400'}`}>
                                                                {diffValue > 0 ? '+' : ''}${formatCurrency(diffValue)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Indicador de carga de más productos */}
                                    {loadingMore && (
                                        <div className="flex items-center justify-center py-4 gap-2 text-primary font-bold text-xs">
                                            <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                                            <span>Cargando más productos...</span>
                                        </div>
                                    )}
                                </div>
                            )
                        ) : activeTab === 'ingredients' ? (
                            filteredIngredients.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 sm:py-20 text-center px-4">
                                    <span className="material-symbols-outlined text-5xl sm:text-6xl text-gray-300 mb-3 sm:mb-4">grocery</span>
                                    <p className="text-sm sm:text-base text-gray-500 font-medium">No hay ingredientes</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {filteredIngredients.map(ingredient => {
                                        const counted = countedIngredients[ingredient.id]?.countedStock;
                                        const diff = getDifference(ingredient.stock, counted);
                                        const diffValue = diff !== null ? diff * ingredient.cost_per_unit : null;
                                        const hasChange = countedIngredients[ingredient.id]?.hasChange;

                                        return (
                                            <div key={ingredient.id}>
                                                {/* Mobile Card Layout */}
                                                <div className={`lg:hidden p-3 sm:p-4 ${hasChange ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
                                                    <div className="flex items-start justify-between gap-3 mb-3">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="font-bold text-sm text-text-main dark:text-white truncate">{ingredient.name}</p>
                                                            <p className="text-xs text-text-muted">{ingredient.unit}</p>
                                                        </div>
                                                        {counted !== null && counted !== undefined && !hasChange && (
                                                            <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold shrink-0">
                                                                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                                                Coincide
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 flex items-center gap-2">
                                                            <span className="text-xs text-text-secondary w-14">Sistema:</span>
                                                            <span className="font-bold text-sm text-text-main dark:text-white bg-background-light dark:bg-gray-800 px-2.5 py-1.5 rounded-lg">
                                                                {formatQty(ingredient.stock)} <span className="text-xs font-normal text-text-muted dark:text-gray-400 ml-0.5">{ingredient.unit}</span>
                                                            </span>
                                                        </div>
                                                        <div className="flex-1 flex items-center gap-2">
                                                            <span className="text-xs text-gray-600 w-14">Contado:</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenNumpad(ingredient.id, 'ingredient', ingredient.stock, ingredient.cost_per_unit, ingredient.name, ingredient.unit)}
                                                                disabled={ingredient.stock < 0}
                                                                title={ingredient.stock < 0 ? 'No se puede ajustar un stock negativo' : undefined}
                                                                className={`w-full max-w-[80px] h-10 text-center text-sm font-bold rounded-xl border-2 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border-light dark:disabled:hover:border-border-dark disabled:active:scale-100 ${hasChange
                                                                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                                                                    : 'border-border-light dark:border-border-dark bg-surface-light dark:bg-gray-900 text-text-main dark:text-white'
                                                                    } hover:border-primary/50 active:scale-[0.98]`}
                                                            >
                                                                {counted != null ? formatQty(counted) : <span className="text-gray-400">-</span>}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {diff !== null && (
                                                        <div className="flex flex-col mt-2 pt-2 border-t border-border-light dark:border-gray-800">
                                                            <div className="flex items-center justify-between">
                                                                <span className={`text-sm font-bold ${diff > 0 ? 'text-status-success' : diff < 0 ? 'text-status-error' : 'text-text-muted'}`}>
                                                                    Diferencia: {diff > 0 ? '+' : ''}{formatQty(diff)}
                                                                </span>
                                                                {diffValue !== null && (
                                                                    <span className={`text-sm font-bold ${diffValue > 0 ? 'text-status-success' : diff < 0 ? 'text-status-error' : 'text-text-muted'}`}>
                                                                        ${formatCurrency(diffValue)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {diff < 0 && (
                                                                <span className="text-[10px] text-rose-500 font-medium mt-1">* Se registrará como merma</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Desktop Table Row */}
                                                <div className={`hidden lg:grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${hasChange ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
                                                    <div className="col-span-4">
                                                        <p className="font-bold text-sm text-text-main dark:text-white truncate">{ingredient.name}</p>
                                                    </div>
                                                    <div className="col-span-2 text-center">
                                                        <span className="font-bold text-sm text-text-main dark:text-white bg-background-light dark:bg-gray-800 px-2 py-1 rounded">
                                                            {formatQty(ingredient.stock)} <span className="text-xs font-normal text-text-muted dark:text-gray-400 ml-0.5">{ingredient.unit}</span>
                                                        </span>
                                                    </div>
                                                    <div className="col-span-2 text-center">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            placeholder="-"
                                                            disabled={ingredient.stock < 0}
                                                            title={ingredient.stock < 0 ? 'No se puede ajustar un stock negativo' : undefined}
                                                            className={`w-20 h-8 text-center text-sm font-bold rounded-lg border outline-none transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-400 ${hasChange
                                                                ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                                                                : 'border-border-light dark:border-border-dark bg-surface-light dark:bg-gray-900 text-text-main dark:text-white'
                                                                } focus:ring-1 focus:ring-primary focus:border-primary`}
                                                            value={counted ?? ''}
                                                            onChange={(e) => handleCountedChange(ingredient.id, e.target.value, 'ingredient', ingredient.stock, ingredient.cost_per_unit)}
                                                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                        />
                                                    </div>
                                                    <div className="col-span-2 text-center flex flex-col items-center justify-center">
                                                        {diff !== null && (
                                                            diff === 0 ? (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 text-xs font-bold shadow-sm shadow-emerald-100/50 dark:shadow-none" title="El conteo coincide perfectamente con el sistema">
                                                                    <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                                                                    Coincide
                                                                </span>
                                                            ) : (
                                                                <div className="flex flex-col items-center gap-0.5">
                                                                    <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                                                                        diff > 0 
                                                                            ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-900' 
                                                                            : 'bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 border-rose-100 dark:border-rose-900'
                                                                    }`}>
                                                                        {diff > 0 ? '+' : ''}{formatQty(diff)}
                                                                    </span>
                                                                    {diff < 0 && (
                                                                        <span className="text-[9px] text-rose-500 font-semibold tracking-wide uppercase mt-0.5" title="Se registrará como merma">* Merma</span>
                                                                    )}
                                                                </div>
                                                            )
                                                        )}
                                                    </div>
                                                    <div className="col-span-2 text-right">
                                                        {diffValue !== null && (
                                                            <span className={`font-bold text-sm ${diffValue > 0 ? 'text-status-success' : diffValue < 0 ? 'text-status-error' : 'text-text-muted'}`}>
                                                                {diffValue > 0 ? '+' : ''}${formatCurrency(diffValue)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )
                        ) : null}
                    </div>
                </div>
            </div>

            {/* Numpad Modal for Mobile */}
            {numpadActive && (
                <>
                    <div
                        className="fixed inset-0 bg-black/40 z-[60] animate-[fadeIn_0.2s_ease-out]"
                        onPointerDown={handleCloseNumpad}
                    />
                    <div className="fixed bottom-0 left-0 right-0 z-[70]">
                        <InventoryNumpad
                            onPress={handleNumpadPress}
                            onClose={handleCloseNumpad}
                        >
                            <div className="px-4 pb-4">
                                <p className="text-base font-semibold text-gray-900 dark:text-white mb-3 truncate">{numpadActive.name}</p>

                                <div className="flex items-stretch gap-3">
                                    <div className="bg-background-light/80 dark:bg-zinc-800/80 rounded-xl px-4 py-2.5 text-center min-w-[80px]">
                                        <p className="text-[10px] uppercase tracking-wider text-text-secondary dark:text-gray-400 font-medium mb-0.5">Stock en sistema</p>
                                        <p className="text-xl font-bold text-text-main dark:text-gray-200">{numpadActive.systemStock}</p>
                                        <p className="text-[10px] text-text-secondary dark:text-gray-400 mt-0.5">{numpadActive.unit}</p>
                                    </div>

                                    <div className="flex-1 bg-primary/10 dark:bg-primary/20 rounded-xl p-3 text-center border-2 border-primary/30">
                                        <p className="text-[10px] uppercase tracking-wider text-text-secondary dark:text-gray-300 font-medium mb-0.5">Conteo físico</p>
                                        <p className="text-2xl font-bold text-text-main dark:text-white min-h-[36px]">
                                            {numpadValue ? numpadValue.replace('.', ',') : <span className="text-text-muted dark:text-gray-500">0</span>}
                                        </p>
                                        <p className="text-[10px] text-text-secondary dark:text-gray-400 mt-0.5">{numpadActive.unit}</p>
                                    </div>
                                </div>
                            </div>
                        </InventoryNumpad>
                    </div>
                </>
            )}

            {numpadShield && (
                <div
                    className="fixed inset-0 z-[80]"
                    onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                />
            )}

            {isHistorySidebarOpen && historySidebarContent}
        </div>
    );
};
