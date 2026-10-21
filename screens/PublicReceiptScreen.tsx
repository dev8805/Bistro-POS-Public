import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { formatCurrency } from '../lib/formatters';

const UNIT_ABBR: Record<string, string> = {
    'Kilogramos': 'kg', 'Libras': 'lb', 'Gramos': 'gr', 'Onzas': 'oz',
    'Litros': 'lt', 'Mililitros': 'ml', 'Galones': 'gl', 'Metros': 'mt', 'Centímetros': 'cm',
    'Servicio': 'sv'
};

interface ReceiptOrder {
    id: string;
    order_number: number;
    display_number: number | null;
    customer_name: string | null;
    customer_document: string | null;
    subtotal: number;
    discount: number;
    total: number;
    payment_method: string;
    split_payments: { method: string; amount: number; }[] | null;
    amount_paid: number | null;
    change_amount: number | null;
    initial_abono: number | null;
    initial_abono_method: string | null;
    created_at: string;
    items: {
        product_name: string;
        quantity: number;
        unit_price: number;
        sale_unit?: string;
        total_price: number;
        discount: number | null;
        discount_percent: number | null;
        notes?: string | null;
        cooking_term?: string | null;
        removed_ingredients?: string[] | null;
    }[];
    business: {
        name: string;
        phone: string | null;
        address: string | null;
        nit: string | null;
        receipt_business_name: string | null;
        receipt_phone: string | null;
        receipt_address: string | null;
        logo_url: string | null;
    };
}

const paymentLabels: Record<string, string> = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    transfer: 'Transferencia',
    nequi: 'Nequi',
    daviplata: 'Daviplata',
    credit: 'Crédito',
    other: 'Otro',
    mixed: 'Mixto',
};

const PublicReceiptScreen: React.FC = () => {
    const [order, setOrder] = useState<ReceiptOrder | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        const fetchReceipt = async () => {
            try {
                const path = window.location.pathname;
                const match = path.match(/^\/t\/(\d+)-([a-f0-9]+)$/i);
                if (!match) {
                    setError('Enlace inválido');
                    setLoading(false);
                    return;
                }

                const orderNumber = parseInt(match[1], 10);
                const hashCode = match[2].toLowerCase();

                const { data, error: queryError } = await supabase
                    .rpc('get_public_receipt', {
                        p_order_number: orderNumber,
                        p_hash: hashCode,
                    });

                if (queryError) throw queryError;

                if (!data) {
                    setError('Factura no encontrada');
                    setLoading(false);
                    return;
                }

                setOrder(data as ReceiptOrder);
            } catch (err: any) {
                console.error('Error fetching receipt:', err);
                setError('No se pudo cargar la factura');
            } finally {
                setLoading(false);
            }
        };

        fetchReceipt();
    }, []);

    const handleDownloadPDF = async () => {
        if (!order || downloading) return;
        setDownloading(true);

        try {
            const [{ pdf }, React, { ReceiptThermalPDF }] = await Promise.all([
                import('@react-pdf/renderer'),
                import('react'),
                import('../components/ReceiptThermalPDF'),
            ]);

            const biz = order.business;
            // `order.discount` ya incluye el descuento por línea y `order.total`
            // ya es el neto. Confiamos en la BD para no duplicar el descuento.
            const totalDiscount = order.discount || 0;
            const unroundedTotal = Math.max(0, order.subtotal - totalDiscount);
            const roundedTotal = order.total || Math.round(unroundedTotal / 50) * 50;
            const roundingAdjustment = roundedTotal - unroundedTotal;
            const receiptData = {
                businessName: biz.receipt_business_name || biz.name,
                businessPhone: biz.receipt_phone || biz.phone || undefined,
                businessAddress: biz.receipt_address || biz.address || undefined,
                businessNit: biz.nit || undefined,
                displayNumber: order.display_number || undefined,
                customerDocument: order.customer_document || '222222222222',
                splitPayments: order.split_payments || undefined,
                amountPaid: order.amount_paid || undefined,
                change: order.change_amount || undefined,
                creditAbono: order.initial_abono && order.initial_abono > 0 ? order.initial_abono : undefined,
                creditAbonoMethod: order.initial_abono_method || undefined,
                items: order.items.map(item => ({
                    name: item.product_name,
                    quantity: item.quantity,
                    unitPrice: item.unit_price,
                    unit: item.sale_unit || 'Unidad',
                    total: item.total_price,
                    discount: item.discount || undefined,
                    discountPercent: item.discount_percent || undefined,
                })),
                subtotal: order.subtotal,
                totalDiscount,
                roundingAdjustment: roundingAdjustment !== 0 ? roundingAdjustment : undefined,
                total: roundedTotal,
                paymentMethod: paymentLabels[order.payment_method] || order.payment_method,
                customerName: order.customer_name || 'Consumidor Final',
                date: new Date(order.created_at).toLocaleString('es-CO'),
                orderNumber: order.order_number,
            };

            const pdfBlob = await pdf(React.createElement(ReceiptThermalPDF, { data: receiptData as any, paperWidth: '80mm' }) as any).toBlob();
            const url = URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `comprobante_${order.order_number}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Error generating PDF:', err);
        } finally {
            setDownloading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="animate-spin rounded-full size-10 border-b-2 border-emerald-500" />
            </div>
        );
    }

    if (error || !order) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div className="text-center max-w-sm">
                    <div className="size-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="material-symbols-outlined text-red-400 text-3xl">error</span>
                    </div>
                    <h2 className="text-lg font-semibold text-gray-800 mb-1">{error || 'Factura no encontrada'}</h2>
                    <p className="text-sm text-gray-500">El enlace puede haber expirado o ser incorrecto.</p>
                </div>
            </div>
        );
    }

    const biz = order.business;
    const displayName = biz.receipt_business_name || biz.name;
    const displayPhone = biz.receipt_phone || biz.phone;
    const displayAddress = biz.receipt_address || biz.address;
    const formattedDate = new Date(order.created_at).toLocaleDateString('es-CO', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    // `order.discount` ya incluye el descuento por línea y `order.total` ya es
    // el neto. Confiamos en la BD para no duplicar el descuento.
    const displayDiscount = order.discount || 0;
    const displayUnroundedTotal = Math.max(0, order.subtotal - displayDiscount);
    const displayRoundedTotal = order.total || Math.round(displayUnroundedTotal / 50) * 50;
    const displayAdjustment = displayRoundedTotal - displayUnroundedTotal;

    return (
        <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex flex-col items-center py-6 px-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-5 text-white text-center">
                    {biz.logo_url && (
                        <img
                            src={biz.logo_url}
                            alt={displayName}
                            crossOrigin="anonymous"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                            }}
                            className="size-14 rounded-full mx-auto mb-3 border-2 border-white/30 object-cover bg-white"
                        />
                    )}
                    <h1 className="text-lg font-semibold">{displayName}</h1>
                    {displayAddress && <p className="text-emerald-100 text-xs mt-1">{displayAddress}</p>}
                    {displayPhone && <p className="text-emerald-100 text-xs">{displayPhone}</p>}
                    {biz.nit && <p className="text-emerald-200/70 text-[11px] mt-1">NIT: {biz.nit}</p>}
                </div>

                {/* Order info */}
                <div className="px-6 py-4 border-b border-dashed border-gray-200 flex justify-between items-center">
                    <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Factura</p>
                        <p className="text-xl font-black text-gray-800">#{order.order_number}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-gray-400">{formattedDate}</p>
                        <p className="text-sm text-gray-600 font-medium">{order.customer_name || 'Consumidor Final'}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Doc: {order.customer_document || '222222222222'}</p>
                    </div>
                </div>

                {/* Items */}
                <div className="px-6 py-4">
                    <div className="space-y-3">
                        {(() => {
                            // Consolidar items por unidad sin modificaciones; mostrar individuales los que tengan modificaciones
                            const isUnitProduct = (unit?: string | null) => !unit || unit === 'Unidad' || unit === 'Und';
                            const hasModifications = (item: typeof order.items[0]) =>
                                !!(item.notes || item.cooking_term || (item.removed_ingredients && item.removed_ingredients.length > 0));

                            type DisplayItem = {
                                product_name: string;
                                quantity: number;
                                unit_price: number;
                                sale_unit?: string;
                                total_price: number;
                                discount: number | null;
                                discount_percent: number | null;
                                notes?: string | null;
                                cooking_term?: string | null;
                                removed_ingredients?: string[] | null;
                            };

                            const displayItems: DisplayItem[] = [];
                            const consolidatedMap = new Map<string, number>();

                            for (const item of order.items) {
                                // Items con modificaciones o no-unidad: mostrar individualmente
                                if (!isUnitProduct(item.sale_unit) || hasModifications(item)) {
                                    displayItems.push({ ...item });
                                } else {
                                    // Consolidar por nombre + precio + descuento
                                    const key = `${item.product_name}|${item.unit_price}|${item.discount || 0}|${item.discount_percent || 0}`;
                                    const existingIdx = consolidatedMap.get(key);
                                    if (existingIdx !== undefined) {
                                        displayItems[existingIdx].quantity = Math.round((displayItems[existingIdx].quantity + item.quantity) * 100) / 100;
                                        displayItems[existingIdx].total_price += item.total_price;
                                        if (displayItems[existingIdx].discount != null) {
                                            displayItems[existingIdx].discount = (displayItems[existingIdx].discount || 0) + (item.discount || 0);
                                        }
                                    } else {
                                        consolidatedMap.set(key, displayItems.length);
                                        displayItems.push({ ...item });
                                    }
                                }
                            }

                            return displayItems.map((item, idx) => (
                                <div key={`item-${idx}`}>
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1 min-w-0 pr-3">
                                            <p className="text-sm font-medium text-gray-800 truncate">{item.product_name}</p>
                                            <p className="text-xs text-gray-400">
                                                {Math.round(item.quantity * 100) / 100} {item.sale_unit && item.sale_unit !== 'Unidad' && item.sale_unit !== 'Und' ? (UNIT_ABBR[item.sale_unit] || item.sale_unit) : 'un'} x ${formatCurrency(item.unit_price)}
                                            </p>
                                            {/* Modificaciones */}
                                            {(item.cooking_term || (item.removed_ingredients && item.removed_ingredients.length > 0) || item.notes) && (
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {item.cooking_term && (
                                                        <span className="text-[10px] font-medium text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
                                                            {item.cooking_term}
                                                        </span>
                                                    )}
                                                    {item.removed_ingredients && item.removed_ingredients.map((ing, i) => (
                                                        <span key={i} className="text-[10px] font-medium text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                                                            Sin {ing}
                                                        </span>
                                                    ))}
                                                    {item.notes && (
                                                        <span className="text-[10px] italic text-teal-600">
                                                            "{item.notes}"
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-sm font-semibold text-gray-700 whitespace-nowrap">
                                            ${formatCurrency(item.total_price)}
                                        </p>
                                    </div>
                                </div>
                            ));
                        })()}
                    </div>
                </div>

                {/* Totals */}
                <div className="px-6 py-4 border-t border-dashed border-gray-200 space-y-2">
                    <div className="flex justify-between text-sm text-gray-500">
                        <span>Subtotal</span>
                        <span>${formatCurrency(order.subtotal)}</span>
                    </div>
                    {displayDiscount > 0 && (
                        <div className="flex justify-between text-sm text-red-500">
                            <span>Descuento</span>
                            <span>-${formatCurrency(displayDiscount)}</span>
                        </div>
                    )}
                    {displayAdjustment !== 0 && (
                        <div className="flex justify-between text-sm text-gray-500">
                            <span>Ajuste</span>
                            <span>{displayAdjustment > 0 ? '+' : '-'}${formatCurrency(Math.abs(displayAdjustment))}</span>
                        </div>
                    )}
                    <div className="flex justify-between text-lg font-black text-gray-900 pt-1 border-t border-gray-100">
                        <span>Total</span>
                        <span>${formatCurrency(displayRoundedTotal)}</span>
                    </div>
                    {(order.split_payments && order.split_payments.length > 0) ? (
                        <>
                            <div className="flex justify-between text-xs text-gray-400 pt-1">
                                <span>MÉTODOS DE PAGO:</span>
                            </div>
                            {order.split_payments.map((sp, i) => (
                                <div key={`sp-${i}`} className="flex justify-between text-xs text-gray-400">
                                    <span>- {paymentLabels[sp.method] || sp.method}</span>
                                    <span className="font-medium">${formatCurrency(sp.amount)}</span>
                                </div>
                            ))}
                        </>
                    ) : (
                        <>
                            <div className="flex justify-between text-xs text-gray-400 pt-1">
                                <span>Método de pago</span>
                                <span className="font-medium">{paymentLabels[order.payment_method] || order.payment_method}</span>
                            </div>
                            {order.amount_paid !== null && order.amount_paid > 0 && (
                                <div className="flex justify-between text-xs text-gray-400">
                                    <span>Pagado</span>
                                    <span className="font-medium">${formatCurrency(order.amount_paid)}</span>
                                </div>
                            )}
                            {order.change_amount !== null && order.change_amount > 0 && order.amount_paid !== null && order.amount_paid > 0 && (
                                <div className="flex justify-between text-xs text-gray-400">
                                    <span>Cambio</span>
                                    <span className="font-medium">${formatCurrency(order.change_amount)}</span>
                                </div>
                            )}
                            {(order.initial_abono ?? 0) > 0 && (
                                <>
                                    <div className="flex justify-between text-xs text-emerald-600 font-medium pt-1">
                                        <span>Abono inicial</span>
                                        <span>${formatCurrency(order.initial_abono as number)}</span>
                                    </div>
                                    {order.initial_abono_method && (
                                        <div className="flex justify-between text-xs text-gray-400">
                                            <span>Medio de pago</span>
                                            <span>{order.initial_abono_method}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-xs font-bold text-red-500">
                                        <span>Saldo pendiente</span>
                                        <span>${formatCurrency(Math.max(0, displayRoundedTotal - order.initial_abono))}</span>
                                    </div>
                                </>
                            )}
                        </>
                    )}
                </div>

                {/* Download */}
                <div className="px-6 py-5">
                    <button
                        onClick={handleDownloadPDF}
                        disabled={downloading}
                        className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                    >
                        <span className="material-symbols-outlined text-lg">download</span>
                        {downloading ? 'Generando PDF...' : 'Descargar PDF'}
                    </button>
                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-3 text-center border-t border-gray-100">
                    <p className="text-[10px] text-gray-300 font-medium">Powered by BistroPOS</p>
                </div>
            </div>
        </div>
    );
};

export default PublicReceiptScreen;
