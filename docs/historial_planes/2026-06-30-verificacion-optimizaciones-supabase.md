# Checklist de verificación — Optimizaciones Supabase

Lista de tareas para confirmar que las optimizaciones de Realtime y de PostgREST Egress no rompieron nada y funcionaron como se esperaba. Ejecutar **después** de desplegar a `dev.posbistro.online`.

> Optimizaciones cubiertas: mesas, productos (canal único + gate por permisos), presencia on-demand, egress de órdenes, columnas de productos, refetch puntual de productos.

---

## Preparación

- [ ] **Dos dispositivos** con sesión iniciada en el mismo negocio (A = administrador, B = cajero o segundo admin).
- [ ] DevTools abierto en ambos, **Console** filtrada por `[FETCH]` o `[PRESENCE]` según el bloque.
- [ ] Tener a mano el dashboard de Supabase abierto: **Reports → Realtime** y **Database → Query Performance**.

---

## A) Frontend — Verificación funcional (que NADA se rompió)

### A1. Mesas (spec `optimizar-realtime-mesas`)

- [ ] **Píldoras sin monto, solo estado**
  Resultado esperado: las píldoras (`OpenTicketsBar`) muestran etiqueta + indicador (ocupada/libre/reservada) **sin `$`**.

- [ ] **Estado de mesas sincronizado en vivo**
  En A ocupar/liberar una mesa → en B se refleja el cambio de estado en ≤2 s sin recargar.

- [ ] **Carga limpia al abrir una mesa ocupada**
  En A armar una orden en MESA X. En B abrir MESA X → aparece el **overlay de carga** (spinner) y luego la orden con sus productos. Bloquea la edición durante la carga.

- [ ] **Detalle en vivo de la mesa abierta**
  Con MESA X abierta en B, en A agregar/quitar un producto → en B se refleja en el carrito en ≤3 s.

- [ ] **Errores y casos borde de la carga**
  - Mesa `occupied` sin `current_order_id` (estado fantasma) → mensaje "mesa sin orden válida", sin fetch.
  - Si el fetch falla / timeout → mensaje de error + botón **Reintentar**, sin perder la orden.

- [ ] **Flujo de venta en mesa completo**
  Crear orden, enviar comanda, cobrar → sin regresiones. La mesa pasa a libre al cerrar.

### A2. Productos (specs `optimizar-realtime-productos` y `optimizar-fetch-productos`)

- [ ] **Catálogo visible correcto**
  En el POS, cada producto muestra bien: **nombre, precio, stock, imagen, categoría**. Al tocarlo se ven sus **opciones/modificadores**.

- [ ] **Recetas y producible**
  En **Productos** (admin), abrir un producto **procesado con receta** → la receta y el "producible" se ven igual que antes.

- [ ] **Sincronización por venta (update puntual)**
  Con B en `ProductsScreen` abierto, en A vender un producto → en B el **stock** baja **sin** que aparezca `🔎[FETCH][productos-admin]` en la consola.

- [ ] **Sincronización por edición de precio**
  En A editar el precio de un producto → en B se refleja sin `🔎[FETCH][productos-admin]`.

- [ ] **Alta/baja (sí refetch, es raro)**
  En A crear o eliminar un producto → en B sí aparece `🔎[FETCH][productos-admin]` (refetch correcto).

- [ ] **Gate por permisos**
  En B iniciar sesión con un usuario **solo-Dashboard** (sin `pos_view`/`inv_*`) → en Network NO debe existir el canal realtime `products-sync`. Al darle `pos_view` → el canal aparece sin recargar.

- [ ] **Offline del catálogo**
  Cortar internet en B → el catálogo del POS sigue cargando desde IndexedDB.
  Antes de eso, en A vender un producto (cambio remoto) → al volver B online y recargar, el stock está actualizado (se persistió a IDB).

### A3. Presencia / Actividad (spec `presencia-on-demand`)

- [ ] **Sin observador: cero refrescos**
  Cerrar la pantalla de Actividad en todos los dispositivos. Mover el mouse en A durante 2 min.
  Resultado esperado: en la consola de A, tras el `track() INICIAL`, **NO aparecen** logs `[empleados] touch()` ni "refresco bajo observación".

- [ ] **Con observador: refresco activo**
  En B abrir la pantalla de **Actividad**. En A, durante unos minutos, ver que aparecen logs de "refresco bajo observación" (~cada 60 s).
  En B: ver a A como **activo**; dejar A quieto 3 min → cambiar a **inactivo**.

- [ ] **Al cerrar Actividad: se detiene**
  B cierra Actividad → en A los refrescos cesan al cabo de la ventana (~90 s).

- [ ] **Online siempre disponible**
  Con la app abierta en A y B (sin Actividad), B abre Actividad → debe ver a A como conectado.

- [ ] **Transiciones (caja)**
  Abrir/cerrar un turno de caja en A → su `cash_shift_id` se refleja en Actividad si B la abre poco después.

### A4. Historial de ventas (spec `optimizar-egress-postgrest`)

- [ ] **Lista de ventas se ve igual**
  Entrar a **Historial/Ventas**: la lista carga y pagina con "Cargar más" normalmente.

- [ ] **Anular venta**
  Anular una venta → desaparece/marca y la lista se refresca (vía `reload()` paginado).

- [ ] **Anular ítem**
  Anular un ítem de una venta → se refleja.

- [ ] **Editar ítem**
  Cambiar producto/cantidad en una venta → se refleja.

- [ ] **Devolución**
  Hacer una devolución desde el modal → al cerrar, la lista se actualiza.

### A5. Ventas y caja (flujo principal)

- [ ] **Venta Orden Rápida completa**
  Cobrar una venta con uno o varios métodos de pago → éxito, aparece en Historial, baja stock.

- [ ] **Sin refetch de órdenes tras venta**
  Tras cobrar, en la consola **NO** debe aparecer `🔎[FETCH][orders]`.

- [ ] **Cierre de caja**
  Abrir, registrar movimiento, cerrar turno → reporte correcto.

### A6. Offline (modo obligatorio)

- [ ] **Venta offline**
  Cortar internet, hacer una venta → se encola en `offlineQueue`. Volver online → se sincroniza, aparece en Historial con número correcto.

- [ ] **Caja offline**
  Abrir/cerrar turno offline → se encola, sincroniza al volver online.

- [ ] **Abono a deuda / compra / merma offline**
  Probar al menos uno → se encola, sincroniza al volver.

- [ ] **Catálogo offline**
  Recargar la app sin internet → productos cargan desde IndexedDB, se puede tomar pedido.

### A7. Logs `[FETCH]` al recargar el POS

**DEBE aparecer** (legítimos):
- [ ] `🔎[FETCH][productos-POS]` — catálogo del POS.
- [ ] `🔎[FETCH][productos-admin]` — `useProducts` (necesario para categorías).
- [ ] `🔎[FETCH][mesas]` — si el negocio tiene mesas activas.

**NO debe aparecer** al recargar ni al cobrar:
- [ ] `🔎[FETCH][orders]` (auto-fetch eliminado).
- [ ] `🔎[FETCH][order-mesa]` — solo debe salir **al abrir una mesa**, no en cargas.

---

## B) Backend — Medición en Supabase Dashboard

### B1. Realtime — Reports → Realtime

- [ ] **Postgres Changes Events**
  Comparar antes/después al **agregar productos a una orden** desde 1 dispositivo:
  Resultado esperado: caída notable (el canal sin filtro de `order_items` ya no existe; el de products tampoco corre para cambios propios).

- [ ] **Presence Events**
  Comparar antes/después con la app abierta y Actividad **cerrada** en todos los dispositivos:
  Resultado esperado: tras el arranque, **queda plano** (sin refrescos recurrentes).

- [ ] **Connected Clients**
  Verificar que sigue siendo `≈ N` (uno por dispositivo). Si aparecen el doble por un rato tras recargar, es normal (la conexión vieja tarda en cerrarse en el servidor).

### B2. PostgREST Egress — Database → Query Performance

Ejecutar la consulta (ordenar por `calls`) y verificar:

- [ ] **`orders.*` con embeds (familia `fetchOrders`)**
  Resultado esperado: **frecuencia drásticamente menor** que antes de la optimización (idealmente desaparece de los más llamados).

- [ ] **`products.*, category:categories(*)` (refetch `useProducts`)**
  Resultado esperado: frecuencia mucho menor. Solo debería dispararse en alta/baja de productos, no en cada venta.

### B3. Database Egress — Reports → Database Egress

- [ ] **Total diario / mensual**
  Comparar el promedio diario antes/después. Resultado esperado: **bajan los MB/día** del PostgREST Egress.
  (Hoy tu base es ~15 MB/día; debería caer apreciablemente.)

### B4. Logs y advisors

- [ ] **Realtime logs** (Database → Realtime logs): sin nuevos errores tipo `CHANNEL_ERROR` recurrentes ni `too_many_*`.
- [ ] **API errors**: sin picos de 4xx/5xx tras desplegar.

---

## C) Build y código

- [ ] `npm run build` exitoso (exit 0).
- [ ] No hay errores nuevos en consola del navegador durante las pruebas anteriores (más allá de los 401 esperados de `useOfflineSync`, que son ruido conocido — ver [`consumo_realtime.md`](./arquitectura/consumo_realtime.md#nota-los-401-de-useofflinesync-no-son-un-error)).

---

## D) Aceptación

Marcar como aceptado el set de optimizaciones cuando:
- [ ] Todas las casillas de **A (funcional)** estén ✅.
- [ ] Al menos las casillas de **B1 y B2** muestren la mejora esperada.
- [ ] No haya regresiones en flujos offline (A6).

Si algo falla, registrar la observación y reportarlo para abrir una corrección puntual. Los logs `🔎[FETCH]` y `📡[PRESENCE]` quedaron activos a propósito; **no se quitan hasta cerrar este checklist**.
