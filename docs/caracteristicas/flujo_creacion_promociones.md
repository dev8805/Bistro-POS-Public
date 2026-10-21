# Flujo de Creación de Promociones

Componente: `screens/CreatePromotionScreen.tsx`  
Hook: `hooks/usePromotions.ts`  
Acceso: Panel de Productos → "Crear Promoción"

Una **promoción** es un conjunto de 2 o más productos vendidos juntos a un precio especial. Al momento de la venta, la promoción aparece como un ítem único en el carrito — no como cada producto por separado.

> [!IMPORTANT]
> Las promociones **no tienen `ProductType`** ni stock propio. Son una entidad separada (`promotions` + `promotion_items`), no una entrada en la tabla `products`.

---

## Campos del Formulario

| Campo | Obligatorio | Notas |
|---|---|---|
| Nombre | ✅ Sí | Texto libre. Ej: "Combo Pareja", "2x1 Hamburguesas". |
| Descripción | ❌ No | Texto corto. Solo informativo. |
| Imagen | ❌ No | Mismo flujo que productos: subir archivo, cámara, pegar. |
| Productos | ✅ Mínimo 2 | Seleccionados desde el catálogo activo. |
| Precio promo por producto | ✅ Por cada uno | Precio individual dentro del combo. Editable inline. |

---

## Selección de Productos

El botón "Agregar" abre un modal tipo bottom-sheet (móvil) o diálogo centrado (desktop). Dentro:

- **Búsqueda**: filtra por nombre, en tiempo real, sobre los productos activos (`is_active = true`).
- **Exclusión automática**: un producto ya seleccionado **no aparece** en el picker. Está filtrado por `Set` de IDs.
- **Tipos incluidos**: cualquier producto activo — `SIMPLE`, `SERVICE`, `PROCESSED`. No hay restricción por tipo.

Al seleccionar un producto, se precarga su `promoPrice` con el **precio de venta original** del producto. El usuario lo ajusta inline desde la lista principal.

---

## Precio de Cada Producto en la Promoción

Cada producto en la lista tiene un campo de precio editable (ancho fijo, alineado a la derecha). Este precio es el `promo_price` que se guarda en `promotion_items`.

**El descuento porcentual se calcula y muestra en tiempo real:**
```
discount = Math.round(((originalPrice - promoPrice) / originalPrice) * 100)
```
Se muestra en verde si es positivo (ej: `-20%`). No se muestra si no hay descuento o si el producto no tiene precio original.

---

## Resumen Financiero (Panel inferior)

Calculado en tiempo real con `useMemo`:

| Línea | Fórmula |
|---|---|
| Costo total | Suma de `product.cost` de cada producto (costo de inventario) |
| Precio original combinado | Suma de `product.price` (precio regular de cada producto) |
| **Precio Promoción** | Suma de `promoPrice` de cada producto en el combo |
| Margen | `totalPrice − totalCost` y `(margen / totalPrice) × 100%` |

El margen se muestra en verde si es positivo, rojo si negativo. Esto es útil para detectar promociones que generan pérdida.

---

## Validaciones Antes de Guardar

1. Sin nombre → toast de advertencia, bloqueado.
2. Menos de 2 productos → toast de advertencia, bloqueado. Además, el botón "Crear Promoción" permanece deshabilitado (`disabled={selectedProducts.length < 2 || !promoName.trim()}`).
3. Sin `business_id` → retorna silenciosamente.

No hay validación de precio mínimo — se puede crear una promoción con precio $0 por producto.

---

## Guardado (`handleSave`)

Llama a `createPromotion(name, description, imageUrl, items)` del hook `usePromotions`.

El payload `items` es:
```ts
[
  { product_id: string, promo_price: number },
  { product_id: string, promo_price: number },
  ...
]
```

El hook internamente:
1. Hace `INSERT` en `promotions` con nombre, descripción, imagen y `business_id`.
2. Hace `INSERT` en `promotion_items` por cada producto del combo.

**Post-guardado:** modal de éxito con opciones:
- **"Crear otra"**: resetea el formulario completamente y permanece en la pantalla.
- **"Salir"**: navega a `originScreen` (generalmente `Screen.PRODUCTS`).

---

## Diferencia con Productos Agrupados

| Aspecto | Promoción | Producto Simple |
|---|---|---|
| Tabla | `promotions` + `promotion_items` | `products` |
| Stock propio | ❌ No | ✅ Sí |
| Aparece en venta | Como ítem único | Como ítem individual |
| Precio fijo | Suma de `promo_price` por producto | `price` del producto |
| Editable post-creación | Según `usePromotions` | `SimpleProductScreen` |
| Lookup por EAN | ❌ No | ✅ Sí |
| Apodos | ❌ No | ✅ Sí |

---

## Tablas de Supabase Involucradas

| Tabla | Operación | Cuándo |
|---|---|---|
| `promotions` | INSERT | Al confirmar la promoción |
| `promotion_items` | INSERT (N registros) | Uno por producto seleccionado |
| `products` | SELECT | Para cargar el picker (via `useProducts`) |

---

## Inconsistencias Detectadas

> [!NOTE]
> **No hay edición desde `CreatePromotionScreen`**: solo tiene modo creación. Sin embargo, `usePromotions` sí expone `updatePromotion` — la edición existe en otro punto de entrada del flujo.

---

## Fixes Implementados

### Mínimo de productos: 1 (antes era 2)

Las validaciones en `handleSave` y el botón "Crear Promoción" ahora permiten crear una promoción con un solo producto. Esto es útil para promociones de un ítem a precio especial (ej: "Precio lunes", descuento puntual).

Cambios aplicados en `CreatePromotionScreen`:
- `selectedProducts.length < 2` → `< 1` en `handleSave` y en `disabled` del botón
- Texto placeholder: "Agrega al menos 1 producto"
- Toast: "Seleccione al menos 1 producto"

### Validación de precio $0 en productos del combo

`handleSave` ahora bloquea si algún producto de la promoción tiene `promo_price <= 0`:

```ts
if (selectedProducts.some(sp => parseNumber(sp.promoPrice) <= 0)) {
    showToast('Todos los productos deben tener un precio mayor a $0', 'warning');
    return;
}
```

Previene promociones con ventas gratuitas por omisión del precio.

### Compensación en `createPromotion` y `updatePromotion` (`usePromotions`)

**Antes:** si el `INSERT` en `promotion_items` fallaba, la `promotion` principal quedaba huérfana en BD (visible en UI pero sin productos).

**`createPromotion`:** si el INSERT de items falla, se hace DELETE de la promo recién creada antes de propagar el error. El usuario ve el toast de error y puede reintentar sin datos duplicados.

**`updatePromotion`:** se hace snapshot de los items actuales antes del DELETE. Si el reinsert falla, los items originales se restauran automáticamente.

> [!NOTE]
> Esta compensación es best-effort (no transaccional). En condiciones de red muy inestable puede fallar también el rollback. La solución definitiva sería una función RPC de PostgreSQL.

---

## Coexistencia con sidebar y Asistente IA

`CreatePromotionScreen` usa `md:left-60` en su contenedor raíz `fixed inset-0` para que el sidebar permanezca visible en desktop. Z-index: `z-[100]`. El chat (z-[110]) queda siempre al frente.
