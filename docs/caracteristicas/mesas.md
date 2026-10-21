# Mesas (Selector en Carrito + Comanda)

Componentes: `components/TableSelectorControl.tsx`, `components/SendCommandaModal.tsx`
Pantallas: `screens/SellScreen.tsx`, `screens/MenuScreen.tsx`
Hooks: `hooks/useTables.ts`, `hooks/useSales.ts`, `hooks/usePermissions.ts`, `hooks/useKitchenPrinter.ts`
Contexto: `context/BusinessSettingsContext.tsx`
Tablas BD: `rooms`, `tables`, `orders`, `order_items`

Sistema de mesas reactivado y modernizado. A diferencia del flujo antiguo (una grilla de salón a pantalla completa), ahora **todo se gestiona desde el carrito**: se elige/crea/edita la mesa desde un dropdown junto al modo de venta, se toma el pedido y se puede **enviar la comanda a una impresora sin finalizar la venta**.

> [!IMPORTANT]
> **Requisitos de acceso**:
> 1. **Plan Pro**: El control de salones, mesas y comandas es exclusivo de **Plan Pro** (evaluado con `usePlanFeatures().canUseTables`). En el Plan Estándar se muestra la insignia dorada `PRO` en el selector y pestaña de mesas; al pulsarlo se abre el `UpgradeProModal` invitando a mejorar el plan. En periodo de prueba (7 días) y planes personalizados se encuentra 100% habilitado.
> 2. **Flag de negocio**: Requiere además que `businesses.is_tables_enabled` esté en `true` (Ajustes → Activar/Desactivar). Si está en `false`, el control de mesas no se renderiza.

---

## Activación (flag `is_tables_enabled`)

- El flag vive en la tabla `businesses` y se expone vía `BusinessSettingsContext` como `isTablesEnabled`.
- Se activa/desactiva desde **Ajustes → Activar/Desactivar** (panel `SalesModeSettingsPanel`), con un toggle "Mesas" junto al de "Modo Catálogo". Solo el dueño puede cambiarlo; se persiste en Supabase y se propaga por realtime a todos los dispositivos.
- **Opción de diseño "B"**: la grilla antigua (`TablesScreen`) y la pestaña "Mesas" del header del POS están **ocultas**. Las mesas se gestionan 100% desde el dropdown del carrito (móvil/desktop) y desde la barra de tickets (tablet). El POS arranca siempre en **Catálogo / Orden Rápida**.

> [!NOTE]
> Históricamente había una línea `isTablesEnabled: false` hardcodeada en `BusinessSettingsContext` que ocultaba las mesas ignorando el valor real de la BD. Se corrigió para usar `settings.is_tables_enabled`.

---

## Permiso `pos_sell` (finalizar ventas)

Permiso nuevo que separa **tomar pedidos / enviar comandas** de **cobrar / finalizar la venta**.

| Permiso | Qué habilita |
|---|---|
| `pos_view` | Acceso al POS, tomar pedidos, enviar comandas |
| `pos_sell` (nuevo) | Finalizar/cobrar ventas |

- Helper `canFinalizeSale()` en `usePermissions`.
- **Fallback seguro:** si `pos_sell` no está definido en el rol, hereda de `pos_view` (no rompe configuraciones existentes). Para restringir a un mesero, el admin pone `pos_sell = false` en su rol.
- Si el usuario no tiene `pos_sell`: se oculta el botón "Procesar Pago" (desktop y móvil) y `handleProcessPayment` bloquea la acción a nivel de App (defensa en profundidad) — un mesero puede enviar comandas pero no cobrar.
- Los permisos viven en JSON (`roles.permissions` / `profiles.custom_permissions`), **no requiere migración**.

### Restricciones de un mesero (sin `pos_sell`)

Cuando `canFinalizeSale()` es `false`, además de ocultarse el cobro:

- **"Orden Rápida" no aparece**: el chip en `OpenTicketsBar` y la opción/pill en `TableSelectorControl` se ocultan (la venta directa no aplica a un mesero). En móvil el trigger del selector dice **"Elegir mesa"**.
- **No se puede abrir una categoría sin mesa**: en el catálogo móvil, tocar una categoría sin una mesa activa muestra el aviso "Elige una mesa para tomar el pedido".
- **Escanear fotolista (`PHOTO_ORDER`) oculto**: `canAccessScreen(PHOTO_ORDER)` ahora exige `pos_sell` (es una herramienta de venta directa).
- El rol **Mesero** del sistema se crea (vía `seed_default_roles`) sin `pos_sell`, `inv_view` ni `clients_view`. Ver [`gestion_personal.md`](./gestion_personal.md).

---

## Componente compartido: `TableSelectorControl`

Renderiza el control `[Orden Rápida] [Mesas ▼] [+]`. Dos variantes:

- **`variant="popover"`** (desktop): dos pills lado a lado + popover con la lista.
- **`variant="sheet"`** (móvil): un solo trigger compacto + bottom sheet. La opción "Orden Rápida" va dentro del sheet.

Funcionalidad del dropdown:
- Lista de mesas con estado **Libre / Ocupada / Reservada** (punto de color + etiqueta), ordenadas **numéricamente** (MESA 1, 2, 3 … 10, 11).
- **Líneas divisorias** entre mesas para delimitar bien.
- Chips de filtro por **sala**, visibles solo si hay **más de una** sala.
- **+ Mesa**: crea automáticamente la siguiente `MESA N` (en mayúsculas, número auto-incremental). No cierra el dropdown.
- **+ Sala**: formulario inline para el nombre. No cierra el dropdown.
- **✏️ editar** por mesa: renombra (texto forzado a mayúsculas). No cierra el dropdown.
- **🗑️ eliminar** por mesa: con confirmación; bloquea eliminar una mesa **ocupada**.
- Estado seleccionado con estilo claro (`emerald-50` / `emerald-700`), sin fondos oscuros ni amarillos.
- El trigger tiene **ancho fijo** para que no cambie de tamaño al alternar entre "Orden Rápida" y "MESA N".

### Sala por defecto
`useTables` crea automáticamente una sala **"Sala Principal"** si el negocio no tiene salas (editable).

---

## Flujo Desktop (carrito en modo Catálogo)

En `MenuScreen`, el header del carrito (modo Catálogo) muestra el `TableSelectorControl` en vez del antiguo selector de cliente (el cliente se asigna igual en el `PaymentSidebar` al cobrar).

1. Se elige una mesa del dropdown → se carga su pedido actual en el carrito (o vacío si es nueva).
2. Se agregan productos → se persisten en `order_items` con `status='pending'` y la mesa pasa a `occupied`.
3. **Separador "Comanda enviada"** dentro del carrito: los items nuevos (`pending`) quedan arriba, el separador en medio, y los ya enviados (`preparing`/`ready`/`served`) abajo.
4. **FAB "Enviar Comanda"** (esquina inferior del carrito): habilitado solo si hay items nuevos. Oculto en Orden Rápida y en la pantalla de pago.
5. **"Procesar Pago"**: finaliza la venta (si tiene `pos_sell`).
6. Alternar a **Orden Rápida** con el toggle → flujo clásico sin mesa, sin FAB, sin separador.

---

## Flujo Móvil

- En el header de `MenuScreen` (junto al selector de modo) aparece el botón **Mesas** (`variant="sheet"`).
  - El trigger dice **"Orden Rápida"** o el **número de la mesa** seleccionada.
  - En pantallas **≤430px**, el selector de modo Catálogo/Escáner se colapsa a un ícono de **3 puntos** (`more_vert`) en la esquina derecha.
- El bottom sheet de mesas se puede **cerrar arrastrando hacia abajo** (patrón estándar del [`design_system.md`](../arquitectura/design_system.md), sección 6, incluido el ajuste de sensibilidad para listas scrolleables).
- En el carrito móvil: separador "Comanda enviada", botón **"Enviar Comanda"** (modo mesa) y "Procesar Pago" condicionado a `pos_sell`.

---

## Flujo Tablet (768–1023px) — Barra de Tickets Abiertos (`OpenTicketsBar`)

En tablet, el layout del POS es el mismo que en escritorio reducido (grid de productos a todo el ancho + carrito como overlay de `PaymentScreen` que abre el FAB). La gestión de mesas se hace con una **barra de tickets abiertos** (patrón "Open Tickets" estilo Square/Toast), no con el dropdown del carrito ni con grilla de salón.

- Componente `components/OpenTicketsBar.tsx`. El estado de cada mesa se deriva de `hooks/useTables.ts` (`status` / `current_order_id`); **ya no usa `useOpenTickets` ni muestra montos** (ver sección "Tiempo real"). Se monta arriba del header de catálogo, **solo en tablet** (`hidden md:flex lg:hidden`) y en modo catálogo.
- **Chips**: `[● Orden Rápida]` + las mesas **ocupadas / con orden activa** o la **mesa activa**, mostrando **solo su estado** (punto de color + `MESA 3`), sin monto. Orden numérico estable (no salta al seleccionar).
- **Overflow responsivo**: los chips que no caben en el ancho se mueven al dropdown **"Ver todas"** (no hay scroll horizontal). Si la mesa activa quedó en el overflow, "Ver todas" toma el estilo activo y muestra su nombre.
- **Dropdown "Ver todas"** (en portal, posición fija): lista densa con **estado** por mesa (Libre/Ocupada/Reservada, sin monto), **chips de sala** (solo si hay más de una; sin opción "Todas", arranca en la primera sala), `[+ Mesa]`, `[+ Sala]`, renombrar y eliminar.
  - **Eliminar sala**: `×` en cada pill de sala **no principal**; sus mesas se reasignan a la sala principal antes de borrarla.
  - **Eliminar mesa**: deshabilitado para mesas ocupadas o con items.
  - **+ Mesa** reserva el número de forma sincrónica (soporta toques rápidos sin duplicar).
- Al seleccionar una mesa **con items**, se abre automáticamente el overlay de pago para revisar/cobrar la orden.
- El botón **"Enviar Comanda"** y el separador **"Comanda enviada"** también están disponibles dentro del overlay de pago de tablet (ver `PaymentScreen`).

> [!NOTE]
> Una sola instancia de `MenuScreen` vive entre `orden_rapida` y `mesa_activa` (las props se derivan del tab). Esto evita que el grid de productos se recargue/parpadee al alternar de mesa.

---

## Comanda parcial (`SendCommandaModal`)

Al pulsar "Enviar Comanda" se abre `SendCommandaModal`, que:

1. Toma solo los items **nuevos** (`status` distinto de `preparing/ready/served`).
2. Permite elegir impresora destino:
   - **Esta impresora** (si el dispositivo tiene QZ conectado) → `printKitchenCommandDirect`.
   - **Dispositivo remoto** del negocio (vía Presence) → `sendKitchenCommand`.
   - Si no hay impresoras → mensaje claro.
3. Tras enviar: marca esos `order_items` como `preparing`, pone la orden en `preparing` (`last_confirmed_at`) y la mesa en `occupied` → se refleja en tiempo real en todos los dispositivos.

> [!IMPORTANT]
> `SendCommandaModal` se **monta solo cuando está abierto** (`{showSendCommanda && <SendCommandaModal/>}`). Esto evita una suscripción duplicada al canal de presencia `printer-presence-{businessId}` que rompía la detección de impresoras en otros dispositivos. Ver `comandas_cocina.md`.

---

## Tiempo real (Realtime)

- Las tablas `tables` y `rooms` deben estar en la publicación `supabase_realtime` para que los cambios de estado (Libre/Ocupada, crear/editar/eliminar) se propaguen entre dispositivos. Ver `docs/migrations/2026-06-10-realtime-tables-rooms.sql`.
- `useTables` se suscribe a cambios de `tables`, `orders` y `rooms`, con **nombre de canal único por instancia** (`tables-orders-changes-{random}`) para evitar colisiones cuando hay varias instancias montadas (carrito desktop + header móvil).
- `addItemToOrder` garantiza marcar la mesa como `occupied` aunque la orden ya existiera (corrige mesas que quedaban "Libres" teniendo productos).

### Optimización "Opción B" (2026-06-27) — menos consumo de Realtime

Supabase factura los mensajes de Realtime como **1 mensaje × cambio en BD × dispositivo suscrito**. Para reducir el costo sin perder la coordinación entre dispositivos (ver [`historial_planes/2026-06-27-optimizacion-realtime-mesas.md`](../historial_planes/2026-06-27-optimizacion-realtime-mesas.md)):

- **Eliminada** la suscripción a **todos** los `order_items` sin filtro (vivía en el hook `useOpenTickets`, ya borrado). Era el mayor gasto: un mensaje por cada producto agregado/quitado en cualquier mesa, a cada dispositivo.
- Las **píldoras** (`OpenTicketsBar`) ya no muestran monto; solo el **estado** (ocupada/libre/reservada) derivado de `useTables`.
- **Se conserva** el detalle en vivo de la **mesa abierta** (canal `order-items-{mesa}` filtrado por `order_id`, en `App.tsx`): si otro dispositivo cambia ese pedido, se ve en vivo.
- Al **abrir una mesa ocupada**, `handleTableSelect` hace un fetch puntual de la orden con un **overlay de carga** (`TableOrderLoadingOverlay`): timeout de 10s, manejo de orden vacía, estado fantasma (ocupada sin orden) y error con **reintento**. Reapertura de una mesa ya cargada = sin re-fetch.

> [!NOTE]
> Consecuencia aceptada: el **monto** de las demás mesas ya no se actualiza en vivo en las píldoras (de hecho ya no se muestra). El estado ocupada/libre sí sigue en vivo.

---

## Mesas sin conexión (modelo "Usuario Eje")

El módulo de mesas **opera offline** siguiendo el modelo **single-writer**: sin internet, **solo el dispositivo con turno de caja abierto** (el *Eje*) puede escribir en las mesas; los demás quedan en **solo lectura**. Esto evita por diseño que dos equipos cobren o editen la misma mesa cuando no se pueden resolver conflictos. Detalle completo de arquitectura en [`modo_offline.md`](./modo_offline.md), sección 6.

Puntos que afectan a los componentes de este documento:

- **Detección del Eje:** `hooks/useEjeStatus.ts` cruza `presenceManager.getUsers()` con la lista de turnos abiertos cacheada (`bistro_open_shifts_cache`) para saber quién es Eje y si sigue conectado. La verificación es una **lectura puntual al abrir la mesa**, sin sondeo continuo.
- **`useTables` bifurcado:** online → Supabase + cache en IndexedDB; offline → lee de `lib/offlineTableStore.ts`. El CRUD de mesas/salas offline usa IDs temporales `offline_table_*` / `offline_room_*` y encola `create/update/delete_table` y `create/update/delete_room` (mapeo a UUID real en `lib/offlineTableMap.ts`). Offline no se autocrea la "Sala Principal".
- **`useSales` bifurcado:** la orden de cada mesa se mantiene como **snapshot** en IndexedDB (`Cache_Orden_Mesa_IDB`); agregar/quitar items y modificadores offline solo muta ese snapshot (no encola por item). Los items sin sincronizar muestran un badge **"pendiente de sincronizar"** en `CartItemRow`.
- **`SendCommandaModal` offline:** solo ofrece la **impresora local (QZ)**; el envío a dispositivos remotos se bloquea ("requiere conexión"). `markOrderConfirmed` actúa sobre el snapshot local.
- **Cobro offline (Eje):** se removió el guard que excluía las mesas del cobro offline. El Eje cobra encolando una sola transacción `sale` con `table_id` (idéntico a la Orden Rápida offline), aunque `canFinalizeSale()` sea `false`. Al sincronizar, la mesa se libera en Supabase (`status='available'`, `current_order_id=null`).
- **Observador:** offline (o con el Eje sin conexión aunque el observador tenga internet) ve las mesas congeladas en solo lectura, con un banner que nombra al Eje.
- **Cierre de turno:** `useCashRegister.closeShift` bloquea el cierre (online y offline) si hay mesas pendientes: *"Termina de cobrar las mesas pendientes antes de cerrar."*
- **Aviso de recarga:** cuando el Eje termina de sincronizar sus mesas, los observadores conectados reciben un modal bloqueante (`ForcedReloadModal`) que recarga la app; el Eje nunca lo ve.

> [!NOTE]
> **Mejora futura (fuera de alcance):** la **coordinación técnica del multi-eje** (lock o partición de mesas entre varios cajeros con turno abierto) **no está implementada**. Con dos o más turnos abiertos no hay lock técnico: solo se muestra un aviso operacional para que los cajeros se coordinen manualmente. Un lock o partición de mesas queda como mejora futura.

---

## Archivos clave

| Archivo | Rol |
|---|---|
| `components/TableSelectorControl.tsx` | Control compartido (dropdown/sheet de mesas) — móvil y desktop |
| `components/OpenTicketsBar.tsx` | Barra de tickets abiertos (selector de mesas en **tablet**); estado por mesa desde `useTables`, sin monto |
| `components/TableOrderLoadingOverlay.tsx` | Overlay de carga limpio al abrir una mesa ocupada (spinner / error + reintento) |
| `components/SendCommandaModal.tsx` | Envío de comanda parcial + selección de impresora |
| `components/SalesModeSettingsPanel.tsx` | Ajustes → Activar/Desactivar (toggle "Mesas" e "Modo Catálogo") |
| `screens/SellScreen.tsx` | Orquesta tabs (orden_rapida / mesa_activa) con una sola instancia de `MenuScreen` |
| `screens/MenuScreen.tsx` | Carrito: control, separador, FAB, gating de pago; monta `OpenTicketsBar` en tablet |
| `screens/PaymentScreen.tsx` | Overlay de orden/pago (móvil/tablet): "Enviar Comanda" + separador "Comanda enviada" |
| `hooks/useTables.ts` | CRUD mesas/salas + realtime + sala por defecto + caché en memoria |
| `hooks/useSales.ts` | `addItemToOrder` (ocupa mesa, serializado para evitar carreras), órdenes |
| `hooks/usePermissions.ts` | `canFinalizeSale()` / permiso `pos_sell`; gating de `PHOTO_ORDER` |
| `hooks/useEjeStatus.ts` | Rol offline: `soyEje` / `ejeOnline` / `ejeNombre` / `multiEje` (cruce presencia + turnos abiertos) |
| `lib/offlineTableStore.ts` | Cache IndexedDB de mesas, salas y snapshot de orden por mesa (DB v4) |
| `lib/offlineTableMap.ts` | Mapeo de IDs temporales `offline_table_*` / `offline_room_*` → UUID real |
| `components/ForcedReloadModal.tsx` | Modal bloqueante de recarga para el observador tras la sincronización del Eje |
| `context/BusinessSettingsContext.tsx` | `isTablesEnabled` / `setTablesEnabled` (valor real de BD) |
| `screens/EmployeesScreen.tsx` | Permiso `pos_sell` en la UI de roles |
