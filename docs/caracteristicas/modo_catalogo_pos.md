# Modo Catálogo (POS con Tarjetas Visuales)

Componentes: `screens/MenuScreen.tsx`, `screens/SellScreen.tsx`  
Componentes UI: `components/ProductCard.tsx`, `components/CartItemRow.tsx`  
Configuración: Sidebar → Ajustes → "Activar/Desactivar" (`components/SalesModeSettingsPanel.tsx`)

Modo alternativo de punto de venta que muestra los productos en tarjetas visuales (cards) con imagen, precio, stock y controles de cantidad. Complementa el modo Escáner (EAN) existente.

---

## Modos de Venta

El POS soporta dos modos, configurables desde Ajustes → "Activar/Desactivar":

| Modo | Ícono | Descripción |
|------|-------|-------------|
| **Escáner** | `barcode_scanner` | Barra de búsqueda tipo EAN, dropdown de resultados, carrito inline |
| **Catálogo** | `grid_view` | Grid visual de tarjetas con imagen, +/- cantidad, botón de opciones |

### Configuración del Modo (cambio 2026-06-23)

- **Ubicación**: Sidebar → Ajustes → "Activar/Desactivar" → card clickeable "Modo Catálogo".
- **Componente**: `components/SalesModeSettingsPanel.tsx` (panel lateral propio).
- **Persistencia**: campo `catalog_mode_enabled` (boolean, default `false`) en tabla `businesses` de Supabase. Se configura por **negocio** (no por dispositivo).
- **Acceso**: solo el dueño del negocio (`owner_id`) puede cambiarlo (RLS). Los demás roles ven el estado en modo lectura.
- **Sincronización en tiempo real**: el estado se propaga a todos los dispositivos del negocio vía Supabase Realtime (canal `business-settings-shared`).
- **Derivación en App**: `App.tsx` expone `isEanMode = !isCatalogModeEnabled` (calculado, no estado local). No hay `localStorage` ni selector en el POS.

> [!NOTE]
> **Cambio breaking (2026-06-23):** Se eliminaron los selectores de modo del header de `SellScreen` (escritorio) y del header móvil de `MenuScreen`. El modo ya no es modificable desde el POS; es una configuración del negocio. Si el selector se reactiva en el futuro, debería llamar a `setCatalogModeEnabled` del contexto (no a un `setState` local).

---

## Grid de Tarjetas (Desktop)

Clase CSS del grid:
```
grid-cols-[repeat(auto-fill,minmax(160px,1fr))]
```

- **Dinámico**: agrega/quita columnas según el espacio disponible
- Con sidebar expandido (~530px): 4 columnas
- Con sidebar colapsado (~720px): 5 columnas
- Pantallas grandes: más columnas automáticamente
- `content-start`: las cards no se estiran verticalmente
- `max-h-[200px]` en la imagen: evita tarjetas excesivamente altas

### Tarjeta de Producto (Desktop)

Cada tarjeta incluye:
- Imagen con `aspect-square` y `object-contain`. Si el producto **no tiene imagen** (o la URL falla), se muestra un placeholder limpio con el ícono `restaurant` en gris (no el ícono de imagen rota del navegador)
- Badge de precio (esquina superior derecha)
- Nombre del producto: peso normal (`font-normal`, sin negrilla) y hasta **3 líneas** (`line-clamp-3`) para no truncar nombres largos. Aplica a las dos variantes de tarjeta (desktop y móvil/tablet) en `MenuScreen.tsx`.
- Controles: botón -, cantidad clickeable, botón +

> **Nota:** Las tarjetas **no muestran el stock** ni el botón de modificador. El stock se omite para una vista más limpia, y el modificador se accede desde el carrito (ver abajo).

---

## Flujo de Venta en Modo Catálogo

1. **Seleccionar productos**: Click en tarjeta o botón "+"
2. **Ver carrito**: Sidebar derecho con `CartItemRow` expandibles (en modo catálogo se muestran **expandidos por defecto**)
3. **Modificadores**: Botón "Modificador" visible directamente (abre el modal de opciones para ese item individual)
4. **Editar items**: Ajustar cantidad o aplicar "Descuento" sin necesidad de expandir manualmente
5. **Procesar pago**: Botón "Procesar Pago" en sidebar del carrito

### Filas individuales por cada "+"

Cada vez que se presiona "+" en una tarjeta se crea una **fila independiente** en el carrito (qty=1), en lugar de acumular en una sola fila con cantidad N. Esto permite que cada unidad tenga su propia modificación (ej. 3 ensaladas, cada una con un cambio distinto).

### Items expandidos por defecto (modo catálogo)

En modo catálogo, los items del carrito aparecen **expandidos por defecto** mostrando los controles de cantidad, "Modificador" y "Descuento" sin necesidad de interacción adicional. Esto aplica tanto en **móvil** (PaymentScreen) como en **desktop** (sidebar del MenuScreen).

- Implementado con la prop `defaultExpanded` en `CartItemRow`, que inicializa el estado `localExpanded` en `true`.
- En `MenuScreen` se pasa `defaultExpanded={!isEanMode}`.
- En `PaymentScreen` se pasa `defaultExpanded={isCatalogMode}` (prop recibida desde `App.tsx` como `isCatalogMode={!isEanMode}`).
- El usuario puede colapsar manualmente un item si lo desea (no es forzado).
- En modo EAN/Escáner, los items se muestran colapsados como antes.

> **Nota técnica:** El `useEffect` que sincroniza `forceExpanded` solo actúa cuando `forceExpanded=true`, para no resetear el estado `defaultExpanded` al montar el componente.

- Implementado con `handleQuickAddIndividual` en `App.tsx` (pasada como prop `onQuickAddIndividual`), que siempre inserta una fila nueva sin fusionar.
- El contador de cantidad que se ve en la tarjeta suma todas las filas individuales de ese producto (`getCartQuantity`).
- A cada fila se le asigna un `orderItemId` único (en modo local es `local-<timestamp>-<rand>`) para poder identificarla y editarla de forma individual.

### Editar una fila con el modificador (in-place)

Al usar el botón "Modificador" sobre una fila del carrito, la edición se aplica **in-place sobre esa misma fila** (no crea una fila nueva ni divide la cantidad). Esto vale para los tres modos: local/Orden Rápida, mesa/DB y edición de orden.

- Implementado en `handleAddToOrder` (`App.tsx`): cuando hay un `itemToSplit` activo, se sobrescriben `quantity`, `removedIngredients`, `cookingTerm` y `notes` del item identificado por su `orderItemId`.
- En modo mesa/edición la fila se sincroniza con BD (`removeOrderItem(ById)` + `addItemToOrder(ById)`).
- Detalle técnico: `handleAddToOrder` está memorizada con `useCallback` e `itemToSplit` debe estar en su array de dependencias; de lo contrario un *stale closure* hace que la edición se trate como un alta y se cree una fila nueva. Ver [`historial_planes/2026-06-04-fix-modificador-in-place-carrito.md`](../historial_planes/2026-06-04-fix-modificador-in-place-carrito.md).

> **Importante:** Estas filas individuales son solo a nivel visual (carrito) y de comanda. En el **ticket de venta impreso** se consolidan en una sola fila por producto. Ver [`impresion_termica_qz.md`](./impresion_termica_qz.md) y [`comprobante_publico_whatsapp.md`](./comprobante_publico_whatsapp.md).

### Búsqueda con Enter (modo Catálogo)

A diferencia del modo EAN (que limpia el texto al agregar), en Catálogo:
- **Enter** agrega el producto filtrado
- El texto del buscador se **selecciona** (no se borra)
- **Enter de nuevo** = +1 del mismo producto
- **Escribir** = reemplaza la búsqueda con nuevo texto

---

## Pantalla de Pago en Catálogo (Desktop)

En modo Catálogo desktop, el pago **no abre un modal**: el sidebar derecho (`aside` de `MenuScreen`) cambia su contenido del carrito al componente `PaymentSidebar`. Las tarjetas de productos siguen visibles a la izquierda, así que se pueden seguir agregando productos durante el pago.

> En móvil/tablet el pago sí usa la pantalla `PaymentScreen` (modal `lg:hidden`); esta sección aplica solo a desktop (lg+).

### Flecha de volver inline (sin header "Procesar Pago")

Se eliminó el header con el título "Procesar Pago". La flecha de volver vive ahora **dentro de `PaymentSidebar`, en la fila de tabs** (Pago Directo / Crédito), para una vista más compacta.

- Prop `showInlineBack?: boolean` en `PaymentSidebar` (default `false`): renderiza la flecha ← a la izquierda de los tabs y la conecta a `onBack`.
- Solo `MenuScreen` la activa para el modo catálogo (`showInlineBack`); el modo EAN y otros usos del `PaymentSidebar` no muestran la flecha.

### Volver al carrito (back) en SellScreen

Al pulsar la flecha de volver, se regresa al **carrito dentro de `SellScreen`** (conservando su header completo), no a una pantalla distinta.

- En Orden Rápida `saleOrigin` es `'orders'`, por lo que el back navega a `Screen.SELL`.
- El wrapper de `onNavigate` de la tab Orden Rápida en `SellScreen` intercepta `Screen.SELL`. Si **se viene de la pantalla de pago** (`currentAppScreen === Screen.PAYMENT`), propaga la navegación para salir del pago y mostrar el carrito, en lugar de cambiar de tab (lo que antes mandaba a la tab Mesas y "no mostraba el carrito").

### Agregar productos durante el pago

Al tocar una card (botón `+`) **estando en Procesar Pago**, se agrega el producto y se vuelve automáticamente al carrito (mismo efecto que la flecha de volver) para ver el ítem recién agregado.

- Implementado en `handleMobileQuantityChange` (`MenuScreen`): si `delta > 0` y `isPaymentView && !isEanMode`, tras agregar llama a `handleExitCatalogPayment`.
- `handleExitCatalogPayment` centraliza la navegación de volver (usada por la flecha y por el agregado desde card).

### El estado del pago no se pierde

Al volver al carrito, el `PaymentSidebar` **no se desmonta**: se mantiene montado y **oculto con `display:none`** (`hidden`) mientras se ve el carrito, y se muestra con `display:contents` cuando se entra al pago. Así se conservan cliente, descuento, método y efectivo ya ingresados.

- En el `aside` de `MenuScreen` se renderizan ambos paneles (PaymentSidebar y carrito) y se alternan por visibilidad según `isPaymentView`, en vez de montar/desmontar.
- El `PaymentSidebar` persistente solo se monta cuando hay ítems o se está en pago (`isPaymentView || cart.length > 0`); al **vaciarse el carrito** (venta finalizada o limpiada) se desmonta → la siguiente venta empieza limpia (reset natural, sin lógica extra).
- La rama de **éxito** (`isSuccessView`) mantiene prioridad sobre EAN y catálogo para no romper la pantalla de venta exitosa.

### Foco y texto del buscador preservados

El buscador conserva su texto y el foco en estas acciones (no se borra ni se resetea la categoría):

- **Agregar desde card en pago** y **flecha de volver**: `handleExitCatalogPayment` dispara solo el evento `focus-menu-search` (reenfoca sin limpiar), no `clear-and-focus-menu-search`.
- **Aplicar/cerrar un modificador**: el `onClose` de `ProductOptionsModal` (`App.tsx`) dispara `focus-menu-search` para devolver el foco al buscador.
- El texto queda **seleccionado** al reenfocar, consistente con la "Búsqueda con Enter" de arriba.

---

## Modo Catálogo en Móvil (≤767px)

> Esta sección aplica **solo a teléfonos** (`md:hidden`, ancho `<768px`). En **tablet (768–1023px)** y **desktop** el modo Catálogo sigue mostrando la grilla de tarjetas descrita arriba, sin cambios.

En móvil el modo Catálogo **no muestra la grilla de tarjetas**. La pantalla arranca limpia y se comporta de forma parecida al modo Escáner: el operador elige una categoría, agrega productos desde una lista y estos se apilan como filas de carrito debajo, con cobro directo.

### Estructura (bloque dedicado en `MenuScreen.tsx`)

A diferencia de tablet/desktop (que usan el "content area" compartido), el teléfono usa un **bloque propio** (`{!isScannerMode && (…)}`, `md:hidden flex flex-col flex-1 min-h-0`), paralelo al bloque del modo Escáner. El "content area" con la grilla pasó a `hidden md:flex`, así que en teléfono la grilla nunca se renderiza.

```
┌─────────────────────────────────────┐
│ [🔍 Buscar producto]   [▦ Catálogo ▾]│  ← header (buscador global + modo)
├─────────────────────────────────────┤
│  ★Favoritos  Abarrotes   [ Ocultar ▲]│  ← categorías alfabéticas + toggle
│  Aseo  Bebidas  Lácteos  Mecato      │     (NO incluye el chip "Todos")
├─────────────────────────────────────┤
│  ┌─ Coca-Cola ───────── $2.500 ──┐  │
│  │  [-] 1 [+]  [Modif.] [Desc.]   │  │  ← carrito: filas individuales expandidas
│  └────────────────────────────────┘ │
├─────────────────────────────────────┤
│ [ 2 items  $4.000   Procesar Pago →]│  ← barra fija (cobro directo)
└─────────────────────────────────────┘
```

### Categorías fijas (orden alfabético, sin "Todos", con toggle Ver/Ocultar)

- Se muestran en un contenedor `shrink-0` fijo arriba, **sin scroll horizontal**.
- **Orden alfabético por defecto**: `visibleCategories` ordena con `localeCompare(b.name, 'es', { sensitivity: 'base' })` (acentos/ñ correctos). Esto además da un orden **estable** entre la carga de cache y de red, evitando el "salto" de reorganización al entrar a Vender. Aplica también a la barra desktop y al dropdown EAN (todos usan `visibleCategories`).
- En teléfono el chip **"Todos" se oculta** a propósito (solo ★Favoritos —si hay favoritos— y las categorías reales). La selección es por categoría.
- Tocar una categoría abre su **bottom sheet** (no filtra una grilla).

#### Toggle "Ver / Ocultar" (colapsar a una fila)

Para liberar espacio en el carrito, un botón colapsa las categorías a **una sola fila**:

- **Por defecto expandido** (todas las filas), botón **"Ocultar"**; al colapsar muestra solo la primera fila (`overflow-hidden max-h-[1.9rem]`) y el botón pasa a **"Ver"**.
- El botón **solo aparece si las categorías ocupan más de una fila** (se mide `mobileCatBarRef.scrollHeight > 40` estando expandido; estados `isCatCollapsed`, `showCatToggle`).
- **Técnica `float`**: el botón va `float-right` *dentro* del contenedor de chips, que son `inline-flex` (no flex-wrap). Así el botón ocupa la esquina superior derecha y los chips **fluyen a su alrededor solo en la primera fila**; de la segunda fila en adelante usan el **100% del ancho**. Si el botón fuera un hermano flex, reservaría su columna en *todas* las filas (desperdiciando ancho abajo).
- El botón tiene **altura de un chip** (`h-7`) y **sin margen inferior**, para que su caja no invada la segunda fila (un float invade todas las líneas que toca).
- **Ancho fijo** (`w-[88px]`, texto centrado): "Ver" y "Ocultar" ocupan lo mismo, sin saltos al alternar.
- Los chips usan `whitespace-nowrap`: si una categoría no cabe junto al botón, **baja entera** a la fila siguiente (nunca se trunca con "…").
- Estilo del botón: pill con borde gris y sombra suave (consistente con "Buscar"/"Catálogo"), **sin amarillo**.

### Bottom sheet de productos por categoría

Al tocar una categoría se abre un **bottom sheet a alto completo** (`max-h-[88vh]`), por fuera, para aprovechar la altura del dispositivo:

- **Buscador interno**: un ícono 🔍 en el header del sheet despliega un input que **filtra solo dentro de esa categoría** (`sheetSearch` → memo `sheetProducts`). Es independiente del buscador global del header.
- **Agregar / quitar**: cada fila tiene un botón `+`; al tocarlo (o tocar el cuerpo de la fila) se agrega una **fila individual** al carrito (`handleCatalogAdd` → `handleMobileQuantityChange`); los productos con **peso/medida** abren `PriceInputModal`. Cuando el producto **ya tiene unidades** en el carrito, aparece un **stepper** `[-] cantidad [+]` para corregir sin salir del sheet (el `-` llama a `handleMobileQuantityChange(product, -1)`, que elimina la última fila individual de ese producto). El sheet **queda abierto** para seguir ajustando o cambiar de categoría. El mismo stepper aplica en el dropdown de búsqueda global.
  - Nota de estructura: la fila es un `<div>` (no un `<button>`) con un botón para el cuerpo (agregar) y los botones `-`/`+` como hermanos, para no anidar botones; el `-` usa `stopPropagation`.
- **Favorito (estrella)**: cada fila tiene una estrella para marcar/desmarcar el producto como favorito (mismo evento optimista `favorite-toggled` que las tarjetas; ver "Productos Favoritos" abajo). Color **emerald** cuando es favorito / gris cuando no (sin amarillo); `stopPropagation` para no agregar al carrito; oculta en promociones (`promo_`). Al marcar, el producto aparece en el chip ★Favoritos.
- **Cierre**: con la ✕ del header o **arrastrando hacia abajo** desde cualquier parte del panel (patrón estándar de bottom sheets; ver [`design_system.md`](../arquitectura/design_system.md) §6). El gesto usa `touchmove` con `{ passive: false }` y solo cierra si la lista interna está arriba del todo (`scrollTop <= 0`).

Estado asociado: `catalogSheetCategory` (id de categoría abierta o `null`), `sheetSearch`, `isSheetSearchOpen`, más el estado del gesto (`sheetOffset`, `sheetDragging`, `sheetClosing`) y refs (`catalogSheetRef`, `sheetListRef`). Funciones: `handleOpenCatalogSheet`, `handleCloseCatalogSheet` (cierre animado a 250ms), `handleCatalogAdd`.

### Buscador global (dropdown de sugerencias)

El buscador del **header** busca de forma **global** (ignora la categoría activa, memo `catalogSearchResults`, hasta 8 resultados) y muestra un **dropdown de sugerencias** debajo del input (no abre el sheet). Cada sugerencia tiene su `+` (y stepper `-`/`+` si ya hay unidades). Convive con el sheet pero son dos mecanismos distintos: el sheet busca **dentro** de una categoría, el header busca en **todo** el catálogo.

#### Navegación por teclado

El dropdown global se opera con teclado (útil con pistola/teclado físico, no solo táctil):

- **↓ / ↑**: mueven la sugerencia seleccionada (`selectedIndex` acotado a `catalogSearchResults.length`); la fila activa se resalta (`bg-primary/10` + ring) y se hace scroll a la vista (`id="catalog-suggestion-<id>"`).
- **Enter**: agrega la sugerencia resaltada (`handleCatalogAdd`; peso → `PriceInputModal`). **Enter de nuevo** sobre la misma = +1.
- **Tras agregar** (Enter o tocar `+`): se llama a `refocusSearchInput()`, que reenfoca y **selecciona el texto** del buscador, dejándolo listo para escribir la siguiente búsqueda.
- `selectedIndex` se reinicia a 0 en cada cambio de texto, así queda resaltada la primera coincidencia.
- La lógica vive en el `onKeyDown` del input móvil (rama de catálogo) y opera sobre `catalogSearchResults` (la lista realmente visible), no sobre la grilla oculta.

### Carrito y cobro

- Los productos agregados se apilan como `CartItemRow` con `defaultExpanded={true}`: **Modificador** y **Descuento** quedan visibles sin interacción adicional. Antes de agregar nada, el área muestra el estado vacío "Elige una categoría".
- La barra **Procesar Pago** es `shrink-0` fija al fondo del bloque (no un FAB). Al pulsarla setea `sessionStorage.bistro_payment_skip_summary = 'true'` y navega a `Screen.PAYMENT`, por lo que el pago abre **directo en el formulario de cobro** (sin el paso de resumen). Es el mismo comportamiento del modo Escáner.
- El **FAB** amarillo del catálogo quedó **solo para tablet** (`hidden md:block lg:hidden`); en teléfono lo reemplaza la barra Procesar Pago.

---

## Categorías

En modo Catálogo, las categorías se muestran en `flex-wrap`:
- Se posicionan al lado del buscador y fluyen a la siguiente línea si no caben
- No se cortan ni requieren scroll horizontal
- Aprovechan todo el ancho disponible

> **Carga:** al recargar la app, las categorías ya no entran "de golpe". Un gate de carga (`appReady`) mantiene la app bajo el `AppLoader` hasta que productos **y** categorías están listos, revelando Sidebar + contenido juntos. Ver [`docs/arquitectura/carga_inicial.md`](../arquitectura/carga_inicial.md).

---

## Productos Favoritos

En modo Catálogo cada tarjeta (excepto promociones) tiene una **estrella** para marcar el producto como favorito. Los favoritos se acceden rápido mediante un chip virtual **"Favoritos"** en la barra de categorías.

### Modelo de datos

- Columna `is_favorite boolean NOT NULL DEFAULT false` en la tabla `products` (migración `add_is_favorite_to_products`), con índice parcial `WHERE is_favorite = true`.
- **Alcance por negocio**: el favorito es compartido por todos los usuarios del negocio (no por usuario).
- El producto **conserva su `category_id` real**; "Favoritos" NO es una categoría real: es una marca aparte. No existe fila "Favoritos" en la tabla `categories`.

### Estrella en la tarjeta

- Ubicación: esquina **superior izquierda** de la imagen (la derecha tiene el badge de precio). Presente en las dos tarjetas inline de `MenuScreen` (móvil/tablet y desktop).
- Color **profesional, no amarillo**: relleno `emerald-600` cuando es favorito, contorno `gray-400` cuando no (icono Material Symbols `star` con `fontVariationSettings: 'FILL' 0|1`). Fondo blanco translúcido para legibilidad.
- `onClick` con `stopPropagation` + `preventDefault`: marcar NO agrega el producto al carrito ni roba el foco del buscador.
- Las **promociones** (id que empieza con `promo_`) no muestran estrella.

> **En teléfono (≤767px):** como el catálogo móvil ya no usa tarjetas, la estrella vive en **cada fila del bottom sheet** de productos por categoría (mismo evento `favorite-toggled`, mismo color emerald, oculta en promociones). Ver "Bottom sheet de productos por categoría" arriba.

### Toggle optimista (requiere conexión)

- La estrella despacha `window.dispatchEvent(new CustomEvent('favorite-toggled', { detail: { productId, value } }))`, siguiendo el patrón de eventos optimistas ya usado para stock (`inventory-updated`, `sale-completed`, `wastage-stock-updated`).
- `App.tsx` escucha `favorite-toggled`: actualiza el estado local de inmediato (UI optimista) y la cache offline (`saveSellProducts`), luego persiste con `UPDATE products SET is_favorite`. Si falla, **revierte** y muestra el toast "No se pudo guardar el favorito".
- El realtime de productos (`products-sync`) incluye `is_favorite` en el merge del `UPDATE`, así el cambio se refleja en otros dispositivos/usuarios del negocio.

### Chip virtual "Favoritos"

- Aparece en la barra de categorías **justo después de "Todos"**, y **solo si hay al menos un favorito** (`hasFavorites`).
- Constante `FAVORITES_ID = 'favorites'`. Cuando `activeCategory === FAVORITES_ID`, `filteredProducts` filtra por `is_favorite` en vez de `category_id`.
- Activo en color **emerald** (no amarillo), consistente con la estrella.
- Si se desmarca el último favorito estando en ese filtro, un `useEffect` resetea `activeCategory` a `'all'` para no quedar en una vista vacía.

---

## Sidebar Colapsable

El sidebar de navegación se puede colapsar **solo en modo Catálogo**:
- Botón `left_panel_close` al fondo del sidebar
- Colapsado: `w-16`, solo muestra iconos con tooltip nativo
- Expandido: `w-64`, comportamiento normal
- Al cambiar a modo EAN, se auto-expande
- Prop `canCollapse={!isEanMode}` controla visibilidad del botón

### El header de SellScreen se oculta al colapsar (vista limpia)

En modo Catálogo, al **colapsar** el sidebar también se **oculta el header superior** de `SellScreen` (la barra con Crear · Gastos · Abonos · Turno · Mesas · Modo). Esto da una vista full-screen con más espacio vertical para las tarjetas. Al expandir el sidebar, el header reaparece — es un toggle natural, sin botón adicional.

- `App.tsx` pasa el estado `isSidebarCollapsed` a `SellScreen` como prop.
- `SellScreen` oculta el header cuando `currentAppScreen === Screen.SUCCESS || (!isEanMode && isSidebarCollapsed)`.
- Solo aplica en Catálogo: en modo EAN el colapso se auto-revierte, así que el header nunca desaparece en Escáner.

---

## Presentaciones de Venta (Catálogo y Modo EAN)

Cuando un producto tiene configuradas múltiples presentaciones de venta (ej: unidad vs. cajetilla, o unidad vs. cubeta):
- **Catálogo Visual:** La función `expandProductsForPOS()` (`lib/catalogExpansion.ts`) desdobla el producto en tarjetas individuales sin tocar el diseño de `ProductCard.tsx`. Cada presentación muestra su propio precio, foto y stock proporcional (`floor(stock_padre / factor)`).
- **Unidad Discreta:** Cada tarjeta secundaria tiene `unit: 'Unidad'` para mantener la pastilla de precio negra estándar (`$12.000`) y agregarse directo al carrito con `+` o clic (sin activar el modal de pesaje).
- **Modo EAN:** En el carrito y la vista de escáner móvil, el badge de stock de las presentaciones muestra únicamente el valor numérico (ej: `4`) en lugar de `4 Und`, previniendo confusiones con unidades sueltas.

Ver documentación completa en [`presentaciones_venta.md`](./presentaciones_venta.md).

---

## Archivos Involucrados

| Archivo | Rol |
|---------|-----|
| `App.tsx` | Estado global `isEanMode`, `isSidebarCollapsed`; `handleQuickAddIndividual` (filas individuales); `handleAddToOrder` (edición in-place del modificador); `onClose` de `ProductOptionsModal` reenfoca el buscador; listener `favorite-toggled` (toggle optimista de favoritos) y mapeo de `is_favorite` (fetch + realtime) |
| `screens/SellScreen.tsx` | Dropdown de modo en header, props al `MenuScreen` (incl. `onQuickAddIndividual`); wrapper de `onNavigate` que sale del pago al carrito cuando `currentAppScreen === Screen.PAYMENT`; prop `isSidebarCollapsed` que oculta el header en Catálogo al colapsar el sidebar |
| `screens/MenuScreen.tsx` | Renderiza grid de tarjetas o modo EAN; `handleMobileQuantityChange` (vuelve al carrito al agregar en pago), `handleExitCatalogPayment`, `aside` con PaymentSidebar persistente (oculto vs `contents`); estrella de favoritos en las tarjetas, chip virtual "Favoritos" (`FAVORITES_ID`, `hasFavorites`) y filtro por `is_favorite`. **Catálogo móvil (≤767px):** bloque dedicado con categorías fijas en **orden alfabético** (`visibleCategories` con `localeCompare`) y **toggle Ver/Ocultar** vía `float` (`isCatCollapsed`, `showCatToggle`, `mobileCatBarRef`), carrito `CartItemRow defaultExpanded` y barra Procesar Pago; **bottom sheet por categoría** (`catalogSheetCategory`, `sheetProducts`, `handleOpenCatalogSheet`/`handleCloseCatalogSheet`, gesto `touchmove`, estrella de favoritos por fila) y **dropdown global** (`catalogSearchResults`) con navegación por teclado (↑/↓/Enter, `selectedIndex`) y selección de texto al agregar |
| `components/PaymentSidebar.tsx` | Formulario de pago en el sidebar (desktop); prop `showInlineBack` para la flecha de volver en la fila de tabs |
| `components/ProductCard.tsx` | Componente de tarjeta (variantes mobile/desktop), placeholder de imagen |
| `components/CartItemRow.tsx` | Item del carrito con botones "Modificador" y "Descuento" al expandir; prop `defaultExpanded` para modo catálogo |
| `components/ProductOptionsModal.tsx` | Modal de modificador (opciones, cantidad, notas); etiquetas agrupadas en **carpetas** con dropdown flotante (ver [`etiquetas_por_categoria.md`](./etiquetas_por_categoria.md)); al cerrar devuelve el foco al buscador |
| `components/Sidebar.tsx` | Soporte para colapso (props `isCollapsed`, `canCollapse`) |
| `lib/receiptUtils.ts` | `consolidateReceiptItems` para el ticket de venta |
