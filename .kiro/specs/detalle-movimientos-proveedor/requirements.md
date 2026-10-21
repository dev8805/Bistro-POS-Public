# Requirements Document

## Introduction

Esta funcionalidad, **Detalle de Movimientos de Proveedor**, mejora el panel lateral de detalle de un proveedor en la pantalla de Deudas (`screens/DebtsScreen.tsx`, sección "Movimientos"). Hoy, cada movimiento (compra, gasto o abono) muestra su descripción/anotaciones en una sola línea truncada (clase CSS `truncate`), por lo que el usuario no puede leer el texto completo. Además, el sistema no registra ni muestra qué empleado creó cada movimiento.

La feature se divide en dos partes claramente separadas por su impacto técnico:

- **Parte 1 — Detalle en modal (solo UI, sin cambios de base de datos):** hacer que cada movimiento del panel del proveedor abra un modal de detalle al pulsarlo, mostrando la descripción/anotaciones completa que hoy queda truncada. Además, la miniatura de evidencia se muestra ocupando todo el alto de la fila. Esta parte NO depende de la base de datos y puede implementarse de forma independiente.
- **Parte 2 — Atribución de empleado (requiere migración de base de datos):** agregar una columna `created_by` a la tabla `business_debts`, poblarla en todos los puntos de inserción (incluido el camino offline), traerla mediante join a `profiles(full_name)` en el fetch de `useDebts`, y mostrar el nombre del empleado dentro del modal de detalle del movimiento.

Contexto verificado contra la base de datos y el código:

- La tabla `business_debts` tiene las columnas: `id`, `business_id`, `type`, `creditor_name`, `description`, `total_amount`, `paid_amount`, `status`, `due_date`, `created_at`, `updated_at`, `supplier_id`, `inventory_lot_id`, `evidence_url`. **No existe la columna `created_by`** en la base de datos, aunque el tipo TypeScript `BusinessDebt` en `hooks/useDebts.ts` la declara como `created_by?: string`.
- La tabla `expenses` sí tiene `created_by uuid`. Los movimientos tipo "Gasto de contado/crédito" se insertan en `business_debts` desde `components/expense/ExpenseRegister.tsx` sin columna que enlace a `expenses`.
- El nombre del empleado se resuelve vía `profiles(full_name)`, patrón ya usado en `hooks/useCashRegister.ts` (joins tipo `created_by_profile:profiles(full_name)`) y en `hooks/useSalesHistory.ts` (join en vivo `waiter:profiles!waiter_id(full_name)`).
- Los movimientos históricos existentes quedarán con `created_by` NULL, por lo que no tendrán empleado asociado. Solo los movimientos nuevos lo tendrán.
- **Mecanismo de conservación del nombre (igual que el historial de ventas):** "Eliminar empleado" es un soft-delete (`profiles.is_deleted = true` vía edge function `delete-employee`); la fila de `profiles` nunca se borra físicamente. El historial de ventas conserva el nombre del vendedor tras "eliminarlo" porque no copia el nombre en la venta, sino que hace un join en vivo a `profiles`. Esta feature replica ese patrón (columna `created_by uuid` + join en vivo a `profiles(full_name)`), por lo que el Nombre_Empleado se conserva sin una columna que copie el nombre. Como consecuencia (idéntica a ventas): si un empleado cambia su nombre, los movimientos previos mostrarán el nombre actualizado (retroactivo esperado).

Decisiones de producto confirmadas con el usuario:

| Decisión | Valor confirmado |
|---|---|
| Texto para movimientos sin empleado (`created_by` NULL) | "Empleado no registrado" |
| Interacción de detalle | Toda la fila del movimiento es pulsable para abrir el Modal_Detalle; los botones existentes (evidencia, editar, eliminar) NO abren el Modal_Detalle |
| Comportamiento en móvil/tablet | Mismo comportamiento que en desktop |
| Retro-poblado de históricos desde `expenses.created_by` | No se hace; los históricos quedan en NULL |
| Conservación del nombre al eliminar empleado | Opción A — join en vivo a `profiles(full_name)`, igual que el historial de ventas; sin columna de nombre copiado. El nombre persiste porque el borrado de empleados es soft-delete |

## Glossary

- **Sistema**: la aplicación Bistro POS en su conjunto (frontend PWA + Capacitor, Supabase y edge functions), usado como sujeto general cuando una regla aplica al sistema completo.
- **Panel_Proveedor**: panel lateral de detalle de un proveedor en `screens/DebtsScreen.tsx`, que incluye la sección "Movimientos".
- **Movimiento**: cada registro de la tabla `business_debts` asociado a un proveedor, mostrado como tarjeta en la sección "Movimientos". Puede ser de tipo Abono, Contado o Crédito según la lógica de badges existente.
- **Descripcion_Completa**: contenido del campo `business_debts.description` (descripción/anotaciones del movimiento), que hoy se renderiza truncado a una sola línea.
- **Tarjeta_Movimiento**: componente visual que representa un Movimiento dentro del Panel_Proveedor, con sus badges, montos y botones de acción (evidencia, editar, eliminar).
- **Modal_Detalle**: modal accesible (`role="dialog"`, `aria-modal="true"`) que se abre al pulsar una Tarjeta_Movimiento y muestra el detalle de un único Movimiento a la vez: badge del tipo con el monto, fecha completa, Descripcion_Completa y, cuando aplica, el Nombre_Empleado. Se cierra con el botón Cerrar, con el overlay o con la tecla Escape.
- **created_by**: nueva columna en `business_debts` de tipo `uuid` que referencia `profiles(id)`, identificando al empleado que creó el Movimiento.
- **Nombre_Empleado**: `profiles.full_name` del empleado referenciado por `created_by`, resuelto mediante join en el fetch de `useDebts`.
- **Texto_Sin_Empleado**: literal "Empleado no registrado" que se muestra cuando `created_by` es NULL.
- **Punto_Insercion**: cada lugar del código que inserta filas en `business_debts`: `hooks/useDebts.ts` (`createDebt`, `addCreditorPayment`), `hooks/useOfflineSync.ts` (compra offline y abono offline), `hooks/useInventory.ts` (compra de inventario, 2 lugares) y `components/expense/ExpenseRegister.tsx` (gastos).
- **Cola_Offline**: cola en IndexedDB (Event Sourcing + sincronización) que procesa `hooks/useOfflineSync.ts` para abonos a proveedores y compras realizadas sin conexión. El `userId` del empleado está disponible como `profile.id` y se encola en la transacción offline.
- **Badge_Movimiento**: etiqueta de tipo del Movimiento según la lógica existente: "Abono" (`total_amount === 0 && paid_amount > 0`), "Contado" (`status === 'paid' && paid_amount >= total_amount`) o "Crédito" (resto).

## Requirements

### Requisito 1: Detalle del movimiento en modal (solo UI, sin base de datos)

**Historia de Usuario:** Como usuario del Panel_Proveedor, quiero pulsar un movimiento para abrir un modal con su descripción/anotaciones completa, para leer el texto que hoy queda cortado en una sola línea. Este requisito NO depende de cambios en la base de datos.

#### Criterios de Aceptación

1.1. WHEN el usuario pulsa una Tarjeta_Movimiento, THE Sistema SHALL abrir el Modal_Detalle de ese Movimiento y SHALL mostrar la Descripcion_Completa sin truncar.
1.2. WHEN el usuario pulsa el botón Cerrar, el overlay del Modal_Detalle o la tecla Escape, THE Sistema SHALL cerrar el Modal_Detalle y SHALL volver a mostrar la lista de Movimientos.
1.3. WHILE el Modal_Detalle está abierto, THE Sistema SHALL mostrar el contenido completo de `business_debts.description` respetando los saltos de línea y sin recorte horizontal.
1.4. WHEN el usuario pulsa el botón de evidencia, editar o eliminar de una Tarjeta_Movimiento, THE Sistema SHALL ejecutar únicamente la acción de ese botón y SHALL evitar que se abra el Modal_Detalle de la Tarjeta_Movimiento.
1.5. IF el campo `business_debts.description` de un Movimiento está vacío o es NULL, THEN THE Sistema SHALL mostrar en el Modal_Detalle el texto "Sin descripción" en lugar de un área vacía.
1.6. THE Sistema SHALL presentar en cada Tarjeta_Movimiento un indicador visual (por ejemplo, ícono `chevron_right`) que señale que la fila abre el Modal_Detalle.
1.7. THE Sistema SHALL mostrar en el Modal_Detalle un único Movimiento a la vez.
1.8. WHEN un Movimiento tiene evidencia, THE Sistema SHALL mostrar la miniatura ocupando todo el alto de la fila del Movimiento, y al pulsarla SHALL abrir el visor de evidencia sin abrir el Modal_Detalle.

### Requisito 2: Accesibilidad de la interacción con el Modal_Detalle

**Historia de Usuario:** Como usuario que navega por teclado o con lector de pantalla, quiero abrir y cerrar el detalle del movimiento sin depender del ratón, para acceder al detalle completo de forma accesible.

#### Criterios de Aceptación

2.1. THE Sistema SHALL asignar a la zona pulsable de la Tarjeta_Movimiento un `tabindex` que la haga enfocable por teclado.
2.2. WHEN la Tarjeta_Movimiento tiene el foco de teclado y el usuario presiona Enter o Espacio, THE Sistema SHALL abrir el Modal_Detalle de esa Tarjeta_Movimiento igual que al pulsarla con el ratón.
2.3. THE Sistema SHALL exponer en la zona pulsable un `aria-haspopup="dialog"` que indique que abre un diálogo, y un `aria-label` descriptivo de la acción de ver el detalle del Movimiento.
2.4. THE Sistema SHALL exponer el Modal_Detalle con `role="dialog"` y `aria-modal="true"`, y SHALL permitir cerrarlo con la tecla Escape.

### Requisito 3: Persistencia del empleado que crea el movimiento (requiere migración)

**Historia de Usuario:** Como administrador, quiero que cada movimiento nuevo de un proveedor guarde qué empleado lo registró, para poder atribuir responsabilidad de compras, gastos y abonos. Este requisito requiere una migración de base de datos.

#### Criterios de Aceptación

3.1. THE Sistema SHALL agregar a la tabla `business_debts` una columna `created_by` de tipo `uuid` que referencia `profiles(id)` con `ON DELETE SET NULL` y admite valor NULL.
3.2. WHEN se crea un Movimiento desde `createDebt` en `hooks/useDebts.ts`, THE Sistema SHALL asignar a `created_by` el identificador del empleado autenticado (`profile.id`).
3.3. WHEN se registra un abono a proveedor desde `addCreditorPayment` en `hooks/useDebts.ts`, THE Sistema SHALL asignar a `created_by` el identificador del empleado autenticado en el registro insertado en `business_debts`.
3.4. WHEN se registra una compra de inventario desde `hooks/useInventory.ts`, THE Sistema SHALL asignar a `created_by` el identificador del empleado autenticado en cada inserción resultante en `business_debts`.
3.5. WHEN se registra un gasto desde `components/expense/ExpenseRegister.tsx`, THE Sistema SHALL asignar a `created_by` el identificador del empleado autenticado en el registro insertado en `business_debts`.
3.6. WHERE un Movimiento existente en `business_debts` tiene `created_by` con valor NULL, THE Sistema SHALL conservar ese valor NULL sin intentar retro-poblarlo a partir de `expenses.created_by`.

### Requisito 4: Atribución de empleado en movimientos creados sin conexión (offline)

**Historia de Usuario:** Como administrador, quiero que los abonos a proveedores y las compras registradas sin conexión también guarden qué empleado los creó, para que la atribución sea consistente entre el camino online y el offline.

#### Criterios de Aceptación

4.1. WHEN un abono a proveedor se registra sin conexión, THE Sistema SHALL incluir el identificador del empleado autenticado (`profile.id`) en la transacción encolada en la Cola_Offline.
4.2. WHEN una compra se registra sin conexión, THE Sistema SHALL incluir el identificador del empleado autenticado (`profile.id`) en la transacción encolada en la Cola_Offline.
4.3. WHEN `hooks/useOfflineSync.ts` sincroniza una transacción offline que inserta un Movimiento en `business_debts`, THE Sistema SHALL asignar a `created_by` el identificador del empleado guardado en la transacción encolada.
4.4. THE Sistema SHALL asignar el mismo valor de `created_by` que se habría asignado en el camino online, de modo que un Movimiento creado offline y sincronizado quede indistinguible en atribución de uno creado online.

### Requisito 5: Lectura del empleado en el fetch de deudas

**Historia de Usuario:** Como usuario del Panel_Proveedor, quiero que el sistema traiga el nombre del empleado junto con cada movimiento, para poder mostrarlo sin consultas adicionales.

#### Criterios de Aceptación

5.1. WHEN `hooks/useDebts.ts` consulta los Movimientos de `business_debts`, THE Sistema SHALL incluir un join a `profiles(full_name)` sobre la relación de `created_by` para obtener el Nombre_Empleado.
5.2. THE Sistema SHALL exponer el Nombre_Empleado resuelto dentro del objeto de Movimiento entregado a la capa de UI.
5.3. IF el join a `profiles` no devuelve un nombre porque `created_by` es NULL o el perfil no existe, THEN THE Sistema SHALL entregar el Nombre_Empleado como ausente para que la UI aplique el Texto_Sin_Empleado.
5.4. THE Sistema SHALL mantener el orden y el resto de campos de los Movimientos sin alteración respecto al comportamiento actual del fetch.
5.5. WHEN el empleado que creó un Movimiento fue eliminado mediante el soft-delete de empleados (`profiles.is_deleted = true`), THE Sistema SHALL seguir mostrando su Nombre_Empleado mediante el join en vivo a `profiles(full_name)`, de la misma forma que el historial de ventas conserva el nombre del vendedor.
5.6. WHEN el `full_name` de un empleado cambia en `profiles`, THE Sistema SHALL reflejar el nombre actualizado en todos sus Movimientos previos, por tratarse de un join en vivo (comportamiento consistente con el historial de ventas).

### Requisito 6: Visualización del empleado en el Modal_Detalle

**Historia de Usuario:** Como usuario del Panel_Proveedor, quiero ver quién registró cada movimiento al abrir su detalle, para saber a qué empleado corresponde la compra, gasto o abono.

#### Criterios de Aceptación

6.1. WHILE el Modal_Detalle está abierto y su Movimiento tiene un Nombre_Empleado resuelto, THE Sistema SHALL mostrar el Nombre_Empleado como empleado que registró el Movimiento (por ejemplo, "Registrado por: {nombre}").
6.2. WHILE el Modal_Detalle está abierto y su Movimiento tiene `created_by` NULL o sin Nombre_Empleado resuelto, THE Sistema SHALL mostrar el Texto_Sin_Empleado ("Empleado no registrado").
6.3. THE Sistema SHALL mostrar el empleado y la Descripcion_Completa dentro del mismo Modal_Detalle del Movimiento.

### Requisito 7: Paridad de comportamiento en móvil y tablet

**Historia de Usuario:** Como usuario en móvil o tablet, quiero el mismo Modal_Detalle con descripción completa y empleado, para acceder a la misma información que en desktop.

#### Criterios de Aceptación

7.1. WHERE el Panel_Proveedor se renderiza en su equivalente móvil o tablet, THE Sistema SHALL ofrecer la misma interacción de apertura y cierre del Modal_Detalle descrita en el Requisito 1.
7.2. WHILE el Modal_Detalle está abierto en móvil o tablet, THE Sistema SHALL mostrar la Descripcion_Completa y el empleado (o el Texto_Sin_Empleado) igual que en desktop.
7.3. THE Sistema SHALL renderizar el Modal_Detalle en viewports de móvil y tablet sin scroll horizontal y sin texto cortado.

## Notas de alcance y separación de partes

- Los Requisitos 1 y 2 constituyen la **Parte 1** y NO dependen de la base de datos: pueden implementarse y desplegarse sin la migración.
- Los Requisitos 3, 4, 5 y 6 constituyen la **Parte 2** y requieren la migración de la columna `created_by` en `business_debts`.
- El Requisito 7 aplica a ambas partes en el equivalente móvil/tablet del panel.
