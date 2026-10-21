interface TableOrderLoadingOverlayProps {
    /** Muestra el estado de carga (fetch de la orden en curso). */
    loading: boolean;
    /** Muestra el estado de error con opción de reintento. */
    error?: boolean;
    /** Etiqueta de la mesa que se está abriendo (ej. "MESA 2"). */
    tableLabel?: string;
    /** Acción para reintentar el fetch cuando hubo error. */
    onRetry?: () => void;
    /** Cierra el estado de error sin reintentar. */
    onDismiss?: () => void;
}

/**
 * Overlay limpio que se muestra sobre el área de la orden mientras se carga la
 * orden de una mesa ocupada (Fetch_Orden_Mesa). Bloquea la edición hasta que
 * termina la carga. En error, ofrece reintentar.
 *
 * Diseño mínimo y accesible: no agrega lógica de negocio, solo presentación.
 */
const TableOrderLoadingOverlay = ({ loading, error, tableLabel, onRetry, onDismiss }: TableOrderLoadingOverlayProps) => {
    if (!loading && !error) return null;

    const handleRetryKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onRetry?.();
        }
    };

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm"
            role="status"
            aria-live="polite"
            aria-label={error ? 'Error al cargar la orden de la mesa' : 'Cargando orden de la mesa'}
        >
            {error ? (
                <div className="flex flex-col items-center gap-3 px-6 text-center">
                    <span className="material-symbols-outlined text-[32px] text-rose-500">error</span>
                    <p className="text-sm font-medium text-slate-600 dark:text-gray-300">
                        No se pudo cargar la orden{tableLabel ? ` de ${tableLabel}` : ''}.
                    </p>
                    <div className="flex items-center gap-2">
                        {onDismiss && (
                            <button
                                onClick={onDismiss}
                                tabIndex={0}
                                aria-label="Cerrar el aviso de error"
                                className="flex items-center h-9 px-4 rounded-full text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 transition-colors active:scale-95"
                            >
                                Cerrar
                            </button>
                        )}
                        {onRetry && (
                            <button
                                onClick={onRetry}
                                onKeyDown={handleRetryKeyDown}
                                tabIndex={0}
                                aria-label="Reintentar cargar la orden"
                                className="flex items-center gap-1.5 h-9 px-4 rounded-full text-sm font-semibold bg-amber-400 text-emerald-950 hover:bg-amber-500 transition-colors active:scale-95"
                            >
                                <span className="material-symbols-outlined text-[18px]">refresh</span>
                                Reintentar
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center gap-3">
                    <span className="size-8 rounded-full border-[3px] border-amber-400 border-t-transparent animate-spin" />
                    <p className="text-sm font-medium text-slate-600 dark:text-gray-300">
                        Cargando orden{tableLabel ? ` de ${tableLabel}` : ''}…
                    </p>
                </div>
            )}
        </div>
    );
};

export default TableOrderLoadingOverlay;
