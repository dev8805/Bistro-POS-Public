/**
 * Lógica pura del webhook de Wompi: parseo de la referencia de pago y cálculo
 * del periodo a extender según la regla del plan.
 *
 * Se mantiene en un módulo aparte (sin imports de Deno ni de Supabase) para
 * poder testearla desde el repo con vitest y para que el webhook y cualquier
 * verificación compartan exactamente la misma regla.
 */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PlanRow {
    id: string;
    name: string | null;
    price_monthly: number | string | null;
    initial_period_months: number | null;
    assigned_business_id: string | null;
}

export interface SubRow {
    id: string;
    business_id: string;
    plan_id: string | null;
    status: string | null;
    current_period_end: string | null;
}

export type ParsedReference =
    | { kind: 'canonical'; businessId: string; planId: string }
    | { kind: 'legacy'; businessIdPrefix: string }
    | { kind: 'unknown' };

/**
 * Formatos soportados:
 *   · Canónico: `bsub_<businessId>_<planId>_<timestamp>`
 *   · Legado:   `custom-<businessId8>-<timestamp>`
 */
export const parseReference = (reference: string): ParsedReference => {
    const ref = String(reference ?? '');

    const canonical = /^bsub_([0-9a-f-]{36})_([0-9a-f-]{36})_(\d+)$/i.exec(ref);
    if (canonical && UUID_RE.test(canonical[1]) && UUID_RE.test(canonical[2])) {
        return {
            kind: 'canonical',
            businessId: canonical[1].toLowerCase(),
            planId: canonical[2].toLowerCase(),
        };
    }

    const legacy = /^custom-([0-9a-f]{8})-\d+$/i.exec(ref);
    if (legacy) {
        return { kind: 'legacy', businessIdPrefix: legacy[1].toLowerCase() };
    }

    return { kind: 'unknown' };
};

export const toNumber = (value: number | string | null): number => {
    const n = typeof value === 'string' ? Number(value) : (value ?? 0);
    return Number.isFinite(n) ? n : 0;
};

/**
 * "Primer pago real" del negocio, con el mismo criterio que usaba el cliente
 * (`!hasUsedTrial || prevSubscriptionStatus === 'trial'`): no hay fila de
 * suscripción, o su status vigente es 'trial'.
 */
export const isFirstRealPayment = (sub: SubRow | null): boolean =>
    !sub || sub.status === 'trial';

/**
 * Meses a extender según la regla del plan (portada de `handlePaymentApproved`).
 * `sub` es la suscripción ANTES de aplicar el pago.
 */
export const resolvePeriodMonths = (plan: PlanRow, sub: SubRow | null): number => {
    // Plan personalizado: siempre +1 mes (comportamiento vigente del webhook).
    if (plan.assigned_business_id) return 1;

    const name = (plan.name ?? '').trim().toLowerCase();
    const initial = plan.initial_period_months && plan.initial_period_months > 0
        ? plan.initial_period_months
        : 1;

    if (name === 'mensual') {
        return isFirstRealPayment(sub) ? (plan.initial_period_months || 2) : 1;
    }
    if (name === 'trimestral') return 3;
    if (name === 'anual') return 12;
    return initial;
};

export const addMonths = (date: Date, months: number): Date => {
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
};

/**
 * Ventana de gracia (en horas) para conservar el anclaje en current_period_end
 * cuando la suscripción venció recientemente.
 *
 * Valor duplicado a propósito respecto al frontend: no se comparte fuente para
 * mantener esta lógica pura y sin dependencias del cliente.
 */
export const GRACE_ANCHOR_HOURS = 48;

/**
 * Ancla el nuevo periodo:
 *   · Suscripción vigente (currentEnd > now)      → currentEnd
 *   · Vencida dentro de la gracia (<= 48 h)       → currentEnd
 *   · Vencida fuera de la gracia (> 48 h)         → now
 *   · Sin suscripción o sin current_period_end    → now
 * Función pura: no muta `sub` y depende solo de sus parámetros.
 */
export const resolveAnchor = (sub: SubRow | null, now: Date): Date => {
    const currentEnd = sub?.current_period_end ? new Date(sub.current_period_end) : null;
    if (!currentEnd) return now;

    // Vigente: el fin de vigencia es posterior a now.
    if (currentEnd > now) return currentEnd;

    // Vencida: medir cuánto hace que venció.
    const graceMs = GRACE_ANCHOR_HOURS * 60 * 60 * 1000;
    const elapsedMs = now.getTime() - currentEnd.getTime();

    // Dentro de la gracia (borde de 48 h exactas incluido) → conservar currentEnd.
    return elapsedMs <= graceMs ? currentEnd : now;
};
