# Historial de Ventas (SalesScreen)

Componente: `screens/SalesScreen.tsx`  
Hook principal: `hooks/useOrders.ts`  
Acceso: Menú principal → "Facturas"

Esta pantalla es el **registro histórico de todas las ventas completadas**. No interviene en el proceso de venta — es solo consulta y gestión post-venta.

---

## Layout

Layout de dos paneles lado a lado (desktop) o pantalla completa con navegación entre vistas (móvil/tablet):

- **Panel izquierdo**: lista de ventas con buscador y filtro de período.
- **Panel derecho**: detalle de la venta seleccionada con acciones.

En pantallas **< 1024px** (móvil y tablet), el detalle ocupa toda la pantalla y se navega con el botón `←`. Se usa `window.history.pushState` para que el botón físico de retroceso del dispositivo cierre el detalle en lugar de salir de la pantalla.

---

## Filtrado y Búsqueda

### Por texto
Busca simultáneamente en:
- Nombre del cliente (`customer_name`)
- Número de orden (`order_number`)
- Número de display (`display_number`)

### Por período
Dropdown en el header con opciones predefinidas:

| Opción | Rango |
|---|---|
| Todos | Sin filtro de fecha |
| Hoy | Día actual en timezone del negocio |
| Ayer | Día anterior en timezone del negocio |
| Últimos 7 días | Desde hace 6 días hasta hoy |
| Últimos 30 días | Desde hace 29 días hasta hoy |
| Este mes | Desde inicio del mes actual |
| Mes anterior | Mes completo anterior |
| Personalizado | Rango libre via `CustomDateRangePicker` |

> [!IMPORTANT]
> Todos los rangos de fecha se calculan respetando la **timezone configurada en el negocio** (via `useBusinessSettings`). Las funciones `startOfDayInTz`, `endOfDayInTz`, etc. de `lib/timezone.ts` garantizan que "Hoy" sea correcto incluso si el servidor está en otra zona horaria.

### Carga progresiva (optimización egress y performance)
La lista utiliza **paginación en servidor con scroll infinito** (`useSalesHistory`): solicita **20 ventas completas** inicialmente vía `.range(0, 19)`. Al desplazarse cerca del final del scroll, solicita las siguientes 20 ventas de forma continua. Cada lote de 20 contiene sus ítems y productos precargados en memoria para que la apertura del detalle sea instantánea (**0 ms**), y la memoria se libera automáticamente al salir de la pantalla. Al cambiar filtros o realizar una búsqueda, la paginación se reinicia a las primeras 20.

---

## Lo que se puede hacer

### Ver detalle de una venta
Al seleccionar una venta de la lista se muestra:
- Nombre del cliente y número de orden.
- Vendedor (`waiter_name`), si aplica.
- Fecha y estado (punto verde = completada).
- Tabla de ítems: producto, cantidad, valor unitario, valor total.
- Descuentos por ítem (si los hay).
- Subtotal, descuento global, y **total redondeado** (ver sección de redondeo).
- Método(s) de pago — soporta pagos divididos (`split_payments`).

> [!NOTE]
> **Etiqueta de pago dividido.** En la lista, el badge del método de una venta dividida
> (`payment_method = 'mixed'`) muestra los métodos unidos, ej. `Efectivo + Transferencia`
> (helper `getPaymentLabel`), en vez de "Otro". En el detalle, el footer desglosa cada
> parte de `split_payments`. Ver
> [`../historial_planes/2026-06-17-fix-pago-dividido-clasificacion.md`](../historial_planes/2026-06-17-fix-pago-dividido-clasificacion.md).

El header del detalle está dividido en **dos filas**:

1. **Fila 1 (info)**: botón de volver ← (solo móvil) + nombre del cliente + número de orden, fecha, vendedor.
2. **Fila 2 (acciones)**: todos los botones de acción centrados horizontalmente con espaciado uniforme (`justify-center gap-2`).

Los botones de la fila de acciones, de izquierda a derecha:
- 🖨️ Imprimir ticket
- 🍽️ Imprimir comanda (solo modo catálogo)
- 💬 WhatsApp
- ✉️ Email
- 📤 Compartir (share/descarga según plataforma)
- ⬇️ Descargar PDF
- 🚫 Anular venta **o** ↩ Devolución (uno u otro, según el turno — ver abajo)

> [!IMPORTANT]
> La acción de revertir una venta ya **no es un borrado físico**. Según el estado del turno de la venta se muestra **Anular** (turno abierto, corrección) o **Devolución** (turno cerrado, el cliente devuelve). Detalle completo del modelo, la exclusión mutua y el manejo de ventas a crédito en [`anulacion_devolucion_ventas.md`](./anulacion_devolucion_ventas.md).

Este layout en dos filas garantiza que todas las acciones sean accesibles tanto en móvil como en desktop sin depender de menús ocultos ni dropdowns.

### Reimprimir ticket
Botón de impresora (`print`). El botón muestra un punto verde cuando la impresora está conectada.
- **Con impresora conectada**: llama a `printThermalReceipt()` con los datos de la venta y el ancho de papel configurado en ajustes.
- **Sin impresora conectada**: en vez de fallar, abre el panel de conexión de impresora (`PrinterSettingsPanel`) para elegir y conectar la impresora, igual que en Ajustes → Facturación e Impresión. Tras conectar, el usuario vuelve a presionar imprimir y sale el ticket.

Ver `lib/thermalPrinterService.ts` y [`ajustes_facturacion.md`](./ajustes_facturacion.md).

### Reimprimir comanda de cocina
Botón naranja (`restaurant`), junto al de imprimir ticket. Llama a `printKitchenCommandDirect()` con los datos de la venta — la comanda sale completa con modificaciones (`notes`, `cooking_term`, `removed_ingredients`) y separadores entre productos. Muestra punto verde si la impresora está conectada.

> [!NOTE]
> **Sin impresora conectada, abre el panel de conexión**: al igual que el botón de imprimir ticket, si no hay impresora conectada el botón de comanda abre `PrinterSettingsPanel` para elegir y conectar (antes solo mostraba un toast de aviso "No hay impresora conectada").

> [!NOTE]
> **Solo visible en modo Catálogo.** El icono lee `localStorage.getItem('bistro_sale_mode')` al montar la pantalla. Si el dispositivo está en modo Escáner/EAN, el icono no aparece (no tiene sentido imprimir comandas de cocina en ventas de mostrador). El modo se guarda por dispositivo y persiste entre sesiones. Ver [`comandas_cocina.md`](./comandas_cocina.md).

### Compartir ticket (PDF)
Botón `share` en la fila de acciones. Llama a `shareThermalReceiptPDF()` — usa la Web Share API nativa si está disponible (móvil), o descarga el archivo directamente (desktop).

### Descargar PDF
Botón `file_download` en la fila de acciones. Genera y descarga el PDF del recibo térmico localmente via `downloadReceiptAsPDF()`.

### Enviar por WhatsApp
Botón con ícono de WhatsApp en la fila de acciones. Genera una URL pública del recibo (`/t/{orderNumber}-{hash}`) y abre WhatsApp con el mensaje prellenado. Si el cliente tiene teléfono registrado, lo prerrellena también. Intenta abrir la app nativa (`whatsapp://`) y si no responde en 1.5s, abre WhatsApp Web en ventana popup.

### Enviar por Email
Disponible en todos los dispositivos. Abre el modal `EmailReceiptModal` donde se ingresa el correo. Llama a `sendReceiptByEmailDirect()` de `lib/shareReceiptPDF.ts`.

### Anular una venta o un ítem (turno abierto)
En ventas del **turno abierto**, el botón 🚫 del encabezado anula la venta completa (`voidOrder`) y el botón 🚫 de cada fila anula ese ítem (`voidOrderItem`). Piden un **motivo** obligatorio. No se borra: la venta queda marcada como `voided` (tachada) conservando el rastro. Se revierte stock (solo `simple`), los `cash_movements` de la venta y, si era a crédito, la deuda del cliente.

### Devolver una venta (turno cerrado)
En ventas de **turnos ya cerrados**, en vez de anular se muestra ↩ **Devolución**, que abre el `RefundSaleModal` con la venta precargada. Ver el modelo completo en [`anulacion_devolucion_ventas.md`](./anulacion_devolucion_ventas.md).

> [!WARNING]
> Anular y Devolución son **mutuamente excluyentes**: un ítem ya devuelto no se puede anular y uno anulado no se puede devolver (validado en las RPC). En ventas a **crédito**, ninguna de las dos mueve caja — solo reducen la deuda del cliente.

### Editar un ítem de la venta
Cada fila de producto tiene un botón `✏` (lápiz). Al hacer click abre el modal `EditOrderItemModal` (`components/modals/EditOrderItemModal.tsx`) que permite:

- **Cambiar el producto**: buscador en tiempo real sobre el catálogo activo del negocio. Al seleccionar uno diferente se actualiza `product_id`, `product_name`, `unit_price` y `total_price`. También limpia `discount`, `discount_percent`, `promotion_id`, `notes` y `cooking_term` (eran específicos del producto anterior).
- **Modificar la cantidad**: input numérico con botones +/−. El `total_price` del ítem se recalcula con el precio unitario vigente × nueva cantidad.
- **Ambos a la vez**: en una sola operación.

Al confirmar llama a `updateOrderItem()` de `useOrders`, que invoca la RPC `update_order_item` en Supabase. El trigger `recalculate_order_total` actualiza `orders.subtotal` y `orders.total` automáticamente — no se toca la tabla `orders` desde el frontend.

El cambio se refleja de inmediato en los botones de compartir/imprimir/WhatsApp/email porque todos leen `sale.items` después del `fetchOrders()`.

> [!NOTE]
> **Stock**: al cambiar el producto, la RPC restaura el stock del producto anterior (solo `simple`) y descuenta el del nuevo (solo `simple`). Al cambiar solo la cantidad, ajusta el delta: cantidad mayor descuenta más stock, cantidad menor devuelve la diferencia. Los productos `processed` y `service` no revierten stock de ingredientes (comportamiento consistente con las demás RPCs).

### Eliminar un ítem de la venta
Cada fila de producto tiene un botón `×`. Llama a `deleteOrderItem()`. Si el ítem eliminado era el único de la orden, la venta se elimina completa y `setSelectedSaleId(null)`.

> [!NOTE]
> Al eliminar un ítem individual, solo los productos **SIMPLE (retail)** devuelven stock. Los servicios no manejan stock y no revierten inventario. Si el ítem era el único de la orden, se elimina la venta completa.

---

## Lo que NO se puede hacer

- **Cambiar el precio unitario de un ítem** — al editar, el precio se toma del catálogo actual del producto. No hay campo libre para escribir un precio arbitrario.
- **Cambiar el método de pago** — el método queda fijo al momento de la venta.
- **Agregar ítems a una venta existente** — no hay flujo de "abrir venta y agregar más".
- **Ver ventas anuladas** — las ventas anuladas **sí aparecen** en el historial (tachadas, con badge "ANULADA"). El filtro `historyOrders` incluye `status === 'completed' || status === 'voided'`.
- **Exportar a Excel/CSV** — no hay función de exportación masiva desde esta pantalla.
- **Ver el ticket original completo con logo** — se muestra el detalle como tabla, no como el recibo impreso.

---

## Redondeo del Total y Descuentos

El total y el descuento mostrados en lista y detalle **confían en el dato de la BD**. Desde el fix de descuentos (2026-07-24), `orders.discount` ya incluye el descuento global **más** el descuento por línea, y `orders.total` ya es el neto (subtotal − descuento, redondeado a $50). Por eso los helpers son directos:

```ts
const getRoundedTotal = (amount: number) =>
  Math.round(Math.max(0, amount) / 50) * 50;

// orders.total ya es el neto → se confía en él
const getSaleNetTotal = (sale: Order) => sale.total || 0;

// orders.discount ya incluye global + por ítem → se confía en él
const getSaleTotalDiscount = (sale: Order) => sale.discount || 0;
```

- **`getRoundedTotal`** redondea al múltiplo de **$50** más cercano (umbral en $25). Antes era $100 — el cambio se hizo para que la diferencia máxima entre el total real y lo cobrado baje de $49 a $24. Ya no se usa para calcular el neto (viene de `sale.total`); queda como fallback en `buildReceiptData`.
- **`getSaleNetTotal`** se usa en la lista lateral y en el footer del detalle. Devuelve `sale.total` directo.
- **`getSaleTotalDiscount`** se usa para la línea "Descuento" del footer. Devuelve `sale.discount` directo.
- La línea **"Ajuste"** del footer aparece cuando `getSaleNetTotal(sale) − (sale.subtotal − getSaleTotalDiscount(sale)) !== 0` (diferencia por redondeo a $50).

> [!WARNING]
> **No volver a sumar el descuento por ítem acá.** Hasta el 2026-07-25 estas funciones recalculaban `sale.discount + perItemDiscount`, lo que contaba el descuento por producto **dos veces** (porque `orders.discount` ya lo incluye desde el fix del 2026-07-24). El mismo error existía en `screens/PublicReceiptScreen.tsx` y `hooks/useSalesTotals.ts`. Ver [`../historial_planes/2026-07-25-fix-doble-descuento-historial-y-backfill.md`](../historial_planes/2026-07-25-fix-doble-descuento-historial-y-backfill.md).

Ver [`venta_por_peso_medida.md`](./venta_por_peso_medida.md) para el detalle completo de la regla de redondeo y la línea Ajuste en los recibos.

---

## Datos del Recibo (`buildReceiptData`)

Cada acción de compartir/imprimir/email construye un objeto `ReceiptData` a partir de la venta:

| Campo en `ReceiptData` | Fuente |
|---|---|
| `businessName` | `receiptBusinessName` → fallback `businessName` |
| `businessPhone` | `receiptPhone` → fallback `businessPhone` |
| `businessAddress` | `receiptAddress` → fallback `businessAddress` |
| `businessNit` | `businessSettings.businessNit` |
| `items` | `sale.items` mapeados con `product_name`, `quantity`, `unit_price`, `total_price`, `discount`, `discount_percent` |
| `subtotal` | `sale.subtotal` |
| `totalDiscount` | `sale.discount` (ya incluye global + por ítem) |
| `roundingAdjustment` | `roundedTotal − (sale.subtotal − totalDiscount)`, si ≠ 0 |
| `total` | `sale.total` (neto de la BD; fallback `getRoundedTotal(sale.subtotal − totalDiscount)`) |
| `paymentMethod` | `sale.payment_method` |
| `splitPayments` | `sale.split_payments` |
| `customerName` | `sale.customer_name` → fallback `'Consumidor Final'` |
| `sellerName` | `sale.waiter_name` |
| `customerDocument` | `sale.client?.id_number` → fallback `sale.client_id_number` |
| `creditAbono` | `sale.initial_abono` (abono inicial en ventas a crédito) |
| `creditAbonoMethod` | `sale.initial_abono_method` |
| `amountPaid` | `sale.amount_paid` |
| `change` | `sale.change_amount` |
| `customerPhone` | `sale.client?.phone` |
| `date` | `formatDateTimeInTz(sale.created_at, timezone)` |
| `orderNumber` | `sale.order_number` |
| `orderId` | `sale.id` |
| `displayNumber` | `sale.display_number` |

> [!NOTE]
> Los datos del recibo se leen desde `businessSettings` en tiempo real. Si el negocio cambia el nombre o teléfono de recibo en ajustes, los tickets de ventas históricas también cambiarán al reimprimirlos — no queda "grabado" el nombre que tenía el negocio al momento de la venta.

---

## Tipos de Orden

Cada venta muestra un indicador del tipo de orden. Los tipos son heredados del flujo de ventas desktop:

| `order_type` | Ícono | Label | Color |
|---|---|---|---|
| `delivery` | `delivery_dining` | Domicilio | Azul |
| `takeaway` | `shopping_bag` | Llevar | Rosa |
| `dine_in` | `table_restaurant` | Mesa | Morado |
| *(otros/null)* | `flash_on` | Orden Rápida | Ámbar |

> [!NOTE]
> En BistroPOS orientado a tiendas/minimercados, la mayoría de ventas son "Orden Rápida". Los tipos `delivery`, `takeaway` y `dine_in` son heredados de una fase anterior del producto orientada a restaurantes. Funcionan pero rara vez se usan en el flujo actual.

---

## Tablas de Supabase Involucradas (lectura)

| Tabla | Via | Uso |
|---|---|---|
| `orders` | `useOrders` | Lista de ventas, metadatos |
| `order_items` | `useOrders` (join) | Ítems de cada venta |
| `clients` | `useOrders` (join en `sale.client`) | Documento y teléfono del cliente |

La eliminación de ventas/ítems usa las funciones de `useOrders` que a su vez llaman a Supabase con las RPCs o deletes correspondientes.

---

## Inconsistencias y Notas

> [!NOTE]
> **Auto-selección en desktop**: al cargar la pantalla en desktop (≥ 1024px), se selecciona automáticamente la primera venta de la lista. Si el usuario acaba de llegar a la pantalla sin intención de ver ninguna venta específica, puede ser disruptivo.

> [!NOTE]
> **`sale-deleted` es un evento global en `window`**: cuando se elimina una venta, `window.dispatchEvent(new CustomEvent('sale-deleted'))` notifica a otros componentes. Es un patrón funcional pero frágil — si algún componente no está escuchando ese evento exacto, no se actualizará. Considerar migrar a estado global (context o Zustand) a futuro.

> [!WARNING]
> **Límite de 100 órdenes**: `useSales` carga máximo 100 registros de `orders` (todas las órdenes, sin filtrar por estado). En negocios con muchas cancelaciones o pedidos pendientes, las ventas completadas más antiguas pueden quedar fuera de esa ventana y no aparecer en el historial sin ningún aviso al usuario.
