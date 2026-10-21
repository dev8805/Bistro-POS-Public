import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { assignSupplierBrandColor } from '../utils/supplierBrandColor';

export interface Supplier {
    id: string;
    business_id: string;
    name: string;
    nit?: string;
    phone?: string;
    address?: string;
    color?: string;
    // Columna legada en la BD: se conserva pero el sistema la ignora.
    invoice_config?: Record<string, unknown> | null;
    // Umbrales de rotación de inventario (días). null = usar defaults (7/12/3).
    optimal_min?: number | null;
    optimal_max?: number | null;
    alert_days?: number | null;
    created_at: string;
    updated_at: string;
}

export function useSuppliers() {
    const { profile } = useAuth();
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);

    const businessId = profile?.business_id;

    const fetchSuppliers = useCallback(async () => {
        if (!businessId) return;

        if (!navigator.onLine) {
            const cached = localStorage.getItem(`bistro_suppliers_${businessId}`);
            if (cached) setSuppliers(JSON.parse(cached));
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('suppliers')
                .select('*')
                .eq('business_id', businessId)
                .order('name', { ascending: true });

            if (error) throw error;
            setSuppliers(data || []);
            localStorage.setItem(`bistro_suppliers_${businessId}`, JSON.stringify(data || []));
        } catch (err: any) {
            const cached = localStorage.getItem(`bistro_suppliers_${businessId}`);
            if (cached) {
                setSuppliers(JSON.parse(cached));
            } else {
                console.error('Error fetching suppliers:', err);
            }
        } finally {
            setLoading(false);
        }
    }, [businessId]);

    const createSupplier = useCallback(async (data: {
        name: string;
        nit?: string;
        phone?: string;
        address?: string;
    }) => {
        if (!businessId) throw new Error('No autenticado');

        const trimmedName = data.name.trim();
        const exists = suppliers.some(
            (s) => s.name.toLowerCase() === trimmedName.toLowerCase()
        );
        if (exists) {
            throw new Error(`El proveedor "${trimmedName}" ya existe`);
        }

        const { data: supplier, error } = await supabase
            .from('suppliers')
            .insert({
                business_id: businessId,
                name: trimmedName,
                nit: data.nit?.trim() || null,
                phone: data.phone?.trim() || null,
                address: data.address?.trim() || null,
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                throw new Error(`El proveedor "${trimmedName}" ya existe`);
            }
            console.error('Supabase error creating supplier:', error);
            throw error;
        }

        const existingColors = suppliers.map((s) => s.color).filter(Boolean) as string[];
        const assignedColor = await assignSupplierBrandColor(supplier.id, supplier.name, existingColors);
        if (assignedColor) {
            supplier.color = assignedColor;
        }

        await fetchSuppliers();
        return supplier as Supplier;
    }, [businessId, fetchSuppliers, suppliers]);

    const updateSupplier = useCallback(async (id: string, data: {
        name?: string;
        nit?: string;
        phone?: string;
        address?: string;
        color?: string;
        optimal_min?: number | null;
        optimal_max?: number | null;
        alert_days?: number | null;
    }) => {
        if (!businessId) throw new Error('No autenticado');

        const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
        if (data.name !== undefined) updateData.name = data.name.trim();
        if (data.nit !== undefined) updateData.nit = data.nit.trim() || null;
        if (data.phone !== undefined) updateData.phone = data.phone.trim() || null;
        if (data.address !== undefined) updateData.address = data.address.trim() || null;
        if (data.color !== undefined) updateData.color = data.color.trim() || null;
        if (data.optimal_min !== undefined) updateData.optimal_min = data.optimal_min;
        if (data.optimal_max !== undefined) updateData.optimal_max = data.optimal_max;
        if (data.alert_days !== undefined) updateData.alert_days = data.alert_days;

        const { error } = await supabase
            .from('suppliers')
            .update(updateData)
            .eq('id', id);

        if (error) throw error;
        await fetchSuppliers();
    }, [businessId, fetchSuppliers]);

    const deleteSupplier = useCallback(async (id: string) => {
        if (!businessId) throw new Error('No autenticado');

        const { error } = await supabase
            .from('suppliers')
            .delete()
            .eq('id', id);

        if (error) throw error;
        await fetchSuppliers();
    }, [businessId, fetchSuppliers]);

    useEffect(() => {
        if (businessId) {
            fetchSuppliers();
        }
    }, [businessId, fetchSuppliers]);

    useEffect(() => {
        if (!businessId) return;
        const handleUpdate = () => {
            fetchSuppliers();
        };
        window.addEventListener('suppliers-updated', handleUpdate);
        return () => {
            window.removeEventListener('suppliers-updated', handleUpdate);
        };
    }, [businessId, fetchSuppliers]);

    return {
        suppliers,
        loading,
        createSupplier,
        updateSupplier,
        deleteSupplier,
        fetchSuppliers,
    };
}
