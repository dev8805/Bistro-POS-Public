# Flujo de Ventas: Móvil y Tablet (Modo Scanner y Catálogo)

El flujo de ventas en **móvil y tablet** opera en dos modos seleccionables desde un **dropdown unificado** en el header: el **Modo Scanner** (escaneo por código de barras / cámara) y el **Modo Catálogo** (grid de productos con categorías). Adicionalmente existe el **Modo Escanear Lista** (fotografía de una lista con IA) accesible desde la navegación inferior.

---

## 0. Header Móvil Unificado

Ambos modos (Scanner y Catálogo) comparten un **único header** con layout consistente (`md:hidden`):

### Layout Colapsado (estado por defecto)
```
[ 🔍 Buscar ]  [ {icono} {modo} ▾ ]  [ 📸 ] (solo en Scanner)
```

### Layout con Búsqueda Expandida
```
[ 🔍 input completo...  ✕ ]
```
> En modo Catálogo, al escribir aparece un **dropdown de sugerencias global** debajo del input (ver [`modo_catalogo_pos.md`](./modo_catalogo_pos.md)). El header ya no muestra un botón de carrito al lado del buscador.

### Dropdown de Modo
- Muestra la opción activa con icono y texto ("Escáner" con `barcode_scanner`, o "Catálogo" con `grid_view`).
- Al presionar despliega las dos opciones debajo para cambiar de modo.
- Se cierra automáticamente al hacer click fuera (`mobileModeDropdownRef`).

### Botón de Cámara
- Solo visible en modo Escáner cuando el buscador está colapsado.
- Toggle que activa/desactiva el visor de cámara (`isCameraActive`).
- Icono `photo_camera`; se ilumina en ámbar cuando está activo.

### Buscador
- Colapsable: muestra un botón "🔍 Buscar" por defecto.
- Al presionar, expande un input de búsqueda con botón cerrar (✕).
- En modo Escáner usa `scannerSearch` + `scannerSearchRef` + dropdown de sugerencias.
- En modo Catálogo usa `search` + `mobileSearchRef` + filtra el grid.

---

## 1. Modo Scanner — Header Fijo (Móvil y Tablet)

El header del modo scanner reemplaza el header normal. Está activo por defecto (`isScannerMode = true`) y ocupa toda la barra superior (`md:hidden flex`).

### Input de Búsqueda (`scannerSearchRef`)
- Acepta escritura manual y escaneo por pistola USB (emulación de teclado).
- Muestra un dropdown de sugerencias (`scannerSuggestions`) con hasta 6 resultados, filtrando por nombre o código de barras.
- **`ArrowDown` / `ArrowUp`** navegan por las sugerencias.
- **`Enter`** confirma el producto seleccionado y lo agrega al carrito.
- **Escape** limpia el campo y lo desenfoca.

### Anti-Colisión Pistola USB + Hook Global
El hook `useBarcodeScanner` registra el timestamp del último escaneo de hardware en `lastMachineScanRef`. Si el `onKeyDown` del input detecta un `Enter` dentro de los siguientes **300ms** de ese escaneo, lo ignora para prevenir doble adición del mismo producto.

### Botón de Cámara (`isCameraActive`)
Toggle que activa el visor de cámara trasera (`<BarcodeScanner />`). Se ilumina en ámbar cuando está activo. El visor ocupa el 28% superior de la pantalla (`height: 28vh`) mientras la lista del carrito ocupa el resto.

### Atajos de Teclado con Carrito no Vacío
Cuando el campo de búsqueda está vacío y hay items en el carrito:
- **`Enter` o `+`** → incrementa la cantidad del **último item** del carrito.
- **`-`** → decrementa la cantidad (o elimina el item si es 1).

Esto permite al operador ajustar cantidades rápidamente con la pistola USB sin necesidad de tocar la pantalla.

---

## 2. Lista de Carrito (Modo Scanner)

Una vez escaneado un producto, aparece como fila en la lista del carrito (reverse, el último en la parte superior). Cada fila muestra:
- Imagen del producto (o ícono de inventario si no tiene).
- Badge con la cantidad (esquina superior izquierda de la imagen).
- Nombre, precio unitario, stock disponible.
- Botón de eliminar (`delete`) a la derecha.

### Edición Rápida de Items — `MobileScannerItemModal`
Al **tocar cualquier fila del carrito**, se abre el `<MobileScannerItemModal />`. Permite:
- Editar la **cantidad** del item.
- Aplicar un **descuento** (por monto o porcentaje).
- Si la cantidad es 0 o negativa, el modal rechaza guardar y el item permanece en el carrito sin cambios.

> [!NOTE]
> Este modal es exclusivo del modo scanner. Es el equivalente táctil al botón `-` del grid, pero con más control.

---

## 3. Productos con Peso en Modo Scanner

Si el producto escaneado (vía pistola, cámara o búsqueda manual) tiene una **unidad de peso** (Kg, Lb, g, Oz, etc.), el sistema **no lo agrega directamente al carrito**. En su lugar abre `<PriceInputModal />` para que el operador ingrese la cantidad exacta. El precio total se calcula en tiempo real y se muestra como preview antes de confirmar.

> Ver documentación completa: [`venta_por_peso_medida.md`](./venta_por_peso_medida.md)

---

## 4. Cobro — Flujos Diferenciados por Modo

El cobro en móvil tiene flujos distintos según el modo de venta:

### Modo Escáner — Barra "Procesar Pago" (directo)
- **Barra inferior fija** visible cuando `cart.length > 0` en la sección del carrito escaneado.
- Al presionar, establece `sessionStorage.bistro_payment_skip_summary = 'true'` y navega a `Screen.PAYMENT`.
- `PaymentScreen` lee el flag y abre directamente el formulario de cobro (`step = 'payment'`).
- El flag se limpia tras leerse.

### Modo Catálogo — Barra "Procesar Pago" (directo)

> **Teléfono (≤767px):** desde el rediseño del catálogo móvil, el cobro es **directo** (igual que el modo Escáner), no pasa por el resumen.

- **Barra inferior fija** (no FAB) dentro del bloque de catálogo móvil, visible cuando `cart.length > 0`.
- Al presionar, establece `sessionStorage.bistro_payment_skip_summary = 'true'` y navega a `Screen.PAYMENT`, por lo que `PaymentScreen` abre directo en `step = 'payment'`.
- El **FAB** amarillo (`fixed`, 64px) quedó **solo para tablet** (`hidden md:block lg:hidden`): en tablet sigue navegando a `Screen.PAYMENT`. En tablet el flujo de resumen depende del flag; el FAB de tablet no lo setea.
- Ver el rediseño completo del catálogo en teléfono en [`modo_catalogo_pos.md`](./modo_catalogo_pos.md) → "Modo Catálogo en Móvil (≤767px)".

### Tablet EAN (768px–1023px)
- **Barra inferior full-width** (`hidden md:block lg:hidden`).
- Comportamiento igual al modo escáner: flag → pago directo.

### Altura del overlay de pago (fix `dvh`)

`PaymentScreen` se monta en móvil como un overlay `fixed inset-0` (en `App.tsx`, `lg:hidden`). En navegadores móviles, los elementos `position: fixed` se dimensionan contra el **viewport "pequeño"** (con la barra del navegador visible); cuando esa barra se oculta, un `h-full` queda **más corto que el área visible** y dejaba un **espacio en blanco al fondo** de la pantalla de pago (notorio en teléfonos ~≤430px).

- **Fix:** el contenedor del overlay usa la unidad de viewport **dinámica** `h-[100dvh]` (junto a `inset-0`), que sí rastrea la altura visible real. El drawer interno `h-full` ahora llena exactamente la pantalla, sin hueco.
- En desktop `100dvh = 100vh`, así que no cambia el comportamiento ≥1024px.
- La pantalla de éxito usa el mismo patrón de overlay (`fixed inset-0`); si reaparece el mismo hueco, aplicar el mismo `h-[100dvh]`.

### Pago Dividido / Mixto
Al activar el cobro dividido o mixto en móvil/tablet, el sistema realiza automáticamente un **desplazamiento vertical suave (smooth scroll)** hacia el formulario y desglose de los métodos de pago secundarios.

---

## 5. Modo Catálogo — Productos

Accesible seleccionando "Catálogo" en el dropdown del header. El comportamiento difiere por tamaño de pantalla:

### Teléfono (≤767px) — Lista + bottom sheet (sin grilla)

Desde el rediseño, el teléfono **no muestra la grilla de tarjetas**: la pantalla arranca limpia, las categorías están fijas arriba (`flex-wrap`, sin scroll, sin el chip "Todos"), y al tocar una categoría se abre un **bottom sheet** con la lista de productos para agregar. Los productos se apilan como filas de carrito expandidas y el pago es directo.

> Documentación completa del flujo en teléfono: [`modo_catalogo_pos.md`](./modo_catalogo_pos.md) → "Modo Catálogo en Móvil (≤767px)".

### Tablet (768–1023px) — Grid de Productos

En **tablet** se mantiene el grid responsive con categorías:

#### Categorías
- Barra de categorías scrollable horizontalmente debajo del header (usa el header desktop).
- Botón "Todos" presente como primera opción.
- Solo muestra categorías que tienen al menos un producto (`visibleCategories`).

#### Cards de Producto
Cada card muestra:
- Imagen con aspect-ratio 1:1 (`object-contain`).
- Badge de precio (esquina superior-derecha).
- Badge de stock (esquina inferior-izquierda, si aplica).
- **Botón de opciones** (esquina inferior-derecha): icono `tune` si tiene personalización, `more_horiz` si no. Al presionar abre `onEditProduct(product)`.
- Nombre del producto (máximo 2 líneas).
- Controles de cantidad: botón `-`, display de cantidad (tappable para input manual), botón `+`.

#### Paginación Progresiva
- Carga inicial: 24 productos.
- Al hacer scroll cerca del fondo (< 300px del final), carga 24 más.
- `filteredProducts` → `displayedProducts` (slice).

#### Selección por Teclado
- El grid respeta `selectedIndex` para navegación con flechas (uso en tablet con teclado).
- La card seleccionada muestra borde primario y scale 1.02.

---

## 6. Dependencias Compartidas (No Eliminar)

Ambos modos (Scanner y Catálogo) comparten las siguientes piezas:

| Elemento | Usado por | Razón |
|---|---|---|
| `refocusSearchInput()` | Ambos | Recupera foco en el input activo tras agregar producto |
| `handleMobileQuantityChange()` | Catálogo, suggestions Scanner | Incrementa/decrementa items en carrito |
| `onQuickAdd` / `onQuickAddWithQuantity` | Ambos | Agregar producto al carrito |
| `removeFromCart()` | Ambos | Eliminar item del carrito |
| `PriceInputModal` | Ambos | Productos con peso abren este modal |
| `useBarcodeScanner` (hook global) | Scanner, desktop | Detecta escaneo de pistola USB |
| `filteredProducts` / `displayedProducts` | Catálogo, desktop | Grid y dropdown de sugerencias |
| `scannerSuggestions` | Scanner | Dropdown de búsqueda en header scanner |

---

## Código Pendiente de Limpieza

> [!WARNING]
> Los siguientes elementos existen en el código pero podrían eliminarse:
> - **Vista de Categorías** (`viewMode = 'categories'`): sin entrypoint visible desde el UI actual. Código muerto.
> - **`ProductCard.tsx`**: importado pero sin uso en el JSX de `MenuScreen` (las cards son inline). Puede eliminarse.
> - **`Escáner Remoto Supabase`** (suscripción a `scan_events`): feature no activa en producción.

---

## Modo Escanear Lista (`PhotoOrderScreen`)

Accesible desde la barra de navegación inferior (`MobileNavBar`) mediante el ícono `document_scanner`. Permite fotografiar una lista escrita a mano (pedido, remisión, lista de compras) y convertirla automáticamente en ítems del carrito usando IA.

### Flujo de 3 Estados (`ViewState`)

```
'capture' → (crop) → 'processing' → 'results'
```

**1. Capture:** El usuario selecciona una imagen mediante:
- **Tomar Foto** — activa la cámara trasera con resolución mínima 1280px (fuerza cámara principal). Usa `ImageCapture.takePhoto()` para autoenfoque por hardware.
- **Cargar Imagen** — selector de archivos del dispositivo. Soporta HEIC/HEIF (iPhone).
- **Pegar del Portapapeles** — `Clipboard API` para imágenes copiadas desde otras apps.
- También escucha el evento global `paste` para recibir imágenes pegadas desde el sistema operativo.

**1.5. Recorte (Crop):** Antes de procesar, se muestra el `ImageCropper` para que el usuario ajuste la zona de la imagen:
- Aspect ratio dinámico calculado a partir de las dimensiones reales de la imagen capturada.
- `restrictPosition={true}` y `minZoom={1}` para evitar que la imagen se salga del área visible.
- Sin opción de "Eliminar fondo" (`showRemoveBg={false}`).
- Al confirmar, se recorta la imagen y se pasa al paso de procesamiento.

**2. Processing:** La imagen se comprime antes de enviarse:
- Máximo `1024px` en cualquier dimensión (se escala proporcional con `Math.round`).
- Se convierte a JPEG al `60%` de calidad via `<canvas>` → `toBlob`.
- HEIC/HEIF se envían sin comprimir (el navegador no puede decodificarlos).
- El `base64` resultante se envía a la Edge Function `ocr-scan` vía `supabase.functions.invoke`.

**3. Results:** Muestra la lista de productos detectados unificada y ordenada por `scanOrder` (el orden en que aparecían en la imagen).

---

### Algoritmo de Reconocimiento — Edge Function `ocr-scan`

La función llama a **Gemini Vision API** (`gemini-2.5-flash`) con la imagen y un prompt que le pide extraer una lista estructurada `[{ name, quantity }]` de la lista visible. Usa `responseMimeType: "application/json"` para forzar JSON limpio en la respuesta.

- Gemini devuelve un array `RawOCRItem[]` con el nombre tal como aparece en la imagen y la cantidad.
- Ante cualquier error de Gemini, la función retorna `{ items: [], error: "..." }` con status 200 (no hay lógica de reintento).

> [!NOTE]
> La función vive en `supabase/functions/ocr-scan/index.ts` y está desplegada en Supabase.

---

### Algoritmo de Emparejamiento — `matchProducts()` en `usePhotoOrder.ts`

Por cada item detectado por Gemini, se busca el producto del catálogo con esta **prioridad en cascada**:

| Prioridad | Criterio | Confianza |
|---|---|---|
| 1 | Nickname exacto del producto coincide con el nombre OCR | `exact` |
| 2 | Nickname parcial (uno contiene al otro), solo si hay **un único** resultado | `partial` |
| 3 | Nombre del producto igual al nombre OCR (case insensitive) | `exact` |
| 4 | Nombre parcial (uno contiene al otro), solo si hay **un único** resultado | `partial` |
| — | Sin coincidencia → va a la lista de **No Reconocidos** | — |

> [!NOTE]
> El campo `nicknames` en la tabla `products` de Supabase es el mecanismo principal de matching. Si un producto tiene el nickname "queso b", cualquier lista que diga "queso b" lo reconocerá directamente. Los nicknames pueden guardarse desde la misma pantalla de resultados.

#### Sincronización de Nicknames en Tiempo Real

Cuando se guarda un nuevo apodo desde la pantalla de resultados, el cambio se persiste en Supabase. El realtime handler en `App.tsx` sincroniza el campo `nicknames` en el array local de productos, garantizando que un escaneo posterior reconozca el apodo inmediatamente sin necesidad de recargar la app.

---

### Pantalla de Resultados — Vista Compacta

Los items se muestran en **filas compactas** para maximizar la densidad en pantalla:

**Productos reconocidos (`matched`) — fila colapsada (por defecto):**
- Muestra: `cantidad` | `nombre del producto` | `precio` | `flecha ↓`
- Sin checkbox, sin controles +/-, sin nombre escaneado.
- Al tocar la flecha se **expande** mostrando: checkbox incluir/excluir, controles +/-, texto "Escaneado: ...", badge de confianza.

**Productos no reconocidos (`unmatched`) — sin producto asignado:**
- Se muestran expandidos por defecto con borde ámbar y buscador inline para asignar producto.
- El dropdown de sugerencias tiene borde `border-2 border-amber-300` y sombra pronunciada para distinguirse de la lista de fondo.

**Productos no reconocidos — con producto asignado:**
- Se colapsan a fila compacta idéntica a los reconocidos.
- Al expandir muestran: texto "Escaneado: ...", botones "Cambiar" / "Eliminar", opción de guardar apodo.
- Permanecen expandidos justo después de asignar para que el usuario decida cuándo colapsar.

**Botón "Ocultar no reconocidos":**
- Permite colapsar/expandir la sección de productos no reconocidos como grupo.

#### Formato Visual

- **Cantidades:** Se muestran con máximo 1 decimal (`1.3` en vez de `1.345`). El valor interno no cambia.
- **Precios:** Se truncan al entero sin decimales (`$3,362` en vez de `$3,362.5`). El cálculo interno no cambia.

---

### Confirmación y Proceso de Pago

Al pulsar **"Procesar Pago (N)"**:

1. Si hay productos no reconocidos **sin asignar**, se muestra un modal de advertencia con los nombres en badges ámbar y opciones "Cancelar" / "Continuar sin ellos".
2. Si todos están asignados o el usuario confirma continuar, se llama a `onAddItems(items)` con los productos seleccionados (matched + unmatched asignados).

Desde `App.tsx`, `handlePhotoOrderAdd` establece `saleOrigin = 'scanner'` y navega a `Screen.PAYMENT` (móvil) o `Screen.SELL` (desktop).

---

### Navegación y Persistencia del Estado

- **Durante el pago:** El `PhotoOrderScreen` se mantiene montado (hidden via CSS) para que al presionar "atrás" en `PaymentScreen` se regrese a la lista escaneada con el estado intacto.
- **Flecha atrás en PaymentScreen:** Cuando `saleOrigin === 'scanner'`, navega a `Screen.PHOTO_ORDER` (la lista), no a `Screen.SELL`.
- **Después de finalizar la venta:** `handleStartNewSale` incrementa `photoOrderKey`, forzando un remontaje limpio del `PhotoOrderScreen` (pantalla de captura vacía).
- **Botón "Nueva Venta" en SuccessScreen:** Navega a `Screen.PHOTO_ORDER` con estado limpio para escanear una nueva lista.

---

## 7. Pantalla de Éxito — Móvil (`SuccessScreen.tsx`)

Después de procesar el pago, `App.tsx` navega a `Screen.SUCCESS`. En móvil (`lg:hidden`) se renderiza `SuccessScreen` con posicionamiento `fixed inset-0 z-50` para cubrir completamente el viewport; en desktop, el sidebar derecho de `MenuScreen` muestra `SuccessSidebar` con el mismo conjunto de acciones.

### Acciones disponibles

| Botón | Descripción |
|---|---|
| **WhatsApp** | Genera URL del comprobante y abre WhatsApp nativo (fallback: WhatsApp Web) |
| **Ticket** | Comparte el comprobante en formato térmico (PDF del ancho configurado en ajustes) via Web Share API |
| **Correo** | Abre `EmailReceiptModal` para enviar el comprobante por email |
| **Imprimir Ticket** | Imprime directo a la impresora térmica USB; aparece deshabilitado si no hay impresora conectada |
| **Nueva Venta** | Regresa a la pantalla de venta limpiando la transacción |

### Lógica del botón WhatsApp

1. Genera la URL del comprobante: `{origin}/t/{orderNumber}-{hash6}` donde `hash6` son los primeros 6 caracteres del `orderId`.
2. Si `receiptData.customerPhone` existe, lo incluye como destino (`phone=57XXXXXXXXXX`).
3. Construye el mensaje: saludo personalizado + enlace al comprobante.
4. Intenta abrir la app nativa (`whatsapp://send?...`). Si tras **1,5 s** la ventana no perdió el foco (la app no se abrió), abre WhatsApp Web en una ventana emergente centrada.
5. El botón queda deshabilitado si `receiptData` aún no está disponible (generación asíncrona).

### Diferencias entre `SuccessScreen` y `SuccessSidebar`

| Aspecto | `SuccessScreen` (móvil) | `SuccessSidebar` (desktop) |
|---|---|---|
| Usado en | `App.tsx` (`lg:hidden`) | `MenuScreen.tsx` (panel lateral) |
| Grid de acciones | 3 col: WhatsApp / Ticket / Correo | 3 col: WhatsApp / PDF-o-Share / Correo |
| Lógica WhatsApp | Idéntica | Idéntica |
| Botón PDF (descarga) | No | Sí (solo desktop, `downloadReceiptAsPDF`) |
| Menú "Compartir" expandible | No | Sí (en móvil dentro del sidebar: Texto / Ticket / Factura PDF) |

