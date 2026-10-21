# Deudas del Negocio (DebtsScreen)

Componente: `screens/DebtsScreen.tsx`  
Hooks principales: `hooks/useDebts.ts`, `hooks/useSuppliers.ts`  
Acceso: Menú principal → "Deudas"  
Acceso móvil (abonos): HomeScreen → Finanzas → **Abonos** → "Abonos a Proveedor" (abre `QuickTransactionModal` directamente)

Módulo para gestionar las **deudas que el negocio tiene con sus proveedores y acreedores** (lo opuesto a `ClientsScreen`, que maneja lo que los clientes le deben al negocio). Registra compras a crédito, abonos a proveedores, y provee reportes de antigüedad de cartera pasiva.

> [!IMPORTANT]
> No confundir con [`ClientsScreen` / Cuentas por Cobrar](./clientes_cuentas_cobrar.md). Este módulo es lo que **el negocio le debe a otros** (proveedores, acreedores), no lo que otros le deben al negocio.

> [!IMPORTANT]
> **Requiere conexión a internet**: cuando `!isOnline || !navigator.onLine`, el componente muestra una pantalla de bloqueo completa ("Sin conexión") y no permite ninguna operación de lectura ni escritura en la UI. El hook `useDebts` sí carga datos desde caché localStorage cuando está offline, y `addCreditorPayment` soporta cola offline via `offlineQueue`, pero la UI del componente bloquea el acceso completo sin red.

---

## ¿Para qué sirve?

1. Registrar deudas con proveedores por compras a crédito.
2. Registrar abonos (pagos parciales o totales) a esos proveedores.
3. Ver cuánta deuda está vencida y cuánto vence en los próximos 7 días.
4. Analizar la concentración de deuda por proveedor.
5. Mantener un directorio de proveedores con NIT, teléfono y dirección.
6. Revertir compras registradas incorrectamente (con restricciones de integridad).

---

## Pestañas

| Tab | Contenido |
|---|---|
| **Cuentas por Pagar** | Lista de proveedores/acreedores con saldo pendiente > 0 |
| **Directorio** | Todos los proveedores registrados, incluso sin deuda activa |

---

## Secciones de la Pantalla

### 1. KPIs Financieros (siempre visibles)

| KPI | Qué mide |
|---|---|
| **Total por Pagar** | `totalPending` — suma de todos los saldos vivos (deuda − abonos) |
| **Deuda Vencida** | Deudas con `due_date` anterior a hoy, porcentaje respecto al total |
| **Próximos Vencimientos (7d)** | Deudas que vencen en los próximos 7 días, con texto del más cercano |

> [!NOTE]
> El `totalPending` de este módulo es el mismo valor que aparece como alerta "Deudas del negocio" en el [`Dashboard`](./dashboard.md), lo que lo hace consistente entre pantallas.

---

### 2. Análisis de Cartera (Panel de Gráficos)

**Izquierda — Antigüedad de Saldos (Bar Chart):**

Barras verticales que muestran la distribución de la deuda pendiente según días de atraso:

| Bucket | Días | Color hex |
|---|---|---|
| Al Día | Sin vencer o sin `due_date` | Verde `#4dcba1` |
| 1-30 días | 1–30 días vencido | Amarillo `#f4cc2d` |
| 31-60 días | 31–60 días vencido | Rojo claro `#f03a5f` |
| +60 días | Más de 60 días vencido | Rojo `#e84c3d` |

Todas las deudas deben registrarse con fecha de vencimiento. Las deudas **sin `due_date`** se clasifican automáticamente como "Al Día", lo que puede inflar artificialmente el bucket verde. Es una regla de negocio: siempre completar el campo de fecha al registrar una deuda.

**Comportamiento interactivo:**
- Cada barra muestra su monto total encima (siempre visible, sin tooltip).
- Al tocar o hacer clic en una barra se abre el **Panel de Proveedores del Bucket** (ver sección siguiente).
- Las barras no seleccionadas se atenúan (`opacity-25`) para resaltar la activa.
- Barras con valor `$0` no son interactivas.

### Panel de Proveedores del Bucket

Al seleccionar una barra del aging chart se abre un panel con la lista de proveedores que tienen deuda en ese rango, ordenados por monto descendente. El monto mostrado por proveedor es la suma de sus deudas individuales **dentro de ese bucket** (un mismo proveedor puede tener deudas en múltiples buckets).

**Comportamiento por dispositivo:**

| Dispositivo | Presentación | Cierre |
|---|---|---|
| **Móvil (< md)** | Bottom sheet que sube desde el borde inferior (`max-h: 75vh`) | Deslizar hacia abajo > 80 px, tocar el backdrop o botón `×` |
| **Desktop (≥ md)** | Sidebar lateral derecho de 420 px, desliza desde la derecha | Tocar el backdrop, botón `×` o tecla `Escape` |

**Información mostrada por proveedor:**
- Avatar con inicial del nombre
- Nombre del proveedor
- Monto adeudado en ese bucket (coloreado según el bucket)
- Botón `→` que cierra el panel y abre el sidebar de detalle del proveedor

**Implementación técnica:**
- Estado: `selectedAgingBucket: 'alDia' | 'unAMetreinta' | 'treintaYSesenta' | 'masDeSesenta' | null`
- La función `getCreditorsForBucket` recorre `activeDebts`, clasifica cada deuda individual por bucket y agrupa los montos por `creditor_name`.
- El swipe-to-dismiss en móvil usa `addEventListener('touchmove', handler, { passive: false })` directo en el DOM para poder llamar `preventDefault()` y bloquear el pull-to-refresh del navegador.
- El panel comparte el mismo bloque JSX; las clases Tailwind `md:` cambian posición, ancho, bordes y animación según breakpoint.

**Derecha — Top Proveedores / Concentración (Donut Chart):**

Gráfico de dona SVG que muestra los top 5 proveedores por monto de deuda restante. Si hay más de 5, los demás se agrupan como "Otros". El hover en cada segmento o leyenda muestra el monto exacto y el porcentaje.

---

### 3. Lista de Proveedores / Acreedores

Filtrable por:
- **Búsqueda**: por nombre, NIT o teléfono del proveedor.
- **Estado**: Todos / Vencido / Pendiente / Próximos a vencer.

Ordenados por fecha de vencimiento ascendente (los que vencen antes, primero).

---

### 4. Panel de Detalle del Proveedor

Al seleccionar un proveedor/acreedor se abre un sidebar con:

- Información de contacto (NIT, teléfono, dirección)
- Barra de progreso de pago (cuánto se ha abonado del total)
- Historial completo de movimientos (compras y abonos)
- Acciones: Registrar Abono, Editar proveedor, Eliminar proveedor

**Movimientos del historial:**

El campo `type` en `business_debts` es `'supplier' | 'other'` y no clasifica el tipo de movimiento. La UI usa esta lógica para determinar el badge visual:

- `isPaymentRecord = total_amount === 0 && paid_amount > 0` → Badge **"Abono"** (azul)
- `isCashPurchase = !isPaymentRecord && status === 'paid' && paid_amount >= total_amount` → Badge **"Contado"** (verde)
- caso restante → Badge **"Crédito"** (rojo)

Cada movimiento tiene botones de editar (solo compras de crédito) y eliminar, con lógica de integridad.

---

## Flujo: Registrar una Deuda/Compra a Crédito

1. Botón "Nueva Deuda" → modal
2. Campos: nombre del proveedor/acreedor (con autocomplete de proveedores existentes + botón "Crear"), descripción, monto, fecha límite (opcional en UI)
3. El sistema busca si ya existe el proveedor. Si no existe, **lo crea automáticamente** en la tabla `suppliers`
4. Se inserta en `business_debts` con `status = 'pending'`

> [!NOTE]
> Si el usuario escribe el nombre con variación ortográfica (mayúsculas, espacio extra), se creará un proveedor duplicado. No hay normalización del nombre. Ver inconsistencias más abajo.

---

## Flujo: Registrar un Abono a Proveedor

1. Desde el panel del proveedor → "Registrar Abono"
2. Campos del modal:
   - **Monto** (requerido)
   - **Descripción** (opcional, se guarda como `'Abono: {texto}'`)
   - **Medio de Pago** — solo aparece cuando hay turno activo (`activeShift`). Sin turno, el campo no se muestra.
3. Al guardar:
   - Se actualiza `paid_amount` en la deuda correspondiente en `business_debts`
   - **Si hay turno activo y el medio es Efectivo**: se registra en caja como `recordPurchase` (egreso en efectivo) descontando del cajón físico. Si el abono se realiza por medios electrónicos (Nequi, Daviplata, Tarjeta, Transferencia), se liquida la deuda en `business_debts` pero **no genera egreso de caja ni descuenta ingresos del turno**, alineado con la regla de caja física de nómina y gastos.

> [!IMPORTANT]
> Únicamente los abonos en **efectivo físico** descuentan del turno en caja (`cash_movements`). Los métodos electrónicos (Nequi, Daviplata, Tarjeta, Transferencia) amortizan la deuda contable del proveedor sin afectar el saldo de efectivo ni los ingresos del turno. Si no hay turno activo, el sistema permite el abono igualmente amortizando la deuda contable. Ver también [`clientes_cuentas_cobrar.md`](./clientes_cuentas_cobrar.md).

---

## Flujo: Eliminar una Compra (con restricciones)

Al intentar eliminar una compra registrada, el sistema aplica validaciones de integridad antes de proceder:

**Bloqueo 1 — Stock Negativo:**
> "No puedes borrar esta compra porque el stock de este producto está en 0 o en negativo. Eliminarlo descuadraría aún más el inventario."

**Bloqueo 2 — Unidades Ya Vendidas:**
> "No puedes borrar esta compra porque ya vendiste X unidades de este registro. Borrarla descuadraría el análisis de ganancias del Dashboard."

Si ninguna restricción aplica, la eliminación:
- Revierte el lote de inventario vinculado (`inventory_lot_id`)
- Si fue una compra de contado, revierte el movimiento de caja (`reverseCashMovement`)
- Dispara el evento `'purchase-reversed'` para que otras partes del sistema actualicen sus datos

---

## Flujo: Editar una Compra

Se puede editar la **cantidad** y el **costo total** de una compra registrada. El sistema recalcula el `unit_cost` automáticamente:

```
unit_cost = costo_total / cantidad
```

Esto actualiza el lote en `inventory_lots` para que el costo promedio ponderado del producto sea correcto. Ver [`catalogo_productos.md`](./catalogo_productos.md) para más contexto del costo promedio ponderado.

---

## Directorio de Proveedores

El tab "Directorio" muestra **todos** los proveedores registrados en un grid de tarjetas, incluyendo los que ya saldaron su deuda o nunca han tenido una. Esto resuelve el problema de que un proveedor "desaparecía" de la vista cuando pagaba toda su deuda.

**Presentación:**
- Grid responsivo: 1 columna en móvil, 2 en tablet, 3 en desktop (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`).
- Cada tarjeta muestra: avatar (inicial + color del proveedor), nombre, NIT, teléfono, estado de deuda (monto pendiente o "Al día"), y cantidad total de movimientos.
- Un indicador rojo (punto) aparece junto al nombre si el proveedor tiene deuda activa.
- Al hacer clic en cualquier tarjeta se abre el panel lateral de detalle con el historial completo de movimientos.

**Búsqueda:** El mismo campo `searchQuery` que usa la pestaña "Cuentas por Pagar" funciona en el directorio, filtrando por nombre, NIT o teléfono del proveedor.

**Acciones desde el Directorio:**
- Ver historial completo de transacciones (compras y abonos)
- Editar el perfil del proveedor (nombre, NIT, teléfono, dirección) desde el panel de detalle
- Eliminar el proveedor y todas sus deudas vinculadas
- Registrar nueva deuda directamente (botón "Nueva Deuda" visible en esta pestaña)

**Datos del proveedor almacenados:**

| Campo | Uso |
|---|---|
| `name` | Clave de agrupación (sensible a cambios de nombre) |
| `nit` | NIT / identificación tributaria |
| `phone` | Contacto telefónico |
| `address` | Dirección física |
| `color` | Color de identificación en gráficos (avatar y donut) |

---

## Integración con Otros Módulos

| Módulo | Relación |
|---|---|
| **Dashboard** | El `totalPending` aparece como alerta de "Deudas del negocio" |
| **Caja / Turno** | Los abonos salen como egresos del turno activo |
| **Inventario** | Las compras registradas crean lotes en `inventory_lots` |
| **Catálogo de Productos** | El costo de los lotes afecta el costo promedio ponderado |

---

## Lo que NO puede hacer

- **No genera órdenes de compra** — es solo un registro posterior a la compra, no un flujo de aprobación de pedidos.
- **No se conecta con facturas electrónicas** — no hay integración con la DIAN ni con sistemas de facturación; todo es registro manual.
- **No envía recordatorios de pago a proveedores** — no hay alertas automáticas cuando una deuda está por vencer.
- **No maneja múltiples cuotas** — una deuda es un monto total con una sola fecha de vencimiento. No se pueden registrar cuotas mensuales con fechas individuales.
- **No tiene historial de proveedores eliminados** — al eliminar un proveedor, se eliminan también todas sus deudas. No hay auditoría.

---

## Inconsistencias y Notas

> [!NOTE]
> **El tipo de deuda está simplificado a `'supplier'`**: el selector de tipo fue eliminado de la UI. Todas las deudas nuevas se crean como `type = 'supplier'`. Las deudas `'other'` creadas anteriormente siguen siendo visibles y gestionables, pero ya no existe el filtro por tipo en la pantalla — se eliminó junto con el selector porque era código muerto.

> [!NOTE]
> **Deudas sin `due_date` se clasifican como "Al Día"**: las deudas sin fecha de vencimiento entran al bucket "Al Día (No Vencido)". Registrar deudas sin fecha es un error de operación — siempre debe completarse ese campo para que el aging report sea confiable.

> [!NOTE]
> **Abonos sin turno activo no salen de caja**: si se hace un abono a proveedor sin turno activo, el sistema muestra una advertencia visible en el modal antes de confirmar (tanto desde `DebtsScreen` como desde el modal rápido en `SellScreen`). El abono se permite igualmente para no bloquear la operación, pero el usuario queda avisado de que el dinero no quedará registrado en caja. Ver también el mismo comportamiento en [`clientes_cuentas_cobrar.md`](./clientes_cuentas_cobrar.md).

> [!NOTE]
> **La clave de agrupación de deudas es el nombre del proveedor (string)**: la tabla `business_debts` guarda `creditor_name` como texto, no como FK a `suppliers`. Si se renombra un proveedor, las deudas antiguas quedan con el nombre viejo y el sistema crea dos grupos separados. La función `renameCreditor` en el hook actualiza el nombre en `business_debts` para mantener consistencia, pero si la operación falla parcialmente, los datos se fragmentan.

> [!NOTE]
> **El donut muestra `top 5 + "Otros"`**: si hay muchos proveedores con deuda, los del puesto 6 en adelante se agrupan sin desglose. El hover en "Otros" muestra el total agrupado pero no el listado individual. No hay forma de saber qué proveedores componen "Otros" sin ir a la lista.

> [!NOTE]
> **El color del proveedor en el donut es estable tras la primera asignación**: la primera vez que un proveedor aparece en el top 5, se le asigna un color de la paleta según su posición y ese color se persiste en la tabla `suppliers`. En sesiones posteriores el color siempre viene de la base de datos, sin importar si el ranking cambia.

---

## Evidencia fotográfica en movimientos (desde 2026-06-07)

Cada movimiento (`business_debts`) puede llevar **una imagen de evidencia** (factura, remisión o comprobante de pago) en la columna `evidence_url`. El objetivo es respaldar las transacciones para evitar inconvenientes con el proveedor.

- **Adjuntar al registrar:** los formularios de compra de inventario, gasto y abono incluyen un `<EvidenceUploader>` (cámara/galería) que comprime la imagen a WebP (máx. 800px) vía `useImageUpload('debt-evidence')` y la sube al bucket público `debt-evidence` bajo `${business_id}/`.
- **Consultar/editar:** en el historial del proveedor, los movimientos con evidencia muestran una miniatura; sin evidencia muestran un botón de clip para adjuntar. Al tocar se abre el `<EvidenceViewer>`, que permite **ver, ampliar, reemplazar, borrar y compartir por WhatsApp**.
- **Proveedor obligatorio:** todos los flujos (crédito y contado) exigen seleccionar/crear proveedor. Se eliminó el "Proveedor de Contado" automático.
- **Gasto de contado:** además de su registro en `expenses` (con `receipt_url`), crea una fila de movimiento del proveedor con badge "Contado" (`total_amount = paid_amount`, `status = 'paid'`, saldo 0 → no infla la deuda ni el Dashboard) para que su evidencia sea consultable aquí.
- **Offline:** adjuntar evidencia requiere conexión (la subida usa Storage). Si se registra offline, el movimiento se guarda sin foto y con aviso; el `evidenceUrl` viaja en el payload de `offlineQueue` cuando sí está disponible.

### Visor de evidencia (`components/EvidenceViewer.tsx`)

- Muestra la imagen con su contexto (proveedor · tipo · monto · fecha) y acciones **Reemplazar / Borrar / Compartir por WhatsApp**.
- **Ampliar:** la imagen tiene una etiqueta "Ampliar" que abre un **lightbox a pantalla completa** (`z-[130]`) con zoom (botones 100 %–500 % en pasos de 50 %, doble clic/tap alterna 1× ↔ 2.5×) y desplazamiento por scroll/arrastre. Pensado para comprobantes térmicos altos y poco legibles en miniatura.
- Reemplazar/borrar/adjuntar usan una instancia propia de `useImageUpload('debt-evidence')` y persisten vía `updateDebtEvidence(debtId, url|null)` de `useDebts`.

### Compartir por WhatsApp (`lib/shareEvidence.ts`)

Objetivo: que llegue la **imagen como foto** (no como documento ni como enlace).

1. La evidencia guardada es **WebP**; al compartir se **reexporta** vía `canvas`:
   - **JPG** (calidad 0.9) para `navigator.share({ files })` → WhatsApp la muestra como foto (un `.webp` se compartiría como documento). Funciona en móvil y en Chromium desktop (Windows) cuando `navigator.canShare({files})` es `true`; abre el selector del SO con la imagen adjunta.
   - **PNG** para el fallback de portapapeles (formato que `clipboard.write` soporta de forma confiable; el WebP suele fallar).
2. **Fallback** (sin Web Share de archivos): copia la imagen PNG al portapapeles, abre WhatsApp **app → web** (intenta `whatsapp://` y, detectando `blur`, cae a `web.whatsapp.com` tras 1.5 s — mismo patrón que `components/SuccessSidebar.tsx`) con **solo el caption** (sin el enlace de Supabase), y avisa "pega con Ctrl+V".
3. El **storage no cambia**: lo almacenado sigue siendo WebP; la conversión a JPG/PNG ocurre solo en el momento de compartir.

---

## Coexistencia con sidebar y Asistente IA

Los overlays de `DebtsScreen` usan `md:left-60` en desktop para dejar el sidebar (240 px) visible cuando hay un panel o modal abierto.

| Overlay | z-index | Notas |
|---|---|---|
| Panel de detalle del proveedor | z-[56] | Por encima del backdrop del chat (z-[54]); el chat siempre queda al frente (z-[110]) |
| Panel de proveedores del bucket (aging) | z-[65] | Bottom sheet en móvil / sidebar derecho en desktop |
| Modales internos (pago, edición, confirmación) | z-[60]–z-[80] | |

En mobile (`< md`) los overlays siguen cubriendo la pantalla completa porque el sidebar está oculto.
