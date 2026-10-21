// Detección de conectividad real, alineada con la doc de Chrome/MDN:
// navigator.onLine === false es 100% fiable (offline), pero === true NO
// garantiza internet: adaptadores virtuales (Hyper-V/WSL/Docker/cloudflared)
// mantienen onLine en true sin internet (Chromium #231912). Por eso, cuando
// onLine es true, confirmamos con una sonda HEAD a Supabase (mode 'no-cors'
// para evitar falsos positivos por CORS: solo un fallo de red real rechaza).

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/** True si hay internet real (navigator.onLine + sonda confirmada). */
export const checkRealInternet = async (): Promise<boolean> => {
    if (!navigator.onLine) return false;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), navigator.onLine ? 3000 : 5000);
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/`, {
            method: 'HEAD',
            mode: 'no-cors',
            cache: 'no-store',
            signal: controller.signal,
        });
        return true;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
};

/** True si NO hay internet real. Útil para decidir el camino offline antes de escribir. */
export const isRealOffline = async (): Promise<boolean> => !(await checkRealInternet());

/**
 * Heurística síncrona para clasificar un error como "de red" (sin internet real).
 * navigator.onLine puede mentir, así que también tratamos el TypeError de fetch.
 */
export const isNetworkError = (err: any): boolean =>
    !navigator.onLine ||
    err?.name === 'TypeError' ||
    (typeof err?.message === 'string' && err.message.toLowerCase().includes('fetch'));
