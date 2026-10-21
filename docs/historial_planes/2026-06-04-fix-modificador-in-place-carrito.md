# Fix: el modificador del carrito debe actualizar la misma fila (sin split) — 2026-06-04

## Resumen

En el modo Catálogo, al aplicar un **modificador** a un producto del carrito (botón "Modificador" al expandir un `CartItemRow`), el sistema **creaba una fila nueva** en lugar de actualizar la fila existente. El comportamiento esperado es que el modificador modifique **in-place** la misma fila.

Este documento corrige el comportamiento descrito en
[`2026-06-04-catalogo-filas-individuales-y-comprobante-publico.md`](./2026-06-04-catalogo-filas-individuales-y-comprobante-publico.md):
las filas se siguen creando individualmente desde el botón "+" de la tarjeta, pero **editar** una fila con el modificador ya no la divide.

---

## Síntoma

1. Agregar un producto al carrito desde el catálogo (ej. "Arroz del llano").
2. Expandir la fila → "Modificador" → seleccionar una opción (ej. "Sin fresas") → confirmar.
3. **Resultado incorrecto:** aparecía una segunda fila del mismo producto; la original quedaba sin la modificación.
4. **Resultado esperado:** la misma fila queda actualizada con la modificación.

---

## Causa raíz

Dos problemas combinados en `App.tsx`:

### 1. Lógica de "split" en `handleAddToOrder`

Cuando se editaba un item del carrito (`itemToSplit`), había una rama que solo actualizaba in-place
si `quantity > itemToSplit.quantity` **o** `itemToSplit.quantity === 1`. En cualquier otro caso
hacía un *split*: restaba 1 unidad al original y creaba una fila nueva con la configuración modificada.

### 2. Stale closure: `itemToSplit` faltaba en las dependencias del `useCallback` (causa principal)

`handleAddToOrder` está memorizada con `useCallback`, pero su array de dependencias **no incluía
`itemToSplit`**. La función capturaba el valor inicial (`null`), por lo que el bloque
`if (itemToSplit) { ... }` **nunca se ejecutaba**. El flujo siempre caía en la lógica de "agregar"
(que crea una fila nueva), sin importar que se estuviera editando.

Array original:
```js
}, [activeTableId, editingOrderId, cart, addItemToOrder, addItemToOrderById, showToast]);
```

---

## Cambios Implementados

Todos en `App.tsx`.

### 1. Eliminado el split — siempre actualización in-place

Se reemplazó toda la rama de `if (itemToSplit)` que decidía entre in-place vs split por una
**actualización in-place única**: se busca el item en el carrito y se sobrescriben
`quantity`, `removedIngredients`, `cookingTerm` y `notes`. Se mantiene la sincronización con BD
(mesa y edición) mediante `removeOrderItem(ById)` + `addItemToOrder(ById)`.

El match del item en `setCart` se hace:
- por `orderItemId` cuando existe (modo mesa/DB, edición y ahora también local), o
- por *fallback* (id + configuración original) si no hubiera `orderItemId`.

### 2. `orderItemId` para los items en modo local (Orden Rápida)

Antes, en modo local (sin mesa) los items se agregaban **sin** `orderItemId`, lo que impedía
identificarlos de forma única para actualizarlos. Ahora se les asigna un id local
(`local-<timestamp>-<rand>`) tanto en `handleQuickAddIndividual` como en la rama local de
`handleAddToOrder`.

### 3. Fix del array de dependencias del `useCallback` (causa principal)

Se agregaron `itemToSplit`, `editingOrderStatus`, `removeOrderItem` y `removeOrderItemById`:

```js
}, [activeTableId, editingOrderId, editingOrderStatus, cart, itemToSplit,
    addItemToOrder, addItemToOrderById, removeOrderItem, removeOrderItemById, showToast]);
```

### 4. Limpieza de estado al cerrar el modal

El `onClose` de `ProductOptionsModal` ahora también limpia `itemToSplit`
(`onClose={() => { setOptionsProduct(null); setItemToSplit(null); }}`) para no dejar estado colgado.

---

## Comportamiento resultante

- **"+" en la tarjeta del catálogo:** sigue creando una fila individual por unidad (sin cambios).
- **"Modificador" sobre una fila del carrito:** actualiza esa misma fila in-place, sin crear filas nuevas ni hacer split, en los tres modos (local/Orden Rápida, mesa/DB y edición de orden).

---

## Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `App.tsx` | `handleAddToOrder`: eliminado split → in-place; `orderItemId` local en `handleQuickAddIndividual` y rama local; dependencias del `useCallback` corregidas; `onClose` del modal limpia `itemToSplit` |

---

## Verificación

- `getDiagnostics` limpio en `App.tsx`.
