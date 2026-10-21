import React, { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ScanPaymentStep } from './ScanPaymentStep';
import type { ScanPaymentMethodOption, ScanPaymentStepProps } from './ScanPaymentStep';
import type { PaymentDraft } from '../../lib/invoiceScan/types';

/**
 * Pruebas por ejemplo del paso de pago del Escaneo_Unificado.
 * Requisitos: 10.5, 10.6 (reglas del pago de compra), 16.2, 16.3 (todo dentro
 * del paso). Cubre: alternar Contado/Crédito; la pregunta de descuento de caja
 * solo con turno activo y en Contado; elegir y repartir métodos; abono y fecha
 * de vencimiento en Crédito con el confirmar bloqueado sin fecha; aviso de saldo
 * insuficiente; confirmar habilitado que emite `onConfirm`; y los `aria-label`.
 */

const CASH: ScanPaymentMethodOption = { id: 'efectivo', label: 'Efectivo', mappedId: 'cash', balance: 100000 };
const NEQUI: ScanPaymentMethodOption = { id: 'nequi', label: 'Nequi', mappedId: 'nequi', balance: 0 };
const METHODS: ScanPaymentMethodOption[] = [CASH, NEQUI];

const basePayment = (overrides: Partial<PaymentDraft> = {}): PaymentDraft => ({
    isCredit: false,
    dueDate: null,
    paidAmount: 0,
    deductFromCash: null,
    shiftId: null,
    methods: [],
    creditInitialMethodId: null,
    ...overrides,
});

/**
 * Arnés con estado: alimenta de vuelta el `PaymentDraft` que el paso emite, así
 * las interacciones encadenadas (repartir entre dos métodos) reflejan el estado
 * real. Expone el último `onChange` recibido para verificar el payload.
 */
interface HarnessProps extends Omit<ScanPaymentStepProps, 'payment' | 'onChange'> {
    initial: PaymentDraft;
    onChangeSpy?: (p: PaymentDraft) => void;
}

const Harness: React.FC<HarnessProps> = ({ initial, onChangeSpy, ...rest }) => {
    const [payment, setPayment] = useState<PaymentDraft>(initial);
    return (
        <ScanPaymentStep
            payment={payment}
            onChange={next => {
                setPayment(next);
                onChangeSpy?.(next);
            }}
            {...rest}
        />
    );
};

const renderStep = (overrides: Partial<HarnessProps> = {}) => {
    const onChangeSpy = vi.fn();
    const onConfirm = vi.fn();
    const props: HarnessProps = {
        initial: basePayment(),
        total: 240000,
        methods: METHODS,
        hasActiveShift: true,
        issues: [],
        onConfirm,
        onChangeSpy,
        ...overrides,
    };
    const utils = render(<Harness {...props} />);
    return { ...utils, onChangeSpy, onConfirm };
};

const getContado = () => screen.getByRole('button', { name: 'Pago de contado' });
const getCredito = () => screen.getByRole('button', { name: 'Pago a crédito' });
const getConfirm = () => screen.getByRole('button', { name: 'Confirmar registro' });

describe('ScanPaymentStep', () => {
    it('alterna entre Contado y Crédito emitiendo el modo correcto', () => {
        const onChangeSpy = vi.fn();
        renderStep({ onChangeSpy });

        fireEvent.click(getCredito());
        expect(onChangeSpy).toHaveBeenLastCalledWith(expect.objectContaining({ isCredit: true }));
        // En crédito aparecen la fecha de vencimiento y el abono.
        expect(screen.getByLabelText('Fecha de vencimiento del crédito')).toBeInTheDocument();
        expect(screen.getByLabelText('Abono inicial del crédito')).toBeInTheDocument();

        fireEvent.click(getContado());
        expect(onChangeSpy).toHaveBeenLastCalledWith(
            expect.objectContaining({ isCredit: false, dueDate: null, paidAmount: 0 }),
        );
    });

    it('muestra la pregunta de descuento de caja solo con turno activo y en Contado', () => {
        // Instancias independientes: cada caso arranca con su propio estado, sin
        // arrastrar el del anterior (el arnés conserva estado entre rerenders).

        // Contado + turno: aparece la pregunta.
        const contadoShift = render(
            <Harness initial={basePayment()} total={240000} methods={METHODS} hasActiveShift issues={[]} onConfirm={vi.fn()} />,
        );
        expect(screen.getByText('¿El dinero sale de caja?')).toBeInTheDocument();
        contadoShift.unmount();

        // Contado sin turno: no aparece; en su lugar el aviso de caja cerrada.
        const contadoNoShift = render(
            <Harness initial={basePayment()} total={240000} methods={METHODS} hasActiveShift={false} issues={[]} onConfirm={vi.fn()} />,
        );
        expect(screen.queryByText('¿El dinero sale de caja?')).not.toBeInTheDocument();
        expect(screen.getByText(/no hay caja abierta/i)).toBeInTheDocument();
        contadoNoShift.unmount();

        // Crédito con turno: tampoco aparece la pregunta de descuento de caja.
        render(
            <Harness initial={basePayment({ isCredit: true })} total={240000} methods={METHODS} hasActiveShift issues={[]} onConfirm={vi.fn()} />,
        );
        expect(screen.queryByText('¿El dinero sale de caja?')).not.toBeInTheDocument();
    });

    it('permite elegir un método y repartir el pago entre dos métodos', () => {
        const onChangeSpy = vi.fn();
        // Ruta_Gasto (restrictCashToShift=false) para ofrecer todos los métodos.
        renderStep({
            initial: basePayment({ deductFromCash: true, methods: [{ methodId: 'efectivo', mappedId: 'cash', amount: 0 }] }),
            restrictCashToShift: false,
            onChangeSpy,
        });

        // Monto del primer método.
        fireEvent.change(screen.getByLabelText('Monto pagado con Efectivo'), { target: { value: '140.000' } });
        expect(onChangeSpy).toHaveBeenLastCalledWith(
            expect.objectContaining({ methods: [{ methodId: 'efectivo', mappedId: 'cash', amount: 140000 }] }),
        );

        // Agregar un segundo método y repartir.
        fireEvent.click(screen.getByRole('button', { name: 'Agregar otro método de pago' }));
        expect(screen.getByLabelText('Método de pago 2')).toBeInTheDocument();

        // El segundo método arranca en el primer método disponible sin usar (Nequi).
        fireEvent.change(screen.getByLabelText('Monto pagado con Nequi'), { target: { value: '100.000' } });

        const last = onChangeSpy.mock.calls[onChangeSpy.mock.calls.length - 1][0] as PaymentDraft;
        expect(last.methods).toEqual([
            { methodId: 'efectivo', mappedId: 'cash', amount: 140000 },
            { methodId: 'nequi', mappedId: 'nequi', amount: 100000 },
        ]);
    });

    it('en Crédito muestra abono y fecha de vencimiento, y sin fecha deshabilita el confirmar', () => {
        const onConfirm = vi.fn();
        renderStep({
            initial: basePayment({ isCredit: true, dueDate: null }),
            issues: ['missing_due_date'],
            onConfirm,
        });

        expect(screen.getByLabelText('Fecha de vencimiento del crédito')).toBeInTheDocument();
        expect(screen.getByLabelText('Abono inicial del crédito')).toBeInTheDocument();

        const confirm = getConfirm();
        expect(confirm).toBeDisabled();
        expect(confirm).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByText('El crédito necesita una fecha de pago.')).toBeInTheDocument();

        fireEvent.click(confirm);
        fireEvent.keyDown(confirm, { key: 'Enter' });
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('avisa del saldo insuficiente cuando el efectivo no alcanza, sin bloquear el confirmar', () => {
        renderStep({
            initial: basePayment({ deductFromCash: true, methods: [{ methodId: 'efectivo', mappedId: 'cash', amount: 180000 }] }),
            issues: [],
        });

        // 180.000 supera el saldo de efectivo (100.000): aviso de UX.
        expect(screen.getByText(/Saldo insuficiente en Efectivo\. Disponible: \$100\.000/)).toBeInTheDocument();

        // El aviso de saldo no forma parte de las precondiciones: el confirmar sigue habilitado.
        expect(getConfirm()).not.toBeDisabled();
    });

    it('habilita el confirmar sin issues pendientes y emite onConfirm', () => {
        const onConfirm = vi.fn();
        renderStep({
            initial: basePayment({ deductFromCash: true, methods: [{ methodId: 'efectivo', mappedId: 'cash', amount: 240000 }] }),
            issues: [],
            onConfirm,
        });

        const confirm = getConfirm();
        expect(confirm).not.toBeDisabled();
        expect(confirm).toHaveAttribute('aria-disabled', 'false');
        expect(confirm).toHaveTextContent('Confirmar registro · $240.000');

        fireEvent.click(confirm);
        expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('activa el confirmar también con Enter y Espacio', () => {
        const onConfirm = vi.fn();
        renderStep({ issues: [], onConfirm });

        fireEvent.keyDown(getConfirm(), { key: 'Enter' });
        fireEvent.keyDown(getConfirm(), { key: ' ' });
        expect(onConfirm).toHaveBeenCalledTimes(2);
    });

    it('permite agregar otro método de pago en Contado incluso cuando sale de caja', () => {
        renderStep({
            initial: basePayment({ deductFromCash: true, methods: [{ methodId: 'efectivo', mappedId: 'cash', amount: 0 }] }),
            restrictCashToShift: false,
        });

        // Con turno y dinero saliendo de caja, permite agregar otro método (Nequi, etc.)
        expect(screen.getByRole('button', { name: 'Agregar otro método de pago' })).toBeInTheDocument();
    });

    it('expone aria-label en todos los controles del paso', () => {
        renderStep({
            initial: basePayment({ deductFromCash: true, methods: [{ methodId: 'efectivo', mappedId: 'cash', amount: 50000 }] }),
        });

        expect(getContado()).toBeInTheDocument();
        expect(getCredito()).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Sí, el dinero sale de caja' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'No, el dinero no sale de caja' })).toBeInTheDocument();
        expect(screen.getByLabelText('Método de pago 1')).toBeInTheDocument();
        expect(screen.getByLabelText('Monto pagado con Efectivo')).toBeInTheDocument();
        expect(getConfirm()).toBeInTheDocument();
    });

    it('no muestra saldo insuficiente cuando el dinero no sale de caja (fondos externos)', () => {
        renderStep({
            initial: basePayment({
                deductFromCash: false,
                methods: [{ methodId: 'efectivo', mappedId: 'cash', amount: 180000 }],
            }),
            issues: [],
        });

        // 180.000 supera 100.000 pero al no salir de caja no debe mostrar error de saldo insuficiente
        expect(screen.queryByText(/Saldo insuficiente en Efectivo/)).not.toBeInTheDocument();
        expect(screen.getAllByText(/Fondos externos/i).length).toBeGreaterThan(0);
    });

    it('en Crédito con abono inicial muestra la pregunta de caja y permite dividir el pago con otros métodos', () => {
        const onChangeSpy = vi.fn();
        renderStep({
            initial: basePayment({
                isCredit: true,
                dueDate: '2026-09-20',
                paidAmount: 50000,
                deductFromCash: true,
                methods: [{ methodId: 'efectivo', mappedId: 'cash', amount: 50000 }],
            }),
            onChangeSpy,
        });

        expect(screen.getByText('¿El dinero del abono sale de caja?')).toBeInTheDocument();
        expect(screen.getByLabelText('Método de pago 1')).toBeInTheDocument();
        expect(screen.getByLabelText('Monto pagado con Efectivo')).toBeInTheDocument();

        // Debe permitir dividir y agregar otro método como Nequi
        expect(screen.getByRole('button', { name: 'Agregar otro método de pago' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Agregar otro método de pago' }));
        expect(screen.getByLabelText('Método de pago 2')).toBeInTheDocument();
    });
});
