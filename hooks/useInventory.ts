import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { todayDateStringInTz } from '../lib/timezone';

export interface AdjustmentRecord {
    wastageId: string;
    productId: string;
    productName: string;
    quantity: number;
    value: number;
    unit: string;
    timestamp: string;
}

// Producto con stock para inventario
export interface InventoryProduct {
    id: string;
    name: string;
    type: 'simple' | 'processed' | 'service';
    stock: number | null;
    cost: number;
    unit: string;
    category_name: string;
    image_url: string | null;
}

// Ingrediente con stock para inventario
export interface InventoryIngredient {
    id: string;
    name: string;
    stock: number;
    cost_per_unit: number;
    unit: string;
    source_table?: 'ingredients' | 'products'; // Para saber de qué tabla viene
}

// Item de conteo (producto o ingrediente con stock contado)
export interface InventoryCountItem {
    id: string;
    name: string;
    unit: string;
    systemStock: number;
    countedStock: number | null; // null = no contado aún
    cost: number;
    category?: string;
    type: 'product' | 'ingredient';
}

export interface UseInventoryParams {
    searchQuery?: string;
    categoryFilter?: string;
    isOnline?: boolean;
}

const PAGE_SIZE = 10;

export function useInventory(params?: UseInventoryParams) {
    const { profile } = useAuth();
    const [products, setProducts] = useState<InventoryProduct[]>([]);
    const [ingredients, setIngredients] = useState<InventoryIngredient[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [categoriesMap, setCategoriesMap] = useState<Array<{ id: string; name: string }>>([]);
    const [totalProductsCount, setTotalProductsCount] = useState<number>(0);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const businessId = profile?.business_id;
    const searchQuery = params?.searchQuery || '';
    const categoryFilter = params?.categoryFilter || '';
    const isOnline = params?.isOnline ?? true;

    // Fetch categorías activas del negocio
    const fetchCategories = useCallback(async () => {
        if (!businessId || !isOnline) return;
        try {
            const { data, error: catError } = await supabase
                .from('categories')
                .select('id, name')
                .eq('business_id', businessId)
                .eq('is_active', true)
                .order('display_order', { ascending: true });

            if (catError) throw catError;
            const cats = data || [];
            setCategoriesMap(cats);
            setCategories(cats.map(c => c.name));
        } catch (err: any) {
            console.error('Error fetching categories in useInventory:', err);
        }
    }, [businessId, isOnline]);

    // Fetch productos simples para venta paginados de 10 en 10
    const fetchProducts = useCallback(async (pageToLoad: number = 0, isReset: boolean = false) => {
        if (!businessId || !isOnline) {
            setLoading(false);
            return;
        }

        if (isReset) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }

        try {
            let query = supabase
                .from('products')
                .select(`
                    id,
                    name,
                    type,
                    stock,
                    cost,
                    unit,
                    image_url,
                    category_id,
                    category:categories(id, name)
                `, { count: 'exact' })
                .eq('business_id', businessId)
                .eq('is_active', true)
                .eq('type', 'simple')
                .eq('is_for_sale', true)
                .not('stock', 'is', null);

            // Filtro por categoría seleccionada
            if (categoryFilter && categoryFilter !== 'all') {
                const matchedCat = categoriesMap.find(c => c.name === categoryFilter || c.id === categoryFilter);
                if (matchedCat) {
                    query = query.eq('category_id', matchedCat.id);
                }
            }

            // Filtro por búsqueda
            const cleanSearch = searchQuery.trim();
            if (cleanSearch) {
                query = query.ilike('name', `%${cleanSearch}%`);
            }

            // Paginación en servidor de a 10 productos
            const from = pageToLoad * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;
            query = query.order('name', { ascending: true }).range(from, to);

            const { data, count, error } = await query;
            if (error) throw error;

            if (count !== null && count !== undefined) {
                setTotalProductsCount(count);
            }

            const rawList = data || [];
            const formattedProducts: InventoryProduct[] = rawList.map((p: any) => ({
                id: p.id,
                name: p.name,
                type: p.type,
                stock: p.stock,
                cost: p.cost || 0,
                unit: p.unit || 'Und',
                category_name: p.category?.name || 'Sin categoría',
                image_url: p.image_url || null,
            }));

            setProducts(prev => isReset ? formattedProducts : [...prev, ...formattedProducts]);
            setHasMore(rawList.length === PAGE_SIZE);
            setPage(pageToLoad);
        } catch (err: any) {
            console.error('Error fetching inventory products:', err);
            setError(err.message);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [businessId, isOnline, categoryFilter, categoriesMap, searchQuery]);

    // Solicitar siguientes 10 productos (scroll infinito)
    const loadMore = useCallback(() => {
        if (hasMore && !loadingMore && !loading) {
            fetchProducts(page + 1, false);
        }
    }, [hasMore, loadingMore, loading, page, fetchProducts]);

    // Fetch ingredientes con stock (tabla ingredients + productos marcados como ingredientes)
    const fetchIngredients = useCallback(async () => {
        if (!businessId || !isOnline) return;

        try {
            // Fetch ingredientes de la tabla ingredients
            const { data: ingredientsData, error: ingredientsError } = await supabase
                .from('ingredients')
                .select('id, name, stock, cost_per_unit, unit')
                .eq('business_id', businessId)
                .eq('is_active', true)
                .order('name', { ascending: true });

            if (ingredientsError) throw ingredientsError;

            // Fetch productos marcados como ingredientes (is_for_sale = false)
            const { data: productIngredientsData, error: productIngredientsError } = await supabase
                .from('products')
                .select('id, name, stock, cost, unit')
                .eq('business_id', businessId)
                .eq('is_active', true)
                .eq('type', 'simple')
                .eq('is_for_sale', false)
                .not('stock', 'is', null)
                .order('name', { ascending: true });

            if (productIngredientsError) throw productIngredientsError;

            // Convertir productos a formato de ingredientes
            const productIngredients: InventoryIngredient[] = (productIngredientsData || []).map((p: any) => ({
                id: p.id,
                name: p.name,
                stock: p.stock ?? 0,
                cost_per_unit: p.cost || 0,
                unit: p.unit || 'Und',
                source_table: 'products' as const,
            }));

            // Agregar source_table a ingredientes
            const formattedIngredients: InventoryIngredient[] = (ingredientsData || []).map((i: any) => ({
                ...i,
                source_table: 'ingredients' as const,
            }));

            // Combinar ambos arrays
            const allIngredients = [...formattedIngredients, ...productIngredients];

            // Ordenar por nombre
            allIngredients.sort((a, b) => a.name.localeCompare(b.name));

            setIngredients(allIngredients);
        } catch (err: any) {
            console.error('Error fetching inventory ingredients:', err);
            setError(err.message);
        }
    }, [businessId, isOnline]);

    // Fetch all data
    const fetchAll = useCallback(async () => {
        setLoading(true);
        setError(null);
        await Promise.all([fetchCategories(), fetchProducts(0, true), fetchIngredients()]);
        setLoading(false);
    }, [fetchCategories, fetchProducts, fetchIngredients]);

    const registerInventoryLoss = useCallback(async (
        quantityLost: number,
        lossValue: number,
        productId: string,
        productName: string
    ): Promise<{ wastageId: string; quantity: number } | null> => {
        if (!businessId || !profile?.id || quantityLost <= 0) return null;

        // 1. Descontar FIFO de los lotes (drena lotes igual que una venta)
        const { error: fifoError } = await supabase.rpc('deduct_fifo', {
            p_product_id: productId,
            p_business_id: businessId,
            p_order_item_id: null,
            p_quantity: quantityLost,
        });
        if (fifoError) console.error('[InventoryLoss] FIFO deduct error:', fifoError);

        // 2. Registrar la merma y retornar su ID
        const { data, error: wasteErr } = await supabase.from('wastage').insert({
            business_id: businessId,
            amount: lossValue,
            description: 'Ajuste de inventario',
            reason: 'AJUSTE DE INVENTARIO',
            product_name: productName,
            product_id: productId,
            quantity: quantityLost,
            date: todayDateStringInTz(),
            created_by: profile.id,
        }).select('id').single();

        if (wasteErr) {
            console.error('[InventoryLoss] Error registering wastage:', wasteErr);
            return null;
        }
        return { wastageId: data.id, quantity: quantityLost };
    }, [businessId, profile?.id]);

    // Actualizar stock de un producto — retorna AdjustmentRecord si el ajuste fue negativo
    const updateProductStock = useCallback(async (
        productId: string,
        newStock: number
    ): Promise<{ success: true; adjustment?: AdjustmentRecord }> => {
        try {
            let product = products.find(p => p.id === productId);
            if (!product) {
                const { data: pData } = await supabase
                    .from('products')
                    .select('id, name, stock, cost, unit, type')
                    .eq('id', productId)
                    .single();
                if (pData) {
                    product = {
                        id: pData.id,
                        name: pData.name,
                        stock: pData.stock,
                        cost: pData.cost || 0,
                        unit: pData.unit || 'Und',
                        type: pData.type,
                        category_name: '',
                        image_url: null,
                    };
                }
            }
            if (!product) return { success: true };
            const oldStock = product.stock ?? 0;

            const { error } = await supabase
                .from('products')
                .update({ stock: newStock })
                .eq('id', productId);

            if (error) throw error;

            const diff = newStock - oldStock;

            if (diff > 0 && businessId) {
                const { data: newLot } = await supabase.from('inventory_lots').insert({
                    business_id: businessId,
                    product_id: productId,
                    initial_quantity: diff,
                    remaining_quantity: diff,
                    unit_cost: 0,
                    purchase_date: new Date().toISOString(),
                    notes: 'Ajuste de inventario (sobrante)',
                }).select().single();

                if (newLot) {
                    const { error: debtErr } = await supabase.from('business_debts').insert({
                        business_id: businessId,
                        type: 'supplier',
                        creditor_name: 'Ajuste de inventario',
                        description: `${product.name} (${diff} ${product.unit}) - Ajuste de inventario (sobrante)`,
                        total_amount: 0,
                        paid_amount: 0,
                        status: 'paid',
                        inventory_lot_id: newLot.id,
                        created_by: profile?.id,
                    });
                    if (debtErr) console.error('[Adjustment] Error registering debt:', debtErr);
                }
            }

            let adjustment: AdjustmentRecord | undefined;
            if (diff < 0) {
                const result = await registerInventoryLoss(
                    Math.abs(diff),
                    Math.abs(diff) * (product.cost || 0),
                    product.id,
                    product.name
                );
                if (result) {
                    adjustment = {
                        wastageId: result.wastageId,
                        productId: product.id,
                        productName: product.name,
                        quantity: result.quantity,
                        value: Math.abs(diff) * (product.cost || 0),
                        unit: product.unit,
                        timestamp: new Date().toISOString(),
                    };
                }
            }

            setProducts(prev => prev.map(p =>
                p.id === productId ? { ...p, stock: newStock } : p
            ));

            return { success: true, adjustment };
        } catch (err: any) {
            console.error('Error updating product stock:', err);
            throw err;
        }
    }, [products, businessId, registerInventoryLoss]);

    // Actualizar stock de un ingrediente (puede ser de tabla ingredients o products)
    const updateIngredientStock = useCallback(async (ingredientId: string, newStock: number) => {
        try {
            // Buscar el ingrediente para saber de qué tabla viene
            const ingredient = ingredients.find(i => i.id === ingredientId);
            const table = ingredient?.source_table || 'ingredients';

            const { error } = await supabase
                .from(table)
                .update({ stock: newStock })
                .eq('id', ingredientId);

            if (error) throw error;

            // Actualización optimista
            setIngredients(prev => prev.map(i =>
                i.id === ingredientId ? { ...i, stock: newStock } : i
            ));

            return true;
        } catch (err: any) {
            console.error('Error updating ingredient stock:', err);
            throw err;
        }
    }, [ingredients]);

    // Actualizar múltiples stocks — retorna array de AdjustmentRecords para ajustes negativos
    const updateMultipleStocks = useCallback(async (
        items: Array<{ id: string; newStock: number; type: 'product' | 'ingredient' }>
    ): Promise<{ success: true; adjustments: AdjustmentRecord[] }> => {
        const adjustments: AdjustmentRecord[] = [];
        try {
            const productUpdates = items.filter(i => i.type === 'product');
            const ingredientUpdates = items.filter(i => i.type === 'ingredient');

            for (const item of productUpdates) {
                let product = products.find(p => p.id === item.id);
                if (!product) {
                    const { data: pData } = await supabase
                        .from('products')
                        .select('id, name, stock, cost, unit, type')
                        .eq('id', item.id)
                        .single();
                    if (pData) {
                        product = {
                            id: pData.id,
                            name: pData.name,
                            stock: pData.stock,
                            cost: pData.cost || 0,
                            unit: pData.unit || 'Und',
                            type: pData.type,
                            category_name: '',
                            image_url: null,
                        };
                    }
                }
                const oldStock = product?.stock ?? 0;

                await supabase
                    .from('products')
                    .update({ stock: item.newStock })
                    .eq('id', item.id);

                const diff = item.newStock - oldStock;

                if (diff > 0 && businessId && product) {
                    const { data: newLot } = await supabase.from('inventory_lots').insert({
                        business_id: businessId,
                        product_id: item.id,
                        initial_quantity: diff,
                        remaining_quantity: diff,
                        unit_cost: 0,
                        purchase_date: new Date().toISOString(),
                        notes: 'Ajuste de inventario (sobrante)',
                    }).select().single();

                    if (newLot) {
                        supabase.from('business_debts').insert({
                            business_id: businessId,
                            type: 'supplier',
                            creditor_name: 'Ajuste de inventario',
                            description: `${product.name} (${diff} ${product.unit}) - Ajuste de inventario (sobrante)`,
                            total_amount: 0,
                            paid_amount: 0,
                            status: 'paid',
                            inventory_lot_id: newLot.id,
                            created_by: profile?.id,
                        }).then(({ error: debtErr }) => {
                            if (debtErr) console.error('[Adjustment] Error registering debt:', debtErr);
                        });
                    }
                }

                if (diff < 0 && product) {
                    const result = await registerInventoryLoss(
                        Math.abs(diff),
                        Math.abs(diff) * (product.cost || 0),
                        product.id,
                        product.name
                    );
                    if (result) {
                        adjustments.push({
                            wastageId: result.wastageId,
                            productId: product.id,
                            productName: product.name,
                            quantity: result.quantity,
                            value: Math.abs(diff) * (product.cost || 0),
                            unit: product.unit,
                            timestamp: new Date().toISOString(),
                        });
                    }
                }
            }

            for (const item of ingredientUpdates) {
                const ingredient = ingredients.find(i => i.id === item.id);
                const table = ingredient?.source_table || 'ingredients';
                const oldStock = ingredient?.stock ?? 0;

                await supabase
                    .from(table)
                    .update({ stock: item.newStock })
                    .eq('id', item.id);

                const diff = item.newStock - oldStock;
                if (diff < 0 && ingredient) {
                    await registerInventoryLoss(
                        Math.abs(diff),
                        Math.abs(diff) * (ingredient.cost_per_unit || 0),
                        ingredient.id,
                        ingredient.name
                    );
                }
            }

            await fetchAll();

            return { success: true, adjustments };
        } catch (err: any) {
            console.error('Error updating multiple stocks:', err);
            throw err;
        }
    }, [fetchAll, ingredients, products, businessId, registerInventoryLoss]);

    // Deshacer ajuste negativo via RPC
    const undoInventoryAdjustment = useCallback(async (
        wastageId: string,
        productId: string,
        quantity: number
    ): Promise<boolean> => {
        if (!businessId) return false;
        const { error } = await supabase.rpc('undo_inventory_adjustment', {
            p_wastage_id: wastageId,
            p_product_id: productId,
            p_business_id: businessId,
            p_quantity: quantity,
        });
        if (error) {
            console.error('[undoAdjustment] Error:', error);
            return false;
        }
        await fetchAll();
        return true;
    }, [businessId, fetchAll]);

    // Verificar si hay ventas o compras del producto posteriores a un timestamp
    const hasMovementsAfter = useCallback(async (
        productId: string,
        afterTimestamp: string
    ): Promise<boolean> => {
        if (!businessId) return true;
        const [salesRes, lotsRes] = await Promise.all([
            supabase
                .from('order_items')
                .select('id, orders!inner(created_at, status, business_id)')
                .eq('product_id', productId)
                .eq('orders.business_id', businessId)
                .eq('orders.status', 'completed')
                .gt('orders.created_at', afterTimestamp)
                .limit(1),
            supabase
                .from('inventory_lots')
                .select('id')
                .eq('product_id', productId)
                .eq('business_id', businessId)
                .gt('purchase_date', afterTimestamp)
                .not('notes', 'like', 'Ajuste de inventario%')
                .limit(1)
        ]);
        return (salesRes.data?.length ?? 0) > 0 || (lotsRes.data?.length ?? 0) > 0;
    }, [businessId]);

    // Carga inicial y reactiva cuando cambian filtros
    const isFirstMount = useRef(true);
    useEffect(() => {
        if (!businessId || !isOnline) return;
        if (isFirstMount.current) {
            isFirstMount.current = false;
            fetchAll();
        } else {
            fetchProducts(0, true);
        }
    }, [businessId, isOnline, searchQuery, categoryFilter]);

    return {
        products,
        ingredients,
        categories,
        totalProductsCount,
        loading,
        loadingMore,
        hasMore,
        loadMore,
        error,
        updateProductStock,
        updateIngredientStock,
        updateMultipleStocks,
        undoInventoryAdjustment,
        hasMovementsAfter,
        refetch: fetchAll,
    };
}
