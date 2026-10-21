import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import { EmployeeReportData, AlertLevel } from '../lib/buildEmployeeReport';

// ─── Fuente Inter (Google Fonts) ───────────────────────────────────────────────
Font.register({
    family: 'Inter',
    fonts: [
        { src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfAZ9hjQ.ttf', fontWeight: 400 },
        { src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuI6fAZ9hjQ.ttf', fontWeight: 500 },
        { src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYAZ9hjQ.ttf', fontWeight: 600 },
        { src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYAZ9hjQ.ttf', fontWeight: 700 },
        { src: 'https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuDyYAZ9hjQ.ttf', fontWeight: 800 },
    ],
});
Font.registerHyphenationCallback((word) => [word]);

// ─── Paleta moderna ────────────────────────────────────────────────────────────
const C = {
    // Header
    headerBg:      '#0f172a', // slate-900
    headerAccent:  '#6366f1', // indigo-500
    headerText:    '#f8fafc', // slate-50
    headerSub:     '#94a3b8', // slate-400

    // Body
    pageBg:        '#ffffff',
    ink:           '#0f172a',
    inkMid:        '#334155', // slate-700
    inkLight:      '#64748b', // slate-500
    inkFaint:      '#94a3b8',

    // Surfaces
    surface:       '#f8fafc', // slate-50
    surfaceMuted:  '#f1f5f9', // slate-100
    border:        '#e2e8f0', // slate-200
    borderLight:   '#f1f5f9',

    // Accents
    indigo:        '#6366f1',
    indigoBg:      '#eef2ff',
    emerald:       '#059669',
    emeraldBg:     '#ecfdf5',
    amber:         '#d97706',
    amberBg:       '#fffbeb',
    rose:          '#e11d48',
    roseBg:        '#fff1f2',
    sky:           '#0284c7',
    skyBg:         '#f0f9ff',
};

const styles = StyleSheet.create({
    page: {
        paddingHorizontal: 36,
        paddingTop: 0,
        paddingBottom: 44,
        fontFamily: 'Inter',
        fontSize: 8.5,
        fontWeight: 400,
        color: C.inkMid,
        backgroundColor: C.pageBg,
    },

    // ── Header (banda oscura) ──────────────────────────────────────────────────
    header: {
        marginHorizontal: -36,
        paddingHorizontal: 36,
        paddingTop: 28,
        paddingBottom: 20,
        backgroundColor: C.headerBg,
        marginBottom: 18,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    headerLeft: { flexDirection: 'column', gap: 2 },
    headerBadge: {
        backgroundColor: C.headerAccent,
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        alignSelf: 'flex-start',
        marginBottom: 6,
    },
    headerBadgeText: { color: '#ffffff', fontSize: 6.5, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase' },
    headerTitle: { fontSize: 22, fontWeight: 800, color: C.headerText, letterSpacing: -0.3 },
    headerPeriod: { fontSize: 9, fontWeight: 500, color: C.headerSub, marginTop: 3 },
    headerRight: { alignItems: 'flex-end', gap: 2 },
    headerBusiness: { fontSize: 10, fontWeight: 700, color: C.headerText },
    headerMeta: { fontSize: 7.5, fontWeight: 400, color: C.headerSub },

    // ── Section ────────────────────────────────────────────────────────────────
    section: {
        marginBottom: 12,
        borderRadius: 8,
        border: `1 solid ${C.border}`,
        overflow: 'hidden',
    },
    sectionHead: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
        backgroundColor: C.surface,
    },
    sectionIcon: {
        width: 8,
        height: 20,
        borderRadius: 3,
        marginRight: 8,
    },
    sectionTitle: { fontSize: 9.5, fontWeight: 700, color: C.ink, letterSpacing: 0.2 },
    sectionMeta: { marginLeft: 'auto', fontSize: 7.5, fontWeight: 500, color: C.inkFaint },
    sectionBody: { paddingHorizontal: 14, paddingVertical: 10 },

    // ── KPI cards ──────────────────────────────────────────────────────────────
    kpiGrid: { flexDirection: 'row', gap: 8, marginBottom: 6 },
    kpiCard: {
        flex: 1,
        borderRadius: 6,
        border: `1 solid ${C.border}`,
        padding: 9,
        backgroundColor: C.pageBg,
    },
    kpiLabel: { fontSize: 6.5, fontWeight: 600, color: C.inkMid, letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase' },
    kpiValue: { fontSize: 13, fontWeight: 800, color: C.ink, letterSpacing: -0.2 },

    // ── Table ──────────────────────────────────────────────────────────────────
    tHead: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: C.border,
        paddingVertical: 5,
        paddingHorizontal: 6,
        backgroundColor: C.surfaceMuted,
    },
    tHeadCell: { fontSize: 7, fontWeight: 700, color: C.inkLight, textTransform: 'uppercase', letterSpacing: 0.4 },
    tRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: C.borderLight,
        paddingVertical: 5,
        paddingHorizontal: 6,
    },
    tCell: { fontSize: 8, fontWeight: 400, color: C.inkMid },
    tCellBold: { fontSize: 8, fontWeight: 600, color: C.ink },

    // ── Alerts Pills ───────────────────────────────────────────────────────────
    pillOk:     { backgroundColor: C.emeraldBg, color: C.emerald, paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 10, fontSize: 7, fontWeight: 700 },
    pillWarn:   { backgroundColor: C.amberBg,   color: C.amber,   paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 10, fontSize: 7, fontWeight: 700 },
    pillDanger: { backgroundColor: C.roseBg,    color: C.rose,    paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 10, fontSize: 7, fontWeight: 700 },

    // ── Hourly chart ───────────────────────────────────────────────────────────
    hourBar: { borderRadius: 2, marginHorizontal: 0.4 },

    // ── Footer ─────────────────────────────────────────────────────────────────
    footer: {
        position: 'absolute',
        bottom: 16,
        left: 36,
        right: 36,
        flexDirection: 'row',
        justifyContent: 'space-between',
        fontSize: 7,
        fontWeight: 400,
        color: C.inkFaint,
        borderTopWidth: 1,
        borderTopColor: C.border,
        paddingTop: 8,
    },
});

// Helpers
const fmt = (n: number): string =>
    '$' + n.toLocaleString('es-CO', { maximumFractionDigits: 0 });
const pct = (n: number): string => n.toFixed(1) + '%';
const pillStyleFor = (level: AlertLevel) => {
    if (level === 'danger') return styles.pillDanger;
    if (level === 'warn') return styles.pillWarn;
    return styles.pillOk;
};
const pillTextFor = (level: AlertLevel) =>
    level === 'ok' ? '✓  OK' : level === 'warn' ? '⚠  ATENCIÓN' : '✕  CRÍTICO';

// Section header with colored bar
interface SectionHeadProps { color: string; title: string; meta?: string }
const SectionHead: React.FC<SectionHeadProps> = ({ color, title, meta }) => (
    <View style={styles.sectionHead}>
        <View style={[styles.sectionIcon, { backgroundColor: color }]} />
        <Text style={styles.sectionTitle}>{title}</Text>
        {meta && <Text style={styles.sectionMeta}>{meta}</Text>}
    </View>
);

interface Props {
    data: EmployeeReportData;
}

export const EmployeeReportPDF: React.FC<Props> = ({ data }) => {
    const s = data.summary;
    const hasPayments = data.paymentMethods.length > 0;
    const hasVoids = data.voids.voidedSales.length > 0 || data.voids.voidedItems.length > 0;
    const hasRefunds = data.refunds.list.length > 0;
    const hasDiscounts = data.discounts.total > 0;
    const hasTopProducts = data.topProducts.length > 0;
    const hasHourly = data.hourlyActivity.some(h => h.count > 0);
    const hasShifts = data.shifts.length > 0;
    const hasAlerts = s.grossSales > 0;

    const maxHourlyIncome = Math.max(...data.hourlyActivity.map(h => h.income), 1);

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* ─── Dark Header ──────────────────────────────────────────────── */}
                <View style={styles.header}>
                    <View style={styles.headerRow}>
                        <View style={styles.headerLeft}>
                            <View style={styles.headerBadge}>
                                <Text style={styles.headerBadgeText}>Reporte de Empleado</Text>
                            </View>
                            <Text style={styles.headerTitle}>{data.employee.name}</Text>
                            {!data.employee.isActive && (
                                <Text style={[styles.headerPeriod, { color: C.amber }]}>Empleado inactivo</Text>
                            )}
                            <Text style={styles.headerPeriod}>{data.period.label}</Text>
                        </View>
                        <View style={styles.headerRight}>
                            <Text style={styles.headerBusiness}>{data.business.name}</Text>
                            {data.business.nit && <Text style={styles.headerMeta}>NIT {data.business.nit}</Text>}
                            <Text style={styles.headerMeta}>{data.generatedAt}</Text>
                        </View>
                    </View>
                </View>

                {/* ─── Resumen Ejecutivo ─────────────────────────────────────────── */}
                <View style={styles.section} wrap={false}>
                    <SectionHead color={C.indigo} title="Resumen Ejecutivo" />
                    <View style={styles.sectionBody}>
                        <View style={styles.kpiGrid}>
                            <View style={[styles.kpiCard, { backgroundColor: C.indigoBg, borderColor: '#c7d2fe' }]}>
                                <Text style={styles.kpiLabel}>Ventas Brutas</Text>
                                <Text style={[styles.kpiValue, { color: C.indigo }]}>{fmt(s.grossSales)}</Text>
                            </View>
                            <View style={styles.kpiCard}>
                                <Text style={styles.kpiLabel}>Descuentos</Text>
                                <Text style={[styles.kpiValue, { color: s.discountTotal > 0 ? C.amber : C.ink }]}>−{fmt(s.discountTotal)}</Text>
                            </View>
                            <View style={styles.kpiCard}>
                                <Text style={styles.kpiLabel}>Anulaciones</Text>
                                <Text style={[styles.kpiValue, { color: s.voidTotal > 0 ? C.rose : C.ink }]}>−{fmt(s.voidTotal)}</Text>
                            </View>
                            <View style={styles.kpiCard}>
                                <Text style={styles.kpiLabel}>Devoluciones</Text>
                                <Text style={[styles.kpiValue, { color: s.refundTotal > 0 ? C.rose : C.ink }]}>−{fmt(s.refundTotal)}</Text>
                            </View>
                        </View>
                        <View style={styles.kpiGrid}>
                            <View style={[styles.kpiCard, { backgroundColor: C.emeraldBg, borderColor: '#a7f3d0' }]}>
                                <Text style={styles.kpiLabel}>Ventas Netas</Text>
                                <Text style={[styles.kpiValue, { color: C.emerald }]}>{fmt(s.netSales)}</Text>
                            </View>
                            <View style={styles.kpiCard}>
                                <Text style={styles.kpiLabel}>Pedidos</Text>
                                <Text style={styles.kpiValue}>{s.ordersCount}</Text>
                            </View>
                            <View style={styles.kpiCard}>
                                <Text style={styles.kpiLabel}>Ticket Promedio</Text>
                                <Text style={styles.kpiValue}>{fmt(s.averageTicket)}</Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* ─── Indicadores de Alerta ─────────────────────────────────────── */}
                {hasAlerts && (
                    <View style={styles.section} wrap={false}>
                        <SectionHead color={C.amber} title="Indicadores de Alerta" />
                        <View style={styles.sectionBody}>
                            {[
                                { label: 'Tasa de anulación', alert: data.alerts.voidRate },
                                { label: 'Tasa de devolución', alert: data.alerts.refundRate },
                                { label: '% descuento sobre ventas', alert: data.alerts.discountRate },
                            ].map((row) => (
                                <View key={row.label} style={[styles.tRow, { borderBottomColor: C.borderLight, paddingVertical: 6 }]}>
                                    <Text style={[styles.tCell, { flex: 4 }]}>{row.label}</Text>
                                    <Text style={[styles.tCellBold, { flex: 1.2, textAlign: 'right' }]}>{pct(row.alert.value)}</Text>
                                    <Text style={[styles.tCell, { flex: 1.5, textAlign: 'right', color: C.inkFaint }]}>umbral {row.alert.threshold}%</Text>
                                    <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                                        <Text style={pillStyleFor(row.alert.level)}>{pillTextFor(row.alert.level)}</Text>
                                    </View>
                                </View>
                            ))}
                            <View style={[styles.tRow, { borderBottomWidth: 0, paddingVertical: 6 }]}>
                                <Text style={[styles.tCell, { flex: 4 }]}>Turnos con faltante &gt; {fmt(data.alerts.shiftShortages.threshold)}</Text>
                                <Text style={[styles.tCellBold, { flex: 1.2, textAlign: 'right' }]}>{data.alerts.shiftShortages.count}</Text>
                                <Text style={[styles.tCell, { flex: 1.5, textAlign: 'right' }]}> </Text>
                                <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
                                    <Text style={pillStyleFor(data.alerts.shiftShortages.level)}>{pillTextFor(data.alerts.shiftShortages.level)}</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                )}

                {/* ─── Métodos de Pago ──────────────────────────────────────────── */}
                {hasPayments && (
                    <View style={styles.section} wrap={false}>
                        <SectionHead color={C.sky} title="Métodos de Pago" />
                        <View style={styles.sectionBody}>
                            <View style={styles.tHead}>
                                <Text style={[styles.tHeadCell, { flex: 3 }]}>Método</Text>
                                <Text style={[styles.tHeadCell, { flex: 1, textAlign: 'center' }]}>Ventas</Text>
                                <Text style={[styles.tHeadCell, { flex: 2, textAlign: 'right' }]}>Monto</Text>
                                <Text style={[styles.tHeadCell, { flex: 1, textAlign: 'right' }]}>%</Text>
                            </View>
                            {data.paymentMethods.map((pm) => (
                                <View key={pm.method} style={styles.tRow}>
                                    <Text style={[styles.tCellBold, { flex: 3 }]}>{pm.label}</Text>
                                    <Text style={[styles.tCell, { flex: 1, textAlign: 'center' }]}>{pm.count}</Text>
                                    <Text style={[styles.tCellBold, { flex: 2, textAlign: 'right' }]}>{fmt(pm.amount)}</Text>
                                    <Text style={[styles.tCell, { flex: 1, textAlign: 'right' }]}>{pct(pm.percent)}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* ─── Anulaciones ──────────────────────────────────────────────── */}
                {hasVoids && (
                    <View style={styles.section} wrap={false}>
                        <SectionHead
                            color={C.rose}
                            title="Anulaciones"
                            meta={`${data.voids.voidedSales.length} ventas + ${data.voids.voidedItems.length} ítems · ${fmt(s.voidTotal)} (${pct(data.voids.rate)})`}
                        />
                        <View style={styles.sectionBody}>
                            {data.voids.voidedSales.length > 0 && (
                                <>
                                    <Text style={[styles.kpiLabel, { marginBottom: 5, fontSize: 7.5 }]}>Ventas anuladas</Text>
                                    <View style={styles.tHead}>
                                        <Text style={[styles.tHeadCell, { flex: 2.2 }]}>Fecha</Text>
                                        <Text style={[styles.tHeadCell, { flex: 1 }]}>Orden</Text>
                                        <Text style={[styles.tHeadCell, { flex: 2.2 }]}>Producto</Text>
                                        <Text style={[styles.tHeadCell, { flex: 1.3, textAlign: 'right' }]}>Monto</Text>
                                        <Text style={[styles.tHeadCell, { flex: 2.5, paddingLeft: 10 }]}>Motivo</Text>
                                    </View>
                                    {data.voids.voidedSales.slice(0, 30).map((v, i) => (
                                        <View key={`vs-${i}`} style={styles.tRow}>
                                            <Text style={[styles.tCell, { flex: 2.2 }]}>{v.date}</Text>
                                            <Text style={[styles.tCellBold, { flex: 1 }]}>{v.orderNumber}</Text>
                                            <Text style={[styles.tCell, { flex: 2.2 }]}>{v.products}</Text>
                                            <Text style={[styles.tCellBold, { flex: 1.3, textAlign: 'right', color: C.rose }]}>{fmt(v.amount)}</Text>
                                            <Text style={[styles.tCell, { flex: 2.5, paddingLeft: 10 }]}>{v.reason}</Text>
                                        </View>
                                    ))}
                                </>
                            )}

                            {data.voids.voidedItems.length > 0 && (
                                <>
                                    <Text style={[styles.kpiLabel, { marginBottom: 5, marginTop: 10, fontSize: 7.5 }]}>Ítems anulados</Text>
                                    <View style={styles.tHead}>
                                        <Text style={[styles.tHeadCell, { flex: 2.2 }]}>Fecha</Text>
                                        <Text style={[styles.tHeadCell, { flex: 1 }]}>Orden</Text>
                                        <Text style={[styles.tHeadCell, { flex: 2.2 }]}>Producto</Text>
                                        <Text style={[styles.tHeadCell, { flex: 1.3, textAlign: 'right' }]}>Monto</Text>
                                        <Text style={[styles.tHeadCell, { flex: 2.5, paddingLeft: 10 }]}>Motivo</Text>
                                    </View>
                                    {data.voids.voidedItems.slice(0, 30).map((v, i) => (
                                        <View key={`vi-${i}`} style={styles.tRow}>
                                            <Text style={[styles.tCell, { flex: 2.2 }]}>{v.date}</Text>
                                            <Text style={[styles.tCellBold, { flex: 1 }]}>{v.orderNumber}</Text>
                                            <Text style={[styles.tCell, { flex: 2.2 }]}>{v.productName}</Text>
                                            <Text style={[styles.tCellBold, { flex: 1.3, textAlign: 'right', color: C.rose }]}>{fmt(v.amount)}</Text>
                                            <Text style={[styles.tCell, { flex: 2.5, paddingLeft: 10 }]}>{v.reason}</Text>
                                        </View>
                                    ))}
                                </>
                            )}

                            {data.voids.topReasons.length > 0 && (
                                <>
                                    <Text style={[styles.kpiLabel, { marginBottom: 5, marginTop: 10, fontSize: 7.5 }]}>Motivos más frecuentes</Text>
                                    <View style={styles.tHead}>
                                        <Text style={[styles.tHeadCell, { flex: 4 }]}>Motivo</Text>
                                        <Text style={[styles.tHeadCell, { flex: 1, textAlign: 'center' }]}>Veces</Text>
                                        <Text style={[styles.tHeadCell, { flex: 2, textAlign: 'right' }]}>Monto</Text>
                                    </View>
                                    {data.voids.topReasons.map((r, i) => (
                                        <View key={`r-${i}`} style={styles.tRow}>
                                            <Text style={[styles.tCellBold, { flex: 4 }]}>{r.reason}</Text>
                                            <Text style={[styles.tCell, { flex: 1, textAlign: 'center' }]}>{r.count}</Text>
                                            <Text style={[styles.tCellBold, { flex: 2, textAlign: 'right' }]}>{fmt(r.amount)}</Text>
                                        </View>
                                    ))}
                                </>
                            )}
                        </View>
                    </View>
                )}

                {/* ─── Devoluciones ─────────────────────────────────────────────── */}
                {hasRefunds && (
                    <View style={styles.section} wrap={false}>
                        <SectionHead
                            color="#7c3aed"
                            title="Devoluciones"
                            meta={`${data.refunds.list.length} · ${fmt(s.refundTotal)} (${pct(data.refunds.rate)})`}
                        />
                        <View style={styles.sectionBody}>
                            <View style={styles.tHead}>
                                <Text style={[styles.tHeadCell, { flex: 2.5 }]}>Fecha</Text>
                                <Text style={[styles.tHeadCell, { flex: 1.2 }]}>Orden</Text>
                                <Text style={[styles.tHeadCell, { flex: 1.5, textAlign: 'right' }]}>Monto</Text>
                                <Text style={[styles.tHeadCell, { flex: 3.5, paddingLeft: 10 }]}>Motivo · Productos</Text>
                            </View>
                            {data.refunds.list.slice(0, 30).map((r, i) => (
                                <View key={`rf-${i}`} style={styles.tRow}>
                                    <Text style={[styles.tCell, { flex: 2.5 }]}>{r.date}</Text>
                                    <Text style={[styles.tCellBold, { flex: 1.2 }]}>{r.orderNumber}</Text>
                                    <Text style={[styles.tCellBold, { flex: 1.5, textAlign: 'right', color: '#7c3aed' }]}>{fmt(r.amount)}</Text>
                                    <Text style={[styles.tCell, { flex: 3.5, paddingLeft: 10 }]}>{r.reason}{r.items ? ` — ${r.items}` : ''}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* ─── Descuentos ───────────────────────────────────────────────── */}
                {hasDiscounts && (
                    <View style={styles.section} wrap={false}>
                        <SectionHead
                            color={C.amber}
                            title="Descuentos Otorgados"
                            meta={`${fmt(data.discounts.total)} · ${pct(data.discounts.rate)} de brutas · ${data.discounts.ordersWithDiscount} ventas`}
                        />
                        <View style={styles.sectionBody}>
                            <View style={styles.tHead}>
                                <Text style={[styles.tHeadCell, { flex: 2.5 }]}>Fecha</Text>
                                <Text style={[styles.tHeadCell, { flex: 1.2 }]}>Orden</Text>
                                <Text style={[styles.tHeadCell, { flex: 3 }]}>Cliente</Text>
                                <Text style={[styles.tHeadCell, { flex: 1.5, textAlign: 'right' }]}>Descuento</Text>
                            </View>
                            {data.discounts.top.map((d, i) => (
                                <View key={`d-${i}`} style={styles.tRow}>
                                    <Text style={[styles.tCell, { flex: 2.5 }]}>{d.date}</Text>
                                    <Text style={[styles.tCellBold, { flex: 1.2 }]}>{d.orderNumber}</Text>
                                    <Text style={[styles.tCell, { flex: 3 }]}>{d.customerName}</Text>
                                    <Text style={[styles.tCellBold, { flex: 1.5, textAlign: 'right', color: C.amber }]}>−{fmt(d.amount)}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* ─── Top Productos ────────────────────────────────────────────── */}
                {hasTopProducts && (
                    <View style={styles.section} wrap={false}>
                        <SectionHead color={C.emerald} title="Top Productos Vendidos" />
                        <View style={styles.sectionBody}>
                            <View style={styles.tHead}>
                                <Text style={[styles.tHeadCell, { flex: 0.5 }]}>#</Text>
                                <Text style={[styles.tHeadCell, { flex: 4 }]}>Producto</Text>
                                <Text style={[styles.tHeadCell, { flex: 1, textAlign: 'center' }]}>Cant.</Text>
                                <Text style={[styles.tHeadCell, { flex: 2, textAlign: 'right' }]}>Ingreso</Text>
                                <Text style={[styles.tHeadCell, { flex: 1, textAlign: 'right' }]}>%</Text>
                            </View>
                            {data.topProducts.map((p, i) => (
                                <View key={`p-${i}`} style={styles.tRow}>
                                    <Text style={[styles.tCellBold, { flex: 0.5, color: C.inkFaint }]}>{i + 1}</Text>
                                    <Text style={[styles.tCellBold, { flex: 4 }]}>{p.name}</Text>
                                    <Text style={[styles.tCell, { flex: 1, textAlign: 'center' }]}>{p.quantity.toFixed(0)}</Text>
                                    <Text style={[styles.tCellBold, { flex: 2, textAlign: 'right' }]}>{fmt(p.income)}</Text>
                                    <Text style={[styles.tCell, { flex: 1, textAlign: 'right' }]}>{pct(p.percent)}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* ─── Actividad por Hora ───────────────────────────────────────── */}
                {hasHourly && (
                    <View style={styles.section} wrap={false}>
                        <SectionHead color={C.indigo} title="Actividad por Hora" />
                        <View style={styles.sectionBody}>
                            <View style={{ flexDirection: 'row', height: 52, alignItems: 'flex-end', marginTop: 4 }}>
                                {data.hourlyActivity.map((h) => (
                                    <View
                                        key={`h-${h.hour}`}
                                        style={[
                                            styles.hourBar,
                                            {
                                                flex: 1,
                                                height: maxHourlyIncome > 0 && h.income > 0
                                                    ? Math.max(3, (h.income / maxHourlyIncome) * 52)
                                                    : 1,
                                                backgroundColor: h.income > 0 ? C.indigo : C.borderLight,
                                            },
                                        ]}
                                    />
                                ))}
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
                                <Text style={{ fontSize: 7, fontWeight: 500, color: C.inkFaint }}>00h</Text>
                                <Text style={{ fontSize: 7, fontWeight: 500, color: C.inkFaint }}>06h</Text>
                                <Text style={{ fontSize: 7, fontWeight: 500, color: C.inkFaint }}>12h</Text>
                                <Text style={{ fontSize: 7, fontWeight: 500, color: C.inkFaint }}>18h</Text>
                                <Text style={{ fontSize: 7, fontWeight: 500, color: C.inkFaint }}>23h</Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* ─── Turnos de Caja ───────────────────────────────────────────── */}
                {hasShifts && (
                    <View style={styles.section} wrap={false}>
                        <SectionHead color={C.emerald} title="Turnos de Caja" meta={`${data.shifts.length} turno${data.shifts.length === 1 ? '' : 's'}`} />
                        <View style={styles.sectionBody}>
                            <View style={styles.tHead}>
                                <Text style={[styles.tHeadCell, { flex: 2.5 }]}>Apertura</Text>
                                <Text style={[styles.tHeadCell, { flex: 2.5 }]}>Cierre</Text>
                                <Text style={[styles.tHeadCell, { flex: 1.5, textAlign: 'right' }]}>Inicial</Text>
                                <Text style={[styles.tHeadCell, { flex: 1.8, textAlign: 'right' }]}>Diferencia</Text>
                                <Text style={[styles.tHeadCell, { flex: 1.2, textAlign: 'center' }]}>Estado</Text>
                            </View>
                            {data.shifts.map((sh, i) => {
                                const diff = sh.difference;
                                const diffColor = diff === null ? C.inkFaint
                                    : diff < -data.alerts.shiftShortages.threshold ? C.rose
                                    : diff < 0 ? C.amber
                                    : C.emerald;
                                return (
                                    <View key={`sh-${i}`} style={styles.tRow}>
                                        <Text style={[styles.tCell, { flex: 2.5 }]}>{sh.openedAt}</Text>
                                        <Text style={[styles.tCell, { flex: 2.5 }]}>{sh.closedAt || '— en curso —'}</Text>
                                        <Text style={[styles.tCellBold, { flex: 1.5, textAlign: 'right' }]}>{fmt(sh.openingBalance)}</Text>
                                        <Text style={[styles.tCellBold, { flex: 1.8, textAlign: 'right', color: diffColor }]}>
                                            {diff === null ? '—' : (diff > 0 ? '+' : '') + fmt(diff)}
                                        </Text>
                                        <Text style={[styles.tCell, { flex: 1.2, textAlign: 'center' }]}>{sh.status}</Text>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                )}

                {/* ─── Footer ───────────────────────────────────────────────────── */}
                <View style={styles.footer} fixed>
                    <Text>Bistro POS · Reporte generado automáticamente</Text>
                    <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
                </View>
            </Page>
        </Document>
    );
};
