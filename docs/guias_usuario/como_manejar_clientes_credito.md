# Cómo manejar clientes con crédito (fiado) en Bistro

> Guía para: Todos los roles (cajeros y administradores)
> Módulo: Cuentas por Cobrar
> Tiempo estimado: 2–5 minutos por operación

---

## ¿Para qué sirve?

El módulo de **Cuentas por Cobrar** te permite llevar el control del fiado: quién te debe, cuánto, cuándo vence y cuánto ha pagado. Desde aquí puedes registrar nuevas deudas, anotar abonos y enviar recordatorios de pago por WhatsApp o correo electrónico, todo en un solo lugar.

Si quieres saber quién te debe, anotar un pago, enviar un recordatorio de fiado, ver el dinero que tienes "en la calle" o consultar la cartera de clientes — este es el módulo.

---

## Antes de empezar

- El cliente debe estar registrado. Si es la primera vez, puedes crearlo directamente desde este módulo o desde la pantalla de cobro.
- Si vas a registrar un abono en efectivo y quieres que entre a la caja, debes tener un **turno de Caja abierto** (módulo **Caja**).

---

## Paso a paso

Esta sección cubre las operaciones más comunes del módulo de cartera: abrir la pantalla, crear clientes nuevos (desde el cobro o desde el módulo), registrar deudas y abonos, enviar recordatorios y revisar el resumen general. Cada operación es independiente — saltá al paso que necesites según lo que vayas a hacer.

---

### Paso 1 — Abrir el módulo (Clientes / Cuentas por Cobrar)

En el menú el módulo se llama **Clientes**; al abrirlo, el título de la pantalla es **Cuentas por Cobrar**.

**En celular**, en la HomeScreen, sección **Finanzas**, toca **Clientes**:

```
FINANZAS
┌─────────────┐ ┌─────────────┐
│ ↘  Egresos  │ │ 💰 Abonos   │
│ Compra·merma│ │ Client·Prov │
└─────────────┘ └─────────────┘
┌─────────────┐ ┌─────────────┐
│ � Clientes◄│ │ 💳 Provee-  │
│ $ pendiente │ │ dores       │
└─────────────┘ └─────────────┘
```

**En computador**, sidebar izquierdo, sección **Gestión**, toca **Clientes**:

```
│ GESTIÓN                     │
│  👥 Clientes            ◄── │
│  💳 Proveedores             │
```

La pantalla muestra todo en una sola vista: el resumen de cartera arriba y la lista de clientes debajo. Solo tienes que hacer scroll para navegar.

```
┌─ Cuentas por Cobrar ──────────┐
│                 [+ Nuevo Cli] │
├───────────────────────────────┤
│  [Por Cobrar][Vencido][Mes]   │  ← indicadores
│  [Gráfico antigüedad]         │
│  [Top 5 deudores]             │
│  ─────────────────────────    │
│  🔍 Buscar... [Todos][Venc.]  │  ← lista clientes
│  María G.  $50K   Al día      │
│  ...                          │
└───────────────────────────────┘
```

---

### Paso 2 — Crear un cliente desde la pantalla de cobro (rápido)

Al cobrar una venta a crédito en **Punto de Venta**, en el campo **Asignar a Cliente** hay un botón **+ Crear**. Tócalo para registrar al cliente sin salir del cobro. El cliente queda seleccionado de inmediato para continuar con la venta.

```
┌─ Crédito ─────────────────┐
│  Asignar a Cliente *      │
│  ┌────────────┐ [+ Crear] │
│  │ 🔍 Buscar │            │
│  └────────────┘            │
└───────────────────────────┘
```

> 💡 **Consejo:** Esta es la vía más rápida cuando el cliente está enfrente. Solo se piden los tres datos obligatorios (Nombre, Identificación, Teléfono).

---

### Paso 3 — Crear un cliente desde el módulo Cuentas por Cobrar

Si quieres registrar un cliente antes de venderle (por ejemplo, para configurarle un cupo de crédito), abrí el módulo y toca **Nuevo Cliente** en la cabecera. Completa el formulario y toca **Guardar Cliente**.

```
┌─ Registrar Nuevo Cliente ──┐
│                        [✕] │
│  Nombre Completo *         │
│  ┌──────────────────────┐  │
│  │ Ej: Juan Pérez       │  │
│  └──────────────────────┘  │
│  Número de Identificación *│
│  ┌──────────────────────┐  │
│  │                      │  │
│  └──────────────────────┘  │
│  Teléfono *                │
│  ┌──────────────────────┐  │
│  │ 🇨🇴 +57 ...           │  │
│  └──────────────────────┘  │
│  ─ Opcionales ──────────── │
│  Email · Dirección ·       │
│  Cupo de Crédito           │
│                            │
│      [ Guardar Cliente ]   │
└────────────────────────────┘
```

> ⚠️ **Aviso:** Los tres campos con `*` (Nombre Completo, Número de Identificación y Teléfono) son obligatorios. Si intentas guardar sin completarlos, el sistema te los resalta para que los llenes.

---

### Paso 4 — Abrir el panel de detalle del cliente

Para registrar deudas, abonos o ver el historial, abrí primero el panel de detalle. En la lista de clientes (parte inferior de la pantalla), toca el nombre del cliente:

```
┌─ María García ─────── [✕] ─┐
│  📞 315 123 4567            │
│  🪪 1.234.567.890           │
│  ┌──────────┐ ┌──────────┐  │
│  │  Deuda   │ │  Abonos  │  │
│  │  Actual  │ │ Totales  │  │
│  │ $50.000  │ │ $10.000  │  │
│  └──────────┘ └──────────┘  │
│  [Registrar Deuda] [Abono]  │
│  ── Historial ────────────  │
│  ...                        │
└─────────────────────────────┘
```

Desde acá salen **Registrar Deuda** y **Registrar Abono**, además de **Editar** y **Eliminar** el cliente. En el historial encuentras **Compartir/WhatsApp**, **Descargar** (PDF) y **Limpiar**. El recordatorio por **WhatsApp** y por **correo** con el saldo se envían desde la lista de clientes (Cartera).

---

### Paso 5 — Registrar una deuda al cliente

Con el panel de detalle abierto, toca **Registrar Deuda**. Se abre el modal — ingresa el monto, una descripción opcional y la fecha de pago, y confirma.

```
┌─ Agregar Nueva Deuda ──────┐
│  Para: María García        │
│                            │
│  Monto                     │
│  ┌────────────────────┐    │
│  │ $ 0                │    │
│  └────────────────────┘    │
│  Descripción               │
│  ┌────────────────────┐    │
│  │ Ej: Compra almuerz │    │
│  └────────────────────┘    │
│  Fecha de pago *           │
│  ┌────────────────────┐    │
│  │  📅  aaaa-mm-dd    │    │
│  └────────────────────┘    │
│  [Cancelar]  [Confirmar]   │
└────────────────────────────┘
```

> 🔒 **Bloqueo:** El botón **Confirmar** se activa cuando ingresas un **monto** mayor a $0. La **Fecha de pago** es obligatoria — si intentas confirmar sin ella, el sistema te pide completarla.

Al confirmar, el saldo del cliente se actualiza de inmediato.

---

### Paso 6 — Validación de cupo al registrar una deuda

Si el cliente tiene un **cupo de crédito** configurado, el sistema lo valida antes de guardar la nueva deuda. Funciona así:

```
¿La nueva deuda supera el cupo?
           │
      ┌────┴────┐
     SÍ         NO
      │           │
      ▼           ▼
   Error:      Deuda
   no se       guardada
   guarda      ✓
   ❌
```

Si el cupo está en `$0` (sin configurar), no aplica ningún límite.

> 💡 **Consejo:** Para destrabar un cliente que llegó al cupo, reduce el monto de la deuda o edita el cupo desde el botón **Editar** en su panel de detalle.

---

### Paso 7 — Registrar un abono desde Cuentas por Cobrar

Con el panel de detalle del cliente abierto, toca **Registrar Abono**. Se abre el modal donde ingresas el monto, descripción opcional y el medio de pago.

```
┌─ Registrar Abono ──────────┐
│  Para: María García        │
│                            │
│  Monto                     │
│  ┌────────────────────┐    │
│  │ $ 0                │    │
│  └────────────────────┘    │
│  Descripción               │
│  ┌────────────────────┐    │
│  │ Ej: Pago efectivo  │    │
│  └────────────────────┘    │
│  Medio de pago             │
│  [Efectivo][Nequi][Davip.] │
│  [Tarjeta][Transfer.][Otro]│
│                            │
│  [Cancelar]  [Confirmar]   │
└────────────────────────────┘
```

---

### Paso 8 — Registrar un abono desde Inicio (acceso directo)

Si no quieres entrar al módulo, en la HomeScreen sección **FINANZAS** toca **Abonos**. Se abre un panel para elegir entre abonos de clientes o proveedores:

```
┌─────────────────────────────┐
│   ────                      │
│ ┌─────────────────────────┐ │
│ │ 👤 Abonos de Clientes   │>│
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ 🚚 Abonos a Proveedor   │>│
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

Elige **Abonos de Clientes**, selecciona el cliente y se abre el mismo modal del Paso 7.

---

### Paso 9 — Cómo entra el abono a la caja

El destino del dinero del abono depende de si hay un turno de **Caja** abierto en el momento del registro:

```
¿Hay turno de caja activo?
          │
     ┌────┴────┐
    SÍ         NO
     │           │
     ▼           ▼
  Abono +    Abono reduce
  entra a    deuda PERO
  la caja    no entra
  ✓          a la caja ⚠️
```

> ⚠️ **Aviso:** Sin turno activo, el modal muestra un aviso ámbar y los botones de medio de pago no aparecen. El abono igual reduce la deuda del cliente, solo que el efectivo no se suma a tu caja.

---

### Paso 10 — Enviar un recordatorio por WhatsApp

En la lista de **Cartera**, toca el ícono de **WhatsApp** junto al cliente. El mensaje ya sale escrito con el saldo pendiente. El comportamiento depende del dispositivo:

```
¿Desde dónde envías?
         │
    ┌────┴──────────┐
  Celular        Computador
    │                │
    ▼                ▼
  Abre WhatsApp  Abre WhatsApp
  app nativa     Web con el
  con el mensaje mensaje ya
  ya escrito     escrito
  ✓              ✓
```

En ambos casos el mensaje de recordatorio (con el saldo pendiente) queda listo; solo tienes que enviarlo. No se copia ninguna imagen.

---

### Paso 11 — Enviar un recordatorio por correo electrónico

En la lista de clientes, toca el ícono de **correo** (sobre) junto al cliente. Se abre la ventana **Enviar por Correo**: escribe el correo del destinatario y toca **Enviar Comprobante**.

```
┌─ Enviar por Correo ─────────[✕]─┐
│  Correo del destinatario        │
│  ┌───────────────────────────┐  │
│  │ cliente@ejemplo.com       │  │
│  └───────────────────────────┘  │
│        [ Enviar Comprobante ]   │
└─────────────────────────────────┘
```

> 💡 **Consejo:** No necesitas tener el correo guardado en la ficha del cliente: puedes escribir cualquier dirección al momento de enviar.

---

### Paso 12 — Ver el resumen general de cartera

Al abrir el módulo, en la parte superior verás tres indicadores y el gráfico de antigüedad de saldos.

```
┌───────────┐ ┌──────────┐ ┌──────────┐
│ Total Por │ │ Vencido  │ │ Cobrado  │
│ Cobrar    │ │ > 1 Día  │ │ Este Mes │
│ $850.000  │ │ $200.000 │ │ $120.000 │
└───────────┘ └──────────┘ └──────────┘
```

El gráfico de **Antigüedad de Saldos** distribuye la deuda en 4 rangos. Toca una barra para ver los clientes de ese rango:

```
Antigüedad de Saldos
  ██
  ██  ░░
  ██  ░░  ▒▒
  ██  ░░  ▒▒  ▓▓
──────────────────
Al   1-30 31-60 +60
Día  días  días  días
```

---

### Paso 13 — Buscar y filtrar clientes

La sección de **Cartera** (en la parte inferior de la pantalla, debajo del resumen) lista todos los clientes con deuda. Puedes buscar por nombre o teléfono y filtrar por estado.

```
┌─ Cartera ──────────────────┐
│ 🔍 Buscar nombre...        │
│ [Todos][Vencidos][Al Día]  │
├────────────────────────────┤
│ María G.  $50K    Al día   │
│ Pedro R.  $30K    5 días   │
│ ...                        │
├────────────────────────────┤
│ Total vista: $80.000       │
└────────────────────────────┘
```

El campo **Total vista** se recalcula según el filtro activo, así que sabes cuánto dinero suma el subconjunto que estás viendo.

---

## Errores comunes

Los problemas más reportados al manejar cartera están en esta tabla, con la acción concreta para resolverlos.

| Situación | Qué hacer |
|-----------|-----------|
| El sistema no me deja registrar una deuda | El cliente tiene un cupo configurado y el nuevo monto lo supera. Reduce el monto o edita el cupo desde el botón **Editar** en el panel del cliente. |
| El sistema no me deja registrar un abono | El abono no puede ser mayor a la deuda actual del cliente. Ingresa un monto igual o menor al saldo pendiente. |
| El abono no aparece en la caja del turno | Verifica si tenías un turno de **Caja** abierto cuando registraste el abono. Sin turno activo, el abono reduce la deuda pero no entra a la caja. |
| Un cliente aparece como "Al día" pero tiene deudas vencidas | El sistema usa solo la fecha de la **última** deuda. Revisa el historial completo en el panel de detalle. |
| El botón de **correo** no envía nada | Toca el ícono de correo (sobre) en la fila del cliente para abrir **Enviar por Correo**, escribe una dirección válida y toca **Enviar Comprobante**. Necesitas internet; no hace falta tener el correo guardado en la ficha. |
| No puedo deshacer un abono o deuda registrada | Sí se puede: en el panel de detalle, toca el ícono de eliminar junto a la transacción y confirma. |
| Eliminé un cliente con deuda y ya no aparece en los totales | Al eliminar un cliente, su deuda desaparece del resumen sin dejar registro. No es recuperable. |

Por qué un cliente con deudas vencidas aparece "Al día":

```
Deudas del cliente:
 Deuda 1: vence 2024-01-01 ← vencida
 Deuda 2: vence 2025-12-31 ← al día
                   ↑
   Sistema mira SOLO esta fecha
   → muestra estado "Al Día"
```

---

## Preguntas frecuentes

Esta sección cubre dudas comunes sobre notificaciones automáticas, historial del cliente, validación de cupo, ventas a crédito desde el punto de venta y cómo cerrar deudas por completo.

---

### FAQ — ¿El sistema avisa automáticamente cuando una deuda está próxima a vencer?

No. Bistro no envía notificaciones automáticas. Debes revisar el módulo **Cuentas por Cobrar** periódicamente y enviar los recordatorios manualmente por WhatsApp o correo desde el panel de detalle del cliente.

> 💡 **Consejo:** Baja a la sección **Cartera** (al fondo de la pantalla) y usa el filtro **Vencidos** para encontrar rápido los clientes a quienes contactar primero.

---

### FAQ — ¿Puedo ver el historial completo de deudas y abonos de un cliente?

Sí. En el panel de detalle del cliente verás todas las transacciones (deudas y abonos) con fecha y monto. En computador, toca el botón **PDF** para descargar el historial. En celular, usa el ícono de **Compartir** para enviarlo por WhatsApp, correo u otra app.

```
Panel detalle → ── Historial ──
  2025-05-10  Deuda    +$30.000
  2025-05-15  Abono    −$10.000
  2025-05-20  Deuda    +$50.000
  ...
```

---

### FAQ — ¿El sistema bloquea el crédito si el cliente supera su cupo?

Depende de si el cupo está configurado. El sistema valida así al intentar registrar la deuda:

```
¿Tiene cupo configurado?
         │
    ┌────┴────┐
   SÍ         NO
    │           │
    ▼           ▼
¿Supera       Sin límite —
el cupo?      se registra ✓
    │
 ┌──┴──┐
SÍ     NO
 │      │
 ▼      ▼
Error  Deuda
bloq.  guardada ✓
```

Si el cupo está en `$0` (sin configurar), no aplica ningún límite y la deuda se registra siempre.

---

### FAQ — ¿Puedo cobrar a crédito desde el punto de venta sin usar este módulo?

Sí. Al hacer una venta, en el panel de cobro cambia a la pestaña **Crédito**, selecciona el cliente (o créalo en el momento con **+ Crear**) y registra la venta. La deuda se crea automáticamente y aparece en **Cuentas por Cobrar** sin pasos adicionales.

```
Venta a crédito → genera deuda automática

  Punto de Venta             Cuentas por Cobrar
  ┌──────────────┐           ┌──────────────┐
  │ Pestaña      │  ────►    │ Cliente con  │
  │ Crédito      │           │ deuda nueva  │
  └──────────────┘           └──────────────┘
```

---

### FAQ — ¿Qué pasa si el cliente paga el total de la deuda de una sola vez?

Registra un abono por el monto total de la deuda. La deuda queda en `$0` y el cliente deja de aparecer en la lista de **Cartera** (que solo muestra clientes con saldo pendiente).

```
ANTES del abono:
  Deuda Actual: $ 50.000
  Estado: aparece en la lista

DESPUÉS del abono total ($50.000):
  Deuda Actual: $ 0
  Estado: oculto de la lista ✓
```

El cliente sigue existiendo en el sistema — solo desaparece del listado de cartera porque no debe nada.

---

### FAQ — ¿Puedo enviar el historial de movimientos de un cliente por WhatsApp?

Sí. En el panel de detalle:

- **En celular**: toca **Compartir** — se comparte un enlace a la página web con el historial del cliente (o se copia el enlace al portapapeles).
- **En computador**: toca **WhatsApp** — abre WhatsApp Web con un mensaje que incluye el enlace al historial del cliente, listo para enviar.

---

### FAQ — ¿Qué pasa con la deuda si anulo o devuelvo una venta fiada?

La deuda del cliente **baja automáticamente** por el monto del producto revertido, sin que tengas que registrar un abono. Como en el fiado no entró dinero, **la caja no se toca**: solo se ajusta la deuda. El producto anulado aparece tachado en el historial del cliente.

```
Venta a crédito revertida
   │
   ├─ Caja:  no se mueve (no entró plata)
   └─ Deuda: baja sola por el monto
             del producto

Ítem en el historial del cliente:
   P̶a̶n̶ ̶t̶a̶j̶a̶d̶o̶ (anulado)
```

El paso a paso para anular o devolver está en la guía **Cómo anular o devolver una venta**.
