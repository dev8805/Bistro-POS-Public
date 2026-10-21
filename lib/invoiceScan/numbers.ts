/**
 * Aritmética del Escaneo_Unificado: interpretación del Formato_Numerico_Latino,
 * redondeo a pesos colombianos y reparto proporcional total-conservador.
 *
 * Módulo puro: no importa React, ni el cliente de Supabase, ni hace fetch.
 *
 * El criterio de `parseLatinNumber` es el mismo que ya usa el proyecto en
 * `normalizeLatinAmount` (`components/expense/scanExpense.logic.ts`) y en el
 * parseo embebido de `InventoryPurchase.tsx`, para que un mismo texto de la IA
 * se interprete igual en los tres flujos.
 */

/** Entrada numérica tal como puede llegar de la IA o de un input de la UI. */
export type LatinNumberInput = string | number | null | undefined;

/**
 * Interpreta un valor en Formato_Numerico_Latino (punto = miles,
 * coma = decimales) y lo devuelve como número americano.
 *
 * Reglas (idénticas a `normalizeLatinAmount`):
 * - Un número finito se devuelve tal cual; `NaN` e `Infinity` → `0`.
 * - Se descarta todo carácter que no sea dígito, punto o coma (`$`, espacios,
 *   letras, signos).
 * - Con coma presente, la coma es el separador decimal y los puntos son de
 *   miles: `"1.234,56"` → `1234.56`.
 * - Sin coma y con punto, el punto es de miles solo si el último grupo tiene
 *   exactamente 3 dígitos: `"8.100"` → `8100`, `"12.34"` → `12.34`.
 * - Cualquier entrada no numérica devuelve `0`.
 */
export const parseLatinNumber = (input: LatinNumberInput): number => {
    if (typeof input === 'number') return Number.isFinite(input) ? input : 0;
    if (!input) return 0;

    const str = String(input).trim().replace(/[^0-9.,]/g, '');
    if (!str) return 0;

    const hasComma = str.includes(',');
    const hasDot = str.includes('.');
    let clean = str;

    if (hasComma) {
        clean = str.replace(/\./g, '').replace(',', '.');
    } else if (hasDot) {
        const parts = str.split('.');
        if (parts.length > 1 && parts[parts.length - 1].length === 3) {
            clean = str.replace(/\./g, '');
        }
    }

    const parsed = parseFloat(clean);
    return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Redondea un valor a pesos enteros: Colombia opera sin centavos.
 * Entradas no finitas devuelven `0`, y nunca se devuelve `-0`.
 */
export const toPesos = (value: number): number => {
    if (!Number.isFinite(value)) return 0;
    const rounded = Math.round(value);
    return rounded === 0 ? 0 : rounded;
};

/**
 * Reparte `total` entre `weights` de forma proporcional y devuelve enteros
 * cuya suma es exactamente `toPesos(total)`.
 *
 * Método del resto mayor: cada posición recibe el piso de su parte exacta y
 * los pesos sobrantes van a las posiciones con mayor fracción pendiente. El
 * desempate es determinista: fracción descendente, luego peso descendente,
 * luego índice ascendente. La misma entrada produce siempre la misma salida.
 *
 * Casos borde:
 * - `weights` vacío → `[]`.
 * - `total` que redondea a `0` → arreglo de ceros.
 * - Pesos negativos, `NaN` o `Infinity` se tratan como `0`.
 * - Todos los pesos en `0` con total distinto de cero → reparto uniforme, para
 *   no perder pesos (el total siempre se conserva).
 * - `total` negativo → partes negativas cuya suma sigue siendo el total.
 */
export const splitProportional = (total: number, weights: number[]): number[] => {
    const n = weights.length;
    if (n === 0) return [];

    const target = toPesos(total);
    if (target === 0) return new Array<number>(n).fill(0);

    const isNegative = target < 0;
    const amount = Math.abs(target);

    const safeWeights = weights.map(w => (Number.isFinite(w) && w > 0 ? w : 0));
    const weightSum = safeWeights.reduce((acc, w) => acc + w, 0);

    // Sin pesos utilizables el reparto proporcional no está definido: se usa
    // uno uniforme, que sigue siendo determinista y conserva el total.
    const effective = weightSum > 0 ? safeWeights : new Array<number>(n).fill(1);
    const effectiveSum = weightSum > 0 ? weightSum : n;

    const shares = new Array<number>(n);
    const fractions = new Array<number>(n);
    let assigned = 0;

    for (let i = 0; i < n; i++) {
        const exact = (amount * effective[i]) / effectiveSum;
        const floor = Math.floor(exact);
        shares[i] = floor;
        fractions[i] = exact - floor;
        assigned += floor;
    }

    const order = shares
        .map((_, i) => i)
        .sort((a, b) => {
            if (fractions[b] !== fractions[a]) return fractions[b] - fractions[a];
            if (effective[b] !== effective[a]) return effective[b] - effective[a];
            return a - b;
        });

    let diff = amount - assigned;

    // Reparto del residuo entero por el método del resto mayor.
    for (let k = 0; diff > 0; k = (k + 1) % n) {
        shares[order[k]] += 1;
        diff -= 1;
    }

    // Red de seguridad: si el cálculo de los pisos sobre-asignó por error de
    // coma flotante, se devuelven los pesos empezando por la fracción menor.
    for (let k = n - 1; diff < 0; k = k === 0 ? n - 1 : k - 1) {
        if (shares[order[k]] > 0) {
            shares[order[k]] -= 1;
            diff += 1;
        }
    }

    return isNegative ? shares.map(s => (s === 0 ? 0 : -s)) : shares;
};
