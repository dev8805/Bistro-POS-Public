import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddToHomeScreenModal } from './AddToHomeScreenModal';

describe('AddToHomeScreenModal', () => {
    it('no renderiza nada cuando isOpen es false', () => {
        const { container } = render(<AddToHomeScreenModal isOpen={false} onClose={vi.fn()} />);
        expect(container.firstChild).toBeNull();
    });

    it('renderiza título e instrucciones al abrir', () => {
        render(<AddToHomeScreenModal isOpen={true} onClose={vi.fn()} />);
        expect(screen.getByText('Acceso directo a Gastos')).toBeInTheDocument();
        expect(screen.getByText('Android / Chrome')).toBeInTheDocument();
        expect(screen.getByText('iPhone / iPad')).toBeInTheDocument();
    });

    it('permite cambiar entre pestañas de Android e iOS', () => {
        render(<AddToHomeScreenModal isOpen={true} onClose={vi.fn()} />);

        const iosTab = screen.getByRole('button', { name: /ver instrucciones para iphone o ipad/i });
        fireEvent.click(iosTab);
        expect(screen.getByText(/En Safari, toca el botón/i)).toBeInTheDocument();

        const androidTab = screen.getByRole('button', { name: /ver instrucciones para android/i });
        fireEvent.click(androidTab);
        expect(screen.getByText(/mantén presionado el icono de Bistro POS/i)).toBeInTheDocument();
    });

    it('llama a onClose al presionar el botón Entendido', () => {
        const onClose = vi.fn();
        render(<AddToHomeScreenModal isOpen={true} onClose={onClose} />);

        const closeBtn = screen.getByRole('button', { name: /cerrar ventana de ayuda/i });
        fireEvent.click(closeBtn);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
