# Mesas en Tablet (Open Tickets) + Rol Mesero + Robustez Realtime — 2026-06-26

Continuación de [`2026-06-11-mesas-refinamientos-y-layout-tablet.md`](./2026-06-11-mesas-refinamientos-y-layout-tablet.md).
Doc de característica: [`docs/caracteristicas/mesas.md`](../caracteristicas/mesas.md) · Permisos: [`docs/caracteristicas/gestion_personal.md`](../caracteristicas/gestion_personal.md).

Sesión de trabajo sobre la rama `IMPLEMENTAR-MESAS` tras integrar `main`. Se rehízo el enfoque del layout de mesas en tablet, se creó el rol **Mesero**, y se corrigieron varios bugs de tiempo real y carreras de escritura.

---

## 0. Integración de `main` en `IMPLEMENTAR-MESAS`

- Merge de `origin/main` a la rama de mesas resolviendo 5 conflictos reales (`App.tsx`, `SellScreen.tsx`, `MenuScreen.tsx`, `ProductOptionsModal.tsx`, `comandas_cocina.md`).
- `App.tsx`: se conservaron **ambos** guards en `handleProcessPayment` (permiso `pos_sell` + turno de caja obligatorio).
- `ProductOptionsModal.tsx`: se tomó la versión de `main` (refactor de sub-pestañas de Config).

## 1. Reversión del layout tablet anterior y nuevo enfoque

El layout tablet del 2026-06-11 (sidebar flotante `tabletOverlay`, carrito fijo de 400px, `md:pr-[400px]`, overlays `md:hidden`) se **revirtió a `main`** porque dejaba el tablet a medias. Cambios:

- **`App.tsx`**: eliminado `isPosCatalogView` y la prop `tabletOverlay` del Sidebar; el contenido vuelve a `md:ml-64` (sidebar empuja, no flota). Overlays de `PaymentScreen`/`SuccessScreen` vuelven a `lg:hidden` (visibles en móvil **y** tablet).
- **`MenuScreen.tsx` / `SellScreen.tsx`**: breakpoints `md:`/`lg:` revertidos a `main` (grid de productos a todo el ancho en tablet, FAB de carrito, header normal).
- En tablet el carrito vuelve a ser el **overlay de `PaymentScreen`** que abre el FAB (no un carrito lateral fijo).
- Clic en el **backdrop** del overlay de pago = botón "Agregar" (vuelve al catálogo a seguir agregando). Solo dispara al tocar la zona oscurecida (`e.target === e.currentTarget`).

**Archivos:** `App.tsx`, `components/Sidebar.tsx` (prop `tabletOverlay` quedó inerte), `screens/MenuScreen.tsx`, `screens/SellScreen.tsx`

## 2. Barra de Tickets Abiertos en tablet (`OpenTicketsBar`) — NUEVO

Patrón estilo "Open Tickets" (Square/Toast) para gestionar mesas en tablet sin grilla de salón.

- Componente nuevo `components/OpenTicketsBar.tsx` + hook `hooks/useOpenTickets.ts` (resumen de items/total por mesa, en realtime).
- Barra persistente arriba del header de catálogo, **visible solo en tablet** (`hidden md:flex lg:hidden`). Móvil usa su `TableSelectorControl` en el header; desktop el del carrito lateral.
- Chips: `[● Orden Rápida]` + las mesas **con items** o la **activa**, con su total (`MESA 3 · $11k`).
- **Overflow responsivo**: los chips que no caben pasan al dropdown **"Ver todas"** (no scroll horizontal). Mide el ancho con `ResizeObserver` y recorta hasta que quepa.
- Si la **mesa activa** quedó dentro del overflow, el botón "Ver todas" toma el estilo activo (emerald) y muestra el nombre de la mesa, y la fila se resalta en el dropdown.
- Dropdown "Ver todas" (en **portal**, `position: fixed`): lista densa de mesas con estado/total, **chips de sala** (sin "Todas"; default a la primera sala), `[+ Mesa]`, `[+ Sala]`, renombrar y eliminar por mesa.
- Eliminar sala (excepto la principal): `×` en cada pill de sala no principal; sus mesas se reasignan a la principal antes de borrar.
- Mesas **ocupadas/con items**: botón eliminar deshabilitado.

**Archivos:** `components/OpenTicketsBar.tsx` (nuevo), `hooks/useOpenTickets.ts` (nuevo), `screens/MenuScreen.tsx`

## 3. Una sola instancia de `MenuScreen` (sin parpadeo al cambiar de tab)

`SellScreen` montaba **dos** `<MenuScreen>` (uno para `orden_rapida`, otro para `mesa_activa`); al alternar, React desmontaba/montaba todo (recargaba el grid y parpadeaba). Ahora hay **una sola instancia** cuyas props se derivan del tab activo → reconciliación, sin remount.

**Archivos:** `screens/SellScreen.tsx`

## 4. Comanda y carrito en el overlay de pago (tablet)

- Botón flotante **"Enviar Comanda"** dentro del overlay de pago (esquina inferior derecha), estilo claro/profesional (blanco + borde emerald). Solo en modo mesa con items nuevos pendientes.
- Separador **"Comanda enviada"** en el listado del `PaymentScreen` (igual que móvil/desktop): items nuevos arriba, enviados abajo.
- Al seleccionar una mesa **con items** en tablet, el overlay de pago se abre automáticamente.

**Archivos:** `screens/PaymentScreen.tsx`, `App.tsx`

## 5. Toggle "Mesas" en Ajustes → Activar/Desactivar

Segundo interruptor en `SalesModeSettingsPanel` (junto a "Modo Catálogo") que activa/desactiva las mesas del negocio (`is_tables_enabled` vía `BusinessSettingsContext`, persistido en Supabase + realtime). Solo el dueño puede cambiarlo.

**Archivos:** `components/SalesModeSettingsPanel.tsx`

---

## Bugs de tiempo real y carreras corregidos

### A) Parpadeo del producto al recibir modificadores desde otro dispositivo
Aplicar modificadores hace en BD `removeOrderItem` + `addItemToOrder` (el padre cambia de `orderItemId`). En el dispositivo **observador**, el evento DELETE llegaba antes que el INSERT y el producto **desaparecía y reaparecía**. Fix en `App.tsx` (`refreshActiveTable`):
- **Debounce** (200ms) para colapsar ráfagas de eventos.
- **Diferir refrescos que "encogen" el carrito**: si el carrito reconstruido tiene menos items que el actual (posible DELETE sin el INSERT aún), se difiere ~600ms y se re-verifica, evitando el hueco vacío. Independiente de la latencia.

### B) Imagen del producto parpadea al editar modificadores (local)
`CartItemRow` recreaba el `<img>` en cada cambio del item. Se **memoiza el thumbnail** por `[URL, name]` y se quitó `loading="lazy"` (+ `decoding="async"`). React mantiene el mismo `<img>` → sin recarga.

**Archivos:** `components/CartItemRow.tsx`

### C) Productos perdidos al agregar muy rápido ("siempre falta uno")
Carrera read-modify-write en `addItemToOrder`: dos adds rápidos creaban **dos órdenes** (get-or-create) o pisaban el merge de cantidad. Fix: **cola de serialización** (`addItemQueueRef`) que ejecuta los `addItemToOrder` de a uno. La UI sigue siendo optimista.

**Archivos:** `hooks/useSales.ts`

### D) Mesas tardaban ~2s en aparecer al volver al POS
Al navegar fuera y volver, `useTables`/`useOpenTickets` se remontaban y recargaban desde cero. Se agregó **caché en memoria por `businessId`**: al remontar se inicializa el estado desde caché (instantáneo) y se refresca en segundo plano.

**Archivos:** `hooks/useTables.ts`, `hooks/useOpenTickets.ts`

### E) Mesas repetidas al pulsar "+ Mesa" rápido
El número se calculaba del estado `tables` (que llega tarde). Fix: **reserva sincrónica** del siguiente número con un ref (`nextNumRef = max(números en tables, último reservado) + 1`), reseteado al cerrar el dropdown.

**Archivos:** `components/OpenTicketsBar.tsx`

### F) Dropdown "Ver todas" se cerraba al confirmar eliminar / no abría
- No abría: se renderizaba dentro de un contenedor con `overflow-x-auto` → recortado. Se movió a un **portal** con posición medida del trigger.
- Se cerraba: el `ConfirmDialog` (modal externo) disparaba el "click afuera". Se agregó `suppressCloseRef` que ignora el cierre mientras el confirm está abierto.

**Archivos:** `components/OpenTicketsBar.tsx`

### G) Al crear una sala desaparecía una mesa de la principal
Las mesas sin `room_id` (null) no coincidían con el filtro de la sala principal. Fix: el filtro de la sala principal incluye también las mesas sin sala (`t.room_id === principalId || !t.room_id`).

**Archivos:** `components/OpenTicketsBar.tsx`

---

## Rol Mesero y restricciones de permisos

### Rol "Mesero" del sistema (Supabase)
Se actualizó la función `seed_default_roles(p_business_id)` para que el rol **Mesero** se cree con permisos explícitos de "solo toma pedidos":
```
pos_view: true · pos_sell: false · pos_open: false
inv_view: false · inv_create: false · inv_stock: false · inv_purchase: false
clients_view: false · admin_*: false
```
- `pos_sell: false` **explícito** (si no, heredaría de `pos_view` y podría cobrar).
- `inv_view: false` → sin pantalla de Productos/Inventario.
- `clients_view: false` **explícito** → sin Cuentas por Cobrar (si no, hereda de `pos_view`).
- Se creó el rol Mesero faltante en el negocio que no lo tenía y se normalizaron los existentes (0 perfiles Mesero afectados).

> Migración aplicada en la BD hosteada (`seed_default_roles`). Pendiente sincronizar a `supabase/migrations/` con `supabase migration fetch`.

### Restricciones del mesero en la UI
- **"Orden Rápida" oculta** para quien no puede vender (`canFinalizeSale() === false`): en `OpenTicketsBar` (chip) y en `TableSelectorControl` (pill popover y opción del sheet). El trigger del sheet pasa a decir **"Elegir mesa"** con ícono de mesa.
- **No se puede abrir una categoría sin mesa**: en `MenuScreen.handleOpenCatalogSheet`, si es mesero y no hay mesa activa, muestra toast "Elige una mesa para tomar el pedido" y no abre.
- **`PHOTO_ORDER` (Escanear fotolista)** ahora requiere `pos_sell`: `canAccessScreen(PHOTO_ORDER) = canFinalizeSale()`.
- **`HomeScreen` respeta permisos**: la grilla de Operación filtra por `canAccessScreen(item.screen)` (oculta Productos/Estadísticas/Escanear según permiso); "Abonos" se gatea por `clients_view`/`debts_view`; KPI "Por cobrar" y "Stock bajo" se ocultan sin `clients_view`/`inv_view`; la sección "Finanzas" se oculta entera si no hay ninguna acción disponible.

**Archivos:** `hooks/usePermissions.ts`, `components/OpenTicketsBar.tsx`, `components/TableSelectorControl.tsx`, `screens/MenuScreen.tsx`, `screens/HomeScreen.tsx`

---

## Verificación

- `npm run build`: exitoso (exit 0) tras cada bloque de cambios.
- `getDiagnostics` limpio en todos los archivos modificados.
- Cambios de BD verificados con consultas MCP (rol Mesero consistente en los 3 negocios; 0 perfiles Mesero).
