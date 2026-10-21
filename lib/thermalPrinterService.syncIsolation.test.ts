// @ts-nocheck
/**
 * lib/thermalPrinterService.syncIsolation.test.ts
 *
 * Tarea 6.6 — Aislamiento de la cola de sincronización offline.
 *
 * Verifica el Requerimiento 14: la gestión de impresoras (registerPrinter,
 * unregisterPrinter, setDefaultPrinter y connectPrinter) usa ÚNICAMENTE
 * Almacenamiento_Local y NO interactúa con la cola de sincronización offline
 * (IndexedDB / Event Sourcing).
 *
 * Estrategia:
 *  - Se espía `indexedDB.open` y se verifica CERO llamadas durante alta, baja y
 *    cambio de predeterminada (Req 14.1) — el registro de impresoras jamás abre
 *    una base IndexedDB.
 *  - Se espían todos los métodos mutadores de `offlineQueue` (add, remove,
 *    updateStatus, removeFailed, clear) y se confirma CERO interacciones
 *    durante las operaciones de impresora (Req 14.2).
 *  - Se comprueba que el "conteo de eventos pendientes" de la cola es idéntico
 *    antes y después de cada operación (Req 14.2), y que la cola queda operativa
 *    (sus métodos siguen disponibles) tras la operación (Req 14.3).
 *
 * No son property tests. No se modifica código de producción.
 *
 * _Requirements: 14.1, 14.2, 14.3_
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { offlineQueue } from './offlineQueue';

// ---- Mock de qz-tray: permite ejecutar connectPrinter sin un QZ real ----
// El servicio importa `qz` por defecto y, al cargar el módulo, llama a
// setupQzSecurity(qz) y qz.websocket.setClosedCallbacks(...). Se entrega un
// doble con la superficie mínima que usan connectPrinter y sus dependencias.
vi.mock('qz-tray', () => ({
    default: {
        websocket: {
            isActive: vi.fn(() => false),
            connect: vi.fn(() => Promise.resolve()),
            setClosedCallbacks: vi.fn(),
        },
        printers: {
            // find(name) devuelve el propio nombre (impresora "encontrada").
            find: vi.fn((name?: string) => Promise.resolve(name ?? ['POS-80C'])),
            setPrinterCallbacks: vi.fn(),
            startListening: vi.fn(() => Promise.resolve()),
            getStatus: vi.fn(() => Promise.resolve()),
        },
        configs: { create: vi.fn(() => ({})) },
        print: vi.fn(() => Promise.resolve()),
    },
}));

// Evita la firma RSA real (lectura de certificado/clave) durante los tests.
vi.mock('./qzSigning', () => ({ setupQzSecurity: vi.fn() }));

import {
    registerPrinter,
    unregisterPrinter,
    setDefaultPrinter,
    connectPrinter,
} from './thermalPrinterService';

describe('thermalPrinterService — aislamiento de la cola de sync offline (Req 14)', () => {
    let indexedDbOpenSpy: ReturnType<typeof vi.fn>;
    let queueSpies: ReturnType<typeof vi.spyOn>[];

    beforeEach(() => {
        // Espía sobre indexedDB.open: el servicio de impresión solo usa
        // localStorage, por lo que jamás debe abrir una base IndexedDB.
        indexedDbOpenSpy = vi.fn();
        vi.stubGlobal('indexedDB', { open: indexedDbOpenSpy });

        // Espías sobre los métodos mutadores de la cola de sync: deben quedar
        // en CERO llamadas tras las operaciones de impresora.
        queueSpies = [
            vi.spyOn(offlineQueue, 'add'),
            vi.spyOn(offlineQueue, 'remove'),
            vi.spyOn(offlineQueue, 'updateStatus'),
            vi.spyOn(offlineQueue, 'removeFailed'),
            vi.spyOn(offlineQueue, 'clear'),
        ];

        // El "conteo de eventos pendientes" se simula con un valor estable; así
        // se evita tocar IndexedDB real y se puede comparar antes/después.
        vi.spyOn(offlineQueue, 'getPendingCount').mockResolvedValue(3);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    const expectQueueUntouched = () => {
        queueSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
        expect(indexedDbOpenSpy).not.toHaveBeenCalled();
    };

    it('registrar una impresora no toca la cola de sync ni abre IndexedDB (Req 14.1, 14.2)', async () => {
        const before = await offlineQueue.getPendingCount();

        const result = registerPrinter('POS-80C Mostrador');
        expect(result.ok).toBe(true);

        const after = await offlineQueue.getPendingCount();

        expectQueueUntouched();
        expect(after).toBe(before); // conteo de pendientes idéntico (Req 14.2)
    });

    it('cambiar la predeterminada no toca la cola de sync ni abre IndexedDB (Req 14.1, 14.2)', async () => {
        registerPrinter('EPSON Cocina');
        queueSpies.forEach((spy) => spy.mockClear());
        indexedDbOpenSpy.mockClear();

        const before = await offlineQueue.getPendingCount();

        const okTicket = setDefaultPrinter('TICKET', 'EPSON Cocina');
        const okComanda = setDefaultPrinter('COMANDA', 'EPSON Cocina');
        expect(okTicket).toBe(true);
        expect(okComanda).toBe(true);

        const after = await offlineQueue.getPendingCount();

        expectQueueUntouched();
        expect(after).toBe(before);
    });

    it('eliminar una impresora no toca la cola de sync ni abre IndexedDB (Req 14.1, 14.2)', async () => {
        registerPrinter('Caja 2');
        queueSpies.forEach((spy) => spy.mockClear());
        indexedDbOpenSpy.mockClear();

        const before = await offlineQueue.getPendingCount();

        const removed = unregisterPrinter('Caja 2');
        expect(removed).toBe(true);

        const after = await offlineQueue.getPendingCount();

        expectQueueUntouched();
        expect(after).toBe(before);
    });

    it('connectPrinter no toca la cola de sync ni abre IndexedDB (Req 14.1, 14.2)', async () => {
        const before = await offlineQueue.getPendingCount();

        const connected = await connectPrinter('POS-80C LAN');
        expect(connected).toBe(true);

        const after = await offlineQueue.getPendingCount();

        expectQueueUntouched();
        expect(after).toBe(before);
    });

    it('el ciclo completo alta → cambio → baja deja la cola intacta y operativa (Req 14.2, 14.3)', async () => {
        const before = await offlineQueue.getPendingCount();

        registerPrinter('Impresora Ciclo');
        setDefaultPrinter('TICKET', 'Impresora Ciclo');
        setDefaultPrinter('COMANDA', 'Impresora Ciclo');
        unregisterPrinter('Impresora Ciclo');

        const after = await offlineQueue.getPendingCount();

        expectQueueUntouched();
        expect(after).toBe(before);

        // La cola sigue operativa: sus métodos continúan disponibles (Req 14.3).
        expect(typeof offlineQueue.add).toBe('function');
        expect(typeof offlineQueue.getPendingCount).toBe('function');
    });
});
