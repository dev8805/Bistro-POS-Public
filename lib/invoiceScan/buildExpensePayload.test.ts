import { describe, it, expect } from 'vitest';
import {
    buildExpensePayload,
    type BuildExpensePayloadResult,
    type ExpenseDraftInput,
    type ExpensePayload,
    type ExpensePayloadIssue,
} from './buildExpensePayload';
import type { PaymentDraft, ScanExpenseDraft, ScanSupplierDraft } from './types';

const KEY = '8f14e45f-ea3b-4b1d-9c2e-1a2b3c4d5e6f';
const BUSINESS = 'b1111111-2222-3333-4444-555555555555';
const SHIFT = 'c1111111-2222-3333-4444-555555555555';
const SUPPLIER_ID = 'd1111111-2222-3333-4444-555555555555';
const TODAY = '2026-08-01';

const contado = (over: Partial<PaymentDraft> = {}): PaymentDraft => ({
    isCredit: false,
    dueDate: null,
    paidAmount: 0,
    deductFromCash: true,
    shiftId: SHIFT,
    methods: [{ methodId: 'Efectivo', mappedId: 'cash', amount: 85000 }],
    creditInitialMethodId: null,
    ...over,
});

const expenseFields = (over: Partial<ScanExpenseDraft> = {}): ScanExpenseDraft => ({
    amount: '85000',
    description: 'Energía · julio 2026',
    category: 'Servicios',
    date: TODAY,
    ...over,
});

const draftOf = (
    over: Partial<ExpenseDraftInput> = {},
    supplier: ScanSupplierDraft = { kind: 'existing', id: SUPPLIER_ID, name: 'AIRE' },
): ExpenseDraftInput => ({
    idempotencyKey: KEY,
    evidenceUrl: 'https://x/debt-evidence/biz/f.webp',
    supplier,
    expense: expenseFields(),
    payment: contado(),
    ...over,
});

const build = (draft: ExpenseDraftInput) =>
    buildExpensePayload(draft, { source: 'scan', businessId: BUSINESS, today: TODAY });

/** Exige un payload listo y lo devuelve, para no repetir el estrechamiento. */
const expectReady = (result: BuildExpensePayloadResult): ExpensePayload => {
    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') throw new Error('se esperaba un payload listo');
    return result.payload;
};

/** Exige un borrador incompleto y devuelve sus códigos. */
const expectIssues = (result: BuildExpensePayloadResult): ExpensePayloadIssue[] => {
    expect(result.kind).toBe('incomplete');
    if (result.kind !== 'incomplete') throw new Error('se esperaba un borrador incompleto');
    return result.issues;
};

describe('buildExpensePayload — payloads válidos', () => {
    it('arma el gasto de contado con un solo método de pago', () => {
        expect(expectReady(build(draftOf()))).toEqual({
            v: 1,
            idempotency_key: KEY,
            business_id: BUSINESS,
            source: 'scan',
            expense_date: TODAY,
            receipt_url: 'https://x/debt-evidence/biz/f.webp',
            amount: 85000,
            description: 'Energía · julio 2026',
            category: 'Servicios',
            supplier: { id: SUPPLIER_ID },
            payment: {
                is_credit: false,
                due_date: null,
                paid_amount: 0,
                deduct_from_cash: true,
                shift_id: SHIFT,
                methods: [{ mapped_id: 'cash', amount: 85000 }],
                credit_initial_method: null,
            },
            // Un único método con monto: es el método por defecto del gasto.
            payment_method: 'cash',
        });
    });

    it('arma el gasto de contado con pago dividido en dos métodos', () => {
        const payload = expectReady(
            build(
                draftOf({
                    payment: contado({
                        methods: [
                            { methodId: 'Efectivo', mappedId: 'cash', amount: 50000 },
                            { methodId: 'Nequi', mappedId: 'nequi', amount: 35000 },
                        ],
                    }),
                }),
            ),
        );

        expect(payload.payment.methods).toEqual([
            { mapped_id: 'cash', amount: 50000 },
            { mapped_id: 'nequi', amount: 35000 },
        ]);
        // Pago dividido: sin método claro, el motor usa el primero de la lista.
        expect(payload.payment_method).toBeUndefined();
    });

    it('arma el gasto a crédito con abono inicial y fecha de vencimiento', () => {
        const payload = expectReady(
            build(
                draftOf({
                    payment: {
                        isCredit: true,
                        dueDate: '2026-09-15',
                        paidAmount: 20000,
                        deductFromCash: null,
                        shiftId: SHIFT,
                        methods: [],
                        creditInitialMethodId: 'nequi',
                    },
                }),
            ),
        );

        expect(payload.payment).toEqual({
            is_credit: true,
            due_date: '2026-09-15',
            paid_amount: 20000,
            deduct_from_cash: false,
            shift_id: SHIFT,
            methods: [],
            credit_initial_method: 'nequi',
        });
        expect(payload.payment_method).toBe('nequi');
    });

    it('emite el proveedor existente por id', () => {
        expect(expectReady(build(draftOf())).supplier).toEqual({ id: SUPPLIER_ID });
    });

    it('emite el proveedor nuevo con nombre y NIT, y NIT nulo cuando no hay', () => {
        const conNit = expectReady(
            build(draftOf({}, { kind: 'new', name: '  AIRE  ', nit: ' 900123456 ', phone: '' })),
        );
        expect(conNit.supplier).toEqual({ new: { name: 'AIRE', nit: '900123456', phone: null } });

        const sinNit = expectReady(build(draftOf({}, { kind: 'new', name: 'AIRE', nit: '', phone: '' })));
        expect(sinNit.supplier).toEqual({ new: { name: 'AIRE', nit: null, phone: null } });
    });

    it('interpreta el monto en Formato_Numerico_Latino y lo redondea a pesos', () => {
        const conMiles = expectReady(
            build(draftOf({ expense: expenseFields({ amount: '$ 1.234.500' }) })),
        );
        expect(conMiles.amount).toBe(1234500);

        const conDecimales = expectReady(
            build(
                draftOf({
                    expense: expenseFields({ amount: '85.499,60' }),
                    payment: contado({ methods: [] }),
                }),
            ),
        );
        expect(conDecimales.amount).toBe(85500);
    });

    it('usa la URL de la Evidencia recibida en las opciones antes que la del borrador', () => {
        const payload = expectReady(
            buildExpensePayload(draftOf(), {
                source: 'scan',
                businessId: BUSINESS,
                today: TODAY,
                receiptUrl: 'https://x/debt-evidence/biz/nueva.webp',
            }),
        );
        expect(payload.receipt_url).toBe('https://x/debt-evidence/biz/nueva.webp');
    });

    it('descarta los métodos con monto cero y acepta una fecha anterior a hoy', () => {
        const payload = expectReady(
            build(
                draftOf({
                    expense: expenseFields({ date: '2026-07-28' }),
                    payment: contado({
                        methods: [
                            { methodId: 'Efectivo', mappedId: 'cash', amount: 85000 },
                            { methodId: 'Nequi', mappedId: 'nequi', amount: 0 },
                        ],
                    }),
                }),
            ),
        );

        expect(payload.expense_date).toBe('2026-07-28');
        expect(payload.payment.methods).toEqual([{ mapped_id: 'cash', amount: 85000 }]);
    });
});

describe('buildExpensePayload — borradores incompletos', () => {
    it('rechaza la categoría vacía', () => {
        const issues = expectIssues(build(draftOf({ expense: expenseFields({ category: '   ' }) })));
        expect(issues).toContain('missing_category');
    });

    it('rechaza el monto en cero', () => {
        const issues = expectIssues(
            build(
                draftOf({
                    expense: expenseFields({ amount: '0' }),
                    payment: contado({ methods: [] }),
                }),
            ),
        );
        expect(issues).toContain('invalid_amount');
    });

    it('rechaza una fecha posterior al día actual en America/Bogota', () => {
        const issues = expectIssues(build(draftOf({ expense: expenseFields({ date: '2026-08-02' }) })));
        expect(issues).toEqual(['future_expense_date']);
    });

    it('rechaza el crédito sin fecha de vencimiento', () => {
        const issues = expectIssues(
            build(
                draftOf({
                    payment: {
                        isCredit: true,
                        dueDate: null,
                        paidAmount: 0,
                        deductFromCash: null,
                        shiftId: null,
                        methods: [],
                        creditInitialMethodId: null,
                    },
                }),
            ),
        );
        expect(issues).toContain('missing_due_date');
    });

    it('rechaza cuando la suma de los métodos supera el valor del gasto', () => {
        const issues = expectIssues(
            build(
                draftOf({
                    payment: contado({
                        methods: [
                            { methodId: 'Efectivo', mappedId: 'cash', amount: 60000 },
                            { methodId: 'Nequi', mappedId: 'nequi', amount: 30000 },
                        ],
                    }),
                }),
            ),
        );
        expect(issues).toContain('overpayment');
    });

    it('rechaza el contado con turno abierto y la pregunta de caja sin responder', () => {
        const issues = expectIssues(build(draftOf({ payment: contado({ deductFromCash: null }) })));
        expect(issues).toContain('unanswered_cash_question');
    });

    it('rechaza el borrador sin proveedor confirmado', () => {
        const issues = expectIssues(build({ ...draftOf(), supplier: null }));
        expect(issues).toContain('missing_supplier');
    });

    it('rechaza el borrador sin campos de gasto y no acumula códigos derivados', () => {
        const issues = expectIssues(build({ ...draftOf(), expense: null }));
        expect(issues).toEqual(['missing_expense_fields']);
    });

    it('acumula todos los problemas encontrados', () => {
        const issues = expectIssues(
            buildExpensePayload(
                {
                    ...draftOf({}, { kind: 'new', name: '', nit: '', phone: '' }),
                    idempotencyKey: '',
                    expense: expenseFields({ amount: 'abc', category: '', date: '2026-13-40' }),
                },
                { source: 'scan', businessId: '', today: TODAY },
            ),
        );

        expect(issues).toEqual([
            'missing_business_id',
            'missing_idempotency_key',
            'invalid_amount',
            'missing_category',
            'missing_expense_date',
            'missing_supplier',
        ]);
    });
});

describe('buildExpensePayload — determinismo', () => {
    it('produce el mismo payload para el mismo borrador', () => {
        const draft = draftOf();
        expect(build(draft)).toEqual(build(draft));
    });
});
