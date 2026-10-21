import React from 'react';
import type { TablesReadOnlyReason } from '../hooks/useTablesWriteGate';

interface TablesReadOnlyBannerProps {
    /** Motivo del bloqueo, para distinguir el estilo/ícono del banner. */
    reason: TablesReadOnlyReason;
    /** Texto exacto del banner (lo produce el gate: Req 5.3 / 16.3). */
    message: string;
    /** Variante compacta para controles pequeños (TableSelectorControl). */
    compact?: boolean;
}

/**
 * TablesReadOnlyBanner — banner de solo lectura de mesas (modelo Usuario Eje).
 *
 * Muestra el mensaje que genera `useTablesWriteGate` y distingue visualmente
 * los dos motivos de bloqueo (Req 5.2/5.3 y 16.2/16.3):
 *   - `observer-offline`: el observador no tiene internet (ámbar, `cloud_off`).
 *   - `eje-offline`: el Eje conocido está sin conexión (naranja, `person_off`).
 *
 * El texto NO se altera aquí: el formato exacto de los requisitos lo aporta el
 * gate. Este componente solo aporta la presentación y accesibilidad.
 */
const TablesReadOnlyBanner = ({ reason, message, compact = false }: TablesReadOnlyBannerProps) => {
    if (reason === 'none' || !message) return null;

    const isEjeOffline = reason === 'eje-offline';
    const icon = isEjeOffline ? 'person_off' : 'cloud_off';

    const tone = isEjeOffline
        ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300 ring-orange-200 dark:ring-orange-800/50'
        : 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 ring-amber-200 dark:ring-amber-800/50';

    const sizing = compact
        ? 'px-3 py-2 rounded-xl text-[12px]'
        : 'px-4 py-3 rounded-xl text-sm';

    const iconSize = compact ? 'text-[16px]' : 'text-[18px]';

    return (
        <div
            role="status"
            aria-live="polite"
            className={`flex items-start gap-2 font-semibold ring-1 ${tone} ${sizing}`}
        >
            <span className={`material-symbols-outlined shrink-0 ${iconSize}`} aria-hidden>{icon}</span>
            <span>{message}</span>
        </div>
    );
};

export default TablesReadOnlyBanner;
