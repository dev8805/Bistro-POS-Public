import React, { useRef, useState, useCallback, useEffect, useLayoutEffect } from 'react';

interface DocumentCropperProps {
    // null = el cropper ya está abierto pero la imagen aún se está preparando.
    imageSrc: string | null;
    onConfirm: (blob: Blob) => void;
    onCancel: () => void;
    title?: string;
    subtitle?: string;
    headerRightAction?: React.ReactNode;
    // Texto e ícono (Material Symbols) del botón de confirmar. Por defecto
    // "Usar recorte" con el ícono check, para no alterar los usos existentes.
    confirmLabel?: string;
    confirmIcon?: string;
    // Modo "analizando": tras confirmar, el cropper se queda montado mostrando la
    // imagen recortada con una animación de escaneo IA (sin cambiar de pantalla,
    // sin salto visual). Oculta los controles de recorte mientras dura.
    analyzing?: boolean;
    analyzingTitle?: string;
    analyzingSubtitle?: string;
    // Tema claro (estilo Warm Bistro). Por defecto el cropper es oscuro, para no
    // alterar los usos existentes (facturas, evidencias).
    light?: boolean;
}

// Rectángulo de recorte en fracciones (0..1) relativas a la imagen.
interface CropRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

// Layout de la imagen dibujada (object-contain) dentro del contenedor.
interface ImgLayout {
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
}

type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e' | null;

const MIN_FRAC = 0.08; // tamaño mínimo del recorte (8% del lado)

export const DocumentCropper: React.FC<DocumentCropperProps> = ({
    imageSrc,
    onConfirm,
    onCancel,
    title = 'Ajustar encuadre',
    subtitle = 'Alinea las esquinas con la nota',
    headerRightAction,
    confirmLabel = 'Usar recorte',
    confirmIcon = 'check',
    analyzing = false,
    analyzingTitle = 'Analizando...',
    analyzingSubtitle = 'Identificando productos y cantidades',
    light = false,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const [layout, setLayout] = useState<ImgLayout | null>(null);
    const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 1, h: 1 });
    const [processing, setProcessing] = useState(false);
    const [isReady, setIsReady] = useState(false);

    const dragRef = useRef<{ mode: DragMode; startX: number; startY: number; startCrop: CropRect } | null>(null);

    // Calcula el rectángulo donde se dibuja la imagen con margen seguro para interactuar con los bordes.
    const computeLayout = useCallback(() => {
        const container = containerRef.current;
        const img = imgRef.current;
        if (!container || !img || !img.naturalWidth) return;
        const padX = 16;
        const padY = 16;
        const availW = Math.max(10, container.clientWidth - padX * 2);
        const availH = Math.max(10, container.clientHeight - padY * 2);
        const imgAR = img.naturalWidth / img.naturalHeight;
        const containerAR = availW / availH;
        let width: number, height: number, offsetX: number, offsetY: number;
        if (imgAR > containerAR) {
            width = availW;
            height = availW / imgAR;
            offsetX = padX;
            offsetY = padY + (availH - height) / 2;
        } else {
            height = availH;
            width = availH * imgAR;
            offsetX = padX + (availW - width) / 2;
            offsetY = padY;
        }
        setLayout({ offsetX, offsetY, width, height });
        setIsReady(true);
    }, []);

    // Al cambiar la imagen, volver al estado "no listo": la imagen anterior deja
    // de mostrarse y el crop vuelve a pantalla completa. Esto evita que una imagen
    // nueva se vea "saltar" reusando el layout de la anterior (causa del parpadeo).
    useLayoutEffect(() => {
        setIsReady(false);
        setLayout(null);
        setCrop({ x: 0, y: 0, w: 1, h: 1 });
        // Si la imagen ya está decodificada (precargada), computar el layout YA,
        // antes del primer pintado, para que no haya ni un frame con fallback.
        if (imgRef.current?.complete && imgRef.current.naturalWidth) {
            computeLayout();
        }
    }, [computeLayout, imageSrc]);

    useEffect(() => {
        const handleResize = () => computeLayout();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [computeLayout]);

    const handleImgLoad = () => computeLayout();

    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

    const handlePointerDown = (mode: DragMode) => (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        dragRef.current = { mode, startX: e.clientX, startY: e.clientY, startCrop: { ...crop } };
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        const drag = dragRef.current;
        const lay = layout;
        if (!drag || !lay) return;
        const dx = (e.clientX - drag.startX) / lay.width;
        const dy = (e.clientY - drag.startY) / lay.height;
        const s = drag.startCrop;
        let next: CropRect = { ...s };

        if (drag.mode === 'move') {
            next.x = clamp(s.x + dx, 0, 1 - s.w);
            next.y = clamp(s.y + dy, 0, 1 - s.h);
        } else {
            // Bordes actuales
            let left = s.x;
            let top = s.y;
            let right = s.x + s.w;
            let bottom = s.y + s.h;
            if (drag.mode === 'nw' || drag.mode === 'w' || drag.mode === 'sw') {
                left = clamp(s.x + dx, 0, right - MIN_FRAC);
            }
            if (drag.mode === 'ne' || drag.mode === 'e' || drag.mode === 'se') {
                right = clamp(s.x + s.w + dx, left + MIN_FRAC, 1);
            }
            if (drag.mode === 'nw' || drag.mode === 'n' || drag.mode === 'ne') {
                top = clamp(s.y + dy, 0, bottom - MIN_FRAC);
            }
            if (drag.mode === 'sw' || drag.mode === 's' || drag.mode === 'se') {
                bottom = clamp(s.y + s.h + dy, top + MIN_FRAC, 1);
            }
            next = { x: left, y: top, w: right - left, h: bottom - top };
        }
        setCrop(next);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (dragRef.current) {
            try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
            dragRef.current = null;
        }
    };

    const handleConfirm = async () => {
        const img = imgRef.current;
        if (!img || !img.naturalWidth) return;
        setProcessing(true);
        try {
            const nw = img.naturalWidth;
            const nh = img.naturalHeight;
            const sx = Math.round(crop.x * nw);
            const sy = Math.round(crop.y * nh);
            const sw = Math.round(crop.w * nw);
            const sh = Math.round(crop.h * nh);

            const maxDim = 2048;
            const scale = Math.min(1, maxDim / Math.max(sw, sh));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(sw * scale));
            canvas.height = Math.max(1, Math.round(sh * scale));
            const ctx = canvas.getContext('2d');
            if (!ctx) { setProcessing(false); return; }
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.85));
            if (blob) onConfirm(blob);
        } finally {
            setProcessing(false);
        }
    };

    // Posición del rectángulo de selección en píxeles del contenedor.
    const sel = layout
        ? {
            left: layout.offsetX + crop.x * layout.width,
            top: layout.offsetY + crop.y * layout.height,
            width: crop.w * layout.width,
            height: crop.h * layout.height,
        }
        : null;

    // Área táctil amplia (44x44px) para el pulgar, con visor L-bracket centrado
    const cornerBase = 'absolute size-11 flex items-center justify-center touch-none z-20';

    // Tema de color: claro (Warm Bistro) u oscuro (por defecto, usos existentes).
    const t = light ? {
        rootBg: 'bg-[#f8fafc]',
        panelBg: 'bg-[#f8fafc]',
        bar: 'bg-white/90',
        border: 'border-slate-200',
        titleText: 'text-slate-800',
        subText: 'text-slate-500',
        iconBtn: 'bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600',
        secBtn: 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200',
        // El velo que oscurece fuera del recorte: en claro es un velo blanco suave.
        veil: 'rgba(248, 250, 252, 0.72)',
    } : {
        rootBg: 'bg-[#0c0f16]',
        panelBg: 'bg-[#0c0f16]',
        bar: 'bg-[#0c0f16]/90',
        border: 'border-white/[0.08]',
        titleText: 'text-white',
        subText: 'text-white/50',
        iconBtn: 'bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-white/90',
        secBtn: 'bg-white/[0.08] hover:bg-white/[0.12] text-white/90 border border-white/10',
        veil: 'rgba(12, 16, 24, 0.65)',
    };

    return (
        <div className={`fixed inset-0 z-[9999] flex flex-col select-none animate-cropperBackdrop ${t.rootBg} md:items-center md:justify-center md:bg-slate-900/60 md:p-6`}>
            <div className={`relative flex flex-col w-full h-full min-h-0 ${t.panelBg} md:h-[85vh] md:max-h-[720px] md:min-h-[480px] md:max-w-xl lg:max-w-2xl md:rounded-3xl md:shadow-2xl md:border ${light ? 'md:border-slate-200' : 'md:border-white/10'} overflow-hidden`}>
                {/* Header */}
                <div className={`flex items-center justify-between px-5 pt-[max(12px,env(safe-area-inset-top))] pb-3 md:pt-4 md:pb-3.5 shrink-0 ${t.bar} backdrop-blur-xl border-b ${t.border} animate-cropperHeader`}>
                {analyzing ? (
                    <div className="size-10 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[22px] text-[#4285f4] animate-pulse">auto_awesome</span>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={onCancel}
                        className={`size-10 flex items-center justify-center rounded-full ${t.iconBtn} active:scale-90 transition-all shadow-sm`}
                        aria-label="Cancelar recorte"
                    >
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                )}
                <div className="flex flex-col items-center text-center px-2">
                    {analyzing ? (
                        <span className={`${t.subText} text-xs font-normal`}>{analyzingSubtitle}</span>
                    ) : (
                        <>
                            <span className={`${t.titleText} font-semibold text-sm tracking-wide`}>{title}</span>
                            <span className={`${t.subText} text-[11px] font-normal`}>{subtitle}</span>
                        </>
                    )}
                </div>
                <div className="w-10 flex items-center justify-end">
                    {headerRightAction || <div className="w-10" />}
                </div>
            </div>

            {/* Mesa de trabajo del escáner de borde a borde */}
            <div className="relative flex-1 min-h-0 overflow-hidden touch-none select-none flex items-center justify-center animate-cropperFocus">
                {!isReady && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" role="status" aria-label="Cargando imagen">
                        <div className={`size-8 border-[3px] ${light ? 'border-slate-300' : 'border-white/20'} border-t-amber-500 rounded-full animate-spin`} />
                    </div>
                )}
                <div
                    ref={containerRef}
                    className={`relative w-full h-full overflow-hidden touch-none select-none transition-opacity duration-200 ease-out ${isReady && layout ? 'opacity-100' : 'opacity-0'}`}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                >
                    {imageSrc && (
                        <img
                            ref={imgRef}
                            src={imageSrc}
                            onLoad={handleImgLoad}
                            alt="Documento"
                            // Posición absoluta SIEMPRE. Mientras no hay layout la
                            // imagen queda invisible (sin tamaño), así no se ve con
                            // un posicionamiento provisional que luego salta.
                            className="absolute pointer-events-none select-none"
                            style={layout ? {
                                left: layout.offsetX,
                                top: layout.offsetY,
                                width: layout.width,
                                height: layout.height,
                            } : {
                                left: 0,
                                top: 0,
                                width: 0,
                                height: 0,
                                opacity: 0,
                            }}
                            draggable={false}
                        />
                    )}

                    {sel && !analyzing && (
                        <>
                            {/* Marco de recorte con velo continuo en toda la pantalla */}
                            <div
                                className="absolute border-[1.5px] border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)]"
                                style={{
                                    left: sel.left,
                                    top: sel.top,
                                    width: sel.width,
                                    height: sel.height,
                                    boxShadow: `0 0 0 9999px ${t.veil}`,
                                }}
                            >
                                {/* Rejilla sutil en tercios */}
                                <div className="absolute inset-0 pointer-events-none opacity-30">
                                    <div className="absolute top-1/3 left-0 right-0 h-px bg-white" />
                                    <div className="absolute top-2/3 left-0 right-0 h-px bg-white" />
                                    <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white" />
                                    <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white" />
                                </div>

                                {/* Zona central para mover todo el marco */}
                                <div
                                    className="absolute inset-6 cursor-move touch-none"
                                    onPointerDown={handlePointerDown('move')}
                                />

                                {/* Esquinas angulares tipo Visor de Escáner (L-brackets de alta precisión) */}
                                <div className={`${cornerBase} -top-[14px] -left-[14px] cursor-nwse-resize`} onPointerDown={handlePointerDown('nw')}>
                                    <div className="size-5 border-t-[3.5px] border-l-[3.5px] border-amber-400 rounded-tl-sm shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                                </div>
                                <div className={`${cornerBase} -top-[14px] -right-[14px] cursor-nesw-resize`} onPointerDown={handlePointerDown('ne')}>
                                    <div className="size-5 border-t-[3.5px] border-r-[3.5px] border-amber-400 rounded-tr-sm shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                                </div>
                                <div className={`${cornerBase} -bottom-[14px] -left-[14px] cursor-nesw-resize`} onPointerDown={handlePointerDown('sw')}>
                                    <div className="size-5 border-b-[3.5px] border-l-[3.5px] border-amber-400 rounded-bl-sm shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                                </div>
                                <div className={`${cornerBase} -bottom-[14px] -right-[14px] cursor-nwse-resize`} onPointerDown={handlePointerDown('se')}>
                                    <div className="size-5 border-b-[3.5px] border-r-[3.5px] border-amber-400 rounded-br-sm shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                                </div>

                                {/* Manijas lineales en el centro de cada borde */}
                                <div
                                    className="absolute -top-4 left-1/2 -translate-x-1/2 w-16 h-8 flex items-center justify-center touch-none cursor-ns-resize z-10"
                                    onPointerDown={handlePointerDown('n')}
                                    aria-label="Ajustar borde superior"
                                >
                                    <div className="w-8 h-1 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
                                </div>

                                <div
                                    className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-16 h-8 flex items-center justify-center touch-none cursor-ns-resize z-10"
                                    onPointerDown={handlePointerDown('s')}
                                    aria-label="Ajustar borde inferior"
                                >
                                    <div className="w-8 h-1 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
                                </div>

                                <div
                                    className="absolute -left-4 top-1/2 -translate-y-1/2 h-16 w-8 flex items-center justify-center touch-none cursor-ew-resize z-10"
                                    onPointerDown={handlePointerDown('w')}
                                    aria-label="Ajustar borde izquierdo"
                                >
                                    <div className="h-8 w-1 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
                                </div>

                                <div
                                    className="absolute -right-4 top-1/2 -translate-y-1/2 h-16 w-8 flex items-center justify-center touch-none cursor-ew-resize z-10"
                                    onPointerDown={handlePointerDown('e')}
                                    aria-label="Ajustar borde derecho"
                                >
                                    <div className="h-8 w-1 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── Overlay de análisis IA estilo Google (halo que respira + aura girando) ── */}
                    {analyzing && sel && (
                        <div
                            className="absolute overflow-hidden pointer-events-none z-20 rounded-lg animate-aiBorderGlow"
                            style={{ left: sel.left, top: sel.top, width: sel.width, height: sel.height }}
                        >
                            {/* Aura cónica con el gradiente Gemini (azul→violeta→coral) girando lento */}
                            <div className="absolute -inset-1/4 animate-aiAuraSpin opacity-40 blur-2xl" />

                            {/* Resplandor que respira desde el centro, muy sutil */}
                            <div className="absolute inset-0 animate-aiBreathe bg-[radial-gradient(circle_at_center,rgba(66,133,244,0.14),rgba(155,114,203,0.08)_50%,transparent_75%)]" />

                            {/* Streaming shimmer: banda de luz con el gradiente Gemini que
                                recorre la imagen "leyéndola", el gesto que comunica análisis. */}
                            <div
                                className="absolute inset-x-0 h-20 animate-aiReadSweep blur-md"
                                style={{ ['--ai-read-h' as any]: `${sel.height + 80}px` }}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Dock de acciones inferior */}
            {analyzing ? (
                <div className={`flex items-center justify-center gap-2.5 px-5 pt-4 pb-[max(24px,env(safe-area-inset-bottom))] md:py-5 shrink-0 ${t.bar} backdrop-blur-2xl border-t ${t.border}`}>
                    <span className="size-2 rounded-full bg-[#4285f4] shadow-[0_0_8px_rgba(66,133,244,0.8)] animate-pulse" />
                    <span className="font-semibold text-sm animate-aiShimmer bg-clip-text text-transparent bg-[length:200%_100%]">
                        {analyzingTitle}
                    </span>
                </div>
            ) : (
                <div className={`flex items-center justify-between gap-3 px-5 pt-3.5 pb-[max(20px,env(safe-area-inset-bottom))] md:py-4 shrink-0 ${t.bar} backdrop-blur-2xl border-t ${t.border} animate-cropperDock`}>
                    <button
                        type="button"
                        onClick={() => setCrop({ x: 0, y: 0, w: 1, h: 1 })}
                        disabled={!isReady}
                        className={`disabled:opacity-50 h-12 px-5 flex items-center justify-center gap-2 ${t.secBtn} rounded-2xl font-semibold text-sm active:scale-95 transition-all shadow-sm`}
                    >
                        <span className="material-symbols-outlined text-[19px]">crop_free</span>
                        Todo
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={processing || !isReady}
                        className="flex-1 h-12 flex items-center justify-center gap-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:brightness-105 text-neutral-950 rounded-2xl font-bold text-sm active:scale-[0.98] transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
                    >
                        {processing ? (
                            <div className="size-5 border-2 border-neutral-950 border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-[20px] font-bold">{confirmIcon}</span>
                                {confirmLabel}
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    </div>
    );
};
