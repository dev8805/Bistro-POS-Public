import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    Employee,
    PayrollReceiptData,
    useEmployeesDirectory
} from '../../hooks/useEmployeesDirectory';
import { useCashRegister } from '../../hooks/useCashRegister';
import { useBusinessSettings } from '../../context/BusinessSettingsContext';
import { useToast } from '../../context/ToastContext';
import { formatCurrency } from '../../lib/formatters';
import {
    downloadPayrollReceiptPDF,
    printPayrollReceiptThermal
} from '../../lib/sharePayrollReceipt';
import { formatPaymentMethodLabel } from '../../lib/paymentMethods';
import { useImageUpload } from '../../hooks/useImageUpload';
import { EvidenceUploader } from '../EvidenceUploader';
import { PayrollConceptDropdown } from '../payroll/PayrollConceptDropdown';
import { formatWithThousands, parseCleanNumber } from '../expense/shared';

interface PayrollPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    employee: Employee | null;
    defaultConcept?: string;
    onSuccess?: () => void;
}

export const PayrollPaymentModal: React.FC<PayrollPaymentModalProps> = ({
    isOpen,
    onClose,
    employee,
    defaultConcept = '',
    onSuccess,
}) => {
    const { showToast } = useToast();
    const { activeShift, balances, expectedCash } = useCashRegister();
    const { paymentMethods } = useBusinessSettings();
    const { settlePayrollPayment } = useEmployeesDirectory();

    const [paymentConcept, setPaymentConcept] = useState<string>(defaultConcept || '');
    const [amount, setAmount] = useState<string>('');
    const [reasonOrNotes, setReasonOrNotes] = useState<string>('');

    const [selectedMethod, setSelectedMethod] = useState<string>('cash');
    const [deductFromCash, setDeductFromCash] = useState<boolean | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Evidencia fotográfica del comprobante firmado
    const evidenceUpload = useImageUpload(null, 'debt-evidence');

    // Estado para la pantalla de éxito con recibo generado
    const [generatedReceipt, setGeneratedReceipt] = useState<PayrollReceiptData | null>(null);
    const [isPrinting, setIsPrinting] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    useEffect(() => {
        if (isOpen && employee) {
            setPaymentConcept(defaultConcept || '');
            setAmount(employee.base_rate && employee.base_rate > 0 ? String(employee.base_rate) : '');
            setReasonOrNotes('');
            setGeneratedReceipt(null);
            setDeductFromCash(null);
            evidenceUpload.deleteImage();
        }
    }, [isOpen, employee, defaultConcept, activeShift]);

    if (!isOpen || !employee) return null;

    // Métodos de pago disponibles
    const availableMethods = paymentMethods.length > 0 ? paymentMethods : ['Efectivo', 'Nequi', 'Daviplata', 'Transferencia'];
    const netAmount = parseFloat(amount) || 0;

    // Validación de saldo de efectivo en caja
    const isCashPayment = selectedMethod.toLowerCase().includes('efectivo') || selectedMethod.toLowerCase() === 'cash';
    const availableCash = balances?.cash ?? expectedCash ?? 0;
    const isCashInsufficient = Boolean(activeShift && deductFromCash === true && isCashPayment && netAmount > availableCash);

    const handleConfirmPayment = async () => {
        if (!paymentConcept) {
            showToast('Selecciona un concepto de pago', 'warning');
            return;
        }

        if (netAmount <= 0) {
            showToast('Ingresa un valor a pagar mayor a 0', 'error');
            return;
        }

        if (activeShift && deductFromCash === null) {
            showToast('Selecciona si el dinero sale de caja o de fondos externos', 'warning');
            return;
        }

        if (isCashInsufficient) {
            showToast(`Saldo insuficiente en caja. Disponible: $${formatCurrency(availableCash)} COP`, 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await settlePayrollPayment({
                employee_id: employee.id,
                concept: paymentConcept,
                gross_amount: netAmount,
                payment_method: selectedMethod.toLowerCase(),
                deductFromCashRegister: activeShift ? (deductFromCash === true) : false,
                activeShiftId: activeShift?.id || null,
                notes: reasonOrNotes || undefined,
                receipt_url: evidenceUpload.imageUrl || undefined,
                cash_amount: (activeShift && deductFromCash === true && isCashPayment) ? netAmount : 0
            });

            evidenceUpload.markAsSaved();
            showToast('Pago registrado correctamente', 'success');
            setGeneratedReceipt(res.receiptData);
            if (onSuccess) onSuccess();
        } catch (err: any) {
            showToast(err.message || 'Error al procesar pago', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePrintThermal = async () => {
        if (!generatedReceipt) return;
        setIsPrinting(true);
        try {
            const ok = await printPayrollReceiptThermal(generatedReceipt, '80mm');
            if (ok) {
                showToast('Tirilla impresa con éxito', 'success');
            } else {
                showToast('Verifica la conexión con la impresora térmica', 'warning');
            }
        } catch {
            showToast('Error al intentar imprimir', 'error');
        } finally {
            setIsPrinting(false);
        }
    };

    const handleDownloadPdf = async () => {
        if (!generatedReceipt) return;
        setIsGeneratingPdf(true);
        try {
            await downloadPayrollReceiptPDF(generatedReceipt);
            showToast('Comprobante PDF generado', 'success');
        } catch {
            showToast('Error generando PDF', 'error');
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
            role="dialog"
            aria-modal="true"
        >
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="size-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/60 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-2xl">person</span>
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-base font-extrabold text-gray-900 dark:text-white truncate">
                                {employee.full_name}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {employee.job_title || 'Colaborador'} {employee.document_number ? `· CC ${employee.document_number}` : ''}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="size-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        aria-label="Cerrar"
                    >
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>

                {/* Body: Si ya se generó el recibo, muestra pantalla de éxito con botones de impresión/PDF */}
                {generatedReceipt ? (
                    <div className="p-6 flex-1 overflow-y-auto flex flex-col items-center text-center">
                        <div className="size-16 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-4">
                            <span className="material-symbols-outlined text-3xl font-bold">check_circle</span>
                        </div>

                        <span className="text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 mb-1">
                            Pago Completado
                        </span>
                        <h4 className="text-2xl font-black text-gray-900 dark:text-white mb-2">
                            ${formatCurrency(generatedReceipt.netAmount)} COP
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mb-6">
                            {generatedReceipt.conceptDescription}. Se ha guardado el registro en gastos y actualizado el historial.
                        </p>

                        <div className="grid grid-cols-2 gap-3 w-full mb-4">
                            <button
                                type="button"
                                onClick={handlePrintThermal}
                                disabled={isPrinting}
                                className="h-11 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                            >
                                <span className="material-symbols-outlined text-base">print</span>
                                <span>{isPrinting ? 'Imprimiendo...' : 'Imprimir Tirilla'}</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleDownloadPdf}
                                disabled={isGeneratingPdf}
                                className="h-11 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                            >
                                <span className="material-symbols-outlined text-base">picture_as_pdf</span>
                                <span>{isGeneratingPdf ? 'Generando...' : 'Descargar PDF'}</span>
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm uppercase tracking-wider shadow-md transition-all flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-lg">check</span>
                            Listo / Cerrar
                        </button>
                    </div>
                ) : (
                    /* Formulario de Pago Unificado */
                    <div className="p-6 flex-1 overflow-y-auto space-y-5">
                        {/* Evidencia fotográfica del comprobante firmado */}
                        <EvidenceUploader
                            previewUrl={evidenceUpload.previewUrl}
                            uploading={evidenceUpload.uploading}
                            statusText={evidenceUpload.statusText}
                            showCropper={evidenceUpload.showCropper}
                            cropperImageSrc={evidenceUpload.cropperImageSrc}
                            onCropComplete={evidenceUpload.onCropComplete}
                            onCropCancel={evidenceUpload.onCropCancel}
                            showInAppCamera={evidenceUpload.showInAppCamera}
                            onCameraCapture={evidenceUpload.onCameraCapture}
                            onCameraClose={evidenceUpload.onCameraClose}
                            triggerCamera={evidenceUpload.triggerCamera}
                            triggerGallery={evidenceUpload.triggerGallery}
                            deleteImage={evidenceUpload.deleteImage}
                            label="Foto del comprobante firmado (opcional)"
                        />

                        {/* Selector de Concepto (Dropdown editable con + Nuevo) */}
                        <PayrollConceptDropdown
                            selectedConcept={paymentConcept}
                            onSelectConcept={setPaymentConcept}
                        />

                        {/* Monto del Pago */}
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                                VALOR A PAGAR ($) *
                            </label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-lg">$</span>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    value={formatWithThousands(amount)}
                                    onChange={e => setAmount(parseCleanNumber(e.target.value))}
                                    placeholder="0"
                                    className="w-full h-12 pl-9 pr-4 bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-2xl text-lg font-black text-gray-900 dark:text-white outline-none focus:border-emerald-500 tabular-nums shadow-sm"
                                    autoFocus
                                />
                            </div>
                        </div>

                        {/* Observaciones opcionales */}
                        <div>
                            <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">
                                OBSERVACIONES (OPCIONAL)
                            </label>
                            <input
                                type="text"
                                value={reasonOrNotes}
                                onChange={e => setReasonOrNotes(e.target.value)}
                                placeholder="Ej: Turno fin de semana, propina, abono..."
                                className="w-full h-11 px-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold text-gray-800 dark:text-white outline-none focus:border-emerald-500 shadow-sm"
                            />
                        </div>

                        {/* Control de Turno de Caja y Método de Pago */}
                        <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                            {/* Detección de Turno Abierto y Selector Sí / No */}
                            {activeShift ? (
                                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/80 rounded-2xl space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                                            ¿EL DINERO SALE DE CAJA?
                                        </label>
                                        <div className="flex bg-gray-200/70 dark:bg-gray-900 p-1 rounded-xl gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setDeductFromCash(true)}
                                                className={`px-4 py-1.5 text-xs font-black tracking-wider uppercase rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                                                    deductFromCash === true
                                                        ? 'bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-sm'
                                                        : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                                                }`}
                                            >
                                                {deductFromCash === true && <span className="material-symbols-outlined text-xs">check</span>}
                                                Sí
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setDeductFromCash(false)}
                                                className={`px-4 py-1.5 text-xs font-black tracking-wider uppercase rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                                                    deductFromCash === false
                                                        ? 'bg-white dark:bg-gray-700 text-rose-500 dark:text-rose-400 shadow-sm'
                                                        : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                                                }`}
                                            >
                                                {deductFromCash === false && <span className="material-symbols-outlined text-xs">close</span>}
                                                No
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                        {deductFromCash === true
                                            ? `El egreso se descontará de "${activeShift.register?.name || 'Caja física'}" (únicamente en efectivo).`
                                            : deductFromCash === false
                                            ? 'Fondos externos: No se registrará en este turno ni afectará el arqueo de caja.'
                                            : 'Indica si el dinero saldrá del efectivo de la caja o de fondos externos.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200/80 dark:border-gray-700/80 flex items-center gap-3">
                                    <div className="size-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40 flex items-center justify-center shrink-0">
                                        <span className="material-symbols-outlined text-lg">point_of_sale</span>
                                    </div>
                                    <div className="text-xs min-w-0 leading-snug">
                                        <span className="font-bold text-gray-900 dark:text-white">Sin caja abierta:</span>{' '}
                                        <span className="font-medium text-gray-500 dark:text-gray-400">
                                            Este pago no se registrará en ningún turno ni afectará arqueos de caja.
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Mostrar métodos de pago únicamente después de elegir Sí o No (o si no hay turno abierto) */}
                            {(!activeShift || deductFromCash !== null) && (
                                <>
                                    {/* Selector de Método de Pago */}
                                    <div className="space-y-1.5">
                                        <label className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                                            MÉTODO DE PAGO
                                        </label>
                                        <select
                                            value={selectedMethod}
                                            onChange={e => setSelectedMethod(e.target.value)}
                                            className="w-full h-11 px-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs font-bold text-gray-800 dark:text-white outline-none"
                                        >
                                            {availableMethods.map(m => (
                                                <option key={m} value={m.toLowerCase()}>{formatPaymentMethodLabel(m)}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Alerta de saldo insuficiente o indicador de caja */}
                                    {activeShift && deductFromCash === true ? (
                                        isCashPayment && (
                                            isCashInsufficient ? (
                                                <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center gap-2.5 text-xs text-red-700 dark:text-red-300">
                                                    <span className="material-symbols-outlined text-red-600 text-lg shrink-0">error</span>
                                                    <div>
                                                        <span className="font-bold">Efectivo insuficiente en caja.</span> Disponible: ${formatCurrency(availableCash)} COP. Faltan ${formatCurrency(netAmount - availableCash)} COP.
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/40 text-[11px] font-bold text-gray-500 dark:text-gray-400 flex items-center justify-between">
                                                    <span>Efectivo disponible en caja:</span>
                                                    <span className="font-black text-emerald-600 dark:text-emerald-400">${formatCurrency(availableCash)} COP</span>
                                                </div>
                                            )
                                        )
                                    ) : activeShift && deductFromCash === false ? (
                                        <div className="px-3 py-2.5 rounded-xl bg-gray-50/80 dark:bg-gray-800/40 border border-gray-200/60 dark:border-gray-700/60 text-[11px] font-bold text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm text-emerald-600 dark:text-emerald-400 shrink-0">info</span>
                                            <span>Fondos externos: No se registrará en el turno actual ni afectará el arqueo de caja.</span>
                                        </div>
                                    ) : null}
                                </>
                            )}
                        </div>

                        {/* Resumen Neto y Botón de Pago */}
                        <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-3">
                            <div className="flex items-baseline justify-between gap-2 flex-wrap sm:flex-nowrap">
                                <span className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 shrink-0">
                                    TOTAL A PAGAR:
                                </span>
                                <div className="text-right min-w-0">
                                    <span className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white whitespace-nowrap">
                                        ${formatCurrency(netAmount)}
                                    </span>
                                    <span className="text-xs sm:text-sm font-black text-gray-500 dark:text-gray-400 ml-1">
                                        COP
                                    </span>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleConfirmPayment}
                                disabled={
                                    isSubmitting ||
                                    !paymentConcept ||
                                    netAmount <= 0 ||
                                    (Boolean(activeShift) && deductFromCash === null) ||
                                    isCashInsufficient
                                }
                                className="w-full h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm uppercase tracking-wider shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-xl">payments</span>
                                {isSubmitting
                                    ? 'Procesando...'
                                    : (Boolean(activeShift) && deductFromCash === null)
                                    ? 'Elige si el dinero sale de caja'
                                    : isCashInsufficient
                                    ? 'Saldo insuficiente en caja'
                                    : `Confirmar Pago ($${formatCurrency(netAmount)})`}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};
