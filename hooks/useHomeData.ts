import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from './usePermissions';
import { startOfDayInTz, subtractDaysInTz, todayDateStringInTz } from '../lib/timezone';

const homeCacheKey = (businessId: string, userScope: string) => `bistro_home_data_${businessId}_${userScope}`;

function saveHomeCache(businessId: string, userScope: string, data: Omit<HomeData, 'loading'>) {
    try {
        localStorage.setItem(homeCacheKey(businessId, userScope), JSON.stringify(data));
    } catch { }
}

function loadHomeCache(businessId: string, userScope: string): Omit<HomeData, 'loading'> | null {
    try {
        const raw = localStorage.getItem(homeCacheKey(businessId, userScope));
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

export interface LowStockProduct {
    id: string;
    name: string;
    stock: number;
    minStock: number;
    unit: string | null;
    status: 'out' | 'low' | 'watch';
}

export interface RecentSale {
    id: string;
    displayNumber: string;
    time: string;
    paymentMethod: string;
    paymentIcon: string;
    total: number;
}

export interface HomeData {
    todaySales: {
        total: number;
        count: number;
        average: number;
        changePercent: number | null;
    };
    cashShift: {
        isOpen: boolean;
        balance: number;
        openedAt: string | null;
    };
    clientsDebt: {
        total: number;
        count: number;
    };
    todayExpenses: {
        total: number;
    };
    lowStockProducts: LowStockProduct[];
    recentSales: RecentSale[];
    loading: boolean;
}

const PAYMENT_LABELS: Record<string, string> = {
    cash: 'Efectivo',
    nequi: 'Nequi',
    daviplata: 'Daviplata',
    card: 'Tarjeta',
    transfer: 'Transferencia',
    credit: 'Crédito',
};

const PAYMENT_ICONS: Record<string, string> = {
    cash: 'payments',
    nequi: 'qr_code_2',
    daviplata: 'qr_code_2',
    card: 'credit_card',
    transfer: 'account_balance',
    credit: 'schedule',
};

function getPaymentLabel(method: string | null): string {
    if (!method) return 'Efectivo';
    return PAYMENT_LABELS[method.toLowerCase()] || method;
}

function getPaymentIcon(method: string | null): string {
    if (!method) return 'payments';
    return PAYMENT_ICONS[method.toLowerCase()] || 'payments';
}

export function useHomeData(): HomeData {
    const { profile } = useAuth();
    const { hasPermission } = usePermissions();
    const businessId = profile?.business_id;
    const userId = profile?.id;
    // Cajero (sin admin_reports) solo ve SUS propias ventas en el inicio
    const canSeeAllSales = hasPermission('admin_reports');
    const userScope = canSeeAllSales ? 'all' : (userId || 'self');

    const [data, setData] = useState<HomeData>({
        todaySales: { total: 0, count: 0, average: 0, changePercent: null },
        cashShift: { isOpen: false, balance: 0, openedAt: null },
        clientsDebt: { total: 0, count: 0 },
        todayExpenses: { total: 0 },
        lowStockProducts: [],
        recentSales: [],
        loading: true,
    });

    const fetchAll = useCallback(async () => {
        if (!businessId) return;
        if (!navigator.onLine) return;

        const now = new Date();
        const todayStart = startOfDayInTz(now);
        const yesterdayStart = subtractDaysInTz(now, 1);

        // Cajero: filtra todas las consultas de ventas a sus propias órdenes
        const scopeOrders = (q: any) => (canSeeAllSales || !userId) ? q : q.eq('waiter_id', userId);

        const [todayRes, yesterdayRes, shiftRes, clientsRes, productsRes, recentRes, expensesRes] =
            await Promise.all([
                scopeOrders(supabase
                    .from('orders')
                    .select('total')
                    .eq('business_id', businessId)
                    .eq('status', 'completed')
                    .gte('completed_at', todayStart.toISOString())),

                scopeOrders(supabase
                    .from('orders')
                    .select('total')
                    .eq('business_id', businessId)
                    .eq('status', 'completed')
                    .gte('completed_at', yesterdayStart.toISOString())
                    .lt('completed_at', todayStart.toISOString())),

                supabase
                    .from('cash_shifts')
                    .select('id, opening_balance, opened_at')
                    .eq('business_id', businessId)
                    .eq('status', 'open')
                    .limit(1)
                    .maybeSingle(),

                supabase
                    .from('clients')
                    .select('current_debt')
                    .eq('business_id', businessId)
                    .gt('current_debt', 0),

                supabase
                    .from('products')
                    .select('id, name, stock, min_stock, unit')
                    .eq('business_id', businessId)
                    .eq('is_active', true)
                    .not('stock', 'is', null)
                    .not('min_stock', 'is', null)
                    .order('stock', { ascending: true })
                    .limit(50),

                scopeOrders(supabase
                    .from('orders')
                    .select('id, display_number, order_number, payment_method, total, completed_at')
                    .eq('business_id', businessId)
                    .eq('status', 'completed')
                    .order('completed_at', { ascending: false })
                    .limit(4)),

                supabase
                    .from('expenses')
                    .select('amount')
                    .eq('business_id', businessId)
                    .eq('expense_date', todayDateStringInTz()),
            ]);

        // Today's sales
        const todayOrders = todayRes.data || [];
        const todayTotal = todayOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
        const todayCount = todayOrders.length;
        const todayAverage = todayCount > 0 ? todayTotal / todayCount : 0;

        const yesterdayOrders = yesterdayRes.data || [];
        const yesterdayTotal = yesterdayOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
        const changePercent = yesterdayTotal > 0
            ? Math.round(((todayTotal - yesterdayTotal) / yesterdayTotal) * 100)
            : null;

        // Cash shift — leer movimientos reales (los totales en cash_shifts no se actualizan)
        const shift = shiftRes.data;
        let cashBalance = 0;
        if (shift) {
            const { data: movs } = await supabase
                .from('cash_movements')
                .select('type, amount, payment_method')
                .eq('shift_id', shift.id);

            const openingBalance = Number(shift.opening_balance || 0);
            const incomeTypes = new Set(['cash_in', 'sale']);
            const outcomeTypes = new Set(['cash_out', 'expense', 'refund', 'purchase']);
            let income = 0;
            let outcome = 0;
            for (const m of (movs || [])) {
                if ((m.payment_method || 'cash') !== 'cash') continue;
                if (incomeTypes.has(m.type)) income += Number(m.amount);
                else if (outcomeTypes.has(m.type)) outcome += Number(m.amount);
            }
            cashBalance = openingBalance + income - outcome;
        }
        const cashShift = {
            isOpen: !!shift,
            balance: cashBalance,
            openedAt: shift?.opened_at || null,
        };

        // Clients debt
        const clientsData = clientsRes.data || [];
        const clientsDebt = {
            total: clientsData.reduce((s, c) => s + (Number(c.current_debt) || 0), 0),
            count: clientsData.length,
        };

        // Low stock (client-side filter to compare two columns)
        const allProducts = productsRes.data || [];
        const lowStockProducts: LowStockProduct[] = allProducts
            .filter(p => {
                const stock = Number(p.stock);
                const min = Number(p.min_stock);
                return stock <= min * 1.5;
            })
            .slice(0, 5)
            .map(p => {
                const stock = Number(p.stock);
                const min = Number(p.min_stock);
                const status: LowStockProduct['status'] =
                    stock === 0 ? 'out' : stock <= min ? 'low' : 'watch';
                return { id: p.id, name: p.name, stock, minStock: min, unit: p.unit, status };
            });

        // Recent sales
        const recentSales: RecentSale[] = (recentRes.data || []).map(o => ({
            id: o.id,
            displayNumber: o.display_number || `#${String(o.order_number).padStart(4, '0')}`,
            time: new Date(o.completed_at).toLocaleTimeString('es-CO', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'America/Bogota',
            }),
            paymentMethod: getPaymentLabel(o.payment_method),
            paymentIcon: getPaymentIcon(o.payment_method),
            total: Number(o.total) || 0,
        }));

        const expensesData = expensesRes.data || [];
        const todayExpenses = {
            total: expensesData.reduce((s, e) => s + (Number(e.amount) || 0), 0),
        };

        const freshData = {
            todaySales: { total: todayTotal, count: todayCount, average: todayAverage, changePercent },
            cashShift,
            clientsDebt,
            todayExpenses,
            lowStockProducts,
            recentSales,
        };
        saveHomeCache(businessId, userScope, freshData);
        setData({ ...freshData, loading: false });
    }, [businessId, canSeeAllSales, userId, userScope]);

    // Carga inicial con stale-while-revalidate
    useEffect(() => {
        if (!businessId) return;

        const cached = loadHomeCache(businessId, userScope);
        if (cached) {
            setData({ ...cached, loading: false });
        }

        if (!navigator.onLine && !cached) {
            setData(prev => ({ ...prev, loading: false }));
        }

        fetchAll().catch(() => {
            setData(prev => ({ ...prev, loading: false }));
        });
    }, [businessId, fetchAll]);

    // Refrescar cuando se abre/cierra un turno o cuando hay movimientos de caja
    useEffect(() => {
        const handleRefresh = () => {
            fetchAll().catch(() => { });
        };
        window.addEventListener('shift-closed', handleRefresh);
        window.addEventListener('shift-opened', handleRefresh);
        window.addEventListener('cash-movement-changed', handleRefresh);
        window.addEventListener('online', handleRefresh);
        return () => {
            window.removeEventListener('shift-closed', handleRefresh);
            window.removeEventListener('shift-opened', handleRefresh);
            window.removeEventListener('cash-movement-changed', handleRefresh);
            window.removeEventListener('online', handleRefresh);
        };
    }, [fetchAll]);

    return data;
}
