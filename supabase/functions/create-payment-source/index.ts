// Deno types for Edge Functions
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

const WOMPI_API_URL = "https://production.wompi.co/v1";

Deno.serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { 
            cardToken,        // Token de la tarjeta (obtenido del Widget o tokenización)
            customerEmail,    // Email del cliente
            businessId,       // ID del negocio en nuestra DB
            acceptanceToken,  // Token de aceptación de términos
            personalAuthToken // Token de autorización de datos personales (opcional)
        } = await req.json();

        if (!cardToken || !customerEmail || !businessId) {
            throw new Error('Missing required fields: cardToken, customerEmail, businessId');
        }

        // Get Wompi private key
        const wompiPrivateKey = Deno.env.get("WOMPI_PRIVATE_KEY");
        if (!wompiPrivateKey) {
            throw new Error("WOMPI_PRIVATE_KEY not configured");
        }

        // Create Supabase client
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        console.log(`[create-payment-source] Creating payment source for business ${businessId}`);

        // Get acceptance tokens if not provided
        let acceptToken = acceptanceToken;
        let personalAuth = personalAuthToken;

        if (!acceptToken) {
            console.log('[create-payment-source] Fetching acceptance tokens from Wompi...');
            const pubKey = Deno.env.get("WOMPI_PUBLIC_KEY") || "pub_prod_SBOikcfiz2DnChtvAPpSchII3DYeHNIY";
            const merchantResponse = await fetch(`${WOMPI_API_URL}/merchants/${pubKey}`);
            const merchantData = await merchantResponse.json();
            
            acceptToken = merchantData.data?.presigned_acceptance?.acceptance_token;
            personalAuth = merchantData.data?.presigned_personal_data_auth?.acceptance_token;
            
            if (!acceptToken) {
                throw new Error('Could not get acceptance token from Wompi');
            }
        }

        // 1. Create Payment Source in Wompi
        console.log('[create-payment-source] Creating payment source in Wompi...');
        
        const paymentSourceBody: Record<string, string> = {
            type: 'CARD',
            token: cardToken,
            customer_email: customerEmail,
            acceptance_token: acceptToken
        };

        // Add personal auth token if available (optional but recommended)
        if (personalAuth) {
            paymentSourceBody.accept_personal_auth = personalAuth;
        }

        const psResponse = await fetch(`${WOMPI_API_URL}/payment_sources`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${wompiPrivateKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(paymentSourceBody)
        });

        const psData = await psResponse.json();
        console.log('[create-payment-source] Wompi response:', JSON.stringify(psData));

        if (psData.error) {
            throw new Error(psData.error.reason || psData.error.message || 'Error creating payment source');
        }

        if (!psData.data?.id) {
            throw new Error('No payment source ID returned from Wompi');
        }

        const paymentSourceId = psData.data.id;
        const paymentSourceStatus = psData.data.status;

        console.log(`[create-payment-source] Created payment source ${paymentSourceId} (status: ${paymentSourceStatus})`);

        // 2. Save Payment Method to our database
        const { data: pmData, error: pmError } = await supabase
            .from('payment_methods')
            .upsert({
                business_id: businessId,
                card_token: cardToken,
                wompi_source_id: paymentSourceId.toString(),
                is_default: true,
                is_active: paymentSourceStatus === 'AVAILABLE'
            }, {
                onConflict: 'business_id,card_token',
                ignoreDuplicates: false
            })
            .select()
            .single();

        if (pmError) {
            console.error('[create-payment-source] Error saving to DB:', pmError);
            // Don't throw - we still created the payment source in Wompi
        }

        // 3. Deactivate other payment methods for this business (only keep latest as default)
        if (pmData?.id) {
            await supabase
                .from('payment_methods')
                .update({ is_default: false })
                .eq('business_id', businessId)
                .neq('id', pmData.id);
        }

        return new Response(
            JSON.stringify({
                success: true,
                paymentSourceId: paymentSourceId,
                status: paymentSourceStatus,
                paymentMethodId: pmData?.id,
                message: 'Payment source created successfully'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error("[create-payment-source] Error:", error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    }
});
