/**
 * useSalesHistory — Lista paginada de ventas (completed/voided) con filtros en BD.
 *
 * Diferencias con useSales:
 * - Trae solo ventas completadas o anuladas.
 * - Aplica filtros (rango de fechas, cajero, búsqueda) en la consulta.
 * - Pagina en servidor con offset (`.range(from, to)`) en bloques de 20 para reducir egress.
 * - No soporta mutaciones; las mutaciones se llaman desde useOrders y luego
 *   se invoca `reload()` para refrescar la lista visible.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Order } from './useSales';

const PAGE_SIZE = 20;

// Select compartido entre la lista paginada y la carga puntual por id.
const ORDER_SELECT = `
    *,
    items:order_items(*, product:products(unit)),
    waiter:profiles!waiter_id(full_name),
    client:clients!client_id(id_number, phone),
    refunds:sale_refunds(id, total_amount, reason, created_at, refunded_by, items:sale_refund_items(product_name, quantity, amount, restocked))
`;

const transformOrder = (order: any): Order => {
    const mappedItems = order.items
        ? order.items
            .map((item: any) => ({
                ...item,
                sale_unit: item.product?.unit || item.sale_unit || 'Unidad',
            }))
            .sort((a: any, b: any) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            )
        : [];
    return {
        ...order,
        items: mappedItems,
        waiter_name: order.waiter?.full_name || null,
        waiter: undefined,
    };
};

/**
 * Resuelve el estado del turno (open/closed/reconciled) de un conjunto de ventas
 * en una sola consulta. `cash_movements.reference_id` es polimórfico (no tiene FK
 * a orders), por eso no se puede embeber en el select principal y se hace aparte.
 * Devuelve un mapa order_id -> shift_status con el movimiento más reciente por orden.
 */
const fetchShiftStatusMap = async (orderIds: string[]): Promise<Map<string, string | null>> => {
    const map = new Map<string, string | null>();
    if (orderIds.length === 0 || !navigator.onLine) return map;

    const { data, error } = await supabase
        .from('cash_movements')
        .select('reference_id, created_at, shift:cash_shifts(status)')
        .eq('reference_type', 'order')
        .in('reference_id', orderIds)
        .order('created_at', { ascending: false });

    if (error || !data) return map;

    // Los resultados vienen del más reciente al más antiguo; nos quedamos con el
    // primero visto por cada orden (el más reciente), igual que la lógica previa.
    for (const row of data as any[]) {
        if (!map.has(row.reference_id)) {
            map.set(row.reference_id, row.shift?.status ?? null);
        }
    }
    return map;
};

export interface SalesHistoryFilters {
    /** ISO string del límite inferior del rango (>=). null = sin límite. */
    dateStartIso: string | null;
    /** ISO string del límite superior del rango (<=). null = sin límite. */
    dateEndIso: string | null;
    /** Filtra por waiter_id específico. null = sin filtro de cajero. */
    waiterId: string | null;
    /** Texto libre: busca en customer_name, display_number y order_number. */
    search: string;
    /**
     * Si es true, ignora `waiterId` y filtra por el usuario autenticado
     * (cajero sin permiso `admin_reports`).
     */
    scopeToCurrentUser: boolean;
}

export const useSalesHistory = (filters: SalesHistoryFilters) => {
    const { profile } = useAuth();
    const businessId = profile?.business_id;
    const userId = profile?.id;

    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Token para descartar respuestas obsoletas si los filtros cambian rápido
    const requestIdRef = useRef(0);
    const pageRef = useRef(0);

    const fetchPage = useCallback(async (page: number, replace: boolean) => {
        if (!businessId) return;

        const myReq = ++requestIdRef.current;
        if (replace) setLoading(true);
        else setLoadingMore(true);

        try {
            let q = supabase
                .from('orders')
                .select(ORDER_SELECT)
                .eq('business_id', businessId)
                .in('status', ['completed', 'voided']);

            // Scope por permiso o por filtro explícito
            if (filters.scopeToCurrentUser && userId) {
                q = q.eq('waiter_id', userId);
            } else if (filters.waiterId) {
                q = q.eq('waiter_id', filters.waiterId);
            }

            // Rango de fechas
            if (filters.dateStartIso) q = q.gte('created_at', filters.dateStartIso);
            if (filters.dateEndIso) q = q.lte('created_at', filters.dateEndIso);

            // Búsqueda libre. PostgREST `.or()` espera caracteres seguros.
            const s = filters.search.trim();
            if (s) {
                const escaped = s.replace(/[%,()]/g, '');
                const isNum = /^\d+$/.test(s);
                const orParts = [
                    `customer_name.ilike.%${escaped}%`,
                    `display_number.ilike.%${escaped}%`,
                ];
                if (isNum) orParts.push(`order_number.eq.${s}`);
                q = q.or(orParts.join(','));
            }

            const from = page * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;
            const { data, error } = await q
                .order('created_at', { ascending: false })
                .range(from, to);

            // Respuesta obsoleta — los filtros cambiaron en medio de la consulta
            if (myReq !== requestIdRef.current) return;

            if (error) throw error;

            const transformed: Order[] = (data || []).map(transformOrder);

            // Resolver estado del turno de cada venta en batch (una sola consulta)
            // para saber de antemano si corresponde Anulación (turno abierto) o
            // Devolución (turno cerrado), evitando flicker al abrir la venta.
            const shiftMap = await fetchShiftStatusMap(transformed.map(o => o.id));
            if (myReq !== requestIdRef.current) return;
            for (const o of transformed) {
                o.shift_status = shiftMap.get(o.id) ?? null;
            }

            setOrders(prev => (replace ? transformed : [...prev, ...transformed]));
            setHasMore((data?.length || 0) === PAGE_SIZE);
            setError(null);
        } catch (err: any) {
            if (myReq !== requestIdRef.current) return;
            console.error('[useSalesHistory] Error:', err);
            setError(err.message || 'Error al cargar el historial');
        } finally {
            if (myReq !== requestIdRef.current) return;
            if (replace) setLoading(false);
            else setLoadingMore(false);
        }
    }, [
        businessId,
        userId,
        filters.dateStartIso,
        filters.dateEndIso,
        filters.waiterId,
        filters.search,
        filters.scopeToCurrentUser,
    ]);

    // Reset y primera carga cuando cambian los filtros
    useEffect(() => {
        pageRef.current = 0;
        fetchPage(0, true);
    }, [fetchPage]);

    const loadMore = useCallback(async () => {
        if (loading || loadingMore || !hasMore) return;
        const next = pageRef.current + 1;
        pageRef.current = next;
        await fetchPage(next, false);
    }, [loading, loadingMore, hasMore, fetchPage]);

    const reload = useCallback(async () => {
        pageRef.current = 0;
        await fetchPage(0, true);
    }, [fetchPage]);

    /**
     * Carga una venta puntual por id (deep-link desde el visor de eventos), sin
     * afectar la lista paginada ni los filtros. Devuelve null si no existe o si
     * RLS no la permite.
     */
    const fetchOrderById = useCallback(async (id: string): Promise<Order | null> => {
        if (!businessId) return null;
        const { data, error } = await supabase
            .from('orders')
            .select(ORDER_SELECT)
            .eq('business_id', businessId)
            .eq('id', id)
            .maybeSingle();
        if (error || !data) return null;
        const order = transformOrder(data);
        const shiftMap = await fetchShiftStatusMap([order.id]);
        order.shift_status = shiftMap.get(order.id) ?? null;
        return order;
    }, [businessId]);

    return { orders, loading, loadingMore, hasMore, error, loadMore, reload, fetchOrderById };
};
