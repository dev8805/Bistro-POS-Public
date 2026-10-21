import { useMemo } from 'react';
import { useBusinessSettings } from '../context/BusinessSettingsContext';

// =====================================================
// Fuente única de verdad para métodos de pago.
// Unifica el mapeo nombre visible <-> categoría de BD <-> línea del reporte,
// reemplazando las tablas duplicadas que existían en App.tsx, los componentes
// de gasto/compra, ventas y caja.
// =====================================================

// Categorías estándar almacenadas en BD (orders.payment_method / cash_movements.payment_method)
export type DbCategory = 'cash' | 'card' | 'transfer' | 'nequi' | 'daviplata' | 'credit' | 'other';

// Líneas del REPORTE DIARIO donde puede caer un método
export type ReportLine = 'efectivo' | 'tarjeta' | 'linea' | 'otros' | 'credito';

// Etiquetas legibles de cada línea del reporte (para la UI de Ajustes)
export const REPORT_LINE_LABELS: Record<ReportLine, string> = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjetas',
    linea: 'Pagos en línea',
    otros: 'Otros',
    credito: 'Crédito',
};

// Normaliza un nombre de método a un id estable (minúsculas, sin tildes ni espacios)
export const normalizeMethodId = (name: string): string =>
    (name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .trim()
        .replace(/\s+/g, '_');

// id normalizado -> categoría de BD estándar (incluye alias en español y en id de BD)
const STD_MAP: Record<string, DbCategory> = {
    efectivo: 'cash', cash: 'cash',
    tarjeta: 'card', card: 'card',
    nequi: 'nequi',
    daviplata: 'daviplata',
    transferencia: 'transfer', transfer: 'transfer',
    credito: 'credit', credito_local: 'credit', credit: 'credit',
    otro: 'other', other: 'other',
};

// categoría de BD -> línea del reporte
const LINE_BY_CATEGORY: Record<DbCategory, ReportLine> = {
    cash: 'efectivo',
    card: 'tarjeta',
    transfer: 'linea',
    nequi: 'linea',
    daviplata: 'linea',
    credit: 'credito',
    other: 'otros',
};

/**
 * Devuelve la etiqueta legible en español para un medio de pago dado (ej. 'cash' -> 'Efectivo').
 */
export const formatPaymentMethodLabel = (method?: string): string => {
    if (!method) return 'Efectivo';
    const id = normalizeMethodId(method);
    switch (id) {
        case 'cash':
        case 'efectivo':
            return 'Efectivo';
        case 'card':
        case 'tarjeta':
            return 'Tarjeta';
        case 'transfer':
        case 'transferencia':
            return 'Transferencia';
        case 'nequi':
            return 'Nequi';
        case 'daviplata':
            return 'Daviplata';
        case 'credit':
        case 'credito':
            return 'Crédito';
        case 'other':
        case 'otro':
            return 'Otro';
        default:
            return method.charAt(0).toUpperCase() + method.slice(1);
    }
};

/**
 * Devuelve la categoría de BD estándar para un nombre/método, o null si es
 * un método personalizado (no estándar).
 */
export const toDbCategory = (name: string): DbCategory | null => {
    return STD_MAP[normalizeMethodId(name)] ?? null;
};

/**
 * Mapea un nombre visible al valor que se guarda en BD: la categoría estándar
 * si existe, o el id normalizado para métodos personalizados (ej. "Llave" -> "llave").
 */
export const toStoredMethod = (name: string): string => {
    const id = normalizeMethodId(name);
    return STD_MAP[id] ?? id;
};

/**
 * Línea del reporte para una clave de método (cruda de BD o nombre visible),
 * respetando las categorías personalizadas configuradas por el negocio.
 * Insensible a mayúsculas/tildes (fusiona "Llave"/"llave").
 */
export const reportLineFor = (
    rawMethod: string,
    categories?: Record<string, ReportLine>,
): ReportLine => {
    const id = normalizeMethodId(rawMethod);
    const std = STD_MAP[id];
    if (std) return LINE_BY_CATEGORY[std];
    return categories?.[id] ?? 'otros';
};

export interface BusinessPaymentMethod {
    id: string;        // id normalizado (clave estable)
    label: string;     // nombre visible configurado por el negocio
    mappedId: string;  // categoría de BD ('cash'/'card'/... o el id si es personalizado)
    reportLine: ReportLine;
    isCustom: boolean; // true si NO es un método estándar
}

/**
 * Métodos de pago reales del negocio (desde Ajustes), con su categoría de BD
 * y la línea del reporte a la que pertenecen. Fuente única para selectores.
 */
export const useBusinessPaymentMethods = (): BusinessPaymentMethod[] => {
    const { paymentMethods, paymentMethodCategories } = useBusinessSettings();
    return useMemo(() => paymentMethods.map((name) => {
        const id = normalizeMethodId(name);
        const std = STD_MAP[id];
        return {
            id,
            label: name,
            mappedId: std ?? id,
            reportLine: (std ? LINE_BY_CATEGORY[std] : (paymentMethodCategories?.[id] ?? 'otros')) as ReportLine,
            isCustom: !std,
        };
    }), [paymentMethods, paymentMethodCategories]);
};
