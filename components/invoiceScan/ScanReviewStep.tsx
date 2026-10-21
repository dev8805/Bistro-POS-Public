import React, { useMemo, useState } from 'react';
import type { ReviewPatch, ScanLine } from '../../lib/invoiceScan/types';
import { toPesos } from '../../lib/invoiceScan/numbers';
import { formatCurrency } from '../../lib/formatters';
import { formatWithThousands, parseCleanNumber } from '../expense/shared';
import { SCAN_PRIMARY_ACTION_CLASSES, SCAN_SECONDARY_ACTION_CLASSES } from './ScanStepShell';

/**
 * Panel_Revision del Escaneo_Unificado: última parada antes del paso de pago.
 *
 * Componente presentacional puro. No consume `useInvoiceScanDraft`, no llama a
 * `useProducts` y no hace fetch: recibe las líneas **ya resueltas** (con el
 * producto vinculado, su Unidad_Venta y su costo y precio vigentes) y devuelve
 * las ediciones por callback. Quien lo cablea es `screens/InvoiceScanScreen.tsx`
 * (tarea 5.8), que es el único que conoce el catálogo del Negocio_Activo. Así el
 * panel solo puede mostrar datos del negocio que su host le pasó (Req 17.14).
 *
 * Decisiones de diseño:
 *
 * - **Tarjeta por línea en vez de tabla.** Una tabla de cinco columnas con dos
 *   campos editables, el botón de quitar y el bloque de variación de costo no
 *   cabe en 360 px sin scroll horizontal ni sin romper los objetivos táctiles de
 *   44 px. Cada línea es una tarjeta: en móvil apila los campos y en `sm+` los
 *   pone en dos columnas, de modo que se lee como una tabla sin serlo.
 * - **El costo por Unidad_Venta es derivado.** El borrador transporta
 *   `quantity` y `lineTotal` (diseño: Data Models), así que el panel muestra
 *   `lineTotal / quantity` con hasta 2 decimales y, al editar el costo, emite el
 *   `lineTotal` recalculado.
 * - **Criterio de variación, margen y precio heredado de
 *   `components/expense/InvoiceReviewPanel.tsx`** (el panel de revisión del
 *   escaneo embebido), para no inventar una segunda fórmula:
 *     `deltaPct     = (nuevoCosto − costoCatálogo) / costoCatálogo × 100`
 *     `margenPrevio = (precioVigente − costoCatálogo) / precioVigente × 100`
 *     `margenNuevo  = (precioVigente − nuevoCosto)   / precioVigente × 100`
 *   con la misma compuerta (`costoCatálogo > 0`, `nuevoCosto > 0`,
 *   `precioVigente > 0`) y la misma comparación redondeada a pesos para decidir
 *   si el costo subió o bajó. La diferencia frente al panel actual es que aquí el
 *   bloque aparece **solo cuando el costo difiere** (Req 10.3), no cuando está
 *   estable.
 *
 * Requisitos: 6.9, 6.10, 10.1, 10.2, 10.3, 10.4, 17.14.
 */

/** Línea resuelta tal como la recibe el panel, con lo vigente del catálogo. */
export interface ScanReviewLineView {
    /** Índice de la línea en `draft.lines`. Viaja en cada patch (Req 10.2). */
    index: number;
    line: ScanLine;
    /** Producto vinculado o el nombre del producto que la línea va a crear. */
    productName: string;
    /** Imagen del producto (si tiene). */
    productImage?: string | null;
    /** Unidad_Venta del producto, para rotular la cantidad y el costo. */
    saleUnit: string;
    /** `products.cost` vigente. `null` cuando la línea crea un producto nuevo. */
    catalogCost: number | null;
    /** `products.price` vigente. `null` cuando la línea crea un producto nuevo. */
    catalogPrice: number | null;
}

export interface ScanReviewStepProps {
    /** Líneas resueltas. Vacío ⇒ aviso de compra sin productos (Req 6.10). */
    lines: ScanReviewLineView[];
    onUpdateLine: (index: number, patch: ReviewPatch) => void;
    onRemoveLine: (index: number) => void;
    onConfirm: () => void;
    /** Salida "volver a escanear" del aviso de compra sin productos (Req 6.10). */
    onRescan: () => void;
    /** Salida "cerrar" del aviso de compra sin productos (Req 6.10). */
    onClose: () => void;
}

/** Campo de la línea que el Usuario está escribiendo en este momento. */
type EditingField = 'quantity' | 'cost' | 'price';

/**
 * Buffer del campo en edición. Guarda el texto crudo para que escribir no salte
 * por el redondeo, y el costo por Unidad_Venta de referencia con el que se
 * recalcula el total cuando cambia la cantidad (así una cantidad temporal en 0
 * no destruye el costo de la línea).
 */
interface EditingState {
    index: number;
    field: EditingField;
    value: string;
    referenceUnitCost: number;
}

/** Variación de costo y su impacto en el margen, ya calculados. */
interface CostImpact {
    direction: 'up' | 'down' | 'stable';
    deltaPct: number;
    deltaPesos: number;
    previousCost: number;
    newCost: number;
    previousMargin: number;
    newMargin: number;
    recoveredMargin: number | null;
}

const CARD_CLASSES = 'rounded-2xl border border-slate-300 bg-white p-3 shadow-xs';
const FIELD_LABEL_CLASSES = 'mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500 truncate';
const FIELD_INPUT_CLASSES =
    'h-11 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold text-slate-800 outline-none transition-shadow focus:border-amber-400 focus:ring-2 focus:ring-amber-400/40';
const IMPACT_UP_CLASSES = 'mt-3 space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-700';
const IMPACT_DOWN_CLASSES = 'mt-3 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-800';
const IMPACT_STABLE_CLASSES = 'mt-3 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-600';

const isActivationKey = (key: string): boolean => key === 'Enter' || key === ' ' || key === 'Spacebar';

const roundTo2 = (value: number): number => Math.round(value * 100) / 100;

/** Costo por Unidad_Venta: derivado del total y la cantidad de la línea. */
const deriveUnitCost = (quantity: number, lineTotal: number): number =>
    quantity > 0 ? lineTotal / quantity : 0;

/** Lee un `input[type=number]` tolerando texto vacío o inválido. */
const toInputNumber = (raw: string): number => {
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return parsed;
};


/**
 * Variación de costo y margen con el criterio de `InvoiceReviewPanel`.
 * Devuelve `null` cuando falta el costo o el precio vigentes. Si el costo
 * coincide con el del catálogo, marca la dirección como `'stable'`.
 */
const computeCostImpact = (
    unitCost: number,
    catalogCost: number | null,
    catalogPrice: number | null,
    effectivePrice?: number | null,
): CostImpact | null => {
    const previousCost = catalogCost ?? 0;
    const salePrice = catalogPrice ?? 0;
    if (previousCost <= 0 || unitCost <= 0 || salePrice <= 0) return null;

    const roundedPrevious = Math.round(previousCost);
    const roundedNew = Math.round(unitCost);
    const isStable = roundedPrevious === roundedNew;

    const newMargin = ((salePrice - unitCost) / salePrice) * 100;
    const hasEdited = typeof effectivePrice === 'number' && Number.isFinite(effectivePrice) && effectivePrice > 0 && Math.round(effectivePrice) !== Math.round(salePrice);
    const recoveredMargin = hasEdited ? ((effectivePrice - unitCost) / effectivePrice) * 100 : null;

    return {
        direction: isStable ? 'stable' : (roundedNew > roundedPrevious ? 'up' : 'down'),
        deltaPct: previousCost > 0 ? ((unitCost - previousCost) / previousCost) * 100 : 0,
        deltaPesos: unitCost - previousCost,
        previousCost,
        newCost: unitCost,
        previousMargin: ((salePrice - previousCost) / salePrice) * 100,
        newMargin,
        recoveredMargin,
    };
};

interface ScanReviewLineCardProps {
    view: ScanReviewLineView;
    editing: EditingState | null;
    onUpdateLine: (index: number, patch: ReviewPatch) => void;
    onRemoveLine: (index: number) => void;
    onEditing: React.Dispatch<React.SetStateAction<EditingState | null>>;
}

const ScanReviewLineCard: React.FC<ScanReviewLineCardProps> = ({
    view,
    editing,
    onUpdateLine,
    onRemoveLine,
    onEditing,
}) => {
    const { index, line, productName, productImage, saleUnit, catalogCost, catalogPrice } = view;
    const [imgError, setImgError] = useState(false);
    const [isImpactOpen, setIsImpactOpen] = useState(line.newPrice !== null);

    const quantity = line.quantity ?? 0;
    const lineTotal = line.lineTotal ?? 0;
    const unitCost = deriveUnitCost(quantity, lineTotal);
    const salePrice = catalogPrice ?? 0;

    const isEditing = (field: EditingField): boolean =>
        editing !== null && editing.index === index && editing.field === field;

    const quantityValue = isEditing('quantity') ? (editing as EditingState).value : String(roundTo2(quantity));
    const costValue = isEditing('cost') ? (editing as EditingState).value : String(roundTo2(unitCost));
    const priceDigits = line.newPrice !== null ? String(Math.round(line.newPrice)) : String(Math.round(salePrice));
    const priceValue = isEditing('price') ? (editing as EditingState).value : priceDigits;

    const activePriceNumber = isEditing('price')
        ? (Number(priceValue) || salePrice)
        : (line.newPrice !== null ? line.newPrice : salePrice);
    const impact = computeCostImpact(unitCost, catalogCost, catalogPrice, activePriceNumber);

    const handleQuantityChange = (raw: string) => {
        const next = toInputNumber(raw);
        // El costo por Unidad_Venta es la referencia estable: el total sigue a la
        // cantidad, igual que el panel de revisión actual.
        const reference = isEditing('quantity') ? (editing as EditingState).referenceUnitCost : unitCost;
        onEditing({ index, field: 'quantity', value: raw, referenceUnitCost: reference });

        if (next <= 0) {
            onUpdateLine(index, { quantity: next });
            return;
        }
        onUpdateLine(index, { quantity: next, lineTotal: toPesos(reference * next) });
    };

    const handleCostChange = (raw: string) => {
        const next = toInputNumber(raw);
        onEditing({ index, field: 'cost', value: raw, referenceUnitCost: next });
        onUpdateLine(index, { lineTotal: toPesos(next * quantity) });
    };

    const handlePriceChange = (raw: string) => {
        const digits = parseCleanNumber(raw);
        onEditing({ index, field: 'price', value: digits, referenceUnitCost: unitCost });
        onUpdateLine(index, { newPrice: digits === '' ? null : Number(digits) });
    };

    const handleBlur = () => onEditing(null);

    const handleRemove = () => onRemoveLine(index);

    const handleRemoveKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        handleRemove();
    };

    const priceChanged = line.newPrice !== null && Math.round(line.newPrice) !== Math.round(salePrice);

    return (
        <li className={CARD_CLASSES}>
            {/* Producto vinculado · Imagen · Nombre_OCR · total de línea · quitar */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                    <div className="hidden sm:flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
                        {productImage && !imgError ? (
                            <img
                                src={productImage}
                                alt={productName}
                                className="size-full object-cover"
                                crossOrigin="anonymous"
                                onError={() => setImgError(true)}
                            />
                        ) : (
                            <span className="material-symbols-outlined text-xl" aria-hidden="true">
                                inventory_2
                            </span>
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-black leading-snug text-slate-900">{productName}</p>
                        <p className="line-clamp-2 break-words text-[11px] font-semibold text-slate-500 leading-tight mt-0.5">"{line.ocrName}"</p>
                        {line.conversionFactor && line.conversionFactor > 1 && (
                            <span
                                title={line.reasoning || undefined}
                                className="mt-1 hidden sm:inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700 border border-sky-200/60"
                            >
                                <span className="material-symbols-outlined text-[12px]" aria-hidden="true">auto_awesome</span>
                                Empaque x{line.conversionFactor} ({line.ocrQuantity} facturados = {line.quantity} {saleUnit})
                            </span>
                        )}
                        {line.needsReview && (
                            <p className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-800">
                                Revisa la cantidad
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <div className="text-right">
                        <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Total</span>
                        <span className="block text-sm font-black text-slate-900">{`$${formatCurrency(lineTotal)}`}</span>
                    </div>
                    <button
                        type="button"
                        onClick={handleRemove}
                        onKeyDown={handleRemoveKeyDown}
                        tabIndex={0}
                        aria-label={`Quitar ${productName} de la compra`}
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 active:scale-95"
                    >
                        <span className="material-symbols-outlined text-lg" aria-hidden="true">delete</span>
                    </button>
                </div>
            </div>

            {/* Cantidad y costo por Unidad_Venta, editables (Req 10.2) */}
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:gap-3">
                <div>
                    <label className={FIELD_LABEL_CLASSES} htmlFor={`scan-review-qty-${index}`}>
                        {`Cantidad (${saleUnit})`}
                    </label>
                    <input
                        id={`scan-review-qty-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={quantityValue}
                        onChange={e => handleQuantityChange(e.target.value)}
                        onBlur={handleBlur}
                        onWheel={e => e.currentTarget.blur()}
                        aria-label={`Cantidad de ${productName} en ${saleUnit}`}
                        className={FIELD_INPUT_CLASSES}
                    />
                </div>
                <div>
                    <label className={FIELD_LABEL_CLASSES} htmlFor={`scan-review-cost-${index}`}>
                        {`Costo por ${saleUnit}`}
                    </label>
                    <input
                        id={`scan-review-cost-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={costValue}
                        onChange={e => handleCostChange(e.target.value)}
                        onBlur={handleBlur}
                        onWheel={e => e.currentTarget.blur()}
                        aria-label={`Costo por ${saleUnit} de ${productName}`}
                        className={FIELD_INPUT_CLASSES}
                    />
                </div>
            </div>

            {/* Variación de costo, margen y precio de venta (Req 10.3, 10.4) */}
            {impact && (
                <div className={impact.direction === 'up' ? IMPACT_UP_CLASSES : impact.direction === 'down' ? IMPACT_DOWN_CLASSES : IMPACT_STABLE_CLASSES}>
                    {/* Fila 1: Botón desplegable con valor y porcentaje */}
                    <button
                        type="button"
                        onClick={() => setIsImpactOpen(prev => !prev)}
                        aria-expanded={isImpactOpen}
                        className="flex w-full items-center justify-between gap-2 text-left"
                    >
                        <div className="flex min-w-0 items-center gap-1.5">
                            <span className="material-symbols-outlined text-base shrink-0" aria-hidden="true">
                                {impact.direction === 'up' ? 'trending_up' : impact.direction === 'down' ? 'trending_down' : 'trending_flat'}
                            </span>
                            <span className="truncate text-[11px] font-black">
                                {impact.direction === 'up'
                                    ? `Costo subió +$${formatCurrency(Math.round(Math.abs(impact.deltaPesos)))} (${Math.abs(impact.deltaPct).toFixed(1)}%)`
                                    : impact.direction === 'down'
                                        ? `Costo bajó -$${formatCurrency(Math.round(Math.abs(impact.deltaPesos)))} (${Math.abs(impact.deltaPct).toFixed(1)}%)`
                                        : 'Estable'}
                            </span>
                        </div>
                        <span className="material-symbols-outlined text-lg shrink-0 opacity-70 transition-transform duration-200" aria-hidden="true">
                            {isImpactOpen ? 'expand_less' : 'expand_more'}
                        </span>
                    </button>

                    {/* Contenido desplegable: último costo, margen y precio de venta */}
                    {isImpactOpen && (
                        <div className="space-y-2 pt-1 border-t border-current/10">
                            <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                                <span className="text-slate-500">Último costo:</span>
                                <span className="font-bold text-slate-800">{`$${formatCurrency(impact.previousCost)}`}</span>
                                <span className="text-slate-400">·</span>
                                <span className="text-slate-500">Margen:</span>
                                <span className="font-bold text-slate-800">
                                    {`${(impact.recoveredMargin !== null ? impact.recoveredMargin : impact.newMargin).toFixed(1)}%`}
                                </span>
                            </p>

                            <div>
                                <div className="flex items-center justify-between gap-1 mb-1">
                                    <label className={FIELD_LABEL_CLASSES} htmlFor={`scan-review-price-${index}`}>
                                        Precio de venta
                                    </label>
                                    {impact.recoveredMargin !== null && (
                                        <span className="text-[9px] font-black uppercase text-emerald-700 bg-emerald-100/90 px-1.5 py-0.5 rounded">
                                            Nuevo margen: {impact.recoveredMargin.toFixed(1)}%
                                        </span>
                                    )}
                                </div>
                                <div className="relative">
                                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                                        $
                                    </span>
                                    <input
                                        id={`scan-review-price-${index}`}
                                        type="text"
                                        inputMode="numeric"
                                        value={formatWithThousands(priceValue)}
                                        onChange={e => handlePriceChange(e.target.value)}
                                        onBlur={handleBlur}
                                        aria-label={`Precio de venta de ${productName}`}
                                        className={`${FIELD_INPUT_CLASSES} bg-white pl-7`}
                                    />
                                </div>
                                {priceChanged && (
                                    <p className="mt-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
                                        Se guardará al confirmar
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </li>
    );
};

export const ScanReviewStep: React.FC<ScanReviewStepProps> = ({
    lines,
    onUpdateLine,
    onRemoveLine,
    onConfirm,
    onRescan,
    onClose,
}) => {
    const [editing, setEditing] = useState<EditingState | null>(null);

    const purchaseTotal = useMemo(
        () => lines.reduce((acc, view) => acc + (view.line.lineTotal ?? 0), 0),
        [lines],
    );

    const handleKeyActivation = (action: () => void) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        action();
    };

    // Compra sin productos: aviso y las dos salidas del flujo (Req 6.10).
    if (lines.length === 0) {
        return (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
                <span className="material-symbols-outlined text-5xl text-slate-300" aria-hidden="true">
                    remove_shopping_cart
                </span>
                <div>
                    <p className="text-base font-black text-slate-900">Esta compra no tiene productos</p>
                    <p className="mx-auto mt-1 max-w-sm text-sm font-semibold leading-snug text-slate-500">
                        Se omitieron o se quitaron todas las líneas de la factura. Puedes volver a escanear la factura o
                        cerrar el escaneo sin registrar nada.
                    </p>
                </div>
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <button
                        type="button"
                        onClick={onRescan}
                        onKeyDown={handleKeyActivation(onRescan)}
                        tabIndex={0}
                        aria-label="Volver a escanear la factura"
                        className={SCAN_PRIMARY_ACTION_CLASSES}
                    >
                        Volver a escanear
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        onKeyDown={handleKeyActivation(onClose)}
                        tabIndex={0}
                        aria-label="Cerrar el escaneo sin registrar la compra"
                        className={SCAN_SECONDARY_ACTION_CLASSES}
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <ul className="space-y-3">
                {lines.map(view => (
                    <ScanReviewLineCard
                        key={view.line.id}
                        view={view}
                        editing={editing}
                        onUpdateLine={onUpdateLine}
                        onRemoveLine={onRemoveLine}
                        onEditing={setEditing}
                    />
                ))}
            </ul>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                        Total de la compra
                    </span>
                    <span className="text-lg font-black text-slate-900">{`$${formatCurrency(purchaseTotal)}`}</span>
                </div>
                <button
                    type="button"
                    onClick={onConfirm}
                    onKeyDown={handleKeyActivation(onConfirm)}
                    tabIndex={0}
                    aria-label="Confirmar los productos de la compra"
                    className={`${SCAN_PRIMARY_ACTION_CLASSES} mt-3 w-full`}
                >
                    Confirmar
                </button>
            </div>
        </div>
    );
};

export default ScanReviewStep;
