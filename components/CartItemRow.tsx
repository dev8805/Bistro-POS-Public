import React, { memo, useState, useEffect, useMemo } from 'react';
import { CartItem as CartItemType } from '../types';
import { formatCurrency, formatQty } from '../lib/formatters';

const brokenImageCache = new Set<string>();

interface CartItemProps {
    item: CartItemType;
    index: number;
    onRemove: () => void;
    onUpdateQuantity: (delta: number) => void;
    onEditProduct?: () => void;
    onDiscount?: () => void;
    forceExpanded?: boolean;
    defaultExpanded?: boolean;
    onExpandChange?: (expanded: boolean) => void;
    /** Layout plano de 2 filas siempre visible (sin chevron ni desplegar). Usado en modo Catálogo. */
    flat?: boolean;
    /** Nombres de productos-modificadores (add-ons) agrupados bajo este ítem, mostrados como etiquetas. */
    modifierTags?: string[];
    /** Monto extra (suma de los add-ons) a sumar en el precio mostrado de la línea. */
    extraAmount?: number;
    /** Solo lectura (mesa congelada): deshabilita editar cantidad, modificador, descuento y eliminar. */
    readOnly?: boolean;
}

/**
 * CartItemRow - Componente memorizado para items del carrito
 * Diseño compacto similar a vista móvil
 * Las etiquetas de modificaciones siempre son visibles
 */
export const CartItemRow = memo(function CartItemRow({
    item,
    index,
    onRemove,
    onUpdateQuantity,
    onEditProduct,
    onDiscount,
    forceExpanded = false,
    defaultExpanded = false,
    onExpandChange,
    flat = false,
    modifierTags = [],
    extraAmount = 0,
    readOnly = false
}: CartItemProps) {
    const [localExpanded, setLocalExpanded] = useState(defaultExpanded);
    const [, forceUpdate] = useState(false);

    // Usar forceExpanded si está activo, sino usar estado local
    const isExpanded = forceExpanded || localExpanded;

    // Sync forceExpanded changes to local state (only when forcing open)
    useEffect(() => {
        if (forceExpanded) {
            setLocalExpanded(true);
        }
    }, [forceExpanded]);

    const handleToggleExpand = () => {
        const newState = !isExpanded;
        setLocalExpanded(newState);
        onExpandChange?.(newState);
    };

    const hasModifications = item.cookingTerm || (item.removedIngredients && item.removedIngredients.length > 0) || item.notes;

    // Badge "pendiente de sincronizar" (Req 7.5): item de mesa tomado offline por
    // el Eje que aún no se subió a Supabase. Se muestra junto al nombre.
    const pendingSyncBadge = item.pendingSync ? (
        <span
            className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 px-1.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800/50 whitespace-nowrap"
            role="status"
            aria-label="Pendiente de sincronizar"
            title="Pendiente de sincronizar con el servidor"
        >
            <span className="material-symbols-outlined text-[11px] leading-none" aria-hidden>cloud_off</span>
            Pendiente
        </span>
    ) : null;

    // Badge de cantidad reutilizable (sobre la imagen)
    const qtyBadge = (
        <div className="absolute -top-2 -left-2 bg-primary text-[#102218] text-[10px] font-bold px-1.5 h-[18px] rounded-full flex items-center justify-center shadow-sm border-2 border-white dark:border-gray-800 z-10 whitespace-nowrap">
            {formatQty(item.quantity)}
            {item.unit && item.unit !== 'Unidad' && item.unit !== 'Und' && (
                <span className="ml-[1px] text-[8px] opacity-80">
                    {({ 'Kilogramos': 'Kg', 'Libras': 'Lb', 'Gramos': 'g', 'Onzas': 'Oz', 'Litros': 'Lt', 'Mililitros': 'ml', 'Galones': 'Gal', 'Metros': 'm', 'Centímetros': 'cm' } as Record<string, string>)[item.unit] || item.unit}
                </span>
            )}
        </div>
    );

    const imageSrc = (item as any).image || (item as any).image_url;
    const hasValidImage = !!(imageSrc && !brokenImageCache.has(imageSrc));

    const placeholderDiv = (
        <div className="size-14 shrink-0 rounded-lg bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center border border-gray-100 dark:border-gray-700/50">
            <span className="material-symbols-outlined text-gray-300 dark:text-gray-600 text-[20px]">inventory_2</span>
        </div>
    );

    const thumbnail = useMemo(() => (
        hasValidImage ? (
            <img
                src={imageSrc}
                alt={item.name}
                crossOrigin="anonymous"
                className="size-14 shrink-0 rounded-lg object-cover bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700/50"
                decoding="async"
                onError={() => { brokenImageCache.add(imageSrc); forceUpdate(v => !v); }}
            />
        ) : placeholderDiv
    ), [hasValidImage, imageSrc, item.name]);

    // ── Layout PLANO (Catálogo): imagen a la izquierda + 2 filas a la derecha, todo en un solo recuadro gris ──
    if (flat) {
        return (
            <div className="py-1.5 px-0 border-b border-gray-100 dark:border-gray-800/50 bg-white dark:bg-surface-dark">
                <div className="flex flex-row items-center gap-2.5 px-3 py-2 rounded-xl bg-gray-50/80 dark:bg-gray-800/40">
                    {/* Imagen (tamaño normal, centrada verticalmente junto a las 2 filas) */}
                    <div className="relative shrink-0 flex items-center justify-center">
                        {qtyBadge}
                        {thumbnail}
                    </div>

                    {/* Derecha: 2 filas (nombre+precio / controles) */}
                    <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                        {/* Fila 1: Nombre + Precio */}
                        <div className="flex items-start justify-between gap-2 min-w-0">
                            <h4 className="font-semibold text-text-main dark:text-white text-[13px] md:text-sm leading-snug line-clamp-2 min-w-0">
                                {item.name}
                            </h4>
                            <span className="font-bold text-text-main dark:text-white text-sm whitespace-nowrap shrink-0">
                                ${formatCurrency(Math.round(item.price * item.quantity + extraAmount))}
                            </span>
                        </div>

                        {/* Badge pendiente de sincronizar (Req 7.5) */}
                        {pendingSyncBadge && (
                            <div className="-mt-0.5">{pendingSyncBadge}</div>
                        )}

                        {/* Descuento aplicado (si hay) */}
                        {((item.discount || 0) > 0 || (item.discountPercent || 0) > 0) && (
                            <div className="flex items-center justify-between -mt-0.5">
                                <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 tracking-tight">Descuento</span>
                                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                                    -${formatCurrency(item.discount || ((item.discountPercent || 0) * item.price * item.quantity) / 100)}
                                </span>
                            </div>
                        )}

                        {/* Etiquetas (término + sin ingredientes + add-ons) en una sola fila; nota debajo */}
                        {(hasModifications || modifierTags.length > 0) && (
                            <div className="flex flex-col gap-1 -mt-0.5">
                                {(item.cookingTerm || (item.removedIngredients && item.removedIngredients.length > 0) || modifierTags.length > 0) && (
                                    <div className="flex items-center gap-1 flex-wrap">
                                        {item.cookingTerm && item.cookingTerm.split(', ').filter(Boolean).map((tag) => (
                                            <span key={tag} className="text-[9px] font-semibold text-orange-600 bg-orange-50 dark:bg-orange-900/20 px-1.5 py-0.5 rounded border border-orange-100 dark:border-orange-900/30">
                                                {tag}
                                            </span>
                                        ))}
                                        {item.removedIngredients && item.removedIngredients.map((ing) => (
                                            <span key={ing} className="text-[9px] font-semibold text-red-600 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded border border-red-100 dark:border-red-900/30">
                                                Sin {ing}
                                            </span>
                                        ))}
                                        {modifierTags.map((t, i) => (
                                            <span key={`mod-${i}`} className="text-[9px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/30">
                                                {t}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {item.notes && (
                                    <span className="text-[10px] text-teal-600 dark:text-teal-400 italic leading-tight">"{item.notes}"</span>
                                )}
                            </div>
                        )}

                        {/* Fila 2: Controles — una sola línea, eliminar pegado a la derecha */}
                        <div className="flex items-center gap-1.5">
                            {/* Qty */}
                            <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded h-7 px-0.5 shrink-0">
                                <button disabled={readOnly} onClick={(e) => { e.stopPropagation(); onUpdateQuantity(-1); }} className="px-1.5 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-current">
                                    <span className="material-symbols-outlined text-[14px] font-bold">remove</span>
                                </button>
                                <span className="text-xs font-bold w-5 text-center">{formatQty(item.quantity)}</span>
                                <button disabled={readOnly} onClick={(e) => { e.stopPropagation(); onUpdateQuantity(1); }} className="px-1.5 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-current">
                                    <span className="material-symbols-outlined text-[14px] font-bold">add</span>
                                </button>
                            </div>

                            {/* Modificador (texto completo legible, ajustado para pantallas móviles compactas) */}
                            {onEditProduct && (
                                <button
                                    disabled={readOnly}
                                    onClick={(e) => { e.stopPropagation(); onEditProduct(); }}
                                    className="h-7 sm:h-8 px-2 sm:px-2.5 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-amber-50 hover:border-amber-400 hover:text-amber-700 dark:hover:bg-amber-900/20 dark:hover:border-amber-700/50 dark:hover:text-amber-300 active:scale-95 transition-all duration-200 text-[9.5px] sm:text-[10.5px] font-semibold uppercase tracking-tight whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                                    title="Modificador / Opciones"
                                >
                                    Modificador
                                </button>
                            )}

                            {/* Descuento (ícono) — junto al modificador */}
                            <button
                                disabled={readOnly}
                                onClick={(e) => { e.stopPropagation(); onDiscount?.(); }}
                                className="size-7 shrink-0 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-500 border border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                                title="Aplicar Descuento"
                                aria-label="Aplicar Descuento"
                            >
                                <span className="material-symbols-outlined text-[16px]">sell</span>
                            </button>

                            {/* Spacer */}
                            <div className="flex-1 min-w-0" />

                            {/* Eliminar */}
                            <button
                                disabled={readOnly}
                                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                                className="size-7 shrink-0 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-400 border border-gray-100 dark:border-gray-700 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 hover:border-red-100 dark:hover:border-red-900/30 active:scale-95 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-gray-50 disabled:hover:text-gray-400"
                                title="Eliminar"
                                aria-label="Eliminar"
                            >
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className="flex gap-2 py-2.5 md:py-1.5 px-3 border-b border-gray-100 dark:border-gray-800/50 bg-white dark:bg-surface-dark"
        >
            {/* Content */}
            <div className="flex-1 flex flex-col">
                {/* Main Card - Includes Header & Tags - Clickable */}
                <div
                    className="flex flex-col cursor-pointer select-none -mx-2 px-2.5 md:px-2 py-2 md:py-1 rounded-xl md:rounded-lg bg-gray-50/80 dark:bg-gray-800/40 hover:bg-gray-100 dark:hover:bg-gray-700/50 active:bg-gray-100 dark:active:bg-gray-700 transition-colors"
                    onClick={handleToggleExpand}
                >
                    {/* Header Row: Name, Price, Actions */}
                    <div className="flex justify-between items-center min-w-0">
                        {/* Left Side: Chevron, Image with Qty Badge, Name */}
                        <div className="flex-1 flex flex-row items-center gap-2.5 min-w-0 pr-2">
                            {/* Chevron */}
                            <span className={`material-symbols-outlined text-[14px] text-gray-400 dark:text-gray-500 transition-transform duration-200 shrink-0 ${isExpanded ? 'rotate-90 text-primary' : ''}`}>
                                chevron_right
                            </span>

                            {/* Image & Notification Qty Badge */}
                            <div className="relative shrink-0 flex items-center justify-center">
                                {qtyBadge}
                                {thumbnail}
                            </div>

                            {/* Name Block */}
                            <div className="flex flex-col min-w-0 justify-center">
                                <h4 className="font-semibold text-text-main dark:text-white text-[13px] md:text-sm leading-[1.15] md:leading-tight">
                                    <span className="line-clamp-2 text-balance leading-snug">{item.name}</span>
                                </h4>
                                {pendingSyncBadge && (
                                    <div className="mt-1">{pendingSyncBadge}</div>
                                )}
                            </div>
                        </div>

                        {/* Right Side: Price & Actions */}
                        <div className="flex flex-col items-end gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <span className="font-bold text-text-main dark:text-white text-sm whitespace-nowrap">
                                ${formatCurrency(Math.round(item.price * item.quantity))}
                            </span>
                            <button
                                disabled={readOnly}
                                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                                className="size-6 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400"
                                title="Eliminar"
                            >
                                <span className="material-symbols-outlined text-[16px] font-medium">delete</span>
                            </button>
                        </div>
                    </div>

                    {/* Discount Line - Shown below product name when discount applied */}
                    {((item.discount || 0) > 0 || (item.discountPercent || 0) > 0) && (
                        <div className="flex items-center justify-between mt-1.5 ml-4">
                            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 tracking-tight">
                                Descuento
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                                    -${formatCurrency(item.discount || ((item.discountPercent || 0) * item.price * item.quantity) / 100)}
                                </span>
                                {/* Spacer to align with the delete button above (size-5 = 20px) */}
                                <div className="w-5" />
                            </div>
                        </div>
                    )}

                    {/* Modifications Badges - Always Visible (Now inside gray bg) */}
                    {hasModifications && (
                        <div className="flex flex-col gap-1 mt-1.5 ml-4">
                            {/* Tags row: Cooking Term + Removed Ingredients */}
                            {(item.cookingTerm || (item.removedIngredients && item.removedIngredients.length > 0)) && (
                                <div className="flex items-center gap-1 flex-wrap">
                                    {/* Cooking Term Badges */}
                                    {item.cookingTerm && item.cookingTerm.split(', ').filter(Boolean).map((tag) => (
                                        <span key={tag} className="text-[9px] font-semibold text-orange-600 bg-orange-50 dark:bg-orange-900/20 px-1.5 py-0.5 rounded border border-orange-100 dark:border-orange-900/30">
                                            {tag}
                                        </span>
                                    ))}

                                    {/* Removed Ingredients Badges */}
                                    {item.removedIngredients && item.removedIngredients.map((ing) => (
                                        <span
                                            key={ing}
                                            className="text-[9px] font-semibold text-red-600 bg-red-50 dark:bg-red-900/20 px-1.5 py-0.5 rounded border border-red-100 dark:border-red-900/30"
                                        >
                                            Sin {ing}
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* Notes row */}
                            {item.notes && (
                                <span className="text-[10px] text-teal-600 dark:text-teal-400 italic leading-tight">
                                    "{item.notes}"
                                </span>
                            )}
                        </div>
                    )}
                </div>

                {/* Expandable Controls - Only Qty and Modificador */}
                <div className={`overflow-hidden transition-all duration-200 ease-out ${isExpanded ? 'max-h-32 mt-2 opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="flex items-center gap-2 flex-wrap ml-4">
                        {/* Qty Controls */}
                        <div className="flex items-center bg-gray-100 dark:bg-gray-700 rounded h-6 px-0.5">
                            <button
                                disabled={readOnly}
                                onClick={(e) => { e.stopPropagation(); onUpdateQuantity(-1); }}
                                className="px-1.5 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-current"
                            >
                                <span className="material-symbols-outlined text-[14px] font-bold">remove</span>
                            </button>
                            <span className="text-xs font-bold w-5 text-center">{formatQty(item.quantity)}</span>
                            <button
                                disabled={readOnly}
                                onClick={(e) => { e.stopPropagation(); onUpdateQuantity(1); }}
                                className="px-1.5 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-current"
                            >
                                <span className="material-symbols-outlined text-[14px] font-bold">add</span>
                            </button>
                        </div>

                        {/* Modificador Button */}
                        {onEditProduct && (
                            <button
                                disabled={readOnly}
                                onClick={(e) => { e.stopPropagation(); onEditProduct(); }}
                                className="h-7 sm:h-8 px-2 sm:px-2.5 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-amber-50 hover:border-amber-400 hover:text-amber-700 dark:hover:bg-amber-900/20 dark:hover:border-amber-700/50 dark:hover:text-amber-300 active:scale-95 active:bg-amber-100 dark:active:bg-amber-900/30 transition-all duration-200 text-[9.5px] sm:text-[10.5px] font-semibold uppercase tracking-tight whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                                title="Modificador / Opciones"
                            >
                                Modificador
                            </button>
                        )}

                        {/* Discount Button */}
                        <button
                            disabled={readOnly}
                            onClick={(e) => { e.stopPropagation(); onDiscount?.(); }}
                            className="h-8 px-3 flex items-center justify-center rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-amber-50 hover:border-amber-400 hover:text-amber-700 dark:hover:bg-amber-900/20 dark:hover:border-amber-700/50 dark:hover:text-amber-300 active:scale-95 active:bg-amber-100 dark:active:bg-amber-900/30 transition-all duration-200 text-[11px] font-semibold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed"
                            title="Aplicar Descuento"
                        >
                            Descuento
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
});
