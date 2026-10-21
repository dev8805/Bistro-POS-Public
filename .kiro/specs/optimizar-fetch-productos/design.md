# Design Document

## Overview

Elimina el refetch completo de productos en cada cambio. La clave: hacer que `useProducts` reaccione al relay con una **actualización puntual optimista** (como ya hace `App.tsx`), en vez de re-descargar todo el catálogo. Se conserva `useProducts` montado (lo necesitan las categorías y las pantallas de admin); solo cambia **cómo** reacciona.

Mapa de requisitos: Req 1 (update puntual), Req 2 (no auto-refresco del emisor), Req 3 (sincronización admin), Req 4 (producible), Req 5 (no-regresión).

## Architecture

```
ANTES (cada venta / cambio de producto):
  products UPDATE → 'products-sync' (App) → relay 'products-realtime-changed'
       └─ useProducts → fetchProducts() COMPLETO (~32–93 KB) en cada dispositivo (incl. POS y emisor)

DESPUÉS:
  products UPDATE → 'products-sync' (App) → relay (solo para OTROS dispositivos)
       └─ useProducts → actualiza SOLO el producto cambiado en memoria (0 descarga)
  INSERT/DELETE  → useProducts → fetchProducts() (alta/baja, poco frecuente)
```

`App.tsx` ya hace exactamente este patrón en su handler de `products-sync` (update optimista en UPDATE, `fetchProducts` solo en INSERT/DELETE). Replicamos esa lógica en el consumidor del relay (`useProducts`).

## Components and Interfaces

### 1. `App.tsx` — relay solo para cambios remotos (Req 2)

Mover el `dispatchEvent` del relay para que respete el Guard_Local: no emitir (en este dispositivo) cuando el cambio es local.

**Antes:**
```ts
(payload) => {
  const { eventType, new: newRecord, old: oldRecord } = payload;
  window.dispatchEvent(new CustomEvent('products-realtime-changed', { detail: {...} })); // SIEMPRE
  if (isLocalStockUpdateRef.current) return;
  ...
}
```
**Después:**
```ts
(payload) => {
  const { eventType, new: newRecord, old: oldRecord } = payload;
  if (isLocalStockUpdateRef.current) return; // cambio propio: App ya lo manejó vía 'sale-completed'
  window.dispatchEvent(new CustomEvent('products-realtime-changed', { detail: { eventType, new: newRecord, old: oldRecord } }));
  if (eventType === 'UPDATE' && newRecord) { /* update optimista de App */ }
  else if (eventType === 'INSERT' || eventType === 'DELETE') { fetchProducts(); }
}
```

### 2. `hooks/useProducts.ts` — reaccionar puntual al relay (Req 1, 3, 4)

**Antes** (refetch completo en cualquier cambio):
```ts
const onRealtimeChange = () => { debounce → fetchProducts(); };
window.addEventListener('products-realtime-changed', onRealtimeChange);
```
**Después** (usa el `detail` del evento):
```ts
const onRealtimeChange = (e: Event) => {
  const { eventType, new: rec } = (e as CustomEvent).detail || {};
  if (eventType === 'UPDATE' && rec?.id) {
    setProducts(prev => {
      const next = prev.map(p => p.id === rec.id
        ? { ...p, stock: rec.stock, price: rec.price, name: rec.name,
            image: rec.image_url || p.image, is_favorite: rec.is_favorite ?? p.is_favorite,
            nicknames: rec.nicknames ?? p.nicknames }
        : p);
      saveAdminProducts(next).catch(() => {}); // Req 6: mantener fresca la caché offline
      return next;
    });
    // Req 4: si el producto es insumo, recalcular producible de los 'processed' que lo usan
    //        (o dejar que se recalcule en la próxima carga completa).
  } else {
    // INSERT / DELETE (o evento sin detalle) → recargar (poco frecuente)
    debounce → fetchProducts();
  }
};
```

- La Actualizacion_Puntual no recalcula recetas por defecto (Req 4 lo permite "o en la próxima carga"). Si se requiere exactitud inmediata del Producible al cambiar el stock de un insumo, se recomputa solo para los `processed` cuya receta incluya `rec.id` (usando el mapa de stock en memoria), evitando un refetch.
- **Persistencia offline (Req 6):** tras la Actualizacion_Puntual se guarda el catálogo en IndexedDB (`saveAdminProducts`), igual que hacía `fetchProducts`, para que la caché offline no quede desactualizada ante cambios remotos.

### 3. (Opcional / pendiente) Dedup del fetch inicial

Al cargar el POS aún corren una vez `App.fetchProducts` y `useProducts.fetchProducts`. Unificar ese **fetch inicial** (compartir una sola fuente/caché) es un refactor mayor y queda fuera de este spec (se documenta como pendiente en `consumo_egress.md`). Este spec ataca el costo **recurrente** (por venta/cambio), que es el dominante.

## Data Models

Sin cambios de esquema. El relay ya transporta `detail: { eventType, new, old }`; se aprovecha ese `new` para la Actualizacion_Puntual.

## Error Handling

| Situación | Comportamiento |
|-----------|----------------|
| Relay sin `detail` (compatibilidad) | Tratarlo como cambio genérico → `fetchProducts` (debounced) |
| UPDATE de un producto que no está en memoria | El `map` no lo encuentra → no pasa nada; entra al catálogo en la próxima carga/alta |
| INSERT/DELETE | `fetchProducts` completo (correcto, poco frecuente) |
| Stock de insumo cambia y no se recomputa producible | Queda levemente desactualizado hasta la próxima carga (aceptado por Req 4) o se recomputa puntual |

## Testing Strategy

Con los logs `🔎[FETCH]` ya presentes:

1. **Venta en el POS (Req 1, 2):** cobrar una venta → en el **mismo** dispositivo NO debe aparecer `🔎[FETCH][productos-admin]` (ni `[productos-POS]`); el stock del grid baja igual (optimista de App).
2. **Sincronización remota (Req 3):** dispositivo B con `ProductsScreen` abierta; en A se vende/edita un producto → en B el stock/precio se actualiza **sin** `🔎[FETCH][productos-admin]` (fue update puntual).
3. **Alta/baja (Req 3.2):** crear/eliminar un producto en A → en B sí aparece `🔎[FETCH][productos-admin]` (refetch correcto).
4. **Producible (Req 4):** cambiar stock de un insumo → el producible se mantiene correcto (recompute) o se corrige al recargar.
5. **No-regresión (Req 5):** catálogo, categorías y modo offline OK.
6. **Build:** `npm run build` sin errores.
7. **Egress (objetivo):** en Database Egress / Query Performance, la consulta de `products` debe caer fuerte en frecuencia (ya no corre por cada venta).

## Correctness Properties

### Property 1: Sin refetch en UPDATE
Un Relay_Productos con `eventType = UPDATE` no provoca un Refetch_Completo; solo una Actualizacion_Puntual.
**Validates: Requirements 1.1, 1.3**

### Property 2: Refetch solo en alta/baja
El Refetch_Completo del Hook_Productos ocurre únicamente ante INSERT/DELETE (o relay sin detalle).
**Validates: Requirements 1.2, 3.2**

### Property 3: El emisor no se auto-refresca
Mientras el Guard_Local está activo, el dispositivo que originó el cambio no emite el relay hacia sí mismo.
**Validates: Requirements 2.1, 2.2**

### Property 4: Paridad de datos visibles
Tras la optimización, el catálogo y las pantallas de admin muestran el mismo stock/precio que antes ante cambios remotos.
**Validates: Requirements 3.1, 5.1, 5.2**

### Property 5: Caché offline consistente
Tras una Actualizacion_Puntual, la caché de IndexedDB (`saveAdminProducts`) queda igual al estado en memoria, sin requerir un Refetch_Completo.
**Validates: Requirements 6.1, 6.2**
