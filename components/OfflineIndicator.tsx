import React, { useState } from 'react';
import { OfflineFeaturesModal } from './OfflineFeaturesModal';

interface OfflineIndicatorProps {
    isOnline: boolean;
    pendingCount: number;
    failedCount?: number;
    isSyncing: boolean;
    lastSyncResult: { synced: number; failed: number } | null;
    onSync: () => void;
    onClearFailed?: () => void;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
    isOnline,
    pendingCount,
    failedCount = 0,
    isSyncing,
    lastSyncResult,
    onSync,
    onClearFailed,
}) => {
    const [showFeaturesModal, setShowFeaturesModal] = useState(false);

    // Barra online - sincronización exitosa (toast flotante para móvil, ya que en desktop se muestra en el SellScreen)
    if (isOnline && pendingCount === 0 && lastSyncResult) {
        return (
            <div className="fixed top-2 left-1/2 -translate-x-1/2 z-[60] animate-fadeIn md:hidden w-[90%] max-w-sm">
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl shadow-lg border border-emerald-500 bg-emerald-400 text-sm font-bold text-[#102218] tracking-tight w-full">
                    <span
                        className="material-symbols-outlined text-[18px] shrink-0"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                        aria-hidden="true"
                    >
                        cloud_done
                    </span>
                    <span className="leading-tight">
                        Sincronización exitosa ({lastSyncResult.synced})
                        {lastSyncResult.failed > 0 && <span className="text-red-900 ml-1">· {lastSyncResult.failed} error</span>}
                    </span>
                </div>
            </div>
        );
    }

    if (isOnline && pendingCount === 0 && failedCount === 0) return null;

    const isCurrentlySyncing = isOnline && pendingCount > 0;
    const hasErrors = isOnline && failedCount > 0 && pendingCount === 0;

    const handleSync = (e: React.MouseEvent) => {
        e.stopPropagation();
        onSync();
    };

    return (
        <>
            {/* Barra horizontal fija en la parte superior */}
            <div
                className={`fixed top-0 left-0 right-0 z-[60] border-b md:hidden ${hasErrors ? 'bg-red-100 border-red-300' : 'bg-amber-400 border-amber-500'}`}
                role="status"
                aria-label={hasErrors ? 'Errores de sincronización' : 'Sin conexión a internet'}
            >
                <div className="flex items-center justify-between px-3 py-1.5 max-w-full">
                    {/* Izquierda: icono + texto */}
                    <div className="flex items-center gap-2 min-w-0">
                        <span
                            className={`material-symbols-outlined text-[16px] flex-shrink-0 ${hasErrors ? 'text-red-600' : 'text-[#102218]'} ${isCurrentlySyncing ? 'animate-spin' : ''}`}
                            style={{ fontVariationSettings: "'FILL' 1" }}
                            aria-hidden="true"
                        >
                            {hasErrors ? 'error' : isCurrentlySyncing ? 'sync' : 'wifi_off'}
                        </span>
                        <span className={`text-xs font-semibold whitespace-nowrap ${hasErrors ? 'text-red-700' : 'text-[#102218]'}`}>
                            {hasErrors ? `${failedCount} error${failedCount > 1 ? 'es' : ''} de sync` : isCurrentlySyncing ? 'Sincronizando...' : 'Sin conexión'}
                        </span>
                        {pendingCount > 0 && (
                            <span className="hidden sm:inline text-xs text-[#102218]/70 font-medium">
                                · {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>

                    {/* Derecha: botones */}
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        {hasErrors && (
                            <button
                                onClick={onClearFailed}
                                className="flex items-center gap-1 bg-red-600 text-white text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors hover:bg-red-700 whitespace-nowrap"
                            >
                                Descartar
                            </button>
                        )}

                        {!isCurrentlySyncing && !hasErrors && (
                            <button
                                onClick={() => setShowFeaturesModal(true)}
                                className="text-[11px] font-bold text-[#102218] underline decoration-[#102218]/40 hover:decoration-[#102218] transition-colors whitespace-nowrap"
                            >
                                ¿Qué puedes hacer?
                            </button>
                        )}

                        {pendingCount > 0 && (
                            <button
                                onClick={handleSync}
                                disabled={isSyncing}
                                className="flex items-center gap-1 bg-[#102218] text-amber-400 text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors hover:bg-emerald-950 whitespace-nowrap"
                                aria-label={`${pendingCount} operaciones pendientes`}
                            >
                                <span
                                    className={`material-symbols-outlined text-[13px] ${isSyncing ? 'animate-spin' : ''}`}
                                    aria-hidden="true"
                                >
                                    {isSyncing ? 'sync' : 'cloud_upload'}
                                </span>
                                <span className="hidden sm:inline">
                                    {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
                                </span>
                                <span className="sm:hidden">{pendingCount}</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal de funcionalidades */}
            {showFeaturesModal && (
                <OfflineFeaturesModal onClose={() => setShowFeaturesModal(false)} />
            )}
        </>
    );
};
