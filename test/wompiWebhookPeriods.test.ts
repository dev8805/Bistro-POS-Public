import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
    addMonths,
    GRACE_ANCHOR_HOURS,
    parseReference,
    resolveAnchor,
    resolvePeriodMonths,
    type PlanRow,
    type SubRow,
} from '../supabase/functions/wompi-webhook/periods';

/**
 * Lógica de periodos del webhook `wompi-webhook` (Req 4, tarea 4.1).
 * Verifica la regla portada del cliente `handlePaymentApproved`.
 */

const BUSINESS_ID = '1e64bb14-27fc-4f76-8470-29e17253423f';
const PLAN_ID = '09d3f283-bd52-47dc-a4d3-cc0bfe764dda';

const plan = (over: Partial<PlanRow>): PlanRow => ({
    id: PLAN_ID,
    name: 'Mensual',
    price_monthly: 35000,
    initial_period_months: 2,
    assigned_business_id: null,
    ...over,
});

const sub = (over: Partial<SubRow>): SubRow => ({
    id: 'sub-1',
    business_id: BUSINESS_ID,
    plan_id: PLAN_ID,
    status: 'active',
    current_period_end: null,
    ...over,
});

describe('parseReference', () => {
    it('reconoce el formato canónico bsub_ y extrae negocio y plan', () => {
        const parsed = parseReference(`bsub_${BUSINESS_ID}_${PLAN_ID}_1785000000000`);
        expect(parsed).toEqual({ kind: 'canonical', businessId: BUSINESS_ID, planId: PLAN_ID });
    });

    it('reconoce el formato legado custom- y extrae el prefijo del negocio', () => {
        const parsed = parseReference('custom-1e64bb14-1785000000000');
        expect(parsed).toEqual({ kind: 'legacy', businessIdPrefix: '1e64bb14' });
    });

    it('marca como desconocidas las referencias de otros flujos', () => {
        expect(parseReference('SUB-1e64bb14-1785000000000').kind).toBe('unknown');
        expect(parseReference('CHARGE-1e64bb14-1785000000000').kind).toBe('unknown');
        expect(parseReference('').kind).toBe('unknown');
        expect(parseReference(`bsub_no-es-uuid-aqui-1234567890123456_${PLAN_ID}_1`).kind).toBe('unknown');
    });
});

describe('resolvePeriodMonths', () => {
    it('plan personalizado extiende 1 mes', () => {
        const custom = plan({
            name: 'Plan Personalizado 10001',
            assigned_business_id: BUSINESS_ID,
            initial_period_months: 1,
        });
        expect(resolvePeriodMonths(custom, sub({ status: 'active' }))).toBe(1);
        expect(resolvePeriodMonths(custom, null)).toBe(1);
    });

    it('Mensual usa initial_period_months en el primer pago', () => {
        expect(resolvePeriodMonths(plan({}), null)).toBe(2);
        expect(resolvePeriodMonths(plan({}), sub({ status: 'trial' }))).toBe(2);
    });

    it('Mensual usa 1 mes en renovación', () => {
        expect(resolvePeriodMonths(plan({}), sub({ status: 'active' }))).toBe(1);
        expect(resolvePeriodMonths(plan({}), sub({ status: 'past_due' }))).toBe(1);
    });

    it('Trimestral 3 y Anual 12, sin importar si es primer pago', () => {
        const trimestral = plan({ name: 'Trimestral', initial_period_months: 3 });
        const anual = plan({ name: 'Anual', initial_period_months: 12 });
        expect(resolvePeriodMonths(trimestral, null)).toBe(3);
        expect(resolvePeriodMonths(trimestral, sub({ status: 'active' }))).toBe(3);
        expect(resolvePeriodMonths(anual, null)).toBe(12);
        expect(resolvePeriodMonths(anual, sub({ status: 'active' }))).toBe(12);
    });

    it('otros planes públicos caen en initial_period_months (default 1)', () => {
        expect(resolvePeriodMonths(plan({ name: 'Prueba Técnica', initial_period_months: 1 }), null)).toBe(1);
        expect(resolvePeriodMonths(plan({ name: 'Prueba Técnica', initial_period_months: null }), null)).toBe(1);
    });
});

describe('resolveAnchor', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const GRACE_MS = GRACE_ANCHOR_HOURS * 60 * 60 * 1000;
    const iso = (ms: number) => new Date(ms).toISOString();

    it('ancla en now cuando la vigencia venció hace más de un mes o no existe', () => {
        // Un mes vencido queda muy fuera de la gracia → now.
        expect(resolveAnchor(null, now).toISOString()).toBe(now.toISOString());
        expect(resolveAnchor(sub({ current_period_end: '2026-05-01T00:00:00.000Z' }), now).toISOString())
            .toBe(now.toISOString());
    });

    it('ancla en current_period_end cuando aún está vigente', () => {
        const future = '2026-07-15T00:00:00.000Z';
        expect(resolveAnchor(sub({ current_period_end: future }), now).toISOString())
            .toBe(new Date(future).toISOString());
    });

    // --- Tarea 2.1: tests unitarios de bordes ---

    it('borde exacto: vencida hace 48h exactas ancla en current_period_end (Req 2.3)', () => {
        const end = iso(now.getTime() - GRACE_MS);
        expect(resolveAnchor(sub({ current_period_end: end }), now).toISOString()).toBe(end);
    });

    it('borde por encima: vencida hace 48h + 1ms ancla en now (Req 3.1)', () => {
        const end = iso(now.getTime() - GRACE_MS - 1);
        expect(resolveAnchor(sub({ current_period_end: end }), now).toISOString())
            .toBe(now.toISOString());
    });

    it('sub null ancla en now (Req 3.2)', () => {
        expect(resolveAnchor(null, now).toISOString()).toBe(now.toISOString());
    });

    it('current_period_end null ancla en now (Req 3.3)', () => {
        expect(resolveAnchor(sub({ current_period_end: null }), now).toISOString())
            .toBe(now.toISOString());
    });

    it('vigencia mínima: vence 1ms en el futuro ancla en current_period_end (Req 1.1)', () => {
        const end = iso(now.getTime() + 1);
        expect(resolveAnchor(sub({ current_period_end: end }), now).toISOString()).toBe(end);
    });
});

describe('resolveAnchor — property tests', () => {
    const GRACE_MS = GRACE_ANCHOR_HOURS * 60 * 60 * 1000;
    // Rango temporal razonable para `now` (evita fechas inválidas).
    const nowMs = fc.integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2100, 0, 1) });

    it('Feature: anclaje-pago-gracia, Property 1: suscripción vigente ancla en el fin de vigencia', () => {
        fc.assert(
            fc.property(nowMs, fc.integer({ min: 1, max: 5 * 365 * 24 * 60 * 60 * 1000 }), (base, delta) => {
                const now = new Date(base);
                const end = new Date(base + delta); // futuro estricto
                const result = resolveAnchor(sub({ current_period_end: end.toISOString() }), now);
                expect(result.getTime()).toBe(end.getTime());
            }),
            { numRuns: 100 },
        );
    });

    it('Feature: anclaje-pago-gracia, Property 2: vencimiento dentro de la gracia ancla en el fin de vigencia', () => {
        fc.assert(
            fc.property(nowMs, fc.integer({ min: 0, max: GRACE_MS }), (base, delta) => {
                const now = new Date(base);
                const end = new Date(base - delta); // 0 <= delta <= 48h hacia el pasado (incluye borde)
                const result = resolveAnchor(sub({ current_period_end: end.toISOString() }), now);
                expect(result.getTime()).toBe(end.getTime());
            }),
            { numRuns: 100 },
        );
    });

    it('Feature: anclaje-pago-gracia, Property 3: vencimiento fuera de la gracia ancla en el momento del pago', () => {
        fc.assert(
            fc.property(nowMs, fc.integer({ min: GRACE_MS + 1, max: 5 * 365 * 24 * 60 * 60 * 1000 }), (base, delta) => {
                const now = new Date(base);
                const end = new Date(base - delta); // delta > 48h hacia el pasado
                const result = resolveAnchor(sub({ current_period_end: end.toISOString() }), now);
                expect(result.getTime()).toBe(now.getTime());
            }),
            { numRuns: 100 },
        );
    });

    it('Feature: anclaje-pago-gracia, Property 4: sin anclaje válido ancla en el momento del pago', () => {
        fc.assert(
            fc.property(nowMs, fc.boolean(), (base, subIsNull) => {
                const now = new Date(base);
                const input = subIsNull ? null : sub({ current_period_end: null });
                const result = resolveAnchor(input, now);
                expect(result.getTime()).toBe(now.getTime());
            }),
            { numRuns: 100 },
        );
    });

    it('Feature: anclaje-pago-gracia, Property 5: determinismo', () => {
        fc.assert(
            fc.property(
                nowMs,
                fc.integer({ min: -5 * 365 * 24 * 60 * 60 * 1000, max: 5 * 365 * 24 * 60 * 60 * 1000 }),
                fc.boolean(),
                (base, delta, subIsNull) => {
                    const now = new Date(base);
                    const input = subIsNull
                        ? null
                        : sub({ current_period_end: new Date(base + delta).toISOString() });
                    const first = resolveAnchor(input, now);
                    const second = resolveAnchor(input, now);
                    expect(first.getTime()).toBe(second.getTime());
                },
            ),
            { numRuns: 100 },
        );
    });

    it('Feature: anclaje-pago-gracia, Property 6: pureza — no mutación y tipo de retorno', () => {
        fc.assert(
            fc.property(
                nowMs,
                fc.integer({ min: -5 * 365 * 24 * 60 * 60 * 1000, max: 5 * 365 * 24 * 60 * 60 * 1000 }),
                (base, delta) => {
                    const now = new Date(base);
                    const input = sub({ current_period_end: new Date(base + delta).toISOString() });
                    const snapshot = JSON.stringify(input);
                    const result = resolveAnchor(input, now);
                    expect(JSON.stringify(input)).toBe(snapshot); // no mutación
                    expect(result instanceof Date).toBe(true); // tipo de retorno
                },
            ),
            { numRuns: 100 },
        );
    });
});

describe('addMonths', () => {
    it('suma meses calendario', () => {
        expect(addMonths(new Date('2026-06-01T00:00:00.000Z'), 12).toISOString())
            .toBe('2027-06-01T00:00:00.000Z');
        expect(addMonths(new Date('2026-06-01T00:00:00.000Z'), 3).toISOString())
            .toBe('2026-09-01T00:00:00.000Z');
    });
});
