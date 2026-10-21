// @ts-nocheck
/**
 * Tests de integración del Servicio_Impresión con QZ_Tray usando un MOCK del
 * módulo `qz-tray`. NO son property tests (no usan fast-check): verifican el
 * comportamiento del servicio frente a QZ con spies controlables.
 *
 * Estrategia:
 * - `qz-tray` se mockea con un objeto estable (vi.hoisted) cuyos métodos son
 *   spies que el test configura y observa: websocket.isActive/connect,
 *   printers.find/getStatus/setPrinterCallbacks/startListening, configs.create
 *   y print.
 * - El servicio es un singleton con estado de módulo que se inicializa al
 *   importar (lee localStorage y crea config). Para aislar cada test usamos
 *   `vi.resetModules()` + re-import dentro de cada test, de modo que el estado
 *   del módulo arranca limpio. El mock de localStorage (test/setup.ts) se
 *   resetea antes de cada test.
 * - El estado del servicio se configura SOLO por su API pública
 *   (connectPrinter / setDefaultPrinter) en cada test.
 *
 * Requirements: 1.1, 7.4, 9.6, 12.3, 13.3, 13.4, 7.3, 9.5
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Mock estable de qz-tray (vi.hoisted para referenciarlo en los tests) ----
const qzMock = vi.hoisted(() => {
    const obj: any = {
        // Estado controlable desde los tests
        _availablePrinters: ['POS-80C', 'EPSON-LAN'],
        _statusCallback: null, // callback registrado vía setPrinterCallbacks
        _closedCallback: null, // callback de cierre de WebSocket

        websocket: {
            isActive: vi.fn(() => true),
            connect: vi.fn(() => Promise.resolve()),
            setClosedCallbacks: vi.fn((cb: any) => { obj._closedCallback = cb; }),
        },
        printers: {
            // find() sin nombre → lista disponible; find(name) → confirma existencia
            find: vi.fn((name?: string) =>
                name === undefined
                    ? Promise.resolve(obj._availablePrinters)
                    : Promise.resolve(name)
            ),
            getStatus: vi.fn(() => Promise.resolve()),
            setPrinterCallbacks: vi.fn((cb: any) => { obj._statusCallback = cb; }),
            startListening: vi.fn(() => Promise.resolve()),
        },
        configs: {
            create: vi.fn((name: string, opts: any) => ({ name, opts })),
        },
        print: vi.fn(() => Promise.resolve()),
    };
    return obj;
});

vi.mock('qz-tray', () => ({ default: qzMock }));

// El servicio firma con QZ al importar; evitamos toda la lógica de firmado RSA.
vi.mock('./qzSigning', () => ({ setupQzSecurity: vi.fn() }));

// Encoder ESC/POS: mock chainable que produce bytes deterministas. Desacopla
// los tests de routing de la generación real de ESC/POS.
vi.mock('@point-of-sale/receipt-printer-encoder', () => {
    class FakeEncoder {
        constructor(_opts?: unknown) {}
        align() { return this; }
        bold() { return this; }
        line() { return this; }
        text() { return this; }
        table() { return this; }
        height() { return this; }
        newline() { return this; }
        cut() { return this; }
        encode() { return new Uint8Array([0x1b, 0x40, 0x0a]); }
    }
    return { default: FakeEncoder };
});

// ---- Datos mínimos para las funciones de impresión ----
const receiptData: any = {
    businessName: 'Bistro Test',
    items: [],
    date: '2026-01-01 10:00',
    subtotal: 0,
    totalDiscount: 0,
    total: 0,
    paymentMethod: 'Efectivo',
};

const commandData: any = {
    items: [{ name: 'Hamburguesa', quantity: 1 }],
    date: '2026-01-01 10:00',
};

const ENCODING = { encoding: 'ISO-8859-1' };

// Re-importa el servicio con estado de módulo limpio.
const loadService = () => import('./thermalPrinterService');

beforeEach(() => {
    // Limpia historial de llamadas y re-establece implementaciones de los spies.
    vi.clearAllMocks();
    vi.resetModules();

    qzMock._availablePrinters = ['POS-80C', 'EPSON-LAN'];
    qzMock._statusCallback = null;
    qzMock._closedCallback = null;

    qzMock.websocket.isActive.mockReturnValue(true);
    qzMock.websocket.connect.mockResolvedValue(undefined);
    qzMock.websocket.setClosedCallbacks.mockImplementation((cb: any) => { qzMock._closedCallback = cb; });
    qzMock.printers.find.mockImplementation((name?: string) =>
        name === undefined ? Promise.resolve(qzMock._availablePrinters) : Promise.resolve(name)
    );
    qzMock.printers.getStatus.mockResolvedValue(undefined);
    qzMock.printers.setPrinterCallbacks.mockImplementation((cb: any) => { qzMock._statusCallback = cb; });
    qzMock.printers.startListening.mockResolvedValue(undefined);
    qzMock.configs.create.mockImplementation((name: string, opts: any) => ({ name, opts }));
    qzMock.print.mockResolvedValue(undefined);
});

describe('thermalPrinterService — integración con QZ (mock)', () => {
    it('listPrinters devuelve la lista que reporta qz.printers.find()', async () => {
        qzMock._availablePrinters = ['POS-80C', 'EPSON-LAN'];
        const svc = await loadService();

        const printers = await svc.listPrinters();

        expect(qzMock.printers.find).toHaveBeenCalled();
        expect(printers).toEqual(['POS-80C', 'EPSON-LAN']);
    });

    it('connectPrinter(name) registra la impresora y queda connected', async () => {
        const svc = await loadService();

        const ok = await svc.connectPrinter('POS-80C');

        expect(ok).toBe(true);
        expect(svc.getPrinterStatusFor('POS-80C')).toBe('connected');
        expect(svc.getRegisteredPrinters().map((p: any) => p.name)).toContain('POS-80C');
    });

    it('evento de estado físico: OFFLINE → disconnected, OK → connected', async () => {
        const svc = await loadService();
        await svc.connectPrinter('POS-80C');

        // El servicio registró su callback de estado en QZ.
        expect(qzMock.printers.setPrinterCallbacks).toHaveBeenCalled();
        expect(typeof qzMock._statusCallback).toBe('function');

        // Simula desconexión física reportada por el spooler.
        qzMock._statusCallback({ printerName: 'POS-80C', status: 'OFFLINE' });
        expect(svc.getPrinterStatusFor('POS-80C')).toBe('disconnected');

        // Simula vuelta a online.
        qzMock._statusCallback({ printerName: 'POS-80C', status: 'OK' });
        expect(svc.getPrinterStatusFor('POS-80C')).toBe('connected');
    });

    it('getPrinterStatus() agregado: connected si al menos una impresora lo está', async () => {
        const svc = await loadService();
        await svc.connectPrinter('POS-80C');
        await svc.connectPrinter('EPSON-LAN');

        expect(svc.getPrinterStatus()).toBe('connected');

        // Una cae: el agregado sigue connected porque la otra está conectada.
        qzMock._statusCallback({ printerName: 'POS-80C', status: 'OFFLINE' });
        expect(svc.getPrinterStatus()).toBe('connected');

        // Cae la segunda: ya no hay ninguna conectada.
        qzMock._statusCallback({ printerName: 'EPSON-LAN', status: 'OFFLINE' });
        expect(svc.getPrinterStatus()).toBe('disconnected');
    });

    it('reconnectPrinter prioriza la predeterminada COMANDA (orden de qz.printers.find)', async () => {
        const svc = await loadService();
        await svc.connectPrinter('POS-80C');
        await svc.connectPrinter('EPSON-LAN');
        svc.setDefaultPrinter('COMANDA', 'EPSON-LAN');

        // Limpiamos el historial para observar solo las llamadas del reconnect.
        qzMock.printers.find.mockClear();

        await svc.reconnectPrinter();

        const findArgs = qzMock.printers.find.mock.calls.map((c: any[]) => c[0]);
        // La predeterminada de COMANDA debe verificarse primero (Req 13.3/13.4).
        expect(findArgs[0]).toBe('EPSON-LAN');
        expect(findArgs).toContain('POS-80C');
    });

    it('enrutamiento: printReceiptDirect → defaultTicket, printKitchenCommandDirect → defaultComanda', async () => {
        const svc = await loadService();
        await svc.connectPrinter('POS-80C');
        await svc.connectPrinter('EPSON-LAN');
        svc.setDefaultPrinter('TICKET', 'POS-80C');
        svc.setDefaultPrinter('COMANDA', 'EPSON-LAN');

        qzMock.configs.create.mockClear();
        qzMock.print.mockClear();
        const okTicket = await svc.printReceiptDirect(receiptData, '80mm');
        expect(okTicket).toBe(true);
        expect(qzMock.configs.create).toHaveBeenCalledWith('POS-80C', ENCODING);
        expect(qzMock.print).toHaveBeenCalledTimes(1);

        qzMock.configs.create.mockClear();
        qzMock.print.mockClear();
        const okComanda = await svc.printKitchenCommandDirect(commandData, '80mm');
        expect(okComanda).toBe(true);
        expect(qzMock.configs.create).toHaveBeenCalledWith('EPSON-LAN', ENCODING);
        expect(qzMock.print).toHaveBeenCalledTimes(1);
    });

    it('enrutamiento: targetPrinter override respeta el parámetro', async () => {
        const svc = await loadService();
        await svc.connectPrinter('POS-80C');
        svc.setDefaultPrinter('TICKET', 'POS-80C');

        qzMock.configs.create.mockClear();
        qzMock.print.mockClear();

        const ok = await svc.printReceiptDirect(receiptData, '80mm', 'IMPRESORA-OVERRIDE');

        expect(ok).toBe(true);
        // Debe ir al override, NO a la predeterminada de ticket.
        expect(qzMock.configs.create).toHaveBeenCalledWith('IMPRESORA-OVERRIDE', ENCODING);
        expect(qzMock.configs.create).not.toHaveBeenCalledWith('POS-80C', ENCODING);
    });

    it('sin predeterminada para el rol → no invoca qz.print y devuelve false', async () => {
        const svc = await loadService();
        // Config vacía: sin defaults y sin override.

        const result = await svc.printReceiptDirect(receiptData, '80mm');

        expect(result).toBe(false);
        expect(qzMock.configs.create).not.toHaveBeenCalled();
        expect(qzMock.print).not.toHaveBeenCalled();
    });
});
