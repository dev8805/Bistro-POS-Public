import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ConfiguracionImpresoras,
    EstadoConexion,
    ImpresoraRegistrada,
    RolImpresion,
} from '../lib/printerRegistry';
import {
    getRegisteredPrinters,
    getDefaultPrinter,
    setDefaultPrinter,
    getPrinterStatusFor,
    getPrinterStatus,
    onConfigChange,
    onPrinterStatusChange,
    listPrinters,
    registerPrinter,
    unregisterPrinter,
} from '../lib/thermalPrinterService';

// PrinterStatus no se exporta del servicio: lo derivamos de getPrinterStatus
// para no acoplar el hook a un type interno.
type PrinterStatus = ReturnType<typeof getPrinterStatus>;

export interface UsePrintersResult {
    printers: ImpresoraRegistrada[];
    defaultTicket: string | null;
    defaultComanda: string | null;
    statusTicket: EstadoConexion;     // estado de la predeterminada TICKET
    statusComanda: EstadoConexion;    // estado de la predeterminada COMANDA
    statusFor: (name: string) => EstadoConexion;  // estado de cualquier impresora
    globalStatus: PrinterStatus;      // resultado de getPrinterStatus()
    listQzPrinters: () => Promise<string[]>;
    addPrinter: (name: string) => Promise<{ ok: boolean; alreadyExisted: boolean }>;
    removePrinter: (name: string) => Promise<boolean>;
    setDefault: (role: RolImpresion, name: string) => boolean;
    getDefault: (role: RolImpresion) => string | null;
}

// Lee la configuración vigente del servicio para el primer render (sin fetching
// en el componente; el servicio ya tiene la config cargada de localStorage).
const readConfigSnapshot = (): ConfiguracionImpresoras => ({
    printers: getRegisteredPrinters(),
    defaultTicket: getDefaultPrinter('TICKET'),
    defaultComanda: getDefaultPrinter('COMANDA'),
});

/**
 * Hook que expone a la UI la Lista_Impresoras_Registradas, las predeterminadas
 * por rol y el Estado_Conexión, más las acciones de gestión. Encapsula toda la
 * suscripción al Servicio_Impresión: ningún componente hace fetching ni mantiene
 * estado disperso.
 *
 * - La config (lista + predeterminadas) se alimenta de `onConfigChange`.
 * - El Estado_Conexión se alimenta de `onPrinterStatusChange`.
 * - `statusTicket`/`statusComanda` se derivan con `useMemo` (no con `useEffect`),
 *   recalculando cuando cambian las predeterminadas o llega un cambio de estado.
 */
export const usePrinters = (): UsePrintersResult => {
    // Estado de la config (lista + predeterminadas). Inicializa con el snapshot
    // actual del servicio para tener datos válidos en el primer render.
    const [config, setConfig] = useState<ConfiguracionImpresoras>(readConfigSnapshot);

    // Estado global agregado de conexión. El estado por impresora vive en el
    // servicio (Map); aquí guardamos el agregado y un "tick" que se incrementa
    // en cada notificación para forzar el recálculo de los useMemo derivados.
    const [globalStatus, setGlobalStatus] = useState<PrinterStatus>(() => getPrinterStatus());
    const [statusTick, setStatusTick] = useState(0);

    // Suscripción a cambios de la config (alta/baja/predeterminadas). Cleanup en
    // el return para evitar fugas de listeners.
    useEffect(() => {
        const unsubscribe = onConfigChange((next) => {
            setConfig({
                printers: next.printers,
                defaultTicket: next.defaultTicket,
                defaultComanda: next.defaultComanda,
            });
        });
        // Re-sincroniza por si la config cambió entre el primer render y el mount.
        setConfig(readConfigSnapshot());
        return unsubscribe;
    }, []);

    // Suscripción a cambios de Estado_Conexión. Guarda el agregado y avanza el
    // tick para que statusTicket/statusComanda/statusFor se recalculen.
    useEffect(() => {
        const unsubscribe = onPrinterStatusChange((status) => {
            setGlobalStatus(status);
            setStatusTick((prev) => prev + 1);
        });
        return unsubscribe;
    }, []);

    // Estado de la predeterminada TICKET. El estado real por impresora se lee del
    // servicio dentro del useMemo; statusTick fuerza el recálculo ante eventos.
    const statusTicket = useMemo<EstadoConexion>(
        () => (config.defaultTicket ? getPrinterStatusFor(config.defaultTicket) : 'unknown'),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [config.defaultTicket, statusTick],
    );

    const statusComanda = useMemo<EstadoConexion>(
        () => (config.defaultComanda ? getPrinterStatusFor(config.defaultComanda) : 'unknown'),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [config.defaultComanda, statusTick],
    );

    // Estado de cualquier impresora por nombre. Depende de statusTick para que
    // los consumidores se re-evalúen cuando cambia el estado físico.
    const statusFor = useCallback(
        (name: string): EstadoConexion => getPrinterStatusFor(name),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [statusTick],
    );

    // ---- Acciones (identidad estable vía useCallback) ----

    const listQzPrinters = useCallback((): Promise<string[]> => listPrinters(), []);

    const addPrinter = useCallback(
        async (name: string): Promise<{ ok: boolean; alreadyExisted: boolean }> =>
            registerPrinter(name),
        [],
    );

    const removePrinter = useCallback(
        async (name: string): Promise<boolean> => unregisterPrinter(name),
        [],
    );

    const setDefault = useCallback(
        (role: RolImpresion, name: string): boolean => setDefaultPrinter(role, name),
        [],
    );

    const getDefault = useCallback(
        (role: RolImpresion): string | null => getDefaultPrinter(role),
        [],
    );

    return {
        printers: config.printers,
        defaultTicket: config.defaultTicket,
        defaultComanda: config.defaultComanda,
        statusTicket,
        statusComanda,
        statusFor,
        globalStatus,
        listQzPrinters,
        addPrinter,
        removePrinter,
        setDefault,
        getDefault,
    };
};

export default usePrinters;
