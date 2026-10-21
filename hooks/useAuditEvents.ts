/**
 * useAuditEvents (Fase 3 — datos reales)
 *
 * Consulta paginada y filtrable de `audit_events` en Supabase. RLS limita los
 * resultados al negocio del usuario autenticado. Mantiene la misma interfaz de
 * retorno que la versión mock para no tocar la pantalla.
 *
 * Filtros: rango de fecha (presets + personalizado), empleado, categoría,
 * severidad, búsqueda libre. Persiste filtros en la query string de la URL.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
    AuditEvent,
    AuditCategory,
    AuditSeverity,
} from '../lib/activityMockData';

export type DatePreset = 'today' | 'yesterday' | '7days' | '30days' | 'custom';

export interface AuditFilters {
    preset: DatePreset;
    customStart: string | null; // YYYY-MM-DD
    customEnd: string | null;   // YYYY-MM-DD
    userId: string | null;
    category: AuditCategory | 'all';
    severity: AuditSeverity | 'all';
    search: string;
}

const PAGE_SIZE = 50;
const HOT_WINDOW_DAYS = 90;

export const DEFAULT_FILTERS: AuditFilters = {
    preset: '7days',
    customStart: null,
    customEnd: null,
    userId: null,
    category: 'all',
    severity: 'all',
    search: '',
};

// ── Persistencia en URL ────────────────────────────────────────────────────
const readFiltersFromUrl = (): AuditFilters => {
    if (typeof window === 'undefined') return DEFAULT_FILTERS;
    const p = new URLSearchParams(window.location.search);
    return {
        preset: (p.get('preset') as DatePreset) || DEFAULT_FILTERS.preset,
        customStart: p.get('start'),
        customEnd: p.get('end'),
        userId: p.get('user'),
        category: (p.get('cat') as AuditCategory | 'all') || 'all',
        severity: (p.get('sev') as AuditSeverity | 'all') || 'all',
        search: p.get('q') || '',
    };
};

const rangeStartFor = (f: AuditFilters): Date => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (f.preset) {
        case 'today': return startOfToday;
        case 'yesterday': return new Date(startOfToday.getTime() - 86_400_000);
        case '7days': return new Date(startOfToday.getTime() - 6 * 86_400_000);
        case '30days': return new Date(startOfToday.getTime() - 29 * 86_400_000);
        case 'custom': return f.customStart ? new Date(f.customStart + 'T00:00:00') : new Date(Date.now() - HOT_WINDOW_DAYS * 86_400_000);
    }
};

const rangeEndFor = (f: AuditFilters): Date => {
    const now = new Date();
    if (f.preset === 'yesterday') {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return new Date(startOfToday.getTime() - 1);
    }
    if (f.preset === 'custom' && f.customEnd) {
        return new Date(f.customEnd + 'T23:59:59.999');
    }
    return now;
};

export const useAuditEvents = (initialFilters?: Partial<AuditFilters>) => {
    const [filters, setFiltersState] = useState<AuditFilters>(() => ({
        ...readFiltersFromUrl(),
        ...initialFilters,
    }));
    const [events, setEvents] = useState<AuditEvent[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [employees, setEmployees] = useState<Array<{ id: string; name: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    // Clave para forzar recarga manual (botón "Refrescar"). Incrementarla re-ejecuta
    // la consulta principal sin cambiar filtros ni página.
    const [refreshKey, setRefreshKey] = useState(0);

    // Reiniciar paginación al cambiar filtros. Los filtros NO se escriben en la
    // URL: viven solo en estado de React, así la URL queda siempre limpia.
    useEffect(() => {
        setPage(1);
    }, [filters]);

    // Limpiar los params del visor de la URL al montar. La URL solo sirve para
    // recibir contexto del vínculo cruzado (p. ej. `?user=X` desde el reporte de
    // ventas); una vez leído en el estado inicial, se borra para no dejar query
    // strings pegados (`?preset=...`) al navegar a otras pantallas o al refrescar.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const p = new URLSearchParams(window.location.search);
        let changed = false;
        ['preset', 'start', 'end', 'user', 'cat', 'sev', 'q'].forEach(k => {
            if (p.has(k)) { p.delete(k); changed = true; }
        });
        if (changed) {
            const qs = p.toString();
            const newUrl = `${window.location.pathname}${qs ? '?' + qs : ''}${window.location.hash}`;
            window.history.replaceState(window.history.state, '', newUrl);
        }
    }, []);

    const setFilters = useCallback((patch: Partial<AuditFilters>) => {
        setFiltersState(prev => ({ ...prev, ...patch }));
    }, []);

    const resetFilters = useCallback(() => setFiltersState(DEFAULT_FILTERS), []);

    // Lista de empleados del negocio para el filtro (incluye archivados).
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data } = await supabase
                .from('profiles')
                .select('id, full_name')
                .order('full_name', { ascending: true });
            if (!cancelled && data) {
                setEmployees(data.map((p: any) => ({ id: p.id, name: p.full_name || 'Sin nombre' })));
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Consulta principal: se re-ejecuta al cambiar filtros o página.
    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        const startIso = rangeStartFor(filters).toISOString();
        const endIso = rangeEndFor(filters).toISOString();

        let query = supabase
            .from('audit_events')
            .select('*', { count: 'exact' })
            .gte('created_at', startIso)
            .lte('created_at', endIso)
            .order('created_at', { ascending: false })
            .range(0, page * PAGE_SIZE - 1);

        if (filters.userId) query = query.eq('user_id', filters.userId);
        if (filters.category !== 'all') query = query.eq('category', filters.category);
        if (filters.severity !== 'all') query = query.eq('severity', filters.severity);
        if (filters.search.trim()) {
            const q = filters.search.trim();
            query = query.or(`description.ilike.%${q}%,action.ilike.%${q}%,user_name.ilike.%${q}%`);
        }

        query.then(({ data, count, error }) => {
            if (cancelled) return;
            if (error) {
                console.warn('[useAuditEvents] error:', error.message);
                setEvents([]);
                setTotalCount(0);
            } else {
                setEvents((data || []) as AuditEvent[]);
                setTotalCount(count ?? (data?.length || 0));
            }
            setLoading(false);
        });

        return () => { cancelled = true; };
    }, [filters, page, refreshKey]);

    const hasMore = events.length < totalCount;
    const loadMore = useCallback(() => setPage(p => p + 1), []);

    const isLongRange = useMemo(() => {
        if (filters.preset !== 'custom' || !filters.customStart) return false;
        const days = (rangeEndFor(filters).getTime() - rangeStartFor(filters).getTime()) / 86_400_000;
        return days > HOT_WINDOW_DAYS;
    }, [filters]);

    const reload = useCallback(() => setRefreshKey(k => k + 1), []);

    return {
        events,
        totalCount,
        loading,
        hasMore,
        loadMore,
        reload,
        filters,
        setFilters,
        resetFilters,
        employees,
        isLongRange,
    };
};
