# Implementation Plan

## Overview

Plan de implementación de la Devolución de Venta. Se construye de abajo hacia arriba: primero la base de datos (permiso, tablas, constraint, RPC), luego permisos de frontend y el hook de datos, después la UI (modal, Caja, historial, Ventas) y por último la verificación integral. Las devoluciones son online-only y no modifican la venta ni el turno original.

## Tasks

### Base de datos (Supabase)

- [x] 1. Sembrar permiso `pos_refund` en roles Administrador
  - Migración: `UPDATE roles SET permissions = permissions || '{"pos_refund": true}'::jsonb WHERE name = 'Administrador'`.
  - Verificar con `execute_sql` que los Administrador quedaron con `pos_refund=true` y los demás sin el permiso.
  - _Requirements: 2.3_

- [x] 2. Crear tablas `sale_refunds` y `sale_refund_items` con RLS
  - `sale_refunds` (id, business_id, order_id, shift_id, refunded_by, refund_method, total_amount, reason, created_at) y `sale_refund_items` (id, refund_id ON DELETE CASCADE, order_item_id, product_id, product_name, quantity, unit_price, amount, restocked).
  - RLS y políticas SELECT/INSERT por `business_id = get_user_business_id()` (items vía pertenencia al refund).
  - Índices: `sale_refunds(order_id)`, `sale_refunds(shift_id)`, `sale_refund_items(order_item_id)`, `sale_refund_items(refund_id)`.
  - `get_advisors` (security) y resolver hallazgos nuevos.
  - _Requirements: 6.1, 6.3, 7.2_

- [x] 3. Ampliar el check de `cash_movements.reference_type` para incluir `'sale_refund'`
  - `DROP CONSTRAINT` + `ADD CONSTRAINT` permitiendo `('order','expense','sale_refund', NULL)`.
  - Confirmar que filas existentes siguen válidas (cambio aditivo).
  - _Requirements: 5.3_

- [x] 4. Crear la RPC `process_sale_refund(p_order_id, p_items jsonb, p_method, p_reason)`
  - `SECURITY DEFINER`, `SET search_path = public`, retorno `json`, atómica.
  - Validaciones: permiso `pos_refund` (`current_user_has_permission`), motivo no vacío, venta del negocio y `status='completed'`, turno abierto del usuario.
  - Por ítem: validar `0 < quantity <= (vendido - ya_devuelto)`; `amount = round((total_price/quantity)*quantity)`; reingresar stock solo si `restock=true` y producto `simple`; insertar `sale_refund_items`.
  - Insertar `sale_refunds` (total) y `cash_movements` (`type='refund'`, `reference_type='sale_refund'`, `reference_id=refund.id`, `shift_id=turno actual`).
  - `EXCEPTION WHEN OTHERS` → `{success:false, message}`.
  - _Requirements: 1.5, 2.2, 3.1, 3.2, 3.3, 4.3, 4.4, 5.1, 5.2, 5.3, 7.1, 7.2_

- [x] 5. Verificar la RPC con datos de prueba (sin afectar producción)
  - Venta de prueba: devolución parcial con restock; segunda devolución que excede lo pendiente (falla); sin turno abierto (falla); usuario sin `pos_refund` (falla); ítem `service` con restock (stock no cambia).
  - Confirmar Property 1, 4, 5, 7 con `execute_sql`.
  - _Requirements: 3.2, 4.4, 7.1_

### Permisos (frontend)

- [x] 6. Agregar el permiso `pos_refund` a la UI de Empleados
  - En `screens/EmployeesScreen.tsx`, añadir al grupo "Punto de Venta" de `PERMISSION_GROUPS`: `{ id: 'pos_refund', label: 'Devoluciones', desc: 'Puede registrar devoluciones de ventas anteriores' }`.
  - Confirmar render en los 4 lugares sin romper la herencia existente.
  - _Requirements: 2.1, 2.3_

### Hook de datos

- [x] 7. Crear hook `useRefunds` con `processSaleRefund`
  - `hooks/useRefunds.ts`: guard `if (!navigator.onLine) return {success:false, message:'Las devoluciones requieren conexión a internet'}`.
  - Llamar `supabase.rpc('process_sale_refund', ...)`; tras éxito disparar `cash-movement-changed` y evento de refresco de ventas.
  - Tipos `RefundItemInput` y resultado.
  - _Requirements: 9.1, 9.2_

### UI — Modal de devolución

- [x] 8. Crear `components/modals/RefundSaleModal.tsx` (búsqueda de venta)
  - Paso 1: input + consulta `orders` (`status='completed'`, con `items`); resultados en filas apiladas de ancho completo.
  - Responsivo: bottom sheet móvil / modal `max-w-lg` escritorio; header y footer fijos, cuerpo scrollable.
  - Banner ámbar solo si `!navigator.onLine` o sin turno abierto; bloquear avance.
  - Solo Tailwind, sin objetos/arrays inline como props, handlers `handle`, accesibilidad.
  - _Requirements: 1.1, 1.2, 9.1, 9.2_

- [x] 9. RefundSaleModal — armado de ítems y reingreso a inventario
  - Paso 2: stepper `0..pendiente` por ítem y casilla "Reingresar al inventario" (solo `simple`, default ON).
  - Total a devolver en vivo; bloquear si total = 0; impedir si la venta está `voided`.
  - _Requirements: 1.3, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2_

- [x] 10. RefundSaleModal — método, motivo y confirmación
  - Paso 3: método y motivos como filas apiladas (estilo radio), paleta sobria (sin amarillo); "Otro" con texto libre.
  - Confirmar deshabilitado si total=0 / sin motivo / sin turno abierto; llama `processSaleRefund` con toasts.
  - Sugerir anulación si la venta es del turno abierto del usuario (sin impedir).
  - _Requirements: 1.4, 5.1, 7.1, 7.3_

### UI — Caja

- [x] 11. Conectar el botón "Devolución" de Caja al nuevo flujo
  - En `screens/CashRegisterScreen.tsx`, el Quick Action "Devolución" abre `RefundSaleModal`; visible solo si `hasPermission('pos_refund')`.
  - Tras éxito: `refetch` de movimientos/turno.
  - _Requirements: 1.1, 2.1, 5.1_

- [x] 12. Mostrar devoluciones en el detalle del turno (historial) — solo frontend
  - Sección "Devoluciones del turno" (en pantalla) consultando `sale_refunds` por `shift_id` (patrón análogo a "Anulaciones del turno"): ítems, monto, motivo, venta referenciada.
  - NO modificar el reporte impreso/PDF/correo (`ShiftReportThermalPDF` ni `lib/shiftReport.ts`): la línea-total "Devoluciones" ya existe y se llena sola.
  - Respetar permisos de visibilidad ya implementados.
  - _Requirements: 8.1, 8.2_

### UI — Ventas

- [x] 13. Indicador y detalle de devoluciones en SalesScreen
  - Ampliar `useSales.fetchOrders` para embeber `refunds:sale_refunds(... items:sale_refund_items(...))`.
  - Lista: indicador "con devolución" cuando `sale.refunds?.length > 0`.
  - Detalle: sección "Devoluciones de esta venta"; venta intacta; NO tocar `buildReceiptData` ni lo impreso.
  - _Requirements: 6.1, 6.2, 6.3, 8.3_

### Cierre

- [x] 14. Verificación integral y build
  - `get_diagnostics` en archivos tocados; `npm run build` sin errores.
  - Verificación manual: parcial/total, restock on/off, método, motivo, bloqueo offline, indicador en Ventas, reflejo en arqueo/cierre.
  - No regresión de anulaciones ni del `addRefund` genérico.
  - _Requirements: 8.3, 9.1_

## Task Dependency Graph

```
1 (permiso) ─┐
2 (tablas) ──┤
3 (constraint) ─┤
             ├─► 4 (RPC) ─► 5 (verificación RPC)
             │
2,3,4 ───────┴─► 7 (useRefunds) ─► 8 ─► 9 ─► 10 (RefundSaleModal)
                                              │
6 (permiso UI) ──────────────────────────────┤
10 ─► 11 (Caja) ─► 12 (historial turno)
2  ─► 13 (Ventas: indicador/detalle)
11,12,13 ─► 14 (verificación + build)
```

- 4 depende de 1, 2, 3.
- 7 depende de 4.
- 8→9→10 secuenciales (mismo componente).
- 11 depende de 10 y 6.
- 12 y 13 dependen de 2 (tablas) y de la RPC.
- 14 es la verificación final.

```json
{
  "waves": [
    { "wave": 1, "tasks": [1, 2, 3, 6] },
    { "wave": 2, "tasks": [4] },
    { "wave": 3, "tasks": [5, 7, 13] },
    { "wave": 4, "tasks": [8] },
    { "wave": 5, "tasks": [9] },
    { "wave": 6, "tasks": [10] },
    { "wave": 7, "tasks": [11, 12] },
    { "wave": 8, "tasks": [14] }
  ]
}
```

## Notes

- Cada tarea de BD usa migraciones MCP y verifica con `get_advisors`/`execute_sql`. No se confía en archivos locales de `supabase/`.
- Cambios 100% aditivos: no se borran RPCs ni columnas existentes; `addRefund` genérico permanece disponible internamente.
- Lo impreso (tickets, recibo público, comanda) NO se modifica en ninguna tarea.
- La implementación de cada tarea queda sujeta a tu autorización antes de ejecutarla.
