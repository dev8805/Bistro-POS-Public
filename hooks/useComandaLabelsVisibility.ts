import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { isNetworkError } from '../lib/connectivity';

// ============================================================
// useComandaLabelsVisibility
// ------------------------------------------------------------
// Preferencia por negocio: qué pestañas del ComandaLabelModal se muestran u
// ocultan. Persistencia en Supabase (tabla `comanda_labels_visibility`) con
// caché en localStorage. Sin filtro por rol: cualquier miembro del negocio
// puede leer y modificar.
// ============================================================

export interface ComandaLabelsVisibility {
    locator: boolean;
    table: boolean;
    takeaway: boolean;
}

const DEFAULT_VISIBILITY: ComandaLabelsVisibility = {
    locator: true,
    table: true,
    takeaway: true,
};

const CACHE_VERSION = 'v1';
const cacheKey = (businessId: string) => `bistro_comanda_labels_visibility_${CACHE_VERSION}_${businessId}`;

const readCache = (businessId: string): ComandaLabelsVisibility | null => {
    try {
        const raw = localStorage.getItem(cacheKey(businessId));
        return raw ? (JSON.parse(raw) as ComandaLabelsVisibility) : null;
    } catch {
        return null;
    }
};

const writeCache = (businessId: string, value: ComandaLabelsVisibility) => {
    try {
        localStorage.setItem(cacheKey(businessId), JSON.stringify(value));
    } catch {
        // ignore quota errors
    }
};

interface UseComandaLabelsVisibilityResult {
    visibility: ComandaLabelsVisibility;
    loading: boolean;
    /** Refresca desde Supabase (crea el registro con defaults si no existe). */
    refresh: () => Promise<void>;
    /** Alterna una pestaña. Optimista con rollback ante error. */
    toggle: (key: keyof ComandaLabelsVisibility) => Promise<void>;
}

export const useComandaLabelsVisibility = (): UseComandaLabelsVisibilityResult => {
    const { profile } = useAuth();
    const businessId = profile?.business_id;

    const [visibility, setVisibility] = useState<ComandaLabelsVisibility>(DEFAULT_VISIBILITY);
    const [loading, setLoading] = useState(false);

    // Hidratación desde caché al montar.
    useEffect(() => {
        if (!businessId) return;
        const cached = readCache(businessId);
        if (cached) setVisibility(cached);
    }, [businessId]);

    const refresh = useCallback(async () => {
        if (!businessId) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('comanda_labels_visibility')
                .select('locator_visible, table_visible, takeaway_visible')
                .eq('business_id', businessId)
                .maybeSingle();

            if (error) throw error;

            if (data) {
                const parsed: ComandaLabelsVisibility = {
                    locator: data.locator_visible,
                    table: data.table_visible,
                    takeaway: data.takeaway_visible,
                };
                setVisibility(parsed);
                writeCache(businessId, parsed);
            } else {
                // No existe registro aún. Insertamos defaults para no depender
                // del primer toggle.
                await supabase
                    .from('comanda_labels_visibility')
                    .insert({ business_id: businessId });
                setVisibility(DEFAULT_VISIBILITY);
                writeCache(businessId, DEFAULT_VISIBILITY);
            }
        } catch (err) {
            if (isNetworkError(err)) {
                const cached = readCache(businessId);
                if (cached) setVisibility(cached);
            }
            // errores no-red: silenciosos, se usan defaults
        } finally {
            setLoading(false);
        }
    }, [businessId]);

    const toggle = useCallback(async (key: keyof ComandaLabelsVisibility) => {
        if (!businessId) return;
        const prev = visibility;
        const next: ComandaLabelsVisibility = { ...prev, [key]: !prev[key] };

        // Restricción de UX: al menos una pestaña siempre visible.
        // Si el toggle deja todo en false, revertimos silenciosamente.
        if (!next.locator && !next.table && !next.takeaway) {
            return;
        }

        // Optimista.
        setVisibility(next);
        writeCache(businessId, next);

        const payload = {
            business_id: businessId,
            locator_visible: next.locator,
            table_visible: next.table,
            takeaway_visible: next.takeaway,
        };

        const { error } = await supabase
            .from('comanda_labels_visibility')
            .upsert(payload, { onConflict: 'business_id' });

        if (error) {
            // Rollback.
            setVisibility(prev);
            writeCache(businessId, prev);
        }
    }, [businessId, visibility]);

    return { visibility, loading, refresh, toggle };
};
