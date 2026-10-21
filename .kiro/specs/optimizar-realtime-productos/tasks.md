# Implementation Plan

## Overview

Plan para la "Opción A" del realtime de `products`: dejar a `App.tsx` como único suscriptor, repartir cambios a `useProducts` por un evento de ventana, y gatear la suscripción por permisos (`canViewProducts`). Cambios contenidos en 3 archivos (`usePermissions.ts`, `App.tsx`, `useProducts.ts`) más verificación.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2"] },
    { "wave": 2, "tasks": ["3"] },
    { "wave": 3, "tasks": ["4"] }
  ]
}
```

```
1 (canViewProducts) ──> 3 (gate + relay en App)
2 (useProducts: relay listener, sin canal)  ─┘
                                              └─> 4 (verificación)

- 1 antes de 3 (App usa canViewProducts).
- 2 es independiente de 1; puede ir en paralelo.
- 3 depende de 1; activa el relay que 2 consume.
- 4 (verificación) al final.
```

## Tasks

- [x] 1. Agregar el helper de permisos `canViewProducts()`
  - En `hooks/usePermissions.ts`, agregar `canViewProducts()` = `isSuperAdmin || hasPermission('pos_view') || hasPermission('inv_view') || hasPermission('inv_create')`.
  - Exponerlo en el objeto de retorno del hook.
  - _Requirements: 3.3_

- [x] 2. `useProducts`: quitar el canal propio y escuchar el relay
- [x] 2.1 Eliminar la suscripción `public:products`
  - Borrar el `useEffect` que crea el canal `public:products` en `hooks/useProducts.ts`.
  - _Requirements: 1.2, 1.3_
- [x] 2.2 Escuchar el evento de relay
  - Agregar un `useEffect` que escuche `window 'products-realtime-changed'` y llame a `fetchProducts()` con debounce (~200 ms), con cleanup del listener y del timer.
  - _Requirements: 2.2, 2.3, 4.3_

- [x] 3. `App.tsx`: gatear la suscripción por permisos y emitir el relay
- [x] 3.1 Gate por permisos en el efecto `products-sync`
  - Obtener `canViewProducts` de `usePermissions` y computar un booleano `canProducts`.
  - Early-return del `useEffect` de `products-sync` si `!canProducts` (además del check de `business_id`).
  - Agregar `canProducts` a las dependencias del efecto para suscribir/cancelar al cambiar permisos en vivo.
  - _Requirements: 3.1, 3.2, 3.4_
- [x] 3.2 Emitir el Evento_Relay en el handler de products
  - Tras procesar un cambio (INSERT/UPDATE/DELETE) en `products`, emitir `window.dispatchEvent(new CustomEvent('products-realtime-changed', { detail: { eventType, new, old } }))`.
  - Conservar el guard `isLocalStockUpdateRef` y la actualización optimista del estado de App.
  - Conservar intacta la suscripción a `categories`.
  - _Requirements: 2.1, 4.1, 4.2, 5.1_

- [ ] 4. Verificación y no-regresión
- [x] 4.1 Build y revisión de tipos
  - `npm run build` y resolver cualquier error derivado de los cambios.
  - _Requirements: 6.1_
- [ ] 4.2 Pruebas manuales con 2 dispositivos
  - Confirmar que en el POS solo existe el canal `products-sync` (no `public:products`).
  - Vender/editar precio en A → se refleja en el catálogo del POS y en `ProductsScreen` de B (vía relay).
  - Cambiar etiquetas de categoría en A → se refleja en B; merma/compra local actualiza stock; offline carga catálogo desde caché.
  - Gate: iniciar sesión en B con un usuario solo-Dashboard (sin `pos_view`/`inv_*`) → no existe la suscripción `products-sync`; al darle `pos_view` se suscribe sin recargar.
  - _Requirements: 1.1, 3.1, 3.2, 3.4, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 6.2_
- [ ] 4.3 Medir reducción de consumo en Supabase
  - En Reports → Realtime → Postgres Changes Events, comparar el volumen al vender con varios dispositivos antes/después (debe bajar ~a la mitad para products; 0 en dispositivos sin acceso).
  - _Requirements: 6.1, 6.2_

## Notes

- Riesgo principal: que alguna pantalla que usa `useProducts` dejara de actualizarse al quitar su canal; lo cubre el relay (tarea 2.2) y la verificación 4.2.
- El relay depende de que `App.tsx` esté suscrito; como `App` es global y se gatea solo por permisos de productos, los consumidores de `useProducts` (pantallas de venta/gestión) siempre tendrán un usuario con acceso → el relay estará disponible.
- No hay migraciones ni cambios de esquema. El comportamiento offline del catálogo no se toca.
