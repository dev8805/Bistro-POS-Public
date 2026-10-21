import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { Product } from '../../hooks/useProducts';
import { InventoryItem } from './shared';
import { formatCurrency } from '../../lib/formatters';

export interface ScannedMatchedItem {
    ocrName: string;
    product: Product;
    quantity: number;
    unitCost: number;
    selected: boolean;
    ocr_unit?: string | null;
    manualFallbackUnit?: string;
    extraFields?: Record<string, string | number>;
}

export interface ScannedUnmatchedItem {
    ocrName: string;
    quantity: number;
    unitCost: number;
    ocr_unit?: string | null;
    extraFields?: Record<string, string | number>;
}

const shortUnit = (u: string) => {
    if (!u) return '';
    const map: Record<string, string> = {
        'Unidad': 'Und',
        'Gramos': 'g',
        'Kilogramos': 'Kg',
        'Mililitros': 'ml',
        'Litros': 'L',
        'Libras': 'Lb',
        'Onzas': 'oz'
    };
    return map[u] || u.substring(0, 3);
};

const matchUOM = (ocrUnit: string | null | undefined, productUnits: any[]) => {
    if (!ocrUnit || !productUnits || !Array.isArray(productUnits)) return null;
    return productUnits.find(u => u.unit_name.trim().toLowerCase() === ocrUnit.trim().toLowerCase()) || null;
};

interface InvoiceReviewPanelProps {
    matched: ScannedMatchedItem[];
    unmatched: ScannedUnmatchedItem[];
    products: Product[];
    supplierName?: string;
    onConfirm: (items: InventoryItem[]) => void;
    onRescan: () => void;
}



export const InvoiceReviewPanel: React.FC<InvoiceReviewPanelProps> = ({
    matched,
    unmatched,
    products,
    supplierName,
    onConfirm,
    onRescan,
}) => {
    const { showToast } = useToast();
    const { profile } = useAuth();

    // Estado editable para matched. El total de línea es cantidad × valor unitario
    // (ya no se evalúa ninguna Fórmula_Costo por proveedor).
    const [localMatched, setLocalMatched] = useState<ScannedMatchedItem[]>(() => matched.map(it => ({ ...it })));

    // Estado editable de cantidad y costo para unmatched
    const [unmatchedEdits, setUnmatchedEdits] = useState<Record<number, { qty: string; cost: string; manualFallbackUnit?: string }>>(() => {
        return Object.fromEntries(unmatched.map((it, i) => [i, { qty: String(it.quantity), cost: String(it.unitCost) }]));
    });
    const [assignments, setAssignments] = useState<Record<number, Product | null>>({});
    const [searchQueries, setSearchQueries] = useState<Record<number, string>>({});
    const [savedNicknames, setSavedNicknames] = useState<Set<number>>(new Set());
    const [savingNickname, setSavingNickname] = useState<number | null>(null);
    // Nuevos precios de venta propuestos por el usuario (por índice de matched)
    const [priceEdits, setPriceEdits] = useState<Record<number, string>>({});
    const [showUnassignedWarning, setShowUnassignedWarning] = useState(false);


    const filteredProducts = (query: string) => {
        if (!query.trim()) return [];
        const q = query.toLowerCase();
        return products.filter(p =>
            p.name.toLowerCase().includes(q) ||
            (p.nicknames || []).some((n: string) => n.toLowerCase().includes(q))
        ).slice(0, 5);
    };

    const handleToggleMatched = (index: number) => {
        setLocalMatched(prev => prev.map((item, i) =>
            i === index ? { ...item, selected: !item.selected } : item
        ));
    };

    const handleMatchedEdit = (index: number, field: 'quantity' | 'unitCost' | 'manualFallbackUnit', value: string) => {
        setLocalMatched(prev => prev.map((item, i) => {
            if (i !== index) return item;
            if (field === 'manualFallbackUnit') return { ...item, [field]: value };
            return { ...item, [field]: parseFloat(value) || 0 };
        }));
    };

    const handleAssign = (uIndex: number, product: Product) => {
        setAssignments(prev => ({ ...prev, [uIndex]: product }));
        setSearchQueries(prev => ({ ...prev, [uIndex]: '' }));
    };

    const handleSaveNickname = async (uIndex: number, product: Product, ocrName: string) => {
        const trimmed = ocrName.trim();
        if (!trimmed) return;
        const currentNicknames: string[] = product.nicknames || [];
        if (currentNicknames.map(n => n.toLowerCase()).includes(trimmed.toLowerCase())) {
            showToast(`"${trimmed}" ya es apodo de este producto`, 'warning');
            return;
        }
        setSavingNickname(uIndex);
        try {
            const { data: existing } = await supabase
                .from('products')
                .select('id, name')
                .eq('business_id', profile?.business_id)
                .contains('nicknames', [trimmed])
                .neq('id', product.id)
                .limit(1);
            if (existing && existing.length > 0) {
                showToast(`El apodo "${trimmed}" ya existe en "${existing[0].name}"`, 'warning');
                return;
            }
            const { error } = await supabase
                .from('products')
                .update({ nicknames: [...currentNicknames, trimmed] })
                .eq('id', product.id);
            if (error) throw error;
            setSavedNicknames(prev => new Set(prev).add(uIndex));
            showToast(`Apodo "${trimmed}" guardado en ${product.name}`, 'success');
        } catch (err: any) {
            showToast(`Error al guardar apodo: ${err.message}`, 'error');
        } finally {
            setSavingNickname(null);
        }
    };

    const handleConfirm = async () => {
        const unassignedCount = unmatched.filter((_, i) => !assignments[i]).length;
        if (unassignedCount > 0 && !showUnassignedWarning) {
            setShowUnassignedWarning(true);
            return;
        }
        setShowUnassignedWarning(false);
        const items: InventoryItem[] = [];

        // Actualizar precios en Supabase si el usuario los cambió
        const priceUpdatePromises = localMatched
            .filter((item, i) => item.selected && priceEdits[i] !== undefined)
            .map((item, _i) => {
                const matchedIndex = localMatched.indexOf(item);
                const newPrice = parseFloat(priceEdits[matchedIndex]);
                if (isNaN(newPrice) || newPrice <= 0) return Promise.resolve();
                return supabase.from('products').update({ price: newPrice }).eq('id', item.product.id);
            });
        await Promise.all(priceUpdatePromises);

        localMatched.forEach(item => {
            if (!item.selected) return;
            const saleUnit = item.product.unit || 'ud';
            const selectedUnitName = item.manualFallbackUnit || item.ocr_unit;
            const matchedDbUnit = matchUOM(selectedUnitName, item.product.product_purchase_units || []);

            let finalQty = item.quantity;
            let finalCost = item.unitCost;

            if (matchedDbUnit) {
                finalQty = +(item.quantity * matchedDbUnit.conversion_factor).toFixed(3);
                finalCost = +(item.unitCost / matchedDbUnit.conversion_factor).toFixed(2);
            }

            items.push({
                product: item.product,
                quantity: String(finalQty),
                measureUnit: saleUnit,
                unitCost: String(finalCost),
                extraFields: { ...item.extraFields, original_ocr_unit: item.ocr_unit || undefined },
            });
        });

        unmatched.forEach((item, index) => {
            const assigned = assignments[index];
            if (!assigned) return;
            const edits = unmatchedEdits[index];
            const qty = parseFloat(edits?.qty) || item.quantity;
            const cost = parseFloat(edits?.cost) || item.unitCost;
            const saleUnit = assigned.unit || 'ud';

            const selectedUnitName = edits?.manualFallbackUnit || item.ocr_unit;
            const matchedDbUnit = matchUOM(selectedUnitName, assigned.product_purchase_units || []);

            let finalQty = qty;
            let finalCost = cost;

            if (matchedDbUnit) {
                finalQty = +(qty * matchedDbUnit.conversion_factor).toFixed(3);
                finalCost = +(cost / matchedDbUnit.conversion_factor).toFixed(2);
            }

            items.push({
                product: assigned,
                quantity: String(finalQty),
                measureUnit: saleUnit,
                unitCost: String(finalCost),
                extraFields: { ...item.extraFields, original_ocr_unit: item.ocr_unit || undefined },
            });
        });

        onConfirm(items);
    };

    const totalConfirmable =
        localMatched.filter(m => m.selected).length +
        Object.values(assignments).filter(Boolean).length;

    const totalConfirmableValue = localMatched.reduce((acc, item) => {
        if (!item.selected) return acc;
        return acc + (item.quantity * item.unitCost);
    }, 0) + unmatched.reduce((acc, item, index) => {
        const assigned = assignments[index];
        if (!assigned) return acc;
        const edits = unmatchedEdits[index];
        const qty = parseFloat(edits?.qty) || item.quantity;
        const cost = parseFloat(edits?.cost) || item.unitCost;
        return acc + (qty * cost);
    }, 0);

    return (
        <div className="flex flex-col h-full bg-surface-light dark:bg-surface-dark">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                <button
                    type="button"
                    onClick={onRescan}
                    className="size-9 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    aria-label="Volver"
                >
                    <span className="material-symbols-outlined text-[22px]">arrow_back</span>
                </button>
                <div>
                    <h2 className="text-sm font-black text-gray-800 dark:text-white">{supplierName || 'Revisión'}</h2>
                    <p className="text-[11px] text-gray-400">
                        {localMatched.length + unmatched.length} productos encontrados
                        {unmatched.length > 0 && ` · ${unmatched.length} sin reconocer`}
                    </p>
                </div>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 no-scrollbar">

                {/* Matched */}
                {localMatched.map((item, index) => {
                    const saleUnit = item.product.unit || 'ud';
                    const selectedUnitName = item.manualFallbackUnit || item.ocr_unit;
                    const matchedDbUnit = matchUOM(selectedUnitName, item.product.product_purchase_units || []);

                    let finalQty = item.quantity;
                    let finalCost = item.unitCost;

                    if (matchedDbUnit) {
                        finalQty = +(item.quantity * matchedDbUnit.conversion_factor).toFixed(3);
                        finalCost = +(item.unitCost / matchedDbUnit.conversion_factor).toFixed(2);
                    }

                    const rowTotal = item.quantity * item.unitCost;

                    return (
                        <div
                            key={`m-${index}`}
                            className={`bg-white dark:bg-gray-800/80 rounded-xl border p-3 transition-all ${item.selected
                                ? 'border-emerald-200 dark:border-emerald-800'
                                : 'border-gray-200 dark:border-gray-700 opacity-50'
                                }`}
                        >
                            {/* Fila superior: checkbox + nombre + costo */}
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <button
                                        type="button"
                                        onClick={() => handleToggleMatched(index)}
                                        className={`size-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${item.selected
                                            ? 'bg-emerald-500 border-emerald-500'
                                            : 'border-gray-300 dark:border-gray-600'
                                            }`}
                                        aria-label={item.selected ? 'Deseleccionar' : 'Seleccionar'}
                                    >
                                        {item.selected && <span className="material-symbols-outlined text-white text-[14px]">check</span>}
                                    </button>
                                    <div className="min-w-0">
                                        <p className="font-bold text-[14px] leading-tight text-gray-800 dark:text-gray-100 truncate">{item.product.name}</p>
                                        <p className="text-[10px] text-gray-400 truncate">"{item.ocrName}"</p>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-md whitespace-nowrap">
                                        Total: ${rowTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </p>
                                </div>
                            </div>

                            {/* Fila inferior: cantidad editable + costo editable */}
                            <div className="flex items-center gap-2 mt-2.5 pl-[34px]">
                                <div className="w-28 shrink-0">
                                    <label className="text-[9px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest block mb-0.5">
                                        CANTIDAD
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            onWheel={(e) => e.currentTarget.blur()}
                                            value={item.quantity}
                                            onChange={e => handleMatchedEdit(index, 'quantity', e.target.value)}
                                            className="w-full h-8 pl-2.5 pr-12 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-bold text-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-400/40"
                                        />
                                        {selectedUnitName && (
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-black text-gray-800 dark:text-gray-200 pointer-events-none">
                                                {selectedUnitName}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="text-[9px] font-black text-[#797284] uppercase tracking-widest flex items-center justify-between mb-0.5">
                                        <span>COSTO X {selectedUnitName ? selectedUnitName.toUpperCase() : 'UNIDAD'}</span>
                                    </label>
                                    <input
                                        type="number"
                                        step="1"
                                        min="0"
                                        onWheel={(e) => e.currentTarget.blur()}
                                        value={item.unitCost}
                                        onChange={e => handleMatchedEdit(index, 'unitCost', e.target.value)}
                                        className="w-full h-8 px-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-bold text-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-emerald-400/40"
                                    />
                                </div>
                            </div>

                            {/* Tooltips y Fallback Options */}
                            <div className="pl-[34px]">

                                {/* Badge de conversión exitosa (Opción B) */}
                                {matchedDbUnit && (
                                    <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/40 rounded-lg px-2.5 py-2 mt-2">
                                        <span className="material-symbols-outlined text-emerald-500 text-[15px] shrink-0">inventory_2</span>
                                        <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 leading-snug">
                                            Entran {finalQty} {shortUnit(saleUnit)} a un costo de ${Math.round(finalCost).toLocaleString('es-CO')} c/u.
                                        </p>
                                    </div>
                                )}

                                {/* Cajón de impacto en precio de venta */}
                                {(() => {
                                    const prevCost = item.product.cost || 0;
                                    const newCost = finalCost;
                                    const salePrice = item.product.price || 0;
                                    if (!matchedDbUnit || prevCost <= 0 || newCost <= 0 || salePrice <= 0) return null;

                                    // Comparamos redondeando para evitar falsos positivos por decimales infinitos de divisiones
                                    const roundedPrev = Math.round(prevCost);
                                    const roundedNew = Math.round(newCost);
                                    const isUp = roundedNew > roundedPrev;
                                    const isDown = roundedNew < roundedPrev;

                                    const deltaPct = ((newCost - prevCost) / prevCost) * 100;
                                    const prevMargin = ((salePrice - prevCost) / salePrice) * 100;
                                    const newMargin = ((salePrice - newCost) / salePrice) * 100;

                                    const color = isUp
                                        ? { bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800/40', text: 'text-red-700 dark:text-red-400', icon: 'trending_up', badge: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' }
                                        : isDown
                                            ? { bg: 'bg-emerald-50 dark:bg-emerald-900/10', border: 'border-emerald-200 dark:border-emerald-700/40', text: 'text-emerald-700 dark:text-emerald-400', icon: 'trending_down', badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' }
                                            : { bg: 'bg-gray-50 dark:bg-gray-800/40', border: 'border-gray-200 dark:border-gray-700', text: 'text-gray-600 dark:text-gray-400', icon: 'trending_flat', badge: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' };

                                    const currentPriceEdit = priceEdits[index] ?? String(salePrice);

                                    return (
                                        <div className={`mt-2 rounded-xl border ${color.bg} ${color.border} p-3 space-y-2`}>
                                            {/* Encabezado */}
                                            <div className="flex items-center gap-1.5">
                                                <span className={`material-symbols-outlined text-[16px] shrink-0 ${color.text}`}>{color.icon}</span>
                                                <span className={`text-[11px] font-black ${color.text}`}>
                                                    {isUp ? `Costo subió ${Math.abs(deltaPct).toFixed(1)}%` : isDown ? `Costo bajó ${Math.abs(deltaPct).toFixed(1)}%` : 'Estable'}
                                                </span>
                                                <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${color.badge}`}>
                                                    Margen: {newMargin.toFixed(1)}%
                                                </span>
                                            </div>

                                            {/* Comparación de costos */}
                                            <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                                                <span className="line-through">${Math.round(prevCost).toLocaleString('es-CO')}</span>
                                                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                                                <span className={`font-bold ${color.text}`}>${Math.round(newCost).toLocaleString('es-CO')} c/u</span>
                                                <span className="text-gray-400">· Margen ant: {prevMargin.toFixed(1)}%</span>
                                            </div>

                                            {/* Editor de precio de venta */}
                                            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-emerald-100 dark:border-emerald-800/20">
                                                <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider shrink-0">Precio venta:</span>
                                                <div className="flex items-center gap-1.5 flex-1 min-w-[100px]">
                                                    <span className="text-[11px] text-gray-400">$</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="1"
                                                        onWheel={e => e.currentTarget.blur()}
                                                        value={currentPriceEdit}
                                                        onChange={e => setPriceEdits(prev => ({ ...prev, [index]: e.target.value }))}
                                                        className="flex-1 w-full min-w-0 h-8 px-2.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-[13px] font-bold text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-emerald-400/40 transition-shadow"
                                                    />
                                                </div>
                                                {parseFloat(currentPriceEdit) !== salePrice && (
                                                    <span className="text-[10px] font-bold px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 w-full sm:w-auto text-center shrink-0">
                                                        Se guardará al confirmar
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Fallback Select nativo si hay OCR Unit pero no hizo match */}
                                {item.ocr_unit && !matchedDbUnit && (item.product.product_purchase_units?.length || 0) > 0 && (
                                    <div className="mt-2 flex flex-col gap-1">
                                        <label className="text-[11px] text-orange-600 dark:text-orange-400 font-medium tracking-tight">
                                            Facturado en "{item.ocr_unit}". Selecciona equivalencia:
                                        </label>
                                        <select
                                            className="text-xs bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded p-1 mb-1 outline-none focus:ring-1 focus:ring-orange-400 text-gray-700 dark:text-gray-300 font-medium"
                                            value={item.manualFallbackUnit || ''}
                                            onChange={(e) => handleMatchedEdit(index, 'manualFallbackUnit', e.target.value)}
                                        >
                                            <option value="">-- Sin equivalencia --</option>
                                            {item.product.product_purchase_units?.map(u => (
                                                <option key={u.unit_name} value={u.unit_name}>{u.unit_name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {/* Unmatched */}
                {unmatched.map((item, uIndex) => {
                    const assignedProduct = assignments[uIndex];
                    const saleUnit = assignedProduct?.unit || 'ud';
                    const edits = unmatchedEdits[uIndex] || { qty: String(item.quantity), cost: String(item.unitCost) };
                    const qty = parseFloat(edits.qty) || item.quantity;
                    const cost = parseFloat(edits.cost) || item.unitCost;

                    const selectedUnitName = edits.manualFallbackUnit || item.ocr_unit;
                    const matchedDbUnit = assignedProduct ? matchUOM(selectedUnitName, assignedProduct.product_purchase_units || []) : null;

                    let finalQty = qty;
                    let finalCost = cost;

                    if (matchedDbUnit) {
                        finalQty = +(qty * matchedDbUnit.conversion_factor).toFixed(3);
                        finalCost = +(cost / matchedDbUnit.conversion_factor).toFixed(2);
                    }

                    const rowTotal = qty * cost;

                    return (
                        <div
                            key={`u-${uIndex}`}
                            className="bg-white dark:bg-gray-800/80 rounded-xl border border-amber-200 dark:border-amber-800/40 p-3 space-y-2"
                        >
                            {/* Cabecera */}
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300 truncate block">"{item.ocrName}"</span>
                                </div>
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 font-bold">
                                        Sin reconocer
                                    </span>
                                    <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-md whitespace-nowrap">
                                        Total: ${rowTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </p>
                                </div>
                            </div>

                            {/* Cantidad y costo editables */}
                            <div className="flex items-center gap-2">
                                <div className="w-28 shrink-0">
                                    <label className="text-[9px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest block mb-0.5">
                                        CANTIDAD
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            onWheel={(e) => e.currentTarget.blur()}
                                            value={edits.qty}
                                            onChange={e => setUnmatchedEdits(prev => ({ ...prev, [uIndex]: { ...edits, qty: e.target.value } }))}
                                            className="w-full h-8 pl-2.5 pr-12 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-bold text-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-amber-400/40"
                                        />
                                        {selectedUnitName && (
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-black text-gray-800 dark:text-gray-200 pointer-events-none">
                                                {selectedUnitName}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <label className="text-[9px] font-black text-[#797284] uppercase tracking-widest flex items-center justify-between mb-0.5">
                                        <span>COSTO X {selectedUnitName ? selectedUnitName.toUpperCase() : saleUnit.toUpperCase()}</span>
                                    </label>
                                    <input
                                        type="number"
                                        step="1"
                                        min="0"
                                        onWheel={(e) => e.currentTarget.blur()}
                                        value={edits.cost}
                                        onChange={e => setUnmatchedEdits(prev => ({ ...prev, [uIndex]: { ...edits, cost: e.target.value } }))}
                                        className="w-full h-8 px-2.5 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-bold text-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-amber-400/40"
                                    />
                                </div>
                            </div>

                            {/* Tooltips y Fallback Options (solo si ya asignó un producto) */}
                            {assignedProduct && (
                                <div className="space-y-2 mt-2">

                                    {matchedDbUnit && (
                                        <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/40 rounded-lg px-2.5 py-2 mt-2">
                                            <span className="material-symbols-outlined text-emerald-500 text-[15px] shrink-0">inventory_2</span>
                                            <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 leading-snug">
                                                Entran {finalQty} {shortUnit(saleUnit)} a un costo de ${Math.round(finalCost).toLocaleString('es-CO')} c/u.
                                            </p>
                                        </div>
                                    )}

                                    {/* Fallback Select nativo si hay OCR Unit pero no hizo match */}
                                    {item.ocr_unit && !matchedDbUnit && (assignedProduct.product_purchase_units?.length || 0) > 0 && (
                                        <div className="mt-2 flex flex-col gap-1">
                                            <label className="text-[11px] text-orange-600 dark:text-orange-400 font-medium tracking-tight">
                                                Facturado en "{item.ocr_unit}". Selecciona equivalencia:
                                            </label>
                                            <select
                                                className="text-xs bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded p-1 mb-1 outline-none focus:ring-1 focus:ring-orange-400 text-gray-700 dark:text-gray-300 font-medium"
                                                value={edits.manualFallbackUnit || ''}
                                                onChange={(e) => setUnmatchedEdits(prev => ({ ...prev, [uIndex]: { ...edits, manualFallbackUnit: e.target.value } }))}
                                            >
                                                <option value="">-- Sin equivalencia --</option>
                                                {assignedProduct.product_purchase_units?.map(u => (
                                                    <option key={u.unit_name} value={u.unit_name}>{u.unit_name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Asignación de producto */}
                            {assignedProduct ? (
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/10 rounded-lg p-2">
                                        <span className="material-symbols-outlined text-emerald-500 text-[16px]">check_circle</span>
                                        <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 flex-1 truncate">
                                            {assignedProduct.name}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setAssignments(prev => ({ ...prev, [uIndex]: null }));
                                                setSavedNicknames(prev => { const s = new Set(prev); s.delete(uIndex); return s; });
                                            }}
                                            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                                        >
                                            Cambiar
                                        </button>
                                    </div>
                                    {savedNicknames.has(uIndex) ? (
                                        <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold px-1">
                                            <span className="material-symbols-outlined text-[14px]">check</span>
                                            Apodo "{item.ocrName}" guardado
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => handleSaveNickname(uIndex, assignedProduct, item.ocrName)}
                                            disabled={savingNickname === uIndex}
                                            className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-1.5 hover:bg-amber-100 transition-colors disabled:opacity-50"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">sell</span>
                                            {savingNickname === uIndex ? 'Guardando...' : `Guardar "${item.ocrName}" como apodo`}
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Buscar producto del catálogo..."
                                        value={searchQueries[uIndex] || ''}
                                        onChange={e => setSearchQueries(prev => ({ ...prev, [uIndex]: e.target.value }))}
                                        className="w-full h-9 pl-9 pr-3 rounded-lg bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-sm placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                                    />
                                    <span className="material-symbols-outlined text-[18px] text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2">search</span>

                                    {searchQueries[uIndex]?.trim() && (
                                        <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-10 overflow-hidden max-h-40 overflow-y-auto">
                                            {filteredProducts(searchQueries[uIndex]).map(product => (
                                                <button
                                                    key={product.id}
                                                    type="button"
                                                    onClick={() => handleAssign(uIndex, product)}
                                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors"
                                                >
                                                    {product.image_url && (
                                                        <img src={product.image_url} alt="" className="size-7 rounded object-cover" crossOrigin="anonymous" />
                                                    )}
                                                    <span className="font-semibold truncate">{product.name}</span>
                                                </button>
                                            ))}
                                            {filteredProducts(searchQueries[uIndex]).length === 0 && (
                                                <p className="px-3 py-2 text-sm text-gray-400">Sin resultados</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                {localMatched.length === 0 && unmatched.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <span className="material-symbols-outlined text-4xl text-gray-300">receipt_long</span>
                        <p className="text-sm text-gray-400 font-bold">No se detectaron productos</p>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="shrink-0 px-6 pb-6 pt-4 border-t border-gray-100 dark:border-gray-800 bg-surface-light dark:bg-surface-dark">
                {showUnassignedWarning && (
                    <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 px-3 py-2.5">
                        <span className="material-symbols-outlined text-amber-500 text-[18px] mt-0.5 shrink-0">warning</span>
                        <p className="text-xs text-amber-700 dark:text-amber-300">
                            {unmatched.filter((_, i) => !assignments[i]).length} producto(s) sin asignar se descartarán.
                            Toca <strong>Confirmar</strong> de nuevo para continuar de todas formas.
                        </p>
                    </div>
                )}
                <button
                    type="button"
                    onClick={handleConfirm}
                    disabled={totalConfirmable === 0}
                    className="group relative w-full h-14 overflow-hidden rounded-2xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 disabled:cursor-not-allowed"
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-600/0 via-emerald-600/20 to-emerald-600/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out dark:from-emerald-400/0 dark:via-emerald-400/10 dark:to-emerald-400/0" />

                    <div className="relative h-full px-5 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-[20px] group-hover:scale-110 transition-transform duration-300">check_circle</span>
                            <span className="font-black text-xs uppercase tracking-[0.15em]">Confirmar</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-[13px] font-bold bg-white/10 dark:bg-black/5 px-2.5 py-1 rounded-lg border border-white/10 dark:border-black/5 shadow-inner transition-all group-hover:bg-white/20 dark:group-hover:bg-black/10">
                                ${formatCurrency(totalConfirmableValue)}
                            </span>
                            <span className="material-symbols-outlined text-[18px] translate-x-0 group-hover:translate-x-1.5 transition-transform duration-300">arrow_forward</span>
                        </div>
                    </div>
                </button>
            </div>
        </div>
    );
};
