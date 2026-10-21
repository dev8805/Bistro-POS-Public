import { describe, expect, it } from 'vitest';
import { buildPaymentReference } from '../lib/paymentReference';
import { parseReference } from '../supabase/functions/wompi-webhook/periods';

/**
 * Cierra el círculo cliente↔webhook (Req 4, tarea 4.3): la referencia que emite
 * el checkout del cliente debe ser resoluble por el parser del webhook.
 */

const BUSINESS_ID = '1e64bb14-27fc-4f76-8470-29e17253423f';
const PLAN_ID = '09d3f283-bd52-47dc-a4d3-cc0bfe764dda';

describe('buildPaymentReference', () => {
    it('emite el formato canónico bsub_<businessId>_<planId>_<timestamp>', () => {
        expect(buildPaymentReference(BUSINESS_ID, PLAN_ID, 1785000000000))
            .toBe(`bsub_${BUSINESS_ID}_${PLAN_ID}_1785000000000`);
    });

    it('la referencia generada es resuelta por el parser del webhook', () => {
        const reference = buildPaymentReference(BUSINESS_ID, PLAN_ID);
        expect(parseReference(reference)).toEqual({
            kind: 'canonical',
            businessId: BUSINESS_ID,
            planId: PLAN_ID,
        });
    });

    it('normaliza los UUID a minúsculas', () => {
        const reference = buildPaymentReference(BUSINESS_ID.toUpperCase(), PLAN_ID.toUpperCase(), 1);
        expect(reference).toBe(`bsub_${BUSINESS_ID}_${PLAN_ID}_1`);
        expect(parseReference(reference).kind).toBe('canonical');
    });

    it('lanza si falta el negocio o el plan en vez de emitir una referencia inválida', () => {
        expect(() => buildPaymentReference(null, PLAN_ID)).toThrow(/negocio/i);
        expect(() => buildPaymentReference(undefined, PLAN_ID)).toThrow(/negocio/i);
        expect(() => buildPaymentReference(BUSINESS_ID, null)).toThrow(/plan/i);
        expect(() => buildPaymentReference('10001', PLAN_ID)).toThrow(/negocio/i);
    });
});
