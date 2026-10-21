# Auditoría visual — Flujo de venta (SellScreen modo Catálogo → Pago → Éxito)

Solo lectura. No se modificó código.

## 1. Resumen (respuesta corta)

- **No existe un design system real.** Hay tokens a medias en un `tailwind.config` *inline* dentro de `index.html` (Tailwind por **CDN**, se compila en el navegador). En la práctica los componentes los ignoran: usan `gray-*` y `slate-*` mezclados (PaymentSidebar: 243 `slate` vs 86 `gray`; MenuScreen: 334 `gray`), el hex `#102218` hardcodeado ~37 veces, y más de 17 tamaños de fuente arbitrarios (`text-[9px]`…`text-[56px]`).
- **Hay bugs visuales silenciosos.** Clases de colores que no existen en Tailwind (`slate-450`, `slate-150`, `slate-250`, `rose-455`, `gray-750`, `gray-850`, `emerald-250`…) sobre todo en `PaymentSidebar.tsx` y `PaymentScreen.tsx`. No generan CSS: esos bordes, fondos y textos se ven con el color por defecto o sin color. El token `border-border-light` / `border-dark` se usa (en el header de SellScreen y en AppButton) pero no está definido.
- **Tipografía:** Plus Jakarta Sans se carga con `@fontsource` en los pesos 300–800 (`index.tsx`). El código usa `font-black` (900) en todos los precios y totales, así que el navegador lo **sintetiza** y se ve borroso. Además `index.html` descarga Noto Sans y JetBrains Mono desde Google Fonts, que casi no se usan.
- **Iconos:** se usa una sola librería, Material Symbols Outlined (fuente de Google, `display=block`). WhatsApp es un SVG inline. Esto es consistente. Lo que varía es el relleno (`FILL` 0/1 mediante `style` inline) y hay 15 tamaños distintos.
- **Botón principal sin jerarquía clara:** "Procesar Pago", "Finalizar Venta" y "Pagar" son **negros** (`gray-900` / `slate-900`), "Nueva Venta" es **ámbar**, y en el header "Crear" es índigo y "Egresos" rojo. La marca ámbar no manda en las acciones principales.
- **Accesibilidad:** en los 13 archivos del flujo hay **0** usos de `focus-visible:`. El CSS global (`index.css`) quita el outline de todos los inputs con `!important`. Hay pocos `aria-label` (SellScreen: 16 botones, 0 aria; SuccessSidebar: 8, 0). Los botones táctiles del stepper miden 29px y los del carrito 24–28px. Hay textos de 8–10px en `gray-400` y el ámbar se usa como color de texto sobre blanco (contraste de ~1,7:1).
- **Conclusión:** el rediseño se puede hacer **sin tocar lógica**. Conviene arrancar por (1) definir tokens semánticos en el config, (2) arreglar las clases inválidas, (3) unificar botones, inputs y chips, y después aplicarlo pantalla por pantalla. Hay un riesgo grande: los tokens y `index.css` son **globales**, así que cambiar `primary`, `background` o `surface` afecta a toda la app de golpe.

---

## 2. Inventario de archivos del flujo de venta

| # | Archivo (ruta absoluta) | Rol |
|---|---|---|
| 1 | `c:\Users\HP\OneDrive\Escritorio\Bistro\index.html` | Carga Tailwind CDN + `tailwind.config` inline (tokens), Google Fonts (Noto Sans, JetBrains Mono, Material Symbols). `<body style="background-color:#f6f8f7">` |
| 2 | `c:\Users\HP\OneDrive\Escritorio\Bistro\index.css` | Reset, quita outline de inputs, scrollbars, keyframes (`fadeIn`, `slideInUp`, `modalIn`, `cardEntry`, shimmer…) |
| 3 | `c:\Users\HP\OneDrive\Escritorio\Bistro\index.tsx` | Importa `@fontsource/plus-jakarta-sans` 300–800 |
| 4 | `c:\Users\HP\OneDrive\Escritorio\Bistro\App.tsx` | Layout global, monta SellScreen; en móvil monta `PaymentScreen` y `SuccessScreen` como overlays `fixed inset-0` (`lg:hidden`) |
| 5 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\Sidebar.tsx` | Sidebar izquierda (Operaciones / Gestión / Equipo), item activo en gris |
| 6 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\MobileNavBar.tsx` | Barra inferior móvil |
| 7 | `c:\Users\HP\OneDrive\Escritorio\Bistro\screens\SellScreen.tsx` | Contenedor: header desktop (Crear / Egresos / Abonos / Turno / chips de sync), menús desplegables, action sheet móvil de Egresos, chip offline flotante, monta `MenuScreen` |
| 8 | `c:\Users\HP\OneDrive\Escritorio\Bistro\screens\MenuScreen.tsx` (2966 líneas) | **Núcleo del POS**: header móvil (buscador colapsable + dropdown de modo), header desktop (buscador + chips de categorías, l.1293–1530), grid tablet (l.1962), **grid desktop con tarjetas inline** (l.2143–2270), lista EAN, FAB tablet, barra "Procesar Pago" móvil/tablet, **aside derecho de 400px** (Orden Rápida / carrito / PaymentSidebar / SuccessSidebar, l.2453–2660), bottom sheet de categoría móvil (l.2672+), modal "¿Limpiar orden?" |
| 9 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\CartItemRow.tsx` | Fila de item del carrito (layout `flat` en Catálogo y layout desplegable) |
| 10 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\ui\ProductThumb.tsx` | Miniatura con fallback (sugerencias, filas del escáner) |
| 11 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\ProductCard.tsx` | **Sin uso** en el JSX (las tarjetas del grid son inline en MenuScreen). No sirve como base del rediseño |
| 12 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\TableSelectorControl.tsx` | Píldora "Orden Rápida / Mesa" en el aside |
| 13 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\ComandaLabelHeaderButton.tsx` | Botón "Pedido" (etiquetas de comanda) en el header del aside |
| 14 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\TablesReadOnlyBanner.tsx` | Banner de solo lectura de mesas |
| 15 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\PriceInputModal.tsx` | Modal de producto por peso (Kg/Lb) con preview del precio |
| 16 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\QuantityInputModal.tsx` | Modal para editar la cantidad (al tocar el número del stepper) |
| 17 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\DiscountModal.tsx` | Descuento por item |
| 18 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\ProductOptionsModal.tsx` / `ProductEditModal.tsx` | "Modificador" / opciones del item (vía `onEditProduct`) |
| 19 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\MobileScannerItemModal.tsx` | Edición de item en modo escáner móvil |
| 20 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\FlyToCartLayer.tsx` | Animación "volar al carrito" |
| 21 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\PaymentSidebar.tsx` (1017 l.) | **Cobro en desktop**: tabs Pago Directo / Crédito, cliente, descuento, Pago Mixto, grid de métodos, efectivo / cambio, crédito (fecha, abono, nota), footer "Total a Pagar" + "Finalizar Venta" |
| 22 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\CreateClientModal.tsx` | Crear cliente (usa `AppButton`) |
| 23 | `c:\Users\HP\OneDrive\Escritorio\Bistro\screens\PaymentScreen.tsx` (1544 l.) | **Cobro en móvil/tablet**: paso `summary` (carrito + "Agregar" / "Pagar") y paso `payment` (equivalente al sidebar) + Numpad propio |
| 24 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\Numpad.tsx` | Teclado numérico en pantalla (móvil) |
| 25 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\SuccessSidebar.tsx` | **Confirmación en desktop**: overlay oscuro sobre el catálogo + panel derecho con check, total, cambio, acciones WhatsApp / PDF / Correo, comanda, "Imprimir Ticket", "Nueva Venta" |
| 26 | `c:\Users\HP\OneDrive\Escritorio\Bistro\screens\SuccessScreen.tsx` | Confirmación en móvil (misma estructura, `fixed inset-0`) |
| 27 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\ComandaTargetGrid.tsx`, `PrinterSplitButton.tsx`, `PrinterSettingsPanel.tsx`, `EmailReceiptModal.tsx` | Acciones post-venta (comanda, impresión QZ, email) |
| 28 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\ReceiptThermal.tsx`, `ReceiptPDF.tsx`, `ReceiptThermalPDF.tsx`, `ReceiptHTML.tsx`, `ReceiptPreviewCard.tsx` | Recibos (texto, PDF, HTML). **Fuera del alcance visual de la UI** (son documentos impresos) |
| 29 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\ui\AppButton.tsx` | Único botón base. Solo se usa en formularios (CreateClientModal, pantallas de producto), **no en el flujo de venta** |
| 30 | `c:\Users\HP\OneDrive\Escritorio\Bistro\components\expense\ExpenseActionsMenu.tsx`, `modals\QuickTransactionModal.tsx`, `OfflineFeaturesModal.tsx`, `modals\UpgradeProModal.tsx` | Menús y modales que se abren desde el header de SellScreen |

---

## 3. Fuente, iconos y tokens

**Tokens existentes** (`index.html`, `tailwind.config.theme.extend`):
- `primary` DEFAULT `#fbbf24`, hover `#f59e0b`, active `#d97706`, light `#fffbeb`, text `#78350f`
- `background` light `#f8fafc` / dark `#102218`; `surface` light `#fff` / dark `#1c2e24`
- `text.main #0f172a`, `text.secondary #64748b`, `text.onPrimary #102218`
- `status` success / warning / error / info
- Aliases legacy: `background-light`, `surface-dark`, `text-main`…
- `fontSize` sobrescribe `sm`, `base`… y agrega `2xs` y `caption`, que **nadie usa**: el código usa `text-[10px]` y `text-[12px]`
- `boxShadow.card` / `card-hover`: **no se usan** en el flujo, que tiene sombras ad-hoc (`shadow-lg shadow-gray-200/50`, `shadow-[0_-4px_20px_rgba(0,0,0,0.05)]`…)
- `fontFamily.display` = Plus Jakarta Sans; `body` = Noto Sans
- **Faltan:** `border-light` / `border-dark` (se referencian igual), escala de radios semántica, color secundario "emerald" como token, tokens de foco

**Inconsistencias globales detectadas:**
- `<body>` tiene `class="bg-background-light"` (#f8fafc) **y** `style="background-color:#f6f8f7"`. Gana el inline: el fondo real es verde grisáceo, no slate-50.
- El catálogo móvil usa `bg-[#f8faf9]` / `dark:bg-[#0d1c14]`, un tercer tono de fondo.
- Hay tres colores distintos de "texto sobre ámbar": `text-[#102218]`, `text-text-main` (#0f172a) y `text-amber-950` (FAB tablet).
- Color de títulos de tarjeta: `text-[#111814]` (hardcode) en lugar de `text-text-main`.
- `tailwindcss`, `postcss` y `autoprefixer` están en `package.json`, pero no hay `tailwind.config.*` ni `postcss.config.*`. **El build no compila Tailwind: depende del CDN `cdn.tailwindcss.com`** (no recomendado para producción, y en una PWA offline la primera carga sin red queda sin estilos).

---

## 4. Auditoría por componente (estado actual)

### 4.1 Header de SellScreen (`SellScreen.tsx` l.335–620)
- `h-14`, `bg-surface-light`, `border-border-light` (token inexistente; se ve por el color de borde por defecto).
- Botones `h-9 lg:h-10`, `text-[12px] lg:text-sm`, `rounded-lg lg:rounded-xl` (el radio cambia según el breakpoint).
  - **Crear**: `bg-indigo-50/50 text-indigo-700`. Índigo no forma parte de la paleta.
  - **Egresos**: `bg-red-50 text-status-error border-red-100`, y activo `bg-status-error text-white`. Una acción rutinaria se pinta de "peligro".
  - **Abonos / Turno**: outline `bg-white border-gray-200`, y Abonos abierto en `bg-amber-50`.
- Menús desplegables: `rounded-xl` (Crear, Abonos) vs `rounded-2xl` (Egresos). Fondo dark `#1A2638` (azul marino hardcodeado, de otra paleta) vs `surface-dark`. Iconos en círculos de 5 colores (azul, esmeralda, naranja, morado, ámbar). Badge "PRO" con `py-0.2` (clase inexistente).
- Chips de sync: hex `#102218` hardcodeado ×18; `style={{fontVariationSettings}}` inline.
- Sin `aria-expanded` ni `aria-haspopup` en los botones con dropdown, sin `focus-visible`, 0 `aria-label`.

### 4.2 Buscador + chips de categoría (`MenuScreen.tsx` l.1293–1530)
- Buscador: `w-[260px] h-9 rounded-lg border-gray-200 focus-within:border-primary focus-within:ring-primary/10`. Placeholder "Buscar producto" sin "…", mientras otra variante usa "Buscar producto...". El botón ✕ no tiene `aria-label`.
- Chips: `px-4 py-2 rounded-full text-xs font-semibold`.
  - Activo: `bg-primary text-text-main`. **Favoritos activo usa `bg-emerald-700 text-white`**, otro color de acento.
  - Inactivo: `bg-gray-100 text-gray-600`.
  - `style={{borderWidth:0, outline:'none'}}` inline + `outline-none ring-0` → **no se ve el foco de teclado**.
  - No usan `aria-pressed`.
- Skeleton: `h-8 w-20 bg-gray-200 rounded-full`, que no coincide con la altura real del chip (~32px). Está bien.

### 4.3 Tarjeta de producto desktop (inline, `MenuScreen.tsx` l.2143–2270)
- Contenedor: `rounded-[21px] p-[13px] shadow-lg shadow-gray-200/50 border-gray-100`. Imagen: `rounded-[15px]`. Botones: `rounded-[0.5rem]` y `w-[29px] h-[29px]`. **Son números arbitrarios fuera de escala.**
- Selección: `border-primary ring-2 ring-primary/50 scale-[1.02]`. Pulso al agregar: `ring-2 ring-primary scale-[0.98]`.
- Badge de precio: `bg-black/80 text-white rounded-full text-xs font-bold`. Para productos por peso: `bg-emerald-50 border-emerald-200 text-emerald-900` + "/Lb" en `text-[10px] emerald-600`. **Dos estilos de precio distintos** y el badge tapa la imagen.
- Favorito: estrella `text-emerald-600` arriba a la izquierda (verde para "favorito", donde se esperaría ámbar o amarillo).
- Nombre: `font-normal text-[13px] text-[#111814] line-clamp-3`. **Es el elemento más importante de la tarjeta y tiene el peso más bajo.**
- Stepper: fondo `bg-gray-50 rounded-xl p-1.5`; "−" `bg-red-50 text-red-500` (rojo para restar); cantidad `text-[15px] font-black` en `text-primary-text` (#78350f); "+" `bg-primary text-[#102218] hover:bg-primary/80` (el hover **aclara** en vez de oscurecer, al revés de `primary.hover`).
- Imagen: `group-hover:scale-110` con `object-contain` (zoom que puede cortar). El placeholder es el icono `restaurant`, poco adecuado para una tienda o minimercado.
- Toda la tarjeta es un `div onClick` **sin `role="button"`, `tabIndex` ni `onKeyDown`**. La cantidad es un `<span onClick>`.
- Entrada escalonada `animationDelay index*30ms`: con muchos productos, los últimos aparecen con más de 1 s de retraso.

### 4.4 Aside "Orden" (`MenuScreen.tsx` l.2453–2660)
- `width: 400px` como style inline; `border-l border-gray-200`.
- Header: píldora "ORDEN RÁPIDA" `text-[10px] uppercase tracking-wide bg-slate-100 text-slate-600` con punto `slate-400` (en modo mesa es esmeralda). Botón limpiar: icono `mop` (un trapeador), poco intuitivo para "Vaciar orden", y sin `aria-label`.
- Etiqueta "DETALLES": `text-[10px] text-gray-400 uppercase tracking-widest`. Contraste ~2,5:1 y aporta poco.
- Estado vacío: icono `shopping_cart` + "Orden vacía" con `opacity-50`. Sin mensaje de ayuda (p. ej. "Toca un producto para agregarlo").
- Botón **PROCESAR PAGO**: `h-12 rounded-xl text-[12px] font-bold uppercase tracking-widest bg-gray-900 text-white`, flecha en `text-primary` y total `font-black`. Deshabilitado: `opacity-50`, que da el gris del screenshot. Con foco de teclado (`sidebarFocus==='process'`) **cambia a ámbar**, así que el botón cambia de color según el estado de foco.
- FAB "Enviar Comanda": `bg-[#102218] rounded-full` (verde oscuro), otro estilo de botón más.

### 4.5 CartItemRow (`components/CartItemRow.tsx`)
- Variante `flat` (Catálogo): `bg-gray-50/80 rounded-xl` dentro de un `border-b` blanco (doble separación). Thumbnail `size-14 rounded-lg`. Badge de cantidad `bg-primary text-[#102218] text-[10px] h-[18px]` arriba a la izquierda, con unidad en `text-[8px]`.
- Nombre `text-[13px] font-semibold`, precio `text-sm font-bold`.
- Stepper `h-7 rounded` (radio 4px, distinto de todo lo demás), botones `px-1.5` **sin área táctil mínima** e iconos `text-[14px]`. Los botones +/− no tienen `aria-label`.
- Botón "MODIFICADOR" `text-[9.5px] sm:text-[10.5px] uppercase` con hover ámbar. Descuento: icono `sell` `size-7`. Eliminar: `size-7`, gris con hover rojo.
- Chips de modificadores: naranja (término), rojo ("Sin X"), esmeralda (add-ons) y nota en `teal-600 italic`. Son cuatro tonos para metadatos.
- Descuento: texto `text-[10px] gray-400`. Poco visible para algo que cambia el precio.

### 4.6 PaymentSidebar (`components/PaymentSidebar.tsx`)
- Paleta **100% slate/negro** (243 `slate-*`), desconectada del ámbar del catálogo. Seleccionado = `border-slate-800 ring-1 ring-slate-800`.
- Labels `text-xs font-bold uppercase` en todas partes (16 `uppercase`), con un "CAMBIO" escrito en mayúsculas en el JSX.
- Tabs Pago Directo / Crédito: segmented control `bg-slate-100/80 p-1 rounded-xl`, tab `h-11 rounded-lg text-xs uppercase`.
- Inputs: `h-11 rounded-xl border-slate-200 focus:border-slate-400 focus:ring-slate-400/20`. El de efectivo recibido usa `border-2 rounded-2xl`, distinto del resto.
- **Cambio** en `bg-rose-50 text-rose-600 text-xl font-black`. El vuelto en **rojo** se lee como error o deuda; en SuccessSidebar el mismo dato es **verde** (`text-green-600`).
- Grid de métodos `grid-cols-3 h-11`: solo texto, sin iconos (Efectivo, Tarjeta, Nequi, Daviplata, Transferencia, Otro).
- Estado Pago Mixto: Completo (esmeralda) / Restante (ámbar) / Excedido (rosa), con bordes `-250` **inválidos** (no se ve borde).
- Footer: "TOTAL A PAGAR" `text-[10px] uppercase text-slate-450` (**inválido**, sin color definido) + total `text-2xl font-black`. Botón "Finalizar Venta" `h-12 bg-slate-900`. Deshabilitado `bg-slate-100 text-slate-400` + `dark:text-slate-650` (inválido).
- **Clases inválidas encontradas:** `slate-150`, `slate-250`, `slate-350`, `slate-450`, `slate-650`, `gray-750`, `gray-850`, `rose-250`, `rose-450`, `rose-455`, `amber-250`, `emerald-250`.
- Spinners SVG duplicados inline (tres copias en el flujo).

### 4.7 PaymentScreen móvil (`screens/PaymentScreen.tsx`)
- Comparte el estilo de PaymentSidebar, con **más** clases inválidas (también `emerald-450`, `amber-450`, `gray-350`) y `zinc-800` mezclado con gray y slate.
- Footer: "Agregar" `bg-primary h-14` + "Pagar $X" / "Finalizar Venta" `bg-gray-900 h-14 text-lg`. Aquí el **ámbar es la acción secundaria y el negro la primaria**, al revés que "Nueva Venta".
- **Bug visual:** en crédito sin fecha el botón está `disabled`, pero la condición que lo pinta de gris no incluye `creditDueDate`, así que **se ve habilitado**. Se arregla solo con estilos usando `disabled:` variants.
- Numpad: labels `text-[10px] uppercase`; Cambio en `bg-red-50 text-red-600` (rojo otra vez).

### 4.8 SuccessSidebar / SuccessScreen
- Check `size-16 bg-green-50 text-green-600 ring-4 ring-green-100` (`green-*`, no `emerald` ni `status-success`); en crédito `blue-*`.
- "¡Venta Exitosa!" `text-xl font-black`. Fecha • cliente `text-xs`.
- Caja de total `border-dashed rounded-2xl bg-gray-50`, "TOTAL" `uppercase`, monto `text-3xl font-black`, Cambio en `green-600`.
- Acciones `grid-cols-3 h-[68px]` (móvil `h-[72px]`) con hover de **tres colores** (WhatsApp verde, PDF morado, Correo ámbar). Labels `text-[11px]`.
- "Imprimir Ticket" (`PrinterSplitButton`) y **"Nueva Venta"** `h-14 rounded-2xl bg-primary shadow-primary/25`: este es el único CTA ámbar del flujo.
- Overlay `bg-black/50 backdrop-blur-[1px]` sobre el catálogo, con `right:'400px'` hardcodeado.
- `animate-[scaleIn_…]`: el keyframe `scaleIn` **no existe**, así que el menú Compartir aparece sin animación.

### 4.9 Catálogo móvil + bottom sheet (`MenuScreen.tsx` l.1640–1830, 2672+)
- Fondo `bg-[#f8faf9]` hardcodeado. Chips `px-3 py-1.5` (más chicos que en desktop, `px-4 py-2`). Botón "Ver/Ocultar" `w-[88px]`.
- Estado vacío "Elige una categoría" con icono `category` en círculo gris.
- Bottom sheet `rounded-t-2xl max-h-[88vh]`, handle `w-10 h-1`; filas `size-11` imagen + nombre `text-sm font-semibold` + precio "/ Und" `text-xs gray-400` + estrella + stepper `size-9 rounded-full` (aquí los botones sí son circulares; en desktop son cuadrados de 29px).
- Barra inferior "Procesar Pago": `min-h-[56px] bg-gray-900 rounded-xl`, "N ITEMS" `text-[10px] uppercase opacity-60`, total `text-primary font-black`. En tablet la variante usa `font-black uppercase tracking-wider`, otro estilo de texto.
- FAB tablet `w-20 h-28 border border-black` con icono `text-[56px] scale-y-125` (estirado) y badge `bg-red-600`: es el elemento visualmente más disonante.

### 4.10 Sidebar de navegación (`components/Sidebar.tsx`)
- Item activo en gris (`text-gray-900 font-semibold`) sin acento de marca. Títulos de sección Operaciones / Gestión / Equipo. Usa `gray-150`, `gray-250` y `gray-850` (inválidos). Labels `text-[13px]` / `text-[14px]` según la variante.

---

## 5. Mejoras visuales priorizadas (sin cambiar lógica)

### P0 — Base del design system (hacer primero, es lo que destraba el resto)
1. **Tokens semánticos** en `index.html` → `tailwind.config`:
   - `primary` (ámbar 400/500/600) + `primary-foreground #102218` (un único "texto sobre ámbar").
   - `brand-dark` = `#102218` como token. Reemplaza los ~37 hex hardcodeados.
   - **Neutros: elegir UNA escala (`slate`) y migrar `gray` / `zinc` a ella.**
   - Definir `border` (light/dark), que hoy se referencia y no existe.
   - `success` = emerald-600 (para vuelto y venta exitosa), `danger` = red-600 (solo para eliminar o errores), `info`.
   - Escala de radios: `control` 10px (inputs y botones), `card` 16px, `sheet` 20px, `full`.
   - Sombras: usar `shadow-card` / `card-hover` que ya existen y agregar `shadow-elevated` para paneles.
   - Tipografía: `2xs` (10), `caption` (12), `sm`, `base`, `lg`, `xl`, `2xl`, `3xl`, y **eliminar los `text-[Npx]`**.
2. **Arreglar las clases inválidas** (`*-150/250/350/450/455/650/750/850`, `py-0.2`, `animate-[scaleIn]`) en PaymentSidebar, PaymentScreen, Sidebar y MenuScreen. Hoy hay bordes y colores que no se renderizan.
3. **Tipografía:** agregar `@fontsource/plus-jakarta-sans/latin-900.css` o cambiar `font-black` por `font-extrabold` (800) en precios y totales. Quitar Noto Sans y JetBrains Mono de `index.html` si no se usan (`font-body` casi no se usa). Aplicar `tabular-nums` a todos los montos.
4. **Fondo único:** quitar el `style="background-color:#f6f8f7"` del `<body>` y el `bg-[#f8faf9]` del catálogo móvil, y usar `bg-background`.
5. **Foco accesible:** agregar un `focus-visible:ring-2 ring-primary ring-offset-2` estándar a botones, chips y tarjetas. Quitar los `style={{outline:'none'}}` de los chips. Dar a los inputs un `focus:ring` visible (index.css ya les quita el outline).

### P1 — Componentes del flujo (alto impacto visual)
6. **Jerarquía de botones unificada:** primario = **ámbar** (`Procesar Pago`, `Finalizar Venta`, `Pagar`, `Nueva Venta`); secundario = outline neutro (`Agregar`, `Abonos`, `Turno`); destructivo = rojo solo para eliminar o vaciar. Sacar índigo de "Crear" y rojo de "Egresos" (dejarlos neutros con icono de color). Quitar `uppercase tracking-widest` de los CTA (sentence case, `text-base font-semibold`). Que el estado de foco por teclado no cambie el color del botón: solo agregar el anillo.
7. **Tarjeta de producto:** radio `rounded-2xl`, padding de 12px, sombra `shadow-card` → `hover:shadow-card-hover`.
   - Nombre `text-sm font-semibold text-text-main line-clamp-2`.
   - Precio **debajo del nombre** como texto `text-base font-bold tabular-nums`, en lugar del badge negro sobre la foto. Para peso, un chip "/Lb" sutil.
   - Stepper con botones de 36px (`size-9 rounded-lg`), "−" neutro (no rojo) y "+" ámbar. Cuando la cantidad es 0, mostrar solo un botón "+ Agregar".
   - Badge de cantidad en el carrito sobre la tarjeta (esquina) para ver qué está seleccionado.
   - Favorito con estrella **ámbar**.
   - Placeholder `inventory_2` / `image` en vez de `restaurant`. Quitar el `scale-110` en hover.
   - Agregar `role="button" tabIndex={0} aria-label` + `onKeyDown` (Enter/Espacio llama al mismo handler; es solo marcado, no cambia la lógica).
8. **Chips de categoría:** altura 36px, `rounded-full`. Activo `bg-brand-dark text-white` o `bg-primary text-primary-foreground` (uno solo, también para Favoritos). Inactivo `bg-white border border-slate-200 text-slate-600 hover:border-slate-300`. Agregar `aria-pressed`. Contador opcional.
9. **Buscador:** `h-10 rounded-xl bg-white border-slate-200`, icono, placeholder "Buscar producto o código…", atajo visual `/` o `F2` como hint, botón limpiar con `aria-label`.
10. **Aside Orden:**
    - Header con título "Orden actual" + píldora de tipo (Rápida / Mesa) + contador de items + botón "Vaciar" con icono `delete_sweep` y `aria-label`.
    - Quitar la etiqueta "DETALLES".
    - Estado vacío ilustrado: icono en círculo `bg-primary/10 text-primary-active` + "Aún no hay productos" + "Toca un producto del catálogo para agregarlo".
    - Footer con desglose (Subtotal / Descuento / **Total** grande) encima del CTA ámbar "Cobrar $X".
11. **CartItemRow:** quitar el doble contenedor (border + fondo gris), filas con `divide-y`. Stepper de `h-8`, botones `size-8` con `aria-label`. "Modificador" como icono `tune` + tooltip (o texto en sentence case `text-xs`). Descuento visible en verde o ámbar con el precio original tachado. Badge de cantidad legible (`text-xs`).
12. **PaymentSidebar / PaymentScreen:**
    - Reemplazar el "selected = slate-800" por un acento de marca (`border-primary bg-primary/10 ring-primary`).
    - Métodos de pago con **icono** (`payments` Efectivo, `credit_card` Tarjeta, `smartphone` Nequi/Daviplata, `account_balance` Transferencia).
    - Labels en sentence case `text-sm font-medium text-slate-600`.
    - **Cambio en verde (`success`)**, igual que en la pantalla de éxito.
    - "Total a pagar" grande y legible.
    - Botones rápidos de billetes sugeridos solo si ya existen en la lógica (si no, queda fuera del alcance).
    - Unificar los inputs (`h-11 rounded-xl border` en todos, sin `border-2`).
    - Arreglar el botón en crédito sin fecha con `disabled:` variants.
13. **Success:** usar `success` (emerald) en lugar de `green`. Hover de acciones neutro + icono con color propio. Recibo "tipo ticket" (borde dentado o dashed) con desglose. "Nueva Venta" como CTA ámbar ya está bien. Agregar `aria-label` y `aria-live="polite"` al título.

### P2 — Pulido
14. Animaciones: limitar el `animationDelay` del grid (p. ej. `Math.min(index,12)*30ms`) y respetar `motion-reduce:`.
15. Skeletons de tarjetas con `.skeleton-shimmer` (ya existe en index.css) mientras `productsLoading`.
16. FAB tablet: quitar `border-black` y el icono estirado, y usar una barra "Cobrar" como en móvil, o un FAB `rounded-2xl` con sombra de marca.
17. Sidebar de navegación: item activo con `bg-primary/10 text-primary-text` + barra lateral ámbar de 3px.
18. Modo oscuro: revisar que `surface-dark` y `background-dark` (verde) no se mezclen con `#1A2638` (azul) ni con `gray-800/900`.
19. Componentes base nuevos en `components/ui/`: `Button` (extender `AppButton`), `Chip`, `IconButton`, `Input`, `Stepper`, `PriceTag`, `EmptyState`, `Spinner`. Así no se repiten las mismas cadenas de clases en tres archivos.

### Riesgos
- **Tokens globales:** cambiar `primary`, `background`, `surface`, `text-*` o el `fontSize.sm/base` sobrescrito en `index.html` afecta a **todas** las pantallas a la vez. Conviene agregar tokens nuevos (`primary-foreground`, `border`, `brand-dark`…) en lugar de redefinir los existentes, o validar visualmente Dashboard, Inventario, etc.
- **index.css global:** cambiar las reglas de outline o foco afecta a toda la app (es para bien, pero es global).
- **Tailwind CDN:** al compilar en runtime **no hay purga**, así que las clases dinámicas (template strings) funcionan. El riesgo es el inverso: errores de tipeo silenciosos, como las clases `-450`. Si en el futuro se migra a Tailwind compilado (PostCSS, ya instalado), habrá que crear `tailwind.config.js` con `content` y cuidar las clases construidas por concatenación.
- **Componentes compartidos:** `CartItemRow` lo usan MenuScreen (aside + móvil) y PaymentScreen. `PaymentSidebar` se usa en modo EAN (escáner) y Catálogo. `TableSelectorControl` y `ComandaLabelHeaderButton` en modo mesa. `CreateClientModal` y `AppButton` en formularios de producto y clientes. Cualquier cambio se verá también en esos contextos.
- **Duplicación:** las tarjetas del grid están **inline dos veces** (grid tablet l.1962 y grid desktop l.2143), y la barra "Procesar Pago" está repetida en cuatro variantes. Hay que cambiarlas todas igual o extraer el JSX a un componente presentacional (es solo mover JSX y conviene confirmarlo).
- **Mantener intactos:** `id="product-card-…"`, `id="cart-fab"` y `id="desktop-cart-container"` (anclas de FlyToCartLayer y del layout), `data-barcode-passthrough`, `onPointerDown preventDefault` (mantienen el foco del buscador para la pistola USB) y el `style width:400px` del aside (lo usa el overlay de Success con `right:'400px'`).
- **Densidad:** es un POS de mostrador. Agrandar tarjetas o botones reduce los productos visibles por pantalla, así que hay que balancear tamaño táctil y densidad.

---

## 6. Estructura visual de estados que NO salen en el screenshot (para mockups)

### 6.1 Desktop catálogo — carrito con items (aside derecho, 400px)
```
┌ Aside ───────────────────────────────────┐
│ [● ORDEN RÁPIDA ▾] [Pedido]       [🧽]   │  ← píldora / selector mesa, etiquetas, limpiar
│ DETALLES                                  │
│ ┌──────────────────────────────────────┐ │
│ │[2]┌img┐ Arroz Diana 500g     $5.800  │ │  badge qty ámbar sobre img 56px
│ │   └───┘ [− 2 +] [MODIFICADOR] [🏷] … [🗑]│
│ │   Descuento                  -$500    │ │  (si aplica)
│ │   [Término medio][Sin cebolla]["nota"]│ │  (si aplica)
│ └──────────────────────────────────────┘ │
│  … más filas (el último agregado arriba)  │
│                                           │
├───────────────────────────────────────────┤
│ [ PROCESAR PAGO  →  $12.300 ]  (negro)    │
└───────────────────────────────────────────┘
(En modo mesa: separador "Comanda enviada" y FAB verde oscuro "🖨 Enviar Comanda")
```
Las tarjetas del grid con cantidad > 0 muestran el número en ámbar oscuro y el "−" en rojo claro.

### 6.2 Desktop — Pago (PaymentSidebar reemplaza el carrito en el aside)
```
[←] [ PAGO DIRECTO | CRÉDITO ]           (segmented)
ASIGNAR A CLIENTE (*)                     
[ Nombre, teléfono o documento... ] [👤+ CREAR]
   → dropdown: avatar · Nombre · Tel · "Deuda: $X" (rosa)
   → cliente elegido: chip [👤 Nombre] [✏][✕] + panel de edición inline (Nombre/Tel/Dirección, Guardar/Cancelar)
DESCUENTO
[ %  0 ] = [ $  0.00 ]
[ ⑂ PAGO MIXTO ]                          (toggle)
MÉTODO DE PAGO
[Efectivo][Tarjeta][Nequi]
[Daviplata][Transferencia][Otro]          (grid 3 col, seleccionado borde negro)
(si Efectivo) EFECTIVO RECIBIDO [$ ____ ]   CAMBIO [ $3.700 ] (rosa)
(si Mixto)  DIVIDIR ENTRE MÉTODOS: fila por método "[Efectivo] [$ ___]"…
            [✓ Completo | Restante | Excedido   $X]
─────────── footer fijo ───────────
TOTAL A PAGAR            [ Finalizar Venta ✔ ] (negro; gris si deshabilitado; spinner al procesar)
   $12.300
```
**Crédito:** cliente obligatorio (*) → FECHA DE PAGO ACORDADA * [fecha] [Elegir 📅] → ABONO INICIAL (opcional) [$] → si hay abono y turno: MEDIO DE PAGO (grid 3 col pequeño); sin turno: input "Descripción del abono" → NOTA DE CRÉDITO [textarea "Observaciones..."] → botón "Confirmar Crédito". Sin permiso, el botón dice "No tienes permiso 🔒".

### 6.3 Desktop — Confirmación (SuccessSidebar)
El catálogo queda detrás de un overlay negro al 50%. En el aside:
```
            (✓)  círculo verde (crédito: azul "verified")
       ¡Venta Exitosa!   /  Crédito Registrado
       12 may, 10:32 • Consumidor Final
┌ - - - - - - - - - - - - - - - - - ┐
│ TOTAL                              │
│ $12.300                            │
│ Cambio                    $3.700   │ (verde)
└ - - - - - - - - - - - - - - - - - ┘
[Nota] (solo crédito, caja azul)
[ WhatsApp ] [ PDF ] [ Correo ]      (68px, icono + label)
(Catálogo con destinos) "Enviar comanda a": grid de impresoras/dispositivos
[ 🖨 Imprimir Ticket | ▾ ]           (split button; "Conectar impresora")
[ + Nueva Venta ]                    (ámbar, h-14)
```
Mientras se genera el recibo se muestra un spinner `progress_activity` a pantalla del panel.

### 6.4 Móvil (≤767px) — Catálogo
- **Header:** `[🔍 Buscar] [⊞ Catálogo ▾] [Pedido]`. Al expandir: input a lo ancho con ✕ y dropdown de sugerencias (miniatura, nombre, "$precio / Und", stepper −/+ circular).
- **Debajo:** chips de categorías en varias filas (Favoritos ★ verde, categorías) + botón flotante "Ver/Ocultar ▾".
- **Cuerpo vacío:** círculo gris con icono `category` + "Elige una categoría" + "Selecciona una categoría arriba para ver sus productos y agregarlos".
- **Cuerpo con items:** lista de `CartItemRow` flat (igual que el aside).
- **Bottom sheet** (al tocar una categoría): handle, título de la categoría + 🔍 + ✕; filas: img 44px, nombre, "$precio / Und", ★, stepper (solo "+" si la cantidad es 0). Estados vacíos "Sin productos en esta categoría" / "Sin resultados".
- **Barra fija inferior** (si hay items): botón negro a lo ancho `[ N ITEMS / $total(ámbar) | Procesar Pago | → ]`.
- **Tablet (768–1023):** grid de tarjetas (minmax 140px) + FAB ámbar de 80×112 con icono `list_alt` y badge rojo con la cantidad.

### 6.5 Móvil — Pago (PaymentScreen, overlay a pantalla completa)
- **Paso `summary`** (tablet, o cuando no se usa el flag de pago directo): header con cliente (buscar / crear / limpiar 🧽), "Detalles · N items", lista de CartItemRow, footer `[+ Agregar](ámbar) [💳 Pagar $X](negro)`. Vacío: "Tu orden está vacía". Modal "¿Limpiar orden?" con Cancelar / Limpiar.
- **Paso `payment`:** mismos bloques que el sidebar (tabs Pago Directo / Crédito, cliente, descuento, Pago Mixto, "Método de Pago" como título `text-lg`, grid de métodos, efectivo / cambio). Los inputs numéricos abren el **Numpad** inferior propio (con display "Efectivo recibido / Cambio" o "Descuento % / Descuento $"). Footer: "TOTAL A PAGAR $X" (`text-3xl`) + `[+ Agregar] [Finalizar Venta]` (o "Procesando..." con spinner).

### 6.6 Móvil — Éxito (SuccessScreen, `fixed inset-0`)
Igual que 6.3 pero a pantalla completa: check, "¡Venta Exitosa!" / "Crédito Autorizado", "TOTAL PAGADO", cambio, grid `[WhatsApp][Ticket][Correo]` (72px), "Imprimir Ticket" (deshabilitado si no hay impresora) y "Nueva Venta" ámbar.

### 6.7 Modales auxiliares del flujo
- **PriceInputModal** (peso): nombre del producto, precio por unidad, input de cantidad (Kg/Lb) con preview del total en vivo, Cancelar / Agregar.
- **QuantityInputModal:** input numérico grande (`text-[22px]`) y confirmar.
- **DiscountModal:** nombre del item, precio, % o $, Aplicar.
- **CreateClientModal:** Nombre, Documento, Teléfono (PhoneInput), Email, Dirección, "Guardar Cliente" (AppButton ámbar).

---

## 7. Conclusión y recomendación de orden de trabajo

1. **Fase 0 (base, sin efecto en la lógica):** tokens nuevos en `index.html`, peso 900 de la fuente (o cambio a `extrabold`), fondo único, estilos de foco en `index.css`, y corrección de las clases inválidas. Validar con `npm run dev` que el resto de pantallas no cambian de forma inesperada.
2. **Fase 1 (catálogo desktop):** header de SellScreen, buscador + chips, tarjeta de producto (las dos copias inline) y aside Orden + CartItemRow.
3. **Fase 2 (cobro):** PaymentSidebar y PaymentScreen con el mismo lenguaje visual (acento ámbar, iconos de métodos, cambio en verde, CTA ámbar).
4. **Fase 3 (confirmación + móvil):** SuccessSidebar / SuccessScreen, catálogo móvil, bottom sheet, barras de cobro y FAB tablet.
5. Antes de implementar, generar el **mockup** de los estados 6.1–6.6 con la paleta propuesta (ámbar `#fbbf24` como acción principal, `#102218` como superficie de marca, neutros `slate`, `emerald-600` para éxito y vuelto, `red-600` solo para eliminar).

Verificación hecha: lectura de `index.html`, `index.css`, `index.tsx`, `package.json`, `SellScreen.tsx` (completo), `MenuScreen.tsx` (header, grids, aside, sheet), `CartItemRow.tsx`, `PaymentSidebar.tsx` (render completo), `PaymentScreen.tsx` (summary, footer, numpad), `SuccessSidebar.tsx`, `SuccessScreen.tsx` (parcial), `AppButton.tsx` y `Sidebar.tsx` (parcial), más un conteo automático de clases por archivo. No se revisaron a fondo `PriceInputModal`, `QuantityInputModal`, `DiscountModal`, `TableSelectorControl`, `ComandaTargetGrid` ni `PrinterSplitButton` (solo métricas de clases), ni se vio la app en ejecución.
