# Cómo organizar las etiquetas en carpetas en Bistro

> Guía para: Administradores (para configurar) y Cajeros (para usar al vender)
> Módulo: Punto de Venta → Modificador del producto
> Tiempo estimado: 5 minutos

---

## ¿Para qué sirve?

Cuando un producto tiene muchas opciones (por ejemplo muchos sabores de helado), verlas todas sueltas se vuelve desordenado. Las carpetas te dejan agrupar esas opciones (que se llaman etiquetas) por temas, para que al vender abras solo la carpeta que necesitas y elijas rápido.

Las etiquetas que marcas al vender se imprimen en la **comanda de cocina** (el ticket que va a la cocina), debajo de cada producto, para que el personal sepa cómo prepararlo (por ejemplo `>> VAINILLA` o `>> Sin cebolla`).

---

## Antes de empezar

- El producto debe tener una **categoría** asignada. Las etiquetas se comparten entre todos los productos de la misma categoría, así que lo que configures aquí aplica a toda esa categoría.
- No necesitas activar nada más: la personalización está siempre disponible.
- Pueden configurar carpetas y etiquetas los usuarios con rol **Administrador** o **Cajero**. Otros roles solo pueden usarlas al vender, no crearlas.
- Para que estas etiquetas se **impriman en la comanda de cocina**, el negocio debe estar en **modo Catálogo**. En modo Escáner no existe la comanda, así que las etiquetas no se imprimen.
- El **modo Catálogo** se activa desde el menú lateral → **Ajustes** → **Activar/Desactivar** → tarjeta **Modo Catálogo**. Solo el **dueño** del negocio puede cambiarlo; los demás lo ven en modo lectura.

```
Menú lateral → Ajustes → Activar/Desactivar

┌─ Activar / Desactivar ───────────┐
│  ▦ Modo Catálogo          [ ✓ ]  │ ← actívalo
│    Tarjetas visuales de venta    │
└──────────────────────────────────┘
```

---

## Paso a paso

Aquí verás cómo crear carpetas, mover etiquetas sueltas a una carpeta, elegirlas al vender y dónde aparecen impresas en la comanda. Cada bloque es independiente: salta al que necesites.

### Abre la configuración de etiquetas (pestaña Ajustes)

La configuración de carpetas y etiquetas vive **dentro del Modificador** de un producto. Para llegar ahí, con el negocio en **modo Catálogo**:

1. En **Punto de Venta**, agrega **temporalmente** al carrito cualquier producto de la categoría que quieres organizar (toca el **+** de su tarjeta).
2. En la fila de ese producto (panel derecho), toca el botón **Modificador**.
3. En la ventana que se abre, entra a la pestaña **Ajustes**. Ahí verás las tres sub-pestañas: **Etiquetas**, **Carpetas** y **Productos** (esta última es para add-ons con precio y queda fuera de esta guía).

```
DETALLES
┌──────────────────────────────────┐
│ � Ensalada              $8.000  │
│ [−] 1 [+]  [ MODIFICADOR ]  🏷 🗑 │
└──────────────────────────────────┘
                 ↑ toca aquí
     se abre la ventana → pestaña Ajustes
```

> 💡 El producto se agrega solo para llegar a la configuración. Al terminar puedes quitarlo del carrito con el 🗑 — las etiquetas quedan guardadas en la categoría.

### Crear una carpeta y agregarle etiquetas

1. Abre la configuración (paso anterior: producto al carrito → **Modificador** → pestaña **Ajustes**).
2. En la sub-pestaña **Carpetas**, escribe el nombre en el campo "Nueva carpeta..." y toca el botón verde **Crear** que está al lado.
3. **Abre la carpeta** tocando su botón; se despliega una lista **a un costado** (en el computador) o como una **hoja desde abajo** (en el celular).
4. **Agrega las etiquetas**: escribe en "Agregar etiqueta..." y toca el botón "+". Repite por cada opción. Ese campo queda fijo abajo para que sigas agregando sin que se pierda.
5. **Toca "Guardar Configuración"**. La ventana del producto no se cierra, así puedes seguir organizando.

> **Consejo:** una carpeta vacía no aparece al vender. Agrégale al menos una etiqueta para que se vea.

### Mover una etiqueta suelta a una carpeta

1. En la pestaña **Ajustes** → sub-pestaña **Etiquetas**, ubica la etiqueta suelta (las que no están dentro de una carpeta).
2. Toca el botón **de carpeta** (ícono 📁 con el aviso "Mover a una carpeta") que aparece en esa etiqueta.
3. Elige una carpeta que ya exista, o escribe el nombre de una nueva en "Nueva carpeta..." y toca **"OK"**. La etiqueta se mueve a esa carpeta.

### Elegir etiquetas al vender

1. Agrega el producto a la orden y abre su **Modificador** (pestaña **Modificar**).
2. Toca el botón de la carpeta (por ejemplo HELADOS). Se abre la lista de etiquetas.
3. **Marca las etiquetas** que apliquen. El botón de la carpeta muestra un número con cuántas llevas elegidas.
4. Toca **"Agregar a la Orden"**.

### Dónde salen las etiquetas: la comanda de cocina

Las etiquetas que marcaste viajan a la **comanda de cocina** al imprimir o enviar la comanda después de finalizar la venta. Salen debajo del producto, con el prefijo `>>`:

```
        *** COMANDA ***
================================
2x Helado
  >> VAINILLA
  >> FRESA
--------------------------------
1x Hamburguesa
  >> Sin cebolla
================================
```

> ⚠️ La comanda de cocina **solo se imprime o se envía en modo Catálogo**. Si el negocio está en modo Escáner, no aparece la opción de comanda (revisa **Antes de empezar** para activar el modo Catálogo).

---

## Errores comunes

Estas son las situaciones más frecuentes al organizar y usar las etiquetas, con la acción concreta para resolverlas.

| Situación | Qué hacer |
|-----------|-----------|
| Creé una carpeta y no aparece al vender | La carpeta está vacía. Entra a Ajustes y agrégale al menos una etiqueta. |
| No veo la opción de imprimir/enviar la comanda | El negocio está en modo Escáner. Actívalo en **Ajustes → Activar/Desactivar → Modo Catálogo** (solo el dueño). |
| Elegí etiquetas pero no salen en la comanda | Verifica que estás en modo Catálogo y que marcaste las etiquetas **antes** de tocar **Agregar a la Orden**. |
| Agregué etiquetas en otro dispositivo y no las veo | Espera unos segundos; se sincronizan solas. Si no aparecen, cierra y vuelve a abrir el producto. |
| Dice que el producto no tiene categoría | Asígnale una categoría al producto; sin categoría no se pueden usar etiquetas. |
| El botón "Guardar Configuración" está apagado | Es porque no hay cambios por guardar. Haz un cambio (agregar, mover o eliminar) y se activa. |
| Quiero quitar una etiqueta de una carpeta | En Ajustes abre la carpeta y toca el 🗑 de esa etiqueta. Ten en cuenta que la etiqueta se quita de la carpeta para **toda la categoría**, no solo para ese producto. |

---

## Preguntas frecuentes

Estas son las dudas más comunes sobre las carpetas, las etiquetas y cómo se imprimen en la comanda de cocina.

### FAQ — ¿Las carpetas y etiquetas valen para un solo producto o para varios?

Valen para toda la categoría del producto. Si configuras las etiquetas desde un producto de "Abarrotes", todos los productos de "Abarrotes" comparten esas mismas etiquetas y carpetas.

### FAQ — ¿Puedo tener etiquetas sueltas y carpetas al mismo tiempo?

Sí. Las sueltas aparecen como botones y las carpetas como un botón que se abre al tocarlo. Puedes ir moviendo las sueltas a carpetas hasta dejar todo ordenado.

### FAQ — ¿Por qué una carpeta vacía no aparece cuando voy a vender?

Porque no tendría nada para elegir. Apenas le agregas una etiqueta, la carpeta aparece en la pestaña Modificar.

### FAQ — ¿Tengo que activar la personalización en cada producto?

No. La personalización está siempre activa; solo agrega las etiquetas y listo.

### FAQ — ¿Dónde se imprimen las etiquetas que elijo?

En la **comanda de cocina**. Al finalizar la venta e imprimir o enviar la comanda, cada etiqueta que marcaste sale debajo del producto con el prefijo `>>`, para que la cocina sepa cómo prepararlo.

```
2x Helado
  >> VAINILLA     ← etiqueta elegida
  >> FRESA        ← etiqueta elegida
```

### FAQ — ¿Necesito el modo Catálogo para que las etiquetas salgan en la comanda?

Sí. La comanda de cocina solo existe en **modo Catálogo**.

```
¿El negocio está en modo Catálogo?
  Sí → aparece la opción de comanda
        y las etiquetas se imprimen ✓
  No (modo Escáner) → no hay comanda,
        las etiquetas no se imprimen ✗
```

Actívalo en **Ajustes → Activar/Desactivar → Modo Catálogo** (solo el dueño).

### FAQ — ¿Si cambio las etiquetas se actualizan en las otras cajas o dispositivos?

Sí. Los cambios se sincronizan solos entre los dispositivos del mismo negocio. Si alguno quedó con datos viejos, cerrar y volver a abrir el producto lo actualiza.

### FAQ — ¿Puedo elegir varias etiquetas de la misma carpeta?

Sí. Puedes marcar varias a la vez; el botón de la carpeta muestra un número con la cantidad que elegiste.

### FAQ — ¿El Cajero puede crear carpetas y etiquetas o solo el Administrador?

También el **Cajero**. Tanto Administrador como Cajero pueden crear, mover y eliminar carpetas y etiquetas desde el tab "Ajustes". Si con otro rol el botón "Guardar Configuración" no surte efecto o sale un aviso de permiso, es porque ese rol no tiene permitido configurar modificadores.
