import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { useProducts } from './useProducts';
import { useSuppliers } from './useSuppliers';
import { matchSupplierHeader } from '../lib/invoiceScan/supplierMatch';
import { detectExistingProducts, type DetectionResult } from '../lib/invoiceCreate/detectExisting';
import type { ScanLine, ScanHeader, SupplierDecision } from '../lib/invoiceScan/types';
import type { SupplierMatchResult } from '../lib/invoiceScan/supplierMatch';
import type { Supplier } from './useSuppliers';

// ---- Types ----

/** Item del catálogo extraído por scan-invoice-catalog. Más simple que ScanLine. */
export interface CatalogItem {
    id: string;
    name: string;
    barcode: string;
    cost: number;
    suggestedUnit: string;
    suggestedCategory: string;
}

export type InvoiceCreateStep =
    | 'capture'
    | 'crop'
    | 'processing'
    | 'error'
    | 'supplier'
    | 'summary'
    | 'creating'
    | 'done';

export interface InvoiceCreatePrefill {
    fromInvoiceCreate: true;
    name: string;
    cost: number;
    barcode: string;
    supplierId: string | null;
    currentIndex: number;
    totalNew: number;
    suggestedUnit: string;
    suggestedCategory: string;
}

export type InvoiceCreateResult =
    | { action: 'saved'; productId: string; name: string }
    | { action: 'skipped' }
    | { action: 'cancelled' };

export interface CreatedProduct {
    id: string;
    name: string;
}

// ---- SessionStorage keys ----

const SESSION_PREFILL_KEY = 'bistro_invoice_create_prefill';
const SESSION_RESULT_KEY = 'bistro_invoice_create_result';
const SESSION_FLOW_STATE_KEY = 'bistro_invoice_create_flow_state';

// ---- Flow state persisted across navigation ----

interface InvoiceCreateFlowState {
    step: 'creating';
    lines: ScanLine[];
    catalogItems: CatalogItem[];
    header: ScanHeader;
    supplierId: string | null;
    detection: DetectionResult;
    createdProducts: CreatedProduct[];
    currentNewIndex: number;
}

// ---- Helper: calcula costo unitario de una línea ----

const computeUnitCost = (line: ScanLine): number => {
    const net = line.netTotal - line.globalDiscountShare;
    const cost = line.ocrQuantity > 0 ? net / line.ocrQuantity : net;
    return Math.max(0, Math.round(cost));
};

// ---- Hook ----

export const useInvoiceCreate = () => {
    const { showToast } = useToast();
    const { products } = useProducts();
    const { suppliers, createSupplier } = useSuppliers();

    // State machine
    const [step, setStep] = useState<InvoiceCreateStep>('capture');
    const [lines, setLines] = useState<ScanLine[]>([]);
    const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
    const [header, setHeader] = useState<ScanHeader>({
        supplierName: null,
        nit: null,
        phone: null,
        invoiceNumber: null,
        date: null,
        supplierId: null,
    });
    const [supplierMatch, setSupplierMatch] = useState<SupplierMatchResult<Supplier> | null>(null);
    const [supplierId, setSupplierId] = useState<string | null>(null);
    const [detection, setDetection] = useState<DetectionResult | null>(null);
    const [createdProducts, setCreatedProducts] = useState<CreatedProduct[]>([]);
    const [currentNewIndex, setCurrentNewIndex] = useState(0);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Image state
    const [imageBlob, setImageBlob] = useState<Blob | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    // Guard contra doble-procesamiento
    const processingRef = useRef(false);

    // ---- Restore flow state on mount (survives navigation to SimpleProductScreen) ----

    const flowRestoredRef = useRef(false);

    useEffect(() => {
        try {
            const saved = sessionStorage.getItem(SESSION_FLOW_STATE_KEY);
            if (!saved) return;

            const state: InvoiceCreateFlowState = JSON.parse(saved);
            if (state.step === 'creating' && state.detection) {
                setLines(state.lines);
                setCatalogItems(state.catalogItems || []);
                setHeader(state.header);
                setSupplierId(state.supplierId);
                setDetection(state.detection);
                setCreatedProducts(state.createdProducts);
                setCurrentNewIndex(state.currentNewIndex);
                setStep('creating');
                flowRestoredRef.current = true;
            }
        } catch { /* ignore corrupt data */ }
    }, []);

    // ---- Read result from SimpleProductScreen after flow restore ----

    useEffect(() => {
        // Only process result if we just restored flow state (i.e. returning from SimpleProductScreen)
        if (!flowRestoredRef.current) return;
        flowRestoredRef.current = false;

        const resultStr = sessionStorage.getItem(SESSION_RESULT_KEY);
        if (!resultStr) return;
        sessionStorage.removeItem(SESSION_RESULT_KEY);

        try {
            const result: InvoiceCreateResult = JSON.parse(resultStr);
            if (!result || !result.action) return;

            // Read the persisted flow state to get authoritative values
            const flowStr = sessionStorage.getItem(SESSION_FLOW_STATE_KEY);
            if (!flowStr) return;
            const flow: InvoiceCreateFlowState = JSON.parse(flowStr);

            // Accumulate if saved
            const updatedProducts = result.action === 'saved'
                ? [...flow.createdProducts, { id: result.productId, name: result.name }]
                : flow.createdProducts;

            const nextIndex = flow.currentNewIndex + 1;

            // All done?
            if (nextIndex >= flow.detection.newLines.length) {
                setCreatedProducts(updatedProducts);
                setStep('done');
                try { sessionStorage.removeItem(SESSION_PREFILL_KEY); } catch { /* noop */ }
                try { sessionStorage.removeItem(SESSION_FLOW_STATE_KEY); } catch { /* noop */ }
                return;
            }

            // Advance to next product
            setCreatedProducts(updatedProducts);
            setCurrentNewIndex(nextIndex);

            // Write prefill for the next product
            const nextLine = flow.detection.newLines[nextIndex];
            const catalogItem = (flow.catalogItems || []).find((c: CatalogItem) => c.id === nextLine.id);

            const prefill: InvoiceCreatePrefill = {
                fromInvoiceCreate: true,
                name: catalogItem?.name || nextLine.ocrName,
                cost: catalogItem?.cost || computeUnitCost(nextLine),
                barcode: catalogItem?.barcode || nextLine.barcode || '',
                supplierId: flow.supplierId,
                currentIndex: nextIndex,
                totalNew: flow.detection.newLines.length,
                suggestedUnit: catalogItem?.suggestedUnit || '',
                suggestedCategory: catalogItem?.suggestedCategory || '',
            };
            sessionStorage.setItem(SESSION_PREFILL_KEY, JSON.stringify(prefill));
        } catch { /* invalid JSON, ignore */ }
    }); // eslint-disable-line react-hooks/exhaustive-deps

    // ---- Persist flow state when step is 'creating' ----

    const initialMountRef = useRef(true);

    useEffect(() => {
        // Skip the first run — let restore effect settle first
        if (initialMountRef.current) {
            initialMountRef.current = false;
            return;
        }
        if (step !== 'creating') {
            try { sessionStorage.removeItem(SESSION_FLOW_STATE_KEY); } catch { /* noop */ }
            return;
        }
        if (!detection) return;
        try {
            const state: InvoiceCreateFlowState = {
                step: 'creating',
                lines,
                catalogItems,
                header,
                supplierId,
                detection,
                createdProducts,
                currentNewIndex,
            };
            sessionStorage.setItem(SESSION_FLOW_STATE_KEY, JSON.stringify(state));
        } catch { /* sessionStorage not available */ }
    }, [step, createdProducts, currentNewIndex, detection, lines, catalogItems, header, supplierId]);

    // ---- Actions ----

    const handleCropConfirm = useCallback(async (blob: Blob) => {
        if (processingRef.current) return;
        processingRef.current = true;
        setStep('processing');

        try {
            // Convertir blob a base64
            const buffer = await blob.arrayBuffer();
            const base64 = btoa(
                new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );
            const mimeType = blob.type || 'image/jpeg';

            const { data, error } = await supabase.functions.invoke('scan-invoice-catalog', {
                body: { imageBase64: base64, mimeType },
            });

            if (error) throw new Error(error.message || 'Error al procesar la imagen');

            // Parse the catalog-specific response
            const responseData = data as any;

            if (responseData?.error || !responseData?.items || responseData.items.length === 0) {
                setErrorMessage(responseData?.error || 'No se detectaron productos en la factura.');
                setStep('error');
                return;
            }

            // Build header
            const rawHeader = responseData.header || {};
            const parsedHeader: ScanHeader = {
                supplierName: rawHeader.supplierName?.trim() || null,
                nit: rawHeader.nit?.trim() || null,
                phone: rawHeader.phone?.trim() || null,
                invoiceNumber: null,
                date: null,
                supplierId: null,
            };

            // Build CatalogItem objects from response
            const items: CatalogItem[] = (responseData.items as any[]).map((item: any, index: number) => ({
                id: `catalog-${index}`,
                name: (item.name || '').trim(),
                barcode: (item.barcode || '').trim(),
                cost: typeof item.cost === 'number' ? Math.max(0, item.cost) : 0,
                price: typeof item.price === 'number' ? Math.max(0, item.price) : 0,
                quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
                suggestedCategory: (item.category || '').trim(),
                suggestedUnit: (item.unit || '').trim(),
            }));

            const validItems = items.filter(i => i.name.length > 0);

            if (validItems.length === 0) {
                setErrorMessage('No se pudieron extraer productos válidos de la factura.');
                setStep('error');
                return;
            }

            // Convertir a ScanLine para que detectExistingProducts funcione
            const detectionLines = validItems.map(item => ({
                ocrName: item.name,
                ocrUnit: item.suggestedUnit || 'UND',
                ocrQuantity: 1,
                netTotal: item.cost,
                globalDiscountShare: 0,
                needsReview: false,
                decision: { kind: 'pending' as const },
                unitCase: null,
                conversionFactor: null,
                createPurchaseUnit: false,
                quantity: null,
                lineTotal: null,
                newPrice: null,
            })) as ScanLine[];

            setCatalogItems(validItems);
            setLines(detectionLines);
            setHeader(parsedHeader);

            // Emparejar proveedor con catálogo local
            const match = matchSupplierHeader(parsedHeader, suppliers);
            setSupplierMatch(match);
            setStep('supplier');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Error al procesar la imagen';
            setErrorMessage(message);
            setStep('error');
        } finally {
            processingRef.current = false;
        }
    }, [suppliers]);

    const handleImageSelected = useCallback((file: File, options?: { skipCrop?: boolean }) => {
        const preview = URL.createObjectURL(file);
        setImageBlob(file);
        setImagePreview(preview);
        if (options?.skipCrop) {
            void handleCropConfirm(file);
            return;
        }
        setStep('crop');
    }, [handleCropConfirm]);

    const handleSupplierConfirm = useCallback(async (decision: SupplierDecision) => {
        try {
            let resolvedId: string | null = null;

            if (decision.kind === 'existing') {
                resolvedId = decision.id;
            } else if (decision.kind === 'new') {
                const created = await createSupplier({
                    name: decision.name,
                    nit: decision.nit || undefined,
                    phone: decision.phone || undefined,
                });
                resolvedId = created.id;
            }

            setSupplierId(resolvedId);

            // Detectar productos existentes
            const result = detectExistingProducts(lines, products);
            setDetection(result);
            setStep('summary');
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Error desconocido';
            showToast('Error al crear proveedor: ' + message, 'error');
        }
    }, [lines, products, createSupplier, showToast]);

    const handleSkipSupplier = useCallback(() => {
        setSupplierId(null);
        const result = detectExistingProducts(lines, products);
        setDetection(result);
        setStep('summary');
    }, [lines, products]);

    const handleStartCreating = useCallback(() => {
        if (!detection || detection.newLines.length === 0) return;

        setCurrentNewIndex(0);
        setCreatedProducts([]);
        setStep('creating');

        // Escribir primer prefill en sessionStorage
        const firstLine = detection.newLines[0];
        const catalogItem = catalogItems.find(c => c.id === firstLine.id);

        const prefill: InvoiceCreatePrefill = {
            fromInvoiceCreate: true,
            name: catalogItem?.name || firstLine.ocrName,
            cost: catalogItem?.cost || computeUnitCost(firstLine),
            barcode: catalogItem?.barcode || firstLine.barcode || '',
            supplierId,
            currentIndex: 0,
            totalNew: detection.newLines.length,
            suggestedUnit: catalogItem?.suggestedUnit || '',
            suggestedCategory: catalogItem?.suggestedCategory || '',
        };

        try {
            sessionStorage.setItem(SESSION_PREFILL_KEY, JSON.stringify(prefill));
        } catch { /* sessionStorage no disponible — silencioso */ }
    }, [detection, supplierId, catalogItems]);

    const handleProductResult = useCallback((result: InvoiceCreateResult) => {
        if (!detection) return;

        // Acumular si fue guardado
        if (result.action === 'saved') {
            setCreatedProducts(prev => [...prev, { id: result.productId, name: result.name }]);
        }

        const nextIndex = currentNewIndex + 1;

        // Si ya procesamos todas las líneas → done
        if (nextIndex >= detection.newLines.length) {
            setStep('done');
            try { sessionStorage.removeItem(SESSION_PREFILL_KEY); } catch { /* noop */ }
            return;
        }

        // Avanzar al siguiente producto
        setCurrentNewIndex(nextIndex);
        const nextLine = detection.newLines[nextIndex];
        const catalogItem = catalogItems.find(c => c.id === nextLine.id);

        const prefill: InvoiceCreatePrefill = {
            fromInvoiceCreate: true,
            name: catalogItem?.name || nextLine.ocrName,
            cost: catalogItem?.cost || computeUnitCost(nextLine),
            barcode: catalogItem?.barcode || nextLine.barcode || '',
            supplierId,
            currentIndex: nextIndex,
            totalNew: detection.newLines.length,
            suggestedUnit: catalogItem?.suggestedUnit || '',
            suggestedCategory: catalogItem?.suggestedCategory || '',
        };

        try {
            sessionStorage.setItem(SESSION_PREFILL_KEY, JSON.stringify(prefill));
        } catch { /* sessionStorage no disponible — silencioso */ }
    }, [detection, currentNewIndex, supplierId, catalogItems]);

    const handleRetry = useCallback(async () => {
        if (!imageBlob) {
            setStep('capture');
            return;
        }
        await handleCropConfirm(imageBlob);
    }, [imageBlob, handleCropConfirm]);

    const handleCancel = useCallback(() => {
        // Si estamos creando y ya guardamos algo, ir a done con resultados parciales
        if (step === 'creating' && createdProducts.length > 0) {
            setStep('done');
            try { sessionStorage.removeItem(SESSION_FLOW_STATE_KEY); } catch { /* noop */ }
            try { sessionStorage.removeItem(SESSION_PREFILL_KEY); } catch { /* noop */ }
            return;
        }
        // Limpiar flow state si existía
        try { sessionStorage.removeItem(SESSION_FLOW_STATE_KEY); } catch { /* noop */ }
        try { sessionStorage.removeItem(SESSION_PREFILL_KEY); } catch { /* noop */ }
        // En cualquier otro caso el caller maneja la navegación de vuelta
    }, [createdProducts, step]);

    return {
        // Estado
        step,
        lines,
        catalogItems,
        header,
        supplierMatch,
        supplierId,
        detection,
        createdProducts,
        currentNewIndex,
        errorMessage,
        imagePreview,

        // Acciones
        handleImageSelected,
        handleCropConfirm,
        handleSupplierConfirm,
        handleSkipSupplier,
        handleStartCreating,
        handleProductResult,
        handleRetry,
        handleCancel,
        setStep,
    };
};
