import { SalePresentation } from '../types';

export interface BaseProductLike {
    id: string;
    name: string;
    price: number;
    unit?: string;
    stock?: number;
    barcode?: string;
    image?: string;
    image_url?: string;
    sale_presentations?: SalePresentation[];
    parent_product_id?: string;
    is_secondary?: boolean;
    conversion_factor?: number;
    presentation_unit?: string;
    [key: string]: any;
}

/**
 * Expande la lista de productos para el catálogo del Punto de Venta (POS).
 * - Si un producto tiene solo 1 presentación (caso estándar), se devuelve intacto sin alterar su nombre.
 * - Si tiene 1 o más presentaciones adicionales, genera:
 *   1. Tarjeta base: con sufijo de su unidad base (ej: "Huevo AA (Unidad)").
 *   2. Tarjetas de presentaciones: con sufijo de la presentación (ej: "Huevo AA (Cubeta)"),
 *      su propio precio, código de barras, foto y stock proporcional.
 */
export function expandProductsForPOS<T extends BaseProductLike>(products: T[]): T[] {
    const result: T[] = [];

    for (const product of products) {
        const presentations = product.sale_presentations;
        if (!presentations || !Array.isArray(presentations) || presentations.length === 0) {
            result.push(product);
            continue;
        }

        // 1. Tarjeta Base
        const baseUnitLabel = product.unit ? product.unit : 'Unidad';
        const alreadyHasUnit = product.name.toLowerCase().includes(baseUnitLabel.toLowerCase());
        const baseCard: T = {
            ...product,
            name: alreadyHasUnit ? product.name : `${product.name} (${baseUnitLabel})`,
            is_secondary: false,
            parent_product_id: product.id,
            conversion_factor: 1,
        };
        result.push(baseCard);

        // 2. Tarjetas de Presentaciones Adicionales
        for (const pres of presentations) {
            if (!pres.unit_name) continue;
            const factor = Number(pres.conversion_factor) || 1;
            const calculatedStock = product.stock !== undefined && product.stock !== null
                ? Math.floor(product.stock / factor)
                : undefined;

            // Si el nombre de la presentación ya es un nombre completo (ej: "Lucky Strike Cigarrillo Mora X10 Unidades"
            // y el producto es "Lucky Mora | Unidad Suelta"), lo usamos directamente.
            // Si es un nombre de unidad/paquete (ej: "Cubeta x 30", "Six Pack"), construimos "Producto (Presentación)".
            const presNameLower = pres.unit_name.toLowerCase();
            const prodNameLower = product.name.toLowerCase();
            const firstWord = prodNameLower.split(/[\s|]+/)[0];
            const nameToUse = (firstWord && firstWord.length > 2 && presNameLower.includes(firstWord))
                ? pres.unit_name
                : `${product.name} (${pres.unit_name})`;

            const presCard: T = {
                ...product,
                id: `${product.id}__pres_${pres.id || pres.unit_name.replace(/\s+/g, '_')}`,
                name: nameToUse,
                price: Number(pres.price) || 0,
                barcode: pres.barcode || undefined,
                image: pres.image_url || product.image,
                image_url: pres.image_url || (product as any).image_url,
                stock: calculatedStock,
                unit: 'Unidad',
                presentation_unit: pres.unit_name,
                is_secondary: true,
                parent_product_id: product.id,
                conversion_factor: factor,
                nicknames: [
                    ...(pres.nicknames || []),
                    ...((product as any).nicknames || []),
                    pres.unit_name,
                    product.name,
                    ...(pres.barcode ? [pres.barcode] : [])
                ].filter(Boolean)
            };
            result.push(presCard);
        }
    }

    return result;
}
