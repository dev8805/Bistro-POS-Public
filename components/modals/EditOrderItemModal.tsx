import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useProducts, Product } from '../../hooks/useProducts';

interface EditOrderItemModalProps {
    isOpen: boolean;
    item: {
        id: string;
        productName: string;
        quantity: number;
        unitPrice: number;
    };
    onConfirm: (updates: { newProductId?: string; newQuantity?: number }) => Promise<void>;
    onClose: () => void;
}

export const EditOrderItemModal: React.FC<EditOrderItemModalProps> = ({
    isOpen,
    item,
    onConfirm,
    onClose
}) => {
    const { products } = useProducts();
    const [search, setSearch] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [quantity, setQuantity] = useState(item.quantity);
    const [saving, setSaving] = useState(false);
    const [closing, setClosing] = useState(false);

    // Swipe-to-dismiss
    const [translateY, setTranslateY] = useState(0);
    const isDragging = useRef(false);
    const dragStartY = useRef(0);
    const handleRef = useRef<HTMLDivElement>(null);

    const filteredProducts = useMemo(() => {
        if (!search.trim()) return [];
        const q = search.toLowerCase();
        return products
            .filter(p => p.is_active && p.name.toLowerCase().includes(q))
            .slice(0, 8);
    }, [products, search]);

    const hasChanges = selectedProduct !== null || quantity !== item.quantity;

    const handleConfirm = async () => {
        if (!hasChanges || saving) return;
        setSaving(true);
        try {
            await onConfirm({
                newProductId: selectedProduct?.id,
                newQuantity: quantity !== item.quantity ? quantity : undefined
            });
        } finally {
            setSaving(false);
        }
    };

    const handleQuantityChange = (delta: number) => {
        setQuantity(q => Math.max(0.01, parseFloat((q + delta).toFixed(2))));
    };

    const animateClose = useCallback(() => {
        setClosing(true);
        setTimeout(onClose, 250);
    }, [onClose]);

    // Touch handlers on the drag handle only
    const onHandleTouchStart = useCallback((e: React.TouchEvent) => {
        e.preventDefault(); // Prevents pull-to-refresh
        isDragging.current = true;
        dragStartY.current = e.touches[0].clientY;
        setTranslateY(0);
    }, []);

    const onHandleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isDragging.current) return;
        e.preventDefault();
        const deltaY = e.touches[0].clientY - dragStartY.current;
        if (deltaY > 0) {
            setTranslateY(deltaY);
        }
    }, []);

    const onHandleTouchEnd = useCallback(() => {
        if (!isDragging.current) return;
        isDragging.current = false;
        if (translateY > 80) {
            animateClose();
        } else {
            setTranslateY(0);
        }
    }, [translateY, animateClose]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = ''; };
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
            {/* Backdrop */}
            <div
                className={`fixed inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-250 ${closing ? 'opacity-0' : 'opacity-100'}`}
                role="button"
                tabIndex={-1}
                onClick={animateClose}
                onKeyDown={(e) => e.key === 'Escape' && animateClose()}
                aria-label="Cerrar"
            />

            {/* Sheet */}
            <div
                className={`
                    relative bg-white dark:bg-[#1a2236] w-full sm:max-w-md z-10
                    rounded-t-[20px] sm:rounded-2xl shadow-[0_-4px_32px_rgba(0,0,0,0.12)]
                    transition-transform duration-250 ease-out
                    ${closing ? 'translate-y-full sm:translate-y-0 sm:scale-95 sm:opacity-0' : 'translate-y-0'}
                `}
                style={{
                    transform: translateY > 0 ? `translateY(${translateY}px)` : undefined,
                    transition: isDragging.current ? 'none' : undefined,
                    maxHeight: '85vh',
                }}
            >
                {/* Drag handle area */}
                <div
                    ref={handleRef}
                    className="sm:hidden flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none"
                    onTouchStart={onHandleTouchStart}
                    onTouchMove={onHandleTouchMove}
                    onTouchEnd={onHandleTouchEnd}
                >
                    <div className="w-9 h-[5px] rounded-full bg-slate-300 dark:bg-slate-600" />
                </div>

                {/* Content */}
                <div className="px-5 pt-2 sm:pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:pb-5 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 32px)' }}>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Editar ítem</h3>
                        <button
                            onClick={animateClose}
                            className="size-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                            aria-label="Cerrar"
                        >
                            <span className="material-symbols-outlined text-lg">close</span>
                        </button>
                    </div>

                    {/* Producto actual */}
                    <div className="mb-5 p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-white/5 dark:to-white/[0.02] rounded-2xl border border-slate-100 dark:border-slate-700/50">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Producto actual</p>
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{item.productName}</p>
                        <p className="text-xs text-slate-500 mt-0.5">${item.unitPrice.toLocaleString('es-CO')} / unidad</p>
                    </div>

                    {/* Buscador de nuevo producto */}
                    <div className="mb-5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
                            Cambiar por
                        </label>
                        {selectedProduct ? (
                            <div className="flex items-center gap-2.5 p-3.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-2xl">
                                <span className="material-symbols-outlined text-amber-500 text-lg">swap_horiz</span>
                                <div className="flex-1 min-w-0">
                                    <span className="text-sm font-bold text-amber-800 dark:text-amber-200 block truncate">
                                        {selectedProduct.name}
                                    </span>
                                    <span className="text-xs text-amber-600 dark:text-amber-400">
                                        ${selectedProduct.price.toLocaleString('es-CO')}
                                    </span>
                                </div>
                                <button
                                    onClick={() => { setSelectedProduct(null); setSearch(''); }}
                                    className="size-7 flex items-center justify-center rounded-full bg-amber-200/50 dark:bg-amber-800/30 text-amber-600 dark:text-amber-400 hover:bg-amber-200 transition-colors"
                                    aria-label="Quitar selección"
                                >
                                    <span className="material-symbols-outlined text-base">close</span>
                                </button>
                            </div>
                        ) : (
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Buscar producto..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="w-full pl-10 pr-3 py-3 rounded-2xl bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/10 text-sm font-medium outline-none transition-all"
                                    autoComplete="off"
                                />
                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-[18px] text-slate-400">search</span>
                            </div>
                        )}
                        {!selectedProduct && filteredProducts.length > 0 && (
                            <div className="mt-2 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-lg max-h-36 overflow-y-auto">
                                {filteredProducts.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => { setSelectedProduct(p); setSearch(''); }}
                                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/5 text-left border-b border-slate-100 dark:border-slate-800 last:border-0 transition-colors"
                                    >
                                        <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate pr-2">{p.name}</span>
                                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">${p.price.toLocaleString('es-CO')}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Cantidad */}
                    <div className="mb-6">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
                            Cantidad
                        </label>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => handleQuantityChange(-1)}
                                className="size-11 flex items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 active:scale-95 transition-all"
                                aria-label="Disminuir cantidad"
                            >
                                <span className="material-symbols-outlined text-xl">remove</span>
                            </button>
                            <input
                                type="number"
                                value={quantity}
                                min="0.01"
                                step="1"
                                onChange={e => {
                                    const val = parseFloat(e.target.value);
                                    if (!isNaN(val) && val > 0) setQuantity(val);
                                }}
                                className="flex-1 text-center px-3 py-3 rounded-2xl bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/10 text-lg font-bold outline-none transition-all"
                            />
                            <button
                                onClick={() => handleQuantityChange(1)}
                                className="size-11 flex items-center justify-center rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 active:scale-95 transition-all"
                                aria-label="Aumentar cantidad"
                            >
                                <span className="material-symbols-outlined text-xl">add</span>
                            </button>
                        </div>
                    </div>

                    {/* Acciones */}
                    <div className="flex gap-3">
                        <button
                            onClick={animateClose}
                            className="flex-1 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 active:scale-[0.98] transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={!hasChanges || saving}
                            className="flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-sm font-bold text-white transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 disabled:shadow-none"
                        >
                            {saving && (
                                <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                            )}
                            Guardar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
