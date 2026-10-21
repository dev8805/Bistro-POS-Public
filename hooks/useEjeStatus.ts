/**
 * useEjeStatus — determinación del rol offline del usuario (modelo Usuario Eje).
 *
 * El "Usuario Eje" es una condición operativa: tener un turno de caja abierto.
 * Sin internet, solo el Eje puede escribir en las mesas; los demás quedan en
 * solo lectura. Este hook resuelve, de forma barata y sin crear suscripciones
 * nuevas, quién es el Eje y si está en línea.
 *
 * Fuentes (todas reutilizadas, sin coste extra de Realtime):
 *   - `soyEje`: turno de caja abierto. Se deriva de la caché local
 *     `bistro_active_shift_<businessId>` (Req 3.4) y de figurar en la lista de
 *     turnos abiertos (Req 3.2). Se evita montar `useCashRegister` (pesado).
 *   - Lista de turnos abiertos: `lib/openShiftsCache` (localStorage), refrescada
 *     con un fetch ligero al entrar/al cambiar el estado del turno (Req 3.1).
 *   - `ejeOnline` / `ejeNombre`: cruce de `presenceManager.getUsers()` (usuarios
 *     presentes en el canal de presencia) con la lista de turnos abiertos
 *     (Req 15.4).
 *
 * NO crea suscripciones nuevas: lee del canal de presencia singleton ya montado
 * (`lib/presenceManager`) y de los eventos de turno que ya emite el sistema.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useAuth } from '../context/AuthContext';
import { presenceManager } from '../lib/presenceManager';
import { fetchAndCacheOpenShifts, getCachedOpenShifts, type OpenShiftUser } from '../lib/openShiftsCache';

export interface EjeStatus {
    /** El usuario actual tiene turno de caja abierto (puede escribir mesas offline). */
    soyEje: boolean;
    /** Hay al menos un Eje presente en el canal de presencia. */
    ejeOnline: boolean;
    /** Nombre del Eje para banners del observador (formato de un solo Eje). */
    ejeNombre: string | null;
    /** Hay dos o más turnos de caja abiertos. */
    multiEje: boolean;
    /** Nombres de todos los usuarios con turno abierto (aviso multi-eje). */
    ejesNombres: string[];
}

// Snapshot estable para SSR / primer render sin canal (evita bucles).
const EMPTY_PRESENCE: ReturnType<typeof presenceManager.getUsers> = {};
const getServerSnapshot = () => EMPTY_PRESENCE;

export const useEjeStatus = (): EjeStatus => {
    const { profile } = useAuth();
    const businessId = profile?.business_id;
    const userId = profile?.id;

    const [openShifts, setOpenShifts] = useState<OpenShiftUser[]>(() => getCachedOpenShifts());
    const [hasLocalShift, setHasLocalShift] = useState<boolean>(false);

    // Presencia: lectura del canal singleton ya montado (sin suscripción nueva).
    const subscribePresence = useCallback((cb: () => void) => presenceManager.onChange(cb), []);
    const presenceUsers = useSyncExternalStore(subscribePresence, presenceManager.getUsers, getServerSnapshot);

    // ¿Tengo un turno abierto cacheado localmente? (Req 3.4)
    const readLocalShift = useCallback(() => {
        if (!businessId) { setHasLocalShift(false); return; }
        setHasLocalShift(!!localStorage.getItem(`bistro_active_shift_${businessId}`));
    }, [businessId]);

    // Refresco ligero de la lista de turnos abiertos (Req 3.1). Online consulta
    // Supabase y actualiza la caché; offline lee de la caché sin tocar la red.
    const refreshOpenShifts = useCallback(async () => {
        if (!businessId) return;
        const list = await fetchAndCacheOpenShifts(businessId);
        setOpenShifts(list);
    }, [businessId]);

    useEffect(() => {
        readLocalShift();
        void refreshOpenShifts();

        // Refrescar ante transiciones de turno, recuperación de red y fin de sync.
        const handleShiftChange = () => { readLocalShift(); void refreshOpenShifts(); };
        const handleOnline = () => { void refreshOpenShifts(); };
        window.addEventListener('shift-opened', handleShiftChange);
        window.addEventListener('shift-closed', handleShiftChange);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline-sync-completed', handleShiftChange);

        return () => {
            window.removeEventListener('shift-opened', handleShiftChange);
            window.removeEventListener('shift-closed', handleShiftChange);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline-sync-completed', handleShiftChange);
        };
    }, [readLocalShift, refreshOpenShifts]);

    return useMemo<EjeStatus>(() => {
        const presentUserIds = Object.keys(presenceUsers);
        const presentEjes = openShifts.filter(s => presentUserIds.includes(s.userId));

        const soyEje = hasLocalShift || (!!userId && openShifts.some(s => s.userId === userId));
        const ejeOnline = presentEjes.length > 0;
        const ejesNombres = openShifts.map(s => s.userName);
        const multiEje = openShifts.length >= 2;
        // Con un único Eje conocido usamos su nombre (formato de Req 5.3 / 16.3);
        // con varios, preferimos un Eje presente para el banner del observador.
        const ejeNombre = openShifts.length === 1
            ? openShifts[0].userName
            : (presentEjes[0]?.userName ?? openShifts[0]?.userName ?? null);

        return { soyEje, ejeOnline, ejeNombre, multiEje, ejesNombres };
    }, [openShifts, presenceUsers, hasLocalShift, userId]);
};
