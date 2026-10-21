import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { isNetworkError } from '../lib/connectivity';

// ============================================================
// useComandaLabels
// ------------------------------------------------------------
// Hook para leer/editar las etiquetas rápidas del modal de comanda
// (Localizador y Mesas) que se muestran en SuccessScreen/SuccessSidebar.
//
// Persistencia: tabla public.comanda_labels en Supabase (compartida por negocio).
// Cache: localStorage por business_id para tolerar red intermitente al leer.
// Semilla: la primera vez que un negocio no tiene registros de un `kind`,
//          se insertan los 10 valores por defecto (L1..L10 / M1..M10).
// ============================================================

export type ComandaLabelKind = 'locator' | 'table' | 'takeaway';

export interface ComandaLabel {
    id: string;
    kind: ComandaLabelKind;
    value: string;
    position: number;
}

interface UseComandaLabelsResult {
    locators: ComandaLabel[];
    tables: ComandaLabel[];
    takeaways: ComandaLabel[];
    loading: boolean;
    error: string | null;
    /** Refresca desde Supabase (dispara seed si el negocio no tiene datos aún). */
    refresh: () => Promise<void>;
    /** Agrega una etiqueta al final. Devuelve el registro creado. */
    addLabel: (kind: ComandaLabelKind, value: string) => Promise<void>;
    /** Elimina una etiqueta por id. */
    removeLabel: (id: string) => Promise<void>;
    /** Renombra una etiqueta por id (sin tocar posición). */
    renameLabel: (id: string, newValue: string) => Promise<void>;
}

const DEFAULT_LOCATORS = Array.from({ length: 10 }, (_, i) => String(i + 1));
const DEFAULT_TABLES = Array.from({ length: 10 }, (_, i) => String(i + 1));
const DEFAULT_TAKEAWAYS = ['Para llevar', 'Domicilio'];

// Version del formato del cache. Se incrementa cuando cambia la forma o el
// contenido semilla, para invalidar cachés antiguos y forzar refetch limpio.
// v1: defaults L1..L10 / M1..M10
// v2: defaults 1..10 sin prefijos
// v3: se agrega kind 'takeaway' (Para llevar / Domicilio como defaults)
const CACHE_VERSION = 'v3';
const cacheKey = (businessId: string) => `bistro_comanda_labels_${CACHE_VERSION}_${businessId}`;

const readCache = (businessId: string): ComandaLabel[] | null => {
    try {
        const raw = localStorage.getItem(cacheKey(businessId));
        return raw ? (JSON.parse(raw) as ComandaLabel[]) : null;
    } catch {
        return null;
    }
};

const writeCache = (businessId: string, rows: ComandaLabel[]) => {
    try {
        localStorage.setItem(cacheKey(businessId), JSON.stringify(rows));
    } catch {
        // ignore quota errors
    }
};

export const useComandaLabels = (): UseComandaLabelsResult => {
    const { profile } = useAuth();
    const businessId = profile?.business_id;

    const [rows, setRows] = useState<ComandaLabel[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Hidratamos desde caché al montar para que el modal abra ya con contenido.
    useEffect(() => {
        if (!businessId) return;
        const cached = readCache(businessId);
        if (cached && cached.length > 0) setRows(cached);
    }, [businessId]);

    // Semilla idempotente: inserta defaults por kind si no existen todavía.
    // La UNIQUE(business_id, kind, value) evita duplicados si otro dispositivo
    // hizo el seed en paralelo.
    const seedDefaults = useCallback(async (bId: string) => {
        const payload = [
            ...DEFAULT_LOCATORS.map((value, i) => ({ business_id: bId, kind: 'locator' as const, value, position: i })),
            ...DEFAULT_TABLES.map((value, i) => ({ business_id: bId, kind: 'table' as const, value, position: i })),
            ...DEFAULT_TAKEAWAYS.map((value, i) => ({ business_id: bId, kind: 'takeaway' as const, value, position: i })),
        ];
        // ignoreDuplicates + onConflict para que sea seguro correrlo dos veces.
        await supabase
            .from('comanda_labels')
            .upsert(payload, { onConflict: 'business_id,kind,value', ignoreDuplicates: true });
    }, []);

    const refresh = useCallback(async () => {
        if (!businessId) return;
        setLoading(true);
        setError(null);
        try {
            const { data, error: fetchErr } = await supabase
                .from('comanda_labels')
                .select('id,kind,value,position')
                .eq('business_id', businessId)
                .order('kind', { ascending: true })
                .order('position', { ascending: true });

            if (fetchErr) throw fetchErr;

            let list = (data || []) as ComandaLabel[];

            // Seed si no hay nada para este negocio.
            if (list.length === 0) {
                await seedDefaults(businessId);
                const { data: seeded } = await supabase
                    .from('comanda_labels')
                    .select('id,kind,value,position')
                    .eq('business_id', businessId)
                    .order('kind', { ascending: true })
                    .order('position', { ascending: true });
                list = (seeded || []) as ComandaLabel[];
            }

            setRows(list);
            writeCache(businessId, list);
        } catch (err) {
            if (isNetworkError(err)) {
                // Sin red: usamos caché si existe.
                const cached = readCache(businessId);
                if (cached) setRows(cached);
            } else {
                setError((err as Error).message || 'No se pudieron cargar las etiquetas');
            }
        } finally {
            setLoading(false);
        }
    }, [businessId, seedDefaults]);

    const addLabel = useCallback(async (kind: ComandaLabelKind, value: string) => {
        if (!businessId) return;
        const clean = value.trim();
        if (!clean) return;
        // Position: al final del grupo.
        const currentOfKind = rows.filter(r => r.kind === kind);
        const nextPosition = currentOfKind.length > 0
            ? Math.max(...currentOfKind.map(r => r.position)) + 1
            : 0;

        const { data, error: insErr } = await supabase
            .from('comanda_labels')
            .insert({ business_id: businessId, kind, value: clean, position: nextPosition })
            .select('id,kind,value,position')
            .single();

        if (insErr) {
            setError(insErr.message);
            throw insErr;
        }
        if (data) {
            setRows(prev => {
                const next = [...prev, data as ComandaLabel];
                writeCache(businessId, next);
                return next;
            });
        }
    }, [businessId, rows]);

    const removeLabel = useCallback(async (id: string) => {
        if (!businessId) return;
        const prev = rows;
        // Optimista: quitamos localmente primero.
        setRows(rows.filter(r => r.id !== id));
        const { error: delErr } = await supabase
            .from('comanda_labels')
            .delete()
            .eq('id', id);
        if (delErr) {
            setError(delErr.message);
            setRows(prev);
            throw delErr;
        }
        writeCache(businessId, rows.filter(r => r.id !== id));
    }, [businessId, rows]);

    const renameLabel = useCallback(async (id: string, newValue: string) => {
        if (!businessId) return;
        const clean = newValue.trim();
        if (!clean) return;
        const prev = rows;
        // Optimista: renombramos localmente.
        setRows(rows.map(r => r.id === id ? { ...r, value: clean } : r));
        const { error: updErr } = await supabase
            .from('comanda_labels')
            .update({ value: clean })
            .eq('id', id);
        if (updErr) {
            setError(updErr.message);
            setRows(prev);
            throw updErr;
        }
        writeCache(businessId, rows.map(r => r.id === id ? { ...r, value: clean } : r));
    }, [businessId, rows]);

    const locators = useMemo(
        () => rows.filter(r => r.kind === 'locator').sort((a, b) => a.position - b.position),
        [rows]
    );
    const tables = useMemo(
        () => rows.filter(r => r.kind === 'table').sort((a, b) => a.position - b.position),
        [rows]
    );
    const takeaways = useMemo(
        () => rows.filter(r => r.kind === 'takeaway').sort((a, b) => a.position - b.position),
        [rows]
    );

    return { locators, tables, takeaways, loading, error, refresh, addLabel, removeLabel, renameLabel };
};
