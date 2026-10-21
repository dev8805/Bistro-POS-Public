import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const PINECONE_API_KEY = Deno.env.get('PINECONE_API_KEY')!;
const PINECONE_INDEX_NAME = Deno.env.get('PINECONE_INDEX_NAME')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getPineconeHost(): Promise<string> {
  const res = await fetch(`https://api.pinecone.io/indexes/${PINECONE_INDEX_NAME}`, {
    headers: { 'Api-Key': PINECONE_API_KEY, 'X-Pinecone-API-Version': '2024-07' },
  });
  const data = await res.json();
  if (!data.host) throw new Error(`Pinecone host error: ${JSON.stringify(data)}`);
  return data.host;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { docId } = await req.json();
    if (!docId) {
      return new Response(JSON.stringify({ error: 'docId requerido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    const { data: doc, error: docErr } = await supabase
      .from('rag_documents').select('*').eq('id', docId).single();
    if (docErr || !doc) {
      return new Response(JSON.stringify({ error: 'Documento no encontrado' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    console.log(`[rag-delete] Eliminando doc "${doc.name}" (${doc.status})`);

    // Eliminar chunks de Pinecone por filtro de metadata (solo si fue indexado)
    if (doc.status === 'indexed') {
      try {
        const pineconeHost = await getPineconeHost();
        const deleteRes = await fetch(`https://${pineconeHost}/vectors/delete`, {
          method: 'POST',
          headers: {
            'Api-Key': PINECONE_API_KEY,
            'Content-Type': 'application/json',
            'X-Pinecone-API-Version': '2024-07',
          },
          body: JSON.stringify({ filter: { source: { '$eq': doc.name } } }),
        });
        const deleteText = await deleteRes.text();
        console.log(`[rag-delete] Pinecone filter delete (status ${deleteRes.status}):`, deleteText);
      } catch (pineconeErr: any) {
        // No bloquear la eliminación del documento si Pinecone falla
        console.error('[rag-delete] Pinecone delete error (continuando):', pineconeErr.message);
      }
    }

    // Eliminar archivo de Storage (PDFs e imágenes subidas)
    if (doc.storage_path) {
      const { error: storageErr } = await supabase.storage
        .from('rag-documents').remove([doc.storage_path]);
      if (storageErr) console.error('[rag-delete] Storage remove error:', storageErr.message);
    }

    // Eliminar registro de BD
    const { error: dbErr } = await supabase.from('rag_documents').delete().eq('id', docId);
    if (dbErr) throw new Error(`DB delete error: ${dbErr.message}`);

    console.log(`[rag-delete] Documento "${doc.name}" eliminado correctamente`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
  } catch (err: any) {
    console.error('[rag-delete] ERROR:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
});
