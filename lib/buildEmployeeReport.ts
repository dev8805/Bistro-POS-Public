/**
 * buildEmployeeReport
 *
 * Construye el dataset completo para el "Reporte de empleado" (PDF).
 * Hace todas las consultas a Supabase necesarias y calcula KPIs, tasas y
 * desgloses para auditar la actividad de un cajero en un rango de fechas.
 *
 * Filosofía:
 * - "grossSales" representa lo que el empleado *intentó* facturar:
 *   incluye TODOS los ítems (anulados o no) de TODAS las ventas (anuladas o no).
 * - "voidTotal" suma lo que el empleado anuló: ventas voided + ítems canceled.
 * - "refundTotal" suma las devoluciones donde el empleado aparece como
 *   `refunded_by` en `sale_refunds`.
 * - "discountTotal" suma descuentos a nivel orden + a nivel ítem en ventas
 *   completadas (las anuladas ya se contaron en voidTotal).
 * - "netSales" = sum(total) de ventas completed − refundTotal.
 */

import { supabase } from './supabase';
import { formatDateTimeInTz } from './timezone';
import { toStoredMethod } from './paymentMethods';

const PAYMENT_METHOD_LABELS: Record<string, string> = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    nequi: 'Nequi',
    daviplata: 'Daviplata',
    transfer: 'Transferencia',
    credit: 'Crédito Local',
    other: 'Otro',
};

// Umbrales de alerta (acordados con el usuario)
const VOID_THRESHOLD = 5;       // % anulación sobre ventas brutas
const REFUND_THRESHOLD = 3;     // % devoluciones sobre ventas brutas
const DISCOUNT_THRESHOLD = 10;  // % descuento sobre ventas brutas
const SHIFT_SHORTAGE_THRESHOLD = 5000; // pesos de faltante por turno

export type AlertLevel = 'ok' | 'warn' | 'danger';

export interface EmployeeReportData {
    employee: { id: string; name: string; isActive: boolean };
    period: { startIso: string; endIso: string; label: string };
    business: { name: string; nit?: string };
    generatedAt: string;

    summary: {
        grossSales: number;
        discountTotal: number;
        voidTotal: number;
        refundTotal: number;
        netSales: number;
        ordersCount: number;       // ventas completadas
        averageTicket: number;
    };

    paymentMethods: Array<{
        method: string;
        label: string;
        count: number;
        amount: number;
        percent: number;
    }>;

    voids: {
        voidedSales: Array<{ date: string; orderNumber: string; products: string; amount: number; reason: string }>;
        voidedItems: Array<{ date: string; orderNumber: string; productName: string; amount: number; reason: string }>;
        topReasons: Array<{ reason: string; count: number; amount: number }>;
        rate: number; // % sobre grossSales
    };

    refunds: {
        list: Array<{ date: string; orderNumber: string; amount: number; reason: string; items: string }>;
        rate: number;
    };

    discounts: {
        total: number;
        ordersWithDiscount: number;
        rate: number;
        top: Array<{ date: string; orderNumber: string; amount: number; customerName: string }>;
    };

    topProducts: Array<{ name: string; quantity: number; income: number; percent: number }>;

    hourlyActivity: Array<{ hour: number; count: number; income: number }>;

    shifts: Array<{
        openedAt: string;
        closedAt: string | null;
        openingBalance: number;
        declaredCash: number | null;
        difference: number | null;
        status: string;
    }>;

    alerts: {
        voidRate: { value: number; threshold: number; level: AlertLevel };
        refundRate: { value: number; threshold: number; level: AlertLevel };
        discountRate: { value: number; threshold: number; level: AlertLevel };
        shiftShortages: { count: number; threshold: number; level: AlertLevel };
    };
}

interface BuildInput {
    businessId: string;
    businessName: string;
    businessNit?: string;
    waiterId: string;
    waiterName: string;
    waiterIsActive: boolean;
    dateStartIso: string;
    dateEndIso: string;
    timezone: string;
    periodLabel: string;
}

const levelFor = (value: number, threshold: number): AlertLevel => {
    if (value <= threshold) return 'ok';
    if (value <= threshold * 1.5) return 'warn';
    return 'danger';
};

export const buildEmployeeReport = async (input: BuildInput): Promise<EmployeeReportData> => {
    const { businessId, waiterId, dateStartIso, dateEndIso, timezone } = input;

    // ── Consultas paralelas ────────────────────────────────────────────────
    // Trae TODAS las ventas del cajero (completed + voided) con sus items.
    const ordersPromise = supabase
        .from('orders')
        .select(`
            id, order_number, display_number, status, subtotal, discount, total,
            payment_method, split_payments, customer_name, void_reason, created_at,
            items:order_items(id, product_name, quantity, unit_price, total_price,
                               discount, discount_percent, status, void_reason)
        `)
        .eq('business_id', businessId)
        .eq('waiter_id', waiterId)
        .in('status', ['completed', 'voided'])
        .gte('created_at', dateStartIso)
        .lte('created_at', dateEndIso)
        .order('created_at', { ascending: true });

    // Devoluciones registradas por el cajero
    const refundsPromise = supabase
        .from('sale_refunds')
        .select(`
            id, total_amount, reason, created_at,
            order:orders!order_id(order_number, display_number),
            items:sale_refund_items(product_name, quantity, amount)
        `)
        .eq('business_id', businessId)
        .eq('refunded_by', waiterId)
        .gte('created_at', dateStartIso)
        .lte('created_at', dateEndIso)
        .order('created_at', { ascending: true });

    // Turnos abiertos por el cajero
    const shiftsPromise = supabase
        .from('cash_shifts')
        .select('opened_at, closed_at, opening_balance, declared_cash, expected_cash, status')
        .eq('business_id', businessId)
        .eq('opened_by', waiterId)
        .gte('opened_at', dateStartIso)
        .lte('opened_at', dateEndIso)
        .order('opened_at', { ascending: true });

    const [ordersRes, refundsRes, shiftsRes] = await Promise.all([
        ordersPromise,
        refundsPromise,
        shiftsPromise,
    ]);

    if (ordersRes.error) throw ordersRes.error;
    if (refundsRes.error) throw refundsRes.error;
    if (shiftsRes.error) throw shiftsRes.error;

    const orders = (ordersRes.data || []) as any[];
    const refunds = (refundsRes.data || []) as any[];
    const shifts = (shiftsRes.data || []) as any[];

    // ── Procesado ──────────────────────────────────────────────────────────
    let grossSales = 0;
    let voidTotal = 0;
    let discountTotal = 0;
    let netSalesGross = 0;          // suma de total de ventas completed (antes de devoluciones)
    let ordersCompletedCount = 0;
    const voidedSales: EmployeeReportData['voids']['voidedSales'] = [];
    const voidedItems: EmployeeReportData['voids']['voidedItems'] = [];
    const reasonsMap: Record<string, { count: number; amount: number }> = {};
    const paymentBreakdown: Record<string, { count: number; amount: number }> = {};
    const productMap: Record<string, { quantity: number; income: number }> = {};
    const hourly: Record<number, { count: number; income: number }> = {};
    const discountsList: EmployeeReportData['discounts']['top'] = [];
    let ordersWithDiscount = 0;

    for (const order of orders) {
        const items = order.items || [];

        // grossSales: lo que se intentó vender (todos los items, todos los estados)
        for (const it of items) {
            grossSales += (it.unit_price || 0) * (it.quantity || 0);
        }

        const orderDate = new Date(order.created_at);
        const hour = orderDate.getHours(); // hora local del navegador (no perfecto, pero suficiente para visualizar)

        if (order.status === 'voided') {
            // Ventas anuladas
            const subtotalVoid = items.reduce((s: number, it: any) =>
                s + (it.unit_price || 0) * (it.quantity || 0), 0);
            voidTotal += subtotalVoid;
            const reason = order.void_reason || 'Sin motivo';
            voidedSales.push({
                date: formatDateTimeInTz(order.created_at, timezone),
                orderNumber: order.display_number || `#${order.order_number}`,
                products: items
                    .map((it: any) => `${it.product_name}${it.quantity > 1 ? ` x${it.quantity}` : ''}`)
                    .join(', ') || '—',
                amount: subtotalVoid,
                reason,
            });
            if (!reasonsMap[reason]) reasonsMap[reason] = { count: 0, amount: 0 };
            reasonsMap[reason].count += 1;
            reasonsMap[reason].amount += subtotalVoid;
            continue;
        }

        // Venta completed
        ordersCompletedCount += 1;
        const orderNet = Math.round(Math.max(0, Number(order.total) || 0) / 50) * 50;
        netSalesGross += orderNet;

        // Ítems anulados dentro de ventas completed
        for (const it of items) {
            if (it.status === 'canceled') {
                const amt = (it.unit_price || 0) * (it.quantity || 0);
                voidTotal += amt;
                const reason = it.void_reason || 'Sin motivo';
                voidedItems.push({
                    date: formatDateTimeInTz(order.created_at, timezone),
                    orderNumber: order.display_number || `#${order.order_number}`,
                    productName: it.product_name,
                    amount: amt,
                    reason,
                });
                if (!reasonsMap[reason]) reasonsMap[reason] = { count: 0, amount: 0 };
                reasonsMap[reason].count += 1;
                reasonsMap[reason].amount += amt;
            } else {
                // Top productos: solo cuenta items que SÍ quedaron en la venta
                const name = it.product_name;
                if (!productMap[name]) productMap[name] = { quantity: 0, income: 0 };
                productMap[name].quantity += it.quantity || 0;
                productMap[name].income += it.total_price || 0;
                // Descuentos por ítem
                const itemDisc = it.discount
                    || (it.discount_percent
                        ? (it.unit_price * it.quantity * it.discount_percent) / 100
                        : 0);
                if (itemDisc > 0) discountTotal += itemDisc;
            }
        }

        // Descuento global
        if (order.discount && order.discount > 0) {
            discountTotal += order.discount;
        }

        const totalOrderDiscount = (order.discount || 0)
            + items
                .filter((it: any) => it.status !== 'canceled')
                .reduce((s: number, it: any) => {
                    const d = it.discount || (it.discount_percent
                        ? (it.unit_price * it.quantity * it.discount_percent) / 100
                        : 0);
                    return s + (d || 0);
                }, 0);
        if (totalOrderDiscount > 0) {
            ordersWithDiscount += 1;
            discountsList.push({
                date: formatDateTimeInTz(order.created_at, timezone),
                orderNumber: order.display_number || `#${order.order_number}`,
                amount: totalOrderDiscount,
                customerName: order.customer_name || 'Consumidor Final',
            });
        }

        // Métodos de pago
        if (order.split_payments && Array.isArray(order.split_payments) && order.split_payments.length > 0) {
            // Pago dividido: cada parte va a su método real. Las etiquetas vienen
            // como nombres visibles ("Efectivo", "Transferencia"), así que se
            // normalizan a la categoría de BD ('cash', 'transfer', ...) para no
            // fragmentar el desglose ni inflar la casilla "Otros".
            let mainMethod = '';
            let mainAmount = -1;
            for (const sp of order.split_payments) {
                const m = toStoredMethod(sp.method || 'other');
                const amt = sp.amount || 0;
                if (!paymentBreakdown[m]) paymentBreakdown[m] = { count: 0, amount: 0 };
                paymentBreakdown[m].amount += amt;
                if (amt > mainAmount) { mainAmount = amt; mainMethod = m; }
            }
            // El conteo de la venta cuenta una sola vez, en el método con mayor monto
            if (mainMethod) paymentBreakdown[mainMethod].count += 1;
        } else {
            const m = order.payment_method || 'other';
            if (!paymentBreakdown[m]) paymentBreakdown[m] = { count: 0, amount: 0 };
            paymentBreakdown[m].count += 1;
            paymentBreakdown[m].amount += orderNet;
        }

        // Hourly
        if (!hourly[hour]) hourly[hour] = { count: 0, income: 0 };
        hourly[hour].count += 1;
        hourly[hour].income += orderNet;
    }

    // Devoluciones
    const refundList: EmployeeReportData['refunds']['list'] = refunds.map((r: any) => ({
        date: formatDateTimeInTz(r.created_at, timezone),
        orderNumber: r.order?.display_number || `#${r.order?.order_number ?? '—'}`,
        amount: r.total_amount || 0,
        reason: r.reason || 'Sin motivo',
        items: (r.items || [])
            .map((i: any) => `${i.product_name} x${i.quantity}`)
            .join(' · '),
    }));
    const refundTotal = refundList.reduce((s, r) => s + r.amount, 0);

    // Métodos de pago con %
    const totalPmAmount = Object.values(paymentBreakdown).reduce((s, p) => s + p.amount, 0);
    const paymentMethods = Object.entries(paymentBreakdown)
        .map(([method, v]) => ({
            method,
            label: PAYMENT_METHOD_LABELS[method] || method,
            count: v.count,
            amount: v.amount,
            percent: totalPmAmount > 0 ? (v.amount / totalPmAmount) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount);

    // Top productos
    const productTotalIncome = Object.values(productMap).reduce((s, p) => s + p.income, 0);
    const topProducts = Object.entries(productMap)
        .map(([name, v]) => ({
            name,
            quantity: v.quantity,
            income: v.income,
            percent: productTotalIncome > 0 ? (v.income / productTotalIncome) * 100 : 0,
        }))
        .sort((a, b) => b.income - a.income)
        .slice(0, 10);

    // Hourly como array de 24
    const hourlyActivity = Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        count: hourly[h]?.count || 0,
        income: hourly[h]?.income || 0,
    }));

    // Top motivos de anulación
    const topReasons = Object.entries(reasonsMap)
        .map(([reason, v]) => ({ reason, count: v.count, amount: v.amount }))
        .sort((a, b) => b.amount - a.amount);

    // Turnos
    const shiftsData = shifts.map((s: any) => {
        const declared = s.declared_cash;
        const expected = s.expected_cash;
        const diff = declared !== null && expected !== null ? declared - expected : null;
        return {
            openedAt: formatDateTimeInTz(s.opened_at, timezone),
            closedAt: s.closed_at ? formatDateTimeInTz(s.closed_at, timezone) : null,
            openingBalance: s.opening_balance || 0,
            declaredCash: declared,
            difference: diff,
            status: s.status,
        };
    });

    // Métricas finales
    const netSales = netSalesGross - refundTotal;
    const averageTicket = ordersCompletedCount > 0 ? netSalesGross / ordersCompletedCount : 0;
    const voidRate = grossSales > 0 ? (voidTotal / grossSales) * 100 : 0;
    const refundRate = grossSales > 0 ? (refundTotal / grossSales) * 100 : 0;
    const discountRate = grossSales > 0 ? (discountTotal / grossSales) * 100 : 0;
    const shiftShortagesCount = shiftsData.filter(s => s.difference !== null && s.difference < -SHIFT_SHORTAGE_THRESHOLD).length;

    // Top descuentos: ordenar lista por monto y limitar
    const topDiscounts = [...discountsList].sort((a, b) => b.amount - a.amount).slice(0, 10);

    return {
        employee: { id: input.waiterId, name: input.waiterName, isActive: input.waiterIsActive },
        period: {
            startIso: dateStartIso,
            endIso: dateEndIso,
            label: input.periodLabel,
        },
        business: { name: input.businessName, nit: input.businessNit },
        generatedAt: formatDateTimeInTz(new Date().toISOString(), timezone),

        summary: {
            grossSales,
            discountTotal,
            voidTotal,
            refundTotal,
            netSales,
            ordersCount: ordersCompletedCount,
            averageTicket,
        },

        paymentMethods,

        voids: {
            voidedSales,
            voidedItems,
            topReasons,
            rate: voidRate,
        },

        refunds: {
            list: refundList,
            rate: refundRate,
        },

        discounts: {
            total: discountTotal,
            ordersWithDiscount,
            rate: discountRate,
            top: topDiscounts,
        },

        topProducts,
        hourlyActivity,
        shifts: shiftsData,

        alerts: {
            voidRate: { value: voidRate, threshold: VOID_THRESHOLD, level: levelFor(voidRate, VOID_THRESHOLD) },
            refundRate: { value: refundRate, threshold: REFUND_THRESHOLD, level: levelFor(refundRate, REFUND_THRESHOLD) },
            discountRate: { value: discountRate, threshold: DISCOUNT_THRESHOLD, level: levelFor(discountRate, DISCOUNT_THRESHOLD) },
            shiftShortages: {
                count: shiftShortagesCount,
                threshold: SHIFT_SHORTAGE_THRESHOLD,
                level: shiftShortagesCount === 0 ? 'ok' : shiftShortagesCount <= 1 ? 'warn' : 'danger',
            },
        },
    };
};
