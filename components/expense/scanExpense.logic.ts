/**
 * Lógica pura del escaneo de gasto con IA.
 *
 * Funciones sin dependencias de React ni de red, para poder probarlas aisladas.
 * Las consume `ExpenseRegister.tsx` en `applyDetectedFields` tras recibir la
 * respuesta de la edge function `scan-expense`.
 */

/** Resultado que devuelve la edge function `scan-expense`. */
export interface ScanExpenseResult {
    amount: number;
    description: string;
    /** Categoría sugerida por la IA (una de las 11 fijas) o "" si no está segura. */
    category: string;
    supplierName: string;
    nit: string;
    date: string; // "YYYY-MM-DD" | ""
    error?: string;
}

export interface SupplierLite {
    id?: string;
    name: string;
    nit?: string | null;
}

const AMOUNT_MIN = 0.01;
const AMOUNT_MAX = 999_999_999.99;
const DESCRIPTION_MAX = 500;

/** Normaliza texto para comparación: sin acentos, minúsculas, espacios colapsados, sin espacios extremos. */
export const norm = (s?: string): string =>
    (s || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');

/** Normaliza un NIT quitando espacios, puntos y guiones. */
export const normNit = (s?: string | null): string =>
    (s || '').replace(/[\s.\-]/g, '');

/**
 * Interpreta un monto en formato latino (punto=miles, coma=decimales) y lo
 * devuelve como número americano. Cadenas no numéricas → 0.
 */
export const normalizeLatinAmount = (val: unknown): number => {
    if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
    if (!val) return 0;
    const str = String(val).trim().replace(/[^0-9.,]/g, '');
    if (!str) return 0;

    const hasDot = str.includes('.');
    const hasComma = str.includes(',');
    let clean = str;

    if (hasComma) {
        // La coma es el separador decimal; los puntos son de miles.
        clean = str.replace(/\./g, '').replace(',', '.');
    } else if (hasDot) {
        const parts = str.split('.');
        // "1.250" o "85.000" → punto de miles si el último grupo es de 3 dígitos.
        if (parts.length > 1 && parts[parts.length - 1].length === 3) {
            clean = str.replace(/\./g, '');
        }
    }

    const parsed = parseFloat(clean);
    return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Decide el valor del campo "Valor". Devuelve el monto (como string entero con
 * el que trabaja el input) si es numérico y está dentro de rango; si no, "".
 */
export const resolveAmountField = (amount: unknown): string => {
    const n = typeof amount === 'number' ? amount : normalizeLatinAmount(amount);
    if (!Number.isFinite(n) || n < AMOUNT_MIN || n > AMOUNT_MAX) return '';
    return String(Math.round(n));
};

/** Trunca la descripción a un máximo de 500 caracteres (prefijo de la original). */
export const truncateDescription = (str: unknown): string =>
    (typeof str === 'string' ? str : '').slice(0, DESCRIPTION_MAX);

export interface SupplierMatch {
    /** Proveedor existente emparejado o null. */
    matched: SupplierLite | null;
    /** Datos detectados sin match, para prefill de creación, o null. */
    detected: { name: string; nit: string } | null;
}

/**
 * Empareja el proveedor detectado contra la lista existente.
 * Prioridad: NIT (normalizado) → nombre (insensible a mayúsculas/acentos/espacios).
 * Si no hay match pero hay datos detectados, los devuelve para crear uno nuevo.
 */
export const matchSupplier = (
    suppliers: SupplierLite[],
    detected: { name?: string; nit?: string },
): SupplierMatch => {
    const name = (detected.name || '').trim();
    const nit = (detected.nit || '').trim();

    const byNit = nit
        ? suppliers.find((s) => normNit(s.nit) !== '' && normNit(s.nit) === normNit(nit))
        : undefined;
    if (byNit) return { matched: byNit, detected: null };

    const byName = name
        ? suppliers.find((s) => norm(s.name) === norm(name))
        : undefined;
    if (byName) return { matched: byName, detected: null };

    if (name || nit) return { matched: null, detected: { name, nit } };
    return { matched: null, detected: null };
};

/**
 * Empareja la categoría sugerida por la IA contra las categorías reales del
 * negocio. Devuelve el nombre EXACTO tal como está guardado (para que el selector
 * lo resalte y el motor lo reciba sin ambigüedad), o `null` si la sugerencia
 * llega vacía o no coincide con ninguna categoría existente.
 *
 * La comparación ignora mayúsculas, acentos y espacios extremos (`norm`), de modo
 * que "mercancia" de la IA calza con "MERCANCÍA" del negocio. Es una sugerencia:
 * el Usuario siempre puede cambiarla en el selector (Req 11.3).
 */
export const matchCategory = (
    suggested: string | null | undefined,
    categories: string[],
): string | null => {
    const target = norm(suggested);
    if (!target) return null;
    const found = (categories || []).find((c) => norm(c) === target);
    return found ?? null;
};

/** Valida que `date` sea una fecha de calendario real en formato YYYY-MM-DD. */
export const isRealCalendarDate = (date: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
    const [y, m, d] = date.split('-').map((n) => parseInt(n, 10));
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

/**
 * Decide la fecha del gasto. Usa `date` si es una fecha de calendario real y no
 * posterior a `today` (ambos "YYYY-MM-DD"); en cualquier otro caso usa `today`.
 */
export const resolveExpenseDate = (date: string | undefined, today: string): string => {
    const d = (date || '').trim();
    if (!isRealCalendarDate(d)) return today;
    // Comparación lexicográfica segura para fechas ISO YYYY-MM-DD.
    if (d > today) return today;
    return d;
};
