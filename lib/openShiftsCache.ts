/**
 * openShiftsCache — Lista_Turnos_Abiertos_Cache (Req 3.1, 15.4)
 *
 * Caché local (localStorage) de la última lista conocida de turnos de caja con
 * `status = 'open'`, incluyendo el nombre del usuario que abrió cada turno.
 *
 * ¿Para qué sirve? El modelo "Usuario Eje" necesita saber, incluso sin internet,
 * quién tiene un turno de caja abierto. Al caer la conexión ya no se puede
 * consultar Supabase, así que se conserva esta lista para:
 *   - determinar si el usuario actual es Eje (su id figura en la lista),
 *   - identificar al Eje al cruzarla con el canal de presencia (`ejeOnline`),
 *   - avisar cuando hay varios turnos abiertos (multi-eje).
 *
 * Estando online se refresca con un fetch ligero de `cash_shifts`; sin conexión
 * se lee siempre desde la caché.
 */

import { supabase } from './supabase';

/** Un usuario con turno de caja abierto. */
export interface OpenShiftUser {
    userId: string;   // profiles.id / cash_shifts.opened_by
    userName: string; // profiles.full_name
}

const CACHE_KEY = 'bistro_open_shifts_cache';

/** Lee la lista cacheada de turnos abiertos. Nunca lanza: ante error devuelve []. */
export const getCachedOpenShifts = (): OpenShiftUser[] => {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        // Filtrar entradas malformadas por robustez.
        return parsed.filter((s: any): s is OpenShiftUser => s && typeof s.userId === 'string');
    } catch {
        return [];
    }
};

/** Persiste la lista de turnos abiertos en la caché local. */
const setCachedOpenShifts = (list: OpenShiftUser[]): void => {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(list));
    } catch {
        /* almacenamiento lleno o no disponible: no-op */
    }
};

/**
 * Fetch ligero de los turnos abiertos del negocio y actualización de la caché.
 * Devuelve la lista vigente (o la cacheada si falla la red / no hay conexión),
 * de modo que el llamador siempre reciba el mejor estado conocido.
 */
export const fetchAndCacheOpenShifts = async (businessId: string): Promise<OpenShiftUser[]> => {
    // Sin conexión: no intentar la red, devolver lo cacheado.
    if (!navigator.onLine) return getCachedOpenShifts();

    try {
        const { data, error } = await supabase
            .from('cash_shifts')
            // Embed por FK confirmada (cash_shifts_opened_by_fkey → profiles.full_name).
            .select('opened_by, opened_by_profile:profiles!cash_shifts_opened_by_fkey(full_name)')
            .eq('business_id', businessId)
            .eq('status', 'open');

        if (error) throw error;

        const list: OpenShiftUser[] = (data || [])
            .filter((row: any) => !!row.opened_by)
            .map((row: any) => ({
                userId: row.opened_by as string,
                userName: (row.opened_by_profile?.full_name as string) || 'Cajero',
            }));

        setCachedOpenShifts(list);
        return list;
    } catch {
        // Red caída o error transitorio: conservar la última lista conocida.
        return getCachedOpenShifts();
    }
};
