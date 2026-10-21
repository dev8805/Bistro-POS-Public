import { useState } from 'react';
import { Product } from '../types';
import { invokeEdgeFunction } from '../utils/invokeEdgeFunction';

export interface RawOCRItem {
    name: string;
    quantity: number;
    scanOrder: number;
    productId?: string | null;
    candidateIds?: string[];
    rawText?: string;
    discount?: number;
    discountPercent?: number;
    reasoning?: string;
}

export interface MatchedItem {
    ocrName: string;
    product: Product;
    quantity: number;
    confidence: 'exact' | 'partial';
    selected: boolean;
    scanOrder: number;
    isManual?: boolean;
    discount?: number;
    discountPercent?: number;
    reasoning?: string;
}

export interface PhotoOrderResult {
    matched: MatchedItem[];
    unmatched: RawOCRItem[];
}

export const usePhotoOrder = () => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const processImage = async (
        imageBase64: string,
        mimeType: string,
        catalog?: { id: string; name: string; unit?: string; nicknames?: string[] }[]
    ): Promise<RawOCRItem[]> => {
        setIsProcessing(true);
        setError(null);

        try {
            const { data, error } = await invokeEdgeFunction<{ items: any[] }>(
                'ocr-scan',
                { imageBase64, mimeType, catalog }
            );

            if (error) {
                setError(error);
                return [];
            }

            if (import.meta.env.DEV || (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))) {
                console.group('🔍 [PhotoOrder OCR Debug - Local]');
                (data?.items || []).forEach((item: any, idx: number) => {
                    console.log(
                        `#${idx + 1}: "${item.name}" (Cant: ${item.quantity})\n` +
                        `  ↳ ID Catálogo: ${item.product_id || 'null'}\n` +
                        `  ↳ Candidatos: ${JSON.stringify(item.candidate_ids || [])}\n` +
                        `  ↳ Razonamiento: ${item.reasoning || 'Sin justificación'}`
                    );
                });
                console.groupEnd();
            }

            return (data?.items || []).map((item: any, idx: number) => {
                let parsedQty = 1;
                if (typeof item.quantity === 'number' && !isNaN(item.quantity)) {
                    parsedQty = item.quantity;
                } else if (typeof item.quantity === 'string') {
                    if (item.quantity.includes('/')) {
                        const [n, d] = item.quantity.split('/').map(Number);
                        if (n && d) parsedQty = Math.round((n / d) * 100) / 100;
                    } else {
                        const p = parseFloat(item.quantity.replace(',', '.'));
                        if (!isNaN(p) && p > 0) parsedQty = p;
                    }
                }
                return {
                    name: item.name || '',
                    quantity: parsedQty,
                    scanOrder: idx,
                    productId: item.product_id || item.productId || null,
                    candidateIds: Array.isArray(item.candidate_ids) ? item.candidate_ids : (Array.isArray(item.candidateIds) ? item.candidateIds : []),
                    rawText: item.raw_text || item.rawText || item.name || '',
                    discount: item.discount,
                    discountPercent: item.discountPercent,
                    reasoning: item.reasoning || ''
                };
            });
        } finally {
            setIsProcessing(false);
        }
    };

    const matchProducts = (rawItems: RawOCRItem[], products: Product[], startOrder = 0): PhotoOrderResult => {
        const matched: MatchedItem[] = [];
        const unmatched: RawOCRItem[] = [];

        for (let i = 0; i < rawItems.length; i++) {
            const item = rawItems[i];
            const order = startOrder + i;
            const ocrLower = (item.name || '').toLowerCase().trim();
            const rawLower = (item.rawText || item.name || '').toLowerCase().trim();
            let bestMatch: { product: Product; confidence: 'exact' | 'partial' } | null = null;
            let finalQuantity = item.quantity;

            // Detección de términos genéricos / ambiguos (ej: "luki", "choco", "poker", "arroz")
            const queryCandidate = (ocrLower.length >= 2 && ocrLower.length <= rawLower.length) ? ocrLower : rawLower;
            const cleanCandidate = queryCandidate.replace(/^\d+([.,]\d+)?\s*(x|und|unidades|de)?\s*/i, '').trim();

            const distinctMatches = cleanCandidate.length >= 2 ? products.filter(p => {
                const pName = p.name.toLowerCase();
                const nicks = (p.nicknames || []).map((n: string) => n.toLowerCase());
                return pName.includes(cleanCandidate) || nicks.some((n: string) => n.includes(cleanCandidate));
            }) : [];

            const distinctBaseIds = new Set(
                distinctMatches.map(p => (p as any).parent_product_id || p.id)
            );

            const hasExactFullNameMatch = distinctMatches.some(p => p.name.toLowerCase().trim() === cleanCandidate);
            const hasMultipleAiCandidates = Array.isArray(item.candidateIds) && item.candidateIds.length > 1;
            const isAmbiguousTerm = hasMultipleAiCandidates || (cleanCandidate.length >= 2 && distinctBaseIds.size > 1 && !hasExactFullNameMatch);

            // 1. Si la IA reconoció y emparejó directamente con un ID del catálogo (solo si no es un término ambiguo)
            if (item.productId && !isAmbiguousTerm) {
                const directProd = products.find(p => p.id === item.productId);
                if (directProd) {
                    bestMatch = { product: directProd, confidence: 'exact' };
                }
            }

            // 2. Coincidencia exacta por apodos (tanto en ocrName como en rawText)
            if (!bestMatch && !isAmbiguousTerm) {
                for (const product of products) {
                    const nicknames: string[] = product.nicknames || [];
                    const exactNickname = nicknames.some(n => {
                        const nLow = n.toLowerCase().trim();
                        return nLow === ocrLower || nLow === rawLower;
                    });
                    if (exactNickname) {
                        bestMatch = { product, confidence: 'exact' };
                        break;
                    }
                }
            }

            // 3. Coincidencia parcial por apodos
            if (!bestMatch && !isAmbiguousTerm) {
                const partialNicknameMatches: Product[] = [];
                for (const product of products) {
                    const nicknames: string[] = product.nicknames || [];
                    const partialNickname = nicknames.some(n => {
                        const nLow = n.toLowerCase().trim();
                        return nLow.includes(ocrLower) || ocrLower.includes(nLow) ||
                               nLow.includes(rawLower) || rawLower.includes(nLow);
                    });
                    if (partialNickname) {
                        partialNicknameMatches.push(product);
                    }
                }
                if (partialNicknameMatches.length === 1) {
                    bestMatch = { product: partialNicknameMatches[0], confidence: 'partial' };
                }
            }

            // 4. Coincidencia exacta por nombre de producto
            if (!bestMatch && !isAmbiguousTerm) {
                for (const product of products) {
                    const pNameLow = product.name.toLowerCase().trim();
                    if (pNameLow === ocrLower || pNameLow === rawLower) {
                        bestMatch = { product, confidence: 'exact' };
                        break;
                    }
                }
            }

            // 5. Coincidencia parcial por nombre de producto
            if (!bestMatch && !isAmbiguousTerm) {
                const partialNameMatches: Product[] = [];
                for (const product of products) {
                    const pNameLow = product.name.toLowerCase().trim();
                    if (pNameLow.includes(ocrLower) || ocrLower.includes(pNameLow) ||
                        pNameLow.includes(rawLower) || rawLower.includes(pNameLow)) {
                        partialNameMatches.push(product);
                    }
                }
                if (partialNameMatches.length === 1) {
                    bestMatch = { product: partialNameMatches[0], confidence: 'partial' };
                }
            }

            // 6. Salvaguarda para unidades discretas e indivisibles ('Unidad' / 'Und')
            // Si la cantidad vino fraccionada pero el producto no es divisible por peso:
            const isDiscreteUnit = !bestMatch?.product.unit ||
                bestMatch.product.unit === 'Unidad' ||
                bestMatch.product.unit === 'Und';

            if (bestMatch && isDiscreteUnit && finalQuantity > 0 && finalQuantity < 1) {
                const parentId = (bestMatch.product as any).parent_product_id || bestMatch.product.id;
                const relatedPresentations = products.filter(p =>
                    (p as any).is_secondary && (p as any).parent_product_id === parentId
                );

                const isHalf = Math.abs(finalQuantity - 0.5) < 0.05 || rawLower.includes('medio') || rawLower.includes('media');
                const isQuarter = Math.abs(finalQuantity - 0.25) < 0.05 || rawLower.includes('cuarto');

                let targetPres: Product | undefined;
                if (isHalf) {
                    targetPres = relatedPresentations.find(p =>
                        p.name.toLowerCase().includes('medio') ||
                        p.name.toLowerCase().includes('media') ||
                        (p.nicknames || []).some(n => n.toLowerCase().includes('medio') || n.toLowerCase().includes('media'))
                    );
                } else if (isQuarter) {
                    targetPres = relatedPresentations.find(p =>
                        p.name.toLowerCase().includes('cuarto') ||
                        (p.nicknames || []).some(n => n.toLowerCase().includes('cuarto'))
                    );
                }

                if (targetPres) {
                    bestMatch = { product: targetPres, confidence: 'exact' };
                    finalQuantity = 1;
                } else {
                    finalQuantity = 1;
                }
            }

            if (bestMatch) {
                matched.push({
                    ocrName: item.rawText || item.name,
                    product: bestMatch.product,
                    quantity: finalQuantity,
                    confidence: bestMatch.confidence,
                    selected: true,
                    scanOrder: order,
                    reasoning: item.reasoning
                });
            } else {
                unmatched.push({ ...item, scanOrder: order });
            }
        }

        return { matched, unmatched };
    };

    return { isProcessing, error, processImage, matchProducts, setError };
};
