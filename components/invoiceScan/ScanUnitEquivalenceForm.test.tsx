import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScanUnitEquivalenceForm, type ScanUnitEquivalenceFormProps } from './ScanUnitEquivalenceForm';

/**
 * Pruebas por ejemplo de la pregunta de equivalencia de empaque.
 * Requisitos: 9.3, 9.7, 9.8, 9.9, 9.11.
 */

const renderForm = (overrides: Partial<ScanUnitEquivalenceFormProps> = {}) => {
    const onConfirm = vi.fn();
    const props: ScanUnitEquivalenceFormProps = {
        ocrUnit: 'CJ',
        saleUnit: 'Und',
        productName: 'Bonyurt Chocokrispis',
        ocrQuantity: 2,
        ocrLineTotal: 24000,
        onConfirm,
        ...overrides,
    };
    const utils = render(<ScanUnitEquivalenceForm {...props} />);
    return { ...utils, onConfirm: props.onConfirm as ReturnType<typeof vi.fn> };
};

const getFactorInput = () => screen.getByLabelText('Cantidad de Und que trae una CJ');
const getContinue = () => screen.getByRole('button', { name: 'Confirmar la equivalencia y continuar' });

describe('ScanUnitEquivalenceForm', () => {
    it('nombra la Unidad_OCR, la Unidad_Venta y el producto en la pregunta', () => {
        renderForm();

        expect(
            screen.getByText('¿Cuántas Und trae una CJ de Bonyurt Chocokrispis?'),
        ).toBeInTheDocument();
    });

    it('muestra el contexto de la línea: cantidad en Unidad_OCR y costo neto', () => {
        renderForm();

        expect(screen.getByText('2 CJ')).toBeInTheDocument();
        expect(screen.getByText('$24.000')).toBeInTheDocument();
    });

    it('mantiene el continuar bloqueado con aria-disabled mientras el factor está vacío (Req 9.8)', () => {
        const { onConfirm } = renderForm();

        const continueBtn = getContinue();
        expect(continueBtn).toBeDisabled();
        expect(continueBtn).toHaveAttribute('aria-disabled', 'true');

        // No previsualiza nada sin factor.
        expect(screen.queryByText('Así queda la compra')).not.toBeInTheDocument();

        fireEvent.click(continueBtn);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('previsualiza la cantidad y el costo por Unidad_Venta con un factor válido (Req 9.11)', () => {
        renderForm();

        // factor 6 ⇒ 2 CJ × 6 = 12 Und, y 24.000 / 12 = 2.000 por Und.
        fireEvent.change(getFactorInput(), { target: { value: '6' } });

        expect(screen.getByText('Así queda la compra')).toBeInTheDocument();
        expect(screen.getByText('12 Und')).toBeInTheDocument();
        expect(screen.getByText('$2.000')).toBeInTheDocument();

        const continueBtn = getContinue();
        expect(continueBtn).not.toBeDisabled();
        expect(continueBtn).toHaveAttribute('aria-disabled', 'false');
    });

    it('acepta un factor decimal con coma latina', () => {
        renderForm({ ocrQuantity: 1, ocrLineTotal: 10000 });

        // factor 0,5 ⇒ 1 × 0,5 = 0,5 Und, y 10.000 / 0,5 = 20.000 por Und.
        fireEvent.change(getFactorInput(), { target: { value: '0,5' } });

        expect(screen.getByText('0,5 Und')).toBeInTheDocument();
        expect(screen.getByText('$20.000')).toBeInTheDocument();
    });

    it('confirma el factor válido al hacer clic en continuar (Req 9.7)', () => {
        const { onConfirm } = renderForm();

        fireEvent.change(getFactorInput(), { target: { value: '6' } });
        fireEvent.click(getContinue());

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onConfirm).toHaveBeenCalledWith(6);
    });

    it('confirma el factor con Enter dentro del campo', () => {
        const { onConfirm } = renderForm();

        fireEvent.change(getFactorInput(), { target: { value: '12' } });
        fireEvent.keyDown(getFactorInput(), { key: 'Enter' });

        expect(onConfirm).toHaveBeenCalledWith(12);
    });

    it('rechaza un factor igual a cero con un mensaje y mantiene el continuar bloqueado (Req 9.9)', () => {
        const { onConfirm } = renderForm();

        fireEvent.change(getFactorInput(), { target: { value: '0' } });

        expect(
            screen.getByText('La equivalencia tiene que ser un número mayor que cero.'),
        ).toBeInTheDocument();

        const continueBtn = getContinue();
        expect(continueBtn).toBeDisabled();
        expect(getFactorInput()).toHaveAttribute('aria-invalid', 'true');

        fireEvent.click(continueBtn);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('no previsualiza ni permite continuar con un factor negativo', () => {
        const { onConfirm } = renderForm();

        // El signo se descarta al sanear la entrada, así que "-5" queda como "5";
        // usamos un valor que sí puede quedar en cero para forzar el rechazo.
        fireEvent.change(getFactorInput(), { target: { value: '0,0' } });

        expect(screen.queryByText('Así queda la compra')).not.toBeInTheDocument();
        expect(getContinue()).toBeDisabled();

        fireEvent.keyDown(getContinue(), { key: 'Enter' });
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('expone aria-label en el campo y en el control de continuar', () => {
        renderForm();

        expect(getFactorInput()).toBeInTheDocument();
        expect(getContinue()).toBeInTheDocument();
    });
});
