# Cómo etiquetar la comanda con el botón Pedido en Bistro

> Guía para: Cajeros y Administradores
> Módulo: Punto de Venta → Botón "Pedido" en el carrito
> Tiempo estimado: 3 minutos

---

## ¿Para qué sirve?

El botón **Pedido** te permite etiquetar la comanda de cocina con información útil antes de enviarla: un número de localizador, una mesa de referencia o el tipo de pedido (Para llevar, Domicilio, etc.). Si quieres marcar un pedido con un número, identificar de qué mesa viene, o indicarle a cocina que es un domicilio, este botón es el lugar donde lo haces.

La etiqueta que elijas se imprime en la comanda de cocina para que el personal sepa a quién pertenece el pedido y cómo entregarlo. No afecta el cobro ni el ticket del cliente — solo la comanda.

---

## Antes de empezar

- El negocio debe estar en **Modo Catálogo** (las tarjetas visuales de productos). Sin este modo, no hay comanda ni botón Pedido.
- El toggle **Botón "Pedido" en el carrito** debe estar activado en **Ajustes → Activar/Desactivar**. Viene activado por defecto.
- Solo el **dueño** del negocio puede activar o desactivar estos toggles.

```
Menú lateral → Ajustes → Activar/Desactivar

┌─ Activar / Desactivar ───────────┐
│  ▦ Modo Catálogo          [ ✓ ]  │
│  ᐊ Mesas                  [ _ ]  │
│  ⊙ Botón "Pedido"         [ ✓ ]  │ ← este
│    en el carrito                  │
└───────────────────────────────────┘
```

> ⚠️ Si el Modo Catálogo está desactivado, el toggle del botón Pedido aparece atenuado y no se puede activar.

---

## Paso a paso

Para etiquetar una comanda hay que hacer tres cosas: tocar el botón Pedido en el carrito, elegir las etiquetas en la ventana, y enviar la comanda al finalizar la venta. El botón aparece al lado del badge "Orden Rápida" en el header del carrito.

### Paso 1 — Ubicar el botón Pedido en el carrito

En el header del carrito (panel derecho en desktop, parte superior en móvil) verás dos elementos: el badge **Orden Rápida** y el botón **Pedido**. Si aún no elegiste etiquetas, el botón se ve neutro con borde amarillo.

```
┌─────────────────────────────────┐
│ ● ORDEN RÁPIDA   [ PEDIDO ]    │
│                                 │
│ DETALLES                        │
│                                 │
│         🛒                      │
│      Orden vacía                │
│                                 │
│  ┌─────────────────────────┐    │
│  │  PROCESAR PAGO → $0     │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
```

Toca `[ PEDIDO ]` para abrir la ventana de etiquetas.

### Paso 2 — Abrir la ventana "Etiquetar comanda"

Al tocar el botón se abre la ventana **Etiquetar comanda**. Tiene tres pestañas y un grid de píldoras para elegir. La ventana completa se ve así:

```
┌──────────────────────────────────┐
│ ◎  Etiquetar comanda      ⚙  ✕ │
├──────────────────────────────────┤
│ ◉ Localizador │ᐊ Mesas │⊙ Tipo │
│                    de pedido     │
│━━━━━━━━━━━━━━━                   │
│                   Editar lista   │
│                                  │
│  (1)  (2)  (3)  (5)  (6)       │
│                                  │
│  (7)  (8)  (9) (10)            │
│                                  │
├──────────────────────────────────┤
│ SELECCIÓN            Ninguna     │
│                                  │
│ [ Cancelar ]   [ ✓ Guardar ]    │
└──────────────────────────────────┘
```

Las tres pestañas son:

| Pestaña | Para qué sirve | Ejemplo |
|---------|----------------|---------|
| **Localizador** | Número del dispositivo vibrador o turno | 1, 2, 3... 10 |
| **Mesas** | Mesa de referencia para cocina | 1, 2, 3... 10 |
| **Tipo de pedido** | Cómo se entrega | Para llevar, Domicilio |

> 💡 Estas "Mesas" son solo etiquetas de texto para la comanda. No son las mesas del sistema POS (las de asignar órdenes por mesa).


### Paso 3 — Elegir etiquetas en las pestañas

Toca la píldora del valor que quieras. La selección se marca con fondo amarillo. Puedes combinar una etiqueta de cada pestaña (por ejemplo: Localizador 3 + Domicilio).

```
◉ Localizador

  1    2   [3]   5    6
  7    8    9   10
              ↑
        seleccionado (fondo amarillo)
```

**Reglas de selección:**

- Dentro de cada pestaña solo puedes elegir **una** opción.
- Entre pestañas puedes **combinar** (Loc + Mesa + Tipo de pedido).
- Las pestañas que ya tienen selección muestran un **punto amarillo** al lado del nombre.

### Paso 4 — Guardar la selección

Toca `[ ✓ Guardar ]`. La ventana se cierra y el botón Pedido ahora muestra un resumen de lo que elegiste, con fondo amarillo tenue:

```
┌─────────────────────────────────┐
│ ● ORDEN RÁPIDA                  │
│   [ Loc 3 · Domicilio ]        │
│        ↑ fondo ámbar            │
│ DETALLES                        │
│ ...                             │
└─────────────────────────────────┘
```

La selección persiste mientras armas la orden. Si necesitas cambiarla, toca el botón de nuevo y se abre la ventana con tu selección actual para editarla.

### Paso 5 — Enviar la comanda con las etiquetas

Al finalizar la venta y llegar a la pantalla de éxito, toca la tarjeta de la impresora de cocina (o del dispositivo remoto). Como ya etiquetaste desde el carrito, la comanda se envía **directo sin volver a abrir la ventana de etiquetas**.

```
Cajero arma orden
    ↓
Toca "Pedido" → elige Loc 3 + Domicilio
    ↓
Cobra la orden (Procesar Pago)
    ↓
Pantalla de éxito → toca impresora
    ↓
Comanda se envía con etiquetas ✓
(sin ventana intermedia)
```

La comanda impresa en cocina muestra las etiquetas en el encabezado:

```
      *** COMANDA ***

LOCALIZADOR: 3       Orden: 1661
** Domicilio **      Hora: 07:26 p.m.
                     Cajero: María
================================
2x Hamburguesa Clásica
  >> Término Medio
  SIN Cebolla
--------------------------------
1x Papas Fritas
================================
          2 productos
```

### Paso 6 — Cuándo se limpia la selección

La etiqueta se limpia automáticamente en dos casos:

- Al tocar **Nueva Venta** (iniciar otro pedido).
- Al **vaciar el carrito** por completo.

No se limpia al cobrar, porque la pantalla de éxito todavía la necesita para enviar la comanda.

---

## Errores comunes

Estas son las situaciones más frecuentes al usar el botón Pedido y cómo resolverlas.

| Situación | Qué hacer |
|-----------|-----------|
| No veo el botón Pedido en el carrito | Verifica que el Modo Catálogo esté activo Y que el toggle "Botón Pedido en el carrito" esté activado en Ajustes. |
| El toggle del botón está gris y no se puede tocar | Primero activa el Modo Catálogo. El botón Pedido depende de él. |
| Elegí etiquetas pero no salen en la comanda | Asegúrate de tocar la tarjeta de impresora en la pantalla de éxito. Si no envías la comanda, las etiquetas no se imprimen. |
| Quiero cambiar la etiqueta después de guardar | Toca el botón Pedido de nuevo (ahora muestra el resumen). Se abre la ventana con tu selección actual para editarla. |
| Las etiquetas desaparecieron solas | Se limpian al iniciar nueva venta o vaciar el carrito. Si pasaste a otro pedido, es normal. |
| Solo quiero usar Localizador, no las otras pestañas | Toca el ícono de tuerca ⚙ en la ventana y oculta las pestañas que no necesites. |

---

## Preguntas frecuentes

Estas son las dudas más comunes sobre el botón Pedido, las etiquetas de la comanda y cómo personalizarlas.

### FAQ — ¿Puedo usar el botón Pedido sin tener impresora de cocina?

Sí, puedes elegir etiquetas aunque no tengas impresora conectada. Si tienes un dispositivo remoto de cocina (otro celular/tablet con Bistro conectado), la comanda se envía por internet. Si no tienes ningún destino, las etiquetas quedan guardadas pero no se envían a ningún lado.

### FAQ — ¿Las etiquetas del botón Pedido afectan el ticket del cliente?

No. Las etiquetas solo se imprimen en la **comanda de cocina**. El ticket de venta que le das al cliente no incluye localizador, mesa ni tipo de pedido.

### FAQ — ¿Puedo agregar mis propias opciones a las pestañas?

Sí. Dentro de la ventana, toca **Editar lista** en la pestaña que quieras modificar. Ahí puedes agregar nuevas opciones (hasta 20 caracteres cada una), renombrar las existentes o eliminar las que no uses.

### FAQ — ¿Puedo ocultar una pestaña que no uso?

Sí. Toca el ícono de **tuerca** (⚙) en la esquina superior derecha de la ventana. Se despliega un panel que dice **MOSTRAR PESTAÑAS** con un toggle para cada una:

```
┌─ MOSTRAR PESTAÑAS ────────────┐
│                               │
│  ◎ Localizador      [ ●━━ ]  │
│  ᐊ Mesas            [ ●━━ ]  │
│  ⊙ Tipo de pedido   [ ●━━ ]  │
│                               │
└───────────────────────────────┘
```

Desactiva el toggle de la pestaña que no necesites. La configuración aplica para todo el negocio (todos los cajeros la ven igual). Al menos una pestaña debe quedar visible — no puedes ocultar las tres.

### FAQ — ¿Las "Mesas" de la ventana son las mismas mesas del sistema POS?

No. Son cosas diferentes. Las "Mesas" de la ventana de Pedido son **etiquetas de texto** que se imprimen en la comanda como referencia para cocina. Las mesas del POS (el sistema de asignar órdenes por mesa) son otra funcionalidad con su propio flujo.

### FAQ — ¿Qué pasa si no elijo ninguna etiqueta antes de enviar la comanda?

Al tocar la tarjeta de impresora en la pantalla de éxito, se abre la ventana de etiquetas para que elijas en ese momento. Si tampoco eliges nada y solo tocas "Enviar comanda", la comanda se imprime sin etiquetas (solo con la info de orden, hora y cajero).

### FAQ — ¿Los cambios en las etiquetas se ven en los otros dispositivos?

Sí. Las etiquetas se guardan en la nube y se comparten entre todos los dispositivos del negocio. Si un cajero agrega una opción nueva (por ejemplo "Recoger en barra"), aparece para todos.

### FAQ — ¿Quién puede crear o eliminar etiquetas de la ventana?

Los roles **Administrador** y **Cajero** pueden crear, renombrar y eliminar etiquetas. Otros roles solo pueden usarlas al vender (seleccionarlas), pero no modificar la lista.
