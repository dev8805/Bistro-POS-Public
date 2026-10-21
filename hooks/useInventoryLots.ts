import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { toDateStringInTz } from '../lib/timezone';

export interface InventoryLot {
    id: string;
    business_id: string;
    product_id: string;
    initial_quantity: number;
    remaining_quantity: number;
    unit_cost: number;
    purchase_date: string;
    expiration_date: string | null;
    supplier_name: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface AddLotData {
    product_id: string;
    quantity: number;
    unit_cost: number;
    supplier_name?: string;
    expiration_date?: string;
    notes?: string;
}

export const useInventoryLots = () => {
    const { profile } = useAuth();
    const [loading, setLoading] = useState(false);

    const businessId = profile?.business_id;

    const addLot = useCallback(async (data: AddLotData) => {
        if (!businessId) return null;

        setLoading(true);
        try {
            const { data: lot, error: lotError } = await supabase
                .from('inventory_lots')
                .insert({
                    business_id: businessId,
                    product_id: data.product_id,
                    initial_quantity: data.quantity,
                    remaining_quantity: data.quantity,
                    unit_cost: data.unit_cost,
                    purchase_date: new Date().toISOString(),
                    supplier_name: data.supplier_name || null,
                    expiration_date: data.expiration_date || null,
                    notes: data.notes || null,
                })
                .select()
                .single();

            if (lotError) throw lotError;

            const { error: stockError } = await supabase.rpc('increment_stock', {
                p_product_id: data.product_id,
                p_quantity: data.quantity,
            });

            if (stockError) {
                await supabase
                    .from('products')
                    .update({ stock: supabase.rpc ? undefined : data.quantity })
                    .eq('id', data.product_id);
            }

            return lot;
        } catch (err) {
            console.error('[useInventoryLots] addLot error:', err);
            throw err;
        } finally {
            setLoading(false);
        }
    }, [businessId]);

    const getLots = useCallback(async (productId: string): Promise<InventoryLot[]> => {
        if (!businessId) return [];

        const { data, error } = await supabase
            .from('inventory_lots')
            .select('*')
            .eq('business_id', businessId)
            .eq('product_id', productId)
            .gt('remaining_quantity', 0)
            .order('purchase_date', { ascending: true });

        if (error) {
            console.error('[useInventoryLots] getLots error:', error);
            return [];
        }
        return data || [];
    }, [businessId]);

    const getAllActiveLots = useCallback(async (): Promise<InventoryLot[]> => {
        if (!businessId) return [];

        const { data, error } = await supabase
            .from('inventory_lots')
            .select('*')
            .eq('business_id', businessId)
            .gt('remaining_quantity', 0)
            .order('purchase_date', { ascending: true });

        if (error) {
            console.error('[useInventoryLots] getAllActiveLots error:', error);
            return [];
        }
        return data || [];
    }, [businessId]);

    const getLotsNearExpiry = useCallback(async (daysThreshold: number = 7): Promise<InventoryLot[]> => {
        if (!businessId) return [];

        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

        const { data, error } = await supabase
            .from('inventory_lots')
            .select('*')
            .eq('business_id', businessId)
            .gt('remaining_quantity', 0)
            .not('expiration_date', 'is', null)
            .lte('expiration_date', toDateStringInTz(thresholdDate))
            .order('expiration_date', { ascending: true });

        if (error) {
            console.error('[useInventoryLots] getLotsNearExpiry error:', error);
            return [];
        }
        return data || [];
    }, [businessId]);

    const deductFifo = useCallback(async (
        productId: string,
        orderItemId: string,
        quantity: number
    ): Promise<number> => {
        if (!businessId) return 0;

        const { data, error } = await supabase.rpc('deduct_fifo', {
            p_product_id: productId,
            p_business_id: businessId,
            p_order_item_id: orderItemId,
            p_quantity: quantity,
        });

        if (error) {
            console.error('[useInventoryLots] deductFifo error:', error);
            return 0;
        }
        return Number(data || 0);
    }, [businessId]);

    const deductFifoForWastage = useCallback(async (
        productId: string,
        wastageId: string,
        quantity: number
    ): Promise<number> => {
        if (!businessId) return 0;

        const { data, error } = await supabase.rpc('deduct_fifo_for_wastage', {
            p_product_id:  productId,
            p_business_id: businessId,
            p_wastage_id:  wastageId,
            p_quantity:    quantity,
        });

        if (error) {
            console.error('[useInventoryLots] deductFifoForWastage error:', error);
            return 0;
        }
        return Number(data || 0);
    }, [businessId]);

    return {
        loading,
        addLot,
        getLots,
        getAllActiveLots,
        getLotsNearExpiry,
        deductFifo,
        deductFifoForWastage,
    };
};
