# Expense Modal Logic Implementation Plan

**Objetivo:** Permitir el registro de un gasto (Expense) con opción de Crédito o Contado, obligando a elegir un proveedor si es a crédito, y preguntando si sale de la caja si es al contado (y hay caja abierta), usando la misma lógica que la "compra de inventario".

**Arquitectura:** Se modificará `components/ExpenseModal.tsx` para incorporar en la vista "Registro de Gasto" (`recordType === 'expense' && expenseTab === 'register'`) el componente visual Selector de Tipo de Operación (Contado/Crédito) y la selección de Proveedor/Caja, copiándolos de la vista actual de Inventario (`InvoiceScanView`). Se adaptará `handleSave` en el modal para que registre la deuda (si es crédito) o use la lógica de la caja (pasando los métodos de pago correctos al hook `useExpenses.ts`), y se verificará el hook `useExpenses.ts` para que concuerde.

**Tech Stack:** React, Tailwind CSS, TypeScript.

---

### Tarea 1: Añadir UI de Tipo de Transacción y Proveedor al formulario de Gasto

**Archivos:**
- Modify: `components/ExpenseModal.tsx`

**Paso 1: Localizar la sección de "Register View" de gastos**
Ubicar la línea donde se renderiza el bloque `VALOR DEL REGISTRO` para gastos (alrededor de la línea 2446) y `OBSERVACIONES / DETALLES` (alrededor de la línea 2615). 

**Paso 2: Insertar la Interfaz de Pago/Proveedor**
Debajo de `OBSERVACIONES / DETALLES`, se debe renderizar un bloque que muestre:
- Botones de Tipo de Transacción: **Contado** / **Crédito** (Mapeado al estado `isCredit`).
- Si selecciona **Crédito**, se muestra el Autocomplete de Proveedor (Mapeado al estado `creditorName`, búsqueda en listado `proveedores`). Este campo será obligatorio (`disabled` el botón si está vacío).
- Si selecciona **Contado**, el Autocomplete de Proveedor es opcional.
- Si selecciona **Contado** y existe un `activeShift`, se debe mostrar el checkbox/switch para preguntar **"¿Descontar de la caja?"** (Mapeado al estado `deductFromCashRegister`).

**Paso 3: Implementación (Estructura visual)**
```tsx
{recordType === 'expense' && (
   <div className="flex flex-col gap-4 border-t border-gray-100 dark:border-gray-800 pt-4 mt-2">
      <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-[0.15em]">TIPO DE TRANSACCIÓN</label>
      <div className="flex p-1.5 bg-gray-100 dark:bg-black/20 rounded-xl">
         <button ... onClick={() => setIsCredit(false)}>Contado</button>
         <button ... onClick={() => setIsCredit(true)}>Crédito</button>
      </div>
      
      {/* Selector de Proveedor */}
      {/* Mostrar checkbox deductFromCashRegister si isCredit es false y hay activeShift */}
   </div>
)}
```

### Tarea 2: Lógica de Guardado (Modificar `handleSave` en el Modal)

**Archivos:**
- Modify: `components/ExpenseModal.tsx`

**Paso 1: Actualizar el control de habilitación del botón de guardar**
Para `expense`, el botón "CONFIRMAR REGISTRO" no solo depende del `amount`, sino también de `isCredit`. Si `isCredit === true`, debe requerir `creditorName.trim() !== ''`.

**Paso 2: Agregar creación de deuda en `handleSave`**
En la función `handleSave`, ubicar la lógica de inserción de deuda y compras:
Actualmente dentro de `handleSave`:
```typescript
if (recordType === 'inventory') {
   if (!isCredit && deductFromCashRegister && activeShift) { ... }
   else if (isCredit) { createDebt(...) }
}
```

Cambiarlo a:
```typescript
if (recordType === 'inventory' || recordType === 'expense') {
    const finalAmountToDeduct = recordType === 'inventory' ? inventoryCartTotal : (totalPayments || parseFloat(amount) || 0);
    
    // Para inventory, deductFromCashRegister llama recordPurchase manualmente.
    if (recordType === 'inventory' && !isCredit && deductFromCashRegister && activeShift) {
        await recordPurchase(...);
    }
    
    // Si es crédito, crear la deuda para inventario o para gastos
    if (isCredit) {
        await createDebt({
            amount: finalAmountToDeduct,
            description: recordType === 'inventory' ? `Compra de Inventario...` : `Gasto: ${selectedCategory} - ${description || ''}`,
            dueDate: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString(),
            type: 'supplier',
            creditorName: creditorName.trim(),
            status: 'pending',
            payments: [] // ...
        });
    }
}
```

### Tarea 3: Modificar la creación de gasto en el Hook `useExpenses.ts`

**Archivos:**
- Modify: `hooks/useExpenses.ts`
- Modify: `components/ExpenseModal.tsx` (Prop a enviar en `onSave`)

**Paso 1: Analizar el comportamiento de la capa de DB**
En `useExpenses.ts`, al crear un Expense:
```typescript
if (expenseData.payment_method === 'cash') {
   // automáticamente descuenta de la caja
}
```
Para soportar el *checkbox* de "¿Descontar de la caja?" (si el usuario pulsa en "Contado" pero quita el checkbox, o si decide "Crédito"), en `ExpenseModal.tsx` al invocar `onSave`, se enviará:
```typescript
payment_method: (!isCredit && deductFromCashRegister) ? 'cash' : 'other'
```
De este modo, `useExpenses.ts` *solamente* insertará un movimiento de caja en `cash_movements` si el usuario efectivamente confirmó `deductFromCashRegister` al contado.

### Tarea 4: Validaciones y Detalles Finales

- Verificar que si hay una sesión de caja cerrada (`!activeShift`), la deducción de caja no se sugiera.
- Asegurarse de que al seleccionar "Contado", el estado `creditorName` se envíe al backend de Expense o `createDebt` (si llegara a hacerse) si se introdujo, pero opcional. Sin embargo si es `!isCredit`, NO llamamos a `createDebt` en absoluto. El `useExpenses` guardaría `payment_method: 'cash'` o `other`. La tabla `expenses` recibirá su registro base.
- Ejecutar y probar el flujo de creación en front-end evitando duplicados.
