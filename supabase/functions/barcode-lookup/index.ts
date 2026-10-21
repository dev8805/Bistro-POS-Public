import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();

    // PROXY DE IMAGEN (Acción especial para bypass de CORS)
    if (body.action === 'fetch_image' && body.imageUrl) {
        const imageRes = await fetch(body.imageUrl);
        if (!imageRes.ok) throw new Error('Error al descargar la imagen remota');
        
        const headers = new Headers(imageRes.headers);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
        // Borrar cabeceras restrictivas
        headers.delete('content-security-policy');
        headers.delete('x-frame-options');
        
        return new Response(imageRes.body, {
            status: 200,
            headers: headers
        });
    }

    // BUSQUEDA DE CODIGO CON ROTACION DE LLAVES
    const { barcode, apiKeys } = body;
    if (!barcode || !apiKeys || !Array.isArray(apiKeys) || apiKeys.length === 0) {
      return new Response(JSON.stringify({ error: 'barcode and apiKeys array are required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    let lastStatus = 500;
    
    for (const key of apiKeys) {
        const url = `https://go-upc.com/api/v1/code/${barcode}`;
        const response = await fetch(url, {
             headers: {
                 'Authorization': `Bearer ${key}`,
                 'Accept': 'application/json',
             }
        });
        
        if (response.ok) {
            const data = await response.json();
            return new Response(JSON.stringify(data), { 
                status: 200, 
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
            });
        }
        
        lastStatus = response.status;
        
        if (response.status === 404) {
            // El producto no existe con ninguna llave, detener búsqueda.
            return new Response(JSON.stringify({ error: 'not_found' }), { 
                status: 404, 
                headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } 
            });
        }
        
        if (response.status === 429) {
            // Cuota agotada en esta llave, intentar con la siguiente
            continue;
        }
        
        // Error de upstream distinto a cuota o no-encontrado
        break;
    }

    if (lastStatus === 429) {
      return new Response(JSON.stringify({ error: 'quota_exceeded_all_keys' }), {
        status: 429,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `upstream_error_${lastStatus}` }), {
        status: lastStatus,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: 'internal_error', detail: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});