/**
 * test/arbitraries/printerArbitraries.ts
 *
 * Arbitraries reutilizables de fast-check para los property tests del módulo
 * puro `lib/printerRegistry.ts`. Generan nombres de impresora, impresoras
 * registradas, configuraciones (con nombres posiblemente repetidos y
 * predeterminadas dentro o fuera de la lista), estados de conexión, roles y
 * cadenas arbitrarias (incluyendo JSON malformado) para probar la robustez del
 * parser.
 *
 * _Requirements: 1.6, 3.7_
 */

import fc from 'fast-check';
import type {
    ConfiguracionImpresoras,
    EstadoConexion,
    ImpresoraRegistrada,
    RolImpresion,
} from '../../lib/printerRegistry';

/**
 * Nombres de impresora no vacíos. Mezcla cadenas arbitrarias no vacías con
 * nombres realistas que incluyen caracteres especiales, espacios y paréntesis
 * (p. ej. "EPSON TM-T20 (LAN)").
 */
export const arbPrinterName: fc.Arbitrary<string> = fc.oneof(
    // Cadenas no vacías arbitrarias (incluye caracteres especiales/unicode).
    fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.length > 0),
    // Nombres realistas de impresoras térmicas.
    fc.constantFrom(
        'EPSON TM-T20 (LAN)',
        'POS-80C Mostrador',
        'EPSON Cocina LAN',
        'Caja 2',
        'XPrinter XP-58 (USB)',
        'Star TSP100 #1',
        'Impresora Cocina – Térmica 80mm',
    ),
);

/** `ImpresoraRegistrada`: { name no vacío, addedAt ISO string }. */
export const arbImpresoraRegistrada: fc.Arbitrary<ImpresoraRegistrada> = fc.record({
    name: arbPrinterName,
    addedAt: fc
        .date({ min: new Date('2020-01-01T00:00:00.000Z'), max: new Date('2035-12-31T23:59:59.999Z') })
        .map((d) => (Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString())),
});

/** Lista de impresoras registradas (puede contener nombres repetidos). */
export const arbListaImpresoras: fc.Arbitrary<ImpresoraRegistrada[]> = fc.array(
    arbImpresoraRegistrada,
    { maxLength: 8 },
);

/**
 * `ConfiguracionImpresoras` arbitraria pensada para ejercitar dedup y
 * validateConfig:
 * - La lista puede contener nombres repetidos.
 * - Las predeterminadas pueden ser `null`, un nombre presente en la lista, o un
 *   nombre que NO está en la lista (predeterminada colgante).
 */
export const arbConfig: fc.Arbitrary<ConfiguracionImpresoras> = arbListaImpresoras.chain(
    (printers) => {
        const nombresEnLista = printers.map((p) => p.name);
        // Predeterminada: null, o un nombre de la lista, o un nombre arbitrario externo.
        const arbDefault: fc.Arbitrary<string | null> =
            nombresEnLista.length > 0
                ? fc.oneof(
                      fc.constant<string | null>(null),
                      fc.constantFrom(...nombresEnLista),
                      arbPrinterName,
                  )
                : fc.oneof(fc.constant<string | null>(null), arbPrinterName);

        return fc.record({
            printers: fc.constant(printers),
            defaultTicket: arbDefault,
            defaultComanda: arbDefault,
        });
    },
);

/** Estado de conexión de una impresora. */
export const arbEstado: fc.Arbitrary<EstadoConexion> = fc.constantFrom(
    'disconnected',
    'connecting',
    'connected',
    'unknown',
);

/** Rol de impresión. */
export const arbRol: fc.Arbitrary<RolImpresion> = fc.constantFrom('TICKET', 'COMANDA');

/**
 * Cadena arbitraria para probar la robustez del parser (Propiedad 7). Incluye
 * texto plano, JSON válido pero con forma incorrecta, JSON malformado y arrays
 * con elementos inválidos.
 */
export const arbCadenaArbitraria: fc.Arbitrary<string> = fc.oneof(
    fc.string(),
    // JSON válido pero que no es un array de ImpresoraRegistrada.
    fc.json(),
    // Casos puntuales de JSON malformado o estructuras inesperadas.
    fc.constantFrom(
        '{ malformed',
        '[1, 2, 3]',
        '{"name": "X"}',
        '[{"name": 123, "addedAt": "x"}]',
        '[{"addedAt": "2020-01-01"}]',
        '"solo-string"',
        'null',
        'true',
        '42',
        '[null, {}]',
        '',
    ),
);
