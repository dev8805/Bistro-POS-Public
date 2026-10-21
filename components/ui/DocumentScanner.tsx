import React, { useEffect, useRef, useState } from 'react';

interface DocumentScannerProps {
    onCapture: (file: File) => void;
    onCancel: () => void;
}

export const DocumentScanner: React.FC<DocumentScannerProps> = ({ onCapture, onCancel }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hiddenCanvasRef = useRef<HTMLCanvasElement>(null);

    const [ready, setReady] = useState(false);
    const [processing, setProcessing] = useState(false);

    const streamRef = useRef<MediaStream | null>(null);

    // Arrancar cámara
    useEffect(() => {
        const start = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: 4096 },
                        height: { ideal: 2160 }
                    },
                    audio: false
                });

                const track = stream.getVideoTracks()[0];
                const capabilities = track.getCapabilities ? track.getCapabilities() : {} as MediaTrackCapabilities;

                const advancedConstraints: MediaTrackConstraintSet[] = [];
                if ((capabilities as any).focusMode?.includes('continuous')) {
                    advancedConstraints.push({ focusMode: 'continuous' } as any);
                }
                if ((capabilities as any).zoom) {
                    const maxZoom = (capabilities as any).zoom.max ?? 1;
                    advancedConstraints.push({ zoom: Math.min(maxZoom, 2) } as any);
                }
                if (advancedConstraints.length > 0) {
                    await track.applyConstraints({ advanced: advancedConstraints }).catch(() => { });
                }

                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current?.play();
                        setReady(true);
                    };
                }
            } catch (e) {
                console.error('Camera error:', e);
            }
        };
        start();

        return () => {
            streamRef.current?.getTracks().forEach(t => t.stop());
        };
    }, []);

    const handleCapture = () => {
        const video = videoRef.current;
        const hidden = hiddenCanvasRef.current;
        if (!video || !hidden) return;

        setProcessing(true);

        const W = video.videoWidth;
        const H = video.videoHeight;
        hidden.width = W;
        hidden.height = H;

        const hiddenCtx = hidden.getContext('2d');
        if (!hiddenCtx) {
            setProcessing(false);
            return;
        }

        hiddenCtx.drawImage(video, 0, 0, W, H);

        hidden.toBlob((blob) => {
            setProcessing(false);
            if (blob) {
                onCapture(new File([blob], 'camera_capture.jpg', { type: 'image/jpeg' }));
            }
        }, 'image/jpeg', 0.9);
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col">
            <canvas ref={hiddenCanvasRef} className="hidden" />

            {/* Video como fondo */}
            <div className="relative flex-1 overflow-hidden">
                <video
                    ref={videoRef}
                    className={`absolute inset-0 w-full h-full object-cover ${ready ? '' : 'hidden'}`}
                    playsInline muted autoPlay
                />

                {/* Estado de carga */}
                {!ready && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 z-10 gap-3">
                        <div className="size-10 rounded-full border-4 border-white/20 border-t-emerald-400 animate-spin" />
                        <p className="text-white text-sm font-bold">Iniciando cámara...</p>
                    </div>
                )}

                {/* Botón cerrar */}
                <button
                    onClick={onCancel}
                    className="absolute top-6 left-4 z-20 size-11 rounded-full bg-black/40 backdrop-blur-sm border border-white/20 flex items-center justify-center active:scale-90 transition-all"
                >
                    <span className="material-symbols-outlined text-white text-[24px]">close</span>
                </button>
            </div>

            {/* Barra de captura (Área Fija Abajo) */}
            <div className="flex flex-col items-center justify-center pt-6 pb-10 bg-black">
                <p className="text-white/60 text-xs font-bold font-mono tracking-widest uppercase mb-6">
                    Maten la cámara firme
                </p>

                <button
                    onClick={handleCapture}
                    disabled={!ready || processing}
                    className="size-20 rounded-full border-4 border-emerald-400 bg-white flex items-center justify-center active:scale-90 transition-all disabled:opacity-50 shadow-xl shadow-emerald-400/20"
                >
                    {processing
                        ? <div className="size-8 rounded-full border-4 border-gray-200 border-t-emerald-500 animate-spin" />
                        : <div className="size-14 rounded-full bg-white border-2 border-gray-100 shadow-inner" />
                    }
                </button>
            </div>
        </div>
    );
};
