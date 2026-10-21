import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScanStepShell } from './ScanStepShell';
import { PCWebcamModal } from '../PCWebcamModal';
import type { ScanDestination, ScanProgress } from '../../lib/invoiceScan/types';
/**
 * Paso de captura: ofrece las fuentes de imagen (cámara, galería y pegar captura)
 * y avisa el límite de peso del archivo.
 *
 * Requisitos: 2.1 (fuentes de captura), 2.3 (límite de 50 MB), 16.6.
 */

/** Límite de peso del archivo que informa el aviso (Req 2.3). */
export const SCAN_MAX_FILE_MB = 50;

const NO_OP = (): void => { };

const isActivationKey = (key: string): boolean => key === 'Enter' || key === ' ' || key === 'Spacebar';

const DESTINATION_SUBTITLE: Record<ScanDestination, string> = {
    inventory: 'Compra de inventario. La misma foto queda como evidencia.',
    expense: 'Gasto. La misma foto queda como evidencia.',
};

interface SourceButtonProps {
    icon: string;
    title: React.ReactNode;
    hint: React.ReactNode;
    ariaLabel: string;
    onActivate: () => void;
}

const SourceButton: React.FC<SourceButtonProps> = ({ icon, title, hint, ariaLabel, onActivate }) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        onActivate();
    };

    return (
        <button
            type="button"
            onClick={onActivate}
            onKeyDown={handleKeyDown}
            aria-label={ariaLabel}
            tabIndex={0}
            className="group flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-slate-200 bg-white p-5 sm:p-6 text-center transition-all duration-200 hover:border-indigo-300 hover:bg-slate-50/70 hover:shadow-lg hover:shadow-slate-200/50 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
            <span className="flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700 transition-all duration-200 group-hover:scale-105 group-hover:bg-indigo-50 group-hover:text-indigo-600">
                <span className="material-symbols-outlined text-3xl" aria-hidden="true">{icon}</span>
            </span>
            <div>
                <span className="text-sm font-black uppercase tracking-wider text-slate-900 block group-hover:text-indigo-950 transition-colors">{title}</span>
                <span className="text-[11px] font-semibold text-slate-500 block mt-1">{hint}</span>
            </div>
        </button>
    );
};

const isMobileDevice = (): boolean => {
    if (typeof window === 'undefined') return false;
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
        (navigator.maxTouchPoints > 1 && 'ontouchstart' in window);
};

export interface ScanCaptureStepProps {
    destination: ScanDestination;
    /** `true` cede la pantalla completa a `InAppCamera`. */
    cameraOpen: boolean;
    onOpenCamera: () => void;
    onCloseCamera: () => void;
    /** Recibe el archivo de la cámara, galería o portapapeles, con opción de saltar recorte si es PDF. */
    onSelectFile: (file: File, options?: { skipCrop?: boolean }) => void;
    /** Mensaje del rechazo por tamaño o tipo, decidido por el hook. */
    errorMessage?: string;
    canGoBack?: boolean;
    onBack?: () => void;
    onClose: () => void;
    progress?: ScanProgress | null;
    /** Versión del motor de escaneo IA (v1 estándar o v2 económico) */
    engineVersion?: 'v1' | 'v2';
    onChangeEngineVersion?: (version: 'v1' | 'v2') => void;
}

export const ScanCaptureStep: React.FC<ScanCaptureStepProps> = ({
    destination,
    cameraOpen,
    onOpenCamera,
    onCloseCamera,
    onSelectFile,
    errorMessage,
    canGoBack = false,
    onBack = NO_OP,
    onClose,
    progress = null,
    engineVersion = 'v2',
    onChangeEngineVersion,
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const [pasteError, setPasteError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [localVersion, setLocalVersion] = useState<'v1' | 'v2'>('v2');
    const activeVersion = engineVersion ?? localVersion;
    const handleSelectVersion = (version: 'v1' | 'v2') => {
        setLocalVersion(version);
        onChangeEngineVersion?.(version);
    };

    const handleCameraClick = () => {
        if (isMobileDevice()) {
            cameraInputRef.current?.click();
            return;
        }
        onOpenCamera();
    };

    // Escuchar atajo Ctrl+V / Cmd+V para pegar capturas de pantalla tomadas en el portapapeles
    useEffect(() => {
        if (cameraOpen) return;

        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items || items.length === 0) return;

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (!file) continue;
                    e.preventDefault();
                    setPasteError(null);
                    onSelectFile(file);
                    return;
                }
            }
        };

        window.addEventListener('paste', handlePaste);
        return () => {
            window.removeEventListener('paste', handlePaste);
        };
    }, [cameraOpen, onSelectFile]);

    if (cameraOpen) {
        return <PCWebcamModal onCapture={onSelectFile} onClose={onCloseCamera} />;
    }

    const handleOpenGallery = () => {
        fileInputRef.current?.click();
    };

    const processChosenFile = (file: File) => {
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
        if (isPdf) {
            setPasteError('Para facturas en PDF, toma una captura de pantalla y pega o sube la imagen.');
            return;
        }

        onSelectFile(file);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setPasteError(null);
        void processChosenFile(file);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const file = e.dataTransfer.files?.[0];
        if (!file) return;

        setPasteError(null);
        void processChosenFile(file);
    };

    const handlePasteClick = () => {
        // En navegadores que soportan la API Clipboard:
        if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
            navigator.clipboard.read().then(async items => {
                for (const item of items) {
                    const imageType = item.types.find(t => t.startsWith('image/'));
                    if (imageType) {
                        const blob = await item.getType(imageType);
                        const file = new File([blob], `captura-${Date.now()}.png`, { type: imageType });
                        setPasteError(null);
                        onSelectFile(file);
                        return;
                    }
                }
                setPasteError('No hay ninguna imagen en el portapapeles. Toma una captura de pantalla y vuelve a intentarlo.');
            }).catch(() => {
                // Si el permiso es denegado o no soportado, avisar que use Ctrl + V
                setPasteError('Presiona las teclas Ctrl + V (o Cmd + V en Mac) para pegar la captura directamente.');
            });
        } else {
            setPasteError('Presiona las teclas Ctrl + V (o Cmd + V en Mac) para pegar la captura directamente.');
        }
    };

    const handlePasteKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        handlePasteClick();
    };

    return (
        <ScanStepShell
            step="capture"
            title="Toma la foto de la factura"
            subtitle={DESTINATION_SUBTITLE[destination]}
            progress={progress}
            canGoBack={canGoBack}
            onBack={onBack}
            onClose={onClose}
            errorMessage={errorMessage || pasteError || undefined}
        >
            <div
                className="space-y-4"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <div className="grid grid-cols-2 gap-4">
                    <SourceButton
                        icon="photo_camera"
                        title="Cámara"
                        hint={
                            <>
                                <span className="sm:hidden">Encuadra la factura</span>
                                <span className="hidden sm:inline">Toma con tu cámara</span>
                            </>
                        }
                        ariaLabel="Tomar la foto con la cámara del dispositivo"
                        onActivate={handleCameraClick}
                    />
                    <SourceButton
                        icon="upload_file"
                        title={
                            <>
                                <span className="sm:hidden">Galería</span>
                                <span className="hidden sm:inline">Elegir archivo</span>
                            </>
                        }
                        hint={
                            <>
                                <span className="sm:hidden">Elige una foto de la factura</span>
                                <span className="hidden sm:inline">Explora desde tu equipo</span>
                            </>
                        }
                        ariaLabel="Elegir una imagen de la galería o un archivo"
                        onActivate={handleOpenGallery}
                    />
                </div>

                {/* Botón y zona para pegar captura de pantalla con Ctrl+V o arrastrar */}
                <button
                    type="button"
                    onClick={handlePasteClick}
                    onKeyDown={handlePasteKeyDown}
                    aria-label="Pegar captura de pantalla desde el portapapeles"
                    tabIndex={0}
                    className={`group flex w-full min-h-[56px] items-center justify-between gap-3 rounded-2xl border-2 border-dashed p-4 text-left transition-all duration-200 ${
                        isDragging
                            ? 'border-indigo-500 bg-indigo-50/80 scale-[1.01] shadow-md'
                            : 'border-slate-300 bg-white hover:border-indigo-300 hover:bg-slate-50/80 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-indigo-400'
                    }`}
                >
                    <div className="flex items-center gap-3.5 min-w-0">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition-all duration-200 group-hover:scale-105 group-hover:bg-indigo-50 group-hover:text-indigo-600">
                            <span className="material-symbols-outlined text-xl" aria-hidden="true">content_paste</span>
                        </span>
                        <div className="min-w-0">
                            <span className="text-xs font-black uppercase tracking-wider text-slate-900 block group-hover:text-indigo-950 transition-colors">
                                <span className="sm:hidden">Pegar captura</span>
                                <span className="hidden sm:inline">Pegar captura o arrastrar archivo</span>
                            </span>
                            <span className="block truncate text-[11px] font-semibold text-slate-500">
                                Pega del portapapeles o arrastra una imagen aquí
                            </span>
                        </div>
                    </div>
                    <span className="hidden shrink-0 rounded-lg border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 sm:inline-block shadow-sm">
                        Ctrl + V
                    </span>
                </button>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    tabIndex={-1}
                    aria-label="Seleccionar la imagen del documento"
                    onChange={handleFileChange}
                    className="hidden"
                />

                <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    tabIndex={-1}
                    aria-label="Tomar foto con la cámara del dispositivo"
                    onChange={handleFileChange}
                    className="hidden"
                />

                <div className="flex items-start gap-2 rounded-2xl bg-slate-100 px-4 py-3">
                    <span className="material-symbols-outlined text-lg text-slate-500" aria-hidden="true">info</span>
                    <p className="text-xs font-semibold leading-snug text-slate-600">
                        Peso máximo de la imagen: {SCAN_MAX_FILE_MB} MB. Admite fotos en formato PNG, JPG o WEBP.
                    </p>
                </div>

                {/* Aviso de opt-in: se dice qué hará la IA con la foto ANTES de
                    tomarla, y que el usuario revisa el resultado. */}
                <div className="flex items-start gap-2.5 rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/50 via-slate-50/40 to-indigo-50/30 px-4 py-3">
                    <span
                        className="material-symbols-outlined mt-px shrink-0 text-[18px] text-indigo-600"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                        aria-hidden="true"
                    >
                        auto_awesome
                    </span>
                    <p className="text-xs font-medium leading-snug text-slate-600">
                        <strong className="font-semibold text-slate-800">Con una sola foto basta:</strong> la IA lee los datos de la factura y queda como
                        evidencia. Vas a poder revisar y corregir todo antes de guardar.
                    </p>
                </div>
            </div>
        </ScanStepShell>
    );
};

export default ScanCaptureStep;
