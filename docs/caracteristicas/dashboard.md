# Dashboard Analítico (DashboardScreen)

Componente: `screens/DashboardScreen.tsx`  
Hook principal: `hooks/useDashboard.ts`  
Dependencias adicionales: `hooks/useDebts.ts`, `hooks/useBusinessSettings.ts`  
Acceso: Menú principal → "Dashboard" / "Inicio"

Panel de control financiero del negocio. Centraliza las métricas clave de rentabilidad, ventas, gastos y alertas operativas para un período de tiempo seleccionable. Es la pantalla de toma de decisiones del dueño.

---

## Períodos Disponibles

| Opción | Rango |
|---|---|
| **Hoy** | Desde inicio del día (en la zona horaria del negocio) hasta ahora |
| **Últimos 7 días** | Últimos 6 días + hoy |
| **Últimos 30 días** | Últimos 29 días + hoy |
| **Este mes** | Desde el 1 del mes actual |
| **Mes anterior** | Del 1 al último día del mes pasado |
| **Personalizado** | Rango libre via `CustomDateRangePicker` |

> [!NOTE]
> Todos los rangos usan la **zona horaria del negocio** (`timezone` de `useBusinessSettings`), no UTC. Esto evita que las ventas de la madrugada queden atribuidas al día equivocado. Ver la librería `lib/timezone.ts`.

---

## Secciones del Dashboard

### 1. KPIs Principales (4 tarjetas)

| KPI | Qué mide | Tooltip del sistema |
|---|---|---|
| **Ventas Netas** | `totalIncome` — suma de todas las órdenes completadas | "Dinero total que ha entrado a caja en este periodo" |
| **Utilidad Real** | `operatingProfit` = Ventas − COGS − Gastos − Mermas | "Lo que realmente ganaste después de pagar mercancía, gastos fijos, mermas, etc." |
| **Ticket** | `averageTicket` = totalIncome / ordersCount | "Valor promedio de cada venta. Si sube, tus clientes están gastando más." |
| **Costo de Mercancía** | `cogs` — costo de lo vendido en el período | "Total invertido en la mercancía que ya lograste vender. Ideal que el % se mantenga < 40%" |

Cada KPI incluye un **badge de cambio porcentual** comparando con el período anterior equivalente (mismo número de días, inmediatamente anterior). El badge es verde si creció, rojo si bajó.

**Umbral visual de COGS**: si el costo de mercancía supera el **40% de los ingresos**, el valor se muestra en rojo. Por debajo del 40%, en verde.

---

### 2. Cuadrícula Analítica (Grid de 6 columnas)

El área analítica principal se estructura en un único grid responsivo de 6 columnas (`grid-cols-1 lg:grid-cols-6`), garantizando alineación y simetría en desktop y un flujo vertical natural en dispositivos móviles.

#### Disposición en Pantallas Grandes (≥ 1024px / Desktop)
- **Fila 1**:
  - **Evolución de Ventas** (`lg:col-span-4`, 66.6%): Gráfico de evolución temporal.
  - **Métodos de Pago** (`lg:col-span-2`, 33.3%): Canales de recaudo.
- **Fila 2**:
  - **Ritmo del Día / Ventas Acumuladas por Día** (`lg:col-span-3`, 50%, izquierda): Distribución horaria o semanal.
  - **Top Productos** (`lg:col-span-3`, 50%, derecha): Ranking de productos más rentables o vendidos.

#### Disposición en Pantallas Menores a 1024px (Móvil y Tablet)
Para evitar que Métodos de Pago interrumpa la lectura del rendimiento operativo, utiliza `order-last lg:order-none`:
1. **Evolución de Ventas** (24 horas o curva diaria)
2. **Ritmo del Día / Ventas Acumuladas por Día**
3. **Top Productos**
4. **Métodos de Pago** (al final de la pantalla)

---

### 3. Evolución de Ventas

El comportamiento del panel principal se adapta automáticamente según el período seleccionado:

- **Período de un solo día** (`isSingleDay`: "Hoy" o fecha única personalizada):
  - Título: `Evolución de Ventas (D/M/YYYY)` con badge `24 Horas`.
  - Gráfico de barras horarias (de 12am a 11pm), con soporte para exploración táctil en móviles.
  - Indicador `⚡ PICO` sobre la hora con mayor recaudación.
- **Período de múltiples días** (`!isSingleDay`):
  - Gráfico de curvas/líneas (`SalesChart`) con comparativa contra el período anterior equivalente.
  - Cabecera analítica integrada con dos métricas clave:
    - **Día Récord**: Mayor venta registrada en una sola fecha del período con su fecha corta `(D/M)`.
    - **Promedio Diario**: `totalIncome / dailySales.length`. Cuenta únicamente los días en los que hubo ventas activas (no divide entre días calendario vacíos). Incluye un **Tooltip** explicativo interactivo.

---

### 4. Métodos de Pago

Muestra la distribución de ingresos por canal de recaudo con barras proporcionales:

| Método | Color |
|---|---|
| `cash` | Verde esmeralda |
| `card` | Azul |
| `nequi` | Morado |
| `daviplata` | Naranja |
| `transfer` | Cian |
| `credit` | Rojo |
| `other` | Gris |

> [!NOTE]
> **Pagos divididos (mixtos).** Las ventas con pago dividido (`payment_method = 'mixed'`, detalle en `split_payments`) se reparten a su método real (Efectivo, Nequi, etc.) según corresponda, en vez de agruparse como "Otros".

---

### 5. Gastos Operativos (Donut Chart y Leyenda)

Muestra el desglose de egresos operativos del período:
- **Mermas** (`wasteTotal`) — en rojo, si existen.
- **Otros gastos** — agrupados por categoría (`category`), con monto y porcentaje.
- **Cabecera destacada**: Incluye un badge pill estilizado `Total: $X` con acento en tono rose para máxima legibilidad.
- **Optimización Responsive**: En pantallas menores a 1024px (`hidden lg:block`), el gráfico circular SVG se oculta para no ocupar espacio vertical innecesario en celulares y tablets, mostrando directamente la lista de categorías con sus barras de progreso. En pantallas de 1024px o superiores se muestra la torta completa junto a la leyenda.

Al hacer clic en cualquier categoría o segmento del donut, se abre el **modal de desglose** con el listado individual de gastos (fecha, descripción y monto).

---

### 6. Ritmo del Día vs Ventas Acumuladas por Día (Columna Izquierda)

Este panel alterna según el tipo de período:

- **Vista de 1 solo día: Ritmo del Día**
  - Resumen analítico superior en 2 columnas:
    - **Horas Activas**: cantidad de horas con ventas registradas (ej: *8 de 24h*).
    - **Ticket Medio**: promedio por pedido en la jornada.
  - Desglose por franjas horarias operativas:
    - **Mañana** (6:00 am – 12:00 pm)
    - **Tarde** (12:00 pm – 6:00 pm)
    - **Noche** (6:00 pm – 12:00 am)
    - **Madrugada** (12:00 am – 6:00 am)
  - Cada franja muestra: % del ingreso del día, total recaudado en pesos, barra de progreso, pedidos realizados y **Ticket promedio por franja** (resaltado en azul).
- **Vista de rango de días: Ventas Acumuladas por Día**
  - Resumen superior: **Día Récord** (ej. *Viernes*), **Venta Récord** ($) y **Total Acumulado** ($).
  - Gráfico de barras de los 7 días de la semana (Lunes a Domingo), identificando el día más fuerte con estrella dorada animada.
  - Pie explicativo: *"Distribución acumulada de lunes a domingo en el período seleccionado"*.

---

### 7. Top Productos (Columna Derecha)

Tabla con el ranking de los productos más destacados del período, posicionada a la derecha de Ritmo del Día / Ventas Acumuladas.
- Pestañas intercambiables: **Ganancia** (verde) e **Ingreso** (azul).
- Columnas: Posición `#`, Producto (imagen y nombre), Cantidad vendida `Qty`, Monto ($) y **Margen** unitario (Verde ≥ 40%, Ámbar 25-39%, Rojo < 25%).
- En negocios especiales (ej. 10001) incluye botones para imprimir y exportar PDF del top.

---

### 8. Alertas Operativas (Condicionales)

---

## Exportar Reporte PDF

> [!WARNING]
> **Botones ocultos en la UI.** Los botones "Descargar reporte" y "Compartir" están comentados en `DashboardScreen.tsx` (tanto en el header desktop como en el bloque móvil). La lógica `handleExportPDF` y `lib/exportDashboardPDF.ts` permanecen intactas y son funcionales.

~~Botón "Descargar reporte" disponible en desktop y móvil.~~ Llama a `lib/exportDashboardPDF.ts` que genera un PDF con los datos del período activo.

En dispositivos con soporte para `navigator.share` (móviles principalmente), existe adicionalmente el botón "Compartir" que lanza el sheet nativo de compartir del sistema operativo.

El PDF incluye: nombre del negocio, rango de fechas, KPIs, desglose de gastos y deudas pendientes.

---

## Lo que NO puede hacer el Dashboard

- **No es interactivo para correcciones** — es solo lectura. Para corregir datos hay que ir a las pantallas correspondientes.
- **No muestra metas ni presupuestos** — no hay funcionalidad de "meta del mes" ni comparación contra objetivos definidos.
- **No muestra rentabilidad por categoría** — solo por producto individual.
- **No desglosa ventas por vendedor/turno** — todas las ventas se tratan como del negocio, sin atribución por usuario.
- **No muestra el flujo de caja** — la "Utilidad Real" es utilidad operativa aproximada, no es un estado de flujo de caja real ni un P&L contable.
- **Las ventas fiadas no restan de la utilidad** — los créditos otorgados (`totalCredits`) aparecen como alerta pero se cuentan dentro de las Ventas Netas. El dinero que aún no entró a caja infla el ingreso reportado.

---

## Cálculo de "Utilidad Real" (operatingProfit)

Esta es la métrica más importante y más sensible a la calidad de los datos:

```
Utilidad Real = Ventas Netas − COGS − Mermas − Otros Gastos
```

| Componente | Fuente |
|---|---|
| Ventas Netas | `orders` con `status = 'completed'` en el rango |
| COGS | Costo de los productos vendidos (`order_items × cost_unitario`) |
| Mermas | `wastage` en el rango |
| Otros Gastos | `expenses` en el rango |

> [!WARNING]
> **La utilidad depende de que los costos estén bien cargados.** Si un producto tiene `cost = 0` (porque no se registró el costo al crearlo, o no tiene lotes de compra), su contribución al COGS será $0 y la utilidad se verá artificialmente alta. Esto es el principal riesgo de datos incorrectos en el sistema.

---

## Comparación con Período Anterior

Los badges de cambio (%) se calculan comparando con el período anterior **equivalente**:

```javascript
change = ((current - previous) / previous) * 100
```

- "Hoy" compara contra "ayer".
- "Últimos 7 días" compara contra los 7 días antes de ese rango.
- "Este mes" compara contra el mismo número de días del mes pasado (no contra el mes completo anterior — eso es la opción "Mes anterior").

---

## Datos cargados (useDashboard)

El hook `useDashboard` ejecuta múltiples queries paralelas al cambiar el `dateRange`:

| Query | Tabla | Propósito |
|---|---|---|
| Órdenes del período | `orders` + `order_items` | KPIs, top productos, actividad/hora, métodos de pago |
| Órdenes período anterior | `orders` + `order_items` | Cálculo de % de cambio |
| Mermas | `wastage` | Gastos operativos y utilidad |
| Gastos | `expenses` | Gastos operativos y utilidad |
| Deudas de clientes | `clients` con `current_debt > 0` | Alerta de créditos por cobrar (deuda acumulada total, no filtrada por período) |
| Productos sin stock | `products` donde `stock = 0` | Dato calculado en `stockOutCount` (no renderizado como alerta en UI actualmente) |

Adicionalmente, `useDebts` carga las **deudas del negocio** (tabla `business_debts`) de forma independiente.

---

## Inconsistencias y Notas

> [!WARNING]
> **Las ventas fiadas (crédito) se incluyen en Ventas Netas**: un pedido pagado con método `'credit'` se registra como `status = 'completed'` y suma al `totalIncome`. El dueño puede ver $500,000 en ventas pero si $200,000 son fiados, solo $300,000 entraron a caja físicamente. La tarjeta "Ventas Netas" muestra el desglose `"X pedidos · $Y en fiados"` cuando hay créditos activos. El PDF también incluye una nota de advertencia en el P&L. Los créditos totales también aparecen en la alerta de "Créditos por cobrar".

> [!NOTE]
> **El Ticket Promedio excluye pedidos de $0**: el cálculo usa `totalIncome / ordersWithIncome`, donde `ordersWithIncome` cuenta solo órdenes con `total > 0`. Los pedidos gratuitos o con 100% de descuento no distorsionan el promedio, aunque sí se cuentan en el total de pedidos mostrado.

> [!NOTE]
> **El donut de gastos agrupa por el campo `category`** (no por `description`): el campo `category` es la categoría seleccionada al registrar el gasto; `description` es la nota libre y se muestra como detalle en el modal. Si el mismo tipo de gasto se registra con categorías distintas, aparecen como segmentos separados. Ver [`flujo_registro_gastos.md`](./flujo_registro_gastos.md).

> [!NOTE]
> **Los gastos fijos no están incluidos en la Utilidad Real**: `totalFixedExpenses` está hardcodeado en `0` en `useDashboard.ts`. La fórmula `Ventas − COGS − Mermas − Gastos operativos` no contempla arriendos, nómina fija ni otros gastos recurrentes que no se registren manualmente como `expenses`. Si se registran esos gastos en la pantalla de Egresos, sí se reflejan en la utilidad.

> [!NOTE]
> **El margen de Top Productos usa costo histórico FIFO cuando está disponible**: si el producto tiene registros en `lot_allocations`, se usa el `unit_cost_at_sale` de cada lote (costo real al momento de la venta). Si no hay lotes registrados, se usa el costo actual del producto como fallback. En ese caso, un cambio de precio posterior a la venta sí afecta el margen mostrado.

---

## Coexistencia con sidebar y Asistente IA

`WidgetSidebarPanel` usa `fixed inset-y-0 right-0` para el panel (no tapa el sidebar). Su overlay/backdrop usa `md:left-60` para dejar visible el sidebar en desktop. Z-index del overlay: `z-40`. Z-index del panel: `z-[70]`. El chat (z-[110]) queda siempre al frente.
