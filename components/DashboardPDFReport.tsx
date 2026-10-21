import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { DashboardData } from '../hooks/useDashboard';

// ─── Paleta de colores ───────────────────────────────────────────────────────
const C = {
  primary:     '#1a56db',
  primaryDark: '#1e429f',
  success:     '#057a55',
  successBg:   '#f3faf7',
  successBg2:  '#def7ec',
  danger:      '#c81e1e',
  dangerBg:    '#fdf2f2',
  dangerBg2:   '#fde8e8',
  warning:     '#92400e',
  warningBg:   '#fffbeb',
  ink:         '#111827',
  inkMid:      '#374151',
  inkLight:    '#6b7280',
  inkFaint:    '#9ca3af',
  border:      '#e5e7eb',
  borderLight: '#f3f4f6',
  bg:          '#f9fafb',
  white:       '#ffffff',
  accentBlue:  '#eff6ff',
  accentGreen: '#ecfdf5',
  amber:       '#d97706',
  amberBg:     '#fffbeb',
};

const styles = StyleSheet.create({
  page: {
    paddingHorizontal: 32,
    paddingTop: 28,
    paddingBottom: 40,
    fontFamily: 'Helvetica',
    fontSize: 8.5,
    color: C.inkMid,
    backgroundColor: C.bg,
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: C.primary,
  },
  headerLeft: { flexDirection: 'column' },
  badge: {
    backgroundColor: C.primary,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginBottom: 5,
  },
  badgeText: { color: C.white, fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 0.8 },
  title: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: C.ink, marginBottom: 3 },
  subtitle: { fontSize: 8.5, color: C.inkLight },
  headerRight: { alignItems: 'flex-end' },
  headerDate: { fontSize: 7.5, color: C.inkFaint, marginTop: 2 },

  // ── Sección ──────────────────────────────────────────────────────────────────
  section: {
    marginBottom: 12,
    backgroundColor: C.white,
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bg,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  sectionTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.inkMid, letterSpacing: 0.3 },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  sectionBody: { paddingHorizontal: 12, paddingVertical: 10 },

  // ── KPI Grid ─────────────────────────────────────────────────────────────────
  kpiGrid: { flexDirection: 'row', gap: 8 },
  kpiCard: {
    flex: 1,
    backgroundColor: C.bg,
    borderRadius: 6,
    border: `1px solid ${C.borderLight}`,
    padding: 8,
  },
  kpiLabel: { fontSize: 7, color: C.inkFaint, fontFamily: 'Helvetica-Bold', letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase' },
  kpiValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.ink, marginBottom: 2 },
  kpiSub: { fontSize: 7, color: C.inkLight },

  // ── P&L Table ────────────────────────────────────────────────────────────────
  plRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  plRowHighlight: { backgroundColor: C.accentBlue },
  plRowFinal: { borderRadius: 5, paddingVertical: 7, paddingHorizontal: 8, borderBottomWidth: 0, marginTop: 4 },
  plLabel: { fontSize: 8.5, color: C.inkMid },
  plLabelBold: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.ink },
  plValue: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.ink },
  plValueDanger: { color: C.danger },
  plValueSuccess: { color: C.success },
  plIndent: { fontSize: 7.5, color: C.inkLight, marginLeft: 8 },

  // ── Tabla genérica ───────────────────────────────────────────────────────────
  table: { width: '100%' },
  tHead: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tHeadCell: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.inkFaint, letterSpacing: 0.5 },
  tRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
    alignItems: 'center',
  },
  tRowAlt: { backgroundColor: C.bg },
  tCell: { fontSize: 8.5, color: C.inkMid },
  tCellBold: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.ink },
  tRight: { textAlign: 'right' },
  tCenter: { textAlign: 'center' },

  // ── Payment pill ─────────────────────────────────────────────────────────────
  pmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  pmBar: { height: 5, borderRadius: 3, marginTop: 3 },
  pmDot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 6 },

  // ── Alert ────────────────────────────────────────────────────────────────────
  alertRow: {
    flexDirection: 'row',
    padding: 8,
    borderRadius: 6,
    marginBottom: 5,
    alignItems: 'flex-start',
  },
  alertIcon: { fontSize: 9, marginRight: 6, marginTop: 0.5, fontFamily: 'Helvetica-Bold' },
  alertTitle: { fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  alertDetail: { fontSize: 7.5, marginTop: 2, lineHeight: 1.4 },

  // ── Expense detail ───────────────────────────────────────────────────────────
  expList: { paddingHorizontal: 12 },
  expCatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
  },
  expCatLabel: { fontSize: 8, color: C.inkMid, flex: 1 },
  expCatAmt: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.danger },

  // ── Deudores ─────────────────────────────────────────────────────────────────
  debtRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.borderLight,
    paddingHorizontal: 8,
  },

  // ── 2-col ────────────────────────────────────────────────────────────────────
  twoCol: { flexDirection: 'row', gap: 10 },
  col60: { width: '58%' },
  col40: { width: '40%' },

  // ── Footer ───────────────────────────────────────────────────────────────────
  footer: {
    position: 'absolute',
    bottom: 14,
    left: 32,
    right: 32,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: C.border,
    paddingTop: 7,
  },
  footerText: { fontSize: 7, color: C.inkFaint },

  noData: { fontSize: 8, color: C.inkFaint, paddingVertical: 8, paddingHorizontal: 12 },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const pct = (v: number) => `${v.toFixed(1)}%`;

const PAYMENT_COLORS: Record<string, string> = {
  cash: '#059669', card: '#2563eb', nequi: '#7c3aed',
  daviplata: '#f97316', transfer: '#0891b2', credit: '#dc2626', other: '#6b7280',
};

interface Props {
  data: DashboardData;
  dateRangeName: string;
  businessName: string;
  totalPending?: number;
}

export const DashboardPDFReport: React.FC<Props> = ({ data, dateRangeName, businessName, totalPending = 0 }) => {
  const isProfit = data.operatingProfit >= 0;
  const now = new Date();
  const reportDate = now.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
  const reportTime = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

  // Agrupar gastos por categoría
  const expensesByCategory: Record<string, number> = {};
  data.otherExpensesList.forEach(e => {
    const key = e.description || 'Otro gasto';
    expensesByCategory[key] = (expensesByCategory[key] || 0) + e.amount;
  });
  const expCats = Object.entries(expensesByCategory).sort((a, b) => b[1] - a[1]);

  // Top productos por ganancia
  const topByProfit = [...data.topProducts]
    .filter(p => p.income > 0)
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10);

  const cogsPercent = data.totalIncome > 0 ? (data.cogs / data.totalIncome) * 100 : 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>

        {/* ── HEADER ─────────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>REPORTE FINANCIERO</Text>
            </View>
            <Text style={styles.title}>{businessName}</Text>
            <Text style={styles.subtitle}>Período: {dateRangeName}</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.subtitle}>Generado el {reportDate}</Text>
            <Text style={styles.headerDate}>a las {reportTime}</Text>
          </View>
        </View>

        {/* ── KPIs PRINCIPALES ───────────────────────────────────────────────── */}
        <View style={[styles.section, { marginBottom: 12 }]} wrap={false}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionDot, { backgroundColor: C.primary }]} />
            <Text style={styles.sectionTitle}>DESEMPEÑO DEL PERÍODO</Text>
          </View>
          <View style={[styles.sectionBody]}>
            <View style={styles.kpiGrid}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Ventas Netas</Text>
                <Text style={styles.kpiValue}>{fmt(data.totalIncome)}</Text>
                <Text style={styles.kpiSub}>{data.ordersCount} pedidos · tkt. {fmt(data.averageTicket)}</Text>
              </View>
              <View style={[styles.kpiCard, { backgroundColor: isProfit ? C.accentGreen : C.dangerBg }]}>
                <Text style={styles.kpiLabel}>Utilidad Operativa</Text>
                <Text style={[styles.kpiValue, { color: isProfit ? C.success : C.danger }]}>
                  {fmt(data.operatingProfit)}
                </Text>
                <Text style={styles.kpiSub}>Margen {pct(data.operatingMarginPercent)}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Ganancia Bruta</Text>
                <Text style={[styles.kpiValue, { color: C.success }]}>{fmt(data.grossProfit)}</Text>
                <Text style={styles.kpiSub}>Margen bruto {pct(data.grossMarginPercent)}</Text>
              </View>
              <View style={[styles.kpiCard, { backgroundColor: cogsPercent > 40 ? C.dangerBg : C.bg }]}>
                <Text style={styles.kpiLabel}>Costo de Mercancía</Text>
                <Text style={[styles.kpiValue, { color: cogsPercent > 40 ? C.danger : C.ink }]}>
                  {pct(cogsPercent)}
                </Text>
                <Text style={styles.kpiSub}>{fmt(data.cogs)} del total</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── P&L ────────────────────────────────────────────────────────────── */}
        <View style={styles.section} wrap={false}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionDot, { backgroundColor: '#0891b2' }]} />
            <Text style={styles.sectionTitle}>ESTADO DE RESULTADOS (P&L)</Text>
          </View>

          <View style={styles.plRow}>
            <Text style={styles.plLabel}>Ventas Netas</Text>
            <Text style={styles.plValue}>{fmt(data.totalIncome)}</Text>
          </View>
          {data.totalCredits > 0 && (
            <View style={[styles.plRow, { backgroundColor: C.amberBg, paddingVertical: 3, paddingHorizontal: 6, borderRadius: 4, marginBottom: 4 }]}>
              <Text style={{ fontSize: 7, color: C.amber }}>
                * Incluye {fmt(data.totalCredits)} en ventas fiadas — ese dinero aún no ha entrado a caja
              </Text>
            </View>
          )}
          <View style={styles.plRow}>
            <Text style={[styles.plIndent]}>(-) Costo de Mercancía Vendida (CMV)</Text>
            <Text style={[styles.plValue, styles.plValueDanger]}>-{fmt(data.cogs)}</Text>
          </View>

          <View style={[styles.plRow, styles.plRowHighlight]}>
            <Text style={styles.plLabelBold}>Ganancia Bruta</Text>
            <Text style={[styles.plValue]}>{fmt(data.grossProfit)}</Text>
          </View>

          {data.wasteTotal > 0 && (
            <View style={styles.plRow}>
              <Text style={styles.plIndent}>(-) Mermas y desperdicios ({data.wasteCount} registros)</Text>
              <Text style={[styles.plValue, styles.plValueDanger]}>-{fmt(data.wasteTotal)}</Text>
            </View>
          )}
          {data.totalOtherExpenses > 0 && (
            <View style={styles.plRow}>
              <Text style={styles.plIndent}>(-) Gastos operativos ({expCats.length} categorías)</Text>
              <Text style={[styles.plValue, styles.plValueDanger]}>-{fmt(data.totalOtherExpenses)}</Text>
            </View>
          )}

          <View style={[styles.plRow, styles.plRowFinal, { backgroundColor: isProfit ? C.successBg2 : C.dangerBg2 }]}>
            <Text style={styles.plLabelBold}>Utilidad Operativa Neta</Text>
            <Text style={[styles.plValue, { fontSize: 11, color: isProfit ? C.success : C.danger }]}>
              {fmt(data.operatingProfit)}
            </Text>
          </View>
        </View>

        {/* ── INVENTARIO & DEUDAS ─────────────────────────────────────────────── */}
        <View style={[styles.section, { marginBottom: 12 }]} wrap={false}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionDot, { backgroundColor: '#7c3aed' }]} />
            <Text style={styles.sectionTitle}>BALANCE DE ACTIVOS Y PASIVOS</Text>
          </View>
          <View style={[styles.sectionBody]}>
            <View style={styles.kpiGrid}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Inventario a Costo</Text>
                <Text style={styles.kpiValue}>{fmt(data.inventoryAtCost)}</Text>
                <Text style={styles.kpiSub}>Capital inmovilizado en mercancía</Text>
              </View>
              <View style={[styles.kpiCard, { backgroundColor: C.accentGreen }]}>
                <Text style={styles.kpiLabel}>Inventario a Precio de Venta</Text>
                <Text style={[styles.kpiValue, { color: C.success }]}>{fmt(data.inventoryAtSale)}</Text>
                <Text style={styles.kpiSub}>Proyección si se vende todo</Text>
              </View>
              <View style={[styles.kpiCard, { backgroundColor: C.amberBg }]}>
                <Text style={styles.kpiLabel}>Créditos por Cobrar</Text>
                <Text style={[styles.kpiValue, { color: C.amber }]}>{fmt(data.totalCredits)}</Text>
                <Text style={styles.kpiSub}>
                  {data.topDebtors.length > 0 ? `Mayor: ${data.topDebtors[0].name}` : 'Cartera pendiente'}
                </Text>
              </View>
              <View style={[styles.kpiCard, { backgroundColor: totalPending > 0 ? C.dangerBg : C.bg }]}>
                <Text style={styles.kpiLabel}>Deudas por Pagar</Text>
                <Text style={[styles.kpiValue, { color: totalPending > 0 ? C.danger : C.ink }]}>
                  {fmt(totalPending)}
                </Text>
                <Text style={styles.kpiSub}>Proveedores y acreedores</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── TOP PRODUCTOS + MÉTODOS DE PAGO ────────────────────────────────── */}
        <View style={styles.twoCol} wrap={false}>

          {/* Top Productos */}
          <View style={[styles.section, styles.col60, { marginBottom: 12 }]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: '#059669' }]} />
              <Text style={styles.sectionTitle}>TOP PRODUCTOS (POR GANANCIA)</Text>
            </View>
            {topByProfit.length === 0 ? (
              <Text style={styles.noData}>Sin datos para este periodo.</Text>
            ) : (
              <View style={styles.table}>
                <View style={styles.tHead}>
                  <Text style={[styles.tHeadCell, { flex: 3 }]}>PRODUCTO</Text>
                  <Text style={[styles.tHeadCell, { flex: 1, textAlign: 'center' }]}>CANT</Text>
                  <Text style={[styles.tHeadCell, { flex: 1.3, textAlign: 'right' }]}>INGRESO</Text>
                  <Text style={[styles.tHeadCell, { flex: 1.3, textAlign: 'right' }]}>GANANCIA</Text>
                  <Text style={[styles.tHeadCell, { flex: 0.9, textAlign: 'right' }]}>MARGEN</Text>
                </View>
                {topByProfit.slice(0, 10).map((prod, i) => {
                  const margin = prod.unitPrice > 0 && prod.cost > 0
                    ? ((prod.unitPrice - prod.cost) / prod.unitPrice) * 100
                    : null;
                  const marginColor = margin === null ? C.inkFaint
                    : margin >= 40 ? C.success
                    : margin >= 25 ? C.amber
                    : C.danger;
                  return (
                    <View key={prod.name} style={[styles.tRow, i % 2 === 1 ? styles.tRowAlt : {}]}>
                      <Text style={[styles.tCell, { flex: 3 }]} numberOfLines={1}>{prod.name}</Text>
                      <Text style={[styles.tCell, styles.tCenter, { flex: 1 }]}>{Math.round(prod.sold)}</Text>
                      <Text style={[styles.tCell, styles.tRight, { flex: 1.3 }]}>{fmt(prod.income)}</Text>
                      <Text style={[styles.tCellBold, styles.tRight, { flex: 1.3, color: prod.profit >= 0 ? C.success : C.danger }]}>
                        {fmt(prod.profit)}
                      </Text>
                      <Text style={[styles.tCellBold, styles.tRight, { flex: 0.9, color: marginColor }]}>
                        {margin !== null ? pct(margin) : '—'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Métodos de pago */}
          <View style={[styles.section, styles.col40, { marginBottom: 12 }]}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: '#2563eb' }]} />
              <Text style={styles.sectionTitle}>MÉTODOS DE PAGO</Text>
            </View>
            {data.paymentMethods.length === 0 ? (
              <Text style={styles.noData}>Sin datos para este periodo.</Text>
            ) : (
              data.paymentMethods.map((pm, i) => (
                <View key={pm.method} style={styles.pmRow}>
                  <View style={[styles.pmDot, { backgroundColor: PAYMENT_COLORS[pm.method] || C.inkFaint }]} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={[styles.tCell]}>{pm.label}</Text>
                      <Text style={[styles.tCellBold]}>{fmt(pm.amount)}</Text>
                    </View>
                    <View style={[styles.pmBar, { width: `${pm.percent}%`, backgroundColor: PAYMENT_COLORS[pm.method] || C.inkFaint, opacity: 0.35 }]} />
                    <Text style={[styles.kpiSub, { marginTop: 1 }]}>{pm.percent.toFixed(1)}% del total</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        {/* ── GASTOS OPERATIVOS DESGLOSADOS ──────────────────────────────────── */}
        {expCats.length > 0 && (
          <View style={[styles.section, { marginBottom: 12 }]} wrap={false}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: C.danger }]} />
              <Text style={styles.sectionTitle}>
                GASTOS OPERATIVOS — Total: {fmt(data.totalOtherExpenses)}
              </Text>
            </View>
            <View style={styles.twoCol}>
              <View style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 8 }}>
                {expCats.slice(0, Math.ceil(expCats.length / 2)).map(([label, amt], i) => (
                  <View key={label} style={styles.expCatRow}>
                    <Text style={styles.expCatLabel}>{label}</Text>
                    <Text style={styles.expCatAmt}>{fmt(amt)}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 8 }}>
                {expCats.slice(Math.ceil(expCats.length / 2)).map(([label, amt], i) => (
                  <View key={label} style={styles.expCatRow}>
                    <Text style={styles.expCatLabel}>{label}</Text>
                    <Text style={styles.expCatAmt}>{fmt(amt)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* ── DEUDORES (si existen) ───────────────────────────────────────────── */}
        {data.topDebtors.length > 0 && (
          <View style={[styles.section, { marginBottom: 12 }]} wrap={false}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: C.amber }]} />
              <Text style={styles.sectionTitle}>
                CARTERA POR COBRAR — Total: {fmt(data.totalCredits)}
              </Text>
            </View>
            <View style={styles.table}>
              <View style={styles.tHead}>
                <Text style={[styles.tHeadCell, { flex: 3 }]}>CLIENTE</Text>
                <Text style={[styles.tHeadCell, { flex: 1, textAlign: 'right' }]}>DEUDA</Text>
                <Text style={[styles.tHeadCell, { flex: 1.2, textAlign: 'right' }]}>% DEL TOTAL</Text>
              </View>
              {data.topDebtors.slice(0, 8).map((d, i) => (
                <View key={d.name} style={[styles.tRow, i % 2 === 1 ? styles.tRowAlt : {}]}>
                  <Text style={[styles.tCell, { flex: 3 }]}>{d.name}</Text>
                  <Text style={[styles.tCellBold, styles.tRight, { flex: 1, color: C.amber }]}>{fmt(d.debt)}</Text>
                  <Text style={[styles.tCell, styles.tRight, { flex: 1.2, color: C.inkLight }]}>
                    {data.totalCredits > 0 ? pct((d.debt / data.totalCredits) * 100) : '—'}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── ALERTAS DIAGNÓSTICAS ────────────────────────────────────────────── */}
        {data.diagnosticAlerts.length > 0 && (
          <View style={[styles.section, { marginBottom: 12 }]} wrap={false}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionDot, { backgroundColor: '#f59e0b' }]} />
              <Text style={styles.sectionTitle}>DIAGNÓSTICO INTELIGENTE</Text>
            </View>
            <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
              {data.diagnosticAlerts.slice(0, 5).map((alert, i) => {
                const bgColor = alert.type === 'danger' ? C.dangerBg
                  : alert.type === 'warning' ? C.amberBg
                  : alert.type === 'success' ? C.successBg
                  : C.accentBlue;
                const textColor = alert.type === 'danger' ? C.danger
                  : alert.type === 'warning' ? C.warning
                  : alert.type === 'success' ? C.success
                  : C.primary;
                const icon = alert.type === 'danger' ? '✕'
                  : alert.type === 'warning' ? '!'
                  : alert.type === 'success' ? '✓'
                  : 'i';
                return (
                  <View key={alert.title} style={[styles.alertRow, { backgroundColor: bgColor }]}>
                    <Text style={[styles.alertIcon, { color: textColor }]}>{icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.alertTitle, { color: textColor }]}>{alert.title}</Text>
                      <Text style={[styles.alertDetail, { color: C.inkMid }]}>{alert.detail}</Text>
                      {alert.action && (
                        <Text style={[styles.alertDetail, { color: textColor, marginTop: 2 }]}>
                          → {alert.action}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Bistro POS · {businessName}</Text>
          <Text style={styles.footerText}>Generado el {reportDate} a las {reportTime}</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`}
          />
        </View>

      </Page>
    </Document>
  );
};
