# Cómo anular o devolver una venta en Bistro

> Guía para: Cajeros y administradores
> Módulo: Facturas (Historial de ventas) y Caja
> Tiempo estimado: 1–2 minutos

---

## ¿Para qué sirve?

Sirve para **revertir una venta** cuando hubo un error o cuando un cliente devuelve un producto. Es lo que buscás si querés anular una factura, cancelar un producto mal cobrado, hacer una devolución, reversar una venta, corregir un cobro equivocado o devolverle la plata a un cliente.

Bistro maneja dos formas según el momento de la venta:

- **Anular**: corrige una venta del **turno que tenés abierto ahora** (un error reciente). Borra el efecto de la venta como si no hubiera pasado.
- **Devolución**: revierte una venta de un **turno ya cerrado** (el cliente vuelve días después). Deja un registro aparte y la venta original queda intacta.

Las dos dejan rastro y nunca borran la venta de verdad.

---

## Antes de empezar

- Necesitás **conexión a internet**: anular y devolver no funcionan sin red.
- Para **devolver** necesitás tener un **turno de Caja abierto**.
- Permisos: anular requiere el permiso **Anular Facturas**; devolver requiere **Devoluciones**. Si no los tenés, pedile a un administrador que te los active en **Empleados**.
- Una venta no se puede anular y devolver a la vez: si ya devolviste un producto, ese mismo producto ya no se puede anular (y al revés).

---

## Paso a paso

Esta sección tiene 6 pasos: primero entendés cuál de las dos acciones aplica según el turno, luego cómo anular una venta completa o un solo producto del turno abierto, después cómo hacer una devolución de una venta de turno cerrado y elegir los productos, y por último el caso especial de las ventas a crédito (fiado). Saltá al paso que necesites.

---

### Paso 1 — Saber si toca Anular o Devolver

No elegís vos: Bistro muestra la acción correcta según el turno al que pertenece la venta. La regla es:

```
       ¿La venta es de tu turno ABIERTO de hoy?
                      │
          ┌───────────┴───────────┐
         SÍ                        NO
          │                        │
          ▼                        ▼
     🚫 ANULAR              ↩ DEVOLUCIÓN
   (corregir error)      (turno ya cerrado /
                          día anterior)
```

Por eso, en una venta vieja **no aparece** el botón Anular, sino Devolución; y en una venta del turno actual aparece Anular.

> 💡 **Tip:** si abrís una factura vieja y solo ves **Devolución**, es correcto: esa venta ya quedó en un turno cerrado.

> 📘 **¿Qué es un "turno"?** Es el período de Caja entre que la abrís (al empezar) y la cerrás (al cuadrar). Una venta "del turno abierto" es la que hiciste desde que abriste la caja actual y todavía no la has cerrado.

---

### Paso 2 — Anular una venta completa del turno abierto

Abrí **Historial de ventas**, tocá la venta y en el encabezado del detalle tocá el botón rojo **🚫**.

```
Venta #0042              Juan García
───────────────────────────────────
🖨   💬   ✉   🔗   ⬇        🚫
                          Anular
```

Se abre una ventana que pide el **motivo** (obligatorio). Elegí uno o escribí el tuyo en "Otro" y confirmá.

```
┌─ Anular venta #0042 ─────────┐
│  Motivo de anulación *       │
│  ( ) Error del cajero        │
│  ( ) Producto equivocado     │
│  ( ) Cliente se arrepintió   │
│  ( ) Venta duplicada         │
│  ( ) Venta de prueba         │
│  ( ) Otro                    │
│                              │
│  [ Cancelar ] [ Anular venta]│
└──────────────────────────────┘
```

Al confirmar, la venta queda **tachada y marcada "ANULADA"**, el stock de los productos físicos vuelve al inventario y se descuenta del cierre de caja.

> 💡 **Importante:** si la venta se había cobrado en **efectivo**, anularla ajusta tu caja, pero **el dinero físico se lo devolvés vos al cliente** de tu cajón. El sistema no abre el cajón ni entrega plata solo.

---

### Paso 3 — Anular un solo producto de la venta

Si solo un producto quedó mal y el resto de la venta está bien, no anules todo. En el detalle, tocá el **🚫** que aparece en la fila de ese producto.

```
Producto            Cant.  V.prod
───────────────────────────────────
Coca Cola 350ml       2    $7.000  🚫
Pan tajado            1    $4.500  🚫
```

Pide el mismo motivo. Al confirmar, ese producto queda tachado como "(anulado)", su stock vuelve al inventario y el **total de la venta se recalcula** solo.

```
DESPUÉS de anular "Pan tajado"
───────────────────────────────────
Coca Cola 350ml       2    $7.000
P̶a̶n̶ ̶t̶a̶j̶a̶d̶o̶ (anulado)  —      —
───────────────────────────────────
TOTAL                      $7.000  ▼
```

> 💡 Si anulás todos los productos de una venta, la venta completa queda anulada automáticamente.

---

### Paso 4 — Iniciar una devolución (turno cerrado)

Para revertir una venta de un turno ya cerrado tenés dos caminos, ambos abren la misma ventana de devolución:

- **Desde Caja**: en el panel de Caja tocá la acción **↩ Devolución** y buscá la venta por número o cliente.
- **Desde Historial de ventas**: abrí la venta vieja y tocá el botón verde **↩ Devolución** del encabezado (llega con la venta ya cargada).

```
Acción en Caja
┌───────┐ ┌───────┐ ┌───────────┐
│Entrada│ │Salida │ │ ↩ Devol.  │
└───────┘ └───────┘ └───────────┘
```

> 🔒 **Bloqueo:** necesitás un **turno abierto** para devolver. Si no lo tenés, la ventana muestra el aviso "Debes tener un turno abierto" y no deja confirmar.

---

### Paso 5 — Elegir productos, cantidad y método

En la ventana de devolución, subí o bajá la cantidad a devolver de cada producto con los botones **−** y **+** (no podés pasarte de lo que se vendió). Marcá **Reingresar** si el producto vuelve al inventario.

```
┌─ Devolución de venta #0040 ──┐
│  Coca Cola 350ml  pendiente 2│
│  [ − ]  1  [ + ]   ☑ Reingr. │
│                              │
│  Método de devolución        │
│  ( ) Efectivo  ( ) Nequi ... │
│                              │
│  Motivo *                    │
│  ( ) Producto defectuoso     │
│  ( ) Cliente insatisfecho    │
│                              │
│  Total a devolver   $3.500   │
│  [ Cancelar ] [ Devolver ]   │
└──────────────────────────────┘
```

Elegí el **método** por el que devolvés el dinero y un **motivo**. Tocá **Devolver** y queda registrada; la venta original no se modifica.

> 💡 **Sobre "Reingresar":** marcala solo si el producto vuelve en buen estado y lo podés vender de nuevo. Si vuelve **dañado, vencido o abierto**, dejala **sin marcar** para que no sume al inventario un producto que no vas a vender.

---

### Paso 6 — Ventas a crédito (fiado): baja la deuda, no la caja

Cuando la venta fue a **crédito**, el cliente nunca pagó, así que anular o devolver **no mueve la caja**: en cambio **le baja la deuda** al cliente por el monto del producto revertido.

```
Producto de venta a CRÉDITO revertido
                │
                ▼
  ✔ Baja la deuda del cliente
  ✘ No entra ni sale plata de la caja
  ✔ Queda el registro
```

En la ventana de devolución de una venta a crédito **no aparece el método de pago**; en su lugar verás el aviso:

```
┌──────────────────────────────────┐
│ 💳 Venta a crédito                │
│ No reflejará movimiento en caja.  │
│ El monto se descontará de la      │
│ deuda del cliente.                │
└──────────────────────────────────┘
```

El nuevo saldo se ve de inmediato en **Cuentas por Cobrar**, y el producto anulado aparece tachado en el historial del cliente.

---

## Errores comunes

Casi todos los problemas al anular o devolver caen en esta tabla: no aparece el botón que esperás, el sistema bloquea la acción, o no tenés permiso o turno.

| Situación | Qué hacer |
|-----------|-----------|
| En una factura no veo "Anular", solo "Devolución" | Es correcto: esa venta es de un turno ya cerrado. Usá **Devolución**. |
| No veo ni Anular ni Devolución | No tenés el permiso. Pedí a un administrador que active **Anular Facturas** o **Devoluciones** en Empleados. |
| "Debes tener un turno abierto" | Abrí un turno en **Caja** antes de devolver. |
| "Esta venta es de un turno abierto. Usa Anular" | Estás intentando devolver una venta del turno actual. Cerrala con **Anular**. |
| "Esta venta pertenece a un turno ya cerrado" al anular | Usá **Devolución** en vez de Anular. |
| "El producto está anulado y no se puede devolver" (o al revés) | Ese producto ya se revirtió por la otra vía. No se puede dos veces. |
| No funciona sin internet | Anular y devolver requieren conexión. Conectate y reintentá. |

---

## Preguntas frecuentes

Estas son las dudas más comunes sobre anular y devolver: la diferencia entre las dos, qué pasa con el inventario y la caja, el caso del fiado, si se puede revertir solo un producto y por qué a veces el sistema bloquea la acción.

---

### FAQ — ¿Cuál es la diferencia entre anular y devolver?

**Anular** corrige una venta del turno que tenés abierto ahora (un error reciente): borra su efecto como si no hubiera pasado y baja del cierre. **Devolución** revierte una venta de un turno ya cerrado (el cliente vuelve después): deja un registro aparte y la venta original queda intacta. Bistro muestra automáticamente la opción que corresponde según el turno de la venta.

---

### FAQ — ¿Qué pasa con el inventario al anular o devolver?

Los productos físicos (mercancía) vuelven al inventario. En la **anulación** vuelven siempre; en la **devolución** vuelven solo si marcás la casilla **Reingresar**. Los servicios no afectan inventario porque nunca descontaron stock.

```
Producto físico revertido
   │
   ├─ Anulación → vuelve al stock siempre
   └─ Devolución → vuelve solo si marcás
                    "Reingresar"
```

---

### FAQ — ¿Si la venta fue fiada (crédito) me sale plata de la caja?

No. En ventas a crédito no entró dinero, así que no sale nada de la caja. Lo que ocurre es que **se le baja la deuda al cliente** por el monto revertido. El nuevo saldo aparece de una vez en **Cuentas por Cobrar**.

```
Venta a crédito revertida
   │
   ├─ Caja:  no se toca
   └─ Deuda: baja por el monto
             del producto
```

---

### FAQ — ¿Puedo revertir un solo producto y no toda la venta?

Sí. Al **anular**, cada fila de producto tiene su propio botón 🚫. Al **devolver**, elegís la cantidad por producto con los botones − y +. El total se ajusta solo. Si anulás todos los productos, la venta entera queda anulada.

---

### FAQ — ¿Por qué no me deja anular un producto que ya devolví?

Porque una cosa excluye a la otra. Si un producto ya tiene una devolución registrada, no se puede anular además (sería contarlo dos veces). Lo mismo al revés: un producto anulado no se puede devolver. El sistema lo bloquea con un aviso.

---

### FAQ — ¿La anulación o devolución cambia el ticket impreso?

No. Lo impreso (ticket, comanda, recibo) no se modifica. El detalle de la anulación o devolución se ve solo en pantalla: en la factura, en el historial del turno y en el reporte de cierre.

---

### FAQ — ¿Hay un plazo máximo para devolver una venta?

El sistema **no impone un límite de tiempo**: podés devolver una venta de hace días o semanas mientras tengas un turno abierto. El plazo que aceptás (por ejemplo, "solo dentro de 8 días") es una **política de tu negocio**, no una regla de Bistro.

---

## Recursos multimedia *(opcional)*

| Tipo | Nombre sugerido | Qué mostraría |
|------|----------------|---------------|
| GIF | "Bistro — Anular venta del turno con motivo" | Tocar 🚫, elegir motivo y ver la venta tachada |
| GIF | "Bistro — Devolución de venta de turno cerrado" | Buscar venta, elegir cantidad y método, confirmar |
| Imagen | "Bistro — Aviso de devolución en venta a crédito" | La ventana con el aviso de fiado sin método de pago |
