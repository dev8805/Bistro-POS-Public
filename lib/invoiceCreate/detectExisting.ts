import type { ScanLine } from '../invoiceScan/types';
import type { Product } from '../../hooks/useProducts';

/** Resultado de la detección de duplicados */
export interface DetectionResult {
    /** Líneas que NO tienen coincidencia en el catálogo — se crearán */
    newLines: ScanLine[];
    /** Líneas que SÍ tienen coincidencia — se omiten */
    existingLines: Array<{ line: ScanLine; matchedProduct: { id: string; name: string } }>;
}

/**
 * Normaliza un nombre para comparación: sin acentos, lowercase, trimmed.
 */
export const normalizeName = (s: string): string =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/**
 * Compara líneas de factura contra el catálogo del negocio.
 * Match por barcode exacto (prioridad) O por nombre normalizado.
 *
 * - Si la línea tiene barcode y coincide con algún producto del catálogo → existente
 * - Si el nombre normalizado de la línea coincide con el de algún producto → existente
 * - En cualquier otro caso → nueva
 */
export const detectExistingProducts = (
    lines: ScanLine[],
    catalog: Product[],
): DetectionResult => {
    // Pre-compute lookup maps for O(1) matching
    const barcodeMap = new Map<string, Product>();
    const nameMap = new Map<string, Product>();

    catalog.forEach(p => {
        if (p.barcode) {
            barcodeMap.set(p.barcode.trim(), p);
        }
        const normalized = normalizeName(p.name);
        if (normalized) {
            nameMap.set(normalized, p);
        }
    });

    const newLines: ScanLine[] = [];
    const existingLines: DetectionResult['existingLines'] = [];

    lines.forEach(line => {
        // Priority 1: match by barcode (if line has barcode)
        if (line.barcode) {
            const matchByBarcode = barcodeMap.get(line.barcode.trim());
            if (matchByBarcode) {
                existingLines.push({
                    line,
                    matchedProduct: { id: matchByBarcode.id, name: matchByBarcode.name },
                });
                return;
            }
        }

        // Priority 2: match by normalized name
        const normalizedOcr = normalizeName(line.ocrName);
        if (normalizedOcr) {
            const matchByName = nameMap.get(normalizedOcr);
            if (matchByName) {
                existingLines.push({
                    line,
                    matchedProduct: { id: matchByName.id, name: matchByName.name },
                });
                return;
            }
        }

        // No match: new product
        newLines.push(line);
    });

    return { newLines, existingLines };
};
