import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    Employee,
    PayrollPaymentHistoryItem,
    useEmployeesDirectory
} from '../../hooks/useEmployeesDirectory';
import { formatCurrency } from '../../lib/formatters';
import { useToast } from '../../context/ToastContext';
import { useImageUpload } from '../../hooks/useImageUpload';
import { formatPaymentMethodLabel } from '../../lib/paymentMethods';
import { ImageCropper } from '../ImageCropper';
import { InAppCamera } from '../InAppCamera';
import { EvidenceViewer } from '../EvidenceViewer';

interface EmployeeAdvancesListModalProps {
    isOpen: boolean;
    onClose: () => void;
    employee: Employee | null;
    onOpenPaymentModal?: (employee: Employee) => void;
}

interface ActiveUploadTarget {
    id: string;
    title: string;
}

const PAGE_SIZE = 10;

export const EmployeeAdvancesListModal: React.FC<EmployeeAdvancesListModalProps> = ({
    isOpen,
    onClose,
    employee,
    onOpenPaymentModal,
}) => {
    const { showToast } = useToast();
    const {
        fetchPayrollPayments,
        updatePayrollPaymentEvidence
    } = useEmployeesDirectory();

    const [payrollPayments, setPayrollPayments] = useState<PayrollPaymentHistoryItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);

    // Estado del visor unificado de evidencia
    const [selectedPaymentEvidence, setSelectedPaymentEvidence] = useState<PayrollPaymentHistoryItem | null>(null);

    // Estado para adjuntar/actualizar evidencia desde el historial
    const [uploadTarget, setUploadTarget] = useState<ActiveUploadTarget | null>(null);
    const [showPhotoSourceMenu, setShowPhotoSourceMenu] = useState(false);
    const upload = useImageUpload(null, 'debt-evidence');
    const isSavingEvidenceRef = useRef(false);

    const loadData = async () => {
        if (!employee) return;
        setLoading(true);
        try {
            const paymentsData = await fetchPayrollPayments(employee.id, PAGE_SIZE, 0);
            setPayrollPayments(paymentsData);
            setHasMore(paymentsData.length === PAGE_SIZE);
        } catch {
            showToast('Error al cargar historial', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleLoadMore = async () => {
        if (!employee || loading || loadingMore || !hasMore) return;
        setLoadingMore(true);
        try {
            const nextPayments = await fetchPayrollPayments(employee.id, PAGE_SIZE, payrollPayments.length);
            setPayrollPayments(prev => [...prev, ...nextPayments]);
            setHasMore(nextPayments.length === PAGE_SIZE);
        } catch {
            showToast('Error al cargar más movimientos', 'error');
        } finally {
            setLoadingMore(false);
        }
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop - clientHeight < 60 && hasMore && !loading && !loadingMore) {
            handleLoadMore();
        }
    };

    useEffect(() => {
        if (isOpen && employee) {
            loadData();
            setSelectedPaymentEvidence(null);
            setUploadTarget(null);
            setShowPhotoSourceMenu(false);
            upload.deleteImage();
        }
    }, [isOpen, employee]);

    // Cuando se complete la subida de una nueva imagen de evidencia
    useEffect(() => {
        const persistEvidence = async () => {
            if (upload.imageUrl && uploadTarget && !upload.uploading && !isSavingEvidenceRef.current) {
                isSavingEvidenceRef.current = true;
                try {
                    await updatePayrollPaymentEvidence(uploadTarget.id, upload.imageUrl);
                    upload.markAsSaved();
                    showToast('Evidencia guardada exitosamente', 'success');
                    setUploadTarget(null);
                    setShowPhotoSourceMenu(false);
                    await loadData();
                } catch {
                    showToast('Error al guardar evidencia', 'error');
                } finally {
                    isSavingEvidenceRef.current = false;
                }
            }
        };
        persistEvidence();
    }, [upload.imageUrl, upload.uploading, uploadTarget]);

    if (!isOpen || !employee) return null;

    const handleTriggerAttachEvidence = (target: ActiveUploadTarget) => {
        setUploadTarget(target);
        setShowPhotoSourceMenu(true);
    };

    return createPortal(
        <>
            <div
                className="fixed inset-0 md:left-[var(--sidebar-w,15rem)] z-[100] flex justify-end"
                role="dialog"
                aria-modal="true"
            >
                <div
                    className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
                    role="button"
                    tabIndex={-1}
                    onClick={onClose}
                    onKeyDown={(e) => e.key === 'Escape' && onClose()}
                    aria-label="Cerrar"
                />
                <div
                    className="relative w-full max-w-md h-full bg-surface-light dark:bg-surface-dark border-l border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden flex flex-col animate-[slideInRight_0.4s_cubic-bezier(0.16,1,0.3,1)]"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="size-11 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800/60 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-2xl">history</span>
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-base font-extrabold text-gray-900 dark:text-white truncate">
                                    Historial de {employee.full_name}
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

                    {/* Lista Única y Continua de Pagos con Scroll Infinito */}
                    <div
                        onScroll={handleScroll}
                        className="px-6 flex-1 overflow-y-auto divide-y divide-gray-200 dark:divide-gray-700 custom-scrollbar"
                    >
                        {loading ? (
                            <div className="py-16 text-center text-gray-400 text-xs font-bold flex flex-col items-center gap-2">
                                <div className="size-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                <span>Cargando historial de pagos...</span>
                            </div>
                        ) : payrollPayments.length === 0 ? (
                            <div className="py-16 text-center text-gray-400 flex flex-col items-center gap-2">
                                <span className="material-symbols-outlined text-4xl text-gray-300 dark:text-gray-600">
                                    folder_open
                                </span>
                                <p className="text-xs font-bold">No hay pagos registrados para este colaborador</p>
                                {onOpenPaymentModal && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onClose();
                                            onOpenPaymentModal(employee);
                                        }}
                                        className="mt-2 px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm"
                                    >
                                        <span className="material-symbols-outlined text-base">payments</span>
                                        Registrar Primer Pago
                                    </button>
                                )}
                            </div>
                        ) : (
                            payrollPayments.map(pay => {
                                const conceptLabel = pay.payroll_concept || 'Pago a Personal';
                                return (
                                    <div
                                        key={pay.id}
                                        className="py-5 space-y-2"
                                    >
                                        {/* Fila superior: Categoría, Fecha, Método y Monto */}
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 shrink-0">
                                                    {conceptLabel}
                                                </span>
                                                <span className="text-xs font-bold text-gray-500 dark:text-gray-400 shrink-0">
                                                    {pay.expense_date}
                                                </span>
                                                <span className="text-[10px] font-bold text-gray-400 uppercase shrink-0">
                                                    · {formatPaymentMethodLabel(pay.payment_method)}
                                                </span>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="text-base font-black text-gray-900 dark:text-white tabular-nums">
                                                    ${formatCurrency(pay.net_amount ?? pay.amount)} COP
                                                </div>
                                            </div>
                                        </div>

                                        {/* Observación / Descripción: Usa el ancho completo, sin cortar ni truncar */}
                                        {pay.description && (
                                            <p className="text-xs font-bold text-gray-800 dark:text-gray-200 break-words whitespace-normal leading-relaxed w-full">
                                                {pay.description}
                                            </p>
                                        )}

                                        {/* Empleado que realizó el pago */}
                                        {pay.created_by_name && (
                                            <div className="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                                                <span className="material-symbols-outlined text-[14px] text-gray-400 shrink-0">badge</span>
                                                <span>Pagado por: <strong className="font-bold text-gray-700 dark:text-gray-200">{pay.created_by_name}</strong></span>
                                                {pay.created_by_role && (
                                                    <span className="text-[10px] text-gray-400">({pay.created_by_role})</span>
                                                )}
                                            </div>
                                        )}

                                        {/* Evidencia fotográfica */}
                                        <div className="flex items-center gap-2 pt-0.5">
                                            {pay.receipt_url ? (
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        onClick={() => setSelectedPaymentEvidence(pay)}
                                                        className="relative size-9 rounded-xl overflow-hidden border border-emerald-300 dark:border-emerald-700 shadow-xs cursor-pointer shrink-0 group"
                                                        title="Ver evidencia"
                                                    >
                                                        <img src={pay.receipt_url} alt="Comprobante" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                                                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 flex items-center justify-center transition-colors">
                                                            <span className="material-symbols-outlined text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">zoom_in</span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedPaymentEvidence(pay)}
                                                        className="size-7 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 text-gray-500 flex items-center justify-center border border-gray-200 dark:border-gray-700 transition-colors"
                                                        title="Ver opciones de evidencia"
                                                    >
                                                        <span className="material-symbols-outlined text-xs">edit</span>
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => handleTriggerAttachEvidence({
                                                        id: pay.id,
                                                        title: `Adjuntar comprobante firmado`
                                                    })}
                                                    className="px-2.5 py-1 rounded-xl bg-gray-50 dark:bg-gray-800/60 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-gray-600 dark:text-gray-300 hover:text-emerald-700 font-bold text-xs flex items-center gap-1.5 border border-gray-200 dark:border-gray-700 transition-all active:scale-95"
                                                >
                                                    <span className="material-symbols-outlined text-sm text-emerald-600">add_a_photo</span>
                                                    <span>Agregar evidencia</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}

                        {/* Indicador de carga de siguientes elementos */}
                        {loadingMore && (
                            <div className="py-4 flex items-center justify-center gap-2 text-gray-400 text-xs font-bold">
                                <div className="size-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                <span>Cargando más movimientos...</span>
                            </div>
                        )}

                        {/* Indicador de fin de lista cuando hay más de una página */}
                        {!loading && !hasMore && payrollPayments.length > PAGE_SIZE && (
                            <div className="py-4 text-center text-[11px] font-semibold text-gray-400 dark:text-gray-500">
                                Fin del historial
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 flex justify-between items-center shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                        >
                            Cerrar
                        </button>
                        {onOpenPaymentModal && (
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    onOpenPaymentModal(employee);
                                }}
                                className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
                            >
                                <span className="material-symbols-outlined text-base">payments</span>
                                <span>Registrar Pago</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Menú de selección de cámara / galería para subir o actualizar evidencia */}
            {showPhotoSourceMenu && (
                <div
                    className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn"
                    onClick={() => setShowPhotoSourceMenu(false)}
                >
                    <div
                        className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl animate-scaleUp"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="text-center">
                            <h4 className="text-sm font-black text-gray-900 dark:text-white">
                                {uploadTarget?.title || 'Adjuntar evidencia fotográfica'}
                            </h4>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Selecciona el origen de la foto del comprobante
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowPhotoSourceMenu(false);
                                    upload.triggerCamera();
                                }}
                                className="p-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs flex flex-col items-center gap-2 shadow-md transition-all active:scale-95"
                            >
                                <span className="material-symbols-outlined text-2xl">photo_camera</span>
                                <span>Tomar Foto</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    setShowPhotoSourceMenu(false);
                                    upload.triggerGallery();
                                }}
                                className="p-4 rounded-2xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-800 dark:text-white font-bold text-xs flex flex-col items-center gap-2 transition-all active:scale-95 border border-gray-200 dark:border-gray-700"
                            >
                                <span className="material-symbols-outlined text-2xl">image</span>
                                <span>Galería</span>
                            </button>
                        </div>

                        <button
                            type="button"
                            onClick={() => setShowPhotoSourceMenu(false)}
                            className="w-full py-2.5 text-xs font-bold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Recortador (Cropper) */}
            {upload.showCropper && upload.cropperImageSrc && (
                <ImageCropper
                    imageSrc={upload.cropperImageSrc}
                    onCropComplete={upload.onCropComplete}
                    onCancel={upload.onCropCancel}
                />
            )}

            {/* Cámara integrada */}
            {upload.showInAppCamera && (
                <InAppCamera
                    onCapture={upload.onCameraCapture}
                    onClose={upload.onCameraClose}
                />
            )}

            {/* Visor unificado de evidencia con Zoom gradual y compartir por WhatsApp */}
            {selectedPaymentEvidence && employee && (
                <EvidenceViewer
                    item={{
                        id: selectedPaymentEvidence.id,
                        evidence_url: selectedPaymentEvidence.receipt_url,
                        title: 'Evidencia del pago',
                        personName: employee.full_name,
                        typeLabel: selectedPaymentEvidence.payroll_concept || 'Pago a Personal',
                        shareTypeLabel: '',
                        amount: selectedPaymentEvidence.net_amount ?? selectedPaymentEvidence.amount,
                        dateText: selectedPaymentEvidence.expense_date,
                    }}
                    onClose={() => setSelectedPaymentEvidence(null)}
                    onEvidenceChange={async (id, url) => {
                        await updatePayrollPaymentEvidence(id, url);
                        setSelectedPaymentEvidence(prev => prev ? { ...prev, receipt_url: url } : null);
                        setPayrollPayments(prev => prev.map(p => p.id === id ? { ...p, receipt_url: url } : p));
                    }}
                />
            )}
        </>,
        document.body
    );
};
