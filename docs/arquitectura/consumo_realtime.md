# Consumo de Supabase Realtime — Referencia

Documento de referencia del uso de Supabase Realtime en BistroPOS: cómo se factura, qué acciones generan eventos, las optimizaciones aplicadas y las pendientes.

> Para el consumo de la API REST (lecturas), ver [`consumo_egress.md`](./consumo_egress.md).

> Specs relacionados: `.kiro/specs/optimizar-realtime-mesas/`, `.kiro/specs/optimizar-realtime-productos/`, `.kiro/specs/presencia-on-demand/`.

---

## Cómo se factura (modelo oficial de Supabase)

- Un **mensaje** = un evento WebSocket entregado a, o enviado desde, un cliente.
- Se cobran tres fuentes: **Postgres Changes**, **Broadcast** y **Presence**.
- Regla clave: **1 cambio en BD × cada cliente suscrito = 1 mensaje cada uno** (un INSERT con 5 suscriptores = 5 mensajes).
- Broadcast: 1 mensaje enviado + 1 por cada receptor.
- Cupos (verificar en el dashboard): **Free 2M / Pro 5M mensajes** por mes (por proyecto, compartido entre todos los negocios). Además se factura **Peak Connections** (Free 200 / Pro 500 conexiones concurrentes), donde 1 conexión = 1 WebSocket.

Dónde medir: **Project Settings → Reports → Realtime** (gráficas separadas de Connected Clients, Broadcast Events, Presence Events, Postgres Changes Events). El conteo mensual está en **Organization → Usage**.

---

## Qué tablas emiten Postgres Changes

Solo emiten las tablas que están en la publicación `supabase_realtime` **y** tienen un suscriptor. Publicación actual: `categories`, `order_items`, `orders`, `products`, `profiles`, `rag_documents`, `rooms`, `scan_events`, `support_messages`, `support_sessions`, `tables`.

> ⚠️ `businesses` y `promotions` **NO** están publicadas: sus suscripciones en el cliente (`BusinessSettingsContext`, `usePromotions`) están **inertes** (no reciben eventos). `scan_events` está publicada pero nadie la escucha.

| Acción en la app | Tabla | Canal que la recibe |
|------------------|-------|---------------------|
| Vender (baja stock), crear/editar producto, cambiar precio/stock | `products` | `products-sync` (App.tsx) |
| Crear/editar/borrar categoría, etiquetas | `categories` | `products-sync` (App.tsx) |
| Agregar/quitar ítem de una orden, enviar comanda | `order_items` | `order-items-{mesa}` (App.tsx, filtrado por `order_id`) |
| Confirmar/ver orden, totales | `orders` | `tables-orders-changes` (useTables) |
| Ocupar/liberar/crear/editar mesa | `tables` | `tables-orders-changes` (useTables) |
| Crear/editar/eliminar sala | `rooms` | `tables-orders-changes` (useTables) |
| Login/logout, cambio de rol/permisos | `profiles` | `profile-status` (AuthContext) + `profiles-signedin-watch` (useEmployeePresence) |
| Subir/editar documento IA | `rag_documents` | `rag_docs_changes` (useRagDocuments) |
| Chat de soporte | `support_messages` / `support_sessions` | `support-{id}` (useSupportSession) |

## Qué genera Presence / Broadcast

- **Presence empleados** (`presence:business-X`, `presenceManager`): alimenta la pantalla de Actividad. Eventos `join`/`leave`/`sync`/`track`.
- **Presence impresoras** (`printer-presence-X`, `kitchenCommandService`): qué dispositivo tiene impresora. Solo si hay impresora QZ conectada.
- **Broadcast comandas** (`kitchen-commands-X`): envío de comanda a cocina.

---

## Optimizaciones aplicadas

### 1. Mesas — eliminar suscripción global a `order_items` (2026-06-27)
`useOpenTickets` (eliminado) se suscribía a **todos** los `order_items` sin filtro para mostrar el total en las píldoras. Se quitó; las píldoras muestran solo estado (ocupada/libre) desde `useTables`. El detalle de la mesa abierta se conserva en vivo (`order-items-{mesa}` filtrado). Ver [`historial_planes/2026-06-27-optimizacion-realtime-mesas.md`](../historial_planes/2026-06-27-optimizacion-realtime-mesas.md) y [`caracteristicas/mesas.md`](../caracteristicas/mesas.md).

### 2. Productos — canal único + relay + gate por permisos (2026-06-28)
Antes había **dos** suscripciones a `products` activas a la vez (`App.tsx` `products-sync` + `useProducts` `public:products`). Ahora `App.tsx` es el **único** suscriptor y reparte cambios a `useProducts` por un evento de ventana (`products-realtime-changed`). Además la suscripción se **gatea por permisos** (`canViewProducts`): un dispositivo sin acceso a productos no se suscribe. Ver [`historial_planes/2026-06-28-optimizacion-realtime-productos.md`](../historial_planes/2026-06-28-optimizacion-realtime-productos.md).

### 3. Presencia — modelo on-demand (2026-06-28)
El refresco de actividad (activo/inactivo) ya **no** se publica de forma continua. La interacción solo actualiza `last_activity_at` en memoria (`markActivity`); la publicación (`track`) la dispara la **señal de observación** (`presence-watch`) que envía la pantalla de Actividad mientras está abierta (`setObserving`). Con nadie en Actividad → **cero refrescos** (solo queda el join + 1 track inicial de "online"). Ver [`historial_planes/2026-06-28-optimizacion-presencia-on-demand.md`](../historial_planes/2026-06-28-optimizacion-presencia-on-demand.md).

---

## Optimizaciones pendientes

### Presencia: diferir el `track` inicial (cero presencia sin observador)
**Estado:** pendiente. Hoy, al entrar a la app, cada dispositivo hace un `join` + **un `track` inicial** para aparecer como "online", aunque nadie tenga abierta la pantalla de Actividad (son ~4 eventos una sola vez por conexión).

**Propuesta:** suscribirse al canal **sin** hacer el `track` inicial; publicar (`track`) **solo** cuando llega una señal de observación (`presence-watch`). Técnicamente es viable porque un cliente puede estar suscrito al canal (y recibir broadcasts) sin anunciar su presencia. Resultado: **cero eventos de presencia** cuando la pantalla de Actividad está cerrada en todos los dispositivos.

**Trade-off (por eso quedó pendiente):** cuando un admin abre Actividad, el enriquecimiento de presencia (activo/dispositivo) aparecería ~1s después (tras el primer ping). La lista de "quién inició sesión" no se afecta (sale de `profiles.is_signed_in`). Se desvía del Requisito 1 actual del spec `presencia-on-demand` ("online disponible vía join inicial"), por lo que requiere actualizar ese requisito antes de implementar.

### Otras ideas de menor prioridad
- `printer-presence-X`: no abrir el canal si el negocio no usa cocina/impresión.
- Migrar `order_items`/`products` de `postgres_changes` a `broadcast_changes` con triggers si el volumen escala mucho (recomendación oficial de Supabase para alta escala).

---

## Nota: los 401 de `useOfflineSync` no son un error

`useOfflineSync` hace una **sonda de conectividad** (`HEAD .../rest/v1/` con `mode: 'no-cors'`) porque `navigator.onLine` miente con adaptadores virtuales y el túnel Cloudflare. Un **401 cuenta como "hay internet"** (la petición respondió). Es ruido esperado en consola, no un fallo, y no está relacionado con el consumo de Realtime.
