/**
 * Resolutor_Proveedor del Escaneo_Unificado: compara el Encabezado_Documento
 * contra los proveedores del Negocio_Activo.
 *
 * Módulo puro: no importa React, ni el cliente de Supabase, ni hace fetch.
 *
 * La lista `suppliers` llega **ya filtrada por negocio** desde `useSuppliers`
 * (que consulta con `.eq('business_id', businessId)`). Este módulo no conoce
 * el `business_id` ni lo recibe: no puede ampliar el alcance de la búsqueda
 * más allá del Negocio_Activo (Req 17.1).
 *
 * La normalización no se reimplementa aquí: `norm` (minúsculas, sin acentos,
 * sin espacios extremos) y `normNit` (sin espacios, puntos ni guiones) viven en
 * `components/expense/scanExpense.logic.ts` y son las mismas que usa hoy el
 * escaneo de gasto, igual que la cascada `matchSupplier` que se envuelve aquí
 * (Req 11.7).
 */

import { matchSupplier, type SupplierLite } from '../../components/expense/scanExpense.logic';
import type { ScanHeader, ScanSupplierDraft } from './types';
import type { Supplier } from '../../hooks/useSuppliers';

/** Parte del Encabezado_Documento que el resolutor necesita. */
export type SupplierHeaderInput = Pick<ScanHeader, 'supplierName' | 'nit' | 'phone'> & {
    supplierId?: string | null;
};

/**
 * Resultado de la cascada:
 * - `confirmed`: coincidió por NIT normalizado o por nombre normalizado (5.2, 5.3).
 * - `new`: hay al menos un dato detectado pero ninguna coincidencia (5.4, 5.5).
 * - `manual`: el encabezado llegó sin nombre y sin NIT (5.7).
 */
export type SupplierMatchResult<S extends SupplierLite = Supplier> =
    | { kind: 'confirmed'; supplier: S }
    | { kind: 'new'; name: string; nit: string; phone: string }
    | { kind: 'manual' };

/**
 * Empareja el proveedor del Encabezado_Documento contra los proveedores del
 * Negocio_Activo, en este orden:
 *
 *   0. ID sugerido por la IA (si coincidió en el análisis del membrete)
 *   1. NIT normalizado (ignora espacios, puntos y guiones)  → `confirmed` (5.1, 5.2)
 *   2. Nombre normalizado (ignora mayúsculas, acentos y espacios extremos)
 *                                                           → `confirmed` (5.3)
 *   3. Algún dato detectado sin coincidencia                → `new` (5.4, 5.5)
 *   4. Sin nombre y sin NIT                                 → `manual` (5.7)
 */
export const matchSupplierHeader = <S extends SupplierLite>(
    header: SupplierHeaderInput,
    suppliers: S[],
): SupplierMatchResult<S> => {
    // 0. Coincidencia directa por ID asignado por la IA
    if (header.supplierId) {
        const directSupplier = suppliers.find((s) => s.id === header.supplierId);
        if (directSupplier) {
            return { kind: 'confirmed', supplier: directSupplier as S };
        }
    }

    const { matched, detected } = matchSupplier(suppliers, {
        name: header.supplierName ?? undefined,
        nit: header.nit ?? undefined,
    });

    // `matchSupplier` devuelve el mismo elemento del arreglo recibido, así que
    // la coincidencia conserva el tipo concreto del proveedor de entrada.
    if (matched) return { kind: 'confirmed', supplier: matched as S };
    if (detected) return { kind: 'new', name: detected.name, nit: detected.nit, phone: header.phone ?? '' };
    return { kind: 'manual' };
};

/**
 * Traduce el resultado de la cascada al proveedor del Borrador_Escaneo.
 * Devuelve `null` en el caso `manual`: sin proveedor confirmado el paso no
 * avanza y la Finalizacion_Registro queda bloqueada (5.8).
 */
export const toSupplierDraft = <S extends SupplierLite>(
    result: SupplierMatchResult<S>,
): ScanSupplierDraft | null => {
    if (result.kind === 'confirmed') {
        return { kind: 'existing', id: result.supplier.id ?? '', name: result.supplier.name };
    }
    if (result.kind === 'new') {
        return { kind: 'new', name: result.name, nit: result.nit, phone: result.phone };
    }
    return null;
};
