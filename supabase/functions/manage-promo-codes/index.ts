declare const Deno: {
    serve: (handler: (req: Request) => Promise<Response>) => void;
    env: {
        get: (key: string) => string | undefined;
    };
};

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const generateCode = (prefix: string): string => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const segment = () => Array.from({length: 4}, () =>
        chars[Math.floor(Math.random() * chars.length)]
    ).join('');
    return `${prefix}-${segment()}-${segment()}`;
};

const createSupabaseAdmin = () => {
    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    return createClient(url, key);
};

const createSupabaseFromAuth = (authHeader: string) => {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    return createClient(url, anonKey, {
        global: { headers: { Authorization: authHeader } }
    });
};

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const url = new URL(req.url);
        const action = url.searchParams.get('action');
        const body = await req.json().catch(() => ({}));
        const supabaseAdmin = createSupabaseAdmin();

        switch (action) {
            // ==========================================
            // ADMIN: Generar código manualmente
            // ==========================================
            case 'generate': {
                const authHeader = req.headers.get('Authorization');
                if (!authHeader) {
                    return new Response(
                        JSON.stringify({ success: false, error: 'No autorizado' }),
                        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                const supabaseAuth = createSupabaseFromAuth(authHeader);
                const { data: { user } } = await supabaseAuth.auth.getUser();
                if (!user) {
                    return new Response(
                        JSON.stringify({ success: false, error: 'No autorizado' }),
                        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                const { data: profile } = await supabaseAdmin
                    .from('profiles')
                    .select('role')
                    .eq('id', user.id)
                    .single();

                if (!profile || profile.role !== 'Administrador') {
                    return new Response(
                        JSON.stringify({ success: false, error: 'Solo administradores pueden generar códigos' }),
                        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                const code = generateCode('BISTRO');
                const { data, error } = await supabaseAdmin
                    .from('promo_codes')
                    .insert({
                        code,
                        type: 'admin',
                        status: 'active',
                        duration_months: body.duration_months || 3,
                        duration_days: body.duration_days || null,
                        price_cop: body.price_cop || 29000,
                        created_by: user.id,
                        notes: body.notes || null
                    })
                    .select()
                    .single();

                if (error) throw error;

                return new Response(
                    JSON.stringify({ success: true, code: data.code, promo: data }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // ==========================================
            // SELF-SERVICE: Crear código pendiente de pago
            // ==========================================
            case 'create-pending': {
                const { buyer_email, buyer_name } = body;

                const code = generateCode('PROMO');
                const { data, error } = await supabaseAdmin
                    .from('promo_codes')
                    .insert({
                        code,
                        type: 'self_service',
                        status: 'pending_payment',
                        duration_months: 3,
                        price_cop: 29000,
                        buyer_email: buyer_email || null,
                        buyer_name: buyer_name || null
                    })
                    .select()
                    .single();

                if (error) throw error;

                return new Response(
                    JSON.stringify({ success: true, code: data.code, id: data.id }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // ==========================================
            // ACTIVATE: Después del pago Wompi exitoso
            // ==========================================
            case 'activate': {
                const { code, wompi_transaction_id, wompi_status } = body;

                if (!code || !wompi_transaction_id) {
                    return new Response(
                        JSON.stringify({ success: false, error: 'Faltan code o wompi_transaction_id' }),
                        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                // Verificar que el código existe y está pending
                const { data: existing } = await supabaseAdmin
                    .from('promo_codes')
                    .select('*')
                    .eq('code', code)
                    .eq('status', 'pending_payment')
                    .single();

                if (!existing) {
                    return new Response(
                        JSON.stringify({ success: false, error: 'Código no encontrado o ya activado' }),
                        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                // Activar con expiración de 24 horas
                const expiresAt = new Date();
                expiresAt.setHours(expiresAt.getHours() + 24);

                const { data, error } = await supabaseAdmin
                    .from('promo_codes')
                    .update({
                        status: 'active',
                        expires_at: expiresAt.toISOString(),
                        wompi_transaction_id,
                        wompi_status: wompi_status || 'APPROVED'
                    })
                    .eq('id', existing.id)
                    .select()
                    .single();

                if (error) throw error;

                return new Response(
                    JSON.stringify({ success: true, code: data.code, expires_at: data.expires_at }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // ==========================================
            // VALIDATE: Verificar código sin redimirlo
            // ==========================================
            case 'validate': {
                const { code } = body;
                if (!code) {
                    return new Response(
                        JSON.stringify({ success: false, error: 'Falta el código' }),
                        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                const { data: promo } = await supabaseAdmin
                    .from('promo_codes')
                    .select('*')
                    .eq('code', code.toUpperCase().trim())
                    .single();

                if (!promo) {
                    return new Response(
                        JSON.stringify({ valid: false, reason: 'Código no encontrado' }),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                if (promo.status === 'used') {
                    return new Response(
                        JSON.stringify({ valid: false, reason: 'Este código ya fue utilizado' }),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                if (promo.status === 'pending_payment') {
                    return new Response(
                        JSON.stringify({ valid: false, reason: 'Este código aún no ha sido pagado' }),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                if (promo.status === 'expired' || (promo.expires_at && new Date(promo.expires_at) < new Date())) {
                    // Marcar como expirado si aún no lo está
                    if (promo.status !== 'expired') {
                        await supabaseAdmin
                            .from('promo_codes')
                            .update({ status: 'expired' })
                            .eq('id', promo.id);
                    }
                    return new Response(
                        JSON.stringify({ valid: false, reason: 'Este código ha expirado' }),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                return new Response(
                    JSON.stringify({
                        valid: true,
                        duration_months: promo.duration_months,
                        type: promo.type
                    }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // ==========================================
            // REDEEM: Redimir código y activar suscripción
            // ==========================================
            case 'redeem': {
                const { code, business_id, user_id, plan_id } = body;

                if (!code || !business_id) {
                    return new Response(
                        JSON.stringify({ success: false, error: 'Faltan campos requeridos (code, business_id)' }),
                        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                // Determinar quién redime. `redeemed_by` es uuid: si el cliente
                // no manda un uuid válido (ej. bistro-admin no conoce el user_id
                // del dueño por RLS), lo derivamos del owner del negocio con
                // service_role. Así el código SIEMPRE queda marcado como usado.
                const isUuid = (v: unknown): v is string =>
                    typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

                let redeemerId: string | null = isUuid(user_id) ? user_id : null;
                if (!redeemerId) {
                    const { data: bizOwner } = await supabaseAdmin
                        .from('businesses')
                        .select('owner_id')
                        .eq('id', business_id)
                        .single();
                    redeemerId = bizOwner?.owner_id ?? null;
                }

                // Buscar y validar código
                const { data: promo } = await supabaseAdmin
                    .from('promo_codes')
                    .select('*')
                    .eq('code', code.toUpperCase().trim())
                    .eq('status', 'active')
                    .single();

                if (!promo) {
                    return new Response(
                        JSON.stringify({ success: false, error: 'Código no válido o ya fue utilizado' }),
                        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                // Verificar expiración
                if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
                    await supabaseAdmin
                        .from('promo_codes')
                        .update({ status: 'expired' })
                        .eq('id', promo.id);

                    return new Response(
                        JSON.stringify({ success: false, error: 'Este código ha expirado' }),
                        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                // Calcular fechas de suscripción. Si el código define
                // duration_days (> 0) extendemos por días (ej. 45 días); si no,
                // usamos duration_months (comportamiento por defecto).
                const startDate = new Date();
                const endDate = new Date();
                if (promo.duration_days && promo.duration_days > 0) {
                    endDate.setDate(endDate.getDate() + promo.duration_days);
                } else {
                    endDate.setMonth(endDate.getMonth() + promo.duration_months);
                }

                // Buscar plan_id si no se proporcionó
                let finalPlanId = plan_id;
                if (!finalPlanId) {
                    const { data: defaultPlan } = await supabaseAdmin
                        .from('subscription_plans')
                        .select('id')
                        .eq('is_active', true)
                        .order('price_monthly', { ascending: true })
                        .limit(1)
                        .single();
                    finalPlanId = defaultPlan?.id;
                }

                if (!finalPlanId) {
                    return new Response(
                        JSON.stringify({ success: false, error: 'No se encontró un plan de suscripción' }),
                        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                // Crear/actualizar suscripción
                const { error: subError } = await supabaseAdmin
                    .from('business_subscriptions')
                    .upsert({
                        business_id,
                        plan_id: finalPlanId,
                        status: 'active',
                        current_period_start: startDate.toISOString(),
                        current_period_end: endDate.toISOString(),
                        next_billing_date: endDate.toISOString().split('T')[0]
                    }, { onConflict: 'business_id' });

                if (subError) {
                    console.error('Error creating subscription:', subError);
                    return new Response(
                        JSON.stringify({ success: false, error: 'Error creando suscripción' }),
                        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                // Marcar código como usado
                const { error: promoUpdateError } = await supabaseAdmin
                    .from('promo_codes')
                    .update({
                        status: 'used',
                        redeemed_by: redeemerId,
                        redeemed_business_id: business_id,
                        redeemed_at: new Date().toISOString()
                    })
                    .eq('id', promo.id);

                if (promoUpdateError) {
                    console.error('Error marcando código como usado:', promoUpdateError);
                }

                return new Response(
                    JSON.stringify({
                        success: true,
                        duration_months: promo.duration_months,
                        duration_days: promo.duration_days ?? null,
                        subscription_end: endDate.toISOString()
                    }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            // ==========================================
            // LIST: Admin lista sus códigos generados
            // ==========================================
            case 'list': {
                const authHeader = req.headers.get('Authorization');
                if (!authHeader) {
                    return new Response(
                        JSON.stringify({ success: false, error: 'No autorizado' }),
                        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                const supabaseAuth = createSupabaseFromAuth(authHeader);
                const { data: { user } } = await supabaseAuth.auth.getUser();
                if (!user) {
                    return new Response(
                        JSON.stringify({ success: false, error: 'No autorizado' }),
                        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }

                const { data, error } = await supabaseAdmin
                    .from('promo_codes')
                    .select('*')
                    .eq('created_by', user.id)
                    .order('created_at', { ascending: false });

                if (error) throw error;

                return new Response(
                    JSON.stringify({ success: true, codes: data || [] }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            default:
                return new Response(
                    JSON.stringify({ success: false, error: `Acción desconocida: ${action}` }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
        }
    } catch (error: any) {
        console.error('[manage-promo-codes] Error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
