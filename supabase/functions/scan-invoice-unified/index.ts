// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// La clave se lee EXCLUSIVAMENTE del entorno. Sin fallback en el código.
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_COMPRA_INVENTARIO") || "";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

/** Forma neutra del contrato: el frontend la trata como escaneo fallido. */
const emptyResult = (error: string, extra: Record<string, unknown> = {}) => ({
    header: {},
    document: { globalDiscount: 0 },
    items: [],
    error,
    ...extra,
});

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { imageBase64, mimeType, suppliers, catalog } = await req.json();

        if (!imageBase64 || !mimeType) {
            return new Response(
                JSON.stringify({ error: "imageBase64 y mimeType son requeridos" }),
                { status: 400, headers: jsonHeaders }
            );
        }

        if (!GEMINI_API_KEY) {
            console.error("[scan-invoice-unified] GEMINI_API_COMPRA_INVENTARIO no está configurada en los secrets de la función.");
            return new Response(
                JSON.stringify(emptyResult("El servicio de escaneo no está configurado: falta el secret GEMINI_API_COMPRA_INVENTARIO.")),
                { status: 500, headers: jsonHeaders }
            );
        }

        let suppliersPromptSection = "";
        if (Array.isArray(suppliers) && suppliers.length > 0) {
            const supplierLines = suppliers.map((s: any) => {
                const nitStr = s.nit ? ` (NIT: ${s.nit})` : "";
                const phoneStr = s.phone ? ` | Tel: ${s.phone}` : "";
                return `- [ID: "${s.id}"] "${s.name}"${nitStr}${phoneStr}`;
            }).join("\n");

            suppliersPromptSection = `\n\nPROVEEDORES REGISTRADOS EN ESTE NEGOCIO:
${supplierLines}

REGLAS DE RECONOCIMIENTO DE PROVEEDOR:
- Analiza el encabezado / membrete físico de la factura para identificar al emisor del documento.
- PROHIBICIÓN ESTRICTA: NUNCA deduzcas ni infieras el proveedor a partir de los productos o marcas de la tabla (ejemplo: ver "Postobón", "Hit", "Póker" o "Coca-Cola" en las líneas NO significa que el emisor de la factura sea esa empresa; pudo ser comprado en un distribuidor, depósito o cigarrería).
- Si la imagen recibida es un recorte que solo contiene la tabla de productos, o el encabezado/membrete NO está visible en la imagen, DEBES devolver obligatoriamente "supplierName": null, "nit": null, "phone": null, "supplier_id": null.
- Solo si el membrete del emisor está visible y legible en la imagen: compara el nombre comercial y razón social leídos con los proveedores registrados arriba.
- Tolera sufijos societarios (S.A.S., S.A., LTDA, etc.), variaciones de mayúsculas/minúsculas y NITs con o sin dígito de verificación.
- Si coincide con alta certeza con uno de los proveedores registrados, asigna su ID en "supplier_id".
- Si NO coincide con ningún proveedor registrado o parece ser un proveedor nuevo, deja "supplier_id": null.
- En "supplierName" y "nit" transcribe SIEMPRE lo que esté escrito literalmente en el documento. NUNCA inventes NITs ni nombres que no estén impresos.`;
        }

        let catalogPromptSection = "";
        if (Array.isArray(catalog) && catalog.length > 0) {
            const catalogLines = catalog.map((item: any) => {
                const nicks = Array.isArray(item.nicknames) && item.nicknames.length > 0
                    ? ` | Apodos: [${item.nicknames.join(", ")}]`
                    : "";
                const barcodeStr = item.barcode ? ` | Barcode: "${item.barcode}"` : "";
                const unitStr = item.unit ? ` | Unidad de venta en Bistro: "${item.unit}"` : "";
                const purchaseUnitsStr = Array.isArray(item.purchaseUnits) && item.purchaseUnits.length > 0
                    ? ` | Empaques conocidos: [${item.purchaseUnits.map((pu: any) => `${pu.unit} x ${pu.factor}`).join(", ")}]`
                    : "";
                return `- [ID: "${item.id}"] "${item.name}"${unitStr}${barcodeStr}${purchaseUnitsStr}${nicks}`;
            }).join("\n");

            catalogPromptSection = `\n\nCATÁLOGO DISPONIBLE EN ESTE NEGOCIO:
${catalogLines}

REGLAS DE CORRESPONDENCIA CON EL CATÁLOGO:
1. VARIACIONES FONÉTICAS Y ABREVIATURAS DE FACTURA:
   - Las facturas colombianas abrevian fuertemente (ejemplos: "ARRZ" = Arroz, "CERV" = Cerveza, "GIRAS" = Girasol, "ACEIT" = Aceite, "PAQ" = Paquete, "CJ" = Caja, "BTO" = Bulto, "DISP" = Display, "NR" = No retornable, "RET" = Retornable).
   - Compara las palabras considerando fonética, raíces y abreviaturas contra los nombres y apodos del catálogo.

2. REGLA DE DIFERENCIADORES VS TÉRMINOS GENÉRICOS:
   - Cuando el texto apunta a una familia de productos o presentaciones que comparten el mismo nombre base o raíz en el catálogo:
     * SI INCLUYE UN ELEMENTO DIFERENCIADOR (palabra, gramaje, volumen, empaque, sabor o inicial que coincide de forma única con una sola de las opciones del catálogo, ej: "500g", "1L", "Lata", "Botella", "Azul"):
       -> Asigna el ID exacto en "product_id" y deja "candidate_ids": [].
     * SI NO TIENE NINGÚN DIFERENCIADOR (el texto es genérico o ambiguo y aplica por igual a dos o más opciones del catálogo):
       -> NUNCA elijas una al azar. Deja "product_id": null y coloca en "candidate_ids" los IDs de todas las opciones posibles de esa familia para que el usuario elija en pantalla.

3. CÓDIGO DE BARRAS NUMÉRICO:
   - Si la factura muestra un código de barras numérico y coincide con un producto del catálogo, asigna su ID en "product_id" y deja "candidate_ids": [].

4. TRANSCRIPCIÓN LITERAL ESTRICTA EN "description":
   - Aunque vincules a un ID del catálogo, "description" DEBE conservar estrictamente el texto literal que estaba escrito en la factura (NUNCA lo reemplaces por el nombre oficial del catálogo).

5. SIN COINCIDENCIA:
   - Si no hay correspondencia posible en el catálogo, deja "product_id": null y "candidate_ids": []. NUNCA omitas una línea porque no esté en el catálogo.`;
        }

        // Esquema estructurado para Gemini
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
                        supplier_id: { type: "STRING", nullable: true },
                    },
                    required: ["supplierName", "nit", "phone", "invoiceNumber", "date", "supplier_id"],
                },
                document: {
                    type: "OBJECT",
                    properties: {
                        globalDiscount: { type: "NUMBER", nullable: true },
                        documentTotal: { type: "NUMBER", nullable: true },
                    },
                    required: ["globalDiscount", "documentTotal"],
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
                            product_id: { type: "STRING", nullable: true },
                            candidate_ids: {
                                type: "ARRAY",
                                items: { type: "STRING" },
                            },
                            reasoning: { type: "STRING", nullable: true },
                            conversion_factor: { type: "NUMBER", nullable: true },
                            inventory_quantity: { type: "NUMBER", nullable: true },
                            unit_needs_clarification: { type: "BOOLEAN", nullable: true },
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
                            "product_id",
                            "candidate_ids",
                            "reasoning",
                            "conversion_factor",
                            "inventory_quantity",
                            "unit_needs_clarification",
                        ],
                    },
                },
            },
            required: ["header", "document", "items"],
        };

        const promptText = `Eres un EXPERTO EN FACTURAS DE COMPRA colombianas y asistente de compras de inventario. Tu trabajo es transcribir a JSON con máxima precisión lo que ves en la imagen del documento, emparejar con los proveedores y catálogo del negocio, y razonar línea por línea para deducir la cantidad real de inventario que ingresará según cómo se vende cada producto en Bistro.

DATOS DE CABECERA ("header"):
- "supplierName": nombre o razón social del emisor tal como aparece en el encabezado/membrete. null si el encabezado no está visible o si la imagen es solo la tabla de productos. NUNCA deducir por las marcas de los productos.
- "nit": NIT o identificación tributaria del emisor tal como aparece en el encabezado/membrete. null si no está visible. NUNCA inventar ni autocompletar.
- "phone": número de teléfono del proveedor/emisor si aparece en el documento. null si no se ve.
- "invoiceNumber": número o código de la factura. null si no se ve.
- "date": fecha de emisión en formato "YYYY-MM-DD". null si no se ve.
- "supplier_id": ID del proveedor registrado si coincide con el membrete visible, o null si es nuevo/desconocido o si no hay membrete en la imagen.

DATOS DEL DOCUMENTO ("document"):
- "globalDiscount": descuento al pie que aplica al total del documento. 0 si no hay.
- "documentTotal": total final del documento (informativo).

LÍNEAS DE PRODUCTO ("items"), un objeto por cada renglón de producto:
- "description": nombre del producto tal como aparece en la factura (transcripción literal estricta).
- "product_id": ID del producto en el catálogo si coincide con alta certeza con uno solo; null si no coincide o si es ambiguo.
- "candidate_ids": arreglo con los IDs de productos candidatos si la descripción es ambigua/genérica (ej: varias presentaciones posibles); arreglo vacío [] si coincide directo o no existe en catálogo.
- "quantity": cantidad facturada del renglón (la columna "Cantidad" / "Cant" / "Cantidades sueltas"), tal como se lee, sin convertir. NO es la columna de unidades por empaque ("Und. emp." / "Presentación") ni el contenido por unidad ("500G", "2000ML").
- "ocr_unit": unidad de empaque MAYOR cuando el renglón fue facturado por empaques completos ("PACA", "CAJA", "BULTO", etc.). Si el renglón fue facturado en unidades sueltas individuales o no hay empaque, debe ser "" (string vacío). Ver instrucción 7.
- "unitValue": valor unitario del renglón.
- "lineSubtotal": subtotal del renglón antes de impuestos y descuentos de ese renglón.
- "lineTax": impuestos DE ESE renglón.
- "lineDiscount": descuentos DE ESE renglón.
- "lineNetTotal": lineSubtotal + lineTax − lineDiscount.
- "barcode": código de barras numérico del producto (EAN-13, EAN-8, UPC-A: secuencia de 8 a 14 dígitos) si aparece en la factura. null si no se ve.
- "reasoning": explicación breve de 1 a 2 frases donde razonas paso a paso:
   a) Correspondencia con el catálogo (o si es nuevo/ambiguo).
   b) Comparación entre la unidad facturada y la "Unidad de venta en Bistro" (ej: si se cobró por empaque como "Caja x 24" o en unidades sueltas).
   c) Deducción de cuántas unidades de inventario ingresarán o si falta información.
- "conversion_factor": factor multiplicador deducido para llevar "quantity" a la "Unidad de venta en Bistro":
   * Si la factura cobró en empaque (ej. "Caja x 24", "Paca x 12", "Sixpack") y en Bistro se vende por "Und", factor = 24 o 12 o 6.
   * Si se facturó directo en la unidad de venta (ej. 25 unidades sueltas, o kilos facturados en kilos), factor = 1.
   * Si no hay información en la factura para deducir la equivalencia (ej: "1 bulto de papa" pero en Bistro se vende por "Kg" y la factura no indica el peso del bulto), factor = null.
- "inventory_quantity": cantidad total deducida que entrará al inventario (quantity × conversion_factor). Si falta información, null.
- "unit_needs_clarification": booleano. true ÚNICAMENTE cuando la factura usa una unidad de compra o empaque cuyo factor no se puede deducir del documento ni del contexto y se requiere preguntarle al usuario (ej: "1 bulto de papa" sin peso). false cuando todo esté claro o el factor ya fue deducido.

INSTRUCCIONES (las diez son obligatorias):

1. COPIADOR FIEL Y DEDUCTOR INTELIGENTE DE INVENTARIO.
Transcribe fielmente lo que ves en el documento.
- PRODUCTOS DEL CATÁLOGO:
  * Analiza la "Unidad de venta en Bistro" y razona en "reasoning" para deducir "conversion_factor" e "inventory_quantity".
  * Si el producto tiene "Empaques conocidos" (ej: Caja x 30, Sixpack x 6) y la factura indica esa unidad de compra o empaque (ej: "CAJA" o "CJ"), usa ese factor de conversión conocido directamente, incluso si la factura no trae el número multiplicador explícito.
  * Si el texto de la factura trae el multiplicador de empaque ("X 24", "Paca x 12", "Sixpack", "Display x 30", etc.), úsalo para calcular el factor.
- PRODUCTOS NUEVOS (REGLA DE TIENDA DE BARRIO):
  * Si el producto es NUEVO (no coincide en catálogo) pero su texto o empaque indica empaque mayorista ("CJ X 24", "DISPLAY X 12", "PACA X 25", "SIXPACK"):
    - Asume que para una tienda de barrio la unidad de venta destino es "Und" (unidades sueltas).
    - Deduce "conversion_factor" con el conteo de unidades del empaque (ej: 24, 12, 25, 6) y calcula "inventory_quantity" = quantity × conversion_factor.
    - En "reasoning", explica la equivalencia deducida (ej: "Empaque de 24 unidades facturado en cajas. Destino sugerido: unidades sueltas").
- DUDAS O AMBIGÜEDADES:
  * Solo marca "unit_needs_clarification: true" y "conversion_factor: null" cuando sea una unidad de compra ambigua sin conteo ni peso en la factura (ej: bulto, canasta sin datos) y sin empaques conocidos.

2. IMPUESTOS Y DESCUENTOS DE LÍNEA. Si la factura presenta impuestos (IVA, impuesto al consumo) o descuentos comerciales por renglón, devuélvelos en "lineTax" y "lineDiscount" de ese renglón y entrega "lineNetTotal" = lineSubtotal + lineTax − lineDiscount. Si la factura ya trae el total del renglón con los impuestos incluidos, entonces "lineTax" = 0 y "lineNetTotal" = ese total. NUNCA cuentes dos veces un impuesto que ya está dentro del valor unitario o del total del renglón.

3. DESCUENTO GLOBAL AL PIE. Un descuento que aplica al total del documento va SOLO en "document.globalDiscount" y NO se resta de ninguna línea. Las líneas conservan sus valores sin ese descuento.

4. FORMATO NUMÉRICO LATINO. El documento usa formato latinoamericano: el PUNTO (.) es separador de MILES y la COMA (,) es separador de DECIMALES. Devuelve siempre números con punto decimal, sin símbolos de moneda ni separadores de miles. Ejemplos: "8.100" → 8100, "0,44" → 0.44, "1.980" → 1980, "1.250,50" → 1250.5.

5. UNITARIO DERIVADO. Si el renglón no trae valor unitario pero sí total y cantidad, calcula "unitValue" = total / cantidad.

6. TODAS LAS LÍNEAS DE PRODUCTO. Extrae absolutamente todos los renglones de producto, sin omitir ninguno. Excluye únicamente las filas que NO son producto: fletes, transportes, totales, subtotales, retenciones, redondeos y notas al pie. Esas filas no deben aparecer en "items".

7. DISTINCIÓN CRUCIAL: FACTURACIÓN EN EMPAQUE vs EN UNIDADES SUELTAS ("ocr_unit").
   En Colombia la columna de unidad suele traer el código fiscal DIAN "94" o "UND" para todo. Para determinar si el renglón se compró por empaque mayor o por unidad suelta, realiza esta verificación:
   a) VERIFICACIÓN MATEMÁTICA:
      - Si la descripción o presentación menciona un empaque (ej: "Paca x 25", "Caja x 12"), compara la columna "Cantidad" y el "Valor Unitario":
        * FACTURADO EN UNIDADES SUELTAS: Si la cantidad facturada coincide con el conteo de unidades sueltas (ej: Cant = 25 o 12) y el Valor Unitario es el precio individual de cada unidad (ej: Cant 25 × $2.150 = Total $53.750), el proveedor facturó UNIDADES SUELTAS. En este caso "ocr_unit" DEBE SER "" (string vacío).
        * FACTURADO EN EMPAQUE COMPLETO: Si la cantidad facturada es el número de cajas/pacas enteras (ej: Cant = 1 o Cant = 2) y el Valor Unitario es el precio del empaque entero (ej: Cant 1 × $53.750 = Total $53.750), el proveedor facturó en EMPAQUE. En este caso "ocr_unit" es el nombre del empaque.
   b) FORMATO LIMPIO DE "ocr_unit" (SOLO EL SUSTANTIVO, NUNCA MULTIPLICADORES):
      - Si se determina que se facturó en empaque, "ocr_unit" debe contener ÚNICAMENTE el sustantivo en mayúsculas: "PACA", "CAJA", "BULTO", "DISPLAY", "DOCENA", "TIRA", "PAQUETE", "SIXPACK", "ARROBA", "BLISTER".
      - NUNCA incluyas números, conteos ni multiplicadores en "ocr_unit" (NUNCA "Paca x 25", NUNCA "Caja x 12", NUNCA "Display x 24"). El multiplicador ("x 25") NO es parte del nombre de la unidad.
   c) UNIDADES SUELTAS Y PRESENTACIÓN:
      - Devuelve "ocr_unit" = "" cuando el renglón es una unidad suelta, o cuando la unidad en la factura es simplemente "UND", "UN", "94", o un gramaje/volumen de contenido ("500G", "1KG", "1000ML", "2L"). Esos gramos o mililitros son la presentación del contenido individual, NO un empaque de compra.

8. CANTIDAD CORRECTA CUANDO HAY VARIAS COLUMNAS. Algunos distribuidores presentan a la vez una columna de cantidad facturada ("Cantidad" / "Cant" / "Cantidades sueltas") y otra de unidades por empaque ("Und. emp." / "Presentación"). La "quantity" del renglón es SIEMPRE la cantidad facturada; NUNCA las unidades por empaque ni el contenido por unidad ("500G", "2000ML"), que describen el producto pero no cuánto se compró.

9. SIN DATOS → NEUTRO. Los campos de texto que no aparezcan en el documento van en null y los numéricos en 0. No rellenes con suposiciones.

10. CÓDIGO DE BARRAS Y TELÉFONO. Si la factura muestra un código de barras numérico (secuencia de 8 a 14 dígitos, típicamente en una columna "EAN", "Código", "Barras" o "Referencia"), extráelo en "barcode" de cada renglón. Descarta códigos internos alfanuméricos del proveedor (con letras o menos de 8 dígitos). Para el teléfono del proveedor, extrae números colombianos de 10 dígitos con o sin prefijo +57, con o sin separadores. Si no aparecen, deja null.${suppliersPromptSection}${catalogPromptSection}`;

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

        // Retry con exponential backoff para 429 (rate limit), 503 (overload) y 502.
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
            console.warn(`[scan-invoice-unified] Gemini ${status} en intento ${attempt + 1}. Reintentando en ${Math.round(delayMs)}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        if (!geminiResponse || !geminiResponse.ok) {
            const errorText = await geminiResponse?.text() ?? "Sin respuesta";
            console.error("[scan-invoice-unified] Gemini error tras reintentos:", errorText);
            return new Response(
                JSON.stringify(emptyResult("Error al procesar la imagen con IA", { details: errorText })),
                { status: 200, headers: jsonHeaders }
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
            console.log(`[scan-invoice-unified] 💰 COSTO: input=${inputTokens} tok ($${inputCost.toFixed(6)}) | output=${outputTokens} tok + thinking=${thinkingTokens} tok ($${outputCost.toFixed(6)}) | TOTAL: $${totalCost.toFixed(6)} USD | total_tokens=${totalTokens}`);
        }
        // === END COST LOGGING ===

        const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

        let parsed;
        try {
            parsed = JSON.parse(content);
        } catch {
            console.error("[scan-invoice-unified] Respuesta no parseable de Gemini.");
            return new Response(
                JSON.stringify(emptyResult("No se pudo parsear el JSON de Gemini", { rawContent: content })),
                { status: 200, headers: jsonHeaders }
            );
        }

        // Garantías mínimas de forma. La normalización de valores vive en el frontend
        // (lib/invoiceScan/scanResponse.ts): aquí solo se asegura la estructura.
        const header = parsed.header && typeof parsed.header === "object" ? parsed.header : {};
        const document = parsed.document && typeof parsed.document === "object" ? parsed.document : {};
        if (typeof document.globalDiscount !== "number") document.globalDiscount = 0;
        const items = Array.isArray(parsed.items) ? parsed.items : [];

        console.log(`[scan-invoice-unified] Extraídas ${items.length} líneas de producto.`);

        return new Response(
            JSON.stringify({ header, document, items }),
            { status: 200, headers: jsonHeaders }
        );
    } catch (err) {
        console.error("[scan-invoice-unified] Error interno:", err);
        return new Response(
            JSON.stringify({ error: "Error interno del servidor" }),
            { status: 500, headers: jsonHeaders }
        );
    }
});
