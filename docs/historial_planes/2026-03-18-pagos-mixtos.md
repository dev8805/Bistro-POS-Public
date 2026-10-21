# Plan de Implementación: Pagos Mixtos / Divididos

> [!NOTE]
> **Actualización (2026-06-17).** El valor guardado en `orders.payment_method` para
> una venta dividida quedó como `'mixed'` (no `'Mixto'` ni `'other'`), para no
> confundirla con el método de pago real "Otro". Además se corrigió su clasificación
> en el reporte de cierre, el reporte por empleado y el dashboard (cada parte se
> reparte a su método real), y se completó el soporte offline. Detalle en
> [`2026-06-17-fix-pago-dividido-clasificacion.md`](./2026-06-17-fix-pago-dividido-clasificacion.md).

**Objetivo:** Permitir a los usuarios dividir el pago de una venta entre múltiples métodos de pago, ingresando montos específicos por método hasta alcanzar el total exacto. Durante este modo no se manejará cambio/vuelto y la interfaz se limpiará de opciones individuales para lucir organizada. Los pagos deben impactar el historial y la caja desglosando cada método por separado.
**Arquitectura:** Se añadirá una columna JSONB a la base de datos (Supabase) para almacenar los pagos divididos. La interfaz tendrá un botón de "Pago Mixto" que ocultará los métodos normales y revelará una lista (input por cada método configurado). Al finalizar la venta, la lógica separará el monto en la caja registradora. En las facturas térmicas y la pantalla de ventas, se desglosarán dichos pagos.
**Tech Stack:** React, TypeScript, Supabase, React-PDF.

---

### Tarea 1: Base de Datos y Tipos (`types/index.ts`)
**Archivos:**
- Modify: `types/index.ts`
- Comandos SQL: Ejecutar script SQL de migración en Supabase.

**Pasos:**
1. Crear una sentencia SQL para agregar a la tabla `sales` de Supabase: `ALTER TABLE sales ADD COLUMN split_payments JSONB`.
2. Extender el tipo `TransactionDetails` para incluir la propiedad `splitPayments?: { method: string, amount: number }[]`.
3. Extender el tipo `ReceiptData` para que incluya `splitPayments?: { method: string, amount: number }[]`.
4. Extender el tipo `Order` para agregar `split_payments?: { method: string, amount: number }[]`. Cuando exista esta propiedad, sabremos que es un pago compuesto.

### Tarea 2: Interfaz en `PaymentSidebar.tsx`
**Archivos:**
- Modify: `components/PaymentSidebar.tsx`

**Pasos:**
1. Agregar una nueva pestaña o un botón toggle visible arriba o junto a la sección de métodos llamado "Pago Mixto" (`isMixedPayment` state).
2. Si `isMixedPayment` es verdadero, ocultar el grid de métodos individuales (`Efectivo`, `Nequi`, etc.) y ocultar la sección de "Efectivo Recibido / Cambio".
3. En su lugar, desplegar una lista de Inputs (uno por cada método configurado en `paymentMethods`). El estado principal será `const [mixedAmounts, setMixedAmounts] = useState<Record<string, string>>({})`.
4. Mostrar un indicador visual del "Restante" (`Restante = Total - Sumatoria(mixedAmounts)`).
5. Deshabilitar el botón "Finalizar Venta" hasta que el "Restante" sea exactamente 0 (no se manejará vuelto en este modo).
6. Construir y enviar el array `splitPayments` a la función `onProcessPayment`.

### Tarea 3: Interfaz en `PaymentScreen.tsx` (Móvil/Numpad)
**Archivos:**
- Modify: `screens/PaymentScreen.tsx`

**Pasos:**
1. Replicar la misma lógica visual de `PaymentSidebar`: un toggle para "Pago Mixto" que oculta los botones individuales.
2. Al estar en "Pago Mixto", mostrar filas con el nombre del método (ej. "Nequi") y un campo que actuará como `activeInput` para el teclado numérico (`Numpad`). El usuario toca la fila "Nequi", y digita la cantidad. Luego toca "Efectivo" y digita el resto.
3. Mostrar claramente el monto faltante/restante en la pantalla.
4. Deshabilitar confirmación de pago si la suma no es **exactamente** igual al `finalTotal`.

### Tarea 4: Lógica de Registro (Caja y Órdenes)
**Archivos:**
- Modify: `hooks/useOrders.ts` (O donde la app suba los datos a `sales`).

**Pasos:**
1. Al recibir `transactionDetails.splitPayments`, asignar a la tabla `sales`: `payment_method = 'Mixto'` y `split_payments = JSON.stringify(transactionDetails.splitPayments)`.
2. Modificar la función que registra la venta en la tabla `cash_movements` (Registro de caja). En lugar de registrar un solo movimiento por el total, hacer un `forEach` al arreglo `splitPayments` e insertar una fila/movimiento en la caja por cada entrada (ej. un ingreso por `$15.000` con `payment_method = 'Efectivo'` y un ingreso por `$5.000` con `payment_method = 'Nequi'`). Esto garantizará que los totales de cuadre de caja (`useCashRegister`) concuerden de maravilla automáticamente.

### Tarea 5: Comprobantes y PDF (`ReceiptThermalPDF.tsx` & `thermalPrinterService.ts`)
**Archivos:**
- Modify: `lib/thermalPrinterService.ts`
- Modify: `components/ReceiptThermalPDF.tsx`

**Pasos:**
1. Dentro del render de la factura, buscar si existe `data.splitPayments`.
2. Ocultar la fila general de `Método de pago: Mixto` y en su lugar, mapear el arreglo mostrando por ejemplo:
   - `Efectivo  :  $15.000`
   - `Nequi     :   $5.000`
3. Omitir las líneas de devueltas (Cambio) si es Pago Mixto, ya que por regla de tu negocio aquí no genera vuelto.

### Tarea 6: Visualización en el Historial (`SalesScreen.tsx`)
**Archivos:**
- Modify: `screens/SalesScreen.tsx`

**Pasos:**
1. En el panel izquierdo de historial de ventas, el *badge* del método dirá "Mixto" (quiza con un color distintivo).
2. En el panel derecho de detalles, reemplazar la sección "Total Pagado (1 solo método)" por un desglose iterativo de la columna `split_payments`.

---

**Nota:** El plan respeta la directriz de mantener los diseños simples "ocultando lo que no se necesita", omitir los cambios/devueltas en este modo de pago, y ajustar de forma contable la caja separando los registros por método. 

**¿Puedo comenzar a ejecutar SQLs y los pasos uno a uno?**
