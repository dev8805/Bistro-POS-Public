import { useEffect, useRef, useState } from 'react';
import { usePrinters } from '../hooks/usePrinters';

/**
 * components/PrinterSplitButton.tsx
 *
 * Botón_Dividido EXCLUSIVO del Rol_Impresión `TICKET`. Compuesto por:
 *  - Acción principal "Imprimir Ticket" (imprime en la Impresora_Predeterminada_Ticket).
 *  - Flecha ▼ (siempre visible) que despliega la Lista_Impresoras_Registradas
 *    para elegir destino.
 *
 * Comportamiento de la acción principal:
 *  - Lista vacía            → dispara el flujo "Conectar impresora" (Req 15).
 *  - Sin predeterminada     → abre el menú y obliga a elegir (no imprime aún) (Req 6.1).
 *  - Con predeterminada     → imprime en la predeterminada (Req 7.1).
 *
 * Al elegir una impresora por la flecha ▼: se fija como `defaultTicket`
 * (se "pega") y luego se imprime en ella (Req 8.1, 8.2).
 *
 * Impresoras con Estado_Conexión distinto de `connected` se muestran
 * deshabilitadas en el menú (Req 12.4).
 *
 * Color: ningún texto usa amarillo/ámbar. El resalte de la predeterminada y los
 * hover usan neutro o emerald/green.
 */

interface PrinterSplitButtonProps {
    label: string;                                      // "Imprimir Ticket" (rol fijo TICKET)
    icon: string;                                       // material symbol
    onPrint: (targetPrinter: string) => Promise<void>;  // imprime en la impresora resuelta
    onRequestConnect: () => void;                       // dispara flujo Req 15 (lista vacía)
    disabled?: boolean;
}

const PrinterSplitButton = ({
    label,
    icon,
    onPrint,
    onRequestConnect,
    disabled = false,
}: PrinterSplitButtonProps) => {
    const { printers, defaultTicket, statusTicket, statusFor, setDefault } = usePrinters();

    const [isOpen, setIsOpen] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    const isEmpty = printers.length === 0;
    // La predeterminada solo está lista para imprimir si está conectada (Req 12.4).
    const defaultReady = defaultTicket !== null && statusTicket === 'connected';
    const isBusy = disabled || isPrinting;

    // Cierra el menú al hacer clic fuera. Cleanup del listener en el return.
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Imprime en la impresora indicada gestionando el estado de "imprimiendo".
    const printTo = async (printerName: string) => {
        if (isBusy) return;
        setIsPrinting(true);
        try {
            await onPrint(printerName);
        } finally {
            setIsPrinting(false);
        }
    };

    // Acción principal: lista vacía → conectar; sin predeterminada → abrir menú;
    // predeterminada desconectada → abrir panel para reconectar; conectada → imprimir.
    const handleMainAction = () => {
        if (isBusy) return;
        if (isEmpty) {
            onRequestConnect();
            return;
        }
        if (defaultTicket === null) {
            setIsOpen(true);
            return;
        }
        if (!defaultReady) {
            // Hay predeterminada pero no está conectada (no se reconectó sola):
            // abrir el panel de impresora para reconectar.
            onRequestConnect();
            return;
        }
        void printTo(defaultTicket);
    };

    const handleToggleMenu = () => {
        if (isBusy) return;
        setActiveIndex(0);
        setIsOpen((prev) => !prev);
    };

    // Elegir una impresora del menú: fijar como predeterminada y luego imprimir.
    const handleSelectPrinter = (name: string) => {
        if (statusFor(name) !== 'connected') return;
        setDefault('TICKET', name);
        setIsOpen(false);
        void printTo(name);
    };

    // Enter/Espacio activan; el resto de teclas no interfiere.
    const handleMainKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleMainAction();
        }
    };

    const handleArrowKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleToggleMenu();
        }
    };

    // Navegación del menú: Escape cierra; flechas mueven el foco lógico;
    // Enter/Espacio activan el ítem resaltado.
    const handleMenuKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            setIsOpen(false);
            return;
        }
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((prev) => Math.min(prev + 1, printers.length - 1));
            return;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((prev) => Math.max(prev - 1, 0));
            return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            const target = printers[activeIndex];
            if (target) handleSelectPrinter(target.name);
        }
    };

    // ---- Lista vacía: en vez del split button, "Conectar impresora" (Req 5.6) ----
    if (isEmpty) {
        return (
            <button
                type="button"
                onClick={onRequestConnect}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onRequestConnect();
                    }
                }}
                disabled={disabled}
                tabIndex={0}
                aria-label="Conectar impresora"
                className="w-full h-11 flex items-center justify-center gap-2 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-text-main dark:text-white hover:bg-gray-50 hover:text-emerald-700 dark:hover:bg-gray-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <span className="material-symbols-outlined text-[18px] text-emerald-600">power</span>
                <span className="text-sm font-semibold">Conectar impresora</span>
            </button>
        );
    }

    // Etiqueta de la acción principal según el estado.
    const mainLabel = isPrinting
        ? 'Imprimiendo...'
        : defaultTicket === null
            ? 'Elegir impresora'
            : !defaultReady
                ? 'Conectar impresora'
                : label;

    return (
        <div ref={containerRef} className="relative w-full">
            {/* Cuerpo del split button: acción principal + flecha ▼.
                Look limpio: superficie neutra + borde sutil. El estado de la
                impresora se indica con un punto (verde = conectada). */}
            <div className="w-full flex items-stretch rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
                {/* Acción principal */}
                <button
                    type="button"
                    onClick={handleMainAction}
                    onKeyDown={handleMainKeyDown}
                    disabled={isBusy}
                    tabIndex={0}
                    aria-label={label}
                    className="flex-1 h-11 flex items-center justify-center gap-2 px-3 text-text-main dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <span className="material-symbols-outlined text-[18px] text-text-secondary">{icon}</span>
                    <span className="text-sm font-bold truncate">{mainLabel}</span>
                    {/* Punto de estado: verde si la impresora de ticket está conectada. */}
                    <span
                        className={`size-2 rounded-full shrink-0 transition-colors ${
                            defaultReady
                                ? 'bg-green-500 shadow-[0_0_6px_#22c55e] animate-pulse'
                                : 'bg-gray-300 dark:bg-gray-600'
                        }`}
                        aria-hidden="true"
                    />
                </button>

                {/* Flecha ▼ (siempre visible) */}
                <button
                    type="button"
                    onClick={handleToggleMenu}
                    onKeyDown={handleArrowKeyDown}
                    disabled={isBusy}
                    tabIndex={0}
                    aria-label="Elegir impresora"
                    aria-haspopup="menu"
                    aria-expanded={isOpen}
                    className="w-11 h-11 flex items-center justify-center text-text-secondary border-l border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <span className="material-symbols-outlined text-[20px]">
                        {isOpen ? 'expand_less' : 'expand_more'}
                    </span>
                </button>
            </div>

            {/* Menú desplegable con la Lista_Impresoras_Registradas */}
            {isOpen && (
                <div
                    role="menu"
                    aria-label="Elegir impresora"
                    onKeyDown={handleMenuKeyDown}
                    className="absolute left-0 right-0 bottom-full mb-2 z-20 bg-white dark:bg-gray-800 rounded-xl border-2 border-emerald-600 dark:border-emerald-500 shadow-2xl ring-1 ring-black/5 overflow-hidden"
                >
                    <p className="px-3 py-2.5 text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-100 dark:border-emerald-900/50">
                        Elegir impresora
                    </p>
                    {printers.map((printer, index) => {
                        const isDefault = printer.name === defaultTicket;
                        const isConnected = statusFor(printer.name) === 'connected';
                        const isActive = index === activeIndex;

                        return (
                            <button
                                key={printer.name}
                                type="button"
                                role="menuitem"
                                onClick={() => handleSelectPrinter(printer.name)}
                                disabled={!isConnected}
                                tabIndex={0}
                                aria-label={
                                    isConnected
                                        ? `Imprimir ticket en ${printer.name}`
                                        : `${printer.name} no disponible`
                                }
                                aria-disabled={!isConnected}
                                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-b border-gray-100 dark:border-gray-700 last:border-b-0 ${
                                    isActive ? 'bg-gray-50 dark:bg-gray-700' : ''
                                } ${
                                    isConnected
                                        ? 'hover:bg-gray-50 hover:text-emerald-700 dark:hover:bg-gray-700'
                                        : 'opacity-50 cursor-not-allowed'
                                }`}
                            >
                                <span
                                    className={`material-symbols-outlined text-[18px] ${
                                        isConnected ? 'text-emerald-600' : 'text-gray-400'
                                    }`}
                                >
                                    print
                                </span>
                                <span className="flex-1 text-sm font-semibold text-text-main dark:text-white truncate">
                                    {printer.name}
                                </span>
                                {isDefault && (
                                    <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-0.5">
                                        <span className="material-symbols-outlined text-[14px]">check</span>
                                        Predet.
                                    </span>
                                )}
                                {!isConnected && (
                                    <span className="text-[11px] font-medium text-gray-400">no disponible</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export { PrinterSplitButton };
export default PrinterSplitButton;
