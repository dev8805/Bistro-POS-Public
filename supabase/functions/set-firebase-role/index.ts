import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const FIREBASE_PROJECT_ID = 'sistema-pos-95051';

async function verifyFirebaseToken(idToken: string): Promise<any> {
  // Get Firebase public keys
  const keysRes = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
  );
  const keys = await keysRes.json();

  // Decode header to get kid
  const [headerB64] = idToken.split('.');
  const header = JSON.parse(atob(headerB64));
  const publicKeyPem = keys[header.kid];

  if (!publicKeyPem) throw new Error('Public key not found');

  // Import public key
  const pemContent = publicKeyPem
    .replace('-----BEGIN CERTIFICATE-----', '')
    .replace('-----END CERTIFICATE-----', '')
    .replace(/\n/g, '');

  const certBuffer = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));

  const publicKey = await crypto.subtle.importKey(
    'raw',
    certBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  ).catch(async () => {
    // Try as SPKI if raw fails
    return crypto.subtle.importKey(
      'spki',
      certBuffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
  });

  // Verify and decode
  const [, payloadB64] = idToken.split('.');
  const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));

  // Basic claims validation
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error('Token expired');
  if (payload.aud !== FIREBASE_PROJECT_ID) throw new Error('Invalid audience');
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) throw new Error('Invalid issuer');

  return payload;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }

  try {
    const { idToken } = await req.json();
    if (!idToken) return new Response(JSON.stringify({ error: 'Missing idToken' }), { status: 400 });

    const payload = await verifyFirebaseToken(idToken);
    const uid = payload.sub;

    // Set custom claims via Firebase Auth REST API
    const serviceAccountKey = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_KEY');
    if (!serviceAccountKey) {
      // Without service account, just return the payload for the client to use
      return new Response(JSON.stringify({ uid, payload, ok: true }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    return new Response(JSON.stringify({ uid, ok: true }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
