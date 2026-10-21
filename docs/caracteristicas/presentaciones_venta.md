# Presentaciones de Venta con Stock Unificado

Componentes:
- `screens/SimpleProductScreen.tsx` → Configuración de presentaciones en el formulario de producto
- `lib/catalogExpansion.ts` → Desdoblamiento para el Punto de Venta (POS)
- `screens/MenuScreen.tsx` & `screens/SellScreen.tsx` → Despliegue en Modo Catálogo y Modo EAN
- `App.tsx` & `hooks/useSales.ts` → Sincronización de catálogo y deducción de stock en tiempo real
- `supabase/migrations/20260904000000_add_sale_presentations.sql` → Persistencia y deducción FIFO

---

## ¿Qué son las Presentaciones de Venta?

Permite vender un mismo producto bajo **múltiples formatos o empaques** (1 a N), compartiendo un **único stock central** registrado en la unidad base mínima:

| Ejemplo | Unidad Base | Presentaciones Adicionales |
|---|---|---|
| **Cigarrillos** | Unidad Suelta (1) | Cajetilla x 10 (`factor: 10`), Cajetilla x 20 (`factor: 20`) |
| **Huevos** | Unidad (1) | Media Cubeta (`factor: 15`), Cubeta Completa (`factor: 30`) |
| **Cervezas / Gaseosas** | Unidad (1) | Six-Pack (`factor: 6`), Canasta / Caja (`factor: 30`) |
| **Golosinas** | Unidad (1) | Paquete (`factor: 12`), Display (`factor: 24`) |

Cada presentación puede tener su propio **precio de venta**, su propio **código de barras (EAN/UPC)** y su propia **fotografía**.

---

## 1. Configuración en el Producto (`SimpleProductScreen`)

En la pantalla de creación/edición de un producto para venta (`is_for_sale=true`), se ubica la sección **"Presentaciones de Venta"**:

1. **Botón `+ Añadir Presentación`**: Abre el modal flotante de configuración.
2. **Campos de cada presentación**:
   * **Código de barras (EAN/UPC)**: Opcional. Permite tipeo manual, pistola de escáner física o escáner por cámara. Cuenta con búsqueda automática (`lookupBarcode`) que autorellena el nombre de la presentación si el código existe en el catálogo.
   * **Nombre de la presentación**: Obligatorio. Describe la forma de empaque (ej: `"Cajetilla x 10"`, `"Cubeta x 30"`). Los placeholders se adaptan a la unidad base seleccionada.
   * **¿Cuántas [unidades] contiene?**: Factor de conversión numérico mayor a 0 (ej: `10`).
   * **Precio de venta**: Valor monetario formateado con separador de miles.
   * **Apodos de la presentación (Opcional)**: Permite asociar apodos o términos coloquiales específicos de la presentación (ej: `"Media"`, `"Cajetilla 10"`, `"Paquete mora"`). Se gestionan como chips amarillos y permiten matching rápido en buscadores y en la IA de comandas (`PhotoOrderScreen`).
   * **Foto de la presentación**: Opcional. Si no se sube, hereda la foto del producto base.
     * **Subir foto**: Carga archivo del dispositivo, escala a máx. 1000px y comprime automáticamente a formato liviano WebP (calidad 82%).
     * **Pegar imagen**: Lee el portapapeles directamente desde el botón o mediante el atajo de teclado **`Ctrl+V`** cuando el modal está abierto.
     * Sube directamente al bucket público **`product-images`** de Supabase Storage.
     * Miniatura con botón flotante rojo `X` para remover la foto.
3. **Resumen en tarjeta**:
   * Las presentaciones agregadas se listan en tarjetas simétricas con diseño limpio de dos líneas:
     * **Línea 1**: Nombre de la presentación.
     * **Línea 2**: `Contiene X Unidades • $XX.XXX • X apodos` (si tiene apodos configurados).
   * Botones de acción rápida: Editar (lápiz) y Eliminar (papelera).
   * El código EAN se oculta en la tarjeta resumen para mantener simetría visual y evitar sobrecarga.
4. **Independencia de Unidades de Compra**:
   * Las presentaciones de venta operan de forma independiente a las unidades de compra (`product_purchase_units`). Las unidades de compra solo se crean si el usuario las añade explícitamente en su sección respectiva.
5. **Notificación en tiempo real**:
   * Al guardar el producto, se despacha el evento `window.dispatchEvent(new CustomEvent('inventory-updated'))`, provocando que el POS actualice su catálogo al instante sin requerir recargar la página.

---

## 2. Desdoblamiento en el Catálogo (`catalogExpansion.ts`)

La función pura `expandProductsForPOS(products)` procesa la lista de productos antes de entregarla al catálogo:

* **Sin presentaciones adicionales (caso estándar)**:
  * El producto se devuelve intacto. Su nombre, tarjeta y precio no se alteran.
* **Con 1 o más presentaciones adicionales**:
  * **Tarjeta Base**:
    * Mantiene el ID original del producto, precio base, `conversion_factor: 1` y `is_secondary: false`.
    * Si el nombre no incluye explícitamente la unidad, le agrega el sufijo (ej: `"Huevo AA (Unidad)"`). Si ya la contiene (ej: `"Lucky Mora | Unidad Suelta"`), conserva su nombre limpio sin duplicados.
  * **Tarjetas Secundarias (Presentaciones)**:
    * ID sintético: `${producto_padre_id}__pres_${pres_id}`.
    * `parent_product_id`: ID del producto padre.
    * `is_secondary: true`.
    * `conversion_factor`: Factor de conversión configurado.
    * `price`: Precio propio de la presentación.
    * `barcode`: Código de barras propio (si fue asignado).
    * `image`: Foto propia o, en su defecto, la del producto base.
    * **Stock Proporcional**: `Math.floor(stock_padre / conversion_factor)`. Si el stock base es 50 y la cajetilla tiene factor 10, muestra **5**.
    * **Nombre Inteligente**: Si el nombre de la presentación ya incluye la marca/nombre base (ej: `"Lucky Strike Cigarrillo Mora X10 Unidades"`), se usa directamente sin anidamiento redundante.

### Regla Crítica: Unidad Discreta (`unit: 'Unidad'`)
Para evitar que el sistema confunda una presentación con un producto vendido por peso/medida (lo cual generaba pastillas verdes desbordadas y abría el modal de pesaje `PriceInputModal`), toda tarjeta secundaria tiene asignado **`unit: 'Unidad'`** (almacenando el texto de la presentación en `presentation_unit`). Esto garantiza:
* Pastilla superior derecha negra estándar con el precio limpio (ej: **`$12.000`**).
* Agregado directo al carrito al pulsar `+` o hacer clic sobre la tarjeta.

---

## 3. Experiencia en Modo EAN

En el Modo EAN (escáner y cobro directo):
1. **Buscador y Sugerencias**:
   * El producto y sus presentaciones secundarias comparten términos de búsqueda en `nicknames` (nombre base, nombre de presentación y código de barras).
   * Al buscar por texto o escanear el código propio de la presentación, la sugerencia muestra directamente su precio limpio sin sufijos confusos como `/ Und`.
2. **Visualización en Carrito**:
   * Para las presentaciones secundarias (`is_secondary: true`), el badge de stock muestra **únicamente el número** (ej: **`4`** con el ícono de caja `inventory_2`) en lugar de `4 Und`.
   * Esto previene que el tendero se confunda pensando que tiene 4 cigarrillos sueltos, cuando en realidad tiene 4 paquetes.
   * Los productos base y por peso conservan su unidad (`50 Und`, `2.5 Kg`).

---

## 4. Reconocimiento en Comandas por Foto (`PhotoOrderScreen`)

La pantalla de órdenes por foto y notas manuscritas integra completamente las presentaciones de venta:

1. **Expansión Automática**:
   * Mediante `expandProductsForPOS(products)`, tanto el producto base como todas sus presentaciones secundarias quedan disponibles para el motor OCR y matching IA (`usePhotoOrder`).
2. **Matching por Apodos de Presentación**:
   * Si en la comanda escrita a mano o foto aparece un apodo de la presentación (ej: `"media lucky"`, `"cajetilla 10"`), el algoritmo lo empareja con alta confianza directamente con la presentación correspondiente (precio y factor de conversión propios).
3. **Buscador Manual y Sugerencias**:
   * Al buscar productos no reconocidos, el buscador reconoce los apodos, nombres y códigos de barra de cada presentación.
4. **Guardar Apodo al Vuelo**:
   * Si un ítem no reconocido se asigna manualmente a una presentación, el botón **`Guardar "[texto]" como apodo`** detecta que se trata de una presentación secundaria (`is_secondary: true`) y actualiza automáticamente el campo `sale_presentations` en la fila del producto padre en Supabase, emitiendo `inventory-updated` para refrescar el catálogo.

---

## 5. Deducción de Inventario (Ventas y Lotes)

Al vender una presentación:
1. **Frontend (Carrito & Checkout)**:
   * El item en el carrito conserva `conversion_factor` y `parent_product_id`.
   * Al procesar el pago, se envía `product_id: item.parent_product_id || item.id` y `conversion_factor: item.conversion_factor || 1`.
2. **Actualización Optimista Local (`App.tsx`)**:
   * En el evento `sale-completed`:
     ```ts
     const totalDeduct = matchingSoldItems.reduce(
       (sum, item) => sum + (item.quantity * (item.conversion_factor || 1)),
       0
     );
     return { ...product, stock: product.stock - totalDeduct };
     ```
   * Al actualizarse el stock del producto padre, todas sus tarjetas de presentación en el catálogo recalculan su stock proporcional al instante.
3. **Base de Datos (PostgreSQL / Supabase)**:
   * En la tabla `order_items` se almacena `conversion_factor`.
   * La función `deduct_inventory_complete` y el consumo de lotes FIFO (`public.deduct_fifo`) descuentan `v_item.quantity * coalesce(v_item.conversion_factor, 1)`.
   * Los triggers y funciones de anulación/devolución (`void_order_and_restore_stock`, etc.) reintegran el stock multiplicando por su factor respectivo.
