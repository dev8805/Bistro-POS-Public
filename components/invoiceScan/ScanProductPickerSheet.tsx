import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Product } from '../../hooks/useProducts';
import { norm } from '../expense/scanExpense.logic';
import {
    SCAN_AUTOFOCUS_ATTRIBUTE,
    SCAN_PRIMARY_ACTION_CLASSES,
} from './ScanStepShell';

/**
 * Buscador del catálogo de la acción "Es un producto que ya tengo": vista
 * interna del Resolutor_Producto (Req 8.1, 8.2).
 *
 * Componente presentacional puro. No consume `useInvoiceScanDraft`, no llama a
 * `useProducts` y no hace fetch: recibe el catálogo **ya filtrado por el
 * Negocio_Activo** y el aviso de apodo **ya calculado**. Eso sostiene el
 * Requisito 17.2/17.3: el buscador no puede ampliar el alcance de la búsqueda
 * porque nunca conoce el `business_id` ni consulta la base de datos.
 *
 * Pese al nombre `Sheet` que fija el diseño, **no** es una hoja modal: se
 * renderiza dentro del propio paso del escaneo, sin abrir ninguna superficie
 * externa al flujo (Req 6.11, 16.1, 16.3).
 *
 * Dos etapas deliberadas: tocar una fila **selecciona** el producto y muestra la
 * propuesta de apodo activada por defecto; el vínculo se emite al confirmar. Con
 * una sola etapa el Usuario no tendría dónde desactivar la propuesta (Req 8.3).
 *
 * Solo se ofrecen productos de tipo `simple`, insumos incluidos; los `processed`
 * y los `service` nunca son destino (Req 8.7).
 *
 * Requisitos: 8.1, 8.2, 8.3, 8.5, 8.6, 8.7, 16.1, 17.2, 17.3, 17.14.
 */

/** Producto del catálogo tal como lo necesita el buscador. */
export type ScanPickerProduct = Pick<
    Product,
    'id' | 'name' | 'type' | 'unit' | 'nicknames' | 'is_for_sale'
>;

/**
 * Producto del Negocio_Activo que YA tiene el `Nombre_OCR` como Apodo, calculado
 * por el host antes de renderizar. `null` = el apodo no existe en el negocio.
 *
 * El componente solo elige cuál de los dos avisos muestra: el del mismo
 * producto (Req 8.5) o el de otro producto (Req 8.6).
 */
export interface ScanNicknameOwner {
    productId: string;
    productName: string;
}

export interface ScanProductPickerSheetProps {
    /** Nombre leído en la factura, candidato a Apodo. */
    ocrName: string;
    /** Catálogo del Negocio_Activo. El buscador se queda solo con `simple`. */
    products: ScanPickerProduct[];
    /** Dueño actual del Apodo, ya calculado (Req 8.5, 8.6). */
    nicknameOwner: ScanNicknameOwner | null;
    /** Vincula la línea al producto elegido, con o sin Apodo (Req 8.2, 8.3). */
    onLink: (productId: string, addNickname: boolean) => void;
}

const LABEL_CLASSES = 'mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500';

const INPUT_CLASSES =
    'block min-h-[44px] w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 placeholder:font-medium placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200';

const ROW_BASE_CLASSES =
    'flex min-h-[44px] w-full items-center justify-between gap-3 rounded-2xl border px-4 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-amber-300';

const ROW_ON_CLASSES = 'border-emerald-500 bg-emerald-50';
const ROW_OFF_CLASSES = 'border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50';

/** Marca del campo que recibe el foco al entrar a la vista. */
const AUTOFOCUS_PROPS: Record<string, string> = { [SCAN_AUTOFOCUS_ATTRIBUTE]: '' };

const isActivationKey = (key: string): boolean => key === 'Enter' || key === ' ' || key === 'Spacebar';

export const ScanProductPickerSheet: React.FC<ScanProductPickerSheetProps> = ({
    ocrName,
    products,
    nicknameOwner,
    onLink,
}) => {
    const [query, setQuery] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [addNickname, setAddNickname] = useState(true);

    const searchRef = useRef<HTMLInputElement>(null);

    // El buscador es el campo principal de la vista.
    useEffect(() => {
        searchRef.current?.focus();
    }, []);

    /** Solo productos simples: los insumos entran, los procesados y servicios no. */
    const simpleProducts = useMemo(
        () => products.filter((p) => p.type === 'simple'),
        [products],
    );

    /** Filtro por nombre y por Apodo, con la misma normalización del catálogo. */
    const filtered = useMemo(() => {
        const q = norm(query);
        if (!q) return simpleProducts;
        return simpleProducts.filter((p) => {
            if (norm(p.name).includes(q)) return true;
            return (p.nicknames || []).some((n) => norm(n).includes(q));
        });
    }, [simpleProducts, query]);

    const selected = useMemo(
        () => simpleProducts.find((p) => p.id === selectedId) ?? null,
        [simpleProducts, selectedId],
    );

    const trimmedOcrName = ocrName.trim();

    // El Apodo ya existe en el producto elegido: se informa y no hay propuesta (8.5).
    const ownedBySelected = selected !== null && nicknameOwner?.productId === selected.id;
    // El Apodo vive en otro producto del negocio: se informa y la línea se vincula
    // igual, pero sin agregar el Apodo (8.6).
    const ownedByOther = selected !== null && nicknameOwner !== null && nicknameOwner.productId !== selected.id;
    const canProposeNickname = selected !== null && trimmedOcrName !== '' && !ownedBySelected && !ownedByOther;
    const effectiveAddNickname = canProposeNickname && addNickname;

    const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value);

    const handleToggleNickname = () => setAddNickname((prev) => !prev);

    const selectProduct = (productId: string | undefined) => {
        if (!productId) return;
        setSelectedId(productId);
        // La propuesta vuelve a quedar activada con cada producto elegido (Req 8.3).
        setAddNickname(true);
    };

    // Las filas llevan el id en `data-product-id`: un solo handler estable para
    // toda la lista, sin crear una closure por producto.
    const handleRowClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        selectProduct(e.currentTarget.dataset.productId);
    };

    const handleRowKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        selectProduct(e.currentTarget.dataset.productId);
    };

    const handleLink = () => {
        if (!selected) return;
        onLink(selected.id, effectiveAddNickname);
    };

    const handleKeyActivation = (action: () => void) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        action();
    };

    return (
        <div className="space-y-4">
            <div>
                <label htmlFor="scan-product-search" className={LABEL_CLASSES}>
                    Buscar en mi catálogo
                </label>
                <input
                    id="scan-product-search"
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={handleQueryChange}
                    placeholder="Nombre o apodo"
                    aria-label="Buscar un producto por nombre o apodo"
                    className={INPUT_CLASSES}
                    {...AUTOFOCUS_PROPS}
                />
                <p className="mt-1 text-[11px] font-semibold leading-snug text-slate-500">
                    Busca por el nombre del producto o por un apodo que ya le hayas puesto.
                </p>
            </div>

            {filtered.length === 0 ? (
                <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-500">
                    No encontramos productos con ese dato. Revisa el nombre o crea el producto.
                </p>
            ) : (
                <ul className="space-y-2" aria-label="Productos de tu catálogo">
                    {filtered.map((p) => (
                        <li key={p.id}>
                            <button
                                type="button"
                                onClick={handleRowClick}
                                onKeyDown={handleRowKeyDown}
                                tabIndex={0}
                                aria-pressed={p.id === selectedId}
                                aria-label={`Elegir el producto ${p.name}`}
                                className={`${ROW_BASE_CLASSES} ${p.id === selectedId ? ROW_ON_CLASSES : ROW_OFF_CLASSES}`}
                                data-product-id={p.id}
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-bold text-slate-900">{p.name}</span>
                                    <span className="block truncate text-[11px] font-semibold text-slate-500">
                                        {p.is_for_sale === false ? `Insumo · ${p.unit}` : p.unit}
                                    </span>
                                </span>
                                {p.id === selectedId && (
                                    <span className="material-symbols-outlined shrink-0 text-xl text-emerald-600" aria-hidden="true">
                                        check_circle
                                    </span>
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {selected && (
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-sm font-black leading-tight text-slate-900">
                        {`Esta línea queda en "${selected.name}"`}
                    </p>

                    {ownedBySelected && (
                        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold leading-snug text-emerald-800">
                            {`"${trimmedOcrName}" ya es un apodo de este producto, así que no hay nada que enseñarle.`}
                        </p>
                    )}

                    {ownedByOther && nicknameOwner && (
                        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-snug text-amber-900">
                            {`"${trimmedOcrName}" ya es un apodo de "${nicknameOwner.productName}". La línea se vincula igual, pero el apodo se queda donde está.`}
                        </p>
                    )}

                    {canProposeNickname && (
                        <label
                            htmlFor="scan-product-nickname"
                            className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                        >
                            <input
                                id="scan-product-nickname"
                                type="checkbox"
                                checked={addNickname}
                                onChange={handleToggleNickname}
                                aria-label={`Guardar "${trimmedOcrName}" como apodo de ${selected.name}`}
                                className="size-5 shrink-0 rounded border-slate-300 text-amber-500 focus:ring-2 focus:ring-amber-300"
                            />
                            <span className="text-[11px] font-semibold leading-snug text-slate-600">
                                {`Guardar "${trimmedOcrName}" como apodo para que la próxima factura lo reconozca solo.`}
                            </span>
                        </label>
                    )}

                    <button
                        type="button"
                        onClick={handleLink}
                        onKeyDown={handleKeyActivation(handleLink)}
                        tabIndex={0}
                        aria-label={`Vincular esta línea a ${selected.name}`}
                        className={`${SCAN_PRIMARY_ACTION_CLASSES} w-full`}
                    >
                        Vincular y continuar
                    </button>
                </div>
            )}
        </div>
    );
};

export default ScanProductPickerSheet;
