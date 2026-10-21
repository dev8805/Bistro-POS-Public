// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Lee la clave de API desde los secrets configurados en Supabase
const GEMINI_API_KEY =
    Deno.env.get("GEMINI_API_SCAN_V2") ||
    Deno.env.get("GEMINI_API_COMPRA_INVENTARIO") ||
    Deno.env.get("GEMINI_API_KEY") ||
    "";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { imageBase64, mimeType } = await req.json();

        if (!imageBase64 || !mimeType) {
            return new Response(
                JSON.stringify({ error: "imageBase64 y mimeType son requeridos" }),
                { status: 400, headers: jsonHeaders }
            );
        }

        if (!GEMINI_API_KEY) {
            console.error("[scan-invoice-v2] GEMINI_API_SCAN_V2 o GEMINI_API_COMPRA_INVENTARIO no está configurada.");
            return new Response(
                JSON.stringify({ error: "Falta el secret GEMINI_API_SCAN_V2 en Supabase Edge Functions." }),
                { status: 500, headers: jsonHeaders }
            );
        }

        // Esquema estructurado y limpio: solo visión y datos fiscales por renglón
        const responseSchema = {
            type: "OBJECT",
            properties: {
                header: {
                    type: "OBJECT",
                    properties: {
                        supplierName: { type: "STRING", nullable: true },
                        nit: { type: "STRING", nullable: true },
                        phone: { type: "STRING", nullable: true },
                        invoiceNumber: { type: "STRING", nullable: true },
                        date: { type: "STRING", nullable: true },
                    },
                    required: ["supplierName", "nit", "phone", "invoiceNumber", "date"],
                },
                items: {
                    type: "ARRAY",
                    items: {
                        type: "OBJECT",
                        properties: {
                            description: { type: "STRING", nullable: true },
                            quantity: { type: "NUMBER", nullable: true },
                            ocr_unit: { type: "STRING", nullable: true },
                            unitValue: { type: "NUMBER", nullable: true },
                            lineSubtotal: { type: "NUMBER", nullable: true },
                            lineTax: { type: "NUMBER", nullable: true },
                            lineDiscount: { type: "NUMBER", nullable: true },
                            lineNetTotal: { type: "NUMBER", nullable: true },
                            barcode: { type: "STRING", nullable: true },
                            conversion_factor: { type: "NUMBER", nullable: true },
                            reasoning: { type: "STRING", nullable: true },
                        },
                        required: [
                            "description",
                            "quantity",
                            "ocr_unit",
                            "unitValue",
                            "lineSubtotal",
                            "lineTax",
                            "lineDiscount",
                            "lineNetTotal",
                            "barcode",
                            "conversion_factor",
                            "reasoning",
                        ],
                    },
                },
            },
            required: ["header", "items"],
        };

        const promptText = `Eres un transcriptor y liquidador experto en FACTURAS COMERCIALES colombianas. Tu trabajo es leer la imagen física y transcribir con máxima precisión matemática lo que ves en las columnas de la tabla de productos y el encabezado.

DATOS DE CABECERA ("header"):
- "supplierName": nombre o razón social del emisor en el encabezado. null si no aparece.
- "nit": NIT o identificación tributaria tal como está escrita. null si no aparece.
- "phone": teléfono del proveedor si aparece. null si no se ve.
- "invoiceNumber": número o código de factura. null si no se ve.
- "date": fecha de emisión en formato "YYYY-MM-DD". null si no se ve.

LÍNEAS DE PRODUCTO ("items") - Extrae todos los renglones de producto (sin incluir fletes, retenciones ni notas al pie):
- "description": transcripción literal exacta del nombre del producto y presentación tal como está escrito.
- "quantity": cantidad facturada del renglón (columna "Cant" / "Cantidad").
- "ocr_unit": unidad o empaque leído ("CJ", "CAJA", "PACA", "DISPLAY", "BOT", "UND", "KG", etc.). Si no viene unidad, string vacío "".
- "unitValue": valor unitario del renglón. Si no viene explícito, calcula: subtotal / cantidad.
- "lineSubtotal": subtotal del renglón antes de impuestos y descuentos de la línea.
- "lineTax": suma total de TODOS los impuestos de ese renglón. En Colombia las facturas pueden desglosar impuestos en columnas separadas ("VLR.IVA", "IVA", "VLR. IC Y/O OTROS", "IMPOCONSUMO", "IBUA", etc.). Si hay varios impuestos o más de un valor en esas columnas, DEBES sumarlos todos en este campo. 0 si no tiene.
- "lineDiscount": valor del descuento comercial DE ESE RENGLÓN. 0 si no tiene.
- "lineNetTotal": valor total a pagar por el renglón. Busca la columna que contenga el valor total de la línea (puede llamarse "VLR.TOTAL", "TOTAL", "VALOR TOTAL", "IMPORTE", "TOTAL RENGLÓN", "NETO", etc.) y transcribe ese valor exacto. Si la factura NO trae columna con el total de la línea, calcúlalo como: lineSubtotal + lineTax - lineDiscount.
- "barcode": código de barras numérico (EAN-13, EAN-8, UPC: secuencia de 8 a 14 dígitos) si está impreso en la factura. null si no aparece.

REGLA DE RATIFICACIÓN MATEMÁTICA DE LA LÍNEA:
Cuando encuentres el valor total de la línea en la factura ("lineNetTotal"):
1. RATIFICA OBLIGATORIAMENTE que el cálculo dinámico dé exactamente ese total:
   (lineSubtotal + lineTax - lineDiscount) DEBE SER IGUAL A lineNetTotal.
2. Si el cálculo dinámico da menos que "lineNetTotal", verifica qué impuesto omitiste sumar (ej: IVA + IC/Impoconsumo + IBUA/bebidas azucaradas + otros impuestos) y súmalo a "lineTax" para que la ecuación dinámica cierre de forma idéntica al total de la línea.
3. Si la factura NO trae columna con el total de la línea, calcúlalo dinámicamente: lineSubtotal + lineTax - lineDiscount.

REGLA UNIVERSAL DE EMPAQUES COLOMBIANOS ("conversion_factor" y "reasoning"):
Deduce si la línea fue cobrada por empaque cerrado o por unidades sueltas analizando la columna de unidad ("Unidad de Medida"), la columna "Cant por unidades" (si existe) y comparando matemáticamente:
1. FACTURACIÓN POR EMPAQUE COMPLETO (Mayorista):
   - Si la columna de unidad indica empaque ("CJ", "CAJA", "PACA", "DISPLAY", "SIXPACK", "BULTO") Y el valor unitario corresponde a la caja entera:
   - "conversion_factor": número de unidades que contiene el empaque (ej: si el nombre o la columna de unidades dice "(12)", "X24", "(30)", devuelve 12, 24 o 30).
   - "reasoning": explicación ultra concisa (máximo 5 palabras, ej: "Caja x12").
2. FACTURACIÓN EN UNIDADES SUELTAS / DETAL:
   - Si la columna de unidad indica unidad individual ("BOT", "UND", "UN", "LATA", "VASO", "PIEZA"), O si la columna "Cant por unidades" es igual a la cantidad facturada (ej: 15 botellas a $1.751 cada una):
   - NUNCA multipliques aunque el nombre traiga un número como "(30)" o "(24)" (ese número describe el tipo de botella o canasta retornable, no que hayas comprado 30 cajas).
   - "conversion_factor": 1.
   - "reasoning": explicación ultra concisa (máximo 5 palabras, ej: "Unidad suelta factor 1").

REGLAS NUMÉRICAS:
- Formato latino: El punto (.) es separador de miles y la coma (,) es separador de decimales. Devuelve números limpios (float con punto decimal).
- Extrae todas las filas de producto sin omitir ninguna.`;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

        const geminiBody = JSON.stringify({
            contents: [{
                parts: [
                    { text: promptText },
                    { inlineData: { mimeType: mimeType, data: imageBase64 } },
                ],
            }],
            generationConfig: {
                thinkingConfig: {
                    thinking_level: "low",
                },
                maxOutputTokens: 8192,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });

        // Reintentos con backoff exponencial para 429, 503 y 502
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
            console.warn(`[scan-invoice-v2] Gemini ${status} en intento ${attempt + 1}. Reintentando en ${Math.round(delayMs)}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        if (!geminiResponse || !geminiResponse.ok) {
            const errorText = await geminiResponse?.text() ?? "Sin respuesta";
            console.error("[scan-invoice-v2] Error de Gemini tras reintentos:", errorText);
            return new Response(
                JSON.stringify({ error: "Error al procesar la imagen con IA", details: errorText }),
                { status: 200, headers: jsonHeaders }
            );
        }

        const geminiData = await geminiResponse.json();

        // Registro de costo transparente
        const usage = geminiData.usageMetadata;
        if (usage) {
            const inputTokens = usage.promptTokenCount || 0;
            const outputTokens = usage.candidatesTokenCount || 0;
            const inputCost = (inputTokens / 1_000_000) * 0.25;
            const outputCost = (outputTokens / 1_000_000) * 1.50;
            const totalCost = inputCost + outputCost;
            console.log(`[scan-invoice-v2] 💰 COSTO: input=${inputTokens} ($${inputCost.toFixed(6)}) | output=${outputTokens} ($${outputCost.toFixed(6)}) | TOTAL: $${totalCost.toFixed(6)} USD`);
        }

        const candidate = geminiData.candidates?.[0];
        const finishReason = candidate?.finishReason;
        const content = candidate?.content?.parts?.[0]?.text || "";

        if (finishReason === "MAX_TOKENS") {
            console.warn(`[scan-invoice-v2] ⚠️ Se alcanzó MAX_TOKENS. Longitud de respuesta: ${content.length}`);
        }

        let parsed;
        try {
            parsed = JSON.parse(content);
        } catch {
            console.error(`[scan-invoice-v2] Error al parsear JSON de Gemini (finishReason: ${finishReason})`);
            return new Response(
                JSON.stringify({ error: "No se pudo interpretar el formato de la factura", rawContent: content, finishReason }),
                { status: 200, headers: jsonHeaders }
            );
        }

        const header = parsed.header && typeof parsed.header === "object" ? parsed.header : {};
        const items = Array.isArray(parsed.items) ? parsed.items : [];

        console.log(`[scan-invoice-v2] Extraídas ${items.length} líneas de producto con éxito.`);

        return new Response(
            JSON.stringify({ header, items }),
            { status: 200, headers: jsonHeaders }
        );
    } catch (err) {
        console.error("[scan-invoice-v2] Error interno:", err);
        return new Response(
            JSON.stringify({ error: "Error interno del servidor" }),
            { status: 500, headers: jsonHeaders }
        );
    }
});
