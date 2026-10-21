/**
 * lib/printerRegistry.test.ts
 *
 * Property tests del módulo puro `lib/printerRegistry.ts`.
 *
 * Esta entrega cubre la Propiedad 5 (persistencia round-trip). El mock de
 * `localStorage` lo provee `test/setup.ts` (instancia fresca antes de cada
 * test); además, dentro de la propiedad se limpia entre cada run de fast-check.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
    loadPrinterConfig,
    saveDefault,
    savePrinterList,
    validateConfig,
    type ConfiguracionImpresoras,
} from './printerRegistry';
import { arbConfig } from '../test/arbitraries/printerArbitraries';

/**
 * Configuración "válida" en el espacio del round-trip: las predeterminadas
 * colgantes (que no referencian una impresora de la lista) se invalidan a
 * `null` con `validateConfig`, que es exactamente la normalización que aplica
 * `loadPrinterConfig` al cargar. Así el espacio de entrada coincide con el de
 * salida esperado.
 */
const arbConfigValida: fc.Arbitrary<ConfiguracionImpresoras> = arbConfig.map(validateConfig);

describe('printerRegistry — persistencia', () => {
    it('Propiedad 5: guardar y cargar produce una configuración equivalente (round-trip)', () => {
        // Feature: multi-impresora-seleccion, Property 5: La persistencia es un round-trip
        // Validates: Requirements 3.1, 3.3
        fc.assert(
            fc.property(arbConfigValida, (config) => {
                // Limpiar el Almacenamiento_Local entre runs para aislar cada caso.
                localStorage.clear();

                // Guardar la lista y las predeterminadas por rol (independientes).
                const okList = savePrinterList(config.printers);
                const okTicket = saveDefault('TICKET', config.defaultTicket);
                const okComanda = saveDefault('COMANDA', config.defaultComanda);
                expect(okList).toBe(true);
                expect(okTicket).toBe(true);
                expect(okComanda).toBe(true);

                // Recuperar la configuración persistida.
                const { config: recuperada } = loadPrinterConfig();

                // Debe ser equivalente: misma lista y mismas predeterminadas.
                expect(recuperada).toEqual(config);
            }),
            { numRuns: 100 },
        );
    });
});
