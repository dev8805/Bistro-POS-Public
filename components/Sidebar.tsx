
import React, { useState, useRef, useEffect, useMemo, useCallback, useReducer } from 'react';
import { Screen, UserRole } from '../types';
import { usePermissions } from '../hooks/usePermissions';
import { useAuth } from '../context/AuthContext';
import { prefetchScreen } from '../lib/prefetch';
import { SettingsSidebarPanel } from './SettingsSidebarPanel';
import { SalesModeSettingsPanel } from './SalesModeSettingsPanel';
import PrinterSettingsPanel from './PrinterSettingsPanel';
import { getRealEmail } from '../lib/formatters';
import { canSeeSubscriptionMenu, canSeeAiAssistant } from '../lib/specialBusinesses';
import { useGracePeriodStatus } from '../hooks/useGracePeriodStatus';
import { useCustomPlan } from '../hooks/useCustomPlan';
import { usePlanFeatures } from '../hooks/usePlanFeatures';
import { UpgradeProModal } from './modals/UpgradeProModal';

type TouchState = {
  touchStartX: number | null;
  touchStartY: number | null;
  translateX: number;
  isDragging: boolean;
  isClosing: boolean;
};

type TouchAction =
  | { type: 'START'; x: number; y: number }
  | { type: 'MOVE'; translateX: number }
  | { type: 'CLOSE_ANIMATE' }
  | { type: 'RESET' };

const touchInitial: TouchState = {
  touchStartX: null,
  touchStartY: null,
  translateX: 0,
  isDragging: false,
  isClosing: false,
};

function touchReducer(state: TouchState, action: TouchAction): TouchState {
  switch (action.type) {
    case 'START':
      return { ...state, touchStartX: action.x, touchStartY: action.y, isDragging: true };
    case 'MOVE':
      return { ...state, translateX: action.translateX };
    case 'CLOSE_ANIMATE':
      return { ...state, isDragging: false, translateX: -350, isClosing: true };
    case 'RESET':
      return touchInitial;
    default:
      return state;
  }
}

interface SidebarProps {
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
  isOpen: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  canCollapse?: boolean;
  tabletOverlay?: boolean;
  isMobileOpen: boolean;
  onMobileClose: () => void;
  onMobileOpen: () => void;
  ragChatActive?: boolean;
  ragUnreadCount?: number;
  ragChatWidgetVisible?: boolean;
  onCloseRagChatWidget?: () => void;
}


export const Sidebar: React.FC<SidebarProps> = ({ currentScreen, onNavigate, isOpen, isCollapsed = false, onToggleCollapse, canCollapse = false, tabletOverlay = false, isMobileOpen, onMobileClose, onMobileOpen, ragChatActive, ragUnreadCount = 0, ragChatWidgetVisible, onCloseRagChatWidget }) => {
  const { profile, user, signOut } = useAuth();
  const { canAccessScreen, hasPermission, isSuperAdmin, canFinalizeSale } = usePermissions();
  // La opción "Suscripciones" la ve solo admin (permiso admin_settings), y además:
  // - Siempre en el negocio de pruebas 10000 (legado).
  // - En cualquier otro negocio, solo si tiene un plan personalizado asignado.
  const { hasCustomPlan } = useCustomPlan();
  const canShowSubscription = canSeeSubscriptionMenu(
    profile?.business_id,
    hasCustomPlan,
    hasPermission('admin_settings'),
  );
  // Cuando la suscripción está en gracia, el GracePeriodBanner fijo arriba
  // reserva espacio con su altura real (variable CSS `--grace-banner-h`) para
  // no tapar el contenido del sidebar ni del drawer móvil.
  const { isInGrace } = useGracePeriodStatus();
  const graceOffsetStyle = isInGrace ? { paddingTop: 'var(--grace-banner-h, 0px)' } : undefined;
  const { canUsePhysicalInventory } = usePlanFeatures();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [isReceiptSettingsOpen, setIsReceiptSettingsOpen] = useState(false);
  const [isSalesModeSettingsOpen, setIsSalesModeSettingsOpen] = useState(false);
  const [isPrinterPanelOpen, setIsPrinterPanelOpen] = useState(false);
  const [showMobileSettings, setShowMobileSettings] = useState(false);
  const [isOperacionesOpen, setIsOperacionesOpen] = useState(true);
  const [isGestionOpen, setIsGestionOpen] = useState(true);
  const [isEquipoOpen, setIsEquipoOpen] = useState(true);

  // Los paneles de Ajustes (Facturación / Activar-Desactivar) comparten posición, z-index
  // y backdrop. Al abrir uno cerramos el otro para que nunca se superpongan.
  const openReceiptSettings = () => { setIsSalesModeSettingsOpen(false); setIsReceiptSettingsOpen(true); };
  const openSalesModeSettings = () => { setIsReceiptSettingsOpen(false); setIsSalesModeSettingsOpen(true); };




  const [activeMobilePanel, setActiveMobilePanel] = useState<'main' | 'settings' | 'profile'>('main');

  // Reset mobile panel when menu closes
  useEffect(() => {
    if (!isMobileOpen) {
      const timer = setTimeout(() => setActiveMobilePanel('main'), 300);
      return () => clearTimeout(timer);
    }
  }, [isMobileOpen]);

  // const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // Removed local state
  const isMobileMenuOpen = isMobileOpen; // Use prop
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // --- Touch Gestures for Mobile Sidebar ---
  const [touchState, dispatch] = useReducer(touchReducer, touchInitial);
  const { touchStartX, touchStartY, translateX, isDragging, isClosing } = touchState;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isClosing) return;
    dispatch({ type: 'START', x: e.targetTouches[0].clientX, y: e.targetTouches[0].clientY });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX === null || touchStartY === null || isClosing) return;

    const currentX = e.targetTouches[0].clientX;
    const currentY = e.targetTouches[0].clientY;

    const diffX = currentX - touchStartX;
    const diffY = currentY - touchStartY;

    // Si el movimiento es mayormente vertical (scroll), ignorar el swipe horizontal
    if (Math.abs(diffY) > Math.abs(diffX)) return;

    // Solo permitir arrastrar hacia la izquierda (valores negativos)
    if (diffX < 0) {
      // Prevenir scroll default si estamos haciendo swipe lateral claro
      if (Math.abs(diffX) > 10 && e.cancelable) {
        // e.preventDefault(); // React synthetic events might not support this reliably in all cases here, but good intent
      }
      dispatch({ type: 'MOVE', translateX: diffX });
    }
  };

  const handleTouchEnd = () => {
    if (isClosing) return;

    if (touchStartX !== null && translateX < -80) { // Threshold de 80px para cerrar
      dispatch({ type: 'CLOSE_ANIMATE' });

      setTimeout(() => {
        onMobileClose();
        setTimeout(() => dispatch({ type: 'RESET' }), 50);
      }, 300);
      return;
    }

    dispatch({ type: 'RESET' });
  };

  const isActive = useCallback((s: Screen) => currentScreen === s, [currentScreen]);
  const userRole = profile?.role || 'Mesero';

  const initials = useMemo(() => {
    if (profile?.full_name) {
      return profile.full_name
        .split(' ')
        .map(n => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();
    }
    return 'U';
  }, [profile?.full_name]);

  // Handle mobile navigation
  const handleMobileNavigate = (screen: Screen) => {
    if (screen === Screen.INVENTORY && !canUsePhysicalInventory) {
      setShowUpgradeModal(true);
      return;
    }
    onNavigate(screen);
    onMobileClose();
  };


  const handleDesktopNavigate = useCallback((screen: Screen) => {
    if (screen === Screen.INVENTORY && !canUsePhysicalInventory) {
      setShowUpgradeModal(true);
      return;
    }
    if (screen === currentScreen) return;
    setShowSettingsMenu(false);
    setShowProfileMenu(false);
    onNavigate(screen);
  }, [currentScreen, onNavigate, canUsePhysicalInventory]);

  // Close profile menu and settings menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
      // Mientras un panel de Ajustes esté abierto, no cerramos el submenú:
      // así las opciones siguen visibles al interactuar con el panel.
      if (!isReceiptSettingsOpen && !isSalesModeSettingsOpen &&
        settingsMenuRef.current && !settingsMenuRef.current.contains(event.target as Node)) {
        setShowSettingsMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isReceiptSettingsOpen, isSalesModeSettingsOpen]);

  const handleToggleSettings = useCallback(() => {
    setShowSettingsMenu(prev => !prev);
  }, []);

  const handleToggleMobileSettings = useCallback(() => {
    setShowMobileSettings(prev => !prev);
  }, []);

  const handleSignOut = async () => {
    setShowProfileMenu(false);
    await signOut();
  };




  // Get role badge color
  const getRoleBadgeColor = (role: UserRole): string => {
    switch (role) {
      case 'Administrador':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      case 'Cajero':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'Mesero':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'Cocinero':
        return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isMobileMenuOpen && (
        <div
          style={graceOffsetStyle}
          className={`md:hidden fixed inset-x-0 top-0 bottom-0 min-[431px]:bottom-0 z-[60] transition-all duration-300 ease-out ${isClosing ? 'bg-black/0 backdrop-blur-none' : 'bg-black/50 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]'
            }`}
          onClick={onMobileClose}
        >
          {/* Mobile Drawer Panel */}
          <div
            ref={mobileMenuRef}
            className="w-full min-[431px]:w-80 h-full bg-surface-light dark:bg-surface-dark min-[431px]:shadow-2xl animate-[slideInLeft_0.25s_ease-out] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={translateX !== 0 ? {
              transform: `translateX(${translateX}px)`,
              transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)'
            } : undefined}
          >
            {/* ----------------------------------------------------------------------- */}
            {/* VIEW: MAIN MENU */}
            {/* ----------------------------------------------------------------------- */}
            {activeMobilePanel === 'main' && (
              <div className="flex flex-col h-full animate-[fadeIn_0.2s_ease-out]">

                <div className="px-4 pt-4 pb-1">
                  <h2 className="text-base font-semibold text-text-main dark:text-white truncate">
                    {profile?.business_name || 'Mi Negocio'}
                  </h2>
                </div>
                <div className="px-4 pb-3 flex items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-800">
                  {/* Profile Info (Top) - no navigation, access profile from HomeScreen avatar */}
                  <div className="flex-1 flex items-center p-2 pl-2 pr-3 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-transparent">
                    <div className="flex items-center gap-3">
                      {profile?.avatar_url ? (
                        <div
                          className="size-10 rounded-full bg-cover bg-center border border-border-light dark:border-gray-600"
                          style={{ backgroundImage: `url('${profile.avatar_url}')` }}
                        />
                      ) : (
                        <div className="size-10 rounded-full bg-primary flex items-center justify-center text-primary-text font-bold text-sm shadow-sm">
                          {initials}
                        </div>
                      )}
                      <div className="flex flex-col leading-tight">
                        <span className="text-sm font-bold text-text-main dark:text-gray-100 truncate">
                          {profile?.full_name || 'Usuario'}
                        </span>
                        <span className="text-[11px] text-text-secondary font-semibold uppercase tracking-tight">
                          {userRole}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={onMobileClose}
                    className="p-2 rounded-xl text-gray-400 hover:text-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all shrink-0"
                  >
                    <span className="material-symbols-outlined text-[24px]">close</span>
                  </button>
                </div>

                {/* Main Navigation */}
                <nav className="flex-1 overflow-y-auto pt-2 pb-3 px-3 custom-scrollbar">
                  {[
                    { section: 'Gestión', isSection: true, access: canAccessScreen(Screen.INVENTORY) },
                    { access: canAccessScreen(Screen.INVENTORY), screen: Screen.INVENTORY, label: 'Inventario', icon: 'inventory', isActive: isActive(Screen.INVENTORY) },
                    { section: 'Equipo', isSection: true, access: canAccessScreen(Screen.EMPLOYEES) || true },
                    { access: canAccessScreen(Screen.EMPLOYEES), screen: Screen.EMPLOYEES, label: 'Empleados', icon: 'badge', isActive: isActive(Screen.EMPLOYEES) },
                    { access: canAccessScreen(Screen.ACTIVITY), screen: Screen.ACTIVITY, label: 'Actividad', icon: 'monitoring', isActive: isActive(Screen.ACTIVITY) },
                    { access: false, screen: Screen.TRAINING, label: 'Capacitación', icon: 'school', isActive: isActive(Screen.TRAINING) }
                  ]
                    .filter(item => item.access)
                    .map((item, index) => {
                      if (item.isSection) {
                        return (
                          <div key={`msec-${index}`} className={`px-3 ${index === 0 ? 'pt-0' : 'pt-2.5'} pb-1`}>
                            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{item.section}</span>
                          </div>
                        );
                      }
                      return (
                        <button
                          key={item.screen}
                          onClick={() => handleMobileNavigate(item.screen as Screen)}
                          className={`w-full px-3 py-1.5 min-h-[36px] rounded-xl flex items-center gap-3 transition-colors ${
                            item.isActive
                              ? 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.03)] border border-gray-200/50 dark:border-gray-700/50'
                              : item.screen === Screen.RAG_CHAT && ragChatActive
                                ? 'text-gray-700 dark:text-gray-300 border border-amber-300/60 dark:border-amber-600/30 bg-amber-50/50 dark:bg-amber-900/10'
                                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                          }`}
                        >
                          <span className={`material-symbols-outlined text-[20px] transition-colors ${item.isActive ? 'text-gray-900 dark:text-white' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300'}`}>{item.icon}</span>
                          <span className={`text-[14px] tracking-tight whitespace-nowrap ${item.isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
                          {item.screen === Screen.INVENTORY && !canUsePhysicalInventory && (
                            <span className="ml-auto px-1.5 py-0.2 text-[9px] font-black bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 rounded border border-amber-300/60">
                              PRO
                            </span>
                          )}
                          {item.screen === Screen.RAG_CHAT && ragChatActive && (
                            <span className="ml-auto size-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />
                          )}
                        </button>
                      );
                    })}

                  {/* Impresora — solo para roles sin acceso a Ajustes (evita redundancia) */}
                  {!hasPermission('admin_settings') && (
                    <div className="flex flex-col">
                      <div className="my-2 border-t border-gray-100 dark:border-gray-800 opacity-50 mx-2" />
                      <button
                        onClick={() => { onMobileClose(); setIsPrinterPanelOpen(true); }}
                        aria-label="Impresora"
                        className="w-full px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all text-gray-600 dark:text-gray-400 hover:bg-gray-100/80 dark:hover:bg-gray-800 group"
                      >
                        <span className="material-symbols-outlined text-[20px] text-gray-400 group-hover:text-amber-600 transition-colors">print</span>
                        <div className="text-left leading-tight">
                          <span className="text-[14px] tracking-tight font-medium whitespace-nowrap block">Impresora</span>
                          <p className="text-[10px] text-gray-400 mt-0.5">Conectar impresora de esta estación</p>
                        </div>
                      </button>
                    </div>
                  )}

                  {hasPermission('admin_settings') && (
                    <div className="flex flex-col">
                      <div className="my-2 border-t border-gray-100 dark:border-gray-800 opacity-50 mx-2" />
                      <button
                        onClick={handleToggleMobileSettings}
                        aria-expanded={showMobileSettings}
                        aria-label="Configuración"
                        className={`w-full px-4 py-2.5 rounded-xl flex items-center justify-between transition-all text-gray-600 dark:text-gray-400 hover:bg-gray-100/80 dark:hover:bg-gray-800 group ${showMobileSettings ? 'bg-gray-50 dark:bg-gray-800/40 text-gray-900 dark:text-white font-semibold' : ''}`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-[20px] text-gray-400 group-hover:text-emerald-600 transition-colors">settings</span>
                          <span className="text-[14px] tracking-tight font-medium whitespace-nowrap">Configuración</span>
                        </div>
                        <span className={`material-symbols-outlined text-gray-400 text-[20px] transition-transform duration-200 ${showMobileSettings ? 'rotate-180' : ''}`}>expand_more</span>
                      </button>
                      
                      {showMobileSettings && (
                        <div className="pl-6 pr-2 py-1.5 space-y-1.5 animate-[slideInUpSubtle_0.2s_ease-out] overflow-hidden">
                          {hasPermission('admin_settings') && (
                            <button
                              onClick={() => { onMobileClose(); openReceiptSettings(); }}
                              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors group"
                            >
                              <span className="material-symbols-outlined text-[20px] text-gray-400 group-hover:text-blue-600 transition-colors">receipt_long</span>
                              <div className="text-left leading-tight">
                                <span className="text-xs font-semibold text-text-main dark:text-gray-200">Facturación e Impresión</span>
                                <p className="text-[10px] text-gray-400 mt-0.5">Datos de facturas y conexión de impresora</p>
                              </div>
                            </button>
                          )}

                          {hasPermission('admin_settings') && (
                            <button
                              onClick={() => { onMobileClose(); openSalesModeSettings(); }}
                              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors group"
                            >
                              <span className="material-symbols-outlined text-[20px] text-gray-400 group-hover:text-amber-500 transition-colors">toggle_on</span>
                              <div className="text-left leading-tight">
                                <span className="text-xs font-semibold text-text-main dark:text-gray-200">Activar/Desactivar</span>
                                <p className="text-[10px] text-gray-400 mt-0.5">Modo de venta del negocio (catálogo / escáner)</p>
                              </div>
                            </button>
                          )}
                          
                          {/* Documentos Contables — oculto temporalmente; ver ajustes_facturacion.md */}
                          {false && canAccessScreen(Screen.CONTINGENCY_DOC) && (
                            <button
                              onClick={() => handleMobileNavigate(Screen.CONTINGENCY_DOC)}
                              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors group"
                            >
                              <span className="material-symbols-outlined text-[20px] text-gray-400 group-hover:text-blue-600 transition-colors">description</span>
                              <div className="text-left leading-tight">
                                <span className="text-xs font-semibold text-text-main dark:text-gray-200">Documentos Contables</span>
                                <p className="text-[10px] text-gray-400 mt-0.5">Control de contingencia y correlativos</p>
                              </div>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </nav>
              </div>
            )}

            {/* ----------------------------------------------------------------------- */}
            {/* VIEW: PROFILE SUB-MENU */}
            {/* ----------------------------------------------------------------------- */}
            {activeMobilePanel === 'profile' && (
              <div className="flex flex-col h-full bg-surface-light dark:bg-surface-dark animate-[slideInRight_0.2s_ease-out]">
                {/* Header Back */}
                <div className="p-4 flex items-center gap-3 border-b border-border-light dark:border-border-dark relative">
                  <button
                    onClick={() => setActiveMobilePanel('main')}
                    className="p-2 -ml-2 rounded-xl text-text-secondary hover:bg-background-light dark:hover:bg-gray-800 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[24px]">arrow_back</span>
                  </button>
                  <h3 className="font-semibold text-text-main dark:text-white text-lg">Mi Perfil</h3>
                </div>

                {/* Profile Content */}
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="space-y-2">
                    <button
                      onClick={() => handleMobileNavigate(Screen.PROFILE)}
                      className="w-full px-4 py-3 bg-background-light dark:bg-gray-800/50 rounded-xl flex items-center justify-between hover:bg-gray-200 dark:hover:bg-gray-800 transition-all border border-transparent hover:border-border-light dark:hover:border-gray-700"
                    >
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-text-secondary">person</span>
                        <span className="font-medium text-text-main dark:text-gray-200">Detalles de cuenta</span>
                      </div>
                      <span className="material-symbols-outlined text-text-secondary text-[20px]">chevron_right</span>
                    </button>

                    {canShowSubscription && (
                      <button
                        onClick={() => handleMobileNavigate(Screen.SUBSCRIPTION_MANAGEMENT)}
                        className="w-full px-4 py-3 bg-background-light dark:bg-gray-800/50 rounded-xl flex items-center justify-between hover:bg-gray-200 dark:hover:bg-gray-800 transition-all border border-transparent hover:border-border-light dark:hover:border-gray-700"
                      >
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-text-secondary">card_membership</span>
                          <span className="font-medium text-text-main dark:text-gray-200">Mi Suscripción</span>
                        </div>
                        <span className="material-symbols-outlined text-text-secondary text-[20px]">chevron_right</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Footer Logout */}
                <div className="p-4 bg-background-light dark:bg-black/20 mt-auto border-t border-border-light dark:border-border-dark">
                  <button
                    onClick={async () => {
                      onMobileClose();
                      await signOut();
                    }}
                    className="w-full py-3 bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark text-status-error dark:text-status-error/90 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-status-error/10 hover:border-status-error/30 transition-all"
                  >
                    <span className="material-symbols-outlined">logout</span>
                    Cerrar Sesión
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Backdrop tablet (md–lg): cuando el sidebar está expandido en vista POS catálogo,
          flota encima del contenido; al tocar fuera se colapsa. */}
      {tabletOverlay && isOpen && !isCollapsed && (
        <div
          className="hidden md:block lg:hidden fixed inset-0 z-[55] bg-black/40 animate-[fadeIn_0.15s_ease-out]"
          onClick={onToggleCollapse}
          aria-hidden="true"
        />
      )}

      {/* Desktop Sidebar - Fixed Width */}
      <aside
        style={graceOffsetStyle}
        className={`group/sb ${isOpen ? 'translate-x-0' : '-translate-x-full opacity-0 hidden'} ${isCollapsed ? 'w-16' : 'w-64'} bg-surface-light dark:bg-surface-dark border-r border-gray-200 dark:border-gray-800 flex flex-col pb-4 shrink-0 z-[60] hidden md:flex fixed left-0 top-0 h-full transition-[transform,opacity,width,padding] duration-300 ease-out overflow-visible`}
      >
        {!profile ? (
          /* ── Skeleton con shimmer refinado ── */
          <div className="flex flex-col gap-2 flex-1 px-4 overflow-hidden">
            {/* Perfil skeleton */}
            <div className="h-14 flex items-center px-4 shrink-0 mb-1">
              <div className="size-9 rounded-full shrink-0 skeleton-shimmer" />
              <div className="flex-1 space-y-2">
                <div className="h-2.5 skeleton-shimmer rounded-md w-[68%]" style={{ animationDelay: '60ms' }} />
                <div className="h-2 skeleton-shimmer rounded-md w-[42%]" style={{ animationDelay: '120ms' }} />
              </div>
              <div className="size-4 skeleton-shimmer rounded-full shrink-0" style={{ animationDelay: '80ms' }} />
            </div>
            <div className="h-px bg-gray-100/70 dark:bg-gray-800/70 mx-1" />
            {/* Nav items skeleton escalonado */}
            {[...Array(7)].map((_, i) => (
              <div key={`skeleton-${i}`} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ animationDelay: `${i * 35}ms` }}>
                <div className="size-[22px] skeleton-shimmer rounded-lg shrink-0" style={{ animationDelay: `${i * 35 + 20}ms` }} />
                <div className="h-2.5 skeleton-shimmer rounded-md" style={{ width: `${52 + (i % 4) * 10}%`, animationDelay: `${i * 35 + 40}ms` }} />
              </div>
            ))}
            {/* Settings skeleton al fondo */}
            <div className="mt-auto pb-1 pt-2 border-t border-gray-100/60 dark:border-gray-800/60">
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl">
                <div className="size-[22px] skeleton-shimmer rounded-lg shrink-0" style={{ animationDelay: '280ms' }} />
                <div className="h-2.5 skeleton-shimmer rounded-md w-[45%]" style={{ animationDelay: '310ms' }} />
              </div>
            </div>
          </div>
        ) : (
          /* ── Contenido real ── */
          <div className="flex flex-col h-full overflow-visible">

            {/* Desktop Profile Section (Fixed at Top) */}
            <div className={`h-14 shrink-0 relative ${isCollapsed ? 'px-1.5' : 'px-3'} flex items-center border-b border-gray-150 dark:border-gray-800/80 z-[70] overflow-visible`} ref={profileMenuRef}>
              {isCollapsed ? (
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-all"
                  title={profile?.business_name || 'Mi Negocio'}
                >
                  <div className="size-8 rounded-full bg-primary flex items-center justify-center text-primary-text font-bold text-xs shadow-sm">
                    {initials}
                  </div>
                </button>
              ) : (
                <button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className={`w-full flex items-center gap-2 rounded-lg transition-all group text-left p-1.5 px-2.5 justify-start border border-transparent ${showProfileMenu ? 'bg-gray-100/80 dark:bg-gray-800/60' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}
                >
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <h4 className="text-[13px] font-bold text-gray-700 dark:text-gray-250 truncate leading-tight">
                      {profile?.business_name || 'Bistro POS'}
                    </h4>
                    <p className="text-[10.5px] text-gray-400 dark:text-gray-500 truncate leading-none font-medium mt-1">
                      {profile?.full_name || getRealEmail(user?.email) || profile?.phone || 'Mi Cuenta'}
                    </p>
                  </div>
                  <span className={`material-symbols-outlined text-gray-400 dark:text-gray-500 transition-transform inline text-[16px] ml-auto shrink-0 ${showProfileMenu ? 'rotate-180 text-primary' : ''}`}>expand_more</span>
                </button>
              )}

              {/* Desktop Profile Dropdown (Symmetrical & Integrated) */}
              {showProfileMenu && (
                <div className="absolute top-[calc(100%+6px)] inset-x-3 bg-white dark:bg-surface-dark border border-gray-150 dark:border-gray-800 rounded-xl shadow-[0_10px_30px_-10px_rgba(0,0,0,0.15)] dark:shadow-[0_10px_30px_-10px_rgba(0,0,0,0.4)] z-[100] overflow-hidden animate-[slideInUpSubtle_0.2s_ease-out] backdrop-blur-md dark:bg-surface-dark/95">
                  <div className="py-1">
                    <button
                      onClick={() => handleDesktopNavigate(Screen.PROFILE)}
                      className="w-full px-3 py-2 text-left text-[13px] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/80 flex items-center gap-2.5 transition-colors group"
                    >
                      <span className="material-symbols-outlined text-[18px] text-gray-400 group-hover:text-primary transition-colors">account_circle</span>
                      <span className="font-medium">Mi Perfil</span>
                    </button>

                    {canShowSubscription && (
                      <button
                        onClick={() => handleDesktopNavigate(Screen.SUBSCRIPTION_MANAGEMENT)}
                        className="w-full px-3 py-2 text-left text-[13px] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/80 flex items-center gap-2.5 transition-colors group"
                      >
                        <span className="material-symbols-outlined text-[18px] text-gray-400 group-hover:text-amber-500 transition-colors">workspace_premium</span>
                        <span className="font-medium">Suscripción</span>
                      </button>
                    )}
                  </div>

                  <div className="py-1 border-t border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-black/10">
                    <button
                      onClick={handleSignOut}
                      className="w-full px-3 py-2 text-left text-[13px] text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-2.5 transition-colors font-semibold group"
                    >
                      <span className="material-symbols-outlined text-[18px] group-hover:scale-110 transition-transform">logout</span>
                      Cerrar Sesión
                    </button>
                  </div>
                </div>
              )}
            </div>



            {/* Scrollable Nav Area */}
            <div className={`flex-1 overflow-y-auto overflow-x-visible custom-scrollbar ${isCollapsed ? 'px-1.5' : 'px-3'} py-1`}>
              <nav className="flex flex-col gap-0.5 w-full">
                {[
                  { section: 'Operaciones', isSection: true, access: true, sectionKey: 'operaciones', collapsible: true },
                  {
                    access: true,
                    screen: Screen.SELL,
                    label: 'Punto de Venta',
                    icon: 'payments',
                    isActive: isActive(Screen.SELL) || isActive(Screen.QUICK_ORDER),
                    sectionKey: 'operaciones'
                  },
                  {
                    access: canAccessScreen(Screen.SALES) && canFinalizeSale(),
                    screen: Screen.SALES,
                    label: 'Historial de ventas',
                    icon: 'receipt_long',
                    isActive: isActive(Screen.SALES),
                    prefetchObj: 'sales',
                    sectionKey: 'operaciones'
                  },
                  {
                    section: 'Gestión', isSection: true,
                    access: canAccessScreen(Screen.PRODUCTS) || canAccessScreen(Screen.INVENTORY) || canAccessScreen(Screen.DASHBOARD) || canAccessScreen(Screen.CLIENTS) || canAccessScreen(Screen.DEBTS),
                    sectionKey: 'gestion', collapsible: true
                  },
                  {
                    access: canAccessScreen(Screen.PRODUCTS),
                    screen: Screen.PRODUCTS,
                    label: 'Productos',
                    icon: 'shopping_bag',
                    isActive: isActive(Screen.PRODUCTS),
                    prefetchObj: 'products',
                    sectionKey: 'gestion'
                  },
                  {
                    access: canAccessScreen(Screen.INVENTORY),
                    screen: Screen.INVENTORY,
                    label: 'Inventario',
                    icon: 'inventory',
                    isActive: isActive(Screen.INVENTORY),
                    prefetchObj: 'inventory',
                    sectionKey: 'gestion'
                  },
                  {
                    access: canAccessScreen(Screen.DASHBOARD),
                    screen: Screen.DASHBOARD,
                    label: 'Estadísticas',
                    icon: 'grid_view',
                    isActive: isActive(Screen.DASHBOARD),
                    prefetchObj: 'dashboard',
                    sectionKey: 'gestion'
                  },
                  {
                    access: canAccessScreen(Screen.CLIENTS),
                    screen: Screen.CLIENTS,
                    label: 'Clientes',
                    icon: 'groups',
                    isActive: isActive(Screen.CLIENTS),
                    prefetchObj: 'clients',
                    sectionKey: 'gestion'
                  },
                  {
                    access: canAccessScreen(Screen.DEBTS),
                    screen: Screen.DEBTS,
                    label: 'Proveedores',
                    icon: 'account_balance_wallet',
                    isActive: isActive(Screen.DEBTS),
                    prefetchObj: 'debts',
                    sectionKey: 'gestion'
                  },
                  {
                    section: 'Equipo', isSection: true,
                    access: canAccessScreen(Screen.EMPLOYEES) || true,
                    sectionKey: 'equipo', collapsible: true
                  },
                  {
                    access: canAccessScreen(Screen.EMPLOYEES),
                    screen: Screen.EMPLOYEES,
                    label: 'Empleados',
                    icon: 'badge',
                    isActive: isActive(Screen.EMPLOYEES),
                    prefetchObj: 'employees',
                    sectionKey: 'equipo'
                  },
                  {
                    access: canAccessScreen(Screen.ACTIVITY),
                    screen: Screen.ACTIVITY,
                    label: 'Actividad',
                    icon: 'monitoring',
                    isActive: isActive(Screen.ACTIVITY),
                    sectionKey: 'equipo'
                  },
                  {
                    access: false,
                    screen: Screen.TRAINING,
                    label: 'Capacitación',
                    icon: 'school',
                    isActive: isActive(Screen.TRAINING),
                    sectionKey: 'equipo'
                  },
                ]
                  .filter(item => item.access)
                  .filter(item => {
                    if (item.isSection) return true;
                    const key = (item as any).sectionKey as string | undefined;
                    if (key === 'operaciones') return isOperacionesOpen;
                    if (key === 'gestion') return isGestionOpen;
                    if (key === 'equipo') return isEquipoOpen;
                    return true;
                  })
                  .map((item, index) => {
                    if (item.isSection) {
                      const collapsible = !!(item as any).collapsible;
                      if (collapsible) {
                        const sectionKey = (item as any).sectionKey as string;
                        const isOpen = sectionKey === 'gestion'
                          ? isGestionOpen
                          : sectionKey === 'operaciones'
                            ? isOperacionesOpen
                            : isEquipoOpen;
                        const onToggle = sectionKey === 'gestion'
                          ? () => setIsGestionOpen(p => !p)
                          : sectionKey === 'operaciones'
                            ? () => setIsOperacionesOpen(p => !p)
                            : () => setIsEquipoOpen(p => !p);
                        return (
                          <button
                            key={`sec-${index}`}
                            onClick={onToggle}
                            className={`${isCollapsed ? 'hidden' : ''} w-full flex items-center justify-between px-3.5 py-2 ${index === 0 ? 'mt-1' : 'mt-3'} rounded-lg transition-all duration-200 hover:bg-gray-50 dark:hover:bg-gray-850/40 group`}
                          >
                            <span className="text-[12px] font-semibold text-gray-400 dark:text-gray-500 tracking-normal leading-none group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">{item.section}</span>
                            <span className={`material-symbols-outlined text-[14px] text-gray-400 transition-transform duration-200 ${isOpen ? '' : '-rotate-90'} group-hover:text-gray-600 dark:group-hover:text-gray-300`}>expand_more</span>
                          </button>
                        );
                      }
                      return (
                        <div key={`sec-${index}`} className={`${isCollapsed ? 'hidden' : ''} px-3.5 ${index === 0 ? 'pt-2' : 'pt-4'} pb-1.5`}>
                          <span className="text-[12px] font-semibold text-gray-400 dark:text-gray-500 SentenceCase tracking-normal leading-none">{item.section}</span>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={item.screen}
                        onClick={() => handleDesktopNavigate(item.screen as Screen)}
                        onMouseEnter={() => item.prefetchObj && prefetchScreen(item.prefetchObj as any)}
                        title={isCollapsed ? item.label : undefined}
                        className={`group flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5 justify-start'} py-1.5 min-h-[34px] rounded-lg ${isCollapsed ? 'px-0' : 'px-3'} transition-all duration-200 animate-slideInUpSubtle ${
                          item.isActive
                            ? 'bg-gray-100 text-gray-900 dark:bg-gray-800/80 dark:text-white font-semibold border border-gray-205/20 dark:border-gray-700/20'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 hover:text-gray-900 dark:hover:bg-gray-800/40'
                        }`}
                        style={{ animationDelay: `${index * 12}ms` }}
                      >
                        <span className={`material-symbols-outlined text-[18px] shrink-0 transition-colors ${item.isActive ? 'text-gray-900 dark:text-white' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300'}`}>{item.icon}</span>
                        {!isCollapsed && (
                          <span className={`font-medium whitespace-nowrap overflow-hidden text-ellipsis transition-opacity duration-150 text-[13px] ${item.isActive ? 'font-semibold' : ''}`}>
                            {item.label}
                          </span>
                        )}
                        {!isCollapsed && item.screen === Screen.INVENTORY && !canUsePhysicalInventory && (
                          <span className="ml-auto px-1.5 py-0.2 text-[8px] font-black bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 rounded border border-amber-300/60">
                            PRO
                          </span>
                        )}
                      </button>
                    );
                  })}
              </nav>
            </div>

            <div className={`mt-auto flex flex-col gap-1 relative ${isCollapsed ? 'px-1.5' : 'px-3'} pb-2 pt-1`}>
              <div className={`${isCollapsed ? 'mx-1' : 'mx-3'} border-t border-gray-100 dark:border-gray-800/85 mb-1.5`} />

              {/* Asistente IA: visible en dev y, en producción, solo para el negocio 10000. */}
              {canSeeAiAssistant(profile?.business_id) && (
              <button
                onClick={() => {
                  if (ragChatWidgetVisible && onCloseRagChatWidget) {
                    onCloseRagChatWidget();
                    return;
                  }
                  handleDesktopNavigate(Screen.RAG_CHAT);
                }}
                title={isCollapsed ? 'Asistente IA' : undefined}
                className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-2.5 justify-start'} py-1.5 rounded-lg ${isCollapsed ? 'px-0' : 'px-3'} transition-all duration-200 group mb-0.5 ${
                  isActive(Screen.RAG_CHAT)
                    ? 'bg-gray-100 text-gray-900 dark:bg-gray-800/80 dark:text-white font-semibold border border-gray-205/20 dark:border-gray-700/20'
                    : ragChatActive
                      ? 'text-gray-700 dark:text-gray-300 border border-amber-300/30 dark:border-amber-600/20 bg-amber-50/40 dark:bg-amber-900/10 hover:bg-amber-50/80 dark:hover:bg-amber-900/20'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 hover:text-gray-900 dark:hover:bg-gray-800/40 border border-transparent'
                }`}
              >
                <span className="relative shrink-0">
                  <span className={`material-symbols-outlined text-[18px] transition-colors ${isActive(Screen.RAG_CHAT) ? 'text-gray-900 dark:text-white' : 'text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300'}`}>smart_toy</span>
                  {ragUnreadCount > 0 && (
                    <span
                      className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900 animate-pulse"
                      title={`${ragUnreadCount} ${ragUnreadCount === 1 ? 'mensaje nuevo' : 'mensajes nuevos'} del desarrollador`}
                    />
                  )}
                </span>
                {!isCollapsed && (
                  <span className={`font-medium whitespace-nowrap text-[13px] ${isActive(Screen.RAG_CHAT) ? 'font-semibold' : ''}`}>Asistente IA</span>
                )}
                {!isCollapsed && ragChatActive && ragUnreadCount === 0 && (
                  <span className="ml-auto size-2 rounded-full bg-amber-400 shrink-0 animate-pulse" title="Conversación activa" />
                )}
              </button>
              )}

              {!hasPermission('admin_settings') && !isCollapsed && (
                <button
                  onClick={() => setIsPrinterPanelOpen(true)}
                  aria-label="Impresora"
                  className="w-full flex items-center gap-2.5 py-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-50 dark:hover:bg-gray-850/40 transition-all px-3 justify-start group"
                >
                  <span className="material-symbols-outlined text-[18px] shrink-0 text-gray-400 group-hover:text-gray-600 transition-colors">print</span>
                  <span className="text-[13px] font-medium whitespace-nowrap">Impresora</span>
                </button>
              )}

              {!hasPermission('admin_settings') && isCollapsed && (
                <button
                  onClick={() => setIsPrinterPanelOpen(true)}
                  title="Impresora"
                  className="w-full flex items-center justify-center py-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-50 dark:hover:bg-gray-850/40 transition-all group"
                >
                  <span className="material-symbols-outlined text-[18px] text-gray-400 group-hover:text-gray-600 transition-colors">print</span>
                </button>
              )}

              {hasPermission('admin_settings') && !isCollapsed && (
                <div
                  className="flex flex-col w-full"
                  ref={settingsMenuRef}
                >
                  <button
                    onClick={handleToggleSettings}
                    aria-expanded={showSettingsMenu}
                    aria-label="Ajustes"
                    className={`w-full flex items-center gap-2.5 py-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-50 dark:hover:bg-gray-850/40 transition-all px-3 justify-start group ${showSettingsMenu ? "bg-gray-50 dark:bg-gray-800/45 font-semibold text-gray-955 dark:text-white" : ""}`}
                  >
                    <span className="material-symbols-outlined text-[18px] shrink-0 text-gray-400 group-hover:text-gray-600 transition-colors">settings</span>

                    <div className={`flex items-center justify-between flex-1 overflow-hidden transition-all duration-200 opacity-100 w-auto`}>
                      <span className="text-[13px] font-medium whitespace-nowrap">
                        Ajustes
                      </span>
                      <span className={`material-symbols-outlined text-[16px] text-gray-400 transition-transform duration-200 ${showSettingsMenu ? 'rotate-180' : ''}`}>expand_more</span>
                    </div>
                  </button>

                  {showSettingsMenu && (
                    <div
                      className="mt-1.5 ml-5.5 pl-3 border-l border-gray-200 dark:border-gray-800 flex flex-col gap-1 overflow-hidden animate-[slideInUpSubtle_0.2s_ease-out]"
                    >
                      {hasPermission('admin_settings') && (
                        <button
                          onClick={() => { openReceiptSettings(); }}
                          className="w-full text-left py-2.5 px-3 rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-850/20 transition-all text-[13px] font-medium truncate"
                        >
                          Facturación e Impresión
                        </button>
                      )}
                      {hasPermission('admin_settings') && (
                        <button
                          onClick={() => { openSalesModeSettings(); }}
                          className="w-full text-left py-2.5 px-3 rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-850/20 transition-all text-[13px] font-medium truncate"
                        >
                          Activar/Desactivar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {hasPermission('admin_settings') && isCollapsed && (
                <button
                  onClick={() => { openReceiptSettings(); }}
                  title="Ajustes"
                  className="w-full flex items-center justify-center py-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-50 dark:hover:bg-gray-850/40 transition-all group"
                >
                  <span className="material-symbols-outlined text-[18px] text-gray-400 group-hover:text-gray-600 transition-colors">settings</span>
                </button>
              )}

              {/* Collapse/Expand Toggle */}
              {canCollapse && (
                <button
                  onClick={onToggleCollapse}
                  title={isCollapsed ? 'Expandir menú' : 'Colapsar menú'}
                  className="w-full flex items-center justify-center py-1.5 mt-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-all"
                >
                  <span className={`material-symbols-outlined text-[18px] transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}>
                    left_panel_close
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* Mobile Bottom Navigation removed - use hamburger menu instead */}

      {/* Backdrop compartido para los paneles de Ajustes: permanece montado mientras
          cualquiera esté abierto, así no parpadea al cambiar entre Facturación y Activar/Desactivar. */}
      {(isReceiptSettingsOpen || isSalesModeSettingsOpen) && (
        <div
          className="fixed inset-0 md:left-[var(--sidebar-w,16rem)] bg-slate-900/60 backdrop-blur-[4px] z-[80] animate-[fadeIn_0.2s_ease-out]"
          onClick={() => { setIsReceiptSettingsOpen(false); setIsSalesModeSettingsOpen(false); }}
          aria-hidden="true"
        />
      )}

      <SettingsSidebarPanel
        isOpen={isReceiptSettingsOpen}
        onClose={() => setIsReceiptSettingsOpen(false)}
      />

      <SalesModeSettingsPanel
        isOpen={isSalesModeSettingsOpen}
        onClose={() => setIsSalesModeSettingsOpen(false)}
      />

      <PrinterSettingsPanel
        isOpen={isPrinterPanelOpen}
        onClose={() => setIsPrinterPanelOpen(false)}
      />

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
    </>
  );
};
