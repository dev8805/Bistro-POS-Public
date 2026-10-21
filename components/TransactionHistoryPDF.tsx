import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

interface Transaction {
    id: string;
    type: 'debt' | 'payment';
    amount: number;
    note?: string | null;
    created_at: string;
    order_items?: { product_name: string; quantity: number; unit_price: number; unit?: string | null }[];
}

interface TransactionHistoryPDFProps {
    clientName: string;
    currentDebt: number;
    transactions: Transaction[];
    businessName?: string;
}

const AMBER = '#fbbf24';
const DARK = '#102218';
const RED = '#dc2626';
const RED_BG = '#fef2f2';
const RED_BORDER = '#fecaca';
const GREEN = '#16a34a';
const GREEN_BG = '#f0fdf4';
const GREEN_BORDER = '#bbf7d0';
const GRAY_50 = '#f8fafc';
const GRAY_100 = '#f1f5f9';
const GRAY_200 = '#e2e8f0';
const GRAY_500 = '#64748b';
const GRAY_700 = '#334155';
const WHITE = '#ffffff';

const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const UNIT_ABBR: Record<string, string> = {
    'Kilogramos': 'Kg', 'Libras': 'Lb', 'Gramos': 'g', 'Onzas': 'Oz',
    'Litros': 'Lt', 'Mililitros': 'ml', 'Galones': 'Gal', 'Metros': 'm', 'Centímetros': 'cm',
};

const formatQty = (quantity: number, unit?: string | null): string => {
    if (!unit || unit === 'Unidad' || unit === 'Und') return `${quantity}×`;
    return `${quantity} ${UNIT_ABBR[unit] ?? unit}`;
};

const formatDate = (dateStr: string): string => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
};

const s = StyleSheet.create({
    page: {
        fontFamily: 'Helvetica',
        backgroundColor: GRAY_50,
        paddingBottom: 48,
    },

    // ── Header band ──────────────────────────────────────
    header: {
        backgroundColor: DARK,
        paddingHorizontal: 36,
        paddingTop: 28,
        paddingBottom: 24,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    headerLeft: {
        flexDirection: 'column',
    },
    accentBar: {
        width: 32,
        height: 3,
        backgroundColor: AMBER,
        marginBottom: 8,
        borderRadius: 2,
    },
    businessName: {
        fontSize: 18,
        fontFamily: 'Helvetica-Bold',
        color: WHITE,
    },
    docTitle: {
        fontSize: 9,
        color: AMBER,
        marginTop: 3,
        letterSpacing: 1,
    },
    headerDate: {
        fontSize: 8,
        color: '#94a3b8',
    },

    // ── Client card ───────────────────────────────────────
    clientCard: {
        marginHorizontal: 28,
        marginTop: 16,
        backgroundColor: WHITE,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: GRAY_200,
    },
    clientAvatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: AMBER,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 10,
    },
    avatarLetter: {
        fontSize: 16,
        fontFamily: 'Helvetica-Bold',
        color: DARK,
    },
    clientInfo: {
        flexDirection: 'column',
        flex: 1,
    },
    clientName: {
        fontSize: 14,
        fontFamily: 'Helvetica-Bold',
        color: GRAY_700,
    },
    clientSubtitle: {
        fontSize: 8,
        color: GRAY_500,
        marginTop: 1,
    },
    debtBox: {
        flexDirection: 'column',
        alignItems: 'flex-end',
    },
    debtLabel: {
        fontSize: 7,
        color: GRAY_500,
        letterSpacing: 0.5,
    },
    debtAmount: {
        fontSize: 18,
        fontFamily: 'Helvetica-Bold',
        color: RED,
        marginTop: 2,
    },
    debtZero: {
        fontSize: 18,
        fontFamily: 'Helvetica-Bold',
        color: GREEN,
        marginTop: 2,
    },

    // ── Summary strip ─────────────────────────────────────
    summaryStrip: {
        marginHorizontal: 28,
        marginTop: 12,
        flexDirection: 'row',
        gap: 8,
    },
    summaryCard: {
        flex: 1,
        borderRadius: 6,
        padding: 12,
        alignItems: 'center',
    },
    summaryCardDebt: {
        backgroundColor: RED_BG,
        borderWidth: 1,
        borderColor: RED_BORDER,
    },
    summaryCardPayment: {
        backgroundColor: GREEN_BG,
        borderWidth: 1,
        borderColor: GREEN_BORDER,
    },
    summaryCardNeutral: {
        backgroundColor: WHITE,
        borderWidth: 1,
        borderColor: GRAY_200,
    },
    summaryLabel: {
        fontSize: 7,
        color: GRAY_500,
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    summaryValue: {
        fontSize: 13,
        fontFamily: 'Helvetica-Bold',
    },
    summaryValueDebt: { color: RED },
    summaryValuePayment: { color: GREEN },
    summaryValueNeutral: { color: GRAY_700 },

    // ── Section header ────────────────────────────────────
    sectionHeader: {
        marginHorizontal: 28,
        marginTop: 20,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sectionDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: AMBER,
    },
    sectionTitle: {
        fontSize: 8,
        fontFamily: 'Helvetica-Bold',
        color: GRAY_500,
        letterSpacing: 1,
    },
    sectionLine: {
        flex: 1,
        height: 1,
        backgroundColor: GRAY_200,
    },

    // ── Transaction rows ──────────────────────────────────
    txRow: {
        marginHorizontal: 28,
        marginBottom: 6,
        backgroundColor: WHITE,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: GRAY_200,
        flexDirection: 'row',
        overflow: 'hidden',
    },
    txAccent: {
        width: 4,
    },
    txAccentDebt: { backgroundColor: RED },
    txAccentPayment: { backgroundColor: GREEN },
    txBody: {
        flex: 1,
        padding: 10,
    },
    txTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    txLeft: { flexDirection: 'column', flex: 1 },
    txBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
    txBadge: {
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 3,
        fontSize: 7,
        fontFamily: 'Helvetica-Bold',
        letterSpacing: 0.5,
    },
    txBadgeDebt: { backgroundColor: RED_BG, color: RED },
    txBadgePayment: { backgroundColor: GREEN_BG, color: GREEN },
    txDate: { fontSize: 8, color: GRAY_500 },
    txAmount: {
        fontSize: 14,
        fontFamily: 'Helvetica-Bold',
    },
    txAmountDebt: { color: RED },
    txAmountPayment: { color: GREEN },

    // Products table
    txDivider: {
        borderTopWidth: 1,
        borderTopColor: GRAY_100,
        marginTop: 6,
        paddingTop: 6,
    },
    productRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 2,
    },
    productName: { fontSize: 8, color: GRAY_700, flex: 1 },
    productPrice: { fontSize: 8, color: GRAY_500 },
    txNote: {
        fontSize: 8,
        color: GRAY_500,
        fontStyle: 'italic',
        marginTop: 4,
    },

    // ── Empty state ───────────────────────────────────────
    emptyState: {
        marginHorizontal: 28,
        marginTop: 16,
        backgroundColor: WHITE,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: GRAY_200,
        padding: 24,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 10,
        color: GRAY_500,
    },

    // ── Footer ────────────────────────────────────────────
    footer: {
        marginTop: 24,
        marginHorizontal: 28,
        paddingTop: 12,
        borderTopWidth: 2,
        borderTopColor: AMBER,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    footerBrand: {
        fontSize: 8,
        fontFamily: 'Helvetica-Bold',
        color: DARK,
    },
    footerSub: {
        fontSize: 7,
        color: GRAY_500,
        marginTop: 2,
    },
    footerPage: {
        fontSize: 8,
        color: GRAY_500,
    },
});

const TransactionRow: React.FC<{ tx: Transaction }> = ({ tx }) => {
    const isPayment = tx.type === 'payment';
    const hasProducts = (tx.order_items?.length ?? 0) > 0;
    const noteParts = tx.note?.split(' · ') ?? [];
    const creditNote = noteParts.length > 1 ? noteParts.slice(1).join(' · ') : null;
    const fallbackNote = !hasProducts ? tx.note : null;

    return (
        <View style={s.txRow}>
            <View style={[s.txAccent, isPayment ? s.txAccentPayment : s.txAccentDebt]} />
            <View style={s.txBody}>
                <View style={s.txTop}>
                    <View style={s.txLeft}>
                        <View style={s.txBadgeRow}>
                            <Text style={[s.txBadge, isPayment ? s.txBadgePayment : s.txBadgeDebt]}>
                                {isPayment ? 'ABONO' : 'DEUDA'}
                            </Text>
                            <Text style={s.txDate}>{formatDate(tx.created_at)}</Text>
                        </View>
                    </View>
                    <Text style={[s.txAmount, isPayment ? s.txAmountPayment : s.txAmountDebt]}>
                        {isPayment ? '+' : '-'}${formatCurrency(tx.amount)}
                    </Text>
                </View>

                {hasProducts && (
                    <View style={s.txDivider}>
                        {tx.order_items!.map((item, idx) => (
                            <View key={`p-${idx}`} style={s.productRow}>
                                <Text style={s.productName}>
                                    {formatQty(item.quantity, item.unit)} {item.product_name}
                                </Text>
                                <Text style={s.productPrice}>${formatCurrency(item.unit_price * item.quantity)}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {creditNote && <Text style={s.txNote}>"{creditNote}"</Text>}
                {!hasProducts && fallbackNote && !creditNote && (
                    <Text style={[s.txNote, { color: GRAY_700, fontStyle: 'normal' }]}>{fallbackNote}</Text>
                )}
            </View>
        </View>
    );
};

export const TransactionHistoryPDF: React.FC<TransactionHistoryPDFProps> = ({
    clientName,
    currentDebt,
    transactions,
    businessName = 'Bistro POS',
}) => {
    const sorted = [...transactions].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const totalDebts = transactions.filter(t => t.type === 'debt').reduce((acc, t) => acc + t.amount, 0);
    const totalPayments = transactions.filter(t => t.type === 'payment').reduce((acc, t) => acc + t.amount, 0);

    const today = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
    const avatarLetter = clientName.charAt(0).toUpperCase();

    return (
        <Document>
            <Page size="A4" style={s.page}>

                {/* Header */}
                <View style={s.header}>
                    <View style={s.headerLeft}>
                        <View style={s.accentBar} />
                        <Text style={s.businessName}>{businessName}</Text>
                        <Text style={s.docTitle}>ESTADO DE CUENTA</Text>
                    </View>
                    <Text style={s.headerDate}>Generado el {today}</Text>
                </View>

                {/* Client card */}
                <View style={s.clientCard}>
                    <View style={[s.clientAvatar, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}>
                        <Text style={s.avatarLetter}>{avatarLetter}</Text>
                    </View>
                    <View style={s.clientInfo}>
                        <Text style={s.clientName}>{clientName}</Text>
                        <Text style={s.clientSubtitle}>Historial de movimientos</Text>
                    </View>
                    <View style={s.debtBox}>
                        <Text style={s.debtLabel}>SALDO PENDIENTE</Text>
                        <Text style={currentDebt > 0 ? s.debtAmount : s.debtZero}>
                            ${formatCurrency(currentDebt)}
                        </Text>
                    </View>
                </View>

                {/* Summary strip */}
                <View style={s.summaryStrip}>
                    <View style={[s.summaryCard, s.summaryCardDebt]}>
                        <Text style={s.summaryLabel}>TOTAL CRÉDITO</Text>
                        <Text style={[s.summaryValue, s.summaryValueDebt]}>${formatCurrency(totalDebts)}</Text>
                    </View>
                    <View style={[s.summaryCard, s.summaryCardPayment]}>
                        <Text style={s.summaryLabel}>TOTAL ABONADO</Text>
                        <Text style={[s.summaryValue, s.summaryValuePayment]}>${formatCurrency(totalPayments)}</Text>
                    </View>
                    <View style={[s.summaryCard, s.summaryCardNeutral]}>
                        <Text style={s.summaryLabel}>MOVIMIENTOS</Text>
                        <Text style={[s.summaryValue, s.summaryValueNeutral]}>{transactions.length}</Text>
                    </View>
                </View>

                {/* Section header */}
                <View style={s.sectionHeader}>
                    <View style={s.sectionDot} />
                    <Text style={s.sectionTitle}>HISTORIAL DE MOVIMIENTOS</Text>
                    <View style={s.sectionLine} />
                </View>

                {/* Transactions */}
                {sorted.length === 0 ? (
                    <View style={s.emptyState}>
                        <Text style={s.emptyText}>Sin movimientos registrados</Text>
                    </View>
                ) : (
                    sorted.map(tx => <TransactionRow key={tx.id} tx={tx} />)
                )}

                {/* Footer */}
                <View style={s.footer}>
                    <View>
                        <Text style={s.footerBrand}>Bistro POS</Text>
                        <Text style={s.footerSub}>Sistema de Punto de Venta</Text>
                    </View>
                    <Text style={s.footerPage}>{today}</Text>
                </View>

            </Page>
        </Document>
    );
};
