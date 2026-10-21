import React, { useRef, useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import 'barcode-detector';

export interface BarcodeScannerHandle {
    playErrorBeep: () => void;
}

interface BarcodeScannerProps {
    onScan: (barcode: string) => void;
    onClose: () => void;
    variant?: 'modal' | 'embedded';
    continuousMode?: boolean;
}

export const BarcodeScanner = forwardRef<BarcodeScannerHandle, BarcodeScannerProps>(function BarcodeScanner({
    onScan,
    onClose,
    variant = 'modal',
    continuousMode = false,
}, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const detectorRef = useRef<BarcodeDetector | null>(null);
    const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const hasDetectedRef = useRef(false);
    const cooldownRef = useRef(false);
    const lastActivityTimeRef = useRef(Date.now());
    const audioCtxRef = useRef<AudioContext | null>(null);

    const [ready, setReady] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
    const [hasFlash, setHasFlash] = useState(false);
    const [isFlashOn, setIsFlashOn] = useState(false);

    const getAudioContext = useCallback((): AudioContext | null => {
        try {
            const AC = window.AudioContext || (window as any).webkitAudioContext;
            if (!AC) return null;
            if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
                audioCtxRef.current = new AC();
            }
            if (audioCtxRef.current.state === 'suspended') {
                audioCtxRef.current.resume().catch(() => { });
            }
            return audioCtxRef.current;
        } catch {
            return null;
        }
    }, []);

    const playSuccessBeep = useCallback(() => {
        const ctx = getAudioContext();
        if (!ctx) return;
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(2000, ctx.currentTime);
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.12);
        } catch { /* silenciar */ }
    }, [getAudioContext]);

    const playErrorBeep = useCallback(() => {
        const ctx = getAudioContext();
        if (!ctx) return;
        try {
            const t = ctx.currentTime;
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sawtooth';
            osc1.frequency.setValueAtTime(200, t);
            gain1.gain.setValueAtTime(0.15, t);
            gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(t);
            osc1.stop(t + 0.15);

            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sawtooth';
            osc2.frequency.setValueAtTime(150, t + 0.16);
            gain2.gain.setValueAtTime(0.15, t + 0.16);
            gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(t + 0.16);
            osc2.stop(t + 0.35);
        } catch { /* silenciar */ }
    }, [getAudioContext]);

    useImperativeHandle(ref, () => ({ playErrorBeep }), [playErrorBeep]);

    const unlockAudio = useCallback(() => {
        getAudioContext();
    }, [getAudioContext]);

    const stopStream = useCallback(() => {
        if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
    }, []);

    const initCamera = useCallback(async (mode: 'environment' | 'user') => {
        stopStream();
        setReady(false);
        setError(null);
        setHasFlash(false);
        setIsFlashOn(false);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: mode },
                    width: { ideal: 4096 },
                    height: { ideal: 2160 },
                },
                audio: false,
            });

            const track = stream.getVideoTracks()[0];
            const capabilities = track.getCapabilities ? track.getCapabilities() : {} as MediaTrackCapabilities;

            // Flash support
            if ((capabilities as any).torch) {
                setHasFlash(true);
            }

            // Mejora de enfoque: focusMode continuo + zoom x2
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
        } catch (err: any) {
            if (err.name === 'NotAllowedError') {
                setError('Permiso de cámara denegado. Activa el permiso en tu navegador.');
            } else if (err.name === 'NotFoundError') {
                setError('No se encontró ninguna cámara.');
            } else {
                setError('No se pudo acceder a la cámara.');
            }
        }
    }, [stopStream]);

    // Initialize detector once
    useEffect(() => {
        try {
            detectorRef.current = new BarcodeDetector({
                formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'],
            });
        } catch {
            setError('Tu navegador no soporta escaneo de códigos de barras.');
        }
    }, []);

    // Start camera when facingMode changes (but only if not paused)
    useEffect(() => {
        if (!detectorRef.current || isPaused) return;
        initCamera(facingMode);
        return () => stopStream();
    }, [facingMode, initCamera, stopStream, isPaused]);

    const isDetectingRef = useRef(false);

    const resetActivityTimer = useCallback(() => {
        lastActivityTimeRef.current = Date.now();
    }, []);

    const pauseScanner = useCallback(() => {
        setIsPaused(true);
        stopStream();
    }, [stopStream]);

    const resumeScanner = useCallback(() => {
        setIsPaused(false);
        resetActivityTimer();
    }, [resetActivityTimer]);

    // Handle detection loop
    useEffect(() => {
        if (!ready || !detectorRef.current || !videoRef.current) return;

        const video = videoRef.current;
        const detector = detectorRef.current;

        scanIntervalRef.current = setInterval(async () => {
            if (isPaused) return;

            if (continuousMode && Date.now() - lastActivityTimeRef.current > 60000) {
                pauseScanner();
                return;
            }

            // En modo normal, no escanear si ya detectó uno
            if (!continuousMode && hasDetectedRef.current) return;
            // En modo continuo, respetar el cooldown para evitar escaneos duplicados
            if (continuousMode && cooldownRef.current) return;
            if (video.readyState < 2) return;

            // Prevenir concurrencia: si detect() tarda más que el intervalo, ignorar este tick
            if (isDetectingRef.current) return;

            isDetectingRef.current = true;
            try {
                const barcodes = await detector.detect(video);
                if (barcodes.length > 0 && barcodes[0].rawValue) {
                    resetActivityTimer();

                    if (continuousMode) {
                        if (!cooldownRef.current) {
                            cooldownRef.current = true;
                            if (navigator.vibrate) navigator.vibrate(80);
                            playSuccessBeep();
                            onScan(barcodes[0].rawValue);
                            setTimeout(() => { cooldownRef.current = false; }, 1500);
                        }
                    } else {
                        hasDetectedRef.current = true;
                        if (navigator.vibrate) navigator.vibrate(100);
                        playSuccessBeep();
                        stopStream();
                        onScan(barcodes[0].rawValue);
                    }
                }
            } catch { /* frame not ready */ } finally {
                isDetectingRef.current = false;
            }
        }, 150);

        return () => {
            if (scanIntervalRef.current) {
                clearInterval(scanIntervalRef.current);
                scanIntervalRef.current = null;
            }
        };
    }, [ready, onScan, stopStream, continuousMode]);

    const toggleFlash = async () => {
        if (!streamRef.current) return;
        const track = streamRef.current.getVideoTracks()[0];
        try {
            const newState = !isFlashOn;
            await track.applyConstraints({
                advanced: [{ torch: newState }] as any
            });
            setIsFlashOn(newState);
        } catch (err) {
            console.error('Error toggling flash', err);
        }
    };

    const toggleCamera = () => {
        setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
    };

    // ─── EMBEDDED VARIANT ──────────────────────────────────────────────
    if (variant === 'embedded') {
        return (
            <div
                className="relative w-full bg-black overflow-hidden flex items-center justify-center"
                style={{ height: '100%' }}
                onTouchStart={unlockAudio}
                onClick={unlockAudio}
            >
                {error ? (
                    <div className="text-center px-6 z-10">
                        <span className="material-symbols-outlined text-4xl text-red-400 mb-2 block">error_outline</span>
                        <p className="text-white/90 text-sm">{error}</p>
                    </div>
                ) : !ready ? (
                    <div className="flex flex-col items-center gap-2 z-10">
                        <div className="size-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
                        <p className="text-white/50 text-xs">Iniciando cámara...</p>
                    </div>
                ) : null}

                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`absolute inset-0 w-full h-full object-cover ${ready && !error ? '' : 'hidden'} ${facingMode === 'user' ? '-scale-x-100' : ''}`}
                />

                {/* Scanner overlay */}
                {ready && !error && !isPaused && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-[70%] max-w-[260px] h-[80px] relative flex items-center justify-center">
                            <div className="absolute top-0 left-0 size-5 border-t-2 border-l-2 border-primary rounded-tl-sm" />
                            <div className="absolute top-0 right-0 size-5 border-t-2 border-r-2 border-primary rounded-tr-sm" />
                            <div className="absolute bottom-0 left-0 size-5 border-b-2 border-l-2 border-primary rounded-bl-sm" />
                            <div className="absolute bottom-0 right-0 size-5 border-b-2 border-r-2 border-primary rounded-br-sm" />

                            {/* Marca de agua sutil de código de barras EAN */}
                            <div className="opacity-25 select-none pointer-events-none flex flex-col items-center">
                                <svg viewBox="0 0 120 42" className="w-24 h-9 fill-current text-white" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="2" y="0" width="3" height="34" />
                                    <rect x="7" y="0" width="1.5" height="34" />
                                    <rect x="11" y="0" width="3" height="30" />
                                    <rect x="16" y="0" width="1.5" height="30" />
                                    <rect x="20" y="0" width="4.5" height="30" />
                                    <rect x="27" y="0" width="1.5" height="30" />
                                    <rect x="31" y="0" width="3" height="30" />
                                    <rect x="37" y="0" width="1.5" height="30" />
                                    <rect x="41" y="0" width="4.5" height="30" />
                                    <rect x="48" y="0" width="1.5" height="30" />
                                    <rect x="52" y="0" width="3" height="30" />
                                    <rect x="58" y="0" width="2" height="34" />
                                    <rect x="62" y="0" width="2" height="34" />
                                    <rect x="67" y="0" width="3" height="30" />
                                    <rect x="72" y="0" width="1.5" height="30" />
                                    <rect x="76" y="0" width="4.5" height="30" />
                                    <rect x="83" y="0" width="1.5" height="30" />
                                    <rect x="87" y="0" width="3" height="30" />
                                    <rect x="93" y="0" width="1.5" height="30" />
                                    <rect x="97" y="0" width="4.5" height="30" />
                                    <rect x="104" y="0" width="1.5" height="30" />
                                    <rect x="108" y="0" width="3" height="30" />
                                    <rect x="114" y="0" width="2" height="34" />
                                    <rect x="117" y="0" width="2" height="34" />
                                    <text x="60" y="41" font-size="7" font-family="monospace" text-anchor="middle" letterSpacing="2">EAN-13</text>
                                </svg>
                            </div>

                            <div className="absolute left-2 right-2 h-[2px] bg-primary/90 animate-[scanLine_2s_ease-in-out_infinite] shadow-[0_0_8px_rgba(34,197,94,0.9)]" />
                        </div>
                    </div>
                )}

                {/* Pause overlay */}
                {isPaused && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-[2px] flex flex-col items-center justify-center z-20 animate-[fadeIn_0.2s_ease-out]">
                        <div className="size-16 rounded-full bg-white/5 flex items-center justify-center mb-3">
                            <span className="material-symbols-outlined text-4xl text-white/50">snooze</span>
                        </div>
                        <p className="text-white/80 font-medium mb-4 text-sm mt-1">Escáner en reposo</p>
                        <button
                            onClick={resumeScanner}
                            className="bg-primary hover:bg-primary-hover text-[#102218] font-bold py-2.5 px-6 rounded-full shadow-lg shadow-primary/20 active:scale-95 transition-all text-sm"
                        >
                            Tocar para Reactivar
                        </button>
                    </div>
                )}

                {/* Controls (top-right overlay) */}
                {ready && !error && (
                    <div className="absolute top-3 right-3 flex flex-col gap-2 z-10">
                        {hasFlash && (
                            <button
                                onClick={toggleFlash}
                                className={`size-9 rounded-full flex items-center justify-center shadow-lg transition-colors ${isFlashOn ? 'bg-primary text-[#102218]' : 'bg-black/50 text-white'}`}
                            >
                                <span className="material-symbols-outlined text-[20px]">{isFlashOn ? 'flashlight_on' : 'flashlight_off'}</span>
                            </button>
                        )}
                        <button
                            onClick={toggleCamera}
                            className="size-9 rounded-full bg-black/50 text-white flex items-center justify-center shadow-lg"
                        >
                            <span className="material-symbols-outlined text-[20px]">flip_camera_ios</span>
                        </button>
                    </div>
                )}

                <style>{`
                    @keyframes scanLine {
                        0%, 100% { top: 10%; }
                        50% { top: 85%; }
                    }
                `}</style>
            </div>
        );
    }

    // ─── MODAL VARIANT (comportamiento original) ───────────────────────
    return (
        <div
            className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onTouchStart={unlockAudio}
            onClick={unlockAudio}
        >
            <div className="w-full max-w-sm bg-white dark:bg-gray-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <h3 className="text-gray-900 dark:text-white font-semibold text-lg">Escanear código EAN</h3>
                    <button
                        onClick={onClose}
                        className="size-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>

                {/* Video Area */}
                <div className="relative aspect-[4/3] bg-black overflow-hidden flex items-center justify-center">
                    {error ? (
                        <div className="text-center px-6">
                            <span className="material-symbols-outlined text-4xl text-red-400 mb-2 block">error_outline</span>
                            <p className="text-white/90 text-sm mb-3">{error}</p>
                            <button
                                onClick={onClose}
                                className="px-5 py-2 bg-white/10 rounded-lg text-white text-sm font-medium"
                            >
                                Cerrar
                            </button>
                        </div>
                    ) : !ready ? (
                        <div className="flex flex-col items-center gap-2">
                            <div className="size-8 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
                            <p className="text-white/50 text-xs">Iniciando cámara...</p>
                        </div>
                    ) : null}

                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`absolute inset-0 w-full h-full object-cover ${ready && !error ? '' : 'hidden'} ${facingMode === 'user' ? '-scale-x-100' : ''}`}
                    />

                    {/* Scanner Overlay */}
                    {ready && !error && !isPaused && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-8">
                            <div className="w-full max-w-[240px] aspect-[2/1] relative flex items-center justify-center">
                                <div className="absolute top-0 left-0 size-6 border-t-2 border-l-2 border-primary rounded-tl-lg" />
                                <div className="absolute top-0 right-0 size-6 border-t-2 border-r-2 border-primary rounded-tr-lg" />
                                <div className="absolute bottom-0 left-0 size-6 border-b-2 border-l-2 border-primary rounded-bl-lg" />
                                <div className="absolute bottom-0 right-0 size-6 border-b-2 border-r-2 border-primary rounded-br-lg" />

                                {/* Marca de agua sutil de código de barras EAN */}
                                <div className="opacity-25 select-none pointer-events-none flex flex-col items-center">
                                    <svg viewBox="0 0 120 42" className="w-28 h-10 fill-current text-white" xmlns="http://www.w3.org/2000/svg">
                                        <rect x="2" y="0" width="3" height="34" />
                                        <rect x="7" y="0" width="1.5" height="34" />
                                        <rect x="11" y="0" width="3" height="30" />
                                        <rect x="16" y="0" width="1.5" height="30" />
                                        <rect x="20" y="0" width="4.5" height="30" />
                                        <rect x="27" y="0" width="1.5" height="30" />
                                        <rect x="31" y="0" width="3" height="30" />
                                        <rect x="37" y="0" width="1.5" height="30" />
                                        <rect x="41" y="0" width="4.5" height="30" />
                                        <rect x="48" y="0" width="1.5" height="30" />
                                        <rect x="52" y="0" width="3" height="30" />
                                        <rect x="58" y="0" width="2" height="34" />
                                        <rect x="62" y="0" width="2" height="34" />
                                        <rect x="67" y="0" width="3" height="30" />
                                        <rect x="72" y="0" width="1.5" height="30" />
                                        <rect x="76" y="0" width="4.5" height="30" />
                                        <rect x="83" y="0" width="1.5" height="30" />
                                        <rect x="87" y="0" width="3" height="30" />
                                        <rect x="93" y="0" width="1.5" height="30" />
                                        <rect x="97" y="0" width="4.5" height="30" />
                                        <rect x="104" y="0" width="1.5" height="30" />
                                        <rect x="108" y="0" width="3" height="30" />
                                        <rect x="114" y="0" width="2" height="34" />
                                        <rect x="117" y="0" width="2" height="34" />
                                        <text x="60" y="41" font-size="7" font-family="monospace" text-anchor="middle" letterSpacing="2">EAN-13</text>
                                    </svg>
                                </div>

                                <div className="absolute left-2 right-2 h-[2px] bg-primary/80 animate-[scanLine_2s_ease-in-out_infinite] shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                            </div>
                        </div>
                    )}

                    {/* Pause overlay */}
                    {isPaused && (
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-[2px] flex flex-col items-center justify-center z-20 animate-[fadeIn_0.2s_ease-out]">
                            <div className="size-16 rounded-full bg-white/5 flex items-center justify-center mb-3">
                                <span className="material-symbols-outlined text-4xl text-white/50">snooze</span>
                            </div>
                            <p className="text-white/80 font-medium mb-4 text-sm mt-1">Escáner en reposo</p>
                            <button
                                onClick={resumeScanner}
                                className="bg-primary hover:bg-primary-hover text-[#102218] font-bold py-2.5 px-6 rounded-full shadow-lg shadow-primary/20 active:scale-95 transition-all text-sm"
                            >
                                Reactivar Cámara
                            </button>
                        </div>
                    )}
                </div>

                {/* Controls Area */}
                <div className="px-5 py-4 bg-gray-50 dark:bg-gray-800/80 flex items-center justify-center gap-10">
                    <button
                        onClick={toggleFlash}
                        disabled={!hasFlash}
                        className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all ${hasFlash
                            ? (isFlashOn ? 'text-primary' : 'text-gray-500 dark:text-gray-400')
                            : 'text-gray-300 dark:text-gray-600 opacity-50 cursor-not-allowed'
                            }`}
                    >
                        <div className={`size-12 flex items-center justify-center rounded-full ${isFlashOn ? 'bg-primary/20' : 'bg-gray-200 dark:bg-gray-800'
                            }`}>
                            <span className="material-symbols-outlined text-2xl">{isFlashOn ? 'flashlight_on' : 'flashlight_off'}</span>
                        </div>
                        <span className="text-xs font-medium">Linterna</span>
                    </button>

                    <button
                        onClick={toggleCamera}
                        className="flex flex-col items-center gap-1.5 p-2 rounded-xl text-gray-500 dark:text-gray-400"
                    >
                        <div className="size-12 flex items-center justify-center rounded-full bg-gray-200 dark:bg-gray-800 active:scale-95 transition-transform">
                            <span className="material-symbols-outlined text-2xl">flip_camera_ios</span>
                        </div>
                        <span className="text-xs font-medium">Voltear</span>
                    </button>
                </div>

                <style>{`
                    @keyframes scanLine {
                        0%, 100% { top: 10%; }
                        50% { top: 85%; }
                    }
                `}</style>
            </div>
        </div>
    );
});
