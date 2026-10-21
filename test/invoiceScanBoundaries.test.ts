import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

/**
 * Pruebas estructurales de fronteras de import del Escaneo_Unificado (tarea 5.9).
 *
 * El Requisito 16 exige que el flujo sea AUTOCONTENIDO: la superficie del escaneo
 * (`screens/InvoiceScanScreen.tsx` y `components/invoiceScan/**`) no debe navegar ni
 * abrir las pantallas/formularios existentes. En vez de comprobarlo con una prueba de
 * comportamiento (frágil), se verifica de forma estática que esos archivos no importen
 * ninguno de los módulos prohibidos.
 *
 * Módulos prohibidos (Req 6.11, 7.11, 16.3, 16.4):
 *   InventoryPurchase, ExpenseRegister, ExpenseModal, SimpleProductScreen,
 *   ProcessedProductScreen, ServiceProductScreen, InvoiceConfigPanel
 *
 * Además se cubre la superficie del escaneo respecto al símbolo `evaluateCostFormula`
 * (la eliminación GLOBAL de ese símbolo corresponde a la tarea 10.5; aquí solo se
 * garantiza que no aparezca dentro del flujo unificado).
 *
 * Nota: si alguna de estas pruebas FALLA, no debe "arreglarse" tocando los componentes
 * para que pase: significaría que una tarea previa introdujo un import prohibido, es
 * decir, un defecto real que hay que reportar.
 */

// Raíz del repo: este archivo vive en `<root>/test/`.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const HOST_FILE = join(REPO_ROOT, 'screens', 'InvoiceScanScreen.tsx');
const COMPONENTS_DIR = join(REPO_ROOT, 'components', 'invoiceScan');

const FORBIDDEN_MODULES = [
    'InventoryPurchase',
    'ExpenseRegister',
    'ExpenseModal',
    'SimpleProductScreen',
    'ProcessedProductScreen',
    'ServiceProductScreen',
    'InvoiceConfigPanel',
] as const;

/** Recolecta recursivamente los `.ts`/`.tsx` de un directorio, excluyendo los tests. */
const collectSourceFiles = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            out.push(...collectSourceFiles(full));
            continue;
        }
        const isSource = /\.tsx?$/.test(entry);
        const isTest = /\.test\.tsx?$/.test(entry);
        if (isSource && !isTest) out.push(full);
    }
    return out;
};

/** Extrae la ruta del módulo de cada sentencia `import ... from '...'` y de `import('...')`. */
const extractImportSpecifiers = (source: string): string[] => {
    const specifiers: string[] = [];
    // import ... from 'x'  /  export ... from 'x'
    const staticRe = /(?:import|export)\s[^;]*?from\s*['"]([^'"]+)['"]/g;
    // import 'x'  (side-effect)
    const bareRe = /import\s*['"]([^'"]+)['"]/g;
    // import('x')  (dinámico)
    const dynamicRe = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    for (const re of [staticRe, bareRe, dynamicRe]) {
        let m: RegExpExecArray | null;
        while ((m = re.exec(source)) !== null) specifiers.push(m[1]);
    }
    return specifiers;
};

/** Nombre del módulo al final de la ruta del import, sin extensión (`../x/InventoryPurchase.tsx` → `InventoryPurchase`). */
const moduleBaseName = (specifier: string): string => {
    const last = specifier.split('/').pop() ?? specifier;
    return last.replace(/\.(tsx?|jsx?)$/, '');
};

const SCAN_SURFACE_FILES: string[] = [HOST_FILE, ...collectSourceFiles(COMPONENTS_DIR)];
const relativeToRepo = (p: string) => p.slice(REPO_ROOT.length + 1).replace(/\\/g, '/');

describe('Fronteras de import del Escaneo_Unificado (Req 6.11, 7.11, 16.3, 16.4)', () => {
    it('encuentra la superficie del escaneo (host + componentes)', () => {
        expect(SCAN_SURFACE_FILES.length).toBeGreaterThan(1);
        expect(SCAN_SURFACE_FILES).toContain(HOST_FILE);
    });

    it.each(SCAN_SURFACE_FILES.map((f) => [relativeToRepo(f), f] as const))(
        '%s no importa ninguna pantalla/formulario existente prohibido',
        (_rel, file) => {
            const source = readFileSync(file, 'utf8');
            const specifiers = extractImportSpecifiers(source);
            const offenders = specifiers
                .filter((spec) => FORBIDDEN_MODULES.includes(moduleBaseName(spec) as (typeof FORBIDDEN_MODULES)[number]))
                .map((spec) => `${moduleBaseName(spec)} (import '${spec}')`);

            expect(
                offenders,
                `${relativeToRepo(file)} importa módulo(s) prohibido(s): ${offenders.join(', ')}. ` +
                    `El flujo debe ser autocontenido (Req 16): no navegar ni abrir esas pantallas/formularios.`,
            ).toEqual([]);
        },
    );
});

describe('El símbolo evaluateCostFormula no aparece en la superficie del escaneo', () => {
    it.each(SCAN_SURFACE_FILES.map((f) => [relativeToRepo(f), f] as const))(
        '%s no referencia evaluateCostFormula',
        (_rel, file) => {
            const source = readFileSync(file, 'utf8');
            const found = /\bevaluateCostFormula\b/.test(source);
            expect(
                found,
                `${relativeToRepo(file)} referencia evaluateCostFormula; ese símbolo (fórmula de costo) ` +
                    `no debe existir en el flujo unificado. La eliminación global es la tarea 10.5.`,
            ).toBe(false);
        },
    );
});
