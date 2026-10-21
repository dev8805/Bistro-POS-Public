import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useBusinessSettings } from './useBusinessSettings';
import { toDateStringInTz } from '../lib/timezone';

const getRoundedTotal = (amount: number): number => Math.round(Math.max(0, amount) / 50) * 50;

export interface DateRange {
  start: Date;
  end: Date;
}

export interface PaymentMethodData {
  method: string;
  label: string;
  amount: number;
  percent: number;
}

export interface TopProductData {
  name: string;
  sold: number;
  income: number;
  profit: number;
  image: string | null;
  unitPrice: number;
  cost: number;
}

export interface HighRotationProduct {
  name: string;
  sold: number;
  income: number;
  cost: number;
  rotation: number;
  daysOfInventory: number;
  image: string | null;
}

export interface LowRotationProduct {
  name: string;
  sold: number;
  stock: number;
  daysOfInventory: number;
  costTiedUp: number;
}

export interface WasteItem {
  description: string;
  reason?: string;
  amount: number;
  date: string;
  product_name?: string;
  product_category?: string;
  quantity: number;
}

export interface DailySales {
  date: string;
  total: number;
  dayIndex: number;
}

export interface DiagnosticAlert {
  type: 'warning' | 'danger' | 'success' | 'info';
  title: string;
  detail: string;
  action?: string;
  impact?: number;
}



export interface DashboardData {
  ordersCount: number;
  productsSold: number;
  totalIncome: number;
  prevOrdersCount: number;
  prevProductsSold: number;
  prevTotalIncome: number;
  paymentMethods: PaymentMethodData[];
  topProducts: TopProductData[];
  hourlyActivity: { count: number; income: number }[];
  highRotationProducts: HighRotationProduct[];
  highRotationCategories: { name: string; sold: number; income: number; daysOfInventory: number }[];
  bestInventoryDaysProducts: LowRotationProduct[];
  worstRotationProducts: LowRotationProduct[];
  lowRotationProducts: LowRotationProduct[];
  wasteTotal: number;
  wasteCount: number;
  wasteItems: WasteItem[];
  inventoryAtCost: number;
  inventoryAtSale: number;
  inventoryTurnover: number;
  avgDaysOfInventory: number;
  dailySales: DailySales[];
  prevDailySales: DailySales[];
  cogs: number;
  grossProfit: number;
  grossMarginPercent: number;

  totalOtherExpenses: number;
  otherExpensesList: { description: string; note: string; amount: number; date: string; supplier?: string | null }[];
  operatingProfit: number;
  operatingMarginPercent: number;
  averageTicket: number;
  breakEvenPoint: number;
  breakEvenProgress: number;
  gmroi: number;

  diagnosticAlerts: DiagnosticAlert[];
  totalCredits: number;
  topDebtors: { name: string; debt: number }[];
  stockOutCount: number;
  lowStockCount: number;
  lowStockProducts: { name: string; stock: number; daysLeft: number }[];
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  nequi: 'Nequi',
  daviplata: 'Daviplata',
  transfer: 'Transferencia',
  credit: 'Crédito',
  other: 'Otro',
  mixed: 'Mixto',
};

const getEmptyData = (): DashboardData => ({
  ordersCount: 0,
  productsSold: 0,
  totalIncome: 0,
  prevOrdersCount: 0,
  prevProductsSold: 0,
  prevTotalIncome: 0,
  paymentMethods: [],
  topProducts: [],
  hourlyActivity: Array.from({ length: 24 }, () => ({ count: 0, income: 0 })),
  highRotationProducts: [],
  highRotationCategories: [],
  bestInventoryDaysProducts: [],
  worstRotationProducts: [],
  lowRotationProducts: [],
  wasteTotal: 0,
  wasteCount: 0,
  wasteItems: [],
  inventoryAtCost: 0,
  inventoryAtSale: 0,
  inventoryTurnover: 0,
  avgDaysOfInventory: 0,
  dailySales: [],
  prevDailySales: [],
  cogs: 0,
  grossProfit: 0,
  grossMarginPercent: 0,

  totalOtherExpenses: 0,
  otherExpensesList: [] as { description: string; note: string; amount: number; date: string; supplier?: string | null }[],
  operatingProfit: 0,
  operatingMarginPercent: 0,
  averageTicket: 0,
  breakEvenPoint: 0,
  breakEvenProgress: 0,
  gmroi: 0,

  diagnosticAlerts: [],
  totalCredits: 0,
  topDebtors: [],
  stockOutCount: 0,
  lowStockCount: 0,
  lowStockProducts: [],
});

export const useDashboard = (dateRange: DateRange) => {
  const { profile } = useAuth();
  const [data, setData] = useState<DashboardData>(getEmptyData());
  const [loading, setLoading] = useState(true);

  const businessId = profile?.business_id;

  const getPreviousPeriod = useCallback((range: DateRange): DateRange => {
    const duration = range.end.getTime() - range.start.getTime();
    return {
      start: new Date(range.start.getTime() - duration),
      end: new Date(range.start.getTime() - 1),
    };
  }, []);

  const { timezone } = useBusinessSettings();
  const effectiveTimezone = timezone || 'America/Bogota';

  const fetchDashboardData = useCallback(async () => {
    if (!businessId) return;

    try {
      setLoading(true);

      const startISO = dateRange.start.toISOString();
      const endISO = dateRange.end.toISOString();
      const prev = getPreviousPeriod(dateRange);
      const prevStartISO = prev.start.toISOString();
      const prevEndISO = prev.end.toISOString();

      const [analyticsRes, wasteRes, otherExpensesRes] = await Promise.all([
        supabase.rpc('get_dashboard_sales_analytics', {
          p_business_id: businessId,
          p_start_date: startISO,
          p_end_date: endISO,
          p_prev_start_date: prevStartISO,
          p_prev_end_date: prevEndISO,
          p_timezone: effectiveTimezone,
        }),
        // Mermas del periodo
        supabase
          .from('wastage')
          .select('description, amount, date, reason, product_name, product_id, quantity, created_at')
          .eq('business_id', businessId)
          .gte('date', toDateStringInTz(dateRange.start, effectiveTimezone))
          .lte('date', toDateStringInTz(dateRange.end, effectiveTimezone))
          .order('date', { ascending: false }),
        // Gastos operativos del periodo
        supabase
          .from('expenses')
          .select('category, amount, description, expense_date, created_at, supplier_name, supplier_id, suppliers(name)')
          .eq('business_id', businessId)
          .gte('expense_date', toDateStringInTz(dateRange.start, effectiveTimezone))
          .lte('expense_date', toDateStringInTz(dateRange.end, effectiveTimezone)),
      ]);

      if (analyticsRes.error) {
        console.error('[useDashboard] Error en analytics RPC:', analyticsRes.error);
      }

      const analytics = (analyticsRes.data as any) || {};
      const ordersCount = Number(analytics.orders_count || 0);
      const totalIncome = Number(analytics.total_income || 0);
      const productsSold = Number(analytics.products_sold || 0);
      const cogs = Number(analytics.cogs || 0);

      const prevOrdersCount = Number(analytics.prev_orders_count || 0);
      const prevTotalIncome = Number(analytics.prev_total_income || 0);
      const prevProductsSold = Number(analytics.prev_products_sold || 0);

      const dailySales: DailySales[] = (analytics.daily_sales || []).map((d: any, i: number) => ({
        date: d.date,
        total: Number(d.total || 0),
        dayIndex: i,
      }));

      const prevDailySales: DailySales[] = (analytics.prev_daily_sales || []).map((d: any, i: number) => ({
        date: d.date,
        total: Number(d.total || 0),
        dayIndex: i,
      }));

      const hourlyActivity: { count: number; income: number }[] = (
        analytics.hourly_activity || Array.from({ length: 24 }, () => ({ count: 0, income: 0 }))
      ).map((h: any) => ({
        count: Number(h.count || 0),
        income: Number(h.income || 0),
      }));

      const rawPaymentMethods: { method: string; amount: number }[] = analytics.payment_methods || [];
      const totalPayments = rawPaymentMethods.reduce((a, b) => a + Number(b.amount || 0), 0);
      const paymentMethods: PaymentMethodData[] = rawPaymentMethods.map((pm) => ({
        method: pm.method,
        label: PAYMENT_LABELS[pm.method] || pm.method,
        amount: Number(pm.amount || 0),
        percent: totalPayments > 0 ? Math.round((Number(pm.amount || 0) / totalPayments) * 100) : 0,
      }));

      const topProducts: TopProductData[] = (analytics.top_products || [])
        .map((p: any) => ({
          name: p.name,
          sold: Number(p.sold || 0),
          income: Number(p.income || 0),
          profit: Number(p.profit || 0),
          image: p.image || null,
          unitPrice: Number(p.unitPrice || 0),
          cost: Number(p.cost || 0),
        }))
        .filter((p: TopProductData) => p.income > 0);

      // Mermas
      const wasteData = wasteRes.data || [];
      const wasteTotal = wasteData.reduce((sum, w) => sum + Number(w.amount || 0), 0);
      const wasteItems: WasteItem[] = wasteData.map((w: any) => ({
        description: w.description || 'Sin descripción',
        amount: Number(w.amount || 0),
        reason: w.reason,
        date: w.date || w.created_at,
        product_name: w.product_name || undefined,
        quantity: Number(w.quantity || 1),
      }));

      // Gastos
      const otherExpData = otherExpensesRes.data || [];
      const otherExpensesList = otherExpData.map((e: any) => {
        const liveSupplierName = Array.isArray(e.suppliers) ? e.suppliers[0]?.name : e.suppliers?.name;
        return {
          description: e.category || 'Sin categoría',
          note: e.description || '',
          amount: Number(e.amount || 0),
          date: e.expense_date || e.created_at || '',
          supplier: liveSupplierName || e.supplier_name || null,
        };
      });
      const totalOtherExpenses = otherExpensesList.reduce((sum: number, e: { amount: number }) => sum + e.amount, 0);

      // Métricas financieras
      const grossProfit = totalIncome - cogs;
      const grossMarginPercent = totalIncome > 0 ? (grossProfit / totalIncome) * 100 : 0;
      const operatingProfit = grossProfit - wasteTotal - totalOtherExpenses;
      const operatingMarginPercent = totalIncome > 0 ? (operatingProfit / totalIncome) * 100 : 0;
      const averageTicket = ordersCount > 0 ? totalIncome / ordersCount : 0;

      setData({
        ordersCount,
        productsSold,
        totalIncome,
        prevOrdersCount,
        prevProductsSold,
        prevTotalIncome,
        paymentMethods,
        topProducts,
        hourlyActivity,
        highRotationProducts: [],
        highRotationCategories: [],
        bestInventoryDaysProducts: [],
        worstRotationProducts: [],
        lowRotationProducts: [],
        wasteTotal,
        wasteCount: wasteData.length,
        wasteItems,
        inventoryAtCost: 0,
        inventoryAtSale: 0,
        inventoryTurnover: 0,
        avgDaysOfInventory: 0,
        dailySales,
        prevDailySales,
        cogs,
        grossProfit,
        grossMarginPercent,

        totalOtherExpenses,
        otherExpensesList,
        operatingProfit,
        operatingMarginPercent,
        averageTicket,
        breakEvenPoint: 0,
        breakEvenProgress: 0,
        gmroi: 0,

        diagnosticAlerts: [],
        totalCredits: 0,
        topDebtors: [],
        stockOutCount: 0,
        lowStockCount: 0,
        lowStockProducts: [],
      });
    } catch (err) {
      console.error('[useDashboard] Error fetching data:', err);
    } finally {
      setLoading(false);
    }
  }, [businessId, dateRange, getPreviousPeriod, effectiveTimezone]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const calcChange = useCallback((current: number, previous: number): { change: number; positive: boolean } => {
    if (previous === 0) return { change: current > 0 ? 100 : 0, positive: current >= 0 };
    const change = ((current - previous) / previous) * 100;
    return { change: Math.round(Math.abs(change) * 10) / 10, positive: change >= 0 };
  }, []);

  return { data, loading, refresh: fetchDashboardData, calcChange };
};
