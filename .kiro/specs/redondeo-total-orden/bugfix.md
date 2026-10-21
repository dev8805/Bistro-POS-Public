# Bugfix Requirements Document

## Introduction

Esta corrección, **Redondeo del Total de la Orden**, arregla el cálculo del total de las ventas en Bistro POS. En Colombia no existen denominaciones menores a $50, por lo que el total de cada venta debe redondearse al múltiplo de $50 más cercano: `total = round((subtotal − descuento + impuesto) / 50) * 50`.

Hoy la aplicación (venta online en `createOrder()` y venta offline en `syncSale()`) calcula y guarda el total redondeado correctamente. Sin embargo, un recálculo posterior en la base de datos sobrescribe ese valor con un total **sin redondear**, por lo que el importe final que se persiste, se muestra al cliente y se propaga a los pagos y al reporte de cierre de turno queda mal.

Ejemplo real reportado: producto "Cebolla cabezona" vendido por peso (2,59 kg × $1.800 = $4.662). El sistema guarda y muestra $4.662 cuando debería mostrar $4.650 (múltiplo de 50 más cercano). Verificado en la orden #1694.

El objetivo del fix es garantizar que el total redondeado a 50 sea el valor **finalmente persistido** (tanto online como offline), y que ese mismo valor sea consistente entre el total mostrado, el total pagado y el reporte de turno. El cálculo de subtotal, descuento e impuesto no debe cambiar; el redondeo aplica únicamente sobre el total final.

### Condición del Bug (Bug Condition)

Definición de los datos que disparan el bug y del comportamiento correcto esperado.

```pascal
// C(X): identifica ventas cuyo total quedó sin redondear a 50
FUNCTION isBugCondition(orden)
  INPUT: orden con campos { subtotal, discount, tax, total }
  OUTPUT: boolean

  RETURN orden.total <> round((orden.subtotal - orden.discount + orden.tax) / 50) * 50
END FUNCTION
```

```pascal
// Propiedad: Fix Checking — el total persistido debe estar redondeado a 50
FOR ALL orden WHERE isBugCondition(orden) DO
  result <- F'(orden)
  ASSERT result.total = round((orden.subtotal - orden.discount + orden.tax) / 50) * 50
END FOR
```

```pascal
// Propiedad: Preservation Checking — las ventas ya correctas no cambian
FOR ALL orden WHERE NOT isBugCondition(orden) DO
  ASSERT F(orden) = F'(orden)
END FOR
```

Donde **F** es el comportamiento actual (total sin redondear tras el recálculo) y **F'** es el comportamiento corregido (total redondeado a 50 persistido de forma definitiva).

## Bug Analysis

### Current Behavior (Defect)

Lo que ocurre hoy cuando se registra una venta cuyo total no es múltiplo de 50.

1.1 CUANDO se finaliza una venta cuyo total (subtotal − descuento + impuesto) no es múltiplo de 50 ENTONCES el Sistema persiste y muestra el total sin redondear (ej. $4.662 en vez de $4.650).

1.2 CUANDO se vende un producto por peso/medida cuyo importe no cae en un múltiplo de 50 (ej. 2,59 kg × $1.800 = $4.662) ENTONCES el Sistema guarda y muestra $4.662.

1.3 CUANDO se consulta el detalle de la orden afectada o el historial de ventas ENTONCES el Sistema muestra el total no redondeado.

1.4 CUANDO el total no redondeado se propaga a los pagos y al reporte de cierre de turno ENTONCES el Sistema refleja importes inconsistentes con el efectivo realmente cobrado al cliente.

### Expected Behavior (Correct)

Lo que debería ocurrir en su lugar para las mismas condiciones.

2.1 CUANDO se finaliza una venta cuyo total no es múltiplo de 50 ENTONCES el Sistema DEBERÁ persistir y mostrar el total redondeado al múltiplo de 50 más cercano, aplicando `round((subtotal − descuento + impuesto) / 50) * 50` (ej. $4.650).

2.2 CUANDO la venta se registra offline y luego se sincroniza ENTONCES el Sistema DEBERÁ persistir el mismo total redondeado que en el flujo online, sin diferencias entre ambos caminos.

2.3 CUANDO el total redondeado queda guardado ENTONCES el Sistema DEBERÁ propagar ese mismo valor redondeado a los pagos y al reporte de cierre de turno, de modo que total mostrado, total pagado y reporte coincidan.

2.4 CUANDO se agregan, editan o eliminan ítems de una orden y el total se recalcula ENTONCES el Sistema DEBERÁ volver a aplicar el redondeo a 50 sobre el nuevo total antes de persistirlo.

### Unchanged Behavior (Regression Prevention)

Comportamiento existente que debe conservarse sin cambios.

3.1 CUANDO el total de una venta ya es múltiplo de 50 ENTONCES el Sistema DEBERÁ SEGUIR guardando y mostrando exactamente ese valor sin alterarlo.

3.2 CUANDO se calculan el subtotal, el descuento y el impuesto ENTONCES el Sistema DEBERÁ SEGUIR calculándolos igual que hasta ahora; el redondeo solo aplica al total final.

3.3 CUANDO se registran ventas por unidad con precios que ya son múltiplos de 50 ENTONCES el Sistema DEBERÁ SEGUIR registrando el total correcto sin cambios.

3.4 CUANDO se consultan ventas históricas de turnos ya cerrados anteriores al fix ENTONCES el Sistema DEBERÁ SEGUIR mostrándolas tal como quedaron registradas, sin recalcular retroactivamente sus totales.

## Glossary

- **Redondeo a 50:** ajuste del total al múltiplo de $50 más cercano, mediante `round(valor / 50) * 50`. Estándar en Colombia porque no hay denominaciones menores a $50.
- **Total:** valor final que paga el cliente = subtotal − descuento + impuesto, redondeado a 50.
- **Subtotal:** suma del valor de los ítems antes de descuentos e impuestos (no se redondea a 50).
- **Venta por peso/medida:** venta de productos vendidos por kg, lb o litro, donde el importe rara vez cae en un múltiplo de 50.
- **Venta online:** venta registrada con conexión, procesada por `createOrder()`.
- **Venta offline:** venta registrada sin conexión, encolada y luego procesada por `syncSale()` al sincronizar.
- **Recálculo del total:** proceso automático que vuelve a calcular el total de una orden a partir de sus ítems después de que la app la insertó.
- **Cierre de turno:** reporte diario de caja que consolida ventas por método de pago y movimientos de efectivo; depende de que el total persistido sea correcto.
