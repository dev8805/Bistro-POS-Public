import React, { memo } from 'react';
import { Product } from '../types';
import { formatCurrency } from '../lib/formatters';

interface ProductCardProps {
    product: Product;
    quantity: number;
    onAdd: (e: React.MouseEvent<HTMLElement>) => void;
    onRemove: (e: React.MouseEvent<HTMLElement>) => void;
    onOptions: (e: React.MouseEvent<HTMLElement>) => void;
    onSetQuantity?: (e: React.MouseEvent<HTMLElement>) => void;
    variant: 'mobile' | 'desktop';
    isPulsing?: boolean;
}

/**
 * ProductCard - Componente memorizado para evitar re-renders innecesarios
 * Solo se re-renderiza si cambian sus props (quantity, isPulsing, etc.)
 */
export const ProductCard = memo(function ProductCard({
    product,
    quantity,
    onAdd,
    onRemove,
    onOptions,
    onSetQuantity,
    variant,
    isPulsing = false
}: ProductCardProps) {

    const imageUrl = product.image || (product as any).image_url;

    if (variant === 'mobile') {
        return (
            <div
                onClick={onAdd}
                className="bg-white dark:bg-surface-dark rounded-[12px] h-[181px] sm:h-[219px] w-[96%] sm:w-full max-w-[271px] sm:max-w-[500px] mx-auto shadow-sm border border-gray-100 dark:border-gray-800 active:scale-[0.97] transition-transform flex flex-col overflow-visible p-[11px] sm:p-[13px]"
            >
                {/* Image */}
                <div className="w-full h-[105px] sm:h-[135px] rounded-[8px] bg-gray-100 dark:bg-gray-800 relative shrink-0 overflow-hidden flex items-center justify-center">
                    {imageUrl ? (
                        <img
                            src={imageUrl}
                            alt={product.name}
                            loading="lazy"
                            decoding="async"
                            crossOrigin="anonymous"
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.querySelector('.placeholder-icon')?.classList.remove('hidden'); }}
                        />
                    ) : null}
                    <div className={`placeholder-icon flex flex-col items-center justify-center absolute inset-0 ${imageUrl ? 'hidden' : ''}`}>
                        <span className="material-symbols-outlined text-[32px] text-gray-300 dark:text-gray-600">restaurant</span>
                    </div>

                </div>

                {/* Info */}
                <div className="pt-2 flex flex-col gap-1 flex-1 min-h-0">
                    <h3 className="font-semibold text-[#111814] dark:text-white text-[11px] sm:text-[13px] leading-tight line-clamp-2">
                        {product.name}
                    </h3>
                    <div className="flex items-center justify-between mt-auto">
                        <div className="flex items-center gap-1.5">
                            <span className="font-bold text-[12px] sm:text-sm text-primary">${formatCurrency(product.price)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={onRemove}
                                className="size-[25px] flex items-center justify-center rounded-[6px] bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-white disabled:opacity-30"
                                disabled={quantity === 0}
                                aria-label="Quitar producto"
                            >
                                <span className="material-symbols-outlined text-[14px]">remove</span>
                            </button>
                            <span
                                onClick={onSetQuantity}
                                className={`text-[14px] font-black tabular-nums min-w-[20px] text-center select-none ${onSetQuantity ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 rounded' : ''} ${quantity > 0 ? 'text-primary-text dark:text-primary' : 'text-gray-300 dark:text-gray-600'}`}
                            >
                                {quantity}
                            </span>
                            <button
                                onClick={onAdd}
                                className="size-[25px] flex items-center justify-center rounded-[6px] bg-primary text-[#102218] font-bold"
                                aria-label="Agregar producto"
                            >
                                <span className="material-symbols-outlined text-[14px]">add</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Desktop variant
    return (
        <div
            onClick={onAdd}
            className={`bg-white dark:bg-surface-dark rounded-[21px] p-[13px] shadow-lg shadow-gray-200/50 dark:shadow-none border border-gray-100 dark:border-gray-800 hover:border-primary/50 transition-all flex flex-col h-auto cursor-pointer group relative
        ${isPulsing ? 'ring-2 ring-primary transform scale-[0.98]' : 'hover:shadow-md'}`}
        >
            {/* Image Area */}
            <div className="aspect-square w-full rounded-[15px] overflow-hidden relative mb-3 group-hover:shadow-md transition-all bg-gray-50 dark:bg-gray-800/50">
                {imageUrl ? (
                    <img
                        src={imageUrl}
                        alt={product.name}
                        loading="lazy"
                        decoding="async"
                        crossOrigin="anonymous"
                        className="h-full w-full object-contain group-hover:scale-110 transition-transform duration-500"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.querySelector('.placeholder-icon')?.classList.remove('hidden'); }}
                    />
                ) : null}
                <div className={`placeholder-icon flex flex-col items-center justify-center absolute inset-0 ${imageUrl ? 'hidden' : ''}`}>
                    <span className="material-symbols-outlined text-[40px] text-gray-300 dark:text-gray-600">restaurant</span>
                </div>
                <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-md px-3 py-1 rounded-full text-white text-xs font-bold shadow-sm z-10">
                    ${formatCurrency(product.price)}
                </div>



            </div>

            {/* Title */}
            <div className="mb-2 px-1">
                <h3 className="font-semibold text-[#111814] dark:text-gray-100 text-[13px] leading-tight line-clamp-2" title={product.name}>
                    {product.name}
                </h3>
            </div>

            {/* Footer: Controls */}
            <div className="mt-auto bg-gray-50 dark:bg-gray-800 rounded-xl p-1.5 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                <button
                    onClick={onRemove}
                    className={`w-[29px] h-[29px] rounded-[0.5rem] flex items-center justify-center transition-all ${quantity === 0 ? 'opacity-30 cursor-not-allowed bg-white dark:bg-gray-700 text-gray-300 dark:text-gray-600' : 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 border border-red-100 dark:border-red-900/30 hover:bg-red-100'}`}
                    disabled={quantity === 0}
                    aria-label="Quitar producto"
                >
                    <span className="material-symbols-outlined text-[18px]">remove</span>
                </button>
                <span
                    onClick={onSetQuantity}
                    className={`text-[15px] font-black tabular-nums min-w-[22px] text-center select-none transition-colors ${onSetQuantity ? 'cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 rounded' : ''} ${quantity > 0 ? 'text-primary-text dark:text-primary' : 'text-gray-300 dark:text-gray-600'}`}
                >
                    {quantity}
                </span>
                <button
                    onClick={onAdd}
                    className="w-[29px] h-[29px] rounded-[0.5rem] bg-primary text-[#102218] shadow-sm flex items-center justify-center hover:bg-primary/80 transition-colors font-bold"
                    aria-label="Agregar producto"
                >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                </button>
            </div>
        </div>
    );
});
