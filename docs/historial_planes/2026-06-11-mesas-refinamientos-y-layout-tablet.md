# Mesas: Refinamientos del Dropdown + Layout Tablet — 2026-06-11

Continuación de [`2026-06-10-reactivacion-mesas-comanda-dropdown.md`](./2026-06-10-reactivacion-mesas-comanda-dropdown.md). Aquí se documentan los ajustes y correcciones aplicados después de esa entrada. Doc de característica: [`docs/caracteristicas/mesas.md`](../caracteristicas/mesas.md).

---

## 1. Refinamientos del dropdown de mesas (`TableSelectorControl`)

- **Fondo opaco**: el popover pasó de `bg-white` + sombra a `bg-slate-50` con borde `slate-200` y **sin sombra**, para diferenciarse del fondo y no mezclarse.
- **Badge por encima del dropdown (fix z-index)**: el header del carrito subió a `z-[70]` para que el badge de cantidad de los productos (z-10 dentro de la lista) no se viera por encima del dropdown.
- **Crear mesa automática**: "+ Mesa" crea directamente la siguiente `MESA N` (mayúsculas, número auto-incremental) **sin abrir formulario y sin cerrar** el dropdown.
- **Ícono de editar** por mesa (renombrar, texto forzado a mayúsculas). No cierra el dropdown.
- **Ícono de eliminar** por mesa: con confirmación; **bloquea** eliminar una mesa ocupada.
- **Orden numérico**: las mesas se ordenan por el número del label (MESA 1, 2, 3 … 10, 11), no alfabéticamente.
- **Líneas divisorias** entre mesas y filas más altas para pulsar con precisión.
- **Dropdown a altura completa**: la lista pasó de `max-h-[280px]` a `max-h-[calc(100vh-230px)]` (scroll solo si excede).
- **Color de selección claro**: el estado seleccionado (mesa activa, "Orden Rápida", chips de sala) pasó del fondo oscuro `#102218` a `bg-emerald-50` + `text-emerald-700` + `ring-emerald-200`. Sin negros ni amarillos.

**Archivos:** `components/TableSelectorControl.tsx`

## 2. Bottom sheet móvil del selector (swipe-to-close)

- Se implementó el gesto **arrastrar-para-cerrar** siguiendo el patrón del `DESIGN_SYSTEM.md` §6.
- **Ajuste de sensibilidad** (documentado en `DESIGN_SYSTEM.md`): el cierre solo arranca si el gesto **empezó** con la lista arriba del todo (`startedAtTop`), y el umbral subió a `delta > 8`. Esto evita cierres accidentales al scrollear.

**Archivos:** `components/TableSelectorControl.tsx`, `DESIGN_SYSTEM.md`

## 3. Header móvil del catálogo

- En pantallas **≤430px**, el botón de modo Catálogo/Escáner se colapsa a un ícono de **3 puntos** (`more_vert`) en la **esquina derecha** (`ml-auto`).
- El **trigger de mesas** (sheet) tiene **ancho fijo** (`w-[88px]`) para que no cambie de tamaño al alternar entre "Orden Rápida" y "MESA N". El label muestra "Orden Rápida" o el número de mesa.
- Se eliminó la **barra de categorías duplicada**: el DESKTOP HEADER (buscador + categorías) pasó a `lg:flex` (solo escritorio) en modo catálogo; en tablet/móvil quedan solo el buscador del header + las categorías que abren el sheet.

**Archivos:** `screens/MenuScreen.tsx`

## 4. Layout Tablet (768–1023px) en modo Catálogo

Nueva disposición para tablet (decisión del usuario), solo en modo Catálogo (Escáner sin cambios):

- **Sidebar como overlay**: en la vista POS catálogo, el contenido reserva solo el riel colapsado (`md:ml-16`); al expandir, el sidebar **flota encima** sin empujar, con backdrop que lo colapsa al tocar fuera. En desktop (lg) sigue empujando. Control vía prop `tabletOverlay` + `isPosCatalogView`.
- **Header solo en la zona izquierda**: el `SellScreen` reserva 400px a la derecha (`md:pr-[400px] lg:pr-0`); el header permite **2 filas** (`flex-wrap`, altura auto) y **"Crear" es solo el ícono `+`** en tablet.
- **Carrito fijo a toda la altura**: el carrito de escritorio se fija (`md:fixed top-0 right-0 bottom-0 w-[400px]`, `lg:static` en desktop), llegando hasta arriba a la derecha, con el flujo completo (Orden Rápida/Mesa, Procesar Pago, Enviar Comanda).
- **Zona izquierda estilo móvil**: buscador + chips de categorías; al tocar una categoría se abre el **bottom sheet limitado a la zona izquierda** (`md:right-[400px]`, no tapa el carrito).
- **FAB amarillo de carrito oculto** (`{false && ...}`): ya hay carrito fijo a la derecha.
- **Header siempre visible** en tablet aunque el sidebar esté colapsado (solo se oculta en desktop colapsado y en SUCCESS).

**Archivos:** `App.tsx`, `components/Sidebar.tsx`, `screens/SellScreen.tsx`, `screens/MenuScreen.tsx`

---

## Bugs corregidos

### A) Modales del carrito tapados por el sheet de categoría (z-index)
Con el sheet de categoría abierto (`z-[79]/z-[80]`), abrir Modificador/Descuento/Nota mostraba "pantalla blanca" porque esos modales estaban en `z-[70]` (debajo del sheet). Se subieron por encima:
- `ProductOptionsModal`: `z-[70]` → `z-[90]`; su dropdown/sheet de carpetas `z-[79]/z-[80]` → `z-[98]/z-[99]`.
- `DiscountModal`, `SimpleNoteModal`: `z-[70]` → `z-[90]`.

**Archivos:** `components/ProductOptionsModal.tsx`, `components/DiscountModal.tsx`, `components/SimpleNoteModal.tsx`

### B) Crash al abrir "Modificador" (objeto como hijo de React)
`Uncaught Error: Objects are not valid as a React child (found: object with keys {id, name})`. Un producto-modificador `{id, name}` (objeto sin `options`) caía en las etiquetas sueltas (`loose`) y se intentaba renderizar como texto. Fix de raíz: `splitOptions`/`flattenOptions` ahora solo aceptan **strings** en `loose`, ignorando objetos malformados.

**Archivos:** `lib/optionFolders.ts`

### C) "Procesar Pago" en tablet abría "otro carrito"
Los overlays full-screen de `PaymentScreen` y `SuccessScreen` eran `lg:hidden` → se mostraban también en tablet, encima del carrito fijo. En modo catálogo ahora son `md:hidden` (solo móvil); en escáner siguen `lg:hidden`. En tablet catálogo el pago/éxito se muestra **en el carrito fijo** (PaymentSidebar/SuccessSidebar en su sitio), igual que en escritorio.

**Archivos:** `App.tsx`

### D) Volver desde "Procesar Pago" en una mesa
Al volver del pago en modo mesa, un wrapper interpretaba `SELL` como `handleBackToTables()` (iba a Orden Rápida con parpadeo). Ahora, si se viene de PAYMENT, se sale del pago conservando la mesa (`onNavigate(Screen.SELL)` directo). Además cualquier `Screen.MENU` redirige a `SELL` y `handleExitCatalogPayment` siempre navega a `SELL`.

**Archivos:** `screens/SellScreen.tsx`, `screens/MenuScreen.tsx`, `App.tsx`

### E) FAB "Enviar Comanda" visible en pantalla de pago
Se ocultó el FAB cuando `isPaymentView` (además de en Orden Rápida).

**Archivos:** `screens/MenuScreen.tsx`

---

## Verificación

- `npm run build`: exitoso (exit 0) tras cada bloque de cambios.
- `getDiagnostics` limpio en todos los archivos modificados.
