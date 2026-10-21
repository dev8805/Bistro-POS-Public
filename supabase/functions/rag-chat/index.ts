// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { GoogleGenAI } from 'npm:@google/genai';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_ASISTENTE')!;
const PINECONE_API_KEY = Deno.env.get('PINECONE_API_KEY')!;
const PINECONE_INDEX_NAME = Deno.env.get('PINECONE_INDEX_NAME')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const EMBED_MODEL = 'gemini-embedding-2';
const CHAT_MODEL = 'gemini-3.1-flash-lite'; // Fase 1: modelo económico Gemini 3.1 Flash-Lite
const TOP_K_DISCOVERY = 15;      // Etapa 1: identificar documentos relevantes
const MAX_EXPAND_DOCS = 2;       // Etapa 2: expandir hasta 2 documentos completos
const EXPAND_TOP_K = 50;         // chunks por documento expandido (revertido de 30 a 50 para ampliar contexto y mejorar calidad de respuestas)
const MIN_EXPAND_SCORE = 0.38;   // Score mínimo para disparar expansión
const BISTRO_TOPIC_SCORE_FALLBACK = 35;

// Precios Gemini 3.1 Flash-Lite (paid tier), USD por 1M tokens.
// Si cambias CHAT_MODEL, actualiza estos valores para que el log de costo siga siendo real.
const PRICE_INPUT_PER_1M = 0.25;
const PRICE_OUTPUT_PER_1M = 1.50;

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
let cachedPineconeHost: string | null = null;

async function getPineconeHost(): Promise<string> {
  if (cachedPineconeHost) return cachedPineconeHost;
  const res = await fetch(`https://api.pinecone.io/indexes/${PINECONE_INDEX_NAME}`, {
    headers: { 'Api-Key': PINECONE_API_KEY, 'X-Pinecone-API-Version': '2024-07' },
  });
  const data = await res.json();
  if (!data.host) throw new Error(`Pinecone host error: ${JSON.stringify(data)}`);
  cachedPineconeHost = data.host;
  return data.host;
}

async function embedQuery(query: string): Promise<number[]> {
  const res = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: query,
    config: { taskType: 'RETRIEVAL_QUERY' },
  });
  const values = (res as any).embeddings?.[0]?.values;
  if (!values) throw new Error(`embedQuery: no se obtuvo vector. Respuesta: ${JSON.stringify(res)}`);
  console.log(`[rag-chat] Query vector length: ${values.length}`);
  return values;
}

// HyDE: genera una respuesta hipotética para mejorar la búsqueda en Pinecone.
// Los chunks están redactados como respuestas, no como preguntas — embeddear una
// respuesta hipotética acerca el vector al espacio donde viven los chunks correctos.
async function generateHypotheticalAnswer(query: string): Promise<string> {
  try {
    const prompt = `Eres experto en Bistro POS, un sistema de punto de venta. Genera una respuesta completa (8-12 oraciones) a esta pregunta, redactada como si fuera un fragmento de documentación de usuario. Describe los pasos específicos para realizar la acción preguntada dentro de la app: qué pantalla abrir, qué campos completar, qué botones tocar, en qué orden. Usa terminología específica de la app (nombres de botones, pantallas, módulos). No menciones instalación de drivers ni hardware a menos que la pregunta sea explícitamente sobre eso. No agregues introducción ni conclusión.

Pregunta: "${query}"`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            thinkingConfig: { thinking_level: 'low' },
            maxOutputTokens: 200,
          },
        }),
      }
    );
    const data = await res.json();

    // === COST LOGGING (HyDE) ===
    const hydeUsage = data.usageMetadata;
    if (hydeUsage) {
        const inputTokens = hydeUsage.promptTokenCount || 0;
        const outputTokens = hydeUsage.candidatesTokenCount || 0;
        const thinkingTokens = hydeUsage.thoughtsTokenCount || 0;
        const totalTokens = hydeUsage.totalTokenCount || 0;
        const inputCost = (inputTokens / 1_000_000) * PRICE_INPUT_PER_1M;
        const outputCost = ((outputTokens + thinkingTokens) / 1_000_000) * PRICE_OUTPUT_PER_1M;
        const totalCost = inputCost + outputCost;
        console.log(`[rag-chat] 💰 HyDE COSTO: input=${inputTokens} tok ($${inputCost.toFixed(6)}) | output=${outputTokens} tok + thinking=${thinkingTokens} tok ($${outputCost.toFixed(6)}) | TOTAL: $${totalCost.toFixed(6)} USD`);
    }
    // === END COST LOGGING ===

    const hypothesis = data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
    if (!hypothesis) throw new Error('HyDE: sin respuesta');
    console.log(`[rag-chat] HyDE hypothesis: "${hypothesis.slice(0, 120)}..."`);
    return hypothesis;
  } catch (e: any) {
    console.warn(`[rag-chat] HyDE falló, usando query original. Error: ${e.message}`);
    return query;
  }
}

// [SOURCES DESHABILITADAS] getFileUrl generaba URLs firmadas (1h) por cada fuente
// única devuelta por Pinecone. Se eliminó porque la UI no renderiza fuentes todavía.
// Para reactivar: restaurar esta función, la query a rag_documents y el loop de
// construcción de sources al final del handler (busca el comentario SOURCES DESHABILITADAS).
//
// async function getFileUrl(storagePath: string): Promise<string | null> {
//   if (!storagePath) return null;
//   const { data } = await supabase.storage
//     .from('rag-documents')
//     .createSignedUrl(storagePath, 3600);
//   return data?.signedUrl ?? null;
// }

function extractSuggestions(text: string): { answer: string; suggestions: string[] } {
  const re = /<<\s*SUGGESTIONS\s*:\s*(\[[\s\S]*?\])\s*>>/i;
  const m = text.match(re);
  if (!m) return { answer: text.trim(), suggestions: [] };
  try {
    const parsed = JSON.parse(m[1]);
    const suggestions = Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === 'string').slice(0, 3)
      : [];
    return { answer: text.replace(re, '').trim(), suggestions };
  } catch {
    return { answer: text.replace(re, '').trim(), suggestions: [] };
  }
}

function extractBistroTopicFlag(rawAnswer: string): { answer: string; flag: boolean | null } {
  const re = /<<\s*BISTRO[_\s]?TOPIC\s*:\s*(yes|no|true|false|si|sí)\s*>>/i;
  const m = rawAnswer.match(re);
  if (!m) return { answer: rawAnswer.trim(), flag: null };
  const cleaned = rawAnswer.replace(re, '').trim();
  const v = m[1].toLowerCase();
  const isYes = v === 'yes' || v === 'true' || v === 'si' || v === 'sí';
  return { answer: cleaned, flag: isYes };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { query, history = [] } = await req.json();
    if (!query) return new Response(JSON.stringify({ error: 'query requerido' }), { status: 400 });

    console.log(`[rag-chat] Query: "${query}"`);

    // HyDE + Pinecone host en paralelo, luego embedding de la respuesta hipotética
    const [hypotheticalAnswer, pineconeHost] = await Promise.all([
      generateHypotheticalAnswer(query),
      getPineconeHost(),
    ]);
    const queryVector = await embedQuery(hypotheticalAnswer);
    console.log(`[rag-chat] Vector dims: ${queryVector.length}, buscando en Pinecone...`);

    // ── Etapa 1: discovery — cuáles documentos son relevantes ──────────────
    const searchRes = await fetch(`https://${pineconeHost}/query`, {
      method: 'POST',
      headers: {
        'Api-Key': PINECONE_API_KEY,
        'Content-Type': 'application/json',
        'X-Pinecone-API-Version': '2024-07',
      },
      body: JSON.stringify({ vector: queryVector, topK: TOP_K_DISCOVERY, includeMetadata: true }),
    });

    const searchData = await searchRes.json();
    console.log(`[rag-chat] Discovery: ${JSON.stringify(searchData).slice(0, 400)}`);
    const discoveryMatches = searchData.matches ?? [];
    console.log(`[rag-chat] Discovery matches: ${discoveryMatches.length}`);

    if (discoveryMatches.length === 0) {
      return new Response(
        JSON.stringify({
          answer: 'No encontré información relevante en los documentos indexados.',
          sources: [],
          is_about_bistro: false,
        }),
        { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // ── Etapa 2: expansión — recuperar TODOS los chunks de cada documento top ──
    const topSources: string[] = [];
    const seenSources = new Set<string>();
    for (const m of discoveryMatches) {
      const source = m.metadata?.source as string | undefined;
      if (source && !seenSources.has(source) && (m.score ?? 0) >= MIN_EXPAND_SCORE) {
        seenSources.add(source);
        topSources.push(source);
        if (topSources.length >= MAX_EXPAND_DOCS) break;
      }
    }

    let matches: any[];
    if (topSources.length > 0) {
      console.log(`[rag-chat] Expandiendo documentos: ${topSources.join(', ')}`);
      const expansions = await Promise.all(topSources.map(async (source) => {
        const res = await fetch(`https://${pineconeHost}/query`, {
          method: 'POST',
          headers: {
            'Api-Key': PINECONE_API_KEY,
            'Content-Type': 'application/json',
            'X-Pinecone-API-Version': '2024-07',
          },
          body: JSON.stringify({
            vector: queryVector,
            topK: EXPAND_TOP_K,
            filter: { source: { '$eq': source } },
            includeMetadata: true,
          }),
        });
        const data = await res.json();
        const chunks = data.matches ?? [];
        console.log(`[rag-chat] "${source}": ${chunks.length} chunks totales recuperados`);
        return chunks;
      }));
      matches = expansions.flat();
    } else {
      console.log(`[rag-chat] Score bajo en todos los matches — usando discovery como fallback`);
      matches = discoveryMatches;
    }

    // Ordenar: relevancia del primer match por source (discovery), luego page ascendente
    // para reconstruir el flujo del documento de inicio a fin.
    const sourceOrder = new Map<string, number>();
    discoveryMatches.forEach((m: any, i: number) => {
      if (!sourceOrder.has(m.metadata.source)) sourceOrder.set(m.metadata.source, i);
    });
    const sortedMatches = [...matches].sort((a: any, b: any) => {
      const aOrder = sourceOrder.get(a.metadata.source) ?? 999;
      const bOrder = sourceOrder.get(b.metadata.source) ?? 999;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (a.metadata.page ?? 0) - (b.metadata.page ?? 0);
    });

    const contextBlocks = sortedMatches.map((m: any, i: number) => {
      const meta = m.metadata;
      const location = meta.source_type === 'markdown' && meta.section
        ? `Sección: ${meta.section}`
        : `Página: ${meta.page}`;
      return `[Fuente ${i + 1} | Archivo: ${meta.source} | ${location}]\n${meta.text}`;
    });
    const contextText = contextBlocks.join('\n\n---\n\n');

    const chatHistory = history.map((msg: any) => ({ role: msg.role, parts: [{ text: msg.content }] }));

    const systemPrompt = `Eres el Asistente IA de Bistro POS, experto en el sistema y sus funcionalidades.

Responde de forma didáctica y clara basándote ÚNICAMENTE en el CONTEXTO RECUPERADO.

REGLAS DE CONTENIDO:
1. Analiza los fragmentos y redacta una respuesta coherente y directa.
2. Tono didáctico, claro, como si explicaras a un operador de tienda sin conocimientos técnicos.
3. Si el contexto no contiene la respuesta, di: "No tengo información específica sobre eso en los documentos actuales".

REGLAS DE FORMATO (OBLIGATORIAS):
4. Usa markdown para estructurar la respuesta.
5. **MULTIMEDIA — REGLA #1, PRIORIDAD ABSOLUTA SOBRE TODO LO DEMÁS:** Cuando el contexto contenga líneas con 🎬 o 📸 seguidas de una URL entre backticks, **INCLÚYELAS SIEMPRE Y COLÓCALAS ANTES del texto explicativo del paso o sección al que pertenecen**. Cópialas exactamente en este formato:
> 🎬 **Video:** \`https://res.cloudinary.com/ejemplo/video.mp4\`
> 📸 **Imagen:** \`https://res.cloudinary.com/ejemplo/imagen.png\`
La app las convierte en reproductores de video e imágenes incrustados — son la parte más valiosa de la respuesta para el usuario. NUNCA las omitas. NUNCA las conviertas en links \`[texto](url)\`. NUNCA quites los backticks. NUNCA las muevas al final. Si hay varios multimedia en el contexto, inclúyelos TODOS, cada uno antes del texto del paso al que pertenece. **CADA URL de video/imagen es ÚNICA y representa un paso distinto: si el contexto tiene 3 líneas de video con URLs diferentes, tu respuesta DEBE tener esas 3 líneas de video, una por paso. PROHIBIDO deduplicar, resumir o descartar un video porque ya incluiste otro parecido, o porque los pasos están cerca, o porque hay un bloque de código (\`\`\`) justo al lado.** Antes de terminar, cuenta cuántas URLs de 🎬/📸 hay en el contexto y verifica que ese MISMO número aparezca en tu respuesta. Un video que va justo después de un bloque de código debe quedar FUERA del bloque (después de cerrar \`\`\`), en su propia línea de blockquote.
6. **PRESERVACIÓN DE MOCKUPS VISUALES:** Si el contexto contiene bloques de código con triple backtick (\`\`\`) que representan mockups visuales de la UI (cajas con ┌ ┐ └ ┘ ─ │, botones \`[ Texto ]\`, dropdowns \`[ Opción ▾ ]\`, formularios, cards), **CÓPIALOS TAL CUAL EN TU RESPUESTA, SIN MODIFICAR NI UNA SOLA LÍNEA**. NO los parafrasees, NO los conviertas en listas, NO los describas con palabras. Son representaciones visuales de la pantalla y deben verse igual en la respuesta.
7. Para código inline que representa botones o campos (\`[ Crear ]\`, \`[ Lácteos ▾ ]\`), mántenlo con backticks simples tal cual aparece.
8. Para nombres de botones, pantallas y campos cuando NO están en código, usa negrita: **Guardar**, **Punto de Venta**.
9. Para pasos secuenciales, usa lista numerada con emojis cuando el contexto los tenga (### 1️⃣, ### 2️⃣, etc.) o lista numerada simple si no.
10. Para listas sin orden, usa guión: - ítem
11. Para rutas de navegación, usa flecha en texto: Módulo → Sección → Acción
12. Si hay tablas markdown en el contexto, reprodúcelas tal cual.
13. Para advertencias y tips, usa blockquote con emoji: > 💡 ..., > ⚠️ ..., > 🔒 ..., > 🤖 ...
14. Separa secciones con líneas en blanco.
15. **ENLACES DE DESCARGA Y EXTERNOS (OBLIGATORIO):** Cuando el contexto contenga enlaces markdown \`[texto](url)\` — por ejemplo descargas (.zip, .pdf, .exe) o sitios oficiales (qz.io, etc.) — cópialos SIEMPRE en tu respuesta EXACTAMENTE en formato \`[texto](url)\`, con el mismo texto y la misma URL. NUNCA los conviertas en texto plano, NUNCA muestres solo el nombre del archivo sin su enlace, y NUNCA omitas la URL. Estos enlaces son clickeables y son esenciales para que el usuario descargue lo que necesita. Esta regla NO aplica a las líneas de multimedia 🎬/📸 (esas siguen la regla #5).

ANÁLISIS DE INTENCIÓN (haz esto mentalmente antes de escribir):
- ¿Qué está intentando lograr el usuario? (aprender un concepto / ejecutar un flujo / resolver un error / entender una decisión)
- ¿La respuesta implica pasos que deben hacerse en orden? Si sí: identifica cuáles son prerrequisitos y cuáles son el objetivo final.
- Organiza la respuesta en el orden lógico de ejecución, NO en el orden en que llegaron los fragmentos del contexto. Los prerrequisitos e instalaciones van SIEMPRE antes que los pasos de configuración o uso.
- Si el contexto numera pasos explícitamente (Paso 1, Paso 2...), respétalos aunque lleguen desordenados.

REGLA DE ORO: Prefiere mostrar la UI visualmente (mockup en bloque de código) en lugar de describirla con palabras. Si el contexto trae un mockup, úsalo. Si no lo trae pero la pregunta es sobre un componente UI, puedes crear uno tú siguiendo el mismo estilo: cajas con caracteres de bordes, botones entre corchetes, dropdowns con ▾.

CLASIFICACIÓN DE RELEVANCIA (OBLIGATORIA):
Al FINAL de tu respuesta, en una línea aparte, agrega EXACTAMENTE uno de estos dos marcadores literales:
- <<BISTRO_TOPIC:yes>>  → si la pregunta del usuario trata sobre el uso, funcionalidades, configuración o problemas de la app Bistro POS (incluso si la respuesta específica no está en el contexto).
- <<BISTRO_TOPIC:no>>   → si la pregunta es ajena a Bistro POS (saludos sueltos, charla casual, preguntas generales no relacionadas con el sistema, temas de otra app, recetas, leyes, etc.).
No expliques ni traduzcas el marcador. No lo envuelvas en código. Solo pónlo en una línea final.

SUGERENCIAS (OBLIGATORIAS):
Inmediatamente después del marcador <<BISTRO_TOPIC:...>>, en una línea aparte, escribe:
<<SUGGESTIONS:["pregunta 1","pregunta 2"]>>
2 o 3 preguntas cortas que el contexto pueda responder pero que NO estuvieron en tu respuesta principal. Si no quedan temas útiles: <<SUGGESTIONS:[]>>. Usa JSON estándar con comillas dobles rectas. No uses comillas curvas.

CONTEXTO:
${contextText}`;

    const geminiPayload = JSON.stringify({
      contents: [
        { role: 'user', parts: [{ text: systemPrompt }] },
        { role: 'model', parts: [{ text: 'Entendido. Soy el Asistente IA de Bistro POS y responderé con base en el contexto proporcionado. Cerraré cada respuesta con el marcador <<BISTRO_TOPIC:yes>> o <<BISTRO_TOPIC:no>>.' }] },
        ...chatHistory,
        { role: 'user', parts: [{ text: query }] },
      ],
      generationConfig: {
        thinkingConfig: { thinking_level: 'medium' },
        maxOutputTokens: 8192,
      },
    });

    const SSE_HEADERS = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    };

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (obj: object) =>
          controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

        try {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: geminiPayload }
          );

          if (!geminiRes.ok || !geminiRes.body) {
            const errData = await geminiRes.json().catch(() => ({}));
            throw new Error(`Gemini API error: ${(errData as any).error?.message ?? geminiRes.status}`);
          }

          const reader = geminiRes.body.getReader();
          const dec = new TextDecoder();
          let lineBuffer = '';
          let fullText = '';
          let lastUsageMetadata: any = null;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            lineBuffer += dec.decode(value, { stream: true });
            const lines = lineBuffer.split('\n');
            lineBuffer = lines.pop() ?? '';

            for (const line of lines) {
              if (!line.startsWith('data:')) continue;
              const raw = line.slice(5).trim();
              if (!raw || raw === '[DONE]') continue;

              let parsed: any;
              try { parsed = JSON.parse(raw); } catch { continue; }

              // Capturar usageMetadata del último chunk
              if (parsed.usageMetadata) lastUsageMetadata = parsed.usageMetadata;

              const token: string = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
              if (token) {
                fullText += token;
                send({ t: token });
              }
            }
          }

          // Procesar buffer residual
          if (lineBuffer.startsWith('data:')) {
            try {
              const parsed = JSON.parse(lineBuffer.slice(5).trim());
              if (parsed.usageMetadata) lastUsageMetadata = parsed.usageMetadata;
              const token: string = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
              if (token) fullText += token;
            } catch { /* fragmento incompleto */ }
          }

          // === COST LOGGING (Chat streaming) ===
          if (lastUsageMetadata) {
              const inputTokens = lastUsageMetadata.promptTokenCount || 0;
              const outputTokens = lastUsageMetadata.candidatesTokenCount || 0;
              const thinkingTokens = lastUsageMetadata.thoughtsTokenCount || 0;
              const totalTokens = lastUsageMetadata.totalTokenCount || 0;
              const inputCost = (inputTokens / 1_000_000) * PRICE_INPUT_PER_1M;
              const outputCost = ((outputTokens + thinkingTokens) / 1_000_000) * PRICE_OUTPUT_PER_1M;
              const totalCost = inputCost + outputCost;
              console.log(`[rag-chat] 💰 CHAT COSTO: input=${inputTokens} tok ($${inputCost.toFixed(6)}) | output=${outputTokens} tok + thinking=${thinkingTokens} tok ($${outputCost.toFixed(6)}) | TOTAL: $${totalCost.toFixed(6)} USD | total_tokens=${totalTokens}`);
          }
          // === END COST LOGGING ===

          if (!fullText) throw new Error('Gemini no devolvió texto');

          // Extraer marcadores del texto acumulado completo
          const { answer: answerNoBistro, flag } = extractBistroTopicFlag(fullText);
          const { answer, suggestions } = extractSuggestions(answerNoBistro);
          const maxScorePct = discoveryMatches.reduce(
            (acc: number, m: any) => Math.max(acc, Math.round((m.score ?? 0) * 100)), 0
          );
          const isAboutBistro = flag !== null
            ? flag
            : maxScorePct >= BISTRO_TOPIC_SCORE_FALLBACK;

          if (flag === null) {
            console.log(`[rag-chat] Marcador ausente. Fallback por score: max=${maxScorePct}, threshold=${BISTRO_TOPIC_SCORE_FALLBACK}, isAboutBistro=${isAboutBistro}`);
          }

          // Evento final: versión limpia (sin marcadores) + metadatos
          // El cliente reemplaza el texto acumulado con este answer limpio
          send({ done: true, answer, bistro: isAboutBistro, suggestions });

        } catch (err: any) {
          console.error('[rag-chat] Stream error:', err.message);
          send({ error: err.message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, { headers: SSE_HEADERS });

  } catch (err: any) {
    console.error('[rag-chat] ERROR:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
