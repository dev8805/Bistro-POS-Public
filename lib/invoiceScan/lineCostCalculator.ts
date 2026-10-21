/**
 * lib/invoiceScan/lineCostCalculator.ts
 *
 * Motor de cálculo de costo estrictamente por línea para el Escaneo v2.
 * Módulo puro sin dependencias de React ni de base de datos.
 *
 * Reglas de negocio:
 * 1. Sin descuentos de pie de página (descuento global eliminado).
 * 2. Cada línea es financiera y contablemente independiente.
 * 3. Total neto = subtotal + impuestos (IVA/impoconsumo) - descuentos de renglón.
 * 4. Costo unitario en inventario = total neto / (cantidad facturada * factor de empaque).
 */

import { extractConversionFactorFromName } from './unitMatch';

export interface RawLineItemV2 {
    description: string;
    quantity: number;
    ocr_unit?: string | null;
    unitValue: number;
    lineSubtotal: number;
    lineTax: number;
    lineDiscount: number;
    lineNetTotal: number;
    barcode?: string | null;
}

export interface CalculatedLineCostV2 {
    /** Cantidad facturada en el documento (ej: 2 cajas) */
    ocrQuantity: number;
    /** Unidad leída en la factura (ej: "CAJA" o "") */
    ocrUnit: string;
    /** Subtotal antes de impuestos y descuentos */
    subtotal: number;
    /** Impuestos de ese renglón */
    tax: number;
    /** Descuento comercial de ese renglón */
    discount: number;
    /** Total neto final pagado por la línea: subtotal + tax - discount */
    netTotal: number;
    /** Factor multiplicador (ej: 24 para Caja x 24, o 1 si es suelto) */
    conversionFactor: number;
    /** Cantidad real de unidades que ingresarán al inventario */
    inventoryQuantity: number;
    /** Costo de compra unitario por cada producto en stock */
    unitCost: number;
}

/**
 * Calcula los costos de una línea de factura v2 de forma estricta y determinista.
 *
 * @param item Datos crudos leídos de la factura
 * @param knownFactor Factor conocido del producto si ya lo tenía configurado en Bistro
 */
export const calculateLineCostV2 = (
    item: RawLineItemV2,
    knownFactor?: number | null,
): CalculatedLineCostV2 => {
    const ocrQuantity = Math.max(Number(item.quantity) || 1, 1);
    const subtotal = Math.max(Number(item.lineSubtotal) || 0, 0);
    let tax = Math.max(Number(item.lineTax) || 0, 0);
    let discount = Math.max(Number(item.lineDiscount) || 0, 0);

    let netTotal = Number(item.lineNetTotal) || 0;

    // RATIFICACIÓN DEL CÁLCULO DINÁMICO:
    // Si la factura trae columna con el total de la línea (netTotal > 0),
    // ratificamos el cálculo dinámico para que (subtotal + tax - discount) dé exactamente ese total.
    if (netTotal > 0) {
        const diff = Math.round((netTotal - (subtotal + tax - discount)) * 100) / 100;
        if (Math.abs(diff) > 0.05) {
            if (diff > 0) {
                // La diferencia corresponde a impuestos no desglosados (ej: IC, IBUA, saludables)
                tax = Math.round((tax + diff) * 100) / 100;
            } else {
                // La diferencia corresponde a descuentos comerciales de línea no desglosados
                discount = Math.round((discount + Math.abs(diff)) * 100) / 100;
            }
        }
    } else {
        // Si la factura no trae columna con el total de la línea, se calcula dinámicamente
        const composedNet = Math.max(subtotal + tax - discount, 0);
        netTotal = composedNet > 0 ? composedNet : (Number(item.unitValue) || 0) * ocrQuantity;
    }

    // 3. Determinar el factor de empaque
    let factor = 1;
    if (typeof knownFactor === 'number' && knownFactor > 0) {
        factor = knownFactor;
    } else {
        const isBulkPackaging = Boolean(
            item.ocr_unit && /^(cj|caja|paca|display|disp|sixpack|pack|bulto|cubeta)$/i.test(item.ocr_unit.trim())
        );
        if (isBulkPackaging) {
            const textFactor = extractConversionFactorFromName(item.description);
            if (textFactor && textFactor > 1) {
                factor = textFactor;
            }
        }
    }

    // 4. Cantidad de stock y costo unitario neto de inventario
    const inventoryQuantity = ocrQuantity * factor;
    const unitCost = inventoryQuantity > 0 ? netTotal / inventoryQuantity : 0;

    return {
        ocrQuantity,
        ocrUnit: item.ocr_unit ? item.ocr_unit.trim() : '',
        subtotal,
        tax,
        discount,
        netTotal: Math.round(netTotal),
        conversionFactor: factor,
        inventoryQuantity,
        unitCost: Math.round(unitCost * 100) / 100,
    };
};
