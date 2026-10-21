import { openDB } from 'idb';

const DB_NAME = 'bistro-offline';
const DB_VERSION = 4;

let dbInstance: any = null;

// Exportado para reutilizar la MISMA conexión IDB desde otros módulos
// (p. ej. lib/offlineTableStore.ts). No abrir una conexión nueva en otro lado.
export const getDB = async () => {
  if (!dbInstance) {
    dbInstance = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (!db.objectStoreNames.contains('sellProducts')) {
          db.createObjectStore('sellProducts', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('adminProducts')) {
          db.createObjectStore('adminProducts', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('categories')) {
          db.createObjectStore('categories', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('offline_transactions')) {
          db.createObjectStore('offline_transactions', { keyPath: 'id' });
        }
        // Limpiar store obsoleto si existe
        if (db.objectStoreNames.contains('productImages')) {
          db.deleteObjectStore('productImages');
        }
        // v4: stores para mesas offline (modelo Usuario Eje)
        if (oldVersion < 4) {
          if (!db.objectStoreNames.contains('tables')) {
            db.createObjectStore('tables', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('rooms')) {
            db.createObjectStore('rooms', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('table_orders')) {
            db.createObjectStore('table_orders', { keyPath: 'table_id' });
          }
        }
      },
    });
  }
  return dbInstance;
};

// ─── Sell Products (App.tsx / SellScreen) ───

export const saveSellProducts = async (products: any[]): Promise<void> => {
  try {
    const db = await getDB();
    const tx = db.transaction('sellProducts', 'readwrite');
    await tx.store.clear();
    for (const p of products) {
      await tx.store.put(p);
    }
    await tx.done;
    console.log(`[OfflineStorage] ✅ ${products.length} productos de venta guardados en IndexedDB`);
  } catch (err) {
    console.error('[OfflineStorage] Error guardando sell products:', err);
  }
};

export const getSellProducts = async (): Promise<any[]> => {
  try {
    const db = await getDB();
    return await db.getAll('sellProducts');
  } catch {
    return [];
  }
};

// ─── Admin Products (useProducts.ts) ───

export const saveAdminProducts = async (products: any[]): Promise<void> => {
  try {
    const db = await getDB();
    const tx = db.transaction('adminProducts', 'readwrite');
    await tx.store.clear();
    for (const p of products) {
      await tx.store.put(p);
    }
    await tx.done;
  } catch (err) {
    console.error('[OfflineStorage] Error guardando admin products:', err);
  }
};

export const getAdminProducts = async (): Promise<any[]> => {
  try {
    const db = await getDB();
    return await db.getAll('adminProducts');
  } catch {
    return [];
  }
};

// ─── Categories ───

export const saveCategories = async (categories: any[]): Promise<void> => {
  try {
    const db = await getDB();
    const tx = db.transaction('categories', 'readwrite');
    await tx.store.clear();
    for (const c of categories) {
      await tx.store.put(c);
    }
    await tx.done;
  } catch (err) {
    console.error('[OfflineStorage] Error guardando categories:', err);
  }
};

export const getCachedCategories = async (): Promise<any[]> => {
  try {
    const db = await getDB();
    return await db.getAll('categories');
  } catch {
    return [];
  }
};

// ─── Offline Transactions (Event Sourcing) ───

export const saveOfflineTransaction = async (txObj: any): Promise<void> => {
  try {
    const db = await getDB();
    await db.put('offline_transactions', txObj);
  } catch (err) {
    console.error('[OfflineStorage] Error guardando offline transaction:', err);
  }
};

export const getPendingTransactions = async (): Promise<any[]> => {
  try {
    const db = await getDB();
    const all = await db.getAll('offline_transactions');
    // Filtrar localmente (aunque solemos guardar todas, o al menos borrar las completadas)
    // Ordenar por createdAt
    return all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  } catch {
    return [];
  }
};

export const removeOfflineTransaction = async (id: string): Promise<void> => {
  try {
    const db = await getDB();
    await db.delete('offline_transactions', id);
  } catch (err) {
    console.error(`[OfflineStorage] Error eliminando transaccion ${id}:`, err);
  }
};

export const clearPendingTransactions = async (): Promise<void> => {
  try {
    const db = await getDB();
    const tx = db.transaction('offline_transactions', 'readwrite');
    await tx.store.clear();
    await tx.done;
  } catch (err) {
    console.error('[OfflineStorage] Error limpiando transacciones:', err);
  }
};

// ─── Persistent Storage (evita que el navegador borre datos) ───

export const requestPersistentStorage = async (): Promise<boolean> => {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const granted = await navigator.storage.persist();
      console.log(
        `[OfflineStorage] Almacenamiento persistente: ${granted ? '✅ concedido' : '❌ denegado'}`
      );
      return granted;
    }
  } catch (err) {
    console.error('[OfflineStorage] Error solicitando persistencia:', err);
  }
  return false;
};
