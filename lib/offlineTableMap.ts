/**
 * Mapping de IDs locales (offline_table_* y offline_room_*) a UUIDs reales
 * tras sincronizar. Permite que las transacciones encoladas que referencian
 * una mesa o sala creada offline puedan resolver el UUID real cuando se
 * procesan, incluso entre sesiones.
 *
 * Réplica del patrón de lib/offlineClientMap.ts adaptada a mesas y salas.
 */

const TABLE_MAP_KEY = 'bistro_offline_table_id_map';
const ROOM_MAP_KEY = 'bistro_offline_room_id_map';

const TABLE_PREFIX = 'offline_table_';
const ROOM_PREFIX = 'offline_room_';

/** Mapa genérico ID_Temporal → UUID_real persistido en localStorage. */
type OfflineIdMap = Record<string, string>;

const readMap = (key: string): OfflineIdMap => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
};

const writeMap = (key: string, map: OfflineIdMap) => {
    try {
        localStorage.setItem(key, JSON.stringify(map));
    } catch {
        // ignorar
    }
};

// ─── Mesas (offline_table_*) ──────────────────────────────────────────────

export const setOfflineTableMapping = (offlineId: string, realId: string) => {
    const map = readMap(TABLE_MAP_KEY);
    map[offlineId] = realId;
    writeMap(TABLE_MAP_KEY, map);
};

export const resolveOfflineTableId = (id: string | null | undefined): string | null => {
    if (!id) return null;
    if (!id.startsWith(TABLE_PREFIX)) return id;
    const map = readMap(TABLE_MAP_KEY);
    return map[id] || null;
};

export const isOfflineTableId = (id: string | null | undefined): boolean => {
    return typeof id === 'string' && id.startsWith(TABLE_PREFIX);
};

export const clearOfflineTableMapping = (offlineId: string) => {
    const map = readMap(TABLE_MAP_KEY);
    delete map[offlineId];
    writeMap(TABLE_MAP_KEY, map);
};

// ─── Salas (offline_room_*) ───────────────────────────────────────────────

export const setOfflineRoomMapping = (offlineId: string, realId: string) => {
    const map = readMap(ROOM_MAP_KEY);
    map[offlineId] = realId;
    writeMap(ROOM_MAP_KEY, map);
};

export const resolveOfflineRoomId = (id: string | null | undefined): string | null => {
    if (!id) return null;
    if (!id.startsWith(ROOM_PREFIX)) return id;
    const map = readMap(ROOM_MAP_KEY);
    return map[id] || null;
};

export const isOfflineRoomId = (id: string | null | undefined): boolean => {
    return typeof id === 'string' && id.startsWith(ROOM_PREFIX);
};

export const clearOfflineRoomMapping = (offlineId: string) => {
    const map = readMap(ROOM_MAP_KEY);
    delete map[offlineId];
    writeMap(ROOM_MAP_KEY, map);
};
