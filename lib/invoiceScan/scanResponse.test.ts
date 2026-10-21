import { describe, it, expect } from 'vitest';
import { normalizeScanResponse, normalizeScanHeader, resolveLineAmounts } from './scanResponse';
import type { RawScanItem } from './types';

/** Ítem mínimo válido, para sobreescribir solo el campo que interesa. */
const item = (over: Record<string, unknown> = {}): RawScanItem => ({
    description: 'BONYURT CHOCOKRISPIS',
    quantity: 2,
    ocr_unit: 'CJ',
    unitValue: 12000,
    lineSubtotal: 24000,
    lineTax: 0,
    lineDiscount: 0,
    lineNetTotal: 24000,
    ...over,
} as RawScanItem);

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe('normalizeScanResponse — tolerancia de la respuesta', () => {
    it('tolera un cuerpo sin `items`', () => {
        const result = normalizeScanResponse({ header: {}, document: { globalDiscount: 0 } });
        expect(result.lines).toEqual([]);
        expect(result.globalDiscount).toBe(0);
        expect(result.error).toBeNull();
    });

    it('tolera `items` en null o de un tipo que no es arreglo', () => {
        expect(normalizeScanResponse({ items: null }).lines).toEqual([]);
        expect(normalizeScanResponse({ items: 'nada' }).lines).toEqual([]);
    });

    it('tolera un cuerpo sin `document`: Descuento_Global en 0', () => {
        const result = normalizeScanResponse({ items: [item()] });
        expect(result.globalDiscount).toBe(0);
        expect(result.documentTotal).toBe(0);
        expect(result.lines[0].globalDiscountShare).toBe(0);
    });

    it('tolera todos los campos en null', () => {
        const result = normalizeScanResponse({
            header: { supplierName: null, nit: null, invoiceNumber: null, date: null },
            document: { globalDiscount: null, documentTotal: null },
            items: [item({
                quantity: null,
                ocr_unit: null,
                unitValue: null,
                lineSubtotal: null,
                lineTax: null,
                lineDiscount: null,
                lineNetTotal: null,
            })],
        });

        expect(result.header).toEqual({
            supplierName: null, nit: null, phone: null, invoiceNumber: null, date: null, supplierId: null,
        });
        expect(result.globalDiscount).toBe(0);
        expect(result.lines).toHaveLength(1);
        expect(result.lines[0].netTotal).toBe(0);
        expect(result.lines[0].ocrUnit).toBe('');
        expect(result.lines[0].ocrQuantity).toBe(1);
        expect(result.lines[0].needsReview).toBe(true);
    });

    it('devuelve la forma neutra cuando el cuerpo no es un objeto', () => {
        const result = normalizeScanResponse(null);
        expect(result.lines).toEqual([]);
        expect(result.header.supplierName).toBeNull();
        expect(result.error).toBeTruthy();
    });

    it('descarta las líneas cuya descripción queda vacía', () => {
        const result = normalizeScanResponse({
            items: [item(), item({ description: '   ' }), item({ description: null }), 'basura'],
        });
        expect(result.lines).toHaveLength(1);
        expect(result.lines[0].ocrName).toBe('BONYURT CHOCOKRISPIS');
    });

    it('conserva el mensaje de error de la degradación con cero líneas', () => {
        const result = normalizeScanResponse({
            header: {},
            document: { globalDiscount: 0 },
            items: [],
            error: 'No se pudo parsear el JSON de Gemini',
        });
        expect(result.error).toBe('No se pudo parsear el JSON de Gemini');
        expect(result.lines).toEqual([]);
    });
});

describe('normalizeScanResponse — formato numérico latino', () => {
    it('interpreta punto de miles y coma decimal', () => {
        const result = normalizeScanResponse({
            document: { globalDiscount: '5.000', documentTotal: '240.000' },
            items: [
                item({ quantity: '0,44', unitValue: '8.100', lineSubtotal: '3.564', lineNetTotal: '3.564' }),
                item({ description: 'ARROZ', quantity: '1.200', lineSubtotal: '1.980', lineNetTotal: '1.980', unitValue: null }),
            ],
        });

        expect(result.globalDiscount).toBe(5000);
        expect(result.documentTotal).toBe(240000);
        expect(result.lines[0].ocrQuantity).toBeCloseTo(0.44);
        expect(result.lines[0].netTotal).toBe(3564);
        expect(result.lines[1].ocrQuantity).toBe(1200);
        expect(result.lines[1].netTotal).toBe(1980);
    });

    it('limpia el símbolo de moneda y los espacios', () => {
        const result = normalizeScanResponse({ items: [item({ lineSubtotal: '$ 26.560', lineNetTotal: null })] });
        expect(result.lines[0].netTotal).toBe(26560);
    });
});

describe('normalizeScanResponse — cantidad ilegible (Req 3.12)', () => {
    it.each([
        ['cero', 0],
        ['null', null],
        ['NaN', NaN],
        ['texto', 'ilegible'],
        ['negativa', -3],
    ])('asigna cantidad 1 y needsReview con cantidad %s', (_label, quantity) => {
        const result = normalizeScanResponse({ items: [item({ quantity })] });
        expect(result.lines[0].ocrQuantity).toBe(1);
        expect(result.lines[0].needsReview).toBe(true);
    });

    it('no marca revisión cuando la cantidad es legible', () => {
        const result = normalizeScanResponse({ items: [item({ quantity: 3 })] });
        expect(result.lines[0].ocrQuantity).toBe(3);
        expect(result.lines[0].needsReview).toBe(false);
    });
});

describe('resolveLineAmounts — coherencia del Costo_Neto_Linea (Req 3.2)', () => {
    it('recalcula el neto incoherente a partir de subtotal + impuesto − descuento', () => {
        const amounts = resolveLineAmounts(item({
            lineSubtotal: 24000,
            lineTax: 4560,
            lineDiscount: 2000,
            lineNetTotal: 24000, // la IA olvidó el impuesto
        }));
        expect(amounts.netTotal).toBe(26560);
    });

    it('recalcula el neto cuando falta o llega en cero', () => {
        expect(resolveLineAmounts(item({ lineTax: 4560, lineNetTotal: null })).netTotal).toBe(28560);
        expect(resolveLineAmounts(item({ lineTax: 4560, lineNetTotal: 0 })).netTotal).toBe(28560);
    });

    it('respeta el neto reportado cuando la diferencia es de redondeo', () => {
        const amounts = resolveLineAmounts(item({ lineSubtotal: 26559.6, lineNetTotal: 26560 }));
        expect(amounts.netTotal).toBe(26560);
    });

    it('respeta el neto reportado cuando no hay componentes utilizables', () => {
        const amounts = resolveLineAmounts(item({
            lineSubtotal: null, lineTax: null, lineDiscount: null, lineNetTotal: 26560,
        }));
        expect(amounts.netTotal).toBe(26560);
    });

    it('reconstruye el neto desde el unitario cuando es lo único legible', () => {
        const amounts = resolveLineAmounts(item({
            quantity: 3, unitValue: 12000,
            lineSubtotal: null, lineTax: null, lineDiscount: null, lineNetTotal: null,
        }));
        expect(amounts.netTotal).toBe(36000);
    });

    it('deriva el unitario dividiendo el neto entre la cantidad (Req 3.6)', () => {
        const amounts = resolveLineAmounts(item({
            quantity: 4, unitValue: null, lineSubtotal: 26560, lineNetTotal: 26560,
        }));
        expect(amounts.unitValue).toBe(6640);
    });

    it('deriva el unitario con la cantidad asumida cuando la cantidad es ilegible', () => {
        const amounts = resolveLineAmounts(item({
            quantity: 0, unitValue: null, lineSubtotal: 26560, lineNetTotal: 26560,
        }));
        expect(amounts.ocrQuantity).toBe(1);
        expect(amounts.unitValue).toBe(26560);
    });

    it('conserva el unitario leído sin derivarlo', () => {
        const amounts = resolveLineAmounts(item({ quantity: 2, unitValue: 12000, lineNetTotal: 24000 }));
        expect(amounts.unitValue).toBe(12000);
    });

    it('devuelve cero cuando ningún monto es legible', () => {
        const amounts = resolveLineAmounts(item({
            unitValue: null, lineSubtotal: null, lineTax: null, lineDiscount: null, lineNetTotal: null,
        }));
        expect(amounts.netTotal).toBe(0);
        expect(amounts.unitValue).toBe(0);
    });
});

describe('normalizeScanResponse — reparto del Descuento_Global (Req 3.5)', () => {
    it('reparte proporcionalmente al neto de cada línea', () => {
        const result = normalizeScanResponse({
            document: { globalDiscount: 3000 },
            items: [
                item({ description: 'A', lineSubtotal: 10000, lineNetTotal: 10000 }),
                item({ description: 'B', lineSubtotal: 20000, lineNetTotal: 20000 }),
            ],
        });

        expect(result.lines.map(l => l.globalDiscountShare)).toEqual([1000, 2000]);
        expect(sum(result.lines.map(l => l.globalDiscountShare))).toBe(3000);
    });

    it('acota el descuento al total de las líneas accionables', () => {
        const result = normalizeScanResponse({
            document: { globalDiscount: 99999 },
            items: [
                item({ description: 'A', lineSubtotal: 100, lineNetTotal: 100 }),
                item({ description: '', lineSubtotal: 500000, lineNetTotal: 500000 }),
            ],
        });

        expect(result.lines).toHaveLength(1);
        expect(result.lines[0].globalDiscountShare).toBe(100);
    });

    it('no reparte descuento cuando el documento no lo trae', () => {
        const result = normalizeScanResponse({
            document: { globalDiscount: 0 },
            items: [item(), item({ description: 'B' })],
        });
        expect(result.lines.map(l => l.globalDiscountShare)).toEqual([0, 0]);
    });
});

describe('normalizeScanResponse — forma de la línea del borrador', () => {
    it('crea la línea pendiente, sin conversión ni decisión resueltas', () => {
        const result = normalizeScanResponse({ items: [item()] });
        const line = result.lines[0];

        expect(line.decision).toEqual({ kind: 'pending' });
        expect(line.unitCase).toBeNull();
        expect(line.conversionFactor).toBeNull();
        expect(line.createPurchaseUnit).toBe(false);
        expect(line.quantity).toBeNull();
        expect(line.lineTotal).toBeNull();
        expect(line.newPrice).toBeNull();
        expect(line.id).toBeTruthy();
    });

    it('asigna identificadores distintos a cada línea', () => {
        const result = normalizeScanResponse({
            items: [item(), item({ description: 'B' }), item({ description: 'C' })],
        });
        expect(new Set(result.lines.map(l => l.id)).size).toBe(3);
    });

    it('conserva la Unidad_OCR cruda, sin normalizar (Req 9.15)', () => {
        const result = normalizeScanResponse({
            items: [item({ ocr_unit: ' Cajas ' }), item({ description: 'B', ocr_unit: 42 })],
        });
        expect(result.lines[0].ocrUnit).toBe(' Cajas ');
        expect(result.lines[1].ocrUnit).toBe('');
    });

    it('conserva reasoning, aiConversionFactor, aiInventoryQuantity y unitNeedsClarification de la IA', () => {
        const result = normalizeScanResponse({
            items: [
                item({
                    reasoning: 'Coincide con Cerveza Poker. Factor 24 por Caja x 24.',
                    conversion_factor: 24,
                    inventory_quantity: 48,
                    unit_needs_clarification: false,
                }),
                item({
                    description: 'B',
                    reasoning: 'Bulto de papa sin peso.',
                    conversion_factor: null,
                    inventory_quantity: null,
                    unit_needs_clarification: true,
                }),
            ],
        });

        expect(result.lines[0].reasoning).toBe('Coincide con Cerveza Poker. Factor 24 por Caja x 24.');
        expect(result.lines[0].aiConversionFactor).toBe(24);
        expect(result.lines[0].aiInventoryQuantity).toBe(48);
        expect(result.lines[0].unitNeedsClarification).toBe(false);

        expect(result.lines[1].reasoning).toBe('Bulto de papa sin peso.');
        expect(result.lines[1].aiConversionFactor).toBeNull();
        expect(result.lines[1].unitNeedsClarification).toBe(true);
    });
});

describe('normalizeScanHeader', () => {
    it('recorta el texto y deja en null lo vacío', () => {
        expect(normalizeScanHeader({
            supplierName: '  DISTRIBUIDORA X SAS ',
            nit: ' 900.123.456-7 ',
            invoiceNumber: '',
            date: '2026-08-01',
        })).toEqual({
            supplierName: 'DISTRIBUIDORA X SAS',
            nit: '900.123.456-7',
            phone: null,
            invoiceNumber: null,
            date: '2026-08-01',
            supplierId: null,
        });
    });

    it('extrae supplierId si viene provisto por la IA', () => {
        expect(normalizeScanHeader({
            supplierName: 'DISTRIBUIDORA X SAS',
            supplier_id: 'sup-123',
        }).supplierId).toBe('sup-123');
    });

    it('descarta fechas que no son de calendario', () => {
        expect(normalizeScanHeader({ date: '2026-13-40' }).date).toBeNull();
        expect(normalizeScanHeader({ date: '01/08/2026' }).date).toBeNull();
        expect(normalizeScanHeader({ date: null }).date).toBeNull();
    });

    it('tolera un encabezado ausente', () => {
        expect(normalizeScanHeader(undefined)).toEqual({
            supplierName: null, nit: null, phone: null, invoiceNumber: null, date: null, supplierId: null,
        });
    });
});
