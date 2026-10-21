import React, { useState } from 'react';
import { Screen } from '../types';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { useEmployeePresence } from '../hooks/useEmployeePresence';
import { useAuditEvents } from '../hooks/useAuditEvents';
import { AuditEvent } from '../lib/activityMockData';
import PresenceStack from '../components/activity/PresenceStack';
import EventViewerInfo from '../components/activity/EventViewerInfo';
import EventFilters from '../components/activity/EventFilters';
import EventRow from '../components/activity/EventRow';
import EventDetailModal from '../components/activity/EventDetailModal';

interface ActivityScreenProps {
    onNavigate: (screen: Screen) => void;
}

/**
 * NOTA — Gestión de dispositivos / alias DESACTIVADA.
 * El botón "Dispositivos" y el `DeviceManagementModal` se ocultaron y se dejó de
 * escribir en la tabla `business_devices` (sigue existiendo en Supabase, vacía).
 * El "sistema" del dispositivo ahora se deriva del user_agent y viaja en el
 * payload de presencia. Para reactivar alias: restaurar `upsertDevice` en
 * `usePresenceBroadcast`, este botón + `DeviceManagementModal`, y `useDeviceAliases`
 * en `PresenceList`/`EventDetailModal`. (Detalle completo en el STATUS del spec
 * `actividad-empleados`.)
 *
 * NOTA — La pestaña "Empleados conectados" se eliminó. La presencia ahora vive en
 * el header como un stack de avatares (`PresenceStack`) que despliega el detalle
 * (popover en desktop, bottom sheet en móvil). El Visor de eventos es el contenido
 * único de la pantalla.
 */

// Acciones cuyo detalle es redundante con la propia descripción de la fila:
// no abren el modal de detalle al pulsarlas.
const NON_DETAIL_ACTIONS = new Set<string>(['cash.shift.opened']);

export const ActivityScreen = ({ onNavigate }: ActivityScreenProps) => {
    const { timezone } = useBusinessSettings();

    const { users, onlineCount, loading: presenceLoading, isObserverOffline } = useEmployeePresence();
    const {
        events, totalCount, loading: eventsLoading, hasMore, loadMore, reload,
        filters, setFilters, employees, isLongRange,
    } = useAuditEvents();

    const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

    const handleViewSale = (saleId: string) => {
        // Deep-link a la venta: SalesScreen lee ?sale al montar, la carga y la abre.
        try {
            const params = new URLSearchParams();
            params.set('sale', saleId);
            window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`);
        } catch { /* no-op */ }
        setSelectedEvent(null);
        onNavigate(Screen.SALES);
    };
    const handleViewReport = () => {
        setSelectedEvent(null);
        onNavigate(Screen.SALES);
    };
    const handleViewShiftReport = (shiftId: string) => {
        // Deep-link al turno de caja: CashRegisterScreen lee ?shift al montar y abre su detalle.
        try {
            const params = new URLSearchParams();
            params.set('shift', shiftId);
            window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`);
        } catch { /* no-op */ }
        setSelectedEvent(null);
        onNavigate(Screen.CASH_REGISTER);
    };
    const handleFilterByEmployee = (userId: string) => {
        setFilters({ userId });
        setSelectedEvent(null);
    };

    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0B1120] text-slate-800 dark:text-slate-200 animate-fadeIn">
            {/* Header */}
            <header className="px-4 sm:px-6 py-3 bg-white dark:bg-[#151e32] border-b border-slate-200 dark:border-slate-800 shrink-0">
                <div className="flex items-center gap-3 max-w-3xl mx-auto">
                    <h1 className="text-base font-bold text-slate-900 dark:text-white">
                        <span className="min-[431px]:hidden">Eventos</span>
                        <span className="max-[430px]:hidden">Visor de eventos</span>
                    </h1>
                    <EventViewerInfo />

                    <button
                        onClick={reload}
                        aria-label="Refrescar"
                        title="Refrescar"
                        tabIndex={0}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-white/5 rounded-lg px-2.5 py-1.5 transition-colors shrink-0"
                    >
                        <span className={`material-symbols-outlined text-[18px] ${eventsLoading ? 'animate-spin' : ''}`}>refresh</span>
                        <span className="hidden sm:inline">Refrescar</span>
                    </button>

                    {/* Empleados conectados: stack de avatares con detalle on-demand */}
                    <div className="ml-auto">
                        <PresenceStack
                            users={users}
                            onlineCount={onlineCount}
                            loading={presenceLoading}
                            isObserverOffline={isObserverOffline}
                            timezone={timezone}
                        />
                    </div>
                </div>
            </header>

            {/* Contenido */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6">
                <div className="max-w-3xl mx-auto space-y-4">
                    <EventFilters
                        filters={filters}
                        setFilters={setFilters}
                        employees={employees}
                        isLongRange={isLongRange}
                        totalCount={totalCount}
                    />

                    {eventsLoading ? (
                        <div className="space-y-2">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="h-[68px] rounded-xl skeleton-shimmer" style={{ animationDelay: `${i * 50}ms` }} />
                            ))}
                        </div>
                    ) : events.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-56 text-center">
                            <span className="material-symbols-outlined text-5xl text-slate-300 mb-2">manage_search</span>
                            <p className="text-sm font-medium text-slate-500">No hay eventos con estos filtros</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                {events.map(ev => (
                                    <EventRow
                                        key={ev.id}
                                        event={ev}
                                        timezone={timezone}
                                        onClick={NON_DETAIL_ACTIONS.has(ev.action) ? undefined : () => setSelectedEvent(ev)}
                                    />
                                ))}
                            </div>
                            {hasMore && (
                                <div className="flex justify-center pt-2">
                                    <button
                                        onClick={loadMore}
                                        className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                                    >
                                        Cargar más
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <EventDetailModal
                event={selectedEvent}
                timezone={timezone}
                onClose={() => setSelectedEvent(null)}
                onViewSale={handleViewSale}
                onViewReport={handleViewReport}
                onViewShiftReport={handleViewShiftReport}
                onFilterByEmployee={handleFilterByEmployee}
            />
        </div>
    );
};
