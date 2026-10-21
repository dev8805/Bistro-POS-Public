# Flujo de Ventas: Desktop (Modo EAN)

`MenuScreen.tsx` es el componente central de ventas. En **Desktop (`>= 1024px`) el único modo de venta soportado y vigente es el Modo EAN**. El grid de productos con toggle de vista está marcado para eliminación en el futuro y no debe tomarse como referencia de implementación.

---

## 1. Captura de Productos — Modo EAN Desktop

Activado por defecto en desktop. Reemplaza el grid de productos por un layout de dos paneles horizontales optimizado para pistola de códigos de barras + teclado físico.

- **Panel izquierdo:** Barra de búsqueda EAN + lista de carrito con scroll.
- **Panel derecho:** `<PaymentSidebar />` durante el cobro → `<SuccessSidebar />` post-venta.

### Escáner de Barras (Pistola USB)
- El hook global `useBarcodeScanner` **se desactiva** en Desktop EAN para evitar doble adición.
- La pistola actúa como emulación de teclado: escribe el código en el input de búsqueda y envía `Enter`.
- Al agregar un producto, el campo se limpia y el foco regresa automáticamente al input (`refocusSearchInput()`), listo para el próximo escaneo.
- Si el producto ya está en el carrito, se incrementa la cantidad en lugar de duplicarlo.

### Búsqueda Manual y Atajos de Teclado
- `ArrowDown` / `ArrowUp` → navegan sugerencias del autocompletado.
- `Enter` → confirma la selección resaltada.
- `+` / `-` → incrementan o decrementan la cantidad del último item seleccionado.
- **Categorías:** Reemplaza la barra horizontal por un dropdown compacto.

### Productos con Peso
Si el producto tiene una unidad de peso (Kg, Lb, g, etc.), al escanearlo se abre el modal `<PriceInputModal />` para ingresar la cantidad exacta antes de agregar al carrito. El precio total se calcula en tiempo real con un preview visual antes de confirmar.

> Ver documentación completa: [`venta_por_peso_medida.md`](./venta_por_peso_medida.md)

---

## 2. Proceso de Cobro (`PaymentSidebar.tsx`)

Panel lateral montado directamente en `MenuScreen`. No hay navegación a `PaymentScreen` en Desktop EAN.

### Navegación por Teclado
El sidebar captura `ArrowLeft`/`ArrowRight`/`ArrowUp`/`ArrowDown` para moverse entre tabs (Pago Directo / Crédito), iterar métodos de pago y llegar al botón "Finalizar" sin usar el mouse.

### Venta al Contado (Pago Directo)
- Al seleccionar **Efectivo**, el foco salta automáticamente al campo "Efectivo Recibido" (`cashInputRef.current?.focus()`).
- El campo de descuento acepta porcentaje (`%`) o monto (`$`) con cálculo cruzado en tiempo real.
- **Validación numérica estricta:** usa `parseVal()` — solo extrae números, no admite fórmulas como "10+5".
- **Pago Mixto:** divide el cobro entre varios métodos. Muestra un indicador de estado: Completo / Restante / Excedido. Al activarlo, el sidebar realiza automáticamente un **desplazamiento vertical suave (smooth scroll)** hacia el desglose de métodos de pago para enfocar de inmediato los inputs numéricos. Por simetría estética, el contenedor de pago directo/crédito se alineó para tener la misma altura y simetría que los otros campos adyacentes.

### Venta a Crédito
- Requiere seleccionar un cliente registrado y una fecha de vencimiento — ambos campos son obligatorios y bloquean el botón "Finalizar" si están vacíos.
- Búsqueda por nombre, teléfono o número de documento. Muestra la deuda existente del cliente en el dropdown.
- **Edición inline:** permite corregir nombre, teléfono o dirección del cliente sin salir del flujo de venta.
- **Abono inicial:** opcional. Si se ingresa, despacha dos operaciones en cadena:
  1. `addPayment()` — registra el abono en la cuenta corriente del cliente.
  2. `addCashIn()` — registra el ingreso en caja **solo si hay conexión activa y un turno de caja abierto**. En modo offline o sin turno, el abono se guarda en cuenta pero no en caja.

---

## 3. Emisión de Comprobantes

Tras confirmar el pago (`onProcessPayment`), el panel derecho cambia de `<PaymentSidebar />` a `<SuccessSidebar />` sin cambiar de pantalla.

### Ticket Térmico (`ReceiptThermal.tsx`)
Para impresoras de 58mm u 80mm. Genera texto monoespaciado con:
- **Cabecera:** Nombre del negocio, NIT (opcional), Teléfono, Dirección, etiqueta "Comprobante de entrega".
- **Cuerpo:** `[cantidad] [unidad abreviada] [nombre] → $[total]`. Los nombres largos se parten con `wordWrap`. Las unidades se abrevian con el diccionario `UNIT_ABBR` (ej. "Kilogramos" → "Kg").
- **Totales:** Subtotal, Descuento global (`-$`), Total Neto, Método(s) de Pago, Cambio (si aplica).
- **Pie:** Vendedor y mensaje de agradecimiento.

### Envío por WhatsApp
Desde `<SuccessSidebar />`, construye un resumen de texto de la venta y lo lanza via `whatsapp://send?text=...` (protocolo nativo). Si no está disponible, usa `https://web.whatsapp.com/send` como fallback web.

---

## Cómo se decide el modo activo (EAN vs Catálogo)

- `App.tsx` deriva `isEanMode = !isCatalogModeEnabled` (config del **negocio**, tabla `businesses.catalog_mode_enabled`).
- Se cambia desde Sidebar → Ajustes → **Activar/Desactivar** (solo el dueño). Se propaga por Realtime a todos los dispositivos.
- **El grid de productos desktop NO es código muerto**: se muestra con `hidden lg:grid` cuando `!isEanMode` (Catálogo). En modo Escáner el grid queda oculto y toma la doble columna Cart + PaymentSidebar descrita arriba.
- Ya no existe toggle en el header del POS: el modo es config del negocio. Ver [`modo_catalogo_pos.md`](./modo_catalogo_pos.md) para el detalle del modo alternativo.

> [!NOTE]
> **`ProductCard.tsx`** sigue importado en `MenuScreen.tsx` pero sin uso en el JSX (las cards del grid son inline). Se conserva por si se reactiva un modo grid alternativo. Candidato a limpieza si se decide no reactivarlo.
