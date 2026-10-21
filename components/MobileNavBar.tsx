import React from 'react';
import { Screen } from '../types';
import { useAuth } from '../context/AuthContext';
import { canSeeAiAssistant } from '../lib/specialBusinesses';

interface MobileNavBarProps {
    /** Pantalla actual — determina qué pestaña se marca activa */
    currentScreen: Screen;
    /** Navegación principal (handleNavigate de App) */
    onNavigate: (screen: Screen) => void;
    /** Nº de mensajes IA sin leer — pinta el badge rojo sobre "Ayuda" */
    ragUnreadCount?: number;
    /** ¿Hay turno de caja abierto? — indicador (punto) sobre "Turno" */
    isShiftOpen?: boolean;
    /** ¿El panel de caja está abierto? — marca "Turno" como pestaña activa */
    isCashPanelOpen?: boolean;
}

/**
 * Barra de navegación inferior móvil, fuente única para todas las pantallas.
 * App.tsx la renderiza en todas las pantallas excepto HOME (que tiene su propia
 * instancia desde HomeScreen). El estado activo se deriva de `currentScreen`.
 */
export const MobileNavBar: React.FC<MobileNavBarProps> = ({
    currentScreen,
    onNavigate,
    ragUnreadCount = 0,
    isShiftOpen = false,
    isCashPanelOpen = false,
}) => {
    const { profile } = useAuth();
    const showAiAssistant = canSeeAiAssistant(profile?.business_id);
    // Con el panel de Caja abierto, esa pestaña es la activa y se
    // suprime el resaltado de las demás para no tener dos a la vez.
    const panelOpen = isCashPanelOpen;
    const isSellActive = !panelOpen && (currentScreen === Screen.SELL || currentScreen === Screen.QUICK_ORDER);
    const isHomeActive = !panelOpen && currentScreen === Screen.HOME;

    const items = [
        { icon: 'home', label: 'Inicio', active: isHomeActive, action: () => onNavigate(Screen.HOME), badge: 0, shift: false },
        { icon: 'point_of_sale', label: 'Vender', active: isSellActive, action: () => onNavigate(Screen.SELL), badge: 0, shift: false },
        { icon: 'calculate', label: 'Turno', active: isCashPanelOpen, action: () => onNavigate(Screen.CASH_REGISTER), badge: 0, shift: true },
        // Asistente IA: visible en dev y, en producción, solo para el negocio 10000.
        ...(showAiAssistant ? [{ icon: 'auto_awesome', label: 'Ayuda', active: false, action: () => onNavigate(Screen.RAG_CHAT), badge: ragUnreadCount, shift: false }] as const : []),
    ] as const;

    return (
        <nav
            style={{ bottom: 'max(12px, calc(env(safe-area-inset-bottom, 0px) + 8px))' }}
            className="md:hidden fixed inset-x-3 max-w-sm mx-auto z-50 bg-white/90 backdrop-blur-xl border border-slate-200/80 shadow-[0_10px_30px_rgba(0,0,0,0.1),0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl p-1.5 flex items-center justify-between gap-1"
        >
            {items.map(item => (
                <button
                    key={item.label}
                    onClick={item.action}
                    className={`flex-1 flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition-all duration-200 active:scale-95 focus:outline-none ${
                        item.active
                            ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
                            : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100/60 font-medium'
                    }`}
                    aria-label={item.shift ? `Turno (${isShiftOpen ? 'abierto' : 'cerrado'})` : item.label}
                >
                    <span className="relative inline-flex items-center justify-center">
                        <span className="material-symbols-outlined text-[21px] min-[380px]:text-[22px]">{item.icon}</span>
                        {item.badge > 0 && (
                            <span
                                className={`absolute -top-0.5 -right-1 size-2 rounded-full bg-red-500 ring-2 animate-pulse ${
                                    item.active ? 'ring-amber-400' : 'ring-white'
                                }`}
                                aria-label={`${item.badge} mensajes nuevos`}
                            />
                        )}
                        {item.shift && (
                            <span
                                className={`absolute -top-0.5 -right-1 size-2 rounded-full ring-2 ${
                                    item.active ? 'ring-amber-400' : 'ring-white'
                                } ${isShiftOpen ? 'bg-emerald-500' : 'bg-slate-300'}`}
                                aria-hidden="true"
                            />
                        )}
                    </span>
                    <span className={`text-[10px] min-[380px]:text-[11px] tracking-tight mt-0.5 ${item.active ? 'text-slate-950 font-bold' : 'text-slate-500'}`}>
                        {item.label}
                    </span>
                </button>
            ))}
        </nav>
    );
};

export default MobileNavBar;
