import { calculateLineCostV2 } from './lineCostCalculator';

describe('lineCostCalculator.ts', () => {
    it('calcula correctamente una línea simple sin empaques ni impuestos', () => {
        const item = {
            description: 'Arroz Diana 1kg',
            quantity: 10,
            ocr_unit: '',
            unitValue: 4000,
            lineSubtotal: 40000,
            lineTax: 0,
            lineDiscount: 0,
            lineNetTotal: 40000,
            barcode: null,
        };

        const result = calculateLineCostV2(item);
        expect(result.ocrQuantity).toBe(10);
        expect(result.conversionFactor).toBe(1);
        expect(result.inventoryQuantity).toBe(10);
        expect(result.netTotal).toBe(40000);
        expect(result.unitCost).toBe(4000);
    });

    it('calcula correctamente una línea con IVA y descuento comercial', () => {
        const item = {
            description: 'Aceite Premier 900ml',
            quantity: 5,
            ocr_unit: '',
            unitValue: 8000,
            lineSubtotal: 40000,
            lineTax: 7600, // 19% IVA
            lineDiscount: 2000, // Descuento de $2.000
            lineNetTotal: 45600, // 40000 + 7600 - 2000
            barcode: null,
        };

        const result = calculateLineCostV2(item);
        expect(result.netTotal).toBe(45600);
        expect(result.inventoryQuantity).toBe(5);
        expect(result.unitCost).toBe(9120); // 45600 / 5
    });

    it('aplica el factor de empaque deducido del texto (Caja x 24) a la cantidad y al costo unitario', () => {
        const item = {
            description: 'CERV POKER LATA 330ML CJ X 24',
            quantity: 2,
            ocr_unit: 'CAJA',
            unitValue: 58000,
            lineSubtotal: 116000,
            lineTax: 0,
            lineDiscount: 0,
            lineNetTotal: 116000,
            barcode: null,
        };

        const result = calculateLineCostV2(item);
        expect(result.ocrQuantity).toBe(2);
        expect(result.conversionFactor).toBe(24);
        expect(result.inventoryQuantity).toBe(48); // 2 * 24
        expect(result.netTotal).toBe(116000);
        expect(result.unitCost).toBe(2416.67); // 116000 / 48 redondeado a 2 decimales
    });

    it('respeta el factor conocido configurado en el catálogo por encima del texto', () => {
        const item = {
            description: 'AGUA CRISTAL PET CAJA',
            quantity: 1,
            ocr_unit: 'CAJA',
            unitValue: 30000,
            lineSubtotal: 30000,
            lineTax: 0,
            lineDiscount: 0,
            lineNetTotal: 30000,
            barcode: null,
        };

        const result = calculateLineCostV2(item, 30); // factor conocido 30
        expect(result.conversionFactor).toBe(30);
        expect(result.inventoryQuantity).toBe(30);
        expect(result.unitCost).toBe(1000); // 30000 / 30
    });

    it('respeta el total de la línea si viene en la factura aunque incluya impuestos adicionales (IC/IBUA)', () => {
        const item = {
            description: '1.- Piña Colada HS L269ml x6',
            quantity: 1,
            ocr_unit: 'Unidad',
            unitValue: 20512.38,
            lineSubtotal: 20512.38,
            lineTax: 636.29, // solo vino el IVA desglosado
            lineDiscount: 7786.50,
            lineNetTotal: 16824.18, // Columna VLR.TOTAL real de la factura
            barcode: null,
        };

        const result = calculateLineCostV2(item);
        expect(result.netTotal).toBe(16824); // Respeta los $16.824 de la factura
        expect(result.unitCost).toBe(16824.18);
        expect(result.tax).toBeCloseTo(4098.3, 1); // Ajusta los impuestos totales de la línea
        // Ratificación: el cálculo dinámico debe dar exactamente el total reportado
        expect(result.subtotal + result.tax - result.discount).toBeCloseTo(item.lineNetTotal, 2);
    });

    it('calcula con impuestos y descuentos si la factura NO trae columna de total de línea', () => {
        const item = {
            description: 'Galletas Festival',
            quantity: 2,
            ocr_unit: 'PAQUETE',
            unitValue: 5000,
            lineSubtotal: 10000,
            lineTax: 1900,
            lineDiscount: 500,
            lineNetTotal: 0, // No vino columna de total
            barcode: null,
        };

        const result = calculateLineCostV2(item);
        expect(result.netTotal).toBe(11400); // 10000 + 1900 - 500
        expect(result.unitCost).toBe(5700);
    });
});

