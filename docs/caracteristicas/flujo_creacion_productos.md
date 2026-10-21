# Flujo de Creación y Edición de Productos

Componentes:
- `screens/SimpleProductScreen.tsx` → Productos físicos (tipo `SIMPLE`) — para venta o como **Insumo** (`is_for_sale=false`)
- `screens/ProcessedProductScreen.tsx` → Productos con receta (tipo `PROCESSED`)
- `screens/ServiceProductScreen.tsx` → Servicios con receta (tipo `SERVICE`)

Acceso: Panel de Productos → "Crear Producto" / botón de edición en tarjeta de producto.

El menú **Crear** (en `ProductsScreen` y `SellScreen`) ofrece: **Crear Producto**, **Crear Insumo**, **Crear Receta**, **Crear Servicio** y **Crear Promoción**. "Crear Insumo" abre `SimpleProductScreen` en modo Insumo (misma bandera de sesión descrita abajo).

Ambos comparten la misma estructura base (panel lateral deslizante, mismas opciones de imagen, mismo sistema de apodos), pero difieren en campos, comportamiento de stock y lógica de guardado.

---

## Tipos de Producto

El selector "Tipo de producto" en el formulario navega entre pantallas:

| Tipo | Pantalla | Código `ProductType` |
|---|---|---|
| Producto para venta / Insumo | `SimpleProductScreen` | `SIMPLE` |
| Producto con Receta | `ProcessedProductScreen` | `PROCESSED` |
| Servicio | `ServiceProductScreen` | `SERVICE` |

El selector de `SimpleProductScreen` ofrece **Producto**, **Ingrediente** y **Servicios** (este último navega a `ServiceProductScreen`). El de `ProcessedProductScreen` ofrece **Producto**, **Ingrediente**, **Producto con Receta** y **Servicios**.

Como **Insumo** no es un `ProductType` propio (es `type='simple'` + `is_for_sale=false`), elegirlo en el selector de `ProcessedProductScreen` navega a `SimpleProductScreen` dejando la bandera `sessionStorage['bistro_create_product_as_insumo']`. `SimpleProductScreen` la consume al montar (solo en creación) para abrir con `isForSale=false`, y la borra enseguida para no afectar la próxima creación.

> [!IMPORTANT]
> El tipo **no se puede cambiar** una vez creado. Al editar, el selector aparece como campo `readOnly`. Esto es por diseño — cambiar el tipo implicaría migrar datos de stock, lotes e ingredientes.

---

## Producto Simple (`SimpleProductScreen`)

### Campos del Formulario

| Campo | Obligatorio | Notas |
|---|---|---|
| Nombre | ✅ Sí | Primera letra automáticamente en mayúscula. |
| Categoría | ✅ Sí | Usa `CategorySelector`. |
| Costo | ✅ Sí | Precio de compra. Base para cálculo de márgenes y mermas. |
| Precio de venta | ❌ No | Si se deja en 0, el producto puede venderse a costo 0. |
| Unidad de venta | ✅ Sí | Selector obligatorio — arranca en "Elegir..." (sin valor por defecto). Determina qué unidad se muestra en ventas y ticket. El selector también muestra unidades personalizadas ya usadas por el negocio. **Editable en modo edición.** Ver [`venta_por_peso_medida.md`](./venta_por_peso_medida.md). |
| Stock inicial | ❌ Solo en creación | **Bloqueado (readOnly) en edición.** El stock se gestiona por movimientos (compras, ventas, mermas). |
| Código EAN/UPC | ❌ No | Permite escáner físico o búsqueda en API externa. |
| Imagen | ❌ No | Subida, cámara, o pegado desde portapapeles. |
| Apodos | ❌ No | Aliases para búsqueda por nombre corto en ventas. |
| Unidades de compra | ❌ No | Configuración del `conversion_factor` para compras por lote. |
| Presentaciones de venta | ❌ No | Múltiples formatos de venta con stock unificado (cajetillas, cubetas, six-packs). Ver [`presentaciones_venta.md`](./presentaciones_venta.md). |

### Producto para venta vs Insumo (`is_for_sale`)

El selector de tipo permite crear el producto como **Insumo** (`is_for_sale=false`). Un insumo es mercancía que el negocio compra y usa internamente (como ingrediente de recetas) pero **no vende directamente**.

| Modo | `is_for_sale` | Campos visibles | Dónde aparece |
|---|---|---|---|
| **Producto para venta** | `true` | Todos (precio, EAN, apodos, etc.) | Catálogo de ventas + tab Productos |
| **Insumo** | `false` | Costo, Stock, Unidad, Categoría, Imagen, Unidades de Compra | **No** en catálogo de ventas. Tab **Insumos** + tab Ingredientes de Inventario |

En modo Insumo, `handleSave` fuerza `price=0`, `barcode=null`, `nicknames=[]` y `description='Insumo'`. Al editar, el formulario reabre con el modo correcto (`productToEdit.is_for_sale`). Ver tab Insumos en [`catalogo_productos.md`](./catalogo_productos.md).

### Unidades de Venta Disponibles
`Unidad`, `Kilogramos`, `Libras`, `Gramos`, `Onzas`, `Arrobas`, `Litros`, `Mililitros`, `Galones`, `Metros`.

Las unidades de peso/volumen habilitan la venta por peso/medida. Ver [`venta_por_peso_medida.md`](./venta_por_peso_medida.md).

### Código EAN — Lookup Automático

Al ingresar un código de barras, el sistema intenta enriquecer el producto automáticamente via `lookupBarcode()` de `lib/barcodeLookup.ts`:

- **Pistola de escáner**: detectado por velocidad de tipeo (< 50ms por carácter). Se activa automáticamente al completar el código.
- **Teclado manual**: se activa al presionar `Enter` o al hacer clic en el ícono de búsqueda (solo visible si el código tiene ≥ 4 caracteres).
- **Cámara de barcode**: botón amarillo que abre `BarcodeScanner`. Al escanear, llama al mismo lookup.

Si el lookup encuentra el producto:
1. Si el campo de nombre está vacío, lo autocompleta con el nombre encontrado.
2. Si hay imagen disponible en la API y el producto aún no tiene imagen, descarga, comprime y enlaza automáticamente (`downloadAndCompressExternalImage`).

> [!NOTE]
> El lookup es **asistencia**, no obligatorio. El usuario puede ignorar o sobreescribir el nombre sugerido.

### Código EAN — Contribución al Catálogo Global

Cuando el usuario **crea** un producto, `handleSave` puede contribuir su nombre e imagen al catálogo global llamando a `saveProductToBarcodeCatalog()` de `lib/barcodeLookup.ts`:

```ts
// Solo al CREAR, y solo si hay código + imagen + nombre
if (!productToEdit && barcode.trim() && imageUrl && productName.trim()) {
    await saveProductToBarcodeCatalog(barcode.trim(), productName.trim(), imageUrl);
}
```

Las cuatro condiciones son obligatorias; si falta el código, la imagen o el nombre, **no se guarda** (un registro sin imagen no aporta valor al catálogo):

| Condición | Por qué |
|---|---|
| `!productToEdit` | Solo aporta al crear, nunca al editar. |
| `barcode.trim()` | El catálogo se indexa por código. |
| `imageUrl` | La imagen es el valor diferencial del catálogo. |
| `productName.trim()` | Sin nombre no sirve como sugerencia. |

Esto guarda (upsert por `barcode`) en `barcode_catalog` con `source: 'user'`, usando la URL de imagen ya subida a Supabase Storage. El **nombre y la imagen del usuario siempre mandan**: si el código ya existía en el catálogo (p. ej. de `ean-db`), se reemplazan con los del usuario, porque él sabe cómo vende su producto. `brand`/`quantity` quedan en `null` porque `productName` ya es el nombre de display final (evita doble prefijo en futuros lookups).

La próxima vez que cualquier usuario de la plataforma escanee ese código, `lookupBarcode()` lo encontrará en el primer paso (caché Supabase) y autocompletará el nombre e imagen.

### Apodos (Nicknames)

Los apodos permiten buscar el producto por nombre corto en el flujo de ventas. El campo de apodos tiene un botón **"Agregar"** que aparece dentro del input solo cuando hay texto escrito. Al presionar Enter o tocar "Agregar", el sistema verifica unicidad antes de agregarlo:

```ts
supabase.from('products')
  .select('id, name')
  .eq('business_id', ...)
  .contains('nicknames', [trimmedNickname])
  .neq('id', productToEdit?.id)  // excluye el producto actual en edición
  .limit(1)
```

Si el apodo ya existe en otro producto, se muestra un toast de advertencia y se bloquea su adición. Los apodos se guardan como array en `products.nicknames`.

Son clave para el matching en [`flujo_ventas_movil_tablet.md`](./flujo_ventas_movil_tablet.md) (modo scanner) y en [`escaneo_facturas_ia.md`](./escaneo_facturas_ia.md).

### Unidades de Compra

Permite configurar múltiples formas de compra para el mismo producto. Ejemplo: un producto vendido por `Unidad` puede comprarse en `Caja` (factor: 12) o en `Paca` (factor: 24).

Unidades predefinidas: `Caja`, `Paca`, `Bulto`, `Paquete`, `Galón`, `Balde / Tobo`, `Unidad`. El selector (`PurchaseUnitSelector`) también incluye unidades personalizadas ya utilizadas en otros productos del negocio (cargadas desde `product_purchase_units`), y permite crear una nueva unidad con nombre libre escribiéndola en el buscador.

Cada entrada se configura en un **modal** (cambio 2026-08 — antes era inline) que solicita:
- **Nombre de la unidad**: seleccionado del `PurchaseUnitSelector`
- **Factor de conversión**: cuántas unidades de venta trae esa unidad de compra.

El factor se usa en [`flujo_compra_inventario.md`](./flujo_compra_inventario.md) para registrar compras en bulk sin calcular manualmente.

Se almacenan en la tabla `product_purchase_units` (relación 1:N con `products`).

### Guardado (`handleSave`)

**Validaciones:** nombre + costo + categoría + unidad de venta + `business_id` son obligatorios.

**Creación:**
1. `INSERT` en `products` con `type: 'SIMPLE'`, `is_active: true`, `is_for_sale: true`, stock inicial.
2. Si `stock > 0`, crea un lote inicial en `inventory_lots`:
   ```ts
   { initial_quantity: stock, remaining_quantity: stock, unit_cost: cost, notes: 'Stock inicial de creación manual' }
   ```
3. Sincroniza `product_purchase_units`: inserta las nuevas, hace `upsert` de las existentes.
4. Si el producto tiene barcode, hace `upsert` en `barcode_catalog` con `source: 'user'`.

**Edición:**
1. `UPDATE` en `products`. El stock **no se actualiza** aquí — es bloqueado en el formulario.
2. Sincroniza `product_purchase_units`: elimina las que ya no están, hace upsert de las que quedan.
3. Si el producto tiene barcode, actualiza `barcode_catalog` con el nombre e imagen actuales.

**Post-guardado:**
- En creación: muestra modal de éxito con opciones "Crear otro" (resetea formulario en la misma pantalla) o "Salir" (navega a `originScreen`).
- En edición: navega directamente a `originScreen`.

---

## Servicio (`ServiceProductScreen`)

### Diferencias clave con Producto Simple

| Aspecto | Producto Simple | Servicio |
|---|---|---|
| `ProductType` | `SIMPLE` | `SERVICE` |
| Unidad de venta | Configurable | Fija: `'Serv'` |
| Stock | ✅ Gestionado | `null` — sin stock |
| Código EAN | ✅ Sí | ❌ No |
| Unidades de compra | ✅ Sí | ❌ No |
| Receta/Insumos | ❌ No | ✅ Sí |
| Crea `inventory_lot` | ✅ Si tiene stock | ❌ No |
| Tabla adicional | `product_purchase_units` | `product_ingredients` |

### Campos del Formulario

| Campo | Obligatorio | Notas |
|---|---|---|
| Nombre | ✅ Sí | Primera letra en mayúscula. |
| Categoría | ❌ No | Sin `required` — diferencia menor con Producto. |
| Precio | ✅ Sí | Precio de venta del servicio. |
| Costo | ❌ No | Si no se define, se puede calcular desde la receta. |
| Imagen | ❌ No | Mismas opciones que Producto. |
| Apodos | ❌ No | Misma lógica de unicidad que Producto. |
| Insumos (receta) | ❌ No | Lista de productos-ingredientes con cantidad y unidad. |

### Receta de Insumos

El servicio puede tener una lista de insumos (ingredientes) que lo componen. Esto sirve para dos propósitos:
1. **Cálculo de costo automático**: el costo total de la receta = suma de `(cantidad × costo por unidad del producto)`.
2. **Descuento de inventario**: al vender el servicio, se puede descontar el stock de los insumos que lo componen (según la implementación del flujo de ventas).

**Productos que pueden ser insumos:** solo `SIMPLE` y `PROCESSED`. Un `SERVICE` no puede ser insumo de otro servicio (previene referencia circular).

**Conversión de unidades:** la receta permite usar una unidad diferente a la del inventario. Por ejemplo, un producto guardado en `Kilogramos` puede usarse en la receta en `Gramos`. La función `convertUsageToInventoryQty()` hace la conversión antes de calcular el costo:

```
Conversiones soportadas:
Kg ↔ g, lb, @  |  lb ↔ g, kg, @  |  L ↔ ml  |  @ ↔ lb, kg
```

Si no existe conversión, se usa la cantidad directamente (con `console.warn`).

### Guardado (`handleSave`)

**Validaciones:** nombre + precio + `business_id` son obligatorios. Nótese que **el costo no es obligatorio** en servicios.

**Creación:**
1. `INSERT` en `products` con `type: 'SERVICE'`, `stock: null`, `unit: 'Serv'`.
2. `INSERT` de todos los insumos en `product_ingredients`.

**Edición:**
1. `UPDATE` en `products`.
2. **DELETE ALL** en `product_ingredients` del producto → re-insert de la receta actual. La receta se reemplaza completa (no es un merge).

> [!WARNING]
> La estrategia de edición de insumos es **delete-and-reinsert**. Si hay un error en el INSERT posterior al DELETE, la receta queda vacía. Esto es una deuda técnica potencial.

**Post-guardado:** igual que Producto — modal con "Crear otro" o "Salir".

---

## Gestión de Imagen (compartida)

Ambas pantallas usan el hook `useImageUpload`. Flujo:

1. **Subir desde archivo**: `input[type=file]` → compresión → upload a Supabase Storage → URL en `imageUrl`.
2. **Cámara** (solo móvil en Producto, disponible en ambos dispositivos en Servicio): abre `InAppCamera` → captura → mismo flujo de compresión.
3. **Pegar** (solo desktop, `Ctrl+V`): escucha el evento `paste` en `window` → extrae imagen del clipboard → mismo flujo.
4. **Recorte**: cualquiera de las 3 fuentes pasa por `ImageCropper` antes de subir (aspect ratio 1:1).
5. **Imagen externa (solo Producto)**: el barcode lookup puede descargar una imagen externa → compresión → upload.

Si el usuario cierra el formulario sin guardar y había subido una imagen, `useImageUpload` la limpia automáticamente (a menos que se haya llamado a `markAsSaved()`).

---

## Tablas de Supabase Involucradas

| Tabla | Producto Simple | Servicio |
|---|---|---|
| `products` | INSERT / UPDATE | INSERT / UPDATE |
| `inventory_lots` | INSERT (si stock > 0, solo en creación) | ❌ |
| `product_purchase_units` | INSERT / DELETE / UPSERT | ❌ |
| `product_ingredients` | ❌ | INSERT / DELETE |
| `barcode_catalog` | UPSERT (si tiene barcode) | ❌ |

---

## Inconsistencias Detectadas

> [!WARNING]
> **`parseInt` en mermas**: `WasteRegister` usa `parseInt` para la cantidad, lo que limita las mermas a enteros aunque la unidad de venta sea decimal (kg, L). Ver [`flujo_registro_mermas.md`](./flujo_registro_mermas.md).

> [!NOTE]
> **Categoría no obligatoria en Servicios**: En `ServiceProductScreen`, `CategorySelector` no tiene `required={true}`, a diferencia de `SimpleProductScreen`. Puede crear servicios sin categoría, lo que afecta la organización del catálogo.

> [!NOTE]
> **Costo no obligatorio en Servicios**: Si no se define costo y tampoco hay receta, el margen del servicio queda como 0% en el dashboard. Es intencional pero debe saberse.

---

## Validaciones Implementadas (fixes)

### Producto Simple — costo y stock negativos

`handleSave` en `SimpleProductScreen` valida antes de guardar:

- **Costo ≤ 0**: si `parseNumber(cost) <= 0`, se muestra toast de advertencia y se bloquea el guardado. Previene productos con costo negativo que distorsionan los márgenes del dashboard.
- **Stock inicial negativo**: si `parseStockNumber(stock) < 0`, se muestra toast de advertencia y se bloquea el guardado. Solo se valida en creación — en edición el campo es `readOnly`.

Ambas validaciones corren **después** de la validación de campos obligatorios (nombre, costo, categoría).

---

## Producto con Receta (`ProcessedProductScreen`)

> [!NOTE]
> Reactivado el 5-Jun-2026. Ver [`2026-06-05-cambios-recetas-insumos.md`](../historial_planes/2026-06-05-cambios-recetas-insumos.md).

Un **producto con receta** (`ProductType.PROCESSED`) es algo que el negocio prepara a partir de insumos (empanada, jugo, plato del día). Se crea desde el menú **Crear → Crear Receta** en `ProductsScreen` o en `SellScreen`. Se abre como drawer lateral (igual que Simple).

### Diferencias clave con Producto Simple

| Aspecto | Producto Simple | Producto con Receta |
|---|---|---|
| `ProductType` | `SIMPLE` | `PROCESSED` |
| Stock propio | ✅ Gestionado | `null` — sin stock; se deriva de los insumos ("Producible") |
| Crea `inventory_lot` | ✅ Si tiene stock | ❌ Nunca |
| Código EAN / Unidades de compra | ✅ Sí | ❌ No |
| Receta de insumos | ❌ No | ✅ Sí (modo calculado) |
| Tabla adicional | `product_purchase_units` | `product_ingredients` |

### Dos modos de costo (exclusivos)

El campo Costo tiene un selector `[ Manual | Ingredientes ]`. **Por defecto: Manual.**

| Modo | Costo | Ingredientes | Descuento de stock al vender |
|---|---|---|---|
| **Manual** (defecto) | Lo escribe el usuario | No se guardan | ❌ No descuenta |
| **Ingredientes** (calculado) | Suma de la receta (read-only) | Se guardan en `product_ingredients` | ✅ Descuenta el stock de cada insumo |

El costo calculado usa `convertUsageToInventoryQty()` (de `lib/recipeMath.ts`, espeja la función SQL `convert_units`): la receta puede usar una unidad distinta a la del inventario (ej. insumo en `Kilogramos`, receta en `Gramos`).

> [!IMPORTANT]
> En modo **Manual** el costo se reescribe al final del guardado. Al pasar de calculado→manual en una edición, el `DELETE` de `product_ingredients` dispara el trigger `update_product_cost_on_ingredient_change` que pondría el costo en 0; el re-`UPDATE` lo blinda.

### Insumos como ingredientes

Los ingredientes de una receta son **otros productos** (`product_ingredients.ingredient_id` → FK a `products`). El selector de ingredientes incluye productos `SIMPLE` y `PROCESSED` — típicamente **insumos** (`is_for_sale=false`). Un `SERVICE` no puede ser ingrediente.

### Guardado (`handleSave`)

**Validaciones:** nombre + categoría + `business_id`. En modo calculado, al menos un ingrediente; en modo manual, costo > 0.

**Creación:** `INSERT` en `products` con `type='PROCESSED'`, `stock: null`. Si modo calculado, `INSERT` de la receta en `product_ingredients`.

**Edición:** `UPDATE` en `products`; `DELETE ALL` de `product_ingredients` y re-insert (solo en modo calculado). En modo manual, re-`UPDATE` del costo al final.

> [!NOTE]
> Descuento de stock al vender: la función SQL `deduct_stock_for_order` recorre `product_ingredients` del producto vendido, convierte unidades y descuenta el stock de cada insumo. Ya existía y no se modificó.

---

## Coexistencia con sidebar y Asistente IA

`SimpleProductScreen`, `ProcessedProductScreen` y `ServiceProductScreen` usan `md:left-60` en su contenedor raíz `fixed inset-0` (drawer derecho `max-w-md`) para que el sidebar permanezca visible en desktop. Z-index: `z-[100]`. El chat (z-[110]) queda siempre al frente. Las tres se abren como overlay sobre la pantalla de origen (`originScreen` = Productos o Ventas) y vuelven a ella al cerrar/guardar.
