# Venta por Peso y Medida

Algunos productos del inventario se venden por **cantidad variable** — Kilogramos, Libras, Litros, Metros, etc. — en lugar de venderse por unidad entera. Este documento describe cómo el sistema maneja ese tipo de producto desde que se escanea hasta que aparece en el ticket.

---

## ¿Qué productos activan este flujo?

Un producto activa el flujo de ingreso de peso/medida si su campo `unit` es cualquier valor diferente a `'Unidad'` o `'Und'`. La función de validación es:

```ts
const isWeightUnit = (unit?: string) => !!unit && unit !== 'Unidad' && unit !== 'Und';
```

Las unidades soportadas incluyen: Kilogramos, Libras, Gramos, Onzas, Arrobas, Toneladas, Litros, Mililitros, Galones, Metros, Centímetros, Pulgadas.

---

## Flujo de Ingreso — `PriceInputModal`

Cuando el sistema detecta que un producto tiene unidad variable (sea por escaneo, búsqueda manual, o tap en la tarjeta), **no lo agrega al carrito directamente**. En su lugar abre el componente `<PriceInputModal />`.

### Comportamiento según dispositivo

| Dispositivo | Input | Teclado |
|---|---|---|
| **Desktop** | Campo de texto (`inputMode: decimal`) | Teclado físico del sistema |
| **Móvil / Tablet** | Campo `readOnly` | Numpad embebido en el modal |

En móvil, el modal cierra el teclado virtual activo (mediante un input auxiliar off-screen) para que el numpad propio no interfiera con el teclado del sistema operativo.

En móvil, el modal es un **bottom sheet** con soporte de arrastre: si el usuario lo arrastra más de 100px hacia abajo, se cierra automáticamente.

### Cálculo del Precio

El precio total del item se calcula en tiempo real mientras el usuario escribe:

```
Total = Math.round(cantidad × precio_unitario)
```

Ejemplo: producto "Queso Blanco" a `$8.500/Kg` → ingreso `1,5 Kg` → total `$12.750`.

El resultado se muestra como **preview verde** debajo del campo de cantidad antes de confirmar.

### Al confirmar

```ts
const adjustedPrice = calculatedPrice / exactQty;
onConfirm(exactQty, adjustedPrice);
```

El sistema envía al carrito:
- `quantity`: la cantidad exacta ingresada (puede ser decimal, ej. `1.5`).
- `adjustedPrice`: el precio unitario del producto (sin cambio). Este valor garantiza que el total del carrito sea consistente con el preview del modal.

---

## Estrategia de Redondeo por Etapas

El redondeo no ocurre en un solo punto. Hay **tres etapas** con reglas distintas:

### Etapa 1 — Cantidad (`updateQuantity` en `App.tsx`)

Cada vez que se modifica la cantidad de un item (escaneo repetido, botón `+`/`-`, edición), se aplica:

```ts
const newQuantity = Math.round((product.quantity + delta) * 100) / 100;
```

**Redondeo a 2 decimales.** Esto evita el error de punto flotante de JavaScript (ej. `0.1 + 0.2 = 0.30000000000000004`) al operar con cantidades decimales de peso. El mismo patrón se aplica al acumular cantidades cuando el producto ya existe en el carrito:

```ts
quantity: Math.round((newCart[existingIndex].quantity + quantity) * 100) / 100
```

### Etapa 2 — Total por ítem (`cartTotal` en `App.tsx` y display en `MenuScreen`)

El total de cada item del carrito se calcula **sin decimales** con `Math.round` simple:

```ts
const itemTotal = Math.round(item.price * item.quantity);
```

Ejemplo: `8.500 × 1.5 = 12.750` → `Math.round(12750) = 12.750` (exacto en este caso).

Si hubiera un decimal residual por el precio: `8.333 × 1.5 = 12.4995` → `Math.round = 12.500`.

### Etapa 3 — Total Final de la Venta (`cartTotal`)

El total de toda la venta se redondea **al múltiplo de 50 más cercano**, con umbral en 25 (≥25 sube a 50, <25 baja a 0):

```ts
return Math.round(Math.max(0, grossSub - discTotal) / 50) * 50;
```

El mismo redondeo se aplica también en `PaymentScreen.finalTotal` (luego de restar el descuento manual del usuario):

```ts
const finalTotal = Math.round(Math.max(0, total - numericDiscount) / 50) * 50;
```

**Efecto práctico:** Una venta con total real de `$17.684` se cobra como `$17.700` (residuo `$34` → sube). Una de `$17.620` se cobra como `$17.600` (residuo `$20` → baja). La diferencia entre el monto real y el cobrado se llama **Ajuste** y aparece como línea separada en todos los recibos (ver más abajo).

**Por qué $50 y no $100:** En Colombia la moneda fraccional más pequeña en circulación efectiva ya no es solo `$100`; la moneda de `$50` se acepta normalmente. Redondear a `$50` reduce a la mitad la diferencia máxima entre el total real y lo cobrado (de hasta `$49` a hasta `$24`).

### Etapa 4 — Display de Cantidad en UI

En el carrito y en el ticket la cantidad se muestra redondeada a 2 decimales:

```ts
Math.round(item.quantity * 100) / 100   // en MenuScreen y thermalPrinterService
```

Esto evita mostrar `1.500000000000001` por errores de punto flotante.

### Tabla Resumen

| Etapa | Fórmula | Resultado |
|---|---|---|
| Cantidad en carrito | `Math.round(qty * 100) / 100` | 2 decimales |
| Total por ítem | `Math.round(price × qty)` | Entero, sin decimales |
| Total de venta | `Math.round(grossSub / 50) * 50` | Múltiplo de 50 |
| Display de cantidad | `Math.round(qty * 100) / 100` | 2 decimales |

> [!NOTE]
> El redondeo al múltiplo de `$50` en el total final puede generar una diferencia de hasta `$24` entre la suma exacta de ítems y lo que el cliente paga. Esta diferencia se muestra explícitamente como línea **Ajuste** en el ticket para que el cliente entienda por qué el TOTAL difiere del Subtotal − Descuento.

---

## Línea "Ajuste" en el Recibo

Cuando el total redondeado a $50 difiere del total real (Subtotal − Descuentos), la diferencia aparece como una línea adicional llamada **Ajuste** entre el Descuento y el TOTAL, con el signo correspondiente (`+` si el redondeo subió, `−` si bajó).

### Cálculo

En `App.tsx` (al construir `receiptData` después de la venta):

```ts
const rawSubtotal = cart.reduce((acc, item) =>
  acc + Math.round((item.originalPrice || item.price) * item.quantity), 0);
const itemsNetTotal = receiptItems.reduce((acc, item) => acc + item.total, 0);
const globalDiscount = details.userDiscount || 0;
const totalDiscount = (rawSubtotal - itemsNetTotal) + globalDiscount;
const unroundedTotal = Math.max(0, itemsNetTotal - globalDiscount);
const roundingAdjustment = details.amount - unroundedTotal;
```

- **`rawSubtotal`**: usa `item.originalPrice` cuando existe (productos en promoción donde `item.price` ya está descontado). Esto garantiza que el Subtotal mostrado sea el bruto y que el descuento de la promo aparezca como línea explícita.
- **`itemsNetTotal`**: suma `item.total` (ya con descuentos por ítem aplicados).
- **`totalDiscount`**: suma descuentos por ítem (de `item.discount`/`discountPercent` y de la diferencia `originalPrice − price` en promos) + descuento global del modal de pago.
- **`unroundedTotal`**: total real antes de redondear.
- **`roundingAdjustment`**: diferencia entre lo que se cobra (`details.amount`, ya redondeado a $50) y `unroundedTotal`. Si es `0` no se muestra la línea.

En `SalesScreen.buildReceiptData` (reimpresión desde historial), el cálculo equivalente parte de `sale.subtotal`, `sale.discount` y los descuentos por ítem almacenados en `order_items`.

En `PublicReceiptScreen` (página pública abierta desde el link de WhatsApp), también se replica este cálculo a partir de la orden cargada vía RPC `get_public_receipt`.

### Componentes que renderizan la línea Ajuste

| Componente | Uso | ¿Muestra Ajuste? |
|---|---|---|
| `ReceiptHTML.tsx` | Compartir como imagen / imprimir desde navegador | ✅ |
| `ReceiptPDF.tsx` | Descarga PDF tamaño carta | ✅ |
| `ReceiptThermal.tsx` | Fallback de impresión térmica (texto plano) | ✅ |
| `ReceiptThermalPDF.tsx` | PDF de ticket térmico (compartir) | ✅ |
| `lib/thermalPrinterService.ts` | Impresión directa USB ESC/POS | ✅ |
| `PublicReceiptScreen` (HTML) | Página pública del link de WhatsApp | ✅ |
| Footer del detalle en `SalesScreen` | UI del historial de ventas | ✅ |

### Atajos de Teclado (Desktop)
- Dígitos `0-9`, `.` o `,` → ingresan el valor.
- `Enter` o `=` → confirma y agrega al carrito.
- `Backspace` → borra el último dígito.
- `C` o `Delete` → limpia el campo completo.
- `Escape` → cancela y cierra sin agregar.

---

## Representación en el Carrito

El item de peso aparece en el carrito con su **cantidad decimal** y la unidad abreviada. Por ejemplo:

```
1.5 Kg  Queso Blanco  $12.750
```

En el carrito de modo EAN desktop (lista de ítems), la fila muestra adicionalmente un badge de edición que al tocarse abre el modal `<PriceInputModal />` nuevamente para corregir la cantidad (`eanWeightEditItem`). Al confirmar la edición, el sistema calcula el delta de cantidad y ajusta el carrito existente sin crear un nuevo item:

```ts
const delta = newQty - eanWeightEditItem.quantity;
updateQuantity(eanWeightEditItem, delta);
updateCartItem(eanWeightEditItem, { price: adjustedPrice });
```

---

## Representación en el Ticket Térmico

En `ReceiptThermal.tsx`, los productos con unidad variable se formatean en el mismo estilo que los de unidad entera, pero la abreviación de la unidad se obtiene del diccionario `UNIT_ABBR`:

```ts
const UNIT_ABBR = {
  'Kilogramos': 'Kg', 'Libras': 'Lb', 'Gramos': 'g',
  'Litros': 'Lt', 'Mililitros': 'ml', 'Galones': 'Gal',
  'Metros': 'm', 'Centímetros': 'cm', ...
};
```

Formato de línea en el ticket (papel 58mm, 28 caracteres de ancho):

```
 1.5 kg  Queso Blanco    $12.750
```

- Columna izquierda: cantidad (4 chars) + unidad abreviada (3 chars) + nombre.
- Columna derecha: total del item alineado a la derecha.
- Si el nombre del producto es más largo que el espacio disponible, `wordWrap()` lo divide en múltiples líneas sin romper palabras.

El total del item que aparece en el ticket es:

```
item.total = price × quantity  (redondeado)
```

Este valor viene del objeto `ReceiptData.items[].total` construido antes de enviar al componente.

---

## Referencias en Otros Documentos

- **Desktop EAN** → ver sección "Productos con Peso" en [`flujo_ventas_desktop.md`](./flujo_ventas_desktop.md)
- **Móvil/Tablet Scanner** → ver sección "Productos con Peso en Modo Scanner" en [`flujo_ventas_movil_tablet.md`](./flujo_ventas_movil_tablet.md)
