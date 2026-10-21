import { ReceiptItem } from '../types';

/**
 * Determina si un item se vende por unidad (no por peso/medida).
 * Los productos por peso (Libras, Kilogramos, etc.) NO se consolidan.
 */
const isUnitProduct = (unit?: string): boolean =>
    !unit || unit === 'Unidad' || unit === 'Und';

/**
 * Consolida items de recibo del mismo producto en una sola fila para el TICKET DE VENTA.
 *
 * Se usa SOLO para el ticket de venta impreso/PDF/compartido. El carrito visual y las
 * comandas de cocina mantienen las filas individuales (con sus modificaciones) sin alterar.
 *
 * Reglas:
 * - Solo se consolidan productos por UNIDAD (unit vacío, 'Unidad' o 'Und').
 *   Los productos por peso/medida (Libras, Kilogramos, etc.) NUNCA se fusionan.
 * - Para productos por unidad, se fusionan filas que compartan nombre, precio unitario
 *   y descuento, IGNORANDO las modificaciones (notas, término de cocción, ingredientes
 *   removidos), ya que el ticket de venta no muestra esas modificaciones y no afectan el precio.
 * - El descuento SÍ separa filas, porque afecta el total que muestra el ticket.
 *
 * IMPORTANTE: el campo `total` se SUMA (no se recalcula como precio × cantidad) para
 * preservar el redondeo por fila y que el total del ticket siga cuadrando con lo cobrado.
 */
export const consolidateReceiptItems = (items: ReceiptItem[]): ReceiptItem[] => {
    const consolidated: ReceiptItem[] = [];
    const indexByKey = new Map<string, number>();

    for (const item of items) {
        // Productos por peso/medida: nunca se consolidan, se agregan tal cual
        if (!isUnitProduct(item.unit)) {
            consolidated.push({ ...item });
            continue;
        }

        // Productos por unidad: agrupar por nombre + precio unitario + descuento
        const key = [
            item.name,
            item.unitPrice,
            item.discount || 0,
            item.discountPercent || 0,
        ].join('|');

        const existingIdx = indexByKey.get(key);

        if (existingIdx !== undefined) {
            const existing = consolidated[existingIdx];
            consolidated[existingIdx] = {
                ...existing,
                quantity: Math.round((existing.quantity + item.quantity) * 100) / 100,
                total: existing.total + item.total,
                discount: existing.discount != null
                    ? existing.discount + (item.discount || 0)
                    : item.discount,
                // Las modificaciones no se muestran en el ticket; se descartan al consolidar
                notes: undefined,
                cookingTerm: undefined,
                removedIngredients: undefined,
            };
        } else {
            indexByKey.set(key, consolidated.length);
            consolidated.push({ ...item });
        }
    }

    return consolidated;
};
