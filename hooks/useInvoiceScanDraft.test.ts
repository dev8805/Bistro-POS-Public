/**
 * Pruebas del borrador en memoria y de la máquina de estados del
 * Escaneo_Unificado (spec `escaneo-factura-unificado`, tarea 4.1).
 *
 * Lo que se verifica aquí es solo lo que la tarea 4.1 implementa: el paso
 * inicial, el Selector_Destino, el retroceso declarado por paso, el estado
 * sucio, la confirmación de descarte y la estabilidad de la `idempotencyKey`.
 * La captura (4.2), la resolución de líneas (4.3) y la finalización (4.4) tienen
 * sus propias pruebas.
 *
 * Las fuentes de "borrador sucio" que todavía no se pueden producir por la API
 * pública (imagen, proveedor y líneas) se verifican sobre `isDraftDirty`, que es
 * la misma función pura que usa el hook.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import {
    createIdempotencyKey,
    isDraftDirty,
    previousStepOf,
    useInvoiceScanDraft,
    MAX_IMAGE_BYTES,
    SCAN_MAX_DIMENSION,
    type InvoiceScanDraftApi,
    type RegisterRpcFn,
    type EnqueueOfflineFn,
} from './useInvoiceScanDraft';
import type {
    NewProductDraft,
    RegisterResult,
    ScanDestination,
    ScanDraft,
    ScanLine,
    SupplierDecision,
} from '../lib/invoiceScan/types';
import type { Product } from './useProducts';
import type { Supplier } from './useSuppliers';
import { blobToBase64, compressImage } from '../lib/imageUtils';
import { invokeEdgeFunction } from '../utils/invokeEdgeFunction';

/**
 * La compresión usa `createImageBitmap` y `<canvas>`, que jsdom no implementa, y
 * el escaneo sale a la red. Ambos se mockean; el resto de la lógica (normalizador
 * de la respuesta, cascada de producto y reglas del gasto) corre de verdad.
 */
vi.mock('../lib/imageUtils', () => ({
    compressImage: vi.fn(async () => ({ base64: 'RkFDVFVSQQ==', mimeType: 'image/jpeg' })),
    base64ToBlob: vi.fn((base64: string, mimeType: string) => new Blob([base64], { type: mimeType })),
    blobToBase64: vi.fn(async () => 'RkFDVFVSQQ=='),
}));

vi.mock('../utils/invokeEdgeFunction', () => ({
    invokeEdgeFunction: vi.fn(),
}));

const compressImageMock = vi.mocked(compressImage);
const blobToBase64Mock = vi.mocked(blobToBase64);
const invokeMock = vi.mocked(invokeEdgeFunction);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Línea mínima con la decisión indicada, para las pruebas de `isDraftDirty`. */
const buildLine = (decision: ScanLine['decision']): ScanLine => ({
    id: 'linea-1',
    ocrName: 'BONYURT CHOCOKRISPIS',
    ocrUnit: 'CJ',
    ocrQuantity: 2,
    netTotal: 26560,
    globalDiscountShare: 0,
    needsReview: false,
    decision,
    unitCase: null,
    conversionFactor: null,
    createPurchaseUnit: false,
    quantity: null,
    lineTotal: null,
    newPrice: null,
    barcode: '',
});

/** Borrador limpio, tal como nace el flujo. */
const buildDraft = (patch: Partial<ScanDraft> = {}): ScanDraft => ({
    destination: null,
    image: null,
    evidenceUrl: null,
    idempotencyKey: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    header: { supplierName: null, nit: null, phone: null, invoiceNumber: null, date: null },
    globalDiscount: 0,
    supplier: null,
    lines: [],
    currentLineIndex: 0,
    expense: null,
    payment: {
        isCredit: false,
        dueDate: null,
        paidAmount: 0,
        deductFromCash: null,
        shiftId: null,
        methods: [],
        creditInitialMethodId: null,
    },
    ...patch,
});

describe('useInvoiceScanDraft — apertura del flujo', () => {
    it('arranca en el Selector_Destino con el borrador vacío', () => {
        const { result } = renderHook(() => useInvoiceScanDraft());

        expect(result.current.step).toBe('destination');
        expect(result.current.draft.destination).toBeNull();
        expect(result.current.draft.image).toBeNull();
        expect(result.current.draft.lines).toEqual([]);
        expect(result.current.draft.expense).toBeNull();
        expect(result.current.progress).toBeNull();
        expect(result.current.isDirty).toBe(false);
        expect(result.current.canGoBack).toBe(false);
    });

    it('genera la idempotencyKey al abrir y la mantiene estable entre renders', () => {
        const { result, rerender } = renderHook(() => useInvoiceScanDraft());
        const key = result.current.draft.idempotencyKey;

        expect(key).toMatch(UUID_PATTERN);

        rerender();
        expect(result.current.draft.idempotencyKey).toBe(key);

        act(() => result.current.chooseDestination('inventory'));
        rerender();
        act(() => result.current.setPayment({ ...result.current.draft.payment, isCredit: true }));

        expect(result.current.draft.idempotencyKey).toBe(key);
    });

    it('genera claves distintas para flujos distintos', () => {
        expect(createIdempotencyKey()).not.toBe(createIdempotencyKey());
        expect(createIdempotencyKey()).toMatch(UUID_PATTERN);
    });
});

describe('useInvoiceScanDraft — Selector_Destino', () => {
    it('elegir inventario fija la ruta y avanza a la captura', () => {
        const { result } = renderHook(() => useInvoiceScanDraft());

        act(() => result.current.chooseDestination('inventory'));

        expect(result.current.draft.destination).toBe('inventory');
        expect(result.current.step).toBe('capture');
    });

    it('elegir gasto fija la ruta y avanza a la captura', () => {
        const { result } = renderHook(() => useInvoiceScanDraft());

        act(() => result.current.chooseDestination('expense'));

        expect(result.current.draft.destination).toBe('expense');
        expect(result.current.step).toBe('capture');
    });

    it('cambiar de destino limpia lo que dependía del anterior', () => {
        const { result } = renderHook(() => useInvoiceScanDraft());

        act(() => result.current.chooseDestination('expense'));
        act(() => result.current.setExpenseFields({ amount: '85000', category: 'SERVICIOS' }));
        expect(result.current.draft.expense?.amount).toBe('85000');

        act(() => result.current.chooseDestination('inventory'));

        expect(result.current.draft.destination).toBe('inventory');
        expect(result.current.draft.expense).toBeNull();
        expect(result.current.draft.supplier).toBeNull();
    });

    it('elegir el mismo destino dos veces no borra el trabajo hecho', () => {
        const { result } = renderHook(() => useInvoiceScanDraft());

        act(() => result.current.chooseDestination('expense'));
        act(() => result.current.setExpenseFields({ amount: '85000' }));
        act(() => result.current.chooseDestination('expense'));

        expect(result.current.draft.expense?.amount).toBe('85000');
    });
});

describe('previousStepOf — paso previo declarado', () => {
    it('el primer paso y los pasos en vuelo no tienen retroceso', () => {
        expect(previousStepOf('destination', null)).toBeNull();
        expect(previousStepOf('processing', 'inventory')).toBeNull();
        expect(previousStepOf('submitting', 'inventory')).toBeNull();
        expect(previousStepOf('done', 'inventory')).toBeNull();
    });

    it('los pasos de error resuelven con sus propias acciones', () => {
        expect(previousStepOf('scanError', 'inventory')).toBeNull();
        expect(previousStepOf('submitError', 'inventory')).toBeNull();
        expect(previousStepOf('emptyPurchase', 'inventory')).toBeNull();
    });

    it('la captura y el recorte retroceden un paso', () => {
        expect(previousStepOf('capture', 'inventory')).toBe('destination');
        expect(previousStepOf('crop', 'inventory')).toBe('capture');
        expect(previousStepOf('manualEntry', 'inventory')).toBe('scanError');
    });

    it('la resolución y la revisión retroceden dentro de la Ruta_Inventario', () => {
        expect(previousStepOf('supplier', 'inventory')).toBeNull();
        expect(previousStepOf('lineResolver', 'inventory')).toBe('supplier');
        expect(previousStepOf('review', 'inventory')).toBe('lineResolver');
    });

    it('el paso de pago retrocede según el destino', () => {
        expect(previousStepOf('payment', 'inventory')).toBe('review');
        expect(previousStepOf('payment', 'expense')).toBe('expenseFields');
        expect(previousStepOf('expenseFields', 'expense')).toBe('supplier');
    });
});

describe('useInvoiceScanDraft — retroceso', () => {
    it('desde la captura vuelve al Selector_Destino', () => {
        const { result } = renderHook(() => useInvoiceScanDraft());

        act(() => result.current.chooseDestination('inventory'));
        expect(result.current.canGoBack).toBe(true);

        act(() => result.current.goBack());

        expect(result.current.step).toBe('destination');
        expect(result.current.canGoBack).toBe(false);
        // El destino elegido se conserva: el retroceso no borra decisiones.
        expect(result.current.draft.destination).toBe('inventory');
    });

    it('en el Selector_Destino el retroceso no hace nada', () => {
        const { result } = renderHook(() => useInvoiceScanDraft());

        act(() => result.current.goBack());

        expect(result.current.step).toBe('destination');
    });
});

describe('isDraftDirty — decisiones que se perderían', () => {
    it('el borrador recién abierto está limpio', () => {
        expect(isDraftDirty(buildDraft())).toBe(false);
    });

    it('elegir destino no cuenta como decisión', () => {
        expect(isDraftDirty(buildDraft({ destination: 'inventory' }))).toBe(false);
    });

    it('la imagen capturada ensucia el borrador', () => {
        const image = { blob: new Blob(['factura']), previewUrl: 'blob:factura' };
        expect(isDraftDirty(buildDraft({ image }))).toBe(true);
    });

    it('el proveedor confirmado ensucia el borrador', () => {
        const supplier = { kind: 'existing' as const, id: 'sup-1', name: 'DISTRIBUIDORA X' };
        expect(isDraftDirty(buildDraft({ supplier }))).toBe(true);
    });

    it('una línea resuelta ensucia el borrador y una pendiente no', () => {
        expect(isDraftDirty(buildDraft({ lines: [buildLine({ kind: 'pending' })] }))).toBe(false);
        expect(isDraftDirty(buildDraft({ lines: [buildLine({ kind: 'skipped' })] }))).toBe(true);
        expect(isDraftDirty(buildDraft({
            lines: [buildLine({ kind: 'linked', productId: 'p-1', addNickname: true })],
        }))).toBe(true);
    });

    it('los campos del gasto vacíos no ensucian, los escritos sí', () => {
        const empty = { amount: '', description: '', category: null, date: '2026-08-01' };
        expect(isDraftDirty(buildDraft({ expense: empty }))).toBe(false);
        expect(isDraftDirty(buildDraft({ expense: { ...empty, amount: '85000' } }))).toBe(true);
        expect(isDraftDirty(buildDraft({ expense: { ...empty, description: 'Energía' } }))).toBe(true);
        expect(isDraftDirty(buildDraft({ expense: { ...empty, category: 'SERVICIOS' } }))).toBe(true);
    });
});

describe('useInvoiceScanDraft — cierre del flujo', () => {
    it('sin decisiones cierra directo, sin pedir confirmación', () => {
        const onClose = vi.fn();
        const confirmDiscard = vi.fn().mockResolvedValue(true);
        const { result } = renderHook(() => useInvoiceScanDraft({ onClose, confirmDiscard }));

        act(() => result.current.chooseDestination('inventory'));
        act(() => result.current.requestClose());

        expect(confirmDiscard).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(result.current.step).toBe('destination');
        expect(result.current.draft.destination).toBeNull();
    });

    it('con decisiones pide confirmación y descarta el borrador al confirmar', async () => {
        const onClose = vi.fn();
        const confirmDiscard = vi.fn().mockResolvedValue(true);
        const { result } = renderHook(() => useInvoiceScanDraft({ onClose, confirmDiscard }));

        act(() => result.current.chooseDestination('expense'));
        act(() => result.current.setExpenseFields({ amount: '85000', description: 'Energía' }));
        expect(result.current.isDirty).toBe(true);

        const keyAntes = result.current.draft.idempotencyKey;

        await act(async () => {
            result.current.requestClose();
        });

        expect(confirmDiscard).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(result.current.step).toBe('destination');
        expect(result.current.draft.expense).toBeNull();
        expect(result.current.draft.destination).toBeNull();
        expect(result.current.isDirty).toBe(false);
        // El descarte abre un flujo nuevo: clave nueva.
        expect(result.current.draft.idempotencyKey).not.toBe(keyAntes);
    });

    it('con decisiones conserva el borrador si el Usuario cancela', async () => {
        const onClose = vi.fn();
        const confirmDiscard = vi.fn().mockResolvedValue(false);
        const { result } = renderHook(() => useInvoiceScanDraft({ onClose, confirmDiscard }));

        act(() => result.current.chooseDestination('expense'));
        act(() => result.current.setExpenseFields({ amount: '85000' }));

        await act(async () => {
            result.current.requestClose();
        });

        expect(confirmDiscard).toHaveBeenCalledTimes(1);
        expect(onClose).not.toHaveBeenCalled();
        expect(result.current.draft.expense?.amount).toBe('85000');
        expect(result.current.isDirty).toBe(true);
    });

    it('sin puente con el ConfirmDialog expone la solicitud de descarte', () => {
        const onClose = vi.fn();
        const { result } = renderHook(() => useInvoiceScanDraft({ onClose }));

        act(() => result.current.chooseDestination('expense'));
        act(() => result.current.setExpenseFields({ amount: '85000' }));
        act(() => result.current.requestClose());

        expect(result.current.discardPrompt?.title).toBe('¿Descartar el escaneo?');
        expect(onClose).not.toHaveBeenCalled();

        act(() => result.current.dismissDiscard());
        expect(result.current.discardPrompt).toBeNull();
        expect(result.current.draft.expense?.amount).toBe('85000');

        act(() => result.current.requestClose());
        act(() => result.current.acceptDiscard());

        expect(result.current.discardPrompt).toBeNull();
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(result.current.draft.expense).toBeNull();
        expect(result.current.step).toBe('destination');
    });

    it('el reseteo limpia el borrador sin pedir confirmación', () => {
        const onClose = vi.fn();
        const { result } = renderHook(() => useInvoiceScanDraft({ onClose }));

        act(() => result.current.chooseDestination('inventory'));
        act(() => result.current.setExpenseFields({ amount: '12000' }));
        act(() => result.current.reset());

        expect(result.current.step).toBe('destination');
        expect(result.current.draft.expense).toBeNull();
        expect(result.current.isDirty).toBe(false);
        expect(onClose).not.toHaveBeenCalled();
    });
});

describe('useInvoiceScanDraft — persistencia', () => {
    it('no escribe el borrador en localStorage ni en sessionStorage', () => {
        const localSpy = vi.spyOn(globalThis.localStorage, 'setItem');
        const sessionSpy = vi.spyOn(globalThis.sessionStorage, 'setItem');

        const { result } = renderHook(() => useInvoiceScanDraft());
        act(() => result.current.chooseDestination('inventory'));
        act(() => result.current.setExpenseFields({ amount: '85000' }));
        act(() => result.current.reset());

        expect(localSpy).not.toHaveBeenCalled();
        expect(sessionSpy).not.toHaveBeenCalled();

        localSpy.mockRestore();
        sessionSpy.mockRestore();
    });
});

/**
 * Captura, recorte y escaneo (tarea 4.2).
 *
 * Se mockean solo las dos fronteras que no existen en jsdom: la compresión de
 * imagen y la invocación de la edge function. El normalizador de la respuesta,
 * la cascada de producto, la cascada de proveedor y las reglas del gasto corren
 * de verdad, así que estas pruebas verifican el cableado real del flujo.
 */
describe('useInvoiceScanDraft — captura y escaneo', () => {
    /** Base64 y tipo que devuelve la compresión mockeada. */
    const COMPRESSED_BASE64 = 'RkFDVFVSQQ==';
    const COMPRESSED_MIME = 'image/jpeg';
    const SCAN_OPTIONS = { timeoutMs: 45_000 };

    /** Archivo de entrada del paso de captura, con tamaño y tipo controlados. */
    const buildFile = (patch: { size?: number; type?: string; name?: string } = {}): File => {
        const file = new File(['contenido'], patch.name ?? 'factura.jpg', {
            type: patch.type ?? 'image/jpeg',
        });
        if (patch.size !== undefined) {
            Object.defineProperty(file, 'size', { value: patch.size, configurable: true });
        }
        return file;
    };

    /** Blob que entrega el recorte de esquinas. */
    const buildCrop = (): Blob => new Blob(['recorte'], { type: 'image/webp' });

    const buildProduct = (patch: Partial<Product> = {}): Product => ({
        id: 'p-bonyurt',
        business_id: 'b-1',
        name: 'BONYURT CHOCOKRISPIS',
        type: 'simple',
        price: 3500,
        cost: 2000,
        min_stock: 0,
        unit: 'Und',
        image: '',
        category: 'LÁCTEOS',
        is_active: true,
        is_for_sale: true,
        has_customization: false,
        customizable_options: [],
        nicknames: [],
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        ...patch,
    });

    const buildSupplier = (patch: Partial<Supplier> = {}): Supplier => ({
        id: 'sup-1',
        business_id: 'b-1',
        name: 'DISTRIBUIDORA X SAS',
        nit: '900123456-7',
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        ...patch,
    });

    const catalog = [buildProduct()];
    const proveedores = [buildSupplier()];

    /** Respuesta válida de `scan-invoice-unified`: una línea que coincide y otra que no. */
    const invoiceResponse = {
        header: {
            supplierName: 'DISTRIBUIDORA X SAS',
            nit: '900.123.456-7',
            invoiceNumber: 'F-00123',
            date: '2026-08-01',
        },
        document: { globalDiscount: 5000, documentTotal: 45000 },
        items: [
            {
                description: 'BONYURT CHOCOKRISPIS',
                quantity: 2,
                ocr_unit: 'CJ',
                unitValue: 12000,
                lineSubtotal: 24000,
                lineTax: 0,
                lineDiscount: 0,
                lineNetTotal: 24000,
            },
            {
                description: 'GALLETA SIN CATALOGAR',
                quantity: 1,
                ocr_unit: '',
                unitValue: 26000,
                lineSubtotal: 26000,
                lineTax: 0,
                lineDiscount: 0,
                lineNetTotal: 26000,
            },
        ],
    };

    /** Respuesta válida de `scan-expense`. */
    const expenseResponse = {
        amount: 85000,
        description: 'Energía julio',
        supplierName: 'AIRE',
        nit: '900555111',
        date: '2020-05-04',
    };

    /** Promesa que se resuelve a mano, para observar el paso intermedio. */
    const deferred = <T,>() => {
        let resolve!: (value: T) => void;
        const promise = new Promise<T>(r => { resolve = r; });
        return { promise, resolve };
    };

    type ScanApi = ReturnType<typeof useInvoiceScanDraft>;

    /** Lleva el flujo hasta el recorte con una imagen válida adjunta. */
    const goToCrop = async (
        api: { current: ScanApi },
        destination: 'inventory' | 'expense' = 'inventory',
    ): Promise<void> => {
        act(() => api.current.chooseDestination(destination));
        await act(async () => { await api.current.attachImage(buildFile()); });
    };

    beforeEach(() => {
        invokeMock.mockReset();
        compressImageMock.mockClear();
        compressImageMock.mockResolvedValue({ base64: COMPRESSED_BASE64, mimeType: COMPRESSED_MIME });
        blobToBase64Mock.mockClear();
        blobToBase64Mock.mockResolvedValue(COMPRESSED_BASE64);
    });

    describe('attachImage — límites del archivo', () => {
        it('rechaza un archivo de más de 50 MB sin salir del paso de captura', async () => {
            const { result } = renderHook(() => useInvoiceScanDraft());
            act(() => result.current.chooseDestination('inventory'));

            await act(async () => { await result.current.attachImage(buildFile({ size: MAX_IMAGE_BYTES + 1 })); });

            // El paso sigue siendo la captura: cámara y galería quedan visibles.
            expect(result.current.step).toBe('capture');
            expect(result.current.draft.image).toBeNull();
            expect(result.current.captureError).toContain('50 MB');
            expect(result.current.isDirty).toBe(false);
        });

        it('acepta 50 MB exactos y pasa al recorte', async () => {
            const { result } = renderHook(() => useInvoiceScanDraft());
            act(() => result.current.chooseDestination('inventory'));

            await act(async () => { await result.current.attachImage(buildFile({ size: MAX_IMAGE_BYTES })); });

            expect(result.current.step).toBe('crop');
            expect(result.current.draft.image?.blob).toBeInstanceOf(Blob);
            expect(result.current.captureError).toBeNull();
        });

        it('rechaza un archivo que no es imagen sin salir del paso de captura', async () => {
            const { result } = renderHook(() => useInvoiceScanDraft());
            act(() => result.current.chooseDestination('inventory'));

            await act(async () => {
                await result.current.attachImage(buildFile({ type: 'application/pdf', name: 'factura.pdf' }));
            });

            expect(result.current.step).toBe('capture');
            expect(result.current.draft.image).toBeNull();
            expect(result.current.captureError).toContain('no es una imagen');
        });

        it('un archivo válido no dispara ninguna llamada a la edge function', async () => {
            const { result } = renderHook(() => useInvoiceScanDraft());
            await goToCrop(result);

            expect(invokeMock).not.toHaveBeenCalled();
        });
    });

    describe('confirmCrop — compresión, Evidencia y envío', () => {
        it('guarda la Evidencia comprimida, pasa a processing y envía esos mismos bytes', async () => {
            const pendiente = deferred<{ data: unknown; error: string | null }>();
            invokeMock.mockReturnValue(pendiente.promise as never);

            const { result } = renderHook(() => useInvoiceScanDraft({ products: catalog, suppliers: proveedores }));
            await goToCrop(result);

            let confirmando!: Promise<void>;
            await act(async () => {
                confirmando = result.current.confirmCrop(buildCrop());
                await Promise.resolve();
            });

            await waitFor(() => expect(result.current.step).toBe('processing'));

            // Req 2.4: la compresión se pide con el lado mayor en 1600 píxeles.
            expect(compressImageMock).toHaveBeenCalledWith(expect.any(File), SCAN_MAX_DIMENSION);
            const evidencia = result.current.draft.image?.blob;
            expect(evidencia).toBeInstanceOf(Blob);

            pendiente.resolve({ data: invoiceResponse, error: null });
            await act(async () => { await confirmando; });

            // Req 2.5: el base64 enviado se leyó del blob guardado como Evidencia.
            expect(blobToBase64Mock).toHaveBeenCalledWith(evidencia);
            expect(result.current.draft.image?.blob).toBe(evidencia);
        });

        it('el cuerpo de scan-invoice-unified incluye proveedores y catálogo del negocio activo', async () => {
            invokeMock.mockResolvedValue({ data: invoiceResponse, error: null });

            const { result } = renderHook(() => useInvoiceScanDraft({ products: catalog, suppliers: proveedores }));
            await goToCrop(result);
            await act(async () => { await result.current.confirmCrop(buildCrop()); });

            expect(invokeMock).toHaveBeenCalledWith(
                'scan-invoice-unified',
                {
                    imageBase64: COMPRESSED_BASE64,
                    mimeType: COMPRESSED_MIME,
                    suppliers: proveedores.map(s => ({ id: s.id, name: s.name, nit: s.nit || '', phone: s.phone || '' })),
                    catalog: catalog.filter(p => p.type === 'simple').map(p => ({
                        id: p.id,
                        name: p.name,
                        nicknames: p.nicknames || [],
                        barcode: p.barcode || '',
                        unit: p.unit || '',
                        purchaseUnits: [],
                    })),
                },
                SCAN_OPTIONS,
            );
        });

        it('si la compresión falla vuelve a la captura y no llama a la IA', async () => {
            compressImageMock.mockRejectedValueOnce(new Error('canvas no soportado'));

            const { result } = renderHook(() => useInvoiceScanDraft());
            await goToCrop(result);
            await act(async () => { await result.current.confirmCrop(buildCrop()); });

            expect(result.current.step).toBe('capture');
            expect(result.current.draft.image).toBeNull();
            expect(result.current.captureError).toContain('No pudimos procesar la imagen');
            expect(invokeMock).not.toHaveBeenCalled();
        });
    });

    describe('Ruta_Inventario — resultado válido', () => {
        it('avanza automáticamente con proveedor confirmado y va a lineResolver por línea pendiente', async () => {
            invokeMock.mockResolvedValue({ data: invoiceResponse, error: null });

            const { result } = renderHook(() => useInvoiceScanDraft({ products: catalog, suppliers: proveedores }));
            await goToCrop(result);
            await act(async () => { await result.current.confirmCrop(buildCrop()); });

            expect(result.current.step).toBe('lineResolver');
            expect(result.current.draft.header.invoiceNumber).toBe('F-00123');
            expect(result.current.draft.globalDiscount).toBe(5000);

            // Proveedor confirmado por NIT normalizado (900.123.456-7 = 900123456-7).
            expect(result.current.draft.supplier).toEqual({
                kind: 'existing',
                id: 'sup-1',
                name: 'DISTRIBUIDORA X SAS',
            });

            const lineas = result.current.draft.lines;
            expect(lineas).toHaveLength(2);
            expect(lineas.map(l => l.netTotal)).toEqual([24000, 26000]);
            expect(lineas.map(l => l.ocrUnit)).toEqual(['CJ', '']);
            // El Descuento_Global se repartió completo entre las dos líneas.
            expect(lineas.reduce((total, l) => total + l.globalDiscountShare, 0)).toBe(5000);

            // La línea que coincide con el catálogo queda pre-resuelta (Req 6.1, 6.2).
            expect(lineas[0].decision).toEqual({
                kind: 'linked',
                productId: 'p-bonyurt',
                addNickname: false,
            });
            // La que no coincide espera la decisión del Usuario.
            expect(lineas[1].decision).toEqual({ kind: 'pending' });
            // Al confirmarse el proveedor automáticamente, la unidad se detecta de inmediato.
            expect(lineas[0].unitCase).toBe('unknown');
            expect(lineas[0].conversionFactor).toBeNull();
            // Como la línea 0 requiere equivalencia de unidad, arranca en la línea 0.
            expect(result.current.draft.currentLineIndex).toBe(0);
        });

        it('vincula por aiProductId directo y confirma proveedor por supplier_id sugerido por la IA', async () => {
            const aiResponse = {
                header: {
                    supplierName: 'DISTRIBUIDORA X REGIONAL',
                    nit: '900123456-7',
                    supplier_id: 'sup-1',
                    invoiceNumber: 'INV-99',
                    date: '2026-08-05',
                },
                document: { globalDiscount: 0, documentTotal: 30000 },
                items: [
                    {
                        description: 'ARRZ CRIPTICO 500',
                        product_id: 'p-bonyurt', // Simula que la IA lo emparejó
                        candidate_ids: [],
                        quantity: 1,
                        ocr_unit: '',
                        unitValue: 10000,
                        lineSubtotal: 10000,
                        lineTax: 0,
                        lineDiscount: 0,
                        lineNetTotal: 10000,
                    },
                    {
                        description: 'PRODUCTO AMBIGUO',
                        product_id: null,
                        candidate_ids: ['p-bonyurt'],
                        quantity: 2,
                        ocr_unit: '',
                        unitValue: 10000,
                        lineSubtotal: 20000,
                        lineTax: 0,
                        lineDiscount: 0,
                        lineNetTotal: 20000,
                    },
                ],
            };

            invokeMock.mockResolvedValue({ data: aiResponse, error: null });

            const { result } = renderHook(() => useInvoiceScanDraft({ products: catalog, suppliers: proveedores }));
            await goToCrop(result);
            await act(async () => { await result.current.confirmCrop(buildCrop()); });

            expect(result.current.step).toBe('lineResolver');
            expect(result.current.draft.supplier).toEqual({
                kind: 'existing',
                id: 'sup-1',
                name: 'DISTRIBUIDORA X SAS',
            });

            const lineas = result.current.draft.lines;
            expect(lineas[0].decision).toEqual({
                kind: 'linked',
                productId: 'p-bonyurt',
                addNickname: false,
            });
            expect(lineas[1].decision).toEqual({ kind: 'pending' });
            expect(lineas[1].candidateIds).toEqual(['p-bonyurt']);
        });

        it('avanza directamente a review cuando el proveedor y todos los productos son reconocidos, y atrás vuelve a supplier', async () => {
            const allMatchedResponse = {
                header: {
                    supplierName: 'DISTRIBUIDORA X SAS',
                    nit: '900.123.456-7',
                    invoiceNumber: 'INV-100',
                    date: '2026-08-05',
                },
                document: { globalDiscount: 0, documentTotal: 10000 },
                items: [
                    {
                        description: 'BONYURT CHOCOKRISPIS',
                        product_id: 'p-bonyurt',
                        quantity: 1,
                        ocr_unit: '',
                        unitValue: 10000,
                        lineSubtotal: 10000,
                        lineTax: 0,
                        lineDiscount: 0,
                        lineNetTotal: 10000,
                    },
                ],
            };

            invokeMock.mockResolvedValue({ data: allMatchedResponse, error: null });

            const { result } = renderHook(() => useInvoiceScanDraft({ products: catalog, suppliers: proveedores }));
            await goToCrop(result);
            await act(async () => { await result.current.confirmCrop(buildCrop()); });

            // Al estar proveedor y productos 100% reconocidos, no pasa por supplier ni por lineResolver
            expect(result.current.step).toBe('review');
            expect(result.current.draft.supplier).toEqual({
                kind: 'existing',
                id: 'sup-1',
                name: 'DISTRIBUIDORA X SAS',
            });

            // Al presionar atrás desde review sin líneas manuales, debe volver a supplier
            act(() => {
                result.current.goBack();
            });
            expect(result.current.step).toBe('supplier');
        });

        it('aplica el factor deducido por la IA para convertir a unidades de venta y avanzar a review', async () => {
            const aiFactorResponse = {
                header: {
                    supplierName: 'DISTRIBUIDORA X SAS',
                    nit: '900.123.456-7',
                    invoiceNumber: 'INV-101',
                    date: '2026-08-05',
                },
                document: { globalDiscount: 0, documentTotal: 48000 },
                items: [
                    {
                        description: 'POKER CAJA X 24',
                        product_id: 'p-bonyurt',
                        quantity: 2,
                        ocr_unit: 'CAJA',
                        conversion_factor: 24,
                        inventory_quantity: 48,
                        reasoning: 'Caja x 24 deducido para unidades sueltas.',
                        unit_needs_clarification: false,
                        unitValue: 24000,
                        lineSubtotal: 48000,
                        lineTax: 0,
                        lineDiscount: 0,
                        lineNetTotal: 48000,
                    },
                ],
            };

            invokeMock.mockResolvedValue({ data: aiFactorResponse, error: null });

            const { result } = renderHook(() => useInvoiceScanDraft({ products: catalog, suppliers: proveedores }));
            await goToCrop(result);
            await act(async () => { await result.current.confirmCrop(buildCrop()); });

            // Al estar proveedor reconocido y factor deducido por la IA, avanza directo a review
            expect(result.current.step).toBe('review');
            const line = result.current.draft.lines[0];
            expect(line.conversionFactor).toBe(24);
            expect(line.quantity).toBe(48);
            expect(line.reasoning).toBe('Caja x 24 deducido para unidades sueltas.');
        });
    });

    describe('fallos del escaneo', () => {
        it('una respuesta sin líneas lleva a scanError conservando la imagen', async () => {
            invokeMock.mockResolvedValue({
                data: { header: {}, document: { globalDiscount: 0 }, items: [] },
                error: null,
            });

            const { result } = renderHook(() => useInvoiceScanDraft({ products: catalog, suppliers: proveedores }));
            await goToCrop(result);
            await act(async () => { await result.current.confirmCrop(buildCrop()); });

            expect(result.current.step).toBe('scanError');
            expect(result.current.scanErrorMessage).toContain('No reconocimos ninguna línea');
            expect(result.current.draft.image?.blob).toBeInstanceOf(Blob);
            expect(result.current.draft.lines).toEqual([]);
        });

        it('un JSON malformado se trata como escaneo fallido', async () => {
            invokeMock.mockResolvedValue({ data: 'no es un objeto', error: null });

            const { result } = renderHook(() => useInvoiceScanDraft({ products: catalog }));
            await goToCrop(result);
            await act(async () => { await result.current.confirmCrop(buildCrop()); });

            expect(result.current.step).toBe('scanError');
            expect(result.current.scanErrorMessage).toBeTruthy();
            expect(result.current.draft.image?.blob).toBeInstanceOf(Blob);
        });

        it('un error de la edge function lleva a scanError con su mensaje', async () => {
            invokeMock.mockResolvedValue({ data: null, error: 'No se pudo procesar la imagen.' });

            const { result } = renderHook(() => useInvoiceScanDraft({ products: catalog }));
            await goToCrop(result);
            await act(async () => { await result.current.confirmCrop(buildCrop()); });

            expect(result.current.step).toBe('scanError');
            expect(result.current.scanErrorMessage).toBe('No se pudo procesar la imagen.');
            expect(result.current.draft.image?.blob).toBeInstanceOf(Blob);
        });

        it('retryScan reintenta con la misma imagen, sin volver a comprimir', async () => {
            invokeMock.mockResolvedValueOnce({ data: null, error: 'timeout' });

            const { result } = renderHook(() => useInvoiceScanDraft({ products: catalog, suppliers: proveedores }));
            await goToCrop(result);
            await act(async () => { await result.current.confirmCrop(buildCrop()); });
            expect(result.current.step).toBe('scanError');

            const evidencia = result.current.draft.image?.blob;
            invokeMock.mockResolvedValueOnce({ data: invoiceResponse, error: null });
            await act(async () => { await result.current.retryScan(); });

            expect(invokeMock).toHaveBeenCalledTimes(2);
            expect(compressImageMock).toHaveBeenCalledTimes(1);
            expect(result.current.draft.image?.blob).toBe(evidencia);
            expect(result.current.step).toBe('lineResolver');
            expect(result.current.scanErrorMessage).toBeNull();
        });

        it('continueManual pasa a manualEntry con la imagen y lo demás vacío', async () => {
            invokeMock.mockResolvedValue({ data: invoiceResponse, error: null });

            const { result } = renderHook(() => useInvoiceScanDraft({ products: catalog, suppliers: proveedores }));
            await goToCrop(result);
            await act(async () => { await result.current.confirmCrop(buildCrop()); });
            // Con un escaneo exitoso ya hay proveedor y líneas: el descarte se ve mejor.
            expect(result.current.draft.lines).toHaveLength(2);

            const evidencia = result.current.draft.image?.blob;
            act(() => result.current.continueManual());

            expect(result.current.step).toBe('manualEntry');
            expect(result.current.draft.image?.blob).toBe(evidencia);
            expect(result.current.draft.lines).toEqual([]);
            expect(result.current.draft.supplier).toBeNull();
            expect(result.current.draft.header.supplierName).toBeNull();
            expect(result.current.draft.globalDiscount).toBe(0);
            expect(result.current.scanErrorMessage).toBeNull();
        });
    });

    describe('Ruta_Gasto — prellenado con las reglas vigentes', () => {
        it('envía los proveedores del negocio y prellena valor, descripción y fecha', async () => {
            invokeMock.mockResolvedValue({ data: expenseResponse, error: null });

            const { result } = renderHook(() => useInvoiceScanDraft({ suppliers: proveedores }));
            await goToCrop(result, 'expense');
            await act(async () => { await result.current.confirmCrop(buildCrop()); });

            // Req 11.1 y 17.6: la imagen y los proveedores del Negocio_Activo.
            expect(invokeMock).toHaveBeenCalledWith(
                'scan-expense',
                {
                    imageBase64: COMPRESSED_BASE64,
                    mimeType: COMPRESSED_MIME,
                    suppliers: [{ name: 'DISTRIBUIDORA X SAS', nit: '900123456-7' }],
                },
                SCAN_OPTIONS,
            );

            expect(result.current.draft.expense?.amount).toBe('85000');
            expect(result.current.draft.expense?.description).toBe('Energía julio');
            expect(result.current.draft.expense?.date).toBe('2020-05-04');
            // La categoría la elige el Usuario en el paso de campos (Req 11.3).
            expect(result.current.draft.expense?.category).toBeNull();
            // Proveedor detectado sin coincidencia: se propone como nuevo (Req 11.7).
            expect(result.current.draft.supplier).toEqual({
                kind: 'new',
                name: 'AIRE',
                nit: '900555111',
                phone: '',
            });
            // El proveedor se confirma antes de los campos del gasto.
            expect(result.current.step).toBe('supplier');
        });

        it('una fecha posterior a hoy se reemplaza por la fecha actual', async () => {
            invokeMock.mockResolvedValue({
                data: { ...expenseResponse, date: '2099-12-31' },
                error: null,
            });

            const { result } = renderHook(() => useInvoiceScanDraft({ suppliers: proveedores }));
            await goToCrop(result, 'expense');
            await act(async () => { await result.current.confirmCrop(buildCrop()); });

            expect(result.current.draft.expense?.date).not.toBe('2099-12-31');
            expect(result.current.draft.expense?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });

        it('un error de la Funcion_Escaneo_Gasto conserva la imagen en scanError', async () => {
            invokeMock.mockResolvedValue({ data: null, error: 'No se pudo leer el comprobante.' });

            const { result } = renderHook(() => useInvoiceScanDraft({ suppliers: proveedores }));
            await goToCrop(result, 'expense');
            await act(async () => { await result.current.confirmCrop(buildCrop()); });

            expect(result.current.step).toBe('scanError');
            expect(result.current.draft.image?.blob).toBeInstanceOf(Blob);
            expect(result.current.draft.expense).toBeNull();
        });
    });
});

/**
 * Resolución de proveedor, líneas y equivalencias (tarea 4.3).
 *
 * Estas pruebas conducen el flujo real hasta el Resolutor_Producto usando el
 * escaneo de la Ruta_Inventario (con la edge function mockeada) y verifican la
 * confirmación del proveedor, las tres decisiones de línea (`link`, `create`,
 * `skip`), la detección de unidad, los tres casos de apodo, la equivalencia y
 * la edición desde el Panel_Revision.
 *
 * El Descuento_Global se deja en cero en todos los documentos, así que el total
 * de cada línea tras la conversión es exactamente su `lineNetTotal`.
 */
describe('useInvoiceScanDraft — resolución de líneas (tarea 4.3)', () => {
    const COMPRESSED_BASE64 = 'RkFDVFVSQQ==';
    const COMPRESSED_MIME = 'image/jpeg';

    const buildFile = (): File => new File(['contenido'], 'factura.jpg', { type: 'image/jpeg' });
    const buildCrop = (): Blob => new Blob(['recorte'], { type: 'image/webp' });

    const buildProduct = (patch: Partial<Product> = {}): Product => ({
        id: 'p-arroz',
        business_id: 'b-1',
        name: 'ARROZ DIANA',
        type: 'simple',
        price: 3500,
        cost: 2000,
        min_stock: 0,
        unit: 'Libra',
        image: '',
        category: 'GRANOS',
        is_active: true,
        is_for_sale: true,
        has_customization: false,
        customizable_options: [],
        nicknames: [],
        product_purchase_units: [],
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        ...patch,
    });

    /** Ítem crudo de la respuesta de la IA: solo neto y cantidad, sin componentes. */
    const item = (patch: {
        description: string;
        quantity?: number;
        ocr_unit?: string;
        lineNetTotal?: number;
    }) => ({
        description: patch.description,
        quantity: patch.quantity ?? 1,
        ocr_unit: patch.ocr_unit ?? '',
        lineNetTotal: patch.lineNetTotal ?? 1000,
    });

    const VALID_SUPPLIER: SupplierDecision = { kind: 'existing', id: 'sup-1', name: 'DISTRIBUIDORA X' };

    const newProduct = (patch: Partial<NewProductDraft> = {}): NewProductDraft => ({
        name: 'PRODUCTO NUEVO',
        categoryId: 'cat-1',
        unit: 'Unidad',
        cost: 1000,
        price: 1500,
        isForSale: true,
        barcode: '',
        ...patch,
    });

    beforeEach(() => {
        invokeMock.mockReset();
        compressImageMock.mockClear();
        compressImageMock.mockResolvedValue({ base64: COMPRESSED_BASE64, mimeType: COMPRESSED_MIME });
        blobToBase64Mock.mockClear();
        blobToBase64Mock.mockResolvedValue(COMPRESSED_BASE64);
    });

    type ScanApi = ReturnType<typeof useInvoiceScanDraft>;

    /** Conduce la Ruta_Inventario hasta el paso `supplier` con las líneas dadas. */
    const driveToSupplier = async (
        items: ReturnType<typeof item>[],
        products: Product[] = [],
        suppliers: Supplier[] = [],
    ): Promise<{ current: ScanApi }> => {
        invokeMock.mockResolvedValue({
            data: { header: {}, document: { globalDiscount: 0 }, items },
            error: null,
        });
        const { result } = renderHook(() => useInvoiceScanDraft({ products, suppliers }));
        act(() => result.current.chooseDestination('inventory'));
        await act(async () => { await result.current.attachImage(buildFile()); });
        await act(async () => { await result.current.confirmCrop(buildCrop()); });
        return result;
    };

    /** Conduce la Ruta_Gasto hasta el paso `supplier`. */
    const driveExpenseToSupplier = async (): Promise<{ current: ScanApi }> => {
        invokeMock.mockResolvedValue({
            data: { amount: 85000, description: 'Energía', supplierName: 'AIRE', nit: '900555111', date: '2020-05-04' },
            error: null,
        });
        const { result } = renderHook(() => useInvoiceScanDraft({ suppliers: [] }));
        act(() => result.current.chooseDestination('expense'));
        await act(async () => { await result.current.attachImage(buildFile()); });
        await act(async () => { await result.current.confirmCrop(buildCrop()); });
        return result;
    };

    describe('confirmSupplier — bloqueo y avance según ruta', () => {
        it('no avanza sin un proveedor válido', async () => {
            const result = await driveToSupplier([item({ description: 'MERCA UNO', ocr_unit: 'Libra' })]);
            expect(result.current.step).toBe('supplier');

            act(() => result.current.confirmSupplier({ kind: 'new', name: '   ', nit: '', phone: '' }));
            expect(result.current.step).toBe('supplier');

            act(() => result.current.confirmSupplier({ kind: 'existing', id: '', name: 'X' }));
            expect(result.current.step).toBe('supplier');
        });

        it('en la Ruta_Inventario un proveedor válido avanza al Resolutor_Producto', async () => {
            const result = await driveToSupplier([item({ description: 'MERCA UNO', ocr_unit: 'Libra', quantity: 2, lineNetTotal: 6000 })]);

            act(() => result.current.confirmSupplier(VALID_SUPPLIER));

            expect(result.current.step).toBe('lineResolver');
            expect(result.current.draft.supplier).toEqual(VALID_SUPPLIER);
            expect(result.current.progress).toEqual({ current: 1, total: 1 });
        });

        it('en la Ruta_Gasto un proveedor válido avanza a los campos del gasto', async () => {
            const result = await driveExpenseToSupplier();
            expect(result.current.step).toBe('supplier');

            act(() => result.current.confirmSupplier(VALID_SUPPLIER));

            expect(result.current.step).toBe('expenseFields');
            expect(result.current.draft.supplier).toEqual(VALID_SUPPLIER);
        });

        it('resuelve la unidad de las líneas auto-vinculadas al confirmar el proveedor', async () => {
            // "ARROZ DIANA" coincide con el catálogo: la línea llega auto-vinculada.
            const result = await driveToSupplier(
                [item({ description: 'ARROZ DIANA', ocr_unit: 'Libra', quantity: 3, lineNetTotal: 9000 })],
                [buildProduct()],
            );
            expect(result.current.draft.lines[0].decision.kind).toBe('linked');
            expect(result.current.draft.lines[0].unitCase).toBeNull();

            act(() => result.current.confirmSupplier(VALID_SUPPLIER));

            // Unidad_OCR = Unidad_Venta ⇒ caso venta, sin conversión, línea lista.
            const line = result.current.draft.lines[0];
            expect(line.unitCase).toBe('sale');
            expect(line.conversionFactor).toBe(1);
            expect(line.quantity).toBe(3);
            expect(line.lineTotal).toBe(9000);
            // Sin más líneas pendientes, se abre el Panel_Revision.
            expect(result.current.step).toBe('review');
        });
    });

    describe('resolveLine — vincular con detección de unidad', () => {
        it('link con Unidad_Venta deja la línea lista y avanza', async () => {
            const result = await driveToSupplier(
                [
                    item({ description: 'MERCA UNO', ocr_unit: 'Libra', quantity: 2, lineNetTotal: 6000 }),
                    item({ description: 'MERCA DOS', ocr_unit: 'Libra', quantity: 1, lineNetTotal: 3000 }),
                ],
                [buildProduct()],
            );
            act(() => result.current.confirmSupplier(VALID_SUPPLIER));
            expect(result.current.step).toBe('lineResolver');

            act(() => result.current.resolveLine({ kind: 'link', productId: 'p-arroz', addNickname: false }));

            const line = result.current.draft.lines[0];
            expect(line.decision).toEqual({ kind: 'linked', productId: 'p-arroz', addNickname: false });
            expect(line.unitCase).toBe('sale');
            expect(line.conversionFactor).toBe(1);
            expect(line.createPurchaseUnit).toBe(false);
            expect(line.quantity).toBe(2);
            expect(line.lineTotal).toBe(6000);
            // Avanza a la siguiente línea pendiente.
            expect(result.current.draft.currentLineIndex).toBe(1);
            expect(result.current.step).toBe('lineResolver');
        });

        it('link con una Unidad_Compra conocida aplica el factor guardado', async () => {
            const result = await driveToSupplier(
                [item({ description: 'MERCA UNO', ocr_unit: 'Bulto', quantity: 1, lineNetTotal: 50000 })],
                [buildProduct({ product_purchase_units: [{ unit_name: 'Bulto', conversion_factor: 50 }] })],
            );
            act(() => result.current.confirmSupplier(VALID_SUPPLIER));

            act(() => result.current.resolveLine({ kind: 'link', productId: 'p-arroz', addNickname: false }));

            const line = result.current.draft.lines[0];
            expect(line.unitCase).toBe('known');
            expect(line.conversionFactor).toBe(50);
            expect(line.createPurchaseUnit).toBe(false);
            expect(line.quantity).toBe(50);
            expect(line.lineTotal).toBe(50000);
            // Única línea, ya resuelta: Panel_Revision.
            expect(result.current.step).toBe('review');
        });

        it('link con Unidad_OCR desconocida deja la línea a la espera del factor', async () => {
            const result = await driveToSupplier(
                [item({ description: 'MERCA UNO', ocr_unit: 'Caja', quantity: 2, lineNetTotal: 20000 })],
                [buildProduct()],
            );
            act(() => result.current.confirmSupplier(VALID_SUPPLIER));

            act(() => result.current.resolveLine({ kind: 'link', productId: 'p-arroz', addNickname: false }));

            const line = result.current.draft.lines[0];
            expect(line.decision.kind).toBe('linked');
            expect(line.unitCase).toBe('unknown');
            expect(line.conversionFactor).toBeNull();
            expect(line.quantity).toBeNull();
            // No avanza: sigue en la misma línea esperando la equivalencia.
            expect(result.current.step).toBe('lineResolver');
            expect(result.current.draft.currentLineIndex).toBe(0);
        });

        it('link con Unidad_OCR no configurada auto-resuelve el factor si viene en la descripción (ej: X 24)', async () => {
            const result = await driveToSupplier(
                [item({ description: 'CERVEZA AGUILA LATA 330ML X 24', ocr_unit: 'Caja', quantity: 2, lineNetTotal: 48000 })],
                [buildProduct({ unit: 'Und' })],
            );
            act(() => result.current.confirmSupplier(VALID_SUPPLIER));

            act(() => result.current.resolveLine({ kind: 'link', productId: 'p-arroz', addNickname: false }));

            const line = result.current.draft.lines[0];
            expect(line.decision.kind).toBe('linked');
            expect(line.unitCase).toBe('known');
            expect(line.conversionFactor).toBe(24);
            expect(line.createPurchaseUnit).toBe(true);
            expect(line.quantity).toBe(48);
            expect(line.lineTotal).toBe(48000);
            // No se interrumpe: avanza directo a review porque la equivalencia se auto-resolvió
            expect(result.current.step).toBe('review');
        });
    });

    describe('resolveLine — los tres casos de apodo', () => {
        it('apodo nuevo: nadie lo usa, la propuesta se conserva', async () => {
            const result = await driveToSupplier(
                [item({ description: 'MERCA UNO', ocr_unit: 'Libra', quantity: 1, lineNetTotal: 3000 })],
                [buildProduct({ nicknames: [] })],
            );
            act(() => result.current.confirmSupplier(VALID_SUPPLIER));

            expect(result.current.nicknameOwner).toBeNull();
            act(() => result.current.resolveLine({ kind: 'link', productId: 'p-arroz', addNickname: true }));

            expect(result.current.draft.lines[0].decision).toMatchObject({
                kind: 'linked',
                productId: 'p-arroz',
                addNickname: true,
            });
        });

        it('apodo del mismo producto: no se vuelve a proponer', async () => {
            const result = await driveToSupplier(
                [item({ description: 'MERCA UNO', ocr_unit: 'Bulto', quantity: 1, lineNetTotal: 3000 })],
                [buildProduct({ nicknames: ['MERCA UNO'] })],
            );
            act(() => result.current.confirmSupplier(VALID_SUPPLIER));
            expect(result.current.draft.currentLineIndex).toBe(0);
            expect(result.current.nicknameOwner).toEqual({ productId: 'p-arroz', productName: 'ARROZ DIANA' });

            act(() => result.current.resolveLine({ kind: 'link', productId: 'p-arroz', addNickname: true }));

            // El apodo ya existe en el producto: la propuesta se descarta.
            expect(result.current.draft.lines[0].decision).toMatchObject({
                kind: 'linked',
                productId: 'p-arroz',
                addNickname: false,
            });
        });

        it('apodo de otro producto: se vincula sin agregar el apodo', async () => {
            const arroz = buildProduct({ nicknames: ['MERCA UNO'] });
            const aceite = buildProduct({ id: 'p-aceite', name: 'ACEITE GIRASOL', unit: 'Libra', nicknames: [] });
            const result = await driveToSupplier(
                [item({ description: 'MERCA UNO', ocr_unit: 'Bulto', quantity: 1, lineNetTotal: 3000 })],
                [arroz, aceite],
            );
            act(() => result.current.confirmSupplier(VALID_SUPPLIER));
            expect(result.current.draft.currentLineIndex).toBe(0);

            // El apodo pertenece a ARROZ DIANA aunque vinculemos a otro producto.
            expect(result.current.nicknameOwner).toEqual({ productId: 'p-arroz', productName: 'ARROZ DIANA' });
            act(() => result.current.resolveLine({ kind: 'link', productId: 'p-aceite', addNickname: true }));

            expect(result.current.draft.lines[0].decision).toMatchObject({
                kind: 'linked',
                productId: 'p-aceite',
                addNickname: false,
            });
        });
    });

    describe('resolveLine — crear producto', () => {
        it('create con la misma unidad que la línea queda listo (caso venta)', async () => {
            const result = await driveToSupplier([item({ description: 'PROD X', ocr_unit: 'Caja', quantity: 2, lineNetTotal: 8000 })]);
            act(() => result.current.confirmSupplier(VALID_SUPPLIER));

            act(() => result.current.resolveLine({ kind: 'create', newProduct: newProduct({ unit: 'Caja' }) }));

            const line = result.current.draft.lines[0];
            expect(line.decision.kind).toBe('created');
            expect(line.unitCase).toBe('sale');
            expect(line.quantity).toBe(2);
            expect(line.lineTotal).toBe(8000);
            expect(result.current.step).toBe('review');
        });

        it('create con unidad distinta pide equivalencia y marca crear Unidad_Compra', async () => {
            const result = await driveToSupplier([item({ description: 'PROD X', ocr_unit: 'Caja', quantity: 2, lineNetTotal: 20000 })]);
            act(() => result.current.confirmSupplier(VALID_SUPPLIER));

            act(() => result.current.resolveLine({ kind: 'create', newProduct: newProduct({ unit: 'Unidad' }) }));

            expect(result.current.draft.lines[0].decision.kind).toBe('created');
            expect(result.current.draft.lines[0].unitCase).toBe('unknown');
            expect(result.current.step).toBe('lineResolver');

            act(() => result.current.setLineEquivalence(6));

            const line = result.current.draft.lines[0];
            expect(line.conversionFactor).toBe(6);
            expect(line.createPurchaseUnit).toBe(true);
            expect(line.quantity).toBe(12);
            expect(line.lineTotal).toBe(20000);
            expect(result.current.step).toBe('review');
        });
    });

    describe('resolveLine — omitir', () => {
        it('omitir la única línea informa la compra sin productos', async () => {
            const result = await driveToSupplier([item({ description: 'PROD X', ocr_unit: 'Libra' })]);
            act(() => result.current.confirmSupplier(VALID_SUPPLIER));

            act(() => result.current.resolveLine({ kind: 'skip' }));

            expect(result.current.draft.lines[0].decision).toEqual({ kind: 'skipped' });
            expect(result.current.step).toBe('emptyPurchase');
        });

        it('cuando todas las líneas quedan omitidas se va a emptyPurchase', async () => {
            const result = await driveToSupplier([
                item({ description: 'PROD A', ocr_unit: 'Libra' }),
                item({ description: 'PROD B', ocr_unit: 'Libra' }),
            ]);
            act(() => result.current.confirmSupplier(VALID_SUPPLIER));

            act(() => result.current.resolveLine({ kind: 'skip' }));
            expect(result.current.step).toBe('lineResolver');
            expect(result.current.draft.currentLineIndex).toBe(1);

            act(() => result.current.resolveLine({ kind: 'skip' }));
            expect(result.current.step).toBe('emptyPurchase');
            expect(result.current.draft.lines.every(l => l.decision.kind === 'skipped')).toBe(true);
        });
    });

    describe('setLineEquivalence — factor de conversión', () => {
        it('rechaza valores ≤ 0 sin cambiar el estado y convierte con un factor válido', async () => {
            const result = await driveToSupplier(
                [item({ description: 'MERCA UNO', ocr_unit: 'Caja', quantity: 2, lineNetTotal: 20000 })],
                [buildProduct()],
            );
            act(() => result.current.confirmSupplier(VALID_SUPPLIER));
            act(() => result.current.resolveLine({ kind: 'link', productId: 'p-arroz', addNickname: false }));
            expect(result.current.draft.lines[0].unitCase).toBe('unknown');

            act(() => result.current.setLineEquivalence(0));
            expect(result.current.draft.lines[0].conversionFactor).toBeNull();
            expect(result.current.step).toBe('lineResolver');

            act(() => result.current.setLineEquivalence(-5));
            expect(result.current.draft.lines[0].conversionFactor).toBeNull();
            expect(result.current.step).toBe('lineResolver');

            act(() => result.current.setLineEquivalence(4));
            const line = result.current.draft.lines[0];
            expect(line.conversionFactor).toBe(4);
            expect(line.createPurchaseUnit).toBe(true);
            expect(line.quantity).toBe(8);
            expect(line.lineTotal).toBe(20000);
            expect(result.current.step).toBe('review');
        });
    });

    describe('goToPreviousLine — reabre la decisión anterior', () => {
        it('vuelve a la línea previa y la deja pendiente', async () => {
            const result = await driveToSupplier(
                [
                    item({ description: 'MERCA UNO', ocr_unit: 'Libra', quantity: 2, lineNetTotal: 6000 }),
                    item({ description: 'MERCA DOS', ocr_unit: 'Libra', quantity: 1, lineNetTotal: 3000 }),
                ],
                [buildProduct()],
            );
            act(() => result.current.confirmSupplier(VALID_SUPPLIER));
            act(() => result.current.resolveLine({ kind: 'link', productId: 'p-arroz', addNickname: false }));
            expect(result.current.draft.currentLineIndex).toBe(1);

            act(() => result.current.goToPreviousLine());

            expect(result.current.draft.currentLineIndex).toBe(0);
            expect(result.current.draft.lines[0].decision).toEqual({ kind: 'pending' });
            expect(result.current.draft.lines[0].unitCase).toBeNull();
            expect(result.current.step).toBe('lineResolver');
        });

        it('en la primera línea no hace nada', async () => {
            const result = await driveToSupplier([item({ description: 'PROD X', ocr_unit: 'Libra' })]);
            act(() => result.current.confirmSupplier(VALID_SUPPLIER));
            expect(result.current.draft.currentLineIndex).toBe(0);

            act(() => result.current.goToPreviousLine());
            expect(result.current.draft.currentLineIndex).toBe(0);
            expect(result.current.step).toBe('lineResolver');
        });

        it('no reabre líneas auto-reconocidas con unidad resuelta al retroceder', async () => {
            const result = await driveToSupplier(
                [
                    item({ description: 'ARROZ DIANA', ocr_unit: 'Libra', quantity: 2, lineNetTotal: 6000 }),
                    item({ description: 'MERCA DOS', ocr_unit: 'Libra', quantity: 1, lineNetTotal: 3000 }),
                ],
                [buildProduct()],
            );
            act(() => result.current.confirmSupplier(VALID_SUPPLIER));
            expect(result.current.draft.currentLineIndex).toBe(1);
            expect(result.current.progress).toEqual({ current: 1, total: 1 });

            act(() => result.current.goToPreviousLine());
            expect(result.current.draft.currentLineIndex).toBe(1);
            expect(result.current.draft.lines[0].decision.kind).toBe('linked');
        });
    });

    describe('Panel_Revision — editar y quitar líneas', () => {
        /** Resuelve dos líneas por vinculación para llegar al Panel_Revision. */
        const driveToReview = async (): Promise<{ current: ScanApi }> => {
            const result = await driveToSupplier(
                [
                    item({ description: 'MERCA UNO', ocr_unit: 'Libra', quantity: 2, lineNetTotal: 6000 }),
                    item({ description: 'MERCA DOS', ocr_unit: 'Libra', quantity: 1, lineNetTotal: 3000 }),
                ],
                [buildProduct()],
            );
            act(() => result.current.confirmSupplier(VALID_SUPPLIER));
            act(() => result.current.resolveLine({ kind: 'link', productId: 'p-arroz', addNickname: false }));
            act(() => result.current.resolveLine({ kind: 'link', productId: 'p-arroz', addNickname: false }));
            expect(result.current.step).toBe('review');
            return result;
        };

        it('updateReviewLine aplica el patch solo a la línea indicada', async () => {
            const result = await driveToReview();

            act(() => result.current.updateReviewLine(0, { quantity: 5, lineTotal: 15000, newPrice: 4000 }));

            expect(result.current.draft.lines[0].quantity).toBe(5);
            expect(result.current.draft.lines[0].lineTotal).toBe(15000);
            expect(result.current.draft.lines[0].newPrice).toBe(4000);
            // La otra línea no se toca.
            expect(result.current.draft.lines[1].quantity).toBe(1);
        });

        it('removeReviewLine omite la línea y conserva la revisión si queda alguna activa', async () => {
            const result = await driveToReview();

            act(() => result.current.removeReviewLine(1));

            expect(result.current.draft.lines[1].decision).toEqual({ kind: 'skipped' });
            expect(result.current.step).toBe('review');
        });

        it('quitar todas las líneas del Panel_Revision lleva a emptyPurchase', async () => {
            const result = await driveToReview();

            act(() => result.current.removeReviewLine(0));
            act(() => result.current.removeReviewLine(1));

            expect(result.current.draft.lines.every(l => l.decision.kind === 'skipped')).toBe(true);
            expect(result.current.step).toBe('emptyPurchase');
        });
    });
});

/**
 * Finalizacion_Registro (tarea 4.4).
 *
 * Estas pruebas conducen el flujo real hasta el Panel_Revision (Ruta_Inventario)
 * o los campos del gasto (Ruta_Gasto) con el escaneo mockeado, y luego verifican
 * `finalize` inyectando los colaboradores efectivos por opciones: la subida de
 * la Evidencia, el motor RPC, la detección de red, el encolado offline y el
 * movimiento de caja offline. Así el hook se prueba sin red, sin Supabase y sin
 * providers, igual que en las tareas 4.1-4.3.
 */
describe('useInvoiceScanDraft — Finalizacion_Registro (tarea 4.4)', () => {
    const COMPRESSED_BASE64 = 'RkFDVFVSQQ==';
    const COMPRESSED_MIME = 'image/jpeg';
    const EVIDENCE_URL = 'https://bucket/debt-evidence/b-1/factura.webp';

    const buildFile = (): File => new File(['contenido'], 'factura.jpg', { type: 'image/jpeg' });
    const buildCrop = (): Blob => new Blob(['recorte'], { type: 'image/webp' });

    const buildProduct = (patch: Partial<Product> = {}): Product => ({
        id: 'p-arroz',
        business_id: 'b-1',
        name: 'ARROZ DIANA',
        type: 'simple',
        price: 3500,
        cost: 2000,
        min_stock: 0,
        unit: 'Libra',
        image: '',
        category: 'GRANOS',
        is_active: true,
        is_for_sale: true,
        has_customization: false,
        customizable_options: [],
        nicknames: [],
        product_purchase_units: [],
        created_at: '2026-01-01',
        updated_at: '2026-01-01',
        ...patch,
    });

    const VALID_SUPPLIER: SupplierDecision = { kind: 'existing', id: 'sup-1', name: 'DISTRIBUIDORA X' };

    /** Ítem de la IA que coincide con el catálogo (auto-vinculado) en Unidad_Venta. */
    const arrozItem = {
        description: 'ARROZ DIANA',
        quantity: 2,
        ocr_unit: 'Libra',
        lineNetTotal: 6000,
    };

    const successResult: RegisterResult = {
        ok: true,
        already_processed: false,
        supplier_id: 'sup-1',
        created_product_ids: [],
        lot_ids: ['lot-1'],
        debt_ids: ['debt-1'],
        cash_movement_ids: ['mov-1'],
        expense_id: null,
        totals: { lines: 1, amount: 6000 },
    };

    /** Colaboradores inyectados por opciones, todos observables. */
    const makeDeps = () => ({
        onClose: vi.fn(),
        businessId: 'b-1',
        userId: 'u-1',
        activeShiftId: 'shift-1' as string | null,
        uploadEvidence: vi.fn(async (): Promise<string | null> => EVIDENCE_URL),
        callRegister: vi.fn<RegisterRpcFn>(async () => successResult),
        checkOffline: vi.fn(async (): Promise<boolean> => false),
        enqueueOffline: vi.fn<EnqueueOfflineFn>(async () => ({ id: 'tx-1' })),
        recordOfflineCashMovement: vi.fn(),
    });

    type Deps = ReturnType<typeof makeDeps>;
    type ScanApi = ReturnType<typeof useInvoiceScanDraft>;

    beforeEach(() => {
        invokeMock.mockReset();
        compressImageMock.mockClear();
        compressImageMock.mockResolvedValue({ base64: COMPRESSED_BASE64, mimeType: COMPRESSED_MIME });
        blobToBase64Mock.mockClear();
        blobToBase64Mock.mockResolvedValue(COMPRESSED_BASE64);
    });

    /**
     * Conduce la Ruta_Inventario hasta el Panel_Revision con una única línea
     * auto-vinculada (Unidad_Venta), lista para finalizar.
     */
    const driveToReview = async (deps: Deps): Promise<{ current: ScanApi }> => {
        invokeMock.mockResolvedValue({
            data: { header: {}, document: { globalDiscount: 0 }, items: [arrozItem] },
            error: null,
        });
        const { result } = renderHook(() => useInvoiceScanDraft({ products: [buildProduct()], suppliers: [], ...deps }));
        act(() => result.current.chooseDestination('inventory'));
        await act(async () => { await result.current.attachImage(buildFile()); });
        await act(async () => { await result.current.confirmCrop(buildCrop()); });
        act(() => result.current.confirmSupplier(VALID_SUPPLIER));
        expect(result.current.step).toBe('review');
        return result;
    };

    describe('éxito online', () => {
        it('sube la Evidencia, llama a la RPC una vez, va a done y descarta el borrador', async () => {
            const deps = makeDeps();
            const result = await driveToReview(deps);

            let outcome;
            await act(async () => { outcome = await result.current.finalize(); });

            // Req 12.3: la Evidencia se sube antes de la RPC.
            expect(deps.uploadEvidence).toHaveBeenCalledTimes(1);
            // Req 12.4: una sola llamada al motor, con la URL ya en el payload.
            expect(deps.callRegister).toHaveBeenCalledTimes(1);
            const [fnName, payload] = deps.callRegister.mock.calls[0];
            expect(fnName).toBe('register_purchase');
            expect(payload).toMatchObject({ business_id: 'b-1', source: 'scan', evidence_url: EVIDENCE_URL });
            expect((payload as any).payment.shift_id).toBe('shift-1');

            expect(outcome).toEqual({ status: 'registered', result: successResult });
            // Req 10.8, 16.5: done, borrador descartado y regreso a origen.
            expect(result.current.step).toBe('done');
            expect(result.current.draft.destination).toBeNull();
            expect(result.current.draft.lines).toEqual([]);
            expect(result.current.submitError).toBeNull();
            expect(deps.onClose).toHaveBeenCalledTimes(1);
        });
    });

    describe('fallo del motor (ok:false)', () => {
        it('mapea el code a submitError conservando el borrador', async () => {
            const deps = makeDeps();
            deps.callRegister = vi.fn<RegisterRpcFn>(async () => ({
                ok: false,
                code: 'shift_invalid',
                message: '',
            }));
            const result = await driveToReview(deps);

            let outcome;
            await act(async () => { outcome = await result.current.finalize(); });

            expect(deps.callRegister).toHaveBeenCalledTimes(1);
            expect(result.current.step).toBe('submitError');
            expect(result.current.submitError?.code).toBe('shift_invalid');
            // Mensaje de la tabla de Error Handling.
            expect(result.current.submitErrorMessage).toBe('El turno de caja ya no está abierto.');
            expect(result.current.canRetryWithoutEvidence).toBe(false);
            expect(outcome).toEqual({ status: 'failed', code: 'shift_invalid', message: 'El turno de caja ya no está abierto.' });

            // Req 12.8: el borrador se conserva intacto.
            expect(result.current.draft.lines).toHaveLength(1);
            expect(result.current.draft.destination).toBe('inventory');
            expect(deps.onClose).not.toHaveBeenCalled();
        });

        it('prefiere el mensaje del motor cuando lo trae (saldo disponible)', async () => {
            const deps = makeDeps();
            deps.callRegister = vi.fn<RegisterRpcFn>(async () => ({
                ok: false,
                code: 'insufficient_cash_balance',
                message: 'Saldo insuficiente en efectivo. Disponible: $12.000.',
            }));
            const result = await driveToReview(deps);

            await act(async () => { await result.current.finalize(); });

            expect(result.current.submitErrorMessage).toBe('Saldo insuficiente en efectivo. Disponible: $12.000.');
        });
    });

    describe('reintento con la misma idempotencyKey (Req 12.9)', () => {
        it('el reintento reusa la clave y termina en done', async () => {
            const deps = makeDeps();
            deps.callRegister = vi
                .fn<RegisterRpcFn>()
                .mockResolvedValueOnce({ ok: false, code: 'product_not_found', message: '' })
                .mockResolvedValueOnce(successResult);
            const result = await driveToReview(deps);

            const keyAntes = result.current.draft.idempotencyKey;

            await act(async () => { await result.current.finalize(); });
            expect(result.current.step).toBe('submitError');
            // El borrador se conservó, así que la clave no cambió.
            expect(result.current.draft.idempotencyKey).toBe(keyAntes);

            await act(async () => { await result.current.retrySubmit(); });

            expect(deps.callRegister).toHaveBeenCalledTimes(2);
            const primeraClave = (deps.callRegister.mock.calls[0][1] as { idempotency_key: string }).idempotency_key;
            const segundaClave = (deps.callRegister.mock.calls[1][1] as { idempotency_key: string }).idempotency_key;
            expect(segundaClave).toBe(primeraClave);
            expect(segundaClave).toBe(keyAntes);
            expect(result.current.step).toBe('done');
        });
    });

    describe('camino sin conexión (Req 13.3, 13.4)', () => {
        it('encola con evidence_url null, no llama a la RPC y refleja la caja', async () => {
            const deps = makeDeps();
            deps.checkOffline = vi.fn(async (): Promise<boolean> => true);
            const result = await driveToReview(deps);

            // Contado con descuento de caja y un método en efectivo.
            act(() => result.current.setPayment({
                isCredit: false,
                dueDate: null,
                paidAmount: 0,
                deductFromCash: true,
                shiftId: 'shift-1',
                methods: [{ methodId: 'm1', mappedId: 'cash', amount: 6000 }],
                creditInitialMethodId: null,
            }));

            let outcome;
            await act(async () => { outcome = await result.current.finalize(); });

            expect(outcome).toEqual({ status: 'queued' });
            // Ni subida ni RPC en el camino offline.
            expect(deps.uploadEvidence).not.toHaveBeenCalled();
            expect(deps.callRegister).not.toHaveBeenCalled();

            // Se encola la intención con la foto en null.
            expect(deps.enqueueOffline).toHaveBeenCalledTimes(1);
            const [type, payload, bId, uId] = deps.enqueueOffline.mock.calls[0];
            expect(type).toBe('inventory_purchase');
            expect((payload as { rpc_payload: { evidence_url: unknown } }).rpc_payload.evidence_url).toBeNull();
            expect(bId).toBe('b-1');
            expect(uId).toBe('u-1');

            // Movimiento de caja offline por la parte en efectivo.
            expect(deps.recordOfflineCashMovement).toHaveBeenCalledWith('b-1', expect.objectContaining({
                type: 'purchase',
                amount: 6000,
                payment_method: 'cash',
                shift_id: 'shift-1',
            }));

            // Se descarta el borrador y se regresa a origen.
            expect(result.current.step).toBe('done');
            expect(result.current.draft.lines).toEqual([]);
            expect(deps.onClose).toHaveBeenCalledTimes(1);
        });
    });

    describe('fallo de subida de la Evidencia', () => {
        it('va a submitError sin llamar a la RPC y permite guardar sin la foto', async () => {
            const deps = makeDeps();
            deps.uploadEvidence = vi.fn(async (): Promise<string | null> => null);
            const result = await driveToReview(deps);

            let outcome;
            await act(async () => { outcome = await result.current.finalize(); });

            expect(deps.uploadEvidence).toHaveBeenCalledTimes(1);
            expect(deps.callRegister).not.toHaveBeenCalled();
            expect(result.current.step).toBe('submitError');
            expect(result.current.submitError?.code).toBe('evidence_upload_failed');
            expect(result.current.canRetryWithoutEvidence).toBe(true);
            expect(outcome).toMatchObject({ status: 'failed', code: 'evidence_upload_failed' });

            // "Guardar sin la foto": registra con evidence_url null y sin volver a subir.
            await act(async () => { await result.current.submitWithoutEvidence(); });

            expect(deps.uploadEvidence).toHaveBeenCalledTimes(1); // no se reintenta la subida
            expect(deps.callRegister).toHaveBeenCalledTimes(1);
            const payload = deps.callRegister.mock.calls[0][1] as { evidence_url: unknown };
            expect(payload.evidence_url).toBeNull();
            expect(result.current.step).toBe('done');
        });
    });

    describe('payload de gasto incompleto', () => {
        it('devuelve failed sin tocar la red', async () => {
            const deps = makeDeps();
            // La IA devuelve un gasto sin valor utilizable y sin categoría.
            invokeMock.mockResolvedValue({
                data: { amount: 0, description: '', supplierName: 'AIRE', nit: '900555111', date: '2020-05-04' },
                error: null,
            });
            const { result } = renderHook(() => useInvoiceScanDraft({ suppliers: [], ...deps }));
            act(() => result.current.chooseDestination('expense'));
            await act(async () => { await result.current.attachImage(buildFile()); });
            await act(async () => { await result.current.confirmCrop(buildCrop()); });
            expect(result.current.step).toBe('supplier');

            let outcome;
            await act(async () => { outcome = await result.current.finalize(); });

            expect(outcome).toEqual({
                status: 'failed',
                code: 'invalid_payload',
                message: 'Los datos del registro están incompletos.',
            });
            // Sin red: ni detección de conexión, ni subida, ni RPC.
            expect(deps.checkOffline).not.toHaveBeenCalled();
            expect(deps.uploadEvidence).not.toHaveBeenCalled();
            expect(deps.callRegister).not.toHaveBeenCalled();
            expect(deps.enqueueOffline).not.toHaveBeenCalled();
            expect(result.current.step).toBe('submitError');
            expect(result.current.submitError?.code).toBe('invalid_payload');
        });
    });
});
