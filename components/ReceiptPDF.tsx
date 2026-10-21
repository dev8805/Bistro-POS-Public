import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { ReceiptData } from '../types';

const UNIT_ABBR: Record<string, string> = {
    'Unidad': 'und', 'Und': 'und',
    'Kilogramos': 'Kg', 'Libras': 'Lb', 'Gramos': 'g', 'Onzas': 'Oz',
    'Litros': 'Lt', 'Mililitros': 'ml', 'Galones': 'Gal', 'Metros': 'm', 'Centímetros': 'cm',
};

const styles = StyleSheet.create({
    page: {
        padding: 40,
        fontSize: 10,
        fontFamily: 'Helvetica',
        backgroundColor: '#ffffff',
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 24,
        paddingBottom: 16,
        borderBottomWidth: 2,
        borderBottomColor: '#333333',
        borderBottomStyle: 'solid',
    },
    businessName: {
        fontSize: 18,
        fontFamily: 'Helvetica-Bold',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    businessDetail: {
        fontSize: 9,
        color: '#555555',
        marginTop: 2,
    },
    invoiceTitle: {
        fontSize: 14,
        fontFamily: 'Helvetica-Bold',
        textAlign: 'right',
        color: '#333333',
        textTransform: 'uppercase',
    },
    invoiceMeta: {
        fontSize: 9,
        textAlign: 'right',
        color: '#555555',
        marginTop: 2,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    infoBlock: {
        flex: 1,
    },
    infoLabel: {
        fontSize: 8,
        color: '#888888',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 2,
    },
    infoValue: {
        fontSize: 10,
        fontFamily: 'Helvetica-Bold',
    },
    table: {
        marginBottom: 20,
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#f2f2f2',
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#cccccc',
        borderBottomStyle: 'solid',
    },
    tableHeaderText: {
        fontSize: 8,
        fontFamily: 'Helvetica-Bold',
        color: '#555555',
        textTransform: 'uppercase',
    },
    tableRow: {
        flexDirection: 'row',
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#eeeeee',
        borderBottomStyle: 'solid',
        alignItems: 'center',
    },
    colNum: { width: 25 },
    colDesc: { flex: 1 },
    colQty: { width: 35, textAlign: 'center' },
    colUOM: { width: 35, textAlign: 'center' },
    colUnit: { width: 70, textAlign: 'right' },
    colSubtotal: { width: 75, textAlign: 'right' },
    cellText: { fontSize: 9 },
    cellBold: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
    cellDetail: { fontSize: 8, color: '#888888', marginTop: 1 },
    totalsContainer: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginBottom: 20,
    },
    totalsBox: {
        width: 220,
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 3,
    },
    totalLabel: {
        fontSize: 9,
        color: '#666666',
    },
    totalValue: {
        fontSize: 9,
    },
    grandTotalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 6,
        marginTop: 4,
        borderTopWidth: 2,
        borderTopColor: '#333333',
        borderTopStyle: 'solid',
    },
    grandTotalLabel: {
        fontSize: 13,
        fontFamily: 'Helvetica-Bold',
    },
    grandTotalValue: {
        fontSize: 13,
        fontFamily: 'Helvetica-Bold',
    },
    paymentSection: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginBottom: 30,
    },
    paymentBox: {
        width: 220,
        padding: 10,
        backgroundColor: '#f9f9f9',
        borderRadius: 4,
    },
    paymentRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 3,
    },
    paymentLabel: {
        fontSize: 9,
        color: '#666666',
    },
    paymentValue: {
        fontSize: 9,
        fontFamily: 'Helvetica-Bold',
    },
    footer: {
        position: 'absolute',
        bottom: 30,
        left: 40,
        right: 40,
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
        borderTopStyle: 'solid',
        paddingTop: 10,
        alignItems: 'center',
    },
    footerText: {
        fontSize: 10,
        fontFamily: 'Helvetica-Bold',
        color: '#333333',
    },
});

const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('es-CO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
};

interface ReceiptPDFProps {
    data: ReceiptData;
}

export const ReceiptPDF: React.FC<ReceiptPDFProps> = ({ data }) => (
    <Document>
        <Page size="LETTER" style={styles.page}>
            {/* Header */}
            <View style={styles.headerRow}>
                <View>
                    <Text style={styles.businessName}>{data.businessName}</Text>
                    {data.businessNit && (
                        <Text style={styles.businessDetail}>NIT: {data.businessNit}</Text>
                    )}
                    {data.businessAddress && (
                        <Text style={styles.businessDetail}>{data.businessAddress}</Text>
                    )}
                    {data.businessPhone && (
                        <Text style={styles.businessDetail}>Tel: {data.businessPhone}</Text>
                    )}
                </View>
                <View>
                    <Text style={styles.invoiceTitle}>Factura de Venta</Text>
                    {(data.displayNumber || data.orderNumber) && (
                        <Text style={styles.invoiceMeta}>N° {data.displayNumber || data.orderNumber}</Text>
                    )}
                    <Text style={styles.invoiceMeta}>{data.date}</Text>
                </View>
            </View>

            {/* Client / Seller info */}
            <View style={styles.infoRow}>
                <View style={styles.infoBlock}>
                    <Text style={styles.infoLabel}>Cliente</Text>
                    <Text style={styles.infoValue}>
                        {(!data.customerName || data.customerName === 'Consumidor Final') ? 'Consumidor Final' : data.customerName}
                    </Text>
                    {data.customerDocument ? (
                        <Text style={styles.businessDetail}>Doc: {data.customerDocument}</Text>
                    ) : (!data.customerName || data.customerName === 'Consumidor Final') ? (
                        <Text style={styles.businessDetail}>Doc: 222222222222</Text>
                    ) : null}
                </View>
                {data.sellerName && (
                    <View style={[styles.infoBlock, { alignItems: 'flex-end' }]}>
                        <Text style={styles.infoLabel}>Vendedor</Text>
                        <Text style={styles.infoValue}>{data.sellerName}</Text>
                    </View>
                )}
            </View>

            {/* Items table */}
            <View style={styles.table}>
                <View style={styles.tableHeader}>
                    <Text style={[styles.tableHeaderText, styles.colNum]}>#</Text>
                    <Text style={[styles.tableHeaderText, styles.colDesc]}>Descripción</Text>
                    <Text style={[styles.tableHeaderText, styles.colQty]}>Cant.</Text>
                    <Text style={[styles.tableHeaderText, styles.colUOM]}>Unidad</Text>
                    <Text style={[styles.tableHeaderText, styles.colUnit]}>Precio Unit.</Text>
                    <Text style={[styles.tableHeaderText, styles.colSubtotal]}>Subtotal</Text>
                </View>

                {data.items.map((item, index) => {
                    const cleanName = item.name.replace(/🏷️\s*/g, '');
                    const unitLabel = (item.unit && UNIT_ABBR[item.unit]) ? UNIT_ABBR[item.unit] : (item.unit || 'und');
                    const qtyDisplay = Math.round(item.quantity * 100) / 100;

                    return (
                        <View key={`item-${index}`} style={styles.tableRow}>
                            <Text style={[styles.cellText, styles.colNum]}>{index + 1}</Text>
                            <View style={styles.colDesc}>
                                <Text style={styles.cellBold}>{cleanName}</Text>
                                {(item.discountPercent || item.discount) ? (
                                    <Text style={styles.cellDetail}>
                                        {item.discountPercent ? `Desc: -${item.discountPercent}%` : ''}
                                        {item.discount ? ` (-$${formatCurrency(item.discount)})` : ''}
                                    </Text>
                                ) : null}
                            </View>
                            <Text style={[styles.cellText, styles.colQty]}>{qtyDisplay}</Text>
                            <Text style={[styles.cellText, styles.colUOM]}>{unitLabel}</Text>
                            <Text style={[styles.cellText, styles.colUnit]}>
                                ${formatCurrency(item.unitPrice)}
                            </Text>
                            <Text style={[styles.cellBold, styles.colSubtotal]}>
                                ${formatCurrency(item.total)}
                            </Text>
                        </View>
                    );
                })}
            </View>

            {/* Totals */}
            <View style={styles.totalsContainer}>
                <View style={styles.totalsBox}>
                    <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Subtotal:</Text>
                        <Text style={styles.totalValue}>${formatCurrency(data.subtotal)}</Text>
                    </View>
                    {data.totalDiscount > 0 && (
                        <View style={styles.totalRow}>
                            <Text style={styles.totalLabel}>Descuento:</Text>
                            <Text style={styles.totalValue}>-${formatCurrency(data.totalDiscount)}</Text>
                        </View>
                    )}
                    {data.roundingAdjustment !== undefined && data.roundingAdjustment !== 0 && (
                        <View style={styles.totalRow}>
                            <Text style={styles.totalLabel}>Ajuste:</Text>
                            <Text style={styles.totalValue}>{data.roundingAdjustment > 0 ? '+' : '-'}${formatCurrency(Math.abs(data.roundingAdjustment))}</Text>
                        </View>
                    )}
                    <View style={styles.grandTotalRow}>
                        <Text style={styles.grandTotalLabel}>TOTAL:</Text>
                        <Text style={styles.grandTotalValue}>${formatCurrency(data.total)}</Text>
                    </View>
                </View>
            </View>

            {/* Payment */}
            <View style={styles.paymentSection}>
                <View style={styles.paymentBox}>
                    <View style={styles.paymentRow}>
                        <Text style={styles.paymentLabel}>Método de pago:</Text>
                        <Text style={styles.paymentValue}>{data.paymentMethod}</Text>
                    </View>
                    {data.amountPaid !== undefined && data.amountPaid > 0 && (
                        <View style={styles.paymentRow}>
                            <Text style={styles.paymentLabel}>Pagado:</Text>
                            <Text style={styles.paymentValue}>${formatCurrency(data.amountPaid)}</Text>
                        </View>
                    )}
                    {data.change !== undefined && data.change > 0 && (
                        <View style={styles.paymentRow}>
                            <Text style={styles.paymentLabel}>Cambio:</Text>
                            <Text style={styles.paymentValue}>${formatCurrency(data.change)}</Text>
                        </View>
                    )}
                    {data.creditAbono !== undefined && data.creditAbono > 0 && (
                        <>
                            <View style={[styles.paymentRow, { marginTop: 4, borderTopWidth: 0.5, borderTopColor: '#cccccc', borderTopStyle: 'solid', paddingTop: 4 }]}>
                                <Text style={styles.paymentLabel}>Abono inicial:</Text>
                                <Text style={[styles.paymentValue, { color: '#1a7a3c' }]}>${formatCurrency(data.creditAbono)}</Text>
                            </View>
                            {data.creditAbonoMethod && (
                                <View style={styles.paymentRow}>
                                    <Text style={styles.paymentLabel}>  Medio de pago:</Text>
                                    <Text style={styles.paymentValue}>{data.creditAbonoMethod}</Text>
                                </View>
                            )}
                            <View style={styles.paymentRow}>
                                <Text style={[styles.paymentLabel, { color: '#cc0000', fontFamily: 'Helvetica-Bold' }]}>Saldo pendiente:</Text>
                                <Text style={[styles.paymentValue, { color: '#cc0000' }]}>${formatCurrency(Math.max(0, Math.round(data.total / 50) * 50 - data.creditAbono))}</Text>
                            </View>
                        </>
                    )}
                </View>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
                <Text style={styles.footerText}>¡Gracias por su compra!</Text>
            </View>
        </Page>
    </Document>
);
