# Dashboard con Datos Reales - Plan de Implementación

**Objetivo:** Conectar el dashboard a datos reales de Supabase, eliminar widgets innecesarios y agregar nuevos widgets de análisis de inventario/productos.
**Arquitectura:** Hook `useDashboard` centralizado que ejecuta queries a Supabase con filtro de periodo. El DashboardScreen consume el hook y renderiza widgets con datos reales.
**Tech Stack:** React + TypeScript, Supabase (tablas: `orders`, `order_items`, `products`, `expenses`)

---

## Resumen de Cambios

### Eliminar (widgets que el usuario NO quiere):
- `returning_customers` → Clientes Recurrentes
- `customer_demographics` → Demografía de Clientes  
- `regional_heatmap` → Mapa de Calor Regional
- `customers_served` → Clientes Atendidos

### Conservar y conectar a datos reales:
- `orders_today` → Pedidos del periodo (count de `orders` con status `completed`)
- `products_sold` → Productos vendidos (sum de `order_items.quantity`)
- `total_income` → Ingresos totales (sum de `orders.total` completadas)
- `total_sales` → Gráfico de ventas totales
- `payment_methods` → Distribución por método de pago
- `top_products` → Top productos más vendidos
- `hourly_activity` → Actividad por hora

### Agregar NUEVOS widgets:
- `high_rotation_products` → Gráfico de productos con mayor rotación (recuperación de capital rápida)
- `low_rotation_products` → Lista de 10 productos con menor rotación
- `waste_data` → Mermas (datos de `expenses` donde category = 'Mermas/Pérdidas')
- `inventory_value` → Dinero en inventario a costo y a precio de venta

### Agregar selector de periodo:
- Hoy, Últimos 7 días, Últimos 30 días, Este mes, Mes anterior, Personalizado

---

## Base de Datos Relevante (Supabase)

### Tabla `orders` (191 rows)
| Campo | Tipo | Uso |
|---|---|---|
| id | uuid | PK |
| business_id | uuid | Filtrar por negocio |
| status | text ('pending','preparing','ready','completed','canceled') | Solo contar `completed` |
| payment_method | text ('cash','card','nequi','daviplata','transfer','credit','other') | Para distribución |
| total | numeric | Ingresos |
| created_at | timestamptz | Filtro de periodo |

### Tabla `order_items` (408 rows)
| Campo | Tipo | Uso |
|---|---|---|
| product_id | uuid | FK a products |
| product_name | text | Nombre para ranking |
| quantity | numeric | Unidades vendidas |
| total_price | numeric | Ingreso por item |
| order_id | uuid | FK a orders |

### Tabla `products` (13 rows)
| Campo | Tipo | Uso |
|---|---|---|
| id | uuid | PK |
| name | text | Nombre producto |
| price | numeric | Precio de venta |
| cost | numeric | Costo del producto |
| stock | numeric | Stock actual |
| image_url | text | Imagen |
| is_active | boolean | Solo activos |

### Tabla `expenses` (5 rows)
| Campo | Tipo | Uso |
|---|---|---|
| amount | numeric | Valor de la merma |
| category | text | Filtrar 'Mermas/Pérdidas' |
| description | text | Detalle |
| expense_date | date | Filtro de periodo |

---

## Tareas de Implementación

### Tarea 1: Crear hook `useDashboard.ts`

**Archivos:**
- Create: `hooks/useDashboard.ts`

**Descripción:**
Hook que recibe un rango de fechas (`startDate`, `endDate`) y consulta Supabase para extraer todos los datos del dashboard.

**Datos que retorna:**
```typescript
interface DashboardData {
  // KPIs
  ordersCount: number;
  productsSold: number;
  totalIncome: number;
  
  // Comparación con periodo anterior (para calcular % change)
  prevOrdersCount: number;
  prevProductsSold: number;
  prevTotalIncome: number;
  
  // Métodos de pago
  paymentMethods: { method: string; amount: number; percent: number }[];
  
  // Top productos (mayor venta)
  topProducts: { name: string; sold: number; income: number; image: string | null }[];
  
  // Actividad por hora
  hourlyActivity: number[];
  
  // NUEVOS:
  // Alta rotación (mayor ingreso/costo = más rápida recuperación de capital)
  highRotationProducts: { name: string; sold: number; income: number; cost: number; rotation: number }[];
  
  // Baja rotación (10 productos con menor venta)
  lowRotationProducts: { name: string; sold: number; stock: number; daysInInventory: number }[];
  
  // Mermas
  wasteTotal: number;
  wasteCount: number;
  wasteItems: { description: string; amount: number; date: string }[];
  
  // Inventario
  inventoryAtCost: number;   // SUM(stock * cost)
  inventoryAtSale: number;   // SUM(stock * price)
}
```

**Queries SQL principales:**

1. **Pedidos y total de ingresos**
```sql
SELECT count(*), COALESCE(sum(total), 0)
FROM orders
WHERE business_id = ? AND status = 'completed'
AND created_at >= ? AND created_at <= ?
```

2. **Productos vendidos totales**
```sql
SELECT COALESCE(sum(oi.quantity), 0)
FROM order_items oi
JOIN orders o ON oi.order_id = o.id
WHERE o.business_id = ? AND o.status = 'completed'
AND o.created_at >= ? AND o.created_at <= ?
```

3. **Distribución por método de pago**
```sql
SELECT payment_method, count(*), COALESCE(sum(total), 0)
FROM orders
WHERE business_id = ? AND status = 'completed'
AND created_at >= ? AND created_at <= ?
GROUP BY payment_method
```

4. **Top productos**
```sql
SELECT oi.product_name, oi.product_id,
       sum(oi.quantity) as sold,
       sum(oi.total_price) as income
FROM order_items oi
JOIN orders o ON oi.order_id = o.id
WHERE o.business_id = ? AND o.status = 'completed'
AND o.created_at >= ? AND o.created_at <= ?
GROUP BY oi.product_name, oi.product_id
ORDER BY sold DESC
LIMIT 10
```

5. **Actividad por hora**
```sql
SELECT EXTRACT(HOUR FROM created_at) as hour, count(*)
FROM orders
WHERE business_id = ? AND status = 'completed'
AND created_at >= ? AND created_at <= ?
GROUP BY hour ORDER BY hour
```

6. **Rotación de productos (alta y baja)**
```sql
-- Se cruza order_items con products para obtener cost
-- rotation = income / (cost * quantity_sold) → mayor = mejor rotación de capital
SELECT oi.product_name, oi.product_id,
       sum(oi.quantity) as sold,
       sum(oi.total_price) as income,
       p.cost, p.stock, p.image_url,
       CASE WHEN p.cost > 0 THEN sum(oi.total_price) / (p.cost * GREATEST(sum(oi.quantity), 1)) ELSE 0 END as rotation
FROM order_items oi
JOIN orders o ON oi.order_id = o.id
LEFT JOIN products p ON oi.product_id = p.id
WHERE o.business_id = ? AND o.status = 'completed'
AND o.created_at >= ? AND o.created_at <= ?
GROUP BY oi.product_name, oi.product_id, p.cost, p.stock, p.image_url
ORDER BY rotation DESC
```

7. **Mermas**
```sql
SELECT description, amount, expense_date
FROM expenses
WHERE business_id = ? AND category = 'Mermas/Pérdidas'
AND expense_date >= ? AND expense_date <= ?
ORDER BY expense_date DESC
```

8. **Inventario a costo y venta**
```sql
SELECT 
  COALESCE(SUM(COALESCE(stock, 0) * cost), 0) as inventory_at_cost,
  COALESCE(SUM(COALESCE(stock, 0) * price), 0) as inventory_at_sale
FROM products
WHERE business_id = ? AND is_active = true
```

---

### Tarea 2: Actualizar `WidgetSidebarPanel.tsx`

**Archivos:**
- Modify: `components/WidgetSidebarPanel.tsx`

**Cambios:**
1. Eliminar widgets del catálogo: `customer_demographics`, `regional_heatmap`, `customer_satisfaction`, `returning_customers`, `customers_served`
2. Agregar nuevos widgets al catálogo:
   - `high_rotation_products` - "Productos Alta Rotación" (icon: `rocket_launch`, color: `emerald`)
   - `low_rotation_products` - "Productos Baja Rotación" (icon: `trending_down`, color: `rose`)
   - `waste_data` - "Mermas" (icon: `delete_sweep`, color: `orange`)
   - `inventory_value` - "Valor del Inventario" (icon: `inventory_2`, color: `indigo`)

---

### Tarea 3: Actualizar `DashboardScreen.tsx`

**Archivos:**
- Modify: `screens/DashboardScreen.tsx`

**Paso 1: Agregar selector de periodo al header**
- Dropdown con opciones: Hoy, 7 días, 30 días, Este mes, Mes anterior
- State: `dateRange: { start: Date, end: Date }`
- Renderizar en el header, junto al botón de widgets

**Paso 2: Importar y usar `useDashboard`**
- Reemplazar todo `mockData` con datos del hook
- Pasar `dateRange` al hook

**Paso 3: Eliminar renders de widgets eliminados**
- Eliminar bloque `isWidgetActive('customers_served')`
- Eliminar bloque `isWidgetActive('returning_customers')`

**Paso 4: Renderizar widgets nuevos**

**Widget: Productos Alta Rotación** (`high_rotation_products`)
- Tabla con columnas: Producto, Qty Vendida, Ingreso, Costo, Rotación
- Barras horizontales que representan rotación visualmente
- Ordenados de mayor a menor rotación

**Widget: Productos Baja Rotación** (`low_rotation_products`)  
- Lista de 10 productos con menor rotación
- Mostrar: nombre, unidades vendidas, stock actual

**Widget: Mermas** (`waste_data`)
- Card con total de mermas del periodo
- Listado de mermas r'ecientes (description + amount + date)

**Widget: Valor del Inventario** (`inventory_value`)
- Card de 2 valores:
  - "A Costo": SUM(stock * cost) 
  - "A Venta": SUM(stock * price)
- Indicador de margen potencial: (venta - costo) / costo * 100

**Paso 5: Actualizar DEFAULT_WIDGETS**
- Quitar: `customers_served`, `returning_customers`
- Agregar: `high_rotation_products`, `inventory_value`

---

### Tarea 4: Actualizar `useSales.ts` si necesario

**Archivos:**
- Revisar: `hooks/useSales.ts`

**Descripción:**
Verificar que las queries del dashboard no dupliquen lógica que ya existe en `useSales`. Si hay funciones reutilizables, usarlas. De lo contrario, el hook `useDashboard` es independiente.

---

## Mapa de Labels de Métodos de Pago

En la DB los valores son en inglés. Mapeo:
| DB Value | Label UI |
|---|---|
| cash | Efectivo |
| card | Tarjeta |
| nequi | Nequi |
| daviplata | Daviplata |
| transfer | Transferencia |
| credit | Crédito |
| other | Otro |

---

## Secuencia de Implementación

1. ✏️ Crear `hooks/useDashboard.ts` con todas las queries
2. ✏️ Actualizar `components/WidgetSidebarPanel.tsx` (eliminar/agregar widgets del catálogo)
3. ✏️ Actualizar `screens/DashboardScreen.tsx`:
   - Agregar selector de periodo
   - Reemplazar mockData por datos reales
   - Eliminar widgets no deseados
   - Agregar widgets nuevos
4. 🧪 Verificar en navegador que todo funcione

---

## Notas Importantes

- El `business_id` viene de `useAuth().profile?.business_id`
- Los datos de inventario (costo/venta) NO dependen del periodo, son siempre el estado actual
- Las mermas se filtran por `category = 'Mermas/Pérdidas'` en la tabla `expenses`
- La "rotación" se define como: `ingreso_total / costo_total` del periodo — cuanto mayor, más rápido recupera capital
- Los 10 productos de baja rotación son aquellos con menor cantidad vendida en el periodo que tengan stock > 0
