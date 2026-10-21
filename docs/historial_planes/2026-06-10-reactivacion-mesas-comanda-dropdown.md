# Reactivación de Mesas + Comanda desde el Carrito — 2026-06-10

## Resumen

Se reactivó y modernizó el funcionamiento de mesas (estaba oculto). En vez de la grilla de salón antigua, las mesas ahora se gestionan desde un **dropdown en el carrito** junto al selector de modo. Se permite **tomar pedido por mesa**, **enviar la comanda a una impresora sin finalizar la venta**, y se separó el permiso de **cobrar** del de **tomar pedidos**. Sincronización en tiempo real entre dispositivos.

Documentación de la característica: [`docs/caracteristicas/mesas.md`](../caracteristicas/mesas.md).

Decisión de diseño elegida por el usuario: **Opción B** — solo el flujo nuevo. La grilla `TablesScreen` y la pestaña "Mesas" del header del POS quedan ocultas; el POS arranca en Catálogo / Orden Rápida.

---

## Cambios Implementados

### 1. Permiso `pos_sell` (finalizar ventas)
- Nuevo permiso "Finalizar Ventas" en `EmployeesScreen`.
- Helper `canFinalizeSale()` en `usePermissions` con **fallback seguro**: si `pos_sell` no está definido, hereda de `pos_view` (no rompe configuraciones existentes).
- Gating del botón "Procesar Pago" (desktop y móvil) + guard en `handleProcessPayment` (App) a nivel de acción.
- No requiere migración (permisos en JSON `roles.permissions` / `profiles.custom_permissions`).

**Archivos:** `screens/EmployeesScreen.tsx`, `hooks/usePermissions.ts`, `App.tsx`

### 2. Sala por defecto
- `useTables` crea automáticamente "Sala Principal" si el negocio no tiene salas.

**Archivos:** `hooks/useTables.ts`

### 3. Componente `TableSelectorControl` (nuevo)
- Control compartido `[Orden Rápida] [Mesas ▼] [+]`, variantes `popover` (desktop) y `sheet` (móvil).
- Lista de mesas con estado Libre/Ocupada, ordenadas numéricamente, con líneas divisorias.
- Chips de sala solo si hay más de una sala.
- "+ Mesa" crea `MESA N` automática en mayúsculas (sin cerrar). "+ Sala" inline (sin cerrar).
- Íconos de **editar** (mayúsculas) y **eliminar** (con confirmación; bloquea mesas ocupadas) por fila.
- Estado seleccionado claro (`emerald-50`), sin negros ni amarillos. Trigger de ancho fijo.

**Archivos:** `components/TableSelectorControl.tsx`

### 4. Integración desktop (carrito Catálogo)
- Se reemplazó el selector de cliente del header del carrito por el `TableSelectorControl` (el cliente se asigna igual en el `PaymentSidebar`).
- Separador **"Comanda enviada"** dentro del carrito (nuevos arriba, enviados abajo) según `order_items.status`.
- **FAB "Enviar Comanda"** (oculto en Orden Rápida y en pantalla de pago).
- Fix de stacking: el header del carrito subió a `z-[70]` para que el dropdown no quede tapado por los badges de cantidad de los items.

**Archivos:** `screens/MenuScreen.tsx`, `screens/SellScreen.tsx`

### 5. Comanda parcial — `SendCommandaModal` (nuevo)
- Envía solo los items nuevos (`pending`) a impresión; elige impresora local o remota (Presence).
- Tras enviar marca items `preparing`, orden `preparing` y mesa `occupied` (realtime).

**Archivos:** `components/SendCommandaModal.tsx`, `App.tsx`

### 6. Integración móvil (Fase 6)
- Control de mesas en el header móvil (junto al modo). Trigger muestra "Orden Rápida" o el número de mesa.
- En **≤430px**, el botón de modo Catálogo/Escáner se colapsa a **3 puntos** en la esquina derecha.
- Bottom sheet con **arrastrar-para-cerrar** (patrón `DESIGN_SYSTEM.md` §6 + ajuste de sensibilidad para listas scrolleables).
- Carrito móvil: separador, botón "Enviar Comanda" y gating de "Procesar Pago".

**Archivos:** `screens/MenuScreen.tsx`, `components/TableSelectorControl.tsx`, `DESIGN_SYSTEM.md`

---

## Bugs corregidos durante la implementación

### A) Mesas mostradas como "Libres" teniendo productos
`addItemToOrder` solo marcaba `occupied` al crear orden nueva. Si la orden ya existía (p. ej. quedó vinculada tras una limpieza), nunca se marcaba ocupada. Se agregó verificación/actualización del estado de la mesa al agregar items.
**Archivo:** `hooks/useSales.ts`

### B) Realtime de mesas no actualizaba (había que recargar)
**Causa raíz:** la tabla `tables` (y `rooms`) **no estaba en la publicación `supabase_realtime`**, así que los cambios de estado no emitían eventos. Además, varias instancias de `useTables` compartían el mismo nombre de canal.
**Solución:** se agregaron `tables` y `rooms` a la publicación (ver migración) y se dio **nombre de canal único por instancia** en `useTables`; además `useTables` ahora escucha cambios de `rooms`.
**Archivos:** migración `supabase_realtime`, `hooks/useTables.ts`

### C) `BusinessSettingsContext` ignoraba el flag real
Una línea `isTablesEnabled: false` hardcodeada ocultaba las mesas. Se cambió a `settings.is_tables_enabled`.
**Archivo:** `context/BusinessSettingsContext.tsx`

### D) Volver desde "Procesar Pago" en una mesa
La flecha atrás llevaba a una pantalla con header distinto (`Screen.MENU` autónoma) y, en mesa, terminaba en Orden Rápida con un parpadeo.
**Solución:** `handleExitCatalogPayment` siempre navega a `Screen.SELL`; `handleNavigate` redirige cualquier `Screen.MENU` a `SELL`; el wrapper de `mesa_activa` en `SellScreen` distingue "salir del pago" (conserva la mesa) de "volver a mesas".
**Archivos:** `screens/MenuScreen.tsx`, `screens/SellScreen.tsx`, `App.tsx`

### E) No se detectaba la impresora desde otro dispositivo
**Causa raíz:** `SendCommandaModal` estaba siempre montado y ejecutaba `useAvailablePrinters`, creando una **segunda suscripción permanente** al canal de presencia `printer-presence-{businessId}`, que entraba en conflicto con la de `SuccessScreen`/`SuccessSidebar`.
**Solución:** montar `SendCommandaModal` solo cuando está abierto. Se agregaron logs de diagnóstico en el flujo de presencia (`📡`, `👀`, `🖨️`).
**Archivos:** `App.tsx`, `lib/kitchenCommandService.ts`, `hooks/useKitchenPrinter.ts`

---

## Base de Datos

- Migración: agregar `tables` y `rooms` a la publicación `supabase_realtime`.
  Ver [`docs/migrations/2026-06-10-realtime-tables-rooms.sql`](../migrations/2026-06-10-realtime-tables-rooms.sql).
- No se crearon tablas ni columnas nuevas (se reutilizan `rooms`, `tables`, `orders`, `order_items`).
- El permiso `pos_sell` no requiere migración (vive en JSON).

---

## Pendientes / Notas

- Los logs de diagnóstico de presencia (`📡`/`👀`/`🖨️`) quedaron activos para depurar; se pueden reducir/quitar cuando se confirme estable.
