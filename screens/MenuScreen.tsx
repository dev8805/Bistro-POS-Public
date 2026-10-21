


import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { CartItem, Product, Screen, TransactionDetails, ReceiptData } from '../types';
import { useProducts } from '../hooks/useProducts';
import { PaymentSidebar } from '../components/PaymentSidebar';
import { useClients } from '../hooks/useClients';
import { SuccessSidebar } from '../components/SuccessSidebar';

import { ProductCard } from '../components/ProductCard';
import { CartItemRow } from '../components/CartItemRow';
import ProductThumb from '../components/ui/ProductThumb';
import { formatCurrency } from '../lib/formatters';
import { useAuth } from '../context/AuthContext';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { DiscountModal } from '../components/DiscountModal';
import { PriceInputModal } from '../components/PriceInputModal';
import { QuantityInputModal } from '../components/QuantityInputModal';
import { MobileScannerItemModal } from '../components/MobileScannerItemModal';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { useToast } from '../context/ToastContext';
import { BarcodeScanner, BarcodeScannerHandle } from '../components/BarcodeScanner';
import TableSelectorControl from '../components/TableSelectorControl';
import OpenTicketsBar from '../components/OpenTicketsBar';
import ComandaLabelHeaderButton from '../components/ComandaLabelHeaderButton';
import { usePermissions } from '../hooks/usePermissions';
import { useTablesWriteGate } from '../hooks/useTablesWriteGate';
import TablesReadOnlyBanner from '../components/TablesReadOnlyBanner';
import { Table } from '../hooks/useTables';
import { expandProductsForPOS } from '../lib/catalogExpansion';


interface MenuScreenProps {
    onNavigate: (screen: Screen) => void;
    cart: CartItem[];
    addToCart: (product: Product) => void;
    onQuickAdd: (product: Product) => void;
    onQuickAddIndividual?: (product: Product) => void;
    onQuickAddWithQuantity?: (product: Product, quantity: number, adjustedPrice?: number) => void;
    onEditProduct: (product: Product | CartItem) => void;
    onOpenSimpleNote?: (product: Product) => void;
    removeFromCart: (product: CartItem) => void;
    updateQuantity: (product: CartItem, delta: number) => void;
    currentScreen: Screen;
    activeTable?: string;
    activeTableId?: string; // Real table ID for orders
    onProcessPayment?: (details: TransactionDetails) => void;
    lastTransaction?: TransactionDetails | null;
    onStartNewSale?: () => void;
    onAddAnimation?: (rect: DOMRect, image: string) => void;
    onConfirmOrder?: () => void;
    products?: Product[];
    productsLoading?: boolean;
    isDelivery?: boolean;
    deliveryClientName?: string;
    onAssignClient?: () => void;
    saleOrigin?: 'tables' | 'orders' | 'scanner';
    isOrderSent?: boolean;
    onSetOrderSent?: (sent: boolean) => void;
    /** Alternar a una mesa (desde el control del carrito) */
    onSelectTable?: (table: Table) => void;
    /** Alternar a Orden Rápida (desde el control del carrito) */
    onSelectQuickOrder?: () => void;
    /** Id de la mesa cuya orden se está cargando — spinner inline en chip/dropdown/card. */
    loadingTableId?: string | null;
    /** Enviar comanda de los items nuevos (status pending) a impresión */
    onSendCommanda?: () => void | Promise<void>;
    expandedCartItemId?: string | null;
    onExpandChange?: (id: string | null) => void;
    updateCartItem?: (product: CartItem, updates: Partial<CartItem>) => void;
    onClearCart?: () => void;
    hideHeader?: boolean; // Ocultar header cuando está embebido en SellScreen
    externalSearch?: string; // Búsqueda controlada externamente
    onExternalSearchChange?: (value: string) => void; // Callback para cambios de búsqueda
    receiptData?: ReceiptData | null; // Datos para generar el PDF del comprobante
    isEanMode?: boolean; // Modo EAN: oculta el grid y muestra cobro directo
    isKitchenEnabled?: boolean;
    onReady?: () => void; // Se dispara cuando productos + categorías terminan de cargar
    // Etiquetas de comanda seleccionadas (Localizador / Mesa / Tipo de pedido).
    // Estado elevado a App.tsx para persistir durante toda la venta.
    comandaLabelSelection?: { locator?: string; table?: string; takeaway?: string };
    onComandaLabelSelectionChange?: (selection: { locator?: string; table?: string; takeaway?: string }) => void;
}

const FAVORITES_ID = 'favorites';

export const MenuScreen: React.FC<MenuScreenProps> = ({
    onNavigate,
    cart,
    addToCart,
    onQuickAdd,
    onQuickAddIndividual,
    onQuickAddWithQuantity,
    onEditProduct,
    onOpenSimpleNote,
    removeFromCart,
    updateQuantity,
    currentScreen,
    activeTable,
    activeTableId,
    onProcessPayment,
    lastTransaction,
    onStartNewSale,
    onAddAnimation,
    onConfirmOrder,
    products: propsProducts,
    productsLoading: propsProductsLoading,
    isDelivery = false,
    deliveryClientName,
    onAssignClient,
    saleOrigin = 'tables',
    isOrderSent = false,
    onSetOrderSent,
    onSelectTable,
    onSelectQuickOrder,
    loadingTableId,
    onSendCommanda,
    expandedCartItemId,
    onExpandChange,
    updateCartItem,
    onClearCart,
    hideHeader = false,
    externalSearch,
    onExternalSearchChange,
    receiptData,
    isEanMode = true,
    onReady,
    comandaLabelSelection = {},
    onComandaLabelSelectionChange,
}) => {
    const { profile } = useAuth();
    const { clients } = useClients();
    const { isComandaLabelShortcutEnabled, isTablesEnabled } = useBusinessSettings();
    const { showToast } = useToast();
    const { canFinalizeSale } = usePermissions();
    const canSell = canFinalizeSale();
    // Gate de escritura de mesas (modelo Usuario Eje). El observador en solo
    // lectura no puede tomar pedidos ni cobrar; el Eje offline puede cobrar
    // aunque no tenga `canFinalizeSale` (Req 4.2, 4.4, 5.4, 16.1).
    const tablesGate = useTablesWriteGate();
    // Refs para consultar el gate desde callbacks definidos antes de `isQuickOrder`.
    const tablesReadOnlyRef = useRef(false);
    const tablesReadOnlyMsgRef = useRef<string | null>(null);
    // Refs para gatear la apertura de categorías sin mesa (rol mesero) desde
    // handleOpenCatalogSheet, que se define antes que isQuickOrder.
    const canSellRef = useRef(canSell);
    canSellRef.current = canSell;
    const isQuickOrderRef = useRef(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth);
    useEffect(() => {
        const handleResize = () => setWindowWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const assignedClient = useMemo(() => {
        if (!deliveryClientName || clients.length === 0) return null;
        return clients.find(c => c.name === deliveryClientName) || null;
    }, [deliveryClientName, clients]);

    // OPTIMIZED: Detect if products come from props (App.tsx) or internal hook
    // propsProducts !== undefined means App.tsx passed the prop
    const isUsingPropsProducts = propsProducts !== undefined;
    const hookData = useProducts();

    // Use products from props if passed, otherwise use hook data
    const rawProducts = isUsingPropsProducts ? propsProducts : hookData.products;
    const products = useMemo(() => expandProductsForPOS((rawProducts || []) as any[]) as Product[], [rawProducts]);
    const categories = hookData.categories;
    // Use loading from props if explicitly provided, otherwise use hook loading
    // FIX: También esperar a que las categorías carguen para evitar salto visual
    const productsLoading = isUsingPropsProducts
        ? (propsProductsLoading ?? true)
        : hookData.loading;
    // Considerar loading si los productos O las categorías están cargando
    const loading = productsLoading || (hookData.loading && categories.length === 0);

    // Avisar al padre (App) que el catálogo ya cargó, para revelar la app de una vez.
    useEffect(() => {
        if (!loading) onReady?.();
    }, [loading, onReady]);

    const [activeCategory, setActiveCategory] = useState<string | null>('all');

    // Keyboard Navigation State
    const [selectedIndex, setSelectedIndex] = useState<number>(0);
    const [isKeyboardNav, setIsKeyboardNav] = useState<boolean>(false);
    const [sidebarFocus, setSidebarFocus] = useState<'none' | 'client' | 'process'>('none');

    // Discount Modal Logic
    const [discountItem, setDiscountItem] = useState<CartItem | null>(null);
    const [priceInputProduct, setPriceInputProduct] = useState<Product | null>(null);
    const [quantityInputProduct, setQuantityInputProduct] = useState<Product | null>(null);
    const [scannerItemEditor, setScannerItemEditor] = useState<CartItem | null>(null);
    const [eanWeightEditItem, setEanWeightEditItem] = useState<CartItem | null>(null);
    const [previewImage, setPreviewImage] = useState<string | null>(null);

    // ── Catálogo móvil (≤767px): bottom sheet de productos por categoría ──
    // catalogSheetCategory guarda el id de categoría abierto ('all' | FAVORITES_ID | cat.id); null = cerrado.
    const [catalogSheetCategory, setCatalogSheetCategory] = useState<string | null>(null);
    const [sheetSearch, setSheetSearch] = useState('');
    const [isSheetSearchOpen, setIsSheetSearchOpen] = useState(false);
    const [showCatalogSuggestions, setShowCatalogSuggestions] = useState(false);
    // Estado del gesto arrastrar-para-cerrar del sheet
    const [sheetOffset, setSheetOffset] = useState(0);
    const [sheetDragging, setSheetDragging] = useState(false);
    const [sheetClosing, setSheetClosing] = useState(false);
    const catalogSheetRef = useRef<HTMLDivElement>(null);
    const sheetListRef = useRef<HTMLDivElement>(null);
    const sheetStartY = useRef<number | null>(null);
    const sheetOffsetRef = useRef(0);
    const sheetDraggingRef = useRef(false);
    // Toggle "Ver/Ocultar" de las categorías en el catálogo móvil (colapsar a una fila)
    const mobileCatBarRef = useRef<HTMLDivElement>(null);
    const [isCatCollapsed, setIsCatCollapsed] = useState(false);
    const [showCatToggle, setShowCatToggle] = useState(false);

    const UNIT_LABELS: Record<string, string> = {
        'Unidad': 'Und', 'Kilogramos': 'Kg', 'Libras': 'Lb', 'Gramos': 'g', 'Onzas': 'Oz',
        'Arrobas': 'Arr', 'Toneladas': 'Ton', 'Litros': 'Lt', 'Mililitros': 'ml',
        'Galones': 'Gal', 'Metros': 'm', 'Centímetros': 'cm', 'Pulgadas': 'in',
    };
    const isWeightUnit = (unit?: string) => !!unit && unit !== 'Unidad' && unit !== 'Und' && unit !== 'Serv';
    const getUnitLabel = (unit?: string) => (unit && UNIT_LABELS[unit]) || unit || 'Und';

    const handleApplyDiscount = (value: number, type: 'percent' | 'amount') => {
        if (!discountItem || !updateCartItem) return;

        const updates: Partial<CartItem> = {
            discount: type === 'amount' ? value : undefined,
            discountPercent: type === 'percent' ? value : undefined,
        };

        updateCartItem(discountItem, updates);
        setDiscountItem(null);
    };

    // Set initial active category when categories load
    useEffect(() => {
        if (categories.length > 0 && !activeCategory) {
            setActiveCategory('all');
        }
    }, [categories, activeCategory]);

    // Búsqueda: usar valor externo si está disponible, sino estado interno
    const [internalSearch, setInternalSearch] = useState("");
    const search = externalSearch !== undefined ? externalSearch : internalSearch;
    const setSearch = (value: string) => {
        if (onExternalSearchChange) {
            onExternalSearchChange(value);
        } else {
            setInternalSearch(value);
        }
    };
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [isDesktopCategoriesExpanded, setIsDesktopCategoriesExpanded] = useState(false);
    const desktopCategoryListRef = useRef<HTMLDivElement>(null);
    const [showDesktopExpandButton, setShowDesktopExpandButton] = useState(false);

    // Estado para el dropdown de categorías unificado en modo EAN
    const [isEanCategoryMenuOpen, setIsEanCategoryMenuOpen] = useState(false);
    const categoryMenuRef = useRef<HTMLDivElement>(null);

    // Cerrar dropdowns al hacer click fuera
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (categoryMenuRef.current && !categoryMenuRef.current.contains(event.target as Node)) {
                setIsEanCategoryMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Detect keyboard visibility using Visual Viewport API
    const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
    useEffect(() => {
        const viewport = window.visualViewport;
        if (!viewport) return;

        const handleResize = () => {
            // Keyboard is visible when viewport height is significantly less than window height
            const threshold = window.innerHeight * 0.75;
            setIsKeyboardVisible(viewport.height < threshold);
        };

        viewport.addEventListener('resize', handleResize);
        return () => viewport.removeEventListener('resize', handleResize);
    }, []);

    // ⚡ DUAL REFS: Solución robusta para evitar conflictos entre vista móvil y escritorio
    const mobileSearchRef = useRef<HTMLInputElement>(null);
    const desktopSearchRef = useRef<HTMLInputElement>(null);

    // ⚡ SMART FOCUS: Determina dinámicamente qué input enfocar según el layout activo
    const refocusSearchInput = useCallback(() => {
        // setTimeout asegura que el DOM esté listo y React haya terminado de renderizar
        setTimeout(() => {
            const w = window.innerWidth;
            // Determinar cuál ref está montada y visible en el DOM
            // En tablet (768-1023) + modo catálogo, el mobile header es el visible
            // En tablet + modo scanner o desktop (≥1024), el desktop header es el visible
            if (w < 768) {
                // Móvil: siempre mobile/scanner ref
                if (scannerSearchRef.current) {
                    scannerSearchRef.current.focus();
                    scannerSearchRef.current.select();
                } else {
                    mobileSearchRef.current?.focus();
                    mobileSearchRef.current?.select();
                }
            } else if (mobileSearchRef.current && mobileSearchRef.current.offsetParent !== null) {
                // Tablet en modo Catálogo: el mobileSearchRef está visible
                mobileSearchRef.current.focus();
                mobileSearchRef.current.select();
            } else {
                // Desktop o Tablet en modo Scanner: desktopSearchRef
                desktopSearchRef.current?.focus();
                desktopSearchRef.current?.select();
            }
        }, 50);
    }, []);

    useEffect(() => {
        const handleFocusSearch = () => {
            // En móvil el buscador es colapsable: no auto-expandirlo al volver al
            // catálogo desde el carrito/pago. Solo se refoca/expande en desktop.
            if (window.innerWidth < 768) return;
            setIsSearchExpanded(true);
            setTimeout(() => refocusSearchInput(), 100);
        };
        const handleClearAndFocus = () => {
            if (window.innerWidth < 768) return;
            setSearch('');
            setActiveCategory('all');
            setTimeout(() => refocusSearchInput(), 150);
        };
        window.addEventListener('focus-menu-search', handleFocusSearch);
        window.addEventListener('clear-and-focus-menu-search', handleClearAndFocus);
        return () => {
            window.removeEventListener('focus-menu-search', handleFocusSearch);
            window.removeEventListener('clear-and-focus-menu-search', handleClearAndFocus);
        };
    }, [refocusSearchInput]);

    useEffect(() => {
        if (window.innerWidth >= 768) {
            const t = setTimeout(() => desktopSearchRef.current?.focus(), 150);
            return () => clearTimeout(t);
        }
    }, []);

    const [viewMode, setViewMode] = useState<'products' | 'categories'>('products');
    const [isCategoriesExpanded, setIsCategoriesExpanded] = useState(false);
    const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);

    // Modo escáner integrado (solo móvil)
    // Se inicializa y sincroniza con isEanMode (estado global) para que el modo
    // sea coherente entre móvil y desktop dentro del mismo dispositivo.
    const [isScannerMode, setIsScannerMode] = useState(isEanMode);

    // Mantener isScannerMode alineado si isEanMode cambia desde fuera (ej: toggle desktop)
    useEffect(() => {
        setIsScannerMode(isEanMode);
    }, [isEanMode]);

    const [isCameraActive, setIsCameraActive] = useState(false);
    const [scannerSearch, setScannerSearch] = useState('');
    const [showScannerSuggestions, setShowScannerSuggestions] = useState(false);
    const [isScannerSearchExpanded, setIsScannerSearchExpanded] = useState(false);
    const scannerSearchRef = useRef<HTMLInputElement>(null);
    const barcodeScannerRef = useRef<BarcodeScannerHandle>(null);

    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        products.forEach(p => {
            const catId = (p as any).category_id || (p as any).category?.id;
            if (catId) {
                counts[catId] = (counts[catId] || 0) + 1;
            }
        });
        return counts;
    }, [products]);

    // Filtrar categorías sin productos y ordenar alfabéticamente (orden por defecto).
    // El orden alfabético da un resultado estable entre la carga de cache y de red
    // (ambas quedan igual), evitando el "salto" de reorganización al entrar.
    const visibleCategories = useMemo(() => {
        return categories
            .filter(cat => (categoryCounts[cat.id] || 0) > 0)
            .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    }, [categories, categoryCounts]);

    const hasFavorites = useMemo(() => products.some(p => (p as any).is_favorite), [products]);

    // Mostrar el toggle "Ver/Ocultar" solo si las categorías ocupan más de una fila.
    // Se mide cuando está expandido (flex-wrap): si scrollHeight supera ~una fila, hay overflow.
    useEffect(() => {
        const check = () => {
            const el = mobileCatBarRef.current;
            if (!el || isCatCollapsed) return; // al colapsar se conserva el último valor medido
            setShowCatToggle(el.scrollHeight > 40);
        };
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, [visibleCategories, hasFavorites, isCatCollapsed]);

    // Workaround: We don't have cart prop in MenuScreen (based on view), but we can't easily change props without looking at definition.
    // Let's look at defining props in MenuScreen.tsx line 1-50
    // If cart is not passed, we can't observe it.
    // But we can expose a way to reset it.
    // Actually, 'isOrderSent' is local UI state. 
    // If the user adds an item (via Modal), the Modal closes. 
    // Maybe we reset isOrderSent when a product is selected?
    // Or when the keys change?

    // Better: Add 'cart' to MenuScreen props in App.tsx and MenuScreen.tsx.
    // For now, let's just add the state and manual reset locally if possible, or assume user will click "Enviar" again.
    // User said: "reset to 'Enviar' when cart changes".
    // I need to start watching 'cart' in MenuScreen.




    // Pulse Animation State for Tablet/Desktop Grid
    const [pulsingProduct, setPulsingProduct] = useState<string | null>(null);

    // Ref que marca el timestamp del último escaneo detectado por el hook global.
    // Permite que el onKeyDown del input móvil ignore el Enter cuando la pistola
    // acaba de disparar (< 300ms), evitando la doble adición.
    const lastMachineScanRef = useRef<number>(0);

    // Barcode scanner: agrega producto directo al carrito cuando se detecta escaneo
    // En modo EAN desktop (≥1024px), el input ya maneja el escáner físico via handleSearchKeyDown,
    // así que deshabilitamos el hook global para evitar doble adición.
    const isEanDesktop = isEanMode && windowWidth >= 1024;
    useBarcodeScanner(products, (product) => {
        lastMachineScanRef.current = Date.now();

        if (isWeightUnit(product.unit)) {
            setPriceInputProduct(product);
        } else {
            onQuickAdd(product);
        }
        setScannerSearch('');
        setSearch('');
        if (window.innerWidth < 768) {
            (document.activeElement as HTMLElement)?.blur();
        } else {
            setTimeout(() => refocusSearchInput(), 50);
        }
    }, !priceInputProduct && !discountItem && !isEanDesktop,
    () => showToast('Producto no encontrado', 'error'));


    // OPTIMIZED: Memoized product filtering - only recalculates when dependencies change
    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            const productCategoryId = (p as any).category_id || (p as any).category?.id;
            const categoryMatch = activeCategory === FAVORITES_ID
                ? !!(p as any).is_favorite
                : (!activeCategory || activeCategory === 'all' || productCategoryId === activeCategory);
            const searchLower = search.toLowerCase();
            const matchesName = p.name.toLowerCase().includes(searchLower);
            const matchesNickname = (p as any).nicknames?.some((nick: string) => nick.toLowerCase().includes(searchLower)) || false;
            const matchesBarcode = !!p.barcode && p.barcode.toLowerCase().includes(searchLower);
            const matchesSearch = matchesName || matchesNickname || matchesBarcode;
            return categoryMatch && matchesSearch;
        });
    }, [products, activeCategory, search]);

    // Si estamos en el filtro Favoritos y ya no quedan favoritos, volver a "Todos"
    useEffect(() => {
        if (activeCategory === FAVORITES_ID && !hasFavorites) {
            setActiveCategory('all');
        }
    }, [activeCategory, hasFavorites]);

    // Restricting initial paint mapping to avoid lagging sidebar (Stuck fixes)
    const [visibleCount, setVisibleCount] = useState(24);

    // Reset selection and pagination when filters change
    useEffect(() => {
        setVisibleCount(24);
        setSelectedIndex(0);
        setIsKeyboardNav(false);
        setSidebarFocus('none');
    }, [activeCategory, search]);

    // Progressive loading data slice
    const displayedProducts = useMemo(() => {
        return filteredProducts.slice(0, visibleCount);
    }, [filteredProducts, visibleCount]);

    // Track scroll to load more
    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
        if (scrollHeight - scrollTop <= clientHeight + 300) {
            if (visibleCount < filteredProducts.length) {
                setVisibleCount(prev => prev + 24);
            }
        }
    }, [visibleCount, filteredProducts.length]);

    // ── Catálogo móvil: productos del sheet (categoría abierta) filtrados por su buscador interno ──
    const sheetProducts = useMemo(() => {
        if (catalogSheetCategory === null) return [];
        const q = sheetSearch.trim().toLowerCase();
        return products.filter(p => {
            const productCategoryId = (p as any).category_id || (p as any).category?.id;
            const categoryMatch = catalogSheetCategory === FAVORITES_ID
                ? !!(p as any).is_favorite
                : (catalogSheetCategory === 'all' || productCategoryId === catalogSheetCategory);
            if (!categoryMatch) return false;
            if (!q) return true;
            const matchesName = p.name.toLowerCase().includes(q);
            const matchesNickname = (p as any).nicknames?.some((nick: string) => nick.toLowerCase().includes(q)) || false;
            const matchesBarcode = !!p.barcode && p.barcode.toLowerCase().includes(q);
            return matchesName || matchesNickname || matchesBarcode;
        });
    }, [products, catalogSheetCategory, sheetSearch]);

    // ── Catálogo móvil: resultados del buscador GLOBAL del header (ignora la categoría activa) ──
    const catalogSearchResults = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return [];
        return products.filter(p => {
            const matchesName = p.name.toLowerCase().includes(q);
            const matchesNickname = (p as any).nicknames?.some((nick: string) => nick.toLowerCase().includes(q)) || false;
            const matchesBarcode = !!p.barcode && p.barcode.toLowerCase().includes(q);
            return matchesName || matchesNickname || matchesBarcode;
        }).slice(0, 8);
    }, [products, search]);

    const catalogSheetTitle = useMemo(() => {
        if (catalogSheetCategory === null) return '';
        if (catalogSheetCategory === 'all') return 'Todos';
        if (catalogSheetCategory === FAVORITES_ID) return 'Favoritos';
        return visibleCategories.find(c => c.id === catalogSheetCategory)?.name || 'Categoría';
    }, [catalogSheetCategory, visibleCategories]);

    // Abre el sheet de una categoría (resetea su buscador interno)
    const handleOpenCatalogSheet = useCallback((categoryId: string) => {
        // En modo mesa con solo lectura (observador o Eje sin conexión) no se
        // pueden tomar nuevos pedidos (Req 5.4, 16.1).
        if (!isQuickOrderRef.current && tablesReadOnlyRef.current) {
            showToast(tablesReadOnlyMsgRef.current ?? 'Mesas en solo lectura sin conexión', 'warning');
            return;
        }
        // Rol mesero (no puede vender): debe elegir una mesa antes de tomar el pedido.
        // Sin mesa activa (isQuickOrder), bloqueamos abrir la categoría.
        if (!canSellRef.current && isQuickOrderRef.current) {
            showToast('Elige una mesa para tomar el pedido', 'warning');
            return;
        }
        setActiveCategory(categoryId);
        setSheetSearch('');
        setIsSheetSearchOpen(false);
        setSheetOffset(0);
        sheetOffsetRef.current = 0;
        setCatalogSheetCategory(categoryId);
    }, [showToast]);

    // Cierre animado del sheet (desliza hacia abajo y luego desmonta)
    const handleCloseCatalogSheet = useCallback(() => {
        setSheetClosing(true);
        setTimeout(() => {
            setCatalogSheetCategory(null);
            setSheetClosing(false);
            setSheetOffset(0);
            sheetOffsetRef.current = 0;
            setIsSheetSearchOpen(false);
            setSheetSearch('');
        }, 250);
    }, []);

    // Agrega un producto desde el sheet o el dropdown global (fila individual; peso → modal de precio)
    // Función normal (no useCallback) para no capturar un handleMobileQuantityChange obsoleto.
    const handleCatalogAdd = (product: Product, e: React.MouseEvent<HTMLElement>) => {
        e.stopPropagation();
        handlePulse(product.id);
        if (isWeightUnit(product.unit)) {
            setPriceInputProduct(product);
        } else {
            handleMobileQuantityChange(product, 1, e);
        }
    };

    // touchmove con passive:false para arrastrar el sheet; solo cierra si la lista está arriba del todo.
    useEffect(() => {
        if (catalogSheetCategory === null || window.innerWidth >= 768) return;
        const el = catalogSheetRef.current;
        if (!el) return;
        const handler = (ev: TouchEvent) => {
            if (sheetStartY.current === null) return;
            const delta = ev.touches[0].clientY - sheetStartY.current;
            const list = sheetListRef.current;
            const atTop = !list || list.scrollTop <= 0;
            if (delta > 5 && atTop) {
                ev.preventDefault();
                if (!sheetDraggingRef.current) { sheetDraggingRef.current = true; setSheetDragging(true); }
                sheetOffsetRef.current = delta;
                setSheetOffset(delta);
            }
        };
        el.addEventListener('touchmove', handler, { passive: false });
        return () => el.removeEventListener('touchmove', handler);
    }, [catalogSheetCategory]);

    // Reference for category list container to measure height
    const categoryListRef = useRef<HTMLDivElement>(null);
    const [showExpandButton, setShowExpandButton] = useState(false);

    // Check if categories overflow > 2 rows (approx 68px)
    useEffect(() => {
        const checkOverflow = () => {
            if (categoryListRef.current) {
                // Threshold of 70px safely covers 2 rows (approx 64px) + gap
                // If scrollHeight > 70, it means we have bits in the 3rd row
                const isOverflowing = categoryListRef.current.scrollHeight > 36;
                setShowExpandButton(isOverflowing);
            }
        };

        checkOverflow();
        // Check on resize as wrapping changes
        window.addEventListener('resize', checkOverflow);
        return () => window.removeEventListener('resize', checkOverflow);
    }, [visibleCategories, isSearchExpanded]);

    // Check if desktop categories overflow > 1 row (approx 40px)
    useEffect(() => {
        const checkDesktopOverflow = () => {
            if (desktopCategoryListRef.current) {
                const isOverflowing = desktopCategoryListRef.current.scrollHeight > 44;
                setShowDesktopExpandButton(isOverflowing);
            }
        };

        checkDesktopOverflow();
        window.addEventListener('resize', checkDesktopOverflow);
        return () => window.removeEventListener('resize', checkDesktopOverflow);
    }, [visibleCategories]);



    // ⚡ Memoized: solo recalcula cuando cambia el carrito
    const { subtotal, total, discountTotal, totalItems, badgeCount } = useMemo(() => {
        let grossSub = 0;
        let discTotal = 0;
        let items = 0;
        let badge = 0;
        cart.forEach(item => {
            const itemOriginalTotal = Math.round(item.price * item.quantity);
            let itemDiscount = 0;

            if (item.discount) {
                itemDiscount = item.discount;
            } else if (item.discountPercent) {
                itemDiscount = (itemOriginalTotal * item.discountPercent) / 100;
            }

            grossSub += itemOriginalTotal;
            discTotal += itemDiscount;
            items += item.quantity;
            const isUnit = !item.unit || item.unit === 'Unidad' || item.unit === 'Und';
            badge += isUnit ? item.quantity : 1;
        });
        return { subtotal: grossSub, total: Math.round(Math.max(0, grossSub - discTotal) / 50) * 50, discountTotal: discTotal, totalItems: Math.round(items * 100) / 100, badgeCount: Math.round(badge * 100) / 100 };
    }, [cart]);

    // isQuickOrder es true cuando saleOrigin es 'orders' o 'scanner' (simplificado)
    const isQuickOrder = saleOrigin === 'orders' || saleOrigin === 'scanner';
    isQuickOrderRef.current = isQuickOrder;
    // Solo lectura de mesas: aplica únicamente en modo mesa (no en Orden Rápida).
    const tablesReadOnly = !isQuickOrder && tablesGate.readOnly;
    tablesReadOnlyRef.current = tablesReadOnly;
    tablesReadOnlyMsgRef.current = tablesGate.readOnlyMessage;
    // El Eje puede cobrar mesas offline aunque no tenga permiso de venta (Req 4.2).
    const canSellTables = canSell || (tablesGate.soyEje && !tablesGate.isOnline);
    const puedeCobrar = isQuickOrder ? canSell : (canSellTables && !tablesReadOnly);
    const isPaymentView = currentScreen === Screen.PAYMENT;
    const isSuccessView = currentScreen === Screen.SUCCESS;

    // Comanda: items "enviados" a cocina (status preparing/ready/served) vs "nuevos" (pending o local).
    // Solo relevante en modo mesa. El FAB de comanda se habilita solo si hay items nuevos.
    const SENT_STATUSES = ['preparing', 'ready', 'served'];
    const hasPendingNewItems = useMemo(
        () => cart.some(it => !it.parentOrderItemId && !SENT_STATUSES.includes(it.status || 'pending')),
        [cart]
    );
    const hasSentItems = useMemo(
        () => cart.some(it => !it.parentOrderItemId && SENT_STATUSES.includes(it.status || '')),
        [cart]
    );

    // Helper to get cart quantity for a specific product
    const getCartQuantity = (productId: string) => {
        return cart
            .filter(item => item.id === productId)
            .reduce((acc, item) => acc + item.quantity, 0);
    };

    // Trigger animation helper
    const triggerAnim = (e: React.MouseEvent<HTMLElement>, image: string) => {
        if (onAddAnimation) {
            const cardEl = (e.currentTarget.closest('[id^="product-card-"]') as HTMLElement) || e.currentTarget;
            const rect = cardEl.getBoundingClientRect();
            onAddAnimation(rect, image);
        }
    };

    // Helper function to handle pulse animation
    const handlePulse = (id: string) => {
        setPulsingProduct(id);
        setTimeout(() => setPulsingProduct(null), 100); // 100ms micro-pulsación rápida e instantánea
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const viewProducts = filteredProducts;

        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) {
                setSidebarFocus(prev => prev === 'none' ? 'process' : prev === 'process' ? 'client' : 'none');
            } else {
                setSidebarFocus(prev => prev === 'none' ? 'client' : prev === 'client' ? 'process' : 'none');
            }
            return;
        }

        if (viewProducts.length === 0 || search === '') {
            if (isEanMode && cart.length > 0) {
                if (e.key === 'Enter' || e.key === '+' || e.code === 'NumpadAdd') {
                    e.preventDefault();
                    // En EAN modo desktop, el carrito procesa invertido para la visualización (último arriba)
                    // entonces el lastItem es cart[cart.length - 1]
                    const lastItem = cart[cart.length - 1];
                    updateQuantity(lastItem, 1);
                    return;
                } else if (e.key === '-' || e.code === 'NumpadSubtract') {
                    e.preventDefault();
                    const lastItem = cart[cart.length - 1];
                    if (lastItem.quantity > 1) {
                        updateQuantity(lastItem, -1);
                    } else {
                        removeFromCart(lastItem);
                    }
                    return;
                }
            }
            return;
        }

        // Estimar columnas para navegación de cuadrícula realista
        let cols = 2;
        if (window.innerWidth >= 1280) cols = 4;
        else if (window.innerWidth >= 1024) cols = 3;
        else if (window.innerWidth >= 768) cols = 4;
        if (isEanMode && window.innerWidth >= 1024) cols = 1; // En EAN modo, el desktop usa un dropdown de columna única

        if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
            setIsKeyboardNav(true);
            setSidebarFocus('none');
        }

        if (e.key === 'ArrowRight') {
            e.preventDefault();
            setIsKeyboardNav(true);
            setSelectedIndex(prev => (prev < viewProducts.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev + cols < viewProducts.length ? prev + cols : viewProducts.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev - cols >= 0 ? prev - cols : 0));
        } else if (e.key === 'Enter' || e.code === 'NumpadEnter') {
            e.preventDefault();
            setIsKeyboardNav(true);
            // Si el hook del escáner físico acaba de disparar, ignorar para evitar doble adición en tablet
            if (Date.now() - lastMachineScanRef.current < 300) return;
            if (sidebarFocus === 'client') {
                onAssignClient?.();
            } else if (sidebarFocus === 'process') {
                if (cart.length > 0) {
                    onNavigate(Screen.PAYMENT);
                }
            } else {
                const selectedProduct = viewProducts[selectedIndex];
                if (selectedProduct) {
                    handlePulse(selectedProduct.id);
                    if (isWeightUnit(selectedProduct.unit)) {
                        setPriceInputProduct(selectedProduct);
                    } else {
                        const syntheticEvent = { stopPropagation: () => { } } as any;
                        handleMobileQuantityChange(selectedProduct, 1, syntheticEvent);
                        if (isEanMode) {
                            setSearch('');
                        }
                        refocusSearchInput();
                    }
                }
            }
        } else if (e.key === '+' || e.code === 'NumpadAdd') {
            e.preventDefault();
            const selectedProduct = viewProducts[selectedIndex];
            if (selectedProduct) {
                handlePulse(selectedProduct.id);
                if (isWeightUnit(selectedProduct.unit)) {
                    setPriceInputProduct(selectedProduct);
                } else {
                    const syntheticEvent = { stopPropagation: () => { } } as any;
                    handleMobileQuantityChange(selectedProduct, 1, syntheticEvent);
                    if (isEanMode) {
                        setSearch('');
                    }
                    refocusSearchInput();
                }
            }
        } else if (e.key === '-' || e.code === 'NumpadSubtract') {
            e.preventDefault();
            const selectedProduct = viewProducts[selectedIndex];
            if (selectedProduct) {
                handlePulse(selectedProduct.id);
                const syntheticEvent = { stopPropagation: () => { } } as any;
                handleMobileQuantityChange(selectedProduct, -1, syntheticEvent);
                refocusSearchInput();
            }
        }
    };

    // Scroll selected item into view for keyboard navigation
    useEffect(() => {
        if (!isKeyboardNav) return;
        const viewProducts = filteredProducts;
        const selectedProduct = viewProducts[selectedIndex];
        if (selectedProduct) {
            const elGrid = document.getElementById(`product-card-${selectedProduct.id}`);
            const elDropdown = document.getElementById(`desktop-suggestion-${selectedProduct.id}`);
            if (elGrid) {
                elGrid.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
            if (elDropdown) {
                elDropdown.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }, [selectedIndex, filteredProducts, isKeyboardNav]);

    // Scroll de la sugerencia seleccionada en el dropdown global del catálogo móvil
    useEffect(() => {
        if (isScannerMode) return;
        const sel = catalogSearchResults[selectedIndex];
        if (sel) {
            document.getElementById(`catalog-suggestion-${sel.id}`)?.scrollIntoView({ block: 'nearest' });
        }
    }, [selectedIndex, catalogSearchResults, isScannerMode]);

    // Volver del pago al carrito en modo catálogo (mismo efecto que la flecha de volver).
    // Reenfoca el buscador SIN borrar el texto ni resetear la categoría, para poder
    // seguir agregando productos sin perder la búsqueda.
    const handleExitCatalogPayment = () => {
        onNavigate(Screen.SELL);
        setTimeout(() => {
            window.dispatchEvent(new Event('focus-menu-search'));
        }, 50);
    };

    // Helper to handle +/- on mobile cards
    const handleMobileQuantityChange = (product: Product, delta: number, e: React.MouseEvent<HTMLElement>) => {
        e.stopPropagation();

        // Bloqueo de escritura en modo mesa solo lectura (Req 5.4, 16.1).
        if (tablesReadOnlyRef.current) {
            showToast(tablesReadOnlyMsgRef.current ?? 'Mesas en solo lectura sin conexión', 'warning');
            return;
        }

        // Find existing cart items for this product
        const allItemsForProduct = cart.filter(item => item.id === product.id);

        if (delta > 0) {
            if (isEanMode && allItemsForProduct.length > 0) {
                updateQuantity(allItemsForProduct[allItemsForProduct.length - 1], 1);
            } else if (onQuickAddIndividual) {
                onQuickAddIndividual(product);
            } else {
                onQuickAdd(product);
            }
            // Si estamos en la pantalla de pago (modo catálogo), al agregar desde una card
            // volvemos al carrito para ver el ítem recién agregado. El PaymentSidebar queda
            // montado oculto, así no se pierde lo ya ingresado en el pago.
            if (isPaymentView && !isEanMode) {
                handleExitCatalogPayment();
            }
        } else {
            // delta < 0 (decrement) - remove the last item added
            if (allItemsForProduct.length > 0) {
                const itemToUpdate = allItemsForProduct[allItemsForProduct.length - 1];
                if (itemToUpdate.quantity === 1) {
                    removeFromCart(itemToUpdate);
                } else {
                    updateQuantity(itemToUpdate, -1);
                }
            }
        }
    };

    const handleSetCustomQuantity = (product: Product, newQuantity: number) => {
        if (tablesReadOnlyRef.current) {
            showToast(tablesReadOnlyMsgRef.current ?? 'Mesas en solo lectura sin conexión', 'warning');
            return;
        }
        const allItemsForProduct = cart.filter(item => item.id === product.id);
        const currentTotal = allItemsForProduct.reduce((sum, item) => sum + item.quantity, 0);

        if (newQuantity === 0) {
            // Remove all items for this product
            allItemsForProduct.forEach(item => removeFromCart(item));
        } else if (newQuantity > currentTotal) {
            // Add individual rows for the difference
            const diff = newQuantity - currentTotal;
            for (let i = 0; i < diff; i++) {
                onQuickAdd(product);
            }
        } else if (newQuantity < currentTotal) {
            // Remove from the end until we reach the desired quantity
            let remaining = currentTotal - newQuantity;
            for (let i = allItemsForProduct.length - 1; i >= 0 && remaining > 0; i--) {
                const item = allItemsForProduct[i];
                if (item.quantity <= remaining) {
                    remaining -= item.quantity;
                    removeFromCart(item);
                } else {
                    updateQuantity(item, -(remaining));
                    remaining = 0;
                }
            }
        }
    };

    // Lógica del modo escáner integrado
    const handleScannerBarcode = useCallback((barcode: string) => {
        let found = products.find(p => p.barcode === barcode);

        // Fallback: ignorando ceros a la izquierda
        if (!found) {
            const cleanBarcode = barcode.replace(/^0+/, '');
            found = products.find(p => p.barcode && p.barcode.replace(/^0+/, '') === cleanBarcode);
        }

        if (!found) {
            barcodeScannerRef.current?.playErrorBeep();
            showToast('Producto no encontrado en inventario', 'error');
            return;
        }

        if (isWeightUnit(found.unit)) {
            setPriceInputProduct(found);
        } else {
            onQuickAdd(found);
        }
    }, [products, onQuickAdd, showToast]);

    const scannerSuggestions = useMemo(() => {
        if (!scannerSearch.trim()) return [];
        const q = scannerSearch.toLowerCase();
        return products.filter(p =>
            p.name.toLowerCase().includes(q) ||
            (p.barcode && p.barcode.includes(q))
        ).slice(0, 6);
    }, [products, scannerSearch]);

    return (
        <div className="flex-1 flex h-full w-full min-w-0 overflow-hidden relative bg-background-light dark:bg-background-dark">
            <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0 relative">

                {/* ================= MOBILE HEADER ================= */}
                {/* ================= MOBILE HEADER ================= */}
                {/* ================= MOBILE HEADER ================= */}
                {!hideHeader && (
                    <header className="flex md:hidden items-center gap-2 p-3 bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-800 shrink-0 z-30 shadow-sm relative h-[60px]">
                        {/* === UNIFIED MOBILE HEADER: Buscador izquierda + Dropdown modo derecha === */}
                        <div className="flex items-center gap-2 w-full">

                            {/* IZQUIERDA: Buscador colapsable */}
                            {(isScannerMode ? isScannerSearchExpanded : isSearchExpanded) ? (
                                <div className="flex-1 relative animate-[fadeIn_0.2s_ease-out]">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                                        <span className="material-symbols-outlined text-[20px]">search</span>
                                    </span>
                                    <input
                                        ref={isScannerMode ? scannerSearchRef : mobileSearchRef}
                                        type="text"
                                        data-barcode-passthrough={isScannerMode ? "true" : undefined}
                                        placeholder="Buscar producto..."
                                        value={isScannerMode ? scannerSearch : search}
                                        onChange={e => {
                                            if (isScannerMode) {
                                                setScannerSearch(e.target.value);
                                                setShowScannerSuggestions(true);
                                                setSelectedIndex(0);
                                            } else {
                                                setSearch(e.target.value);
                                                setSidebarFocus('none');
                                            }
                                        }}
                                        onFocus={() => { if (isScannerMode) setShowScannerSuggestions(true); }}
                                        onBlur={() => { if (isScannerMode) setTimeout(() => setShowScannerSuggestions(false), 150); }}
                                        onKeyDown={(e) => {
                                            if (isScannerMode) {
                                                if (priceInputProduct) return;
                                                if (Date.now() - lastMachineScanRef.current < 300) return;
                                                if (e.key === 'Escape') {
                                                    setScannerSearch('');
                                                    setIsScannerSearchExpanded(false);
                                                    scannerSearchRef.current?.blur();
                                                    return;
                                                }
                                                if (scannerSearch === '' && cart.length > 0) {
                                                    if (e.key === 'Enter' || e.key === '+' || e.code === 'NumpadAdd') {
                                                        e.preventDefault();
                                                        updateQuantity(cart[cart.length - 1], 1);
                                                        return;
                                                    } else if (e.key === '-' || e.code === 'NumpadSubtract') {
                                                        e.preventDefault();
                                                        const lastItem = cart[cart.length - 1];
                                                        if (lastItem.quantity > 1) updateQuantity(lastItem, -1);
                                                        else removeFromCart(lastItem);
                                                        return;
                                                    }
                                                }
                                                if (scannerSearch !== '' && scannerSuggestions.length > 0) {
                                                    if (e.key === 'ArrowDown') {
                                                        e.preventDefault();
                                                        setSelectedIndex(prev => prev < scannerSuggestions.length - 1 ? prev + 1 : prev);
                                                    } else if (e.key === 'ArrowUp') {
                                                        e.preventDefault();
                                                        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0);
                                                    } else if (e.key === 'Enter' || e.code === 'NumpadEnter') {
                                                        e.preventDefault();
                                                        const selectedP = scannerSuggestions[Math.min(selectedIndex, scannerSuggestions.length - 1)];
                                                        if (selectedP) {
                                                            setScannerSearch('');
                                                            setShowScannerSuggestions(false);
                                                            if (isWeightUnit(selectedP.unit)) {
                                                                scannerSearchRef.current?.blur();
                                                                setTimeout(() => setPriceInputProduct(selectedP), 50);
                                                            } else {
                                                                onQuickAdd(selectedP);
                                                                setTimeout(() => refocusSearchInput(), 50);
                                                            }
                                                        }
                                                    }
                                                }
                                            } else {
                                                // Modo Catálogo móvil: navegar el dropdown de sugerencias global con teclado
                                                if (e.key === 'Escape') {
                                                    setSearch('');
                                                    mobileSearchRef.current?.blur();
                                                } else if (catalogSearchResults.length > 0 && e.key === 'ArrowDown') {
                                                    e.preventDefault();
                                                    setSelectedIndex(prev => Math.min(prev + 1, catalogSearchResults.length - 1));
                                                } else if (catalogSearchResults.length > 0 && e.key === 'ArrowUp') {
                                                    e.preventDefault();
                                                    setSelectedIndex(prev => Math.max(prev - 1, 0));
                                                } else if (catalogSearchResults.length > 0 && (e.key === 'Enter' || e.code === 'NumpadEnter')) {
                                                    e.preventDefault();
                                                    const sel = catalogSearchResults[Math.min(selectedIndex, catalogSearchResults.length - 1)];
                                                    if (sel) {
                                                        const syntheticEvent = { stopPropagation: () => { } } as any;
                                                        handleCatalogAdd(sel, syntheticEvent);
                                                        // Seleccionar el texto para buscar el siguiente de inmediato
                                                        setTimeout(() => refocusSearchInput(), 50);
                                                    }
                                                }
                                            }
                                        }}
                                        autoFocus
                                        className="w-full h-10 rounded-xl border-none bg-gray-100 dark:bg-gray-800 pl-10 pr-10 text-gray-900 dark:text-white placeholder:text-gray-500 max-w-full min-w-0"
                                    />
                                    <button
                                        onClick={() => {
                                            if (isScannerMode) {
                                                if (scannerSearch) {
                                                    setScannerSearch('');
                                                } else {
                                                    setIsScannerSearchExpanded(false);
                                                }
                                            } else {
                                                if (search) {
                                                    setSearch('');
                                                    mobileSearchRef.current?.focus();
                                                } else {
                                                    setIsSearchExpanded(false);
                                                }
                                            }
                                        }}
                                        className="absolute inset-y-0 right-1 flex items-center pr-2"
                                    >
                                        <div className="size-5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 flex items-center justify-center">
                                            <span className="material-symbols-outlined text-[14px] font-bold">close</span>
                                        </div>
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => {
                                        if (isScannerMode) {
                                            setIsScannerSearchExpanded(true);
                                            setTimeout(() => scannerSearchRef.current?.focus(), 100);
                                        } else {
                                            setIsSearchExpanded(true);
                                            setTimeout(() => mobileSearchRef.current?.focus(), 100);
                                        }
                                    }}
                                    className="flex items-center gap-1.5 px-3 h-9 rounded-full text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-primary hover:text-primary transition-colors active:scale-95 shrink-0 shadow-sm"
                                >
                                    <span className="material-symbols-outlined text-[20px]">search</span>
                                    <span className="text-sm font-medium">Buscar</span>
                                </button>
                            )}

                            {/* Control de Mesas (móvil). Oculto en tablet (md+): allí va en el carrito derecho. */}
                            {!(isScannerMode ? isScannerSearchExpanded : isSearchExpanded) && isTablesEnabled && onSelectTable && onSelectQuickOrder && (
                                <TableSelectorControl
                                    mode={isQuickOrder ? 'quick' : 'table'}
                                    activeTableId={activeTableId}
                                    onSelectTable={onSelectTable}
                                    onSelectQuickOrder={onSelectQuickOrder}
                                    loadingTableId={loadingTableId}
                                    variant="sheet"
                                    className="shrink-0 md:hidden"
                                />
                            )}

                            {/* Botón Pedido (móvil). Se pinta al lado del dropdown de mesas si
                                están activas; si no, queda al lado del botón "Buscar". Se oculta
                                mientras el buscador está expandido (falta de espacio) y en modo
                                Escáner (isCatalogMode=false lo esconde solo). */}
                            {!(isScannerMode ? isScannerSearchExpanded : isSearchExpanded) && (
                                <div className="shrink-0 md:hidden">
                                    <ComandaLabelHeaderButton
                                        selection={comandaLabelSelection}
                                        onChange={(next) => onComandaLabelSelectionChange?.(next)}
                                        enabled={isComandaLabelShortcutEnabled}
                                        isCatalogMode={!isEanMode}
                                        compact
                                    />
                                </div>
                            )}

                            {/* Selector de modo (Escáner/Catálogo) removido: el modo es config
                                del negocio y se controla desde Ajustes → "Activar/Desactivar".
                                `isScannerMode` sigue sincronizado con `isEanMode` por efecto. */}

                            {/* Botón cámara — solo visible en modo escáner */}
                            {isScannerMode && !(isScannerSearchExpanded) && (
                                <button
                                    onClick={() => setIsCameraActive(v => !v)}
                                    className={`size-9 flex items-center justify-center rounded-full shrink-0 active:scale-95 transition-all border ${isCameraActive
                                        ? 'bg-amber-400 text-[#102218] border-amber-400 shadow-[0_4px_12px_rgba(251,191,36,0.4)]'
                                        : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                                    title={isCameraActive ? 'Apagar cámara' : 'Encender cámara'}
                                >
                                    <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                                </button>
                            )}

                        </div>

                        {/* Sugerencias del escáner (dropdown debajo del header) */}
                        {isScannerMode && showScannerSuggestions && scannerSuggestions.length > 0 && (
                            <div className="absolute left-0 right-0 top-[100%] mt-1 z-[60] bg-white dark:bg-gray-900 rounded-none shadow-xl border border-gray-200 dark:border-gray-700 flex flex-col">
                                <div className="max-h-[300px] overflow-y-auto w-full custom-scrollbar">
                                    {scannerSuggestions.map((product, index) => {
                                        const isSelected = selectedIndex === index;
                                        return (
                                            <button
                                                key={product.id}
                                                id={`mobile-suggestion-${product.id}`}
                                                onPointerDown={e => e.preventDefault()}
                                                onClick={() => {
                                                    setScannerSearch('');
                                                    setShowScannerSuggestions(false);
                                                    if (isWeightUnit(product.unit)) {
                                                        scannerSearchRef.current?.blur();
                                                        setTimeout(() => setPriceInputProduct(product), 50);
                                                    } else {
                                                        onQuickAdd(product);
                                                        setTimeout(() => refocusSearchInput(), 50);
                                                    }
                                                }}
                                                className={`w-full flex items-center gap-3 px-4 py-3 transition-colors border-b border-gray-50 dark:border-gray-800 last:border-0 ${isSelected ? 'bg-primary/10 ring-1 ring-inset ring-gray-900 dark:ring-gray-300' : 'hover:bg-gray-50 dark:hover:bg-gray-800 active:bg-gray-100 dark:active:bg-gray-700'}`}
                                            >
                                                <ProductThumb
                                                    src={product.image || (product as any).image_url}
                                                    className="size-8 rounded-lg bg-gray-50 shrink-0"
                                                    iconClassName="text-[16px] text-gray-400"
                                                />
                                                <div className="flex-1 text-left min-w-0">
                                                    <p className="text-sm font-semibold text-text-main dark:text-white truncate">{product.name}</p>
                                                    <p className="text-xs text-gray-400">${formatCurrency(product.price)}{product.is_secondary ? '' : ` / ${getUnitLabel(product.unit)}`}</p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Sugerencias del buscador GLOBAL en modo Catálogo (dropdown debajo del header) */}
                        {!isScannerMode && isSearchExpanded && search.trim() && catalogSearchResults.length > 0 && (
                            <div className="absolute left-0 right-0 top-[100%] mt-1 z-[60] bg-white dark:bg-gray-900 rounded-none shadow-xl border border-gray-200 dark:border-gray-700 flex flex-col">
                                <div className="max-h-[320px] overflow-y-auto w-full custom-scrollbar">
                                    {catalogSearchResults.map((product, index) => {
                                        const img = product.image || (product as any).image_url;
                                        const quantity = getCartQuantity(product.id);
                                        const isSelected = selectedIndex === index;
                                        return (
                                            <div
                                                key={product.id}
                                                id={`catalog-suggestion-${product.id}`}
                                                onPointerDown={e => e.preventDefault()}
                                                className={`w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-800 last:border-0 ${isSelected ? 'bg-primary/10 ring-1 ring-inset ring-gray-900/40 dark:ring-gray-300/40' : ''}`}
                                            >
                                                <button
                                                    onClick={(e) => { handleCatalogAdd(product, e); setTimeout(() => refocusSearchInput(), 50); }}
                                                    className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-70 transition-opacity"
                                                >
                                                    <ProductThumb
                                                        src={img}
                                                        fallbackIcon="restaurant"
                                                        className="size-9 rounded-lg bg-gray-50 dark:bg-gray-800 shrink-0"
                                                        iconClassName="text-[18px] text-gray-400"
                                                    />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-semibold text-text-main dark:text-white truncate">{product.name}</p>
                                                        <p className="text-xs text-gray-400">${formatCurrency(product.price)}{product.is_secondary ? '' : ` / ${getUnitLabel(product.unit)}`}</p>
                                                    </div>
                                                </button>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {quantity > 0 && (
                                                        <>
                                                            <button
                                                                onPointerDown={e => e.preventDefault()}
                                                                onClick={(e) => { e.stopPropagation(); handleMobileQuantityChange(product, -1, e); setTimeout(() => refocusSearchInput(), 50); }}
                                                                className="size-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-text-main dark:text-white active:scale-90 transition-transform"
                                                                aria-label={`Quitar uno de ${product.name}`}
                                                            >
                                                                <span className="material-symbols-outlined text-[20px]">remove</span>
                                                            </button>
                                                            <span className="min-w-[1.5rem] text-center text-sm font-bold text-text-main dark:text-white tabular-nums">{Math.round(quantity * 100) / 100}</span>
                                                        </>
                                                    )}
                                                    <button
                                                        onPointerDown={e => e.preventDefault()}
                                                        onClick={(e) => { handleCatalogAdd(product, e); setTimeout(() => refocusSearchInput(), 50); }}
                                                        className="size-8 flex items-center justify-center rounded-full bg-primary text-text-main shadow-sm active:scale-90 transition-transform"
                                                        aria-label={`Agregar ${product.name}`}
                                                    >
                                                        <span className="material-symbols-outlined text-[20px]">add</span>
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </header>
                )}

                {/* ================= MOBILE SEGMENTED CONTROL ================= */}


                {/* ================= OPEN TICKETS BAR (TABLET) ================= */}
                {/* Barra de tickets abiertos visible solo en tablet (md–lg) y en modo
                    catálogo. Permite saltar entre Orden Rápida y mesas con items sin
                    abrir ningún menú. Móvil tiene su control en el header, desktop en
                    el carrito lateral. */}
                {!isScannerMode && isTablesEnabled && onSelectTable && onSelectQuickOrder && (
                    <OpenTicketsBar
                        isQuickOrder={isQuickOrder}
                        activeTableId={activeTableId}
                        onSelectTable={onSelectTable}
                        onSelectQuickOrder={onSelectQuickOrder}
                        loadingTableId={loadingTableId}
                        className="hidden md:flex lg:hidden"
                    />
                )}

                {/* ================= DESKTOP HEADER ================= */}
                {/* Search (always visible) + Categories with expand/collapse */}
                <header className="hidden md:flex flex-col shrink-0 bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-800 px-6 pt-3 pb-3 z-10 transition-all duration-200 gap-3">
                    <div className="flex items-start gap-4 w-full min-w-0">
                        {isEanMode ? (
                            <div className="flex w-full max-w-[500px] h-10 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 transition-all shadow-sm relative">
                                {/* Custom Category Dropdown Trigger */}
                                <div className="relative shrink-0 border-r border-gray-200 dark:border-gray-700" ref={categoryMenuRef}>
                                    <button
                                        onClick={() => setIsEanCategoryMenuOpen(!isEanCategoryMenuOpen)}
                                        className="h-full px-4 flex items-center gap-2 text-sm font-semibold text-text-main dark:text-white hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors rounded-l-xl outline-none"
                                    >
                                        <span className="max-w-[120px] truncate">
                                            {activeCategory === 'all' ? 'Todas' : visibleCategories.find(c => c.id === activeCategory)?.name || 'Categoría'}
                                        </span>
                                        <span className="material-symbols-outlined text-[16px] text-gray-400 transition-transform duration-200" style={{ transform: isEanCategoryMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                                            expand_more
                                        </span>
                                    </button>

                                    {/* Dropdown Menu */}
                                    {isEanCategoryMenuOpen && (
                                        <div className="absolute top-[calc(100%+8px)] left-0 w-[240px] bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl z-50 flex flex-col animate-[fadeIn_0.15s_ease-out] overflow-hidden">
                                            <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-1">
                                                <button
                                                    onClick={() => {
                                                        setActiveCategory('all');
                                                        setIsEanCategoryMenuOpen(false);
                                                        setSearch('');
                                                        refocusSearchInput();
                                                    }}
                                                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${activeCategory === 'all' ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-semibold' : 'text-text-main dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 font-medium'}`}
                                                >
                                                    Todas las Categorías
                                                </button>
                                                {visibleCategories.map(cat => (
                                                    <button
                                                        key={cat.id}
                                                        onClick={() => {
                                                            setActiveCategory(cat.id);
                                                            setIsEanCategoryMenuOpen(false);
                                                            setSearch('');
                                                            refocusSearchInput();
                                                        }}
                                                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors mt-0.5 ${activeCategory === cat.id ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white font-semibold' : 'text-text-main dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 font-medium'}`}
                                                    >
                                                        {cat.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Search Input */}
                                <div className="flex-1 flex items-center px-3 relative">
                                    <span className="material-symbols-outlined text-gray-400 text-[18px]">search</span>
                                    <input
                                        ref={desktopSearchRef}
                                        type="text"
                                        placeholder="Buscar producto..."
                                        className="bg-transparent border-none focus:ring-0 text-base font-medium w-full text-text-main dark:text-white placeholder-text-secondary ml-2 p-0 h-full outline-none"
                                        value={search}
                                        onChange={(e) => {
                                            setSearch(e.target.value);
                                            setSidebarFocus('none');
                                        }}
                                        onKeyDown={(e) => {
                                            if (priceInputProduct) return; // modal de precio abierto: ignorar
                                            if (e.key === 'Escape') {
                                                setSearch('');
                                                desktopSearchRef.current?.blur();
                                            } else {
                                                handleSearchKeyDown(e);
                                            }
                                        }}
                                    />
                                    {search && (
                                        <button
                                            onClick={() => {
                                                setSearch('');
                                                desktopSearchRef.current?.focus();
                                            }}
                                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors ml-1 outline-none"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">close</span>
                                        </button>
                                    )}

                                    {/* EAN Mode: dropdown de sugerencias */}
                                    {search && filteredProducts.length > 0 && (
                                        <div className="absolute top-[calc(100%+8px)] left-0 right-0 z-[60] bg-gray-50/95 backdrop-blur-xl dark:bg-gray-900/95 rounded-2xl border border-gray-200/80 dark:border-gray-700 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.15)] flex flex-col animate-[fadeIn_0.15s_ease-out]">
                                            <div className="max-h-[320px] overflow-y-auto w-full custom-scrollbar p-1.5 flex flex-col gap-0.5">
                                                {filteredProducts.slice(0, 50).map((product, index) => {
                                                    const isSelected = selectedIndex === index;
                                                    return (
                                                        <button
                                                            key={product.id}
                                                            id={`desktop-suggestion-${product.id}`}
                                                            onPointerDown={(e) => e.preventDefault()}
                                                            onClick={() => {
                                                                if (isWeightUnit(product.unit)) {
                                                                    setPriceInputProduct(product);
                                                                } else {
                                                                    handleMobileQuantityChange(product, 1, { stopPropagation: () => { } } as any);
                                                                    setSearch('');
                                                                    setTimeout(() => refocusSearchInput(), 50);
                                                                }
                                                            }}
                                                            className={`w-full flex items-center gap-3 px-3 py-2.5 transition-all text-left rounded-xl border ${isSelected ? 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 shadow-md ring-1 ring-black/5 dark:ring-white/5 z-10' : 'border-transparent hover:bg-black/5 dark:hover:bg-white/5'}`}
                                                        >
                                                            <ProductThumb
                                                                src={product.image || (product as any).image_url}
                                                                className="size-9 rounded-lg bg-gray-100 dark:bg-gray-800 shrink-0"
                                                                iconClassName="text-[18px] text-gray-400"
                                                            />
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-semibold text-text-main dark:text-white truncate">{product.name}</p>
                                                                <p className="text-xs text-gray-400">${formatCurrency(product.price)}{product.is_secondary ? '' : ` / ${getUnitLabel(product.unit)}`}</p>
                                                            </div>
                                                            <span className="material-symbols-outlined text-[18px] text-gray-400 shrink-0">add_circle</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-2 items-center w-full">
                                {/* Search */}
                                <div className="relative shrink-0 w-[260px]">
                                    <div className="w-full h-9 flex items-center bg-white dark:bg-gray-800 rounded-lg px-3 border border-gray-200 dark:border-gray-700 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/10 shadow-sm transition-all">
                                        <span className="material-symbols-outlined text-gray-400 text-[18px]">search</span>
                                        <input
                                            ref={desktopSearchRef}
                                            type="text"
                                            placeholder="Buscar producto"
                                            className="bg-transparent border-none focus:ring-0 text-base font-medium w-full text-text-main dark:text-white placeholder-text-secondary ml-2 p-0 h-auto outline-none"
                                            value={search}
                                            onChange={(e) => {
                                                setSearch(e.target.value);
                                                setSidebarFocus('none');
                                            }}
                                            onKeyDown={(e) => {
                                                if (priceInputProduct) return;
                                                if (e.key === 'Escape') {
                                                    setSearch('');
                                                    desktopSearchRef.current?.blur();
                                                } else {
                                                    handleSearchKeyDown(e);
                                                }
                                            }}
                                        />
                                        {search && (
                                            <button
                                                onClick={() => {
                                                    setSearch('');
                                                    desktopSearchRef.current?.focus();
                                                }}
                                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors ml-1 outline-none"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">close</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Categories - inline with search, wrapping below when needed */}
                                {loading ? (
                                    <div className="animate-pulse flex gap-2">
                                        {[...Array(5)].map((_, i) => (
                                            <div key={`skeleton-${i}`} className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded-full shrink-0"></div>
                                        ))}
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            onPointerDown={(e) => e.preventDefault()}
                                            onClick={() => {
                                                setActiveCategory('all');
                                                setSearch('');
                                                refocusSearchInput();
                                            }}
                                            style={{ borderWidth: 0, outline: 'none' }}
                                            className={`flex items-center justify-center px-4 py-2 rounded-full text-xs font-semibold transition-all active:scale-95 select-none border-none ring-0 outline-none
                                            ${activeCategory === 'all'
                                                    ? 'bg-primary text-text-main shadow-sm shadow-primary/20 dark:shadow-none'
                                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                                        >
                                            Todos
                                        </button>
                                        {hasFavorites && (
                                            <button
                                                onPointerDown={(e) => e.preventDefault()}
                                                onClick={() => {
                                                    setActiveCategory(FAVORITES_ID);
                                                    setSearch('');
                                                    refocusSearchInput();
                                                }}
                                                style={{ borderWidth: 0, outline: 'none' }}
                                                className={`flex items-center justify-center gap-1 px-4 py-2 rounded-full text-xs font-semibold transition-all active:scale-95 select-none border-none ring-0 outline-none
                                                ${activeCategory === FAVORITES_ID
                                                        ? 'bg-emerald-700 text-white shadow-sm shadow-emerald-700/20 dark:shadow-none'
                                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                                            >
                                                <span
                                                    className="material-symbols-outlined text-[14px]"
                                                    style={{ fontVariationSettings: "'FILL' 1" }}
                                                >
                                                    star
                                                </span>
                                                Favoritos
                                            </button>
                                        )}
                                        {visibleCategories.map(cat => (
                                            <button
                                                key={cat.id}
                                                onPointerDown={(e) => e.preventDefault()}
                                                onClick={() => {
                                                    setActiveCategory(cat.id);
                                                    setSearch('');
                                                    refocusSearchInput();
                                                }}
                                                style={{ borderWidth: 0, outline: 'none' }}
                                                className={`flex items-center justify-center px-4 py-2 rounded-full text-xs font-semibold transition-all active:scale-95 select-none border-none ring-0 outline-none
                                                ${activeCategory === cat.id
                                                        ? 'bg-primary text-text-main shadow-sm shadow-primary/20 dark:shadow-none'
                                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                                            >
                                                {cat.name}
                                            </button>
                                        ))}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </header>



                {/* ================= SCANNER MODE (Mobile Only) ================= */}
                {isScannerMode && (
                    <div className="md:hidden flex flex-col h-full overflow-hidden bg-white dark:bg-surface-dark animate-[fadeIn_0.2s_ease-out]">

                        {/* Visor de cámara (Solo visible si isCameraActive) */}
                        {isCameraActive && (
                            <div className="shrink-0" style={{ height: '28vh' }}>
                                <BarcodeScanner
                                    ref={barcodeScannerRef}
                                    onScan={handleScannerBarcode}
                                    onClose={() => setIsCameraActive(false)}
                                    variant="embedded"
                                    continuousMode={true}
                                />
                            </div>
                        )}

                        {/* Lista del carrito escaneado */}
                        <div className="flex-1 overflow-y-auto pb-24">
                            {cart.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center p-6 opacity-50">
                                    <span className="material-symbols-outlined text-4xl text-gray-300 mb-2">barcode_scanner</span>
                                    <p className="text-sm text-gray-400">Escanea un producto para comenzar</p>
                                </div>
                            ) : (
                                [...cart].reverse().map(item => {
                                    const unitLabel = getUnitLabel(item.unit);
                                    const itemDiscount = item.discount
                                        ? item.discount
                                        : item.discountPercent
                                            ? Math.round(item.price * item.quantity * item.discountPercent / 100)
                                            : 0;
                                    const itemTotal = Math.round(Math.max(0, item.price * item.quantity - itemDiscount));
                                    return (
                                        <div
                                            key={item.orderItemId || `scanner-${item.id}`}
                                            className="flex items-stretch border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-surface-dark active:bg-gray-50 dark:active:bg-gray-800 transition-colors cursor-pointer select-none"
                                            onClick={() => setScannerItemEditor(item)}
                                        >
                                            {/* Imagen + Badge cantidad */}
                                            <div className="relative shrink-0 flex items-center justify-center p-2 pl-3">
                                                <ProductThumb
                                                    src={item.image}
                                                    alt={item.name}
                                                    fit="cover"
                                                    className="size-[52px] rounded-xl bg-gray-100 dark:bg-gray-800 shrink-0"
                                                    iconClassName="text-[22px] text-gray-400"
                                                />
                                                {/* Badge cantidad */}
                                                <div className="absolute top-1 left-2 min-w-[20px] h-5 px-1 bg-gray-900 dark:bg-white rounded-full flex items-center justify-center shadow-sm">
                                                    <span className="text-[10px] font-black text-white dark:text-gray-900 leading-none">
                                                        {Math.round(item.quantity * 100) / 100}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Info del producto */}
                                            <div className="flex-1 flex flex-col justify-center py-3 px-2 min-w-0">
                                                <div className="flex items-start justify-between gap-2">
                                                    <p className="text-sm font-bold text-text-main dark:text-white leading-tight flex-1 line-clamp-2">{item.name}</p>
                                                    <span className="text-sm font-black text-gray-900 dark:text-white shrink-0">${formatCurrency(itemTotal)}</span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                    <span className="flex items-center gap-1 text-xs text-gray-500">
                                                        <span className="material-symbols-outlined text-[14px] text-primary">paid</span>
                                                        ${formatCurrency(item.price)}
                                                    </span>
                                                    {item.stock != null && (
                                                        <span className="flex items-center gap-1 text-xs text-gray-500">
                                                            <span className="material-symbols-outlined text-[14px]">inventory_2</span>
                                                            {Math.round(item.stock * 100) / 100}{item.is_secondary ? '' : ` ${unitLabel}`}
                                                        </span>
                                                    )}
                                                    {/* Descuento aplicado */}
                                                    {itemDiscount > 0 && (
                                                        <span className="flex items-center gap-0.5 text-xs font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-1.5 py-0.5 rounded-md">
                                                            <span className="material-symbols-outlined text-[12px]">sell</span>
                                                            {item.discountPercent ? `-${item.discountPercent}%` : `-$${formatCurrency(item.discount!)}`}
                                                        </span>
                                                    )}
                                                    {/* Botón eliminar */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            removeFromCart(item);
                                                        }}
                                                        className="ml-auto size-7 flex items-center justify-center rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 active:scale-95 transition-transform"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">delete</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Botón Procesar Pago */}
                        {cart.length > 0 && (
                            <div className="absolute bottom-0 left-0 right-0 z-20 p-3 bg-white dark:bg-surface-dark border-t border-gray-100 dark:border-gray-800 md:hidden">
                                <button
                                    onClick={() => { sessionStorage.setItem('bistro_payment_skip_summary', 'true'); onNavigate(Screen.PAYMENT); }}
                                    className="w-full min-h-[56px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-bold text-sm flex items-center px-4 active:scale-[0.98] transition-all focus:outline-none"
                                >
                                    {/* Cantidad + total a la izquierda */}
                                    <div className="flex flex-col items-start shrink-0 mr-3 gap-1">
                                        <span className="text-[10px] font-semibold opacity-60 leading-none uppercase tracking-wide">{badgeCount} items</span>
                                        <span className="text-base font-black text-primary leading-tight">${formatCurrency(total)}</span>
                                    </div>
                                    {/* Texto centrado */}
                                    <span className="flex-1 text-center font-bold text-sm">Procesar Pago</span>
                                    {/* Flecha al final */}
                                    <span className="material-symbols-outlined text-primary text-[20px] shrink-0 ml-3">arrow_forward</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ================= MOBILE CATALOG (≤767px) ================= */}
                {/* Pantalla limpia: categorías fijas arriba, carrito que se va llenando, pago directo.
                    Los productos se eligen desde el bottom sheet que abre cada categoría. */}
                {!isScannerMode && (
                    <div className="md:hidden flex flex-col flex-1 min-h-0 overflow-hidden bg-[#f8faf9] dark:bg-[#0d1c14] animate-[fadeIn_0.2s_ease-out]">

                        {/* Categorías fijas. Por defecto expandidas; el toggle "Ver/Ocultar" colapsa a una
                            sola fila para liberar espacio en el carrito.
                            El botón se FLOTA a la derecha: los chips fluyen a su alrededor solo en la fila 1
                            y de la fila 2 en adelante usan el 100% del ancho. Los chips no se truncan
                            (whitespace-nowrap → si no cabe junto al botón, baja entero a la fila siguiente).
                            El botón tiene ancho fijo para que "Ver" y "Ocultar" ocupen lo mismo (sin saltos). */}
                        <div className="shrink-0 bg-surface-light dark:bg-surface-dark border-b border-gray-100 dark:border-gray-800 px-3 pt-3 pb-2.5 shadow-sm">
                            <div
                                ref={mobileCatBarRef}
                                className={`${isCatCollapsed ? 'overflow-hidden max-h-[1.9rem]' : ''}`}
                            >
                                {showCatToggle && (
                                    <button
                                        onClick={() => setIsCatCollapsed(v => !v)}
                                        className="float-right ml-2 h-7 w-[88px] flex items-center justify-center gap-0.5 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-xs font-bold text-gray-600 dark:text-gray-300 shadow-sm whitespace-nowrap hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-800 dark:hover:text-gray-100 active:scale-95 transition-all"
                                        aria-label={isCatCollapsed ? 'Ver todas las categorías' : 'Ocultar categorías'}
                                    >
                                        {isCatCollapsed ? 'Ver' : 'Ocultar'}
                                        <span
                                            className="material-symbols-outlined text-[16px] transition-transform duration-200"
                                            style={{ transform: isCatCollapsed ? 'none' : 'rotate(180deg)' }}
                                        >
                                            expand_more
                                        </span>
                                    </button>
                                )}
                                {hasFavorites && (
                                    <button
                                        onClick={() => handleOpenCatalogSheet(FAVORITES_ID)}
                                        className={`inline-flex align-top items-center gap-1 mr-2 mb-2 whitespace-nowrap px-3 py-1.5 rounded-full text-xs transition-colors outline-none border-none
                                            ${activeCategory === FAVORITES_ID
                                                ? 'bg-emerald-700 text-white font-bold shadow-sm shadow-emerald-700/20 dark:shadow-none'
                                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                                    >
                                        <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>star</span>
                                        Favoritos
                                    </button>
                                )}
                                {visibleCategories.map(cat => (
                                    <button
                                        key={cat.id}
                                        onClick={() => handleOpenCatalogSheet(cat.id)}
                                        className={`inline-flex align-top items-center mr-2 mb-2 whitespace-nowrap px-3 py-1.5 rounded-full text-xs transition-colors outline-none border-none
                                            ${activeCategory === cat.id
                                                ? 'bg-primary text-text-main font-bold shadow-sm shadow-primary/20 dark:shadow-none'
                                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                                    >
                                        {cat.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Carrito (el espacio limpio que se va llenando) — solo móvil; en tablet el carrito va a la derecha */}
                        <div className="md:hidden flex-1 overflow-y-auto custom-scrollbar px-3 py-3 space-y-1">
                            {cart.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center px-8">
                                    <div className="bg-gray-100 dark:bg-gray-800 rounded-full p-4 mb-3">
                                        <span className="material-symbols-outlined text-4xl text-gray-400">category</span>
                                    </div>
                                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-1">Elige una categoría</p>
                                    <p className="text-xs text-gray-400 max-w-[220px]">Selecciona una categoría arriba para ver sus productos y agregarlos</p>
                                </div>
                            ) : (
                                (() => {
                                    const topItems = [...cart].filter(it => !it.parentOrderItemId).reverse();
                                    const renderRow = (item: CartItem, index: number) => {
                                        const children = cart.filter(c => c.parentOrderItemId === item.orderItemId);
                                        return (
                                            <CartItemRow
                                                key={item.orderItemId || `catalog-${item.id}-${index}-${item.cookingTerm || ''}-${(item.removedIngredients || []).join(',')}`}
                                                item={item}
                                                index={index}
                                                onRemove={() => { removeFromCart(item); }}
                                                onUpdateQuantity={(delta) => { updateQuantity(item, delta); children.forEach(c => updateQuantity(c, delta)); }}
                                                onEditProduct={() => onEditProduct(item)}
                                                onDiscount={() => setDiscountItem(item)}
                                                defaultExpanded={true}
                                                flat={true}
                                                readOnly={tablesReadOnly}
                                                modifierTags={children.map(c => c.name)}
                                                extraAmount={children.reduce((s, c) => s + c.price * c.quantity, 0)}
                                                forceExpanded={!!expandedCartItemId && !!item.orderItemId && item.orderItemId === expandedCartItemId}
                                                onExpandChange={(expanded) => {
                                                    if (!expanded && item.orderItemId === expandedCartItemId) {
                                                        onExpandChange?.(null);
                                                    }
                                                }}
                                            />
                                        );
                                    };

                                    if (isQuickOrder || !hasSentItems) {
                                        return topItems.map((item, index) => renderRow(item, index));
                                    }

                                    const newItems = topItems.filter(it => !SENT_STATUSES.includes(it.status || 'pending'));
                                    const sentItems = topItems.filter(it => SENT_STATUSES.includes(it.status || ''));
                                    let idx = 0;
                                    return (
                                        <>
                                            {newItems.map(item => renderRow(item, idx++))}
                                            <div className="flex items-center gap-2 py-2">
                                                <div className="flex-1 h-px bg-slate-200 dark:bg-gray-700" />
                                                <span className="text-[11px] font-semibold text-slate-400">Comanda enviada</span>
                                                <div className="flex-1 h-px bg-slate-200 dark:bg-gray-700" />
                                            </div>
                                            {sentItems.map(item => renderRow(item, idx++))}
                                        </>
                                    );
                                })()
                            )}
                        </div>

                        {/* Barra inferior: Enviar Comanda (mesa) + Procesar Pago (si tiene permiso) — solo móvil; en tablet va en el carrito derecho */}
                        {cart.length > 0 && (
                            <div className="md:hidden shrink-0 p-3 bg-white dark:bg-surface-dark border-t border-gray-100 dark:border-gray-800 shadow-[0_-10px_40px_rgba(0,0,0,0.08)] animate-[slideUp_0.2s_ease-out]">
                                {!isQuickOrder && puedeCobrar ? (
                                    /* Modo mesa con permiso de cobro: ambas acciones en una sola fila (ahorra espacio) */
                                    <div className="flex items-stretch gap-2">
                                        <button
                                            onClick={() => { if (!tablesGate.verifyCanWriteNow()) { showToast(tablesGate.readOnlyMessage ?? 'Mesas en solo lectura sin conexión', 'warning'); return; } onSendCommanda?.(); }}
                                            disabled={!hasPendingNewItems || tablesReadOnly}
                                            className="flex-1 min-h-[52px] rounded-xl bg-[#102218] text-white font-bold text-sm flex items-center justify-center gap-1.5 px-2 active:scale-[0.98] transition-all disabled:opacity-40"
                                        >
                                            <span className="material-symbols-outlined text-[19px]">print</span>
                                            <span className="truncate">Comanda</span>
                                        </button>
                                        <button
                                            onClick={() => { sessionStorage.setItem('bistro_payment_skip_summary', 'true'); onNavigate(Screen.PAYMENT); }}
                                            className="flex-1 min-h-[52px] rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-bold text-sm flex items-center justify-center gap-1.5 px-2 active:scale-[0.98] transition-all"
                                        >
                                            <span className="truncate">Cobrar</span>
                                            <span className="font-black text-primary">${formatCurrency(total)}</span>
                                            <span className="material-symbols-outlined text-primary text-[18px] shrink-0">arrow_forward</span>
                                        </button>
                                    </div>
                                ) : (
                                    /* Una sola acción a ancho completo */
                                    <div className="flex flex-col gap-2">
                                        {!isQuickOrder && (
                                            <button
                                                onClick={() => { if (!tablesGate.verifyCanWriteNow()) { showToast(tablesGate.readOnlyMessage ?? 'Mesas en solo lectura sin conexión', 'warning'); return; } onSendCommanda?.(); }}
                                                disabled={!hasPendingNewItems || tablesReadOnly}
                                                className="w-full min-h-[48px] rounded-xl bg-[#102218] text-white font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-40"
                                            >
                                                <span className="material-symbols-outlined text-[20px]">print</span>
                                                Enviar Comanda
                                            </button>
                                        )}
                                        {puedeCobrar ? (
                                            <button
                                                onClick={() => { sessionStorage.setItem('bistro_payment_skip_summary', 'true'); onNavigate(Screen.PAYMENT); }}
                                                className="w-full min-h-[56px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-bold text-sm flex items-center px-4 active:scale-[0.98] transition-all focus:outline-none"
                                            >
                                                <div className="flex flex-col items-start shrink-0 mr-3 gap-1">
                                                    <span className="text-[10px] font-semibold opacity-60 leading-none uppercase tracking-wide">{badgeCount} items</span>
                                                    <span className="text-base font-black text-primary leading-tight">${formatCurrency(total)}</span>
                                                </div>
                                                <span className="flex-1 text-center font-bold text-sm">Procesar Pago</span>
                                                <span className="material-symbols-outlined text-primary text-[20px] shrink-0 ml-3">arrow_forward</span>
                                            </button>
                                        ) : (
                                            <button
                                                disabled
                                                title={tablesReadOnly ? (tablesGate.readOnlyMessage ?? 'Mesas en solo lectura') : 'No tienes permiso para finalizar ventas'}
                                                className="w-full min-h-[56px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-bold text-sm flex items-center px-4 opacity-50 cursor-not-allowed focus:outline-none"
                                            >
                                                <div className="flex flex-col items-start shrink-0 mr-3 gap-1">
                                                    <span className="text-[10px] font-semibold opacity-60 leading-none uppercase tracking-wide">{badgeCount} items</span>
                                                    <span className="text-base font-black text-primary leading-tight">${formatCurrency(total)}</span>
                                                </div>
                                                <span className="flex-1 text-center font-bold text-sm">Procesar Pago</span>
                                                <span className="material-symbols-outlined text-[20px] shrink-0 ml-3">lock</span>
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ================= CONTENT AREA ================= */}
                <div
                    /* En móvil (<768px) ambos modos usan bloques dedicados; esta área es solo tablet/desktop */
                    className={`flex-1 flex-col min-h-0 bg-[#f8faf9] dark:bg-[#0d1c14] p-2 md:p-0 pb-24 md:pb-32 lg:pb-4 relative overflow-y-auto custom-scrollbar hidden md:flex`}
                    onScroll={handleScroll}
                >


                    {loading ? (
                        /* Contenedor invisible para prevenir salto agresivo;
                           los productos reales entrarán con un efecto fluido animate-slideInUpSubtle */
                        <div className="flex-1 min-h-[50vh] w-full" />
                    ) : filteredProducts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center flex-1 text-center p-8">
                            <div className="bg-gray-100 dark:bg-gray-800 rounded-full p-4 mb-4">
                                <span className="material-symbols-outlined text-4xl text-gray-400">{search ? 'search_off' : 'inventory_2'}</span>
                            </div>
                            <p className="text-gray-600 dark:text-gray-400 font-semibold text-sm mb-1">
                                {search ? 'Sin resultados' : 'Sin productos'}
                            </p>
                            <p className="text-gray-400 text-xs max-w-[200px]">
                                {search ? `No encontramos productos con "${search}"` : 'No hay productos en esta categoría'}
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full">
                            {/* MOBILE & TABLET CATEGORY + SEARCH - Only in Products View */}
                            {viewMode === 'products' && (
                                <div className={`md:hidden bg-surface-light dark:bg-surface-dark border-b border-gray-100 dark:border-gray-800 shrink-0 z-20 shadow-sm transition-all duration-300 ${isSearchExpanded || search ? 'py-0 border-none' : 'pt-4 pb-0'}`}>
                                    {/* Barra de búsqueda móvil */}


                                    {/* Categorías (ocultas cuando hay búsqueda activa) */}
                                    <div
                                        className={`transition-all duration-300 ease-in-out overflow-hidden
                                        ${isSearchExpanded || search
                                                ? 'max-h-0 opacity-0'
                                                : 'max-h-[500px] opacity-100'
                                            }`}
                                    >
                                        {loading ? (
                                            <div className="flex flex-wrap gap-2 w-full animate-pulse px-4">
                                                {[...Array(6)].map((_, i) => (
                                                    <div key={`skeleton-${i}`} className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded-full shrink-0"></div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="px-4 flex items-start gap-1 w-full min-w-0">
                                                <div ref={categoryListRef} className="flex gap-2 items-center flex-1 overflow-x-auto pb-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-gray-600 [&::-webkit-scrollbar-thumb]:rounded-full [scrollbar-width:thin] [scrollbar-color:#d1d5db_transparent] dark:[scrollbar-color:#4b5563_transparent]"
                                                    onWheel={(e) => {
                                                        if (e.deltaY !== 0) {
                                                            e.currentTarget.scrollLeft += e.deltaY;
                                                        }
                                                    }}
                                                >
                                                    <button
                                                        onPointerDown={(e) => e.preventDefault()}
                                                        onClick={() => {
                                                            setActiveCategory('all');
                                                            setSearch('');
                                                            refocusSearchInput();
                                                        }}
                                                        style={{ borderWidth: 0, outline: 'none' }}
                                                        className={`px-3 py-1.5 rounded-full text-xs transition-colors shrink-0 outline-none border-none ring-0
                                                    ${activeCategory === 'all'
                                                                ? 'bg-primary text-text-main font-bold shadow-sm shadow-primary/20 dark:shadow-none'
                                                                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                                                    >
                                                        Todos
                                                    </button>
                                                    {hasFavorites && (
                                                        <button
                                                            onPointerDown={(e) => e.preventDefault()}
                                                            onClick={() => {
                                                                setActiveCategory(FAVORITES_ID);
                                                                setSearch('');
                                                                refocusSearchInput();
                                                            }}
                                                            style={{ borderWidth: 0, outline: 'none' }}
                                                            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs transition-colors shrink-0 outline-none border-none ring-0
                                                        ${activeCategory === FAVORITES_ID
                                                                    ? 'bg-emerald-700 text-white font-bold shadow-sm shadow-emerald-700/20 dark:shadow-none'
                                                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                                                        >
                                                            <span
                                                                className="material-symbols-outlined text-[14px]"
                                                                style={{ fontVariationSettings: "'FILL' 1" }}
                                                            >
                                                                star
                                                            </span>
                                                            Favoritos
                                                        </button>
                                                    )}
                                                    {visibleCategories.map(cat => (
                                                        <button
                                                            key={cat.id}
                                                            onPointerDown={(e) => e.preventDefault()}
                                                            onClick={() => {
                                                                setActiveCategory(cat.id);
                                                                setSearch('');
                                                                refocusSearchInput();
                                                            }}
                                                            style={{ borderWidth: 0, outline: 'none' }}
                                                            className={`px-3 py-1.5 rounded-full text-xs transition-colors shrink-0 outline-none border-none ring-0
                                                        ${activeCategory === cat.id
                                                                    ? 'bg-primary text-text-main font-bold shadow-sm shadow-primary/20 dark:shadow-none'
                                                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                                                        >
                                                            {cat.name}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* MOBILE & TABLET GRID VIEW (< 1024px) - Sin paginación, scroll natural */}
                            {viewMode === 'products' ? (
                                <div className={`grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] ${isEanMode ? 'md:hidden lg:hidden' : 'lg:hidden'} gap-[8px] sm:gap-[12px] auto-rows-fr px-[12px] pt-4 pb-4 md:pb-44`}>
                                    {displayedProducts.map((product, index) => {
                                        const quantity = getCartQuantity(product.id);
                                        // Determinar si hay una búsqueda activa (móvil: search tiene texto, desktop: isSearchExpanded)
                                        const hasActiveSearch = search || isSearchExpanded;
                                        const isKeyboardFocused = isKeyboardNav && index === selectedIndex;
                                        const isPulsing = pulsingProduct === product.id;
                                        return (
                                            <div
                                                key={product.id}
                                                id={`product-card-${product.id}`}
                                                // Prevent focus loss on search
                                                onPointerDown={(e) => {
                                                    setIsKeyboardNav(false);
                                                    handlePulse(product.id);
                                                    e.preventDefault();
                                                }}
                                                onClick={(e) => {
                                                    setIsKeyboardNav(false);
                                                    if (isWeightUnit(product.unit)) {
                                                        e.stopPropagation();
                                                        setPriceInputProduct(product);
                                                    } else {
                                                        handleMobileQuantityChange(product, 1, e);
                                                    }
                                                    refocusSearchInput();
                                                }}
                                                style={{
                                                    animationDelay: `${index * 30}ms`,
                                                    transform: isPulsing ? 'scale(0.98) translateY(1.5px)' : isKeyboardFocused ? 'scale(1.02)' : 'none',
                                                    transition: 'transform 100ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 100ms, border-color 100ms'
                                                }}
                                                className={`bg-white dark:bg-surface-dark rounded-[16px] w-full max-w-none mx-auto shadow-sm border flex flex-col overflow-hidden p-[8px] cursor-pointer select-none group ${
                                                    isPulsing
                                                        ? 'border-primary ring-1 ring-primary/60 shadow-none z-10'
                                                        : isKeyboardFocused
                                                            ? 'border-primary ring-2 ring-primary/50 z-10'
                                                            : 'border-gray-100 dark:border-gray-800 hover:border-primary/50 hover:shadow-md'
                                                }`}
                                            >
                                                {/* Image - Uses Aspect Ratio to prevent deformation */}
                                                {/* Image - Uses Aspect Ratio 1:1 and object-contain to avoid cropping */}
                                                <div className="w-full aspect-square rounded-[12px] bg-gray-50 dark:bg-gray-800 relative shrink-0 overflow-hidden flex items-center justify-center cursor-pointer select-none">
                                                    {!String(product.id).startsWith('promo_') && (
                                                        <button
                                                            onPointerDown={(e) => e.preventDefault()}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                                window.dispatchEvent(new CustomEvent('favorite-toggled', { detail: { productId: product.id, value: !(product as any).is_favorite } }));
                                                            }}
                                                            className="absolute top-1.5 left-1.5 z-20 size-6 flex items-center justify-center rounded-full bg-white/80 dark:bg-black/50 backdrop-blur-sm shadow-sm active:scale-90 transition-transform cursor-pointer"
                                                            aria-label={(product as any).is_favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                                                        >
                                                            <span
                                                                className={`material-symbols-outlined text-[16px] ${(product as any).is_favorite ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}
                                                                style={{ fontVariationSettings: `'FILL' ${(product as any).is_favorite ? 1 : 0}` }}
                                                            >
                                                                star
                                                            </span>
                                                        </button>
                                                    )}
                                                    {(product.image || (product as any).image_url) ? (
                                                        <img
                                                            src={product.image || (product as any).image_url}
                                                            alt={product.name}
                                                            loading="lazy"
                                                            decoding="async"
                                                            className="w-full h-full object-contain pointer-events-none"
                                                            crossOrigin="anonymous"
                                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.querySelector('.placeholder-icon')?.classList.remove('hidden'); }}
                                                        />
                                                    ) : null}
                                                    <div className={`placeholder-icon flex flex-col items-center justify-center absolute inset-0 pointer-events-none ${(product.image || (product as any).image_url) ? 'hidden' : ''}`}>
                                                        <span className="material-symbols-outlined text-[32px] text-gray-300 dark:text-gray-600">restaurant</span>
                                                    </div>

                                                    {/* Price Badge (Top Right - inside image) */}
                                                    <div
                                                        className={`absolute top-1.5 right-1.5 backdrop-blur-sm px-2 py-0.5 rounded-md text-[11px] font-bold shadow-sm z-10 box-border cursor-pointer select-none ${isWeightUnit(product.unit) ? 'bg-emerald-50 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-700/50 text-emerald-900 dark:text-emerald-100 active:scale-95 transition-transform' : 'bg-black/70 border border-transparent text-white'}`}
                                                        onPointerDown={isWeightUnit(product.unit) && hasActiveSearch ? (e) => e.preventDefault() : undefined}
                                                        onClick={isWeightUnit(product.unit) ? (e) => {
                                                            e.stopPropagation();
                                                            setPriceInputProduct(product);
                                                        } : undefined}
                                                    >
                                                        ${formatCurrency(product.price)}
                                                        {isWeightUnit(product.unit) && <span className="text-[9px] font-medium text-emerald-600 dark:text-emerald-300 ml-0.5">/{getUnitLabel(product.unit)}</span>}
                                                    </div>

                                                </div>
                                                {/* Info */}
                                                <div className="pt-2.5 flex flex-col gap-1.5 flex-1 min-h-0 cursor-pointer select-none">
                                                    <h3 className="font-normal text-[#111814] dark:text-white text-[12px] sm:text-[14px] leading-tight line-clamp-3 px-0.5 cursor-pointer select-none">
                                                        {product.name}
                                                    </h3>

                                                    <div className="flex items-center justify-between mt-auto">
                                                        {/* Remove Button */}
                                                        <button
                                                            onPointerDown={(e) => hasActiveSearch && e.preventDefault()}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleMobileQuantityChange(product, -1, e);
                                                                if (hasActiveSearch) refocusSearchInput();
                                                            }}
                                                            className={`size-[28px] flex items-center justify-center rounded-[8px] transition-colors ${quantity > 0
                                                                ? 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 border border-red-100 dark:border-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/40 cursor-pointer active:scale-90'
                                                                : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 border border-transparent opacity-50 cursor-not-allowed'
                                                                }`}
                                                            disabled={quantity === 0}
                                                            aria-label="Quitar producto"
                                                        >
                                                            <span className="material-symbols-outlined text-[16px]">remove</span>
                                                        </button>

                                                        {/* Quantity Display */}
                                                        <span
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedIndex(index);
                                                                setQuantityInputProduct(product);
                                                            }}
                                                            className={`px-3 py-1.5 -my-1.5 text-[15px] font-black tabular-nums min-w-[32px] flex items-center justify-center text-center select-none transition-colors cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 rounded ${quantity > 0 ? 'text-primary-text dark:text-primary' : 'text-gray-300 dark:text-gray-600'}`}
                                                        >
                                                            {Math.round(quantity * 100) / 100}
                                                        </span>

                                                        {/* Add Button */}
                                                        <button
                                                            onPointerDown={(e) => {
                                                                setIsKeyboardNav(false);
                                                                handlePulse(product.id);
                                                                if (hasActiveSearch) e.preventDefault();
                                                            }}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleMobileQuantityChange(product, 1, e);
                                                                if (hasActiveSearch) refocusSearchInput();
                                                            }}
                                                            className="size-[28px] flex items-center justify-center rounded-[8px] bg-primary text-[#102218] hover:bg-primary/80 active:scale-90 transition-all font-bold cursor-pointer"
                                                            aria-label="Agregar producto"
                                                        >
                                                            <span className="material-symbols-outlined text-[16px]">add</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                /* CATEGORIES VIEW (Mobile Only - Proposal E5) */
                                <div className="lg:hidden flex flex-col gap-2 p-4 animate-[fadeIn_0.3s]">
                                    {visibleCategories.map(cat => (
                                        <div
                                            key={cat.id}
                                            onClick={() => {
                                                setActiveCategory(cat.id);
                                                setSearch(''); // Clear search
                                                setViewMode('products');
                                            }}
                                            className="bg-white dark:bg-surface-dark p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex items-center justify-between hover:border-primary cursor-pointer active:scale-[0.99] transition-all group"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div>
                                                    <h3 className="font-semibold text-sm text-text-main dark:text-white">{cat.name}</h3>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-medium text-gray-400">{categoryCounts[cat.id] || 0}</span>
                                                <span className="material-symbols-outlined text-gray-300 dark:text-gray-600 text-[18px]">chevron_right</span>
                                            </div>
                                        </div>
                                    ))}
                                    {/* All Categories Option */}
                                    <div
                                        onClick={() => {
                                            setActiveCategory('all');
                                            setSearch(''); // Clear search
                                            setViewMode('products');
                                        }}
                                        className="bg-white dark:bg-surface-dark p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex items-center justify-between hover:border-primary cursor-pointer active:scale-[0.99] transition-all group"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div>
                                                <h3 className="font-semibold text-sm text-text-main dark:text-white">Todos los Productos</h3>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-medium text-gray-400">{products.length}</span>
                                            <span className="material-symbols-outlined text-gray-300 dark:text-gray-600 text-[18px]">chevron_right</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* DESKTOP GRID VIEW (> 1024px) */}
                            <div className={`${isEanMode ? 'hidden' : 'hidden lg:grid'} grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-[12px] overflow-y-auto p-[7px] w-full max-w-full flex-1 min-h-0 content-start`}>
                                {displayedProducts.map((product, index) => {
                                    const quantity = getCartQuantity(product.id);
                                    const isKeyboardFocused = isKeyboardNav && index === selectedIndex;
                                    const isPulsing = pulsingProduct === product.id;
                                    return (
                                        <div
                                            key={product.id}
                                            id={`product-card-${product.id}`}
                                            onClick={(e) => {
                                                setIsKeyboardNav(false);
                                                if (isWeightUnit(product.unit)) {
                                                    e.stopPropagation();
                                                    setPriceInputProduct(product);
                                                } else {
                                                    handleMobileQuantityChange(product, 1, e);
                                                }
                                                refocusSearchInput();
                                            }}
                                            onPointerDown={(e) => {
                                                setIsKeyboardNav(false);
                                                handlePulse(product.id);
                                                e.preventDefault();
                                            }}
                                            style={{
                                                animationDelay: `${index * 30}ms`,
                                                transform: isPulsing ? 'scale(0.98) translateY(1.5px)' : isKeyboardFocused ? 'scale(1.02)' : 'none',
                                                transition: 'transform 100ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 100ms, border-color 100ms'
                                            }}
                                            className={`bg-white dark:bg-surface-dark rounded-[21px] p-[13px] shadow-lg shadow-gray-200/50 dark:shadow-none border flex flex-col h-auto cursor-pointer select-none group relative ${
                                                isPulsing
                                                    ? 'border-primary ring-1 ring-primary/60 shadow-sm z-10'
                                                    : isKeyboardFocused
                                                        ? 'border-primary ring-2 ring-primary/50 z-10 hover:shadow-md'
                                                        : 'border-gray-100 dark:border-gray-800 hover:border-primary/50 hover:shadow-md'
                                            }`}
                                        >
                                            {/* Image Area */}
                                            <div className="aspect-square w-full max-h-[200px] rounded-[15px] overflow-hidden relative mb-3 group-hover:shadow-md transition-all bg-gray-50 dark:bg-gray-800/50 cursor-pointer select-none">
                                                {!String(product.id).startsWith('promo_') && (
                                                    <button
                                                        onPointerDown={(e) => e.preventDefault()}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            e.preventDefault();
                                                            window.dispatchEvent(new CustomEvent('favorite-toggled', { detail: { productId: product.id, value: !(product as any).is_favorite } }));
                                                        }}
                                                        className="absolute top-2 left-2 z-20 size-7 flex items-center justify-center rounded-full bg-white/80 dark:bg-black/50 backdrop-blur-sm shadow-sm active:scale-90 transition-transform cursor-pointer"
                                                        aria-label={(product as any).is_favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                                                    >
                                                        <span
                                                            className={`material-symbols-outlined text-[18px] ${(product as any).is_favorite ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}
                                                            style={{ fontVariationSettings: `'FILL' ${(product as any).is_favorite ? 1 : 0}` }}
                                                        >
                                                            star
                                                        </span>
                                                    </button>
                                                )}
                                                {(product.image || (product as any).image_url) ? (
                                                    <img
                                                        src={product.image || (product as any).image_url}
                                                        alt={product.name}
                                                        loading="lazy"
                                                        decoding="async"
                                                        className="h-full w-full object-contain group-hover:scale-110 transition-transform duration-500 pointer-events-none"
                                                        crossOrigin="anonymous"
                                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.querySelector('.placeholder-icon')?.classList.remove('hidden'); }}
                                                    />
                                                ) : null}
                                                <div className={`placeholder-icon flex flex-col items-center justify-center absolute inset-0 pointer-events-none ${(product.image || (product as any).image_url) ? 'hidden' : ''}`}>
                                                    <span className="material-symbols-outlined text-[40px] text-gray-300 dark:text-gray-600">restaurant</span>
                                                </div>
                                                <div
                                                    className={`absolute top-2 right-2 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold shadow-sm z-10 box-border cursor-pointer select-none ${isWeightUnit(product.unit) ? 'bg-emerald-50 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-700/50 text-emerald-900 dark:text-emerald-100 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 active:scale-95 transition-all' : 'bg-black/80 border border-transparent text-white'}`}
                                                    onPointerDown={isWeightUnit(product.unit) && search ? (e) => e.preventDefault() : undefined}
                                                    onClick={isWeightUnit(product.unit) ? (e) => {
                                                        e.stopPropagation();
                                                        setPriceInputProduct(product);
                                                    } : undefined}
                                                >
                                                    ${formatCurrency(product.price)}
                                                    {isWeightUnit(product.unit) && <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-300 ml-0.5">/{getUnitLabel(product.unit)}</span>}
                                                </div>

                                            </div>

                                            {/* Title + Stock */}
                                            <div className="mb-2 px-1 cursor-pointer select-none">
                                                <h3 className="font-normal text-[#111814] dark:text-gray-100 text-[13px] leading-tight line-clamp-3 cursor-pointer select-none" title={product.name}>
                                                    {product.name}
                                                </h3>
                                            </div>

                                            {/* Footer: Controls */}
                                            <div className="mt-auto bg-gray-50 dark:bg-gray-800 rounded-xl p-1.5 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                                                {/* Remove Button (Left) */}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleMobileQuantityChange(product, -1, e); }}
                                                    onPointerDown={(e) => search && e.preventDefault()}
                                                    className={`w-[29px] h-[29px] rounded-[0.5rem] flex items-center justify-center transition-all ${quantity > 0
                                                        ? 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 border border-red-100 dark:border-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/40 cursor-pointer active:scale-90'
                                                        : 'bg-white dark:bg-gray-700 text-gray-300 dark:text-gray-600 border border-transparent opacity-50 cursor-not-allowed'
                                                        }`}
                                                    disabled={quantity === 0}
                                                    aria-label="Quitar producto"
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">remove</span>
                                                </button>

                                                {/* Quantity Display */}
                                                <span
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedIndex(index);
                                                        setQuantityInputProduct(product);
                                                    }}
                                                    className={`px-3 py-1.5 -my-1.5 text-[15px] font-black tabular-nums min-w-[32px] flex items-center justify-center text-center select-none transition-colors cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 rounded ${quantity > 0 ? 'text-primary-text dark:text-primary' : 'text-gray-300 dark:text-gray-600'}`}
                                                >
                                                    {Math.round(quantity * 100) / 100}
                                                </span>

                                                {/* Add Button (Right) */}
                                                <button
                                                    onPointerDown={(e) => {
                                                        setIsKeyboardNav(false);
                                                        handlePulse(product.id);
                                                        if (search) e.preventDefault();
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleMobileQuantityChange(product, 1, e);
                                                        if (search) refocusSearchInput();
                                                    }}
                                                    className="w-[29px] h-[29px] rounded-[0.5rem] bg-primary text-[#102218] shadow-sm flex items-center justify-center hover:bg-primary/80 active:scale-90 transition-all font-bold cursor-pointer"
                                                    aria-label="Agregar producto"
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">add</span>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* ====== EAN MODE: CART LIST DE ESCRITORIO ====== */}
                            {isEanMode && (
                                <div className={`${isEanMode ? 'md:flex' : 'hidden'} hidden lg:flex flex-col flex-1 min-h-0`}>
                                    {cart.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center flex-1 gap-3 animate-[fadeIn_0.3s_ease-out] select-none pointer-events-none">
                                            <div className="p-4 rounded-full bg-gray-50 dark:bg-gray-800/50">
                                                <span className="material-symbols-outlined text-5xl text-gray-400 dark:text-gray-500">barcode_scanner</span>
                                            </div>
                                            <p className="text-[15px] text-gray-500 dark:text-gray-400 font-medium text-center px-4">
                                                Escanea o busca un producto para agregar
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                                            {[...cart].reverse().map((item, index) => {
                                                const unitLabel = getUnitLabel(item.unit);
                                                const itemDiscount = item.discount
                                                    ? item.discount
                                                    : item.discountPercent
                                                        ? Math.round(item.price * item.quantity * item.discountPercent / 100)
                                                        : 0;
                                                const itemTotal = Math.round(Math.max(0, item.price * item.quantity - itemDiscount));
                                                const isLastAdded = index === 0 && search === '';
                                                return (
                                                    <div
                                                        key={item.orderItemId || `ean-${item.id}`}
                                                        className={`flex items-stretch border-b border-gray-100 dark:border-gray-800 transition-all ${isLastAdded ? 'bg-primary/5 dark:bg-primary/10 border-l-4 border-l-primary' : 'bg-white dark:bg-surface-dark'}`}
                                                    >
                                                        {/* Imagen + Badge cantidad */}
                                                        <div className="relative shrink-0 w-[72px] self-stretch overflow-hidden bg-gray-100 dark:bg-gray-800">
                                                            {item.image ? (
                                                                <img src={item.image} alt={item.name} crossOrigin="anonymous" className="w-full h-full object-contain cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setPreviewImage(item.image)} title="Ampliar imagen" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center">
                                                                    <span className="material-symbols-outlined text-[22px] text-gray-400">inventory_2</span>
                                                                </div>
                                                            )}
                                                            <div className="absolute top-1 left-1 min-w-[20px] h-5 px-1 bg-gray-900 dark:bg-white rounded-full flex items-center justify-center shadow-sm">
                                                                <span className="text-[10px] font-black text-white dark:text-gray-900 leading-none">
                                                                    {Math.round(item.quantity * 100) / 100}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        {/* Info + controles */}
                                                        <div className="flex-1 flex flex-col justify-center py-2.5 px-2 min-w-0">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <p className="text-sm font-bold text-text-main dark:text-white leading-tight flex-1 line-clamp-1">{item.name}</p>
                                                                <span className="text-sm font-black text-gray-900 dark:text-white shrink-0">${formatCurrency(itemTotal)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                                                <span className="flex items-center gap-1 text-xs text-gray-500">
                                                                    <span className="material-symbols-outlined text-[14px] text-primary">paid</span>
                                                                    ${formatCurrency(item.price)}{unitLabel !== 'Und' && `/${unitLabel}`}
                                                                </span>
                                                                {/* Stock */}
                                                                {item.stock != null && (
                                                                    <span className={`flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-md ${item.stock <= 0 ? 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                                                                        : item.stock <= item.quantity ? 'bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                                                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                                                                        }`}>
                                                                        <span className="material-symbols-outlined text-[12px]">inventory_2</span>
                                                                        {item.stock === 0 ? 'Agotado' : `${Math.round(item.stock * 100) / 100}${item.is_secondary ? '' : ` ${unitLabel}`}`}
                                                                    </span>
                                                                )}
                                                                {/* Descuento aplicado */}
                                                                {itemDiscount > 0 && (
                                                                    <span className="flex items-center gap-0.5 text-xs font-semibold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-1.5 py-0.5 rounded-md">
                                                                        <span className="material-symbols-outlined text-[12px]">sell</span>
                                                                        {item.discountPercent ? `-${item.discountPercent}%` : `-$${formatCurrency(item.discount!)}`}
                                                                    </span>
                                                                )}
                                                                <div className="ml-auto flex items-center gap-1.5">
                                                                    {/* Botón descuento */}
                                                                    <button
                                                                        title="Aplicar descuento"
                                                                        onClick={() => setDiscountItem(item)}
                                                                        className={`size-7 rounded-lg flex items-center justify-center transition-all border ${itemDiscount > 0
                                                                            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800'
                                                                            : 'bg-gray-50 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 hover:text-orange-500 hover:border-orange-300'
                                                                            }`}
                                                                    >
                                                                        <span className="material-symbols-outlined text-[15px]">sell</span>
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            if (item.quantity > 1) {
                                                                                updateQuantity(item, -1);
                                                                            } else {
                                                                                removeFromCart(item);
                                                                            }
                                                                        }}
                                                                        className={`size-7 rounded-lg flex items-center justify-center transition-all ${item.quantity > 0 ? 'bg-red-50 dark:bg-red-900/20 text-red-500 border border-red-100 dark:border-red-900/30' : 'bg-gray-100 dark:bg-gray-800 text-gray-300 opacity-50'}`}
                                                                        disabled={item.quantity === 0}
                                                                    >
                                                                        <span className="material-symbols-outlined text-[16px]">remove</span>
                                                                    </button>
                                                                    <span
                                                                        onClick={() => {
                                                                            if (isWeightUnit(item.unit)) {
                                                                                setEanWeightEditItem(item);
                                                                            } else {
                                                                                setQuantityInputProduct(item as Product);
                                                                            }
                                                                        }}
                                                                        title="Editar cantidad"
                                                                        className="text-[14px] font-black tabular-nums min-w-[28px] text-center text-primary-text dark:text-primary cursor-pointer hover:bg-primary/10 rounded px-1 transition-colors"
                                                                    >
                                                                        {Math.round(item.quantity * 100) / 100}
                                                                    </span>
                                                                    <button
                                                                        onClick={() => updateQuantity(item, 1)}
                                                                        className="size-7 rounded-lg bg-primary text-[#102218] flex items-center justify-center hover:bg-primary/80 transition-colors"
                                                                    >
                                                                        <span className="material-symbols-outlined text-[16px]">add</span>
                                                                    </button>
                                                                    <button
                                                                        onClick={() => removeFromCart(item)}
                                                                        className="size-7 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-500 flex items-center justify-center active:scale-95 transition-transform ml-1"
                                                                    >
                                                                        <span className="material-symbols-outlined text-[16px]">delete</span>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                        </div>
                    )}
                </div>

                {/* ================= BOTTOM PROCESS BUTTONS ================= */}
                {
                    totalItems > 0 && !isPaymentView && !isSuccessView && (
                        <>
                            {/* Mobile FAB (< md o EAN inactivo) */}
                            {!isScannerMode && (
                                <div className={`hidden md:block lg:hidden fixed md:bottom-8 right-4 z-40 animate-[slideUp_0.2s_ease-out]`}>
                                    <button
                                        id="cart-fab"
                                        onClick={() => onNavigate(Screen.PAYMENT)}
                                        className={`w-20 h-28 rounded-xl bg-primary text-amber-950 shadow-[0_4px_20px_rgba(251,191,36,0.5)] flex items-center justify-center active:scale-95 hover:[translate:0_-2px] hover:shadow-[0_8px_28px_rgba(251,191,36,0.65)] transition-[box-shadow,translate] duration-200 relative group border border-black`}
                                    >
                                        <span className="material-symbols-outlined text-[56px] scale-y-125">list_alt</span>
                                        <div className="absolute -top-1 -right-1 size-7 bg-red-600 text-white text-sm font-bold rounded-full flex items-center justify-center border-2 border-white dark:border-background-dark shadow-sm">
                                            {badgeCount}
                                        </div>
                                    </button>
                                </div>
                            )}

                            {/* Desktop/Tablet Procesar Pago (Barra inferior full-width solo md+ en modo EAN) */}
                            {isEanMode && (
                                <div className="hidden md:block lg:hidden absolute bottom-0 left-0 right-0 z-[50] p-3 bg-white dark:bg-surface-dark border-t border-gray-100 dark:border-gray-800 animate-[slideUp_0.2s_ease-out] shadow-[0_-10px_40px_rgba(0,0,0,0.1)]">
                                    <button
                                        onClick={() => { sessionStorage.setItem('bistro_payment_skip_summary', 'true'); onNavigate(Screen.PAYMENT); }}
                                        className="w-full min-h-[64px] bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-xl font-bold text-sm flex items-center px-4 active:scale-[0.98] transition-all focus:outline-none shadow-md"
                                    >
                                        <div className="flex flex-col items-start shrink-0 mr-3 gap-1">
                                            <span className="text-[11px] font-semibold opacity-60 leading-none uppercase tracking-wide">{badgeCount} items</span>
                                            <span className="text-[18px] md:text-xl font-black text-primary leading-tight">${formatCurrency(total)}</span>
                                        </div>
                                        <span className="flex-1 text-center font-black uppercase text-base md:text-lg tracking-wider">Procesar Pago</span>
                                        <span className="material-symbols-outlined text-primary text-[24px] md:text-[28px] shrink-0 ml-3">arrow_forward</span>
                                    </button>
                                </div>
                            )}
                        </>
                    )
                }

                {/* Backdrop overlay removido: Usando PaymentScreen nativo desde App.tsx */}
            </div >

            {/* ================= DESKTOP & TABLET SIDEBAR CART ================= */}
            <aside
                id="desktop-cart-container"
                style={{ width: '400px', maxWidth: '100vw' }}
                className={`bg-surface-light dark:bg-surface-dark border-l border-gray-200 dark:border-gray-800 flex-col shrink-0 lg:z-[61] relative
                    hidden lg:flex
                `}
            >
                {/* Conditional Sidebar Content */}
                {
                    isSuccessView && lastTransaction ? (
                        <>

                            <SuccessSidebar
                                transaction={lastTransaction}
                                onStartNewSale={onStartNewSale!}
                                onBackToTables={() => onNavigate(Screen.TABLES)}
                                backLabel="Ir a Mesas"
                                receiptData={receiptData}
                                isCatalogMode={!isEanMode}
                                preselectedComandaLabels={comandaLabelSelection}
                            />
                        </>
                    ) : isEanMode ? (
                        <>

                            <PaymentSidebar
                                total={total}
                                onProcessPayment={onProcessPayment!}
                                onBack={() => { /* modo fijo por negocio: el "back" inline no aplica aquí (showInlineBack=false) */ }}
                                tableId={activeTableId}
                                onConfirmOrder={onConfirmOrder}
                                deliveryClientName={deliveryClientName}
                                saleOrigin={saleOrigin}
                            />
                        </>
                    ) : (
                        <>
                            {/* PaymentSidebar persistente (modo catálogo): se oculta con display:none al
                                volver al carrito en vez de desmontarse, para conservar cliente, descuento,
                                método y efectivo ya ingresados. Se desmonta solo al vaciarse el carrito. */}
                            {(isPaymentView || cart.length > 0) && (
                                <div className={isPaymentView ? 'contents' : 'hidden'}>
                                    <PaymentSidebar total={total} onProcessPayment={onProcessPayment!} showInlineBack onBack={handleExitCatalogPayment} tableId={activeTableId} onConfirmOrder={onConfirmOrder} deliveryClientName={deliveryClientName} saleOrigin={saleOrigin} />
                                </div>
                            )}
                            <div className={isPaymentView ? 'hidden' : 'contents'}>
                            {/* Banner de solo lectura de mesas: distingue observador offline
                                de eje sin conexión (Req 5.3, 16.3). */}
                            {tablesReadOnly && tablesGate.readOnlyMessage && (
                                <div className="mx-4 mt-2">
                                    <TablesReadOnlyBanner
                                        reason={tablesGate.readOnlyReason}
                                        message={tablesGate.readOnlyMessage}
                                        compact
                                    />
                                </div>
                            )}
                            <div className="py-2.5 flex items-center justify-between px-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-surface-dark z-[70] relative shrink-0">
                                {/* Left Group: Control de Mesa / Orden Rápida + Etiquetas */}
                                <div className="flex items-center gap-2 min-w-0">
                                    {isTablesEnabled && onSelectTable && onSelectQuickOrder ? (
                                        <TableSelectorControl
                                            mode={isQuickOrder ? 'quick' : 'table'}
                                            activeTableId={activeTableId}
                                            onSelectTable={onSelectTable}
                                            onSelectQuickOrder={onSelectQuickOrder}
                                            loadingTableId={loadingTableId}
                                            variant="popover"
                                            unified={true}
                                        />
                                    ) : (
                                        <div className={`px-2.5 py-1.5 rounded-full font-bold text-[10px] uppercase tracking-wide border flex items-center gap-1.5 leading-none w-fit ${isQuickOrder ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                            <span className={`size-1.5 rounded-full ${isQuickOrder ? 'bg-slate-400' : 'bg-emerald-500'}`}></span>
                                            {isQuickOrder ? 'Orden Rápida' : (activeTable || 'Mesa').replace(/^T-|^S-/, 'Mesa ')}
                                        </div>
                                    )}
                                    {/* Botón Pedido: acceso rápido al ComandaLabelModal para etiquetar
                                        la comanda antes de enviarla a cocina. Solo en modo Catálogo y
                                        si la preferencia del negocio está activa (Ajustes → Activar/Desactivar). */}
                                    <ComandaLabelHeaderButton
                                        selection={comandaLabelSelection}
                                        onChange={(next) => onComandaLabelSelectionChange?.(next)}
                                        enabled={isComandaLabelShortcutEnabled}
                                        isCatalogMode={!isEanMode}
                                    />
                                </div>

                                {/* Right Group: Limpiar orden */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                    {cart.length > 0 && (
                                        <button
                                            onClick={() => setShowClearConfirm(true)}
                                            className="size-8 flex items-center justify-center rounded-lg text-text-secondary hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors"
                                            title="Limpiar orden"
                                        >
                                            <span className="material-symbols-outlined text-[20px]">mop</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Detalles label - Outside header */}
                            <div className="px-4 py-2">
                                <h3 className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Detalles</h3>
                            </div>

                            <div className={`flex-1 overflow-y-auto custom-scrollbar px-4 space-y-0.5 ${!isQuickOrder ? 'pb-20' : 'pb-4'}`}>
                                {(() => {
                                    const topItems = [...cart].filter(it => !it.parentOrderItemId).reverse();
                                    const renderRow = (item: CartItem, index: number) => {
                                        const children = cart.filter(c => c.parentOrderItemId === item.orderItemId);
                                        return (
                                            <CartItemRow
                                                key={item.orderItemId || `local-${item.id}-${index}-${item.cookingTerm || ''}-${(item.removedIngredients || []).join(',')}`}
                                                item={item}
                                                index={index}
                                                onRemove={() => {
                                                    if (tablesReadOnly) { showToast(tablesGate.readOnlyMessage ?? 'Mesas en solo lectura sin conexión', 'warning'); return; }
                                                    removeFromCart(item);
                                                    refocusSearchInput();
                                                }}
                                                onUpdateQuantity={(delta) => {
                                                    if (tablesReadOnly) { showToast(tablesGate.readOnlyMessage ?? 'Mesas en solo lectura sin conexión', 'warning'); return; }
                                                    updateQuantity(item, delta);
                                                    children.forEach(c => updateQuantity(c, delta));
                                                    refocusSearchInput();
                                                }}
                                                onEditProduct={() => onEditProduct(item)}
                                                onDiscount={() => setDiscountItem(item)}
                                                defaultExpanded={!isEanMode}
                                                flat={!isEanMode}
                                                readOnly={tablesReadOnly}
                                                modifierTags={children.map(c => c.name)}
                                                extraAmount={children.reduce((s, c) => s + c.price * c.quantity, 0)}
                                                forceExpanded={!!expandedCartItemId && !!item.orderItemId && item.orderItemId === expandedCartItemId}
                                                onExpandChange={(expanded) => {
                                                    if (!expanded && item.orderItemId === expandedCartItemId) {
                                                        onExpandChange?.(null);
                                                    }
                                                }}
                                            />
                                        );
                                    };

                                    // Orden rápida (o sin comanda enviada): lista simple sin separador.
                                    if (isQuickOrder || !hasSentItems) {
                                        return (
                                            <>
                                                {topItems.map((item, index) => renderRow(item, index))}
                                                {!isQuickOrder && cart.length > 0 && (
                                                    <div className="h-16 shrink-0 pointer-events-none" aria-hidden="true" />
                                                )}
                                            </>
                                        );
                                    }

                                    // Mesa con comanda enviada: nuevos arriba, separador, enviados abajo.
                                    const newItems = topItems.filter(it => !SENT_STATUSES.includes(it.status || 'pending'));
                                    const sentItems = topItems.filter(it => SENT_STATUSES.includes(it.status || ''));
                                    let idx = 0;
                                    return (
                                        <>
                                            {newItems.map(item => renderRow(item, idx++))}
                                            <div className="flex items-center gap-2 py-2">
                                                <div className="flex-1 h-px bg-slate-200 dark:bg-gray-700" />
                                                <span className="text-[11px] font-semibold text-slate-400">Comanda enviada</span>
                                                <div className="flex-1 h-px bg-slate-200 dark:bg-gray-700" />
                                            </div>
                                            {sentItems.map(item => renderRow(item, idx++))}
                                            {!isQuickOrder && cart.length > 0 && (
                                                <div className="h-16 shrink-0 pointer-events-none" aria-hidden="true" />
                                            )}
                                        </>
                                    );
                                })()}
                                {cart.length === 0 && (
                                    <div className="flex flex-col items-center justify-center h-40 text-text-secondary opacity-50">
                                        <span className="material-symbols-outlined text-4xl mb-2">shopping_cart</span>
                                        <p className="text-sm">Orden vacía</p>
                                    </div>
                                )}
                            </div>

                            <div className="bg-white dark:bg-surface-dark p-3 border-t border-gray-100 dark:border-gray-800 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                                <button
                                    onClick={() => { if (puedeCobrar) onNavigate(Screen.PAYMENT); }}
                                    disabled={cart.length === 0 || !puedeCobrar}
                                    title={!puedeCobrar ? (tablesReadOnly ? (tablesGate.readOnlyMessage ?? 'Mesas en solo lectura') : 'No tienes permiso para finalizar ventas') : undefined}
                                    className={`w-full h-12 rounded-xl text-[12px] font-bold uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed
                                        ${sidebarFocus === 'process' && puedeCobrar
                                            ? 'bg-primary text-[#102218] ring-[3px] ring-primary/50 scale-[1.02]'
                                            : 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 active:scale-[0.97]'}
                                    `}
                                >
                                    Procesar Pago
                                    <span className={`material-symbols-outlined text-[20px] ${!puedeCobrar ? 'text-current' : sidebarFocus === 'process' ? 'text-[#102218]' : 'text-primary'}`}>{puedeCobrar ? 'arrow_forward' : 'lock'}</span>
                                    <span className="font-black ml-1">${formatCurrency(total)}</span>
                                </button>
                            </div>
                            </div>

                            {/* FAB Enviar Comanda — solo en modo mesa, habilitado si hay items nuevos, oculto en pantalla de pago */}
                            {!isQuickOrder && !isPaymentView && cart.length > 0 && (
                                <button
                                    onClick={() => { if (!tablesGate.verifyCanWriteNow()) { showToast(tablesGate.readOnlyMessage ?? 'Mesas en solo lectura sin conexión', 'warning'); return; } onSendCommanda?.(); }}
                                    disabled={!hasPendingNewItems || tablesReadOnly}
                                    className="absolute bottom-[84px] right-4 z-[55] flex items-center gap-2 h-12 px-4 rounded-full bg-[#102218] text-white text-[13px] font-bold shadow-xl active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                    title={hasPendingNewItems ? 'Enviar comanda a cocina' : 'No hay productos nuevos por enviar'}
                                >
                                    <span className="material-symbols-outlined text-[20px]">print</span>
                                    Enviar Comanda
                                </button>
                            )}
                        </>
                    )
                }
            </aside>

            {/* ================= BOTTOM SHEET DE CATEGORÍA (Catálogo móvil ≤767px) ================= */}
            {catalogSheetCategory !== null && (
                <>
                    <div
                        className={`fixed inset-0 z-[79] bg-black/40 md:hidden ${!sheetDragging ? 'transition-opacity duration-200' : ''} ${sheetOffset === 0 && !sheetClosing ? 'animate-[fadeIn_0.15s_ease-out]' : ''}`}
                        style={{ opacity: sheetClosing ? 0 : Math.max(0, 1 - sheetOffset / 400) }}
                        role="button" tabIndex={-1} aria-label="Cerrar"
                        onClick={handleCloseCatalogSheet}
                    />
                    <div
                        ref={catalogSheetRef}
                        className={`fixed left-0 right-0 bottom-0 z-[80] md:hidden bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl flex flex-col max-h-[88vh] ${!sheetDragging ? 'transition-transform duration-250 ease-out' : ''} ${sheetOffset === 0 && !sheetDragging && !sheetClosing ? 'animate-[slideInUp_0.25s_ease-out]' : ''}`}
                        style={{ transform: `translateY(${sheetClosing ? '100%' : sheetOffset + 'px'})`, touchAction: 'pan-y' }}
                        onTouchStart={(e) => { sheetStartY.current = e.touches[0].clientY; }}
                        onTouchEnd={() => {
                            sheetStartY.current = null;
                            if (sheetDraggingRef.current) {
                                sheetDraggingRef.current = false;
                                setSheetDragging(false);
                                if (sheetOffsetRef.current > 80) handleCloseCatalogSheet();
                                else { sheetOffsetRef.current = 0; setSheetOffset(0); }
                            }
                        }}
                    >
                        <div className="flex justify-center pt-2 pb-1 shrink-0"><span className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700" /></div>

                        {/* Header del sheet: título + buscar dentro + cerrar */}
                        <div className="shrink-0 px-4 pb-3 border-b border-gray-100 dark:border-gray-800">
                            {isSheetSearchOpen ? (
                                <div className="relative animate-[fadeIn_0.15s_ease-out]">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                                        <span className="material-symbols-outlined text-[20px]">search</span>
                                    </span>
                                    <input
                                        type="text"
                                        autoFocus
                                        placeholder={`Buscar en ${catalogSheetTitle}...`}
                                        value={sheetSearch}
                                        onChange={(e) => setSheetSearch(e.target.value)}
                                        className="w-full h-10 rounded-xl border-none bg-gray-100 dark:bg-gray-800 pl-10 pr-10 text-gray-900 dark:text-white placeholder:text-gray-500"
                                    />
                                    <button
                                        onClick={() => { if (sheetSearch) setSheetSearch(''); else setIsSheetSearchOpen(false); }}
                                        className="absolute inset-y-0 right-1 flex items-center pr-2"
                                    >
                                        <div className="size-5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-500 flex items-center justify-center">
                                            <span className="material-symbols-outlined text-[14px] font-bold">close</span>
                                        </div>
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between gap-2">
                                    <h3 className="text-base font-bold text-text-main dark:text-white truncate">{catalogSheetTitle}</h3>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => setIsSheetSearchOpen(true)}
                                            className="size-9 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-95 transition-all"
                                            aria-label={`Buscar en ${catalogSheetTitle}`}
                                        >
                                            <span className="material-symbols-outlined text-[22px]">search</span>
                                        </button>
                                        <button
                                            onClick={handleCloseCatalogSheet}
                                            className="size-9 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 active:scale-95 transition-all"
                                            aria-label="Cerrar"
                                        >
                                            <span className="material-symbols-outlined text-[22px]">close</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Lista de productos de la categoría */}
                        <div ref={sheetListRef} className="flex-1 overflow-y-auto custom-scrollbar overscroll-contain">
                            {sheetProducts.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center px-8 opacity-60">
                                    <span className="material-symbols-outlined text-4xl text-gray-400 mb-2">{sheetSearch ? 'search_off' : 'inventory_2'}</span>
                                    <p className="text-sm text-gray-500">{sheetSearch ? 'Sin resultados' : 'Sin productos en esta categoría'}</p>
                                </div>
                            ) : (
                                sheetProducts.map(product => {
                                    const img = product.image || (product as any).image_url;
                                    const quantity = getCartQuantity(product.id);
                                    return (
                                        <div
                                            key={product.id}
                                            className="w-full flex items-center gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-800 last:border-0"
                                        >
                                            <button
                                                onClick={(e) => handleCatalogAdd(product, e)}
                                                className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-70 transition-opacity"
                                            >
                                                <div className="size-11 rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 shrink-0 flex items-center justify-center">
                                                    {img ? (
                                                        <img src={img} alt="" className="w-full h-full object-contain" crossOrigin="anonymous" />
                                                    ) : (
                                                        <span className="material-symbols-outlined text-[22px] text-gray-400">restaurant</span>
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-text-main dark:text-white line-clamp-2 leading-tight">{product.name}</p>
                                                    <p className="text-xs text-gray-400 mt-0.5">${formatCurrency(product.price)}{product.is_secondary ? '' : ` / ${getUnitLabel(product.unit)}`}</p>
                                                </div>
                                            </button>
                                            {/* Estrella de favorito (no en promociones) */}
                                            {!String(product.id).startsWith('promo_') && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        window.dispatchEvent(new CustomEvent('favorite-toggled', { detail: { productId: product.id, value: !(product as any).is_favorite } }));
                                                    }}
                                                    className="size-9 flex items-center justify-center rounded-full shrink-0 active:scale-90 transition-transform hover:bg-gray-100 dark:hover:bg-gray-800"
                                                    aria-label={(product as any).is_favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                                                >
                                                    <span
                                                        className={`material-symbols-outlined text-[20px] ${(product as any).is_favorite ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}
                                                        style={{ fontVariationSettings: `'FILL' ${(product as any).is_favorite ? 1 : 0}` }}
                                                    >
                                                        star
                                                    </span>
                                                </button>
                                            )}
                                            {/* Stepper: -, cantidad y + cuando ya hay unidades en el carrito */}
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {quantity > 0 && (
                                                    <>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleMobileQuantityChange(product, -1, e); }}
                                                            className="size-9 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-text-main dark:text-white active:scale-90 transition-transform"
                                                            aria-label={`Quitar uno de ${product.name}`}
                                                        >
                                                            <span className="material-symbols-outlined text-[22px]">remove</span>
                                                        </button>
                                                        <span className="min-w-[1.75rem] text-center text-sm font-bold text-text-main dark:text-white tabular-nums">{Math.round(quantity * 100) / 100}</span>
                                                    </>
                                                )}
                                                <button
                                                    onClick={(e) => handleCatalogAdd(product, e)}
                                                    className="size-9 flex items-center justify-center rounded-full bg-primary text-text-main shadow-sm active:scale-90 transition-transform"
                                                    aria-label={`Agregar ${product.name}`}
                                                >
                                                    <span className="material-symbols-outlined text-[22px]">add</span>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </>
            )}

            {discountItem && (
                <DiscountModal
                    onClose={() => setDiscountItem(null)}
                    onApply={handleApplyDiscount}
                    itemName={discountItem.name}
                    itemPrice={discountItem.price * discountItem.quantity}
                    initialDiscount={discountItem.discount}
                    initialDiscountPercent={discountItem.discountPercent}
                />
            )}

            {priceInputProduct && onQuickAddWithQuantity && (
                <PriceInputModal
                    product={priceInputProduct}
                    unitLabel={getUnitLabel(priceInputProduct.unit)}
                    onConfirm={(qty, adjustedPrice) => {
                        if (tablesReadOnlyRef.current) {
                            showToast(tablesReadOnlyMsgRef.current ?? 'Mesas en solo lectura sin conexión', 'warning');
                            setPriceInputProduct(null);
                            return;
                        }
                        onQuickAddWithQuantity(priceInputProduct, qty, adjustedPrice);
                        setSearch('');
                        setTimeout(() => refocusSearchInput(), 50);
                    }}
                    onClose={() => {
                        setPriceInputProduct(null);
                        setTimeout(() => refocusSearchInput(), 50);
                    }}
                />
            )}

            {eanWeightEditItem && updateCartItem && (
                <PriceInputModal
                    product={eanWeightEditItem as Product}
                    unitLabel={getUnitLabel(eanWeightEditItem.unit)}
                    onConfirm={(qty, adjustedPrice) => {
                        const delta = qty - eanWeightEditItem.quantity;
                        updateQuantity(eanWeightEditItem, delta);
                        updateCartItem(eanWeightEditItem, { price: adjustedPrice });
                        setEanWeightEditItem(null);
                        setTimeout(() => refocusSearchInput(), 50);
                    }}
                    onClose={() => {
                        setEanWeightEditItem(null);
                        setTimeout(() => refocusSearchInput(), 50);
                    }}
                />
            )}

            {quantityInputProduct && (
                <QuantityInputModal
                    product={quantityInputProduct}
                    currentQuantity={getCartQuantity(quantityInputProduct.id)}
                    onConfirm={(newQuantity) => {
                        handleSetCustomQuantity(quantityInputProduct, newQuantity);
                        setTimeout(() => refocusSearchInput(), 50);
                    }}
                    onClose={() => {
                        setQuantityInputProduct(null);
                        setTimeout(() => refocusSearchInput(), 50);
                    }}
                />
            )}

            {scannerItemEditor && (
                <MobileScannerItemModal
                    item={scannerItemEditor}
                    onClose={() => {
                        setScannerItemEditor(null);
                        if (!isCameraActive) setTimeout(() => refocusSearchInput(), 50);
                    }}
                    onSave={(newQty, discountVal, isPct) => {
                        const itemToUpdate = cart.find(i => i.id === scannerItemEditor.id);
                        if (itemToUpdate) {
                            if (newQty === 0) {
                                removeFromCart(itemToUpdate);
                            } else {
                                updateQuantity(itemToUpdate, newQty - itemToUpdate.quantity);
                                if (updateCartItem) {
                                    setTimeout(() => {
                                        updateCartItem(itemToUpdate, {
                                            discount: !isPct && discountVal > 0 ? discountVal : undefined,
                                            discountPercent: isPct && discountVal > 0 ? discountVal : undefined,
                                        });
                                    }, 0);
                                }
                            }
                        }
                        setScannerItemEditor(null);
                        if (!isCameraActive) setTimeout(() => refocusSearchInput(), 50);
                    }}
                />
            )}

            {showClearConfirm && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[100] flex items-center justify-center md:items-start md:pt-32 md:justify-end md:pr-4 xl:pr-8 animate-[fadeIn_0.15s_ease-out]">
                    <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 mx-4 md:mx-0 max-w-sm w-full animate-[fadeIn_0.2s_ease-out]">
                        <div className="flex flex-col items-center text-center gap-3">
                            <div className="size-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                                <span className="material-symbols-outlined text-red-500 text-[24px]">mop</span>
                            </div>
                            <h3 className="text-lg font-semibold text-text-main dark:text-white">¿Limpiar orden?</h3>
                            <p className="text-sm text-gray-500">Se eliminarán todos los productos del carrito.</p>
                            <div className="flex gap-3 w-full mt-2">
                                <button
                                    onClick={() => setShowClearConfirm(false)}
                                    className="flex-1 h-10 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => {
                                        onClearCart?.();
                                        setShowClearConfirm(false);
                                    }}
                                    className="flex-1 h-10 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-bold transition-colors"
                                >
                                    Limpiar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Vista Previa de Imagen */}
            {previewImage && (
                <div
                    className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out backdrop-blur-sm"
                    onClick={() => setPreviewImage(null)}
                >
                    <img
                        src={previewImage}
                        alt="Vista previa"
                        crossOrigin="anonymous"
                        className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                    />
                </div>
            )}
        </div>
    );
};
