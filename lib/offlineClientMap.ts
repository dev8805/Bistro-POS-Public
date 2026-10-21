/**
 * Mapping de IDs locales (offline_client_*) a UUIDs reales tras sincronizar.
 * Permite que ventas/abonos encolados con un cliente creado offline puedan
 * resolver el client_id real cuando se procesan, incluso entre sesiones.
 */

const MAP_KEY = 'bistro_offline_client_id_map';

type ClientIdMap = Record<string, string>;

const readMap = (): ClientIdMap => {
    try {
        const raw = localStorage.getItem(MAP_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
};

const writeMap = (map: ClientIdMap) => {
    try {
        localStorage.setItem(MAP_KEY, JSON.stringify(map));
    } catch {
        // ignorar
    }
};

export const setOfflineClientMapping = (offlineId: string, realId: string) => {
    const map = readMap();
    map[offlineId] = realId;
    writeMap(map);
};

export const resolveOfflineClientId = (id: string | null | undefined): string | null => {
    if (!id) return null;
    if (!id.startsWith('offline_client_')) return id;
    const map = readMap();
    return map[id] || null;
};

export const isOfflineClientId = (id: string | null | undefined): boolean => {
    return typeof id === 'string' && id.startsWith('offline_client_');
};

export const clearOfflineClientMapping = (offlineId: string) => {
    const map = readMap();
    delete map[offlineId];
    writeMap(map);
};
