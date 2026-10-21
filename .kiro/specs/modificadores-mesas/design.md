# Design Document

## Overview

Esta funcionalidad lleva los **productos-modificadores** (add-ons con precio) al flujo de **Mesa** (`activeTableId`) y de **Delivery/Takeaway en edición** (`editingOrderId`), reutilizando el patrón que ya funciona en **Orden Rápida**: cada add-on es una **línea hija real** de la orden, vinculada a su línea padre.

La diferencia entre Orden Rápida y los otros dos modos es **dónde vive la orden**:

- **Orden Rápida**: la orden vive solo en el estado local del carrito (`cart`) hasta el cobro. Los hijos ya se crean con `buildModifierChildren` y se persisten al finalizar la venta por la ruta `sale` (incluida la cola offline). **Ya funciona, no se toca.**
- **Mesa / Edición de pedido**: cada ítem se persiste en `order_items` de Supabase en el momento de agregarlo (escritura optimista + Realtime). Hoy esa ruta **descarta** los add-ons. Aquí está el trabajo.

### Principio rector: seguridad en producción

El cambio se diseña para ser **aditivo y retrocompatible**:

1. La columna nueva en `order_items` es **opcional** (`NULL` por defecto). Las órdenes existentes (821 filas hoy) quedan con la columna en `NULL` y se comportan exactamente igual que antes.
2. El código trata `parent_order_item_id = NULL` como "línea normal" (es el 100% de las líneas actuales). No hay backfill ni migración de datos.
3. La lógica nueva solo se activa cuando el modal envía `addedModifiers` con al menos un elemento. Un producto sin add-ons recorre exactamente el mismo camino que hoy.
4. Mesas hoy solo está habilitado en un negocio (el de pruebas); aun así, el diseño no degrada el flujo para ningún negocio.

## Cambio en la base de datos (requiere aprobación del usuario)

### Qué se va a hacer, en palabras simples

Hoy cada producto que se manda a una mesa se guarda como una "fila" en la lista de productos de esa orden. Vamos a agregarle a esa lista **una casilla nueva y opcional** que sirve para anotar: *"esta fila es un adicional que pertenece a tal producto"*.

- Si la casilla está vacía (como en todas las filas que ya existen), la fila es un producto normal. Nada cambia.
- Si la casilla apunta a otro producto de la misma orden, esa fila es su adicional (ej. "Helado" perteneciente a "Cholao").

Además, le pondremos una regla a la base de datos: **si se borra el producto padre, sus adicionales se borran solos automáticamente**, para no dejar adicionales sueltos cobrándose.

Esto **no borra ni modifica** ninguna información existente. Solo agrega una casilla vacía a una lista que ya existe.

### Detalle técnico de la migración propuesta

```sql
-- Agrega el vínculo padre-hijo a order_items (nullable, no rompe filas existentes)
ALTER TABLE public.order_items
  ADD COLUMN parent_order_item_id uuid NULL
  REFERENCES public.order_items(id) ON DELETE CASCADE;

-- Índice para buscar hijos por padre de forma eficiente
CREATE INDEX IF NOT EXISTS idx_order_items_parent
  ON public.order_items(parent_order_item_id);
```

- `ON DELETE CASCADE`: al borrar la línea padre, Postgres elimina sus hijas automáticamente (cubre el Requerimiento 7 a nivel de BD, sin lógica frágil en el cliente).
- `NULL` por defecto: las 821 filas actuales y toda orden futura sin add-ons quedan intactas.
- RLS: la tabla ya tiene RLS habilitado; agregar una columna no altera las políticas existentes. Tras aplicar, se ejecutará `get_advisors` (security/performance) para confirmar que no se introdujeron hallazgos.

> Esta migración **no se aplicará hasta que el usuario la apruebe explícitamente**. Tras aplicarla con `apply_migration`, se sincroniza a `supabase/migrations/` con `supabase migration fetch --yes` y se regeneran los tipos.

## Architecture

### Flujo actual (lo que falla en mesa)

```
ProductOptionsModal ──addedModifiers──> handleAddToOrder
                                              │
        ┌─────────────────────────────────────┼─────────────────────────────────────┐
        ▼                                     ▼                                       ▼
   activeTableId                        editingOrderId                          LOCAL (orden rápida)
   addItemToOrder(item)                 addItemToOrderById(item)                buildModifierChildren ✅
   ❌ ignora addedModifiers             ❌ ignora addedModifiers                cart += [padre, ...hijos]
```

### Flujo propuesto

```
ProductOptionsModal ──addedModifiers──> handleAddToOrder
        │                                     │                                       │
        ▼                                     ▼                                       ▼
   activeTableId                        editingOrderId                          LOCAL (sin cambios)
   1. addItemToOrder(item, addons)      1. addItemToOrderById(item, addons)
      └─ inserta PADRE → obtiene id        └─ inserta PADRE → obtiene id
      └─ inserta cada HIJO con             └─ inserta cada HIJO con
         parent_order_item_id = padre.id      parent_order_item_id = padre.id
   2. cart optimista: padre + hijos     2. cart optimista: padre + hijos
      (reconciliar temp-id → id real)       (reconciliar temp-id → id real)
```

### Agrupación visual (ya existe, se reutiliza)

`MenuScreen` y `PaymentScreen` ya filtran `!parentOrderItemId`, calculan `modifierTags` y `extraAmount`, y cascadean quitar/cantidad a los hijos. El único ajuste es que **al cargar la orden de una mesa desde la BD** (`fetchTableOrder`), se mapee `parent_order_item_id` (BD) → `parentOrderItemId` (CartItem) para que el agrupado funcione también al reabrir la mesa.

## Components and Interfaces

### 1. `hooks/useSales.ts`

`addItemToOrder(tableId, item)` y `addItemToOrderById(orderId, item, options)` reciben un parámetro nuevo opcional con los add-ons y, tras crear la línea padre, crean las líneas hijas.

```typescript
// item gana un campo opcional:
//   addedModifiers?: { id: string; name: string; price: number }[]

// Tras insertar el PADRE y obtener newItem.id:
if (item.addedModifiers?.length) {
  const childrenRows = item.addedModifiers.map(m => ({
    order_id: orderId,
    product_id: m.id,
    product_name: m.name,
    quantity: item.quantity,                 // hija = cantidad del padre
    unit_price: m.price,
    total_price: Math.round(m.price * item.quantity),
    status: 'pending',
    parent_order_item_id: newItem.id,        // vínculo
  }));
  const { data: children, error } = await supabase
    .from('order_items').insert(childrenRows).select('id');
  if (error) throw error;                    // dispara rollback en el llamador
  return { action: 'created', orderItemId: newItem.id, newQuantity: item.quantity, childOrderItemIds: children.map(c => c.id) };
}
```

Reglas clave:

- **No mergear cuando hay add-ons**: si `item.addedModifiers?.length`, omitir la búsqueda de `existingItem` (cada combinación con add-ons es su propia línea), igual que en local.
- **Excluir hijos del merge**: la búsqueda de `existingItem` debe ignorar filas con `parent_order_item_id != null` para nunca mergear contra una línea hija.
- **`fetchTableOrder`**: incluir `parent_order_item_id` en el `select` y mapearlo a `parentOrderItemId` en el ítem devuelto. Resolver `unit_price`/`name` se conservan tal como están persistidos.

### 2. `App.tsx` — `handleAddToOrder`

- **Rama `activeTableId`**: pasar `addedModifiers` a `addItemToOrder`. En el carrito optimista, además del padre, insertar los hijos con `buildModifierChildren(tempOrderItemId, quantity, addedModifiers)`. Al volver el `result`, reemplazar el `temp-` del padre por el `orderItemId` real y re-vincular los hijos (`parentOrderItemId`) al id real con `childOrderItemIds`.
- **Rama `editingOrderId`**: idéntico patrón con `addItemToOrderById`.
- **Items con add-ons nunca mergean** en el carrito optimista (mismo criterio `hasModifiers ? -1 : findIndex(...)` que ya usa la rama local).
- **`buildModifierChildren`** se reutiliza tal cual (ya resuelve el producto del catálogo en vivo).

### 3. Eliminar / cambiar cantidad (cascada)

- **BD**: `ON DELETE CASCADE` elimina los hijos al borrar el padre. `removeOrderItem` solo necesita borrar el padre; los hijos caen solos.
- **Carrito local**: `MenuScreen`/`PaymentScreen` ya cascadean (`children.forEach(c => removeFromCart(c))` y `updateQuantity(c, delta)`). Para mesa, al cambiar cantidad del padre se debe propagar la nueva cantidad a las filas hijas en BD (actualización equivalente a la del padre).

### 4. Comanda, ticket e inventario (ya cubiertos por líneas reales)

- Como cada add-on es una **fila real** de `order_items`, el ticket lo imprime como línea y el inventario lo descuenta por la ruta normal (FIFO de `lot_allocations` por `order_item_id`) sin cambios.
- La comanda y el ticket ya marcan `isModifier`/`modifiers` a partir de `parentOrderItemId` al construir `receiptItems` en `App.tsx`. Al venir de BD con el mapeo de `fetchTableOrder`, ese marcado funciona igual.

## Data Models

### `order_items` (tabla existente + columna nueva)

| Columna | Tipo | Nota |
|---------|------|------|
| ... (todas las actuales) | — | sin cambios |
| `parent_order_item_id` | `uuid NULL` FK→`order_items(id)` ON DELETE CASCADE | **nueva**; NULL = línea normal |

### `CartItem` (TypeScript, ya existe)

`parentOrderItemId?: string` y `addedModifiers?: AddedModifier[]` ya están definidos en `types.ts`. No se requieren tipos nuevos; solo poblar `parentOrderItemId` al mapear desde BD.

## Error Handling

| Caso | Comportamiento |
|------|----------------|
| Falla al insertar padre o algún hijo (BD) | Revertir el carrito al estado previo (`setCart(previousCart)`), intentar limpiar líneas parciales del padre creado (que arrastra hijos por cascade) y mostrar toast de error. |
| Un add-on no se resuelve en catálogo (inexistente/inactivo) | No crear la línea; cancelar la operación del producto; toast indicando el add-on no disponible. |
| `parent_order_item_id` apunta a un id inexistente al cargar | Tratar la fila como línea normal; no bloquear la carga; aviso no intrusivo. |
| `total_price` de una hija nulo/no numérico | Tratar como 0 en sumas; registrar/avisar; conservar el resto. |

## Estrategia offline

- **Mesas/Edición** persisten en línea (escritura directa a `order_items`). La adición incremental a mesas **no** pasa por la cola offline hoy (la cola solo soporta `sale`, `expense`, etc., no `add_order_item`). Por tanto, los add-ons en mesa heredan la misma característica que el resto de ítems de mesa: requieren conexión para persistir, como ya ocurre.
- **Orden Rápida** finaliza por la ruta `sale`, que serializa el carrito completo (padre + hijos) en el payload offline. Esto **ya funciona** y no se modifica; los hijos viajan como líneas del payload y se reconstruyen al sincronizar.
- No se introduce un tipo de transacción offline nuevo en esta iteración (evita complejidad y riesgo). Si en el futuro se quisiera edición de mesa 100% offline, se haría como feature separada.

> Nota: el Requerimiento 8 (cola offline con resolución de `parent_order_item_id`) aplica al **payload de `sale`** de orden rápida, que ya conserva la relación padre-hijo en memoria antes de persistir. Para mesa, la relación se resuelve en línea con el id real devuelto por la inserción del padre.

## Seguridad de la merge (IMPLEMENTAR-MESAS → main)

- Cambios concentrados en `hooks/useSales.ts`, `App.tsx` (ramas `activeTableId`/`editingOrderId` de `handleAddToOrder`) y la migración SQL. Ninguno toca la lógica de Orden Rápida ni el modelo de `CustomizableOption` reabierto antes.
- La columna es aditiva; el código es tolerante a `NULL`. Si la rama se mergea a `main` antes de aplicar la migración en producción, el código no falla (trata todo como líneas normales); al aplicar la migración después, los add-ons en mesa empiezan a persistir.

## Correctness Properties

Invariantes que deben cumplirse siempre (independientes de la secuencia de operaciones):

### Property 1: Integridad del vínculo
Toda Linea_Hija tiene un `parent_order_item_id` que apunta a una Linea_Padre existente en la misma orden, o es `NULL` (línea normal). Nunca apunta a otra hija.

**Validates: Requirements 1.2, 2.1, 9.4, 9.5**

### Property 2: Cantidad espejo
Para toda Linea_Padre con hijas, `cantidad(hija) == cantidad(padre)` tras cualquier creación o cambio de cantidad.

**Validates: Requirements 1.5, 2.2, 6.3**

### Property 3: Conservación del total
`total_orden == Σ total_price(todas las líneas, padres e hijas)`. Agregar, quitar o editar un producto con add-ons deja el total consistente con la suma de las filas reales.

**Validates: Requirements 4.3, 4.5, 7.4**

### Property 4: Cascada sin huérfanos
Tras eliminar una Linea_Padre, no existe ninguna Linea_Hija con `parent_order_item_id` igual al id eliminado (garantizado por `ON DELETE CASCADE`).

**Validates: Requirements 7.1, 7.2, 6.2**

### Property 5: No-merge con add-ons
Dos adiciones de un mismo producto que llevan add-ons nunca se fusionan en una sola línea; cada una conserva su propio conjunto de hijas.

**Validates: Requirements 1.1, 6.1**

### Property 6: Idempotencia visual
El agrupado (ocultar hijas, etiquetas, precio combinado) produce el mismo resultado ya sea que la orden venga del carrito local o se recargue desde la BD.

**Validates: Requirements 3.1, 3.5, 4.1**

### Property 7: Retrocompatibilidad
Una orden con todas sus filas en `parent_order_item_id = NULL` se renderiza, edita, cobra y descuenta inventario igual que antes de esta funcionalidad.

**Validates: Requirements 9.1, 9.2, 9.3**

## Testing Strategy

Verificación = `npm run build` (typecheck) + checklist manual en `npm run dev` (no hay runner de tests en el repo).

Checklist manual (negocio de pruebas con mesas habilitadas):

1. **Mesa, producto con add-ons**: agregar "Cholao + Helado" → ver padre con etiqueta y precio combinado en el carrito; en BD aparecen 2 filas (padre + hija con `parent_order_item_id`).
2. **Mesa, reabrir**: salir y volver a la mesa → el agrupado se mantiene (mapeo desde BD).
3. **Mesa, quitar padre** → la hija desaparece (cascade) y el total baja correcto.
4. **Mesa, cambiar cantidad del padre** → la hija sigue la misma cantidad.
5. **Mesa, producto sin add-ons** → comportamiento idéntico al actual (sin filas hijas).
6. **Delivery/Takeaway en edición** → mismos casos 1–5.
7. **Orden rápida** → sigue funcionando igual (no regresión).
8. **Cobro de mesa con add-ons** → ticket imprime cada add-on como línea; inventario descuenta cada add-on.
9. **Orden vieja existente** (sin la columna poblada) → se carga, edita y cobra sin errores.
