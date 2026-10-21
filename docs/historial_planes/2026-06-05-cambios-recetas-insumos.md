# Cambios — Productos con Receta + Insumos — 5 Junio 2026

Reactivación del flujo de **productos con receta** (`ProcessedProductScreen`) e introducción del concepto de **insumo** (producto que no se vende). Afecta creación de productos, catálogo, inventario y compras.

---

## 1. Concepto: "Insumo" = producto con `is_for_sale = false`

No existe una entidad nueva. Un **insumo** es un producto `type='simple'` con `is_for_sale=false`:

- No aparece en el catálogo de ventas (SellScreen/MenuScreen ya filtran `is_for_sale=true`).
- Sí tiene stock, se cuenta en Inventario (tab Ingredientes) y se puede comprar.
- Puede usarse como ingrediente de una receta.

La tabla `ingredients` (legada) sigue **vacía y sin uso**. Todo el sistema de recetas usa *productos como ingredientes* (`product_ingredients.ingredient_id` → FK a `products`).

---

## 2. ProcessedProductScreen reactivado

**Archivos:** `App.tsx`, `screens/ProcessedProductScreen.tsx`, `screens/ProductsScreen.tsx`, `screens/SellScreen.tsx`

- Se descomentó el import y el render en `App.tsx`. `Screen.CREATE_PRODUCT_PROCESSED` se agregó a los arrays de pantallas de creación (origen + fondos de SELL/PRODUCTS), de modo que la receta se abre como **overlay sobre la pantalla de origen** y vuelve a ella al cerrar/guardar (`originScreen`).
- `handleAdminEditProduct` rutea `processed` → `CREATE_PRODUCT_PROCESSED` (antes redirigía a Simple).
- "Crear Receta" agregado al menú **Crear** de `ProductsScreen` y de `SellScreen` (ícono `skillet`, naranja).

### Dos modos de costo exclusivos

```
Costo  [ Manual | Ingredientes ]   (defecto: Manual)
```

| Modo | Comportamiento |
|---|---|
| **Manual** (defecto) | El usuario escribe el costo. No guarda ingredientes ni descuenta stock. |
| **Ingredientes** (calculado) | El costo = suma de ingredientes. Guarda `product_ingredients`. Al vender, descuenta el stock de cada insumo. |

El costo manual se reescribe al final del guardado para que el trigger de recálculo (disparado al borrar ingredientes en una edición calculado→manual) no lo deje en 0.

### Stock de las recetas

Las recetas **no manejan stock propio**: `stock = null`, sin `inventory_lots`. Su disponibilidad se deriva de los insumos (ver "Producible" en `catalogo_productos.md`).

### Layout: drawer lateral

`ProcessedProductScreen` pasó de pantalla completa a **drawer derecho** (`fixed inset-0 md:left-60`, panel `max-w-md`, `slideInRight`), igual que `SimpleProductScreen`. Una sola columna apilada para caber en el ancho angosto; en móvil ocupa toda la pantalla. La fila de "agregar ingrediente" se reorganizó en dos renglones (Buscar a todo el ancho; Cantidad + Unidad + Añadir abajo).

---

## 3. SimpleProductScreen: selector Producto / Insumo

**Archivo:** `screens/SimpleProductScreen.tsx`

El selector "Tipo de producto" ahora ofrece **Producto para venta / Insumo / Servicios**. Al elegir **Insumo** (`is_for_sale=false`):

- Se ocultan: Precio de venta, Código EAN/UPC, Apodos.
- Se conservan: Costo, Stock, Unidad, Categoría, Imagen, Unidades de Compra.
- `handleSave` fuerza `price=0`, `barcode=null`, `nicknames=[]`, `description='Insumo'` y omite el catálogo global de barcodes.

Al editar, el formulario reabre con el modo correcto (`productToEdit.is_for_sale`).

---

## 4. ProductsScreen: tab Insumos + columnas de receta

**Archivos:** `screens/ProductsScreen.tsx`, `hooks/useProducts.ts`, `lib/recipeMath.ts` (nuevo)

- Nuevo tab **Insumos** (`simple && !is_for_sale`). Muestra Stock + Costo; oculta Precio/Margen/Salud. El tab Productos ahora filtra `(simple && is_for_sale) || processed`, sacando los insumos.
- Para recetas (`processed`) se reemplaza Stock/Salud por **Producible** = `min( floor(stockInsumo / cantReceta) )` sobre los ingredientes (en modo manual, sin ingredientes → "—").
- `useProducts` expone `recipe` y `producible` por producto. `lib/recipeMath.ts` contiene `convertUsageToInventoryQty` y `computeProducible`.

---

## 5. InventoryPurchase: solo productos simples

**Archivo:** `components/expense/InventoryPurchase.tsx`

El selector de compra y el matching por IA filtran `type === 'simple'`: **incluye insumos** (`is_for_sale=false`) y **excluye recetas y servicios**, cuyo stock se deriva de ingredientes.

---

## 6. Base de datos: fix `calculate_product_cost`

**Migración:** `fix_calculate_product_cost_join_products`

La función hacía `JOIN public.ingredients` (tabla vacía) y omitía la conversión de unidad → devolvía **0** para recetas, y el trigger `update_product_cost_on_ingredient_change` sobreescribía `products.cost` con ese 0. Se corrigió para unir `public.products` y aplicar `convert_units`, igual que `deduct_stock_for_order`.

---

## Archivos Modificados

| Archivo | Cambios |
|---|---|
| `App.tsx` | Import/render de ProcessedProductScreen; arrays de pantallas de creación; ruteo de edición |
| `screens/ProcessedProductScreen.tsx` | Drawer lateral; dos modos de costo; stock=null; originScreen; reorg. ingredientes |
| `screens/SimpleProductScreen.tsx` | Selector Producto/Insumo (is_for_sale) y ocultamiento condicional de campos |
| `screens/ProductsScreen.tsx` | Tab Insumos; columna Producible; "Crear Receta" en el menú |
| `screens/SellScreen.tsx` | "Crear Receta" en el botón Crear |
| `hooks/useProducts.ts` | Exposición de `recipe` y `producible` |
| `lib/recipeMath.ts` | Nuevo: `convertUsageToInventoryQty`, `computeProducible` |
| `components/expense/InventoryPurchase.tsx` | Selector y matching IA filtrados a `type='simple'` |
| BD `calculate_product_cost` | JOIN a `products` + `convert_units` |

---

## Notas de Compatibilidad

- Los insumos ya fluían al tab Ingredientes de Inventario (`useInventory`) sin cambios.
- El tipo `PROCESSED` deja de estar inactivo: ver `flujo_creacion_productos.md` (sección "Producto con Receta").

---

## 7. Libra configurable por negocio (`pound_in_grams`)

La columna `businesses.pound_in_grams` (en Colombia la libra son **500 g**, no los 453,592 g internacionales) existía pero **ningún cálculo la usaba**. Se conectó a la conversión de unidades de las recetas.

- **`convert_units`** ahora tiene una versión de **4 argumentos** `(qty, desde, hacia, libra_g)`. La de 3 argumentos se conserva y delega con `453.592` (compatibilidad).
- Usan la libra del negocio (default 500): `calculate_product_cost` (costo de la receta), `deduct_inventory_complete` (venta online) y `deduct_stock_for_order` (sync offline).
- Frontend: `lib/recipeMath.ts` (`convertUsageToInventoryQty`, `computeProducible`) recibe `poundInGrams`; `ProcessedProductScreen` y `useProducts` lo leen de `useBusinessSettings`.
- Resultado: 20 g de un insumo a $500/libra ahora cuestan **$20** (antes $22).

### ⚠️ Pendientes / a tener en cuenta (intencionalmente NO tocados)

Se decidió **no** modificarlos porque hoy no se ejecutan y tocarlos era riesgo sin beneficio. Revisar **antes** de tocar la zona de ventas/cocina:

1. **Dos funciones de conversión:** existe también `convert_unit` (singular) con libra fija `453.592`. La usa **solo** el trigger `update_stock_on_order_complete`.
2. **Trigger inactivo:** `update_stock_on_order_complete` solo se dispara si una orden pasa a `completed` por **UPDATE**, y **ningún** flujo de la app hace eso (todas se INSERTAN ya `completed`; el descuento real lo hacen los RPC). Verificado en datos: las 322 órdenes son `INSERT` directo a `completed`. ⇒ **No hay doble descuento.** Si se agrega un flujo que complete órdenes por UPDATE (ej. "completar desde cocina"), pasarle `pound_in_grams` al trigger y cuidar el doble descuento con el RPC.
3. **Bug en `convert_unit`:** la `arroba` está definida dos veces (usa 11500 g; el segundo `ELSIF` es código muerto). Corregir si se reactiva esa función.
4. **Descuento en domicilio+cocina:** las órdenes a domicilio (`isDelivery`, estado `preparing`) no se descuentan al crearse ([useSales.ts](../../hooks/useSales.ts), `if (!isDelivery)`) ni en otro punto conocido. Hoy no afecta (ventas reales = takeaway/completed); revisar si se empieza a usar domicilio con cocina.

> Estas notas también están como comentarios en `hooks/useSales.ts` y en `COMMENT ON FUNCTION` de `convert_unit`, `convert_units` y `update_stock_on_order_complete`.
