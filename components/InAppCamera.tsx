import React, { useRef, useState, useEffect, useCallback } from 'react';

interface InAppCameraProps {
    onCapture: (file: File) => void;
    onClose: () => void;
    /** Captura el cuadro completo (vertical, para documentos) en vez de recorte cuadrado. */
    fullFrame?: boolean;
}

export const InAppCamera: React.FC<InAppCameraProps> = ({ onCapture, onClose, fullFrame = false }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [ready, setReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const stopStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        const startCamera = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 4096 },
                        height: { ideal: 2160 }
                    },
                    audio: false
                });
                if (cancelled) {
                    stream.getTracks().forEach(t => t.stop());
                    return;
                }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current?.play();
                        setReady(true);
                    };
                }
            } catch (err: any) {
                if (!cancelled) {
                    console.error('Camera error:', err);
                    if (err.name === 'NotAllowedError') {
                        setError('Permiso de cámara denegado. Activa el permiso en la configuración del navegador.');
                    } else if (err.name === 'NotFoundError') {
                        setError('No se encontró ninguna cámara en el dispositivo.');
                    } else {
                        setError('No se pudo acceder a la cámara.');
                    }
                }
            }
        };

        startCamera();

        return () => {
            cancelled = true;
            stopStream();
        };
    }, [stopStream]);

    const handleCapture = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        const vw = video.videoWidth;
        const vh = video.videoHeight;

        if (fullFrame) {
            // object-cover: el video se recorta al aspect ratio de la pantalla.
            // Replicamos ese recorte para capturar exactamente lo visible.
            const screenW = window.innerWidth;
            const screenH = window.innerHeight;
            const screenAR = screenW / screenH;
            const videoAR = vw / vh;

            let sx = 0, sy = 0, sw = vw, sh = vh;
            if (videoAR > screenAR) {
                // video más ancho que la pantalla → recortar lados
                sw = Math.round(vh * screenAR);
                sx = Math.round((vw - sw) / 2);
            } else {
                // video más alto → recortar arriba/abajo
                sh = Math.round(vw / screenAR);
                sy = Math.round((vh - sh) / 2);
            }

            // Escalar el lado mayor del recorte a 1600px
            const maxDim = 1600;
            const scale = Math.min(1, maxDim / Math.max(sw, sh));
            canvas.width = Math.round(sw * scale);
            canvas.height = Math.round(sh * scale);
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            stopStream();
            canvas.toBlob(
                (blob) => {
                    if (blob) {
                        const file = new File([blob], `doc-${Date.now()}.jpg`, { type: 'image/jpeg' });
                        onCapture(file);
                    }
                },
                'image/jpeg',
                0.92
            );
            return;
        }

        // Crop the center square from the video frame
        const side = Math.min(vw, vh);
        const srcX = Math.round((vw - side) / 2);
        const srcY = Math.round((vh - side) / 2);

        // Cap output at 1200x1200 to keep file size reasonable
        const outSize = Math.min(side, 1200);
        canvas.width = outSize;
        canvas.height = outSize;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.drawImage(video, srcX, srcY, side, side, 0, 0, outSize, outSize);
        stopStream();

        canvas.toBlob(
            (blob) => {
                if (blob) {
                    const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
                    onCapture(file);
                }
            },
            'image/jpeg',
            0.92
        );
    }, [onCapture, stopStream, fullFrame]);

    const handleClose = useCallback(() => {
        stopStream();
        onClose();
    }, [onClose, stopStream]);

    // ===== Modo documento: video a pantalla completa (aprovecha toda la pantalla) =====
    if (fullFrame) {
        return (
            <div className="fixed inset-0 z-[9999] bg-black">
                {/* Video a pantalla completa */}
                {error ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
                        <span className="material-symbols-outlined text-5xl text-red-400 mb-3">videocam_off</span>
                        <p className="text-white/90 text-base mb-4">{error}</p>
                        <button
                            type="button"
                            onClick={handleClose}
                            className="px-6 py-2.5 bg-white/15 rounded-xl text-white font-medium active:scale-95 transition-transform"
                        >
                            Cerrar
                        </button>
                    </div>
                ) : !ready ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                        <div className="size-10 border-[3px] border-white/30 border-t-white rounded-full animate-spin" />
                        <p className="text-white/60 text-sm">Iniciando cámara...</p>
                    </div>
                ) : null}

                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`absolute inset-0 w-full h-full object-cover ${ready && !error ? '' : 'hidden'}`}
                />

                {/* Header flotante */}
                <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 bg-gradient-to-b from-black/70 to-transparent">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="size-10 flex items-center justify-center rounded-full bg-white/15 backdrop-blur-sm text-white active:scale-90 transition-transform"
                        aria-label="Cerrar cámara"
                    >
                        <span className="material-symbols-outlined text-2xl">close</span>
                    </button>
                    <span className="text-white/90 text-sm font-medium">Escanear factura</span>
                    <div className="w-10" />
                </div>

                {/* Guías de esquina + pista */}
                {ready && !error && (
                    <>
                        <div className="absolute inset-0 pointer-events-none p-5">
                            <div className="relative w-full h-full">
                                <span className="absolute top-0 left-0 size-10 border-t-[3px] border-l-[3px] border-white/90 rounded-tl-xl" />
                                <span className="absolute top-0 right-0 size-10 border-t-[3px] border-r-[3px] border-white/90 rounded-tr-xl" />
                                <span className="absolute bottom-0 left-0 size-10 border-b-[3px] border-l-[3px] border-white/90 rounded-bl-xl" />
                                <span className="absolute bottom-0 right-0 size-10 border-b-[3px] border-r-[3px] border-white/90 rounded-br-xl" />
                            </div>
                        </div>
                        <div className="absolute left-0 right-0 flex justify-center pointer-events-none" style={{ bottom: 'calc(120px + env(safe-area-inset-bottom))' }}>
                            <span className="text-white/90 text-xs font-medium bg-black/50 px-3 py-1.5 rounded-full">
                                Encuadra toda la factura
                            </span>
                        </div>
                    </>
                )}

                {/* Botón de captura flotante */}
                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center pb-[max(24px,env(safe-area-inset-bottom))] pt-6 bg-gradient-to-t from-black/70 to-transparent">
                    {ready && !error && (
                        <button
                            type="button"
                            onClick={handleCapture}
                            className="w-[72px] h-[72px] rounded-full border-[4px] border-white flex items-center justify-center active:scale-90 transition-transform"
                            aria-label="Capturar foto"
                        >
                            <div className="w-[58px] h-[58px] rounded-full bg-white" />
                        </button>
                    )}
                </div>

                <canvas ref={canvasRef} className="hidden" />
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-between">
            {/* Header */}
            <div className="w-full z-10 flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 bg-gradient-to-b from-black/70 to-transparent">
                <button
                    type="button"
                    onClick={handleClose}
                    className="size-10 flex items-center justify-center rounded-full bg-white/15 backdrop-blur-sm text-white active:scale-90 transition-transform"
                    aria-label="Cerrar cámara"
                >
                    <span className="material-symbols-outlined text-2xl">close</span>
                </button>
                <span className="text-white/80 text-sm font-medium">Tomar foto</span>
                <div className="w-10" />
            </div>

            {/* Video viewport: cuadrado (manual) o vertical tipo documento (fullFrame) */}
            <div
                className="relative overflow-hidden bg-black flex-shrink-0"
                style={fullFrame
                    ? { width: '100vw', height: 'calc(100dvh - 200px)' }
                    : { width: '100vw', height: '100vw', maxHeight: 'calc(100dvh - 140px)' }}
            >
                {error ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
                        <span className="material-symbols-outlined text-5xl text-red-400 mb-3">videocam_off</span>
                        <p className="text-white/90 text-base mb-4">{error}</p>
                        <button
                            type="button"
                            onClick={handleClose}
                            className="px-6 py-2.5 bg-white/15 rounded-xl text-white font-medium active:scale-95 transition-transform"
                        >
                            Cerrar
                        </button>
                    </div>
                ) : !ready ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                        <div className="size-10 border-[3px] border-white/30 border-t-white rounded-full animate-spin" />
                        <p className="text-white/60 text-sm">Iniciando cámara...</p>
                    </div>
                ) : null}

                {/* En fullFrame: contain (muestra todo el documento). En cuadrado: cover. */}
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`absolute inset-0 w-full h-full ${fullFrame ? 'object-contain' : 'object-cover'} ${ready && !error ? '' : 'hidden'}`}
                />

                {/* Corner frame guides */}
                {ready && !error && (
                    <div className="absolute inset-0 pointer-events-none p-4">
                        <div className="relative w-full h-full">
                            <span className="absolute top-0 left-0 size-8 border-t-[3px] border-l-[3px] border-white rounded-tl-lg" />
                            <span className="absolute top-0 right-0 size-8 border-t-[3px] border-r-[3px] border-white rounded-tr-lg" />
                            <span className="absolute bottom-0 left-0 size-8 border-b-[3px] border-l-[3px] border-white rounded-bl-lg" />
                            <span className="absolute bottom-0 right-0 size-8 border-b-[3px] border-r-[3px] border-white rounded-br-lg" />
                        </div>
                    </div>
                )}

                {/* Pista en fullFrame */}
                {ready && !error && fullFrame && (
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
                        <span className="text-white/80 text-xs font-medium bg-black/50 px-3 py-1.5 rounded-full">
                            Encuadra toda la factura
                        </span>
                    </div>
                )}
            </div>

            {/* Capture button */}
            <div className="w-full flex items-center justify-center flex-1 pb-[max(20px,env(safe-area-inset-bottom))]">
                {ready && !error && (
                    <button
                        type="button"
                        onClick={handleCapture}
                        className="w-[72px] h-[72px] rounded-full border-[4px] border-white flex items-center justify-center active:scale-90 transition-transform"
                        aria-label="Capturar foto"
                    >
                        <div className="w-[58px] h-[58px] rounded-full bg-white" />
                    </button>
                )}
            </div>

            {/* Hidden canvas for capture */}
            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
};
