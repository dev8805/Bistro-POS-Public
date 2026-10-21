
import React, { useState, useEffect, useCallback, useMemo, Suspense, useRef, startTransition } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import type { SubscriptionPlan } from './context/AuthContext';
import { Sidebar } from './components/Sidebar';
import { GlobalSellTabs } from './components/GlobalSellTabs';
import { MobileNavBar } from './components/MobileNavBar';
import { TablesScreen } from './screens/TablesScreen';
import SendCommandaModal from './components/SendCommandaModal';
import { SellScreen } from './screens/SellScreen';
import { MenuScreen } from './screens/MenuScreen';
import { PaymentScreen } from './screens/PaymentScreen';
import { SuccessScreen } from './screens/SuccessScreen';
import { LoginScreen } from './screens/LoginScreen';
import { RegisterScreen } from './screens/RegisterScreen';
import { ForgotPasswordScreen } from './screens/ForgotPasswordScreen';
import { HomeScreen } from './screens/HomeScreen';
const LandingScreen = React.lazy(() => import('./screens/LandingScreen').then(m => ({ default: m.LandingScreen })));

// ⚡ Lazy-loaded screens (code-splitting) - se cargan solo cuando se necesitan
const EmployeesScreen = React.lazy(() => import('./screens/EmployeesScreen').then(m => ({ default: m.EmployeesScreen })));
const ClientsScreen = React.lazy(() => import('./screens/ClientsScreen').then(m => ({ default: m.ClientsScreen })));
const ProductsScreen = React.lazy(() => import('./screens/ProductsScreen').then(m => ({ default: m.ProductsScreen })));
const SalesScreen = React.lazy(() => import('./screens/SalesScreen').then(m => ({ default: m.SalesScreen })));
const ActivityScreen = React.lazy(() => import('./screens/ActivityScreen').then(m => ({ default: m.ActivityScreen })));
const SimpleProductScreen = React.lazy(() => import('./screens/SimpleProductScreen').then(m => ({ default: m.SimpleProductScreen })));
const ProcessedProductScreen = React.lazy(() => import('./screens/ProcessedProductScreen').then(m => ({ default: m.ProcessedProductScreen })));
const ServiceProductScreen = React.lazy(() => import('./screens/ServiceProductScreen').then(m => ({ default: m.ServiceProductScreen })));
const ProfileScreen = React.lazy(() => import('./screens/ProfileScreen').then(m => ({ default: m.ProfileScreen })));
const SubscriptionPlansScreen = React.lazy(() => import('./screens/SubscriptionPlansScreen').then(m => ({ default: m.SubscriptionPlansScreen })));
const SubscriptionManagementScreen = React.lazy(() => import('./screens/SubscriptionManagementScreen').then(m => ({ default: m.SubscriptionManagementScreen })));
const CashRegisterScreen = React.lazy(() => import('./screens/CashRegisterScreen').then(m => ({ default: m.CashRegisterScreen })));
const DashboardScreen = React.lazy(() => import('./screens/DashboardScreen').then(m => ({ default: m.DashboardScreen })));
const InventoryScreen = React.lazy(() => import('./screens/InventoryScreen').then(m => ({ default: m.InventoryScreen })));
const PhotoOrderScreen = React.lazy(() => import('./screens/PhotoOrderScreen').then(m => ({ default: m.PhotoOrderScreen })));
const ContingencyDocScreen = React.lazy(() => import('./screens/ContingencyDocScreen').then(m => ({ default: m.ContingencyDocScreen })));
const DebtsScreen = React.lazy(() => import('./screens/DebtsScreen').then(m => ({ default: m.DebtsScreen })));
const CreatePromotionScreen = React.lazy(() => import('./screens/CreatePromotionScreen').then(m => ({ default: m.CreatePromotionScreen })));
const EditPromotionScreen = React.lazy(() => import('./screens/EditPromotionScreen').then(m => ({ default: m.EditPromotionScreen })));
const TrainingScreen = React.lazy(() => import('./screens/TrainingScreen').then(m => ({ default: m.TrainingScreen })));
const RagChatScreen = React.lazy(() => import('./screens/RagChatScreen').then(m => ({ default: m.RagChatScreen })));
const BulkUploadScreen = React.lazy(() => import('./screens/BulkUploadScreen').then(m => ({ default: m.BulkUploadScreen })));
const InvoiceCreateScreen = React.lazy(() => import('./screens/InvoiceCreateScreen').then(m => ({ default: m.InvoiceCreateScreen })));
const PublicReceiptScreen = React.lazy(() => import('./screens/PublicReceiptScreen'));
const PublicClientHistoryScreen = React.lazy(() => import('./screens/PublicClientHistoryScreen').then(m => ({ default: m.PublicClientHistoryScreen })));

import { RagChatWidget } from './components/rag/RagChatWidget';
import { ErrorBoundary, ScreenErrorBoundary, LoadingFallback } from './components/ErrorBoundary';
import { AppLoader } from './components/AppLoader';
import { ScreenLoader } from './components/ScreenLoader';
import { Promotion } from './hooks/usePromotions';
import { ProductModal } from './components/ProductModal';
import { ProductEditModal } from './components/ProductEditModal';
import { ProductOptionsModal } from './components/ProductOptionsModal';
import { SimpleNoteModal } from './components/SimpleNoteModal';
import { DeliveryClientModal } from './components/DeliveryClientModal';
import { Toast } from './components/Toast';
import { ToastProvider, useToast } from './context/ToastContext';
import { ConfirmDialogProvider } from './context/ConfirmDialogContext';
import { AppToast } from './components/AppToast';
import { ConfirmDialog } from './components/ConfirmDialog';

import { FlyToCartLayer, FlyingItem } from './components/FlyToCartLayer';
import { CartItem, Product, Screen, TransactionDetails, SellTab, ReceiptData, ReceiptItem, CustomizableOption, AddedModifier } from './types';
import { Table } from './hooks/useTables';
import { supabase } from './lib/supabase';
import { useSales } from './hooks/useSales';
import { useOrderItems } from './hooks/useOrderItems';
import { useOrders } from './hooks/useOrders';
import { useNotifications } from './hooks/useNotifications';
import { useOfflineSync } from './hooks/useOfflineSync';
import { usePresenceBroadcast } from './hooks/usePresenceBroadcast';
import { useEjeStatus } from './hooks/useEjeStatus';

import { useBusinessSettings } from './hooks/useBusinessSettings';
import { BusinessSettingsProvider } from './context/BusinessSettingsContext';
import { Product as AdminProduct } from './hooks/useProducts';
import { Client } from './hooks/useClients';
import { logger } from './lib/logger';
import { prefetchCommonScreens } from './lib/prefetch';
import { prefetchUIAssets } from './lib/prefetchUIAssets';
import { offlineQueue } from './lib/offlineQueue';
import { saveSellProducts, getSellProducts } from './lib/offlineStorage';
import { pushOfflineCashMovement } from './lib/offlineCashCache';
import { useGracePeriodStatus } from './hooks/useGracePeriodStatus';
import { useCustomPlan } from './hooks/useCustomPlan';
import CustomPlanBlockedScreen from './components/CustomPlanBlockedScreen';
import TrialExpiredScreen from './components/TrialExpiredScreen';
import { openCustomPlanCheckout, waitForPaymentApplied } from './lib/customPlanCheckout';
import { getRealEmail } from './lib/formatters';
import { canSeeAiAssistant } from './lib/specialBusinesses';
import { getCachedTables, saveCachedTables, deleteTableOrder, getTableOrder } from './lib/offlineTableStore';
import { OfflineIndicator } from './components/OfflineIndicator';
import { UpdateNotification } from './components/UpdateNotification';
import MultiEjeNoticeModal from './components/MultiEjeNoticeModal';
import ForcedReloadModal from './components/ForcedReloadModal';
import TableOrderLoadingOverlay from './components/TableOrderLoadingOverlay';
import { usePermissions } from './hooks/usePermissions';
import { GracePeriodBanner } from './components/GracePeriodBanner';
import { InventoryCriticalAlert } from './components/InventoryCriticalAlert';
import { DataPrefetcher } from './components/DataPrefetcher';
import { usePushSubscription } from './hooks/usePushSubscription';
import { useKitchenPrinter } from './hooks/useKitchenPrinter';
import { usePostPaymentToast } from './hooks/usePostPaymentToast';
import { usePlanFeatures } from './hooks/usePlanFeatures';

// Backdrop de transición exclusivo para el escáner de fotos en teléfonos móviles (desde iPhone 17 Pro Max hacia abajo: <= 440px)
const ScannerPaymentBackdrop: React.FC = () => {
  const isPhoneScreen = typeof window !== 'undefined' && window.innerWidth <= 440;
  // Evaluamos síncronamente al inicializar el componente:
  // Si no es teléfono, o si respondió rápido, visible es FALSE de entrada (nunca se pinta ni un frame).
  const [visible, setVisible] = useState(() => {
    if (!isPhoneScreen) return false;
    const navStartRaw = sessionStorage.getItem('bistro_payment_nav_start');
    if (!navStartRaw) return false;
    const duration = performance.now() - Number(navStartRaw);
    return duration > 300;
  });
  const [opaque, setOpaque] = useState(true);

  useEffect(() => {
    sessionStorage.removeItem('bistro_payment_nav_start');
    if (!visible) return;

    // Solo si nació visible (teléfono lento), le damos el colchón para terminar de acomodarse
    const timer1 = setTimeout(() => {
      setOpaque(false);
      const timer2 = setTimeout(() => {
        setVisible(false);
      }, 250);
      return () => clearTimeout(timer2);
    }, 380);

    return () => clearTimeout(timer1);
  }, [visible]);

  if (!visible || !isPhoneScreen) return null;

  return (
    <div
      className={`absolute inset-0 z-50 bg-background-light dark:bg-background-dark flex flex-col items-center justify-center gap-3 transition-opacity duration-250 ${opaque ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
    >
      <div className="size-9 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
      <span className="text-xs font-bold text-text-secondary tracking-wide uppercase">Cargando pago...</span>
    </div>
  );
};

function AppContent() {
  const { user, profile, loading, signOut, refreshProfile, hasActiveSubscription, subscriptionEndDate, checkSubscription, isNewTrial, clearNewTrialFlag, subscription } = useAuth();
  const { canUsePhysicalInventory, canUseTables } = usePlanFeatures();
  const appToast = useToast();
  const { canAccessScreen, canFinalizeSale, canOpenShift, canViewProducts, hasPermission } = usePermissions();
  // Dispara el toast "¡Gracias por tu pago!" cuando el usuario vuelve del redirect
  // de Wompi (PSE / Botón Bancolombia). Con tarjeta/Nequi el toast se muestra inline
  // desde `onApproved`; este hook cubre solo el caso del redirect.
  usePostPaymentToast();
  // Plan personalizado: si el negocio tiene un plan asignado con `assigned_business_id`,
  // en lugar de la pantalla "contacta a soporte" se muestra CustomPlanBlockedScreen
  // (con monto y botón Pagar). El pago reactiva la suscripción sin intervención de soporte.
  const { hasCustomPlan, customPlan, customPlans } = useCustomPlan();
  const canPayCustom = hasPermission('admin_settings');
  const [payingBlockedCustom, setPayingBlockedCustom] = useState(false);
  // Task 14: AbortController para cortar el polling PENDING si el usuario
  // cierra sesión o cambia de pantalla antes de que Wompi resuelva.
  const blockedPollAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => blockedPollAbortRef.current?.abort();
  }, []);
  const startBlockedPollingAbort = useCallback(() => {
    blockedPollAbortRef.current?.abort();
    blockedPollAbortRef.current = new AbortController();
    return blockedPollAbortRef.current.signal;
  }, []);

  // Pago desde la pantalla de bloqueo (fuera de gracia). Reutiliza el helper
  // compartido `openCustomPlanCheckout` y luego OBSERVA la activación que hace
  // el webhook (mismo flujo que GracePeriodBanner y la tab Planes). El cliente
  // ya no escribe la suscripción (Req 4.6). Requerimientos: 4.6, 6.2, 8.1-8.5.
  const handlePayFromBlockedScreen = useCallback(async (planToPay?: SubscriptionPlan) => {
    const targetPlan = planToPay || customPlan;
    if (!profile?.business_id || !targetPlan) return;
    // El correo es opcional en el helper: si no hay real (cuenta SMS OTP con
    // @bistro.temp), Wompi lo pide dentro de su widget. Además, en la pantalla
    // de bloqueo el usuario no tiene acceso al perfil para configurarlo.
    const customerEmail = getRealEmail(profile.email) || undefined;
    setPayingBlockedCustom(true);
    await openCustomPlanCheckout({
      profile,
      plan: targetPlan,
      customerEmail,
      getAbortSignal: startBlockedPollingAbort,
      onApproved: async (tx) => {
        try {
          // El webhook (service_role) es quien activa/extiende la suscripción.
          // Aquí solo OBSERVAMOS (lectura) hasta que se refleje y refrescamos el
          // estado. Ya no escribimos en BD, así que no hay error que "tragar".
          const { applied } = await waitForPaymentApplied({
            wompiTransactionId: tx.id,
            signal: startBlockedPollingAbort(),
          });
          await checkSubscription();
          if (applied) {
            appToast.showToast(
              '¡Gracias por tu pago!',
              'success',
              5000,
              'Tu suscripción está activa. Sigue disfrutando de Bistro.'
            );
          } else {
            appToast.showToast(
              '¡Gracias por tu pago!',
              'info',
              6000,
              'Tu pago fue aprobado; la activación puede tardar unos segundos en reflejarse.'
            );
          }
        } finally {
          setPayingBlockedCustom(false);
        }
      },
      onPending: () => {
        appToast.showToast('Pago en proceso. Confirmaremos cuando el banco responda.', 'info');
        setPayingBlockedCustom(false);
      },
      onPendingTimeout: () => {
        appToast.showToast(
          'El pago sigue en verificación. Refresca la pantalla en unos minutos o volveremos a habilitar tu acceso automáticamente cuando el banco confirme.',
          'info'
        );
      },
      onDeclined: (msg) => {
        appToast.showToast(`Pago rechazado: ${msg}`, 'error');
        setPayingBlockedCustom(false);
      },
      onError: (err) => {
        appToast.showToast(err.message || 'Error abriendo el pago', 'error');
        setPayingBlockedCustom(false);
      },
    });
  }, [profile, customPlan, checkSubscription, appToast, startBlockedPollingAbort]);
  // Cuando la suscripción entra en gracia (48h post-vencimiento), el GracePeriodBanner
  // se fija arriba de la pantalla. El banner mide su altura real y la publica en la
  // variable CSS `--grace-banner-h`; el layout reserva ese espacio con padding-top
  // para que el contenido quede debajo del banner y no tapado (altura variable en móvil).
  const { isInGrace: isSubscriptionInGrace } = useGracePeriodStatus();
  const graceOffsetStyle = isSubscriptionInGrace
    ? { paddingTop: 'var(--grace-banner-h, 0px)' }
    : undefined;
  usePushSubscription();
  useKitchenPrinter(); // Listen for kitchen commands and auto-print if printer connected
  const [retryCount, setRetryCount] = useState(0);
  const [showError, setShowError] = useState(false);

  // Reset retry state when user changes (logout → re-login)
  const prevUserIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const currentUserId = user?.id || null;
    if (prevUserIdRef.current !== currentUserId) {
      setRetryCount(0);
      setShowError(false);
      prevUserIdRef.current = currentUserId;
    }
  }, [user]);

  // Auto-retry loading profile if it's null after auth
  React.useEffect(() => {
    if (user && !profile && !loading && retryCount < 10) {
      const timer = setTimeout(() => {
        refreshProfile();
        setRetryCount(prev => prev + 1);
      }, 1500);
      return () => clearTimeout(timer);
    }
    if (profile) {
      setRetryCount(0);
      setShowError(false);
      prefetchCommonScreens();
      prefetchUIAssets();
    }
    if (user && !profile && !loading && retryCount >= 10) {
      setShowError(true);
    }
  }, [user, profile, loading, retryCount, refreshProfile]);

  // Estado del turno de caja para el indicador del MobileNavBar.
  // Se siembra desde la caché local y se confirma con una consulta ligera;
  // los eventos shift-opened / shift-closed (emitidos por useCashRegister) lo
  // mantienen al día sin montar el hook pesado.
  React.useEffect(() => {
    const businessId = profile?.business_id;
    const userId = profile?.id;
    if (!businessId || !userId) { setIsShiftOpen(false); setActiveShiftId(null); return; }
    let cancelled = false;

    // Id del turno activo desde la caché local (útil offline y en los eventos de
    // turno, ya que `useCashRegister` escribe la caché antes de emitirlos).
    const readCachedShiftId = (): string | null => {
      try {
        const raw = localStorage.getItem(`bistro_active_shift_${businessId}`);
        return raw ? (JSON.parse(raw)?.id ?? null) : null;
      } catch {
        return null;
      }
    };

    const verify = async () => {
      const cachedId = readCachedShiftId();
      if (!navigator.onLine) {
        if (!cancelled) { setIsShiftOpen(!!cachedId); setActiveShiftId(cachedId); }
        return;
      }
      try {
        const { data, error } = await supabase
          .from('cash_shifts')
          .select('id')
          .eq('business_id', businessId)
          .eq('opened_by', userId)
          .eq('status', 'open')
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) { setIsShiftOpen(!!data); setActiveShiftId(data?.id ?? null); }
      } catch {
        // navigator.onLine pudo mentir (adaptador virtual / túnel caído): si la
        // consulta falla por red, confiar en el estado del turno en caché local.
        if (!cancelled) { setIsShiftOpen(!!cachedId); setActiveShiftId(cachedId); }
      }
    };
    verify();

    const handleOpened = () => {
      setIsShiftOpen(true);
      setActiveShiftId(readCachedShiftId());
      // Si había una navegación pendiente desde PhotoOrderScreen, completarla ahora
      if (pendingPhotoOrderNavRef.current) {
        pendingPhotoOrderNavRef.current = false;
        setIsCashRegisterOpen(false);
        const isMobileOrTablet = window.innerWidth < 1024;
        setCurrentScreen(isMobileOrTablet ? Screen.PAYMENT : Screen.SELL);
      }
    };
    const handleClosed = () => { setIsShiftOpen(false); setActiveShiftId(null); };
    window.addEventListener('shift-opened', handleOpened);
    window.addEventListener('shift-closed', handleClosed);
    window.addEventListener('offline-sync-completed', verify);
    return () => {
      cancelled = true;
      window.removeEventListener('shift-opened', handleOpened);
      window.removeEventListener('shift-closed', handleClosed);
      window.removeEventListener('offline-sync-completed', verify);
    };
  }, [profile?.business_id, profile?.id]);

  // Welcome toast for new trial users
  useEffect(() => {
    if (isNewTrial && profile) {
      appToast.showToast('🎉 ¡Bienvenido! Tu prueba gratuita de 7 días ha comenzado.', 'success');
      clearNewTrialFlag();
    }
  }, [isNewTrial, profile]);

  // Pantallas que se pueden persistir (navegables desde el sidebar)
  const persistableScreens = [
    Screen.DASHBOARD, Screen.TABLES, Screen.EMPLOYEES,
    Screen.CLIENTS, Screen.PRODUCTS, Screen.INVENTORY, Screen.SALES, Screen.CASH_REGISTER,
    Screen.PROFILE
  ];

  // Pantalla inicial: HOME en móvil, SELL en desktop/tablet (excepto hash de auth o acceso directo de gastos)
  const getInitialScreen = (): Screen => {
    const hash = window.location.hash?.replace('#', '');
    if (hash === 'login') return Screen.LOGIN;
    if (hash === 'register') return Screen.REGISTER;
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if (
      window.location.pathname === '/gastos' ||
      window.location.pathname === '/compra-inventario' ||
      action === 'expense' ||
      action === 'gastos' ||
      action === 'inventory' ||
      action === 'compra'
    ) return Screen.HOME;
    if (window.location.pathname === '/foto-venta' || action === 'foto_venta' || action === 'photo_order') return Screen.PHOTO_ORDER;
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    return isMobile ? Screen.HOME : Screen.SELL;
  };

  const [currentScreen, setCurrentScreen] = useState<Screen>(getInitialScreen);

  // Persistir pantalla cuando cambie
  useEffect(() => {
    if (persistableScreens.includes(currentScreen)) {
      try {
        localStorage.setItem('bistro_current_screen', currentScreen);
      } catch (e) {
        console.warn('Error saving screen to localStorage:', e);
      }
    }
  }, [currentScreen]);

  // ---------------------------------------------------------------------------
  // 🛡️ REAL-TIME PERMISSIONS RE-CHECK
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (user && profile && currentScreen) {
      const unprotectedScreens = [Screen.LOGIN, Screen.REGISTER, Screen.PROFILE];
      if (!unprotectedScreens.includes(currentScreen) && !canAccessScreen(currentScreen)) {
        appToast.showToast('Tus permisos han cambiado. Redirigiendo...', 'warning');
        logger.log(`[Effect] Kickout: User lost access to ${currentScreen}`);

        // Redirigir a una pantalla principal segura
        if (canAccessScreen(Screen.SELL)) {
          setCurrentScreen(Screen.SELL);
        } else {
          setCurrentScreen(Screen.PROFILE);
        }
      }
    }
  }, [profile, currentScreen]); // Se ejecuta si profile (o sus permisos) cambia en tiempo real

  // ---------------------------------------------------------------------------
  // 🔙 HISTORY NAVIGATION HANDLING (Fix Back Gesture)
  // ---------------------------------------------------------------------------

  // Ref to track if the navigation is caused by the browser's back button
  const isBackNavigationRef = useRef(false);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      // Si una sub-vista interna marcó que ya manejó este evento, ignorar
      if ((window as any).__subviewHandledBack) {
        (window as any).__subviewHandledBack = false;
        return;
      }

      // If we have state with a screen, navigate to it
      if (event.state && event.state.screen) {
        logger.log(`[Navigation] 🔙 Back gesture detected. Going to: ${event.state.screen}`);
        isBackNavigationRef.current = true;
        setCurrentScreen(event.state.screen as Screen);
      }
    };

    window.addEventListener('popstate', handlePopState);

    // Initialize current state in history if not present
    if (!window.history.state) {
      window.history.replaceState({ screen: currentScreen }, '');
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Sync screen changes to browser history
  useEffect(() => {
    // If the change came from popstate (Back button), reset flag and do nothing
    if (isBackNavigationRef.current) {
      isBackNavigationRef.current = false;
      return;
    }

    // Push new state specific to the app navigation
    // We only push if it's effectively a new navigation step
    const currentHistoryScreen = window.history.state?.screen;
    if (currentHistoryScreen !== currentScreen) {
      // Use pushState to add to the stack
      window.history.pushState({ screen: currentScreen }, '');
    }
  }, [currentScreen]);
  // ---------------------------------------------------------------------------
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('bistro_cart');
      if (saved) return JSON.parse(saved);
    } catch { }
    return [];
  });
  // tableCarts removed - using DB persistence
  const [activeTable, setActiveTable] = useState<string | undefined>(undefined);
  const [activeTableId, setActiveTableId] = useState<string | undefined>(undefined); // Real table ID for orders
  // Optimización Realtime mesas: estado de carga al abrir una mesa ocupada (Fetch_Orden_Mesa).
  // Guardamos el id de la mesa que se está cargando para mostrar el spinner inline
  // en la mesa correspondiente (chip/dropdown/card), sin overlay full-screen.
  const [loadingTableId, setLoadingTableId] = useState<string | null>(null);
  const [tableOrderError, setTableOrderError] = useState(false);
  const retryTableRef = useRef<Table | null>(null);
  const orderLoadedForTableRef = useRef<string | null>(null);
  const [deliveryMode, setDeliveryMode] = useState(false);
  const [deliveryClient, setDeliveryClient] = useState<Client | null>(() => {
    try {
      const saved = localStorage.getItem('bistro_cart_client');
      if (saved) return JSON.parse(saved);
    } catch { }
    return null;
  });
  const [showDeliveryClientModal, setShowDeliveryClientModal] = useState(false);
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);

  // Selección de etiquetas de comanda (Localizador / Mesa / Tipo de pedido)
  // que el cajero puede adelantar desde el header del carrito antes de
  // enviar la comanda a cocina. Se pasa por props a MenuScreen, PaymentScreen,
  // SuccessScreen y SuccessSidebar. Se limpia al confirmar el pago, al
  // iniciar una nueva venta y al vaciar el carrito.
  const [comandaLabelSelection, setComandaLabelSelection] = useState<{
    locator?: string;
    table?: string;
    takeaway?: string;
  }>({});

  const [saleOrigin, setSaleOrigin] = useState<'tables' | 'orders' | 'scanner'>('tables'); // Track where sale originated for navigation
  const [photoOrderKey, setPhotoOrderKey] = useState(0); // Forces remount of PhotoOrderScreen after sale completion
  const [isOrderSent, setIsOrderSent] = useState(false);
  const [showSendCommanda, setShowSendCommanda] = useState(false);


  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isCashRegisterOpen, setIsCashRegisterOpen] = useState(false);
  const [isShiftOpen, setIsShiftOpen] = useState(false); // ¿Hay turno de caja abierto? — indicador en MobileNavBar
  // Flag: si PhotoOrderScreen intentó ir al pago sin turno, se pospone la navegación
  // hasta que se abra el turno (shift-opened). El ref evita re-renders innecesarios.
  const pendingPhotoOrderNavRef = React.useRef(false);
  // Flag: si el usuario intentó entrar a PhotoOrderScreen sin turno, se navega tras abrirlo
  const pendingPhotoOrderEntryRef = React.useRef(false);
  const [activeShiftId, setActiveShiftId] = useState<string | null>(null); // id del turno activo — viaja en el payload de presencia (modelo Usuario Eje)
  const [ragChatMounted, setRagChatMounted] = useState(false);
  const [ragChatOpen, setRagChatOpen] = useState(false);
  const [ragChatMinimized, setRagChatMinimized] = useState(false);
  const [ragChatHasConversation, setRagChatHasConversation] = useState(false);
  // Mensajes del dev no vistos por el cliente. Se incrementa cuando llega
  // un INSERT del dev por Realtime estando el widget cerrado/minimizado, y
  // se resetea cuando el cliente lo abre.
  const [ragUnreadCount, setRagUnreadCount] = useState(0);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null); // For editing active takeaway/delivery orders
  const [editingOrderStatus, setEditingOrderStatus] = useState<string>(''); // For robust split logic
  const [navigationLocked, setNavigationLocked] = useState(false); // 🔒 Lock navigation to prevent ghost clicks
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // Mobile menu state lifted up

  const { isKitchenEnabled, isCatalogModeEnabled, businessName, businessPhone, businessAddress, businessNit, receiptBusinessName, receiptPhone, receiptAddress } = useBusinessSettings();

  // Modo de venta derivado de la config del negocio (Supabase):
  // catalog_mode_enabled = true → Catálogo (tarjetas); false → Escáner (EAN).
  // Se administra desde Ajustes → pestaña "Activar/Desactivar".
  const isEanMode = !isCatalogModeEnabled;

  // Auto-expand sidebar when switching to EAN mode (collapse only allowed in catalog)
  useEffect(() => {
    if (isEanMode && isSidebarCollapsed) {
      setIsSidebarCollapsed(false);
    }
  }, [isEanMode]);

  // Expone el ancho real del sidebar como variable CSS global (:root) para que los
  // overlays/drawers (incluidos los renderizados con portal) alineen su offset izquierdo
  // y el backdrop cubra exactamente la zona del sidebar, también al colapsar.
  useEffect(() => {
    const width = isSidebarOpen ? (isSidebarCollapsed ? '4rem' : '16rem') : '0px';
    document.documentElement.style.setProperty('--sidebar-w', width);
  }, [isSidebarOpen, isSidebarCollapsed]);
  // Determinar tab inicial basado en tamaño de pantalla (mobile vs desktop)
  const getInitialSellTab = (): SellTab => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    if (!isMobile) {
      try {
        const saved = localStorage.getItem('bistro_sell_tab');
        if (saved && (saved === 'orden_rapida' || saved === 'gastos')) {
          return saved as SellTab;
        }
      } catch (e) {
        console.warn('Error reading sell tab from localStorage:', e);
      }
    }

    return 'orden_rapida';
  };

  const [sellTab, setSellTab] = useState<SellTab>(getInitialSellTab);

  // App State for Products
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  // Espejo en ref: el listener de realtime lo lee sin re-suscribir el canal.
  const productsRef = useRef<Product[]>(products);
  productsRef.current = products;

  // Gate de carga inicial: mantiene Sidebar + contenido ocultos (bajo el AppLoader)
  // hasta que TODO esté listo, y luego los revela juntos con un fade-in. Latch de una
  // sola vez: una vez visible, nunca se vuelve a ocultar al navegar.
  const [appReady, setAppReady] = useState(false);
  const handleSellContentReady = useCallback(() => setAppReady(true), []);

  // Abrir el chat de soporte al recibir postMessage del Service Worker (app en foreground/background)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_SUPPORT_CHAT') {
        setRagChatMounted(true);
        setRagChatOpen(true);
        setRagChatMinimized(false);
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  // Abrir el chat de soporte si la app fue lanzada desde una notificación push
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'open_chat') {
      setRagChatMounted(true);
      setRagChatOpen(true);
      setRagChatMinimized(false);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Si la pantalla inicial NO es la de venta, no hay catálogo que esperar: revelar ya.
  useEffect(() => {
    if (!appReady && currentScreen !== Screen.SELL) setAppReady(true);
  }, [appReady, currentScreen]);

  // Fallback: nunca dejar la app oculta más de 3s (ej. offline sin productos en caché).
  useEffect(() => {
    if (appReady) return;
    const t = setTimeout(() => setAppReady(true), 3000);
    return () => clearTimeout(t);
  }, [appReady]);

  // Persist cart to localStorage.
  // `bistro_cart` es EXCLUSIVAMENTE la caché del carrito de Orden Rápida / Delivery.
  // Solo se escribe cuando NO hay mesa activa y NO estamos en la pestaña Mesas, de
  // modo que:
  //   - Los items de una mesa NUNCA entran a bistro_cart (no se "fugan" a Orden
  //     Rápida al recargar/sincronizar; la orden de mesa vive en la BD/snapshot).
  //   - Al cambiar de Orden Rápida a una mesa y volver, el carrito de Orden Rápida
  //     se conserva (no se sobrescribe con vacío).
  useEffect(() => {
    try {
      if (!activeTableId && sellTab !== 'mesas') {
        localStorage.setItem('bistro_cart', JSON.stringify(cart));
      }
    } catch { }
  }, [cart, activeTableId, sellTab]);

  useEffect(() => {
    try {
      // Mismo criterio que el carrito: el cliente de una mesa vive en su orden.
      if (!activeTableId && sellTab !== 'mesas') {
        localStorage.setItem('bistro_cart_client', JSON.stringify(deliveryClient));
      }
    } catch { }
  }, [deliveryClient, activeTableId, sellTab]);

  // Cart Hydration Effect: Updates images when products load
  useEffect(() => {
    if (products.length > 0 && cart.length > 0) {
      const needsHydration = cart.some(item => !item.image && item.id && products.some(p => p.id && p.id.toString() === item.id.toString()));

      if (needsHydration) {
        logger.log('[App] Hydrating cart images...');
        setCart(prevCart => prevCart.map(item => {
          if (item.image || !item.id) return item; // Already has image or invalid ID
          const product = products.find(p => p.id && p.id.toString() === item.id.toString());
          if (product) {
            return { ...item, image: product.image, category: product.category, description: product.description };
          }
          return item;
        }));
      }
    }
  }, [products, cart.length]); // Check when products load or cart size changes



  // Fetch products from Supabase
  useEffect(() => {
    if (profile?.business_id) {
      fetchProducts();
    }
  }, [profile?.business_id]);

  // Realtime: sync product changes (stock, altas/bajas) y cambios de etiquetas/carpetas de categorías
  // Gate por permisos: solo se suscribe si el usuario trabaja con productos (Opción A).
  const canProducts = canViewProducts();
  useEffect(() => {
    if (!profile?.business_id || !canProducts) return;

    const channel = supabase
      .channel('products-sync')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'products',
          filter: `business_id=eq.${profile.business_id}`,
        },
        (payload) => {
          const { eventType, new: newRecord, old: oldRecord } = payload;

          // Cambio propio de este dispositivo: App ya lo aplicó vía 'sale-completed'
          // y useProducts no necesita refrescarse a sí mismo. No emitimos relay.
          if (isLocalStockUpdateRef.current) {
            return;
          }

          // Relay solo para cambios REMOTOS, para los consumidores de useProducts
          // (que ya no tienen canal propio).
          window.dispatchEvent(new CustomEvent('products-realtime-changed', {
            detail: { eventType, new: newRecord, old: oldRecord },
          }));

          if (eventType === 'UPDATE' && newRecord) {
            const rec = newRecord as any;
            const current = productsRef.current.find(p => p.id === rec.id);
            // El catálogo del POS solo contiene activos y vendibles, y no puede resolver
            // el nombre de una categoría nueva desde el payload: esos casos van por refetch.
            const needsFullRefetch =
              !current ||
              rec.is_active === false ||
              rec.is_for_sale === false ||
              rec.category_id !== (current as any).category_id;

            if (needsFullRefetch) {
              fetchProducts();
            } else {
              setProducts(prev => prev.map(p =>
                p.id === rec.id
                  ? {
                    ...p,
                    name: rec.name,
                    price: rec.price,
                    stock: rec.stock,
                    unit: rec.unit,
                    type: rec.type,
                    barcode: rec.barcode,
                    description: rec.description,
                    // Sigue a la fila incluido el null (imagen borrada).
                    image: rec.image_url || '',
                    nicknames: rec.nicknames || [],
                    is_favorite: rec.is_favorite ?? p.is_favorite,
                    hasCustomization: rec.has_customization,
                    excludedOptions: rec.excluded_options || [],
                    sale_presentations: rec.sale_presentations || [],
                  }
                  : p
              ));
            }
          } else if (eventType === 'INSERT' || eventType === 'DELETE') {
            fetchProducts();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'categories',
          filter: `business_id=eq.${profile.business_id}`,
        },
        (payload) => {
          const { eventType, new: catRecord } = payload;
          if (eventType === 'UPDATE' && catRecord) {
            // Propagar en tiempo real los cambios de etiquetas/carpetas (customizable_options)
            // de una categoría a todos sus productos en este dispositivo.
            const cat = catRecord as any;
            if (!cat?.id) return;
            setProducts(prev => prev.map(p =>
              (p as any).category_id === cat.id
                ? { ...p, customizableOptions: cat.customizable_options || [] }
                : p
            ));
          } else if (eventType === 'INSERT' || eventType === 'DELETE') {
            // Alta/baja de una categoría completa: recargar para reflejar el catálogo.
            fetchProducts();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.business_id, canProducts]);

  // Listen for inventory updates from ExpenseModal (optimistic local update)
  useEffect(() => {
    const handleInventoryUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.productId && detail?.newStock !== undefined) {
        setProducts(prev => prev.map(p =>
          p.id === detail.productId ? { ...p, stock: detail.newStock } : p
        ));
      } else {
        fetchProducts();
      }
    };
    window.addEventListener('inventory-updated', handleInventoryUpdate);
    return () => window.removeEventListener('inventory-updated', handleInventoryUpdate);
  }, []);

  // [FIX] Listen for sale completion to update stock locally (Optimistic Update)
  useEffect(() => {
    const handleSaleCompleted = async (event: CustomEvent) => {
      const soldItems = event.detail.items;
      if (!soldItems || soldItems.length === 0) return;

      logger.log('[App] 📉 Updating local stock for sold items:', soldItems);

      // Separar items normales de promociones
      const normalItems = soldItems.filter((item: any) => item.productId && !item.promotionId);
      const promoItems = soldItems.filter((item: any) => item.promotionId);

      // Actualizar stock de productos normales (lógica con conversion_factor)
      if (normalItems.length > 0) {
        setProducts(prev => prev.map(product => {
          const matchingSoldItems = normalItems.filter((item: any) => item.productId === product.id);
          if (matchingSoldItems.length > 0 && product.stock !== undefined && product.stock !== null) {
            const totalDeduct = matchingSoldItems.reduce((sum: number, item: any) => sum + (item.quantity * (item.conversion_factor || 1)), 0);
            return { ...product, stock: product.stock - totalDeduct };
          }
          return product;
        }));
      }

      // Actualizar stock de productos dentro de promociones
      if (promoItems.length > 0) {
        for (const promoItem of promoItems) {
          const { data: promoProducts } = await supabase
            .from('promotion_items')
            .select('product_id')
            .eq('promotion_id', promoItem.promotionId);

          if (promoProducts && promoProducts.length > 0) {
            const productIds = promoProducts.map((p: any) => p.product_id);
            setProducts(prev => prev.map(product => {
              if (productIds.includes(product.id) && product.stock !== undefined && product.stock !== null) {
                return { ...product, stock: product.stock - promoItem.quantity };
              }
              return product;
            }));
          }
        }
      }
    };

    window.addEventListener('sale-completed', handleSaleCompleted as unknown as EventListener);
    return () => window.removeEventListener('sale-completed', handleSaleCompleted as unknown as EventListener);
  }, []);

  // Listen for wastage registration to update stock locally (same pattern as sale-completed)
  useEffect(() => {
    const handleWastageStockUpdated = (event: Event) => {
      const customEvent = event as CustomEvent;
      const wastedItems = customEvent.detail.items;
      if (!wastedItems || wastedItems.length === 0) return;

      setProducts(prevProducts => prevProducts.map(product => {
        const wastedItem = wastedItems.find((item: any) => item.productId === product.id);
        if (wastedItem && product.stock !== undefined && product.stock !== null) {
          const newStock = product.stock - wastedItem.quantity;
          return { ...product, stock: newStock };
        }
        return product;
      }));
    };

    window.addEventListener('wastage-stock-updated', handleWastageStockUpdated as EventListener);
    return () => window.removeEventListener('wastage-stock-updated', handleWastageStockUpdated as EventListener);
  }, []);

  // Toggle de favorito (optimista) disparado desde las tarjetas del catálogo
  useEffect(() => {
    const handleFavoriteToggled = async (event: Event) => {
      const detail = (event as CustomEvent).detail as { productId: string; value: boolean };
      if (!detail?.productId) return;
      const { productId, value } = detail;

      // Update optimista
      let updated: Product[] = [];
      setProducts(prev => {
        updated = prev.map(p => (p.id === productId ? { ...p, is_favorite: value } : p));
        return updated;
      });
      saveSellProducts(updated).catch(() => { });

      const { error } = await supabase
        .from('products')
        .update({ is_favorite: value })
        .eq('id', productId);

      if (error) {
        console.error('[App] Error guardando favorito:', error);
        // Revertir
        setProducts(prev => {
          const reverted = prev.map(p => (p.id === productId ? { ...p, is_favorite: !value } : p));
          saveSellProducts(reverted).catch(() => { });
          return reverted;
        });
        appToast.showToast('No se pudo guardar el favorito', 'error');
      }
    };

    window.addEventListener('favorite-toggled', handleFavoriteToggled as EventListener);
    return () => window.removeEventListener('favorite-toggled', handleFavoriteToggled as EventListener);
  }, []);



  // Real-time subscription expiration check
  useEffect(() => {
    if (!subscriptionEndDate || !hasActiveSubscription) return;

    // Check every 30 seconds if subscription has expired
    const interval = setInterval(() => {
      const now = new Date();
      if (subscriptionEndDate <= now) {
        logger.log('[App] Subscription expired, triggering recheck...');
        checkSubscription();
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [subscriptionEndDate, hasActiveSubscription, checkSubscription]);


  const loadProductsFromCache = async () => {
    try {
      const idbProducts = await getSellProducts();
      if (idbProducts.length > 0) {
        console.log(`[App] ⚡ ${idbProducts.length} productos desde IndexedDB`);
        const sortedProducts = [...idbProducts].sort((a, b) => a.name.localeCompare(b.name));
        setProducts(sortedProducts);
      }
    } catch { }
    setProductsLoading(false);
  };

  const fetchProducts = async () => {
    console.log('🔎[FETCH][productos-POS] App.fetchProducts ejecutado — catálogo del POS');
    if (products.length === 0) {
      setProductsLoading(true);
      try {
        const idbProducts = await getSellProducts();
        if (idbProducts.length > 0) {
          console.log(`[App] ⚡ ${idbProducts.length} productos desde IndexedDB (instant)`);
          const sortedProducts = [...idbProducts].sort((a, b) => a.name.localeCompare(b.name));
          setProducts(sortedProducts);
          setProductsLoading(false);
          if (!navigator.onLine) return;
        }
      } catch { }
    }

    if (!navigator.onLine) {
      if (products.length === 0) await loadProductsFromCache();
      else setProductsLoading(false);
      return;
    }

    try {
      const fetchPromise = Promise.all([
        supabase
          .from('products')
          .select(`
                id, name, price, image_url, category_id, description,
                has_customization, customizable_options, excluded_options,
                ingredients, unit, stock, type, nicknames, barcode, is_favorite,
                sale_presentations,
                category:categories(name, customizable_options)
              `)
          .eq('business_id', profile?.business_id)
          .eq('is_active', true)
          .eq('is_for_sale', true)
          .order('name', { ascending: true }),
        supabase
          .from('promotions')
          .select(`
            *,
            promotion_items (
              id,
              product_id,
              promo_price,
              product:products (name, image_url, cost, price)
            )
          `)
          .eq('business_id', profile?.business_id)
          .eq('is_active', true)
      ]);

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('FETCH_TIMEOUT')), 5000)
      );

      const [productsRes, promotionsRes] = await Promise.race([fetchPromise, timeoutPromise]) as any;

      if (productsRes.error) throw productsRes.error;

      const data = productsRes.data;
      const promoData = promotionsRes.data;

      let mappedProducts: Product[] = [];

      if (data) {
        mappedProducts = data.map((p: any) => ({
          id: p.id,
          name: p.name,
          price: p.price,
          image: p.image_url || '',
          category: p.category?.name || 'Sin Categoría',
          category_id: p.category_id,
          description: p.description,
          hasCustomization: p.has_customization,
          customizableOptions: p.category?.customizable_options || p.customizable_options || [],
          excludedOptions: p.excluded_options || [],
          ingredients: p.ingredients || [],
          unit: p.unit,
          stock: p.stock,
          type: p.type,
          nicknames: p.nicknames || [],
          barcode: p.barcode,
          is_favorite: p.is_favorite ?? false,
          sale_presentations: p.sale_presentations || []
        }));
      }

      if (promoData) {
        const promoProducts: Product[] = promoData.map((promo: any) => ({
          id: `promo_${promo.id}`,
          name: `🏷️ ${promo.name}`,
          price: promo.total_price,
          image: promo.image_url || '',
          category: 'Promociones',
          description: promo.description || `Promoción: ${(promo.promotion_items || []).map((i: any) => i.product?.name).filter(Boolean).join(' + ')}`,
          hasCustomization: false,
          unit: 'Unidad',
          type: 'promotion',
          nicknames: []
        }));
        mappedProducts = [...mappedProducts, ...promoProducts];
      }

      setProducts(mappedProducts);
      console.log(`[App] ✅ Productos cargados: ${mappedProducts.length}`);

      saveSellProducts(mappedProducts).catch(() => { });
    } catch (err) {
      console.error("[App] ❌ Error o timeout fetching products:", err);
      if (products.length === 0) await loadProductsFromCache();
    } finally {
      setProductsLoading(false);
    }
  };

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  const [simpleNoteProduct, setSimpleNoteProduct] = useState<Product | null>(null);
  const [optionsProduct, setOptionsProduct] = useState<Product | null>(null); // Unified options modal
  const [expandedCartItemId, setExpandedCartItemId] = useState<string | null>(null); // Track expanded cart item after edit

  // State to hold the details of the last completed transaction
  const [lastTransaction, setLastTransaction] = useState<TransactionDetails | null>(null);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  // Payment processing state
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const isLocalStockUpdateRef = React.useRef(false);

  // Sales Hook for Supabase integration - Split into specialized hooks
  const {
    addItemToOrder,
    addItemToOrderById,
    removeOrderItem,
    removeOrderItemById,
    updateOrderItemQuantity,
    updateOrderItemQuantityById,
    fetchTableOrder,
    syncOrderItems
  } = useOrderItems();

  const { confirmOrder, createOrder } = useOrders();

  // Animation State
  const [flyingItems, setFlyingItems] = useState<FlyingItem[]>([]);

  // Toast State
  const [toast, setToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });

  const showToast = useCallback((message: string) => {
    setToast({ message, visible: true });
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 2000);
  }, []);

  const showNotificationToast = useCallback((message: string) => {
    setToast({ message, visible: true });
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audio.play().catch(() => { });
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 5000);
  }, []);


  const { shouldNotify } = useNotifications();

  const { isOnline, pendingCount, failedCount, isSyncing, lastSyncResult, syncAll, refreshPending, clearFailed } = useOfflineSync();

  // Rol offline del usuario (modelo Usuario Eje): `soyEje` habilita el cobro de
  // mesas sin conexión aunque no tenga `canFinalizeSale` (Req 4.2, 12.x).
  const { soyEje } = useEjeStatus();

  // Presencia en tiempo real: cada usuario autenticado anuncia su presencia
  // para que admins la vean en Screen.ACTIVITY. No escribe en BD (canal efímero).
  // Se pasa el turno activo para que el `cash_shift_id` viaje en el payload de
  // presencia y el Usuario Eje sea identificable directamente (modelo Usuario Eje).
  usePresenceBroadcast(activeShiftId);

  // Ref to track when local operations are in progress (to skip Realtime refresh)
  // FIX: Changed from boolean to counter to handle multiple simultaneous operations
  const localOperationCount = useRef(0);

  // --- REALTIME SUBSCRIPTIONS ---

  // REALTIME: Listen for changes in order_items for the ACTIVE TABLE
  // FIX: Dynamically check order_id on each event to handle DELETE correctly
  const realtimeRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cartRef = useRef<CartItem[]>(cart);
  cartRef.current = cart;
  useEffect(() => {
    if (!activeTableId || !profile?.business_id) {
      return;
    }

    // Setup subscription asynchronously to get current_order_id first
    const setupSubscription = async () => {
      // Get current order ID for this table
      const { data: tableData } = await supabase
        .from('tables')
        .select('current_order_id')
        .eq('id', activeTableId)
        .single();

      const currentOrderId = tableData?.current_order_id;

      // Helper to refresh cart data without changing screen
      const refreshActiveTable = async (allowDefer = true) => {
        if (!activeTableId) return;
        try {
          const order = await fetchTableOrder(activeTableId);

          if (order && order.items) {
            const reconstructedCart: CartItem[] = order.items.map((item: any) => {
              const product = products.find(p => p.id === item.product_id);
              const baseProduct = product || {
                id: item.product_id,
                name: item.product_name,
                price: item.unit_price,
                image: '',
                category: '',
                description: '',
                hasCustomization: false
              };

              return {
                ...baseProduct,
                quantity: item.quantity,
                notes: item.notes,
                cookingTerm: item.cooking_term,
                removedIngredients: item.removed_ingredients || [],
                price: item.unit_price,
                orderItemId: item.id,
                parentOrderItemId: item.parent_order_item_id || undefined,
                status: item.status,
                pendingSync: item.pendingSync
              } as CartItem;
            });

            // Anti-parpadeo: al editar modificadores en otro dispositivo, la BD hace
            // DELETE (item viejo) + INSERT (nuevo). Si el evento DELETE llega antes del
            // INSERT, el carrito reconstruido tiene MENOS items (el producto desaparece).
            // En ese caso diferimos y re-verificamos: cuando llega el INSERT, aplicamos
            // el estado final directamente, sin el hueco vacío intermedio.
            const prevTop = cartRef.current.filter(it => !it.parentOrderItemId).length;
            const newTop = reconstructedCart.filter(it => !it.parentOrderItemId).length;
            if (allowDefer && newTop < prevTop) {
              setTimeout(() => { refreshActiveTable(false); }, 600);
              return;
            }

            setCart(reconstructedCart);
          } else {
            setCart([]);
          }
        } catch (e) {
          console.error('[Realtime] Error refreshing cart:', e);
        }
      };

      // Debounce: una modificación de producto en otro dispositivo genera una
      // ráfaga de eventos (DELETE del item viejo + INSERT del nuevo + hijas).
      // Sin debounce, cada evento hace setCart y el producto "desaparece y
      // reaparece". Colapsamos la ráfaga en un solo refresh con el estado final.
      const debouncedRefresh = () => {
        if (realtimeRefreshTimerRef.current) clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = setTimeout(() => { refreshActiveTable(); }, 200);
      };

      // Solo escuchar order_items si la mesa tiene una orden activa (filtrado por order_id).
      // Si la mesa no tiene orden, cuando otro dispositivo cree una orden se actualizará
      // la tabla 'tables' (current_order_id), lo cual ya lo maneja useTables.
      if (!currentOrderId) {
        return null;
      }

      const channel = supabase
        .channel(`order-items-${activeTableId}-${currentOrderId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'order_items',
            filter: `order_id=eq.${currentOrderId}` // Server-side filter
          },
          async (payload) => {
            // Ignorar TODOS los eventos durante operación local para evitar parpadeos
            if (localOperationCount.current > 0) {
              return;
            }
            // Refresh (debounced) para colapsar ráfagas de eventos.
            debouncedRefresh();
          }
        )
        .subscribe();

      return channel;
    };

    let channelPromise = setupSubscription();

    return () => {
      if (realtimeRefreshTimerRef.current) {
        clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
      channelPromise.then(channel => {
        if (channel) {
          supabase.removeChannel(channel);
        }
      });
    };

  }, [activeTableId, profile?.business_id, cart.length > 0 ? cart[0]?.orderItemId?.split('-')[0] : null]); // Re-subscribe when order changes





  const handleConfirmOrder = async () => {
    if (!activeTableId) return;
    try {
      // OFFLINE (Req 11.2): resolver el order_id desde el snapshot local en vez
      // de consultar Supabase; `confirmOrder` marca los items pending → preparing
      // en Cache_Orden_Mesa_IDB. La impresión local la resuelve SendCommandaModal.
      if (!isOnline) {
        const cached = await getTableOrder(activeTableId);
        if (cached?.order_id) {
          await confirmOrder(cached.order_id);
          showToast("Orden confirmada 👌");
        }
        return;
      }

      // Find active order ID from the cart items (all share same order_id usually)
      // Or re-fetch active table order ID.
      const { data: table } = await supabase
        .from('tables')
        .select('current_order_id')
        .eq('id', activeTableId)
        .single();

      if (table?.current_order_id) {
        await confirmOrder(table.current_order_id);
        showToast("Orden confirmada y notificada 👌");
      }
    } catch (error) {
      console.error("Error confirming:", error);
      showToast("Error al confirmar orden");
    }
  };


  const [adminEditingProduct, setAdminEditingProduct] = useState<AdminProduct | null>(null);
  const [createOriginScreen, setCreateOriginScreen] = useState<Screen>(Screen.SELL);

  // Cierra el panel de caja y, si había una intención pendiente de entrar a PhotoOrder con turno abierto, navega allí
  const handleCloseCashRegister = () => {
    setIsCashRegisterOpen(false);
    if (pendingPhotoOrderEntryRef.current) {
      pendingPhotoOrderEntryRef.current = false;
      const hasOpenShift = isShiftOpen || (profile?.business_id ? !!localStorage.getItem(`bistro_active_shift_${profile.business_id}`) : false);
      if (hasOpenShift) {
        setCurrentScreen(Screen.PHOTO_ORDER);
      }
    }
  };

  // Abre/cierra el menú "Más" desde el nav, cerrando Caja si estaba abierta
  // (Caja y "Más" son mutuamente excluyentes).
  const handleToggleMobileMenu = () => {
    setIsCashRegisterOpen(false);
    setIsMobileMenuOpen(v => !v);
  };

  // Lee la caché del carrito de Orden Rápida (localStorage). Se usa para
  // restaurar los productos de Orden Rápida al volver desde una mesa o tras
  // recargar, sin perderlos. Devuelve [] ante cualquier error.
  const readQuickOrderCart = (): CartItem[] => {
    try {
      const saved = localStorage.getItem('bistro_cart');
      if (saved) return JSON.parse(saved);
    } catch { }
    return [];
  };

  // Lee el cliente asociado a la Orden Rápida (localStorage).
  const readQuickOrderClient = (): Client | null => {
    try {
      const saved = localStorage.getItem('bistro_cart_client');
      if (saved) return JSON.parse(saved);
    } catch { }
    return null;
  };

  const handleNavigate = (screen: Screen) => {
    // 🔒 NAVIGATION LOCK CHECK
    if (navigationLocked) {
      logger.log(`[handleNavigate] 🛡️ Navigation BLOCKED by lock (Target: ${screen})`);
      return;
    }

    // 🔒 PERMISSIONS CHECK
    const unprotectedScreens = [Screen.LOGIN, Screen.REGISTER, Screen.PROFILE];
    if (!unprotectedScreens.includes(screen) && profile && !canAccessScreen(screen)) {
      appToast.showToast('No tienes permisos para acceder a esta sección', 'error');
      logger.log(`[handleNavigate] 🚫 Permission denied for screen: ${screen}`);
      return;
    }

    if (screen !== Screen.PHOTO_ORDER && screen !== Screen.CASH_REGISTER) {
      pendingPhotoOrderEntryRef.current = false;
    }

    // Abrir caja como sidebar lateral en lugar de navegar
    if (screen === Screen.CASH_REGISTER) {
      setIsMobileMenuOpen(false);
      setIsCashRegisterOpen(true);
      return;
    }

    // 🔒 Turno obligatorio para escanear lista de ventas
    if (screen === Screen.PHOTO_ORDER && !isShiftOpen) {
      if (canOpenShift()) {
        pendingPhotoOrderEntryRef.current = true;
        appToast.showToast('Primero abre un turno de caja', 'warning');
        setIsCashRegisterOpen(true);
      } else {
        pendingPhotoOrderEntryRef.current = false;
        appToast.showToast('No hay turno abierto. Pídele a un administrador que lo abra.', 'warning');
      }
      return;
    }

    // 🔒 Turno obligatorio: solo bloquear cuando se va DIRECTO a cobrar
    // (flag skip_summary: botones "Procesar Pago"/"Cobrar" y escáner). Abrir el
    // carrito/resumen (ej. FAB de tablet) no requiere turno; la finalización real
    // está protegida en handleProcessPayment.
    if (screen === Screen.PAYMENT && !isShiftOpen) {
      const goingDirectToCharge = sessionStorage.getItem('bistro_payment_skip_summary') === 'true';
      if (goingDirectToCharge) {
        // Consumir el flag: si el intento se bloquea aquí, PaymentScreen no se monta
        // y no lo limpiaría, dejando un flag obsoleto que afectaría al próximo FAB.
        sessionStorage.removeItem('bistro_payment_skip_summary');
        if (canOpenShift()) {
          appToast.showToast('Primero abre un turno de caja', 'warning');
          setIsMobileMenuOpen(false);
          setIsCashRegisterOpen(true);
        } else {
          appToast.showToast('No hay turno abierto. Pídele a un administrador que lo abra.', 'warning');
        }
        return;
      }
    }

    // Cualquier otra navegación cierra los overlays abiertos (caja y menú "Más")
    setIsCashRegisterOpen(false);
    setIsMobileMenuOpen(false);

    // Abrir asistente IA como widget flotante en lugar de navegar
    if (screen === Screen.RAG_CHAT) {
      setRagChatMounted(true);
      setRagChatOpen(true);
      setRagChatMinimized(false);
      return;
    }

    // Clear admin editing product if leaving creation screens
    if (
      screen !== Screen.CREATE_PRODUCT_SIMPLE &&
      screen !== Screen.CREATE_PRODUCT_PROCESSED &&
      screen !== Screen.CREATE_PRODUCT_SERVICE &&
      screen !== Screen.CREATE_PROMOTION &&
      screen !== Screen.EDIT_PROMOTION
    ) {
      setAdminEditingProduct(null);
    }

    // Guardar pantalla de origen antes de navegar a creación
    const creationScreens = [Screen.CREATE_PRODUCT_SIMPLE, Screen.CREATE_PRODUCT_PROCESSED, Screen.CREATE_PRODUCT_SERVICE, Screen.CREATE_PROMOTION];
    if (creationScreens.includes(screen)) {
      if (!creationScreens.includes(currentScreen)) {
        setCreateOriginScreen(currentScreen);
      }
    }

    if (screen === Screen.TABLES) {
      setActiveTable(undefined);
      setActiveTableId(undefined);
      setDeliveryMode(false);
      setEditingOrderId(null);
      setEditingOrderStatus('');
      orderLoadedForTableRef.current = null;
      // Contexto Mesas: el carrito de Orden Rápida queda a salvo en bistro_cart
      // (el gate de persistencia no lo sobrescribe con la pestaña Mesas activa).
      setSellTab('mesas');
      setCart([]);
      setDeliveryClient(null);
    }
    if (screen === Screen.QUICK_ORDER) {
      // Clear table context for quick orders to ensure 'takeaway' type
      setActiveTable(undefined);
      setActiveTableId(undefined);
      orderLoadedForTableRef.current = null;
      setSellTab('orden_rapida');
      // Restaurar el carrito de Orden Rápida (no perder sus productos), salvo que
      // estemos regresando desde la pantalla de pago (que conserva el carrito vivo).
      if (currentScreen !== Screen.PAYMENT) {
        const restored = readQuickOrderCart();
        setCart(restored);
        setDeliveryClient(readQuickOrderClient());
      }
      setSaleOrigin('orders');
    }

    // Al navegar a PAYMENT, asegurar que saleOrigin refleje correctamente el contexto
    if (screen === Screen.PAYMENT && !activeTableId) {
      setSaleOrigin('orders');
    }

    if (screen === Screen.MENU && currentScreen === Screen.PAYMENT && window.innerWidth < 768) {
      logger.log(`[handleNavigate] Mobile: redirecting MENU -> SELL to preserve header`);
      startTransition(() => {
        setCurrentScreen(Screen.SELL);
      });
      setTimeout(() => window.dispatchEvent(new CustomEvent('focus-menu-search')), 150);
      return;
    }

    // Opción B: MENU directo ya no existe como pantalla autónoma; redirigir a SELL.
    if (screen === Screen.MENU) {
      startTransition(() => {
        setCurrentScreen(Screen.SELL);
      });
      return;
    }

    if (screen === Screen.SELL || screen === Screen.QUICK_ORDER || screen === Screen.TABLES) {
      fetchProducts();
    }

    logger.log(`[handleNavigate] from=${currentScreen} to=${screen} saleOrigin=${saleOrigin} activeTableId=${activeTableId}`);

    // Limpiar hash de la URL al salir de pantallas de auth (login/register/landing)
    if (screen !== Screen.LOGIN && screen !== Screen.REGISTER) {
      const hash = window.location.hash;
      if (hash === '#login' || hash === '#register') {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }

    // Al navegar fuera de Foto Venta o Compra Inventario, restaurar URL limpia a la raíz
    if (screen !== Screen.PHOTO_ORDER && typeof window !== 'undefined' && (window.location.pathname === '/foto-venta' || window.location.pathname === '/compra-inventario')) {
      window.history.replaceState(null, '', '/');
      document.title = 'Bistro POS';
      const mLink = document.getElementById('pwa-manifest') || document.querySelector('link[rel="manifest"]');
      if (mLink) mLink.setAttribute('href', '/manifest.json');
    }

    startTransition(() => {
      setCurrentScreen(screen);
    });

    if (screen === Screen.SELL && currentScreen === Screen.PAYMENT && window.innerWidth < 768) {
      setTimeout(() => window.dispatchEvent(new CustomEvent('focus-menu-search')), 150);
    }
  };

  const handleStartNewSale = () => {
    // No limpiar el carrito: el usuario pudo haber agregado productos
    // con el SuccessSidebar abierto. Solo navegamos y reseteamos el tab.
    // Sí limpiamos las etiquetas de comanda porque son del pedido anterior.
    setComandaLabelSelection({});
    if (saleOrigin === 'scanner') {
      // Incrementar key para forzar remontaje limpio del PhotoOrderScreen
      setPhotoOrderKey(prev => prev + 1);
      setCurrentScreen(Screen.PHOTO_ORDER);
      return;
    }
    setSellTab('orden_rapida');
    setActiveTable(undefined);
    setActiveTableId(undefined);
    setDeliveryClient(null);
    setSaleOrigin('orders');
    setCurrentScreen(Screen.SELL);
    setTimeout(() => window.dispatchEvent(new CustomEvent('focus-menu-search')), 200);
  };

  const handleClearCart = async () => {
    // If we're in a table context, also clean the DB order
    if (activeTableId) {
      try {
        const { data: tableData } = await supabase
          .from('tables')
          .select('current_order_id')
          .eq('id', activeTableId)
          .single();

        if (tableData?.current_order_id) {
          // Delete order items first, then the order
          await supabase
            .from('order_items')
            .delete()
            .eq('order_id', tableData.current_order_id);

          await supabase
            .from('orders')
            .delete()
            .eq('id', tableData.current_order_id);
        }

        // Free the table
        await supabase
          .from('tables')
          .update({ status: 'available', current_order_id: null })
          .eq('id', activeTableId);
      } catch (err) {
        console.error('[handleClearCart] Error cleaning table order:', err);
      }
    }

    setCart([]);
    setDeliveryClient(null);
    // Al vaciar el carrito también limpiamos las etiquetas de comanda,
    // ya que pertenecen al pedido que se está descartando.
    setComandaLabelSelection({});
  };

  const handleTableSelect = async (table: Table) => {
    setActiveTable(table.label);
    setActiveTableId(table.id);
    setSaleOrigin('tables');
    setDeliveryMode(false);
    setTableOrderError(false);
    retryTableRef.current = table;

    const isOccupied = table.status === 'occupied';
    const hasOrderId = !!table.current_order_id;

    // Estado fantasma (Req 4.6): mesa marcada ocupada pero sin orden válida → no fetch.
    // Solo aplica ONLINE: sin conexión no podemos verificar el estado real contra
    // Supabase y puede existir un snapshot local de la orden en IndexedDB aunque
    // el objeto en memoria luzca inconsistente. Offline confiamos en el snapshot.
    if (isOnline && isOccupied && !hasOrderId) {
      appToast.showToast('Esta mesa está marcada como ocupada pero no tiene una orden válida.', 'warning');
      setCart([]);
      setDeliveryClient(null);
      orderLoadedForTableRef.current = null;
      if (currentScreen !== Screen.SELL) setCurrentScreen(Screen.MENU);
      return;
    }

    // Idempotencia (Req 4.7): si ya cargamos la orden de esta mesa y el carrito
    // la conserva, no repetimos el fetch.
    const skipFetch = orderLoadedForTableRef.current === table.id && cart.length > 0;

    // Estado de carga (Req 4.2): solo al traer una orden ocupada.
    const showLoader = isOccupied && hasOrderId && !skipFetch;
    if (showLoader) setLoadingTableId(table.id);

    // Fetch active order from DB (con timeout de 10s — Req 4.1)
    let order: any = null;
    try {
      if (!skipFetch) {
        if (!isOnline) {
          // OFFLINE (Req 2.2): hidratar desde Cache_Orden_Mesa_IDB sin timeout de
          // red. `fetchTableOrder` se autocura: si el snapshot quedó obsoleto (la
          // mesa figura libre en el cache y no hay cambios offline pendientes) lo
          // limpia y devuelve null, así la mesa aparece libre dinámicamente.
          order = await fetchTableOrder(table.id);
        } else {
          order = await Promise.race([
            fetchTableOrder(table.id),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
          ]);
        }
      }
    } catch (e) {
      console.error('[handleTableSelect] Error cargando la orden de la mesa:', e);
      // Req 4.5: ocultar carga, marcar error y conservar estado occupied sin tocar la orden.
      setLoadingTableId(null);
      setTableOrderError(true);
      return;
    }
    if (showLoader) setLoadingTableId(null);

    // Reapertura idempotente: conservar el carrito ya cargado y solo navegar.
    if (skipFetch) {
      if (currentScreen !== Screen.SELL) setCurrentScreen(Screen.MENU);
      return;
    }

    if (order && order.items) {
      const reconstructedCart: CartItem[] = order.items.map((item: any) => {
        const product = products.find(p => p.id === item.product_id);
        const baseProduct = product || {
          id: item.product_id,
          name: item.product_name,
          price: item.unit_price,
          image: '',
          category: '',
          description: '',
          hasCustomization: false,
          unit: item.sale_unit || 'Unidad'
        };

        return {
          ...baseProduct,
          quantity: item.quantity,
          notes: item.notes,
          cookingTerm: item.cooking_term,
          removedIngredients: item.removed_ingredients || [],
          price: item.unit_price,
          orderItemId: item.id,
          parentOrderItemId: item.parent_order_item_id || undefined,
          status: item.status,
          pendingSync: item.pendingSync,
          unit: item.sale_unit || baseProduct.unit || 'Unidad'
        } as CartItem;
      });
      setCart(reconstructedCart);
      orderLoadedForTableRef.current = table.id;

      // Load client from order if exists
      if (order.client_id && order.customer_name) {
        setDeliveryClient({
          id: order.client_id,
          name: order.customer_name,
          phone: '',
          address: ''
        } as Client);
        logger.log('[handleTableSelect] Loaded client from order:', order.customer_name);
      } else {
        // Clear client if order has no client
        setDeliveryClient(null);
      }
    } else {
      setCart([]);
      setDeliveryClient(null); // Clear client for empty orders
      orderLoadedForTableRef.current = null;
    }

    // Solo navegar a MENU si NO estamos en SellScreen (SellScreen maneja esto internamente)
    if (currentScreen !== Screen.SELL) {
      setCurrentScreen(Screen.MENU);
    }

    // Tablet (768-1024): si la mesa ya tiene items, abrir automáticamente el
    // overlay de pago (que muestra la orden). En móvil el carrito ya es la vista
    // principal y en desktop el carrito lateral siempre está visible.
    const hasItems = !!(order && Array.isArray(order.items) && order.items.length > 0);
    if (hasItems) {
      const w = window.innerWidth;
      const isTablet = w >= 768 && w < 1024;
      const canAutoOpen = currentScreen === Screen.SELL
        || currentScreen === Screen.QUICK_ORDER
        || currentScreen === Screen.MENU;
      if (isTablet && canAutoOpen) {
        setCurrentScreen(Screen.PAYMENT);
      }
    }
  };

  // Reintento de la carga de la orden de mesa tras un error (Req 4.5).
  const handleRetryTableOrder = () => {
    setTableOrderError(false);
    if (retryTableRef.current) handleTableSelect(retryTableRef.current);
  };



  const handleNewQuickOrder = () => {
    // Navigate to quick order mode (direct payment, no kitchen)
    setIsOrderSent(false); // Reset sent state
    setSaleOrigin('orders'); // For navigation back to orders screen
    setDeliveryMode(false);
    setActiveTable(undefined);
    setActiveTableId(undefined);
    orderLoadedForTableRef.current = null;
    setCart([]);
    setDeliveryClient(null); // Clear client from previous sale
    setCurrentScreen(Screen.QUICK_ORDER);
    showToast('Orden Rápida: Agrega productos');
  };


  const handleClientSelect = (client: Client) => {
    logger.log('[App.tsx] handleClientSelect called with:', client.name);
    setDeliveryClient(client);
    setShowDeliveryClientModal(false);
    showToast(`Cliente asignado: ${client.name}`);
  };







  const handleProductSelect = (product: Product) => {
    setSelectedProduct(product);
  };

  const handleEditProduct = (product: Product | CartItem) => {
    // Open unified options modal instead of separate edit modal
    setOptionsProduct(product);

    // Check if it's a cart item (has quantity property) using 'in' operator check or simple heuristic
    if ('quantity' in product) {
      setItemToSplit(product as CartItem);
    } else {
      setItemToSplit(null); // Ensure clean state if editing from menu
    }
  };

  const handleOpenSimpleNote = (product: Product) => {
    setSimpleNoteProduct(product);
  };

  const handleAddWithSimpleNote = async (product: Product, quantity: number, notes: string) => {
    // Add to order with just notes (no removed ingredients, no cooking term)
    await handleAddToOrder(product, quantity, [], '', notes);
  };

  const handleProductUpdate = async (updatedProduct: Product, categoryOptions?: CustomizableOption[]) => {
    const categoryId = (updatedProduct as any).category_id;

    // Optimistic update for this product
    setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));

    // Persistencia vía RPC `save_product_modifiers` (ver .kiro/steering/modificadores-permisos.md).
    // La RLS de products/categories sigue siendo admin-only; esta RPC SECURITY DEFINER permite que
    // también el rol Cajero guarde SOLO los modificadores, validando negocio y rol en la BD.
    try {
      const touchesCategory = categoryOptions !== undefined && !!categoryId;
      const { error } = await supabase.rpc('save_product_modifiers', {
        p_product_id: updatedProduct.id,
        p_has_customization: updatedProduct.hasCustomization ?? null,
        p_ingredients: updatedProduct.ingredients ?? null,
        p_excluded_options: updatedProduct.excludedOptions || [],
        p_category_id: touchesCategory ? categoryId : null,
        p_customizable_options: touchesCategory ? categoryOptions : null,
      });

      if (error) {
        console.error('Error guardando modificadores:', error);
        showToast(
          error.message?.includes('No autorizado')
            ? 'No tienes permiso para editar modificadores'
            : 'Error al guardar configuración'
        );
        return;
      }

      // Reflejar en el estado local los cambios a nivel de categoría
      if (touchesCategory) {
        if ((categoryOptions as CustomizableOption[]).length > 0) {
          setProducts(prev => prev.map(p =>
            (p as any).category_id === categoryId
              ? { ...p, hasCustomization: true, customizableOptions: categoryOptions }
              : p
          ));
        } else {
          setProducts(prev => prev.map(p =>
            (p as any).category_id === categoryId
              ? { ...p, customizableOptions: [] }
              : p
          ));
        }
      }

      showToast('Configuración guardada');
    } catch (err) {
      console.error('Error updating product:', err);
      showToast('Error al guardar configuración');
    }
  };

  const handleAdminEditProduct = (product: AdminProduct) => {
    setAdminEditingProduct(product);
    if (product.type === 'simple') {
      handleNavigate(Screen.CREATE_PRODUCT_SIMPLE);
    } else if (product.type === 'processed') {
      handleNavigate(Screen.CREATE_PRODUCT_PROCESSED);
    } else if (product.type === 'service') {
      handleNavigate(Screen.CREATE_PRODUCT_SERVICE);
    }
  };

  // State to track item being customized/split from cart
  const [itemToSplit, setItemToSplit] = useState<CartItem | null>(null);

  // ⚡ Memoized: evita recrear la función en cada render
  // Construye las líneas hijas (add-ons) para un padre local, resolviendo el producto completo
  // del catálogo para que el ticket e inventario las traten como una venta normal de ese producto.
  const buildModifierChildren = useCallback((parentOrderItemId: string, qty: number, modifiers: AddedModifier[]): CartItem[] => {
    return (modifiers || []).map((m, i) => {
      const full = products.find(p => p.id === m.id);
      const base: any = full || { id: m.id, name: m.name, price: m.price };
      return {
        ...base,
        price: m.price,
        quantity: qty,
        orderItemId: `local-mod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${i}`,
        parentOrderItemId,
      } as CartItem;
    });
  }, [products]);

  const handleAddToOrder = useCallback(async (product: Product, quantity: number, removedIngredients: string[], cookingTerm: string, notes: string, addedModifiers?: AddedModifier[], discount?: number, discountPercent?: number) => {

    // EDIT/SPLIT LOGIC: If we are editing from an existing cart item
    if (itemToSplit) {
      // Check if the new configuration is actually different from the original
      // Comparar add-ons por id (orden-independiente) para no descartar cambios de solo modificadores.
      const prevModIds = ((itemToSplit.addedModifiers || []).map(m => m.id)).sort().join(',');
      const nextModIds = ((addedModifiers || []).map(m => m.id)).sort().join(',');
      const isSameConfig =
        itemToSplit.id === product.id &&
        JSON.stringify(itemToSplit.removedIngredients || []) === JSON.stringify(removedIngredients || []) &&
        (itemToSplit.cookingTerm || '') === (cookingTerm || '') &&
        (itemToSplit.notes || '') === (notes || '') &&
        prevModIds === nextModIds;

      const isSameQuantity = itemToSplit.quantity === quantity;

      if (isSameConfig && isSameQuantity) {
        // Configuración y cantidad idénticas - no hay cambios, solo cerrar
        setItemToSplit(null);
        setSelectedProduct(null);
        return;
      }

      // ACTUALIZACIÓN IN-PLACE: Siempre modificar la misma fila sin hacer split
      const orderItemId = itemToSplit.orderItemId;

      setCart(prev => {
        let next: CartItem[];
        if (orderItemId) {
          // Match by orderItemId (works for both DB and local modes)
          next = prev.map(item =>
            item.orderItemId === orderItemId
              ? { ...item, quantity, removedIngredients, cookingTerm, notes, addedModifiers }
              : item
          );
        } else {
          // Fallback for items without orderItemId: match by id + original config
          const idx = prev.findIndex(item =>
            item.id === itemToSplit.id &&
            JSON.stringify(item.removedIngredients || []) === JSON.stringify(itemToSplit.removedIngredients || []) &&
            (item.cookingTerm || '') === (itemToSplit.cookingTerm || '') &&
            (item.notes || '') === (itemToSplit.notes || '')
          );
          if (idx >= 0) {
            next = [...prev];
            next[idx] = { ...next[idx], quantity, removedIngredients, cookingTerm, notes, addedModifiers };
          } else {
            next = prev;
          }
        }
        // Reconstruir las líneas add-on (hijas) de este padre tras reeditar.
        // Local: ids 'local-'. Mesa/Edición: el padre ya tiene orderItemId (temp o real).
        if (orderItemId && addedModifiers !== undefined) {
          next = next.filter(it => it.parentOrderItemId !== orderItemId);
          const children = buildModifierChildren(orderItemId, quantity, addedModifiers);
          if (children.length) {
            const pIdx = next.findIndex(it => it.orderItemId === orderItemId);
            if (pIdx >= 0) next = [...next.slice(0, pIdx + 1), ...children, ...next.slice(pIdx + 1)];
            else next = [...next, ...children];
          }
        }
        return next;
      });
      setIsOrderSent(false);

      // Sincronizar con la base de datos si corresponde
      if (activeTableId && orderItemId && !orderItemId.startsWith('temp-')) {
        localOperationCount.current++;
        try {
          await removeOrderItem(activeTableId, orderItemId);
          const result = await addItemToOrder(activeTableId, {
            product_id: product.id.startsWith('promo_') ? null : product.id,
            promotion_id: product.id.startsWith('promo_') ? product.id.replace('promo_', '') : null,
            name: product.name,
            price: product.price,
            quantity,
            notes: notes || null,
            cooking_term: cookingTerm || null,
            removed_ingredients: removedIngredients || [],
            addedModifiers: (addedModifiers && addedModifiers.length) ? addedModifiers : undefined
          });
          if (result) {
            const childIds: string[] = (result as any).childOrderItemIds || [];
            setCart(prev => {
              // Reemplazar id del padre y reconstruir sus hijas con ids reales.
              const withoutOldChildren = prev.filter(it => it.parentOrderItemId !== orderItemId);
              const rebuilt = (addedModifiers && addedModifiers.length)
                ? buildModifierChildren(result.orderItemId, quantity, addedModifiers).map((c, i) => ({ ...c, orderItemId: childIds[i] || c.orderItemId }))
                : [];
              const next = withoutOldChildren.map(item =>
                item.orderItemId === orderItemId ? { ...item, orderItemId: result.orderItemId } : item
              );
              if (rebuilt.length) {
                const pIdx = next.findIndex(it => it.orderItemId === result.orderItemId);
                if (pIdx >= 0) return [...next.slice(0, pIdx + 1), ...rebuilt, ...next.slice(pIdx + 1)];
                return [...next, ...rebuilt];
              }
              return next;
            });
            setExpandedCartItemId(result.orderItemId);
          }
        } catch (err) {
          console.error("Error updating cart item:", err);
          showToast("Error al actualizar producto");
        } finally {
          setTimeout(() => { localOperationCount.current = Math.max(0, localOperationCount.current - 1); }, 800);
        }
      } else if (editingOrderId && orderItemId && !orderItemId.startsWith('temp-')) {
        localOperationCount.current++;
        try {
          await removeOrderItemById(orderItemId);
          const result = await addItemToOrderById(editingOrderId, {
            product_id: product.id.startsWith('promo_') ? null : (product.parent_product_id || product.id),
            promotion_id: product.id.startsWith('promo_') ? product.id.replace('promo_', '') : null,
            conversion_factor: product.conversion_factor || 1,
            name: product.name,
            price: product.price,
            quantity,
            notes: notes || null,
            cooking_term: cookingTerm || null,
            removed_ingredients: removedIngredients || [],
            addedModifiers: (addedModifiers && addedModifiers.length) ? addedModifiers : undefined
          });
          if (result) {
            const childIds: string[] = (result as any).childOrderItemIds || [];
            setCart(prev => {
              const withoutOldChildren = prev.filter(it => it.parentOrderItemId !== orderItemId);
              const rebuilt = (addedModifiers && addedModifiers.length)
                ? buildModifierChildren(result.orderItemId, quantity, addedModifiers).map((c, i) => ({ ...c, orderItemId: childIds[i] || c.orderItemId }))
                : [];
              const next = withoutOldChildren.map(item =>
                item.orderItemId === orderItemId ? { ...item, orderItemId: result.orderItemId } : item
              );
              if (rebuilt.length) {
                const pIdx = next.findIndex(it => it.orderItemId === result.orderItemId);
                if (pIdx >= 0) return [...next.slice(0, pIdx + 1), ...rebuilt, ...next.slice(pIdx + 1)];
                return [...next, ...rebuilt];
              }
              return next;
            });
            setExpandedCartItemId(result.orderItemId);
          }
        } catch (err) {
          console.error("Error updating cart item:", err);
          showToast("Error al actualizar producto");
        } finally {
          setTimeout(() => { localOperationCount.current = Math.max(0, localOperationCount.current - 1); }, 800);
        }
      }

      setItemToSplit(null);
      setSelectedProduct(null);
      return;
    }

    if (activeTableId) {
      // DB Mode with OPTIMISTIC UPDATE
      // FIX: Moved existingIndex logic inside setCart to avoid race condition with rapid clicks
      const previousCart = [...cart];
      let wasExistingItem = false;
      const hasModifiers = !!(addedModifiers && addedModifiers.length > 0);
      const tempOrderItemId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      setCart(prev => {
        // Check if similar item exists (INSIDE setCart to use latest state)
        // Si lleva add-ons, nunca mergear (cada combinación es su propia fila con hijas).
        const existingIndex = hasModifiers ? -1 : prev.findIndex(item =>
          item.id === product.id &&
          !item.parentOrderItemId && // no mergear contra una línea hija
          JSON.stringify(item.removedIngredients || []) === JSON.stringify(removedIngredients || []) &&
          (item.cookingTerm || '') === (cookingTerm || '') &&
          (item.notes || '') === (notes || '') &&
          // Don't merge if item is already cooked (ready or served)
          item.status !== 'ready' &&
          item.status !== 'served'
        );

        if (existingIndex >= 0) {
          // Update existing item's quantity
          wasExistingItem = true;
          const newCart = [...prev];
          newCart[existingIndex] = {
            ...newCart[existingIndex],
            quantity: Math.round((newCart[existingIndex].quantity + quantity) * 100) / 100
          };
          return newCart;
        } else {
          // Add new item with unique temp ID (using random suffix to avoid collision)
          const newItem: CartItem = {
            ...product,
            quantity,
            removedIngredients,
            cookingTerm,
            notes,
            orderItemId: tempOrderItemId,
            ...(hasModifiers ? { addedModifiers } : {})
          };
          // Líneas hijas (add-ons) optimistas, ligadas al padre temporal.
          const children = hasModifiers ? buildModifierChildren(tempOrderItemId, quantity, addedModifiers!) : [];
          return [...prev, newItem, ...children];
        }
      });

      setIsOrderSent(false); // Reset sent status on modification

      // Sync with database in background
      localOperationCount.current++;
      try {
        const result = await addItemToOrder(activeTableId, {
          product_id: product.id.startsWith('promo_') ? null : (product.parent_product_id || product.id),
          promotion_id: product.id.startsWith('promo_') ? product.id.replace('promo_', '') : null,
          conversion_factor: product.conversion_factor || 1,
          name: product.name,
          price: product.price,
          quantity,
          notes: notes || null,
          cooking_term: cookingTerm || null,
          removed_ingredients: removedIngredients || [],
          addedModifiers: hasModifiers ? addedModifiers : undefined
        });

        if (result) {
          // Update cart with real data from DB (without full re-fetch to avoid flicker)
          setCart(prev => {
            if (result.action === 'updated') {
              // Item was merged in DB - update local quantity and ensure correct orderItemId
              return prev.map(item => {
                if (item.id === product.id &&
                  !item.parentOrderItemId &&
                  JSON.stringify(item.removedIngredients || []) === JSON.stringify(removedIngredients || []) &&
                  (item.cookingTerm || '') === (cookingTerm || '') &&
                  (item.notes || '') === (notes || '')) {
                  return { ...item, quantity: result.newQuantity, orderItemId: result.orderItemId };
                }
                return item;
              });
            } else {
              // New item created - replace temp IDs (parent + children) with real IDs.
              const childIds: string[] = (result as any).childOrderItemIds || [];
              let childIdx = 0;
              return prev.map(item => {
                if (item.orderItemId === tempOrderItemId) {
                  return { ...item, orderItemId: result.orderItemId };
                }
                if (item.parentOrderItemId === tempOrderItemId) {
                  const realChild = childIds[childIdx++];
                  return { ...item, parentOrderItemId: result.orderItemId, orderItemId: realChild || item.orderItemId };
                }
                return item;
              });
            }
          });
        }
      } catch (err) {
        console.error("Error adding to order:", err);
        // Revert on error
        setCart(previousCart);
        showToast("Error al agregar producto");
      } finally {
        // Release lock after a short delay to ensure Realtime event is processed
        setTimeout(() => { localOperationCount.current = Math.max(0, localOperationCount.current - 1); }, 800);
      }
    } else if (editingOrderId) {
      // EDITING MODE (Delivery/Takeaway) - Similar to Table Mode but using ID
      const isOrderReady = ['ready', 'served', 'completed', 'delivered'].includes((editingOrderStatus || '').toLowerCase());

      // FIX: Moved existingIndex logic inside setCart to avoid race condition with rapid clicks
      const previousCart = [...cart];
      const hasModifiers = !!(addedModifiers && addedModifiers.length > 0);
      const tempOrderItemId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      setCart(prev => {
        // Check if similar item exists (INSIDE setCart to use latest state)
        // Si lleva add-ons, nunca mergear.
        const existingIndex = hasModifiers ? -1 : prev.findIndex(item =>
          !isOrderReady && // FORCE SPLIT UI: If order is ready, never merge in UI
          item.id === product.id &&
          !item.parentOrderItemId &&
          JSON.stringify(item.removedIngredients || []) === JSON.stringify(removedIngredients || []) &&
          (item.cookingTerm || '') === (cookingTerm || '') &&
          (item.notes || '') === (notes || '') &&
          // Robust check - Don't merge if item is ready/served/delivered
          !['ready', 'served', 'delivered', 'completed'].includes((item.status || '').toLowerCase())
        );

        if (existingIndex >= 0) {
          // Update existing item's quantity
          const newCart = [...prev];
          newCart[existingIndex] = {
            ...newCart[existingIndex],
            quantity: Math.round((newCart[existingIndex].quantity + quantity) * 100) / 100
          };
          return newCart;
        } else {
          // Add new item with unique temp ID (using random suffix to avoid collision)
          const newItem: CartItem = {
            ...product,
            quantity,
            removedIngredients,
            cookingTerm,
            notes,
            orderItemId: tempOrderItemId,
            ...(hasModifiers ? { addedModifiers } : {})
          };
          const children = hasModifiers ? buildModifierChildren(tempOrderItemId, quantity, addedModifiers!) : [];
          return [...prev, newItem, ...children];
        }
      });

      // Sync with DB
      try {
        const result = await addItemToOrderById(editingOrderId, {
          product_id: product.id.startsWith('promo_') ? null : product.id,
          promotion_id: product.id.startsWith('promo_') ? product.id.replace('promo_', '') : null,
          name: product.name,
          price: product.price,
          quantity,
          notes: notes || null,
          cooking_term: cookingTerm || null,
          removed_ingredients: removedIngredients || [],
          addedModifiers: hasModifiers ? addedModifiers : undefined
        }, { forceSplit: isOrderReady });


        if (result) {
          // Update cart with real data
          setCart(prev => {
            if (result.action === 'updated') {
              return prev.map(item => {
                if (item.id === product.id &&
                  !item.parentOrderItemId &&
                  JSON.stringify(item.removedIngredients || []) === JSON.stringify(removedIngredients || []) &&
                  (item.cookingTerm || '') === (cookingTerm || '') &&
                  (item.notes || '') === (notes || '')) {
                  return { ...item, quantity: result.newQuantity, orderItemId: result.orderItemId };
                }
                return item;
              });
            } else {
              const childIds: string[] = (result as any).childOrderItemIds || [];
              let childIdx = 0;
              return prev.map(item => {
                if (item.orderItemId === tempOrderItemId) {
                  return { ...item, orderItemId: result.orderItemId };
                }
                if (item.parentOrderItemId === tempOrderItemId) {
                  const realChild = childIds[childIdx++];
                  return { ...item, parentOrderItemId: result.orderItemId, orderItemId: realChild || item.orderItemId };
                }
                return item;
              });
            }
          });
          // Check if we need to update order status or prompt
        }
      } catch (err) {
        console.error("Error adding to edit order:", err);
        setCart(previousCart);
        showToast("Error al agregar producto");
      }
    } else {
      // Local Mode (Quick Order / Delivery) - Standard merging logic
      const localOrderItemId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const hasModifiers = !!(addedModifiers && addedModifiers.length > 0);

      setCart(prev => {
        const newItem: CartItem = {
          ...product,
          quantity,
          removedIngredients,
          cookingTerm,
          notes,
          orderItemId: localOrderItemId,
          ...(hasModifiers ? { addedModifiers } : {}),
          ...(discount ? { discount } : {}),
          ...(discountPercent ? { discountPercent } : {})
        };

        // Si lleva add-ons o descuento, nunca mergear: cada combinación es su propia fila con líneas hijas/descuento propio.
        const existingIndex = (hasModifiers || discount || discountPercent) ? -1 : prev.findIndex(item =>
          item.id === product.id &&
          !item.parentOrderItemId &&
          JSON.stringify(item.removedIngredients || []) === JSON.stringify(removedIngredients || []) &&
          (item.cookingTerm || '') === (cookingTerm || '') &&
          (item.notes || '') === (notes || '') &&
          !['ready', 'served', 'delivered', 'completed'].includes((item.status || '').toLowerCase())
        );

        if (existingIndex >= 0) {
          const newCart = [...prev];
          newCart[existingIndex] = {
            ...newCart[existingIndex],
            quantity: Math.round((newCart[existingIndex].quantity + quantity) * 100) / 100
          };
          return newCart;
        }

        // Construir las líneas add-on (hijas) ligadas a este padre local.
        const children = hasModifiers ? buildModifierChildren(localOrderItemId, quantity, addedModifiers!) : [];
        return [...prev, newItem, ...children];
      });
    }
    setSelectedProduct(null);
  }, [activeTableId, editingOrderId, editingOrderStatus, cart, itemToSplit, addItemToOrder, addItemToOrderById, removeOrderItem, removeOrderItemById, showToast, buildModifierChildren]);

  // ⚡ Memoized: evita recrear la función en cada render
  const handleQuickAdd = useCallback((product: Product) => {
    logger.log('[handleQuickAdd] Action Triggered for:', product.name);
    // Las etiquetas (customizableOptions) deben seleccionarse explícitamente en el modal,
    // no asignarse automáticamente al hacer clic rápido
    handleAddToOrder(product, 1, [], '', '');
  }, [handleAddToOrder]);

  // Quick add that ALWAYS creates a new individual row (never merges)
  // Used from catalog card "+" buttons to allow individual modifiers per item
  const handleQuickAddIndividual = useCallback(async (product: Product) => {
    logger.log('[handleQuickAddIndividual] Creating individual row for:', product.name);

    if (activeTableId) {
      // OFFLINE: sin conexión delegamos en handleAddToOrder que gestiona el snapshot local.
      if (!isOnline) {
        await handleAddToOrder(product, 1, [], '', '');
        setSelectedProduct(null);
        return;
      }

      // DB Mode - Force new row (skip merge logic)
      const tempOrderItemId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newItem: CartItem = {
        ...product,
        quantity: 1,
        removedIngredients: [],
        cookingTerm: '',
        notes: '',
        orderItemId: tempOrderItemId
      };
      const previousCart = [...cart];
      setCart(prev => [...prev, newItem]);
      setIsOrderSent(false);

      localOperationCount.current++;
      try {
        const result = await addItemToOrder(activeTableId, {
          product_id: product.id.startsWith('promo_') ? null : ((product as any).parent_product_id || product.id),
          promotion_id: product.id.startsWith('promo_') ? product.id.replace('promo_', '') : null,
          name: product.name,
          price: product.price,
          quantity: 1,
          notes: null,
          cooking_term: null,
          removed_ingredients: []
        }, { forceSplit: true });

        if (result?.orderItemId) {
          setCart(prev => prev.map(item =>
            item.orderItemId === tempOrderItemId
              ? { ...item, orderItemId: result.orderItemId }
              : item
          ));
        }
      } catch (err) {
        console.error("Error adding individual item:", err);
        setCart(previousCart);
        showToast("Error al agregar producto");
      } finally {
        setTimeout(() => { localOperationCount.current = Math.max(0, localOperationCount.current - 1); }, 800);
      }
    } else if (editingOrderId) {
      // Editing mode - use forceSplit to prevent merge
      const tempOrderItemId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newItem: CartItem = {
        ...product,
        quantity: 1,
        removedIngredients: [],
        cookingTerm: '',
        notes: '',
        orderItemId: tempOrderItemId
      };
      const previousCart = [...cart];
      setCart(prev => [...prev, newItem]);

      try {
        const result = await addItemToOrderById(editingOrderId, {
          product_id: product.id.startsWith('promo_') ? null : product.id,
          promotion_id: product.id.startsWith('promo_') ? product.id.replace('promo_', '') : null,
          name: product.name,
          price: product.price,
          quantity: 1,
          notes: null,
          cooking_term: null,
          removed_ingredients: []
        }, { forceSplit: true });

        if (result) {
          setCart(prev => prev.map(item =>
            item.orderItemId === tempOrderItemId
              ? { ...item, orderItemId: result.orderItemId }
              : item
          ));
        }
      } catch (err) {
        console.error("Error adding individual item:", err);
        setCart(previousCart);
        showToast("Error al agregar producto");
      }
    } else {
      // Local mode - always create new row
      const newItem: CartItem = {
        ...product,
        quantity: 1,
        removedIngredients: [],
        cookingTerm: '',
        notes: '',
        orderItemId: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      };
      setCart(prev => [...prev, newItem]);
    }
    setSelectedProduct(null);
  }, [activeTableId, editingOrderId, cart, addItemToOrder, addItemToOrderById, showToast, isOnline, handleAddToOrder]);

  const handleQuickAddWithQuantity = useCallback((product: Product, quantity: number, adjustedPrice?: number) => {
    const productToAdd = adjustedPrice
      ? { ...product, price: adjustedPrice, originalPrice: product.price } as any
      : product;
    handleAddToOrder(productToAdd, quantity, [], '', '');
  }, [handleAddToOrder]);

  // ⚡ Memoized: evita recrear la función en cada render
  const removeFromCart = useCallback(async (product: CartItem) => {
    const isTempOrLocalId = !product.orderItemId || 
      product.orderItemId.startsWith('temp-') || 
      product.orderItemId.startsWith('local-') || 
      product.orderItemId.startsWith('offline_');

    if (activeTableId && product.orderItemId && !isTempOrLocalId) {
      // OPTIMISTIC UPDATE: Remove parent and any children immediately
      const previousCart = [...cart];
      setCart(prev => prev.filter(item => 
        item.orderItemId !== product.orderItemId && 
        item.parentOrderItemId !== product.orderItemId
      ));

      // Sync with database in background
      localOperationCount.current++;
      try {
        await removeOrderItem(activeTableId, product.orderItemId);
      } catch (err) {
        console.error("[removeFromCart] Error removing item:", err);
        setCart(previousCart);
        showToast("Error al eliminar producto");
      } finally {
        setTimeout(() => { localOperationCount.current = Math.max(0, localOperationCount.current - 1); }, 800);
      }
    } else if (editingOrderId && product.orderItemId && !isTempOrLocalId) {
      // EDITING MODE
      const previousCart = [...cart];
      setCart(prev => prev.filter(item => 
        item.orderItemId !== product.orderItemId && 
        item.parentOrderItemId !== product.orderItemId
      ));

      try {
        await removeOrderItemById(product.orderItemId);
      } catch (err) {
        console.error("[removeFromCart] Error removing item:", err);
        setCart(previousCart);
        showToast("Error al eliminar producto");
      }
    } else {
      // Local mode or temp ID: remove optimistically by identity
      setCart(prev => {
        if (product.orderItemId) {
          return prev.filter(item => 
            item.orderItemId !== product.orderItemId && 
            item.parentOrderItemId !== product.orderItemId
          );
        }
        const index = prev.findIndex(item => 
          item.id === product.id && 
          item.cookingTerm === product.cookingTerm && 
          item.notes === product.notes &&
          JSON.stringify(item.removedIngredients || []) === JSON.stringify(product.removedIngredients || [])
        );
        if (index === -1) return prev;
        const next = [...prev];
        next.splice(index, 1);
        return next;
      });
    }
  }, [activeTableId, editingOrderId, cart, removeOrderItem, removeOrderItemById, showToast]);

  const updateQuantity = async (product: CartItem, delta: number) => {
    const newQuantity = Math.round((product.quantity + delta) * 100) / 100;
    const isTempOrLocalId = !product.orderItemId || 
      product.orderItemId.startsWith('temp-') || 
      product.orderItemId.startsWith('local-') || 
      product.orderItemId.startsWith('offline_');

    if (activeTableId && product.orderItemId && !isTempOrLocalId) {
      // OPTIMISTIC UPDATE: Update UI immediately
      const previousCart = [...cart];

      if (newQuantity <= 0) {
        // Remove item and children optimistically
        setCart(prev => prev.filter(item => 
          item.orderItemId !== product.orderItemId && 
          item.parentOrderItemId !== product.orderItemId
        ));
      } else {
        // Update quantity optimistically
        setCart(prev => prev.map(item =>
          item.orderItemId === product.orderItemId
            ? { ...item, quantity: newQuantity }
            : item
        ));
      }

      // Sync with database in background (no re-fetch needed to avoid flicker)
      localOperationCount.current++;
      try {
        await updateOrderItemQuantity(activeTableId, product.orderItemId, newQuantity);
        // Success - optimistic update already reflects the change
      } catch (err) {
        console.error("Error updating quantity:", err);
        // Revert on error
        setCart(previousCart);
        showToast("Error al actualizar cantidad");
      } finally {
        setTimeout(() => { localOperationCount.current = Math.max(0, localOperationCount.current - 1); }, 800);
      }
    } else if (editingOrderId && product.orderItemId && !isTempOrLocalId) {
      // EDITING MODE
      const previousCart = [...cart];

      if (newQuantity <= 0) {
        setCart(prev => prev.filter(item => 
          item.orderItemId !== product.orderItemId && 
          item.parentOrderItemId !== product.orderItemId
        ));
        try {
          await removeOrderItemById(product.orderItemId);
        } catch (err) {
          console.error("Error removing item:", err);
          setCart(previousCart);
          showToast("Error al eliminar producto");
        }
      } else if (delta > 0 && product.status === 'ready') {
        // FIX: Si el item está ready y se suma cantidad, crear NUEVA fila en vez de actualizar
        try {
          // Agregar como nuevo item (se creará nueva fila en BD)
          await handleAddToOrder(
            {
              id: product.id,
              name: product.name,
              price: product.price,
              image: product.image,
              category: product.category,
              description: product.description,
              hasCustomization: product.hasCustomization
            } as Product,
            delta,  // Solo la cantidad adicional
            product.removedIngredients || [],
            product.cookingTerm || '',
            product.notes || ''
          );
          showToast("Cantidad agregada en nueva línea");
        } catch (err) {
          console.error("Error adding additional quantity:", err);
          setCart(previousCart);
          showToast("Error al agregar cantidad");
        }
      } else {
        // Normal update (item no está ready O se está restando cantidad)
        setCart(prev => prev.map(item =>
          item.orderItemId === product.orderItemId
            ? { ...item, quantity: newQuantity }
            : item
        ));
        try {
          await updateOrderItemQuantityById(product.orderItemId, newQuantity);
        } catch (err) {
          console.error("Error updating quantity:", err);
          setCart(previousCart);
          showToast("Error al actualizar cantidad");
        }
      }
    } else {
      // Local mode or temp item
      if (newQuantity <= 0) {
        setCart(prev => {
          if (product.orderItemId) {
            return prev.filter(item => 
              item.orderItemId !== product.orderItemId && 
              item.parentOrderItemId !== product.orderItemId
            );
          }
          const index = prev.findIndex(item => item.id === product.id);
          if (index === -1) return prev;
          const next = [...prev];
          next.splice(index, 1);
          return next;
        });
      } else {
        setCart(prev => prev.map(item => {
          if (product.orderItemId && item.orderItemId === product.orderItemId) {
            return { ...item, quantity: newQuantity };
          }
          if (!product.orderItemId && item === product) {
            return { ...item, quantity: newQuantity };
          }
          return item;
        }));
      }
    }
  };

  const updateCartItem = (product: CartItem, updates: Partial<CartItem>) => {
    setCart(prev => prev.map(item => {
      if (item.orderItemId && product.orderItemId) {
        return item.orderItemId === product.orderItemId ? { ...item, ...updates } : item;
      }
      const isSame = item.id === product.id &&
        item.cookingTerm === product.cookingTerm &&
        JSON.stringify(item.removedIngredients) === JSON.stringify(product.removedIngredients) &&
        item.notes === product.notes;

      return isSame ? { ...item, ...updates } : item;
    }));
  };

  const handleProcessPayment = async (details: TransactionDetails) => {
    if (isProcessingPayment) return;

    // Cobro de mesa offline por el Usuario Eje (Req 4.2, 12.x): se permite
    // aunque `canFinalizeSale` sea falso. Online se aplica el permiso normal
    // (Req 4.3). Se evalúa antes del guard de permiso para poder relajarlo.
    const esCobroMesaOfflineEje = !isOnline && soyEje && !!activeTableId && !deliveryMode;

    // Seguridad: bloquear finalización de venta si el usuario no tiene permiso pos_sell.
    if (!canFinalizeSale() && !esCobroMesaOfflineEje) {
      appToast.showToast('No tienes permiso para finalizar ventas', 'error');
      return;
    }

    // 🔒 Turno obligatorio: no se puede finalizar una venta sin turno de caja
    // abierto. Red de seguridad para rutas que no pasan por el overlay de venta
    // (ej. fotolistas → PAYMENT directo).
    if (!isShiftOpen) {
      appToast.showToast('Debes abrir un turno de caja antes de vender', 'warning');
      setIsCashRegisterOpen(true);
      return;
    }

    setIsProcessingPayment(true);

    // Map payment method from UI to database format
    const paymentMethodMap: Record<string, string> = {
      'Efectivo': 'cash',
      'Tarjeta': 'card',
      'Nequi': 'nequi',
      'Daviplata': 'daviplata',
      'Transferencia': 'transfer',
      'Crédito Local': 'credit',
      'Otro': 'other',
    };

    // Detección temprana: si no hay internet (basado en ping real), ir directo a cola offline sin tocar Supabase.
    // Incluye el cobro de mesas cuando el usuario es Eje offline (Req 12.3): se
    // elimina el guard que excluía las mesas (`!activeTableId`) del flujo offline.
    const isTableSale = !!activeTableId;
    const tableIdForSale = activeTableId;
    const puedeCobrarOffline = !isOnline && !deliveryMode && (!isTableSale || soyEje);
    if (puedeCobrarOffline && profile?.business_id && profile?.id) {
      try {
        const activeCount = (() => { try { return parseInt(localStorage.getItem('bistro_active_employees_count') || '1', 10); } catch { return 1; } })();
        const localOrderNum = (() => { try { const n = parseInt(localStorage.getItem('bistro_last_order_number') || '0', 10); const next = n + 1; localStorage.setItem('bistro_last_order_number', next.toString()); return next; } catch { return 1; } })();
        const displayNumber = activeCount > 1 && profile.offline_prefix
          ? `${localOrderNum}-${profile.offline_prefix}`
          : localOrderNum > 0 ? String(localOrderNum) : undefined;

        const orderData = {
          // Mesa → 'dine_in' con su table_id (posible offline_table_*); orden rápida → 'takeaway'.
          order_type: (isTableSale ? 'dine_in' : 'takeaway') as 'dine_in' | 'takeaway',
          table_id: isTableSale ? tableIdForSale : undefined,
          payment_method: (paymentMethodMap[details.method] || details.method) as any,
          customer_name: details.customer || 'Consumidor Final',
          client_id: details.client_id,
          client_id_number: details.client_id_number,
          skip_kitchen: true,
          display_number: displayNumber,
          items: cart.map(item => ({
            product_id: item.id.toString().startsWith('promo_') ? null : item.id.toString(),
            promotion_id: item.id.toString().startsWith('promo_') ? item.id.toString().replace('promo_', '') : null,
            product_name: item.name,
            quantity: item.quantity,
            unit_price: item.originalPrice || item.price,
            discount: item.discount || 0,
            discount_percent: item.discountPercent || 0,
            notes: item.notes,
            cooking_term: item.cookingTerm,
            removed_ingredients: item.removedIngredients,
          })),
          discount: details.userDiscount ?? 0,
          discount_type: 'fixed' as const,
          amount_paid: details.type === 'credit' ? 0 : details.amount + (details.change || 0),
          split_payments: details.splitPayments || undefined,
        };

        await offlineQueue.add('sale', orderData, profile.business_id, profile.id);
        await refreshPending();

        // Reflejar en caja offline (solo si no es crédito)
        if (details.type !== 'credit') {
          if (details.splitPayments && details.splitPayments.length > 0) {
            details.splitPayments.forEach(sp => {
              pushOfflineCashMovement(profile.business_id, {
                created_by: profile.id,
                type: 'sale',
                amount: sp.amount,
                description: `Venta #${orderData.display_number || ''} (${sp.method})`,
                payment_method: (paymentMethodMap[sp.method] || sp.method || 'cash').toLowerCase(),
              });
            });
          } else {
            pushOfflineCashMovement(profile.business_id, {
              created_by: profile.id,
              type: 'sale',
              amount: details.amount,
              description: `Venta #${orderData.display_number || ''}`,
              payment_method: (paymentMethodMap[details.method] || details.method || 'cash').toLowerCase(),
            });
          }
        }

        setLastTransaction(details);
        const receiptItems: ReceiptItem[] = cart.map(item => {
          const itemDiscount = item.discountPercent
            ? item.price * item.quantity * (item.discountPercent / 100)
            : (item.discount || 0);
          return {
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.originalPrice || item.price,
            originalUnitPrice: undefined,
            discount: item.discount,
            discountPercent: item.discountPercent,
            total: Math.round(item.price * item.quantity) - itemDiscount,
            unit: item.unit || item.sale_unit || 'Unidad',
            notes: item.notes,
            cookingTerm: item.cookingTerm,
            removedIngredients: item.removedIngredients,
            isModifier: !!item.parentOrderItemId,
            modifiers: cart.filter(c => c.parentOrderItemId === item.orderItemId).map(c => c.name),
          };
        });

        const rawSubtotal = cart.reduce((acc, item) => acc + Math.round((item.originalPrice || item.price) * item.quantity), 0);
        const itemsNetTotal = receiptItems.reduce((acc, item) => acc + item.total, 0);
        const globalDiscount = details.userDiscount || 0;
        const totalDiscount = (rawSubtotal - itemsNetTotal) + globalDiscount;
        const unroundedTotal = Math.max(0, itemsNetTotal - globalDiscount);
        const roundingAdjustment = details.amount - unroundedTotal;
        setReceiptData({
          businessName: receiptBusinessName || businessName || 'Mi Negocio',
          businessPhone: receiptPhone || businessPhone || undefined,
          businessAddress: receiptAddress || businessAddress || undefined,
          businessNit: businessNit || undefined,
          items: receiptItems,
          subtotal: rawSubtotal,
          totalDiscount: totalDiscount > 0 ? totalDiscount : 0,
          roundingAdjustment: roundingAdjustment !== 0 ? roundingAdjustment : undefined,
          total: details.amount,
          paymentMethod: details.method,
          amountPaid: details.type === 'cash' ? details.amount + (details.change || 0) : undefined,
          change: details.change,
          customerName: details.customer,
          customerDocument: details.client_id_number,
          customerPhone: details.customerPhone,
          date: details.date,
          sellerName: profile?.full_name || undefined,
          orderNumber: localOrderNum > 0 ? localOrderNum : undefined,
          displayNumber,
        });

        setCart([]);
        // Cobro de mesa offline (Req 12.4): liberar la mesa localmente en
        // Cache_Mesas_IDB (available, sin orden) y eliminar su snapshot de orden.
        if (isTableSale && tableIdForSale) {
          try {
            const cachedTables = await getCachedTables();
            const updatedTables = cachedTables.map((t: any) =>
              t.id === tableIdForSale ? { ...t, status: 'available', current_order_id: null } : t
            );
            await saveCachedTables(updatedTables);
            await deleteTableOrder(tableIdForSale);
            // Avisar a useTables que re-lea el cache y muestre la mesa como libre.
            window.dispatchEvent(new CustomEvent('offline-tables-updated'));
          } catch (err) {
            console.error('[handleProcessPayment] Error liberando mesa offline:', err);
          }
          orderLoadedForTableRef.current = null;
        }
        setActiveTable(undefined);
        setActiveTableId(undefined);
        setDeliveryClient(null);
        // Tras cobrar una mesa el contexto natural es Mesas. Además, así el gate
        // de persistencia no sobrescribe con vacío la caché de Orden Rápida.
        if (isTableSale) setSellTab('mesas');
        setCurrentScreen(Screen.SUCCESS);
        showToast(isTableSale
          ? 'Mesa cobrada offline ☁️ Se sincronizará cuando vuelva internet'
          : 'Venta guardada offline ☁️ Se sincronizará cuando vuelva internet');
      } finally {
        setIsProcessingPayment(false);
      }
      return;
    }

    try {
      // Determine order type
      let orderType: 'dine_in' | 'takeaway' | 'delivery' = 'takeaway'; // Default for quick sales
      if (deliveryMode) {
        orderType = 'delivery';
      } else if (activeTable) {
        orderType = 'dine_in';
      }
      // For quick orders (no activeTable, no delivery), orderType stays 'takeaway'

      // Skip kitchen for quick sales (no table, no delivery)
      const isQuickSale = !activeTable && !deliveryMode;
      const shouldSkipKitchen = isQuickSale || (!isKitchenEnabled && !activeTable && !deliveryMode);


      // Build order data for Supabase
      // ... logic skipped ...

      let createdOrderNumber: number | undefined;
      let createdOrderId: string | undefined;

      if (payingOrderId) {
        // Payment for existing order - just show success
        showToast('Pago registrado correctamente');
        setPayingOrderId(null);
      } else {
        // NEW ORDER
        const orderData: any = {
          order_type: orderType,
          payment_method: paymentMethodMap[details.method] || details.method,
          customer_name: details.customer || 'Consumidor Final',
          // Now we pass the real client_id from PaymentSidebar
          client_id: deliveryMode && deliveryClient ? deliveryClient.id : details.client_id,
          client_id_number: details.client_id_number,
          // Pass table_id for order tracking and to update table status
          table_id: details.table_id,
          // Skip kitchen for quick orders when kitchen is disabled
          skip_kitchen: shouldSkipKitchen,
          items: cart.map(item => {
            const rawId = item.id.toString();
            const isPromo = rawId.startsWith('promo_');
            const realProductId = isPromo ? null : (item.parent_product_id || rawId);
            return {
              product_id: realProductId,
              promotion_id: isPromo ? rawId.replace('promo_', '') : null,
              product_name: item.name,
              quantity: item.quantity,
              unit_price: item.originalPrice || item.price,
              conversion_factor: item.conversion_factor || 1,
              discount: item.discount || 0,
              discount_percent: item.discountPercent || 0,
              notes: item.notes,
              cooking_term: item.cookingTerm,
              removed_ingredients: item.removedIngredients,
            };
          }),
          discount: details.userDiscount ?? 0,
          discount_type: 'fixed',
          amount_paid: details.type === 'credit' ? 0 : details.amount + (details.change || 0),
          change_given: details.change || 0,
          initial_abono: details.creditAbono || 0,
          initial_abono_method: details.creditAbonoMethod || undefined,
          credit_note: details.note || undefined,
          credit_due_date: details.creditDueDate || undefined,
          split_payments: details.splitPayments || undefined,
        };

        // Add delivery info if this is a delivery order
        if (deliveryMode && deliveryClient) {
          orderData.customer_name = deliveryClient.name;
          orderData.deliveryInfo = {
            address: deliveryClient.address || '',
            phone: deliveryClient.phone || '',
            delivery_notes: details.address || ''
          };
        }

        // DEBUG: Log order data before creating
        logger.log('[handleProcessPayment] Creating order with:', {
          orderType,
          shouldSkipKitchen,
          isQuickSale,
          skip_kitchen: orderData.skip_kitchen
        });

        // [FIX] Marcar como actualización local ANTES de la llamada a la DB
        // Esto bloquea preventivamente cualquier actualización por WebSocket (Realtime)
        // de inventario que pueda llegar debido al proceso interno de Supabase 
        // antes de que resuelva el HTTP previniendo la doble resta de inventario.
        isLocalStockUpdateRef.current = true;
        setTimeout(() => { isLocalStockUpdateRef.current = false; }, 3000);

        // Proteger la petición a Supabase con un timeout estricto de 6 segundos
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout_fallback')), 6000)
        );
        const createdOrder = await Promise.race([createOrder(orderData), timeoutPromise]) as any;

        createdOrderNumber = createdOrder?.order_number;
        createdOrderId = createdOrder?.id;
        logger.log('[handleProcessPayment] Order created:', createdOrder);
      }

      // Success - update local state
      setLastTransaction(details);

      // Build receipt data before clearing cart
      const receiptItems: ReceiptItem[] = cart.map(item => {
        const itemDiscount = item.discountPercent
          ? item.price * item.quantity * (item.discountPercent / 100)
          : (item.discount || 0);
        return {
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.originalPrice || item.price,
          originalUnitPrice: undefined,
          discount: item.discount,
          discountPercent: item.discountPercent,
          total: Math.round(item.price * item.quantity) - itemDiscount,
          unit: item.unit || item.sale_unit || 'Unidad',
          notes: item.notes,
          cookingTerm: item.cookingTerm,
          removedIngredients: item.removedIngredients,
          isModifier: !!item.parentOrderItemId,
          modifiers: cart.filter(c => c.parentOrderItemId === item.orderItemId).map(c => c.name)
        };
      });

      const rawSubtotal = cart.reduce((acc, item) => acc + Math.round((item.originalPrice || item.price) * item.quantity), 0);
      const itemsNetTotal = receiptItems.reduce((acc, item) => acc + item.total, 0);
      const globalDiscount = details.userDiscount || 0;
      const totalDiscount = (rawSubtotal - itemsNetTotal) + globalDiscount;
      const unroundedTotal = Math.max(0, itemsNetTotal - globalDiscount);
      const roundingAdjustment = details.amount - unroundedTotal;

      setReceiptData({
        businessName: receiptBusinessName || businessName || 'Mi Negocio',
        businessPhone: receiptPhone || businessPhone || undefined,
        businessAddress: receiptAddress || businessAddress || undefined,
        businessNit: businessNit || undefined,
        items: receiptItems,
        subtotal: rawSubtotal,
        totalDiscount: totalDiscount > 0 ? totalDiscount : 0,
        roundingAdjustment: roundingAdjustment !== 0 ? roundingAdjustment : undefined,
        total: details.amount,
        paymentMethod: details.method,
        amountPaid: details.type === 'cash' ? details.amount + (details.change || 0) : undefined,
        change: details.change,
        customerName: details.customer,
        customerDocument: details.client_id_number,
        customerPhone: details.customerPhone,
        date: details.date,
        sellerName: profile?.full_name || undefined,
        orderNumber: createdOrderNumber,
        orderId: createdOrderId,
        splitPayments: details.splitPayments,
        creditAbono: details.creditAbono,
        creditAbonoMethod: details.creditAbonoMethod,
      });

      setCart([]); // Clear cart after successful order

      // La actualización de stock local y bloqueo de tiempo ya fueron invocados antes de la creación.

      // Clear delivery mode
      if (deliveryMode) {
        setDeliveryMode(false);
        setDeliveryClient(null);
        setPayingOrderId(null);
        // For delivery, go back to delivery screen instead of success
        setCurrentScreen(Screen.SELL);
        showToast(payingOrderId ? 'Pago registrado' : 'Domicilio enviado a cocina');
        return;
      }

      if (payingOrderId) {
        // Should have returned above if delivery mode, but safe catch
        setPayingOrderId(null);
        setCurrentScreen(Screen.SELL);
        return;
      }

      // Clear pending order and reset table status if this was a table order
      if (details.table_id) {
        // Fetch active pending order (if any) to delete it, as createOrder created a new completed record
        const { data: table } = await supabase
          .from('tables')
          .select('current_order_id')
          .eq('id', details.table_id)
          .single();

        if (table?.current_order_id) {
          await supabase.from('orders').delete().eq('id', table.current_order_id);
        }

        // Reset table status
        await supabase
          .from('tables')
          .update({ status: 'available', current_order_id: null })
          .eq('id', details.table_id);
      }
      setCurrentScreen(Screen.SUCCESS);

      // Clear table context after successful sale to prevent
      // subsequent quick sales from inheriting 'dine_in' type
      // Tras cobrar una mesa, volver al contexto Mesas (evita también que el gate
      // de persistencia borre la caché de Orden Rápida al quedar el carrito vacío).
      if (details.table_id) setSellTab('mesas');
      setActiveTable(undefined);
      setActiveTableId(undefined);
      setDeliveryClient(null); // Clear client after successful sale

    } catch (error: any) {
      console.error('Error processing payment:', error);

      // Si no hay internet, guardar en cola offline (solo órdenes rápidas sin mesa)
      const isNetworkError = !isOnline || error.message?.includes('fetch') || error.message?.includes('network') || error.message?.includes('timeout') || error.code === 'PGRST301';
      const isQuickOrder = !activeTableId && !deliveryMode;

      if (isNetworkError && isQuickOrder && profile?.business_id && profile?.id) {
        // Construir displayNumber con sufijo de empleado solo si hay más de 1 activo
        const activeCount = (() => { try { return parseInt(localStorage.getItem('bistro_active_employees_count') || '1', 10); } catch { return 1; } })();
        const localOrderNum = (() => { try { const n = parseInt(localStorage.getItem('bistro_last_order_number') || '0', 10); const next = n + 1; localStorage.setItem('bistro_last_order_number', next.toString()); return next; } catch { return 1; } })();
        const displayNumber = activeCount > 1 && profile.offline_prefix
          ? `${localOrderNum}-${profile.offline_prefix}`
          : localOrderNum > 0 ? String(localOrderNum) : undefined;

        const orderData = {
          order_type: 'takeaway' as const,
          payment_method: (paymentMethodMap[details.method] || details.method) as any,
          customer_name: details.customer || 'Consumidor Final',
          client_id: details.client_id,
          client_id_number: details.client_id_number,
          skip_kitchen: true,
          display_number: displayNumber,
          items: cart.map(item => ({
            product_id: item.id.toString().startsWith('promo_') ? null : item.id.toString(),
            promotion_id: item.id.toString().startsWith('promo_') ? item.id.toString().replace('promo_', '') : null,
            product_name: item.name,
            quantity: item.quantity,
            unit_price: item.originalPrice || item.price,
            discount: item.discount || 0,
            discount_percent: item.discountPercent || 0,
            notes: item.notes,
            cooking_term: item.cookingTerm,
            removed_ingredients: item.removedIngredients,
          })),
          discount: details.userDiscount ?? 0,
          discount_type: 'fixed' as const,
          amount_paid: details.type === 'credit' ? 0 : details.amount + (details.change || 0),
          split_payments: details.splitPayments || undefined,
        };

        await offlineQueue.add('sale', orderData, profile.business_id, profile.id);
        await refreshPending();

        // Reflejar en caja offline (solo si no es crédito)
        if (details.type !== 'credit') {
          if (details.splitPayments && details.splitPayments.length > 0) {
            details.splitPayments.forEach(sp => {
              pushOfflineCashMovement(profile.business_id, {
                created_by: profile.id,
                type: 'sale',
                amount: sp.amount,
                description: `Venta #${orderData.display_number || ''} (${sp.method})`,
                payment_method: (paymentMethodMap[sp.method] || sp.method || 'cash').toLowerCase(),
              });
            });
          } else {
            pushOfflineCashMovement(profile.business_id, {
              created_by: profile.id,
              type: 'sale',
              amount: details.amount,
              description: `Venta #${orderData.display_number || ''}`,
              payment_method: (paymentMethodMap[details.method] || details.method || 'cash').toLowerCase(),
            });
          }
        }

        // Mostrar éxito igual que si se hubiera creado online
        setLastTransaction(details);
        const receiptItems: ReceiptItem[] = cart.map(item => {
          const itemDiscount = item.discountPercent
            ? item.price * item.quantity * (item.discountPercent / 100)
            : (item.discount || 0);
          return {
            name: item.name,
            quantity: item.quantity,
            unitPrice: item.originalPrice || item.price,
            originalUnitPrice: undefined,
            discount: item.discount,
            discountPercent: item.discountPercent,
            total: Math.round(item.price * item.quantity) - itemDiscount,
            unit: item.unit || item.sale_unit || 'Unidad',
            notes: item.notes,
            cookingTerm: item.cookingTerm,
            removedIngredients: item.removedIngredients,
            isModifier: !!item.parentOrderItemId,
            modifiers: cart.filter(c => c.parentOrderItemId === item.orderItemId).map(c => c.name),
          };
        });

        const rawSubtotal = cart.reduce((acc, item) => acc + Math.round((item.originalPrice || item.price) * item.quantity), 0);
        const itemsNetTotal = receiptItems.reduce((acc, item) => acc + item.total, 0);
        const globalDiscount = details.userDiscount || 0;
        const totalDiscount = (rawSubtotal - itemsNetTotal) + globalDiscount;
        const unroundedTotal = Math.max(0, itemsNetTotal - globalDiscount);
        const roundingAdjustment = details.amount - unroundedTotal;
        setReceiptData({
          businessName: receiptBusinessName || businessName || 'Mi Negocio',
          businessPhone: receiptPhone || businessPhone || undefined,
          businessAddress: receiptAddress || businessAddress || undefined,
          businessNit: businessNit || undefined,
          items: receiptItems,
          subtotal: rawSubtotal,
          totalDiscount: totalDiscount > 0 ? totalDiscount : 0,
          roundingAdjustment: roundingAdjustment !== 0 ? roundingAdjustment : undefined,
          total: details.amount,
          paymentMethod: details.method,
          amountPaid: details.type === 'cash' ? details.amount + (details.change || 0) : undefined,
          change: details.change,
          customerName: details.customer,
          customerDocument: details.client_id_number,
          customerPhone: details.customerPhone,
          date: details.date,
          sellerName: profile?.full_name || undefined,
          orderNumber: localOrderNum > 0 ? localOrderNum : undefined,
          displayNumber,
        });

        setCart([]);
        setActiveTable(undefined);
        setActiveTableId(undefined);
        setDeliveryClient(null);
        setCurrentScreen(Screen.SUCCESS);
        showToast('Venta guardada offline ☁️ Se sincronizará cuando vuelva internet');
      } else {
        showToast('Error al procesar la venta: ' + (error.message || 'Error desconocido'));
      }
    } finally {
      setIsProcessingPayment(false);
    }
  };


  const cartTotal = useMemo(() => {
    let grossSub = 0;
    let discTotal = 0;
    cart.forEach(item => {
      const itemTotal = Math.round(item.price * item.quantity);
      let itemDiscount = 0;
      if (item.discount) {
        itemDiscount = item.discount;
      } else if (item.discountPercent) {
        itemDiscount = (itemTotal * item.discountPercent) / 100;
      }
      grossSub += itemTotal;
      discTotal += itemDiscount;
    });
    return Math.round(Math.max(0, grossSub - discTotal) / 50) * 50;
  }, [cart]);

  const handleAddAnimation = (rect: DOMRect, image: string) => {
    const newItem: FlyingItem = {
      id: Date.now(),
      image,
      startRect: rect
    };
    setFlyingItems(prev => [...prev, newItem]);
  };

  const handleAnimationEnd = (id: number) => {
    setFlyingItems(prev => prev.filter(item => item.id !== id));
  };

  if (loading) return <AppLoader />;

  // Show authentication screens if user is not logged in
  // En modo offline, si hay perfil cacheado, no mostrar login
  if (!user && !profile) {
    // Handle auth screen navigation
    const authScreen =
      currentScreen === Screen.REGISTER ? <RegisterScreen onNavigate={handleNavigate} />
      : currentScreen === Screen.FORGOT_PASSWORD ? <ForgotPasswordScreen onNavigate={handleNavigate} />
      : <LoginScreen onNavigate={handleNavigate} />;

    // El detector de versión (useVersionCheck) vive dentro de
    // UpdateNotification. Compara /version.json contra __BUILD_ID__ para saber
    // si hay una versión nueva desplegada (ya no depende de useRegisterSW del
    // Service Worker). Montarlo también aquí garantiza que las pantallas
    // previas al login (login/register/forgot) apliquen la versión nueva en
    // modo silencioso. Sin sesión no hay cola offline, por eso los contadores
    // van en 0.
    return (
      <>
        {authScreen}
        <UpdateNotification
          isOnline={isOnline}
          pendingCount={0}
          failedCount={0}
          isSyncing={false}
          silent
        />
      </>
    );
  }

  // User is authenticated but profile failed to load
  if ((user || !navigator.onLine) && !profile) {
    if (!showError) return <AppLoader />;

    // Only show error after all retries failed
    const handleRetry = () => {
      setRetryCount(0);
      setShowError(false);
      refreshProfile();
    };

    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#f6f8f7]">
        <div className="text-center max-w-md p-8 bg-white rounded-2xl border border-gray-200 shadow-lg">
          <div className="size-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="material-symbols-outlined text-emerald-500 text-3xl">warning</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Error al cargar perfil</h2>
          <p className="text-gray-500 text-sm mb-6">
            No se pudo cargar tu información de usuario después de varios intentos.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={handleRetry}
              className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
            >
              <span className="material-symbols-outlined text-lg">refresh</span>
              Reintentar
            </button>
            <button
              onClick={signOut}
              className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
            >
              <span className="material-symbols-outlined text-lg">logout</span>
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isCheckingSubscription = !!((user || profile) && profile && hasActiveSubscription === null);

  if (isCheckingSubscription) return <AppLoader />;

  if ((user || profile) && profile && hasActiveSubscription === false) {
    const isNewUser = !subscriptionEndDate;

    // Negocios con plan personalizado tienen pago propio desde la pantalla de bloqueo.
    // Admin ve CustomPlanBlockedScreen (con monto y botón Pagar); empleado sin
    // permiso admin_settings ve la pantalla neutra "contacta a soporte" (fallback).
    // Requerimientos: 6.1, 6.2, 6.3, 6.4, 7.4.
    if (hasCustomPlan && customPlan) {
      if (canPayCustom) {
        return (
          <CustomPlanBlockedScreen
            plan={customPlan}
            plans={customPlans}
            canPay={true}
            onPay={handlePayFromBlockedScreen}
            onLogout={signOut}
            isSubmitting={payingBlockedCustom}
          />
        );
      }
      // Empleado sin admin_settings: pantalla neutra actual "contacta a soporte".
      return (
        <div className="min-h-screen w-full bg-gradient-to-br from-gray-50 via-white to-emerald-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/20 flex items-center justify-center px-6">
          <div className="max-w-md w-full text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-5">
              <span className="material-symbols-outlined text-3xl text-amber-500">schedule</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Tu suscripción está vencida
            </h1>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-8">
              Comunícate con soporte para renovar tu plan y seguir usando BistroPOS.
            </p>
            <button
              onClick={signOut}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-200/80 dark:bg-slate-700/50 hover:bg-gray-300/80 dark:hover:bg-slate-600/50 text-gray-700 dark:text-slate-200 rounded-lg text-sm font-medium transition-all border border-gray-300/50 dark:border-slate-600/50"
            >
              <span className="material-symbols-outlined text-base">logout</span>
              Cerrar sesión
            </button>
          </div>
        </div>
      );
    }

    // Trial vencido: Si el usuario es empleado (sin permiso admin_settings),
    // ve la pantalla de aviso para que le pida renovar al administrador.
    // Si es administrador/dueño, ve la pantalla de selección de planes para pagar y reactivar.
    if (subscription?.status === 'trial' && !canPayCustom) {
      return <TrialExpiredScreen isAdmin={false} onLogout={signOut} isOnline={isOnline} />;
    }

    return (
      <div className="min-h-screen w-full bg-gradient-to-br from-gray-50 via-white to-emerald-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/20 flex flex-col">
        <div className={`${isNewUser ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'} border-b px-4 py-3`}>
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`material-symbols-outlined ${isNewUser ? 'text-emerald-500' : 'text-amber-500'} text-xl`}>
                {isNewUser ? 'waving_hand' : 'schedule'}
              </span>
              <p className={`${isNewUser ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'} text-sm font-medium`}>
                {isNewUser
                  ? '¡Bienvenido a BistroPOS! Elige un plan para comenzar.'
                  : 'Tu periodo de prueba de 7 días ha terminado. Elige tu plan para continuar facturando.'}
              </p>
            </div>
            {!isNewUser && (
              <button
                onClick={signOut}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-200/80 dark:bg-slate-700/50 hover:bg-gray-300/80 dark:hover:bg-slate-600/50 text-gray-600 dark:text-slate-300 hover:text-gray-800 dark:hover:text-white rounded-lg text-sm transition-all border border-gray-300/50 dark:border-slate-600/50"
              >
                <span className="material-symbols-outlined text-base">logout</span>
                <span className="hidden sm:inline">Cerrar sesión</span>
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <Suspense fallback={<LoadingFallback />}>
            <SubscriptionPlansScreen onNavigate={handleNavigate} />
          </Suspense>
        </div>
      </div>
    );
  }


  // Redirect to SELL if authenticated but still on an auth screen
  const isOnAuthScreen = currentScreen === Screen.LOGIN || currentScreen === Screen.REGISTER || currentScreen === Screen.FORGOT_PASSWORD;
  if (isOnAuthScreen) {
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname);
    }
    // Si acaba de registrarse, ir a SUBSCRIPTION_PLANS para mostrar bienvenida
    const justRegistered = localStorage.getItem('just_registered');
    if (justRegistered) {
      setTimeout(() => setCurrentScreen(Screen.SUBSCRIPTION_PLANS), 0);
    } else {
      setTimeout(() => setCurrentScreen(Screen.SELL), 0);
    }
  }

  const isProfileIncomplete = profile?.role === 'Administrador' &&
    profile?.business_name && profile.business_name.endsWith("'s Business");

  if (isProfileIncomplete && currentScreen !== Screen.PROFILE) {
    setTimeout(() => setCurrentScreen(Screen.PROFILE), 0);
  }


  const handleSellScreenTabSwitch = (tab: SellTab) => {
    setSellTab(tab);

    // Persistir tab seleccionada (solo en desktop)
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      try {
        localStorage.setItem('bistro_sell_tab', tab);
      } catch (e) {
        console.warn('Error saving sell tab to localStorage:', e);
      }
    }

    if (tab === 'orden_rapida') {
      const restored = readQuickOrderCart();
      setActiveTable(undefined);
      setActiveTableId(undefined);
      // Se abandona el contexto de mesa: al volver a una mesa debe re-hidratar su
      // orden (no reusar el carrito de Orden Rápida por la idempotencia).
      orderLoadedForTableRef.current = null;
      // Restaurar el carrito de Orden Rápida guardado (no se pierde al alternar
      // con mesas). La orden de cada mesa se conserva aparte (BD / snapshot).
      setCart(restored);
      setDeliveryClient(readQuickOrderClient());
      setSaleOrigin('orders');
    } else if (tab === 'mesas') {
      setActiveTable(undefined);
      setActiveTableId(undefined);
      orderLoadedForTableRef.current = null;
      // Vaciar la vista; bistro_cart NO se toca (gate por sellTab='mesas'), así
      // el carrito de Orden Rápida sigue disponible al volver.
      setCart([]);
      setDeliveryClient(null);
      setSaleOrigin('tables');
    }
  };

  const handlePhotoOrderAdd = async (items: { product: Product; quantity: number; discount?: number; discountPercent?: number }[]) => {
    setCart([]);
    for (const { product, quantity, discount, discountPercent } of items) {
      await handleAddToOrder(product, quantity, [], '', '', undefined, discount, discountPercent);
    }
    setActiveTable(undefined);
    setActiveTableId(undefined);
    setSaleOrigin('scanner');
    setSellTab('orden_rapida');
    sessionStorage.setItem('bistro_payment_skip_summary', 'true');

    // Verificar turno abierto antes de navegar al pago
    if (!isShiftOpen) {
      pendingPhotoOrderNavRef.current = true;
      if (canOpenShift()) {
        appToast.showToast('Primero abre un turno de caja', 'warning');
        setIsCashRegisterOpen(true);
      } else {
        appToast.showToast('No hay turno abierto. Pídele a un administrador que lo abra.', 'warning');
        pendingPhotoOrderNavRef.current = false;
      }
      return;
    }

    if (window.location.pathname === '/foto-venta') {
      window.history.replaceState(null, '', '/');
      document.title = 'Bistro POS';
      const mLink = document.getElementById('pwa-manifest') || document.querySelector('link[rel="manifest"]');
      if (mLink) mLink.setAttribute('href', '/manifest.json');
    }

    const isMobileOrTablet = window.innerWidth < 1024;
    setCurrentScreen(isMobileOrTablet ? Screen.PAYMENT : Screen.SELL);
  };

  // User is authenticated - show main app
  return (
    <>
      {/* Loader inicial: cubre todo hasta que el catálogo esté listo, evitando ver
          cómo se arma el Sidebar/categorías. Sidebar + contenido se revelan juntos. */}
      {!appReady && <AppLoader />}

    <div className={`flex h-screen w-full bg-background-light dark:bg-background-dark text-text-main overflow-hidden relative transition-opacity duration-300 ease-out ${appReady ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>

      <DataPrefetcher />

      <UpdateNotification
        isOnline={isOnline}
        pendingCount={pendingCount}
        failedCount={failedCount}
        isSyncing={isSyncing}
      />

      <Sidebar
        currentScreen={currentScreen}
        onNavigate={handleNavigate}
        isOpen={isSidebarOpen}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
        canCollapse={!isEanMode}
        isMobileOpen={isMobileMenuOpen}
        onMobileClose={() => setIsMobileMenuOpen(false)}
        onMobileOpen={() => setIsMobileMenuOpen(true)}
        ragChatActive={ragChatHasConversation}
        ragUnreadCount={ragUnreadCount}
        ragChatWidgetVisible={ragChatMounted && ragChatOpen && !ragChatMinimized}
        onCloseRagChatWidget={() => { setRagChatOpen(false); setRagChatMinimized(false); }}
      />

      {/* Sidebar Toggle Button (Visible when sidebar is closed) */}
      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          style={isSubscriptionInGrace ? { top: 'calc(var(--grace-banner-h, 0px) + 12px)' } : undefined}
          className={`hidden md:flex absolute left-4 z-30 p-2 bg-surface-light dark:bg-surface-dark border border-gray-200 dark:border-gray-700 rounded-xl shadow-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-all text-text-secondary animate-[fadeIn_0.3s_ease-out] ${isSubscriptionInGrace ? '' : 'top-4'}`}
          title="Mostrar menú"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
      )}

      {/* Main Content Wrapper */}
      <div
        style={graceOffsetStyle}
        className={`flex-1 flex flex-col overflow-hidden ${isSidebarOpen ? (isSidebarCollapsed ? 'md:ml-16' : 'md:ml-64') : ''} pb-[calc(76px+max(12px,env(safe-area-inset-bottom,0px)))] md:pb-0 transition-[margin,padding] duration-300 ease-out ${!isOnline ? 'pt-9 md:pt-0' : ''}`}
      >
        {(
          <>
            {/* GlobalSellTabs visible en desktop para pantallas de venta (excepto SELL que tiene sus propios tabs) */}
            {(currentScreen === Screen.TABLES || currentScreen === Screen.MENU || currentScreen === Screen.QUICK_ORDER) && (
              <GlobalSellTabs
                activeTab={currentScreen === Screen.TABLES ? 'mesas' : (currentScreen === Screen.QUICK_ORDER ? 'orden_rapida' : (activeTableId ? 'mesa_activa' : 'mesas'))}
                onTabClick={(tab) => {
                  if (tab === 'mesas') {
                    handleNavigate(Screen.TABLES);
                    setSellTab('mesas');
                  } else if (tab === 'orden_rapida') {
                    handleNavigate(Screen.QUICK_ORDER);
                    handleSellScreenTabSwitch('orden_rapida');
                  }
                }}
              />
            )}
            {currentScreen === Screen.DASHBOARD && (
              <Suspense fallback={<ScreenLoader />}>
                <DashboardScreen isOnline={isOnline} />
              </Suspense>
            )}

            {/* DEPRECATED: Screen.TABLES standalone - Redirigir a Screen.SELL */}
            {currentScreen === Screen.TABLES && (() => {
              // Auto-redirect to SELL screen in mobile to ensure footer is present
              if (window.innerWidth < 768) {
                setTimeout(() => {
                  setSellTab('mesas');
                  setCurrentScreen(Screen.SELL);
                }, 0);
              }
              return (
                <TablesScreen
                  onNavigate={handleNavigate}
                  onTableSelect={handleTableSelect}
                  onToggleMenu={() => setIsMobileMenuOpen(true)}
                  loadingTableId={loadingTableId}
                />
              );
            })()}

            {/* [FIX] Keep SellScreen mounted (but hidden or blurred) during Payment/Success/Creation to prevent image reload/flicker */
              (currentScreen === Screen.SELL || currentScreen === Screen.PAYMENT || currentScreen === Screen.SUCCESS ||
                ([Screen.CREATE_PRODUCT_SIMPLE, Screen.CREATE_PRODUCT_PROCESSED, Screen.CREATE_PRODUCT_SERVICE, Screen.CREATE_PROMOTION].includes(currentScreen) && createOriginScreen === Screen.SELL)
              ) && (
                <div className={`flex-1 flex flex-col overflow-hidden h-full min-w-0 ${(currentScreen === Screen.SELL || ((currentScreen === Screen.PAYMENT || currentScreen === Screen.SUCCESS) && saleOrigin !== 'scanner') || ([Screen.CREATE_PRODUCT_SIMPLE, Screen.CREATE_PRODUCT_PROCESSED, Screen.CREATE_PRODUCT_SERVICE, Screen.CREATE_PROMOTION].includes(currentScreen) && createOriginScreen === Screen.SELL)) ? '' : 'hidden'}`}>
                  <SellScreen
                    onNavigate={handleNavigate}
                    onTableSelect={handleTableSelect}
                    loadingTableId={loadingTableId}
                    cart={cart}
                    addToCart={handleProductSelect}
                    onQuickAdd={handleQuickAdd}
                    onQuickAddIndividual={handleQuickAddIndividual}
                    onQuickAddWithQuantity={handleQuickAddWithQuantity}
                    onEditProduct={handleEditProduct}
                    removeFromCart={removeFromCart}
                    updateQuantity={updateQuantity}
                    onProcessPayment={handleProcessPayment}
                    onToggleMenu={() => setIsMobileMenuOpen(true)}
                    onSendCommanda={() => setShowSendCommanda(true)}
                    products={products}
                    productsLoading={productsLoading}
                    onAddAnimation={handleAddAnimation}
                    activeTable={activeTable}
                    activeTableId={activeTableId}
                    onSwitchTab={handleSellScreenTabSwitch}
                    activeTab={sellTab}
                    onAssignClient={() => setShowDeliveryClientModal(true)}
                    deliveryClientName={deliveryClient?.name}
                    updateCartItem={updateCartItem}
                    onClearCart={handleClearCart}
                    onPhotoOrderAdd={handlePhotoOrderAdd}
                    isEanMode={isEanMode}
                    currentAppScreen={currentScreen}
                    lastTransaction={lastTransaction}
                    receiptData={receiptData}
                    onStartNewSale={handleStartNewSale}
                    isOnline={isOnline}
                    pendingCount={pendingCount}
                    failedCount={failedCount}
                    lastSyncResult={lastSyncResult}
                    onClearFailed={clearFailed}
                    onContentReady={handleSellContentReady}
                    isSidebarCollapsed={isSidebarCollapsed}
                    isShiftOpen={isShiftOpen}
                    comandaLabelSelection={comandaLabelSelection}
                    onComandaLabelSelectionChange={setComandaLabelSelection}
                  />
                </div>
              )}

            {currentScreen === Screen.EMPLOYEES && (
              <Suspense fallback={<ScreenLoader />}>
                <EmployeesScreen onNavigate={handleNavigate} isOnline={isOnline} />
              </Suspense>
            )}

            {currentScreen === Screen.CLIENTS && (
              <Suspense fallback={<ScreenLoader />}>
                <ClientsScreen onNavigate={handleNavigate} isOnline={isOnline} />
              </Suspense>
            )}

            {(currentScreen === Screen.PRODUCTS ||
              currentScreen === Screen.EDIT_PROMOTION ||
              currentScreen === Screen.BULK_UPLOAD ||
              ([Screen.CREATE_PRODUCT_SIMPLE, Screen.CREATE_PRODUCT_PROCESSED, Screen.CREATE_PRODUCT_SERVICE, Screen.CREATE_PROMOTION].includes(currentScreen) && createOriginScreen === Screen.PRODUCTS)
            ) && (
                <div className="flex-1 flex flex-col h-full min-w-0">
                  <Suspense fallback={<ScreenLoader />}>
                    <ProductsScreen onNavigate={handleNavigate} onEditProduct={handleAdminEditProduct} onEditPromotion={(promo) => { setEditingPromotion(promo); handleNavigate(Screen.EDIT_PROMOTION); }} isOnline={isOnline} />
                  </Suspense>
                </div>
              )}

            {currentScreen === Screen.INVENTORY && (
              <Suspense fallback={<ScreenLoader />}>
                {canUsePhysicalInventory ? (
                  <InventoryScreen onNavigate={handleNavigate} isOnline={isOnline} />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-fadeIn bg-background-light dark:bg-background-dark">
                    <div className="max-w-md w-full p-8 rounded-3xl bg-white dark:bg-slate-900 border border-amber-300/60 dark:border-amber-500/40 shadow-xl flex flex-col items-center">
                      <div className="size-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 text-stone-900 flex items-center justify-center shadow-lg shadow-amber-500/20 mb-4">
                        <span className="material-symbols-outlined text-3xl font-bold">inventory</span>
                      </div>
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300/60 mb-2">
                        Función de Plan Pro
                      </span>
                      <h3 className="text-xl font-extrabold text-gray-900 dark:text-white mb-2">
                        Auditoría y Conteo Físico
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
                        Realiza auditorías de estantes, compara existencias físicas contra el sistema y ajusta descuadres automáticamente.
                      </p>
                      <button
                        onClick={() => handleNavigate(Screen.SUBSCRIPTION_PLANS)}
                        className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 text-stone-900 font-extrabold text-sm rounded-xl shadow-md transition-all"
                      >
                        Ver Planes y Actualizar
                      </button>
                      <button
                        onClick={() => handleNavigate(Screen.HOME)}
                        className="mt-3 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400"
                      >
                        Volver al inicio
                      </button>
                    </div>
                  </div>
                )}
              </Suspense>
            )}

            {currentScreen === Screen.DEBTS && (
              <Suspense fallback={<ScreenLoader />}>
                <DebtsScreen onNavigate={handleNavigate} isOnline={isOnline} />
              </Suspense>
            )}

            {currentScreen === Screen.HOME && (
              <HomeScreen onNavigate={handleNavigate} ragUnreadCount={ragUnreadCount} isShiftOpen={isShiftOpen} isCashPanelOpen={isCashRegisterOpen} isOnline={isOnline} />
            )}

            {currentScreen === Screen.SALES && (
              <Suspense fallback={<ScreenLoader />}>
                <SalesScreen onNavigate={handleNavigate} />
              </Suspense>
            )}

            {currentScreen === Screen.ACTIVITY && (
              <Suspense fallback={<ScreenLoader />}>
                <ActivityScreen onNavigate={handleNavigate} />
              </Suspense>
            )}



            {currentScreen === Screen.CREATE_PRODUCT_SIMPLE && (
              <Suspense fallback={null}>
                <SimpleProductScreen onNavigate={handleNavigate} productToEdit={adminEditingProduct} originScreen={createOriginScreen} isOnline={isOnline} />
              </Suspense>
            )}

            {currentScreen === Screen.CREATE_PRODUCT_PROCESSED && (
              <Suspense fallback={null}>
                <ProcessedProductScreen onNavigate={handleNavigate} productToEdit={adminEditingProduct} originScreen={createOriginScreen} isOnline={isOnline} />
              </Suspense>
            )}

            {currentScreen === Screen.CREATE_PRODUCT_SERVICE && (
              <Suspense fallback={null}>
                <ServiceProductScreen onNavigate={handleNavigate} productToEdit={adminEditingProduct} originScreen={createOriginScreen} isOnline={isOnline} />
              </Suspense>
            )}

            {currentScreen === Screen.CREATE_PROMOTION && (
              <Suspense fallback={null}>
                <CreatePromotionScreen onNavigate={handleNavigate} originScreen={createOriginScreen} isOnline={isOnline} />
              </Suspense>
            )}

            {currentScreen === Screen.EDIT_PROMOTION && editingPromotion && (
              <Suspense fallback={<LoadingFallback />}>
                <EditPromotionScreen onNavigate={handleNavigate} promotion={editingPromotion} />
              </Suspense>
            )}

            {currentScreen === Screen.BULK_UPLOAD && (
              <Suspense fallback={<LoadingFallback />}>
                <BulkUploadScreen onNavigate={handleNavigate} />
              </Suspense>
            )}

            {currentScreen === Screen.CREATE_FROM_INVOICE && (
              <Suspense fallback={<LoadingFallback />}>
                <InvoiceCreateScreen onNavigate={handleNavigate} isOnline={isOnline} />
              </Suspense>
            )}

            {currentScreen === Screen.PROFILE && (
              <Suspense fallback={<ScreenLoader />}>
                <ProfileScreen onNavigate={handleNavigate} />
              </Suspense>
            )}

            {currentScreen === Screen.SUBSCRIPTION_PLANS && (
              <Suspense fallback={<LoadingFallback />}>
                <SubscriptionPlansScreen onNavigate={handleNavigate} />
              </Suspense>
            )}

            {currentScreen === Screen.SUBSCRIPTION_MANAGEMENT && (
              <Suspense fallback={<ScreenLoader />}>
                <SubscriptionManagementScreen onNavigate={handleNavigate} />
              </Suspense>
            )}

            {(currentScreen === Screen.PHOTO_ORDER || (saleOrigin === 'scanner' && (currentScreen === Screen.PAYMENT || currentScreen === Screen.SUCCESS))) && (
              <Suspense fallback={<LoadingFallback message="Cargando Escáner..." />}>
                <div className={currentScreen === Screen.PHOTO_ORDER ? 'flex-1 h-full min-w-0 overflow-hidden flex flex-col' : 'hidden'}>
                  <PhotoOrderScreen
                    key={photoOrderKey}
                    products={products}
                    onAddItems={handlePhotoOrderAdd}
                    onClose={() => {
                      if (window.location.pathname === '/foto-venta') {
                        window.history.replaceState(null, '', '/');
                        document.title = 'Bistro POS';
                        const mLink = document.getElementById('pwa-manifest') || document.querySelector('link[rel="manifest"]');
                        if (mLink) mLink.setAttribute('href', '/manifest.json');
                      }
                      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
                      handleNavigate(isMobile ? Screen.HOME : Screen.SELL);
                    }}
                  />
                </div>
              </Suspense>
            )}

            {currentScreen === Screen.CONTINGENCY_DOC && (
              <Suspense fallback={<LoadingFallback message="Cargando Documentos..." />}>
                <ContingencyDocScreen onNavigate={handleNavigate} />
              </Suspense>
            )}

            {currentScreen === Screen.TRAINING && (
              <Suspense fallback={<ScreenLoader />}>
                <TrainingScreen onNavigate={handleNavigate} />
              </Suspense>
            )}

            {currentScreen === Screen.RAG_CHAT && (
              <Suspense fallback={<LoadingFallback message="Cargando Asistente IA..." />}>
                <RagChatScreen onNavigate={handleNavigate} isOnline={isOnline} />
              </Suspense>
            )}



            {(currentScreen === Screen.MENU || currentScreen === Screen.QUICK_ORDER) && (
              <div className="flex-1 h-full min-w-0 overflow-hidden flex">
                <MenuScreen
                  onNavigate={handleNavigate}
                  products={products}
                  productsLoading={productsLoading}
                  cart={cart}
                  addToCart={handleProductSelect}
                  onQuickAdd={handleQuickAdd}
                  onQuickAddIndividual={handleQuickAddIndividual}
                  onQuickAddWithQuantity={handleQuickAddWithQuantity}
                  onEditProduct={handleEditProduct}
                  onOpenSimpleNote={handleOpenSimpleNote}
                  removeFromCart={removeFromCart}
                  updateQuantity={updateQuantity}
                  updateCartItem={updateCartItem}
                  currentScreen={currentScreen}
                  activeTable={deliveryMode ? 'Domicilio' : activeTable}
                  activeTableId={activeTableId}
                  onProcessPayment={handleProcessPayment}
                  lastTransaction={lastTransaction}
                  onStartNewSale={handleStartNewSale}
                  onAddAnimation={handleAddAnimation}
                  onConfirmOrder={isKitchenEnabled ? handleConfirmOrder : undefined}
                  isDelivery={deliveryMode}
                  onAssignClient={() => setShowDeliveryClientModal(true)}
                  deliveryClientName={deliveryClient?.name}
                  isKitchenEnabled={isKitchenEnabled}
                  saleOrigin={saleOrigin}
                  isOrderSent={isOrderSent}
                  onSetOrderSent={setIsOrderSent}
                  expandedCartItemId={expandedCartItemId}
                  onExpandChange={setExpandedCartItemId}
                  receiptData={receiptData}
                  onClearCart={handleClearCart}
                  isEanMode={isEanMode}
                  comandaLabelSelection={comandaLabelSelection}
                  onComandaLabelSelectionChange={setComandaLabelSelection}
                />
              </div>
            )}

            {currentScreen === Screen.PAYMENT && (() => {
              logger.log('[App.tsx] Rendering PaymentScreen with deliveryClient:', deliveryClient?.name);
              // Misma lógica de backScreen que usa PaymentScreen internamente:
              // tocar el backdrop equivale a pulsar "Agregar" (vuelve al catálogo).
              // Solo tiene efecto en tablet (min-[431px]) donde el backdrop es
              // visible; en móvil pequeño el panel cubre toda la pantalla.
              const paymentBackScreen = saleOrigin === 'scanner'
                ? Screen.PHOTO_ORDER
                : saleOrigin !== 'tables'
                  ? Screen.SELL
                  : Screen.MENU;
              const isScannerFlow = saleOrigin === 'scanner';
              return (
                <div
                  className={`lg:hidden fixed inset-0 h-[100dvh] z-50 flex justify-end ${isScannerFlow ? 'bg-background-light dark:bg-background-dark' : 'bg-black/40 backdrop-blur-[3px] animate-[fadeIn_0.2s_ease-out]'}`}
                  onClick={() => handleNavigate(paymentBackScreen)}
                  role="button"
                  tabIndex={-1}
                  aria-label="Cerrar pago"
                >
                  <div
                    className={`h-full w-full relative ${isScannerFlow ? 'w-full' : 'min-[431px]:w-[90%] min-[431px]:max-w-[420px] shadow-2xl border-l border-gray-200 dark:border-gray-800'} bg-background-light dark:bg-background-dark animate-[slideInRight_0.3s_ease-out] flex flex-col`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isScannerFlow && typeof window !== 'undefined' && window.innerWidth <= 440 && <ScannerPaymentBackdrop />}
                    <PaymentScreen
                      onNavigate={handleNavigate}
                      onProcessPayment={handleProcessPayment}
                      removeFromCart={removeFromCart}
                      updateQuantity={updateQuantity}
                      updateCartItem={updateCartItem}
                      cart={cart}
                      total={cartTotal}
                      tableName={deliveryMode ? 'Domicilio' : (activeTable ? activeTable.replace(/^T-|^S-/, 'Mesa ') : 'Orden Rápida')}
                      tableId={activeTableId}
                      onConfirmOrder={handleConfirmOrder}
                      deliveryClientName={deliveryClient?.name}
                      isDelivery={deliveryMode}
                      onEditProduct={handleEditProduct}
                      isOrderSent={isOrderSent}
                      onSetOrderSent={setIsOrderSent}
                      saleOrigin={saleOrigin}
                      onClearCart={handleClearCart}
                      isCatalogMode={!isEanMode}
                      onSendCommanda={() => setShowSendCommanda(true)}
                      comandaLabelSelection={comandaLabelSelection}
                      onComandaLabelSelectionChange={setComandaLabelSelection}
                      onAssignClient={(client) => {
                        if (!client.id) {
                          setDeliveryClient(null);
                          return;
                        }
                        logger.log('[App.tsx] PaymentScreen assigned client:', client.name);
                        setDeliveryClient(client as Client);
                      }}
                    />
                  </div>
                </div>
              );
            })()}

            {currentScreen === Screen.SUCCESS && lastTransaction && (
              <div className={`lg:hidden fixed inset-0 z-50 flex flex-col md:absolute md:flex-row md:justify-end md:bg-black/50 md:backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]`}>
                <div className="w-full h-full md:w-[420px] md:shadow-2xl md:animate-[slideInRight_0.3s_ease-out] overflow-hidden bg-background-light dark:bg-background-dark md:border-l md:border-gray-200 md:dark:border-gray-800">
                  <SuccessScreen
                    onNavigate={handleNavigate}
                    onStartNewSale={handleStartNewSale}
                    transaction={lastTransaction}
                    saleOrigin={saleOrigin}
                    receiptData={receiptData}
                    isCatalogMode={!isEanMode}
                    preselectedComandaLabels={comandaLabelSelection}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div> {/* Cierre del Main Content Wrapper */}

      {/* Cash Register Right Sidebar */}
      {isCashRegisterOpen && (
        <div
          className="fixed inset-x-0 top-0 bottom-0 md:bottom-0 z-40 flex justify-end overflow-hidden animate-[fadeIn_0.2s_ease-out]"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
          role="button"
          tabIndex={-1}
          aria-label="Cerrar"
          onClick={handleCloseCashRegister}
          onKeyDown={(e) => e.key === 'Escape' && handleCloseCashRegister()}
        >
          <div
            className="h-full w-full min-[431px]:max-w-md bg-background-light dark:bg-background-dark min-[431px]:shadow-2xl min-[431px]:border-l border-gray-200 dark:border-gray-800 flex flex-col animate-[slideInUpSubtle_0.4s_cubic-bezier(0.16,1,0.3,1)] min-[431px]:animate-[slideInRight_0.3s_ease-out] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* El header ahora es manejado internamente por CashRegisterScreen */}
            <div className="flex-1 overflow-hidden flex flex-col pb-[calc(76px+max(12px,env(safe-area-inset-bottom,0px)))] md:pb-0">
              <Suspense fallback={<ScreenLoader />}>
                <CashRegisterScreen onNavigate={handleNavigate} onClose={handleCloseCashRegister} />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToOrder={handleAddToOrder}
        />
      )}

      {editingProduct && (
        <ProductEditModal
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSave={handleProductUpdate}
        />
      )}

      {simpleNoteProduct && (
        <SimpleNoteModal
          product={simpleNoteProduct}
          onClose={() => setSimpleNoteProduct(null)}
          onAddToOrder={handleAddWithSimpleNote}
        />
      )}

      {optionsProduct && (
        <ProductOptionsModal
          product={optionsProduct}
          onClose={() => {
            setOptionsProduct(null);
            setItemToSplit(null);
            // Devolver el foco al buscador del catálogo tras aplicar/cerrar el modificador,
            // sin borrar el texto de búsqueda.
            setTimeout(() => window.dispatchEvent(new Event('focus-menu-search')), 50);
          }}
          onAddToOrder={handleAddToOrder}
          onSaveConfig={handleProductUpdate}
          // Resolver las etiquetas frescas desde el estado vivo de productos (no del snapshot
          // del item de carrito), para que los cambios de carpetas/etiquetas se reflejen sin refrescar.
          categoryOptions={products.find(p => p.id === optionsProduct.id)?.customizableOptions ?? (optionsProduct.customizableOptions || [])}
          categoryName={optionsProduct.category || ''}
          allProducts={products}
        />
      )}

      <DeliveryClientModal
        isOpen={showDeliveryClientModal}
        onClose={() => setShowDeliveryClientModal(false)}
        onSelectClient={handleClientSelect}
        selectedClient={deliveryClient}
        onRemoveClient={() => {
          setDeliveryClient(null);
          setShowDeliveryClientModal(false);
          showToast('Cliente desasignado');
        }}
      />

      <FlyToCartLayer items={flyingItems} onAnimationEnd={handleAnimationEnd} />

      {showSendCommanda && (
        <SendCommandaModal
          isOpen
          onClose={() => setShowSendCommanda(false)}
          tableId={activeTableId}
          tableName={activeTable}
          items={cart}
          labelSelection={comandaLabelSelection}
          onSent={() => setComandaLabelSelection({})}
        />
      )}

      {currentScreen !== Screen.PAYMENT && (
        <OfflineIndicator
          isOnline={isOnline}
          pendingCount={pendingCount}
          failedCount={failedCount}
          isSyncing={isSyncing}
          lastSyncResult={lastSyncResult}
          onSync={syncAll}
          onClearFailed={clearFailed}
        />
      )}

      <GracePeriodBanner onNavigate={handleNavigate} />
      <Toast
        message={toast.message}
        visible={toast.visible}
      />
      <AppToast />
      <ConfirmDialog />
      {/* Overlay full-screen reservado para el estado de ERROR (necesita prominencia
          para que el usuario pueda reintentar). El spinner de carga se muestra inline
          en la mesa correspondiente vía loadingTableId. */}
      <TableOrderLoadingOverlay
        loading={false}
        error={tableOrderError}
        tableLabel={activeTable}
        onRetry={handleRetryTableOrder}
        onDismiss={() => setTableOrderError(false)}
      />
      <InventoryCriticalAlert />

      {/* Aviso operacional de multi-eje (Req 6): al abrir 2º turno o caer internet
          con 2+ turnos abiertos. Sin lock técnico (mejora futura declarada). */}
      <MultiEjeNoticeModal />

      {/* Aviso de recarga obligatoria tras la sincronización del Eje (Req 17).
          Solo se muestra a observadores viendo Mesas; el Eje nunca lo ve. */}
      <ForcedReloadModal
        soyEje={soyEje}
        isViewingTables={
          currentScreen === Screen.TABLES ||
          currentScreen === Screen.MENU ||
          currentScreen === Screen.PAYMENT ||
          currentScreen === Screen.SELL
        }
        isOnline={isOnline}
      />
      {/* Asistente IA: visible en dev y, en producción, solo para el negocio 10000. */}
      {canSeeAiAssistant(profile?.business_id) && ragChatMounted && (
        <RagChatWidget
          isOpen={ragChatOpen}
          isMinimized={ragChatMinimized}
          onClose={() => { setRagChatOpen(false); setRagChatMinimized(false); }}
          onToggleMinimize={() => setRagChatMinimized(m => !m)}
          onConversationChange={setRagChatHasConversation}
          isOnline={isOnline}
          currentScreen={currentScreen}
          onDevMessageWhileHidden={() => setRagUnreadCount(c => c + 1)}
          onWidgetVisible={() => setRagUnreadCount(0)}
          isSidebarOpen={isSidebarOpen}
          isSidebarCollapsed={isSidebarCollapsed}
        />
      )}
      {/* Mobile Nav Universal — oculto en HOME (tiene su propia nav), auth, pago y éxito */}
      {currentScreen !== Screen.HOME &&
        currentScreen !== Screen.PAYMENT &&
        currentScreen !== Screen.SUCCESS &&
        currentScreen !== Screen.LOGIN &&
        currentScreen !== Screen.REGISTER &&
        currentScreen !== Screen.FORGOT_PASSWORD && (
          <MobileNavBar
            currentScreen={currentScreen}
            onNavigate={handleNavigate}
            ragUnreadCount={ragUnreadCount}
            isShiftOpen={isShiftOpen}
            isCashPanelOpen={isCashRegisterOpen}
          />
        )}
    </div>
    </>
  );
}

// Overlay de carga inicial: cubre la app durante auth+profile+subscription y se
// desvanece suavemente al estar todo listo. Permanece montado durante el fade-out
// para que HomeScreen (o cualquier pantalla destino) aparezca debajo sin cortes.
const InitialLoaderOverlay: React.FC = () => {
  const { user, profile, loading, hasActiveSubscription } = useAuth();

  const isCheckingSubscription = !!((user || profile) && profile && hasActiveSubscription === null);
  const isLoadingPhase = loading
    || ((user || !navigator.onLine) && !profile)
    || isCheckingSubscription;

  const [shouldMount, setShouldMount] = useState(true);
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    if (isLoadingPhase) {
      setShouldMount(true);
      setFadingOut(false);
      return;
    }
    if (!fadingOut) {
      setFadingOut(true);
      const t = setTimeout(() => setShouldMount(false), 350);
      return () => clearTimeout(t);
    }
  }, [isLoadingPhase, fadingOut]);

  if (!shouldMount) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#f6f8f7] transition-opacity duration-300 ease-out ${fadingOut ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      aria-hidden={fadingOut}
    >
      <img
        src="/192px_fondoBlanco.png"
        alt="Bistro POS"
        className="size-16 mb-6 rounded-2xl shadow-sm"
      />
      <div className="relative size-8">
        <div className="absolute inset-0 rounded-full border-2 border-amber-200" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-amber-400 animate-spin" />
      </div>
    </div>
  );
};

// Main App component with AuthProvider wrapper
function App() {
  if (window.location.pathname.startsWith('/t/')) {
    return (
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="animate-spin rounded-full size-10 border-b-2 border-emerald-500" />
        </div>
      }>
        <PublicReceiptScreen />
      </Suspense>
    );
  }

  if (window.location.pathname.startsWith('/ch/')) {
    return (
      <Suspense fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="animate-spin rounded-full size-10 border-b-2 border-amber-400" />
        </div>
      }>
        <PublicClientHistoryScreen />
      </Suspense>
    );
  }

  return (
    <AuthProvider>
      <BusinessSettingsProvider>
        <ToastProvider>
          <ConfirmDialogProvider>
            <AppContent />
            <InitialLoaderOverlay />
          </ConfirmDialogProvider>
        </ToastProvider>
      </BusinessSettingsProvider>
    </AuthProvider>
  );
}

export default App;
