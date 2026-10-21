import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScanSupplierStep, type ScanSupplierStepProps } from './ScanSupplierStep';
import type { SupplierMatchResult } from '../../lib/invoiceScan/supplierMatch';
import type { Supplier } from '../../hooks/useSuppliers';

/**
 * Pruebas por ejemplo del Resolutor_Proveedor.
 * Requisitos: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 11.7, 16.3, 17.1, 17.14.
 */

const makeSupplier = (over: Partial<Supplier> & Pick<Supplier, 'id' | 'name'>): Supplier => ({
    business_id: 'negocio-1',
    nit: undefined,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
});

const DISTRI = makeSupplier({ id: 'sup-1', name: 'Distribuidora Álvarez SAS', nit: '900.123.456-7' });
const LACTEOS = makeSupplier({ id: 'sup-2', name: 'Lácteos del Valle', nit: '800555111' });
const SIN_NIT = makeSupplier({ id: 'sup-3', name: 'Panadería La Espiga' });

const SUPPLIERS: Supplier[] = [DISTRI, LACTEOS, SIN_NIT];

const renderStep = (
    match: SupplierMatchResult<Supplier>,
    overrides: Partial<ScanSupplierStepProps> = {},
) => {
    const onConfirm = vi.fn();
    const props: ScanSupplierStepProps = {
        match,
        suppliers: SUPPLIERS,
        canGoBack: true,
        onBack: vi.fn(),
        onClose: vi.fn(),
        onConfirm,
        ...overrides,
    };
    const utils = render(<ScanSupplierStep {...props} />);
    return { ...utils, onConfirm: props.onConfirm as ReturnType<typeof vi.fn> };
};

const getSearchInput = () => screen.getByLabelText('Buscar un proveedor por nombre o NIT');
const getPrimary = (name: string) => screen.getByRole('button', { name });

describe('ScanSupplierStep — estado confirmado', () => {
    it('muestra el chip con el nombre y el NIT del proveedor emparejado', () => {
        renderStep({ kind: 'confirmed', supplier: DISTRI });

        expect(screen.getByText('Proveedor confirmado')).toBeInTheDocument();
        expect(screen.getByText('Distribuidora Álvarez SAS')).toBeInTheDocument();
        expect(screen.getByText('NIT 900.123.456-7')).toBeInTheDocument();
    });

    it('indica cuando el proveedor confirmado no tiene NIT guardado', () => {
        renderStep({ kind: 'confirmed', supplier: SIN_NIT });

        expect(screen.getByText('Sin NIT registrado')).toBeInTheDocument();
    });

    it('emite la decisión de proveedor existente al continuar', () => {
        const { onConfirm } = renderStep({ kind: 'confirmed', supplier: DISTRI });

        fireEvent.click(getPrimary('Continuar con este proveedor'));

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onConfirm).toHaveBeenCalledWith({
            kind: 'existing',
            id: 'sup-1',
            name: 'Distribuidora Álvarez SAS',
        });
    });

    it('no muestra campos editables ni el buscador mientras el proveedor está confirmado', () => {
        renderStep({ kind: 'confirmed', supplier: DISTRI });

        expect(screen.queryByLabelText('Nombre del proveedor nuevo')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Buscar un proveedor por nombre o NIT')).not.toBeInTheDocument();
    });

    it('abre el buscador dentro del paso al cambiar de proveedor', () => {
        renderStep({ kind: 'confirmed', supplier: DISTRI });

        fireEvent.click(getPrimary('Cambiar de proveedor'));

        expect(getSearchInput()).toBeInTheDocument();
        expect(getSearchInput()).toHaveFocus();
    });
});

describe('ScanSupplierStep — estado proveedor nuevo', () => {
    const NEW_MATCH: SupplierMatchResult<Supplier> = {
        kind: 'new',
        name: 'AGRO INSUMOS DEL SUR',
        nit: '901222333',
        phone: '',
    };

    it('muestra el aviso de proveedor nuevo con el nombre y el NIT detectados en campos editables', () => {
        renderStep(NEW_MATCH);

        expect(screen.getByText('Es un proveedor nuevo')).toBeInTheDocument();

        const nameInput = screen.getByLabelText('Nombre del proveedor nuevo');
        const nitInput = screen.getByLabelText('NIT del proveedor nuevo');
        expect(nameInput).toHaveValue('AGRO INSUMOS DEL SUR');
        expect(nitInput).toHaveValue('901222333');
        expect(nameInput).not.toBeDisabled();
        expect(nitInput).not.toBeDisabled();
    });

    it('emite la decisión de proveedor nuevo con los datos editados', () => {
        const { onConfirm } = renderStep(NEW_MATCH);

        fireEvent.change(screen.getByLabelText('Nombre del proveedor nuevo'), {
            target: { value: 'Agro Insumos del Sur SAS' },
        });
        fireEvent.change(screen.getByLabelText('NIT del proveedor nuevo'), {
            target: { value: '901.222.333-1' },
        });
        fireEvent.click(getPrimary('Usar este proveedor'));

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onConfirm).toHaveBeenCalledWith({
            kind: 'new',
            name: 'Agro Insumos del Sur SAS',
            nit: '901.222.333-1',
            phone: '',
        });
    });

    it('bloquea "Usar este proveedor" con aria-disabled cuando el nombre queda vacío', () => {
        const { onConfirm } = renderStep(NEW_MATCH);

        fireEvent.change(screen.getByLabelText('Nombre del proveedor nuevo'), { target: { value: '   ' } });

        const primary = getPrimary('Usar este proveedor');
        expect(primary).toBeDisabled();
        expect(primary).toHaveAttribute('aria-disabled', 'true');

        fireEvent.click(primary);
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('abre el buscador dentro del paso y seleccionar un proveedor emite la decisión de existente', () => {
        const { onConfirm } = renderStep(NEW_MATCH);

        fireEvent.click(getPrimary('Buscar un proveedor existente'));

        // El buscador es parte del propio paso: no hay selector externo (Req 16.3).
        expect(getSearchInput()).toBeInTheDocument();
        expect(screen.queryByLabelText('Nombre del proveedor nuevo')).not.toBeInTheDocument();

        fireEvent.click(getPrimary('Usar el proveedor Lácteos del Valle'));

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(onConfirm).toHaveBeenCalledWith({
            kind: 'existing',
            id: 'sup-2',
            name: 'Lácteos del Valle',
        });
    });

    it('vuelve al aviso de proveedor nuevo al cancelar la búsqueda', () => {
        renderStep(NEW_MATCH);

        fireEvent.click(getPrimary('Buscar un proveedor existente'));
        fireEvent.click(getPrimary('Cancelar la búsqueda de proveedor'));

        expect(screen.getByLabelText('Nombre del proveedor nuevo')).toHaveValue('AGRO INSUMOS DEL SUR');
        expect(screen.queryByLabelText('Buscar un proveedor por nombre o NIT')).not.toBeInTheDocument();
    });
});

describe('ScanSupplierStep — selección manual obligatoria', () => {
    const MANUAL_MATCH: SupplierMatchResult<Supplier> = { kind: 'manual' };

    it('ofrece el buscador y el botón simétrico para crear un proveedor nuevo', () => {
        renderStep(MANUAL_MATCH);

        expect(getSearchInput()).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Crear nuevo proveedor' })).toBeInTheDocument();
        // La lista no muestra los campos empotrados por defecto
        expect(screen.queryByLabelText('Nombre del proveedor nuevo')).not.toBeInTheDocument();
    });

    it('no permite continuar en el modal sin escribir un nombre de proveedor', () => {
        const { onConfirm } = renderStep(MANUAL_MATCH);

        fireEvent.click(screen.getByRole('button', { name: 'Crear nuevo proveedor' }));

        const primary = getPrimary('Usar este proveedor');
        expect(primary).toBeDisabled();
        expect(primary).toHaveAttribute('aria-disabled', 'true');

        fireEvent.click(primary);
        fireEvent.keyDown(primary, { key: 'Enter' });
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('emite la decisión de existente al elegir un proveedor de la lista', () => {
        const { onConfirm } = renderStep(MANUAL_MATCH);

        fireEvent.click(getPrimary('Usar el proveedor Panadería La Espiga'));

        expect(onConfirm).toHaveBeenCalledWith({
            kind: 'existing',
            id: 'sup-3',
            name: 'Panadería La Espiga',
        });
    });

    it('habilita el continuar y emite la decisión al escribir un proveedor nuevo en el modal', () => {
        const { onConfirm } = renderStep(MANUAL_MATCH);

        fireEvent.click(screen.getByRole('button', { name: 'Crear nuevo proveedor' }));

        fireEvent.change(screen.getByLabelText('Nombre del proveedor nuevo'), {
            target: { value: '  Surtifruver del Norte  ' },
        });

        const primary = getPrimary('Usar este proveedor');
        expect(primary).not.toBeDisabled();
        expect(primary).toHaveAttribute('aria-disabled', 'false');

        fireEvent.click(primary);
        expect(onConfirm).toHaveBeenCalledWith({
            kind: 'new',
            name: 'Surtifruver del Norte',
            nit: '',
            phone: '',
        });
    });
});

describe('ScanSupplierStep — buscador', () => {
    const MANUAL_MATCH: SupplierMatchResult<Supplier> = { kind: 'manual' };

    it('lista todos los proveedores del negocio sin filtro', () => {
        renderStep(MANUAL_MATCH);

        expect(screen.getByRole('button', { name: 'Usar el proveedor Distribuidora Álvarez SAS' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Usar el proveedor Lácteos del Valle' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Usar el proveedor Panadería La Espiga' })).toBeInTheDocument();
    });

    it('filtra por nombre ignorando mayúsculas y acentos', () => {
        renderStep(MANUAL_MATCH);

        fireEvent.change(getSearchInput(), { target: { value: 'lacteos' } });

        expect(screen.getByRole('button', { name: 'Usar el proveedor Lácteos del Valle' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Usar el proveedor Distribuidora Álvarez SAS' })).not.toBeInTheDocument();
    });

    it('filtra por NIT ignorando puntos y guiones', () => {
        renderStep(MANUAL_MATCH);

        fireEvent.change(getSearchInput(), { target: { value: '900123456' } });

        expect(screen.getByRole('button', { name: 'Usar el proveedor Distribuidora Álvarez SAS' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Usar el proveedor Lácteos del Valle' })).not.toBeInTheDocument();
    });

    it('avisa cuando ningún proveedor coincide', () => {
        renderStep(MANUAL_MATCH);

        fireEvent.change(getSearchInput(), { target: { value: 'ferretería' } });

        expect(screen.getByText(/No encontramos proveedores con ese dato/)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^Usar el proveedor/ })).not.toBeInTheDocument();
    });

    it('solo muestra los proveedores recibidos por prop, ya filtrados por el Negocio_Activo', () => {
        renderStep(MANUAL_MATCH, { suppliers: [LACTEOS] });

        expect(screen.getByRole('button', { name: 'Usar el proveedor Lácteos del Valle' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Usar el proveedor Distribuidora Álvarez SAS' })).not.toBeInTheDocument();
    });
});

describe('ScanSupplierStep — accesibilidad', () => {
    it('expone aria-label en todos los controles del estado confirmado', () => {
        renderStep({ kind: 'confirmed', supplier: DISTRI });

        expect(screen.getByRole('button', { name: 'Continuar con este proveedor' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cambiar de proveedor' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Volver al paso anterior' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cerrar el escaneo' })).toBeInTheDocument();
    });

    it('expone aria-label en los campos y las filas del estado manual', () => {
        renderStep({ kind: 'manual' });

        expect(getSearchInput()).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Crear nuevo proveedor' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Usar el proveedor Lácteos del Valle' })).toBeInTheDocument();

        // Al abrir el modal, los campos tienen sus labels accesibles
        fireEvent.click(screen.getByRole('button', { name: 'Crear nuevo proveedor' }));
        expect(screen.getByLabelText('Nombre del proveedor nuevo')).toBeInTheDocument();
        expect(screen.getByLabelText('NIT del proveedor nuevo')).toBeInTheDocument();
    });

    it('activa las acciones con Enter y con Espacio', () => {
        const { onConfirm } = renderStep({ kind: 'confirmed', supplier: DISTRI });

        fireEvent.keyDown(getPrimary('Continuar con este proveedor'), { key: 'Enter' });
        expect(onConfirm).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(getPrimary('Continuar con este proveedor'), { key: ' ' });
        expect(onConfirm).toHaveBeenCalledTimes(2);
    });

    it('activa una fila del buscador con Enter y con Espacio', () => {
        const { onConfirm } = renderStep({ kind: 'manual' });

        const row = getPrimary('Usar el proveedor Lácteos del Valle');
        fireEvent.keyDown(row, { key: 'Enter' });
        fireEvent.keyDown(row, { key: ' ' });

        expect(onConfirm).toHaveBeenCalledTimes(2);
        expect(onConfirm).toHaveBeenLastCalledWith({ kind: 'existing', id: 'sup-2', name: 'Lácteos del Valle' });
    });

    it('mueve el foco al campo de búsqueda al entrar al estado manual', () => {
        renderStep({ kind: 'manual' });

        expect(getSearchInput()).toHaveFocus();
    });
});
