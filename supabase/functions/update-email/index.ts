import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'No autorizado' }, 401);

    // Identifica al usuario que llama a partir de SU token. getUser() valida la
    // firma del JWT y NO exige que la sesion siga viva en el servidor, por eso
    // este camino es inmune al error "session_not_found" que rompia el cambio de
    // correo desde el cliente (supabase.auth.updateUser) en el flujo hibrido
    // Firebase + PIN + Google.
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) return json({ error: 'No autorizado' }, 401);

    const body = await req.json().catch(() => ({}));
    const raw = typeof body?.email === 'string' ? body.email : '';
    const email = raw.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Correo invalido' }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Cambio de correo con la API admin: aplica el cambio directo (sin correo de
    // confirmacion) y mantiene sincronizada la identidad del usuario en
    // auth.identities. email_confirm deja el correo listo para usarse de
    // inmediato (login por PIN, recibos, suscripcion, etc.).
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      email,
      email_confirm: true,
    });

    if (updateError) {
      const isDuplicate = /already|registered|exists|duplicate|unique/i.test(updateError.message || '');
      return json(
        { error: isDuplicate ? 'Este correo ya esta registrado en otra cuenta.' : updateError.message },
        isDuplicate ? 409 : 500,
      );
    }

    return json({ success: true });
  } catch (err: any) {
    console.error('update-email error:', err);
    return json({ error: err?.message || 'Error inesperado' }, 400);
  }
});
