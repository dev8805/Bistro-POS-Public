# Registro de Gasto con Pagos Mixtos y Múltiples Métodos - Plan de Implementación

**Objetivo:** Mostrar los métodos de pago configurados en el negocio para el "Registro de Gasto" si la caja está abierta, de la misma forma que opera la "Compra de Inventario", permitiendo pagos divididos o eligiendo un método específico.

**Arquitectura:** Extenderemos la Interfaz Visual en `ExpenseModal.tsx` para usar el estado existente `payments` en lugar del campo numérico simple si se opta por descontar en caja. Refactorizaremos levemente el hook `useExpenses.ts` para que pueda iterar sobre estos múltiples pagos al generar los movimientos de salida en caja correspondientes.

**Tech Stack:** React, Tailwind CSS, TypeScript, Supabase.

---

### Tarea 1: UI de Métodos de Pago en el Formulario de Gastos

**Archivos:**
- Modify: `components/ExpenseModal.tsx`

**Paso 1: Incluir la sección visual de pagos en "Registro de Gasto"**
En la sección `recordType === 'expense'`, justamente dentro del bloque de condición `!isCredit && activeShift && deductFromCashRegister`:
Renderizar el listado mapeado del array `payments` permitiendo sumar opciones y cambiar montos, idéntico a la vista actual en inventario.
```tsx
{/* 3.1. Payment details (contado + caja) */}
{deductFromCashRegister && (
     <div className="space-y-3 mt-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="flex items-center justify-between mb-3">
               <label className="block text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-[0.12em]">DESGLOSE DEL PAGO</label>
          </div>
          <div className="space-y-2">
               {payments.map((payment, index) => (
                    // Aquí irá la fila exacta obtenida de InvoiceScanView con select (method) e input (amount) y el botón eliminar
               ))}
          </div>
          {payments.length < businessPaymentMethods.length && (
               <button onClick={addPaymentMethod} ... > Agregar método </button>
          )}
          {/* Total Payments */}
          <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between">
              <span className="...">Total a descontar</span>
              <span className="...">${formatCurrency(totalPayments)}</span>
          </div>
     </div>
)}
```

**Paso 2: Bloquear si no cuadra el monto**
En el atributo `disabled={...}` del `<AppButton>` "CONFIRMAR REGISTRO":
Si el gasto es a Contado y `deductFromCashRegister === true`, se debe garantizar que `parseFloat(amount) === totalPayments`. En caso contrario, el botón estará inhabilitado o arrojará alerta.

**Paso 3: Pasar el array de pagos en `onSave`**
En la función `handleSave`, garantizar que `onSave({ ... })` incluya `payments: payments.filter(p => parseFloat(p.amount) > 0)` también para el caso de Expense.

---

### Tarea 2: Adaptar el Backend y Hook para soportar Pagos de Gasto Múltiples

**Archivos:**
- Modify: `hooks/useExpenses.ts`
- Modify: `types.ts` / Interfaces

**Paso 1: Múltiples pagos en `CreateExpenseData`**
En `hooks/useExpenses.ts`, actualizar la interfaz `CreateExpenseData` para incluir el array `payments?: { method: string, amount: string }[]`.

**Paso 2: Sustituir la inserción de un solo movimiento de caja**
Actualmente, `useExpenses.ts` L ~211 detecta `if (expenseData.payment_method === 'cash')` y luego hace el `insert()` al array `cash_movements`.
Debe migrar de este comportamiento a un bucle por cada `payment`:
```typescript
if (data.payments && data.payments.length > 0) {
    const { data: activeShift } = await supabase... // Obtener caja abierta

    if (activeShift) {
        const cashMovementsPayload = data.payments.map(p => ({
            shift_id: activeShift.id,
            created_by: userId,
            type: 'expense',
            amount: parseFloat(p.amount), // Monto parcial con ese método
            payment_method: p.method,     // <-- Ahora se registra el método real (tarjeta, efectivo, transf)
            description: expense.description,
            reference_id: expense.id,
            reference_type: 'expense'
        }));

        await supabase.from('cash_movements').insert(cashMovementsPayload);
    }
} else if (expenseData.payment_method === 'cash') {
    // Mantener la lógica anterior por retrocompatibilidad o por resguardo
}
```

### Tarea 3: Modificaciones a la Tabla de Configuración (Opcional, de validación)

**Archivos:**
- DB Schema/Types (si aplica)

**Paso 1: Chequeo de constraints**
- En la tabla `expenses`, si envías `payment_method: 'mixed'`, constatar que no exista una restricción CHECK que limite a `cash|card|transfer` o actualizar el schema en Supabase si arrojara un error. La tabla `cash_movements` soporta y necesita saber el verdadero método de pago por registro.
