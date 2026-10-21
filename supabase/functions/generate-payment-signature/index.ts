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

Deno.serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { reference, amountInCents, currency = 'COP' } = await req.json();

        // Allow amountInCents = 0 for card tokenization
        if (!reference || amountInCents === undefined || amountInCents === null) {
            throw new Error('Missing required fields: reference, amountInCents');
        }

        // Get integrity secret from environment
        const integritySecret = Deno.env.get("WOMPI_INTEGRITY_SECRET");
        if (!integritySecret) {
            throw new Error("WOMPI_INTEGRITY_SECRET not configured");
        }

        // Generate integrity signature
        // Format: <Reference><AmountInCents><Currency><IntegritySecret>
        const concatenated = `${reference}${amountInCents}${currency}${integritySecret}`;
        
        // Generate SHA256 hash
        const encoder = new TextEncoder();
        const data = encoder.encode(concatenated);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        console.log(`[generate-payment-signature] Generated signature for ref: ${reference}, amount: ${amountInCents}`);

        return new Response(
            JSON.stringify({
                success: true,
                signature,
                reference,
                amountInCents,
                currency
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    } catch (error: any) {
        console.error("[generate-payment-signature] Error:", error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            }
        );
    }
});
