// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_COMPRA_INVENTARIO") || "";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { imageBase64, mimeType, invoiceConfig } = await req.json();

        if (!imageBase64 || !mimeType) {
            return new Response(
                JSON.stringify({ error: "imageBase64 y mimeType son requeridos" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const config = invoiceConfig || {
            headerFields: [
                { key: "nit", label: "NIT", hint: "Número de identificación tributaria del proveedor" },
                { key: "supplierName", label: "Nombre Proveedor", hint: "Nombre o razón social del emisor" },
                { key: "invoiceNumber", label: "N° Factura", hint: "Número o código de la factura" },
                { key: "date", label: "Fecha", hint: "Fecha de emisión de la factura" },
            ],
            tableColumns: [
                { key: "description", label: "Descripción", hint: "Nombre del producto en la factura" },
                { key: "quantity", label: "Cant.", hint: "Cantidad de unidades compradas" },
                { key: "unitCost", label: "Precio Unit.", hint: "Precio por unidad del producto" },
                { key: "total", label: "Total Línea", hint: "Precio total de la línea" },
            ],
        };

        const headerSection = config.headerFields
            .map((f) => `- ${f.label} (clave: "${f.key}"): ${f.hint}`)
            .join("\n");

        const columnsSection = config.tableColumns
            .map((c) => `- ${c.label} (clave: "${c.key}"): ${c.hint}`)
            .join("\n");

        const headerProperties: Record<string, any> = {};
        const headerRequired: string[] = [];
        config.headerFields.forEach((f: any) => {
            headerProperties[f.key] = { type: "STRING", nullable: true };
            headerRequired.push(f.key);
        });

        const itemProperties: Record<string, any> = {};
        const itemRequired: string[] = [];
        config.tableColumns.forEach((c: any) => {
            if (c.key === "quantity" || c.key === "unitCost" || c.key === "total") {
                itemProperties[c.key] = { type: "NUMBER", nullable: true };
            } else {
                itemProperties[c.key] = { type: "STRING", nullable: true };
            }
            itemRequired.push(c.key);
        });
        itemProperties["ocr_unit"] = { type: "STRING", nullable: true };
        itemRequired.push("ocr_unit");

        const responseSchema = {
            type: "OBJECT",
            properties: {
                header: {
                    type: "OBJECT",
                    properties: headerProperties,
                    required: headerRequired
                },
                items: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: itemProperties,
                        required: itemRequired
                    }
                }
            }
        };

        const promptText = `Eres un experto en extracción de datos de facturas comerciales. Analiza la imagen de la factura y extrae la información indicada.\n\nDATOS DE CABECERA A EXTRAER:\n${headerSection}\n\nCOLUMNAS DE LA TABLA DE PRODUCTOS A EXTRAER (extrae TODAS las líneas de productos que aparezcan):\n${columnsSection}\n- Unidad (clave: "ocr_unit"): Extrae la palabra/abreviatura de la unidad de empaque referenciada en la factura (por ejemplo "Caja", "KI", "Atado", "Bulto", "Paca", "Und", "Unidad"). Revisa las descripciones de las columnas anteriores; si dicen que la unidad viene incluida en una columna específica (como cantidad o descripción), extráela de ahí y colócala en esta clave separando las letras del número. Si no encuentras unidad, devuelve un string vacío o la unidad que encuentres.\n\nINSTRUCCIONES IMPORTANTES:\n- Si un campo no aparece en la factura, usa null para texto y 0 para números.\n- FORMATO NUMÉRICO CRÍTICO: Esta factura usa formato LATINOAMERICANO donde el PUNTO (.) es separador de MILES y la COMA (,) es separador de DECIMALES. Ejemplos: "8.100" = ocho mil cien (8100), "0,44" = cero punto cuarenta y cuatro (0.44), "1.980" = mil novecientos ochenta (1980), "6.242" = seis mil doscientos cuarenta y dos (6242).\n- Para "quantity" y "unitCost" y "total" devuelve siempre un número (float) en formato AMERICANO (punto como decimal), sin símbolos de moneda, corrigiendo el formato latino antes de retornar.\n- Si la columna de precio unitario no existe pero sí el total y la cantidad, calcula el precio unitario dividiendo total/cantidad.\n- Extrae absolutamente todos los productos de la tabla, sin omitir ninguno.\n- El campo "description" debe ser el nombre del producto tal como aparece en la factura.`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

        const geminiBody = JSON.stringify({
            contents: [{
                parts: [
                    { text: promptText },
                    { inlineData: { mimeType: mimeType, data: imageBase64 } }
                ]
            }],
            generationConfig: {
                thinkingConfig: {
                    thinking_level: "low"
                },
                maxOutputTokens: 8192,
                responseMimeType: "application/json",
                responseSchema: responseSchema
            }
        });

        // Retry con exponential backoff para manejar 429 (rate limit) y 503 (server overload)
        let geminiResponse: Response | null = null;
        const MAX_RETRIES = 4;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            geminiResponse = await fetch(geminiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: geminiBody,
            });

            if (geminiResponse.ok) break;

            const status = geminiResponse.status;
            const isRetryable = status === 429 || status === 503 || status === 502;
            if (!isRetryable || attempt === MAX_RETRIES - 1) break;

            const delayMs = (2 ** attempt) * 1500 + Math.random() * 500;
            console.warn(`[scan-invoice] Gemini ${status} en intento ${attempt + 1}. Reintentando en ${Math.round(delayMs)}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        if (!geminiResponse || !geminiResponse.ok) {
            const errorText = await geminiResponse?.text() ?? "Sin respuesta";
            console.error("[scan-invoice] Gemini error tras reintentos:", errorText);
            return new Response(
                JSON.stringify({ error: "Error al procesar la imagen con IA", details: errorText }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const geminiData = await geminiResponse.json();

        // === COST LOGGING ===
        const usage = geminiData.usageMetadata;
        if (usage) {
            const inputTokens = usage.promptTokenCount || 0;
            const outputTokens = usage.candidatesTokenCount || 0;
            const thinkingTokens = usage.thoughtsTokenCount || 0;
            const totalTokens = usage.totalTokenCount || 0;
            // Gemini 3.1 Flash-Lite: $0.25/1M input, $1.50/1M output (thinking incluido en output)
            const inputCost = (inputTokens / 1_000_000) * 0.25;
            const outputCost = ((outputTokens + thinkingTokens) / 1_000_000) * 1.50;
            const totalCost = inputCost + outputCost;
            console.log(`[scan-invoice] 💰 COSTO: input=${inputTokens} tok ($${inputCost.toFixed(6)}) | output=${outputTokens} tok + thinking=${thinkingTokens} tok ($${outputCost.toFixed(6)}) | TOTAL: $${totalCost.toFixed(6)} USD | total_tokens=${totalTokens}`);
        }
        // === END COST LOGGING ===

        const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
        console.log("[scan-invoice] Raw Gemini Output:", content);

        let parsed;
        try {
            parsed = JSON.parse(content);
        } catch {
            return new Response(
                JSON.stringify({ header: {}, items: [], error: "No se pudo parsear el JSON de Gemini", rawContent: content }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        if (!Array.isArray(parsed.items)) parsed.items = [];
        if (!parsed.header || typeof parsed.header !== "object") parsed.header = {};

        console.log(`[scan-invoice] Extraídos ${parsed.items.length} productos.`);

        return new Response(
            JSON.stringify({ ...parsed, rawContent: content }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (err) {
        console.error("[scan-invoice] Error interno:", err);
        return new Response(
            JSON.stringify({ error: "Error interno del servidor" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
