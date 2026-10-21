# Flujo de Registro de Mermas

Componente: `components/expense/WasteRegister.tsx`  
Acceso: Panel de Gastos → Registro de Merma

Registra la pérdida o deterioro de productos del inventario. A diferencia de [`flujo_registro_gasto.md`](./flujo_registro_gasto.md), una merma **reduce el stock del producto afectado** directamente en la tabla `products`. No genera movimientos de caja ni deudas.

Tiene dos pestañas: **Registro** e **Historial**.

---

## Formulario de Merma

### Carrito de Items (multi-producto)

El formulario permite registrar varias mermas en una sola operación. Cada fila tiene:

- **Cantidad** (`number input`): unidades perdidas. Solo números enteros positivos.
- **Producto afectado** (`text + autocomplete`): busca por nombre o código de barras. Muestra hasta 10 resultados con el stock actual visible. Se filtra sobre `products` en memoria (no hace query a Supabase).

**Comportamiento automático de filas:** al completar tanto `cantidad` como `producto` en la última fila, el sistema añade automáticamente una nueva fila vacía. Esto permite registrar múltiples productos sin tocar ningún botón de "Agregar".

**Cálculo automático del valor:** al seleccionar un producto o cambiar la cantidad, si el producto tiene `cost > 0`, el monto de esa fila se calcula como `quantity × product.cost`. Este valor es **de solo lectura** — el usuario no lo puede editar manualmente en el formulario principal.

El **total de la merma** se muestra como la suma de todos los montos calculados.

### Motivo de Merma

Selector dropdown con búsqueda integrada (igual al selector de categorías de [`flujo_registro_gasto.md`](./flujo_registro_gasto.md)). Los motivos son etiquetas libres configurables: pueden crearse y eliminarse desde el mismo formulario.

El motivo es **obligatorio** para confirmar el registro. Si no hay ninguno seleccionado, el botón "Confirmar Registro" permanece deshabilitado.

Motivos de ejemplo típicos: `VENCIMIENTO`, `DAÑO`, `ROBO`, `ERROR OPERATIVO`, etc.

### Observaciones

Campo de texto libre (no visible en el código JSX del formulario visible, pero sí en el estado `description` y en el `onSave` payload). Se muestra en el historial si no es `'Ajuste de inventario'`.

---

## Validaciones Antes de Guardar

1. **Sin items válidos** → toast de error. Un item válido requiere `selectedProduct !== null` y `quantity > 0`.
2. **Producto sin stock** → bloqueado. Si `stock == null || stock <= 0` en alguno de los items seleccionados, el registro se bloquea con un mensaje indicando qué productos están afectados.
3. **Sin motivo** → el botón queda deshabilitado (visible en la prop `disabled` del `AppButton`).

---

## Proceso de Guardado (`handleSave`)

### Modo Offline
Si no hay conexión (`!navigator.onLine`):
1. Reduce el stock en **IndexedDB** de forma optimista: `newStock = Math.max(0, stock - quantity)` — nunca baja de 0.
2. Emite el evento `wastage-stock-updated` para que la UI de React refleje el stock actualizado inmediatamente.
3. Encola cada item como una operación independiente `'shrinkage'` en `offlineQueue` con: `productId`, `productName`, `quantity`, `amount`, `reason`, `description`, `date`.
4. Al recuperar conexión, el sync procesa la cola.

### Modo Online
Por cada item válido del carrito:

1. **Actualiza el stock** directamente en Supabase:
   ```ts
   supabase.from('products').update({ stock: newStock }).eq('id', productId)
   // donde newStock = Math.max(0, product.stock - wasteQty)
   ```
2. Dispara el evento global `wastage-stock-updated` con `{ items: [{ productId, quantity }] }` para refrescar la UI en tiempo real.
3. Llama a `onSave()` del componente padre **una vez por item** con `type: 'waste'`. El padre registra el egreso en la tabla `wastage`.

> [!IMPORTANT]
> La reducción de stock se hace **directamente** en la tabla `products`, no via `inventory_lots`. Esto es diferente a la compra, que gestiona el stock a través de lotes. Una merma no está vinculada a ningún lote específico.

---

## Historial de Mermas

Se carga bajo demanda al cambiar a la pestaña "Historial" (`fetchWastages()`). Muestra todas las mermas de `wastage`, incluyendo: nombre del producto, cantidad (badge `×N`), motivo (badge rojo), monto y fecha.

### Edición (`handleStartEditWaste` / `handleSaveEditWaste`)
Permite corregir: **cantidad**, **monto**, **motivo** y **observación** de una merma registrada. Inline dentro de la tarjeta. Persiste via `updateWastage`.

Cuando se edita la **cantidad**, `updateWastage` recalcula el stock del producto afectado:
- Calcula la diferencia entre la cantidad original y la nueva.
- Aplica esa diferencia al stock actual del producto en `products`.
- Emite el evento `wastage-stock-updated` para refrescar la UI en tiempo real.

Ejemplo: merma de 10 → editar a 5 → stock del producto sube 5 unidades.

### Eliminación (`handleDeleteWastage`)
Pide confirmación. Llama a `deleteWastage(id)` del hook `useExpenses`, que antes de borrar el registro:
1. Lee la cantidad de la merma y el `product_id`.
2. Restaura el stock del producto: `stock + quantity`.
3. Emite el evento `wastage-stock-updated` para refrescar la UI.
4. Elimina el registro de `wastage`.

---

## Diferencia con Ajuste de Inventario

Las mermas y los ajustes de inventario comparten la tabla `wastage`, pero tienen orígenes distintos:

| Aspecto | Merma | Ajuste de Inventario |
|---|---|---|
| Origen | `WasteRegister.tsx` (manual) | Ajuste directo desde panel de productos |
| Requiere motivo | ✅ Sí | ❌ No (descripción = `'Ajuste de inventario'`) |
| Reduce stock | ✅ Sí | ✅ Sí (o lo incrementa, según el ajuste) |
| Muestra en historial | ✅ Sí | ✅ Sí (filtrado por descripción) |
| Reversión disponible | ✅ Sí (vía eliminación del registro) | ❌ No |

---

## Tablas de Supabase Involucradas

| Tabla | Operación | Cuándo |
|---|---|---|
| `products` | UPDATE (stock) | Al confirmar, una vez por item |
| `wastage` | INSERT | Via `onSave()` del padre, una vez por item |
| `products` | UPDATE (stock) | Al eliminar o editar cantidad de una merma (restauración) |
| `wastage_reasons` | SELECT / INSERT / DELETE | Gestión de motivos en el formulario |

> [!NOTE]
> **Carga bajo demanda y caché local de motivos (`wastage_reasons`)**: A diferencia de versiones anteriores donde el hook `useExpenses` consultaba `wastage_reasons` automáticamente en cualquier pantalla que llamara al hook (como Mesas, Ventas o Home), ahora la consulta se dispara **únicamente** cuando se monta el componente `WasteRegister.tsx`. Además, los motivos se persisten en `localStorage` (`bistro_wastage_reasons_${businessId}`), de modo que si ya existen en memoria no se vuelve a consultar a Supabase a menos que se agregue o elimine un motivo explícitamente.

