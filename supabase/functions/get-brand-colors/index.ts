// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_COLORES_PROVEEDORES");

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
    const body = await req.json();
    const { suppliers, existingColors = [] } = body;

    if (!suppliers || !Array.isArray(suppliers) || suppliers.length === 0) {
      return new Response(
        JSON.stringify({ colors: [], error: "No se proporcionaron proveedores" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[get-brand-colors] Solicitando colores para ${suppliers.length} proveedores.`);

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

    const promptText = `Eres un diseñador de interfaces de usuario y experto en visualización de datos. Tu tarea es asignar colores hexadecimales altamente distintivos y estéticamente agradables para los siguientes proveedores, de forma que se vean bien juntos en una gráfica (como un pastel o un gráfico de barras).

REGLA 1 - ALTO CONTRASTE Y DIFERENCIACIÓN: Los colores que generes DEBEN ser muy distintos entre sí. Evita usar dos colores parecidos (ej. no regreses dos tonos de azul o dos tonos de rojo). Garantiza que si se colocan lado a lado en un gráfico circular, un usuario pueda diferenciarlos instantáneamente sin esfuerzo.

REGLA 2 - COLORES PROHIBIDOS: Ya estoy usando los siguientes colores en la gráfica: ${JSON.stringify(existingColors)}. 
Bajo ninguna circunstancia puedes generar un color que sea visualmente idéntico o muy similar a estos. Selecciona desde el círculo cromático tonos que complementen y que no colisionen o se parezcan a los prohibidos.

REGLA 3 - ESTÉTICA PROFESIONAL: No uses colores puros extremadamente brillantes (como #FF0000 o #00FF00) que luzcan agresivos. Usa tonos desaturados, modernos y profesionales (como los palettes UI de Tailwind o Material Design, ej: #F59E0B, #10B981, #3B82F6, #8B5CF6, #EC4899, #14B8A6).

REGLA 4 - CONTEXTO DE MARCA (OPCIONAL): Si el proveedor es una marca hiper-conocida (ej. "Coca Cola"), aproxímate a su color principal pero aplicando la REGLA 3 (ej. rojo arcilla en vez de rojo puro) y siempre respetando la REGLA 1 de no usar colores parecidos si ya existe un rojo. Si es un proveedor genérico (ej. "Papelería" o "Pedro"), escoge un color libre buscando MÁXIMO CONTRASTE con los demás.

Responde ÚNICAMENTE con JSON válido y minificado, sin markdown, sin backticks de código (\`\`\`), sin texto extra, con esta estructura exacta:
{"colors":[{"id":"<id>","color":"<hex>"}]}

Proveedores para los que debes generar color:
${JSON.stringify(suppliers)}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: promptText }]
        }],
        generationConfig: {
          thinkingConfig: {
            thinking_level: "low",
          },
          maxOutputTokens: 1024,
          responseMimeType: "application/json"
        }
      })
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("[get-brand-colors] Gemini error:", errorText);
      return new Response(
        JSON.stringify({ colors: [], error: "Error al generar colores con IA" }),
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
        console.log(`[get-brand-colors] 💰 COSTO: input=${inputTokens} tok ($${inputCost.toFixed(6)}) | output=${outputTokens} tok + thinking=${thinkingTokens} tok ($${outputCost.toFixed(6)}) | TOTAL: $${totalCost.toFixed(6)} USD | total_tokens=${totalTokens}`);
    }
    // === END COST LOGGING ===

    const content = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseErr) {
      try {
        const cleaned = content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          parsed = { colors: [] };
        }
      } catch (fallbackErr) {
        parsed = { colors: [] };
      }
    }

    if (Array.isArray(parsed)) {
      parsed = { colors: parsed };
    }

    if (!parsed.colors || !Array.isArray(parsed.colors)) {
      parsed = { colors: [] };
    }

    console.log(`[get-brand-colors] Generados ${parsed.colors.length} colores.`);

    return new Response(
      JSON.stringify(parsed),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[get-brand-colors] Error interno:", err);
    return new Response(
      JSON.stringify({ colors: [], error: "Error interno del servidor" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});