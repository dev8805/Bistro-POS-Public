import React, { useState, useEffect, useRef } from 'react';
import { formatCurrency } from '../lib/formatters';

interface DiscountModalProps {
    onClose: () => void;
    onApply: (value: number, type: 'percent' | 'amount') => void;
    itemName: string;
    itemPrice: number;
    initialDiscount?: number;
    initialDiscountPercent?: number;
}

export const DiscountModal: React.FC<DiscountModalProps> = ({
    onClose,
    onApply,
    itemName,
    itemPrice,
    initialDiscount,
    initialDiscountPercent
}) => {
    const [mode, setMode] = useState<'percent' | 'amount'>(initialDiscountPercent ? 'percent' : 'amount');
    const [value, setValue] = useState<string>(
        initialDiscountPercent
            ? initialDiscountPercent.toString()
            : initialDiscount
                ? initialDiscount.toString()
                : ''
    );
    const inputRef = useRef<HTMLInputElement>(null);

    const handleApply = () => {
        const numValue = parseFloat(value);
        if (isNaN(numValue) || numValue < 0) return;

        onApply(numValue, mode);
        onClose();
    };

    const calculatedDiscount = mode === 'percent'
        ? (itemPrice * (parseFloat(value) || 0)) / 100
        : (parseFloat(value) || 0);

    const finalPrice = Math.max(0, itemPrice - calculatedDiscount);

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" role="button" tabIndex={-1} onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()} aria-label="Cerrar"></div>
            <div className="relative w-full max-w-sm bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl overflow-hidden flex flex-col">

                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-surface-dark flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-text-main dark:text-white flex items-center gap-2">
                        Descuento
                    </h2>
                    <button onClick={onClose} className="size-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-text-secondary transition-colors">
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    <div className="text-center mb-2">
                        <p className="text-sm text-text-secondary mb-1">Aplicar descuento a:</p>
                        <p className="font-bold text-text-main dark:text-white text-lg leading-tight">{itemName}</p>
                        <p className="text-sm font-bold text-gray-500 dark:text-gray-400 mt-1">${formatCurrency(itemPrice)}</p>
                    </div>

                    {/* Mode Switcher */}
                    <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                        <button
                            onClick={() => { setMode('percent'); setValue(''); inputRef.current?.focus(); }}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'percent' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-text-secondary hover:text-text-main'}`}
                        >
                            Porcentaje (%)
                        </button>
                        <button
                            onClick={() => { setMode('amount'); setValue(''); inputRef.current?.focus(); }}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${mode === 'amount' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-text-secondary hover:text-text-main'}`}
                        >
                            Monto Fijo ($)
                        </button>
                    </div>

                    {/* Input */}
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">
                            {mode === 'percent' ? '%' : '$'}
                        </span>
                        <input
                            ref={inputRef}
                            type="number"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            placeholder={mode === 'percent' ? "0 - 100" : "0"}
                            className="w-full pl-10 pr-4 h-14 bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-xl text-xl font-bold text-text-main dark:text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all placeholder:text-gray-300"
                            autoFocus
                        />
                    </div>

                    {/* Summary */}
                    <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/20 rounded-xl p-3 flex justify-between items-center">
                        <span className="text-xs font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wide">Nuevo Precio</span>
                        <span className="text-xl font-black text-orange-600 dark:text-orange-400">
                            ${formatCurrency(finalPrice)}
                        </span>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-surface-dark flex flex-col gap-3">
                    <button
                        onClick={handleApply}
                        className="w-full bg-primary hover:bg-primary-hover text-[#102218] font-bold py-3.5 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 text-base active:scale-[0.98]"
                    >
                        <span className="material-symbols-outlined">check</span>
                        Aplicar Descuento
                    </button>
                    {(initialDiscount || initialDiscountPercent) ? (
                        <button
                            onClick={() => { onApply(0, mode); onClose(); }}
                            className="w-full bg-red-50 hover:bg-red-100 dark:bg-red-900/10 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 text-base active:scale-[0.98] border border-red-100 dark:border-red-900/30"
                        >
                            <span className="material-symbols-outlined">delete</span>
                            Eliminar Descuento
                        </button>
                    ) : null}
                </div>

            </div>
        </div>
    );
};
