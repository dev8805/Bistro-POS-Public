# Cómo registrar un gasto en Bistro

> 👤 Guía para: Todos los roles con permiso de registrar gastos (cajeros y administradores)
> 🧩 Módulo: **Inicio** → **Egresos** → **Gastos** (o **Escanear factura**)
> ⏱️ Tiempo estimado: 1–2 minutos

---

## ¿Para qué sirve?

El registro de gastos te permite anotar los egresos del negocio: arriendo, servicios públicos, nómina, transporte, suministros de oficina, entre otros. Si quieres registrar un gasto, anotar un egreso, guardar lo que gastaste, meter una factura de servicios o llevar el control de lo que sale del negocio, aquí lo haces.

Un gasto **no actualiza el inventario**. Si compraste mercancía para revender o insumos para tus recetas, usa **Compra de inventario** en su lugar, porque esa sí suma stock.

Hay **dos formas** de registrar un gasto y ambas terminan igual:

- 📷 **Escanear factura**: tomas una foto y la IA llena los datos por ti. Necesita internet.
- ✏️ **Gastos** (a mano): escribes todo tú. Funciona con o sin internet.

---

## Antes de empezar

- Si el gasto sale del dinero de la caja, ten un turno de **Caja** abierto antes de registrarlo.
- Si pagaste por otro medio (transferencia, tarjeta corporativa), puedes registrarlo igual: el sistema te pregunta si sale de caja o no.
- El **proveedor es obligatorio** en cualquier gasto, de contado o de crédito.
- No necesitas crear categorías de antemano: puedes crearlas desde el mismo formulario.
- El **escaneo con IA necesita internet**. Sin conexión, la opción **Escanear factura** aparece gris y registras el gasto por **Gastos** (a mano), que sí funciona sin internet.
- Si no ves ninguna opción de egresos, tu usuario no tiene el permiso **Registrar Gastos**. Pídeselo a un administrador.

---

## Escanear la factura con IA

Este es el camino rápido: tomas una sola foto del comprobante y la IA llena el valor, la categoría, el proveedor y la fecha por ti. Tú revisas antes de guardar y esa misma foto queda como evidencia. Son 6 pasos: abrir el escaneo, elegir el destino, tomar la foto, confirmar el proveedor, revisar los datos y elegir cómo se paga.

---

### Paso 1 — Abrir "Escanear factura" desde Egresos

En la pantalla de **Inicio**, en la sección **Finanzas**, toca el botón **Egresos**.

```
┌─────────────────────────────────┐
│  ↘  Egresos                     │
│     Compra · merma              │
└─────────────────────────────────┘
```

Se abre una hoja deslizable. Arriba, destacada con la etiqueta **IA**, está **Escanear factura**. Tócala.

```
  ▬▬▬  (desliza para cerrar)

┌─────────────────────────────────┐
│ ✨ Escanear factura      [IA] › │
│    La IA lee los productos y     │
│    precios. Tú revisas antes.    │
└─────────────────────────────────┘
────────── manualmente ──────────
│  Compra de inventario         › │
│  Gastos                       › │
│  Merma                        › │
```

> ⚠️ Si **Escanear factura** aparece en gris y dice "Necesita conexión a internet", estás sin conexión. Usa **Gastos** para registrar a mano.

---

### Paso 2 — Elegir el destino "Gasto"

El escaneo sirve tanto para compras como para gastos, así que primero pregunta qué trae el documento. Toca **Gasto**.

```
¿Qué trae este documento?

┌─────────────────────────────────┐
│ Compra de inventario          › │
│ Mercancía para revender o       │
│ insumos: entran al stock.       │
├─────────────────────────────────┤
│ Gasto                         › │
│ Servicios, arriendo, transporte │
│ o consumo interno.              │
└─────────────────────────────────┘
```

> 💡 Si te equivocas de destino, puedes volver a este paso antes de guardar.

---

### Paso 3 — Tomar o elegir la foto del comprobante

Elige de dónde sacar la imagen. La misma foto se usa para leer los datos **y** queda como evidencia del gasto.

```
Toma la foto de la factura

┌──────────────┐  ┌──────────────┐
│  📷 Cámara   │  │  🖼 Galería  │
│ Encuadra la  │  │ Elige foto   │
│ factura      │  │ o archivo    │
└──────────────┘  └──────────────┘

  ℹ Peso máximo: 50 MB
```

Después ajustas el **recorte**: arrastra las esquinas para encuadrar solo la factura y confirma. La IA analiza el comprobante ("Leyendo el comprobante...").

> ⚠️ Si el escaneo falla o se demora, verás **Reintentar** y **Continuar manual**. Con **Continuar manual** sigues en el mismo asistente, con la foto ya adjunta y los campos vacíos.

---

### Paso 4 — Confirmar el proveedor

La IA lee el proveedor del encabezado de la factura y lo compara con los que ya tienes. Solo confirmas.

```
Proveedor detectado

┌─────────────────────────────────┐
│  ✓ Aire de la ciudad S.A.       │
│    NIT: 900.123.456             │
└─────────────────────────────────┘
      [ Usar este proveedor ]
   [ Buscar un proveedor existente ]
```

- Si el proveedor **ya existe**, aparece confirmado con un chip verde.
- Si es **nuevo**, muestra el nombre y el NIT en campos editables para que lo crees.
- Si la IA no leyó nada, eliges uno existente o escribes uno nuevo antes de seguir.

---

### Paso 5 — Revisar los datos del gasto

La IA prellena el **valor**, la **categoría**, el **proveedor**, la **fecha** y la **observación**. Todo es editable: revisa y corrige antes de continuar.

```
Datos del gasto

Valor del gasto
┌─────────────────────────────────┐
│  $ 85.000                       │
└─────────────────────────────────┘

Categoría   (la IA sugiere una)
┌─────────────────────────────────┐
│  SERVICIOS                    ▾ │
└─────────────────────────────────┘

Fecha del gasto
┌─────────────────────────────────┐
│  23/05/2025                     │
└─────────────────────────────────┘
      [ Continuar · $85.000 ]
```

> 🤖 La IA propone una **categoría** según lo que leyó. Puedes conservarla, elegir otra o crear una nueva. La fecha no puede ser posterior a hoy.

---

### Paso 6 — Elegir cómo se paga y registrar

El último paso pregunta cómo se pagó el gasto, igual que en el registro a mano.

```
¿Cómo se paga?

Tipo de pago
┌────────────┐  ┌────────────┐
│  Contado   │  │  Crédito   │
└────────────┘  └────────────┘

¿El dinero sale de caja?
┌──────┐  ┌──────┐
│  Sí  │  │  No  │
└──────┘  └──────┘

   [ Registrar gasto · $85.000 ]
```

- **Contado**: ya pagado. Si hay turno abierto, decides si sale de caja y con qué método.
- **Crédito**: queda como deuda con el proveedor. Pide **fecha de vencimiento** y admite un **abono inicial**.

Al tocar **Registrar gasto**, el gasto se guarda y vuelves a la pantalla de inicio.

---

## Registrar un gasto a mano

Esta es la vía manual, siempre disponible incluso sin internet. Escribes todos los datos tú. Son 5 pasos: abrir el formulario, poner fecha/valor/categoría, agregar observación y proveedor, elegir contado o crédito, y completar el pago para confirmar.

---

### Paso 1 — Abrir "Gastos" desde Egresos

En **Inicio** → **Finanzas**, toca **Egresos** y, en la hoja que aparece, toca **Gastos** (en la lista de abajo, bajo el separador "manualmente").

```
────────── manualmente ──────────
│  Compra de inventario         › │
│  Gastos                       › │
│  Merma                        › │
```

Se abre el módulo con dos pestañas: **Registro** e **Historial**.

```
[ Registro ]  |  Historial
  ━━━━━━━━━━
    activa
```

> 💡 En la pestaña **Registro** puedes elegir entre **Gasto Proveedor** (servicios, arriendo, insumos) y **Pago a Personal** (sueldos, turnos, vales a colaboradores). Si vas a pagarle a un colaborador, consulta la guía [Cómo gestionar colaboradores y empleados](file:///c:/Users/HP/OneDrive/Escritorio/Bistro/docs/guias_usuario/como_gestionar_empleados.md).
> 
> 💡 En la sección **Evidencia**, cuentas con los botones **Cámara** y **Galería** para adjuntar una foto de respaldo manual, o el botón **Escanear** (con insignia IA) si prefieres que la inteligencia artificial lea automáticamente el valor, proveedor y observaciones de la factura.

---

### Paso 2 — Poner la fecha, el valor y la categoría

La fecha viene con el día de hoy. Si el gasto fue otro día, toca **Elegir** (no puede ser futura). Escribe el monto en **VALOR** y toca **CATEGORÍA** para elegirla.

```
Fecha
┌──────────────────┐  ┌────────┐
│  23/05/2025      │  │ Elegir │
└──────────────────┘  └────────┘

VALOR                CATEGORÍA
┌────────────┐  ┌─────────────────┐
│  $ 45.000  │  │ Elegir categoría▾│
└────────────┘  └─────────────────┘
```

El selector de categoría tiene buscador y un botón para **crear una nueva** si no existe. Queda disponible para futuros gastos.

---

### Paso 3 — Agregar la observación y el proveedor

En **OBSERVACIONES / DETALLES** escribe una nota (opcional). Luego busca o crea el **Proveedor** (obligatorio).

```
OBSERVACIONES / DETALLES
┌─────────────────────────────────┐
│  Pago de servicios de agosto    │
└─────────────────────────────────┘

Proveedor *
┌────────────────────────┐ [Crear]
│  Buscar proveedor... 🔍 │
└────────────────────────┘
```

- Si el proveedor ya existe, aparece como chip verde con ✓.
- Si es nuevo, toca **Crear** y llena Nombre (obligatorio), NIT/Cédula, Teléfono y Dirección.

> ⚠️ Mientras el proveedor esté vacío, verás el aviso "El proveedor es obligatorio" y el botón de confirmar queda bloqueado.

---

### Paso 4 — Elegir contado o crédito

Debajo eliges el tipo de transacción según cómo se pagó.

```
Tipo de Transacción
┌─────────────┐  ┌─────────────┐
│  Contado    │  │  Crédito    │
└─────────────┘  └─────────────┘
```

```
¿Cómo fue el pago?
      │
      ├── Contado ──► ya fue pagado
      │          (puede salir de caja)
      │
      └── Crédito ──► queda como deuda
                 (Cuentas por Pagar)
```

Cada opción muestra campos distintos, que completas en el Paso 5.

---

### Paso 5 — Completar el pago y confirmar

**Si elegiste Crédito**, ingresa la **Fecha de Pago** (obligatoria) y, si quieres, un **Abono inicial**.

```
Fecha de Pago *
┌──────────────────────────────┐
│  15/06/2025                  │
└──────────────────────────────┘

Abono inicial (opcional)
┌──────────────────────────────┐
│  $ 0                         │
└──────────────────────────────┘
```

**Si elegiste Contado o registraste un abono en Crédito** y tienes turno de caja abierto, aparece **¿El dinero sale de caja?** (o **¿El dinero del abono sale de caja?**). Si respondes **Sí**, eliges el **MÉTODO DE PAGO** (único o dividido) y únicamente el efectivo físico descuenta del arqueo de la caja. Si respondes **No**, se registra como fondos externos sin alterar el turno.

```
¿El dinero sale de caja?
┌──────┐  ┌──────┐
│  Sí  │  │  No  │
└──────┘  └──────┘

MÉTODO DE PAGO
┌──────────────────────────────┐
│ ✓ Efectivo  Disp: $85.000   │
└──────────────────────────────┘
```

Toca **CONFIRMAR REGISTRO** para guardar. El formulario se limpia listo para el próximo gasto.

```
   ╔═══════════════════════════╗
   ║   CONFIRMAR REGISTRO      ║
   ╚═══════════════════════════╝
```

---

## Errores comunes

| Situación | Qué hacer |
|-----------|-----------|
| El botón **CONFIRMAR REGISTRO** o **Registrar gasto** no responde | Verifica **VALOR**, **CATEGORÍA** y **Proveedor** (obligatorio). En crédito, además la **Fecha de Pago**. Con turno abierto: responde a si el dinero sale de caja (en contado o en crédito con abono). |
| **Escanear factura** aparece en gris | Estás sin internet. El escaneo con IA necesita conexión. Usa **Gastos** para registrar a mano (sí funciona sin internet). |
| No aparece ninguna opción de egresos | Tu usuario no tiene el permiso **Registrar Gastos**. Pídeselo a un administrador. |
| El monto supera el saldo de caja | Verás el aviso del disponible. Solo el efectivo físico descuenta de caja. Reduce la porción en efectivo o cambia de método. |
| La pregunta **¿El dinero sale de caja?** no aparece | No tienes un turno de caja abierto. El gasto se registra sin afectar caja. |
| El proveedor no aparece al buscar | Escribe el nombre completo. Si es nuevo, toca **Crear** para registrarlo. |

---

## Preguntas frecuentes

Estas son las dudas más comunes sobre el registro de gastos en Bistro. Si no encuentras tu respuesta aquí, usa el asistente de chat.

---

### FAQ — ¿Cuál es la diferencia entre "Contado" y "Crédito" en un gasto?

"Contado" significa que el gasto ya fue pagado o se paga ahora. "Crédito" significa que quedaste debiendo ese dinero a un proveedor: la deuda queda en **Cuentas por Pagar** para hacerle seguimiento.

---

### FAQ — ¿Cuál es la diferencia entre "Escanear factura" y "Gastos"?

**Escanear factura** abre un asistente por pasos donde la IA lee la foto y llena valor, categoría, proveedor y fecha; tú solo revisas. Necesita internet y adjunta la foto como evidencia. **Gastos** es el formulario a mano: escribes todo tú, funciona sin internet y tiene pestaña **Historial** para editar o eliminar. El gasto final es idéntico en ambos.

---

### FAQ — ¿Puedo editar o eliminar un gasto ya registrado?

Sí. Abre **Egresos** → **Gastos** y entra a la pestaña **Historial**. Puedes editar el monto, la categoría y la observación, o eliminar el gasto completo. Editar **no** corrige lo que ya salió de caja: solo ajusta el registro.

---

### FAQ — ¿La IA elige la categoría por mí?

La IA **sugiere** una categoría según lo que lee del comprobante y la deja pre-seleccionada. Puedes conservarla, elegir otra de la lista o crear una nueva antes de guardar. Si no está segura, deja la categoría vacía para que la elijas tú.

---

### FAQ — ¿Puedo registrar un gasto sin conexión a internet?

Sí, por la vía **Gastos** (a mano). Bistro lo guarda localmente y lo sincroniza al recuperar la conexión. El **escaneo con IA** sí requiere internet, porque la foto se procesa en la nube; sin conexión esa opción se desactiva.

---

### FAQ — ¿Qué tan exacto es el escaneo con IA?

La IA lee el comprobante y propone valor, categoría, observación, proveedor y fecha, pero **siempre debes revisar**. Todos los campos son editables: corrige lo que haga falta antes de confirmar. Para mejores resultados, encuadra bien la factura al recortar y usa buena iluminación.

---

### FAQ — ¿Para qué sirven las categorías de gastos?

Las categorías organizan los gastos por tipo (arriendo, servicios, nómina, etc.) y te dejan ver en el **Dashboard** cuánto gasta el negocio en cada rubro. Puedes crear las que necesites desde el mismo formulario.

---

## Recursos multimedia *(opcional)*

| Tipo | Nombre sugerido | Qué mostraría |
|------|----------------|---------------|
| GIF | "Bistro — Escanear factura de gasto con IA — flujo completo" | Desde **Escanear factura** → destino **Gasto** hasta **Registrar gasto** |
| GIF | "Bistro — Registrar gasto a mano — contado desde Egresos" | Desde el botón **Egresos** → **Gastos** hasta **CONFIRMAR REGISTRO** |
| Imagen | "Bistro — Menú de Egresos — Escanear factura y opciones manuales" | La hoja con **Escanear factura** y las tres opciones manuales |
