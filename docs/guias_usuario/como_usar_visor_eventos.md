# Cómo usar el visor de eventos en Bistro

> Guía para: Administradores / Dueños del negocio
> Módulo: **Actividad** (visor de eventos)
> Tiempo estimado: 5 minutos

---

## ¿Para qué sirve?

El **visor de eventos** es el registro de lo que pasa en tu negocio. Muestra quién hizo qué y cuándo: quién anuló una venta, quién abrió la caja, quién cambió el precio de un producto, quién registró un gasto, quién archivó a un empleado.

Si quieres auditar acciones de tus empleados, saber quién anuló una venta, ver un historial de cambios, revisar qué pasó en tu tienda, controlar movimientos de tus cajeros, hacer seguimiento de la actividad del negocio o investigar un movimiento sospechoso, este es el lugar. Es el complemento del **Reporte de Empleado**: el reporte te da la vista agregada por persona; el visor te da la línea temporal detallada con contexto.

---

## Antes de empezar

- Debes tener el permiso **Gestionar Empleados** o **Configuración**, o rol de **Administrador**. Los cajeros no ven esta pantalla.
- Necesitas conexión a internet — el visor lee los eventos desde el sistema en el momento.
- Los eventos se guardan por **90 días**. Fechas más viejas pueden estar vacías.
- Los eventos del negocio son **de solo lectura**: no puedes borrarlos ni editarlos, ni siquiera siendo dueño. Es la garantía de la auditoría.

---

## Paso a paso

Usar el visor de eventos tiene 8 pasos en orden: abrir el módulo desde el menú lateral, elegir el rango de fechas, filtrar por empleado o categoría, buscar por palabra clave, leer una fila típica, abrir el detalle de un evento, usar los botones de vínculo cruzado para saltar a la venta o el turno relacionado, y revisar quién está conectado ahora mismo.

---

### Paso 1 — Abre el visor de eventos

En la pantalla de Inicio, baja hasta la sección **Gestión** y toca **Actividad**. Se abre la pantalla con el visor de eventos.

`[ 🕘 Inicio → Gestión ]` → `[ Actividad ]`

Encabezado que verás arriba:

```
┌────────────────────────────────────────────┐
│ Visor de eventos  ⓘ  🔄       👤👤👤 +2   │
│ título          info refr.    conectados   │
└────────────────────────────────────────────┘
```

> 💡 **Consejo:** Toca **ⓘ** para leer una explicación rápida de qué registra el visor y qué significan las etiquetas de colores.

---

### Paso 2 — Elige el rango de fechas

Por defecto el visor muestra los **Últimos 7 días**. Usa el botón de calendario para cambiar el período.

```
📅 [ Últimos 7 días ▾ ]
```

Al desplegarlo aparecen las opciones:

```
┌─ Período ────────────────┐
│  ✓ Últimos 7 días        │
│    Hoy                   │
│    Ayer                  │
│    Últimos 30 días       │
│    ─────────────         │
│    Personalizado         │
└──────────────────────────┘
```

Con **Personalizado** eliges fecha de inicio y fin con calendario visual:

```
┌─ Elige el rango ─────────────────┐
│  Mayo 2025               ‹  ›   │
│  Lu Ma Mi Ju Vi Sa Do            │
│         1  2  3  4  5            │
│   6  7  8  9 10 11 12            │
│  13 14 15 [16 17 18 19]          │
│  20 21 [22] 23 24 25 26          │
│                                  │
│  [ Cancelar ]  [ Aplicar ]      │
└──────────────────────────────────┘
```

> ⚠️ **Aviso:** Si el rango es mayor a 90 días, verás el aviso "La consulta puede tardar más". Eventos anteriores a esa ventana pueden estar borrados por retención.

---

### Paso 3 — Filtra por empleado, categoría o severidad

Debajo del buscador hay tres selectores. Cada uno reduce la lista a un subconjunto.

```
[ 📅 7 días ▾ ] [ Todos empleados ▾ ]
[ Todas categorías ▾ ] [ Toda severidad ▾ ]
                        42 eventos
```

Qué filtra cada selector:

| Filtro | Qué hace |
|--------|----------|
| **Empleado** | Muestra solo los eventos que hizo esa persona. Incluye empleados archivados. |
| **Categoría** | Agrupa por área: Ventas, Caja, Inventario, Gastos, Productos, Promociones, Usuarios, Permisos, Autenticación, Negocio. |
| **Severidad** | **Info** (normal), **Atención** (revisar), **Crítico** (alto impacto). |

> 💡 **Consejo:** Si buscas movimientos sospechosos, empieza con **Severidad: Crítico** — filtra solo cambios de permisos, eliminaciones de productos y archivado de usuarios.

---

### Paso 4 — Busca por palabra clave

La barra de búsqueda arriba filtra por texto: nombre del empleado, descripción o tipo de acción.

```
🔍 [ Buscar por descripción, acción o    ]
    empleado...
```

Ejemplos de búsquedas útiles:

```
"anulada"       →  todas las ventas anuladas
"María"         →  todo lo que hizo María
"precio"        →  cambios de precio de productos
"caja"          →  aperturas y cierres de caja
```

La búsqueda funciona junto con los otros filtros — se combinan. Si eliges **Categoría: Ventas** + escribes "anulada", ves solo anulaciones de venta.

---

### Paso 5 — Lee una fila del visor

Cada fila resume un evento con ícono de categoría, descripción, actor, hora y severidad.

```
┌──────────────────────────────────────────┐
│ 🛒  Venta #123 anulada        [Atención] │
│  • Ventas · Alejandro · 14:32       >    │
└──────────────────────────────────────────┘
```

Qué significa cada parte:

| Elemento | Significado |
|----------|-------------|
| Ícono izquierdo | Categoría (🛒 ventas, 💵 caja, 📦 inventario, 🧾 gasto...) |
| Descripción | Frase que resume qué pasó |
| Etiqueta de color | Severidad: gris (info), ámbar (atención), rojo (crítico) |
| Nombre | Empleado que hizo la acción |
| Hora o fecha | Momento del evento en tu zona horaria |
| Flecha `>` | Indica que puedes tocar para ver el detalle |

Si aparece la etiqueta **Cuenta eliminada** junto al nombre, es un empleado archivado. Su historial se conserva aunque ya no trabaje contigo.

---

### Paso 6 — Abre el detalle de un evento

Toca cualquier fila para ver toda la información del evento en un modal.

```
┌─ Detalle del evento ────────────────────┐
│  Anulación de venta          [Atención] │
│  Alejandro (Cajero)                     │
│  23/05/2025  14:32                      │
│                                         │
│  Descripción                            │
│  Venta #123 anulada por $45.000         │
│                                         │
│  Monto:        $45.000                  │
│  Motivo:       Error de cobro           │
│  Dispositivo:  Chrome en Windows        │
│                                         │
│  [ Ver venta ]  [ Filtrar empleado ]    │
└─────────────────────────────────────────┘
```

Los montos aparecen con formato colombiano (`$45.000`, punto de miles, sin decimales). Los métodos de pago vienen traducidos: `cash → Efectivo`, `nequi → Nequi`, `transfer → Transferencia`, etc.

> 💡 **Consejo:** Las filas de **Apertura de caja** no abren detalle porque la descripción ya trae toda la información. El resto sí.

---

### Paso 7 — Salta al reporte, la venta o el turno relacionado

Dentro del detalle hay botones para navegar directo al elemento relacionado sin perder el contexto.

```
¿Qué tipo de evento estás mirando?
        │
        ├── Venta anulada / ítem anulado / devolución
        │        → [ Ver venta ]
        │          Abre la venta en Historial
        │
        ├── Cierre de caja
        │        → [ Ver turno ]
        │          Abre el turno en Caja
        │
        ├── Producto creado / eliminado / precio
        │        → [ Ver producto ]
        │          Muestra el estado actual
        │
        ├── Ajuste de inventario
        │        → [ Ver productos ]
        │          Muestra el desglose del conteo
        │
        ├── Registro de gasto / eliminación de gasto
        │        → [ Detalles ]
        │          Muestra la observación
        │
        └── Cualquier evento con actor
                 → [ Filtrar empleado ]
                   Filtra la lista por esa persona
```

---

### Paso 8 — Revisa quién está conectado ahora

En el encabezado, a la derecha, aparecen los avatares de los empleados **conectados en este momento**. Toca el stack para ver el detalle.

```
┌──────────────────────────────────┐
│  Empleados conectados            │
│                                  │
│  🟢 Ana López      Cajera        │
│     Chrome en Windows            │
│     Desde 08:15  ·  Caja abierta │
│                                  │
│  🟡 Carlos Ruiz    Cajero        │
│     Chrome en Android            │
│     Desde 09:02  ·  Inactivo     │
│                                  │
└──────────────────────────────────┘
```

Qué significa cada color:

```
🟢 Activo       →  usó la app hace ≤ 3 minutos
🟡 Inactivo     →  tiene sesión pero no responde
                    (perdió internet, se distrajo,
                     dispositivo dormido)
```

> ⚠️ **Aviso:** Solo aparecen los empleados con sesión iniciada (activos e inactivos). Los que cerraron sesión no se listan aquí — "Inactivo" no es lo mismo que "Desconectado".

---

## Errores comunes

Cuando algo no cuadra en el visor de eventos, casi siempre es uno de estos casos. Esta tabla cubre los reportes más frecuentes: eventos que no aparecen aunque sabes que ocurrieron, la etiqueta "Sistema" en lugar del nombre, la lista vacía, filas sin flecha para abrir detalle, y por qué "Inactivo" no significa que el empleado se fue.

| Situación | Qué hacer |
|-----------|-----------|
| No veo un evento que sé que pasó | Revisa el rango de fechas y los filtros. Si pasó hace más de 90 días, es normal — la retención lo borró. |
| El actor aparece como "Sistema" | Es una acción hecha desde el servidor (crear/archivar empleado antiguo). No hay nombre porque no había sesión de usuario. |
| La lista está vacía en un rango largo | El rango supera los 90 días de retención. Elige un rango más corto o revisa que estés en el negocio correcto. |
| Una fila no abre detalle al tocarla | Es una **Apertura de caja** — su descripción ya tiene toda la info y no hay más que mostrar. |
| Un empleado aparece "Inactivo" | Tiene sesión iniciada pero no está usando la app activamente (sin internet, distraído, dispositivo dormido). Si no aparece en la lista, es que cerró sesión. |
| Cambio de filtro y perdí donde estaba | Es normal: al cambiar cualquier filtro la lista vuelve a la primera página. Vuelve a bajar con **Cargar más**. |

---

## Preguntas frecuentes

Estas son las dudas más frecuentes sobre el visor de eventos: qué se registra y qué no, por cuánto tiempo, qué pasa con las acciones hechas sin internet, si se puede borrar un evento, por qué aparecen empleados archivados en los filtros y qué pasa con los intentos de login fallidos.

---

### FAQ — ¿Se registra todo lo que pasa en el negocio?

No, solo las acciones **sensibles**. Las ventas normales completadas **no** se registran (saturarían la lista). Sí se registran las excepciones: anulaciones, devoluciones, aperturas y cierres de caja, mermas, gastos, cambios de precio, creación y baja de productos, promociones, cambios de empleados, permisos y datos del negocio.

```
Se registra                    NO se registra
──────────────────────────────────────────────
✅ Anular una venta           ❌ Vender normal
✅ Cambiar un precio          ❌ Ver una pantalla
✅ Abrir/cerrar caja          ❌ Buscar un producto
✅ Registrar merma            ❌ Escanear código
✅ Archivar empleado          ❌ Cambiar de mesa
✅ Cambiar permisos
```

---

### FAQ — ¿Por cuánto tiempo se guardan los eventos?

Los eventos se conservan **90 días** para consulta rápida. Si necesitas ir más atrás, hoy no está disponible desde el visor. Fechas más viejas pueden estar borradas por retención automática.

---

### FAQ — ¿Los cambios que hice sin internet aparecen en el visor?

Sí, y esta es una de las mejores cosas del sistema. Cuando trabajas sin internet, las ventas, aperturas de caja, mermas y gastos quedan en cola en tu dispositivo. Al reconectar, se sincronizan con el sistema y **automáticamente** se generan los eventos correspondientes en el visor.

```
Sin internet                Al reconectar
─────────────────────────────────────────
Anular venta #45     ─►    Evento aparece
Abrir caja           ─►    con hora exacta
Registrar merma      ─►    de la acción
Registrar gasto      ─►    original
```

> **Nota:** las devoluciones sí requieren internet — no funcionan offline y por eso tampoco generan evento sin conexión.

---

### FAQ — ¿Puedo borrar un evento del visor?

No. Los eventos son **inmutables**: ni siquiera el dueño puede borrar o modificar un evento existente. Esta es la garantía de que el registro sirve como auditoría — si se pudiera borrar, no serviría de nada. Si un evento parece incorrecto, contacta al soporte técnico.

---

### FAQ — ¿Por qué aparecen empleados archivados en el filtro?

Porque su historial se conserva aunque ya no trabajen contigo. Si María fue tu cajera hace 2 meses y luego la archivaste, sus movimientos siguen en el visor con la etiqueta **Cuenta eliminada** o **Cuenta archivada** al lado del nombre. Así puedes auditar lo que hizo mientras trabajaba.

```
Empleado archivado
        │
        ├──► Ya no puede entrar a la app  ✅
        │
        ├──► No aparece en presencia      ✅
        │
        └──► Su historial se conserva     ✅
             en el visor con etiqueta
             "Cuenta eliminada"
```

---

### FAQ — ¿Se registran los intentos de login fallidos?

Sí. El visor registra tanto los inicios de sesión exitosos (**Inicio de sesión**) como los intentos de acceso fallidos (**Intento de acceso fallido**) y los cambios de PIN (**Cambio de PIN**). Aparecen en la categoría **Autenticación**.

---

### FAQ — ¿Por qué un empleado aparece "Inactivo" en vez de "Desconectado"?

Porque **conservó la sesión iniciada** pero el sistema no detecta actividad reciente (más de 3 minutos sin interactuar). Puede estar en estas situaciones:

```
🟡 Empleado Inactivo
        │
        ├── Perdió internet (sesión sigue viva)
        ├── Cerró la pestaña sin cerrar sesión
        ├── Dejó el dispositivo abierto y se fue
        ├── App quedó en segundo plano en celular
        └── Dispositivo se durmió automáticamente
```

Los empleados que cerraron sesión explícitamente **no aparecen** en la lista de conectados. Si no ves a alguien en la lista, es porque cerró sesión o nunca la inició.

---

## Recursos multimedia *(opcional)*

> Esta sección es una sugerencia para enriquecer el Asistente IA.
> La guía funciona sin ella — solo agregar si hay media disponible o planeada.

| Tipo | Nombre sugerido en la app | Qué mostraría |
|------|--------------------------|---------------|
| GIF | "Bistro — Visor de eventos — filtrar por empleado y categoría" | Aplicar filtros combinados y ver cómo cambia la lista |
| GIF | "Bistro — Visor de eventos — abrir detalle y saltar a la venta" | Tocar una fila, abrir el detalle, presionar "Ver venta" |
| Imagen | "Bistro — Visor de eventos — stack de empleados conectados" | Vista del popover de presencia con los tres estados de color |
