/**
 * Comparacion_Unidad y detección del caso de unidad del Escaneo_Unificado.
 *
 * Módulo puro: no importa React, `supabase` ni hace fetch. Recibe el producto
 * ya cargado por `useProducts` (con `product_purchase_units` embebido).
 */

import type { Product } from '../../hooks/useProducts';
import type { ScanUnitCase } from './types';

/**
 * Forma mínima del producto que necesita la detección de unidad: la
 * Unidad_Venta (`unit`) y las Unidad_Compra configuradas
 * (`product_purchase_units`, tal como las trae `useProducts`).
 */
export type ProductWithPurchaseUnits = Pick<Product, 'unit' | 'product_purchase_units'>;

/** Resultado de `detectUnitCase`: caso detectado y factor a aplicar. */
export interface UnitCaseResult {
    unitCase: ScanUnitCase;
    /**
     * Factor por el que se multiplica la cantidad leída. `1` en los casos
     * `none` y `sale`, el guardado en `known`, y `null` en `unknown`
     * (todavía hay que preguntarlo al Usuario).
     */
    conversionFactor: number | null;
    /** `unit_name` de la Unidad_Compra que coincidió, solo en el caso `known`. */
    matchedUnitName: string | null;
}

/** Resultado de `applyUnitConversion`, en Unidad_Venta. */
export interface UnitConversionResult {
    /** Cantidad en Unidad_Venta: `ocrQuantity × factor`. */
    quantity: number;
    /** Costo por Unidad_Venta derivado: `lineTotal / quantity`. */
    unitCost: number;
    /** Total de la línea en pesos: se conserva intacto (invariante). */
    lineTotal: number;
}

/**
 * Comparacion_Unidad: normaliza un nombre de unidad para poder compararlo.
 *
 * Ignora mayúsculas, acentos, espacios extremos, espacios internos repetidos y
 * plurales simples finales. Los umbrales de longitud (más de 4 para `-es`, más
 * de 3 para `-s`) protegen las abreviaturas cortas: `kg`, `cj`, `und`, `lb`
 * quedan intactas.
 */
export const normalizeUnit = (u: string | null | undefined): string => {
    if (!u) return '';

    const withoutAccents = u
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    let s = withoutAccents
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');

    if (s.endsWith('es') && s.length > 4) return s.slice(0, -2);
    if (s.endsWith('s') && s.length > 3) return s.slice(0, -1);

    return s;
};

/**
 * Extrae el factor de conversión o empaque contenido en el nombre del producto
 * de la factura (típico en facturas colombianas de abarrotes y distribuidores).
 *
 * Ejemplos soportados:
 * - "X6", "X 24", "X12", "X 50"
 * - "DISPLAY X 24", "DISP X 12", "PAQ X 6", "CJ X 30", "CUBETA X 30", "TIRA X 12"
 * - Multiplicaciones de empaque: "3X4" (= 12), "4X6" (= 24)
 * - Packs verbales: "SIX PACK" (= 6), "TRI PACK" (= 3), "FOUR PACK" (= 4), "DUOPACK" (= 2)
 * - Sufijos de unidades: "100 UND", "50 U", "24 UNIDADES"
 *
 * Filtros de protección:
 * - Ignora gramajes y volúmenes: "500G", "1KG", "900ML", "1.5L"
 * - Ignora dimensiones físicas: "20X30 CM", "30X40 CMS"
 * - Ignora promociones de venta: "2X1", "3X2"
 */
export const extractConversionFactorFromName = (
    name: string | null | undefined,
): number | null => {
    if (!name) return null;
    const clean = name.trim();
    if (!clean) return null;

    // 1. Contenedor explícito con "X <número>" (ej: "DISPLAY X 24", "PAQ X 12", "CUBETA X 30", "PACA X 25")
    const containerMatch = clean.match(
        /\b(?:DISPLAY|DISP|DSP|PAQUETE|PAQ|PQ|PTE|CAJA|CJA|CJ|CUBETA|TIRA|BOLSA|BLS|PACK|PACA|PCA)\s*X\s*(\d+)\b/i,
    );
    if (containerMatch) {
        const factor = parseInt(containerMatch[1], 10);
        if (factor > 1 && factor < 10000) return factor;
    }

    // 2. Packs verbales comunes (ej: "SIX PACK", "FOUR PACK", "TRI PACK", "TWELVE PACK")
    if (/\b(?:SIX[\s-]*PACK)\b/i.test(clean)) return 6;
    if (/\b(?:FOUR[\s-]*PACK)\b/i.test(clean)) return 4;
    if (/\b(?:TRI[\s-]*PACK)\b/i.test(clean)) return 3;
    if (/\b(?:TWELVE[\s-]*PACK)\b/i.test(clean)) return 12;
    if (/\b(?:DUO[\s-]*PACK|BI[\s-]*PACK)\b/i.test(clean)) return 2;
    if (/\b(?:EIGHT[\s-]*PACK|OCTO[\s-]*PACK)\b/i.test(clean)) return 8;

    const FORBIDDEN_SUFFIXES = ['cm', 'cms', 'mm', 'm', 'mt', 'mts', 'pulg', 'in', 'g', 'gr', 'kg', 'ml', 'l', 'cc', 'oz', 'lb', 'lbs'];

    // 3. Multiplicación de empaque tipo matriz (ej: "3X4" = 12, "4X6" = 24)
    // Se protege contra dimensiones (ej: "20X30 CM") y promociones ("2X1", "3X2")
    const matrixMatch = clean.match(
        /\b(\d{1,2})\s*[xX]\s*(\d{1,2})\b(?:\s*([a-zA-Z]+))?/i,
    );
    if (matrixMatch) {
        const n1 = parseInt(matrixMatch[1], 10);
        const n2 = parseInt(matrixMatch[2], 10);
        const suffix = (matrixMatch[3] || '').toLowerCase();
        const isPromo = (n1 === 2 && n2 === 1) || (n1 === 3 && n2 === 2) || (n1 === 4 && n2 === 3);
        if (!isPromo && n1 >= 2 && n2 >= 2 && !FORBIDDEN_SUFFIXES.includes(suffix)) {
            const product = n1 * n2;
            if (product > 1 && product < 1000) return product;
        }
    }

    // 4. "X <número>" o "X<número>" suelto (ej: "CERVEZA POKER X24", "OREO 36G X 12", "ATUN 160G X3")
    // Se asegura de que no esté seguido de unidades de masa, volumen o longitud (ej: "X 500G" no aplica)
    const xNumberMatch = clean.match(
        /\bX\s*(\d+)\b(?:\s*([a-zA-Z]+))?/i,
    );
    if (xNumberMatch) {
        const factor = parseInt(xNumberMatch[1], 10);
        const suffix = (xNumberMatch[2] || '').toLowerCase();
        if (!FORBIDDEN_SUFFIXES.includes(suffix) && factor > 1 && factor < 10000) {
            return factor;
        }
    }

    // 5. Sufijos explícitos de unidades (ej: "VASOS 7OZ 100 UND", "SERVILLETAS 50 UNIDADES", "50 U")
    const unitSuffixMatch = clean.match(
        /\b(\d+)\s*(?:und|unds|unid|unidades|un)\b/i,
    );
    if (unitSuffixMatch) {
        const factor = parseInt(unitSuffixMatch[1], 10);
        if (factor > 1 && factor < 10000) return factor;
    }

    // 6. Conteo de empaque entre paréntesis o corchetes (ej: "FRESH CITRUS 400ML PET (12)NVO", "VIR(30)", "(24)")
    const parenMatch = clean.match(
        /[\(\[]\s*(?:[xX]\s*)?(\d{1,3})\s*(?:nvo|nva)?\s*[\)\]]/i,
    );
    if (parenMatch) {
        const factor = parseInt(parenMatch[1], 10);
        if (factor > 1 && factor < 1000) return factor;
    }

    return null;
};

/**
 * Limpia menciones de empaques mayoristas del nombre del producto leído en la
 * factura, para sugerir un nombre comercial limpio adecuado para venta al detal.
 *
 * Ejemplos:
 * - "CERV POKER LATA 330ML CJ X 24" -> "CERV POKER LATA 330ML"
 * - "GALLETA OREO DISPLAY X 12" -> "GALLETA OREO"
 * - "PACA X 25 ARROZ DIANA 500G" -> "ARROZ DIANA 500G"
 * - "SIX PACK CERVEZA CORONA" -> "CERVEZA CORONA"
 * - "VASOS 7OZ 100 UND" -> "VASOS 7OZ"
 * - "FRESH CITRUS 400ML PET (12)NVO" -> "FRESH CITRUS 400ML PET"
 * - "COCA-COLA 350ML VIR(30)" -> "COCA-COLA 350ML VIR"
 */
export const cleanPackagingFromName = (
    name: string | null | undefined,
): string => {
    if (!name) return '';
    let clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) return '';

    const FORBIDDEN_SUFFIXES = '(?:cm|cms|mm|m|mt|mts|pulg|in|g|gr|kg|ml|l|cc|oz|lb|lbs)';

    // 0. Prefijos de numeración de renglón y símbolos de inicio (ej: "1 - ", "1.- ", "1. ", "1) ", "* ", "#1 ", "7 - * ")
    clean = clean.replace(/^(?:#?\d+[\s.)\-_:–—*]+\s*|\s*[*•–—_/-]+\s*)+/g, '');

    // 1. Contenedor explícito con "X <número>" (ej: "DISPLAY X 24", "PAQ X 12", "CUBETA X 30", "CJ X 24", "PACA X 25")
    clean = clean.replace(
        /\b(?:DISPLAY|DISP|DSP|PAQUETE|PAQ|PQ|PTE|CAJA|CJA|CJ|CUBETA|TIRA|BOLSA|BLS|PACK|PACA|PCA)\s*X\s*\d+\b/gi,
        '',
    );

    // 2. Packs verbales comunes (ej: "SIX PACK", "FOUR PACK", "TRI PACK")
    clean = clean.replace(
        /\b(?:SIX|FOUR|TRI|TWELVE|DUO|BI|EIGHT|OCTO)[\s-]*PACK\b/gi,
        '',
    );

    // 3. Multiplicación de empaque (ej: "3X4", "4X6") que no esté seguida de unidades de medida
    clean = clean.replace(
        new RegExp(`\\b\\d{1,2}\\s*[xX]\\s*\\d{1,2}\\b(?!\\s*${FORBIDDEN_SUFFIXES})`, 'gi'),
        '',
    );

    // 4. "X <número>" o "X<número>" que no esté seguido de unidades de medida (ej: "X24", "X 12")
    clean = clean.replace(
        new RegExp(`\\bX\\s*\\d+\\b(?!\\s*${FORBIDDEN_SUFFIXES})`, 'gi'),
        '',
    );

    // 5. Conteo de empaque entre paréntesis o corchetes (ej: "(12)", "(30)", "(24)", "VIR(30)", "(12)NVO", "(X12)", "[24]")
    // y sufijos de novedad/presentación asociados (ej: "NVO", "NVA")
    clean = clean.replace(
        /[\(\[]\s*(?:[xX]\s*)?\d{1,3}\s*[\)\]](?:\s*(?:NVO|NVA)\b)?/gi,
        '',
    );

    // 6. Sufijo aislado "NVO" o "NVA" al final del nombre (ej: "PET NVO")
    clean = clean.replace(/\s+\b(?:NVO|NVA)\.?\s*$/gi, '');

    // 7. Sufijos de unidades (ej: "100 UND", "50 UNIDADES", "50 U")
    clean = clean.replace(
        /\b\d+\s*(?:und|unds|unid|unidades|un)\b/gi,
        '',
    );

    // 8. Palabras de empaque residuales al principio o al final (ej: "CJ POKER" o "POKER CJ")
    clean = clean.replace(
        /^\s*(?:DISPLAY|DISP|DSP|PAQUETE|PAQ|PQ|PTE|CAJA|CJA|CJ|CUBETA|TIRA|PACK|PACA|PCA)\s*(?:DE\s+)?/gi,
        '',
    );
    clean = clean.replace(
        /\s*(?:DISPLAY|DISP|DSP|PAQUETE|PAQ|PQ|PTE|CAJA|CJA|CJ|CUBETA|TIRA|PACK|PACA|PCA)\s*$/gi,
        '',
    );

    // 9. Paréntesis o corchetes vacíos residuales (ej: "POKER ()")
    clean = clean.replace(/[\(\[]\s*[\)\]]/g, '');

    // Limpieza de espacios, guiones o barras huérfanas
    clean = clean
        .replace(/[\s\-_/]+$/g, '')
        .replace(/^[\s\-_/]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    return clean || name.trim();
};

/**
 * Clasifica la Unidad_OCR de una línea contra el producto vinculado usando la
 * misma Comparacion_Unidad en los cuatro casos (9.5, 9.6):
 *
 * - `none`    → la línea no trae unidad, la cantidad ya está en Unidad_Venta (9.18)
 * - `sale`    → coincide con la Unidad_Venta, sin conversión (9.1)
 * - `known`   → coincide con una Unidad_Compra configurada, o se auto-infiere del
 *               nombre de la factura ("X24", "3X4", "SIX PACK"), factor conocido (9.2, 9.14)
 * - `unknown` → no coincide y el nombre no trae empaque, hay que preguntar el factor (9.3, 9.4)
 */
export const detectUnitCase = (
    ocrUnit: string | null | undefined,
    product: ProductWithPurchaseUnits,
    ocrName?: string | null,
    aiFactor?: number | null,
    unitNeedsClarification?: boolean | null,
): UnitCaseResult => {
    const u = normalizeUnit(ocrUnit);
    const saleUnit = normalizeUnit(product.unit);

    // 1. Si el producto ya tiene configurada esta unidad de compra en Bistro, tiene prioridad máxima
    const purchaseUnits = product.product_purchase_units ?? [];
    const matched = purchaseUnits.find(pu => normalizeUnit(pu.unit_name) === u);
    if (matched && Number(matched.conversion_factor) > 0) {
        return {
            unitCase: 'known',
            conversionFactor: Number(matched.conversion_factor),
            matchedUnitName: matched.unit_name,
        };
    }

    // 2. Si la IA indicó explícitamente que falta información para deducir el empaque (ej: 1 bulto sin peso)
    if (unitNeedsClarification === true) {
        return { unitCase: 'unknown', conversionFactor: null, matchedUnitName: null };
    }

    // 3. Deducción de factor de la IA (Chain-of-Thought)
    if (typeof aiFactor === 'number' && aiFactor > 0) {
        if (aiFactor === 1 && (u === '' || u === saleUnit)) {
            return {
                unitCase: u === saleUnit ? 'sale' : 'none',
                conversionFactor: 1,
                matchedUnitName: null,
            };
        }
        return {
            unitCase: 'known',
            conversionFactor: aiFactor,
            matchedUnitName: ocrUnit ? ocrUnit.trim() : 'Empaque',
        };
    }

    // 4. Inferencia heurística local (regex sobre el texto de la línea)
    const inferredFactor = extractConversionFactorFromName(ocrName);

    if (u === '') {
        if (inferredFactor && inferredFactor > 1) {
            return {
                unitCase: 'known',
                conversionFactor: inferredFactor,
                matchedUnitName: 'Empaque',
            };
        }
        return { unitCase: 'none', conversionFactor: 1, matchedUnitName: null };
    }

    if (u === saleUnit) {
        if (inferredFactor && inferredFactor > 1) {
            return {
                unitCase: 'known',
                conversionFactor: inferredFactor,
                matchedUnitName: ocrUnit ? ocrUnit.trim() : 'Empaque',
            };
        }
        return { unitCase: 'sale', conversionFactor: 1, matchedUnitName: null };
    }

    if (inferredFactor && inferredFactor > 1) {
        return {
            unitCase: 'known',
            conversionFactor: inferredFactor,
            matchedUnitName: ocrUnit ? ocrUnit.trim() : 'Empaque',
        };
    }

    // 5. Sin información suficiente para resolver la equivalencia: preguntar al usuario
    return { unitCase: 'unknown', conversionFactor: null, matchedUnitName: null };
};

/**
 * Aplica el Factor_Conversion a una línea. El total de la línea es la
 * invariante: se devuelve sin tocar y el costo por Unidad_Venta se deriva de
 * él, para que no haya deriva por redondeo del unitario.
 */
export const applyUnitConversion = (
    ocrQuantity: number,
    ocrLineTotal: number,
    factor: number,
): UnitConversionResult => {
    const quantity = ocrQuantity * factor;

    return {
        quantity,
        unitCost: quantity === 0 ? 0 : ocrLineTotal / quantity,
        lineTotal: ocrLineTotal,
    };
};
