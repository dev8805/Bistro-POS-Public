# Redondeo de Subtotal de Venta de a 100 Pesos - Plan de Implementación

**Objetivo:** Eliminar la regla de redondeo de 50 en 50 pesos en los ítems individuales por peso (`PriceInputModal.tsx`) y configurar el sistema para que aproxime el subtotal final del carrito al múltiplo de 100 más cercano (redondeo normal matemático: <= 49 a la baja, >= 50 a la alta).
**Arquitectura:** En lugar de manipular el precio en la entrada (al pesar los produdos), dejaremos el valor en su precio entero (pesos exactos). Luego, interceptaremos la sumatoria de todos los ítems (`cart.reduce(...)`) y realizaremos el redondeo a la centena más cercana `Math.round(valor / 100) * 100` antes de proceder al pago, aplicando esto en todas las pantallas.
**Tech Stack:** React, TypeScript, cálculos numéricos

---

## ✅ Decisiones Tomadas (Respuestas del Usuario)

1. **Impacto Visual en Recibos y Tickets:** El cliente simplemente verá los valores de Subtotal y Total redondeados a la centena, asumiendo implícitamente el descuadre con los ítems individuales. No se creará una línea extra de "Ajuste".
2. **Aplicación de Descuentos:** Se calculará el subtotal exacto de los ítems, se aplicará (restará) el descuento, y al resultado final (Total a Pagar) se le aplicará el redondeo de a 100 pesos.
3. **Módulo de Pedidos:** Mesas y domicilios no se usan por ahora, por lo que el enfoque será estrictamente en la venta rápida y las pantallas activas (`MenuScreen`, `PaymentScreen`, `PaymentSidebar`).

---

## 🛠 Plan Paso a Paso

### Tarea 1: Eliminar redondeo de 50 en Modal de Inserción ("PriceInputModal")

**Archivos:**
- Modify: `components/PriceInputModal.tsx:70-80`

**Paso 1: Remover la lógica de 50**
```javascript
// Removemos esta línea que aproxima de 50 en 50
// const calculatedPrice = Math.round((exactQty * product.price) / 50) * 50;

// Reemplazamos por la exacta (en pesos enteros):
const calculatedPrice = Math.round(exactQty * product.price); 
```

### Tarea 2: Centralizar el cálculo de Subtotal y Total en UI (Carrito Móvil y Desktop)

**Archivos:**
- Modify: `screens/MenuScreen.tsx`
- Modify: `screens/PaymentScreen.tsx`
- Modify: `components/PaymentSidebar.tsx`

**Paso 1: Modificar Hook `useMemo` del MenuScreen**
```javascript
// Convertir la sumatoria (grossSub) en una variable que no se redondea aquí
const rawGrossSub = cart.reduce((acc, item) => acc + Math.round(item.price * item.quantity), 0);
// discTotal = suma de descuentos...
const rawTotal = Math.max(0, rawGrossSub - discTotal);
const roundedTotal = Math.round(rawTotal / 100) * 100;

// Retornar roundedSubtotal globalmente al UI principal (como subtotal y/o total)
```

**Paso 2: Modificar los visores de Totales en PaymentScreen y PaymentSidebar**
```javascript
// PaymentScreen.tsx / PaymentSidebar.tsx
const rawSubtotal = cart.reduce((acc, item) => acc + Math.round(item.price * item.quantity), 0);
// Descuentos...
const rawTotal = Math.max(0, rawSubtotal - totalesDescuento);
const roundedTotal = Math.round(rawTotal / 100) * 100;
// Renderizar `roundedTotal` en pantalla en vez del cálculo "al vuelo" del html.
```

### Tarea 3: Modificar el cálculo que viaja a Base de Datos (`App.tsx`)

**Archivos:**
- Modify: `App.tsx` (en función `handleProcessPayment`)

**Paso 1: Generar el objeto Data de Base de datos con el cálculo final**
```javascript
const rawSubtotal = cart.reduce((acc, item) => acc + Math.round(item.price * item.quantity), 0);
// Aplicar descuento
const rawTotal = Math.max(0, rawSubtotal - totalDiscount);
const roundedTotal = Math.round(rawTotal / 100) * 100;
const diffRevertidaAlDescuento = (rawSubtotal - rawTotal) + (rawTotal - roundedTotal);

// orderData y setReceiptData se alimentarán usando roundedTotal
```

### Tarea 4: Asegurar la impresión de Comprobantes Térmicos y PDFs

**Archivos:**
- Modify: Nada (ya que usan `ReceiptData` que vendrá redondeado).

**Paso 1: Validar el objeto ReceiptData**
Al pasar `total` (que estará redondeado) y `subtotal` exacto y la diferencia al "Descuento", los layouts térmicos y PDFs pintarán correctamente sin necesidad de tocar su maquetación.
