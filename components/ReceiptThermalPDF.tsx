import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReceiptData } from '../types';
import { consolidateReceiptItems } from '../lib/receiptUtils';

const UNIT_ABBR: Record<string, string> = {
    'Kilogramos': 'kg', 'Libras': 'lb', 'Gramos': 'gr', 'Onzas': 'oz',
    'Litros': 'lt', 'Mililitros': 'ml', 'Galones': 'gl', 'Metros': 'mt', 'Centímetros': 'cm',
    'Servicio': 'sv'
};

const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

interface ReceiptThermalPDFProps {
    data: ReceiptData;
    paperWidth: '58mm' | '80mm';
}

const PT_PER_MM = 2.83465;

export const ReceiptThermalPDF: React.FC<ReceiptThermalPDFProps> = ({ data, paperWidth }) => {
    const is58 = paperWidth === '58mm';
    const pageWidthMm = is58 ? 58 : 80;
    const pageWidthPt = pageWidthMm * PT_PER_MM;
    const fontSize = is58 ? 7 : 8; // Más pequeño para emular ticket térmico
    const labelFontSize = is58 ? 7 : 8;

    // Consolidar filas idénticas del mismo producto en una sola (solo para el ticket)
    const receiptItems = consolidateReceiptItems(data.items);

    const s = StyleSheet.create({
        page: {
            paddingHorizontal: is58 ? 8 : 12, // Menos padding en 58mm
            paddingVertical: 10,
            backgroundColor: '#ffffff',
        },
        center: { textAlign: 'center', fontSize, fontFamily: 'Helvetica' },
        centerBold: { textAlign: 'center', fontSize, fontFamily: 'Helvetica-Bold' },
        left: { textAlign: 'left', fontSize, fontFamily: 'Helvetica' },
        row: { flexDirection: 'row' },
        spaceBetween: { flexDirection: 'row', justifyContent: 'space-between' },
        label: { fontSize: labelFontSize, fontFamily: 'Helvetica-Bold' },
        value: { fontSize, fontFamily: 'Helvetica', marginLeft: 2 },
        itemRow: { flexDirection: 'row', marginTop: 2 },
        itemQty: { width: is58 ? 18 : 24, fontSize, fontFamily: 'Helvetica', textAlign: 'right', paddingRight: 2 },
        itemUnit: { width: is58 ? 14 : 16, fontSize, fontFamily: 'Helvetica', textAlign: 'left', paddingLeft: 2 },
        itemName: { flex: 1, fontSize, fontFamily: 'Helvetica' },
        itemUnitPrice: { width: is58 ? 26 : 34, fontSize, fontFamily: 'Helvetica', textAlign: 'right' },
        itemPrice: { width: is58 ? 30 : 40, fontSize, fontFamily: 'Helvetica', textAlign: 'right' },
        totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
        totalLabel: { fontSize, fontFamily: 'Helvetica-Bold' },
        totalValue: { fontSize, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
        grandTotalLabel: { fontSize: fontSize + 2, fontFamily: 'Helvetica-Bold' },
        grandTotalValue: { fontSize: fontSize + 2, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
        spacer: { height: 6 },
        doubleLine: { 
            borderBottomWidth: 1.5, 
            borderBottomColor: '#000000', 
            borderBottomStyle: 'solid', 
            marginVertical: 4 
        },
        singleLine: { 
            borderBottomWidth: 0.5, 
            borderBottomColor: '#000000', 
            borderBottomStyle: 'dashed', 
            marginVertical: 4 
        },
    });

    const customerName = data.customerName || 'Consumidor Final';
    const customerDocument = data.customerDocument;

    // Cálculo píxel a píxel de la altura dinámica para evitar vacíos o cortes en segunda página
    const lh = is58 ? 8.4 : 9.6; // Line height aproximado (fontSize * 1.2)
    const marginY = 2; // márgenes básicos usados en row
    const lineMargin = 8; // marginVertical: 4 * 2 = 8
    
    let estimatedHeight = 20; // Padding top y bottom (10 + 10)
    
    // --- Header ---
    estimatedHeight += lh + marginY; // businessName
    if (data.businessNit) estimatedHeight += lh + marginY;
    if (data.businessAddress) {
        const addrLines = Math.max(1, Math.ceil(data.businessAddress.length / (is58 ? 24 : 34)));
        estimatedHeight += (lh * addrLines);
    }
    if (data.businessPhone) estimatedHeight += lh + marginY;
    estimatedHeight += 1.5 + lineMargin; // doubleLine
    
    // --- Info Cliente ---
    estimatedHeight += lh + marginY; // Fecha
    if (data.displayNumber || data.orderNumber) estimatedHeight += lh + marginY;
    estimatedHeight += lh + marginY; // Cliente
    if (customerDocument) estimatedHeight += lh + marginY; // Documento solo si existe
    estimatedHeight += 0.5 + lineMargin; // singleLine
    
    // --- Tabla (Encabezado) ---
    estimatedHeight += lh + 4; // itemRow + paddings
    
    // --- items func ---
    const nameCharLimit = is58 ? 9 : 18; // Reducido ya que se añadió la columna V.Unid
    receiptItems.forEach(item => {
        const cleanName = item.name.replace(/🏷️\s*/g, '');
        const lines = Math.max(1, Math.ceil(cleanName.length / nameCharLimit));
        estimatedHeight += (lh * lines) + marginY;
    });
    
    estimatedHeight += 0.5 + lineMargin; // singleLine
    
    // --- Subtotales ---
    estimatedHeight += lh + marginY; // Subtotal
    if (data.totalDiscount > 0) estimatedHeight += lh + marginY;
    if (data.roundingAdjustment) estimatedHeight += lh + marginY;
    estimatedHeight += 1.5 + lineMargin; // doubleLine
    
    // --- Total ---
    const totalLh = (is58 ? 9 : 10) * 1.2; // Fuente es mas grande (fontSize + 2)
    estimatedHeight += totalLh + marginY;
    estimatedHeight += 1.5 + lineMargin; // doubleLine
    
    // --- Footer Pagos ---
    estimatedHeight += lh + marginY; // Metodo de pago
    if (data.amountPaid !== undefined && Math.round(data.amountPaid) > 0) estimatedHeight += lh + marginY;
    if (data.change !== undefined && Math.round(data.change) > 0) estimatedHeight += lh + marginY;
    
    // --- Footer Final ---
    estimatedHeight += 10; // Espaciado extra sugerido antes del mensaje
    estimatedHeight += lh * 2; // Atendido por + Gracias
    
    // Margen seguro constante para que el ticket corte sin dejar partes sin aire (ni mucho ni poco)
    estimatedHeight += 15;

    return (
        <Document>
            <Page size={[pageWidthPt, estimatedHeight]} style={s.page}>
                {/* Header Centrado */}
                <Text style={s.centerBold}>{data.businessName.toUpperCase()}</Text>
                {data.businessNit && <Text style={s.center}>NIT: {data.businessNit}</Text>}
                {data.businessAddress && <Text style={s.center}>{data.businessAddress}</Text>}
                {data.businessPhone && <Text style={s.center}>Tel: {data.businessPhone}</Text>}
                
                <View style={s.doubleLine} />

                {/* Info Cliente & Orden */}
                <View style={s.row}>
                    <Text style={s.label}>Fecha: </Text>
                    <Text style={s.value}>{data.date}</Text>
                </View>
                {(data.displayNumber || data.orderNumber) && (
                    <View style={s.row}>
                        <Text style={s.label}>Orden: </Text>
                        <Text style={s.value}>{data.displayNumber || data.orderNumber}</Text>
                    </View>
                )}
                <View style={s.row}>
                    <Text style={s.label}>Cliente: </Text>
                    <Text style={s.value}>{customerName}</Text>
                </View>
                {customerDocument && (
                    <View style={s.row}>
                        <Text style={s.label}>Documento: </Text>
                        <Text style={s.value}>{customerDocument}</Text>
                    </View>
                )}

                <View style={s.singleLine} />

                {/* Encabezados de Tabla */}
                <View style={[s.itemRow, { borderBottomWidth: 0.5, borderBottomColor: '#000000', borderBottomStyle: 'solid', paddingBottom: 2, marginBottom: 2 }]}>
                    <Text style={[s.itemName, { fontFamily: 'Helvetica-Bold' }]}>Producto</Text>
                    <Text style={[s.itemQty, { fontFamily: 'Helvetica-Bold', textAlign: 'right' }]}>Cant.</Text>
                    <Text style={[s.itemUnit, { fontFamily: 'Helvetica-Bold', textAlign: 'left' }]}>Und</Text>
                    <Text style={[s.itemUnitPrice, { fontFamily: 'Helvetica-Bold' }]}>V.unit</Text>
                    <Text style={[s.itemPrice, { fontFamily: 'Helvetica-Bold' }]}>V.prod</Text>
                </View>

                {/* Items */}
                {receiptItems.map((item, index) => {
                    const cleanName = item.name.replace(/🏷️\s*/g, '');
                    let unitAbbr = item.unit && item.unit !== 'Unidad' && item.unit !== 'Und'
                        ? (UNIT_ABBR[item.unit] || item.unit) : 'un';
                    unitAbbr = unitAbbr.substring(0, 2).toLowerCase();
                    const qty = Math.round(item.quantity * 100) / 100;
                    const unitPriceFormated = `$${formatCurrency(item.unitPrice)}`;
                    const totalFormated = `$${formatCurrency(item.total)}`;

                    return (
                        <React.Fragment key={`item-${index}`}>
                            <View style={s.itemRow}>
                                <Text style={s.itemName}>{cleanName}</Text>
                                <Text style={[s.itemQty, { textAlign: 'right' }]}>{qty.toString().replace('.', ',')}</Text>
                                <Text style={s.itemUnit}>{unitAbbr}</Text>
                                <Text style={s.itemUnitPrice}>{unitPriceFormated}</Text>
                                <Text style={s.itemPrice}>{totalFormated}</Text>
                            </View>
                            {(item.discount || item.discountPercent) && (
                                <View style={[s.itemRow, { marginTop: -1 }]}>
                                    <Text style={[s.itemName, { fontSize: is58 ? 5.5 : 6.5, color: '#666' }]}>
                                        {`  Dcto${item.discountPercent ? ` ${item.discountPercent}%` : ''}`}
                                    </Text>
                                    <Text style={s.itemQty}>{''}</Text>
                                    <Text style={s.itemUnit}>{''}</Text>
                                    <Text style={s.itemUnitPrice}>{''}</Text>
                                    <Text style={[s.itemPrice, { fontSize: is58 ? 5.5 : 6.5, color: '#666' }]}>
                                        {`-$${formatCurrency(item.discount || (item.discountPercent! * item.unitPrice * item.quantity / 100))}`}
                                    </Text>
                                </View>
                            )}
                        </React.Fragment>
                    );
                })}

                <View style={s.singleLine} />

                {/* Subtotales */}
                <View style={s.spaceBetween}>
                    <Text style={s.left}>Subtotal:</Text>
                    <Text style={s.left}>${formatCurrency(data.subtotal)}</Text>
                </View>
                {data.totalDiscount > 0 && (
                    <View style={s.spaceBetween}>
                        <Text style={s.left}>Desc:</Text>
                        <Text style={s.left}>-${formatCurrency(data.totalDiscount)}</Text>
                    </View>
                )}
                {data.roundingAdjustment !== undefined && data.roundingAdjustment !== 0 && (
                    <View style={s.spaceBetween}>
                        <Text style={s.left}>Ajuste:</Text>
                        <Text style={s.left}>{data.roundingAdjustment > 0 ? '+' : '-'}${formatCurrency(Math.abs(data.roundingAdjustment))}</Text>
                    </View>
                )}

                <View style={s.doubleLine} />

                {/* Total */}
                <View style={s.spaceBetween}>
                    <Text style={s.grandTotalLabel}>TOTAL:</Text>
                    <Text style={s.grandTotalValue}>${formatCurrency(Math.round(data.total / 50) * 50)}</Text>
                </View>

                <View style={s.doubleLine} />

                {/* Footer Pagos */}
                {(data.splitPayments && data.splitPayments.length > 0) ? (
                    <>
                        <View style={s.spaceBetween}>
                            <Text style={s.label}>MÉTODOS DE PAGO:</Text>
                        </View>
                        {data.splitPayments.map((sp, i) => (
                            <View key={'sp-' + i} style={s.spaceBetween}>
                                <Text style={s.left}>- {sp.method}</Text>
                                <Text style={s.left}>${formatCurrency(sp.amount)}</Text>
                            </View>
                        ))}
                    </>
                ) : (
                    <>
                        <View style={s.spaceBetween}>
                            <Text style={s.label}>Método de pago:</Text>
                            <Text style={s.value}>{data.paymentMethod}</Text>
                        </View>
                        {data.amountPaid !== undefined && data.amountPaid > 0 && data.amountPaid >= data.total && (
                            <View style={s.spaceBetween}>
                                <Text style={s.left}>Pagado:</Text>
                                <Text style={s.left}>${formatCurrency(data.amountPaid)}</Text>
                            </View>
                        )}
                        {data.change !== undefined && data.change > 0 && (
                            <View style={s.spaceBetween}>
                                <Text style={s.left}>Cambio:</Text>
                                <Text style={s.left}>${formatCurrency(data.change)}</Text>
                            </View>
                        )}
                    </>
                )}

                {/* Abono en crédito */}
                {data.creditAbono !== undefined && data.creditAbono > 0 && (
                    <>
                        <View style={s.spaceBetween}>
                            <Text style={s.label}>Abono inicial:</Text>
                            <Text style={s.value}>${formatCurrency(data.creditAbono)}</Text>
                        </View>
                        {data.creditAbonoMethod && (
                            <View style={s.spaceBetween}>
                                <Text style={s.left}>  Medio de pago:</Text>
                                <Text style={s.left}>{data.creditAbonoMethod}</Text>
                            </View>
                        )}
                        <View style={s.spaceBetween}>
                            <Text style={[s.label, { color: '#cc0000' }]}>Saldo pendiente:</Text>
                            <Text style={[s.totalValue, { color: '#cc0000' }]}>${formatCurrency(Math.max(0, Math.round(data.total / 50) * 50 - data.creditAbono))}</Text>
                        </View>
                    </>
                )}

                <View style={s.doubleLine} />

                {/* Footer Cajero */}
                <View style={s.spacer} />
                <Text style={s.centerBold}>Comprobante de entrega</Text>
                {data.sellerName && (
                    <Text style={[s.center, { marginTop: 4 }]}>Atendido por: {data.sellerName}</Text>
                )}
                <Text style={[s.center, { marginTop: 4 }]}>Gracias por su compra!</Text>
                <View style={s.spacer} />
            </Page>
        </Document>
    );
};
