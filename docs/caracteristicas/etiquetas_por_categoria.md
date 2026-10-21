# Etiquetas por Categoría (con Carpetas / Sub-modificadores)

Componentes: `components/ProductOptionsModal.tsx`
Helpers: `lib/optionFolders.ts`
Hooks: `useProducts.ts`
Realtime / guardado: `App.tsx`
Guardado en BD: RPC `save_product_modifiers` (SECURITY DEFINER)
Tablas: `categories.customizable_options`, `products.excluded_options`
Acceso: Punto de Venta → Modal de opciones → Tab "Ajustes"
Permisos: pueden crear/editar etiquetas, carpetas y productos-modificadores los roles **Administrador** y **Cajero** (ver "Permisos y guardado vía RPC").

Las etiquetas (opciones de personalización) se gestionan a nivel de **categoría**, evitando configurarlas producto por producto. Todos los productos de una categoría comparten las mismas etiquetas. Las etiquetas pueden agruparse en **carpetas** (un nivel) para ordenar productos con muchas opciones.

---

## Estructura de Datos

### Tabla `categories`
```sql
customizable_options jsonb DEFAULT '[]'
```
**Array mixto**: cada elemento es **un string** (etiqueta suelta, legacy), **un objeto carpeta** (`{ name, options }`) o **un objeto producto suelto** (`{ id, name }`, add-on fuera de carpeta):
```json
["SIN PAPAYA", { "name": "HELADOS", "options": ["VAINILLA", "FRESA"] }, { "id": "uuid", "name": "Helado extra" }]
```
- Un solo nivel de anidación (carpeta → etiquetas). No hay sub-carpetas.
- Los productos sueltos guardan solo `{id, name}`; el **precio se resuelve en vivo** del catálogo (igual que los productos dentro de carpetas).
- Sin migración de datos: las etiquetas viejas siguen siendo strings y conviven con carpetas y productos sueltos.

### Tabla `products`
```sql
excluded_options jsonb DEFAULT '[]'
-- Array de strings que cubre tres tipos de exclusión por producto:
--   1) Etiquetas sueltas → por NOMBRE de etiqueta (ej. "SIN AZUCAR")
--   2) Productos sueltos → por NOMBRE del producto (ej. "Helado extra")
--   3) Carpetas enteras → con prefijo `folder:` + nombre (ej. "folder:HELADOS")
-- La distinción se hace en el modal:
--   - prefijo `folder:` → exclusión de carpeta
--   - resto → se compara contra los nombres de productos sueltos actuales/iniciales para decidir
--     si es exclusión de producto o de etiqueta.
-- Sin migración: se reusa el mismo array `string[]` para evitar nueva columna.
```

### Helpers — `lib/optionFolders.ts`
| Función | Qué hace |
|---------|----------|
| `isFolder(item)` | Type guard: distingue carpeta (`{name, options}`) de string suelto |
| `isProductOption(item)` | Type guard: producto suelto (`{id, name}`, sin `options`) |
| `flattenOptions(opts)` | Devuelve **todos** los nombres de etiqueta de texto (sueltas + dentro de carpetas) como `string[]` plano. Omite productos |
| `splitOptions(opts)` | Separa en `{ loose: string[], folders: OptionFolder[], products: ModifierProduct[] }` para renderizar |

Tipos en `types.ts`: `OptionFolder { name; options }` y `CustomizableOption = string | OptionFolder`.
Los consumidores legacy (`ProductModal`, `ProductEditModal`) usan `flattenOptions` para no romperse con el array mixto.

---

## Reglas de Negocio

| Regla | Comportamiento |
|-------|---------------|
| Agregar etiqueta / carpeta / producto suelto | Se guarda en `categories.customizable_options` de la categoría del producto |
| Guardar etiquetas | Activa `has_customization = true` en **todos** los productos de esa categoría (bulk) |
| Eliminar etiqueta / carpeta / producto suelto | Se remueve de la categoría (afecta a todos los productos) |
| Excluir etiqueta de un producto | Se agrega a `products.excluded_options` con el nombre de la etiqueta. Disponible en sueltas y dentro de carpetas |
| Excluir producto suelto de un producto | Se agrega a `products.excluded_options` con el nombre del producto suelto |
| **Excluir carpeta entera de un producto** | Se agrega `folder:<nombre>` a `products.excluded_options`. La carpeta no aparece en el tab "Modificar" para ese producto. En "Ajustes" se muestra en gris/tachado y permite re-incluirla |
| Re-incluir | Se remueve la entrada correspondiente de `excluded_options` |
| Mover etiqueta suelta | Sale del array como string y entra a `options` de una carpeta |
| **Quién puede configurar** | Roles **Administrador** y **Cajero**. El guardado pasa por la RPC `save_product_modifiers` (no por escritura directa a las tablas), que valida negocio y rol en la BD |
| Producto sin categoría | No puede tener etiquetas (ya no aplica en la práctica: los productos están obligados a tener categoría) |
| Personalización | **Siempre activa**: no hay toggle; al guardar se manda `has_customization: true` |
| Ingredientes | **Ocultos** en el modal (solo se gestionan etiquetas/carpetas/productos) |

---

## UI en ProductOptionsModal

### Tab "Ajustes" (configuración) — sub-pestañas

El tab Ajustes se divide en **3 sub-pestañas** con segmented control superior, cada una con su lista, su acción de creación y su indicador de cambios.

```
┌──────────────────────────────────────────────┐
│ [📦] Azucar x lb                [ⓘ Info]  ×  │  ← header con botón Info
├──────────────────────────────────────────────┤
│  Modificar          Ajustes                  │  ← tab principal con underline
│                     ━━━━━━━━━                │     amber-400 (3px)
├──────────────────────────────────────────────┤
│  ┌─────────────────────────────────────┐     │
│  │ Etiquetas •│ ▰ Carpetas │ Productos │     │  ← segmented control
│  └─────────────────────────────────────┘     │     punto naranja = dirty por sub-tab
├──────────────────────────────────────────────┤
│  (lista scrolleable de la sub-pestaña)      │
│  SIN CEBOLLA      [📁→] [Excluir] [🗑]      │
│  SIN CARNE        [📁→] [Incluir] [🗑]      │
│  ...                                         │
├──────────────────────────────────────────────┤
│  [ Nueva etiqueta...      ] [ Crear ]        │  ← input fijo (no scroll)
├──────────────────────────────────────────────┤
│           Guardar Configuración              │  ← footer (1 botón global)
└──────────────────────────────────────────────┘
```

**Sub-pestañas (segmented control)**
- Track gris claro `bg-gray-100`, tile activo blanco con `shadow-sm`. Sin iconos para no recargar.
- Tipografía: `text-sm font-semibold` (sin uppercase, sin tracking-wide).
- Cada sub-pestaña tiene un **punto naranja** (`bg-orange-500`) cuando hay cambios sin guardar **en esa sub-pestaña**, así sabes en qué sección hay edición pendiente aunque no estés en ella.

**Sub-pestaña Etiquetas** (`configSplit.loose`)
- Lista de filas con: nombre, **`📁→`** (mover a carpeta), **`Excluir/Incluir`**, **`🗑`**.
- Input "Nueva etiqueta..." + botón **`Crear`** (verde emerald, sin icono `+`).

**Sub-pestaña Carpetas** (`configSplit.folders`)
- Chips compactos sin icono `folder` (el contexto ya lo dice). Cada chip tiene: nombre, contador, chevron `▾`.
- Al lado del chip: botón **`Excluir/Incluir`** para excluir la **carpeta entera** del producto actual (ver "Reglas de Negocio").
- Si la carpeta está excluida: chip en gris/tachado/`opacity-60`.
- Click en chip → abre el **flyout flotante** existente (lateral en desktop, bottom sheet en móvil) para editar etiquetas/productos internos.
- Input "Nueva carpeta..." + botón **`Crear`**.

**Sub-pestaña Productos** (`configSplit.products`)
- Lista de filas con: nombre, precio en vivo, **`Excluir/Incluir`**, **`🗑`**. Sin icono `sell` decorativo.
- Input "Buscar producto para agregar..." con dropdown en portal (ancla al input, fuera del modal).

**Layout: lista scrolleable + input fijo abajo**
Cada sub-pestaña usa `flex flex-col` con tres bandas:
- Sub-tabs (`shrink-0`) — siempre arriba
- Lista (`flex-1 min-h-0 overflow-y-auto`) — única zona que scrollea
- Input crear/buscar (`shrink-0 pt-3`) — siempre abajo, no se oculta cuando hay scroll

**Auto-scroll al agregar**
- Hay un `listScrollRef` único (solo se monta una sub-pestaña a la vez).
- `scrollListToBottom()` (en `requestAnimationFrame`) se invoca al final de `addLooseOption`, `addFolder` y `addLooseProduct`, así el último item agregado queda visible.

**Inputs compactos**
- Los inputs "Nueva etiqueta", "Nueva carpeta" y "Buscar producto" están en wrappers `max-w-sm` (384px) para no estirar al máximo.

### Botón "Info" en el header

A la izquierda de la `×` hay un botón pequeño **`ⓘ Info`** (estilo pill discreto, gris/azul cuando se activa). **Siempre visible** en ambos tabs.

Al click abre un **popover en portal** anclado al botón con dos puntos:

| Punto | Texto |
|-------|-------|
| 📂 (azul) | Las **etiquetas, carpetas y productos que crees o agregues** quedan guardados a nivel de la categoría **"{Nombre}"** y aparecen en todos sus productos |
| 🚫 (naranja) | Las **inclusiones y exclusiones** son por producto: solo afectan a este producto, no a toda la categoría |

Cierre: click en backdrop transparente o tecla `ESC`. z-index `80` (popover) sobre `79` (backdrop), por encima del modal (`70`).

> Reemplaza el aviso azul/ámbar fijo que antes vivía dentro del tab Ajustes.

### Tabs principales (Modificar / Ajustes)

- **Activo**: texto `text-text-main` bold + **underline de 3px** color `primary` (amber-400, paleta del proyecto).
- **Inactivo**: gris `text-gray-400` con hover suave.
- Sin fondo coloreado ni pill: estilo Vercel/Stripe/Linear.
- Iconos `≣ format_list_bulleted` y `⚙ settings` se mantienen (sutiles, ayudan al recall).

### Footer "Guardar Configuración"

- Texto fijo "Guardar Configuración" (sin icono `save`). Al guardar muestra spinner `↻` + "Guardando...".
- Se habilita cuando hay cambios en **cualquier** sub-pestaña (`dirtyByTab.any`), no solo en la activa.
- Al hacer click guarda **todo el estado** en una sola llamada (Opción 1, sin guardado parcial por sub-pestaña).

---

### Tab "Modificar" (uso al vender) — sin cambios funcionales

- Etiquetas sueltas, carpetas (chip + flyout) y productos sueltos como antes.
- Las **carpetas excluidas** (`folder:<name>` en `excluded_options`) no aparecen en este tab para el producto actual.

### Posicionamiento del dropdown flotante de carpeta
- **Desktop (≥768px):** flyout **lateral** al chip (a la derecha; si no cabe, a la izquierda). Se centra verticalmente junto al chip y usa casi toda la altura disponible (scroll interno solo si excede la pantalla). Un `useLayoutEffect` re-mide el chip cuando cambia su ancho (al aparecer el badge) y reposiciona el flyout para que no quede por detrás del chip.
- **Móvil (<768px):** **bottom sheet** (hoja inferior, `slideInUp`, hasta `88vh`) con fondo atenuado, encabezado y "Agregar" fijo abajo. Los listeners de cierre por `scroll`/`resize` se ignoran en móvil para que el teclado no cierre la hoja.

---

## Productos como Modificadores (add-ons con precio)

Además de etiquetas de texto (gratis), una **carpeta puede contener productos** del catálogo que funcionan como **add-ons con precio** (ej. "Helado extra", "Chantilly"). Los productos también pueden agregarse **sueltos** (fuera de carpeta), directo a nivel de categoría. Al venderlos, **suben el precio** de la línea, se ven como **etiqueta** en carrito/comanda, salen como **línea aparte** en el ticket y **descuentan inventario** como una venta normal de ese producto.

> Aplica en el **flujo local / Orden Rápida (catálogo)**. En **modo Mesa (DB)** todavía no se persisten como líneas hijas (pendiente).

### Modelo de datos

| Lugar | Campo | Rol |
|-------|-------|-----|
| `OptionFolder` | `products?: ModifierProduct[]` | Productos de la carpeta. Se guarda **solo `{id, name}`**; el **precio/tipo se resuelven en vivo** del catálogo (no se congela). Se persiste dentro de `categories.customizable_options` (jsonb, sin migración). |
| `CartItem` | `addedModifiers?: AddedModifier[]` | Snapshot `{id,name,price}` de los add-ons de la línea **padre** (solo para precargar el modal al reeditar). |
| `CartItem` | `parentOrderItemId?: string` | Si la línea **es** un add-on, apunta al `orderItemId` de su padre. Es una **línea real** de la orden. |
| `ReceiptItem` | `isModifier?: boolean`, `modifiers?: string[]` | El ticket imprime todas las líneas (los add-ons salen aparte); la comanda **omite** las `isModifier` y muestra `modifiers` como etiquetas del padre. |

### Enfoque: líneas reales vinculadas (no un campo bundle)

El add-on se agrega como **una línea más del carrito/orden** ligada al padre por `parentOrderItemId`. Así **ticket, inventario y totales funcionan solos** (es una venta normal de ese producto); lo único "nuevo" es el **agrupado visual** en carrito y comanda.

- **Crear/editar** (`handleAddToOrder` en `App.tsx`): en la rama local de edición (la del catálogo, `orderItemId` empieza con `local`), tras actualizar el padre se **reconstruyen sus líneas hijas** con `buildModifierChildren` (resuelve el producto completo del catálogo; `quantity` = la del padre → **add-on por unidad / ×cantidad**).
- **Agrupado visual** (en los 3 sitios de render del carrito: bloque catálogo móvil, sidebar desktop y `PaymentScreen`): se **filtran** las líneas hijas (`!parentOrderItemId`), y al padre se le pasan `modifierTags` (nombres) y `extraAmount` (suma de add-ons, para mostrar el **precio combinado** en la línea). `onRemove`/`onUpdateQuantity` del padre **cascadean** a sus hijos (quitar el padre quita los add-ons; cambiar cantidad mueve a ambos).
- **`CartItemRow`** (layout `flat`): los add-on se muestran como **chips emerald 🏷 en la misma fila** que las etiquetas (`cookingTerm` / "Sin X"); el precio de la línea suma `extraAmount`.
- **Comanda** (`SuccessScreen`/`SuccessSidebar`): el map de comanda **omite** `isModifier` y **anexa** `modifiers` al `cookingTerm` del padre → salen como `>> nombre`.
- **Ticket**: sin cambios de formato; los add-on son líneas reales → se imprimen como **líneas separadas con su precio**.
- **Inventario**: las líneas hijas pasan por la **misma ruta de descuento** que cualquier venta (retail/insumo → stock; receta → ingredientes; servicio → nada).

### UI en ProductOptionsModal

- **Ajustes**: dentro del dropdown de cada carpeta hay un buscador **"Agregar producto"** (filtra `allProducts` en vivo, muestra precio) y la lista de productos con su precio + 🗑. La prop `allProducts` se pasa desde `App.tsx`.
- **Modificar (al vender)**: la carpeta lista sus productos con **`+$precio`** y checkbox. La selección (`selectedModifiers`) se envía en `onAddToOrder(..., addedModifiers)`.
- Las carpetas que **solo** tienen productos (0 etiquetas) ahora **sí se muestran** en Modificar (`visibleFolders` ya no exige etiquetas).

---

## Resolución de etiquetas en vivo (no del snapshot del carrito)

En modo catálogo el modificador se abre desde la **fila del carrito** (`onEditProduct(item)`), por lo que `product` es un **CartItem** (snapshot). Para que los cambios de carpetas/etiquetas se reflejen **sin recargar**, `App.tsx` pasa las etiquetas frescas desde el estado vivo de productos, no del snapshot:

```tsx
categoryOptions={products.find(p => p.id === optionsProduct.id)?.customizableOptions
                 ?? (optionsProduct.customizableOptions || [])}
```

---

## Flujo de Guardado (`handleProductUpdate` en App.tsx)

El guardado **no escribe directo** a `products`/`categories` (esas tablas son admin-only por RLS). Llama a una sola RPC `save_product_modifiers`, que ejecuta toda la persistencia validando negocio y rol en la base de datos:

1. Optimista: actualiza el producto editado en el estado local.
2. Llama a `supabase.rpc('save_product_modifiers', { p_product_id, p_has_customization, p_ingredients, p_excluded_options, p_category_id, p_customizable_options })`.
3. La RPC (server-side) persiste:
   - En `products`: `has_customization`, `ingredients`, `excluded_options` (incluye entradas `folder:<nombre>` para carpetas excluidas).
   - En `categories.customizable_options`: el array mixto (etiquetas/carpetas/productos), solo si se mandó `p_category_id` + `p_customizable_options`.
   - Si quedaron opciones → bulk `has_customization = true` en todos los productos de esa categoría.
4. Si la RPC devuelve error `No autorizado: ...` (rol/negocio inválido), el frontend muestra "No tienes permiso para editar modificadores".
5. Tras éxito → actualización optimista de `customizableOptions` en los productos de la categoría.

```tsx
const { error } = await supabase.rpc('save_product_modifiers', {
  p_product_id: updatedProduct.id,
  p_has_customization: updatedProduct.hasCustomization ?? null,
  p_ingredients: updatedProduct.ingredients ?? null,
  p_excluded_options: updatedProduct.excludedOptions || [],
  p_category_id: touchesCategory ? categoryId : null,
  p_customizable_options: touchesCategory ? categoryOptions : null,
});
```

---

## Permisos y guardado vía RPC

### El problema que resuelve
La RLS de `categories` y `products` permite **escritura solo a administradores**:
```sql
-- "Admins can manage categories" / "Admins can manage products"
USING (business_id = get_user_business_id() AND is_admin())
-- is_admin() = (profiles.role = 'Administrador')
```
Por eso un **Cajero** no podía guardar carpetas/etiquetas: el `UPDATE` directo afectaba **0 filas en silencio** (sin error), y el cambio "no se reflejaba". El frontend incluso mostraba "Configuración guardada" en falso.

### La solución
Una función `SECURITY DEFINER` que corre con privilegios del owner, pero **valida explícitamente** negocio y rol antes de escribir, y solo toca las columnas de modificadores:

- Permite los roles `Administrador` y `Cajero` (rechaza el resto con excepción `No autorizado`).
- Verifica que el producto y la categoría pertenezcan al negocio del usuario (`get_user_business_id()`).
- Actualiza **únicamente** `has_customization`, `ingredients`, `excluded_options` (en `products`) y `customizable_options` (en `categories`).
- La RLS de las tablas **sigue siendo admin-only**: nadie obtiene escritura directa amplia; el Cajero solo puede tocar modificadores por esta vía controlada (mínimo privilegio).

`GRANT EXECUTE` para el rol `authenticated`. Definición en `docs/migrations/2026-06-29-save-product-modifiers-rpc.sql`.

### Detección de cambios (`dirtyByTab`) — snapshot interno

El cálculo de `isDirty` no compara contra los `props` del modal (porque tras guardar el padre puede no re-renderizar el modal con el producto actualizado). En su lugar se mantiene un **`savedSnapshot`** local con `{ options, excluded }` que:

- Se inicializa con los props al abrir el modal.
- Se **actualiza al estado actual tras cada guardado exitoso** dentro de `handleSaveConfig`.

`dirtyByTab` clasifica las exclusiones por tipo (`folder:` → carpetas; nombre en productos → productos; resto → etiquetas) y compara estructuralmente contra `savedSnapshot`. Resultado:

- Botón "Guardar Configuración" se habilita si **alguna** sub-pestaña tiene cambios (`dirtyByTab.any`).
- Punto naranja por sub-pestaña indica **dónde** están los cambios.
- Tras guardar, snapshot se sincroniza → puntos desaparecen y botón se deshabilita correctamente.

---

## Sincronización en tiempo real (multi-dispositivo)

Canal `products-sync` en `App.tsx` (efecto con dependencia `profile.business_id`). Además del listener de `products`, hay un listener de **`categories`**:

- **UPDATE** → propaga `customizable_options` (carpetas/etiquetas) a todos los productos de esa categoría en el estado local. Como el modal lee del estado vivo, el modificador también se actualiza sin recargar.
- **INSERT / DELETE** → `fetchProducts()` para reflejar altas/bajas de categorías.

Requisitos en BD (ver migración):
- `categories` agregada a la publicación `supabase_realtime`.
- `categories` con `REPLICA IDENTITY FULL` → necesario para que los eventos **DELETE** incluyan `business_id` y el filtro `business_id=eq.<id>` los entregue.
- La RLS de lectura (`Users can view business categories`) restringe el realtime al propio negocio.

---

## Migraciones SQL

```sql
-- Columnas base (ya existentes)
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS customizable_options jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS excluded_options jsonb DEFAULT '[]'::jsonb;

-- Realtime de categorías (supabase/migrations/20260606_realtime_categories.sql)
ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;
ALTER TABLE public.categories REPLICA IDENTITY FULL;

-- RPC que permite a Administrador y Cajero guardar modificadores sin abrir la RLS
-- de products/categories (docs/migrations/2026-06-29-save-product-modifiers-rpc.sql)
-- save_product_modifiers(p_product_id, p_has_customization, p_ingredients,
--                         p_excluded_options, p_category_id, p_customizable_options)
```

---

## Archivos Involucrados

| Archivo | Rol |
|---------|-----|
| `components/ProductOptionsModal.tsx` | UI completa: header con botón **Info** (popover en portal), tabs principales con underline amber, **3 sub-pestañas** (Etiquetas / Carpetas / Productos) con segmented control, layout flex column con lista scrolleable + input "Crear/Buscar" fijo abajo, auto-scroll al agregar, exclusión de **carpetas enteras** vía prefijo `folder:`, snapshot interno (`savedSnapshot`) para detectar dirty correctamente tras guardar, indicador dirty por sub-pestaña; flyout lateral desktop / bottom sheet móvil para editar contenido de carpeta; productos-modificadores con `+precio` |
| `lib/optionFolders.ts` | `isFolder`, `flattenOptions`, `splitOptions` (las carpetas conservan `products`) |
| `types.ts` | `OptionFolder` (+`products`), `ModifierProduct`, `CustomizableOption`; `CartItem` (+`addedModifiers`, `parentOrderItemId`), `AddedModifier`; `ReceiptItem` (+`isModifier`, `modifiers`) |
| `App.tsx` | `handleProductUpdate` (guarda etiquetas/productos de carpeta vía RPC `save_product_modifiers`); `buildModifierChildren` + creación de líneas add-on en `handleAddToOrder`; marca `isModifier`/`modifiers` al construir `receiptItems`; pasa `allProducts` al modal; realtime `categories` |
| `save_product_modifiers` (RPC, BD) | Función `SECURITY DEFINER` que persiste los modificadores validando negocio y rol (`Administrador`/`Cajero`). Sustituye los `UPDATE` directos a `products`/`categories` que la RLS bloqueaba a no-admins. Ver `docs/migrations/2026-06-29-save-product-modifiers-rpc.sql` |
| `components/CartItemRow.tsx` | Layout `flat`: chips de add-on (`modifierTags`) en la fila de etiquetas + `extraAmount` (precio combinado) |
| `screens/MenuScreen.tsx`, `screens/PaymentScreen.tsx` | Agrupado visual del carrito: filtran líneas hijas, pasan `modifierTags`/`extraAmount`, cascada de quitar/cantidad a los add-ons |
| `screens/SuccessScreen.tsx`, `components/SuccessSidebar.tsx` | Comanda: omiten líneas `isModifier` y anexan `modifiers` al `cookingTerm` del padre |
| `hooks/useProducts.ts` | Mapea `category.customizable_options` y `excluded_options` (tipados como `CustomizableOption[]`) |
| `components/ProductModal.tsx`, `components/ProductEditModal.tsx` | Consumidores legacy: aplanan con `flattenOptions` |
| `supabase/migrations/20260606_realtime_categories.sql` | Habilita realtime + REPLICA IDENTITY FULL en `categories` |
