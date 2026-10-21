import React, { useState, useRef, useEffect } from 'react';
import { Screen, ProductType } from '../types';
import { ScreenLoader } from '../components/ScreenLoader';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useProducts, Product, Category } from '../hooks/useProducts';
import { useAdminProductsCatalog } from '../hooks/useAdminProductsCatalog';
import { usePromotions, Promotion } from '../hooks/usePromotions';
import { formatCurrency } from '../lib/formatters';
import { useToast } from '../context/ToastContext';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { usePermissions } from '../hooks/usePermissions';

import { SupplierPicker } from '../components/SupplierPicker';
import { SupplierSettingsModal } from '../components/SupplierSettingsModal';
import { useSuppliers, Supplier } from '../hooks/useSuppliers';
import { useSupplierProductConfig } from '../hooks/useSupplierProductConfig';
import { isProductOfSupplier } from '../lib/supplierUtils';
import { usePlanFeatures } from '../hooks/usePlanFeatures';
import { UpgradeProModal } from '../components/modals/UpgradeProModal';

interface ProductData {
    id: string; // uuid
    name: string;
    type: ProductType;
    price: number;
    cost: number;
    stock: number | null;
    unit: string;
    image: string | null;
    status: 'active' | 'inactive'; // mapped from boolean is_active
    description?: string;
    category: string; // category name as string
    categoryObj?: Category;
    isForSale: boolean; // false = insumo (no se vende)
    producible?: number | null; // recetas: unidades preparables (null = costo manual / sin receta)
    defaultSupplierId?: string | null;
}

interface ProductsScreenProps {
    onNavigate: (screen: Screen) => void;
    onEditProduct?: (product: Product) => void;
    onEditPromotion?: (promotion: Promotion) => void;
    isOnline?: boolean;
}

export interface SupplierThresholds {
    optimal_min: number;
    optimal_max: number;
    alert_days: number;
}

export const DEFAULT_THRESHOLDS: SupplierThresholds = {
    optimal_min: 7,
    optimal_max: 12,
    alert_days: 3,
};

const getPluralUnit = (unit: string) => {
    const u = (unit || 'Unidad').trim();
    if (u.toLowerCase().endsWith('s')) return u;
    if (/[aeiouáéíóú]$/i.test(u)) return u + 's';
    return u + 'es';
};

const getShortPluralUnit = (unit: string) => {
    const lu = (unit || 'und').toLowerCase().trim();
    if (lu === 'unidad' || lu === 'unidades' || lu === 'und') return 'unds';
    if (lu === 'libra' || lu === 'libras' || lu === 'lb') return 'lbs';
    if (lu === 'kilogramo' || lu === 'kilogramos' || lu === 'kilo' || lu === 'kilos' || lu === 'kg') return 'kgs';
    if (lu === 'gramo' || lu === 'gramos' || lu === 'gr' || lu === 'g') return 'grs';
    if (lu === 'litro' || lu === 'litros' || lu === 'l' || lu === 'lt') return 'lts';
    if (lu === 'metro' || lu === 'metros' || lu === 'm' || lu === 'mt') return 'mts';
    if (lu === 'caja' || lu === 'cajas' || lu === 'cj') return 'cjs';
    if (lu === 'paquete' || lu === 'paquetes' || lu === 'paq' || lu === 'pq') return 'paqs';
    if (lu === 'porción' || lu === 'porciones' || lu === 'porcion') return 'porcs';
    return lu.substring(0, 3) + 's';
};

export const ProductsScreen: React.FC<ProductsScreenProps> = ({ onNavigate, onEditProduct, onEditPromotion, isOnline = true }) => {
    const { profile } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearchQuery(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const [sortDiasInv, setSortDiasInv] = useState<'none' | 'asc' | 'desc'>('none');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [isMobileSearchExpanded, setIsMobileSearchExpanded] = useState(false);
    const [showCreateMenu, setShowCreateMenu] = useState(false);
    const [activeTab, setActiveTab] = useState<'retail' | 'recipe' | 'insumos' | 'services' | 'promotions'>('retail');

    const {
        products: catalogProducts,
        categories: catalogCategories,
        loading: catalogLoading,
        loadingMore,
        hasMore,
        loadMore,
        refetch: refetchCatalog,
        availableTypes,
        fetchFullProductForEdit,
        loadingEditId,
        deleteProduct: deleteCatalogProduct,
        metadataLoading,
    } = useAdminProductsCatalog({
        activeTab,
        selectedCategory,
        searchQuery: debouncedSearchQuery,
        isOnline,
    });
    const { promotions, loading: promosLoading, deletePromotion, togglePromotion } = usePromotions();
    const { showToast } = useToast();
    const { confirmAction } = useConfirmDialog();
    const { hasPermission } = usePermissions();
    // Puede crear/editar/eliminar el catálogo (productos, recetas, servicios, promociones).
    // Sin este permiso, solo puede ver y buscar.
    const canCreate = hasPermission('inv_create');
    const { canUseRecipes, canUsePromotions } = usePlanFeatures();
    const [upgradeModalInfo, setUpgradeModalInfo] = useState<{ open: boolean; title: string; desc: string } | null>(null);
    const [healthFilter, setHealthFilter] = useState<'all' | 'lento' | 'optimo' | 'reordenar' | 'estancado' | 'critico'>('all');
    const [openTooltipId, setOpenTooltipId] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const desktopScrollRef = useRef<HTMLDivElement>(null);
    const mobileScrollRef = useRef<HTMLDivElement>(null);
    const [salesMap, setSalesMap] = useState<Record<string, number>>({});
    const [salesLoading, setSalesLoading] = useState(true);
    // Fecha de la primera venta POR PRODUCTO (id → Date). La "Salud del Stock" necesita 28 días
    // de historial de ventas de cada producto para que su velocidad sea confiable; antes de ese
    // punto se muestra una cuenta regresiva en lugar del diagnóstico. Un producto sin ventas no
    // aparece en el mapa.
    const [firstSaleMap, setFirstSaleMap] = useState<Record<string, Date>>({});
    const [avgCostMap, setAvgCostMap] = useState<Record<string, number>>({});
    const [avgCostLoading, setAvgCostLoading] = useState(true);
    const [searchType, setSearchType] = useState<'product' | 'supplier'>('product');
    const [supplierMap, setSupplierMap] = useState<Record<string, string[]>>({});
    const [suppliersLoading, setSuppliersLoading] = useState(true);

    const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
    const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
    const supplierInputRef = useRef<HTMLInputElement>(null);

    // Supplier Picker state (filtrado prominente por proveedor)
    const { suppliers: allSuppliersList, loading: suppliersListLoading, fetchSuppliers: refetchSuppliers } = useSuppliers();
    const { links: supplierProductLinks, loading: linksLoading, addLink, getProductsForSupplier } = useSupplierProductConfig(profile?.business_id);
    const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
    const [configModalSupplier, setConfigModalSupplier] = useState<Supplier | null>(null);

    const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});
    // Mapa de lotes activos por proveedor: productId → { supplierNameNormalized → remaining_quantity }
    const [lotsBySupplierMap, setLotsBySupplierMap] = useState<Record<string, Record<string, number>>>({});

    const handleToggleExpand = (productId: string) => {
        setExpandedProducts(prev => ({
            ...prev,
            [productId]: !prev[productId]
        }));
    };

    // Auto-scroll a top al cambiar categoría
    useEffect(() => {
        desktopScrollRef.current?.scrollTo({ top: 0 });
        mobileScrollRef.current?.scrollTo({ top: 0 });
    }, [selectedCategory]);

    // Fetch sales for the last 28 days to calculate velocity
    useEffect(() => {
        const fetchSalesVelocity = async () => {
            if (!profile?.business_id || !isOnline) {
                setSalesLoading(false);
                return;
            }

            // 1. Primera venta por producto (RPC ligero para gatear la Salud del Stock)
            // 2. Velocidad de ventas últimos 28 días (RPC agregada en base de datos para mínimo egress)
            const [firstSalesRes, salesVelocityRes] = await Promise.all([
                supabase.rpc('get_product_first_sales', { p_business_id: profile.business_id }),
                supabase.rpc('get_product_sales_velocity', {
                    p_business_id: profile.business_id,
                    p_days: 28
                })
            ]);

            const newFirstSaleMap: Record<string, Date> = {};
            (firstSalesRes.data as { product_id: string; first_sale: string }[] | null)?.forEach(row => {
                if (row.product_id && row.first_sale) {
                    newFirstSaleMap[row.product_id] = new Date(row.first_sale);
                }
            });
            setFirstSaleMap(newFirstSaleMap);

            if (salesVelocityRes.error) {
                console.error('Error fetching sales velocity:', salesVelocityRes.error);
                setSalesLoading(false);
                return;
            }

            const newSalesMap: Record<string, number> = {};
            (salesVelocityRes.data as { product_id: string; total_sold: number | string }[] | null)?.forEach(row => {
                if (row.product_id) {
                    newSalesMap[row.product_id] = Number(row.total_sold || 0);
                }
            });

            setSalesMap(newSalesMap);
            setSalesLoading(false);
        };

        fetchSalesVelocity();
    }, [profile?.business_id]);

    // Fetch active lots to calculate weighted average cost + lots-by-supplier map
    useEffect(() => {
        const fetchAvgCosts = async () => {
            if (!profile?.business_id || !isOnline) {
                setAvgCostLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from('inventory_lots')
                .select('product_id, remaining_quantity, unit_cost, supplier_name, supplier_id')
                .eq('business_id', profile.business_id)
                .gt('remaining_quantity', 0);

            if (error || !data) {
                setAvgCostLoading(false);
                return;
            }

            const totals: Record<string, { sumCost: number; sumQty: number }> = {};
            const lotsBySup: Record<string, Record<string, number>> = {};

            data.forEach((lot: any) => {
                if (!lot.product_id) return;
                const qty = Number(lot.remaining_quantity);
                const cost = Number(lot.unit_cost);

                // Avg cost (solo lotes con costo > 0)
                if (cost > 0) {
                    if (!totals[lot.product_id]) totals[lot.product_id] = { sumCost: 0, sumQty: 0 };
                    totals[lot.product_id].sumCost += qty * cost;
                    totals[lot.product_id].sumQty += qty;
                }

                // Lots by supplier (todos los lotes con remaining > 0 y supplier_id)
                if (lot.supplier_id) {
                    const key = lot.supplier_id as string;
                    if (!lotsBySup[lot.product_id]) lotsBySup[lot.product_id] = {};
                    lotsBySup[lot.product_id][key] = (lotsBySup[lot.product_id][key] || 0) + qty;
                }
            });

            const map: Record<string, number> = {};
            Object.entries(totals).forEach(([id, { sumCost, sumQty }]) => {
                if (sumQty > 0) map[id] = Math.round(sumCost / sumQty);
            });

            setAvgCostMap(map);
            setLotsBySupplierMap(lotsBySup);
            setAvgCostLoading(false);
        };

        fetchAvgCosts();
    }, [profile?.business_id]);

    // Fetch all suppliers from inventory lots to allow filtering by supplier
    useEffect(() => {
        const fetchSuppliers = async () => {
            if (!profile?.business_id || !isOnline) {
                setSuppliersLoading(false);
                return;
            }
            const { data, error } = await supabase
                .from('inventory_lots')
                .select('product_id, supplier_id')
                .eq('business_id', profile.business_id)
                .not('supplier_id', 'is', null);

            if (error || !data) {
                setSuppliersLoading(false);
                return;
            }

            const map: Record<string, Set<string>> = {};
            data.forEach((lot: any) => {
                if (!lot.product_id || !lot.supplier_id) return;
                if (!map[lot.product_id]) map[lot.product_id] = new Set();
                map[lot.product_id].add(lot.supplier_id);
            });

            const finalMap: Record<string, string[]> = {};
            Object.entries(map).forEach(([id, set]) => {
                finalMap[id] = Array.from(set);
            });
            setSupplierMap(finalMap);
            setSuppliersLoading(false);
        };

        fetchSuppliers();
    }, [profile?.business_id]);

    const calcSuggestedQty = (stock: number, velocity: number, optimalMax: number): number => {
        const qty = Math.ceil(optimalMax * velocity - stock);
        return (stock + qty) / velocity > optimalMax ? qty - 1 : qty;
    };

    const getInventoryDaysLabel = (product: ProductData, thresholds: SupplierThresholds = DEFAULT_THRESHOLDS) => {
        if (product.type === 'service' || product.type === 'promotion') return null;

        // Las recetas no controlan stock propio, así que no tienen "Salud del Stock":
        // la columna se oculta en la sub-pestaña Recetas (solo se muestra "Producible").
        //
        // OPCIÓN FUTURA: convertir esto en un diagnóstico real para recetas combinando
        // `producible` (unidades preparables con el stock de insumos) + velocidad de venta del plato
        // → "te alcanza para X días de venta antes de quedarte sin insumos". Por ahora, sin diagnóstico.
        if (product.type === 'processed') return null;

        if (product.stock === null || product.stock === undefined) {
            return {
                badge: 'Sin datos',
                style: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700',
                icon: 'help',
                velocityText: '-',
                tooltip: 'Stock no definido o infinito.',
                status: 'sindatos'
            };
        }

        if (product.stock === 0) {
            const soldLast28Days = salesMap[product.id] || 0;
            const dailyVelocity = soldLast28Days / 28;
            const unit = product.unit || 'uds';
            const optimalMax = thresholds.optimal_max;
            const velocityText = soldLast28Days > 0
                ? `${dailyVelocity.toFixed(1)} ${unit}/día`
                : `0 ${unit}/sem`;
            const suggestedQty = dailyVelocity > 0 ? calcSuggestedQty(0, dailyVelocity, optimalMax) : null;
            const tooltip = soldLast28Days > 0
                ? `Sin stock. Vendías ${dailyVelocity.toFixed(1)} ${unit}/día — llama a tu proveedor hoy mismo para resurtir.`
                : 'Sin stock. Llama a tu proveedor para resurtir.';
            return {
                badge: 'Agotado (0d)',
                style: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800',
                icon: 'error',
                velocityText,
                suggestedQty,
                tooltip,
                status: 'agotado'
            };
        }
        if (product.stock < 0) {
            return {
                badge: `${product.stock} ${product.unit || 'und'}`,
                style: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800',
                icon: 'warning',
                velocityText: '-',
                tooltip: `Stock en negativo (${product.stock} ${product.unit || 'und'}). Se vendieron unidades sin registrar compra. Haz una compra de inventario para regularizarlo.`,
                status: 'agotado'
            };
        }

        if (salesLoading) {
            return {
                badge: 'Calculando...',
                style: 'bg-gray-100 text-gray-400 border-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700',
                icon: 'hourglass_empty',
                velocityText: '-',
                tooltip: 'Calculando velocidad de ventas...',
                status: 'sindatos'
            };
        }

        const soldLast28Days = salesMap[product.id] || 0;
        const dailyVelocity = soldLast28Days / 28;
        const unit = product.unit || 'uds';
        const margin = (product.price || 0) - (product.cost || 0);
        const monthlyProfit = margin * soldLast28Days;

        // Gate por producto: el diagnóstico por velocidad divide las ventas entre 28 días.
        // Si el producto tuvo su primera venta hace menos de 28 días, ese promedio sería engañoso
        // (asume 28 días de historial que aún no existen). Mientras tanto mostramos una cuenta
        // regresiva. Los estados que NO dependen de la velocidad (Agotado, stock negativo, Sin datos)
        // ya retornaron antes y no se ven afectados.
        const firstSale = firstSaleMap[product.id];
        if (firstSale) {
            const daysSinceFirstSale = (Date.now() - firstSale.getTime()) / (24 * 60 * 60 * 1000);
            if (daysSinceFirstSale < 28) {
                const remainingDays = Math.max(1, Math.ceil(28 - daysSinceFirstSale));
                return {
                    badge: `Faltan ${remainingDays}d`,
                    style: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
                    icon: 'hourglass_top',
                    velocityText: '-',
                    tooltip: `Aún estamos midiendo. La Salud del Stock aparece 28 días después de la primera venta de este producto. Faltan ${remainingDays} día(s).`,
                    status: 'sindatos'
                };
            }
        }

        if (soldLast28Days === 0) {
            // Sin primera venta registrada = el producto nunca se ha vendido. No se puede
            // diagnosticar ("Estancado" implicaría que vendía y dejó de venderse); mostramos un
            // estado neutro hasta que tenga su primera venta y arranque la ventana de 28 días.
            if (!firstSale) {
                return {
                    badge: 'Sin ventas aún',
                    style: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
                    icon: 'schedule',
                    velocityText: '-',
                    tooltip: 'Este producto todavía no se ha vendido. La Salud del Stock aparecerá 28 días después de su primera venta.',
                    status: 'sindatos'
                };
            }
            return {
                badge: 'Estancado',
                style: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800',
                icon: 'mood_bad',
                velocityText: `0 ${unit}/sem`,
                tooltip: `Tienes ${product.stock} ${unit} en inventario y no se vendió nada en los últimos 28 días. Considera aplicar un descuento para mover la mercancía.`,
                status: 'estancado'
            };
        }

        const days = product.stock / dailyVelocity;
        const velocityLabel = `${dailyVelocity.toFixed(1)} ${unit}/día`;
        const tooltip = `Tienes ${product.stock} ${unit} y vendes un promedio de ${dailyVelocity.toFixed(1)} al día. El stock durará ${days.toFixed(1)} días. Ganancia de los últimos 28 días: $${formatCurrency(monthlyProfit)}.`;

        const alertDays = thresholds.alert_days;
        const optimalMin = thresholds.optimal_min;
        const optimalMax = thresholds.optimal_max;

        if (days <= alertDays) {
            return {
                badge: `CRÍTICO (${days.toFixed(0)}d)`,
                style: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800 animate-pulse',
                icon: 'warning',
                velocityText: velocityLabel,
                suggestedQty: calcSuggestedQty(product.stock, dailyVelocity, optimalMax),
                tooltip,
                status: 'critico'
            };
        } else if (days < optimalMin) {
            return {
                badge: `Re-ordenar (${days.toFixed(0)}d)`,
                style: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800',
                icon: 'shopping_cart',
                velocityText: velocityLabel,
                suggestedQty: calcSuggestedQty(product.stock, dailyVelocity, optimalMax),
                tooltip,
                status: 'reordenar'
            };
        } else if (days <= optimalMax) {
            return {
                badge: `Óptimo (${days.toFixed(0)}d)`,
                style: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
                icon: 'check_circle',
                velocityText: velocityLabel,
                tooltip,
                status: 'optimo'
            };
        } else {
            return {
                badge: `Lento (${days.toFixed(0)}d)`,
                style: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
                icon: 'hourglass_bottom',
                velocityText: velocityLabel,
                tooltip,
                status: 'lento'
            };
        }
    };

    // Resuelve los umbrales de rotación para un producto según el contexto de proveedor
    const resolveThresholds = (product: ProductData): SupplierThresholds => {
        // Si hay un proveedor seleccionado en el picker, usar sus umbrales
        if (selectedSupplierId) {
            const sup = allSuppliersList.find(s => s.id === selectedSupplierId);
            if (sup) return {
                optimal_min: sup.optimal_min ?? 7,
                optimal_max: sup.optimal_max ?? 12,
                alert_days: sup.alert_days ?? 3,
            };
        }

        // Sin proveedor seleccionado: buscar el proveedor del producto por lotes activos
        const productLots = lotsBySupplierMap[product.id];
        if (productLots) {
            const supplierIds = Object.keys(productLots).filter(s => productLots[s] > 0);
            if (supplierIds.length === 1) {
                const sup = allSuppliersList.find(s => s.id === supplierIds[0]);
                if (sup) return {
                    optimal_min: sup.optimal_min ?? 7,
                    optimal_max: sup.optimal_max ?? 12,
                    alert_days: sup.alert_days ?? 3,
                };
            }
        }

        // Fallback: si el producto tiene default_supplier_id, usar esos umbrales
        if (product.defaultSupplierId) {
            const sup = allSuppliersList.find(s => s.id === product.defaultSupplierId);
            if (sup) return {
                optimal_min: sup.optimal_min ?? 7,
                optimal_max: sup.optimal_max ?? 12,
                alert_days: sup.alert_days ?? 3,
            };
        }

        return DEFAULT_THRESHOLDS;
    };

    // Cuenta cuántos proveedores tienen lotes activos para un producto
    const getActiveSupplierCount = (productId: string): number => {
        const productLots = lotsBySupplierMap[productId];
        if (!productLots) return 0;
        return Object.keys(productLots).filter(s => productLots[s] > 0).length;
    };

    // Reset category & health filters al cambiar de pestaña
    useEffect(() => {
        setSelectedCategory('all');
        setHealthFilter('all');
        setSelectedSupplierId(null);
    }, [activeTab]);

    // Close tooltip when tapping outside
    useEffect(() => {
        if (!openTooltipId) return;
        const handleOutsideClick = () => setOpenTooltipId(null);
        document.addEventListener('click', handleOutsideClick);
        return () => document.removeEventListener('click', handleOutsideClick);
    }, [openTooltipId]);

    // Categorías únicas visibles en la pestaña actual (usando las categorías del negocio)
    const uniqueCategories = React.useMemo(() => {
        if (activeTab === 'promotions') {
            return ['Promociones'];
        }
        return catalogCategories.map(c => c.name).sort();
    }, [catalogCategories, activeTab]);

    // Proveedores que realmente tienen productos (excluye los de solo gastos)
    const suppliersWithProducts = React.useMemo(() => {
        const idsWithProducts = new Set<string>();

        // Source 1: products with default_supplier_id
        catalogProducts.forEach(p => {
            if (p.defaultSupplierId) idsWithProducts.add(p.defaultSupplierId);
        });

        // Source 2: inventory_lots supplier_id (vinculación directa por UUID)
        Object.values(supplierMap).forEach(ids => ids.forEach(id => idsWithProducts.add(id)));

        // Source 3: manual links in supplier_product_config
        supplierProductLinks.forEach(link => idsWithProducts.add(link.supplier_id));

        return allSuppliersList.filter(s => idsWithProducts.has(s.id));
    }, [allSuppliersList, catalogProducts, supplierMap, supplierProductLinks]);


    const products: ProductData[] = activeTab === 'promotions'
        ? promotions.map(p => ({
            id: `promo_${p.id}`,
            name: p.name,
            type: ProductType.PROMOTION,
            price: p.total_price,
            cost: (p.items || []).reduce((sum, i) => sum + (i.product_cost || 0), 0),
            stock: null,
            unit: 'Unidad',
            image: p.image_url || null,
            status: (p.is_active ? 'active' : 'inactive') as 'active' | 'inactive',
            description: (p.items || []).map(i => i.product_name).filter(Boolean).join(' + '),
            category: 'Promociones',
            categoryObj: undefined,
            isForSale: true,
            producible: null,
            defaultSupplierId: null
        }))
        : catalogProducts.map(p => ({
            id: p.id,
            name: p.name,
            type: p.type as ProductType,
            price: p.price,
            cost: p.cost,
            stock: p.stock ?? null,
            unit: p.unit,
            image: p.image || null,
            status: p.status,
            description: p.description,
            category: p.category,
            categoryObj: p.categoryObj,
            isForSale: p.isForSale,
            producible: p.producible,
            defaultSupplierId: p.defaultSupplierId || null
        }));

    const { hasRetail, hasRecipes, hasInsumos, hasServices, hasPromotions: typesHasPromotions } = availableTypes;
    const hasPromotions = typesHasPromotions || promotions.length > 0;
    // "Salud del Stock" (diagnóstico por velocidad de ventas) solo aplica a retail con stock propio.
    // Se oculta para recetas (usan "Producible") e insumos. Ver OPCIÓN FUTURA en getInventoryDaysLabel.
    // La columna siempre se muestra en retail; el gate de 28 días es POR PRODUCTO dentro de
    // getInventoryDaysLabel (muestra una cuenta regresiva mientras el producto no madura).
    const showHealthColumn = activeTab === 'retail';

    // Si la pestaña activa no tiene datos, saltar a la primera disponible
    useEffect(() => {
        if (catalogLoading) return;
        const currentHasData =
            (activeTab === 'retail' && hasRetail) ||
            (activeTab === 'recipe' && hasRecipes) ||
            (activeTab === 'insumos' && hasInsumos) ||
            (activeTab === 'services' && hasServices) ||
            (activeTab === 'promotions' && hasPromotions);
        if (currentHasData) return;

        if (hasRetail) setActiveTab('retail');
        else if (hasRecipes) setActiveTab('recipe');
        else if (hasInsumos) setActiveTab('insumos');
        else if (hasServices) setActiveTab('services');
        else if (hasPromotions) setActiveTab('promotions');
    }, [hasRetail, hasRecipes, hasInsumos, hasServices, hasPromotions, activeTab, catalogLoading]);

    const getInventoryDaysValue = (product: ProductData): number => {
        if (product.type === 'service') return Infinity;
        if (product.stock === null || product.stock === undefined) return Infinity;
        if (product.stock <= 0) return 0;
        const soldLast28Days = salesMap[product.id] || 0;
        if (soldLast28Days === 0) return Infinity;
        return product.stock / (soldLast28Days / 28);
    };

    // Stats agregados por categoría
    const categoryStats = React.useMemo(() => {
        type CatStat = { totalStock: number; totalDailyVelocity: number; productCount: number; agotados: number; categoryObj?: Category };
        const map: Record<string, CatStat> = {};

        products.forEach(p => {
            if (p.type === 'service' || p.type === 'promotion') return;
            const cat = p.category || 'Sin categoría';
            if (!map[cat]) map[cat] = { totalStock: 0, totalDailyVelocity: 0, productCount: 0, agotados: 0, categoryObj: p.categoryObj };
            map[cat].productCount++;
            if (p.stock !== null && p.stock !== undefined) {
                if (p.stock <= 0) {
                    map[cat].agotados++;
                } else {
                    map[cat].totalStock += p.stock;
                    const vel = (salesMap[p.id] || 0) / 28;
                    map[cat].totalDailyVelocity += vel;
                }
            }
        });

        const result: Record<string, { days: number; status: string; icon: string; style: string; totalStock: number; velocity: number; productCount: number; agotados: number; categoryObj?: Category }> = {};
        Object.entries(map).forEach(([cat, stat]) => {
            const { totalStock, totalDailyVelocity, productCount, agotados, categoryObj } = stat;
            let days = -1;
            let status = 'sindatos';
            let icon = 'help';
            let style = 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';

            if (totalDailyVelocity > 0) {
                const alertDays = DEFAULT_THRESHOLDS.alert_days;
                const optimalMin = DEFAULT_THRESHOLDS.optimal_min;
                const optimalMax = DEFAULT_THRESHOLDS.optimal_max;

                days = totalStock / totalDailyVelocity;
                if (days <= alertDays) { status = 'critico'; icon = 'warning'; style = 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800 animate-pulse'; }
                else if (days < optimalMin) { status = 'reordenar'; icon = 'shopping_cart'; style = 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800'; }
                else if (days <= optimalMax) { status = 'optimo'; icon = 'check_circle'; style = 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'; }
                else { status = 'lento'; icon = 'hourglass_bottom'; style = 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'; }
            } else if (agotados > 0 && totalStock === 0) {
                status = 'agotado'; icon = 'error'; style = 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800';
            } else if (totalStock > 0) {
                status = 'estancado'; icon = 'mood_bad'; style = 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800';
            }

            result[cat] = { days, status, icon, style, totalStock, velocity: totalDailyVelocity, productCount, agotados, categoryObj };
        });
        return result;
    }, [products, salesMap]);

    const allSuppliers = React.useMemo(() => {
        const set = new Set<string>();
        Object.values(supplierMap).forEach(list => list.forEach(s => set.add(s)));
        return Array.from(set).sort();
    }, [supplierMap]);

    const supplierSuggestions = React.useMemo(() => {
        if (searchType !== 'supplier' || !searchQuery) return [];
        const q = searchQuery.toLowerCase();
        return allSuppliers.filter(s => s.includes(q) && !selectedSuppliers.includes(s));
    }, [allSuppliers, searchQuery, searchType, selectedSuppliers]);

    const filteredProducts = products
        .filter(product => {
            let matchesSearch = true;
            if (searchQuery) {
                matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    (product.description || '').toLowerCase().includes(searchQuery.toLowerCase());
            }

            const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;

            let matchesTab = false;
            if (activeTab === 'retail') matchesTab = product.type === 'simple' && product.isForSale;
            else if (activeTab === 'recipe') matchesTab = product.type === 'processed';
            else if (activeTab === 'insumos') matchesTab = product.type === 'simple' && !product.isForSale;
            else if (activeTab === 'services') matchesTab = product.type === 'service';
            else if (activeTab === 'promotions') matchesTab = product.type === 'promotion';

            let matchesHealth = true;
            if (healthFilter !== 'all') {
                const healthInfo = getInventoryDaysLabel(product, resolveThresholds(product));
                if (!healthInfo) matchesHealth = false;
                else matchesHealth = healthInfo.status === healthFilter;
            }

            // Filtrado por proveedor seleccionado en SupplierPicker
            let matchesSupplier = true;
            if (selectedSupplierId) {
                const manualLinks = getProductsForSupplier(selectedSupplierId);
                matchesSupplier = isProductOfSupplier(
                    product.id,
                    selectedSupplierId,
                    product.defaultSupplierId || null,
                    supplierMap,
                    manualLinks
                );
            }

            return matchesSearch && matchesCategory && matchesTab && matchesHealth && matchesSupplier;
        })
        .sort((a, b) => {
            if (sortDiasInv === 'none') return 0;
            const daysA = getInventoryDaysValue(a);
            const daysB = getInventoryDaysValue(b);
            return sortDiasInv === 'asc' ? daysA - daysB : daysB - daysA;
        });

    // Retail, Recetas e Insumos comparten esqueleto de columnas (muestran Stock / Producible).
    const stockLayout = activeTab === 'retail' || activeTab === 'recipe' || activeTab === 'insumos';

    const getTypeBadgeClass = (type: ProductType) => {
        switch (type) {
            case ProductType.SIMPLE:
                return 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-100 dark:border-blue-800';
            case ProductType.PROCESSED:
                return 'bg-orange-50 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-orange-100 dark:border-orange-800';
            case ProductType.SERVICE:
                return 'bg-purple-50 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border-purple-100 dark:border-purple-800';
            case ProductType.PROMOTION:
                return 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-100 dark:border-amber-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const getTypeLabel = (type: ProductType) => {
        switch (type) {
            case ProductType.SIMPLE: return 'Retail';
            case ProductType.PROCESSED: return 'Receta';
            case ProductType.SERVICE: return 'Servicio';
            case ProductType.PROMOTION: return 'Promoción';
            default: return type;
        }
    }

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowCreateMenu(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleActionNavigate = (type: string) => {
        setShowCreateMenu(false);
        if (!isOnline) {
            showToast('Necesitas internet para crear productos', 'warning');
            return;
        }
        // Un Insumo es un producto simple no vendible (type='simple' + is_for_sale=false):
        // se crea en el formulario simple, que abre en modo Insumo al leer esta bandera.
        if (type === 'insumo') {
            sessionStorage.setItem('bistro_create_product_as_insumo', 'true');
            onNavigate(Screen.CREATE_PRODUCT_SIMPLE);
            return;
        }
        if (type === 'simple') {
            sessionStorage.removeItem('bistro_create_product_as_insumo');
            onNavigate(Screen.CREATE_PRODUCT_SIMPLE);
        } else if (type === 'processed') {
            if (!canUseRecipes) {
                setUpgradeModalInfo({
                    open: true,
                    title: 'Recetas y Descuento de Insumos',
                    desc: 'Elabora productos compuestos con ingredientes y deduce automáticamente el inventario de insumos en cada venta.'
                });
                return;
            }
            onNavigate(Screen.CREATE_PRODUCT_PROCESSED);
        } else if (type === 'service') {
            onNavigate(Screen.CREATE_PRODUCT_SERVICE);
        } else if (type === 'promotion') {
            if (!canUsePromotions) {
                setUpgradeModalInfo({
                    open: true,
                    title: 'Creación de Promociones y Combos',
                    desc: 'Diseña combos 2x1 y promociones automáticas que se aplican automáticamente en el cobro.'
                });
                return;
            }
            onNavigate(Screen.CREATE_PROMOTION);
        } else if (type === 'from_invoice') {
            onNavigate(Screen.CREATE_FROM_INVOICE);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        const isPromo = id.startsWith('promo_');
        const confirmed = await confirmAction({
            title: `¿Eliminar ${isPromo ? 'la promoción' : 'el producto'} "${name}"?`,
            message: 'Esta acción no se puede deshacer.',
            confirmText: 'Eliminar',
            variant: 'danger'
        });
        if (!confirmed) return;

        try {
            if (isPromo) {
                await deletePromotion(id.replace('promo_', ''));
            } else {
                await deleteCatalogProduct(id);
            }
        } catch (error) {
            console.error('Error deleting:', error);
            showToast('Error al eliminar. Puede que esté asociado a una venta.', 'error');
        }
    };

    const handleEditProductClick = async (productId: string) => {
        if (!onEditProduct) return;
        const fullProduct = await fetchFullProductForEdit(productId);
        if (fullProduct) {
            onEditProduct(fullProduct);
        } else {
            showToast('No se pudieron cargar los datos del producto para editar', 'error');
        }
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop - clientHeight < 150) {
            loadMore();
        }
    };

    const handleTogglePromo = async (id: string, currentlyActive: boolean) => {
        try {
            await togglePromotion(id.replace('promo_', ''), !currentlyActive);
            showToast(`Promoción ${!currentlyActive ? 'activada' : 'desactivada'}`);
        } catch (error) {
            console.error('Error toggling promotion:', error);
            showToast('Error al cambiar estado de la promoción', 'error');
        }
    };

    const handleAddSupplier = (name: string) => {
        setSelectedSuppliers(prev => [...prev, name]);
        setSearchQuery('');
        setShowSupplierDropdown(false);
        setTimeout(() => supplierInputRef.current?.focus(), 0);
    };

    const handleRemoveSupplier = (name: string) => {
        setSelectedSuppliers(prev => prev.filter(s => s !== name));
    };

    // Solo mostramos el ScreenLoader la primera vez que entra el usuario.
    // Cargas subsiguientes (búsqueda, filtros) mantienen el header e input montados con foco.
    const [firstLoadDone, setFirstLoadDone] = useState(false);
    useEffect(() => {
        if (!catalogLoading && !metadataLoading) {
            setFirstLoadDone(true);
        }
    }, [catalogLoading, metadataLoading]);

    const isMainLoading = metadataLoading || (
        activeTab === 'promotions'
            ? promosLoading
            : activeTab === 'retail'
                ? (catalogLoading || salesLoading)
                : catalogLoading
    );
    if (!firstLoadDone && isMainLoading) return <ScreenLoader />;

    if (!isOnline) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center h-full bg-background-light dark:bg-background-dark p-8 text-center gap-5">
                <div className="size-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>wifi_off</span>
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Sin conexión</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-xs">
                        El catálogo de productos requiere internet para cargar datos actualizados y mostrar el diagnóstico de stock.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-background-light dark:bg-background-dark overflow-hidden animate-fadeIn">
            {/* Header */}
            <header className="shrink-0 bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-800 px-3 md:px-6 py-2.5 md:py-0 md:h-14 flex flex-col md:flex-row items-stretch md:items-center justify-between z-40 gap-2.5 md:gap-4 overflow-visible">
                {/* Contenedor Superior Móvil -> Izquierda Desktop */}
                <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto flex-1">
                    {/* Search Bar */}
                    <div className="flex-1 w-full relative min-w-0 lg:max-w-lg">
                        <div className="relative flex items-center border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.05)] h-10 md:h-9 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10 transition-all duration-200">
                            <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className="h-full bg-gray-50 dark:bg-gray-800/50 text-[11px] md:text-xs font-bold text-gray-700 dark:text-gray-300 px-2 md:px-3 py-0 outline-none focus:outline-none focus:ring-0 border-y-0 border-l-0 border-r border-gray-200 dark:border-gray-700 focus:border-gray-200 dark:focus:border-gray-700 appearance-none pr-6 md:pr-8 cursor-pointer shrink-0 min-w-[80px] md:min-w-[120px]"
                                style={{ backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="%239ca3af" height="20" viewBox="0 0 24 24" width="20" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/></svg>')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 4px center', backgroundSize: '14px' }}
                            >
                                <option value="all">Categoría</option>
                                {uniqueCategories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                            <input
                                ref={supplierInputRef}
                                type="text"
                                placeholder="Buscar..."
                                className="flex-1 h-full pl-2 md:pl-3 pr-8 bg-transparent text-text-main dark:text-white text-sm outline-none focus:outline-none focus:ring-0 border-none focus:border-transparent min-w-[60px]"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {catalogLoading && debouncedSearchQuery ? (
                                <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-primary animate-spin text-[18px]">progress_activity</span>
                            ) : searchQuery ? (
                                <button
                                    onClick={() => { setSearchQuery(''); setDebouncedSearchQuery(''); }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center justify-center h-full"
                                >
                                    <span className="material-symbols-outlined text-[18px]">close</span>
                                </button>
                            ) : (
                                <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[18px] pointer-events-none">search</span>
                            )}
                        </div>
                    </div>

                    <div className="relative shrink-0" ref={menuRef}>
                        {canCreate && (
                        <button
                            onClick={() => isOnline ? setShowCreateMenu(!showCreateMenu) : showToast('Necesitas internet para crear productos', 'warning')}
                            title={!isOnline ? 'Requiere conexión a internet' : undefined}
                            className={`h-10 md:h-9 px-3 sm:px-3 md:px-4 bg-primary text-[#102218] rounded-xl text-sm font-bold transition-all shadow-sm flex items-center justify-center whitespace-nowrap gap-1 md:gap-1.5 ${isOnline ? 'hover:bg-primary-hover hover:shadow-md active:scale-[0.97]' : 'opacity-50 cursor-not-allowed'}`}
                        >
                            <span className="material-symbols-outlined text-[20px] md:text-[18px]">{isOnline ? 'add' : 'wifi_off'}</span>
                            <span className="hidden xs:inline">Crear</span>
                            <span className="xs:hidden font-bold">Crear</span>
                        </button>
                        )}

                        {showCreateMenu && (
                            <div className="absolute top-12 right-0 w-60 max-h-[80vh] overflow-y-auto bg-white dark:bg-surface-dark rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 py-2 z-[60] animate-[fadeIn_0.1s_ease-out] origin-top-right">
                                <div className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                    Selecciona tipo
                                </div>
                                <button onClick={() => handleActionNavigate('simple')} className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3 transition-colors">
                                    <div className="size-8 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-lg">inventory_2</span>
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="font-bold block truncate">Crear Producto</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">Lo compras y lo vendes</span>
                                    </div>
                                </button>

                                <button onClick={() => handleActionNavigate('insumo')} className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3 transition-colors">
                                    <div className="size-8 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-lg">grocery</span>
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="font-bold block truncate">Crear Ingrediente</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">Se consume en una receta</span>
                                    </div>
                                </button>

                                <button onClick={() => handleActionNavigate('processed')} className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3 transition-colors">
                                    <div className="size-8 rounded-full bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-lg">skillet</span>
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="font-bold flex items-center gap-1.5 truncate">
                                            <span>Crear Receta</span>
                                            {!canUseRecipes && <span className="px-1.5 py-0.2 text-[9px] font-black bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 rounded border border-amber-300/60">PRO</span>}
                                        </span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">Lleva ingredientes</span>
                                    </div>
                                </button>

                                <button onClick={() => handleActionNavigate('service')} className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3 transition-colors">
                                    <div className="size-8 rounded-full bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-lg">build</span>
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="font-bold block truncate">Crear Servicio</span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">Intangible / Mano de obra</span>
                                    </div>
                                </button>
                                <div className="mx-4 border-t border-gray-100 dark:border-gray-700"></div>
                                <button onClick={() => handleActionNavigate('promotion')} className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3 transition-colors">
                                    <div className="size-8 rounded-full bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-lg">loyalty</span>
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="font-bold flex items-center gap-1.5 truncate">
                                            <span>Crear Promoción</span>
                                            {!canUsePromotions && <span className="px-1.5 py-0.2 text-[9px] font-black bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 rounded border border-amber-300/60">PRO</span>}
                                        </span>
                                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">Combinar 2+ productos</span>
                                    </div>
                                </button>
                                {/* Importar Excel — oculto temporalmente, pendiente de pulir */}
                                {/* {profile?.role === 'Administrador' && (
                                    <>
                                        <div className="mx-4 border-t border-gray-100 dark:border-gray-700"></div>
                                        <button onClick={() => { setShowCreateMenu(false); onNavigate(Screen.BULK_UPLOAD); }} className="w-full text-left px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-3 transition-colors">
                                            <div className="size-8 rounded-full bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center">
                                                <span className="material-symbols-outlined text-lg">upload_file</span>
                                            </div>
                                            <div>
                                                <span className="font-bold block">Importar Excel</span>
                                                <span className="text-xs text-gray-400">Carga masiva de productos</span>
                                            </div>
                                        </button>
                                    </>
                                )} */}

                                {/* Aclaración de frontera: lo que no se vende ni se consume en una
                                    receta no pertenece al catálogo, va como Gasto. Evita que se
                                    creen ingredientes para cosas como bolsas de basura o aseo. */}
                                <div className="mx-4 border-t border-gray-100 dark:border-gray-700"></div>
                                <div className="px-4 py-3 flex items-start gap-2.5">
                                    <span className="material-symbols-outlined text-[16px] text-gray-400 shrink-0 mt-0.5" aria-hidden>info</span>
                                    <p className="text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                                        ¿Compras algo que no vendes ni va en una receta? (bolsas, aseo)
                                        Eso es un <span className="font-bold">Gasto</span>, no un producto.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Pestañas unificadas (nivel único): cada tab = un tipo */}
                {(() => {
                    const tabs: Array<{ key: typeof activeTab; label: string; icon: string; show: boolean; isPro?: boolean }> = [
                        { key: 'retail', label: 'Retail', icon: 'inventory_2', show: hasRetail },
                        { key: 'recipe', label: 'Recetas', icon: 'skillet', show: hasRecipes, isPro: !canUseRecipes },
                        { key: 'insumos', label: 'Ingredientes', icon: 'grocery', show: hasInsumos },
                        { key: 'services', label: 'Servicios', icon: 'build', show: hasServices },
                        { key: 'promotions', label: 'Promociones', icon: 'loyalty', show: hasPromotions, isPro: !canUsePromotions },
                    ];
                    const visible = tabs.filter(t => t.show);
                    if (visible.length < 2) return null;
                    return (
                        <div className="flex bg-white dark:bg-surface-dark p-1 rounded-xl gap-1 w-full md:w-max shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100 dark:border-gray-800 overflow-x-auto custom-scrollbar md:h-[40px]">
                            {visible.map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => {
                                        if (tab.key === 'recipe' && !canUseRecipes) {
                                            setUpgradeModalInfo({
                                                open: true,
                                                title: 'Recetas y Descuento de Insumos',
                                                desc: 'Elabora productos compuestos con ingredientes y deduce automáticamente el inventario de insumos en cada venta.'
                                            });
                                            return;
                                        }
                                        if (tab.key === 'promotions' && !canUsePromotions) {
                                            setUpgradeModalInfo({
                                                open: true,
                                                title: 'Creación de Promociones y Combos',
                                                desc: 'Diseña combos 2x1 y promociones automáticas que se aplican automáticamente en el cobro.'
                                            });
                                            return;
                                        }
                                        setActiveTab(tab.key);
                                    }}
                                    className={`flex-1 md:flex-none flex items-center justify-center md:justify-start gap-1 sm:gap-2 px-2 sm:px-3 py-2 sm:py-1.5 md:py-1 font-bold text-[12px] sm:text-[13px] whitespace-nowrap transition-all duration-200 rounded-lg ${activeTab === tab.key ? 'bg-primary/25 text-[#102218] dark:text-primary shadow-sm ring-1 ring-primary/40' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                                >
                                    <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
                                    <span className="inline">{tab.label}</span>
                                    {tab.isPro && (
                                        <span className="px-1.5 py-0.5 text-[9px] font-black bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 rounded border border-amber-300/60">
                                            PRO
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    );
                })()}
            </header>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-black/20">
                <div className="flex-1 flex flex-col w-full mx-auto p-2 md:p-4 gap-3 overflow-hidden">

                    {/* Controls Header */}
                    <div className="flex-none bg-white dark:bg-surface-dark p-2.5 md:p-3 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col gap-3">
                        {/* Filters — todos en una fila en tablet, grid 2-col en móvil */}
                        <div className="grid grid-cols-2 min-[430px]:flex min-[430px]:flex-wrap gap-2 items-center">
                            {/* Proveedor */}
                            {(activeTab === 'retail' || activeTab === 'insumos') && suppliersWithProducts.length > 0 && (
                                <div className="relative z-20">
                                    <SupplierPicker
                                        suppliers={suppliersWithProducts}
                                        selectedSupplierId={selectedSupplierId}
                                        onSelect={setSelectedSupplierId}
                                        loading={suppliersListLoading}
                                    />
                                </div>
                            )}

                            {/* Rotación */}
                            {activeTab !== 'recipe' && (
                                <button
                                    onClick={() => {
                                        if (selectedSupplierId) {
                                            const sup = allSuppliersList.find(s => s.id === selectedSupplierId);
                                            setConfigModalSupplier(sup || null);
                                        }
                                    }}
                                    disabled={!selectedSupplierId}
                                    className={`h-9 rounded-lg flex items-center justify-center transition-all shrink-0 border shadow-sm px-2.5 min-[430px]:px-3 gap-1.5 ${
                                        selectedSupplierId
                                            ? 'bg-gray-50 hover:bg-gray-100 border-gray-300 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:border-gray-600 dark:text-gray-300 active:scale-95'
                                            : 'bg-gray-50 dark:bg-gray-800 text-gray-300 dark:text-gray-600 border-gray-150 dark:border-gray-700 cursor-not-allowed'
                                    }`}
                                    title="Configurar Rotación"
                                >
                                    <span className="material-symbols-outlined text-[18px]">settings</span>
                                    <span className="text-xs font-semibold">Rotación</span>
                                </button>
                            )}

                            {/* Salud de Stock — no aplica a recetas ni insumos */}
                            {activeTab !== 'insumos' && activeTab !== 'recipe' && (
                                <div className="relative">
                                    <select
                                        className="w-full h-9 pl-3 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-text-main dark:text-white text-xs font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer shadow-sm outline-none truncate appearance-none"
                                        value={healthFilter}
                                        onChange={(e) => setHealthFilter(e.target.value as typeof healthFilter)}
                                    >
                                        <option value="all">Salud de Stock</option>
                                        <option value="critico">🔴 Crítico</option>
                                        <option value="reordenar">🟠 Re-ordenar</option>
                                        <option value="optimo">🟢 Óptimo</option>
                                        <option value="lento">🟡 Lento</option>
                                        <option value="estancado">🟣 Estancado</option>
                                    </select>
                                    <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none text-base leading-none">
                                        expand_more
                                    </span>
                                </div>
                            )}

                            {/* Sin ordenar */}
                            {activeTab !== 'insumos' && (
                                <div className="relative">
                                    <select
                                        className="w-full h-9 pl-3 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-text-main dark:text-white text-xs font-bold focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer shadow-sm outline-none truncate appearance-none"
                                        value={sortDiasInv}
                                        onChange={(e) => setSortDiasInv(e.target.value as 'none' | 'asc' | 'desc')}
                                    >
                                        <option value="none">Sin ordenar</option>
                                        <option value="asc">Stock ↓ Menor Duración</option>
                                        <option value="desc">Stock ↑ Mayor Duración</option>
                                    </select>
                                    <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none text-base leading-none">
                                        expand_more
                                    </span>
                                </div>
                            )}
                        </div>

                    </div>

                    {/* Desktop Table View */}
                    <div className="hidden lg:flex flex-col flex-1 bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden min-h-0">
                        {/* Table Header (No Scroll) */}
                        <div className="flex-none pr-3 sm:pr-[12px] bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-800">
                            <table className="w-full text-left border-collapse table-fixed min-w-[900px]">
                                <thead>
                                    <tr className="text-xs uppercase text-gray-500 dark:text-gray-400 font-bold tracking-wider">
                                        <th className={`${stockLayout ? 'w-[24%]' : 'w-[34%]'} px-4 py-3 whitespace-nowrap`}>Ítem de Venta</th>
                                        {stockLayout && <th className="w-[10%] px-2 py-3 text-left whitespace-nowrap">{activeTab === 'recipe' ? 'Producible' : 'Stock'}</th>}
                                        {showHealthColumn && (
                                            <th className="w-[17%] px-4 py-3 group relative cursor-help whitespace-nowrap text-left">
                                                <div className="flex items-center gap-1">
                                                    Salud del Stock
                                                    <span className="material-symbols-outlined text-[14px] text-gray-400">help</span>
                                                </div>
                                                <div className="absolute left-0 top-full mt-2 w-56 p-3 bg-gray-800 text-white text-[11px] leading-relaxed rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 normal-case font-normal text-center whitespace-normal pointer-events-none">
                                                    Diagnóstico inteligente del inventario basado en la velocidad de ventas de los últimos 28 días.
                                                    <div className="absolute bottom-full left-6 border-4 border-transparent border-b-gray-800"></div>
                                                </div>
                                            </th>
                                        )}
                                        {activeTab !== 'insumos' && <th className={`${stockLayout ? 'w-[10%]' : 'w-[12%]'} px-4 py-3 text-left whitespace-nowrap`}>Precio</th>}
                                        <th className={`${stockLayout ? 'w-[10%]' : 'w-[12%]'} px-4 py-3 text-left hidden xl:table-cell whitespace-nowrap`}>Costo Unit.</th>
                                        {activeTab !== 'insumos' && <th className={`${stockLayout ? 'w-[10%]' : 'w-[12%]'} px-4 py-3 text-left pl-6 whitespace-nowrap`}>Margen</th>}
                                        {activeTab !== 'insumos' && <th className={`${stockLayout ? 'w-[7%]' : 'w-[8%]'} px-2 py-3 text-left whitespace-nowrap`}></th>}
                                        <th className={`${stockLayout ? 'w-[12%]' : 'w-[22%]'} px-4 py-3 text-right whitespace-nowrap`}>Acciones</th>
                                    </tr>
                                </thead>
                            </table>
                        </div>

                        {/* Table Body (Scrollable Area) */}
                        <div ref={desktopScrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto custom-scrollbar min-h-0">
                            <table className="w-full text-left border-collapse table-fixed min-w-[900px]">
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                                    <tr className="h-0 border-0 p-0 m-0 hidden lg:table-row">
                                        <td className={`${stockLayout ? 'w-[24%]' : 'w-[34%]'} p-0 m-0 border-0 h-0`}></td>
                                        {stockLayout && <td className="w-[10%] p-0 m-0 border-0 h-0"></td>}
                                        {showHealthColumn && <td className="w-[17%] p-0 m-0 border-0 h-0"></td>}
                                        {activeTab !== 'insumos' && <td className={`${stockLayout ? 'w-[10%]' : 'w-[12%]'} p-0 m-0 border-0 h-0`}></td>}
                                        <td className={`${stockLayout ? 'w-[10%]' : 'w-[12%]'} p-0 m-0 border-0 h-0 hidden xl:table-cell`}></td>
                                        {activeTab !== 'insumos' && <td className={`${stockLayout ? 'w-[10%]' : 'w-[12%]'} p-0 m-0 border-0 h-0`}></td>}
                                        {activeTab !== 'insumos' && <td className={`${stockLayout ? 'w-[7%]' : 'w-[8%]'} p-0 m-0 border-0 h-0`}></td>}
                                        <td className={`${stockLayout ? 'w-[12%]' : 'w-[22%]'} p-0 m-0 border-0 h-0`}></td>
                                    </tr>
                                    {filteredProducts.length > 0 ? (
                                        <>
                                        {filteredProducts.map((product) => {
                                            const effectiveCost = avgCostMap[product.id] ?? product.cost ?? 0;
                                            const grossMargin = (product.price ?? 0) - effectiveCost;
                                            const marginPercent = (product.price ?? 0) > 0 ? (grossMargin / (product.price ?? 1)) * 100 : 0;

                                            return (
                                                <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors group">
                                                    <td className="px-4 py-1">
                                                        <div className="flex items-center gap-3">
                                                            <div className="size-14 rounded-lg bg-gray-50 dark:bg-gray-700/50 flex items-center justify-center text-gray-400 shrink-0 border border-gray-100 dark:border-gray-700 overflow-hidden">
                                                                {product.image ? (
                                                                    <img
                                                                        src={product.image}
                                                                        alt=""
                                                                        crossOrigin="anonymous"
                                                                        className="w-full h-full object-cover"
                                                                    />
                                                                ) : (
                                                                    <span className="material-symbols-outlined text-2xl">image</span>
                                                                )}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="font-bold text-gray-900 dark:text-white text-sm line-clamp-3 text-balance break-normal w-full">{product.name}</p>
                                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                                    {product.category && (
                                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700 truncate max-w-[120px]" title={product.category}>
                                                                            {product.category}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {stockLayout && (
                                                        <td className="px-4 py-3 text-left">
                                                            {product.type === 'processed' ? (
                                                                product.producible == null ? (
                                                                    <span className="text-gray-400 text-xs" title="Costo manual">—</span>
                                                                ) : (
                                                                    <div className="flex flex-col items-start">
                                                                        <span className={`font-bold text-sm ${product.producible === 0 ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-white'}`}>{product.producible}</span>
                                                                        <span className="text-2xs text-gray-400 font-medium">uds</span>
                                                                    </div>
                                                                )
                                                            ) : (product.type === 'service' || product.type === 'promotion') ? (
                                                                <span className="text-gray-400 text-xs">-</span>
                                                            ) : (
                                                                <div className="flex flex-col items-start">
                                                                    {product.stock === 0 ? (
                                                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 uppercase tracking-wide">
                                                                            Agotado
                                                                        </span>
                                                                    ) : product.stock != null && product.stock < 0 ? (
                                                                        <>
                                                                            <span className="font-bold text-sm text-rose-600 dark:text-rose-400">{product.stock}</span>
                                                                            <span className="text-2xs text-gray-400 font-medium">{product.unit || 'und'}</span>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <span className={`font-bold text-sm ${(product.stock || 0) < 10 ? 'text-status-warning dark:text-status-warning' : 'text-gray-900 dark:text-white'}`}>
                                                                                {product.stock}
                                                                            </span>
                                                                            <span className="text-2xs text-gray-400 font-medium">{product.unit || 'und'}</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                    )}

                                                    {showHealthColumn && (
                                                        <td className="px-4 py-3">
                                                            {(() => {
                                                                const health = getInventoryDaysLabel(product, resolveThresholds(product));
                                                                if (!health) return <span className="text-gray-400 text-xs">-</span>;
                                                                const supplierCount = getActiveSupplierCount(product.id);
                                                                return (
                                                                    <div className="flex flex-col items-start min-w-[110px] group/badge relative cursor-help">
                                                                        <div className={`px-1.5 py-0.5 rounded-md text-[10px] sm:text-xs font-bold border flex items-center gap-1 mb-0.5 whitespace-nowrap shadow-[0_1px_2px_rgba(0,0,0,0.05)] ${health.style}`}>
                                                                            <span className="material-symbols-outlined text-[12px] sm:text-[14px]">{health.icon}</span>
                                                                            {health.badge}
                                                                        </div>
                                                                        {health.velocityText !== '-' && (
                                                                            <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium ml-0.5">
                                                                                Vel: {health.velocityText}
                                                                            </span>
                                                                        )}
                                                                        {health.suggestedQty != null && (
                                                                            <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold ml-0.5">
                                                                                Pedir: {health.suggestedQty} {getPluralUnit(product.unit || 'und')}
                                                                            </span>
                                                                        )}
                                                                        {supplierCount > 1 && !selectedSupplierId && (
                                                                            <span className="text-[9px] text-violet-600 dark:text-violet-400 font-medium ml-0.5">
                                                                                {supplierCount} proveedores
                                                                            </span>
                                                                        )}
                                                                        {/* Tooltip superpuesto para hover de la celda específica */}
                                                                        <div className="absolute left-0 top-full mt-1 w-48 p-2 bg-gray-800/95 dark:bg-gray-100/95 backdrop-blur-sm text-white dark:text-gray-900 border border-gray-700 dark:border-gray-200 text-[10px] rounded-lg shadow-xl opacity-0 invisible group-hover/badge:opacity-100 group-hover/badge:visible transition-all z-[60] normal-case font-medium leading-relaxed pointer-events-none">
                                                                            {health.tooltip}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </td>
                                                    )}
                                                    {activeTab !== 'insumos' && (
                                                        <td className="px-4 py-3 text-left">
                                                            <span className="text-sm font-bold text-gray-900 dark:text-white">
                                                                ${formatCurrency(product.price ?? 0)}
                                                            </span>
                                                        </td>
                                                    )}
                                                    <td className="px-4 py-3 text-left hidden xl:table-cell">
                                                        <div className="flex flex-col items-start gap-0.5">
                                                            <span className="text-sm font-bold text-gray-900 dark:text-white">
                                                                ${formatCurrency(avgCostMap[product.id] ?? product.cost ?? 0)}
                                                            </span>
                                                            {avgCostMap[product.id] != null ? (
                                                                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1 py-0.5 rounded leading-none">Prom.</span>
                                                            ) : (
                                                                <span className="text-[9px] font-bold text-gray-400 bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded leading-none">Manual</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    {activeTab !== 'insumos' && (
                                                        <td className="px-4 py-3 text-left pl-6">
                                                            <div className="flex items-center justify-start gap-1.5">
                                                                <span className={`text-sm font-bold ${
                                                                    grossMargin > 0
                                                                        ? 'text-status-success dark:text-status-success'
                                                                        : grossMargin < 0
                                                                        ? 'text-status-error dark:text-status-error'
                                                                        : 'text-gray-500'
                                                                }`}>
                                                                    {grossMargin < 0 ? `-$${formatCurrency(Math.abs(grossMargin))}` : `$${formatCurrency(grossMargin)}`}
                                                                </span>
                                                            </div>
                                                        </td>
                                                    )}
                                                    {activeTab !== 'insumos' && (
                                                        <td className="px-2 py-3 text-left">
                                                            <div className="flex items-center justify-start">
                                                                <span className={`text-sm font-bold ${
                                                                    marginPercent >= 50
                                                                        ? 'text-status-success dark:text-status-success'
                                                                        : marginPercent >= 30
                                                                        ? 'text-status-warning dark:text-status-warning'
                                                                        : 'text-status-error dark:text-status-error'
                                                                }`}>
                                                                    {marginPercent.toFixed(0)}%
                                                                </span>
                                                            </div>
                                                        </td>
                                                    )}
                                                    <td className="px-4 py-3 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            {canCreate && (<>
                                                            {product.type === ProductType.PROMOTION ? (
                                                                <>
                                                                    <button
                                                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm border ${product.status === 'active'
                                                                            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-100'
                                                                            : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-100'
                                                                            }`}
                                                                        onClick={() => handleTogglePromo(product.id, product.status === 'active')}
                                                                    >
                                                                        {product.status === 'active' ? 'Activa' : 'Inactiva'}
                                                                    </button>
                                                                    <button
                                                                        className="px-3 py-1.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold text-text-main dark:text-white transition-colors shadow-sm"
                                                                        onClick={() => {
                                                                            const promo = promotions.find(p => p.id === product.id.replace('promo_', ''));
                                                                            if (promo && onEditPromotion) onEditPromotion(promo);
                                                                        }}
                                                                    >
                                                                        Editar
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <button
                                                                    className="px-3 py-1.5 min-w-[58px] bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold text-text-main dark:text-white transition-colors shadow-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-70 disabled:cursor-not-allowed"
                                                                    disabled={loadingEditId === product.id}
                                                                    onClick={() => handleEditProductClick(product.id)}
                                                                    aria-label="Editar producto"
                                                                >
                                                                    {loadingEditId === product.id ? (
                                                                        <span className="material-symbols-outlined text-[16px] animate-spin text-primary">progress_activity</span>
                                                                    ) : (
                                                                        'Editar'
                                                                    )}
                                                                </button>
                                                            )}
                                                            <button
                                                                className="size-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                                title="Eliminar"
                                                                onClick={() => handleDelete(product.id, product.name)}
                                                            >
                                                                <span className="material-symbols-outlined text-lg">delete</span>
                                                            </button>
                                                            </>)}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {loadingMore && (
                                            <tr>
                                                <td colSpan={8} className="py-4 text-center">
                                                    <div className="flex items-center justify-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                                                        <span className="material-symbols-outlined text-base animate-spin text-primary">progress_activity</span>
                                                        <span>Cargando más productos...</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                        </>
                                    ) : catalogLoading ? (
                                        <tr>
                                            <td colSpan={8} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                                                <div className="flex flex-col items-center justify-center gap-2">
                                                    <span className="material-symbols-outlined text-2xl animate-spin text-primary">progress_activity</span>
                                                    <p className="text-xs font-medium">Buscando productos...</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        <tr>
                                            <td colSpan={8} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                                                <div className="flex flex-col items-center gap-2">
                                                    <span className="material-symbols-outlined text-4xl opacity-50">search_off</span>
                                                    <p>No se encontraron productos.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Mobile/Tablet Compact Card View */}
                    <div ref={mobileScrollRef} onScroll={handleScroll} className="lg:hidden flex-1 overflow-y-auto min-h-0 -mx-4 px-4 pt-1 pb-28 custom-scrollbar relative">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {filteredProducts.length > 0 ? (
                                filteredProducts.map((product) => {
                                    const effectiveCost = avgCostMap[product.id] ?? product.cost ?? 0;
                                    const grossMargin = (product.price ?? 0) - effectiveCost;
                                    const marginPercent = (product.price ?? 0) > 0 ? (grossMargin / (product.price ?? 1)) * 100 : 0;
                                    const isExpanded = !!expandedProducts[product.id];
                                    return (
                                        <div key={product.id} className="bg-white dark:bg-surface-dark p-3 rounded-xl shadow-[0_2px_4px_rgba(0,0,0,0.02)] border border-gray-100 dark:border-gray-800 relative transition-transform h-full flex flex-col justify-between">

                                            {product.type === ProductType.PROMOTION ? (
                                                /* ─── PROMOTION CARD ─── */
                                                <>
                                                    <div
                                                        className="flex items-center justify-between gap-3 cursor-pointer select-none"
                                                        onClick={() => handleToggleExpand(product.id)}
                                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggleExpand(product.id); } }}
                                                        tabIndex={0}
                                                        role="button"
                                                        aria-expanded={isExpanded}
                                                        aria-label={`${isExpanded ? 'Contraer' : 'Expandir'} detalles de ${product.name}`}
                                                    >
                                                        <div className="flex items-start gap-3 flex-1 min-w-0">
                                                            <div className="relative size-10 rounded-lg bg-gray-50 dark:bg-gray-700/50 flex items-center justify-center text-gray-400 shrink-0 border border-gray-100 dark:border-gray-700">
                                                                {product.image ? (
                                                                    <img
                                                                        src={product.image}
                                                                        alt=""
                                                                        className="w-full h-full object-cover rounded-lg"
                                                                        crossOrigin="anonymous"
                                                                    />
                                                                ) : (
                                                                    <span className="material-symbols-outlined text-lg">loyalty</span>
                                                                )}
                                                                <div className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-white dark:border-surface-dark ${product.status === 'active' ? 'bg-status-success' : 'bg-gray-300'}`}></div>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <h3 className="font-semibold text-gray-900 dark:text-white text-sm leading-snug break-words">
                                                                    {product.name}
                                                                </h3>
                                                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide border ${getTypeBadgeClass(product.type)}`}>
                                                                        {getTypeLabel(product.type)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="shrink-0 flex items-center justify-center size-8 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500">
                                                            <span className={`material-symbols-outlined text-xl transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                                                expand_more
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {isExpanded && (
                                                        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50 animate-fadeIn">
                                                            {product.description && (
                                                                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug mb-3">
                                                                    <span className="font-semibold text-gray-600 dark:text-gray-300">Incluye: </span>{product.description}
                                                                </p>
                                                            )}

                                                            <div className="flex items-center justify-between mb-3">
                                                                <div>
                                                                    <span className="text-[8px] text-gray-400 font-bold uppercase tracking-wider">Precio</span>
                                                                    <p className="text-[13px] font-black text-gray-900 dark:text-white tracking-tight leading-none mt-0.5">${formatCurrency(product.price ?? 0)}</p>
                                                                </div>
                                                                <div className="text-right">
                                                                    <span className="text-[8px] text-gray-400 font-bold uppercase tracking-wider">Margen</span>
                                                                    <p className={`text-[12px] font-bold mt-0.5 leading-none ${
                                                                        grossMargin > 0
                                                                            ? 'text-status-success'
                                                                            : grossMargin < 0
                                                                            ? 'text-status-error'
                                                                            : 'text-gray-500'
                                                                    }`}>
                                                                        {grossMargin < 0 ? `-$${formatCurrency(Math.abs(grossMargin))}` : `$${formatCurrency(grossMargin)}`}{' '}
                                                                        <span className={`text-[9px] font-medium ${
                                                                            marginPercent >= 50
                                                                                ? 'text-status-success'
                                                                                : marginPercent >= 30
                                                                                ? 'text-status-warning'
                                                                                : 'text-status-error'
                                                                        }`}>
                                                                            | {marginPercent.toFixed(0)}%
                                                                        </span>
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-1.5">
                                                                {canCreate && (<>
                                                                <button
                                                                    className={`flex-1 h-8 rounded-lg text-xs font-bold transition-colors border ${product.status === 'active'
                                                                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
                                                                        : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700'
                                                                        }`}
                                                                    onClick={(e) => { e.stopPropagation(); handleTogglePromo(product.id, product.status === 'active'); }}
                                                                >
                                                                    {product.status === 'active' ? '● Activa' : '○ Inactiva'}
                                                                </button>
                                                                <button
                                                                    className="flex-1 h-8 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-bold text-text-main dark:text-white transition-colors shadow-sm"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const promo = promotions.find(p => p.id === product.id.replace('promo_', ''));
                                                                        if (promo && onEditPromotion) onEditPromotion(promo);
                                                                    }}
                                                                >
                                                                    Editar
                                                                </button>
                                                                <button
                                                                    className="size-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 shadow-sm"
                                                                    onClick={(e) => { e.stopPropagation(); handleDelete(product.id, product.name); }}
                                                                >
                                                                    <span className="material-symbols-outlined text-[16px]">delete</span>
                                                                </button>
                                                                </>)}
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            ) : (
                                                /* ─── PRODUCT CARD ─── */
                                                <>
                                                    <div
                                                        className="flex items-center justify-between gap-3 cursor-pointer select-none"
                                                        onClick={() => handleToggleExpand(product.id)}
                                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggleExpand(product.id); } }}
                                                        tabIndex={0}
                                                        role="button"
                                                        aria-expanded={isExpanded}
                                                        aria-label={`${isExpanded ? 'Contraer' : 'Expandir'} detalles de ${product.name}`}
                                                    >
                                                        <div className="flex items-start gap-3 flex-1 min-w-0">
                                                            <div className="relative size-10 rounded-lg bg-gray-50 dark:bg-gray-700/50 flex items-center justify-center text-gray-400 shrink-0 border border-gray-100 dark:border-gray-700">
                                                                {product.image ? (
                                                                    <img
                                                                        src={product.image}
                                                                        alt=""
                                                                        className="w-full h-full object-cover rounded-lg"
                                                                        crossOrigin="anonymous"
                                                                    />
                                                                ) : (
                                                                    <span className="material-symbols-outlined text-lg">image</span>
                                                                )}
                                                                <div className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-white dark:border-surface-dark ${product.status === 'active' ? 'bg-status-success' : 'bg-gray-300'}`}></div>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <h3 className="font-semibold text-gray-900 dark:text-white text-sm leading-snug break-words">
                                                                    {product.name}
                                                                </h3>
                                                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                                    {product.category && (
                                                                        <span className="hidden min-[430px]:inline-block px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide border bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700">
                                                                            {product.category}
                                                                        </span>
                                                                    )}
                                                                    {(() => {
                                                                        if (activeTab === 'insumos') return null;
                                                                        const health = getInventoryDaysLabel(product, resolveThresholds(product));
                                                                        if (!health) return null;
                                                                        const supplierCount = getActiveSupplierCount(product.id);
                                                                        const showPedir = health.suggestedQty != null && ['reordenar', 'critico', 'agotado'].includes(health.status);
                                                                        return (
                                                                            <>
                                                                                <div className="relative flex items-center gap-1">
                                                                                    <div
                                                                                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold border flex items-center gap-0.5 w-fit shadow-sm cursor-pointer ${health.style}`}
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            setOpenTooltipId(prev => prev === product.id ? null : product.id);
                                                                                        }}
                                                                                    >
                                                                                        <span className="material-symbols-outlined text-[10px] shrink-0">{health.icon}</span>
                                                                                        <span className="whitespace-nowrap">{health.badge}</span>
                                                                                        <span className={`material-symbols-outlined text-[9px] ml-0.5 shrink-0 transition-colors ${openTooltipId === product.id ? 'opacity-100' : 'opacity-60'}`}>info</span>
                                                                                    </div>
                                                                                    {supplierCount > 1 && !selectedSupplierId && (
                                                                                        <span className="text-[8px] text-violet-600 dark:text-violet-400 font-medium whitespace-nowrap">
                                                                                            {supplierCount} prov.
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                {showPedir && (
                                                                                    <div className="px-1.5 py-0.5 rounded text-[9px] font-bold border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800 flex items-center shadow-sm">
                                                                                        <span>Pedir: {health.suggestedQty} {getShortPluralUnit(product.unit || 'und')}</span>
                                                                                    </div>
                                                                                )}
                                                                            </>
                                                                        );
                                                                    })()}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="shrink-0 flex items-center justify-center size-8 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500">
                                                            <span className={`material-symbols-outlined text-xl transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                                                                expand_more
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {isExpanded && (
                                                        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700/50 animate-fadeIn flex flex-col gap-3.5">
                                                            {/* Grid de Estadísticas Simétrico */}
                                                            <div className="grid grid-cols-3 gap-2 w-full items-end pt-1">
                                                                {/* Stock / Producible */}
                                                                <div className="flex flex-col min-w-0">
                                                                    <span className="text-[8px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest mb-1.5">{product.type === 'processed' ? 'Producible' : 'Stock'}</span>
                                                                    {product.type === 'processed' ? (
                                                                        product.producible == null ? (
                                                                            <span className="text-gray-400 text-xs font-semibold" title="Costo manual">—</span>
                                                                        ) : (
                                                                            <div className="flex items-baseline gap-0.5">
                                                                                <span className={`text-[13px] font-black tracking-tight leading-none ${product.producible === 0 ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-white'}`}>{product.producible}</span>
                                                                                <span className="text-[9px] text-gray-500 dark:text-gray-400 font-medium">uds</span>
                                                                            </div>
                                                                        )
                                                                    ) : product.type === 'service' ? (
                                                                        <span className="text-gray-400 text-xs font-semibold">-</span>
                                                                    ) : (
                                                                        product.stock === 0 ? (
                                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 uppercase tracking-wide w-fit">
                                                                                Agotado
                                                                            </span>
                                                                        ) : product.stock != null && product.stock < 0 ? (
                                                                            <div className="flex items-baseline gap-0.5">
                                                                                <span className="text-[13px] font-black tracking-tight leading-none text-rose-600 dark:text-rose-400">
                                                                                    {product.stock}
                                                                                </span>
                                                                                <span className="text-[9px] text-gray-500 dark:text-gray-400 font-medium">
                                                                                    {(() => {
                                                                                        const lu = (product.unit || 'und').toLowerCase();
                                                                                        if (lu === 'unidad' || lu === 'unidades') return 'und';
                                                                                        if (lu === 'libra' || lu === 'libras') return 'lb';
                                                                                        if (lu === 'kilogramo' || lu === 'kilogramos' || lu === 'kilo' || lu === 'kilos') return 'kg';
                                                                                        if (lu === 'metro' || lu === 'metros') return 'm';
                                                                                        return lu.substring(0, 4);
                                                                                    })()}
                                                                                </span>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="flex items-baseline gap-0.5">
                                                                                <span className={`text-[13px] font-black tracking-tight leading-none ${(product.stock || 0) < 10 ? 'text-status-warning dark:text-status-warning' : 'text-gray-900 dark:text-white'}`}>
                                                                                    {product.stock}
                                                                                </span>
                                                                                <span className="text-[9px] text-gray-500 dark:text-gray-400 font-medium">
                                                                                    {(() => {
                                                                                        const lu = (product.unit || 'und').toLowerCase();
                                                                                        if (lu === 'unidad' || lu === 'unidades') return 'und';
                                                                                        if (lu === 'libra' || lu === 'libras') return 'lb';
                                                                                        if (lu === 'kilogramo' || lu === 'kilogramos' || lu === 'kilo' || lu === 'kilos') return 'kg';
                                                                                        if (lu === 'metro' || lu === 'metros') return 'm';
                                                                                        return lu.substring(0, 4);
                                                                                    })()}
                                                                                </span>
                                                                            </div>
                                                                        )
                                                                    )}
                                                                </div>

                                                                {/* Precio / Costo */}
                                                                <div className="flex flex-col items-center min-w-0">
                                                                    <span className="text-[8px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest mb-1.5">{activeTab === 'insumos' ? 'Costo' : 'Precio'}</span>
                                                                    <span className="text-[13px] font-black text-gray-900 dark:text-white leading-none tracking-tight">
                                                                        ${formatCurrency(activeTab === 'insumos' ? (product.cost ?? 0) : (product.price ?? 0))}
                                                                    </span>
                                                                </div>

                                                                {/* Margen */}
                                                                <div className="flex flex-col items-end min-w-0 text-right">
                                                                    <span className="text-[8px] text-gray-400 dark:text-gray-500 font-bold uppercase tracking-widest mb-1.5">Margen</span>
                                                                    {activeTab === 'insumos' ? (
                                                                        <span className="text-gray-400 text-xs font-semibold">—</span>
                                                                    ) : (
                                                                        <div className="flex items-center justify-end gap-0.5">
                                                                            <span className={`text-[12px] font-bold leading-none ${
                                                                                grossMargin > 0
                                                                                    ? 'text-status-success dark:text-status-success'
                                                                                    : grossMargin < 0
                                                                                    ? 'text-status-error dark:text-status-error'
                                                                                    : 'text-gray-500'
                                                                            }`}>
                                                                                {grossMargin < 0 ? `-$${formatCurrency(Math.abs(grossMargin))}` : `$${formatCurrency(grossMargin)}`}
                                                                            </span>
                                                                            <span className={`text-[9px] font-medium ${
                                                                                marginPercent >= 50
                                                                                    ? 'text-status-success dark:text-status-success'
                                                                                    : marginPercent >= 30
                                                                                    ? 'text-status-warning dark:text-status-warning'
                                                                                    : 'text-status-error dark:text-status-error'
                                                                            }`}>
                                                                                | {marginPercent.toFixed(0)}%
                                                                            </span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Botones de Acción Simétricos (Dual-Balanced Flex-1) */}
                                                            <div className="flex items-center gap-2 border-t border-gray-100 dark:border-gray-800/50 pt-2.5">
                                                                {canCreate ? (<>
                                                                <button
                                                                    className="flex-1 h-9 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-bold text-text-main dark:text-white transition-all active:scale-[0.98] shadow-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-70 disabled:cursor-not-allowed"
                                                                    disabled={loadingEditId === product.id}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleEditProductClick(product.id);
                                                                    }}
                                                                    aria-label="Editar producto"
                                                                >
                                                                    {loadingEditId === product.id ? (
                                                                        <span className="material-symbols-outlined text-[18px] animate-spin text-primary">progress_activity</span>
                                                                    ) : (
                                                                        <>
                                                                            <span className="material-symbols-outlined text-[15px] opacity-75">edit</span>
                                                                            Editar
                                                                        </>
                                                                    )}
                                                                </button>
                                                                <button
                                                                    className="flex-1 h-9 bg-rose-50/50 dark:bg-rose-950/20 hover:bg-rose-100/50 dark:hover:bg-rose-900/30 border border-rose-100 dark:border-rose-900/30 rounded-lg text-xs font-bold text-rose-600 dark:text-rose-400 transition-all active:scale-[0.98] shadow-sm inline-flex items-center justify-center gap-1.5"
                                                                    onClick={(e) => { e.stopPropagation(); handleDelete(product.id, product.name); }}
                                                                >
                                                                    <span className="material-symbols-outlined text-[15px] opacity-75">delete</span>
                                                                    Eliminar
                                                                </button>
                                                                </>) : (
                                                                    <span className="flex-1 text-center text-[11px] text-gray-400 py-1.5">Solo lectura</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                        </div>
                                    );
                                })
                            ) : catalogLoading ? (
                                <div className="bg-white dark:bg-surface-dark p-8 rounded-2xl text-center text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-700 col-span-full">
                                    <span className="material-symbols-outlined text-2xl animate-spin text-primary mb-2">progress_activity</span>
                                    <p className="text-xs font-medium">Buscando productos...</p>
                                </div>
                            ) : (
                                <div className="bg-white dark:bg-surface-dark p-8 rounded-2xl text-center text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-700 col-span-full">
                                    <span className="material-symbols-outlined text-4xl opacity-50 mb-2">search_off</span>
                                    <p className="text-sm">No se encontraron productos.</p>
                                </div>
                            )}

                            {loadingMore && (
                                <div className="col-span-full py-4 text-center flex items-center justify-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                                    <span className="material-symbols-outlined text-base animate-spin text-primary">progress_activity</span>
                                    <span>Cargando más productos...</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile Health Tooltip — Fixed Bottom Sheet */}
            {openTooltipId && (() => {
                const tooltipProduct = filteredProducts.find(p => p.id === openTooltipId);
                if (!tooltipProduct) return null;
                const health = getInventoryDaysLabel(tooltipProduct, resolveThresholds(tooltipProduct));
                if (!health) return null;
                return (
                    <div
                        className="lg:hidden fixed inset-0 z-[100] flex items-end"
                        onClick={() => setOpenTooltipId(null)}
                    >
                        <div
                            className="w-full bg-gray-900 text-white p-4 pb-8 rounded-t-2xl shadow-2xl border-t border-gray-700"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold border ${health.style}`}>
                                    <span className="material-symbols-outlined text-[14px]">{health.icon}</span>
                                    {health.badge}
                                </div>
                                <button onClick={() => setOpenTooltipId(null)} className="text-gray-400 hover:text-white">
                                    <span className="material-symbols-outlined text-[20px]">close</span>
                                </button>
                            </div>
                            {health.velocityText !== '-' && (
                                <div className="mb-2 text-sm">
                                    <span className="font-bold text-gray-400">Velocidad:</span>{' '}
                                    <span className="font-bold">{health.velocityText}</span>
                                </div>
                            )}
                            <p className="text-sm text-gray-300 leading-relaxed">{health.tooltip}</p>
                        </div>
                    </div>
                );
            })()}


            {/* Supplier Rotation Settings Modal */}
            {configModalSupplier && (
                <SupplierSettingsModal
                    isOpen={!!configModalSupplier}
                    onClose={() => setConfigModalSupplier(null)}
                    supplier={configModalSupplier}
                    onSuccess={() => { refetchSuppliers(); }}
                    products={catalogProducts.map(p => ({ id: p.id, name: p.name, barcode: p.barcode || undefined }))}
                    addLink={addLink}
                />
            )}

            <UpgradeProModal
                isOpen={!!upgradeModalInfo?.open}
                onClose={() => setUpgradeModalInfo(null)}
                featureName={upgradeModalInfo?.title || 'Función de Plan Pro'}
                featureDescription={upgradeModalInfo?.desc}
                onUpgrade={() => {
                    setUpgradeModalInfo(null);
                    onNavigate(Screen.SUBSCRIPTION_PLANS);
                }}
            />
        </div>
    );
};
