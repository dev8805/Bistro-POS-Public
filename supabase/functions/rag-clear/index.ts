import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'jsr:@supabase/supabase-js@2';

const PINECONE_API_KEY = Deno.env.get('PINECONE_API_KEY')!;
const PINECONE_INDEX_NAME = Deno.env.get('PINECONE_INDEX_NAME')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function getPineconeHost(): Promise<string> {
  const res = await fetch(`https://api.pinecone.io/indexes/${PINECONE_INDEX_NAME}`, {
    headers: { 'Api-Key': PINECONE_API_KEY, 'X-Pinecone-API-Version': '2024-07' },
  });
  const data = await res.json();
  if (!data.host) throw new Error(`No se pudo obtener el host de Pinecone: ${JSON.stringify(data)}`);
  return data.host;
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

  try {
    const pineconeHost = await getPineconeHost();

    // 1. Borrar todos los vectores de Pinecone
    const deleteRes = await fetch(`https://${pineconeHost}/vectors/delete`, {
      method: 'POST',
      headers: {
        'Api-Key': PINECONE_API_KEY,
        'Content-Type': 'application/json',
        'X-Pinecone-API-Version': '2024-07',
      },
      body: JSON.stringify({ deleteAll: true }),
    });
    console.log('Pinecone delete:', await deleteRes.text());

    // 2. Listar y borrar archivos del bucket rag-documents
    const { data: files } = await supabase.storage.from('rag-documents').list();
    if (files && files.length > 0) {
      const paths = files.map((f: any) => f.name);
      await supabase.storage.from('rag-documents').remove(paths);
    }

    // 3. Borrar todos los registros de rag_documents
    await supabase.from('rag_documents').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    return new Response(
      JSON.stringify({ message: 'Base de conocimiento vaciada correctamente.' }),
      { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
