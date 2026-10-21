# Arquitectura: Módulo de Personal, Pagos con Conceptos Dinámicos e Historial Unificado

Este documento detalla la arquitectura técnica, las decisiones de diseño, el modelo de datos y el flujo operativo del módulo de **Personal, Registro de Pagos a Colaboradores, Conceptos Dinámicos, Salida de Caja y Métodos de Pago Divididos** en Bistro POS.

---

## 1. Visión General y Objetivos del Módulo

El módulo unifica y simplifica el flujo financiero entre el negocio y sus colaboradores (meseros, cocineros, administradores, etc.), con base en las siguientes reglas operativas:

1. **Detección Previa de Turno y Control de Salida de Dinero (`¿El dinero sale de caja?`):**
   - Antes de mostrar los métodos de pago, el sistema detecta si existe un turno de caja abierto (`activeShift`).
   - **Con turno abierto:** El selector `[ Sí ]` / `[ No ]` inicia sin selección previa (`null`) y los métodos de pago permanecen **ocultos** hasta que el usuario decida si el egreso saldrá de la caja activa.
   - **Si elige "Sí":** Se revelan los métodos de pago. Únicamente el efectivo físico descuenta del saldo de la caja registradora (`cash_movements`). Valida disponibilidad de efectivo y alerta si es insuficiente.
   - **Si elige "No":** Se revelan los mismos métodos de pago, pero operan como registro meramente informativo/contable (fondos externos). **Nada** de lo que elija descuenta de la caja ni afecta las ventas del turno.
   - **Sin turno abierto:** Se despliega el aviso institucional: *"Sin caja abierta: Este pago no se registrará en ningún turno ni afectará arqueos de caja."* Los métodos de pago se presentan directamente en modo administrativo sin bloquear al usuario.

2. **Afectación de Caja Exclusiva por Efectivo y Soporte de Pago Dividido:**
   - Los métodos electrónicos (Nequi, Daviplata, Tarjetas, Transferencias) **nunca** descuentan de las ventas o ingresos del turno en la caja física.
   - Incorpora la opción **Dividir pago** tanto en `ExpenseRegister.tsx` como en `PayrollPaymentModal.tsx`.
   - En un pago dividido, el sistema calcula de forma estricta la porción asignada a `Efectivo` (`cash_amount`), y solo ese valor exacto genera un movimiento de egreso en `cash_movements`.

3. **Conceptos de Pago Flexibles y Dinámicos:**
   - En lugar de botones fijos ("Turno", "Vale", "Sueldo"), el usuario cuenta con `PayrollConceptDropdown.tsx`, permitiendo seleccionar, crear nuevos conceptos (ej. "Horas Extra", "Propina", "Bono"), renombrarlos o eliminarlos en tiempo real. Se almacenan en `businesses.payroll_concepts`.

4. **Registro y Edición Rápida de Colaboradores:**
   - Formulario depurado y profesional: se eliminó el campo de tarifa/turno para mantener el registro directo.
   - Selector dinámico de cargo/función (`EmployeeRoleDropdown.tsx`) con opción de crear nuevos cargos en la base de datos (`employee_roles`), placeholder inicial "Elegir" y validación para habilitar el guardado únicamente al completar nombre y cargo como mínimo.

5. **Historial Unificado y Trazabilidad:**
   - Identificación visible del colaborador en los movimientos del historial.
   - Líneas divisorias de movimientos más notorias, limpias y profesionales.
   - Visor Lightbox a pantalla completa para evidencias fotográficas y comprobantes firmados.
   - Resumen numérico completamente responsivo para dispositivos móviles (`TOTAL A PAGAR: $X COP`).

---

## 2. Diagrama de Flujo del Pago a Personal

```
                    [ REGISTRO DE PAGO A PERSONAL ]
          (Desde Módulo de Gastos O desde Ficha de Colaborador)
                                   │
                                   ▼
        ┌────────────────────────────────────────────────────────┐
        │  1. Evidencia Fotográfica (useImageUpload -> Storage)  │
        │  2. Colaborador Seleccionado (employees)               │
        │  3. Concepto Seleccionado (PayrollConceptDropdown)     │
        │  4. Monto a Pagar ($)                                  │
        │  5. Notas u Observaciones                              │
        └────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                      ¿Hay turno de caja activo?
                                ├── NO ──> [ Modo Sin Turno: No altera arqueo ]
                                │          (Muestra métodos en modo informativo)
                                └── SÍ ──> [ ¿El dinero sale de caja? ]
                                                ├── NO ──> [ Fondos externos ]
                                                │          (Muestra métodos informativos)
                                                └── SÍ ──> [ Salida de Caja Activa ]
                                   │
                                   ▼
                [ Seleccionar Método Único O Dividir Pago ]
                                   │
                                   ▼
          ¿El método incluye Efectivo y sale de caja activa?
               ├── SÍ ──> [ Validar disponible en cajón ]
               │          (Alerta si cash_amount > availableCash)
               └── NO ──> [ Continuar sin bloqueo de caja ]
                                   │
                                   ▼
                       [ settlePayrollPayment ]
                                   │
                                   ▼
                      [ expenses (Gasto Nómina) ]
                      - gross_amount: Monto
                      - net_amount: Monto
                      - payroll_concept: Concepto elegido
                      - payment_method: Método o 'Dividido'
                      - receipt_url: URL foto comprobante
                      - employee_id: UUID Colaborador
                                   │
                                   ▼
              ¿deductFromCashRegister && cash_amount > 0?
               ├── SÍ ──> [ cash_movements (Egreso en Caja) ]
               │          - type: 'expense'
               │          - amount: cash_amount (solo efectivo físico)
               │          - shift_id: activeShift.id
               └── NO ──> [ Omitir cash_movements (Cero impacto en turno) ]
```

---

## 3. Modelo de Datos en Supabase (PostgreSQL)

### A. Tabla `public.businesses`
```sql
ALTER TABLE public.businesses
ADD COLUMN IF NOT EXISTS payroll_concepts text[] DEFAULT ARRAY['Sueldo', 'Vale', 'Turno', 'Horas Extra']::text[];
```
Permite a cada negocio personalizar libremente su lista de conceptos de nómina y pagos en tiempo real.

### B. Tabla `public.employee_roles`
Permite crear y persistir dinámicamente nuevos cargos o funciones por negocio:
* `id` (`uuid`): Identificador único.
* `business_id` (`uuid`): Referencia al negocio.
* `name` (`text`): Nombre del cargo (ej. "Pizzero", "Cajero", "Mesero", "Bartender").

### C. Tabla `public.expenses` (Gastos y Pagos a Personal)
Almacena el registro contable del egreso:
* `employee_id` (`uuid`): Referencia al colaborador en `public.employees`.
* `payroll_concept` (`varchar(50)`): Concepto libre seleccionado por el usuario.
* `gross_amount` (`numeric(12,2)`): Monto registrado.
* `net_amount` (`numeric(12,2)`): Monto liquidado al colaborador.
* `payment_method` (`text`): Método utilizado ('cash', 'transfer', 'nequi', 'card' o 'Dividido').
* `receipt_url` (`text`): URL pública de la evidencia fotográfica en Supabase Storage (`business-assets/payroll/`).
* `notes` (`text`): Observaciones adicionales escritas por el cajero (incluye desglose si fue dividido).

### D. Tabla `public.cash_movements` (Movimientos de Efectivo en Caja)
Solo se inserta si `deductFromCashRegister === true`, `cash_amount > 0` y `activeShiftId` existe:
* `shift_id` (`uuid`): Turno de caja activo.
* `type` (`text`): `'expense'`.
* `amount` (`numeric(12,2)`): Porción física de efectivo a entregar.
* `payment_method` (`text`): Siempre `'cash'`.

---

## 4. Componentes y Capas de Código

```
Bistro/
├── context/
│   └── BusinessSettingsContext.tsx   <-- Sincroniza payrollConcepts con Supabase y localStorage
├── hooks/
│   ├── useEmployeesDirectory.ts      <-- settlePayrollPayment con cálculo de cash_amount y split_details
│   └── useImageUpload.ts             <-- Compresión WebP, subida a Storage y markAsSaved()
├── components/
│   ├── payroll/
│   │   ├── PayrollConceptDropdown.tsx <-- Dropdown dinámico con creación/edición de conceptos
│   │   ├── EmployeeRoleDropdown.tsx   <-- Dropdown de cargos/funciones con creación y guardado en BD
│   │   └── PayrollStaffView.tsx       <-- Tarjetas de colaboradores con "Registrar Pago" e historial
│   ├── modals/
│   │   ├── PayrollPaymentModal.tsx    <-- Modal con selector previo de caja, división de pago y recibo térmico
│   │   ├── EmployeeAdvancesListModal.tsx <-- Historial unificado con divisorias notorias y Lightbox
│   │   └── EmployeeModal.tsx          <-- Registro de colaborador con rol dinámico sin campo tarifa/turno
│   └── expense/
│       └── ExpenseRegister.tsx        <-- Drawer de gastos con flujo completo de personal y salida de caja
└── lib/
    ├── paymentMethods.ts              <-- Traducción canónica de métodos de pago a español nativo
    └── printReceiptService.ts         <-- Impresión térmica de comprobantes de nómina y vales
```

---

## 5. Decisiones Técnicas y Buenas Prácticas

1. **Estado Inicial Neutro (`null`) en Salida de Caja:**
   - `payrollDeductFromCash` y `deductFromCash` inician en `null` para obligar al usuario a tomar una decisión explícita antes de ver o manipular los métodos de pago.
   - Los métodos de pago se montan condicionalmente mediante `{(!activeShift || payrollDeductFromCash !== null) && (...) }`, garantizando una interfaz libre de ambigüedades.

2. **Cálculo Numérico Estricto para Pagos Divididos:**
   - La función interna `parseNumericValue` procesa cadenas formateadas en moneda local asegurando que las sumas de los métodos coincidan exactamente con el total del neto devengado (`payrollSplitRemaining === 0`).
   - Si no cuadra la suma de la división de pagos, el botón de confirmación se deshabilita con mensaje explicativo.

3. **Aislamiento de Ventas del Turno ante Métodos Digitales:**
   - Bajo ninguna circunstancia los pagos de nómina en Nequi, Daviplata, Tarjeta o Transferencia descuentan de los acumulados de ventas del turno en el POS.
   - Solo el saldo del cajón físico (`balances.cash`) es verificado y afectado si el usuario indicó que el dinero sale de caja.

4. **Redacción Ejecutiva y Didáctica en Interfaz:**
   - Textos orientados al usuario no técnico con precisión contable:
     - *"Sin caja abierta: Este pago no se registrará en ningún turno ni afectará arqueos de caja."*
     - *"Fondos externos: No se registrará en este turno ni afectará el arqueo de caja."*
     - *"El egreso se descontará de 'Caja física' (únicamente en efectivo)."*

5. **Cierre Preventivo del Teclado Táctil en Móviles (`dismissKeyboard`):**
   - En dispositivos móviles táctiles, cuando el usuario pulsa los botones `[ Sí ]` / `[ No ]` de salida de caja o alterna entre métodos (`[ Dividir pago ]` / `[ Método único ]`), el evento táctil temprano `onPointerDown` invoca `document.activeElement.blur()`.
   - Esto desenfoca de inmediato cualquier campo numérico o de texto previo (monto, concepto u observaciones), evitando que el teclado virtual de Android/iOS se mantenga abierto, salte o se reabra durante el re-renderizado reactivo del formulario.
