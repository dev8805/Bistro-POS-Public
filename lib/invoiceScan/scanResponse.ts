/**
 * Normalizador de la respuesta de la edge function `scan-invoice-unified`.
 *
 * La edge function solo garantiza la **forma** del cuerpo (`header`, `document`
 * y `items` presentes); la normalización de los **valores** vive aquí, como dice
 * el comentario de `supabase/functions/scan-invoice-unified/index.ts`. Este
 * módulo es la única frontera donde la respuesta de la IA deja de ser texto
 * dudoso y pasa a ser el arranque del Borrador_Escaneo.
 *
 * Módulo puro: no importa React, ni el cliente de Supabase, ni hace fetch.
 *
 * Qué tolera (Req 3.2, 3.3, 3.6, 3.7, 3.12):
 * - `items` ausente, `null` o de un tipo que no es arreglo → cero líneas.
 * - `document` o `header` ausentes → Descuento_Global 0 y encabezado vacío.
 * - Campos `null`, ausentes o con Formato_Numerico_Latino (`"8.100"`, `"0,44"`).
 * - `lineNetTotal` incoherente con `lineSubtotal + lineTax − lineDiscount`: se
 *   recalcula a partir de los componentes, que son la fuente más específica.
 * - Unitario ausente: se deriva como `lineNetTotal / quantity` (Req 3.6).
 * - Cantidad ilegible (`0`, `null`, `NaN`, negativa): cantidad 1 y la línea
 *   queda marcada como pendiente de revisión del Usuario (Req 3.12).
 * - Cuerpo con `error` (degradación de la función): se devuelve el mensaje y las
 *   líneas que hayan llegado, sin lanzar. El hook lo trata como escaneo fallido.
 *
 * Decisiones tomadas:
 * - **Montos en pesos enteros.** Colombia opera sin centavos, así que el
 *   Costo_Neto_Linea se redondea con `toPesos`. Con netos enteros el reparto del
 *   Descuento_Global suma exactamente el descuento (ver `discount.ts`).
 * - **La cantidad conserva decimales.** Una línea puede venir en `0,44 KG`;
 *   redondearla falsearía el peso comprado.
 * - **`ocrUnit` se conserva crudo** (Req 9.15): no se recorta ni se normaliza.
 *   La `Comparacion_Unidad` la hace después `normalizeUnit`, que ya recorta.
 * - **Líneas sin descripción se descartan.** Una línea sin nombre no es
 *   accionable en el Resolutor_Producto: no se puede vincular ni crear un
 *   producto a partir de ella. Se descartan antes de repartir el descuento, así
 *   que no consumen parte del Descuento_Global.
 * - **`id` con `crypto.randomUUID()`.** Es un identificador local que no
 *   persiste (solo sirve como clave de React y para ubicar la línea en el
 *   borrador). Se usa el mismo generador que el `idempotencyKey` del borrador.
 *   En un entorno sin `crypto.randomUUID` (contexto no seguro) se cae a
 *   `scan-line-<índice>`, que es único dentro de la misma respuesta.
 * - **La decisión y la conversión NO se resuelven aquí**: cada línea nace con
 *   `decision: { kind: 'pending' }`, `unitCase`, `conversionFactor`, `quantity`,
 *   `lineTotal` y `newPrice` en su valor neutro. El Resolutor_Producto y el hook
 *   los llenan después.
 */

import { isRealCalendarDate } from '../../components/expense/scanExpense.logic';
import { distributeGlobalDiscount } from './discount';
import { parseLatinNumber, toPesos } from './numbers';
import type {
    RawNumeric,
    RawScanDocument,
    RawScanHeader,
    RawScanItem,
    RawScanResponse,
    ScanHeader,
    ScanLine,
} from './types';

/** Resultado del normalizador: lo que el hook necesita para armar el borrador. */
export interface NormalizedScanResponse {
    /** Encabezado_Documento con texto limpio y fecha validada. */
    header: ScanHeader;
    /** Descuento_Global en pesos enteros, nunca negativo. */
    globalDiscount: number;
    /** Total del documento en pesos, informativo: solo para conciliación visual. */
    documentTotal: number;
    /** Linea_Factura accionables, con el Descuento_Global ya repartido. */
    lines: ScanLine[];
    /** Mensaje de la degradación de la edge function, o `null` si no hubo. */
    error: string | null;
}

/** Montos de una Linea_Factura tras resolver incoherencias y derivaciones. */
export interface LineAmounts {
    /** Cantidad leída, con decimales; 1 cuando es ilegible. */
    ocrQuantity: number;
    /** true cuando la cantidad era ilegible y se asumió 1 (Req 3.12). */
    needsReview: boolean;
    /** Costo_Neto_Linea en pesos enteros, impuestos incluidos. */
    netTotal: number;
    /** Valor por Unidad_OCR: el leído, o `netTotal / ocrQuantity` (Req 3.6). */
    unitValue: number;
}

/**
 * Diferencia máxima, en pesos, que se acepta entre el `lineNetTotal` reportado
 * y `lineSubtotal + lineTax − lineDiscount`. Un peso cubre el redondeo de la IA;
 * por encima de eso mandan los componentes, que son el dato más específico.
 */
const COHERENCE_TOLERANCE = 1;

/** Mensaje cuando el cuerpo no es ni un objeto: se trata como escaneo fallido. */
const INVALID_BODY_ERROR = 'La respuesta del escaneo no tiene el formato esperado.';

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Texto recortado, o `null` cuando no es texto o queda vacío. */
const cleanText = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
};

/** Monto en pesos enteros, acotado a cero: la IA nunca debería mandar negativos. */
const positivePesos = (value: RawNumeric): number => {
    const pesos = toPesos(parseLatinNumber(value));
    return pesos > 0 ? pesos : 0;
};

/** Encabezado vacío: la forma neutra cuando no llegó nada utilizable. */
const emptyHeader = (): ScanHeader => ({
    supplierName: null,
    nit: null,
    phone: null,
    invoiceNumber: null,
    date: null,
    supplierId: null,
});

/**
 * Normaliza el Encabezado_Documento. El NIT se conserva con su texto original
 * (con puntos y guiones): la comparación normalizada la hace `matchSupplierHeader`.
 * La fecha se acepta solo si es una fecha de calendario real en "YYYY-MM-DD";
 * cualquier otra cosa queda en `null` y el flujo usará la fecha de hoy.
 */
export const normalizeScanHeader = (raw: RawScanHeader | null | undefined): ScanHeader => {
    if (!isObject(raw)) return emptyHeader();

    const date = cleanText(raw.date);
    return {
        supplierName: cleanText(raw.supplierName),
        nit: cleanText(raw.nit),
        phone: cleanText(raw.phone),
        invoiceNumber: cleanText(raw.invoiceNumber),
        date: date && isRealCalendarDate(date) ? date : null,
        supplierId: cleanText(raw.supplier_id),
    };
};

/**
 * Resuelve la cantidad y los montos de una Linea_Factura.
 *
 * Orden de decisión del Costo_Neto_Linea:
 *   1. `lineSubtotal + lineTax − lineDiscount` si es positivo y el
 *      `lineNetTotal` reportado falta o se aparta más de un peso (Req 3.2).
 *   2. El `lineNetTotal` reportado.
 *   3. `unitValue × cantidad`, cuando lo único legible es el unitario.
 *   4. Cero, cuando no hay ningún monto legible.
 *
 * El unitario se deriva del neto solo cuando el documento no lo trae (Req 3.6).
 */
export const resolveLineAmounts = (item: RawScanItem): LineAmounts => {
    const parsedQuantity = parseLatinNumber(item?.quantity);
    const illegibleQuantity = !(parsedQuantity > 0);
    const ocrQuantity = illegibleQuantity ? 1 : parsedQuantity;

    const subtotal = parseLatinNumber(item?.lineSubtotal);
    const tax = parseLatinNumber(item?.lineTax);
    const discount = parseLatinNumber(item?.lineDiscount);
    const reportedNet = parseLatinNumber(item?.lineNetTotal);
    const reportedUnit = parseLatinNumber(item?.unitValue);

    const composedNet = subtotal + tax - discount;

    let net = reportedNet;
    const isIncoherent = net <= 0 || Math.abs(net - composedNet) > COHERENCE_TOLERANCE;
    if (composedNet > 0 && isIncoherent) net = composedNet;
    if (net <= 0 && reportedUnit > 0) net = reportedUnit * ocrQuantity;

    const netTotal = net > 0 ? toPesos(net) : 0;
    const unitValue = reportedUnit > 0
        ? reportedUnit
        : (netTotal > 0 ? netTotal / ocrQuantity : 0);

    return { ocrQuantity, needsReview: illegibleQuantity, netTotal, unitValue };
};

/**
 * Identificador local de la línea. No persiste: solo distingue líneas dentro del
 * Borrador_Escaneo. `crypto.randomUUID` no existe en contextos no seguros, así
 * que hay un respaldo por índice, único dentro de la misma respuesta.
 */
const createLineId = (index: number): string => {
    const webCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
    if (webCrypto && typeof webCrypto.randomUUID === 'function') return webCrypto.randomUUID();
    return `scan-line-${index}`;
};

/**
 * Convierte la respuesta cruda de `scan-invoice-unified` en el punto de partida
 * del Borrador_Escaneo: encabezado normalizado, Descuento_Global en pesos y las
 * Linea_Factura accionables con su parte del descuento ya asignada (Req 3.5).
 *
 * Nunca lanza: cualquier entrada inesperada devuelve la forma neutra con
 * `lines: []`, que el hook trata como escaneo fallido.
 */
export const normalizeScanResponse = (raw: unknown): NormalizedScanResponse => {
    if (!isObject(raw)) {
        return {
            header: emptyHeader(),
            globalDiscount: 0,
            documentTotal: 0,
            lines: [],
            error: INVALID_BODY_ERROR,
        };
    }

    const body = raw as RawScanResponse;
    const document: RawScanDocument = isObject(body.document) ? body.document : {};
    const globalDiscount = positivePesos(document.globalDiscount);
    const documentTotal = positivePesos(document.documentTotal);
    const rawItems = Array.isArray(body.items) ? body.items : [];

    // Solo las líneas con nombre son accionables, y solo ellas participan del
    // reparto del Descuento_Global.
    const usable = rawItems
        .filter((item): item is RawScanItem => isObject(item))
        .map(item => ({ ocrName: cleanText(item.description), item }))
        .filter((entry): entry is { ocrName: string; item: RawScanItem } => entry.ocrName !== null)
        .map(entry => {
            const rawCand = Array.isArray(entry.item.candidate_ids) ? entry.item.candidate_ids : [];
            const candidateIds = rawCand
                .map(c => cleanText(c))
                .filter((c): c is string => c !== null);

            const conversionFactorRaw = parseLatinNumber(entry.item.conversion_factor);
            const aiConversionFactor = conversionFactorRaw > 0 ? conversionFactorRaw : null;
            const inventoryQuantityRaw = parseLatinNumber(entry.item.inventory_quantity);
            const aiInventoryQuantity = inventoryQuantityRaw > 0 ? inventoryQuantityRaw : null;
            const unitNeedsClarification = entry.item.unit_needs_clarification === true;
            const reasoning = cleanText(entry.item.reasoning);

            return {
                ocrName: entry.ocrName,
                // Req 9.15: la Unidad_OCR viaja con el texto crudo de la IA.
                ocrUnit: typeof entry.item.ocr_unit === 'string' ? entry.item.ocr_unit : '',
                amounts: resolveLineAmounts(entry.item),
                barcode: typeof entry.item.barcode === 'string' ? entry.item.barcode.trim() : '',
                aiProductId: cleanText(entry.item.product_id),
                candidateIds,
                reasoning,
                aiConversionFactor,
                aiInventoryQuantity,
                unitNeedsClarification,
            };
        });

    const shares = distributeGlobalDiscount(globalDiscount, usable.map(u => u.amounts.netTotal));

    const lines: ScanLine[] = usable.map((entry, index) => ({
        id: createLineId(index),
        ocrName: entry.ocrName,
        ocrUnit: entry.ocrUnit,
        ocrQuantity: entry.amounts.ocrQuantity,
        netTotal: entry.amounts.netTotal,
        globalDiscountShare: shares[index] ?? 0,
        needsReview: entry.amounts.needsReview,

        decision: { kind: 'pending' },

        unitCase: null,
        conversionFactor: null,
        createPurchaseUnit: false,

        quantity: null,
        lineTotal: null,
        newPrice: null,
        barcode: entry.barcode,
        aiProductId: entry.aiProductId,
        candidateIds: entry.candidateIds,
        reasoning: entry.reasoning,
        aiConversionFactor: entry.aiConversionFactor,
        aiInventoryQuantity: entry.aiInventoryQuantity,
        unitNeedsClarification: entry.unitNeedsClarification,
    }));

    return {
        header: normalizeScanHeader(body.header),
        globalDiscount,
        documentTotal,
        lines,
        error: cleanText(body.error),
    };
};
