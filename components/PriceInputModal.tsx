import React, { useState, useEffect, useRef } from 'react';
import { Product } from '../types';
import { formatCurrency } from '../lib/formatters';

interface PriceInputModalProps {
    product: Product;
    unitLabel: string;
    onConfirm: (quantity: number, adjustedPrice: number) => void;
    onClose: () => void;
}

export const PriceInputModal: React.FC<PriceInputModalProps> = ({
    product,
    unitLabel,
    onConfirm,
    onClose,
}) => {
    const [qtyStr, setQtyStr] = useState('');

    const getUnitIcon = (unit?: string): string => {
        const u = unit?.toLowerCase() || '';
        if (['kilogramos', 'libras', 'gramos', 'onzas', 'arrobas', 'toneladas'].some(w => u.includes(w))) return 'scale';
        if (['litros', 'mililitros', 'galones'].some(w => u.includes(w))) return 'water_drop';
        if (['metros', 'centímetros', 'pulgadas'].some(w => u.includes(w))) return 'straighten';
        return 'scale';
    };
    const unitIcon = getUnitIcon(product.unit);
    const inputRef = useRef<HTMLInputElement>(null);
    const [isMobile, setIsMobile] = useState(false);

    const [translateY, setTranslateY] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const startY = useRef(0);
    const currentY = useRef(0);

    const isClosingRef = useRef(false);

    useEffect(() => {
        const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const currentIsMobile = isTouch || window.innerWidth < 768;
        setIsMobile(currentIsMobile);

        if (!currentIsMobile) {
            setTimeout(() => inputRef.current?.focus(), 100);
        } else {
            // Cerrar el teclado virtual forzosamente en múltiples frames
            const blurAll = () => {
                if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                }
                // Crear un input auxiliar off-screen, usarlo para robar el foco y borrarlo
                const dummy = document.createElement('input');
                dummy.setAttribute('type', 'text');
                dummy.setAttribute('readonly', 'true');
                dummy.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;';
                document.body.appendChild(dummy);
                dummy.focus();
                dummy.blur();
                document.body.removeChild(dummy);
            };
            blurAll();
            setTimeout(blurAll, 50);
            setTimeout(blurAll, 150);
        }
    }, []);

    const handleTouchStart = (e: React.TouchEvent) => {
        startY.current = e.touches[0].clientY;
        currentY.current = e.touches[0].clientY;
        setIsDragging(true);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging) return;
        currentY.current = e.touches[0].clientY;
        const deltaY = currentY.current - startY.current;
        if (deltaY > 0) {
            setTranslateY(deltaY);
        }
    };

    const handleTouchEnd = () => {
        setIsDragging(false);
        if (translateY > 100) {
            onClose();
        } else {
            setTranslateY(0);
        }
    };

    const parseQty = (val: string): number => {
        if (!val) return 0;
        const cleaned = val.replace(/,/g, '.');
        return parseFloat(cleaned) || 0;
    };

    const exactQty = parseQty(qtyStr);
    const calculatedPrice = Math.round(exactQty * product.price);

    const handleConfirm = () => {
        if (exactQty <= 0) return;
        if (isClosingRef.current) return;
        isClosingRef.current = true;
        const adjustedPrice = calculatedPrice / exactQty;
        onConfirm(exactQty, adjustedPrice);
        onClose();
    };

    const handleNumpadPress = (key: string) => {
        if (key === 'C') {
            setQtyStr('');
        } else if (key === 'backspace') {
            setQtyStr(prev => prev.slice(0, -1));
        } else if (key === 'check' || key === '=') {
            handleConfirm();
        } else if (key === '.' || key === ',') {
            setQtyStr(prev => {
                if (prev.includes(',')) return prev;
                return prev === '' ? '0,' : prev + ',';
            });
        } else if (/^\d$/.test(key)) {
            setQtyStr(prev => prev + key);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isClosingRef.current) return; // guard: modal en proceso de cierre
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if (document.activeElement === inputRef.current && !isMobile) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                handleConfirm();
            } else if (e.key === 'Backspace') {
                e.preventDefault();
                handleNumpadPress('backspace');
            } else if (e.key === 'Delete' || e.key.toLowerCase() === 'c') {
                e.preventDefault();
                handleNumpadPress('C');
            } else if (/^\d$/.test(e.key)) {
                e.preventDefault();
                handleNumpadPress(e.key);
            } else if (e.key === '.' || e.key === ',') {
                e.preventDefault();
                handleNumpadPress(',');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    });

    const numpadButtons = [
        { label: '1', value: '1' },
        { label: '2', value: '2' },
        { label: '3', value: '3' },
        { label: 'backspace', value: 'backspace', icon: 'backspace' },
        { label: '4', value: '4' },
        { label: '5', value: '5' },
        { label: '6', value: '6' },
        { label: 'C', value: 'C' },
        { label: '7', value: '7' },
        { label: '8', value: '8' },
        { label: '9', value: '9' },
        { label: 'check', value: 'check', icon: 'add_shopping_cart', isSubmit: true },
        { label: '', value: '', isEmpty: true },
        { label: '0', value: '0' },
        { label: ',', value: ',' },
        { label: '', value: '', isEmpty: true },
    ];

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm md:p-4 animate-[fadeIn_0.15s_ease-out]"
            onClick={onClose}
        >
            <div
                className={`bg-white dark:bg-surface-dark rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-[340px] overflow-hidden animate-[slideUp_0.2s_ease-out] ${isDragging ? '' : 'transition-transform duration-300 ease-out'}`}
                style={{ transform: `translateY(${translateY}px)` }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Handle móvil - zona de arrastre */}
                <div
                    className="md:hidden w-full flex justify-center py-3 cursor-grab active:cursor-grabbing touch-none"
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                >
                    <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
                </div>

                {/* Header */}
                <div className="px-5 pt-3 md:pt-5 pb-3 flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-xl">{unitIcon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm text-text-main dark:text-white truncate">{product.name}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            ${formatCurrency(product.price)} / {unitLabel}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="size-8 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>

                {/* Input + Preview */}
                <div className="px-5 pb-4">
                    <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5 block">
                        Cantidad en {product.unit || unitLabel}
                    </label>
                    <div className="relative">
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-600 dark:text-emerald-400 font-bold text-sm">{unitLabel}</span>
                        <input
                            ref={inputRef}
                            type="text"
                            inputMode={isMobile ? 'none' : 'decimal'}
                            readOnly={isMobile}
                            value={qtyStr}
                            onChange={(e) => {
                                if (isMobile) return;
                                const val = e.target.value.replace(/[^0-9.,]/g, '').replace(/\./g, ',');
                                const parts = val.split(',');
                                if (parts.length > 2) return;
                                setQtyStr(val);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleConfirm();
                                if (e.key === 'Escape') onClose();
                            }}
                            placeholder="0"
                            className="w-full h-14 pl-4 pr-12 text-2xl font-bold text-text-main dark:text-white bg-gray-50 dark:bg-gray-800/50 border-2 border-gray-200 dark:border-gray-700 rounded-xl focus:border-emerald-500 focus:ring-0 outline-none transition-colors placeholder:text-gray-300 caret-transparent md:caret-emerald-600"
                        />
                    </div>

                    {/* Price Preview */}
                    <div className={`mt-3 flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-200 ${calculatedPrice > 0
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30'
                        : 'bg-gray-50 dark:bg-gray-800/30 border border-gray-100 dark:border-gray-700'
                        }`}>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Total</span>
                        <span className={`text-sm font-bold ${calculatedPrice > 0
                            ? 'text-emerald-700 dark:text-emerald-300'
                            : 'text-gray-400'
                            }`}>
                            ${formatCurrency(calculatedPrice)}
                        </span>
                    </div>
                </div>

                {/* Desktop: botones Cancelar/Agregar */}
                {!isMobile && (
                    <div className="px-5 pb-5 grid grid-cols-2 gap-3">
                        <button
                            onClick={onClose}
                            className="h-11 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors active:scale-[0.98]"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={exactQty <= 0}
                            className="h-11 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                        >
                            <span className="material-symbols-outlined text-lg">add_shopping_cart</span>
                            Agregar
                        </button>
                    </div>
                )}

                {/* Móvil/Tablet: Numpad embebido */}
                {isMobile && (
                    <div className="px-4 pb-6 pt-2">
                        <div className="grid grid-cols-4 gap-2.5 max-w-sm mx-auto">
                            {numpadButtons.map((btn, idx) => {
                                if (btn.isEmpty) return <div key={`empty-${idx}`} />;

                                const isNumber = /^\d+$/.test(btn.value);
                                const isClear = btn.value === 'C';
                                const isBackspace = btn.value === 'backspace';
                                const isSubmit = (btn as any).isSubmit;

                                return (
                                    <button
                                        key={`btn-${idx}`}
                                        onClick={() => handleNumpadPress(btn.value)}
                                        className={`h-14 rounded-2xl flex items-center justify-center text-lg font-bold transition-all duration-100 active:scale-95 touch-manipulation select-none
                                        ${isNumber ? 'bg-gray-50 dark:bg-zinc-800/50 text-gray-900 dark:text-white' : ''}
                                        ${isClear ? 'bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 text-base' : ''}
                                        ${isBackspace ? 'bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white' : ''}
                                        ${isSubmit ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 row-span-1' : ''}
                                        `}
                                    >
                                        {btn.icon ? (
                                            <span className="material-symbols-outlined text-[22px]">{btn.icon}</span>
                                        ) : (
                                            btn.label
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
