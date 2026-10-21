import React, { useMemo, useRef, useState, useEffect } from 'react';
import { formatWithThousands, parseCleanNumber, getLocalDateValue } from '../expense/shared';
import { formatCurrency } from '../../lib/formatters';
import {
    SCAN_PRIMARY_ACTION_CLASSES,
} from './ScanStepShell';
import type { ExpensePayloadIssue } from '../../lib/invoiceScan/buildExpensePayload';
import type { PaymentDraft, PaymentMethodDraft } from '../../lib/invoiceScan/types';

/**
 * Paso de pago del Escaneo_Unificado (Req 10.5, 10.6, 16.2, 16.3).
 *
 * Sirve por igual a la Ruta_Inventario y a la Ruta_Gasto: la máquina de estados
 * llega a `payment` desde el Panel_Revision (compra) y desde el paso de campos
 * del gasto. Todo el pago ocurre en esta superficie, sin abrir el panel de
 * Compra de Inventario ni el modal de Otros Gastos (Req 16.2, 16.3).
 *
 * Alineado estrictamente con el flujo manual de Gastos (ExpenseRegister):
 * - Control de turno y pregunta de salida de caja:
 *   - Estado neutro inicial (`deductFromCash === null`) que oculta los métodos hasta responder Sí o No.
 *   - Si Sí: se descuenta del turno (únicamente el efectivo físico valida saldo y genera movimiento en caja).
 *   - Si No: fondos externos (registro informativo sin alterar arqueos de caja y sin validar saldo disponible).
 *   - Sin turno: banner informativo y métodos visibles.
 * - Crédito:
 *   - Selector de fecha de vencimiento estilo tarjeta con botón "Elegir" y apertura nativa relativa.
 *   - Abono inicial opcional con desglose reactivo (Total Factura, Abono Inicial, Saldo Pendiente).
 *   - Si abono > 0 con turno activo: pregunta de salida de caja para el abono y medios de pago.
 * - Soporte para Método Único y Pago Dividido:
 *   - Permite repartir tanto el total de contado como el abono de crédito entre múltiples medios.
 *   - Desglose con badges reactivos (✓ Monto completo, Restante por asignar, Monto excedido).
 */

/** Método de pago con su saldo, ya resuelto por el host. */
export interface ScanPaymentMethodOption {
    /** id normalizado del método; coincide con `PaymentMethodDraft.methodId`. */
    id: string;
    /** Nombre visible configurado por el negocio. */
    label: string;
    /** Categoría de BD del método ('cash'/'card'/…); coincide con `mappedId`. */
    mappedId: string;
    /** Saldo disponible en caja para ese método. Solo se usa como aviso de UX. */
    balance: number;
}

export interface ScanPaymentStepProps {
    /** Modo de pago del Borrador_Escaneo. */
    payment: PaymentDraft;
    /**
     * Total del registro: total de la compra en la Ruta_Inventario o valor del
     * gasto en la Ruta_Gasto. El host pasa el que corresponde a su ruta.
     */
    total: number;
    /** Métodos del Negocio_Activo con su saldo, ya resueltos por el host (Req 17.14). */
    methods: ScanPaymentMethodOption[];
    /** Hay un turno de caja abierto. Gobierna la pregunta de descuento de caja. */
    hasActiveShift: boolean;
    /**
     * Ruta_Inventario: restringe el pago dividido a métodos de efectivo con
     * turno. La Ruta_Gasto lo pasa en `false` para ofrecer todos los métodos.
     */
    restrictCashToShift?: boolean;
    /** Códigos de validación pendientes del builder compartido. Vacío = el paso valida. */
    issues: ExpensePayloadIssue[];
    /** Emite el `PaymentDraft` completo actualizado. */
    onChange: (payment: PaymentDraft) => void;
    /** Continúa a la Finalizacion_Registro. */
    onConfirm: () => void;
    /** Texto del botón de confirmar; lo fija cada ruta ("Registrar compra"/"gasto"). */
    confirmLabel?: string;
    /** Bloquea el confirmar mientras el flujo trabaja. */
    isSubmitting?: boolean;
}

/** Mensaje de cada código, para mostrarlo junto a su control. */
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
    overpayment: 'La suma de los pagos supera el total.',
    unanswered_cash_question: 'Responde si el dinero sale de caja.',
};

/** Nombre corto de lo que falta, para la frase de onboarding. */
const MISSING_LABELS: Partial<Record<ExpensePayloadIssue, string>> = {
    missing_due_date: 'la fecha de vencimiento',
    unanswered_cash_question: 'responder si el dinero sale de caja',
    overpayment: 'ajustar los pagos, que superan el total',
    negative_paid_amount: 'corregir el abono',
    negative_method_amount: 'corregir los montos de pago',
};

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const formatDateLabel = (dateStr: string): string => {
    if (!dateStr) return 'Elegir fecha de pago';
    if (!dateStr.includes('T') && dateStr.includes('-')) {
        const [y, m, d] = dateStr.split('-');
        const monthIdx = parseInt(m, 10) - 1;
        return `${parseInt(d, 10)} ${MONTHS_SHORT[monthIdx] || ''} ${y}`;
    }
    return dateStr;
};

/** Códigos que este paso explica junto a un control concreto. */
const DUE_DATE_ISSUES: ExpensePayloadIssue[] = ['missing_due_date'];
const ABONO_ISSUES: ExpensePayloadIssue[] = ['negative_paid_amount'];
const METHOD_ISSUES: ExpensePayloadIssue[] = ['negative_method_amount', 'overpayment'];
const CASH_QUESTION_ISSUES: ExpensePayloadIssue[] = ['unanswered_cash_question'];
const FIELD_ISSUES: ExpensePayloadIssue[] = [
    ...DUE_DATE_ISSUES,
    ...ABONO_ISSUES,
    ...METHOD_ISSUES,
    ...CASH_QUESTION_ISSUES,
];

const FIELD_LABEL_CLASSES =
    'block text-[10px] font-black uppercase tracking-[0.14em] text-slate-600';

const FIELD_INPUT_CLASSES =
    'w-full min-h-[44px] rounded-2xl border bg-white px-4 text-sm font-bold text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-amber-400';

const FIELD_ERROR_CLASSES = 'mt-1.5 text-[11px] font-bold leading-snug text-rose-600';

const MODE_BUTTON_BASE =
    'flex min-h-[44px] items-center justify-center rounded-2xl border text-[11px] font-black uppercase tracking-widest transition-colors active:scale-[0.98]';

const isActivationKey = (key: string): boolean => key === 'Enter' || key === ' ' || key === 'Spacebar';

/** "a", "a y b", "a, b y c". */
const joinWithY = (parts: string[]): string => {
    if (parts.length <= 1) return parts[0] ?? '';
    return `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
};

const borderClasses = (hasError: boolean): string =>
    hasError ? 'border-rose-300 focus:border-rose-500' : 'border-slate-200';

/** Monto entero como texto con separador de miles; vacío cuando es cero. */
const amountText = (value: number): string =>
    value > 0 ? formatWithThousands(String(Math.round(value))) : '';

export const ScanPaymentStep: React.FC<ScanPaymentStepProps> = ({
    payment,
    total,
    methods,
    hasActiveShift,
    restrictCashToShift = false,
    issues,
    onChange,
    onConfirm,
    confirmLabel = 'Confirmar registro',
    isSubmitting = false,
}) => {
    const dueDateInputRef = useRef<HTMLInputElement>(null);
    const isCredit = payment.isCredit === true;

    const dismissKeyboard = () => {
        if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
        }
    };

    const pending = useMemo(() => (Array.isArray(issues) ? issues : []), [issues]);

    const dueDateIssue = pending.find(i => DUE_DATE_ISSUES.includes(i));
    const abonoIssue = pending.find(i => ABONO_ISSUES.includes(i));
    const methodIssue = pending.find(i => METHOD_ISSUES.includes(i));
    const cashQuestionIssue = pending.find(i => CASH_QUESTION_ISSUES.includes(i));
    const otherIssues = useMemo(() => pending.filter(i => !FIELD_ISSUES.includes(i)), [pending]);

    // Métodos disponibles para el pago de Contado
    const contadoMethods = useMemo(() => {
        if (restrictCashToShift && hasActiveShift && payment.deductFromCash === true) {
            return methods.filter(m => m.mappedId === 'cash');
        }
        return methods;
    }, [methods, restrictCashToShift, hasActiveShift, payment.deductFromCash]);

    // Métodos disponibles para el abono de Crédito: siempre ofrece todos los medios del negocio
    // para permitir pagos divididos (donde solo el efectivo físico descuenta de caja registradora
    // y los medios electrónicos como Nequi, Daviplata, etc. quedan como soporte informativo).
    const abonoAvailableMethods = useMemo(() => {
        return methods;
    }, [methods]);

    const activeMethodsList = isCredit ? abonoAvailableMethods : contadoMethods;

    const paymentMethods = payment.methods ?? [];
    const paidTotal = paymentMethods.reduce((acc, m) => acc + (m.amount || 0), 0);
    const paidAmount = Math.max(0, payment.paidAmount || 0);
    const pendingBalance = Math.max(0, total - paidAmount);

    const usedMethodIds = useMemo(
        () => new Set(paymentMethods.map(m => m.methodId)),
        [paymentMethods],
    );
    const canAddMethod = activeMethodsList.some(m => !usedMethodIds.has(m.id));

    // Monto objetivo a repartir entre los métodos
    const targetAmount = isCredit ? paidAmount : total;
    const remainingAmount = targetAmount - paidTotal;

    // Solo se valida saldo en efectivo si hay turno y el dinero sale de caja
    const shouldValidateCash = Boolean(hasActiveShift && payment.deductFromCash === true);

    const isRowInsufficient = (row: PaymentMethodDraft) => {
        if (!shouldValidateCash) return false;
        const option = methods.find(m => m.id === row.methodId);
        const isCash = (option ? option.mappedId : row.mappedId) === 'cash';
        if (!isCash) return false;
        const balance = option ? option.balance : 0;
        return (row.amount || 0) > balance;
    };

    const isCreditAbonoPendingCash = isCredit && paidAmount > 0 && hasActiveShift && payment.deductFromCash === null;

    const onboardingText = useMemo(() => {
        if (pending.length === 0 && !isCreditAbonoPendingCash) {
            return 'Todo listo para registrar. Revisa el pago y confirma.';
        }
        const labels = pending.map(i => MISSING_LABELS[i]).filter(Boolean) as string[];
        if (isCreditAbonoPendingCash && !labels.includes('responder si el abono sale de caja')) {
            labels.push('responder si el abono sale de caja');
        }
        if (labels.length === 0) return 'Revisa los avisos de esta pantalla para poder registrar.';
        return `Para registrar falta ${joinWithY(labels)}.`;
    }, [pending, isCreditAbonoPendingCash]);

    const isBlocked = pending.length > 0 || isSubmitting || isCreditAbonoPendingCash;

    // ---- Emisores del PaymentDraft ----

    const emit = (patch: Partial<PaymentDraft>) => onChange({ ...payment, ...patch });

    const emitMethods = (nextMethods: PaymentMethodDraft[]) => {
        const patch: Partial<PaymentDraft> = { methods: nextMethods };
        if (isCredit && nextMethods.length > 0) {
            patch.creditInitialMethodId = nextMethods[0].methodId;
        }
        emit(patch);
    };

    const buildDefaultRow = (rowAmount = 0): PaymentMethodDraft => {
        const first = activeMethodsList[0] || methods[0];
        if (first) return { methodId: first.id, mappedId: first.mappedId, amount: rowAmount };
        return { methodId: 'cash', mappedId: 'cash', amount: rowAmount };
    };

    const handleSetContado = () => {
        emit({
            isCredit: false,
            dueDate: null,
            paidAmount: 0,
            creditInitialMethodId: null,
        });
    };

    const handleSetCredit = () => {
        emit({
            isCredit: true,
            deductFromCash: null,
            methods: [],
            paidAmount: 0,
            creditInitialMethodId: null,
        });
    };

    const handleDeductFromCash = (value: boolean) => {
        dismissKeyboard();
        const hasExistingAmounts = paymentMethods.some(m => (m.amount || 0) > 0);
        const defaultAmt = total > 0 ? total : 0;
        emit({
            deductFromCash: value,
            methods: paymentMethods.length > 0
                ? (hasExistingAmounts ? paymentMethods : [{ ...paymentMethods[0], amount: defaultAmt }])
                : [buildDefaultRow(defaultAmt)],
        });
    };

    const handleCreditDeductFromCash = (value: boolean) => {
        dismissKeyboard();
        const patch: Partial<PaymentDraft> = { deductFromCash: value };
        if (paidAmount > 0) {
            if (paymentMethods.length === 0) {
                const first = abonoAvailableMethods[0] || methods[0];
                if (first) {
                    patch.methods = [{ methodId: first.id, mappedId: first.mappedId, amount: paidAmount }];
                    patch.creditInitialMethodId = first.id;
                }
            } else if (paymentMethods.length === 1) {
                patch.methods = [{ ...paymentMethods[0], amount: paidAmount }];
                patch.creditInitialMethodId = paymentMethods[0].methodId;
            }
        }
        emit(patch);
    };

    const handleMethodChange = (index: number, methodId: string) => {
        const option = methods.find(m => m.id === methodId);
        const next = paymentMethods.map((m, i) =>
            i === index
                ? { ...m, methodId, mappedId: option ? option.mappedId : m.mappedId }
                : m,
        );
        emitMethods(next);
    };

    const handleMethodAmount = (index: number, raw: string) => {
        const value = Number(parseCleanNumber(raw)) || 0;
        const next = paymentMethods.map((m, i) => (i === index ? { ...m, amount: value } : m));
        emitMethods(next);
    };

    const handleAddMethod = () => {
        const available = activeMethodsList.find(m => !usedMethodIds.has(m.id));
        if (!available) return;
        emitMethods([
            ...paymentMethods,
            { methodId: available.id, mappedId: available.mappedId, amount: 0 },
        ]);
    };

    const handleRemoveMethod = (index: number) => {
        if (paymentMethods.length <= 1) return;
        const next = paymentMethods.filter((_, i) => i !== index);
        emitMethods(next);
    };

    const handleDueDate = (value: string) => emit({ dueDate: value || null });

    const handleOpenDueDatePicker = () => {
        if (dueDateInputRef.current) {
            try {
                (dueDateInputRef.current as any).showPicker();
            } catch {
                dueDateInputRef.current.focus();
            }
        }
    };

    const handleAbono = (raw: string) => {
        const val = Number(parseCleanNumber(raw)) || 0;
        const patch: Partial<PaymentDraft> = { paidAmount: val };
        if (val > 0) {
            if (paymentMethods.length <= 1) {
                const first = paymentMethods[0] || buildDefaultRow(val);
                patch.methods = [{ ...first, amount: val }];
                patch.creditInitialMethodId = first.methodId;
            }
        } else {
            patch.methods = [];
            patch.creditInitialMethodId = null;
            patch.deductFromCash = null;
        }
        emit(patch);
    };

    const handleConfirm = () => {
        if (isBlocked) return;
        onConfirm();
    };

    const handleKeyActivate = (action: () => void) => (
        e: React.KeyboardEvent<HTMLElement>,
    ) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        action();
    };

    const modeClasses = (active: boolean): string =>
        active
            ? `${MODE_BUTTON_BASE} border-amber-400 bg-amber-50 text-slate-900 shadow-sm`
            : `${MODE_BUTTON_BASE} border-slate-200 bg-white text-slate-400 hover:border-slate-300`;

    // Renderizado del bloque de métodos de pago reutilizable
    const renderPaymentMethodsBlock = (labelTitle: string) => (
        <div className="space-y-2">
            <div>
                <span className={FIELD_LABEL_CLASSES}>{labelTitle}</span>
            </div>

            <ul className="space-y-2">
                {paymentMethods.map((row, index) => {
                    const option = methods.find(m => m.id === row.methodId);
                    const balance = option ? option.balance : 0;
                    const isCash = (option ? option.mappedId : row.mappedId) === 'cash';
                    const insufficient = isRowInsufficient(row);
                    const label = option ? option.label : row.methodId;
                    return (
                        <li key={`${row.methodId}-${index}`} className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <select
                                    value={row.methodId}
                                    onChange={e => handleMethodChange(index, e.target.value)}
                                    aria-label={`Método de pago ${index + 1}`}
                                    className="min-h-[44px] flex-1 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none focus:border-amber-400"
                                >
                                    {activeMethodsList.map(m => (
                                        <option key={m.id} value={m.id}>{m.label}</option>
                                    ))}
                                </select>
                                <div className="relative flex-1">
                                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">
                                        $
                                    </span>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={amountText(row.amount || 0)}
                                        onChange={e => handleMethodAmount(index, e.target.value)}
                                        placeholder="0"
                                        aria-label={`Monto pagado con ${label}`}
                                        className={`${FIELD_INPUT_CLASSES} ${borderClasses(insufficient)} pl-7 tabular-nums focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 selection:bg-blue-600 selection:text-white`}
                                    />
                                </div>
                                {paymentMethods.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveMethod(index)}
                                        onKeyDown={handleKeyActivate(() => handleRemoveMethod(index))}
                                        aria-label={`Quitar el método ${label}`}
                                        className="flex size-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 active:scale-90"
                                    >
                                        <span className="material-symbols-outlined text-xl" aria-hidden="true">delete</span>
                                    </button>
                                )}
                            </div>

                            {/* Aviso de saldo disponible en caja física únicamente cuando sale de caja */}
                            {shouldValidateCash && isCash && (
                                <p className={`ml-1 text-[10px] font-bold ${insufficient ? 'text-rose-600' : 'text-slate-500'}`}>
                                    {insufficient
                                        ? `Saldo insuficiente en ${label}. Disponible: $${formatCurrency(balance)}`
                                        : `Disponible en caja: $${formatCurrency(balance)}`}
                                </p>
                            )}
                            {/* Aviso informativo de fondos externos */}
                            {((!shouldValidateCash && payment.deductFromCash === false) || (shouldValidateCash && !isCash)) && (
                                <p className="ml-1 text-[10px] font-semibold text-slate-400">
                                    Fondos externos (no afecta el arqueo de caja)
                                </p>
                            )}
                        </li>
                    );
                })}
            </ul>

            {canAddMethod && (
                <button
                    type="button"
                    onClick={handleAddMethod}
                    onKeyDown={handleKeyActivate(handleAddMethod)}
                    aria-label="Agregar otro método de pago"
                    className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 text-[11px] font-black uppercase tracking-widest text-slate-500 transition-colors hover:bg-slate-100"
                >
                    <span className="material-symbols-outlined text-base" aria-hidden="true">add_circle</span>
                    Agregar método
                </button>
            )}

            {/* Estado reactivo del monto asignado */}
            {targetAmount > 0 && paymentMethods.length > 0 && (
                <div className={`mt-3 flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
                    remainingAmount === 0
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : remainingAmount < 0
                        ? 'border-rose-300 bg-rose-50 text-rose-700'
                        : 'border-amber-300 bg-amber-50 text-amber-700'
                }`}>
                    <span>
                        {remainingAmount === 0
                            ? '✓ Monto completo'
                            : remainingAmount < 0
                            ? 'Monto excedido'
                            : 'Restante por asignar'}
                    </span>
                    <span className="font-black">
                        ${formatCurrency(Math.abs(remainingAmount))} COP
                    </span>
                </div>
            )}

            <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                    {isCredit ? 'Total abono pagado' : 'Total pagado'}
                </span>
                <span className="text-lg font-black text-slate-900">{`$${formatCurrency(paidTotal)}`}</span>
            </div>
            {methodIssue && (
                <p className={FIELD_ERROR_CLASSES}>{ISSUE_MESSAGES[methodIssue]}</p>
            )}
        </div>
    );

    return (
        <div className="flex flex-col gap-5">
            <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-bold leading-snug text-emerald-900">
                {onboardingText}
            </p>

            {/* Tipo de pago: Contado / Crédito */}
            <div>
                <span className={FIELD_LABEL_CLASSES}>Tipo de pago</span>
                <div className="mt-2 grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        onPointerDown={dismissKeyboard}
                        onClick={() => {
                            dismissKeyboard();
                            handleSetContado();
                        }}
                        onKeyDown={handleKeyActivate(handleSetContado)}
                        aria-pressed={!isCredit}
                        aria-label="Pago de contado"
                        className={modeClasses(!isCredit)}
                    >
                        Contado
                    </button>
                    <button
                        type="button"
                        onPointerDown={dismissKeyboard}
                        onClick={() => {
                            dismissKeyboard();
                            handleSetCredit();
                        }}
                        onKeyDown={handleKeyActivate(handleSetCredit)}
                        aria-pressed={isCredit}
                        aria-label="Pago a crédito"
                        className={modeClasses(isCredit)}
                    >
                        Crédito
                    </button>
                </div>
            </div>

            {/* ---- CRÉDITO ---- */}
            {isCredit && (
                <>
                    {/* Selector interactivo de fecha de vencimiento estilo tarjeta */}
                    <div>
                        <label htmlFor="scan-payment-due-date" className={FIELD_LABEL_CLASSES}>
                            Fecha de vencimiento <span className="text-rose-600">*</span>
                        </label>
                        <div
                            onClick={handleOpenDueDatePicker}
                            className={`relative mt-2 flex min-h-[48px] items-center justify-between rounded-2xl border bg-white px-4 cursor-pointer transition-colors ${borderClasses(Boolean(dueDateIssue))} hover:border-amber-400`}
                        >
                            <div className="flex items-center gap-2.5">
                                <span className="material-symbols-outlined text-[20px] text-slate-400" aria-hidden="true">
                                    calendar_month
                                </span>
                                <span className={`text-sm font-bold ${payment.dueDate ? 'text-slate-900' : 'text-slate-400'}`}>
                                    {formatDateLabel(payment.dueDate || '')}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenDueDatePicker();
                                }}
                                aria-label="Elegir fecha de vencimiento"
                                className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-800 transition-colors"
                            >
                                Elegir
                            </button>
                            <input
                                ref={dueDateInputRef}
                                id="scan-payment-due-date"
                                type="date"
                                value={payment.dueDate || ''}
                                min={getLocalDateValue()}
                                onChange={e => handleDueDate(e.target.value)}
                                aria-label="Fecha de vencimiento del crédito"
                                aria-invalid={Boolean(dueDateIssue)}
                                aria-describedby={dueDateIssue ? 'scan-payment-due-date-error' : undefined}
                                className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
                                tabIndex={-1}
                            />
                        </div>
                        {dueDateIssue ? (
                            <p id="scan-payment-due-date-error" className={FIELD_ERROR_CLASSES}>
                                {ISSUE_MESSAGES[dueDateIssue]}
                            </p>
                        ) : (
                            <p className="mt-1.5 text-[11px] font-semibold text-slate-500">
                                Obligatoria en crédito: es la fecha en la que se debe pagar.
                            </p>
                        )}
                    </div>

                    {/* Abono inicial opcional */}
                    <div>
                        <label htmlFor="scan-payment-abono" className={FIELD_LABEL_CLASSES}>
                            Abono inicial (opcional)
                        </label>
                        <div className="relative mt-2">
                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">
                                $
                            </span>
                            <input
                                id="scan-payment-abono"
                                type="text"
                                inputMode="numeric"
                                value={amountText(payment.paidAmount || 0)}
                                onChange={e => handleAbono(e.target.value)}
                                placeholder="0"
                                aria-label="Abono inicial del crédito"
                                aria-invalid={Boolean(abonoIssue)}
                                aria-describedby={abonoIssue ? 'scan-payment-abono-error' : undefined}
                                className={`${FIELD_INPUT_CLASSES} ${borderClasses(Boolean(abonoIssue))} pl-8 tabular-nums`}
                            />
                        </div>
                        {abonoIssue && (
                            <p id="scan-payment-abono-error" className={FIELD_ERROR_CLASSES}>
                                {ISSUE_MESSAGES[abonoIssue]}
                            </p>
                        )}

                        {/* Desglose financiero reactivo */}
                        {(paidAmount > 0 || total > 0) && (
                            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 space-y-1.5 text-xs">
                                <div className="flex justify-between items-center text-slate-500">
                                    <span>Total Factura:</span>
                                    <span className="font-bold text-slate-900">${formatCurrency(total)} COP</span>
                                </div>
                                {paidAmount > 0 && (
                                    <div className="flex justify-between items-center text-emerald-600 font-bold">
                                        <span>Abono inicial:</span>
                                        <span>-${formatCurrency(paidAmount)} COP</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-center pt-1.5 border-t border-slate-200 font-black">
                                    <span className="text-slate-600 uppercase tracking-wider text-[10px]">Saldo pendiente:</span>
                                    <span className={`text-sm ${pendingBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                        ${formatCurrency(pendingBalance)} COP
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Si hay abono inicial: control de caja y método de pago del abono */}
                    {paidAmount > 0 && (
                        <div className="space-y-3 pt-2 border-t border-slate-200">
                            {hasActiveShift ? (
                                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className={FIELD_LABEL_CLASSES}>¿El dinero del abono sale de caja?</span>
                                        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 gap-1">
                                            <button
                                                type="button"
                                                onPointerDown={dismissKeyboard}
                                                onClick={() => {
                                                    dismissKeyboard();
                                                    handleCreditDeductFromCash(true);
                                                }}
                                                onKeyDown={handleKeyActivate(() => handleCreditDeductFromCash(true))}
                                                aria-pressed={payment.deductFromCash === true}
                                                aria-label="Sí, el dinero sale de caja"
                                                className={payment.deductFromCash === true
                                                    ? 'flex min-h-[36px] items-center justify-center gap-1 rounded-lg bg-emerald-50 px-4 text-[11px] font-black uppercase tracking-widest text-emerald-700 border border-emerald-300 shadow-sm'
                                                    : 'flex min-h-[36px] items-center justify-center gap-1 rounded-lg px-4 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600'}
                                            >
                                                {payment.deductFromCash === true && (
                                                    <span className="material-symbols-outlined text-xs" aria-hidden="true">check</span>
                                                )}
                                                Sí
                                            </button>
                                            <button
                                                type="button"
                                                onPointerDown={dismissKeyboard}
                                                onClick={() => {
                                                    dismissKeyboard();
                                                    handleCreditDeductFromCash(false);
                                                }}
                                                onKeyDown={handleKeyActivate(() => handleCreditDeductFromCash(false))}
                                                aria-pressed={payment.deductFromCash === false}
                                                aria-label="No, el dinero no sale de caja"
                                                className={payment.deductFromCash === false
                                                    ? 'flex min-h-[36px] items-center justify-center gap-1 rounded-lg bg-rose-50 px-4 text-[11px] font-black uppercase tracking-widest text-rose-600 border border-rose-300 shadow-sm'
                                                    : 'flex min-h-[36px] items-center justify-center gap-1 rounded-lg px-4 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600'}
                                            >
                                                {payment.deductFromCash === false && (
                                                    <span className="material-symbols-outlined text-xs" aria-hidden="true">close</span>
                                                )}
                                                No
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-[11px] font-semibold text-slate-500 leading-snug">
                                        {payment.deductFromCash === true
                                            ? 'El abono se descontará de la caja física (solo efectivo descuenta del arqueo).'
                                            : payment.deductFromCash === false
                                            ? 'Fondos externos: No se registrará en este turno ni afectará el arqueo de caja.'
                                            : 'Indica si el abono saldrá del efectivo de la caja o de fondos externos.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 flex items-center gap-2 text-[11px] font-bold text-slate-500">
                                    <span className="material-symbols-outlined text-base text-slate-400" aria-hidden="true">info</span>
                                    <span>Sin caja abierta: El abono no se registrará en ningún turno ni afectará el arqueo de caja.</span>
                                </div>
                            )}

                            {/* Medios de pago para el abono (visibles si no hay turno o si ya se respondió Sí/No) */}
                            {(!hasActiveShift || payment.deductFromCash !== null) && (
                                renderPaymentMethodsBlock('Método de pago del abono')
                            )}
                        </div>
                    )}
                </>
            )}

            {/* ---- CONTADO ---- */}
            {!isCredit && (
                <div className="flex flex-col gap-4">
                    {hasActiveShift ? (
                        <div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <span className={FIELD_LABEL_CLASSES}>¿El dinero sale de caja?</span>
                                    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 gap-1">
                                        <button
                                            type="button"
                                            onPointerDown={dismissKeyboard}
                                            onClick={() => {
                                                dismissKeyboard();
                                                handleDeductFromCash(true);
                                            }}
                                            onKeyDown={handleKeyActivate(() => handleDeductFromCash(true))}
                                            aria-pressed={payment.deductFromCash === true}
                                            aria-label="Sí, el dinero sale de caja"
                                            className={payment.deductFromCash === true
                                                ? 'flex min-h-[36px] items-center justify-center gap-1 rounded-lg bg-emerald-50 px-4 text-[11px] font-black uppercase tracking-widest text-emerald-700 border border-emerald-300 shadow-sm'
                                                : 'flex min-h-[36px] items-center justify-center gap-1 rounded-lg px-4 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600'}
                                        >
                                            {payment.deductFromCash === true && (
                                                <span className="material-symbols-outlined text-xs" aria-hidden="true">check</span>
                                            )}
                                            Sí
                                        </button>
                                        <button
                                            type="button"
                                            onPointerDown={dismissKeyboard}
                                            onClick={() => {
                                                dismissKeyboard();
                                                handleDeductFromCash(false);
                                            }}
                                            onKeyDown={handleKeyActivate(() => handleDeductFromCash(false))}
                                            aria-pressed={payment.deductFromCash === false}
                                            aria-label="No, el dinero no sale de caja"
                                            className={payment.deductFromCash === false
                                                ? 'flex min-h-[36px] items-center justify-center gap-1 rounded-lg bg-rose-50 px-4 text-[11px] font-black uppercase tracking-widest text-rose-600 border border-rose-300 shadow-sm'
                                                : 'flex min-h-[36px] items-center justify-center gap-1 rounded-lg px-4 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600'}
                                        >
                                            {payment.deductFromCash === false && (
                                                <span className="material-symbols-outlined text-xs" aria-hidden="true">close</span>
                                            )}
                                            No
                                        </button>
                                    </div>
                                </div>
                                <p className="text-[11px] font-semibold text-slate-500 leading-snug">
                                    {payment.deductFromCash === true
                                        ? 'El egreso se descontará de la caja del turno (solo el efectivo físico descuenta del saldo de caja).'
                                        : payment.deductFromCash === false
                                        ? 'Fondos externos: No se registrará en este turno ni afectará el arqueo de caja.'
                                        : 'Indica si el dinero saldrá del efectivo de la caja o de fondos externos.'}
                                </p>
                            </div>
                            {cashQuestionIssue && (
                                <p className={FIELD_ERROR_CLASSES}>{ISSUE_MESSAGES[cashQuestionIssue]}</p>
                            )}
                        </div>
                    ) : (
                        <p className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-semibold leading-snug text-slate-500">
                            No hay caja abierta: este pago se registra pero no afecta los movimientos de caja.
                        </p>
                    )}

                    {/* Métodos de pago en Contado (visibles si no hay turno o si ya se eligió Sí/No) */}
                    {(!hasActiveShift || payment.deductFromCash !== null) && (
                        renderPaymentMethodsBlock('Método de pago')
                    )}
                </div>
            )}

            {/* Avisos que no pertenecen a un control del paso */}
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
                aria-label={confirmLabel}
                className={`${SCAN_PRIMARY_ACTION_CLASSES} w-full`}
            >
                <span className="material-symbols-outlined text-xl" aria-hidden="true">check_circle</span>
                {total > 0 ? `${confirmLabel} · $${formatCurrency(total)}` : confirmLabel}
            </button>
        </div>
    );
};

export default ScanPaymentStep;
