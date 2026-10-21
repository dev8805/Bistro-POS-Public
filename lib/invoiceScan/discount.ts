/**
 * Reparto del Descuento_Global entre las Linea_Factura del Escaneo_Unificado.
 *
 * Módulo puro: no importa React, ni el cliente de Supabase, ni hace fetch.
 *
 * El reparto proporcional lo hace `splitProportional` (método del resto mayor,
 * total-conservador y con desempate determinista). Aquí se agregan las dos
 * reglas propias del descuento: el tope contra el total de la factura y la
 * garantía de que ninguna línea recibe más descuento que su propio neto.
 */

import { splitProportional, toPesos } from './numbers';

/**
 * Reparte `discount` (Descuento_Global, en pesos) entre `netTotals` (los
 * Costo_Neto_Linea de cada línea) de forma proporcional al neto de cada línea.
 *
 * Garantías:
 * - Cada parte es un entero con `0 ≤ share_i ≤ net_i`.
 * - `Σ share_i = min(discount, Σ net_i)` redondeado a pesos enteros. El único
 *   caso en que la suma queda por debajo es con netos fraccionarios, donde el
 *   tope entero de una línea es `floor(net_i)`: repartir el peso faltante
 *   rompería `share_i ≤ net_i`, que es la garantía dura.
 * - Determinismo: la misma entrada produce siempre la misma salida.
 *
 * **Qué significa "líneas con netos iguales reciben partes iguales"**: dos
 * líneas con el mismo neto reciben partes que difieren **como máximo en 1
 * peso**, y cuando difieren, el peso extra va a la línea de índice menor. La
 * igualdad exacta solo es posible cuando el reparto es divisible: con netos
 * `[50, 50]` y un descuento de `4` las partes son `[2, 2]`, pero con un
 * descuento de `5` son `[3, 2]`, porque el descuento se reparte en pesos
 * enteros y su suma debe conservarse exactamente.
 *
 * Casos borde:
 * - `netTotals` vacío → `[]`.
 * - `discount ≤ 0`, no finito, o `Σ netTotals ≤ 0` → arreglo de ceros.
 * - `discount` mayor que el total → se acota al total (nunca se descuenta más
 *   de lo que suma la factura).
 * - Netos negativos, `NaN` o `Infinity` se tratan como `0`: esas líneas no
 *   reciben descuento.
 */
export const distributeGlobalDiscount = (discount: number, netTotals: number[]): number[] => {
    const n = netTotals.length;
    if (n === 0) return [];

    const zeros = () => new Array<number>(n).fill(0);

    const nets = netTotals.map(v => (Number.isFinite(v) && v > 0 ? v : 0));
    const netSum = nets.reduce((acc, v) => acc + v, 0);
    const requested = Number.isFinite(discount) ? discount : 0;

    if (requested <= 0 || netSum <= 0) return zeros();

    // Tope de cada línea en pesos enteros y tope global del reparto.
    const caps = nets.map(v => Math.floor(v));
    const capacity = caps.reduce((acc, v) => acc + v, 0);
    const target = Math.min(toPesos(Math.min(requested, netSum)), capacity);
    if (target <= 0) return zeros();

    const shares = splitProportional(target, nets);

    // Con netos enteros el reparto ya cumple `share_i ≤ net_i`, porque la parte
    // exacta de cada línea no supera su neto y el residuo solo cae en líneas
    // con fracción pendiente. Con netos fraccionarios sí puede sobrar 1 peso en
    // una línea, así que se recorta y se reubica en las que aún tienen margen,
    // conservando el total repartido.
    let excess = 0;
    for (let i = 0; i < n; i++) {
        if (shares[i] > caps[i]) {
            excess += shares[i] - caps[i];
            shares[i] = caps[i];
        }
    }

    if (excess > 0) {
        // Orden determinista de las líneas con margen: mayor margen, luego
        // mayor neto, luego menor índice.
        const order = shares
            .map((_, i) => i)
            .sort((a, b) => {
                const roomA = caps[a] - shares[a];
                const roomB = caps[b] - shares[b];
                if (roomB !== roomA) return roomB - roomA;
                if (nets[b] !== nets[a]) return nets[b] - nets[a];
                return a - b;
            });

        // Un peso por línea y por pasada: así dos líneas con el mismo neto
        // nunca terminan separadas por más de 1 peso.
        let progressed = true;
        while (excess > 0 && progressed) {
            progressed = false;
            for (const i of order) {
                if (excess === 0) break;
                if (shares[i] < caps[i]) {
                    shares[i] += 1;
                    excess -= 1;
                    progressed = true;
                }
            }
        }
    }

    return shares;
};
