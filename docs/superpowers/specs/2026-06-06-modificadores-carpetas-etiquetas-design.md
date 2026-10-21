# Carpetas de etiquetas (sub-modificadores) en el modo catálogo

Fecha: 2026-06-06
Estado: Diseño aprobado

## Problema

En productos con muchas etiquetas (ej. CHOLAO CON HELADO: ~15 opciones de helado,
crema, "sin..."), el tab **Modificar** del `ProductOptionsModal` muestra una lista
plana enorme que abruma visualmente al vendedor. No hay forma de agrupar.

## Objetivo

Permitir agrupar etiquetas en **carpetas** (un solo nivel: carpeta → etiquetas).
Al vender, el vendedor ve primero las carpetas y, al tocar una, se despliegan sus
etiquetas. El fin es organizar y reducir el ruido visual — **sin cambiar la lógica
de venta** (selección, carrito, comanda, ticket impreso quedan idénticos).

## Decisiones tomadas (brainstorming)

- **Un solo nivel** de anidación: carpeta → etiquetas. No hay sub-carpetas.
- **Selección múltiple dentro de cada carpeta** (igual que hoy).
- **Etiquetas viejas (sueltas) se quedan como están**; solo las nuevas van en
  carpetas. El modal muestra las sueltas arriba y las carpetas debajo.
- En el tab Ajustes, cada etiqueta suelta tiene un **"+"** para moverla a una
  carpeta (existente o nueva), de modo que el usuario pueda limpiar hasta que solo
  queden carpetas.
- Carpeta cerrada con selecciones adentro muestra un **badge con número**
  (ej. `HELADOS · 2`).

## Modelo de datos

`categories.customizable_options` (jsonb) pasa de array plano de strings a
**array mixto**, donde cada elemento es:

- un **string** → etiqueta suelta (legacy), o
- un **objeto carpeta** → `{ "name": "HELADOS", "options": ["VAINILLA", "FRESA"] }`

Ejemplo:
```json
["SIN PAPAYA", "SIN SANDIA", { "name": "HELADOS", "options": ["VAINILLA", "FRESA"] }]
```

- **Sin migración SQL**: la columna ya es jsonb; las etiquetas viejas siguen siendo
  strings y funcionan igual.
- `products.excluded_options` sigue siendo `string[]` **por nombre de etiqueta**.
  La exclusión/inclusión por producto funciona igual para etiquetas sueltas y para
  etiquetas dentro de carpetas (se compara por nombre).

### Tipos (`types.ts`)

```ts
export interface OptionFolder {
  name: string;
  options: string[];
}
export type CustomizableOption = string | OptionFolder;
// Product.customizableOptions?: CustomizableOption[]
```

### Helper (`lib/optionFolders.ts`, nuevo)

Para que el resto del código que espera un `string[]` plano no se rompa:

- `isFolder(item): item is OptionFolder` — type guard.
- `flattenOptions(opts: CustomizableOption[]): string[]` — devuelve todos los
  nombres de etiqueta (sueltas + dentro de carpetas). Lo usan los consumidores que
  solo necesitan la lista plana: `ProductModal.tsx`, `ProductEditModal.tsx`.
- `splitOptions(opts: CustomizableOption[]): { loose: string[]; folders: OptionFolder[] }`
  — separa para renderizar. Lo usa `ProductOptionsModal`.

## UI — Tab "Modificar" (vender)

1. **Etiquetas sueltas** primero, como chips planos (idéntico a hoy).
2. **Carpetas** debajo, cada una como fila colapsable:
   - Título de la carpeta + badge con número de etiquetas seleccionadas adentro
     (ej. `HELADOS · 2`). Sin badge si no hay ninguna seleccionada.
   - Al tocarla, se despliegan sus chips con el mismo estilo y comportamiento de
     selección múltiple actual.
   - Varias carpetas pueden estar abiertas a la vez (toggle independiente).
3. La selección sigue alimentando `selectedOptions` → `cookingTerm`
   (`selectedOptions.join(', ')`). **No cambia nada aguas abajo.**
4. La exclusión por producto se aplica antes de pintar: una etiqueta excluida no
   aparece (ni suelta ni dentro de su carpeta). Una carpeta que queda vacía tras
   excluir todas sus etiquetas no se muestra.

## UI — Tab "Ajustes" (config)

- Las **etiquetas sueltas** legacy se muestran arriba. Cada fila mantiene los
  controles actuales (Excluir/Incluir, eliminar) **más un botón "+"** que abre un
  selector: elegir una carpeta existente o crear una nueva; al confirmar, la
  etiqueta se **mueve** dentro de esa carpeta (sale de las sueltas).
- Botón **"Nueva carpeta"** (pide nombre) → crea una carpeta vacía.
- Cada **carpeta** se renderiza como un bloque con:
  - nombre de la carpeta + botón eliminar carpeta (con sus etiquetas),
  - lista de etiquetas dentro, cada una con Excluir/Incluir y eliminar,
  - input para agregar una etiqueta nueva a esa carpeta.
- **Lo nuevo se agrega siempre dentro de una carpeta** (no se crean más sueltas).
- El estado local del modal trabaja sobre `CustomizableOption[]`; al guardar se
  envía tal cual a `customizable_options`.

## Guardado

`App.tsx > handleProductUpdate` ya hace
`categories.update({ customizable_options: categoryOptions })` con lo que reciba.
Como es jsonb, el array mixto se persiste sin cambios. La activación bulk de
`has_customization` cuando hay opciones se mantiene; la condición
`categoryOptions.length > 0` sigue siendo válida (el array mixto no vacío cuenta).

## Hallazgos de revisión del código (riesgos a cubrir en el plan)

1. **`ProductModal.tsx` está vivo** (se abre vía `addToCart={handleProductSelect}`,
   App.tsx:2693 y 2874) y renderiza `customizableOptions` como hijos de React con
   **selección única** (líneas 18, 111). Con el array mixto pintaría `[object Object]`
   y `selectedOption` podría quedar en un objeto. → Aplanar con `flattenOptions`. Es
   el modal legacy de selección única; no recibe carpetas, solo se evita el crash.

2. **`ProductEditModal.tsx` es código muerto pero peligroso.** Nada llama a
   `setEditingProduct(product)`; `handleEditProduct` (App.tsx:1236) enruta al
   `ProductOptionsModal`. Su `handleSave` guarda `customizableOptions: options`
   **plano** (línea 100): si se reactivara, **destruiría las carpetas**. Además deja
   de compilar al cambiar el tipo. → Aplanar al cargar para arreglar el tipo y
   dejarlo fuera del flujo (no editar carpetas ahí). Opcional: eliminarlo.

3. **`isDirty` compara arrays con `===` por elemento** (ProductOptionsModal.tsx:158).
   Con objetos carpeta la comparación por identidad falla. → Comparar
   estructuralmente (p. ej. `JSON.stringify` del array mixto) para `configOptions`.

4. **Claves de React**: usar `carpeta/etiqueta` como `key` para evitar colisión si
   dos carpetas comparten un nombre de etiqueta.

## Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `types.ts` | `OptionFolder`, `CustomizableOption`; tipar `customizableOptions` |
| `lib/optionFolders.ts` (nuevo) | `isFolder`, `flattenOptions`, `splitOptions` |
| `components/ProductOptionsModal.tsx` | Render de carpetas en ambos tabs; estado mixto; "+" mover a carpeta; "Nueva carpeta"; badge de conteo; expand/colapso; `isDirty` estructural; keys únicas; filtro de excluidas dentro de carpetas |
| `components/ProductModal.tsx` | `flattenOptions` al leer `customizableOptions` (evitar crash) |
| `components/ProductEditModal.tsx` | `flattenOptions` para satisfacer el tipo; código muerto, no edita carpetas |
| `hooks/useProducts.ts` | Tipado del campo a `CustomizableOption[]` (el mapeo ya pasa el array tal cual) |
| `App.tsx` (fetch/guardado) | Tipado; `handleProductUpdate` ya persiste el jsonb tal cual |
| `docs/caracteristicas/etiquetas_por_categoria.md` | Documentar carpetas |

Sin migración SQL.

## Fuera de alcance (YAGNI)

- Sub-carpetas (más de un nivel).
- Selección excluyente "elige una" por carpeta.
- Reordenar carpetas/etiquetas por drag & drop.
- Migración automática de etiquetas sueltas (se hace manual con el "+").
