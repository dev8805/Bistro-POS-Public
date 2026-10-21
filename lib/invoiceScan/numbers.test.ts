import { describe, it, expect } from 'vitest';
import { parseLatinNumber, toPesos, splitProportional } from './numbers';

describe('parseLatinNumber', () => {
    it('interpreta el punto como separador de miles', () => {
        expect(parseLatinNumber('8.100')).toBe(8100);
        expect(parseLatinNumber('1.980')).toBe(1980);
        expect(parseLatinNumber('1.234.567')).toBe(1234567);
    });

    it('interpreta la coma como separador decimal', () => {
        expect(parseLatinNumber('0,44')).toBe(0.44);
        expect(parseLatinNumber('1.234,56')).toBe(1234.56);
        expect(parseLatinNumber('12,5')).toBe(12.5);
    });

    it('trata el punto como decimal cuando el último grupo no tiene 3 dígitos', () => {
        expect(parseLatinNumber('12.34')).toBe(12.34);
        expect(parseLatinNumber('0.5')).toBe(0.5);
    });

    it('descarta símbolos, espacios y letras', () => {
        expect(parseLatinNumber('$ 24.000')).toBe(24000);
        expect(parseLatinNumber(' 1.500 COP ')).toBe(1500);
    });

    it('devuelve el número finito tal cual', () => {
        expect(parseLatinNumber(1234.56)).toBe(1234.56);
        expect(parseLatinNumber(0)).toBe(0);
    });

    it('devuelve 0 ante entradas no numéricas', () => {
        expect(parseLatinNumber(null)).toBe(0);
        expect(parseLatinNumber(undefined)).toBe(0);
        expect(parseLatinNumber('')).toBe(0);
        expect(parseLatinNumber('sin valor')).toBe(0);
        expect(parseLatinNumber(NaN)).toBe(0);
        expect(parseLatinNumber(Infinity)).toBe(0);
    });
});

describe('toPesos', () => {
    it('redondea a entero', () => {
        expect(toPesos(1234.4)).toBe(1234);
        expect(toPesos(1234.5)).toBe(1235);
        expect(toPesos(26560)).toBe(26560);
    });

    it('nunca devuelve -0 ni valores no finitos', () => {
        expect(toPesos(-0.4)).toBe(0);
        expect(toPesos(NaN)).toBe(0);
        expect(toPesos(Infinity)).toBe(0);
    });
});

describe('splitProportional', () => {
    it('devuelve enteros cuya suma es exactamente el total', () => {
        const shares = splitProportional(100, [1, 1, 1]);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
        shares.forEach(s => expect(Number.isInteger(s)).toBe(true));
        expect(shares).toEqual([34, 33, 33]);
    });

    it('reparte de forma proporcional a los pesos', () => {
        expect(splitProportional(30000, [10000, 20000])).toEqual([10000, 20000]);
        expect(splitProportional(5000, [30000, 10000])).toEqual([3750, 1250]);
    });

    it('desempata de forma determinista por índice ascendente', () => {
        expect(splitProportional(5, [50, 50])).toEqual([3, 2]);
        expect(splitProportional(5, [50, 50])).toEqual(splitProportional(5, [50, 50]));
    });

    it('asigna cero a los pesos en cero cuando hay pesos positivos', () => {
        expect(splitProportional(7, [10, 0])).toEqual([7, 0]);
        expect(splitProportional(2, [1, 1, 0])).toEqual([1, 1, 0]);
    });

    it('reparte de forma uniforme cuando todos los pesos son cero', () => {
        const shares = splitProportional(10, [0, 0, 0]);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(10);
        expect(shares).toEqual([4, 3, 3]);
    });

    it('trata pesos inválidos como cero', () => {
        const shares = splitProportional(9, [NaN, -5, 3]);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(9);
        expect(shares).toEqual([0, 0, 9]);
    });

    it('devuelve ceros cuando el total redondea a cero', () => {
        expect(splitProportional(0, [10, 20])).toEqual([0, 0]);
        expect(splitProportional(0.4, [10, 20])).toEqual([0, 0]);
    });

    it('devuelve un arreglo vacío sin pesos', () => {
        expect(splitProportional(500, [])).toEqual([]);
    });

    it('conserva el total con montos negativos', () => {
        const shares = splitProportional(-100, [1, 1, 1]);
        expect(shares.reduce((a, b) => a + b, 0)).toBe(-100);
        expect(shares).toEqual([-34, -33, -33]);
    });
});
