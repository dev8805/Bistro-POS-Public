import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ScanDestinationStep } from './ScanDestinationStep';
import { ScanCaptureStep } from './ScanCaptureStep';
import { ScanCropStep } from './ScanCropStep';
import { ScanProcessingStep } from './ScanProcessingStep';
import { ScanErrorStep } from './ScanErrorStep';



/**
 * Pruebas por ejemplo de los cinco pasos de captura del Escaneo_Unificado.
 *
 * Un solo archivo para los cinco: son el mismo sub-flujo (destino → captura →
 * recorte → procesamiento → error), la cobertura exigida por componente es
 * corta y así se evita repetir cinco arneses de render casi idénticos.
 *
 * Requisitos: 1.2, 1.5, 2.1, 2.2, 2.3, 2.6, 2.7, 2.8.
 */

const getCloseButton = () => screen.getByRole('button', { name: 'Cerrar el escaneo' });

describe('ScanDestinationStep', () => {
    it('presenta exactamente dos destinos con su explicación', () => {
        render(<ScanDestinationStep onSelectDestination={vi.fn()} onClose={vi.fn()} />);

        const options = screen.getAllByRole('button', { name: /^Elegir destino:/ });
        expect(options).toHaveLength(2);
        expect(screen.getByRole('button', { name: 'Elegir destino: compra de inventario' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Elegir destino: gasto' })).toBeInTheDocument();
        expect(screen.getByText(/insumos de tus recetas/i)).toBeInTheDocument();
        expect(screen.getByText(/no descuentan stock al vender/i)).toBeInTheDocument();
    });

    it('elige inventario con clic y gasto con teclado', () => {
        const onSelectDestination = vi.fn();
        render(<ScanDestinationStep onSelectDestination={onSelectDestination} onClose={vi.fn()} />);

        fireEvent.click(screen.getByRole('button', { name: 'Elegir destino: compra de inventario' }));
        expect(onSelectDestination).toHaveBeenCalledWith('inventory');

        fireEvent.keyDown(screen.getByRole('button', { name: 'Elegir destino: gasto' }), { key: 'Enter' });
        expect(onSelectDestination).toHaveBeenCalledWith('expense');

        fireEvent.keyDown(screen.getByRole('button', { name: 'Elegir destino: gasto' }), { key: ' ' });
        expect(onSelectDestination).toHaveBeenCalledTimes(3);
    });

    it('ofrece el control para cerrar el flujo', () => {
        const onClose = vi.fn();
        render(<ScanDestinationStep onSelectDestination={vi.fn()} onClose={onClose} />);

        fireEvent.click(getCloseButton());
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

describe('ScanCaptureStep', () => {
    const renderCapture = (overrides: Partial<React.ComponentProps<typeof ScanCaptureStep>> = {}) => {
        const props: React.ComponentProps<typeof ScanCaptureStep> = {
            destination: 'inventory',
            cameraOpen: false,
            onOpenCamera: vi.fn(),
            onCloseCamera: vi.fn(),
            onSelectFile: vi.fn(),
            onClose: vi.fn(),
            ...overrides,
        };
        return { ...render(<ScanCaptureStep {...props} />), props };
    };

    const getCameraButton = () =>
        screen.getByRole('button', { name: 'Tomar la foto con la cámara del dispositivo' });
    const getGalleryButton = () =>
        screen.getByRole('button', { name: 'Elegir una imagen de la galería o un archivo' });

    it('muestra las dos fuentes de imagen y el aviso del límite de 50 MB', () => {
        renderCapture();

        expect(getCameraButton()).toBeInTheDocument();
        expect(getGalleryButton()).toBeInTheDocument();
        expect(screen.getByText(/Peso máximo de la imagen: 50 MB/)).toBeInTheDocument();
    });

    it('abre la cámara con clic y con teclado', () => {
        const onOpenCamera = vi.fn();
        renderCapture({ onOpenCamera });

        fireEvent.click(getCameraButton());
        expect(onOpenCamera).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(getCameraButton(), { key: ' ' });
        expect(onOpenCamera).toHaveBeenCalledTimes(2);
    });

    it('entrega el archivo elegido en la galería sin validarlo cuando es imagen', () => {
        const onSelectFile = vi.fn();
        renderCapture({ onSelectFile });

        const file = new File(['contenido'], 'factura.jpg', { type: 'image/jpeg' });
        const input = screen.getByLabelText('Seleccionar la imagen del documento');
        fireEvent.change(input, { target: { files: [file] } });

        expect(onSelectFile).toHaveBeenCalledTimes(1);
        expect(onSelectFile.mock.calls[0][0]).toBe(file);
    });

    it('rechaza archivos PDF y orienta al usuario a tomar captura de pantalla', () => {
        const onSelectFile = vi.fn();
        renderCapture({ onSelectFile });

        const pdfFile = new File(['%PDF-1.4'], 'factura.pdf', { type: 'application/pdf' });
        const input = screen.getByLabelText('Seleccionar la imagen del documento');
        fireEvent.change(input, { target: { files: [pdfFile] } });

        expect(onSelectFile).not.toHaveBeenCalled();
        expect(screen.getAllByText(/Para facturas en PDF, toma una captura de pantalla/i).length).toBeGreaterThan(0);
    });

    it('mantiene visibles las dos fuentes cuando el archivo fue rechazado', () => {
        renderCapture({ errorMessage: 'La imagen pesa más de 50 MB. Elige otra foto.' });

        expect(screen.getByText('La imagen pesa más de 50 MB. Elige otra foto.')).toBeInTheDocument();
        expect(getCameraButton()).toBeInTheDocument();
        expect(getGalleryButton()).toBeInTheDocument();
    });

    it('cede la pantalla completa a la cámara cuando está abierta', async () => {
        renderCapture({ cameraOpen: true });

        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Cerrar cámara' })).toBeInTheDocument();
        });
        expect(screen.queryByRole('button', { name: 'Cerrar el escaneo' })).not.toBeInTheDocument();
    });

    it('recibe una captura de pantalla al disparar el evento paste (Ctrl+V)', () => {
        const onSelectFile = vi.fn();
        renderCapture({ onSelectFile });

        const file = new File(['captura'], 'screenshot.png', { type: 'image/png' });
        const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(pasteEvent, 'clipboardData', {
            value: {
                items: [
                    {
                        type: 'image/png',
                        getAsFile: () => file,
                    },
                ],
            },
        });

        window.dispatchEvent(pasteEvent);

        expect(onSelectFile).toHaveBeenCalledTimes(1);
        expect(onSelectFile.mock.calls[0][0]).toBe(file);
    });

    it('recibe una imagen arrastrada y soltada en la zona de captura', () => {
        const onSelectFile = vi.fn();
        renderCapture({ onSelectFile });

        const file = new File(['arrastrado'], 'factura.png', { type: 'image/png' });
        const dropZone = screen.getByRole('button', { name: 'Pegar captura de pantalla desde el portapapeles' }).parentElement!;

        fireEvent.drop(dropZone, {
            dataTransfer: {
                files: [file],
            },
        });

        expect(onSelectFile).toHaveBeenCalledTimes(1);
        expect(onSelectFile.mock.calls[0][0]).toBe(file);
    });
});

describe('ScanCropStep', () => {
    it('muestra el recorte de esquinas y la opción de volver a tomar', () => {
        const onRetake = vi.fn();
        render(<ScanCropStep imageSrc="blob:factura" onConfirm={vi.fn()} onRetake={onRetake} />);

        expect(screen.getByText('Ajusta el recorte')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Usar recorte/ })).toBeInTheDocument();

        const retake = screen.getByRole('button', { name: 'Volver a tomar la foto' });
        fireEvent.click(retake);
        expect(onRetake).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(retake, { key: 'Enter' });
        expect(onRetake).toHaveBeenCalledTimes(2);
    });
});

describe('ScanProcessingStep', () => {
    it('muestra y anuncia el texto del paso en curso', () => {
        render(<ScanProcessingStep stepText="Leyendo las líneas de la factura..." onClose={vi.fn()} />);

        expect(screen.getByText('Leyendo las líneas de la factura...')).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Leyendo las líneas de la factura...');
    });
});

describe('ScanErrorStep', () => {
    const renderError = (overrides: Partial<React.ComponentProps<typeof ScanErrorStep>> = {}) => {
        const props: React.ComponentProps<typeof ScanErrorStep> = {
            message: 'El escaneo tardó más de 45 segundos.',
            onRetry: vi.fn(),
            onContinueManual: vi.fn(),
            onClose: vi.fn(),
            ...overrides,
        };
        return { ...render(<ScanErrorStep {...props} />), props };
    };

    const getRetryButton = () =>
        screen.getByRole('button', { name: 'Reintentar la lectura de la factura' });
    const getManualButton = () =>
        screen.getByRole('button', { name: 'Continuar manual y escribir los datos' });

    it('muestra el mensaje del fallo y exactamente dos acciones', () => {
        renderError();

        expect(screen.getByText('El escaneo tardó más de 45 segundos.')).toBeInTheDocument();
        expect(getRetryButton()).toBeInTheDocument();
        expect(getManualButton()).toBeInTheDocument();
    });

    it('dispara "Reintentar" con clic, Enter y Espacio', () => {
        const onRetry = vi.fn();
        renderError({ onRetry });

        fireEvent.click(getRetryButton());
        fireEvent.keyDown(getRetryButton(), { key: 'Enter' });
        fireEvent.keyDown(getRetryButton(), { key: ' ' });

        expect(onRetry).toHaveBeenCalledTimes(3);
    });

    it('dispara "Continuar manual" con clic, Enter y Espacio', () => {
        const onContinueManual = vi.fn();
        renderError({ onContinueManual });

        fireEvent.click(getManualButton());
        fireEvent.keyDown(getManualButton(), { key: 'Enter' });
        fireEvent.keyDown(getManualButton(), { key: ' ' });

        expect(onContinueManual).toHaveBeenCalledTimes(3);
    });
});
