# Cómo usar Bistro sin internet (Modo Offline)

> 👤 Guía para: Cajeros y Administradores
> 🧩 Módulo: Modo Offline (automático en toda la app)
> ⏱️ Tiempo estimado: 2 minutos de lectura

---

## ¿Para qué sirve?

Bistro puede seguir funcionando aunque pierdas la conexión a internet. Todas las ventas, gastos, compras y movimientos que registres sin conexión se guardan en el dispositivo y se envían automáticamente a la nube cuando vuelve el internet. Si quieres usar Bistro sin internet, saber qué pasa cuando se va la conexión, registrar ventas sin wifi o entender qué se sincroniza al reconectar, aquí está todo explicado.

---

## Antes de empezar

- La app detecta la pérdida de internet de forma automática — no tienes que hacer nada.
- Tu suscripción debe estar activa. Si venció mientras estabas sin internet, tienes un **periodo de gracia de 48 horas** antes de que el sistema bloquee el acceso.
- Funciona mejor si la app estaba abierta antes de perder la conexión. Si la abres por primera vez sin internet, el catálogo puede aparecer vacío — necesitas al menos una conexión inicial para que los datos se descarguen al dispositivo.
- Las operaciones pendientes se guardan en el almacenamiento del dispositivo (IndexedDB), **no en la memoria temporal**. Si cierras la app o el navegador, al reabrirlo tus ventas offline siguen ahí.

---

## ¿Cómo sé que estoy en modo offline?

La app muestra un indicador distinto según si estás en celular o en computador. En ambos casos, el indicador te dice el estado y cuántas operaciones hay pendientes de sincronizar.

---

### Indicador en celular o tablet

Aparece una barra ámbar fija en la parte superior de la pantalla. Muestra el número de operaciones pendientes, un enlace **¿Qué puedes hacer?** y un botón **Sincronizar**.

```
┌─────────────────────────────────┐
│ ⊘ Sin conexión · 3 pendientes  │
│ ¿Qué puedes hacer? [Sincronizar]│
└─────────────────────────────────┘
│                                 │
│   (resto de la app debajo)      │
│                                 │
```

- **"¿Qué puedes hacer?"**: abre una lista de las funciones que siguen disponibles sin internet.
- **"Sincronizar"**: fuerza el envío de las operaciones guardadas. Solo funciona cuando ya hay internet.

---

### Indicador en computador (punto de venta)

Aparece un chip pequeño en el encabezado de la pantalla de ventas.

```
┌──────────────────────────────────────┐
│  Punto de Venta │ ⊘ Sin conexión    │
│                 │ · 3 pend.          │
└──────────────────────────────────────┘
```

En desktop la sincronización es **automática** al reconectar — no hay botón de "Sincronizar". El enlace **¿Qué puedes hacer?** abre el mismo modal con la lista de funciones disponibles offline.

Cuando todo se sincroniza, el chip cambia a verde:

```
┌──────────────────────────────────────┐
│  Punto de Venta │ ☁ Sincronización  │
│                 │   exitosa (5)      │
└──────────────────────────────────────┘
```

> 💡 El chip verde desaparece a los 5 segundos. Si hubo errores, muestra el conteo en rojo junto al verde.

---

## Qué puedes hacer sin internet

Casi todo el flujo operativo de un día normal sigue funcionando. Lo que registres queda en cola y se sube automáticamente al volver el internet.

```
✅ DISPONIBLE OFFLINE
─────────────────────────────────
Ventas y clientes
  • Ventas en efectivo (Orden Rápida)
  • Ventas a crédito (fiadas)
  • Crear clientes nuevos
  • Registrar abonos de clientes

Gastos e inventario
  • Registrar gastos del negocio
  • Compras de inventario
  • Registrar mermas
  • Pagos a proveedores

Movimientos de caja
  • Abrir y cerrar turno
  • Entradas y salidas manuales
```

> ⚠️ Los montos de caja muestran la etiqueta **(Offline)** mientras estás sin conexión: es el saldo estimado en el dispositivo. El definitivo aparece al sincronizar.

---

## Qué NO puedes hacer sin internet

Algunas acciones necesitan llegar al servidor en el momento. Si intentas alguna sin internet, la app te avisa y bloquea la acción hasta que vuelva la conexión.

```
❌ REQUIERE CONEXIÓN
─────────────────────────────────
• Escanear facturas con IA
• Anular o eliminar ventas
• Ver Dashboard y reportes
• Crear o editar productos
• Editar empleados y configuración
• Usar el Asistente IA
• Imprimir recibos por email
```

> 💡 Si necesitas entregar un comprobante sin internet, la impresora térmica conectada al mismo equipo sí funciona: imprime un recibo de contingencia con el detalle de la venta.

---

## Mesas sin internet: ¿quién toma los pedidos?

Si tu negocio trabaja con **mesas** y se cae el internet, Bistro deja que **una sola persona** siga tomando pedidos y cobrando: el **cajero que tiene el turno de caja abierto** (llamado "Eje" internamente). Los demás equipos pasan a **solo lectura**. Así se evita que dos dispositivos cobren la misma mesa al mismo tiempo.

---

### Si tú eres el cajero con el turno abierto

Puedes seguir trabajando las mesas con normalidad:

```
✅ MESAS OFFLINE (cajero con turno)
─────────────────────────────────
• Abrir una mesa y ver su pedido
• Agregar y quitar productos
• Crear, renombrar y eliminar mesas
• Crear y editar salas
• Imprimir comanda (impresora local)
• Cobrar la mesa y cerrar la cuenta
```

> 💡 Para imprimir la comanda necesitas una impresora conectada directamente a ese equipo. Enviar a otra impresora por red sí requiere internet.

---

### Si NO tienes el turno abierto (mesero u otro equipo)

Verás las mesas tal como estaban, pero **no podrás modificarlas**. La app te muestra un aviso con el nombre de quién sí puede:

```
╭───────────────────────────────────╮
│ Sin internet: las mesas están en  │
│ solo lectura. Toma el pedido en   │
│ papel y pásaselo a Ana (cajero    │
│ del turno) para registrarlo.      │
╰───────────────────────────────────╯
```

Esto también ocurre si **tú tienes internet pero el cajero del turno se quedó sin conexión**: las mesas quedan en solo lectura hasta que ese cajero vuelva, para que nadie pise su trabajo.

```
╭───────────────────────────────────╮
│ Ana (cajero del turno) está sin   │
│ conexión: las mesas quedan en     │
│ solo lectura.                     │
╰───────────────────────────────────╯
```

> ⚠️ **¿Hay más de un cajero con turno abierto?** Sin internet no hay forma automática de repartir las mesas, así que deben coordinarse por su cuenta para no cobrar la misma mesa dos veces.

---

### El aviso de recarga al reconectarse

Cuando el cajero (Eje) recupera el internet y termina de sincronizar todo lo de las mesas, los demás equipos reciben un **aviso obligatorio para recargar la app**. Al recargar, todos ven el estado actualizado de las mesas.

```
Cajero recupera internet
         │
         ▼
Sincroniza mesas y pedidos
         │
         ▼
Los demás equipos ven:
"Recargar para ver los
 cambios más recientes"
         │
         ▼
  Recargan → mesas al día
```

> 💡 El cajero que hizo el trabajo NO ve este aviso, y lo que tengas en la **Orden Rápida** no se pierde al recargar.

---

## ¿Qué pasa cuando vuelve el internet?

La sincronización arranca sola al detectar conexión. Envía las operaciones en un orden inteligente que respeta dependencias.

```
Internet recuperado
      │
      ▼
 App detecta conexión
      │
      ▼
 Envía en este orden:
  1º Salas nuevas
  2º Mesas nuevas
  3º Cambios en salas/mesas
  4º Clientes nuevos
  5º Todo lo demás (ventas,
     gastos, abonos, etc.)
      │
      ├── ✅ Éxito → eliminada
      │         de la cola
      │
      └── ⚠️ Error → marcada
               como fallida,
               continúa con
               las demás
      │
      ▼
 Indicador → 🟢 verde
 Etiquetas (Offline) desaparecen
```

- Si algo falla, **no bloquea** la cola completa: se marca como error y sigue con las demás.
- Las operaciones que dependen de un dato no resuelto (como una mesa que aún no se creó en la nube) quedan pendientes para el siguiente intento en vez de marcarse como error.
- En móvil puedes tocar **Sincronizar** para forzar el envío inmediato.

---

## Mensajes que verás en la app

Esta tabla resume los avisos más comunes según el estado de la conexión y la sincronización.

| Aviso | Qué significa |
|-------|--------------|
| Barra ámbar **"Sin conexión"** | La app perdió internet. Puedes seguir trabajando. |
| Barra ámbar **"Sincronizando..."** | Volvió el internet y está enviando las operaciones guardadas. |
| Chip verde **"Sincronización exitosa (N)"** | Se sincronizaron N operaciones correctamente. Desaparece en 5 seg. |
| Chip rojo **"N errores de sync"** | N operaciones no pudieron sincronizarse. Toca **Descartar** o contacta soporte. |
| Etiqueta **(Offline)** en saldos | Saldo estimado local. El definitivo aparece al sincronizar. |
| Toast **"Venta guardada offline ☁️"** | Tu venta quedó guardada en el dispositivo. |
| Toast **"Merma encolada"** | La merma se sincronizará al recuperar internet. |
| Toast **"Sin conexión: la compra se guardó sin la foto..."** | Se guardó la compra/gasto sin la foto de la factura (necesita internet para subirla). |

---

## Errores comunes

Cuando el modo offline no se comporta como esperás, casi siempre es uno de estos casos: problemas con la detección de internet, saldos que no se actualizan o bloqueos por suscripción.

| Situación | Qué hacer |
|-----------|-----------|
| La barra "Sin conexión" aparece aunque el wifi esté encendido | Espera unos segundos. La app hace un ping real a los servidores (no solo verifica el wifi). Si persiste, el problema es el servicio de internet, no la app. |
| Los saldos siguen con "(Offline)" después de recuperar conexión | Espera que termine la sincronización — el chip verde confirma cuándo todo está listo. |
| La app bloqueó el acceso estando offline | La suscripción venció y ya pasaron las 48 horas de gracia. Paga con conexión para recuperar el acceso. |
| Una venta no aparece en el historial después de sincronizar | Revisa **Historial de Ventas**. Si quedó como "error de sync", puede que los datos de esa venta tengan un conflicto. Contacta soporte. |
| Items con errores de sincronización que no se resuelven | Toca **Descartar** en el chip rojo para limpiar los fallidos y registra la operación de nuevo. Si persiste, contacta soporte. |

---

## Preguntas frecuentes

Estas son las dudas más frecuentes cuando un negocio empieza a operar sin internet: si las ventas sobreviven al cerrar la app, qué pasa con clientes y abonos, cómo se manejan varios dispositivos y cómo funciona la suscripción sin conexión.

---

### FAQ — ¿Las ventas offline se guardan si cierro la app?

Sí. Las operaciones se guardan en el almacenamiento permanente del dispositivo (IndexedDB), no en la memoria temporal. Si cierras la app, apagas el equipo y lo vuelves a prender, las operaciones pendientes siguen ahí y se sincronizan cuando vuelve el internet.

---

### FAQ — ¿Puedo usar Bistro offline en varios dispositivos al mismo tiempo?

Sí. Cada dispositivo lleva su propia cola de operaciones y sincroniza de forma independiente cuando recupera internet.

```
Dispositivo 1        Dispositivo 2
  [cola propia]        [cola propia]
       │                    │
       └───── sincronizan ──┘
              por separado
              cuando cada uno
              recupera internet
```

> ⚠️ Con las **mesas** es distinto: sin internet solo el cajero con turno abierto puede operarlas. Para ventas de **Orden Rápida**, gastos y abonos, cada dispositivo opera independiente.

---

### FAQ — Sin internet, ¿por qué no puedo tomar un pedido de mesa desde mi equipo?

Porque el pedido de mesas sin conexión lo maneja **un solo equipo**: el del cajero con turno de caja abierto. Así se evita que dos personas editen o cobren la misma mesa y se dañe la cuenta. Si necesitas registrar un pedido, pásaselo al cajero del turno o espera a que vuelva el internet. La **Orden Rápida** sí la puedes usar sin internet desde cualquier equipo.

---

### FAQ — ¿Cuánto tiempo puedo trabajar sin internet?

No hay un límite de tiempo para el modo offline en sí. Lo que puede bloquear el acceso es que la suscripción venza: tienes un **periodo de gracia de 48 horas** después de la fecha de vencimiento. Si dentro de esas 48 horas recuperas internet y pagas, todo sigue normal. Si pasan las 48 horas sin pagar, la app se bloquea.

```
Suscripción vence
       │
       ├── 0-48h: gracia ✅
       │   (sigues usando la app)
       │
       └── +48h: bloqueado ❌
           (necesitas internet + pago)
```

---

### FAQ — ¿Cómo se sincronizan una venta a crédito y un abono hechos ambos offline?

Ambas operaciones se encolan y se sincronizan en orden de registro. La cola resuelve las dependencias automáticamente: primero crea el cliente si es nuevo, luego sube la venta (que crea la deuda) y luego el abono (que la reduce).

```
Offline:
  1. Venta fiada de $50.000   → cola
  2. Abono del cliente $20.000 → cola

Vuelve internet:
  1. Venta sube → deuda $50.000 creada
  2. Abono sube → deuda baja a $30.000
```

---

### FAQ — ¿Puedo crear un cliente nuevo sin internet para venderle fiado?

Sí. Crea el cliente desde **Cuentas por Cobrar** → **Nuevo Cliente**. Aparece de inmediato en la lista para venderle a crédito. Al volver internet, el sistema crea el cliente en la nube primero (por el orden de dependencias) y luego asocia automáticamente las ventas y abonos que hayas registrado offline.

---

### FAQ — ¿Los abonos de clientes hechos offline quedan registrados en caja?

Sí. El abono offline hace dos cosas a la vez: descuenta el monto de la deuda del cliente y genera una entrada de caja en el turno activo. Al sincronizar, ambas operaciones suben en orden y el arqueo de caja cuadra solo.

```
Abono offline
     │
     ├──► Descuenta la deuda   ✅
     │
     └──► Entrada de caja      ✅
              │
              ▼
     Al volver internet:
     ambas suben automático
     y el arqueo cuadra solo
```

---

### FAQ — ¿Cómo veo cuántas operaciones están pendientes de sincronizar?

El número aparece en la misma barra o chip de **Sin conexión** (por ejemplo "· 3 pendientes"). En celular también aparece sobre el botón **Sincronizar**. El enlace **¿Qué puedes hacer?** abre un modal con la lista de funciones disponibles sin conexión, no un conteo por tipo.

---

### FAQ — ¿Puedo escanear una factura con IA sin internet?

No. El escaneo con IA necesita subir la imagen a los servidores. Sin internet, la opción **Escanear factura** aparece en gris y deshabilitada. Puedes registrar el gasto o la compra de inventario a mano, que sí funcionan offline, pero sin la foto como evidencia.

---

## Recursos multimedia *(opcional)*

| Tipo | Nombre sugerido | Qué mostraría |
|------|----------------|---------------|
| Imagen | "Bistro — Barra offline — celular con pendientes y botón Sincronizar" | La barra ámbar en la parte superior con el conteo y el botón |
| Imagen | "Bistro — Chip offline — computador punto de venta" | El chip con el estado en el encabezado del POS desktop |
| GIF | "Bistro — Sincronización automática — barra ámbar a chip verde" | El cambio de estado al recuperar internet y terminar la sincronización |
| Imagen | "Bistro — Modal qué puedes hacer offline — lista de funciones" | El modal que abre el enlace "¿Qué puedes hacer?" |
