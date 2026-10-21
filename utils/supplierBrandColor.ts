import { supabase } from '../lib/supabase';

/**
 * Invoca la edge function `get-brand-colors` para asignar un color distintivo
 * a un proveedor nuevo y guarda el color en la tabla `suppliers`.
 *
 * Se ejecuta de forma tolerante a fallos (try/catch silencioso) para no
 * interrumpir nunca los flujos de guardado principales.
 */
export async function assignSupplierBrandColor(
    supplierId: string,
    supplierName: string,
    existingColors: string[] = []
): Promise<string | null> {
    if (!supplierId || !supplierName?.trim()) return null;

    try {
        if (!supabase?.functions?.invoke) return null;

        const cleanColors = existingColors.filter(Boolean);
        const { data: colorData } = await supabase.functions.invoke('get-brand-colors', {
            body: {
                suppliers: [{ id: supplierId, name: supplierName.trim() }],
                existingColors: cleanColors,
            },
        });

        const assignedColor = colorData?.colors?.[0]?.color;
        if (assignedColor) {
            await supabase
                .from('suppliers')
                .update({ color: assignedColor })
                .eq('id', supplierId);

            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('suppliers-updated'));
            }
            return assignedColor;
        }
    } catch (err) {
        console.error('[assignSupplierBrandColor] Error al obtener o guardar el color de marca:', err);
    }
    return null;
}
