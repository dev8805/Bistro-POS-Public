import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { offlineQueue } from '../lib/offlineQueue';
import { isNetworkError } from '../lib/connectivity';
import { getAllDirtyTableOrders, getCachedTables } from '../lib/offlineTableStore';

// =====================================================
// Types
// =====================================================

export interface CashRegister {
    id: string;
    business_id: string;
    name: string;
    description?: string;
    is_active: boolean;
    created_at: string;
}

export interface CashShift {
    id: string;
    business_id: string;
    register_id: string;
    opened_by: string;
    closed_by?: string;
    opened_at: string;
    closed_at?: string;
    opening_balance: number;
    expected_cash: number;
    declared_cash?: number;
    difference?: number;
    total_sales: number;
    total_cash_sales: number;
    total_card_sales: number;
    total_transfer_sales: number;
    total_credit_sales: number;
    total_expenses: number;
    total_cash_in: number;
    total_cash_out: number;
    total_refunds?: number;
    total_other_withdrawals?: number;
    orders_count: number;
    status: 'open' | 'closed' | 'reconciled';
    notes?: string;
    shift_number?: number;
    sales_by_method?: Record<string, number>;
    declared_by_method?: Record<string, number>;
    created_at: string;
    updated_at: string;
    // Joined data
    register?: CashRegister;
    opened_by_profile?: { full_name: string };
    closed_by_profile?: { full_name: string };
}

export interface CashMovement {
    id: string;
    shift_id: string;
    created_by: string;
    type: 'opening' | 'cash_in' | 'cash_out' | 'sale' | 'expense' | 'refund' | 'purchase';
    amount: number;
    description?: string;
    reference_id?: string;
    reference_type?: 'order' | 'expense' | 'purchase';
    payment_method?: string;
    created_at: string;
    // Joined data
    created_by_profile?: { full_name: string };
}

// Payment methods available in the system
export const PAYMENT_METHODS = [
    { id: 'cash', label: 'Efectivo', icon: 'payments' },
    { id: 'nequi', label: 'Nequi', icon: 'phone_android' },
    { id: 'daviplata', label: 'Daviplata', icon: 'phone_android' },
    { id: 'card', label: 'Tarjeta', icon: 'credit_card' },
    { id: 'transfer', label: 'Transferencia', icon: 'account_balance' },
    { id: 'other', label: 'Otro', icon: 'more_horiz' },
];

// Colombian peso denominations
export const DENOMINATIONS = {
    bills: [
        { value: 100000, label: '$100,000' },
        { value: 50000, label: '$50,000' },
        { value: 20000, label: '$20,000' },
        { value: 10000, label: '$10,000' },
        { value: 5000, label: '$5,000' },
        { value: 2000, label: '$2,000' },
        { value: 1000, label: '$1,000' },
    ],
    coins: [
        { value: 1000, label: '$1,000' },
        { value: 500, label: '$500' },
        { value: 200, label: '$200' },
        { value: 100, label: '$100' },
        { value: 50, label: '$50' },
    ],
};

// =====================================================
// Hook
// =====================================================

const MOVEMENTS_PAGE_SIZE = 20;

export function useCashRegister() {
    const { profile } = useAuth();
    const businessId = profile?.business_id;
    const userId = profile?.id;

    const [registers, setRegisters] = useState<CashRegister[]>([]);
    const activeShiftRef = useRef<CashShift | null>(null);
    const [activeShift, setActiveShift] = useState<CashShift | null>(() => {
        if (typeof window !== 'undefined' && businessId) {
            const cached = localStorage.getItem(`bistro_active_shift_${businessId}`);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    activeShiftRef.current = parsed;
                    return parsed;
                } catch { }
            }
        }
        return null;
    });
    const [shifts, setShifts] = useState<CashShift[]>([]);
    const [shiftsLoading, setShiftsLoading] = useState(false);
    const [movements, setMovements] = useState<CashMovement[]>([]);
    const [hasMoreMovements, setHasMoreMovements] = useState(false);
    const [loadingMoreMovements, setLoadingMoreMovements] = useState(false);
    const [shiftBalances, setShiftBalances] = useState<Record<string, number>>(() => {
        if (typeof window !== 'undefined' && businessId) {
            const cached = localStorage.getItem(`bistro_active_balances_${businessId}`);
            if (cached) {
                try { return JSON.parse(cached); } catch { }
            }
        }
        return {
            cash: 0,
            nequi: 0,
            daviplata: 0,
            card: 0,
            transfer: 0,
            other: 0,
        };
    });
    const [occupiedRegisters, setOccupiedRegisters] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [movementsLoading, setMovementsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const lastFetchedShiftIdRef = useRef<string | undefined>(undefined);

    useEffect(() => {
        activeShiftRef.current = activeShift;
    }, [activeShift]);

    // Escuchar inyecciones de movimientos offline desde pushOfflineCashMovement
    useEffect(() => {
        const handleOfflineCashUpdate = (e: CustomEvent) => {
            if (!businessId || e.detail?.businessId !== businessId) return;
            const cached = localStorage.getItem(`bistro_active_movements_${businessId}`);
            if (cached) {
                try { setMovements(JSON.parse(cached)); } catch { }
            }
        };
        window.addEventListener('offline-cash-updated', handleOfflineCashUpdate as EventListener);
        return () => window.removeEventListener('offline-cash-updated', handleOfflineCashUpdate as EventListener);
    }, [businessId]);

    // Notificar al resto de la app (HomeScreen, etc.) cada vez que los movimientos cambian,
    // saltando la hidratación inicial para no disparar refetches innecesarios al montar.
    const movementsHydratedRef = useRef(false);
    useEffect(() => {
        if (!movementsHydratedRef.current) {
            movementsHydratedRef.current = true;
            return;
        }
        window.dispatchEvent(new CustomEvent('cash-movement-changed'));
    }, [movements]);

    // =====================================================
    // Fetch Functions
    // =====================================================

    // Fetch all cash registers for the business
    const fetchRegisters = useCallback(async () => {
        if (!businessId) return;

        try {
            const { data, error } = await supabase
                .from('cash_registers')
                .select('*')
                .eq('business_id', businessId)
                .eq('is_active', true)
                .order('created_at', { ascending: true });

            if (error) throw error;
            setRegisters(data || []);
            // Guardar en caché para que esté disponible de una sesión anterior si abre offline
            localStorage.setItem(`bistro_registers_${businessId}`, JSON.stringify(data || []));
        } catch (err: any) {
            if (isNetworkError(err)) {
                const cached = localStorage.getItem(`bistro_registers_${businessId}`);
                if (cached) setRegisters(JSON.parse(cached));
            } else {
                console.error('Error fetching registers:', err);
                setError(err.message);
            }
        }
    }, [businessId]);

    // Fetch the active (open) shift for the current user
    const fetchActiveShift = useCallback(async (): Promise<CashShift | null> => {
        if (!businessId || !userId) return null;

        try {
            const { data, error } = await supabase
                .from('cash_shifts')
                .select(`
                    *,
                    register:cash_registers(*),
                    opened_by_profile:profiles!cash_shifts_opened_by_fkey(full_name)
                `)
                .eq('business_id', businessId)
                .eq('opened_by', userId)
                .eq('status', 'open')
                .order('opened_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) throw error;
            setActiveShift(data);
            activeShiftRef.current = data;
            if (data) {
                localStorage.setItem(`bistro_active_shift_${businessId}`, JSON.stringify(data));
            } else {
                localStorage.removeItem(`bistro_active_shift_${businessId}`);
            }
            return data;
        } catch (err: any) {
            if (isNetworkError(err)) {
                const cached = localStorage.getItem(`bistro_active_shift_${businessId}`);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    setActiveShift(parsed);
                    activeShiftRef.current = parsed;
                    return parsed;
                }
            } else {
                console.error('Error fetching active shift:', err);
                setError(err.message);
            }
            return null;
        }
    }, [businessId, userId]);

    // Fetch which registers have open shifts by OTHER employees
    const fetchOccupiedRegisters = useCallback(async () => {
        if (!businessId || !userId) return;

        try {
            const { data, error } = await supabase
                .from('cash_shifts')
                .select(`
                    register_id,
                    opened_by_profile:profiles!cash_shifts_opened_by_fkey(full_name)
                `)
                .eq('business_id', businessId)
                .eq('status', 'open')
                .neq('opened_by', userId);

            if (error) throw error;

            const occupied: Record<string, string> = {};
            (data || []).forEach((shift: any) => {
                occupied[shift.register_id] = shift.opened_by_profile?.full_name || 'Otro empleado';
            });
            setOccupiedRegisters(occupied);
            localStorage.setItem(`bistro_occupied_registers_${businessId}`, JSON.stringify(occupied));
        } catch (err: any) {
            if (isNetworkError(err)) {
                const cached = localStorage.getItem(`bistro_occupied_registers_${businessId}`);
                if (cached) setOccupiedRegisters(JSON.parse(cached));
            } else {
                console.error('Error fetching occupied registers:', err);
            }
        }
    }, [businessId, userId]);

    // Fetch shift history
    // Lista liviana (optimización egress): solo las columnas que muestra el
    // historial con límite configurable (por defecto 10) y filtros de fecha opcionales.
    const fetchShifts = useCallback(async (limit: number = 10, startDate?: string, endDate?: string) => {
        if (!businessId) return;

        setShiftsLoading(true);
        try {
            let query = supabase
                .from('cash_shifts')
                .select(`
                    id, status, opened_by, opened_at, closed_at, total_sales, difference, shift_number,
                    register:cash_registers(name),
                    opened_by_profile:profiles!cash_shifts_opened_by_fkey(full_name)
                `)
                .eq('business_id', businessId)
                .order('opened_at', { ascending: false });

            if (startDate) {
                query = query.gte('opened_at', startDate);
            }
            if (endDate) {
                query = query.lte('opened_at', endDate);
            }

            query = query.limit(limit);

            const { data, error } = await query;

            if (error) throw error;
            setShifts((data as any) || []);
        } catch (err: any) {
            if (isNetworkError(err)) {
                // Offline: el historial no es crítico, simplemente vaciar y no mostrar error
                setShifts([]);
            } else {
                console.error('Error fetching shifts:', err);
                setError(err.message);
            }
        } finally {
            setShiftsLoading(false);
        }
    }, [businessId]);

    // Fetch balances acumulados del turno activo de manera ultra liviana (select exacto: type, payment_method, amount)
    const fetchBalances = useCallback(async (shiftId?: string, openingBalance?: number) => {
        const targetShiftId = shiftId || activeShiftRef.current?.id;
        if (!targetShiftId) {
            setShiftBalances({
                cash: 0,
                nequi: 0,
                daviplata: 0,
                card: 0,
                transfer: 0,
                other: 0,
            });
            return;
        }

        const baseCash = openingBalance !== undefined
            ? openingBalance
            : (activeShiftRef.current?.opening_balance || 0);

        try {
            const { data, error } = await supabase
                .from('cash_movements')
                .select('type, payment_method, amount')
                .eq('shift_id', targetShiftId);

            if (error) throw error;

            const result: Record<string, number> = {
                cash: baseCash,
                nequi: 0,
                daviplata: 0,
                card: 0,
                transfer: 0,
                other: 0,
            };

            (data || []).forEach((m: any) => {
                const method = m.payment_method || 'cash';
                const isIncome = m.type === 'cash_in' || m.type === 'sale';
                const isOutcome = m.type === 'cash_out' || m.type === 'expense' || m.type === 'refund' || m.type === 'purchase';

                if (isIncome) {
                    result[method] = (result[method] || 0) + Number(m.amount);
                } else if (isOutcome) {
                    result[method] = (result[method] || 0) - Number(m.amount);
                }
            });

            setShiftBalances(result);
            if (businessId) {
                localStorage.setItem(`bistro_active_balances_${businessId}`, JSON.stringify(result));
            }
        } catch (err: any) {
            if (isNetworkError(err)) {
                const cached = localStorage.getItem(`bistro_active_movements_${businessId}`);
                if (cached) {
                    try {
                        const parsed = JSON.parse(cached);
                        const result: Record<string, number> = {
                            cash: baseCash,
                            nequi: 0,
                            daviplata: 0,
                            card: 0,
                            transfer: 0,
                            other: 0,
                        };
                        parsed.forEach((m: any) => {
                            const method = m.payment_method || 'cash';
                            const isIncome = m.type === 'cash_in' || m.type === 'sale';
                            const isOutcome = m.type === 'cash_out' || m.type === 'expense' || m.type === 'refund' || m.type === 'purchase';
                            if (isIncome) result[method] = (result[method] || 0) + Number(m.amount);
                            else if (isOutcome) result[method] = (result[method] || 0) - Number(m.amount);
                        });
                        setShiftBalances(result);
                    } catch { }
                }
            } else {
                console.error('Error fetching shift balances:', err);
            }
        }
    }, [businessId]);

    // Fetch movements for the active shift (primeros 20 movimientos sin joins innecesarios)
    const fetchMovements = useCallback(async (shiftId?: string, openingBalance?: number) => {
        const targetShiftId = shiftId || activeShiftRef.current?.id;
        const targetOpening = openingBalance !== undefined
            ? openingBalance
            : (activeShiftRef.current?.opening_balance || 0);

        if (!targetShiftId) {
            setMovements([]);
            setHasMoreMovements(false);
            return;
        }

        setMovementsLoading(true);
        try {
            const { data, error } = await supabase
                .from('cash_movements')
                .select(`
                    id, shift_id, created_by, type, amount, description, payment_method, reference_id, reference_type, created_at
                `)
                .eq('shift_id', targetShiftId)
                .order('created_at', { ascending: false })
                .range(0, MOVEMENTS_PAGE_SIZE - 1);

            if (error) throw error;
            const items = data || [];
            setMovements(items);
            setHasMoreMovements(items.length === MOVEMENTS_PAGE_SIZE);
            lastFetchedShiftIdRef.current = targetShiftId;
            localStorage.setItem(`bistro_active_movements_${businessId}`, JSON.stringify(items));
        } catch (err: any) {
            if (isNetworkError(err)) {
                const cached = localStorage.getItem(`bistro_active_movements_${businessId}`);
                if (cached) {
                    setMovements(JSON.parse(cached));
                    lastFetchedShiftIdRef.current = targetShiftId;
                }
            } else {
                console.error('Error fetching movements:', err);
                setError(err.message);
            }
        } finally {
            setMovementsLoading(false);
        }

        // Siempre calculamos el balance consolidado del turno con la base garantizada
        await fetchBalances(targetShiftId, targetOpening);
    }, [businessId, fetchBalances]);

    // Cargar los siguientes 20 movimientos del turno (scroll infinito)
    const fetchMoreMovements = useCallback(async () => {
        const targetShiftId = activeShift?.id;
        if (!targetShiftId || loadingMoreMovements || !hasMoreMovements) return;

        setLoadingMoreMovements(true);
        try {
            const from = movements.length;
            const to = from + MOVEMENTS_PAGE_SIZE - 1;
            const { data, error } = await supabase
                .from('cash_movements')
                .select(`
                    id, shift_id, created_by, type, amount, description, payment_method, reference_id, reference_type, created_at
                `)
                .eq('shift_id', targetShiftId)
                .order('created_at', { ascending: false })
                .range(from, to);

            if (error) throw error;
            const newItems = data || [];
            if (newItems.length > 0) {
                setMovements(prev => [...prev, ...newItems]);
            }
            if (newItems.length < MOVEMENTS_PAGE_SIZE) {
                setHasMoreMovements(false);
            }
        } catch (err: any) {
            console.error('Error fetching more movements:', err);
        } finally {
            setLoadingMoreMovements(false);
        }
    }, [activeShift?.id, movements.length, loadingMoreMovements, hasMoreMovements]);

    // =====================================================
    // Action Functions
    // =====================================================

    // Open a new shift
    const openShift = useCallback(async (registerId: string, openingBalance: number): Promise<CashShift | null> => {
        if (!businessId || !userId) {
            setError('No business or user found');
            return null;
        }

        if (activeShift) {
            setError('Ya hay un turno abierto. Ciérralo antes de abrir uno nuevo.');
            return null;
        }

        // OFFLINE: guardar en cola y simular turno local. Adjuntamos el objeto
        // `register` desde el caché en memoria (registers) para que la UI muestre
        // el NOMBRE de la caja —no solo el id— en el turno abierto offline.
        const openShiftOffline = async (): Promise<CashShift> => {
            const localShiftId = `offline_shift_${Date.now()}`;
            const reg = registers.find(r => r.id === registerId);
            const localShift: CashShift = {
                id: localShiftId,
                business_id: businessId,
                register_id: registerId,
                register: reg,
                opened_by: userId,
                opened_by_profile: profile?.full_name ? { full_name: profile.full_name } : undefined,
                opening_balance: openingBalance,
                expected_cash: openingBalance,
                total_sales: 0, total_cash_sales: 0, total_card_sales: 0,
                total_transfer_sales: 0, total_credit_sales: 0,
                total_expenses: 0, total_cash_in: 0, total_cash_out: 0,
                orders_count: 0, status: 'open',
                opened_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            await offlineQueue.add('open_shift', { registerId, openingBalance, localShiftId }, businessId, userId);
            setActiveShift(localShift);
            localStorage.setItem(`bistro_active_shift_${businessId}`, JSON.stringify(localShift));

            const initMovements: CashMovement[] = [{ id: 'offline_open', shift_id: localShiftId, created_by: userId, type: 'opening', amount: openingBalance, description: 'Balance inicial (offline)', created_at: new Date().toISOString() }];
            setMovements(initMovements as any);
            setShiftBalances({
                cash: openingBalance,
                nequi: 0,
                daviplata: 0,
                card: 0,
                transfer: 0,
                other: 0,
            });
            setHasMoreMovements(false);
            localStorage.setItem(`bistro_active_movements_${businessId}`, JSON.stringify(initMovements));
            return localShift;
        };

        if (!navigator.onLine) {
            return openShiftOffline();
        }

        try {
            setLoading(true);

            const { data: shift, error: shiftError } = await supabase
                .from('cash_shifts')
                .insert({
                    business_id: businessId,
                    register_id: registerId,
                    opened_by: userId,
                    opening_balance: openingBalance,
                    expected_cash: openingBalance,
                    status: 'open',
                })
                .select(`*, register:cash_registers(*)`)
                .single();

            if (shiftError) throw shiftError;

            await supabase.from('cash_movements').insert({
                shift_id: shift.id,
                created_by: userId,
                type: 'opening',
                amount: openingBalance,
                description: 'Balance inicial de apertura',
            });

            setActiveShift(shift);
            activeShiftRef.current = shift;
            localStorage.setItem(`bistro_active_shift_${businessId}`, JSON.stringify(shift));
            await fetchMovements(shift.id, shift.opening_balance);
            window.dispatchEvent(new CustomEvent('shift-opened'));
            setError(null);
            return shift;
        } catch (err: any) {
            // navigator.onLine pudo mentir (adaptador virtual / túnel caído): si el
            // fallo es de red, encolar el turno offline en vez de mostrar error.
            if (isNetworkError(err)) {
                return openShiftOffline();
            }
            console.error('Error opening shift:', err);
            setError(err.message);
            return null;
        } finally {
            setLoading(false);
        }
    }, [businessId, userId, activeShift, fetchMovements, registers]);

    // Close the active shift
    const closeShift = useCallback(async (declaredCash: number, notes?: string, declaredByMethod?: Record<string, number>): Promise<boolean> => {
        if (!activeShift || !userId) {
            setError('No hay turno activo para cerrar');
            return false;
        }

        const declaredMethods = declaredByMethod || {};
        const shiftId = activeShift.id;
        const uid = userId;

        // ─── Req 13: Bloqueo de cierre con mesas pendientes ───
        // Mensaje EXACTO exigido por el criterio de aceptación (13.1/13.2).
        const PENDING_TABLES_MSG = 'Termina de cobrar las mesas pendientes antes de cerrar.';

        // Offline: revisar ordenes de mesa con cambios sin cobrar (`dirty`) y
        // mesas marcadas como ocupadas en Cache_Mesas_IDB.
        const hasPendingTablesOffline = async (): Promise<boolean> => {
            try {
                const dirtyOrders = await getAllDirtyTableOrders();
                if (dirtyOrders.length > 0) return true;
                const cachedTables = await getCachedTables();
                return cachedTables.some(
                    (t: any) => t?.status === 'occupied' || !!t?.current_order_id
                );
            } catch {
                return false;
            }
        };

        // Online: mesas del negocio ocupadas o con orden activa (columnas
        // verificadas por MCP: tables.status / tables.current_order_id / business_id).
        const hasPendingTablesOnline = async (): Promise<boolean> => {
            if (!businessId) return false;
            const { data, error } = await supabase
                .from('tables')
                .select('id')
                .eq('business_id', businessId)
                .or('status.eq.occupied,current_order_id.not.is.null')
                .limit(1);
            if (error) throw error;
            return (data?.length ?? 0) > 0;
        };

        // Ejecutar la verificacion antes de cualquier cierre (online u offline).
        // Si navigator.onLine miente y la consulta falla por red, se cae al
        // chequeo offline (deterministico). Un fallo inesperado NO bloquea el
        // cierre para no dejar al cajero atrapado.
        try {
            let hayMesasPendientes: boolean;
            if (!navigator.onLine) {
                hayMesasPendientes = await hasPendingTablesOffline();
            } else {
                try {
                    hayMesasPendientes = await hasPendingTablesOnline();
                } catch (probeErr) {
                    if (isNetworkError(probeErr)) {
                        hayMesasPendientes = await hasPendingTablesOffline();
                    } else {
                        throw probeErr;
                    }
                }
            }
            if (hayMesasPendientes) {
                setError(PENDING_TABLES_MSG);
                return false;
            }
        } catch (err: any) {
            console.error('Error verificando mesas pendientes antes de cerrar turno:', err);
        }

        // OFFLINE: encolar cierre y limpiar estado local
        const closeShiftOffline = async (): Promise<boolean> => {
            await offlineQueue.add('close_shift', { shiftId, declaredCash, notes, declaredByMethod: declaredMethods }, businessId!, uid);
            setActiveShift(null);
            activeShiftRef.current = null;
            localStorage.removeItem(`bistro_active_shift_${businessId}`);
            localStorage.removeItem(`bistro_active_movements_${businessId}`);
            localStorage.removeItem(`bistro_active_balances_${businessId}`);
            setMovements([]);
            setShiftBalances({ cash: 0, nequi: 0, daviplata: 0, card: 0, transfer: 0, other: 0 });
            setHasMoreMovements(false);
            lastFetchedShiftIdRef.current = undefined;
            window.dispatchEvent(new CustomEvent('shift-closed'));
            return true;
        };

        if (!navigator.onLine) {
            return closeShiftOffline();
        }

        try {
            setLoading(true);

            const { data, error } = await supabase
                .rpc('close_cash_shift', {
                    p_shift_id: activeShift.id,
                    p_declared_cash: declaredCash,
                    p_notes: notes || null,
                    p_declared_by_method: declaredMethods,
                });

            if (error) throw error;

            if (!data.success) {
                throw new Error(data.error || 'Error al cerrar turno');
            }

            setActiveShift(null);
            activeShiftRef.current = null;
            localStorage.removeItem(`bistro_active_shift_${businessId}`);
            localStorage.removeItem(`bistro_active_balances_${businessId}`);
            setMovements([]);
            setShiftBalances({ cash: 0, nequi: 0, daviplata: 0, card: 0, transfer: 0, other: 0 });
            setHasMoreMovements(false);
            lastFetchedShiftIdRef.current = undefined;
            localStorage.removeItem(`bistro_active_movements_${businessId}`);
            await fetchShifts();
            window.dispatchEvent(new CustomEvent('shift-closed'));
            setError(null);
            return true;
        } catch (err: any) {
            // navigator.onLine pudo mentir (adaptador virtual / túnel caído): si el
            // fallo es de red, encolar el cierre offline en vez de mostrar error.
            // (Un error de la RPC con success=false NO es de red y sí se reporta.)
            if (isNetworkError(err)) {
                return closeShiftOffline();
            }
            console.error('Error closing shift:', err);
            setError(err.message);
            return false;
        } finally {
            setLoading(false);
        }
    }, [activeShift, userId, businessId, fetchShifts]);

    // Add cash in movement
    const addCashIn = useCallback(async (amount: number, description: string, paymentMethod?: string): Promise<boolean> => {
        if (!activeShift || !userId) {
            setError('No hay turno activo');
            return false;
        }

        const shiftId = activeShift.id;
        const uid = userId;
        const methodMap: Record<string, string> = {
            'Efectivo': 'cash', 'Tarjeta': 'card', 'Nequi': 'nequi',
            'Daviplata': 'daviplata', 'Transferencia': 'transfer', 'Otro': 'other',
        };
        const dbMethod = methodMap[paymentMethod || 'cash'] || paymentMethod?.toLowerCase() || 'cash';

        const addCashInOffline = async (): Promise<boolean> => {
            await offlineQueue.add(
                'manual_cash_in',
                { amount, description, paymentMethod: dbMethod, shiftId, date: new Date().toISOString() },
                businessId!,
                uid
            );
            const fakeMove: CashMovement = {
                id: `offline_mov_${Date.now()}`,
                shift_id: shiftId,
                created_by: uid,
                type: 'cash_in',
                amount,
                description: `${description} (Offline)`,
                payment_method: dbMethod,
                created_at: new Date().toISOString(),
            };
            setMovements(prev => {
                const newMovs = [fakeMove, ...prev];
                localStorage.setItem(`bistro_active_movements_${businessId}`, JSON.stringify(newMovs));
                return newMovs;
            });
            setShiftBalances(prev => ({
                ...prev,
                [dbMethod]: (prev[dbMethod] || 0) + amount,
            }));
            setError(null);
            return true;
        };

        if (!navigator.onLine) {
            return addCashInOffline();
        }

        try {
            const { error } = await supabase
                .from('cash_movements')
                .insert({
                    shift_id: shiftId,
                    created_by: uid,
                    type: 'cash_in',
                    amount,
                    description,
                    ...(paymentMethod ? { payment_method: paymentMethod } : {}),
                });

            if (error) throw error;

            await fetchMovements();
            await fetchActiveShift(); // Refresh to get updated expected_cash
            setError(null);
            return true;
        } catch (err: any) {
            // navigator.onLine pudo mentir (adaptador virtual): si es error de red, encolar offline.
            if (isNetworkError(err)) {
                return addCashInOffline();
            }
            console.error('Error adding cash in:', err);
            setError(err.message);
            return false;
        }
    }, [activeShift, userId, businessId, fetchMovements, fetchActiveShift]);

    // Add cash out movement. Si paymentMethod no es efectivo, es un "retiro
    // diferente a efectivo" (no reduce el cajón físico).
    const addCashOut = useCallback(async (amount: number, description: string, paymentMethod: string = 'cash'): Promise<boolean> => {
        if (!activeShift || !userId) {
            setError('No hay turno activo');
            return false;
        }

        const method = (paymentMethod || 'cash').toLowerCase();
        const shiftId = activeShift.id;
        const uid = userId;

        const addCashOutOffline = async (): Promise<boolean> => {
            await offlineQueue.add(
                'manual_cash_out',
                { amount, description, paymentMethod: method, shiftId, date: new Date().toISOString() },
                businessId!,
                uid
            );
            const fakeMove: CashMovement = {
                id: `offline_mov_${Date.now()}`,
                shift_id: shiftId,
                created_by: uid,
                type: 'cash_out',
                amount,
                description: `${description} (Offline)`,
                payment_method: method,
                created_at: new Date().toISOString(),
            };
            setMovements(prev => {
                const newMovs = [fakeMove, ...prev];
                localStorage.setItem(`bistro_active_movements_${businessId}`, JSON.stringify(newMovs));
                return newMovs;
            });
            setShiftBalances(prev => ({
                ...prev,
                [method]: (prev[method] || 0) - amount,
            }));
            setError(null);
            return true;
        };

        if (!navigator.onLine) {
            return addCashOutOffline();
        }

        try {
            const { error } = await supabase
                .from('cash_movements')
                .insert({
                    shift_id: shiftId,
                    created_by: uid,
                    type: 'cash_out',
                    amount,
                    description,
                    payment_method: method,
                });

            if (error) throw error;

            await fetchMovements();
            await fetchActiveShift();
            setError(null);
            return true;
        } catch (err: any) {
            // navigator.onLine pudo mentir (adaptador virtual): si es error de red, encolar offline.
            if (isNetworkError(err)) {
                return addCashOutOffline();
            }
            console.error('Error adding cash out:', err);
            setError(err.message);
            return false;
        }
    }, [activeShift, userId, businessId, fetchMovements, fetchActiveShift]);

    // Add refund (devolución de dinero al cliente). Reduce el cajón si fue en
    // efectivo; alimenta la línea "Devoluciones" del reporte de cierre.
    const addRefund = useCallback(async (amount: number, description: string, paymentMethod: string = 'cash'): Promise<boolean> => {
        if (!activeShift || !userId) {
            setError('No hay turno activo');
            return false;
        }

        const method = (paymentMethod || 'cash').toLowerCase();

        // Las devoluciones SOLO funcionan con internet: no se encolan offline
        // (requieren validación/registro inmediato en el servidor).
        if (!navigator.onLine) {
            setError('Necesitas conexión a internet para registrar una devolución.');
            return false;
        }

        try {
            const { error } = await supabase
                .from('cash_movements')
                .insert({
                    shift_id: activeShift.id,
                    created_by: userId,
                    type: 'refund',
                    amount,
                    description,
                    payment_method: method,
                });

            if (error) throw error;

            await fetchMovements();
            await fetchActiveShift();
            setError(null);
            return true;
        } catch (err: any) {
            // Si navigator.onLine mentía y falla por red, informar que requiere internet (no encolar).
            if (isNetworkError(err)) {
                setError('Necesitas conexión a internet para registrar una devolución.');
                return false;
            }
            console.error('Error adding refund:', err);
            setError(err.message);
            return false;
        }
    }, [activeShift, userId, fetchMovements, fetchActiveShift]);

    // Record a cash sale (called from payment flow)
    const recordCashSale = useCallback(async (amount: number, orderId: string): Promise<boolean> => {
        if (!activeShift || !userId) {
            // No active shift - skip recording
            return true;
        }

        try {
            const { error } = await supabase
                .from('cash_movements')
                .insert({
                    shift_id: activeShift.id,
                    created_by: userId,
                    type: 'sale',
                    amount,
                    description: 'Venta en efectivo',
                    reference_id: orderId,
                    reference_type: 'order',
                });

            if (error) throw error;
            window.dispatchEvent(new CustomEvent('cash-movement-changed'));
            return true;
        } catch (err: any) {
            console.error('Error recording cash sale:', err);
            return false;
        }
    }, [activeShift, userId]);

    // Record an expense
    const recordExpense = useCallback(async (amount: number, description: string, expenseId?: string): Promise<boolean> => {
        if (!activeShift || !userId) {
            return true; // No active shift - skip
        }

        try {
            const { error } = await supabase
                .from('cash_movements')
                .insert({
                    shift_id: activeShift.id,
                    created_by: userId,
                    type: 'expense',
                    amount,
                    description,
                    reference_id: expenseId,
                    reference_type: expenseId ? 'expense' : undefined,
                });

            if (error) throw error;

            await fetchMovements();
            return true;
        } catch (err: any) {
            console.error('Error recording expense:', err);
            return false;
        }
    }, [activeShift, userId, fetchMovements]);

    // Record an inventory purchase (with payment method)
    const recordPurchase = useCallback(async (
        amount: number,
        description: string,
        paymentMethod: string,
        lotId?: string
    ): Promise<boolean> => {
        if (!activeShift || !userId) {
            return true; // No active shift - skip
        }
        if (!amount || amount <= 0 || !isFinite(amount)) return true;

        try {
            const { error } = await supabase
                .from('cash_movements')
                .insert({
                    shift_id: activeShift.id,
                    created_by: userId,
                    type: 'purchase',
                    amount,
                    description,
                    payment_method: paymentMethod,
                    reference_id: lotId,
                    reference_type: lotId ? 'purchase' : undefined,
                });

            if (error) throw error;

            await fetchMovements();
            await fetchActiveShift(); // Refresh to get updated totals
            return true;
        } catch (err: any) {
            console.error('Error recording purchase:', err);
            return false;
        }
    }, [activeShift, userId, fetchMovements, fetchActiveShift]);

    // Delete a cash movement from the current shift (used when reversing purchases, supplier payments)
    // If movementId is provided, deletes directly. If referenceId (lotId) is provided, finds by reference_id.
    // Falls back to searching by type+amount when neither is available.
    const reverseCashMovement = useCallback(async (
        amount: number,
        _description: string,
        _direction: 'in' | 'out',
        _paymentMethod?: string,
        movementId?: string,
        referenceId?: string
    ): Promise<boolean> => {
        if (!activeShift) return true;

        try {
            if (movementId) {
                await supabase.from('cash_movements').delete().eq('id', movementId);
            } else if (referenceId) {
                // Lookup preciso por lotId almacenado en reference_id
                const { data: matches } = await supabase
                    .from('cash_movements')
                    .select('id')
                    .eq('shift_id', activeShift.id)
                    .eq('reference_id', referenceId)
                    .limit(1);

                if (matches && matches.length > 0) {
                    await supabase.from('cash_movements').delete().eq('id', matches[0].id);
                }
            } else {
                // Fallback: find by shift + amount + type (purchase or cash_in)
                const searchType = _direction === 'in' ? 'purchase' : 'cash_in';
                const { data: matches } = await supabase
                    .from('cash_movements')
                    .select('id')
                    .eq('shift_id', activeShift.id)
                    .eq('amount', amount)
                    .eq('type', searchType)
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (matches && matches.length > 0) {
                    await supabase.from('cash_movements').delete().eq('id', matches[0].id);
                }
            }

            await fetchMovements();
            await fetchActiveShift();
            return true;
        } catch (err: any) {
            console.error('Error deleting cash movement:', err);
            return false;
        }
    }, [activeShift, fetchMovements, fetchActiveShift]);

    // Create a new cash register (reactivates if already exists as inactive)
    const createRegister = useCallback(async (name: string, description?: string): Promise<CashRegister | null> => {
        if (!businessId) return null;
        if (profile?.role !== 'Administrador') {
            setError('Solo los administradores pueden crear cajas.');
            return null;
        }

        try {
            // Check if a register with this name already exists (active or inactive)
            const { data: existing } = await supabase
                .from('cash_registers')
                .select('*')
                .eq('business_id', businessId)
                .ilike('name', name)
                .maybeSingle();

            if (existing) {
                if (existing.is_active) {
                    setError('Ya existe una caja con ese nombre.');
                    return null;
                }
                // Reactivate the inactive register
                const { data: reactivated, error: reactivateError } = await supabase
                    .from('cash_registers')
                    .update({ is_active: true, name, description })
                    .eq('id', existing.id)
                    .select()
                    .single();
                if (reactivateError) throw reactivateError;
                await fetchRegisters();
                return reactivated;
            }

            const { data, error } = await supabase
                .from('cash_registers')
                .insert({ business_id: businessId, name, description })
                .select()
                .single();

            if (error) throw error;
            await fetchRegisters();
            return data;
        } catch (err: any) {
            console.error('Error creating register:', err);
            setError(err.message);
            return null;
        }
    }, [businessId, profile?.role, fetchRegisters]);

    // Garantiza que el negocio tenga al menos una caja activa. Si no tiene ninguna
    // (negocios creados después del backfill de la migración inicial), crea
    // "Caja Principal" en runtime. Re-chequea en BD antes de insertar para evitar
    // duplicados por carreras. No crea nada offline.
    const ensureDefaultRegister = useCallback(async (): Promise<CashRegister | null> => {
        if (!businessId) return null;
        if (registers.length > 0) return registers[0];
        if (!navigator.onLine) return null;

        try {
            const { data: existing } = await supabase
                .from('cash_registers')
                .select('*')
                .eq('business_id', businessId)
                .eq('is_active', true)
                .order('created_at', { ascending: true })
                .limit(1);

            if (existing && existing.length > 0) {
                setRegisters(existing);
                return existing[0];
            }

            const { data, error } = await supabase
                .from('cash_registers')
                .insert({ business_id: businessId, name: 'Caja Principal', description: 'Caja registradora principal del negocio' })
                .select()
                .single();

            if (error) throw error;
            setRegisters(prev => (prev.length > 0 ? prev : [data]));
            return data;
        } catch (err: any) {
            console.error('Error ensuring default register:', err);
            return null;
        }
    }, [businessId, registers]);

    // Update a cash register name
    const updateRegister = useCallback(async (registerId: string, name: string): Promise<boolean> => {
        if (!businessId) return false;
        if (profile?.role !== 'Administrador') {
            setError('Solo los administradores pueden editar cajas.');
            return false;
        }

        try {
            const { error } = await supabase
                .from('cash_registers')
                .update({ name })
                .eq('id', registerId)
                .eq('business_id', businessId);

            if (error) throw error;
            await fetchRegisters();
            return true;
        } catch (err: any) {
            console.error('Error updating register:', err);
            setError(err.message);
            return false;
        }
    }, [businessId, profile?.role, fetchRegisters]);

    // Delete (deactivate) a cash register
    const deleteRegister = useCallback(async (registerId: string): Promise<boolean> => {
        if (!businessId) return false;
        if (profile?.role !== 'Administrador') {
            setError('Solo los administradores pueden eliminar cajas.');
            return false;
        }

        try {
            const { error } = await supabase
                .from('cash_registers')
                .update({ is_active: false })
                .eq('id', registerId)
                .eq('business_id', businessId);

            if (error) throw error;
            await fetchRegisters();
            return true;
        } catch (err: any) {
            console.error('Error deleting register:', err);
            setError(err.message);
            return false;
        }
    }, [businessId, profile?.role, fetchRegisters]);

    // Clear shift history (only closed shifts)
    const clearShiftHistory = useCallback(async (): Promise<boolean> => {
        if (!businessId) return false;

        try {
            // Delete closed shifts
            const { error } = await supabase
                .from('cash_shifts')
                // Use explicit type check for status not being 'open'
                .delete()
                .eq('business_id', businessId)
                .neq('status', 'open');

            if (error) throw error;

            await fetchShifts();
            return true;
        } catch (err: any) {
            console.error('Error clearing history:', err);
            setError('No se pudo limpiar el historial. Intenta de nuevo.');
            return false;
        }
    }, [businessId, fetchShifts]);

    // =====================================================
    // Computed Values
    // =====================================================


    const balances = useMemo((): Record<string, number> => {
        return shiftBalances;
    }, [shiftBalances]);

    const expectedCash = useMemo((): number => balances.cash, [balances]);

    const getDifference = useCallback((declaredCash: number): number => {
        return declaredCash - expectedCash;
    }, [expectedCash]);

    // =====================================================
    // Effects
    // =====================================================

    // Initial fetch consolidado mediante RPC (1 solo roundtrip de red eliminando la cascada de 5 peticiones)
    const loadInitData = useCallback(async () => {
        if (!businessId || !userId) return;

        setLoading(true);
        setMovementsLoading(true);

        try {
            const { data, error } = await supabase.rpc('get_cash_register_init_data', {
                p_business_id: businessId,
                p_user_id: userId
            });

            if (error) throw error;

            if (data) {
                const typedData = data as {
                    registers: CashRegister[];
                    active_shift: CashShift | null;
                    occupied_registers: Record<string, string>;
                    movements: CashMovement[];
                    has_more_movements: boolean;
                    balances: Record<string, number>;
                };

                setRegisters(typedData.registers || []);
                setActiveShift(typedData.active_shift || null);
                activeShiftRef.current = typedData.active_shift || null;
                setOccupiedRegisters(typedData.occupied_registers || {});
                setMovements(typedData.movements || []);
                setHasMoreMovements(!!typedData.has_more_movements);
                setShiftBalances(typedData.balances || {
                    cash: 0, nequi: 0, daviplata: 0, card: 0, transfer: 0, other: 0
                });

                if (typedData.active_shift?.id) {
                    lastFetchedShiftIdRef.current = typedData.active_shift.id;
                }

                localStorage.setItem(`bistro_registers_${businessId}`, JSON.stringify(typedData.registers || []));
                if (typedData.active_shift) {
                    localStorage.setItem(`bistro_active_shift_${businessId}`, JSON.stringify(typedData.active_shift));
                    localStorage.setItem(`bistro_active_movements_${businessId}`, JSON.stringify(typedData.movements || []));
                    localStorage.setItem(`bistro_active_balances_${businessId}`, JSON.stringify(typedData.balances || {}));
                } else {
                    localStorage.removeItem(`bistro_active_shift_${businessId}`);
                }
            }
        } catch (err: any) {
            console.error('Error cargando datos de caja con RPC:', err);
            if (isNetworkError(err)) {
                const cachedShift = localStorage.getItem(`bistro_active_shift_${businessId}`);
                if (cachedShift) {
                    try {
                        const parsed = JSON.parse(cachedShift);
                        setActiveShift(parsed);
                        activeShiftRef.current = parsed;
                    } catch { }
                }
                const cachedMovs = localStorage.getItem(`bistro_active_movements_${businessId}`);
                if (cachedMovs) {
                    try { setMovements(JSON.parse(cachedMovs)); } catch { }
                }
                const cachedBalances = localStorage.getItem(`bistro_active_balances_${businessId}`);
                if (cachedBalances) {
                    try { setShiftBalances(JSON.parse(cachedBalances)); } catch { }
                }
            } else {
                const [, shift] = await Promise.all([
                    fetchRegisters(),
                    fetchActiveShift(),
                    fetchOccupiedRegisters(),
                ]);
                if (shift) {
                    await fetchMovements(shift.id, shift.opening_balance);
                }
            }
        } finally {
            setLoading(false);
            setMovementsLoading(false);
        }
    }, [businessId, userId, fetchRegisters, fetchActiveShift, fetchOccupiedRegisters, fetchMovements]);

    useEffect(() => {
        loadInitData();
    }, [loadInitData]);

    // Fetch movements when active shift changes (skip if already fetched for this shift)
    useEffect(() => {
        const id = activeShift?.id;
        if (id && id !== lastFetchedShiftIdRef.current) {
            fetchMovements(id, activeShift?.opening_balance);
        }
    }, [activeShift?.id, activeShift?.opening_balance, fetchMovements]);

    // Refresh cash movements when a sale/expense/purchase/payment is added or reversed
    useEffect(() => {
        const handleRefresh = () => {
            if (activeShift) {
                fetchActiveShift();
                fetchMovements(activeShift.id, activeShift.opening_balance);
            }
        };

        // Cuando la sincronización offline termina, refrescar TODO el estado de la caja
        const handleOfflineSync = () => {
            fetchRegisters();
            fetchActiveShift();
            fetchOccupiedRegisters();
            fetchShifts();
        };

        window.addEventListener('sale-completed', handleRefresh as EventListener);
        window.addEventListener('sale-deleted', handleRefresh as EventListener);
        window.addEventListener('expense-deleted', handleRefresh as EventListener);
        window.addEventListener('purchase-reversed', handleRefresh as EventListener);
        window.addEventListener('payment-reversed', handleRefresh as EventListener);
        window.addEventListener('offline-sync-completed', handleOfflineSync);
        return () => {
            window.removeEventListener('sale-completed', handleRefresh as EventListener);
            window.removeEventListener('sale-deleted', handleRefresh as EventListener);
            window.removeEventListener('expense-deleted', handleRefresh as EventListener);
            window.removeEventListener('purchase-reversed', handleRefresh as EventListener);
            window.removeEventListener('payment-reversed', handleRefresh as EventListener);
            window.removeEventListener('offline-sync-completed', handleOfflineSync);
        };
    }, [activeShift, fetchMovements, fetchActiveShift, fetchRegisters, fetchOccupiedRegisters, fetchShifts]);

    // =====================================================
    // Return
    // =====================================================

    return {
        // State
        registers,
        activeShift,
        shifts,
        shiftsLoading,
        movements,
        hasMoreMovements,
        loadingMoreMovements,
        occupiedRegisters,
        loading,
        movementsLoading,
        error,

        // Actions
        fetchShifts,
        fetchMovements,
        fetchMoreMovements,
        openShift,
        closeShift,
        addCashIn,
        addCashOut,
        addRefund,
        recordCashSale,
        recordExpense,
        recordPurchase,
        reverseCashMovement,
        createRegister,
        ensureDefaultRegister,
        updateRegister,
        deleteRegister,
        clearShiftHistory,

        // Computed
        expectedCash,
        balances,
        getDifference,

        // Refresh
        refetch: async () => {
            await loadInitData();
            await fetchShifts();
        },
    };
}
