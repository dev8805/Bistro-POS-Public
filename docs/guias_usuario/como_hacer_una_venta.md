# Cómo hacer una venta en Bistro

> Guía para: Todos los roles (cajeros y administradores)
> Módulo: Punto de Venta → Vender
> Tiempo estimado: 1–3 minutos por venta

---

## ¿Para qué sirve?

El módulo de ventas te permite registrar lo que le vendes a un cliente y cobrarle en el momento. Si quieres hacer una venta, cobrar un pedido, registrar lo que vendiste hoy, atender a un cliente en caja o procesar un pago, aquí es donde se hace todo. Puedes cobrar en efectivo, Nequi, Daviplata u otro método digital, usar pagos mixtos o fiar a crédito. Además, mediante **Foto Venta** (fotoventa) puedes tomarle una foto a una lista de compras manuscrita o comanda en papel para que la inteligencia artificial agregue los productos al cobro automáticamente. Al terminar, el sistema guarda la venta y puedes imprimir el comprobante o enviarlo por WhatsApp.

---

## Antes de empezar

- Los productos que vas a vender deben estar registrados en el módulo **Productos**.
- Si cobras en efectivo y quieres que el dinero quede en caja, debes tener un **turno de Caja abierto** (módulo **Caja**).
- Si la venta es a crédito, el cliente debe estar registrado en **Cuentas por Cobrar**.

---

## Paso a paso en computador (desktop)

En computador, una venta se hace en ocho pasos: abrir el módulo, agregar productos al carrito, ajustar cantidades, manejar productos por peso si aplica, cobrar, aplicar descuento opcional, finalizar y entregar el comprobante. La pantalla está dividida en dos columnas — el carrito a la izquierda y el panel de cobro a la derecha.

```
┌───────────────┬─────────────────┐
│ 🔍 Buscar...  │ [ Pago Directo] │
│               │   Crédito       │
│  Carrito      │ ━━━━━━━━━━━━━   │
│  ─────────    │                 │
│  (vacío)      │  Total: $ 0     │
│               │ [Finalizar]     │
└───────────────┴─────────────────┘
```

---

### Paso 1 — Abrir el módulo de ventas

En el menú izquierdo, toca **Punto de Venta**. La pantalla se abre con una barra de búsqueda a la izquierda y el panel de cobro a la derecha.

`[ 🛒 Punto de Venta ]` → pantalla **Vender**

---

### Paso 2 — Agregar productos al carrito

Escribe el nombre del producto en la barra de búsqueda o escanéalo con la pistola de códigos de barras. El producto aparece en las sugerencias — presiona **Enter** o haz clic sobre él para agregarlo. Si el mismo producto ya está en el carrito, la cantidad sube automáticamente.

```
🔍 [ Buscar producto...      ]
┌────────────────────────────┐
│ 🥛 Leche Alquería 1L      │
│    $3.200  ·  Stock: 24   │
├────────────────────────────┤
│ 🥛 Leche Colanta 900ml    │
│    $2.800  ·  Stock: 12   │
└────────────────────────────┘
```

---

### Paso 3 — Ajustar cantidades del último producto

Usa las teclas **+** y **−** del teclado para cambiar la cantidad del último producto agregado, sin necesidad de tocar el mouse.

```
Atajos de teclado en el carrito:
  [ + ]  → suma 1 unidad
  [ − ]  → resta 1 unidad
```

---

### Paso 4 — Productos vendidos por peso

Si el producto se vende por kilogramos, libras u otra unidad de peso, al agregarlo se abre una ventana para ingresar la cantidad exacta. El precio total se calcula en pantalla antes de confirmar.

```
┌─ Cantidad por peso ──────────┐
│  Producto: Carne de res      │
│                              │
│  Cantidad (Kg)               │
│  ┌──────────────────────┐    │
│  │  1.250               │    │
│  └──────────────────────┘    │
│                              │
│  Total: $ 25.000             │
│  [ Cancelar ]  [ Agregar ]   │
└──────────────────────────────┘
```

---

### Paso 5 — Cobrar la venta (Pago Directo o Crédito)

En el panel derecho hay dos pestañas: **Pago Directo** (para cobro inmediato) y **Crédito** (para fiar). Elige según cómo te paga el cliente.

```
¿Cómo paga el cliente?
       │
       ├─► Solo un método
       │   (Efectivo / Nequi / Daviplata)
       │   → Panel [ Pago Directo ]
       │
       ├─► Dos métodos o más
       │   → [ Pago Mixto ]
       │     Distribuye el total
       │
       └─► Sin cobro hoy (fiar)
           → Pestaña [ Crédito ]
           Requiere cliente +
           fecha de vencimiento
```

---

### Paso 5a — Cobrar en efectivo

En **Pago Directo**, toca **Efectivo** en la lista de métodos de pago (son botones, no una lista desplegable). Ingresa el monto que recibiste del cliente en el campo **Efectivo Recibido** — el cambio se calcula solo en el campo **Cambio**.

```
┌─ Pago Directo ───────────────┐
│  Método de Pago              │
│  [Efectivo][Tarjeta][ Nequi ]│
│  [Daviplata][Transf.][ Otro ]│
│                              │
│  Efectivo Recibido           │
│  ┌──────────────────────┐    │
│  │ $  10.000            │    │
│  └──────────────────────┘    │
│  Cambio: $  400              │
└──────────────────────────────┘
```

> 💡 **Consejo:** Si dejas el campo **Efectivo Recibido** vacío, el sistema asume que recibiste el monto exacto y no calcula cambio.

---

### Paso 5b — Cobrar con dos métodos (Pago Mixto)

Si el cliente paga con varios métodos (ej. parte Nequi + parte efectivo), toca el botón **Pago Mixto** del panel para abrir el modo "Dividir entre métodos" y distribuir el total entre cada uno (Efectivo, Tarjeta, Nequi, Daviplata, Transferencia, Otro).

```
┌─ Dividir entre métodos ──────┐
│  Efectivo    $ [          ]  │
│  Nequi       $ [          ]  │
│  Daviplata   $ [          ]  │
│                              │
│  Pendiente:       $ 9.600    │
└──────────────────────────────┘
```

> ⚠️ **Aviso:** El botón de finalizar solo se activa cuando la suma de los métodos cuadra exactamente con el total de la venta.

---

### Paso 5c — Vender a crédito (fiar)

Toca la pestaña **Crédito**, asigna el cliente en el campo **Asignar a Cliente** (búsqueda por nombre, teléfono o documento) y elige una **Fecha de Pago Acordada**. Ambos campos son obligatorios para poder finalizar.

```
┌─ Pestaña Crédito ────────────┐
│  Asignar a Cliente *         │
│  ┌───────────────────────┐   │
│  │ 🔍 Buscar cliente... │   │
│  └───────────────────────┘   │
│                              │
│  Fecha de Pago Acordada *    │
│  ┌───────────────────────┐   │
│  │  📅  dd/mm/aaaa       │   │
│  └───────────────────────┘   │
└──────────────────────────────┘
```

> � En la misma pestaña **Crédito** hay un campo opcional **Abono inicial** por si el cliente te paga una parte de una vez; el resto queda como deuda.

> �🔒 **Bloqueo:** Si no asignas cliente o fecha, el botón **Confirmar Crédito** queda deshabilitado.

---

### Paso 6 — Aplicar descuento (opcional)

En el campo **Descuento** del panel de cobro, escribe el porcentaje (`%`) o el monto (`$`) a descontar. El total se ajusta en tiempo real.

```
Descuento:
┌──────────────────────────┐
│  [ % ]  [ $ ]   10       │
└──────────────────────────┘

Total antes:    $ 10.000
Descuento:      − $ 1.000
─────────────────────────
Total final:    $  9.000
```

---

### Paso 7 — Finalizar la venta

Haz clic en el botón final del panel. En modo **Pago Directo** dice **Finalizar Venta**; en modo **Crédito** cambia a **Confirmar Crédito**. El sistema registra la venta y muestra la pantalla de comprobante.

```
Modo Pago Directo:
╔══════════════════════════════╗
║    [ Finalizar Venta ]       ║
╚══════════════════════════════╝

Modo Crédito:
╔══════════════════════════════╗
║   [ Confirmar Crédito ]      ║
╚══════════════════════════════╝
```

Cambios automáticos al confirmar:

```
ANTES de confirmar:
  Carrito: activo, sin guardar
  Stock: sin cambio
  Caja: sin movimiento

DESPUÉS de confirmar:
  Venta: guardada en el sistema
  Stock: descontado por producto
  Caja: +total (si turno abierto)
```

---

### Paso 8 — Enviar o imprimir el comprobante

Desde la pantalla de éxito tienes tres accesos rápidos para el comprobante:

- **WhatsApp** — lo envía por WhatsApp.
- **Compartir** (en celular) — abre un menú con **Ticket** (térmico, según el ancho de tu papel) y **Factura PDF**. En computador este botón es **PDF** y descarga el comprobante.
- **Correo** — lo manda por correo.

El botón **Imprimir Ticket** imprime en tu impresora térmica; si no hay una lista, muestra **Conectar impresora** (o **Elegir impresora**). Al final, **Nueva Venta** deja todo listo para el siguiente cobro.

```
┌──────────────────────────────┐
│            ✅                │
│   ¡Venta Exitosa!            │
│   Total: $ 9.600             │
│                              │
│ [WhatsApp][Compartir][Correo]│ ← en PC: PDF
│                              │
│ [ 🖨️  Imprimir Ticket     ] │
│ [  ➕  Nueva Venta         ] │
└──────────────────────────────┘
```

---

## Paso a paso en celular o tablet

En celular o tablet, la venta se hace en seis pasos. La diferencia clave con el computador es que el cobro se abre en una pantalla aparte al tocar la barra inferior con el total — no es un panel lateral.

---

### Paso 1 — Abrir el módulo Vender

Toca **Vender** en la barra de navegación inferior de la app.

```
┌──────┬───────┬──────┬──────┐
│Inicio│Vender │Turno │Ayuda │
└──────┴───────┴──────┴──────┘
         ↑
```

---

### Paso 2 — Agregar productos al carrito (móvil)

Escribe el nombre en la barra de búsqueda o toca el ícono de cámara para escanear el código de barras. Selecciona el producto de las sugerencias para agregarlo al carrito.

```
🔍 [ Buscar producto...   📷 ]
┌────────────────────────────┐
│ 🥛 Leche Alquería 1L      │
│    $3.200  ·  Stock: 24   │
└────────────────────────────┘
```

---

### Paso 3 — Editar cantidad o descuento de una fila

Toca cualquier fila del carrito para abrir las opciones de ese producto. Desde ahí puedes cambiar la cantidad o aplicar un descuento individual a esa línea.

```
┌─ Leche Alquería 1L ──────────┐
│                              │
│  Cantidad:  [ − ]  3  [ + ]  │
│                              │
│  Descuento: [  0%         ]  │
│             [ Aplicar     ]  │
└──────────────────────────────┘
```

---

### Paso 4 — Productos vendidos por peso (móvil)

Al agregar un producto por peso, se abre una ventana para ingresar la cantidad exacta. El precio se calcula en pantalla antes de confirmar.

```
┌─ Cantidad por peso ──────────┐
│  Cantidad (Kg)               │
│  [        1.250         ]    │
│  Total: $ 25.000             │
│  [ Cancelar ] [ Agregar ]    │
└──────────────────────────────┘
```

---

### Paso 5 — Procesar el cobro

Cuando el carrito esté listo, toca la barra inferior que muestra el total. Esto abre la pantalla de cobro a pantalla completa.

```
╔═════════════════════════════╗
║   Total: $ 9.600      ►     ║
╚═════════════════════════════╝
```

---

### Paso 6 — Elegir método de pago y finalizar

En el panel verás las pestañas **Pago Directo** y **Crédito**. En **Pago Directo** elige cómo paga el cliente: **Efectivo**, **Nequi**, **Daviplata** u otro. Si paga con dos métodos, toca **Pago Dividido** y distribuye el monto. Luego toca **Finalizar Venta** (o **Confirmar Crédito** si estás en la pestaña **Crédito**).

```
Si paga en efectivo:
Total venta:        $ 9.600
Efectivo recibido: $ 10.000
───────────────────────────
Cambio:            $    400
```

---

## Foto Venta con IA: vender desde una comanda o lista escrita (móvil)

Si un cliente te entrega una lista de compras manuscrita o tienes una comanda en papel, **Foto Venta** (fotoventa) permite fotografiarla para que la inteligencia artificial reconozca los productos y cantidades automáticamente y los cargue al cobro en segundos. Este flujo se completa en cinco pasos: abrir el módulo, capturar la foto, revisar los productos, guardar apodos si aplica y pasar al cobro.

---

### Paso 1 — Abrir Foto Venta desde Inicio

En la pantalla de **Inicio**, en la sección **Operación**, toca la tarjeta **Foto Venta** (ícono de cámara de fotos). Se abre la pantalla **Escanear Lista de Ventas**. También puedes acceder directamente mediante el acceso directo web `/foto-venta` en tu dispositivo.

`[ 🏠 Inicio ]` → Sección **Operación** → `[ 📷 Foto Venta ]`

```
OPERACIÓN
┌────────────────┐ ┌────────────────┐
│ 📷 Foto Venta  │ │ 📜 Historial  │
│ Lista de ventas◄ │ X ventas hoy  │
└────────────────┘ └────────────────┘
```

---

### Paso 2 — Capturar o cargar la foto de la lista

En la pantalla de captura verás la insignia de **Reconocimiento IA** y el título **Escanear Lista de Ventas**. Cuentas con dos opciones rápidas:

- **Tomar Foto** (botón principal ámbar) — abre la cámara trasera del celular para enfocar y capturar la hoja.
- **Galería** — selecciona una foto o captura ya guardada en el dispositivo (por ejemplo, enviada por WhatsApp).

```
┌──────────────────────────────┐
│     ✨ Reconocimiento IA     │
│   Escanear Lista de Ventas   │
│                              │
│ ┌──────────────────────────┐ │
│ │ 📷  Tomar Foto           │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ 🖼️  Galería              │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

> 💡 **Consejo:** Al cargar la imagen puedes recortar y encuadrar el área con el visor antes del análisis. En tablet o computador también puedes arrastrar y soltar la imagen sobre la pantalla.

---

### Paso 3 — Revisar los productos detectados

La IA procesa la imagen y presenta los resultados. En la parte superior cuentas con el buscador **Agregar producto...** y el botón de escáner de barras `[║▌]` para sumar ítems manualmente. La lista agrupa:

- **Reconocidos (`matched`)**: Aparecen bajo **Productos (N)** con su cantidad, nombre y precio. Al tocarlos puedes usar los botones **+** y **−** para corregir la cantidad o desmarcarlos.
- **Sin reconocer (`unmatched`)**: Se destacan con advertencia ámbar **N sin reconocer**. Tocando la tarjeta puedes elegir una de las sugerencias rápidas de la IA o buscar el producto en el catálogo.

```
┌─ 🔍 Agregar producto... ─ [║▌] 🗑️ ┐
│                                  │
│  ✅ Productos (3)   ⚠️ 1 alerta │
│  ┌────────────────────────────┐  │
│  │ 2  Leche Alquería 1L $6.400│  │
│  ├────────────────────────────┤  │
│  │ 1  Arroz Diana 500g  $2.800│  │
│  ├────────────────────────────┤  │
│  │ ⚠️ "leche tarro"           │  │
│  │    [ 💡 Sugerencia rápida] │  │
│  │    🔍 Buscar producto...   │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

---

### Paso 4 — Guardar apodos para futuros escaneos (opcional)

Al asociar manualmente un producto no reconocido, pulsa el botón **Guardar "[nombre]" como apodo**.

El sistema guardará ese término como apodo del producto en tu base de datos. En las próximas ventas por foto, la IA reconocerá ese nombre automáticamente sin pedirte confirmación.

```
┌──────────────────────────────────┐
│ ⚠️ "leche tarro" → Leche 1L     │
│ ┌──────────────────────────────┐ │
│ │ 💾 Guardar "leche tarro"     │ │
│ │    como apodo                │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

> 🤖 **IA:** Los apodos se aprenden por negocio y aceleran el cobro en horas pico.

---

### Paso 5 — Procesar el pago y cobrar

En la barra inferior se indica la cantidad de productos y el monto acumulado. Toca **Procesar Pago (N)** para continuar:

- Si dejaste productos sin reconocer sin asignar, Bistro te alertará para que elijas entre continuar sin ellos o revisarlos.
- Al avanzar, los productos pasan a la pantalla de cobro. Si necesitas corregir la lista, puedes tocar volver en el cobro y regresarás a la lista intacta de **Foto Venta**.

```
┌──────────────────────────────────┐
│ 3 productos      Total: $ 12.400 │
│ ┌──────────────────────────────┐ │
│ │ 💳 Procesar Pago (3)         │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

---

## Errores comunes

Los problemas más reportados al hacer una venta están en esta tabla, junto a la acción concreta para resolverlos.

| Situación | Qué hacer |
|-----------|-----------|
| El producto no aparece en las sugerencias al buscarlo | Verifica que esté creado en el módulo **Productos**. Si no tiene stock puede que no aparezca, pero igual se puede agregar. |
| El botón **Confirmar Crédito** no se activa en una venta a crédito | Falta asignar el cliente en **Asignar a Cliente** o la **Fecha de Pago Acordada**. Completa ambos campos en la pestaña **Crédito**. |
| La cámara no detecta el código de barras | Asegúrate de que haya buena iluminación y el código esté centrado. También puedes escribir el nombre manualmente. |
| El cambio que muestra no es correcto | Verifica que ingresaste bien el monto recibido en el campo **Efectivo Recibido**. |
| La venta se guardó pero no entró a la caja | Si no tenías un turno de **Caja** abierto, la venta queda guardada pero el efectivo no se suma al turno. Abre el turno antes de vender para evitar descuadres. |

Árbol de diagnóstico cuando una venta no se finaliza:

```
¿Por qué no puedo finalizar la venta?
  │
  ├── Modo Pago Directo
  │     ├── ¿Carrito vacío? → Agrega productos
  │     └── ¿Pago Dividido?
  │          └── Suma ≠ Total → Ajusta montos
  │
  └── Modo Crédito
        ├── ¿Cliente sin asignar? → Asignar
        └── ¿Sin fecha acordada? → Elegir fecha
```

---

## Preguntas frecuentes

Esta sección cubre las dudas más comunes sobre métodos de pago, ventas a crédito, descuentos, control de stock y cómo aprovechar el carrito durante una atención.

---

### FAQ — ¿Puedo cobrar con dos métodos de pago al mismo tiempo?

Sí. En el panel de cobro toca el botón **Pago Dividido** (en computador aparece como **Pago Mixto**). Se abre la sección "Dividir entre métodos" con un campo por cada método disponible (Efectivo, Tarjeta, Nequi, Daviplata, Transferencia, Otro). Ingresa el monto para cada uno — el botón final solo se activa cuando la suma cuadra con el total.

```
Total venta:           $ 10.000
─────────────────────────────────
Efectivo:    $  4.000
Nequi:       $  6.000
─────────────────────────────────
Suma:        $ 10.000  ✅ OK
```

---

### FAQ — ¿Qué pasa si el cliente paga más de lo que debe y necesita cambio?

Ingresa el monto exacto que te entregó en el campo **Efectivo Recibido**. El sistema calcula y muestra el cambio automáticamente en el campo **Cambio**.

```
Total venta:        $  9.600
Efectivo recibido:  $ 10.000
───────────────────────────
Cambio:             $    400
```

---

### FAQ — ¿Puedo vender a crédito sin que el cliente tenga una deuda previa?

Sí. Cualquier cliente registrado en **Cuentas por Cobrar** puede recibir una venta a crédito, aunque no tenga deudas anteriores. La nueva deuda se acumula en su cuenta.

```
Antes de la venta:
  Cliente Ana — Deuda: $ 0

Después de la venta a crédito:
  Cliente Ana — Deuda: $ 9.600
```

---

### FAQ — ¿Puedo agregar varios productos sin terminar la venta?

Sí. Puedes seguir agregando productos al carrito hasta que estés listo para cobrar. El carrito no se pierde mientras estés en la pantalla de ventas.

> ⚠️ **Aviso:** Si cierras la app o sales del módulo **Punto de Venta**, el carrito puede vaciarse. Termina la venta antes de cambiar de pantalla.

---

### FAQ — ¿Cómo sé cuánto stock me queda durante la venta?

Cada producto muestra el stock disponible junto al nombre, tanto en las sugerencias (computador) como en el carrito (celular). Si el stock es 0, el producto igual se puede agregar — verifica con tu inventario físico.

```
🥛 Leche Alquería 1L
   $3.200  ·  Stock: 24   ← disponible

🥛 Leche Colanta 900ml
   $2.800  ·  Stock: 0    ⚠️ agotado
```

---

### FAQ — ¿Puedo aplicar un descuento a toda la venta en lugar de producto por producto?

Sí. En el panel de cobro hay un campo **Descuento** que aplica sobre el total de la venta. Puedes ingresar un porcentaje o un monto fijo.

```
Descuento sobre el total:
┌──────────────────────────┐
│  [ % ]  [ $ ]   10       │
└──────────────────────────┘

Total antes:    $ 10.000
Descuento 10%:  − $  1.000
─────────────────────────
Total final:    $  9.000
```

---

### FAQ — ¿Qué pasa si la IA de Foto Venta no reconoce un producto escrito en la lista?

Si la IA no reconoce un texto de la comanda, lo clasifica bajo **Sin reconocer** con un recuadro ámbar. Puedes tocar las sugerencias automáticas o usar el buscador integrado en la tarjeta para asociar el producto de tu catálogo. Además, puedes tocar **Guardar como apodo** para que en próximas ventas por foto se reconozca en automático.

```
Lectura de comanda:
  "leche tarro" ──► Sin reconocer (ámbar)
         │
         ├── [ 💡 Sugerencia ] ──► Asignar
         │          o
         └── 🔍 Buscar producto ──► Asignar
                       │
                       ▼
         [ 💾 Guardar como apodo ]
```

