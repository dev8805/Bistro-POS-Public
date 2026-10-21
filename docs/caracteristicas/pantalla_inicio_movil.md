# Pantalla de Inicio Móvil (HomeScreen)

Componente: `screens/HomeScreen.tsx`  
Hook principal: `hooks/useHomeData.ts`  
Acceso: Pantalla inicial en móvil (`< 768px`). En tablet/desktop abre `SellScreen` directamente.

Pantalla de inicio del POS en dispositivos móviles. Muestra KPIs del día, accesos rápidos a los módulos principales y el estado de la caja, sin requerir navegar al menú.

---

## Comportamiento por dispositivo

| Dispositivo | Pantalla inicial |
|---|---|
| Móvil `< 768px` | `Screen.HOME` (esta pantalla) |
| Tablet / Desktop `≥ 768px` | `Screen.SELL` (redirige automáticamente vía `useEffect`) |

La detección usa `window.innerWidth` en el momento del montaje. El redirect es inmediato via `onNavigate(Screen.SELL)`.

---

## Secciones

### 1. Header
Avatar (foto de perfil o inicial del nombre), saludo con el primer nombre del usuario, nombre del negocio, y botón de notificaciones. Datos provenientes de `useAuth().profile`.

El avatar es un `<button>` que abre el **Profile Bottom Sheet** (ver sección siguiente). El texto del saludo y el nombre del negocio son solo informativos, sin interacción.

#### Profile Bottom Sheet

Se abre al pulsar el avatar/inicial. Es un bottom sheet con swipe-to-dismiss (arrastrando hacia abajo ≥ 80 px) y backdrop que cierra al tocarlo.

**Contenido:**

| Elemento | Condición | Acción |
|---|---|---|
| Avatar ampliado + nombre + email + badge de rol | Siempre | Solo informativo |
| **Mi Perfil** | Siempre | `onNavigate(Screen.PROFILE)` |
| **Mi Suscripción** | Solo si `isBusinessOwner` | `onNavigate(Screen.SUBSCRIPTION_MANAGEMENT)` |
| **Cerrar Sesión** | Siempre | `signOut()` |

`isBusinessOwner` se verifica al montar consultando `businesses.owner_id` vs `user.id` (mismo patrón que `Sidebar.tsx`).

**Interacción de swipe:**  
Usa el mismo sistema de `swipeOffset` / `swipeStartY` compartido por los sheets de Gastos y Abonos (nunca están abiertos simultáneamente). El listener de `touchmove` se registra con `{ passive: false }` para bloquear el pull-to-refresh del navegador mientras se arrastra el panel.

### 2. KPI Cards (scroll horizontal)

3 tarjetas en scroll horizontal sin scrollbar visible:

| Tarjeta | Dato | Fuente |
|---|---|---|
| **Ventas hoy** | Total de ventas del día + % vs ayer | `orders` filtrado por `status = 'completed'` y `completed_at >= hoy` |
| **Tickets** | Cantidad de ventas + promedio | Mismo query |
| **Por cobrar** | Suma de deuda activa de clientes | `clients.current_debt > 0` |

> **Cambio (2026-06):** debajo de los KPIs existían dos cards de acción, **Vender** y **Turno**. Se eliminaron porque duplicaban los tabs de la barra inferior. Para vender se usa el tab **Vender**; el estado del turno se ve en el indicador del tab **Turno** (ver § 7).

### 3. Finanzas (grid 2×2)

| Botón | Destino | Lógica especial |
|---|---|---|
| Gastos | Action sheet propio | Abre bottom sheet con opciones: "Compra de inventario", "Otros gastos", "Merma" → abre `ExpenseModal` |
| Abonos | Action sheet propio | Abre bottom sheet con opciones: "Abonos de Clientes", "Abonos a Proveedor" → abre `QuickTransactionModal` |
| Por Cobrar | `Screen.CLIENTS` | Muestra deuda acumulada en sub-label |
| Por Pagar | `Screen.DEBTS` | — |

### 4. Operación (grid 2×2)

| Botón | Ícono | Color | Destino | Lógica / Comportamiento responsivo |
|---|---|---|---|---|
| Escanear | `photo_camera` | violet-600 / violet-50 | `Screen.PHOTO_ORDER` | — |
| Historial | `receipt_long` | sky-600 / sky-50 | `Screen.SALES` | Solo visible si `canSeeKpis` |
| Productos | `shopping_bag` | orange-600 / orange-50 | `Screen.PRODUCTS` | — |
| Estadísticas | `bar_chart_4_bars` | indigo-600 / indigo-50 | `Screen.DASHBOARD` | Muestra **"Panel"** en pantallas móviles de `≤ 430px` para evitar truncamiento de texto. |

### 4b. Gestión (grid 2×2) — migrado desde drawer "Más" (2026-08)

Sección que reemplaza el acceso al drawer lateral móvil. Los items que antes estaban en el menú "Más" ahora viven directamente en HomeScreen, con navegación directa a su pantalla.

| Botón | Ícono | Color | Destino | Condición |
|---|---|---|---|---|
| Inventario | `inventory_2` | teal-600 / teal-50 | `Screen.INVENTORY` | `canAccessScreen(Screen.INVENTORY)` |
| Empleados | `badge` | pink-600 / pink-50 | `Screen.EMPLOYEES` | `canAccessScreen(Screen.EMPLOYEES)` |
| Actividad | `history` | cyan-600 / cyan-50 | `Screen.ACTIVITY` | `canAccessScreen(Screen.ACTIVITY)` |
| Configuración | `settings` | slate-600 / slate-100 | Action sheet (ver abajo) | `hasPermission('admin_settings')` |

#### Action sheet de Configuración

Al presionar "Configuración" se abre un bottom sheet (mismo patrón que Egresos/Abonos) con dos opciones:

| Opción | Ícono | Panel que abre |
|---|---|---|
| **Facturación e Impresión** | `print` | `SettingsSidebarPanel` (overlay fullscreen) |
| **Activar/Desactivar** | `toggle_on` | `SalesModeSettingsPanel` (overlay fullscreen) |

Los paneles se importan directamente en HomeScreen y se montan como overlays `fixed` con `isOpen`/`onClose`. No dependen del Sidebar.

### 5. Stock bajo (condicional, colapsable)
Aparece solo si `lowStockProducts.length > 0`. **Arranca colapsada (2026-06):** el encabezado (ícono ⚠ + "Stock bajo · N productos") es un botón que expande/colapsa la lista, con "Ver" / "Ocultar" y un chevron que rota. Estado local `showLowStock` (por defecto `false`) y `aria-expanded` dinámico. Al expandir, lista los productos con `stock <= min_stock * 1.5` y su badge de estado (Agotado / Bajo / Vigilar).

### 6. Últimas ventas (condicional)
Lista las ventas más recientes del día si `recentSales.length > 0`. Muestra número de venta, hora, método de pago e ícono del método. Enlaza a `Screen.SALES`.

### 7. Barra inferior (MobileNavBar)
Desde 2026-06, HomeScreen ya **no** tiene una nav inline propia: renderiza el componente compartido `components/MobileNavBar.tsx` (la misma barra que usa App.tsx en el resto de pantallas), con `currentScreen={Screen.HOME}`. Ver § "Barra inferior unificada" para tabs, estilo activo e indicadores.

---

## Hook useHomeData

Ubicación: `hooks/useHomeData.ts`

Ejecuta 7 queries en paralelo con `Promise.all` al montar:

| Query | Tabla | Filtros clave |
|---|---|---|
| ventas hoy | `orders` | `status = 'completed'`, `completed_at >= todayStart` (timezone CO) |
| ventas ayer | `orders` | mismo filtro, ventana de ayer — para calcular `changePercent` |
| caja activa | `cash_shifts` | `status = 'open'` + `business_id` |
| deuda clientes | `clients` | `current_debt > 0` |
| productos para stock | `products` | `is_active = true`, `stock` y `min_stock` no nulos |
| últimas ventas | `orders` | 4 más recientes completadas |
| gastos hoy | `expenses` | `expense_date = today` (timezone CO) |

El stock bajo se filtra **client-side** sobre `products` (no se puede hacer `stock <= min_stock` server-side en Supabase JS). Retorna hasta 50 productos y filtra los que tienen `stock <= min_stock * 1.5`.

### Caché offline (stale-while-revalidate)

Al montar, si existe un resultado previo en `localStorage` (`bistro_home_data_<businessId>`), se muestra inmediatamente con `loading: false` mientras se lanza el fetch en background. Cuando el fetch termina, actualiza el estado y sobreescribe el caché.

- **Clave**: `bistro_home_data_<businessId>`
- **En caso de error de red**: si hay caché, la pantalla sigue mostrando datos previos; si no hay caché, quita el spinner con ceros.
- **Sin impacto en primera carga online**: la respuesta fresca llega en ~1 seg y reemplaza los datos cacheados sin parpadeo visible.

#### Comportamiento offline (fix 2026-05-28)

`fetchAll` retorna anticipadamente si `!navigator.onLine` **antes** de lanzar los queries a Supabase. Esto resuelve un bug crítico: cuando la app está sin conexión, la librería supabase-js no lanza una excepción — devuelve `{ data: null, error: { message: "Failed to fetch" } }`, por lo que `Promise.all` resuelve normalmente. Sin el early-return, el código interpretaba los `null` como "turno cerrado" y sobreescribía el localStorage con `cashShift.isOpen: false`, haciendo que el turno activo "desapareciera" en la tarjeta de Caja.

Reglas de carga cuando offline:
1. Si hay caché → se muestra inmediatamente (`loading: false`) y `fetchAll` no se ejecuta.
2. Si no hay caché → se detiene el spinner y se muestran ceros (estado vacío inicial).
3. Al recuperar conexión → el listener del evento nativo `online` dispara `fetchAll` automáticamente para refrescar los datos.

> **Afectados:** `hooks/useHomeData.ts` — función `fetchAll` y los dos `useEffect` de carga.

---

## Tipografía (scoped)

Aplica tipografía v2 exclusivamente en esta pantalla mediante clases CSS inyectadas en un `<style>` inline:

| Clase | Familia | Uso |
|---|---|---|
| `.hm-display` | Plus Jakarta Sans | Títulos, labels de sección, CTAs |
| `.hm-body` | Noto Sans | Cuerpo, metadata, sub-labels |
| `.hm-mono` | JetBrains Mono | Cifras monetarias (`font-variant-numeric: tabular-nums`) |

El `<style>` **no incluye** `@import url(...)` — las tres familias ya están cargadas en `index.html` (líneas 27-29) y pre-cacheadas por el Service Worker. Incluir un `@import` en un `<style>` inyectado en runtime impediría que el SW lo interceptara en Chrome Android, rompiendo la carga offline de las fuentes y los iconos de Material Symbols (que dependen de la misma conexión).

Ver escala completa en [`design_system.md § 4`](../arquitectura/design_system.md).

---

## Props

| Prop | Tipo | Por defecto | Descripción |
|---|---|---|---|
| `onNavigate` | `(screen: Screen) => void` | requerido | Navega a otra pantalla |
| `ragUnreadCount` | `number` | `0` | Nº de mensajes IA sin leer → badge rojo en el tab "Ayuda" (se reenvía a `MobileNavBar`) |
| `isShiftOpen` | `boolean` | `false` | ¿Turno de caja abierto? → indicador verde/gris en el tab "Turno" |
| `isCashPanelOpen` | `boolean` | `false` | ¿Panel de Caja abierto? → resalta "Turno" como activo |
| `isOnline` | `boolean` | `true` | Controla el padding superior cuando el banner "Sin conexión" está visible |

Cuando `isOnline === false`, el contenedor principal aplica `pt-[32px]` para ceder espacio al `OfflineIndicator` (`fixed top-0`, ~32 px de alto) y evitar que tape el header.

## Integración con App.tsx

- `getInitialScreen()` retorna `Screen.HOME` si `window.innerWidth < 768`.
- App.tsx pasa `isOnline={isOnline}` a HomeScreen — misma variable que usan DebtsScreen, ClientsScreen, etc.
- **Barra inferior unificada (2026-06):** HomeScreen y App.tsx renderizan el **mismo** componente `components/MobileNavBar.tsx`. HomeScreen monta su propia instancia en `HOME`; App lo renderiza en el resto de pantallas móviles. Antes había dos navs inline duplicadas (una en HomeScreen, otra en App).
- HomeScreen integra directamente `ExpenseModal`, `QuickTransactionModal`, `SettingsSidebarPanel` y `SalesModeSettingsPanel` para los accesos rápidos de Gastos, Abonos y Configuración.

## Barra inferior unificada (`components/MobileNavBar.tsx`)

Componente único de barra inferior (`z-50`, `md:hidden`). Lo renderizan **App.tsx** (en todas las pantallas móviles excepto `HOME`, `PAYMENT`, `SUCCESS`, `LOGIN`, `REGISTER`, `FORGOT_PASSWORD`) y **HomeScreen** (instancia propia en `HOME`). 3-4 tabs (Ayuda es condicional):

| Tab | Ícono | Acción | Activo cuando |
|---|---|---|---|
| Inicio | `home` | `Screen.HOME` | `currentScreen === HOME` y sin panel abierto |
| Vender | `point_of_sale` | `Screen.SELL` | `currentScreen === SELL \| QUICK_ORDER` y sin panel abierto |
| Turno | `calculate` | `Screen.CASH_REGISTER` (panel) | `isCashPanelOpen` |
| Ayuda | `auto_awesome` | `Screen.RAG_CHAT` (widget flotante) | — (condicional: solo visible en dev o negocio 10000) |

> **Cambio (2026-08):** se eliminó el tab "Más". Las opciones que antes estaban en el drawer lateral (Inventario, Empleados, Actividad, Configuración) se movieron a la sección "Gestión" del HomeScreen.

**Estilo activo:** la pestaña activa lleva **fondo ámbar** (`bg-amber-400`); íconos y texto mantienen su color oscuro (`text-slate-600`) y el texto activo va en `font-semibold`. Con el panel de Caja abierto se suprime el activo de Inicio/Vender para no resaltar dos pestañas a la vez.

**Indicadores:**
- Tab **Turno**: punto **verde** (turno abierto) / **gris** (cerrado), según `isShiftOpen`.
- Tab **Ayuda**: badge rojo pulsante cuando `ragUnreadCount > 0`.

**Estado del turno (`isShiftOpen`):** lo mantiene App.tsx — se siembra desde la caché local (`bistro_active_shift_<businessId>`), se confirma con una consulta ligera a `cash_shifts` y se actualiza con los eventos `shift-opened` / `shift-closed` que emite `useCashRegister`. App lo pasa a ambas instancias del nav (sin montar el hook pesado).

### Panel de Caja: full-screen en teléfonos (2026-06)

El panel de **Caja** (`isCashRegisterOpen`, montado en App, overlay `z-[70]`) se muestra en pantalla completa en teléfonos y como drawer lateral en tablets:

| | `≤430px` (teléfono) | `≥431px` (`min-[431px]:`) |
|---|---|---|
| **Caja** | Pantalla completa, entra desde abajo (`slideInUp`), sin borde/sombra | Drawer derecho `max-w-md` con sombra y borde, entra desde la derecha (`slideInRight`) |

El overlay de Caja deja libre la altura del nav en móvil (`bottom-[calc(60px+env(safe-area-inset-bottom,0px))]`); en desktop vuelve a ocupar todo el alto (`md:bottom-0`).
