// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
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
        )

        const { employee_id, full_name, phone, role_id } = await req.json()

        console.log(`Actualizando empleado: ${employee_id} - ${full_name}`)

        // Buscar nombre del rol
        const { data: roleData } = await supabaseAdmin
            .from('roles')
            .select('name')
            .eq('id', role_id)
            .single()
        const roleName = roleData?.name || ''

        let formattedPhone = phone ? phone.replace(/\s/g, '') : null
        if (formattedPhone && !formattedPhone.startsWith('+')) {
            formattedPhone = '+57' + formattedPhone
        }

        if (formattedPhone) {
            const phoneNoPlus = formattedPhone.replace(/^\+/, '')
            const email = `${phoneNoPlus}@bistro.temp`

            // Verificar que el teléfono no esté en uso por otro empleado
            const { data: allUsers } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
            const users = allUsers?.users || []
            const existingUser = users.find(u => {
                const uPhone = (u.phone || '').replace(/^\+/, '')
                return uPhone === phoneNoPlus && u.id !== employee_id
            })

            if (existingUser) {
                return new Response(
                    JSON.stringify({ error: 'El número de teléfono ya está en uso por otro empleado.' }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
                )
            }

            const { error: userError } = await supabaseAdmin.auth.admin.updateUserById(employee_id, {
                phone: formattedPhone,
                email,
                user_metadata: { full_name, phone: formattedPhone }
            })
            if (userError) {
                return new Response(
                    JSON.stringify({ error: 'Hubo un error al actualizar credenciales: ' + userError.message }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
                )
            }
        }

        // Actualizar perfil (siempre, independientemente de si hubo cambio de teléfono)
        const profileUpdate: Record<string, any> = { full_name, role_id, role: roleName }
        if (formattedPhone) profileUpdate.phone = formattedPhone

        const { error: updateError } = await supabaseAdmin
            .from('profiles')
            .update(profileUpdate)
            .eq('id', employee_id)

        if (updateError) throw updateError

        return new Response(
            JSON.stringify({ message: 'Empleado actualizado exitosamente', user: { id: employee_id } }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )

    } catch (error) {
        console.error('Error general:', error.message)
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})