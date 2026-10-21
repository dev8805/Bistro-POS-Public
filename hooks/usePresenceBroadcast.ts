
/**
 * usePresenceBroadcast (Fase 3 — Modelo "on-demand")
 *
 * Anuncia la presencia del usuario actual a través del canal singleton
 * (`lib/presenceManager`) y mantiene `last_activity_at`.
 *
 * Modelo on-demand (como LinkedIn/Slack/Discord): el estado "online" se deriva
 * del join del canal (una vez, barato). El refresco de "actividad" (activo/
 * inactivo) NO se publica de forma continua: la interacción del usuario solo
 * actualiza `last_activity_at` EN MEMORIA (`markActivity`), y la publicación
 * (`track`) la dispara la señal de observación que envía la pantalla de
 * Actividad (ver `presenceManager.setObserving` / handler `presence-watch`).
 * Resultado: cuando nadie observa, no hay gasto recurrente de presencia.
 *
 * NOTA (alias de dispositivos desactivados): `device_label`/`device_type` se
 * derivan del user_agent. La tabla `business_devices` está desactivada (vacía).
 */

import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { getDeviceInfo, deriveDefaultLabelFromUA, deriveDeviceTypeFromUA } from '../lib/deviceInfo';
import { presenceManager } from '../lib/presenceManager';

export const usePresenceBroadcast = (cashShiftId?: string | null) => {
    const { profile } = useAuth();
    const loginAtRef = useRef<string>(new Date().toISOString());
    const cashShiftRef = useRef<string | null>(cashShiftId ?? null);
    cashShiftRef.current = cashShiftId ?? null;

    useEffect(() => {
        if (!profile?.id || !profile.business_id) return;

        const device = getDeviceInfo();

        // Online: unirse al canal y anunciar (join + track inicial). Una sola vez.
        presenceManager.start(profile.business_id, {
            user_id: profile.id,
            user_name: profile.full_name || 'Usuario',
            user_role: profile.role || '',
            device_id: device.deviceId,
            device_label: deriveDefaultLabelFromUA(navigator.userAgent),
            device_type: deriveDeviceTypeFromUA(navigator.userAgent),
            login_at: loginAtRef.current,
            last_activity_at: new Date().toISOString(),
            cash_shift_id: cashShiftId ?? null,
        });

        // Actividad LOCAL: solo actualiza last_activity_at en memoria (sin red).
        // La publicación la dispara la señal de observación (modelo on-demand).
        const markActivity = () => presenceManager.markActivity({ cash_shift_id: cashShiftRef.current });
        const activityEvents: Array<keyof DocumentEventMap> = ['mousemove', 'keydown', 'touchstart'];
        activityEvents.forEach(ev => document.addEventListener(ev, markActivity, { passive: true }));

        // Al volver al frente, marcar actividad reciente (sin publicar).
        const handleVisibility = () => { if (!document.hidden) markActivity(); };
        document.addEventListener('visibilitychange', handleVisibility);

        // Recuperar red: re-anunciar (transición de Estado_Online).
        const handleOnline = () => presenceManager.retrack();
        window.addEventListener('online', handleOnline);

        return () => {
            activityEvents.forEach(ev => document.removeEventListener(ev, markActivity));
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('online', handleOnline);
            // No detenemos el canal aquí: el broadcaster vive mientras haya sesión.
            // presenceManager.stop() se llama en el logout (AuthContext).
        };
    }, [profile?.id, profile?.business_id, profile?.full_name, profile?.role]);

    // Transición significativa: cambio de turno de caja → publicar de inmediato.
    // Se omite el primer render (el start() inicial ya incluyó el cash_shift_id).
    const cashShiftMountedRef = useRef(false);
    useEffect(() => {
        if (!cashShiftMountedRef.current) { cashShiftMountedRef.current = true; return; }
        if (!profile?.id || !profile.business_id) return;
        presenceManager.touch({ cash_shift_id: cashShiftId ?? null });
    }, [cashShiftId]);
};
