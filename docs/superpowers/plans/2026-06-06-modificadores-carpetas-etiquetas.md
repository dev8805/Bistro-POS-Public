# Carpetas de etiquetas (sub-modificadores) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir agrupar etiquetas de personalización en carpetas (un nivel) para que productos con muchas etiquetas (ej. CHOLAO CON HELADO) se muestren ordenados en el modal de modificadores.

**Architecture:** `categories.customizable_options` (jsonb) pasa de `string[]` a un array mixto `(string | { name, options })[]`. Las etiquetas sueltas legacy siguen siendo strings; las carpetas son objetos. Sin migración SQL. El modal `ProductOptionsModal` separa sueltas/carpetas para render; la selección sigue produciendo un `cookingTerm` plano, así que carrito/comanda/ticket no cambian.

**Tech Stack:** React 19, TypeScript 5.8, Tailwind 3, Supabase (jsonb). Sin runner de tests en el repo → verificación = `npm run build` (typecheck) + checklist manual en `npm run dev`.

**Spec:** `docs/superpowers/specs/2026-06-06-modificadores-carpetas-etiquetas-design.md`

---

## File Structure

| Archivo | Responsabilidad |
|---------|-----------------|
| `types.ts` | Tipos `OptionFolder`, `CustomizableOption`; campo `customizableOptions` |
| `lib/optionFolders.ts` (nuevo) | Helpers puros: `isFolder`, `flattenOptions`, `splitOptions` |
| `components/ProductModal.tsx` | Legacy single-select: aplanar para no crashear |
| `components/ProductEditModal.tsx` | Código muerto: aplanar para satisfacer el tipo |
| `hooks/useProducts.ts` | Tipado del campo en sus interfaces |
| `components/ProductOptionsModal.tsx` | Render de carpetas (tab Modificar) + edición de carpetas (tab Ajustes) |
| `docs/caracteristicas/etiquetas_por_categoria.md` | Documentar carpetas |

---

## Task 1: Tipos y helpers puros

**Files:**
- Modify: `types.ts:75-76`
- Create: `lib/optionFolders.ts`

- [ ] **Step 1: Añadir tipos en `types.ts`**

Reemplazar las líneas 75-76 (dentro de la interfaz `Product`):

```ts
  customizableOptions?: string[]; // e.g. ["1/2", "3/4", "Bien Cocido"]
  excludedOptions?: string[]; // Options excluded from category for this product
```

por:

```ts
  customizableOptions?: CustomizableOption[]; // strings sueltas o carpetas { name, options }
  excludedOptions?: string[]; // Options excluded from category for this product (por nombre de etiqueta)
```

Y añadir al final del archivo `types.ts` (después de la última definición):

```ts
export interface OptionFolder {
  name: string;
  options: string[];
}

// Una etiqueta de personalización: string suelta (legacy) o una carpeta con etiquetas dentro.
export type CustomizableOption = string | OptionFolder;
```

- [ ] **Step 2: Crear `lib/optionFolders.ts`**

```ts
import { CustomizableOption, OptionFolder } from '../types';

// Type guard: distingue una carpeta de una etiqueta suelta.
export const isFolder = (item: CustomizableOption): item is OptionFolder =>
  typeof item === 'object' && item !== null && 'options' in item;

// Devuelve TODOS los nombres de etiqueta (sueltas + dentro de carpetas) como lista plana.
export const flattenOptions = (opts: CustomizableOption[] = []): string[] =>
  opts.flatMap(item => (isFolder(item) ? item.options : [item]));

// Separa el array mixto en etiquetas sueltas y carpetas, para renderizar.
export const splitOptions = (
  opts: CustomizableOption[] = []
): { loose: string[]; folders: OptionFolder[] } => {
  const loose: string[] = [];
  const folders: OptionFolder[] = [];
  for (const item of opts) {
    if (isFolder(item)) folders.push(item);
    else loose.push(item);
  }
  return { loose, folders };
};
```

- [ ] **Step 3: Verificar typecheck**

Run: `npm run build`
Expected: PASS (puede haber errores en ProductModal/ProductEditModal/useProducts — se arreglan en Task 2; si solo aparecen esos, continuar).

- [ ] **Step 4: Commit**

```bash
git add types.ts lib/optionFolders.ts
git commit -m "feat: tipos y helpers para carpetas de etiquetas"
```

---

## Task 2: Blindar consumidores legacy (no crashear con el array mixto)

**Files:**
- Modify: `components/ProductModal.tsx:1-19`
- Modify: `components/ProductEditModal.tsx:1-25`
- Modify: `hooks/useProducts.ts:24,48,60`

- [ ] **Step 1: `ProductModal.tsx` — aplanar opciones**

En `components/ProductModal.tsx`, añadir el import (junto a los imports existentes, después de la línea 4):

```ts
import { flattenOptions } from '../lib/optionFolders';
```

Reemplazar la línea 17:

```ts
    const options = product.customizableOptions || [];
```

por:

```ts
    // Modal legacy de selección única: aplanamos carpetas a una lista plana para no crashear.
    const options = flattenOptions(product.customizableOptions);
```

- [ ] **Step 2: `ProductEditModal.tsx` — aplanar opciones**

En `components/ProductEditModal.tsx`, añadir el import (después de la línea 6):

```ts
import { flattenOptions } from '../lib/optionFolders';
```

Reemplazar la línea 25:

```ts
  const [options, setOptions] = useState<string[]>(product.customizableOptions || []);
```

por:

```ts
  // NOTA: este modal es código muerto (nada llama a setEditingProduct). Se aplana solo para
  // satisfacer el tipo; NO edita carpetas. El flujo real de edición usa ProductOptionsModal.
  const [options, setOptions] = useState<string[]>(flattenOptions(product.customizableOptions));
```

- [ ] **Step 3: `useProducts.ts` — tipar el campo**

En `hooks/useProducts.ts`, añadir el import del tipo (junto a los imports de tipos existentes):

```ts
import { CustomizableOption } from '../types';
```

Cambiar las tres apariciones de `customizable_options?: string[]` / `customizable_options: string[]` / `customizableOptions?: string[]` (líneas 24, 48, 60) a usar `CustomizableOption[]`:

- Línea 24: `customizable_options?: CustomizableOption[];`
- Línea 48: `customizable_options: CustomizableOption[];`
- Línea 60: `customizableOptions?: CustomizableOption[];`

- [ ] **Step 4: Verificar typecheck**

Run: `npm run build`
Expected: PASS sin errores de tipo en estos archivos.

- [ ] **Step 5: Commit**

```bash
git add components/ProductModal.tsx components/ProductEditModal.tsx hooks/useProducts.ts
git commit -m "fix: blindar consumidores legacy ante etiquetas en carpetas"
```

---

## Task 3: Tab "Modificar" — render de carpetas con desplegable y badge

**Files:**
- Modify: `components/ProductOptionsModal.tsx` (imports, props, estado use-tab, JSX de opciones)

- [ ] **Step 1: Imports y tipo de prop**

En `components/ProductOptionsModal.tsx`, añadir import (después de la línea 6, `formatCurrency`):

```ts
import { splitOptions, flattenOptions } from '../lib/optionFolders';
import { CustomizableOption } from '../types';
```

Cambiar el tipo de la prop `categoryOptions` en `ProductOptionsModalProps` (línea 14) de:

```ts
    categoryOptions?: string[]; // Options from the product's category
```

a:

```ts
    categoryOptions?: CustomizableOption[]; // Etiquetas de la categoría (sueltas + carpetas)
```

- [ ] **Step 2: Estado y derivados del use-tab**

Reemplazar el bloque actual (líneas 57-60):

```ts
    // Use category options minus excluded for this product
    const excludedOptions = (product as any).excludedOptions || [];
    const effectiveOptions = propCategoryOptions.filter(opt => !excludedOptions.includes(opt));
    const options = effectiveOptions;
```

por:

```ts
    // Separar sueltas/carpetas y quitar las excluidas de este producto (por nombre).
    const excludedOptions = (product as any).excludedOptions || [];
    const { loose: looseRaw, folders: foldersRaw } = useMemo(
        () => splitOptions(propCategoryOptions),
        [propCategoryOptions]
    );
    const visibleLoose = looseRaw.filter(opt => !excludedOptions.includes(opt));
    const visibleFolders = foldersRaw
        .map(f => ({ name: f.name, options: f.options.filter(opt => !excludedOptions.includes(opt)) }))
        .filter(f => f.options.length > 0);
```

- [ ] **Step 3: Estado de carpetas abiertas (junto a los demás useState del use-tab)**

Añadir después del `const [notes, setNotes] = ...` (línea 67):

```ts
    // Carpetas desplegadas en el tab "Modificar" (varias pueden estar abiertas).
    const [openFolders, setOpenFolders] = useState<string[]>([]);
    const toggleFolder = (name: string) =>
        setOpenFolders(prev => (prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]));
```

- [ ] **Step 4: Ajustar `hasOptions`**

Reemplazar la línea 85:

```ts
    const hasOptions = showCustomization && options.length > 0;
```

por:

```ts
    const hasOptions = showCustomization && (visibleLoose.length > 0 || visibleFolders.length > 0);
```

- [ ] **Step 5: Reemplazar el JSX del bloque "Options" (use-tab)**

Reemplazar todo el bloque `{hasOptions && (...)}` del use-tab (líneas 331-352) por:

```tsx
                                    {/* Options */}
                                    {hasOptions && (
                                        <div className="mb-5 border-t border-gray-100 dark:border-gray-800 pt-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="material-symbols-outlined text-gray-400 text-[18px]">sell</span>
                                                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">OPCIONES</h3>
                                            </div>

                                            {/* Etiquetas sueltas (legacy) primero */}
                                            {visibleLoose.length > 0 && (
                                                <div className="flex flex-wrap gap-2 mb-3">
                                                    {visibleLoose.map((option) => (
                                                        <button
                                                            key={option}
                                                            onClick={() => toggleOption(option)}
                                                            className={`px-4 py-2 rounded-xl border text-sm font-bold transition-all active:scale-95 ${selectedOptions.includes(option)
                                                                ? 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-500/50 dark:bg-orange-500/10 dark:text-orange-400 ring-1 ring-orange-200 dark:ring-orange-900/50 shadow-sm'
                                                                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-text-secondary hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                                                }`}
                                                        >
                                                            {option}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Carpetas desplegables */}
                                            <div className="space-y-2">
                                                {visibleFolders.map((folder) => {
                                                    const isOpen = openFolders.includes(folder.name);
                                                    const selectedCount = folder.options.filter(o => selectedOptions.includes(o)).length;
                                                    return (
                                                        <div key={folder.name} className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                                                            <button
                                                                onClick={() => toggleFolder(folder.name)}
                                                                className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                                            >
                                                                <span className="flex items-center gap-2 text-sm font-bold text-text-main dark:text-white">
                                                                    <span className="material-symbols-outlined text-[18px] text-gray-400">folder</span>
                                                                    {folder.name}
                                                                    {selectedCount > 0 && (
                                                                        <span className="px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400 text-[11px] font-bold">
                                                                            {selectedCount}
                                                                        </span>
                                                                    )}
                                                                </span>
                                                                <span className={`material-symbols-outlined text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
                                                            </button>
                                                            {isOpen && (
                                                                <div className="flex flex-wrap gap-2 p-3">
                                                                    {folder.options.map((option) => (
                                                                        <button
                                                                            key={`${folder.name}/${option}`}
                                                                            onClick={() => toggleOption(option)}
                                                                            className={`px-4 py-2 rounded-xl border text-sm font-bold transition-all active:scale-95 ${selectedOptions.includes(option)
                                                                                ? 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-500/50 dark:bg-orange-500/10 dark:text-orange-400 ring-1 ring-orange-200 dark:ring-orange-900/50 shadow-sm'
                                                                                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-text-secondary hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                                                                }`}
                                                                        >
                                                                            {option}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
```

- [ ] **Step 6: Verificar typecheck**

Run: `npm run build`
Expected: PASS. (Si `useMemo` no estuviera importado, ya lo está en la línea 2: `useState, useEffect, useRef, useMemo`.)

- [ ] **Step 7: Verificación manual (use-tab)**

Run: `npm run dev`. En un producto con carpetas configuradas (ver Task 4 para crearlas) o editando el jsonb manualmente:
- En "Modificar", las sueltas aparecen como chips arriba.
- Cada carpeta aparece cerrada; al tocarla se despliega y muestra sus etiquetas.
- Al seleccionar etiquetas dentro y cerrar la carpeta, el título muestra el badge con el número (ej. `HELADOS · 2`).
- "Agregar a la Orden" lleva las etiquetas seleccionadas al carrito igual que antes.

- [ ] **Step 8: Commit**

```bash
git add components/ProductOptionsModal.tsx
git commit -m "feat: carpetas desplegables con badge en el tab Modificar"
```

---

## Task 4: Tab "Ajustes" — crear carpetas, mover sueltas, editar

**Files:**
- Modify: `components/ProductOptionsModal.tsx` (estado config, handlers, `isDirty`, JSX de etiquetas)

- [ ] **Step 1: Tipar estado config y añadir estado del selector de carpeta**

Cambiar la línea 72:

```ts
    const [configOptions, setConfigOptions] = useState<string[]>(propCategoryOptions);
```

por:

```ts
    const [configOptions, setConfigOptions] = useState<CustomizableOption[]>(propCategoryOptions);
```

Añadir después de la línea 75 (`const [newOption, setNewOption] = useState('');`):

```ts
    // Inputs para agregar etiqueta dentro de cada carpeta (clave = nombre de carpeta).
    const [folderInputs, setFolderInputs] = useState<Record<string, string>>({});
    // Etiqueta suelta que se está moviendo a una carpeta (abre el selector inline).
    const [movingOption, setMovingOption] = useState<string | null>(null);
    const [newFolderName, setNewFolderName] = useState('');
```

- [ ] **Step 2: `isDirty` estructural**

Reemplazar el bloque de comparación de opciones en `isDirty` (líneas 158-159):

```ts
        if (configOptions.length !== initialCatOptions.length) return true;
        if (!configOptions.every((val, index) => val === initialCatOptions[index])) return true;
```

por:

```ts
        // Array mixto (strings + objetos carpeta): comparar estructuralmente.
        if (JSON.stringify(configOptions) !== JSON.stringify(initialCatOptions)) return true;
```

- [ ] **Step 3: Handlers de carpetas (reemplazar `addOption`/`removeOption`)**

Reemplazar las funciones `addOption` y `removeOption` (líneas 232-241):

```ts
    const addOption = () => {
        if (newOption.trim()) {
            setConfigOptions([...configOptions, newOption.trim()]);
            setNewOption('');
        }
    };

    const removeOption = (index: number) => {
        setConfigOptions(configOptions.filter((_, i) => i !== index));
    };
```

por:

```ts
    // Crear una carpeta vacía.
    const addFolder = () => {
        const name = newFolderName.trim();
        if (!name || configOptions.some(o => isFolder(o) && o.name === name)) return;
        setConfigOptions([...configOptions, { name, options: [] }]);
        setNewFolderName('');
    };

    // Eliminar una carpeta completa (con sus etiquetas).
    const removeFolder = (name: string) => {
        setConfigOptions(configOptions.filter(o => !(isFolder(o) && o.name === name)));
    };

    // Agregar una etiqueta dentro de una carpeta.
    const addOptionToFolder = (folderName: string) => {
        const value = (folderInputs[folderName] || '').trim();
        if (!value) return;
        setConfigOptions(configOptions.map(o =>
            isFolder(o) && o.name === folderName && !o.options.includes(value)
                ? { ...o, options: [...o.options, value] }
                : o
        ));
        setFolderInputs(prev => ({ ...prev, [folderName]: '' }));
    };

    // Quitar una etiqueta de una carpeta.
    const removeOptionFromFolder = (folderName: string, option: string) => {
        setConfigOptions(configOptions.map(o =>
            isFolder(o) && o.name === folderName
                ? { ...o, options: o.options.filter(opt => opt !== option) }
                : o
        ));
    };

    // Eliminar una etiqueta suelta (legacy).
    const removeLooseOption = (option: string) => {
        setConfigOptions(configOptions.filter(o => !(typeof o === 'string' && o === option)));
        setExcludedOpts(prev => prev.filter(x => x !== option));
    };

    // Mover una etiqueta suelta a una carpeta (nueva o existente).
    const moveLooseToFolder = (option: string, folderName: string) => {
        const target = folderName.trim();
        if (!target) return;
        let foundFolder = false;
        const next: CustomizableOption[] = configOptions
            .filter(o => !(typeof o === 'string' && o === option)) // sacar de sueltas
            .map(o => {
                if (isFolder(o) && o.name === target) {
                    foundFolder = true;
                    return o.options.includes(option) ? o : { ...o, options: [...o.options, option] };
                }
                return o;
            });
        if (!foundFolder) next.push({ name: target, options: [option] });
        setConfigOptions(next);
        setMovingOption(null);
    };
```

Añadir el import de `isFolder` (ya importamos `splitOptions, flattenOptions` en Task 3; ampliar esa línea):

```ts
import { splitOptions, flattenOptions, isFolder } from '../lib/optionFolders';
```

- [ ] **Step 4: Derivar sueltas/carpetas del estado config**

Añadir justo antes del `return (` del componente (cerca de la línea 243, después de `const total = ...`):

```ts
    const configSplit = splitOptions(configOptions);
    const folderNames = configSplit.folders.map(f => f.name);
```

- [ ] **Step 5: Reemplazar el JSX de la lista de etiquetas (config-tab)**

Reemplazar todo el bloque dentro de `{hasCategoryId && (<> ... </>)}` que renderiza la lista de opciones y el input (líneas 517-565) por:

```tsx
                                        {hasCategoryId && (
                                            <>
                                                {/* Etiquetas sueltas (legacy) — con botón "+" para moverlas a una carpeta */}
                                                {configSplit.loose.length > 0 && (
                                                    <div className="space-y-2 mb-4">
                                                        {configSplit.loose.map((opt) => {
                                                            const isExcluded = excludedOpts.includes(opt);
                                                            return (
                                                                <div key={`loose/${opt}`}>
                                                                    <div className={`flex items-center gap-2 p-2 rounded-lg border ${isExcluded ? 'bg-gray-100 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 opacity-60' : 'bg-gray-50 dark:bg-gray-800/30 border-gray-100 dark:border-gray-800'}`}>
                                                                        <span className={`flex-1 text-sm font-medium ${isExcluded ? 'text-gray-400 line-through' : 'text-text-main dark:text-white'}`}>{opt}</span>
                                                                        {/* Mover a carpeta */}
                                                                        <button
                                                                            onClick={() => setMovingOption(movingOption === opt ? null : opt)}
                                                                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-200 transition-colors flex items-center gap-1"
                                                                            title="Mover a una carpeta"
                                                                        >
                                                                            <span className="material-symbols-outlined text-[14px]">create_new_folder</span>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                if (isExcluded) setExcludedOpts(prev => prev.filter(o => o !== opt));
                                                                                else setExcludedOpts(prev => [...prev, opt]);
                                                                            }}
                                                                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${isExcluded ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200' : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-300'}`}
                                                                            title={isExcluded ? 'Incluir en este producto' : 'Excluir de este producto'}
                                                                        >
                                                                            {isExcluded ? 'Incluir' : 'Excluir'}
                                                                        </button>
                                                                        <button onClick={() => removeLooseOption(opt)} className="text-red-400 hover:text-red-500 p-1">
                                                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                                                        </button>
                                                                    </div>
                                                                    {/* Selector de carpeta destino */}
                                                                    {movingOption === opt && (
                                                                        <div className="flex flex-wrap gap-2 mt-1.5 pl-2">
                                                                            {folderNames.map(fname => (
                                                                                <button
                                                                                    key={fname}
                                                                                    onClick={() => moveLooseToFolder(opt, fname)}
                                                                                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-emerald-400 text-text-main dark:text-white"
                                                                                >
                                                                                    {fname}
                                                                                </button>
                                                                            ))}
                                                                            <div className="flex gap-1">
                                                                                <input
                                                                                    type="text"
                                                                                    value={newFolderName}
                                                                                    onChange={(e) => setNewFolderName(e.target.value)}
                                                                                    placeholder="Nueva carpeta..."
                                                                                    className="w-32 bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                                                                    onKeyDown={(e) => { if (e.key === 'Enter') { moveLooseToFolder(opt, newFolderName); setNewFolderName(''); } }}
                                                                                />
                                                                                <button onClick={() => { moveLooseToFolder(opt, newFolderName); setNewFolderName(''); }} className="bg-emerald-600 text-white px-2 rounded-lg text-xs font-bold">OK</button>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                {/* Carpetas */}
                                                <div className="space-y-3 mb-3">
                                                    {configSplit.folders.map((folder) => (
                                                        <div key={folder.name} className="border border-gray-200 dark:border-gray-700 rounded-xl p-3">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <span className="material-symbols-outlined text-[18px] text-gray-400">folder</span>
                                                                <span className="flex-1 text-sm font-bold text-text-main dark:text-white">{folder.name}</span>
                                                                <button onClick={() => removeFolder(folder.name)} className="text-red-400 hover:text-red-500 p-1" title="Eliminar carpeta">
                                                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                                                </button>
                                                            </div>
                                                            <div className="space-y-2 mb-2">
                                                                {folder.options.map((opt) => {
                                                                    const isExcluded = excludedOpts.includes(opt);
                                                                    return (
                                                                        <div key={`${folder.name}/${opt}`} className={`flex items-center gap-2 p-2 rounded-lg border ${isExcluded ? 'bg-gray-100 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 opacity-60' : 'bg-gray-50 dark:bg-gray-800/30 border-gray-100 dark:border-gray-800'}`}>
                                                                            <span className={`flex-1 text-sm font-medium ${isExcluded ? 'text-gray-400 line-through' : 'text-text-main dark:text-white'}`}>{opt}</span>
                                                                            <button
                                                                                onClick={() => {
                                                                                    if (isExcluded) setExcludedOpts(prev => prev.filter(o => o !== opt));
                                                                                    else setExcludedOpts(prev => [...prev, opt]);
                                                                                }}
                                                                                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${isExcluded ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200' : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-300'}`}
                                                                                title={isExcluded ? 'Incluir en este producto' : 'Excluir de este producto'}
                                                                            >
                                                                                {isExcluded ? 'Incluir' : 'Excluir'}
                                                                            </button>
                                                                            <button onClick={() => removeOptionFromFolder(folder.name, opt)} className="text-red-400 hover:text-red-500 p-1">
                                                                                <span className="material-symbols-outlined text-[18px]">delete</span>
                                                                            </button>
                                                                        </div>
                                                                    );
                                                                })}
                                                                {folder.options.length === 0 && <p className="text-xs text-text-secondary italic px-2">Carpeta vacía.</p>}
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="text"
                                                                    value={folderInputs[folder.name] || ''}
                                                                    onChange={(e) => setFolderInputs(prev => ({ ...prev, [folder.name]: e.target.value }))}
                                                                    placeholder="Agregar etiqueta..."
                                                                    className="flex-1 bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                                                    onKeyDown={(e) => e.key === 'Enter' && addOptionToFolder(folder.name)}
                                                                />
                                                                <button onClick={() => addOptionToFolder(folder.name)} className="bg-gray-200 dark:bg-gray-700 text-text-main dark:text-white px-3 py-2 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-bold text-sm">
                                                                    <span className="material-symbols-outlined">add</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {configOptions.length === 0 && <p className="text-xs text-text-secondary italic p-2">Sin etiquetas definidas.</p>}
                                                </div>

                                                {/* Crear nueva carpeta */}
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={movingOption ? '' : newFolderName}
                                                        onChange={(e) => setNewFolderName(e.target.value)}
                                                        placeholder="Nueva carpeta (ej. HELADOS)..."
                                                        disabled={!!movingOption}
                                                        className="flex-1 bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none disabled:opacity-50"
                                                        onKeyDown={(e) => e.key === 'Enter' && addFolder()}
                                                    />
                                                    <button onClick={addFolder} disabled={!!movingOption} className="bg-emerald-600 text-white px-3 py-2 rounded-lg hover:bg-emerald-700 font-bold text-sm flex items-center gap-1 disabled:opacity-50">
                                                        <span className="material-symbols-outlined text-[18px]">create_new_folder</span>
                                                    </button>
                                                </div>
                                            </>
                                        )}
```

- [ ] **Step 6: Verificar typecheck**

Run: `npm run build`
Expected: PASS sin errores.

- [ ] **Step 7: Verificación manual (config-tab + guardado)**

Run: `npm run dev`. En un producto con categoría:
- En "Ajustes" → crear una carpeta `HELADOS`; agregar etiquetas dentro.
- Si hay etiquetas sueltas legacy, tocar el "+" (📁) y moverla a `HELADOS` o a una carpeta nueva → desaparece de sueltas y aparece en la carpeta.
- "Guardar Configuración" se habilita solo al haber cambios (verificar que el botón se activa).
- Tras guardar, reabrir el modal: las carpetas persisten (vienen del jsonb de la categoría).
- Excluir una etiqueta dentro de una carpeta para este producto → en "Modificar" no aparece.

- [ ] **Step 8: Commit**

```bash
git add components/ProductOptionsModal.tsx
git commit -m "feat: crear/editar carpetas y mover etiquetas sueltas en Ajustes"
```

---

## Task 5: Documentación

**Files:**
- Modify: `docs/caracteristicas/etiquetas_por_categoria.md`

- [ ] **Step 1: Documentar el modelo de carpetas**

Añadir tras la sección "Estructura de Datos" de `docs/caracteristicas/etiquetas_por_categoria.md` el siguiente bloque:

```markdown
### Carpetas (sub-modificadores)

`customizable_options` ahora es un **array mixto**: cada elemento es un string
(etiqueta suelta legacy) o una carpeta `{ "name": "HELADOS", "options": ["VAINILLA", "FRESA"] }`.
Un solo nivel de anidación. Sin migración: las etiquetas viejas siguen siendo strings.

- En **Modificar**: las sueltas se muestran como chips; las carpetas como filas
  desplegables con badge del número de etiquetas seleccionadas adentro.
- En **Ajustes**: botón "Nueva carpeta"; cada suelta tiene un "+" para moverla a una
  carpeta (existente o nueva) e ir limpiando hasta que solo queden carpetas.
- Helpers en `lib/optionFolders.ts` (`isFolder`, `flattenOptions`, `splitOptions`).
  Los consumidores legacy (`ProductModal`, `ProductEditModal`) usan `flattenOptions`.
- La selección al vender sigue produciendo un `cookingTerm` plano: carrito, comanda y
  ticket impreso no cambian.
```

- [ ] **Step 2: Commit**

```bash
git add docs/caracteristicas/etiquetas_por_categoria.md
git commit -m "docs: carpetas de etiquetas en etiquetas_por_categoria"
```

---

## Self-Review (cobertura del spec)

- Modelo de datos array mixto → Task 1 ✅
- Helpers `isFolder`/`flattenOptions`/`splitOptions` → Task 1 ✅
- Blindar `ProductModal`/`ProductEditModal`/`useProducts` → Task 2 ✅
- Tab Modificar: sueltas arriba, carpetas desplegables, badge numérico, selección múltiple, filtro de excluidas dentro de carpetas → Task 3 ✅
- Tab Ajustes: nueva carpeta, agregar/eliminar etiqueta en carpeta, eliminar carpeta, "+" mover suelta a carpeta, excluir/incluir → Task 4 ✅
- `isDirty` estructural y keys únicas → Task 4 (Step 2) / Task 3 (keys `folder/option`) ✅
- Guardado jsonb sin cambios en `handleProductUpdate` → sin tarea (ya funciona; verificado en Task 4 Step 7) ✅
- Sin migración SQL → confirmado ✅
- Docs → Task 5 ✅
