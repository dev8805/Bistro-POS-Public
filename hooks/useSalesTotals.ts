/**
 * useSalesTotals — Calcula totales agregados por método de pago para un período dado.
 *
 * Hace una query ligera a Supabase (solo id, payment_method, total, split_payments, status)
 * y agrupa localmente. Incluye devoluciones (sale_refunds.total_amount).
 *
 * Devuelve los montos desglosados y un total general.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { toStoredMethod } from '../lib/paymentMethods';

export interface SalesTotals {
    cash: number;
    card: number;
    online: number; // nequi + daviplata + transfer
    credit: number;
    other: number;
    refunds: number;
    total: number;
    count: number;
}

const EMPTY_TOTALS: SalesTotals = {
    cash: 0,
    card: 0,
    online: 0,
    credit: 0,
    other: 0,
    refunds: 0,
    total: 0,
    count: 0,
};

interface UseSalesTotalsParams {
    dateStartIso: string | null;
    dateEndIso: string | null;
    waiterId: string | null;
    scopeToCurrentUser: boolean;
}

const ONLINE_METHODS = ['nequi', 'daviplata', 'transfer'];

const classifyMethod = (method: string): keyof Pick<SalesTotals, 'cash' | 'card' | 'online' | 'credit' | 'other'> => {
    const m = toStoredMethod(method || '').toLowerCase();
    if (m === 'cash') return 'cash';
    if (m === 'card') return 'card';
    if (ONLINE_METHODS.includes(m)) return 'online';
    if (m === 'credit') return 'credit';
    return 'other';
};

export const useSalesTotals = (params: UseSalesTotalsParams) => {
    const { profile } = useAuth();
    const businessId = profile?.business_id;
    const userId = profile?.id;

    const [totals, setTotals] = useState<SalesTotals>(EMPTY_TOTALS);
    const [loading, setLoading] = useState(false);
    const requestIdRef = useRef(0);

    const fetch = useCallback(async () => {
        if (!businessId || !params.dateStartIso || !params.dateEndIso) {
            setTotals(EMPTY_TOTALS);
            return;
        }

        const myReq = ++requestIdRef.current;
        setLoading(true);

        try {
            // Query 1: ventas completadas con sus montos y métodos de pago
            let q = supabase
                .from('orders')
                .select('id, payment_method, total, split_payments, status')
                .eq('business_id', businessId)
                .in('status', ['completed', 'voided'])
                .gte('created_at', params.dateStartIso)
                .lte('created_at', params.dateEndIso);

            if (params.scopeToCurrentUser && userId) {
                q = q.eq('waiter_id', userId);
            } else if (params.waiterId) {
                q = q.eq('waiter_id', params.waiterId);
            }

            const { data: orders, error: ordersErr } = await q;
            if (myReq !== requestIdRef.current) return;
            if (ordersErr) throw ordersErr;

            // Query 2: devoluciones en el período
            let rq = supabase
                .from('sale_refunds')
                .select('total_amount, order_id')
                .eq('business_id', businessId)
                .gte('created_at', params.dateStartIso)
                .lte('created_at', params.dateEndIso);

            if (params.scopeToCurrentUser && userId) {
                rq = rq.eq('refunded_by', userId);
            } else if (params.waiterId) {
                rq = rq.eq('refunded_by', params.waiterId);
            }

            const { data: refunds, error: refundsErr } = await rq;
            if (myReq !== requestIdRef.current) return;
            if (refundsErr) throw refundsErr;

            // Calcular totales
            const result: SalesTotals = { ...EMPTY_TOTALS };

            for (const order of (orders || [])) {
                // Solo sumar ventas completadas (no anuladas)
                if (order.status !== 'completed') continue;

                // `orders.total` es el neto de la orden. Aplicamos el redondeo a $50
                // para que coincida exactamente con lo cobrado y reportado en caja.
                const netTotal = Math.round(Math.max(0, Number(order.total) || 0) / 50) * 50;

                result.count++;
                result.total += netTotal;

                // Distribuir por método de pago
                if (order.split_payments && Array.isArray(order.split_payments) && order.split_payments.length > 0) {
                    for (const sp of order.split_payments) {
                        const bucket = classifyMethod(sp.method);
                        result[bucket] += Number(sp.amount) || 0;
                    }
                } else {
                    const bucket = classifyMethod(order.payment_method);
                    result[bucket] += netTotal;
                }
            }

            // Sumar devoluciones
            result.refunds = (refunds || []).reduce((acc, r) => acc + (r.total_amount || 0), 0);

            setTotals(result);
        } catch (err) {
            console.error('[useSalesTotals] Error:', err);
            if (myReq === requestIdRef.current) setTotals(EMPTY_TOTALS);
        } finally {
            if (myReq === requestIdRef.current) setLoading(false);
        }
    }, [businessId, userId, params.dateStartIso, params.dateEndIso, params.waiterId, params.scopeToCurrentUser]);

    useEffect(() => {
        fetch();
    }, [fetch]);

    // Permite refrescar desde fuera (ej. después de anular)
    return { totals, loading, reload: fetch };
};
