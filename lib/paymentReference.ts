/**
 * Referencia de pago canónica de suscripciones (Req 4, Paso A.1).
 *
 * Formato: `bsub_<businessId>_<planId>_<timestamp>`
 *
 * El webhook `wompi-webhook` resuelve negocio + plan desde este string sin
 * ambigüedad (ver `supabase/functions/wompi-webhook/periods.ts` →
 * `parseReference`). El formato viejo `custom-<businessId8>-<timestamp>` sigue
 * aceptado por el webhook solo para pagos en vuelo; el cliente ya no lo emite.
 *
 * Módulo puro (sin imports de Supabase ni del DOM) para poder testearlo junto
 * al parser del webhook y cerrar el círculo cliente↔servidor.
 */

/** Mismo patrón que `UUID_RE` del webhook. */
export const REFERENCE_UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Construye la referencia canónica. Lanza si falta el negocio o el plan, para
 * no emitir nunca una referencia inválida (con `undefined` embebido) que el
 * webhook no podría resolver.
 */
export const buildPaymentReference = (
    businessId: string | null | undefined,
    planId: string | null | undefined,
    timestamp: number = Date.now()
): string => {
    const business = String(businessId ?? '').trim().toLowerCase();
    const plan = String(planId ?? '').trim().toLowerCase();

    if (!REFERENCE_UUID_RE.test(business)) {
        throw new Error('No pudimos identificar tu negocio para generar el pago. Recarga la página e intenta de nuevo.');
    }
    if (!REFERENCE_UUID_RE.test(plan)) {
        throw new Error('No pudimos identificar el plan a pagar. Recarga la página e intenta de nuevo.');
    }

    return `bsub_${business}_${plan}_${timestamp}`;
};
