/**
 * auditClient — Audit_Logger_Cliente
 *
 * Registra eventos de autenticación (login.success, logout) llamando al RPC
 * `log_auth_event` en Supabase. El RPC deriva user_id/business_id del JWT, así
 * que el cliente no puede falsear a quién pertenece el evento.
 *
 * Es best-effort: si falla, no interrumpe el login/logout (try/catch).
 */

import { supabase } from './supabase';
import { getDeviceInfo } from './deviceInfo';

type AuthAction = 'login.success' | 'logout';

/**
 * Bypass temporal (solo localhost) para NO registrar eventos de auth ni marcar
 * presencia (`is_signed_in`) en Supabase. Se activa con:
 *
 *   localStorage.setItem('bistro_skip_audit', '1')
 *
 * y se desactiva con:
 *
 *   localStorage.removeItem('bistro_skip_audit')
 *
 * El guard `hostname === 'localhost'` blinda que este flag no tenga efecto en
 * producción ni en dev.posbistro.online aunque quede accidentalmente puesto.
 * Para eliminar este bypass por completo: borrar esta función y sus tres usos.
 */
const shouldSkipAudit = (): boolean => {
    try {
        if (typeof window === 'undefined') return false;
        if (window.location.hostname !== 'localhost') return false;
        return localStorage.getItem('bistro_skip_audit') === '1';
    } catch {
        return false;
    }
};

export const auditAuthEvent = async (
    action: AuthAction,
    extra?: { auth_provider?: string }
): Promise<void> => {
    if (shouldSkipAudit()) {
        console.info('[auditClient] Bypass activo — no se registra', action);
        return;
    }
    try {
        const device = getDeviceInfo();
        await supabase.rpc('log_auth_event', {
            p_action: action,
            p_metadata: {
                auth_provider: extra?.auth_provider ?? null,
                device_id: device.deviceId,
                device_label: device.defaultLabel,
                user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
            },
        });
    } catch (err) {
        // Best-effort: la auditoría no debe bloquear el flujo de auth.
        console.warn('[auditClient] No se pudo registrar evento de auth:', err);
    }
};

/**
 * Marca la sesión como iniciada en profiles (modelo de presencia Opción B).
 *
 * `loginAt` debe ser la hora REAL del último sign-in (`session.user.last_sign_in_at`),
 * no la hora actual. Así la hora "desde HH:MM" es estable: aunque el evento
 * SIGNED_IN se redispare por reconexión/recarga/foco, siempre se escribe el mismo
 * valor (el del login con credenciales) y no salta. Fallback a now() si no viene.
 * Best-effort.
 */
export const markSignedIn = async (userId: string, loginAt?: string | null): Promise<void> => {
    if (shouldSkipAudit()) {
        console.info('[auditClient] Bypass activo — no se marca is_signed_in=true');
        return;
    }
    try {
        await supabase
            .from('profiles')
            .update({ is_signed_in: true, last_login_at: loginAt ?? new Date().toISOString() })
            .eq('id', userId);
    } catch (err) {
        console.warn('[auditClient] No se pudo marcar is_signed_in=true:', err);
    }
};

/**
 * Marca la sesión como cerrada en profiles. Debe llamarse ANTES de signOut()
 * para que el observador vea "Desconectado" aunque falle el untrack.
 * Best-effort.
 */
export const markSignedOut = async (userId: string): Promise<void> => {
    if (shouldSkipAudit()) {
        console.info('[auditClient] Bypass activo — no se marca is_signed_in=false');
        return;
    }
    try {
        await supabase
            .from('profiles')
            .update({ is_signed_in: false, last_logout_at: new Date().toISOString() })
            .eq('id', userId);
    } catch (err) {
        console.warn('[auditClient] No se pudo marcar is_signed_in=false:', err);
    }
};


/**
 * Registra un evento AGRUPADO de ajuste de inventario (una sola entrada en el
 * visor con el desglose de productos). Las mermas por ajuste ya no se auditan
 * una por una (el trigger las ignora). El actor y el negocio se derivan del JWT.
 * Best-effort: no interrumpe el guardado del conteo.
 */
export interface InventoryAdjustmentItem {
    name: string;
    quantity: number;
    value: number;
    unit: string;
}

export const logInventoryAdjustment = async (items: InventoryAdjustmentItem[]): Promise<void> => {
    if (!items || items.length === 0) return;
    try {
        await supabase.rpc('log_inventory_adjustment', { p_items: items });
    } catch (err) {
        console.warn('[auditClient] No se pudo registrar el ajuste de inventario:', err);
    }
};
