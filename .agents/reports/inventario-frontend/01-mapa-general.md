# Parte 1 — Mapa general de Bistro POS

Este documento explica **quién usa la app, qué ve cada tipo de usuario, cómo se navega y cuál es el recorrido de un día normal**. Es la vista "de arriba" antes de entrar a cada pantalla una por una.

Bistro POS tiene **dos pieles distintas** según el dispositivo:

- **Escritorio (desktop):** barra lateral fija a la izquierda (sidebar) + contenido a la derecha.
- **Móvil / tablet pequeña:** no hay sidebar visible; se usa un **menú hamburguesa que abre un cajón lateral (drawer)**, una **barra de navegación inferior flotante** y una pantalla de **Inicio** propia.

El cambio entre una y otra es automático según el ancho de la ventana (el corte principal es 768px: por debajo es "móvil").

---

## 1. Quién usa la app (roles) y qué ve cada uno

Hay **cuatro roles** definidos (`types.ts`, tipo `UserRole`):

| Rol | Para qué se usa (uso típico en un negocio) |
|-----|---------------------------------------------|
| **Administrador** | Dueño o encargado. Ve todo. Es "súper admin": salta los permisos y accede a todas las pantallas. |
| **Cajero** | Vende, cobra, abre y cierra turno de caja. |
| **Mesero** | Toma pedidos (por mesa u orden rápida). |
| **Cocinero** | Rol existente, pensado para cocina; en la práctica tiene el acceso más limitado. |

### Cómo se decide qué ve cada quien: permisos, no roles

Lo que oculta o muestra pantallas y botones **no es el rol directamente, sino un conjunto de permisos** (`profile.permissions`, un diccionario de `permiso: true/false`). El rol solo actúa como atajo:

- **Administrador** → es `isSuperAdmin`; ve y entra a todo sin importar permisos (`usePermissions.ts`).
- Para los demás roles manda el permiso puntual. Si el perfil todavía no cargó permisos, hay un *fallback* por rol: Cajero y Mesero reciben `pos_view` (pueden vender), el resto queda bloqueado.

Permisos clave y qué desbloquean (confirmado en `usePermissions.ts` → `canAccessScreen`):

| Permiso | Desbloquea | Pantallas afectadas |
|---------|-----------|---------------------|
| `pos_view` | Vender | Punto de Venta, Mesas, Orden Rápida, Pago, Menú |
| `pos_sell` | Finalizar/cobrar la venta (si no está, hereda de `pos_view`) | botón de cobro; Escanear fotolista (`PHOTO_ORDER`) |
| `pos_open` | Abrir turno de caja (hereda de `pos_view` si no está) | Caja / Turno |
| `pos_close` | Cerrar turno / arqueo | Caja / Turno |
| `admin_reports` | Reportes | Estadísticas (Dashboard), Historial de ventas (también con `pos_view`), Proveedores y Clientes como herencia |
| `inv_view` / `inv_create` / `inv_stock` | Inventario y catálogo | Productos (`inv_view`/`inv_create`), Inventario (`inv_view`/`inv_stock`) |
| `admin_users` | Equipo | Empleados; Actividad (también con `admin_settings`) |
| `admin_settings` | Configuración | menú "Ajustes" (Facturación e Impresión, Activar/Desactivar); Documentos Contables; Actividad |
| `clients_view` | Cuentas por cobrar | Clientes (si no está fijado, hereda de `pos_view` o `inv_view`) |
| `debts_view` | Cuentas por pagar | Proveedores (si no está fijado, hereda de `admin_reports` o `pos_close`) |

Traducido a lo que el diseñador verá en pantalla:

- **Cajero típico** (`pos_view`, `pos_open`, `pos_close`): ve Punto de Venta, Historial de ventas, Caja/Turno, y normalmente Clientes. No ve Empleados, Estadísticas ni Ajustes.
- **Mesero típico** (`pos_view`): ve Punto de Venta y poco más. No ve gestión ni configuración.
- **Administrador:** ve el menú completo (todas las secciones).

> **Importante sobre el bloqueo por permisos:** el filtrado se hace **ocultando el ítem del menú**, no mostrándolo deshabilitado. En el sidebar, cada ítem se arma con una propiedad `access` y luego se aplica `.filter(item => item.access)` — si no tiene acceso, el botón simplemente no se dibuja (`Sidebar.tsx`).

### Botones que no dependen del rol sino del plan de suscripción

Dos ítems se muestran siempre pero con un **badge "PRO"** si el plan no los incluye, y al tocarlos abren un modal de "mejora tu plan" (`UpgradeProModal`) en vez de entrar:

- **Inventario** → requiere `canUsePhysicalInventory`. Sin el plan, muestra badge **PRO** y abre el modal "Auditoría y Conteo Físico de Stock".
- **Mesas** (dentro de Punto de Venta) → requiere `canUseTables`. Sin el plan, badge **PRO** y modal "Mapa de Salones y Mesas".

### El Asistente IA y Suscripciones no los ve cualquiera

- **Asistente IA** (`RAG_CHAT`): visible en entorno de desarrollo y, en producción, **solo para un negocio específico** (regla `canSeeAiAssistant`, `lib/specialBusinesses.ts`). No es un permiso de rol.
- **Suscripciones** (ítem "Suscripción" en el menú de perfil): solo lo ve el administrador (`admin_settings`) **y** únicamente el negocio de pruebas legado o un negocio con plan personalizado (`canSeeSubscriptionMenu`). Para la mayoría de negocios **ese ítem no aparece**.

---

## 2. Árbol de navegación completo

### 2.1. Sidebar de escritorio (`components/Sidebar.tsx`)

Barra vertical fija a la izquierda. Puede estar **expandida (ancho 256px / `w-64`)** o **colapsada (ancho 64px / `w-16`, solo íconos)**. Arriba del todo hay un **bloque de perfil del negocio**; abajo del todo, una zona fija de utilidades.

Estructura de arriba a abajo:

```
┌───────────────────────────────┐
│ [Nombre del negocio]       ▾   │  ← botón de perfil (abre dropdown)
│  nombre/email del usuario      │     dropdown: "Mi Perfil", "Suscripción"*, "Cerrar Sesión"
├───────────────────────────────┤
│ OPERACIONES              ▾     │  ← sección plegable
│   payments   Punto de Venta    │
│   receipt_long  Historial de…  │  (solo si puede finalizar ventas)
│                                │
│ GESTIÓN                  ▾     │  ← sección plegable
│   shopping_bag  Productos      │
│   inventory  Inventario   [PRO]│
│   grid_view  Estadísticas      │
│   groups  Clientes             │
│   account_balance_wallet  Prov.│
│                                │
│ EQUIPO                   ▾     │  ← sección plegable
│   badge  Empleados             │
│   monitoring  Actividad        │
│   school  Capacitación         │  (access:false → NO se muestra hoy)
├───────────────────────────────┤  ← zona fija inferior
│   smart_toy  Asistente IA      │  (solo negocios habilitados)
│   print  Impresora             │  (solo roles SIN admin_settings)
│   settings  Ajustes      ▾     │  (solo con admin_settings)
│       Facturación e Impresión  │
│       Activar/Desactivar       │
│   left_panel_close (colapsar)  │
└───────────────────────────────┘
```

Orden exacto de los ítems de menú, con su **ícono Material Symbols** (nombre tal cual) y su **etiqueta de texto tal cual aparece en el JSX**:

**Sección "Operaciones"**
1. `payments` — **"Punto de Venta"** → navega a `Screen.SELL` (también queda activo en `QUICK_ORDER`).
2. `receipt_long` — **"Historial de ventas"** → `Screen.SALES`. Solo si `canAccessScreen(SALES)` **y** `canFinalizeSale()`.

**Sección "Gestión"**
3. `shopping_bag` — **"Productos"** → `Screen.PRODUCTS`.
4. `inventory` — **"Inventario"** → `Screen.INVENTORY`. Lleva badge **"PRO"** si no hay inventario físico en el plan.
5. `grid_view` — **"Estadísticas"** → `Screen.DASHBOARD`.
6. `groups` — **"Clientes"** → `Screen.CLIENTS`.
7. `account_balance_wallet` — **"Proveedores"** → `Screen.DEBTS`. (Nota: el ítem se etiqueta "Proveedores" aunque el `Screen` se llame `DEBTS` / cuentas por pagar.)

**Sección "Equipo"**
8. `badge` — **"Empleados"** → `Screen.EMPLOYEES`.
9. `monitoring` — **"Actividad"** → `Screen.ACTIVITY`.
10. `school` — **"Capacitación"** → `Screen.TRAINING`. **Tiene `access: false`, así que hoy NO se dibuja** (ítem oculto/pendiente).

**Zona fija inferior**
- `smart_toy` — **"Asistente IA"** → `Screen.RAG_CHAT`. Solo negocios habilitados. Puede llevar un punto rojo (`ragUnreadCount`) o un punto ámbar (conversación activa).
- `print` — **"Impresora"** → abre el panel `PrinterSettingsPanel`. **Solo** para roles **sin** `admin_settings` (para no duplicar con Ajustes).
- `settings` — **"Ajustes"** (solo con `admin_settings`) → despliega dos sub-opciones:
  - **"Facturación e Impresión"** → abre panel lateral `SettingsSidebarPanel`.
  - **"Activar/Desactivar"** → abre panel lateral `SalesModeSettingsPanel` (modo de venta: catálogo / escáner).
- `left_panel_close` — botón para **colapsar/expandir** el sidebar (solo si `canCollapse`).

Las tres secciones (Operaciones, Gestión, Equipo) son **plegables**: su encabezado es un botón con un chevron `expand_more` que rota. Empiezan abiertas.

**Dropdown del perfil (arriba):** al hacer clic en el bloque del negocio se abre un menú con: **"Mi Perfil"** (`account_circle` → `Screen.PROFILE`), **"Suscripción"** (`workspace_premium` → `Screen.SUBSCRIPTION_MANAGEMENT`, solo si `canShowSubscription`) y **"Cerrar Sesión"** (`logout`, texto en rojo).

### 2.2. Barra de navegación inferior móvil (`components/MobileNavBar.tsx`)

Barra **flotante** anclada abajo, centrada, con esquinas redondeadas y fondo blanco translúcido con blur. Es la navegación principal en móvil y se muestra en casi todas las pantallas (en Inicio la renderiza la propia `HomeScreen`).

Ítems, en orden (de izquierda a derecha), con ícono y etiqueta exactos:

1. `home` — **"Inicio"** → `Screen.HOME`.
2. `point_of_sale` — **"Vender"** → `Screen.SELL` (activo también en `QUICK_ORDER`).
3. `calculate` — **"Turno"** → abre `Screen.CASH_REGISTER` (panel de caja). Lleva un **punto indicador**: verde si hay turno abierto, gris si está cerrado.
4. `auto_awesome` — **"Ayuda"** → `Screen.RAG_CHAT`. **Solo** aparece en negocios habilitados para el asistente. Lleva un **badge rojo** con mensajes IA sin leer.

El ítem activo se pinta con **fondo ámbar (`bg-amber-400`) y texto oscuro en negrita**; los inactivos van en gris.

### 2.3. Drawer móvil (cajón lateral)

Se abre con el menú hamburguesa. Es un panel que entra desde la izquierda (ocupa todo el ancho en teléfonos muy angostos, 320px en pantallas algo mayores) y se puede **cerrar deslizando hacia la izquierda** (gesto táctil con umbral de 80px). Tiene tres vistas internas (`activeMobilePanel`): **main**, **profile** y **settings**.

Vista principal (**main**) de arriba a abajo:

```
┌──────────────────────────────┐
│ [Nombre del negocio]          │
│ [avatar] Usuario / ROL    ✕   │  ← ✕ cierra el drawer
├──────────────────────────────┤
│ GESTIÓN                       │
│   inventory  Inventario  [PRO]│
│ EQUIPO                        │
│   badge  Empleados            │
│   monitoring  Actividad       │
│   school  Capacitación (oculto)│
│ ──────────────                │
│   print  Impresora            │  (roles sin admin_settings)
│   settings  Configuración  ▾  │  (con admin_settings)
│       receipt_long Facturación e Impresión
│       toggle_on   Activar/Desactivar
└──────────────────────────────┘
```

Notas confirmadas:
- El drawer móvil **no repite** Punto de Venta / Vender / Turno (eso vive en la barra inferior). Concentra **Gestión** (Inventario), **Equipo** (Empleados, Actividad) y **configuración**.
- "Capacitación" (`school` → `TRAINING`) aparece listado pero con `access: false`: **no se muestra**.
- "Documentos Contables" (`description` → `CONTINGENCY_DOC`) está en el código pero envuelto en `false &&`: **oculto temporalmente**.
- Vista **profile** (sub-pantalla con botón "atrás"): título "Mi Perfil", botón **"Detalles de cuenta"** (`person` → `Screen.PROFILE`), botón **"Mi Suscripción"** (`card_membership` → `Screen.SUBSCRIPTION_MANAGEMENT`, solo si `canShowSubscription`) y al pie **"Cerrar Sesión"** (`logout`, en rojo).

### 2.4. Header

No hay un header global único; cada contexto trae el suyo:

- **Escritorio, pantallas de venta** (`SELL`, `TABLES`, `MENU`, `QUICK_ORDER`): barra superior de pestañas `GlobalSellTabs` (alto 56px / `h-14`), **centrada**, con las pestañas:
  - **"Egresos"** (`payments`, botón rojo) — solo con permiso `inv_purchase`; despliega un menú (gastos / inventario / mermas / "Foto a factura").
  - **"Mesas"** (`table_restaurant`, botón verde) — solo si el modo mesas está activo; badge **PRO** si el plan no lo incluye.
  - **"Orden"** (`orden_rapida`, botón ámbar).
  - La pestaña `SELL` tiene sus propios tabs internos (no usa `GlobalSellTabs`).
- **Móvil, pantalla de Inicio** (`HomeScreen`): header blanco propio con el **nombre del negocio** a la izquierda (y botón que abre el drawer) y una campana `notifications` a la derecha.
- Resto de pantallas (gestión, perfil, etc.): cada una trae su propio encabezado interno (título + botón volver donde aplica). **SUPOSICIÓN:** el detalle de cada header interno se documenta en las fichas de las partes 2 y 3.

---

## 3. Flujos principales

### 3.1. Día normal: abrir caja → vender → cobrar → cerrar caja

```
  ABRIR TURNO            VENDER                 COBRAR                CERRAR TURNO
 ┌───────────┐        ┌───────────┐         ┌───────────┐          ┌───────────┐
 │ Turno/Caja│        │ Punto de  │         │  Pago     │          │ Turno/Caja│
 │ (panel)   │───────▶│  Venta    │────────▶│ (PAYMENT) │─────────▶│  arqueo    │
 │ abre base │        │ (SELL /   │         │ método +  │   éxito  │ y cierre   │
 └───────────┘        │  MENU)    │         │ confirmar │   ┌────┐ └───────────┘
       ▲              └───────────┘         └───────────┘   │SUCCESS│
       │                                                     └────┘
   calculate "Turno"                                     recibo / nueva venta
```

Paso a paso, con las pantallas/paneles reales que se tocan:

1. **Abrir turno:** desde la barra inferior móvil (ítem **"Turno"**, `calculate`) o automáticamente al intentar vender sin turno. Abre el panel lateral derecho **Caja / Turno** (`Screen.CASH_REGISTER`, componente `CashRegisterScreen`), donde se registra la base inicial. Requiere poder abrir turno (`pos_open`/`pos_view`).
2. **Vender:** en **Punto de Venta** (`Screen.SELL`). Según el modo del negocio:
   - **Modo catálogo:** grilla de productos (`MENU`/`SELL`) + carrito. Se arma el pedido tocando productos. Puede ser Orden Rápida (`QUICK_ORDER`), por Mesa (`TABLES` → `MENU` con la mesa activa) o Domicilio.
   - **Modo escáner:** entrada por código de barras / **Escanear fotolista** (`PHOTO_ORDER`, `PhotoOrderScreen`), que arma la venta a partir de una foto.
   - Si no hay turno abierto, la app avisa ("Primero abre un turno de caja") y abre el panel de Caja.
3. **Cobrar:** pantalla/panel **Pago** (`Screen.PAYMENT`, `PaymentScreen`): se elige método (efectivo, tarjeta, transferencia, crédito, pagos divididos), se confirma. En escritorio es un panel lateral derecho; en móvil cubre la pantalla.
4. **Éxito:** pantalla **Éxito** (`Screen.SUCCESS`, `SuccessScreen`): confirma la venta, ofrece recibo/impresión y "nueva venta".
5. **Cerrar turno:** de nuevo el panel **Caja / Turno**, ahora en modo arqueo/cierre (requiere `pos_close`): se declaran los montos por método de pago y se genera el **reporte diario** del turno.

### 3.2. Primer uso: registro / onboarding

```
  REGISTER ──────────────▶ (teléfono) ──▶ (código OTP) ──▶ PIN de acceso ──▶ app
     │                      enter_phone      enter_otp        (paso 3)
     │ "Registrarse con Google"
     └──────────────────────────────────────────────────────────▶ app

  Tras registrarse (just_registered) ──▶ SUBSCRIPTION_PLANS (bienvenida / elegir plan)
```

Confirmado en `screens/RegisterScreen.tsx` y en el router de `App.tsx`:

1. **Pantalla de Registro** (`Screen.REGISTER`, `RegisterScreen`). Dos caminos:
   - **Teléfono + SMS OTP:** el usuario escribe el teléfono (`enter_phone`, botón **"Enviar Código"** con ícono `send`), recibe un SMS y lo digita en 6 casillas (`enter_otp`, ícono `sms`, botón **"Verificar"**). Hay un stepper visual de 3 pasos: **"Teléfono"**, (verificación) y **"PIN de acceso"**.
   - **Google:** botón **"Registrarse con Google"** (`signInWithGoogle`).
   - Mensaje de gancho visible: **"7 días gratis · Sin tarjeta de crédito"**.
2. **Redirect post-registro:** al autenticarse, si existe la marca `just_registered` en `localStorage`, `App.tsx` lleva al usuario a **`Screen.SUBSCRIPTION_PLANS`** (pantalla de bienvenida / elegir plan). Si no, va directo a **`Screen.SELL`**.
3. **Perfil incompleto:** si es Administrador y el nombre del negocio todavía es el autogenerado (termina en `'s Business`), la app lo fuerza a **`Screen.PROFILE`** para completar datos.

### 3.3. Guardas de acceso (orden en que `App.tsx` decide qué mostrar)

Antes de dejar ver la app, `App.tsx` evalúa en este orden:

1. **Cargando** (`loading`) → `AppLoader`.
2. **Sin sesión** (`!user && !profile`) → pantallas de auth: **Login** (`LoginScreen`), **Registro** (`RegisterScreen`) o **Olvidé contraseña** (`ForgotPasswordScreen`).
3. **Sesión pero sin perfil** → `AppLoader`, y tras varios reintentos una pantalla de error **"Error al cargar perfil"** con botones **"Reintentar"** y **"Cerrar sesión"**.
4. **Verificando suscripción** (`hasActiveSubscription === null`) → `AppLoader`.
5. **Suscripción vencida** (`hasActiveSubscription === false`), según el caso:
   - **Plan personalizado + admin que puede pagar** → `CustomPlanBlockedScreen` (card con monto y botón **Pagar**).
   - **Plan personalizado + empleado sin `admin_settings`** → pantalla neutra **"Tu suscripción está vencida — Comunícate con soporte"** + "Cerrar sesión".
   - **Prueba vencida + empleado** → `TrialExpiredScreen` (avisar al administrador).
   - **Prueba vencida + admin / usuario nuevo** → banner (**"¡Bienvenido a BistroPOS! Elige un plan…"** si es nuevo, o **"Tu periodo de prueba de 7 días ha terminado…"**) + `SubscriptionPlansScreen` para pagar.
6. **En periodo de gracia** (48h post-vencimiento): no bloquea, pero fija arriba el **`GracePeriodBanner`** (admin ve botón pagar; cajero ve banner informativo; mesero no lo ve).
7. **OK** → se monta la app completa (Sidebar + contenido + navegación).

---

## Lista confirmada de pantallas conectadas

Estas son las pantallas que **realmente se montan** en el router de `App.tsx` (bloques `currentScreen === Screen.X && …`). Marcadas como VENTA vs GESTIÓN/GUARDAS para orientar las fichas de las partes 2 y 3.

### Venta
- `SELL` — Punto de Venta (SellScreen)
- `MENU` — Catálogo + carrito (MenuScreen); comparte montaje con `QUICK_ORDER`
- `QUICK_ORDER` — Orden rápida (MenuScreen)
- `TABLES` — Mesas (deprecado como standalone: en móvil redirige a `SELL`; la vista real de mesas vive en SELL/MENU)
- `PAYMENT` — Pago (PaymentScreen)
- `SUCCESS` — Éxito / recibo (SuccessScreen)
- `PHOTO_ORDER` — Escanear fotolista (PhotoOrderScreen)
- `CASH_REGISTER` — Caja / Turno (CashRegisterScreen, panel lateral derecho)
- `SALES` — Historial de ventas (SalesScreen)

### Gestión / Guardas
- `HOME` — Inicio móvil (HomeScreen)
- `DASHBOARD` — Estadísticas (DashboardScreen)
- `PRODUCTS` — Productos (comparte montaje con creación/edición)
- `INVENTORY` — Inventario (InventoryScreen; con muro PRO si el plan no lo incluye)
- `CLIENTS` — Clientes / cuentas por cobrar (ClientsScreen)
- `DEBTS` — Proveedores / cuentas por pagar (DebtsScreen; etiqueta de menú "Proveedores")
- `EMPLOYEES` — Empleados (EmployeesScreen)
- `ACTIVITY` — Actividad (ActivityScreen)
- `CREATE_PRODUCT_SIMPLE` — Crear producto simple (SimpleProductScreen)
- `CREATE_PRODUCT_PROCESSED` — Crear producto procesado (ProcessedProductScreen)
- `CREATE_PRODUCT_SERVICE` — Crear producto servicio (ServiceProductScreen)
- `CREATE_PROMOTION` — Crear promoción (CreatePromotionScreen)
- `EDIT_PROMOTION` — Editar promoción (EditPromotionScreen)
- `BULK_UPLOAD` — Importación masiva Excel (BulkUploadScreen)
- `CREATE_FROM_INVOICE` — Crear productos desde factura (InvoiceCreateScreen)
- `PROFILE` — Perfil de usuario (ProfileScreen)
- `RAG_CHAT` — Asistente IA (RagChatScreen; solo negocios habilitados)
- `TRAINING` — Capacitación (TrainingScreen; montada en router pero oculta en los menús, `access:false`)
- `CONTINGENCY_DOC` — Documentos contables (ContingencyDocScreen; montada pero oculta `false &&` en menús)
- `SUBSCRIPTION_PLANS` — Elegir plan (SubscriptionPlansScreen; también usada como guarda de vencimiento)
- `SUBSCRIPTION_MANAGEMENT` — Mi suscripción (SubscriptionManagementScreen)
- `LOGIN` — Login (LoginScreen)
- `REGISTER` — Registro (RegisterScreen)
- `FORGOT_PASSWORD` — Olvidé contraseña (ForgotPasswordScreen)

### Guardas sin `Screen` propio (se renderizan por estado de suscripción, no por router)
- Pantalla de error **"Error al cargar perfil"**
- **`CustomPlanBlockedScreen`** (plan personalizado vencido, admin)
- Pantalla neutra **"Tu suscripción está vencida — contacta a soporte"** (empleado)
- **`TrialExpiredScreen`** (prueba vencida, empleado)
- Banner **`GracePeriodBanner`** (periodo de gracia)

### Excluido del inventario (código muerto / oculto / herramientas, una línea c/u)
- `Screen.TRAINING` — montada pero sin punto de entrada visible (menús con `access:false`).
- `Screen.CONTINGENCY_DOC` — oculta temporalmente (`false &&` en sidebar/drawer; ver `ajustes_facturacion.md`).
- `BulkUploadScreen` / `Screen.BULK_UPLOAD` — importación Excel marcada como oculta temporalmente en el producto.
- Carpetas `/mockups` y `/rediseño*` — material de diseño, no es la app real. **SUPOSICIÓN** (excluidas por consigna, no verificadas en este paso).

> **SUPOSICIÓN:** `Screen.MENU` nunca aparece como ítem de menú; se alcanza desde el flujo de venta (al entrar a una mesa o al catálogo). `TABLES` como pantalla standalone está marcada "DEPRECATED" y en móvil redirige a `SELL`.

---

## Capturas

**Resultado: SÍ se tomaron capturas reales.** 16 imágenes PNG en la carpeta `inventario-capturas/`, tomadas con Playwright-MCP sobre la app en ejecución (`npm run dev` en `localhost:3000`) con **sesión autenticada** en el negocio de ejemplo "Tienda de la Esquina" (rol Administrador). Ver el índice detallado en `inventario-capturas/README.md`.

- **Desktop:** 1440×900. **Móvil:** 390×844.
- Fecha: 1 de octubre de 2026.

### Capturas logradas (16)

| Archivo | Pantalla | Vista |
|---|---|---|
| `01-login-desktop.png` | Login (3 métodos: PIN/SMS/Google) | Desktop |
| `02-venta-pos-desktop.png` | Punto de Venta (SellScreen) | Desktop |
| `02-venta-pos-movil.png` | Punto de Venta | Móvil |
| `03-dashboard-desktop.png` | Estadísticas (Dashboard, full page) | Desktop |
| `04-productos-desktop.png` | Productos | Desktop |
| `05-inventario-desktop.png` | Inventario | Desktop |
| `06-clientes-desktop.png` | Clientes | Desktop |
| `07-empleados-desktop.png` | Empleados | Desktop |
| `08-historial-ventas-desktop.png` | Historial de ventas | Desktop |
| `09-actividad-desktop.png` | Actividad (visor de eventos) | Desktop |
| `09-actividad-movil.png` | Actividad | Móvil |
| `10-inicio-movil.png` | Inicio (HomeScreen, solo móvil) | Móvil |
| `11-pos-movil-elige-categoria.png` | POS — estado vacío "Elige una categoría" | Móvil |
| `12-pos-movil-productos.png` | POS — grilla tras elegir categoría | Móvil |
| `13-pos-carrito-lleno-desktop.png` | POS — carrito con 2 ítems, total $8.200 | Desktop |
| `14-pago-cobro-desktop.png` | Pago / Cobro (tras "Procesar Pago") | Desktop |

**Hallazgo de UX durante la captura:** el POS móvil muestra un empty state "Elige una categoría" y obliga a seleccionar categoría antes de ver productos; el desktop muestra toda la grilla de inmediato. Comparar `11-pos-movil-elige-categoria.png` con `02-venta-pos-desktop.png`.

### Capturas pendientes (ampliación opcional)
El entorno de captura quedó configurado y funcional (Playwright-MCP + login), así que una segunda pasada puede completar sin fricción:
- **RegisterScreen, ForgotPasswordScreen** (públicas, sin login).
- **Rutas públicas** PublicReceiptScreen (`/t/...`) y PublicClientHistoryScreen (`/ch/...`): requieren un token/ID real de venta o cliente.
- **Modales individuales** (crear producto, descuento, crear cliente, confirmaciones) y pantallas de **Suscripción, Perfil, Asistente IA, creación de productos/promos**.

---

## Excluido (una línea por ítem)

Pantallas y recursos que **sí existen en el repositorio pero NO forman parte del inventario** porque el usuario final no los ve o no son la app real:

- **LandingScreen** (`screens/LandingScreen.tsx`) — código muerto: se importa (lazy) en `App.tsx` pero **nunca se renderiza** como JSX en ningún punto del router.
- **BulkUploadScreen** (`Screen.BULK_UPLOAD`) — importación masiva por Excel: montada pero **oculta temporalmente** en el producto (sin punto de entrada visible en los menús).
- **ContingencyDocScreen** (`Screen.CONTINGENCY_DOC`) — Documentos Contables: el ítem de menú está envuelto en `{false && ...}` en `Sidebar.tsx`, así que **no se muestra**.
- **TrainingScreen** (`Screen.TRAINING`) — Capacitación: el ítem de menú tiene `access: false`, por lo que **nunca se dibuja**.
- **Screen.TABLES / Screen.MENU standalone** — marcadas DEPRECATED como pantallas independientes: `TABLES` en móvil **redirige a `SELL`** y la vista real de mesas/catálogo vive dentro de SELL/MENU; no son destinos de navegación propios.
- **PDFs `*.tsx`** (`ReceiptPDF`, `ReceiptThermalPDF`, `ShiftReportThermalPDF`, `TransactionHistoryPDF`, `TopProductsPDF`, `PayrollReceiptPDF`, `EmployeeReportPDF`) — plantillas de documento `@react-pdf`, **no son pantallas de UI** navegables; generan archivos.
- **TutorialDevManager / DeveloperAvailabilityPanel** (`components/rag/TutorialDevManager.tsx`, `components/DeveloperAvailabilityPanel.tsx`) — herramientas **solo para el desarrollador** (gateadas por `import.meta.env.DEV` o `VITE_DEVELOPER_EMAIL`); el usuario final no las ve.
- **/mockups** (`mockups/aviso-pago-gracias.html`) — material estático de diseño/plantilla, **no es la app real**.
- **/rediseño home** — material de rediseño (exploración de la pantalla de inicio), no es la app en producción. **SUPOSICIÓN**: no se encontró la carpeta con ese nombre en el workspace; se excluye por consigna.
- **/rediseño pos** — material de rediseño (exploración del POS), no es la app en producción. **SUPOSICIÓN**: no se encontró la carpeta con ese nombre en el workspace; se excluye por consigna.
