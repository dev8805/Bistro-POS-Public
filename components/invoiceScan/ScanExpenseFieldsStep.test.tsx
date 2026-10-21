import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScanExpenseFieldsStep } from './ScanExpenseFieldsStep';
import type { ScanExpenseFieldsStepProps } from './ScanExpenseFieldsStep';
import { todayDateStringInTz } from '../../lib/timezone';

/**
 * Pruebas por ejemplo del paso de campos del gasto.
 * Requisitos: 11.3 (selector de categoría dentro del paso), 11.4 (todo editable),
 * 11.5 (fecha no futura en hora colombiana), 16.1, 17.5 y 17.14 (solo datos del
 * Negocio_Activo).
 */

const CATEGORIES = ['SERVICIOS', 'ARRIENDO', 'TRANSPORTE'];
const TODAY = '2026-08-01';

const renderStep = (overrides: Partial<ScanExpenseFieldsStepProps> = {}) => {
    const props: ScanExpenseFieldsStepProps = {
        expense: {
            amount: '85000',
            description: 'Energía de julio',
            category: 'SERVICIOS',
            date: '2026-07-31',
        },
        supplier: { kind: 'existing', id: 'sup-1', name: 'AIRE' },
        categories: CATEGORIES,
        issues: [],
        onChange: vi.fn(),
        onSupplierNameChange: vi.fn(),
        onCreateCategory: vi.fn(),
        onConfirm: vi.fn(),
        today: TODAY,
        ...overrides,
    };
    const utils = render(<ScanExpenseFieldsStep {...props} />);
    return { ...utils, props };
};

const getAmountInput = () => screen.getByLabelText('Valor del gasto');
const getDateInput = () => screen.getByLabelText('Fecha del gasto');
const getSupplierInput = () => screen.getByLabelText('Proveedor del gasto');
const getDescriptionInput = () => screen.getByLabelText('Observación del gasto');
const getCategoryTrigger = () => screen.getByRole('button', { name: 'Elegir la categoría del gasto' });
const getConfirmButton = () => screen.getByRole('button', { name: 'Continuar al paso de pago del gasto' });

describe('ScanExpenseFieldsStep', () => {
    it('renderiza los campos prellenados y el proveedor seleccionado bloqueado', () => {
        renderStep();

        expect(getAmountInput()).toHaveValue('85.000');
        expect(getDescriptionInput()).toHaveValue('Energía de julio');
        expect(screen.getByText('AIRE')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Eliminar proveedor seleccionado' })).toBeInTheDocument();
        expect(getDateInput()).toHaveValue('2026-07-31');
        expect(getCategoryTrigger()).toHaveTextContent('SERVICIOS');

        expect(getAmountInput()).not.toBeDisabled();
        expect(getAmountInput()).not.toHaveAttribute('readonly');
        expect(getDescriptionInput()).not.toBeDisabled();
        expect(getDateInput()).not.toBeDisabled();
    });

    it('emite onChange con el patch del valor al escribirlo, ya limpio de separadores', () => {
        const onChange = vi.fn();
        renderStep({ onChange });

        fireEvent.change(getAmountInput(), { target: { value: '120.500' } });

        expect(onChange).toHaveBeenCalledWith({ amount: '120500' });
    });

    it('emite onChange con el patch de la descripción al escribirla', () => {
        const onChange = vi.fn();
        renderStep({ onChange });

        fireEvent.change(getDescriptionInput(), { target: { value: 'Recibo de agosto' } });

        expect(onChange).toHaveBeenCalledWith({ description: 'Recibo de agosto' });
    });

    it('permite eliminar el proveedor seleccionado y escribir uno nuevo', () => {
        const onClearSupplier = vi.fn();
        const onSupplierNameChange = vi.fn();
        renderStep({ onClearSupplier, onSupplierNameChange });

        fireEvent.click(screen.getByRole('button', { name: 'Eliminar proveedor seleccionado' }));
        expect(onClearSupplier).toHaveBeenCalled();

        expect(getSupplierInput()).toBeInTheDocument();
        fireEvent.change(getSupplierInput(), { target: { value: 'AIRE SAS' } });
        expect(onSupplierNameChange).toHaveBeenCalledWith('AIRE SAS');
    });

    it('abre el selector de categoría dentro del paso y emite el patch al elegir una', () => {
        const onChange = vi.fn();
        renderStep({ onChange });

        expect(screen.queryByText('Elegir categoría')).not.toBeInTheDocument();

        fireEvent.click(getCategoryTrigger());

        // El selector solo ofrece las categorías del Negocio_Activo (Req 17.5).
        // El nombre accesible de la opción elegida incluye el ícono de check,
        // por eso se compara con expresión regular y no con el texto exacto.
        CATEGORIES.forEach(category => {
            expect(screen.getByRole('button', { name: new RegExp(`^${category}`) })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: 'ARRIENDO' }));

        expect(onChange).toHaveBeenCalledWith({ category: 'ARRIENDO' });
    });

    it('abre el selector de categoría con Enter y con Espacio', () => {
        renderStep();

        fireEvent.keyDown(getCategoryTrigger(), { key: 'Enter' });
        expect(screen.getByRole('heading', { name: 'Elegir categoría' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
        expect(screen.queryByRole('heading', { name: 'Elegir categoría' })).not.toBeInTheDocument();

        fireEvent.keyDown(getCategoryTrigger(), { key: ' ' });
        expect(screen.getByRole('heading', { name: 'Elegir categoría' })).toBeInTheDocument();
    });

    it('pone en el input de fecha el max con el día de hoy en hora colombiana', () => {
        renderStep();

        expect(getDateInput()).toHaveAttribute('max', TODAY);
    });

    it('usa la fecha de hoy en America/Bogota cuando no recibe el día por prop', () => {
        renderStep({ today: undefined });

        expect(getDateInput()).toHaveAttribute('max', todayDateStringInTz());
    });

    it('deshabilita el continuar y muestra cada mensaje junto a su campo con códigos pendientes', () => {
        const onConfirm = vi.fn();
        renderStep({
            expense: { amount: '0', description: '', category: null, date: '2099-01-01' },
            supplier: null,
            issues: ['invalid_amount', 'missing_category', 'missing_supplier', 'future_expense_date'],
            onConfirm,
        });

        const confirm = getConfirmButton();
        expect(confirm).toBeDisabled();
        expect(confirm).toHaveAttribute('aria-disabled', 'true');

        fireEvent.click(confirm);
        fireEvent.keyDown(confirm, { key: 'Enter' });
        expect(onConfirm).not.toHaveBeenCalled();

        expect(screen.getByText('Escribe un valor mayor que cero.')).toBeInTheDocument();
        expect(screen.getByText('Elige una categoría para el gasto.')).toBeInTheDocument();
        expect(screen.getByText('El proveedor es obligatorio.')).toBeInTheDocument();
        expect(screen.getByText('La fecha no puede ser posterior a hoy.')).toBeInTheDocument();

        expect(getAmountInput()).toHaveAttribute('aria-invalid', 'true');
        expect(getAmountInput()).toHaveAttribute('aria-describedby', 'scan-expense-amount-error');
        expect(getCategoryTrigger()).toHaveAttribute('aria-invalid', 'true');
        expect(getSupplierInput()).toHaveAttribute('aria-describedby', 'scan-expense-supplier-error');
        expect(getDateInput()).toHaveAttribute('aria-describedby', 'scan-expense-date-error');

        // Frase de onboarding: nombra exactamente lo que falta.
        expect(
            screen.getByText(
                'Para registrar el gasto falta el valor, la categoría, el proveedor y una fecha que no sea futura.',
            ),
        ).toBeInTheDocument();
    });

    it('habilita el continuar y emite onConfirm sin códigos pendientes', () => {
        const onConfirm = vi.fn();
        renderStep({ onConfirm });

        const confirm = getConfirmButton();
        expect(confirm).not.toBeDisabled();
        expect(confirm).toHaveAttribute('aria-disabled', 'false');
        expect(confirm).toHaveTextContent('Continuar · $85.000');

        fireEvent.click(confirm);
        expect(onConfirm).toHaveBeenCalledTimes(1);

        expect(screen.getByLabelText('Valor del gasto')).not.toHaveAttribute('aria-describedby');
    });

    it('expone aria-label descriptivo en todos los controles del paso', () => {
        renderStep({ supplier: null });

        expect(getAmountInput()).toBeInTheDocument();
        expect(getDateInput()).toBeInTheDocument();
        expect(getSupplierInput()).toBeInTheDocument();
        expect(getDescriptionInput()).toBeInTheDocument();
        expect(getCategoryTrigger()).toBeInTheDocument();
        expect(getConfirmButton()).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Ampliar la observación del gasto' })).toBeInTheDocument();
    });

    it('muestra en un aviso general los códigos que no pertenecen a un campo del paso', () => {
        renderStep({ issues: ['overpayment'] });

        expect(screen.getByText('La suma de los pagos supera el valor del gasto.')).toBeInTheDocument();
        expect(getConfirmButton()).toBeDisabled();
    });
});
