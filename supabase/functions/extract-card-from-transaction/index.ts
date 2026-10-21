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
        const { transactionId, businessId, customerEmail } = await req.json();

        if (!transactionId || !businessId) {
            throw new Error('Missing required fields: transactionId, businessId');
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

        console.log(`[extract-card-from-transaction] Fetching transaction ${transactionId}`);

        // 1. Get transaction details from Wompi
        const txResponse = await fetch(`${WOMPI_API_URL}/transactions/${transactionId}`, {
            headers: {
                'Authorization': `Bearer ${wompiPrivateKey}`,
            }
        });

        if (!txResponse.ok) {
            throw new Error(`Failed to fetch transaction: ${txResponse.status}`);
        }

        const txData = await txResponse.json();
        console.log('[extract-card-from-transaction] Transaction data:', JSON.stringify(txData.data?.payment_method || {}));

        const paymentMethod = txData.data?.payment_method;
        
        if (!paymentMethod || paymentMethod.type !== 'CARD') {
            return new Response(
                JSON.stringify({ 
                    success: true, 
                    saved: false, 
                    message: 'Transaction is not a card payment' 
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Extract card details
        const cardLastFour = paymentMethod.extra?.last_four || '';
        const cardBrand = paymentMethod.extra?.brand || '';
        const cardExpMonth = paymentMethod.extra?.exp_month || '';
        const cardExpYear = paymentMethod.extra?.exp_year || '';
        const cardToken = paymentMethod.token || '';

        if (!cardToken) {
            console.log('[extract-card-from-transaction] No card token in transaction');
            return new Response(
                JSON.stringify({ 
                    success: true, 
                    saved: false,
                    cardInfo: { cardLastFour, cardBrand },
                    message: 'No card token available for recurring payments' 
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 2. Try to create a Payment Source in Wompi for recurring payments
        let paymentSourceId = null;
        let paymentSourceStatus = 'PENDING';

        try {
            // Get acceptance token
            const pubKey = Deno.env.get("WOMPI_PUBLIC_KEY") || "pub_prod_SBOikcfiz2DnChtvAPpSchII3DYeHNIY";
            const merchantResponse = await fetch(`${WOMPI_API_URL}/merchants/${pubKey}`);
            const merchantData = await merchantResponse.json();
            const acceptToken = merchantData.data?.presigned_acceptance?.acceptance_token;
            const personalAuth = merchantData.data?.presigned_personal_data_auth?.acceptance_token;

            if (acceptToken) {
                console.log('[extract-card-from-transaction] Creating payment source...');
                
                const psBody: Record<string, string> = {
                    type: 'CARD',
                    token: cardToken,
                    customer_email: customerEmail || txData.data?.customer_email || 'billing@bistropos.co',
                    acceptance_token: acceptToken
                };
                
                if (personalAuth) {
                    psBody.accept_personal_auth = personalAuth;
                }

                const psResponse = await fetch(`${WOMPI_API_URL}/payment_sources`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${wompiPrivateKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(psBody)
                });

                const psData = await psResponse.json();
                console.log('[extract-card-from-transaction] Payment source response:', JSON.stringify(psData));

                if (psData.data?.id) {
                    paymentSourceId = psData.data.id;
                    paymentSourceStatus = psData.data.status || 'AVAILABLE';
                }
            }
        } catch (psError: any) {
            console.error('[extract-card-from-transaction] Error creating payment source:', psError.message);
            // Continue anyway - we still store the card info
        }

        // 3. Save/update payment method in database
        const { data: pmData, error: pmError } = await supabase
            .from('payment_methods')
            .upsert({
                business_id: businessId,
                card_token: cardToken,
                wompi_source_id: paymentSourceId?.toString() || null,
                card_last_four: cardLastFour,
                card_brand: cardBrand,
                card_exp_month: cardExpMonth,
                card_exp_year: cardExpYear,
                is_default: true,
                is_active: paymentSourceStatus === 'AVAILABLE'
            }, {
                onConflict: 'business_id',
                ignoreDuplicates: false
            })
            .select()
            .single();

        if (pmError) {
            console.error('[extract-card-from-transaction] Error saving to DB:', pmError);
        }

        // 4. Deactivate other payment methods for this business
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
                saved: true,
                paymentMethodId: pmData?.id,
                paymentSourceId: paymentSourceId,
                cardInfo: {
                    lastFour: cardLastFour,
                    brand: cardBrand,
                    expMonth: cardExpMonth,
                    expYear: cardExpYear
                },
                message: 'Card saved for recurring payments'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error("[extract-card-from-transaction] Error:", error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    }
});
