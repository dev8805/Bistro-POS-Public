import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/**
 * Pruebas por ejemplo de `InvoiceScanScreen` (tarea 5.8).
 *
 * Verifican el cableado del host, no el flujo completo de registro (eso lo
 * cubren las pruebas del hook y de cada paso):
 *  - Sin `inv_purchase`: se muestra el aviso de permiso faltante y NO se monta
 *    el flujo (Req 14.2).
 *  - Con el permiso: el flujo arranca en el Selector_Destino (Req 1.2).
 *  - Existe el control para cerrar el flujo (Req 1.5).
 *  - Elegir un destino avanza al paso de captura (Req 1.3, 2.1).
 *
 * Se mockean los hooks de datos del Negocio_Activo, los contextos y `supabase`;
 * el hook propietario `useInvoiceScanDraft` corre de verdad, de modo que la
 * máquina de estados real gobierna la navegación.
 */

let mockHasPermission = true;

vi.mock('../hooks/usePermissions', () => ({
    usePermissions: () => ({
        hasPermission: (id: string) => (id === 'inv_purchase' ? mockHasPermission : false),
    }),
}));

vi.mock('../context/AuthContext', () => ({
    useAuth: () => ({ profile: { business_id: 'biz-1', id: 'user-1' } }),
}));

vi.mock('../context/ToastContext', () => ({
    useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../context/ConfirmDialogContext', () => ({
    useConfirmDialog: () => ({ confirmAction: vi.fn(async () => true) }),
}));

vi.mock('../hooks/useProducts', () => ({
    useProducts: () => ({ products: [], categories: [] }),
}));

vi.mock('../hooks/useSuppliers', () => ({
    useSuppliers: () => ({ suppliers: [] }),
}));

vi.mock('../hooks/useCashRegister', () => ({
    useCashRegister: () => ({ activeShift: null, balances: {} }),
}));

vi.mock('../hooks/useExpenses', () => ({
    useExpenses: () => ({ categories: [], addCategory: vi.fn() }),
}));

vi.mock('../hooks/useImageUpload', () => ({
    useImageUpload: () => ({ uploadFileDirect: vi.fn(async () => null) }),
}));

vi.mock('../lib/paymentMethods', () => ({
    useBusinessPaymentMethods: () => [],
}));

vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: vi.fn(),
        from: vi.fn(),
        storage: { from: vi.fn() },
    },
}));

import InvoiceScanScreen from './InvoiceScanScreen';

const renderScreen = () => {
    const onClose = vi.fn();
    const utils = render(<InvoiceScanScreen onClose={onClose} />);
    return { ...utils, onClose };
};

describe('InvoiceScanScreen', () => {
    beforeEach(() => {
        mockHasPermission = true;
    });

    it('sin permiso inv_purchase muestra el aviso y no monta el flujo', () => {
        mockHasPermission = false;
        renderScreen();

        expect(
            screen.getByText('No tienes permiso para registrar compras y gastos'),
        ).toBeInTheDocument();
        // El flujo no se monta: no aparece el Selector_Destino.
        expect(
            screen.queryByRole('heading', { name: '¿Qué trae este documento?' }),
        ).not.toBeInTheDocument();
    });

    it('con permiso arranca en el Selector_Destino con sus dos destinos', () => {
        renderScreen();

        expect(
            screen.getByRole('heading', { name: '¿Qué trae este documento?' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Elegir destino: compra de inventario' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Elegir destino: gasto' }),
        ).toBeInTheDocument();
    });

    it('ofrece el control para cerrar el flujo', () => {
        const { onClose } = renderScreen();

        const closeButton = screen.getByRole('button', { name: 'Cerrar el escaneo' });
        expect(closeButton).toBeInTheDocument();

        // Sin decisiones tomadas, cerrar regresa a la pantalla de origen.
        fireEvent.click(closeButton);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('al elegir un destino avanza al paso de captura', () => {
        renderScreen();

        fireEvent.click(
            screen.getByRole('button', { name: 'Elegir destino: compra de inventario' }),
        );

        expect(
            screen.getByRole('heading', { name: 'Toma la foto de la factura' }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Tomar la foto con la cámara del dispositivo' }),
        ).toBeInTheDocument();
    });
});
