import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { SUPABASE_URL } from '../src/config/wompi';

interface PromoCode {
    id: string;
    code: string;
    type: string;
    status: string;
    duration_months: number;
    price_cop: number;
    expires_at: string | null;
    redeemed_at: string | null;
    buyer_email: string | null;
    created_at: string;
    notes: string | null;
}

export const PromoCodeGenerator: React.FC = () => {
    const { session } = useAuth();
    const [codes, setCodes] = useState<PromoCode[]>([]);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchCodes = useCallback(async () => {
        if (!session?.access_token) return;
        setLoading(true);
        try {
            const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-promo-codes?action=list`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({})
            });
            const data = await res.json();
            if (data.success) {
                setCodes(data.codes);
            }
        } catch (err: any) {
            console.error('Error fetching codes:', err);
        } finally {
            setLoading(false);
        }
    }, [session]);

    useEffect(() => {
        fetchCodes();
    }, [fetchCodes]);

    const handleGenerate = async () => {
        if (!session?.access_token) return;
        setGenerating(true);
        setError(null);
        try {
            const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-promo-codes?action=generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ duration_months: 3, price_cop: 29000 })
            });
            const data = await res.json();
            if (data.success) {
                await fetchCodes();
                handleCopy(data.code);
            } else {
                setError(data.error || 'Error generando código');
            }
        } catch (err: any) {
            setError(err.message || 'Error de conexión');
        } finally {
            setGenerating(false);
        }
    };

    const handleCopy = (code: string) => {
        navigator.clipboard.writeText(code).then(() => {
            setCopiedCode(code);
            setTimeout(() => setCopiedCode(null), 2000);
        });
    };

    const handleShare = (code: string) => {
        const text = `¡Obtén 3 meses de servicio en BistroPOS! Usa el código: ${code} al registrarte en la app.`;
        if (navigator.share) {
            navigator.share({ title: 'Código BistroPOS', text });
        } else {
            navigator.clipboard.writeText(text).then(() => {
                setCopiedCode(code);
                setTimeout(() => setCopiedCode(null), 2000);
            });
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    <span className="size-1.5 rounded-full bg-emerald-500"></span>Activo
                </span>;
            case 'used':
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                    <span className="size-1.5 rounded-full bg-gray-400"></span>Usado
                </span>;
            case 'expired':
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                    <span className="size-1.5 rounded-full bg-red-500"></span>Expirado
                </span>;
            default:
                return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                    <span className="size-1.5 rounded-full bg-yellow-500"></span>{status}
                </span>;
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('es-CO', {
            day: '2-digit', month: 'short', year: 'numeric'
        });
    };

    return (
        <div className="bg-surface-light dark:bg-surface-dark border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                        <span className="material-symbols-outlined text-purple-600 dark:text-purple-400">confirmation_number</span>
                    </div>
                    <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">Códigos Promocionales</h3>
                        <p className="text-xs text-gray-500">3 meses × $29,000 COP</p>
                    </div>
                </div>
                <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold transition-all disabled:opacity-50 shadow-md shadow-purple-600/20"
                >
                    {generating ? (
                        <>
                            <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            Generando...
                        </>
                    ) : (
                        <>
                            <span className="material-symbols-outlined text-[18px]">add</span>
                            Generar Código
                        </>
                    )}
                </button>
            </div>

            {error && (
                <div className="mx-5 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-xl">
                    <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
                </div>
            )}

            <div className="p-5">
                {loading ? (
                    <div className="flex justify-center py-8">
                        <div className="animate-spin rounded-full size-8 border-b-2 border-purple-600"></div>
                    </div>
                ) : codes.length === 0 ? (
                    <div className="text-center py-8">
                        <span className="material-symbols-outlined text-4xl text-gray-300 dark:text-gray-600 mb-2 block">loyalty</span>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Aún no has generado códigos</p>
                        <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">Genera tu primer código para compartir con clientes</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {codes.map((promo) => (
                            <div
                                key={promo.id}
                                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${promo.status === 'active'
                                    ? 'border-purple-200 dark:border-purple-800/30 bg-purple-50/50 dark:bg-purple-900/10'
                                    : 'border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30'
                                    }`}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <code className="font-mono font-bold text-sm text-gray-900 dark:text-white">{promo.code}</code>
                                        {getStatusBadge(promo.status)}
                                    </div>
                                    <p className="text-xs text-gray-500">{formatDate(promo.created_at)} · {promo.duration_months} meses</p>
                                </div>
                                {promo.status === 'active' && (
                                    <div className="flex items-center gap-1 ml-2">
                                        <button
                                            onClick={() => handleCopy(promo.code)}
                                            className="p-2 rounded-lg text-gray-500 hover:text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-all"
                                            title="Copiar código"
                                            aria-label="Copiar código"
                                            tabIndex={0}
                                        >
                                            <span className="material-symbols-outlined text-[18px]">
                                                {copiedCode === promo.code ? 'check' : 'content_copy'}
                                            </span>
                                        </button>
                                        <button
                                            onClick={() => handleShare(promo.code)}
                                            className="p-2 rounded-lg text-gray-500 hover:text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-all"
                                            title="Compartir código"
                                            aria-label="Compartir código"
                                            tabIndex={0}
                                        >
                                            <span className="material-symbols-outlined text-[18px]">share</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
