import React, { useState, useCallback, useRef } from 'react';
import Cropper, { Area, Point } from 'react-easy-crop';
import { useToast } from '../context/ToastContext';

interface ImageCropperProps {
    imageSrc: string;
    onCropComplete: (croppedBlob: Blob, removeBg: boolean) => void;
    onCancel: () => void;
    aspectRatio?: number;
    showRemoveBg?: boolean;
    restrictPosition?: boolean;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const ImageCropper: React.FC<ImageCropperProps> = ({
    imageSrc,
    onCropComplete,
    onCancel,
    aspectRatio = 1,
    showRemoveBg = true,
    restrictPosition: restrictPositionProp,
}) => {
    const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
    const { showToast } = useToast();
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Background removal states
    const [removeBgEnabled, setRemoveBgEnabled] = useState(false);
    const [removingBg, setRemovingBg] = useState(false);
    const [removedBgPreviewUrl, setRemovedBgPreviewUrl] = useState<string | null>(null);
    const removedBgBlobRef = useRef<Blob | null>(null);

    const onCropChange = useCallback((location: Point) => setCrop(location), []);
    const onZoomChange = useCallback((newZoom: number) => setZoom(newZoom), []);

    const onCropCompleteCallback = useCallback((_: Area, pixels: Area) => {
        setCroppedAreaPixels(pixels);
        // Reset preview when user adjusts the crop
        if (removedBgPreviewUrl) {
            URL.revokeObjectURL(removedBgPreviewUrl);
            setRemovedBgPreviewUrl(null);
            removedBgBlobRef.current = null;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const createCroppedImage = useCallback(async (): Promise<Blob | null> => {
        if (!croppedAreaPixels) return null;

        const image = new Image();
        image.src = imageSrc;
        image.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = reject;
        });

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const MAX_SIDE = 800;
        let { width, height } = croppedAreaPixels;
        if (width > MAX_SIDE || height > MAX_SIDE) {
            if (width >= height) {
                height = Math.round((height * MAX_SIDE) / width);
                width = MAX_SIDE;
            } else {
                width = Math.round((width * MAX_SIDE) / height);
                height = MAX_SIDE;
            }
        }

        canvas.width = width;
        canvas.height = height;

        const { x: srcX, y: srcY, width: srcW, height: srcH } = croppedAreaPixels;

        // Blurred background: draw the cropped region blurred and slightly enlarged
        ctx.save();
        ctx.filter = 'blur(20px) brightness(0.6)';
        ctx.drawImage(
            image,
            srcX, srcY, srcW, srcH,            // source: crop region
            -canvas.width * 0.1, -canvas.height * 0.1, canvas.width * 1.2, canvas.height * 1.2 // dest: slightly enlarged
        );
        ctx.filter = 'none';
        ctx.restore();

        // Foreground: draw the cropped region scaled to fill the canvas
        ctx.drawImage(
            image,
            srcX, srcY, srcW, srcH,   // source: exact crop region
            0, 0, canvas.width, canvas.height // dest: full canvas (scaled)
        );

        return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/webp', 0.85));
    }, [croppedAreaPixels, imageSrc]);

    const callPixianEdgeFunction = useCallback(async (blob: Blob): Promise<Blob> => {
        const form = new FormData();
        form.append('image', blob, 'image.webp');

        const res = await fetch(`${SUPABASE_URL}/functions/v1/remove-bg`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
            body: form,
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Pixian error ${res.status}: ${text}`);
        }

        return res.blob();
    }, []);

    const handleToggleRemoveBg = useCallback(async (enabled: boolean) => {
        setRemoveBgEnabled(enabled);

        if (!enabled) {
            if (removedBgPreviewUrl) URL.revokeObjectURL(removedBgPreviewUrl);
            setRemovedBgPreviewUrl(null);
            removedBgBlobRef.current = null;
            return;
        }

        setRemovingBg(true);
        try {
            const croppedBlob = await createCroppedImage();
            if (!croppedBlob) throw new Error('No se pudo recortar la imagen');

            const resultBlob = await callPixianEdgeFunction(croppedBlob);
            removedBgBlobRef.current = resultBlob;
            setRemovedBgPreviewUrl(URL.createObjectURL(resultBlob));
        } catch (err) {
            console.error('[remove-bg]', err);
            showToast('No se pudo eliminar el fondo. Intenta de nuevo.', 'error');
            setRemoveBgEnabled(false);
        } finally {
            setRemovingBg(false);
        }
    }, [createCroppedImage, callPixianEdgeFunction, removedBgPreviewUrl, showToast]);

    const handleConfirm = async () => {
        setIsProcessing(true);
        try {
            if (removeBgEnabled && removedBgBlobRef.current) {
                onCropComplete(removedBgBlobRef.current, true);
            } else {
                const croppedBlob = await createCroppedImage();
                if (croppedBlob) onCropComplete(croppedBlob, false);
            }
        } catch (error) {
            console.error('Error cropping image:', error);
            showToast('Error al procesar la imagen. Intente nuevamente.', 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const isBusy = isProcessing || removingBg;

    // Checkered pattern for transparent background preview (data URI)
    const checkerBg = "url('data:image/svg+xml,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 width%3D%2220%22 height%3D%2220%22%3E%3Crect width%3D%2210%22 height%3D%2210%22 fill%3D%22%23666%22%2F%3E%3Crect x%3D%2210%22 y%3D%2210%22 width%3D%2210%22 height%3D%2210%22 fill%3D%22%23666%22%2F%3E%3Crect x%3D%2210%22 width%3D%2210%22 height%3D%2210%22 fill%3D%22%23444%22%2F%3E%3Crect y%3D%2210%22 width%3D%2210%22 height%3D%2210%22 fill%3D%22%23444%22%2F%3E%3C%2Fsvg%3E')";

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-0 md:p-4 animate-in fade-in duration-200">
            <div className="w-full h-[100dvh] md:h-full md:max-w-2xl md:max-h-[85vh] flex flex-col bg-black md:bg-surface-dark md:rounded-2xl md:overflow-hidden md:shadow-2xl md:ring-1 md:ring-white/10">

                {/* Header */}
                <div className="shrink-0 bg-white border-b border-gray-100 px-3 sm:px-4 flex items-center justify-between z-10 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:h-14 md:pt-0 md:pb-0 relative">
                    <button
                        onClick={onCancel}
                        disabled={isBusy}
                        className="flex items-center gap-1 sm:gap-2 text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-50 z-10 p-2 md:p-0"
                    >
                        <span className="material-symbols-outlined text-xl sm:text-[24px]">close</span>
                        <span className="text-sm font-medium hidden sm:inline">Cancelar</span>
                    </button>

                    <h2 className="text-gray-900 font-semibold text-sm sm:text-base absolute left-1/2 -translate-x-1/2 text-center w-full max-w-[150px] sm:max-w-none px-2 truncate pointer-events-none tracking-tight">
                        Ajustar Imagen
                    </h2>

                    <button
                        onClick={handleConfirm}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 sm:gap-2 bg-primary text-[#102218] px-4 py-2 rounded-full font-bold text-[13px] sm:text-sm shadow-sm hover:brightness-105 active:scale-95 transition-all disabled:opacity-50 z-10"
                    >
                        {isProcessing ? (
                            <>
                                <div className="size-4 border-2 border-[#102218] border-t-transparent rounded-full animate-spin" />
                                <span className="hidden min-[380px]:inline">Procesando</span>
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-[18px]">check</span>
                                <span className="hidden min-[380px]:inline">Confirmar</span>
                            </>
                        )}
                    </button>
                </div>

                {/* Cropper Area */}
                <div className="flex-1 relative bg-[#f5f5f7] overflow-hidden flex flex-col items-center justify-center">
                    {/* Blurred background */}
                    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
                        <img src={imageSrc} className="w-full h-full object-cover blur-3xl scale-110 opacity-30" alt="" />
                    </div>

                    {/* Interactive Cropper — hidden when preview is shown */}
                    <div className={`absolute inset-0 z-10 transition-opacity duration-300 ${removedBgPreviewUrl ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                        <Cropper
                            image={imageSrc}
                            crop={crop}
                            zoom={zoom}
                            aspect={aspectRatio}
                            onCropChange={onCropChange}
                            onZoomChange={onZoomChange}
                            onCropComplete={onCropCompleteCallback}
                            restrictPosition={restrictPositionProp ?? false}
                            minZoom={restrictPositionProp ? 1 : 0.5}
                            style={{
                                containerStyle: { background: 'transparent' },
                                mediaStyle: { boxShadow: '0 8px 32px rgba(0,0,0,0.12)' },
                            }}
                        />
                    </div>

                    {/* Removed BG preview (checkered = transparent) - Constrained to square */}
                    {removedBgPreviewUrl && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center p-4 sm:p-8 pointer-events-none">
                            <div 
                                className="relative rounded-2xl overflow-hidden shadow-[0_20px_40px_-10px_rgba(0,0,0,0.15)] flex items-center justify-center border border-gray-200/50 bg-white"
                                style={{ 
                                    backgroundImage: checkerBg,
                                    aspectRatio: '1 / 1',
                                    maxWidth: '100%',
                                    maxHeight: '100%'
                                }}
                            >
                                <img
                                    src={removedBgPreviewUrl}
                                    alt="Sin fondo"
                                    className="w-full h-full object-contain drop-shadow-[0_8px_16px_rgba(0,0,0,0.1)]"
                                />
                                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/90 text-gray-800 font-medium text-xs px-3.5 py-1.5 rounded-full backdrop-blur-md whitespace-nowrap shadow-sm border border-gray-100">
                                    Fondo Eliminado
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Removing BG spinner overlay */}
                    {removingBg && (
                        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-white/60 backdrop-blur-md">
                            <div className="relative flex items-center justify-center">
                                <div className="size-14 border-4 border-gray-200 rounded-full" />
                                <div className="size-14 border-4 border-primary border-t-transparent rounded-full animate-spin absolute inset-0" />
                                <span className="material-symbols-outlined absolute text-primary text-xl">auto_fix_high</span>
                            </div>
                            <div className="text-center">
                                <p className="text-gray-900 font-semibold text-sm sm:text-base">Procesando imagen...</p>
                                <p className="text-gray-500 text-xs mt-1">Eliminando fondo</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="shrink-0 bg-white border-t border-gray-100 z-10 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
                    
                    {/* Zoom Slider */}
                    <div className="px-6 py-5 flex items-center justify-center gap-4">
                        <span className="material-symbols-outlined text-gray-400 text-lg">zoom_out</span>
                        <input
                            type="range"
                            min={0.5}
                            max={3}
                            step={0.1}
                            value={zoom}
                            onChange={(e) => setZoom(Number(e.target.value))}
                            disabled={!!removedBgPreviewUrl || isBusy}
                            className="w-full max-w-[280px] h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer accent-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                        <span className="material-symbols-outlined text-gray-400 text-lg">zoom_in</span>
                    </div>

                    {/* Background Toggle Button */}
                    {showRemoveBg && (
                    <div className="px-4 pb-2 flex justify-center">
                        <button
                            type="button"
                            onClick={() => handleToggleRemoveBg(!removeBgEnabled)}
                            disabled={isBusy}
                            className={`
                                relative flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-full font-semibold text-[14px] sm:text-[15px] transition-all duration-500 w-full max-w-[300px] overflow-hidden
                                ${removeBgEnabled 
                                    ? 'bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50 border border-purple-200/60 text-gray-900 shadow-[0_4px_16px_rgba(168,85,247,0.12)]' 
                                    : 'bg-white border border-gray-200 text-gray-800 hover:border-gray-300 shadow-sm hover:shadow-md'
                                }
                                ${isBusy ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.98]'}
                            `}
                        >
                            {/* Animated background glow for active state */}
                            {removeBgEnabled && (
                                <div className="absolute inset-0 opacity-50 bg-gradient-to-r from-blue-400/10 via-purple-400/10 to-orange-400/10 blur-md animate-pulse" />
                            )}
                            
                            <span 
                                className={`material-symbols-outlined text-[22px] transition-all duration-500 relative z-10
                                    ${removeBgEnabled ? 'scale-110' : ''} 
                                    bg-clip-text text-transparent bg-gradient-to-r from-blue-500 via-purple-500 to-orange-400
                                `}
                                style={{ WebkitBackgroundClip: 'text' }}
                            >
                                auto_fix_high
                            </span>
                            <span className="relative z-10">{removeBgEnabled ? 'Fondo Eliminado' : 'Eliminar Fondo'}</span>
                        </button>
                    </div>
                    )}

                </div>
            </div>
        </div>
    );
};
