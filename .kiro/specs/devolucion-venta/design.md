# Design Document

## Overview

La "Devolución de Venta" permite que un usuario con permiso `pos_refund`, con un turno abierto y con conexión a internet, registre la devolución (total o parcial) de una venta previa. La devolución es una **transacción nueva** en el turno actual: NO modifica la venta original ni su turno. Opcionalmente reingresa al inventario los ítems retail (`simple`) devueltos, exige motivo y queda totalmente auditada.

El diseño reutiliza la infraestructura existente:
- Movimientos de caja (`cash_movements` tipo `refund`) ya restan del efectivo esperado del turno actual (memo `balances` en `useCashRegister`) y ya alimentan la línea "Devoluciones" del reporte de cierre (`lib/shiftReport.ts`).
- El patrón de RPC `SECURITY DEFINER` con `current_user_has_permission(...)` ya usado por anulaciones.
- El patrón de modales y `viewMode` de `CashRegisterScreen`.

Se agregan dos tablas dedicadas para trazabilidad y control de cantidades acumuladas, una RPC transaccional, un permiso nuevo y la UI del flujo.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ CAJA (CashRegisterScreen)                                     │
│  Quick Action "Devolución" ──► RefundSaleModal (nuevo)        │
│   1. Buscar venta (online)                                    │
│   2. Elegir ítems + cantidades + reingreso a inventario       │
│   3. Método + motivo                                          │
│   4. Confirmar ──► useRefunds.processSaleRefund(...)          │
└───────────────────────────────┬─────────────────────────────┘
                                 │ supabase.rpc('process_sale_refund')
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│ RPC process_sale_refund (SECURITY DEFINER)                    │
│  • valida pos_refund (current_user_has_permission)            │
│  • valida turno abierto del usuario                           │
│  • valida cantidades (vendido - ya devuelto)                  │
│  • inserta sale_refunds + sale_refund_items                   │
│  • reingresa stock (solo simple + restock=true)               │
│  • inserta cash_movements 'refund' en el turno actual         │
└───────────────────────────────┬─────────────────────────────┘
                                 ▼
        sale_refunds / sale_refund_items / cash_movements / products
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│ VISIBILIDAD                                                   │
│  • SalesScreen: indicador "con devolución" + detalle          │
│  • Reporte de cierre: línea "Devoluciones" (ya existe)        │
│  • Historial de turno: lista de devoluciones del turno        │
└─────────────────────────────────────────────────────────────┘
```

**Online-only:** todo el flujo se bloquea si `!navigator.onLine` (no se encola, a diferencia del `addRefund` genérico). Requirement 9.

## Components and Interfaces

### 1. Base de datos (migraciones Supabase)

**1.1 Permiso `pos_refund`**
- No requiere columna nueva (los permisos viven en `roles.permissions` jsonb y `profiles.custom_permissions`).
- Migración de datos: `UPDATE roles SET permissions = permissions || '{"pos_refund": true}' WHERE name = 'Administrador'` (los administradores lo reciben por defecto; los demás roles quedan en `false`/ausente y el dueño lo concede).
- Nota: `current_user_has_permission('pos_refund')` ya retorna `true` para rol `Administrador` (cubre servidor aunque el rol no lo tenga sembrado).

**1.2 Tabla `sale_refunds`** (cabecera de devolución)
- `id uuid pk default gen_random_uuid()`
- `business_id uuid not null` → businesses(id)
- `order_id uuid not null` → orders(id)  (venta original)
- `shift_id uuid` → cash_shifts(id)  (turno actual donde se registró)
- `refunded_by uuid` → profiles(id)
- `refund_method text not null default 'cash'`
- `total_amount numeric not null default 0`
- `reason text not null`
- `created_at timestamptz default now()`
- RLS: SELECT/INSERT donde `business_id = get_user_business_id()`.

**1.3 Tabla `sale_refund_items`** (líneas devueltas)
- `id uuid pk default gen_random_uuid()`
- `refund_id uuid not null` → sale_refunds(id) ON DELETE CASCADE
- `order_item_id uuid not null` → order_items(id)
- `product_id uuid` → products(id)
- `product_name text not null`
- `quantity numeric not null`
- `unit_price numeric not null`
- `amount numeric not null`
- `restocked boolean not null default false`
- RLS: vía pertenencia al `refund` del negocio.

**1.4 Ampliar check de `cash_movements.reference_type`**
- Actual: `ARRAY['order','expense', NULL]`.
- Nuevo: agregar `'sale_refund'`. El movimiento `refund` de una devolución de venta usará `reference_id = sale_refunds.id` y `reference_type = 'sale_refund'`.
- Esto lo mantiene distinto de los movimientos de venta (`reference_type='order'`), evitando que una anulación (que borra `WHERE reference_type='order'`) toque devoluciones.

**1.5 RPC `process_sale_refund(p_order_id uuid, p_items jsonb, p_method text, p_reason text)`**
- `SECURITY DEFINER`, `SET search_path = public`. Retorna `json`.
- `p_items`: arreglo de `{ "order_item_id": uuid, "quantity": numeric, "restock": boolean }`.
- Lógica:
  1. Si `NOT current_user_has_permission('pos_refund')` → `{success:false, message:'No tienes permiso para hacer devoluciones'}`.
  2. Si `p_reason` vacío → error de motivo obligatorio.
  3. Cargar la venta (`orders`), validar `business_id = get_user_business_id()` y `status = 'completed'` (no `voided`).
  4. Resolver el **turno abierto del usuario**: `SELECT id ... FROM cash_shifts WHERE opened_by = auth.uid() AND status='open' ORDER BY opened_at DESC LIMIT 1`. Si no hay → `{success:false, message:'Debes tener un turno abierto para registrar una devolución'}`.
  5. Por cada ítem de `p_items`:
     - Cargar `order_items` (validar que pertenece a `p_order_id`).
     - `ya_devuelto = COALESCE(SUM(sri.quantity),0)` desde `sale_refund_items` de devoluciones de esa venta para ese `order_item_id`.
     - Validar `0 < quantity <= (vendido - ya_devuelto)`; si excede → error.
     - `amount = round((oi.total_price / oi.quantity) * quantity)` (refleja lo realmente cobrado por unidad, incluyendo descuentos de línea).
     - Si `restock = true` Y `producto.type = 'simple'` → `UPDATE products SET stock = COALESCE(stock,0) + quantity`.
     - Insertar `sale_refund_items`.
     - Acumular `v_total`.
  6. Si `v_total <= 0` → error (no hay nada que devolver).
  7. Insertar `sale_refunds` (cabecera) con `v_total`.
  8. Insertar `cash_movements`: `{ shift_id: turno_actual, created_by: auth.uid(), type:'refund', amount:v_total, description:'Devolución venta #<order>', payment_method:p_method, reference_id: refund.id, reference_type:'sale_refund' }`.
  9. Retornar `{success:true, refund_id, total: v_total}`.
- Todo en una transacción (la función plpgsql es atómica; si algo falla, `EXCEPTION WHEN OTHERS` retorna `{success:false, message}` y revierte).

### 2. Permisos (frontend)

**2.1 `EmployeesScreen.tsx`** — agregar al grupo "Punto de Venta" de `PERMISSION_GROUPS`:
```ts
{ id: 'pos_refund', label: 'Devoluciones', desc: 'Puede registrar devoluciones de ventas anteriores' }
```
(Se renderiza automáticamente en los 4 lugares que mapean `PERMISSION_GROUPS`. No hereda de `pos_view`.)

**2.2 `usePermissions.ts`** — sin cambios estructurales; se consulta con `hasPermission('pos_refund')`. (Opcional: helper `canRefund()` para legibilidad; no imprescindible.)

### 3. Hook de datos

**3.1 `hooks/useRefunds.ts`** (nuevo) o métodos añadidos a `useSales`:
- `processSaleRefund(orderId, items, method, reason): Promise<{success, total?, message?}>`
  - Guard: `if (!navigator.onLine) return { success:false, message:'Las devoluciones requieren conexión a internet' }`.
  - Llama `supabase.rpc('process_sale_refund', {...})`.
  - Tras éxito: dispara `cash-movement-changed` (para refrescar caja) y `sale-deleted`/evento de refresco de ventas.
- `fetchRefundsForOrder(orderId)` o se resuelve embebido en `useSales.fetchOrders` (ver 4.2).

### 4. UI

**4.1 `components/modals/RefundSaleModal.tsx`** (nuevo) — abierto desde Caja.
- Props: `{ isOpen, onClose, onDone }`.
- Estados/pasos (un solo modal con secciones condicionales):
  - **Paso 1 — Buscar venta:** input de búsqueda; consulta `orders` por `order_number`/`display_number`/`customer_name` del negocio, `status='completed'`, con sus `items`. Lista de resultados.
  - **Paso 2 — Armar devolución:** muestra ítems de la venta; por ítem: cantidad a devolver (stepper 0..pendiente, donde `pendiente = vendido - ya_devuelto`), y casilla "Reingresar al inventario" (solo visible si `producto.type='simple'`, default ON). Total a devolver en vivo.
  - **Paso 3 — Método + motivo:** selector de método (efectivo/otros, según `useBusinessPaymentMethods`) y motivos predefinidos (Producto defectuoso, Cliente insatisfecho, Error en la venta, Otro→texto libre).
  - **Confirmar:** botón deshabilitado si total=0, sin motivo, o sin turno abierto. Llama `processSaleRefund`.
- Bloqueo online: si `!navigator.onLine`, el modal muestra aviso y no permite continuar.

#### Lineamientos visuales (obligatorios)

- **Responsivo:**
  - Móvil (`< 640px`): bottom sheet a pantalla completa (o casi), cuerpo con scroll vertical, header y footer fijos. Botones grandes (mínimo 44px de alto) para tap.
  - Escritorio (`≥ 640px`): modal centrado, ancho máximo `max-w-lg`, cuerpo con scroll si excede el alto.
  - Layout en columna (stack vertical); nada de filas apretadas. Pasos claramente separados.
- **Opciones NO inline:** los motivos y métodos se presentan como **filas seleccionables apiladas (estilo lista/radio), de ancho completo**, una por línea — no como chips en una fila horizontal ni opciones amontonadas. Cada fila: label + estado seleccionado claro (check o relleno).
- **Paleta neutra y profesional:** usar `slate` para bordes/textos secundarios y blanco/`slate-50` de fondo. El estado **seleccionado** usa el color de marca sobrio (emerald oscuro `#102218` o un acento neutro), **no amarillo/ámbar**.
- **Amarillo solo si lo amerita:** reservar `amber`/`yellow` exclusivamente para **avisos reales** (ej. banner "Sin conexión", "Sin turno abierto"). El estado normal y el de selección NO usan amarillo.
- **Limpio:** jerarquía clara (título, secciones, total destacado), espaciado consistente, bordes sutiles `border-slate-200`, sombras suaves. El **total a devolver** se resalta con tipografía (tamaño/peso), no con color chillón.
- **Cumplir convenciones del proyecto:** solo Tailwind (sin estilos inline ni `<style>`), no arrays/objetos inline como props, handlers con prefijo `handle`, accesibilidad (`aria-label`, `onKeyDown` en elementos interactivos no nativos, foco visible).

**4.2 `CashRegisterScreen.tsx`**
- El Quick Action existente **"Devolución"** (que hoy abre el modal genérico de monto) pasa a abrir `RefundSaleModal`. El movimiento genérico de "salida de dinero" sigue cubierto por **"Salida"**.
- Gate de visibilidad: el botón "Devolución" solo se muestra si `hasPermission('pos_refund')`.
- Tras una devolución exitosa: refrescar movimientos/turno (`refetch`).

**4.3 `SalesScreen.tsx`** (visibilidad de devoluciones)
- En `useSales.fetchOrders`, ampliar el `select` para embeber devoluciones:
  `refunds:sale_refunds(id, total_amount, reason, created_at, refunded_by, items:sale_refund_items(product_name, quantity, amount, restocked))`.
- En la lista: indicador "🔄 con devolución" cuando `sale.refunds?.length > 0` (similar al indicador de ítems anulados).
- En el detalle: banner/sección "Devoluciones de esta venta" con cada devolución (ítems, cantidades, monto, motivo, fecha). La venta original se muestra intacta.
- Lo impreso (`buildReceiptData`, ticket, recibo público) **no** se toca.

**4.4 Historial de turno (`CashRegisterScreen` detalle)**
- Reutilizar el patrón ya implementado para "Anulaciones del turno": además, listar las **devoluciones** del turno (consulta `sale_refunds` por `shift_id = selectedShift.id`), con monto, motivo y venta referenciada. El total ya se refleja en la tarjeta "Devoluciones" y en la línea del reporte de cierre (sin cambios en lo impreso).

### 4.5 Reflejo en el reporte de cierre — impreso vs frontend

**Regla:** el código del reporte **impreso** (`ShiftReportThermalPDF`, PDF/correo del cierre) **NO se modifica**. La línea "Devoluciones" ya existe ahí y se llena automáticamente con los movimientos `refund` (es dato, no cambio de layout/código).

Mapeo por método (lo calcula `lib/shiftReport.ts`, sin cambios):

| Devolución | Línea en el reporte | ¿Afecta efectivo esperado? |
|---|---|---|
| En efectivo | "Devoluciones" + entra al bucket "Retiro de efectivo" | Sí (reduce el cajón del turno actual) |
| No efectivo (tarjeta/transferencia) | "Devoluciones" (informativa) | No |

**Solo en frontend** (sin tocar impresión) se agrega la sección detallada "Devoluciones del turno" en el detalle de turno (tarea 12): lista de cada devolución con ítems, monto, motivo, venta referenciada y quién. El reporte impreso mantiene únicamente la línea-total "Devoluciones" existente.


## Data Models

```
sale_refunds
├─ id, business_id, order_id, shift_id, refunded_by
├─ refund_method, total_amount, reason, created_at

sale_refund_items
├─ id, refund_id (→ sale_refunds, cascade), order_item_id, product_id
├─ product_name, quantity, unit_price, amount, restocked

cash_movements (existente)
└─ type='refund', reference_type='sale_refund', reference_id=sale_refunds.id
```

Relación clave para control de cantidades:
```
cantidad_pendiente(order_item) =
    order_items.quantity  −  SUM(sale_refund_items.quantity WHERE order_item_id = ...)
```

## Error Handling

- **Sin permiso** (`pos_refund`): RPC retorna error; UI no muestra el botón.
- **Sin conexión:** UI bloquea antes de llamar la RPC ("Las devoluciones requieren conexión a internet").
- **Sin turno abierto:** RPC retorna error claro; UI deshabilita confirmar.
- **Cantidad inválida** (excede lo pendiente o ≤ 0): RPC valida por ítem y retorna error sin escribir nada (atómico).
- **Venta anulada o inexistente:** RPC rechaza.
- **Fallo parcial:** la RPC es transaccional; ante `EXCEPTION` no deja datos a medias.

## Testing Strategy

- **RPC (SQL) manual con datos de prueba en una venta de prueba:**
  - Devolución parcial de 1 ítem retail con restock → verifica `sale_refunds`/`sale_refund_items`, stock incrementado, `cash_movements` en el turno actual.
  - Segunda devolución del mismo ítem que excede lo pendiente → rechazada.
  - Devolución sin turno abierto → rechazada.
  - Usuario sin `pos_refund` → rechazada.
  - Ítem `service`/`processed` con restock → no cambia stock.
- **Frontend:** verificación manual del flujo en Caja (buscar venta, parcial/total, restock on/off, método, motivo), bloqueo offline, indicador "con devolución" en Ventas, y reflejo en arqueo/cierre.
- **No regresión:** anulaciones siguen funcionando; el `addRefund` genérico no se rompe (queda disponible internamente aunque el botón apunte al nuevo flujo); reporte de cierre y `balances` siguen restando los `refund` correctamente.
- Build de producción (`npm run build`) sin errores tras los cambios de frontend.

## Correctness Properties

### Property 1: No sobre-devolución
Para todo `order_item`, `SUM(sale_refund_items.quantity) <= order_items.quantity`. Nunca se devuelve más de lo vendido.
**Validates: Requirements 3.1, 3.2**

### Property 2: Venta original inmutable
Registrar una devolución no modifica `orders` ni `order_items` de la venta original (estado, ítems ni totales).
**Validates: Requirements 6.1**

### Property 3: Aislamiento de turno
El movimiento `refund` se registra solo en el turno abierto del usuario; ningún turno cerrado cambia sus movimientos ni su arqueo por una devolución.
**Validates: Requirements 5.1, 5.2**

### Property 4: Consistencia de stock
El stock aumenta exactamente en `quantity` solo para ítems con `restocked = true` y producto `simple`; para `processed`/`service` el stock no cambia nunca.
**Validates: Requirements 4.3, 4.4**

### Property 5: Cuadre de caja
`total_amount` de `sale_refunds` = suma de `amount` de sus `sale_refund_items` = monto del `cash_movements.refund` asociado.
**Validates: Requirements 3.3, 5.3**

### Property 6: Atomicidad
Una devolución se persiste completa (cabecera + líneas + stock + movimiento) o no se persiste nada.
**Validates: Requirements 5.1**

### Property 7: Autorización
Ninguna devolución se registra sin `pos_refund` efectivo y sin turno abierto, validado en el servidor.
**Validates: Requirements 2.2, 1.5**

### Property 8: Online-only
No existe ruta que registre una devolución sin conexión (no se encola).
**Validates: Requirements 9.1**

## Decisiones de diseño

1. **Tablas dedicadas** (no columnas en orders/order_items): soporta devoluciones múltiples/parciales acumuladas, auditoría por evento y mantiene la venta original inmutable.
2. **`reference_type='sale_refund'`** en `cash_movements`: aísla la devolución de los movimientos de venta para no colisionar con la anulación.
3. **El botón "Devolución" de Caja pasa a la devolución de venta** (con búsqueda de venta). El movimiento genérico de dinero queda en "Salida". (Si se prefiere conservar también la devolución genérica sin venta, se puede mantener como sub-opción; queda como ajuste menor.)
4. **Online-only** por requisito: el flujo necesita consultar ventas antiguas y validar cantidades en servidor; no se encola.
5. **Reutilización** de `cash_movements`/`balances`/`shiftReport`: la devolución impacta el efectivo del turno actual sin lógica nueva de arqueo.

## Mockup ASCII — RefundSaleModal

Escritorio (modal centrado, `max-w-lg`) y móvil (bottom sheet a pantalla completa) comparten la misma estructura en columna:

```
┌───────────────────────────────────────────────┐
│ Devolución de venta                         ✕  │  header fijo
├───────────────────────────────────────────────┤
│ 🔍  Buscar venta (#, cliente)                  │
│ ┌───────────────────────────────────────────┐ │
│ │ #1041 · María Gómez · 12 jun      $12.000 →│ │  filas apiladas
│ │ #1038 · Consumidor   · 11 jun      $8.500 →│ │  (ancho completo)
│ └───────────────────────────────────────────┘ │
├───────────────────────────────────────────────┤  cuerpo scrollable
│ Venta #1041 · María Gómez                      │
│                                                │
│  Coca-Cola            vendido 2                 │
│        [ −   1   + ]      ☑ Reingresar          │
│  ─────────────────────────────────────────     │
│  Pan                  vendido 3                 │
│        [ −   0   + ]      ☑ Reingresar          │
│  ─────────────────────────────────────────     │
│  Lavado (servicio)    vendido 1                 │
│        [ −   0   + ]      (sin reingreso)        │
├───────────────────────────────────────────────┤
│ Método de devolución                            │
│ ┌───────────────────────────────────────────┐ │
│ │ ● Efectivo                                 │ │  opciones apiladas
│ │ ○ Transferencia                            │ │  (radio, no chips)
│ └───────────────────────────────────────────┘ │
│ Motivo *                                        │
│ ┌───────────────────────────────────────────┐ │
│ │ ○ Producto defectuoso                      │ │
│ │ ○ Cliente insatisfecho                     │ │
│ │ ○ Error en la venta                        │ │
│ │ ○ Otro  → [_______________________]        │ │
│ └───────────────────────────────────────────┘ │
├───────────────────────────────────────────────┤  footer fijo
│ Total a devolver         $2.500  (resaltado)   │
│ [ Cancelar ]                 [ Devolver $2.500 ]│
└───────────────────────────────────────────────┘

Aviso (solo si aplica) — banner ámbar arriba del cuerpo:
┌───────────────────────────────────────────────┐
│ ⚠ Sin conexión: las devoluciones requieren     │
│   internet.                                     │
└───────────────────────────────────────────────┘
```

- Selección (venta/método/motivo): borde y fondo sobrios (slate/emerald oscuro), **sin amarillo**.
- Ámbar reservado para el banner de aviso (sin conexión / sin turno abierto).
- En móvil el footer (Total + botones) queda fijo abajo; el cuerpo hace scroll.

