import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface CriticalProduct {
    id: string;
    name: string;
    category: string;
    unit: string;
    daysLeft: number;
    stockAtAlert: number;
    suggestedQty: number | null;
}

export const InventoryCriticalAlert: React.FC = () => {
    const { profile } = useAuth();
    const [alerts, setAlerts] = useState<CriticalProduct[]>([]);

    const handleDismiss = useCallback(async () => {
        if (!profile?.business_id || alerts.length === 0) return;

        const timestampedAlerts = alerts.map(alert => ({
            business_id: profile.business_id,
            product_id: alert.id,
            stock_at_alert: alert.stockAtAlert
        }));

        setAlerts([]); // Cierre optimista en UI

        try {
            await supabase
                .from('product_alert_status')
                .upsert(timestampedAlerts, { onConflict: 'business_id,product_id' });
        } catch (error) {
            console.error('Error saving dismissed alert:', error);
        }
    }, [alerts, profile?.business_id]);

    useEffect(() => {
        const handleSaleCompleted = async (event: CustomEvent) => {
            const soldItems: { productId: string; quantity: number }[] = event.detail?.items || [];
            const normalSoldIds = soldItems
                .filter(i => i.productId && !String(i.productId).startsWith('promo_'))
                .map(i => i.productId);

            if (normalSoldIds.length === 0 || !profile?.business_id) return;

            // 1. Fetch stock + category config for sold products
            const { data: productsData } = await supabase
                .from('products')
                .select('id, name, stock, unit, category_id, categories(name, alert_days, optimal_max)')
                .in('id', normalSoldIds)
                .eq('business_id', profile.business_id);

            if (!productsData || productsData.length === 0) return;

            // 2. Fetch sales velocity (last 28 days) for these products
            const twentyEightDaysAgo = new Date();
            twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);

            const { data: ordersData } = await supabase
                .from('orders')
                .select('items:order_items(product_id, quantity)')
                .eq('business_id', profile.business_id)
                .gte('created_at', twentyEightDaysAgo.toISOString())
                .neq('status', 'canceled');

            const salesMap: Record<string, number> = {};
            ordersData?.forEach((order: any) => {
                order.items?.forEach((item: any) => {
                    if (normalSoldIds.includes(item.product_id)) {
                        salesMap[item.product_id] = (salesMap[item.product_id] || 0) + item.quantity;
                    }
                });
            });

            const { data: dbDismissed, error: dbError } = await supabase
                .from('product_alert_status')
                .select('product_id')
                .eq('business_id', profile.business_id)
                .in('product_id', normalSoldIds);

            if (dbError) {
                console.error("Error fetching dismissed ids:", dbError);
            }

            const dismissedIds = new Set(dbDismissed?.map((d: any) => d.product_id) || []);
            console.log("Dismissed IDs:", Array.from(dismissedIds));

            // 3. Calculate and filter critical products
            const criticals: CriticalProduct[] = [];
            productsData.forEach((product: any) => {
                const stock = product.stock;
                const sold28 = salesMap[product.id] || 0;

                // Ignorar si ya fue descartado en esta sesión, si no tiene stock, o si no se ha vendido
                if (dismissedIds.has(product.id) || stock === null || stock === undefined || stock <= 0 || sold28 === 0) return;

                const dailyVelocity = sold28 / 28;
                const daysLeft = stock / dailyVelocity;
                const alertDays = (product.categories as any)?.alert_days ?? 3;
                const optimalMax = (product.categories as any)?.optimal_max ?? 12;
                const rawQty = Math.ceil(optimalMax * dailyVelocity - stock);
                const suggestedQty = (stock + rawQty) / dailyVelocity > optimalMax ? rawQty - 1 : rawQty;

                if (daysLeft > 0 && daysLeft <= alertDays) {
                    criticals.push({
                        id: product.id,
                        name: product.name,
                        category: (product.categories as any)?.name || '',
                        unit: product.unit || 'und',
                        daysLeft: Math.round(daysLeft * 10) / 10,
                        stockAtAlert: stock,
                        suggestedQty: suggestedQty > 0 ? suggestedQty : null
                    });
                } else {
                    console.log(`Product ${product.name} not critical. stock: ${stock}, sold28: ${sold28}, daysLeft: ${daysLeft}, alertDays: ${alertDays}`);
                }
            });

            console.log("Newly calc critical products:", criticals);

            if (criticals.length > 0) {
                // Agregar los nuevos críticos a los ya existentes (por si se combinan)
                setAlerts(prev => {
                    const newAlerts = [...prev];
                    criticals.forEach(c => {
                        if (!newAlerts.some(a => a.id === c.id)) {
                            newAlerts.push(c);
                        }
                    });
                    return newAlerts;
                });
            }
        };

        window.addEventListener('sale-completed', handleSaleCompleted as EventListener);
        return () => window.removeEventListener('sale-completed', handleSaleCompleted as EventListener);
    }, [profile?.business_id]);

    if (alerts.length === 0) return null;

    return (
        <div className="fixed top-4 right-4 left-4 sm:left-auto z-[200] w-auto sm:w-[350px] max-w-[calc(100%-2rem)]"
            style={{ animation: 'slideDown 0.35s cubic-bezier(0.34,1.56,0.64,1) both' }}>
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-rose-100 dark:border-rose-900/50 overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-50 dark:border-gray-800">
                    <div className="flex items-center gap-2">
                        <div className="size-7 rounded-full bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-rose-500 text-[16px]">warning</span>
                        </div>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">
                            Inventario al límite
                        </p>
                    </div>
                    <button
                        onClick={handleDismiss}
                        className="size-7 -mr-1 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors outline-none focus:outline-none"
                        aria-label="Cerrar"
                    >
                        <span className="material-symbols-outlined text-[18px]">close</span>
                    </button>
                </div>

                {/* Product list */}
                <div className="px-4 py-3 space-y-2.5">
                    {alerts.map((alert) => (
                        <div key={alert.id} className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                    {alert.name}
                                </p>
                                <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                                    {alert.category && <span>{alert.category} • </span>}
                                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                                        Stock: {alert.stockAtAlert}
                                    </span>
                                </p>
                                {alert.suggestedQty != null && (
                                    <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                                        Pedir: {alert.suggestedQty} {alert.unit}
                                    </p>
                                )}
                            </div>
                            <span className="shrink-0 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-800/50 whitespace-nowrap">
                                {alert.daysLeft <= 1 ? '< 1 día' : `${alert.daysLeft}d restantes`}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
