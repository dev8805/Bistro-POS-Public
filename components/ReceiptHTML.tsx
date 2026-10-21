import React from 'react';
import { ReceiptData } from '../types';

const UNIT_ABBR: Record<string, string> = {
    'Kilogramos': 'Kg', 'Libras': 'Lb', 'Gramos': 'g', 'Onzas': 'Oz',
    'Litros': 'Lt', 'Mililitros': 'ml', 'Galones': 'Gal', 'Metros': 'm', 'Centímetros': 'cm',
};

const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('es-CO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
};

interface ReceiptHTMLProps {
    data: ReceiptData;
}

export const ReceiptHTML: React.FC<ReceiptHTMLProps> = ({ data }) => (
    <div
        id="receipt-to-capture"
        style={{
            width: '600px',
            padding: '32px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            backgroundColor: '#ffffff',
            color: '#1a1a1a',
            fontSize: '14px',
            lineHeight: 1.5,
        }}
    >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '16px', borderBottom: '2px solid #333', marginBottom: '20px' }}>
            <div>
                <div style={{ fontSize: '22px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
                    {data.businessName}
                </div>
                {data.businessAddress && (
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>{data.businessAddress}</div>
                )}
                {data.businessPhone && (
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>Tel: {data.businessPhone}</div>
                )}
            </div>
            <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#333', textTransform: 'uppercase' }}>
                    Factura de Venta
                </div>
                {(data.displayNumber || data.orderNumber) && (
                    <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>N° {data.displayNumber || data.orderNumber}</div>
                )}
                <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>{data.date}</div>
            </div>
        </div>

        {/* Client / Seller */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
                <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Cliente</div>
                <div style={{ fontSize: '13px', fontWeight: 700 }}>{data.customerName}</div>
            </div>
            {data.sellerName && (
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>Vendedor</div>
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>{data.sellerName}</div>
                </div>
            )}
        </div>

        {/* Items table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
            <thead>
                <tr style={{ backgroundColor: '#f2f2f2' }}>
                    <th style={{ padding: '8px', fontSize: '10px', fontWeight: 700, color: '#555', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid #ccc', width: '30px' }}>#</th>
                    <th style={{ padding: '8px', fontSize: '10px', fontWeight: 700, color: '#555', textTransform: 'uppercase', textAlign: 'left', borderBottom: '1px solid #ccc' }}>Descripción</th>
                    <th style={{ padding: '8px', fontSize: '10px', fontWeight: 700, color: '#555', textTransform: 'uppercase', textAlign: 'center', borderBottom: '1px solid #ccc', width: '60px' }}>Cant.</th>
                    <th style={{ padding: '8px', fontSize: '10px', fontWeight: 700, color: '#555', textTransform: 'uppercase', textAlign: 'right', borderBottom: '1px solid #ccc', width: '100px' }}>Precio Unit.</th>
                    <th style={{ padding: '8px', fontSize: '10px', fontWeight: 700, color: '#555', textTransform: 'uppercase', textAlign: 'right', borderBottom: '1px solid #ccc', width: '100px' }}>Subtotal</th>
                </tr>
            </thead>
            <tbody>
                {data.items.map((item, index) => {
                    const cleanName = item.name.replace(/🏷️\s*/g, '');
                    const unitLabel = item.unit && item.unit !== 'Unidad' && item.unit !== 'Und'
                        ? `/${UNIT_ABBR[item.unit] || item.unit}`
                        : 'c/u';
                    const qtyDisplay = Math.round(item.quantity * 100) / 100;

                    return (
                        <tr key={`item-${index}`} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '8px', fontSize: '12px', verticalAlign: 'top' }}>{index + 1}</td>
                            <td style={{ padding: '8px', verticalAlign: 'top' }}>
                                <div style={{ fontSize: '13px', fontWeight: 600 }}>{cleanName}</div>
                                {(item.discountPercent || item.discount) && (
                                    <div style={{ fontSize: '11px', color: '#888', marginTop: '1px' }}>
                                        {item.discountPercent ? `Desc: -${item.discountPercent}%` : ''}
                                        {item.discount ? ` (-$${formatCurrency(item.discount)})` : ''}
                                    </div>
                                )}
                            </td>
                            <td style={{ padding: '8px', fontSize: '12px', textAlign: 'center', verticalAlign: 'top' }}>{qtyDisplay}</td>
                            <td style={{ padding: '8px', fontSize: '12px', textAlign: 'right', verticalAlign: 'top' }}>
                                ${formatCurrency(item.unitPrice)} {unitLabel}
                            </td>
                            <td style={{ padding: '8px', fontSize: '13px', fontWeight: 600, textAlign: 'right', verticalAlign: 'top' }}>
                                ${formatCurrency(item.total)}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
            <div style={{ width: '220px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                    <span style={{ fontSize: '12px', color: '#666' }}>Subtotal:</span>
                    <span style={{ fontSize: '12px' }}>${formatCurrency(data.subtotal)}</span>
                </div>
                {data.totalDiscount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span style={{ fontSize: '12px', color: '#666' }}>Descuento:</span>
                        <span style={{ fontSize: '12px' }}>-${formatCurrency(data.totalDiscount)}</span>
                    </div>
                )}
                {data.roundingAdjustment !== undefined && data.roundingAdjustment !== 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span style={{ fontSize: '12px', color: '#666' }}>Ajuste:</span>
                        <span style={{ fontSize: '12px' }}>{data.roundingAdjustment > 0 ? '+' : '-'}${formatCurrency(Math.abs(data.roundingAdjustment))}</span>
                    </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', marginTop: '4px', borderTop: '2px solid #333' }}>
                    <span style={{ fontSize: '16px', fontWeight: 700 }}>TOTAL:</span>
                    <span style={{ fontSize: '16px', fontWeight: 700 }}>${formatCurrency(data.total)}</span>
                </div>
            </div>
        </div>

        {/* Payment */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '30px' }}>
            <div style={{ width: '220px', padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '12px', color: '#666' }}>Método de pago:</span>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>{data.paymentMethod}</span>
                </div>
                {data.amountPaid !== undefined && data.amountPaid > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '12px', color: '#666' }}>Pagado:</span>
                        <span style={{ fontSize: '12px', fontWeight: 600 }}>${formatCurrency(data.amountPaid)}</span>
                    </div>
                )}
                {data.change !== undefined && data.change > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '12px', color: '#666' }}>Cambio:</span>
                        <span style={{ fontSize: '12px', fontWeight: 600 }}>${formatCurrency(data.change)}</span>
                    </div>
                )}
            </div>
        </div>

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: '16px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#333' }}>¡Gracias por su compra!</div>
        </div>
    </div>
);
