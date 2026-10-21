import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ScanReviewStep } from './ScanReviewStep';
import type { ScanReviewLineView, ScanReviewStepProps } from './ScanReviewStep';
import type { ScanLine } from '../../lib/invoiceScan/types';

/**
 * Pruebas por ejemplo del Panel_Revision del Escaneo_Unificado.
 * Requisitos: 6.9, 6.10, 10.1, 10.2, 10.3, 10.4.
 */

const PRODUCT_NAME = 'Bonyurt Chocokrispis';

const buildLine = (overrides: Partial<ScanLine> = {}): ScanLine => ({
    id: 'line-1',
    ocrName: 'BONYURT CHOCO',
    ocrUnit: 'CJ',
    ocrQuantity: 2,
    netTotal: 26560,
    globalDiscountShare: 0,
    needsReview: false,
    decision: { kind: 'linked', productId: 'prod-1', addNickname: true },
    unitCase: 'known',
    conversionFactor: 1,
    createPurchaseUnit: false,
    quantity: 2,
    lineTotal: 26560,
    newPrice: null,
    barcode: '',
    ...overrides,
});

const buildView = (overrides: Partial<ScanReviewLineView> = {}): ScanReviewLineView => ({
    index: 0,
    line: buildLine(),
    productName: PRODUCT_NAME,
    saleUnit: 'Und',
    // Mismo costo que el derivado (26.560 / 2): sin variación frente al catálogo.
    catalogCost: 13280,
    catalogPrice: 18000,
    ...overrides,
});

const renderStep = (overrides: Partial<ScanReviewStepProps> = {}) => {
    const props: ScanReviewStepProps = {
        lines: [buildView()],
        onUpdateLine: vi.fn(),
        onRemoveLine: vi.fn(),
        onConfirm: vi.fn(),
        onRescan: vi.fn(),
        onClose: vi.fn(),
        ...overrides,
    };
    const utils = render(<ScanReviewStep {...props} />);
    return { ...utils, props };
};

const getQuantityInput = () => screen.getByLabelText(`Cantidad de ${PRODUCT_NAME} en Und`);
const getCostInput = () => screen.getByLabelText(`Costo por Und de ${PRODUCT_NAME}`);
const getPriceInput = () => screen.getByLabelText(`Precio de venta de ${PRODUCT_NAME}`);
const getRemoveButton = () => screen.getByRole('button', { name: `Quitar ${PRODUCT_NAME} de la compra` });

describe('ScanReviewStep', () => {
    it('muestra los cinco datos de la línea: producto, Nombre_OCR, cantidad, costo y total', () => {
        renderStep();

        const card = within(screen.getByRole('listitem'));
        expect(card.getByText(PRODUCT_NAME)).toBeInTheDocument();
        expect(card.getByText('"BONYURT CHOCO"')).toBeInTheDocument();
        expect(getQuantityInput()).toHaveValue(2);
        expect(getCostInput()).toHaveValue(13280);
        expect(card.getByText('Total')).toBeInTheDocument();
        expect(card.getByText('$26.560')).toBeInTheDocument();
    });

    it('deriva el costo por Unidad_Venta con hasta 2 decimales', () => {
        renderStep({
            lines: [buildView({ line: buildLine({ quantity: 3, lineTotal: 10000 }) })],
        });

        // 10.000 / 3 = 3333,333… ⇒ 3333,33
        expect(getCostInput()).toHaveValue(3333.33);
    });

    it('emite onUpdateLine con la cantidad y el total recalculado al editar la cantidad', () => {
        const onUpdateLine = vi.fn();
        renderStep({ onUpdateLine });

        fireEvent.change(getQuantityInput(), { target: { value: '3' } });

        // El costo por Unidad_Venta (13.280) se conserva y el total lo sigue.
        expect(onUpdateLine).toHaveBeenCalledWith(0, { quantity: 3, lineTotal: 39840 });
    });

    it('emite onUpdateLine con el total recalculado al editar el costo', () => {
        const onUpdateLine = vi.fn();
        renderStep({ onUpdateLine });

        fireEvent.change(getCostInput(), { target: { value: '15000' } });

        expect(onUpdateLine).toHaveBeenCalledWith(0, { lineTotal: 30000 });
    });

    it('emite onRemoveLine al quitar la línea, con clic y con Enter', () => {
        const onRemoveLine = vi.fn();
        renderStep({ onRemoveLine });

        fireEvent.click(getRemoveButton());
        expect(onRemoveLine).toHaveBeenCalledWith(0);

        fireEvent.keyDown(getRemoveButton(), { key: 'Enter' });
        expect(onRemoveLine).toHaveBeenCalledTimes(2);
    });

    it('oculta la variación de costo cuando el costo coincide con el del catálogo', () => {
        renderStep();

        expect(screen.queryByText(/Costo subió/)).not.toBeInTheDocument();
        expect(screen.queryByText(/Costo bajó/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(`Precio de venta de ${PRODUCT_NAME}`)).not.toBeInTheDocument();
    });

    it('muestra variación porcentual, margen y campo de precio cuando el costo difiere del catálogo', () => {
        renderStep({
            lines: [buildView({ catalogCost: 10000, catalogPrice: 18000 })],
        });

        // (13280 − 10000) / 10000 = 32,8 %
        expect(screen.getByText('Costo subió +$3.280 (32.8%)')).toBeInTheDocument();
        // Abrir el desplegable
        fireEvent.click(screen.getByRole('button', { name: /Costo subió/ }));
        // (18000 − 13280) / 18000 = 26,2 %
        expect(screen.getByText('26.2%')).toBeInTheDocument();
        expect(getPriceInput()).toHaveValue('18.000');
    });

    it('muestra que el costo bajó cuando el nuevo costo es menor al del catálogo', () => {
        renderStep({
            lines: [buildView({ catalogCost: 16600, catalogPrice: 20000 })],
        });

        // (13280 − 16600) / 16600 = −20,0 %
        expect(screen.getByText('Costo bajó -$3.320 (20.0%)')).toBeInTheDocument();
    });

    it('emite onUpdateLine con el precio nuevo al editar el precio de venta', () => {
        const onUpdateLine = vi.fn();
        renderStep({ onUpdateLine, lines: [buildView({ catalogCost: 10000 })] });

        fireEvent.click(screen.getByRole('button', { name: /Costo subió/ }));
        fireEvent.change(getPriceInput(), { target: { value: '21.000' } });

        expect(onUpdateLine).toHaveBeenCalledWith(0, { newPrice: 21000 });
    });

    it('avisa que el precio editado se guardará al confirmar', () => {
        renderStep({
            lines: [buildView({ catalogCost: 10000, line: buildLine({ newPrice: 21000 }) })],
        });

        expect(getPriceInput()).toHaveValue('21.000');
        expect(screen.getByText('Se guardará al confirmar')).toBeInTheDocument();
    });

    it('muestra el valor en pesos de la variación y recalcula el margen en vivo con el precio nuevo', () => {
        renderStep({
            lines: [buildView({ catalogCost: 10000, catalogPrice: 18000, line: buildLine({ newPrice: 20000 }) })],
        });

        // 13.280 - 10.000 = 3.280
        expect(screen.getByText('Costo subió +$3.280 (32.8%)')).toBeInTheDocument();
        // Margen con nuevo precio 20.000: (20.000 - 13.280) / 20.000 = 33.6%
        expect(screen.getByText('Nuevo margen: 33.6%')).toBeInTheDocument();
        expect(screen.getByText('33.6%')).toBeInTheDocument();
    });

    it('suma los totales de línea en el total de la compra', () => {
        renderStep({
            lines: [
                buildView(),
                buildView({
                    index: 1,
                    line: buildLine({ id: 'line-2', ocrName: 'ARROZ DIANA', quantity: 1, lineTotal: 13440 }),
                    productName: 'Arroz Diana',
                }),
            ],
        });

        expect(screen.getByText('Total de la compra')).toBeInTheDocument();
        expect(screen.getByText('$40.000')).toBeInTheDocument();
    });

    it('emite onConfirm desde el control de confirmar', () => {
        const onConfirm = vi.fn();
        renderStep({ onConfirm });

        fireEvent.click(screen.getByRole('button', { name: 'Confirmar los productos de la compra' }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('avisa que la compra carece de productos y ofrece volver a escanear o cerrar', () => {
        const onRescan = vi.fn();
        const onClose = vi.fn();
        renderStep({ lines: [], onRescan, onClose });

        expect(screen.getByText('Esta compra no tiene productos')).toBeInTheDocument();

        const rescan = screen.getByRole('button', { name: 'Volver a escanear la factura' });
        const close = screen.getByRole('button', { name: 'Cerrar el escaneo sin registrar la compra' });

        fireEvent.click(rescan);
        expect(onRescan).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(close, { key: ' ' });
        expect(onClose).toHaveBeenCalledTimes(1);

        expect(screen.queryByText('Total de la compra')).not.toBeInTheDocument();
    });

    it('expone aria-label descriptivo con el nombre del producto en cada campo y control', () => {
        renderStep({ lines: [buildView({ catalogCost: 10000 })] });

        expect(getQuantityInput()).toBeInTheDocument();
        expect(getCostInput()).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Costo subió/ }));
        expect(getPriceInput()).toBeInTheDocument();
        expect(getRemoveButton()).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Confirmar los productos de la compra' })).toBeInTheDocument();
    });

    it('muestra la imagen del producto si viene definida', () => {
        renderStep({ lines: [buildView({ productImage: 'https://example.com/arroz.jpg' })] });

        const img = screen.getByRole('img', { name: PRODUCT_NAME });
        expect(img).toBeInTheDocument();
        expect(img).toHaveAttribute('src', 'https://example.com/arroz.jpg');
    });

    it('muestra el icono fallback (inventory_2) si el producto no tiene imagen', () => {
        renderStep({ lines: [buildView({ productImage: null })] });

        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        expect(screen.getByText('inventory_2')).toBeInTheDocument();
    });

    it('reemplaza la imagen por el fallback si la imagen falla al cargar (onError)', () => {
        renderStep({ lines: [buildView({ productImage: 'https://example.com/broken.jpg' })] });

        const img = screen.getByRole('img', { name: PRODUCT_NAME });
        expect(img).toBeInTheDocument();

        // Disparamos el error de carga de la imagen
        fireEvent.error(img);

        // La imagen ya no está y en su lugar se muestra el icono fallback seguro
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
        expect(screen.getByText('inventory_2')).toBeInTheDocument();
    });
});
