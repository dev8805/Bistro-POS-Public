import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { PayrollReceiptData } from '../hooks/useEmployeesDirectory';
import { formatPaymentMethodLabel } from '../lib/paymentMethods';

const styles = StyleSheet.create({
    page: {
        padding: 36,
        fontSize: 10,
        fontFamily: 'Helvetica',
        backgroundColor: '#ffffff',
        color: '#222222',
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
        paddingBottom: 12,
        borderBottomWidth: 1.5,
        borderBottomColor: '#1e293b',
        borderBottomStyle: 'solid',
    },
    businessTitle: {
        fontSize: 16,
        fontFamily: 'Helvetica-Bold',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: '#0f172a',
    },
    businessSub: {
        fontSize: 8.5,
        color: '#64748b',
        marginTop: 2,
    },
    docTitle: {
        fontSize: 12,
        fontFamily: 'Helvetica-Bold',
        textAlign: 'right',
        color: '#0f172a',
        textTransform: 'uppercase',
    },
    docSub: {
        fontSize: 8.5,
        textAlign: 'right',
        color: '#64748b',
        marginTop: 2,
    },
    sectionBox: {
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 6,
        padding: 10,
        marginBottom: 14,
    },
    sectionTitle: {
        fontSize: 9,
        fontFamily: 'Helvetica-Bold',
        color: '#475569',
        textTransform: 'uppercase',
        marginBottom: 6,
        letterSpacing: 0.5,
    },
    grid2: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    fieldLabel: {
        fontSize: 8.5,
        color: '#64748b',
        fontFamily: 'Helvetica-Bold',
    },
    fieldValue: {
        fontSize: 9,
        color: '#0f172a',
        fontFamily: 'Helvetica',
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#f1f5f9',
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#cbd5e1',
        paddingVertical: 5,
        paddingHorizontal: 8,
        marginTop: 6,
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 0.5,
        borderColor: '#e2e8f0',
        paddingVertical: 5,
        paddingHorizontal: 8,
    },
    colDesc: { flex: 2 },
    colAmount: { flex: 1, textAlign: 'right' },
    colDate: { flex: 1 },
    totalsSection: {
        marginTop: 10,
        borderTopWidth: 1,
        borderColor: '#cbd5e1',
        paddingTop: 8,
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 3,
    },
    netRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 6,
        paddingTop: 6,
        borderTopWidth: 1.5,
        borderTopColor: '#0f172a',
    },
    netText: {
        fontSize: 12,
        fontFamily: 'Helvetica-Bold',
        color: '#0f172a',
    },
    netValue: {
        fontSize: 13,
        fontFamily: 'Helvetica-Bold',
        color: '#0f172a',
    },
    legalText: {
        fontSize: 7.5,
        color: '#64748b',
        textAlign: 'center',
        marginTop: 20,
        lineHeight: 1.3,
        paddingHorizontal: 20,
    },
    signatureContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginTop: 36,
        paddingTop: 10,
    },
    signBox: {
        width: 190,
        alignItems: 'center',
    },
    signLine: {
        width: '100%',
        borderBottomWidth: 1,
        borderColor: '#334155',
        marginBottom: 5,
    },
    signName: {
        fontSize: 8.5,
        fontFamily: 'Helvetica-Bold',
        color: '#0f172a',
        textAlign: 'center',
    },
    signDoc: {
        fontSize: 7.5,
        color: '#64748b',
        textAlign: 'center',
        marginTop: 1,
    }
});

const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

export const PayrollReceiptPDF: React.FC<{ data: PayrollReceiptData }> = ({ data }) => {
    return (
        <Document>
            <Page size="A5" orientation="portrait" style={styles.page}>
                {/* Header */}
                <View style={styles.headerRow}>
                    <View>
                        <Text style={styles.businessTitle}>{data.businessName}</Text>
                        {data.businessNit && <Text style={styles.businessSub}>NIT: {data.businessNit}</Text>}
                        {data.businessAddress && <Text style={styles.businessSub}>{data.businessAddress}</Text>}
                        {data.businessPhone && <Text style={styles.businessSub}>Tel: {data.businessPhone}</Text>}
                    </View>
                    <View>
                        <Text style={styles.docTitle}>
                            {data.payrollConcept === 'advance' ? 'VALE DE ANTICIPO' : 'COMPROBANTE DE PAGO'}
                        </Text>
                        <Text style={styles.docSub}>No. {data.receiptNumber || '0001'}</Text>
                        <Text style={styles.docSub}>Fecha: {data.date}</Text>
                    </View>
                </View>

                {/* Colaborador Info */}
                <View style={styles.sectionBox}>
                    <Text style={styles.sectionTitle}>Datos del Colaborador</Text>
                    <View style={styles.grid2}>
                        <Text style={styles.fieldLabel}>Nombre:</Text>
                        <Text style={styles.fieldValue}>{data.employeeName}</Text>
                    </View>
                    {data.employeeDocument && (
                        <View style={styles.grid2}>
                            <Text style={styles.fieldLabel}>Documento / C.C.:</Text>
                            <Text style={styles.fieldValue}>{data.employeeDocument}</Text>
                        </View>
                    )}
                    {data.employeeJobTitle && (
                        <View style={styles.grid2}>
                            <Text style={styles.fieldLabel}>Cargo / Función:</Text>
                            <Text style={styles.fieldValue}>{data.employeeJobTitle}</Text>
                        </View>
                    )}
                    <View style={styles.grid2}>
                        <Text style={styles.fieldLabel}>Medio de Pago:</Text>
                        <Text style={styles.fieldValue}>{formatPaymentMethodLabel(data.paymentMethod).toUpperCase()}</Text>
                    </View>
                </View>

                {/* Concepto y Devengado */}
                <View style={styles.sectionBox}>
                    <Text style={styles.sectionTitle}>Concepto Liquidado</Text>
                    <View style={styles.grid2}>
                        <Text style={styles.fieldValue}>{data.conceptDescription}</Text>
                        <Text style={{ ...styles.fieldValue, fontFamily: 'Helvetica-Bold' }}>
                            ${formatCurrency(data.grossAmount)}
                        </Text>
                    </View>
                    {data.notes && (
                        <Text style={{ fontSize: 8, color: '#64748b', marginTop: 4 }}>
                            Observaciones: {data.notes}
                        </Text>
                    )}
                </View>

                {/* Deducciones / Vales si los hay */}
                {data.advancesDeducted && data.advancesDeducted.length > 0 && (
                    <View style={styles.sectionBox}>
                        <Text style={styles.sectionTitle}>Deducciones / Vales Descontados</Text>
                        <View style={styles.tableHeader}>
                            <Text style={{ ...styles.colDate, fontFamily: 'Helvetica-Bold', fontSize: 8 }}>Fecha</Text>
                            <Text style={{ ...styles.colDesc, fontFamily: 'Helvetica-Bold', fontSize: 8 }}>Motivo</Text>
                            <Text style={{ ...styles.colAmount, fontFamily: 'Helvetica-Bold', fontSize: 8 }}>Monto</Text>
                        </View>
                        {data.advancesDeducted.map(adv => (
                            <View key={adv.id} style={styles.tableRow}>
                                <Text style={{ ...styles.colDate, fontSize: 8 }}>{adv.date}</Text>
                                <Text style={{ ...styles.colDesc, fontSize: 8 }}>{adv.reason || 'Vale'}</Text>
                                <Text style={{ ...styles.colAmount, fontSize: 8 }}>-${formatCurrency(adv.amount)}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* Totales */}
                <View style={styles.totalsSection}>
                    <View style={styles.totalRow}>
                        <Text style={styles.fieldLabel}>Total Devengado:</Text>
                        <Text style={styles.fieldValue}>${formatCurrency(data.grossAmount)}</Text>
                    </View>
                    {data.totalDeductions > 0 && (
                        <View style={styles.totalRow}>
                            <Text style={styles.fieldLabel}>Total Deducciones (Vales):</Text>
                            <Text style={{ ...styles.fieldValue, color: '#dc2626' }}>
                                -${formatCurrency(data.totalDeductions)}
                            </Text>
                        </View>
                    )}
                    <View style={styles.netRow}>
                        <Text style={styles.netText}>NETO PAGADO:</Text>
                        <Text style={styles.netValue}>${formatCurrency(data.netAmount)} COP</Text>
                    </View>
                </View>

                {/* Declaración de conformidad */}
                <Text style={styles.legalText}>
                    Recibí a entera conformidad y satisfacción el valor neto estipulado en este comprobante por concepto de mis servicios prestados / anticipo de nómina, no adeudándoseme ningún valor adicional por este periodo o concepto.
                </Text>

                {/* Firma del Colaborador */}
                <View style={styles.signatureContainer}>
                    <View style={styles.signBox}>
                        <View style={styles.signLine} />
                        <Text style={styles.signName}>{data.employeeName}</Text>
                        <Text style={styles.signDoc}>C.C. {data.employeeDocument || '___________________'}</Text>
                        <Text style={styles.signDoc}>Firma del Colaborador</Text>
                    </View>
                    <View style={styles.signBox}>
                        <View style={styles.signLine} />
                        <Text style={styles.signName}>{data.businessName}</Text>
                        <Text style={styles.signDoc}>Entregado por / Empleador</Text>
                    </View>
                </View>
            </Page>
        </Document>
    );
};
