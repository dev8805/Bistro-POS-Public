import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Inicio de período de prueba SERVER-SIDE (Req 4, Paso A.2).
//
// Reemplaza el camino del cliente (`handleStartTrial` en SubscriptionPlansScreen),
// que hoy hace un upsert directo en `business_subscriptions` con status='trial'.
// Esta función replica EXACTAMENTE la misma semántica (campos, duración y fechas)
// pero validando en el servidor: sesión, que el llamante es admin del negocio,
// que el negocio no usó el trial y que el plan es elegible. La escritura se hace
// con `service_role`.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ success: false, error: 'No autorizado' }, 401);
    }

    // 1. Identificar al usuario que llama a partir de SU sesión (no del body)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return json({ success: false, error: 'No autorizado' }, 401);
    }

    const body = await req.json().catch(() => null);
    const businessId = body?.businessId;
    const planId = body?.planId;

    if (typeof businessId !== 'string' || !UUID_RE.test(businessId) ||
        typeof planId !== 'string' || !UUID_RE.test(planId)) {
      return json({ success: false, error: 'businessId y planId son requeridos' }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 2. Perfil real del llamante (rol y permisos efectivos desde la BD)
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, business_id, role, is_active, is_deleted, custom_permissions, roles:role_id(permissions)')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('[start-trial] Error leyendo perfil:', profileError);
      return json({ success: false, error: 'No se pudo validar el usuario' }, 500);
    }
    if (!profile || profile.is_deleted || profile.is_active === false) {
      return json({ success: false, error: 'Usuario no habilitado' }, 403);
    }

    // 3. Tenant: el negocio del body debe ser el del usuario autenticado
    if (profile.business_id !== businessId) {
      return json({ success: false, error: 'No autorizado para este negocio' }, 403);
    }

    // 4. Admin del negocio: dueño, rol Administrador o permiso de administración.
    //    Los permisos efectivos son { ...rol, ...custom } igual que en AuthContext.
    const rolePerms = (profile as any).roles?.permissions ?? {};
    const customPerms = (profile as any).custom_permissions ?? {};
    const perms: Record<string, boolean> = { ...rolePerms, ...customPerms };

    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('id, owner_id')
      .eq('id', businessId)
      .maybeSingle();

    const isAdmin =
      business?.owner_id === user.id ||
      profile.role === 'Administrador' ||
      perms.admin_settings === true ||
      perms.admin_users === true;

    if (!isAdmin) {
      return json({ success: false, error: 'Requiere permisos de administrador del negocio' }, 403);
    }

    // 5. Plan elegible para trial: activo, con duración de prueba y, si es
    //    personalizado, asignado a este mismo negocio.
    const { data: plan, error: planError } = await supabaseAdmin
      .from('subscription_plans')
      .select('id, name, trial_duration, trial_interval, is_active, assigned_business_id')
      .eq('id', planId)
      .maybeSingle();

    if (planError) {
      console.error('[start-trial] Error leyendo plan:', planError);
      return json({ success: false, error: 'No se pudo validar el plan' }, 500);
    }
    if (!plan || plan.is_active !== true) {
      return json({ success: false, error: 'Plan no disponible' }, 404);
    }
    if (plan.assigned_business_id && plan.assigned_business_id !== businessId) {
      return json({ success: false, error: 'Plan no disponible' }, 404);
    }
    if (!plan.trial_duration || plan.trial_duration <= 0) {
      return json({ success: false, error: 'Este plan no ofrece período de prueba' }, 400);
    }

    // 6. Anti-abuso: el negocio no debe tener suscripción previa. Es el mismo
    //    criterio que usa hoy el cliente (`hasUsedTrial = existe fila`), así que
    //    quien puede iniciar trial hoy sigue pudiendo, y quien ya lo usó no.
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('business_subscriptions')
      .select('id, status')
      .eq('business_id', businessId)
      .maybeSingle();

    if (existingError) {
      console.error('[start-trial] Error leyendo suscripción:', existingError);
      return json({ success: false, error: 'No se pudo validar la suscripción' }, 500);
    }
    if (existing) {
      return json({ success: false, error: 'Este negocio ya usó su período de prueba' }, 409);
    }

    // 7. Misma aritmética de fechas que `handleStartTrial` en el cliente
    const startDate = new Date();
    const trialEndDate = new Date(startDate);

    if (plan.trial_interval === 'minute') {
      trialEndDate.setMinutes(startDate.getMinutes() + (plan.trial_duration || 15));
    } else {
      trialEndDate.setDate(startDate.getDate() + (plan.trial_duration || 15));
    }

    const { data: subscription, error: insertError } = await supabaseAdmin
      .from('business_subscriptions')
      .insert({
        business_id: businessId,
        plan_id: plan.id,
        status: 'trial',
        current_period_start: startDate.toISOString(),
        current_period_end: trialEndDate.toISOString(),
        next_billing_date: trialEndDate.toISOString().split('T')[0],
      })
      .select('id, business_id, plan_id, status, current_period_start, current_period_end, next_billing_date')
      .single();

    if (insertError) {
      // 23505 = violación de UNIQUE(business_id): otra request ganó la carrera.
      if ((insertError as any).code === '23505') {
        return json({ success: false, error: 'Este negocio ya usó su período de prueba' }, 409);
      }
      console.error('[start-trial] Error creando trial:', insertError);
      return json({ success: false, error: 'No se pudo iniciar el período de prueba' }, 500);
    }

    return json({ success: true, subscription });

  } catch (err: any) {
    console.error('[start-trial] Error inesperado:', err);
    return json({ success: false, error: 'Error al iniciar el período de prueba' }, 500);
  }
});
