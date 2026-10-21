# Parte 3 — Pantallas de gestión, autenticación y guardas

Este documento detalla las pantallas donde el dueño **administra su negocio** (productos, inventario, estadísticas, clientes, proveedores, empleados, actividad, perfil, suscripción), las pantallas de **entrada a la app** (login, registro, recuperar contraseña) y las **pantallas de bloqueo/guarda** que aparecen cuando la suscripción vence. También cubre las pantallas **públicas** (recibo y estado de cuenta de un cliente) que se abren con un enlace sin iniciar sesión.

Cada ficha sigue el mismo orden de 10 puntos descrito en el `index.md`. Las citas de texto van entrecomilladas tal cual aparecen en el código. Cuando algo no se puede confirmar, se marca **SUPOSICIÓN**.

> Patrón común a casi todas las pantallas de gestión: un **header blanco de 56px de alto** (`h-14`) con el título a la izquierda; debajo, el contenido con scroll. En móvil ese header se vuelve más compacto. La mayoría muestra un **estado "Sin conexión"** a pantalla completa (ícono `wifi_off` ámbar + título + explicación) cuando no hay internet, porque leen datos de la nube en vivo.

---

## 1. Estadísticas (Dashboard)

**Archivo:** `screens/DashboardScreen.tsx`

1. **Propósito.** Es el tablero de salud del negocio: cuánto se vendió, cuánto se ganó de verdad y en qué se gastó, para un período elegido.
2. **Cómo se llega / quién la ve.** Sidebar → "Estadísticas" (`grid_view`) → `Screen.DASHBOARD`. Requiere permiso `admin_reports` (el administrador siempre).
3. **Layout.**
   - **Desktop:** contenido centrado con ancho máximo de 1440px. Arriba un **header** (`hidden sm:flex`) con los selectores de período a la izquierda (botón de período + botón "Personalizado"). Debajo, una fila de **4 tarjetas KPI** (grid de 4 columnas en pantallas grandes). Luego secciones apiladas: anillo de "Gastos Operativos", gráfico "Evolución de Ventas", "Métodos de Pago", "Ritmo del Día", "Ventas Acumuladas por Día" y "Top Productos".
   - **Móvil:** header propio compacto (`sm:hidden`) con el selector de período ocupando casi todo el ancho y el botón "Personalizado" al lado. Las KPI pasan a 1 columna; las gráficas se apilan.
4. **Contenido mostrado.** Las 4 KPI son los números más destacados: **"Ventas Netas"** (con "N pedidos completados"), **"Utilidad Real"** (con margen operativo %), **"Ticket"** (promedio por cliente) y **"Costo de Mercancía"** (con % sobre ingresos). Debajo, gráficos: anillo de distribución de gastos (mermas + categorías), curva de evolución de ventas, barras de métodos de pago, bloques "Mañana/Tarde/Noche" del día, barras por día de semana y ranking de top productos. El elemento visualmente dominante es la **fila de KPIs** (números grandes) y, más abajo, el **gráfico de evolución**.
5. **Acciones.**
   - Botón de **período** (ícono `calendar_month` + chevron `expand_more`): despliega lista (Hoy, Semana, Mes, etc. — `PERIOD_LABELS`). Secundario, borde gris.
   - Botón **"Personalizado"** (ícono `date_range`): abre el `CustomDateRangePicker` para elegir rango. Se pinta azul cuando está activo.
   - En "Top Productos", solo para el negocio 10001, dos íconos: **imprimir** (`print`, abre ventana de impresión QZ) y **descargar PDF** (`download`). Ambos se deshabilitan si no hay productos.
   - **SUPOSICIÓN confirmada en código:** los botones "Descargar reporte" y "Compartir" están comentados como ocultos temporalmente (comentario `HIDDEN`).
6. **Estados.**
   - **Sin conexión:** pantalla completa con ícono `wifi_off`, "Sin conexión" y "Las estadísticas y el reporte de ventas requieren internet para cargar los datos del período."
   - **Cargando:** overlay semitransparente con spinner ámbar encima del contenido (el contenido queda al 30% de opacidad). Distingue la primera carga de los cambios de período para no desmontar el header.
   - **Vacío parcial:** por ejemplo "Aún no hay actividad operativa en este día" dentro del "Ritmo del Día", o "No hay proveedores con deuda" en otros bloques.
7. **Modales/paneles.** El `CustomDateRangePicker` (calendario de rango) y tooltips informativos (`InfoTooltip`) en cada sección.
8. **Textos clave.** "Ventas Netas", "Utilidad Real", "Ticket", "Costo de Mercancía", "Gastos Operativos", "Evolución de Ventas", "Métodos de Pago", "Ritmo del Día", "Ventas Acumuladas por Día", "Top Productos", "Personalizado".
9. **Componentes.** `KPICard`, `InfoTooltip`, `CustomDateRangePicker`, hook `useDashboard`.
10. **Problemas visuales.** En móvil hay muchas secciones apiladas: el usuario debe hacer scroll largo para llegar a Top Productos. Los selectores de período en desktop quedan solos a la izquierda del header (el resto del header está vacío por los botones ocultos), lo que deja un header desbalanceado.

---

## 2. Historial de ventas (Sales)

**Archivo:** `screens/SalesScreen.tsx`

1. **Propósito.** Consultar, buscar e imprimir las ventas ya hechas, y abrir el detalle de cualquier factura.
2. **Cómo se llega / quién la ve.** Sidebar → "Historial de ventas" (`receipt_long`) → `Screen.SALES`. Requiere `admin_reports` o `pos_view` + poder finalizar ventas. También se llega por deep-link desde "Actividad" (parámetro `?sale=` en la URL).
3. **Layout.**
   - **Desktop:** vista maestro-detalle. A la izquierda una columna con buscador ("Buscar cliente, orden...") y la **lista de ventas**; a la derecha el **panel de detalle** de la venta seleccionada (cliente, ítems, totales y acciones de impresión arriba). Arriba hay totales del período y un botón para exportar reporte.
   - **Móvil:** una sola columna. La lista ocupa la pantalla; al tocar una venta se abre el detalle a pantalla completa con botón "atrás".
4. **Contenido mostrado.** Lista de ventas con cliente, número de orden, monto y fecha. En el detalle: "Cliente: [nombre o Consumidor Final]", lista de ítems, subtotal, descuento, total, método de pago. Totales agregados del período arriba (con spinner propio mientras cargan). El número más destacado es el **total de cada venta** y el **total del período**.
5. **Acciones.**
   - Input de búsqueda "Buscar cliente, orden...".
   - Botón **exportar reporte** (ícono `description`, verde; gira a `sync` mientras exporta).
   - En el detalle, fila de íconos: **imprimir** (`print`), **imprimir comanda de cocina** (`restaurant`), **compartir** (`share`), **descargar PDF** (`file_download`). Cada uno muestra `sync` girando mientras procesa. Hay más acciones de anulación/devolución (SUPOSICIÓN: en el mismo detalle, más abajo del fragmento leído).
   - Filtros de período (similares a Dashboard).
6. **Estados.**
   - **Cargando:** spinner `sync` centrado; overlay sobre los totales mientras recargan.
   - **Cargando más (scroll infinito):** "Cargando más ventas..." con spinner; al final "No hay más ventas".
   - **Error puntual:** toasts como "No se encontró la venta", "No se pudo generar el enlace del recibo", "No se pudo imprimir la comanda".
   - **Éxito:** toast "Comanda impresa".
7. **Modales/paneles.** Panel de detalle de la venta (en móvil a pantalla completa). SUPOSICIÓN: modal de anulación/devolución abierto desde el detalle.
8. **Textos clave.** "Buscar cliente, orden...", "Cliente:", "Consumidor Final", "Cargando más ventas...", "No hay más ventas".
9. **Componentes.** Hooks de ventas; helpers de recibo (`buildReceiptData`), impresión térmica/QZ, compartir.
10. **Problemas visuales.** La fila de 4 íconos de acción (imprimir, comanda, compartir, descargar) son todos del mismo tamaño y color base (gris) y solo se diferencian por el ícono; para alguien nuevo cuesta distinguir "imprimir recibo" de "imprimir comanda".

---

## 3. Actividad (Visor de eventos)

**Archivo:** `screens/ActivityScreen.tsx`

1. **Propósito.** Registro de auditoría: qué hizo cada empleado (ventas, aperturas/cierres de caja, cambios) y quién está conectado ahora mismo.
2. **Cómo se llega / quién la ve.** Sidebar → "Actividad" (`monitoring`) → `Screen.ACTIVITY`. Requiere `admin_users` o `admin_settings`.
3. **Layout.** Columna única centrada (ancho máximo `max-w-3xl`). **Header** blanco (`py-3`) con el título a la izquierda ("Eventos" en móvil, "Visor de eventos" en pantallas ≥431px), un ícono de información (`EventViewerInfo`), un botón "Refrescar" y, pegado a la derecha, un **stack de avatares de presencia** (`PresenceStack`). Debajo, filtros y la lista de eventos.
4. **Contenido mostrado.** Lista de **filas de evento** (`EventRow`): cada una muestra el tipo de acción, el empleado y la fecha/hora. El total de eventos aparece en los filtros. El elemento destacado es la **lista de eventos** y el **stack de avatares** (quién está en línea).
5. **Acciones.**
   - Botón **"Refrescar"** (ícono `refresh`, gira mientras carga): recarga eventos.
   - **Filtros** (`EventFilters`): por empleado, por rango de fechas, etc.
   - Tocar una fila abre el **detalle del evento** (salvo acciones como `cash.shift.opened` que no abren detalle por ser redundantes).
   - Botón **"Cargar más"** al pie si hay más eventos.
   - Desde el detalle: "ver venta" (navega a `SALES` con deep-link), "ver reporte", "ver turno" (navega a `CASH_REGISTER` con deep-link `?shift=`), "filtrar por empleado".
6. **Estados.**
   - **Cargando:** 5 filas skeleton con shimmer.
   - **Vacío:** ícono `manage_search` + "No hay eventos con estos filtros".
7. **Modales/paneles.** `EventDetailModal` (detalle de un evento con botones de navegación), `PresenceStack` que despliega un popover (desktop) o bottom sheet (móvil) con el detalle de presencia.
8. **Textos clave.** "Visor de eventos", "Eventos", "Refrescar", "No hay eventos con estos filtros", "Cargar más".
9. **Componentes.** `PresenceStack`, `EventViewerInfo`, `EventFilters`, `EventRow`, `EventDetailModal`; hooks `useEmployeePresence`, `useAuditEvents`.
10. **Problemas visuales.** El header mete muchos elementos en poco espacio en móvil (título + info + refrescar + avatares); en teléfonos angostos puede sentirse apretado. Nota confirmada en código: la pestaña "Empleados conectados" y la gestión de dispositivos fueron eliminadas/ocultas.

---

## 4. Clientes (Cuentas por Cobrar)

**Archivo:** `screens/ClientsScreen.tsx`

1. **Propósito.** Llevar quién le debe al negocio (fiado), cuánto, y registrar abonos; ver el historial de cada cliente.
2. **Cómo se llega / quién la ve.** Sidebar → "Clientes" (`groups`) → `Screen.CLIENTS`. Requiere `clients_view` (o herencia de `pos_view`/`inv_view`).
3. **Layout.** Maestro-detalle. **Header** (`h-14`) con título **"Cuentas por Cobrar"**. A la izquierda la lista/monitor de clientes con buscador ("Buscar cliente o factura..."); al seleccionar un cliente se abre su **ficha** con botón "atrás" (`arrow_back`), su nombre y sus movimientos.
4. **Contenido mostrado.** Lista de clientes con su deuda actual; KPIs de cartera (aging). En la ficha del cliente: historial de movimientos (fiados y abonos), saldo. El dato más destacado es la **deuda de cada cliente** y el **saldo pendiente**.
5. **Acciones.**
   - Buscador "Buscar cliente o factura...".
   - **Crear/editar cliente** (formulario con campos "Ej: Juan Pérez" nombre, "Ej: 1234567890" documento, "Ej: cliente@email.com" email, "Ej: Calle 123 #45-67" dirección, y límite de crédito "0").
   - **Registrar abono / fiado** (campo monto "0").
   - **Eliminar cliente** → `ConfirmDialog`: título "¿Eliminar a [nombre]?"; si tiene deuda, el mensaje aclara que no se borran sus datos; botón "Eliminar".
   - **Limpiar historial** del cliente → confirmación "¿Limpiar historial?" ("...la deuda se reiniciará a $0. Esta acción no se puede deshacer.").
   - Compartir/descargar historial en PDF, enviar recibo por email (`EmailReceiptModal`).
6. **Estados.**
   - **Sin conexión:** "Las cuentas por cobrar requieren internet para cargar los datos de clientes."
   - **Búsqueda vacía:** ícono `search_off` + "No se encontraron registros".
   - **Cliente sin movimientos:** ícono `receipt_long` + "No hay movimientos registrados."
   - **Advertencia sin turno:** al abonar sin turno activo, aviso ámbar: "No hay turno activo. El abono quedará registrado en la deuda del cliente, pero no entrará a la caja..."
   - **Aging sheet vacío:** "No hay clientes en este rango".
7. **Modales/paneles.** Formulario de cliente (crear/editar), modal de abono, `ConfirmDialog` (eliminar / limpiar historial), `EmailReceiptModal`, bottom sheet de aging.
8. **Textos clave.** "Cuentas por Cobrar", "Buscar cliente o factura...", "No se encontraron registros", "No hay movimientos registrados.", "¿Limpiar historial?".
9. **Componentes.** `AppButton`, `PhoneInput`, `EmailReceiptModal`, `ScreenLoader`; hooks `useClients`, `useCashRegister`, `useConfirmDialog`.
10. **Problemas visuales.** Es uno de los archivos más grandes de la app (muchos formularios inline en la misma pantalla). La mezcla de "monitor de clientes", "ficha", formularios de crear/editar y abono dentro de una sola pantalla puede sentirse densa.

---

## 5. Proveedores (Cuentas por Pagar)

**Archivo:** `screens/DebtsScreen.tsx` (etiqueta de menú **"Proveedores"**, `Screen` interno `DEBTS`)

1. **Propósito.** Llevar lo que el negocio **le debe a sus proveedores** (facturas pendientes), hacer pagos y ver el directorio de proveedores.
2. **Cómo se llega / quién la ve.** Sidebar → "Proveedores" (`account_balance_wallet`) → `Screen.DEBTS`. Requiere `debts_view` (o herencia de `admin_reports`/`pos_close`).
3. **Layout.** **Header** (`h-14`) con un **conmutador de pestañas** a la izquierda (grupo de botones tipo pills). Las vistas: resumen/KPIs, análisis de cartera, detalle operativo (facturas pendientes) y directorio de proveedores. Al seleccionar un proveedor se abre su ficha con "atrás", nombre y nº de compras.
4. **Contenido mostrado.** KPIs ("Resumen Financiero (KPIs)"), análisis de cartera y vencimientos, tabla de "Facturas Pendientes", "Directorio de Proveedores". El dato destacado son los **montos adeudados** y los **vencimientos**.
5. **Acciones.**
   - Pestañas (botones del header).
   - Buscadores: "Buscar por Proveedor o descripción..." y "Buscar proveedor...".
   - **Registrar compra/deuda** (campo descripción "Ej: Compra de insumos", monto "0", selector de proveedor "Buscar o escribir nuevo...").
   - **Registrar pago** a un proveedor (monto).
   - Adjuntar evidencia (`EvidenceUploader`) y verla (`EvidenceViewer`).
6. **Estados.**
   - **Sin conexión:** "El registro de cuentas por pagar requiere internet para cargar deudas y proveedores."
   - **Sin facturas:** ícono `check_circle` + "No hay facturas pendientes".
   - **Sin proveedores:** ícono `store` + "No hay proveedores registrados" + "Los proveedores aparecerán aquí al registrar deudas o crearlos manualmente."
   - **Cargando movimientos:** spinner `progress_activity` + "Cargando movimientos..." / "Cargando más movimientos...".
   - **Sin resultados en autocompletar proveedor:** "No se encontraron resultados".
7. **Modales/paneles.** Formulario de compra/deuda, formulario de pago, ficha de proveedor, `EvidenceUploader`/`EvidenceViewer`, `ConfirmDialog`.
8. **Textos clave.** "Resumen Financiero (KPIs)", "Análisis de Cartera y Proveedores", "Detalle Operativo: Facturas Pendientes", "Directorio de Proveedores", "No hay facturas pendientes".
9. **Componentes.** `EvidenceUploader`, `EvidenceViewer`, `ScreenLoader`; hooks `useDebts`, `useSuppliers`, `useImageUpload`, `useCashRegister`.
10. **Problemas visuales.** Las secciones usan textos tipo "Propósito: ..." como subtítulos; es útil pero poco común en el resto de la app (inconsistencia de estilo). Es la pantalla más pesada del módulo (archivo muy grande), con mucho contenido por pestaña.

---

## 6. Productos (Catálogo)

**Archivo:** `screens/ProductsScreen.tsx`

1. **Propósito.** Ver y administrar el catálogo (productos, insumos, promociones), con un diagnóstico de "Salud del Stock" por producto, y entrar a crear/editar.
2. **Cómo se llega / quién la ve.** Sidebar → "Productos" (`shopping_bag`) → `Screen.PRODUCTS`. Requiere `inv_view`/`inv_create`.
3. **Layout.** **Header** (`md:h-14`) que en móvil se apila: buscador ("Buscar..."), filtros (proveedor, categoría) y botón de crear. Debajo, el catálogo como **tabla** en desktop y como **tarjetas** (grid) en móvil, con scroll infinito.
4. **Contenido mostrado.** Por producto: nombre, categoría, stock, precio y un **badge de "Salud del Stock"** con estados como "Estancado", "Sin datos", "Agotado", "Calculando...". Textos de diagnóstico explicativos (p. ej. "Este producto todavía no se ha vendido..."). El elemento destacado es la **lista/tabla de productos** con sus badges de salud.
5. **Acciones.**
   - Buscador "Buscar...".
   - Botón **crear producto** (abre un menú de tipo: Producto simple → `CREATE_PRODUCT_SIMPLE`, Receta → `CREATE_PRODUCT_PROCESSED`, Servicio → `CREATE_PRODUCT_SERVICE`; crear promoción → `CREATE_PROMOTION`; crear desde factura → `CREATE_FROM_INVOICE`). SUPOSICIÓN: el menú exacto se arma en el header.
   - **Editar** producto (navega a la pantalla de creación correspondiente con los datos).
   - **Eliminar** → `ConfirmDialog`: "¿Eliminar [la promoción/el producto] "[nombre]"?" / "Esta acción no se puede deshacer." / botón "Eliminar".
6. **Estados.**
   - **Sin conexión:** "El catálogo de productos requiere internet para cargar datos actualizados y mostrar el diagnóstico de stock."
   - **Cargando más:** spinner `progress_activity` + "Cargando más productos..." (tanto en tabla como en grid).
   - **Búsqueda vacía:** ícono `search_off` + "No se encontraron productos."
   - **Error al editar:** toast "No se pudieron cargar los datos del producto para editar".
7. **Modales/paneles.** Menú de tipo de producto; `ConfirmDialog` de borrado. Las creaciones son pantallas propias (fichas 8–12).
8. **Textos clave.** "Buscar...", "No se encontraron productos.", "Cargando más productos.", badges "Estancado"/"Agotado"/"Sin datos".
9. **Componentes.** Hooks de productos; `ConfirmDialog`.
10. **Problemas visuales.** El "diagnóstico de salud" tiene varios estados con íconos y colores propios (`mood_bad`, `hourglass_empty`, `schedule`); si hay muchos a la vez la tabla puede verse colorida y ruidosa. En móvil (tarjetas) el badge compite con precio y stock por el poco espacio.

---

## 7. Inventario (Conteo físico)

**Archivo:** `screens/InventoryScreen.tsx` — con **muro PRO** envuelto en `App.tsx`

1. **Propósito.** Hacer el conteo físico del stock: comparar lo que dice el sistema contra lo contado, y guardar los ajustes (con historial reversible).
2. **Cómo se llega / quién la ve.** Sidebar/drawer → "Inventario" (`inventory`) → `Screen.INVENTORY`. Requiere `inv_view`/`inv_stock` **y** que el plan incluya inventario físico (`canUsePhysicalInventory`).
3. **Layout.** **Header** (`md:h-14`) con el título, un conmutador **"Productos (N)" / "Ingredientes (N)"** (la pestaña de ingredientes solo si hay), buscador ("Buscar...") y, en productos, un filtro de categoría. En desktop un resumen de diferencias (unidades/valor) vive a la derecha del header; en móvil es una tarjeta aparte. El cuerpo es la lista de ítems para contar. En móvil se usa un teclado numérico propio (`InventoryNumpad`).
4. **Contenido mostrado.** Por ítem: stock del sistema vs. stock contado, y la diferencia. Un **resumen** arriba: "Unidades" (+/−) y "Valor" ($). El dato destacado es la **diferencia total** (unidades y valor) y, por fila, el campo de conteo.
5. **Acciones.**
   - Conmutador "Productos (N)" / "Ingredientes (N)".
   - Buscador + filtro de categoría + toggle "solo diferencias".
   - Ingresar el stock contado por ítem (input o numpad móvil).
   - **Guardar** por ítem o **guardar todo** (los cambios se registran como ajustes).
   - **Historial de ajustes** (panel lateral derecho con los ajustes revertibles): botón **deshacer** un ajuste negativo.
6. **Estados.**
   - **Sin conexión:** (ícono `wifi_off`, SUPOSICIÓN del texto por el patrón común).
   - **Vacío productos:** ícono `inventory_2` + "No hay productos".
   - **Vacío ingredientes:** ícono `grocery` + "No hay ingredientes".
   - **Historial cargando:** spinner + "Cargando historial...".
   - **Historial vacío:** ícono `history` + "Sin ajustes revertibles" + explicación de por qué no se puede revertir.
   - **Guardado:** toast "N stock(s) actualizados correctamente"; sin cambios: "No hay cambios para guardar"; bloqueo de reversión: "No se puede revertir: ya hay ventas o compras posteriores de este producto."
   - **Muro PRO** (plan sin inventario físico): tarjeta centrada con ícono `inventory`, badge **PRO**, título **"Auditoría y Conteo Físico"**, y botón **"Ver Planes y Actualizar"** (→ `SUBSCRIPTION_PLANS`) + "Volver al inicio" (→ `HOME`).
7. **Modales/paneles.** Panel lateral derecho "HISTORIAL DE AJUSTES" (overlay oscuro + panel deslizante desde la derecha); `InventoryNumpad` en móvil; banner informativo sobre revertir ajustes.
8. **Textos clave.** "Productos (N)", "Ingredientes (N)", "HISTORIAL DE AJUSTES", "Sin ajustes revertibles", "Auditoría y Conteo Físico".
9. **Componentes.** `InventoryNumpad`, `ScreenLoader`; hooks `useInventory`, `useExpenses`, `useConfirmDialog`.
10. **Problemas visuales.** El resumen de diferencias cambia de lugar entre desktop (dentro del header) y móvil (tarjeta aparte); un diseñador debe cuidar que ambos lean igual. El panel de historial es ancho (`max-w-md`) y tapa buena parte de la pantalla.

---

## 8. Crear/Editar producto simple

**Archivo:** `screens/SimpleProductScreen.tsx` (`Screen.CREATE_PRODUCT_SIMPLE`)

1. **Propósito.** Dar de alta (o editar) un producto que se vende por unidad: nombre, código de barras, stock, precio, costo, proveedor, apodos.
2. **Cómo se llega / quién la ve.** Desde "Productos" (botón crear) o desde "Crear desde factura". Requiere `inv_create`.
3. **Layout.** **Header** de 64px (`h-16`) con título **"Crear Producto"** / **"Editar Producto"**. Debajo, un formulario largo con scroll: selector de tipo, código de barras ("Ej: 7702011234567"), nombre ("Nombre del producto *"), proveedor (con buscador "Buscar proveedor..." y botón "Crear"), stock ("0"), precio ("0"), costo ("0"), apodos, foto.
4. **Contenido mostrado.** Campos del formulario. El elemento destacado es el bloque **Precio/Costo/Stock** y el nombre.
5. **Acciones.**
   - Selector de **tipo** (Producto / Ingrediente / Receta / Servicios): cambiar a Receta navega a la pantalla de receta.
   - Inputs: código de barras (puede escanearse/pegarse), nombre, stock (solo lectura al editar), precio, costo.
   - **Crear proveedor** (botón "Crear" con ícono `add`) → modal.
   - **Guardar** el producto; al crear con código+imagen+nombre, se guarda también en el catálogo global de barcodes.
6. **Estados.**
   - **Sin conexión:** "Para [crear/editar] productos necesitas internet. Los cambios se guardan directamente en la nube."
   - **Guardando:** spinner en el botón.
   - **Pendiente:** avisos como "Cambio pendiente. Se aplicará al guardar." y "Al guardar, se abrirá el editor de recetas."
   - **Error de permiso:** toast "No tienes permiso para crear o editar productos." / genérico "No se pudo guardar el producto. Intenta de nuevo."
7. **Modales/paneles.** Modal "crear proveedor"; selector de presentación de venta; cámara/pegado de imagen.
8. **Textos clave.** "Crear Producto", "Editar Producto", "Nombre del producto *", "Buscar proveedor...", "Ej: 7702011234567".
9. **Componentes.** `AppButton`, selector de unidad propio, hooks de imagen/proveedores.
10. **Problemas visuales.** El formulario es muy largo (uno de los archivos más grandes). El selector de tipo que navega a otra pantalla (Receta) puede sorprender a quien esperaba quedarse en el mismo formulario.

---

## 9. Crear/Editar receta (producto procesado)

**Archivo:** `screens/ProcessedProductScreen.tsx` (`Screen.CREATE_PRODUCT_PROCESSED`)

1. **Propósito.** Crear un producto que se arma con ingredientes (receta); su disponibilidad se deriva de los insumos, no tiene stock propio.
2. **Cómo se llega / quién la ve.** Desde "Productos" o al cambiar el tipo a "Receta" en el formulario simple. Requiere `inv_create`.
3. **Layout.** **Header** (`h-16`) con **"Crear Receta"** / **"Editar Receta"**. Formulario con: selector de tipo (Producto/Ingrediente/Receta/Servicios), nombre ("Nombre del producto *"), bloque **"Ingredientes de la Receta"** (ícono `skillet`), foto, apodos.
4. **Contenido mostrado.** Lista de ingredientes de la receta con cantidades. El bloque destacado es **"Ingredientes de la Receta"**.
5. **Acciones.**
   - Selector de tipo (si lo cambia a Producto/Ingrediente aparece un banner "Este producto dejará de ser una Receta" y el botón pasa a "Continuar al editor de producto").
   - Agregar/quitar ingredientes.
   - **Guardar**: botón "Crear Receta" / "Actualizar Receta".
6. **Estados.**
   - **Sin conexión:** "Para [crear/editar] recetas necesitas internet..."
   - **Cambio de tipo:** banner ámbar "Se eliminarán los ingredientes de la receta. Se conservarán: Nombre, Imagen y...".
   - **Éxito:** toast "Receta actualizada/creados exitosamente"; luego navega a Productos.
   - **Error de permiso:** "No tienes permiso para crear o editar productos."
7. **Modales/paneles.** Selector/creación de insumos; cámara de imagen.
8. **Textos clave.** "Crear Receta", "Editar Receta", "Ingredientes de la Receta", "Este producto dejará de ser una Receta".
9. **Componentes.** `AppButton`, editor de ingredientes; hooks de imagen.
10. **Problemas visuales.** El flujo de "cambiar tipo" muta el botón de guardar a "Continuar al editor...", lo que puede confundir (el usuario cree que guarda, pero navega).

---

## 10. Crear/Editar servicio

**Archivo:** `screens/ServiceProductScreen.tsx` (`Screen.CREATE_PRODUCT_SERVICE`)

1. **Propósito.** Crear un ítem que es un servicio (sin stock), con precio y apodos.
2. **Cómo se llega / quién la ve.** Desde "Productos". Requiere `inv_create`.
3. **Layout.** **Header** (`h-16`) con **"Crear Servicio"** / **"Editar Servicio"**. Formulario: tipo (Producto/Servicios), nombre ("Nombre del servicio *"), precio, foto ("Foto del servicio"), apodos ("Apodos del servicio"). La tabla de ingredientes del servicio está **oculta** (`false &&`).
4. **Contenido mostrado.** Campos del servicio; el destacado es nombre + precio.
5. **Acciones.** Selector de tipo (el campo "Servicios" queda de solo lectura cuando ya es servicio), inputs, foto, apodos, **"Crear Servicio" / "Actualizar Servicio"**. Tras crear, botón "Crear otro".
6. **Estados.**
   - **Sin conexión:** "Para [crear/editar] servicios necesitas internet..."
   - **Éxito:** "¡Servicio creado!" / "¡Servicio actualizado!" (modal de éxito con opción "Crear otro").
   - **Error de permiso:** "No tienes permiso para crear o editar productos."
7. **Modales/paneles.** Modal de éxito; cámara de imagen.
8. **Textos clave.** "Crear Servicio", "Nombre del servicio *", "Foto del servicio", "Apodos del servicio", "¡Servicio creado!".
9. **Componentes.** `AppButton`; hooks de imagen.
10. **Problemas visuales.** Hay bloques comentados/ocultos ("Ingredientes del Servicio" con `false &&`); no se ven, pero existe la deuda de limpieza. El formulario es casi idéntico al de producto simple salvo campos ocultos.

---

## 11. Crear productos desde factura

**Archivo:** `screens/InvoiceCreateScreen.tsx` (`Screen.CREATE_FROM_INVOICE`)

1. **Propósito.** Tomar una foto de la factura del proveedor y, con IA (Gemini), extraer los productos para darlos de alta rápido.
2. **Cómo se llega / quién la ve.** Desde "Productos" (crear desde factura) o desde el menú de egresos. Requiere `inv_create`.
3. **Layout.** Es un **asistente por pasos** a pantalla completa, no un formulario único. Cada paso es un componente dedicado: capturar foto, recortar, procesando, error, confirmar proveedor, resumen, y "listo".
4. **Contenido mostrado.** Según el paso: cámara/selector de archivo, recorte de imagen, spinner "Leyendo la factura...", resumen de productos detectados, pantalla de productos creados.
5. **Acciones (por paso).**
   - **Capturar:** abrir cámara / elegir archivo; "atrás"/"cerrar" (vuelve a Productos).
   - **Recortar:** "confirmar" o "volver a tomar".
   - **Procesando:** solo espera ("Leyendo la factura...").
   - **Error:** "reintentar" o "continuar manual".
   - **Proveedor:** confirmar el proveedor detectado.
   - **Resumen:** "empezar a crear" (lleva a crear producto simple con prefill) o cancelar.
   - **Listo:** "volver".
6. **Estados.** El propio `step` es la máquina de estados: `capture`, `crop`, `processing`, `error`, `supplier`, `summary`, `creating` (spinner breve mientras navega), `done`.
7. **Modales/paneles.** No usa modales; cada paso ocupa la pantalla.
8. **Textos clave.** "Leyendo la factura...", "No pudimos leer la factura." (mensaje de error por defecto).
9. **Componentes.** `ScanCaptureStep`, `ScanCropStep`, `ScanProcessingStep`, `ScanErrorStep`, `ScanSupplierStep`, `InvoiceCreateSummaryStep`, `InvoiceCreateDoneStep`; hooks `useInvoiceCreate`, `useSuppliers`.
10. **Problemas visuales.** Al pasar a `creating` se muestra un spinner "vacío" sin texto; si la navegación tarda, el usuario ve un spinner sin contexto por un instante.

---

## 12. Crear promoción

**Archivo:** `screens/CreatePromotionScreen.tsx` (`Screen.CREATE_PROMOTION`)

1. **Propósito.** Armar una promoción (combo, 2x1) juntando productos y fijando un precio promocional.
2. **Cómo se llega / quién la ve.** Desde "Productos". Requiere permiso de crear/editar promociones.
3. **Layout.** **Header** de 64px (`h-16`) con **"Crear Promoción"** (ícono `loyalty`). Formulario: foto de la promoción, bloque "Información de la Promoción" (nombre "Ej: Combo Pareja, 2x1 Hamburguesas...", descripción "Breve descripción..."), bloque "Productos (N)" con botón de agregar, y bloque "Resumen" con el **"Precio Promoción"** destacado en grande (`text-2xl`, ámbar).
4. **Contenido mostrado.** Nombre, productos elegidos, y el **precio de la promoción** como número grande ámbar (elemento más destacado).
5. **Acciones.**
   - Inputs nombre y descripción; foto.
   - Botón **agregar producto** (`shopping_basket`) → abre el selector de productos (buscador "Buscar producto...").
   - Botón primario **"Crear Promoción"** (`AppButton`), deshabilitado si no hay nombre o productos.
6. **Estados.**
   - **Sin conexión:** "Para crear promociones necesitas internet. Los cambios se guardan directamente en la nube."
   - **Validación:** toast "Ingrese un nombre para la promoción".
   - **Éxito:** toast "Promoción creada exitosamente" + modal "¡Promoción creada!" con "¿Qué deseas hacer ahora?".
   - **Error de permiso:** "No tienes permiso para crear o editar promociones."
7. **Modales/paneles.** Selector de productos; modal de éxito ("¡Promoción creada!").
8. **Textos clave.** "Crear Promoción", "Información de la Promoción", "Productos (N)", "Precio Promoción", "¡Promoción creada!".
9. **Componentes.** `AppButton`; hook de imagen; hook de promociones.
10. **Problemas visuales.** El botón "Crear Promoción" aparece dos veces en el flujo (en el formulario y como confirmación), lo que es correcto pero hay que cuidar que no se perciba repetido.

---

## 13. Editar promoción

**Archivo:** `screens/EditPromotionScreen.tsx` (`Screen.EDIT_PROMOTION`)

1. **Propósito.** Editar una promoción existente (productos, foto, nombre).
2. **Cómo se llega / quién la ve.** Desde "Productos" al editar una promoción. Mismo permiso que crear.
3. **Layout.** Se presenta como **panel lateral derecho** (overlay oscuro + panel que entra desde la derecha, `max-w-md`). **Header** (`h-16`) con **"Editar Promoción"** (ícono `loyalty`). Dentro: productos, foto, resumen.
4. **Contenido mostrado.** Igual que crear, pero precargado.
5. **Acciones.** Quitar producto (ícono papelera, `aria-label` "Eliminar [producto]"), cambiar/eliminar imagen (`delete`), botón **"Guardar Cambios"** (`AppButton`, deshabilitado si hay menos de 2 productos o falta nombre). Cerrar el panel (clic en overlay / Escape).
6. **Estados.** SUPOSICIÓN: comparte estados con crear (sin conexión, guardando, error de permiso).
7. **Modales/paneles.** El propio panel lateral; selector de productos.
8. **Textos clave.** "Editar Promoción", "Guardar Cambios".
9. **Componentes.** `AppButton`; hook de imagen/promociones.
10. **Problemas visuales.** A diferencia de "Crear Promoción" (pantalla completa), editar es un **panel lateral**; esa diferencia de contenedor entre crear y editar es una inconsistencia a revisar.

---

## 14. Perfil / Ajustes de cuenta

**Archivo:** `screens/ProfileScreen.tsx` (`Screen.PROFILE`)

1. **Propósito.** Editar el nombre del negocio y los datos personales, cambiar el PIN, y acceder a la zona de eliminar cuenta.
2. **Cómo se llega / quién la ve.** Dropdown de perfil (sidebar) o drawer móvil → "Mi Perfil" / "Detalles de cuenta" → `Screen.PROFILE`. También se fuerza aquí a un administrador con el negocio sin nombrar (perfil incompleto).
3. **Layout.** **Header** blanco con botón "atrás" y título **"Ajustes"** + subtítulo "Administra tu perfil y preferencias". Contenido centrado (`max-w-3xl`): tarjeta de perfil (avatar + nombre + rol + email + **ID del negocio** copiable + badge de PIN) y un formulario tipo filas etiqueta/campo (Negocio, Nombre, Email, Teléfono). Al pie, zona de PIN y **zona de peligro** (eliminar cuenta).
4. **Contenido mostrado.** Nombre, rol, email, teléfono, ID del negocio (`#código`). El elemento destacado es la **tarjeta de perfil** con el avatar.
5. **Acciones.**
   - Campos: "Negocio" (solo administrador, "Ej: Restaurante El Buen Sabor"), "Nombre" ("Tu nombre completo"), "Email" ("Escribe tu correo para vincularlo" / "Al guardar se enviará un enlace de verificación"), "Teléfono" ("Opcional").
   - Botón **"Guardar cambios"** (si cambió el email, pasa a decir "Verificar").
   - **Copiar ID del negocio** (clic en el badge `#código`).
   - **Cambiar PIN** (campos "••••" nuevo y confirmación + botón "Guardar").
   - **Eliminar cuenta** (zona de peligro) → modal con la lista de lo que se borra ("Tu negocio y configuración", "Productos e inventario", ...).
6. **Estados.**
   - **Perfil incompleto:** banner ámbar "Ingresa el nombre de tu negocio y tus datos para comenzar." y el campo "Negocio" resaltado con foco automático.
   - **Sin conexión al guardar:** mensaje "Necesitas conexión a internet para guardar cambios en tu perfil."
   - **Guardando:** spinner "Guardando" en el botón.
7. **Modales/paneles.** Modal de cambiar PIN; modal de eliminar cuenta.
8. **Textos clave.** "Ajustes", "Administra tu perfil y preferencias", "Negocio", "Guardar cambios", "Verificar".
9. **Componentes.** Inputs propios; hook de auth; `supabase`.
10. **Problemas visuales.** El título de la pantalla es "Ajustes" pero el ítem de menú se llama "Mi Perfil"/"Detalles de cuenta"; esa diferencia de nombre puede desorientar.

---

## 15. Elegir plan (Suscripción)

**Archivo:** `screens/SubscriptionPlansScreen.tsx` (`Screen.SUBSCRIPTION_PLANS`)

1. **Propósito.** Mostrar los planes y permitir iniciar la prueba o pagar (vía Wompi) para activar/renovar la suscripción.
2. **Cómo se llega / quién la ve.** Tras registrarse (bienvenida), desde el muro PRO, desde la pantalla de prueba vencida (admin) o desde "Mi Suscripción" (pestaña Planes). La ve el administrador.
3. **Layout.** Lista de **tarjetas de plan** ordenadas por precio, con un **conmutador de ciclo** (mensual / trimestral). El flujo tiene varios estados (`flowStep`): `plans`, `trial_started`, `payment_success`, `payment_pending`, `promo_success`, `card_payment`.
4. **Contenido mostrado.** Cada plan: nombre (Mensual/Trimestral/Anual), precio y features. SUPOSICIÓN: el precio mensual es el número destacado por tarjeta. Se oculta el "Plan Pruebas Internas" y los planes personalizados del catálogo público.
5. **Acciones.**
   - Conmutador de ciclo (mensual/trimestral).
   - Botón de cada plan: inicia prueba (`handleStartTrial`) o abre el **widget de pago Wompi** (`handleOpenWompiWidget`); si la cuenta no tiene email real (login por SMS), primero pide el correo (`showEmailPrompt`).
6. **Estados.**
   - **Cargando:** `loading` mientras trae planes.
   - **Procesando pago:** `processingPlanId` marca qué plan está en proceso.
   - **Resultado:** pasos de éxito / pendiente / rechazado (mensajes "Pago rechazado: ..."); al terminar, observa la activación vía webhook y refresca.
   - **Error:** "El widget de pago no está listo. Por favor espera unos segundos."
7. **Modales/paneles.** Prompt de email para pago; widget de Wompi (externo); pantallas de resultado del flujo.
8. **Textos clave.** "Mensual", "Trimestral", nombres de plan; mensajes de pago.
9. **Componentes.** Config Wompi, `openCustomPlanCheckout`, hook de auth.
10. **Problemas visuales.** El flujo tiene muchos sub-estados (`flowStep`) que cambian toda la pantalla; es fácil que un rediseño rompa alguno si no se contemplan todos (prueba, éxito, pendiente, promo, pago con tarjeta).

---

## 16. Mi Suscripción (Gestión)

**Archivo:** `screens/SubscriptionManagementScreen.tsx` (`Screen.SUBSCRIPTION_MANAGEMENT`)

1. **Propósito.** Ver el estado de la suscripción, el plan actual, el historial de pagos y administrar métodos de pago.
2. **Cómo se llega / quién la ve.** Dropdown de perfil (sidebar) → "Suscripción" / drawer "Mi Suscripción" → `Screen.SUBSCRIPTION_MANAGEMENT`. Solo administrador y solo negocios habilitados (`canShowSubscription`).
3. **Layout.** **Título** "Facturación y Pagos" + subtítulo "Gestiona tu suscripción y métodos de pago". Debajo, un **conmutador de pestañas**: "Resumen" (`dashboard`), "Planes" (`workspace_premium`), "Pagos" (`credit_card`), "Historial" (`history`). Cada pestaña muestra su contenido.
4. **Contenido mostrado.** En Resumen: estado + "Plan Actual" con botón "Cambiar Plan". En Pagos: tarjetas guardadas. En Historial: facturas/redenciones. En Planes: embebe la pantalla de planes. El dato destacado es el **estado de la suscripción** y el **plan actual**.
5. **Acciones.**
   - Pestañas (Resumen/Planes/Pagos/Historial).
   - "Cambiar Plan" (va a la pestaña Planes).
   - **Agregar método de pago** (modal de tarjeta: número, CVC, mes/año, titular) → "Método de pago agregado correctamente".
   - **Eliminar método** → `ConfirmDialog` "¿Eliminar este método de pago?" (no permite quedarse sin ninguno: "Debes mantener al menos un método de pago activo.").
   - **Marcar principal**.
   - **Pagar plan personalizado** (`handlePayCustomPlan`, vía Wompi) con `CustomPlanCard`.
6. **Estados.**
   - **Sin suscripción activa:** ícono `credit_card_off` + "No tienes una suscripción activa" + "Selecciona un plan para comenzar" + botón "Ver Planes".
   - **Procesando:** `payingCustomPlan` / `processingAction`.
   - **Pago:** toasts "Pago en proceso...", "Pago rechazado: ...", errores de método de pago.
7. **Modales/paneles.** Modal agregar tarjeta; `ConfirmDialog` eliminar método; `CustomPlanCard`; widget Wompi.
8. **Textos clave.** "Facturación y Pagos", "Resumen", "Planes", "Pagos", "Historial", "Plan Actual", "Cambiar Plan", "No tienes una suscripción activa".
9. **Componentes.** `CustomPlanCard`, `SubscriptionPlansScreen` (embebida en pestaña), `ScreenLoader`; hooks `useCustomPlan`, `usePermissions`, `useConfirmDialog`.
10. **Problemas visuales.** El título es "Facturación y Pagos" pero el menú lo llama "Suscripción"/"Mi Suscripción"; otra inconsistencia de nombres. Reusa la pantalla de Planes dentro de una pestaña, así que arrastra la complejidad de esa pantalla.

---

## 17. Asistente IA (RAG Chat)

**Archivo:** `screens/RagChatScreen.tsx` (`Screen.RAG_CHAT`)

1. **Propósito.** Chat de ayuda que responde dudas sobre cómo usar Bistro POS, consultando una base de conocimiento.
2. **Cómo se llega / quién la ve.** Sidebar "Asistente IA" (`smart_toy`) / nav móvil "Ayuda" (`auto_awesome`) → `Screen.RAG_CHAT`. Solo negocios habilitados.
3. **Layout.**
   - **Desktop (solo en modo dev/admin):** panel izquierdo de 288px (`w-72`) "Base de Conocimiento" con la lista de documentos; a la derecha el chat.
   - **Para el usuario normal:** solo el chat (sin panel de documentos). Header del chat con "Asistente IA" + "SOPORTE BISTRO POS" y botón "Nuevo Chat"; cuerpo de mensajes; input abajo ("Haz tu pregunta aquí...").
   - **Móvil:** botón flotante de documentos solo en dev; el panel es un drawer.
4. **Contenido mostrado.** Mensajes del usuario (burbuja ámbar a la derecha) y del asistente (burbuja clara a la izquierda). Vacío: pantalla de bienvenida "¿En qué puedo ayudarte?" con 3 sugerencias ("🖨️ ¿Cómo configuro la impresora de recibos?", "💰 ¿Cómo aplico un descuento a una venta?", "📊 ¿Cómo veo las ventas del día?"). El elemento destacado es el **hilo de mensajes** y el **input**.
5. **Acciones.**
   - Escribir y **enviar** (botón `send`; Enter envía, Shift+Enter salta línea).
   - **"Nuevo Chat"** (`refresh`): limpia la conversación.
   - Sugerencias rápidas (rellenan el input).
   - (Solo dev) subir PDF/imagen, agregar video, agregar GIF, indexar, re-indexar, eliminar documento, "Indexar pendientes (N)", "Vaciar base de conocimiento".
6. **Estados.**
   - **Sin conexión:** ícono `wifi_off` + "Sin conexión" + "El Asistente IA necesita internet para responder preguntas...".
   - **Cargando respuesta:** tres puntos ámbar que rebotan.
   - **Vacío:** pantalla de bienvenida.
   - (dev) subiendo: overlay "Subiendo documento..."; errores de subida/indexado en rojo.
7. **Modales/paneles.** (dev) "¿Vaciar Base?" (destructivo), "Agregar Video", "Agregar Imagen / GIF"; drawer de documentos en móvil.
8. **Textos clave.** "Asistente IA", "SOPORTE BISTRO POS", "¿En qué puedo ayudarte?", "Haz tu pregunta aquí...", "LA IA PUEDE COMETER ERRORES. VERIFICA LA INFORMACIÓN CON TU EQUIPO.".
9. **Componentes.** `ChatMessage`, `SupportChatWidget` (en otras guardas); hooks `useRagChat`, `useRagDocuments`.
10. **Problemas visuales.** Todo el panel de documentos y sus modales solo existen en dev (`import.meta.env.DEV`); para el usuario final la pantalla es mucho más simple, así que el diseñador debe centrarse en la vista de chat sola.

---

## 18. Login (Iniciar sesión)

**Archivo:** `screens/LoginScreen.tsx` (`Screen.LOGIN`)

1. **Propósito.** Entrar a la app con PIN, SMS o Google.
2. **Cómo se llega / quién la ve.** Guarda de `App.tsx` cuando no hay sesión. Público.
3. **Layout.**
   - **Desktop:** dos paneles. Izquierda (branding): "Tu negocio te espera" + descripción + imagen `mockup-pos.png`. Derecha: la tarjeta de login.
   - **Móvil:** solo la tarjeta, con logo "BistroPOS" arriba.
   - La pantalla aparece con un fade-in cuando fuentes/íconos/imagen están listos.
4. **Contenido mostrado.** Tarjeta con el método elegido. El elemento destacado es la **tarjeta de login** (y el mockup en desktop).
5. **Acciones.**
   - Vista inicial (elegir método): botones "Ingresar con PIN" (`pin`), "Ingresar con SMS" (`sms`), "Ingresar con Google" (ícono Google), y al pie "Crear cuenta nueva" (→ `REGISTER`).
   - **PIN:** teléfono ("300 123 4567") + PIN ("••••", 4 dígitos) + "Iniciar sesión".
   - **SMS:** teléfono + "Enviar código SMS"; luego 6 casillas OTP + "Confirmar Código"; "Cambiar número".
   - Si el número no existe: aviso "No existe una cuenta con este número." + botón "Crear cuenta".
6. **Estados.**
   - **Cargando:** spinner `progress_activity` en los botones ("Entrando..." / "Enviando código..." / "Verificando...").
   - **Error:** caja roja con ícono `error` (p. ej. "PIN incorrecto. ¿Prefieres entrar por SMS?", "Código incorrecto. Intenta de nuevo.").
7. **Modales/paneles.** No usa modales; cambia de vista dentro de la tarjeta.
8. **Textos clave.** "Bienvenido de nuevo", "Ingresar con PIN", "Ingresar con SMS", "Ingresar con Google", "Crear cuenta nueva", "Tu negocio te espera".
9. **Componentes.** Hook `useAuth`; `recaptcha-container`.
10. **Problemas visuales.** Tres estados de la tarjeta (elegir método / formulario PIN-SMS / OTP) comparten el mismo contenedor; cuidar que el salto entre ellos no mueva el layout bruscamente.

---

## 19. Registro

**Archivo:** `screens/RegisterScreen.tsx` (`Screen.REGISTER`)

1. **Propósito.** Crear una cuenta nueva (teléfono + SMS o Google), con 7 días gratis.
2. **Cómo se llega / quién la ve.** Desde Login ("Crear cuenta nueva"). Público.
3. **Layout.**
   - **Desktop:** panel izquierdo de branding con badge "7 días gratis · Sin tarjeta de crédito", título "Empieza a vender hoy", un **stepper vertical** de 3 pasos ("Tu número", "Verificación", "PIN de acceso") y la lista de beneficios ("Al registrarte en Bistro podrás:"). Derecha: la tarjeta de registro.
   - **Móvil:** solo la tarjeta, con el badge de 7 días arriba.
4. **Contenido mostrado.** Formulario de teléfono o casillas OTP. El elemento destacado en desktop es el **stepper** y los beneficios; en móvil, la tarjeta.
5. **Acciones.**
   - Teléfono ("300 123 4567") + "Enviar Código"; nota "Te enviaremos un código de verificación".
   - "o regístrate con" → "Continuar con Google".
   - OTP: 6 casillas + "Confirmar Código"; "Cambiar número".
   - Si ya existe: "Ya tienes una cuenta con este número." + "Iniciar sesión".
   - Al pie: "¿Ya tienes una cuenta? Inicia sesión".
6. **Estados.** Cargando (spinner en botones: "Enviando código...", "Verificando...", "Registrando..."); error en caja roja.
7. **Modales/paneles.** No usa modales.
8. **Textos clave.** "7 días gratis · Sin tarjeta de crédito", "Empieza a vender hoy", "Regístrate para comenzar", "Enviar Código", "Confirmar Código".
9. **Componentes.** Hook `useAuth`; `recaptcha-container`.
10. **Problemas visuales.** El stepper de 3 pasos solo aparece en desktop; en móvil el usuario no tiene esa guía visual del progreso.

---

## 20. Recuperar contraseña

**Archivo:** `screens/ForgotPasswordScreen.tsx` (`Screen.FORGOT_PASSWORD`)

1. **Propósito.** Enviar un enlace por correo para restablecer la contraseña.
2. **Cómo se llega / quién la ve.** Desde Login (SUPOSICIÓN: enlace "¿Olvidaste tu contraseña?"). Público.
3. **Layout.** Pantalla centrada con fondo oscuro degradado (verde/slate) y efectos de luz. Logo "BistroPOS" arriba, y una **tarjeta** oscura (`bg-slate-800/50`) con ícono `key`, título "¿Olvidaste tu contraseña?" y el formulario de email.
4. **Contenido mostrado.** Un solo campo (email) y el botón de envío. El elemento destacado es la **tarjeta** sobre el fondo oscuro (estilo distinto al resto de la app, que es claro).
5. **Acciones.**
   - Input email ("tu@email.com").
   - Botón **"Enviar Enlace de Recuperación"** (`send`).
   - "Volver a Iniciar Sesión" (→ `LOGIN`).
   - En éxito: "Volver a Iniciar Sesión" y "Enviar de nuevo".
6. **Estados.**
   - **Validación:** "Por favor ingresa tu correo electrónico" / "Ingresa un correo electrónico válido".
   - **Cargando:** spinner + "Enviando...".
   - **Error:** caja roja "Error al enviar el correo. Intenta de nuevo.".
   - **Éxito:** ícono `forward_to_inbox` + "¡Correo enviado!" + "Hemos enviado un enlace de recuperación a [email]...".
7. **Modales/paneles.** No usa modales.
8. **Textos clave.** "¿Olvidaste tu contraseña?", "Enviar Enlace de Recuperación", "¡Correo enviado!".
9. **Componentes.** Hook `useAuth` (`resetPassword`), `IMAGES.logo_bg`.
10. **Problemas visuales.** El tema **oscuro** de esta pantalla contrasta con Login/Registro (claros): un usuario que viene de Login nota el cambio de tono. Inconsistencia de estilo a revisar.

---

## 21. Guarda: Prueba vencida (TrialExpiredScreen)

**Archivo:** `components/TrialExpiredScreen.tsx` (sin `Screen` propio; se renderiza por estado de suscripción)

1. **Propósito.** Bloquear la app cuando la prueba gratuita venció, con mensaje distinto para admin y empleado.
2. **Cómo se llega / quién la ve.** `App.tsx` la muestra cuando la prueba venció. Variante **empleado** (`isAdmin=false`) y variante **admin** (`isAdmin=true`).
3. **Layout.** Pantalla completa centrada, fondo degradado claro. Ícono `lock_clock` ámbar, título "Tu prueba gratuita terminó", mensaje y, al pie, "Cerrar sesión".
4. **Contenido mostrado.** Mensaje según rol. El elemento destacado es el ícono + título.
5. **Acciones.**
   - **Empleado:** solo "Cerrar sesión". Mensaje: "Pídele al administrador que renueve la suscripción para seguir usando BistroPOS."
   - **Admin:** botón ámbar primario **"Hablar con soporte"** (abre `SupportChatWidget`) + "Cerrar sesión". Mensaje: "Tu periodo de prueba de BistroPOS ya venció. Habla con soporte...".
6. **Estados.** Chat de soporte abierto/cerrado (solo admin). Depende de `isOnline` para el widget.
7. **Modales/paneles.** `SupportChatWidget` (chat de soporte reducido, solo admin).
8. **Textos clave.** "Tu prueba gratuita terminó", "Hablar con soporte", "Cerrar sesión".
9. **Componentes.** `SupportChatWidget`.
10. **Problemas visuales.** El empleado queda sin salida salvo "Cerrar sesión"; es intencional, pero visualmente es una pantalla muy vacía.

---

## 22. Guarda: Plan personalizado vencido (CustomPlanBlockedScreen)

**Archivo:** `components/CustomPlanBlockedScreen.tsx` (sin `Screen` propio)

1. **Propósito.** Bloquear a un negocio con plan personalizado que agotó la gracia, dándole un botón para pagar y reactivar al instante.
2. **Cómo se llega / quién la ve.** `App.tsx` la muestra para admin con plan personalizado vencido (el empleado va a la pantalla neutra "contacta a soporte").
3. **Layout.** Pantalla completa centrada, fondo claro. Ícono `lock_clock` ámbar, título "Tu suscripción está vencida", mensaje, una **`CustomPlanCard`** con el monto y botón de pago, y al pie "Cerrar sesión".
4. **Contenido mostrado.** El monto del plan en la card es el dato destacado.
5. **Acciones.** Botón **"Pagar ahora"** dentro de `CustomPlanCard` (`onPay`); "Cerrar sesión".
6. **Estados.** `isSubmitting` mientras procesa el pago.
7. **Modales/paneles.** Widget de pago (vía la card).
8. **Textos clave.** "Tu suscripción está vencida", "Renueva para volver a operar. El pago reactiva tu negocio al instante.".
9. **Componentes.** `CustomPlanCard`.
10. **Problemas visuales.** Comparte casi todo el layout con `TrialExpiredScreen` (mismo ícono y estructura); un diseñador puede unificarlas en un patrón de "pantalla de bloqueo" reutilizable.

---

## 23. Pública: Recibo (PublicReceiptScreen)

**Archivo:** `screens/PublicReceiptScreen.tsx` (ruta pública `/t/<numero>-<hash>`, sin sesión)

1. **Propósito.** Mostrar el recibo de una venta a un cliente que abre un enlace compartido, con opción de descargar PDF.
2. **Cómo se llega / quién la ve.** Enlace público (URL `/t/...`). Cualquiera con el enlace; no requiere login.
3. **Layout.** Pantalla centrada, fondo gris claro. Una **tarjeta de recibo** (`max-w-md`) con: header verde (logo, nombre del negocio, dirección, teléfono, NIT), bloque "Factura #N" + fecha + cliente, lista de ítems, totales, botón de descarga y pie "Powered by BistroPOS".
4. **Contenido mostrado.** Número de factura (grande, negro), ítems con cantidad/precio, subtotal, descuento, total (grande), método de pago, pagado/cambio, abono inicial y saldo si aplica. El dato destacado es el **Total**.
5. **Acciones.** Botón **"Descargar PDF"** (verde, ícono `download`; dice "Generando PDF..." mientras procesa).
6. **Estados.**
   - **Cargando:** spinner verde.
   - **Error:** ícono `error` + "Factura no encontrada" / "No se pudo cargar la factura" + "El enlace puede haber expirado o ser incorrecto.".
7. **Modales/paneles.** Ninguno.
8. **Textos clave.** "Factura", "Consumidor Final", "Subtotal", "Descuento", "Total", "Descargar PDF", "Powered by BistroPOS".
9. **Componentes.** `ReceiptThermalPDF` (lazy); `supabase.rpc('get_public_receipt')`.
10. **Problemas visuales.** El header es **verde** (no ámbar), coherente con el recibo pero distinto a la paleta ámbar del resto de la app; es la "cara pública" del negocio y conviene saber que no sigue el acento ámbar.

---

## 24. Pública: Estado de cuenta del cliente (PublicClientHistoryScreen)

**Archivo:** `screens/PublicClientHistoryScreen.tsx` (ruta pública `/ch/<token>`, sin sesión)

1. **Propósito.** Mostrar a un cliente su propio estado de cuenta (fiados y abonos) vía enlace, con opción de PDF.
2. **Cómo se llega / quién la ve.** Enlace público `/ch/...`. Cualquiera con el enlace.
3. **Layout.** Pantalla centrada, fondo gris claro (`max-w-md`). Header verde oscuro (`#102218`) con el nombre del negocio y "ESTADO DE CUENTA" + botón "Descargar PDF" (ámbar). Debajo, tarjeta del cliente (avatar con inicial, nombre, **saldo pendiente**), dos KPIs ("Total crédito" rojo / "Total abonado" verde) y la lista de **"Movimientos · N"** (cada uno "Crédito" rojo o "Abono" verde con fecha, monto e ítems).
4. **Contenido mostrado.** Saldo pendiente (número grande, rojo si > 0, verde si 0), totales de crédito y abono, y los movimientos. El dato destacado es el **saldo pendiente**.
5. **Acciones.** Botón **"Descargar PDF"** (ámbar; "PDF..." mientras genera).
6. **Estados.**
   - **Cargando:** spinner ámbar.
   - **Error:** ícono de alerta + "Enlace no válido" + "No se encontró el historial. El enlace puede haber expirado.".
7. **Modales/paneles.** Ninguno (usa `alert()` nativo si falla el PDF).
8. **Textos clave.** "ESTADO DE CUENTA", "Saldo pendiente", "Total crédito", "Total abonado", "Movimientos · N", "Generado por Bistro POS".
9. **Componentes.** `TransactionHistoryPDF` (lazy); `supabase.rpc('get_public_client_history')`.
10. **Problemas visuales.** Esta sí usa el acento **ámbar** en el header (sobre verde oscuro), a diferencia del recibo público (verde). Dos pantallas públicas con acentos distintos: inconsistencia a unificar. Usa `alert()` nativo para el error de PDF, que rompe el estilo de la app.

---

## 25. Empleados (Gestión de personal)

**Archivo:** `screens/EmployeesScreen.tsx` (`Screen.EMPLOYEES`)

> Nota de orden: esta ficha se agrega aquí por completitud (la pantalla "Empleados" es un destino real del router, ítem "Empleados" del sidebar). Pertenece al grupo **Equipo**, junto a Actividad (ficha 3).

1. **Propósito.** Administrar el personal del negocio: nómina/datos del equipo, quién puede entrar al POS y con qué permisos, y los roles con sus permisos.
2. **Cómo se llega / quién la ve.** Sidebar/drawer → "Empleados" (`badge`) → `Screen.EMPLOYEES`. Requiere `admin_users`.
3. **Layout.** **Header** blanco de 56px (`h-14`) que contiene únicamente un **conmutador de 3 pestañas** (grupo de píldoras tipo segmented control, fondo gris, la activa en ámbar con texto oscuro):
   - **"Personal y Nómina"** (ícono `badge`) — pestaña por defecto.
   - **"Acceso al POS"** (ícono `lock_person`).
   - **"Roles y Permisos"** (ícono `verified_user`).
   Debajo, el contenido con scroll (fondo gris claro). La vista "Acceso al POS" es de **dos columnas en desktop** (`lg:grid-cols-12`): a la izquierda (5/12) el **formulario de nuevo/editar empleado**, a la derecha (7/12) la **lista de empleados** (tarjetas apiladas en móvil/tablet, **tabla** en pantallas `xl`). La vista "Personal y Nómina" delega todo en el componente `PayrollStaffView`.
4. **Contenido mostrado.** Lista de empleados con avatar de iniciales (color por índice), nombre, chip de rol, teléfono (en la tabla desktop), y badges: **"Dueño"** (ámbar), **"Desactivado"** (rojo). En "Roles y Permisos": lista de roles con su conteo de empleados y los permisos agrupados en 4 categorías (Punto de Venta, Inventario, Finanzas, Administración). El elemento destacado es la **lista/tabla de empleados** y, en roles, la **grilla de permisos** con checkboxes.
5. **Acciones.**
   - **Pestañas** (Personal y Nómina / Acceso al POS / Roles y Permisos).
   - **Nuevo empleado:** formulario con nombre, teléfono (`PhoneInput`), selector de **"Rol *"** (dropdown con ícono `badge`), enlace **"Ajustar permisos de este empleado"** (ícono `tune`, abre modal de permisos iniciales), y botón **"Guardar Empleado"** / **"Actualizar Empleado"** (ámbar, ícono `save`; deshabilitado si falta nombre, teléfono o rol).
   - **Por empleado** (no para el dueño): botones **"Editar"**, **"Permisos"** (abre modal de permisos del empleado), **"Pausar"/"Activar"** (activar/desactivar, no disponible sobre uno mismo) y **"Eliminar"** (rojo).
   - **Roles:** crear rol, editar permisos de un rol (grilla de checkboxes por categoría), eliminar rol (bloqueado para roles del sistema o con empleados asignados).
   - **Banner Plan Estándar:** si el plan es estándar, muestra "Plan Estándar (N/3 usuarios)" + botón **"Mejorar"** (abre `UpgradeProModal`). Al intentar crear por encima del límite (`maxEmployees`) también abre el modal.
6. **Estados.**
   - **Sin conexión:** pantalla completa con ícono `wifi_off` ámbar, "Sin conexión" y "La gestión de personal requiere internet para cargar empleados y roles." Las acciones muestran toasts "Necesitas internet para gestionar empleados".
   - **Cargando:** `ScreenLoader`.
   - **Lista vacía:** ícono `group_off` + "No hay empleados registrados".
   - **Guardando:** spinner `progress_activity` en el botón.
   - **Errores por toast:** "Ya existe un rol con ese nombre", "No tienes permisos para crear roles", "No se puede eliminar un rol con empleados asignados", "No se pueden eliminar roles del sistema".
7. **Modales/paneles.** Modal **"Permisos: [nombre]"** (permisos efectivos del empleado, con badge "Automático" para permisos heredados y "Personalizado" si tiene overrides; botones "Restablecer a rol" y "Guardar"), modal **"Ajustar Permisos Iniciales"** (al crear), `UpgradeProModal`, `ConfirmDialog` (eliminar empleado/rol, cambios de permisos de rol que afectan a N empleados).
8. **Textos clave.** "Personal y Nómina", "Acceso al POS", "Roles y Permisos", "Rol *", "Guardar Empleado", "Actualizar Empleado", "Ajustar permisos de este empleado", "Permisos: [nombre]", "Rol base:", "Automático", "Personalizado", "Restablecer a rol", "Dueño", "Desactivado", "No hay empleados registrados", "Plan Estándar (N/3 usuarios)".
9. **Componentes.** `PayrollStaffView`, `UpgradeProModal`, `ScreenLoader`, `PhoneInput`; hooks `usePlanFeatures`, `useAuth`, `useConfirmDialog`, `useToast`. Datos directos vía `supabase` (tablas `roles`, `profiles`).
10. **Problemas visuales.** La pantalla concentra tres funciones muy distintas (nómina, accesos, roles) bajo un mismo header de pestañas; la densidad es alta. Las etiquetas de pestaña ("Acceso al POS") no coinciden del todo con el nombre del menú ("Empleados"), lo que puede desorientar sobre dónde se gestiona cada cosa. En desktop la lista cambia de tarjetas a tabla recién en el breakpoint `xl` (muy ancho); en tablet-desktop intermedio sigue en tarjetas.

---

## Guardas sin ficha propia (resumen)

- **Pantalla neutra "contacta a soporte"** (empleado con plan personalizado vencido): mensaje "Tu suscripción está vencida — comunícate con soporte" + "Cerrar sesión". Confirmada en `App.tsx` como fallback cuando el empleado no puede pagar.
- **"Error al cargar perfil"** (sesión sin perfil tras reintentos): botones "Reintentar" y "Cerrar sesión". En `App.tsx`.
- **`GracePeriodBanner`** (periodo de gracia de 48h): banner fijo arriba, no bloquea; admin ve botón de pago. `components/GracePeriodBanner.tsx`. (Detalle de navegación en `01-mapa-general.md`.)

## Excluido de este documento (una línea c/u)

- `TrainingScreen` / `Screen.TRAINING` — montada pero oculta en los menús (`access:false`).
- `ContingencyDocScreen` / `Screen.CONTINGENCY_DOC` — oculta temporalmente (`false &&`).
- `BulkUploadScreen` / `Screen.BULK_UPLOAD` — importación Excel marcada como oculta en producto.
- Pantallas de **venta** (`SellScreen`, `MenuScreen`, `PaymentScreen`, `SuccessScreen`, `PhotoOrderScreen`, `CashRegisterScreen`, `TablesScreen`, `HomeScreen`, `SalesScreen` como flujo de venta) — documentadas en `02-pantallas-venta.md`.
- Tabla "Ingredientes del Servicio" en `ServiceProductScreen` — bloque oculto (`false &&`), no se ve hoy.
