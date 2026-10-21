# Plan de Implementación: Corrección de Descuentos en Órdenes y Pantalla de Ventas (SalesScreen)

## 📌 Contexto del Problema Real
A partir del análisis de la base de datos y el código, encontramos la raíz de la discrepancia que mencionas:
1. **Los descuentos por producto no estaban afectando el total de la orden en el momento en que se guardaban en la base de datos.** `App.tsx` enviaba a Supabase el total del carrito, pero calculaba el "Descuento" de manera errónea, ignorando el descuento global y los descuentos que traían los items internamente. Como resultado, Supabase guardaba que la orden tenía `discount = 0` y dejaba el `Total` de la orden más alto que lo que realmente cobraste (`amount_paid`).
2. **SalesScreen.tsx nunca fue programado para mostrar descuentos.** El código actualmente fuerza a que la línea de "Subtotal" imprima el `total` final de la base de datos, porque ni siquiera existe un renglón en pantalla que diga "Descuento".

## 🛠️ Objetivos
1. Corregir la forma en que `App.tsx` calcula y envía el "descuento global acumulado" a Supabase para que se guarde un registro matemáticamente perfecto: `Subtotal bruto - Total Cobrado = Descuento Real`.
2. Habilitar que `SalesScreen.tsx` lea correctamente los datos y sí muestre el verdadero `Subtotal`, un nuevo renglón de `Descuento`, y el `Total Final` de manera fidedigna según el recibo.

## 📝 Plan de Acción (Paso a Paso)

### Paso 1: Corregir envío de descuento a base de datos en `App.tsx`
Actualmente el arreglo que armamos el objeto `orderData` mapea la diferencia de `cartTotal` omitiendo los subtotales brutos.
-   **Edición en `App.tsx` (aprox. lína 1537):**
    En lugar de: `discount: details.amount < cartTotal ? cartTotal - details.amount : 0`
    Implementaremos el cálculo del Subtotal Bruto general (usando precio original por cantidad sin importar descuentos). El descuento será la resta exacta de ese "Subtotal Bruto" menos el "Monto Total Pagado Cobrado (`details.amount`)".
    *Cualquier diferencia, así provenga de múltiples productos con ofertas, un descuento manual genérico, o hasta el simple redondeo de $50 pesos, se enviará legalmente como `discount` hacia Supabase para mantener el balance 100% íntegro.*

### Paso 2: Ajustar visualización del Ticket Offline/Guardado (`App.tsx`)
-   Se replicará esta misma validación si el equipo está desconectado (`if(!isOnline)`) en su respectivo bloque de código interno.

### Paso 3: Rehabilitar la visualización del Descuento en `SalesScreen.tsx`
-   **Edición en `SalesScreen.tsx` (aprox. lína 440):**
    El pie de la factura móvil / desktop que resume la venta reemplazará las etiquetas para actuar correctamente:
    *   **Subtotal:** Cambia `{formatCurrency(selectedSale.total)}` por `{formatCurrency(selectedSale.subtotal)}`.
    *   **Se agrega bloque IF `selectedSale.discount > 0`:** Agregaremos una fila roja llamada "Dcto. (o Redondeo)" que muestre `-${formatCurrency(selectedSale.discount)}`.
    *   **Total Pagado / Final:** Seguirá imprimiendo el `amount_paid` u orden del `total` cobrado.

## 🤝 Preguntas para el Usuario (Tú)
Considerando que el sistema también hace un **Redondeo Oculto ($50 o $100 pesos)** automático hacia las centenas, esa pequeña diferencia redondeada se mezclará lógicamente con la cifra global del `Descuento`. Es decir, si el producto vale $50,550 y se formó en $50,500, la base de datos registrará un descuento "matemático" de $50 pesos.

**¿Estás de acuerdo con que el remanente del redondeo simplemente figure englobado/fusionado junto al concepto de "Descuentos" en la App y Recibos?** (La alternativa es que los decimales sueltos en un redondeo creen dolores de cabeza en contabilidad. Englobarlos en la categoría de Descuento es la opción estándar y correcta).

*Si el diagnóstico y el plan se ajustan a lo que necesitas, confírmamelo respondiendo a las preguntas.*
