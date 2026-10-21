# Comprobante PDF WhatsApp - Plan de Implementación

**Objetivo:** Generar un comprobante de venta en formato PDF profesional y permitir compartirlo por WhatsApp después de finalizar una transacción.

**Arquitectura:** Usar la librería `@react-pdf/renderer` para generar un PDF profesional con React components. El PDF se genera en memoria como Blob y se comparte usando la Web Share API (`navigator.share`).

**Tech Stack:** React, TypeScript, @react-pdf/renderer, Web Share API

---

## 📋 Resumen del Flujo

```
Usuario finaliza venta → Pantalla de Éxito → Click "Compartir" → Se genera PDF → Menú nativo → WhatsApp
```

---

## 🎨 Diseño del Comprobante PDF

El comprobante será un PDF limpio y profesional sin emojis:

```
┌─────────────────────────────────────────┐
│                                         │
│         NOMBRE DEL NEGOCIO              │
│         Calle 123 #45-67, Bogotá        │
│         Tel: 310 123 4567               │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  Fecha: 8 Feb 2026  •  11:43 PM         │
│  Cliente: Juan Pérez                    │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  DETALLE DE COMPRA                      │
│                                         │
│  Cant.  Descripción         Subtotal    │
│  ─────────────────────────────────────  │
│  2      Hamburguesa Clásica   $30,000   │
│         $15,000 c/u                     │
│                                         │
│  1      Coca Cola              $3,500   │
│                                         │
│  1      Papas Fritas           $4,500   │
│         Desc. 10%                       │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  Subtotal:                    $38,500   │
│  Descuento:                     -$500   │
│  ─────────────────────────────────────  │
│  TOTAL:                       $38,000   │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│  Método de pago: Efectivo               │
│  Pagado: $40,000                        │
│  Cambio: $2,000                         │
│                                         │
│  ─────────────────────────────────────  │
│                                         │
│         ¡Gracias por su compra!         │
│                                         │
└─────────────────────────────────────────┘
```

**Características del diseño:**
- Tipografía limpia (Helvetica)
- Sin emojis
- Bordes sutiles
- Espaciado profesional
- Colores: Negro para texto, gris para líneas
- Tamaño: Ticket térmico simulado (80mm ancho aprox.)

---

## 📦 Dependencia Nueva

```bash
npm install @react-pdf/renderer
```

**¿Por qué @react-pdf/renderer?**
- Permite crear PDFs usando componentes React (familiar)
- Usa estilos similares a React Native (Flexbox)
- Genera PDFs en el navegador sin servidor
- Es la librería más popular y mantenida para React

---

## 📦 Datos Necesarios

| Dato | Origen | Estado Actual |
|------|--------|---------------|
| Nombre del negocio | `businesses.name` | ✅ Disponible |
| Teléfono negocio | `businesses.phone` | ✅ Disponible en DB |
| Dirección negocio | `businesses.address` | ✅ Disponible en DB |
| Productos vendidos | `cart[]` | ⚠️ No llega a SuccessScreen |
| Descuentos por item | `cart[].discount` | ⚠️ No llega a SuccessScreen |
| Total | `transaction.amount` | ✅ Disponible |
| Método de pago | `transaction.method` | ✅ Disponible |
| Cambio | `transaction.change` | ✅ Disponible |
| Fecha | `transaction.date` | ✅ Disponible |
| Cliente | `transaction.customer` | ✅ Disponible |

---

## 🔧 Tareas de Implementación

### Tarea 1: Instalar dependencia

**Comando:**
```bash
npm install @react-pdf/renderer
```

---

### Tarea 2: Crear tipos de datos

**Archivo:** `types.ts`

**Agregar:**
```typescript
export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  discountPercent?: number;
  total: number;
}

export interface ReceiptData {
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
}
```

---

### Tarea 3: Extender hook de business settings

**Archivo:** `hooks/useBusinessSettings.ts`

**Cambio:** Agregar `name`, `phone`, `address` al select

---

### Tarea 4: Crear componente PDF del comprobante

**Archivo a crear:** `components/ReceiptPDF.tsx`

Este componente usa `@react-pdf/renderer` para definir la estructura del PDF:

```typescript
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

// Componente que define el documento PDF
const ReceiptPDF = ({ data }: { data: ReceiptData }) => (
  <Document>
    <Page size={[226.77, 400]} style={styles.page}>
      {/* Header con nombre del negocio */}
      {/* Lista de productos */}
      {/* Totales */}
      {/* Footer */}
    </Page>
  </Document>
);
```

---

### Tarea 5: Crear función para generar y compartir PDF

**Archivo a crear:** `lib/shareReceiptPDF.ts`

**Funcionalidad:**
1. Renderiza el componente PDF a Blob usando `pdf().toBlob()`
2. Crea un objeto File con el Blob
3. Usa `navigator.share({ files: [file] })` para compartir
4. Fallback: Descargar el PDF si share no está disponible

```typescript
import { pdf } from '@react-pdf/renderer';

export const shareReceiptPDF = async (data: ReceiptData) => {
  // 1. Generar el PDF como Blob
  const blob = await pdf(<ReceiptPDF data={data} />).toBlob();
  
  // 2. Crear archivo
  const file = new File([blob], 'comprobante.pdf', { type: 'application/pdf' });
  
  // 3. Verificar si podemos compartir archivos
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({
      files: [file],
      title: 'Comprobante de venta',
    });
  } else {
    // Fallback: Descargar el archivo
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'comprobante.pdf';
    a.click();
  }
};
```

---

### Tarea 6: Actualizar App.tsx

**Cambios:**
1. Guardar el carrito antes de limpiarlo al procesar el pago
2. Obtener datos del negocio
3. Crear objeto `ReceiptData` completo
4. Pasarlo a SuccessScreen y SuccessSidebar

---

### Tarea 7: Conectar botón "Compartir"

**Archivos a modificar:**
- `screens/SuccessScreen.tsx`
- `components/SuccessSidebar.tsx`

**Cambios:**
1. Recibir `receiptData` como prop
2. Al hacer clic en "Compartir", llamar a `shareReceiptPDF(receiptData)`
3. Mostrar loading mientras se genera el PDF

---

## 📁 Estructura de Archivos

```
lib/
├── shareReceiptPDF.ts    ← NUEVO: Genera y comparte el PDF

components/
├── ReceiptPDF.tsx        ← NUEVO: Componente del documento PDF
├── SuccessSidebar.tsx    ← MODIFICAR: Conectar botón
└── ...

hooks/
├── useBusinessSettings.ts ← MODIFICAR: Agregar datos de contacto
└── ...

screens/
├── SuccessScreen.tsx      ← MODIFICAR: Conectar botón
└── ...

types.ts                   ← MODIFICAR: Agregar ReceiptData, ReceiptItem
App.tsx                    ← MODIFICAR: Pasar receiptData
```

---

## ⚠️ Consideraciones Importantes

1. **Nueva dependencia:** Se agrega `@react-pdf/renderer` (~500KB)

2. **Compatibilidad Web Share API:**
   - ✅ Funciona en: Chrome Android, Safari iOS, Edge Android
   - ⚠️ Limitado en: Chrome Desktop (solo texto/url, no archivos)
   - Fallback: Descarga automática del PDF en desktop

3. **Sin cambios en base de datos:** No se requieren migraciones

4. **Performance:** La generación del PDF es rápida (~100-200ms) pero mostraremos un loading

5. **Tamaño del PDF:** ~50-100KB por comprobante (muy ligero)

---

## ✅ Criterios de Aceptación

- [ ] Instalar @react-pdf/renderer sin conflictos
- [ ] El PDF se genera correctamente con todos los datos
- [ ] Diseño limpio y profesional (sin emojis)
- [ ] En móvil: Se abre menú de compartir nativo
- [ ] En desktop: Se descarga el PDF automáticamente
- [ ] El PDF muestra: negocio, productos, descuentos, total, método de pago
- [ ] No se rompe ninguna funcionalidad existente

---

## 🚀 Orden de Implementación

| # | Tarea | Tiempo Est. |
|---|-------|-------------|
| 1 | Instalar @react-pdf/renderer | 1 min |
| 2 | Crear tipos ReceiptData | 3 min |
| 3 | Extender useBusinessSettings | 5 min |
| 4 | Crear componente ReceiptPDF | 15 min |
| 5 | Crear shareReceiptPDF | 5 min |
| 6 | Actualizar App.tsx | 10 min |
| 7 | Conectar botones en pantallas de éxito | 10 min |
| 8 | Testing manual | 5 min |

**Tiempo estimado total:** ~55 minutos

---

## 📝 Notas Adicionales

- **Botón "Imprimir":** Una vez implementado el PDF, se puede reutilizar para imprimir usando `window.print()` o abriendo el PDF en nueva pestaña
- **Botón "Correo":** Se puede adjuntar el PDF como archivo usando `mailto:` con el PDF guardado, o simplemente abrir cliente de correo
- **Logo del negocio:** Se puede agregar después si `logo_url` existe en la tabla businesses
