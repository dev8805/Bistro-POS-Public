/**
 * Pruebas por ejemplo del Resolutor_Proveedor.
 * La prueba de propiedad (Property 11) es la tarea 1.12.
 */

import { describe, it, expect } from 'vitest';
import { matchSupplierHeader, toSupplierDraft } from './supplierMatch';

interface TestSupplier {
    id: string;
    name: string;
    nit?: string | null;
}

const suppliers: TestSupplier[] = [
    { id: 's1', name: 'Distribuidora Éxito S.A.S', nit: '900.123.456-7' },
    { id: 's2', name: 'Lácteos del Norte', nit: '800111222' },
    { id: 's3', name: 'Sin NIT Registrado', nit: '' },
    { id: 's4', name: 'Panadería Central', nit: null },
];

describe('matchSupplierHeader', () => {
    it('confirma por NIT ignorando puntos, guiones y espacios (5.1, 5.2)', () => {
        const result = matchSupplierHeader({ supplierName: null, nit: ' 900 123.456 - 7 ', phone: null }, suppliers);

        expect(result).toEqual({ kind: 'confirmed', supplier: suppliers[0] });
    });

    it('prioriza el NIT sobre el nombre cuando apuntan a proveedores distintos (5.1, 5.3)', () => {
        const result = matchSupplierHeader(
            { supplierName: 'Lácteos del Norte', nit: '900123456-7', phone: null },
            suppliers,
        );

        expect(result).toEqual({ kind: 'confirmed', supplier: suppliers[0] });
    });

    it('confirma por nombre ignorando mayúsculas, acentos y espacios extremos (5.3)', () => {
        const result = matchSupplierHeader(
            { supplierName: '  LACTEOS DEL NORTE  ', nit: '999999999', phone: null },
            suppliers,
        );

        expect(result).toEqual({ kind: 'confirmed', supplier: suppliers[1] });
    });

    it('confirma por nombre cuando el proveedor almacenado no tiene NIT (5.3)', () => {
        const result = matchSupplierHeader({ supplierName: 'panaderia central', nit: null, phone: null }, suppliers);

        expect(result).toEqual({ kind: 'confirmed', supplier: suppliers[3] });
    });

    it('no empareja NITs vacíos entre sí (5.1)', () => {
        const result = matchSupplierHeader({ supplierName: 'Proveedor Nuevo', nit: '.-', phone: null }, suppliers);

        expect(result).toEqual({ kind: 'new', name: 'Proveedor Nuevo', nit: '.-', phone: '' });
    });

    it('devuelve proveedor nuevo con los datos leídos cuando nada coincide (5.4, 5.5)', () => {
        const result = matchSupplierHeader(
            { supplierName: '  Carnes El Novillo  ', nit: ' 901555444-1 ', phone: null },
            suppliers,
        );

        expect(result).toEqual({ kind: 'new', name: 'Carnes El Novillo', nit: '901555444-1', phone: '' });
    });

    it('devuelve proveedor nuevo con solo el nombre detectado (5.4)', () => {
        const result = matchSupplierHeader({ supplierName: 'Verduras La Plaza', nit: null, phone: null }, suppliers);

        expect(result).toEqual({ kind: 'new', name: 'Verduras La Plaza', nit: '', phone: '' });
    });

    it('exige selección manual cuando el encabezado llega sin nombre y sin NIT (5.7)', () => {
        expect(matchSupplierHeader({ supplierName: null, nit: null, phone: null }, suppliers)).toEqual({ kind: 'manual' });
        expect(matchSupplierHeader({ supplierName: '   ', nit: '  ', phone: null }, suppliers)).toEqual({ kind: 'manual' });
    });

    it('con el catálogo del negocio vacío nunca confirma un proveedor (17.1)', () => {
        const result = matchSupplierHeader({ supplierName: 'Lácteos del Norte', nit: '800111222', phone: null }, []);

        expect(result).toEqual({ kind: 'new', name: 'Lácteos del Norte', nit: '800111222', phone: '' });
    });
});

describe('toSupplierDraft', () => {
    it('traduce una coincidencia a proveedor existente del borrador (5.2)', () => {
        const result = matchSupplierHeader({ supplierName: null, nit: '800111222', phone: null }, suppliers);

        expect(toSupplierDraft(result)).toEqual({
            kind: 'existing',
            id: 's2',
            name: 'Lácteos del Norte',
        });
    });

    it('traduce un proveedor nuevo conservando nombre y NIT (5.6)', () => {
        const result = matchSupplierHeader({ supplierName: 'Carnes El Novillo', nit: '901555444-1', phone: '3101234567' }, suppliers);

        expect(toSupplierDraft(result)).toEqual({
            kind: 'new',
            name: 'Carnes El Novillo',
            nit: '901555444-1',
            phone: '3101234567',
        });
    });

    it('no produce proveedor cuando hace falta selección manual (5.7, 5.8)', () => {
        const result = matchSupplierHeader({ supplierName: null, nit: null, phone: null }, suppliers);

        expect(toSupplierDraft(result)).toBeNull();
    });
});
