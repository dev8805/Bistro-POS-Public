/**
 * Constructor del payload de `register_expense` (Ruta_Gasto del Escaneo_Unificado).
 *
 * Módulo puro: no importa React, ni el cliente de Supabase, ni hace fetch.
 * Función determinista: el mismo borrador produce siempre el mismo payload.
 *
 * ## Por qué devuelve un resultado y no lanza
 *
 * El paso de pago necesita saber si el borrador ya está completo para habilitar
 * o deshabilitar el botón de confirmar (Req 11.5, Property 14). Si el
 * constructor lanzara una excepción, la UI tendría que repetir las mismas
 * validaciones para decidir el estado del botón, y esa duplicación es
 * exactamente lo que rompe la paridad entre lo que la UI cree válido y lo que
 * el motor acepta. Por eso `buildExpensePayload` devuelve un tipo discriminado:
 *
 *   - `{ kind: 'ready', payload }`      → el payload cumple todas las
 *     precondiciones del motor y se puede enviar tal cual.
 *   - `{ kind: 'incomplete', issues }`  → faltan datos. La UI deshabilita el
 *     botón y usa `issues` (códigos estables, en orden determinista) para
 *     señalar qué falta.
 *
 * El discriminante es un texto (`kind`) y no un booleano porque el proyecto
 * compila sin `strictNullChecks` y ahí TypeScript no estrecha uniones por
 * literales booleanos. Es la misma convención de `supplierMatch.ts`.
 *
 * Las validaciones son un espejo de las que hace `public.register_expense`
 * (migraciones `20260801041504` + `20260801042127`): `amount > 0`, categoría no
 * vacía, `expense_date` no posterior a hoy en `America/Bogota`, proveedor
 * obligatorio, crédito con `due_date` y `Σ métodos ≤ amount`. El motor sigue
 * siendo la autoridad: esto solo evita el viaje de ida y vuelta a un
 * `invalid_payload` seguro.
 */

import { parseLatinNumber, toPesos } from './numbers';
import { todayDateStringInTz } from '../timezone';
import type {
    PayloadPayment,
    PayloadPaymentMethod,
    PayloadSupplier,
    RegisterExpensePayload,
    ScanDraft,
    ScanSource,
} from './types';

/**
 * Payload de `register_expense` con el `payment_method` de raíz que el motor
 * acepta como método por defecto (lo escribe en `expenses.payment_method`).
 *
 * Se declara aquí en lugar de en `types.ts` porque es un campo opcional de
 * conveniencia del motor, no parte del contrato mínimo: si no llega, el motor
 * usa el `mapped_id` del primer método y, en su defecto, `cash`.
 */
export interface ExpensePayload extends RegisterExpensePayload {
    /** Método por defecto del gasto. Se omite cuando el borrador no tiene uno claro. */
    payment_method?: string;
}

/**
 * Parte del Borrador_Escaneo que la Ruta_Gasto necesita. Se pide un subconjunto
 * y no el `ScanDraft` completo para que las pruebas no tengan que fabricar la
 * imagen ni las líneas de la Ruta_Inventario.
 */
export type ExpenseDraftInput = Pick<
    ScanDraft,
    'idempotencyKey' | 'evidenceUrl' | 'supplier' | 'expense' | 'payment'
>;

export interface BuildExpensePayloadOptions {
    /** Origen del registro: el Escaneo_Unificado siempre es `'scan'`. */
    source: ScanSource;
    /** Negocio de la sesión. El motor solo lo usa para rechazar (Req 17.11). */
    businessId: string;
    /** URL de la Evidencia ya subida. Si se omite, se usa `draft.evidenceUrl`. */
    receiptUrl?: string | null;
    /**
     * "Hoy" en `America/Bogota`, formato "YYYY-MM-DD". Solo para pruebas
     * deterministas: en producción se calcula con `todayDateStringInTz()`.
     */
    today?: string;
}

/** Códigos estables de lo que falta o está mal en el borrador. */
export type ExpensePayloadIssue =
    | 'missing_business_id'
    | 'missing_idempotency_key'
    | 'missing_expense_fields'
    | 'invalid_amount'
    | 'missing_category'
    | 'missing_expense_date'
    | 'future_expense_date'
    | 'missing_supplier'
    | 'missing_due_date'
    | 'negative_paid_amount'
    | 'negative_method_amount'
    | 'overpayment'
    | 'unanswered_cash_question';

export type BuildExpensePayloadResult =
    | { kind: 'ready'; payload: ExpensePayload }
    | { kind: 'incomplete'; issues: ExpensePayloadIssue[] };

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** true solo si el texto es una fecha real del calendario en formato "YYYY-MM-DD". */
const isCalendarDate = (value: string): boolean => {
    if (!DATE_PATTERN.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
    );
};

const cleanText = (value: string | null | undefined): string => (value ?? '').trim();

const nullIfEmpty = (value: string | null | undefined): string | null => cleanText(value) || null;

/**
 * Traduce el proveedor del borrador al del payload. Devuelve `null` cuando no
 * hay proveedor utilizable: el motor lo exige (Req 5.8).
 */
const toPayloadSupplier = (supplier: ExpenseDraftInput['supplier']): PayloadSupplier | null => {
    if (!supplier) return null;

    if (supplier.kind === 'existing') {
        const id = cleanText(supplier.id);
        return id ? { id } : null;
    }

    const name = cleanText(supplier.name);
    if (!name) return null;
    return { new: { name, nit: nullIfEmpty(supplier.nit), phone: nullIfEmpty(supplier.phone) } };
};

/**
 * Construye el payload de `register_expense` a partir del Borrador_Escaneo.
 *
 * Reglas de emisión:
 * - `amount` sale del texto del borrador con `parseLatinNumber` (Formato_Numerico_Latino)
 *   y se redondea con `toPesos`: Colombia opera sin centavos.
 * - `category` viaja con el texto que el Usuario eligió; el motor lo pasa a
 *   MAYÚSCULAS y crea la categoría en el negocio de la sesión si no existe (Req 17.5).
 * - En Contado se fuerzan `due_date: null` y `paid_amount: 0`; en Crédito se
 *   fuerza `deduct_from_cash: false`. Cada modo manda solo lo que le aplica, así
 *   un cambio de modo en la UI no deja datos del modo anterior en el payload.
 * - Los métodos con monto cero se descartan (no aportan información al motor);
 *   un monto negativo es un error del borrador, no algo que se limpie en silencio.
 * - `payment_method` de raíz se emite solo cuando el borrador tiene un método
 *   claro: el del abono en Crédito, o el único método con monto en Contado.
 */
export const buildExpensePayload = (
    draft: ExpenseDraftInput,
    opts: BuildExpensePayloadOptions,
): BuildExpensePayloadResult => {
    const issues: ExpensePayloadIssue[] = [];

    const businessId = cleanText(opts.businessId);
    if (!businessId) issues.push('missing_business_id');

    const idempotencyKey = cleanText(draft.idempotencyKey);
    if (!idempotencyKey) issues.push('missing_idempotency_key');

    const expense = draft.expense;
    if (!expense) {
        // Sin el bloque de gasto no hay nada más que validar: los demás códigos
        // serían ruido derivado de la misma causa.
        issues.push('missing_expense_fields');
        return { kind: 'incomplete', issues };
    }

    const amount = toPesos(parseLatinNumber(expense.amount));
    if (amount <= 0) issues.push('invalid_amount');

    const category = cleanText(expense.category);
    if (!category) issues.push('missing_category');

    const expenseDate = cleanText(expense.date);
    const today = cleanText(opts.today) || todayDateStringInTz();
    if (!isCalendarDate(expenseDate)) {
        issues.push('missing_expense_date');
    } else if (expenseDate > today) {
        // Comparación de texto "YYYY-MM-DD": el orden lexicográfico coincide con
        // el cronológico, así que no hace falta construir fechas (Req 11.5).
        issues.push('future_expense_date');
    }

    const supplier = toPayloadSupplier(draft.supplier);
    if (!supplier) issues.push('missing_supplier');

    const { payment } = draft;
    const isCredit = payment.isCredit === true;

    const dueDate = nullIfEmpty(payment.dueDate);
    if (isCredit && (!dueDate || !isCalendarDate(dueDate))) issues.push('missing_due_date');

    const rawPaid = toPesos(payment.paidAmount);
    if (isCredit && rawPaid < 0) issues.push('negative_paid_amount');
    const paidAmount = isCredit ? Math.max(0, rawPaid) : 0;

    const rawMethods = Array.isArray(payment.methods) ? payment.methods : [];
    const normalizedMethods = rawMethods.map(m => ({
        mapped_id: cleanText(m.mappedId) || 'cash',
        amount: toPesos(m.amount),
    }));
    if (normalizedMethods.some(m => m.amount < 0)) issues.push('negative_method_amount');

    const methods: PayloadPaymentMethod[] = normalizedMethods.filter(m => m.amount > 0);
    const methodsTotal = methods.reduce((acc, m) => acc + m.amount, 0);
    if (amount > 0 && methodsTotal > amount) issues.push('overpayment');

    const shiftId = nullIfEmpty(payment.shiftId);

    // Con turno abierto y pago de Contado, la pregunta de descuento de caja es
    // obligatoria: `null` significa que el Usuario no respondió (Req 10.6, 11.5).
    if (!isCredit && shiftId && payment.deductFromCash === null) {
        issues.push('unanswered_cash_question');
    }
    const deductFromCash = payment.deductFromCash === true;

    const creditInitialMethod = isCredit ? nullIfEmpty(payment.creditInitialMethodId) : null;

    if (issues.length > 0 || !supplier) return { kind: 'incomplete', issues };

    const payloadPayment: PayloadPayment = {
        is_credit: isCredit,
        due_date: isCredit ? dueDate : null,
        paid_amount: paidAmount,
        deduct_from_cash: deductFromCash,
        shift_id: shiftId,
        methods,
        credit_initial_method: creditInitialMethod,
    };

    const defaultMethod = isCredit
        ? creditInitialMethod
        : methods.length === 1
            ? methods[0].mapped_id
            : null;

    const receiptUrl = nullIfEmpty(opts.receiptUrl ?? draft.evidenceUrl);

    const payload: ExpensePayload = {
        v: 1,
        idempotency_key: idempotencyKey,
        business_id: businessId,
        source: opts.source,
        expense_date: expenseDate,
        receipt_url: receiptUrl,
        amount,
        description: cleanText(expense.description),
        category,
        supplier,
        payment: payloadPayment,
    };

    if (defaultMethod) payload.payment_method = defaultMethod;

    return { kind: 'ready', payload };
};
