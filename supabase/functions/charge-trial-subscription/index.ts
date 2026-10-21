// Deno types for Edge Functions
declare const Deno: {
    serve: (handler: (req: Request) => Promise<Response>) => void;
    env: {
        get: (key: string) => string | undefined;
    };
};

// @ts-ignore - Supabase JS from ESM
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Configuration
const WOMPI_API_URL = "https://production.wompi.co/v1";
const MAX_RETRIES = 3;
const RETRY_INTERVAL_MINUTES = 2;
const AMOUNT_COP = 150000; // $1,500 COP in cents

// CORS headers
const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    console.log("[charge-trial] Invoked at", new Date().toISOString());

    try {
        // Create Supabase client with service role
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // Get Wompi private key
        const wompiPrivateKey = Deno.env.get("WOMPI_PRIVATE_KEY");
        if (!wompiPrivateKey) {
            throw new Error("WOMPI_PRIVATE_KEY not configured");
        }

        const now = new Date();
        console.log("[charge-trial] Checking expired trials at:", now.toISOString());

        // Query subscriptions where:
        // - status is 'trial'
        // - current_period_end <= now (trial expired)
        // - charge_status is 'pending' or 'retrying'
        // - has payment_source_id (card registered)
        // - charge_retry_count < MAX_RETRIES
        const { data: expiredTrials, error: queryError } = await supabase
            .from("business_subscriptions")
            .select(`
                id,
                business_id,
                plan_id,
                current_period_end,
                charge_status,
                charge_retry_count,
                last_charge_attempt,
                payment_source_id,
                payment_sources!inner (
                    wompi_source_id
                ),
                subscription_plans!inner (
                    price_monthly,
                    trial_duration,
                    trial_interval
                )
            `)
            .eq("status", "trial")
            .lte("current_period_end", now.toISOString())
            .in("charge_status", ["pending", "retrying"])
            .not("payment_source_id", "is", null)
            .lt("charge_retry_count", MAX_RETRIES);

        if (queryError) {
            throw new Error(`Query error: ${queryError.message}`);
        }

        console.log(`[charge-trial] Found ${expiredTrials?.length || 0} expired trials to process`);

        const results: any[] = [];

        for (const sub of expiredTrials || []) {
            console.log(`[charge-trial] Processing subscription ${sub.id}`);

            // Check if enough time has passed since last retry
            if (sub.last_charge_attempt) {
                const lastAttempt = new Date(sub.last_charge_attempt);
                const minutesSinceLastAttempt = (now.getTime() - lastAttempt.getTime()) / (1000 * 60);
                
                if (minutesSinceLastAttempt < RETRY_INTERVAL_MINUTES) {
                    console.log(`[charge-trial] Skipping ${sub.id} - only ${minutesSinceLastAttempt.toFixed(1)} min since last attempt`);
                    continue;
                }
            }

            try {
                // Get amount from plan
                const amountInCents = Math.round((sub.subscription_plans as any).price_monthly * 100);
                const reference = `CHARGE-${sub.business_id.substring(0, 8)}-${Date.now()}`;

                console.log(`[charge-trial] Charging ${amountInCents} cents for subscription ${sub.id}`);

                // Create transaction with Wompi using payment source
                const chargeResponse = await fetch(`${WOMPI_API_URL}/transactions`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${wompiPrivateKey}`,
                    },
                    body: JSON.stringify({
                        amount_in_cents: amountInCents,
                        currency: "COP",
                        reference: reference,
                        payment_source_id: (sub.payment_sources as any).wompi_source_id,
                        customer_email: "cliente@bistrpos.com", // We should get this from business
                    }),
                });

                const transaction = await chargeResponse.json();
                console.log(`[charge-trial] Wompi response:`, JSON.stringify(transaction));

                if (transaction.data?.status === "APPROVED") {
                    // Payment successful - activate subscription
                    const newPeriodStart = new Date();
                    const newPeriodEnd = new Date();
                    
                    // For testing, add 10 more minutes. In production, add 30 days
                    const plan = sub.subscription_plans as any;
                    if (plan.trial_interval === 'minute') {
                        newPeriodEnd.setMinutes(newPeriodStart.getMinutes() + (plan.trial_duration || 10));
                    } else {
                        newPeriodEnd.setDate(newPeriodStart.getDate() + 30);
                    }

                    await supabase
                        .from("business_subscriptions")
                        .update({
                            status: "active",
                            charge_status: "success",
                            charge_retry_count: 0,
                            current_period_start: newPeriodStart.toISOString(),
                            current_period_end: newPeriodEnd.toISOString(),
                            next_billing_date: newPeriodEnd.toISOString().split("T")[0],
                            last_charge_attempt: now.toISOString(),
                            updated_at: now.toISOString(),
                        })
                        .eq("id", sub.id);

                    // Record invoice
                    await supabase.from("subscription_invoices").insert({
                        subscription_id: sub.id,
                        amount: (sub.subscription_plans as any).price_monthly,
                        status: "paid",
                        wompi_transaction_id: transaction.data.id,
                        wompi_status: "APPROVED",
                        wompi_response: transaction.data,
                        paid_at: now.toISOString(),
                    });

                    results.push({
                        id: sub.id,
                        status: "success",
                        transaction_id: transaction.data.id,
                    });

                    console.log(`[charge-trial] SUCCESS for ${sub.id}`);

                } else {
                    // Payment failed - increment retry
                    const newRetryCount = (sub.charge_retry_count || 0) + 1;
                    const shouldBlock = newRetryCount >= MAX_RETRIES;

                    await supabase
                        .from("business_subscriptions")
                        .update({
                            status: shouldBlock ? "past_due" : "trial",
                            charge_status: shouldBlock ? "failed" : "retrying",
                            charge_retry_count: newRetryCount,
                            last_charge_attempt: now.toISOString(),
                            updated_at: now.toISOString(),
                        })
                        .eq("id", sub.id);

                    results.push({
                        id: sub.id,
                        status: "failed",
                        retry: newRetryCount,
                        max_retries: MAX_RETRIES,
                        blocked: shouldBlock,
                        reason: transaction.data?.status_message || transaction.error?.reason,
                    });

                    console.log(`[charge-trial] FAILED for ${sub.id}. Retry ${newRetryCount}/${MAX_RETRIES}. Blocked: ${shouldBlock}`);
                }

            } catch (chargeError: any) {
                console.error(`[charge-trial] Error for ${sub.id}:`, chargeError);
                results.push({ id: sub.id, status: "error", message: chargeError.message });
            }
        }

        console.log(`[charge-trial] Completed. Processed: ${results.length}`);

        return new Response(
            JSON.stringify({
                success: true,
                timestamp: now.toISOString(),
                processed: results.length,
                results,
            }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );

    } catch (error: any) {
        console.error("[charge-trial] Fatal error:", error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
        );
    }
});
