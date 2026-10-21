# Documento de Diseño: Rotación de Inventario por Proveedor

## Overview

Este diseño detalla cómo migrar el diagnóstico de salud de stock desde umbrales por categoría hacia umbrales por proveedor, permitiendo al tendero:

1. Asignar un proveedor default a cada producto.
2. Configurar umbrales de rotación (`optimal_min`, `optimal_max`, `alert_days`) por proveedor.
3. Vincular productos a proveedores de forma manual (SupplierSettingsModal).
4. Filtrar la vista de catálogo por proveedor con un selector prominente.
5. Ver el diagnóstico de salud desglosado por proveedor cuando hay múltiples fuentes de lotes.

La configuración existente en `categories` se preserva en la BD pero deja de usarse para el cálculo de salud.

### Decisiones de diseño clave

| Decisión | Justificación |
|----------|---------------|
| Umbrales en `suppliers` (no en tabla intermedia) | Simplifica queries — un proveedor tiene UNA configuración global para todos sus productos |
| `supplier_product_config` solo para vinculación manual | Evita duplicar las 3 fuentes de asociación en una sola tabla; las otras 2 se derivan en runtime |
| Diagnóstico usa SOLO umbrales de proveedor | Modelo mental simple: "mi proveedor viene cada X días" |
| Valores por defecto 7/12/3 hardcodeados | Coinciden con los defaults actuales de categoría, cero fricción en migración |
| Desglose solo cuando hay lotes de múltiples proveedores | No agregar complejidad visual cuando no es necesaria |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ProductsScreen                            │
│  ┌───────────────┐  ┌──────────────────────────────────┐    │
│  │ SupplierPicker│  │ Filtros existentes (búsqueda,    │    │
│  │ (selector     │  │ categoría, salud, orden)          │    │
│  │  prominente)  │  └──────────────────────────────────┘    │
│  └───────┬───────┘                                          │
│          │ selectedSupplierId                               │
│          ▼                                                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ getInventoryDaysLabel(product, supplierThresholds)    │   │
│  │   - Usa umbrales del proveedor (o defaults 7/12/3)   │   │
│  │   - Desglose si lotes de múltiples proveedores       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────┐  ┌────────────────────────────┐   │
│  │ SupplierSettings    │  │ CategorySettingsModal       │   │
│  │ Modal (umbrales +   │  │ (DEPRECADO - solo lectura) │   │
│  │ vincular productos) │  └────────────────────────────┘   │
│  └─────────────────────┘                                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  SimpleProductScreen                         │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Dropdown de proveedor default                        │    │
│  │ (después de categoría, antes de barcode)             │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     Supabase (BD)                            │
│                                                             │
│  suppliers                                                  │
│    + optimal_min (int, nullable)                            │
│    + optimal_max (int, nullable)                            │
│    + alert_days  (int, nullable)                            │
│                                                             │
│  products                                                   │
│    + default_supplier_id (uuid, nullable, FK suppliers)     │
│                                                             │
│  supplier_product_config (NUEVA)                            │
│    id, supplier_id, product_id, created_at                  │
│    UNIQUE(supplier_id, product_id)                          │
└─────────────────────────────────────────────────────────────┘
```

### Flujo de datos del diagnóstico

```
1. ProductsScreen monta → fetch suppliers (useSuppliers)
2. ProductsScreen monta → fetch inventory_lots (supplierMap + lotesPorProveedor)
3. ProductsScreen monta → fetch supplier_product_config (vinculaciones manuales)
4. Usuario selecciona proveedor → filtrar productos por 3 fuentes
5. Para cada producto visible:
   a. Determinar proveedor(es) con lotes activos
   b. Si 1 proveedor → diagnóstico consolidado con SUS umbrales
   c. Si N proveedores → desglose con umbrales de CADA uno
   d. Si 0 proveedores (sin lotes) → usar umbrales del default_supplier_id o defaults 7/12/3
```

## Components and Interfaces

### 1. SupplierPicker (componente nuevo)

Selector prominente de proveedor para ProductsScreen, reemplaza al actual filtro por `searchType === 'supplier'`.

```typescript
interface SupplierPickerProps {
  suppliers: Supplier[];
  selectedSupplierId: string | null;
  onSelect: (supplierId: string | null) => void;
  loading?: boolean;
}
```

**Ubicación**: `components/SupplierPicker.tsx`

**Comportamiento**:
- Se renderiza como una fila horizontal de "chips" con el nombre y color de cada proveedor.
- Al tocar un chip, se selecciona (highlight con borde amber). Tocar de nuevo deselecciona.
- En móvil (<430px), scroll horizontal con snap.
- Incluye un chip "Todos" al inicio para deseleccionar.

### 2. SupplierSettingsModal (componente nuevo)

Modal para configurar umbrales de rotación de un proveedor y vincular productos manualmente.

```typescript
interface SupplierSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier: Supplier | null;
  onSuccess: () => void;
}
```

**Ubicación**: `components/SupplierSettingsModal.tsx`

**Secciones del modal**:
1. Header con nombre del proveedor
2. Campos: `optimal_min`, `optimal_max`, `alert_days` (misma UI que CategorySettingsModal)
3. Sección "Agregar productos": input buscador + resultados en dropdown
4. Footer: Cancelar / Guardar

**Validaciones**:
- `optimal_min > optimal_max` → error inline
- `alert_days < 1` → error inline

### 3. SupplierDropdown (SimpleProductScreen)

Dropdown de selección de proveedor default integrado en el formulario de producto.

```typescript
// No es un componente separado — se integra inline en SimpleProductScreen
// usando el mismo patrón que categoryId (select nativo con estilos Tailwind)
```

### 4. getInventoryDaysLabel (refactorización)

Función existente que se refactoriza para recibir umbrales de proveedor en vez de categoría.

```typescript
// Firma actual (implícita via product.categoryObj):
// getInventoryDaysLabel(product: ProductData) → HealthInfo | null

// Firma nueva:
interface SupplierThresholds {
  optimal_min: number;
  optimal_max: number;
  alert_days: number;
}

const DEFAULT_THRESHOLDS: SupplierThresholds = {
  optimal_min: 7,
  optimal_max: 12,
  alert_days: 3,
};

// La función acepta umbrales explícitos en vez de leerlos del categoryObj
getInventoryDaysLabel(product: ProductData, thresholds: SupplierThresholds) → HealthInfo | null
```

### 5. useSupplierProductConfig (hook nuevo)

Hook para gestionar vinculaciones manuales producto-proveedor.

```typescript
interface SupplierProductLink {
  id: string;
  supplier_id: string;
  product_id: string;
  created_at: string;
}

function useSupplierProductConfig(businessId: string | undefined) {
  return {
    links: SupplierProductLink[];
    loading: boolean;
    addLink: (supplierId: string, productId: string) => Promise<void>;
    removeLink: (id: string) => Promise<void>;
    getProductsForSupplier: (supplierId: string) => string[]; // product_ids
    getSuppliersForProduct: (productId: string) => string[]; // supplier_ids
  };
}
```

**Ubicación**: `hooks/useSupplierProductConfig.ts`

### 6. useSuppliers — extensión

Se extiende la interfaz `Supplier` existente con los campos de umbrales:

```typescript
export interface Supplier {
  // ... campos existentes
  optimal_min?: number | null;
  optimal_max?: number | null;
  alert_days?: number | null;
}
```

La función `updateSupplier` ya soporta campos arbitrarios, solo se agrega al tipo.

### 7. Lógica de asociación producto-proveedor

```typescript
// Determina si un producto pertenece a un proveedor dado
function isProductOfSupplier(
  productId: string,
  supplierId: string,
  supplierName: string,
  defaultSupplierId: string | null,
  lotSupplierMap: Record<string, string[]>,  // productId → [supplier_names normalized]
  manualLinks: string[]                       // product_ids vinculados manualmente
): boolean {
  // Fuente 1: default_supplier_id
  if (defaultSupplierId === supplierId) return true;
  // Fuente 2: lotes activos con supplier_name match (case-insensitive, trimmed)
  const lotSuppliers = lotSupplierMap[productId] || [];
  if (lotSuppliers.includes(supplierName.trim().toLowerCase())) return true;
  // Fuente 3: supplier_product_config
  if (manualLinks.includes(productId)) return true;
  return false;
}
```

## Data Models

### Tabla `suppliers` — columnas nuevas

```sql
ALTER TABLE suppliers
  ADD COLUMN optimal_min INTEGER,
  ADD COLUMN optimal_max INTEGER,
  ADD COLUMN alert_days INTEGER;
```

Todas nullable. Cuando son `null` se usan los defaults (7, 12, 3).

### Tabla `products` — columna nueva

```sql
ALTER TABLE products
  ADD COLUMN default_supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL;

CREATE INDEX idx_products_default_supplier_id ON products(default_supplier_id);
```

### Tabla `supplier_product_config` — nueva

```sql
CREATE TABLE supplier_product_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_supplier_product_config_unique
  ON supplier_product_config(supplier_id, product_id);

CREATE INDEX idx_supplier_product_config_product
  ON supplier_product_config(product_id);
```

### RLS para `supplier_product_config`

```sql
ALTER TABLE supplier_product_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage supplier_product_config for their business"
ON supplier_product_config FOR ALL
USING (
  supplier_id IN (
    SELECT id FROM suppliers WHERE business_id IN (
      SELECT business_id FROM profiles WHERE id = auth.uid()
    )
  )
)
WITH CHECK (
  supplier_id IN (
    SELECT id FROM suppliers WHERE business_id IN (
      SELECT business_id FROM profiles WHERE id = auth.uid()
    )
  )
);
```

### Modelo de datos en el frontend

```typescript
// Extensión de ProductData en ProductsScreen
interface ProductData {
  // ... campos existentes
  defaultSupplierId?: string | null;
}

// Mapa de lotes activos por proveedor por producto
// productId → { supplierName → remainingQuantity }
type LotsBySupplierMap = Record<string, Record<string, number>>;
```

### Diagrama ER (relaciones nuevas)

```
┌──────────┐       ┌──────────────────────┐       ┌──────────┐
│suppliers │←──FK──│supplier_product_config│──FK──→│ products │
│          │       │                      │       │          │
│ id       │       │ supplier_id          │       │ id       │
│ name     │       │ product_id           │       │ name     │
│ optimal_ │       │ created_at           │       │ default_ │
│  min/max │       └──────────────────────┘       │  supplier│
│ alert_   │                                      │  _id ──→ │
│  days    │←─────────────────────────────────────│(FK)      │
└──────────┘                                      └──────────┘
         ↑
         │ supplier_name (text match, no FK)
┌────────┴───────┐
│ inventory_lots │
│ supplier_name  │
│ product_id     │
│ remaining_qty  │
└────────────────┘
```

## Error Handling

| Escenario | Comportamiento |
|-----------|---------------|
| Red caída al guardar umbrales | Toast error + conserva valores editados en el modal |
| `optimal_min > optimal_max` | Error inline, botón Guardar deshabilitado |
| `alert_days < 1` | Error inline |
| Proveedor eliminado que era default | `ON DELETE SET NULL` — producto pierde default sin crash |
| Producto eliminado con vinculaciones | `ON DELETE CASCADE` — registros en `supplier_product_config` se borran |
| `supplier_product_config` duplicado | Constraint UNIQUE previene, upsert en el hook ignora silenciosamente |
| Producto sin proveedor ni lotes ni vinculación | Usa defaults 7/12/3 sin error |
| Fetch de `supplier_product_config` falla | Se degrada a filtrar solo por `default_supplier_id` + lotes; toast warning |

## Correctness Properties

*Una propiedad es una característica o comportamiento que debe cumplirse en todas las ejecuciones válidas de un sistema — esencialmente, una declaración formal sobre lo que el sistema debe hacer. Las propiedades sirven como puente entre especificaciones legibles y garantías de correctitud verificables por máquina.*

### Property 1: Diagnóstico usa exclusivamente umbrales de proveedor

*Para cualquier* producto con stock > 0 y velocidad de ventas > 0, el diagnóstico de salud resultante DEBE ser idéntico al calculado con los umbrales del proveedor correspondiente (o defaults 7/12/3) e independiente de cualquier valor en `categoryObj.optimal_min/max/alert_days`.

**Validates: Requirements 7.1, 7.2**

### Property 2: Asociación producto-proveedor es la unión de tres fuentes

*Para cualquier* producto y cualquier proveedor, el producto pertenece al proveedor si y solo si se cumple al menos UNA de: (1) `product.default_supplier_id === supplier.id`, (2) existe un lote activo cuyo `supplier_name` normalizado coincide con `supplier.name` normalizado, (3) existe un registro en `supplier_product_config` con ese par (supplier_id, product_id).

**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

### Property 3: Normalización de nombres es consistente

*Para cualquier* par de strings representando nombres de proveedor, la función de normalización (trim + toLowerCase) produce el mismo resultado sin importar el orden de aplicación, y dos nombres que difieren solo en case/espacios laterales se consideran iguales.

**Validates: Requirements 5.5**

### Property 4: Clasificación de salud es mutuamente excluyente y exhaustiva

*Para cualquier* combinación válida de (stock > 0, velocity > 0, thresholds con alert_days < optimal_min < optimal_max), el diagnóstico debe retornar exactamente UNO de: `critico`, `reordenar`, `optimo`, `lento`. Los rangos no se solapan y cubren todos los valores posibles de `days`.

**Validates: Requirements 4.3, 4.4**

### Property 5: Desglose correcto según cantidad de proveedores con lotes

*Para cualquier* producto con lotes activos, si los lotes pertenecen a exactamente 1 proveedor, el diagnóstico se muestra consolidado (1 línea). Si pertenecen a N > 1 proveedores, se muestran N líneas independientes.

**Validates: Requirements 4.1, 4.2**

### Property 6: Filtrado por proveedor seleccionado incluye exactamente los productos asociados

*Para cualquier* selección de proveedor en ProductsScreen, la lista filtrada contiene exactamente los productos que satisfacen `isProductOfSupplier` para ese proveedor, sin omisiones ni inclusiones espurias.

**Validates: Requirements 3.2, 5.1**

## Testing Strategy

### Property-Based Testing (PBT)

Se utilizará `fast-check` (librería PBT para TypeScript) con mínimo 100 iteraciones por propiedad.

**Funciones candidatas a PBT** (lógica pura, input variado):
- `getInventoryDaysLabel(product, thresholds)` → Properties 1, 4
- `isProductOfSupplier(...)` → Properties 2, 6
- `normalizeSupplierName(name)` → Property 3
- Lógica de desglose (dado un mapa de lotes → N líneas) → Property 5

**Configuración**:
- Cada test referencia su propiedad: `// Feature: rotacion-inventario-proveedor, Property N: ...`
- Mínimo 100 iteraciones

### Unit Tests (ejemplo y edge cases)

- SupplierSettingsModal: validación `optimal_min > optimal_max`
- SupplierSettingsModal: validación `alert_days < 1`
- SimpleProductScreen: preseleccionar proveedor en edición
- Producto sin ventas → estado "Sin ventas aún" (no cambia con proveedor)
- Producto con stock negativo → estado "Agotado" (invariante)
- Proveedor sin umbrales configurados → usa defaults

### Integration Tests

- Crear vinculación manual → aparece en filtro
- Eliminar proveedor → `default_supplier_id` se vuelve null
- Guardar umbrales → se reflejan en diagnóstico sin recargar
- RLS: usuario de otro negocio no puede ver `supplier_product_config` ajenas
