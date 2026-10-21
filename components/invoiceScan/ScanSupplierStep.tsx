import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ScanStepShell,
    SCAN_AUTOFOCUS_ATTRIBUTE,
    SCAN_PRIMARY_ACTION_CLASSES,
    SCAN_SECONDARY_ACTION_CLASSES,
} from './ScanStepShell';
import { norm, normNit } from '../expense/scanExpense.logic';
import { toSupplierDraft, type SupplierMatchResult } from '../../lib/invoiceScan/supplierMatch';
import type { ScanProgress, SupplierDecision } from '../../lib/invoiceScan/types';
import type { Supplier } from '../../hooks/useSuppliers';

/**
 * Resolutor_Proveedor del Escaneo_Unificado.
 *
 * Componente presentacional puro: **no** llama a `useSuppliers` ni a
 * `matchSupplierHeader`. Recibe el resultado del emparejamiento ya calculado
 * (`match`) y la lista de proveedores **ya filtrada por el Negocio_Activo**
 * (`suppliers`), que `InvoiceScanScreen` obtiene del hook. Esa decisión sostiene
 * el Requisito 17.1: el paso no puede ampliar el alcance de la búsqueda más allá
 * del negocio de la sesión porque nunca conoce el `business_id` ni consulta la
 * base de datos. Todo lo que muestra proviene de la lista recibida (Req 17.14).
 *
 * El mismo paso sirve a la Ruta_Inventario y a la Ruta_Gasto: el aviso de
 * proveedor nuevo del Requisito 5 es el que aplica el gasto (Req 11.7).
 *
 * Tres estados, uno por caso de la cascada:
 *  - `confirmed`: chip en `emerald` con el nombre y el NIT, más "Cambiar de proveedor" (5.2, 5.3).
 *  - `new`: aviso de proveedor nuevo con nombre y NIT editables, "Usar este proveedor"
 *    y "Buscar un proveedor existente" (5.4, 5.5, 5.6).
 *  - `manual`: el encabezado llegó sin nombre y sin NIT, así que exige elegir un
 *    proveedor existente o escribir uno nuevo antes de continuar (5.7, 5.8).
 *
 * El buscador vive dentro del propio paso: no abre modales, hojas ni selectores
 * de proveedor externos al flujo (Req 16.3).
 */

/** Vista interna del paso. `search` se alcanza desde `confirmed` y desde `new`. */
export type ScanSupplierView = 'confirmed' | 'new' | 'manual' | 'search';

export interface ScanSupplierStepProps {
    /** Resultado de `matchSupplierHeader`. El paso no vuelve a emparejar. */
    match: SupplierMatchResult<Supplier>;
    /** Proveedores del Negocio_Activo, ya filtrados por `useSuppliers` (Req 17.1). */
    suppliers: Supplier[];
    /** Progreso del flujo para el contador del shell. */
    progress?: ScanProgress | null;
    canGoBack: boolean;
    onBack: () => void;
    onClose: () => void;
    /** Entrega la decisión al hook dueño del Borrador_Escaneo. */
    onConfirm: (decision: SupplierDecision) => void;
}

const LABEL_CLASSES = 'mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500';

const INPUT_CLASSES =
    'block min-h-[44px] w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 placeholder:font-medium placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200';

const ROW_CLASSES =
    'flex min-h-[44px] w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-left transition-colors hover:border-amber-300 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-300';

/**
 * Marca del campo que debe recibir el foco al entrar al paso. Se declara a nivel
 * de módulo para no crear un objeto nuevo en cada render.
 */
const AUTOFOCUS_PROPS: Record<string, string> = { [SCAN_AUTOFOCUS_ATTRIBUTE]: '' };
const NO_AUTOFOCUS_PROPS: Record<string, string> = {};

const isActivationKey = (key: string): boolean => key === 'Enter' || key === ' ' || key === 'Spacebar';

/** Vista base del paso según el caso de la cascada. */
const baseViewFor = (match: SupplierMatchResult<Supplier>): ScanSupplierView => {
    if (match.kind === 'confirmed') return 'confirmed';
    if (match.kind === 'new') return 'new';
    return 'manual';
};

const VIEW_TITLES: Record<ScanSupplierView, string> = {
    confirmed: 'Proveedor de la factura',
    new: 'Proveedor nuevo',
    manual: 'Elige el proveedor',
    search: 'Busca un proveedor tuyo',
};

const VIEW_ONBOARDING: Record<ScanSupplierView, string> = {
    confirmed:
        'Este registro queda a nombre del proveedor que ya tienes guardado. Si no es el correcto, puedes cambiarlo antes de continuar.',
    new: 'No lo encontramos en tu lista por NIT ni por nombre. Si lo usas, se crea con estos datos cuando guardes el registro; si prefieres, busca uno que ya tengas.',
    manual:
        'La factura no trae el nombre ni el NIT del proveedor. Elige uno de tu lista o escribe los datos del nuevo: sin proveedor no se puede continuar.',
    search: 'Elige un proveedor de tu negocio. El registro queda a su nombre y no se crea ninguno nuevo.',
};

export const ScanSupplierStep: React.FC<ScanSupplierStepProps> = ({
    match,
    suppliers,
    progress = null,
    canGoBack,
    onBack,
    onClose,
    onConfirm,
}) => {
    const baseView = baseViewFor(match);

    const [view, setView] = useState<ScanSupplierView>(baseView);
    const [name, setName] = useState(match.kind === 'new' ? match.name : '');
    const [nit, setNit] = useState(match.kind === 'new' ? match.nit : '');
    const [phone, setPhone] = useState(match.kind === 'new' ? match.phone : '');
    const [query, setQuery] = useState('');

    const searchInputRef = useRef<HTMLInputElement>(null);

    const [isNewSupplierModalOpen, setIsNewSupplierModalOpen] = useState(false);

    // Al abrir el buscador desde `confirmed` o `new`, o al entrar al estado manual, el foco va al campo de búsqueda.
    useEffect(() => {
        if (view !== 'search' && view !== 'manual') return;
        searchInputRef.current?.focus();
    }, [view]);

    /** Filtra la lista recibida por nombre y por NIT. Nunca consulta la base. */
    const filteredSuppliers = useMemo(() => {
        const byName = norm(query);
        const byNit = normNit(query).toLowerCase();
        if (!byName && !byNit) return suppliers;
        return suppliers.filter((s) => {
            const nameHit = byName !== '' && norm(s.name).includes(byName);
            const nitHit = byNit !== '' && normNit(s.nit).toLowerCase().includes(byNit);
            return nameHit || nitHit;
        });
    }, [suppliers, query]);

    const trimmedName = name.trim();
    const canUseNewSupplier = trimmedName.length > 0;
    const showsSearch = view === 'search' || view === 'manual';
    const showsNewSupplierFields = view === 'new';

    const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value);
    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value);
    const handleNitChange = (e: React.ChangeEvent<HTMLInputElement>) => setNit(e.target.value);
    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value);

    const handleOpenSearch = () => {
        setQuery('');
        setView('search');
    };

    const handleCancelSearch = () => {
        setQuery('');
        setView(baseView);
    };

    const handleConfirmMatched = () => {
        const decision = toSupplierDraft(match);
        if (!decision) return;
        onConfirm(decision);
    };

    const handleUseNewSupplier = () => {
        if (!canUseNewSupplier) return;
        onConfirm({ kind: 'new', name: trimmedName, nit: nit.trim(), phone: phone.trim() });
    };

    const handlePickExisting = (supplierId: string | undefined) => {
        const picked = suppliers.find((s) => s.id === supplierId);
        if (!picked) return;
        onConfirm({ kind: 'existing', id: picked.id, name: picked.name });
    };

    // Las filas llevan el id en `data-supplier-id`: un solo handler estable para
    // toda la lista, sin crear una closure por proveedor.
    const handleRowClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        handlePickExisting(e.currentTarget.dataset.supplierId);
    };

    const handleRowKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        handlePickExisting(e.currentTarget.dataset.supplierId);
    };

    const handleActionKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, action: () => void) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        action();
    };

    const handleConfirmMatchedKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) =>
        handleActionKeyDown(e, handleConfirmMatched);
    const handleUseNewSupplierKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) =>
        handleActionKeyDown(e, handleUseNewSupplier);
    const handleOpenSearchKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) =>
        handleActionKeyDown(e, handleOpenSearch);
    const handleCancelSearchKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) =>
        handleActionKeyDown(e, handleCancelSearch);

    const footer =
        view === 'confirmed' ? (
            <div className="flex flex-col gap-2">
                <button
                    type="button"
                    onClick={handleConfirmMatched}
                    onKeyDown={handleConfirmMatchedKeyDown}
                    aria-label="Continuar con este proveedor"
                    className={SCAN_PRIMARY_ACTION_CLASSES}
                >
                    Continuar con este proveedor
                </button>
                <button
                    type="button"
                    onClick={handleOpenSearch}
                    onKeyDown={handleOpenSearchKeyDown}
                    aria-label="Cambiar de proveedor"
                    className={SCAN_SECONDARY_ACTION_CLASSES}
                >
                    Cambiar de proveedor
                </button>
            </div>
        ) : view === 'search' ? (
            <button
                type="button"
                onClick={handleCancelSearch}
                onKeyDown={handleCancelSearchKeyDown}
                aria-label="Cancelar la búsqueda de proveedor"
                className={`${SCAN_SECONDARY_ACTION_CLASSES} w-full`}
            >
                Cancelar la búsqueda
            </button>
        ) : view === 'manual' ? null : (
            <div className="flex flex-col gap-2">
                <button
                    type="button"
                    onClick={handleUseNewSupplier}
                    onKeyDown={handleUseNewSupplierKeyDown}
                    disabled={!canUseNewSupplier}
                    aria-disabled={!canUseNewSupplier}
                    aria-label="Usar este proveedor"
                    className={SCAN_PRIMARY_ACTION_CLASSES}
                >
                    Usar este proveedor
                </button>
                {view === 'new' && (
                    <button
                        type="button"
                        onClick={handleOpenSearch}
                        onKeyDown={handleOpenSearchKeyDown}
                        aria-label="Buscar un proveedor existente"
                        className={SCAN_SECONDARY_ACTION_CLASSES}
                    >
                        Buscar un proveedor existente
                    </button>
                )}
            </div>
        );

    return (
        <ScanStepShell
            step="supplier"
            title={VIEW_TITLES[view]}
            progress={progress}
            canGoBack={canGoBack}
            onBack={onBack}
            onClose={onClose}
            autoFocusTarget={'heading'}
            footer={footer}
        >
            <div className="space-y-4">
                <p className="text-xs font-semibold leading-relaxed text-slate-600">{VIEW_ONBOARDING[view]}</p>

                {view === 'confirmed' && match.kind === 'confirmed' && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                        <span className="inline-flex items-center rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-white">
                            Proveedor confirmado
                        </span>
                        <p className="mt-2 text-base font-black leading-tight text-emerald-900">
                            {match.supplier.name}
                        </p>
                        <p className="mt-0.5 text-xs font-bold text-emerald-800">
                            {match.supplier.nit ? `NIT ${match.supplier.nit}` : 'Sin NIT registrado'}
                        </p>
                    </div>
                )}

                {view === 'new' && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                        <p className="text-sm font-black text-slate-900">Es un proveedor nuevo</p>
                        <p className="mt-1 text-xs font-semibold leading-snug text-slate-600">
                            No coincide con ninguno de tus proveedores por NIT ni por nombre. Revisa los datos antes de
                            usarlo.
                        </p>
                    </div>
                )}

                {showsSearch && (
                    <div className="space-y-2">
                        <label htmlFor="scan-supplier-search" className={LABEL_CLASSES}>
                            Buscar en mis proveedores
                        </label>
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1 min-w-0">
                                <input
                                    id="scan-supplier-search"
                                    ref={searchInputRef}
                                    type="search"
                                    value={query}
                                    onChange={handleQueryChange}
                                    placeholder="Nombre o NIT"
                                    aria-label="Buscar un proveedor por nombre o NIT"
                                    className={INPUT_CLASSES}
                                    {...AUTOFOCUS_PROPS}
                                />
                            </div>
                            {view === 'manual' && (
                                <button
                                    type="button"
                                    onClick={() => setIsNewSupplierModalOpen(true)}
                                    aria-label="Crear nuevo proveedor"
                                    className="h-11 px-4 flex items-center justify-center gap-1.5 rounded-2xl bg-primary hover:bg-primary-hover text-[#102218] font-bold text-sm transition-all shrink-0 shadow-sm active:scale-[0.98]"
                                    title="Crear nuevo proveedor"
                                >
                                    <span className="material-symbols-outlined text-lg">add</span>
                                    <span>Nuevo</span>
                                </button>
                            )}
                        </div>

                        {filteredSuppliers.length === 0 ? (
                            <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-500">
                                No encontramos proveedores con ese dato. Revisa el nombre o el NIT.
                            </p>
                        ) : (
                            <ul className="space-y-2" aria-label="Proveedores de tu negocio">
                                {filteredSuppliers.map((s) => (
                                    <li key={s.id}>
                                        <button
                                            type="button"
                                            onClick={handleRowClick}
                                            onKeyDown={handleRowKeyDown}
                                            aria-label={`Usar el proveedor ${s.name}`}
                                            className={ROW_CLASSES}
                                            data-supplier-id={s.id}
                                        >
                                            <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">
                                                {s.name}
                                            </span>
                                            <span className="shrink-0 text-[11px] font-bold text-slate-500">
                                                {s.nit ? `NIT ${s.nit}` : 'Sin NIT'}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                {showsNewSupplierFields && (
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                        <div>
                            <label htmlFor="scan-supplier-name" className={LABEL_CLASSES}>
                                Nombre del proveedor
                            </label>
                            <input
                                id="scan-supplier-name"
                                type="text"
                                value={name}
                                onChange={handleNameChange}
                                placeholder="Nombre del proveedor"
                                aria-label="Nombre del proveedor nuevo"
                                className={INPUT_CLASSES}
                                {...NO_AUTOFOCUS_PROPS}
                            />
                        </div>
                        <div>
                            <label htmlFor="scan-supplier-nit" className={LABEL_CLASSES}>
                                NIT (opcional)
                            </label>
                            <input
                                id="scan-supplier-nit"
                                type="text"
                                inputMode="numeric"
                                value={nit}
                                onChange={handleNitChange}
                                placeholder="900123456-7"
                                aria-label="NIT del proveedor nuevo"
                                className={INPUT_CLASSES}
                            />
                        </div>
                        <div>
                            <label htmlFor="scan-supplier-phone" className={LABEL_CLASSES}>
                                Teléfono (opcional)
                            </label>
                            <input
                                id="scan-supplier-phone"
                                type="tel"
                                inputMode="tel"
                                value={phone}
                                onChange={handlePhoneChange}
                                placeholder="3101234567"
                                aria-label="Teléfono del proveedor nuevo"
                                className={INPUT_CLASSES}
                            />
                        </div>
                        {!canUseNewSupplier && (
                            <p className="text-[11px] font-bold text-rose-600">
                                Escribe el nombre del proveedor para poder continuar.
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Modal para crear proveedor nuevo en vista manual */}
            {isNewSupplierModalOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="modal-new-supplier-title"
                >
                    <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 space-y-4 dark:bg-slate-900 dark:border-slate-800">
                        {/* Cabecera del modal */}
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                            <div>
                                <h2 id="modal-new-supplier-title" className="text-base font-black text-slate-900 dark:text-white">
                                    Nuevo proveedor
                                </h2>
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    Ingresa los datos para registrar la compra
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsNewSupplierModalOpen(false)}
                                aria-label="Cerrar modal"
                                className="flex size-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                            >
                                <span className="material-symbols-outlined text-xl">close</span>
                            </button>
                        </div>

                        {/* Campos del formulario */}
                        <div className="space-y-3">
                            <div>
                                <label htmlFor="scan-supplier-name-modal" className={LABEL_CLASSES}>
                                    Nombre del proveedor *
                                </label>
                                <input
                                    id="scan-supplier-name-modal"
                                    type="text"
                                    value={name}
                                    onChange={handleNameChange}
                                    placeholder="Nombre del proveedor"
                                    aria-label="Nombre del proveedor nuevo"
                                    autoFocus
                                    className={INPUT_CLASSES}
                                />
                            </div>
                            <div>
                                <label htmlFor="scan-supplier-nit-modal" className={LABEL_CLASSES}>
                                    NIT (opcional)
                                </label>
                                <input
                                    id="scan-supplier-nit-modal"
                                    type="text"
                                    inputMode="numeric"
                                    value={nit}
                                    onChange={handleNitChange}
                                    placeholder="900123456-7"
                                    aria-label="NIT del proveedor nuevo"
                                    className={INPUT_CLASSES}
                                />
                            </div>
                            <div>
                                <label htmlFor="scan-supplier-phone-modal" className={LABEL_CLASSES}>
                                    Teléfono (opcional)
                                </label>
                                <input
                                    id="scan-supplier-phone-modal"
                                    type="tel"
                                    inputMode="tel"
                                    value={phone}
                                    onChange={handlePhoneChange}
                                    placeholder="3101234567"
                                    aria-label="Teléfono del proveedor nuevo"
                                    className={INPUT_CLASSES}
                                />
                            </div>
                            {!canUseNewSupplier && (
                                <p className="text-[11px] font-bold text-rose-600">
                                    Escribe el nombre del proveedor para poder continuar.
                                </p>
                            )}
                        </div>

                        {/* Botones del modal */}
                        <div className="flex items-center gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setIsNewSupplierModalOpen(false)}
                                className={`${SCAN_SECONDARY_ACTION_CLASSES} flex-1`}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    handleUseNewSupplier();
                                    setIsNewSupplierModalOpen(false);
                                }}
                                disabled={!canUseNewSupplier}
                                aria-disabled={!canUseNewSupplier}
                                aria-label="Usar este proveedor"
                                className={`${SCAN_PRIMARY_ACTION_CLASSES} flex-1`}
                            >
                                Usar este proveedor
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ScanStepShell>
    );
};

export default ScanSupplierStep;
