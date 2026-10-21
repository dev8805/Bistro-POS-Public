import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { ShiftReportData } from '../types';

const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const fc = (n: number): string => `$${formatCurrency(n)}`;
const fcNeg = (n: number): string => (n > 0 ? `-$${formatCurrency(n)}` : `$${formatCurrency(n)}`);

interface ShiftReportThermalPDFProps {
    data: ShiftReportData;
    paperWidth: '58mm' | '80mm';
}

const PT_PER_MM = 2.83465;

export const ShiftReportThermalPDF: React.FC<ShiftReportThermalPDFProps> = ({ data, paperWidth }) => {
    const is58 = paperWidth === '58mm';
    const pageWidthPt = (is58 ? 58 : 80) * PT_PER_MM;
    const fontSize = is58 ? 7 : 8;

    const s = StyleSheet.create({
        page: { paddingHorizontal: is58 ? 8 : 12, paddingVertical: 10, backgroundColor: '#ffffff' },
        center: { textAlign: 'center', fontSize, fontFamily: 'Helvetica' },
        centerBold: { textAlign: 'center', fontSize, fontFamily: 'Helvetica-Bold' },
        title: { textAlign: 'center', fontSize: fontSize + 2, fontFamily: 'Helvetica-Bold', marginTop: 2 },
        section: { fontSize, fontFamily: 'Helvetica-Bold', marginTop: 2, marginBottom: 2 },
        row: { flexDirection: 'row', marginTop: 1 },
        label: { fontSize, fontFamily: 'Helvetica-Bold' },
        value: { fontSize, fontFamily: 'Helvetica', marginLeft: 2, flex: 1, textAlign: 'right' },
        line: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 1 },
        lineLabel: { fontSize, fontFamily: 'Helvetica' },
        lineValue: { fontSize, fontFamily: 'Helvetica', textAlign: 'right' },
        lineBold: { fontSize, fontFamily: 'Helvetica-Bold' },
        noteText: { fontSize: fontSize - 0.5, fontFamily: 'Helvetica-Oblique', color: '#555555', marginTop: 1, marginLeft: 4 },
        doubleLine: { borderBottomWidth: 1.5, borderBottomColor: '#000000', borderBottomStyle: 'solid', marginVertical: 4 },
        singleLine: { borderBottomWidth: 0.5, borderBottomColor: '#000000', borderBottomStyle: 'dashed', marginVertical: 4 },
        spacer: { height: 8 },
    });

    // Estimación de altura: ~ líneas * lineHeight + márgenes de separadores
    const lh = (is58 ? 7 : 8) * 1.5;
    const infoRows = 2 + (data.shiftNumber ? 1 : 0) + (data.cashierName ? 1 : 0) + 1 + (data.closedAt ? 1 : 0) + (data.closedByName ? 1 : 0);
    const movRows = 8;
    const declaredRows = 4;
    const summaryRows = 6;
    const headerLines = 1 + (data.businessNit ? 1 : 0) + (data.businessAddress ? 1 : 0) + (data.businessPhone ? 1 : 0) + 1; // + título
    const outflowsCount = data.cashOutflows?.length || 0;
    const notesCount = data.cashOutflows?.filter(o => o.note)?.length || 0;
    const outflowLines = outflowsCount > 0 ? (1 + outflowsCount + notesCount) : 0;
    const totalLines = headerLines + infoRows + movRows + declaredRows + summaryRows + 6 + outflowLines; // +secciones
    const separatorCount = 7 + (outflowsCount > 0 ? 1 : 0);
    const estimatedHeight = 20 + totalLines * lh + separatorCount * 8 /* separadores */ + 24;

    const InfoRow = ({ label, value }: { label: string; value: string }) => (
        <View style={s.row}>
            <Text style={s.label}>{label} </Text>
            <Text style={s.value}>{value}</Text>
        </View>
    );

    const Line = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
        <View style={s.line}>
            <Text style={bold ? s.lineBold : s.lineLabel}>{label}</Text>
            <Text style={bold ? s.lineBold : s.lineValue}>{value}</Text>
        </View>
    );

    return (
        <Document>
            <Page size={[pageWidthPt, estimatedHeight]} style={s.page}>
                {/* Encabezado */}
                <Text style={s.centerBold}>{data.businessName.toUpperCase()}</Text>
                {data.businessNit && <Text style={s.center}>NIT: {data.businessNit}</Text>}
                {data.businessAddress && <Text style={s.center}>{data.businessAddress}</Text>}
                {data.businessPhone && <Text style={s.center}>Tel: {data.businessPhone}</Text>}
                <Text style={s.title}>REPORTE DIARIO</Text>

                <View style={s.doubleLine} />

                {/* Datos del turno */}
                <InfoRow label="Caja:" value={data.registerName} />
                {data.shiftNumber !== undefined && <InfoRow label="Turno #:" value={String(data.shiftNumber)} />}
                {data.cashierName && <InfoRow label="Vendedor:" value={data.cashierName} />}
                <InfoRow label="Apertura:" value={data.openedAt} />
                {data.closedAt && <InfoRow label="Cierre:" value={data.closedAt} />}
                {data.closedByName && <InfoRow label="Cerrado por:" value={data.closedByName} />}

                <View style={s.singleLine} />

                {/* Movimiento de caja */}
                <Text style={s.section}>MOVIMIENTO DE CAJA</Text>
                <Line label="Base inicial de caja" value={fc(data.openingBalance)} />
                <Line label="Efectivo" value={fc(data.cashSales)} />
                <Line label="Otros ingresos de efectivo" value={fc(data.cashIn)} />
                <Line label="Retiro de efectivo" value={fcNeg(data.cashOut)} />
                <Line label="Total de efectivo" value={fc(data.totalCash)} bold />
                <Line label="Tarjetas" value={fc(data.cardSales)} />
                <Line label="Pagos en linea" value={fc(data.onlineSales)} />
                <Line label="Otros" value={fc(data.otherSales)} />

                <View style={s.singleLine} />

                {/* Valores ingresados por el cajero */}
                <Text style={s.section}>VALORES INGRESADOS POR EL CAJERO</Text>
                <Line label="Efectivo" value={fc(data.declaredCash)} />
                <Line label="Tarjetas" value={fc(data.declaredCard)} />
                <Line label="Pagos en linea" value={fc(data.declaredOnline)} />
                <Line label="Otros" value={fc(data.declaredOther)} />

                <View style={s.singleLine} />

                {/* Resumen final */}
                <Text style={s.section}>RESUMEN FINAL</Text>
                <Line label="Total ingresado en cierre" value={fc(data.totalDeclared)} />
                <Line label="Total esperado en cierre" value={fc(data.totalExpected)} />
                <Line label="Diferencia" value={data.difference >= 0 ? fc(data.difference) : `-$${formatCurrency(Math.abs(data.difference))}`} bold />
                <Line label="Devoluciones" value={fcNeg(data.refunds)} />
                <Line label="Retiros diferentes a efectivo" value={fcNeg(data.otherWithdrawals)} />
                <Line label="Facturas a credito" value={fc(data.creditSales)} />

                {/* Salidas de efectivo */}
                {data.cashOutflows && data.cashOutflows.length > 0 && (
                    <>
                        <View style={s.singleLine} />
                        <Text style={s.section}>SALIDAS DE EFECTIVO</Text>
                        {data.cashOutflows.map((outflow, idx) => (
                            <View key={idx} style={{ marginTop: 2 }}>
                                <View style={s.line}>
                                    <Text style={[s.lineLabel, { flex: 1, paddingRight: 8 }]}>{outflow.title}</Text>
                                    <Text style={s.lineValue}>{fc(outflow.amount)}</Text>
                                </View>
                                {outflow.note && (
                                    <Text style={s.noteText}>({outflow.note})</Text>
                                )}
                            </View>
                        ))}
                    </>
                )}

                <View style={s.doubleLine} />
                <View style={s.spacer} />
            </Page>
        </Document>
    );
};
