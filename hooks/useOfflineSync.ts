import { useState, useEffect, useCallback, useRef } from 'react';
import { offlineQueue, OfflineTransaction } from '../lib/offlineQueue';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { logger } from '../lib/logger';
import { setOfflineClientMapping, resolveOfflineClientId, isOfflineClientId } from '../lib/offlineClientMap';
import {
    setOfflineTableMapping, resolveOfflineTableId, isOfflineTableId,
    setOfflineRoomMapping, resolveOfflineRoomId,
} from '../lib/offlineTableMap';
import { emitEjeTableSyncCompleted } from '../lib/tableReloadSignal';
import { getAllDirtyTableOrders, saveTableOrder, type CachedTableOrder } from '../lib/offlineTableStore';

const CLIENTS_CACHE_KEY = 'bistro_clients_cache';

export const useOfflineSync = () => {
    const { profile } = useAuth();
    const [isOnline, setIsOnline] = useState(true);
    const [pendingTransactions, setPendingTransactions] = useState<OfflineTransaction[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncResult, setLastSyncResult] = useState<{ synced: number; failed: number } | null>(null);
    const syncingRef = useRef(false);
    const offlineDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isOnlineRef = useRef(true);
    const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Debounce: transiciones a offline se retrasan 2s, a online son inmediatas
    const setOnlineDebounced = useCallback((value: boolean) => {
        if (offlineDebounceRef.current) {
            clearTimeout(offlineDebounceRef.current);
            offlineDebounceRef.current = null;
        }
        if (value) {
            isOnlineRef.current = true;
            setIsOnline(true);
        } else {
            offlineDebounceRef.current = setTimeout(() => {
                isOnlineRef.current = false;
                setIsOnline(false);
            }, 2000);
        }
    }, []);

    const refreshPending = useCallback(async () => {
        const pending = await offlineQueue.getAll();
        setPendingTransactions(pending);
    }, []);

    // Active Connectivity Check
    useEffect(() => {
        let resumeTimer: ReturnType<typeof setTimeout> | null = null;

        // Detección híbrida (alineada con la doc de Chrome/MDN):
        // 1. navigator.onLine === false es 100% fiable → offline inmediato.
        // 2. navigator.onLine === true NO garantiza internet (adaptadores
        //    virtuales tipo Hyper-V/WSL/Docker/cloudflared mantienen onLine=true,
        //    Chromium #231912) → se confirma con una sonda real a Supabase.
        //    mode 'no-cors' evita falsos positivos por CORS (solo un fallo de
        //    red real rechaza la promesa).
        const checkRealInternet = async (): Promise<boolean> => {
            if (!navigator.onLine) return false;

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), navigator.onLine ? 3000 : 5000);
            try {
                await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, {
                    method: 'HEAD',
                    mode: 'no-cors',
                    cache: 'no-store',
                    signal: controller.signal,
                });
                return true;
            } catch {
                return false;
            } finally {
                clearTimeout(timer);
            }
        };

        const verifyConnection = async () => {
            const hasRealInternet = await checkRealInternet();
            // Si la sonda falla pero el tab está en background, ignorar: Chrome
            // throttlea timers/fetch en tabs ocultos y puede dar falsos offline.
            if (!hasRealInternet && document.visibilityState !== 'visible') return;
            setOnlineDebounced(hasRealInternet);
        };

        const handleOnline = () => { verifyConnection(); };
        const handleOffline = () => {
            setOnlineDebounced(false);
            logger.log('[OfflineSync] 🔴 Sin conexión (Nativo)');
        };

        // Al volver a la app (tab visible o focus), re-verificar conexión
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                verifyConnection();
                // Segundo chequeo retrasado para redes que tardan en estabilizarse
                if (resumeTimer) clearTimeout(resumeTimer);
                resumeTimer = setTimeout(verifyConnection, 1500);
            }
        };

        const handleFocus = () => {
            verifyConnection();
        };

        const handleQueueUpdated = () => refreshPending();
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('offline-queue-updated', handleQueueUpdated);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);

        verifyConnection();
        refreshPending();

        const schedulePolling = () => {
            pollingRef.current = setTimeout(async () => {
                await verifyConnection();
                schedulePolling();
            }, isOnlineRef.current ? 30000 : 10000);
        };
        schedulePolling();

        return () => {
            if (resumeTimer) clearTimeout(resumeTimer);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('offline-queue-updated', handleQueueUpdated);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
            if (pollingRef.current) clearTimeout(pollingRef.current);
            if (offlineDebounceRef.current) clearTimeout(offlineDebounceRef.current);
        };
    }, [refreshPending, setOnlineDebounced]);

    // Auto-sync cuando vuelve internet
    useEffect(() => {
        if (isOnline && pendingTransactions.length > 0 && !syncingRef.current) {
            syncAll();
        }
    }, [isOnline, pendingTransactions.length]);

    // Auto-sync de MESAS al reconectar: las ediciones de una mesa offline usan
    // snapshot y NO encolan transacciones, así que el efecto de arriba (que
    // depende de pendingTransactions) no las cubre. Aquí, al volver internet,
    // si existe algún snapshot con cambios pendientes (`dirty`) se dispara
    // `syncAll` para materializarlos en Supabase (Req 14.2). Sin esto, lo editado
    // offline en una mesa nunca se subía y se perdía al refrescar del servidor.
    useEffect(() => {
        if (!isOnline || syncingRef.current) return;
        let cancelled = false;
        (async () => {
            try {
                const dirty = await getAllDirtyTableOrders();
                if (!cancelled && dirty.length > 0 && !syncingRef.current) {
                    syncAll();
                }
            } catch { /* no-op */ }
        })();
        return () => { cancelled = true; };
    }, [isOnline]);

    // --- Sincronizadores específicos por Tipo ---

    const syncSale = async (tx: OfflineTransaction): Promise<boolean> => {
        const orderData = tx.payload;
        const businessId = tx.businessId;
        const userId = tx.userId;

        try {
            await offlineQueue.updateStatus(tx.id, 'syncing');

            // Mesas offline: la columna orders.table_id es UUID, así que un
            // offline_table_* debe resolverse a su UUID real ANTES de insertar
            // la orden. Si aún no hay mapping (create_table no se sincronizó),
            // diferir la venta al próximo ciclo sin descartarla (Req 10.4).
            const rawTableId: string | null = orderData.table_id ?? null;
            let realTableId: string | null = rawTableId;
            if (rawTableId && isOfflineTableId(rawTableId)) {
                const resolved = resolveOfflineTableId(rawTableId);
                if (!resolved) {
                    logger.log(`[OfflineSync] ⏳ Venta de mesa diferida: mesa ${rawTableId} sin resolver`);
                    await offlineQueue.updateStatus(tx.id, 'pending');
                    return false;
                }
                realTableId = resolved;
            }

            // Igual que en useSales.createOrder: el descuento total del pedido
            // debe sumar los descuentos por línea (item.discount o el porcentaje
            // por ítem) además del descuento global. Antes se ignoraba lo por
            // línea, dejando total, cash_movements.amount y el reporte de turno
            // inflados.
            const subtotal = orderData.items.reduce(
                (sum: number, item: any) => sum + Math.round(item.unit_price * item.quantity), 0
            );
            const perItemDiscountTotal = orderData.items.reduce((sum: number, item: any) => {
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
            const amountPaid = orderData.amount_paid !== undefined
                ? orderData.amount_paid
                : (orderData.payment_method === 'credit' ? 0 : total);
            const changeAmount = amountPaid > total ? amountPaid - total : 0;
            const paymentStatus = orderData.payment_method === 'credit' ? 'pending' : 'paid';

            const { data: nextOrderNumber, error: rpcError } = await supabase
                .rpc('get_next_order_number', { p_business_id: businessId });

            if (rpcError) throw rpcError;

            const { data: order, error: orderError } = await supabase
                .from('orders')
                .insert({
                    business_id: businessId,
                    order_number: nextOrderNumber,
                    display_number: orderData.display_number || null,
                    table_id: realTableId,
                    client_id: orderData.client_id,
                    waiter_id: userId,
                    customer_name: orderData.customer_name,
                    order_type: orderData.order_type,
                    payment_method: orderData.split_payments ? 'mixed' : orderData.payment_method,
                    payment_status: paymentStatus,
                    status: 'completed',
                    subtotal,
                    discount,
                    discount_type: orderData.discount_type,
                    tax: 0,
                    total,
                    amount_paid: amountPaid,
                    change_amount: changeAmount,
                    split_payments: orderData.split_payments || null,
                    notes: orderData.notes
                        ? `${orderData.notes} [Sincronizado offline - ${new Date(tx.createdAt).toLocaleString()}]`
                        : `[Sincronizado offline - ${new Date(tx.createdAt).toLocaleString()}]`,
                    completed_at: tx.createdAt,
                })
                .select()
                .single();

            if (orderError) throw orderError;

            // `total_price` BRUTO (ver comentario en useSales.createOrder):
            // el trigger `recalculate_order_total` reconstruye subtotal y total
            // desde estos totales y resta el descuento por su cuenta. Guardar
            // el neto acá provocaría doble descuento.
            const orderItems = orderData.items.map((item: any) => ({
                order_id: order.id,
                product_id: item.product_id,
                promotion_id: item.promotion_id || null,
                product_name: item.product_name,
                quantity: item.quantity,
                unit_price: item.unit_price,
                total_price: Math.round(item.unit_price * item.quantity),
                // Antes no se persistían: se perdía el registro del descuento por línea al sincronizar.
                discount: item.discount || 0,
                discount_percent: item.discount_percent || 0,
                notes: item.notes,
                cooking_term: item.cooking_term,
                removed_ingredients: item.removed_ingredients || [],
                status: 'served',
            }));

            const { error: itemsError } = await supabase
                .from('order_items')
                .insert(orderItems);

            if (itemsError) throw itemsError;

            const postTasks: Promise<any>[] = [];

            postTasks.push(
                supabase.rpc('deduct_stock_for_order', { p_order_id: order.id })
                    .then(({ error }) => {
                        if (error) console.error('[OfflineSync] Stock deduction error:', error);
                    }) as Promise<any>
            );

            if (orderData.payment_method !== 'credit') {
                postTasks.push(
                    (async () => {
                        const { data: activeShift } = await supabase
                            .from('cash_shifts')
                            .select('id')
                            .eq('business_id', businessId)
                            .eq('status', 'open')
                            .maybeSingle();

                        if (activeShift) {
                            if (orderData.split_payments && orderData.split_payments.length > 0) {
                                // Pago dividido: un movimiento por método real (no agrupar)
                                const paymentMethodMap: Record<string, string> = {
                                    'Efectivo': 'cash', 'Tarjeta': 'card', 'Nequi': 'nequi',
                                    'Daviplata': 'daviplata', 'Transferencia': 'transfer', 'Otro': 'other',
                                };
                                const movements = orderData.split_payments.map((sp: any) => ({
                                    shift_id: activeShift.id,
                                    created_by: userId,
                                    type: 'sale' as const,
                                    amount: sp.amount,
                                    description: `Venta #${order.order_number} (${sp.method}) (Offline)`,
                                    reference_id: order.id,
                                    reference_type: 'order' as const,
                                    payment_method: paymentMethodMap[sp.method] || sp.method,
                                }));
                                await supabase.from('cash_movements').insert(movements);
                            } else {
                                await supabase.from('cash_movements').insert({
                                    shift_id: activeShift.id,
                                    created_by: userId,
                                    type: 'sale',
                                    amount: total,
                                    description: `Venta #${order.order_number} (Offline)`,
                                    reference_id: order.id,
                                    reference_type: 'order',
                                    payment_method: orderData.payment_method || 'cash',
                                });
                            }
                        }
                    })()
                );
            }

            if (orderData.payment_method === 'credit' && orderData.client_id) {
                postTasks.push(
                    supabase.from('client_transactions').insert({
                        client_id: orderData.client_id!,
                        type: 'debt',
                        amount: total,
                        note: `Venta #${order.order_number} (Offline)`,
                        order_id: order.id,
                        created_by: userId,
                    }).then(({ error }) => {
                        if (error) console.error('[OfflineSync] Credit transaction error:', error);
                    }) as Promise<any>
                );
            }

            await Promise.allSettled(postTasks);

            // Mesas offline: liberar la mesa cobrada y detectar posible doble
            // cobro (Req 12.5, 14.3, 14.4). Solo aplica si la venta tenía mesa.
            if (realTableId) {
                try {
                    // Estado actual de la mesa en Supabase.
                    const { data: tableRow } = await supabase
                        .from('tables')
                        .select('status, current_order_id')
                        .eq('id', realTableId)
                        .maybeSingle();

                    // Detección de conflicto: la mesa ya figura liberada
                    // (available + sin orden activa) y existe otra orden completed
                    // reciente para esa mesa que NO es la nuestra → otro dispositivo
                    // ya la cerró (Req 14.3).
                    let conflictoDobleCobro = false;
                    if (tableRow && tableRow.status === 'available' && !tableRow.current_order_id) {
                        const ventanaReciente = new Date(
                            new Date(tx.createdAt).getTime() - 12 * 60 * 60 * 1000
                        ).toISOString();
                        const { data: otrasOrdenes } = await supabase
                            .from('orders')
                            .select('id')
                            .eq('table_id', realTableId)
                            .eq('status', 'completed')
                            .neq('id', order.id)
                            .gte('completed_at', ventanaReciente)
                            .limit(1);
                        conflictoDobleCobro = !!(otrasOrdenes && otrasOrdenes.length > 0);
                    }

                    if (conflictoDobleCobro) {
                        // Conservamos la venta del Eje (es dinero real ya cobrado) pero
                        // la marcamos para auditoría. NO se libera de nuevo la mesa
                        // (ya está available) ni se inserta caja adicional: el único
                        // cash_movement es el que ya registró esta venta arriba.
                        await supabase
                            .from('orders')
                            .update({ notes: `${order.notes} [Posible mesa ya cerrada]` })
                            .eq('id', order.id);

                        logger.log(`[OfflineSync] ⚠️ Posible doble cobro en mesa ${realTableId} (orden ${order.order_number})`);
                        window.dispatchEvent(new CustomEvent('offline-table-sync-conflict', {
                            detail: {
                                tableId: realTableId,
                                orderNumber: order.order_number,
                                message: `La mesa de la venta #${order.order_number} ya había sido cerrada por otro dispositivo. La venta se conservó como registro; revisa que no se haya cobrado dos veces.`,
                            },
                        }));
                    } else {
                        // Si la mesa tenía una orden pendiente (p. ej. materializada
                        // en una sincronización previa), eliminarla para no dejar
                        // órdenes huérfanas — igual que el cobro online.
                        if (tableRow?.current_order_id && tableRow.current_order_id !== order.id) {
                            await supabase.from('orders').delete().eq('id', tableRow.current_order_id);
                        }
                        // Liberar la mesa: disponible y sin orden activa (Req 12.5).
                        const { error: releaseError } = await supabase
                            .from('tables')
                            .update({ status: 'available', current_order_id: null })
                            .eq('id', realTableId);
                        if (releaseError) {
                            console.error('[OfflineSync] Error liberando mesa:', releaseError);
                        }
                    }
                } catch (tableErr) {
                    // No abortamos la venta por un fallo al liberar la mesa: la venta
                    // (dinero real) ya quedó registrada. Se registra el error para revisión.
                    console.error('[OfflineSync] Error procesando liberación de mesa:', tableErr);
                }
            }

            await offlineQueue.remove(tx.id);
            logger.log(`[OfflineSync] ✅ Venta sincronizada: ${order.order_number}`);
            return true;
        } catch (err) {
            console.error(`[OfflineSync] ❌ Error sincronizando venta:`, err);
            await offlineQueue.updateStatus(tx.id, 'failed');
            return false;
        }
    };

    const syncExpense = async (tx: OfflineTransaction): Promise<boolean> => {
        const data = tx.payload;
        try {
            await offlineQueue.updateStatus(tx.id, 'syncing');

            const expenseData = {
                business_id: tx.businessId,
                amount: data.amount,
                description: data.description || '',
                category: (data.category || 'GENERAL').toUpperCase(),
                payment_method: data.payment_method || 'cash',
                expense_date: data.date || data.createdAt || new Date().toISOString(),
                supplier_id: data.supplier_id || null,
                supplier_name: data.supplier_name || data.creditorName || null,
                created_by: tx.userId,
                created_at: data.createdAt || new Date().toISOString(),
            };

            const { data: expense, error: expenseErr } = await supabase
                .from('expenses')
                .insert(expenseData)
                .select()
                .single();

            if (expenseErr) throw expenseErr;

            // Registrar movimiento de caja si aplica
            if (data.deductFromCashRegister) {
                const { data: activeShiftData } = await supabase
                    .from('cash_shifts')
                    .select('id')
                    .eq('business_id', tx.businessId)
                    .eq('status', 'open')
                    .maybeSingle();

                if (activeShiftData) {
                    const expenseDesc = expense.description
                        ? `Gasto: ${expense.category} - ${expense.description}`
                        : `Gasto: ${expense.category}`;
                    const payments = data.payments;

                    if (payments && payments.length > 0) {
                        const movements = payments.map((p: any) => ({
                            shift_id: activeShiftData.id,
                            created_by: tx.userId,
                            type: 'expense',
                            amount: parseFloat(p.amount) || 0,
                            description: expenseDesc,
                            reference_id: expense.id,
                            reference_type: 'expense',
                            payment_method: p.mappedId || 'cash',
                        }));
                        await supabase.from('cash_movements').insert(movements);
                    } else {
                        await supabase.from('cash_movements').insert({
                            shift_id: activeShiftData.id,
                            created_by: tx.userId,
                            type: 'expense',
                            amount: data.amount,
                            description: expenseDesc,
                            reference_id: expense.id,
                            reference_type: 'expense',
                            payment_method: data.payment_method || 'cash',
                        });
                    }
                }
            }

            logger.log(`[OfflineSync] ✅ Gasto sincronizado: ${expense.id}`);
            await offlineQueue.remove(tx.id);
            return true;
        } catch (err) {
            console.error('[OfflineSync] ❌ Error sincronizando expense:', err);
            await offlineQueue.updateStatus(tx.id, 'failed');
            return false;
        }
    };

    const syncOpenShift = async (tx: OfflineTransaction): Promise<boolean> => {
        const { registerId, openingBalance, localShiftId } = tx.payload;
        try {
            await offlineQueue.updateStatus(tx.id, 'syncing');
            const { data: shift, error: shiftErr } = await supabase
                .from('cash_shifts')
                .insert({
                    business_id: tx.businessId,
                    register_id: registerId,
                    opened_by: tx.userId,
                    opening_balance: openingBalance,
                    expected_cash: openingBalance,
                    status: 'open',
                })
                .select('*')
                .single();

            if (shiftErr) throw shiftErr;

            await supabase.from('cash_movements').insert({
                shift_id: shift.id,
                created_by: tx.userId,
                type: 'opening',
                amount: openingBalance,
                description: 'Balance inicial de apertura (Offline)',
            });

            // Reasignar ventas offline que usaron localShiftId → shift.id real
            // (las ventas ya se sincronizan primero, y en su payload no tienen shiftId,
            // la lógica de syncSale busca el activeShift dinámicamente en Supabase)
            logger.log(`[OfflineSync] ✅ Turno sincronizado: ${shift.id} (local: ${localShiftId})`);
            await offlineQueue.remove(tx.id);
            return true;
        } catch (err) {
            console.error('[OfflineSync] ❌ Error sincronizando open_shift:', err);
            await offlineQueue.updateStatus(tx.id, 'failed');
            return false;
        }
    };

    const syncCloseShift = async (tx: OfflineTransaction): Promise<boolean> => {
        const { shiftId, declaredCash, notes } = tx.payload;
        try {
            await offlineQueue.updateStatus(tx.id, 'syncing');

            // Si el shiftId es local (offline), buscar el real por business+opened_by+status
            let realShiftId = shiftId;
            if (typeof shiftId === 'string' && shiftId.startsWith('offline_shift_')) {
                const { data: openShift } = await supabase
                    .from('cash_shifts')
                    .select('id')
                    .eq('business_id', tx.businessId)
                    .eq('opened_by', tx.userId)
                    .eq('status', 'open')
                    .order('opened_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (!openShift) {
                    logger.log('[OfflineSync] ⚠️ No se encontró turno abierto para cerrar. Se omite.');
                    await offlineQueue.remove(tx.id);
                    return true;
                }
                realShiftId = openShift.id;
            }

            const { data, error } = await supabase.rpc('close_cash_shift', {
                p_shift_id: realShiftId,
                p_declared_cash: declaredCash,
                p_notes: notes || null,
                p_declared_by_method: tx.payload.declaredByMethod || {},
            });

            if (error) throw error;
            if (!data.success) throw new Error(data.error || 'Error al cerrar turno');

            logger.log(`[OfflineSync] ✅ Turno cerrado: ${realShiftId}`);
            await offlineQueue.remove(tx.id);
            return true;
        } catch (err) {
            console.error('[OfflineSync] ❌ Error sincronizando close_shift:', err);
            await offlineQueue.updateStatus(tx.id, 'failed');
            return false;
        }
    };

    // Sincronizador NUEVO (feature escaneo-factura-unificado): el item de la cola
    // trae `rpc_payload` = RegisterPurchasePayload ya armado en el cliente al
    // encolar. Sincronizar = una sola llamada transaccional al motor. El
    // idempotency_key viaja DENTRO del payload (se generó al encolar), así un
    // reintento reusa la misma clave y el motor reconoce el duplicado (Req 12.9).
    const syncInventoryPurchase = async (tx: OfflineTransaction): Promise<boolean> => {
        // Compatibilidad hacia atrás: los items encolados por la versión anterior
        // NO traen `rpc_payload`; se procesan con la lógica legado aislada abajo.
        if (!tx.payload?.rpc_payload) {
            return syncLegacyInventoryPurchase(tx);
        }

        try {
            await offlineQueue.updateStatus(tx.id, 'syncing');

            const { data, error } = await supabase.rpc('register_purchase', {
                p_payload: tx.payload.rpc_payload,
            });

            // Error de transporte/red: es TRANSITORIO. Se marca 'failed' para que
            // el próximo ciclo de sincronización lo reintente. La idempotencia
            // cubre el caso de un COMMIT cuya respuesta HTTP se perdió: el
            // reintento reusa la misma clave y el motor devuelve el resultado
            // original marcado como ya procesado, sin duplicar la compra (Req 12.9).
            if (error) {
                console.error('[OfflineSync] ⚠️ Error de red en register_purchase (se reintentará):', error);
                await offlineQueue.updateStatus(tx.id, 'failed');
                return false;
            }

            const result = data as { ok?: boolean; code?: string; already_processed?: boolean } | null;

            // Éxito, incluido already_processed:true → la compra quedó aplicada
            // exactamente una vez. Se quita de la cola.
            if (result?.ok) {
                logger.log('[OfflineSync] ✅ Compra de inventario sincronizada (register_purchase)');
                await offlineQueue.remove(tx.id);
                return true;
            }

            // ok:false → rechazo DEFINITIVO del motor (product_not_found,
            // business_mismatch, supplier_not_found, shift_invalid, overpayment,
            // invalid_payload, forbidden…). Reintentar no cambia el resultado, así
            // que se DESCARTA para no dejar la cola atascada en un bucle de fallos
            // perpetuo (a diferencia del error de red, que sí es transitorio). Se
            // registra y se emite un evento para que la incidencia sea visible; el
            // stock optimista ya se había reflejado en IndexedDB al encolar.
            console.error(`[OfflineSync] ❌ register_purchase rechazó la compra (code=${result?.code}). Se descarta de la cola.`);
            window.dispatchEvent(new CustomEvent('offline-purchase-rejected', {
                detail: { code: result?.code ?? 'unknown', txId: tx.id },
            }));
            await offlineQueue.remove(tx.id);
            return false;
        } catch (err) {
            console.error('[OfflineSync] ❌ Error sincronizando inventory_purchase:', err);
            await offlineQueue.updateStatus(tx.id, 'failed');
            return false;
        }
    };

    // Sincronizador LEGADO: procesa items encolados por la versión ANTERIOR
    // (formato `{ items, totalAmount, creditorName, ... }` sin `rpc_payload`).
    // Reimplementa la compra desde el cliente. Se conserva AISLADO para no romper
    // items viejos que quedaran en la cola; los items nuevos ya no pasan por aquí.
    const syncLegacyInventoryPurchase = async (tx: OfflineTransaction): Promise<boolean> => {
        const data = tx.payload;
        try {
            await offlineQueue.updateStatus(tx.id, 'syncing');

            for (const item of data.items) {
                const qty = item.quantity;
                const itemTotal = item.totalAmount;
                const unitCost = qty > 0 ? itemTotal / qty : item.unitCost;

                // 1. Leer stock actual antes de incrementar (para calibrar remaining_quantity del lote)
                const { data: productBefore } = await supabase
                    .from('products')
                    .select('stock')
                    .eq('id', item.productId)
                    .single();
                const stockBefore = productBefore?.stock ?? 0;

                // 2. Actualizar stock del producto (atómico para evitar race condition en sync concurrente)
                await supabase.rpc('increment_stock', {
                    p_product_id: item.productId,
                    p_quantity: qty,
                });

                // 3. Crear lote de inventario
                let lotId: string | undefined;
                const { data: lotData } = await supabase
                    .from('inventory_lots')
                    .insert({
                        business_id: tx.businessId,
                        product_id: item.productId,
                        initial_quantity: qty,
                        remaining_quantity: Math.max(0, qty + Math.min(0, stockBefore)),
                        unit_cost: unitCost,
                        purchase_date: data.date,
                        supplier_name: data.creditorName || null,
                    })
                    .select('id')
                    .single();

                lotId = lotData?.id;

                // 3. Registrar deuda/compra en business_debts
                if (itemTotal > 0) {
                    const isCredit = data.isCredit;
                    const paidAmount = isCredit
                        ? Math.round((data.paidAmount || 0) * (data.items.length > 1 ? itemTotal / data.totalAmount : 1))
                        : itemTotal;

                    await supabase.from('business_debts').insert({
                        business_id: tx.businessId,
                        type: 'supplier',
                        creditor_name: data.creditorName || 'Proveedor de Contado',
                        description: isCredit
                            ? `Compra a crédito: ${item.productName} (${qty} ${item.unit})`
                            : `Compra de contado: ${item.productName} (${qty} ${item.unit})`,
                        total_amount: itemTotal,
                        paid_amount: paidAmount,
                        status: paidAmount >= itemTotal ? 'paid' : 'active',
                        due_date: data.dueDate || null,
                        inventory_lot_id: lotId || null,
                        evidence_url: data.evidenceUrl ?? null,
                        created_at: data.date,
                        created_by: tx.userId,
                    });
                }
            }

            // 4. Cash movements: si había turno activo y descuentan de caja
            if (data.shiftId && data.deductFromCash && data.payments?.length > 0) {
                // Buscar turno real (puede ser local o real)
                let realShiftId = data.shiftId;
                if (typeof data.shiftId === 'string' && data.shiftId.startsWith('offline_shift_')) {
                    const { data: openShift } = await supabase
                        .from('cash_shifts')
                        .select('id')
                        .eq('business_id', tx.businessId)
                        .eq('opened_by', tx.userId)
                        .eq('status', 'open')
                        .order('opened_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    if (openShift) realShiftId = openShift.id;
                }

                if (realShiftId && !realShiftId.startsWith('offline_')) {
                    for (const payment of data.payments) {
                        await supabase.from('cash_movements').insert({
                            shift_id: realShiftId,
                            created_by: tx.userId,
                            type: 'purchase',
                            amount: Math.abs(parseFloat(payment.amount) || 0),
                            description: `Compra: ${data.items.map((i: any) => i.productName).join(', ')} (Offline)`,
                            payment_method: payment.mappedId || 'cash',
                        });
                    }
                }
            }

            logger.log(`[OfflineSync] ✅ Compra de inventario sincronizada`);
            await offlineQueue.remove(tx.id);
            return true;
        } catch (err) {
            console.error('[OfflineSync] ❌ Error sincronizando inventory_purchase:', err);
            await offlineQueue.updateStatus(tx.id, 'failed');
            return false;
        }
    };

    const syncShrinkage = async (tx: OfflineTransaction): Promise<boolean> => {
        const data = tx.payload;
        try {
            await offlineQueue.updateStatus(tx.id, 'syncing');

            // 1. Reducir stock real en Supabase
            const { data: currentProduct } = await supabase
                .from('products')
                .select('stock')
                .eq('id', data.productId)
                .single();

            const currentStock = currentProduct?.stock ?? 0;
            const newStock = Math.max(0, currentStock - data.quantity);

            await supabase
                .from('products')
                .update({ stock: newStock })
                .eq('id', data.productId);

            // 2. Insertar en wastage
            await supabase.from('wastage').insert({
                business_id: tx.businessId,
                amount: data.amount,
                description: data.description || null,
                reason: (data.reason || 'GENERAL').toUpperCase(),
                product_name: data.productName,
                product_id: data.productId,
                quantity: data.quantity,
                date: data.date,
                created_by: tx.userId,
                created_at: data.date,
            });

            logger.log(`[OfflineSync] ✅ Merma sincronizada: ${data.productName}`);
            await offlineQueue.remove(tx.id);
            return true;
        } catch (err) {
            console.error('[OfflineSync] ❌ Error sincronizando shrinkage:', err);
            await offlineQueue.updateStatus(tx.id, 'failed');
            return false;
        }
    };

    const syncClientPayment = async (tx: OfflineTransaction): Promise<boolean> => {
        const data = tx.payload;
        try {
            await offlineQueue.updateStatus(tx.id, 'syncing');

            // 1. Insertar client_transaction de tipo payment
            const { error: txError } = await supabase
                .from('client_transactions')
                .insert({
                    client_id: data.clientId,
                    type: 'payment',
                    amount: data.amount,
                    note: data.note || null,
                    created_by: tx.userId,
                    created_at: data.date,
                });

            if (txError) throw txError;

            // 2. Actualizar current_debt del cliente leyendo el valor real de Supabase
            const { data: currentClient } = await supabase
                .from('clients')
                .select('current_debt')
                .eq('id', data.clientId)
                .single();

            if (currentClient) {
                const newDebt = Math.max(0, (currentClient.current_debt || 0) - data.amount);
                await supabase
                    .from('clients')
                    .update({ current_debt: newDebt })
                    .eq('id', data.clientId);
            }

            // 3. Si hay turno activo: cash_in en caja (entra dinero del cliente)
            if (data.shiftId) {
                let realShiftId = data.shiftId;
                if (typeof data.shiftId === 'string' && data.shiftId.startsWith('offline_shift_')) {
                    const { data: openShift } = await supabase
                        .from('cash_shifts')
                        .select('id')
                        .eq('business_id', tx.businessId)
                        .eq('opened_by', tx.userId)
                        .eq('status', 'open')
                        .order('opened_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    if (openShift) realShiftId = openShift.id;
                }

                if (realShiftId && !String(realShiftId).startsWith('offline_')) {
                    const methodMap: Record<string, string> = {
                        'Efectivo': 'cash', 'Tarjeta': 'card', 'Nequi': 'nequi',
                        'Daviplata': 'daviplata', 'Transferencia': 'transfer', 'Otro': 'other',
                    };
                    const dbMethod = methodMap[data.paymentMethod] || (data.paymentMethod ? String(data.paymentMethod).toLowerCase() : 'cash');

                    await supabase.from('cash_movements').insert({
                        shift_id: realShiftId,
                        created_by: tx.userId,
                        type: 'cash_in',
                        amount: data.amount,
                        description: `Abono cliente: ${data.clientName}${data.note ? ' · ' + data.note : ''} (Offline)`,
                        payment_method: dbMethod,
                    });
                }
            }

            logger.log(`[OfflineSync] ✅ Abono cliente sincronizado: ${data.clientName}`);
            await offlineQueue.remove(tx.id);
            return true;
        } catch (err) {
            console.error('[OfflineSync] ❌ Error sincronizando client_payment:', err);
            await offlineQueue.updateStatus(tx.id, 'failed');
            return false;
        }
    };

    const syncSupplierPayment = async (tx: OfflineTransaction): Promise<boolean> => {
        const data = tx.payload;
        try {
            await offlineQueue.updateStatus(tx.id, 'syncing');

            // 1. Leer deudas activas del proveedor (más antiguas primero)
            const { data: activeDebts } = await supabase
                .from('business_debts')
                .select('id, total_amount, paid_amount')
                .eq('business_id', tx.businessId)
                .eq('creditor_name', data.creditorName)
                .eq('status', 'active')
                .gt('total_amount', 0)
                .order('created_at', { ascending: true });

            // 2. Distribuir el pago igual que el flujo online
            let remaining = data.amount;
            for (const debt of (activeDebts || [])) {
                if (remaining <= 0) break;
                const owed = debt.total_amount - debt.paid_amount;
                const payment = Math.min(remaining, owed);
                const newPaid = debt.paid_amount + payment;
                const newStatus = newPaid >= debt.total_amount ? 'paid' : 'active';
                await supabase
                    .from('business_debts')
                    .update({ paid_amount: newPaid, status: newStatus })
                    .eq('id', debt.id);
                remaining -= payment;
            }

            // 3. Insertar el registro de abono (total_amount: 0, igual que el online)
            const creditorType = (activeDebts && activeDebts.length > 0) ? 'supplier' : 'supplier';
            await supabase.from('business_debts').insert({
                business_id: tx.businessId,
                type: creditorType,
                creditor_name: data.creditorName,
                description: data.notes ? `Abono: ${data.notes}` : 'Abono',
                total_amount: 0,
                paid_amount: data.amount,
                status: 'paid',
                payment_method: data.paymentMethod || 'Efectivo',
                evidence_url: data.evidenceUrl ?? null,
                created_at: data.date,
                created_by: tx.userId,
            });

            // 4. Si hay turno activo: registrar salida de caja
            if (data.shiftId) {
                let realShiftId = data.shiftId;
                if (typeof data.shiftId === 'string' && data.shiftId.startsWith('offline_shift_')) {
                    const { data: openShift } = await supabase
                        .from('cash_shifts')
                        .select('id')
                        .eq('business_id', tx.businessId)
                        .eq('opened_by', tx.userId)
                        .eq('status', 'open')
                        .order('opened_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    if (openShift) realShiftId = openShift.id;
                }

                if (realShiftId && !String(realShiftId).startsWith('offline_')) {
                    const methodMap: Record<string, string> = {
                        'efectivo': 'cash', 'cash': 'cash',
                        'tarjeta': 'card', 'card': 'card',
                        'nequi': 'nequi',
                        'daviplata': 'daviplata',
                        'transferencia': 'transfer', 'transfer': 'transfer',
                        'otro': 'other', 'other': 'other',
                    };
                    const cleanMethod = (data.paymentMethod ? String(data.paymentMethod).toLowerCase().trim() : 'cash');
                    const dbMethod = methodMap[cleanMethod] || cleanMethod || 'cash';

                    if (dbMethod === 'cash') {
                        await supabase.from('cash_movements').insert({
                            shift_id: realShiftId,
                            created_by: tx.userId,
                            type: 'purchase',
                            amount: data.amount,
                            description: `Abono proveedor: ${data.creditorName}${data.notes ? ' · ' + data.notes : ''} (Offline)`,
                            payment_method: 'cash',
                        });
                    }
                }
            }

            logger.log(`[OfflineSync] ✅ Abono proveedor sincronizado: ${data.creditorName}`);
            await offlineQueue.remove(tx.id);
            return true;
        } catch (err) {
            console.error('[OfflineSync] ❌ Error sincronizando supplier_payment:', err);
            await offlineQueue.updateStatus(tx.id, 'failed');
            return false;
        }
    };

    const syncManualCashIn = async (tx: OfflineTransaction): Promise<boolean> => {
        const data = tx.payload;
        try {
            await offlineQueue.updateStatus(tx.id, 'syncing');

            let realShiftId = data.shiftId;
            if (typeof data.shiftId === 'string' && data.shiftId.startsWith('offline_shift_')) {
                const { data: openShift } = await supabase
                    .from('cash_shifts')
                    .select('id')
                    .eq('business_id', tx.businessId)
                    .eq('opened_by', tx.userId)
                    .eq('status', 'open')
                    .order('opened_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (openShift) realShiftId = openShift.id;
            }

            if (realShiftId && !String(realShiftId).startsWith('offline_')) {
                await supabase.from('cash_movements').insert({
                    shift_id: realShiftId,
                    created_by: tx.userId,
                    type: 'cash_in',
                    amount: data.amount,
                    description: data.description,
                    payment_method: data.paymentMethod || 'cash',
                });
            }

            logger.log(`[OfflineSync] ✅ Entrada de efectivo manual sincronizada`);
            await offlineQueue.remove(tx.id);
            return true;
        } catch (err) {
            console.error('[OfflineSync] ❌ Error sincronizando manual_cash_in:', err);
            await offlineQueue.updateStatus(tx.id, 'failed');
            return false;
        }
    };

    const syncManualCashOut = async (tx: OfflineTransaction): Promise<boolean> => {
        const data = tx.payload;
        try {
            await offlineQueue.updateStatus(tx.id, 'syncing');

            let realShiftId = data.shiftId;
            if (typeof data.shiftId === 'string' && data.shiftId.startsWith('offline_shift_')) {
                const { data: openShift } = await supabase
                    .from('cash_shifts')
                    .select('id')
                    .eq('business_id', tx.businessId)
                    .eq('opened_by', tx.userId)
                    .eq('status', 'open')
                    .order('opened_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (openShift) realShiftId = openShift.id;
            }

            if (realShiftId && !String(realShiftId).startsWith('offline_')) {
                await supabase.from('cash_movements').insert({
                    shift_id: realShiftId,
                    created_by: tx.userId,
                    type: 'cash_out',
                    amount: data.amount,
                    description: data.description,
                    payment_method: data.paymentMethod || 'cash',
                });
            }

            logger.log(`[OfflineSync] ✅ Salida de efectivo manual sincronizada`);
            await offlineQueue.remove(tx.id);
            return true;
        } catch (err) {
            console.error('[OfflineSync] ❌ Error sincronizando manual_cash_out:', err);
            await offlineQueue.updateStatus(tx.id, 'failed');
            return false;
        }
    };

    const syncCreateClient = async (tx: OfflineTransaction): Promise<boolean> => {
        const data = tx.payload;
        try {
            await offlineQueue.updateStatus(tx.id, 'syncing');

            const { data: newClient, error } = await supabase
                .from('clients')
                .insert({
                    business_id: tx.businessId,
                    name: data.name,
                    phone: data.phone || null,
                    email: data.email || null,
                    id_number: data.id_number || null,
                    address: data.address || null,
                    credit_limit: data.credit_limit || 0,
                    current_debt: 0,
                    notes: data.notes || null,
                })
                .select()
                .single();

            if (error) throw error;

            // Registrar mapping offline → real para que ventas/abonos encolados
            // puedan resolver el client_id real al sincronizar.
            setOfflineClientMapping(data.offlineId, newClient.id);

            // Actualizar caché local: reemplazar el cliente offline por el real
            try {
                const cached = localStorage.getItem(CLIENTS_CACHE_KEY);
                if (cached) {
                    const list = JSON.parse(cached);
                    const updated = list.map((c: any) =>
                        c.id === data.offlineId ? { ...c, id: newClient.id, business_id: newClient.business_id } : c
                    );
                    localStorage.setItem(CLIENTS_CACHE_KEY, JSON.stringify(updated));
                }
            } catch { }

            logger.log(`[OfflineSync] ✅ Cliente sincronizado: ${data.name} (${data.offlineId} → ${newClient.id})`);
            await offlineQueue.remove(tx.id);
            return true;
        } catch (err) {
            console.error('[OfflineSync] ❌ Error sincronizando create_client:', err);
            await offlineQueue.updateStatus(tx.id, 'failed');
            return false;
        }
    };

    // --- Sincronizadores de Mesas y Salas (modelo Usuario Eje offline) ---
    // Datos maestros del salón creados/editados por el Eje sin conexión. Las
    // creaciones se procesan primero en `syncAll` para que las transacciones
    // dependientes puedan resolver el `offline_*` a su UUID real (Req 10.3).

    const syncCreateRoom = async (tx: OfflineTransaction): Promise<boolean> => {
        const data = tx.payload;
        try {
            await offlineQueue.updateStatus(tx.id, 'syncing');

            const { data: newRoom, error } = await supabase
                .from('rooms')
                .insert({
                    business_id: tx.businessId,
                    name: data.name,
                    description: data.description || null,
                    display_order: data.display_order ?? 0,
                })
                .select()
                .single();

            if (error) throw error;

            // Registrar mapping offline_room_* → real para que mesas y demás
            // transacciones que referencian la sala resuelvan su UUID (Req 10.1).
            if (data.offlineId) setOfflineRoomMapping(data.offlineId, newRoom.id);

            logger.log(`[OfflineSync] ✅ Sala sincronizada: ${data.name} (${data.offlineId} → ${newRoom.id})`);
            await offlineQueue.remove(tx.id);
            return true;
        } catch (err) {
            console.error('[OfflineSync] ❌ Error sincronizando create_room:', err);
            await offlineQueue.updateStatus(tx.id, 'failed');
            return false;
        }
    };

    const syncUpdateRoom = async (tx: OfflineTransaction): Promise<boolean> => {
        const data = tx.payload;
        try {
            await offlineQueue.updateStatus(tx.id, 'syncing');

            // Resolver offline_room_* → real antes de escribir (Req 10.2).
            const realRoomId = resolveOfflineRoomId(data.roomId);
            if (!realRoomId) {
                // ID temporal aún sin resolver: dejar en cola para el próximo ciclo (Req 10.4).
                logger.log(`[OfflineSync] ⏳ update_room diferido: sala ${data.roomId} sin resolver`);
                await offlineQueue.updateStatus(tx.id, 'pending');
                return false;
            }

            const { error } = await supabase
                .from('rooms')
                .update(data.updates || {})
                .eq('id', realRoomId);

            if (error) throw error;

            logger.log(`[OfflineSync] ✅ Sala actualizada: ${realRoomId}`);
            await offlineQueue.remove(tx.id);
            return true;
        } catch (err) {
            console.error('[OfflineSync] ❌ Error sincronizando update_room:', err);
            await offlineQueue.updateStatus(tx.id, 'failed');
            return false;
        }
    };

    const syncDeleteRoom = async (tx: OfflineTransaction): Promise<boolean> => {
        const data = tx.payload;
        try {
            await offlineQueue.updateStatus(tx.id, 'syncing');

            // Resolver offline_room_* → real antes de escribir (Req 10.2).
            const realRoomId = resolveOfflineRoomId(data.roomId);
            if (!realRoomId) {
                // ID temporal aún sin resolver: dejar en cola para el próximo ciclo (Req 10.4).
                logger.log(`[OfflineSync] ⏳ delete_room diferido: sala ${data.roomId} sin resolver`);
                await offlineQueue.updateStatus(tx.id, 'pending');
                return false;
            }

            // La FK tables.room_id tiene ON DELETE SET NULL, así que las mesas
            // de la sala quedan sin sala en Supabase (igual que el flujo online).
            const { error } = await supabase
                .from('rooms')
                .delete()
                .eq('id', realRoomId);

            if (error) throw error;

            logger.log(`[OfflineSync] ✅ Sala eliminada: ${realRoomId}`);
            await offlineQueue.remove(tx.id);
            return true;
        } catch (err) {
            console.error('[OfflineSync] ❌ Error sincronizando delete_room:', err);
            await offlineQueue.updateStatus(tx.id, 'failed');
            return false;
        }
    };

    const syncCreateTable = async (tx: OfflineTransaction): Promise<boolean> => {
        const data = tx.payload;
        try {
            await offlineQueue.updateStatus(tx.id, 'syncing');

            // El roomId puede ser un offline_room_*: resolverlo a su UUID real
            // antes de insertar. Si aún no resuelve, diferir la transacción
            // completa para el próximo ciclo sin descartarla (Req 10.2, 10.4).
            let realRoomId: string | null = null;
            if (data.roomId) {
                realRoomId = resolveOfflineRoomId(data.roomId);
                if (!realRoomId) {
                    logger.log(`[OfflineSync] ⏳ create_table diferido: sala ${data.roomId} sin resolver`);
                    await offlineQueue.updateStatus(tx.id, 'pending');
                    return false;
                }
            }

            const { data: newTable, error } = await supabase
                .from('tables')
                .insert({
                    business_id: tx.businessId,
                    room_id: realRoomId,
                    label: data.label,
                    seats: data.seats ?? 4,
                    status: 'available',
                })
                .select()
                .single();

            if (error) throw error;

            // Registrar mapping offline_table_* → real para que el cobro de mesa
            // (sale) y los update/delete resuelvan su UUID al sincronizar (Req 10.1).
            if (data.offlineId) setOfflineTableMapping(data.offlineId, newTable.id);

            logger.log(`[OfflineSync] ✅ Mesa sincronizada: ${data.label} (${data.offlineId} → ${newTable.id})`);
            await offlineQueue.remove(tx.id);
            return true;
        } catch (err) {
            console.error('[OfflineSync] ❌ Error sincronizando create_table:', err);
            await offlineQueue.updateStatus(tx.id, 'failed');
            return false;
        }
    };

    const syncUpdateTable = async (tx: OfflineTransaction): Promise<boolean> => {
        const data = tx.payload;
        try {
            await offlineQueue.updateStatus(tx.id, 'syncing');

            // Resolver offline_table_* → real antes de escribir (Req 10.2).
            const realTableId = resolveOfflineTableId(data.tableId);
            if (!realTableId) {
                logger.log(`[OfflineSync] ⏳ update_table diferido: mesa ${data.tableId} sin resolver`);
                await offlineQueue.updateStatus(tx.id, 'pending');
                return false;
            }

            // El update puede reasignar la mesa a una sala creada offline:
            // resolver también un posible offline_room_* en room_id.
            const updates = { ...(data.updates || {}) };
            if (updates.room_id) {
                const realUpdRoomId = resolveOfflineRoomId(updates.room_id);
                if (!realUpdRoomId) {
                    logger.log(`[OfflineSync] ⏳ update_table diferido: sala ${updates.room_id} sin resolver`);
                    await offlineQueue.updateStatus(tx.id, 'pending');
                    return false;
                }
                updates.room_id = realUpdRoomId;
            }

            const { error } = await supabase
                .from('tables')
                .update(updates)
                .eq('id', realTableId);

            if (error) throw error;

            logger.log(`[OfflineSync] ✅ Mesa actualizada: ${realTableId}`);
            await offlineQueue.remove(tx.id);
            return true;
        } catch (err) {
            console.error('[OfflineSync] ❌ Error sincronizando update_table:', err);
            await offlineQueue.updateStatus(tx.id, 'failed');
            return false;
        }
    };

    const syncDeleteTable = async (tx: OfflineTransaction): Promise<boolean> => {
        const data = tx.payload;
        try {
            await offlineQueue.updateStatus(tx.id, 'syncing');

            // Resolver offline_table_* → real antes de escribir (Req 10.2).
            const realTableId = resolveOfflineTableId(data.tableId);
            if (!realTableId) {
                logger.log(`[OfflineSync] ⏳ delete_table diferido: mesa ${data.tableId} sin resolver`);
                await offlineQueue.updateStatus(tx.id, 'pending');
                return false;
            }

            const { error } = await supabase
                .from('tables')
                .delete()
                .eq('id', realTableId);

            if (error) throw error;

            logger.log(`[OfflineSync] ✅ Mesa eliminada: ${realTableId}`);
            await offlineQueue.remove(tx.id);
            return true;
        } catch (err) {
            console.error('[OfflineSync] ❌ Error sincronizando delete_table:', err);
            await offlineQueue.updateStatus(tx.id, 'failed');
            return false;
        }
    };

    // --- Orquestador Principal ---

    // Materializa en Supabase las órdenes de mesa tomadas offline que NO se
    // cobraron (Req 14.2). Como el cobro borra el snapshot local, cualquier
    // snapshot `dirty` que persista al reconectar es una orden abierta: se
    // reconstruye como orden `pending` + items y la mesa queda `occupied`, para
    // que figure ocupada online y en los demás dispositivos. Devuelve cuántas
    // órdenes materializó. Se corre DESPUÉS de la cola para que `create_table`
    // ya haya resuelto los `offline_table_*`.
    const materializeDirtyTableOrders = async (): Promise<number> => {
        const businessId = profile?.business_id;
        const userId = profile?.id;
        if (!businessId) return 0;

        let dirty: CachedTableOrder[] = [];
        try {
            dirty = await getAllDirtyTableOrders();
        } catch {
            return 0;
        }
        if (dirty.length === 0) return 0;

        let materialized = 0;

        for (const snap of dirty) {
            try {
                // Resolver offline_table_* → real (create_table ya se procesó).
                const realTableId = resolveOfflineTableId(snap.table_id);
                if (!realTableId) {
                    logger.log(`[OfflineSync] ⏳ Orden de mesa diferida: mesa ${snap.table_id} sin resolver`);
                    continue; // Reintentar en el próximo ciclo.
                }
                if (!snap.items || snap.items.length === 0) continue;

                const total = snap.items.reduce(
                    (sum, it) => sum + Math.round((it.unit_price || 0) * (it.quantity || 0)), 0
                );

                // ¿La mesa ya tiene orden en Supabase? Reutilizarla; si no, crearla.
                const { data: tbl } = await supabase
                    .from('tables')
                    .select('current_order_id')
                    .eq('id', realTableId)
                    .maybeSingle();

                let orderId: string | null = tbl?.current_order_id ?? null;

                if (!orderId) {
                    const { data: newOrder, error: orderErr } = await supabase
                        .from('orders')
                        .insert({
                            business_id: businessId,
                            table_id: realTableId,
                            waiter_id: userId,
                            order_type: 'dine_in',
                            status: 'pending',
                            payment_status: 'pending',
                            subtotal: total,
                            total,
                            tax: 0,
                            amount_paid: 0,
                            change_amount: 0,
                        })
                        .select('id')
                        .single();
                    if (orderErr) throw orderErr;
                    orderId = newOrder.id;
                } else {
                    // Ya existe: reemplazar sus items por el estado local del Eje.
                    await supabase.from('order_items').delete().eq('order_id', orderId);
                }

                // Insertar items: primero los padres (para mapear local_id → id real),
                // luego los hijos (modificadores) con parent_order_item_id.
                const parents = snap.items.filter(it => !it.parent_local_id);
                const children = snap.items.filter(it => !!it.parent_local_id);
                const localToReal = new Map<string, string>();

                for (const it of parents) {
                    const { data: row, error: itemErr } = await supabase
                        .from('order_items')
                        .insert({
                            order_id: orderId,
                            product_id: it.product_id,
                            promotion_id: it.promotion_id || null,
                            product_name: it.product_name,
                            quantity: it.quantity,
                            unit_price: it.unit_price,
                            total_price: Math.round((it.unit_price || 0) * (it.quantity || 0)),
                            notes: it.notes,
                            cooking_term: it.cooking_term,
                            removed_ingredients: it.removed_ingredients || [],
                            status: it.status || 'pending',
                        })
                        .select('id')
                        .single();
                    if (itemErr) throw itemErr;
                    localToReal.set(it.local_id, row.id);
                }

                if (children.length > 0) {
                    const childrenRows = children.map(it => ({
                        order_id: orderId,
                        product_id: it.product_id,
                        promotion_id: it.promotion_id || null,
                        product_name: it.product_name,
                        quantity: it.quantity,
                        unit_price: it.unit_price,
                        total_price: Math.round((it.unit_price || 0) * (it.quantity || 0)),
                        notes: it.notes,
                        cooking_term: it.cooking_term,
                        removed_ingredients: it.removed_ingredients || [],
                        status: it.status || 'pending',
                        parent_order_item_id: it.parent_local_id
                            ? (localToReal.get(it.parent_local_id) ?? null)
                            : null,
                    }));
                    const { error: childErr } = await supabase.from('order_items').insert(childrenRows);
                    if (childErr) throw childErr;
                }

                // Marcar la mesa ocupada y vincular la orden.
                await supabase
                    .from('tables')
                    .update({ status: 'occupied', current_order_id: orderId })
                    .eq('id', realTableId);

                // Actualizar el total de la orden con el estado del snapshot (para
                // una orden preexistente el total quedaría obsoleto tras reemplazar
                // sus items; se recalcula igual al cobrar, pero se mantiene coherente).
                await supabase
                    .from('orders')
                    .update({ subtotal: total, total })
                    .eq('id', orderId);

                // Actualizar el snapshot local: ya sincronizado (dirty=false) con el
                // order_id e ids reales, y sin marcar items como pendientes. Clave del
                // store intacta (snap.table_id) para no re-materializar en bucle.
                const syncedItems = snap.items.map(it => ({
                    ...it,
                    local_id: localToReal.get(it.local_id) ?? it.local_id,
                    parent_local_id: it.parent_local_id
                        ? (localToReal.get(it.parent_local_id) ?? it.parent_local_id)
                        : undefined,
                    pendingSync: false,
                }));
                await saveTableOrder({
                    table_id: snap.table_id,
                    order_id: orderId,
                    items: syncedItems,
                    updated_at: new Date().toISOString(),
                    dirty: false,
                });

                materialized++;
                logger.log(`[OfflineSync] ✅ Orden de mesa reconstruida en Supabase: mesa ${realTableId} → orden ${orderId}`);
            } catch (err) {
                console.error('[OfflineSync] ❌ Error materializando orden de mesa offline:', err);
            }
        }

        return materialized;
    };

    const syncAll = useCallback(async () => {
        if (syncingRef.current || !isOnlineRef.current) return;
        syncingRef.current = true;
        setIsSyncing(true);

        const allP = await offlineQueue.getAll();
        const pending = allP.filter(o => o.status !== 'syncing');
        let synced = 0;
        let failed = 0;
        // Cuenta de transacciones de mesa/orden sincronizadas con éxito. Solo si
        // es ≥1 (y la cola queda vacía) se emite la señal de recarga (Req 17.1).
        let tableTxSynced = 0;

        // Orden de dependencias (Req 10.3): las creaciones de datos maestros van
        // primero para que las transacciones dependientes resuelvan su UUID real:
        //   1º create_room  → registra offline_room_* → real
        //   2º create_table → registra offline_table_* → real (puede depender de una sala nueva)
        //   3º update/delete de salas y mesas (resuelven offline_* antes de escribir)
        //   4º create_client → para que ventas/abonos resuelvan offline_client_*
        //   5º resto (incluye sale de mesa, que resuelve offline_table_* en task 13)
        const createRooms = pending.filter(t => t.type === 'create_room');
        const createTables = pending.filter(t => t.type === 'create_table');
        const roomTableMutations = pending.filter(t =>
            t.type === 'update_room' || t.type === 'delete_room' ||
            t.type === 'update_table' || t.type === 'delete_table');
        const createClients = pending.filter(t => t.type === 'create_client');
        const rest = pending.filter(t =>
            t.type !== 'create_room' && t.type !== 'create_table' &&
            t.type !== 'update_room' && t.type !== 'delete_room' &&
            t.type !== 'update_table' && t.type !== 'delete_table' &&
            t.type !== 'create_client');
        const ordered = [
            ...createRooms,
            ...createTables,
            ...roomTableMutations,
            ...createClients,
            ...rest,
        ];

        for (const tx of ordered) {
            // Resolver client_id offline antes de sincronizar (ventas, abonos)
            if (tx.payload) {
                const possibleKeys = ['client_id', 'clientId'];
                for (const key of possibleKeys) {
                    const val = tx.payload[key];
                    if (isOfflineClientId(val)) {
                        const realId = resolveOfflineClientId(val);
                        if (realId) tx.payload[key] = realId;
                    }
                }
            }

            let success = false;
            switch (tx.type) {
                case 'create_client':
                    success = await syncCreateClient(tx);
                    break;
                case 'create_room':
                    success = await syncCreateRoom(tx);
                    break;
                case 'update_room':
                    success = await syncUpdateRoom(tx);
                    break;
                case 'delete_room':
                    success = await syncDeleteRoom(tx);
                    break;
                case 'create_table':
                    success = await syncCreateTable(tx);
                    break;
                case 'update_table':
                    success = await syncUpdateTable(tx);
                    break;
                case 'delete_table':
                    success = await syncDeleteTable(tx);
                    break;
                case 'sale':
                    success = await syncSale(tx);
                    break;
                case 'expense':
                    success = await syncExpense(tx);
                    break;
                case 'inventory_purchase':
                    success = await syncInventoryPurchase(tx);
                    break;
                case 'shrinkage':
                    success = await syncShrinkage(tx);
                    break;
                case 'client_payment':
                    success = await syncClientPayment(tx);
                    break;
                case 'supplier_payment':
                    success = await syncSupplierPayment(tx);
                    break;
                case 'manual_cash_in':
                    success = await syncManualCashIn(tx);
                    break;
                case 'manual_cash_out':
                    success = await syncManualCashOut(tx);
                    break;
                case 'open_shift':
                    success = await syncOpenShift(tx);
                    break;
                case 'close_shift':
                    success = await syncCloseShift(tx);
                    break;
                default:
                    console.warn(`[OfflineSync] Tipo no soportado aún: ${tx.type}`);
                    await offlineQueue.updateStatus(tx.id, 'failed');
                    success = false;
            }

            if (success) synced++;
            else failed++;

            // ¿Fue una transacción de mesa/orden? (datos maestros de salón o una
            // venta ligada a una mesa). Sirve para decidir la señal de recarga.
            if (success) {
                const esTxMesa =
                    tx.type === 'create_room' || tx.type === 'update_room' || tx.type === 'delete_room' ||
                    tx.type === 'create_table' || tx.type === 'update_table' || tx.type === 'delete_table' ||
                    (tx.type === 'sale' && !!tx.payload?.table_id);
                if (esTxMesa) tableTxSynced++;
            }
        }

        if (synced > 0 || failed > 0) {
            setLastSyncResult({ synced, failed });
            setTimeout(() => setLastSyncResult(null), 5000);
        }

        // Materializar en Supabase las órdenes de mesa tomadas offline y NO
        // cobradas, para que las mesas figuren ocupadas al volver online (Req 14.2).
        const materialized = await materializeDirtyTableOrders();

        await refreshPending();
        setIsSyncing(false);
        syncingRef.current = false;

        if (synced > 0) {
            logger.log(`[OfflineSync] 📊 Resultado: ${synced} sincronizadas, ${failed} fallidas`);
            window.dispatchEvent(new Event('offline-sync-completed'));
        }

        // Señal de recarga (Req 17.1, 17.2): cuando se sincronizó ≥1 transacción de
        // mesa/orden O se materializó ≥1 orden abierta, y la cola quedó sin
        // pendientes. Si algo quedó 'failed' o diferido, getPendingCount() > 0 y no
        // se emite (Property 7). El Eje nunca recarga: el guard por rol (soyEje)
        // lo aplica la UI que consume la señal (task 15).
        if (tableTxSynced > 0 || materialized > 0) {
            const pendientesRestantes = await offlineQueue.getPendingCount();
            if (pendientesRestantes === 0) {
                emitEjeTableSyncCompleted();
                logger.log('[OfflineSync] 🔔 Señal de recarga emitida tras sincronizar mesas del Eje');
            }
        }
    }, [refreshPending, profile?.business_id, profile?.id]);

    const clearFailed = useCallback(async () => {
        await offlineQueue.removeFailed();
        await refreshPending();
    }, [refreshPending]);

    return {
        isOnline,
        pendingTransactions,
        pendingCount: pendingTransactions.filter(o => o.status === 'pending').length,
        failedCount: pendingTransactions.filter(o => o.status === 'failed').length,
        isSyncing,
        lastSyncResult,
        syncAll,
        refreshPending,
        clearFailed,
    };
};
