import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';

export interface SupplierProductLink {
  id: string;
  supplier_id: string;
  product_id: string;
  created_at: string;
}

export const useSupplierProductConfig = (businessId: string | undefined) => {
  const [links, setLinks] = useState<SupplierProductLink[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const fetchLinks = useCallback(async () => {
    if (!businessId) {
      setLinks([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('supplier_product_config')
        .select('id, supplier_id, product_id, created_at, suppliers!inner(business_id)')
        .eq('suppliers.business_id', businessId);

      if (error) throw error;

      const parsed: SupplierProductLink[] = (data || []).map((row: any) => ({
        id: row.id,
        supplier_id: row.supplier_id,
        product_id: row.product_id,
        created_at: row.created_at,
      }));

      setLinks(parsed);
    } catch (err: any) {
      console.error('Error fetching supplier_product_config:', err);
      showToast('No se pudieron cargar las vinculaciones de productos', 'warning');
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, [businessId, showToast]);

  const addLink = useCallback(async (supplierId: string, productId: string) => {
    const { data, error } = await supabase
      .from('supplier_product_config')
      .upsert(
        { supplier_id: supplierId, product_id: productId },
        { onConflict: 'supplier_id,product_id', ignoreDuplicates: true }
      )
      .select()
      .single();

    if (error && error.code !== '23505') throw error;

    if (data) {
      setLinks((prev) => [...prev, data as SupplierProductLink]);
    }
  }, []);

  const removeLink = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('supplier_product_config')
      .delete()
      .eq('id', id);

    if (error) throw error;

    setLinks((prev) => prev.filter((link) => link.id !== id));
  }, []);

  const getProductsForSupplier = useCallback(
    (supplierId: string): string[] => {
      return links
        .filter((link) => link.supplier_id === supplierId)
        .map((link) => link.product_id);
    },
    [links]
  );

  const getSuppliersForProduct = useCallback(
    (productId: string): string[] => {
      return links
        .filter((link) => link.product_id === productId)
        .map((link) => link.supplier_id);
    },
    [links]
  );

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  return {
    links,
    loading,
    addLink,
    removeLink,
    getProductsForSupplier,
    getSuppliersForProduct,
    refetch: fetchLinks,
  };
};
