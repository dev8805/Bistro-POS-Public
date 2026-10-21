import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

interface TopProductItem {
    name: string;
    sold: number;
    income: number;
    profit: number;
}

interface TopProductsPDFProps {
    products: TopProductItem[];
    mode: 'income' | 'profit';
    businessName: string;
}

const styles = StyleSheet.create({
    page: { padding: 30, fontSize: 10, fontFamily: 'Helvetica' },
    title: { fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
    subtitle: { fontSize: 9, textAlign: 'center', color: '#666', marginBottom: 16 },
    headerRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 4, marginBottom: 4 },
    row: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#eee', paddingVertical: 3 },
    totalRow: { flexDirection: 'row', borderTopWidth: 1.5, borderTopColor: '#333', paddingTop: 6, marginTop: 4 },
    colNum: { width: '6%', textAlign: 'center' },
    colName: { width: '54%' },
    colQty: { width: '12%', textAlign: 'center' },
    colVal: { width: '28%', textAlign: 'right' },
    bold: { fontWeight: 'bold' },
    headerText: { fontWeight: 'bold', fontSize: 9, color: '#555' },
});

const formatCurrency = (n: number) => `$${n.toLocaleString('es-CO')}`;

const TopProductsPDF: React.FC<TopProductsPDFProps> = ({ products, mode, businessName }) => {
    const sorted = [...products].sort((a, b) => mode === 'profit' ? b.profit - a.profit : b.income - a.income);
    const total = sorted.reduce((sum, p) => sum + (mode === 'profit' ? p.profit : p.income), 0);

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <Text style={styles.title}>Top Productos Vendidos</Text>
                <Text style={styles.subtitle}>{mode === 'income' ? 'Por Ingreso' : 'Por Ganancia'} — {businessName}</Text>

                <View style={styles.headerRow}>
                    <Text style={[styles.colNum, styles.headerText]}>#</Text>
                    <Text style={[styles.colName, styles.headerText]}>Producto</Text>
                    <Text style={[styles.colQty, styles.headerText]}>Qty</Text>
                    <Text style={[styles.colVal, styles.headerText]}>{mode === 'income' ? 'Ingreso' : 'Ganancia'}</Text>
                </View>

                {sorted.map((p, i) => (
                    <View key={`${p.name}-${i}`} style={styles.row}>
                        <Text style={styles.colNum}>{i + 1}</Text>
                        <Text style={styles.colName}>{p.name}</Text>
                        <Text style={styles.colQty}>{Math.round(p.sold)}</Text>
                        <Text style={styles.colVal}>{formatCurrency(mode === 'profit' ? p.profit : p.income)}</Text>
                    </View>
                ))}

                <View style={styles.totalRow}>
                    <Text style={[styles.colNum, styles.bold]}></Text>
                    <Text style={[styles.colName, styles.bold]}>TOTAL</Text>
                    <Text style={styles.colQty}></Text>
                    <Text style={[styles.colVal, styles.bold]}>{formatCurrency(total)}</Text>
                </View>
            </Page>
        </Document>
    );
};

export default TopProductsPDF;
