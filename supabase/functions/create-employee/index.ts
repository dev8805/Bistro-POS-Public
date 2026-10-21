declare const Deno: {
    serve: (handler: (req: Request) => Promise<Response>) => void;
    env: {
        get: (key: string) => string | undefined;
    };
};

// @ts-ignore - Supabase JS from ESM
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Registra un evento de auditoría con el actor real (del JWT del request).
// Best-effort: nunca interrumpe la operación principal.
async function logUserEvent(supabaseAdmin: any, req: Request, businessId: string, action: string, severity: string, description: string, metadata: Record<string, unknown>) {
    try {
        const authHeader = req.headers.get('Authorization') || '';
        const jwt = authHeader.replace(/^Bearer\s+/i, '');
        let actorId: string | null = null, actorName: string | null = null, actorRole: string | null = null;
        if (jwt) {
            const { data } = await supabaseAdmin.auth.getUser(jwt);
            actorId = data?.user?.id ?? null;
            if (actorId) {
                const { data: prof } = await supabaseAdmin.from('profiles').select('full_name, role').eq('id', actorId).maybeSingle();
                actorName = prof?.full_name ?? null;
                actorRole = prof?.role ?? null;
            }
        }
        const category = action.startsWith('permission') ? 'permission' : 'user';
        await supabaseAdmin.from('audit_events').insert({
            business_id: businessId, user_id: actorId, user_name: actorName, user_role: actorRole,
            category, action, severity, description, metadata,
        });
    } catch (e: any) {
        console.error('logUserEvent failed:', e?.message || e);
    }
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );

        const { email, password, full_name, phone, role_id, business_id } = await req.json();

        console.log(`Creando empleado: ${full_name} (${email}) phone: ${phone}`);

        let userId: string;

        // 1. Intentar crear usuario en Auth (sin contraseña directa para evitar restricción de 6+ caracteres de Supabase)
        const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            phone: phone,
            email_confirm: true,
            phone_confirm: true,
            user_metadata: {
                full_name: full_name,
                phone: phone,
                business_id: business_id
            }
        });

        if (userError) {
            console.log('Error creando usuario Auth:', userError.message);

            // Si el usuario ya existe por email o phone, buscarlo y reutilizarlo
            const isAlreadyRegistered = userError.message.includes('already') ||
                                       userError.message.includes('exists') ||
                                       userError.message.includes('registered');

            if (isAlreadyRegistered) {
                console.log('Usuario ya existe, buscando...');

                const phoneNoPlus = phone.replace(/^\+/, '');
                const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
                const users = allUsers?.users || [];

                const existingUser = users.find((u: any) => {
                    const uPhone = (u.phone || '').replace(/^\+/, '');
                    const uEmail = u.email || '';
                    return uPhone === phoneNoPlus || uEmail === email;
                });

                if (!existingUser) {
                    throw new Error('No se pudo encontrar el usuario existente con este número de teléfono.');
                }

                userId = existingUser.id;
                console.log(`Usuario existente encontrado: ${userId}`);

                await supabaseAdmin.auth.admin.updateUserById(userId, {
                    phone: phone,
                    phone_confirm: true,
                    user_metadata: {
                        full_name: full_name,
                        phone: phone,
                        business_id: business_id
                    }
                });
            } else {
                throw userError;
            }
        } else {
            userId = userData.user.id;
            console.log(`Usuario creado con ID: ${userId}`);
        }

        // 2. Asignar el PIN de 4 dígitos mediante la función SQL _set_user_pin (hash bcrypt directo en auth.users)
        const pinToSet = (password && /^\d{4}$/.test(password)) ? password : '1234';
        const { error: pinError } = await supabaseAdmin.rpc('_set_user_pin', {
            target_user_id: userId,
            new_pin: pinToSet
        });

        if (pinError) {
            console.error('Error asignando PIN con _set_user_pin:', pinError.message);
        } else {
            console.log(`PIN asignado exitosamente para el usuario ${userId}`);
        }

        // 3. Buscar el nombre del rol
        const { data: roleData } = await supabaseAdmin
            .from('roles')
            .select('name')
            .eq('id', role_id)
            .single();

        const roleName = roleData?.name || 'Mesero';

        // 4. Verificar si el perfil ya existe
        const { data: existingProfile } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .maybeSingle();

        if (existingProfile) {
            const { error: updateError } = await supabaseAdmin
                .from('profiles')
                .update({
                    full_name: full_name,
                    role_id: role_id,
                    role: roleName,
                    phone: phone,
                    business_id: business_id
                })
                .eq('id', userId);

            if (updateError) {
                console.error('Error actualizando perfil:', updateError);
            }
        } else {
            await new Promise(resolve => setTimeout(resolve, 1000));

            const { data: profileAfterWait } = await supabaseAdmin
                .from('profiles')
                .select('id')
                .eq('id', userId)
                .maybeSingle();

            if (profileAfterWait) {
                const { error: updateError } = await supabaseAdmin
                    .from('profiles')
                    .update({
                        full_name: full_name,
                        role_id: role_id,
                        role: roleName,
                        phone: phone,
                        business_id: business_id
                    })
                    .eq('id', userId);

                if (updateError) {
                    console.error('Error actualizando perfil:', updateError);
                }
            } else {
                console.log('Trigger no creo perfil, insertando manualmente...');
                const { error: insertError } = await supabaseAdmin
                    .from('profiles')
                    .insert({
                        id: userId,
                        full_name: full_name,
                        role_id: role_id,
                        role: roleName,
                        phone: phone,
                        business_id: business_id
                    });

                if (insertError) {
                    console.error('Error insertando perfil:', insertError);
                    return new Response(
                        JSON.stringify({ user: { id: userId }, warning: 'Usuario creado pero fallo creacion de perfil: ' + insertError.message }),
                        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
                    );
                }
            }
        }

        console.log(`Empleado ${full_name} configurado exitosamente con rol ${roleName}`);

        // Auditoría: un solo evento de creación con el actor real (admin del JWT).
        await logUserEvent(supabaseAdmin, req, business_id, 'user.created', 'warning',
            `Creó el usuario "${full_name}"`,
            { target_user_id: userId, target_user_name: full_name, role: roleName });

        return new Response(
            JSON.stringify({ user: { id: userId }, message: 'Empleado creado exitosamente' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );

    } catch (error: any) {
        console.error('Error general:', error?.message || error);
        return new Response(
            JSON.stringify({ error: error?.message || 'Error desconocido' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
});