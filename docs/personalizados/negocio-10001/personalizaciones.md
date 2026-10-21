# Personalizaciones — Negocio 10001 ("Mi Negocio")

| Dato | Valor |
|------|-------|
| **public_id** | `10001` |
| **UUID** | `9ab00944-b41b-47bd-b595-9aaea024d777` |
| **Constante en código** | `HIDDEN_PRICES_BUSINESS_ID` en `lib/specialBusinesses.ts` |
| **Nombre** | Mi Negocio |

---

## 1. Precios ocultos en pantallas de suscripción

**Descripción:** Los montos de suscripción (precio mensual, facturas, próximo pago) se reemplazan por `'—'` o texto neutro (`'Plan activo'`, `'Activado'`) en todas las superficies NO autorizadas.

**Superficies autorizadas (SÍ muestran precio):**
- `CustomPlanCard` en la tab "Planes"
- `CustomPlanBlockedScreen` (pantalla de bloqueo fuera de gracia)
- Widget de Wompi (checkout)

**Archivos afectados:**

| Archivo | Qué se oculta |
|---------|---------------|
| `screens/SubscriptionManagementScreen.tsx` | Resumen del plan → "Plan activo"; facturas → "—"; aviso próximo pago → sin monto |
| `screens/SubscriptionPlansScreen.tsx` | Precio en modal checkout → "—"; confirmación → "Activado"; tarjetas de plan → "—" sin sufijo |

**Condición en código:**
```tsx
import { HIDDEN_PRICES_BUSINESS_ID } from '../lib/specialBusinesses';
profile?.business_id === HIDDEN_PRICES_BUSINESS_ID
```

> ⚠️ En `SubscriptionPlansScreen.tsx` el UUID está hardcodeado directamente (4 comparaciones con `'9ab00944-b41b-47bd-b595-9aaea024d777'`) en vez de usar la constante.

---

## 2. Plan de suscripción personalizado

**Descripción:** El negocio tiene un plan exclusivo asignado vía `subscription_plans.assigned_business_id`. No ve el catálogo público de planes (Mensual/Trimestral/Anual), sino solo su `CustomPlanCard`.

**Comportamiento:**
- Tab "Planes" → muestra `CustomPlanCard` con monto y botón "Pagar"
- Pago vía widget de Wompi (helper `lib/customPlanCheckout.ts`)
- Cada pago extiende la suscripción 1 mes
- Hook: `useCustomPlan()` en `hooks/useCustomPlan.ts`

---

## 3. Pantalla de bloqueo personalizada (fuera de gracia)

**Descripción:** Cuando la suscripción vence y pasa el período de gracia (>48h):
- **Admin** (`admin_settings`): ve `CustomPlanBlockedScreen` con el monto y botón "Pagar ahora" (Wompi)
- **Empleado sin admin_settings**: ve pantalla genérica "contacta a soporte"

**Archivo:** `components/CustomPlanBlockedScreen.tsx`

---

## 4. Menú "Suscripciones" visible

**Descripción:** El negocio 10001 ve la entrada "Suscripciones" en el sidebar y perfil porque tiene un plan personalizado asignado + permiso `admin_settings`.

**Lógica:** `canSeeSubscriptionMenu(businessId, hasCustomPlan, hasAdminSettings)` en `lib/specialBusinesses.ts`

**Archivos:** `components/Sidebar.tsx`, `screens/HomeScreen.tsx`

---

## 5. Migración de tipo de producto (datos)

**Descripción:** Se migraron 133 productos de tipo `'simple'` (Retail) a `'processed'` (Receta) con `stock = NULL`. Esto fue una operación manual sobre datos, no un cambio de UI.

**Rollback disponible:** `supabase/rollback_negocio10001_tipo_producto.sql`

---

## 6. Dashboard — Top 50 + impresión QZ + pestaña "Ingreso" primero + descarga PDF

> ✅ **Implementado** (2026-08-16)

**Cambios aplicados (solo para negocio 10001):**

1. **Top 50 productos** en pantalla (en vez de Top 10)
2. **Pestaña "Ingreso" primero** (el default para otros negocios es "Ganancia")
3. **Botón "Imprimir" (🖨️)** que:
   - Si QZ Tray está conectada → imprime por térmica (ESC/POS, sin tildes, todos los productos sin límite)
   - Si QZ no está conectada → abre pestaña del navegador con `window.print()`
4. **Botón "Descargar PDF" (📄)** — descarga directa como `top_productos_YYYY-MM-DD.pdf` usando `@react-pdf/renderer`

**Archivos involucrados:**
- `screens/DashboardScreen.tsx` — lógica condicional con `isNegocio10001`
- `components/TopProductsPDF.tsx` — componente React-PDF para la descarga

**Condición en código:**
```tsx
import { HIDDEN_PRICES_BUSINESS_ID } from '../lib/specialBusinesses';
const isNegocio10001 = profile?.business_id === HIDDEN_PRICES_BUSINESS_ID;
```

**Notas técnicas:**
- La impresión QZ usa `getRegisteredPrinters()[0].name` — no requiere impresora predeterminada de ticket
- Los nombres de productos se pasan por `strip()` (quita tildes) antes del encoder ESC/POS
- Se agregan 5 `newline()` antes del `cut()` para evitar que el total quede cortado

---

## 7. Cierre de turno — botón "Productos" (top de productos vendidos del turno)

> ✅ **Implementado** (2026-08-30)

**Descripción:** En el detalle de un turno **cerrado**, junto a los botones del reporte diario (Imprimir / PDF / Correo), se agrega un botón **"Productos"** (ícono 🖨️ `print`, color `amber`) que imprime el top de productos vendidos **de ese turno**, ordenado **por ingreso** (no hay pestaña Ingreso/Ganancia como en el Dashboard).

**Comportamiento:**
1. Consulta las órdenes `completed` del turno por **ventana de tiempo** (`business_id` + `opened_at` → `closed_at`, sin filtrar por cajero) — la misma ventana que usa `total_sales`, así el total del ticket cuadra con el turno.
2. Agrega por `product_name` sumando `quantity` e ingreso (`order_items.total_price`), filtra `income > 0` y ordena de mayor a menor ingreso.
3. Enrutamiento de impresora: **reutiliza el flujo del reporte diario** — si hay `Impresora_Predeterminada_Ticket` imprime directo; si no, despliega la lista de impresoras registradas para elegir (misma lista `showReportPrinterList`). Una ref `pendingPrintActionRef` (`'report' | 'top'`) recuerda qué acción disparar tras elegir.
4. **Turnos offline** (`id` empieza con `offline_`): el botón avisa que los productos no están disponibles sin conexión y no imprime.
5. **Desglose de descuentos y ajuste al peso:**
   - **Descuentos por producto:** Se imprimen debajo de cada producto con su número de orden (`> Dcto (#1749)`) a la izquierda y el monto (`-$410`) alineado a la derecha en la columna **Valor**.
   - **Descuentos globales:** Se imprimen en una línea dedicada a la izquierda (`> Dcto global (#1750): -$780`).
   - **Ajuste al peso:** Calcula la diferencia por redondeo legal a $50 por orden. Si hay descuentos o ajuste, se imprimen las líneas `SUBTOTAL`, `DESCUENTOS`, `AJUSTE AL PESO` y `TOTAL VENTAS`, garantizando cuadre matemático exacto con el dinero real cobrado. En la pantalla del detalle del turno también se visualiza la tarjeta de ajuste al peso.

**Layout de los botones de acción del detalle (adaptativo según negocio):**

El panel de caja es angosto (`max-w-md` ≈ 448px en App.tsx), por eso la barra de acciones se distribuye distinto según cuántos botones haya:

```
Negocio 10001 / 10000 (4 botones)   Otros negocios (3 botones)
┌──────────────────────────┐        ┌──────────────────────────┐
│ [← Atrás]                 │        │ [← Atrás]  [Impr][PDF][✉] │
│ [Impr][PDF][✉][Productos] │        └──────────────────────────┘
└──────────────────────────┘         (misma fila, no gasta fila extra)
 (fila propia, botones flex-1)
```

- El JSX de los botones se extrae en `renderShiftDetailActions(layout)`: `layout='inline'` (compactos, misma fila que "Atrás", para negocios normales) y `layout='row'` (`flex-1` a ancho completo, fila propia, negocio 10001 y 10000 de pruebas).
- El popup de selección de impresora se extrae en `renderPrinterPickerPopup(align)` (`right-0` inline / `right-4` en fila propia).
- Los 4 botones conservan **texto + ícono**. El botón "Productos" usa ícono `print` (igual que Imprimir).

**Archivos involucrados:**
- `screens/CashRegisterScreen.tsx` — `isNegocio10001`, `runPrintTopProducts()`, `handlePrintTopProducts()`, helpers `renderShiftDetailActions()` / `renderPrinterPickerPopup()`, y el render condicional del layout (inline vs fila propia)

**Condición en código:**
```tsx
import { HIDDEN_PRICES_BUSINESS_ID, TEST_BUSINESS_ID } from '../lib/specialBusinesses';
const isNegocio10001 = profile?.business_id === HIDDEN_PRICES_BUSINESS_ID || profile?.business_id === TEST_BUSINESS_ID;
```

**Notas técnicas:**
- Encabezado del ticket muestra `Turno #<shift_number>` (no hay filtro de modo).
- Anchos de columna reutilizados del Dashboard: `valW = is58 ? 10 : 12`, `qtyW = is58 ? 4 : 5`, `nameW = columns - qtyW - valW`; nombres largos se truncan a `nameW-1 + '.'`.
- 5 `newline()` antes del `cut()`, igual que el top del Dashboard.

---

## 8. Egresos — Ocultar opción "Compra de inventario" (Desktop y Móvil)

> ✅ **Implementado** (2026-09-14)

**Descripción:** Al pulsar el botón "Egresos" (tanto el menú desplegable en Desktop como el panel inferior / bottom sheet en Móvil), se oculta la opción **"Compra de inventario"**, dejando disponibles únicamente **"Gastos"** y **"Merma"**.

**Archivos involucrados:**
- `components/expense/ExpenseActionsMenu.tsx` — filtrado condicional de opciones manuales excluyendo `'inventory'` para el negocio 10001.
- `screens/HomeScreen.tsx` — subtítulo de la tarjeta de Egresos en Inicio adaptado a `"Gasto · merma"`.
- `components/expense/ExpenseActionsMenu.test.tsx` — pruebas unitarias validando Desktop (dropdown) y Móvil (sheet).

**Condición en código:**
```tsx
import { HIDDEN_PRICES_BUSINESS_ID } from '../../lib/specialBusinesses';
const isNegocio10001 = profile?.business_id === HIDDEN_PRICES_BUSINESS_ID;
```

---

## Historial de cambios

| Fecha | Personalización | Estado |
|-------|----------------|--------|
| — | Precios ocultos en suscripciones | ✅ Implementado |
| — | Plan personalizado asignado | ✅ Implementado |
| — | CustomPlanBlockedScreen | ✅ Implementado |
| — | Menú Suscripciones visible | ✅ Implementado |
| — | Migración tipo producto (133 prods) | ✅ Aplicado en BD |
| 2026-08-16 | Dashboard: top 50, pestaña ingreso, impresión QZ, descarga PDF | ✅ Implementado |
| 2026-08-30 | Cierre de turno: botón "Productos" (top vendidos del turno por ingreso) | ✅ Implementado |
| 2026-09-02 | Cierre de turno: soporte de descuentos por ítem/globales y ajuste al peso en ticket y pantalla (habilitado en 10001 y 10000) | ✅ Implementado |
| 2026-09-14 | Egresos: ocultar opción "Compra de inventario" en Desktop y Móvil | ✅ Implementado |

