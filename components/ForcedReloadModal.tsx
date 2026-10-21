import React, { useEffect, useRef, useState } from 'react';
import { subscribeToEjeTableSync, shouldForceReloadFromEjeSync } from '../lib/tableReloadSignal';

interface ForcedReloadModalProps {
    /** El usuario actual es el Eje (turno abierto). El Eje NUNCA ve el modal (Req 17.4). */
    soyEje: boolean;
    /** El observador está viendo el módulo de Mesas ahora mismo. */
    isViewingTables: boolean;
    /** Hay internet real confirmado (para la recuperación al reconectar, Req 17.5). */
    isOnline: boolean;
}

/**
 * ForcedReloadModal — aviso de recarga obligatoria tras la sincronización del Eje (Req 17).
 *
 * Cuando el Eje termina de subir sus transacciones de mesas, emite una señal
 * (`subscribeToEjeTableSync`). Los observadores conectados que están viendo
 * Mesas reciben esta señal y deben recargar para trabajar con el estado real.
 *
 * Reglas:
 *   - Solo se muestra a observadores: el Eje nunca lo ve (Req 17.4).
 *   - Solo mientras el observador ve Mesas (se suscribe/de-suscribe con la vista).
 *   - Recuperación (Req 17.5): al entrar/reconectar a Mesas, si el Eje sincronizó
 *     después del último refresco del cache local, forzar recarga.
 *   - Bloqueante: no se puede cerrar; el único botón recarga la app.
 *   - Preserva el carrito cacheado: `location.reload()` mantiene el localStorage
 *     (`bistro_cart`), no se borra nada aquí (Req 17.6).
 */
const ForcedReloadModal = ({ soyEje, isViewingTables, isOnline }: ForcedReloadModalProps) => {
    const [visible, setVisible] = useState(false);
    const reloadBtnRef = useRef<HTMLButtonElement>(null);

    // Suscripción a la señal del Eje: solo para observadores mientras ven Mesas.
    useEffect(() => {
        if (soyEje || !isViewingTables) return;
        const unsubscribe = subscribeToEjeTableSync(() => setVisible(true));
        return unsubscribe;
    }, [soyEje, isViewingTables]);

    // Recuperación del observador que se perdió la señal (Req 17.5): al entrar o
    // reconectar a Mesas, comparar el timestamp del Eje con el cache local.
    useEffect(() => {
        if (soyEje || !isViewingTables || !isOnline) return;
        if (shouldForceReloadFromEjeSync()) setVisible(true);
    }, [soyEje, isViewingTables, isOnline]);

    // Guard defensivo: si el usuario pasa a ser Eje, nunca mostrar el modal (Req 17.4).
    useEffect(() => {
        if (soyEje && visible) setVisible(false);
    }, [soyEje, visible]);

    // Foco en el botón de recarga al abrir (accesibilidad del modal bloqueante).
    useEffect(() => {
        if (visible) reloadBtnRef.current?.focus();
    }, [visible]);

    if (!visible || soyEje) return null;

    // No borrar el carrito ni ningún cache: location.reload() preserva localStorage.
    const handleReload = () => window.location.reload();

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
            {/* Overlay bloqueante: sin cierre por click ni Escape. */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />

            <div
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="forced-reload-title"
                aria-describedby="forced-reload-desc"
                className="relative w-full max-w-sm bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
                <div className="flex flex-col items-center text-center gap-3 p-6">
                    <div className="size-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[30px]" aria-hidden>sync</span>
                    </div>
                    <h2 id="forced-reload-title" className="text-lg font-bold text-text-main dark:text-white leading-tight">
                        Actualización de mesas
                    </h2>
                    <p id="forced-reload-desc" className="text-sm text-text-secondary dark:text-gray-300 leading-relaxed">
                        El cajero terminó de sincronizar los cambios de las mesas. Recarga la aplicación para trabajar con el estado actualizado. Tu carrito de Orden Rápida se conserva.
                    </p>
                </div>

                <div className="p-4 pt-0">
                    <button
                        ref={reloadBtnRef}
                        onClick={handleReload}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleReload(); } }}
                        className="w-full h-12 rounded-xl bg-primary hover:bg-primary-hover text-[#102218] font-bold text-base shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
                    >
                        <span className="material-symbols-outlined text-[20px]" aria-hidden>refresh</span>
                        Recargar ahora
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ForcedReloadModal;
