/**
 * useTablesWriteGate — gate de escritura de mesas (modelo Usuario Eje).
 *
 * Centraliza la decisión de si el usuario puede ESCRIBIR en mesas ahora mismo,
 * combinando el rol offline (`useEjeStatus`) con el estado de conectividad real.
 * Se usa en las pantallas/controles de mesas (MenuScreen, PaymentScreen,
 * TablesScreen, TableSelectorControl) para deshabilitar controles y prevenir la
 * acción del observador.
 *
 * Regla del gate:
 *   - Usuario Eje (turno abierto): SIEMPRE puede escribir (online conforme a sus
 *     permisos; offline como único escritor). Req 4.1, 4.2.
 *   - Observador SIN internet: solo lectura. Req 4.4, 5.1.
 *   - Observador CON internet pero con un Eje conocido que NO figura presente en
 *     el canal de presencia: solo lectura (congelamiento). Req 16.1.
 *   - Observador CON internet y Eje presente (o sin ningún Eje): opera normal
 *     conforme a sus permisos. Req 15.2.
 *
 * Mitigación de la ventana de presencia (Error Handling, caso 1): además de la
 * lectura reactiva del canal, `verifyCanWriteNow()` re-lee la presencia en el
 * momento justo antes de confirmar una escritura (segunda verificación).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { checkRealInternet } from '../lib/connectivity';
import { presenceManager } from '../lib/presenceManager';
import { getCachedOpenShifts } from '../lib/openShiftsCache';
import { useEjeStatus } from './useEjeStatus';

export type TablesReadOnlyReason = 'none' | 'observer-offline' | 'eje-offline';

export interface TablesWriteGate {
    /** Hay internet real confirmado. */
    isOnline: boolean;
    /** El usuario actual tiene turno de caja abierto. */
    soyEje: boolean;
    /** Hay al menos un Eje presente en el canal de presencia. */
    ejeOnline: boolean;
    /** Nombre del Eje (para banners del observador). */
    ejeNombre: string | null;
    /** Existe al menos un turno de caja abierto conocido. */
    hayEje: boolean;
    /** El usuario puede escribir en mesas en este momento. */
    canWrite: boolean;
    /** El usuario está en modo solo lectura (no puede escribir). */
    readOnly: boolean;
    /** Motivo del bloqueo (para banners/toasts). */
    readOnlyReason: TablesReadOnlyReason;
    /** Texto mínimo del banner de solo lectura (la tarea 15 lo enriquece). */
    readOnlyMessage: string | null;
    /** Re-lee la presencia y confirma si la escritura sigue permitida (Req 15.5). */
    verifyCanWriteNow: () => boolean;
}

/**
 * Estado reactivo de conectividad real. `navigator.onLine === false` es fiable
 * (offline inmediato); `=== true` se confirma con una sonda a Supabase, ya que
 * los adaptadores virtuales pueden mantener onLine=true sin internet real.
 */
const useReactiveOnline = (): boolean => {
    const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);

    useEffect(() => {
        let cancelled = false;
        const confirm = async () => {
            const real = await checkRealInternet();
            if (!cancelled) setIsOnline(real);
        };
        void confirm();

        const handleOnline = () => { void confirm(); };
        const handleOffline = () => { if (!cancelled) setIsOnline(false); };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        // Al terminar una sincronización, re-confirmar el estado de red.
        window.addEventListener('offline-sync-completed', confirm);

        return () => {
            cancelled = true;
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('offline-sync-completed', confirm);
        };
    }, []);

    return isOnline;
};

export const useTablesWriteGate = (): TablesWriteGate => {
    const { soyEje, ejeOnline, ejeNombre, ejesNombres } = useEjeStatus();
    const isOnline = useReactiveOnline();
    const hayEje = ejesNombres.length > 0;

    const readOnlyReason = useMemo<TablesReadOnlyReason>(() => {
        if (soyEje) return 'none';                       // El Eje siempre escribe.
        if (!isOnline) return 'observer-offline';        // Observador sin internet (Req 5.1).
        if (hayEje && !ejeOnline) return 'eje-offline';  // Eje conocido sin conexión (Req 16.1).
        return 'none';                                   // Online normal (Req 15.2).
    }, [soyEje, isOnline, hayEje, ejeOnline]);

    const canWrite = readOnlyReason === 'none';

    const readOnlyMessage = useMemo<string | null>(() => {
        if (readOnlyReason === 'observer-offline') {
            // El observador (normalmente un mesero) no tiene internet.
            return ejeNombre
                ? `Sin internet: las mesas están en solo lectura. Toma el pedido en papel y pásaselo a ${ejeNombre} (cajero del turno) para registrarlo y cobrarlo.`
                : 'Sin internet: las mesas están en solo lectura. Toma el pedido en papel y pásaselo al cajero con turno abierto para registrarlo y cobrarlo.';
        }
        if (readOnlyReason === 'eje-offline') {
            // El observador tiene internet, pero el Eje (cajero del turno) se quedó sin conexión.
            const nombre = ejeNombre ?? 'el cajero del turno';
            return `${nombre} (cajero del turno) está sin conexión: las mesas quedan en solo lectura. Toma el pedido en papel y comunícate con ${ejeNombre ?? 'el cajero'} para registrarlo.`;
        }
        return null;
    }, [readOnlyReason, ejeNombre]);

    // Segunda verificación puntual: re-lee la presencia en el instante de escribir
    // para mitigar la ventana en que el canal aún no retiró a un Eje caído.
    const verifyCanWriteNow = useCallback((): boolean => {
        if (soyEje) return true;
        if (!isOnline) return false;
        if (!hayEje) return true;
        const presentIds = Object.keys(presenceManager.getUsers());
        const openShifts = getCachedOpenShifts();
        return openShifts.some(s => presentIds.includes(s.userId));
    }, [soyEje, isOnline, hayEje]);

    return useMemo<TablesWriteGate>(() => ({
        isOnline,
        soyEje,
        ejeOnline,
        ejeNombre,
        hayEje,
        canWrite,
        readOnly: !canWrite,
        readOnlyReason,
        readOnlyMessage,
        verifyCanWriteNow,
    }), [isOnline, soyEje, ejeOnline, ejeNombre, hayEje, canWrite, readOnlyReason, readOnlyMessage, verifyCanWriteNow]);
};
