import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import type { SubscriptionPlan } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

/**
 * Resuelve los planes personalizados del negocio actual.
 *
 * Un plan personalizado se identifica por `subscription_plans.assigned_business_id`
 * igual al `business_id` del negocio y `is_active = true`.
 *
 * Puede haber hasta 3 (mensual, trimestral, anual) con el nuevo índice parcial
 * `subscription_plans_one_active_custom_per_business_period`.
 *
 * Mantiene compatibilidad con consumidores que solo usan `hasCustomPlan` y
 * `customPlan` (devuelve el primero del array, que es el de menor periodicidad).
 */
export interface UseCustomPlanResult {
    /** true si el negocio tiene al menos 1 plan personalizado activo */
    hasCustomPlan: boolean;
    /** Plan personalizado principal (el de menor periodicidad). Compat con UI existente. */
    customPlan: SubscriptionPlan | null;
    /** Monto del plan principal */
    customPlanAmount: number | null;
    /** Todos los planes personalizados activos del negocio (ordenados por meses asc) */
    customPlans: SubscriptionPlan[];
}

export const useCustomPlan = (): UseCustomPlanResult => {
    const { profile, subscription } = useAuth();
    const [customPlans, setCustomPlans] = useState<SubscriptionPlan[]>([]);

    useEffect(() => {
        if (!profile?.business_id) {
            setCustomPlans([]);
            return;
        }

        const fetchCustomPlans = async () => {
            const { data } = await supabase
                .from('subscription_plans')
                .select('id, name, price_monthly, initial_period_months, assigned_business_id, features, is_active')
                .eq('assigned_business_id', profile.business_id)
                .eq('is_active', true)
                .order('initial_period_months', { ascending: true });

            setCustomPlans((data as SubscriptionPlan[]) ?? []);
        };

        fetchCustomPlans();
    }, [profile?.business_id]);

    // Fallback: si la query directa no trajo nada, intentar con el plan del subscription join
    const planFromSub = subscription?.plan ?? null;
    const subPlanIsCustom =
        !!planFromSub?.assigned_business_id &&
        planFromSub.assigned_business_id === profile?.business_id &&
        planFromSub.is_active;

    const allPlans = customPlans.length > 0
        ? customPlans
        : (subPlanIsCustom ? [planFromSub!] : []);

    const hasCustomPlan = allPlans.length > 0;
    const primaryPlan = allPlans[0] ?? null;

    return {
        hasCustomPlan,
        customPlan: primaryPlan,
        customPlanAmount: primaryPlan ? Number(primaryPlan.price_monthly) : null,
        customPlans: allPlans,
    };
};
