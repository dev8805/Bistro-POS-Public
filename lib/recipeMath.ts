// Utilidades de receta: conversión de unidades (espeja la función SQL convert_units)
// y cálculo de "producible" (cuántas unidades se pueden preparar con el stock de insumos).

const DEFAULT_POUND_IN_GRAMS = 453.592; // libra internacional (avoirdupois)

/**
 * Convierte una cantidad de uso (en la unidad de la receta) a la unidad de inventario del insumo.
 * Mantiene la misma lógica que la función SQL `convert_units(..., p_pound_in_grams)`.
 *
 * @param poundInGrams gramos por libra del negocio (ej. 500 en Colombia). Default: libra internacional.
 */
export const convertUsageToInventoryQty = (
    usageQty: number,
    usageUnit: string,
    invUnit: string,
    poundInGrams: number = DEFAULT_POUND_IN_GRAMS
): number => {
    const u = (usageUnit || '').toLowerCase().trim();
    const i = (invUnit || '').toLowerCase().trim();

    if (u === i) return usageQty;

    const pound = poundInGrams || DEFAULT_POUND_IN_GRAMS;

    // Gramos por 1 unidad (peso). null si no es unidad de peso.
    const gramsPerUnit = (unit: string): number | null => {
        if (['gramos', 'gr', 'g'].includes(unit)) return 1;
        if (['kilogramos', 'kg', 'kilos'].includes(unit)) return 1000;
        if (['libras', 'lb', 'lbs'].includes(unit)) return pound;
        if (['arrobas', '@', 'arroba'].includes(unit)) return 25 * pound; // 1 arroba = 25 libras
        return null;
    };

    // Mililitros por 1 unidad (volumen). null si no es unidad de volumen.
    const mlPerUnit = (unit: string): number | null => {
        if (['mililitros', 'ml'].includes(unit)) return 1;
        if (['litros', 'l', 'lt'].includes(unit)) return 1000;
        return null;
    };

    const fromG = gramsPerUnit(u);
    const toG = gramsPerUnit(i);
    if (fromG != null && toG != null) return (usageQty * fromG) / toG;

    const fromMl = mlPerUnit(u);
    const toMl = mlPerUnit(i);
    if (fromMl != null && toMl != null) return (usageQty * fromMl) / toMl;

    return usageQty; // sin conversión posible
};

export interface RecipeLine {
    ingredientId: string;
    quantity: number;
    unit: string;
}

export interface IngredientStock {
    stock: number | null;
    unit: string;
}

/**
 * Cuántas unidades del producto con receta se pueden preparar con el stock actual de insumos.
 * - Devuelve `null` cuando no hay receta (costo manual): no se puede calcular producible.
 * - Devuelve 0 cuando falta stock de algún insumo.
 */
export const computeProducible = (
    recipe: RecipeLine[] | undefined | null,
    ingredientsById: Record<string, IngredientStock>,
    poundInGrams: number = DEFAULT_POUND_IN_GRAMS
): number | null => {
    if (!recipe || recipe.length === 0) return null;

    let min = Infinity;
    for (const line of recipe) {
        const ing = ingredientsById[line.ingredientId];
        if (!ing || ing.stock == null) return 0;
        const perUnit = convertUsageToInventoryQty(line.quantity, line.unit, ing.unit, poundInGrams);
        if (perUnit <= 0) continue;
        min = Math.min(min, Math.floor(ing.stock / perUnit));
    }
    return min === Infinity ? null : Math.max(0, min);
};
