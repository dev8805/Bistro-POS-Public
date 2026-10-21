# Cómo ver el Dashboard en Bistro

> Guía para: Administradores / Dueños del negocio
> Módulo: **Dashboard**
> Tiempo estimado: 5 minutos

---

## ¿Para qué sirve?

El **Dashboard** es el panel de control financiero de Bistro POS. Centraliza en tiempo real cuánto vendió tu negocio, cuál es tu margen de ganancia real, qué días u horas son las más fuertes y qué alertas requieren tu atención inmediata.

Si necesitas consultar las estadísticas del día, revisar el resumen de ventas, chequear las ganancias del mes, auditar métodos de pago o evaluar el rendimiento de tus productos, este es el módulo principal de toma de decisiones.

---

## Antes de empezar

Antes de analizar las métricas en el Dashboard, ten en cuenta los siguientes requisitos operativos:

- Debes contar con el permiso **Ver Reportes** (`admin_reports`), asignado a administradores y propietarios.
- Requiere conexión activa a internet. Si el dispositivo está sin red, verás la alerta de sin conexión.
- Para que la **Utilidad Real** sea exacta, los productos deben tener su costo unitario cargado en el catálogo.

---

## Paso a paso

Sigue estos pasos ordenados para interpretar cada sección del Dashboard y evaluar la salud financiera de tu negocio según el período seleccionado.

---

### 1️⃣ Abre el Dashboard en Estadísticas

En el menú lateral principal de Bistro, ubica la sección **Gestión** y presiona la opción **Estadísticas** (o **Dashboard**).

```
┌─ Menú Gestión ───────────────┐
│  📊 Estadísticas             │ ◄ Toca aquí
│  📦 Productos                │
│  👥 Clientes                 │
└──────────────────────────────┘
```

Si el sistema no detecta internet, mostrará el ícono de wifi desconectado. Las métricas cargarán automáticamente al restablecerse la red.

---

### 2️⃣ Elige el período de tiempo

En la esquina superior encontrarás el selector de período. Por defecto el Dashboard abre en **Hoy**.

```
┌─ 📅 Selector de Período ───────┐
│  ✓  Hoy                        │
│     Últimos 7 días             │
│     Últimos 30 días            │
│     Este mes                   │
│     Mes anterior               │
│  ────────────────────────────  │
│     Personalizar               │
└────────────────────────────────┘
```

Si necesitas fechas específicas, toca **Personalizar**:

```
┌─ Rango Personalizado ──────────┐
│  Desde:  [ 01 / 08 / 2026 ]    │
│  Hasta:  [ 31 / 08 / 2026 ]    │
│  [ Cancelar ]    [ Aplicar ]   │
└────────────────────────────────┘
```

> 💡 **Nota:** Todos los cálculos respetan la zona horaria configurada en tu negocio, garantizando que ventas nocturnas o de madrugada cierren en la jornada correspondiente.

---

### 3️⃣ Lee los 4 KPIs principales

La fila superior condensa las cuatro cifras maestras de la operación:

```
┌──────────────────┐  ┌──────────────────┐
│ Ventas Netas     │  │ Utilidad Real    │
│ $1.250.000       │  │ $380.000         │
│ 43 pedidos   +8% │  │ Margen: 30.4%    │
└──────────────────┘  └──────────────────┘
┌──────────────────┐  ┌──────────────────┐
│ Ticket           │  │ Costo Mercancía  │
│ $29.070     +12% │  │ $620.000    rojo │
│ Promedio/cliente │  │ = 49.6% ingresos │
└──────────────────┘  └──────────────────┘
```

- **Ventas Netas**: Total facturado en órdenes completadas.
- **Utilidad Real**: Ganancia limpia tras descontar costo de mercancía, mermas y gastos.
- **Ticket**: Promedio gastado por cada cliente con compra.
- **Costo Mercancía**: Total invertido en los productos vendidos.

---

### 4️⃣ Interpreta badges y umbral de mercancía

Las tarjetas de **Ventas Netas** y **Ticket** incluyen un badge comparativo contra el período anterior equivalente:

```
[ +8% verde ]  → Creció vs período anterior
[ -5% rojo  ]  → Disminuyó vs período anterior
```

El **Costo de Mercancía** cambia de color automáticamente según su impacto sobre las ventas:

```
Costo Mercancía / Ventas Netas:
   < 40%  → Verde (nivel saludable)
  ≥ 40%  → Rojo  (revisar precios o compras)
```

> ⚠️ **Aviso:** Si el costo de mercancía permanece en rojo de forma sostenida, evalúa renegociar costos con proveedores o ajustar tus precios de venta.

---

### 5️⃣ Entiende cómo se calcula la Utilidad Real

La **Utilidad Real** descuenta todos los egresos directos asociados al período:

```
  Ventas Netas
− Costo Mercancía (COGS)
− Mermas registradas
− Otros gastos operativos
───────────────────────────────
= Utilidad Real (Margen Neto)
```

```
Ventas $1.000.000 ─┬─ Costo:  $450.000
                   ├─ Mermas:  $30.000
                   └─ Gastos:  $120.000
                   ───────────────────
                   Ganancia = $400.000
```

> 💡 **Tip:** Si un producto no tiene costo cargado en el catálogo, su costo cuenta como $0, inflando la ganancia reportada. Registra siempre el costo de compra.

---

### 6️⃣ Revisa la Evolución de Ventas y Promedio Diario

Muestra el desempeño en el tiempo con dos modos inteligentes:

**Si eliges 1 solo día (ej. Hoy):**
Muestra 24 barras horarias continuas (12am a 11pm) con la hora pico destacada con `⚡ PICO`.

**Si eliges varios días (ej. Últimos 30 días):**
Presenta el gráfico comparativo contra el período anterior con dos métricas clave en la cabecera:

```
┌──────────────────────────────────────────────┐
│ ⭐ DÍA RÉCORD: $426.000 (28/8)               │
│ 📈 PROMEDIO DIARIO: $207.812 (?)             │
└──────────────────────────────────────────────┘
```

```
Ingreso total del período:   $1.600.000
Días con ventas registradas: ÷ 8 días
────────────────────────────────────────
Promedio Diario operado    =  $200.000/día
```

> 💡 **Nota:** El tooltip aclara que el promedio solo divide entre días con ventas activas. Los días cerrados no reducen tu promedio.

---

### 7️⃣ Consulta los Gastos Operativos y su detalle

Si registraste egresos o mermas, este bloque desglosa a dónde se fue el dinero con un badge destacado de **Total**:

```
┌─ 🍩 Gastos Operativos ─── [ Total: $85.000 ] ┐
│                                              │
│  ● MERMAS       52%  $44.200                 │
│    ████████████░░░░░░░░░░░                   │
│  ● Servicios    48%  $40.800                 │
│    ███████████░░░░░░░░░░░░                   │
└──────────────────────────────────────────────┘
```

- **En computadores (≥ 1024px)**: Muestra la torta circular junto a las barras.
- **En celulares y tablets (< 1024px)**: La torta se oculta automáticamente para ahorrar espacio vertical, mostrando directo la lista de categorías.

Toca cualquier categoría para abrir el modal con el desglose de cada factura o recibo individual.

---

### 8️⃣ Analiza el Ritmo del Día o Ventas por Día

Ubicado en la columna izquierda inferior, se adapta según la duración del período:

**En 1 solo día: Ritmo del Día**
Resume el horario operativo y divide la jornada en franjas:

```
┌─ ⏱️ Ritmo del Día ────────────────────────────┐
│   Horas Activas      │     Ticket Medio      │
│      6 de 24h        │        $18.500        │
├──────────────────────┴───────────────────────┤
│ ☀️ Mañana (6am-12pm)   40%  $240K | Ticket: $15K
│ 🌤️ Tarde  (12pm-6pm)   60%  $360K | Ticket: $20K
└──────────────────────────────────────────────┘
```

**En varios días: Ventas Acumuladas por Día**
Muestra qué días de la semana (Lun a Dom) ingresa más dinero, destacando el día récord con una estrella dorada `⭐`.

---

### 9️⃣ Explora el Top de Productos

Ubicado a la derecha de Ventas Acumuladas, lista los productos líderes del período:

```
┌─ 🏆 Top Productos ────── [ Ganancia | Ingreso ]
│
│ #  Producto          Qty  Ganancia  Margen
│ 1  Gaseosa 350ml      28   $84.000   55% 🟢
│ 2  Papas Tradicional  19   $45.000   42% 🟢
│ 3  Cerveza Lata       15   $22.500   24% 🔴
└───────────────────────────────────────────────
```

- **Pestaña Ganancia**: Ordena por dinero neto libre tras descontar costos.
- **Pestaña Ingreso**: Ordena por ventas brutas recaudadas.
- **Columna Margen**: Verde (≥ 40%), Ámbar (25-39%) o Rojo (< 25%).

---

### 🔟 Revisa los Métodos de Pago y recaudos

Muestra la proporción de recaudos por cada medio de pago:

```
┌─ 💳 Métodos de Pago ─────────────────────────┐
│ ● Efectivo     65%  $650.000                 │
│   ████████████████░░░░░░                     │
│ ● Transferencia 25% $250.000                 │
│   ██████░░░░░░░░░░░░░░░░                     │
│ ● Crédito      10%  $100.000                 │
│   ██░░░░░░░░░░░░░░░░░░░░                     │
└──────────────────────────────────────────────┘
```

**Disposición responsive:**
- En desktop (≥ 1024px) se ubica arriba junto a la Evolución de Ventas.
- En móvil y tablet (< 1024px) se acomoda automáticamente de **último**, permitiéndote ver primero el rendimiento comercial y de productos.

---

### 1️⃣1️⃣ Verifica las alertas de créditos y deudas

Al final encontrarás tarjetas informativas si existen cobros o pagos pendientes:

```
╔══════════════════════════════════════════════╗
║ 💳 Créditos por cobrar: $320.000             ║
║ Mayor saldo: Carlos Mendoza ($120.000)       ║
╚══════════════════════════════════════════════╝
╔══════════════════════════════════════════════╗
║ 💸 Deudas del negocio: $450.000              ║
║ Facturas pendientes de pago a proveedores    ║
╚══════════════════════════════════════════════╝
```

> 💡 **Importante:** Los créditos reflejan la deuda total acumulada de tus clientes en la cartera, no únicamente lo fiado en los días del filtro.

---

### 1️⃣2️⃣ Descarga o comparte el reporte PDF (próximamente)

La arquitectura de exportación a PDF se encuentra integrada en el sistema. Los botones de descarga y compartir se encuentran temporalmente ocultos en la barra superior mientras se optimiza la plantilla de impresión.

Una vez reactivados, podrás generar reportes ejecutivos en PDF y enviarlos directamente por WhatsApp o correo electrónico a socios o contadores.

---

## Errores comunes

Esta tabla resume los comportamientos del Dashboard que suelen generar consultas y la solución directa para cada uno:

| Situación reportada | Causa principal | Acción recomendada |
|---------------------|-----------------|--------------------|
| El panel no carga y muestra sin wifi | El dispositivo perdió la conexión | Verifica tu conexión a internet y recarga la pantalla |
| La **Utilidad Real** sale muy alta | Hay productos vendidos sin costo registrado | Ve a **Productos** y define el costo unitario de compra |
| En celular no veo la torta de gastos | Se oculta por diseño responsive para ahorrar espacio | Es normal; en móvil se muestra directo la lista y montos |
| Métodos de Pago sale al final en celular | Se reordenó para priorizar la lectura de ventas y productos | En pantallas grandes vuelve a su lugar superior derecho |
| El Promedio Diario no coincide con días del mes | Solo divide entre días con ventas registradas | Consulta el tooltip informativo junto al promedio |
| Los créditos no cambian al cambiar de fecha | Es cartera histórica global, no del período | Administra los saldos desde la pantalla de **Clientes** |

---

## Preguntas frecuentes

Respuestas puntuales a las dudas más comunes sobre las cifras y el funcionamiento del Dashboard en Bistro POS:

---

### FAQ — ¿Por qué mis Ventas Netas incluyen dinero que no he cobrado?

Porque los pedidos despachados a crédito (fiados) se registran como completados. El total muestra la venta bruta generada. Si deseas saber cuánto entró físicamente en efectivo o transferencias, revisa el panel de **Métodos de Pago** o resta los créditos pendientes.

```
Ventas Netas totales   $1.200.000
− Pedidos fiados        $150.000
───────────────────────────────────
Dinero en caja/cuentas $1.050.000
```

---

### FAQ — ¿Cómo se calcula el Promedio Diario en el gráfico?

Toma las Ventas Netas del período y las divide únicamente entre los días que tuvieron ventas activas. Si en un mes de 30 días tu negocio abrió 20 días, dividirá entre 20 para no castigar tu promedio diario por días de descanso o festivos.

```
Total Ventas: $2.000.000  ÷  20 días activos
─────────────────────────────────────────────
Promedio Diario operado  =  $100.000 / día
```

---

### FAQ — ¿Por qué en celular la torta de gastos no sale y métodos de pago va de último?

Es una optimización responsive para pantallas menores a 1024px. La torta ocupaba demasiado espacio vertical; al ocultarla, puedes leer directamente las categorías y sus barras. Asimismo, Métodos de Pago se traslada al final para que revises primero tus ventas, días fuertes y productos.

---

### FAQ — ¿Por qué "Este mes" y "Mes anterior" muestran comparativas diferentes?

**Este mes** compara los días transcurridos del mes actual contra exactamente la misma cantidad de días del mes pasado (ej. del 1 al 12 de junio contra del 1 al 12 de mayo). Para evaluar el mes cerrado completo, selecciona la opción **Mes anterior**.

---

### FAQ — ¿El período Personalizado tiene límite de días?

No tiene límite de días. Puedes consultar desde una semana puntual hasta un año completo. En rangos muy extensos (más de 6 meses), el sistema puede tardar unos segundos adicionales en consolidar todas las transacciones.

---

### FAQ — ¿Por qué la Utilidad Real puede ser negativa?

Ocurre cuando la suma del costo de mercancía vendida, las mermas registradas y los gastos operativos del período superan los ingresos recaudados, indicando una pérdida operativa momentánea que requiere control de costos.

```
Ingresos:         $500.000
− Mercancía:     $350.000
− Gastos fijos:  $150.000
− Mermas:         $50.000
──────────────────────────
Resultado:       -$50.000 (Déficit)
```

---

### FAQ — ¿Las deudas con proveedores bajan la Utilidad Real?

Solo bajan la Utilidad Real si las registras como un gasto en el módulo de **Egresos**. Si únicamente están anotadas en **Deudas del negocio**, se mostrarán en la tarjeta de alerta informativa sin restar automáticamente del balance operativo.

---

### FAQ — ¿Qué pasa si un producto no tiene costo unitario cargado?

El sistema asumirá que su costo de adquisición fue $0. En consecuencia, el **Costo de Mercancía** reportado será menor al real y la **Utilidad Real** parecerá más abultada de lo que realmente es. Asigna siempre costos reales a tus productos.

---

## Recursos multimedia (opcional)

Sugerencias de recursos visuales recomendados para entrenamiento de cajeros y administradores:

| Tipo | Título sugerido | Contenido |
|------|-----------------|-----------|
| GIF | "Bistro — Explorar Dashboard" | Cambio de período, lectura de KPIs y revisión de Promedio Diario |
| Imagen | "Bistro — Ritmo del Día vs Semanal" | Comparativa visual entre la vista diaria y el gráfico de 7 días |
| Imagen | "Bistro — Top Productos con Márgenes" | Tabla con pestañas de Ganancia e Ingreso y semáforo de margen |
