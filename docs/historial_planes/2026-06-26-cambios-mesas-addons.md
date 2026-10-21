# Cambios de la rama `IMPLEMENTAR-MESAS` y su impacto en Orden Rápida

Fecha de análisis: 2026-06-26
Rama analizada: `IMPLEMENTAR-MESAS` (comparada contra `main`)

Este documento resume **qué cambió** en la rama de mesas y responde a la pregunta clave:
¿estos cambios afectan el flujo de una venta de **Orden Rápida**?

---

## 1. Resumen de archivos modificados

| Archivo | Qué cambió |
|---------|-----------|
| `App.tsx` | Núcleo del carrito: soporte de **add-ons** (líneas hijas), gate de permiso `pos_sell` al pagar, navegación de regreso desde pago. |
| `hooks/useSales.ts` | `addItemToOrder` / `addItemToOrderById` ahora crean **líneas hijas** (`parent_order_item_id`) por cada modificador. Reglas de "nunca mergear" si la línea lleva add-ons. |
| `screens/MenuScreen.tsx` | Carrito agrupa padre + add-ons; separador "Comanda enviada"; control de mesas en móvil; barra inferior con "Comanda" + "Cobrar". |
| `screens/SellScreen.tsx` | Tab por defecto y fallback siempre `orden_rapida`; regreso correcto al carrito de mesa desde pago. |
| `hooks/useTables.ts` | Canal Realtime con nombre único por instancia; suscripción a cambios de `rooms`. |
| `lib/kitchenCommandService.ts` | Logs de diagnóstico de presencia de impresora (no cambia lógica). |
| `hooks/useKitchenPrinter.ts` | Logs de diagnóstico. |
| `components/Sidebar.tsx` | Ajustes menores de navegación. |
| `supabase/migrations/20260611_add_parent_order_item_id.sql` | Nueva columna `order_items.parent_order_item_id` (uuid, nullable, FK self con `ON DELETE CASCADE`). |

Specs y docs nuevos: `.kiro/specs/modificadores-mesas/`, `docs/caracteristicas/mesas.md`, planes en `docs/historial_planes/`.

---

## 2. La feature central: Add-ons (modificadores como productos)

El cambio más profundo es el sistema de **add-ons**: un producto del carrito puede llevar
modificadores que son **productos reales** con su propio precio. Cada add-on se guarda como
una **línea hija** vinculada a la línea padre mediante `parent_order_item_id`.

```
Línea padre:  Hamburguesa            $15.000   (orderItemId: X)
 ├─ hijo:     + Tocineta             $3.000    (parentOrderItemId: X)
 └─ hijo:     + Queso extra          $2.000    (parentOrderItemId: X)
```

Reglas nuevas asociadas:
- Una línea con add-ons **nunca se mergea** con otra (cada combinación es su propia fila).
- Nunca se mergea **contra** una línea hija.
- Al borrar el padre se borran las hijas (cascade en BD; en carrito local se filtran por `parentOrderItemId`).

### Verificación en BD (real, vía MCP)
La columna existe y está aplicada:
```
order_items.parent_order_item_id  →  uuid, nullable ✅
```

---

## 3. Gate de permiso al finalizar venta

`handleProcessPayment` ahora bloquea el cobro si el usuario no tiene permiso de finalizar ventas:

```ts
if (!canFinalizeSale()) {
  showToast('No tienes permiso para finalizar ventas', 'error');
  return;
}
```

`canFinalizeSale()` usa `pos_sell` si está definido; **si no, hereda de `pos_view`**.
→ No rompe configuraciones existentes: quien podía vender, sigue pudiendo.

---

## 4. ¿Afecta esto al flujo de Orden Rápida?

**Respuesta corta: NO hay regresión para la orden rápida normal (sin modificadores).**

La función `handleAddToCart` tiene tres ramas independientes:

| Contexto | Condición | Escribe en BD al agregar |
|----------|-----------|--------------------------|
| Mesa | `activeTableId` definido | Sí (order_items) |
| Edición delivery/takeaway | `editingOrderId` definido | Sí (order_items por id) |
| **Orden Rápida** | sin `activeTableId` ni `editingOrderId` | **No — carrito local**; la venta se registra solo al pagar |

La orden rápida cae en la rama **local**. Las únicas líneas nuevas en esa rama están
**guardadas tras `hasModifiers`**:

```ts
const hasModifiers = !!(addedModifiers && addedModifiers.length > 0);
...
const children = hasModifiers ? buildModifierChildren(...) : [];
```

- **Producto sin modificadores** → `hasModifiers = false` → comportamiento **idéntico al anterior**
  (mismo merge, mismo carrito). Sin cambios.
- **Producto con modificadores** → comportamiento **nuevo** (líneas hijas locales). Es una
  feature nueva, no un cambio del camino clásico.

Al pagar, el mapeo del carrito a venta y a recibo ya contempla las hijas
(`isModifier: !!item.parentOrderItemId`, `modifiers: [...]`), tanto online como en cola offline.

### Conclusión del riesgo
- El riesgo introducido se concentra en **productos configurados con add-ons**.
- La orden rápida "de toda la vida" (productos simples) **no cambió**.
- El gate de permiso **no** bloquea a usuarios que ya vendían (fallback a `pos_view`).

---

## 5. Plan B: desactivar mesas sin perder ventas

El sistema **ya soporta desactivar mesas** sin tocar código:

- Toggle en **Ajustes → Activar/Desactivar → "Mesas"** (`SalesModeSettingsPanel`).
- Persistido en `businesses.is_tables_enabled` (contexto `BusinessSettingsContext`).
- Con mesas **desactivadas**:
  - `SellScreen` solo muestra `orden_rapida` (no renderiza `TablesScreen`).
  - `onSelectTable` / `onSelectQuickOrder` quedan `undefined` → el control de mesas no se monta.
  - El POS funciona **solo en Orden Rápida**, exactamente como antes de la rama.

> Importante: desactivar mesas **no** revierte el sistema de add-ons (es código compartido y
> ya está en la rama). Si el problema estuviera en los add-ons, desactivar mesas no lo apaga;
> habría que no configurar modificadores en los productos, o revertir esa parte específica.

---

## 6. Recomendación

1. La orden rápida con productos simples es segura: se puede usar la rama con tranquilidad.
2. Antes de producción, **probar específicamente**: agregar un producto **con add-ons** en
   orden rápida → cobrar → verificar total, recibo e impresión (las hijas deben sumar).
3. Si aparece un bug en mesas: usar el toggle **Mesas = OFF**. El POS sigue registrando ventas
   en Orden Rápida como hasta ahora.
