# Implementation Plan: Detalle de Movimientos de Proveedor

## Overview

Este plan implementa la funcionalidad en dos partes independientes derivadas del diseño aprobado:

- **Parte 1 (solo UI, sin base de datos):** abrir un `Modal_Detalle` al pulsar cada `Tarjeta_Movimiento` en `screens/DebtsScreen.tsx` para mostrar la descripción completa, con soporte de teclado y accesibilidad, y renderizar la miniatura de evidencia a alto completo. Es desplegable de forma aislada, no depende de la migración.
- **Parte 2 (requiere migración):** agregar la columna `created_by` a `business_debts`, poblarla en todos los puntos de inserción (online y offline), traerla vía join en vivo a `profiles(full_name)` en `useDebts`, y mostrar el `Nombre_Empleado` dentro del `Modal_Detalle`.

El orden de las tareas maximiza el paralelismo: la migración y la UI Parte 1 arrancan a la vez; la capa de datos y los puntos de inserción dependen de la migración; la visualización del empleado en UI depende del fetch y del Modal_Detalle ya construido.

Lenguaje/stack de implementación: TypeScript + React (según el diseño). Pruebas de propiedad con `fast-check` sobre Vitest.

## Task Dependency Graph

```
Task 1 (UI Parte 1 — DebtsScreen)          Task 2 (Migración BD — base Parte 2)
   │                                            │
   ├─→ Tests 1.2 * 1.3 * 1.4 * 1.5 *           ├─→ Smoke 2.2 *
   │                                            │
   │                              ┌─────────────┼─────────────┬──────────────┐
   │                              ▼             ▼             ▼              │
   │                         Task 3.1       Task 4.2      Task 4.3           │
   │                        (useDebts       (useInventory (useOfflineSync    │
   │                         fetch/tipo)     inserts)      sync inserts)      │
   │                              │                                          │
   │              ┌───────────────┼───────────────┐                         │
   │              ▼               ▼               ▼                         │
   │         Tests 3.2 * 3.3 *  Task 4.1      Task 5.1 ◄── depende de Task 1 │
   │                            (useDebts      (UI empleado                   │
   │                             inserts)       en DebtsScreen)               │
   │                              │               │                          │
   │                              └──────┬────────┘                          │
   │                                     ▼                                   │
   └──────────────────────────►  Tests 4.4 * 4.5 * (inserción)   5.2 * (UI)  │
```

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1.1", "2.1"],
      "description": "Base en paralelo: UI del Modal_Detalle (Parte 1, solo DebtsScreen) y migración de la columna created_by (base de la Parte 2). Independientes entre sí."
    },
    {
      "wave": 2,
      "tasks": ["1.2", "1.3", "1.4", "1.5", "2.2", "3.1", "4.2", "4.3"],
      "description": "Tests de la UI Parte 1 y smoke de la migración; capa de lectura useDebts (fetch/tipo) e inserciones en useInventory y useOfflineSync (dependen solo de la migración, en archivos distintos)."
    },
    {
      "wave": 3,
      "tasks": ["3.2", "3.3", "4.1", "5.1"],
      "description": "Tests del fetch; inserciones en useDebts (mismo archivo que 3.1, va en wave posterior) y visualización del empleado en DebtsScreen (depende del fetch y de la UI Parte 1)."
    },
    {
      "wave": 4,
      "tasks": ["4.4", "4.5", "5.2"],
      "description": "Property tests de atribución de empleado (inserción online/offline) y del Modal_Detalle con descripción + empleado."
    }
  ]
}
```

## Tasks

- [x] 1. Detalle del movimiento en modal (Parte 1, solo UI en `screens/DebtsScreen.tsx`)
  - [x] 1.1 Implementar el Modal_Detalle, la fila pulsable y la miniatura de evidencia a alto completo (implementado)
    - Agregar estado `const [detailMovement, setDetailMovement] = useState<BusinessDebt | null>(null)`: se guarda un único movimiento a la vez (o `null`). Abrir el detalle es `setDetailMovement(debt)`; cerrarlo es `setDetailMovement(null)`.
    - Convertir la `Tarjeta_Movimiento` (lista alrededor de la línea 1448, `selectedCreditor.debts.filter(...).sort(...).map(...)`) en zona pulsable: `role="button"`, `tabIndex={0}`, `aria-haspopup="dialog"`, `aria-label` descriptivo ("Ver detalle del movimiento"), `onClick={() => setDetailMovement(debt)}` y `onKeyDown` que abre el modal con Enter y Espacio (con `preventDefault()` en Espacio para evitar scroll).
    - Envolver los `onClick` de los botones internos existentes (evidencia → `setViewerDebt`, editar → `handleOpenEditPurchase`, eliminar → `handleDeletePayment`/`handleDeletePurchase`) para invocar `e.stopPropagation()` antes de ejecutar la acción, evitando que abran el `Modal_Detalle`.
    - Miniatura de evidencia a alto completo: cuando el movimiento tiene evidencia, renderizarla en la columna derecha de la fila ocupando todo el alto (`self-stretch`, imagen `object-cover`); su `onClick` llama `e.stopPropagation()` y abre `EvidenceViewer` (vía `setViewerDebt`) sin abrir el `Modal_Detalle`.
    - Modal_Detalle accesible (`role="dialog"`, `aria-modal="true"`, cierre con botón Cerrar, overlay y tecla Escape) que muestra: badge del tipo + monto, fecha completa, la `Descripcion_Completa` con `whitespace-pre-wrap break-words` (respeta saltos de línea, sin recorte horizontal) o "Sin descripción" si `description` está vacío/null. Mantener la clase `truncate` en la descripción de la fila.
    - Indicador visual en la fila (ícono `chevron_right`) que señala que abre el `Modal_Detalle`, con Tailwind (paleta Warm Bistro: `amber-400`). Sin CSS plano ni `<style>`.
    - Un único movimiento en el `Modal_Detalle` a la vez. Comportamiento idéntico en móvil/tablet (mismo componente responsive), sin scroll horizontal.
    - Mientras no exista `created_by_name` (Parte 2 aún no aplicada), el `Modal_Detalle` muestra "Empleado no registrado".
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1, 2.2, 2.3, 2.4, 7.1, 7.2, 7.3_

  - [ ]* 1.2 Property test de apertura/cierre del Modal_Detalle
    - **Property 1: El Modal_Detalle muestra un único movimiento y abre/cierra de forma consistente**
    - **Validates: Requirements 1.1, 1.2, 1.7**
    - `fast-check` + Vitest, ≥100 iteraciones. Etiqueta: `Feature: detalle-movimientos-proveedor, Property 1`.

  - [ ]* 1.3 Property test de los controles internos
    - **Property 2: Los botones de acción y la evidencia no abren el Modal_Detalle**
    - **Validates: Requirements 1.4, 1.8**
    - `fast-check` + Vitest, ≥100 iteraciones. Etiqueta: `Feature: detalle-movimientos-proveedor, Property 2`.

  - [ ]* 1.4 Property test de accesibilidad teclado/ratón y semántica del modal
    - **Property 3: Teclado y ratón abren el Modal_Detalle de forma equivalente y la semántica ARIA es correcta**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
    - `fast-check` + Vitest, ≥100 iteraciones. Etiqueta: `Feature: detalle-movimientos-proveedor, Property 3`.

  - [ ]* 1.5 Tests de render del Modal_Detalle (ejemplos/edge cases)
    - Verificar que el `Modal_Detalle` renderiza la descripción con `whitespace-pre-wrap break-words`, muestra "Sin descripción" cuando el campo está vacío/null, y que la fila presenta el indicador visual (`chevron_right`) y la miniatura de evidencia a alto completo. Incluir un ejemplo en viewport estrecho (móvil/tablet) sin scroll horizontal.
    - _Requirements: 1.3, 1.5, 1.6, 1.8, 7.3_

- [x] 2. Migración de base de datos: columna `created_by` en `business_debts` (base de la Parte 2)
  - [x] 2.1 Crear el archivo de migración SQL
    - `ALTER TABLE business_debts ADD COLUMN created_by uuid CONSTRAINT business_debts_created_by_fkey REFERENCES profiles(id) ON DELETE SET NULL;`
    - `CREATE INDEX IF NOT EXISTS idx_business_debts_created_by ON business_debts(created_by);`
    - La columna admite NULL; la FK se nombra explícitamente para el embed de PostgREST. NO incluir ningún `UPDATE` de retro-poblado desde `expenses` (los históricos quedan en NULL).
    - _Requirements: 3.1, 3.6_

  - [ ]* 2.2 Smoke test del esquema tras la migración
    - Verificar que `business_debts` tiene `created_by uuid` nullable, FK `business_debts_created_by_fkey` → `profiles(id)` con `ON DELETE SET NULL`, y el índice `idx_business_debts_created_by`. Confirmar que no hubo retro-poblado.
    - _Requirements: 3.1, 3.6_

- [x] 3. Lectura del empleado en el fetch de deudas (`hooks/useDebts.ts`)
  - [x] 3.1 Extender el tipo `BusinessDebt` y `fetchDebts` con join + transform + cache
    - Añadir `created_by_name?: string | null` al tipo `BusinessDebt` (el campo `created_by?: string` ya existe).
    - Cambiar `.select('*')` por `.select('*, created_by_profile:profiles!business_debts_created_by_fkey(full_name)')`.
    - Transformar cada fila: aplanar `created_by_profile?.full_name` a `created_by_name` (`?? null`) y eliminar el objeto anidado (patrón de `transformOrder` en `useSalesHistory`).
    - Guardar el array ya transformado tanto en `setState` como en el cache `bistro_debts_cache_{businessId}`. Preservar orden y demás campos sin alteración.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 3.2 Property test del fetch/transform
    - **Property 6: El fetch resuelve el nombre vigente del empleado y preserva el resto**
    - **Validates: Requirements 5.1, 5.2, 5.4, 5.5, 5.6**
    - Generar filas con embed `created_by_profile`, incluidos perfiles con `is_deleted = true`; verificar aplanado, preservación de orden/campos y reflejo de renombrados. `fast-check` + Vitest, ≥100 iteraciones. Etiqueta: `Feature: detalle-movimientos-proveedor, Property 6`.

  - [ ]* 3.3 Property test de ausencia de empleado (edge case)
    - **Property 7: Ausencia de empleado degrada al texto por defecto**
    - **Validates: Requirements 5.3, 6.2**
    - Filas con `created_by` null o embed null → `created_by_name = null`. `fast-check` + Vitest, ≥100 iteraciones. Etiqueta: `Feature: detalle-movimientos-proveedor, Property 7`.

- [x] 4. Poblar `created_by` en los puntos de inserción (Parte 2)
  - [x] 4.1 Inserciones en `hooks/useDebts.ts` (`createDebt` y `addCreditorPayment`)
    - `createDebt`: agregar `created_by: userId` (`userId = profile?.id`) al objeto insertado. Esto cubre también los gastos de `ExpenseRegister`, que delega en `createDebt`.
    - `addCreditorPayment` rama online: el insert del registro de abono (`total_amount: 0`) incluye `created_by: userId`.
    - `addCreditorPayment` rama offline: el `fakePaymentRecord` del estado local incluye `created_by: userId` y `created_by_name: profile?.full_name` para mostrar el nombre de inmediato sin esperar el sync.
    - _Requirements: 3.2, 3.3, 4.1, 4.4_

  - [x] 4.2 Inserciones en `hooks/useInventory.ts`
    - Los dos inserts directos a `business_debts` ("Ajuste de inventario (sobrante)"), en `updateProductStock` y `updateMultipleStocks`, agregan `created_by: profile.id`.
    - _Requirements: 3.4_

  - [x] 4.3 Inserciones de sincronización en `hooks/useOfflineSync.ts`
    - Los dos inserts directos a `business_debts` al sincronizar la compra offline (~línea 714) y el abono offline (~línea 927) agregan `created_by: tx.userId`. `offlineQueue.OfflineTransaction` ya transporta `userId` a nivel de transacción, por lo que no se modifica el payload encolado.
    - _Requirements: 4.3, 4.4_

  - [ ]* 4.4 Property test de atribución en la inserción
    - **Property 4: Todo movimiento insertado registra al empleado autenticado (online u offline)**
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5, 4.3, 4.4**
    - Con Supabase mockeado: `createDebt`, `addCreditorPayment` online, ambos inserts de `useInventory` y los inserts de sync de `useOfflineSync` asignan `created_by`; paridad online vs offline+sync. `fast-check` + Vitest, ≥100 iteraciones. Etiqueta: `Feature: detalle-movimientos-proveedor, Property 4`.

  - [ ]* 4.5 Property test de la transacción offline
    - **Property 5: La transacción offline transporta el identificador del empleado**
    - **Validates: Requirements 4.1, 4.2**
    - El encolado offline de abono/compra lleva `tx.userId = profile.id`. `fast-check` + Vitest, ≥100 iteraciones. Etiqueta: `Feature: detalle-movimientos-proveedor, Property 5`.

- [x] 5. Visualización del empleado en el Modal_Detalle (Parte 2, extiende la Parte 1 en `screens/DebtsScreen.tsx`)
  - [x] 5.1 Mostrar el empleado dentro del Modal_Detalle
    - En el `Modal_Detalle` construido en la tarea 1.1, añadir la línea "Registrado por: {created_by_name}" cuando el movimiento tiene `created_by_name` resuelto, o "Empleado no registrado" si es null/ausente. Debe quedar dentro del mismo modal que la `Descripcion_Completa`. Paridad móvil/tablet.
    - _Requirements: 6.1, 6.2, 6.3, 7.2_

  - [ ]* 5.2 Property test del Modal_Detalle completo
    - **Property 8: El Modal_Detalle muestra descripción y empleado juntos**
    - **Validates: Requirements 1.3, 1.5, 6.1, 6.3**
    - Para cualquier movimiento abierto en el `Modal_Detalle`, el modal muestra la descripción sin truncar (o "Sin descripción") y, en el mismo modal, el `Nombre_Empleado` o el `Texto_Sin_Empleado`. `fast-check` + Vitest, ≥100 iteraciones. Etiqueta: `Feature: detalle-movimientos-proveedor, Property 8`.

- [~] 6. Checkpoint final
  - Asegurar que todas las pruebas pasan; consultar al usuario si surgen dudas.

## Notes

- **ExpenseRegister queda cubierto sin tocarlo:** `components/expense/ExpenseRegister.tsx` registra los gastos ("Gasto de contado/crédito") delegando en `createDebt` de `useDebts`, por lo que al poblar `created_by` en `createDebt` (tarea 4.1) los gastos quedan atribuidos automáticamente. No se crea tarea de cambio de código para ese archivo; basta con verificar en la integración (Req 3.5) que el movimiento resultante lleva `created_by`.
- **RLS duplicadas (pre-existente, no se corrige aquí):** `business_debts` tiene políticas RLS duplicadas (dos juegos equivalentes por operación). Esta feature no las modifica; se deja documentado para una limpieza futura. El `with_check` de INSERT no valida `created_by`, así que no bloquea la nueva columna.
- **Parte 1 desplegable de forma independiente:** las tareas de la Tarea 1 (y la Tarea 5 salvo la línea del empleado) no dependen de la migración. Mientras `created_by_name` no exista, el `Modal_Detalle` muestra "Empleado no registrado", por lo que la Parte 1 puede implementarse, probarse y desplegarse sin la Parte 2.
- **Tras aplicar la migración (Tarea 2.1):** correr `get_advisors` (security + performance), sincronizar el esquema local con `supabase migration fetch` y regenerar los tipos de Supabase. NO retro-poblar los movimientos históricos.
- **Tareas opcionales:** las subtareas marcadas con `*` (property tests, smoke y tests de render) pueden omitirse para un MVP más rápido, pero cubren las 8 propiedades de correctitud del diseño.
- **Degradación elegante:** si `profile.id`/`userId` fuese `undefined` (sesión anómala), la inserción usa `created_by: null` sin abortar el insert.
