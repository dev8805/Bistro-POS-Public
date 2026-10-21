/**
 * hooks/useInvoiceScanV2.ts
 *
 * Hook independiente para el Escaneo de Facturas v2:
 * 1. Invoca `scan-invoice-v2` (Visión pura con Gemini Flash-Lite sin catálogo ni pie de página).
 * 2. Invoca `match-products-v2` (Embeddings semánticos + Guardián de Medidas en Supabase).
 * 3. Aplica `calculateLineCostV2` (Costo neto estricto por línea: subtotal + tax - discount).
 *
 * No toca ni modifica el hook existente `useInvoiceScanDraft.ts`.
 */

import { useState, useCallback } from 'react';
import { invokeEdgeFunction } from '../utils/invokeEdgeFunction';
import { calculateLineCostV2, type CalculatedLineCostV2, type RawLineItemV2 } from '../lib/invoiceScan/lineCostCalculator';

export interface ScanLineV2 extends CalculatedLineCostV2 {
    id: string;
    description: string;
    barcode: string | null;
    matchedProductId: string | null;
    matchedProductName: string | null;
    isAutoMatched: boolean;
    isDifferentSize: boolean;
    sizeAlert?: string;
    candidates: Array<{ productId: string; productName: string; similarity: number }>;
}

export interface ScanResultV2 {
    header: {
        supplierName: string | null;
        nit: string | null;
        phone: string | null;
        invoiceNumber: string | null;
        date: string | null;
    };
    lines: ScanLineV2[];
}

export const useInvoiceScanV2 = () => {
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<ScanResultV2 | null>(null);

    const scanInvoice = useCallback(async (
        imageBase64: string,
        mimeType: string,
        businessId: string,
    ): Promise<ScanResultV2 | null> => {
        setIsScanning(true);
        setError(null);

        try {
            // PASO 1: Visión pura con Gemini Flash-Lite (sin catálogo en la entrada)
            const { data: visionData, error: visionError } = await invokeEdgeFunction<{
                header: any;
                items: RawLineItemV2[];
            }>('scan-invoice-v2', {
                imageBase64,
                mimeType,
            }, { timeoutMs: 45000 });

            if (visionError || !visionData) {
                throw new Error(visionError || 'No se pudo procesar la imagen de la factura.');
            }

            const rawItems = Array.isArray(visionData.items) ? visionData.items : [];

            // PASO 2: Emparejamiento semántico con Embeddings y Guardián de Medidas
            let matchResults: any[] = [];
            if (rawItems.length > 0 && businessId) {
                const { data: matchData } = await invokeEdgeFunction<{
                    results: any[];
                }>('match-products-v2', {
                    businessId,
                    items: rawItems.map((item, idx) => ({
                        index: idx,
                        description: item.description,
                        barcode: item.barcode || null,
                    })),
                }, { timeoutMs: 30000 });

                if (matchData && Array.isArray(matchData.results)) {
                    matchResults = matchData.results;
                }
            }

            // PASO 3: Cálculo determinista de costo por línea y ensamble
            const processedLines: ScanLineV2[] = rawItems.map((item, idx) => {
                const matchInfo = matchResults[idx] || {};
                const costData = calculateLineCostV2(item);

                return {
                    id: `line-v2-${idx}-${Date.now()}`,
                    description: item.description,
                    barcode: item.barcode || null,
                    matchedProductId: matchInfo.matchedProductId || null,
                    matchedProductName: matchInfo.matchedProductName || null,
                    isAutoMatched: matchInfo.isAutoMatched === true,
                    isDifferentSize: matchInfo.isDifferentSize === true,
                    sizeAlert: matchInfo.sizeAlert,
                    candidates: Array.isArray(matchInfo.candidates) ? matchInfo.candidates : [],
                    ...costData,
                };
            });

            const scanResult: ScanResultV2 = {
                header: {
                    supplierName: visionData.header?.supplierName || null,
                    nit: visionData.header?.nit || null,
                    phone: visionData.header?.phone || null,
                    invoiceNumber: visionData.header?.invoiceNumber || null,
                    date: visionData.header?.date || null,
                },
                lines: processedLines,
            };

            setResult(scanResult);
            return scanResult;
        } catch (err: any) {
            const msg = err?.message || 'Error inesperado durante el escaneo v2.';
            setError(msg);
            return null;
        } finally {
            setIsScanning(false);
        }
    }, []);

    return {
        isScanning,
        error,
        result,
        scanInvoice,
        resetScan: () => {
            setResult(null);
            setError(null);
        },
    };
};
