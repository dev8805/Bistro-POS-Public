import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { logger } from '../lib/logger';
import { isRealOffline } from '../lib/connectivity';
import { getCachedOpenShifts } from '../lib/openShiftsCache';
import {
    getTableOrder,
    saveTableOrder,
    deleteTableOrder,
    getAllTableOrders,
    getCachedTables,
    saveCachedTables,
    type CachedTableOrder,
    type CachedOrderItem,
} from '../lib/offlineTableStore';

export interface OrderItem {
    id: string;
    order_id: string;
    product_id?: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    sale_unit?: string;
    total_price: number;
    discount?: number;
    discount_percent?: number;
    notes?: string;
    removed_ingredients?: string[];
    cooking_term?: string;
    status: 'pending' | 'preparing' | 'ready' | 'served' | 'canceled';
    created_at: string;
}

export interface Order {
    id: string;
    business_id: string;
    table_id?: string;
    client_id?: string;
    waiter_id?: string;
    waiter_name?: string;
    order_number: number;
    display_number?: string | null;
    order_type: 'dine_in' | 'takeaway' | 'delivery';
    status: 'pending' | 'preparing' | 'ready' | 'completed' | 'canceled' | 'voided';
    payment_method: 'cash' | 'card' | 'transfer' | 'credit' | 'other' | 'nequi' | 'daviplata' | 'mixed';
    payment_status: 'pending' | 'paid' | 'partial';
    subtotal: number;
    discount: number;
    discount_type?: 'percentage' | 'fixed';
    tax: number;
    total: number;
    amount_paid: number;
    change_amount: number;
    initial_abono?: number;
    initial_abono_method?: string;
    notes?: string;
    customer_name?: string;
    client_id_number?: string;
    created_at: string;
    completed_at?: string;
    canceled_at?: string;
    canceled_reason?: string;
    voided_at?: string;
    voided_by?: string;
    void_reason?: string;
    items?: OrderItem[];
    split_payments?: { method: string; amount: number }[];
    client?: { id_number?: string; phone?: string; };
    /**
     * Estado del turno de caja al que pertenece la venta (open / closed / reconciled).
     * Se resuelve al cargar el historial para saber de antemano si la venta debe
     * corregirse con Anulación (turno abierto) o Devolución (turno cerrado), sin
     * consultas diferidas que producen flicker en la UI. `null` = sin movimiento
     * de caja asociado (se trata como turno abierto).
     */
    shift_status?: string | null;
    refunds?: {
        id: string;
        total_amount: number;
        reason: string;
        created_at: string;
        refunded_by?: string;
        items?: { product_name: string; quantity: number; amount: number; restocked: boolean }[];
    }[];
}

export interface CreateOrderData {
    table_id?: string;
    client_id?: string;
    client_id_number?: string;
    customer_name?: string;
    order_type: 'dine_in' | 'takeaway' | 'delivery';
    payment_method: 'cash' | 'card' | 'transfer' | 'credit' | 'other' | 'nequi' | 'daviplata';
    items: {
        product_id: string | null;
        promotion_id?: string | null;
        product_name: string;
        quantity: number;
        unit_price: number;
        conversion_factor?: number;
        discount?: number;
        discount_percent?: number;
        notes?: string;
        cooking_term?: string;
        removed_ingredients?: string[];
    }[];
    discount?: number;
    discount_type?: 'percentage' | 'fixed';
    amount_paid?: number;
    change_given?: number;
    initial_abono?: number;
    initial_abono_method?: string;
    notes?: string;
    skip_kitchen?: boolean;
    credit_note?: string;
    credit_due_date?: string;
    split_payments?: { method: string; amount: number }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Modo offline de la orden de mesa (modelo "Usuario Eje" / single-writer)
//
// Cuando no hay internet y el usuario es el Eje (tiene turno de caja abierto),
// las operaciones de la orden de mesa NO tocan Supabase: mutan el snapshot local
// de la mesa en Cache_Orden_Mesa_IDB. El cobro (task 10) materializa esa orden
// como una sola venta encolada. Los observadores (sin turno) quedan en solo
// lectura: sus escrituras devuelven `READ_ONLY_RESULT` para que la UI lo traduzca.
// ─────────────────────────────────────────────────────────────────────────────

/** Resultado controlado que la UI interpreta como "solo lectura" (observador offline). */
export const READ_ONLY_RESULT = { readOnly: true as const };

/** ¿El usuario actual es el Usuario Eje? (tiene turno de caja abierto). */
const esEjeLocal = (businessId?: string | null, userId?: string | null): boolean => {
    if (!businessId) return false;
    // Req 3.4: un turno activo cacheado localmente basta para ser Eje.
    if (localStorage.getItem(`bistro_active_shift_${businessId}`)) return true;
    // Req 3.2: figurar en la lista de turnos abiertos cacheada.
    if (userId) return getCachedOpenShifts().some((s) => s.userId === userId);
    return false;
};

/** Genera un id local estable para items/ordenes creados sin conexion. */
const nuevoIdLocal = (): string =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2)}`;

/**
 * Convierte un snapshot cacheado en un objeto con la misma forma que devuelve
 * `fetchTableOrder` en linea, para que la hidratacion del carrito no cambie.
 */
const cachedToOrder = (cached: CachedTableOrder): any => ({
    id: cached.order_id,
    table_id: cached.table_id,
    order_type: 'dine_in',
    status: 'pending',
    payment_status: 'pending',
    created_at: cached.updated_at,
    items: cached.items.map((ci) => ({
        id: ci.local_id,
        order_id: cached.order_id,
        product_id: ci.product_id,
        promotion_id: ci.promotion_id ?? null,
        product_name: ci.product_name,
        quantity: ci.quantity,
        unit_price: ci.unit_price,
        total_price: Math.round(ci.unit_price * ci.quantity),
        notes: ci.notes,
        cooking_term: ci.cooking_term,
        removed_ingredients: ci.removed_ingredients || [],
        status: ci.status,
        parent_order_item_id: ci.parent_local_id ?? null,
        sale_unit: 'Unidad',
        pendingSync: ci.pendingSync,
        created_at: cached.updated_at,
    })),
});

/**
 * Convierte una orden de Supabase (con items y modificadores como hijos) en un
 * snapshot cacheable. Usado al cargar la orden en linea (Req 2.1) para que el
 * Eje pueda hidratarla luego sin conexion (Req 2.2).
 */
const orderToCached = (tableId: string, order: any): CachedTableOrder => ({
    table_id: tableId,
    order_id: order.id,
    items: (order.items || []).map((it: any): CachedOrderItem => ({
        local_id: it.id,
        product_id: it.product_id ?? null,
        promotion_id: it.promotion_id ?? null,
        product_name: it.product_name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        notes: it.notes ?? undefined,
        cooking_term: it.cooking_term ?? undefined,
        removed_ingredients: it.removed_ingredients ?? undefined,
        status: (it.status as CachedOrderItem['status']) ?? 'pending',
        parent_local_id: it.parent_order_item_id ?? undefined,
        pendingSync: false,
    })),
    updated_at: new Date().toISOString(),
    dirty: false,
});

/** Marca una mesa como ocupada en Cache_Mesas_IDB (Req 7.4). */
const marcarMesaOcupadaLocal = async (tableId: string, orderId: string): Promise<void> => {
    const tables = await getCachedTables();
    if (!tables.length) return;
    let changed = false;
    const updated = tables.map((t: any) => {
        if (t.id === tableId && (t.status !== 'occupied' || t.current_order_id !== orderId)) {
            changed = true;
            return { ...t, status: 'occupied', current_order_id: orderId };
        }
        return t;
    });
    if (changed) {
        await saveCachedTables(updated);
        // Reflejar la ocupación en la UI de mesas (useTables re-lee el cache).
        window.dispatchEvent(new CustomEvent('offline-tables-updated'));
    }
};

/** Libera la mesa localmente (disponible, sin orden) y borra su snapshot. */
const liberarMesaLocal = async (tableId: string): Promise<void> => {
    const tables = await getCachedTables();
    if (tables.length) {
        let changed = false;
        const updated = tables.map((t: any) => {
            if (t.id === tableId && (t.status !== 'available' || t.current_order_id)) {
                changed = true;
                return { ...t, status: 'available', current_order_id: null };
            }
            return t;
        });
        if (changed) {
            await saveCachedTables(updated);
            // Reflejar la liberación en la UI de mesas (useTables re-lee el cache).
            window.dispatchEvent(new CustomEvent('offline-tables-updated'));
        }
    }
    await deleteTableOrder(tableId);
};

/** Localiza el snapshot que contiene un `order_id` dado (para las variantes ById). */
const getTableOrderByOrderId = async (orderId: string): Promise<CachedTableOrder | null> => {
    const all = await getAllTableOrders();
    return all.find((o) => o.order_id === orderId) ?? null;
};

/** Localiza el snapshot que contiene un item con el `local_id` dado. */
const getTableOrderByItemId = async (orderItemId: string): Promise<CachedTableOrder | null> => {
    const all = await getAllTableOrders();
    return all.find((o) => o.items.some((it) => it.local_id === orderItemId)) ?? null;
};

/**
 * Agrega un item (y sus modificadores como hijos) al snapshot de la mesa.
 * Replica la logica de merge por producto del flujo en linea: mergea solo si el
 * mismo producto ya existe, sin modificadores, no es una linea hija y no esta
 * listo/servido. Marca `pendingSync` y `dirty`, y ocupa la mesa (Req 7.1, 7.2, 7.4).
 */
const agregarItemOffline = async (tableId: string, item: any, forceSplit = false) => {
    let cached = await getTableOrder(tableId);
    if (!cached) {
        cached = {
            table_id: tableId,
            order_id: `offline_order_${nuevoIdLocal()}`,
            items: [],
            updated_at: new Date().toISOString(),
            dirty: true,
        };
    }

    const llevaModificadores = Array.isArray(item.addedModifiers) && item.addedModifiers.length > 0;

    // Merge por producto (misma logica que en linea): mismo product_id, mismas
    // personalizaciones, sin add-ons, no es hija y no esta listo/servido.
    const existente = !forceSplit && !llevaModificadores
        ? cached.items.find((ci) =>
            !ci.parent_local_id &&
            ci.product_id === (item.product_id ?? null) &&
            (ci.notes ?? null) === (item.notes ?? null) &&
            (ci.cooking_term ?? null) === (item.cooking_term ?? null) &&
            JSON.stringify(ci.removed_ingredients || []) === JSON.stringify(item.removed_ingredients || []) &&
            !['ready', 'served', 'completed'].includes(ci.status))
        : undefined;

    let resultado: any;

    if (existente) {
        existente.quantity += item.quantity;
        existente.pendingSync = true;
        resultado = { action: 'updated', orderItemId: existente.local_id, newQuantity: existente.quantity };
    } else {
        const nuevo: CachedOrderItem = {
            local_id: `offline_item_${nuevoIdLocal()}`,
            product_id: item.product_id ?? null,
            promotion_id: item.promotion_id ?? null,
            product_name: item.name,
            quantity: item.quantity,
            unit_price: item.price,
            notes: item.notes,
            cooking_term: item.cooking_term,
            removed_ingredients: item.removed_ingredients || [],
            status: 'pending',
            pendingSync: true,
        };
        cached.items.push(nuevo);

        // Modificadores como lineas hijas vinculadas por parent_local_id (Req 7.2).
        const childOrderItemIds: string[] = [];
        if (llevaModificadores) {
            for (const m of item.addedModifiers) {
                const child: CachedOrderItem = {
                    local_id: `offline_item_${nuevoIdLocal()}`,
                    product_id: m.id ?? null,
                    product_name: m.name,
                    quantity: item.quantity,
                    unit_price: m.price ?? 0,
                    status: 'pending',
                    parent_local_id: nuevo.local_id,
                    pendingSync: true,
                };
                cached.items.push(child);
                childOrderItemIds.push(child.local_id);
            }
        }
        resultado = { action: 'created', orderItemId: nuevo.local_id, newQuantity: item.quantity, childOrderItemIds };
    }

    cached.dirty = true;
    await saveTableOrder(cached);
    await marcarMesaOcupadaLocal(tableId, cached.order_id); // Req 7.4
    return resultado;
};

/**
 * Quita un item del snapshot (y sus modificadores hijos). Si la orden queda
 * vacia, libera la mesa localmente. Devuelve la orden reconstruida o `null`.
 */
const quitarItemOffline = async (tableId: string, orderItemId: string): Promise<any | null> => {
    const cached = await getTableOrder(tableId);
    if (!cached) return null;

    cached.items = cached.items.filter(
        (ci) => ci.local_id !== orderItemId && ci.parent_local_id !== orderItemId
    );

    if (cached.items.length === 0) {
        await liberarMesaLocal(tableId);
        return null;
    }

    cached.dirty = true;
    await saveTableOrder(cached);
    return cachedToOrder(cached);
};

/** Actualiza la cantidad de un item en el snapshot. Devuelve la orden reconstruida. */
const actualizarCantidadOffline = async (
    tableId: string,
    orderItemId: string,
    newQuantity: number
): Promise<any | null> => {
    const cached = await getTableOrder(tableId);
    if (!cached) return null;
    const it = cached.items.find((ci) => ci.local_id === orderItemId);
    if (!it) return cachedToOrder(cached);
    it.quantity = newQuantity;
    it.pendingSync = true;
    cached.dirty = true;
    await saveTableOrder(cached);
    return cachedToOrder(cached);
};

export function useSales() {
    const { profile } = useAuth();
    const [orders, setOrders] = useState<Order[]>([]);
    // Sin carga automática de la lista de órdenes (optimización egress): loading
    // arranca en false. `fetchOrders` lo pone en true/false si se llama explícito.
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const businessId = profile?.business_id;
    const userId = profile?.id;

    // Fetch orders
    const fetchOrders = useCallback(async () => {
        if (!businessId) return;
        console.log('🔎[FETCH][orders] fetchOrders ejecutado — NO debería aparecer al recargar la app');

        try {
            setLoading(true);
            logger.log('[fetchOrders] Starting fetch for business:', businessId);

            const { data, error } = await supabase
                .from('orders')
                .select(`
                    *,
                    items:order_items(*, product:products(unit)),
                    waiter:profiles!waiter_id(full_name),
                    client:clients!client_id(id_number, phone),
                    refunds:sale_refunds(id, total_amount, reason, created_at, refunded_by, items:sale_refund_items(product_name, quantity, amount, restocked))
                `)
                .eq('business_id', businessId)
                .order('created_at', { ascending: false })
                .limit(100);

            if (error) {
                console.error('[fetchOrders] Query error:', error);
                throw error;
            }

            logger.log('[fetchOrders] Raw data count:', data?.length || 0);

            // Transform data to include extra fields at the top level
            const ordersWithDetails = (data || []).map((order: any) => {
                const mappedItems = order.items ? order.items.map((item: any) => ({
                    ...item,
                    sale_unit: item.product?.unit || item.sale_unit || 'Unidad'
                })).sort((a: any, b: any) =>
                    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                ) : [];

                return {
                    ...order,
                    items: mappedItems,
                    waiter_name: order.waiter?.full_name || null,
                    waiter: undefined
                };
            });

            logger.log('[fetchOrders] Transformed orders count:', ordersWithDetails.length);
            setOrders(ordersWithDetails);

            // Cache max order number for offline fallback
            const maxOrderNum = Math.max(0, ...ordersWithDetails.map((o: any) => o.order_number || 0));
            if (maxOrderNum > 0) {
                localStorage.setItem('bistro_last_order_number', maxOrderNum.toString());
            }

            setError(null);
        } catch (err: any) {
            console.error('[fetchOrders] Error:', err.message || err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [businessId]);

    // Create Order (Pending)
    const createOrder = useCallback(async (orderData: CreateOrderData) => {
        if (!businessId || !userId) {
            throw new Error('Usuario no autenticado');
        }

        logger.log('[createOrder] 🚀 Creating New Order');
        logger.log('[createOrder] Data:', JSON.stringify(orderData, null, 2));

        try {
            // Calculate totals
            // El subtotal es el bruto (unit_price × qty) para preservar la
            // referencia original del ítem. El descuento total del pedido
            // suma los descuentos por línea (item.discount o el porcentaje
            // por ítem) MÁS el descuento global capturado en PaymentScreen.
            // Antes se ignoraban los descuentos por línea, lo que dejaba
            // orders.total, cash_movements.amount y sales_by_method inflados,
            // haciendo que el reporte de turno no reflejara el descuento.
            const subtotal = orderData.items.reduce(
                (sum, item) => sum + Math.round(item.unit_price * item.quantity),
                0,
            );
            const perItemDiscountTotal = orderData.items.reduce((sum, item) => {
                const line = item.discount
                    || (item.discount_percent
                        ? item.unit_price * item.quantity * item.discount_percent / 100
                        : 0);
                return sum + (line || 0);
            }, 0);

            let orderLevelDiscount = 0;
            if (orderData.discount && orderData.discount > 0) {
                if (orderData.discount_type === 'percentage') {
                    orderLevelDiscount = subtotal * (orderData.discount / 100);
                } else {
                    orderLevelDiscount = orderData.discount;
                }
            }

            const discount = perItemDiscountTotal + orderLevelDiscount;
            const total = Math.round(Math.max(0, subtotal - discount) / 50) * 50;

            // For delivery/takeaway orders, they start as 'preparing' (already in kitchen)
            // UNLESS skip_kitchen is true (quick order with kitchen disabled)
            const isDelivery = orderData.order_type === 'delivery';
            const isTakeaway = orderData.order_type === 'takeaway';
            const skipKitchen = orderData.skip_kitchen === true;
            // Only consider as off-premise (goes to kitchen) if NOT skipping kitchen
            const isOffPremise = (isDelivery || isTakeaway) && !skipKitchen;
            const amountPaid = orderData.amount_paid !== undefined ? orderData.amount_paid : (isOffPremise ? 0 : (orderData.payment_method === 'credit' ? 0 : total));
            const changeAmount = orderData.change_given !== undefined ? orderData.change_given : (amountPaid > total ? amountPaid - total : 0);
            const paymentStatus = (isOffPremise && amountPaid < total) ? 'pending' : (orderData.payment_method === 'credit' ? 'pending' : 'paid');
            // Off-premise orders go directly to kitchen (preparing), not pending confirmation
            // If skip_kitchen, treat as completed immediately
            //
            // NOTA (libra / descuento de stock) — leer si se toca el ciclo de la orden:
            // El descuento de inventario se hace por RPC (deduct_inventory_complete / deduct_stock_for_order),
            // que YA usa la libra del negocio (businesses.pound_in_grams). El trigger SQL
            // update_stock_on_order_complete usa la libra fija 453.592 y SOLO se dispara si una orden pasa a
            // 'completed' por UPDATE — hoy NINGÚN flujo hace eso (todas se INSERTAN ya 'completed'/'preparing'),
            // así que el trigger está inactivo y NO hay doble descuento. Si se agrega un flujo que complete
            // órdenes por UPDATE (ej. "completar desde cocina"), hay que pasar pound_in_grams al trigger
            // (y a la función convert_unit). Ver docs/caracteristicas/cambios_recetas_insumos_2026-06-05.md
            const orderStatus = isOffPremise ? 'preparing' : 'completed';

            logger.log('[createOrder] Status determination:', { isDelivery, isTakeaway, skipKitchen, orderStatus });

            // Validar venta a crédito
            if (orderData.payment_method === 'credit' && !orderData.client_id) {
                throw new Error('Las ventas a crédito requieren un cliente registrado');
            }

            // Generar número de orden (con lock optimista simple + caché offline)
            const ORDER_SEQ_CACHE_KEY = 'bistro_last_order_number';

            const { data: lastOrder } = await supabase
                .from('orders')
                .select('order_number')
                .eq('business_id', businessId)
                .order('order_number', { ascending: false })
                .limit(1)
                .single();

            let nextOrderNumber: number;
            if (lastOrder?.order_number) {
                nextOrderNumber = lastOrder.order_number + 1;
            } else {
                const cachedNumber = parseInt(localStorage.getItem(ORDER_SEQ_CACHE_KEY) || '0', 10);
                nextOrderNumber = cachedNumber > 0 ? cachedNumber + 1 : 1;
            }
            localStorage.setItem(ORDER_SEQ_CACHE_KEY, nextOrderNumber.toString());
            logger.log('[createOrder] Next Order Number:', nextOrderNumber);

            // Create order
            const { data: order, error: orderError } = await supabase
                .from('orders')
                .insert({
                    business_id: businessId,
                    order_number: nextOrderNumber,
                    display_number: (orderData as any).display_number || null,
                    table_id: orderData.table_id,
                    client_id: orderData.client_id,
                    waiter_id: userId,
                    customer_name: orderData.customer_name,
                    order_type: orderData.order_type,
                    payment_method: orderData.split_payments ? 'mixed' : orderData.payment_method,
                    payment_status: paymentStatus,
                    status: orderStatus,
                    subtotal,
                    discount,
                    discount_type: orderData.discount_type,
                    tax: 0,
                    total,
                    amount_paid: amountPaid,
                    change_amount: changeAmount,
                    initial_abono: orderData.initial_abono || 0,
                    initial_abono_method: orderData.initial_abono_method || null,
                    notes: orderData.notes,
                    completed_at: isOffPremise ? null : new Date().toISOString(),
                    last_confirmed_at: isOffPremise ? new Date().toISOString() : null,
                    split_payments: orderData.split_payments || null,
                })
                .select()
                .single();

            if (orderError) throw orderError;
            logger.log('[createOrder] Order Created ID:', order.id);


            // IMPORTANTE: `total_price` se guarda BRUTO (unit_price × qty).
            // El trigger SQL `recalculate_order_total` reconstruye
            // `orders.subtotal` sumando estos `total_price` y luego calcula
            // `total = subtotal - discount + tax`. Si `total_price` se guarda
            // como neto (con el descuento por línea ya aplicado), el trigger
            // resta el descuento otra vez y deja el `total` a la mitad.
            const orderItems = orderData.items.map(item => ({
                order_id: order.id,
                product_id: item.product_id,
                promotion_id: item.promotion_id || null,
                product_name: item.product_name,
                quantity: item.quantity,
                unit_price: item.unit_price,
                conversion_factor: (item as any).conversion_factor || 1,
                total_price: Math.round(item.unit_price * item.quantity),
                discount: item.discount || 0,
                discount_percent: item.discount_percent || 0,
                notes: item.notes,
                cooking_term: item.cooking_term,
                removed_ingredients: item.removed_ingredients || [],
                status: 'served' as const,
            }));

            const { error: itemsError } = await supabase
                .from('order_items')
                .insert(orderItems);

            if (itemsError) throw itemsError;

            // === PARALLEL POST-CREATION TASKS ===
            const postTasks: Promise<any>[] = [];

            // Task 1: Complete Stock Deduction (Legacy Stock + FIFO + Ingredients)
            // NOTA: las órdenes a DOMICILIO (isDelivery) NO se descuentan aquí, y no hay otro punto conocido
            // que las descuente luego. Hoy no afecta (las ventas reales son takeaway/completed), pero si se
            // empieza a usar domicilio con cocina hay que verificar dónde se descuenta su inventario.
            if (!isDelivery) {
                // We clear the table first to avoid UI lag, but we await the deduction for data integrity
                postTasks.push(
                    supabase.rpc('deduct_inventory_complete', { p_order_id: order.id })
                        .then(({ data, error }) => {
                            if (error) {
                                console.error('[createOrder] Error deducting inventory:', error);
                            } else {
                                logger.log('[createOrder] Inventory Deduction:', data);
                            }
                        }) as Promise<any>
                );

                // Task 2: Free table (if used)
                if (orderData.table_id) {
                    postTasks.push(
                        supabase.from('tables').update({
                            status: 'available',
                            current_order_id: null
                        }).eq('id', orderData.table_id).then() as Promise<any>
                    );
                }
            }

            // Task 3: Cash movement registration
            const isPaidDelivery = isDelivery && orderData.amount_paid && orderData.amount_paid > 0;
            const isCredit = orderData.payment_method === 'credit';
            const shouldRegisterCashMovement = !isDelivery || (isPaidDelivery && !isCredit);

            if (shouldRegisterCashMovement) {
                postTasks.push(
                    (async () => {
                        const { data: activeShift } = await supabase
                            .from('cash_shifts')
                            .select('id')
                            .eq('business_id', businessId)
                            .eq('opened_by', userId)
                            .eq('status', 'open')
                            .maybeSingle();

                        if (activeShift) {
                            if (orderData.split_payments && orderData.split_payments.length > 0) {
                                const paymentMethodMap: Record<string, string> = {
                                    'Efectivo': 'cash', 'Tarjeta': 'card', 'Nequi': 'nequi',
                                    'Daviplata': 'daviplata', 'Transferencia': 'transfer', 'Otro': 'other',
                                };
                                const movements = orderData.split_payments.map(sp => ({
                                    shift_id: activeShift.id,
                                    created_by: userId,
                                    type: 'sale' as const,
                                    amount: sp.amount,
                                    description: `Venta #${order.order_number} (${sp.method})`,
                                    reference_id: order.id,
                                    reference_type: 'order' as const,
                                    payment_method: paymentMethodMap[sp.method] || sp.method,
                                }));
                                await supabase.from('cash_movements').insert(movements);
                            } else {
                                const movementAmount = isCredit ? 0 : total;
                                const movementDescription = isCredit
                                    ? `Venta #${order.order_number} (Crédito - $${total.toLocaleString()})`
                                    : (isDelivery ? `Domicilio #${order.order_number}` : `Venta #${order.order_number}`);

                                await supabase.from('cash_movements').insert({
                                    shift_id: activeShift.id,
                                    created_by: userId,
                                    type: 'sale',
                                    amount: movementAmount,
                                    description: movementDescription,
                                    reference_id: order.id,
                                    reference_type: 'order',
                                    payment_method: orderData.payment_method || 'cash'
                                });
                            }
                        }
                    })()
                );
            }

            // Task 4: Credit transaction (if credit payment)
            if (orderData.payment_method === 'credit' && orderData.client_id) {
                postTasks.push(
                    (async () => {
                        const { error: txError } = await supabase
                            .from('client_transactions')
                            .insert({
                                client_id: orderData.client_id!,
                                type: 'debt',
                                amount: total,
                                note: orderData.credit_note
                                    ? `${isDelivery ? 'Domicilio' : 'Venta'} #${order.order_number} · ${orderData.credit_note}`
                                    : (isDelivery ? `Domicilio #${order.order_number}` : `Venta #${order.order_number}`),
                                order_id: order.id,
                                created_by: userId,
                                due_date: orderData.credit_due_date || null,
                            });

                        if (txError) throw txError;
                    })()
                );
            }

            // Execute all post-tasks in parallel
            const results = await Promise.allSettled(postTasks);
            results.forEach((r, i) => {
                if (r.status === 'rejected') console.error(`[createOrder] Post-task ${i} failed:`, r.reason);
            });

            // [FIX] Dispatch sale-completed event for immediate local stock update
            // This avoids full page reload or heavy refetching
            // Filter valid items to update stock
            const soldItems = orderData.items.map(item => ({
                productId: item.product_id,
                promotionId: (item as any).promotion_id || null,
                quantity: item.quantity,
                conversion_factor: (item as any).conversion_factor || 1
            }));

            // Always dispatch event to refresh cash register & local UI
            const event = new CustomEvent('sale-completed', {
                detail: { items: soldItems.length > 0 ? soldItems : [] }
            });
            window.dispatchEvent(event);
            logger.log('[createOrder] Dispatched sale-completed event', soldItems);

            return order;
        } catch (err: any) {
            console.error('Error creating order:', err);
            throw err;
        }
    }, [businessId, userId, fetchOrders]);

    // Delete order
    const deleteOrder = useCallback(async (orderId: string) => {
        try {
            const { data, error } = await supabase
                .rpc('delete_order_and_restore_stock', {
                    p_order_id: orderId
                });

            if (error) throw error;

            if (data && data.success === false) {
                throw new Error(data.message);
            }

        } catch (err: any) {
            console.error('Error deleting order:', err);
            throw err;
        }
    }, [fetchOrders]);

    // Anular venta (soft void): conserva el registro, revierte stock/caja/deuda.
    // Valida el permiso pos_cancel del lado del servidor (RPC SECURITY DEFINER).
    const voidOrder = useCallback(async (orderId: string, reason: string) => {
        try {
            const { data, error } = await supabase
                .rpc('void_order_and_restore_stock', {
                    p_order_id: orderId,
                    p_void_reason: reason
                });

            if (error) throw error;

            if (data && data.success === false) {
                throw new Error(data.message);
            }

        } catch (err: any) {
            console.error('Error voiding order:', err);
            throw err;
        }
    }, [fetchOrders]);

    // Anular un item de la venta (soft): conserva el registro del item.
    const voidOrderItem = useCallback(async (orderItemId: string, reason: string) => {
        try {
            const { data, error } = await supabase
                .rpc('void_order_item_and_restore_stock', {
                    p_order_item_id: orderItemId,
                    p_void_reason: reason
                });

            if (error) throw error;

            if (data && data.success === false) {
                throw new Error(data.message);
            }

            return data;
        } catch (err: any) {
            console.error('Error voiding order item:', err);
            throw err;
        }
    }, [fetchOrders]);

    const deleteOrderItem = useCallback(async (orderItemId: string) => {
        try {
            const { data, error } = await supabase
                .rpc('delete_order_item_and_restore_stock', {
                    p_order_item_id: orderItemId
                });

            if (error) throw error;

            if (data && data.success === false) {
                throw new Error(data.message);
            }

            return data;
        } catch (err: any) {
            console.error('Error deleting order item:', err);
            throw err;
        }
    }, [fetchOrders]);

    const updateOrderItem = useCallback(async (
        orderItemId: string,
        updates: { newProductId?: string; newQuantity?: number }
    ) => {
        try {
            const { data, error } = await supabase
                .rpc('update_order_item', {
                    p_order_item_id:  orderItemId,
                    p_new_product_id: updates.newProductId ?? null,
                    p_new_quantity:   updates.newQuantity  ?? null
                });

            if (error) throw error;

            if (data && data.success === false) {
                throw new Error(data.message);
            }

            return data;
        } catch (err: any) {
            console.error('Error updating order item:', err);
            throw err;
        }
    }, [fetchOrders]);

    // Carga inicial: NO se auto-trae la lista completa de órdenes. El array
    // `orders` no lo renderiza ningún consumidor (App usa solo mutaciones;
    // SalesScreen muestra la lista vía useSalesHistory paginado). `fetchOrders`
    // queda disponible para quien lo necesite explícitamente. (Optimización egress)

    // --- Active Order Management (for Tables) ---

    // OPTIMIZED: Get active order for a table in a SINGLE query using FK join
    const fetchTableOrder = useCallback(async (tableId: string) => {
        console.log('🔎[FETCH][order-mesa] fetchTableOrder ejecutado | tableId:', tableId, '— solo al abrir una mesa');

        // OFFLINE: hidratar desde el snapshot local (Req 2.2). La lectura esta
        // permitida a todos (tambien al observador en solo lectura, Req 5.1).
        if (await isRealOffline()) {
            const cached = await getTableOrder(tableId);
            if (!cached) return null;

            // Autocurado: si el snapshot NO tiene cambios offline pendientes
            // (`dirty`) pero la mesa figura LIBRE en Cache_Mesas_IDB (available y
            // sin orden), el snapshot quedó obsoleto (p. ej. tras cobrar/liberar o
            // una sync previa). Se limpia y se devuelve vacío, de forma dinámica y
            // sin necesidad de refrescar nada.
            if (!cached.dirty) {
                const tables = await getCachedTables();
                const t = tables.find((x: any) => x.id === tableId);
                if (t && t.status !== 'occupied' && !t.current_order_id) {
                    await deleteTableOrder(tableId);
                    return null;
                }
            }

            return cachedToOrder(cached);
        }

        try {
            // Single query: Get table with its current order and items via FK relationship
            const { data: table, error: tableError } = await supabase
                .from('tables')
                .select(`
                    current_order_id,
                    order:orders!tables_current_order_fk (
                        *,
                        items:order_items(*, product:products(unit))
                    )
                `)
                .eq('id', tableId)
                .single();

            if (tableError) throw tableError;

            // No order linked to this table
            if (!table?.current_order_id || !table.order) {
                return null;
            }

            const order = table.order as any;

            const mappedItems = order.items ? order.items.map((item: any) => ({
                ...item,
                sale_unit: item.product?.unit || item.sale_unit || 'Unidad'
            })).sort((a: any, b: any) =>
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            ) : [];

            const result = {
                ...order,
                items: mappedItems
            };

            // Cachear el snapshot para el modo offline (Req 2.1): permite que el
            // Eje hidrate la orden luego sin conexion. Fire-and-forget.
            // IMPORTANTE: NO sobrescribir un snapshot con cambios offline sin
            // sincronizar (`dirty`); se perderían las ediciones offline que aún no
            // se han materializado en Supabase.
            void (async () => {
                try {
                    const existing = await getTableOrder(tableId);
                    if (existing?.dirty) return;
                    await saveTableOrder(orderToCached(tableId, result));
                } catch { /* no-op */ }
            })();

            return result;
        } catch (err: any) {
            console.error('[fetchTableOrder] Error:', err);
            return null;
        }
    }, []);

    // Cola de serialización para operaciones sobre items de órdenes en mesa:
    // evita condiciones de carrera cuando se agregan, eliminan o modifican productos
    // rápidamente (doble creación de orden, pérdida de incrementos o conflictos al vaciar mesa).
    const orderItemQueueRef = useRef<Promise<any>>(Promise.resolve());
    const enqueueOrderOperation = useCallback(<T>(fn: () => Promise<T>): Promise<T> => {
        const task = orderItemQueueRef.current.then(fn, fn);
        orderItemQueueRef.current = task.then(() => undefined, () => undefined);
        return task;
    }, []);

    // Add item to active order (with upsert logic for same product)
    const addItemToOrder = useCallback((tableId: string, item: any, options?: { forceSplit?: boolean }) => {
        const run = async () => {
        if (!businessId || !userId) return null;

        const forceSplit = options?.forceSplit || false;

        // OFFLINE (modelo Usuario Eje): el Eje muta el snapshot local; el
        // observador queda en solo lectura (Req 7.1, 7.2, 7.4).
        if (await isRealOffline()) {
            if (!esEjeLocal(businessId, userId)) return READ_ONLY_RESULT;
            return await agregarItemOffline(tableId, item, forceSplit);
        }

        try {
            // 1. Check/Get active order
            let orderId;
            const existingOrder = await fetchTableOrder(tableId);

            if (existingOrder) {
                orderId = existingOrder.id;

                // Garantizar que la mesa quede marcada como ocupada. Puede haber quedado
                // 'available' por limpiezas/estados previos aunque ya tenga orden con items.
                const { data: tableRow } = await supabase
                    .from('tables')
                    .select('status')
                    .eq('id', tableId)
                    .single();
                if (tableRow && tableRow.status !== 'occupied') {
                    await supabase
                        .from('tables')
                        .update({ status: 'occupied', current_order_id: orderId })
                        .eq('id', tableId);
                }

                const isOrderReady = ['ready', 'served', 'completed'].includes((existingOrder.status || '').toLowerCase());

                // Check if same product with same customizations already exists AND is not ready/served
                const existingItem = !forceSplit && !isOrderReady && !item.addedModifiers?.length
                    ? existingOrder.items?.find((orderItem: any) =>
                        !orderItem.parent_order_item_id && // Nunca mergear contra una línea hija (add-on)
                        orderItem.product_id === item.product_id &&
                        orderItem.notes === (item.notes || null) &&
                        orderItem.cooking_term === (item.cooking_term || null) &&
                        JSON.stringify(orderItem.removed_ingredients || []) === JSON.stringify(item.removed_ingredients || []) &&
                        // NEW: Robust check - Don't merge if item is ready/served/delivered
                        !['ready', 'served', 'delivered', 'completed'].includes((orderItem.status || '').toLowerCase())
                    )
                    : undefined;

                logger.log('[addItemToOrder] Existing item search:', {
                    orderStatus: existingOrder.status,
                    isOrderReady,
                    forceSplit,
                    found: !!existingItem,
                    item: existingItem ? JSON.stringify(existingItem) : 'null'
                });

                if (existingItem) {
                    // Update quantity of existing item instead of creating new
                    const newQuantity = existingItem.quantity + item.quantity;
                    const { error: updateError } = await supabase
                        .from('order_items')
                        .update({
                            quantity: newQuantity,
                            total_price: Math.round(item.price * newQuantity)
                        })
                        .eq('id', existingItem.id);

                    if (updateError) throw updateError;

                    // Return info about the updated item
                    return {
                        action: 'updated',
                        orderItemId: existingItem.id,
                        newQuantity
                    };
                }
            } else {
                // Create new pending order
                const { data: newOrder, error: createError } = await supabase
                    .from('orders')
                    .insert({
                        business_id: businessId,
                        table_id: tableId,
                        waiter_id: userId,
                        order_type: 'dine_in',
                        status: 'pending',
                        payment_status: 'pending',
                        subtotal: 0,
                        total: 0,
                        tax: 0,
                        amount_paid: 0,
                        change_amount: 0,
                        created_at: new Date().toISOString(),
                    })
                    .select()
                    .single();

                if (createError) throw createError;
                orderId = newOrder.id;

                // Link to table and set as occupied
                await supabase
                    .from('tables')
                    .update({
                        current_order_id: orderId,
                        status: 'occupied'
                    })
                    .eq('id', tableId);
            }

            // 2. Add new Item
            const { data: newItem, error: itemError } = await supabase
                .from('order_items')
                .insert({
                    order_id: orderId,
                    product_id: item.product_id,
                    promotion_id: item.promotion_id || null,
                    product_name: item.name,
                    quantity: item.quantity,
                    unit_price: item.price,
                    conversion_factor: item.conversion_factor || 1,
                    total_price: Math.round(item.price * item.quantity),
                    notes: item.notes,
                    cooking_term: item.cooking_term,
                    removed_ingredients: item.removed_ingredients || [],
                    status: 'pending'
                })
                .select('id')
                .single();

            if (itemError) throw itemError;

            // Add-ons: crear una línea hija por cada producto-modificador, vinculada al padre.
            let childOrderItemIds: string[] = [];
            if (item.addedModifiers?.length) {
                const childrenRows = item.addedModifiers.map((m: any) => ({
                    order_id: orderId,
                    product_id: m.id,
                    product_name: m.name,
                    quantity: item.quantity,
                    unit_price: m.price,
                    total_price: Math.round((m.price || 0) * item.quantity),
                    status: 'pending',
                    parent_order_item_id: newItem.id
                }));
                const { data: children, error: childErr } = await supabase
                    .from('order_items')
                    .insert(childrenRows)
                    .select('id');
                if (childErr) {
                    // Rollback: quitar el padre (la cascade no aplica porque las hijas no se crearon)
                    await supabase.from('order_items').delete().eq('id', newItem.id);
                    throw childErr;
                }
                childOrderItemIds = (children || []).map((c: any) => c.id);
            }

            // NEW: If adding a new item, ensure order status reverts to 'preparing' if it was 'ready'
            // This brings the order back to the Kitchen Screen
            if (existingOrder && (existingOrder.status === 'ready' || existingOrder.status === 'served' || existingOrder.status === 'completed')) {
                const { error: statusError } = await supabase
                    .from('orders')
                    .update({
                        status: 'preparing',
                        last_confirmed_at: new Date().toISOString(),
                        dispatched_at: null
                    })
                    .eq('id', orderId);

                if (statusError) {
                    console.error('Error reverting order status to preparing:', statusError);
                }
            }

            // Return info about the new item
            return {
                action: 'created',
                orderItemId: newItem.id,
                newQuantity: item.quantity,
                childOrderItemIds
            };

        } catch (err: any) {
            console.error('Error adding item to order:', err);
            throw err;
        }
        };

        return enqueueOrderOperation(run);
    }, [businessId, userId, fetchTableOrder, enqueueOrderOperation]);

    // Remove item
    const removeOrderItem = useCallback((tableId: string, orderItemId: string) => {
        const run = async () => {
        // OFFLINE: mutar el snapshot local; si queda vacio, liberar la mesa (Req 7.3).
        if (await isRealOffline()) {
            if (!esEjeLocal(businessId, userId)) return READ_ONLY_RESULT;
            return await quitarItemOffline(tableId, orderItemId);
        }

        try {
            const { error } = await supabase
                .from('order_items')
                .delete()
                .eq('id', orderItemId);

            if (error) {
                throw error;
            }

            // Check if order is empty
            const order = await fetchTableOrder(tableId);

            if (order && (!order.items || order.items.length === 0)) {
                // Unlink table
                await supabase
                    .from('tables')
                    .update({
                        current_order_id: null,
                        status: 'available'
                    })
                    .eq('id', tableId);

                // Delete the empty order
                await supabase.from('orders').delete().eq('id', order.id);

                await deleteTableOrder(tableId);
                window.dispatchEvent(new CustomEvent('offline-tables-updated'));

                return null;
            }

            return order;
        } catch (err: any) {
            console.error('[removeOrderItem] Error:', err);
            throw err;
        }
        };

        return enqueueOrderOperation(run);
    }, [businessId, userId, fetchTableOrder, enqueueOrderOperation]);

    // Generic add item to order by ID (bypassing table lookup)
    const addItemToOrderById = useCallback(async (orderId: string, item: any, options?: { forceSplit?: boolean }) => {
        if (!businessId || !userId) return null;

        // OFFLINE: resolver el snapshot por su order_id y mutarlo (Req 7.1, 7.2).
        if (await isRealOffline()) {
            if (!esEjeLocal(businessId, userId)) return READ_ONLY_RESULT;
            const cached = await getTableOrderByOrderId(orderId);
            if (!cached) return null;
            return await agregarItemOffline(cached.table_id, item, options?.forceSplit || false);
        }

        try {
            // Check if same product with same customizations already exists
            const { data: existingItems, error: itemsError } = await supabase
                .from('order_items')
                .select('*')
                .eq('order_id', orderId);

            if (itemsError) throw itemsError;

            // NEW: Fetch order status first to use as fallback lock
            const { data: currentOrder } = await supabase
                .from('orders')
                .select('status')
                .eq('id', orderId)
                .single();

            // Strict status check for "Locked" items
            const isOrderReady = ['ready', 'served', 'completed', 'delivered'].includes((currentOrder?.status || '').toLowerCase());
            const forceSplit = options?.forceSplit || false;

            logger.log(`[addItemToOrderById] 🔄 Processing Add:`, {
                orderId,
                status: currentOrder?.status,
                isOrderReady,
                forceSplit,
                itemName: item.name,
                itemQty: item.quantity
            });

            // LOG SUPABASE RESPONSE for User Debugging
            logger.log(`[Supabase DEBUG] 🔎 Searching for existing items in Order: ${orderId}`);
            logger.log(`[Supabase DEBUG] 📦 Found ${existingItems?.length || 0} items total.`);
            if (existingItems && existingItems.length > 0) {
                existingItems.forEach((it, idx) => {
                    logger.log(`[Supabase DEBUG] Item #${idx}: ${it.product_name} | Status: "${it.status}" | ID: ${it.id}`);
                });
            } else {
                logger.log(`[Supabase DEBUG] No items found in this order.`);
            }

            // Find match
            // Find match with "Blind Filter" Logic
            // Rule: Only merge if item is STRICTLY 'pending'. 
            // If the ORDER is ready/completed, do NOT merge (safety net).
            const existingItem = existingItems?.find((orderItem: any) => {
                // Safety check: if the ORDER itself is marked ready/completed, assume all items are locked.
                if (isOrderReady) return false;
                // Nunca mergear si esta línea lleva add-ons, ni contra una línea hija (add-on).
                if (item.addedModifiers?.length) return false;
                if (orderItem.parent_order_item_id) return false;

                const isSameProduct = orderItem.product_id === item.product_id;
                const isSameNotes = orderItem.notes === (item.notes || null);
                const isSameTerm = orderItem.cooking_term === (item.cooking_term || null);
                const isSameRemoved = JSON.stringify(orderItem.removed_ingredients || []) === JSON.stringify(item.removed_ingredients || []);

                return (
                    !forceSplit &&
                    isSameProduct &&
                    isSameNotes &&
                    isSameTerm &&
                    isSameRemoved &&
                    // STRICT CHECK: Only merge if 'pending'. 
                    // This separates new items from ANY previously processed batch (ready, served, preparing, etc).
                    (orderItem.status === 'pending')
                );
            });

            if (existingItem) {
                logger.log(`[addItemToOrderById] ⚡ Merging into existing item ${existingItem.id}`);
                // Update quantity
                const newQuantity = existingItem.quantity + item.quantity;
                const { error: updateError } = await supabase
                    .from('order_items')
                    .update({
                        quantity: newQuantity,
                        total_price: Math.round(item.price * newQuantity)
                    })
                    .eq('id', existingItem.id);

                if (updateError) throw updateError;

                // NEW: Revert order status on update too
                // (Only if order was completed/ready but we modified a pending item - rare case but possible)
                if (currentOrder && (currentOrder.status === 'ready' || currentOrder.status === 'served' || currentOrder.status === 'completed')) {
                    logger.log('[addItemToOrderById] Reverting order status to preparing');
                    await supabase
                        .from('orders')
                        .update({
                            status: 'preparing',
                            last_confirmed_at: new Date().toISOString(),
                            dispatched_at: null
                        })
                        .eq('id', orderId);
                }

                return {
                    action: 'updated',
                    orderItemId: existingItem.id,
                    newQuantity
                };
            } else {
                logger.log(`[addItemToOrderById] 🆕 Creating NEW item (Split/New)`);
                // Create new item
                const { data: newItem, error: itemError } = await supabase
                    .from('order_items')
                    .insert({
                        order_id: orderId,
                        product_id: item.product_id,
                        promotion_id: item.promotion_id || null,
                        product_name: item.name,
                        quantity: item.quantity,
                        unit_price: item.price,
                        total_price: Math.round(item.price * item.quantity),
                        notes: item.notes,
                        cooking_term: item.cooking_term,
                        removed_ingredients: item.removed_ingredients || [],
                        status: 'pending' // ALWAYS Pending on new insert
                    })
                    .select('id')
                    .single();

                if (itemError) throw itemError;

                // Add-ons: crear una línea hija por cada producto-modificador, vinculada al padre.
                let childOrderItemIds: string[] = [];
                if (item.addedModifiers?.length) {
                    const childrenRows = item.addedModifiers.map((m: any) => ({
                        order_id: orderId,
                        product_id: m.id,
                        product_name: m.name,
                        quantity: item.quantity,
                        unit_price: m.price,
                        total_price: Math.round((m.price || 0) * item.quantity),
                        status: 'pending',
                        parent_order_item_id: newItem.id
                    }));
                    const { data: children, error: childErr } = await supabase
                        .from('order_items')
                        .insert(childrenRows)
                        .select('id');
                    if (childErr) {
                        await supabase.from('order_items').delete().eq('id', newItem.id);
                        throw childErr;
                    }
                    childOrderItemIds = (children || []).map((c: any) => c.id);
                }

                // NEW: Revert order status to 'preparing' so it shows up in kitchen again
                if (currentOrder && (currentOrder.status === 'ready' || currentOrder.status === 'served' || currentOrder.status === 'completed')) {
                    logger.log('[addItemToOrderById] Reverting order status to preparing (New Item)');
                    await supabase
                        .from('orders')
                        .update({
                            status: 'preparing',
                            last_confirmed_at: new Date().toISOString(),
                            dispatched_at: null
                        })
                        .eq('id', orderId);
                }

                return {
                    action: 'created',
                    orderItemId: newItem.id,
                    newQuantity: item.quantity,
                    childOrderItemIds
                };
            }

        } catch (err: any) {
            console.error('Error adding item to order by ID:', err);
            throw err;
        }
    }, [businessId, userId]);

    // Update item quantity (Table version)
    const updateOrderItemQuantity = useCallback((tableId: string, orderItemId: string, newQuantity: number) => {
        const run = async () => {
            // OFFLINE: mutar el snapshot; cantidad <= 0 equivale a quitar el item.
            if (await isRealOffline()) {
                if (!esEjeLocal(businessId, userId)) return READ_ONLY_RESULT;
                if (newQuantity <= 0) return await quitarItemOffline(tableId, orderItemId);
                return await actualizarCantidadOffline(tableId, orderItemId, newQuantity);
            }

            try {
                if (newQuantity <= 0) {
                    return await removeOrderItem(tableId, orderItemId);
                }

                const { error } = await supabase
                    .from('order_items')
                    .update({ quantity: newQuantity })
                    .eq('id', orderItemId);

                if (error) throw error;
                return await fetchTableOrder(tableId);
            } catch (err) {
                console.error('Error updating quantity:', err);
                throw err;
            }
        };

        return enqueueOrderOperation(run);
    }, [businessId, userId, fetchTableOrder, removeOrderItem, enqueueOrderOperation]);

    // Helper: Clean up empty orders and free their tables
    const cleanupIfEmpty = useCallback(async (orderId: string) => {
        try {
            // Count remaining items
            const { count, error: countError } = await supabase
                .from('order_items')
                .select('*', { count: 'exact', head: true })
                .eq('order_id', orderId);

            if (countError) {
                console.error('[cleanupIfEmpty] Count error:', countError);
                return;
            }

            if (count === 0) {
                logger.log('[cleanupIfEmpty] Order is empty, cleaning up:', orderId);

                // Get order to find table_id
                const { data: order } = await supabase
                    .from('orders')
                    .select('table_id')
                    .eq('id', orderId)
                    .single();

                // Free the table if linked
                if (order?.table_id) {
                    await supabase
                        .from('tables')
                        .update({ current_order_id: null, status: 'available' })
                        .eq('id', order.table_id);
                    logger.log('[cleanupIfEmpty] Table freed:', order.table_id);
                    await deleteTableOrder(order.table_id);
                    window.dispatchEvent(new CustomEvent('offline-tables-updated'));
                }

                // Delete the empty order
                await supabase.from('orders').delete().eq('id', orderId);
                logger.log('[cleanupIfEmpty] Empty order deleted:', orderId);
            }
        } catch (err) {
            console.error('[cleanupIfEmpty] Error:', err);
        }
    }, []);

    // Generic remove item by ID (bypassing table lookup)
    const removeOrderItemById = useCallback(async (orderItemId: string) => {
        // OFFLINE: localizar el snapshot que contiene el item y quitarlo (Req 7.3).
        if (await isRealOffline()) {
            if (!esEjeLocal(businessId, userId)) return READ_ONLY_RESULT;
            const cached = await getTableOrderByItemId(orderItemId);
            if (cached) await quitarItemOffline(cached.table_id, orderItemId);
            return true;
        }

        try {
            // Get order_id before deleting
            const { data: itemData } = await supabase
                .from('order_items')
                .select('order_id')
                .eq('id', orderItemId)
                .single();

            const orderId = itemData?.order_id;

            // Delete item
            const { error, data } = await supabase
                .from('order_items')
                .delete()
                .eq('id', orderItemId)
                .select();

            if (error) {
                throw error;
            }

            // Clean up if order is now empty
            if (orderId) {
                await cleanupIfEmpty(orderId);
            }

            return true;
        } catch (err: any) {
            console.error('[removeOrderItemById] Error:', err);
            throw err;
        }
    }, [businessId, userId, cleanupIfEmpty]);

    // Generic update item quantity by ID (bypassing table lookup)
    const updateOrderItemQuantityById = useCallback(async (orderItemId: string, newQuantity: number) => {
        // OFFLINE: localizar el snapshot por el item y actualizar su cantidad.
        if (await isRealOffline()) {
            if (!esEjeLocal(businessId, userId)) return READ_ONLY_RESULT;
            const cached = await getTableOrderByItemId(orderItemId);
            if (cached) {
                if (newQuantity <= 0) {
                    await quitarItemOffline(cached.table_id, orderItemId);
                } else {
                    await actualizarCantidadOffline(cached.table_id, orderItemId, newQuantity);
                }
            }
            return true;
        }

        try {
            if (newQuantity <= 0) {
                return removeOrderItemById(orderItemId);
            }

            const { error } = await supabase
                .from('order_items')
                .update({ quantity: newQuantity })
                .eq('id', orderItemId);

            if (error) throw error;

            // NEW: Revert order status to 'preparing' if it was ready
            // We need to find the order_id first
            const { data: itemData } = await supabase
                .from('order_items')
                .select('order_id')
                .eq('id', orderItemId)
                .single();

            if (itemData && itemData.order_id) {
                const { data: currentOrder } = await supabase
                    .from('orders')
                    .select('status')
                    .eq('id', itemData.order_id)
                    .single();

                if (currentOrder && (currentOrder.status === 'ready' || currentOrder.status === 'served' || currentOrder.status === 'completed')) {
                    await supabase
                        .from('orders')
                        .update({
                            status: 'preparing',
                            last_confirmed_at: new Date().toISOString(),
                            dispatched_at: null
                        })
                        .eq('id', itemData.order_id);
                }
            }

            return true;
        } catch (err) {
            console.error('Error updating quantity by ID:', err);
            throw err;
        }
    }, [businessId, userId, removeOrderItemById]);

    // Confirm Order (Notify Kitchen) - also sets status to 'preparing'
    const confirmOrder = useCallback(async (orderId: string) => {
        // OFFLINE: marcar los items locales pending -> preparing en el snapshot,
        // sin tocar Supabase (Req 11.2). La impresion local la resuelve el modal.
        if (await isRealOffline()) {
            if (!esEjeLocal(businessId, userId)) return READ_ONLY_RESULT;
            const cached = await getTableOrderByOrderId(orderId);
            if (!cached) return true;
            cached.items = cached.items.map((ci) =>
                ci.status === 'pending' ? { ...ci, status: 'preparing' } : ci
            );
            cached.dirty = true;
            await saveTableOrder(cached);
            return true;
        }

        try {
            logger.log('[confirmOrder] 🍳 Confirming Order:', orderId);
            const { error } = await supabase
                .from('orders')
                .update({
                    last_confirmed_at: new Date().toISOString(),
                    status: 'preparing', // Cambiar a preparing para que aparezca en la pantalla de Órdenes
                    dispatched_at: null // Limpiar despacho para que pase por "Listos"
                })
                .eq('id', orderId);

            if (error) throw error;

            logger.log('[confirmOrder] ✅ Confirmed (Status set to preparing + delivery info reset)');
            return true;
        } catch (err) {
            console.error('[confirmOrder] ❌ Error:', err);
            throw err;
        }
    }, [businessId, userId]);

    // Sync Order Items (Robusta: Diff de carrito vs BD)
    const syncOrderItems = useCallback(async (orderId: string, cartItems: any[]) => {
        if (!businessId || !userId) return;

        try {
            logger.log('[syncOrderItems] 🔄 Starting sync for order:', orderId);
            logger.log('[syncOrderItems] Cart items count:', cartItems.length);

            // 1. Obtener items actuales de la BD
            const { data: dbItems, error: fetchError } = await supabase
                .from('order_items')
                .select('*')
                .eq('order_id', orderId);

            if (fetchError) throw fetchError;

            // 2. Identificar cambios
            const currentDbItems = dbItems || [];
            logger.log('[syncOrderItems] DB items count:', currentDbItems.length);

            // A. Items a Eliminar: Estan en BD pero no en el carrito (por ID de item o matching)
            const cartItemIds = cartItems
                .map(i => i.orderItemId)
                .filter(id => id && !id.toString().startsWith('temp-'));

            const itemsToDelete = currentDbItems.filter(dbItem =>
                !cartItemIds.includes(dbItem.id)
            );

            // B. Categorizar items del carrito en: Nuevos vs Actualizaciones
            const itemsToInsert: any[] = [];
            const itemsToUpdate: any[] = [];

            for (const item of cartItems) {
                if (item.orderItemId && !item.orderItemId.toString().startsWith('temp-')) {
                    // Check existing status in DB
                    const dbItem = currentDbItems.find(i => i.id === item.orderItemId);

                    if (dbItem) {
                        // Is the item considered "cooked/ready" in kitchen terms?
                        const isCooked = ['ready', 'served', 'completed', 'delivered'].includes((dbItem.status || '').toLowerCase());

                        // Check if we need to split (quantity increased on a cooked item)
                        if (isCooked && item.quantity > dbItem.quantity) {
                            const diff = item.quantity - dbItem.quantity;
                            logger.log(`[syncOrderItems] ⚠️ SPLIT REQUIRED for Item ${dbItem.id} (${dbItem.product_name}). Status="${dbItem.status}". NewQty=${item.quantity}, OldQty=${dbItem.quantity}. Diff=${diff}`);

                            // 1. Create NEW partial item for the difference (PENDING status)
                            itemsToInsert.push({
                                order_id: orderId,
                                product_id: item.id.toString().startsWith('promo_') ? null : item.id.toString(),
                                promotion_id: item.id.toString().startsWith('promo_') ? item.id.toString().replace('promo_', '') : null,
                                product_name: item.name,
                                quantity: diff,
                                unit_price: item.price,
                                total_price: Math.round(item.price * diff),
                                notes: item.notes,
                                cooking_term: item.cookingTerm,
                                removed_ingredients: item.removedIngredients || [],
                                status: 'pending' // ALWAYS pending for new parts
                            });

                            // 2. Update existing confirmed part (KEEP ORIGINAL STATUS & QUANTITY)
                            // We do NOT update quantity here, effectively "locking" the cooked portion
                            itemsToUpdate.push({
                                id: item.orderItemId,
                                quantity: dbItem.quantity, // Keep old quantity
                                total_price: dbItem.total_price, // Keep old price
                                notes: item.notes, // Notes can update
                                cooking_term: item.cookingTerm,
                                removed_ingredients: item.removedIngredients || []
                                // Status untouched
                            });
                        } else if (isCooked && item.quantity < dbItem.quantity) {
                            // Quantity reduced on cooked item - assume removed/returned
                            logger.log(`[syncOrderItems] 📉 Quantity reduced for cooked item ${dbItem.id}. ${dbItem.quantity} -> ${item.quantity}`);
                            itemsToUpdate.push({
                                id: item.orderItemId,
                                quantity: item.quantity,
                                total_price: Math.round(item.price * item.quantity),
                                notes: item.notes,
                                cooking_term: item.cookingTerm,
                                removed_ingredients: item.removedIngredients || []
                                // Status untouched
                            });
                        } else {
                            // Normal update (pending/preparing OR quantity unchanged on cooked)
                            // logger.log(`[syncOrderItems] Normal update for item ${dbItem.id} (${item.name}). Status="${dbItem.status}"`);
                            itemsToUpdate.push({
                                id: item.orderItemId,
                                quantity: item.quantity,
                                total_price: Math.round(item.price * item.quantity),
                                notes: item.notes,
                                cooking_term: item.cookingTerm,
                                removed_ingredients: item.removedIngredients || []
                            });
                        }
                    } else {
                        // Fallback if DB item not found (rare race condition)
                        console.warn(`[syncOrderItems] Item ${item.orderItemId} not found in DB items! Treating as insert.`);
                        itemsToInsert.push({
                            order_id: orderId,
                            product_id: item.id.toString().startsWith('promo_') ? null : item.id.toString(),
                            promotion_id: item.id.toString().startsWith('promo_') ? item.id.toString().replace('promo_', '') : null,
                            product_name: item.name,
                            quantity: item.quantity,
                            unit_price: item.price,
                            total_price: Math.round(item.price * item.quantity),
                            notes: item.notes,
                            cooking_term: item.cookingTerm,
                            removed_ingredients: item.removedIngredients || [],
                            status: 'pending'
                        });
                    }
                } else {
                    // Es nuevo -> Insert
                    logger.log(`[syncOrderItems] 🆕 New item detected: ${item.name} (${item.quantity})`);
                    itemsToInsert.push({
                        order_id: orderId,
                        product_id: item.id.toString().startsWith('promo_') ? null : item.id.toString(),
                        promotion_id: item.id.toString().startsWith('promo_') ? item.id.toString().replace('promo_', '') : null,
                        product_name: item.name,
                        quantity: item.quantity,
                        unit_price: item.price,
                        total_price: Math.round(item.price * item.quantity),
                        notes: item.notes,
                        cooking_term: item.cookingTerm,
                        removed_ingredients: item.removedIngredients || [],
                        status: 'pending' // Entra como pendiente a cocina
                    });
                }
            }

            logger.log('[syncOrderItems] 📝 Execution Plan:', {
                delete: itemsToDelete.length,
                update: itemsToUpdate.length,
                insert: itemsToInsert.length
            });

            // 3. Ejecutar operaciones (Secuencial para evitar race conditions simples)

            // Delete
            if (itemsToDelete.length > 0) {
                const { error: delError } = await supabase
                    .from('order_items')
                    .delete()
                    .in('id', itemsToDelete.map(i => i.id));
                if (delError) {
                    console.error('[syncOrderItems] Error deleting:', delError);
                    throw delError;
                }
            }

            // Update
            for (const update of itemsToUpdate) {
                const { error: upError } = await supabase
                    .from('order_items')
                    .update({
                        quantity: update.quantity,
                        total_price: update.total_price,
                        notes: update.notes,
                        cooking_term: update.cooking_term,
                        removed_ingredients: update.removed_ingredients
                        // No cambiamos status al editar, mantenemos el que tenga
                    })
                    .eq('id', update.id);
                if (upError) {
                    console.error('[syncOrderItems] Error updating:', upError);
                    throw upError;
                }
            }

            // Insert
            if (itemsToInsert.length > 0) {
                const { error: insError } = await supabase
                    .from('order_items')
                    .insert(itemsToInsert);
                if (insError) {
                    console.error('[syncOrderItems] Error inserting:', insError);
                    throw insError;
                }
            }

            logger.log('[syncOrderItems] ✅ Sync completed successfully');

            // Clean up if order became empty after sync
            await cleanupIfEmpty(orderId);

            return true;

        } catch (err) {
            console.error('Error syncing order items:', err);
            throw err;
        }
    }, [businessId, userId, cleanupIfEmpty]);

    return {
        orders,
        loading,
        error,
        createOrder,
        deleteOrder,
        voidOrder,
        deleteOrderItem,
        voidOrderItem,
        updateOrderItem,
        refetch: fetchOrders,
        fetchTableOrder,
        addItemToOrder,
        addItemToOrderById,
        removeOrderItem,
        updateOrderItemQuantity,
        confirmOrder,
        syncOrderItems,
        removeOrderItemById,
        updateOrderItemQuantityById
    };
}
