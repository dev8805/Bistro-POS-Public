# Comandas a Cocina (Impresión Local y Remota)

Componentes: `components/SuccessSidebar.tsx`, `screens/SuccessScreen.tsx`, `screens/SalesScreen.tsx`, `components/ComandaLabelModal.tsx`, `components/ComandaLabelHeaderButton.tsx`  
Hooks: `hooks/useKitchenPrinter.ts`, `hooks/useComandaLabels.ts`, `hooks/useComandaLabelsVisibility.ts`  
Servicios: `lib/kitchenCommandService.ts`, `lib/thermalPrinterService.ts`  
Tablas Supabase: `comanda_labels` (etiquetas por negocio), `comanda_labels_visibility` (pestañas visibles por negocio)  
Columnas de `businesses`: `comanda_label_shortcut_enabled` (habilita el botón "Pedido" en el header del carrito)  
Tecnología: Supabase Realtime (Presence + Broadcast) + impresión local vía QZ Tray

Sistema de impresión de comandas de cocina. La comanda es un ticket simplificado optimizado para cocina. Se puede:

1. **Imprimir localmente** en la misma impresora del dispositivo que finalizó la venta (sin red).
2. **Enviar remotamente** a otro dispositivo de cocina que la imprime automáticamente (vía Supabase Realtime).

> [!NOTE]
> La impresión usa **QZ Tray** (ver [`impresion_termica_qz.md`](./impresion_termica_qz.md)). El presence de comandas depende del estado de la impresora (`getPrinterStatus()`), por lo que `useKitchenPrinter` reconecta al iniciar para anunciarse automáticamente.

> [!IMPORTANT]
> La sección de comanda (local y remota) **solo aparece cuando la venta se hace en modo Catálogo** (`!isEanMode`). En modo Escáner/EAN no tiene sentido imprimir comandas de cocina, así que no se muestra. Ver sección **"Detección del modo Catálogo"**.

---

## Arquitectura

```
┌─────────────┐                              ┌───────────────────┐
│   CAJERO    │   (A) Impresión LOCAL        │ Impresora USB del  │
│  (Success)  │ ───────────────────────────→ │ mismo dispositivo  │
│             │   printKitchenCommandDirect  │  (sin red)         │
│             │                              └───────────────────┘
│             │
│             │   (B) Realtime Broadcast     ┌───────────────────┐
│             │ ───────────────────────────→ │ COCINA (con USB)  │
│             │   event: command-for-X       │  useKitchenPrinter│
│             │                              │  → auto-print     │
└─────────────┘                              └───────────────────┘
       ↑                                              ↑
       │         Realtime Presence                    │
       └──── ve lista de impresoras online ───────────┘
```

### Componentes del Sistema

| Componente | Función |
|------------|---------|
| **Impresión local** | El dispositivo con impresora USB conectada imprime la comanda directamente con `printKitchenCommandDirect()` — sin pasar por la red |
| **Presence** | Cada dispositivo con impresora conectada se anuncia en el canal `printer-presence-{businessId}` |
| **Broadcast** | El cajero envía comanda al canal `kitchen-commands-{businessId}` con evento `command-for-{userId}` |
| **Auto-print** | El dispositivo destino recibe el evento y ejecuta `printKitchenCommandDirect()` |

---

## Flujo del Cajero (modo Catálogo)

### A) Imprimir comanda en el mismo dispositivo (local)

Si el dispositivo que finalizó la venta tiene una impresora USB conectada (la misma que usa para tickets), aparece la sección **"Comanda"** con el botón:

- `[🍽️ Imprimir Comanda aquí | 🟢]`

Al hacer click, llama directamente a `printKitchenCommandDirect()` sobre la impresora local. **No usa Supabase Realtime** — es instantáneo y funciona sin conexión.

Tras imprimir, el botón cambia a `[✅ Reimprimir Comanda]` pero **sigue habilitado**, permitiendo reimprimir las veces que haga falta.

### B) Enviar comanda a otro dispositivo (remoto)

Sección **"Enviar Comanda"** muestra empleados con impresora online:
- Cada botón: `[🍽️ Nombre | ROL | 🟢]`
- Solo aparecen los que tienen impresora USB conectada (excluye al propio usuario)

Click en un empleado → envía la comanda dirigida a ese usuario. Los botones **siguen disponibles tras enviar**, permitiendo reenviar. Aparece además la confirmación `[✅ Comanda Enviada]`.

**Si no hay impresoras remotas online:**
- `SuccessSidebar`: muestra "Sin impresoras de comanda disponibles" (gris), solo si tampoco hay impresora local
- `SuccessScreen` (mobile): no muestra esa sección

---

## Etiquetado previo de la comanda (modal)

Componente: `components/ComandaLabelModal.tsx`  
Hook: `hooks/useComandaLabels.ts`  
Tabla: `public.comanda_labels`

Al enviar la comanda a cocina, se pueden agregar etiquetas rápidas al header del ticket: **Localizador**, **Mesa** y/o **Tipo de pedido**. Se imprimen en la parte superior del ticket para orientar al personal de cocina (por ejemplo: "LOCALIZADOR: 2" para pedidos que se retiran, "MESA: 4" para pedidos en salón, "** Domicilio **" para domicilio).

### Dos puntos de acceso

1. **Botón "Pedido" en el header del carrito** (recomendado — desktop `MenuScreen` y móvil/tablet `PaymentScreen.renderMobileSummary`). El cajero elige las etiquetas mientras arma la orden. Al tocar el botón se abre el `ComandaLabelModal` con la selección actual precargada. Se muestra al lado del badge "Orden Rápida"/"Mesa X".
   - Estado elevado a `App.tsx` (`comandaLabelSelection`), pasado por props a `MenuScreen`, `PaymentScreen`, `SuccessScreen` y `SuccessSidebar`.
   - Se limpia al iniciar una nueva venta (`handleStartNewSale`) y al vaciar el carrito (`handleClearCart`).
   - Solo aparece si el negocio tiene activada la preferencia `businesses.comanda_label_shortcut_enabled` (Ajustes → Activar/Desactivar → "Botón Pedido en el carrito").
   - Solo aparece en modo Catálogo.
2. **Modal previo en `SuccessScreen`/`SuccessSidebar`** (fallback). Al tocar una tarjeta del `ComandaTargetGrid`:
   - Si `preselectedComandaLabels` viene con valores → se envía directo (sin modal, para evitar redundancia).
   - Si viene vacío → se abre el modal previo como hasta antes.

> [!IMPORTANT]
> **Este "Mesas" es distinto del sistema de mesas del POS** (`public.tables`). Aquí son solo etiquetas de texto libres que se imprimen en la comanda. No modifican estado de mesas ni órdenes.

### UX del modal

- **3 pestañas**: Localizador, Mesas, Tipo de pedido.
- **Selección combinable entre pestañas**: se pueden marcar las 3 simultáneamente (ej. Localizador 3 + Mesa 5 + Domicilio).
- **Dentro de cada pestaña la selección es única** (un solo Localizador, una sola Mesa, un solo Tipo de pedido).
- **Indicador visual por pestaña con selección**: cuando una pestaña tiene una etiqueta activa se pinta con fondo `bg-primary/20` (light) / `bg-primary/15` (dark), y muestra un punto amarillo al lado del nombre. Así el cajero ve de un vistazo qué pestañas ya cuentan.
- **Botón "Editar lista"** en las 3 pestañas: activa modo edición donde cada píldora se convierte en un input con `×` para eliminar. Al final aparece un input `+` para agregar nuevas etiquetas (hasta 20 caracteres).
- **Ícono de tuerca** en el header: abre un panel para mostrar u ocultar cada pestaña individualmente. La configuración es compartida por negocio (persistida en `public.comanda_labels_visibility`). Al menos una pestaña siempre queda visible (no se puede ocultar la última).
- **Botón "Enviar comanda"** al pie: cierra el modal y dispara el envío real al destino que estaba pendiente (local o remoto).

### Persistencia y semilla

**Tabla `public.comanda_labels`** — etiquetas rápidas:
- Compartida por negocio (`business_id`).
- Columnas: `id, business_id, kind ('locator'|'table'|'takeaway'), value, position, created_at, updated_at`.
- **UNIQUE(business_id, kind, value)** evita duplicados.
- **RLS**: SELECT para todos los del negocio; INSERT/UPDATE/DELETE solo para Administrador y Cajero (mismo patrón que `expense_categories`).
- **Semilla idempotente**: la primera vez que un negocio abre el modal, si no hay registros, `useComandaLabels` inserta los defaults:
  - `locator`: `1..10`
  - `table`: `1..10`
  - `takeaway`: `Para llevar`, `Domicilio`
- Se usa `upsert(..., { ignoreDuplicates: true })`. Es seguro correrlo desde varios dispositivos en paralelo.

**Tabla `public.comanda_labels_visibility`** — visibilidad de pestañas:
- Compartida por negocio (PK = `business_id`).
- Columnas: `business_id, locator_visible, table_visible, takeaway_visible, updated_at` (todos boolean con default `true`).
- **RLS abierta a cualquier miembro del negocio** (SELECT/INSERT/UPDATE sin filtro por rol) — es preferencia de UI, no data sensible.
- **Restricción de UX**: el modal no permite ocultar las 3 pestañas simultáneamente (al menos una debe quedar visible).

**Caché en localStorage**:
- `bistro_comanda_labels_v3_{businessId}` — lista de etiquetas.
- `bistro_comanda_labels_visibility_v1_{businessId}` — visibilidad de pestañas.
- Las escrituras (add/rename/remove/toggle) requieren red.
- **Cambio de defaults / esquema**: si cambian los defaults sembrados o la forma del cache, se debe incrementar la constante `CACHE_VERSION` del hook correspondiente para invalidar cachés antiguos.

### Flujo de envío

```
Usuario toca tarjeta (local o remota)
        ↓
Se guarda pendingTarget = { kind, id, label }
Se abre ComandaLabelModal
        ↓
Cajero elige Localizador / Mesa / Para llevar (opcional)
        ↓
Toca "Enviar comanda"
        ↓
onConfirm(selection) → arma KitchenCommandData con:
  { ...baseCommand, locatorLabel, tableLabel, takeaway }
        ↓
Si target.kind === 'local'  → printKitchenCommandDirect(...) + setDefaultPrinter('COMANDA', ...)
Si target.kind === 'remote' → sendKitchenCommand(businessId, targetUserId, ...)
        ↓
showToast + cierra modal + limpia pendingTarget
```

### Bordes cubiertos

- **Modal en `busyTargetId` activo**: no permite cerrar mientras se está enviando (evita canceles a mitad de camino).
- **Etiqueta eliminada mientras está seleccionada**: si el cajero borra la píldora que estaba marcada, se limpia automáticamente la selección de esa pestaña.
- **Rename optimista**: la UI actualiza local primero y ante error de red hace rollback y muestra el mensaje del hook.
- **Sin destino remoto disponible + sin impresora local**: el modal no se dispara porque el grid muestra directamente el CTA "Conectar impresora" (ver `ComandaTargetGrid`).

---

## Flujo del Dispositivo de Cocina

1. Abre la app con cualquier sesión (ej: usuario "Cocina")
2. Conecta una impresora desde Ajustes (requiere QZ Tray instalado — ver [`impresion_termica_qz.md`](./impresion_termica_qz.md))
3. El hook `useKitchenPrinter` se activa automáticamente:
   - Al iniciar, **reconecta** la impresora guardada (`reconnectPrinter()`) para anunciarse sin abrir pantallas concretas
   - Se anuncia en Presence como "online con impresora"
   - Escucha comandas dirigidas a su `userId`
4. Cuando recibe una comanda → imprime automáticamente

### Detección de Estado

- **Impresora conectada** → se une al canal Presence
- **Impresora desconectada** → sale del canal Presence (desaparece de la lista del cajero)
- **QZ Tray cerrado / WebSocket caído** → `setClosedCallbacks` pone el estado en `disconnected` y se sale de Presence
- **App cerrada** → Presence lo detecta automáticamente y lo remueve

---

## Formato de Comanda

La comanda es un ticket simplificado optimizado para cocina. Cada producto se separa con una línea discontinua para que cada fila quede en su propio bloque visual.

### Header en 80mm (48 columnas) — dos columnas

Cuando hay etiquetas del modal (`locatorLabel`, `tableLabel` o `takeaway`), el header se imprime en **dos columnas de 24 caracteres** para ahorrar papel:

```
                  *** COMANDA ***

LOCALIZADOR: 2          Orden: 1661
MESA: 4                 Hora: 07:26 p. m.
** Domicilio **         Cajero: Alejandro
================================================
```

- **Columna izquierda**: etiquetas del modal (`LOCALIZADOR:`, `MESA:`, `** {tipo de pedido} **`). Se imprimen **sin bold y altura normal**, mismo peso visual que los productos.
- **Columna derecha**: info de la orden (`Orden:` con bold, `Hora:`, `Cajero:`, y opcionalmente `Mesa:` del POS o `Cliente:`).
- **Filas desparejas**: si un lado tiene menos elementos que el otro, se rellena con espacios (por ejemplo, si solo hay Localizador y no Mesa/Para llevar, las líneas 2 y 3 de la derecha quedan solas al margen derecho).
- **Truncado**: si un texto excede su columna (24 chars), se corta y se le agrega `.` al final. Ocurre solo con etiquetas custom largas o nombres de cajero muy largos.

### Header en 58mm o sin etiquetas del modal — layout vertical clásico

En **58mm (32 columnas)** dos columnas no caben cómodamente (`** PARA LLEVAR **` ya son 17 chars). También en **80mm sin etiquetas del modal**, la info de la orden vuelve al margen izquierdo como si el modal no hubiera pasado:

```
         *** COMANDA ***

Orden: 1234
Mesa: Mesa 5
Cliente: Juan
Hora: 14:32
Cajero: María
================================
```

### Ítems (mismo formato en ambos anchos)

```
================================================
2x Hamburguesa Clásica       ← alto x2
  >> Término Medio            ← alto x2
  SIN Cebolla                 ← alto x2
  * Extra queso               ← alto x2
------------------------------------------------
1x Papas Fritas
  >> Con sal
------------------------------------------------
3x Coca Cola
================================================
                  3 productos
```

Campos incluidos:
- Cantidad + nombre del producto
- `>> Opciones/etiquetas` (cookingTerm)
- `SIN Ingrediente` (removedIngredients)
- `* Nota adicional` (notes)
- **Separador `dashed`** entre cada producto (no después del último, que ya lleva el `rule double` de cierre)

### Tamaño de letra (legibilidad para 50+)

La comanda la recibe el personal de cocina, frecuentemente mayor de 50 años, por lo que el contenido del pedido se imprime más grande que en el ticket de venta. Es una **decisión de formato distinta a la del ticket** (no comparten estilo).

- **Producto y modificaciones**: se imprimen en **alto x2** (`encoder.height(2)`), **ancho normal**, **sin negrita**.
  - El **alto x2** (≈6 mm vs ≈3 mm normal) es lo que da legibilidad a distancia.
  - El **ancho normal** se eligió a propósito en vez de x2: con ancho x2 solo caben 24 caracteres por línea en 80 mm y los nombres largos se partirían en varias líneas. Con ancho normal caben hasta 48 caracteres, así **ningún nombre se corta** y todos entran en una sola línea.
  - Se quitó la **negrita** porque en térmica engrosa los trazos y reduce la nitidez; el peso normal se lee mejor a ese tamaño.
- **Encabezado** (orden, mesa, cliente, hora, cajero) y el **pie** (`N productos`) quedan en **tamaño normal** — son datos de contexto, no lo que se prepara.

> [!NOTE]
> La impresora térmica solo escala el texto por **múltiplos enteros** (x1, x2, x3…) de forma independiente en alto y ancho; no existe un tamaño de fuente continuo. Por eso el ajuste se hace con `height(2)` y no con un valor en puntos.

Previews a tamaño real (HTML, abrir al 100% de zoom) en [`docs/previews/`](../previews/): `comanda-unificada-preview.html` refleja el formato actual.

> [!NOTE]
> Las modificaciones (`cookingTerm`, `removedIngredients`, `notes`) provienen del carrito. Para que lleguen a la comanda se propagan a través de `ReceiptItem` (campos opcionales `notes`, `cookingTerm`, `removedIngredients` en `types.ts`), se rellenan en los 3 puntos de `App.tsx` donde se construye `receiptItems`, y los handlers de comanda en `SuccessScreen`/`SuccessSidebar` usan esos valores reales. El **ticket de venta** (`printReceiptDirect`) no lee esos campos, por lo que no se ve afectado.

> [!NOTE]
> **Productos-modificadores (add-ons):** son líneas reales de la orden (`ReceiptItem.isModifier = true`). En la comanda, el map de `SuccessScreen`/`SuccessSidebar` **omite** esas líneas y **anexa** sus nombres (`ReceiptItem.modifiers` del padre) al `cookingTerm` del producto padre → salen como `>> nombre`. En el **ticket** sí salen como líneas separadas (no se agrupan). Ver [`etiquetas_por_categoria.md`](./etiquetas_por_categoria.md) → "Productos como Modificadores".

---

## API del Servicio

### kitchenCommandService.ts

```typescript
// Enviar comanda a un usuario específico
sendKitchenCommand(businessId, targetUserId, commandData): Promise<boolean>

// Escuchar comandas dirigidas a un usuario
subscribeToKitchenCommands(businessId, userId, onCommand): () => void

// Anunciarse como dispositivo con impresora
joinPrinterPresence(businessId, userInfo): { updatePresence, unsubscribe }

// Ver quién tiene impresoras online
subscribeToPrinterPresence(businessId, onSync): { unsubscribe }
```

### Interfaces

```typescript
interface KitchenCommandData {
    orderNumber?: number;
    displayNumber?: string;
    tableName?: string;          // mesa del sistema POS (public.tables)
    customerName?: string;
    items: KitchenCommandItem[];
    date: string;
    sellerName?: string;
    // Etiquetas del ComandaLabelModal — opcionales y combinables:
    locatorLabel?: string;       // p. ej. "2"           → "LOCALIZADOR: 2"
    tableLabel?: string;         // p. ej. "4"           → "MESA: 4" (independiente de tableName)
    takeawayLabel?: string;      // p. ej. "Domicilio"   → "** Domicilio **"
}

interface KitchenCommandItem {
    name: string;
    quantity: number;
    notes?: string;
    cookingTerm?: string;
    removedIngredients?: string[];
    unit?: string;
}

interface PrinterPresence {
    userId: string;
    userName: string;
    role: string;
    printerConnected: boolean;
    onlineAt: string;
}
```

---

## Hooks

### `useKitchenPrinter()`
- Uso: se monta globalmente en `App.tsx`
- Si hay impresora conectada → anuncia Presence + escucha comandas
- Si se desconecta → sale de Presence + deja de escuchar
- Retorna: `{ lastCommand, commandCount }`

### `useAvailablePrinters()`
- Uso: en `SuccessSidebar` y `SuccessScreen`
- Suscribe al canal de Presence para ver impresoras online
- Filtra su propio userId (el usuario no se ve a sí mismo en la lista de envío remoto; para imprimir en su propio dispositivo usa el botón de impresión local)
- Retorna: `PrinterPresence[]`

---

## Reimpresión desde el Historial (SalesScreen)

En `screens/SalesScreen.tsx`, el detalle de cada venta incluye un icono de comanda (`restaurant`, naranja) junto a los demás iconos de acción (compartir, PDF, ticket, WhatsApp, correo, eliminar).

- Al hacer click, llama a `printKitchenCommandDirect()` con los datos de `selectedSale`.
- Los ítems traen `notes`, `cooking_term`, `removed_ingredients` y `sale_unit` desde la base de datos (`OrderItem`), por lo que la comanda sale completa con modificaciones y separadores.
- Sigue el mismo patrón del icono de ticket: punto verde si hay impresora conectada; si no hay impresora, muestra un toast de aviso.
- **Solo se muestra en modo Catálogo** (ver siguiente sección).

---

## Detección del modo Catálogo

La comanda solo tiene sentido en **modo Catálogo** (`!isEanMode`), no en modo Escáner/EAN. El modo se detecta así:

| Pantalla | Cómo detecta el modo |
|---|---|
| `SuccessScreen` (móvil) | Recibe prop `isCatalogMode={!isEanMode}` desde `App.tsx` |
| `SuccessSidebar` (desktop) | Recibe prop `isCatalogMode={!isEanMode}` desde `MenuScreen.tsx` |
| `SalesScreen` (historial) | Usa `isCatalogModeEnabled` del contexto `useBusinessSettings` |

### Persistencia del modo (Supabase — cambio 2026-06-23)

- El estado `isEanMode` se **deriva** en `App.tsx` como `!isCatalogModeEnabled` (campo `catalog_mode_enabled` en tabla `businesses`).
- Es una configuración **por negocio** (no por dispositivo). Se propaga en tiempo real vía Supabase Realtime.
- Se configura desde Sidebar → Ajustes → "Activar/Desactivar" (solo el dueño puede cambiarlo).
- Ya no existe `localStorage` `bistro_sale_mode` ni selectores de modo en el POS.

---

## Gate de carga de la pantalla de éxito (anti-salto)

Al finalizar una venta, el recibo (`receiptData`) y el total ya están listos en el momento del montaje, pero dos señales llegan de forma **asíncrona** y, sin control, hacían que la UI "saltara":

1. `printerConnected` — la impresora local se confirma tras `reconnectPrinter()` (afecta "Imprimir Comanda aquí" e "Imprimir Ticket").
2. `availablePrinters` — la lista de presence se llena cuando llega el `sync` de Supabase (afecta "Enviar Comanda").

**Solución:** `SuccessSidebar` (desktop/tablet) y `SuccessScreen` (móvil) tienen un gate `isReady`. Mientras no está listo se muestra un spinner sobrio centrado (`progress_activity`); al estar listo se revela el panel **completo y final una sola vez**, con su animación (`fadeIn` en el sidebar, `scaleIn` en la tarjeta móvil). No hay estados intermedios ni reflows.

**Condición de "listo"** (lo que ocurra primero):
- Entró una impresora por presence (`availablePrinters.length > 0`) → revela **inmediatamente**.
- Pasaron **800 ms** desde el montaje → revela con el estado final (incluido el caso "sin impresoras", para el que el `sync` de presence no es fiable).

El valor de 800 ms es un único `setTimeout` en cada componente, fácil de ajustar.

---

## Configuración Necesaria

Para que funcione:
1. Crear un usuario con rol "Cocinero" (o cualquier rol)
2. Iniciar sesión en un dispositivo de cocina (tablet/PC)
3. Instalar y configurar QZ Tray, y conectar la impresora desde Ajustes → Facturación e Impresión (ver [`impresion_termica_qz.md`](./impresion_termica_qz.md))
4. Dejar la app abierta (el tab activo)

**Base de datos**: la tabla `public.comanda_labels` (creada en migración `20260701_create_comanda_labels.sql`) guarda las etiquetas rápidas de Localizador/Mesa por negocio. Se crea sola en cada negocio al abrir el modal por primera vez (semilla `1..10`). Fuera del modal, el envío de comandas usa solo Supabase Realtime (Presence + Broadcast) sin escribir nada en base de datos.

---

## Archivos Involucrados

| Archivo | Rol |
|---------|-----|
| `lib/kitchenCommandService.ts` | Servicio de Presence + Broadcast (sin cambios — no afectado) |
| `lib/thermalPrinterService.ts` | `printKitchenCommandDirect` (ESC/POS) — incluye render de dos columnas del header cuando hay etiquetas del modal; conexión QZ con guard de concurrencia y `setClosedCallbacks` |
| `hooks/useKitchenPrinter.ts` | Hooks `useKitchenPrinter` (auto-reconexión + presence), `useAvailablePrinters` |
| `hooks/useComandaLabels.ts` | CRUD contra `comanda_labels` + caché localStorage + seed idempotente `1..10` |
| `components/ComandaLabelModal.tsx` | Modal previo (3 pestañas Localizador/Mesas/Para llevar); modo edición con `x`/`+`; llama `onConfirm(selection)` |
| `components/ComandaTargetGrid.tsx` | Grid de destinos (local/remoto); dispara la apertura del modal via `onPrintLocal`/`onSendRemote` |
| `components/SuccessSidebar.tsx` | UI comanda local + remota (desktop); prop `isCatalogMode`; intercala `ComandaLabelModal` |
| `screens/SuccessScreen.tsx` | UI comanda local + remota (mobile); prop `isCatalogMode`; intercala `ComandaLabelModal` |
| `screens/SalesScreen.tsx` | Icono de reimpresión de comanda en el historial; lee `isCatalogModeEnabled` del contexto |
| `screens/MenuScreen.tsx` | Pasa `isCatalogMode` al `SuccessSidebar`; `isScannerMode` se sincroniza con `isEanMode` |
| `types.ts` | `ReceiptItem` con campos opcionales `notes`, `cookingTerm`, `removedIngredients` |
| `App.tsx` | Monta `useKitchenPrinter`; `isEanMode` derivado de `isCatalogModeEnabled` (Supabase); propaga modificaciones a `receiptItems` |
| `supabase/migrations/20260701_create_comanda_labels.sql` | Migración de la tabla `comanda_labels` con RLS + trigger `updated_at` |
| `supabase/migrations/20260702_comanda_labels_takeaway_and_visibility.sql` | Amplía `kind` a `takeaway` + tabla `comanda_labels_visibility` + backfill defaults |
| `supabase/migrations/20260703_add_comanda_label_shortcut_enabled.sql` | Columna `businesses.comanda_label_shortcut_enabled` (toggle del header) |
| `supabase/migrations/20260704_seed_comanda_labels_visibility_all_businesses.sql` | Backfill + trigger AFTER INSERT en `businesses` |

---

## Comanda desde Mesa (sin finalizar la venta) — `SendCommandaModal`

Además del flujo de comanda en la pantalla de éxito, existe el envío de comanda **desde el carrito de una mesa**, antes de cobrar (ver [`mesas.md`](./mesas.md)).

- Se dispara con el botón/FAB **"Enviar Comanda"** del carrito en modo mesa.
- `components/SendCommandaModal.tsx` toma solo los items **nuevos** (`order_items.status` distinto de `preparing/ready/served`), permite elegir impresora (local vía `printKitchenCommandDirect` o remota vía `sendKitchenCommand`), y luego marca esos items como `preparing` + la orden `preparing` + la mesa `occupied`.
- Esto da **comanda parcial**: si después se agregan más productos, solo esos nuevos se envían en la siguiente comanda.

> [!IMPORTANT]
> **Regla de suscripción de Presence:** el hook `useAvailablePrinters` (canal `printer-presence-{businessId}`) solo debe estar suscrito por **un** componente a la vez en cada cliente. Dos canales con el mismo topic en el mismo cliente rompen la detección de impresoras entre dispositivos. Por eso `SendCommandaModal` se **monta únicamente cuando está abierto** (`{showSendCommanda && <SendCommandaModal/>}`), nunca de forma permanente. Lo mismo aplica a cualquier componente nuevo que use `useAvailablePrinters`.
