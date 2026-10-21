// Deno types for Edge Functions
declare const Deno: {
    serve: (handler: (req: Request) => Promise<Response>) => void;
    env: {
        get: (key: string) => string | undefined;
    };
};

// @ts-ignore - Supabase JS from ESM
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Production URL for Wompi
const WOMPI_API_URL = "https://production.wompi.co/v1";
const MAX_RETRIES = 3;
const GRACE_PERIOD_DAYS = 5;

Deno.serve(async (req: Request) => {
    console.log("[process-subscriptions] Invoked at", new Date().toISOString());

    try {
        // Create Supabase client with service role for full access
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );

        // Get Wompi private key from environment (set via supabase secrets)
        const wompiPrivateKey = Deno.env.get("WOMPI_PRIVATE_KEY");
        if (!wompiPrivateKey) {
            throw new Error("WOMPI_PRIVATE_KEY not configured");
        }

        // 1. Query subscriptions due for billing today or past due
        const today = new Date().toISOString().split("T")[0];
        console.log("[process-subscriptions] Checking subscriptions for date:", today);

        // Get subscriptions where:
        // - status is 'active' (trial ended and needs billing) OR 'past_due' (retrying)
        // - next_billing_date <= today
        // - NOT recently retried (wait 24h between retries)
        const { data: subscriptions, error: subError } = await supabase
            .from("business_subscriptions")
            .select("*")
            .in("status", ["active", "past_due"])
            .lte("next_billing_date", today);

        if (subError) {
            console.error("[process-subscriptions] Query error:", subError);
            throw subError;
        }

        console.log(`[process-subscriptions] Found ${subscriptions?.length || 0} subscriptions to process`);

        const results: any[] = [];

        // 2. Process each subscription
        for (const sub of subscriptions || []) {
            console.log(`[process-subscriptions] Processing subscription ${sub.id}`);

            // Check if we should wait before retrying (24h between retries)
            if (sub.last_retry_at) {
                const lastRetry = new Date(sub.last_retry_at);
                const hoursSinceRetry = (Date.now() - lastRetry.getTime()) / (1000 * 60 * 60);
                if (hoursSinceRetry < 24) {
                    console.log(`[process-subscriptions] Skipping ${sub.id} - only ${hoursSinceRetry.toFixed(1)}h since last retry`);
                    results.push({ id: sub.id, status: "skipped", reason: "Waiting 24h between retries" });
                    continue;
                }
            }

            // Fetch related data separately (avoids complex joins that can fail)
            const { data: plan } = await supabase
                .from("subscription_plans")
                .select("*")
                .eq("id", sub.plan_id)
                .single();

            const { data: business } = await supabase
                .from("businesses")
                .select("*")
                .eq("id", sub.business_id)
                .single();

            const { data: paymentMethods } = await supabase
                .from("payment_methods")
                .select("*")
                .eq("business_id", sub.business_id)
                .eq("is_default", true)
                .eq("is_active", true);

            const paymentMethod = paymentMethods?.[0];

            if (!plan) {
                console.error(`[process-subscriptions] No plan found for subscription ${sub.id}`);
                results.push({ id: sub.id, status: "error", reason: "Plan not found" });
                continue;
            }

            if (!paymentMethod) {
                console.error(`[process-subscriptions] No payment method for subscription ${sub.id}`);
                results.push({ id: sub.id, status: "skipped", reason: "No payment method" });

                // Mark as past_due if no payment method
                await supabase
                    .from("business_subscriptions")
                    .update({ status: "past_due", last_retry_at: new Date().toISOString() })
                    .eq("id", sub.id);
                continue;
            }

            try {
                // 3. Create charge with Wompi
                const amountInCents = Math.round(plan.price_monthly * 100);
                const reference = `SUB-${sub.id.substring(0, 8)}-${Date.now()}`;

                console.log(`[process-subscriptions] Charging ${amountInCents} cents for ${plan.name} plan`);

                const transactionResponse = await fetch(`${WOMPI_API_URL}/transactions`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${wompiPrivateKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        amount_in_cents: amountInCents,
                        currency: "COP",
                        customer_email: business?.email || "billing@bistropos.co",
                        payment_method: {
                            type: "CARD",
                            token: paymentMethod.card_token,
                            installments: 1,
                        },
                        reference: reference,
                    }),
                });

                const transaction = await transactionResponse.json();
                console.log(`[process-subscriptions] Wompi response:`, JSON.stringify(transaction));

                const isApproved = transaction.data?.status === "APPROVED";

                // 4. Record invoice
                const { error: invoiceError } = await supabase.from("subscription_invoices").insert({
                    subscription_id: sub.id,
                    amount: plan.price_monthly,
                    status: isApproved ? "paid" : "failed",
                    wompi_transaction_id: transaction.data?.id || null,
                    wompi_status: transaction.data?.status || transaction.error?.type || "ERROR",
                    wompi_response: transaction,
                    billing_period_start: sub.current_period_start,
                    billing_period_end: sub.current_period_end,
                    paid_at: isApproved ? new Date().toISOString() : null,
                    failed_at: isApproved ? null : new Date().toISOString(),
                    failure_reason: isApproved ? null : (transaction.data?.status_message || transaction.error?.reason || "Unknown"),
                });

                if (invoiceError) {
                    console.error(`[process-subscriptions] Invoice insert error:`, invoiceError);
                }

                // 5. Update subscription based on result
                if (isApproved) {
                    // Success: advance to next billing period
                    const isAnnual = plan.name?.toLowerCase().includes("anual");
                    const monthsToAdd = isAnnual ? 12 : 1;

                    const nextBillingDate = new Date(sub.next_billing_date);
                    nextBillingDate.setMonth(nextBillingDate.getMonth() + monthsToAdd);

                    const periodEnd = new Date(sub.current_period_end);
                    periodEnd.setMonth(periodEnd.getMonth() + monthsToAdd);

                    await supabase
                        .from("business_subscriptions")
                        .update({
                            status: "active",
                            retry_count: 0,
                            last_retry_at: null,
                            current_period_start: sub.current_period_end,
                            current_period_end: periodEnd.toISOString(),
                            next_billing_date: nextBillingDate.toISOString().split("T")[0],
                            updated_at: new Date().toISOString(),
                        })
                        .eq("id", sub.id);

                    console.log(`[process-subscriptions] Success for ${sub.id}, next billing: ${nextBillingDate.toISOString()}`);
                    results.push({ id: sub.id, status: "success", next_billing: nextBillingDate.toISOString().split("T")[0] });

                } else {
                    // Failure: increment retry count
                    const newRetryCount = (sub.retry_count || 0) + 1;

                    // Calculate days since next_billing_date
                    const billingDate = new Date(sub.next_billing_date);
                    const todayDate = new Date();
                    const daysPastDue = Math.floor((todayDate.getTime() - billingDate.getTime()) / (1000 * 60 * 60 * 24));

                    // Suspend if past grace period or max retries
                    const shouldCancel = daysPastDue > GRACE_PERIOD_DAYS || newRetryCount > MAX_RETRIES;

                    await supabase
                        .from("business_subscriptions")
                        .update({
                            status: shouldCancel ? "canceled" : "past_due",
                            retry_count: newRetryCount,
                            last_retry_at: new Date().toISOString(),
                            canceled_at: shouldCancel ? new Date().toISOString() : null,
                            cancel_reason: shouldCancel ? `Payment failed after ${newRetryCount} retries (${daysPastDue} days past due)` : null,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("id", sub.id);

                    // Log notification (actual integration would use Twilio/SendGrid)
                    console.log(`[process-subscriptions] NOTIFY: Payment failed for ${business?.email}. Retry ${newRetryCount}/${MAX_RETRIES}. Days past due: ${daysPastDue}`);

                    results.push({
                        id: sub.id,
                        status: "failed",
                        retry: newRetryCount,
                        days_past_due: daysPastDue,
                        canceled: shouldCancel,
                        reason: transaction.data?.status_message || transaction.error?.reason,
                    });
                }
            } catch (chargeError: any) {
                console.error(`[process-subscriptions] Charge error for ${sub.id}:`, chargeError);
                results.push({ id: sub.id, status: "error", message: chargeError.message });
            }
        }

        console.log(`[process-subscriptions] Completed. Processed: ${results.length}`);

        return new Response(
            JSON.stringify({
                success: true,
                timestamp: new Date().toISOString(),
                processed: results.length,
                results,
            }),
            {
                headers: { "Content-Type": "application/json" },
            }
        );
    } catch (error: any) {
        console.error("[process-subscriptions] Fatal error:", error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            {
                status: 500,
                headers: { "Content-Type": "application/json" },
            }
        );
    }
});
