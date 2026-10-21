# 🌐 Arquitectura del Modo Offline (Bistro-POS)

Esta documentación describe la arquitectura y el funcionamiento completo del **Modo Offline**, diseñado progresivamente para garantizar la continuidad total de las operaciones en mostradores frente a fallas o interrupciones de internet. (Documentación Auditada y Actualizada según Código en Producción).

---

## ⚡ 1. El "Motor Offline" (Event Sourcing Optimista)

El modo offline se aparta de la dependencia exclusiva de Supabase, adoptando una arquitectura **Offline-First** dinámica. 

### 📡 Detección de Conectividad
A través del hook `useOfflineSync.ts`, el sistema evalúa la red con una arquitectura de **4 capas de protección**:

1. **Ping ligero vía `fetch HEAD`:** En lugar de una query autenticada a Supabase, se usa `fetch HEAD` contra `${SUPABASE_URL}/rest/v1/`. No depende de JWT, no parsea respuesta — cualquier HTTP response (incluso 401) confirma internet. Solo errores de red (`TypeError`, `AbortError`) indican offline. Timeout adaptativo: 3s si `navigator.onLine = true` (confirmación rápida) / 5s si `navigator.onLine = false` (más margen para redes lentas al despertar). `navigator.onLine` se trata como **hint, nunca como fuente de verdad**.
2. **Protección contra stale en background:** Si el ping falla pero el tab está oculto (`document.visibilityState !== 'visible'`), el resultado se ignora. Chrome throttlea timers en tabs background (~1/min), lo que puede producir falsos negativos.
3. **Debounce de transición offline:** Las transiciones a offline se retrasan 2s vía `setOnlineDebounced()`; las transiciones a online son inmediatas. Si el ping se recupera en menos de 2s, nunca se muestra el indicador offline. Un `isOnlineRef` sincronizado con el estado permite que el orquestador (`syncAll`) use el valor verificado en lugar de `navigator.onLine`.
4. **Listeners de resume:** `visibilitychange` + `focus` disparan re-verificación inmediata al volver a la app, con un segundo chequeo retrasado (1.5s) para redes que tardan en estabilizarse tras despertar.
5. **Polling dinámico:** Check inmediato al montar (sin delay). Después, polling recursivo con `setTimeout`: 30s estando online (reduce queries innecesarias), 10s estando offline (recupera conectividad más rápido).
- **Uso sin Límite (Condicionado a Suscripción):** El sistema permite trabajar en modo offline sin restricción temporal artificial. Sin embargo, cuenta con validación dinámica: si estando offline se supera la fecha de vencimiento de la suscripción (incluyendo sus 48 hrs de gracia), el sistema revocará el acceso automáticamente, impidiendo evasión de pagos.

### 💾 Almacenamiento Local (Cola de Operaciones)
Las acciones u operaciones interrumpidas se tipan polimórficamente bajo la interfaz `OfflineTransaction` (`lib/offlineQueue.ts`). Se transforman en *payloads genéricos* y se resguardan de manera segura secuencialmente usando **IndexedDB** (`lib/offlineStorage.ts`).

---

## 🏗️ 2. Operaciones Soportadas 

El sistema cuenta con un orquestador que lee y despacha los siguientes eventos de transacciones:

### 💵 Módulo de Caja
- **Aperturas:** Genera y envía en cola un tipo `open_shift` con turno falso `offline_shift_{timestamp}`.
- **Cierres:** Recoge arqueo, evalúa turno (incluso si se abrió offline) y encola el `close_shift`.
- **Efectivo Extra:** Registra entradas/salidas manuales al instante (`manual_cash_in` / `manual_cash_out`).

### 🛒 Ventas, Eliminaciones y Mermas
- **Ventas Nuevas:** Construye orden, calcula lógicas de pagos (`cash` / `credit`), inyecta salida y encadena peticiones paralelas (deducciones/historial) bajo el transaction router `syncSale`.
- **Pagos divididos (mixtos):** Soportados offline. El payload encolado incluye `split_payments`; la reflexión local en caja (`pushOfflineCashMovement`) inyecta **un movimiento por método** real (efectivo, transferencia, …). Al sincronizar, `syncSale` guarda la orden con `payment_method = 'mixed'` + `split_payments` y divide los `cash_movements` por método. Queda idéntica a una venta dividida hecha online. Ver [`../historial_planes/2026-06-17-fix-pago-dividido-clasificacion.md`](../historial_planes/2026-06-17-fix-pago-dividido-clasificacion.md).
- **Eliminaciones/Anulaciones:** 
  - *Actualmente en Desarrollo:* El tipado `delete_sale` existe en la interfaz como diseño fundacional, pero todavía **no está implementado** a nivel de sincronizador activo (ignorado por el orquestador temporalmente).
- **Mermas (Shrinkage):** Completamente implementadas (`syncShrinkage`). En offline registra la reducción de stock y motivo.

### 👥 Clientes y Deudas
- **Creación de clientes:** Encola `create_client` con un `offline_client_{timestamp}_{rand}` como ID temporal. El cliente aparece en el caché local (`bistro_clients_cache` en localStorage) de inmediato para ser usado en ventas a crédito. Al sincronizar, se inserta en Supabase y se registra el mapping `offlineId → realUUID` en `lib/offlineClientMap.ts` (persistido en localStorage como `bistro_offline_client_id_map`).
- **Resolución de IDs offline:** El orquestador procesa todos los `create_client` **antes** del resto de transacciones. Cualquier `client_id` o `clientId` con prefijo `offline_client_*` en el payload de otras transacciones (ventas, abonos) se resuelve vía `resolveOfflineClientId()` justo antes de la inserción. Si el mapping persiste entre sesiones (cierre de app + reapertura), las transacciones huérfanas pueden recuperar el ID real en la siguiente ronda de sincronización.
- **Abonos:** Registra `client_payment` empujando deducción de deuda real del cliente en Supabase.
- **Créditos:** Encola las ventas a crédito, marcando los saldos pendientes directo como registro `client_transactions` al sincronizar la venta principal.

### 📦 Gastos y Abastecimiento
- **Inventario:** Permite insertar compras  (`inventory_purchase`), reabastece el stock con los factor de costo unitario evaluado localmente e inserta la línea de movimiento de caja.
- **Gastos:** `expense` Deduce/inyecta caja localmente.
- **Proveedores:** Distribuye abonos secuencialmente en las deudas activas (`supplier_payment`).

---

## 🧮 3. Balance de Caja "Optimista"

Para saber cuánto dinero hay en la gaveta real sin conexión con la BD, se implementa una **Inyección de Caché Temporal (`lib/offlineCashCache.ts`)**:

1. A diferencia de las transacciones formales, se maneja un hub auxiliar para movimientos `bistro_active_movements_<business_id>` en localStorage.
2. Cada vez que afecta efectivo visible se inyecta un movimiento local (`offline_mov_...`).
3. Se dispara el `CustomEvent` de JS llamado `offline-cash-updated`.
4. Todos los listados reactivos inyectan temporalmente el componente, agregándole la muletilla `(Offline)` como un discriminante de seguridad para la UI.

---

## 🔄 4. Orquestación y Sincronización

Cuando `useOfflineSync.ts` (polling 15s) detecta confirmación de ping real a Supabase, desencadena `syncAll`:

### 🧩 Resolución de Dependencias Dinámicas (On-The-Fly)
Existe una diferencia notoria frente a un Event Sourcing tradicional: En lugar de mutar IDB cambiando IDs simulados a reales; **se delega la vinculación al Backend** durante o antes de la solicitud real.
Por ejemplo, para asociar el turno (Shift), busca de nuevo un estado `open` a nivel de DB o busca un ID recién subido antes de empujar el gasto/orden para atarlos dinámicamente, asegurando que nada se corrompa por referenciar IDs locales `offline_shift_X` descartados (orphan bypass technique).

### ⚖️ Atomicidad de Delegados
Cada tipo de evento usa un sincronizador atómico (`syncSale`, `syncSupplierPayment`, etc). Estos:
- Modifican el estado de IDB a `syncing`.
- Si logran su cometido (promesas resueltas), lo purgan por fin de la cola IndexedDB.
- Si hay un bloqueo persistente (error fatal en supabase), resuelven de vuelta el status a `failed` e incrementan retrys, pero **saltan** al siguiente en la cola permitiendo flujo contínuo sin interbloqueos de datos.
  
### 🧹 Purga Sincronizada
Al limpiar la cola (`synced > 0`), se despacha el evento global `offline-sync-completed` para que todas las vistas reactivas vuelvan a engancharse vía internet a Supabase destruyendo todas las impresiones falsas `(Offline)` reemplazadas por la estructura inmutable final en Postgres.

---

## 🎨 5. Interfaz de Usuario (UI/UX) Adaptativa

Para asegurar que la experiencia offline se sienta como un estado natural de la aplicación y no como un error intrusivo, el sistema adopta una arquitectura de indicadores responsiva en dos niveles (`SellScreen.tsx` & `OfflineIndicator.tsx`):

### 📱 Experiencia Móvil (`< 768px`)
- **Top Bar Global:** Se muestra una barra superior fija horizontal de advertencia. Para evitar solapar información, el `App.tsx` envuelve el layout principal en un padding dinámico (`pt-9`) de modo que "empuja" la aplicación hacia abajo.
- **Floating Toast (Sincronización):** Al recuperar la conexión, la notificación de sincronización exitosa aparece como un toast limpio en la zona superior central (sólo visible en móviles), evitando colisiones visuales.

### 💻 Experiencia Desktop (`≥ 768px`)
- **Indicador Integrado (Chip):** Se elimina el Top Bar global para maximizar el uso de pantalla. En su lugar, el estado se integra orgánicamente como un botón ("chip") compacto dentro del Header nativo (`SellScreen.tsx`).
- **Transición Sutil (Offline -> Sync Success):** Cuando se recupera la red y los datos se procesan, el "chip" color ámbar de "Sin conexión" es reemplazado en el mismo sitio (in-place) por un chip color verde esmeralda confirmando la `Sincronización Exitosa`, creando una transición limpia y sin elementos redundantes en pantalla.

### ℹ️ Centro de Información Offline (`OfflineFeaturesModal.tsx`)
Accesible desde los indicadores, este modal informa al usuario qué acciones están permitidas. Su diseño fue drásticamente compactado mediante micro-tipografías (11-13px), reducciones drásticas de padding y un sistema de "Subtle Scrollbar" transparente. Esto permite renderizar todas las reglas en pantalla sin la necesidad incómoda de hacer scroll en el navegador.

---

## 🍽️ 6. Mesas Offline (Modelo "Usuario Eje")

El módulo de **Mesas** opera sin conexión siguiendo el modelo **"Usuario Eje" (single-writer offline)**: para evitar que dos dispositivos editen o cobren la misma mesa sin poder resolver el conflicto, **solo un dispositivo con turno de caja abierto** (el *Eje*) puede escribir en las mesas mientras no hay internet. Los demás quedan en **solo lectura** con el último estado conocido.

El "usuario eje" **no es un rol ni un permiso nuevo**: es una condición operativa — tener un turno de caja abierto (`activeShift !== null`). El Eje puede tomar pedidos, agregar/quitar productos y modificadores, crear/editar/eliminar mesas y salas, imprimir comanda en la impresora local y **cobrar mesas offline aunque no tenga el permiso `canFinalizeSale`**.

### 🎯 Detección del Eje (vía presencia)

- `hooks/useEjeStatus.ts` determina el rol offline: `soyEje` (tengo turno abierto), `ejeOnline` (hay un Eje presente en el canal), `ejeNombre`, `multiEje` y `ejesNombres`.
- La lista de turnos abiertos se cachea en localStorage (`bistro_open_shifts_cache`, `[{ userId, userName }]`), refrescada con un fetch ligero de `cash_shifts` (`status='open'`) al entrar a Mesas y por Realtime estando online.
- Para saber si el Eje sigue conectado se **lee** el canal de presencia singleton ya montado (`lib/presenceManager.ts`, `getUsers()`) cruzándolo con la lista de turnos abiertos — **sin crear suscripciones nuevas**, con costo cero de Realtime.
- **Lectura puntual, no sondeo:** un observador con internet verifica la presencia del Eje **en el momento de abrir la mesa** (y una segunda vez justo antes de confirmar una escritura). No hay polling continuo.

### ❄️ Congelamiento del Observador

- **Observador offline:** ve el último estado conocido de las mesas en modo congelado, sin controles de edición ni cobro. Un banner indica que solo el Eje puede tomar pedidos, con su nombre: *"Sin internet. Solo [Nombre] (turno abierto) puede tomar pedidos a mesas ahora."*
- **Observador online + Eje sin conexión:** aunque el observador tenga internet, si el Eje no figura presente en el canal, las mesas quedan **en solo lectura** (el Eje es la única fuente de verdad). Banner: *"[Nombre] (cajero del turno) está sin conexión. Las mesas están en solo lectura hasta que se reconecte."* Al reconectarse el Eje, se restablece la operación normal según los permisos del observador.

### 💾 Snapshot de la orden en IndexedDB

A diferencia del event-sourcing granular del resto del motor offline, las mesas usan un **snapshot completo de la orden** por decisión de diseño (el modelo single-writer elimina los conflictos, así que no hace falta encolar cada item por separado):

- `lib/offlineTableStore.ts` (stores IndexedDB `tables`, `rooms`, `table_orders`, DB v4) guarda la lista de mesas/salas (`Cache_Mesas_IDB`) y la orden activa por mesa (`Cache_Orden_Mesa_IDB`, interfaz `CachedTableOrder`).
- Al obtener mesas/salas y órdenes estando online se cachean; offline se cargan desde IndexedDB (sobreviven a recargar la app). Si se arranca offline sin cache previa, se muestra un mensaje de que no hay datos de mesas disponibles sin conexión.
- Agregar/quitar items y modificadores offline **solo muta el snapshot local** (los modificadores se guardan como líneas hijas por `parent_local_id`), sin encolar nada por item. Los items aún no sincronizados muestran un badge **"pendiente de sincronizar"**.
- Los **CRUD de mesas y salas** sí se encolan por separado (`create_table`, `update_table`, `delete_table`, `create_room`, `update_room`, `delete_room`), con IDs temporales `offline_table_*` / `offline_room_*` que se mapean a su UUID real al sincronizar (`lib/offlineTableMap.ts`, réplica del patrón de `offlineClientMap.ts`).

### 💵 Cobro de mesa offline

- Se removió el guard que excluía las mesas del flujo offline de cobro. Cuando el usuario es **Eje** y está offline, cobrar una mesa encola **una sola transacción `sale`** con todos los items + `table_id` (posible `offline_table_*`) y `order_type: 'dine_in'` — idéntico al flujo de Orden Rápida offline ya probado.
- La **caja optimista** (`pushOfflineCashMovement`) refleja el movimiento del cobro igual que en una venta rápida offline.
- Tras cobrar, la mesa se **libera localmente** (disponible, sin orden). Al sincronizar, `syncSale` crea la orden + items, resuelve el `table_id` temporal y hace `UPDATE tables SET status='available', current_order_id=null`.
- **Cierre de turno bloqueado:** no se permite cerrar un turno (online u offline) con mesas pendientes. Mensaje: *"Termina de cobrar las mesas pendientes antes de cerrar."*

### 🖨️ Comanda offline

- Offline solo se ofrece la **impresora local (QZ)**; los destinos remotos se ocultan. Si no hay impresora local conectada → mensaje al usuario.
- El **envío remoto** vía Realtime queda bloqueado offline ("El envío a dispositivos remotos requiere conexión").
- Al enviar, los items se marcan como "en preparación" en el snapshot local.

### 🔄 Sincronización y señal de recarga

- `syncAll` procesa en orden: `create_room` → `create_table` → `update/delete` de salas/mesas → resto (incluye el `sale` de mesa). Los `offline_*` se resuelven antes de escribir; si aún no resuelven, la transacción permanece en cola para el próximo ciclo (no se descarta).
- **Detección de doble cobro:** si al sincronizar la mesa ya fue cerrada por otro dispositivo, la venta del Eje se conserva (es dinero real cobrado) con la nota "[Posible mesa ya cerrada]" y se avisa, sin duplicar caja.
- **Aviso de recarga obligatoria:** cuando el Eje termina de sincronizar todas sus transacciones de mesas (`getPendingCount() === 0`), escribe `bistro_last_eje_table_sync_at` y emite un broadcast `eje-sync-completed`. Los **observadores conectados** que ven Mesas reciben un modal bloqueante (`ForcedReloadModal`) que recarga la app; el Eje **nunca** lo ve. Un observador que se perdió la señal fuerza la recarga al reconectar si su cache de mesas es anterior a la última sincronización del Eje. La recarga preserva el carrito ya cacheado (Orden Rápida).

> [!NOTE]
> **Mejora futura (fuera de alcance):** la **coordinación técnica del multi-eje** (lock o partición de mesas entre varios cajeros con turno abierto) no está implementada. Cuando hay dos o más turnos abiertos, no existe lock técnico: solo se muestra un **aviso operacional** para que los cajeros se coordinen manualmente (*"Hay más de un cajero con turno abierto ([Nombres]). Mantengan comunicación si se cae internet para no cobrar la misma mesa dos veces."*). Un lock o partición de mesas queda registrado como mejora futura si el uso multi-cajero offline se vuelve frecuente.

---

## ⚠️ 7. Limitaciones Conocidas y Acciones Sin Fallback

### Acciones que fallan silenciosamente sin internet

Estas acciones **no tienen encolamiento offline** — si se intentan sin conexión, fallan sin guardar ninguna operación y sin un mensaje específico que explique la razón al usuario:

| Acción | Motivo | Comportamiento actual |
|--------|--------|-----------------------|
| Cobrar una orden con modo delivery | El delivery no tiene soporte offline implementado | Error genérico sin encolado |

**Impacto en el usuario:** El cajero ve un error al intentar cobrar en modo delivery, pero no sabe que es por falta de internet. Debe recuperar la conexión antes de intentarlo de nuevo.

> [!NOTE]
> **Cobrar una mesa offline ya está soportado** (para el Eje). Antes, cobrar una mesa sin internet fallaba con un error genérico; con el modelo **Usuario Eje** (ver sección 6), el dispositivo con turno de caja abierto **sí puede cobrar mesas offline**: la venta se encola como cualquier venta rápida (con `table_id`) y la caja optimista refleja el movimiento. Los demás dispositivos quedan en solo lectura mientras el Eje está sin conexión.

---

### Ventana de presencia (~15–30 s) al caer el Eje

El canal de presencia puede tardar unos segundos en retirar al Eje tras perder conexión. Durante esa ventana breve, un observador con internet podría ver al Eje como "presente" y editar una mesa que el Eje también está modificando offline. Es un **riesgo residual aceptado** del modelo single-writer: se mitiga con una segunda lectura de presencia justo antes de confirmar una escritura, pero no se elimina por completo.

---

### `delete_sale` — tipo definido, sincronizador no activo

El tipo `delete_sale` está declarado en `lib/offlineQueue.ts` como parte del diseño fundacional, pero el orquestador en `useOfflineSync.ts` lo ignora activamente. Actualmente **no es posible anular ventas sin internet** — las anulaciones requieren conexión siempre.

Esto significa que si un cliente crea una transacción de tipo `delete_sale` en la cola (por algún flujo futuro), el sincronizador la saltará indefinidamente sin ejecutarla ni reportar error. La guía de usuario ya refleja que anular ventas requiere internet.

---

### Abonos de clientes offline — movimiento de caja encolado

Cuando se registra un abono de cliente (`client_payment`) sin internet, `addPayment()` en `hooks/useClients.ts` hace dos cosas en una sola transacción local:

1. Encola el evento `client_payment` en la cola offline para reducir la deuda del cliente al sincronizar.
2. Si hay un `shiftId` activo, llama a `pushOfflineCashMovement()` con `type: 'cash_in'` (`hooks/useClients.ts` línea 305), que encola también el movimiento de entrada de caja con la descripción `Abono cliente: [nombre]` y el `payment_method` mapeado (`cash`, `nequi`, `daviplata`, etc).

**Efecto:** Al volver la conexión, el orquestador sincroniza ambos eventos de forma independiente — la deuda del cliente se reduce y el movimiento de caja queda registrado en el turno. El arqueo cuadra solo con el efectivo físico sin intervención del cajero.

**Precondición:** El abono offline solo genera movimiento de caja si hay un turno activo (`shiftId`) al momento del registro. Sin turno activo, solo se encola el `client_payment` y la deuda se reduce, pero no hay entrada de caja asociada.

---

## 🖨️ 8. Impresión de Contingencia

Cuando el sistema está offline y se genera una venta, se utiliza la plantilla de impresión de contingencia (`docs/caracteristicas/plantilla-contingencia-offline.html`). Esta plantilla HTML asegura que se pueda entregar un comprobante al cliente a pesar de no tener conexión al servidor de generación de facturas de Supabase, manteniendo el formato visual del negocio.
