import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export interface PromotionItem {
    id: string;
    promotion_id: string;
    product_id: string;
    promo_price: number;
    product_name?: string;
    product_image?: string;
    product_cost?: number;
    product_original_price?: number;
}

export interface Promotion {
    id: string;
    business_id: string;
    name: string;
    description: string | null;
    image_url: string | null;
    total_price: number;
    is_active: boolean;
    created_at: string;
    items?: PromotionItem[];
}

export const usePromotions = () => {
    const { profile } = useAuth();
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchPromotions = useCallback(async () => {
        if (!profile?.business_id) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('promotions')
                .select(`
          *,
          promotion_items (
            id,
            product_id,
            promo_price,
            product:products (
              name,
              image_url,
              cost,
              price
            )
          )
        `)
                .eq('business_id', profile.business_id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const mapped: Promotion[] = (data || []).map((p: any) => ({
                ...p,
                items: (p.promotion_items || []).map((item: any) => ({
                    id: item.id,
                    promotion_id: p.id,
                    product_id: item.product_id,
                    promo_price: item.promo_price,
                    product_name: item.product?.name,
                    product_image: item.product?.image_url,
                    product_cost: item.product?.cost,
                    product_original_price: item.product?.price,
                })),
            }));

            setPromotions(mapped);
        } catch (err) {
            console.error('Error fetching promotions:', err);
        } finally {
            setLoading(false);
        }
    }, [profile?.business_id]);

    useEffect(() => {
        fetchPromotions();
    }, [fetchPromotions]);

    const createPromotion = async (
        name: string,
        description: string,
        imageUrl: string | null,
        items: { product_id: string; promo_price: number }[]
    ) => {
        if (!profile?.business_id) throw new Error('No business_id');

        const totalPrice = items.reduce((sum, item) => sum + item.promo_price, 0);

        const { data: promo, error: promoError } = await supabase
            .from('promotions')
            .insert({
                business_id: profile.business_id,
                name,
                description: description || null,
                image_url: imageUrl,
                total_price: totalPrice,
            })
            .select()
            .single();

        if (promoError) throw promoError;

        const promoItems = items.map(item => ({
            promotion_id: promo.id,
            product_id: item.product_id,
            promo_price: item.promo_price,
        }));

        const { error: itemsError } = await supabase
            .from('promotion_items')
            .insert(promoItems);

        if (itemsError) {
            // Compensación: eliminar la promo huérfana antes de propagar el error
            await supabase.from('promotions').delete().eq('id', promo.id);
            throw itemsError;
        }

        await fetchPromotions();
        return promo;
    };

    const togglePromotion = async (id: string, isActive: boolean) => {
        const { error } = await supabase
            .from('promotions')
            .update({ is_active: isActive })
            .eq('id', id);

        if (error) throw error;

        setPromotions(prev =>
            prev.map(p => (p.id === id ? { ...p, is_active: isActive } : p))
        );
    };

    const deletePromotion = async (id: string) => {
        const promo = promotions.find(p => p.id === id);
        if (promo?.image_url) {
            const match = promo.image_url.match(/\/product-images\/(.+)$/);
            if (match) {
                await supabase.storage.from('product-images').remove([match[1]]);
            }
        }

        const { error } = await supabase
            .from('promotions')
            .delete()
            .eq('id', id);

        if (error) throw error;
        setPromotions(prev => prev.filter(p => p.id !== id));
    };

    const updatePromotion = async (
        id: string,
        name: string,
        description: string,
        imageUrl: string | null,
        items: { product_id: string; promo_price: number }[]
    ) => {
        const totalPrice = items.reduce((sum, item) => sum + item.promo_price, 0);

        const { error: promoError } = await supabase
            .from('promotions')
            .update({
                name,
                description: description || null,
                image_url: imageUrl,
                total_price: totalPrice,
            })
            .eq('id', id);

        if (promoError) throw promoError;

        const { data: oldItems } = await supabase
            .from('promotion_items')
            .select('product_id, promo_price')
            .eq('promotion_id', id);

        await supabase.from('promotion_items').delete().eq('promotion_id', id);

        const promoItems = items.map(item => ({
            promotion_id: id,
            product_id: item.product_id,
            promo_price: item.promo_price,
        }));

        const { error: itemsError } = await supabase
            .from('promotion_items')
            .insert(promoItems);

        if (itemsError) {
            // Compensación: restaurar los items anteriores si el reinsert falla
            if (oldItems && oldItems.length > 0) {
                await supabase.from('promotion_items').insert(
                    oldItems.map(i => ({ promotion_id: id, product_id: i.product_id, promo_price: i.promo_price }))
                );
            }
            throw itemsError;
        }

        await fetchPromotions();
    };

    return {
        promotions,
        loading,
        createPromotion,
        updatePromotion,
        togglePromotion,
        deletePromotion,
        refetch: fetchPromotions,
    };
};
