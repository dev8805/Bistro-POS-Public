// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_FOTOLISTA") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { imageBase64, mimeType, catalog } = body;

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ items: [], error: "No se proporcionó imagen" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[ocr-scan] Imagen: ${(imageBase64.length / 1024).toFixed(0)}KB, tipo: ${mimeType || "image/jpeg"}, items catálogo: ${Array.isArray(catalog) ? catalog.length : 0}`);

    let catalogPromptSection = "";
    if (Array.isArray(catalog) && catalog.length > 0) {
      const catalogLines = catalog.map((item: any, idx: number) => {
        const nicks = Array.isArray(item.nicknames) && item.nicknames.length > 0
          ? ` | Apodos: [${item.nicknames.join(", ")}]`
          : "";
        const unit = item.unit ? ` (${item.unit})` : "";
        return `- [#${idx}] "${item.name}"${unit}${nicks}`;
      }).join("\n");

      catalogPromptSection = `\n\nCATÁLOGO DEL NEGOCIO (referenciado por [#índice]):\n${catalogLines}\n
REGLAS DE CORRESPONDENCIA CON EL CATÁLOGO:
1. Variaciones fonéticas y ortográficas: Compara palabras escritas considerando sonido, raíz, tildes y apodos del catálogo.
2. Desambiguación:
   - Si incluye diferenciador único hacia una opción (ej: 'Medio', 'Lata', inicial 'm' o 'l'), asigna su índice numérico (ej: 0).
   - Si es ambiguo (aplica por igual a 2+ opciones de una familia), asigna null y lista los índices posibles (ej: [1, 2]).
3. Coincidencia directa sin ambigüedad: Asigna su índice numérico.
4. Sin coincidencia: Asigna null. NUNCA omitas un producto porque no esté en el catálogo.`;
    }

    const promptText = `Analiza esta imagen de una lista de compras, pedido o comanda escrita a mano o impresa.
Extrae TODOS los productos de TODAS las columnas y renglones, sus cantidades y correspondencia con el catálogo si existe.

REGLAS GENERALES:
1. Columnas múltiples: Recorre minuciosamente todas las columnas (izquierda y derecha) de arriba a abajo.
2. Si no hay número de cantidad al inicio del renglón, la cantidad es 1.
3. Ignora encabezados obvios (nombres de personas, número de mesa) y precios monetarios ($10.000). NUNCA omitas un producto.
4. Transcripción literal estricta: En el nombre transcribe únicamente las palabras visibles en el papel, tal como fueron escritas.

CANTIDADES Y PRESENTACIONES:
A. Palabras de presentación (medio, media, cuarto, paquete, caja, lata, botella): Pertenecen al nombre del producto, NO a la cantidad (ej: "medio paquete" -> cantidad 1 de esa presentación).
B. Productos indivisibles (cigarrillos, cervezas, gaseosas, empanadas): NUNCA devuelvas decimales. Cantidad entera >= 1.
C. Productos por peso/medida (Libras, Kilos, Gramos, Metros): SÍ admiten decimales ("1/2" -> 0.5, "1/4" -> 0.25, "kilo y medio" -> 1.5, "500g" -> 0.5).
${catalogPromptSection}

FORMATO DE SALIDA ULTRA-COMPACTO:
Responde ÚNICAMENTE con un array JSON de tuplas (sin markdown, sin backticks, sin explicaciones):
[["nombre literal", cantidad, indice_catalogo_o_null, [candidatos_opcional]]]

EJEMPLOS:
[["1 chico", 1, 10], ["2 Poker Lata", 2, 9], ["Aguila", 1, null, [7, 8]]]
(Si no hay candidatos ambiguos, omite el 4to elemento de la tupla: ["chico", 1, 10])`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: mimeType || "image/jpeg",
                data: imageBase64
              }
            },
            {
              text: promptText
            }
          ]
        }],
        generationConfig: {
          thinkingConfig: {
            thinking_level: "low",
          },
          maxOutputTokens: 8192,
          responseMimeType: "application/json"
        }
      })
    });

    console.log(`[ocr-scan] Gemini status: ${geminiResponse.status}`);

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("[ocr-scan] Gemini error:", errorText);
      return new Response(
        JSON.stringify({ items: [], error: "Error al procesar imagen con Gemini" }),
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
        // Gemini 3.8 Flash: $0.75/1M input, $3.75/1M output (thinking incluido en output)
        const inputCost = (inputTokens / 1_000_000) * 0.75;
        const outputCost = ((outputTokens + thinkingTokens) / 1_000_000) * 3.75;
        const totalCost = inputCost + outputCost;
        console.log(`[ocr-scan] 💰 COSTO: input=${inputTokens} tok ($${inputCost.toFixed(6)}) | output=${outputTokens} tok + thinking=${thinkingTokens} tok ($${outputCost.toFixed(6)}) | TOTAL: $${totalCost.toFixed(6)} USD | total_tokens=${totalTokens}`);
    }
    // === END COST LOGGING ===

    const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("[ocr-scan] Gemini result:", content.substring(0, 500));

    let parsed: any = null;
    try {
      // Since responseMimeType is application/json, Gemini returns clean JSON
      parsed = JSON.parse(content);
    } catch (parseErr) {
      console.warn("[ocr-scan] Direct JSON parse failed, attempting recovery:", parseErr);
      const cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

      // Intento 1: Regex para extraer el bloque {...} o [...]
      const jsonMatch = cleaned.match(/[\{\[][\s\S]*[\}\]]/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (_) {}
      }

      // Intento 2: Si el JSON quedó cortado por límite de tokens, reparar cerrando el array/objeto
      if (!parsed || (!parsed.items && !Array.isArray(parsed))) {
        const lastBrace = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
        if (lastBrace !== -1) {
          const truncatedCandidate = cleaned.substring(0, lastBrace + 1) + "]}";
          try {
            parsed = JSON.parse(truncatedCandidate);
          } catch (_) {
            try {
              parsed = JSON.parse(cleaned.substring(0, lastBrace + 1) + (cleaned.startsWith("[") ? "]" : "}"));
            } catch (_) {}
          }
        }
      }

      // Intento 3: Rescate individual de items usando regex (soporta tuplas compactas u objetos)
      if (!parsed || (!parsed.items && !Array.isArray(parsed)) || (Array.isArray(parsed) && parsed.length === 0) || (parsed.items && parsed.items.length === 0)) {
        const tupleMatches = content.match(/\[\s*"[^"\\]*(?:\\.[^"\\]*)*"\s*,\s*[\d\.]+\s*,\s*(?:\d+|null)(?:\s*,\s*\[[^\]]*\])?\s*\]/g);
        const itemMatches = content.match(/\{[^{}]*"name"[^{}]*\}/g);
        const recoveredItems: any[] = [];
        if (tupleMatches && tupleMatches.length > 0) {
          for (const m of tupleMatches) {
            try {
              recoveredItems.push(JSON.parse(m));
            } catch (_) {}
          }
        } else if (itemMatches && itemMatches.length > 0) {
          for (const m of itemMatches) {
            try {
              recoveredItems.push(JSON.parse(m));
            } catch (_) {}
          }
        }
        if (recoveredItems.length > 0) {
          parsed = recoveredItems;
        }
      }
    }

    // Extraer lista cruda de items (puede venir como array directo de tuplas/objetos, o dentro de { items: [...] })
    let rawList: any[] = [];
    if (Array.isArray(parsed)) {
      rawList = parsed;
    } else if (parsed && Array.isArray(parsed.items)) {
      rawList = parsed.items;
    }

    if (!rawList || rawList.length === 0) {
      parsed = { items: [], error: parsed?.error || (parsed ? undefined : "No se pudo extraer la lista de productos") };
    } else {
      // Normalizar tanto tuplas compactas [name, qty, pIndex, cIndexes] como objetos { name, quantity, ... }
      const normalizedItems = rawList.map((entry: any) => {
        // Caso 1: Tupla compacta [ "nombre", cantidad, indice_catalogo, [candidatos]? ]
        if (Array.isArray(entry)) {
          const name = typeof entry[0] === "string" ? entry[0] : String(entry[0] || "");
          const quantity = typeof entry[1] === "number" && !isNaN(entry[1]) ? entry[1] : 1;
          const pIndex = typeof entry[2] === "number" ? entry[2] : null;
          const cIndexes = Array.isArray(entry[3]) ? entry[3] : [];

          const productId = (pIndex !== null && Array.isArray(catalog) && catalog[pIndex]) ? catalog[pIndex].id : null;
          const candidateIds = cIndexes
            .map((idx: any) => (typeof idx === "number" && Array.isArray(catalog) ? catalog[idx]?.id : null))
            .filter((id: any): id is string => typeof id === "string");

          return {
            name,
            quantity,
            product_id: productId,
            raw_text: name,
            candidate_ids: candidateIds,
          };
        }

        // Caso 2: Objeto estándar o de recuperación { name, quantity, ... }
        if (entry && typeof entry === "object") {
          let productId: string | null = null;
          if (typeof entry.product_index === "number" && Array.isArray(catalog) && catalog[entry.product_index]) {
            productId = catalog[entry.product_index].id;
          } else if (typeof entry.product_id === "string") {
            productId = entry.product_id;
          }

          let candidateIds: string[] = [];
          if (Array.isArray(entry.candidate_indexes) && Array.isArray(catalog)) {
            candidateIds = entry.candidate_indexes
              .map((idx: any) => (typeof idx === "number" ? catalog[idx]?.id : null))
              .filter((id: string | null): id is string => typeof id === "string");
          } else if (Array.isArray(entry.candidate_ids)) {
            candidateIds = entry.candidate_ids;
          }

          return {
            name: entry.name || "",
            quantity: typeof entry.quantity === "number" ? entry.quantity : 1,
            product_id: productId,
            raw_text: entry.raw_text || entry.name || "",
            candidate_ids: candidateIds,
          };
        }

        return null;
      }).filter(Boolean);

      parsed = { items: normalizedItems };
    }

    console.log(`[ocr-scan] Items extraídos: ${parsed.items?.length || 0}`);

    return new Response(
      JSON.stringify(parsed),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[ocr-scan] Error:", err);
    return new Response(
      JSON.stringify({ items: [], error: "Error interno del servidor" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});