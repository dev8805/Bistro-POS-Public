# Impresión Térmica en Bistro POS — Plan de Implementación

**Objetivo:** Permitir que los usuarios de Bistro POS impriman comprobantes de venta en impresoras térmicas de 58mm y 80mm directamente desde la app web.

**Arquitectura:** Web app (React + Vite) hosteada en Firebase Hosting, usando `window.print()` con CSS optimizado para tickets térmicos. Sin software adicional obligatorio.

**Tech Stack:** React, CSS `@media print`, Web API `window.print()`

---

## ✅ Decisiones Confirmadas

| Pregunta | Decisión |
|----------|----------|
| Ancho de papel | **Ambos: 80mm y 58mm** (configurable por negocio) |
| Modo de impresión | **Manual con botón** — el cajero decide cuándo imprimir |
| Datos extra en ticket | **NIT del negocio** (campo nuevo en `businesses`) |
| Cajón de dinero | No necesario |
| Comandas para cocina | No por ahora |
| Estado de producción | En producción con negocios de prueba |
| Impresora de prueba | Pendiente de adquirir |

### 🖨️ Impresora Recomendada para Pruebas

**Xprinter XP-80C** (~$30-40 USD en Amazon/MercadoLibre)
- Conexión USB (plug & play en Windows)
- Papel de 80mm (el estándar en negocios)
- Compatible con la estrategia CSS `@media print`
- También puedes probar formato 58mm en ella (solo cambia el ancho del contenido)

---

## 📊 Análisis de la App Actual

### ¿Qué existe hoy?

| Canal | Archivo | Cómo funciona |
|-------|---------|---------------|
| **WhatsApp** | `lib/shareReceiptPDF.ts` → `shareReceiptToWhatsApp()` | Genera imagen PNG con `html2canvas` y la comparte |
| **Email** | `lib/shareReceiptPDF.ts` → `sendReceiptByEmailDirect()` | Genera PDF con `@react-pdf/renderer` y lo envía via Edge Function |
| **Imprimir** | `lib/shareReceiptPDF.ts` → `printReceipt()` | Abre `window.open()` con el HTML del recibo y llama `window.print()` |

### Componentes clave:
- `ReceiptHTML.tsx` — Comprobante HTML (600px, formato digital, NO apto para térmicas)
- `ReceiptPDF.tsx` — Versión PDF para email
- `SuccessSidebar.tsx` — Panel post-venta desktop (botones: Compartir, Email)
- `SuccessScreen.tsx` — Pantalla post-venta mobile (mismos botones)
- `types.ts` → `ReceiptData` — Interface con la data del comprobante

### Datos disponibles en ReceiptData:
```typescript
interface ReceiptData {
  businessName: string;
  businessPhone?: string;
  businessAddress?: string;
  items: ReceiptItem[];
  subtotal: number;
  totalDiscount: number;
  total: number;
  paymentMethod: string;
  amountPaid?: number;
  change?: number;
  customerName: string;
  date: string;
  sellerName?: string;
  orderNumber?: number;
}
```

### Estado de la BD (tabla `businesses`):
- ✅ `name`, `phone`, `address` — ya existen
- ❌ `nit` — **NO EXISTE**, hay que agregarlo
- ❌ `receipt_paper_width` — **NO EXISTE**, hay que agregarlo

---

## 🏗️ Estrategia: CSS `@media print`

Crear un componente `ReceiptThermal.tsx` con HTML optimizado para papel térmico, inyectarlo en un iframe oculto y llamar `window.print()`.

**Ventajas:** Cero software extra, funciona con CUALQUIER impresora reconocida por el SO, sin internet para imprimir, universal (Windows/Mac/Linux).

---

## 📋 Tareas de Implementación

### Tarea 1: Migración DB — Agregar `nit` y `receipt_paper_width` a `businesses`

**Archivos:**
- Migration SQL en Supabase

```sql
ALTER TABLE businesses
  ADD COLUMN nit text DEFAULT NULL,
  ADD COLUMN receipt_paper_width text DEFAULT '80mm'
    CHECK (receipt_paper_width IN ('58mm', '80mm'));
```

---

### Tarea 2: Actualizar `BusinessSettingsContext.tsx`

**Archivos:**
- Modify: `context/BusinessSettingsContext.tsx`

Agregar los nuevos campos al context:
- `nit: string | null` — NIT del negocio
- `receiptPaperWidth: '58mm' | '80mm'` — Ancho del papel
- `updateNit(nit: string)` — Función para actualizar NIT
- `updateReceiptPaperWidth(width: '58mm' | '80mm')` — Función para actualizar ancho

---

### Tarea 3: Actualizar `types.ts` — Agregar `businessNit` a `ReceiptData`

**Archivos:**
- Modify: `types.ts`

```typescript
interface ReceiptData {
  // ... campos existentes
  businessNit?: string;     // NIT del negocio (NUEVO)
}
```

---

### Tarea 4: Crear `components/ReceiptThermal.tsx`

**Archivos:**
- Create: `components/ReceiptThermal.tsx`

Componente HTML optimizado para papel térmico:
- **80mm:** 72mm imprimibles ≈ 48 caracteres por línea (monospace)
- **58mm:** 48mm imprimibles ≈ 32 caracteres por línea (monospace)
- Fuente monospace (`Courier New`) para alinear columnas
- Solo blanco y negro (sin colores)
- Líneas divisoras con caracteres (`=`, `-`)

**Layout del ticket:**
```
================================
    NOMBRE DEL NEGOCIO
    NIT: 900.123.456-7
    Tel: 301 234 5678
    Dirección del negocio
================================
Fecha: 06 Mar 2026  14:30
Orden #: 42
Cajero: Juan Pérez
Cliente: María García
--------------------------------
Cant  Descripción        Subtotal
  2   Hamburguesa       $24.000
  1   Coca Cola          $5.000
  1   Papas Fritas       $8.000
      Desc: -10%        -$2.400
--------------------------------
Subtotal:              $37.000
Descuento:             -$2.400
TOTAL:                 $34.600
================================
Método: Efectivo
Pagado: $50.000
Cambio: $15.400
================================
   ¡Gracias por su compra!
================================
```

Props:
```typescript
interface ReceiptThermalProps {
  data: ReceiptData;
  paperWidth: '58mm' | '80mm';
}
```

---

### Tarea 5: Crear `printThermalReceipt()` en `lib/shareReceiptPDF.ts`

**Archivos:**
- Modify: `lib/shareReceiptPDF.ts`

Nueva función:
1. Crea un `<iframe>` oculto
2. Inyecta el HTML del `ReceiptThermal` con estilos `@media print` que:
   - Eliminan márgenes del navegador
   - Establecen ancho del papel (58mm o 80mm)
   - Ocultan header/footer del navegador
3. Llama `iframe.contentWindow.print()`
4. Limpia el iframe tras cerrar el diálogo

```typescript
export const printThermalReceipt = async (
  data: ReceiptData,
  paperWidth: '58mm' | '80mm'
): Promise<void> => { ... }
```

---

### Tarea 6: Agregar botón "Imprimir Ticket" en pantallas post-venta

**Archivos:**
- Modify: `components/SuccessSidebar.tsx`
- Modify: `screens/SuccessScreen.tsx`

Agregar un botón con ícono `print` que llame a `printThermalReceipt()`.
El botón va junto a los botones existentes de Compartir y Email.

Necesita recibir `paperWidth` desde el `BusinessSettingsContext`.

---

### Tarea 7: Pasar `businessNit` al `ReceiptData` donde se construye

**Archivos:**
- Buscar donde se construye el objeto `ReceiptData` (probablemente en `App.tsx` o en el flujo de pago)
- Agregar `businessNit` desde el context

---

### Tarea 8: UI de configuración en ProfileScreen

**Archivos:**
- Modify: `screens/ProfileScreen.tsx`

Agregar en la sección de configuración del negocio:
1. **Campo NIT** — Input de texto para el NIT del negocio
2. **Selector de ancho de papel** — Toggle o select: `58mm | 80mm`

---

## 🔧 Cómo dejarle funcionando a un dueño de negocio

### Checklist:
1. **Comprar impresora térmica USB de 80mm** (Xprinter XP-80C, ~$30-50 USD)
2. **Conectar al PC/laptop por USB** (Windows la detecta automáticamente)
3. **Si no la detecta:** instalar driver del fabricante (2 min)
4. **Abrir Bistro POS en Chrome**
5. **Ir a Perfil → Configuración**:
   - Ingresar NIT del negocio
   - Seleccionar ancho de papel (58mm o 80mm)
6. **Hacer una venta de prueba** → Click en "Imprimir Ticket"
7. **En el diálogo de Chrome:** seleccionar la impresora térmica
8. **Tip:** Marcar la impresora como predeterminada para no seleccionarla cada vez

### ¿Necesita internet para imprimir?
**NO.** La impresión es entre el navegador y la impresora, 100% local.

---

## 📅 Estimación

| Tarea | Tiempo |
|-------|--------|
| 1. Migración DB | 5 min |
| 2. BusinessSettingsContext | 15 min |
| 3. types.ts | 2 min |
| 4. ReceiptThermal.tsx | 30 min |
| 5. printThermalReceipt() | 15 min |
| 6. Botones en Success* | 15 min |
| 7. Pasar businessNit | 10 min |
| 8. UI en ProfileScreen | 20 min |
| **Total** | **~2 horas** |

---

## 🚀 Checklist de Implementación

- [x] 1. Migración DB (nit + receipt_paper_width)
- [x] 2. BusinessSettingsContext (leer/escribir nuevos campos)
- [x] 3. types.ts (agregar businessNit a ReceiptData)
- [x] 4. ReceiptThermal.tsx (componente visual del ticket)
- [x] 5. printThermalReceipt() (función de impresión)
- [x] 6. Pasar businessNit al ReceiptData donde se construye
- [x] 7. Botones "Imprimir Ticket" en SuccessSidebar + SuccessScreen
- [x] 8. UI de configuración (NIT + ancho papel) en ProfileScreen
