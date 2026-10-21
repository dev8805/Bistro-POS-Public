
import React, { useState } from 'react';
import { Product } from '../types';
import { formatCurrency } from '../lib/formatters';
import { flattenOptions } from '../lib/optionFolders';

interface ProductModalProps {
    product: Product;
    onClose: () => void;
    onAddToOrder: (product: Product, quantity: number, removedIngredients: string[], cookingTerm: string, notes: string) => void;
    onAddAnimation?: (rect: DOMRect, image: string) => void;
}

export const ProductModal: React.FC<ProductModalProps> = ({ product, onClose, onAddToOrder, onAddAnimation }) => {
    const [quantity, setQuantity] = useState(1);
    const [removedIngredients, setRemovedIngredients] = useState<string[]>([]);

    // Modal legacy de selección única: aplanamos carpetas a una lista plana para no crashear.
    const options = flattenOptions(product.customizableOptions);
    const [selectedOption, setSelectedOption] = useState<string>(options.length > 0 ? options[1] || options[0] : '');
    const [notes, setNotes] = useState('');

    const toggleIngredient = (ingredient: string) => {
        setRemovedIngredients(prev =>
            prev.includes(ingredient)
                ? prev.filter(i => i !== ingredient)
                : [...prev, ingredient]
        );
    };

    const handleAdd = (e: React.MouseEvent<HTMLButtonElement>) => {
        // Animation removed per user request
        onAddToOrder(product, quantity, removedIngredients, selectedOption, notes);
    };

    const total = product.price * quantity;
    const ingredients = product.ingredients || [];

    // Only show customization sections if enabled in configuration
    const showCustomization = product.hasCustomization ?? false;

    const hasOptions = showCustomization && options.length > 0;
    const hasIngredients = showCustomization && ingredients.length > 0;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 animate-[fadeIn_0.2s_ease-out]">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" role="button" tabIndex={-1} onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()} aria-label="Cerrar"></div>

            {/* Modal Container: Single column, smaller max-width */}
            <div className="relative w-full h-full md:h-auto md:max-h-[85vh] md:max-w-2xl bg-surface-light dark:bg-surface-dark md:rounded-[2rem] shadow-2xl overflow-hidden flex flex-col">

                {/* Compact Header */}
                <div className="flex gap-4 p-5 md:p-6 border-b border-gray-100 dark:border-gray-800 relative bg-white dark:bg-surface-dark shrink-0 items-start">
                    {/* Close Button */}
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 z-20 size-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-text-main dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-90"
                    >
                        <span className="material-symbols-outlined font-bold text-[20px]">close</span>
                    </button>

                    {/* Small Image */}
                    <div
                        className="size-24 md:size-28 shrink-0 rounded-2xl bg-cover bg-center shadow-md border border-gray-100 dark:border-gray-700"
                        style={{ backgroundImage: `url('${product.image || (product as any).image_url}')` }}
                    ></div>

                    {/* Info next to Image */}
                    <div className="flex flex-col justify-center flex-1 min-w-0 pr-8 py-1">
                        <h2 className="text-xl md:text-2xl font-black text-text-main dark:text-white leading-tight mb-1.5">{product.name}</h2>
                        <p className="text-sm text-text-secondary font-medium mb-3 line-clamp-2 leading-relaxed">{product.description}</p>
                        <div className="flex items-center">
                            <span className="inline-flex items-center justify-center px-3 py-1 bg-primary text-[#102218] rounded-lg font-bold text-lg shadow-sm">
                                ${formatCurrency(product.price)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-surface-light dark:bg-surface-dark">

                    {/* Ingredients */}
                    {hasIngredients && (
                        <div className="mb-6">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-primary font-bold text-[20px]">edit</span>
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">PERSONALIZAR RECETA</h3>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                                {ingredients.map((ing) => (
                                    <div key={ing} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer select-none transition-colors border border-transparent hover:border-gray-100 dark:hover:border-gray-800" onClick={() => toggleIngredient(ing)}>
                                        <span className={`text-sm font-medium transition-colors ${removedIngredients.includes(ing) ? 'text-gray-400 line-through' : 'text-text-main dark:text-white'}`}>
                                            {ing}
                                        </span>
                                        <div className={`w-10 h-5 rounded-full relative transition-colors duration-200 shrink-0 ${!removedIngredients.includes(ing) ? 'bg-primary' : 'bg-gray-200 dark:bg-gray-700'}`}>
                                            <div className={`absolute top-0.5 left-0.5 bg-white size-4 rounded-full shadow-sm transition-transform duration-200 ${!removedIngredients.includes(ing) ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Options */}
                    {hasOptions && (
                        <div className="mb-6 border-t border-gray-100 dark:border-gray-800 pt-5">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="material-symbols-outlined text-primary font-bold text-[20px]">sell</span>
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">OPCIONES</h3>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {options.map((option) => {
                                    const isSelected = selectedOption === option;

                                    return (
                                        <button
                                            key={option}
                                            onClick={() => setSelectedOption(option)}
                                            className={`px-4 py-2.5 rounded-xl border text-sm font-bold shadow-sm transition-all active:scale-95 flex-1 whitespace-nowrap min-w-[30%]
                                        ${isSelected
                                                    ? 'border-primary bg-primary/10 text-green-900 dark:text-green-400 ring-1 ring-primary/30'
                                                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-text-secondary hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                                        >
                                            {option}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Notes */}
                    <div className="mb-2 border-t border-gray-100 dark:border-gray-800 pt-5">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-primary font-bold text-[20px]">edit_note</span>
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">NOTAS ADICIONALES</h3>
                        </div>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Escribe aquí instrucciones especiales..."
                            className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm text-text-main dark:text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none resize-none h-20 transition-all"
                        ></textarea>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 md:p-6 bg-white dark:bg-surface-dark border-t border-gray-100 dark:border-gray-800 z-30 shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                    <button
                        onClick={handleAdd}
                        className="w-full h-14 rounded-xl bg-primary hover:bg-primary-hover text-[#102218] font-bold text-lg shadow-lg shadow-primary/20 transition-all transform active:scale-[0.98] flex items-center justify-between px-6"
                    >
                        <span className="flex items-center gap-3">
                            {quantity > 1 && (
                                <span className="bg-[#102218]/10 px-2.5 py-0.5 rounded-lg text-sm font-extrabold backdrop-blur-sm">
                                    {quantity}
                                </span>
                            )}
                            Agregar a la Orden
                        </span>
                        <span className="bg-[#102218]/10 px-3 py-1 rounded-lg text-base font-extrabold backdrop-blur-sm">
                            ${formatCurrency(total)}
                        </span>
                    </button>
                </div>

            </div>
        </div>
    );
};
