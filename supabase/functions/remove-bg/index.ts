import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const PIXIAN_API_ID = Deno.env.get('PIXIAN_API_ID') ?? '';
const PIXIAN_API_SECRET = Deno.env.get('PIXIAN_API_SECRET') ?? '';

// TEST MODE: set to false when ready for production
const TEST_MODE = false;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  try {
    const contentType = req.headers.get('content-type') ?? '';

    if (!contentType.includes('multipart/form-data')) {
      return new Response(JSON.stringify({ error: 'Expected multipart/form-data' }), { status: 400 });
    }

    const formData = await req.formData();
    const imageFile = formData.get('image') as File | null;

    if (!imageFile) {
      return new Response(JSON.stringify({ error: 'Missing image field' }), { status: 400 });
    }

    const pixianForm = new FormData();
    pixianForm.append('image', imageFile);
    pixianForm.append('max_pixels', '640000');
    if (TEST_MODE) {
      pixianForm.append('test', 'true');
    }

    const credentials = btoa(`${PIXIAN_API_ID}:${PIXIAN_API_SECRET}`);

    const pixianRes = await fetch('https://api.pixian.ai/api/v2/remove-background', {
      method: 'POST',
      headers: { 'Authorization': `Basic ${credentials}` },
      body: pixianForm,
    });

    if (!pixianRes.ok) {
      const errText = await pixianRes.text();
      console.error('[remove-bg] Pixian error:', pixianRes.status, errText);
      return new Response(
        JSON.stringify({ error: `Pixian error: ${pixianRes.status}`, detail: errText }),
        { status: pixianRes.status, headers: { 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const resultBuffer = await pixianRes.arrayBuffer();

    return new Response(resultBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Access-Control-Allow-Origin': '*',
        'X-Pixian-Mode': TEST_MODE ? 'test' : 'production',
      },
    });

  } catch (err) {
    console.error('[remove-bg] Unexpected error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
});
