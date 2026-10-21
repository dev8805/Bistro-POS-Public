import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
    ScanLineResolverStep,
    type ScanEquivalencePrompt,
    type ScanLineResolverStepProps,
} from './ScanLineResolverStep';
import type { ScanQuickCategory } from './ScanQuickProductForm';
import type { ScanPickerProduct } from './ScanProductPickerSheet';
import type { ScanLine } from '../../lib/invoiceScan/types';

/**
 * Pruebas por ejemplo del Resolutor_Producto.
 * Requisitos: 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 9.3, 9.7, 9.8, 9.9, 9.10, 9.11.
 */

const CATEGORIES: ScanQuickCategory[] = [
    { id: 'cat-1', name: 'Lácteos' },
    { id: 'cat-2', name: 'Granos' },
];

const PRODUCTS: ScanPickerProduct[] = [
    { id: 'p1', name: 'Yogurt Griego', type: 'simple', unit: 'Und', nicknames: ['bonyurt'], is_for_sale: true },
    { id: 'p2', name: 'Arroz Diana', type: 'simple', unit: 'Libras', nicknames: [], is_for_sale: true },
];

const buildLine = (overrides: Partial<ScanLine> = {}): ScanLine => ({
    id: 'line-1',
    ocrName: 'BONYURT CHOCO',
    ocrUnit: 'CJ',
    ocrQuantity: 2,
    netTotal: 24000,
    globalDiscountShare: 0,
    needsReview: false,
    decision: { kind: 'pending' },
    unitCase: null,
    conversionFactor: null,
    createPurchaseUnit: false,
    quantity: null,
    lineTotal: null,
    newPrice: null,
    barcode: '',
    ...overrides,
});

const EQUIVALENCE: ScanEquivalencePrompt = {
    ocrUnit: 'CJ',
    saleUnit: 'Und',
    productName: 'Yogurt Griego',
    ocrQuantity: 2,
    ocrLineTotal: 24000,
};

const renderStep = (overrides: Partial<ScanLineResolverStepProps> = {}) => {
    const props: ScanLineResolverStepProps = {
        line: buildLine(),
        progress: { current: 1, total: 3 },
        categories: CATEGORIES,
        products: PRODUCTS,
        nicknameOwner: null,
        equivalence: null,
        canGoBack: true,
        supplierData: { kind: 'existing', id: 's-1', name: 'Alpina' },
        onCreate: vi.fn(),
        onLinkExisting: vi.fn(),
        onLink: vi.fn(),
        onSkip: vi.fn(),
        onConfirmEquivalence: vi.fn(),
        onPreviousLine: vi.fn(),
        onBack: vi.fn(),
        onClose: vi.fn(),
        ...overrides,
    };
    const utils = render(<ScanLineResolverStep {...props} />);
    return { ...utils, props };
};

const getCreate = () => screen.getByRole('button', { name: 'Crear producto rápido' });
const getPick = () => screen.getByRole('button', { name: 'Es un producto que ya tengo' });
const getSkip = () => screen.getByRole('button', { name: 'Omitir esta línea' });
const getPreviousLine = () => screen.getByRole('button', { name: 'Volver a la línea anterior' });

describe('ScanLineResolverStep — una línea a la vez', () => {
    it('muestra el contador "Línea i de n" y los datos de la línea (Req 6.4)', () => {
        renderStep();

        expect(screen.getByText('Línea 1 de 3')).toBeInTheDocument();
        expect(screen.getByText('BONYURT CHOCO')).toBeInTheDocument();
        expect(screen.getByText('2 CJ')).toBeInTheDocument();
        expect(screen.getByText('$24.000')).toBeInTheDocument();
    });

    it('resta la parte proporcional del descuento global del costo neto mostrado', () => {
        renderStep({ line: buildLine({ netTotal: 24000, globalDiscountShare: 4000 }) });

        expect(screen.getByText('$20.000')).toBeInTheDocument();
    });

    it('indica "sin unidad" cuando la línea no trae Unidad_OCR', () => {
        renderStep({ line: buildLine({ ocrUnit: '', ocrQuantity: 5 }) });

        expect(screen.getByText('5 sin unidad')).toBeInTheDocument();
    });

    it('marca la línea con cantidad ilegible para que el Usuario la revise (Req 3.12)', () => {
        renderStep({ line: buildLine({ needsReview: true }) });

        expect(screen.getByText('Revisa la cantidad')).toBeInTheDocument();
    });

    it('explica en una frase qué decisión se pide y su efecto (Req 6.5)', () => {
        renderStep();

        expect(screen.getByText(/No encontramos "BONYURT CHOCO" en tu catálogo/)).toBeInTheDocument();
    });
});

describe('ScanLineResolverStep — tres acciones sin coincidencia (Req 6.6)', () => {
    it('ofrece las tres acciones para una línea sin coincidencia', () => {
        renderStep();

        expect(getCreate()).toBeInTheDocument();
        expect(getPick()).toBeInTheDocument();
        expect(getSkip()).toBeInTheDocument();
    });

    it('emite onSkip al omitir la línea, con clic y con teclado (Req 6.7)', () => {
        const { props } = renderStep();

        fireEvent.click(getSkip());
        expect(props.onSkip).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(getSkip(), { key: ' ' });
        expect(props.onSkip).toHaveBeenCalledTimes(2);
    });

    it('informa que la línea omitida queda fuera del inventario y del total', () => {
        renderStep();

        expect(
            screen.getByText(/la línea queda fuera del inventario y del total de la compra/),
        ).toBeInTheDocument();
    });

    it('abre la Creacion_Rapida_Producto dentro del paso al elegir "Crear producto rápido"', () => {
        renderStep();

        fireEvent.click(getCreate());

        expect(screen.getByLabelText('Nombre del producto nuevo')).toBeInTheDocument();
        // El nombre llega prellenado con el Nombre_OCR (Req 7.2) formateado.
        expect(screen.getByLabelText('Nombre del producto nuevo')).toHaveValue('Bonyurt Choco');
    });

    it('abre la Creacion_Rapida_Producto limpiando empaques entre paréntesis como (12)NVO', () => {
        renderStep({ line: buildLine({ ocrName: 'FRESH CITRUS 400ML PET (12)NVO' }) });

        fireEvent.click(getCreate());

        expect(screen.getByLabelText('Nombre del producto nuevo')).toHaveValue('Fresh Citrus 400ml Pet');
    });

    it('respeta aiConversionFactor = 1 y no divide erróneamente por regex de nombre (caso Kola Postobon X12 en PZA)', () => {
        renderStep({
            line: buildLine({
                ocrName: 'KOLA POSTOBON 1.000 ML PET X12',
                ocrUnit: 'PZA',
                ocrQuantity: 6,
                netTotal: 17502,
                aiConversionFactor: 1,
            }),
        });

        fireEvent.click(getCreate());

        // Debe prellenar con 17502 / 6 = 2917 (NO 17502 / 72 = 243)
        expect(screen.getByLabelText(/Costo por Unidad del producto nuevo/)).toHaveValue('2.917');
        // No debe mostrar el banner de empaque detectado
        expect(screen.queryByText(/Empaque detectado/)).not.toBeInTheDocument();
    });

    it('abre el buscador del catálogo dentro del paso al elegir "Es un producto que ya tengo"', () => {
        renderStep();

        fireEvent.click(getPick());

        expect(screen.getByLabelText('Buscar un producto por nombre o apodo')).toBeInTheDocument();
    });

    it('vuelve a las tres acciones con el botón atrás del shell sin salir del paso', () => {
        const { props } = renderStep();

        fireEvent.click(getPick());
        expect(screen.getByLabelText('Buscar un producto por nombre o apodo')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Volver al paso anterior' }));

        // Regresa a la decisión, no invoca el retroceso del host.
        expect(getCreate()).toBeInTheDocument();
        expect(props.onBack).not.toHaveBeenCalled();
    });
});

describe('ScanLineResolverStep — integración con los sub-formularios', () => {
    it('crea el producto y lo entrega por onCreate al completar la Creacion_Rapida_Producto', () => {
        const { props } = renderStep();

        fireEvent.click(getCreate());
        fireEvent.change(screen.getByLabelText('Categoría del producto nuevo'), { target: { value: 'cat-1' } });
        fireEvent.change(screen.getByLabelText(/Precio de venta/), { target: { value: '3500' } });
        fireEvent.click(screen.getByRole('button', { name: 'Crear el producto y continuar' }));

        expect(props.onCreate).toHaveBeenCalledTimes(1);
    });

    it('permite crear una nueva categoría con el botón de la línea de categoría y persistirla', async () => {
        const onCategoriesChange = vi.fn();
        renderStep({ onCategoriesChange });

        fireEvent.click(getCreate());

        // Botón Crear categoría en la misma línea
        const createCatBtn = screen.getByTitle('Crear categoría');
        expect(createCatBtn).toBeInTheDocument();

        // Al hacer clic en Crear se despliega el input inline
        fireEvent.click(createCatBtn);
        const newCatInput = screen.getByPlaceholderText('Nueva categoría...');
        expect(newCatInput).toBeInTheDocument();

        // Escribir nombre y guardar
        fireEvent.change(newCatInput, { target: { value: 'Bebidas Frías' } });
        const saveBtn = screen.getByRole('button', { name: 'Guardar' });
        fireEvent.click(saveBtn);

        // Se notifica el cambio de categorías con la nueva categoría incluida
        expect(onCategoriesChange).toHaveBeenCalled();
        const updatedCats = onCategoriesChange.mock.calls[0][0];
        expect(updatedCats.some((c: any) => c.name === 'Bebidas Frías')).toBe(true);
    });

    it('permite ver opciones de editar y eliminar en el menú de categorías', () => {
        renderStep();

        fireEvent.click(getCreate());

        // Abrir el dropdown personalizado de categorías
        const categoryTrigger = screen.getByRole('button', { name: 'Abrir selector de categorías' });
        fireEvent.click(categoryTrigger);

        // Comprobar que aparecen los botones de edición y eliminación para las categorías
        const editButtons = screen.getAllByTitle('Editar categoría');
        const deleteButtons = screen.getAllByTitle('Eliminar categoría');
        expect(editButtons.length).toBeGreaterThan(0);
        expect(deleteButtons.length).toBeGreaterThan(0);
    });

    it('vincula la línea al producto elegido en el buscador por onLink', () => {
        const { props } = renderStep();

        fireEvent.click(getPick());
        fireEvent.click(screen.getByRole('button', { name: 'Elegir el producto Yogurt Griego' }));
        fireEvent.click(screen.getByRole('button', { name: 'Vincular esta línea a Yogurt Griego' }));

        // Sin dueño previo del apodo, la propuesta llega activada por defecto (Req 8.3).
        expect(props.onLink).toHaveBeenCalledWith('p1', true);
    });
});

describe('ScanLineResolverStep — volver a la línea anterior (Req 6.8)', () => {
    it('deshabilita el control en la primera línea', () => {
        renderStep({ progress: { current: 1, total: 3 } });

        const previous = getPreviousLine();
        expect(previous).toBeDisabled();
        expect(previous).toHaveAttribute('aria-disabled', 'true');
    });

    it('emite onPreviousLine desde la segunda línea en adelante', () => {
        const { props } = renderStep({ progress: { current: 2, total: 3 } });

        const previous = getPreviousLine();
        expect(previous).not.toBeDisabled();

        fireEvent.click(previous);
        expect(props.onPreviousLine).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(previous, { key: 'Enter' });
        expect(props.onPreviousLine).toHaveBeenCalledTimes(2);
    });
});

describe('ScanLineResolverStep — modo equivalencia (Req 9.3, 9.10, 9.11)', () => {
    it('muestra la pregunta de equivalencia cuando el host pasa el prompt', () => {
        renderStep({ equivalence: EQUIVALENCE });

        expect(screen.getByText('¿Cuántas Und trae una CJ de Yogurt Griego?')).toBeInTheDocument();
        expect(screen.getByText('Línea 1 de 3')).toBeInTheDocument();
    });

    it('no muestra la equivalencia mientras el prompt es nulo', () => {
        renderStep();

        expect(screen.queryByText(/¿Cuántas/)).not.toBeInTheDocument();
    });

    it('mantiene el continuar bloqueado sin factor y previsualiza con un factor válido', () => {
        renderStep({ equivalence: EQUIVALENCE });

        const continueBtn = screen.getByRole('button', { name: 'Confirmar la equivalencia y continuar' });
        expect(continueBtn).toBeDisabled();

        fireEvent.change(screen.getByLabelText('Cantidad de Und que trae una CJ'), { target: { value: '6' } });

        expect(screen.getByText('12 Und')).toBeInTheDocument();
        expect(screen.getByText('$2.000')).toBeInTheDocument();
        expect(continueBtn).not.toBeDisabled();
    });

    it('confirma el Factor_Conversion por onConfirmEquivalence', () => {
        const { props } = renderStep({ equivalence: EQUIVALENCE });

        fireEvent.change(screen.getByLabelText('Cantidad de Und que trae una CJ'), { target: { value: '6' } });
        fireEvent.click(screen.getByRole('button', { name: 'Confirmar la equivalencia y continuar' }));

        expect(props.onConfirmEquivalence).toHaveBeenCalledWith(6);
    });

    it('ofrece "Omitir esta línea" como única salida sin factor (Req 9.10)', () => {
        const { props } = renderStep({ equivalence: EQUIVALENCE });

        fireEvent.click(getSkip());
        expect(props.onSkip).toHaveBeenCalledTimes(1);
    });

    it('rechaza un factor igual o menor que cero (Req 9.9)', () => {
        const { props } = renderStep({ equivalence: EQUIVALENCE });

        fireEvent.change(screen.getByLabelText('Cantidad de Und que trae una CJ'), { target: { value: '0' } });

        expect(screen.getByText('La equivalencia tiene que ser un número mayor que cero.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Confirmar la equivalencia y continuar' })).toBeDisabled();
        expect(props.onConfirmEquivalence).not.toHaveBeenCalled();
    });
});

describe('ScanLineResolverStep — accesibilidad', () => {
    it('expone el botón cerrar y el botón atrás del shell', () => {
        renderStep();

        expect(screen.getByRole('button', { name: 'Cerrar el escaneo' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Volver al paso anterior' })).toBeInTheDocument();
    });

    it('emite onClose desde el control de cerrar', () => {
        const { props } = renderStep();

        fireEvent.click(screen.getByRole('button', { name: 'Cerrar el escaneo' }));
        expect(props.onClose).toHaveBeenCalledTimes(1);
    });
});
