/**
 * lib/invoiceScan/productMatch.test.ts
 *
 * Pruebas por ejemplo de la cascada de cuatro niveles del Resolutor_Producto.
 * La prueba de propiedad de la cascada (Property 10) es la tarea 1.10.
 */

import { describe, expect, it } from 'vitest';
import { matchProductLine } from './productMatch';
import type { Product } from '../../hooks/useProducts';

/** Producto mínimo del catálogo, con los campos obligatorios de `Product`. */
const makeProduct = (over: Partial<Product> & { name: string }): Product => ({
    id: over.name.toLowerCase().replace(/\s+/g, '-'),
    business_id: 'negocio-1',
    name: over.name,
    type: 'simple',
    price: 1000,
    cost: 500,
    min_stock: 0,
    unit: 'und',
    image: '',
    category: 'Bebidas',
    is_active: true,
    is_for_sale: true,
    has_customization: false,
    customizable_options: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
});

describe('matchProductLine — nivel 1: apodo exacto', () => {
    it('empareja por apodo ignorando mayúsculas, acentos y espacios extremos', () => {
        const cocaCola = makeProduct({ name: 'Coca-Cola 400ml', nicknames: ['  GASEOSA Ñáñez '] });
        const catalogo = [cocaCola, makeProduct({ name: 'Agua Cristal' })];

        const match = matchProductLine('gaseosa nanez', catalogo);

        expect(match).toEqual({ product: cocaCola, level: 'nicknameExact' });
    });

    it('con dos productos que comparten el apodo exacto no resuelve y sigue a los niveles siguientes', () => {
        const arroz = makeProduct({ name: 'Arroz Diana 500g', nicknames: ['grano'] });
        const frijol = makeProduct({ name: 'Frijol Cargamanto', nicknames: ['grano'] });
        const granoLiteral = makeProduct({ name: 'grano' });

        // Nivel 1 y 2 quedan ambiguos (arroz y frijol); el nombre exacto resuelve.
        const match = matchProductLine('Grano', [arroz, frijol, granoLiteral]);

        expect(match).toEqual({ product: granoLiteral, level: 'nameExact' });
    });
});

describe('matchProductLine — nivel 2: apodo parcial', () => {
    it('empareja cuando un único apodo contiene el Nombre_OCR', () => {
        const leche = makeProduct({ name: 'Leche Entera Bolsa', nicknames: ['leche colanta bolsa'] });
        const catalogo = [leche, makeProduct({ name: 'Panela Redonda' })];

        const match = matchProductLine('colanta', catalogo);

        expect(match).toEqual({ product: leche, level: 'nicknamePartial' });
    });

    it('ignora los apodos vacíos en lugar de emparejar con cualquier texto', () => {
        const catalogo = [makeProduct({ name: 'Panela Redonda', nicknames: ['', '   '] })];

        expect(matchProductLine('aceite girasol', catalogo)).toBeNull();
    });
});

describe('matchProductLine — niveles 3 y 4: nombre', () => {
    it('empareja por nombre exacto normalizado', () => {
        const jabon = makeProduct({ name: 'Jabón Rey 300g' });
        const catalogo = [jabon, makeProduct({ name: 'Detergente Fab' })];

        const match = matchProductLine('  JABON REY 300G ', catalogo);

        expect(match).toEqual({ product: jabon, level: 'nameExact' });
    });

    it('empareja por nombre parcial cuando el resultado es único', () => {
        const aceite = makeProduct({ name: 'Aceite Girasol 1L' });
        const catalogo = [aceite, makeProduct({ name: 'Sal Refisal' })];

        const match = matchProductLine('aceite', catalogo);

        expect(match).toEqual({ product: aceite, level: 'namePartial' });
    });

    it('devuelve null cuando el nombre parcial deja más de un candidato', () => {
        const catalogo = [
            makeProduct({ name: 'Aceite Girasol 1L' }),
            makeProduct({ name: 'Aceite Oliva 500ml' }),
        ];

        expect(matchProductLine('aceite', catalogo)).toBeNull();
    });
});

describe('matchProductLine — filtro por tipo de producto', () => {
    it('nunca devuelve productos processed ni service, aunque el nombre coincida exacto', () => {
        const catalogo = [
            makeProduct({ name: 'Almuerzo Corriente', type: 'processed' }),
            makeProduct({ name: 'Domicilio', type: 'service' }),
        ];

        expect(matchProductLine('Almuerzo Corriente', catalogo)).toBeNull();
        expect(matchProductLine('Domicilio', catalogo)).toBeNull();
    });

    it('acepta insumos (simple con is_for_sale = false) como destino válido', () => {
        const insumo = makeProduct({ name: 'Harina de Trigo', is_for_sale: false, price: 0 });

        const match = matchProductLine('harina de trigo', [insumo]);

        expect(match).toEqual({ product: insumo, level: 'nameExact' });
    });
});

describe('matchProductLine — tolerancia a mayúsculas, espacios dobles y formato comercial', () => {
    it('empareja ignorando mayúsculas, minúsculas y espacios dobles internos', () => {
        const azucar = makeProduct({ name: 'Azúcar  Manuelita 1 Kg' });
        const catalogo = [azucar, makeProduct({ name: 'Sal Refisal' })];

        // Factura en mayúsculas sostenidas y un solo espacio
        const match = matchProductLine('AZÚCAR MANUELITA 1 KG', catalogo);

        expect(match).toEqual({ product: azucar, level: 'nameExact' });
    });

    it('empareja tolerando diferencias de separación de gramaje (500g vs 500 G)', () => {
        const lenteja = makeProduct({ name: 'Lenteja Diana 500g' });
        const catalogo = [lenteja, makeProduct({ name: 'Frijol Rojo' })];

        const match = matchProductLine('LENTEJA DIANA 500 G', catalogo);

        expect(match).toEqual({ product: lenteja, level: 'nameExact' });
    });

    it('empareja tolerando separadores de factura (*, -, /)', () => {
        const arroz = makeProduct({ name: 'Arroz del Llano 500g' });
        const catalogo = [arroz, makeProduct({ name: 'Aceite Diana' })];

        const match = matchProductLine('ARROZ DEL LLANO*500G', catalogo);

        expect(match).toEqual({ product: arroz, level: 'nameExact' });
    });

    it('empareja por código de barras con máxima prioridad (nivel barcode)', () => {
        const cafe = makeProduct({ name: 'Café Sello Rojo 500g', barcode: '770200101' });
        const catalogo = [cafe, makeProduct({ name: 'Té Verde' })];

        // Aunque el nombre en la factura sea distinto o abreviado, el barcode resuelve
        const match = matchProductLine('CAFE SELLO ROJO MOL', catalogo, '770200101');

        expect(match).toEqual({ product: cafe, level: 'barcode' });
    });

    it('empareja por conjunto de palabras clave (tokens) cuando hay palabras adicionales', () => {
        const arroz = makeProduct({ name: 'Arroz Diana 500g' });
        const catalogo = [arroz, makeProduct({ name: 'Aceite Diana 1000ml' })];

        // En la factura el proveedor puso "BLANCO" en medio
        const match = matchProductLine('ARROZ BLANCO DIANA 500G', catalogo);

        expect(match).toEqual({ product: arroz, level: 'tokenMatch' });
    });
});

describe('matchProductLine — entradas borde', () => {
    it('devuelve null con Nombre_OCR vacío o de solo espacios', () => {
        const catalogo = [makeProduct({ name: 'Arroz Diana 500g' })];

        expect(matchProductLine('', catalogo)).toBeNull();
        expect(matchProductLine('    ', catalogo)).toBeNull();
    });

    it('devuelve null con catálogo vacío y tolera productos sin apodos', () => {
        expect(matchProductLine('arroz', [])).toBeNull();
        expect(matchProductLine('zanahoria', [makeProduct({ name: 'Arroz Diana 500g' })])).toBeNull();
    });
});
