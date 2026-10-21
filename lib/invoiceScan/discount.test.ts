import { describe, it, expect } from 'vitest';
import { distributeGlobalDiscount } from './discount';

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe('distributeGlobalDiscount', () => {
    it('devuelve ceros cuando el descuento es cero o negativo', () => {
        expect(distributeGlobalDiscount(0, [10000, 20000])).toEqual([0, 0]);
        expect(distributeGlobalDiscount(-500, [10000, 20000])).toEqual([0, 0]);
        expect(distributeGlobalDiscount(NaN, [10000, 20000])).toEqual([0, 0]);
    });

    it('devuelve ceros cuando la suma de los netos no es positiva', () => {
        expect(distributeGlobalDiscount(5000, [0, 0])).toEqual([0, 0]);
        expect(distributeGlobalDiscount(5000, [-100, 0])).toEqual([0, 0]);
    });

    it('devuelve un arreglo vacío sin líneas', () => {
        expect(distributeGlobalDiscount(5000, [])).toEqual([]);
    });

    it('reparte de forma proporcional al neto de cada línea', () => {
        expect(distributeGlobalDiscount(3000, [10000, 20000])).toEqual([1000, 2000]);
        expect(distributeGlobalDiscount(5000, [30000, 10000])).toEqual([3750, 1250]);
    });

    it('acota el descuento al total de la factura', () => {
        const netos = [100, 200];
        const partes = distributeGlobalDiscount(1000, netos);
        expect(sum(partes)).toBe(300);
        expect(partes).toEqual([100, 200]);
        partes.forEach((p, i) => expect(p).toBeLessThanOrEqual(netos[i]));
    });

    it('descuenta todo el neto cuando el descuento iguala el total', () => {
        expect(distributeGlobalDiscount(300, [100, 200])).toEqual([100, 200]);
    });

    it('asigna todo el descuento a la única línea', () => {
        expect(distributeGlobalDiscount(4500, [26560])).toEqual([4500]);
        expect(distributeGlobalDiscount(99999, [26560])).toEqual([26560]);
    });

    it('da partes iguales a netos iguales cuando el reparto es divisible', () => {
        expect(distributeGlobalDiscount(4, [50, 50])).toEqual([2, 2]);
        expect(distributeGlobalDiscount(900, [1000, 1000, 1000])).toEqual([300, 300, 300]);
    });

    it('separa a lo sumo 1 peso a los netos iguales cuando no es divisible', () => {
        // El descuento se reparte en pesos enteros y su suma debe conservarse:
        // el peso sobrante va a la línea de índice menor.
        expect(distributeGlobalDiscount(5, [50, 50])).toEqual([3, 2]);
        expect(distributeGlobalDiscount(1000, [1000, 1000, 1000])).toEqual([334, 333, 333]);
    });

    it('reparte entre netos muy dispares sin dar más descuento que el neto', () => {
        const netos = [1, 5_000_000];
        const partes = distributeGlobalDiscount(1000, netos);
        expect(sum(partes)).toBe(1000);
        partes.forEach((p, i) => {
            expect(Number.isInteger(p)).toBe(true);
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThanOrEqual(netos[i]);
        });
        expect(partes[0]).toBe(0);
    });

    it('conserva la suma exacta con residuos de reparto', () => {
        const netos = [7, 11, 13, 17, 19];
        const partes = distributeGlobalDiscount(10, netos);
        expect(sum(partes)).toBe(10);
        partes.forEach((p, i) => expect(p).toBeLessThanOrEqual(netos[i]));
    });

    it('no asigna descuento a las líneas con neto cero', () => {
        const partes = distributeGlobalDiscount(500, [0, 1000, 0]);
        expect(partes).toEqual([0, 500, 0]);
    });

    it('respeta el tope por línea con netos fraccionarios', () => {
        const netos = [0.4, 0.6];
        const partes = distributeGlobalDiscount(1, netos);
        partes.forEach((p, i) => expect(p).toBeLessThanOrEqual(Math.floor(netos[i])));
        expect(sum(partes)).toBe(0);
    });

    it('es determinista', () => {
        const netos = [12345, 6789, 1011];
        expect(distributeGlobalDiscount(4321, netos)).toEqual(distributeGlobalDiscount(4321, netos));
    });
});
