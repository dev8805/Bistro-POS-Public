import { describe, it, expect } from 'vitest';
import {
    normalizeUnit,
    detectUnitCase,
    extractConversionFactorFromName,
    cleanPackagingFromName,
    applyUnitConversion,
    type ProductWithPurchaseUnits,
} from './unitMatch';

const makeProduct = (
    unit: string,
    purchaseUnits: { unit_name: string; conversion_factor: number }[] = [],
): ProductWithPurchaseUnits => ({
    unit,
    product_purchase_units: purchaseUnits,
});

describe('normalizeUnit (Comparacion_Unidad)', () => {
    it('pasa a minúsculas y quita espacios extremos', () => {
        expect(normalizeUnit('  CJ  ')).toBe('cj');
        expect(normalizeUnit('Bulto')).toBe('bulto');
    });

    it('colapsa los espacios internos repetidos', () => {
        expect(normalizeUnit('caja   grande')).toBe('caja grande');
    });

    it('quita los acentos', () => {
        expect(normalizeUnit('ARRÓBA')).toBe('arroba');
        expect(normalizeUnit('libra á')).toBe(normalizeUnit('LIBRA A'));
    });

    it('quita el plural simple final', () => {
        expect(normalizeUnit('CAJAS')).toBe('caja');
        expect(normalizeUnit('bultos')).toBe('bulto');
        expect(normalizeUnit('Arrobas')).toBe('arroba');
        expect(normalizeUnit('UNIDADES')).toBe('unidad');
    });

    it('conserva intactas las abreviaturas cortas', () => {
        expect(normalizeUnit('kg')).toBe('kg');
        expect(normalizeUnit('CJ')).toBe('cj');
        expect(normalizeUnit('und')).toBe('und');
        expect(normalizeUnit('LB')).toBe('lb');
        // "lbs" tiene 3 caracteres: el umbral de "-s" es "más de 3", no aplica.
        expect(normalizeUnit('lbs')).toBe('lbs');
    });

    it('deja fija la forma normalizada al aplicarla dos veces', () => {
        for (const u of ['  CAJAS ', 'ARRÓBAS', 'UNIDADES', 'kg', 'caja  grande']) {
            expect(normalizeUnit(normalizeUnit(u))).toBe(normalizeUnit(u));
        }
    });

    it('devuelve cadena vacía cuando no hay unidad', () => {
        expect(normalizeUnit('')).toBe('');
        expect(normalizeUnit('   ')).toBe('');
        expect(normalizeUnit(null)).toBe('');
        expect(normalizeUnit(undefined)).toBe('');
    });

    // Limitación conocida y aceptada del diseño: la regla de plurales es
    // deliberadamente simple, así que un plural "-es" sobre una palabra
    // terminada en "e" no reconstruye el singular.
    it('no unifica el plural "-es" de palabras terminadas en "e"', () => {
        expect(normalizeUnit('paquetes')).toBe('paquet');
        expect(normalizeUnit('paquete')).toBe('paquete');
    });
});

describe('detectUnitCase', () => {
    it('sin Unidad_OCR devuelve el caso "none" con factor 1', () => {
        const product = makeProduct('Und', [{ unit_name: 'Caja', conversion_factor: 12 }]);
        expect(detectUnitCase('', product)).toEqual({
            unitCase: 'none',
            conversionFactor: 1,
            matchedUnitName: null,
        });
    });

    it('reconoce la Unidad_Venta con la misma normalización', () => {
        const product = makeProduct('Libra');
        expect(detectUnitCase('LIBRAS', product)).toEqual({
            unitCase: 'sale',
            conversionFactor: 1,
            matchedUnitName: null,
        });
    });

    it('reconoce una Unidad_Compra configurada y usa su Factor_Conversion', () => {
        const product = makeProduct('Und', [
            { unit_name: 'Bulto', conversion_factor: 50 },
            { unit_name: 'Caja', conversion_factor: 12 },
        ]);
        expect(detectUnitCase('  cajás ', product)).toEqual({
            unitCase: 'known',
            conversionFactor: 12,
            matchedUnitName: 'Caja',
        });
    });

    it('devuelve "unknown" cuando la unidad no coincide con nada', () => {
        const product = makeProduct('Und', [{ unit_name: 'Caja', conversion_factor: 12 }]);
        expect(detectUnitCase('ARROBA', product)).toEqual({
            unitCase: 'unknown',
            conversionFactor: null,
            matchedUnitName: null,
        });
    });

    it('devuelve "unknown" cuando el producto no tiene Unidad_Compra configurada', () => {
        expect(detectUnitCase('CJ', makeProduct('Und'))).toMatchObject({ unitCase: 'unknown' });
        expect(detectUnitCase('CJ', { unit: 'Und' })).toMatchObject({ unitCase: 'unknown' });
    });

    it('auto-resuelve el caso a "known" cuando el empaque está en el nombre (ej. X24)', () => {
        const product = makeProduct('Und');
        const res = detectUnitCase('CJ', product, 'CERVEZA AGUILA LATA 330ML X24');
        expect(res).toEqual({
            unitCase: 'known',
            conversionFactor: 24,
            matchedUnitName: 'CJ',
        });
    });

    it('auto-resuelve matriz de empaque en el nombre (ej. 3X4)', () => {
        const product = makeProduct('Und');
        const res = detectUnitCase('PAQ', product, 'GALLETA DUCALES 3X4');
        expect(res).toEqual({
            unitCase: 'known',
            conversionFactor: 12,
            matchedUnitName: 'PAQ',
        });
    });

    it('auto-resuelve empaque cuando no viene ocrUnit pero el nombre dice X6', () => {
        const product = makeProduct('Und');
        const res = detectUnitCase('', product, 'CERVEZA POKER LATA X 6');
        expect(res).toEqual({
            unitCase: 'known',
            conversionFactor: 6,
            matchedUnitName: 'Empaque',
        });
    });

    it('respeta la Unidad_Compra previamente configurada en el catálogo antes de inferir', () => {
        const product = makeProduct('Und', [{ unit_name: 'Caja', conversion_factor: 12 }]);
        // La configuración previa dice 12, el nombre dice X24 -> debe preferir la guardada
        const res = detectUnitCase('Caja', product, 'PRODUCTO X24');
        expect(res.conversionFactor).toBe(12);
    });
});

describe('extractConversionFactorFromName (Facturas Colombianas)', () => {
    it('extrae multiplicador simple con X (X6, X24, X 12)', () => {
        expect(extractConversionFactorFromName('CERVEZA POKER LATA 330ML X6')).toBe(6);
        expect(extractConversionFactorFromName('GALLETAS OREO 36G X24')).toBe(24);
        expect(extractConversionFactorFromName('BONYURT CHOCO 170G X 12')).toBe(12);
        expect(extractConversionFactorFromName('CHOCOLATINA JET X50')).toBe(50);
        expect(extractConversionFactorFromName('ARROZ ROA 500G X 25')).toBe(25);
    });

    it('extrae multiplicador con contenedor explícito (DISPLAY X 24, CAJA X 30, CUBETA X 30)', () => {
        expect(extractConversionFactorFromName('DISPLAY X 24 CHICLES TRIDENT')).toBe(24);
        expect(extractConversionFactorFromName('DISP X 12 BON BON BUM')).toBe(12);
        expect(extractConversionFactorFromName('PAQ X 12 CORTADOS')).toBe(12);
        expect(extractConversionFactorFromName('TIRA X 12 SHAMPOO SAVITAL')).toBe(12);
        expect(extractConversionFactorFromName('CAJA X 30 HUEVOS AA')).toBe(30);
        expect(extractConversionFactorFromName('CUBETA X 30')).toBe(30);
    });

    it('extrae multiplicadores matriciales (3X4, 4X6)', () => {
        expect(extractConversionFactorFromName('GALLETA DUCALES 3X4')).toBe(12);
        expect(extractConversionFactorFromName('PONQUE RAMO 4X6')).toBe(24);
    });

    it('extrae packs verbales (SIX PACK, TRI PACK, FOUR PACK)', () => {
        expect(extractConversionFactorFromName('SIX PACK POKER 330ML')).toBe(6);
        expect(extractConversionFactorFromName('TRI PACK CREMA COLGATE')).toBe(3);
        expect(extractConversionFactorFromName('FOUR PACK YOGURT ALPINA')).toBe(4);
    });

    it('extrae sufijo explícito de unidades (100 UND, 50 UNIDADES)', () => {
        expect(extractConversionFactorFromName('VASOS 7OZ 100 UND')).toBe(100);
        expect(extractConversionFactorFromName('SERVILLETAS 50 UNIDADES')).toBe(50);
    });

    it('extrae factor entre paréntesis o corchetes (ej: (12)NVO, VIR(30), (24))', () => {
        expect(extractConversionFactorFromName('FRESH CITRUS 400ML PET (12)NVO')).toBe(12);
        expect(extractConversionFactorFromName('COCA-COLA 350ML VIR(30)')).toBe(30);
        expect(extractConversionFactorFromName('BRISA MANZANA 280ML PET(24)')).toBe(24);
        expect(extractConversionFactorFromName('COCA COLA 250 ml (12)')).toBe(12);
    });

    it('ignora gramajes, volúmenes, dimensiones y promociones', () => {
        expect(extractConversionFactorFromName('ARROZ DEL LLANO 500 G')).toBeNull();
        expect(extractConversionFactorFromName('AZUCAR MANUELITA 1 KG')).toBeNull();
        expect(extractConversionFactorFromName('ACEITE PREMIER 1000 ML')).toBeNull();
        expect(extractConversionFactorFromName('BOLSA 20X30 CM')).toBeNull();
        expect(extractConversionFactorFromName('PROMO 2X1 AGUA')).toBeNull();
        expect(extractConversionFactorFromName('')).toBeNull();
        expect(extractConversionFactorFromName(null)).toBeNull();
    });
});

describe('applyUnitConversion', () => {
    it('multiplica la cantidad, conserva el total y deriva el costo unitario', () => {
        expect(applyUnitConversion(2, 24000, 12)).toEqual({
            quantity: 24,
            unitCost: 1000,
            lineTotal: 24000,
        });
    });

    it('con factor 1 no altera la cantidad', () => {
        expect(applyUnitConversion(3, 9000, 1)).toEqual({
            quantity: 3,
            unitCost: 3000,
            lineTotal: 9000,
        });
    });

    it('devuelve costo unitario 0 cuando la cantidad resultante es 0', () => {
        expect(applyUnitConversion(0, 5000, 12)).toEqual({
            quantity: 0,
            unitCost: 0,
            lineTotal: 5000,
        });
    });
});

describe('detectUnitCase — deducción inteligente con IA', () => {
    const productUnd = { unit: 'Und', product_purchase_units: [] };
    const productKg = { unit: 'Kg', product_purchase_units: [] };

    it('aplica el factor deducido por la IA automáticamente como caso known', () => {
        const res = detectUnitCase('CAJA', productUnd, 'CERVEZA POKER', 24, false);
        expect(res.unitCase).toBe('known');
        expect(res.conversionFactor).toBe(24);
    });

    it('cuando la IA marca unitNeedsClarification true, queda como unknown para preguntar al usuario', () => {
        const res = detectUnitCase('BULTO', productKg, 'PAPA PASTUSA', null, true);
        expect(res.unitCase).toBe('unknown');
        expect(res.conversionFactor).toBeNull();
    });

    it('una unidad previamente guardada en el catálogo tiene prioridad sobre la sugerencia de la IA', () => {
        const productWithSaved = {
            unit: 'Kg',
            product_purchase_units: [{ unit_name: 'BULTO', conversion_factor: 50 }],
        };
        const res = detectUnitCase('BULTO', productWithSaved, 'PAPA PASTUSA', null, true);
        expect(res.unitCase).toBe('known');
        expect(res.conversionFactor).toBe(50);
    });
});

describe('cleanPackagingFromName', () => {
    it('limpia contenedores explícitos con multiplicador (CJ X 24, DISPLAY X 12, PACA X 25)', () => {
        expect(cleanPackagingFromName('CERV POKER LATA 330ML CJ X 24')).toBe('CERV POKER LATA 330ML');
        expect(cleanPackagingFromName('GALLETA OREO DISPLAY X 12')).toBe('GALLETA OREO');
        expect(cleanPackagingFromName('PACA X 25 ARROZ DIANA 500G')).toBe('ARROZ DIANA 500G');
        expect(cleanPackagingFromName('CUBETA X 30 HUEVOS AA')).toBe('HUEVOS AA');
    });

    it('limpia packs verbales (SIX PACK, TRI PACK, etc.)', () => {
        expect(cleanPackagingFromName('SIX PACK CERVEZA CORONA')).toBe('CERVEZA CORONA');
        expect(cleanPackagingFromName('CORONA 355ML SIXPACK')).toBe('CORONA 355ML');
        expect(cleanPackagingFromName('JABON REY TRI PACK')).toBe('JABON REY');
    });

    it('limpia sufijos de unidades (100 UND, 50 UNIDADES)', () => {
        expect(cleanPackagingFromName('VASOS PLASTICOS 7OZ 100 UND')).toBe('VASOS PLASTICOS 7OZ');
        expect(cleanPackagingFromName('SERVILLETAS FAMILIA 50 UNIDADES')).toBe('SERVILLETAS FAMILIA');
    });

    it('limpia multiplicadores sueltos (X 24, X12)', () => {
        expect(cleanPackagingFromName('CERVEZA AGUILA 330ML X24')).toBe('CERVEZA AGUILA 330ML');
        expect(cleanPackagingFromName('LECHE ALQUERIA 1L X 6')).toBe('LECHE ALQUERIA 1L');
    });

    it('no elimina gramajes, volúmenes ni dimensiones legítimas', () => {
        expect(cleanPackagingFromName('HARINA PAN 1KG')).toBe('HARINA PAN 1KG');
        expect(cleanPackagingFromName('ACEITE PREMIER 1000ML')).toBe('ACEITE PREMIER 1000ML');
        expect(cleanPackagingFromName('PAPEL 20X30 CM')).toBe('PAPEL 20X30 CM');
    });

    it('limpia palabras de empaque residuales al inicio o al final', () => {
        expect(cleanPackagingFromName('CJ POKER LATA')).toBe('POKER LATA');
        expect(cleanPackagingFromName('CHOCORAMO CJ')).toBe('CHOCORAMO');
    });

    it('limpia números de renglón y símbolos al inicio (1 - , 1., *, 7 - * )', () => {
        expect(cleanPackagingFromName('1 - Piña Colada H2O L300ml')).toBe('Piña Colada H2O L300ml');
        expect(cleanPackagingFromName('2 - Mango Piña H2O L250ml x6')).toBe('Mango Piña H2O L250ml');
        expect(cleanPackagingFromName('7 - * Agua Cristal P300mb24 SP')).toBe('Agua Cristal P300mb24 SP');
        expect(cleanPackagingFromName('10 - * Ag. Cristal Px6Lx12SmPtc')).toBe('Ag. Cristal Px6Lx12SmPtc');
        expect(cleanPackagingFromName('01. Arroz Diana 500g')).toBe('Arroz Diana 500g');
        expect(cleanPackagingFromName('#1 Aceite Gourmet 1L')).toBe('Aceite Gourmet 1L');
        expect(cleanPackagingFromName('* Pan Tajado Bimbo')).toBe('Pan Tajado Bimbo');
        expect(cleanPackagingFromName('3) Gaseosa Manzana')).toBe('Gaseosa Manzana');
    });

    it('limpia factores de empaque entre paréntesis y sufijos (ej: (12)NVO, VIR(30), (24), [12])', () => {
        expect(cleanPackagingFromName('FRESH CITRUS 400ML PET (12)NVO')).toBe('FRESH CITRUS 400ML PET');
        expect(cleanPackagingFromName('COCA COLA SO 8OZ VIR (30)')).toBe('COCA COLA SO 8OZ VIR');
        expect(cleanPackagingFromName('COCA-COLA 350ML VIR(30)')).toBe('COCA-COLA 350ML VIR');
        expect(cleanPackagingFromName('COCA COLA 250 ml (12)')).toBe('COCA COLA 250 ml');
        expect(cleanPackagingFromName('PREMIO ROJO FNT 350ML VIR(30)')).toBe('PREMIO ROJO FNT 350ML VIR');
        expect(cleanPackagingFromName('QUATRO CHOICE 350ML VIR(30)')).toBe('QUATRO CHOICE 350ML VIR');
        expect(cleanPackagingFromName('BRISA MANZANA 280ML PET(24)')).toBe('BRISA MANZANA 280ML PET');
        expect(cleanPackagingFromName('BRISA MARACUYA 280ML PET(24)')).toBe('BRISA MARACUYA 280ML PET');
        expect(cleanPackagingFromName('CERVEZA AGUILA [24]')).toBe('CERVEZA AGUILA');
    });
});
