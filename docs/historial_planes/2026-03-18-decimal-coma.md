# Fix Separador Decimal (Coma en vez de Punto) - Plan de Implementación

**Objetivo:** Unificar el separador decimal a coma (`,`) en toda la app: modales de cantidad, carrito, inventario, facturas y tickets.
**Arquitectura:** Crear una función utilitaria `formatQty(n)` en `lib/formatters.ts` que convierte decimales a coma. Reutilizarla en todos los puntos de visualización. En los inputs/numpads, interceptar `.` y convertirlo a `,`.
**Tech Stack:** React, TypeScript

---

## Tarea 1: Crear función utilitaria `formatQty`

**Archivos:**
- Modify: `lib/formatters.ts`

**Paso 1:** Agregar función:
```ts
export const formatQty = (n: number): string => {
    const rounded = Math.round(n * 100) / 100;
    return rounded.toString().replace('.', ',');
};
```

**Razón:** Centralizar la conversión de punto a coma para no repetir `.replace('.', ',')` en 10+ lugares.

---

## Tarea 2: Actualizar `PriceInputModal.tsx` (Modal de Cantidad para ventas)

**Archivos:**
- Modify: `components/PriceInputModal.tsx`

**Cambios:**
1. **Línea 116** - Botón del numpad: cambiar `{ label: '.', value: '.' }` → `{ label: ',', value: ',' }`
2. **Línea 91-95** - `handleNumpadPress` caso `.`: cambiar para que use `,` como separador visual:
   - Al presionar `,` (o `.`): si ya existe `,` en `qtyStr`, ignorar. Si no, agregar `,`.
3. **Línea 172-177** - `onChange` del input desktop: permitir `,` además de `.`, siempre almacenar como `,`
4. **`parseQty`** (línea 68-72): ya convierte `,` → `.` correctamente. ✅ No requiere cambio.

---

## Tarea 3: Actualizar `CartItemRow.tsx` (Carrito de compra)

**Archivos:**
- Modify: `components/CartItemRow.tsx`

**Cambios:**
1. **Línea 68** - Cantidad en header: `x{Math.round(item.quantity * 100) / 100}` → `x{formatQty(item.quantity)}`
2. **Línea 153** - Cantidad en controles expandidos: `{Math.round(item.quantity * 100) / 100}` → `{formatQty(item.quantity)}`
3. Importar `formatQty` de `lib/formatters`

---

## Tarea 4: Actualizar `SalesScreen.tsx` (Historial de Facturas)

**Archivos:**
- Modify: `screens/SalesScreen.tsx`

**Cambios:**
1. **Línea 410** - Cantidad del item: `{Math.round(item.quantity * 100) / 100}` → `{formatQty(item.quantity)}`
2. Importar `formatQty` de `lib/formatters`

---

## Tarea 5: Actualizar `InventoryScreen.tsx` (Conteo de Stock)

**Archivos:**
- Modify: `screens/InventoryScreen.tsx`

**Cambios:**
1. **Línea 133** - `handleNumpadPress`: cambiar `'.'` por `','` en la validación de duplicados
2. **Línea 279** - Resumen de unidades: `{Number(summary.totalDiffUnits.toFixed(2))}` → `{formatQty(summary.totalDiffUnits)}`
3. **Línea 475** - Stock en sistema (móvil productos): `{product.stock ?? 0}` → `{formatQty(product.stock ?? 0)}`
4. **Línea 488** - Botón conteo físico (móvil): `{counted ?? ...}` → mostrar con coma si tiene decimal
5. **Línea 501** - Diferencia ajuste (móvil): `{diff > 0 ? '+' : ''}{diff}` → usar `formatQty`
6. **Línea 533** - Stock en sistema (desktop): mismo tratamiento
7. **Línea 553** - Diferencia (desktop): mismo tratamiento
8. **Líneas 627, 640, 647, 665, 685** - Ingredientes: mismo patrón
9. **Línea 748** - Numpad valor mostrado: si `numpadValue` tiene `.`, mostrarlo como `,`
10. Importar `formatQty` de `lib/formatters`

---

## Tarea 6: Actualizar `ReceiptThermalPDF.tsx` (PDF del Ticket)

**Archivos:**
- Modify: `components/ReceiptThermalPDF.tsx`

**Cambios:**
1. **Línea 177** - `qty` ya calculado con `Math.round(...)`: Reemplazar uso en línea 185:
   `<Text ...>{qty}</Text>` → `<Text ...>{qty.toString().replace('.', ',')}</Text>`

---

## Tarea 7: Actualizar `thermalPrinterService.ts` (Impresión Directa ESC/POS)

**Archivos:**
- Modify: `lib/thermalPrinterService.ts`

**Cambios:**
1. **Línea 283-286** - Después de calcular `qty`, crear `qtyFormatted = qty.toString().replace('.', ',')`.  
   Usarlo en la interpolación del `qtyUnit`:
   ```ts
   const qtyFormatted = qty.toString().replace('.', ',');
   const qtyUnit = is58 && qtyFormatted.length > 1 ? `${qtyFormatted}${unitAbbr}` : `${qtyFormatted} ${unitAbbr}`;
   ```

---

## Tarea 8: Actualizar `InventoryNumpad.tsx` (Teclado numérico de inventario)

**Archivos:**
- Modify: `components/InventoryNumpad.tsx`

**Cambios:**
1. Cambiar el botón de `.` para que muestre `,` y envíe `,` como valor.

---

## Resumen de archivos afectados
| Archivo | Tipo de cambio |
|---|---|
| `lib/formatters.ts` | Agregar `formatQty()` |
| `components/PriceInputModal.tsx` | Numpad `,` + input `,` |
| `components/CartItemRow.tsx` | Mostrar qty con coma |
| `screens/SalesScreen.tsx` | Mostrar qty con coma |
| `screens/InventoryScreen.tsx` | Numpad `,` + stocks con coma |
| `components/ReceiptThermalPDF.tsx` | qty con coma en PDF |
| `lib/thermalPrinterService.ts` | qty con coma en impresión |
| `components/InventoryNumpad.tsx` | Botón `,` en numpad |
