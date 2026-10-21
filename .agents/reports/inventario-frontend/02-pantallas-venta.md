# Inventario Frontend — Parte 2: Pantallas de Venta / POS

> Documento para un diseñador **sin acceso al código**. Describe qué hay en cada pantalla del flujo de venta, dónde está y qué hace cada elemento. No repite la auditoría de tokens (colores hex, conteos de clases).
>
> Convención: cuando algo no se puede confirmar en el código se marca como **SUPOSICIÓN**. Los textos entre comillas son literales del código.

Pantallas cubiertas aquí: **HomeScreen** (inicio móvil), **SellScreen** (contenedor POS desktop/tablet), **MenuScreen** (catálogo + carrito, el corazón del POS), **PaymentScreen** (cobro móvil), **PaymentSidebar** (cobro desktop), **SuccessScreen / SuccessSidebar** (venta exitosa), **PhotoOrderScreen** (foto a venta con IA), **CashRegisterScreen** (turno de caja), **SalesScreen** (historial/facturas). Más sus modales.

---

## Nota de arquitectura importante (leer antes de las fichas)

La venta NO es una pantalla única. Es un contenedor que cambia de "modo" y de "lado":

```
                 SellScreen  (solo desktop/tablet ≥768px — host)
                 ┌──────────────────────────────────────────────┐
   Header tabs   │ [Crear] [Egresos▾] [Abonos▾] [Turno] [Mesas]  │
   (h-14)        ├───────────────────────────────┬──────────────┤
                 │                                │              │
                 │        MenuScreen              │  Panel       │
                 │  (grilla de productos          │  derecho     │
                 │   o buscador de escáner)       │  400px fijo  │
                 │                                │  (carrito /  │
                 │                                │   pago /     │
                 │                                │   éxito)     │
                 └───────────────────────────────┴──────────────┘

En MÓVIL (<768px) no existe SellScreen: se entra directo a MenuScreen,
y el carrito, el pago y el éxito son pantallas/overlays a pantalla completa.
```

Dos ejes definen lo que se ve:

1. **Modo de venta del negocio** (config en Supabase, se cambia en Ajustes → "Activar/Desactivar"):
   - **Escáner / EAN** (`isEanMode = true`): pensado para minimercados con lector de código de barras. Oculta la grilla grande de productos y muestra un buscador tipo escáner. El panel derecho es el **cobro directo** (PaymentSidebar) siempre visible.
   - **Catálogo** (`isEanMode = false`): grilla visual de productos tipo restaurante. El panel derecho es el **carrito**, y el pago aparece al tocar "Procesar Pago".

2. **El panel derecho (400px)** rota entre tres contenidos según `currentScreen`: carrito → `PaymentSidebar` (pago) → `SuccessSidebar` (éxito).

---

## HomeScreen — Inicio (móvil)

**Archivo:** `screens/HomeScreen.tsx`

### 1. Propósito
Pantalla de entrada en móvil/PWA. Es el "menú de la casa": accesos rápidos a finanzas, operación y gestión del negocio, agrupados en tarjetas.

### 2. Cómo se llega / quién la ve
Es la pantalla inicial al abrir la app en teléfono. En desktop/tablet (≥768px) **se salta automáticamente** y redirige a `Screen.SELL` (POS). Todos los roles la ven, pero las tarjetas se filtran por permiso (ver punto 5). También se abre con accesos directos (deep links `/gastos`, `/compra-inventario`, `/foto-venta`) que lanzan el modal correspondiente.

### 3. Layout
Columna vertical centrada, ancho máximo tipo `max-w-xl`. De arriba a abajo:

- **Header blanco (fijo arriba):** avatar circular (foto o inicial sobre fondo ámbar) a la izquierda, saludo en dos líneas ("Hola, {nombre}" + nombre del negocio en negrita), y a la derecha un botón campana de notificaciones (`notifications`). El avatar abre el *bottom sheet* de perfil.
- **Secciones de tarjetas** (cada una con su título en mayúsculas gris pequeño), en grillas 2×2:
  - **"Finanzas"**: Egresos, Abonos, Clientes, Proveedores.
  - **"Operación"**: Foto Venta, Historial, Productos, Estadísticas.
  - **"Gestión"**: Inventario, Empleados, Actividad, Configuración.
- **Barra de navegación inferior** (`MobileNavBar`, fija).

Las tarjetas (`cardButtonClass`) son rectángulos blancos redondeados con un ícono cuadrado de color a la izquierda y dos líneas de texto (título bold + subtítulo gris). En modo PWA el contenedor es elástico (reparte el alto disponible); en navegador normal fluye con scroll.

### 4. Contenido mostrado
Cada tarjeta muestra título + subtítulo contextual:
- Egresos → "Compra · merma" (o "Gasto · merma" en el negocio 10001 de precios ocultos).
- Abonos → "Cliente · proveedor".
- Clientes → monto pendiente compacto (ej. "$120K pendiente") o "Sin deudas".
- Proveedores → "Facturas".
- Historial → "{N} ventas hoy".
- Las KPI cards grandes (ventas del día, etc.) están **ocultas temporalmente** (comentario en código: "KPI Cards: ocultadas temporalmente a petición del usuario").

El elemento más destacado hoy son las tarjetas 2×2 uniformes; no hay un hero visual dominante.

### 5. Acciones
- **Avatar** → abre *Profile Bottom Sheet*.
- **Campana** `notifications` → sin handler visible (**SUPOSICIÓN**: decorativa / pendiente).
- Tarjeta **Egresos** `south_east` → abre *Action Sheet de Egresos*. Visible solo con permiso `inv_purchase`.
- Tarjeta **Abonos** `savings` → abre *Action Sheet de Abonos*. Visible si ve Clientes o Proveedores.
- Tarjeta **Clientes** `groups` → navega a `Screen.CLIENTS`.
- Tarjeta **Proveedores** `credit_card` → navega a `Screen.DEBTS`.
- Tarjeta **Foto Venta** `photo_camera` → navega a `Screen.PHOTO_ORDER`.
- Tarjeta **Historial** `receipt_long` → `Screen.SALES` (requiere permiso de finalizar ventas).
- Tarjeta **Productos** `shopping_bag` → `Screen.PRODUCTS`.
- Tarjeta **Estadísticas** `bar_chart_4_bars` (en móvil chico el título cambia a "Panel") → `Screen.DASHBOARD`.
- Tarjeta **Inventario** `inventory_2` → `Screen.INVENTORY`; si el plan no incluye inventario físico, muestra badge "PRO" y abre `UpgradeProModal`.
- Tarjeta **Empleados** `badge` → `Screen.EMPLOYEES`.
- Tarjeta **Actividad** `history` → `Screen.ACTIVITY`.
- Tarjeta **Configuración** `settings` → abre *Action Sheet de Configuración* (solo con `admin_settings`).

### 6. Estados
- **Cargando:** spinner circular ámbar centrado + texto "Cargando tu negocio...".
- **Vacío / permisos:** cada sección entera desaparece si el rol no tiene ninguna tarjeta en ella.
- **Sin conexión:** se agrega padding superior para dejar espacio al banner de gracia/offline global; no hay un estado offline propio de esta pantalla.

### 7. Modales y paneles que abre
- **Action Sheet "Egresos"** (bottom sheet con *swipe-to-dismiss*): usa `ExpenseActionsMenu` (opciones: Foto a factura con IA, Compra/inventario, Gasto, Merma).
- **Action Sheet "Abonos"**: dos botones — "Abonos de Clientes" (ícono `person`) y "Abonos a Proveedor" (ícono `local_shipping`), cada uno con chevron. Abren `QuickTransactionModal`.
- **Action Sheet "Configuración"**: "Facturación e Impresión" (abre `SettingsSidebarPanel`), "Activar/Desactivar" (abre `SalesModeSettingsPanel` = modo de venta), y si aplica, botón ámbar "Instalar App" (`install_mobile`).
- **Profile Bottom Sheet**: avatar grande + nombre + email/teléfono + chip de rol; opciones "Mi Perfil" → `PROFILE`, "Mi Suscripción" → `SUBSCRIPTION_MANAGEMENT` (solo en el negocio de pruebas o con plan personalizado + admin), y "Cerrar sesión" (botón rojo `logout`).
- **ExpenseModal**, **QuickTransactionModal**, **InvoiceScanScreen** (overlay de escaneo con IA), **UpgradeProModal**, modal guía de instalación.

### 8. Textos clave
"Hola, {nombre}", "Finanzas", "Operación", "Gestión", "Egresos", "Abonos", "Clientes", "Proveedores", "Foto Venta", "Lista de ventas", "Historial", "Productos", "Estadísticas" / "Panel", "Inventario", "Empleados", "Actividad", "Configuración", "Cargando tu negocio...", "Mi Perfil", "Mi Suscripción", "Instalar App".

### 9. Componentes usados
`MobileNavBar`, `ExpenseActionsMenu`, `ExpenseModal`, `QuickTransactionModal`, `SettingsSidebarPanel`, `SalesModeSettingsPanel`, `UpgradeProModal`, `InvoiceScanScreen` (lazy). Hooks: `useHomeData`, `usePermissions`, `useAuth`, `usePlanFeatures`, `useCustomPlan`, `useIsMobile`.

### 10. Problemas visuales / UX
- La campana de notificaciones no parece hacer nada (afecta expectativas del usuario).
- Mucha lógica de *action sheets* con *swipe-to-dismiss* duplicada (Gastos/Abonos/Config/Perfil); visualmente son casi idénticos — oportunidad de unificar un solo componente de hoja.
- Las KPI cards grandes están comentadas: el header queda algo vacío arriba, sin resumen financiero inmediato.

---

## SellScreen — Contenedor POS (desktop / tablet)

**Archivo:** `screens/SellScreen.tsx`

### 1. Propósito
Es el "marco" del punto de venta en pantallas ≥768px: aporta la barra de acciones superior y monta dentro a `MenuScreen`. El usuario del negocio lo percibe como "la pantalla de vender".

### 2. Cómo se llega / quién la ve
Pantalla por defecto en desktop/tablet (HomeScreen redirige aquí). Requiere permiso `pos_view`. El header completo se oculta en la pantalla de éxito y en modo Catálogo cuando el sidebar de navegación está colapsado (vista limpia a pantalla completa).

### 3. Layout
- **Header de acciones** (`h-14`, solo `md:` en adelante): fila con grupo de botones a la izquierda y chip de estado de conexión a la derecha.
- **Main**: ocupa el resto y renderiza `MenuScreen` (o `TablesScreen` si la pestaña de mesas está activa — hoy casi deshabilitada, "Opción B: sin grilla de mesas").

### 4. Contenido mostrado
El header no muestra datos de negocio, solo controles. Lo demás lo pinta `MenuScreen`.

### 5. Acciones (header, de izquierda a derecha)
- **"Crear"** `add_circle` (botón índigo suave, solo en modo Catálogo): abre un dropdown con tarjetas: "Crear Producto" (`inventory_2`), "Crear Ingrediente" (`grocery`), "Crear Receta" (`skillet`, badge "PRO" si no está en el plan), "Crear Servicio" (`build`), "Crear Promoción" (`loyalty`, badge "PRO"). Al fondo, nota informativa sobre gastos con enlace "Ir a Egresos". Cada opción navega al formulario de creación respectivo o abre `UpgradeProModal`.
- **"Egresos"** `expand_more` (botón rojo suave, requiere `inv_purchase`): abre dropdown (desktop) o *actionsheet* (móvil) con `ExpenseActionsMenu`.
- **"Abonos"** `expand_more` (botón blanco): dropdown con "Abonos de Clientes" (`person`) y "Abonos a Proveedor" (`local_shipping`) → `QuickTransactionModal`.
- **"Abrir turno" / "Cerrar turno"** `point_of_sale` (en pantallas chicas solo dice "Turno"): navega a `Screen.CASH_REGISTER`. El texto cambia según `isShiftOpen`.
- **Selector de Mesas** (`TableSelectorControl`, solo modo Escáner con mesas habilitadas): popover para alternar Orden Rápida ↔ mesa.
- **Chip de estado (derecha):** tres variantes mutuamente excluyentes:
  - Rojo "N errores · Descartar" (`error`) si hay operaciones que no sincronizaron.
  - Ámbar "Sincronizando... · N pend." (ícono `sync` girando) o "Sin conexión" + "¿Qué puedes hacer?" (`wifi_off`).
  - Verde "Sincronización exitosa" (`cloud_done`).

### 6. Estados
- **Sin conexión:** chip ámbar en el header; además, en modo Catálogo con sidebar colapsado aparece un chip flotante abajo a la izquierda. Al tocarlo (offline) abre `OfflineFeaturesModal` ("¿Qué puedes hacer?").
- **Sincronizando / éxito / error de sync:** chips descritos arriba.
- No tiene estado vacío/cargando propio (lo delega a `MenuScreen`).

### 7. Modales y paneles que abre
`ExpenseModal`, `QuickTransactionModal`, `InvoiceScanScreen` (Foto a factura, overlay a pantalla completa, lazy), `OfflineFeaturesModal`, `UpgradeProModal`, y un *sidebar* lateral derecho con `PhotoOrderScreen` ("Escanear Foto Orden", ancho `max-w-md`, entra deslizando desde la derecha).

### 8. Textos clave
"Crear", "Selecciona tipo", "Crear Producto"/"Lo compras y lo vendes", "Crear Ingrediente"/"Se consume en una receta", "Crear Receta"/"Lleva ingredientes", "Crear Servicio"/"Intangible / Mano de obra", "Crear Promoción"/"Combinar 2+ productos", "Egresos", "Abonos", "Abrir turno"/"Cerrar turno"/"Turno", "Sincronizando...", "Sin conexión", "¿Qué puedes hacer?", "Sincronización exitosa", "PRO".

### 9. Componentes usados
`MenuScreen`, `TablesScreen`, `TableSelectorControl`, `ExpenseActionsMenu`, `ExpenseModal`, `QuickTransactionModal`, `OfflineFeaturesModal`, `UpgradeProModal`, `PhotoOrderScreen` (lazy), `InvoiceScanScreen` (lazy).

### 10. Problemas visuales / UX
- El header puede quedar **apretado** en tablets angostas: hasta 5 controles + chip compiten por el ancho (hay muchos `lg:`/`xl:` que esconden texto). En tablet pequeña los botones muestran solo ícono/abreviatura, lo que reduce claridad.
- El estado de conexión vive en varios sitios (header, chip flotante): consistencia a vigilar.
- "Crear" y "Egresos" usan dropdowns con estilos distintos (uno con tarjetas grandes, otro con `ExpenseActionsMenu`): leve inconsistencia visual entre menús.

---

## MenuScreen — Catálogo + Carrito (corazón del POS)

**Archivo:** `screens/MenuScreen.tsx` (archivo muy grande, ~210 KB)

### 1. Propósito
La pantalla donde realmente se arma la venta: se buscan/escanean productos, se agregan al carrito/orden y se dispara el cobro. Sirve tanto para "Orden Rápida" como para "Mesa".

### 2. Cómo se llega / quién la ve
Montada dentro de `SellScreen` en desktop/tablet, y directa en móvil. Requiere `pos_view`. El botón de cobro ("Procesar Pago") solo se habilita si el rol puede finalizar ventas (`canFinalizeSale`); un observador en solo lectura de mesas lo ve bloqueado.

### 3. Layout
Dos columnas en desktop:

```
┌─────────────────────────────────────────┬───────────────────┐
│  Columna izquierda (flex-1)              │  <aside> 400px     │
│  ─ Header: buscador + categorías         │  Carrito / Pago /  │
│  ─ Grilla de productos                   │  Éxito             │
│    auto-fill minmax(160px) desktop       │                    │
│    auto-fill minmax(140px) móvil/tablet  │                    │
└─────────────────────────────────────────┴───────────────────┘
```

- **Header móvil** (`flex md:hidden`, alto 60px): buscador colapsable a la izquierda + control de mesas/modo a la derecha. En modo Catálogo hay botón de cámara (`photo_camera`) para escanear.
- **Header desktop** (`hidden md:flex`): buscador siempre visible (máx. ~500px) + fila de categorías con expandir/colapsar. En modo Escáner el buscador lleva un dropdown de categoría pegado a la izquierda.
- **Grilla de productos**: tarjetas `ProductCard` responsivas. En modo Escáner la grilla grande se oculta y se muestran sugerencias/stepper del buscador.
- **Panel derecho (`<aside>`, 400px fijo, `hidden lg:flex`)**: el carrito con lista de ítems, totales y botón de cobro. Se oculta por completo en pantallas <1024px (ahí el carrito es un overlay/pantalla aparte).

### 4. Contenido mostrado
- Grilla de productos con imagen, nombre y precio (ver `ProductCard`).
- Carrito: lista de `CartItemRow` (nombre, cantidad, precio, descuento, modificadores), separador "Comanda enviada" cuando aplica a mesas.
- **Totales** (memorizados): subtotal, descuento total, total redondeado a múltiplos de 50. El **total** es el número más destacado, dentro del botón de cobro ("$X").
- Chip de modo "Orden Rápida" (gris) o nombre de mesa (verde).

### 5. Acciones
- **Buscador** "Buscar producto...": filtra el catálogo. En modo Escáner acepta lectura de pistola USB (teclas Enter/+/- controlan la última línea) y muestra sugerencias navegables con flechas.
- **Dropdown de categorías** (`expand_more`): filtra por categoría; "Todas" por defecto.
- **Cámara** `photo_camera`: enciende/apaga el escaneo por cámara (modo catálogo móvil).
- **ProductCard**: tocar la tarjeta o el botón `add` suma 1; `remove` resta; tocar la cantidad abre `QuantityInputModal`.
- **CartItemRow**: `+`/`-` cantidad, editar producto (`onEditProduct`), aplicar descuento (abre `DiscountModal`).
- **Botón limpiar orden** `mop` (ícono escoba): abre confirmación para vaciar el carrito.
- **Botón "Pedido"** (`ComandaLabelHeaderButton`): etiqueta la comanda (Localizador / Mesa / Para llevar) antes de enviarla a cocina. Solo modo Catálogo con la preferencia activa.
- **"Procesar Pago"** (botón ancho inferior, oscuro, `arrow_forward` + "$total"): navega a `Screen.PAYMENT`. Deshabilitado (opacidad 50% + candado `lock`) si el carrito está vacío o sin permiso.
- **FAB "Enviar Comanda"** `print` (negro, flotante abajo a la derecha, solo modo mesa): envía los ítems nuevos a cocina.
- **Estrella de favorito** `star` en el bottom sheet de categoría (móvil catálogo).

### 6. Estados
- **Carrito vacío:** ícono `shopping_cart` grande atenuado + texto "Orden vacía".
- **Categoría/búsqueda sin resultados** (bottom sheet móvil): ícono `search_off`/`inventory_2` + "Sin resultados" / "Sin productos en esta categoría".
- **Cargando productos:** `productsLoading` (**SUPOSICIÓN:** la grilla aparece vacía mientras carga; el skeleton de carga fue removido según comentario "Skeleton de carga removido para entrada fluida").
- **Solo lectura de mesas (offline):** banner `TablesReadOnlyBanner` sobre el carrito; acciones muestran toast "Mesas en solo lectura sin conexión".
- **Pago / éxito:** el `<aside>` cambia su contenido a `PaymentSidebar` / `SuccessSidebar`.

### 7. Modales y paneles que abre
- `DiscountModal` — descuento por ítem.
- `PriceInputModal` — precio/cantidad para productos por peso (Kg/Lb/Lt) y edición de peso en modo escáner.
- `QuantityInputModal` — fijar cantidad exacta de un producto.
- `MobileScannerItemModal` — editar un ítem escaneado (cantidad + descuento) en móvil.
- Confirmación "Limpiar orden" (`showClearConfirm`).
- `PaymentSidebar` y `SuccessSidebar` (montados dentro del `<aside>`).
- Bottom sheet de categoría (catálogo móvil).

### 8. Textos clave
"Buscar producto...", "Todas", "Orden Rápida", "Mesa N", "Detalles", "Orden vacía", "Procesar Pago", "Enviar Comanda", "Comanda enviada", "Limpiar orden", "Sin resultados", "Sin productos en esta categoría".

### 9. Componentes usados
`ProductCard`, `CartItemRow`, `ProductThumb`, `PaymentSidebar`, `SuccessSidebar`, `DiscountModal`, `PriceInputModal`, `QuantityInputModal`, `MobileScannerItemModal`, `BarcodeScanner`, `TableSelectorControl`, `OpenTicketsBar`, `ComandaLabelHeaderButton`, `TablesReadOnlyBanner`. Hooks: `useProducts`, `useClients`, `useBusinessSettings`, `usePermissions`, `useTablesWriteGate`, `useBarcodeScanner`.

### 10. Problemas visuales / UX
- Archivo gigantesco con mucha lógica de teclado/escáner mezclada con layout: alta carga cognitiva para cualquier rediseño.
- El botón de cobro usa estilo **oscuro** ("Procesar Pago"), distinto del botón primario ámbar que domina el resto de la app (ej. "Nueva Venta", "Finalizar Venta"): inconsistencia de jerarquía — el CTA más importante no usa el color de marca.
- Dos headers (móvil y desktop) con comportamientos de buscador diferentes (colapsable vs fijo) → la experiencia de buscar cambia bastante entre dispositivos.
- El carrito desaparece por completo <1024px: en tablets intermedias el flujo cambia de "panel al lado" a "pantalla aparte", lo que puede desorientar.

---

## PaymentScreen — Cobro (móvil, pantalla completa)

**Archivo:** `screens/PaymentScreen.tsx`

### 1. Propósito
Pantalla a pantalla completa (teléfono/tablet) donde se elige método de pago, se ingresa efectivo recibido, se aplica descuento y se finaliza la venta o se registra un crédito (fiado).

### 2. Cómo se llega / quién la ve
Desde el botón "Procesar Pago" del carrito en móvil. Requiere permiso de finalizar venta.

### 3. Layout
De arriba a abajo:
- **Header**: botón volver `arrow_back`, badge de tipo de orden (Domicilio `delivery_dining` ámbar / "Orden Rápida" morado / "Mesa N" verde con `restaurant`), botón "Pedido" (etiquetas de comanda), y chip de cliente (solo móvil chico <431px).
- **Cuerpo**: resumen de ítems, selector de método de pago, campo de descuento, y bloque de efectivo/numpad cuando se elige "Efectivo".
- **Numpad** (`Numpad`) para montos en móvil.

### 4. Contenido mostrado
Total a pagar, ítems de la orden, métodos de pago, efectivo recibido y cambio calculado. El **total** y el **cambio** son los números protagonistas.

### 5. Acciones
- **Tabs Pago / Crédito** (`paymentMode`): alterna cobro normal vs fiado.
- **Chips de método de pago**: por defecto Efectivo, Tarjeta, Nequi, Daviplata, Transferencia, Otro (configurables; se pueden agregar/renombrar/eliminar, excepto "Efectivo").
- **Pago mixto** (`isMixedPayment`): reparte el total entre varios métodos; valida que el restante sea 0.
- **Campo descuento** (% o monto).
- **Numpad**: ingresa efectivo recibido; calcula cambio.
- **Crédito**: exige cliente registrado y fecha de vencimiento; permite abono inicial con su propio método.
- **Finalizar** → ejecuta `onProcessPayment` y pasa a `Screen.SUCCESS`.

### 6. Estados
- **Botón cobrar deshabilitado** si falta método (en pago simple), si el mixto no cuadra, o si en crédito falta cliente/fecha.
- **Procesando** (`isProcessing`): bloquea doble envío.
- **Validaciones por toast**: "Para ventas a crédito debes seleccionar un cliente registrado".

### 7. Modales que abre
`CreateClientModal` (crear cliente al vuelo), `DiscountModal`, `ComandaLabelHeaderButton` (etiquetas de comanda), búsqueda/asignación de cliente.

### 8. Textos clave
"Domicilio", "Orden Rápida", "Mesa N", "Efectivo", "Crédito", "Consumidor Final", "Cliente Crédito", "Mixto".

### 9. Componentes usados
`Numpad`, `CreateClientModal`, `CartItemRow`, `DiscountModal`, `ComandaLabelHeaderButton`. Hooks: `useClients`, `useCashRegister`, `useBusinessSettings`, `usePermissions`, `useTablesWriteGate`.

### 10. Problemas visuales / UX
- El badge de tipo de orden tiene **muchas variantes de estilo** entre móvil y tablet (`md:`): color, forma e ícono cambian, lo que complica mantener consistencia.
- La lógica de evaluación de expresiones aritméticas en los montos (`safeEvaluate`, permite "+", "-", "%") es poderosa pero poco evidente para el usuario; no hay pista visual de que se puede escribir una operación.

---

## PaymentSidebar — Cobro (desktop, panel 400px)

**Archivo:** `components/PaymentSidebar.tsx`

### 1. Propósito
Equivalente de PaymentScreen pero embebido en el panel derecho del POS desktop. En modo Escáner está **siempre visible** (cobro directo); en modo Catálogo aparece al tocar "Procesar Pago" y se conserva montado (oculto) al volver al carrito para no perder cliente/descuento/método ya ingresados.

### 2. Cómo se llega / quién la ve
Dentro del `<aside>` de `MenuScreen` en desktop (≥1024px). Requiere permiso de finalizar venta.

### 3. Layout
Columna con cuerpo scrolleable + footer fijo:
- **Tabs** Pago / "Crédito" (con flecha de volver inline en modo catálogo).
- **"Asignar a Cliente"** (buscador + botón crear cliente `person_add`; obligatorio en crédito, marcado con `*` rosa).
- **"Descuento"** (dos inputs: % y monto `$`).
- **Métodos de pago** (chips) + pago mixto con inputs por método.
- **Efectivo recibido** (cuando se elige Efectivo) + cálculo de cambio.
- **Footer fijo**: "Total a Pagar" + "$total" grande a la izquierda, botón de acción a la derecha.

### 4. Contenido mostrado
Total a pagar (destacado, `text-2xl font-black`), datos del cliente, descuento, métodos, cambio.

### 5. Acciones
- Igual que PaymentScreen: tabs Pago/Crédito, métodos (Efectivo, etc., editables), mixto, descuento, cliente.
- **Botón final** (flex 1.5, `h-12`): "Finalizar Venta" (modo pago) o "Confirmar Crédito" (modo crédito), con ícono `check_circle`. Deshabilitado por las mismas reglas que en móvil (sin permiso, método faltante, mixto descuadrado, crédito incompleto, procesando).

### 6. Estados
- Botón deshabilitado con estilo apagado cuando falta algún dato.
- Spinner al procesar.
- Toasts de validación ("Para ventas a crédito debes seleccionar un cliente registrado").

### 7. Modales que abre
`CreateClientModal`, edición inline de datos del cliente (nombre/teléfono/dirección).

### 8. Textos clave
"Asignar a Cliente", "Descuento", "Total a Pagar", "Finalizar Venta", "Confirmar Crédito", "Nombre, teléfono o documento...".

### 9. Componentes usados
`CreateClientModal`. Hooks: `useClients`, `useCashRegister`, `useBusinessSettings`, `usePermissions`, `useAuth`.

### 10. Problemas visuales / UX
- Es un **gemelo** de PaymentScreen con layout distinto: dos implementaciones del mismo flujo de cobro a mantener en paralelo (riesgo de divergencia visual).
- Aquí el CTA sí usa ámbar/primario ("Finalizar Venta"), pero el botón del carrito en MenuScreen ("Procesar Pago") es oscuro: la secuencia de dos CTAs de distinto color en el mismo panel puede confundir.

---

## SuccessScreen / SuccessSidebar — Venta exitosa

**Archivos:** `screens/SuccessScreen.tsx` (móvil, pantalla completa) · `components/SuccessSidebar.tsx` (desktop, panel 400px). Son funcionalmente idénticos.

### 1. Propósito
Confirmar la venta y ofrecer el envío/impresión del comprobante y de la comanda, antes de empezar una venta nueva.

### 2. Cómo se llega / quién la ve
Tras finalizar el pago (`Screen.SUCCESS`). Lo ve quien finaliza la venta.

### 3. Layout
Tarjeta centrada (`max-w-sm`) con, de arriba a abajo:
- Ícono circular grande: `check` verde (venta normal) o `verified` azul (crédito).
- Título "¡Venta Exitosa!" o "Crédito Autorizado".
- Fecha • cliente.
- **Bloque "Total Pagado"** con el monto enorme (`text-3xl font-black`) — el elemento dominante. Si hay cambio, lo muestra debajo en verde.
- (Crédito) bloque azul con la "Nota".
- **Grilla 3 acciones**: WhatsApp (ícono SVG), "Ticket" (compartir, `share`), "Correo" (`email`).
- (Modo catálogo) `ComandaTargetGrid` — enviar comanda a impresoras/dispositivos.
- Botón dividido "Imprimir Ticket" (`print`).
- Botón ancho ámbar "Nueva Venta" (`add`).

### 4. Contenido mostrado
Total pagado (destacado), cambio, cliente, fecha, nota de crédito. 

### 5. Acciones
- **WhatsApp**: arma mensaje con enlace al comprobante (`/t/{orden}-{hash}`) e intenta abrir la app nativa o la web.
- **"Ticket"** `share`: comparte PDF térmico del recibo.
- **"Correo"** `email`: abre `EmailReceiptModal`.
- **ComandaTargetGrid**: imprime/envía comanda a cada destino (local o remoto); si no hay destinos ofrece "Conectar impresora".
- **"Imprimir Ticket"** (`PrinterSplitButton`): imprime en la impresora predeterminada; la flecha permite elegir otra; si no hay conexión abre `PrinterSettingsPanel`.
- **"Nueva Venta"**: reinicia el flujo (`onStartNewSale`).

### 6. Estados
- **Cargando (gate):** mientras se detectan impresoras, spinner `progress_activity` (hasta ~800 ms o hasta que llega una impresora).
- **Compartiendo:** el botón "Ticket" muestra "Espere...".
- **Toasts** de impresión: "Ticket impreso", "Comanda impresa", "Comanda enviada", "No se pudo imprimir el ticket", etc.

### 7. Modales/paneles que abre
`EmailReceiptModal`, `PrinterSettingsPanel` (panel lateral de impresora), `ComandaLabelModal` (etiquetar comanda antes de enviar, si no se eligió antes).

### 8. Textos clave
"¡Venta Exitosa!", "Crédito Autorizado", "Total Pagado", "Cambio", "Nota", "WhatsApp", "Ticket", "Correo", "Imprimir Ticket", "Nueva Venta".

### 9. Componentes usados
`EmailReceiptModal`, `PrinterSplitButton`, `ComandaTargetGrid`, `ComandaLabelModal`, `PrinterSettingsPanel`. Hooks: `useBusinessSettings`, `usePrinters`, `useAvailablePrinters`, `useAuth`.

### 10. Problemas visuales / UX
- Tres acciones de envío (WhatsApp/Ticket/Correo) + grid de comanda + botón de ticket + "Nueva Venta": **densidad alta** de botones en una tarjeta pequeña; en modo catálogo con muchas impresoras puede volverse larga.
- El ícono de WhatsApp es un SVG inline (no Material Symbol), rompiendo la consistencia iconográfica del resto de botones.
- Dos implementaciones (Screen vs Sidebar) del mismo contenido: riesgo de divergencia.

---

## PhotoOrderScreen — Foto a venta (IA)

**Archivo:** `screens/PhotoOrderScreen.tsx`

### 1. Propósito
Convertir una foto de una lista/nota escrita a mano en una orden: la IA detecta ítems y los empareja con el catálogo para agregarlos al carrito.

### 2. Cómo se llega / quién la ve
Desde la tarjeta "Foto Venta" del HomeScreen, el deep link `/foto-venta`, o el *sidebar* lateral "Escanear Foto Orden" dentro de SellScreen. Visible según acceso a la pantalla.

### 3. Layout
Pantalla con header + cuerpo, en **tres estados de vista** (`capture` → `processing` → `results`):
- **Capture**: ilustración de una "lista de ventas", título "Escanear Lista de Ventas", subtítulo, y dos botones apilados grandes: "Tomar Foto" (ámbar, `photo_camera`) y "Galería" (blanco, `photo_library`).
- **Processing**: marco tipo escáner de documento con línea de barrido animada y esquinas en cian.
- **Results**: header con buscador "Agregar producto...", botón escáner de barras (`barcode_scanner`), botón limpiar (`delete_sweep`); lista de productos emparejados y no emparejados.

### 4. Contenido mostrado
Vista previa de la imagen, ítems detectados (nombre, cantidad, precio), productos emparejados vs no emparejados.

### 5. Acciones
- **"Tomar Foto"**: abre la cámara (visor con botón de captura); fallback al input de archivo si falla.
- **"Galería"**: abre selector de archivos.
- **Captura**: toma la foto, pasa por `DocumentCropper` (recorte) y envía a procesar.
- **Buscador "Agregar producto..."**: agrega productos manualmente al resultado.
- **Escáner de barras** `barcode_scanner`: lee un EAN en la vista de resultados.
- **"Ver N productos escaneados"**: vuelve a resultados si ya hay lista previa.
- Editar cada ítem (`MobileScannerItemModal`), ajustar peso/precio (`PriceInputModal`).
- Confirmar → `onAddItems` agrega todo al carrito y cierra.

### 6. Estados
- **Error**: tarjeta roja con ícono `error` y el mensaje (ej. "Los productos aún no se han cargado...").
- **Vacío (sin detección)**: vuelve a `capture` (no se encontraron ítems).
- **Procesando**: animación de barrido.
- **Vista previa**: miniatura de la imagen tomada.

### 7. Modales que abre
`DocumentCropper` (recorte de la foto), `MobileScannerItemModal`, `PriceInputModal`, `BarcodeScanner` (lazy).

### 8. Textos clave
"Escanear Lista de Ventas", "Convierte tus notas y listas en órdenes al instante", "Tomar Foto", "Galería", "Agregar producto...", "Ver N productos escaneados".

### 9. Componentes usados
`DocumentCropper`, `MobileScannerItemModal`, `PriceInputModal`, `BarcodeScanner` (lazy). Hook: `usePhotoOrder` (OCR + emparejado con Gemini Vision).

### 10. Problemas visuales / UX
- El flujo tiene tres pantallas internas (capturar/procesar/resultados) sin indicador de progreso explícito: el usuario puede no saber en qué paso está.
- Los textos técnicos de error ("Los productos aún no se han cargado") son poco amigables para el dueño del negocio.

---

## CashRegisterScreen — Turno de caja

**Archivo:** `screens/CashRegisterScreen.tsx` (archivo muy grande, ~187 KB)

### 1. Propósito
Abrir y cerrar el turno de caja, hacer el arqueo (conteo de efectivo), ver movimientos (ingresos/egresos) y descargar/imprimir/enviar el reporte diario del turno.

### 2. Cómo se llega / quién la ve
Desde el botón "Turno" de SellScreen o la nav/menú. Requiere permiso para abrir turno; sin él se muestra una pantalla de bloqueo.

### 3. Layout
Dos vistas (`viewMode`: `dashboard` / historial):
- **Sin turno abierto**: tarjeta centrada "Abrir Turno de Caja" con selección de caja (dropdown si hay varias), campo "Base Inicial" (`$`), y botón ámbar "Abrir Turno" (`lock_open`).
- **Turno abierto (dashboard)**: resumen del turno, movimientos, totales por método de pago, y acciones de cierre.
- **Cierre**: arqueo con efectivo declarado por denominaciones (`DENOMINATIONS`) y diferencia esperada vs real.
- **Historial de turnos**: lista filtrable por período (Últimos 10/30 turnos, Hoy, 7 días, Este mes, Personalizado).

### 4. Contenido mostrado
Base inicial, ingresos/egresos, efectivo esperado, diferencia de arqueo, totales por método de pago, fecha/hora del turno. Montos (ocultos "—" en el negocio 10001 de precios ocultos en superficies no autorizadas).

### 5. Acciones
- **Dropdown de caja** (`expand_more`) + "Crear Nueva Caja" / "Crear otra caja" (`add`).
- **"Abrir Turno"** `lock_open`.
- **Cerrar turno** con arqueo (confirmación).
- **Editar/eliminar caja** (`edit` / `delete`).
- **Filtro de período** del historial (`calendar_month` + `CustomDateRangePicker`).
- **Limpiar historial** (acción destructiva con confirmación: "¿Limpiar el historial de turnos?").
- **Reporte**: descargar PDF, enviar por correo (`EmailReceiptModal`), imprimir en térmica (`printShiftReportDirect`).
- **Devolución** desde una venta del turno (`RefundSaleModal`).

### 6. Estados
- **Cargando:** `ScreenLoader`.
- **Sin permiso:** tarjeta "No tienes permiso para abrir turno" (ícono `lock`) con guía ("Pídele a un administrador o a un cajero con permiso...").
- **Todas las cajas en uso:** mensaje "Todas las cajas están en uso".
- **Offline:** el cierre se encola; el reporte diario se arma con datos locales para poder imprimir/descargar sin internet.

### 7. Modales que abre
`EmailReceiptModal`, `RefundSaleModal`, `CustomDateRangePicker`, confirmaciones (`useConfirmDialog`), panel/edición de cajas.

### 8. Textos clave
"Abrir Turno de Caja", "Base Inicial", "Abrir Turno", "Crear Nueva Caja", "Crear otra caja", "No tienes permiso para abrir turno", "Todas las cajas están en uso", "¿Limpiar el historial de turnos?", "Últimos 10 turnos", "Hoy", "Este mes", "Personalizado".

### 9. Componentes usados
`ScreenLoader`, `EmailReceiptModal`, `RefundSaleModal`, `CustomDateRangePicker`. Hooks: `useCashRegister`, `useBusinessSettings`, `usePermissions`, `useIsMobile`, `useBusinessPaymentMethods`.

### 10. Problemas visuales / UX
- Archivo enorme con muchas sub-vistas (apertura/cierre/historial/arqueo) en una sola pantalla: difícil de rediseñar sin separar en pasos claros.
- El arqueo por denominaciones puede ser tedioso en móvil; conviene revisar la ergonomía del conteo.
- La acción "Limpiar historial" es destructiva y vive cerca de acciones no destructivas: vigilar que no se toque por error.

---

## SalesScreen — Historial de ventas / Facturas

**Archivo:** `screens/SalesScreen.tsx` (archivo grande, ~111 KB)

### 1. Propósito
Consultar las ventas realizadas, ver su detalle, reimprimir/compartir comprobantes, y anular o devolver ventas. Es "Facturas / Historial".

### 2. Cómo se llega / quién la ve
Desde la tarjeta "Historial" del HomeScreen o la nav. Admin/dueño (`admin_reports`) ve **todas** las ventas y puede anular (`pos_cancel`); un cajero ve solo las suyas.

### 3. Layout
Master-detail:

```
┌──────────────────────────┬─────────────────────────────┐
│  Lista de ventas         │  Detalle de la venta         │
│  (izquierda)             │  (derecha, se oculta en      │
│                          │   móvil hasta seleccionar)   │
└──────────────────────────┴─────────────────────────────┘
```

- **Header superior**: buscador "Buscar cliente, orden..." (desde 430px), filtro de empleado (`person`), filtro de período (`calendar_month`), botón exportar reporte (`description`). Fila 2 (tablet/desktop): totales por método de pago en grilla de 7 columnas.
- **Lista** (izquierda): filas de venta.
- **Detalle** (derecha): ítems, totales, acciones.

### 4. Contenido mostrado
Ventas con cliente, número de orden, hora, total, método; totales por método del período; marca de anuladas y conteo de ítems anulados.

### 5. Acciones
- **Buscador** por cliente/orden.
- **Filtro de empleado** (admin): "Elegir empleado".
- **Filtro de período**: Hoy, Ayer, Últimos 7/30 días, Este mes, Mes anterior, Personalizado.
- **Exportar reporte** (`description`): reporte por empleado (`EmployeeReportActionsModal`).
- **Seleccionar venta** → abre el detalle.
- **Anular** (turno abierto, requiere conexión) o **Devolución** (turno cerrado) → `RefundSaleModal`. Toast "Necesitas conexión a internet para anular" si está offline.
- **Reimprimir / compartir / correo** del comprobante; editar ítem (`EditOrderItemModal`); reimprimir comanda.

### 6. Estados
- **Primera carga:** `ScreenLoader`.
- **Cargas de filtro:** spinner pequeño (`sync` girando) en la lista.
- **Vacío:** ícono `receipt_long` + "Sin Ordenes".
- **Offline:** anular bloqueado con toast.

### 7. Modales/paneles que abre
`EmployeeReportActionsModal`, `RefundSaleModal`, `EmailReceiptModal`, `EditOrderItemModal`, `PrinterSettingsPanel`, `CustomDateRangePicker`.

### 8. Textos clave
"Buscar cliente, orden...", "Elegir empleado", "Hoy"/"Ayer"/"Últimos 7 días"/etc., "Sin Ordenes", "Necesitas conexión a internet para anular".

### 9. Componentes usados
`ScreenLoader`, `EmployeeReportActionsModal`, `RefundSaleModal`, `EmailReceiptModal`, `EditOrderItemModal`, `PrinterSettingsPanel`, `CustomDateRangePicker`. Hooks: `useOrders`, `useSalesHistory`, `useSalesTotals`, `useBusinessSettings`, `usePermissions`.

### 10. Problemas visuales / UX
- Totales por método en **grilla de 7 columnas** en el header: en pantallas intermedias puede quedar apretado; en móvil se mueve a una barra con scroll horizontal (dos layouts distintos para el mismo dato).
- El buscador aparece/desaparece según breakpoint (header ≥430px vs cuerpo <430px): doble input para lo mismo.
- La frontera Anular vs Devolución depende de si el turno está abierto/cerrado — es una regla de negocio no obvia visualmente; el usuario podría no entender por qué a veces es "Anular" y a veces "Devolución".

---

## PARTE 3 (adelanto): componentes compartidos del flujo de venta

Estos se detallan a fondo en `04-componentes.md`, pero aquí van los que son clave para entender estas pantallas:

### ProductCard — `components/ProductCard.tsx`
Tarjeta de producto con **dos variantes**:
- **Mobile**: alto fijo (~181–219px), imagen arriba, nombre (2 líneas máx.), fila inferior con precio ámbar + stepper `-` / cantidad / `+`.
- **Desktop**: imagen cuadrada con badge de precio flotante abajo a la derecha (fondo negro translúcido), nombre debajo, y footer con stepper (`-` rojo suave / cantidad / `+` ámbar). Toda la tarjeta es clickable para sumar 1. Placeholder `restaurant` cuando no hay imagen.

### CartItemRow — `components/CartItemRow.tsx`
Fila de un ítem en el carrito: nombre, cantidad con `+`/`-`, precio, descuento y modificadores/notas. Soporta expandir/colapsar y modo solo lectura (mesas offline).

### DiscountModal — `components/DiscountModal.tsx`
Modal centrado (`max-w-sm`) para descuento por ítem. Switch "Porcentaje (%)" / "Monto Fijo ($)", input numérico, resumen "Nuevo Precio" en caja naranja, botón ámbar "Aplicar Descuento" y, si ya había descuento, botón rojo "Eliminar Descuento".

### Numpad — `components/Numpad.tsx`
Teclado numérico para montos en el cobro móvil (**SUPOSICIÓN** sobre su estética exacta: no se leyó el archivo en detalle en este paso; se detalla en `04-componentes.md`).

### PaymentSidebar / SuccessSidebar
Ya descritos arriba como las variantes desktop (panel 400px) de PaymentScreen y SuccessScreen.

### ComandaTargetGrid / PrinterSplitButton / ComandaLabelModal / ComandaLabelHeaderButton
Familia de componentes de impresión térmica (destinos de comanda, botón dividido de impresión, etiquetado de comanda). Se detallan en `04-componentes.md`.

---

## Resumen de modales del flujo de venta (índice rápido)

| Modal / Panel | Se abre desde | Para qué |
|---|---|---|
| `ExpenseModal` | Home, Sell | Registrar gasto / compra / merma |
| `QuickTransactionModal` | Home, Sell | Abono rápido (cliente/proveedor) |
| `InvoiceScanScreen` | Home, Sell | Foto a factura (IA) — overlay |
| `OfflineFeaturesModal` | Sell | "¿Qué puedes hacer?" sin conexión |
| `UpgradeProModal` | Sell, Home | Bloqueo de función PRO |
| `DiscountModal` | Menu, Payment | Descuento por ítem |
| `PriceInputModal` | Menu, PhotoOrder | Precio/cantidad por peso |
| `QuantityInputModal` | Menu | Fijar cantidad exacta |
| `MobileScannerItemModal` | Menu, PhotoOrder | Editar ítem escaneado |
| `CreateClientModal` | Payment, PaymentSidebar | Crear cliente al vuelo |
| `EmailReceiptModal` | Success, CashRegister, Sales | Enviar comprobante/reporte por correo |
| `ComandaLabelModal` | Success | Etiquetar comanda antes de enviar |
| `PrinterSettingsPanel` | Success, Sales | Conectar/registrar impresora |
| `DocumentCropper` | PhotoOrder | Recortar la foto |
| `RefundSaleModal` | CashRegister, Sales | Anular/devolver venta |
| `EmployeeReportActionsModal` | Sales | Reporte por empleado |
| `EditOrderItemModal` | Sales | Editar ítem de una orden |
```