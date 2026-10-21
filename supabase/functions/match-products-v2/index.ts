// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_API_KEY =
    Deno.env.get("GEMINI_API_SCAN_V2") ||
    Deno.env.get("GEMINI_API_COMPRA_INVENTARIO") ||
    Deno.env.get("GEMINI_API_KEY") ||
    Deno.env.get("GEMINI_API_ASISTENTE") ||
    "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

// ============================================================================
// GUARDIÁN DE MEDIDAS (Código 100% determinista, costo $0 tokens)
// ============================================================================

interface ExtractedMeasurement {
    raw: string;
    normalizedValue: number; // en ml o en g
    type: "volume" | "mass";
}

/**
 * Extrae la medida de contenido individual (volumen o masa) de un nombre.
 * Ejemplos: "400ml" -> 400ml, "1.5L" -> 1500ml, "500g" -> 500g, "1kg" -> 1000g.
 */
function extractMeasurement(text: string): ExtractedMeasurement | null {
    if (!text) return null;

    // Volumen: ml, l, lt, lts, cc
    const volMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*(ml|cc|l|lt|lts|litro|litros)\b/i);
    if (volMatch) {
        const num = parseFloat(volMatch[1].replace(",", "."));
        const unit = volMatch[2].toLowerCase();
        let normalized = num;
        if (unit.startsWith("l") || unit.startsWith("lit")) {
            normalized = num * 1000; // a mililitros
        }
        return { raw: volMatch[0], normalizedValue: Math.round(normalized), type: "volume" };
    }

    // Masa / Peso: g, gr, grs, gramo, gramos, kg, kilo, kilos, lb, libra
    const massMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*(g|gr|grs|gramos?|kg|kilos?|lb|libras?)\b/i);
    if (massMatch) {
        const num = parseFloat(massMatch[1].replace(",", "."));
        const unit = massMatch[2].toLowerCase();
        let normalized = num;
        if (unit.startsWith("kg") || unit.startsWith("kilo")) {
            normalized = num * 1000; // a gramos
        } else if (unit.startsWith("lb") || unit.startsWith("libra")) {
            normalized = num * 500; // 1 libra colombiana = 500g
        }
        return { raw: massMatch[0], normalizedValue: Math.round(normalized), type: "mass" };
    }

    return null;
}

/**
 * Comprueba si dos textos tienen medidas compatibles.
 * Si ambos tienen medida y difieren (ej: 400ml vs 600ml), retorna false.
 */
function isMeasurementCompatible(ocrText: string, catalogText: string): { compatible: boolean; reason?: string } {
    const ocrMeasure = extractMeasurement(ocrText);
    const catMeasure = extractMeasurement(catalogText);

    // Si alguno de los dos no especifica medida, no hay conflicto evidente
    if (!ocrMeasure || !catMeasure) {
        return { compatible: true };
    }

    // Si uno es volumen y otro es masa (ej: ml vs kg), son incompatibles
    if (ocrMeasure.type !== catMeasure.type) {
        return {
            compatible: false,
            reason: `Conflicto de tipo: ${ocrMeasure.raw} vs ${catMeasure.raw}`,
        };
    }

    // Si ambos son del mismo tipo, sus valores normalizados deben ser casi iguales (margen del 5%)
    const diff = Math.abs(ocrMeasure.normalizedValue - catMeasure.normalizedValue);
    const tolerance = Math.max(ocrMeasure.normalizedValue, catMeasure.normalizedValue) * 0.05;

    if (diff > tolerance) {
        return {
            compatible: false,
            reason: `Presentación diferente: Factura tiene ${ocrMeasure.raw} pero catálogo tiene ${catMeasure.raw}`,
        };
    }

    return { compatible: true };
}

// ============================================================================
// SERVICIO DE EMBEDDINGS (Google Gemini gemini-embedding-2)
// ============================================================================

async function fetchEmbedding(text: string): Promise<number[]> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "models/gemini-embedding-2",
            content: { parts: [{ text }] },
        }),
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Error generando embedding: ${errorText}`);
    }

    const data = await res.json();
    return data.embedding?.values || [];
}

// ============================================================================
// EDGE FUNCTION PRINCIPAL
// ============================================================================

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const payload = await req.json();
        const { action, items, businessId } = payload;

        if (!businessId) {
            return new Response(
                JSON.stringify({ error: "businessId es requerido" }),
                { status: 400, headers: jsonHeaders }
            );
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // ACCIÓN 1: Sincronizar catálogo inicial del negocio (calcula coordenadas que falten)
        if (action === "sync_catalog") {
            const { data: products, error: prodErr } = await supabase
                .from("products")
                .select("id, name, unit, barcode, nicknames")
                .eq("business_id", businessId)
                .eq("type", "simple");

            if (prodErr || !products) {
                return new Response(
                    JSON.stringify({ error: "Error leyendo productos", details: prodErr }),
                    { status: 500, headers: jsonHeaders }
                );
            }

            // Ver qué productos ya tienen embedding
            const { data: existing } = await supabase
                .from("product_embeddings")
                .select("product_id")
                .eq("business_id", businessId);

            const existingIds = new Set((existing || []).map((e: any) => e.product_id));
            const pending = products.filter((p: any) => !existingIds.has(p.id));

            let indexedCount = 0;
            for (const p of pending) {
                try {
                    const nicks = Array.isArray(p.nicknames) ? p.nicknames.join(" ") : "";
                    const textToEmbed = `${p.name} ${p.unit || ""} ${nicks}`.trim();
                    const embedding = await fetchEmbedding(textToEmbed);

                    await supabase.from("product_embeddings").upsert({
                        product_id: p.id,
                        business_id: businessId,
                        embedding,
                        text_hash: textToEmbed,
                        updated_at: new Date().toISOString(),
                    });
                    indexedCount++;
                } catch (err) {
                    console.warn(`[match-products-v2] Error indexando producto ${p.id}:`, err);
                }
            }

            return new Response(
                JSON.stringify({
                    message: "Catálogo sincronizado con éxito",
                    totalProducts: products.length,
                    indexedCount,
                }),
                { status: 200, headers: jsonHeaders }
            );
        }

        // ACCIÓN 2: Emparejamiento semántico de líneas de factura
        if (!Array.isArray(items) || items.length === 0) {
            return new Response(
                JSON.stringify({ error: "items debe ser un arreglo de líneas de factura" }),
                { status: 400, headers: jsonHeaders }
            );
        }

        const results = [];

        for (const item of items) {
            const ocrDescription = (item.description || "").trim();
            const ocrBarcode = (item.barcode || "").trim();

            // 1. Paso rápido: Si trae código de barras, buscar match exacto en la BD
            if (ocrBarcode.length >= 6) {
                const { data: barcodeMatches } = await supabase
                    .from("products")
                    .select("id, name, unit, barcode")
                    .eq("business_id", businessId)
                    .eq("barcode", ocrBarcode)
                    .limit(1);

                if (barcodeMatches && barcodeMatches.length > 0) {
                    const matched = barcodeMatches[0];
                    results.push({
                        ocrDescription,
                        matchedProductId: matched.id,
                        matchedProductName: matched.name,
                        matchMethod: "barcode",
                        similarity: 1.0,
                        isAutoMatched: true,
                        isDifferentSize: false,
                        candidates: [],
                    });
                    continue;
                }
            }

            if (!ocrDescription) {
                results.push({
                    ocrDescription,
                    matchedProductId: null,
                    matchedProductName: null,
                    matchMethod: "none",
                    similarity: 0,
                    isAutoMatched: false,
                    isDifferentSize: false,
                    candidates: [],
                });
                continue;
            }

            // 2. Paso Semántico: Generar embedding del texto de la factura
            let queryEmbedding: number[] = [];
            try {
                queryEmbedding = await fetchEmbedding(ocrDescription);
            } catch (embedErr) {
                console.warn(`[match-products-v2] Error generando embedding para "${ocrDescription}":`, embedErr);
            }

            if (queryEmbedding.length === 0) {
                results.push({
                    ocrDescription,
                    matchedProductId: null,
                    matchedProductName: null,
                    matchMethod: "embedding_failed",
                    similarity: 0,
                    isAutoMatched: false,
                    isDifferentSize: false,
                    candidates: [],
                });
                continue;
            }

            // 3. Buscar los 3 candidatos más parecidos en PostgreSQL (RPC)
            const { data: candidates, error: rpcErr } = await supabase.rpc("match_products_semantic", {
                query_embedding: queryEmbedding,
                target_business_id: businessId,
                match_threshold: 0.60,
                match_count: 3,
            });

            if (rpcErr || !candidates || candidates.length === 0) {
                results.push({
                    ocrDescription,
                    matchedProductId: null,
                    matchedProductName: null,
                    matchMethod: "semantic_none",
                    similarity: 0,
                    isAutoMatched: false,
                    isNewProduct: true,
                    isDifferentSize: false,
                    candidates: [],
                });
                continue;
            }

            const topCandidate = candidates[0];
            const topSimilarity = topCandidate.similarity;

            // 4. APLICAR EL GUARDIÁN DE MEDIDAS (Código determinista)
            const measureCheck = isMeasurementCompatible(ocrDescription, topCandidate.product_name);

            if (!measureCheck.compatible) {
                // ¡Alerta! El texto se parece semánticamente pero el tamaño/gramaje es distinto
                results.push({
                    ocrDescription,
                    matchedProductId: null,
                    matchedProductName: null,
                    matchMethod: "different_size_blocked",
                    similarity: topSimilarity,
                    isAutoMatched: false,
                    isDifferentSize: true,
                    sizeAlert: measureCheck.reason,
                    candidates: candidates.map((c: any) => ({
                        productId: c.product_id,
                        productName: c.product_name,
                        similarity: c.similarity,
                    })),
                });
                continue;
            }

            // 5. Si la medida es compatible y la similitud es alta (>= 0.82), match automático
            if (topSimilarity >= 0.82) {
                results.push({
                    ocrDescription,
                    matchedProductId: topCandidate.product_id,
                    matchedProductName: topCandidate.product_name,
                    matchMethod: "semantic_auto",
                    similarity: topSimilarity,
                    isAutoMatched: true,
                    isDifferentSize: false,
                    candidates: candidates.map((c: any) => ({
                        productId: c.product_id,
                        productName: c.product_name,
                        similarity: c.similarity,
                    })),
                });
            } else {
                // Similitud intermedia (0.60 - 0.81): sugerir opciones sin forzar auto-match
                results.push({
                    ocrDescription,
                    matchedProductId: null,
                    matchedProductName: null,
                    matchMethod: "semantic_review",
                    similarity: topSimilarity,
                    isAutoMatched: false,
                    isDifferentSize: false,
                    candidates: candidates.map((c: any) => ({
                        productId: c.product_id,
                        productName: c.product_name,
                        similarity: c.similarity,
                    })),
                });
            }
        }

        return new Response(
            JSON.stringify({ results }),
            { status: 200, headers: jsonHeaders }
        );
    } catch (err) {
        console.error("[match-products-v2] Error interno:", err);
        return new Response(
            JSON.stringify({ error: "Error interno del servidor", details: String(err) }),
            { status: 500, headers: jsonHeaders }
        );
    }
});
