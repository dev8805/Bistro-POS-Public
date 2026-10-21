import { supabase } from './supabase';

/**
 * Identificador de tipo de producto usado en la UI del selector de tipo.
 * - 'sale'      → type='simple' + is_for_sale=true  (Producto para venta)
 * - 'insumo'    → type='simple' + is_for_sale=false (Ingrediente, no se vende)
 * - 'processed' → type='processed'                  (Receta con ingredientes)
 *
 * La clave 'insumo' se conserva como valor técnico: en la UI el tipo se llama
 * "Ingrediente" desde el rename, pero renombrar la clave obligaría a tocar la
 * bandera de sessionStorage, los tabs y los mapas de warnings sin beneficio
 * para el usuario.
 */
export type ProductTypeKey = 'sale' | 'insumo' | 'processed';

export interface TypeChangeResult {
    success: boolean;
    error?: string;
}

/**
 * Retorna la lista de consecuencias que se le muestran al usuario en el modal
 * de advertencia antes de confirmar un cambio de tipo de producto.
 *
 * Cada string es una viñeta que aparecerá en el modal. Si la dirección
 * (from, to) no tiene mapeo, retorna array vacío.
 */
export const getTypeChangeWarnings = (from: ProductTypeKey, to: ProductTypeKey): string[] => {
    const key = `${from}_to_${to}`;
    const warnings: Record<string, string[]> = {
        sale_to_processed: [
            'Se eliminará el stock actual',
            'Se eliminarán los lotes de inventario (FIFO)',
            'Se eliminarán las unidades de compra',
            'Se desvinculará el código de barras',
            'Las ventas anteriores NO se pierden',
        ],
        sale_to_insumo: [
            'Se ocultarán precio, código de barras y apodos',
            'El precio pasará a $0',
            'Se conserva stock, costo, categoría e imagen',
        ],
        processed_to_sale: [
            'Se eliminarán los ingredientes de la receta',
            'Deberás asignar stock manualmente',
            'Las ventas anteriores NO se pierden',
        ],
        processed_to_insumo: [
            'Se eliminarán los ingredientes de la receta',
            'Deberás asignar stock manualmente',
            'Se ocultarán precio, código de barras y apodos',
        ],
        insumo_to_sale: [
            'Se habilitarán los campos de precio, código de barras y apodos',
            'El stock se conserva',
            'Impacto mínimo sobre tus datos',
        ],
        insumo_to_processed: [
            'Se eliminará el stock actual',
            'Se eliminarán los lotes de inventario',
            'Se eliminarán las unidades de compra',
            'Se redirigirá al formulario de receta',
        ],
    };
    return warnings[key] ?? [];
};

/**
 * Ejecuta el cambio de tipo de un producto en Supabase:
 * 1. Actualiza los campos del producto (type, is_for_sale, y limpia campos que no aplican)
 * 2. Elimina datos huérfanos según la dirección del cambio:
 *    - Destino Receta → borrar inventory_lots y product_purchase_units
 *    - Origen Receta  → borrar product_ingredients
 *
 * Las ventas históricas (order_items) NUNCA se tocan.
 *
 * Los errores en las eliminaciones de datos huérfanos NO bloquean: el cambio de tipo
 * en products se considera exitoso aunque una limpieza secundaria falle. Solo el
 * update de products puede provocar un retorno con success:false.
 */
export const executeTypeChange = async (
    productId: string,
    fromType: ProductTypeKey,
    toType: ProductTypeKey,
): Promise<TypeChangeResult> => {
    if (fromType === toType) {
        return { success: true };
    }

    // 1. Campos a actualizar en products según el tipo destino
    const productUpdate: Record<string, unknown> = {};

    if (toType === 'processed') {
        productUpdate.type = 'processed';
        productUpdate.is_for_sale = true;
        productUpdate.stock = null;
        productUpdate.barcode = null;
        productUpdate.nicknames = [];
    } else if (toType === 'insumo') {
        productUpdate.type = 'simple';
        productUpdate.is_for_sale = false;
        productUpdate.price = 0;
        productUpdate.barcode = null;
        productUpdate.nicknames = [];
    } else {
        // toType === 'sale'
        productUpdate.type = 'simple';
        productUpdate.is_for_sale = true;
    }

    // 2. UPDATE del producto
    const { error: updateError } = await supabase
        .from('products')
        .update(productUpdate)
        .eq('id', productId);

    if (updateError) {
        return { success: false, error: updateError.message };
    }

    // 3. Limpieza de datos huérfanos (best-effort, no bloquea el resultado)
    try {
        if (toType === 'processed') {
            // Al pasar a receta, ya no hay stock propio ni compras a granel
            await supabase.from('inventory_lots').delete().eq('product_id', productId);
            await supabase.from('product_purchase_units').delete().eq('product_id', productId);
        }

        if (fromType === 'processed') {
            // Al dejar de ser receta, los ingredientes ya no aplican
            await supabase.from('product_ingredients').delete().eq('product_id', productId);
        }
    } catch (err) {
        console.warn('[executeTypeChange] Error limpiando datos huérfanos:', err);
        // No cambiamos el success: el cambio de tipo se aplicó en products
    }

    return { success: true };
};

/**
 * Deriva el ProductTypeKey a partir de los campos crudos del producto en la BD.
 * Útil para inicializar el selector con el tipo actual del producto.
 */
export const getProductTypeKey = (type: string, isForSale: boolean): ProductTypeKey => {
    if (type === 'processed') return 'processed';
    if (isForSale) return 'sale';
    return 'insumo';
};
