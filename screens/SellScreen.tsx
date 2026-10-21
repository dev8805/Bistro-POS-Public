import React, { useState, useEffect, Suspense, lazy } from 'react';
import { OfflineFeaturesModal } from '../components/OfflineFeaturesModal';
import { Screen, CartItem, Product, SellTab, TransactionDetails, ReceiptData } from '../types';
import { TablesScreen } from './TablesScreen';
import { MenuScreen } from './MenuScreen';
import { useExpenses } from '../hooks/useExpenses';
import { ExpenseModal } from '../components/ExpenseModal';
import { ExpenseActionsMenu, type ExpenseMenuAction } from '../components/expense/ExpenseActionsMenu';
import { ScanLoadingFallback } from '../components/invoiceScan/ScanLoadingFallback';
import { Table } from '../hooks/useTables';
import TableSelectorControl from '../components/TableSelectorControl';
import { useToast } from '../context/ToastContext';
import QuickTransactionModal from '../components/modals/QuickTransactionModal';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { usePlanFeatures } from '../hooks/usePlanFeatures';
import { UpgradeProModal } from '../components/modals/UpgradeProModal';

const PhotoOrderScreen = lazy(() => import('./PhotoOrderScreen').then(m => ({ default: m.PhotoOrderScreen })));
// Escaneo_Unificado montado como overlay `fixed inset-0` (mismo patrón que ExpenseModal).
const InvoiceScanScreen = lazy(() => import('./InvoiceScanScreen'));

interface SellScreenProps {
    onNavigate: (screen: Screen) => void;
    onTableSelect: (table: Table) => void | Promise<void>;
    /** Id de la mesa cuya orden se está cargando (spinner inline). */
    loadingTableId?: string | null;
    // Props para MenuScreen
    cart: CartItem[];
    addToCart: (product: Product) => void;
    onQuickAdd: (product: Product) => void;
    onQuickAddIndividual?: (product: Product) => void;
    onQuickAddWithQuantity?: (product: Product, quantity: number, adjustedPrice?: number) => void;
    onEditProduct: (product: Product | CartItem) => void;
    removeFromCart: (product: CartItem) => void;
    updateQuantity: (product: CartItem, delta: number) => void;
    onProcessPayment?: (details: TransactionDetails) => void;
    onToggleMenu?: () => void;
    onSendCommanda?: () => void | Promise<void>;
    products?: Product[];
    productsLoading?: boolean;
    onAddAnimation?: (rect: DOMRect, image: string) => void;
    // Props adicionales para mesa
    activeTable?: string;
    activeTableId?: string;
    activeTab?: SellTab;
    onSwitchTab?: (tab: SellTab) => void;
    onAssignClient?: () => void;
    deliveryClientName?: string;
    updateCartItem?: (product: CartItem, updates: Partial<CartItem>) => void;
    onClearCart?: () => void;
    onPhotoOrderAdd?: (items: { product: Product; quantity: number; discount?: number; discountPercent?: number }[]) => Promise<void> | void;
    isEanMode?: boolean;
    currentAppScreen?: Screen;
    lastTransaction?: TransactionDetails | null;
    receiptData?: ReceiptData | null;
    onStartNewSale?: () => void;
    isOnline?: boolean;
    pendingCount?: number;
    failedCount?: number;
    lastSyncResult?: { synced: number; failed: number } | null;
    onClearFailed?: () => void;
    onContentReady?: () => void;
    isSidebarCollapsed?: boolean;
    isShiftOpen?: boolean;
    // Selección de etiquetas de comanda elevada a App.tsx.
    comandaLabelSelection?: { locator?: string; table?: string; takeaway?: string };
    onComandaLabelSelectionChange?: (selection: { locator?: string; table?: string; takeaway?: string }) => void;
}

export const SellScreen: React.FC<SellScreenProps> = ({
    onNavigate,
    onTableSelect,
    loadingTableId,
    cart,
    addToCart,
    onQuickAdd,
    onQuickAddIndividual,
    onQuickAddWithQuantity,
    onEditProduct,
    removeFromCart,
    updateQuantity,
    onProcessPayment,
    onToggleMenu,
    onSendCommanda,
    products,
    productsLoading,
    onAddAnimation,
    activeTable,
    activeTableId,
    onSwitchTab,
    activeTab: propActiveTab,
    onAssignClient,
    deliveryClientName,
    updateCartItem,
    onClearCart,
    onPhotoOrderAdd,
    isEanMode: propIsEanMode,
    currentAppScreen,
    lastTransaction,
    receiptData,
    onStartNewSale,
    isOnline = true,
    pendingCount = 0,
    failedCount = 0,
    lastSyncResult,
    onClearFailed,
    onContentReady,
    isSidebarCollapsed = false,
    isShiftOpen = false,
    comandaLabelSelection,
    onComandaLabelSelectionChange,
}) => {
    const { isTablesEnabled } = useBusinessSettings();
    const defaultTab: SellTab = 'orden_rapida';
    const [localActiveTab, setLocalActiveTab] = useState<SellTab>(defaultTab);
    const { showToast } = useToast();
    const activeTab = propActiveTab || localActiveTab;
    const { profile } = useAuth();
    const { hasPermission } = usePermissions();
    const canRegisterExpenses = hasPermission('inv_purchase');
    const { canUseTables } = usePlanFeatures();
    const [upgradeModalInfo, setUpgradeModalInfo] = useState<{ open: boolean; title: string; desc: string } | null>(null);
    const [showFeaturesModal, setShowFeaturesModal] = useState(false);

    const setActiveTab = (tab: SellTab) => {
        if (onSwitchTab) {
            onSwitchTab(tab);
        } else {
            setLocalActiveTab(tab);
        }
    };

    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [expenseModalType, setExpenseModalType] = useState<'inventory' | 'expense' | 'waste'>('expense');
    const [showExpenseDropdown, setShowExpenseDropdown] = useState(false);
    const [showInvoiceScan, setShowInvoiceScan] = useState(false);
    const [selectedTable, setSelectedTable] = useState<Table | null>(null);

    // Abonos State
    const [showAbonosModal, setShowAbonosModal] = useState(false);
    const [abonosType, setAbonosType] = useState<'client' | 'supplier'>('client');
    const [showAbonosDropdown, setShowAbonosDropdown] = useState(false);

    const [isScanSidebarOpen, setIsScanSidebarOpen] = useState(false);

    // El modo (Escáner/Catálogo) es config del negocio (Supabase) y llega por prop.
    // Default escáner (true) si no se provee.
    const isEanMode = propIsEanMode ?? true;

    const openAbonosModal = (type: 'client' | 'supplier') => {
        setAbonosType(type);
        setShowAbonosModal(true);
        setShowAbonosDropdown(false);
    };

    const { createExpense } = useExpenses();

    const openExpenseModal = (type: 'inventory' | 'expense' | 'waste') => {
        setExpenseModalType(type);
        setShowExpenseModal(true);
        setShowExpenseDropdown(false);
    };

    // Abrir automáticamente modal de gastos o compra si la app se lanzó con deep link o ruta /gastos o /compra-inventario
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const action = params.get('action');
        const isCompraRoute = window.location.pathname === '/compra-inventario' || action === 'inventory' || action === 'compra';
        if (isCompraRoute) {
            openExpenseModal('inventory');
            if (action) {
                params.delete('action');
                const qs = params.toString();
                window.history.replaceState(
                    window.history.state,
                    '',
                    `${window.location.pathname}${qs ? '?' + qs : ''}${window.location.hash}`
                );
            }
            return;
        }

        const isGastosRoute = window.location.pathname === '/gastos' || action === 'expense' || action === 'gastos';
        if (isGastosRoute) {
            openExpenseModal('expense');
            if (action) {
                params.delete('action');
                const qs = params.toString();
                window.history.replaceState(
                    window.history.state,
                    '',
                    `${window.location.pathname}${qs ? '?' + qs : ''}${window.location.hash}`
                );
            }
        }
    }, []);

    // "Foto a factura" abre el Escaneo_Unificado; las demás conservan su modal.
    const handleExpenseMenuSelect = (action: ExpenseMenuAction) => {
        setShowExpenseDropdown(false);
        if (action === 'foto_factura') {
            setShowInvoiceScan(true);
            return;
        }
        openExpenseModal(action);
    };

    const handleTabClick = (tab: SellTab) => {
        if (tab === 'gastos') {
            setShowExpenseDropdown(!showExpenseDropdown);
        } else {
            // Notify parent about tab switch (to clear cart/context if needed)
            if (onSwitchTab) {
                onSwitchTab(tab);
            }

            setActiveTab(tab);
            setShowExpenseDropdown(false);
            // Si cambia de tab, limpiar mesa seleccionada
            if (tab !== 'mesa_activa') {
                setSelectedTable(null);
            }
        }
    };

    const handleTableSelectInternal = async (table: Table) => {
        if (!canUseTables) {
            setUpgradeModalInfo({
                open: true,
                title: 'Mapa de Salones y Mesas',
                desc: 'Controla el estado de mesas en tiempo real, divide cuentas por comensal y envía comandas directas a preparación.'
            });
            return;
        }
        setSelectedTable(table);
        setActiveTab('mesa_activa');
        // También notificar al padre para que cargue los datos de la mesa
        await onTableSelect(table);
    };

    const handleBackToTables = () => {
        // Opción B: sin grilla de mesas. "Volver" desde una mesa regresa al catálogo.
        setActiveTab('orden_rapida');
        if (onSwitchTab) {
            onSwitchTab('orden_rapida');
        }
        setSelectedTable(null);
    };

    React.useEffect(() => {
        if (activeTab === 'mesa_activa' && !selectedTable) {
            setActiveTab('orden_rapida');
            if (onSwitchTab) {
                onSwitchTab('orden_rapida');
            }
        }
    }, [activeTab, selectedTable]);

    React.useEffect(() => {
        // Opción B: la pestaña/grilla de mesas está oculta; si algo intenta abrirla, redirigir al catálogo.
        if (activeTab === 'mesas') {
            setActiveTab('orden_rapida');
            if (onSwitchTab) onSwitchTab('orden_rapida');
        }
    }, [activeTab]);



    const visualActiveTab = activeTab === 'mesa_activa' ? 'mesas' : activeTab;

    // Gastos, mermas y compras de inventario NO requieren un turno abierto:
    // se registran igual (createExpense solo descuenta de caja si hay turno y el
    // usuario lo elige explícitamente). Abonos y el cobro sí gestionan su propio
    // requisito de turno donde corresponde.

    return (
        <div className="relative flex flex-col h-full bg-background-light dark:bg-background-dark text-text-main dark:text-white font-display animate-slideInUpSubtle">

            {/* Header Principal con Tabs - oculto en SUCCESS (para que no se transparente bajo el overlay del SuccessSidebar)
                y oculto en modo catálogo cuando el sidebar de navegación está colapsado (vista limpia full-screen) */}
            <div className={`${currentAppScreen === Screen.SUCCESS || (!isEanMode && isSidebarCollapsed) ? 'hidden' : 'hidden md:flex'} h-14 px-2 lg:px-6 bg-surface-light dark:bg-surface-dark border-b border-border-light dark:border-border-dark items-center justify-between shrink-0 z-[62] sticky top-0 relative overflow-visible`}>

                {/* Botones izquierda: Gastos, Abonos, Turno, Mesas */}
                <div className="flex items-center gap-1 lg:gap-2 xl:gap-3">



                    {/* Gastos */}
                    {canRegisterExpenses && (
                    <div className="relative">
                        <button
                            onClick={() => handleTabClick('gastos')}
                            className={`h-9 lg:h-10 px-2.5 lg:px-4 xl:px-5 flex items-center gap-1 lg:gap-1.5 xl:gap-2 font-bold text-[12px] lg:text-sm rounded-lg lg:rounded-xl transition-colors border shrink-0 whitespace-nowrap ${visualActiveTab === 'gastos'
                                ? 'bg-status-error text-white border-transparent shadow-lg shadow-status-error/20'
                                : 'bg-red-50 dark:bg-red-900/10 text-status-error dark:text-red-400 border-red-100 dark:border-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/20'
                                }`}
                        >
                            <span>Egresos</span>
                            <span className={`material-symbols-outlined text-[15px] lg:text-[16px] transition-transform duration-200 ${showExpenseDropdown ? 'rotate-180' : ''}`}>expand_more</span>
                        </button>

                        {showExpenseDropdown && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowExpenseDropdown(false)}></div>
                                <div className="absolute top-full left-0 mt-2 w-[19rem] bg-white dark:bg-[#1A2638] border border-slate-300 dark:border-slate-600 ring-1 ring-black/5 dark:ring-white/10 rounded-2xl shadow-xl shadow-slate-900/15 dark:shadow-black/60 z-50 overflow-hidden animate-fadeIn p-2">
                                    <ExpenseActionsMenu variant="dropdown" onSelect={handleExpenseMenuSelect} />
                                </div>
                            </>
                        )}
                    </div>
                    )}

                    {/* Abonos */}
                    <div className="relative">
                        <button
                            onClick={() => setShowAbonosDropdown(!showAbonosDropdown)}
                            className={`h-9 lg:h-10 px-2.5 lg:px-4 xl:px-5 flex items-center gap-1 lg:gap-1.5 xl:gap-2 font-bold text-[12px] lg:text-sm rounded-lg lg:rounded-xl transition-all border shrink-0 whitespace-nowrap ${showAbonosDropdown
                                ? 'bg-amber-50 dark:bg-amber-900/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 shadow-sm'
                                : 'bg-white dark:bg-gray-800/50 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/80 hover:border-gray-300 dark:hover:border-gray-600'
                                }`}
                        >
                            <span>Abonos</span>
                            <span className={`material-symbols-outlined text-[15px] lg:text-[16px] transition-transform duration-200 ${showAbonosDropdown ? 'rotate-180' : ''}`}>expand_more</span>
                        </button>

                        {showAbonosDropdown && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setShowAbonosDropdown(false)}></div>
                                <div className="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-surface-dark border border-slate-300 dark:border-slate-600 ring-1 ring-black/5 dark:ring-white/10 rounded-xl shadow-xl shadow-slate-900/15 dark:shadow-black/60 z-50 overflow-hidden animate-[fadeIn_0.15s_ease-out] p-1">
                                    <button
                                        onClick={() => openAbonosModal('client')}
                                        className="w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group"
                                    >
                                        <div className="size-9 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 group-hover:bg-gray-200 dark:group-hover:bg-gray-600 group-hover:text-gray-900 dark:group-hover:text-white shrink-0 flex items-center justify-center transition-all">
                                            <span className="material-symbols-outlined text-lg">person</span>
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="font-bold text-sm text-text-main dark:text-white leading-tight truncate">Abonos de Clientes</span>
                                            <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">Pago recibido</span>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => openAbonosModal('supplier')}
                                        className="w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors group mt-1"
                                    >
                                        <div className="size-9 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 group-hover:bg-gray-200 dark:group-hover:bg-gray-600 group-hover:text-gray-900 dark:group-hover:text-white shrink-0 flex items-center justify-center transition-all">
                                            <span className="material-symbols-outlined text-lg">local_shipping</span>
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="font-bold text-sm text-text-main dark:text-white leading-tight truncate">Abonos a Proveedor</span>
                                            <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">Pago realizado</span>
                                        </div>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Abrir / Cerrar turno */}
                    <button
                        onClick={() => onNavigate(Screen.CASH_REGISTER)}
                        className="h-9 lg:h-10 px-2.5 lg:px-4 xl:px-5 flex items-center gap-1 lg:gap-1.5 xl:gap-2 font-bold text-[12px] lg:text-sm rounded-lg lg:rounded-xl transition-colors border bg-white dark:bg-gray-800/50 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/80 hover:border-gray-300 dark:hover:border-gray-600 shrink-0 whitespace-nowrap"
                    >
                        <span className="material-symbols-outlined text-[15px] lg:text-[16px]">point_of_sale</span>
                        <span className="lg:hidden">Turno</span>
                        <span className="hidden lg:inline">{isShiftOpen ? 'Cerrar turno' : 'Abrir turno'}</span>
                    </button>

                    {/* Selector de Mesas (modo EAN): visible en el header para todas las resoluciones md+ */}
                    {isEanMode && isTablesEnabled && (
                        <TableSelectorControl
                            mode={selectedTable ? 'table' : 'quick'}
                            activeTableId={activeTableId}
                            onSelectTable={handleTableSelectInternal}
                            onSelectQuickOrder={() => handleTabClick('orden_rapida')}
                            loadingTableId={loadingTableId}
                            variant="popover"
                            unified={true}
                        />
                    )}

                    {/* Selector de modo (Escáner/Catálogo) removido: el modo se controla
                        ahora desde Ajustes → "Activar/Desactivar" (config del negocio en Supabase). */}
                </div>

                {/* Derecha: chip offline o sync success */}
                <div className="flex justify-end items-center ml-1 lg:ml-2 shrink-0">
                    {/* Chip: errores de sync (items fallidos no sincronizables) */}
                    {isOnline && failedCount > 0 && pendingCount === 0 && (
                        <button
                            onClick={onClearFailed}
                            className="flex items-center gap-1.5 lg:gap-2 bg-red-100 hover:bg-red-200 border border-red-300 rounded-lg lg:rounded-xl px-2 lg:px-3 py-1.5 transition-colors shrink-0 max-w-full animate-fadeIn"
                            title="Hay operaciones que no pudieron sincronizarse. Haz clic para descartarlas."
                        >
                            <span className="material-symbols-outlined text-[15px] lg:text-[17px] text-red-600 shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
                                error
                            </span>
                            <span className="hidden lg:inline text-[11px] font-bold text-red-700 whitespace-nowrap">
                                {failedCount} error{failedCount > 1 ? 'es' : ''} · Descartar
                            </span>
                            <span className="lg:hidden text-[11px] font-bold text-red-700">{failedCount}</span>
                        </button>
                    )}

                    {/* Chip: sincronizando o sin conexión */}
                    {(!isOnline || (isOnline && pendingCount > 0)) && (
                        <button
                            onClick={() => !isOnline && setShowFeaturesModal(true)}
                            disabled={isOnline && pendingCount > 0}
                            className="flex items-center gap-1.5 lg:gap-2 bg-amber-400 hover:bg-amber-500 border border-amber-500 rounded-lg lg:rounded-xl px-2 lg:px-3 py-1.5 transition-colors shrink-0 max-w-full group animate-fadeIn disabled:opacity-90 disabled:cursor-default"
                            title={isOnline ? "Sincronizando operaciones..." : "Ver funcionalidades sin conexión"}
                        >
                            <span
                                className={`material-symbols-outlined text-[15px] lg:text-[17px] text-[#102218] shrink-0 ${isOnline && pendingCount > 0 ? 'animate-spin' : ''}`}
                                style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                                {isOnline ? 'sync' : 'wifi_off'}
                            </span>

                            {/* Version amplia (lg en adelante) */}
                            <div className="hidden lg:flex flex-col items-start min-w-0">
                                <span className="text-[11px] leading-tight font-bold text-[#102218] whitespace-nowrap">
                                    {isOnline ? 'Sincronizando...' : 'Sin conexión'} {pendingCount > 0 && <span className="text-[#102218]/80 font-semibold">· {pendingCount} pend.</span>}
                                </span>
                                {!isOnline && (
                                    <span className="text-[10px] leading-tight font-bold text-[#102218] underline decoration-[#102218]/40 group-hover:decoration-[#102218] whitespace-nowrap">
                                        ¿Qué puedes hacer?
                                    </span>
                                )}
                            </div>

                            {/* Version compacta (md a lg) */}
                            <span className="lg:hidden text-[11px] font-bold text-[#102218] whitespace-nowrap">
                                {isOnline ? 'Sincronizando' : 'Offline'} {pendingCount > 0 && <span className="font-semibold">({pendingCount})</span>}
                            </span>
                            {!isOnline && (
                                <span className="lg:hidden material-symbols-outlined text-[14px] text-[#102218] shrink-0">
                                    help
                                </span>
                            )}
                        </button>
                    )}

                    {isOnline && pendingCount === 0 && lastSyncResult && (
                        <div className="flex items-center gap-1.5 lg:gap-2 bg-emerald-500 border border-emerald-600 rounded-lg lg:rounded-xl px-2 lg:px-3 py-1.5 transition-colors shrink-0 max-w-full animate-fadeIn cursor-default">
                            <span
                                className="material-symbols-outlined text-[15px] lg:text-[17px] text-[#102218] shrink-0"
                                style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                                cloud_done
                            </span>
                            
                            {/* Version amplia (lg en adelante) */}
                            <div className="hidden lg:flex flex-col items-start min-w-0">
                                <span className="text-[11px] leading-tight font-bold text-[#102218] whitespace-nowrap">
                                    Sincronización exitosa
                                </span>
                                <span className="text-[10px] leading-tight font-semibold text-[#102218]/80 whitespace-nowrap">
                                    {lastSyncResult.synced} operación{lastSyncResult.synced !== 1 ? 'es' : ''} {lastSyncResult.failed > 0 && <span className="text-red-800 font-bold ml-0.5">· {lastSyncResult.failed} error{lastSyncResult.failed !== 1 ? 'es' : ''}</span>}
                                </span>
                            </div>

                            {/* Version compacta (md a lg) */}
                            <span className="lg:hidden text-[11px] font-bold text-[#102218] whitespace-nowrap">
                                Sincronizado <span className="font-semibold">({lastSyncResult.synced})</span>
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Skeleton de carga removido para entrada fluida en MenuScreen */}

            {/* Contenido Principal - cambia según la tab activa */}
            <main className="flex-1 overflow-hidden flex flex-col">
                {isTablesEnabled && activeTab === 'mesas' && (
                    <TablesScreen
                        onNavigate={onNavigate}
                        onTableSelect={handleTableSelectInternal}
                        onToggleMenu={onToggleMenu}
                        loadingTableId={loadingTableId}
                    />
                )}

                {(activeTab === 'orden_rapida' || activeTab === 'mesa_activa') && (() => {
                    // Un único MenuScreen entre 'orden_rapida' y 'mesa_activa' para que
                    // React mantenga la instancia (no recargar grid de productos ni
                    // parpadear OpenTicketsBar al alternar). Las props se derivan del tab.
                    const isMesaTab = activeTab === 'mesa_activa' && !!selectedTable;
                    return (
                        <MenuScreen
                            onNavigate={(screen) => {
                                if (screen === Screen.SELL || screen === Screen.TABLES) {
                                    // Desde pago: salir del pago, conservar tab activo.
                                    if (currentAppScreen === Screen.PAYMENT) {
                                        onNavigate(Screen.SELL);
                                        return;
                                    }
                                    if (isMesaTab) {
                                        handleBackToTables();
                                    } else {
                                        setActiveTab('orden_rapida');
                                        if (onSwitchTab) onSwitchTab('orden_rapida');
                                    }
                                } else {
                                    onNavigate(screen);
                                }
                            }}
                            cart={cart}
                            addToCart={addToCart}
                            onQuickAdd={onQuickAdd}
                            onQuickAddIndividual={onQuickAddIndividual}
                            onQuickAddWithQuantity={onQuickAddWithQuantity}
                            onEditProduct={onEditProduct}
                            removeFromCart={removeFromCart}
                            updateQuantity={updateQuantity}
                            currentScreen={
                                currentAppScreen === Screen.SUCCESS ? Screen.SUCCESS
                                : currentAppScreen === Screen.PAYMENT ? Screen.PAYMENT
                                : isMesaTab ? Screen.MENU
                                : Screen.QUICK_ORDER
                            }
                            activeTable={isMesaTab ? (activeTable || selectedTable!.label) : 'Orden Rápida'}
                            activeTableId={isMesaTab ? (activeTableId || selectedTable!.id) : undefined}
                            onAddAnimation={onAddAnimation}
                            products={products}
                            productsLoading={productsLoading}
                            saleOrigin={isMesaTab ? 'tables' : 'orders'}
                            hideHeader={false}
                            onAssignClient={onAssignClient}
                            deliveryClientName={deliveryClientName}
                            updateCartItem={updateCartItem}
                            onClearCart={onClearCart}
                            onProcessPayment={onProcessPayment}
                            onSelectTable={isTablesEnabled ? handleTableSelectInternal : undefined}
                            onSelectQuickOrder={isTablesEnabled ? () => handleTabClick('orden_rapida') : undefined}
                            loadingTableId={loadingTableId}
                            onSendCommanda={isMesaTab ? onSendCommanda : undefined}
                            isEanMode={isEanMode}
                            lastTransaction={lastTransaction}
                            receiptData={receiptData}
                            onStartNewSale={onStartNewSale}
                            onReady={onContentReady}
                            comandaLabelSelection={comandaLabelSelection}
                            onComandaLabelSelectionChange={onComandaLabelSelectionChange}
                        />
                    );
                })()}
            </main>



            {/* Mobile Actionsheet for Expenses (replaces dropdown on mobile) */}
            {showExpenseDropdown && (
                <div className="md:hidden fixed inset-0 z-[60] flex items-end justify-center bg-black/50 animate-fadeIn" onClick={() => setShowExpenseDropdown(false)}>
                    <div className="bg-white dark:bg-[#1A2638] w-full rounded-t-2xl p-4 space-y-2 animate-slideUp" onClick={e => e.stopPropagation()}>
                        <div className="w-12 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-4" />
                        <ExpenseActionsMenu variant="sheet" onSelect={handleExpenseMenuSelect} />
                    </div>
                </div>
            )}


            {/* Modal de Gastos */}
            {showExpenseModal && (
                <ExpenseModal
                    onClose={() => {
                        setShowExpenseModal(false);
                        if (window.location.pathname === '/gastos' || window.location.pathname === '/compra-inventario') {
                            window.history.replaceState(null, '', '/');
                            document.title = 'Bistro POS';
                            const mLink = document.getElementById('pwa-manifest') || document.querySelector('link[rel="manifest"]');
                            if (mLink) mLink.setAttribute('href', '/manifest.json');
                        }
                    }}
                    onSave={async (data) => {
                        try {
                            if (data.type !== 'inventory') await createExpense(data);
                            if (data.type !== 'expense') setShowExpenseModal(false);
                        } catch (error) {
                            console.error('Error saving expense:', error);
                            showToast('Error al registrar', 'error');
                        }
                    }}
                    initialType={expenseModalType}
                />
            )}

            {/* Modal de Abonos Rápidos */}
            {showAbonosModal && (
                <QuickTransactionModal
                    isOpen={showAbonosModal}
                    onClose={() => setShowAbonosModal(false)}
                    type={abonosType}
                />
            )}

            {/* Escaneo_Unificado (Foto a factura) */}
            {showInvoiceScan && (
                <Suspense fallback={<ScanLoadingFallback />}>
                    <InvoiceScanScreen onClose={() => setShowInvoiceScan(false)} />
                </Suspense>
            )}

            {/* Chip offline flotante (solo desktop) para cuando el header de SellScreen
                está oculto en modo Catálogo + sidebar colapsado. En desktop el aviso de
                conexión vive únicamente en ese header, así que sin esto el indicador
                desaparece en la vista de catálogo a pantalla completa. Se ancla en la
                esquina inferior izquierda (left-20) para no tapar el riel del sidebar
                ni las categorías/buscador del catálogo (que están arriba). */}
            {(!isEanMode && isSidebarCollapsed) && currentAppScreen !== Screen.SUCCESS && (!isOnline || pendingCount > 0 || failedCount > 0) && (
                <div className="hidden md:flex fixed bottom-3 left-20 z-[55] animate-fadeIn">
                    {isOnline && failedCount > 0 && pendingCount === 0 ? (
                        <button
                            onClick={onClearFailed}
                            className="flex items-center gap-2 bg-red-100 hover:bg-red-200 border border-red-300 rounded-xl px-3 py-1.5 shadow-lg transition-colors"
                            title="Hay operaciones que no pudieron sincronizarse. Haz clic para descartarlas."
                        >
                            <span className="material-symbols-outlined text-[17px] text-red-600" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
                            <span className="text-[11px] font-bold text-red-700 whitespace-nowrap">{failedCount} error{failedCount > 1 ? 'es' : ''} · Descartar</span>
                        </button>
                    ) : (
                        <button
                            onClick={() => !isOnline && setShowFeaturesModal(true)}
                            disabled={isOnline && pendingCount > 0}
                            className="flex items-center gap-2 bg-amber-400 hover:bg-amber-500 border border-amber-500 rounded-xl px-3 py-1.5 shadow-lg transition-colors group disabled:opacity-90 disabled:cursor-default"
                            title={isOnline ? 'Sincronizando operaciones...' : 'Ver funcionalidades sin conexión'}
                        >
                            <span
                                className={`material-symbols-outlined text-[17px] text-[#102218] ${isOnline && pendingCount > 0 ? 'animate-spin' : ''}`}
                                style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                                {isOnline ? 'sync' : 'wifi_off'}
                            </span>
                            <div className="flex flex-col items-start leading-tight">
                                <span className="text-[11px] font-bold text-[#102218] whitespace-nowrap">
                                    {isOnline ? 'Sincronizando...' : 'Sin conexión'} {pendingCount > 0 && <span className="text-[#102218]/80 font-semibold">· {pendingCount} pend.</span>}
                                </span>
                                {!isOnline && (
                                    <span className="text-[10px] font-bold text-[#102218] underline decoration-[#102218]/40 group-hover:decoration-[#102218] whitespace-nowrap">
                                        ¿Qué puedes hacer?
                                    </span>
                                )}
                            </div>
                        </button>
                    )}
                </div>
            )}

            {/* Modal de funcionalidades offline */}
            {showFeaturesModal && (
                <OfflineFeaturesModal onClose={() => setShowFeaturesModal(false)} />
            )}

            {/* Sidebar de Escanear Foto Orden */}
            {isScanSidebarOpen && (
                <div className="fixed inset-0 z-[70] flex items-center justify-end">
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
                        onClick={() => setIsScanSidebarOpen(false)}
                    />
                    <div className="relative h-full w-full max-w-md bg-surface-light dark:bg-surface-dark shadow-2xl flex flex-col animate-[slideInRight_0.4s_cubic-bezier(0.16,1,0.3,1)]">
                        <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full size-8 border-b-2 border-blue-500" /></div>}>
                            <PhotoOrderScreen
                                products={products || []}
                                onAddItems={async (items) => {
                                    if (onPhotoOrderAdd) await onPhotoOrderAdd(items);
                                    setIsScanSidebarOpen(false);
                                }}
                                onClose={() => setIsScanSidebarOpen(false)}
                                hideHeader={false}
                            />
                        </Suspense>
                    </div>
                </div>
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
