import React, { useState, useEffect, useRef } from 'react';
import { DocumentCropper } from './DocumentCropper';
import { InAppCamera } from './InAppCamera';
import { PCWebcamModal } from './PCWebcamModal';
import { usePlanFeatures } from '../hooks/usePlanFeatures';
import { UpgradeProModal } from './modals/UpgradeProModal';
import { Screen } from '../types';

const isMobileDevice = (): boolean => {
    if (typeof window === 'undefined') return false;
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.maxTouchPoints > 1 && 'ontouchstart' in window);
};

interface EvidenceUploaderProps {
    previewUrl: string | null;
    uploading: boolean;
    statusText: string;
    showCropper: boolean;
    cropperImageSrc: string | null;
    onCropComplete: (blob: Blob, removeBg?: boolean) => Promise<void>;
    onCropCancel: () => void;
    showInAppCamera: boolean;
    onCameraCapture: (file: File) => void;
    onCameraClose: () => void;
    triggerCamera: () => void;
    triggerGallery: () => void;
    deleteImage: () => void | Promise<void>;
    label?: string;
    compact?: boolean;
    onNavigate?: (screen: Screen) => void;
    onScanWithAI?: () => void;
}

export const EvidenceUploader: React.FC<EvidenceUploaderProps> = ({
    previewUrl, uploading, statusText, showCropper, cropperImageSrc,
    onCropComplete, onCropCancel, showInAppCamera, onCameraCapture, onCameraClose,
    triggerCamera, triggerGallery, deleteImage, label = 'Evidencia (opcional)', compact = false,
    onNavigate,
    onScanWithAI,
}) => {
    const thumbSize = compact ? 'size-14' : 'size-20';
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [showPCWebcam, setShowPCWebcam] = useState(false);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const { canUploadEvidence } = usePlanFeatures();

    useEffect(() => {
        setImageError(false);
    }, [previewUrl]);

    const hasValidPreview = !!previewUrl && !imageError;

    const handleActionTrigger = (callback: () => void) => {
        if (!canUploadEvidence) {
            setShowUpgradeModal(true);
            return;
        }
        callback();
    };

    const handleCameraClick = () => {
        handleActionTrigger(() => {
            if (isMobileDevice()) {
                cameraInputRef.current?.click();
                return;
            }
            setShowPCWebcam(true);
        });
    };

    const handleNativeCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        onCameraCapture(file);
        e.target.value = '';
    };

    const handleCloseCamera = () => {
        setShowPCWebcam(false);
        onCameraClose();
    };

    const handlePCWebcamCapture = (file: File) => {
        setShowPCWebcam(false);
        onCameraCapture(file);
    };

    return (
        <div className="w-full">
            <div className="flex items-center gap-1.5 mb-2">
                <label className="block text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-[0.12em]">
                    {label}
                </label>
                {!canUploadEvidence && (
                    <span className="px-1.5 py-0.5 text-[9px] font-black bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 rounded border border-amber-300/60">
                        PRO
                    </span>
                )}
            </div>
            <div className="flex items-center gap-3">
                <div className={`${thumbSize} shrink-0 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center overflow-hidden relative`}>
                    {hasValidPreview ? (
                        <button
                            type="button"
                            onClick={() => setLightboxOpen(true)}
                            className="w-full h-full cursor-zoom-in group"
                            aria-label="Ampliar imagen"
                        >
                            <img
                                src={previewUrl!}
                                alt="Evidencia"
                                className="w-full h-full object-cover"
                                onError={() => setImageError(true)}
                            />
                            <span className="absolute bottom-0.5 right-0.5 size-5 flex items-center justify-center rounded-md bg-black/55 text-white opacity-90 group-hover:opacity-100 transition-opacity">
                                <span className="material-symbols-outlined text-[13px]">zoom_in</span>
                            </span>
                        </button>
                    ) : (
                        <span className="material-symbols-outlined text-gray-400 text-2xl">attach_file</span>
                    )}
                    {uploading && (
                        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1">
                            <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            {statusText && <span className="text-white text-[8px] font-medium text-center px-1">{statusText}</span>}
                        </div>
                    )}
                </div>
                <div className="flex-1 flex flex-col gap-1.5">
                    {hasValidPreview && !uploading ? (
                        <div className="flex gap-2">
                            <button type="button" onClick={() => handleActionTrigger(triggerGallery)} className="flex-1 h-9 flex items-center justify-center gap-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-xs hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all">
                                <span className="material-symbols-outlined text-[16px]">sync</span> Cambiar
                            </button>
                            <button type="button" onClick={() => deleteImage()} className="size-9 flex items-center justify-center bg-red-50 dark:bg-red-900/20 text-red-500 rounded-xl hover:bg-red-100 active:scale-95 transition-all">
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                        </div>
                    ) : onScanWithAI ? (
                        <div className="flex gap-2 items-stretch">
                            <div className="flex flex-col gap-1.5 shrink-0 w-28 sm:w-32">
                                <button
                                    type="button"
                                    onClick={handleCameraClick}
                                    disabled={uploading}
                                    className="h-9 px-2.5 flex items-center justify-center gap-1.5 bg-primary text-[#102218] rounded-xl font-bold text-xs active:scale-95 transition-transform shadow-sm disabled:opacity-50"
                                >
                                    <span className="material-symbols-outlined text-[16px] max-[430px]:hidden">photo_camera</span> Cámara
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleActionTrigger(triggerGallery)}
                                    disabled={uploading}
                                    className="h-9 px-2.5 flex items-center justify-center gap-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-xs hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    <span className="material-symbols-outlined text-[16px] max-[430px]:hidden">image</span> Galería
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={onScanWithAI}
                                disabled={uploading}
                                className="flex-1 h-[78px] px-2 py-2 flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-br from-indigo-50/90 via-purple-50/40 to-indigo-100/50 dark:from-indigo-950/40 dark:via-purple-950/20 dark:to-indigo-900/30 border border-indigo-200/90 dark:border-indigo-800/60 text-indigo-950 dark:text-indigo-200 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md hover:shadow-indigo-500/10 active:scale-[0.98] transition-all cursor-pointer group"
                                aria-label="Escanear factura con IA"
                            >
                                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-white bg-gradient-to-r from-[#4285F4] via-[#9B72CB] to-[#D96570] shadow-xs group-hover:scale-105 transition-transform">
                                    <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                                        auto_awesome
                                    </span>
                                    IA
                                </span>
                                <span className="text-[11px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 tracking-tight text-center leading-tight">
                                    Escanear factura
                                </span>
                            </button>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <button type="button" onClick={handleCameraClick} disabled={uploading} className="flex-1 h-9 flex items-center justify-center gap-1.5 bg-primary text-[#102218] rounded-xl font-bold text-xs active:scale-95 transition-transform shadow-sm disabled:opacity-50">
                                <span className="material-symbols-outlined text-[16px] max-[430px]:hidden">photo_camera</span> Cámara
                            </button>
                            <button type="button" onClick={() => handleActionTrigger(triggerGallery)} disabled={uploading} className="flex-1 h-9 flex items-center justify-center gap-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-xs hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all disabled:opacity-50">
                                <span className="material-symbols-outlined text-[16px] max-[430px]:hidden">image</span> Galería
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <UpgradeProModal
                isOpen={showUpgradeModal}
                onClose={() => setShowUpgradeModal(false)}
                featureName="Evidencia Digital de Facturas en la Nube"
                featureDescription="Adjunta y respalda fotos de facturas físicas y comprobantes de pago de proveedores directamente en la nube."
                onUpgrade={onNavigate ? () => onNavigate(Screen.SUBSCRIPTION_PLANS) : undefined}
            />

            {showCropper && cropperImageSrc && (
                <DocumentCropper
                    imageSrc={cropperImageSrc}
                    onConfirm={(blob) => onCropComplete(blob, false)}
                    onCancel={onCropCancel}
                    title="Ajusta el recorte"
                    subtitle="Alinea las esquinas con el comprobante"
                />
            )}
            {(showInAppCamera || showPCWebcam) && (
                isMobileDevice() ? (
                    <InAppCamera onCapture={onCameraCapture} onClose={handleCloseCamera} />
                ) : (
                    <PCWebcamModal
                        onCapture={handlePCWebcamCapture}
                        onClose={handleCloseCamera}
                        title="Cámara de Factura / Evidencia"
                        captureButtonText="Capturar Comprobante"
                    />
                )
            )}

            <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleNativeCameraChange}
            />

            {lightboxOpen && previewUrl && (
                <div
                    className="fixed inset-0 z-[140] bg-black/95 flex flex-col animate-[fadeIn_0.2s_ease-out]"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="flex items-center justify-end p-3 pt-[max(12px,env(safe-area-inset-top))] shrink-0">
                        <button
                            type="button"
                            onClick={() => setLightboxOpen(false)}
                            className="size-11 flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 active:scale-90 transition-all"
                            aria-label="Cerrar"
                        >
                            <span className="material-symbols-outlined text-2xl">close</span>
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => setLightboxOpen(false)}
                        className="flex-1 min-h-0 w-full flex items-center justify-center p-4 cursor-zoom-out overflow-auto"
                        aria-label="Cerrar imagen ampliada"
                    >
                        <img src={previewUrl} alt="Evidencia ampliada" className="max-w-full max-h-full object-contain" />
                    </button>
                    <div className="flex justify-center pb-[max(20px,env(safe-area-inset-bottom))] pt-2 shrink-0">
                        <span className="text-white/70 text-xs font-medium">Toca la imagen para cerrar</span>
                    </div>
                </div>
            )}
        </div>
    );
};
