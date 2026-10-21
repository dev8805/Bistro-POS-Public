import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { saveAdminProducts, getAdminProducts, saveCategories, getCachedCategories } from '../lib/offlineStorage';
import { prefetchProductImages } from '../lib/prefetchProductImages';
import { computeProducible, RecipeLine } from '../lib/recipeMath';
import { CustomizableOption, SalePresentation } from '../types';
import { useBusinessSettings } from './useBusinessSettings';

const PRODUCTS_CACHE_KEY = 'bistro_cached_products';
const CATEGORIES_CACHE_KEY = 'bistro_cached_categories';

export interface Category {
    id: string;
    business_id: string;
    name: string;
    description?: string;
    color: string;
    icon: string;
    display_order: number;
    is_active: boolean;
    optimal_min?: number;
    optimal_max?: number;
    alert_days?: number;
    customizable_options?: CustomizableOption[];
    created_at: string;
    updated_at: string;
}

export interface Product {
    id: string;
    business_id: string;
    category_id?: string;
    name: string;
    description?: string;
    type: 'simple' | 'processed' | 'service';
    price: number;
    cost: number;
    stock?: number;
    min_stock: number;
    unit: string;
    image_url?: string;
    image: string; // Required - compatibility with types.Product (mapped from image_url)
    category: string; // Required - compatibility with types.Product (mapped from categoryObj.name)
    barcode?: string;
    is_active: boolean;
    is_for_sale: boolean;
    has_customization: boolean;
    customizable_options: CustomizableOption[];
    nicknames?: string[]; // Apodos/aliases para búsqueda
    recipe?: RecipeLine[]; // Receta (solo productos 'processed' en modo calculado)
    producible?: number | null; // Unidades preparables con el stock actual de insumos (null = costo manual / sin receta)
    purchase_unit?: string;
    conversion_factor?: number;
    product_purchase_units?: { unit_name: string; conversion_factor: number }[];
    sale_presentations?: SalePresentation[];
    parent_product_id?: string;
    is_secondary?: boolean;
    presentation_unit?: string;
    created_at: string;
    updated_at: string;
    default_supplier_id?: string | null;
    categoryObj?: Category; // The full category object from Supabase
    // Compatibility fields for UI components expecting camelCase
    hasCustomization?: boolean;
    customizableOptions?: CustomizableOption[];
}

export function useProducts() {
    const { profile } = useAuth();
    const { poundInGrams } = useBusinessSettings();
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Espejos en ref: el listener de realtime los necesita sin re-suscribirse
    // en cada cambio de catálogo.
    const productsRef = useRef<Product[]>(products);
    productsRef.current = products;
    const categoriesRef = useRef<Category[]>(categories);
    categoriesRef.current = categories;

    const businessId = profile?.business_id;

    // Fetch categories (cache-first)
    const fetchCategories = useCallback(async () => {
        if (!businessId) return;

        // Cargar desde IDB inmediatamente
        try {
            const cached = await getCachedCategories();
            if (cached.length > 0) setCategories(cached);
        } catch { }

        if (!navigator.onLine) return;

        try {
            const { data, error } = await supabase
                .from('categories')
                .select('*')
                .eq('business_id', businessId)
                .eq('is_active', true)
                .order('display_order', { ascending: true });

            if (error) throw error;
            setCategories(data || []);
            saveCategories(data || []).catch(() => { });
        } catch (err: any) {
            console.error('Error fetching categories:', err);
            setError(err.message);
        }
    }, [businessId]);

    // Fetch products (cache-first)
    const fetchProducts = useCallback(async () => {
        if (!businessId) return;
        console.log('🔎[FETCH][productos-admin] useProducts.fetchProducts ejecutado');

        // Cargar desde IDB inmediatamente
        try {
            const cached = await getAdminProducts();
            if (cached.length > 0) {
                const sortedCached = [...cached].sort((a, b) => a.name.localeCompare(b.name));
                setProducts(sortedCached);
                setLoading(false);
            }
        } catch { }

        if (!navigator.onLine) {
            setLoading(false);
            return;
        }

        try {
            if (products.length === 0) setLoading(true);
            const { data, error } = await supabase
                .from('products')
                .select(`
          *,
          category:categories(id, name, color, icon, customizable_options, optimal_min, optimal_max, alert_days, display_order),
          product_purchase_units(unit_name, conversion_factor)
        `)
                .eq('business_id', businessId)
                .eq('is_active', true)
                .order('name', { ascending: true });

            if (error) throw error;

            const rawProducts = data || [];

            // Fetch ingredients relationships separately to avoid complex join errors
            const productIds = rawProducts.filter((p: any) => p.type === 'processed').map((p: any) => p.id);

            let productIngredientsMap: Record<string, string[]> = {};
            let recipeMap: Record<string, RecipeLine[]> = {};

            if (productIds.length > 0) {
                const { data: ingredientsData, error: ingError } = await supabase
                    .from('product_ingredients')
                    .select('product_id, ingredient_id, quantity, unit')
                    .in('product_id', productIds);

                if (!ingError && ingredientsData) {
                    const productNames = new Map(rawProducts.map((p: any) => [p.id, p.name]));

                    ingredientsData.forEach((pi: any) => {
                        if (!productIngredientsMap[pi.product_id]) {
                            productIngredientsMap[pi.product_id] = [];
                        }
                        const ingName = productNames.get(pi.ingredient_id);
                        if (ingName) {
                            productIngredientsMap[pi.product_id].push(ingName);
                        }
                        if (!recipeMap[pi.product_id]) recipeMap[pi.product_id] = [];
                        recipeMap[pi.product_id].push({
                            ingredientId: pi.ingredient_id,
                            quantity: Number(pi.quantity) || 0,
                            unit: pi.unit || 'Unidad',
                        });
                    });
                }
            }

            // Stock/unidad de cada insumo (los insumos son productos) para calcular "producible"
            const ingredientStockMap: Record<string, { stock: number | null; unit: string }> = {};
            rawProducts.forEach((p: any) => {
                ingredientStockMap[p.id] = { stock: p.stock ?? null, unit: p.unit || 'Und' };
            });

            const formattedProducts: Product[] = rawProducts.map((p: any) => {
                let ingredientsList: string[] = p.ingredients || [];

                if (p.type === 'processed' && productIngredientsMap[p.id]) {
                    const recipeNames = productIngredientsMap[p.id];
                    ingredientsList = Array.from(new Set([...ingredientsList, ...recipeNames]));
                }

                const recipe = p.type === 'processed' ? (recipeMap[p.id] || []) : undefined;
                const producible = p.type === 'processed' ? computeProducible(recipe, ingredientStockMap, poundInGrams) : undefined;

                return {
                    ...p,
                    ingredients: ingredientsList,
                    recipe,
                    producible,
                    image: p.image_url || '',
                    category: p.category?.name || '',
                    categoryObj: p.category,
                    has_customization: p.has_customization || (p.type === 'processed' && ingredientsList.length > 0),
                    hasCustomization: p.has_customization || (p.type === 'processed' && ingredientsList.length > 0),
                    customizableOptions: p.category?.customizable_options || p.customizable_options || [],
                    excludedOptions: p.excluded_options || []
                };
            });

            setProducts(formattedProducts);
            setError(null);
            saveAdminProducts(formattedProducts).catch(() => { });
            prefetchProductImages(formattedProducts);
        } catch (err: any) {
            console.error('Error fetching products:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [businessId, poundInGrams]);

    // Create category
    const createCategory = useCallback(async (name: string, color?: string, icon?: string) => {
        if (!businessId) return null;

        try {
            const { data, error } = await supabase
                .from('categories')
                .insert({
                    business_id: businessId,
                    name,
                    color: color || '#6B7280',
                    icon: icon || 'category',
                    display_order: categories.length,
                })
                .select()
                .single();

            if (error) throw error;
            await fetchCategories();
            return data;
        } catch (err: any) {
            console.error('Error creating category:', err);
            throw err;
        }
    }, [businessId, categories.length, fetchCategories]);

    // Delete product (Hard Delete) - also removes image from storage
    const deleteProduct = useCallback(async (productId: string) => {
        try {
            const product = products.find(p => p.id === productId);

            if (product?.image_url) {
                const match = product.image_url.match(/\/product-images\/(.+)$/);
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
            setCategories(currentCategories => {
                const nextCategories = currentCategories.map(cat => {
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
                });
                saveCategories(nextCategories).catch(() => { });
                return nextCategories;
            });
        } catch (err: any) {
            console.error('Error deleting product:', err);
            throw err;
        }
    }, [products]);

    // Update product stock
    const updateProductStock = useCallback(async (productId: string, quantity: number, supplierName?: string, purchaseDateISO?: string, customUnitCost?: number, supplierId?: string): Promise<string | undefined> => {
        try {
            const product = products.find(p => p.id === productId);
            if (!product || product.stock === null) return undefined;

            const newStock = (product.stock || 0) + quantity;

            const { error } = await supabase
                .from('products')
                .update({ stock: newStock })
                .eq('id', productId);

            if (error) throw error;

            let lotId: string | undefined;

            if (quantity > 0 && businessId) {
                const { data: lotData, error: lotError } = await supabase.from('inventory_lots').insert({
                    business_id: businessId,
                    product_id: productId,
                    initial_quantity: quantity,
                    remaining_quantity: Math.max(0, quantity + Math.min(0, product.stock || 0)),
                    unit_cost: customUnitCost ?? (product.cost || 0),
                    purchase_date: purchaseDateISO || new Date().toISOString(),
                    supplier_name: supplierName || null,
                    supplier_id: supplierId || null,
                }).select('id').single();

                if (lotError) {
                    console.error('[updateProductStock] Error creating auto-lot:', lotError);
                } else {
                    lotId = lotData?.id;
                }
            }

            await fetchProducts();
            return lotId;
        } catch (err: any) {
            console.error('Error updating product stock:', err);
            throw err;
        }
    }, [products, fetchProducts, businessId]);

    // OPTIMIZED: Initial fetch in parallel
    useEffect(() => {
        if (businessId) {
            Promise.all([fetchCategories(), fetchProducts()]);
        }
    }, [businessId, fetchCategories, fetchProducts]);

    // REALTIME: sin canal propio. La suscripción única vive en App.tsx
    // (canal `products-sync`); aquí reaccionamos a su relay.
    // - UPDATE: actualización PUNTUAL del producto cambiado (sin refetch) + persistir IDB.
    //   Si el cambio es estructural (baja, cambio de tipo/vendibilidad, categoría nueva)
    //   cae al refetch completo porque no se puede derivar del payload.
    // - INSERT/DELETE (o evento sin detalle): refetch completo (poco frecuente).
    // Ver spec optimizar-fetch-productos.
    useEffect(() => {
        if (!businessId) return;
        let t: ReturnType<typeof setTimeout> | null = null;
        const onRealtimeChange = (e: Event) => {
            const detail = (e as CustomEvent).detail || {};
            const eventType = detail.eventType;
            const rec = detail.new;

            if (eventType === 'UPDATE' && rec?.id) {
                const current = productsRef.current.find(p => p.id === rec.id);
                const categoryObj = categoriesRef.current.find(c => c.id === rec.category_id);

                // Cambios que el payload no permite derivar: el producto sale del catálogo
                // (soft delete o cambio de tipo/vendibilidad) o estrena una categoría que
                // este cliente todavía no tiene cacheada. Esos casos van por refetch.
                const needsFullRefetch =
                    !current ||
                    rec.is_active === false ||
                    rec.type !== current.type ||
                    rec.is_for_sale !== current.is_for_sale ||
                    (!!rec.category_id && !categoryObj);

                if (!needsFullRefetch) {
                    // Actualización puntual: solo el producto cambiado, sin descargar el catálogo.
                    setProducts(prev => {
                        const next = prev.map(p => {
                            if (p.id !== rec.id) return p;
                            // `ingredients` se agrega en el mapeo de fetchProducts,
                            // no está declarado en la interface Product.
                            const ingredients: string[] = (p as any).ingredients ?? [];
                            const hasCustomization = rec.has_customization
                                || (rec.type === 'processed' && ingredients.length > 0);
                            // Merge de la fila completa + re-derivación de los campos calculados.
                            // Copiar la fila entera evita que un campo editable (costo, unidad,
                            // código, apodos…) quede desactualizado en la UI hasta recargar.
                            return {
                                ...p,
                                ...rec,
                                ingredients,
                                // Derivados que no viven en la fila: se conservan tal cual.
                                recipe: p.recipe,
                                producible: p.producible,
                                // image_url lo consume la UI de admin; `image` es el alias de
                                // compatibilidad. Ambos siguen a la fila, incluido el null
                                // (el usuario borró la imagen).
                                image: rec.image_url || '',
                                category: categoryObj?.name || '',
                                categoryObj,
                                has_customization: hasCustomization,
                                hasCustomization,
                                customizableOptions: categoryObj?.customizable_options
                                    || rec.customizable_options || [],
                                excludedOptions: rec.excluded_options || [],
                            };
                        });
                        // Persistir a IndexedDB para que la caché offline quede fresca (Req 6).
                        saveAdminProducts(next).catch(() => { });
                        return next;
                    });
                    return;
                }
            }

            // INSERT / DELETE / evento sin detalle → recargar (debounced, poco frecuente).
            if (t) clearTimeout(t);
            t = setTimeout(() => { fetchProducts(); }, 200);
        };
        window.addEventListener('products-realtime-changed', onRealtimeChange);
        return () => {
            if (t) clearTimeout(t);
            window.removeEventListener('products-realtime-changed', onRealtimeChange);
        };
    }, [businessId, fetchProducts]);

    return {
        products,
        categories,
        loading,
        error,
        createCategory,
        updateProductStock,
        deleteProduct,
        refetchProducts: fetchProducts,
        refetchCategories: fetchCategories,
    };
}
