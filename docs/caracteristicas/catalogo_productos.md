# Catálogo de Productos (ProductsScreen)

Componente: `screens/ProductsScreen.tsx`  
Hooks: `useAdminProductsCatalog`, `usePromotions`  
Acceso: Menú principal → "Productos"

Centro de gestión del catálogo. Permite ver, buscar, filtrar, crear, editar y eliminar productos, servicios y promociones. Incluye un sistema de **diagnóstico de inventario** basado en velocidad de ventas.

---

## Pestañas (Tabs)

La pantalla organiza el catálogo en pestañas:

| Tab | Tipos incluidos | Badge UI | Se muestra si... |
|---|---|---|---|
| **Productos** | `SIMPLE` con `is_for_sale=true`, `PROCESSED` | "Retail", "Receta" | Siempre visible |
| **Insumos** | `SIMPLE` con `is_for_sale=false` | — | Solo si existe al menos un insumo |
| **Servicios** | `SERVICE` | "Servicio" | Solo si existe al menos un servicio |
| **Promociones** | `PROMOTION` | "Promoción" | Solo si existe al menos una promoción |

**Diferencia entre Retail, Receta e Insumo:**
- **Retail (`SIMPLE`, `is_for_sale=true`)**: producto que se compra y revende directamente (leche, arroz, jabón). El costo viene de los lotes de compra. Puede tener **Presentaciones de Venta** adicionales (six-pack, cubeta, cajetilla) con códigos de barra y precios propios, que descuentan del inventario base. Ver [`presentaciones_venta.md`](./presentaciones_venta.md).
- **Receta (`PROCESSED`)**: producto elaborado a partir de insumos (empanada, jugo, plato del día). **No maneja stock propio**: en lugar de Stock/Salud muestra **Producible** (cuántas unidades se pueden preparar con el stock de insumos). Ver [`flujo_creacion_productos.md`](./flujo_creacion_productos.md).
- **Insumo (`SIMPLE`, `is_for_sale=false`)**: mercancía de uso interno que no se vende. Vive en su propio tab; muestra solo **Stock + Costo** (sin Precio, Margen ni Salud). También aparece en el tab Ingredientes de Inventario.

### Columna "Producible" (recetas)

Para una receta en modo **calculado**, `Producible = mín( floor(stockInsumo / cantReceta) )` sobre todos sus ingredientes. En modo **manual** (sin ingredientes), muestra "—" porque no hay insumos para calcularlo. Se computa en `useProducts` vía `computeProducible()` de `lib/recipeMath.ts`.

> [!NOTE]
> Las pestañas de Insumos, Servicios y Promociones **se ocultan automáticamente** si no hay ninguna entrada de ese tipo. Si el usuario elimina el último insumo (o servicio/promoción), la pestaña desaparece y el tab activo vuelve a "Productos".

---

## Búsqueda

El buscador tiene dos modos seleccionables mediante un `<select>` embebido:

| Modo | Busca en |
|---|---|
| **Producto** | `name` y `description` del producto |
| **Proveedor** | Nombres de proveedores en `inventory_lots` (campo `supplier_name`) |

### Búsqueda por Producto

Filtra en tiempo real por nombre y descripción. Es una búsqueda por substring: escribir "lech" encuentra "Leche Entera 1L".

### Búsqueda por Proveedor (autocomplete con chips)

Al seleccionar el modo "Proveedor", el buscador cambia a un flujo de selección múltiple:

1. **Escribe** parte del nombre del proveedor → aparece un dropdown con sugerencias que coinciden.
2. **Haz clic** en una sugerencia → se convierte en un **chip ámbar** dentro del buscador.
3. **Agrega más proveedores** escribiendo de nuevo (el placeholder cambia a "Agregar...").
4. La lista muestra productos que tienen **cualquiera** de los proveedores seleccionados (lógica OR).
5. Elimina un proveedor con la `×` de su chip, o borra todo con el `×` global del buscador.

El buscador usa el `supplierMap` cargado al montar la pantalla: un `Record<product_id, string[]>` con todos los proveedores que han tenido lotes de ese producto. Los nombres se normalizan a minúsculas al indexar (`.trim().toLowerCase()`), por lo que la búsqueda es **case-insensitive**: "Alpina" y "alpina" devuelven los mismos resultados. **Es una búsqueda estática** — no se actualiza en tiempo real si se agrega un nuevo lote mientras la pantalla está abierta.

---

## Filtros Disponibles

### Por categoría
- **Móvil**: `<select>` con las categorías del tab activo.
- **Desktop**: chips horizontales con nombre de categoría y días estimados de stock (`Xd`) calculados a nivel de categoría.

El engranaje ⚙️ abre `CategorySettingsModal` para configurar los umbrales de alerta de rotación (`alert_days`, `optimal_min`, `optimal_max`). En **desktop** aparece dentro de cada chip. En **móvil** aparece como botón separado al lado del `<select>` de categorías, y solo se activa cuando hay una categoría específica seleccionada (desactivado en "Todas").

### Por salud de stock (`healthFilter`)
Dropdown "Salud de Stock" que filtra por estado de diagnóstico:

| Opción visible | Valor interno | Qué muestra |
|---|---|---|
| Salud de Stock | `all` | Todos los productos |
| 🔴 Crítico | `critico` | Stock para ≤ N días críticos |
| 🟠 Re-ordenar | `reordenar` | Stock bajo, pero no crítico |
| 🟢 Óptimo | `optimo` | Stock en rango ideal |
| 🟡 Lento | `lento` | Exceso de stock |
| 🟣 Estancado | `estancado` | Stock > 0 pero 0 ventas en 28 días |

> [!NOTE]
> Los estados **"Agotado"**, **"Sin datos"**, **"Sin ventas aún"** y **"Faltan Xd"** aparecen como badges en la lista pero **no son opciones de este filtro**.

### Ordenamiento
Dropdown "Sin ordenar" independiente del filtro de salud — se pueden combinar:
- Sin ordenar
- Stock ↓ Menor Duración (más urgente primero)
- Stock ↑ Mayor Duración (más holgado primero)

---

## Diagnóstico de Inventario ("Salud del Stock")

Esta es la funcionalidad más sofisticada de la pantalla. Para cada producto `SIMPLE` con stock (Retail), calcula cuántos días durará el stock actual basándose en la velocidad de ventas de los últimos **28 días**. Los productos `SERVICE`, `PROMOTION` y las recetas `PROCESSED` (que tienen `stock=null`) **no** tienen diagnóstico de inventario — las recetas muestran **Producible** en su lugar. El objetivo es que el dueño sepa **cuándo comprar** sin quedarse sin stock ni sobrestock.

### ¿Por qué 28 días?

28 días es exactamente 4 semanas completas. Esto captura los ciclos semanales de venta (lunes vs. fin de semana) sin sesgarse por un solo día atípico. Es suficiente historial para ser representativo, pero lo suficientemente reciente para reflejar la demanda actual.

### Ventana de maduración por producto (28 días desde la primera venta)

El diagnóstico por velocidad divide las ventas entre 28 días. Si un producto tuvo su primera venta hace menos de 28 días, ese promedio sería engañoso (asume 28 días de historial que aún no existen: un producto vendido hace 3 días mostraría un falso "Lento (700d)"). Por eso el diagnóstico se **gatea por producto**, no por negocio.

El estado de cada producto se resuelve así (los estados que **no** dependen de la velocidad — `Agotado`, stock negativo, `Sin datos` — se evalúan antes y no se ven afectados):

```
                    primera venta del producto ─────── +28 días ───────►
                            │                              │
  ┌──────────────────────────┼──────────────────────────────┼─────────────┐
  │  sin ninguna venta        │  daysSinceFirstSale < 28      │  >= 28 días │
  ▼                           ▼                               ▼
  "Sin ventas aún"          "Faltan Xd"              diagnóstico normal
  (badge gris, neutro)      (cuenta regresiva)       (Crítico/Reordenar/
                                                      Óptimo/Lento/Estancado)
```

- **Sin ventas aún** (`status: 'sindatos'`, ícono `schedule`): el producto nunca se ha vendido (no está en `firstSaleMap`). No se juzga; se aclara que la Salud aparecerá 28 días después de su primera venta. Reemplaza al antiguo `Estancado` para productos recién creados.
- **Faltan Xd** (`status: 'sindatos'`, ícono `hourglass_top`): tuvo su primera venta hace menos de 28 días. Muestra los días restantes para que la velocidad sea confiable.
- **Estancado** ahora solo aplica a productos que **sí** vendieron antes (primera venta ≥ 28 días) pero no registran ventas en los últimos 28 días — estancamiento real.

**Origen del dato:** función RPC `get_product_first_sales(p_business_id)` en Supabase (`SECURITY INVOKER`, respeta RLS de `orders`/`order_items`). Devuelve una fila por producto con `min(orders.created_at)` de órdenes no canceladas. `ProductsScreen` la consulta junto con la velocidad y llena `firstSaleMap`.

### Fórmula base
```
dailyVelocity = unidadesVendidas28días / 28
diasDeInventario = stockActual / dailyVelocity
```

### Ejemplo completo paso a paso

**Producto: "Leche Entera 1L"**
- Stock actual: `48 unidades`
- Ventas en los últimos 28 días: `112 unidades`

```
dailyVelocity = 112 / 28 = 4 unidades/día
diasDeInventario = 48 / 4 = 12 días
```

Con umbrales default (alert=3, optimal_min=7, optimal_max=12):
→ **Estado: Óptimo (12d)** ✅

El tooltip mostraría:
> *"Tienes 48 Unidades y vendes un promedio de 4.0 al día. El stock durará 12.0 días. Ganancia de los últimos 28 días: $56,000."*

---

Ahora el mismo producto, pero con solo 8 unidades en stock:
```
diasDeInventario = 8 / 4 = 2 días
```
→ **Estado: CRÍTICO (2d)** 🔴 (con animación de pulso)

El sistema te está diciendo: **si no llamas al proveedor hoy, en 2 días no tienes qué vender.**

---

### Estados del diagnóstico y qué significan para el negocio

| Estado | Condición | Color | Qué hacer |
|---|---|---|---|
| **Sin datos** | `stock === null` | Gris | El producto no tiene control de stock (se usa como "infinito") |
| **Agotado** | `stock <= 0` | Rojo | Compra urgente. Ver [`flujo_compra_inventario.md`](./flujo_compra_inventario.md) |
| **Estancado** | `stock > 0` y `ventas28días = 0` | Morado | Nadie lo ha pedido en un mes. Evalúa descuento o retiro |
| **CRÍTICO** | `días <= alert_days` (default: 3) | Rojo + pulso | Llama al proveedor hoy |
| **Re-ordenar** | `días < optimal_min` (default: 7) | Naranja | Tienes días, pero ya es momento de hacer el pedido |
| **Óptimo** | `días <= optimal_max` (default: 12) | Verde | Nada que hacer, el inventario está bien |
| **Lento** | `días > optimal_max` | Ámbar | Tienes demasiado stock. Considera no recomprar tan pronto |

### Ejemplo: Producto "Estancado"

**Producto: "Aceite de Oliva Importado 500ml"**
- Stock: `24 unidades`
- Ventas últimos 28 días: `0`

El sistema no puede calcular velocidad porque nadie lo compró. Resultado:
→ **Estado: Estancado** 🟣

Tooltip: *"Tienes 24 Unidades en inventario y no se vendió nada en los últimos 28 días. Considera aplicar un descuento para mover la mercancía."*

Esto es capital inmovilizado. El dueño puede reaccionar: hacer una promoción, bajar el precio, o simplemente no volver a comprarlo.

---

### Diagnóstico a nivel de categoría (chips de desktop)

Además del diagnóstico por producto, cada **chip de categoría** en desktop muestra el diagnóstico agregado de todos sus productos:

```
diasCategoria = totalStockCategoria / totalVelocidadDiariaCategoria
```

**Ejemplo: Categoría "Lácteos"**
- Leche 1L: stock=48, vel=4/día → 12 días
- Yogurt: stock=6, vel=2/día → 3 días  
- Queso: stock=20, vel=1/día → 20 días

```
totalStock = 48 + 6 + 20 = 74
totalVel = 4 + 2 + 1 = 7/día
diasCategoria = 74 / 7 = 10.6 días → Óptimo
```

El chip muestra `Lácteos (10d)` en color verde. Pero si entras al detalle, el Yogurt individualmente está en CRÍTICO. **El diagnóstico agregado puede enmascarar urgencias individuales** — por eso es importante revisar producto por producto cuando la categoría parece "bien".

---

### Umbrales configurables por categoría

No todos los productos rotan igual. Una tienda de electrónica y una tienda de abarrotes tienen ritmos muy distintos:

| Categoría | alert_days | optimal_min | optimal_max | Razonamiento |
|---|---|---|---|---|
| *Default* | 3 | 7 | 12 | Para productos de rotación media |
| Lácteos (ejemplo) | 2 | 5 | 8 | Caducan rápido, reposición frecuente |
| Licores (ejemplo) | 7 | 15 | 30 | Rotan lento, pedidos grandes |

El ⚙️ abre `CategorySettingsModal` para configurar estos 3 valores. Disponible en desktop (chip) y móvil (botón al lado del select, activo solo con categoría específica seleccionada). Se guardan en la tabla `categories` (`alert_days`, `optimal_min`, `optimal_max`).

### Costo Unitario Promedio Ponderado

La columna "Costo Unit." muestra el **costo promedio ponderado** calculado desde los lotes activos (`inventory_lots`), no el costo manual del producto. 

**¿Por qué es diferente al costo del producto?**

Cuando compras en distintos momentos a distintos precios, el "costo real" del stock que tienes es el promedio de lo que pagaste, ponderado por cuánto te queda de cada lote:

```
Lote A: 30 unidades a $1,000 c/u → $30,000
Lote B: 20 unidades a $1,200 c/u → $24,000
Total: 50 unidades, $54,000
Costo promedio ponderado = $54,000 / 50 = $1,080
```

Si el producto tiene costo manual de $1,000 pero el costo ponderado real es $1,080, el margen que muestra la pantalla será más preciso usando el ponderado. El badge "Prom." indica que viene de lotes; "Manual" indica que no hay lotes activos y se usa el campo `cost` del producto.

---

## Acciones por Producto

### Editar (Carga Diferida / Lazy Loading)
- **Carga bajo demanda:** Al hacer clic en **Editar**, la lista principal no tiene descargadas subconsultas pesadas de insumos de recetas ni unidades de compra.
- **Feedback visual limpio:** El botón pasa a estado `disabled` y muestra únicamente un spinner animado (`progress_activity`) sin texto, conservando su tamaño para una interfaz pulida.
- **Descarga instantánea:** Se invoca `fetchFullProductForEdit(productId)` de `useAdminProductsCatalog`, la cual descarga en paralelo las unidades de compra (`product_purchase_units`) y, si es receta, los ingredientes (`product_ingredients`).
- **Navegación fluida:** Una vez estructurado el producto completo, se llama a `onEditProduct(product)` → navega a `SimpleProductScreen`, `ProcessedProductScreen` o `ServiceProductScreen` con todos los datos pre-rellenados.
- **Promoción**: llama a `onEditPromotion(promotion)` → navega a la pantalla de edición de promoción.

Ver [`flujo_creacion_productos.md`](./flujo_creacion_productos.md) y [`flujo_creacion_promociones.md`](./flujo_creacion_promociones.md).

### Eliminar
Pide confirmación antes de borrar. Llama a `deleteProduct(id)` o `deletePromotion(id)`.

> [!WARNING]
> Hay dos escenarios posibles al eliminar:
> - **Si el producto tiene ventas**: la FK en `order_items` bloquea la eliminación. El producto **se queda** y el toast muestra: *"Error al eliminar. Puede que esté asociado a una venta."*
> - **Si el producto no tiene ventas**: la eliminación es exitosa y el producto **desaparece permanentemente** del catálogo sin advertencia adicional.
>
> No hay opción de "desactivar" en lugar de eliminar para productos normales.

### Activar/Desactivar Promoción
Solo las promociones tienen el toggle de estado (Activa/Inactiva). Los productos y servicios no tienen toggle de activación desde esta pantalla.

---

## Crear Nuevo

El botón "Crear +" abre un menú con las siguientes opciones:

| Opción | Navega a | Visible para |
|---|---|---|
| Crear Producto | `Screen.CREATE_PRODUCT_SIMPLE` | Todos los roles |
| Crear Receta | `Screen.CREATE_PRODUCT_PROCESSED` | Todos los roles |
| Crear Servicio | `Screen.CREATE_PRODUCT_SERVICE` | Todos los roles |
| Crear Promoción | `Screen.CREATE_PROMOTION` | Todos los roles |

> [!NOTE]
> "Crear Receta" también está disponible desde el botón **Crear** de la pantalla de Ventas (`SellScreen`). Para crear un **Insumo** se usa "Crear Producto" y se elige **Insumo** en el selector de tipo.

> [!NOTE]
> **Importar Excel está temporalmente oculto**: la opción existe en el código (`Screen.BULK_UPLOAD`) pero está comentada en el menú hasta que el flujo de importación esté pulido. Ver [`flujo_importacion_excel.md`](./flujo_importacion_excel.md) para el estado actual.

---

## Lo que NO se puede hacer

- **Cambiar el stock directamente desde aquí** — el stock solo se modifica via compras, ventas, mermas o ajustes. Ver [`flujo_compra_inventario.md`](./flujo_compra_inventario.md) y [`flujo_registro_mermas.md`](./flujo_registro_mermas.md).
- **Desactivar un producto sin eliminarlo** — no hay toggle de `is_active` en la UI para productos normales.
- **Ver lotes de inventario detallados** — solo se muestra el stock total y el costo promedio ponderado. Para ver lotes individuales hay que ir al flujo de compras.
- **Filtrar por precio o margen** — los filtros son por categoría, salud de stock y texto. No hay filtro numérico.
- **Exportar el catálogo** — no hay función de exportación desde esta pantalla (solo existe importación).

---

## Arquitectura de Paginación y Rendimiento (`useAdminProductsCatalog`)

Para minimizar el consumo de Egress (ancho de banda) y acelerar la carga inicial:

1. **Paginación en Servidor (20 en 20):**
   - Al abrir el catálogo o seleccionar una categoría, se solicitan únicamente los primeros 20 productos (`.range(0, 19)`).
   - Las consultas excluyen subconsultas pesadas de insumos de recetas y modificadores, solicitando solo campos visuales esenciales (`id, name, type, price, cost, stock, unit, image_url, barcode, is_active, is_for_sale, description, category_id, default_supplier_id`).

2. **Scroll Infinito Progresivo:**
   - Ambas vistas (Desktop y Móvil) detectan cuando el usuario llega a menos de 150px del final de la lista para ejecutar `loadMore()` automáticamente.
   - Muestra un indicador inferior no invasivo con spinner mientras se descargan los siguientes 20 productos.

3. **Metadata Instantánea de Pestañas (`get_business_catalog_types` RPC):**
   - La visibilidad de las pestañas (Retail, Recetas, Insumos, Servicios, Promociones) se evalúa mediante la función RPC `get_business_catalog_types` en PostgreSQL.
   - En lugar de descargar registros o hacer escaneos secuenciales, utiliza subconsultas `EXISTS(SELECT 1 FROM ...)` deteniéndose en la primera fila coincidente (<1 ms de ejecución, <100 bytes de carga JSON).
   - Se sincroniza con el estado `metadataLoading` de modo que las pestañas se renderizan de inmediato junto con la pantalla en un solo ciclo, eliminando el retraso ("pop-in") tardío.

4. **Prevención de Doble Carga y Parpadeo (`categoriesRef`):**
   - Se desacopló la lista de categorías del hook `useCallback` de `fetchPage` mediante una referencia mutable `categoriesRef`.
   - Esto evita que la llegada tardía de las categorías vuelva a regenerar la función de paginación o dispare una segunda recarga innecesaria de la primera página, garantizando una carga visualmente estable y sin parpadeos.

5. **Sincronización Automática tras Guardar:**
   - Las pantallas de creación y edición (`SimpleProductScreen`, `ProcessedProductScreen`, `ServiceProductScreen`, `PhotoOrderScreen`) emiten el evento global `window.dispatchEvent(new CustomEvent('inventory-updated'))`.
   - El hook `useAdminProductsCatalog` escucha este evento y refresca automáticamente los primeros 20 productos para reflejar los cambios de inmediato.

6. **Velocidad de Ventas Agregada en Servidor (`get_product_sales_velocity` RPC):**
   - La velocidad de ventas a 28 días ya no descarga miles de boletas crudas (`orders` y `order_items`) al frontend.
   - Se calcula directamente en PostgreSQL mediante la función RPC `get_product_sales_velocity(p_business_id, p_days)` con `SUM(oi.quantity)` y `GROUP BY oi.product_id`, apoyada por el índice compuesto parcial `idx_orders_biz_created_active` en `orders (business_id, created_at) WHERE status <> 'canceled'`.
   - Reduce el consumo de red (egress) en un **97%** (de ~300 KB a ~10 KB).
   - En la pestaña **Retail**, la pantalla sincroniza la espera (`catalogLoading || salesLoading`) para que los productos aparezcan directamente con sus badges definitivos, evitando mostrar el estado transitorio "Calculando...".

| Query / RPC | Tipo | Propósito | Optimización |
|---|---|---|---|
| `get_product_sales_velocity` | RPC en PostgreSQL | Unidades vendidas en últimos 28 días por producto | `GROUP BY` en BD + índice compuesto (~10 KB vs ~300 KB) |
| `get_product_first_sales` | RPC en PostgreSQL | Fecha de primera venta por producto | Gate de maduración de 28 días para Salud del Stock |
| `get_business_catalog_types` | RPC en PostgreSQL | Disponibilidad de tipos de catálogo y promociones | Subconsultas `EXISTS` (<1 ms, <100 bytes) |
| Costos promedio ponderados | Query `inventory_lots` | `remaining_quantity > 0 AND unit_cost > 0` | Resuelto en segundo plano sin bloquear pantalla |
| Mapa de proveedores | Query `inventory_lots` | `supplier_name IS NOT NULL` | Resuelto en segundo plano sin bloquear pantalla |

---

## Inconsistencias y Notas

> [!NOTE]
> **Sin toggle de activación para productos**: Los productos solo se pueden eliminar, no desactivar. Las promociones sí tienen toggle Activa/Inactiva. Esta inconsistencia puede generar confusión — ¿cómo "pausas" un producto de temporada sin perder su historial?

> [!NOTE]
> **Datos de salud de stock son estáticos al montar**: Las 3 queries paralelas (velocidad, costos, proveedores) se ejecutan una vez. Un nuevo registro de compra o venta no actualiza los badges de salud hasta que el usuario abandone y vuelva a la pantalla.

> [!NOTE]
> **El costo promedio ponderado se muestra solo en `≥ xl`**: La columna "Costo Unit." tiene clase `hidden xl:table-cell`. En pantallas de 1024-1279px (lg pero no xl), esa columna no aparece aunque el layout de tabla sí está activo.
