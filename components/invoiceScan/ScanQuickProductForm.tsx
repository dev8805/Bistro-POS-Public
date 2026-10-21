import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Category, Product } from '../../hooks/useProducts';
import type { NewProductDraft } from '../../lib/invoiceScan/types';
import { isValidBarcode } from '../../lib/invoiceScan/barcodeValidation';
import { capitalizeWords } from '../../lib/formatters';
import { norm } from '../expense/scanExpense.logic';
import { formatWithThousands, parseCleanNumber } from '../expense/shared';
import { BarcodeScanner } from '../BarcodeScanner';
import { CategorySelector } from '../CategorySelector';
import {
    SCAN_AUTOFOCUS_ATTRIBUTE,
    SCAN_PRIMARY_ACTION_CLASSES,
    SCAN_SECONDARY_ACTION_CLASSES,
} from './ScanStepShell';

/**
 * Creacion_Rapida_Producto: vista interna del Resolutor_Producto (Req 7.11).
 *
 * Componente presentacional puro. No consume `useInvoiceScanDraft`, no llama a
 * `useProducts` y no hace fetch: recibe el `Nombre_OCR`, el costo por
 * Unidad_Venta ya derivado, las categorías del Negocio_Activo y el catálogo
 * (para la advertencia de duplicado) por prop, y entrega el `NewProductDraft`
 * por callback. Quien lo cablea es `ScanLineResolverStep`, que a su vez recibe
 * todo de `screens/InvoiceScanScreen.tsx`. Así el formulario solo puede mostrar
 * datos del negocio que su host le pasó (Req 17.14).
 *
 * No navega a `SimpleProductScreen` ni a ninguna pantalla del catálogo: se
 * renderiza dentro del mismo paso del escaneo (Req 6.11, 7.11, 16.1).
 *
 * Campos heredados de `SimpleProductScreen` para que el producto nuevo sea
 * indistinguible de uno creado a mano: nombre, categoría, Unidad_Venta (mismas
 * diez opciones del `<select>` de esa pantalla), costo por Unidad_Venta y
 * precio de venta. Lo que NO tiene, por decisión del Requisito 7.10: imagen,
 * código de barras y apodos, que quedan para la edición posterior del producto.
 * El stock inicial no es un campo: siempre es cero y la cantidad la aporta el
 * lote de la compra (Req 7.6), así que ni se muestra ni se pregunta.
 *
 * Requisitos: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.9, 7.10, 7.11, 16.6.
 */

/** Categoría del Negocio_Activo tal como la necesita el selector. */
export type ScanQuickCategory = Pick<Category, 'id' | 'name'>;

/** Producto del catálogo, con lo mínimo para detectar el nombre duplicado. */
export type ScanQuickProductMatch = Pick<Product, 'id' | 'name' | 'barcode'>;

/** Info del proveedor para el formulario rápido. */
export type ScanQuickSupplierData =
    | { kind: 'existing'; id: string; name: string }
    | { kind: 'new'; name: string; nit: string; phone: string }
    | null;

export interface ScanQuickProductFormProps {
    /** Nombre leído en la factura. Prellena el campo nombre (Req 7.2). */
    ocrName: string;
    /** Costo_Neto_Linea por Unidad_Venta, ya derivado por el resolutor (Req 7.2). */
    defaultCost: number;
    /** Categorías del Negocio_Activo, ya filtradas por el host (Req 17.14). */
    categories: ScanQuickCategory[];
    /** Notifica cambios en la lista de categorías (creación/edición/eliminación) */
    onCategoriesChange?: (categories: ScanQuickCategory[]) => void;
    /** Catálogo del Negocio_Activo para la advertencia de duplicado (Req 7.9). */
    products: ScanQuickProductMatch[];
    /** Crea el producto y vincula la línea (Req 7.7, 7.8). */
    onCreate: (draft: NewProductDraft) => void;
    /** Vincula la línea al producto existente que provocó la advertencia (Req 7.9). */
    onLinkExisting: (productId: string) => void;
    /** Codigo_Barras_Linea extraído por la IA, para prellenar el campo. */
    defaultBarcode?: string;
    /** Info del proveedor ya resuelto en ScanSupplierStep. Solo se muestra como referencia. */
    supplierData?: ScanQuickSupplierData;
    /** Nombre comercial sugerido sin menciones de empaque mayorista. */
    suggestedName?: string;
    /** Factor de conversión de empaque detectado (> 1) para tiendas de barrio. */
    detectedFactor?: number;
    /** Nombre de la unidad de empaque (ej: 'Caja', 'Paca'). */
    packagingUnit?: string;
    /** Navegar al formulario completo con datos prellenados. */
    onOpenFullForm?: (partialDraft: QuickFormPartialDraft) => void;
}

/** Datos que el formulario rápido pasa al iniciar la navegación al completo. */
export interface QuickFormPartialDraft {
    name: string;
    cost: number;
    barcode: string;
    isForSale: boolean;
    categoryId: string;
    unit: string;
}

/** Campos que pueden mostrar error una vez el Usuario los toca. */
type QuickField = 'name' | 'category' | 'unit' | 'cost' | 'price';

/** Mismas diez opciones de Unidad_Venta que ofrece `SimpleProductScreen`. */
const SALE_UNIT_OPTIONS: { value: string; label: string }[] = [
    { value: 'Unidad', label: 'Unidad' },
    { value: 'Kilogramos', label: 'Kilogramos (kg)' },
    { value: 'Libras', label: 'Libras (lb)' },
    { value: 'Gramos', label: 'Gramos (g)' },
    { value: 'Onzas', label: 'Onzas (oz)' },
    { value: 'Arrobas', label: 'Arrobas (@)' },
    { value: 'Litros', label: 'Litros (L)' },
    { value: 'Mililitros', label: 'Mililitros (ml)' },
    { value: 'Galones', label: 'Galones (gal)' },
    { value: 'Metros', label: 'Metros (m)' },
];

const DEFAULT_SALE_UNIT = 'Unidad';

const NO_DIRTY_FIELDS: Record<QuickField, boolean> = {
    name: false,
    category: false,
    unit: false,
    cost: false,
    price: false,
};

const LABEL_CLASSES = 'mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500';

const INPUT_BASE_CLASSES =
    'block min-h-[44px] w-full rounded-2xl border bg-white px-4 text-sm font-semibold text-slate-900 placeholder:font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2';

const OK_BORDER_CLASSES = 'border-slate-300 focus:border-amber-400 focus:ring-amber-200';
const ERROR_BORDER_CLASSES = 'border-rose-300 focus:border-rose-500 focus:ring-rose-200';

const ERROR_TEXT_CLASSES = 'mt-1 text-[11px] font-bold leading-snug text-rose-600';

const DESTINATION_BASE_CLASSES =
    'flex min-h-[44px] flex-1 flex-col items-start justify-center rounded-2xl border px-4 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-amber-300';

const DESTINATION_ON_CLASSES = 'border-emerald-500 bg-emerald-50';
const DESTINATION_OFF_CLASSES = 'border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50';

/** Marca del campo que recibe el foco al entrar a la vista. */
const AUTOFOCUS_PROPS: Record<string, string> = { [SCAN_AUTOFOCUS_ATTRIBUTE]: '' };

const isActivationKey = (key: string): boolean => key === 'Enter' || key === ' ' || key === 'Spacebar';

const inputClasses = (hasError: boolean): string =>
    `${INPUT_BASE_CLASSES} ${hasError ? ERROR_BORDER_CLASSES : OK_BORDER_CLASSES}`;

/** El costo se edita en pesos enteros, igual que el resto de los montos del POS. */
const toCostDigits = (value: number): string => {
    if (!Number.isFinite(value) || value <= 0) return '';
    return String(Math.round(value));
};

/** "a", "a y b", "a, b y c". */
const joinWithY = (parts: string[]): string => {
    if (parts.length <= 1) return parts[0] ?? '';
    return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
};

export const ScanQuickProductForm: React.FC<ScanQuickProductFormProps> = ({
    ocrName,
    defaultCost,
    categories,
    onCategoriesChange,
    products,
    onCreate,
    onLinkExisting,
    defaultBarcode,
    supplierData,
    suggestedName,
    detectedFactor,
    packagingUnit,
    onOpenFullForm,
}) => {
    const initialName = useMemo(() => {
        const base = (suggestedName && suggestedName.trim() !== '') ? suggestedName : ocrName;
        const trimmed = base.trim().replace(/\s+/g, ' ');
        const isAllUpper = trimmed.length > 0 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
        return isAllUpper ? capitalizeWords(trimmed) : trimmed;
    }, [suggestedName, ocrName]);

    const [name, setName] = useState(initialName);
    const [categoryId, setCategoryId] = useState('');
    const [unit, setUnit] = useState(DEFAULT_SALE_UNIT);
    const [costDigits, setCostDigits] = useState(() => toCostDigits(defaultCost));
    const [priceDigits, setPriceDigits] = useState('');
    const [isForSale, setIsForSale] = useState(true);
    const [barcode, setBarcode] = useState(defaultBarcode || '');
    const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
    const [dirty, setDirty] = useState<Record<QuickField, boolean>>(NO_DIRTY_FIELDS);

    const nameRef = useRef<HTMLInputElement>(null);

    // El nombre es el campo principal de la vista: recibe el foco al abrirla.
    useEffect(() => {
        nameRef.current?.focus();
    }, []);

    const trimmedName = name.trim();
    const cost = Number(costDigits || '0');
    const price = Number(priceDigits || '0');

    const nameInvalid = trimmedName === '';
    const categoryInvalid = categoryId === '';
    const unitInvalid = unit.trim() === '';
    const costInvalid = !(cost > 0);
    const priceInvalid = isForSale && !(price > 0);
    const hasSupplier = supplierData !== null && supplierData !== undefined;
    const canCreate = !nameInvalid && !categoryInvalid && !unitInvalid && !costInvalid && !priceInvalid && hasSupplier;

    const missingLabel = useMemo(() => {
        const parts: string[] = [];
        if (nameInvalid) parts.push('el nombre');
        if (categoryInvalid) parts.push('la categoría');
        if (unitInvalid) parts.push('la unidad de venta');
        if (costInvalid) parts.push('un costo mayor que cero');
        if (priceInvalid) parts.push('un precio de venta mayor que cero');
        if (!hasSupplier) parts.push('un proveedor');
        return joinWithY(parts);
    }, [nameInvalid, categoryInvalid, unitInvalid, costInvalid, priceInvalid, hasSupplier]);

    /** Producto del catálogo cuyo nombre coincide con el escrito (Req 7.9). */
    const duplicate = useMemo(() => {
        const query = norm(trimmedName);
        if (!query) return null;
        return products.find((p) => norm(p.name) === query) ?? null;
    }, [products, trimmedName]);

    /** Barcode inválido (ni vacío ni 8-14 dígitos). */
    const barcodeInvalid = barcode !== '' && !isValidBarcode(barcode);

    /** Producto existente con el mismo barcode (Req 3.6). */
    const barcodeDuplicate = useMemo(() => {
        if (!barcode || barcodeInvalid) return null;
        return products.find((p) => p.barcode === barcode) ?? null;
    }, [barcode, barcodeInvalid, products]);

    const markDirty = (field: QuickField) => {
        setDirty((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
    };

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setName(e.target.value);
        markDirty('name');
    };

    const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setCategoryId(e.target.value);
        markDirty('category');
    };

    const handleUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setUnit(e.target.value);
        markDirty('unit');
    };

    const handleCostChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCostDigits(parseCleanNumber(e.target.value));
        markDirty('cost');
    };

    const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPriceDigits(parseCleanNumber(e.target.value));
        markDirty('price');
    };

    const handleForSale = () => setIsForSale(true);
    const handleInsumo = () => setIsForSale(false);

    const handleCreate = () => {
        if (!canCreate) return;
        // Destino "Insumo": el producto no se vende, así que su precio es cero
        // y `is_for_sale` queda en falso (Req 7.5).
        onCreate({
            name: trimmedName,
            categoryId,
            unit,
            cost,
            price: isForSale ? price : 0,
            isForSale,
            barcode: isValidBarcode(barcode) ? barcode : '',
            purchaseUnit: detectedFactor && detectedFactor > 1
                ? { unit_name: packagingUnit || 'Empaque', conversion_factor: detectedFactor }
                : undefined,
        });
    };

    const handleLinkDuplicate = () => {
        if (!duplicate) return;
        onLinkExisting(duplicate.id);
    };

    const handleKeyActivation = (action: () => void) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        action();
    };

    const showNameError = nameInvalid && dirty.name;
    const showCategoryError = categoryInvalid && dirty.category;
    const showCostError = costInvalid && dirty.cost;
    const showPriceError = priceInvalid && dirty.price;

    return (
        <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-x-5 lg:gap-y-4">
            {detectedFactor && detectedFactor > 1 && (
                <div className="lg:col-span-2 flex items-start gap-2.5 rounded-2xl border border-sky-200 bg-sky-50/80 p-3 text-xs text-sky-900">
                    <span className="material-symbols-outlined text-base text-sky-600 shrink-0 mt-0.5" aria-hidden="true">
                        inventory_2
                    </span>
                    <div className="space-y-0.5">
                        <p className="font-bold">
                            Empaque detectado: {packagingUnit || 'Empaque'} x{detectedFactor}
                        </p>
                        <p className="text-[11px] text-sky-700 leading-relaxed">
                            Calculamos el costo por unidad suelta para venta al detal. Puedes ajustar el nombre y costos si lo deseas.
                        </p>
                    </div>
                </div>
            )}

            {/* Nombre, prellenado con el Nombre_OCR (Req 7.2) */}
            <div className="lg:col-span-2">
                <label htmlFor="scan-quick-name" className={LABEL_CLASSES}>
                    Nombre del producto
                </label>
                <input
                    id="scan-quick-name"
                    ref={nameRef}
                    type="text"
                    value={name}
                    onChange={handleNameChange}
                    placeholder="Nombre del producto"
                    aria-label="Nombre del producto nuevo"
                    aria-invalid={showNameError}
                    aria-describedby={showNameError ? 'scan-quick-name-error' : undefined}
                    className={inputClasses(showNameError)}
                    {...AUTOFOCUS_PROPS}
                />
                {showNameError && (
                    <p id="scan-quick-name-error" className={ERROR_TEXT_CLASSES}>
                        Escribe el nombre del producto.
                    </p>
                )}
            </div>

            {/* Advertencia de nombre duplicado con opción de vincular (Req 7.9) */}
            {duplicate && (
                <div className="lg:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-black text-slate-900">Ya tienes un producto con ese nombre</p>
                    <p className="mt-1 text-xs font-semibold leading-snug text-slate-600">
                        {`"${duplicate.name}" ya está en tu catálogo. Si es el mismo, vincula la línea a ese producto en vez de crear uno repetido.`}
                    </p>
                    <button
                        type="button"
                        onClick={handleLinkDuplicate}
                        onKeyDown={handleKeyActivation(handleLinkDuplicate)}
                        tabIndex={0}
                        aria-label={`Vincular la línea al producto ${duplicate.name}`}
                        className={`${SCAN_SECONDARY_ACTION_CLASSES} mt-3 w-full lg:max-w-md lg:mx-auto lg:block`}
                    >
                        {`Vincular a "${duplicate.name}"`}
                    </button>
                </div>
            )}

            {/* Categoría del Negocio_Activo */}
            <div className="lg:col-span-1">
                <CategorySelector
                    id="scan-quick-category"
                    value={categoryId}
                    onChange={(catId) => {
                        setCategoryId(catId);
                        markDirty('category');
                    }}
                    error={showCategoryError}
                    label="Categoría"
                    labelClassName={LABEL_CLASSES}
                    ariaLabel="Categoría del producto nuevo"
                    placeholder="Elige una categoría"
                    initialCategories={categories}
                    onCategoriesChange={onCategoriesChange}
                    containerClassName="relative"
                    triggerClassName={`w-full h-11 pl-4 pr-10 flex items-center text-sm font-semibold bg-white border ${showCategoryError ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200' : 'border-slate-300 focus:border-amber-400 focus:ring-amber-200'} rounded-2xl focus:ring-2 transition-colors cursor-pointer text-slate-900 select-none relative`}
                    createButtonClassName="h-11 px-3.5 flex items-center justify-center gap-1 rounded-2xl bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold transition-colors shrink-0 text-sm shadow-xs"
                />
                {showCategoryError && (
                    <p id="scan-quick-category-error" className={ERROR_TEXT_CLASSES}>
                        Elige la categoría del producto.
                    </p>
                )}
            </div>

            {/* Unidad_Venta */}
            <div className="lg:col-span-1">
                <label htmlFor="scan-quick-unit" className={LABEL_CLASSES}>
                    Unidad de venta
                </label>
                <select
                    id="scan-quick-unit"
                    value={unit}
                    onChange={handleUnitChange}
                    aria-label="Unidad de venta del producto nuevo"
                    className={`${inputClasses(false)} h-11`}
                >
                    {SALE_UNIT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </select>
                <p className="mt-1 text-[11px] font-semibold leading-snug text-slate-500 lg:hidden">
                    Es la unidad con la que controlas el stock y vendes el producto.
                </p>
            </div>

            {/* ── Proveedor (resuelto en ScanSupplierStep, aquí solo se muestra) ── */}
            <div className="lg:col-span-1">
                <p className={LABEL_CLASSES}>Proveedor</p>
                {supplierData ? (
                    <div className={`${INPUT_BASE_CLASSES} ${OK_BORDER_CLASSES} flex items-center gap-2 bg-slate-50 cursor-default`}>
                        <span className="material-symbols-outlined text-base text-emerald-500">check_circle</span>
                        <span className="truncate text-slate-700 font-semibold">{supplierData.name}</span>
                        {supplierData.kind === 'new' && (
                            <span className="ml-auto text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">Nuevo</span>
                        )}
                    </div>
                ) : (
                    <p className="text-[11px] font-bold text-rose-600">Sin proveedor — regresa al paso anterior.</p>
                )}
            </div>

            {/* Código de barras (editable + scanner, sin lookup en BD) */}
            <div className="lg:col-span-1">
                <label htmlFor="scan-quick-barcode" className={LABEL_CLASSES}>
                    Código de barras
                </label>
                <div className="flex gap-2">
                    <input
                        id="scan-quick-barcode"
                        type="text"
                        inputMode="numeric"
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value.replace(/\D/g, '').slice(0, 14))}
                        placeholder="EAN-13 (opcional)"
                        aria-label="Código de barras del producto nuevo"
                        aria-invalid={barcodeInvalid}
                        aria-describedby={
                            barcodeInvalid ? 'scan-quick-barcode-error' :
                            barcodeDuplicate ? 'scan-quick-barcode-warn' : undefined
                        }
                        className={`flex-1 ${inputClasses(barcodeInvalid)}`}
                    />
                    <button
                        type="button"
                        onClick={() => setShowBarcodeScanner(true)}
                        className="size-[44px] shrink-0 rounded-2xl border border-slate-300 bg-white flex items-center justify-center text-slate-600 hover:border-amber-400 hover:bg-amber-50 transition-colors"
                        aria-label="Escanear código de barras"
                        tabIndex={0}
                    >
                        <span className="material-symbols-outlined text-xl">qr_code_scanner</span>
                    </button>
                </div>
                {barcodeInvalid && (
                    <p id="scan-quick-barcode-error" className={ERROR_TEXT_CLASSES}>
                        El código debe tener entre 8 y 14 dígitos.
                    </p>
                )}
                {barcodeDuplicate && !barcodeInvalid && (
                    <p id="scan-quick-barcode-warn" className="mt-1 text-[11px] font-bold leading-snug text-amber-600">
                        {`⚠️ Ya existe en "${barcodeDuplicate.name}". Puedes continuar o corregir.`}
                    </p>
                )}
            </div>

            {/* Destino del producto (Req 7.1, 7.5) */}
            <div className="lg:col-span-2">
                <p className={LABEL_CLASSES}>Destino del producto</p>
                <div className="grid grid-cols-2 gap-3" role="group" aria-label="Destino del producto nuevo">
                    <button
                        type="button"
                        onClick={handleForSale}
                        onKeyDown={handleKeyActivation(handleForSale)}
                        tabIndex={0}
                        aria-pressed={isForSale}
                        aria-label="Para venta"
                        className={`${DESTINATION_BASE_CLASSES} ${isForSale ? DESTINATION_ON_CLASSES : DESTINATION_OFF_CLASSES}`}
                    >
                        <span className="text-sm font-black text-slate-900">Para venta</span>
                        <span className="text-[10px] font-semibold text-slate-500">Se vende en el POS</span>
                    </button>
                    <button
                        type="button"
                        onClick={handleInsumo}
                        onKeyDown={handleKeyActivation(handleInsumo)}
                        tabIndex={0}
                        aria-pressed={!isForSale}
                        aria-label="Insumo"
                        className={`${DESTINATION_BASE_CLASSES} ${!isForSale ? DESTINATION_ON_CLASSES : DESTINATION_OFF_CLASSES}`}
                    >
                        <span className="text-sm font-black text-slate-900">Insumo</span>
                        <span className="text-[10px] font-semibold text-slate-500">Solo entra al inventario</span>
                    </button>
                </div>
            </div>

            {/* Costo por Unidad_Venta, prellenado con el Costo_Neto_Linea (Req 7.2) */}
            <div className="lg:col-span-1">
                <label htmlFor="scan-quick-cost" className={LABEL_CLASSES}>
                    {`Costo por ${unit}`}
                </label>
                <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                        $
                    </span>
                    <input
                        id="scan-quick-cost"
                        type="text"
                        inputMode="numeric"
                        value={formatWithThousands(costDigits)}
                        onChange={handleCostChange}
                        placeholder="0"
                        aria-label={`Costo por ${unit} del producto nuevo`}
                        aria-invalid={showCostError}
                        aria-describedby={showCostError ? 'scan-quick-cost-error' : undefined}
                        className={`${inputClasses(showCostError)} pl-8`}
                    />
                </div>
                {showCostError ? (
                    <p id="scan-quick-cost-error" className={ERROR_TEXT_CLASSES}>
                        El costo tiene que ser mayor que cero.
                    </p>
                ) : (
                    <p className="mt-1 text-[11px] font-semibold leading-snug text-slate-500">
                        Viene de la factura, con los impuestos ya incluidos. Puedes cambiarlo.
                    </p>
                )}
            </div>

            {/* Precio de venta: obligatorio cuando destino es "Para venta" (Req 7.4, 7.5) */}
            <div className="lg:col-span-1">
                {isForSale ? (
                    <div>
                        <label htmlFor="scan-quick-price" className={LABEL_CLASSES}>
                            Precio de venta *
                        </label>
                        <div className="relative">
                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                                $
                            </span>
                            <input
                                id="scan-quick-price"
                                type="text"
                                inputMode="numeric"
                                value={formatWithThousands(priceDigits)}
                                onChange={handlePriceChange}
                                placeholder="0"
                                aria-label="Precio de venta del producto nuevo"
                                aria-invalid={showPriceError}
                                aria-describedby={showPriceError ? 'scan-quick-price-error' : undefined}
                                className={`${inputClasses(showPriceError)} pl-8`}
                            />
                        </div>
                        {showPriceError && (
                            <p id="scan-quick-price-error" className={ERROR_TEXT_CLASSES}>
                                El precio de venta es obligatorio para productos en venta.
                            </p>
                        )}
                    </div>
                ) : (
                    <div>
                        <p className={LABEL_CLASSES}>Precio de venta</p>
                        <div className="flex min-h-[44px] items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-[11px] font-semibold leading-snug text-slate-500">
                            Como es un insumo, no se vende: queda sin precio de venta y solo suma al inventario.
                        </div>
                    </div>
                )}
            </div>

            <p className="lg:col-span-2 text-[11px] font-semibold leading-snug text-slate-500">
                El stock arranca en cero y la cantidad de esta factura la suma la compra. La foto y los apodos los
                agregas después editando el producto.
            </p>

            {!canCreate && (
                <p className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-bold leading-snug text-slate-600">
                    {`Para crear el producto falta ${missingLabel}.`}
                </p>
            )}

            <div className="lg:col-span-2 flex flex-col items-center justify-center gap-2 pt-2">
                <button
                    type="button"
                    onClick={handleCreate}
                    onKeyDown={handleKeyActivation(handleCreate)}
                    disabled={!canCreate}
                    aria-disabled={!canCreate}
                    tabIndex={0}
                    aria-label="Crear el producto y continuar"
                    className={`${SCAN_PRIMARY_ACTION_CLASSES} w-full max-w-md mx-auto`}
                >
                    Crear y continuar
                </button>

                {/* Abrir formulario completo */}
                {onOpenFullForm && (
                    <button
                        type="button"
                        onClick={() => onOpenFullForm({
                            name: name.trim(),
                            cost: parseCleanNumber(costDigits) ? Number(parseCleanNumber(costDigits)) : 0,
                            barcode: isValidBarcode(barcode) ? barcode : '',
                            isForSale,
                            categoryId,
                            unit,
                        })}
                        tabIndex={0}
                        aria-label="Abrir formulario completo de creación de producto"
                        className="w-auto mx-auto text-center text-xs font-bold text-amber-700 hover:text-amber-900 underline underline-offset-2 py-2 transition-colors"
                    >
                        Abrir formulario completo →
                    </button>
                )}
            </div>

            {/* BarcodeScanner modal */}
            {showBarcodeScanner && (
                <BarcodeScanner
                    onScan={(code) => {
                        setBarcode(code);
                        setShowBarcodeScanner(false);
                    }}
                    onClose={() => setShowBarcodeScanner(false)}
                />
            )}
        </div>
    );
};

export default ScanQuickProductForm;
