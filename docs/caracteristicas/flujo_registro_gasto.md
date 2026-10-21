# Flujo de Registro de Gasto

Componente: `components/expense/ExpenseRegister.tsx`  
Acceso: Panel de Gastos → Registro de Gasto  
Acceso móvil: HomeScreen → Finanzas → **Gastos** (abre `ExpenseModal` vía action sheet con opciones: Compra de inventario, Gastos, Merma)  
Acceso directo dispositivo: Icono **"Gastos"** en pantalla de inicio del sistema operativo móvil/tablet (vía PWA Shortcuts en `manifest.json`, deep link `/?action=expense`, o manteniendo pulsado el botón "Gastos").

Registra egresos operativos que **no corresponden a compra de inventario**: servicios, arriendos, nómina, suministros, etc. A diferencia de [`flujo_compra_inventario.md`](./flujo_compra_inventario.md), este flujo **no actualiza stock** ni crea `inventory_lots`. Solo registra el movimiento financiero.

Tiene dos pestañas: **Registro** (formulario) e **Historial** (lista de gastos recientes).

---

## Escaneo de gasto con IA (desde 2026-06-08)

El formulario de **Gasto Proveedor** integra la opción de escaneo con IA en su bloque de evidencia:

```
┌──────────┐  ┌──────────────┐  ┌───────────────────────────────┐
│          │  │   📷 Cámara  │  │            ✨ [IA]            │
│    📎    │  ├──────────────┤  │                               │
│          │  │   🖼️ Galería │  │           Escanear            │
└──────────┘  └──────────────┘  └───────────────────────────────┘
```

- **Escanear (con badge IA)**: botón simétrico con estética de IA moderna (tonos índigo/violeta sutiles con borde fino y sombra interactiva). Abre directamente la pantalla de captura del flujo unificado (`InvoiceScanScreen`) con destino predefinido `expense` (sin pasar por el selector de destino "¿Qué trae este documento?"). Al finalizar el registro guiado (o cerrarlo), regresa a la pantalla de Registro de Gasto para poder continuar registrando movimientos.
- **Llenado manual**: botones de cámara y galería organizados en columna para adjuntar evidencia física opcional.
- **Simetría visual**: se eliminó el texto auxiliar inferior ("Factura, remisión o comprobante") para garantizar simetría y alineación de altura exacta (78px) entre la columna de cámara/galería, el botón de IA y el recuadro de miniatura (80px).

### Qué reconoce la IA (todo editable)

| Campo detectado | Dónde cae | Regla |
|---|---|---|
| `amount` | Valor | Normaliza formato latino (punto=miles, coma=decimales); rango 0.01–999.999.999,99 |
| `description` | Observaciones | Detalle adaptado al tipo de gasto (ver prompt); truncado a 500 caracteres |
| `supplierName` / `nit` | Proveedor | Prioridad por NIT (normalizado), luego por nombre; si no hay match → CTA "Crear proveedor" con prefill |
| `date` | Fecha | Solo si es fecha real y no futura (zona CO); si no, se mantiene hoy |

> La IA **ya no sugiere categoría**. Tras analizar, se abre automáticamente el selector de categoría (`CategoryPickerSheet`) para que el usuario elija de la lista. El selector también se usa en modo manual.

La lógica pura de matching/normalización vive en `components/expense/scanExpense.logic.ts` (`normalizeLatinAmount`, `resolveAmountField`, `truncateDescription`, `matchSupplier`, `resolveExpenseDate`). Subcomponentes de UI: `EntryModeSelector.tsx`, `ScanReviewPanel.tsx`, `CategoryPickerSheet.tsx`, `ObservationSheet.tsx`, `DocumentCropper.tsx`.

### Categorías por defecto (sembradas en BD)

Se sembraron en `expense_categories` (todos los negocios, sin duplicar las existentes) las categorías estándar:
`SERVICIOS · ARRIENDO · SUELDOS · SALUD Y PARAFISCALES · HONORARIOS · MANTENIMIENTO · MERCANCÍA · INSUMOS · BIENES · IMPUESTOS · PAGOS VARIOS · PUBLICIDAD`. Quedan disponibles en todas las pantallas que usan categorías de gasto.

### Prompt de extracción (`description` por tipo de gasto)

El prompt instruye a Gemini a capturar **lo útil según el tipo**, no todo el texto:
- **Servicios públicos** → tipo de servicio + periodo (sin conceptos internos como cargo fijo/consumo).
- **Arriendo / nómina / salud-parafiscales / honorarios** → concepto + empleado/periodo.
- **Productos comprados** → regla por cantidad de artículos:
  - *3 o menos artículos*: nombre identificativo de los productos con su unidad de medida o presentación si viene en el comprobante, sin cantidades compradas ni precios (ej. "Coca Cola 350ml", "Aceite 900ml y Arroz 1kg", "Coca Cola 350ml, Aceite 900ml y Arroz 1kg").
  - *Más de 3 artículos*: una sola línea corta y descriptiva del tipo general de compra (ej. "Compra de abarrotes y víveres", "Artículos de aseo y limpieza", "Material de empaque y bolsas").
- **Impuestos / pagos varios / publicidad** → el concepto en una sola línea corta.

### Selectores y UX

- **Selector de categoría** y **observación ampliada** (`ObservationSheet`, ícono ⛶) se abren como paneles `absolute inset-0` **dentro del panel de gastos** (no a pantalla completa del dispositivo). El buscador de categorías no auto-enfoca (no abre el teclado en móvil al aparecer).
- **Proveedor**: cuando está seleccionado (elegido de la lista o detectado por IA), se muestra como chip verde con check y botón ✕ para cambiarlo; en búsqueda, input con autocompletado. Texto responsive (truncado), botón "Crear" colapsa a solo ícono en pantallas angostas.
- **Evidencia**: la miniatura es tocable y abre la imagen ampliada (`object-contain`) para verificar el encuadre.

### Estados y degradación

- **Procesando**: spinner "Analizando comprobante…".
- **Error/timeout (30s)**: banner con "Reintentar" (vuelve al sub-selector de fuente) o "Continuar manual"; la imagen capturada se conserva como evidencia.
- **Offline**: la opción "Escanear con IA" se deshabilita, se fuerza el modo manual y se avisa que el escaneo requiere internet. El registro manual sigue funcionando con `offlineQueue`.

### Edge function `scan-expense`

Independiente de `scan-invoice` (inventario). Recibe `{ imageBase64, mimeType, suppliers[] }` y devuelve `{ amount, description, supplierName, nit, date }`. `verify_jwt=false`, CORS abierto, retry con backoff para 429/503/502, `GEMINI_API_KEY` como secret. Valida imagen obligatoria (400 sin invocar a la IA).

### Cámara de documento (`InAppCamera` modo `fullFrame`) y cropper

- `InAppCamera` acepta `fullFrame`: video a **pantalla completa** con `object-cover` (sin franjas negras), header y botón de captura flotantes, y captura recortada exactamente a lo visible en pantalla.
- `DocumentCropper`: recorte de **rectángulo con 4 esquinas arrastrables** (Pointer Events nativos, sin librería extra), imagen completa visible, rejilla guía, oscurecido exterior, botón "Todo" (resetear) y "Usar recorte". Exporta WebP máx. 1600px. Es el cropper del escaneo de gasto; el `ImageCropper` (react-easy-crop, zoom/pan cuadrado) sigue para el flujo manual y otras pantallas.
- `useImageUpload` ganó `triggerDocumentCamera`/`showDocumentCamera`/`onDocumentCameraClose` y `uploadFileDirect(file)` (sube sin pasar por el cropper interno).

---

## Campos del Formulario

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| Fecha | `date` | Sí | Fecha del gasto. Defecto: día actual. No puede ser futura. |
| Valor | `number` | Sí | Monto del gasto. Formateado con separador de miles. |
| Categoría | selector (`CategoryPickerSheet`) | Sí | Panel con buscador, lista scrolleable y "Crear nueva categoría". Se abre solo tras escanear. |
| Observaciones | `textarea` + ampliar (`ObservationSheet`) | No | Descripción libre. Ícono ⛶ para editar en panel ampliado. |
| Proveedor | chip seleccionado / `text` + autocomplete | Sí | Obligatorio en ambos modos (contado y crédito). Chip verde al estar seleccionado. |
| Tipo de Transacción | `toggle` | Sí | `Contado` o `Crédito`. Aparece **después** del proveedor. |
| Fecha de Pago | `date` | Condicional | Obligatorio en modo Crédito. Fecha mínima: hoy. |
| Abono inicial | `number` | No | Solo aparece en modo Crédito. |
| ¿Sale de Caja? | `toggle` (`Sí` / `No`) | Condicional | Aparece con turno activo tanto en **Contado** como en **Crédito con abono**. Inicia en estado neutro (`null`) y oculta los métodos hasta responder. |
| Método de pago | `select` / `split` | Condicional | Aparece tras responder a ¿Sale de Caja? o si no hay turno. Permite **método único** o **Dividir pago** (múltiples métodos). |

---

## Gestión de Categorías

Las categorías son etiquetas libres que el negocio define. Se pueden crear, editar y eliminar directamente desde el dropdown del formulario sin salir de la pantalla.

- **Crear**: campo inline bajo "Crear categoría". Se guarda al pulsar Enter o el botón "Guardar".
- **Editar**: al hover sobre una categoría en el dropdown, aparece un ícono de edición inline.
- **Eliminar**: ídem, con confirmación vía `ConfirmDialog`.
- Si se elimina la categoría seleccionada actualmente, se selecciona automáticamente la primera disponible.

Las categorías provienen del hook `useExpenses` y se persisten en Supabase.

---

## Modos de Pago

### Control Previo de Turno y Salida de Dinero (`¿El dinero sale de caja?`)

Tanto en **Contado** como en **Crédito con Abono Inicial**, el sistema implementa un control de salida de dinero con detección previa de turno:
- **Estado Neutro Inicial (`null`):** Los métodos de pago permanecen **ocultos** hasta que el usuario responda explícitamente `[ Sí ]` o `[ No ]`.
- **Aislamiento de Arqueo ante Medios Digitales:** Las porciones pagadas por medios electrónicos (Nequi, Daviplata, Tarjeta, Transferencia) **nunca** descuentan de las ventas del turno ni alteran el arqueo de caja física.
- **Cálculo Reactivo de Efectivo:** Solo la porción en efectivo físico (`mapped_id === 'cash'`) valida saldo disponible en caja y genera registros en `cash_movements`.
- **Sin Turno Abierto:** Se despliega el banner: *"Sin caja abierta: Este pago no se registrará en ningún turno ni afectará arqueos de caja."*, dejando visibles los métodos para registro meramente administrativo.

### Contado (`isCredit = false`)

- **Sí** (`deductFromCashRegister = true`): El egreso se descuenta de la caja activa. Se eligen los métodos (único o dividido). Solo la porción en efectivo físico descuenta del arqueo de caja y valida disponibilidad de saldo.
- **No** (`deductFromCashRegister = false`): Fondos externos. El gasto se registra contablemente pero **no afecta el saldo de caja** ni valida efectivo disponible.

### Crédito (`isCredit = true`)

El gasto queda como una deuda con el proveedor (`debts`). Requiere:
- Proveedor o Colaborador según categoría (obligatorio).
- Fecha de vencimiento (obligatorio).
- **Abono inicial (opcional):**
  - Si no hay abono (`supplierPaidAmount === 0`), no se solicita método de pago ni se toca caja.
  - Si se registra un abono y hay turno activo, se pregunta: `¿EL DINERO DEL ABONO SALE DE CAJA?` (`null` inicial):
    - **Sí**: Habilita métodos de pago del abono (único o dividido). Solo la porción en efectivo físico valida saldo y genera egreso en `cash_movements`.
    - **No**: Fondos externos. Se registra el abono informativo sin alterar la caja registradora.

El saldo pendiente se calcula en tiempo real: `monto total − abono inicial`.

### Experiencia Táctil y Prevención de Teclado en Móviles

En dispositivos móviles, para evitar que el teclado virtual salte o se reabra al responder las preguntas de caja:
- Los botones `[ Sí ]`, `[ No ]`, `[ Contado ]`, `[ Crédito ]` y `[ Dividir pago ]` ejecutan `document.activeElement.blur()` tanto en el evento táctil temprano `onPointerDown` como en `onClick`.
- Esto cierra de forma inmediata el teclado si el usuario venía de ingresar el monto o abono, garantizando una transición limpia sin obstruir la pantalla.

---

## Proceso de Guardado (`handleSave`)

### Validaciones previas
- Sin `amount` → bloqueado.
- Sin `selectedCategory` → bloqueado.
- Crédito sin `creditorName` → bloqueado.
- Crédito sin `dueDate` → bloqueado.
- Crédito con abono y turno activo con `deductFromCashRegister === null` (no respondió) → bloqueado ("Elige si el abono sale de caja").
- Contado con turno y `deductFromCashRegister === null` (no respondió) → bloqueado ("Elige si el dinero sale de caja").
- Pago dividido con suma incompleta o excedida → bloqueado.
- Salida de caja con porción en efectivo superior al disponible → bloqueado por saldo insuficiente.

### Ejecución

**Modo Crédito:**
1. Crea un registro en `debts` con `type: 'supplier'`, `status: 'active'` (o `'paid'` si el abono cubre el total).
2. Si hay abono inicial y turno activo, llama a `recordPurchase(paidAmount, ..., paymentMethod)` para descontar de caja.

**Modo Contado:**
El gasto en sí **no crea un `debt`**. El registro contable ocurre en la llamada a `onSave()` del componente padre, que escribe en la tabla `expenses`.

La lógica de descuento de caja (si `deductFromCashRegister = true`) la maneja el **componente padre** usando los datos del `payments` array que se pasan en el payload de `onSave`.

### Payload de `onSave`
```ts
{
  type: 'expense',
  mode: 'manual',
  amount,
  description,
  category: selectedCategory,
  payments: [...],            // métodos y montos de pago
  payment_method,             // primer método (para compatibilidad)
  deductFromCashRegister,     // si el padre debe descontar de caja
  cashAmount: totalPayments,  // suma de todos los métodos
  isCredit,
  creditorName,
  date,
}
```

Después de guardar exitosamente, el formulario se **resetea completamente** y hace scroll al inicio.

---

## Gestión de Proveedores

Mismo patrón que en `InventoryPurchase`. El campo de proveedor tiene autocompletado desde la tabla `suppliers`. Al escribir, filtra en tiempo real por nombre. Los primeros 5 resultados se muestran en un dropdown flotante.

El botón **"Crear"** abre un modal con los campos: Nombre*, NIT/Cédula, Teléfono, Dirección. Solo el nombre es obligatorio. Al crear, el nombre se autocompletea en el campo de proveedor.

---

## Historial de Gastos

Se carga **bajo demanda** (`fetchExpenses()`) al cambiar a la pestaña "Historial", no al montar el componente. Para optimizar el rendimiento y el consumo de red:
- **Carga inicial:** Descarga únicamente los primeros **10 registros** (`.range(0, 9)` de Supabase).
- **Scroll infinito:** Al deslizar y acercarse al final de la lista ($\approx 60\text{px}$ del fondo), se disparan peticiones subsiguientes (`fetchMoreExpenses()`) trayendo de a 10 registros adicionales y mostrándolos en orden cronológico descendente.
- **Edición y eliminación reactivas:** Actualizan el estado local de la lista en memoria inmediatamente sin reiniciar la paginación ni perder la posición del scroll.

### Edición (`handleStartEdit` / `handleSaveEdit`)
Permite corregir en el historial: **monto**, **categoría** y **observación**. La edición es inline dentro de la misma tarjeta. Persiste via `updateExpense` de `useExpenses`.

> [!IMPORTANT]
> La edición del historial **no revierte ni recalcula** el movimiento de caja original. Solo corrige los metadatos del gasto. Si se necesita corregir el impacto en caja, debe hacerse manualmente.

### Eliminación (`handleDeleteExpense`)
Pide confirmación. Llama a `deleteExpense(id)` que elimina el registro de `expenses` **y** los `cash_movements` asociados (buscando por `reference_id = expense.id` y `reference_type = 'expense'`). Dispara el evento global `expense-deleted` para actualizar el dashboard.

> [!NOTE]
> La reversión del movimiento de caja la maneja `deleteExpense` internamente. No se llama a `reverseCashMovement` desde el componente para evitar borrar movimientos de caja ajenos por coincidencia de monto.

---

## Diferencia clave con Compra de Inventario

| Aspecto | Registro de Gasto | Compra de Inventario |
|---|---|---|
| Actualiza stock | ❌ No | ✅ Sí |
| Crea `inventory_lot` | ❌ No | ✅ Sí |
| Crea `debt` en crédito | ✅ Sí | ✅ Sí |
| Escaneo de factura IA | ✅ Sí (recibos/gastos, edge `scan-expense`) | ✅ Sí (productos, edge `scan-invoice`) |
| Soporte offline | ✅ Sí (offlineQueue) | ✅ Sí (offlineQueue) |
| Tabla principal | `expenses` | `inventory_lots` + `debts` |

---

## Tablas de Supabase Involucradas

| Tabla | Operación | Cuándo |
|---|---|---|
| `expenses` | INSERT | Al confirmar cualquier gasto |
| `expense_categories` | SELECT / INSERT / UPDATE / DELETE | Gestión de categorías |
| `debts` | INSERT | Solo en modo Crédito |
| `suppliers` | SELECT / INSERT | Al buscar o crear proveedor |
| `cash_movements` | INSERT | Si sale de caja o si hay abono en crédito |

> [!NOTE]
> El escaneo IA (`scan-expense`) **no** escribe en BD por sí mismo: solo prellena el formulario. El guardado real ocurre por el flujo normal de `handleSave` (mismas tablas) sin importar si los datos vinieron por escaneo o manual.

---

## Coexistencia con sidebar y Asistente IA

`ExpenseModal` (contenedor de `InventoryPurchase`, `ExpenseRegister` y `WasteRegister`) usa `md:left-60` en su contenedor raíz para que el sidebar permanezca visible en desktop cuando el panel está abierto. Z-index: `z-[70]`. El chat (z-[110]) queda siempre al frente.

---

## Evidencia y proveedor obligatorio (desde 2026-06-07)

- **Proveedor obligatorio** en gastos de crédito y de contado (asterisco siempre visible; el botón de confirmar se bloquea sin proveedor).
- Se puede adjuntar **una imagen de evidencia** (comprobante) con `<EvidenceUploader>`, comprimida a WebP y subida al bucket público `debt-evidence`. La URL se guarda en `expenses.receipt_url`.
- El **gasto de contado** crea además una fila de movimiento del proveedor en `business_debts` (badge "Contado", saldo 0) con la misma `evidence_url`, para que la evidencia sea consultable y compartible por WhatsApp desde el historial del proveedor en `DebtsScreen`. Ver [`deudas_negocio.md`](./deudas_negocio.md).
