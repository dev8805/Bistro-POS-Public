/**
 * useEmployeePresence (Fase 3 — datos reales)
 *
 * Lista los empleados con sesión iniciada (`profiles.is_signed_in=true`) y los
 * cruza con el estado del canal de presencia singleton (`lib/presenceManager`)
 * para clasificarlos:
 *
 *   - is_signed_in=false                              → no se listan (Desconectado)
 *   - is_signed_in=true + en canal + actividad ≤3 min → activo
 *   - is_signed_in=true + (sin canal | sin actividad) → inactivo
 *
 * El watch de cambios de `is_signed_in` usa un canal con topic DISTINTO al de
 * presencia para no colisionar (Supabase no permite dos suscripciones al mismo
 * topic en el mismo cliente).
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { PresenceStatus } from '../lib/activityMockData';
import { presenceManager } from '../lib/presenceManager';

export interface PresenceEntry {
    user_id: string;
    user_name: string;
    user_role: string;
    device_id: string | null;
    device_label: string | null;
    device_type: string | null;
    is_signed_in: boolean;
    is_in_presence: boolean;
    login_at: string | null;
    last_activity_at: string | null;
    cash_shift_id: string | null;
    status: PresenceStatus;
}

interface SignedInProfile {
    id: string;
    full_name: string | null;
    role: string | null;
    last_login_at: string | null;
}

const ACTIVITY_RECENT_MIN = 3;
const STATUS_ORDER: Record<PresenceStatus, number> = { activo: 0, inactivo: 1, desconectado: 2 };

export const useEmployeePresence = () => {
    const { profile } = useAuth();
    const businessId = profile?.business_id;

    const [signedIn, setSignedIn] = useState<SignedInProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [isObserverOffline, setIsObserverOffline] = useState(!navigator.onLine);
    const [tick, setTick] = useState(0); // fuerza recálculo (presence change / tiempo)

    const fetchSignedIn = useCallback(async () => {
        if (!businessId) return;
        const { data } = await supabase
            .from('profiles')
            .select('id, full_name, role, last_login_at')
            .eq('business_id', businessId)
            .eq('is_signed_in', true)
            .eq('is_deleted', false);
        setSignedIn((data || []) as SignedInProfile[]);
        setLoading(false);
    }, [businessId]);

    useEffect(() => { fetchSignedIn(); }, [fetchSignedIn]);

    // Reaccionar a cambios del canal de presencia singleton.
    useEffect(() => {
        const unsub = presenceManager.onChange(() => setTick(t => t + 1));
        return unsub;
    }, []);

    // Modelo on-demand: mientras esta pantalla (observador) esté montada, pedir
    // a los emisores que refresquen su actividad. Al desmontar, dejar de pedir.
    useEffect(() => {
        presenceManager.setObserving(true);
        return () => presenceManager.setObserving(false);
    }, []);

    // Watch de is_signed_in en un topic distinto (no choca con el de presencia).
    useEffect(() => {
        if (!businessId) return;
        const watch = supabase
            .channel(`profiles-signedin-watch-${businessId}`)
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `business_id=eq.${businessId}` },
                (payload: any) => {
                    if (payload.new?.is_signed_in !== payload.old?.is_signed_in) fetchSignedIn();
                }
            )
            .subscribe();
        return () => { try { supabase.removeChannel(watch); } catch { /* no-op */ } };
    }, [businessId, fetchSignedIn]);

    // Recálculo periódico (la actividad envejece con el tiempo).
    useEffect(() => {
        const i = setInterval(() => setTick(t => t + 1), 30_000);
        return () => clearInterval(i);
    }, []);

    // Estado de conexión del observador.
    useEffect(() => {
        const on = () => setIsObserverOffline(false);
        const off = () => setIsObserverOffline(true);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => {
            window.removeEventListener('online', on);
            window.removeEventListener('offline', off);
        };
    }, []);

    const users = useMemo<PresenceEntry[]>(() => {
        const presenceMap = presenceManager.getUsers();
        const list = signedIn.map((p) => {
            const pres = presenceMap[p.id];
            const inPresence = !!pres;
            let status: PresenceStatus = 'inactivo';
            if (inPresence && pres?.last_activity_at) {
                const mins = (Date.now() - new Date(pres.last_activity_at).getTime()) / 60_000;
                status = mins <= ACTIVITY_RECENT_MIN ? 'activo' : 'inactivo';
            }
            return {
                user_id: p.id,
                user_name: p.full_name || 'Usuario',
                user_role: p.role || '',
                device_id: pres?.device_id ?? null,
                device_label: pres?.device_label ?? null,
                device_type: pres?.device_type ?? null,
                is_signed_in: true,
                is_in_presence: inPresence,
                login_at: p.last_login_at ?? pres?.login_at ?? null,
                last_activity_at: pres?.last_activity_at ?? null,
                cash_shift_id: pres?.cash_shift_id ?? null,
                status,
            };
        });
        return list.sort((a, b) => {
            const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
            if (s !== 0) return s;
            const at = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
            const bt = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
            return bt - at;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signedIn, tick]);

    const onlineCount = useMemo(() => users.filter(u => u.status === 'activo').length, [users]);
    const refresh = useCallback(() => fetchSignedIn(), [fetchSignedIn]);

    return { users, onlineCount, loading, isObserverOffline, refresh };
};
