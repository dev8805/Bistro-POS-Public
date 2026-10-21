import React, { useState, useRef, useEffect } from 'react';
import { formatCurrency } from '../lib/formatters';

interface ScanProduct {
    id: string;
    name: string;
    unit?: string;
    stock?: number | null;
    cost?: number;
    price?: number;
    image_url?: string | null;
}

interface BarcodeInputModalProps {
    product: ScanProduct;
    previousCost?: number;
    initialQuantity?: string | number;
    initialCost?: string | number;
    initialPrice?: number;
    onConfirm: (quantity: number, unitCost: number, newSalePrice?: number) => void;
    onClose: () => void;
}

export const BarcodeInputModal: React.FC<BarcodeInputModalProps> = ({
    product,
    previousCost,
    initialQuantity = '1',
    initialCost,
    initialPrice,
    onConfirm,
    onClose
}) => {
    const effectivePrevCost = (previousCost !== undefined && previousCost > 0) ? previousCost : (product.cost || 0);
    const effectiveInitialCost = initialCost !== undefined && initialCost !== ''
        ? String(initialCost)
        : (effectivePrevCost > 0 ? String(effectivePrevCost) : '');

    const [quantity, setQuantity] = useState(String(initialQuantity || '1'));
    const [unitCost, setUnitCost] = useState(effectiveInitialCost);

    const currentSalePrice = product.price || 0;
    const [newSalePrice, setNewSalePrice] = useState(
        initialPrice !== undefined && initialPrice > 0 ? String(initialPrice) : (currentSalePrice > 0 ? String(currentSalePrice) : '')
    );

    const quantityRef = useRef<HTMLInputElement>(null);
    const costRef = useRef<HTMLInputElement>(null);

    const enteredCostNum = parseFloat(unitCost) || 0;
    const prevCostNum = effectivePrevCost;
    const hasCostDiff = enteredCostNum > 0 && prevCostNum > 0 && Math.round(enteredCostNum) !== Math.round(prevCostNum);
    const isCostEqual = enteredCostNum > 0 && prevCostNum > 0 && Math.round(enteredCostNum) === Math.round(prevCostNum);
    const costDiff = enteredCostNum - prevCostNum;
    const costDiffPct = prevCostNum > 0 ? (costDiff / prevCostNum) * 100 : 0;
    const isCostUp = costDiff > 0;

    const enteredSalePriceNum = parseFloat(newSalePrice) || 0;
    const hasPriceChanged = enteredSalePriceNum > 0 && enteredSalePriceNum !== currentSalePrice;

    // Margen actual con el nuevo costo: (precioActual - nuevoCosto) / precioActual * 100
    const currentMargin = currentSalePrice > 0 && enteredCostNum > 0
        ? ((currentSalePrice - enteredCostNum) / currentSalePrice) * 100
        : null;

    // Margen proyectado con el nuevo precio: (nuevoPrecio - nuevoCosto) / nuevoPrecio * 100
    const projectedMargin = enteredSalePriceNum > 0 && enteredCostNum > 0
        ? ((enteredSalePriceNum - enteredCostNum) / enteredSalePriceNum) * 100
        : null;

    useEffect(() => {
        quantityRef.current?.focus();
        quantityRef.current?.select();
    }, []);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    const handleConfirm = () => {
        const qty = parseFloat(quantity) || 0;
        const cost = parseFloat(unitCost) || 0;
        if (qty <= 0 || cost <= 0) return;
        const priceNum = parseFloat(newSalePrice) || undefined;
        onConfirm(qty, cost, priceNum);
    };

    const isValid = (parseFloat(quantity) || 0) > 0 && (parseFloat(unitCost) || 0) > 0;

    return (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]" role="button" tabIndex={-1} onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()} aria-label="Cerrar" />
            <div className="relative bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md p-5 pb-6 max-h-[92vh] overflow-y-auto animate-[slideUp_0.25s_ease-out] sm:animate-[fadeIn_0.15s_ease-out]">
                {/* Drag handle móvil */}
                <div className="flex justify-center pb-2.5 sm:hidden" aria-hidden="true">
                    <div className="w-12 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                </div>

                {/* Cabecera del producto */}
                <div className="flex items-center gap-3 mb-4 pb-3 border-b border-gray-100 dark:border-gray-800">
                    <div className="size-12 rounded-xl bg-gray-100 dark:bg-gray-800 overflow-hidden shrink-0 border border-gray-200/70 dark:border-gray-700 flex items-center justify-center">
                        {product.image_url ? (
                            <img src={product.image_url} alt="" className="size-full object-cover" crossOrigin="anonymous" />
                        ) : (
                            <span className="material-symbols-outlined text-gray-400 text-2xl">inventory_2</span>
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-gray-900 dark:text-white leading-tight truncate">{product.name}</p>
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-400">
                            <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-bold text-gray-600 dark:text-gray-300 text-[10px]">
                                {product.unit || 'Und'}
                            </span>
                            <span>·</span>
                            <span>Stock actual: <strong className="text-gray-700 dark:text-gray-200">{product.stock ?? 0}</strong></span>
                        </div>
                    </div>
                </div>

                {/* Inputs principales: Cantidad y Costo de Compra */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5 truncate">
                            Cantidad ({product.unit || 'Und'}) *
                        </label>
                        <input
                            ref={quantityRef}
                            type="number"
                            value={quantity}
                            onChange={e => setQuantity(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === 'Tab') {
                                    e.preventDefault();
                                    costRef.current?.focus();
                                    costRef.current?.select();
                                }
                            }}
                            onWheel={e => (e.target as HTMLInputElement).blur()}
                            className="w-full h-11 px-3 text-center text-lg font-black bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-gray-900 dark:text-white"
                            placeholder="0"
                            min="0.01"
                            step="any"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider mb-1.5 truncate">
                            Costo x {product.unit || 'Und'} *
                        </label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
                            <input
                                ref={costRef}
                                type="number"
                                inputMode="numeric"
                                value={unitCost}
                                onChange={e => setUnitCost(e.target.value)}
                                onWheel={e => (e.target as HTMLInputElement).blur()}
                                className="w-full h-11 pl-7 pr-3 text-lg font-black bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-gray-900 dark:text-white"
                                placeholder="0"
                                min="0.01"
                                step="any"
                            />
                        </div>
                    </div>
                </div>

                {/* Comparación de variación de costo */}
                {hasCostDiff && (
                    <div
                        className={`mb-3 flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-semibold animate-[fadeIn_0.15s_ease-out] border ${
                            isCostUp
                                ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200/80 dark:border-rose-800/40 text-rose-700 dark:text-rose-300'
                                : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-300'
                        }`}
                    >
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className="material-symbols-outlined text-[16px] shrink-0" aria-hidden="true">
                                {isCostUp ? 'trending_up' : 'trending_down'}
                            </span>
                            <span className="truncate text-[11px] font-bold">
                                {isCostUp
                                    ? `Costo subió +$${formatCurrency(Math.round(Math.abs(costDiff)))} (+${Math.abs(costDiffPct).toFixed(1)}%)`
                                    : `Costo bajó -$${formatCurrency(Math.round(Math.abs(costDiff)))} (-${Math.abs(costDiffPct).toFixed(1)}%)`}
                            </span>
                        </div>
                        <span className="text-[10px] opacity-80 shrink-0 whitespace-nowrap">
                            Ant: ${formatCurrency(Math.round(prevCostNum))}
                        </span>
                    </div>
                )}

                {isCostEqual && (
                    <div className="mb-3 flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-semibold animate-[fadeIn_0.15s_ease-out] border bg-slate-50 dark:bg-slate-900/40 border-slate-200/80 dark:border-slate-800/60 text-slate-600 dark:text-slate-300">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className="material-symbols-outlined text-[16px] shrink-0 text-slate-400" aria-hidden="true">
                                trending_flat
                            </span>
                            <span className="truncate text-[11px] font-bold">
                                Estable
                            </span>
                        </div>
                        <span className="text-[10px] opacity-80 shrink-0 whitespace-nowrap text-slate-400">
                            Ant: ${formatCurrency(Math.round(prevCostNum))}
                        </span>
                    </div>
                )}

                {/* Sección simétrica: Actualizar Precio de Venta */}
                <div className="mb-4 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Precio de Venta (Público)
                        </span>
                        {currentSalePrice > 0 && currentMargin !== null && (
                            <span className="text-[10px] font-semibold text-gray-400">
                                Margen actual: <strong className={currentMargin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{currentMargin.toFixed(1)}%</strong>
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                                Precio actual
                            </label>
                            <div className="h-10 px-3 bg-gray-100/70 dark:bg-gray-800/50 border border-gray-200/60 dark:border-gray-700/60 rounded-xl flex items-center text-sm font-bold text-gray-700 dark:text-gray-300">
                                ${formatCurrency(currentSalePrice)}
                            </div>
                        </div>
                        <div>
                            <label className="block text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                                Nuevo precio
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs pointer-events-none">$</span>
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    value={newSalePrice}
                                    onChange={e => setNewSalePrice(e.target.value)}
                                    onWheel={e => (e.target as HTMLInputElement).blur()}
                                    className="w-full h-10 pl-7 pr-3 text-sm font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-gray-900 dark:text-white"
                                    placeholder={String(currentSalePrice || 0)}
                                    min="0"
                                    step="any"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Feedback del nuevo margen o aviso de actualización */}
                    {hasPriceChanged && (
                        <div className="mt-2 flex items-center justify-between px-2.5 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200/60 dark:border-blue-800/40 rounded-xl text-[11px] animate-[fadeIn_0.15s_ease-out]">
                            <span className="font-semibold text-blue-800 dark:text-blue-300">
                                {projectedMargin !== null
                                    ? `Nuevo margen proyectado: ${projectedMargin.toFixed(1)}%`
                                    : 'Precio actualizado'}
                            </span>
                            <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
                                Se actualizará en catálogo
                            </span>
                        </div>
                    )}
                </div>

                {/* Botones de acción */}
                <div className="flex gap-2.5">
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex-1 h-11 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl text-sm hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={!isValid}
                        className="flex-1 h-11 bg-primary text-[#102218] font-black rounded-xl text-sm disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97] transition-all shadow-md shadow-primary/20"
                    >
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    );
};

