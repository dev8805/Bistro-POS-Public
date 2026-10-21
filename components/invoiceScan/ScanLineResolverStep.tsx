import React, { useEffect, useMemo, useState } from 'react';
import {
    ScanStepShell,
    SCAN_PRIMARY_ACTION_CLASSES,
    SCAN_SECONDARY_ACTION_CLASSES,
} from './ScanStepShell';
import { ScanQuickProductForm, type ScanQuickCategory, type ScanQuickSupplierData, type QuickFormPartialDraft } from './ScanQuickProductForm';
import {
    ScanProductPickerSheet,
    type ScanNicknameOwner,
    type ScanPickerProduct,
} from './ScanProductPickerSheet';
import { ScanUnitEquivalenceForm } from './ScanUnitEquivalenceForm';
import { formatCurrency, formatQty } from '../../lib/formatters';
import { cleanPackagingFromName, extractConversionFactorFromName } from '../../lib/invoiceScan/unitMatch';
import type { NewProductDraft, ScanLine, ScanProgress } from '../../lib/invoiceScan/types';

/**
 * Resolutor_Producto: presenta UNA sola Linea_Factura pendiente a la vez y
 * resuelve su decisión dentro del mismo paso del escaneo, sin navegar fuera
 * (Req 6.3, 6.11, 7.11, 16.1).
 *
 * ## Máquina de sub-vistas interna
 *
 * El paso es un contenedor con cuatro sub-vistas, todas dentro del mismo
 * `ScanStepShell`:
 *
 *   decide ──"Crear producto rápido"──▶ create  (ScanQuickProductForm)
 *     │
 *     ├────"Es un producto que ya tengo"─▶ pick  (ScanProductPickerSheet)
 *     │
 *     └────"Omitir esta línea"───────────▶ onSkip (sale del paso)
 *
 *   create / pick ──host detecta unidad desconocida──▶ equivalence
 *                                                       (ScanUnitEquivalenceForm)
 *
 * - `decide`, `create` y `pick` son navegación **interna** (el Usuario tocó una
 *   de las tres acciones o el botón atrás). El resolutor las controla con su
 *   propio estado `view`.
 * - `equivalence` la decide el **host** (`InvoiceScanScreen`, tarea 5.8): tras
 *   `onCreate`/`onLink`, el host calcula el caso de unidad con `detectUnitCase`
 *   sobre el producto vinculado y, cuando es una Unidad_OCR desconocida
 *   (Req 9.3, 9.4), pasa el objeto `equivalence` (no nulo). Se prefiere recibir
 *   la equivalencia ya calculada por prop antes que recalcularla aquí, para no
 *   duplicar la lógica de detección de unidad. Mientras `equivalence` sea no
 *   nulo, el paso muestra el `ScanUnitEquivalenceForm`, cualquiera sea la
 *   sub-vista interna.
 *
 * ## Presentacional
 *
 * No consume `useInvoiceScanDraft`, no llama a `useProducts` ni a `useSuppliers`
 * y no hace fetch. Recibe la línea actual, el progreso, el catálogo y las
 * categorías del Negocio_Activo (para los sub-formularios) y el `nicknameOwner`
 * ya calculado, y entrega cada decisión por callback. Así solo muestra datos del
 * negocio que su host le pasó (Req 17.14) y no contiene lógica de registro.
 *
 * Solo llegan aquí las líneas SIN coincidencia en el catálogo: las que
 * emparejan se resuelven en el hook y no pasan por el resolutor (Req 6.2). Por
 * eso la sub-vista `decide` siempre ofrece las tres acciones del Req 6.6.
 *
 * Requisitos: 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.11, 6.12, 7.11, 8.x, 9.3, 9.4,
 * 9.7, 9.8, 9.9, 9.10, 9.11, 16.1, 16.6, 17.14.
 */

/**
 * Datos que el host pasa cuando la línea vinculada trae una Unidad_OCR
 * desconocida y hay que preguntar el Factor_Conversion (Req 9.3, 9.4). `null`
 * mantiene el paso en la fase de decisión.
 */
export interface ScanEquivalencePrompt {
    /** Unidad_OCR leída en la factura. */
    ocrUnit: string;
    /** Unidad_Venta del producto vinculado o recién creado. */
    saleUnit: string;
    /** Nombre del producto vinculado o recién creado. */
    productName: string;
    /** Cantidad leída, en Unidad_OCR. */
    ocrQuantity: number;
    /** Costo_Neto_Linea de la línea (pesos), en términos de la Unidad_OCR. */
    ocrLineTotal: number;
}

export interface ScanLineResolverStepProps {
    /** Línea pendiente actual. Siempre es una línea sin coincidencia (Req 6.3). */
    line: ScanLine;
    /** Progreso "Línea i de n", contando solo líneas pendientes (Req 6.4). */
    progress: ScanProgress;
    /** Categorías del Negocio_Activo para la Creacion_Rapida_Producto (Req 17.14). */
    categories: ScanQuickCategory[];
    /** Callback opcional para notificar cambios en las categorías (creación/edición/eliminación) */
    onCategoriesChange?: (categories: ScanQuickCategory[]) => void;
    /** Catálogo del Negocio_Activo para el buscador y la advertencia de duplicado. */
    products: ScanPickerProduct[];
    /** Dueño actual del Apodo, ya calculado por el host (Req 8.5, 8.6). */
    nicknameOwner: ScanNicknameOwner | null;
    /** Modo equivalencia: no nulo ⇒ se muestra la pregunta del factor (Req 9.3). */
    equivalence: ScanEquivalencePrompt | null;
    /** Si el `ScanStepShell` permite retroceder desde la sub-vista `decide`. */
    canGoBack: boolean;
    /** Info del proveedor del encabezado para el formulario rápido. */
    supplierData?: ScanQuickSupplierData;
    /** Callback para abrir el formulario completo (SimpleProductScreen) con datos prellenados. */
    onOpenFullForm?: (partialDraft: QuickFormPartialDraft) => void;
    /** Crea el producto y vincula la línea (Req 7.7, 7.8). */
    onCreate: (draft: NewProductDraft) => void;
    /** Vincula la línea al producto existente de la advertencia de duplicado (Req 7.9). */
    onLinkExisting: (productId: string) => void;
    /** Vincula la línea por el buscador, con o sin Apodo (Req 8.2, 8.3). */
    onLink: (productId: string, addNickname: boolean) => void;
    /** Omite la línea: queda fuera del inventario y del total (Req 6.7, 6.12). */
    onSkip: () => void;
    /** Confirma el Factor_Conversion de la equivalencia (Req 9.7, 9.11, 9.12). */
    onConfirmEquivalence: (factor: number) => void;
    /** Regresa a la línea anterior y reabre su decisión (Req 6.8). */
    onPreviousLine: () => void;
    /** Botón atrás del `ScanStepShell` desde la sub-vista `decide`. */
    onBack: () => void;
    /** Cierra el escaneo (Req 1.5). */
    onClose: () => void;
}

/** Sub-vistas de navegación interna. `equivalence` la gobierna la prop del host. */
type ResolverView = 'decide' | 'create' | 'pick';

const SKIP_ACTION_CLASSES =
    'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-100 active:scale-[0.99]';

const isActivationKey = (key: string): boolean => key === 'Enter' || key === ' ' || key === 'Spacebar';

const VIEW_TITLES: Record<ResolverView | 'equivalence', string> = {
    decide: 'Resuelve esta línea',
    create: 'Crear producto rápido',
    pick: 'Es un producto que ya tengo',
    equivalence: 'Equivalencia del empaque',
};

export const ScanLineResolverStep: React.FC<ScanLineResolverStepProps> = ({
    line,
    progress,
    categories,
    onCategoriesChange,
    products,
    nicknameOwner,
    equivalence,
    canGoBack,
    supplierData,
    onOpenFullForm,
    onCreate,
    onLinkExisting,
    onLink,
    onSkip,
    onConfirmEquivalence,
    onPreviousLine,
    onBack,
    onClose,
}) => {
    const [view, setView] = useState<ResolverView>('decide');
    const [liveCategories, setLiveCategories] = useState<ScanQuickCategory[]>(categories);

    useEffect(() => {
        setLiveCategories(prev => {
            const prevIds = new Set(prev.map(c => c.id));
            const newFromProps = categories.filter(c => !prevIds.has(c.id));
            if (newFromProps.length > 0) {
                return [...prev, ...newFromProps].sort((a, b) => a.name.localeCompare(b.name));
            }
            return prev.length === 0 ? categories : prev;
        });
    }, [categories]);

    const handleCategoriesChange = (updated: ScanQuickCategory[]) => {
        setLiveCategories(updated);
        onCategoriesChange?.(updated);
    };

    // Cada línea nueva reabre en la fase de decisión: el índice de la línea es la
    // fuente de verdad de "empezamos de cero con esta línea".
    useEffect(() => {
        setView('decide');
    }, [line.id]);

    const inEquivalence = equivalence !== null;

    /** Costo_Neto_Linea efectivo de la línea: neto menos su parte del descuento global. */
    const netCost = useMemo(
        () => Math.max(0, line.netTotal - line.globalDiscountShare),
        [line.netTotal, line.globalDiscountShare],
    );

    /** Factor de empaque deducido por la IA o por el nombre de la línea. */
    const packagingFactor = useMemo(() => {
        if (typeof line.aiConversionFactor === 'number' && line.aiConversionFactor >= 1) {
            return line.aiConversionFactor;
        }
        const isBulk = Boolean(
            line.ocrUnit && /^(cj|caja|paca|display|disp|sixpack|pack|bulto|cubeta)$/i.test(line.ocrUnit.trim())
        );
        if (isBulk) {
            return extractConversionFactorFromName(line.ocrName) ?? 1;
        }
        return 1;
    }, [line.aiConversionFactor, line.ocrName, line.ocrUnit]);

    /**
     * Costo por Unidad_Venta con el que se prellena la Creacion_Rapida_Producto.
     * Si la línea indica un empaque mayorista (ej. Caja x 24), se divide el costo neto
     * entre el total de unidades sueltas (ocrQuantity × factor) para tiendas de barrio.
     */
    const defaultProductCost = useMemo(() => {
        const totalUnits = line.ocrQuantity * packagingFactor;
        return totalUnits > 0 ? netCost / totalUnits : netCost;
    }, [netCost, line.ocrQuantity, packagingFactor]);

    /** Nombre sugerido sin menciones de empaque mayorista para la venta al detal. */
    const suggestedProductName = useMemo(
        () => cleanPackagingFromName(line.ocrName),
        [line.ocrName],
    );

    /** Unidad de empaque para mostrar (ej. 'Caja', 'Paca'). */
    const packagingUnit = useMemo(() => {
        if (line.ocrUnit.trim() !== '') return line.ocrUnit.trim();
        return packagingFactor > 1 ? 'Empaque' : undefined;
    }, [line.ocrUnit, packagingFactor]);

    const canGoToPreviousLine = progress.current > 1;
    const hasOcrUnit = line.ocrUnit.trim() !== '';

    /** Productos candidatos sugeridos por la IA en caso de ambigüedad. */
    const candidateProducts = useMemo(() => {
        if (!line.candidateIds || line.candidateIds.length === 0) return [];
        return line.candidateIds
            .map(id => products.find(p => p.id === id))
            .filter((p): p is ScanPickerProduct => p !== undefined && p.type === 'simple');
    }, [line.candidateIds, products]);

    const activeView: ResolverView | 'equivalence' = inEquivalence ? 'equivalence' : view;

    // El botón atrás del shell sale de las sub-vistas hacia `decide`; en `decide`
    // (o en equivalencia) delega en el host.
    const handleShellBack = () => {
        if (!inEquivalence && (view === 'create' || view === 'pick')) {
            setView('decide');
            return;
        }
        onBack();
    };

    // Desde `create`/`pick` siempre se puede volver a `decide`; en `decide` manda
    // el `canGoBack` del host.
    const shellCanGoBack = !inEquivalence && (view === 'create' || view === 'pick') ? true : canGoBack;

    const handleChooseCreate = () => setView('create');
    const handleChoosePick = () => setView('pick');

    const handleActionKeyDown = (action: () => void) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        action();
    };

    const decideFooter =
        activeView === 'decide' ? (
            <button
                type="button"
                onClick={onPreviousLine}
                onKeyDown={handleActionKeyDown(onPreviousLine)}
                disabled={!canGoToPreviousLine}
                aria-disabled={!canGoToPreviousLine}
                tabIndex={0}
                aria-label="Volver a la línea anterior"
                className={`${SCAN_SECONDARY_ACTION_CLASSES} w-full lg:max-w-md lg:mx-auto`}
            >
                Volver a la línea anterior
            </button>
        ) : undefined;

    return (
        <ScanStepShell
            step="lineResolver"
            title={VIEW_TITLES[activeView]}
            progress={progress}
            counterLabel="line"
            canGoBack={shellCanGoBack}
            onBack={handleShellBack}
            onClose={onClose}
            autoFocusTarget={activeView === 'decide' ? 'heading' : 'field'}
            footer={decideFooter}
        >
            {activeView === 'decide' && (
                <div className="space-y-4">
                    {/* Datos de la línea: Nombre_OCR, cantidad, Unidad_OCR, Costo_Neto_Linea (Req 6.4) */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="text-base font-black leading-tight text-slate-900">{line.ocrName}</p>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    Cantidad
                                </p>
                                <p className="text-sm font-bold text-slate-800">
                                    {`${formatQty(line.ocrQuantity)} ${hasOcrUnit ? line.ocrUnit : 'sin unidad'}`}
                                </p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    Costo neto
                                </p>
                                <p className="text-sm font-bold text-slate-800">{`$${formatCurrency(netCost)}`}</p>
                            </div>
                        </div>
                        {line.needsReview && (
                            <p className="mt-3 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-800">
                                Revisa la cantidad
                            </p>
                        )}
                    </div>

                    {/* Sugerencias de la IA si la línea fue ambigua */}
                    {candidateProducts.length > 0 && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                            <div className="flex items-center gap-1.5 text-amber-900">
                                <span className="material-symbols-outlined text-[18px] text-amber-600" aria-hidden="true">
                                    auto_awesome
                                </span>
                                <p className="text-xs font-black uppercase tracking-wider">
                                    Sugerencias de la IA ({candidateProducts.length})
                                </p>
                            </div>
                            <p className="text-[11px] font-medium text-slate-600">
                                La IA identificó posibles opciones para este producto. Toca una para vincularla de inmediato:
                            </p>
                            <div className="space-y-1.5">
                                {candidateProducts.map(cand => (
                                    <button
                                        key={cand.id}
                                        type="button"
                                        onClick={() => onLink(cand.id, false)}
                                        onKeyDown={handleActionKeyDown(() => onLink(cand.id, false))}
                                        tabIndex={0}
                                        aria-label={`Vincular a ${cand.name}`}
                                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-amber-200/90 bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-amber-400 hover:bg-amber-50 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs font-bold text-slate-900">{cand.name}</p>
                                            <p className="text-[10px] font-semibold text-slate-500">Unidad de venta: {cand.unit || 'Und'}</p>
                                        </div>
                                        <span className="shrink-0 text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-lg">
                                            Elegir
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Frase que explica la decisión y el efecto de cada opción (Req 6.5) */}
                    <p className="text-xs font-semibold leading-relaxed text-slate-600">
                        {candidateProducts.length > 0
                            ? 'Si no es ninguna de las sugerencias anteriores, puedes crear un producto nuevo, buscar otro en tu catálogo u omitir la línea.'
                            : `No encontramos "${line.ocrName}" en tu catálogo. Créalo rápido para sumarlo al inventario, vincúlalo a un producto que ya tengas, u omítelo para dejarlo fuera de la compra.`}
                    </p>

                    {/* Tres acciones para la línea sin coincidencia (Req 6.6) */}
                    <div className="space-y-2 lg:space-y-0 lg:grid lg:grid-cols-2 lg:gap-3">
                        <button
                            type="button"
                            onClick={handleChooseCreate}
                            onKeyDown={handleActionKeyDown(handleChooseCreate)}
                            tabIndex={0}
                            aria-label="Crear producto rápido"
                            className={`${SCAN_PRIMARY_ACTION_CLASSES} w-full`}
                        >
                            Crear producto rápido
                        </button>
                        <button
                            type="button"
                            onClick={handleChoosePick}
                            onKeyDown={handleActionKeyDown(handleChoosePick)}
                            tabIndex={0}
                            aria-label="Es un producto que ya tengo"
                            className={`${SCAN_SECONDARY_ACTION_CLASSES} w-full`}
                        >
                            Es un producto que ya tengo
                        </button>
                        <div className="lg:col-span-2 flex flex-col items-center pt-2">
                            <button
                                type="button"
                                onClick={onSkip}
                                onKeyDown={handleActionKeyDown(onSkip)}
                                tabIndex={0}
                                aria-label="Omitir esta línea"
                                className={`${SKIP_ACTION_CLASSES} lg:max-w-xs`}
                            >
                                Omitir esta línea
                            </button>
                            <p className="text-center text-[11px] font-semibold leading-snug text-slate-400 mt-1">
                                Si la omites, la línea queda fuera del inventario y del total de la compra.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {activeView === 'create' && (
                <ScanQuickProductForm
                    ocrName={line.ocrName}
                    suggestedName={suggestedProductName}
                    defaultCost={defaultProductCost}
                    detectedFactor={packagingFactor > 1 ? packagingFactor : undefined}
                    packagingUnit={packagingUnit}
                    categories={liveCategories}
                    onCategoriesChange={handleCategoriesChange}
                    products={products}
                    onCreate={onCreate}
                    onLinkExisting={onLinkExisting}
                    defaultBarcode={line.barcode}
                    supplierData={supplierData}
                    onOpenFullForm={onOpenFullForm}
                />
            )}

            {activeView === 'pick' && (
                <ScanProductPickerSheet
                    ocrName={line.ocrName}
                    products={products}
                    nicknameOwner={nicknameOwner}
                    onLink={onLink}
                />
            )}

            {activeView === 'equivalence' && equivalence && (
                <div className="space-y-4">
                    <ScanUnitEquivalenceForm
                        ocrUnit={equivalence.ocrUnit}
                        saleUnit={equivalence.saleUnit}
                        productName={equivalence.productName}
                        ocrQuantity={equivalence.ocrQuantity}
                        ocrLineTotal={equivalence.ocrLineTotal}
                        onConfirm={onConfirmEquivalence}
                    />
                    {/* Única alternativa para avanzar sin factor: omitir la línea (Req 9.10) */}
                    <div>
                        <button
                            type="button"
                            onClick={onSkip}
                            onKeyDown={handleActionKeyDown(onSkip)}
                            tabIndex={0}
                            aria-label="Omitir esta línea"
                            className={SKIP_ACTION_CLASSES}
                        >
                            Omitir esta línea
                        </button>
                        <p className="text-center text-[11px] font-semibold leading-snug text-slate-400">
                            Si no sabes la equivalencia, omite la línea y sigue con la siguiente.
                        </p>
                    </div>
                </div>
            )}
        </ScanStepShell>
    );
};

export default ScanLineResolverStep;
