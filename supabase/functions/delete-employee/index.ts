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

        const { employee_id, action } = await req.json()

        if (!employee_id) {
            throw new Error('employee_id es requerido')
        }

        if (action === 'delete') {
            console.log(`Eliminando empleado lógico (soft-delete): ${employee_id}`)
            
            const deletedPhone = `deleted_${Date.now()}`;

            const { error: profileError } = await supabaseAdmin
                .from('profiles')
                .update({ is_active: false, is_deleted: true, phone: deletedPhone })
                .eq('id', employee_id)

            if (profileError) throw new Error('Error actualizando perfil para borrado: ' + profileError.message)

            // Liberar email generando uno falso irrepetible basado en el timestamp y su id
            const deletedEmail = `deleted_${Date.now()}_${employee_id.substring(0,8)}@bistro.temp`;
            
            // Liberar telefono asignando null para saltar Unique constraint de Auth
            const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(employee_id, {
                email: deletedEmail,
                phone: null,
                ban_duration: '876000h',
                user_metadata: { phone: null, deleted: true }
            })
            if (banError) throw new Error('Error baneando y liberando en Auth: ' + banError.message)

            console.log(`Empleado ${employee_id} eliminado lógicamente y credenciales liberadas`)
            return new Response(
                JSON.stringify({ message: 'Empleado eliminado exitosamente' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            )
        } else if (action === 'reactivate') {
            console.log(`Reactivando empleado: ${employee_id}`)

            const { error: profileError } = await supabaseAdmin
                .from('profiles')
                .update({ is_active: true, is_deleted: false })
                .eq('id', employee_id)

            if (profileError) throw new Error('Error actualizando perfil: ' + profileError.message)

            const { error: unbanError } = await supabaseAdmin.auth.admin.updateUserById(employee_id, {
                ban_duration: 'none'
            })
            if (unbanError) throw new Error('Error reactivando en Auth: ' + unbanError.message)

            console.log(`Empleado ${employee_id} reactivado`)
            return new Response(
                JSON.stringify({ message: 'Empleado reactivado exitosamente' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            )
        } else {
            console.log(`Desactivando empleado: ${employee_id}`)

            const { error: profileError } = await supabaseAdmin
                .from('profiles')
                .update({ is_active: false })
                .eq('id', employee_id)

            if (profileError) throw new Error('Error actualizando perfil (desactivar): ' + profileError.message)

            const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(employee_id, {
                ban_duration: '876000h'
            })
            if (banError) throw new Error('Error baneando en Auth: ' + banError.message)

            console.log(`Empleado ${employee_id} desactivado`)
            return new Response(
                JSON.stringify({ message: 'Empleado desactivado exitosamente' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            )
        }
    } catch (error) {
        console.error('Error en delete-employee:', error)
        return new Response(
            JSON.stringify({ error: error.message || 'Error desconocido' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})