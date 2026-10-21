/**
 * useDeviceAliases (Fase 3 — datos reales)
 *
 * Lee y administra `business_devices` en Supabase. Mantiene la misma interfaz
 * que la versión mock: `devices`, `resolveLabel`, `getDevice`, `setAlias`.
 *
 * `resolveLabel`/`getDevice` resuelven contra el estado cargado (síncrono), por
 * lo que la UI (PresenceList, EventDetailModal) no cambia.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { DeviceType } from '../lib/deviceInfo';

export interface BusinessDevice {
    device_id: string;
    business_id: string;
    alias: string | null;
    default_label: string;
    user_agent: string;
    device_type: DeviceType;
    first_seen_at: string;
    last_seen_at: string;
}

export const useDeviceAliases = () => {
    const { profile } = useAuth();
    const businessId = profile?.business_id;
    const [devices, setDevices] = useState<BusinessDevice[]>([]);

    const fetchDevices = useCallback(async () => {
        if (!businessId) return;
        const { data } = await supabase
            .from('business_devices')
            .select('*')
            .eq('business_id', businessId)
            .order('last_seen_at', { ascending: false });
        if (data) setDevices(data as BusinessDevice[]);
    }, [businessId]);

    useEffect(() => { fetchDevices(); }, [fetchDevices]);

    const byId = useMemo(() => {
        const m: Record<string, BusinessDevice> = {};
        devices.forEach(d => { m[d.device_id] = d; });
        return m;
    }, [devices]);

    const getDevice = useCallback(
        (deviceId: string | null | undefined): BusinessDevice | null =>
            deviceId ? (byId[deviceId] ?? null) : null,
        [byId]
    );

    const resolveLabel = useCallback(
        (deviceId: string | null | undefined): string => {
            if (!deviceId) return 'Dispositivo desconocido';
            const d = byId[deviceId];
            if (!d) return 'Dispositivo desconocido';
            return d.alias || d.default_label;
        },
        [byId]
    );

    const setAlias = useCallback(async (deviceId: string, alias: string | null) => {
        const trimmed = alias?.trim() || null;
        // Optimista en UI
        setDevices(prev => prev.map(d => d.device_id === deviceId ? { ...d, alias: trimmed } : d));
        try {
            await supabase.from('business_devices').update({ alias: trimmed }).eq('device_id', deviceId);
        } catch (err) {
            console.warn('[useDeviceAliases] No se pudo guardar alias:', err);
            fetchDevices(); // revertir al estado real si falló
        }
    }, [fetchDevices]);

    return { devices, resolveLabel, getDevice, setAlias };
};
