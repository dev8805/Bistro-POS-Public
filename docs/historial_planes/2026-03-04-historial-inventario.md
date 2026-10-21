# Historial de Inventario — Plan de Implementación

**Objetivo:** Agregar un tab de "Historial" en la sección de Registro de Inventario (dentro de `ExpenseModal.tsx`) que permita ver, editar y eliminar compras de inventario pasadas, mostrando la fecha formateada (ej: "4 mar 2026"), y con lógica de protección: no se puede eliminar una compra si ya se vendieron unidades de ese lote.

**Arquitectura:** Reutilizar la lógica existente de `deletePurchaseRecord` y `updatePurchaseRecord` de `useDebts.ts` (ya implementada y probada en `DebtsScreen.tsx`). La fuente de datos será `business_debts` con `inventory_lot_id` no nulo, complementada con datos de `inventory_lots` para verificar ventas.

**Tech Stack:** React, TypeScript, Supabase, TailwindCSS

---

## Análisis Previo

### ¿Cómo funciona la lógica actual en `DebtsScreen.tsx`?

1. **Eliminar compra (`handleDeletePurchase`):**
   - Verifica que el `debt` tenga un `inventory_lot_id`
   - Llama a `deletePurchaseRecord(debt.id)` del hook `useDebts`
   - El hook consulta `inventory_lots` para obtener el lote
   - Calcula `sold = initial_quantity - remaining_quantity`
   - **Si `sold > 0`**: bloquea la eliminación y muestra mensaje explicativo
   - **Si `sold === 0`**: revierte el stock, elimina el lote, elimina el registro de deuda, y actualiza deuda del proveedor si aplica

2. **Editar compra (`handleOpenEditPurchase` / `handleSaveEditPurchase`):**
   - Extrae cantidad del `description` con regex
   - Llama a `updatePurchaseRecord(debtId, { newQuantity, newUnitCost })`
   - El hook valida que la nueva cantidad no sea menor que las unidades ya vendidas
   - Actualiza `inventory_lots` y `business_debts` correspondientemente

### Tablas Supabase involucradas

| Tabla | Rol |
|---|---|
| `business_debts` | Registra compras (crédito y contado), tiene `inventory_lot_id` |
| `inventory_lots` | Lotes de inventario con `initial_quantity`, `remaining_quantity`, `unit_cost`, `purchase_date`, `supplier_name` |
| `products` | Stock actual del producto |

### Patrón existente a replicar

Ya existe historial implementado para **gastos** (`expenseTab: 'register' | 'history'`) y **mermas** (`wasteTab: 'register' | 'history'`) en el mismo `ExpenseModal.tsx`. El inventario necesita el mismo patrón.

---

## Dudas / Decisiones

1. **¿De dónde sacar los registros?** → De `business_debts` donde `inventory_lot_id IS NOT NULL`. Esta tabla ya tiene: fecha (`created_at`), monto (`total_amount`), descripción (contiene nombre del producto y cantidad), tipo de compra (crédito/contado) y vínculo al lote.

2. **¿Necesitamos un nuevo fetch?** → Sí, un `fetchInventoryPurchases` en `useDebts.ts` que filtre debts con `inventory_lot_id` no nulo. Alternativamente, podemos filtrar directamente los `debts` existentes en el componente ya que `useDebts` ya carga todos. **Decisión:** filtrar en el componente para evitar un fetch adicional — los datos ya están cargados.

3. **¿Qué mostrar por item?**
   - Nombre del producto (extraído del `description`)
   - Cantidad y unidad (extraído del `description`)
   - Monto total (`total_amount`)
   - Tipo: Crédito / Contado (badge)
   - Fecha formateada: "4 mar 2026"
   - Proveedor (`creditor_name`)
   - Botones: Editar ✏️ / Eliminar 🗑️

4. **Protección al eliminar:** Misma lógica que `DebtsScreen` — si el lote tiene `sold > 0`, mostrar `blockedMessage` y no permitir.

---

## Tareas

### Tarea 1: Agregar tab "Historial" en la sección de Inventario del Header

**Archivos:**
- Modify: `components/ExpenseModal.tsx` (zona del header de inventario, ~líneas 1397-1407)

**Implementación:**
- Añadir un estado `inventoryTab: 'register' | 'history'` (similar a `expenseTab` y `wasteTab`)
- En el header, al lado del pill "REGISTRO DE INVENTARIO", añadir un toggle/tab para alternar entre registro e historial
- Usar el mismo patrón visual que gastos y mermas

---

### Tarea 2: Renderizar la lista de historial de compras

**Archivos:**
- Modify: `components/ExpenseModal.tsx` (sección de contenido de inventario, ~líneas 1411+)

**Implementación:**
- Cuando `inventoryTab === 'history'`:
  - Filtrar `debts` del hook `useDebts` donde `inventory_lot_id` no sea null
  - Ordenar por `created_at` descendente
  - Renderizar cada item con:
    - Badge de tipo (Crédito/Contado)
    - Nombre del producto y cantidad (parseados del `description`)
    - Proveedor
    - Fecha formateada: `formatExpenseDate` ya existe → reutilizar `MONTHS_SHORT`
    - Monto
    - Botones de editar/eliminar (solo si tiene `inventory_lot_id`)

---

### Tarea 3: Implementar eliminación con protección

**Archivos:**
- Modify: `components/ExpenseModal.tsx`

**Implementación:**
- Crear `handleDeleteInventoryPurchase(debt)`:
  1. Verificar `debt.inventory_lot_id`
  2. `confirmAction({ title, variant: 'danger' })`
  3. Llamar `deletePurchaseRecord(debt.id)` de `useDebts`
  4. Si `result.blocked` → setear `blockedMessage` con el mismo texto que usa `DebtsScreen`
  5. Si éxito → showToast success

- Renderizar modal de `blockedMessage` (mismo patrón que `DebtsScreen`)

---

### Tarea 4: Implementar edición

**Archivos:**
- Modify: `components/ExpenseModal.tsx`

**Implementación:**
- Crear estados: `editingInventoryDebt`, `editInventoryQty`, `editInventoryCost`
- `handleOpenEditInventory(debt)`:
  - Extraer cantidad del description con regex
  - Setear estados
- `handleSaveEditInventory()`:
  - Calcular `newUnitCost = newCostTotal / newQty`
  - Llamar `updatePurchaseRecord(debtId, { newQuantity, newUnitCost })`
  - Mostrar toast de resultado

- UI: inline edit (misma estética que `DebtsScreen`)

---

### Tarea 5: Mover las tabs de inventario

**Archivos:**
- Modify: `components/ExpenseModal.tsx` (~líneas 1414-1430)

**Implementación:**
- Actualmente las tabs de inventario son: "Escanear Factura" / "Item Manual"
- Añadir antes un nivel superior de tabs: "Registrar" | "Historial" (en la misma fila del pill del header)
- Cuando `inventoryTab === 'register'` → mostrar las sub-tabs existentes (upload/manual)
- Cuando `inventoryTab === 'history'` → mostrar la lista del historial

---

## Resumen de Cambios

| Archivo | Tipo | Descripción |
|---|---|---|
| `components/ExpenseModal.tsx` | Modify | Agregar tab historial, lista de compras, editar, eliminar con protección |

**Nota:** No se necesita modificar `useDebts.ts` ni `useExpenses.ts` — toda la lógica necesaria ya existe. Solo se filtra `debts` en el componente y se reutilizan `deletePurchaseRecord` y `updatePurchaseRecord`.

---

## Flujo de Datos

```
ExpenseModal (recordType === 'inventory')
  │
  ├── inventoryTab === 'register'
  │     ├── inventoryMode === 'upload' → InvoiceScanView
  │     └── inventoryMode === 'manual' → formulario manual
  │
  └── inventoryTab === 'history'
        └── debts.filter(d => d.inventory_lot_id != null)
              ├── Mostrar: producto, qty, monto, fecha, proveedor, tipo
              ├── Editar → updatePurchaseRecord()
              └── Eliminar → deletePurchaseRecord()
                    └── Si sold > 0 → blockedMessage (no se puede borrar)
```

## Riesgos y Mitigaciones

| Riesgo | Mitigación |
|---|---|
| El modal ya tiene 2300+ líneas | Reutilizar funciones y patrones existentes, no duplicar lógica |
| Rendimiento al filtrar muchos debts | Limitar con `.slice(0, 50)` en UI |
| La deuda no tenga lot_id | Solo mostrar botones editar/eliminar si `inventory_lot_id` existe |
