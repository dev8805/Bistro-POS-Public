import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

// --- Mock de permisos ---
const hasPermissionMock = vi.fn<(id: string) => boolean>();
vi.mock('../../hooks/usePermissions', () => ({
    usePermissions: () => ({ hasPermission: hasPermissionMock }),
}));

// --- Mock de auth ---
let currentBusinessId: string | null = 'default-business-id';
vi.mock('../../context/AuthContext', () => ({
    useAuth: () => ({ profile: { business_id: currentBusinessId } }),
}));

import { HIDDEN_PRICES_BUSINESS_ID } from '../../lib/specialBusinesses';
import { ExpenseActionsMenu, type ExpenseMenuAction } from './ExpenseActionsMenu';

beforeEach(() => {
    vi.clearAllMocks();
    currentBusinessId = 'default-business-id';
    hasPermissionMock.mockReturnValue(true); // por defecto tiene inv_purchase
});

describe('ExpenseActionsMenu', () => {
    it('muestra únicamente las tres opciones manuales', () => {
        render(<ExpenseActionsMenu variant="sheet" onSelect={vi.fn()} />);

        const items = screen.getAllByRole('menuitem');
        expect(items).toHaveLength(3);
        expect(items[0]).toHaveTextContent('Compra de inventario');
        expect(items[1]).toHaveTextContent('Gastos');
        expect(items[2]).toHaveTextContent('Merma');
        expect(screen.queryByText('Escanear factura')).toBeNull();
    });

    it('no muestra nada sin el permiso inv_purchase (Req 14.1)', () => {
        hasPermissionMock.mockReturnValue(false);
        const { container } = render(<ExpenseActionsMenu variant="dropdown" onSelect={vi.fn()} />);
        expect(container).toBeEmptyDOMElement();
        expect(screen.queryByRole('menuitem')).toBeNull();
    });

    it('gatea el menú exactamente por inv_purchase', () => {
        hasPermissionMock.mockImplementation((id: string) => id === 'inv_purchase');
        render(<ExpenseActionsMenu variant="dropdown" onSelect={vi.fn()} />);
        expect(hasPermissionMock).toHaveBeenCalledWith('inv_purchase');
        expect(screen.getAllByRole('menuitem')).toHaveLength(3);
    });

    it('cada opción dispara onSelect con su acción manual (Req 1.6)', () => {
        const onSelect = vi.fn<(a: ExpenseMenuAction) => void>();
        render(<ExpenseActionsMenu variant="sheet" onSelect={onSelect} />);

        fireEvent.click(screen.getByRole('menuitem', { name: 'Compra de inventario' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Gastos' }));
        fireEvent.click(screen.getByRole('menuitem', { name: 'Merma' }));

        expect(onSelect.mock.calls.map(c => c[0])).toEqual([
            'inventory',
            'expense',
            'waste',
        ]);
    });

    it('oculta la opción "Compra de inventario" en el negocio 10001 tanto en sheet como en dropdown', () => {
        currentBusinessId = HIDDEN_PRICES_BUSINESS_ID;

        // Test en variante sheet (móvil)
        const { unmount } = render(<ExpenseActionsMenu variant="sheet" onSelect={vi.fn()} />);
        let items = screen.getAllByRole('menuitem');
        expect(items).toHaveLength(2);
        expect(items[0]).toHaveTextContent('Gastos');
        expect(items[1]).toHaveTextContent('Merma');
        expect(screen.queryByRole('menuitem', { name: 'Compra de inventario' })).toBeNull();
        unmount();

        // Test en variante dropdown (desktop)
        render(<ExpenseActionsMenu variant="dropdown" onSelect={vi.fn()} />);
        items = screen.getAllByRole('menuitem');
        expect(items).toHaveLength(2);
        expect(items[0]).toHaveTextContent('Gastos');
        expect(items[1]).toHaveTextContent('Merma');
        expect(screen.queryByRole('menuitem', { name: 'Compra de inventario' })).toBeNull();
    });
});
