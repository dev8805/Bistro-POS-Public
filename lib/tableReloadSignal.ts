import { presenceManager } from './presenceManager';
import { getTablesCacheTimestamp } from './offlineTableStore';

/**
 * tableReloadSignal.ts
 *
 * Señal de recarga tras la sincronización del Eje (Req 17).
 *
 * Cuando el Eje termina de subir todas sus transacciones de mesas/órdenes
 * (`getPendingCount() === 0`), emite una señal para que los observadores
 * conectados recarguen la app y trabajen con el estado real de las mesas.
 *
 * Este módulo es el punto único y reutilizable que:
 *   - (Eje) escribe el timestamp `bistro_last_eje_table_sync_at` y emite la
 *     señal, tanto por broadcast en el canal de presencia (para otros
 *     dispositivos) como por CustomEvent local (para la propia pestaña).
 *   - (Observador / task 15) se suscribe a la señal para disparar el modal de
 *     recarga, y consulta si debe forzar recarga al entrar a Mesas (Req 17.5).
 *
 * IMPORTANTE: el Eje NUNCA debe recargar (Req 17.4). Este módulo es agnóstico
 * al rol; el guard por `soyEje` lo aplica quien consume la señal (task 15).
 */

/** localStorage: ISO de la última sincronización de mesas conocida del Eje. */
const LAST_EJE_SYNC_KEY = 'bistro_last_eje_table_sync_at';

/**
 * CustomEvent local (misma pestaña) equivalente al broadcast remoto. Permite que
 * la UI de la propia app reaccione sin depender del canal de Realtime.
 */
export const EJE_TABLE_SYNC_EVENT = 'eje-table-sync-completed';

/** Lee el timestamp (ISO) de la última sincronización de mesas del Eje. */
export const getLastEjeTableSyncAt = (): string | null => {
  try {
    return localStorage.getItem(LAST_EJE_SYNC_KEY);
  } catch {
    return null;
  }
};

/** Escribe el timestamp de sincronización del Eje con la hora actual (ISO). */
export const markEjeTableSyncNow = (): string => {
  const iso = new Date().toISOString();
  try {
    localStorage.setItem(LAST_EJE_SYNC_KEY, iso);
  } catch (err) {
    console.error('[TableReloadSignal] Error escribiendo timestamp de sync del Eje:', err);
  }
  return iso;
};

/**
 * Emite la señal completa de recarga. Solo la invoca el flujo del Eje al terminar
 * `syncAll` con la cola vacía:
 *   1. persiste el timestamp de sincronización;
 *   2. hace broadcast `eje-sync-completed` por el canal de presencia (dispositivos remotos);
 *   3. dispara el CustomEvent local `eje-table-sync-completed` (misma pestaña).
 */
export const emitEjeTableSyncCompleted = (): void => {
  markEjeTableSyncNow();
  presenceManager.broadcastEjeSyncCompleted();
  try {
    window.dispatchEvent(new CustomEvent(EJE_TABLE_SYNC_EVENT));
  } catch {
    /* no-op */
  }
};

/**
 * Suscripción reutilizable para observadores (task 15). Escucha tanto el
 * broadcast remoto del canal de presencia como el CustomEvent local, y ejecuta
 * `onSignal` cuando llega la señal.
 *
 * Devuelve una función de limpieza que retira ambos listeners (sin dejar
 * listeners huérfanos).
 */
export const subscribeToEjeTableSync = (onSignal: () => void): (() => void) => {
  const localHandler = () => onSignal();
  window.addEventListener(EJE_TABLE_SYNC_EVENT, localHandler);
  const unsubscribeBroadcast = presenceManager.onEjeSyncCompleted(onSignal);

  return () => {
    window.removeEventListener(EJE_TABLE_SYNC_EVENT, localHandler);
    unsubscribeBroadcast();
  };
};

/**
 * Recuperación del observador que se perdió la señal (Req 17.5): al reconectar o
 * entrar a Mesas, indica si el Eje sincronizó DESPUÉS del último refresco del
 * Cache_Mesas_IDB local. En ese caso el observador debe forzar la recarga.
 *
 * Devuelve `false` si no hay señal previa del Eje o si no hay cache local (en ese
 * caso Mesas se carga fresco desde Supabase, no hace falta recargar).
 *
 * NOTA: el Eje nunca recarga (Req 17.4); quien consuma este helper debe combinarlo
 * con `!soyEje` antes de forzar la recarga.
 */
export const shouldForceReloadFromEjeSync = (): boolean => {
  const lastSync = getLastEjeTableSyncAt();
  if (!lastSync) return false;

  const cacheAt = getTablesCacheTimestamp();
  if (!cacheAt) return false;

  const lastSyncMs = new Date(lastSync).getTime();
  const cacheAtMs = new Date(cacheAt).getTime();
  if (Number.isNaN(lastSyncMs) || Number.isNaN(cacheAtMs)) return false;

  return lastSyncMs > cacheAtMs;
};
