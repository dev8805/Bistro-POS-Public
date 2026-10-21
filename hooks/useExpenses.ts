import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { todayDateStringInTz } from '../lib/timezone';
import { offlineQueue } from '../lib/offlineQueue';
import { pushOfflineCashMovement } from '../lib/offlineCashCache';
import { isNetworkError, isRealOffline } from '../lib/connectivity';

export interface CreateExpenseData {
    amount: number;
    description: string;
    category?: string;
    product?: string;
    productId?: string;
    type: 'inventory' | 'expense' | 'waste';
    mode: 'upload' | 'manual';
    reason?: string;
    date?: string;
    payment_method?: string;
    quantity?: number;
    employee_id?: string;
    advance_deductions?: number;
    net_amount?: number;
    payroll_concept?: string;
    supplier_name?: string;
    supplier_id?: string;
    creditorName?: string;
}

export interface Expense {
    id: string;
    amount: number;
    description: string;
    category: string;
    payment_method: string;
    expense_date: string;
    created_at: string;
    supplier_name?: string | null;
    supplier_id?: string | null;
}

export interface Wastage {
    id: string;
    amount: number;
    description: string | null;
    reason: string | null;
    product_name: string | null;
    product_id: string | null;
    quantity: number;
    date: string;
    created_at: string;
}

export function useExpenses() {
    const { profile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [categories, setCategories] = useState<string[]>([]);
    const [reasons, setReasons] = useState<string[]>([]);
    const [catsLoading, setCatsLoading] = useState(false);

    const businessId = profile?.business_id;
    const userId = profile?.id;

    const fetchCategories = useCallback(async () => {
        if (!businessId) return;
        try {
            setCatsLoading(true);
            const { data, error } = await supabase
                .from('expense_categories')
                .select('name')
                .eq('business_id', businessId)
                .eq('is_active', true)
                .order('name');

            if (error) throw error;
            const names = data.map(c => c.name);
            setCategories(names);
            localStorage.setItem(`bistro_expense_categories_${businessId}`, JSON.stringify(names));
        } catch (err) {
            if (isNetworkError(err)) {
                const cached = localStorage.getItem(`bistro_expense_categories_${businessId}`);
                if (cached) setCategories(JSON.parse(cached));
            } else {
                console.error('Error fetching expense categories:', err);
            }
        } finally {
            setCatsLoading(false);
        }
    }, [businessId]);

    const fetchReasons = useCallback(async (force = false) => {
        if (!businessId) return;
        const cacheKey = `bistro_wastage_reasons_${businessId}`;
        if (!force) {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        setReasons(parsed);
                        return;
                    }
                } catch { }
            }
        }
        try {
            const { data, error } = await supabase
                .from('wastage_reasons')
                .select('name')
                .eq('business_id', businessId)
                .eq('is_active', true)
                .order('name');

            if (error) throw error;
            const names = data.map(r => r.name);
            setReasons(names);
            localStorage.setItem(cacheKey, JSON.stringify(names));
        } catch (err) {
            if (isNetworkError(err)) {
                const cached = localStorage.getItem(cacheKey);
                if (cached) setReasons(JSON.parse(cached));
            } else {
                console.error('Error fetching wastage reasons:', err);
            }
        }
    }, [businessId]);

    useEffect(() => {
        if (businessId) {
            fetchCategories();
        }
    }, [businessId, fetchCategories]);

    const addCategory = async (name: string) => {
        if (!businessId) return;
        const upperName = name.toUpperCase();
        try {
            const { error } = await supabase
                .from('expense_categories')
                .insert({ business_id: businessId, name: upperName });
            if (error) throw error;
            await fetchCategories();
        } catch (err: any) {
            console.error('Error adding category:', err);
            throw err;
        }
    };

    const deleteCategory = async (name: string) => {
        if (!businessId) return;
        try {
            const { error } = await supabase
                .from('expense_categories')
                .delete()
                .eq('business_id', businessId)
                .eq('name', name);
            if (error) throw error;
            await fetchCategories();
        } catch (err: any) {
            console.error('Error deleting category:', err);
            throw err;
        }
    };

    const updateCategory = async (oldName: string, newName: string) => {
        if (!businessId) return;
        const upperNew = newName.toUpperCase().trim();
        if (!upperNew || upperNew === oldName) return;
        try {
            const { error } = await supabase
                .from('expense_categories')
                .update({ name: upperNew })
                .eq('business_id', businessId)
                .eq('name', oldName);
            if (error) throw error;
            await fetchCategories();
        } catch (err: any) {
            console.error('Error updating category:', err);
            throw err;
        }
    };

    const addReason = async (name: string) => {
        if (!businessId) return;
        const upperName = name.toUpperCase();
        try {
            const { error } = await supabase
                .from('wastage_reasons')
                .insert({ business_id: businessId, name: upperName });
            if (error) throw error;
            await fetchReasons(true);
        } catch (err: any) {
            console.error('Error adding reason:', err);
            throw err;
        }
    };

    const deleteReason = async (name: string) => {
        if (!businessId) return;
        try {
            const { error } = await supabase
                .from('wastage_reasons')
                .delete()
                .eq('business_id', businessId)
                .eq('name', name);
            if (error) throw error;
            await fetchReasons(true);
        } catch (err: any) {
            console.error('Error deleting reason:', err);
            throw err;
        }
    };

    const createExpense = useCallback(async (data: CreateExpenseData) => {
        if (!businessId || !userId) {
            throw new Error('Usuario no autenticado o sin negocio asignado');
        }

        // OFFLINE: encolar sin intentar llegar a Supabase. Usa sonda real porque
        // navigator.onLine puede mentir (adaptador virtual / túnel caído).
        if (data.type !== 'waste' && await isRealOffline()) {
            await offlineQueue.add('expense', { ...data, createdAt: new Date().toISOString() }, businessId, userId);
            pushOfflineCashMovement(businessId, {
                created_by: userId,
                type: 'expense',
                amount: data.amount,
                description: `Gasto: ${data.category ? data.category.toUpperCase() + ' – ' : ''}${data.description}`,
                payment_method: data.payment_method || 'cash',
            });
            return { id: `offline_expense_${Date.now()}`, ...data };
        }

        try {
            setLoading(true);
            setError(null);

            if (data.type === 'waste') {
                // Insert into wastage table
                const wastageData = {
                    business_id: businessId,
                    amount: data.amount,
                    description: data.description,
                    reason: (data.reason || 'GENERAL').toUpperCase(),
                    product_name: data.product,
                    product_id: data.productId,
                    quantity: data.quantity || 1,
                    date: data.date || todayDateStringInTz(),
                    created_by: userId,
                    created_at: data.date || new Date().toISOString()
                };

                const { data: waste, error: wasteError } = await supabase
                    .from('wastage')
                    .insert(wastageData)
                    .select()
                    .single();

                if (wasteError) throw wasteError;
                return waste;
            } else {
                // Insert into expenses table
                const expenseData = {
                    business_id: businessId,
                    amount: data.amount,
                    description: data.description || '',
                    category: (data.category || 'GENERAL').toUpperCase(),
                    payment_method: data.payment_method || 'cash',
                    expense_date: data.date || todayDateStringInTz(),
                    created_by: userId,
                    created_at: data.date || new Date().toISOString(),
                    receipt_url: (data as any).receipt_url || null,
                    employee_id: data.employee_id || null,
                    advance_deductions: data.advance_deductions || 0,
                    net_amount: data.net_amount !== undefined ? data.net_amount : data.amount,
                    payroll_concept: data.payroll_concept || null,
                    supplier_id: data.supplier_id || (data as any).supplierId || null,
                    supplier_name: data.supplier_name || data.creditorName || (data as any).supplierName || null,
                };


                const { data: expense, error: expenseError } = await supabase
                    .from('expenses')
                    .insert(expenseData)
                    .select()
                    .single();

                if (expenseError) throw expenseError;

                // Register cash movement if user chose to deduct from register
                if ((data as any).deductFromCashRegister === true) {
                    const { data: activeShiftData } = await supabase
                        .from('cash_shifts')
                        .select('id')
                        .eq('business_id', businessId)
                        .eq('status', 'open')
                        .maybeSingle();

                    if (activeShiftData) {
                        const payments = (data as any).payments;
                        const targetName = (data as any).creditorName?.trim() || expense.category;
                        const expenseDesc = expense.description
                            ? `Gasto: ${targetName} · ${expense.description}`
                            : `Gasto: ${targetName}`;

                        if (payments && payments.length > 0) {
                            const movements = payments.map((p: any) => ({
                                shift_id: activeShiftData.id,
                                created_by: userId,
                                type: 'expense',
                                amount: parseFloat(p.amount) || 0,
                                description: expenseDesc,
                                reference_id: expense.id,
                                reference_type: 'expense',
                                payment_method: p.mappedId || 'cash',
                            }));

                            await supabase.from('cash_movements').insert(movements);
                        } else {
                            const cashAmountToDeduct = (data as any).cashAmount || data.amount;
                            if (cashAmountToDeduct > 0) {
                                await supabase.from('cash_movements').insert({
                                    shift_id: activeShiftData.id,
                                    created_by: userId,
                                    type: 'expense',
                                    amount: cashAmountToDeduct,
                                    description: expenseDesc,
                                    reference_id: expense.id,
                                    reference_type: 'expense',
                                    payment_method: 'cash',
                                });
                            }
                        }
                    }
                }
                return expense;
            }
        } catch (err: any) {
            console.error('Error creating record:', err);
            setError(err.message);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [businessId, userId]);

    const EXPENSES_PAGE_SIZE = 10;
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [expensesLoading, setExpensesLoading] = useState(false);
    const [expensesLoadingMore, setExpensesLoadingMore] = useState(false);
    const [hasMoreExpenses, setHasMoreExpenses] = useState(true);
    const isFetchingMoreRef = useRef(false);

    const fetchExpenses = useCallback(async () => {
        if (!businessId) return;
        setExpensesLoading(true);
        try {
            const { data, error } = await supabase
                .from('expenses')
                .select('id, amount, description, category, payment_method, expense_date, created_at, supplier_name, supplier_id')
                .eq('business_id', businessId)
                .order('expense_date', { ascending: false })
                .order('created_at', { ascending: false })
                .range(0, EXPENSES_PAGE_SIZE - 1);
            if (error) throw error;
            const items = data || [];
            setExpenses(items);
            setHasMoreExpenses(items.length === EXPENSES_PAGE_SIZE);
        } catch (err) {
            console.error('Error fetching expenses:', err);
        } finally {
            setExpensesLoading(false);
        }
    }, [businessId]);

    const fetchMoreExpenses = useCallback(async () => {
        if (!businessId || expensesLoading || isFetchingMoreRef.current || !hasMoreExpenses) return;
        isFetchingMoreRef.current = true;
        setExpensesLoadingMore(true);
        try {
            const from = expenses.length;
            const to = from + EXPENSES_PAGE_SIZE - 1;
            const { data, error } = await supabase
                .from('expenses')
                .select('id, amount, description, category, payment_method, expense_date, created_at, supplier_name, supplier_id')
                .eq('business_id', businessId)
                .order('expense_date', { ascending: false })
                .order('created_at', { ascending: false })
                .range(from, to);
            if (error) throw error;
            const items = data || [];
            setExpenses(prev => [...prev, ...items]);
            setHasMoreExpenses(items.length === EXPENSES_PAGE_SIZE);
        } catch (err) {
            console.error('Error fetching more expenses:', err);
        } finally {
            isFetchingMoreRef.current = false;
            setExpensesLoadingMore(false);
        }
    }, [businessId, expenses.length, expensesLoading, hasMoreExpenses]);

    const updateExpense = useCallback(async (id: string, updates: { amount?: number; category?: string; description?: string }) => {
        try {
            const payload: Record<string, any> = {};
            if (updates.amount !== undefined) payload.amount = updates.amount;
            if (updates.category !== undefined) payload.category = updates.category.toUpperCase();
            if (updates.description !== undefined) payload.description = updates.description;

            const { error } = await supabase
                .from('expenses')
                .update(payload)
                .eq('id', id);
            if (error) throw error;
            setExpenses(prev => prev.map(exp => exp.id === id ? { ...exp, ...payload } : exp));
        } catch (err: any) {
            console.error('Error updating expense:', err);
            throw err;
        }
    }, []);

    const deleteExpense = useCallback(async (id: string) => {
        try {
            await supabase
                .from('cash_movements')
                .delete()
                .eq('reference_id', id)
                .eq('reference_type', 'expense');

            const { error } = await supabase
                .from('expenses')
                .delete()
                .eq('id', id);
            if (error) throw error;
            window.dispatchEvent(new CustomEvent('expense-deleted'));
            setExpenses(prev => prev.filter(exp => exp.id !== id));
        } catch (err: any) {
            console.error('Error deleting expense:', err);
            throw err;
        }
    }, []);

    const [wastages, setWastages] = useState<Wastage[]>([]);
    const [wastagesLoading, setWastagesLoading] = useState(false);

    const fetchWastages = useCallback(async () => {
        if (!businessId) return;
        setWastagesLoading(true);
        try {
            const { data, error } = await supabase
                .from('wastage')
                .select('id, amount, description, reason, product_name, product_id, quantity, date, created_at')
                .eq('business_id', businessId)
                .order('date', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(100);
            if (error) throw error;
            setWastages(data || []);
        } catch (err) {
            console.error('Error fetching wastages:', err);
        } finally {
            setWastagesLoading(false);
        }
    }, [businessId]);

    const updateWastage = useCallback(async (id: string, updates: { amount?: number; reason?: string; description?: string; quantity?: number }) => {
        try {
            if (updates.quantity !== undefined) {
                const { data: current } = await supabase
                    .from('wastage')
                    .select('quantity, product_id')
                    .eq('id', id)
                    .single();

                if (current?.product_id) {
                    const { data: product } = await supabase
                        .from('products')
                        .select('stock')
                        .eq('id', current.product_id)
                        .single();

                    const diff = (current.quantity || 0) - updates.quantity;
                    const newStock = Math.max(0, (product?.stock || 0) + diff);
                    await supabase.from('products').update({ stock: newStock }).eq('id', current.product_id);

                    window.dispatchEvent(new CustomEvent('wastage-stock-updated', {
                        detail: { items: [{ productId: current.product_id, quantity: -diff }] }
                    }));
                }
            }

            const payload: Record<string, any> = {};
            if (updates.amount !== undefined) payload.amount = updates.amount;
            if (updates.reason !== undefined) payload.reason = updates.reason;
            if (updates.description !== undefined) payload.description = updates.description;
            if (updates.quantity !== undefined) payload.quantity = updates.quantity;

            const { error } = await supabase
                .from('wastage')
                .update(payload)
                .eq('id', id);
            if (error) throw error;
            await fetchWastages();
        } catch (err: any) {
            console.error('Error updating wastage:', err);
            throw err;
        }
    }, [fetchWastages]);

    const deleteWastage = useCallback(async (id: string) => {
        try {
            const { data: wastage } = await supabase
                .from('wastage')
                .select('product_id, quantity')
                .eq('id', id)
                .single();

            // Restore lot quantities before deleting (inverse of deduct_fifo_for_wastage)
            await supabase.rpc('restore_lots_from_wastage', { p_wastage_id: id });

            if (wastage?.product_id) {
                const { data: product } = await supabase
                    .from('products')
                    .select('stock')
                    .eq('id', wastage.product_id)
                    .single();

                const restoredStock = (product?.stock || 0) + (wastage.quantity || 0);
                await supabase.from('products').update({ stock: restoredStock }).eq('id', wastage.product_id);

                window.dispatchEvent(new CustomEvent('wastage-stock-updated', {
                    detail: { items: [{ productId: wastage.product_id, quantity: -(wastage.quantity || 0) }] }
                }));
            }

            const { error } = await supabase
                .from('wastage')
                .delete()
                .eq('id', id);
            if (error) throw error;
            await fetchWastages();
        } catch (err: any) {
            console.error('Error deleting wastage:', err);
            throw err;
        }
    }, [fetchWastages]);

    return {
        createExpense,
        loading,
        error,
        categories,
        reasons,
        fetchReasons,
        catsLoading,
        addCategory,
        deleteCategory,
        updateCategory,
        addReason,
        deleteReason,
        expenses,
        expensesLoading,
        expensesLoadingMore,
        hasMoreExpenses,
        fetchExpenses,
        fetchMoreExpenses,
        updateExpense,
        deleteExpense,
        wastages,
        wastagesLoading,
        fetchWastages,
        updateWastage,
        deleteWastage,
    };
}
