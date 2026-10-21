# Fix Inventory Screen Decimals Plan

**Objetivo:** Corregir la visualización de decimales excesivos en la pantalla de inventario (columna Ajuste) y permitir hasta 2 decimales en el resumen de unidades, sin afectar otras funcionalidades.
**Arquitectura:** Implementar una función de utilidad segura para redondeo y aplicarla en los cálculos de diferencias de stock.
**Tech Stack:** React, TypeScript.

### Tarea 1: Implementar redondeo en InventoryScreen.tsx

**Archivos:**
- Modify: `screens/InventoryScreen.tsx`

**Paso 1: Crear función helper y actualizar cálculos**
- Agregar función `roundStock(value: number): number` dentro del componente o fuera.
- Modificar `getDifference` para usar `roundStock`.
- Actualizar el cálculo de `summary` para usar `roundStock` al calcular diferencias.
- Actualizar la visualización de `totalDiffUnits` en el resumen para mostrar hasta 2 decimales (reemplazar `toFixed(0)` con lógica flexible).

**Código de cambios:**
1.  **Helper:**
    ```typescript
    const roundStock = (num: number) => Math.round(num * 100) / 100;
    ```
2.  **getDifference:**
    ```typescript
    const getDifference = (systemStock: number, countedStock: number | null | undefined): number | null => {
        if (countedStock === null || countedStock === undefined) return null;
        return roundStock(countedStock - systemStock);
    };
    ```
3.  **Summary Calculation:**
    En `summary` useMemo loop for products and ingredients:
    ```typescript
    // Antes
    // const diff = counted - p.stock;
    
    // Después
    const diff = roundStock(counted - p.stock);
    ```
4.  **Summary Display:**
    ```typescript
    // Antes
    // {summary.totalDiffUnits.toFixed(0)}
    
    // Después
    // {Number(summary.totalDiffUnits.toFixed(2))}
    ```

**Paso 2: Verificar**
- Revisar que `diff` ya no tenga decimales largos (ej. -0.45 en vez de -0.449999...).
- Verificar que el resumen muestre decimales si es necesario.
