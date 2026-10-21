import React, { useEffect, useMemo, useState } from 'react';
import { CategoryPickerSheet } from '../expense/CategoryPickerSheet';
import { ObservationSheet } from '../expense/ObservationSheet';
import { formatWithThousands, parseCleanNumber } from '../expense/shared';
import { formatCurrency } from '../../lib/formatters';
import { todayDateStringInTz } from '../../lib/timezone';
import {
    SCAN_AUTOFOCUS_ATTRIBUTE,
    SCAN_PRIMARY_ACTION_CLASSES,
    SCAN_SECONDARY_ACTION_CLASSES,
} from './ScanStepShell';
import type { ExpensePayloadIssue } from '../../lib/invoiceScan/buildExpensePayload';
import type { ScanExpenseDraft, ScanSupplierDraft } from '../../lib/invoiceScan/types';

/**
 * Paso de campos del gasto de la Ruta_Gasto (Req 11.3, 11.4, 16.1).
 *
 * Componente presentacional: recibe el borrador del gasto, el proveedor
 * confirmado, las categorías del Negocio_Activo y los códigos de validación
 * pendientes. No llama hooks de datos, no hace fetch y no conoce la máquina de
 * estados. Quien lo cablea es `screens/InvoiceScanScreen.tsx`.
 *
 * ## Por qué las validaciones llegan por prop y no se recalculan aquí
 *
 * Las reglas del gasto ya viven en `lib/invoiceScan/buildExpensePayload.ts` como
 * códigos estables (`invalid_amount`, `missing_category`, `future_expense_date`,
 * `missing_supplier`, …), que son a su vez el espejo de las validaciones de
 * `public.register_expense`. Si este componente volviera a evaluar "categoría
 * obligatoria" o "fecha no futura", habría tres implementaciones de la misma
 * regla y la UI podría habilitar un registro que el motor rechaza. Por eso el
 * paso solo **traduce** los códigos que recibe a mensajes junto a cada campo y
 * deshabilita el control de continuar mientras haya alguno pendiente.
 *
 * El padre pasa únicamente los códigos que corresponden a este paso; cualquier
 * código sin campo asociado (por ejemplo los del paso de pago) se muestra en un
 * aviso general para que nunca quede un bloqueo sin explicación.
 *
 * ## Un solo campo para descripción y observación
 *
 * En el registro de gasto vigente la observación **es** la descripción
 * (`expenses.description`): el textarea y el `ObservationSheet` editan el mismo
 * valor, y el panel ampliado solo da más espacio para escribir. Se conserva ese
 * comportamiento en lugar de inventar un segundo campo que la tabla no tiene.
 */

/** Mensaje de cada código, para mostrarlo junto a su campo. */
const ISSUE_MESSAGES: Record<ExpensePayloadIssue, string> = {
    missing_business_id: 'Tu sesión no tiene un negocio asignado.',
    missing_idempotency_key: 'No pudimos preparar el registro. Vuelve a abrir el escaneo.',
    missing_expense_fields: 'Faltan los datos del gasto.',
    invalid_amount: 'Escribe un valor mayor que cero.',
    missing_category: 'Elige una categoría para el gasto.',
    missing_expense_date: 'Elige la fecha del gasto.',
    future_expense_date: 'La fecha no puede ser posterior a hoy.',
    missing_supplier: 'El proveedor es obligatorio.',
    missing_due_date: 'El crédito necesita una fecha de pago.',
    negative_paid_amount: 'El abono no puede ser negativo.',
    negative_method_amount: 'Los montos de los métodos de pago no pueden ser negativos.',
    overpayment: 'La suma de los pagos supera el valor del gasto.',
    unanswered_cash_question: 'Responde si el dinero sale de caja.',
};

/** Nombre corto de lo que falta, para la frase de onboarding. */
const MISSING_LABELS: Partial<Record<ExpensePayloadIssue, string>> = {
    missing_expense_fields: 'los datos del gasto',
    invalid_amount: 'el valor',
    missing_category: 'la categoría',
    missing_supplier: 'el proveedor',
    missing_expense_date: 'la fecha',
    future_expense_date: 'una fecha que no sea futura',
};

/** Códigos de cada campo del paso, en el orden en el que aparecen en pantalla. */
const AMOUNT_ISSUES: ExpensePayloadIssue[] = ['invalid_amount'];
const CATEGORY_ISSUES: ExpensePayloadIssue[] = ['missing_category'];
const SUPPLIER_ISSUES: ExpensePayloadIssue[] = ['missing_supplier'];
const DATE_ISSUES: ExpensePayloadIssue[] = ['missing_expense_date', 'future_expense_date'];

/** Códigos que este paso ya explica junto a un campo. */
const FIELD_ISSUES: ExpensePayloadIssue[] = [
    ...AMOUNT_ISSUES,
    ...CATEGORY_ISSUES,
    ...SUPPLIER_ISSUES,
    ...DATE_ISSUES,
];

const FIELD_LABEL_CLASSES =
    'block text-[10px] font-black uppercase tracking-[0.14em] text-slate-600';

const FIELD_INPUT_CLASSES =
    'w-full min-h-[44px] rounded-2xl border bg-white px-4 text-sm font-bold text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-amber-400';

const FIELD_ERROR_CLASSES = 'mt-1.5 text-[11px] font-bold leading-snug text-rose-600';

const isActivationKey = (key: string): boolean => key === 'Enter' || key === ' ' || key === 'Spacebar';

/** "a", "a y b", "a, b y c". */
const joinWithY = (parts: string[]): string => {
    if (parts.length <= 1) return parts[0] ?? '';
    return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
};

const borderClasses = (hasError: boolean): string =>
    hasError ? 'border-rose-300 focus:border-rose-500' : 'border-slate-200';

export interface ScanExpenseFieldsStepProps {
    /** Campos del gasto del Borrador_Escaneo, todos editables (Req 11.4). */
    expense: ScanExpenseDraft;
    /** Proveedor confirmado por el Resolutor_Proveedor. `null` mientras falta. */
    supplier: ScanSupplierDraft | null;
    /** Proveedores del negocio para autocompletado opcional. */
    suppliers?: Array<{ id: string; name: string }>;
    /** Categorías de gasto del Negocio_Activo, ya filtradas (Req 17.5, 17.14). */
    categories: string[];
    /** Códigos pendientes de `buildExpensePayload`. Vacío = el paso valida. */
    issues: ExpensePayloadIssue[];
    /** Edición de cualquier campo del gasto. */
    onChange: (patch: Partial<ScanExpenseDraft>) => void;
    /** Edición del nombre del proveedor: el padre decide si pasa a proveedor nuevo. */
    onSupplierNameChange: (name: string) => void;
    /** Limpia el proveedor seleccionado para elegir o escribir otro. */
    onClearSupplier?: () => void;
    /** Selección directa de un proveedor existente del negocio. */
    onSelectSupplier?: (supplier: { id: string; name: string }) => void;
    /** Creación de una categoría nueva del negocio desde el selector. */
    onCreateCategory: (name: string) => Promise<void> | void;
    /** Continuar al paso de pago. */
    onConfirm: () => void;
    /** "Hoy" en `America/Bogota` ("YYYY-MM-DD"). Solo para pruebas deterministas. */
    today?: string;
    /** Bloquea el control de continuar mientras el flujo trabaja. */
    isSubmitting?: boolean;
}

export const ScanExpenseFieldsStep: React.FC<ScanExpenseFieldsStepProps> = ({
    expense,
    supplier,
    suppliers = [],
    categories,
    issues,
    onChange,
    onSupplierNameChange,
    onClearSupplier,
    onSelectSupplier,
    onCreateCategory,
    onConfirm,
    today,
    isSubmitting = false,
}) => {
    const [showCategoryPicker, setShowCategoryPicker] = useState(false);
    const [showObservationSheet, setShowObservationSheet] = useState(false);
    const [isEditingSupplier, setIsEditingSupplier] = useState(!supplier?.name);
    const [supplierSearchText, setSupplierSearchText] = useState(supplier?.name ?? '');

    useEffect(() => {
        if (supplier?.name) {
            setSupplierSearchText(supplier.name);
            setIsEditingSupplier(false);
        } else {
            setIsEditingSupplier(true);
        }
    }, [supplier?.name]);

    // El `max` del input de fecha: el calendario del navegador no ofrece días
    // posteriores a hoy en hora colombiana (Req 11.5).
    const maxDate = useMemo(() => (today || '').trim() || todayDateStringInTz(), [today]);

    const pending = useMemo(() => (Array.isArray(issues) ? issues : []), [issues]);

    const amountIssue = pending.find(i => AMOUNT_ISSUES.includes(i));
    const categoryIssue = pending.find(i => CATEGORY_ISSUES.includes(i));
    const supplierIssue = pending.find(i => SUPPLIER_ISSUES.includes(i));
    const dateIssue = pending.find(i => DATE_ISSUES.includes(i));
    const otherIssues = useMemo(() => pending.filter(i => !FIELD_ISSUES.includes(i)), [pending]);

    // Frase de onboarding: qué falta exactamente para poder registrar el gasto.
    const onboardingText = useMemo(() => {
        if (pending.length === 0) {
            return 'Ya está todo lo necesario para registrar el gasto. Continúa al paso de pago.';
        }
        const labels = pending.map(i => MISSING_LABELS[i]).filter(Boolean) as string[];
        if (labels.length === 0) return 'Revisa los avisos de esta pantalla para poder registrar el gasto.';
        return `Para registrar el gasto falta ${joinWithY(labels)}.`;
    }, [pending]);

    const supplierName = supplier ? supplier.name : '';
    const isSavedSupplier = Boolean(supplier && supplier.kind === 'existing');

    const amountValue = Number(parseCleanNumber(expense ? expense.amount : '') || 0);
    const isBlocked = pending.length > 0 || isSubmitting;

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange({ amount: parseCleanNumber(e.target.value) });
    };

    const handleDescriptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onChange({ description: e.target.value });
    };

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange({ date: e.target.value });
    };

    const handleSupplierInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setSupplierSearchText(val);
        onSupplierNameChange(val);
    };

    const handleClearSupplier = () => {
        setIsEditingSupplier(true);
        setSupplierSearchText('');
        if (onClearSupplier) {
            onClearSupplier();
        }
        onSupplierNameChange('');
    };

    const handleSelectExistingSupplier = (s: { id: string; name: string }) => {
        setSupplierSearchText(s.name);
        setIsEditingSupplier(false);
        if (onSelectSupplier) {
            onSelectSupplier(s);
        } else {
            onSupplierNameChange(s.name);
        }
    };

    const matchingSuggestions = useMemo(() => {
        const query = supplierSearchText.trim().toLowerCase();
        if (!query || !suppliers || suppliers.length === 0) return [];
        return suppliers.filter(s => s.name.toLowerCase().includes(query));
    }, [supplierSearchText, suppliers]);

    const handleSelectCategory = (category: string) => {
        onChange({ category });
    };

    /**
     * Crear una categoría también la deja seleccionada: la selección es estado
     * del borrador y este paso es su único canal (`onChange`), así el
     * comportamiento no depende de cómo el padre cablee `onCreateCategory`.
     */
    const handleCreateCategory = async (name: string) => {
        await onCreateCategory(name);
        const clean = name.trim();
        if (clean) onChange({ category: clean.toUpperCase() });
    };

    const handleOpenCategoryPicker = () => setShowCategoryPicker(true);
    const handleCloseCategoryPicker = () => setShowCategoryPicker(false);
    const handleOpenObservationSheet = () => setShowObservationSheet(true);
    const handleCloseObservationSheet = () => setShowObservationSheet(false);

    const handleSaveObservation = (value: string) => {
        onChange({ description: value });
    };

    const handleConfirm = () => {
        if (isBlocked) return;
        onConfirm();
    };

    const handleKeyActivate = (action: () => void) => (
        e: React.KeyboardEvent<HTMLButtonElement>,
    ) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        action();
    };

    // Sin bloque de gasto no hay nada que editar: el paso no aplica.
    if (!expense) return null;

    return (
        <div className="flex flex-col gap-5">
            <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-bold leading-snug text-emerald-900">
                {onboardingText}
            </p>

            {/* Valor */}
            <div>
                <label htmlFor="scan-expense-amount" className={FIELD_LABEL_CLASSES}>
                    Valor del gasto
                </label>
                <div className="relative mt-2">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-black text-slate-400">
                        $
                    </span>
                    <input
                        id="scan-expense-amount"
                        type="text"
                        inputMode="numeric"
                        value={formatWithThousands(expense.amount)}
                        onChange={handleAmountChange}
                        placeholder="0"
                        aria-label="Valor del gasto"
                        aria-invalid={Boolean(amountIssue)}
                        aria-describedby={amountIssue ? 'scan-expense-amount-error' : undefined}
                        className={`${FIELD_INPUT_CLASSES} ${borderClasses(Boolean(amountIssue))} pl-9 text-lg font-black tabular-nums`}
                        {...{ [SCAN_AUTOFOCUS_ATTRIBUTE]: true }}
                    />
                </div>
                {amountIssue && (
                    <p id="scan-expense-amount-error" className={FIELD_ERROR_CLASSES}>
                        {ISSUE_MESSAGES[amountIssue]}
                    </p>
                )}
            </div>

            {/* Categoría */}
            <div>
                <span className={FIELD_LABEL_CLASSES}>Categoría</span>
                <button
                    type="button"
                    onClick={handleOpenCategoryPicker}
                    onKeyDown={handleKeyActivate(handleOpenCategoryPicker)}
                    tabIndex={0}
                    aria-label="Elegir la categoría del gasto"
                    aria-invalid={Boolean(categoryIssue)}
                    aria-describedby={categoryIssue ? 'scan-expense-category-error' : undefined}
                    className={`${SCAN_SECONDARY_ACTION_CLASSES} mt-2 w-full justify-between px-4 ${categoryIssue ? 'border-rose-300' : ''}`}
                >
                    <span className={`truncate uppercase tracking-wider ${expense.category ? 'text-slate-900' : 'text-slate-400'}`}>
                        {expense.category || 'Elegir categoría'}
                    </span>
                    <span className="material-symbols-outlined shrink-0 text-slate-400" aria-hidden="true">
                        expand_more
                    </span>
                </button>
                {categoryIssue && (
                    <p id="scan-expense-category-error" className={FIELD_ERROR_CLASSES}>
                        {ISSUE_MESSAGES[categoryIssue]}
                    </p>
                )}
            </div>

            {/* Proveedor */}
            <div>
                <label htmlFor="scan-expense-supplier" className={FIELD_LABEL_CLASSES}>
                    Proveedor
                </label>
                {!isEditingSupplier && supplierName ? (
                    <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 transition-colors">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                                    {isSavedSupplier ? 'verified' : 'storefront'}
                                </span>
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-black text-slate-900">{supplierName}</p>
                                <p className="flex items-center gap-1 text-[11px] font-bold text-emerald-800">
                                    <span className="material-symbols-outlined text-[13px]" aria-hidden="true">check_circle</span>
                                    {isSavedSupplier ? 'Proveedor registrado en tu negocio' : 'Proveedor detectado'}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleClearSupplier}
                            tabIndex={0}
                            aria-label="Eliminar proveedor seleccionado"
                            title="Eliminar o cambiar proveedor"
                            className="flex size-9 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-100/60 hover:text-rose-600 active:scale-95 transition-all"
                        >
                            <span className="material-symbols-outlined text-xl" aria-hidden="true">delete</span>
                        </button>
                    </div>
                ) : (
                    <div className="relative mt-2">
                        <input
                            id="scan-expense-supplier"
                            type="text"
                            value={supplierSearchText}
                            onChange={handleSupplierInputChange}
                            placeholder="Buscar o escribir nombre del proveedor"
                            aria-label="Proveedor del gasto"
                            aria-invalid={Boolean(supplierIssue)}
                            aria-describedby={supplierIssue ? 'scan-expense-supplier-error' : undefined}
                            className={`${FIELD_INPUT_CLASSES} ${borderClasses(Boolean(supplierIssue))}`}
                        />
                        {matchingSuggestions.length > 0 && (
                            <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg">
                                {matchingSuggestions.slice(0, 5).map(s => (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => handleSelectExistingSupplier(s)}
                                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-800 hover:bg-amber-50 hover:text-amber-900"
                                    >
                                        <span className="truncate">{s.name}</span>
                                        <span className="shrink-0 text-[10px] font-semibold text-emerald-600">Registrado</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {supplierIssue && (
                    <p id="scan-expense-supplier-error" className={FIELD_ERROR_CLASSES}>
                        {ISSUE_MESSAGES[supplierIssue]}
                    </p>
                )}
            </div>

            {/* Fecha */}
            <div>
                <label htmlFor="scan-expense-date" className={FIELD_LABEL_CLASSES}>
                    Fecha del gasto
                </label>
                <input
                    id="scan-expense-date"
                    type="date"
                    value={expense.date}
                    max={maxDate}
                    onChange={handleDateChange}
                    aria-label="Fecha del gasto"
                    aria-invalid={Boolean(dateIssue)}
                    aria-describedby={dateIssue ? 'scan-expense-date-error' : undefined}
                    className={`${FIELD_INPUT_CLASSES} ${borderClasses(Boolean(dateIssue))} mt-2`}
                />
                {dateIssue ? (
                    <p id="scan-expense-date-error" className={FIELD_ERROR_CLASSES}>
                        {ISSUE_MESSAGES[dateIssue]}
                    </p>
                ) : (
                    <p className="mt-1.5 text-[11px] font-semibold text-slate-500">
                        No puede ser posterior a hoy en hora colombiana.
                    </p>
                )}
            </div>

            {/* Observación / descripción */}
            <div>
                <div className="flex items-center justify-between gap-2">
                    <label htmlFor="scan-expense-description" className={FIELD_LABEL_CLASSES}>
                        Observación
                    </label>
                    <button
                        type="button"
                        onClick={handleOpenObservationSheet}
                        onKeyDown={handleKeyActivate(handleOpenObservationSheet)}
                        tabIndex={0}
                        aria-label="Ampliar la observación del gasto"
                        className="flex size-11 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-200 active:scale-90"
                    >
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">open_in_full</span>
                    </button>
                </div>
                <textarea
                    id="scan-expense-description"
                    value={expense.description}
                    onChange={handleDescriptionChange}
                    rows={3}
                    placeholder="Describe el gasto con detalle..."
                    aria-label="Observación del gasto"
                    className={`${FIELD_INPUT_CLASSES} ${borderClasses(false)} mt-1 resize-none py-3`}
                />
            </div>

            {otherIssues.length > 0 && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                    {otherIssues.map(issue => (
                        <p key={issue} className="text-[11px] font-bold leading-snug text-rose-600">
                            {ISSUE_MESSAGES[issue]}
                        </p>
                    ))}
                </div>
            )}

            <button
                type="button"
                onClick={handleConfirm}
                onKeyDown={handleKeyActivate(handleConfirm)}
                disabled={isBlocked}
                aria-disabled={isBlocked}
                tabIndex={0}
                aria-label="Continuar al paso de pago del gasto"
                className={`${SCAN_PRIMARY_ACTION_CLASSES} w-full`}
            >
                <span className="material-symbols-outlined text-xl" aria-hidden="true">arrow_forward</span>
                {amountValue > 0 ? `Continuar · $${formatCurrency(amountValue)}` : 'Continuar'}
            </button>

            {/* Selector de categoría: vive dentro del paso (Req 11.3, 16.1) */}
            {showCategoryPicker && (
                <div className="fixed inset-0 z-[90]">
                    <CategoryPickerSheet
                        categories={categories}
                        selected={expense.category || ''}
                        onSelect={handleSelectCategory}
                        onCreate={handleCreateCategory}
                        onClose={handleCloseCategoryPicker}
                    />
                </div>
            )}

            {/* Observación ampliada */}
            {showObservationSheet && (
                <div className="fixed inset-0 z-[90]">
                    <ObservationSheet
                        initialValue={expense.description}
                        onSave={handleSaveObservation}
                        onClose={handleCloseObservationSheet}
                    />
                </div>
            )}
        </div>
    );
};

export default ScanExpenseFieldsStep;
