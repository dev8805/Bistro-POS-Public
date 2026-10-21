import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { ProductType } from '../types';
import { Product, Category } from './useProducts';
import { RecipeLine } from '../lib/recipeMath';

export interface AdminProductSummary {
    id: string;
    name: string;
    type: ProductType;
    price: number;
    cost: number;
    stock: number | null;
    unit: string;
    image: string | null;
    status: 'active' | 'inactive';
    description?: string;
    category: string;
    categoryId?: string;
    categoryObj?: Category;
    isForSale: boolean;
    producible?: number | null;
    defaultSupplierId?: string | null;
    barcode?: string | null;
}

interface UseAdminProductsCatalogParams {
    activeTab: 'retail' | 'recipe' | 'insumos' | 'services' | 'promotions';
    selectedCategory: string; // 'all' o ID/nombre de la categoría
    searchQuery: string;
    isOnline?: boolean;
}

const PAGE_SIZE = 20;

export function useAdminProductsCatalog({
    activeTab,
    selectedCategory,
    searchQuery,
    isOnline = true
}: UseAdminProductsCatalogParams) {
    const { profile } = useAuth();
    const businessId = profile?.business_id;

    const [products, setProducts] = useState<AdminProductSummary[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const categoriesRef = useRef<Category[]>([]);
    categoriesRef.current = categories;
    const [initialLoading, setInitialLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [page, setPage] = useState(0);

    // Tipos de catálogo existentes para mostrar las pestañas (retail, recetas, insumos, servicios, promociones)
    const [availableTypes, setAvailableTypes] = useState({
        hasRetail: false,
        hasRecipes: false,
        hasInsumos: false,
        hasServices: false,
        hasPromotions: false,
    });
    const [metadataLoading, setMetadataLoading] = useState(true);

    // ID del producto que se está descargando para editar
    const [loadingEditId, setLoadingEditId] = useState<string | null>(null);

    // 1. Cargar las categorías y el resumen de tipos disponibles en el negocio (consulta ligera mediante RPC)
    const fetchMetadata = useCallback(async () => {
        if (!businessId || !isOnline) {
            setMetadataLoading(false);
            return;
        }

        try {
            const [catsRes, typesRes] = await Promise.all([
                supabase
                    .from('categories')
                    .select('*')
                    .eq('business_id', businessId)
                    .eq('is_active', true)
                    .order('display_order', { ascending: true }),
                supabase.rpc('get_business_catalog_types', { p_business_id: businessId })
            ]);

            if (catsRes.data) {
                setCategories(catsRes.data);
            }

            if (typesRes.data) {
                const t = typesRes.data as {
                    has_retail?: boolean;
                    has_recipes?: boolean;
                    has_insumos?: boolean;
                    has_services?: boolean;
                    has_promotions?: boolean;
                };
                setAvailableTypes({
                    hasRetail: !!t.has_retail,
                    hasInsumos: !!t.has_insumos,
                    hasRecipes: !!t.has_recipes,
                    hasServices: !!t.has_services,
                    hasPromotions: !!t.has_promotions,
                });
            }
        } catch (err) {
            console.error('[useAdminProductsCatalog] Error cargando metadata:', err);
        } finally {
            setMetadataLoading(false);
        }
    }, [businessId, isOnline]);

    useEffect(() => {
        fetchMetadata();
    }, [fetchMetadata]);

    // 2. Cargar página de 20 productos con columnas visuales ligeras
    const fetchPage = useCallback(async (pageToLoad: number, isReset: boolean = false) => {
        if (!businessId || !isOnline) {
            setInitialLoading(false);
            return;
        }

        // Si la pestaña es promociones, ProductsScreen las maneja desde usePromotions
        if (activeTab === 'promotions') {
            setProducts([]);
            setInitialLoading(false);
            setHasMore(false);
            return;
        }

        if (isReset) {
            setInitialLoading(true);
        } else {
            setLoadingMore(true);
        }

        try {
            let query = supabase
                .from('products')
                .select(`
                    id, name, type, price, cost, stock, unit, image_url, barcode,
                    is_active, is_for_sale, description, category_id, default_supplier_id,
                    category:categories(id, name, color, icon, display_order)
                `)
                .eq('business_id', businessId)
                .eq('is_active', true);

            // Filtro por pestaña
            if (activeTab === 'retail') {
                query = query.eq('type', 'simple').eq('is_for_sale', true);
            } else if (activeTab === 'recipe') {
                query = query.eq('type', 'processed');
            } else if (activeTab === 'insumos') {
                query = query.eq('type', 'simple').eq('is_for_sale', false);
            } else if (activeTab === 'services') {
                query = query.eq('type', 'service');
            }

            // Filtro por categoría seleccionada
            if (selectedCategory && selectedCategory !== 'all') {
                const matchedCat = categoriesRef.current.find(c => c.name === selectedCategory || c.id === selectedCategory);
                if (matchedCat) {
                    query = query.eq('category_id', matchedCat.id);
                } else {
                    query = query.eq('category_id', selectedCategory);
                }
            }

            // Búsqueda por texto (nombre o descripción)
            const cleanSearch = searchQuery.trim();
            if (cleanSearch) {
                query = query.ilike('name', `%${cleanSearch}%`);
            }

            // Paginación en servidor de 20 en 20
            const from = pageToLoad * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;
            query = query.order('name', { ascending: true }).range(from, to);

            const { data, error } = await query;
            if (error) throw error;

            const rawList = data || [];

            // Mapear a AdminProductSummary
            const mapped: AdminProductSummary[] = rawList.map((p: any) => ({
                id: p.id,
                name: p.name,
                type: p.type as ProductType,
                price: p.price ?? 0,
                cost: p.cost ?? 0,
                stock: p.stock ?? null,
                unit: p.unit || 'Und',
                image: p.image_url || null,
                status: p.is_active ? 'active' : 'inactive',
                description: p.description || '',
                category: p.category?.name || 'Sin categoría',
                categoryId: p.category_id,
                categoryObj: p.category,
                isForSale: p.is_for_sale ?? true,
                producible: null,
                defaultSupplierId: p.default_supplier_id || null,
                barcode: p.barcode || null,
            }));

            setProducts(prev => isReset ? mapped : [...prev, ...mapped]);
            setHasMore(rawList.length === PAGE_SIZE);
            setPage(pageToLoad);
        } catch (err) {
            console.error('[useAdminProductsCatalog] Error cargando página:', err);
        } finally {
            setInitialLoading(false);
            setLoadingMore(false);
        }
    }, [businessId, isOnline, activeTab, selectedCategory, searchQuery]);

    // Resetear a página 0 cuando cambien los filtros principales
    useEffect(() => {
        setPage(0);
        fetchPage(0, true);
    }, [fetchPage]);

    // Función para solicitar los siguientes 20 productos (scroll infinito)
    const loadMore = useCallback(() => {
        if (hasMore && !loadingMore && !initialLoading) {
            fetchPage(page + 1, false);
        }
    }, [hasMore, loadingMore, initialLoading, page, fetchPage]);

    // Refrescar lista completa desde página 0
    const refetch = useCallback(() => {
        setPage(0);
        fetchPage(0, true);
        fetchMetadata();
    }, [fetchPage, fetchMetadata]);

    // Escuchar actualizaciones globales de inventario (creación/edición de productos)
    useEffect(() => {
        const handleInventoryUpdated = () => {
            refetch();
        };
        window.addEventListener('inventory-updated', handleInventoryUpdated);
        return () => window.removeEventListener('inventory-updated', handleInventoryUpdated);
    }, [refetch]);

    // 3. Carga bajo demanda al presionar "Editar"
    const fetchFullProductForEdit = useCallback(async (productId: string): Promise<Product | null> => {
        setLoadingEditId(productId);
        try {
            const { data: fullProduct, error } = await supabase
                .from('products')
                .select(`
                    *,
                    category:categories(id, name, color, icon, customizable_options, optimal_min, optimal_max, alert_days, display_order),
                    product_purchase_units(id, unit_name, conversion_factor)
                `)
                .eq('id', productId)
                .single();

            if (error || !fullProduct) throw error || new Error('Producto no encontrado');

            let recipeLines: RecipeLine[] = [];
            let ingredientsList: string[] = fullProduct.ingredients || [];

            // Si es receta, obtener sus ingredientes puntuales
            if (fullProduct.type === 'processed') {
                const { data: ingData } = await supabase
                    .from('product_ingredients')
                    .select('product_id, ingredient_id, quantity, unit')
                    .eq('product_id', productId);

                if (ingData && ingData.length > 0) {
                    const ingIds = ingData.map((i: any) => i.ingredient_id);
                    const { data: ingNamesData } = await supabase
                        .from('products')
                        .select('id, name')
                        .in('id', ingIds);

                    const nameMap = new Map((ingNamesData || []).map((p: any) => [p.id, p.name]));
                    recipeLines = ingData.map((i: any) => ({
                        ingredientId: i.ingredient_id,
                        quantity: Number(i.quantity) || 0,
                        unit: i.unit || 'Unidad'
                    }));
                    const newNames = ingData.map((i: any) => nameMap.get(i.ingredient_id)).filter(Boolean) as string[];
                    ingredientsList = Array.from(new Set([...ingredientsList, ...newNames]));
                }
            }

            const completeProduct: Product = {
                ...fullProduct,
                recipe: recipeLines,
                ingredients: ingredientsList,
                image: fullProduct.image_url || '',
                category: fullProduct.category?.name || '',
                categoryObj: fullProduct.category,
                has_customization: fullProduct.has_customization || (fullProduct.type === 'processed' && ingredientsList.length > 0),
                hasCustomization: fullProduct.has_customization || (fullProduct.type === 'processed' && ingredientsList.length > 0),
                customizableOptions: fullProduct.category?.customizable_options || fullProduct.customizable_options || [],
                excludedOptions: fullProduct.excluded_options || [],
                sale_presentations: fullProduct.sale_presentations || [],
            };

            return completeProduct;
        } catch (err) {
            console.error('[useAdminProductsCatalog] Error al obtener producto completo:', err);
            return null;
        } finally {
            setLoadingEditId(null);
        }
    }, []);

    // 4. Eliminar producto
    const deleteProduct = useCallback(async (productId: string) => {
        try {
            const product = products.find(p => p.id === productId);

            if (product?.image) {
                const match = product.image.match(/\/product-images\/(.+)$/);
                if (match) {
                    await supabase.storage
                        .from('product-images')
                        .remove([match[1]]);
                }
            }

            const { error } = await supabase
                .from('products')
                .delete()
                .eq('id', productId);

            if (error) throw error;

            setProducts(current => current.filter(p => p.id !== productId));
            setCategories(currentCategories =>
                currentCategories.map(cat => {
                    if (!cat.customizable_options || !Array.isArray(cat.customizable_options)) return cat;
                    const cleaned = cat.customizable_options
                        .filter(opt => typeof opt === 'string' || (opt as any).id !== productId)
                        .map(opt => {
                            if (typeof opt === 'object' && opt !== null && 'products' in opt && Array.isArray((opt as any).products)) {
                                return {
                                    ...opt,
                                    products: (opt as any).products.filter((p: any) => p.id !== productId)
                                };
                            }
                            return opt;
                        });
                    return { ...cat, customizable_options: cleaned };
                })
            );
        } catch (err: any) {
            console.error('[useAdminProductsCatalog] Error eliminando producto:', err);
            throw err;
        }
    }, [products]);

    return {
        products,
        categories,
        loading: initialLoading,
        initialLoading,
        loadingMore,
        hasMore,
        loadMore,
        refetch,
        availableTypes,
        loadingEditId,
        fetchFullProductForEdit,
        deleteProduct,
        metadataLoading,
    };
}
