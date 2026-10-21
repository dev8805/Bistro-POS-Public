# [Invoice UOM Conversion] Plan de Implementación

**Objetivo:** Conectar el motor OCR de IA con la nueva tabla `product_purchase_units` para hacer conversión automática de cantidades (Catch Weight), y mostrar el resultado en la UI de revisión sin fricción, según requerimiento ("Entran X Lb por un costo de Y").
**Arquitectura:** Gemini extraerá el nombre literal de la unidad que encuentre en la foto de la factura (ej. "Caja"). El front-end mapeará textualmente (insensible a mayúsculas) con el historial pre-cargado del producto (`product.product_purchase_units`) y aplicará el `conversion_factor` en la UI.
**Tech Stack:** React, Supabase Edge Functions (Gemini), TailwindCSS.

*Nota técnica: El plan ha sido sincronizado con el schema actual de Supabase. La tabla `product_purchase_units` existe correctamente con las columnas `unit_name` (text) y `conversion_factor` (numeric).*

---

## Tareas

### Tarea 1: Edge Function (Actualizar Prompt de Extracción OCR)

**Archivos:**
- Modify: `supabase/functions/scan-invoice/index.ts`

**Paso 1: Implementación mínima (Prompt)**
Se actualizará el JSON esperado en Gemini agregando el campo `ocr_unit` para forzar a que extraiga literales (como KI, Und, Caja).
```typescript
const prompt = `
... [mantener prompt original de formato latino] ...
Dentro de 'tableData', cada objeto debe tener:
- description: string
- quantity: number
- unitCost: number
- total: number
- ocr_unit: string | null (Extrae la palabra/abreviatura literal de la unidad de medida que aparezca explícitamente en la factura junto a la cantidad o al nombre, por ejemplo "Caja", "KI", "Atado". Si no existe ninguna mención a la unidad en la fila, retorna null).
`;
```

### Tarea 2: Carga de Datos Relacional (`useProducts`) y Tipados

**Archivos:**
- Modify: `hooks/useProducts.ts`
- Modify: `types/supabase.ts` (o archivo de interfaces de producto)

**Paso 1: Fetch Relacional en Supabase**
Ampliar la carga de productos de tu catálogo para traer sus unidades y usarlas de forma síncrona en la UI de revisión.
```typescript
// Modificar el query donde cargas los products:
const { data, error } = await supabase
    .from('products')
    .select(`
        *,
        product_purchase_units(unit_name, conversion_factor)
    `)
    // ...
```

### Tarea 3: Modificar `InvoiceReviewPanel` para Cálculo y Fallback UI

**Archivos:**
- Modify: `components/expense/InvoiceReviewPanel.tsx`

**Paso 1: Cálculo Inteligente del Factor**
Hacer match entre la unidad extraída y la registrada. 
```tsx
const matchUOM = (ocrUnit: string, productUnits: any[]) => {
   if (!ocrUnit || !productUnits) return null;
   return productUnits.find(u => u.unit_name.toLowerCase() === ocrUnit.toLowerCase()) || null;
}

// Lógica derivada a aplicar en render:
// Si el usuario seleccionó una unidad manualmente en el fallback, usar esa. Si no, usar la extraída por OCR si coincide.
const selectedUnitName = item.manualFallbackUnit || item.ocr_unit;
const matchedDbUnit = matchUOM(selectedUnitName, assignedProduct.product_purchase_units);
const factor = matchedDbUnit ? matchedDbUnit.conversion_factor : 1;
const finalQuantity = item.quantity * factor;
const finalUnitCost = item.unitCost / factor;
const saleUnitLabel = assignedProduct.unit || 'Und';
```

**Paso 2: Mostrar el Badge Dinámico (Opción B) y Select Fallback**
Si la IA extrajo `ocr_unit` pero no hizo match automático con las unidades del producto, mostraremos un `<select>` nativo para que el usuario pueda vincular la unidad manualmente con las registradas.
```tsx
{/* Badge de conversión exitosa (Opción B) */}
{matchedDbUnit && (
    <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/40 rounded-lg px-2.5 py-2 mt-2">
        <span className="material-symbols-outlined text-emerald-500 text-[15px] shrink-0">inventory_2</span>
        <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300 leading-snug">
            📦 Entran {finalQuantity} {saleUnitLabel} a un costo de ${Math.round(finalUnitCost).toLocaleString('es-CO')} c/u.
        </p>
    </div>
)}

{/* Fallback Select nativo si hay OCR Unit pero no hizo match */}
{item.ocr_unit && !matchedDbUnit && assignedProduct.product_purchase_units?.length > 0 && (
    <div className="mt-2 flex flex-col gap-1">
        <label className="text-[11px] text-orange-600 dark:text-orange-400 font-medium">
            Facturado en "{item.ocr_unit}". Por favor selecciona una unidad equivalente:
        </label>
        <select 
            className="text-xs bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded p-1"
            value={item.manualFallbackUnit || ''}
            onChange={(e) => updateItem(index, { manualFallbackUnit: e.target.value })}
        >
            <option value="">-- Seleccionar --</option>
            {assignedProduct.product_purchase_units.map(u => (
                <option key={u.unit_name} value={u.unit_name}>{u.unit_name}</option>
            ))}
        </select>
    </div>
)}
```

**Paso 3: Envío hacia la Integración**
Envío del resultado convertido con su valor neto final al guardar:
```tsx
items.push({
    product: assignedProduct,
    quantity: String(finalQuantity),
    measureUnit: saleUnitLabel,
    unitCost: String(finalUnitCost),
    extraFields: { ...item.extraFields, original_ocr_unit: item.ocr_unit }
});
```
