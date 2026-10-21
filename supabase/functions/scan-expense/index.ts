// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_GASTO") || "";

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
        const { imageBase64, mimeType, suppliers } = await req.json();

        // Req 12.7: imagen obligatoria, sin invocar a Gemini
        if (!imageBase64 || !mimeType) {
            return new Response(
                JSON.stringify({ error: "La imagen es obligatoria" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supplierList: { name: string; nit: string }[] = Array.isArray(suppliers)
            ? suppliers.filter((s) => s && typeof s.name === "string").map((s) => ({ name: s.name, nit: s.nit || "" }))
            : [];

        const suppliersText = supplierList.length > 0
            ? supplierList.map((s) => `- ${s.name}${s.nit ? ` (NIT: ${s.nit})` : ""}`).join("\n")
            : "(el negocio no tiene proveedores registrados)";

        const responseSchema = {
            type: "OBJECT",
            properties: {
                amount: { type: "NUMBER", nullable: true },
                description: { type: "STRING", nullable: true },
                category: { type: "STRING", nullable: true },
                supplierName: { type: "STRING", nullable: true },
                nit: { type: "STRING", nullable: true },
                date: { type: "STRING", nullable: true },
            },
            required: ["amount", "description", "category", "supplierName", "nit", "date"],
        };

        const promptText = `Eres un experto en lectura de recibos y facturas de GASTOS de negocios colombianos (tiendas, minimercados). Analiza la imagen del comprobante y extrae los siguientes datos.

DATOS A EXTRAER:
1. "amount": El TOTAL A PAGAR del comprobante (el valor final, no subtotales ni líneas individuales). FORMATO NUMÉRICO CRÍTICO: el comprobante usa formato LATINOAMERICANO donde el PUNTO (.) es separador de MILES y la COMA (,) es separador de DECIMALES. Ejemplos: "15.000" = quince mil (15000), "1.250,50" = mil doscientos cincuenta con cincuenta (1250.50), "85.000" = ochenta y cinco mil (85000). Devuelve siempre un número (float) en formato AMERICANO (punto como decimal), sin símbolos de moneda. Debe ser un número mayor que 0.

2. "description": El detalle del gasto en UNA sola línea. Regla base: captura lo ÚTIL, no todo el texto de la factura. Clasifica el gasto en una de estas DOS familias y arma la descripción según corresponda:

   FAMILIA A — Gasto recurrente o de servicio (arriendo, servicios públicos, sueldos, aportes, honorarios, impuestos, y cualquier pago periódico como suscripciones, colegio, seguros). Formato: "Concepto · Mes AAAA".
   - Usa SIEMPRE el PERIODO FACTURADO (el mes/bimestre/año del consumo o del servicio), NUNCA la fecha de vencimiento ni la de pago.
   - Normaliza el periodo a "Mes AAAA" (ej. "Mayo 2026"); si es anual usa el año ("2026"); si es bimestral usa el rango ("May–Jun 2026").
   - Servicios públicos (agua, luz, gas, internet, teléfono): solo el tipo de servicio + periodo. NO listes conceptos internos (cargo fijo, consumo, contribución, alcantarillado, aseo). Ej: "Energía eléctrica · Mayo 2026", "Agua y alcantarillado · Mayo 2026", "Internet y teléfono · Mayo 2026".
   - Arriendo: concepto + periodo. Ej: "Arriendo local comercial · Junio 2026".
   - Sueldos / nómina: nombre del empleado + periodo o quincena. Ej: "Sueldo María López · 2da quincena mayo 2026".
   - Salud y parafiscales (EPS, ARL, pensión, caja de compensación): tipo de aporte + empleado si aplica + periodo. Ej: "Aporte EPS Juan Pérez · Mayo 2026".
   - Honorarios profesionales (contador, abogado, asesoría): servicio + periodo. Ej: "Honorarios contador · Junio 2026".
   - Impuestos: concepto tributario + periodo. Ej: "Impuesto de industria y comercio · 2026", "Predial local · 2026".
   - Publicidad recurrente (pauta en redes, suscripción): concepto + periodo. Ej: "Pauta redes sociales · Mayo 2026".

   FAMILIA B — Compra de productos o artículos. Cuenta cuántos artículos o productos distintos se compraron y aplica esta regla:
   - CASO 1: Si son 3 O MENOS artículos distintos (1, 2 o 3 productos) → pon el nombre descriptivo de cada producto incluyendo su unidad de medida o presentación (volumen, peso o tamaño como 350ml, 1kg, 900ml) SI APARECE en el comprobante (si no viene la unidad, solo el nombre). NO pongas cantidades compradas de unidades (evitar x10, x2, etc.), NO pongas precios ni prefijos.
     Ejemplos:
     * 1 artículo: "Coca Cola 350ml" o "Arroz Diana 1kg" o "Escoba"
     * 2 artículos: "Coca Cola 350ml y Papas 110g" o "Aceite 900ml y Arroz 1kg"
     * 3 artículos: "Coca Cola 350ml, Aceite 900ml y Arroz 1kg" o "Jabón 500g, Cloro 1L y Esponjas"
   - CASO 2: Si son MÁS DE 3 artículos (4 o más productos) → NO hagas una lista ni desgloses los ítems; pon una sola frase corta y descriptiva de lo que se compró según el tipo:
     * Si son productos que el negocio REVENDE (abarrotes, bebidas, víveres, carnes, etc.): "Compra de abarrotes y víveres", "Compra de bebidas y refrescos", "Compra de carnes y lácteos".
     * Si se CONSUME operando (aseo, limpieza, empaques, bolsas, papelería, desechables): "Artículos de aseo y limpieza", "Material de empaque y bolsas", "Papelería y rollos de impresión".
     * Si es DURADERO/equipamiento (herramientas, muebles, electrodomésticos): "Equipamiento de cocina", "Herramientas de mantenimiento", "Mobiliario para local".
   - Publicidad física / servicios puntuales: describe la pieza. Ej: "Impresión de volantes", "Pendón publicitario fachada".
   - Mantenimiento / reparaciones: describe la labor o arreglo. Ej: "Reparación y recarga nevera", "Mantenimiento eléctrico local".

   REGLAS DURAS DE LA DESCRIPCIÓN (aplican siempre, para CUALQUIER gasto, aunque no encaje claro en un ejemplo):
   - SIEMPRE construye una descripción en UNA sola línea corta y legible (máximo 8 a 12 palabras).
   - NUNCA incluyas cantidades compradas de artículos ni precios (PROHIBIDO poner "x10", "x2", "3 unidades", "$15.000", etc.). SÍ se permite la unidad de contenido del producto si viene en su nombre (ej: "350ml", "1kg").
   - PROHIBIDO devolver resúmenes vagos o sin sentido como "Varios", "Otro", "Gasto general", "Compra", "Compra general" o "Servicio" a secas.
   - NO inventes detalle que no esté en el comprobante. NO pongas montos ni precios en la descripción (el valor va en "amount"). NO repitas el nombre del proveedor (ese va en "supplierName").
   - Solo si la imagen es ilegible o no se distingue ningún concepto, devuelve "".

3. "category": La categoría del gasto. Elige EXACTAMENTE UNA de esta lista cerrada (devuélvela TAL CUAL, en mayúsculas y con tilde donde la tenga):
   ARRIENDO, BIENES, HONORARIOS, IMPUESTOS, INSUMOS, MANTENIMIENTO, MERCANCÍA, PUBLICIDAD, SALUD Y PARAFISCALES, SERVICIOS, SUELDOS.
   Usa la MISMA clasificación que hiciste para "description":
   - Familia A recurrente/servicio → arriendo local = ARRIENDO; agua/luz/gas/internet/teléfono = SERVICIOS; sueldos/nómina = SUELDOS; EPS/ARL/pensión/caja de compensación = SALUD Y PARAFISCALES; contador/abogado/asesoría = HONORARIOS; impuestos/predial/ICA = IMPUESTOS; pauta o publicidad recurrente = PUBLICIDAD.
   - Familia B compra de productos → productos que el negocio REVENDE = MERCANCÍA; aseo/limpieza/empaques/desechables/papelería = INSUMOS; herramientas/muebles/electrodomésticos/equipos duraderos = BIENES; reparaciones/repuestos/mano de obra = MANTENIMIENTO; volantes/pendones/impresiones publicitarias = PUBLICIDAD.
   Si el comprobante no permite decidir con confianza, devuelve "" (el usuario elegirá a mano). NUNCA inventes una categoría fuera de la lista.

4. "supplierName" y "nit": El nombre o razón social del emisor del comprobante y su NIT/identificación tributaria, tal como aparecen en el comprobante. Estos son los proveedores registrados en el negocio (solo como contexto, NO te limites a ellos):
${suppliersText}
Devuelve el nombre y NIT que leas en el comprobante tal cual. Si no encuentras alguno, devuelve string vacío "".
5. "date": La fecha del comprobante en formato "YYYY-MM-DD". Si no detectas una fecha, devuelve string vacío "".

INSTRUCCIONES IMPORTANTES:
- Si un campo no aparece en el comprobante, usa "" para texto y 0 para "amount".
- Si la imagen NO es legible o NO es un comprobante de gasto, devuelve "amount": 0 y los campos de texto vacíos.
- No inventes datos que no estén en la imagen.`;

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
                maxOutputTokens: 2048,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
            },
        });

        // Retry con exponential backoff para 429 (rate limit), 503 (overload) y 502
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
            console.warn(`[scan-expense] Gemini ${status} en intento ${attempt + 1}. Reintentando en ${Math.round(delayMs)}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        if (!geminiResponse || !geminiResponse.ok) {
            const errorText = await geminiResponse?.text() ?? "Sin respuesta";
            console.error("[scan-expense] Gemini error tras reintentos:", errorText);
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
            console.log(`[scan-expense] 💰 COSTO: input=${inputTokens} tok ($${inputCost.toFixed(6)}) | output=${outputTokens} tok + thinking=${thinkingTokens} tok ($${outputCost.toFixed(6)}) | TOTAL: $${totalCost.toFixed(6)} USD | total_tokens=${totalTokens}`);
        }
        // === END COST LOGGING ===

        const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
        console.log("[scan-expense] Raw Gemini Output:", content);

        let parsed;
        try {
            parsed = JSON.parse(content);
        } catch {
            return new Response(
                JSON.stringify({ error: "No se pudo parsear la respuesta de IA", rawContent: content }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const result = {
            amount: typeof parsed.amount === "number" ? parsed.amount : 0,
            description: typeof parsed.description === "string" ? parsed.description : "",
            category: typeof parsed.category === "string" ? parsed.category : "",
            supplierName: typeof parsed.supplierName === "string" ? parsed.supplierName : "",
            nit: typeof parsed.nit === "string" ? parsed.nit : "",
            date: typeof parsed.date === "string" ? parsed.date : "",
        };

        console.log("[scan-expense] Resultado:", JSON.stringify(result));

        return new Response(
            JSON.stringify(result),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (err) {
        console.error("[scan-expense] Error interno:", err);
        return new Response(
            JSON.stringify({ error: "Error interno del servidor" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
