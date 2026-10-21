import React, { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { Screen } from '../types';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useHomeData } from '../hooks/useHomeData';
import { formatCurrency, getRealEmail } from '../lib/formatters';
import { useExpenses } from '../hooks/useExpenses';
import { useToast } from '../context/ToastContext';
import { ExpenseModal } from '../components/ExpenseModal';
import { ExpenseActionsMenu, type ExpenseMenuAction } from '../components/expense/ExpenseActionsMenu';
import { ScanLoadingFallback } from '../components/invoiceScan/ScanLoadingFallback';
import QuickTransactionModal from '../components/modals/QuickTransactionModal';
import { MobileNavBar } from '../components/MobileNavBar';
import { canSeeSubscriptionMenu, HIDDEN_PRICES_BUSINESS_ID } from '../lib/specialBusinesses';
import { useCustomPlan } from '../hooks/useCustomPlan';
import { SettingsSidebarPanel } from '../components/SettingsSidebarPanel';
import { SalesModeSettingsPanel } from '../components/SalesModeSettingsPanel';
import { usePlanFeatures } from '../hooks/usePlanFeatures';
import { UpgradeProModal } from '../components/modals/UpgradeProModal';
import { useIsMobile } from '../hooks/useIsMobile';

// Escaneo_Unificado: se monta como overlay `fixed inset-0` sobre la pantalla de
// origen (mismo patrón que `ExpenseModal`). Lazy para no inflar la carga de Inicio.
const InvoiceScanScreen = lazy(() => import('./InvoiceScanScreen'));

// Flag de módulo: true solo en la primera carga de la app (recarga de página).
// En navegaciones posteriores ya es false, así el slide-up aplica normalmente.
let _homeFirstMount = true;

interface HomeScreenProps {
    onNavigate: (screen: Screen) => void;
    ragUnreadCount?: number;
    isShiftOpen?: boolean;
    isCashPanelOpen?: boolean;
    isOnline?: boolean;
}

const formatCompact = (value: number): string => {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
    return `$${formatCurrency(value)}`;
};

const isRunningAsPwa = (): boolean => {
    if (typeof window === 'undefined') return false;
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
    const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    return !!(standalone || iosStandalone);
};

export const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigate, ragUnreadCount = 0, isShiftOpen = false, isCashPanelOpen = false, isOnline = true }) => {
    // Captura el estado del flag en el momento exacto del montaje
    const isFirstMount = useRef(_homeFirstMount);
    useEffect(() => { _homeFirstMount = false; }, []);

    // Detectar si se está ejecutando como PWA instalada y viewport móvil
    const isMobile = useIsMobile();
    const [isPwa, setIsPwa] = useState(isRunningAsPwa);
    const [isAppInstalled, setIsAppInstalled] = useState(false);
    const [showInstallGuideModal, setShowInstallGuideModal] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        if (isRunningAsPwa()) {
            setIsAppInstalled(true);
        }

        if ('getInstalledRelatedApps' in navigator) {
            (navigator as any).getInstalledRelatedApps().then((relatedApps: any[]) => {
                if (relatedApps && relatedApps.length > 0) {
                    setIsAppInstalled(true);
                }
            }).catch(() => {});
        }

        const handleAppInstalled = () => {
            (window as any).__bistroInstallPrompt = null;
            setIsAppInstalled(true);
            setIsPwa(true);
        };

        window.addEventListener('appinstalled', handleAppInstalled);
        window.addEventListener('bistro-app-installed', handleAppInstalled);

        let mql: MediaQueryList | null = null;
        let handleChange: ((e: MediaQueryListEvent) => void) | null = null;
        if (window.matchMedia) {
            mql = window.matchMedia('(display-mode: standalone)');
            handleChange = (e: MediaQueryListEvent) => {
                const standalone = e.matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
                setIsPwa(standalone);
                if (standalone) setIsAppInstalled(true);
            };
            mql.addEventListener('change', handleChange);
        }

        return () => {
            window.removeEventListener('appinstalled', handleAppInstalled);
            window.removeEventListener('bistro-app-installed', handleAppInstalled);
            if (mql && handleChange) mql.removeEventListener('change', handleChange);
        };
    }, []);

    const { profile, signOut } = useAuth();
    const { hasPermission, canAccessScreen, canFinalizeSale } = usePermissions();
    const canSeeKpis = canFinalizeSale();
    const canRegisterExpenses = hasPermission('inv_purchase');
    const canSeeClients = canAccessScreen(Screen.CLIENTS);
    const canSeeDebts = canAccessScreen(Screen.DEBTS);
    const data = useHomeData();
    const { showToast } = useToast();
    const { createExpense } = useExpenses();
    const { canUsePhysicalInventory } = usePlanFeatures();
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    // Profile sheet
    const [showProfileSheet, setShowProfileSheet] = useState(false);
    // La opción "Suscripciones" del sheet la ve solo admin (permiso admin_settings), y además:
    // - Siempre en el negocio de pruebas 10000 (legado).
    // - En cualquier otro negocio, solo si tiene un plan personalizado asignado.
    const { hasCustomPlan } = useCustomPlan();
    const canShowSubscription = canSeeSubscriptionMenu(
        profile?.business_id,
        hasCustomPlan,
        hasPermission('admin_settings'),
    );

    // Gastos modal state
    const [showExpenseSheet, setShowExpenseSheet] = useState(false);
    const [isClosingExpense, setIsClosingExpense] = useState(false);
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [expenseModalType, setExpenseModalType] = useState<'inventory' | 'expense' | 'waste'>('expense');
    const [showInvoiceScan, setShowInvoiceScan] = useState(false);

    // Abonos modal state
    const [showAbonosSheet, setShowAbonosSheet] = useState(false);
    const [isClosingAbonos, setIsClosingAbonos] = useState(false);
    const [showAbonosModal, setShowAbonosModal] = useState(false);
    const [abonosType, setAbonosType] = useState<'client' | 'supplier'>('client');

    // Configuración sheet + paneles state
    const [showSettingsSheet, setShowSettingsSheet] = useState(false);
    const [isClosingSettings, setIsClosingSettings] = useState(false);
    const [isReceiptSettingsOpen, setIsReceiptSettingsOpen] = useState(false);
    const [isSalesModeSettingsOpen, setIsSalesModeSettingsOpen] = useState(false);

    // Swipe-to-dismiss para action sheets (mismo patrón que MobileNavBar)
    const [swipeOffset, setSwipeOffset] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const swipeStartY = useRef<number | null>(null);
    const swipeOffsetRef = useRef(0);
    const isDraggingRef = useRef(false);
    const expensePanelRef = useRef<HTMLDivElement>(null);
    const abonosPanelRef = useRef<HTMLDivElement>(null);
    const settingsPanelRef = useRef<HTMLDivElement>(null);
    const profilePanelRef = useRef<HTMLDivElement>(null);

    const updateSwipeOffset = useCallback((val: number) => {
        swipeOffsetRef.current = val;
        setSwipeOffset(val);
    }, []);

    const closeExpenseSheet = useCallback(() => {
        setIsClosingExpense(true);
        setTimeout(() => {
            setShowExpenseSheet(false);
            setIsClosingExpense(false);
            setSwipeOffset(0);
            swipeOffsetRef.current = 0;
        }, 250);
    }, []);

    const closeAbonosSheet = useCallback(() => {
        setIsClosingAbonos(true);
        setTimeout(() => {
            setShowAbonosSheet(false);
            setIsClosingAbonos(false);
            setSwipeOffset(0);
            swipeOffsetRef.current = 0;
        }, 250);
    }, []);

    const closeSettingsSheet = useCallback(() => {
        setIsClosingSettings(true);
        setTimeout(() => {
            setShowSettingsSheet(false);
            setIsClosingSettings(false);
            setSwipeOffset(0);
            swipeOffsetRef.current = 0;
        }, 250);
    }, []);

    const handleInstallApp = useCallback(async () => {
        const promptEvent = (window as any).__bistroInstallPrompt;
        if (promptEvent) {
            try {
                await promptEvent.prompt();
                const choice = await promptEvent.userChoice;
                if (choice?.outcome === 'accepted') {
                    (window as any).__bistroInstallPrompt = null;
                    setIsAppInstalled(true);
                    showToast('¡Bistro POS se está instalando en tu dispositivo!', 'success');
                    closeSettingsSheet();
                }
            } catch {
                closeSettingsSheet();
                setTimeout(() => setShowInstallGuideModal(true), 260);
            }
        } else {
            closeSettingsSheet();
            setTimeout(() => setShowInstallGuideModal(true), 260);
        }
    }, [closeSettingsSheet, showToast]);

    // touchmove con passive:false para poder preventDefault y bloquear el pull-to-refresh
    useEffect(() => {
        const el = expensePanelRef.current;
        if (!el) return;
        const handler = (e: TouchEvent) => {
            if (swipeStartY.current === null) return;
            const delta = e.touches[0].clientY - swipeStartY.current;
            if (delta > 5) {
                e.preventDefault();
                if (!isDraggingRef.current) {
                    isDraggingRef.current = true;
                    setIsDragging(true);
                }
                swipeOffsetRef.current = delta;
                setSwipeOffset(delta);
            }
        };
        el.addEventListener('touchmove', handler, { passive: false });
        return () => el.removeEventListener('touchmove', handler);
    }, [showExpenseSheet, isClosingExpense]);

    useEffect(() => {
        const el = abonosPanelRef.current;
        if (!el) return;
        const handler = (e: TouchEvent) => {
            if (swipeStartY.current === null) return;
            const delta = e.touches[0].clientY - swipeStartY.current;
            if (delta > 5) {
                e.preventDefault();
                if (!isDraggingRef.current) {
                    isDraggingRef.current = true;
                    setIsDragging(true);
                }
                swipeOffsetRef.current = delta;
                setSwipeOffset(delta);
            }
        };
        el.addEventListener('touchmove', handler, { passive: false });
        return () => el.removeEventListener('touchmove', handler);
    }, [showAbonosSheet, isClosingAbonos]);

    useEffect(() => {
        const el = settingsPanelRef.current;
        if (!el) return;
        const handler = (e: TouchEvent) => {
            if (swipeStartY.current === null) return;
            const delta = e.touches[0].clientY - swipeStartY.current;
            if (delta > 5) {
                e.preventDefault();
                if (!isDraggingRef.current) {
                    isDraggingRef.current = true;
                    setIsDragging(true);
                }
                swipeOffsetRef.current = delta;
                setSwipeOffset(delta);
            }
        };
        el.addEventListener('touchmove', handler, { passive: false });
        return () => el.removeEventListener('touchmove', handler);
    }, [showSettingsSheet, isClosingSettings]);

    useEffect(() => {
        const el = profilePanelRef.current;
        if (!el) return;
        const handler = (e: TouchEvent) => {
            if (swipeStartY.current === null) return;
            const delta = e.touches[0].clientY - swipeStartY.current;
            if (delta > 5) {
                e.preventDefault();
                if (!isDraggingRef.current) {
                    isDraggingRef.current = true;
                    setIsDragging(true);
                }
                swipeOffsetRef.current = delta;
                setSwipeOffset(delta);
            }
        };
        el.addEventListener('touchmove', handler, { passive: false });
        return () => el.removeEventListener('touchmove', handler);
    }, [showProfileSheet]);

    // Redirect to Sell on desktop/tablet (excepto si viene por acceso directo de gastos, compra o foto venta)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const action = params.get('action');
        if (window.location.pathname === '/gastos' || window.location.pathname === '/compra-inventario' || action === 'expense' || action === 'gastos' || action === 'inventory' || action === 'compra') return;
        if (window.location.pathname === '/foto-venta' || action === 'foto_venta' || action === 'photo_order') return;
        if (window.innerWidth >= 768) {
            onNavigate(Screen.SELL);
        }
    }, [onNavigate]);

    // Abrir automáticamente PhotoOrderScreen o modal de gastos/compra si la app se lanzó desde acceso directo
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const action = params.get('action');
        const isFotoVentaRoute = window.location.pathname === '/foto-venta' || action === 'foto_venta' || action === 'photo_order';
        if (isFotoVentaRoute) {
            if (typeof window !== 'undefined') {
                window.history.replaceState(null, '', '/');
                document.title = 'Bistro POS';
                const mLink = document.getElementById('pwa-manifest') || document.querySelector('link[rel="manifest"]');
                if (mLink) mLink.setAttribute('href', '/manifest.json');
            }
            onNavigate(Screen.PHOTO_ORDER);
            return;
        }

        const isCompraRoute = window.location.pathname === '/compra-inventario' || action === 'inventory' || action === 'compra';
        if (isCompraRoute) {
            setExpenseModalType('inventory');
            setShowExpenseModal(true);
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
            setExpenseModalType('expense');
            setShowExpenseModal(true);
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
    }, [onNavigate]);

    const firstName = profile?.full_name?.split(' ')[0] || 'Usuario';
    const businessName = profile?.business_name || 'Mi Negocio';
    const avatarLetter = (profile?.full_name || getRealEmail(profile?.email) || 'U')[0].toUpperCase();

    const { todaySales, clientsDebt, todayExpenses, loading } = data;

    const openExpenseModal = (type: 'inventory' | 'expense' | 'waste') => {
        setExpenseModalType(type);
        closeExpenseSheet();
        setTimeout(() => setShowExpenseModal(true), 260);
    };

    // "Foto a factura" abre el Escaneo_Unificado; las demás conservan su modal.
    // En ambos casos se cierra la hoja primero y se espera su animación (260 ms).
    const handleExpenseMenuSelect = (action: ExpenseMenuAction) => {
        if (action === 'foto_factura') {
            closeExpenseSheet();
            setTimeout(() => setShowInvoiceScan(true), 260);
            return;
        }
        openExpenseModal(action);
    };

    const openAbonosModal = (type: 'client' | 'supplier') => {
        setAbonosType(type);
        closeAbonosSheet();
        setTimeout(() => setShowAbonosModal(true), 260);
    };

    // Items de la sección Operación, ya filtrados por permiso de acceso.
    // Historial requiere además permiso de finalizar ventas (canSeeKpis).
    const operationItems = useMemo(() => [
        { icon: 'photo_camera', label: 'Foto Venta', sub: 'Lista de ventas', screen: Screen.PHOTO_ORDER, iconBg: 'bg-violet-50', iconColor: 'text-violet-600' },
        { icon: 'receipt_long', label: 'Historial', sub: `${todaySales.count} ventas hoy`, screen: Screen.SALES, requiresSell: true, iconBg: 'bg-sky-50', iconColor: 'text-sky-600' },
        { icon: 'shopping_bag', label: 'Productos', sub: 'Catálogo', screen: Screen.PRODUCTS, iconBg: 'bg-orange-50', iconColor: 'text-orange-600' },
        { icon: 'bar_chart_4_bars', label: 'Estadísticas', sub: 'Reportes y KPIs', screen: Screen.DASHBOARD, iconBg: 'bg-indigo-50', iconColor: 'text-indigo-600' },
    ].filter(item => canAccessScreen(item.screen) && (!item.requiresSell || canSeeKpis)),
    [canAccessScreen, canSeeKpis, todaySales.count]);

    // Items de la sección Gestión (antes estaban en el drawer "Más").
    const managementItems = useMemo(() => [
        { icon: 'inventory_2', label: 'Inventario', sub: 'Stock y conteo', screen: Screen.INVENTORY as Screen | null, iconBg: 'bg-teal-50', iconColor: 'text-teal-600' },
        { icon: 'badge', label: 'Empleados', sub: 'Gestión de equipo', screen: Screen.EMPLOYEES as Screen | null, iconBg: 'bg-pink-50', iconColor: 'text-pink-600' },
        { icon: 'history', label: 'Actividad', sub: 'Registro de operaciones', screen: Screen.ACTIVITY as Screen | null, iconBg: 'bg-cyan-50', iconColor: 'text-cyan-600' },
        { icon: 'settings', label: 'Configuración', sub: 'Ajustes del negocio', screen: null as Screen | null, isSettings: true, iconBg: 'bg-slate-100', iconColor: 'text-slate-600' },
    ].filter(item => {
        if (item.isSettings) return hasPermission('admin_settings');
        return item.screen ? canAccessScreen(item.screen) : false;
    }),
    [canAccessScreen, hasPermission]);

    const sectionContainerClass = isPwa
        ? "flex-1 min-h-0 flex flex-col justify-between gap-2 min-[380px]:gap-3 px-3 min-[380px]:px-4 pt-1.5 pb-2.5 max-w-xl mx-auto w-full"
        : "flex flex-col gap-3.5 min-[380px]:gap-4 px-3 min-[380px]:px-4 pt-2 pb-6 max-w-xl mx-auto w-full";

    const sectionBlockClass = isPwa ? "flex-1 min-h-0 flex flex-col justify-center" : "flex flex-col";

    const gridClass = "grid grid-cols-2 auto-rows-fr gap-2 min-[380px]:gap-2.5";

    const cardButtonClass = "bg-white rounded-2xl px-2.5 py-2 min-[380px]:p-3.5 border border-slate-100 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex items-center gap-2 min-[380px]:gap-3 hover:bg-slate-50 active:scale-[0.99] transition-all text-left h-full min-h-[64px] min-[380px]:min-h-[70px] overflow-hidden";

    return (
        <>
        <div
            style={{ paddingTop: !isOnline ? 'calc(var(--grace-banner-h, 0px) + 32px)' : 'var(--grace-banner-h, 0px)' }}
            className={`absolute inset-0 bg-slate-50 overflow-y-auto ${isPwa ? 'flex flex-col pb-[calc(76px+max(12px,env(safe-area-inset-bottom,0px)))]' : 'pb-[calc(84px+env(safe-area-inset-bottom,0px))]'} ${isFirstMount.current ? '' : 'animate-slideInUpSubtle'}`}
        >
            <style>{`
                .hm-display { font-family: 'Plus Jakarta Sans', sans-serif; }
                .hm-body { font-family: 'Noto Sans', sans-serif; }
                .hm-mono { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
                .hm-kpi-row::-webkit-scrollbar { display: none; }
            `}</style>

            {loading ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[70vh] gap-3">
                    <div className="size-8 border-[3px] border-slate-200 border-t-amber-400 rounded-full animate-spin" />
                    <p className="hm-display text-sm text-slate-500 font-medium">Cargando tu negocio...</p>
                </div>
            ) : (
                <>
            {/* ── Header ── */}
            <header className={`bg-white border-b border-slate-100 shrink-0 flex items-center justify-between ${isPwa ? 'px-3.5 min-[380px]:px-4 py-2.5' : 'px-4 pt-4 pb-3'}`}>
                <div className="flex items-center gap-2.5 min-[380px]:gap-3">
                    <button
                        onClick={() => setShowProfileSheet(true)}
                        aria-label="Ver opciones de perfil"
                        className="shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                    >
                        {profile?.avatar_url ? (
                            <img src={profile.avatar_url} alt="avatar" className="size-9 min-[380px]:size-10 rounded-full object-cover" />
                        ) : (
                            <div className="size-9 min-[380px]:size-10 rounded-full bg-amber-400 flex items-center justify-center">
                                <span className="hm-display text-xs min-[380px]:text-sm font-bold text-[#102218]">{avatarLetter}</span>
                            </div>
                        )}
                    </button>
                    <div>
                        <p className="hm-body text-[11px] min-[380px]:text-xs text-slate-500 leading-none mb-0.5">Hola, {firstName}</p>
                        <p className="hm-display text-[13px] min-[380px]:text-sm font-700 text-slate-900 leading-tight" style={{ fontWeight: 700 }}>{businessName}</p>
                    </div>
                </div>
                <button
                    aria-label="Notificaciones"
                    className="size-9 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors text-slate-500"
                >
                    <span className="material-symbols-outlined text-[22px]">notifications</span>
                </button>
            </header>

            {/* ── KPI Cards: ocultadas temporalmente a petición del usuario ── */}

            {/* ── Contenedor de secciones: distribución simétrica y elástica en el alto disponible ── */}
            <div className={sectionContainerClass}>

                {/* ── Finanzas (2x2 grid) ── */}
                {(canRegisterExpenses || canSeeClients || canSeeDebts) && (
                <div className={sectionBlockClass}>
                    <p className="hm-display text-xs min-[380px]:text-[12px] text-slate-400 mb-2 shrink-0 font-bold tracking-wider uppercase">Finanzas</p>
                    <div className={gridClass}>
                        {/* Gastos */}
                        {canRegisterExpenses && (
                        <button
                            onClick={() => setShowExpenseSheet(true)}
                            className={cardButtonClass}
                            aria-label="Egresos"
                        >
                            <div className="size-9 min-[380px]:size-11 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-rose-500 text-[20px] min-[380px]:text-[24px]">south_east</span>
                            </div>
                            <div className="min-w-0 flex-1 flex flex-col justify-center">
                                <p className="hm-display text-[13.5px] min-[380px]:text-[15px] sm:text-base font-bold text-slate-800 leading-snug truncate">Egresos</p>
                                <p className="hm-body text-[11px] min-[380px]:text-[12px] sm:text-[13px] text-slate-500 leading-tight mt-0.5 line-clamp-2">
                                    {profile?.business_id === HIDDEN_PRICES_BUSINESS_ID ? 'Gasto · merma' : 'Compra · merma'}
                                </p>
                            </div>
                        </button>
                        )}

                        {/* Abonos */}
                        {(canSeeClients || canSeeDebts) && (
                        <button
                            onClick={() => setShowAbonosSheet(true)}
                            className={cardButtonClass}
                            aria-label="Abonos"
                        >
                            <div className="size-9 min-[380px]:size-11 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-emerald-600 text-[20px] min-[380px]:text-[24px]">savings</span>
                            </div>
                            <div className="min-w-0 flex-1 flex flex-col justify-center">
                                <p className="hm-display text-[13.5px] min-[380px]:text-[15px] sm:text-base font-bold text-slate-800 leading-snug truncate">Abonos</p>
                                <p className="hm-body text-[11px] min-[380px]:text-[12px] sm:text-[13px] text-slate-500 leading-tight mt-0.5 line-clamp-2">Cliente · proveedor</p>
                            </div>
                        </button>
                        )}

                        {/* Clientes */}
                        {canSeeClients && (
                        <button
                            onClick={() => onNavigate(Screen.CLIENTS)}
                            className={cardButtonClass}
                            aria-label="Clientes"
                        >
                            <div className="size-9 min-[380px]:size-11 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-amber-600 text-[20px] min-[380px]:text-[24px]">groups</span>
                            </div>
                            <div className="min-w-0 flex-1 flex flex-col justify-center">
                                <p className="hm-display text-[13.5px] min-[380px]:text-[15px] sm:text-base font-bold text-slate-800 leading-snug truncate">Clientes</p>
                                <p className="hm-body text-[11px] min-[380px]:text-[12px] sm:text-[13px] text-slate-500 leading-tight mt-0.5 line-clamp-2">
                                    {clientsDebt.total > 0 ? formatCompact(clientsDebt.total) + ' pendiente' : 'Sin deudas'}
                                </p>
                            </div>
                        </button>
                        )}

                        {/* Proveedores */}
                        {canSeeDebts && (
                        <button
                            onClick={() => onNavigate(Screen.DEBTS)}
                            className={cardButtonClass}
                            aria-label="Proveedores"
                        >
                            <div className="size-9 min-[380px]:size-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-blue-600 text-[20px] min-[380px]:text-[24px]">credit_card</span>
                            </div>
                            <div className="min-w-0 flex-1 flex flex-col justify-center">
                                <p className="hm-display text-[13.5px] min-[380px]:text-[15px] sm:text-base font-bold text-slate-800 leading-snug truncate">Proveedores</p>
                                <p className="hm-body text-[11px] min-[380px]:text-[12px] sm:text-[13px] text-slate-500 leading-tight mt-0.5 line-clamp-2">Facturas</p>
                            </div>
                        </button>
                        )}
                    </div>
                </div>
                )}

                {/* ── Operación (2x2 grid) ── */}
                {operationItems.length > 0 && (
                <div className={sectionBlockClass}>
                    <p className="hm-display text-xs min-[380px]:text-[12px] text-slate-400 mb-2 shrink-0 font-bold tracking-wider uppercase">Operación</p>
                    <div className={gridClass}>
                        {operationItems.map(item => (
                            <button
                                key={item.label}
                                onClick={() => onNavigate(item.screen)}
                                className={cardButtonClass}
                                aria-label={item.label}
                            >
                                <div className={`size-9 min-[380px]:size-11 rounded-xl ${item.iconBg} flex items-center justify-center shrink-0`}>
                                    <span className={`material-symbols-outlined ${item.iconColor} text-[20px] min-[380px]:text-[24px]`}>{item.icon}</span>
                                </div>
                                <div className="min-w-0 flex-1 flex flex-col justify-center">
                                    <p className="hm-display text-[13.5px] min-[380px]:text-[15px] sm:text-base font-bold text-slate-800 leading-snug truncate">
                                        {item.label === 'Estadísticas' ? (
                                            <>
                                                <span className="min-[380px]:hidden">Panel</span>
                                                <span className="hidden min-[380px]:inline">Estadísticas</span>
                                            </>
                                        ) : (
                                            item.label
                                        )}
                                    </p>
                                    <p className="hm-body text-[11px] min-[380px]:text-[12px] sm:text-[13px] text-slate-500 leading-tight mt-0.5 line-clamp-2">{item.sub}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
                )}

                {/* ── Gestión (2x2 grid) ── */}
                {managementItems.length > 0 && (
                <div className={sectionBlockClass}>
                    <p className="hm-display text-xs min-[380px]:text-[12px] text-slate-400 mb-2 shrink-0 font-bold tracking-wider uppercase">Gestión</p>
                    <div className={gridClass}>
                        {managementItems.map(item => (
                            <button
                                key={item.label}
                                onClick={() => {
                                    if (item.screen === Screen.INVENTORY && !canUsePhysicalInventory) {
                                        setShowUpgradeModal(true);
                                        return;
                                    }
                                    if (item.isSettings) {
                                        setShowSettingsSheet(true);
                                    } else if (item.screen) {
                                        onNavigate(item.screen);
                                    }
                                }}
                                className={cardButtonClass}
                                aria-label={item.label}
                            >
                                <div className={`size-9 min-[380px]:size-11 rounded-xl ${item.iconBg} flex items-center justify-center shrink-0`}>
                                    <span className={`material-symbols-outlined ${item.iconColor} text-[20px] min-[380px]:text-[24px]`}>{item.icon}</span>
                                </div>
                                <div className="min-w-0 flex-1 flex flex-col justify-center">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <p className="hm-display text-[13.5px] min-[380px]:text-[15px] sm:text-base font-bold text-slate-800 leading-snug truncate">{item.label}</p>
                                        {item.screen === Screen.INVENTORY && !canUsePhysicalInventory && (
                                            <span className="px-1.5 py-0.5 text-[8px] font-black bg-amber-100 text-amber-800 rounded border border-amber-300/60 shrink-0 uppercase tracking-wider">
                                                PRO
                                            </span>
                                        )}
                                    </div>
                                    <p className="hm-body text-[11px] min-[380px]:text-[12px] sm:text-[13px] text-slate-500 leading-tight mt-0.5 line-clamp-2">{item.sub}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
                )}

                {/* Spacer solo en web convencional */}
                {!isPwa && <div className="h-2" />}
            </div>
            </>
            )}
        </div>

        {/* Nav fuera del div animado — el transform del padre capturaría fixed hijos */}
        <MobileNavBar
            currentScreen={Screen.HOME}
            onNavigate={onNavigate}
            ragUnreadCount={ragUnreadCount}
            isShiftOpen={isShiftOpen}
            isCashPanelOpen={isCashPanelOpen}
        />

        {/* ── Action Sheet: Gastos ── */}
        {(showExpenseSheet || isClosingExpense) && (
            <div
                className={`fixed inset-0 z-[100] flex items-end justify-center bg-black/50 transition-opacity duration-250 ${isClosingExpense ? 'opacity-0' : 'opacity-100 animate-fadeIn'}`}
                onClick={closeExpenseSheet}
                role="dialog"
                aria-label="Seleccionar tipo de egreso"
            >
                <div
                    ref={expensePanelRef}
                    className={`bg-white w-full rounded-t-2xl pt-0 pb-6 px-4 space-y-2 ${!isDragging ? 'transition-transform duration-250 ease-out' : ''} ${!isClosingExpense && swipeOffset === 0 && !isDragging ? 'animate-slideUp' : ''}`}
                    style={{ transform: `translateY(${isClosingExpense ? '100%' : swipeOffset + 'px'})`, touchAction: 'none', paddingBottom: 'max(24px, calc(env(safe-area-inset-bottom, 0px) + 16px))' }}
                    onClick={e => e.stopPropagation()}
                    onTouchStart={e => {
                        swipeStartY.current = e.touches[0].clientY;
                    }}
                    onTouchEnd={() => {
                        swipeStartY.current = null;
                        if (isDraggingRef.current) {
                            isDraggingRef.current = false;
                            setIsDragging(false);
                            if (swipeOffsetRef.current > 80) closeExpenseSheet();
                            else updateSwipeOffset(0);
                        }
                    }}
                >
                    <div className="flex items-center justify-center py-3">
                        <div className="w-12 h-1 bg-gray-300 rounded-full" />
                    </div>
                    {/* Menú compartido: "Foto a factura" (con IA) primero y las tres
                        manuales debajo. Antes esta hoja tenía su propia lista literal
                        con la foto al final y sin el gating sin conexión. */}
                    <ExpenseActionsMenu variant="sheet" onSelect={handleExpenseMenuSelect} />
                </div>
            </div>
        )}

        {/* ── Action Sheet: Abonos ── */}
        {(showAbonosSheet || isClosingAbonos) && (
            <div
                className={`fixed inset-0 z-[100] flex items-end justify-center bg-black/50 transition-opacity duration-250 ${isClosingAbonos ? 'opacity-0' : 'opacity-100 animate-fadeIn'}`}
                onClick={closeAbonosSheet}
                role="dialog"
                aria-label="Seleccionar tipo de abono"
            >
                <div
                    ref={abonosPanelRef}
                    className={`bg-white w-full rounded-t-2xl pt-0 pb-6 px-4 space-y-2 ${!isDragging ? 'transition-transform duration-250 ease-out' : ''} ${!isClosingAbonos && swipeOffset === 0 && !isDragging ? 'animate-slideUp' : ''}`}
                    style={{ transform: `translateY(${isClosingAbonos ? '100%' : swipeOffset + 'px'})`, touchAction: 'none', paddingBottom: 'max(24px, calc(env(safe-area-inset-bottom, 0px) + 16px))' }}
                    onClick={e => e.stopPropagation()}
                    onTouchStart={e => {
                        swipeStartY.current = e.touches[0].clientY;
                    }}
                    onTouchEnd={() => {
                        swipeStartY.current = null;
                        if (isDraggingRef.current) {
                            isDraggingRef.current = false;
                            setIsDragging(false);
                            if (swipeOffsetRef.current > 80) closeAbonosSheet();
                            else updateSwipeOffset(0);
                        }
                    }}
                >
                    <div className="flex items-center justify-center py-3">
                        <div className="w-12 h-1 bg-gray-300 rounded-full" />
                    </div>
                    <button
                        onClick={() => openAbonosModal('client')}
                        className={`w-full text-left px-4 py-4 rounded-xl flex items-center gap-3 text-base font-bold text-slate-700 bg-gray-50 hover:bg-gray-100 ${canSeeClients ? '' : 'hidden'}`}
                    >
                        <div className="size-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined">person</span>
                        </div>
                        <span className="flex-1">Abonos de Clientes</span>
                        <span className="material-symbols-outlined text-gray-400">chevron_right</span>
                    </button>
                    <button
                        onClick={() => openAbonosModal('supplier')}
                        className={`w-full text-left px-4 py-4 rounded-xl flex items-center gap-3 text-base font-bold text-slate-700 bg-gray-50 hover:bg-gray-100 ${canSeeDebts ? '' : 'hidden'}`}
                    >
                        <div className="size-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined">local_shipping</span>
                        </div>
                        <span className="flex-1">Abonos a Proveedor</span>
                        <span className="material-symbols-outlined text-gray-400">chevron_right</span>
                    </button>
                </div>
            </div>
        )}

        {/* ── Action Sheet: Configuración ── */}
        {(showSettingsSheet || isClosingSettings) && (
            <div
                className={`fixed inset-0 z-[100] flex items-end justify-center bg-black/50 transition-opacity duration-250 ${isClosingSettings ? 'opacity-0' : 'opacity-100 animate-fadeIn'}`}
                onClick={closeSettingsSheet}
                role="dialog"
                aria-label="Opciones de configuración"
            >
                <div
                    ref={settingsPanelRef}
                    className={`bg-white w-full rounded-t-2xl pt-0 pb-6 px-4 space-y-2 ${!isDragging ? 'transition-transform duration-250 ease-out' : ''} ${!isClosingSettings && swipeOffset === 0 && !isDragging ? 'animate-slideUp' : ''}`}
                    style={{ transform: `translateY(${isClosingSettings ? '100%' : swipeOffset + 'px'})`, touchAction: 'none', paddingBottom: 'max(24px, calc(env(safe-area-inset-bottom, 0px) + 16px))' }}
                    onClick={e => e.stopPropagation()}
                    onTouchStart={e => {
                        swipeStartY.current = e.touches[0].clientY;
                    }}
                    onTouchEnd={() => {
                        swipeStartY.current = null;
                        if (isDraggingRef.current) {
                            isDraggingRef.current = false;
                            setIsDragging(false);
                            if (swipeOffsetRef.current > 80) closeSettingsSheet();
                            else updateSwipeOffset(0);
                        }
                    }}
                >
                    <div className="flex items-center justify-center py-3">
                        <div className="w-12 h-1 bg-gray-300 rounded-full" />
                    </div>
                    <button
                        onClick={() => {
                            closeSettingsSheet();
                            setTimeout(() => setIsReceiptSettingsOpen(true), 260);
                        }}
                        className="w-full text-left px-4 py-4 rounded-xl flex items-center gap-3 text-base font-bold text-slate-700 bg-gray-50 hover:bg-gray-100"
                    >
                        <div className="size-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined">print</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-slate-800">Facturación e Impresión</span>
                            <span className="block text-[11px] text-slate-400">Datos de facturas y conexión de impresora</span>
                        </div>
                        <span className="material-symbols-outlined text-gray-400">chevron_right</span>
                    </button>
                    <button
                        onClick={() => {
                            closeSettingsSheet();
                            setTimeout(() => setIsSalesModeSettingsOpen(true), 260);
                        }}
                        className="w-full text-left px-4 py-4 rounded-xl flex items-center gap-3 text-base font-bold text-slate-700 bg-gray-50 hover:bg-gray-100"
                    >
                        <div className="size-8 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined">toggle_on</span>
                        </div>
                        <div className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-slate-800">Activar/Desactivar</span>
                            <span className="block text-[11px] text-slate-400">Modo de venta del negocio (catálogo / escáner)</span>
                        </div>
                        <span className="material-symbols-outlined text-gray-400">chevron_right</span>
                    </button>

                    {/* Botón Instalar App (Solo en navegador móvil y cuando no esté instalada) */}
                    {isMobile && !isPwa && !isAppInstalled && (
                        <button
                            onClick={handleInstallApp}
                            className="w-full text-left px-4 py-4 rounded-xl flex items-center gap-3 text-base font-bold text-slate-700 bg-amber-50/80 hover:bg-amber-100/80 active:scale-[0.99] border border-amber-200/60 transition-all"
                        >
                            <div className="size-8 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 shadow-xs">
                                <span className="material-symbols-outlined text-[20px]">install_mobile</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <span className="block text-sm font-bold text-slate-900">Instalar App</span>
                                <span className="block text-[11px] text-amber-800 font-medium">Acceso directo y pantalla completa en tu dispositivo</span>
                            </div>
                            <span className="material-symbols-outlined text-amber-600">download</span>
                        </button>
                    )}
                </div>
            </div>
        )}

        {/* ── Paneles de Configuración (overlay fullscreen) ── */}
        <SettingsSidebarPanel
            isOpen={isReceiptSettingsOpen}
            onClose={() => setIsReceiptSettingsOpen(false)}
        />
        <SalesModeSettingsPanel
            isOpen={isSalesModeSettingsOpen}
            onClose={() => setIsSalesModeSettingsOpen(false)}
        />

        {/* ── Modal de Gastos ── */}
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
                        const result = data.type !== 'inventory' ? await createExpense(data) : undefined;
                        if (data.type !== 'expense') setShowExpenseModal(false);
                        return result;
                    } catch {
                        showToast('Error al registrar', 'error');
                    }
                }}
                initialType={expenseModalType}
            />
        )}

        {/* ── Modal de Abonos ── */}
        {showAbonosModal && (
            <QuickTransactionModal
                isOpen={showAbonosModal}
                onClose={() => setShowAbonosModal(false)}
                type={abonosType}
            />
        )}

        {/* ── Escaneo_Unificado (Foto a factura) ── */}
        {showInvoiceScan && (
            <Suspense fallback={<ScanLoadingFallback />}>
                <InvoiceScanScreen onClose={() => setShowInvoiceScan(false)} />
            </Suspense>
        )}

        {/* ── Profile Bottom Sheet ── */}
        {showProfileSheet && (
            <div
                className="fixed inset-0 z-[100] flex flex-col justify-end"
                onClick={() => setShowProfileSheet(false)}
            >
                {/* Backdrop */}
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-[fadeIn_0.18s_ease-out]" />

                {/* Sheet */}
                <div
                    ref={profilePanelRef}
                    className="relative bg-white dark:bg-gray-900 rounded-t-3xl shadow-2xl animate-[slideInUp_0.22s_cubic-bezier(0.32,0.72,0,1)] pb-safe"
                    onClick={e => e.stopPropagation()}
                    onTouchStart={e => {
                        swipeStartY.current = e.targetTouches[0].clientY;
                    }}
                    onTouchEnd={() => {
                        if (swipeOffsetRef.current > 80) {
                            setShowProfileSheet(false);
                        }
                        swipeStartY.current = null;
                        isDraggingRef.current = false;
                        setIsDragging(false);
                        updateSwipeOffset(0);
                    }}
                    style={swipeOffset > 0 ? {
                        transform: `translateY(${swipeOffset}px)`,
                        transition: 'none',
                    } : {
                        transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
                    }}
                >
                    {/* Handle */}
                    <div className="flex justify-center pt-3 pb-1">
                        <div className="w-9 h-1 rounded-full bg-gray-200 dark:bg-gray-700" />
                    </div>

                    {/* User Info */}
                    <div className="flex items-center gap-3.5 px-5 pt-3 pb-4">
                        {profile?.avatar_url ? (
                            <img src={profile.avatar_url} alt="avatar" className="size-14 rounded-full object-cover ring-2 ring-amber-400/30" />
                        ) : (
                            <div className="size-14 rounded-full bg-amber-400 flex items-center justify-center ring-2 ring-amber-400/30 ring-offset-2">
                                <span className="hm-display text-xl font-bold text-[#102218]">{avatarLetter}</span>
                            </div>
                        )}
                        <div className="flex flex-col">
                            <span className="text-base font-bold text-slate-900 dark:text-white leading-tight">{profile?.full_name || 'Usuario'}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{getRealEmail(profile?.email) || profile?.phone || ''}</span>
                            <span className="mt-1.5 self-start text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                {profile?.role || 'Mesero'}
                            </span>
                        </div>
                    </div>

                    <div className="mx-4 h-px bg-slate-100 dark:bg-gray-800" />

                    {/* Options */}
                    <div className="px-3 py-2 flex flex-col gap-1">
                        <button
                            onClick={() => { setShowProfileSheet(false); onNavigate(Screen.PROFILE); }}
                            className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-slate-50 dark:hover:bg-gray-800 transition-colors group text-left"
                        >
                            <div className="size-10 rounded-xl bg-slate-100 dark:bg-gray-800 flex items-center justify-center group-hover:bg-slate-200 dark:group-hover:bg-gray-700 transition-colors">
                                <span className="material-symbols-outlined text-[20px] text-slate-600 dark:text-slate-300">person</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold text-slate-800 dark:text-white">Mi Perfil</span>
                                <span className="text-xs text-slate-400">Datos personales y foto</span>
                            </div>
                            <span className="material-symbols-outlined text-slate-300 text-[18px] ml-auto">chevron_right</span>
                        </button>

                        {canShowSubscription && (
                            <button
                                onClick={() => { setShowProfileSheet(false); onNavigate(Screen.SUBSCRIPTION_MANAGEMENT); }}
                                className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors group text-left"
                            >
                                <div className="size-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center group-hover:bg-amber-200 dark:group-hover:bg-amber-900/50 transition-colors">
                                    <span className="material-symbols-outlined text-[20px] text-amber-600 dark:text-amber-400">workspace_premium</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-semibold text-slate-800 dark:text-white">Mi Suscripción</span>
                                    <span className="text-xs text-slate-400">Plan y facturación</span>
                                </div>
                                <span className="material-symbols-outlined text-slate-300 text-[18px] ml-auto">chevron_right</span>
                            </button>
                        )}
                    </div>

                    <div className="mx-4 h-px bg-slate-100 dark:bg-gray-800" />

                    {/* Sign out */}
                    <div className="px-3 pt-2 pb-5">
                        <button
                            onClick={async () => { setShowProfileSheet(false); await signOut(); }}
                            className="w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors group text-left"
                        >
                            <div className="size-10 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center group-hover:bg-red-100 dark:group-hover:bg-red-900/40 transition-colors">
                                <span className="material-symbols-outlined text-[20px] text-red-500">logout</span>
                            </div>
                            <span className="text-sm font-semibold text-red-500">Cerrar Sesión</span>
                        </button>
                    </div>
                </div>
            </div>
        )}

        <UpgradeProModal
            isOpen={showUpgradeModal}
            onClose={() => setShowUpgradeModal(false)}
            featureName="Auditoría y Conteo Físico de Stock"
            featureDescription="Realiza auditorías de estantes, compara existencias físicas contra el sistema y ajusta descuadres automáticamente."
            onUpgrade={() => {
                setShowUpgradeModal(false);
                onNavigate(Screen.SUBSCRIPTION_PLANS);
            }}
        />

        {/* ── Modal Guía de Instalación PWA (Fallback para iOS Safari o navegadores sin prompt directo) ── */}
        {showInstallGuideModal && (
            <div
                className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
                onClick={() => setShowInstallGuideModal(false)}
                role="dialog"
                aria-modal="true"
                aria-label="Cómo instalar Bistro POS"
            >
                <div
                    className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl flex flex-col gap-4 border border-slate-100 animate-[scaleIn_0.2s_ease-out]"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex items-center gap-3">
                        <div className="size-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-[24px]">install_mobile</span>
                        </div>
                        <div className="min-w-0 flex-1">
                            <h3 className="text-base font-bold text-slate-900 leading-tight">Instalar Bistro POS</h3>
                            <p className="text-xs text-slate-500">Agrega la app a tu pantalla de inicio</p>
                        </div>
                    </div>

                    {/iphone|ipad|ipod/i.test(navigator.userAgent) ? (
                        <div className="flex flex-col gap-3 text-sm text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <div className="flex items-start gap-2.5">
                                <span className="size-6 rounded-full bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">1</span>
                                <p>Toca el botón <strong className="text-slate-900">Compartir</strong> <span className="material-symbols-outlined text-[16px] align-middle text-sky-600">ios_share</span> en Safari.</p>
                            </div>
                            <div className="flex items-start gap-2.5">
                                <span className="size-6 rounded-full bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">2</span>
                                <p>Desplázate hacia abajo y selecciona <strong className="text-slate-900">"Agregar a la pantalla de inicio"</strong> <span className="material-symbols-outlined text-[16px] align-middle text-emerald-600">add_to_home_screen</span>.</p>
                            </div>
                            <div className="flex items-start gap-2.5">
                                <span className="size-6 rounded-full bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">3</span>
                                <p>Presiona <strong className="text-slate-900">"Agregar"</strong> en la esquina superior.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3 text-sm text-slate-700 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                            <div className="flex items-start gap-2.5">
                                <span className="size-6 rounded-full bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">1</span>
                                <p>Toca el menú de <strong className="text-slate-900">tres puntos (⋮)</strong> en la esquina superior de tu navegador.</p>
                            </div>
                            <div className="flex items-start gap-2.5">
                                <span className="size-6 rounded-full bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">2</span>
                                <p>Selecciona <strong className="text-slate-900">"Instalar aplicación"</strong> o <strong className="text-slate-900">"Agregar a la pantalla principal"</strong>.</p>
                            </div>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={() => setShowInstallGuideModal(false)}
                        className="w-full py-3 rounded-xl bg-slate-900 text-white font-bold text-sm active:scale-[0.98] transition-transform"
                    >
                        Entendido
                    </button>
                </div>
            </div>
        )}
        </>
    );
};

export default HomeScreen;
