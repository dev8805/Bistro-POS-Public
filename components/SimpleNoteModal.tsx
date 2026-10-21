import React, { useState } from 'react';
import { Product } from '../types';
import { formatCurrency } from '../lib/formatters';

interface SimpleNoteModalProps {
    product: Product;
    onClose: () => void;
    onAddToOrder: (product: Product, quantity: number, notes: string) => void;
}

export const SimpleNoteModal: React.FC<SimpleNoteModalProps> = ({ product, onClose, onAddToOrder }) => {
    const [quantity, setQuantity] = useState(1);
    const [notes, setNotes] = useState('');

    const handleAdd = () => {
        onAddToOrder(product, quantity, notes);
        onClose();
    };

    const total = product.price * quantity;

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" role="button" tabIndex={-1} onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()} aria-label="Cerrar"></div>

            <div className="relative w-full max-w-sm bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl overflow-hidden flex flex-col">

                {/* Header */}
                <div className="flex gap-3 p-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-surface-dark items-center">
                    <div
                        className="size-14 shrink-0 rounded-xl bg-cover bg-center border border-gray-100 dark:border-gray-700"
                        style={{ backgroundImage: `url('${product.image || (product as any).image_url}')` }}
                    ></div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-base font-semibold text-text-main dark:text-white leading-tight">{product.name}</h2>
                        <span className="text-primary font-bold text-sm">${formatCurrency(product.price)}</span>
                    </div>
                    <button
                        onClick={onClose}
                        className="size-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-text-secondary hover:bg-gray-200 dark:hover:bg-gray-700"
                    >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>

                {/* Notes */}
                <div className="p-4 bg-surface-light dark:bg-surface-dark">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="material-symbols-outlined text-primary text-[18px]">edit_note</span>
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">OBSERVACIÓN / INDICACIÓN</h3>
                    </div>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Ej: Sin sal, bien caliente, para llevar..."
                        className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm text-text-main dark:text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none resize-none h-20 transition-all"
                        autoFocus
                    ></textarea>
                </div>

                {/* Footer */}
                <div className="p-4 bg-white dark:bg-surface-dark border-t border-gray-100 dark:border-gray-800">
                    <button
                        onClick={handleAdd}
                        className="w-full h-12 rounded-xl bg-primary hover:bg-primary-hover text-[#102218] font-bold text-base shadow-lg shadow-primary/20 transition-all flex items-center justify-between px-4"
                    >
                        <span className="flex items-center gap-2">
                            {quantity > 1 && (
                                <span className="bg-[#102218]/10 px-2 py-0.5 rounded-lg text-sm font-extrabold">
                                    {quantity}
                                </span>
                            )}
                            Agregar a la Orden
                        </span>
                        <span className="bg-[#102218]/10 px-2.5 py-0.5 rounded-lg text-sm font-extrabold">
                            ${formatCurrency(total)}
                        </span>
                    </button>
                </div>

            </div>
        </div>
    );
};
