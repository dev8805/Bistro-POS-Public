/**
 * deviceAliasStore (Fase 1 — mock)
 *
 * Simula la futura tabla `business_devices` en localStorage.
 * En Fase 3 se reemplazará por consultas reales a Supabase, conservando esta API.
 *
 * Esquema de la futura tabla:
 *   business_devices (
 *     device_id      uuid PK,
 *     business_id    uuid NOT NULL,
 *     alias          text NULL,           -- nombre asignado por el admin
 *     default_label  text NOT NULL,       -- derivado del user_agent
 *     user_agent     text NOT NULL,
 *     device_type    text NOT NULL,       -- desktop | tablet | mobile
 *     first_seen_at  timestamptz,
 *     last_seen_at   timestamptz
 *   )
 */

import { deriveDefaultLabelFromUA, deriveDeviceTypeFromUA, DeviceType } from './deviceInfo';

const REGISTRY_KEY_PREFIX = 'bistro_device_registry_';

export interface BusinessDevice {
    device_id: string;
    business_id: string;
    /** null si el admin no le ha puesto alias todavía. */
    alias: string | null;
    /** Etiqueta derivada del userAgent. Ej: "Chrome en Windows". */
    default_label: string;
    user_agent: string;
    device_type: DeviceType;
    first_seen_at: string;
    last_seen_at: string;
}

// ── Datos pre-poblados para el mock ────────────────────────────────────────
// Mezclamos dispositivos con alias (ya renombrados por el admin) y sin alias
// (recién aparecidos) para que la UI demuestre ambos casos.
export const MOCK_BUSINESS_ID_FOR_DEVICES = 'mock-business-0001';

const SEED: BusinessDevice[] = [
    {
        device_id: 'dev-laura-01',
        business_id: MOCK_BUSINESS_ID_FOR_DEVICES,
        alias: 'Laptop Oficina',
        default_label: 'Chrome en macOS',
        user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        device_type: 'desktop',
        first_seen_at: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        last_seen_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    },
    {
        device_id: 'dev-carlos-01',
        business_id: MOCK_BUSINESS_ID_FOR_DEVICES,
        alias: 'PC Mostrador',
        default_label: 'Chrome en Windows',
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        device_type: 'desktop',
        first_seen_at: new Date(Date.now() - 60 * 86_400_000).toISOString(),
        last_seen_at: new Date(Date.now() - 1 * 60_000).toISOString(),
    },
    {
        device_id: 'dev-maria-01',
        business_id: MOCK_BUSINESS_ID_FOR_DEVICES,
        alias: null, // sin alias → muestra "Samsung Internet en Android"
        default_label: 'Samsung Internet en Android',
        user_agent: 'Mozilla/5.0 (Linux; Android 13; SM-T580) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Safari/537.36',
        device_type: 'tablet',
        first_seen_at: new Date(Date.now() - 15 * 86_400_000).toISOString(),
        last_seen_at: new Date(Date.now() - 12 * 60_000).toISOString(),
    },
    {
        device_id: 'dev-pedro-01',
        business_id: MOCK_BUSINESS_ID_FOR_DEVICES,
        alias: null,
        default_label: 'Safari en iOS',
        user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
        device_type: 'mobile',
        first_seen_at: new Date(Date.now() - 7 * 86_400_000).toISOString(),
        last_seen_at: new Date(Date.now() - 45 * 60_000).toISOString(),
    },
];

// ── Persistencia en localStorage ──────────────────────────────────────────
const loadRegistry = (businessId: string): BusinessDevice[] => {
    try {
        const raw = localStorage.getItem(REGISTRY_KEY_PREFIX + businessId);
        if (raw) return JSON.parse(raw) as BusinessDevice[];
    } catch {
        /* fallthrough */
    }
    if (businessId === MOCK_BUSINESS_ID_FOR_DEVICES) {
        // Primera vez: sembrar el registro con los datos de prueba.
        saveRegistry(businessId, SEED);
        return SEED;
    }
    return [];
};

const saveRegistry = (businessId: string, devices: BusinessDevice[]): void => {
    try {
        localStorage.setItem(REGISTRY_KEY_PREFIX + businessId, JSON.stringify(devices));
    } catch {
        /* storage bloqueado (modo privado): se acepta como mejor esfuerzo */
    }
};

// ── Pub/sub para que los hooks reaccionen a cambios de alias ─────────────
const subscribers = new Set<() => void>();
const notify = (): void => subscribers.forEach(fn => fn());

// ── API pública del store ────────────────────────────────────────────────
export const deviceAliasStore = {
    getAll(businessId: string): BusinessDevice[] {
        return loadRegistry(businessId);
    },

    getDevice(businessId: string, deviceId: string): BusinessDevice | null {
        return loadRegistry(businessId).find(d => d.device_id === deviceId) || null;
    },

    /** Etiqueta visible: alias si existe, default_label si no. */
    resolveLabel(businessId: string, deviceId: string): string {
        const dev = this.getDevice(businessId, deviceId);
        if (!dev) return 'Dispositivo desconocido';
        return dev.alias || dev.default_label;
    },

    /** Asigna un alias al dispositivo (null/'' lo borra). */
    setAlias(businessId: string, deviceId: string, alias: string | null): void {
        const devices = loadRegistry(businessId);
        const idx = devices.findIndex(d => d.device_id === deviceId);
        if (idx === -1) return;
        const trimmed = alias?.trim() || null;
        devices[idx] = { ...devices[idx], alias: trimmed };
        saveRegistry(businessId, devices);
        notify();
    },

    /**
     * Inserta o actualiza un dispositivo cuando aparece (al loguearse o
     * generar un evento). En Fase 3 esto se hará desde el cliente al
     * conectarse al canal de presencia.
     */
    upsertSeen(businessId: string, deviceId: string, userAgent: string): void {
        const devices = loadRegistry(businessId);
        const now = new Date().toISOString();
        const idx = devices.findIndex(d => d.device_id === deviceId);
        if (idx === -1) {
            devices.push({
                device_id: deviceId,
                business_id: businessId,
                alias: null,
                default_label: deriveDefaultLabelFromUA(userAgent),
                user_agent: userAgent,
                device_type: deriveDeviceTypeFromUA(userAgent),
                first_seen_at: now,
                last_seen_at: now,
            });
        } else {
            devices[idx] = {
                ...devices[idx],
                last_seen_at: now,
                user_agent: userAgent,
                default_label: deriveDefaultLabelFromUA(userAgent),
                device_type: deriveDeviceTypeFromUA(userAgent),
            };
        }
        saveRegistry(businessId, devices);
        notify();
    },

    subscribe(fn: () => void): () => void {
        subscribers.add(fn);
        return () => { subscribers.delete(fn); };
    },

    /** Útil para reset durante desarrollo. */
    reset(businessId: string): void {
        try {
            localStorage.removeItem(REGISTRY_KEY_PREFIX + businessId);
        } catch { /* no-op */ }
        notify();
    },
};
