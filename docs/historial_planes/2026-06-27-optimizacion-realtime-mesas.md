# Optimización de Realtime en Mesas (Opción B) — 2026-06-27

Doc de característica: [`docs/caracteristicas/mesas.md`](../caracteristicas/mesas.md).
Spec: [`.kiro/specs/optimizar-realtime-mesas/`](../../.kiro/specs/optimizar-realtime-mesas/).
Continuación de [`2026-06-26-mesas-tablet-rol-mesero-y-realtime.md`](./2026-06-26-mesas-tablet-rol-mesero-y-realtime.md).

Optimización del consumo de **Supabase Realtime** en el módulo de mesas. Supabase factura los mensajes de Realtime contando **1 mensaje por cada cambio en la base de datos × cada dispositivo suscrito**. El mayor costo del módulo era una suscripción a **todos** los `order_items` del negocio (sin filtro) usada solo para mostrar el total en vivo de cada mesa. Se eligió la **"Opción B"**: conservar la coordinación de estado entre dispositivos (barata) y eliminar esa suscripción cara.

---

## Motivación (análisis previo)

- El consumo de mensajes **no escala con las ventas, sino con `dispositivos × canales suscritos`**. Un cambio trivial (ocupar 2 mesas) llegó a generar ~33 mensajes porque la tabla `tables` la escuchaban 2 canales por dispositivo.
- La suscripción global a `order_items` (en `useOpenTickets`) generaba un mensaje por cada producto agregado/quitado en **cualquier** mesa, enviado a **todos** los dispositivos, aunque no tuvieran esa mesa abierta.
- Consecuencia aceptada: las píldoras de mesa dejan de mostrar el **monto** y solo indican **estado** (ocupada/libre/reservada).

---

## Cambios aplicados

### 1. Eliminada la suscripción global a `order_items`
- Se borró el hook `hooks/useOpenTickets.ts` (su único consumidor era `OpenTicketsBar` y quedaba sin propósito al quitar el monto). Con él desaparece la única suscripción a `order_items` **sin filtro**.

**Archivos:** `hooks/useOpenTickets.ts` (eliminado)

### 2. Píldoras de mesa con solo estado (sin monto)
- `OpenTicketsBar` ya no usa `useOpenTickets`. Deriva el estado de cada mesa directamente de `useTables` (`status` / `current_order_id`).
- Las píldoras muestran **etiqueta + indicador de estado** (sin `$`):
  - `occupied` → ámbar · `reserved` → slate · `available` → emerald · nulo/desconocido → indicador indeterminado.
- Qué mesas son "chip": las **ocupadas / con orden activa** o la **mesa activa** (antes era "con items", que dependía del total).
- Accesibilidad: `aria-label` con el estado en texto (ej. "MESA 2, ocupada") para no depender solo del color.

**Archivos:** `components/OpenTicketsBar.tsx`

### 3. Carga limpia al abrir una mesa ocupada
- `handleTableSelect` (en `App.tsx`) envuelve el `fetchTableOrder` existente con un **estado de carga** y manejo de casos:
  - Muestra el overlay de carga solo al traer una orden ocupada.
  - **Timeout de 10s** con `Promise.race`.
  - Orden con ítems → reconstruye el carrito. Orden vacía → carrito vacío.
  - **Estado fantasma** (mesa `occupied` sin `current_order_id`): no hace fetch, avisa "mesa sin orden válida".
  - **Reapertura idempotente**: si la orden de esa mesa ya estaba cargada en el dispositivo, no repite el fetch.
  - **Error / timeout / offline**: oculta la carga, conserva el estado `occupied` y la orden sin alterar, y ofrece **Reintentar**.
- Componente nuevo `components/TableOrderLoadingOverlay.tsx`: overlay limpio (spinner + texto) que bloquea la edición mientras carga; en error muestra mensaje + "Reintentar" / "Cerrar". Accesible (`role="status"`, `aria-live`, navegación por teclado).

**Archivos:** `App.tsx`, `components/TableOrderLoadingOverlay.tsx` (nuevo)

---

## Qué se conserva (sin regresión)

- **Estado de mesas en vivo**: `useTables` sigue suscrito a `tables`/`orders`/`rooms` (filtrado por `business_id`). Ocupar/liberar/reservar una mesa se sigue reflejando en los demás dispositivos.
- **Detalle en vivo de la mesa abierta**: el canal `order-items-{mesa}` filtrado por `order_id` (en `App.tsx`) se conserva. Si otro dispositivo cambia el pedido de la mesa que tienes abierta, lo ves en vivo.
- Lo único que se pierde (a propósito): el **monto en vivo de las demás mesas** en las píldoras.

---

## Verificación

- `npm run build`: exitoso (exit 0). `getDiagnostics` limpio en `App.tsx`, `OpenTicketsBar.tsx` y `TableOrderLoadingOverlay.tsx`.
- Pendiente de prueba manual con 2 dispositivos (estado en vivo, carga al abrir mesa ocupada, error+reintento) y de medir la caída de mensajes en el dashboard de Supabase (Reports → Realtime → Postgres Changes Events).
