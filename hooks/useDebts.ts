import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { offlineQueue } from '../lib/offlineQueue';
import { pushOfflineCashMovement } from '../lib/offlineCashCache';
import { isNetworkError, isRealOffline } from '../lib/connectivity';

export interface BusinessDebt {
    id: string;
    business_id: string;
    type: 'supplier' | 'other';
    creditor_name: string;
    description?: string;
    total_amount: number;
    paid_amount: number;
    due_date?: string;
    status: 'active' | 'paid' | 'cancelled';
    created_by?: string;
    created_by_name?: string | null;
    created_at: string;
    updated_at: string;
    inventory_lot_id?: string;
    supplier_id?: string;
    evidence_url?: string | null;
    payment_method?: string | null;
    payment_details?: Array<{ method: string; amount: number }> | null;
    document_date?: string | null;
}

export function useDebts() {
    const { profile } = useAuth();

    const [debts, setDebts] = useState<BusinessDebt[]>([]);
    const [loading, setLoading] = useState(true);

    const businessId = profile?.business_id;
    const userId = profile?.id;
    const DEBTS_CACHE_KEY = businessId ? `bistro_debts_cache_${businessId}` : null;

    // Aplana el objeto anidado del join (created_by_profile) a created_by_name,
    // mismo patrón que transformOrder en useSalesHistory (waiter.full_name -> waiter_name).
    const transformDebt = (row: any): BusinessDebt => {
        const { created_by_profile, ...rest } = row;
        return { ...rest, created_by_name: created_by_profile?.full_name ?? null };
    };

    const fetchDebts = useCallback(async (showLoader = false) => {
        if (!businessId) return;

        // Offline: cargar desde caché localStorage
        if (!navigator.onLine) {
            if (DEBTS_CACHE_KEY) {
                try {
                    const cached = localStorage.getItem(DEBTS_CACHE_KEY);
                    if (cached) setDebts(JSON.parse(cached));
                } catch { }
            }
            setLoading(false);
            return;
        }

        try {
            if (showLoader) setLoading(true);
            const { data, error } = await supabase
                .from('business_debts')
                .select('*, created_by_profile:profiles!business_debts_created_by_fkey(full_name)')
                .eq('business_id', businessId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            const data2 = (data || []).map(transformDebt);
            setDebts(data2);
            if (DEBTS_CACHE_KEY) {
                try { localStorage.setItem(DEBTS_CACHE_KEY, JSON.stringify(data2)); } catch { }
            }
        } catch (err: any) {
            // navigator.onLine pudo mentir: ante error de red, caer al caché.
            if (isNetworkError(err) && DEBTS_CACHE_KEY) {
                try {
                    const cached = localStorage.getItem(DEBTS_CACHE_KEY);
                    if (cached) setDebts(JSON.parse(cached));
                } catch { }
            } else {
                console.error('Error fetching debts:', err);
            }
        } finally {
            setLoading(false);
        }
    }, [businessId]);

    const activeDebts = useMemo(() =>
        debts.filter(d => d.status === 'active' && d.total_amount > d.paid_amount),
        [debts]
    );

    const totalPending = useMemo(() =>
        activeDebts.reduce((sum, d) => sum + (d.total_amount - d.paid_amount), 0),
        [activeDebts]
    );

    const createDebt = useCallback(async (debtData: {
        type: 'supplier' | 'other';
        creditor_name: string;
        description?: string;
        total_amount: number;
        due_date?: string;
        paid_amount?: number;
        status?: 'active' | 'paid';
        inventory_lot_id?: string;
        supplier_id?: string;
        created_at?: string;
        evidence_url?: string | null;
        payment_method?: string | null;
        payment_details?: Array<{ method: string; amount: number }> | null;
        document_date?: string | null;
    }) => {
        if (!businessId || !userId) throw new Error('No autenticado');

        const paidAmount = debtData.paid_amount ?? 0;
        const status = debtData.status ?? 'active';

        const { data, error } = await supabase
            .from('business_debts')
            .insert({
                business_id: businessId,
                type: debtData.type,
                creditor_name: debtData.creditor_name,
                description: debtData.description,
                total_amount: debtData.total_amount,
                paid_amount: paidAmount,
                due_date: debtData.due_date || null,
                status,
                inventory_lot_id: debtData.inventory_lot_id || null,
                supplier_id: debtData.supplier_id || null,
                evidence_url: debtData.evidence_url || null,
                payment_method: debtData.payment_method || null,
                payment_details: debtData.payment_details || null,
                document_date: debtData.document_date || null,
                created_at: debtData.created_at || new Date().toISOString(),
                created_by: userId,
            })
            .select()
            .single();

        if (error) throw error;
        await fetchDebts();
        return data;
    }, [businessId, userId, fetchDebts]);

    const addCreditorPayment = useCallback(async (
        creditorName: string,
        amount: number,
        method?: string,
        notes?: string,
        shiftId?: string,
        evidenceUrl?: string | null,
    ) => {
        if (!businessId) throw new Error('No autenticado');

        const creditorDebts = debts
            .filter(d => d.creditor_name === creditorName && d.status === 'active' && d.total_amount > d.paid_amount)
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        // OFFLINE: actualizar localmente y encolar. Sonda real (navigator.onLine
        // puede mentir con adaptadores virtuales / túnel caído).
        if (await isRealOffline()) {
            let remaining = amount;
            const updatedDebts = debts.map(d => {
                if (remaining <= 0 || d.creditor_name !== creditorName || d.status !== 'active' || d.total_amount <= d.paid_amount) return d;
                const owed = d.total_amount - d.paid_amount;
                const payment = Math.min(remaining, owed);
                remaining -= payment;
                const newPaid = d.paid_amount + payment;
                const newStatus: BusinessDebt['status'] = newPaid >= d.total_amount ? 'paid' : 'active';
                return { ...d, paid_amount: newPaid, status: newStatus };
            });

            // Agregar registro de abono en cómo lo hace el flujo online
            const creditorType = debts.find(d => d.creditor_name === creditorName)?.type || 'supplier';
            const fakePaymentRecord: BusinessDebt = {
                id: `offline_debt_${Date.now()}`,
                business_id: businessId,
                type: creditorType,
                creditor_name: creditorName,
                description: notes ? `Abono: ${notes}` : 'Abono',
                total_amount: 0,
                paid_amount: amount,
                status: 'paid',
                payment_method: method || 'Efectivo',
                evidence_url: evidenceUrl || null,
                created_by: userId,
                created_by_name: profile?.full_name ?? null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            const allUpdated = [...updatedDebts, fakePaymentRecord];
            setDebts(allUpdated);
            if (DEBTS_CACHE_KEY) {
                try { localStorage.setItem(DEBTS_CACHE_KEY, JSON.stringify(allUpdated)); } catch { }
            }

            await offlineQueue.add(
                'supplier_payment',
                {
                    creditorName,
                    amount,
                    paymentMethod: method || null,
                    notes: notes || null,
                    shiftId: shiftId || null,
                    evidenceUrl: evidenceUrl || null,
                    date: new Date().toISOString(),
                },
                businessId,
                userId || '',
            );

            if (shiftId) {
                const methodMap: Record<string, string> = {
                    'efectivo': 'cash', 'cash': 'cash',
                    'tarjeta': 'card', 'card': 'card',
                    'nequi': 'nequi',
                    'daviplata': 'daviplata',
                    'transferencia': 'transfer', 'transfer': 'transfer',
                    'otro': 'other', 'other': 'other',
                };
                const cleanMethod = (method || '').toLowerCase().trim();
                const dbMethod = methodMap[cleanMethod] || cleanMethod || 'cash';
                if (dbMethod === 'cash') {
                    pushOfflineCashMovement(businessId, {
                        shift_id: shiftId,
                        created_by: userId || '',
                        type: 'purchase',
                        amount,
                        description: `Abono proveedor: ${creditorName}${notes ? ' · ' + notes : ''}`,
                        payment_method: 'cash',
                    });
                }
            }
            return;
        }

        let remaining = amount;

        for (const debt of creditorDebts) {
            if (remaining <= 0) break;

            const owed = debt.total_amount - debt.paid_amount;
            const payment = Math.min(remaining, owed);
            const newPaid = debt.paid_amount + payment;
            const newStatus = newPaid >= debt.total_amount ? 'paid' : 'active';

            const { error } = await supabase
                .from('business_debts')
                .update({
                    paid_amount: newPaid,
                    status: newStatus,
                })
                .eq('id', debt.id);

            if (error) throw error;
            remaining -= payment;
        }

        const creditorType = debts.find(d => d.creditor_name === creditorName)?.type || 'supplier';
        await supabase
            .from('business_debts')
            .insert({
                business_id: businessId,
                type: creditorType,
                creditor_name: creditorName,
                description: notes ? `Abono: ${notes}` : 'Abono',
                total_amount: 0,
                paid_amount: amount,
                status: 'paid',
                payment_method: method || 'Efectivo',
                evidence_url: evidenceUrl || null,
                created_by: userId,
            });

        await fetchDebts();
    }, [businessId, userId, debts, fetchDebts, DEBTS_CACHE_KEY]);

    const clearCreditorDebts = useCallback(async (creditorName: string) => {
        if (!businessId) throw new Error('No autenticado');

        const creditorType = debts.find(d => d.creditor_name === creditorName)?.type || 'supplier';

        const { error: deleteError } = await supabase
            .from('business_debts')
            .delete()
            .eq('business_id', businessId)
            .eq('creditor_name', creditorName);

        if (deleteError) throw deleteError;

        const { error: insertError } = await supabase
            .from('business_debts')
            .insert({
                business_id: businessId,
                type: creditorType,
                creditor_name: creditorName,
                total_amount: 0,
                paid_amount: 0,
                status: 'active',
            });

        if (insertError) throw insertError;
        await fetchDebts();
    }, [businessId, debts, fetchDebts]);

    const deleteCreditor = useCallback(async (creditorName: string) => {
        if (!businessId) throw new Error('No autenticado');

        const { error } = await supabase
            .from('business_debts')
            .delete()
            .eq('business_id', businessId)
            .eq('creditor_name', creditorName);

        if (error) throw error;
        await fetchDebts();
    }, [businessId, fetchDebts]);

    const renameCreditor = useCallback(async (oldName: string, newName: string) => {
        if (!businessId) throw new Error('No autenticado');
        if (!newName.trim()) throw new Error('El nombre no puede estar vacío');

        const { error } = await supabase
            .from('business_debts')
            .update({ creditor_name: newName.trim() })
            .eq('business_id', businessId)
            .eq('creditor_name', oldName);

        if (error) throw error;
        await fetchDebts();
    }, [businessId, fetchDebts]);

    const updateDebtEvidence = useCallback(async (debtId: string, url: string | null) => {
        if (!businessId) throw new Error('No autenticado');
        const { error } = await supabase
            .from('business_debts')
            .update({ evidence_url: url })
            .eq('id', debtId);
        if (error) throw error;
        await fetchDebts();
    }, [businessId, fetchDebts]);

    const deletePurchaseRecord = useCallback(async (debtId: string): Promise<{ success: boolean; blocked?: boolean; sold?: number; reason?: 'stock_negative' | 'sold_units' }> => {
        if (!businessId) throw new Error('No autenticado');

        const debt = debts.find(d => d.id === debtId);
        if (!debt || !debt.inventory_lot_id) {
            throw new Error('Este registro no tiene un lote de inventario vinculado');
        }

        const { data: lot, error: lotError } = await supabase
            .from('inventory_lots')
            .select('*')
            .eq('id', debt.inventory_lot_id)
            .single();

        if (lotError || !lot) throw new Error('No se encontró el lote de inventario');

        const { data: product } = await supabase
            .from('products')
            .select('stock')
            .eq('id', lot.product_id)
            .single();

        if (product && (product.stock ?? 0) <= 0) {
            return { success: false, blocked: true, sold: 0, reason: 'stock_negative' };
        }

        const sold = lot.initial_quantity - lot.remaining_quantity;
        if (sold > 0) {
            return { success: false, blocked: true, sold: Number(sold), reason: 'sold_units' };
        }

        const { error: stockError } = await supabase.rpc('increment_stock', {
            p_product_id: lot.product_id,
            p_quantity: -lot.initial_quantity,
        });

        if (stockError) {
            const { data: prod } = await supabase.from('products').select('stock').eq('id', lot.product_id).single();
            if (prod) {
                await supabase.from('products').update({ stock: Math.max(0, (prod.stock || 0) - Number(lot.initial_quantity)) }).eq('id', lot.product_id);
            }
        }

        await supabase.from('inventory_lots').delete().eq('id', lot.id);
        await supabase.from('business_debts').delete().eq('id', debtId);

        if (debt.status === 'active' && debt.total_amount > debt.paid_amount) {
            let supplierQuery = supabase
                .from('suppliers')
                .select('id, current_debt')
                .eq('business_id', businessId);

            // Usar supplier_id si está disponible para evitar ambigüedad con nombres iguales
            if (debt.supplier_id) {
                supplierQuery = supplierQuery.eq('id', debt.supplier_id) as typeof supplierQuery;
            } else {
                supplierQuery = supplierQuery.eq('name', debt.creditor_name) as typeof supplierQuery;
            }

            const supplier = await supplierQuery.maybeSingle();

            if (supplier.data && supplier.data.current_debt > 0) {
                const remaining = debt.total_amount - debt.paid_amount;
                await supabase
                    .from('suppliers')
                    .update({ current_debt: Math.max(0, supplier.data.current_debt - remaining) })
                    .eq('id', supplier.data.id);
            }
        }

        window.dispatchEvent(new CustomEvent('inventory-updated', {
            detail: { productId: lot.product_id }
        }));

        await fetchDebts();
        return { success: true };
    }, [businessId, debts, fetchDebts]);

    const deletePaymentRecord = useCallback(async (debtId: string): Promise<void> => {
        if (!businessId) throw new Error('No autenticado');
        const { error } = await supabase
            .from('business_debts')
            .delete()
            .eq('id', debtId)
            .eq('business_id', businessId);
        if (error) throw error;
        await fetchDebts();
    }, [businessId, fetchDebts]);

    const updatePurchaseRecord = useCallback(async (debtId: string, updates: {
        newQuantity?: number;
        newUnitCost?: number;
    }): Promise<{ success: boolean; message?: string }> => {
        if (!businessId) throw new Error('No autenticado');

        const debt = debts.find(d => d.id === debtId);
        if (!debt || !debt.inventory_lot_id) {
            throw new Error('Este registro no tiene un lote de inventario vinculado');
        }

        const { data: lot, error: lotError } = await supabase
            .from('inventory_lots')
            .select('*')
            .eq('id', debt.inventory_lot_id)
            .single();

        if (lotError || !lot) throw new Error('No se encontró el lote de inventario');

        const sold = Number(lot.initial_quantity) - Number(lot.remaining_quantity);

        if (updates.newQuantity !== undefined) {
            if (updates.newQuantity < sold) {
                return { success: false, message: `La cantidad mínima es ${sold} (unidades ya vendidas)` };
            }

            const diff = Number(lot.initial_quantity) - updates.newQuantity;
            const newRemaining = Number(lot.remaining_quantity) - diff;

            await supabase.from('inventory_lots').update({
                initial_quantity: updates.newQuantity,
                remaining_quantity: newRemaining,
            }).eq('id', lot.id);

            if (diff !== 0) {
                const { error: stockErr } = await supabase.rpc('increment_stock', {
                    p_product_id: lot.product_id,
                    p_quantity: -diff,
                });
                if (stockErr) {
                    console.error('Error adjusting stock:', stockErr);
                }
            }

            const newTotalAmount = updates.newQuantity * Number(updates.newUnitCost ?? lot.unit_cost);
            const isCashPurchase = debt.status === 'paid' && debt.paid_amount >= debt.total_amount;
            await supabase.from('business_debts').update({
                total_amount: newTotalAmount,
                paid_amount: isCashPurchase ? newTotalAmount : debt.paid_amount,
            }).eq('id', debtId);

            window.dispatchEvent(new CustomEvent('inventory-updated', {
                detail: { productId: lot.product_id }
            }));
        }

        if (updates.newUnitCost !== undefined) {
            await supabase.from('inventory_lots').update({
                unit_cost: updates.newUnitCost,
            }).eq('id', lot.id);

            const qty = updates.newQuantity ?? Number(lot.initial_quantity);
            const newTotalAmount = qty * updates.newUnitCost;
            const isCashPurchase = debt.status === 'paid' && debt.paid_amount >= debt.total_amount;
            await supabase.from('business_debts').update({
                total_amount: newTotalAmount,
                paid_amount: isCashPurchase ? newTotalAmount : debt.paid_amount,
            }).eq('id', debtId);
        }

        await fetchDebts();
        return { success: true };
    }, [businessId, debts, fetchDebts]);

    useEffect(() => {
        if (businessId) {
            fetchDebts(true);
        }
    }, [businessId, fetchDebts]);

    return {
        debts,
        activeDebts,
        totalPending,
        loading,
        createDebt,
        addCreditorPayment,
        updateDebtEvidence,
        clearCreditorDebts,
        deleteCreditor,
        renameCreditor,
        deletePurchaseRecord,
        deletePaymentRecord,
        updatePurchaseRecord,
    };
}
