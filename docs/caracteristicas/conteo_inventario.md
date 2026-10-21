# Conteo de Stock / Inventario Físico (InventoryScreen)

Componente: `screens/InventoryScreen.tsx`  
Hook principal: `hooks/useInventory.ts`  
Acceso: Menú principal → "Inventario"

Esta pantalla es la herramienta para **verificar el stock físico real** contra lo que el sistema registra. El flujo es: contar lo que tienes en estante, ingresar las cantidades, y el sistema calcula las diferencias y aplica los ajustes necesarios.

---

## ¿Para qué sirve?

El stock del sistema se actualiza automáticamente con ventas, compras y mermas. Pero en la realidad física siempre existen **pérdidas no registradas**: productos vencidos desechados sin registrar, robos, errores de entrada, merma natural en productos a granel, etc.

El **conteo de inventario** es la forma de sincronizar el sistema con la realidad. Se hace periódicamente (diario, semanal, mensual según el negocio).

---

## Pestañas

| Tab | Contenido |
|---|---|
| **Productos** | Todos los productos tipo `SIMPLE` con control de stock |
| **Ingredientes** | Insumos internos no vendibles (solo visible si existen registros) |
| **Historial** | Panel lateral de ajustes negativos revertibles |

---

## Flujo de Conteo Paso a Paso

### 1. Filtrar (opcional)
- **Buscar**: por nombre de producto.
- **Categoría**: filtra por categoría (solo en tab Productos).
- **Checkbox "Solo diferencias"**: oculta los productos donde el conteo físico coincide con el sistema. Útil cuando ya ingresaste varios y quieres ver solo los que cambian.

### 2. Ingresar el conteo físico

**En móvil**: toca el campo del producto → se abre `InventoryNumpad`, un teclado numérico dedicado con soporte para decimales y **expresiones matemáticas** (suma, resta, multiplicación, división). Útil para productos a granel: puedes escribir `5+2.5` y el `=` evalúa el resultado.

**En desktop**: campo numérico inline (`<input type="number">`) directamente en la fila.

Al ingresar un valor diferente al stock del sistema, la fila se resalta en **ámbar** indicando cambio pendiente.

### 3. Ver el ajuste calculado

Para cada producto con conteo ingresado se muestra:
```
ajuste = conteo_físico - stock_sistema
```

- **En móvil y desktop (Alineación y visualización premium)**:
  - **Coincidencia perfecta (`diff === 0`)**: Se muestra un badge de cápsula premium con fondo verde translúcido y borde verde suave que dice **"✓ Coincide"**, ofreciendo una confirmación visual limpia e interactiva.
  - **Diferencia detectada (`diff !== 0`)**: El ajuste de stock (`+N` o `-N`) se muestra estilizado dentro de badges ovalados (color esmeralda para positivo y rose/rojo para negativo). Para los ajustes negativos, se incluye de forma compacta y apilada la etiqueta `* Merma`.
  - **Imágenes de productos**: En la versión desktop, las imágenes de los productos se incrementaron a `size-12` (48px) y las filas se compactaron verticalmente a `py-2` para garantizar que las imágenes sean más grandes, legibles y nítidas sin aumentar la altura total de la fila.

El **valor monetario del ajuste** se calcula con el costo del producto (`ajuste × costo_unitario`), permitiendo ver el impacto financiero antes de guardar.

### 4. Guardar

- **Individual**: *Eliminado*. Se removieron los botones de check (`✓`) individuales en móvil y los botones "Guardar" en la fila en desktop para simplificar el flujo operativo y evitar clicks accidentales.
- **Global**: Botón **"Guardar (N)"** en el header superior, donde `N` es la cantidad total de productos y/insumos con ajustes pendientes. Al pulsarlo, se validan y aplican todas las diferencias en una sola transacción limpia.

> [!IMPORTANT]
> Los ajustes **negativos** se registran como mermas con razón `'AJUSTE DE INVENTARIO'` en la tabla `wastage`. Esto es transparente para el usuario pero queda trazado en el historial. Ver [`flujo_registro_mermas.md`](./flujo_registro_mermas.md).

Los ajustes **positivos** (encontraste más stock de lo que dice el sistema) crean un nuevo lote en `inventory_lots` con `unit_cost = 0` y también insertan un registro en `business_debts` con `status = 'paid'` y `total_amount = 0`. El propósito es mantener la trazabilidad del lote, pero el costo queda en cero.

> [!WARNING]
> **Deuda técnica — Ajustes positivos con costo cero**: cuando el sistema registra un sobrante de inventario, crea el lote con `unit_cost = 0`. Esto distorsiona el **costo promedio ponderado** del producto visible en `ProductsScreen`: si tienes lotes a $1,000 y se agrega un lote de ajuste a $0, el promedio baja artificialmente. Lo correcto sería o bien no crear lote (y solo actualizar el stock directo), o bien solicitar el costo real del sobrante al usuario antes de guardarlo.

---

## Resumen en Tiempo Real

Mientras se ingresan conteos, el header muestra un **resumen acumulado**:

- **Unidades**: suma total de todas las diferencias (`+` o `-`)
- **Valor**: impacto financiero total al costo

Ejemplo: si tienes 3 productos con diferencias de -5 uds ($10,000), +2 uds ($4,000) y -1 ud ($2,000):
```
Unidades: -4  
Valor: -$8,000
```

Este resumen es visible en desktop como chips en el header y en móvil como un panel compacto bajo los tabs.

---

## Historial de Ajustes y Reversión

El botón **Historial** abre un panel lateral derecho que muestra **ajustes negativos revertibles**.

### ¿Qué es "revertible"?

Un ajuste se puede revertir solo si **no ha habido ventas ni compras del producto después de ese ajuste**. El sistema consulta la RPC `get_revertible_adjustment_ids` de Supabase para determinar cuáles califican.

Si hubo movimientos posteriores, el ajuste ya no es revertible (el número que aparece en sistema fue modificado por esas transacciones y revertir el ajuste rompería la integridad).

### Acciones en el historial

| Acción | Qué hace |
|---|---|
| **Revertir** | Deshace el ajuste negativo, devuelve el stock que se descontó |
| **Editar** | Abre un sub-formulario para cambiar la cantidad que se va a descontar antes de revertir |

> [!NOTE]
> La acción "Editar" es una corrección compuesta: primero revierte el ajuste original, luego aplica un nuevo ajuste con la cantidad corregida. Es útil si el conteo físico fue incorrecto y quieres registrar el valor real.

### Banner de ajuste pendiente
Inmediatamente después de guardar un ajuste negativo, aparece un **banner ámbar** que dice: *"Para modificar o revertir ajustes negativos, abre el Historial antes de realizar nuevas ventas o compras."* El banner se descarta manualmente o desaparece si los ajustes ya no son revertibles.

---

## Numpad con Calculadora (Móvil)

El `InventoryNumpad` no es solo un teclado numérico — soporta una calculadora básica:

| Tecla | Función |
|---|---|
| `0-9`, `.` | Entrada numérica |
| `+`, `-`, `*`, `/` | Operadores matemáticos |
| `=` | Evalúa la expresión matemática de forma segura |
| `C` | Limpia el campo |
| `⌫` | Borra el último carácter |
| `✓` | Confirma el valor y cierra el numpad |

**Ejemplo de uso real**: tienes 3 cajas de 12 unidades y media caja más. Escribes `3*12+6` → `=` → resultado: `42`.

---

## Lo que NO se puede hacer

- **Ajustar un stock negativo**: si el stock del sistema ya es negativo (por una deuda de movimientos), el campo de conteo está deshabilitado. Hay que resolver primero el stock negativo via compra.
- **Ver el historial de todas las mermas**: el historial de ajustes solo muestra ajustes de tipo `'AJUSTE DE INVENTARIO'` que sean revertibles. Las mermas de otro tipo (registradas en `WasteRegister`) no aparecen aquí. Ver [`flujo_registro_mermas.md`](./flujo_registro_mermas.md).
- **Exportar el conteo**: no hay función de exportar a Excel o PDF.
- **Programar conteos**: no hay función de recordatorio ni frecuencia configurada. El conteo es siempre manual y bajo demanda.
- **Ver histórico completo de ajustes de inventario**: el historial solo muestra los **revertibles** actuales. Los ajustes antiguos que ya tuvieron movimientos posteriores no aparecen.

---

## Tablas de Supabase Involucradas

| Tabla / RPC | Operación | Cuándo |
|---|---|---|
| `products` (via `useInventory`) | SELECT | Al montar, para cargar stocks |
| `wastage` | INSERT | Al guardar ajuste negativo |
| `wastage` | SELECT | Al abrir el Historial |
| `inventory_lots` | UPDATE | Al guardar ajuste positivo o negativo |
| `get_revertible_adjustment_ids` (RPC) | SELECT | Al abrir el Historial |

---

## Inconsistencias y Notas


> [!NOTE]
> **Los ajustes positivos no tienen trazabilidad completa**: un ajuste negativo queda registrado en `wastage` y es revertible. Un ajuste positivo simplemente actualiza el stock sin dejar un registro específico del evento de conteo. Si un auditor quiere saber "¿cuándo y cuánto se incrementó el stock por ajuste de inventario?", no hay forma de verlo sin ir directamente a la base de datos.
