import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'https://esm.sh/jose@5';

const FIREBASE_PROJECT_ID = 'sistema-pos-95051';

// JWKS remoto de Google para los tokens de Firebase (securetoken). Se crea una
// sola vez a nivel de módulo para que jose reutilice la caché entre invocaciones:
// jose respeta el Cache-Control de Google y refresca las llaves al expirar.
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};

function normalizePhone(phone: string): string {
  return phone.replace(/^\+/, '');
}

// Verifica CRIPTOGRÁFICAMENTE la firma del JWT de Firebase contra el JWKS de
// Google (RS256) y valida en un solo paso exp/aud/iss; luego exige sub no vacío.
// Lanza si la firma es inválida, el token está expirado o algún claim no cuadra.
async function verifyFirebaseToken(idToken: string) {
  const { payload } = await jwtVerify(idToken, FIREBASE_JWKS, {
    issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
    audience: FIREBASE_PROJECT_ID,
    algorithms: ['RS256'],
  });
  if (typeof payload.sub !== 'string' || payload.sub.trim() === '') {
    throw new Error('Missing sub claim');
  }
  return payload;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { firebaseToken, mode = 'register', pin } = await req.json();
    if (!firebaseToken) {
      return new Response(JSON.stringify({ error: 'Missing firebaseToken' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let payload;
    try {
      payload = await verifyFirebaseToken(firebaseToken);
    } catch (verifyErr: any) {
      // Firma inválida, token expirado o claims incorrectos: se rechaza aquí,
      // ANTES de cualquier búsqueda de usuario o generación de magic link.
      console.error('Firebase token verification failed:', verifyErr?.message || verifyErr);
      return new Response(JSON.stringify({ error: 'invalid_token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawPhone = payload.phone_number as string | undefined;
    if (!rawPhone) {
      return new Response(JSON.stringify({ error: 'No phone number in token' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const phoneNoPlus = normalizePhone(rawPhone);
    console.log('Phone from Firebase:', rawPhone, '-> normalized:', phoneNoPlus);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const users = allUsers?.users || [];

    let user = users.find(u => {
      if (!u.phone) return false;
      const uPhone = normalizePhone(u.phone);
      return uPhone === phoneNoPlus;
    }) || null;

    console.log('User found by phone:', user ? user.id : 'NOT FOUND');

    if (!user) {
      const { data: profileData } = await supabaseAdmin
        .from('profiles')
        .select('id, phone')
        .or(`phone.eq.${rawPhone},phone.eq.${phoneNoPlus},phone.eq.+${phoneNoPlus}`);

      if (profileData && profileData.length > 0) {
        console.log('Found profile with phone:', profileData[0].id);
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(profileData[0].id);
        if (userData?.user) {
          user = userData.user;
        }
      }
    }

    // Modo login: no crear cuenta si no existe; el frontend redirige a registro.
    if (!user && mode === 'login') {
      return new Response(JSON.stringify({ error: 'user_not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let isNewUser = false;

    if (!user) {
      console.log('Creating new user for phone:', rawPhone);
      isNewUser = true;
      const tempEmail = `${phoneNoPlus}@bistro.temp`;

      const { data: newUserData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: tempEmail,
        email_confirm: true,
        phone: rawPhone,
        phone_confirm: true,
        password: pin || undefined,
        user_metadata: {
          phone: rawPhone,
        },
      });

      if (createError) {
        console.error('Error creating user:', createError);
        return new Response(JSON.stringify({ error: 'Error al crear la cuenta: ' + createError.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      user = newUserData.user;
      console.log('New user created:', user.id);

      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    const userEmail = user.email;
    if (!userEmail) {
      const tempEmail = `${phoneNoPlus}@bistro.temp`;
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        email: tempEmail,
        email_confirm: true,
      });
    }

    const finalEmail = user.email || `${phoneNoPlus}@bistro.temp`;

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: finalEmail,
    });

    if (linkError) {
      console.error('Error generating magic link:', linkError);
      throw linkError;
    }

    const tokenHash = linkData?.properties?.hashed_token;
    console.log('Magic link generated, tokenHash:', tokenHash ? 'YES' : 'NO');

    // Limpiar email temporal para usuarios nuevos via SQL directo
    if (isNewUser) {
      console.log('Cleaning temp email for new user:', user.id);
      const { error: sqlError } = await supabaseAdmin.rpc('_clean_temp_email', { user_id: user.id });
      if (sqlError) {
        console.log('RPC clean failed, trying direct SQL...');
        // Fallback: no critical, el email se puede limpiar despues
      }
    }

    return new Response(JSON.stringify({
      success: true,
      user_id: user.id,
      hashed_token: tokenHash,
      is_new_user: isNewUser,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
