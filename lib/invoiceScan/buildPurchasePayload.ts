/**
 * Constructor del payload de `register_purchase`: traduce el Borrador_Escaneo
 * (o el estado del Flujo_Manual_Compra) al único JSON que recibe el motor RPC.
 *
 * Módulo puro: no importa React, ni el cliente de Supabase, ni hace fetch, ni
 * lee el reloj. Mismo borrador ⇒ mismo payload (Req 12.4).
 *
 * Reparto de dinero: el motor `register_purchase` reparte por sí mismo el abono
 * inicial y el monto de cada método de pago entre las líneas, dentro de la
 * misma transacción y con el método del resto mayor. Por eso el payload lleva
 * únicamente los TOTALES (`payment.paid_amount`, `payment.methods[].amount`) y
 * este constructor NO pre-reparte nada: hacerlo duplicaría la lógica y abriría
 * la puerta a residuos de ±1 peso entre cliente y servidor.
 */

import { toPesos } from './numbers';
import { normalizeUnit } from './unitMatch';
import type {
    PayloadPaymentMethod,
    PayloadProduct,
    PayloadPurchaseLine,
    PayloadPurchaseUnit,
    PayloadSupplier,
    RegisterPurchasePayload,
    ScanDraft,
    ScanLine,
    ScanSource,
} from './types';

/** Datos que no viven en el borrador y aporta la Finalizacion_Registro. */
export interface BuildPurchasePayloadOptions {
    /** `'scan'` desde el Escaneo_Unificado, `'manual'` desde `InventoryPurchase`. */
    source: ScanSource;
    /** Negocio_Activo. El motor solo lo usa para detectar una sesión cruzada (17.10). */
    businessId: string;
    /** URL de la Evidencia ya subida al bucket, o `null` (registro offline). */
    evidenceUrl: string | null;
}

/** "YYYY-MM-DD" tal como lo guardan el borrador y el `<input type="date">`. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const trimOrNull = (value: string | null | undefined): string | null => {
    const t = (value ?? '').trim();
    return t === '' ? null : t;
};

const finiteOrZero = (value: number | null | undefined): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0;

/**
 * Fecha de la compra en el formato que espera el motor (timestamptz ISO).
 *
 * Una fecha sin hora se ancla al **mediodía UTC** (07:00 en America/Bogota),
 * igual que el ejemplo del diseño: así el día calendario del lote, la deuda y
 * el movimiento de caja es el mismo que leyó el Usuario, sin importar la zona
 * del dispositivo. Anclar a `00:00` haría que la compra cayera el día anterior.
 *
 * Fallback: si el borrador no trae fecha (la IA no la leyó), se emite cadena
 * vacía. El motor la interpreta como `now()` dentro de la transacción, que es
 * el mismo criterio de `useProducts.updateProductStock` cuando no recibe fecha.
 * Se prefiere esto a llamar `new Date()` aquí, que rompería la pureza y la
 * determinación de la función.
 */
const toPurchaseDate = (date: string | null): string => {
    const d = (date ?? '').trim();
    if (!DATE_ONLY.test(d)) return '';
    return `${d}T12:00:00.000Z`;
};

const buildSupplier = (draft: ScanDraft): PayloadSupplier => {
    const supplier = draft.supplier;

    if (!supplier) {
        throw new Error('buildPurchasePayload: el borrador no tiene proveedor resuelto.');
    }

    if (supplier.kind === 'existing') {
        return { id: supplier.id };
    }

    return {
        new: {
            name: supplier.name.trim(),
            nit: trimOrNull(supplier.nit),
            phone: trimOrNull(supplier.phone),
        },
    };
};

/**
 * Producto de la línea. Un producto existente viaja solo con su `id`: el motor
 * jamás recibe su `cost`, de modo que los costos y márgenes históricos quedan
 * intactos (Req 3.11).
 */
const buildProduct = (line: ScanLine): PayloadProduct | null => {
    if (line.decision.kind === 'linked') {
        return { id: line.decision.productId };
    }

    if (line.decision.kind === 'created') {
        const p = line.decision.newProduct;
        const isForSale = p.isForSale;

        return {
            new: {
                name: p.name.trim(),
                category_id: p.categoryId,
                unit: p.unit.trim(),
                // El costo por Unidad_Venta puede ser fraccionario (gramos, ml):
                // no se redondea a pesos para no dejarlo en 0 en productos baratos.
                cost: Math.max(0, finiteOrZero(p.cost)),
                // El precio de venta sí es dinero al público: pesos enteros.
                // Un insumo no se vende, así que va en 0 (Req 7.5).
                price: isForSale ? Math.max(0, toPesos(finiteOrZero(p.price))) : 0,
                is_for_sale: isForSale,
                barcode: p.barcode.trim() || null,
            },
        };
    }

    return null;
};

/**
 * Unidad_Compra a crear. Solo cuando el Usuario confirmó un Factor_Conversion
 * para una Unidad_OCR que no estaba configurada (Req 9.12). El `unit_name` va
 * normalizado con la misma Comparacion_Unidad del motor, para que un reintento
 * no cree una segunda fila equivalente (Req 9.13, 9.14).
 */
const buildPurchaseUnit = (line: ScanLine): PayloadPurchaseUnit | null => {
    if (!line.createPurchaseUnit) return null;

    const unitName = normalizeUnit(line.ocrUnit);
    if (unitName === '') return null;

    const factor = line.conversionFactor;
    if (typeof factor !== 'number' || !Number.isFinite(factor) || factor <= 0) return null;

    return { unit_name: unitName, conversion_factor: factor };
};

/** Precio de venta nuevo: solo si el Usuario lo editó en el Panel_Revision (10.4). */
const buildNewPrice = (line: ScanLine): number | null => {
    const price = line.newPrice;
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) return null;
    return toPesos(price);
};

const buildLine = (line: ScanLine): PayloadPurchaseLine | null => {
    const product = buildProduct(line);
    // Las líneas omitidas (6.7, 6.12) y las que siguen pendientes no tienen
    // producto: quedan fuera del inventario y del total de la compra.
    if (!product) return null;

    // El motor rechaza el payload COMPLETO si una línea trae cantidad ≤ 0, así
    // que una línea sin cantidad utilizable se descarta en lugar de tumbar el
    // registro entero.
    const quantity = finiteOrZero(line.quantity);
    if (quantity <= 0) return null;

    const ocrName = line.ocrName.trim();

    return {
        product,
        quantity,
        line_total: Math.max(0, toPesos(finiteOrZero(line.lineTotal))),
        ocr_name: ocrName,
        add_nickname:
            line.decision.kind === 'linked' && line.decision.addNickname && ocrName !== '',
        purchase_unit: buildPurchaseUnit(line),
        new_price: buildNewPrice(line),
    };
};

/**
 * Métodos de pago. En Crédito el motor los ignora (el dinero que entra es el
 * abono inicial con `credit_initial_method`), así que no se emiten con monto.
 */
const buildMethods = (draft: ScanDraft): PayloadPaymentMethod[] => {
    if (draft.payment.isCredit) return [];

    return draft.payment.methods
        .map(m => ({ mapped_id: m.mappedId, amount: toPesos(finiteOrZero(m.amount)) }))
        .filter(m => m.amount > 0);
};

/**
 * Traduce el Borrador_Escaneo al payload de `register_purchase`.
 *
 * Reglas que aplica:
 * - Excluye las líneas omitidas en el Resolutor_Producto y las quitadas en el
 *   Panel_Revision (ambas quedan como `skipped`), las que nunca se resolvieron
 *   y las que no tienen cantidad positiva (Req 6.7, 6.12).
 * - `purchase_unit` solo cuando hay una equivalencia nueva por crear (Req 9.12).
 * - `new_price` solo cuando el Usuario editó el precio de venta (Req 10.4).
 * - De un producto existente viaja solo el `id`: nunca su `cost` (Req 3.11).
 * - `add_nickname` solo en líneas vinculadas con la propuesta activa (Req 8.4).
 * - `business_id` viaja para que el motor detecte una sesión cruzada; el negocio
 *   real de cada registro creado lo deriva el motor de la sesión (Req 17.7).
 *
 * Lanza si el borrador no puede producir un registro válido: sin proveedor o
 * sin ninguna línea emitible. Ambos estados los impide la UI (Selector de
 * proveedor y paso `emptyPurchase`), así que un throw aquí delata un defecto.
 */
export const buildPurchasePayload = (
    draft: ScanDraft,
    opts: BuildPurchasePayloadOptions,
): RegisterPurchasePayload => {
    const supplier = buildSupplier(draft);

    const lines = draft.lines
        .map(buildLine)
        .filter((l): l is PayloadPurchaseLine => l !== null);

    if (lines.length === 0) {
        throw new Error('buildPurchasePayload: la compra no tiene líneas para registrar.');
    }

    const payment = draft.payment;
    const isCredit = payment.isCredit;

    return {
        v: 1,
        idempotency_key: draft.idempotencyKey,
        business_id: opts.businessId,
        source: opts.source,
        purchase_date: toPurchaseDate(draft.header.date),
        evidence_url: trimOrNull(opts.evidenceUrl),
        invoice_number: trimOrNull(draft.header.invoiceNumber),
        supplier,
        payment: {
            is_credit: isCredit,
            // La fecha de vencimiento solo tiene sentido en Crédito, donde es
            // obligatoria (el motor rechaza el crédito sin ella).
            due_date: isCredit ? trimOrNull(payment.dueDate) : null,
            // En Contado el total pagado son los métodos; el abono inicial es
            // exclusivo del Crédito.
            paid_amount: isCredit ? Math.max(0, toPesos(finiteOrZero(payment.paidAmount))) : 0,
            deduct_from_cash: payment.deductFromCash === true,
            // El turno viaja siempre que exista: en Crédito con abono el motor
            // lo necesita para registrar el egreso de caja del abono.
            shift_id: trimOrNull(payment.shiftId),
            methods: buildMethods(draft),
            credit_initial_method: isCredit ? trimOrNull(payment.creditInitialMethodId) : null,
        },
        lines,
    };
};
