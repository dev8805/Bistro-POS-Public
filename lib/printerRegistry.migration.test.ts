/**
 * lib/printerRegistry.migration.test.ts
 *
 * Unit tests (ejemplos / edge cases) de la migración desde la
 * Clave_Impresora_Heredada y del manejo de errores de Almacenamiento_Local.
 *
 * Estos tests NO usan fast-check: son casos concretos que complementan las
 * property tests del módulo. El mock de `localStorage` lo provee `test/setup.ts`
 * (instancia fresca antes de cada test).
 *
 * Cobertura de requerimientos:
 * - Req 4.3: sin datos nuevos ni heredado → config vacía sin predeterminadas.
 * - Req 4.4 / 4.1 / 4.2: migración heredada con lista vacía → impresora única
 *   asignada como defaultTicket y defaultComanda.
 * - Req 4.5: heredado presente pero inválido/vacío → lista vacía, se conserva
 *   intacta la clave heredada y se señala `migrationError`.
 * - Req 3.5 / 14.4: `savePrinterList` y `saveDefault` devuelven `false` cuando
 *   `setItem` lanza, sin tocar la cola de sincronización offline.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    LEGACY_STORAGE_KEY,
    STORAGE_KEY_LIST,
    STORAGE_KEY_DEFAULT_TICKET,
    STORAGE_KEY_DEFAULT_COMANDA,
    loadPrinterConfig,
    migrateLegacy,
    savePrinterList,
    saveDefault,
    type ImpresoraRegistrada,
} from './printerRegistry';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('migrateLegacy — casos base de migración', () => {
    it('migrateLegacy(null, []) devuelve una config vacía sin predeterminadas (Req 4.3)', () => {
        const config = migrateLegacy(null, []);

        expect(config.printers).toEqual([]);
        expect(config.defaultTicket).toBeNull();
        expect(config.defaultComanda).toBeNull();
    });

    it('migra la impresora heredada como única de la lista y default de ambos roles cuando la lista nueva está vacía (Req 4.1, 4.2, 4.4)', () => {
        const config = migrateLegacy('POS-80C Mostrador', []);

        expect(config.printers).toHaveLength(1);
        expect(config.printers[0].name).toBe('POS-80C Mostrador');
        expect(typeof config.printers[0].addedAt).toBe('string');
        expect(config.defaultTicket).toBe('POS-80C Mostrador');
        expect(config.defaultComanda).toBe('POS-80C Mostrador');
    });

    it('ignora la clave heredada cuando ya existe una lista nueva no vacía (Req 4.4)', () => {
        const lista: ImpresoraRegistrada[] = [
            { name: 'EPSON Cocina LAN', addedAt: '2024-01-01T00:00:00.000Z' },
        ];

        const config = migrateLegacy('POS-80C Mostrador', lista);

        expect(config.printers).toEqual(lista);
        // Los defaults reales se aplican luego en loadPrinterConfig; aquí van en null.
        expect(config.defaultTicket).toBeNull();
        expect(config.defaultComanda).toBeNull();
    });

    it('heredado vacío/espacios con lista vacía → config vacía sin predeterminadas (Req 4.5)', () => {
        const config = migrateLegacy('   ', []);

        expect(config.printers).toEqual([]);
        expect(config.defaultTicket).toBeNull();
        expect(config.defaultComanda).toBeNull();
    });
});

describe('loadPrinterConfig — migración y manejo de datos heredados', () => {
    it('migración exitosa: clave heredada con lista nueva vacía → impresora migrada como defaultTicket y defaultComanda (Req 4.1, 4.2)', () => {
        localStorage.setItem(LEGACY_STORAGE_KEY, 'EPSON TM-T20 (LAN)');

        const { config, migrationError } = loadPrinterConfig();

        expect(migrationError).toBe(false);
        expect(config.printers).toHaveLength(1);
        expect(config.printers[0].name).toBe('EPSON TM-T20 (LAN)');
        expect(config.defaultTicket).toBe('EPSON TM-T20 (LAN)');
        expect(config.defaultComanda).toBe('EPSON TM-T20 (LAN)');
    });

    it('heredado presente pero inválido/vacío y lista nueva vacía → lista vacía, conserva la clave heredada original y marca migrationError=true (Req 4.5)', () => {
        // Clave heredada presente pero con un valor vacío (inválido).
        localStorage.setItem(LEGACY_STORAGE_KEY, '');

        const { config, migrationError } = loadPrinterConfig();

        expect(config.printers).toEqual([]);
        expect(config.defaultTicket).toBeNull();
        expect(config.defaultComanda).toBeNull();
        expect(migrationError).toBe(true);

        // La Clave_Impresora_Heredada se conserva INTACTA (no se borra) para
        // permitir un rollback seguro.
        expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe('');
    });

    it('sin lista nueva ni clave heredada → config vacía y sin error de migración (Req 4.3)', () => {
        const { config, migrationError } = loadPrinterConfig();

        expect(config.printers).toEqual([]);
        expect(config.defaultTicket).toBeNull();
        expect(config.defaultComanda).toBeNull();
        expect(migrationError).toBe(false);
    });
});

describe('Errores de localStorage — la persistencia falla de forma segura (Req 3.5, 14.4)', () => {
    it('savePrinterList devuelve false cuando setItem lanza, sin propagar la excepción', () => {
        const setItemSpy = vi
            .spyOn(localStorage, 'setItem')
            .mockImplementation(() => {
                throw new DOMException('QuotaExceededError');
            });

        const printers: ImpresoraRegistrada[] = [
            { name: 'POS-80C', addedAt: '2024-01-01T00:00:00.000Z' },
        ];

        expect(() => savePrinterList(printers)).not.toThrow();
        expect(savePrinterList(printers)).toBe(false);

        // Solo se intentó escribir en la clave de la lista de impresoras: la cola
        // de sincronización offline (IndexedDB / Event Sourcing) nunca se toca.
        expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEY_LIST, expect.any(String));
        for (const [key] of setItemSpy.mock.calls) {
            expect(key).toBe(STORAGE_KEY_LIST);
        }
    });

    it('saveDefault(TICKET) devuelve false cuando setItem lanza, escribiendo solo la clave del rol (Req 3.5, 14.4)', () => {
        const setItemSpy = vi
            .spyOn(localStorage, 'setItem')
            .mockImplementation(() => {
                throw new DOMException('QuotaExceededError');
            });

        expect(() => saveDefault('TICKET', 'POS-80C')).not.toThrow();
        expect(saveDefault('TICKET', 'POS-80C')).toBe(false);

        expect(setItemSpy).toHaveBeenCalledWith(STORAGE_KEY_DEFAULT_TICKET, 'POS-80C');
        for (const [key] of setItemSpy.mock.calls) {
            expect(key).toBe(STORAGE_KEY_DEFAULT_TICKET);
        }
    });

    it('saveDefault(COMANDA) devuelve false cuando setItem lanza', () => {
        vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
            throw new DOMException('QuotaExceededError');
        });

        expect(saveDefault('COMANDA', 'EPSON Cocina LAN')).toBe(false);
    });

    it('saveDefault(role, null) devuelve false cuando removeItem lanza', () => {
        vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
            throw new DOMException('SecurityError');
        });

        expect(() => saveDefault('COMANDA', null)).not.toThrow();
        expect(saveDefault('COMANDA', null)).toBe(false);
    });

    it('la cola de sync no se ve afectada: no se invoca IndexedDB durante un fallo de guardado (Req 14.4)', () => {
        vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
            throw new DOMException('QuotaExceededError');
        });

        // Espía sobre indexedDB.open: el módulo de registro de impresoras solo usa
        // localStorage, por lo que jamás debe abrir una base de datos IndexedDB.
        const indexedDbOpenSpy = vi.fn();
        vi.stubGlobal('indexedDB', { open: indexedDbOpenSpy });

        savePrinterList([{ name: 'POS-80C', addedAt: '2024-01-01T00:00:00.000Z' }]);
        saveDefault('TICKET', 'POS-80C');

        expect(indexedDbOpenSpy).not.toHaveBeenCalled();

        vi.unstubAllGlobals();
    });
});
