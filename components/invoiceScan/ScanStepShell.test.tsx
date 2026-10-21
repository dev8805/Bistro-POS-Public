import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScanStepShell, SCAN_AUTOFOCUS_ATTRIBUTE } from './ScanStepShell';
import type { ScanStepShellProps } from './ScanStepShell';

/**
 * Pruebas por ejemplo del chrome común del Escaneo_Unificado.
 * Requisitos: 1.5 (control para cerrar), 6.4 (contador "Línea i de n"), 16.6.
 */

const renderShell = (overrides: Partial<ScanStepShellProps> = {}) => {
    const props: ScanStepShellProps = {
        step: 'supplier',
        title: 'Confirma el proveedor',
        canGoBack: true,
        onBack: vi.fn(),
        onClose: vi.fn(),
        children: <p>Contenido del paso</p>,
        ...overrides,
    };
    const utils = render(<ScanStepShell {...props} />);
    return { ...utils, props };
};

const getBackButton = () => screen.getByRole('button', { name: 'Volver al paso anterior' });
const getCloseButton = () => screen.getByRole('button', { name: 'Cerrar el escaneo' });

describe('ScanStepShell', () => {
    it('renderiza el título y el contador en formato "Paso i de n"', () => {
        renderShell({ title: 'Elige el destino', progress: { current: 2, total: 5 } });

        expect(screen.getByRole('heading', { name: 'Elige el destino' })).toBeInTheDocument();
        expect(screen.getByText('Paso 2 de 5')).toBeInTheDocument();
    });

    it('renderiza el contador en formato "Línea i de n" cuando el rótulo es de línea', () => {
        renderShell({ progress: { current: 3, total: 7 }, counterLabel: 'line' });

        expect(screen.getByText('Línea 3 de 7')).toBeInTheDocument();
        expect(screen.queryByText('Paso 3 de 7')).not.toBeInTheDocument();
    });

    it('oculta el contador cuando no hay progreso', () => {
        renderShell({ progress: null });

        expect(screen.queryByText(/Paso \d+ de \d+/)).not.toBeInTheDocument();
    });

    it('expone los aria-label de atrás y cerrar', () => {
        renderShell();

        expect(getBackButton()).toBeInTheDocument();
        expect(getCloseButton()).toBeInTheDocument();
    });

    it('deshabilita el botón atrás y no dispara el callback sin paso previo', () => {
        const onBack = vi.fn();
        renderShell({ canGoBack: false, onBack });

        const back = getBackButton();
        expect(back).toBeDisabled();
        expect(back).toHaveAttribute('aria-disabled', 'true');

        fireEvent.click(back);
        fireEvent.keyDown(back, { key: 'Enter' });
        fireEvent.keyDown(back, { key: ' ' });
        expect(onBack).not.toHaveBeenCalled();
    });

    it('dispara onBack con clic, Enter y Espacio', () => {
        const onBack = vi.fn();
        renderShell({ onBack });
        const back = getBackButton();

        fireEvent.click(back);
        expect(onBack).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(back, { key: 'Enter' });
        expect(onBack).toHaveBeenCalledTimes(2);

        fireEvent.keyDown(back, { key: ' ' });
        expect(onBack).toHaveBeenCalledTimes(3);
    });

    it('dispara onClose con clic, Enter y Espacio', () => {
        const onClose = vi.fn();
        renderShell({ onClose });
        const close = getCloseButton();

        fireEvent.click(close);
        expect(onClose).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(close, { key: 'Enter' });
        expect(onClose).toHaveBeenCalledTimes(2);

        fireEvent.keyDown(close, { key: ' ' });
        expect(onClose).toHaveBeenCalledTimes(3);
    });

    it('ignora teclas que no son de activación', () => {
        const onClose = vi.fn();
        renderShell({ onClose });

        fireEvent.keyDown(getCloseButton(), { key: 'a' });
        expect(onClose).not.toHaveBeenCalled();
    });

    it('tiene una región aria-live="polite" que anuncia el paso', () => {
        renderShell({ title: 'Confirma el proveedor', progress: { current: 4, total: 6 } });

        const live = screen.getByRole('status');
        expect(live).toHaveAttribute('aria-live', 'polite');
        expect(live).toHaveTextContent('Paso 4 de 6');
        expect(live).toHaveTextContent('Confirma el proveedor');
    });

    it('mueve el foco al encabezado al montar', () => {
        renderShell({ title: 'Confirma el proveedor' });

        expect(screen.getByRole('heading', { name: 'Confirma el proveedor' })).toHaveFocus();
    });

    it('mueve el foco al campo marcado cuando el paso pide autoFocusTarget="field"', () => {
        renderShell({
            autoFocusTarget: 'field',
            children: (
                <input
                    aria-label="Factor de conversión"
                    {...{ [SCAN_AUTOFOCUS_ATTRIBUTE]: true }}
                />
            ),
        });

        expect(screen.getByLabelText('Factor de conversión')).toHaveFocus();
    });

    it('muestra el mensaje de error del paso y lo anuncia', () => {
        renderShell({ errorMessage: 'No pudimos leer la factura.' });

        expect(screen.getByText('No pudimos leer la factura.')).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('No pudimos leer la factura.');
    });

    it('renderiza el pie de acciones y el contenido del paso', () => {
        renderShell({ footer: <button type="button">Continuar</button> });

        expect(screen.getByText('Contenido del paso')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
    });
});
