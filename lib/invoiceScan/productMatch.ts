/**
 * lib/invoiceScan/productMatch.ts
 *
 * Resolutor_Producto del Escaneo_Unificado: cruza el Nombre_OCR de una
 * Linea_Factura contra el catálogo del Negocio_Activo con una cascada de cuatro
 * niveles (Req 6.1, 6.2).
 *
 * Módulo puro: no importa React, no toca `supabase` y NUNCA hace fetch. Recibe
 * el catálogo ya cargado, por lo que el aislamiento por negocio lo garantiza
 * quien llama al pasar únicamente productos del Negocio_Activo (Req 17.2).
 *
 * La cascada se extrajo de `matchScannedProducts` de
 * `components/expense/InventoryPurchase.tsx`, con tres diferencias:
 *   1. La normalización usa `norm` (minúsculas, sin acentos, sin espacios
 *      extremos) en vez de solo `toLowerCase().trim()`.
 *   2. Devuelve `null` en lugar de acumular en listas de reconocidos/pendientes.
 *   3. Ningún nivel resuelve con más de un candidato: la versión original se
 *      quedaba con el primero en los niveles exactos.
 */

import type { Product } from '../../hooks/useProducts';
import { norm } from '../../components/expense/scanExpense.logic';

/** Nivel de la cascada por el que se resolvió la línea. Útil para logs y pruebas. */
export type ProductMatchLevel =
    | 'barcode'
    | 'nicknameExact'
    | 'nicknamePartial'
    | 'nameExact'
    | 'namePartial'
    | 'tokenMatch';

/** Resultado de la cascada cuando un nivel deja exactamente un candidato. */
export interface ProductMatch {
    product: Product;
    level: ProductMatchLevel;
}

/**
 * Normaliza nombres de productos para comparación robusta:
 * 1. Minúsculas, sin acentos (vía `norm`).
 * 2. Reemplaza separadores comunes (*, -, _, /, ., ,) por espacios.
 * 3. Separa números de unidades (ej: '500g' -> '500 g', '1kg' -> '1 kg').
 * 4. Normaliza abreviaturas comunes ('gr' -> 'g', 'lt' -> 'l').
 * 5. Colapsa múltiples espacios.
 */
export const cleanForMatch = (s?: string): string => {
    const base = norm(s);
    if (!base) return '';

    return base
        .replace(/[*_\-/\\()[\]{}.,]/g, ' ')
        .replace(/(\d+)(g|gr|kg|ml|l|lt|oz|lb|und|un)\b/g, '$1 $2')
        .replace(/\bgr\b/g, 'g')
        .replace(/\blt\b/g, 'l')
        .replace(/\s+/g, ' ')
        .trim();
};

/** Extrae palabras significativas (>= 2 caracteres) para coincidencia por tokens. */
const toTokenSet = (str: string): Set<string> =>
    new Set(str.split(' ').filter((w) => w.length >= 2));

/** Producto con sus textos ya normalizados, para no re-normalizar por nivel. */
interface NormalizedProduct {
    product: Product;
    name: string;
    cleanName: string;
    nicknames: string[];
    cleanNicknames: string[];
    tokens: Set<string>;
}

/**
 * Un nivel solo resuelve con un único candidato. Con cero o con más de uno la
 * cascada continúa en el siguiente nivel (Req 6.1).
 */
const resolveUnique = (
    candidates: NormalizedProduct[],
    level: ProductMatchLevel,
): ProductMatch | null =>
    candidates.length === 1 ? { product: candidates[0].product, level } : null;

/** Coincidencia parcial en cualquiera de los dos sentidos de contención. */
const containsEitherWay = (a: string, b: string): boolean =>
    a.includes(b) || b.includes(a);

/**
 * Busca el producto del catálogo que corresponde a un Nombre_OCR y opcionalmente código de barras.
 *
 * Orden de la cascada:
 *   0. Código de barras exacto (si la factura y el catálogo lo traen)
 *   1. Apodo exacto
 *   2. Apodo parcial con resultado único
 *   3. Nombre exacto (insensible a mayúsculas, tildes, espacios dobles y unidades)
 *   4. Nombre parcial con resultado único
 *   5. Palabras clave / tokens con resultado único
 *
 * Solo se consideran productos de tipo `simple`, incluidos los insumos
 * (`is_for_sale = false`); los `processed` y `service` nunca son destino
 * (Req 8.7). Sin coincidencia o con ambigüedad en todos los niveles devuelve
 * `null` y la línea queda pendiente de decisión del Usuario.
 */
export const matchProductLine = (
    ocrName: string,
    products: Product[],
    barcode?: string | null,
): ProductMatch | null => {
    // 0. Código de barras exacto (máxima prioridad y certeza en retail)
    if (barcode && barcode.trim().length >= 4) {
        const cleanBarcode = barcode.trim();
        const barcodeMatches = products.filter(
            (p) => p.type === 'simple' && p.barcode && p.barcode.trim() === cleanBarcode,
        );
        if (barcodeMatches.length === 1) {
            return { product: barcodeMatches[0], level: 'barcode' };
        }
    }

    const query = norm(ocrName);
    if (!query) return null;

    const cleanQuery = cleanForMatch(ocrName);
    const queryTokens = toTokenSet(cleanQuery);

    const catalog: NormalizedProduct[] = products
        .filter((p) => p.type === 'simple')
        .map((p) => {
            const n = norm(p.name);
            const cn = cleanForMatch(p.name);
            return {
                product: p,
                name: n,
                cleanName: cn,
                nicknames: (p.nicknames || []).map((nick) => norm(nick)).filter((nick) => nick !== ''),
                cleanNicknames: (p.nicknames || []).map((nick) => cleanForMatch(nick)).filter((nick) => nick !== ''),
                tokens: toTokenSet(cn),
            };
        });

    // 1. Apodo exacto (vía norm y cleanForMatch)
    const nicknameExact = resolveUnique(
        catalog.filter((c) => c.nicknames.includes(query) || (cleanQuery !== '' && c.cleanNicknames.includes(cleanQuery))),
        'nicknameExact',
    );
    if (nicknameExact) return nicknameExact;

    // 2. Apodo parcial
    const nicknamePartial = resolveUnique(
        catalog.filter(
            (c) =>
                c.nicknames.some((n) => containsEitherWay(n, query)) ||
                (cleanQuery !== '' && c.cleanNicknames.some((cn) => containsEitherWay(cn, cleanQuery))),
        ),
        'nicknamePartial',
    );
    if (nicknamePartial) return nicknamePartial;

    // 3. Nombre exacto (vía norm directo o cleanForMatch con tolerancia a espacios y gramajes)
    const nameExact = resolveUnique(
        catalog.filter((c) => c.name === query || (cleanQuery !== '' && c.cleanName === cleanQuery)),
        'nameExact',
    );
    if (nameExact) return nameExact;

    // 4. Nombre parcial
    const namePartial = resolveUnique(
        catalog.filter(
            (c) =>
                (c.name !== '' && containsEitherWay(c.name, query)) ||
                (c.cleanName !== '' && cleanQuery !== '' && containsEitherWay(c.cleanName, cleanQuery)),
        ),
        'namePartial',
    );
    if (namePartial) return namePartial;

    // 5. Coincidencia por conjunto de palabras clave (tokens):
    // Si todas las palabras significativas del catálogo están contenidas en el renglón OCR
    if (cleanQuery !== '' && queryTokens.size >= 2) {
        const tokenMatches = catalog.filter(
            (c) => c.tokens.size >= 2 && [...c.tokens].every((token) => queryTokens.has(token)),
        );
        const uniqueTokenMatch = resolveUnique(tokenMatches, 'tokenMatch');
        if (uniqueTokenMatch) return uniqueTokenMatch;
    }

    return null;
};
