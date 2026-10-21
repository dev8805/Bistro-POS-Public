import React from 'react';
import { ReceiptData } from '../types';

const UNIT_ABBR: Record<string, string> = {
    'Kilogramos': 'Kg', 'Libras': 'Lb', 'Gramos': 'g', 'Onzas': 'Oz',
    'Litros': 'Lt', 'Mililitros': 'ml', 'Galones': 'Gal', 'Metros': 'm', 'Centímetros': 'cm',
};

const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

interface ReceiptThermalProps {
    data: ReceiptData;
    paperWidth: '58mm' | '80mm';
}

const pad = (str: string, len: number, align: 'left' | 'right' = 'left'): string => {
    if (str.length >= len) return str.substring(0, len);
    const padding = ' '.repeat(len - str.length);
    return align === 'right' ? padding + str : str + padding;
};

export const ReceiptThermal: React.FC<ReceiptThermalProps> = ({ data, paperWidth }) => {
    const is58 = paperWidth === '58mm';
    const columns = is58 ? 32 : 48;
    const divider = '='.repeat(columns);
    const thinDivider = '-'.repeat(columns);

    const centeredLine = (text: string): string => {
        if (text.length >= columns) return text.substring(0, columns);
        const leftPad = Math.floor((columns - text.length) / 2);
        return ' '.repeat(leftPad) + text;
    };

    const twoColumnLine = (left: string, right: string): string => {
        const available = columns - right.length - 1;
        const leftTrimmed = left.length > available ? left.substring(0, available) : left;
        const spacing = columns - leftTrimmed.length - right.length;
        return leftTrimmed + ' '.repeat(Math.max(spacing, 1)) + right;
    };

    // Anchos de columna idénticos al ESC/POS de printReceiptDirect
    const cantWidth = is58 ? 5 : 8;
    const vUnidWidth = is58 ? 8 : 9;
    const vProdWidth = is58 ? 8 : 9;
    const prodWidth = columns - cantWidth - vUnidWidth - vProdWidth;

    const tableRow = (prod: string, cant: string, vUnit: string, vProd: string): string => {
        const p = prod.length > prodWidth ? prod.substring(0, prodWidth) : prod + ' '.repeat(prodWidth - prod.length);
        const c = cant.length > cantWidth ? cant.substring(0, cantWidth) : ' '.repeat(cantWidth - cant.length) + cant;
        const u = vUnit.length > vUnidWidth ? vUnit.substring(0, vUnidWidth) : ' '.repeat(vUnidWidth - vUnit.length) + vUnit;
        const v = vProd.length > vProdWidth ? vProd.substring(0, vProdWidth) : ' '.repeat(vProdWidth - vProd.length) + vProd;
        return p + c + u + v;
    };

    const lines: string[] = [];

    // === HEADER (centrado) — mismo orden que ESC/POS ===
    lines.push(centeredLine(data.businessName.toUpperCase()));
    if (data.businessNit) lines.push(centeredLine(`NIT: ${data.businessNit}`));
    if (data.businessAddress) lines.push(centeredLine(data.businessAddress));
    if (data.businessPhone) lines.push(centeredLine(`Tel: ${data.businessPhone}`));

    lines.push(divider);

    // === INFO (alineado a la izquierda) ===
    lines.push(`Fecha: ${data.date}`);
    if (data.displayNumber || data.orderNumber) lines.push(`Orden: ${data.displayNumber || data.orderNumber}`);
    lines.push(`Cliente: ${data.customerName || 'Consumidor Final'}`);
    if (data.customerDocument) lines.push(`Documento: ${data.customerDocument}`);

    // === TABLA DE PRODUCTOS ===
    lines.push(thinDivider);
    lines.push(tableRow('Producto', 'Cant.', 'V.unit', 'V.prod'));
    lines.push(thinDivider);

    data.items.forEach(item => {
        const cleanName = item.name.replace(/🏷️\s*/g, '');
        let unitAbbr = item.unit && item.unit !== 'Unidad' && item.unit !== 'Und'
            ? (UNIT_ABBR[item.unit] || item.unit) : 'un';
        unitAbbr = unitAbbr.substring(0, 2).toLowerCase();
        const qty = Math.round(item.quantity * 100) / 100;
        const qtyFormatted = qty.toString().replace('.', ',');
        const qtyUnit = is58 && qtyFormatted.length > 1 ? `${qtyFormatted}${unitAbbr}` : `${qtyFormatted} ${unitAbbr}`;
        const unitPriceFormatted = `$${formatCurrency(item.unitPrice)}`;
        const totalFormatted = `$${formatCurrency(item.total)}`;

        lines.push(tableRow(cleanName, qtyUnit, unitPriceFormatted, totalFormatted));

        if (item.discount || item.discountPercent) {
            const discAmount = item.discount || (item.discountPercent! * item.unitPrice * item.quantity / 100);
            const discLabel = `  Dcto${item.discountPercent ? ` ${item.discountPercent}%` : ''}`;
            lines.push(tableRow(discLabel, '', '', `-$${formatCurrency(discAmount)}`));
        }
    });

    // === SUBTOTALES ===
    lines.push(thinDivider);
    lines.push(twoColumnLine('Subtotal:', `$${formatCurrency(data.subtotal)}`));
    if (data.totalDiscount > 0) {
        lines.push(twoColumnLine('Desc:', `-$${formatCurrency(data.totalDiscount)}`));
    }
    if (data.roundingAdjustment !== undefined && data.roundingAdjustment !== 0) {
        const sign = data.roundingAdjustment > 0 ? '+' : '-';
        lines.push(twoColumnLine('Ajuste:', `${sign}$${formatCurrency(Math.abs(data.roundingAdjustment))}`));
    }

    lines.push(divider);
    lines.push(twoColumnLine('TOTAL:', `$${formatCurrency(data.total)}`));
    lines.push(divider);

    // === PAGO ===
    if (data.splitPayments && data.splitPayments.length > 0) {
        lines.push('MÉTODOS DE PAGO:');
        data.splitPayments.forEach(sp => {
            lines.push(twoColumnLine(`- ${sp.method}`, `$${formatCurrency(sp.amount)}`));
        });
    } else {
        lines.push(twoColumnLine('Metodo de pago:', data.paymentMethod));
        if (data.amountPaid !== undefined && data.amountPaid > 0) {
            lines.push(twoColumnLine('Pagado:', `$${formatCurrency(data.amountPaid)}`));
        }
        if (data.change !== undefined && data.change > 0) {
            lines.push(twoColumnLine('Cambio:', `$${formatCurrency(data.change)}`));
        }
    }

    if (data.creditAbono !== undefined && data.creditAbono > 0) {
        lines.push(twoColumnLine('Abono inicial:', `$${formatCurrency(data.creditAbono)}`));
        if (data.creditAbonoMethod) {
            lines.push(twoColumnLine('  Medio:', data.creditAbonoMethod));
        }
        const saldo = Math.max(0, data.total - data.creditAbono);
        lines.push(twoColumnLine('Saldo pendiente:', `$${formatCurrency(saldo)}`));
    }

    lines.push(divider);

    // === FOOTER (centrado) ===
    lines.push(centeredLine('Comprobante de entrega'));
    if (data.sellerName) {
        lines.push(centeredLine(`Atendido por: ${data.sellerName}`));
    }
    lines.push(centeredLine('Gracias por su compra!'));
    lines.push('');

    return (
        <pre
            id="thermal-receipt"
            style={{
                fontFamily: "'Courier New', Courier, monospace",
                fontSize: is58 ? '8px' : '11px',
                fontWeight: 600,
                lineHeight: 1.3,
                margin: 0,
                padding: 0,
                width: '100%',
                whiteSpace: 'pre',
                color: '#000',
                backgroundColor: '#fff',
                WebkitFontSmoothing: 'none',
                textRendering: 'geometricPrecision',
            } as React.CSSProperties}
        >
            {lines.join('\n')}
        </pre>
    );
};
