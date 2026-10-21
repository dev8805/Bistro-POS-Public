# Flujo de Compra de Inventario

Componente: `components/expense/InventoryPurchase.tsx`  
Acceso: Panel de Gastos → Compra de Inventario

Permite registrar la entrada de mercancía al inventario con actualización de stock, registro contable y soporte offline. Tiene dos pestañas: **Compra de Inventario** (formulario activo) e **Historial** (lista de compras recientes).

---

## Formas de Agregar Productos al Carrito

### 1. Búsqueda Manual

El usuario escribe en el campo de búsqueda de productos (`invProductSearch`). Muestra un selector filtrado por nombre. Al seleccionar un producto, abre un campo para ingresar cantidad y costo unitario antes de agregarlo al carrito de compra (`inventoryItems`).

### 2. Escaneo por Código de Barras (Pistola USB + Cámara móvil)

El panel "Seleccionar productos" (`showProductSelector`) habilita dos vías de escaneo por barcode, ambas convergen en el mismo `<BarcodeInputModal />` que pide cantidad y costo unitario antes de empujar al carrito (`inventoryItems`).

**Pistola USB (desktop / tablet):**

El hook `useBarcodeScanner(products, onMatch, showProductSelector, onNotFound, priority=true)` está activo mientras el panel esté abierto. Detalles clave:

- **Prioridad sobre `MenuScreen`**: el quinto parámetro `priority=true` registra esta instancia en el contador global `_priorityCount` del hook. Mientras esté >0, las instancias sin prioridad (en particular el `useBarcodeScanner` de `MenuScreen` montado en background por `App.tsx`) ceden el escaneo. Esto evita que la pistola agregue al carrito de ventas mientras el operador está en compra de inventario.
- **`data-barcode-passthrough="true"` en el input de búsqueda**: permite que el hook procese el escaneo aunque el cursor esté en el buscador. Los dígitos que la pistola escribe en el campo antes del Enter se limpian en el callback (`setInvProductSearch('')`).
- **Producto no encontrado**: el callback `onNotFound` muestra un toast `"Código X no encontrado en el catálogo"` y limpia el buscador.

**Cámara del celular (móvil, < md):**

Un botón con ícono `qr_code_scanner` junto al input de búsqueda (oculto en desktop con `md:hidden`) activa `showCameraScanner`. Renderiza el `<BarcodeScanner variant="embedded" continuousMode>` ocupando un wrapper modal `z-[80]` con header (botón **Listo** + contador del carrito) y pie de instrucción.

- **Modo continuo**: la cámara queda activa entre escaneos. El cooldown interno del componente (1500ms) evita disparar dos veces el mismo código por error.
- **Z-index escalonado**: cámara `z-[80]` < `BarcodeInputModal z-[100]` — al detectar un código, el modal de cantidad/costo aparece encima de la cámara sin cerrarla.
- **Guard `if (barcodeScanProduct) return`** en `onScan` previene que un nuevo escaneo dispare mientras el modal de cantidad sigue abierto.
- **`playErrorBeep()` + toast** cuando el código no existe en el catálogo. La cámara sigue activa.
- **Botón Listo** del header cierra solo la cámara; el panel "Seleccionar productos" sigue abierto.

Lógica de captura del escaneo (ambas vías):

```ts
useBarcodeScanner(
    products,
    (product) => { setBarcodeScanProduct(product); setInvProductSearch(''); },
    showProductSelector,
    (code) => { setInvProductSearch(''); showToast(`Código ${code} no encontrado…`, 'error'); },
    true, // priority
);
```

### 3. Escaneo de Factura con IA (`scan-invoice`)

La vía más avanzada. Permite fotografiar o cargar una factura del proveedor y extraer automáticamente los productos, cantidades y costos unitarios usando Gemini.

**Estados del escáner:**

```
'form' → 'scanning' → 'review' → 'form'
```

#### Entrada de Imagen
El usuario puede proveer la imagen por:
- **Cámara** (`cameraScanInputRef`, `capture="environment"`) — toma foto directa.
- **Galería** (`galleryScanInputRef`) — selecciona archivo del dispositivo.
- **`<DocumentScanner />`** — componente dedicado de corrección de perspectiva para facturas físicas.
- **Portapapeles** — imagen pegada desde otra app.

La imagen se comprime vía `compressImage()` (de `lib/imageUtils`) antes de enviarse: máximo 1024px, JPEG al 60%.

#### Edge Function `scan-invoice`
Recibe el `base64` de la imagen + la `invoiceConfig` del proveedor seleccionado, y llama a **Gemini Vision API** (`gemini-2.0-flash`). La config le dice a Gemini cómo se llaman las columnas de la tabla de la factura (descripción, cantidad, precio unitario). El resultado es un array `items[]` con `{ description, quantity, unitCost, ocr_unit, ...extraFields }`.

> [!NOTE]
> Cada proveedor puede tener su propia `invoiceConfig` que mapea los nombres de columna de su factura. Se configura una sola vez y se guarda en `suppliers.invoice_config` en Supabase via `<InvoiceConfigPanel />`.

#### Parseo de Números Latinoamericanos
Antes de pasar los datos al carrito, la función `parseLatinNumber()` normaliza los formatos numéricos:
- `1.500` (miles con punto) → `1500`
- `1,5` (decimal con coma) → `1.5`
- `"3"` (string) → `3`

#### Algoritmo de Emparejamiento (`matchScannedProducts`)
Idéntico en lógica al de ventas (`usePhotoOrder`), con prioridad en cascada:

| Prioridad | Criterio | Resultado |
|---|---|---|
| 1 | Nickname exacto | `matched` |
| 2 | Nickname parcial (único resultado) | `matched` |
| 3 | Nombre exacto (case insensitive) | `matched` |
| 4 | Nombre parcial (único resultado) | `matched` |
| — | Sin coincidencia | `unmatched` |

Los items sin coincidencia se muestran en `<InvoiceReviewPanel />` con un buscador para asignación manual y la opción de **guardar el nombre OCR como nickname** del producto en Supabase.

#### Confirmación (`handleConfirmScannedItems`)
Al confirmar en el panel de revisión, los items se **fusionan** con el carrito actual:
- Si el producto ya está en el carrito, **acumula** la cantidad y actualiza el costo unitario.
- Si no existe, lo agrega como nuevo item.

---

## Carrito de Compra (`inventoryItems`)

Cada item tiene: `product`, `quantity` (string), `unitCost` (string), `extraFields` (campos adicionales de la factura).

El **total por item** se calcula como:
```ts
getItemTotal(item) = parseFloat(item.unitCost) * parseFloat(item.quantity)
```

El **total del carrito** es la suma de todos los totales por item.

---

## Modos de Pago

### Contado (`isCredit = false`)
El usuario indica si descuenta de la caja registradora (`deductFromCashRegister`). Si hay turno activo y se descuenta de caja:
- Se valida que haya saldo suficiente en el método de pago antes de proceder.
- Si hay múltiples métodos de pago, el monto de cada uno se distribuye proporcionalmente entre los productos.

Soporta **pago dividido**: se pueden agregar múltiples métodos de pago con montos parciales vía `addPaymentMethod()`.

### Crédito (`isCredit = true`)
- El usuario selecciona o crea un **proveedor/acreedor** (`creditorName`).
- Puede registrar un **abono inicial** (`inventoryPaidAmount`).
- Puede fijar una **fecha de vencimiento** (`dueDate`).
- El sistema crea un registro de deuda con proveedor en la tabla `debts`.

#### Dropdown de selección de proveedor — comportamiento en móvil (≤430px)

El dropdown usa `position: absolute` anclado al input de búsqueda (`relative flex-1`). En pantallas ≤430px el input queda angosto porque el botón "CREAR" ocupa espacio a su derecha, lo que truncaba nombres largos de proveedores.

Corrección: se aplica un media query `max-[430px]` con:
- `-left-6` → sale del padding del formulario, a ~8px del borde de pantalla
- `right-auto` + `w-[calc(100vw-1rem)]` → el dropdown ocupa el ancho de pantalla menos 16px

En desktop/tablet el comportamiento es idéntico al original (`left-0 right-0`). El desbordamiento no genera scroll horizontal porque el scroll container padre ([línea ~756](../../components/expense/InventoryPurchase.tsx)) cubre todo el ancho del panel sin padding lateral.

---

## Proceso de Guardado (`handleSave`)

### Modo Offline
Si no hay conexión (`!navigator.onLine`):
1. Actualiza el stock localmente en **IndexedDB** (via `saveAdminProducts`) de forma optimista.
2. Despacha `inventory-updated` para que el catálogo refresque el stock desde IDB inmediatamente (evita que el tendero crea que la compra no se guardó).
3. Encola la operación en `offlineQueue` con tipo `'inventory_purchase'`.
4. Si corresponde, registra el movimiento de caja offline en `offlineCashCache`.
5. Al recuperar conexión, el sistema de sync procesa la cola usando `increment_stock` (RPC atómica) para evitar race conditions cuando hay múltiples compras pendientes del mismo producto.

### Modo Online
Por cada item del carrito:

1. **Actualiza el stock** en Supabase via `updateProductStock(productId, quantity, creditorName, date, unitCost)`. Esto crea un `inventory_lot` y devuelve el `lotId`.
2. Dispara el evento `inventory-updated` para refrescar la UI en tiempo real.
3. Según el modo de pago:
   - **Crédito**: crea un registro `debt` con `status: 'active'`, el `lotId` vinculado y el `supplier_id` del proveedor seleccionado (para evitar ambigüedad en eliminaciones futuras). Si hay abono inicial, crea un segundo registro `debt` de tipo abono y llama a `recordPurchase` en caja.
   - **Contado + descuento de caja**: llama a `recordPurchase` por cada método de pago, distribuido proporcionalmente. El `lotId` se almacena como `reference_id` en el movimiento de caja para permitir reversas exactas. Crea un `debt` con `status: 'paid'` para trazabilidad contable.

4. Llama a `onSave()` del componente padre para registrar el egreso. Si este paso falla, el sistema muestra un mensaje distinguido — "Los productos se guardaron, pero hubo un error al registrar el egreso" — para evitar duplicados por confusión del usuario.

---

## Historial de Compras

Muestra las últimas 50 compras filtradas desde `debts` donde `inventory_lot_id` pertenece a un lote activo (`remaining_quantity > 0`).

### Edición de una Compra (`handleOpenEditInventory`)
Permite corregir la **cantidad** y el **costo total** de una compra registrada. El costo unitario se recalcula: `unitCost = newCostTotal / newQty`.

### Eliminación de una Compra (`handleDeleteInventoryPurchase`)
Antes de eliminar, el sistema verifica bloqueos:
- **Stock negativo**: no se puede eliminar si el producto está en 0 o negativo.
- **Unidades ya vendidas**: no se puede eliminar si ya se vendieron unidades de ese lote — eliminarla descuadraría el análisis de ganancias.

Si procede, revierte el stock y, si la compra fue de contado con turno activo, llama a `reverseCashMovement` pasando el `inventory_lot_id` como `referenceId`. Esto permite encontrar el movimiento de caja exacto por `reference_id` en lugar de buscar por monto (que podría encontrar el movimiento de otra compra del mismo valor en el mismo turno).

> [!IMPORTANT]
> **Seguridad en evaluación de fórmulas de costo (`evaluateCostFormula`)**: el método `new Function()` usado actualmente en `InvoiceReviewPanel.tsx` para evaluar fórmulas de costo de proveedores es una superficie de ejecución de código arbitrario. Pendiente de reemplazar con un parser matemático seguro (ej. `mathjs` o expresiones propias restringidas a `+`, `-`, `*`, `/`). Mientras tanto, solo usuarios con acceso a la configuración de proveedores (`invoice_config`) pueden configurar fórmulas.

---

## Tablas de Supabase Involucradas

| Tabla | Operación | Cuándo |
|---|---|---|
| `inventory_lots` | INSERT | Al registrar cada item de la compra |
| `business_debts` | INSERT | Para trazabilidad contable (contado y crédito). Guarda `supplier_id` e `inventory_lot_id` |
| `products` | UPDATE (stock) | Via `updateProductStock` / `increment_stock` RPC |
| `suppliers` | SELECT / UPDATE | Al gestionar proveedores e `invoice_config` |
| `cash_movements` | INSERT | Si se descuenta de caja (`recordPurchase`). `reference_id` = `lotId` |

### Escaneo de facturas — consideraciones

- **Tamaño máximo de archivo**: 50MB. Archivos más grandes se rechazan antes de comprimirse para evitar crasheos en dispositivos de gama baja.
- **Timeout de escaneo**: 45 segundos. Si Gemini no responde en ese tiempo, la UI vuelve automáticamente al formulario.
- **Códigos HTTP de la Edge Function**: `500` si Gemini falla, `422` si la respuesta de Gemini no es JSON parseable, `200` en éxito.
- **Items sin coincidencia en revisión**: si el tendero intenta confirmar con productos sin asignar, el panel muestra un aviso y requiere una segunda confirmación explícita.

---

## Evidencia y proveedor obligatorio (desde 2026-06-07)

- **Proveedor obligatorio** también en compras de contado (se eliminó el "Proveedor de Contado" automático). El guardado se bloquea sin proveedor.
- Se puede adjuntar **una imagen de evidencia** (factura) con `<EvidenceUploader>`, comprimida a WebP y subida al bucket público `debt-evidence`. La URL se guarda en `business_debts.evidence_url` en cada fila de la compra (crédito o contado). Una compra multi-ítem comparte la misma URL de factura en todas sus filas.
- La evidencia es consultable y compartible por WhatsApp desde el historial del proveedor en `DebtsScreen`. Ver [`deudas_negocio.md`](./deudas_negocio.md).

---

## Historial de Compras de Inventario

En la pestaña **Historial**:
- **Visualización progresiva:** Inicialmente renderiza **10 compras**.
- **Scroll infinito:** Al acercarse al final del contenedor con scroll ($\approx 60\text{px}$ del fondo), incrementa la cantidad visible en 10 elementos adicionales (`visibleCount += 10`). Esto agiliza el renderizado del DOM en dispositivos móviles sin bloquear la interfaz.
- **Soporte Offline y Consistencia:** Se alimenta de las deudas del negocio gestionadas en `useDebts`, garantizando disponibilidad sin conexión y compatibilidad total con arqueo y balance.
