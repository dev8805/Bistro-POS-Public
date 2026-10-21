# Design Document

## Overview

Este diseño implementa la "Opción B" para reducir el consumo de Supabase Realtime en el módulo de mesas, **sin romper** el flujo de ventas ni la coordinación entre dispositivos.

La idea central, en una frase: **dejar de escuchar en vivo los productos de TODAS las mesas (lo caro) y conservar solo el estado ocupada/libre/reservada (lo barato) más el detalle en vivo de la mesa que el usuario tiene abierta.**

El cambio se apoya en algo que ya existe en el código:
- `useTables` ya mantiene el estado de las mesas en realtime (filtrado por `business_id`).
- `App.tsx` ya hace un fetch de la orden al abrir una mesa (`handleTableSelect` → `fetchTableOrder`) y ya tiene la suscripción al detalle de la mesa abierta filtrada por `order_id`.

Por eso el trabajo real es **quitar** una suscripción cara, **simplificar** las píldoras y **agregar** un estado de carga limpio. No se construye nada desde cero.

Mapa de requisitos cubiertos: Req 1 (estado en vivo), Req 2 (eliminar suscripción global), Req 3 (píldoras sin monto), Req 4 (carga al abrir mesa ocupada), Req 5 (detalle en vivo de mesa abierta), Req 6 (no-regresión).

## Architecture

### Antes (estado actual)

```
Cada dispositivo en el POS:

useTables ........... 📡 tables/orders/rooms (filtro business_id)   → estado mesas   [BARATO]
useOpenTickets ...... 📡 order_items SIN filtro + tables            → totales mesas  [CARO ❌]
App.tsx (mesa abierta) 📡 order-items-{mesa} (filtro order_id)      → carrito en vivo [OK]
```

El canal de `useOpenTickets` recibe un mensaje por cada producto agregado/quitado en CUALQUIER mesa, en CADA dispositivo. Ese es el gasto que se elimina.

### Después (Opción B)

```
Cada dispositivo en el POS:

useTables ........... 📡 tables/orders/rooms (filtro business_id)   → estado mesas   [SE CONSERVA]
useOpenTickets ...... ❌ ELIMINADO (ya no se calcula total)
App.tsx (mesa abierta) 📡 order-items-{mesa} (filtro order_id)      → carrito en vivo [SE CONSERVA]
                       + Estado_Carga al abrir mesa ocupada (Req 4)
```

Resultado: se elimina por completo la única suscripción sin filtro a `order_items`. Las píldoras pasan a leer el estado desde `useTables`.

### Decisión clave: eliminar `useOpenTickets`

`useOpenTickets` existe solo para calcular `itemCount` y `total` por mesa, y su único consumidor es `OpenTicketsBar`. Como la Opción B elimina el monto de las píldoras (Req 3) y la suscripción global (Req 2), el hook **queda sin propósito**. En vez de dejarlo vacío, se elimina (regla YAGNI del proyecto) y `OpenTicketsBar` deriva el estado directamente de `useTables`, que ya provee `status` y `current_order_id` por mesa.

## Components and Interfaces

### 1. `hooks/useOpenTickets.ts` — ELIMINAR (Req 2)

- Se borra el archivo completo. Con él desaparece la suscripción a `order_items` sin filtro y el cálculo de totales.
- Justificación: ningún otro componente lo usa salvo `OpenTicketsBar`, que dejará de necesitarlo.

### 2. `components/OpenTicketsBar.tsx` — SIMPLIFICAR (Req 3)

- Quitar el import y el uso de `useOpenTickets` (`const { summary } = useOpenTickets()`).
- Quitar toda referencia a `summary[tableId].total` y `itemCount` en el render de la píldora.
- La píldora pasa a mostrar:
  - La etiqueta de la mesa (ej. "MESA 2") — texto no vacío (Req 3.1).
  - Un indicador visual de estado derivado de `table.status` (Req 3.2, 3.4–3.6).
  - Sin monto (Req 3.3).
- El estado de cada mesa se obtiene de `tables` (de `useTables`, que ya está importado en el componente). Mapeo de estado a estilo (solo Tailwind):

```
available → punto/anillo neutro (gris)   + texto "MESA X"
occupied  → punto/anillo ámbar (activo)  + texto "MESA X"
reserved  → punto/anillo azul/emerald    + texto "MESA X"
desconocido/null → punto tenue indeterminado (Req 3.7)
```

(Los colores exactos se ajustan a la paleta "Warm Bistro" del proyecto en implementación; el diseño solo fija que cada estado tenga un indicador **distinguible**.)

### 3. `hooks/useTables.ts` — SIN CAMBIOS FUNCIONALES (Req 1, Req 6)

- Se conserva tal cual. Es la fuente única del estado de mesas en vivo.
- Ya cumple Req 1: suscripción a `tables` filtrada por `business_id` con reconexión gestionada por Supabase y debounce.
- Nota: hoy `useTables` también escucha `orders` (UPDATE) y `rooms`. Se mantienen porque son baratos y necesarios para el estado y las salas. (No es el foco de esta optimización.)

### 4. `App.tsx` — AGREGAR Estado_Carga al abrir mesa (Req 4)

`handleTableSelect(table)` ya hace `fetchTableOrder(table.id)` y reconstruye el carrito. Se envuelve ese fetch con un estado de carga y manejo de error:

- Nuevo estado local: `const [tableOrderLoading, setTableOrderLoading] = useState(false)` y `const [tableOrderError, setTableOrderError] = useState(false)`.
- Flujo al seleccionar una mesa:

```
handleTableSelect(table):
  setActiveTableId(table.id)
  IF table.status === 'occupied' AND table.current_order_id:
      setTableOrderLoading(true)          // Estado_Carga visible (Req 4.2)
      try:
        order = await fetchTableOrder(table.id)  // con timeout 10s (Req 4.1)
        IF order tiene items   → setCart(...)          (Req 4.3)
        ELSE order vacía       → setCart([]) + aviso "sin productos" (Req 4.4)
      catch (error | timeout | offline):
        setTableOrderError(true)          // mensaje + reintento (Req 4.5)
      finally:
        setTableOrderLoading(false)
  ELSE IF occupied SIN current_order_id (estado fantasma):
        no fetch, aviso "mesa sin orden válida"   (Req 4.6)
  ELSE (mesa libre):
        setCart([])   // arranca orden nueva, sin fetch
```

- Reapertura sin re-fetch (Req 4.7): si `activeTableId` ya es esa mesa y el carrito está cargado, no se vuelve a hacer fetch.
- El fetch con timeout se logra con `Promise.race([fetchTableOrder(id), timeout(10s)])`.

### 5. Componente de carga: `TableOrderLoadingOverlay` (Req 4.2)

Componente nuevo, mínimo y reutilizable, mostrado mientras `tableOrderLoading` es `true`:

```
┌─────────────────────────────┐
│        ◌ (spinner)          │
│   Cargando orden de MESA 2  │
└─────────────────────────────┘
```

- Overlay limpio centrado sobre el área del carrito/orden, con fondo translúcido, que **bloquea la edición** mientras carga (Req 4.2).
- En error, el mismo espacio muestra mensaje + botón "Reintentar" (Req 4.5).
- Solo Tailwind. Accesible: `role="status"`, `aria-live="polite"`, `aria-label="Cargando orden de la mesa"`. El botón de reintento con `aria-label`, `tabIndex={0}` y `onKeyDown`.

## Data Models

No se modifican tablas ni esquemas de Supabase. Se reutilizan las estructuras existentes:

- `Table` (de `useTables`): se usan `id`, `label`, `status`, `current_order_id`.
- La orden y sus ítems se obtienen con `fetchTableOrder(tableId)` (ya existente), que retorna `{ id, items[], client_id, customer_name, ... }`.

No hay migraciones.

## Error Handling

| Situación | Requisito | Comportamiento |
|-----------|-----------|----------------|
| Fetch falla por error de red/respuesta | 4.5 | Ocultar carga, mostrar mensaje "No se pudo cargar la orden" + botón Reintentar, conservar estado `occupied` |
| Fetch supera 10s (timeout) | 4.1, 4.5 | Igual que error, con opción de reintento |
| Mesa `occupied` sin `current_order_id` (fantasma) | 4.6 | Omitir fetch, avisar "la mesa no tiene una orden válida" |
| Orden existe pero sin productos | 4.4 | Mostrar orden vacía con indicación, ocultar carga |
| Suscripción `tables` se cae | 1.6 | Supabase reconecta automáticamente; al volver, `useTables` re-sincroniza estado |
| Canal de detalle de mesa se cae | 5.4 | Reintento acotado, indicador de reconexión, se conserva el último detalle |

## Testing Strategy

Verificación manual con 2 dispositivos (A y B) conectados al mismo negocio:

**Estado en vivo (Req 1, 6):**
1. En A, ocupar MESA 5 → en B la píldora de MESA 5 debe pasar a "ocupada" en ≤2s sin recargar.
2. En A, liberar MESA 5 → en B debe volver a "libre".

**Píldoras sin monto (Req 3):**
3. Confirmar que ninguna píldora muestra `$`; solo etiqueta + indicador de estado.
4. Verificar indicadores distinguibles para occupied/available/reserved.

**Carga al abrir mesa ocupada (Req 4):**
5. En A, armar una orden en MESA 3. En B, abrir MESA 3 → debe verse el Estado_Carga y luego la orden con sus productos.
6. Simular fetch lento/offline en B → debe mostrar error + Reintentar.
7. Abrir una mesa `occupied` sin orden (forzar estado fantasma) → mensaje de orden no válida, sin fetch.

**Detalle en vivo de mesa abierta (Req 5):**
8. Con MESA 3 abierta en B, agregar un producto desde A → debe reflejarse en B en ≤3s.
9. Cerrar la mesa en B → la suscripción al detalle se cancela (verificable en logs/Network).

**Reducción de consumo (objetivo):**
10. En el dashboard de Supabase (Reports → Realtime → Postgres Changes Events), comparar el volumen antes/después al agregar productos en mesas no abiertas: debe caer notablemente, ya que esos cambios ya no generan mensajes a otros dispositivos.

## Accessibility

- Indicador de estado de la píldora: además del color, incluir `aria-label` con el estado en texto (ej. "MESA 2, ocupada") para no depender solo del color.
- Estado_Carga: `role="status"` + `aria-live="polite"`.
- Botón Reintentar: `tabIndex={0}`, `aria-label` descriptivo y `onKeyDown` para activación por teclado.

## Correctness Properties

Invariantes que deben cumplirse siempre tras esta optimización:

### Property 1: Cero suscripciones a order_items global
En cualquier momento, el conjunto de canales realtime activos del Sistema_Mesas NO contiene ninguna suscripción a la tabla `order_items` sin filtro.
**Validates: Requirements 2.1, 2.2**

### Property 2: Estado siempre coordinado
Para toda mesa, el Estado_Mesa visible en cualquier Dispositivo converge al Estado_Mesa persistido en BD en ≤2s tras un cambio, salvo desconexión.
**Validates: Requirements 1.2, 1.3, 1.4**

### Property 3: Una sola suscripción de detalle
Existe a lo sumo un Canal_Detalle_Mesa activo por Dispositivo, correspondiente a la mesa abierta actual; al cerrar la mesa, ese canal se cancela.
**Validates: Requirements 5.1, 5.3**

### Property 4: Píldora sin monto
Ninguna Pildora_Mesa renderiza un valor monetario en ningún estado.
**Validates: Requirements 3.3**

### Property 5: No edición durante carga
Mientras `tableOrderLoading` es verdadero para una mesa, la orden de esa mesa no es editable.
**Validates: Requirements 4.2**

### Property 6: Sin pérdida de datos en error
Si el Fetch_Orden_Mesa falla, la Orden_Activa y el Estado_Mesa `occupied` permanecen sin alteración en BD.
**Validates: Requirements 4.5, 6.4**

### Property 7: Idempotencia de apertura
Abrir una mesa cuya orden ya está cargada en el Dispositivo no dispara un nuevo Fetch_Orden_Mesa.
**Validates: Requirements 4.7**
