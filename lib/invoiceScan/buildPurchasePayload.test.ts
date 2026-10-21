import { describe, it, expect } from 'vitest';
import { buildPurchasePayload } from './buildPurchasePayload';
import type {
    NewProductDraft,
    PaymentDraft,
    ScanDraft,
    ScanLine,
    ScanLineDecision,
} from './types';

// ---------------------------------------------------------------------------
// Fábricas mínimas del Borrador_Escaneo
// ---------------------------------------------------------------------------

const PROD_A = '11111111-1111-4111-8111-111111111111';
const PROD_B = '22222222-2222-4222-8222-222222222222';
const SUPPLIER_ID = '33333333-3333-4333-8333-333333333333';
const CATEGORY_ID = '44444444-4444-4444-8444-444444444444';
const SHIFT_ID = '55555555-5555-4555-8555-555555555555';
const BUSINESS_ID = '66666666-6666-4666-8666-666666666666';
const IDEMPOTENCY_KEY = '77777777-7777-4777-8777-777777777777';

const makeLine = (over: Partial<ScanLine> = {}): ScanLine => ({
    id: 'l1',
    ocrName: 'PACK LACTEO YOG CHOC 150G x 6',
    ocrUnit: '',
    ocrQuantity: 12,
    netTotal: 24000,
    globalDiscountShare: 0,
    needsReview: false,
    decision: { kind: 'linked', productId: PROD_A, addNickname: false } as ScanLineDecision,
    unitCase: 'sale',
    conversionFactor: 1,
    createPurchaseUnit: false,
    quantity: 12,
    lineTotal: 24000,
    newPrice: null,
    barcode: '',
    ...over,
});

const makeNewProduct = (over: Partial<NewProductDraft> = {}): NewProductDraft => ({
    name: 'Yogurt Choco 150g',
    categoryId: CATEGORY_ID,
    unit: 'Und',
    cost: 2000,
    price: 3500,
    isForSale: true,
    barcode: '',
    ...over,
});

const makePayment = (over: Partial<PaymentDraft> = {}): PaymentDraft => ({
    isCredit: false,
    dueDate: null,
    paidAmount: 0,
    deductFromCash: true,
    shiftId: SHIFT_ID,
    methods: [{ methodId: 'efectivo', mappedId: 'cash', amount: 24000 }],
    creditInitialMethodId: null,
    ...over,
});

const makeDraft = (over: Partial<ScanDraft> = {}): ScanDraft => ({
    destination: 'inventory',
    image: null,
    evidenceUrl: null,
    idempotencyKey: IDEMPOTENCY_KEY,
    header: {
        supplierName: 'Lácteos del Valle',
        nit: '900123456-1',
        phone: null,
        invoiceNumber: 'F-00123',
        date: '2026-08-01',
    },
    globalDiscount: 0,
    supplier: { kind: 'existing', id: SUPPLIER_ID, name: 'Lácteos del Valle' },
    lines: [makeLine()],
    currentLineIndex: 0,
    expense: null,
    payment: makePayment(),
    ...over,
});

const OPTS = {
    source: 'scan' as const,
    businessId: BUSINESS_ID,
    evidenceUrl: 'https://x.supabase.co/debt-evidence/b/f.webp',
};

// ---------------------------------------------------------------------------
// Raíz del payload
// ---------------------------------------------------------------------------

describe('buildPurchasePayload · raíz del payload', () => {
    it('emite la versión, la clave de idempotencia, el negocio y el origen', () => {
        const payload = buildPurchasePayload(makeDraft(), OPTS);

        expect(payload.v).toBe(1);
        expect(payload.idempotency_key).toBe(IDEMPOTENCY_KEY);
        expect(payload.business_id).toBe(BUSINESS_ID);
        expect(payload.source).toBe('scan');
        expect(payload.evidence_url).toBe(OPTS.evidenceUrl);
        expect(payload.invoice_number).toBe('F-00123');
    });

    it('ancla la fecha del documento al mediodía UTC', () => {
        const payload = buildPurchasePayload(makeDraft(), OPTS);
        expect(payload.purchase_date).toBe('2026-08-01T12:00:00.000Z');
    });

    it('deja la fecha vacía cuando el borrador no la trae, para que el motor use now()', () => {
        const draft = makeDraft({
            header: { supplierName: null, nit: null, phone: null, invoiceNumber: null, date: null },
        });
        const payload = buildPurchasePayload(draft, OPTS);

        expect(payload.purchase_date).toBe('');
        expect(payload.invoice_number).toBeNull();
    });

    it('emite el proveedor existente solo con su id', () => {
        const payload = buildPurchasePayload(makeDraft(), OPTS);
        expect(payload.supplier).toEqual({ id: SUPPLIER_ID });
    });

    it('emite el proveedor nuevo con nombre y NIT, y NIT nulo cuando está vacío', () => {
        const conNit = buildPurchasePayload(
            makeDraft({ supplier: { kind: 'new', name: '  AIRE  ', nit: ' 900123456 ', phone: '' } }),
            OPTS,
        );
        expect(conNit.supplier).toEqual({ new: { name: 'AIRE', nit: '900123456', phone: null } });

        const sinNit = buildPurchasePayload(
            makeDraft({ supplier: { kind: 'new', name: 'AIRE', nit: '   ', phone: '' } }),
            OPTS,
        );
        expect(sinNit.supplier).toEqual({ new: { name: 'AIRE', nit: null, phone: null } });
    });

    it('normaliza la evidencia ausente a null', () => {
        const payload = buildPurchasePayload(makeDraft(), { ...OPTS, evidenceUrl: null });
        expect(payload.evidence_url).toBeNull();
    });

    it('es determinista: el mismo borrador produce el mismo payload', () => {
        const draft = makeDraft({
            lines: [
                makeLine({ id: 'a' }),
                makeLine({ id: 'b', decision: { kind: 'skipped' } }),
                makeLine({
                    id: 'c',
                    decision: { kind: 'created', newProduct: makeNewProduct() },
                    createPurchaseUnit: true,
                    ocrUnit: 'Cajas',
                    conversionFactor: 6,
                }),
            ],
        });

        expect(buildPurchasePayload(draft, OPTS)).toEqual(buildPurchasePayload(draft, OPTS));
    });

    it('lanza cuando el borrador no tiene proveedor', () => {
        expect(() => buildPurchasePayload(makeDraft({ supplier: null }), OPTS)).toThrow(
            /proveedor/i,
        );
    });

    it('lanza cuando no queda ninguna línea para registrar', () => {
        const draft = makeDraft({ lines: [makeLine({ decision: { kind: 'skipped' } })] });
        expect(() => buildPurchasePayload(draft, OPTS)).toThrow(/líneas/i);
    });
});

// ---------------------------------------------------------------------------
// Líneas
// ---------------------------------------------------------------------------

describe('buildPurchasePayload · líneas', () => {
    it('excluye la línea omitida y conserva el orden de las demás', () => {
        const draft = makeDraft({
            lines: [
                makeLine({ id: 'a', ocrName: 'ARROZ', lineTotal: 10000 }),
                makeLine({ id: 'b', ocrName: 'OMITIDA', decision: { kind: 'skipped' } }),
                makeLine({
                    id: 'c',
                    ocrName: 'PANELA',
                    lineTotal: 5000,
                    decision: { kind: 'linked', productId: PROD_B, addNickname: false },
                }),
            ],
        });

        const payload = buildPurchasePayload(draft, OPTS);

        expect(payload.lines).toHaveLength(2);
        expect(payload.lines.map(l => l.ocr_name)).toEqual(['ARROZ', 'PANELA']);
        const total = payload.lines.reduce((acc, l) => acc + l.line_total, 0);
        expect(total).toBe(15000);
    });

    it('excluye la línea que quedó pendiente de decisión', () => {
        const draft = makeDraft({
            lines: [makeLine({ id: 'a' }), makeLine({ id: 'b', decision: { kind: 'pending' } })],
        });

        expect(buildPurchasePayload(draft, OPTS).lines).toHaveLength(1);
    });

    it('excluye la línea sin cantidad positiva para no tumbar el payload completo', () => {
        const draft = makeDraft({
            lines: [
                makeLine({ id: 'a' }),
                makeLine({ id: 'b', quantity: 0 }),
                makeLine({ id: 'c', quantity: null }),
                makeLine({ id: 'd', quantity: -3 }),
            ],
        });

        const payload = buildPurchasePayload(draft, OPTS);
        expect(payload.lines).toHaveLength(1);
        payload.lines.forEach(l => expect(l.quantity).toBeGreaterThan(0));
    });

    it('emite la línea vinculada con el apodo activo y el Nombre_OCR', () => {
        const draft = makeDraft({
            lines: [
                makeLine({
                    ocrName: '  PACK YOG CHOC x6  ',
                    decision: { kind: 'linked', productId: PROD_A, addNickname: true },
                }),
            ],
        });

        const linea = buildPurchasePayload(draft, OPTS).lines[0];

        expect(linea.product).toEqual({ id: PROD_A });
        expect(linea.add_nickname).toBe(true);
        expect(linea.ocr_name).toBe('PACK YOG CHOC x6');
    });

    it('no propone apodo cuando el Nombre_OCR está vacío ni en productos nuevos', () => {
        const sinNombre = buildPurchasePayload(
            makeDraft({
                lines: [
                    makeLine({
                        ocrName: '   ',
                        decision: { kind: 'linked', productId: PROD_A, addNickname: true },
                    }),
                ],
            }),
            OPTS,
        );
        expect(sinNombre.lines[0].add_nickname).toBe(false);

        const creado = buildPurchasePayload(
            makeDraft({
                lines: [makeLine({ decision: { kind: 'created', newProduct: makeNewProduct() } })],
            }),
            OPTS,
        );
        expect(creado.lines[0].add_nickname).toBe(false);
    });

    it('emite el producto nuevo con nombre, categoría, unidad, costo, precio y destino', () => {
        const draft = makeDraft({
            lines: [
                makeLine({
                    quantity: 6,
                    lineTotal: 12000,
                    decision: {
                        kind: 'created',
                        newProduct: makeNewProduct({ name: '  Yogurt Choco  ', cost: 2000, price: 3500 }),
                    },
                }),
            ],
        });

        const linea = buildPurchasePayload(draft, OPTS).lines[0];

        expect(linea.product).toEqual({
            new: {
                name: 'Yogurt Choco',
                category_id: CATEGORY_ID,
                unit: 'Und',
                cost: 2000,
                price: 3500,
                is_for_sale: true,
                barcode: null,
            },
        });
        expect(linea.quantity).toBe(6);
        expect(linea.line_total).toBe(12000);
    });

    it('deja el precio en 0 cuando el producto nuevo es un insumo', () => {
        const draft = makeDraft({
            lines: [
                makeLine({
                    decision: {
                        kind: 'created',
                        newProduct: makeNewProduct({ isForSale: false, price: 3500 }),
                    },
                }),
            ],
        });

        const product = buildPurchasePayload(draft, OPTS).lines[0].product;
        expect(product).toEqual({
            new: {
                name: 'Yogurt Choco 150g',
                category_id: CATEGORY_ID,
                unit: 'Und',
                cost: 2000,
                price: 0,
                is_for_sale: false,
                barcode: null,
            },
        });
    });

    it('conserva el costo fraccionario del producto nuevo y redondea el total a pesos', () => {
        const draft = makeDraft({
            lines: [
                makeLine({
                    quantity: 1000,
                    lineTotal: 8100.4,
                    decision: {
                        kind: 'created',
                        newProduct: makeNewProduct({ unit: 'g', cost: 8.1004, price: 15 }),
                    },
                }),
            ],
        });

        const linea = buildPurchasePayload(draft, OPTS).lines[0];

        expect(linea.line_total).toBe(8100);
        expect(Number.isInteger(linea.line_total)).toBe(true);
        expect(linea.product).toMatchObject({ new: { cost: 8.1004 } });
    });

    it('nunca emite el cost de un producto existente', () => {
        const draft = makeDraft({
            lines: [
                makeLine({ id: 'a', decision: { kind: 'linked', productId: PROD_A, addNickname: true } }),
                makeLine({ id: 'b', decision: { kind: 'linked', productId: PROD_B, addNickname: false } }),
            ],
        });

        const payload = buildPurchasePayload(draft, OPTS);

        payload.lines.forEach(l => {
            expect(l.product).toEqual({ id: expect.any(String) });
            expect('new' in l.product).toBe(false);
            expect(Object.keys(l.product)).toEqual(['id']);
        });
        expect(JSON.stringify(payload)).not.toContain('"cost"');
    });
});

// ---------------------------------------------------------------------------
// Unidad_Compra y precio de venta
// ---------------------------------------------------------------------------

describe('buildPurchasePayload · purchase_unit y new_price', () => {
    it('emite purchase_unit normalizada solo cuando hay equivalencia nueva por crear', () => {
        const draft = makeDraft({
            lines: [
                makeLine({
                    id: 'a',
                    ocrUnit: '  Cajas  ',
                    createPurchaseUnit: true,
                    conversionFactor: 6,
                }),
                makeLine({ id: 'b', ocrUnit: 'cj', createPurchaseUnit: false, conversionFactor: 6 }),
            ],
        });

        const [nueva, conocida] = buildPurchasePayload(draft, OPTS).lines;

        expect(nueva.purchase_unit).toEqual({ unit_name: 'caja', conversion_factor: 6 });
        expect(conocida.purchase_unit).toBeNull();
    });

    it('no emite purchase_unit sin unidad legible ni con factor inválido', () => {
        const draft = makeDraft({
            lines: [
                makeLine({ id: 'a', ocrUnit: '   ', createPurchaseUnit: true, conversionFactor: 6 }),
                makeLine({ id: 'b', ocrUnit: 'bulto', createPurchaseUnit: true, conversionFactor: 0 }),
                makeLine({ id: 'c', ocrUnit: 'bulto', createPurchaseUnit: true, conversionFactor: null }),
            ],
        });

        buildPurchasePayload(draft, OPTS).lines.forEach(l =>
            expect(l.purchase_unit).toBeNull(),
        );
    });

    it('emite new_price solo en la línea cuyo precio de venta se editó', () => {
        const draft = makeDraft({
            lines: [
                makeLine({ id: 'a', newPrice: 4200 }),
                makeLine({ id: 'b', newPrice: null }),
                makeLine({ id: 'c', newPrice: 0 }),
            ],
        });

        const [editada, intacta, enCero] = buildPurchasePayload(draft, OPTS).lines;

        expect(editada.new_price).toBe(4200);
        expect(intacta.new_price).toBeNull();
        expect(enCero.new_price).toBe(0);
    });

    it('redondea el precio nuevo a pesos e ignora un precio negativo', () => {
        const draft = makeDraft({
            lines: [makeLine({ id: 'a', newPrice: 4200.6 }), makeLine({ id: 'b', newPrice: -10 })],
        });

        const [redondeado, invalido] = buildPurchasePayload(draft, OPTS).lines;

        expect(redondeado.new_price).toBe(4201);
        expect(invalido.new_price).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Pago
// ---------------------------------------------------------------------------

describe('buildPurchasePayload · pago', () => {
    it('contado con un método: emite el total en el método y sin abono ni vencimiento', () => {
        const payload = buildPurchasePayload(makeDraft(), OPTS);

        expect(payload.payment).toEqual({
            is_credit: false,
            due_date: null,
            paid_amount: 0,
            deduct_from_cash: true,
            shift_id: SHIFT_ID,
            methods: [{ mapped_id: 'cash', amount: 24000 }],
            credit_initial_method: null,
        });
    });

    it('contado con pago dividido: emite un método por cada monto, sin repartir por línea', () => {
        const draft = makeDraft({
            lines: [
                makeLine({ id: 'a', lineTotal: 14000 }),
                makeLine({ id: 'b', lineTotal: 10000, decision: { kind: 'linked', productId: PROD_B, addNickname: false } }),
            ],
            payment: makePayment({
                methods: [
                    { methodId: 'efectivo', mappedId: 'cash', amount: 15000 },
                    { methodId: 'nequi', mappedId: 'nequi', amount: 9000 },
                    { methodId: 'daviplata', mappedId: 'daviplata', amount: 0 },
                ],
            }),
        });

        const payload = buildPurchasePayload(draft, OPTS);

        expect(payload.payment.methods).toEqual([
            { mapped_id: 'cash', amount: 15000 },
            { mapped_id: 'nequi', amount: 9000 },
        ]);
        const totalMetodos = payload.payment.methods.reduce((a, m) => a + m.amount, 0);
        const totalLineas = payload.lines.reduce((a, l) => a + l.line_total, 0);
        expect(totalMetodos).toBe(totalLineas);
        // El reparto por línea es responsabilidad del motor: la línea no lo lleva.
        payload.lines.forEach(l => {
            expect(l).not.toHaveProperty('paid_amount');
            expect(l).not.toHaveProperty('methods');
        });
    });

    it('contado sin descuento de caja: deduct_from_cash en false cuando el Usuario no respondió', () => {
        const payload = buildPurchasePayload(
            makeDraft({ payment: makePayment({ deductFromCash: null }) }),
            OPTS,
        );
        expect(payload.payment.deduct_from_cash).toBe(false);
    });

    it('crédito con abono y vencimiento: emite el abono total, el método del abono y ningún método de pago', () => {
        const draft = makeDraft({
            payment: makePayment({
                isCredit: true,
                dueDate: '2026-09-01',
                paidAmount: 10000.4,
                deductFromCash: false,
                creditInitialMethodId: 'nequi',
                methods: [{ methodId: 'efectivo', mappedId: 'cash', amount: 24000 }],
            }),
        });

        const payload = buildPurchasePayload(draft, OPTS);

        expect(payload.payment).toEqual({
            is_credit: true,
            due_date: '2026-09-01',
            paid_amount: 10000,
            deduct_from_cash: false,
            shift_id: SHIFT_ID,
            methods: [],
            credit_initial_method: 'nequi',
        });
    });

    it('crédito sin abono: paid_amount en 0 y turno conservado', () => {
        const payload = buildPurchasePayload(
            makeDraft({
                payment: makePayment({
                    isCredit: true,
                    dueDate: '2026-09-01',
                    paidAmount: 0,
                    methods: [],
                }),
            }),
            OPTS,
        );

        expect(payload.payment.paid_amount).toBe(0);
        expect(payload.payment.shift_id).toBe(SHIFT_ID);
        expect(payload.payment.credit_initial_method).toBeNull();
    });

    it('sin turno activo el shift_id viaja en null', () => {
        const payload = buildPurchasePayload(
            makeDraft({ payment: makePayment({ shiftId: null, deductFromCash: false }) }),
            OPTS,
        );
        expect(payload.payment.shift_id).toBeNull();
    });
});
