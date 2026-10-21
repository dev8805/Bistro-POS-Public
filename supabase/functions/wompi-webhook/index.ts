import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
    addMonths,
    parseReference,
    resolveAnchor,
    resolvePeriodMonths,
    toNumber,
    type PlanRow,
    type SubRow,
} from "./periods.ts";

/**
 * Webhook de Wompi para eventos de transacción.
 *
 * Escucha `transaction.updated` y, cuando la tx queda APPROVED, aplica el pago
 * a `subscription_invoices` + `business_subscriptions` server-side.
 *
 * Seguridad: Wompi firma cada evento con HMAC-SHA256 (`WOMPI_EVENTS_SECRET`).
 * Si la firma no valida se retorna 401 sin tocar ningún dato.
 *
 * Idempotencia: el índice único parcial `subscription_invoices_unique_wompi_tx`
 * garantiza que si Wompi reintenta el webhook (o si el cliente aplicó el pago
 * primero, durante la transición) no se duplique la factura ni se extienda dos
 * veces la vigencia: el error 23505 corta el flujo antes de tocar
 * `business_subscriptions`.
 *
 * Lógica de periodos (portada del cliente `handlePaymentApproved` para que el
 * webhook cubra TODOS los caminos de pago, no solo el plan personalizado):
 *   · Plan personalizado (`assigned_business_id` no nulo) → +1 mes.
 *   · Plan público "Mensual"    → primer pago = `initial_period_months`;
 *                                 renovación = +1 mes.
 *   · Plan público "Trimestral" → +3 meses.
 *   · Plan público "Anual"      → +12 meses.
 *   · Cualquier otro plan público → `initial_period_months` (default 1).
 * Siempre anclado a MAX(now, current_period_end).
 *
 * Criterio de "primer pago" (mismo que usaba el cliente:
 * `!hasUsedTrial || prevSubscriptionStatus === 'trial'`): no existe fila en
 * `business_subscriptions` para el negocio, o su `status` actual es `'trial'`.
 *
 * Formatos de referencia soportados:
 *   · Canónico nuevo: `bsub_<businessId>_<planId>_<timestamp>`
 *   · Legado:         `custom-<businessId8>-<timestamp>` (compatibilidad con
 *                     pagos en vuelo; se resuelve igual que antes y, si el
 *                     prefijo no corresponde a un plan personalizado, se
 *                     intenta resolver como pago de plan público).
 */

const PLAN_COLUMNS = 'id, name, price_monthly, initial_period_months, assigned_business_id';
const SUB_COLUMNS = 'id, business_id, plan_id, status, current_period_end';

const getByPath = (obj: any, path: string): any => {
    return path.split('.').reduce((acc, key) => acc?.[key], obj);
};

const verifySignature = async (
    payload: any,
    secret: string
): Promise<boolean> => {
    try {
        const properties: string[] = payload?.signature?.properties;
        const providedChecksum: string = payload?.signature?.checksum;
        const timestamp: number = payload?.timestamp;

        if (!Array.isArray(properties) || !providedChecksum || !timestamp) {
            return false;
        }

        const concatenated = properties
            .map((p) => String(getByPath(payload.data, p) ?? ''))
            .join('') + String(timestamp) + secret;

        const encoder = new TextEncoder();
        const data = encoder.encode(concatenated);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const computedChecksum = hashArray
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');

        return computedChecksum === providedChecksum;
    } catch (err) {
        console.error('[wompi-webhook] Error verifying signature:', err);
        return false;
    }
};

type ResolveResult =
    | { ok: true; plan: PlanRow; businessId: string; sub: SubRow | null }
    | { ok: false; reason: string };

/** Resuelve negocio + plan a partir de la referencia del pago. */
const resolveTarget = async (
    supabase: any,
    reference: string,
    amount: number
): Promise<ResolveResult> => {
    const parsed = parseReference(reference);

    if (parsed.kind === 'unknown') {
        return { ok: false, reason: `reference no reconocida: ${reference}` };
    }

    const fetchSub = async (businessId: string): Promise<{ sub: SubRow | null; error?: string }> => {
        const { data, error } = await supabase
            .from('business_subscriptions')
            .select(SUB_COLUMNS)
            .eq('business_id', businessId)
            .maybeSingle();
        if (error) return { sub: null, error: `error consultando subscription: ${error.message}` };
        return { sub: (data as SubRow | null) ?? null };
    };

    // --- Formato canónico: identificadores completos, sin ambigüedad ---
    if (parsed.kind === 'canonical') {
        const { data: plan, error: planErr } = await supabase
            .from('subscription_plans')
            .select(PLAN_COLUMNS)
            .eq('id', parsed.planId)
            .maybeSingle();

        if (planErr) {
            return { ok: false, reason: `error consultando plan: ${planErr.message}` };
        }
        if (!plan) {
            return { ok: false, reason: `plan ${parsed.planId} no existe` };
        }
        // Un plan personalizado solo puede cobrarse al negocio dueño.
        if (
            plan.assigned_business_id &&
            plan.assigned_business_id.toLowerCase() !== parsed.businessId
        ) {
            return {
                ok: false,
                reason: `plan ${parsed.planId} está asignado a otro negocio`,
            };
        }

        const { sub, error } = await fetchSub(parsed.businessId);
        if (error) return { ok: false, reason: error };

        return { ok: true, plan: plan as PlanRow, businessId: parsed.businessId, sub };
    }

    // --- Formato legado: solo 8 chars del business_id ---
    // 1) Camino vigente: planes personalizados (se matchea el prefijo en memoria
    //    porque PostgREST no acepta cast `::text` en el filtro).
    const { data: customPlans, error: customErr } = await supabase
        .from('subscription_plans')
        .select(PLAN_COLUMNS)
        .not('assigned_business_id', 'is', null);

    if (customErr) {
        return { ok: false, reason: `error consultando planes personalizados: ${customErr.message}` };
    }

    const customPlan = (customPlans as PlanRow[] | null)?.find((p) =>
        typeof p.assigned_business_id === 'string' &&
        p.assigned_business_id.toLowerCase().startsWith(parsed.businessIdPrefix)
    );

    if (customPlan) {
        const businessId = (customPlan.assigned_business_id as string).toLowerCase();
        const { sub, error } = await fetchSub(businessId);
        if (error) return { ok: false, reason: error };
        if (!sub) {
            return { ok: false, reason: `no se encontró subscription para business_id ${businessId}` };
        }
        return { ok: true, plan: customPlan, businessId, sub };
    }

    // 2) Fallback nuevo: pago de plan PÚBLICO con referencia legada. Se ubica la
    //    suscripción por prefijo de business_id y el plan por monto exacto; si el
    //    monto no identifica un único plan activo, se usa el plan vigente de la
    //    suscripción.
    const { data: subs, error: subsErr } = await supabase
        .from('business_subscriptions')
        .select(SUB_COLUMNS);

    if (subsErr) {
        return { ok: false, reason: `error consultando subscription: ${subsErr.message}` };
    }

    const matches = (subs as SubRow[] | null)?.filter((s) =>
        typeof s.business_id === 'string' &&
        s.business_id.toLowerCase().startsWith(parsed.businessIdPrefix)
    ) ?? [];

    if (matches.length !== 1) {
        return {
            ok: false,
            reason: matches.length === 0
                ? `ningún negocio matchea prefijo ${parsed.businessIdPrefix}`
                : `prefijo ${parsed.businessIdPrefix} es ambiguo (${matches.length} negocios)`,
        };
    }

    const sub = matches[0];

    const { data: publicPlans, error: publicErr } = await supabase
        .from('subscription_plans')
        .select(PLAN_COLUMNS)
        .is('assigned_business_id', null);

    if (publicErr) {
        return { ok: false, reason: `error consultando planes públicos: ${publicErr.message}` };
    }

    const byAmount = (publicPlans as PlanRow[] | null)?.filter(
        (p) => Math.abs(toNumber(p.price_monthly) - amount) < 0.01
    ) ?? [];

    let plan: PlanRow | undefined = byAmount.length === 1 ? byAmount[0] : undefined;

    if (!plan && sub.plan_id) {
        plan = (publicPlans as PlanRow[] | null)?.find((p) => p.id === sub.plan_id);
    }

    if (!plan) {
        return {
            ok: false,
            reason: `no se pudo resolver el plan del pago (monto ${amount}, prefijo ${parsed.businessIdPrefix})`,
        };
    }

    return { ok: true, plan, businessId: sub.business_id, sub };
};

const applyApprovedPayment = async (
    supabase: any,
    tx: {
        id: string;
        status: string;
        reference: string;
        amount_in_cents: number;
        payment_method_type?: string;
    }
): Promise<{ ok: true; alreadyProcessed: boolean } | { ok: false; reason: string }> => {
    const amount = tx.amount_in_cents / 100;

    // 1) Resolver negocio + plan (+ suscripción previa) desde la referencia.
    const resolved = await resolveTarget(supabase, tx.reference, amount);
    if (!resolved.ok) return { ok: false, reason: resolved.reason };

    const { plan, businessId, sub } = resolved;

    // 2) Calcular el periodo según la regla del plan, anclado a MAX(now, current_period_end).
    const months = resolvePeriodMonths(plan, sub);
    const now = new Date();
    const anchor = resolveAnchor(sub, now);
    const newEnd = addMonths(anchor, months);
    const nextBillingDate = newEnd.toISOString().split('T')[0];

    console.log('[wompi-webhook] Periodo calculado', {
        business_id: businessId,
        plan: plan.name,
        custom_plan: !!plan.assigned_business_id,
        prev_status: sub?.status ?? null,
        months,
        anchor: anchor.toISOString(),
        new_end: newEnd.toISOString(),
    });

    // 3) Asegurar que exista la suscripción (necesaria para la factura).
    let subscriptionId = sub?.id;
    if (!subscriptionId) {
        const { data: created, error: createErr } = await supabase
            .from('business_subscriptions')
            .insert({
                business_id: businessId,
                plan_id: plan.id,
                status: 'active',
                current_period_start: now.toISOString(),
                current_period_end: newEnd.toISOString(),
                next_billing_date: nextBillingDate,
            })
            .select('id')
            .single();

        if (createErr || !created) {
            return {
                ok: false,
                reason: `error creando subscription: ${createErr?.message ?? 'sin datos'}`,
            };
        }
        subscriptionId = created.id;
    }

    // 4) INSERT idempotente: si el wompi_transaction_id ya existe (Wompi reintentó
    //    el webhook o el cliente aplicó el pago primero), no se toca la suscripción.
    const { error: invErr } = await supabase
        .from('subscription_invoices')
        .insert({
            subscription_id: subscriptionId,
            amount,
            status: 'paid',
            wompi_transaction_id: tx.id,
            wompi_status: tx.status,
            wompi_response: tx,
            paid_at: now.toISOString(),
            billing_period_start: anchor.toISOString(),
            billing_period_end: newEnd.toISOString(),
        });

    if (invErr) {
        if ((invErr as { code?: string }).code === '23505') {
            return { ok: true, alreadyProcessed: true };
        }
        return { ok: false, reason: `error insertando invoice: ${invErr.message}` };
    }

    // 5) Extender vigencia. Solo pasa si el invoice era nuevo.
    const { error: updErr } = await supabase
        .from('business_subscriptions')
        .update({
            status: 'active',
            current_period_end: newEnd.toISOString(),
            next_billing_date: nextBillingDate,
            plan_id: plan.id,
        })
        .eq('id', subscriptionId);

    if (updErr) {
        return { ok: false, reason: `error actualizando subscription: ${updErr.message}` };
    }

    return { ok: true, alreadyProcessed: false };
};

Deno.serve(async (req: Request) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'method not allowed' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    let payload: any;
    try {
        payload = await req.json();
    } catch {
        return new Response(JSON.stringify({ error: 'invalid json' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const eventsSecret = Deno.env.get('WOMPI_EVENTS_SECRET');
    if (!eventsSecret) {
        console.error('[wompi-webhook] WOMPI_EVENTS_SECRET no está configurado');
        return new Response(JSON.stringify({ error: 'server misconfigured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const validSig = await verifySignature(payload, eventsSecret);
    if (!validSig) {
        console.warn('[wompi-webhook] Firma inválida', { environment: payload?.environment, event: payload?.event });
        return new Response(JSON.stringify({ error: 'invalid signature' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const event: string = payload?.event;
    const tx = payload?.data?.transaction;
    console.log('[wompi-webhook] Evento recibido', { event, tx_id: tx?.id, status: tx?.status, reference: tx?.reference });

    if (event !== 'transaction.updated' || tx?.status !== 'APPROVED') {
        return new Response(JSON.stringify({ ok: true, ignored: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const result = await applyApprovedPayment(supabase, {
        id: tx.id,
        status: tx.status,
        reference: tx.reference,
        amount_in_cents: tx.amount_in_cents,
        payment_method_type: tx.payment_method_type,
    });

    if (!result.ok) {
        console.error('[wompi-webhook] No aplicado:', result.reason);
        const isTransient =
            result.reason.startsWith('error insertando') ||
            result.reason.startsWith('error actualizando') ||
            result.reason.startsWith('error creando') ||
            result.reason.startsWith('error consultando');
        return new Response(JSON.stringify({ ok: false, reason: result.reason }), {
            status: isTransient ? 500 : 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    console.log('[wompi-webhook] Aplicado', { tx_id: tx.id, alreadyProcessed: result.alreadyProcessed });
    return new Response(JSON.stringify({ ok: true, alreadyProcessed: result.alreadyProcessed }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
});
