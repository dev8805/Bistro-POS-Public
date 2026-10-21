import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface Transaction {
    id: string;
    type: 'debt' | 'payment';
    amount: number;
    note?: string | null;
    created_at: string;
    order_items?: { product_name: string; quantity: number; unit_price: number; unit?: string | null }[];
}

interface ClientData {
    client_name: string;
    current_debt: number;
    business_name: string;
    transactions: Transaction[];
}

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

export const PublicClientHistoryScreen: React.FC = () => {
    const [data, setData] = useState<ClientData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        const path = window.location.pathname;
        const match = path.match(/^\/ch\/([a-f0-9]{12,})$/i);
        if (!match) {
            setError('Enlace inválido');
            setLoading(false);
            return;
        }
        const token = match[1].toLowerCase();

        supabase
            .rpc('get_public_client_history', { p_token: token })
            .then(({ data: result, error: rpcError }) => {
                if (rpcError || !result) {
                    setError('No se encontró el historial. El enlace puede haber expirado.');
                } else {
                    setData(result as ClientData);
                }
                setLoading(false);
            });
    }, []);

    const handleDownloadPDF = async () => {
        if (!data || downloading) return;
        setDownloading(true);
        try {
            const [{ pdf }, { TransactionHistoryPDF }] = await Promise.all([
                import('@react-pdf/renderer'),
                import('../components/TransactionHistoryPDF'),
            ]);
            const element = React.createElement(TransactionHistoryPDF, {
                clientName: data.client_name,
                currentDebt: data.current_debt,
                transactions: data.transactions,
                businessName: data.business_name,
            });
            const blob = await pdf(element).toBlob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `historial_${data.client_name.replace(/\s+/g, '_')}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch {
            alert('No se pudo generar el PDF. Intenta de nuevo.');
        } finally {
            setDownloading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="animate-spin rounded-full size-10 border-b-2 border-amber-400" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-8 text-center">
                <div className="size-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
                    <svg className="size-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 110 18A9 9 0 0112 3z" />
                    </svg>
                </div>
                <h2 className="text-lg font-bold text-slate-800 mb-1">Enlace no válido</h2>
                <p className="text-sm text-slate-500">{error}</p>
            </div>
        );
    }

    const totalFiado = data.transactions
        .filter(t => t.type === 'debt')
        .reduce((acc, t) => acc + t.amount, 0);
    const totalAbonado = data.transactions
        .filter(t => t.type === 'payment')
        .reduce((acc, t) => acc + t.amount, 0);
    const avatarLetter = data.client_name.charAt(0).toUpperCase();

    const sortedTransactions = [...data.transactions].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const formatDate = (dateStr: string) =>
        new Date(dateStr).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center py-8 px-4">
            <div className="w-full max-w-md">

                {/* Header */}
                <div className="rounded-t-2xl overflow-hidden" style={{ backgroundColor: '#102218' }}>
                    <div className="px-6 py-5 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="w-8 h-1 rounded-full bg-amber-400 mb-3" />
                            <p className="text-white font-bold text-lg leading-tight truncate">{data.business_name}</p>
                            <p className="text-amber-400 text-xs tracking-widest mt-1 uppercase">Estado de Cuenta</p>
                        </div>
                        <button
                            onClick={handleDownloadPDF}
                            disabled={downloading}
                            className="shrink-0 mt-1 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-opacity disabled:opacity-60"
                            style={{ backgroundColor: '#fbbf24', color: '#102218' }}
                        >
                            {downloading ? (
                                <>
                                    <svg className="animate-spin size-3.5" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                    </svg>
                                    PDF...
                                </>
                            ) : (
                                <>
                                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 12v6m0 0l-3-3m3 3l3-3M12 3v9" />
                                    </svg>
                                    Descargar PDF
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Client card */}
                <div className="bg-white border border-slate-200 px-5 py-4 flex items-center gap-4">
                    <div
                        className="size-11 rounded-full flex items-center justify-center shrink-0 text-lg font-bold"
                        style={{ backgroundColor: '#fbbf24', color: '#102218' }}
                    >
                        {avatarLetter}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 text-base truncate">{data.client_name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">Historial de cuenta</p>
                    </div>
                    <div className="text-right shrink-0">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">Saldo pendiente</p>
                        <p className={`text-xl font-black mt-0.5 ${data.current_debt > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            ${formatCurrency(data.current_debt)}
                        </p>
                    </div>
                </div>

                {/* KPI strip */}
                <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
                        <p className="text-[10px] text-red-400 uppercase tracking-widest font-semibold">Total crédito</p>
                        <p className="text-xl font-black text-red-600 mt-1">${formatCurrency(totalFiado)}</p>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center">
                        <p className="text-[10px] text-emerald-500 uppercase tracking-widest font-semibold">Total abonado</p>
                        <p className="text-xl font-black text-emerald-600 mt-1">${formatCurrency(totalAbonado)}</p>
                    </div>
                </div>

                {/* Movements */}
                {sortedTransactions.length > 0 && (
                    <div className="mt-4">
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2 px-0.5">
                            Movimientos · {sortedTransactions.length}
                        </p>
                        <div className="flex flex-col gap-2">
                            {sortedTransactions.map(t => {
                                const isDebt = t.type === 'debt';
                                return (
                                    <div
                                        key={t.id}
                                        className="bg-white rounded-xl border overflow-hidden flex"
                                        style={{ borderColor: isDebt ? '#fecaca' : '#bbf7d0' }}
                                    >
                                        <div
                                            className="w-1 shrink-0"
                                            style={{ backgroundColor: isDebt ? '#dc2626' : '#16a34a' }}
                                        />
                                        <div className="flex-1 px-4 py-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                                                        style={{
                                                            backgroundColor: isDebt ? '#fef2f2' : '#f0fdf4',
                                                            color: isDebt ? '#dc2626' : '#16a34a',
                                                        }}
                                                    >
                                                        {isDebt ? 'Crédito' : 'Abono'}
                                                    </span>
                                                    <span className="text-[11px] text-slate-400">{formatDate(t.created_at)}</span>
                                                </div>
                                                <p className={`text-sm font-black shrink-0 ${isDebt ? 'text-red-600' : 'text-emerald-600'}`}>
                                                    {isDebt ? '-' : '+'}${formatCurrency(t.amount)}
                                                </p>
                                            </div>
                                            {t.note && (
                                                <p className="text-xs text-slate-500 mt-1 leading-snug">{t.note}</p>
                                            )}
                                            {t.order_items && t.order_items.length > 0 && (
                                                <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
                                                    {t.order_items.map((item, i) => (
                                                        <div key={i} className="flex items-center justify-between gap-3">
                                                            <p className="text-[11px] text-slate-400 leading-snug min-w-0 truncate">
                                                                {formatQty(item.quantity, item.unit)} {item.product_name}
                                                            </p>
                                                            <p className="text-[11px] text-slate-500 font-semibold shrink-0">
                                                                ${formatCurrency(item.unit_price * item.quantity)}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <p className="text-center text-[11px] text-slate-400 mt-5">
                    Generado por <span className="font-semibold">Bistro POS</span>
                </p>

            </div>
        </div>
    );
};
