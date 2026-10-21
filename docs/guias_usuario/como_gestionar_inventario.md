# Cómo llevar el control de inventario y configurar alertas de stock en Bistro

> 👤 **Guía para:** Todos los empleados
> 🧩 **Módulos:** **Inventario** · **Productos**
> ⏱️ **Tiempo estimado:** 5–30 minutos según el tamaño del negocio

---

## ¿Para qué sirve?

Esta guía cubre dos herramientas que trabajan juntas para mantener el inventario bajo control:

1. **Conteo de inventario** — Compara lo que el sistema registra contra lo que tienes físicamente en el estante, y ajusta las diferencias.
2. **Salud de stock y alertas** — Muestra automáticamente cuántos días te dura el stock de cada producto según sus ventas recientes, y te avisa cuándo es momento de hacer un pedido.

Usarlas juntas te ayuda a **evitar quedarte sin productos**, **no tener capital inmovilizado en mercancía que nadie compra**, **cuadrar el inventario físico con el sistema**, **revisar mermas y sobrantes**, **configurar alertas de reorden por proveedor**, **ver qué productos están críticos, lentos o estancados**, y **saber cuántos días de stock te quedan por producto**.

Si escuchas hablar de **"hacer el conteo"**, **"ajuste de inventario"**, **"cuadrar el stock"**, **"alerta de reabastecimiento"**, **"diagnóstico de inventario"** o **"salud del inventario"** — todo eso se hace desde estos dos módulos.

---

## Antes de empezar

- Para el conteo físico: ten los productos contados en el estante antes de abrir Bistro — cuenta primero, registra después.
- Los servicios y promociones no aparecen en el módulo de Inventario. Solo los productos físicos con stock activado están disponibles para contar.
- Para configurar los umbrales de alerta necesitas primero **seleccionar un proveedor específico** — el botón **⚙️ Rotación** solo se activa cuando hay un proveedor seleccionado (no en "Todas").
- Si encuentras diferencias negativas en el conteo y necesitas revertirlas, hazlo **antes** de registrar nuevas ventas o compras de ese producto.

---

## Parte 1 — Hacer el conteo de inventario

El conteo de inventario sirve para comparar lo que el sistema cree que tienes con lo que realmente hay en el estante. El flujo tiene siete pasos: abrir el módulo, filtrar el listado si quieres trabajar por sección, ingresar la cantidad física (en computador o celular), revisar el ajuste calculado, guardar los cambios y revertir si guardaste algo por error.

---

### Paso 1 — Abrir el módulo Inventario

`[ 📦 Gestión ]` → `[ Inventario ]`

**En celular** — en la pantalla de Inicio, baja hasta la sección **Gestión** y toca **Inventario**:

```
┌─ GESTIÓN ────────────────────┐
│  📦 Inventario  ◄──          │
│  👤 Empleados                │
│  🕘 Actividad                │
│  ⚙️ Configuración            │
└──────────────────────────────┘
```

**En computador** — sidebar izquierdo, sección **Gestión**:

```
│ GESTIÓN                      │
│   🛍️ Productos               │
│   📦 Inventario          ◄── │
│   📊 Estadísticas            │
```

La pantalla abre por defecto en **Productos**. Arriba hay una fila de botones:

```
[ Productos (24) ]  ← activa
[ Ingredientes (6) ]  (si hay insumos)
[ 🕘 Historial ]  (abre panel lateral)
```

- **Productos** — todos los productos con stock (el número entre paréntesis es cuántos hay).
- **Ingredientes** — solo aparece si tu negocio maneja insumos o recetas.
- **Historial** — no es una pestaña: es un botón que abre un panel lateral con los ajustes negativos que puedes revertir (ver Paso 7).

---

### Paso 2 — Filtrar el listado para contar por partes (opcional)

Si tu catálogo es grande, no tienes que contar todo de una vez. Usa los filtros de la cabecera para reducir el listado.

```
🔍 [ Buscar producto...           ]
[ Categoría ▾ ]  ☑ Ver solo difer.
```

- **Buscar producto** filtra por nombre.
- **Categoría** te permite contar sección por sección (Lácteos, Bebidas, etc.).
- **Ver solo diferencias** oculta los productos que ya coinciden con el conteo físico.

> 💡 **Consejo:** Para inventarios grandes, filtra por categoría, guarda el conteo de esa sección y pasa a la siguiente. Los ajustes se guardan de forma independiente.

---

### Paso 3 — Ingresar el conteo físico en computador

Escribe directamente en el campo numérico de la fila del producto. Si el valor coincide con lo que dice el sistema, la fila queda neutra. Si hay diferencia, se marca con fondo ámbar y muestra el delta.

```
Fila sin diferencia:
┌────────────────────────────────────┐
│ Leche Alquería 1L                  │
│ Sistema: 14      [ 14           ]  │
└────────────────────────────────────┘

Fila con diferencia (fondo ámbar):
┌────────────────────────────────────┐
│ Leche Alquería 1L         · · ámbar│
│ Sistema: 14      [ 12    ]  −2 🔴  │
└────────────────────────────────────┘
```

---

### Paso 4 — Ingresar el conteo físico en celular (calculadora)

Toca el campo del producto. Se abre una calculadora que acepta operaciones matemáticas. Escribe la cantidad (o la operación) y confirma con `[ ✓ ]`.

```
┌─ Cantidad ─────────────────────┐
│                                │
│        3*12+6  =  42           │
│  ─────────────────────────     │
│   7    8    9       ← DEL      │
│   4    5    6         ×        │
│   1    2    3         −        │
│   .    0    =         +        │
│                                │
│         [ ✓ Confirmar ]        │
└────────────────────────────────┘
```

> 💡 **Truco:** Si tienes 3 cajas de 12 unidades y 6 sueltas, escribe `3*12+6` → toca `=` → resultado: `42`. No tienes que sacar la cuenta a mano.

---

### Paso 5 — Revisar el ajuste calculado por producto y en el encabezado

Junto a cada producto verás el delta calculado:

- **Verde (+):** encontraste más unidades de las que dice el sistema.
- **Rojo (−) Merma:** tienes menos — la diferencia se registrará como merma.

El encabezado muestra el resumen total de cambios pendientes con el costo afectado:

```
┌─ Conteo de inventario ─────────────┐
│  3 cambios pendientes              │
│  −12 Und · valor costo: −$38.400   │
│                                    │
│               [ Guardar (3) ] ámbar│
└────────────────────────────────────┘
```

Efecto en el stock al guardar una diferencia negativa:

```
ANTES del conteo:
   Sistema: 14 und

DESPUÉS (físico: 12 und):
   Stock: 12 und  ← bajó 2
   Merma: −2 und  ← registrada
```

---

### Paso 6 — Guardar todos los ajustes pendientes

Los ajustes se guardan **todos juntos** desde el botón `[ Guardar (N) ]` del encabezado, donde `N` es el número de cambios pendientes. No existe guardado fila por fila — el botón del encabezado es el único que aplica los cambios al sistema.

```
┌─ Conteo de inventario ─────────────┐
│  3 cambios pendientes              │
│  −12 Und · valor costo: −$38.400   │
│                                    │
│               [ Guardar (3) ] ámbar│ ◄── único botón
└────────────────────────────────────┘
```

> 💡 **Consejo:** Si solo quieres ajustar un producto, ingresa el conteo de esa fila y toca igual `[ Guardar (1) ]` en el encabezado. El botón se adapta al número real de cambios pendientes.

Si guardaste una diferencia negativa, aparece un aviso ámbar indicando que puedes revertirla desde **Historial** (ver Paso 7), siempre que no hayas registrado ventas ni compras posteriores del mismo producto.

---

### Paso 7 — Revertir o editar un ajuste desde Historial

Si guardaste una diferencia por error, toca el botón **Historial** dentro de **Inventario** — abre un panel lateral con los ajustes revertibles. Solo se puede corregir mientras no haya ventas ni compras posteriores del producto.

```
[ Productos (24) ]  [ 🕘 Historial ] ◄── toca
                            ↓
        ┌─ Panel lateral ──────────┐
        │  HISTORIAL DE AJUSTES    │
        │  (ajustes revertibles)   │
        └──────────────────────────┘
```

Cada fila del historial tiene dos botones de acción:

```
┌─ 2026-05-23 ──────────────────────┐
│  Leche Alquería 1L                │
│  Ajuste: −2 Und · −$6.400         │
│                                   │
│     [ Editar ]    [ Revertir ]    │
└───────────────────────────────────┘
```

- **Revertir** — deshace el ajuste por completo.
- **Editar** — pide el nuevo valor; el sistema revierte el ajuste original y aplica uno nuevo con la cantidad corregida. Toca `[ Guardar corrección ]` para confirmar.

Diagrama de decisión cuando hay ventas o compras posteriores:

```
¿Ventas o compras del producto
después de guardar el ajuste?
        │
        ├── SÍ ─► ❌ No se puede revertir
        │         → Merma manual:
        │           Inicio → Gastos
        │
        └── NO ─► ✅ Historial
                  → [ Revertir ] o [ Editar ]
```

> 🔒 **Bloqueo:** Los sobrantes (diferencias positivas) no se revierten desde Historial. Si guardaste un sobrante por error, regístrate una merma manual desde **Inicio → Gastos → Merma**.

---

## Parte 2 — Ver la salud de stock y configurar alertas

La salud de stock te dice de un vistazo qué productos están a punto de agotarse y cuáles tienen demasiada existencia. Esta parte tiene ocho pasos: abrir Productos, leer los colores de salud, entender los estados de productos nuevos, ver cómo se calculan los días, filtrar y ordenar por urgencia, y configurar los umbrales por proveedor.

---

### Paso 1 — Abrir el módulo Productos

**En celular** — HomeScreen, sección **OPERACIÓN**:

```
┌────────────────┐ ┌────────────────┐
│ 🔍 Escanear   │ │ 📜 Historial  │
│ Lista compras  │ │ X ventas hoy  │
└────────────────┘ └────────────────┘
┌────────────────┐ ┌────────────────┐
│ 🛍️ Productos  │ │ 📊 Panel      │
│ Catálogo   ◄──│ │ Reportes      │
└────────────────┘ └────────────────┘
```

**En computador** — sidebar izquierdo, sección **Gestión**:

```
│ GESTIÓN                      │
│   🛍️ Productos          ◄── │
│   📦 Inventario              │
│   📊 Estadísticas            │
```

---

### Paso 2 — Interpretar los colores de salud de stock

Cada producto tiene un indicador de color basado en sus ventas de los últimos 28 días.

| Color | Estado | Qué significa | Qué hacer |
|-------|--------|---------------|-----------|
| 🔴 Rojo con pulso | **Crítico** | Stock para pocos días | Llama al proveedor hoy |
| 🟠 Naranja | **Re-ordenar** | Stock bajo, pero no urgente | Haz el pedido pronto |
| 🟢 Verde | **Óptimo** | Stock en rango ideal | Nada por ahora |
| 🟡 Ámbar | **Lento** | Demasiado stock acumulado | No recompres tan pronto |
| 🟣 Morado | **Estancado** | Ya se había vendido antes, pero 0 ventas en los últimos 28 días | Evalúa un descuento o retirarlo |
| 🔴 Rojo | **Agotado** | Stock en cero o negativo | Registra una compra urgente |
| ⬜ Gris | **Sin datos** | Sin control de stock activado | — |

Así se ve la lista en el módulo **Productos**:

```
Producto            Salud         Stock
────────────────────────────────────────
Leche Alquería 1L   🔴 Crítico     2 días
Pan Bimbo tajado    🟠 Re-ordenar  5 días
Coca Cola Lata 350  🟢 Óptimo     10 días
Arroz Diana 1kg     🟡 Lento      45 días
Jabón Rey 300g      🟣 Estancado   0 ventas
```

---

### Paso 3 — Entender los estados de productos nuevos (ventana de maduración)

La **Salud del Stock** de cada producto aparece **28 días después de su primera venta**. Antes de ese punto, el promedio de ventas sería engañoso, así que Bistro muestra estados neutros en vez de un color de urgencia.

| Estado | Cuándo aparece | Qué hacer |
|--------|---------------|-----------|
| ⬜ **Sin ventas aún** | El producto nunca se ha vendido | Nada, es normal |
| ⏳ **Faltan Xd** | Ya vendió, pero le faltan X días para 28 | Espera, Bistro está midiendo |

Así avanza un producto por la ventana de maduración:

```
1ª venta ──────────── +28 días ──────────►
   │                       │
   ▼                       ▼
 sin vender     midiendo         diagnóstico real
   │              │                    │
   ▼              ▼                    ▼
⬜ Sin        ⏳ Faltan Xd     🔴🟠🟢🟡🟣 según
 ventas aún   (cuenta atrás)   velocidad de venta
```

> 💡 Un producto vendido hace solo 3 días mostraría un falso **"Lento (700d)"** si Bistro usara ese poco historial. Por eso espera a tener 28 días de ventas antes de emitir un color de urgencia.

En la lista, estos productos se ven así:

```
Producto            Salud         Stock
────────────────────────────────────────
Chocolisto 400g     ⏳ Faltan 12d  midiendo
Galletas nuevas     ⬜ Sin ventas aún
```

---

### Paso 4 — Cómo Bistro calcula los días de stock

El sistema usa el promedio diario de ventas de los últimos 28 días y lo cruza con el stock actual:

```
Ventas últimos 28 días: 14 und
Stock actual:           10 und

Promedio diario:
  14 ÷ 28 = 0.5 und/día

Días restantes:
  10 ÷ 0.5 = 20 días → 🟡 Lento
```

Los 28 días equivalen a 4 semanas — captura los ciclos semanales de venta (fines de semana, días pico) sin depender de un día atípico.

---

### Paso 5 — Filtrar y ordenar productos por urgencia

Para ver solo los productos en un estado específico, usa el filtro **Salud de Stock** en la parte superior:

```
[ Salud de Stock ▾ ]   [ Stock ↓ Menor duración ]

┌─────────────────────────┐
│  ✓ Salud de Stock       │
│    🔴 Crítico            │
│    🟠 Re-ordenar         │
│    🟢 Óptimo             │
│    🟡 Lento              │
│    🟣 Estancado          │
└─────────────────────────┘
```

Para ordenar por urgencia, usa **Stock ↓ Menor Duración** — pone primero los productos que se agotan antes.

> 💡 **Consejo:** Combinar filtro **🔴 Crítico** con ordenamiento **Menor Duración** te muestra la lista de compras del día.

---

### Paso 6 — Seleccionar el proveedor que vas a configurar

Los umbrales de rotación se ajustan **por proveedor**, no por categoría. El botón **⚙️ Rotación** solo se activa después de elegir un proveedor específico en el selector **Proveedor** — mientras diga "Todas", queda gris.

**En computador (Desktop / Tablet):**

```
┌──────────────────────┐ ┌───────────────┐
│ ● Alpina           ▾ │ │ ⚙️  Rotación   │ ◄── clic aquí
└──────────────────────┘ └───────────────┘
```

**En celular (Móvil):**

```
┌──────────────────────┐ ┌───────────────┐
│ ● Alpina           ▾ │ │ ⚙️  Rotación   │ ◄── toca aquí
└──────────────────────┘ └───────────────┘
```

Al abrir el selector puedes buscar el proveedor por nombre:

```
┌─ Proveedor ─────────────────┐
│ 🔍 Buscar proveedor...      │
│─────────────────────────────│
│    Todas                    │
│  ● Alpina                ✓  │
│  ● Bavaria                  │
│  ● Colanta                  │
└─────────────────────────────┘
```

> 🔒 **Bloqueo:** Si el selector dice **Todas**, el botón ⚙️ queda desactivado. Elige un proveedor primero.

---

### Paso 7 — Abrir el panel Configurar Rotación

Toca el botón **⚙️** — se abre el panel **Configurar Rotación** con los tres campos que definen los umbrales de ese proveedor:

```
┌─ Configurar Rotación ────── ✕┐
│ Proveedor: Alpina            │
│                              │
│ Rango Óptimo (Días)          │
│ ┌──────────┐  ┌──────────┐   │
│ │ Desde: 4 │  │ Hasta: 7 │   │
│ └──────────┘  └──────────┘   │
│  (Mínimo)      (Máximo)      │
│  < Mín → 🟠    > Máx → 🟡    │
│                              │
│ Alerta Crítica               │
│ ┌────────────────────────┐   │
│ │ Días restantes:      2 │   │
│ └────────────────────────┘   │
│  ≤ este umbral → 🔴 Crítico  │
│                              │
│  [ Cancelar ]  [ Guardar ]   │
└──────────────────────────────┘
```

Significado de cada campo:

- **Desde (Mínimo)** — por debajo de este número de días el producto pasa a **Re-ordenar 🟠**. Valor por defecto: 7 días.
- **Hasta (Máximo)** — por encima de este número el producto pasa a **Lento 🟡**. Valor por defecto: 12 días.
- **Días restantes** — cuando al producto le quedan ese número de días **o menos**, pasa a **Crítico 🔴**. Valor por defecto: 3 días.

> 💡 El mismo panel tiene una sección **Agregar productos** para vincular manualmente productos a este proveedor buscándolos por nombre o código de barras.

---

### Paso 8 — Ajustar los umbrales y guardar

Define los valores según la rotación real del proveedor y toca `[ Guardar Configuración ]`. Los cambios aplican de inmediato a todos los productos que reciben ese proveedor.

Ejemplo para un proveedor de lácteos como **Alpina** (caducidad rápida):

```
Umbrales Alpina (ejemplo):

≤ 2 días  ─► 🔴 Crítico
2–4 días  ─► 🟠 Re-ordenar
4–7 días  ─► 🟢 Óptimo
> 7 días  ─► 🟡 Lento
0 ventas  ─► 🟣 Estancado
Stock = 0 ─► 🔴 Agotado
```

> 💡 **Ejemplo práctico:** Para un proveedor de lácteos que caducan en una semana, configura **Días restantes** = 2, **Desde** = 4, **Hasta** = 7. Así el sistema te avisa cuando faltan 4 días y no cuando es demasiado tarde.

---

## Errores comunes

Los problemas más reportados al gestionar inventario están en esta tabla, con la acción concreta para resolverlos.

| Situación | Qué hacer |
|-----------|-----------|
| El campo de conteo está desactivado y no puedo escribir | El stock del producto está en negativo en el sistema. Primero registra una compra de ese producto para normalizar el stock. |
| Guardé una diferencia negativa por error | Abre **Historial** de inmediato y reviértela antes de registrar ventas o compras del mismo producto. |
| Guardé un sobrante por error (diferencia positiva) | Los sobrantes no se pueden revertir. Registra una merma por la cantidad equivocada desde **Inicio → Gastos → Merma**. |
| No veo el engranaje ⚙️ o está gris y no responde | El botón ⚙️ **Rotación** solo se activa cuando hay un proveedor específico seleccionado. Si el selector de proveedor dice "Todas", el botón queda desactivado. |
| Configuré la rotación pero un producto no cambió de color | Los umbrales se aplican al proveedor de ese producto. Si el producto tiene otro proveedor (o ninguno), usa los umbrales de ese proveedor o los valores por defecto (7/12/3). Revisa qué proveedor tiene asignado. |
| El diagnóstico de stock no se actualiza después de registrar una compra | Los indicadores se cargan al abrir la pantalla. Sal de **Productos** y vuelve a entrar para que se actualicen. |
| Un proveedor se ve bien pero hay un producto suyo en rojo | El diagnóstico agregado es un promedio. Usa el filtro **Salud de Stock → Crítico** para encontrar los urgentes uno por uno. |

---

## Preguntas frecuentes

Esta sección cubre dudas comunes sobre frecuencia del conteo, dónde se ven las mermas manuales, por qué se usan 28 días para calcular salud de stock, el estado "Estancado", de dónde salen los umbrales de cada producto, contar por categorías y exportar datos.

---

### FAQ — ¿Con qué frecuencia debo hacer el conteo de inventario?

No hay una frecuencia obligatoria en Bistro — tú decides. Lo más común es hacer el conteo de **categorías de alta rotación** (lácteos, carnes, bebidas) cada semana, y el resto del catálogo una vez al mes. Lo importante es hacerlo antes de pedidos grandes para no comprar lo que ya tienes.

```
Frecuencia sugerida según rotación:

  Alta rotación (lácteos, bebidas)  → semanal
  Media rotación (abarrotes)        → quincenal
  Baja rotación (limpieza, otros)   → mensual
```

---

### FAQ — ¿El historial de Inventario muestra todas las mermas del negocio?

No. El **Historial** dentro de **Inventario** (el botón que abre el panel lateral) solo muestra los **ajustes negativos del conteo** que aún puedes revertir. Las mermas registradas manualmente (producto dañado, vencido, robado) se hacen y se ven desde **Inicio → Gastos → Merma** — un módulo distinto.

```
¿Dónde encuentro cada tipo?

  Ajustes del conteo  →  Inventario → Historial
  Mermas manuales     →  Inicio → Gastos → Merma
```

---

### FAQ — ¿Por qué el sistema usa las ventas de los últimos 28 días para calcular el stock?

28 días equivale a exactamente 4 semanas. Eso captura los ciclos semanales de venta (por ejemplo, que los fines de semana se vende más) sin basarse en un solo día atípico. Es suficiente historial para ser representativo y lo suficientemente reciente para reflejar la demanda actual del negocio.

```
Cálculo del promedio diario:

  Ventas 28 días: 56 und
  ────────────────────────
  Promedio:    56 ÷ 28 = 2 und/día
```

---

### FAQ — ¿Qué significa que un producto esté "Estancado"?

Significa que **tienes unidades disponibles, pero nadie lo ha comprado en los últimos 28 días**. Es capital inmovilizado: dinero del negocio guardado en mercancía que no rota.

```
Stock actual:       8 und
Ventas 28 días:     0 und
                    ↓
Estado: 🟣 Estancado
```

Considera hacer una promoción, bajar el precio temporalmente o simplemente no volver a pedirlo al proveedor.

---

### FAQ — ¿De dónde saca Bistro los umbrales de un producto si no configuré nada?

Los umbrales de rotación se guardan **por proveedor**. Para decidir el color de un producto, Bistro busca su proveedor en cascada y usa el primer umbral que encuentra:

```
¿Hay un proveedor seleccionado
en el filtro Proveedor?
        │
        ├── SÍ ─► usa los umbrales de ESE proveedor
        │
        └── NO
            │
            ▼
   ¿El producto tiene un solo
   proveedor con stock activo?
        │
        ├── SÍ ─► usa los umbrales de ese proveedor
        │
        └── NO
            │
            ▼
   ¿El producto tiene un
   proveedor por defecto?
        │
        ├── SÍ ─► usa esos umbrales
        │
        └── NO ─► usa los valores por defecto
                  (7 / 12 / 3)
```

Por eso un producto puede aparecer en 🔴 o 🟠 aunque nunca hayas abierto **Configurar Rotación**: está usando los umbrales por defecto o los del proveedor que le corresponde.

---

### FAQ — ¿Puedo hacer el conteo por categorías sin hacerlo todo de una vez?

Sí. Filtra por **Categoría** en la cabecera del módulo **Inventario**, haz el conteo de esa sección y guarda. Luego cambia de categoría y repite. Los ajustes de cada categoría se guardan de forma independiente — no necesitas terminar el catálogo entero antes de presionar guardar.

> 💡 **Consejo:** Activa el toggle **Ver solo diferencias** para que la lista esconda los productos que ya cuadraron y te enfoques en lo pendiente.

```
Ver solo diferencias   [ ━━○ ]  OFF  ← muestra todo
Ver solo diferencias   [ ●━━ ]  ON   ← solo los que cambian
```

---

### FAQ — ¿Puedo exportar el conteo o el listado de salud de stock a Excel?

No. Ninguno de los dos módulos tiene exportación a Excel o PDF por el momento. El conteo y la revisión de stock se hacen directamente en pantalla.
