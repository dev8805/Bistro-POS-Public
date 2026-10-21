# Documento de Diseño: Detalle de Movimientos de Proveedor

## Overview

Esta funcionalidad mejora la sección "Movimientos" del panel lateral de proveedor en `screens/DebtsScreen.tsx`. Se divide en dos partes con impacto técnico distinto e independiente entre sí:

- **Parte 1 — Detalle en modal (solo UI):** cada `Tarjeta_Movimiento` se vuelve pulsable (ratón y teclado) y, al pulsarla, abre el `Modal_Detalle` que muestra la `Descripcion_Completa` (`business_debts.description`) sin truncar, respetando saltos de línea y sin scroll horizontal. Además, la miniatura de evidencia se renderiza ocupando todo el alto de la fila. No requiere cambios en base de datos.
- **Parte 2 — Atribución de empleado (requiere migración):** se agrega la columna `created_by uuid` a `business_debts`, se puebla en todos los `Punto_Insercion` (online y offline), se trae vía join en vivo a `profiles(full_name)` en el fetch de `useDebts`, y se muestra el `Nombre_Empleado` dentro del `Modal_Detalle`.

Principio de diseño clave: **la Parte 1 no depende de la Parte 2**. Mientras `created_by_name` no exista (columna aún sin migrar o movimiento con `created_by` NULL), el `Modal_Detalle` simplemente muestra el `Texto_Sin_Empleado` ("Empleado no registrado"). Esto permite implementar, probar y desplegar la Parte 1 de forma aislada.

El patrón de atribución replica exactamente el del historial de ventas (`useSalesHistory`): columna `uuid` + join en vivo a `profiles`, sin copiar el nombre. Así el nombre se conserva tras el soft-delete de empleados y refleja renombrados de forma retroactiva (comportamiento esperado, consistente con ventas).

## Architecture

La feature toca tres capas: base de datos (migración), capa de datos/hooks (inserción y lectura) y capa de UI (`DebtsScreen`). El flujo completo de la Parte 2 es:

```
  CREACIÓN DEL MOVIMIENTO (online u offline)
  ┌──────────────────────────────────────────────────────────────┐
  │  useDebts.createDebt            → created_by: userId           │
  │  useDebts.addCreditorPayment    → created_by: userId (online)  │
  │       └─ offline: fakePaymentRecord created_by + created_by_name│
  │  useInventory.updateProductStock/updateMultipleStocks          │
  │                                 → created_by: profile.id       │
  │  useOfflineSync (sync compra/abono)                            │
  │                                 → created_by: tx.userId        │
  │  ExpenseRegister → llama createDebt (cubierto, sin cambios)    │
  └───────────────────────────┬──────────────────────────────────┘
                              │  INSERT
                              ▼
                    ┌───────────────────────┐
                    │  business_debts        │
                    │  created_by (uuid,NULL)│  FK → profiles(id)
                    │  ON DELETE SET NULL    │  business_debts_created_by_fkey
                    └───────────┬───────────┘
                                │  fetchDebts: SELECT con embed
                                │  *, created_by_profile:
                                │     profiles!business_debts_created_by_fkey(full_name)
                                ▼
                    ┌───────────────────────────────────┐
                    │  transform (aplana el embed)       │
                    │  created_by_name =                 │
                    │    row.created_by_profile?.full_name ?? null
                    │  (se elimina el objeto anidado)    │
                    │  → se guarda en cache localStorage  │
                    └───────────────┬───────────────────┘
                                    │  BusinessDebt.created_by_name
                                    ▼
                    ┌───────────────────────────────────┐
                    │  DebtsScreen — Modal_Detalle       │
                    │  badge tipo + monto, fecha completa │
                    │  description completa (pre-wrap)    │
                    │    + "Registrado por: {nombre}"    │
                    │      o "Empleado no registrado"    │
                    └───────────────────────────────────┘
```

Flujo de interacción de UI (Parte 1), independiente del anterior:

```
  click / Enter / Espacio sobre la fila
        │  (botones internos → e.stopPropagation())
        ▼
  setDetailMovement(debt)  →  detailMovement: BusinessDebt | null
        │
        ▼
  render del Modal_Detalle (role="dialog", aria-modal)
        │
        └─ Cerrar / overlay / Escape → setDetailMovement(null)
```

### Componentes del ecosistema afectados

- **Base de datos (Supabase):** nueva columna + índice + FK nombrada en `business_debts`.
- **`hooks/useDebts.ts`:** tipo `BusinessDebt`, `fetchDebts` (embed + transform + cache), `createDebt`, `addCreditorPayment`.
- **`hooks/useInventory.ts`:** dos inserts directos a `business_debts` (ajustes de inventario "sobrante").
- **`hooks/useOfflineSync.ts`:** inserts directos a `business_debts` al sincronizar compra offline y abono offline.
- **`components/expense/ExpenseRegister.tsx`:** sin cambios; queda cubierto porque delega en `createDebt`.
- **`screens/DebtsScreen.tsx`:** lista de movimientos del proveedor (apertura del Modal_Detalle, accesibilidad, miniatura de evidencia a alto completo y contenido del modal).

## Components and Interfaces

### Capa de datos — `hooks/useDebts.ts`

**Tipo `BusinessDebt`.** Ya declara `created_by?: string`. Se añade el nombre resuelto:

```typescript
export interface BusinessDebt {
  // ...campos existentes...
  created_by?: string;             // uuid del empleado (ya existía en el tipo)
  created_by_name?: string | null; // nombre resuelto por el join, aplanado tras el fetch
}
```

**`fetchDebts`.** Se cambia `.select('*')` por un select con embed sobre la FK nombrada, y se aplana el resultado (patrón idéntico a `transformOrder` en `useSalesHistory`, que aplana `waiter.full_name → waiter_name`):

```typescript
.select('*, created_by_profile:profiles!business_debts_created_by_fkey(full_name)')
// transform por fila:
const { created_by_profile, ...rest } = row;
return { ...rest, created_by_name: created_by_profile?.full_name ?? null };
```

El array ya transformado (con `created_by_name`, sin el objeto anidado) es lo que se envía a `setState` y lo que se persiste en el cache `bistro_debts_cache_{businessId}`. El orden y el resto de campos no cambian.

**`createDebt`.** Se agrega `created_by: userId` al objeto insertado (`userId = profile?.id`). Esto cubre también los gastos de `ExpenseRegister`, que registran "Gasto de contado/crédito" llamando a `createDebt` (no insertan directo).

**`addCreditorPayment`.**
- Rama **online:** el insert del registro de abono (`total_amount: 0`) incluye `created_by: userId`.
- Rama **offline:** el `fakePaymentRecord` agregado al estado local incluye `created_by: userId` y `created_by_name: profile?.full_name`, para que el abono offline muestre de inmediato el nombre del propio usuario sin esperar el sync. La transacción se encola con `offlineQueue.add('supplier_payment', ...)`, que ya lleva `userId` a nivel de transacción (no cambia el payload).

### Capa de datos — `hooks/useInventory.ts`

Dos inserts directos a `business_debts` ("Ajuste de inventario (sobrante)", `creditor_name` 'Ajuste de inventario'), uno en `updateProductStock` y otro en `updateMultipleStocks`. Ambos añaden `created_by: profile.id`.

### Capa de datos — `hooks/useOfflineSync.ts`

Los inserts directos a `business_debts` al sincronizar la compra offline (~línea 714) y el abono offline (~línea 927) añaden `created_by: tx.userId`. `offlineQueue.OfflineTransaction` ya guarda `userId` a nivel de transacción, por lo que no hay que modificar el payload encolado. Resultado: un movimiento creado offline queda con la misma atribución que uno online.

### Capa de UI — `screens/DebtsScreen.tsx`

La lista está alrededor de la línea 1448: `selectedCreditor.debts.filter(...).sort(...).map(debt => { ... })`. Cada movimiento es un `<div>` con badge, monto, descripción (en la fila sigue en `truncate`), fecha y botones (ver/adjuntar evidencia → `setViewerDebt`, editar → `handleOpenEditPurchase`, eliminar → `handleDeletePayment`/`handleDeletePurchase`).

**Estado:**

```typescript
const [detailMovement, setDetailMovement] = useState<BusinessDebt | null>(null);
```

Se guarda un único `BusinessDebt` (o `null`): el `Modal_Detalle` muestra un solo Movimiento a la vez (Req 1.7). Abrir el detalle es `setDetailMovement(debt)`; cerrarlo es `setDetailMovement(null)`.

**Fila pulsable (accesibilidad, Req 2):**
- `role="button"`, `tabIndex={0}`, `aria-haspopup="dialog"`, `aria-label` descriptivo (p. ej. "Ver detalle del movimiento").
- `onClick={() => setDetailMovement(debt)}`.
- `onKeyDown` que abre el modal con Enter y Espacio (llamando a `setDetailMovement(debt)` y `preventDefault` en Espacio para no hacer scroll).

**Botones internos (Req 1.4):** cada `onClick` de evidencia/editar/eliminar debe llamar `e.stopPropagation()` (envolviendo el handler existente) para no abrir el `Modal_Detalle`.

**Miniatura de evidencia a alto completo (Req 1.8):** cuando el Movimiento tiene evidencia, la miniatura se renderiza en una columna a la derecha de la fila ocupando todo el alto (`self-stretch`, imagen `object-cover`), en lugar de un ícono pequeño. Su `onClick` llama `e.stopPropagation()` y abre el visor de evidencia (`EvidenceViewer` vía `setViewerDebt`) sin abrir el `Modal_Detalle`.

**Modal_Detalle (Req 1.1–1.3, 1.5):** modal accesible con `role="dialog"`, `aria-modal="true"`, cierre con botón Cerrar, clic en overlay y tecla Escape. Muestra:
- Badge del tipo del Movimiento junto con el monto.
- Fecha completa.
- La `Descripcion_Completa` con `whitespace-pre-wrap break-words` (respeta saltos de línea, sin recorte horizontal — Req 1.3, 7.3), o "Sin descripción" si `description` está vacío/null (Req 1.5).
- La línea de empleado (Parte 2, ver abajo).

**Bloque de empleado (Parte 2):** dentro del mismo `Modal_Detalle`, una línea "Registrado por: {created_by_name}" o "Empleado no registrado" si `created_by_name` es null/ausente (Req 6). Como la Parte 1 no depende de la Parte 2, mientras no exista `created_by_name` el modal muestra siempre el `Texto_Sin_Empleado`.

**Indicador visual (Req 1.6):** ícono `chevron_right` en la fila que señala que abre el `Modal_Detalle`, con Tailwind (paleta Warm Bistro: `amber-400` primary). Sin CSS plano ni `<style>`.

**Paridad móvil/tablet (Req 7):** el panel es el mismo componente responsive; la interacción y el render del `Modal_Detalle` son idénticos en móvil/tablet.

## Data Models

### Migración de base de datos

```sql
ALTER TABLE business_debts
  ADD COLUMN created_by uuid
    CONSTRAINT business_debts_created_by_fkey
    REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_business_debts_created_by
  ON business_debts(created_by);
```

Notas:
- La FK se nombra explícitamente `business_debts_created_by_fkey` para poder usarla en el embed de PostgREST (`profiles!business_debts_created_by_fkey`).
- `ON DELETE SET NULL` es una red de seguridad ante un borrado físico. En la práctica los empleados se borran con soft-delete (`profiles.is_deleted = true` vía edge function `delete-employee`), por lo que la fila de `profiles` nunca desaparece y el join en vivo conserva el nombre (igual que el historial de ventas).
- La columna admite NULL: los movimientos históricos quedan con `created_by` NULL y no se retro-pueblan (Req 3.6).
- Post-migración: correr `get_advisors` (security + performance), sincronizar con `supabase migration fetch` y regenerar tipos.

### Estado actual verificado de `business_debts`

Columnas: `id`, `business_id`, `type`, `creditor_name`, `description`, `total_amount`, `paid_amount`, `status`, `due_date`, `created_at`, `updated_at`, `supplier_id`, `inventory_lot_id`, `evidence_url`. **No existe `created_by`** en la BD (sí en el tipo TS).

FKs existentes: `business_debts_business_id_fkey` (→ businesses, ON DELETE CASCADE), `business_debts_inventory_lot_id_fkey` (→ inventory_lots, ON DELETE SET NULL), `business_debts_supplier_id_fkey` (→ suppliers, ON DELETE SET NULL).

### Modelo en memoria (UI)

```typescript
interface BusinessDebt {
  id: string;
  business_id: string;
  type: string;
  creditor_name: string;
  description: string | null;
  total_amount: number;
  paid_amount: number;
  status: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  supplier_id?: string | null;
  inventory_lot_id?: string | null;
  evidence_url?: string | null;
  created_by?: string;             // uuid (Parte 2)
  created_by_name?: string | null; // resuelto por el join (Parte 2)
}
```

### Nota sobre RLS (no se modifica en este spec)

La política de INSERT valida solo `business_id IN (perfiles del auth.uid())` en el `with_check`, por lo que **no bloquea** setear `created_by`. SELECT/UPDATE/DELETE validan `business_id`. El nombre del empleado se resuelve vía `profiles(full_name)`; el RLS de `profiles` ya permite leer perfiles del mismo negocio (lo usan `useSalesHistory` y `useCashRegister`).

**NOTA (inconsistencia pre-existente, NO se corrige aquí):** existen políticas RLS **duplicadas** en `business_debts` (dos juegos equivalentes por operación: "...their business debts" y "...debts of their business"). Esta feature no las toca; se documenta para futura limpieza.

## Error Handling

- **Migración idempotente:** `CREATE INDEX IF NOT EXISTS` evita error si el índice ya existe. Si la FK/columna ya existiera, no re-crearla (revisar antes con la verificación de esquema).
- **Join tolerante a NULL:** el embed no rompe el fetch si `created_by` es NULL o el perfil no existe; devuelve `created_by_name = null` y la UI aplica el `Texto_Sin_Empleado`.
- **Inserción nunca bloqueada por atribución:** el RLS no valida `created_by`. Si `userId`/`profile.id` fuese `undefined` (sesión anómala), se inserta `created_by: null` (degradación elegante), sin abortar el insert.
- **Descripción vacía:** `description` vacío/null se renderiza como "Sin descripción" en el `Modal_Detalle` (Req 1.5).
- **stopPropagation defensivo:** los botones de acción y la miniatura de evidencia detienen la propagación para no abrir el `Modal_Detalle`; si se agrega un botón nuevo dentro de la fila, debe seguir el mismo patrón.
- **Cache offline:** el cache `bistro_debts_cache_{businessId}` guarda el array ya transformado (con `created_by_name`), de modo que el panel offline muestra el nombre conocido; los movimientos creados offline muestran el nombre del propio usuario (`created_by_name = profile.full_name` en el `fakePaymentRecord`).

## Correctness Properties

*Una propiedad es una característica o comportamiento que debe cumplirse en todas las ejecuciones válidas del sistema; es una afirmación formal de lo que el sistema debe hacer. Las propiedades sirven de puente entre la especificación legible por humanos y las garantías de correctitud verificables por máquina.*

### Property 1: El Modal_Detalle muestra un único movimiento y abre/cierra de forma consistente

*Para cualquier* lista de movimientos y cualquier movimiento seleccionado, `setDetailMovement(debt)` deja `detailMovement` igual a ese movimiento (un solo movimiento a la vez), y `setDetailMovement(null)` (Cerrar, overlay o Escape) lo deja en `null`; abrir un movimiento distinto reemplaza al anterior sin conservar dos detalles simultáneos.

**Validates: Requirements 1.1, 1.2, 1.7**

### Property 2: Los botones de acción y la evidencia no abren el Modal_Detalle

*Para cualquier* movimiento y cualquiera de sus controles internos (evidencia, editar, eliminar), al activarse el control `detailMovement` permanece igual (no se abre el `Modal_Detalle`) y se ejecuta solo la acción del control (no-regresión de `stopPropagation`).

**Validates: Requirements 1.4, 1.8**

### Property 3: Teclado y ratón abren el Modal_Detalle de forma equivalente y la semántica ARIA es correcta

*Para cualquier* movimiento, disparar Enter o Espacio con la fila enfocada abre el mismo `Modal_Detalle` que un clic; la fila expone `aria-haspopup="dialog"` y el `Modal_Detalle`, al estar abierto, expone `role="dialog"` con `aria-modal="true"` y se cierra con Escape.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

### Property 4: Todo movimiento insertado registra al empleado autenticado (online u offline)

*Para cualquier* movimiento creado a través de un `Punto_Insercion` (`createDebt`, `addCreditorPayment` online, ajustes de `useInventory`, o sincronización de compra/abono en `useOfflineSync`) con un identificador de empleado definido, la fila insertada en `business_debts` lleva `created_by` igual a ese identificador; y el valor asignado por el camino offline+sync es el mismo que se habría asignado en el camino online para el mismo empleado.

**Validates: Requirements 3.2, 3.3, 3.4, 3.5, 4.3, 4.4**

### Property 5: La transacción offline transporta el identificador del empleado

*Para cualquier* abono o compra registrada sin conexión, la transacción encolada en la `Cola_Offline` contiene el identificador del empleado autenticado (`tx.userId = profile.id`).

**Validates: Requirements 4.1, 4.2**

### Property 6: El fetch resuelve el nombre vigente del empleado y preserva el resto

*Para cualquier* lista de movimientos devuelta por `fetchDebts`, cada movimiento con un perfil referenciado (incluidos empleados con soft-delete `is_deleted = true`) obtiene `created_by_name` igual al `full_name` actual de ese perfil, reflejando renombrados de forma retroactiva; el orden de los movimientos y todos los demás campos permanecen sin alteración respecto al fetch actual.

**Validates: Requirements 5.1, 5.2, 5.4, 5.5, 5.6**

### Property 7: Ausencia de empleado degrada al texto por defecto

*Para cualquier* movimiento con `created_by` NULL o cuyo perfil no resuelve nombre, `created_by_name` es ausente/null y, al abrir el `Modal_Detalle`, el modal muestra el `Texto_Sin_Empleado` ("Empleado no registrado"); esta condición también describe el caso en que la Parte 2 aún no está implementada, garantizando que la Parte 1 funciona de forma independiente.

**Validates: Requirements 5.3, 6.2**

### Property 8: El Modal_Detalle muestra descripción y empleado juntos

*Para cualquier* movimiento abierto en el `Modal_Detalle`, el modal muestra la `Descripcion_Completa` sin truncar (o "Sin descripción" si está vacía) y, en el mismo modal, el `Nombre_Empleado` resuelto o el `Texto_Sin_Empleado`.

**Validates: Requirements 1.3, 1.5, 6.1, 6.3**

## Testing Strategy

Enfoque dual: pruebas unitarias/ejemplo para casos concretos, esquema, render y accesibilidad; y pruebas de propiedad (property-based) para las propiedades universales anteriores. Las pruebas de propiedad usan una librería del ecosistema (p. ej. `fast-check` sobre Vitest, sin implementar PBT desde cero) con mínimo **100 iteraciones**, y cada test se etiqueta con `Feature: detalle-movimientos-proveedor, Property {n}: {texto}`.

### Pruebas de la migración (SMOKE)
- Verificar tras aplicar la migración que `business_debts` tiene la columna `created_by uuid`, nullable, con FK `business_debts_created_by_fkey` → `profiles(id)` y regla `ON DELETE SET NULL`, y que existe el índice `idx_business_debts_created_by`. (Req 3.1)
- Confirmar que la migración no ejecuta ningún `UPDATE` de retro-poblado desde `expenses`. (Req 3.6)

### Pruebas de fetch / transform (`useDebts.fetchDebts`)
- **Property 6** (property-based): generar filas con embed `created_by_profile`, perfiles con y sin `is_deleted`, y verificar aplanado a `created_by_name`, preservación de orden y campos, y reflejo de renombrados.
- **Property 7** (edge case): filas con `created_by` null / embed null → `created_by_name = null`.
- Ejemplo: verificar que el `select` incluye el embed `created_by_profile:profiles!business_debts_created_by_fkey(full_name)` y que el cache guarda el array transformado. (Req 5.1)

### Pruebas de los puntos de inserción
- **Property 4** (property-based, con Supabase mockeado): `createDebt`, `addCreditorPayment` (online), ambos inserts de `useInventory`, y los inserts de sincronización de `useOfflineSync` asignan `created_by` al empleado; paridad online vs offline+sync.
- **Property 5** (property-based): encolado offline de abono/compra lleva `tx.userId`.
- Integración (1-2 ejemplos): `ExpenseRegister` registra un gasto y el movimiento resultante queda con `created_by` (vía `createDebt`). (Req 3.5)
- Ejemplo: `addCreditorPayment` offline crea `fakePaymentRecord` con `created_by` y `created_by_name = profile.full_name`.

### Pruebas de UI (Modal_Detalle y render)
- **Property 1** (property-based): abrir un movimiento deja `detailMovement` en ese movimiento (uno a la vez); abrir otro lo reemplaza; cerrar deja `null`.
- **Property 2** (property-based): activar los controles internos (botones y miniatura de evidencia) no abre el `Modal_Detalle` y sí ejecuta la acción.
- **Property 8** / ejemplos de render: el `Modal_Detalle` muestra descripción con `whitespace-pre-wrap break-words`, "Sin descripción" cuando vacía, y la línea de empleado en el mismo modal; la fila presenta el indicador visual (`chevron_right`) y la miniatura de evidencia a alto completo (`self-stretch`, `object-cover`). (Req 1.3, 1.5, 1.6, 1.8, 6.1, 6.3)

### Pruebas de accesibilidad
- **Property 3** (property-based): equivalencia Enter/Espacio vs clic para abrir el modal; presencia de `aria-haspopup="dialog"` en la fila y de `role="dialog"`/`aria-modal="true"` y cierre con Escape en el modal.
- Ejemplo: presencia de `role="button"`, `tabIndex={0}` y `aria-label` en la zona pulsable. (Req 2.1, 2.3)

### Pruebas de paridad móvil/tablet
- Ejemplos de render en viewport estrecho: misma interacción de apertura del `Modal_Detalle`, mismo contenido, sin scroll horizontal ni texto cortado con descripciones largas. (Req 7.1, 7.2, 7.3)
