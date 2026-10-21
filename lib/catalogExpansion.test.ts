import { describe, it, expect } from 'vitest';
import { expandProductsForPOS } from './catalogExpansion';
import { Product } from '../types';

describe('expandProductsForPOS', () => {
    it('deja intacto un producto sin presentaciones adicionales', () => {
        const products: Product[] = [
            {
                id: 'prod-1',
                name: 'Coca Cola 400ml',
                price: 2500,
                image: '',
                category: 'Bebidas',
                unit: 'Unidad',
                stock: 20
            }
        ];

        const expanded = expandProductsForPOS(products);
        expect(expanded).toHaveLength(1);
        expect(expanded[0].name).toBe('Coca Cola 400ml');
        expect(expanded[0].price).toBe(2500);
        expect(expanded[0].is_secondary).toBeUndefined();
    });

    it('desdobla un producto con 2 presentaciones en 3 tarjetas', () => {
        const products: Product[] = [
            {
                id: 'egg-1',
                name: 'Huevo AA',
                price: 700,
                image: 'huevo.png',
                category: 'Abarrotes',
                unit: 'Unidad',
                stock: 60,
                sale_presentations: [
                    {
                        id: 'pres-1',
                        unit_name: 'Media Cubeta',
                        conversion_factor: 15,
                        price: 9500,
                        barcode: '770111',
                        image_url: 'media_cubeta.png'
                    },
                    {
                        id: 'pres-2',
                        unit_name: 'Cubeta',
                        conversion_factor: 30,
                        price: 18000,
                        barcode: '770222',
                        image_url: 'cubeta.png'
                    }
                ]
            }
        ];

        const expanded = expandProductsForPOS(products);
        expect(expanded).toHaveLength(3);

        // Tarjeta Base
        expect(expanded[0].id).toBe('egg-1');
        expect(expanded[0].name).toBe('Huevo AA (Unidad)');
        expect(expanded[0].price).toBe(700);
        expect(expanded[0].stock).toBe(60);
        expect(expanded[0].conversion_factor).toBe(1);

        // Presentación 1
        expect(expanded[1].id).toContain('pres-1');
        expect(expanded[1].parent_product_id).toBe('egg-1');
        expect(expanded[1].name).toBe('Huevo AA (Media Cubeta)');
        expect(expanded[1].price).toBe(9500);
        expect(expanded[1].barcode).toBe('770111');
        expect(expanded[1].image).toBe('media_cubeta.png');
        expect(expanded[1].stock).toBe(4); // 60 / 15 = 4
        expect(expanded[1].conversion_factor).toBe(15);
        expect(expanded[1].is_secondary).toBe(true);

        // Presentación 2
        expect(expanded[2].id).toContain('pres-2');
        expect(expanded[2].parent_product_id).toBe('egg-1');
        expect(expanded[2].name).toBe('Huevo AA (Cubeta)');
        expect(expanded[2].price).toBe(18000);
        expect(expanded[2].barcode).toBe('770222');
        expect(expanded[2].image).toBe('cubeta.png');
        expect(expanded[2].stock).toBe(2); // 60 / 30 = 2
        expect(expanded[2].conversion_factor).toBe(30);
        expect(expanded[2].is_secondary).toBe(true);
    });

    it('maneja presentación con nombre completo como Lucky Mora y Lucky Strike Cigarrillo Mora X10', () => {
        const products: Product[] = [
            {
                id: '291d6f98-9340-47eb-a6d5-44a7a315e2ce',
                name: 'Lucky Mora | Unidad Suelta',
                price: 1200,
                image: '',
                category: 'Tabacos',
                unit: 'Unidad',
                stock: 50,
                sale_presentations: [
                    {
                        id: 'pres_1788557457154_kyu14d',
                        unit_name: 'Lucky Strike Cigarrillo Mora X10 Unidades',
                        conversion_factor: 10,
                        price: 12000,
                        barcode: '7702303778886',
                        nicknames: ['cajetilla 10', 'media lucky']
                    }
                ]
            }
        ];

        const expanded = expandProductsForPOS(products);
        expect(expanded).toHaveLength(2);

        // Tarjeta Base: no duplica (Unidad) porque ya contiene "Unidad Suelta"
        expect(expanded[0].id).toBe('291d6f98-9340-47eb-a6d5-44a7a315e2ce');
        expect(expanded[0].name).toBe('Lucky Mora | Unidad Suelta');
        expect(expanded[0].price).toBe(1200);
        expect(expanded[0].stock).toBe(50);
        expect(expanded[0].is_secondary).toBe(false);

        // Tarjeta Presentación: usa el nombre completo limpio y calcula stock
        expect(expanded[1].id).toContain('pres_1788557457154_kyu14d');
        expect(expanded[1].parent_product_id).toBe('291d6f98-9340-47eb-a6d5-44a7a315e2ce');
        expect(expanded[1].name).toBe('Lucky Strike Cigarrillo Mora X10 Unidades');
        expect(expanded[1].price).toBe(12000);
        expect(expanded[1].barcode).toBe('7702303778886');
        expect(expanded[1].stock).toBe(5); // 50 / 10 = 5
        expect(expanded[1].conversion_factor).toBe(10);
        expect(expanded[1].unit).toBe('Unidad');
        expect(expanded[1].presentation_unit).toBe('Lucky Strike Cigarrillo Mora X10 Unidades');
        expect(expanded[1].is_secondary).toBe(true);
        expect(expanded[1].nicknames).toContain('cajetilla 10');
        expect(expanded[1].nicknames).toContain('media lucky');
        expect(expanded[1].nicknames).toContain('Lucky Strike Cigarrillo Mora X10 Unidades');
        expect(expanded[1].nicknames).toContain('Lucky Mora | Unidad Suelta');
        expect(expanded[1].nicknames).toContain('7702303778886');
    });
});
