import React from 'react';

const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

interface Transaction {
    id: string;
    type: 'debt' | 'payment';
    amount: number;
    note?: string | null;
    created_at: string;
    order_items?: { product_name: string; quantity: number; unit_price: number }[];
}

interface TransactionHistoryHTMLProps {
    clientName: string;
    currentDebt: number;
    transactions: Transaction[];
    pageIndex: number;
    totalPages: number;
}

export const TransactionHistoryHTML: React.FC<TransactionHistoryHTMLProps> = ({
    clientName,
    currentDebt,
    transactions,
    pageIndex,
    totalPages,
}) => {
    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr);
        const day = d.getDate();
        const month = d.toLocaleDateString('es-CO', { month: 'short' }).replace('.', '');
        const year = d.getFullYear();
        const hours = d.getHours();
        const minutes = d.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const hour12 = hours % 12 || 12;
        return `${day}/${month}/${year} ${hour12}:${minutes} ${ampm}`;
    };

    const leftCol = transactions.filter((_, i) => i % 2 === 0);
    const rightCol = transactions.filter((_, i) => i % 2 === 1);

    const renderCard = (tx: Transaction) => {
        const isPayment = tx.type === 'payment';
        const hasProducts = tx.order_items && tx.order_items.length > 0;
        const noteParts = tx.note?.split(' · ');
        const creditNote = noteParts && noteParts.length > 1 ? noteParts.slice(1).join(' · ') : null;
        const fallbackNote = !hasProducts ? tx.note : null;

        return (
            <div
                key={tx.id}
                style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: `1px solid ${isPayment ? '#bbf7d0' : '#fecaca'}`,
                    backgroundColor: isPayment ? '#f0fdf4' : '#fef2f2',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <div>
                        {isPayment && (
                            <div style={{ fontSize: '10px', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Abono</div>
                        )}
                        <div style={{ fontSize: '10px', color: '#999' }}>{formatDate(tx.created_at)}</div>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: isPayment ? '#16a34a' : '#dc2626' }}>
                        {isPayment ? '+' : '-'}${formatCurrency(tx.amount)}
                    </div>
                </div>
                {hasProducts && (
                    <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                        {tx.order_items!.map((item, idx) => (
                            <div key={`item-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#555' }}>
                                <span>{item.quantity}× {item.product_name}</span>
                                <span style={{ color: '#888' }}>${formatCurrency(item.unit_price * item.quantity)}</span>
                            </div>
                        ))}
                    </div>
                )}
                {creditNote && (
                    <div style={{ fontSize: '10px', color: '#999', fontStyle: 'italic', marginTop: '3px' }}>"{creditNote}"</div>
                )}
                {!hasProducts && fallbackNote && !creditNote && (
                    <div style={{ fontSize: '11px', color: '#666', marginTop: '3px' }}>{fallbackNote}</div>
                )}
            </div>
        );
    };

    return (
        <div
            id="history-to-capture"
            style={{
                width: '700px',
                minHeight: '750px',
                padding: '28px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                backgroundColor: '#ffffff',
                color: '#1a1a1a',
                fontSize: '13px',
                lineHeight: 1.4,
            }}
        >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '14px', borderBottom: '2px solid #333', marginBottom: '16px' }}>
                <div>
                    <div style={{ fontSize: '18px', fontWeight: 700 }}>{clientName}</div>
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>Historial de Movimientos</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: '#888' }}>Deuda Actual</div>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#dc2626' }}>${formatCurrency(currentDebt)}</div>
                    {totalPages > 1 && (
                        <div style={{ fontSize: '10px', color: '#aaa', marginTop: '2px' }}>Página {pageIndex + 1} de {totalPages}</div>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: '8px' }}>
                    {leftCol.map(renderCard)}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' as const, gap: '8px' }}>
                    {rightCol.map(renderCard)}
                </div>
            </div>

            {/* Footer */}
            <div style={{ borderTop: '1px solid #e5e5e5', marginTop: '16px', paddingTop: '10px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: '#aaa' }}>
                    Generado el {new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
            </div>
        </div>
    );
};
