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
const CHAT_MODEL = 'gemini-3.1-flash-lite';
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;
const MARKDOWN_CHUNK_OVERLAP = 250;
const BATCH_SIZE = 50;
const RATE_DELAY_MS = 1500;

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let cachedHost: string | null = null;
async function getPineconeHost(): Promise<string> {
  if (cachedHost) return cachedHost;
  const res = await fetch(`https://api.pinecone.io/indexes/${PINECONE_INDEX_NAME}`, {
    headers: { 'Api-Key': PINECONE_API_KEY, 'X-Pinecone-API-Version': '2024-07' },
  });
  const data = await res.json();
  if (!data.host) throw new Error(`Pinecone host error: ${JSON.stringify(data)}`);
  cachedHost = data.host;
  return data.host;
}

// Pinecone solo acepta string, number, boolean o array de strings — nunca null/undefined
function cleanMeta(meta: Record<string, any>): Record<string, any> {
  return Object.fromEntries(
    Object.entries(meta).filter(([_, v]) => v !== null && v !== undefined)
  );
}

function chunkText(text: string): string[] {
  // Iteramos por code points (Array.from) en vez de unidades UTF-16 para no
  // partir pares surrogate (emojis 🔴, 🟢, etc.) en el medio, lo que generaria
  // un lone surrogate que Pinecone rechaza como "Invalid unicode code point".
  const chars = Array.from(text);
  const chunks: string[] = [];
  let start = 0;
  while (start < chars.length) {
    const end = Math.min(start + CHUNK_SIZE, chars.length);
    const chunk = chars.slice(start, end).join('').trim();
    if (chunk.length > 50) chunks.push(chunk);
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

// Igual que chunkText pero con overlap configurable — para secciones markdown
function chunkTextWithOverlap(text: string, overlap: number): string[] {
  const chars = Array.from(text);
  const chunks: string[] = [];
  let start = 0;
  while (start < chars.length) {
    const end = Math.min(start + CHUNK_SIZE, chars.length);
    const chunk = chars.slice(start, end).join('').trim();
    if (chunk.length > 50) chunks.push(chunk);
    start += CHUNK_SIZE - overlap;
  }
  return chunks;
}

interface MarkdownSection {
  heading: string;
  breadcrumb: string;
  text: string;
  level: number;
}

// Divide el markdown por headings H1-H3 preservando la jerarquía en el breadcrumb.
// El heading se incluye como primera línea del texto de la sección para que el
// embedding capture el tema además del contenido.
function parseMarkdownSections(text: string): MarkdownSection[] {
  const lines = text.split('\n');
  const sections: MarkdownSection[] = [];
  const headingStack: { level: number; text: string }[] = [];
  let currentHeading = '';
  let currentLevel = 0;
  let currentLines: string[] = [];

  const flush = () => {
    const body = currentLines.join('\n').trim();
    if (body.length > 30) {
      const breadcrumb = headingStack.map(h => h.text).join(' > ') || currentHeading || 'General';
      sections.push({ heading: currentHeading || 'General', breadcrumb, text: body, level: currentLevel });
    }
    currentLines = [];
  };

  for (const line of lines) {
    const m = line.match(/^(#{1,3})\s+(.+)/);
    if (m) {
      flush();
      const level = m[1].length;
      const headingText = m[2].trim();
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, text: headingText });
      currentHeading = headingText;
      currentLevel = level;
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }
  flush();

  if (sections.length === 0 && text.trim().length > 30) {
    sections.push({ heading: 'General', breadcrumb: 'General', text: text.trim(), level: 0 });
  }

  return sections;
}

function makeId(source: string, page: number, chunkIndex: number): string {
  const str = `${source}::${page}::${chunkIndex}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return `${Math.abs(hash).toString(16)}_${Date.now()}`;
}

// Contextual Retrieval (Anthropic): genera 2-3 oraciones de contexto para un chunk
// dentro del documento completo. El resultado se antepone al chunk antes de embeddear,
// lo que mejora dramáticamente la recuperación cuando la query es ambigua.
async function generateChunkContext(fullDocText: string, chunk: string, docName: string): Promise<string> {
  try {
    const prompt = `Documento: "${docName}"

<documento>
${fullDocText.slice(0, 6000)}
</documento>

<fragmento>
${chunk.slice(0, 800)}
</fragmento>

Genera 2-3 oraciones breves que expliquen de qué trata este fragmento dentro del documento. Solo las oraciones, sin introducción ni conclusión.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${CHAT_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            thinkingConfig: { thinking_level: 'low' },
            maxOutputTokens: 120,
          },
        }),
      }
    );
    const data = await res.json();
    const context = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
    if (context) console.log(`[rag-index] Contexto: "${context.slice(0, 80)}..."`);
    return context;
  } catch (e: any) {
    console.warn(`[rag-index] generateChunkContext falló: ${e.message}`);
    return '';
  }
}

let embeddingDimsLogged = false;
async function batchEmbedWithRetry(texts: string[], retries = 5): Promise<number[][]> {
  if (texts.length === 0) return [];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${GEMINI_API_KEY}`;
  const requests = texts.map(text => ({
    model: `models/${EMBED_MODEL}`,
    content: { parts: [{ text }] },
    taskType: 'RETRIEVAL_DOCUMENT',
  }));

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
      });

      if (!res.ok) {
        const errText = await res.text();
        if ((res.status === 429 || errText.includes('429')) && i < retries - 1) {
          const wait = Math.pow(2, i + 1) * 1000;
          console.warn(`[rag-index] Rate limit en batch embed, esperando ${wait / 1000}s...`);
          await sleep(wait);
          continue;
        }
        throw new Error(`Google Embeddings API HTTP ${res.status}: ${errText}`);
      }

      const data = await res.json();
      const embeddings = data.embeddings;
      if (!embeddings || !Array.isArray(embeddings)) {
        throw new Error(`Respuesta inválida de embeddings: ${JSON.stringify(data)}`);
      }

      if (embeddings.length !== texts.length) {
        throw new Error(`Discrepancia en batch embed: enviados ${texts.length}, recibidos ${embeddings.length}`);
      }

      if (!embeddingDimsLogged && embeddings[0]?.values) {
        console.log(`[rag-index] Embedding dims: ${embeddings[0].values.length} (modelo: ${EMBED_MODEL}, lote: ${embeddings.length})`);
        embeddingDimsLogged = true;
      }

      return embeddings.map((e: any) => e.values);
    } catch (err: any) {
      if (i === retries - 1) throw err;
      const wait = Math.pow(2, i + 1) * 1000;
      console.warn(`[rag-index] Reintento batch embed (${i + 1}/${retries}): ${err.message}`);
      await sleep(wait);
    }
  }
  throw new Error('batch embed failed after retries');
}

async function embedWithRetry(text: string, retries = 5): Promise<number[]> {
  const [vec] = await batchEmbedWithRetry([text], retries);
  return vec;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function extractTextFromPdf(pdfBytes: Uint8Array): Promise<Array<{ text: string; page: number; totalPages: number }>> {
  const base64 = uint8ToBase64(pdfBytes);

  const res = await ai.models.generateContent({
    model: CHAT_MODEL,
    contents: [{
      role: 'user',
      parts: [
        { text: 'Extrae TODO el texto de este PDF pagina por pagina. Para cada pagina usa el formato exacto:\n[PAGINA N]\n<texto>\n\nNo omitas nada. Si una pagina no tiene texto legible, escribe [PAGINA N]\n(sin contenido).' },
        { inlineData: { mimeType: 'application/pdf', data: base64 } },
      ],
    }],
  });

  const rawText: string = (res as any).candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  console.log(`[rag-index] PDF texto extraido: ${rawText.length} chars`);

  const pages: Array<{ text: string; page: number; totalPages: number }> = [];
  const blocks = rawText.split(/\[PAGINA\s+(\d+)\]/i);

  for (let i = 1; i < blocks.length; i += 2) {
    const pageNum = parseInt(blocks[i]);
    const pageText = (blocks[i + 1] ?? '').trim();
    if (pageText.length > 30 && !pageText.startsWith('(sin contenido)')) {
      pages.push({ text: pageText, page: pageNum, totalPages: Math.ceil((blocks.length - 1) / 2) });
    }
  }

  if (pages.length === 0 && rawText.length > 30) {
    pages.push({ text: rawText, page: 1, totalPages: 1 });
  }

  return pages;
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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let docId = '';

  try {
    const body = await req.json();
    docId = body.docId ?? '';
    if (!docId) return new Response(JSON.stringify({ error: 'docId requerido' }), { status: 400 });

    console.log(`[rag-index] Iniciando para docId: ${docId}`);

    const { data: doc, error: docErr } = await supabase
      .from('rag_documents').select('*').eq('id', docId).single();
    if (docErr || !doc) return new Response(JSON.stringify({ error: 'Documento no encontrado' }), { status: 404 });

    await supabase.from('rag_documents').update({ status: 'pending' }).eq('id', docId);

    const pineconeHost = await getPineconeHost();
    const allVectors: any[] = [];

    // ---------- PDF ----------
    if (doc.source_type === 'pdf' && doc.storage_path) {
      console.log(`[rag-index] Descargando PDF: ${doc.storage_path}`);
      const { data: fileData, error: fileErr } = await supabase.storage
        .from('rag-documents').download(doc.storage_path);
      if (fileErr || !fileData) throw new Error(`No se pudo descargar: ${fileErr?.message}`);

      const pdfBytes = new Uint8Array(await fileData.arrayBuffer());
      console.log(`[rag-index] PDF descargado: ${pdfBytes.length} bytes`);

      const pages = await extractTextFromPdf(pdfBytes);
      console.log(`[rag-index] Paginas extraidas: ${pages.length}`);

      if (pages.length > 0) {
        await supabase.from('rag_documents')
          .update({ page_count: pages[pages.length - 1].totalPages }).eq('id', docId);
      }

      const fullPdfText = pages.map(p => p.text).join('\n\n');

      for (const pg of pages) {
        const chunks = chunkText(pg.text);
        for (let ci = 0; ci < chunks.length; ci++) {
          const context = await generateChunkContext(fullPdfText, chunks[ci], doc.name);
          await sleep(500);
          const embedText = context ? `${context}\n\n${chunks[ci]}` : chunks[ci];
          allVectors.push({
            id: makeId(doc.name, pg.page, ci),
            text: chunks[ci],
            embedText,
            metadata: {
              source: doc.name,
              source_type: 'pdf',
              page: pg.page,
              totalPages: pg.totalPages,
              storage_path: doc.storage_path,
            },
          });
        }
      }

    // ---------- MARKDOWN / TEXTO ----------
    } else if (doc.source_type === 'markdown' && doc.storage_path) {
      console.log(`[rag-index] Descargando markdown: ${doc.storage_path}`);
      const { data: fileData, error: fileErr } = await supabase.storage
        .from('rag-documents').download(doc.storage_path);
      if (fileErr || !fileData) throw new Error(`No se pudo descargar: ${fileErr?.message}`);

      const text = (await fileData.text()).trim();
      console.log(`[rag-index] Markdown leido: ${text.length} chars`);
      if (text.length < 30) throw new Error('El archivo de texto esta vacio o es demasiado corto');

      const sections = parseMarkdownSections(text);
      const totalSections = sections.length;
      console.log(`[rag-index] Secciones detectadas: ${totalSections}`);

      for (let si = 0; si < sections.length; si++) {
        const section = sections[si];
        const prefix = `[${section.breadcrumb}]\n`;
        const chunks = chunkTextWithOverlap(section.text, MARKDOWN_CHUNK_OVERLAP);
        for (let ci = 0; ci < chunks.length; ci++) {
          const rawChunk = (prefix + chunks[ci]).trim();
          allVectors.push({
            id: makeId(doc.name, si + 1, ci),
            text: rawChunk,
            embedText: rawChunk,
            metadata: {
              source: doc.name,
              source_type: 'markdown',
              page: si + 1,
              totalPages: totalSections,
              section: section.breadcrumb,
              storage_path: doc.storage_path,
            },
          });
        }
      }

    // ---------- VIDEO ----------
    } else if (doc.source_type === 'video' && doc.external_url) {
      const descRes = await ai.models.generateContent({
        model: CHAT_MODEL,
        contents: [{ role: 'user', parts: [{ text: `Genera una descripcion educativa y detallada del contenido de este video sobre Bistro POS. URL: ${doc.external_url}. Nombre: ${doc.name}. Describe todo lo que ensenaria este video.` }] }],
      });
      const description = (descRes as any).candidates?.[0]?.content?.parts?.[0]?.text ?? doc.name;
      const chunks = chunkText(description);
      for (let ci = 0; ci < chunks.length; ci++) {
        allVectors.push({
          id: makeId(doc.name, 1, ci),
          text: chunks[ci],
          metadata: {
            source: doc.name,
            source_type: 'video',
            page: 1,
            totalPages: 1,
            video_url: doc.external_url,
            timestamp_start: 0,
            ...(doc.thumbnail_url ? { thumbnail_url: doc.thumbnail_url } : {}),
          },
        });
      }

    // ---------- GIF / IMAGEN ----------
    } else if ((doc.source_type === 'gif' || doc.source_type === 'image') && doc.external_url) {
      const visionRes = await ai.models.generateContent({
        model: CHAT_MODEL,
        contents: [{ role: 'user', parts: [
          { text: 'Describe en detalle el contenido de esta imagen/GIF. Si hay texto, transcribelo. Si es una UI, explica cada elemento visible.' },
          { fileData: { mimeType: 'image/gif', fileUri: doc.external_url } },
        ]}],
      });
      const description = (visionRes as any).candidates?.[0]?.content?.parts?.[0]?.text ?? doc.name;
      const chunks = chunkText(description);
      for (let ci = 0; ci < chunks.length; ci++) {
        allVectors.push({
          id: makeId(doc.name, 1, ci),
          text: chunks[ci],
          metadata: {
            source: doc.name,
            source_type: doc.source_type,
            page: 1,
            totalPages: 1,
            gif_url: doc.external_url,
          },
        });
      }
    }

    console.log(`[rag-index] Total vectores a indexar: ${allVectors.length}`);
    if (allVectors.length === 0) throw new Error('No se extrajo texto del documento');

    // ---------- Upsert a Pinecone ----------
    let totalUpserted = 0;
    for (let b = 0; b < allVectors.length; b += BATCH_SIZE) {
      const batch = allVectors.slice(b, b + BATCH_SIZE);
      const textsToEmbed = batch.map(v => v.embedText ?? v.text);
      const embeddings = await batchEmbedWithRetry(textsToEmbed);

      const vectors = batch.map((v, i) => ({
        id: v.id,
        values: embeddings[i],
        metadata: cleanMeta({ ...v.metadata, text: v.text }),
      }));

      const upsertRes = await fetch(`https://${pineconeHost}/vectors/upsert`, {
        method: 'POST',
        headers: {
          'Api-Key': PINECONE_API_KEY,
          'Content-Type': 'application/json',
          'X-Pinecone-API-Version': '2024-07',
        },
        body: JSON.stringify({ vectors }),
      });

      if (!upsertRes.ok) {
        const errText = await upsertRes.text();
        throw new Error(`Pinecone upsert HTTP ${upsertRes.status}: ${errText}`);
      }

      const upsertData = await upsertRes.json();
      if (!upsertData.upsertedCount || upsertData.upsertedCount === 0) {
        throw new Error(`Pinecone upsert: 0 vectores insertados. Response: ${JSON.stringify(upsertData)}`);
      }

      totalUpserted += upsertData.upsertedCount;
      console.log(`[rag-index] Batch ${Math.floor(b / BATCH_SIZE) + 1}: ${upsertData.upsertedCount} vectores -> Pinecone (total: ${totalUpserted})`);
      if (b + BATCH_SIZE < allVectors.length) {
        await sleep(RATE_DELAY_MS);
      }
    }

    await supabase.from('rag_documents').update({
      status: 'indexed',
      indexed_at: new Date().toISOString(),
    }).eq('id', docId);

    console.log(`[rag-index] EXITO: ${totalUpserted} vectores indexados en Pinecone`);

    return new Response(
      JSON.stringify({ success: true, chunksIndexed: totalUpserted }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );

  } catch (err: any) {
    console.error('[rag-index] ERROR FATAL:', err.message);
    if (docId) {
      await supabase.from('rag_documents').update({ status: 'error' }).eq('id', docId);
    }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
