import { getDB } from './offlineStorage';

/**
 * offlineTableStore.ts
 *
 * Persistencia en IndexedDB del modulo de Mesas para el modo offline
 * (modelo "Usuario Eje" / single-writer).
 *
 * Reutiliza la MISMA conexion IDB de lib/offlineStorage.ts (getDB()), que ya
 * expone en la version 4 los stores:
 *   - 'tables'       (keyPath 'id')        -> lista de mesas cacheadas
 *   - 'rooms'        (keyPath 'id')        -> lista de salas cacheadas
 *   - 'table_orders' (keyPath 'table_id')  -> snapshot de la orden por mesa
 *
 * Decision de diseno: la orden de cada mesa se guarda como snapshot completo
 * (estado local), no como event-sourcing granular por item. Solo el Eje escribe
 * offline, asi que no hay conflictos que resolver.
 */

// ─── Claves de localStorage ───

/**
 * Timestamp local (ISO) de la ultima vez que se refresco el cache de mesas/salas.
 * Se usa para la comparacion de recarga del Req 17.5: si el Eje sincronizo
 * despues de este timestamp, el Observador debe forzar la recarga.
 */
const TABLES_CACHE_AT_KEY = 'bistro_tables_cache_at';

// ─── Interfaces ───

/**
 * Item de una orden de mesa cacheada localmente.
 * Los modificadores se representan como lineas hijas que referencian a su
 * item padre mediante `parent_local_id`.
 */
export interface CachedOrderItem {
  /** ID local estable para la UI (independiente del UUID real de Supabase). */
  local_id: string;
  product_id: string | null;
  promotion_id?: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  notes?: string;
  cooking_term?: string;
  removed_ingredients?: string[];
  status: 'pending' | 'preparing' | 'ready' | 'served';
  /** Modificador -> item padre (por `local_id`). Ausente en items de primer nivel. */
  parent_local_id?: string;
  /** Distintivo "pendiente de sincronizar" con Supabase. */
  pendingSync: boolean;
}

/**
 * Snapshot de la orden activa de una mesa.
 * La clave del store es `table_id` (UUID real u `offline_table_*`).
 */
export interface CachedTableOrder {
  /** Clave del store: UUID real de la mesa u `offline_table_*`. */
  table_id: string;
  /** UUID real de la orden u `offline_order_local` (solo referencia local). */
  order_id: string;
  /** Items de la orden, incluidos los modificadores como lineas hijas. */
  items: CachedOrderItem[];
  updated_at: string;
  /** `true` = la orden tiene cambios no cobrados / no sincronizados. */
  dirty: boolean;
}

// ─── Cache de Mesas (store 'tables') ───

/**
 * Guarda la lista completa de mesas en Cache_Mesas_IDB (reemplaza la anterior).
 * Actualiza tambien el timestamp local del cache (Req 17.5).
 */
export const saveCachedTables = async (tables: any[]): Promise<void> => {
  try {
    const db = await getDB();
    const tx = db.transaction('tables', 'readwrite');
    await tx.store.clear();
    for (const t of tables) {
      await tx.store.put(t);
    }
    await tx.done;
    touchTablesCacheTimestamp();
  } catch (err) {
    console.error('[OfflineTableStore] Error guardando mesas:', err);
  }
};

/** Lee la lista de mesas cacheadas. Devuelve `[]` si no hay cache. */
export const getCachedTables = async (): Promise<any[]> => {
  try {
    const db = await getDB();
    return await db.getAll('tables');
  } catch {
    return [];
  }
};

// ─── Cache de Salas (store 'rooms') ───

/**
 * Guarda la lista completa de salas en Cache_Mesas_IDB (reemplaza la anterior).
 * Actualiza tambien el timestamp local del cache (Req 17.5).
 */
export const saveCachedRooms = async (rooms: any[]): Promise<void> => {
  try {
    const db = await getDB();
    const tx = db.transaction('rooms', 'readwrite');
    await tx.store.clear();
    for (const r of rooms) {
      await tx.store.put(r);
    }
    await tx.done;
    touchTablesCacheTimestamp();
  } catch (err) {
    console.error('[OfflineTableStore] Error guardando salas:', err);
  }
};

/** Lee la lista de salas cacheadas. Devuelve `[]` si no hay cache. */
export const getCachedRooms = async (): Promise<any[]> => {
  try {
    const db = await getDB();
    return await db.getAll('rooms');
  } catch {
    return [];
  }
};

// ─── Snapshot de orden por mesa (store 'table_orders') ───

/**
 * Guarda (o reemplaza) el snapshot de la orden de una mesa.
 * Refresca `updated_at` con la hora actual.
 */
export const saveTableOrder = async (order: CachedTableOrder): Promise<void> => {
  try {
    const db = await getDB();
    await db.put('table_orders', {
      ...order,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[OfflineTableStore] Error guardando orden de mesa ${order.table_id}:`, err);
  }
};

/** Lee el snapshot de la orden de una mesa. Devuelve `null` si no existe. */
export const getTableOrder = async (tableId: string): Promise<CachedTableOrder | null> => {
  try {
    const db = await getDB();
    const order = await db.get('table_orders', tableId);
    return order ?? null;
  } catch {
    return null;
  }
};

/** Elimina el snapshot de la orden de una mesa (p. ej. al cobrar/liberar). */
export const deleteTableOrder = async (tableId: string): Promise<void> => {
  try {
    const db = await getDB();
    await db.delete('table_orders', tableId);
  } catch (err) {
    console.error(`[OfflineTableStore] Error eliminando orden de mesa ${tableId}:`, err);
  }
};

/**
 * Devuelve todas las ordenes de mesa con cambios sin cobrar/sin sincronizar
 * (`dirty === true`). Usado para bloquear el cierre de turno (Req 13).
 */
export const getAllDirtyTableOrders = async (): Promise<CachedTableOrder[]> => {
  try {
    const db = await getDB();
    const all: CachedTableOrder[] = await db.getAll('table_orders');
    return all.filter((o) => o.dirty === true);
  } catch {
    return [];
  }
};

/**
 * Devuelve todos los snapshots de ordenes de mesa cacheados.
 *
 * Util para resolver operaciones que reciben un `order_id` o un `order_item_id`
 * (no la clave `table_id` del store): al mutar una orden offline por su id de
 * orden o de item, se localiza el snapshot que la contiene recorriendo esta
 * lista.
 */
export const getAllTableOrders = async (): Promise<CachedTableOrder[]> => {
  try {
    const db = await getDB();
    return await db.getAll('table_orders');
  } catch {
    return [];
  }
};

// ─── Timestamp del cache de mesas (Req 17.5) ───

/** Escribe el timestamp local (ISO) del cache de mesas con la hora actual. */
export const touchTablesCacheTimestamp = (): void => {
  try {
    localStorage.setItem(TABLES_CACHE_AT_KEY, new Date().toISOString());
  } catch (err) {
    console.error('[OfflineTableStore] Error escribiendo timestamp de cache de mesas:', err);
  }
};

/**
 * Lee el timestamp local (ISO) del cache de mesas.
 * Devuelve `null` si aun no existe cache previa.
 */
export const getTablesCacheTimestamp = (): string | null => {
  try {
    return localStorage.getItem(TABLES_CACHE_AT_KEY);
  } catch {
    return null;
  }
};
