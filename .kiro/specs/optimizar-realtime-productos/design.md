# Design Document

## Overview

Este diseño implementa la "Opción A" para el realtime de `products`: **una sola suscripción** (la de `App.tsx`) como fuente única, con un **relay por evento de ventana** para que `useProducts` y sus consumidores se actualicen sin tener su propia suscripción. Además **gatea la suscripción por permisos**: si el usuario no tiene acceso a productos, el dispositivo no se suscribe.

La idea en una frase: **App.tsx es el único que escucha `products` en Supabase; reparte los cambios a `useProducts` por un evento interno; y solo se suscribe si el usuario trabaja con productos.**

Se apoya en código existente:
- `App.tsx` ya tiene el canal `products-sync` (products + categories) con actualización optimista y guard `isLocalStockUpdateRef`.
- `useProducts` ya tiene un `fetchProducts()` (cache-first) y consumidores en venta y gestión.
- `usePermissions` ya expone `hasPermission()` e `isSuperAdmin`.

Mapa de requisitos: Req 1 (suscripción única), Req 2 (relay), Req 3 (gate por permisos), Req 4 (sincronización), Req 5 (no-regresión categorías/eventos/offline), Req 6 (reducción de mensajes).

## Architecture

### Antes

```
Dispositivo en el POS (MenuScreen monta useProducts):
  App.tsx ........ 📡 'products-sync'   (products + categories)  → estado products de App
  useProducts .... 📡 'public:products' (products)               → estado products del hook
  → 1 cambio de producto = 2 mensajes por dispositivo (+ canales repetidos si varios useProducts)
```

### Después (Opción A + gate por permisos)

```
Dispositivo CON Acceso_Productos:
  App.tsx ........ 📡 'products-sync'  (products + categories)   ← ÚNICA suscripción
        │
        └── al recibir cambio en products → window 'products-realtime-changed'
                                                   │
  useProducts ......... 👂 escucha el evento → fetchProducts() (debounced)   (sin canal propio)

Dispositivo SIN Acceso_Productos:
  App.tsx ........ 🔕 no se suscribe (no cuenta como receptor de products)
```

## Components and Interfaces

### 1. `hooks/usePermissions.ts` — agregar `canViewProducts()` (Req 3)

Nuevo helper que centraliza el gate:

```ts
const canViewProducts = (): boolean => {
    if (isSuperAdmin) return true;
    return hasPermission('pos_view') || hasPermission('inv_view') || hasPermission('inv_create');
};
```

Se expone en el retorno del hook. Reutiliza la lógica de `hasPermission` (incluye el fallback por rol cuando aún no cargan permisos: `pos_view` para Cajero/Mesero).

### 2. `App.tsx` — gate + relay (Req 1, 2, 3, 5)

En el `useEffect` de `products-sync`:

- **Gate (Req 3):** computar `const canProducts = canViewProducts();` (de `usePermissions`) y early-return si es `false`. Agregar `canProducts` a las dependencias del efecto para que, al cambiar permisos en vivo, se suscriba o se limpie (el `return` del efecto ya hace `removeChannel`).

```
useEffect(() => {
  if (!profile?.business_id || !canProducts) return;   // gate
  const channel = supabase.channel('products-sync')...
  return () => supabase.removeChannel(channel);
}, [profile?.business_id, canProducts]);
```

- **Relay (Req 2):** dentro del handler de `products`, tras la actualización optimista / fetch, emitir el Evento_Relay para que `useProducts` se entere:

```
window.dispatchEvent(new CustomEvent('products-realtime-changed', {
  detail: { eventType, new: newRecord, old: oldRecord }
}));
```

  Se emite para INSERT/UPDATE/DELETE. El guard `isLocalStockUpdateRef` sigue evitando que App refleje su propio cambio dos veces en su estado; el relay igual puede emitirse (el refetch de `useProducts` es idempotente y va con debounce).

- La suscripción a `categories` se conserva igual (Req 5.1).

### 3. `hooks/useProducts.ts` — quitar suscripción, escuchar relay (Req 1, 2)

- **Eliminar** el `useEffect` que crea el canal `public:products`.
- **Agregar** un `useEffect` que escuche `window 'products-realtime-changed'` y llame a `fetchProducts()` con debounce (~200 ms):

```
useEffect(() => {
  if (!businessId) return;
  let t: ReturnType<typeof setTimeout> | null = null;
  const onChange = () => { if (t) clearTimeout(t); t = setTimeout(() => fetchProducts(), 200); };
  window.addEventListener('products-realtime-changed', onChange);
  return () => { if (t) clearTimeout(t); window.removeEventListener('products-realtime-changed', onChange); };
}, [businessId, fetchProducts]);
```

- Los eventos locales existentes (`sale-completed`, `inventory-updated`, `wastage-stock-updated`, `favorite-toggled`) se conservan tal cual (Req 5.2). El comportamiento offline (cache-first en `fetchProducts`) no cambia (Req 5.3).

## Data Models

No hay cambios de esquema ni migraciones. Se reutilizan `products` y `categories`. El Evento_Relay es un `CustomEvent` del DOM con `detail: { eventType, new, old }` (datos en memoria, no se persisten).

## Error Handling

| Situación | Comportamiento |
|-----------|----------------|
| Permisos aún no cargados | `canViewProducts` usa el fallback de `hasPermission`/rol; si luego cargan permisos, el efecto se re-evalúa por dependencia y ajusta la suscripción |
| `App` pierde y recupera conexión | Supabase reconecta el canal `products-sync` automáticamente; el relay reanuda |
| Llega una ráfaga de Evento_Relay | `useProducts` agrupa con debounce (un solo `fetchProducts`) |
| Usuario sin Acceso_Productos | No se crea la suscripción; `useProducts` (si se monta) no recibe relay, lo cual es correcto |
| `fetchProducts` falla en el relay | Mantiene los productos actuales (mismo manejo de error existente del hook) |

## Testing Strategy

Verificación manual con 2 dispositivos (A y B):

1. **Suscripción única (Req 1, 6):** en B (POS, `MenuScreen`), abrir Network/console y confirmar que solo existe el canal `products-sync` y **no** `public:products`.
2. **Sincronización POS (Req 4):** en A vender un producto (baja stock) → en B el catálogo del POS y la pantalla de Productos reflejan el nuevo stock.
3. **Relay a gestión (Req 4.3):** en B abrir `ProductsScreen`; en A editar precio → B se actualiza vía relay.
4. **Gate por permisos (Req 3, 6):** iniciar sesión en B con un usuario solo-Dashboard (sin `pos_view`/`inv_*`) → confirmar que **no** existe la suscripción `products-sync` en B; cambiar sus permisos para darle `pos_view` → la suscripción aparece sin recargar.
5. **No-regresión (Req 5):** cambiar etiquetas/opciones de una categoría en A → se refleja en B; registrar una merma/compra local → el stock se actualiza por los eventos locales; en modo offline el catálogo sigue cargando desde caché.
6. **Build:** `npm run build` sin errores de tipos.
7. **Consumo (objetivo):** en Reports → Realtime → Postgres Changes Events, comparar el volumen al vender con varios dispositivos antes/después (debe bajar ~a la mitad para products, y a 0 en dispositivos sin acceso).

## Correctness Properties

### Property 1: Suscripción única a products
En cualquier momento, un Dispositivo tiene a lo sumo una suscripción realtime activa a la tabla `products` (la Suscripcion_Productos_App); el Hook_Productos no instancia ninguna.
**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Relay consistente
Todo cambio recibido por la Suscripcion_Productos_App en `products` produce exactamente un Evento_Relay, y todo Evento_Relay provoca (con debounce) un refresco del Hook_Productos.
**Validates: Requirements 2.1, 2.2, 2.3**

### Property 3: Gate por permisos
La Suscripcion_Productos_App existe si y solo si el usuario del Dispositivo cumple Acceso_Productos en ese momento.
**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

### Property 4: Sin pérdida de sincronización con acceso
Mientras el usuario cumple Acceso_Productos, todo cambio remoto de stock/precio/alta/baja de un producto se refleja en el catálogo del POS y en las pantallas de gestión montadas.
**Validates: Requirements 4.1, 4.2, 4.3**

### Property 5: No-regresión de categorías y locales
La sincronización de `categories` y las actualizaciones locales por eventos internos existentes se conservan tras el cambio.
**Validates: Requirements 5.1, 5.2, 5.3**
