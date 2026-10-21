# Cómo ver las ventas del día (y del historial) en Bistro

> Guía para: Todos los roles (cajeros y administradores)
> Módulo: **Historial de ventas**
> Tiempo estimado: 1 minuto

---

## ¿Para qué sirve?

El módulo **Historial de ventas** muestra el registro completo de ventas del negocio. Si quieres ver las ventas de hoy, consultar una venta anterior, buscar una factura por cliente, revisar lo que se vendió en un período o reimprimir un comprobante, aquí es donde lo haces. También puedes corregir errores editando ítems, anulando o devolviendo ventas ya registradas.

---

## Antes de empezar

- Para acceder al Historial necesitas el permiso **Ver Reportes** o **Acceso al POS**. Si no tienes ninguno de los dos, no verás la opción en el menú.
- Los cajeros sin permiso de reportes solo ven **sus propias ventas**. Los administradores ven las de todo el negocio y pueden filtrar por vendedor.
- Para reimprimir tickets, la impresora debe estar conectada y configurada en **Ajustes**.
- Para **anular** una venta necesitas el permiso **Anular Facturas**. Para hacer una **devolución**, el permiso **Devoluciones**.

---

## Paso a paso

Ver y gestionar las ventas del historial tiene 7 pasos en orden: abrir el módulo, filtrar por período, buscar una venta específica, abrir el detalle, identificar las acciones disponibles del encabezado, editar un ítem cuando hay un error y, si hace falta, anular o devolver la venta. La mayoría de las consultas terminan en el paso 4 (ver el detalle); editar, anular y devolver son acciones correctivas opcionales.

---

### 1️⃣ Abre el módulo Historial de ventas

En el menú lateral toca **Historial de ventas**. Verás la lista de ventas ordenadas por fecha, la más reciente primero.

```
┌─────────────────────────────────┐
│ 🔍 Buscar cliente, orden...     │
├─────────────────────────────────┤
│ #0042  Juan García              │
│ 14:32  Efectivo     $45.000     │
├─────────────────────────────────┤
│ #0041  —                        │
│ 14:15  Nequi        $12.500     │
├─────────────────────────────────┤
│ #0040  María López              │
│ 13:58  Crédito      $78.000     │
└─────────────────────────────────┘
```

> **Consejo:** En computador, toca una venta de la lista para ver su detalle al lado derecho. Al entrar no hay ninguna seleccionada — verás el mensaje "Selecciona una venta de la lista".

---

### 2️⃣ Filtra por período

Usa el selector de período en la parte superior para elegir el rango de fechas.

```
Período
┌─────────────────────────────────┐
│  Hoy                         ▾  │
└─────────────────────────────────┘
```

Estado desplegado con todas las opciones:

```
┌─ Período ───────────────────────┐
│     Elegir (sin filtro)         │
│  ✓  Hoy                         │
│     Ayer                        │
│     Últimos 7 días              │
│     Últimos 30 días             │
│     Este mes                    │
│     Mes anterior                │
│     Personalizado               │
└─────────────────────────────────┘
```

**Elegir** muestra todas las ventas sin filtro de fecha. Con **Personalizado** eliges una fecha de inicio y una de fin exactas.

> 💡 **Admins:** junto al selector de período verás un filtro de **Empleado** para ver solo las ventas de una persona específica. Los cajeros no ven este filtro (solo ven sus propias ventas automáticamente).

---

### 3️⃣ Busca una venta específica

Usa la barra de búsqueda para encontrar una venta por nombre del cliente o número de orden.

```
🔍 [ Buscar cliente, orden...        ]
```

---

### 4️⃣ Toca una venta para ver el detalle

Toca cualquier fila de la lista para abrir el detalle completo.

```
Venta #0042
─────────────────────────────────
Cliente:   Juan García
Vendedor:  Ana
Fecha:     23/05/2025  14:32
Método:    Efectivo
─────────────────────────────────
Coca Cola 350ml   x2    $7.000
Pan tajado        x1    $4.500
─────────────────────────────────
TOTAL                   $11.500
```

En celular, el detalle ocupa toda la pantalla — usa el botón **←** para volver a la lista.

---

### 5️⃣ Identifica las acciones del encabezado *(opcional)*

En el encabezado del detalle aparece una fila de íconos de acción para reimprimir, compartir o corregir la venta.

```
🖨️ Ticket   🍽️ Comanda   💬 WhatsApp
✉️ Correo   📤 Compartir  ⬇️ PDF
🚫 Anular  /  ↩ Devolución
```

> **Nota:** La comanda (🍽️) solo aparece si tu negocio tiene el modo **Catálogo** activado. Los botones de **Anular** y **Devolución** solo aparecen si tienes el permiso correspondiente.

Qué hace cada ícono:

```
¿Qué quieres hacer?
         │
         ├── Reimprimir ticket → 🖨️
         │    ¿impresora conectada?
         │    SÍ → punto verde en el ícono
         │    NO → abre el panel para
         │         conectar impresora
         │
         ├── Reimprimir comanda → 🍽️
         │    (solo en modo Catálogo)
         │
         ├── Compartir ticket → 📤
         │    Celular: menú Compartir
         │    Computador: descarga archivo
         │
         ├── Descargar PDF → ⬇️
         │
         ├── Enviar por WhatsApp → 💬
         │    (celular y computador)
         │
         ├── Enviar por Email → ✉️
         │
         ├── Editar un ítem → toca la fila
         │
         └── Anular o devolver la venta
              → 🚫 Anular (turno abierto)
              → ↩ Devolución (turno cerrado)
```

> **Tip:** las acciones de compartir e imprimir no modifican la venta — solo generan una copia del comprobante. Editar, anular y devolver sí cambian datos guardados.

---

### 6️⃣ Edita un ítem de la venta *(opcional)*

Si en una venta quedó un producto equivocado o una cantidad mal contada, toca la fila del producto dentro del detalle. Se abre un modal para corregir el ítem.

> ⚠️ **Solo funciona en ventas del turno abierto** (no anuladas). Si la venta es de un turno cerrado, no puedes editar ítems — usa la devolución.

```
Editar ítem
─────────────────────────────────
Producto actual
  Coca Cola 350ml
Cambiar por
┌─────────────────────────────────┐
│  🔍 Buscar producto...          │
└─────────────────────────────────┘
Cantidad
┌─────────────────────────────────┐
│  [ − ]   2   [ + ]              │
└─────────────────────────────────┘
┌─────────────┐  ┌─────────────┐
│  Cancelar   │  │   Guardar   │
└─────────────┘  └─────────────┘
```

Al tocar **Guardar**, el sistema recalcula el total automáticamente. Si la venta era a crédito, el saldo en **Cuentas por Cobrar** también se actualiza solo.

```
Ítem editado
     │
     ├──► Total de la venta se recalcula     ✅
     │
     └──► Si era a crédito:
          saldo en Cuentas por Cobrar
          se actualiza automáticamente       ✅
```

> **Aviso:** no podés escribir un precio arbitrario — el sistema usa el precio actual del producto en el catálogo.

---

### 7️⃣ Anula o devuelve una venta *(opcional)*

Si una venta quedó mal (cobro duplicado, error, prueba) o el cliente devuelve un producto, no se borra: se **anula** (si es del turno abierto) o se hace una **devolución** (si es de un turno cerrado). Bistro muestra el botón correcto en el encabezado: **🚫 Anular** o **↩ Devolución**.

```
       ¿La venta es de tu turno abierto?
                    │
          ┌─────────┴─────────┐
         SÍ                    NO
          ▼                    ▼
     🚫 Anular           ↩ Devolución
   (pide motivo)       (elegís productos
                        y método)
```

Al anular, el stock de los productos físicos vuelve al inventario y la venta queda tachada como "ANULADA". En ventas a crédito (fiado), ni anular ni devolver mueven la caja: solo le bajan la deuda al cliente.

> **Guía dedicada:** el paso a paso completo está en **Cómo anular o devolver una venta**.

---

## Errores comunes

Cuando algo no sale como esperás en el Historial de ventas, casi siempre es uno de estos casos. Esta tabla cubre los problemas más reportados: la lista aparece vacía o le faltan ventas, una venta de hoy no se ve, la impresora no responde al tocar el ícono 🖨️, una venta se eliminó por error o no encontrás una venta reciente aunque sepas que existe.

| Situación | Qué hacer |
|-----------|-----------|
| No aparecen ventas en la lista | Verifica que el filtro de período esté en **Elegir** (sin filtro) o en el rango correcto. |
| La venta de hoy no aparece | El filtro puede estar en "Ayer" o un período anterior. Cámbialo a **Hoy** o **Elegir**. |
| El ícono 🖨️ de impresora no responde | La impresora no está conectada. Al tocarlo se abre el panel para conectarla; también puedes configurarla en **Ajustes**. |
| Eliminé una venta por error | Las ventas ya no se borran: se anulan o devuelven y quedan tachadas con su rastro. Si anulaste por error, vuelve a registrar la venta (el stock se ajusta solo). |
| No encuentro la venta aunque fue reciente | La lista va cargando más ventas a medida que bajas (scroll). Usa el buscador con el nombre del cliente o el número de orden para localizarla. |

---

## Preguntas frecuentes

Estas son las dudas más frecuentes sobre el Historial de ventas: si se puede corregir un ítem ya cobrado, si se puede cambiar el método de pago de una venta vieja, cómo se comporta el inventario al eliminar, si las ventas fiadas aparecen igual que las de contado, por qué los totales salen redondeados y si hay exportación masiva a Excel.

---

### FAQ — ¿Puedo corregir la cantidad o el producto de un ítem ya registrado?

Sí. Toca la fila del producto en el detalle. Puedes cambiar el producto por otro del catálogo, modificar la cantidad, o ambos. El total se recalcula solo, y si era una venta a crédito el saldo en **Cuentas por Cobrar** también se actualiza. Lo que no puedes es escribir un precio arbitrario — el sistema usa el precio actual del producto en el catálogo.

---

### FAQ — ¿Puedo cambiar el método de pago de una venta registrada?

No. El método de pago queda fijo al momento del cobro. Si se cobró con el método equivocado y la venta es de tu turno abierto, anúlala y regístrala de nuevo con el método correcto. Si ya está en un turno cerrado, haz una devolución y vuelve a venderla.

```
Método de pago equivocado
         │
         ├──► Editar venta       → NO se puede ❌
         │
         └──► Anular/Devolver y  → única vía ✅
              registrar de nuevo
              (stock vuelve al ajustar,
               se descuenta otra vez
               al rehacer)
```

---

### FAQ — ¿Qué pasa con el inventario si anulo una venta o un ítem?

Los productos físicos (mercancía) devuelven su stock al inventario automáticamente al anular. Los servicios no afectan el inventario porque nunca lo descontaron.

```
Producto físico en venta anulada
         │
         ▼
   Stock vuelve al inventario  ✅

Servicio en venta anulada
         │
         ▼
   No afecta inventario        ─
   (nunca descontó stock)
```

---

### FAQ — ¿El historial incluye ventas a crédito?

Sí. Las ventas a crédito aparecen en la lista igual que las de contado, con el método **Crédito** en la fila. El saldo pendiente del cliente se gestiona aparte en el módulo **Cuentas por Cobrar**.

---

### FAQ — ¿Por qué el total de la venta aparece redondeado?

Bistro redondea todos los totales al múltiplo de **$50** más cercano. Es el mismo redondeo que se aplicó al momento del cobro, por eso el comprobante reimpreso coincide exactamente con el ticket original. Así la diferencia entre el total real y lo cobrado nunca pasa de $24.

```
Subtotal real     Redondeado a $50
─────────────────────────────────
  $14.760    →     $14.750   (−$10)
  $14.780    →     $14.800   (+$20)
  $14.725    →     $14.750   (+$25)
```

> **Nota:** la diferencia se muestra como línea **Ajuste** en el detalle de la venta cuando el redondeo cambia el total respecto al subtotal con descuentos aplicados.

---

### FAQ — ¿Puedo exportar el historial a Excel?

No. Desde esta pantalla no hay exportación masiva. Puedes descargar el comprobante de cada venta en PDF de forma individual usando el ícono 📤 del encabezado del detalle.

---

## Recursos multimedia *(opcional)*

| Tipo | Nombre sugerido | Qué mostraría |
|------|----------------|---------------|
| GIF | "Bistro — Filtrar ventas por período — módulo Historial" | Selección del dropdown de período y cómo cambia la lista |
| GIF | "Bistro — Editar ítem de una venta — toque en la fila y confirmación" | Flujo completo: tocar la fila, cambiar producto/cantidad, confirmar |
| Imagen | "Bistro — Panel de detalle de venta — acciones disponibles" | Vista del detalle con los íconos de acción en el encabezado |
