# Plan de Implementación: Reversión de Compras de Inventario desde Historial de Proveedores

## Objetivo
Permitir a los dueños de tiendas corregir errores comunes al ingresar mercancía (cantidades extras o costos equivocados) directamente desde la pantalla de "Cuentas por Pagar" o "Proveedores" (`DebtsScreen.tsx`), aprovechando el flujo natural de trabajo y eliminando la necesidad de crear una pantalla separada de "Historial de Lotes".

## 1. El Vínculo en la Base de Datos (Conectar Lotes con Compras)
Para que la aplicación sepa qué lote de inventario corresponde a qué registro de compra o deuda del proveedor, es necesario conectarlos "tras bambalinas":
- **Acción:** Al momento de registrar un ingreso de inventario (ya sea por compra en efectivo o a crédito a un proveedor), la aplicación debe crear un vínculo que conecte el movimiento de gasto/pago con el lote de inventario creado en la tabla `inventory_lots`.
- **Resultado:** Cuando visualicemos el historial de transacciones de un proveedor, el sistema tendrá mapeado exactamente qué "lotes físicos" corresponden a cada factura.

## 2. La Acción de "Eliminar" en el Historial del Proveedor (`DebtsScreen.tsx`)
Cuando el usuario presione el botón de eliminar (ícono de basurero) en una entrada de mercancía dentro del historial del proveedor:

### Escenario A: El Lote está "Intacto" (Camino Feliz)
Si el usuario registró mercancía por error hoy, y **aún no ha vendido ninguna unidad** de esa mercancía específica:
1. **Validación:** El sistema internamente verifica que la "cantidad inicial" del lote sea idéntica a la "cantidad disponible" actual.
2. **Reversión Financiera:** Se elimina la entrada del historial. Automáticamente se resta el monto de la deuda total del proveedor (si era a crédito) o se "devuelve" el dinero a la caja (si fue pagado en efectivo).
3. **Reversión del Lote Oculto:** El sistema localiza y destruye el lote financiero (`inventory_lots`).
4. **Reversión de Stock Visual:** Se le restan las unidades agregadas erróneamente al stock general del producto en la estantería (`products`). ¡Todo queda cuadrado como si el error nunca hubiera pasado!

### Escenario B: El Lote está "En Uso" (Bloqueo de Seguridad)
Si el usuario registró mercancía anoche y **hoy en la mañana ya alcanzó a vender** varias de esas unidades antes de darse cuenta del error e intentar borrar la factura:
1. **Validación:** El sistema detecta que al lote asociado le faltan unidades físicas.
2. **Bloqueo Inteligente:** La aplicación **prohibirá** la eliminación total de esa factura y mostrará un modal amigable tipo:
   *"No puedes borrar esta factura por completo porque ya le vendiste artículos de este registro a tus clientes. Borrarla completamente descuadraría el análisis de tus ganancias del Dashboard."*

## 3. La Acción de "Editar" en el Historial del Proveedor (El Rescate)
Para poder resolver el "Escenario B" y también facilitar correcciones de facturación, se integrará un botón de **✏️ Editar** junto al botón de eliminar en los detalles de la compra.

Al presionarlo, el dueño de la tienda podrá modificar el registro con estas reglas:
- **Reducir la cantidad ingresada:** El dueño podrá bajar la cantidad de unidades que entraron, pero **sólo hasta el límite de lo que ya vendió**. Por ejemplo: Si registró por error 50 gaseosas, y ya se vendieron 10, lo mínimo a lo que podrá bajar el registro de la factura es a 10. Al guardar, el sistema restará las 40 sobrantes del inventario global sin romper la contabilidad.
- **Corregir el Costo Unitario:** Si el dueño contó bien las cajas pero digitó mal el precio de compra, simplemente editará el valor monetario y le dará a guardar. El inventario físico (cantidades) no se moverá, pero a partir de ese segundo, el Dashboard recalculá las métricas de rentabilidad usando el costo verdadero de esa mercancía.

## Beneficios para el Usuario:
1. **Curva de aprendizaje cero:** Los tenderos ya están acostumbrados a ir al perfil de su proveedor a revisar facturas y cuentas. 
2. **Sistema infalible:** Le quita el miedo a los dueños y empleados de "dañar el sistema" permanentemente si se equivocan tecleando.
3. **Métricas de rentabilidad perfectas:** Al no permitir borrar inventario que ya generó una venta en el punto de pago, el negocio mantiene un cálculo de ganancias impecable a fin de mes.
