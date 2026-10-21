import type { EstadoConexion } from '../lib/printerRegistry';

/**
 * components/ComandaTargetGrid.tsx
 *
 * Grid "Enviar comanda a" — SOLO para el rol COMANDA. Unifica destinos locales
 * (impresoras registradas) y remotos (dispositivos de cocina por presence) en
 * una sola superficie tocable de máximo 3 columnas. Reutilizado por
 * `SuccessScreen` y `SuccessSidebar`.
 *
 * Nota de color: ningún texto usa amarillo/ámbar; los resaltes van en neutro o
 * emerald/green. El punto de estado puede usar `bg-green-500`.
 */

export type ComandaTargetKind = 'local' | 'remote';

export interface ComandaTarget {
    kind: ComandaTargetKind;
    id: string;                 // local: printerName · remote: targetUserId
    label: string;              // nombre visible (impresora o dispositivo)
    subLabel?: string;          // p. ej. rol del dispositivo remoto
    status: EstadoConexion;     // local: estado real; remote: 'connected'
    isDefault?: boolean;        // local: es la defaultComanda actual
}

export interface ComandaTargetGridProps {
    targets: ComandaTarget[];
    onPrintLocal: (printerName: string) => Promise<void>;
    onSendRemote: (targetUserId: string) => Promise<void>;
    onRequestConnect: () => void;
    busyTargetId?: string | null;
}

const ComandaTargetGrid = ({
    targets,
    onPrintLocal,
    onSendRemote,
    onRequestConnect,
    busyTargetId,
}: ComandaTargetGridProps) => {
    // Sin destinos → botón "Conectar impresora" en vez de tarjetas (Req 16.9 / 15.1).
    if (targets.length === 0) {
        const handleConnectKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onRequestConnect();
            }
        };

        return (
            <div className="w-full">
                <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2 text-left">
                    Enviar comanda a
                </h3>
                <button
                    type="button"
                    onClick={onRequestConnect}
                    onKeyDown={handleConnectKeyDown}
                    tabIndex={0}
                    aria-label="Conectar impresora"
                    className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-text-main dark:text-white font-bold hover:border-emerald-500/50 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-700 dark:hover:text-emerald-400 transition-all"
                >
                    <span className="material-symbols-outlined text-xl">power</span>
                    <span className="text-sm">Conectar impresora</span>
                </button>
            </div>
        );
    }

    return (
        <div className="w-full">
            <h3 className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2 text-left">
                Enviar comanda a
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {targets.map((target) => (
                    <ComandaTargetCard
                        key={`${target.kind}-${target.id}`}
                        target={target}
                        isBusy={busyTargetId === target.id}
                        onPrintLocal={onPrintLocal}
                        onSendRemote={onSendRemote}
                        onRequestConnect={onRequestConnect}
                    />
                ))}
            </div>
        </div>
    );
};

interface ComandaTargetCardProps {
    target: ComandaTarget;
    isBusy: boolean;
    onPrintLocal: (printerName: string) => Promise<void>;
    onSendRemote: (targetUserId: string) => Promise<void>;
    onRequestConnect: () => void;
}

const ComandaTargetCard = ({ target, isBusy, onPrintLocal, onSendRemote, onRequestConnect }: ComandaTargetCardProps) => {
    const isLocal = target.kind === 'local';
    // Una tarjeta local no está disponible si su impresora no está conectada (Req 16.8).
    const isUnavailable = isLocal && target.status !== 'connected';
    // No la deshabilitamos por desconexión: al tocarla abre el panel para reconectar.
    const isDisabled = isBusy;

    const ariaLabel = isUnavailable
        ? `Reconectar ${target.label}`
        : isLocal
            ? `Imprimir comanda en ${target.label}${target.subLabel ? ` ${target.subLabel}` : ''}`
            : `Enviar comanda a ${target.label}`;

    const handleActivate = () => {
        if (isDisabled) return;
        if (isUnavailable) {
            // Impresora local desconectada → abrir el panel para reconectar.
            onRequestConnect();
            return;
        }
        if (isLocal) {
            void onPrintLocal(target.id);
            return;
        }
        void onSendRemote(target.id);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleActivate();
        }
    };

    const icon = isLocal ? 'print' : 'sensors';
    const statusLabel = isUnavailable ? 'reconectar' : isLocal ? 'conectada' : 'disponible';

    return (
        <button
            type="button"
            onClick={handleActivate}
            onKeyDown={handleKeyDown}
            disabled={isDisabled}
            aria-disabled={isDisabled}
            aria-label={ariaLabel}
            tabIndex={0}
            className={`relative flex flex-col items-start text-left p-3 rounded-xl border transition-all min-h-[72px] ${
                isBusy
                    ? 'bg-gray-50 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 opacity-60 cursor-not-allowed'
                    : isUnavailable
                        ? 'bg-gray-50/70 dark:bg-gray-800/40 border-dashed border-gray-300 dark:border-gray-600 hover:border-emerald-500/50 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 group'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-emerald-500/50 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 group'
            }`}
        >
            <div className="flex items-center gap-1.5 w-full">
                <span className={`material-symbols-outlined text-lg ${
                    isBusy || isUnavailable
                        ? 'text-gray-400 dark:text-gray-600'
                        : 'text-text-secondary group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors'
                }`}>
                    {icon}
                </span>
                <span className="text-xs font-bold text-text-main dark:text-white truncate flex-1">
                    {target.label}
                </span>
            </div>

            {target.subLabel && (
                <span className="text-[11px] text-text-secondary font-medium truncate w-full mt-0.5">
                    {target.subLabel}
                </span>
            )}

            {target.isDefault && (
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    ✓ Predet.
                </span>
            )}

            <div className="flex items-center gap-1 mt-auto pt-1">
                {isBusy ? (
                    <span className="material-symbols-outlined text-sm text-emerald-600 dark:text-emerald-400 animate-spin">
                        progress_activity
                    </span>
                ) : (
                    <span className={`size-1.5 rounded-full ${
                        isUnavailable ? 'bg-gray-400 dark:bg-gray-600' : 'bg-green-500'
                    }`} aria-hidden="true" />
                )}
                <span className="text-[11px] text-text-secondary font-medium">
                    {isBusy ? 'Enviando…' : statusLabel}
                </span>
            </div>
        </button>
    );
};

export default ComandaTargetGrid;
