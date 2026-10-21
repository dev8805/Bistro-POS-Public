# Escaneo de Factura - Plan de Implementación

**Objetivo:** Implementar escaneo de factura en "Registro de Inventario" que extraiga NIT, proveedor, productos, cantidades, unidades y costos vía Gemini AI, los compare con productos del negocio, y registre inventario + deudas/movimientos.

**Arquitectura:** Edge Function existente (`ocr-scan`) se modifica para extraer datos de factura. Nuevo hook `useInvoiceScan` maneja el flujo. UI en 2 pasos: Paso 1 = Vista factura con matching, Paso 2 = Datos de pago.

**Tech Stack:** React + TypeScript, Supabase (Edge Functions, DB), Gemini 2.5 Flash API

---

## FASE 1: Base de Datos - Múltiples Unidades de Compra

### Tarea 1.1: Crear tabla `product_purchase_units`

- [x] Crear migración en Supabase para tabla `product_purchase_units`

**Tabla:**
```sql
CREATE TABLE product_purchase_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  unit_name text NOT NULL,           -- "Caja", "Paquete", "Bulto", etc.
  conversion_factor numeric NOT NULL DEFAULT 1, -- cuántas unidades de venta vienen en esta unidad
  created_at timestamptz DEFAULT now()
);

-- Índice único: un producto no puede tener la misma unidad de compra repetida
CREATE UNIQUE INDEX idx_product_purchase_units_unique ON product_purchase_units(product_id, lower(unit_name));

-- RLS
ALTER TABLE product_purchase_units ENABLE ROW LEVEL SECURITY;

-- Policy: acceso via business_id del producto
CREATE POLICY "Users can manage purchase units for their products"
  ON product_purchase_units FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM products p
      JOIN profiles pr ON pr.business_id = p.business_id
      WHERE p.id = product_purchase_units.product_id
      AND pr.id = auth.uid()
    )
  );
```

**Archivos:**
- Migración vía MCP Supabase

### Tarea 1.2: Migrar datos existentes de `purchase_unit` a nueva tabla

- [x] Script de migración para mover `products.purchase_unit` + `products.conversion_factor` existentes a `product_purchase_units`

```sql
INSERT INTO product_purchase_units (product_id, unit_name, conversion_factor)
SELECT id, purchase_unit, COALESCE(conversion_factor, 1)
FROM products
WHERE purchase_unit IS NOT NULL AND purchase_unit != '';
```

> Las columnas `purchase_unit` y `conversion_factor` de `products` se dejan por ahora para no romper el modo manual. Se pueden deprecar después.

---

## FASE 2: Edge Function - Extraer datos de factura

### Tarea 2.1: Crear nueva Edge Function `invoice-scan`

- [x] Crear edge function `invoice-scan` que use Gemini para extraer datos de factura

**Prompt de Gemini:** Extrae de esta factura/recibo:
- NIT del proveedor
- Nombre del proveedor
- Lista de productos con: nombre, cantidad, unidad de compra, costo unitario, costo total por ítem
- Total de la factura

**Respuesta esperada:**
```json
{
  "supplier_nit": "123456789-0",
  "supplier_name": "Distribuidora XYZ",
  "items": [
    {
      "name": "Aceite Vegetal",
      "quantity": 2,
      "unit": "Caja",
      "unit_cost": 45000,
      "total_cost": 90000
    }
  ],
  "invoice_total": 250000
}
```

**Archivos:**
- Deploy: Edge Function `invoice-scan` vía MCP

### Tarea 2.2: Mejorar extracción de unidades de medida

- [x] Actualizar prompt de Gemini para extraer `units_per_pack` cuando la factura lo incluya
- [x] Normalizar abreviaciones de unidades (CJ→Caja, BT→Bulto, PQ→Paquete, etc.)
- [x] Detectar automáticamente cuando no se necesita conversión (unidad ya es la de venta)

**Contexto:** Las facturas de proveedores tienen 3 escenarios de unidades:

| Escenario | Ejemplo en factura | Acción |
|-----------|--------------------|--------|
| Solo U.M. | `CJ` (Caja), cant: 2 | Necesita conversión → preguntar al usuario |
| U.M. + unidades por empaque | `CJ`, cant: 2, **und x emp: 12** | Ya tiene conversión → usar `12` automáticamente |
| Ya en unidades de venta | `UND`, `LB`, `KG`, cant: 5 | No necesita conversión → `factor = 1` |

**Cambios en el prompt de Gemini:**
- Agregar instrucción para extraer `units_per_pack` si la factura trae columna de "unidades por empaque" o "contenido"
- Agregar instrucción para extraer `sale_unit_quantity` si la factura trae una columna separada con la cantidad en unidades de venta (ej: libras, kg, unidades)
- Normalizar abreviaciones comunes a nombres completos

**Abreviaciones a normalizar:**
```
UND/UN/EA/PZ → Unidad
CJ/CJA → Caja
BT/BTO/BLT → Bulto
PQ/PAQ/PKT → Paquete
LB → Libra
KG/KL → Kilogramo
LT/LTR/L → Litro
GL/GAL → Galón
GR/G → Gramo
OZ → Onza
ML → Mililitro
DOC → Docena
BLS/BOL → Bolsa
RLL/RL → Rollo
SCO/SC → Saco
BAN → Bandeja
DIS/DSP → Display
AT/ATA → Atado
TB/TBO → Tubo
TRR/TRO → Tarro
```

**Respuesta esperada actualizada:**
```json
{
  "supplier_nit": "123456789-0",
  "supplier_name": "Distribuidora XYZ",
  "items": [
    {
      "name": "Aceite Vegetal 3lt",
      "quantity": 2,
      "unit": "Caja",
      "units_per_pack": 12,
      "sale_unit_quantity": null,
      "unit_cost": 45000,
      "total_cost": 90000
    },
    {
      "name": "Arroz Diana 500g",
      "quantity": 3,
      "unit": "Bulto",
      "units_per_pack": null,
      "sale_unit_quantity": 75,
      "unit_cost": 62000,
      "total_cost": 186000
    },
    {
      "name": "Carne Res",
      "quantity": 5,
      "unit": "Libra",
      "units_per_pack": null,
      "sale_unit_quantity": null,
      "unit_cost": 14000,
      "total_cost": 70000
    }
  ],
  "invoice_total": 346000
}
```

**Cambios en `useInvoiceScan.ts`:**
- [x] Si `sale_unit_quantity` viene, usar ese valor como cantidad en unidades de venta (ignorar `units_per_pack`)
- [x] Si `units_per_pack` viene, calcular conversión automáticamente (`quantity * units_per_pack`)
- [x] Si la unidad coincide con la unidad de venta del producto (ej: ambas son "Libra"), `conversionFactor = 1`
- [x] Si ninguno aplica → preguntar al usuario (flujo actual)

**Archivos:**
- Modify: Edge Function `invoice-scan` (prompt)
- Modify: `hooks/useInvoiceScan.ts` (lógica de matching)

## FASE 3: Hook `useInvoiceScan`

### Tarea 3.1: Crear hook `useInvoiceScan.ts`

- [x] Crear `hooks/useInvoiceScan.ts`

**Responsabilidades:**
1. Llamar a edge function `invoice-scan` con la imagen
2. Recibir datos crudos de la factura
3. Hacer matching de cada producto extraído vs productos del negocio (por nombre y nicknames, igual que `usePhotoOrder.matchProducts`)
4. Exponer estado de cada ítem: matched/unmatched, cantidad editable, unidad editable, producto asignado
5. Manejar la lógica de "unidad no reconocida" → preguntar conversión
6. Guardar nickname nuevo cuando se asigna manualmente un producto
7. Guardar nueva `product_purchase_unit` cuando se confirma una unidad nueva

**Interfaces:**
```typescript
interface InvoiceRawData {
  supplier_nit: string;
  supplier_name: string;
  items: InvoiceRawItem[];
  invoice_total: number;
}

interface InvoiceRawItem {
  name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
}

interface InvoiceMatchedItem {
  ocrName: string;
  product: Product | null;       // null = no reconocido
  quantity: number;              // editable
  unit: string;                  // unidad de compra de la factura
  unitCost: number;
  totalCost: number;
  conversionFactor: number | null; // null = unidad no reconocida, pedir al usuario
  salesUnitsTotal: number | null;  // quantity * conversionFactor
  confidence: 'exact' | 'partial' | 'none';
  selected: boolean;
  needsUnitConfig: boolean;      // true si la unidad no está en product_purchase_units
}
```

**Archivos:**
- Create: `hooks/useInvoiceScan.ts`

---

## FASE 4: UI - Vista de Factura Escaneada (Paso 1)

### Tarea 4.1: Implementar pestaña "Escanear Factura" en ExpenseModal

- [x] Reemplazar el placeholder actual de `inventoryMode === 'upload'` con la UI funcional

**Flujo del Paso 1:**
1. Zona de carga de imagen (cámara/galería/pegar) — reutilizar lógica de `PhotoOrderScreen`
2. Spinner mientras Gemini procesa
3. Mostrar datos del proveedor extraído (NIT + nombre) en un header
4. Mostrar productos en formato factura legible:
   - Tabla con columnas: Producto | Cant. | Unidad | Costo Unit. | Total
   - Cada fila es editable (cantidad, producto, unidad)
   - Productos reconocidos: fondo verde claro con ícono ✓
   - Productos NO reconocidos: fondo amarillo con campo de búsqueda para asignar producto
   - Unidad NO reconocida: badge naranja con botón para configurar conversión
5. Modal inline para "unidad no reconocida": pregunta cuántas [unidad de venta] vienen en 1 [unidad de compra]
6. Al asginar producto manualmente → guardar el nombre OCR como nickname del producto
7. Botón "Siguiente →" para ir al Paso 2

**Archivos:**
- Modify: `components/ExpenseModal.tsx` (sección `inventoryMode === 'upload'`)

### Tarea 4.2: Mini-modal de configuración de unidad de compra

- [x] Crear mini-modal inline cuando una unidad no está asociada al producto

**UI:**
```
┌─────────────────────────────────────────┐
│  ⚠️ Unidad "Caja" no reconocida para   │
│     "Aceite Vegetal"                    │
│                                         │
│  ¿Cuántas [Und] vienen en 1 [Caja]?    │
│  ┌──────────┐                           │
│  │    12    │                           │
│  └──────────┘                           │
│           [Cancelar]  [Guardar]         │
└─────────────────────────────────────────┘
```

Al guardar: inserta en `product_purchase_units` y actualiza el `conversionFactor` del ítem.

### Tarea 4.3: Reconocimiento de proveedor tras escaneo

- [x] Verificar si el proveedor extraído existe en BD (por NIT, luego por nombre)
- [x] Si no existe → modal "Proveedor no reconocido" con opciones:
  - "No, continuar" → pasa al review sin proveedor (datos del escaneo conservados)
  - "Sí, crear" → formulario pre-rellenado con nombre, NIT, teléfono, dirección
- [x] Al crear proveedor → toast "Proveedor creado" → continúa al review (sin re-escanear)

**Flujo:**
```
📸 Escanear → Gemini extrae NIT + nombre
    ↓
🔍 ¿NIT o nombre coincide con proveedor existente?
    ↓
├── ✅ SÍ → Review con proveedor pre-seleccionado
└── ❌ NO → Modal "Proveedor no reconocido"
        ├── [No, continuar] → Review sin proveedor
        └── [Sí, crear] → Form pre-rellenado → Crear → Toast → Review
```

**Lógica de búsqueda:**
1. Primero busca por NIT (ignora guiones/puntos, solo compara dígitos)
2. Si no hay match por NIT, busca por nombre (case-insensitive, trim)
3. Si no hay NIT ni nombre en la factura → pasa directo al review

**Archivos:**
- Modify: `components/ExpenseModal.tsx` (InvoiceScanView)

---

## FASE 5: UI - Datos de Pago (Paso 2)

### Tarea 5.1: Implementar paso 2 de pago dentro de ExpenseModal

- [x] Crear vista de paso 2 dentro de la pestaña "Escanear Factura"

**Contenido del Paso 2:**
1. Resumen de factura: N productos, total calculado
2. Selector Contado/Crédito (misma UI que modo manual)
3. Selector de proveedor (con autocompletar, pre-rellenado con proveedor extraído + NIT)
   - Si el proveedor no existe → ofrecer crearlo automáticamente con NIT
4. Métodos de pago (si contado + caja abierta)
5. Costo total (si crédito o sin caja)
6. Botón "Registrar Inventario"

**Lógica al guardar:**
- Para CADA producto seleccionado en el paso 1:
  1. `updateProductStock(productId, salesUnitsTotal, supplierName)` → obtener `lotId`
  2. Si crédito → `createDebt()` con la suma de todos los productos
  3. Si contado + caja → `recordPurchase()` para cada método de pago
  4. Si contado sin caja → `createDebt()` con status 'paid'
- Disparar evento `inventory-updated` para cada producto

**Archivos:**
- Modify: `components/ExpenseModal.tsx`

---

## FASE 6: Crear Proveedor desde DebtsScreen (directorio)

### Tarea 6.1: Botón "Crear Proveedor" en toolbar de DebtsScreen

- [x] Agregar botón "Crear Proveedor" junto al botón "Nueva Deuda" en la toolbar

**Archivos:**
- Modify: `screens/DebtsScreen.tsx` (toolbar, línea ~440-446)

---

## FASE 7: Integración y Apodos

### Tarea 7.1: Función para agregar nickname a producto

- [x] Crear función `addNickname(productId, nickname)` en `useProducts` o en `useInvoiceScan`

```typescript
const addNickname = async (productId: string, nickname: string) => {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  const current = product.nicknames || [];
  if (current.some(n => n.toLowerCase() === nickname.toLowerCase())) return;
  await supabase
    .from('products')
    .update({ nicknames: [...current, nickname] })
    .eq('id', productId);
};
```

### Tarea 7.2: Función para agregar/consultar unidades de compra

- [x] Crear funciones CRUD para `product_purchase_units` en el hook

```typescript
const getProductPurchaseUnits = async (productId: string) => {...}
const addProductPurchaseUnit = async (productId: string, unitName: string, conversionFactor: number) => {...}
```

---

## FASE 8: Testing y Polish

### Tarea 8.1: Pruebas end-to-end

- [ ] Escanear factura con productos existentes → verificar matching
- [ ] Escanear factura con producto no reconocido → asignar manualmente → verificar nickname guardado
- [ ] Unidad no reconocida → configurar conversión → verificar `product_purchase_units`
- [ ] Flujo completo contado con caja abierta → verificar lotes + movimientos
- [ ] Flujo completo crédito → verificar lotes + deuda creada
- [ ] Crear proveedor desde DebtsScreen toolbar
- [ ] Verificar que proveedor extraído con NIT se pre-rellena correctamente
- [ ] Proveedor no reconocido → elegir "No, continuar" → verificar que va al review sin proveedor
- [ ] Proveedor no reconocido → elegir "Sí, crear" → verificar form pre-rellenado → crear → toast → review con proveedor
- [ ] Proveedor reconocido por NIT → verificar que se pre-selecciona automáticamente

### Tarea 8.2: Refactoring del modo manual

- [ ] Actualizar selector de unidad en modo manual para usar `product_purchase_units` en vez de `purchase_unit` del producto

---

## Resumen de Archivos

| Acción | Archivo |
|--------|---------|
| Create | `hooks/useInvoiceScan.ts` |
| Deploy | Edge Function `invoice-scan` |
| Migrate | Tabla `product_purchase_units` |
| Modify | `components/ExpenseModal.tsx` |
| Modify | `screens/DebtsScreen.tsx` |
| Modify | `hooks/useProducts.ts` (addNickname) |

## Orden de Implementación

```
FASE 1 (DB) → FASE 2 (Edge Fn) → FASE 3 (Hook) → FASE 4 (UI Factura) → FASE 5 (UI Pago) → FASE 6 (Proveedor) → FASE 7 (Integración) → FASE 8 (Testing)
```
