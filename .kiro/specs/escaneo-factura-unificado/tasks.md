# Implementation Plan: Escaneo de Factura Unificado

## Overview

El plan implementa el Escaneo_Unificado de abajo hacia arriba: primero la lógica pura de `lib/invoiceScan/*` (sin dependencias, testeable de inmediato), luego la base de datos (extensión del CHECK de `cash_movements`, tabla `register_idempotency` y los dos motores RPC transaccionales), luego el hook propietario `useInvoiceScanDraft`, los componentes de paso, la edge function `scan-invoice-unified`, el cableado del menú de entrada, la migración del `Flujo_Manual_Compra` al motor compartido y, por último, la eliminación del código de la Fórmula_Costo.

Lenguaje de implementación: **TypeScript** (React 19 + Vite) para el frontend, **PL/pgSQL** para los motores RPC y **Deno/TypeScript** para la edge function. Pruebas con **Vitest 4** (`npm run test`) y **fast-check 4** para las pruebas por propiedades.

Tres tareas tocan zonas de riesgo y exigen explicar al usuario el cambio con un ejemplo concreto antes de ejecutarlo: la migración del CHECK de `cash_movements` (2.1), la creación de las funciones `SECURITY DEFINER` (2.3 y 2.4) y la migración del flujo manual de compra (9.1).

## Task Dependency Graph

```
Wave 0  1.1 types        2.1 CHECK cash_movements    2.2 register_idempotency    6.1 edge scan-invoice-unified
          │                      │                            │                          │
          ├─→ Wave 1  1.2 numbers · 1.4 discount · 1.6 unitMatch · 1.9 productMatch · 1.11 supplierMatch · 1.17 arbitraries
          │              2.3 register_purchase · 2.4 register_expense  (dependen de 2.1 + 2.2)
          │                      │
          ├─→ Wave 2  1.13 scanResponse · 1.14 buildPurchasePayload · 1.16 buildExpensePayload · 2.5 endurecimiento
          │              1.3* 1.5* 1.7* 1.8* 1.10* 1.12*  (propiedades de la lógica pura)
          │                      │
          └─→ Wave 3  4.1 hook (máquina de estados) · 5.1 ScanStepShell · 1.15* · 6.2*
                         2.6* 2.7* 2.8* 2.9* 2.10* 2.11*  (propiedades del motor, rama de BD)
                              │
     Wave 4  4.2 hook captura+escaneo   5.2 … 5.7 componentes de paso (en paralelo)
                              │
     Wave 5  4.3 hook resolución de líneas   5.8 InvoiceScanScreen (host)
                              │
     Wave 6  4.4 hook finalize   5.9* fronteras de import   5.11* render y a11y
                              │
     Wave 7  4.5* 4.6* 4.7* (propiedades del hook)   5.10* Property 18   7.1 ExpenseActionsMenu
                              │
     Wave 8  7.2 integrar el menú en 4 pantallas   9.1 InventoryPurchase → register_purchase (online)
                              │
     Wave 9  9.2 cola offline + syncInventoryPurchase   7.3* pruebas del menú
                              │
     Wave 10 9.3* snapshots de payload   9.4* Property 5   10.1 quitar evaluateCostFormula
                              │
     Wave 11 10.2 borrar CostFormulaBuilder/InvoiceConfigPanel   10.3 useSuppliers   10.4 edge generate-cost-formula
                              │
     Wave 12 10.5* prueba estructural del símbolo eliminado
                              │
     Wave 13 11.1 build + suite   11.2 smoke de seguridad   11.3 paridad del flujo manual
```

```json
{
  "waves": [
    {
      "id": 0,
      "wave": 0,
      "tasks": ["1.1", "2.1", "2.2", "6.1"],
      "description": "Base sin dependencias: tipos del borrador, migraciones de esquema y la edge function nueva"
    },
    {
      "id": 1,
      "wave": 1,
      "tasks": ["1.2", "1.4", "1.6", "1.9", "1.11", "1.17", "2.3", "2.4"],
      "description": "Módulos puros independientes entre sí, generadores de pruebas y los dos motores RPC"
    },
    {
      "id": 2,
      "wave": 2,
      "tasks": ["1.3", "1.5", "1.7", "1.8", "1.10", "1.12", "1.13", "1.14", "1.16", "2.5"],
      "description": "Constructores de payload, normalizador de respuesta, endurecimiento de permisos y propiedades de la lógica pura"
    },
    {
      "id": 3,
      "wave": 3,
      "tasks": ["1.15", "2.6", "2.7", "2.8", "2.9", "2.10", "2.11", "4.1", "5.1", "6.2"],
      "description": "Propiedades del motor en rama de base de datos, máquina de estados del hook y chrome común de la UI"
    },
    {
      "id": 4,
      "wave": 4,
      "tasks": ["4.2", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7"],
      "description": "Captura y escaneo en el hook, y los componentes de paso en paralelo (un archivo cada uno)"
    },
    {
      "id": 5,
      "wave": 5,
      "tasks": ["4.3", "5.8"],
      "description": "Orquestación de la resolución de líneas y el host que cablea los pasos"
    },
    {
      "id": 6,
      "wave": 6,
      "tasks": ["4.4", "5.9", "5.11"],
      "description": "Finalizacion_Registro en el hook y pruebas estructurales y de render del flujo"
    },
    {
      "id": 7,
      "wave": 7,
      "tasks": ["4.5", "4.6", "4.7", "5.10", "7.1"],
      "description": "Propiedades del hook, propiedad de permisos y el componente compartido del menú de acciones"
    },
    {
      "id": 8,
      "wave": 8,
      "tasks": ["7.2", "9.1"],
      "description": "Cableado del menú en las cuatro pantallas y migración del camino online del flujo manual"
    },
    {
      "id": 9,
      "wave": 9,
      "tasks": ["7.3", "9.2"],
      "description": "Migración del camino offline del flujo manual y pruebas del menú"
    },
    {
      "id": 10,
      "wave": 10,
      "tasks": ["9.3", "9.4", "10.1"],
      "description": "Verificación de paridad del payload y retiro de la evaluación de la fórmula en el panel de revisión"
    },
    {
      "id": 11,
      "wave": 11,
      "tasks": ["10.2", "10.3", "10.4"],
      "description": "Eliminación de los componentes, tipos y edge function de la Fórmula_Costo"
    },
    {
      "id": 12,
      "wave": 12,
      "tasks": ["10.5"],
      "description": "Prueba estructural que confirma que el símbolo eliminado ya no existe en el repositorio"
    },
    {
      "id": 13,
      "wave": 13,
      "tasks": ["11.1", "11.2", "11.3"],
      "description": "Verificación final: build, suite completa, smoke de seguridad y paridad del flujo manual"
    }
  ]
}
```

## Tasks

- [ ] 1. Lógica pura de `lib/invoiceScan/`

  - [x] 1.1 Crear `lib/invoiceScan/types.ts` con los tipos del borrador y de los payloads
    - Definir `ScanDestination`, `ScanDraft`, `ScanLine`, `NewProductDraft`, `PaymentDraft` tal como los describe la sección Data Models del diseño
    - Definir `RegisterPurchasePayload` y `RegisterExpensePayload` con el campo `v: 1`, `idempotency_key`, `business_id`, `source` y la estructura de `lines` y `payment`
    - Definir `ScanStep` (unión de los 15 pasos de la máquina de estados) y `UseInvoiceScanDraft`
    - Definir el tipo de la respuesta cruda de la edge function (`header`, `document`, `items`) y el tipo de error `RegisterErrorCode` con los nueve códigos de la tabla de errores
    - Resultado esperado: el módulo compila sin importar React ni `supabase`
    - _Requirements: 9.15, 12.1, 3.12_

  - [x] 1.2 Crear `lib/invoiceScan/numbers.ts`
    - `parseLatinNumber(input: string | number | null): number` que interpreta el Formato_Numerico_Latino (punto = miles, coma = decimales) y devuelve `0` ante entradas no numéricas
    - `toPesos(value: number): number` que redondea a entero (Colombia opera sin centavos)
    - `splitProportional(total: number, weights: number[]): number[]` con método del resto mayor y desempate determinista por (fracción desc, peso desc, índice asc)
    - Resultado esperado: `splitProportional` devuelve enteros cuya suma es exactamente `total`
    - _Requirements: 3.3, 3.6_

  - [ ]* 1.3 Prueba de propiedad del formato numérico latino
    - **Property 9: Round-trip del formato numérico latino**
    - **Validates: Requirements 3.3**

  - [x] 1.4 Crear `lib/invoiceScan/discount.ts`
    - `distributeGlobalDiscount(discount: number, netTotals: number[]): number[]` que acota el descuento a `min(D, ΣnetTotals)`, reparte de forma proporcional con `splitProportional` y garantiza `0 ≤ share_i ≤ net_i`
    - Devolver un arreglo de ceros cuando `discount ≤ 0` o `ΣnetTotals ≤ 0`
    - Resultado esperado: líneas con netos iguales reciben partes iguales
    - _Requirements: 3.4, 3.5_

  - [ ]* 1.5 Prueba de propiedad del reparto del descuento global
    - **Property 4: El reparto del descuento global suma exactamente el descuento**
    - **Validates: Requirements 3.5**

  - [x] 1.6 Crear `lib/invoiceScan/unitMatch.ts`
    - `normalizeUnit(u: string): string` con la Comparacion_Unidad: minúsculas, sin acentos (NFD + strip diacríticos), sin espacios extremos ni internos repetidos, quita `-es` final si la cadena tiene más de 4 caracteres y `-s` final si tiene más de 3
    - `detectUnitCase(ocrUnit: string, product: ProductWithPurchaseUnits)` que devuelve `'none' | 'sale' | 'known' | 'unknown'` junto con el `conversionFactor` cuando el caso es `known`
    - `applyUnitConversion(ocrQuantity: number, ocrLineTotal: number, factor: number)` que devuelve `{ quantity, unitCost, lineTotal }` conservando `lineTotal` intacto y derivando `unitCost = lineTotal / quantity`
    - Resultado esperado: la misma normalización se aplica en los cuatro casos de detección
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.14, 9.18_

  - [ ]* 1.7 Prueba de propiedad de la Comparacion_Unidad
    - **Property 8: La Comparacion_Unidad es idempotente e invariante**
    - **Validates: Requirements 9.5, 9.6, 9.3, 9.4**

  - [ ]* 1.8 Prueba de propiedad de la conversión de unidad
    - **Property 3: La conversión de unidad conserva el total de la línea**
    - **Validates: Requirements 9.1, 9.2, 9.18**

  - [x] 1.9 Crear `lib/invoiceScan/productMatch.ts`
    - `matchProductLine(ocrName: string, products: Product[])` con la cascada de cuatro niveles: apodo exacto, apodo parcial con resultado único, nombre exacto, nombre parcial con resultado único
    - Un nivel con más de un candidato no resuelve: pasa al siguiente y, si ninguno da resultado único, devuelve `null`
    - Filtrar la entrada a `type === 'simple'` (los insumos son destino válido; `processed` y `service` no)
    - Resultado esperado: la función nunca hace fetch; recibe el catálogo del Negocio_Activo ya cargado
    - _Requirements: 6.1, 6.2, 8.7, 17.2_

  - [ ]* 1.10 Prueba de propiedad de la cascada de producto
    - **Property 10: Cascada de emparejamiento de producto**
    - **Validates: Requirements 6.1, 6.2, 8.7**

  - [x] 1.11 Crear `lib/invoiceScan/supplierMatch.ts`
    - `matchSupplierHeader(header, suppliers)` que devuelve `{ kind: 'confirmed', supplier }`, `{ kind: 'new', name, nit }` o `{ kind: 'manual' }`
    - Reusar `normNit` y `norm` de `components/expense/scanExpense.logic.ts` en lugar de reimplementar la normalización
    - Orden: coincidencia por NIT normalizado, luego por nombre normalizado, luego proveedor nuevo, y `manual` cuando el encabezado llega sin nombre y sin NIT
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 11.7, 17.1_

  - [ ]* 1.12 Prueba de propiedad de la cascada de proveedor
    - **Property 11: Cascada de emparejamiento de proveedor**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 11.7**

  - [~] 1.13 Crear `lib/invoiceScan/scanResponse.ts` (normalizador de la respuesta de la edge function)
    - `normalizeScanResponse(raw: unknown)` que tolera `items` ausente, `document` ausente, campos `null`, números en formato latino y `quantity` en `0`
    - Recalcular `lineNetTotal` cuando es incoherente con `lineSubtotal + lineTax − lineDiscount`, y derivar `unitValue = lineNetTotal / quantity` cuando falta el unitario
    - Asignar `quantity = 1` y `needsReview = true` cuando la cantidad es ilegible (`0`, `null` o `NaN`)
    - Devolver `ScanLine[]` con `globalDiscountShare` ya calculado con `distributeGlobalDiscount`
    - _Requirements: 3.2, 3.3, 3.6, 3.7, 3.12, 3.5_

  - [~] 1.14 Crear `lib/invoiceScan/buildPurchasePayload.ts`
    - `buildPurchasePayload(draft: ScanDraft, opts: { source: 'scan' | 'manual'; businessId: string; evidenceUrl: string | null })`
    - Excluir las líneas con `decision.kind === 'skipped'` y las quitadas en el Panel_Revision
    - Emitir `purchase_unit` solo cuando `createPurchaseUnit` es `true`, con `unit_name` = `normalizeUnit(ocrUnit)` y `conversion_factor` confirmado
    - Emitir `new_price` solo cuando el usuario editó el precio de venta; nunca emitir `cost` de productos existentes
    - Repartir el abono inicial y el monto de cada método de pago entre líneas con `splitProportional`
    - _Requirements: 12.4, 6.7, 6.12, 8.4, 9.12, 10.4, 17.7, 3.11_

  - [ ]* 1.15 Prueba de propiedad de las líneas omitidas
    - **Property 12: Las líneas omitidas quedan fuera del registro**
    - **Validates: Requirements 6.7, 6.12**

  - [~] 1.16 Crear `lib/invoiceScan/buildExpensePayload.ts`
    - `buildExpensePayload(draft, opts)` que emite `amount`, `description`, `category`, `expense_date`, `receipt_url`, proveedor (existente o nuevo) y el bloque `payment`
    - Validar antes de emitir: `amount > 0`, categoría no vacía, `expense_date` no posterior al día actual en `America/Bogota` (reusar la utilidad de zona horaria de `lib/`)
    - _Requirements: 11.5, 11.6, 12.4, 17.5, 17.7_

  - [ ]* 1.17 Crear los generadores compartidos de fast-check
    - Archivo `test/arbitraries/invoiceScanArbitraries.ts` siguiendo el patrón de los generadores existentes en `test/arbitraries/`
    - Exportar `arbUnitName`, `arbScanLine`, `arbDraft`, `arbPurchasePayload`, `arbPaymentDraft`, `arbCatalog`
    - Cubrir de forma explícita los casos borde: cantidad ilegible, `ocr_unit` vacía, Descuento_Global mayor que el total, un solo ítem, 40 ítems, factor decimal, nombres con acentos y `ñ`, NIT con puntos y guiones, apodo ya existente en el mismo y en otro producto
    - _Requirements: 3.12, 9.15, 9.18_

- [ ] 2. Base de datos: migraciones y motores RPC transaccionales

  - [x] 2.1 Migración: extender el CHECK de `cash_movements.reference_type` para admitir `'purchase'`
    - **Antes de ejecutar, explicar al usuario con un ejemplo concreto** qué hace este cambio y qué riesgo tiene: hoy el CHECK solo permite `('order','expense','sale_refund',NULL)`, por lo que el INSERT del movimiento de caja de una compra falla en silencio y el egreso no queda registrado (en la base no existe ni un solo `cash_movements` de tipo `purchase`). Mostrar el ejemplo de una compra de $240.000 pagada en efectivo cuyo movimiento hoy se pierde y mañana quedará referenciado al lote. Advertir que el cambio es un `DROP CONSTRAINT` + `ADD CONSTRAINT` sobre una tabla con más de 2400 filas y que revertirlo requiere otra migración. **Esperar confirmación explícita antes de aplicarla.**
    - Crear la migración con `DROP CONSTRAINT cash_movements_reference_type_check` y `ADD CONSTRAINT` con la lista ampliada a `('order','expense','sale_refund','purchase')`, admitiendo `NULL`
    - Verificar con MCP (`list_migrations`, consulta a `pg_constraint`) que la restricción quedó aplicada
    - _Requirements: 10.7, 15.5, 16.7_

  - [x] 2.2 Migración: crear la tabla `register_idempotency`
    - Columnas `key uuid PRIMARY KEY`, `business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE`, `operation text CHECK (operation IN ('purchase','expense'))`, `result jsonb`, `created_at timestamptz DEFAULT now()`
    - `ENABLE ROW LEVEL SECURITY` con una única política `FOR SELECT USING (business_id = public.get_user_business_id())`; sin `INSERT`/`UPDATE` para `authenticated` (la escritura es exclusiva de los motores `SECURITY DEFINER`)
    - Índice `register_idempotency_created_at_idx` sobre `created_at` y purga de filas con más de 30 días en la limpieza programada existente
    - _Requirements: 12.9, 15.7, 17.13_

  - [x] 2.3 Crear la función `public.register_purchase(p_payload jsonb) RETURNS jsonb`
    - **Antes de ejecutar, explicar al usuario con un ejemplo concreto** qué significa `SECURITY DEFINER`: la función corre con los privilegios de quien la creó, no de quien la llama, así que un usuario `Cajero` con `inv_purchase` podrá insertar en `products` aunque la política de escritura de esa tabla exija `is_admin()`. Mostrar el ejemplo del riesgo: si la función olvidara un `WHERE business_id = v_business`, ese cajero podría tocar filas de otro negocio, porque la RLS no lo detiene dentro de la función. Explicar las tres defensas que se aplican (`SET search_path = public`, derivación del negocio con `get_user_business_id()` y validación de `business_id` del payload) y por qué `SECURITY INVOKER` no es viable. **Esperar confirmación explícita antes de crearla.**
    - `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`
    - Implementar en el orden descrito en el diseño: derivación del negocio, `business_mismatch`, verificación de `current_user_has_permission('inv_purchase')`, validación del payload, inserción de la clave de idempotencia, proveedor, turno y saldo, y luego por línea: producto, apodo con `array_append` solo si no existe normalizado, `product_purchase_units` solo si la unidad normalizada no existe, precio de venta, lote con `SELECT ... FOR UPDATE`, stock, deuda; después el abono inicial y los movimientos de caja con `reference_type = 'purchase'`
    - Devolver `{"ok": true, ...}` con los ids creados, o `{"ok": false, "code": ..., "message": ...}` sin escrituras
    - _Requirements: 10.7, 12.2, 12.4, 12.7, 14.2, 14.3, 16.7, 17.7, 17.8, 17.10, 8.4, 9.12, 9.13, 9.14, 10.4_

  - [x] 2.4 Crear la función `public.register_expense(p_payload jsonb) RETURNS jsonb`
    - **Antes de ejecutar, aplicar la misma explicación de `SECURITY DEFINER` de la tarea 2.3** con un ejemplo propio del gasto (una categoría de otro negocio que no debe poder reutilizarse) y **esperar confirmación explícita**
    - Mismos pasos 0 a 4 que `register_purchase`; validaciones propias: `amount > 0`, categoría no vacía, `expense_date` no posterior a hoy en `America/Bogota`, crédito con `due_date`, `Σ métodos ≤ amount`
    - Resolver la categoría por `(business_id = v_business, upper(name))` y crearla con el negocio de la sesión cuando no existe
    - Insertar en `expenses`, luego la fila de `business_debts` (crédito o trazabilidad de contado) y los `cash_movements` con `reference_type = 'expense'`
    - No escribir en ninguna tabla `debts`: se confirmó que no existe en la base (Hallazgo 1); las deudas con proveedor viven en `business_debts`
    - _Requirements: 11.5, 11.6, 12.2, 12.4, 12.7, 17.5, 17.7, 17.9, 17.11_

  - [~] 2.5 Endurecer los permisos de ejecución de los dos motores
    - `REVOKE EXECUTE ON FUNCTION public.register_purchase(jsonb), public.register_expense(jsonb) FROM PUBLIC, anon`
    - `GRANT EXECUTE ... TO authenticated, service_role`, siguiendo el patrón de las migraciones `20260728044831` y `20260728045346`
    - Verificar con MCP que `proconfig` fija `search_path=public` y que `prosecdef` es verdadero en ambas funciones
    - _Requirements: 17.13_

  - [ ]* 2.6 Prueba de propiedad de atomicidad del registro
    - **Property 1: Atomicidad total del registro**
    - **Validates: Requirements 12.2, 12.4, 12.7, 16.7**

  - [ ]* 2.7 Prueba de propiedad de aislamiento por negocio
    - **Property 2: Aislamiento por negocio en lectura y escritura**
    - **Validates: Requirements 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9, 17.10, 17.11, 17.12, 17.14, 15.7**

  - [ ]* 2.8 Prueba de propiedad de idempotencia del reintento
    - **Property 6: Idempotencia del reintento**
    - **Validates: Requirements 12.8, 12.9, 13.3**

  - [ ]* 2.9 Prueba de propiedad de `product_purchase_units`
    - **Property 7: No duplicación ni alteración de filas en `product_purchase_units`**
    - **Validates: Requirements 9.12, 9.13, 9.14, 9.15, 9.16, 9.17**

  - [ ]* 2.10 Prueba de propiedad de conservación de costos y márgenes
    - **Property 13: Los costos y márgenes históricos se conservan**
    - **Validates: Requirements 3.8, 3.9, 3.10, 3.11, 10.4**

  - [ ]* 2.11 Prueba de propiedad de `invoice_config`
    - **Property 17: `invoice_config` se ignora y se conserva**
    - **Validates: Requirements 4.1, 4.3, 4.4**

- [~] 3. Checkpoint — lógica pura y motores verificados
  - Ejecutar `npm run test` y confirmar que las pruebas de `lib/invoiceScan/*` y de los motores pasan. Preguntar al usuario si surgen dudas.

- [ ] 4. Hook propietario `hooks/useInvoiceScanDraft.ts`

  - [~] 4.1 Implementar el borrador en memoria y la máquina de estados
    - Estado del `ScanDraft` con `useState`/`useRef`, sin IndexedDB ni `localStorage`
    - Generar `idempotencyKey` con `crypto.randomUUID()` al abrir el flujo
    - Implementar las transiciones del diagrama de estados, `canGoBack`, el paso previo de cada estado, `isDirty` y `requestClose()` con confirmación de descarte
    - Exponer `chooseDestination` y la firma completa de `UseInvoiceScanDraft` (los métodos aún sin cuerpo se implementan en 4.2 a 4.4)
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 12.1, 12.5, 12.6, 6.8_

  - [~] 4.2 Implementar captura, recorte y escaneo
    - `attachImage(file)` con rechazo de archivos mayores a 50 MB y de tipos que no son imagen, conservando visibles las dos fuentes
    - `confirmCrop(blob)` que comprime a 1600 px con `compressImage`, guarda el mismo blob como Evidencia y lo envía a la edge function con `blobToBase64`
    - Enrutar a `scan-invoice-unified` en la Ruta_Inventario y a `scan-expense` en la Ruta_Gasto, con `AbortController` de 45 segundos
    - `retryScan()` y `continueManual()` conservando la imagen en el borrador; tratar `items: []` y JSON malformado como escaneo fallido
    - En la Ruta_Gasto, prellenar con `resolveAmountField`, `truncateDescription`, `matchSupplier` y `resolveExpenseDate` de `scanExpense.logic.ts`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 11.1, 11.2, 17.6_

  - [~] 4.3 Implementar la resolución de proveedor, líneas y equivalencias
    - `confirmSupplier` con `matchSupplierHeader` y bloqueo de la finalización sin proveedor confirmado
    - `resolveLine` para las decisiones `link`, `create` y `skip`, `setLineEquivalence(factor)` con rechazo de valores menores o iguales a cero, y `goToPreviousLine`
    - Al vincular, detectar los tres casos de apodo (nuevo, ya presente en el mismo producto, presente en otro producto del negocio)
    - Calcular `unitCase` con `detectUnitCase`, aplicar `applyUnitConversion` y exponer `progress: { current, total }` contando solo líneas pendientes
    - `updateReviewLine`, `removeReviewLine` y la transición a `emptyPurchase` cuando todas las líneas quedan omitidas
    - _Requirements: 5.6, 5.8, 6.2, 6.3, 6.4, 6.7, 6.9, 6.10, 6.12, 8.2, 8.3, 8.5, 8.6, 9.7, 9.8, 9.9, 9.11, 9.12, 10.2, 10.3, 10.4_

  - [~] 4.4 Implementar `finalize()`
    - Subir la Evidencia con `useImageUpload(null, 'debt-evidence')` a la ruta `business_id/archivo` antes de invocar la RPC, y pasar la URL en el payload
    - Invocar `supabase.rpc('register_purchase' | 'register_expense', { p_payload })` una sola vez, con el payload construido por `buildPurchasePayload`/`buildExpensePayload`
    - Mapear los nueve `code` de error a los mensajes de la tabla de Error Handling, pasar a `submitError` conservando el borrador y permitir reintentar con la misma `idempotencyKey`
    - Camino sin conexión: detectar con `isRealOffline()`, encolar el payload en `offlineQueue` con `evidence_url = null`, avisar que el registro irá sin la foto y aplicar `pushOfflineCashMovement`
    - Al éxito, descartar el borrador y regresar a la pantalla de origen
    - _Requirements: 10.7, 10.8, 11.6, 12.3, 12.4, 12.7, 12.8, 12.9, 12.10, 13.3, 13.4, 16.5, 16.7_

  - [ ]* 4.5 Prueba de propiedad de las precondiciones de la finalización
    - **Property 14: Precondiciones de la Finalizacion_Registro**
    - **Validates: Requirements 5.8, 7.3, 9.7, 9.8, 9.9, 10.6, 11.5**

  - [ ]* 4.6 Prueba de propiedad de captura única y una línea a la vez
    - **Property 15: Una sola captura, una sola línea a la vez**
    - **Validates: Requirements 2.2, 2.5, 6.3, 6.8**

  - [ ]* 4.7 Prueba de propiedad de supervivencia de la imagen
    - **Property 16: La imagen sobrevive a cualquier fallo de escaneo**
    - **Validates: Requirements 2.7, 2.8**

- [ ] 5. Superficie de UI del escaneo

  - [~] 5.1 Crear `components/invoiceScan/ScanStepShell.tsx`
    - Chrome común: título del paso, contador "Paso i de n" / "Línea i de n", botón atrás con `aria-label="Volver al paso anterior"`, botón cerrar con `aria-label="Cerrar el escaneo"` y región `aria-live="polite"`
    - Mover el foco al encabezado al entrar a cada paso; en pasos de un solo campo, al campo
    - Paleta Warm Bistro con Tailwind: primaria `bg-amber-400 hover:bg-amber-500 text-slate-900`, superficies `bg-slate-50`, errores `rose-600`; objetivos táctiles de 44 px mínimo
    - _Requirements: 1.5, 6.4, 16.6_

  - [~] 5.2 Crear los pasos de captura: `ScanDestinationStep.tsx`, `ScanCaptureStep.tsx`, `ScanCropStep.tsx`, `ScanProcessingStep.tsx`, `ScanErrorStep.tsx`
    - `ScanDestinationStep`: exactamente dos destinos y un control para cerrar
    - `ScanCaptureStep`: cámara (`InAppCamera` en modo `fullFrame`) y galería, con el aviso del límite de 50 MB
    - `ScanCropStep`: recorte de esquinas con `DocumentCropper` y opción de volver a tomar
    - `ScanProcessingStep`: indicador con el texto del paso en curso; `ScanErrorStep`: "Reintentar" y "Continuar manual"
    - _Requirements: 1.2, 1.5, 2.1, 2.2, 2.3, 2.6, 2.7, 2.8_

  - [~] 5.3 Crear `components/invoiceScan/ScanSupplierStep.tsx`
    - Tres estados: proveedor confirmado (chip en `emerald`), proveedor nuevo con nombre y NIT editables y las acciones "Usar este proveedor" y "Buscar un proveedor existente", y selección manual obligatoria cuando el encabezado llegó vacío
    - Buscador de proveedores del Negocio_Activo con `useSuppliers`, sin abrir ningún selector externo al flujo
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 11.7, 16.3, 17.1, 17.14_

  - [~] 5.4 Crear los pasos de resolución: `ScanLineResolverStep.tsx`, `ScanQuickProductForm.tsx`, `ScanProductPickerSheet.tsx`, `ScanUnitEquivalenceForm.tsx`
    - `ScanLineResolverStep`: una línea a la vez con progreso "i de n", `Nombre_OCR`, cantidad, `Unidad_OCR`, `Costo_Neto_Linea`, una frase que explica la decisión y su efecto, las tres acciones para líneas sin coincidencia y el control de volver a la línea anterior
    - `ScanQuickProductForm`: nombre prellenado con el `Nombre_OCR`, categoría, Unidad_Venta, costo prellenado con el Costo_Neto_Linea por Unidad_Venta, precio de venta opcional y destino "Para venta"/"Insumo"; sin imagen, código de barras ni apodos; advertencia de nombre duplicado con opción de vincular
    - `ScanProductPickerSheet`: buscador por nombre y por apodo, restringido a `type = 'simple'`, con la propuesta de apodo activada por defecto
    - `ScanUnitEquivalenceForm`: pregunta que nombra la Unidad_OCR, la Unidad_Venta y el producto, con el control de continuar `disabled` y `aria-disabled` mientras el factor sea vacío o menor o igual a cero, y previsualización de la cantidad y el costo por Unidad_Venta
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.11, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.9, 7.10, 7.11, 8.1, 8.3, 8.5, 8.6, 8.7, 9.3, 9.4, 9.7, 9.8, 9.9, 9.10, 9.11, 16.1, 16.6_

  - [~] 5.5 Crear `components/invoiceScan/ScanReviewStep.tsx`
    - Tabla por línea con producto vinculado, `Nombre_OCR`, cantidad en Unidad_Venta, costo por Unidad_Venta (hasta 2 decimales, derivado) y total de línea
    - Cantidad y costo editables, control para quitar la línea, y cuando el costo difiere del catálogo: variación porcentual, margen frente al precio vigente y campo editable de precio de venta
    - Formato de moneda con `formatCurrency`/`formatWithThousands`; aviso de compra sin productos cuando no queda ninguna línea
    - _Requirements: 6.9, 6.10, 10.1, 10.2, 10.3, 10.4, 17.14_

  - [~] 5.6 Crear `components/invoiceScan/ScanPaymentStep.tsx`
    - Contado y Crédito, pregunta de descuento de caja cuando hay turno activo, selección de método de pago con pago dividido, abono inicial y fecha de vencimiento obligatoria en Crédito
    - Pre-chequeo de saldo con `useCashRegister` como aviso de UX; la autoridad es el motor
    - Botón de confirmar deshabilitado mientras las precondiciones no se cumplan
    - _Requirements: 10.5, 10.6, 16.2, 16.3_

  - [~] 5.7 Crear `components/invoiceScan/ScanExpenseFieldsStep.tsx`
    - Valor, descripción, proveedor, fecha y observación, todos editables
    - Selector de categoría con `CategoryPickerSheet` limitado a las categorías del Negocio_Activo, con opción de crear una nueva
    - Validaciones vigentes del gasto: categoría y proveedor obligatorios, fecha no posterior al día actual en la zona horaria colombiana
    - _Requirements: 11.3, 11.4, 11.5, 16.1, 17.5, 17.14_

  - [~] 5.8 Crear `screens/InvoiceScanScreen.tsx`
    - Host que consume `useInvoiceScanDraft` y renderiza el paso activo dentro de `ScanStepShell`, sin lógica de negocio propia
    - Mostrar el aviso de permiso faltante vigente y salir del flujo cuando el usuario no tiene `inv_purchase`
    - Al éxito, regresar a la pantalla de origen recibida por prop; conectar `requestClose()` con el `ConfirmDialog` de descarte
    - _Requirements: 1.7, 14.2, 14.3, 16.1, 16.3, 16.4, 16.5_

  - [ ]* 5.9 Prueba estructural de fronteras de import
    - Recorrer `screens/InvoiceScanScreen.tsx` y `components/invoiceScan/**` y fallar si aparece un import de `InventoryPurchase`, `ExpenseRegister`, `ExpenseModal`, `SimpleProductScreen`, `ProcessedProductScreen`, `ServiceProductScreen` o `InvoiceConfigPanel`
    - _Requirements: 6.11, 7.11, 16.3, 16.4_

  - [ ]* 5.10 Prueba de propiedad del conjunto único de acciones
    - **Property 18: Un único conjunto de acciones con el permiso**
    - **Validates: Requirements 14.3, 14.4**

  - [ ]* 5.11 Pruebas por ejemplo de render y accesibilidad del flujo
    - Selector_Destino con dos opciones y cierre; indicador de progreso; textos de la decisión por línea; tres acciones en línea sin coincidencia; Panel_Revision con variación porcentual y margen; aviso de compra sin productos
    - Límite de 50 MB: aceptación en 50 MB exactos, rechazo en 50 MB + 1 byte con el mensaje del límite
    - Creacion_Rapida_Producto: prellenado, precio opcional, destino "Insumo" con `is_for_sale = false` y `price = 0`, ausencia de imagen/código/apodos, advertencia de duplicado
    - Apodos: los tres casos; accesibilidad: `aria-label` presente y respuesta a Enter y Espacio en cada control, `aria-disabled` en el control de continuar
    - _Requirements: 2.3, 6.5, 6.6, 6.10, 7.2, 7.4, 7.5, 7.10, 8.5, 8.6, 9.8, 10.3_

- [x] 6. Edge function `scan-invoice-unified`

  - [x] 6.1 Crear `supabase/functions/scan-invoice-unified/index.ts`
    - Body exclusivamente `{ imageBase64, mimeType }`: sin `invoiceConfig`, sin lista de proveedores y sin identificadores del negocio
    - Prompt único con las nueve instrucciones del diseño (copiador fiel, impuestos y descuentos de línea, descuento global al pie, formato numérico latino, unitario derivado, todas las líneas de producto, `ocr_unit` deducida de la descripción ignorando el código fiscal `94`/`UND`, cantidad facturada frente a unidades por empaque, campos ausentes en neutro)
    - `ocr_unit` se extrae del texto de la descripción (palabras de empaque y multiplicadores como `*25*`, `X 3 UN`), nunca del código DIAN `94`; `quantity` es la cantidad facturada, no las unidades por empaque (`Und. emp.`) ni el contenido por unidad (`500G`)
    - `generationConfig` con `responseSchema` obligatorio, `temperature: 0.1`, modelo `gemini-2.5-flash` y reintentos con backoff para 429/503/502, igual que `scan-invoice` v30
    - Degradación: responder `200` con `{ header:{}, document:{globalDiscount:0}, items:[], error:"..." }` cuando la respuesta no es parseable
    - No modificar `scan-invoice` ni `scan-expense`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 3.13, 3.14, 4.4, 15.1, 15.2, 17.6_

  - [ ]* 6.2 Pruebas de contrato de la edge function y del normalizador
    - Verificar que el body enviado contiene únicamente `imageBase64` y `mimeType`
    - Verificar que `normalizeScanResponse` tolera `items` ausente, `document` ausente, campos `null`, números en formato latino, `lineNetTotal` incoherente (se recalcula) y `quantity` en `0`
    - Prueba manual documentada con facturas reales de `test-facturas/`: una factura electrónica con la columna de unidad en el código DIAN `94` cuyo empaque está en la descripción (`.ARROBA ...*25*500G`) debe devolver `ocr_unit` = la arroba y no `94`; una factura de distribuidor con columnas `Cantidades sueltas` y `Und. emp.` a la vez debe devolver la cantidad facturada como `quantity`
    - _Requirements: 3.1, 3.2, 3.3, 3.12, 3.13, 3.14, 4.4, 17.6_

- [ ] 7. Punto de entrada en el menú de acciones de gastos

  - [~] 7.1 Crear `components/expense/ExpenseActionsMenu.tsx`
    - Prop `variant: 'sheet' | 'dropdown'` y las cuatro opciones con "Foto a factura" en primer lugar
    - Filtrar todo el menú por `hasPermission('inv_purchase')`
    - Estado deshabilitado de "Foto a factura" en Modo_Sin_Conexion, con el aviso de que el escaneo requiere internet y la sugerencia de usar "Compra de inventario" u "Otros gastos"; rehabilitar al recuperar la conexión
    - Conservar el comportamiento actual de las tres opciones existentes, incluido el `initialType` con el que abren su modal
    - _Requirements: 1.1, 1.6, 13.1, 13.2, 13.5, 14.1_

  - [~] 7.2 Integrar `ExpenseActionsMenu` en las cuatro pantallas de entrada
    - Reemplazar el arreglo literal `['Compra de inventario','Otros gastos','Merma']` en `screens/HomeScreen.tsx` (hoja inferior), `screens/SellScreen.tsx` (dropdown y hoja inferior), `components/GlobalSellTabs.tsx` y `screens/TablesScreen.tsx`
    - Cablear "Foto a factura" para abrir `InvoiceScanScreen` y devolver el control a la pantalla de origen al terminar
    - Revisar el mapa de `App.tsx` antes de tocarlo si el montaje de la pantalla lo requiere
    - _Requirements: 1.1, 1.3, 1.4, 1.6, 1.7, 16.5_

  - [ ]* 7.3 Pruebas por ejemplo del menú de acciones
    - Orden de las cuatro opciones, estado deshabilitado offline con su aviso, filtro por permiso, y que las tres opciones existentes siguen abriendo su modal con el `initialType` correcto
    - _Requirements: 1.1, 1.6, 13.1, 13.2, 13.5, 14.1_

- [~] 8. Checkpoint — flujo de escaneo completo y funcional
  - Ejecutar `npm run test` y `npm run build`. Confirmar que el flujo abre desde las cuatro pantallas y que las pruebas estructurales pasan. Preguntar al usuario si surgen dudas.

- [ ] 9. Migración del `Flujo_Manual_Compra` al motor compartido

  - [~] 9.1 Migrar el camino online de `components/expense/InventoryPurchase.tsx`
    - **Antes de ejecutar, explicar al usuario con un ejemplo concreto** qué cambia: hoy `handleSave` hace varias escrituras sueltas (una por ítem y por método: `updateProductStock`, `createDebt`, `recordPurchase`) y si falla la tercera, las dos primeras ya quedaron guardadas. Después pasará a una sola llamada transaccional. Mostrar el ejemplo de una compra de 3 ítems a crédito que hoy puede dejar stock sumado sin deuda creada. Advertir el riesgo: es el flujo de compra que el negocio usa a diario, y un error de armado del payload rompe el registro de compras completo. Nombrar las dos diferencias esperadas y aceptadas (el movimiento de caja de la compra ahora sí se inserta y desaparecen los residuos de ±1 peso del reparto). **Esperar confirmación explícita antes de modificar el archivo.**
    - Sustituir el bloque final de `handleSave` por `buildPurchasePayload({ source: 'manual', ... })` + `supabase.rpc('register_purchase', { p_payload })`
    - No tocar: pestañas, historial, edición y eliminación de compras, escáner de barras, escaneo embebido, selector de proveedor, validaciones de saldo del frontend (quedan como pre-chequeo de UX) ni la llamada `onSave({ type: 'inventory' ... })`
    - _Requirements: 16.7, 16.8, 16.9, 16.10, 10.7, 12.4, 12.7_

  - [~] 9.2 Migrar el camino offline y el sincronizador
    - En `InventoryPurchase`, encolar con `offlineQueue.add('inventory_purchase', { rpc_payload })` incluyendo el `idempotency_key` generado **al encolar**, no al sincronizar
    - Reescribir `syncInventoryPurchase` en `hooks/useOfflineSync.ts` para que haga una sola llamada `rpc('register_purchase', { p_payload })` en lugar de reimplementar la compra
    - Conservar el stock optimista en IndexedDB y `pushOfflineCashMovement`; encolar con `evidence_url = null` y avisar que la compra se guardará sin la foto
    - _Requirements: 12.9, 13.3, 13.4, 16.8, 16.9_

  - [ ]* 9.3 Pruebas de snapshot del payload del flujo manual
    - Cuatro estados de UI congelados: un ítem de contado con descuento de caja; tres ítems a crédito con abono inicial; pago dividido en dos métodos; compra sin turno activo
    - Regresión offline: sin conexión, una compra manual encola exactamente una transacción con un payload válido, actualiza el stock optimista y refleja el movimiento en la caja optimista, sin ninguna escritura a Supabase
    - _Requirements: 16.9, 13.3_

  - [ ]* 9.4 Prueba de propiedad de paridad entre flujos
    - **Property 5: Paridad entre el flujo escaneado y el flujo manual**
    - **Validates: Requirements 10.7, 11.6, 16.8, 16.9, 16.10**

- [ ] 10. Eliminación del código de la Fórmula_Costo

  - [~] 10.1 Quitar `evaluateCostFormula` de `components/expense/InvoiceReviewPanel.tsx`
    - Sustituir el total de línea por `quantity × unitCost`, que ya es el valor de retorno cuando no hay fórmula
    - Eliminar la evaluación con `new Function()` y toda referencia a `costFormula` y `costInstructions`
    - Aceptar el cambio de comportamiento del escaneo embebido para los proveedores que hoy tienen fórmula configurada (Opción A confirmada por el usuario: son proveedores de prueba)
    - _Requirements: 4.1, 4.2, 4.4_

  - [~] 10.2 Eliminar los componentes de configuración de factura
    - Borrar `components/expense/CostFormulaBuilder.tsx` y `components/expense/InvoiceConfigPanel.tsx`
    - Quitar de `InventoryPurchase.tsx` el botón que abre el panel y el estado asociado
    - Verificar que no queda ninguna referencia con una búsqueda en el repositorio
    - _Requirements: 4.1, 4.2_

  - [~] 10.3 Eliminar la API de configuración por proveedor
    - Quitar `updateSupplierInvoiceConfig` de `hooks/useSuppliers.ts` y los tipos `InvoiceConfig`, `InvoiceField` y `DEFAULT_INVOICE_CONFIG`
    - No borrar ni modificar la columna `suppliers.invoice_config`: las filas conservan sus datos y el sistema los ignora
    - _Requirements: 4.1, 4.3, 15.5_

  - [~] 10.4 Eliminar la edge function `generate-cost-formula`
    - Confirmar cero referencias en el frontend antes de eliminarla y verificar con MCP (`list_edge_functions`) el estado real desplegado
    - _Requirements: 4.1, 4.2_

  - [ ]* 10.5 Prueba estructural del símbolo eliminado
    - Verificar que el símbolo `evaluateCostFormula` no existe en ninguna parte del repositorio
    - _Requirements: 4.1_

- [ ] 11. Verificación final

  - [x] 11.1 Ejecutar el build y la suite completa
    - `npm run build` sin errores y `npm run test` con toda la suite en verde
    - Corregir cualquier error de tipos o de prueba que aparezca antes de continuar
    - _Requirements: 15.3, 15.4, 15.5_

  - [x] 11.2 Verificación de seguridad tipo smoke
    - RLS habilitada y políticas presentes en `products`, `product_purchase_units`, `suppliers`, `inventory_lots`, `business_debts`, `expenses`, `cash_movements` y `register_idempotency` (`pg_tables.rowsecurity`, `pg_policies`)
    - `register_purchase` y `register_expense` con `prosecdef` verdadero y `proconfig` fijando `search_path=public`
    - `EXECUTE` revocado a `PUBLIC` y `anon` en ambas funciones, y concedido a `authenticated` y `service_role`
    - `register_idempotency` sin `INSERT`/`UPDATE` para `authenticated`
    - `get_advisors` (security) sin hallazgos nuevos atribuibles a esta funcionalidad
    - _Requirements: 17.13, 15.7_

  - [ ] 11.3 Verificación de paridad del flujo manual
    - ⏸ BLOQUEADA: requiere una rama de desarrollo de Supabase (branching), disponible solo en plan de pago. El proyecto está en plan free, así que esta verificación queda pendiente hasta que se disponga del plan pago. No ejecutar contra producción (escribiría datos de prueba en la base real).
    - Golden master en una rama de base de datos: la misma compra por la ruta legado y por la RPC, comparando `inventory_lots`, `products.stock`, `business_debts` y `cash_movements` con `id`, `created_at` y `purchase_date` normalizados
    - Documentar en el resultado las dos diferencias esperadas y aceptadas: el movimiento de caja de la compra ahora sí se inserta (Hallazgo 2) y desaparecen los residuos de ±1 peso del reparto proporcional
    - _Requirements: 16.9, 16.10, 10.7_

## Notes

- Las sub-tareas marcadas con `*` son opcionales y se pueden omitir para un MVP más rápido. Cada una de las 18 propiedades de correctitud del diseño tiene su propia sub-tarea de prueba.
- **Tareas que exigen explicar antes de ejecutar.** El usuario pidió explícitamente que los hallazgos importantes se le expliquen con ejemplos antes de tocarlos. Las tareas 2.1 (CHECK de `cash_movements`), 2.3 y 2.4 (funciones `SECURITY DEFINER`) y 9.1 (migración del flujo manual de compra) incluyen en su descripción el paso obligatorio de explicar el cambio con un ejemplo concreto, nombrar el riesgo y **esperar confirmación explícita del usuario** antes de aplicarlo. No ejecutar esas tareas sin esa conversación previa.
- **Opción A confirmada:** la Fórmula_Costo se elimina en esta iteración. Para los proveedores que hoy tienen `costFormula` configurada, el total de línea del escaneo embebido pasa a calcularse como `cantidad × valor unitario`. El usuario confirmó que esos proveedores son de prueba y que no hay que preservar la fórmula.
- **Nunca asumir el estado de la base de datos a partir de los archivos locales de `supabase/`.** Verificar con MCP (`list_tables`, `list_edge_functions`, `list_migrations`) antes de cada tarea de base de datos.
- La tabla `debts` no existe (Hallazgo 1 del diseño): todas las deudas con proveedor se escriben en `business_debts`.
- Las pruebas de propiedades 1, 2, 5, 6, 7, 13 y 17 requieren una rama de desarrollo de Supabase con datos sembrados de dos negocios y dos sesiones. Se ejecutan con `fast-check` y un mínimo de 100 iteraciones.
- Los checkpoints (tareas 3 y 8) validan de forma incremental y no forman parte del grafo de dependencias.
- **Categorías de gasto por defecto y `scan-expense` v5 (implementado fuera del plan original).** Se sembraron 11 categorías por defecto en todos los negocios (backfill idempotente + trigger `after_business_insert_seed_expense_categories`; migraciones `20260804214205_seed_default_expense_categories_and_trigger` y `20260804214246_fix_mercancia_typo_expense_categories`) y se redesplegó `scan-expense` a la versión 5 con un prompt de descripción de dos familias de reglas generales que ya no cae en "Otro". **Sugerencia de categoría al escanear (implementado, cambio posterior).** Se redesplegó `scan-expense` a la **versión 6** añadiendo un sexto campo `category`: el prompt reutiliza la clasificación de familias que ya hacía para la descripción y devuelve una de las 11 Categorias_Gasto_Por_Defecto (o `""` si no está seguro). La Ruta_Gasto ahora **pre-selecciona** esa categoría: `matchCategory` (en `scanExpense.logic.ts`) empareja la sugerencia contra las categorías del Negocio_Activo y prellena el selector; el hook `useInvoiceScanDraft` recibe `categories` y `InvoiceScanScreen` le pasa las de `useExpenses`. Sigue siendo una sugerencia editable: si la IA no sugiere o la sugerencia no existe en el negocio, la categoría queda vacía y el Usuario la elige a mano, conforme al Requisito 11.3 (que pasa de "selección manual" a "selección con sugerencia editable"). El componente `ScanExpenseFieldsStep` no cambió. Esto **reemplaza** la nota anterior que decía que la autoselección no estaba incluida.
