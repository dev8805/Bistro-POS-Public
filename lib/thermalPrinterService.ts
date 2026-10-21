// @ts-nocheck
import qz from 'qz-tray';
import { ReceiptData, ShiftReportData } from '../types';
import { setupQzSecurity } from './qzSigning';
import { consolidateReceiptItems } from './receiptUtils';
import { formatPaymentMethodLabel } from './paymentMethods';
import {
    ConfiguracionImpresoras,
    EstadoConexion,
    ImpresoraRegistrada,
    RolImpresion,
    loadPrinterConfig,
    getDefaultForRole,
    aggregateStatus,
    addPrinter,
    removePrinter,
    setDefault,
    savePrinterList,
    saveDefault,
} from './printerRegistry';

type PrinterStatus = 'disconnected' | 'connecting' | 'connected';
type StatusListener = (status: PrinterStatus) => void;

let printerLanguage: string = 'esc-pos';
let printerCodepageMapping: string = 'epson';

// Estado de módulo (refactor multi-impresora):
// - `config` es la configuración cargada del registro: Lista_Impresoras_Registradas
//   + Impresora_Predeterminada por rol (TICKET / COMANDA).
// - `printerStatuses` guarda el Estado_Conexión por nombre de impresora, en vez
//   de un único `currentStatus` global.
let config: ConfiguracionImpresoras = loadPrinterConfig().config;
const printerStatuses: Map<string, EstadoConexion> = new Map();
const statusListeners: Set<StatusListener> = new Set();

// Suscriptores a cambios de la `config` (lista + predeterminadas). Se separan
// de los `statusListeners` (estado de conexión) porque responden a eventos
// distintos: aquí se notifica cada vez que cambia la composición de la lista o
// una predeterminada por rol (registerPrinter, unregisterPrinter,
// setDefaultPrinter y el registro implícito de connectPrinter).
type ConfigListener = (config: ConfiguracionImpresoras) => void;
const configListeners: Set<ConfigListener> = new Set();

// Emite la `config` vigente a todos los suscriptores de onConfigChange.
const notifyConfigListeners = () => {
    configListeners.forEach(fn => fn(config));
};

const UNIT_ABBR: Record<string, string> = {
    'Kilogramos': 'Kg', 'Libras': 'Lb', 'Gramos': 'g', 'Onzas': 'Oz',
    'Litros': 'Lt', 'Mililitros': 'ml', 'Galones': 'Gal', 'Metros': 'm', 'Centímetros': 'cm',
};

const formatCurrency = (amount: number): string =>
    new Intl.NumberFormat('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

/**
 * Quita tildes y diacríticos del texto que va a la impresora térmica
 * (Ó→O, é→e, ñ→n, ü→u). Las impresoras de firmware chino ignoran el comando
 * de code page (ESC t) y quedan en GBK: ahí los bytes altos salen como glifos
 * chinos o "?". Enviar solo ASCII (< 0x80) garantiza impresión correcta en
 * cualquier impresora, sin depender de su tabla de caracteres.
 * No afecta pantalla, PDF ni WhatsApp, que sí soportan UTF-8.
 */
const stripDiacritics = (text: unknown): string =>
    typeof text === 'string' ? text.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : (text as string);

/**
 * Crea el encoder ESC/POS y envuelve sus métodos de texto (line/text/table)
 * para transliterar a ASCII automáticamente. Al centralizarlo aquí, ningún
 * texto —literal o dinámico— se escapa de la limpieza.
 */
const createSanitizedEncoder = async (columns: number) => {
    const { default: ReceiptPrinterEncoder } = await import('@point-of-sale/receipt-printer-encoder');
    const encoder = new ReceiptPrinterEncoder({
        language: printerLanguage,
        codepageMapping: printerCodepageMapping,
        columns,
    });

    const originalLine = encoder.line.bind(encoder);
    const originalText = encoder.text.bind(encoder);
    const originalTable = encoder.table.bind(encoder);

    encoder.line = (value: string) => originalLine(stripDiacritics(value));
    encoder.text = (value: string) => originalText(stripDiacritics(value));
    encoder.table = (columnsDef: unknown[], rows: unknown[][]) => originalTable(
        columnsDef,
        rows.map((row) => row.map((cell) => (typeof cell === 'string' ? stripDiacritics(cell) : cell)))
    );

    return encoder;
};

// Mapea el Estado_Conexión interno (incluye 'unknown') al PrinterStatus público.
const toPrinterStatus = (estado: EstadoConexion): PrinterStatus =>
    estado === 'connected' ? 'connected' : estado === 'connecting' ? 'connecting' : 'disconnected';

// Estado global agregado de todas las impresoras vigiladas (preserva el presence).
const aggregateStatuses = (): EstadoConexion => aggregateStatus([...printerStatuses.values()]);

// Notifica a los suscriptores con el estado global agregado.
const notifyStatusListeners = () => {
    const aggregate = toPrinterStatus(aggregateStatuses());
    statusListeners.forEach(fn => fn(aggregate));
};

// Fija el Estado_Conexión de una impresora puntual y notifica el agregado.
const setPrinterStatus = (name: string, status: EstadoConexion) => {
    if (!name) return;
    printerStatuses.set(name, status);
    notifyStatusListeners();
};

// Pone todas las impresoras vigiladas en 'disconnected' (p. ej. cierre de WebSocket),
// conservando intacta la `config` (lista + predeterminadas).
const markAllDisconnected = () => {
    if (printerStatuses.size === 0) return;
    printerStatuses.forEach((_, name) => printerStatuses.set(name, 'disconnected'));
    notifyStatusListeners();
};

// Registra una impresora en la configuración y persiste la lista (efecto acotado
// a localStorage vía el registro). No toca la cola de sincronización offline.
const registerPrinterInternal = (name: string) => {
    const { config: next } = addPrinter(config, name);
    config = next;
    savePrinterList(config.printers);
    notifyConfigListeners();
};

// Resuelve el destino de impresión de un rol: el override explícito, o si no se
// indica, la Impresora_Predeterminada de ese rol. Devuelve `null` si no hay destino.
const resolveTarget = (role: RolImpresion, override?: string): string | null =>
    override ?? getDefaultForRole(config, role);

// ============ QZ TRAY CONNECTION ============

// QZ Tray security — firmado con certificado autofirmado de Bistro POS.
// Suprime el diálogo "Untrusted website" en cada impresión. Ver lib/qzSigning.ts.
setupQzSecurity(qz);

// Si el WebSocket con QZ se cierra de forma inesperada (QZ cerrado, equipo
// suspendido, etc.) reflejamos el estado real para que el presence de realtime
// se actualice. No borramos la impresora guardada: así se puede reconectar.
qz.websocket.setClosedCallbacks(() => {
    console.log('[Printer] WebSocket QZ cerrado');
    // Todas las impresoras pasan a 'disconnected'; la config (lista + predeterminadas)
    // se conserva intacta para poder reconectar.
    markAllDisconnected();
});

// ============ ESTADO FÍSICO DE LA IMPRESORA (QZ printer listener) ============
//
// El WebSocket app↔QZ puede seguir vivo aunque el cable USB esté fuera. Para
// reflejar la presencia física real escuchamos los eventos de estado que QZ
// reporta desde el spooler de Windows. Así, si se desenchufa la impresora,
// su entrada en `printerStatuses` pasa a 'disconnected' y la UI (botones,
// presence de comandas) reacciona sola — y dejamos de mandar trabajos que
// quedarían en cola fantasma.

// Estados que indican que la impresora ya no está físicamente disponible.
const OFFLINE_STATUSES = ['OFFLINE', 'NOT_AVAILABLE', 'PENDING_DELETION'];
// Estados sanos/transitorios normales de impresión (no son desconexión).
const ONLINE_STATUSES = ['OK', 'IDLE', 'IO_ACTIVE', 'PRINTING', 'PROCESSING', 'SPOOLING', 'BUSY', 'WAITING'];

// Resolvers en espera de una verificación física puntual (probePrinterReachable).
let statusProbeResolvers: ((online: boolean | null) => void)[] = [];

// QZ invoca esto en cada cambio de estado de la impresora vigilada.
const handlePrinterStatusEvent = (event: any) => {
    if (!event || !event.printerName) return;
    const name = String(event.printerName);

    const status = String(event.status ?? event.statusText ?? '').toUpperCase();
    if (!status) return;

    const isOffline = OFFLINE_STATUSES.some(s => status.includes(s));
    const isOnline = ONLINE_STATUSES.some(s => status === s || status.includes(s));
    const current = printerStatuses.get(name);

    if (isOffline && current === 'connected') {
        console.log('[Printer] Impresora física OFFLINE:', name, status);
        // No quitamos la impresora de la config: así se reanuda sola al reconectar.
        setPrinterStatus(name, 'disconnected');
    } else if (isOnline && current !== 'connected') {
        console.log('[Printer] Impresora física de vuelta ONLINE:', name, status);
        setPrinterStatus(name, 'connected');
    }

    // Resolver cualquier verificación puntual pendiente con una señal definitiva.
    if ((isOffline || isOnline) && statusProbeResolvers.length > 0) {
        const reachable = isOnline && !isOffline;
        const pending = statusProbeResolvers;
        statusProbeResolvers = [];
        pending.forEach(resolve => resolve(reachable));
    }
};

/**
 * Verifica de forma puntual si la impresora seleccionada está físicamente
 * disponible, consultando el estado real al spooler vía QZ.
 * @returns true = disponible, false = desconectada, null = desconocido (sin
 * respuesta a tiempo o sin impresora seleccionada). Útil antes de imprimir
 * tras una (re)conexión, donde el evento de estado aún no llegó.
 */
export const probePrinterReachable = (timeoutMs = 1500, name?: string): Promise<boolean | null> => {
    const target = name ?? resolveTarget('TICKET') ?? resolveTarget('COMANDA');
    if (!target) return Promise.resolve(null);
    return new Promise(resolve => {
        let done = false;
        const finish = (value: boolean | null) => {
            if (done) return;
            done = true;
            statusProbeResolvers = statusProbeResolvers.filter(r => r !== finish);
            resolve(value);
        };
        statusProbeResolvers.push(finish);
        qz.printers.getStatus().catch(() => finish(null));
        setTimeout(() => finish(null), timeoutMs);
    });
};

// Suscribe los eventos de estado de una impresora concreta. Idempotente:
// se puede llamar en cada (re)conexión sin efectos secundarios.
const startStatusListener = async (printerName: string) => {
    if (!printerName) return;
    try {
        qz.printers.setPrinterCallbacks(handlePrinterStatusEvent);
        await qz.printers.startListening(printerName);
        // Pide el estado actual de inmediato (se entrega por el callback).
        qz.printers.getStatus().catch(() => { /* sin listeners activos */ });
    } catch (err) {
        console.warn('[Printer] No se pudo iniciar el listener de estado:', err);
    }
};

// Evita colisiones cuando varias pantallas piden conectar a la vez:
// se reutiliza una única conexión "en vuelo".
let connectingPromise: Promise<boolean> | null = null;

const ensureQzConnected = async (): Promise<boolean> => {
    if (qz.websocket.isActive()) {
        return true;
    }
    if (connectingPromise) {
        return connectingPromise;
    }
    connectingPromise = (async () => {
        try {
            console.log('[Printer] Intentando conectar QZ WebSocket...');
            await qz.websocket.connect();
            console.log('[Printer] ✅ Conectado a QZ Tray');
            return true;
        } catch (err) {
            // Si otra llamada lo conectó mientras tanto, lo damos por bueno.
            if (qz.websocket.isActive()) return true;
            console.error('[Printer] ❌ No se pudo conectar a QZ Tray:', err);
            return false;
        } finally {
            connectingPromise = null;
        }
    })();
    return connectingPromise;
};

/**
 * Lists available printers from QZ Tray.
 */
export const listPrinters = async (): Promise<string[]> => {
    console.log('[Printer] listPrinters() llamado');
    const connected = await ensureQzConnected();
    console.log('[Printer] QZ conectado?', connected);
    if (!connected) return [];
    try {
        console.log('[Printer] Llamando qz.printers.find()...');
        const printers = await qz.printers.find();
        console.log('[Printer] Impresoras disponibles:', printers);
        return Array.isArray(printers) ? printers : [printers];
    } catch (err) {
        console.error('[Printer] Error listando impresoras:', err);
        return [];
    }
};

/**
 * Connects to a printer by name. If no name given, tries stored printer
 * or shows a prompt to select one.
 */
export const connectPrinter = async (printerName?: string): Promise<boolean> => {
    try {
        console.log('[Printer] connectPrinter() llamado');

        const qzOk = await ensureQzConnected();
        if (!qzOk) {
            return false;
        }

        // If no printer name given, list printers and let user pick
        if (!printerName) {
            const printers = await listPrinters();
            if (printers.length === 0) {
                console.log('[Printer] No se encontraron impresoras');
                return false;
            }

            // Try to find POS-80C or similar thermal printer automatically
            const thermal = printers.find(p =>
                /pos|thermal|receipt|80|58/i.test(p)
            );
            printerName = thermal || printers[0];
        }

        setPrinterStatus(printerName, 'connecting');

        // Verify the printer exists
        const found = await qz.printers.find(printerName);
        if (!found) {
            console.log('[Printer] Impresora no encontrada:', printerName);
            setPrinterStatus(printerName, 'disconnected');
            return false;
        }

        const resolvedName = typeof found === 'string' ? found : printerName;
        registerPrinterInternal(resolvedName);

        console.log('[Printer] ✅ Impresora conectada:', resolvedName);
        setPrinterStatus(resolvedName, 'connected');
        startStatusListener(resolvedName);
        return true;
    } catch (err: any) {
        console.error('[Printer] Error en connectPrinter:', err);
        if (printerName) setPrinterStatus(printerName, 'disconnected');
        return false;
    }
};

export const reconnectPrinter = async (): Promise<boolean> => {
    // Reconectamos TODAS las impresoras registradas, pero priorizando la
    // predeterminada de COMANDA: así el dispositivo se anuncia cuanto antes en
    // el presence de realtime (Req 13.3) y los demás equipos lo ven disponible
    // para enviarle comandas sin esperar al resto de impresoras.
    const comandaDefault = getDefaultForRole(config, 'COMANDA');
    const targets = config.printers
        .map(p => p.name)
        .sort((a, b) => {
            if (a === comandaDefault) return -1;
            if (b === comandaDefault) return 1;
            return 0;
        });
    if (targets.length === 0) {
        console.log('[Printer] reconnect: No hay impresoras registradas');
        return false;
    }

    try {
        const qzOk = await ensureQzConnected();
        if (!qzOk) {
            markAllDisconnected();
            return false;
        }

        let anyConnected = false;
        for (const name of targets) {
            console.log('[Printer] reconnect: Intentando reconectar a:', name);
            setPrinterStatus(name, 'connecting');

            const found = await qz.printers.find(name);
            if (!found) {
                console.log('[Printer] reconnect: Impresora no encontrada:', name);
                setPrinterStatus(name, 'disconnected');
                continue;
            }

            const resolvedName = typeof found === 'string' ? found : name;
            console.log('[Printer] ✅ Reconectada a:', resolvedName);
            setPrinterStatus(resolvedName, 'connected');
            startStatusListener(resolvedName);
            anyConnected = true;
        }

        return anyConnected;
    } catch (err) {
        console.error('[Printer] Error en reconnect:', err);
        markAllDisconnected();
        return false;
    }
};

export const disconnectPrinter = async (): Promise<void> => {
    markAllDisconnected();
    console.log('[Printer] Desconectada');
};

export const getPrinterStatus = (): PrinterStatus => toPrinterStatus(aggregateStatuses());

export const onPrinterStatusChange = (listener: StatusListener): (() => void) => {
    statusListeners.add(listener);
    return () => { statusListeners.delete(listener); };
};

export const isWebSerialSupported = (): boolean => true; // QZ Tray works everywhere
export const isWebUSBSupported = isWebSerialSupported; // Backwards compat alias

/**
 * Sends raw ESC/POS bytes to a specific printer via QZ Tray.
 * El destino llega por parámetro (antes salía de la variable global única).
 */
const sendToQzPrinter = async (data: Uint8Array, printerName: string): Promise<boolean> => {
    if (!printerName) {
        console.log('[Printer] No hay impresora destino');
        return false;
    }

    const qzOk = await ensureQzConnected();
    if (!qzOk) return false;

    try {
        const cfg = qz.configs.create(printerName, { encoding: 'ISO-8859-1' });

        // Convert Uint8Array to hex string for QZ Tray
        const hexData = Array.from(data)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        await qz.print(cfg, [{
            type: 'raw',
            format: 'command',
            flavor: 'hex',
            data: hexData,
        }]);

        return true;
    } catch (err) {
        console.error('[Printer] ❌ Error enviando a QZ Tray:', err);
        return false;
    }
};

// ============ RECEIPT PRINTING ============

export const printReceiptDirect = async (
    data: ReceiptData,
    paperWidth: '58mm' | '80mm' = '80mm',
    targetPrinter?: string
): Promise<boolean> => {
    const target = resolveTarget('TICKET', targetPrinter);
    console.log('[Printer] printReceiptDirect llamado. Target:', target);
    if (!target) {
        console.log('[Printer] No se puede imprimir: sin impresora de ticket');
        return false;
    }

    try {
        console.log('[Printer] Codificando recibo ESC/POS...');

        const is58 = paperWidth === '58mm';
        const columns = is58 ? 32 : 48;

        const encoder = await createSanitizedEncoder(columns);

        encoder.align('center');
        encoder.bold(true);
        encoder.line(data.businessName.toUpperCase());
        encoder.bold(false);

        if (data.businessNit) encoder.line(`NIT: ${data.businessNit}`);
        if (data.businessAddress) encoder.line(data.businessAddress);
        if (data.businessPhone) encoder.line(`Tel: ${data.businessPhone}`);

        encoder.align('left');
        encoder.line('='.repeat(columns));

        encoder.bold(true);
        encoder.text('Fecha: ');
        encoder.bold(false);
        encoder.line(data.date);

        if (data.displayNumber || data.orderNumber) {
            encoder.bold(true);
            encoder.text('Orden: ');
            encoder.bold(false);
            encoder.line(String(data.displayNumber || data.orderNumber));
        }

        encoder.bold(true);
        encoder.text('Cliente: ');
        encoder.bold(false);
        encoder.line(data.customerName || 'Consumidor Final');

        const doc = data.customerDocument || '222222222222';
        encoder.bold(true);
        encoder.text('Documento: ');
        encoder.bold(false);
        encoder.line(doc);

        const cantWidth = is58 ? 5 : 8;
        const vUnidWidth = is58 ? 8 : 9;
        const vProdWidth = is58 ? 8 : 9;
        const prodWidth = columns - cantWidth - vUnidWidth - vProdWidth;

        encoder.line('-'.repeat(columns));
        encoder.bold(true);
        encoder.table(
            [
                { width: prodWidth, align: 'left' },
                { width: cantWidth, align: 'right' },
                { width: vUnidWidth, align: 'right' },
                { width: vProdWidth, align: 'right' },
            ],
            [
                ['Producto', 'Cant.', 'V.unit', 'V.prod'],
            ]
        );
        encoder.bold(false);
        encoder.line('-'.repeat(columns));

        // Consolidar filas idénticas del mismo producto en una sola (solo para el ticket impreso)
        const receiptItems = consolidateReceiptItems(data.items);

        receiptItems.forEach(item => {
            const cleanName = item.name.replace(/🏷️\s*/g, '');
            let unitAbbr = item.unit && item.unit !== 'Unidad' && item.unit !== 'Und'
                ? (UNIT_ABBR[item.unit] || item.unit) : 'un';
            unitAbbr = unitAbbr.substring(0, 2).toLowerCase();
            const qty = Math.round(item.quantity * 100) / 100;
            const qtyFormatted = qty.toString().replace('.', ',');
            const unitPriceFormated = `$${formatCurrency(item.unitPrice)}`;
            const totalFormated = `$${formatCurrency(item.total)}`;
            const qtyUnit = is58 && qtyFormatted.length > 1 ? `${qtyFormatted}${unitAbbr}` : `${qtyFormatted} ${unitAbbr}`;

            encoder.table(
                [
                    { width: prodWidth, align: 'left' },
                    { width: cantWidth, align: 'right' },
                    { width: vUnidWidth, align: 'right' },
                    { width: vProdWidth, align: 'right' },
                ],
                [
                    [cleanName, qtyUnit, unitPriceFormated, totalFormated],
                ]
            );

            if (item.discount || item.discountPercent) {
                const discAmount = item.discount || (item.discountPercent! * item.unitPrice * item.quantity / 100);
                const discLabel = `  Dcto${item.discountPercent ? ` ${item.discountPercent}%` : ''}`;
                encoder.table(
                    [
                        { width: prodWidth + cantWidth + vUnidWidth, align: 'left' },
                        { width: vProdWidth, align: 'right' },
                    ],
                    [
                        [discLabel, `-$${formatCurrency(discAmount)}`],
                    ]
                );
            }
        });

        encoder.line('-'.repeat(columns));

        const printRow = (label: string, value: string) => {
            encoder.table(
                [
                    { width: columns - value.length - 1, align: 'left' },
                    { width: value.length, align: 'right' },
                ],
                [[label, value]]
            );
        };

        printRow('Subtotal:', `$${formatCurrency(data.subtotal)}`);
        if (data.totalDiscount > 0) {
            printRow('Desc:', `-$${formatCurrency(data.totalDiscount)}`);
        }
        if (data.roundingAdjustment !== undefined && data.roundingAdjustment !== 0) {
            const sign = data.roundingAdjustment > 0 ? '+' : '-';
            printRow('Ajuste:', `${sign}$${formatCurrency(Math.abs(data.roundingAdjustment))}`);
        }

        encoder.line('='.repeat(columns));
        encoder.bold(true);
        printRow('TOTAL:', `$${formatCurrency(data.total)}`);
        encoder.bold(false);
        encoder.line('='.repeat(columns));

        if (data.splitPayments && data.splitPayments.length > 0) {
            encoder.bold(true);
            encoder.line('MÉTODOS DE PAGO:');
            encoder.bold(false);
            data.splitPayments.forEach(sp => {
                printRow(`- ${sp.method}`, `$${formatCurrency(sp.amount)}`);
            });
        } else {
            encoder.bold(true);
            printRow('Método de pago:', data.paymentMethod);
            encoder.bold(false);
            if (data.amountPaid !== undefined && data.amountPaid > 0) {
                printRow('Pagado:', `$${formatCurrency(data.amountPaid)}`);
            }
            if (data.change !== undefined && data.change > 0) {
                printRow('Cambio:', `$${formatCurrency(data.change)}`);
            }
        }

        if (data.creditAbono !== undefined && data.creditAbono > 0) {
            printRow('Abono inicial:', `$${formatCurrency(data.creditAbono)}`);
            if (data.creditAbonoMethod) {
                printRow('  Medio:', data.creditAbonoMethod);
            }
            const saldo = Math.max(0, data.total - data.creditAbono);
            encoder.bold(true);
            printRow('Saldo pendiente:', `$${formatCurrency(saldo)}`);
            encoder.bold(false);
        }

        encoder.line('='.repeat(columns));

        encoder.align('center');
        encoder.line('Comprobante de entrega');
        if (data.sellerName) {
            encoder.line(`Atendido por: ${data.sellerName}`);
        }
        encoder.line('Gracias por su compra!');

        encoder.newline();
        encoder.newline();
        encoder.newline();
        encoder.newline();
        encoder.newline();
        encoder.newline();
        encoder.cut();

        const result = encoder.encode();
        console.log('[Printer] Enviando', result.length, 'bytes a la impresora...');
        const ok = await sendToQzPrinter(result, target);
        if (!ok) return false;
        console.log('[Printer] ✅ Datos enviados exitosamente');

        return true;
    } catch (err) {
        console.error('[Printer] ❌ Error imprimiendo:', err);
        return false;
    }
};

// ============ PAYROLL / ADVANCE PRINTING ============

export const printPayrollReceiptDirect = async (
    data: any,
    paperWidth: '58mm' | '80mm' = '80mm',
    targetPrinter?: string
): Promise<boolean> => {
    const target = resolveTarget('TICKET', targetPrinter);
    if (!target) {
        console.log('[Printer] No se puede imprimir: sin impresora de ticket');
        return false;
    }

    try {
        const is58 = paperWidth === '58mm';
        const columns = is58 ? 32 : 48;
        const encoder = await createSanitizedEncoder(columns);

        encoder.align('center');
        encoder.bold(true);
        encoder.line(data.businessName.toUpperCase());
        encoder.bold(false);

        if (data.businessNit) encoder.line(`NIT: ${data.businessNit}`);
        if (data.businessAddress) encoder.line(data.businessAddress);
        if (data.businessPhone) encoder.line(`Tel: ${data.businessPhone}`);

        encoder.align('left');
        encoder.line('='.repeat(columns));

        encoder.align('center');
        encoder.bold(true);
        const title = data.payrollConcept === 'advance' ? 'VALE DE ANTICIPO' : 'COMPROBANTE DE PAGO';
        encoder.line(title);
        encoder.bold(false);
        encoder.align('left');

        encoder.line('='.repeat(columns));
        encoder.line(`Fecha: ${data.date}`);
        if (data.receiptNumber) encoder.line(`No: ${data.receiptNumber}`);
        encoder.bold(true);
        encoder.line(`Colaborador: ${data.employeeName}`);
        encoder.bold(false);
        if (data.employeeDocument) encoder.line(`C.C./Doc: ${data.employeeDocument}`);
        if (data.employeeJobTitle) encoder.line(`Cargo: ${data.employeeJobTitle}`);
        encoder.line(`Medio: ${formatPaymentMethodLabel(data.paymentMethod).toUpperCase()}`);

        encoder.line('-'.repeat(columns));

        const printRow = (label: string, value: string) => {
            encoder.table(
                [
                    { width: columns - value.length - 1, align: 'left' },
                    { width: value.length, align: 'right' },
                ],
                [[label, value]]
            );
        };

        encoder.bold(true);
        printRow('Devengado / Monto:', `$${formatCurrency(data.grossAmount)}`);
        encoder.bold(false);
        encoder.line(`Detalle: ${data.conceptDescription}`);

        if (data.advancesDeducted && data.advancesDeducted.length > 0) {
            encoder.line('-'.repeat(columns));
            encoder.line('DEDUCCIONES / VALES:');
            data.advancesDeducted.forEach((adv: any) => {
                printRow(`  ${adv.date} (${adv.reason || 'Vale'}):`, `-$${formatCurrency(adv.amount)}`);
            });
            encoder.line('-'.repeat(columns));
            printRow('Total Vales:', `-$${formatCurrency(data.totalDeductions)}`);
        }

        encoder.line('='.repeat(columns));
        encoder.bold(true);
        printRow('NETO PAGADO:', `$${formatCurrency(data.netAmount)}`);
        encoder.bold(false);
        encoder.line('='.repeat(columns));

        if (data.notes) {
            encoder.line(`Obs: ${data.notes}`);
            encoder.line('-'.repeat(columns));
        }

        encoder.align('center');
        encoder.line('Recibi a entera conformidad');
        encoder.line('el valor neto indicado.');
        encoder.newline();
        encoder.newline();
        encoder.line('________________________________');
        encoder.line(`Firma: ${data.employeeName}`);
        encoder.line(`C.C.: ${data.employeeDocument || '________________________'}`);

        encoder.newline();
        encoder.newline();
        encoder.newline();
        encoder.newline();
        encoder.cut();

        const result = encoder.encode();
        return await sendToQzPrinter(result, target);
    } catch (err) {
        console.error('[Printer] Error imprimiendo comprobante de nomina:', err);
        return false;
    }
};


// ============ KITCHEN COMMAND PRINTING ============

export interface KitchenCommandItem {
    name: string;
    quantity: number;
    notes?: string;
    cookingTerm?: string;
    removedIngredients?: string[];
    unit?: string;
}

export interface KitchenCommandData {
    orderNumber?: number;
    displayNumber?: string;
    tableName?: string;
    customerName?: string;
    items: KitchenCommandItem[];
    date: string;
    sellerName?: string;
    // Etiquetas rapidas elegidas en ComandaLabelModal (desde SuccessScreen/Sidebar
    // en modo Catalogo). Son OPCIONALES y se pueden combinar entre si.
    // Se imprimen encima del bloque "Orden: ..." para orientar a cocina.
    locatorLabel?: string;     // p. ej. "3"
    tableLabel?: string;       // p. ej. "5" (independiente de tableName de mesas del POS)
    takeawayLabel?: string;    // p. ej. "Para llevar", "Domicilio"
}

export const printKitchenCommandDirect = async (
    data: KitchenCommandData,
    paperWidth: '58mm' | '80mm' = '80mm',
    targetPrinter?: string
): Promise<boolean> => {
    const target = resolveTarget('COMANDA', targetPrinter);
    console.log('[Printer] printKitchenCommandDirect llamado. Target:', target);
    if (!target) {
        console.log('[Printer] No se puede imprimir comanda: sin impresora de comanda');
        return false;
    }

    try {
        const is58 = paperWidth === '58mm';
        const columns = is58 ? 32 : 48;

        const encoder = await createSanitizedEncoder(columns);

        // Header
        encoder.align('center');
        encoder.bold(true);
        encoder.line('*** COMANDA ***');
        encoder.bold(false);
        encoder.newline();

        // ===== HEADER =====
        // Layout vertical simple, pegado al margen izquierdo. Se muestra en
        // este orden (solo las que aplican):
        //   Orden: {número}       (si viene desde Orden Rápida; en Mesas no aplica)
        //   Mesa: {mesa POS}      (si la venta viene de una mesa)
        //   Cliente: {nombre}     (si el cajero asignó cliente)
        //   Hora: {HH:mm}         (siempre)
        //   Cajero: {nombre}      (si hay vendedor)
        // Las etiquetas del ComandaLabelModal (Localizador/Mesa/Tipo de pedido)
        // ya no van en el header: se imprimen en el pie de la comanda para
        // que sean lo último que la cocina lee.
        encoder.align('left');
        if (data.displayNumber || data.orderNumber) {
            encoder.line(`Orden: ${data.displayNumber || data.orderNumber}`);
        }
        if (data.tableName) {
            encoder.line(`Mesa: ${data.tableName}`);
        }
        if (data.customerName && data.customerName !== 'Consumidor Final') {
            encoder.line(`Cliente: ${data.customerName}`);
        }
        encoder.line(`Hora: ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`);
        if (data.sellerName) {
            encoder.line(`Cajero: ${data.sellerName}`);
        }

        encoder.line('='.repeat(columns));

        // Items
        data.items.forEach((item, index) => {
            const cleanName = item.name.replace(/🏷️\s*/g, '');
            const qty = Math.round(item.quantity * 100) / 100;
            const unitAbbr = item.unit && item.unit !== 'Unidad' && item.unit !== 'Und'
                ? (UNIT_ABBR[item.unit] || item.unit) : '';
            const qtyStr = unitAbbr ? `${qty}${unitAbbr}` : `${qty}`;

            // Producto: ancho normal + alto x2 (alto doble para 50+, una sola línea sin cortar)
            encoder.height(2);
            encoder.line(`${qtyStr}x ${cleanName}`);
            encoder.height(1);

            // Modificaciones: mismo tamaño que el producto (ancho normal + alto x2)
            if (item.cookingTerm) {
                encoder.height(2);
                encoder.line(`  >> ${item.cookingTerm}`);
                encoder.height(1);
            }

            if (item.removedIngredients && item.removedIngredients.length > 0) {
                encoder.height(2);
                item.removedIngredients.forEach(ing => {
                    encoder.line(`  SIN ${ing}`);
                });
                encoder.height(1);
            }

            if (item.notes) {
                encoder.height(2);
                encoder.line(`  * ${item.notes}`);
                encoder.height(1);
            }

            if (index < data.items.length - 1) {
                encoder.line('-'.repeat(columns));
            }
        });

        encoder.line('='.repeat(columns));

        // ===== PIE =====
        // Etiquetas del ComandaLabelModal en una sola línea centrada, en
        // mayúsculas, separadas por " · ". Mismo tamaño que tenían antes en
        // el header (altura x2 para que cocina las lea desde lejos).
        //
        // Estrategia de ancho: primero intentamos con la palabra completa
        // ("LOCALIZADOR N"). Si la línea no cabe en el ancho del papel,
        // caemos a la versión abreviada ("LOC N"). "MESA" ya es corta y no
        // se abrevia.
        //
        // Si el cajero no eligió ninguna etiqueta, la línea se omite
        // completamente. La antigua línea "N producto(s)" se eliminó a
        // favor de este resumen.
        const buildSummary = (useShortLocator: boolean): string => {
            const parts: string[] = [];
            const locatorPrefix = useShortLocator ? 'LOC' : 'LOCALIZADOR';
            if (data.locatorLabel) parts.push(`${locatorPrefix} ${data.locatorLabel}`);
            if (data.tableLabel) parts.push(`MESA ${data.tableLabel}`);
            if (data.takeawayLabel) parts.push(data.takeawayLabel.toUpperCase());
            return parts.join(' · ');
        };

        const summaryFull = buildSummary(false);
        if (summaryFull.length > 0) {
            const summary = summaryFull.length <= columns ? summaryFull : buildSummary(true);
            encoder.align('center');
            encoder.height(2);
            encoder.line(summary);
            encoder.height(1);
        }

        encoder.newline();
        encoder.newline();
        encoder.newline();
        encoder.newline();
        encoder.cut();

        const result = encoder.encode();
        console.log('[Printer] Enviando comanda', result.length, 'bytes...');
        const ok = await sendToQzPrinter(result, target);
        if (!ok) return false;
        console.log('[Printer] ✅ Comanda impresa exitosamente');

        return true;
    } catch (err) {
        console.error('[Printer] ❌ Error imprimiendo comanda:', err);
        return false;
    }
};

// ============ SHIFT REPORT PRINTING (REPORTE DIARIO) ============

export const printShiftReportDirect = async (
    data: ShiftReportData,
    paperWidth: '58mm' | '80mm' = '80mm',
    targetPrinter?: string
): Promise<boolean> => {
    const target = resolveTarget('TICKET', targetPrinter);
    console.log('[Printer] printShiftReportDirect llamado. Target:', target);
    if (!target) {
        console.log('[Printer] No se puede imprimir reporte: sin impresora de ticket');
        return false;
    }

    try {
        const is58 = paperWidth === '58mm';
        const columns = is58 ? 32 : 48;
        const encoder = await createSanitizedEncoder(columns);

        const fc = (n: number) => `$${formatCurrency(n)}`;
        const fcNeg = (n: number) => (n > 0 ? `-$${formatCurrency(n)}` : `$${formatCurrency(n)}`);

        // Imprime una fila etiqueta/valor justificada a los extremos.
        const printRow = (label: string, value: string, bold = false) => {
            const maxLabel = columns - value.length - 1;
            const safeLabel = label.length > maxLabel ? label.substring(0, maxLabel) : label;
            if (bold) encoder.bold(true);
            encoder.table(
                [
                    { width: columns - value.length, align: 'left' },
                    { width: value.length, align: 'right' },
                ],
                [[safeLabel, value]]
            );
            if (bold) encoder.bold(false);
        };

        // Encabezado
        encoder.align('center');
        encoder.bold(true);
        encoder.line(data.businessName.toUpperCase());
        encoder.bold(false);
        if (data.businessNit) encoder.line(`NIT: ${data.businessNit}`);
        if (data.businessAddress) encoder.line(data.businessAddress);
        if (data.businessPhone) encoder.line(`Tel: ${data.businessPhone}`);
        encoder.bold(true);
        encoder.line('REPORTE DIARIO');
        encoder.bold(false);

        encoder.align('left');
        encoder.line('='.repeat(columns));

        // Datos del turno
        printRow('Caja:', data.registerName);
        if (data.shiftNumber !== undefined) printRow('Turno #:', String(data.shiftNumber));
        if (data.cashierName) printRow('Vendedor:', data.cashierName);
        printRow('Apertura:', data.openedAt);
        if (data.closedAt) printRow('Cierre:', data.closedAt);
        if (data.closedByName) printRow('Cerrado por:', data.closedByName);

        encoder.line('-'.repeat(columns));

        // Movimiento de caja
        encoder.bold(true);
        encoder.line('MOVIMIENTO DE CAJA');
        encoder.bold(false);
        printRow('Base inicial de caja', fc(data.openingBalance));
        printRow('Efectivo', fc(data.cashSales));
        printRow('Otros ingresos efectivo', fc(data.cashIn));
        printRow('Retiro de efectivo', fcNeg(data.cashOut));
        printRow('Total de efectivo', fc(data.totalCash), true);
        printRow('Tarjetas', fc(data.cardSales));
        printRow('Pagos en linea', fc(data.onlineSales));
        printRow('Otros', fc(data.otherSales));

        encoder.line('-'.repeat(columns));

        // Valores ingresados por el cajero
        encoder.bold(true);
        encoder.line('VALORES INGRESADOS POR CAJERO');
        encoder.bold(false);
        printRow('Efectivo', fc(data.declaredCash));
        printRow('Tarjetas', fc(data.declaredCard));
        printRow('Pagos en linea', fc(data.declaredOnline));
        printRow('Otros', fc(data.declaredOther));

        encoder.line('-'.repeat(columns));

        // Resumen final
        encoder.bold(true);
        encoder.line('RESUMEN FINAL');
        encoder.bold(false);
        printRow('Total ingresado cierre', fc(data.totalDeclared));
        printRow('Total esperado cierre', fc(data.totalExpected));
        printRow('Diferencia', data.difference >= 0 ? fc(data.difference) : `-$${formatCurrency(Math.abs(data.difference))}`, true);
        printRow('Devoluciones', fcNeg(data.refunds));
        printRow('Retiros no efectivo', fcNeg(data.otherWithdrawals));
        printRow('Facturas a credito', fc(data.creditSales));

        // Salidas de efectivo
        if (data.cashOutflows && data.cashOutflows.length > 0) {
            encoder.line('-'.repeat(columns));
            encoder.bold(true);
            encoder.line('SALIDAS DE EFECTIVO');
            encoder.bold(false);
            for (const outflow of data.cashOutflows) {
                const valStr = fc(outflow.amount);
                const MARGIN = 2; // Margen de separación para evitar que el texto quede pegado al valor
                const titleWidth = columns - valStr.length - MARGIN;
                if (outflow.title.length <= titleWidth) {
                    printRow(outflow.title, valStr);
                } else {
                    encoder.table(
                        [
                            { width: titleWidth, align: 'left' },
                            { width: valStr.length + MARGIN, align: 'right' },
                        ],
                        [[outflow.title, valStr]]
                    );
                }
                if (outflow.note) {
                    encoder.line(`  (${outflow.note})`);
                }
            }
        }

        encoder.line('='.repeat(columns));
        encoder.newline();
        encoder.newline();
        encoder.newline();
        encoder.newline();
        encoder.cut();

        const result = encoder.encode();
        console.log('[Printer] Enviando reporte', result.length, 'bytes...');
        const ok = await sendToQzPrinter(result, target);
        if (!ok) return false;
        console.log('[Printer] ✅ Reporte impreso exitosamente');
        return true;
    } catch (err) {
        console.error('[Printer] ❌ Error imprimiendo reporte:', err);
        return false;
    }
};

// ============ API PÚBLICA DE GESTIÓN DE LISTA Y PREDETERMINADAS ============
//
// Conecta la lógica pura del registro (printerRegistry) con la persistencia en
// Almacenamiento_Local y notifica a los suscriptores de onConfigChange tras cada
// cambio de `config`. Ningún efecto toca la cola de sincronización offline.

// Devuelve la Lista_Impresoras_Registradas vigente en memoria.
export const getRegisteredPrinters = (): ImpresoraRegistrada[] => config.printers;

// Registra una impresora en la lista. Si el nombre ya existe, no la duplica y
// devuelve `alreadyExisted: true` sin tocar la persistencia (Req 1.6). Si la
// escritura en Almacenamiento_Local falla, conserva la config anterior en
// memoria y devuelve `ok: false` (Req 3.5). Emite onConfigChange al tener éxito.
export const registerPrinter = (name: string): { ok: boolean; alreadyExisted: boolean } => {
    const { config: next, alreadyExisted } = addPrinter(config, name);
    if (alreadyExisted) {
        return { ok: true, alreadyExisted: true };
    }

    const previous = config;
    config = next;
    const persisted = savePrinterList(config.printers);
    if (!persisted) {
        config = previous;
        return { ok: false, alreadyExisted: false };
    }

    notifyConfigListeners();
    return { ok: true, alreadyExisted: false };
};

// Quita una impresora de la lista y persiste el cambio. `removePrinter` limpia
// las predeterminadas que la referenciaban (Req 2.4); si alguna quedó en null por
// la eliminación, se persiste con `saveDefault(role, null)`. Si cualquier
// escritura falla, conserva la config anterior en memoria y devuelve `false`
// (Req 2.6 / 6.6). Emite onConfigChange al tener éxito.
export const unregisterPrinter = (name: string): boolean => {
    const previous = config;
    config = removePrinter(config, name);

    const listPersisted = savePrinterList(config.printers);
    if (!listPersisted) {
        config = previous;
        return false;
    }

    if (previous.defaultTicket === name && !saveDefault('TICKET', null)) {
        config = previous;
        return false;
    }

    if (previous.defaultComanda === name && !saveDefault('COMANDA', null)) {
        config = previous;
        return false;
    }

    notifyConfigListeners();
    return true;
};

// Devuelve el name de la Impresora_Predeterminada del rol, o null si no hay.
export const getDefaultPrinter = (role: RolImpresion): string | null =>
    getDefaultForRole(config, role);

// Fija la Impresora_Predeterminada del rol indicado ("última elegida se fija") y
// la persiste. Si la escritura falla, conserva la predeterminada anterior en
// memoria y devuelve `false` (Req 8.5 / 6.6). Emite onConfigChange al tener éxito.
export const setDefaultPrinter = (role: RolImpresion, name: string): boolean => {
    const previous = config;
    config = setDefault(config, role, name);

    const persisted = saveDefault(role, name);
    if (!persisted) {
        config = previous;
        return false;
    }

    notifyConfigListeners();
    return true;
};

// Estado de conexión de una impresora puntual; 'unknown' si no hay reporte.
export const getPrinterStatusFor = (name: string): EstadoConexion =>
    printerStatuses.get(name) ?? 'unknown';

// Suscribe un listener a los cambios de `config`. Devuelve la función de limpieza
// para desuscribirse (sin fugas de listeners).
export const onConfigChange = (listener: ConfigListener): (() => void) => {
    configListeners.add(listener);
    return () => { configListeners.delete(listener); };
};
