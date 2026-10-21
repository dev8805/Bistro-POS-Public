/**
 * Utilidades centralizadas de zona horaria para el negocio.
 * Usa la zona configurada en la tabla `businesses.timezone` (default: America/Bogota).
 * No requiere dependencias externas — usa Intl.DateTimeFormat nativo.
 */

const DEFAULT_TIMEZONE = 'America/Bogota';

/**
 * Obtiene las partes de una fecha en la zona horaria del negocio.
 * Ejemplo: si son las 11pm UTC del 14 de febrero, en America/Bogota (UTC-5)
 * serían las 6pm del 14 de febrero → year=2026, month=2, day=14, hour=18, etc.
 */
const getPartsInTimezone = (date: Date, tz: string): Record<string, number> => {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const result: Record<string, number> = {};
    for (const part of parts) {
        if (part.type !== 'literal') {
            result[part.type] = parseInt(part.value, 10);
        }
    }
    return result;
};

/**
 * Devuelve el inicio del día (00:00:00) en la zona horaria del negocio,
 * representado como un objeto Date (en UTC internamente).
 * 
 * ¿Por qué es necesario? `new Date(year, month, day, 0, 0, 0)` usa la zona
 * del navegador. Si el usuario está en otra zona, el "inicio del día" sería
 * incorrecto respecto al negocio.
 */
export const startOfDayInTz = (date: Date, tz: string = DEFAULT_TIMEZONE): Date => {
    const parts = getPartsInTimezone(date, tz);
    // Formatear como ISO para que sea interpretado en la zona correcta
    const isoStr = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T00:00:00`;
    return fromTzToUTC(isoStr, tz);
};

/**
 * Devuelve el fin del día (23:59:59.999) en la zona horaria del negocio.
 */
export const endOfDayInTz = (date: Date, tz: string = DEFAULT_TIMEZONE): Date => {
    const parts = getPartsInTimezone(date, tz);
    const isoStr = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T23:59:59.999`;
    return fromTzToUTC(isoStr, tz);
};

/**
 * Convierte una fecha-hora "local" (en texto) a un Date UTC.
 * Ejemplo: "2026-02-14T00:00:00" en "America/Bogota" → Date = 2026-02-14T05:00:00Z
 */
const fromTzToUTC = (localISOStr: string, tz: string): Date => {
    // Creamos la fecha como si fuera UTC, sin milisegundos para el cálculo del offset
    const baseISO = localISOStr.split('.')[0]; 
    const msMatch = localISOStr.match(/\.(\d+)/);
    const ms = msMatch ? parseInt(msMatch[1].padEnd(3, '0'), 10) : 0;
    
    const asUTC = new Date(baseISO + 'Z');
    // Calculamos el offset de la zona horaria en ese instante
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false,
    });

    const inTz = formatter.formatToParts(asUTC);
    const tzParts: Record<string, number> = {};
    for (const part of inTz) {
        if (part.type !== 'literal') {
            tzParts[part.type] = parseInt(part.value, 10);
        }
    }

    // La fecha "en la zona" de nuestro asUTC (ambos no tienen milisegundos)
    const hour = tzParts.hour === 24 ? 0 : tzParts.hour;
    const tzDate = new Date(Date.UTC(
        tzParts.year,
        tzParts.month - 1,
        tzParts.day,
        hour,
        tzParts.minute,
        tzParts.second,
    ));

    // El offset es la diferencia entre UTC y la representación en la zona
    const offsetMs = tzDate.getTime() - asUTC.getTime();

    // Para obtener el UTC correcto, restamos el offset a la fecha COMPLETA (incluyendo sus milisegundos originales)
    const parsed = new Date(localISOStr + 'Z');
    return new Date(parsed.getTime() - offsetMs);
};

/**
 * Obtiene "ahora" como Date (ya es UTC internamente, como siempre en JS).
 * Se mantiene para claridad semántica.
 */
export const nowInTz = (): Date => new Date();

/**
 * Retrocede N días desde una fecha, respetando la zona horaria del negocio.
 * Devuelve el inicio del día resultante.
 */
export const subtractDaysInTz = (date: Date, days: number, tz: string = DEFAULT_TIMEZONE): Date => {
    const parts = getPartsInTimezone(date, tz);
    const local = new Date(parts.year, parts.month - 1, parts.day);
    local.setDate(local.getDate() - days);
    return startOfDayInTz(new Date(Date.UTC(
        local.getFullYear(), local.getMonth(), local.getDate(), 12
    )), tz);
};

/**
 * Inicio del mes actual en la zona del negocio.
 */
export const startOfMonthInTz = (date: Date, tz: string = DEFAULT_TIMEZONE): Date => {
    const parts = getPartsInTimezone(date, tz);
    const isoStr = `${parts.year}-${String(parts.month).padStart(2, '0')}-01T00:00:00`;
    return fromTzToUTC(isoStr, tz);
};

/**
 * Inicio del mes anterior en la zona del negocio.
 */
export const startOfLastMonthInTz = (date: Date, tz: string = DEFAULT_TIMEZONE): Date => {
    const parts = getPartsInTimezone(date, tz);
    let year = parts.year;
    let month = parts.month - 1;
    if (month === 0) {
        month = 12;
        year--;
    }
    const isoStr = `${year}-${String(month).padStart(2, '0')}-01T00:00:00`;
    return fromTzToUTC(isoStr, tz);
};

/**
 * Fin del mes anterior (último día 23:59:59.999) en la zona del negocio.
 */
export const endOfLastMonthInTz = (date: Date, tz: string = DEFAULT_TIMEZONE): Date => {
    const parts = getPartsInTimezone(date, tz);
    // Día 0 del mes actual = último día del mes anterior
    const lastDay = new Date(parts.year, parts.month - 1, 0).getDate();
    let year = parts.year;
    let month = parts.month - 1;
    if (month === 0) {
        month = 12;
        year--;
    }
    const isoStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59.999`;
    return fromTzToUTC(isoStr, tz);
};

/**
 * Formatea una fecha ISO/timestamptz para mostrar al usuario, usando la zona del negocio.
 */
export const formatDateInTz = (
    dateString: string,
    tz: string = DEFAULT_TIMEZONE,
    options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' }
): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-CO', { ...options, timeZone: tz });
};

export const formatTimeInTz = (
    dateString: string,
    tz: string = DEFAULT_TIMEZONE,
): string => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: tz });
};

export const formatDateTimeInTz = (
    dateString: string,
    tz: string = DEFAULT_TIMEZONE,
): string => {
    const date = new Date(dateString);
    return date.toLocaleString('es-CO', { timeZone: tz });
};

/**
 * Compara si dos fechas son el "mismo día" en la zona del negocio.
 */
export const isSameDayInTz = (date1: Date, date2: Date, tz: string = DEFAULT_TIMEZONE): boolean => {
    const p1 = getPartsInTimezone(date1, tz);
    const p2 = getPartsInTimezone(date2, tz);
    return p1.year === p2.year && p1.month === p2.month && p1.day === p2.day;
};

/**
 * Obtiene la fecha de "ayer" respecto a la zona del negocio.
 */
export const yesterdayInTz = (tz: string = DEFAULT_TIMEZONE): Date => {
    return subtractDaysInTz(new Date(), 1, tz);
};

/**
 * Retorna la fecha de hoy como string "YYYY-MM-DD" en la zona del negocio.
 * Útil para campos como `expense_date` donde necesitas solo la fecha sin hora.
 * Corrige el bug de `toISOString().split('T')[0]` que devuelve la fecha UTC
 * (puede ser el día siguiente si es tarde en la noche local).
 */
export const todayDateStringInTz = (tz: string = DEFAULT_TIMEZONE): string => {
    const parts = getPartsInTimezone(new Date(), tz);
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
};

/**
 * Convierte un Date (o string ISO) a string "YYYY-MM-DD" en la zona del negocio.
 * Reemplazo correcto de `new Date(x).toISOString().split('T')[0]`.
 */
export const toDateStringInTz = (date: Date | string, tz: string = DEFAULT_TIMEZONE): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const parts = getPartsInTimezone(d, tz);
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
};
