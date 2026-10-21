import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { isRealOffline, isNetworkError } from '../lib/connectivity';
import {
    saveCachedTables,
    getCachedTables,
    saveCachedRooms,
    getCachedRooms,
    getTableOrder,
    saveTableOrder,
    deleteTableOrder,
    getAllTableOrders,
    type CachedOrderItem,
} from '../lib/offlineTableStore';
import { offlineQueue } from '../lib/offlineQueue';
import { useEjeStatus } from './useEjeStatus';

/** Prefijos de IDs temporales para entidades creadas sin conexión. */
const OFFLINE_TABLE_PREFIX = 'offline_table_';
const OFFLINE_ROOM_PREFIX = 'offline_room_';

/** Mensaje mostrado cuando se abre la app sin conexión y sin cache previa (Req 1.4). */
const NO_OFFLINE_DATA_MSG = 'No hay datos de mesas disponibles sin conexión.';

/** Genera un ID_Temporal único con el prefijo indicado. */
const generateOfflineId = (prefix: string): string =>
    `${prefix}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export interface Room {
    id: string;
    business_id: string;
    name: string;
    description?: string;
    display_order: number;
    is_active: boolean;
    created_at: string;
}

export interface Table {
    id: string;
    business_id: string;
    room_id?: string;
    label: string;
    seats: number;
    status: 'available' | 'occupied' | 'reserved';
    current_order_id?: string;
    position_x: number;
    position_y: number;
    created_at: string;
    updated_at: string;
    room?: Room;
    // Order confirmation tracking
    last_confirmed_at?: string;
    last_seen_at?: string;
    hasUnseenConfirmation?: boolean;
    // Compatibility with types.Table (UI display properties)
    time?: string;
    amount?: number;
    customer?: string;
}

// Caché en memoria (nivel módulo) de mesas/salas por businessId. Permite que al
// remontar el hook —navegar fuera del POS y volver— las mesas aparezcan al
// instante, mientras se refresca en segundo plano. Persiste mientras la app
// esté abierta (no entre recargas, lo cual es suficiente para la navegación).
const tablesCache: Record<string, { tables: Table[]; rooms: Room[] }> = {};

// Gestor singleton del canal Realtime de mesas por businessId.
// Garantiza que aunque se monten múltiples componentes con useTables (ej: TableSelectorControl,
// OpenTicketsBar, TablesScreen), solo exista UN canal WebSocket abierto en Supabase.
interface TablesChannelManager {
    channel: ReturnType<typeof supabase.channel> | null;
    refCount: number;
    subscribers: Set<() => void>;
    roomSubscribers: Set<() => void>;
}
const tablesChannels: Record<string, TablesChannelManager> = {};
const cleanedBusinesses = new Set<string>();

export function useTables() {
    const { profile } = useAuth();
    const businessId = profile?.business_id;
    const userId = profile?.id;

    // Rol offline del usuario. Solo el Eje (turno de caja abierto) puede escribir
    // en mesas/salas sin conexión; el Observador queda en solo lectura (Req 4).
    const { soyEje } = useEjeStatus();
    // Ref para leer el valor vigente de `soyEje` dentro de callbacks memoizados
    // sin recrearlos ni arrastrar closures obsoletas.
    const soyEjeRef = useRef(soyEje);
    useEffect(() => { soyEjeRef.current = soyEje; }, [soyEje]);

    const cached = businessId ? tablesCache[businessId] : undefined;
    const [tables, setTables] = useState<Table[]>(cached?.tables || []);
    const [rooms, setRooms] = useState<Room[]>(cached?.rooms || []);
    const [loading, setLoading] = useState(!cached);
    const [error, setError] = useState<string | null>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    // Si ya hay caché, tratamos la carga inicial como hecha (sin loading ni bloqueo).
    const initialLoadDoneRef = useRef(!!cached);

    // OPTIMIZED: Cleanup with single SQL query instead of N+1
    // Returns true if any cleanup was done, false otherwise
    const cleanupEmptyTableOrders = useCallback(async (): Promise<boolean> => {
        if (!businessId) return false;
        // La limpieza escribe en Supabase: no tiene sentido sin conexión.
        if (!navigator.onLine) return false;

        let didCleanup = false;

        try {
            // Step 1: Fix ghost tables (occupied but no order linked)
            const { data: ghostTables } = await supabase
                .from('tables')
                .select('id')
                .eq('business_id', businessId)
                .eq('status', 'occupied')
                .is('current_order_id', null);

            if (ghostTables && ghostTables.length > 0) {
                await supabase
                    .from('tables')
                    .update({ status: 'available' })
                    .in('id', ghostTables.map(t => t.id));
                console.log(`[useTables] Fixed ${ghostTables.length} ghost tables`);
                didCleanup = true;
            }

            // Step 2: Clean tables with empty orders (0 items)
            const { data: tablesToClean } = await supabase
                .from('tables')
                .select(`
                    id,
                    current_order_id,
                    orders!tables_current_order_fk (
                        id,
                        order_items (id)
                    )
                `)
                .eq('business_id', businessId)
                .eq('status', 'occupied')
                .not('current_order_id', 'is', null);

            if (tablesToClean && tablesToClean.length > 0) {
                const emptyOrderTables = tablesToClean.filter((t: any) => {
                    const order = t.orders;
                    return order && (!order.order_items || order.order_items.length === 0);
                });

                if (emptyOrderTables.length > 0) {
                    const tableIds = emptyOrderTables.map((t: any) => t.id);
                    const orderIds = emptyOrderTables.map((t: any) => t.current_order_id).filter(Boolean);

                    if (tableIds.length > 0) {
                        await supabase
                            .from('tables')
                            .update({ status: 'available', current_order_id: null })
                            .in('id', tableIds);
                    }

                    if (orderIds.length > 0) {
                        await supabase
                            .from('orders')
                            .delete()
                            .in('id', orderIds);
                    }

                    console.log(`[useTables] Cleaned ${emptyOrderTables.length} empty orders`);
                    didCleanup = true;
                }
            }

            return didCleanup;
        } catch (err) {
            console.error('[useTables] Error cleaning empty orders:', err);
            return false;
        }
    }, [businessId]);

    // Fetch rooms — online: Supabase + cache; offline: lee de Cache_Mesas_IDB.
    // La autocreación de "Sala Principal" NO se intenta offline (evita insert fallido).
    const fetchRooms = useCallback(async () => {
        if (!businessId) return;

        // OFFLINE: cargar desde Cache_Mesas_IDB sin tocar la red (Req 1.2, 1.3).
        if (!navigator.onLine) {
            const cachedRooms = await getCachedRooms();
            setRooms(cachedRooms as Room[]);
            return;
        }

        try {
            const { data, error } = await supabase
                .from('rooms')
                .select('*')
                .eq('business_id', businessId)
                .order('display_order', { ascending: true });

            if (error) throw error;

            // Si no hay ninguna sala, crear la sala por defecto (editable después).
            // Solo online: nunca se autocrea sin conexión.
            if (!data || data.length === 0) {
                const { data: defaultRoom, error: createErr } = await supabase
                    .from('rooms')
                    .insert({ business_id: businessId, name: 'Sala Principal', display_order: 0 })
                    .select()
                    .single();
                if (!createErr && defaultRoom) {
                    setRooms([defaultRoom]);
                    await saveCachedRooms([defaultRoom]); // Req 1.1 / 1.5
                    return;
                }
            }

            const roomsList = data || [];
            setRooms(roomsList);
            await saveCachedRooms(roomsList); // Req 1.1 / 1.5
        } catch (err: any) {
            console.error('Error fetching rooms:', err);
            // navigator.onLine pudo mentir: ante error de red, caer al cache.
            if (isNetworkError(err)) {
                const cachedRooms = await getCachedRooms();
                setRooms(cachedRooms as Room[]);
                return;
            }
            setError(err.message);
        }
    }, [businessId]);

    // OPTIMIZED: Fetch tables - only show loading on initial load.
    // Online: Supabase + Cache_Mesas_IDB; offline: lee de Cache_Mesas_IDB.
    const fetchTables = useCallback(async () => {
        if (!businessId) return;
        console.log('🔎[FETCH][mesas] useTables.fetchTables ejecutado');

        // OFFLINE: cargar desde Cache_Mesas_IDB sin tocar la red (Req 1.2, 1.3).
        if (!navigator.onLine) {
            const cachedTables = await getCachedTables();
            setTables(cachedTables as Table[]);
            // Sin cache previa: avisar que no hay datos offline (Req 1.4).
            setError(cachedTables.length === 0 ? NO_OFFLINE_DATA_MSG : null);
            initialLoadDoneRef.current = true;
            setLoading(false);
            return;
        }

        try {
            if (!initialLoadDoneRef.current) {
                setLoading(true);
            }

            // Fetch tables with rooms - include order data in single query.
            // Se incluyen los items de la orden de cada mesa ocupada para poder
            // cachear su snapshot y permitir la hidratación offline (Req 2.1).
            const { data, error } = await supabase
                .from('tables')
                .select(`
                    *,
                    room:rooms(*),
                    orders!tables_current_order_fk (
                        id,
                        last_confirmed_at,
                        last_seen_at,
                        items:order_items(*, product:products(unit))
                    )
                `)
                .eq('business_id', businessId)
                .order('label', { ascending: true });

            if (error) throw error;

            // Process tables - order data comes in single query now
            const processedTables = (data || []).map((table: any) => {
                const orderData = table.orders;
                let hasUnseenConfirmation = false;

                if (orderData?.last_confirmed_at) {
                    hasUnseenConfirmation = !orderData.last_seen_at ||
                        new Date(orderData.last_seen_at) < new Date(orderData.last_confirmed_at);
                }

                // Remove the nested orders object, flatten the data
                const { orders, ...tableData } = table;

                return {
                    ...tableData,
                    last_confirmed_at: orderData?.last_confirmed_at,
                    last_seen_at: orderData?.last_seen_at,
                    hasUnseenConfirmation,
                };
            });

            // Preserva mesas optimistas (id `temp-*`) cuyo insert aún no ha
            // respondido: si el fetch corre entre el optimistic append y el
            // response del INSERT, sin este merge la mesa desaparecería del UI
            // hasta el siguiente fetch (parpadeo visible al crear mesa).
            setTables(prev => {
                const activeOptimistic = prev.filter(t => t.id.startsWith('temp-'));
                if (activeOptimistic.length === 0) return processedTables;
                // Si el server ya devolvió una mesa con el mismo label, descarta
                // la optimista para evitar duplicados visuales.
                const serverLabels = new Set(processedTables.map(t => t.label));
                const preserved = activeOptimistic.filter(t => !serverLabels.has(t.label));
                return preserved.length ? [...processedTables, ...preserved] : processedTables;
            });
            await saveCachedTables(processedTables); // Req 1.1 / 1.5

            // Req 2.1: cachear el snapshot de la orden de cada mesa OCUPADA para
            // que el Eje pueda hidratarla sin conexión aunque no la haya abierto
            // online. NO se sobrescribe un snapshot con cambios locales sin
            // sincronizar (dirty), para no pisar el trabajo offline del Eje.
            try {
                const dirtyIds = new Set(
                    (await getAllTableOrders()).filter(o => o.dirty).map(o => o.table_id)
                );
                for (const t of (data || [])) {
                    if (dirtyIds.has(t.id)) continue; // No tocar snapshots con cambios offline pendientes.
                    const ord = (t as any).orders;
                    const items = ord?.items;
                    if (!ord?.id || !Array.isArray(items) || items.length === 0) {
                        // La mesa NO tiene orden con items en Supabase: eliminar cualquier
                        // snapshot obsoleto para que offline aparezca libre (consistencia
                        // con el estado real; evita mostrar items en una mesa liberada).
                        await deleteTableOrder(t.id);
                        continue;
                    }
                    const cachedItems: CachedOrderItem[] = items.map((it: any) => ({
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
                    }));
                    await saveTableOrder({
                        table_id: t.id,
                        order_id: ord.id,
                        items: cachedItems,
                        updated_at: new Date().toISOString(),
                        dirty: false,
                    });
                }
            } catch (cacheErr) {
                console.error('[useTables] Error cacheando snapshots de órdenes:', cacheErr);
            }

            setError(null);
            initialLoadDoneRef.current = true;
        } catch (err: any) {
            console.error('Error fetching tables:', err);
            // navigator.onLine pudo mentir: ante error de red, caer al cache.
            if (isNetworkError(err)) {
                const cachedTables = await getCachedTables();
                setTables(cachedTables as Table[]);
                setError(cachedTables.length === 0 ? NO_OFFLINE_DATA_MSG : null);
                initialLoadDoneRef.current = true;
                return;
            }
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [businessId]);

    // Debounced fetch for realtime updates
    const debouncedFetchTables = useCallback(() => {
        if (debounceRef.current) {
            clearTimeout(debounceRef.current);
        }
        debounceRef.current = setTimeout(() => {
            fetchTables();
        }, 150);
    }, [fetchTables]);

    // Create room — online: Supabase; offline (Eje): IDB + cola `create_room`.
    const createRoom = useCallback(async (name: string, description?: string) => {
        if (!businessId) return null;

        // OFFLINE: solo el Eje escribe; el Observador queda en no-op controlado.
        if (await isRealOffline()) {
            if (!soyEjeRef.current || !userId) return null; // solo lectura (Req 4.4)

            const offlineId = generateOfflineId(OFFLINE_ROOM_PREFIX);
            const displayOrder = rooms.length;
            const localRoom: Room = {
                id: offlineId,
                business_id: businessId,
                name,
                description,
                display_order: displayOrder,
                is_active: true,
                created_at: new Date().toISOString(),
            };
            const nextRooms = [...rooms, localRoom];
            setRooms(nextRooms);
            await saveCachedRooms(nextRooms); // Req 9.1
            await offlineQueue.add(
                'create_room',
                { offlineId, name, description, display_order: displayOrder },
                businessId,
                userId,
            );
            return localRoom;
        }

        try {
            const { data, error } = await supabase
                .from('rooms')
                .insert({
                    business_id: businessId,
                    name,
                    description,
                    display_order: rooms.length,
                })
                .select()
                .single();

            if (error) throw error;
            await fetchRooms();
            return data;
        } catch (err: any) {
            console.error('Error creating room:', err);
            throw err;
        }
    }, [businessId, userId, rooms, fetchRooms]);

    // Update room — online: Supabase; offline (Eje): IDB + cola `update_room`.
    const updateRoom = useCallback(async (roomId: string, updates: Partial<Room>) => {
        // OFFLINE: solo el Eje escribe; el Observador queda en no-op controlado.
        if (await isRealOffline()) {
            if (!soyEjeRef.current || !businessId || !userId) return; // solo lectura (Req 4.4)

            const nextRooms = rooms.map(r => (r.id === roomId ? { ...r, ...updates } : r));
            setRooms(nextRooms);
            await saveCachedRooms(nextRooms); // Req 9.2
            await offlineQueue.add('update_room', { roomId, updates }, businessId, userId);
            return;
        }

        try {
            const { error } = await supabase
                .from('rooms')
                .update(updates)
                .eq('id', roomId);

            if (error) throw error;
            await fetchRooms();
        } catch (err: any) {
            console.error('Error updating room:', err);
            throw err;
        }
    }, [businessId, userId, rooms, fetchRooms]);

    // Delete room — online: Supabase; offline (Eje): reasigna mesas a la sala
    // principal en cache y encola `delete_room` (Req 9.3).
    const deleteRoom = useCallback(async (roomId: string) => {
        // OFFLINE: solo el Eje escribe; el Observador queda en no-op controlado.
        if (await isRealOffline()) {
            if (!soyEjeRef.current || !businessId || !userId) return; // solo lectura (Req 4.4)

            // Reasignar las mesas de la sala eliminada a la sala principal (primera).
            const principalRoomId = rooms.find(r => r.id !== roomId)?.id;
            const nextTables = tables.map(t =>
                t.room_id === roomId ? { ...t, room_id: principalRoomId } : t,
            );
            setTables(nextTables);
            await saveCachedTables(nextTables);

            const nextRooms = rooms.filter(r => r.id !== roomId);
            setRooms(nextRooms);
            await saveCachedRooms(nextRooms);

            await offlineQueue.add('delete_room', { roomId }, businessId, userId);
            return;
        }

        try {
            const { error } = await supabase
                .from('rooms')
                .delete()
                .eq('id', roomId);

            if (error) throw error;
            await fetchRooms();
            await fetchTables();
        } catch (err: any) {
            console.error('Error deleting room:', err);
            throw err;
        }
    }, [businessId, userId, rooms, tables, fetchRooms, fetchTables]);

    // Create table — online: optimistic + Supabase; offline (Eje): IDB + cola.
    const createTable = useCallback(async (label: string, roomId?: string, seats: number = 4) => {
        if (!businessId) return null;

        // OFFLINE: solo el Eje escribe; el Observador queda en no-op controlado.
        if (await isRealOffline()) {
            if (!soyEjeRef.current || !userId) return null; // solo lectura (Req 4.4)

            // ID_Temporal persistente `offline_table_*` (no `temp-*` efímero) para
            // que la mesa sobreviva recargas y sea resoluble al sincronizar (Req 8.1).
            const offlineId = generateOfflineId(OFFLINE_TABLE_PREFIX);
            const localTable: Table = {
                id: offlineId,
                business_id: businessId,
                room_id: roomId,
                label,
                seats,
                status: 'available',
                position_x: 0,
                position_y: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            const nextTables = [...tables, localTable];
            setTables(nextTables);
            await saveCachedTables(nextTables); // Req 8.1
            await offlineQueue.add(
                'create_table',
                { offlineId, label, roomId, seats },
                businessId,
                userId,
            );
            return localTable;
        }

        const optimisticTable: Table = {
            id: `temp-${Date.now()}`,
            business_id: businessId,
            room_id: roomId,
            label,
            seats,
            status: 'available',
            position_x: 0,
            position_y: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        setTables(prev => [...prev, optimisticTable]);

        try {
            const { data, error } = await supabase
                .from('tables')
                .insert({
                    business_id: businessId,
                    room_id: roomId,
                    label,
                    seats,
                    status: 'available',
                })
                .select()
                .single();

            if (error) throw error;
            // Idempotente: quita la temp y asegura que la real esté en la lista
            // sin duplicarla si un fetch concurrente (realtime) ya la trajo.
            setTables(prev => {
                const withoutTemp = prev.filter(t => t.id !== optimisticTable.id);
                if (withoutTemp.some(t => t.id === data.id)) return withoutTemp;
                return [...withoutTemp, { ...data, hasUnseenConfirmation: false }];
            });
            return data;
        } catch (err: any) {
            setTables(prev => prev.filter(t => t.id !== optimisticTable.id));
            console.error('Error creating table:', err);
            throw err;
        }
    }, [businessId, userId, tables]);

    // Update table — online: Supabase; offline (Eje): IDB + cola `update_table`.
    const updateTable = useCallback(async (tableId: string, updates: Partial<Table>) => {
        // OFFLINE: solo el Eje escribe; el Observador queda en no-op controlado.
        if (await isRealOffline()) {
            if (!soyEjeRef.current || !businessId || !userId) return; // solo lectura (Req 4.4)

            const nextTables = tables.map(t => (t.id === tableId ? { ...t, ...updates } : t));
            setTables(nextTables);
            await saveCachedTables(nextTables); // Req 8.2
            await offlineQueue.add('update_table', { tableId, updates }, businessId, userId);
            return;
        }

        try {
            const { error } = await supabase
                .from('tables')
                .update(updates)
                .eq('id', tableId);

            if (error) throw error;
            await fetchTables();
        } catch (err: any) {
            console.error('Error updating table:', err);
            throw err;
        }
    }, [businessId, userId, tables, fetchTables]);

    // Delete table — online: optimistic + Supabase; offline (Eje): IDB + cola.
    const deleteTable = useCallback(async (tableId: string) => {
        // OFFLINE: solo el Eje escribe; el Observador queda en no-op controlado.
        if (await isRealOffline()) {
            if (!soyEjeRef.current || !businessId || !userId) return; // solo lectura (Req 4.4)

            // No permitir eliminar una mesa ocupada o con items (Req 8.4).
            const target = tables.find(t => t.id === tableId);
            const cachedOrder = await getTableOrder(tableId);
            const tieneItems = (cachedOrder?.items?.length ?? 0) > 0;
            if (target?.status === 'occupied' || target?.current_order_id || tieneItems) {
                throw new Error('No se puede eliminar: la mesa tiene un pedido activo.');
            }

            const nextTables = tables.filter(t => t.id !== tableId);
            setTables(nextTables);
            await saveCachedTables(nextTables); // Req 8.3
            await offlineQueue.add('delete_table', { tableId }, businessId, userId);
            return;
        }

        const previousTables = tables;
        setTables(prev => prev.filter(t => t.id !== tableId));

        try {
            const { error } = await supabase
                .from('tables')
                .delete()
                .eq('id', tableId);

            if (error) throw error;
        } catch (err: any) {
            setTables(previousTables);
            console.error('Error deleting table:', err);
            throw err;
        }
    }, [businessId, userId, tables]);

    // OPTIMIZED: Initial fetch - load UI first, cleanup in background (una sola vez por negocio y sesión)
    useEffect(() => {
        if (businessId) {
            // Fetch data immediately (don't block on cleanup)
            Promise.all([fetchRooms(), fetchTables()]).then(() => {
                // Run cleanup in background after initial load (only once per business session)
                if (!cleanedBusinesses.has(businessId)) {
                    cleanedBusinesses.add(businessId);
                    cleanupEmptyTableOrders().then((didCleanup) => {
                        // Only refetch if cleanup actually changed something
                        if (didCleanup) {
                            fetchTables();
                        }
                    });
                }
            });
        }
    }, [businessId, fetchRooms, fetchTables, cleanupEmptyTableOrders]);

    // OFFLINE: cuando otro flujo muta el cache de mesas fuera de este hook
    // (cobro de mesa offline en App.tsx, ocupar/liberar en useSales), re-leer
    // Cache_Mesas_IDB para reflejar el nuevo estado (ocupada/libre) en la UI.
    // Online no hace falta: el realtime ya mantiene el estado al día.
    useEffect(() => {
        if (!businessId) return;
        const handleOfflineTablesUpdated = () => {
            if (navigator.onLine) return;
            getCachedTables()
                .then(cached => setTables(cached as Table[]))
                .catch(() => { /* no-op */ });
        };
        window.addEventListener('offline-tables-updated', handleOfflineTablesUpdated);
        return () => window.removeEventListener('offline-tables-updated', handleOfflineTablesUpdated);
    }, [businessId]);

    // OPTIMIZED: Realtime subscription con canal singleton compartido por negocio.
    // Aunque haya múltiples instancias de useTables en la pantalla (selector móvil, desktop,
    // tablet, TablesScreen), se abre un solo canal en Supabase, ahorrando mensajes.
    useEffect(() => {
        if (!businessId) return;

        if (!tablesChannels[businessId]) {
            tablesChannels[businessId] = {
                channel: null,
                refCount: 0,
                subscribers: new Set(),
                roomSubscribers: new Set(),
            };
        }

        const manager = tablesChannels[businessId];
        manager.subscribers.add(debouncedFetchTables);
        manager.roomSubscribers.add(fetchRooms);
        manager.refCount += 1;

        if (!manager.channel) {
            manager.channel = supabase
                .channel(`tables-orders-changes-${businessId}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'tables',
                        filter: `business_id=eq.${businessId}`,
                    },
                    () => {
                        manager.subscribers.forEach(cb => cb());
                    }
                )
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'orders',
                        filter: `business_id=eq.${businessId}`,
                    },
                    () => {
                        manager.subscribers.forEach(cb => cb());
                    }
                )
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'rooms',
                        filter: `business_id=eq.${businessId}`,
                    },
                    () => {
                        manager.roomSubscribers.forEach(cb => cb());
                    }
                )
                .subscribe();
        }

        return () => {
            manager.subscribers.delete(debouncedFetchTables);
            manager.roomSubscribers.delete(fetchRooms);
            manager.refCount -= 1;

            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }

            if (manager.refCount <= 0) {
                if (manager.channel) {
                    supabase.removeChannel(manager.channel);
                    manager.channel = null;
                }
                delete tablesChannels[businessId];
            }
        };
    }, [businessId, debouncedFetchTables, fetchRooms]);

    // Sincronizar caché en memoria cada vez que cambian mesas/salas, para que al
    // remontar (volver al POS) estén disponibles al instante.
    useEffect(() => {
        if (businessId) {
            tablesCache[businessId] = { tables, rooms };
        }
    }, [businessId, tables, rooms]);

    return {
        tables,
        rooms,
        loading,
        error,
        createRoom,
        updateRoom,
        deleteRoom,
        createTable,
        updateTable,
        deleteTable,
        refetch: fetchTables,
    };
}