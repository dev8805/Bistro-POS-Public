import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { offlineQueue } from '../lib/offlineQueue';
import { pushOfflineCashMovement } from '../lib/offlineCashCache';
import { isRealOffline } from '../lib/connectivity';

const CLIENTS_CACHE_KEY = 'bistro_clients_cache';

const getCachedClients = (): Client[] => {
    try {
        const cached = localStorage.getItem(CLIENTS_CACHE_KEY);
        if (cached) return JSON.parse(cached);
    } catch { }
    return [];
};

export interface OrderItemSummary {
    product_name: string;
    quantity: number;
    unit_price: number;
    status?: string;
}

export interface ClientTransaction {
    id: string;
    client_id: string;
    type: 'debt' | 'payment';
    amount: number;
    note?: string;
    due_date?: string;
    order_id?: string;
    created_by?: string;
    created_at: string;
    order_items?: OrderItemSummary[];
}

export interface Client {
    id: string;
    business_id: string;
    name: string;
    phone?: string;
    email?: string;
    id_number?: string;
    address?: string;
    credit_limit: number;
    current_debt: number;
    notes?: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    transactions?: ClientTransaction[];
}

export function useClients() {
    const { profile } = useAuth();
    const [clients, setClients] = useState<Client[]>(getCachedClients());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const businessId = profile?.business_id;
    const userId = profile?.id;

    // Fetch clients with transactions
    const fetchClients = useCallback(async (showLoader = false) => {
        if (!businessId) return;

        try {
            if (showLoader) setLoading(true);
            const { data, error } = await supabase
                .from('clients')
                .select(`
          *,
          transactions:client_transactions(
            *,
            order:orders(items:order_items(product_name, quantity, unit_price, status))
          )
        `)
                .eq('business_id', businessId)
                .eq('is_active', true)
                .order('name', { ascending: true });

            if (error) throw error;
            const mapped = (data || []).map((client: any) => ({
                ...client,
                transactions: (client.transactions || []).map((tx: any) => ({
                    ...tx,
                    order_items: tx.order?.items || [],
                    order: undefined,
                })),
            }));

            // Preservar clientes offline pendientes (aún no sincronizados a Supabase)
            const cached = getCachedClients();
            const pendingOffline = cached.filter(c => c.id.startsWith('offline_client_'));
            const merged = pendingOffline.length > 0
                ? [...mapped, ...pendingOffline].sort((a, b) => a.name.localeCompare(b.name))
                : mapped;

            setClients(merged);
            try { localStorage.setItem(CLIENTS_CACHE_KEY, JSON.stringify(merged)); } catch { }
            setError(null);
        } catch (err: any) {
            console.error('Error fetching clients:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [businessId]);

    // Create client
    const createClient = useCallback(async (clientData: {
        name: string;
        phone?: string;
        email?: string;
        id_number?: string;
        address?: string;
        credit_limit?: number;
        notes?: string;
    }) => {
        if (!businessId) return null;

        // OFFLINE: generar cliente local, encolar y actualizar caché optimistamente.
        // Sonda real: navigator.onLine puede mentir (adaptador virtual / túnel caído).
        if (await isRealOffline()) {
            if (!userId) throw new Error('Usuario no autenticado');

            const offlineId = `offline_client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const now = new Date().toISOString();
            const offlineClient: Client = {
                id: offlineId,
                business_id: businessId,
                name: clientData.name,
                phone: clientData.phone,
                email: clientData.email,
                id_number: clientData.id_number,
                address: clientData.address,
                credit_limit: clientData.credit_limit || 0,
                current_debt: 0,
                notes: clientData.notes,
                is_active: true,
                created_at: now,
                updated_at: now,
                transactions: [],
            };

            const updatedClients = [...clients, offlineClient].sort((a, b) => a.name.localeCompare(b.name));
            setClients(updatedClients);
            try { localStorage.setItem(CLIENTS_CACHE_KEY, JSON.stringify(updatedClients)); } catch { }

            await offlineQueue.add(
                'create_client',
                {
                    offlineId,
                    name: clientData.name,
                    phone: clientData.phone || null,
                    email: clientData.email || null,
                    id_number: clientData.id_number || null,
                    address: clientData.address || null,
                    credit_limit: clientData.credit_limit || 0,
                    notes: clientData.notes || null,
                    createdAt: now,
                },
                businessId,
                userId,
            );

            return offlineClient;
        }

        try {
            const { data, error } = await supabase
                .from('clients')
                .insert({
                    business_id: businessId,
                    ...clientData,
                    credit_limit: clientData.credit_limit || 0,
                    current_debt: 0,
                })
                .select()
                .single();

            if (error) throw error;
            await fetchClients();
            return data;
        } catch (err: any) {
            console.error('Error creating client:', err);
            throw err;
        }
    }, [businessId, userId, clients, fetchClients]);

    // Update client
    const updateClient = useCallback(async (clientId: string, updates: Partial<Client>) => {
        try {
            const { error } = await supabase
                .from('clients')
                .update(updates)
                .eq('id', clientId);

            if (error) throw error;
            await fetchClients();
        } catch (err: any) {
            console.error('Error updating client:', err);
            throw err;
        }
    }, [fetchClients]);

    // Add debt (crear transacción de deuda)
    const addDebt = useCallback(async (clientId: string, amount: number, note?: string, orderId?: string, dueDate?: string): Promise<Client | null> => {
        if (!userId) throw new Error('Usuario no autenticado');

        try {
            const client = clients.find(c => c.id === clientId);
            if (!client) throw new Error('Cliente no encontrado');

            // Validar límite de crédito si está configurado
            if (client.credit_limit > 0 && (client.current_debt + amount) > client.credit_limit) {
                throw new Error('Se excede el límite de crédito del cliente');
            }

            // Crear transacción
            const { error: txError } = await supabase
                .from('client_transactions')
                .insert({
                    client_id: clientId,
                    type: 'debt',
                    amount,
                    note,
                    due_date: dueDate || null,
                    order_id: orderId,
                    created_by: userId,
                });

            if (txError) throw txError;

            // Fetch fresh client data with transactions
            const { data: updatedClient } = await supabase
                .from('clients')
                .select('*, transactions:client_transactions(*)')
                .eq('id', clientId)
                .single();

            await fetchClients();
            return updatedClient || null;
        } catch (err: any) {
            console.error('Error adding debt:', err);
            throw err;
        }
    }, [userId, clients, fetchClients]);

    const addPayment = useCallback(async (clientId: string, amount: number, note?: string, paymentMethod?: string, shiftId?: string): Promise<Client | null> => {
        if (!userId) throw new Error('Usuario no autenticado');

        const client = clients.find(c => c.id === clientId);
        if (!client) throw new Error('Cliente no encontrado');

        if (amount > client.current_debt) {
            throw new Error('El abono no puede ser mayor a la deuda actual');
        }

        // OFFLINE: encolar y actualizar caché optimistamente. Sonda real porque
        // navigator.onLine puede mentir (adaptador virtual / túnel caído).
        if (await isRealOffline()) {
            if (!profile?.business_id) throw new Error('Sin business_id');

            const updatedClients = clients.map(c => {
                if (c.id !== clientId) return c;
                return {
                    ...c,
                    current_debt: Math.max(0, c.current_debt - amount),
                    transactions: [
                        ...(c.transactions || []),
                        {
                            id: `offline_ctxn_${Date.now()}`,
                            client_id: clientId,
                            type: 'payment' as const,
                            amount,
                            note: note || undefined,
                            created_by: userId,
                            created_at: new Date().toISOString(),
                        }
                    ]
                };
            });
            setClients(updatedClients);
            try { localStorage.setItem(CLIENTS_CACHE_KEY, JSON.stringify(updatedClients)); } catch { }

            await offlineQueue.add(
                'client_payment',
                {
                    clientId,
                    clientName: client.name,
                    amount,
                    note: note || null,
                    paymentMethod: paymentMethod || null,
                    shiftId: shiftId || null,
                    date: new Date().toISOString(),
                },
                profile.business_id,
                userId,
            );

            if (shiftId) {
                const methodMap: Record<string, string> = {
                    'Efectivo': 'cash', 'Tarjeta': 'card', 'Nequi': 'nequi',
                    'Daviplata': 'daviplata', 'Transferencia': 'transfer', 'Otro': 'other',
                };
                const dbMethod = methodMap[paymentMethod || ''] || paymentMethod?.toLowerCase() || 'cash';
                pushOfflineCashMovement(profile.business_id, {
                    shift_id: shiftId,
                    created_by: userId,
                    type: 'cash_in',
                    amount,
                    description: `Abono cliente: ${client.name}${note ? ' · ' + note : ''}`,
                    payment_method: dbMethod,
                });
            }

            return { ...client, current_debt: Math.max(0, client.current_debt - amount) };
        }

        try {
            // Crear transacción
            const { error: txError } = await supabase
                .from('client_transactions')
                .insert({
                    client_id: clientId,
                    type: 'payment',
                    amount,
                    note,
                    created_by: userId,
                });

            if (txError) throw txError;

            // Fetch fresh client data with transactions
            const { data: updatedClient } = await supabase
                .from('clients')
                .select('*, transactions:client_transactions(*)')
                .eq('id', clientId)
                .single();

            await fetchClients();
            return updatedClient || null;
        } catch (err: any) {
            console.error('Error adding payment:', err);
            throw err;
        }
    }, [userId, clients, fetchClients, profile]);

    // Clear all transactions for a client
    const clearTransactions = useCallback(async (clientId: string): Promise<Client | null> => {
        try {
            // Delete all transactions for this client
            const { error: deleteError } = await supabase
                .from('client_transactions')
                .delete()
                .eq('client_id', clientId);

            if (deleteError) throw deleteError;

            // Reset client's debt to 0
            const { error: updateError } = await supabase
                .from('clients')
                .update({ current_debt: 0 })
                .eq('id', clientId);

            if (updateError) throw updateError;

            // Fetch fresh client data
            const { data: updatedClient } = await supabase
                .from('clients')
                .select('*, transactions:client_transactions(*)')
                .eq('id', clientId)
                .single();

            await fetchClients();
            return updatedClient || null;
        } catch (err: any) {
            console.error('Error clearing transactions:', err);
            throw err;
        }
    }, [fetchClients]);

    const deleteTransaction = useCallback(async (transactionId: string): Promise<void> => {
        try {
            const { error } = await supabase
                .from('client_transactions')
                .delete()
                .eq('id', transactionId);

            if (error) throw error;
            await fetchClients();
        } catch (err: any) {
            console.error('Error deleting transaction:', err);
            throw err;
        }
    }, [fetchClients]);

    // Initial fetch
    useEffect(() => {
        if (businessId) {
            fetchClients(true);
        }
    }, [businessId, fetchClients]);

    const deleteClient = useCallback(async (clientId: string): Promise<void> => {
        try {
            const { error: txError } = await supabase
                .from('client_transactions')
                .delete()
                .eq('client_id', clientId);
            if (txError) throw txError;

            const { error } = await supabase
                .from('clients')
                .delete()
                .eq('id', clientId);

            if (error) throw error;
            await fetchClients();
        } catch (err: any) {
            console.error('Error deleting client:', err);
            throw err;
        }
    }, [fetchClients]);

    return {
        clients,
        loading,
        error,
        createClient,
        updateClient,
        addDebt,
        addPayment,
        clearTransactions,
        deleteTransaction,
        deleteClient,
        refetch: fetchClients,
    };
}
