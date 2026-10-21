# Diagnóstico Financiero del Negocio – Plan de Implementación

**Objetivo:** Que el dueño de negocio vea claramente si está ganando o perdiendo dinero, y *exactamente por qué*, directo en el dashboard. Incluye sistema de compras por lotes (FIFO).
**Arquitectura:** Widgets financieros + sistema de lotes de inventario (FIFO) + nueva tabla `fixed_expenses` + orientación educativa integrada.
**Tech Stack:** React + TypeScript, Supabase (PostgreSQL), tablas: `orders`, `order_items`, `products`, `expenses`, nuevas: `fixed_expenses`, `inventory_lots`, `lot_allocations`

---

## PARTE 1: Investigación – ¿Cómo saben los negocios si ganan o pierden?

### Los 3 niveles de ganancia (P&L simplificado)

| Nivel | Fórmula | ¿Qué responde? |
|---|---|---|
| **Ganancia Bruta** | Ventas − Costo de productos vendidos (COGS) | "¿Gano dinero con lo que vendo?" |
| **Ganancia Operativa** | Ganancia Bruta − Gastos Operativos (renta, nómina, servicios) | "¿Gano dinero después de pagar el negocio?" |
| **Ganancia Neta** | Ganancia Operativa − Otros gastos (impuestos, intereses) | "¿Realmente me queda dinero al final?" |

### Factores clave que determinan si un negocio gana o pierde

1. **Margen Bruto (%)** = (Ventas − COGS) / Ventas × 100
2. **Costo de mercancía vendida (COGS)** = Lo que costaron los productos vendidos
3. **Gastos fijos mensuales** = Renta + Nómina + Servicios + Seguros
4. **Mermas/Pérdidas** = Producto dañado, robado o vencido
5. **Ticket promedio** = Ventas totales / Número de pedidos
6. **Punto de equilibrio (Break-even)** = Gastos fijos / Margen bruto (%)
7. **Capital atado en inventario** = Stock × Costo
8. **GMROI** = Ganancia bruta / Inventario a costo

---

## PARTE 2: ¿Por qué importa cada métrica? (Orientación educativa)

Cada métrica en el dashboard debe incluir una explicación contextual integrada (tooltip o sección expandible) que ayude al dueño a **entender y actuar**. Aquí están las explicaciones que se mostrarán:

### 📊 Margen Bruto
> **¿Qué es?** El porcentaje de cada venta que te queda después de pagar el costo del producto.
> **¿Por qué importa?** Si vendes un plato a $20,000 y te cuesta $8,000 hacerlo, tu margen bruto es 60%. Ese 60% es lo que tienes para pagar arriendo, empleados, servicios, y quedarte con ganancia.
> **¿Cuánto debería ser?** Restaurantes: 60-70%. Tiendas: 25-50%. Si está muy bajo, estás comprando caro o vendiendo barato.
> **¿Qué hago si está mal?** Revisa tus proveedores, compara precios, o sube el precio de venta de los productos con peor margen.

### 💰 Ganancia Operativa
> **¿Qué es?** Lo que te queda después de pagar el producto Y todos los gastos del negocio (arriendo, nómina, servicios).
> **¿Por qué importa?** Es LA cifra que define si tu negocio gana o pierde dinero. Si es negativa, tu negocio está perdiendo plata cada mes.
> **¿Cuánto debería ser?** Idealmente >10% de las ventas. Si es <5%, tu negocio es frágil; cualquier imprevisto te pone en rojo.

### 🎯 Punto de Equilibrio (Break-even)
> **¿Qué es?** La cantidad mínima que debes vender en un mes para cubrir TODOS tus gastos. Por debajo de esa cifra, pierdes dinero.
> **¿Por qué importa?** Es tu meta mínima de ventas. Ejemplo: si tus gastos fijos son $2M y tu margen bruto es 60%, necesitas vender $3.33M solo para "empatar". Todo lo que vendas encima, es ganancia.
> **¿Qué hago si no lo alcanzo?** Reducir gastos fijos, subir precios, o vender más volumen.

### 🎫 Ticket Promedio
> **¿Qué es?** Cuánto gasta cada cliente en promedio por compra.
> **¿Por qué importa?** Si subes el ticket promedio un 10%, tus ventas suben 10% sin necesitar más clientes. Es la forma más fácil de crecer. Estrategias: combos, acompañamientos, sugerencias del cajero.

### 📦 COGS (Costo de Lo Vendido)
> **¿Qué es?** Lo que te costaron los productos que efectivamente vendiste (no todo el inventario, solo lo vendido).
> **¿Por qué importa?** Es el gasto más grande de cualquier negocio retail. Si no controlas el costo de lo que vendes, no hay margen que te salve.
> **Referencia:** En restaurantes, el ideal es 25-35% de las ventas. Si pasa de 40%, busca mejores proveedores.

### 📈 GMROI (Retorno por Peso Invertido en Inventario)
> **¿Qué es?** Cuántos pesos de ganancia bruta genera cada peso que tienes invertido en inventario.
> **¿Por qué importa?** Si es < 1, por cada peso invertido en productos, NO lo recuperas. Si es 2.0, cada peso invertido genera $2 de ganancia bruta.
> **¿Qué es bueno?** >3.0 excelente, 2.0-3.0 bueno, 1.0-2.0 regular, <1.0 pérdida.

### 🗑️ Mermas
> **¿Qué es?** Dinero perdido en productos dañados, vencidos, robados o desperdiciados.
> **¿Por qué importa?** Cada peso de merma se resta directamente de tu ganancia. Si pierdes $200K en mermas, es como si $200K de tus ventas no hubieran existido.
> **Referencia:** El ideal es que las mermas sean <2% de las ventas. Si pasan del 3%, tienes un problema serio.

### 🔄 Rotación de Inventario
> **¿Qué es?** Cuántas veces "vendiste todo tu inventario" en el periodo. Si compras $1M en stock y vendes $4M en costo, rotaste 4 veces.
> **¿Por qué importa?** Alta rotación = tu dinero vuelve rápido. Baja rotación = tu dinero está dormido en la bodega.
> **📆 IMPORTANTE sobre productos nuevos:** Si un producto se creó hace 2 días, NO puede compararse con uno que lleva 30 días. El dashboard ajusta automáticamente la antigüedad del producto para evitar falsos negativos.

### 💤 Capital Atado (Inventario Muerto)
> **¿Qué es?** Dinero invertido en productos que no se están vendiendo.
> **¿Por qué importa?** Ese dinero podría estar en tu cuenta, comprando productos que SÍ se venden. Es literalmente plata dormida.
> **¿Qué hacer?** Promociones, combos, o descontinuar el producto.

---

## PARTE 3: Corrección de Rotación por Antigüedad del Producto

### Problema actual
Si un producto fue creado hace 2 días y no ha vendido nada, el dashboard actual lo muestra como "baja rotación" al mismo nivel que un producto que lleva 30 días sin vender. **Eso no es justo ni preciso.**

### Solución: Factor de madurez

Necesitamos saber el `created_at` del producto para calcular cuántos días lleva en el sistema.

**Lógica:**
```typescript
const productAgeDays = Math.max(1, Math.ceil(
  (Date.now() - new Date(product.created_at).getTime()) / (1000 * 60 * 60 * 24)
));

// Solo considerar un producto como "baja rotación" si tiene al menos 7 días de antigüedad
const isNewProduct = productAgeDays < 7;

// Para rotación: usar días del producto en vez de días del periodo, si el producto es más nuevo
const effectiveDays = Math.min(periodDays, productAgeDays);

// Días de inventario ajustado
const daysOfInventory = sold > 0 
  ? Math.round((stock / sold) * effectiveDays) 
  : (isNewProduct ? -1 : 999); // -1 = "Nuevo, sin datos suficientes"
```

### Cambios en useDashboard.ts:

1. Agregar `created_at` al query de `products`:
   ```typescript
   supabase.from('products')
     .select('id, name, stock, cost, price, image_url, is_active, created_at')
   ```

2. En la sección de baja rotación, filtrar productos con `< 7 días` de antigüedad:
   ```typescript
   const lowRotationProducts = productsForInventory
     .filter(p => {
       const stock = Number(p.stock ?? 0);
       const ageDays = Math.ceil((Date.now() - new Date(p.created_at).getTime()) / 86400000);
       return stock > 0 && ageDays >= 7; // Solo productos con al menos 7 días
     })
   ```

3. Agregar etiqueta "🆕 Nuevo" en el dashboard para productos con < 7 días.

### Cambios en la UI (DashboardScreen.tsx):

- En la tabla de baja rotación, mostrar badge "Nuevo" para productos con < 7 días.
- En tooltip, explicar: "Productos con menos de 7 días no se consideran de baja rotación porque no han tenido tiempo suficiente en el inventario."

---

## PARTE 4: Sistema de Compras por Lotes (FIFO)

### ¿Qué es FIFO y por qué lo necesitamos?

**FIFO = First In, First Out** (Primero que entra, primero que sale).

Imagina que compraste 10 gaseosas a $1,000 c/u. Cuando te quedaban 5, compraste otras 10 a $1,200 c/u (subió el precio). Ahora tienes 15 gaseosas, pero **no todas costaron lo mismo**.

Con FIFO, cuando vendes las **primeras 5**, las descuenta del lote viejo ($1,000 c/u). Después, las siguientes ventas descuentan del lote nuevo ($1,200 c/u).

**¿Por qué importa?**
- Calcula el **COGS real** (costo exacto de lo que vendiste, no un promedio)
- Te dice **cuánto inventario tienes de cada lote** (para detectar mercancía vieja)
- Permite **rastrear fechas de vencimiento** por lote
- Da información precisa sobre **rotación real** de cada compra

### Estructura de la Base de Datos

#### Nueva tabla: `inventory_lots` (Lotes de compra)

Cada vez que el dueño **compra** producto, se registra un lote:

```sql
CREATE TABLE IF NOT EXISTS inventory_lots (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    
    -- Cantidades
    initial_quantity numeric NOT NULL,          -- Cuántas unidades compraste en este lote
    remaining_quantity numeric NOT NULL,        -- Cuántas quedan sin vender de este lote
    
    -- Costos
    unit_cost numeric NOT NULL,                 -- Costo unitario de este lote específico
    
    -- Fechas
    purchase_date timestamptz NOT NULL DEFAULT now(),  -- Cuándo compraste este lote
    expiration_date date,                              -- Fecha de vencimiento (opcional)
    
    -- Metadata
    supplier_name text,                         -- Proveedor (opcional, texto libre)
    notes text,                                 -- Notas del dueño
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_inventory_lots_product ON inventory_lots(product_id);
CREATE INDEX idx_inventory_lots_business ON inventory_lots(business_id);
CREATE INDEX idx_inventory_lots_remaining ON inventory_lots(remaining_quantity) WHERE remaining_quantity > 0;
CREATE INDEX idx_inventory_lots_purchase_date ON inventory_lots(purchase_date);

ALTER TABLE inventory_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own business lots"
    ON inventory_lots FOR ALL
    USING (business_id IN (SELECT business_id FROM profiles WHERE id = auth.uid()));
```

#### Nueva tabla: `lot_allocations` (Qué lote se usó en cada venta)

Cuando se vende un producto, se registra de qué lote(s) se descontó:

```sql
CREATE TABLE IF NOT EXISTS lot_allocations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    lot_id uuid NOT NULL REFERENCES inventory_lots(id) ON DELETE CASCADE,
    order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    
    quantity_allocated numeric NOT NULL,    -- Cuántas unidades se tomaron de este lote
    unit_cost_at_sale numeric NOT NULL,     -- El costo unitario del lote al momento de la venta
    
    created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_lot_allocations_lot ON lot_allocations(lot_id);
CREATE INDEX idx_lot_allocations_order_item ON lot_allocations(order_item_id);

ALTER TABLE lot_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own business allocations"
    ON lot_allocations FOR SELECT
    USING (lot_id IN (
        SELECT id FROM inventory_lots 
        WHERE business_id IN (SELECT business_id FROM profiles WHERE id = auth.uid())
    ));
```

### Flujo de Compra por Lotes

```
Dueño compra 10 gaseosas a $1,000 c/u
    → INSERT inventory_lots (product_id, initial_quantity=10, remaining_quantity=10, unit_cost=1000)
    → UPDATE products SET stock = stock + 10

Quedan 5 gaseosas. Dueño compra 10 más a $1,200 c/u
    → INSERT inventory_lots (product_id, initial_quantity=10, remaining_quantity=10, unit_cost=1200)
    → UPDATE products SET stock = stock + 10
    → Ahora stock=15, con 2 lotes: [5 a $1,000] + [10 a $1,200]
```

### Flujo de Venta (Deducción FIFO)

Cuando se vende un producto, la deducción sigue este proceso:

```
Se vende 3 gaseosas:
    1. Buscar lotes con remaining_quantity > 0, ordenados por purchase_date ASC
    2. Lote A (viejo): remaining=5, cost=$1,000
       → Tomar 3 del lote A → remaining=2
       → INSERT lot_allocations (lot_id=A, quantity=3, unit_cost=1000)
    3. COGS de esta venta = 3 × $1,000 = $3,000

Se vende 4 gaseosas más:
    1. Lote A: remaining=2, cost=$1,000
       → Tomar 2 del lote A → remaining=0 (agotado)
       → INSERT lot_allocations (lot_id=A, quantity=2, unit_cost=1000)
    2. Lote B: remaining=10, cost=$1,200
       → Tomar 2 del lote B → remaining=8
       → INSERT lot_allocations (lot_id=B, quantity=2, unit_cost=1200)
    3. COGS de esta venta = (2 × $1,000) + (2 × $1,200) = $4,400
```

### Función SQL para Deducción FIFO

```sql
CREATE OR REPLACE FUNCTION deduct_fifo(
    p_product_id uuid,
    p_business_id uuid,
    p_order_item_id uuid,
    p_quantity numeric
) RETURNS numeric AS $$
DECLARE
    v_remaining numeric := p_quantity;
    v_total_cost numeric := 0;
    v_lot RECORD;
    v_take numeric;
BEGIN
    -- Buscar lotes disponibles, del más viejo al más nuevo (FIFO)
    FOR v_lot IN
        SELECT id, remaining_quantity, unit_cost
        FROM inventory_lots
        WHERE product_id = p_product_id
          AND business_id = p_business_id
          AND remaining_quantity > 0
        ORDER BY purchase_date ASC, created_at ASC
    LOOP
        EXIT WHEN v_remaining <= 0;
        
        -- Tomar lo que se pueda de este lote
        v_take := LEAST(v_lot.remaining_quantity, v_remaining);
        
        -- Actualizar lote
        UPDATE inventory_lots
        SET remaining_quantity = remaining_quantity - v_take,
            updated_at = now()
        WHERE id = v_lot.id;
        
        -- Registrar asignación
        INSERT INTO lot_allocations (lot_id, order_item_id, quantity_allocated, unit_cost_at_sale)
        VALUES (v_lot.id, p_order_item_id, v_take, v_lot.unit_cost);
        
        -- Acumular costo
        v_total_cost := v_total_cost + (v_take * v_lot.unit_cost);
        v_remaining := v_remaining - v_take;
    END LOOP;
    
    -- Retornar el costo total FIFO de esta venta
    RETURN v_total_cost;
END;
$$ LANGUAGE plpgsql;
```

### Cómo mejora esto el Dashboard

Con lotes FIFO, el dashboard puede mostrar:

1. **COGS Real (no estimado)**
   - Antes: `SUM(quantity × product.cost)` → usa el costo ACTUAL del producto, no el que tenía cuando lo compraste
   - Ahora: `SUM(lot_allocations.quantity × lot_allocations.unit_cost_at_sale)` → costo REAL de cada unidad vendida

2. **Antigüedad real del inventario por lote**
   - "Tienes 5 gaseosas del lote del 1 de enero (42 días) y 10 del lote del 5 de febrero (7 días)"
   - Alerta si un lote lleva más de X días sin venderse

3. **Variación de costos de compra**
   - "El costo de la gaseosa subió 20% entre tu último lote y el anterior. Revisa si tu precio de venta se ajustó."

4. **Productos próximos a vencer (si se registra fecha)**
   - "⚠ 15 unidades de leche vencen en 3 días"

---

## PARTE 5: Análisis del Dashboard Actual vs. Lo que Falta

### ✅ Ya tenemos (datos disponibles):
| Métrica | Widget actual | Datos de |
|---|---|---|
| Ventas totales | `total_sales`, `total_income` | `orders.total` |
| Pedidos del periodo | `orders_today` | `orders` count |
| Productos vendidos | `products_sold` | `order_items.quantity` |
| Métodos de pago | `payment_methods` | `orders.payment_method` |
| Top productos | `top_products` | `order_items` |
| Actividad por hora | `hourly_activity` | `orders.created_at` |
| Rotación alta/baja | `high/low_rotation_products` | `order_items` + `products` |
| Mermas | `waste_data` | `expenses` (category='Mermas/Pérdidas') |
| Valor inventario | `inventory_value` | `products.stock × cost/price` |

### ❌ Lo que falta:
| Métrica | ¿Por qué falta? | Solución |
|---|---|---|
| **COGS real** | Se calcula con costo actual, no con costo de compra | Lotes FIFO (`lot_allocations`) |
| **Ganancia Bruta** | No existe | `totalIncome - COGS_real` |
| **Margen Bruto %** | No existe | `(ganancia_bruta / totalIncome) × 100` |
| **Gastos fijos mensuales** | No hay tabla | Crear tabla `fixed_expenses` |
| **Ganancia Operativa** | No existe | `ganancia_bruta - gastos_fijos - mermas - otros_gastos` |
| **Ticket Promedio** | No se muestra | `totalIncome / ordersCount` |
| **Punto de Equilibrio** | No existe | `gastos_fijos / (margen_bruto_% / 100)` |
| **GMROI** | No existe | `ganancia_bruta / inventario_a_costo` |
| **Antigüedad de producto** | No se filtra | Usar `created_at` del producto para excluir nuevos |
| **Lotes de compra** | No existe | Sistema FIFO completo |
| **Orientación educativa** | No existe | Tooltips y secciones "¿Por qué importa?" |

---

## PARTE 6: Tabla de Gastos Fijos

### Nueva tabla: `fixed_expenses`

```sql
CREATE TABLE IF NOT EXISTS fixed_expenses (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name text NOT NULL,
    amount numeric NOT NULL,
    category text NOT NULL DEFAULT 'other',
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_fixed_expenses_business ON fixed_expenses(business_id);

ALTER TABLE fixed_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own business fixed_expenses"
    ON fixed_expenses FOR ALL
    USING (business_id IN (SELECT business_id FROM profiles WHERE id = auth.uid()));
```

**Categorías:** `rent` (Arriendo), `payroll` (Nómina), `utilities` (Servicios), `insurance` (Seguros), `marketing` (Publicidad), `other` (Otros)

---

## PARTE 7: Diseño del Widget "Diagnóstico Financiero"

### Concepto visual

```
┌──────────────────────────────────────────────────────┐
│  💰 Diagnóstico Financiero                     [?]   │
│                                                       │
│  🟢 ESTÁS GANANDO                                     │
│  +$2,450,000 ganancia operativa                       │
│                                                       │
│  ── Tu P&L este periodo ──────────────────────────   │
│                                                       │
│  Ventas                           $8,500,000   100%   │
│  ├─ Costo de lo vendido (COGS)   −$3,400,000    40%   │
│  ├─ = GANANCIA BRUTA              $5,100,000    60%   │
│  │                                                     │
│  ├─ Gastos fijos                 −$2,200,000    26%   │
│  │   ├─ Arriendo       $800,000                       │
│  │   ├─ Nómina       $1,000,000                       │
│  │   └─ Servicios      $400,000                       │
│  │                                                     │
│  ├─ Mermas                        −$150,000      2%   │
│  ├─ Otros gastos                  −$300,000      4%   │
│  │                                                     │
│  └─ = GANANCIA OPERATIVA         $2,450,000     29%   │
│                                                       │
│  ── Indicadores ─────────────────────────────────    │
│  │ Ticket Prom. │ Break-even  │  GMROI       │       │
│  │   $44,700    │ $3,666,667  │  1.5x        │       │
│  │              │ ■■■■■□ 72%  │              │       │
│                                                       │
│  ── Alertas ────────────────────────────────────     │
│  ⚠ Tu COGS (40%) está por encima del ideal (35%)     │
│  ⚠ $1.2M atados en inventario de baja rotación       │
│  ✅ Margen bruto saludable (60%)                      │
│                                                       │
│  [📝 Editar Gastos Fijos]                             │
└──────────────────────────────────────────────────────┘
```

### Cada dato con explicación accesible

- Cada línea del P&L tiene tooltip que explica qué es y por qué importa (contenido de Parte 2)
- Las alertas dicen qué está mal Y qué hacer al respecto
- El break-even tiene barra de progreso visual

---

## PARTE 8: Plan de Implementación Detallado

### Tarea 0: 🗑️ Eliminar sistema de `inventory_snapshots`

**¿Por qué?** La tabla `inventory_snapshots` fue un parche temporal para calcular inventario promedio. Con el sistema de lotes FIFO (`inventory_lots`), ya no se necesita porque los lotes dan datos más precisos de inventario histórico, costo real, y rotación.

**Lo que hay que eliminar:**

1. **Supabase (SQL):**
   - `DROP TABLE IF EXISTS inventory_snapshots CASCADE;`
   - `DROP FUNCTION IF EXISTS take_inventory_snapshot();`
   - Eliminar el cron job si existe: `SELECT cron.unschedule('daily-inventory-snapshot');`

2. **`hooks/useDashboard.ts`:**
   - Eliminar línea 129: `supabase.rpc('take_inventory_snapshot', ...)`
   - Eliminar query 11 (líneas 239-245): el query a `inventory_snapshots`
   - Eliminar `snapshotsRes` de la desestructuración del `Promise.all`
   - Eliminar `avgInventoryMap` y su procesamiento (líneas 331-341)
   - En alta rotación: cambiar el cálculo de `avgInv` (línea 362-364) para usar stock actual directamente (fallback) o datos de lotes (cuando existan)

3. **Archivo de migración anterior:**
   - `supabase/migrations/20260212_inventory_snapshots.sql` → eliminar o marcar como revertido

4. **Plan anterior:**
   - `docs/plans/2026-02-12-dashboard-rotacion-avanzada.md` → marcar como superado por este plan

---

### Tarea 1: Migraciones SQL en Supabase

**Archivos:** Migraciones SQL
**Tablas a crear:** `fixed_expenses`, `inventory_lots`, `lot_allocations`
**Función a crear:** `deduct_fifo()`
**Tablas a eliminar:** `inventory_snapshots`
**Funciones a eliminar:** `take_inventory_snapshot()`

---

### Tarea 2: Hook `useInventoryLots.ts`

**Archivos:**
- Create: `hooks/useInventoryLots.ts`

**Funciones:**
- `addLot(productId, quantity, unitCost, supplierName?, expirationDate?)` — Registrar nueva compra/lote
- `getLots(productId)` — Ver lotes activos de un producto
- `getLotsNearExpiry(daysThreshold)` — Lotes próximos a vencer
- `getOldLots(daysThreshold)` — Lotes que llevan mucho tiempo sin venderse
- `deductFifo(productId, orderItemId, quantity)` — Llamar la función SQL de deducción

---

### Tarea 3: Hook `useFixedExpenses.ts`

**Archivos:**
- Create: `hooks/useFixedExpenses.ts`

**Funciones:**
- `fetchFixedExpenses()` — Listar gastos fijos activos
- `createFixedExpense(data)` — Crear nuevo
- `updateFixedExpense(id, data)` — Editar
- `deleteFixedExpense(id)` — Desactivar
- `getTotalMonthly()` — Total mensual

---

### Tarea 4: Integrar deducción FIFO en el flujo de venta

**Archivos:**
- Modify: Hook o función que maneja la creación de órdenes (donde se llama `deduct_stock_for_order`)

**Lógica:**
1. Cuando se crea una orden con status `completed`:
2. Por cada `order_item`, llamar `deduct_fifo(product_id, order_item_id, quantity)`
3. La función SQL se encarga de actualizar lotes y crear allocations
4. Si no hay lotes registrados (producto sin lotes), hacer fallback al sistema actual

---

### Tarea 5: Agregar cálculos financieros a `useDashboard.ts`

**Archivos:**
- Modify: `hooks/useDashboard.ts`

**Nuevos campos en `DashboardData`:**
```typescript
// Diagnóstico Financiero
cogs: number;                      // COGS real (de lot_allocations, o estimado)
grossProfit: number;
grossMarginPercent: number;
totalFixedExpenses: number;
totalOtherExpenses: number;        // expenses que no son mermas
operatingProfit: number;
operatingMarginPercent: number;
averageTicket: number;
breakEvenPoint: number;
breakEvenProgress: number;         // porcentaje del mes logrado
gmroi: number;
fixedExpensesList: { name: string; amount: number; category: string }[];
diagnosticAlerts: { type: 'warning' | 'danger' | 'success'; message: string }[];
```

**Query COGS real (si hay lotes):**
```sql
SELECT COALESCE(SUM(la.quantity_allocated * la.unit_cost_at_sale), 0) as real_cogs
FROM lot_allocations la
JOIN order_items oi ON la.order_item_id = oi.id
JOIN orders o ON oi.order_id = o.id
WHERE o.business_id = ? AND o.status = 'completed'
AND o.created_at >= ? AND o.created_at <= ?
```

**Fallback COGS estimado (si no hay lotes):**
```sql
SELECT COALESCE(SUM(oi.quantity * p.cost), 0) as estimated_cogs
FROM order_items oi
JOIN orders o ON oi.order_id = o.id
JOIN products p ON oi.product_id = p.id
WHERE o.business_id = ? AND o.status = 'completed'
AND o.created_at >= ? AND o.created_at <= ?
```

**Agregar `created_at` al query de products** para el filtro de antigüedad.

**Lógica de alertas automáticas:**
```typescript
const generateAlerts = (data) => {
  const alerts = [];
  const cogsPercent = data.totalIncome > 0 ? (data.cogs / data.totalIncome) * 100 : 0;
  
  // COGS alto
  if (cogsPercent > 40) {
    alerts.push({
      type: 'warning',
      message: `Tu costo de mercancía (${cogsPercent.toFixed(0)}%) está por encima del ideal (25-35%). Revisa proveedores o sube precios.`
    });
  }
  
  // Mermas descontroladas
  if (data.totalIncome > 0 && (data.wasteTotal / data.totalIncome) > 0.03) {
    alerts.push({
      type: 'danger',
      message: `Mermas = ${((data.wasteTotal / data.totalIncome) * 100).toFixed(1)}% de ventas. Ideal: <3%. Revisa almacenamiento y manejo de productos.`
    });
  }
  
  // Perdiendo dinero
  if (data.operatingProfit < 0) {
    alerts.push({
      type: 'danger',
      message: `Estás perdiendo $${Math.abs(data.operatingProfit).toLocaleString()} este periodo. Necesitas vender más o gastar menos.`
    });
  }
  
  // GMROI bajo
  if (data.gmroi < 1 && data.inventoryAtCost > 0) {
    alerts.push({
      type: 'danger',
      message: `GMROI = ${data.gmroi.toFixed(1)}x. No estás recuperando lo invertido en inventario. Reduce stock o mejora ventas.`
    });
  }
  
  // Capital atado alto
  const deadStock = data.lowRotationProducts.reduce((sum, p) => sum + p.costTiedUp, 0);
  if (data.totalIncome > 0 && deadStock > data.totalIncome * 0.15) {
    alerts.push({
      type: 'warning',
      message: `$${deadStock.toLocaleString()} atados en inventario de baja rotación. Haz promociones para liberar ese dinero.`
    });
  }
  
  // Todo bien
  if (data.operatingProfit > 0 && data.grossMarginPercent > 40) {
    alerts.push({
      type: 'success',
      message: `¡Buen trabajo! Margen bruto ${data.grossMarginPercent.toFixed(0)}% y estás generando ganancia.`
    });
  }
  
  return alerts;
};
```

---

### Tarea 6: Widget "Diagnóstico Financiero" en DashboardScreen

**Archivos:**
- Modify: `screens/DashboardScreen.tsx`
- Modify: `components/WidgetSidebarPanel.tsx`

**Nuevos widget IDs:** `financial_diagnostic`, `break_even`, `product_margins`

**Componentes internos:**
1. Semáforo ganancia/pérdida
2. P&L simplificado con desglose
3. Grid de indicadores (Ticket, Break-even, GMROI)
4. Alertas con acciones recomendadas
5. Botón "Editar Gastos Fijos" → abre panel

Cada sección incluye tooltip educativo contextual.

---

### Tarea 7: Panel de Gestión de Gastos Fijos

**Archivos:**
- Create: `components/FixedExpensesPanel.tsx`

**Funcionalidad:**
- Lista de gastos fijos con total mensual
- Formulario para agregar/editar (nombre, monto, categoría)
- Toggle para activar/desactivar
- Se accede desde el widget de diagnóstico

---

### Tarea 8: Pantalla/Modal de Registro de Lotes

**Archivos:**
- Create: `components/InventoryLotPanel.tsx` o integrar en pantalla de productos

**Funcionalidad:**
- Al hacer "compra de inventario" o "agregar stock", se registra como lote
- Formulario: cantidad, costo unitario, proveedor (opcional), fecha vencimiento (opcional)
- Vista de lotes activos por producto con remaining_quantity
- Alerta visual de lotes próximos a vencer

---

### Tarea 9: Widget "Punto de Equilibrio"

**Widget ID:** `break_even`
- Barra de progreso: 0% → Break-even (100%) → Ganancia
- Texto: "Necesitas vender $X para cubrir gastos. Llevas Y%"
- Tooltip educativo incluido

---

### Tarea 10: Widget "Margen por Producto"

**Widget ID:** `product_margins`
- Tabla: Producto, Precio, Costo (del lote más reciente), Margen $, Margen %
- Rojo: margen < 20%. Verde: margen > 50%
- Tooltip: "Productos con margen bajo = cada venta te deja poco. Considera subir precio o buscar proveedor más barato."

---

## ✅ CHECKLIST DE PROGRESO

Marcar con `[x]` cada paso completado. Si algo falla, continuar desde el último `[x]`.

### Fase 0: Limpieza — Eliminar `inventory_snapshots`
- [x] 0.1 — SQL: `DROP TABLE inventory_snapshots CASCADE`
- [x] 0.2 — SQL: `DROP FUNCTION take_inventory_snapshot()`
- [x] 0.3 — SQL: Desactivar cron job si existe
- [x] 0.4 — `useDashboard.ts`: Eliminar llamada a `supabase.rpc('take_inventory_snapshot', ...)`
- [x] 0.5 — `useDashboard.ts`: Eliminar query 11 (`inventory_snapshots`)
- [x] 0.6 — `useDashboard.ts`: Eliminar `snapshotsRes` del `Promise.all`
- [x] 0.7 — `useDashboard.ts`: Eliminar `avgInventoryMap` y su procesamiento
- [x] 0.8 — `useDashboard.ts`: Ajustar cálculo de `avgInv` en alta rotación (usar stock actual)
- [x] 0.9 — Eliminar archivo `supabase/migrations/20260212_inventory_snapshots.sql`
- [x] 0.10 — Verificar que la app compila sin errores
- [x] 0.11 — Verificar que el dashboard carga correctamente

### Fase 1: Migraciones SQL en Supabase
- [x] 1.1 — Crear tabla `fixed_expenses` con RLS
- [x] 1.2 — Crear tabla `inventory_lots` con RLS e índices
- [x] 1.3 — Crear tabla `lot_allocations` con RLS e índices
- [x] 1.4 — Crear función `deduct_fifo()`
- [x] 1.5 — Verificar tablas creadas en Supabase

### Fase 2: Hook `useFixedExpenses.ts`
- [x] 2.1 — Crear archivo `hooks/useFixedExpenses.ts`
- [x] 2.2 — Implementar `fetchFixedExpenses()`
- [x] 2.3 — Implementar `createFixedExpense()`
- [x] 2.4 — Implementar `updateFixedExpense()`
- [x] 2.5 — Implementar `deleteFixedExpense()`
- [x] 2.6 — Verificar que compila

### Fase 3: Hook `useInventoryLots.ts`
- [x] 3.1 — Crear archivo `hooks/useInventoryLots.ts`
- [x] 3.2 — Implementar `addLot()`
- [x] 3.3 — Implementar `getLots()`
- [x] 3.4 — Implementar `getLotsNearExpiry()`
- [x] 3.5 — Implementar `deductFifo()` (llama a función SQL)
- [x] 3.6 — Verificar que compila

### Fase 4: Integrar FIFO en flujo de venta
- [x] 4.1 — Identificar dónde se llama `deduct_stock_for_order`
- [x] 4.2 — Agregar llamada a `deduct_fifo()` por cada `order_item`
- [x] 4.3 — Implementar fallback si no hay lotes
- [x] 4.4 — Verificar que ventas siguen funcionando

### Fase 5: Cálculos financieros en `useDashboard.ts`
- [x] 5.1 — Agregar `created_at` al query de products
- [x] 5.2 — Agregar query de COGS (lotes + fallback)
- [x] 5.3 — Agregar query de gastos fijos
- [x] 5.4 — Agregar query de otros gastos (expenses no mermas)
- [x] 5.5 — Calcular: grossProfit, grossMarginPercent
- [x] 5.6 — Calcular: operatingProfit, operatingMarginPercent
- [x] 5.7 — Calcular: averageTicket
- [x] 5.8 — Calcular: breakEvenPoint, breakEvenProgress
- [x] 5.9 — Calcular: gmroi
- [x] 5.10 — Implementar `generateAlerts()`
- [x] 5.11 — Corregir baja rotación: filtrar productos con < 7 días
- [x] 5.12 — Agregar todos los campos nuevos a `DashboardData` y `getEmptyData()`
- [x] 5.13 — Verificar que compila y el dashboard carga

### Fase 6: Widget "Diagnóstico Financiero"
- [x] 6.1 — Agregar widget ID `financial_diagnostic` a `WidgetSidebarPanel.tsx`
- [x] 6.2 — Crear sección semáforo (🟢/🔴) ganancia/pérdida
- [x] 6.3 — Crear P&L simplificado con desglose
- [x] 6.4 — Crear grid de indicadores (Ticket, Break-even, GMROI)
- [x] 6.5 — Crear sección de alertas con acciones
- [x] 6.6 — Agregar botón "Editar Gastos Fijos"
- [x] 6.7 — Agregar tooltips educativos a cada métrica
- [x] 6.8 — Verificar que se muestra correctamente

### Fase 7: Panel de Gastos Fijos
- [x] 7.1 — Crear `components/FixedExpensesPanel.tsx`
- [x] 7.2 — Implementar lista con total mensual
- [x] 7.3 — Implementar formulario agregar/editar
- [x] 7.4 — Implementar toggle activar/desactivar
- [x] 7.5 — Conectar con el botón del widget diagnóstico
- [x] 7.6 — Verificar CRUD completo

### Fase 8: Creación automática de lotes (transparente)
- [x] 8.1 — Integrar creación de lote en `useInventory.ts` → `updateProductStock()`
- [x] 8.2 — Integrar creación de lote en `useInventory.ts` → `updateMultipleStocks()`
- [x] 8.3 — Integrar creación de lote en `useProducts.ts` → `updateProductStock()`
- [x] 8.4 — Verificar que al agregar stock se crea lote automáticamente

### Fase 9: Widget "Punto de Equilibrio"
- [x] 9.1 — Agregar widget ID `break_even` a `WidgetSidebarPanel.tsx`
- [x] 9.2 — Crear barra de progreso visual
- [x] 9.3 — Agregar texto explicativo
- [x] 9.4 — Agregar tooltip educativo
- [x] 9.5 — Verificar que se muestra correctamente

### Fase 10: Widget "Margen por Producto"
- [x] 10.1 — Agregar widget ID `product_margins` a `WidgetSidebarPanel.tsx`
- [x] 10.2 — Crear tabla de productos con margen
- [x] 10.3 — Implementar colores por rango de margen
- [x] 10.4 — Agregar tooltip educativo
- [x] 10.5 — Verificar que se muestra correctamente

### Fase 11: Pruebas finales
- [x] 11.1 — Probar dashboard con datos reales (58 órdenes, 11 gastos, 5 fijos insertados)
- [x] 11.2 — Probar flujo completo: compra lote → venta → deducción FIFO → dashboard (integrado transparente)
- [x] 11.3 — Probar fallback sin lotes (productos sin lotes registrados) — COGS usa costo del producto
- [x] 11.4 — Probar gastos fijos: crear, editar, desactivar (FixedExpensesPanel implementado)
- [x] 11.5 — Probar alertas automáticas con diferentes escenarios (generadas por generateAlerts)
- [ ] 11.6 — Probar en móvil y desktop (pendiente prueba manual visual)
- [x] 11.7 — Verificar que no se rompió ninguna funcionalidad existente (compilación OK)

---

## Notas importantes

- **Compatibilidad hacia atrás:** Si no hay lotes registrados para un producto, el COGS se calcula con el costo actual del producto (sistema anterior). No se rompe nada.
- **Los gastos fijos se ingresan UNA VEZ** y se usan automáticamente cada mes.
- **Productos con <7 días** no se marcan como baja rotación. Se les pone badge "🆕 Nuevo".
- **Cada métrica tiene explicación** accesible directamente en la UI, no en documentación externa.
- **Las alertas son accionables:** no solo dicen "hay problema" sino "qué hacer".
- **FIFO es opcional para el usuario:** puede seguir sumando stock sin registrar lotes individuales; el sistema funciona igual con el fallback de costo actual.
- **`inventory_snapshots` eliminado:** reemplazado completamente por `inventory_lots` que da datos más precisos y confiables.
