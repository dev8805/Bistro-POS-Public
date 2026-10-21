# Dashboard: Rotación Avanzada e Inventario Promedio - Plan de Implementación

**Objetivo:** Implementar un sistema profesional de cálculo de rotación de inventario (basado en stock promedio histórico) y agregar explicaciones educativas en el dashboard para facilitar la toma de decisiones.
**Arquitectura:** Tabla `inventory_snapshots` para guardar historial diario de stock + Función SQL programada (cron) para llenar esta tabla automáticamente cada noche. Frontend actualizado para usar estos datos históricos.
**Tech Stack:** Supabase (PostgreSQL, pg_cron/Edge Functions), React, Tailwind CSS (Tooltips).

---

## Estrategia de Implementación

Para calcular la rotación real como las grandes empresas, necesitamos saber cuánto inventario tenías *ayer*, *anteayer*, y *el mes pasado*, no solo hoy.

### 1. Backend: Historial de Inventario
Actualmente solo tenemos el stock *actual*. Crearemos una tabla `inventory_snapshots` que guardará una "foto" diaria del inventario.
- **Tabla:** `inventory_snapshots` (id, date, product_id, stock, cost, price).
- **Función Automática:** Un trigger o cron job que corre cada noche a las 00:00 y guarda el estado de todos los productos activos.

### 2. Frontend: Métricas Reales
Actualizaremos el dashboard para usar fórmulas profesionales:
- **Rotación Real:** `Ventas Totales ($) / Inventario Promedio ($)`
- **Días de Inventario:** `(Inventario Promedio / Costo de Ventas) * 365`

### 3. Educación en UI (Tooltips)
Agregaremos íconos de información (?) que al pasar el mouse expliquen en lenguaje sencillo qué significa cada métrica, sin tecnicismos financieros complejos.

---

## Tareas Detalladas

### Tarea 1: Base de Datos - Historial (Snapshot)

**Archivos:**
- Create: `supabase/migrations/20260212_inventory_snapshots.sql`

**Descripción:**
Crear la tabla y la función para tomar la foto del inventario.

**Paso 1: SQL para Tabla y Función**
```sql
-- 1. Tabla para guardar la historia diaria
CREATE TABLE IF NOT EXISTS inventory_snapshots (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
    business_id uuid REFERENCES businesses(id),
    product_id uuid REFERENCES products(id),
    stock_quantity numeric NOT NULL,
    unit_cost numeric NOT NULL,
    unit_price numeric NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Índice para búsquedas rápidas por fecha y producto
CREATE INDEX idx_inventory_snapshots_date ON inventory_snapshots(snapshot_date);
CREATE INDEX idx_inventory_snapshots_product ON inventory_snapshots(product_id);

-- 2. Función para tomar la foto (se ejecutará cada noche)
CREATE OR REPLACE FUNCTION take_inventory_snapshot()
RETURNS void AS $$
BEGIN
    INSERT INTO inventory_snapshots (snapshot_date, business_id, product_id, stock_quantity, unit_cost, unit_price)
    SELECT 
        CURRENT_DATE,
        business_id,
        id,
        stock,
        cost,
        price
    FROM products
    WHERE is_active = true AND stock IS NOT NULL;
END;
$$ LANGUAGE plpgsql;
```

**Paso 2: Automatización (Cron)**
*Nota: Si Supabase Pro no está disponible para `pg_cron`, usaremos una Edge Function programada o un "Lazy Trigger" en el primer login del día.*
Recomendación: Usar **pg_cron** si es posible:
```sql
-- Ejecutar cada día a las 11:59 PM
SELECT cron.schedule('daily-inventory-snapshot', '59 23 * * *', 'SELECT take_inventory_snapshot()');
```

---

### Tarea 2: Componente Educativo (Tooltip)

**Archivos:**
- Create: `components/InfoTooltip.tsx`

**Descripción:**
Componente reutilizable que muestra un ícono de interrogación o info, y al hacer hover muestra un globo con texto explicativo.

**Implementación:**
- Props: `text` (contenido), `position` (top/bottom/left/right).
- Estilo: Ícono discreto (gris suave), tooltip con fondo oscuro y texto blanco, con flecha indicadora.
- Uso: `<InfoTooltip text="La rotación indica cuántas veces vendiste todo tu inventario en el año. Más alto es mejor." />`

---

### Tarea 3: Actualizar `DashboardScreen.tsx` e `InfoCards`

**Archivos:**
- Modify: `screens/DashboardScreen.tsx`
- Modify: `components/WidgetSidebarPanel.tsx` (descripciones)

**Descripción:**
Integrar los tooltips en los títulos de las tarjetas y actualizar las descripciones para que sean más amigables.

**Cambios en UI:**
1.  **Tarjeta Alta Rotación:**
    - Título: "Alta Rotación" + `<InfoTooltip text="Productos estrella. Se venden rápido y recuperas tu inversión velozmente. ¡Nunca te quedes sin stock de estos!" />`
2.  **Tarjeta Baja Rotación:**
    - Título: "Baja Rotación" + `<InfoTooltip text="Productos dormidos. Llevan mucho tiempo en bodega sin venderse. Considera hacer promociones para liberar ese dinero." />`
3.  **Valor del Inventario:**
    - Título: "Valor del Inventario" + `<InfoTooltip text="Dinero que tienes congelado en productos guardados. Lo ideal es mantenerlo bajo sin afectar las ventas." />`

---

## Explicación de Métricas (Para el Usuario)

Aquí te explico qué significan estos conceptos de forma sencilla "de negocio":

**1. Rotación de Inventario (El "Velocímetro" de tu Dinero)**
*   **Técnico:** Costo de Ventas / Inventario Promedio.
*   **Sencillo:** Imagina que tienes $1 millón invertido en carne. Si al final del mes vendiste $4 millones en carne, significa que tu dinero "dio la vuelta" 4 veces.
*   **Por qué importa:** Entre más vueltas de tu dinero, más ganas con la misma inversión. Tener stock quieto es tener billetes debajo del colchón perdiendo valor.

**2. Días de Inventario (Días Calle)**
*   **Técnico:** 365 / Rotación.
*   **Sencillo:** ¿Cuántos días tarda un producto en venderse desde que llega a tu bodega hasta que se va?
*   **Meta:** Para perecederos (frutas, verduras), quieres que sea de 1 a 3 días máximo. Para secos (arroz, latas), puede ser más, pero idealmente menos de 30 días.

**3. GMROI (Rentabilidad Real)**
*   **Sencillo:** ¿Cuánta ganancia bruta me deja cada dólar que invierto en inventario?
*   Una Coca-Cola deja poco margen (ganas poco por botella), pero se vende muchísimas veces (alta rotación). Eso es bueno.
*   Un vino caro deja mucho margen, pero se vende una vez al mes. Eso también puede ser bueno.
*   El peligro es: **Bajo Margen Y Baja Rotación**. A esos productos hay que eliminarlos.

---

## Próximos Pasos para Ejecutar

1.  Confirmar si tienes acceso a `pg_cron` en tu proyecto Supabase o si prefieres una solución manual/automática alternativa.
2.  Crear la tabla de historial (`inventory_snapshots`).
3.  Implementar los Tooltips en el Dashboard actual.
