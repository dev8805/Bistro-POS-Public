import React, { useRef, useState, useEffect } from 'react';

export interface PCWebcamModalProps {
    onCapture: (file: File) => void;
    onClose: () => void;
    title?: string;
    captureButtonText?: string;
}

export const PCWebcamModal: React.FC<PCWebcamModalProps> = ({
    onCapture,
    onClose,
    title = 'Cámara Web',
    captureButtonText = 'Capturar Foto',
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        const startWebcam = async () => {
            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
                    audio: false,
                });

                if (!active) {
                    mediaStream.getTracks().forEach(t => t.stop());
                    return;
                }

                setStream(mediaStream);
                if (videoRef.current) {
                    videoRef.current.srcObject = mediaStream;
                }
            } catch (err) {
                if (!active) return;
                console.warn('[PCWebcamModal] Error al acceder a la cámara web:', err);
                setError('No se pudo acceder a la cámara web. Verifica los permisos.');
            }
        };

        startWebcam();

        return () => {
            active = false;
            if (stream) {
                stream.getTracks().forEach(t => t.stop());
            }
        };
    }, []);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    const handleCloseModal = () => {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
        }
        onClose();
    };

    const handleCapture = () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth || !video.videoHeight) return;
        setIsCapturing(true);

        try {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
                setIsCapturing(false);
                return;
            }

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(blob => {
                if (!blob) {
                    setIsCapturing(false);
                    return;
                }

                const file = new File([blob], `comprobante-${Date.now()}.jpg`, { type: 'image/jpeg' });
                if (stream) {
                    stream.getTracks().forEach(t => t.stop());
                }
                onCapture(file);
            }, 'image/jpeg', 0.95);
        } catch (err) {
            console.error('[PCWebcamModal] Error capturando imagen:', err);
            setIsCapturing(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-3xl overflow-hidden shadow-2xl flex flex-col animate-scaleUp">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <span className="size-8 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                            <span className="material-symbols-outlined text-[20px]">videocam</span>
                        </span>
                        <h3 className="text-white font-bold text-base">{title}</h3>
                    </div>
                    <button
                        type="button"
                        onClick={handleCloseModal}
                        className="size-9 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-colors"
                        aria-label="Cerrar cámara"
                        tabIndex={0}
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>

                <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
                    {error ? (
                        <div className="p-6 text-center text-red-400 flex flex-col items-center gap-2">
                            <span className="material-symbols-outlined text-4xl">videocam_off</span>
                            <p className="text-sm font-medium">{error}</p>
                        </div>
                    ) : (
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-cover"
                        />
                    )}
                </div>

                <div className="p-4 bg-slate-900/90 flex items-center justify-center gap-4 shrink-0 border-t border-slate-800">
                    <button
                        type="button"
                        onClick={handleCloseModal}
                        className="px-5 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition-colors"
                        tabIndex={0}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleCapture}
                        disabled={isCapturing || Boolean(error)}
                        className="h-12 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/25 active:scale-95 transition-all disabled:opacity-50"
                        aria-label={captureButtonText}
                        tabIndex={0}
                    >
                        {isCapturing ? (
                            <>
                                <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Capturando...</span>
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                                <span>{captureButtonText}</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
