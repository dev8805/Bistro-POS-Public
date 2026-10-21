import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useImageUpload } from '../hooks/useImageUpload';
import { useBusinessSettings } from '../context/BusinessSettingsContext';
import { useToast } from '../context/ToastContext';
import { formatCurrency } from '../lib/formatters';
import { shareEvidence } from '../lib/shareEvidence';
import { DocumentCropper } from './DocumentCropper';
import { InAppCamera } from './InAppCamera';

interface ViewerDebt {
    id: string;
    evidence_url?: string | null;
    total_amount: number;
    paid_amount: number;
    status?: string;
    created_at: string;
}

export interface ViewerItem {
    id: string;
    evidence_url?: string | null;
    title?: string;
    personName: string;
    typeLabel: string;
    shareTypeLabel?: string;
    amount: number;
    dateText: string;
}

interface EvidenceViewerProps {
    debt?: ViewerDebt;
    supplierName?: string;
    item?: ViewerItem;
    title?: string;
    onClose: () => void;
    onEvidenceChange: (id: string, url: string | null) => Promise<void>;
}

export const EvidenceViewer: React.FC<EvidenceViewerProps> = ({
    debt,
    supplierName,
    item,
    title,
    onClose,
    onEvidenceChange,
}) => {
    const { businessName } = useBusinessSettings();
    const { showToast } = useToast();
    const [working, setWorking] = useState(false);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const isDraggingRef = React.useRef(false);
    const startPosRef = React.useRef({ x: 0, y: 0 });

    const itemId = item?.id || debt?.id || '';
    const initialUrl = item ? item.evidence_url : debt?.evidence_url;
    const modalTitle = title || item?.title || 'Evidencia del movimiento';

    let displayName = '';
    let displayTypeLabel = '';
    let displayAmount = 0;
    let displayDateText = '';

    if (item) {
        displayName = item.personName;
        displayTypeLabel = item.typeLabel;
        displayAmount = item.amount;
        displayDateText = item.dateText;
    } else if (debt) {
        const isPayment = debt.total_amount === 0 && debt.paid_amount > 0;
        const isCash = !isPayment && debt.status === 'paid' && debt.paid_amount >= debt.total_amount && debt.total_amount > 0;
        displayName = supplierName || '';
        displayTypeLabel = isPayment ? 'Abono' : isCash ? 'Compra de contado' : 'Crédito';
        displayAmount = isPayment ? debt.paid_amount : debt.total_amount;
        displayDateText = new Date(debt.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    const upload = useImageUpload(initialUrl || null, 'debt-evidence');

    const handleResetZoom = () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    };

    const handleCloseLightbox = () => {
        setLightboxOpen(false);
        handleResetZoom();
    };

    const handleOpenLightbox = () => {
        handleResetZoom();
        setLightboxOpen(true);
    };

    const handleZoomIn = () => {
        setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)));
    };

    const handleZoomOut = () => {
        setZoom(z => {
            const next = Math.max(1, +(z - 0.25).toFixed(2));
            if (next === 1) setPan({ x: 0, y: 0 });
            return next;
        });
    };

    const handleDoubleClick = () => {
        if (zoom > 1) {
            handleResetZoom();
            return;
        }
        setZoom(2.2);
    };

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.2 : -0.2;
        setZoom(z => {
            const next = Math.min(4, Math.max(1, +(z + delta).toFixed(2)));
            if (next === 1) setPan({ x: 0, y: 0 });
            return next;
        });
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        if (zoom <= 1) return;
        isDraggingRef.current = true;
        setIsDragging(true);
        startPosRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDraggingRef.current) return;
        setPan({
            x: e.clientX - startPosRef.current.x,
            y: e.clientY - startPosRef.current.y,
        });
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (isDraggingRef.current) {
            isDraggingRef.current = false;
            setIsDragging(false);
            try {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {}
        }
    };

    React.useEffect(() => {
        if (!lightboxOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                handleCloseLightbox();
            } else if (e.key === '+' || e.key === '=') {
                handleZoomIn();
            } else if (e.key === '-') {
                handleZoomOut();
            } else if (e.key === '0') {
                handleResetZoom();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [lightboxOpen]);

    React.useEffect(() => {
        const persist = async () => {
            if (upload.imageUrl && upload.imageUrl !== (initialUrl || null) && !upload.uploading) {
                setWorking(true);
                try {
                    await onEvidenceChange(itemId, upload.imageUrl);
                    upload.markAsSaved();
                    showToast('Evidencia actualizada', 'success');
                } catch { showToast('Error al guardar evidencia', 'error'); }
                finally { setWorking(false); }
            }
        };
        persist();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [upload.imageUrl, upload.uploading]);

    const handleDelete = async () => {
        setWorking(true);
        try {
            await upload.deleteImage();
            await onEvidenceChange(itemId, null);
            showToast('Evidencia eliminada', 'success');
            onClose();
        } catch { showToast('Error al eliminar', 'error'); }
        finally { setWorking(false); }
    };

    const handleShare = async () => {
        if (!upload.previewUrl) return;
        const shareLabel = item?.shareTypeLabel !== undefined ? item.shareTypeLabel : displayTypeLabel;
        const copied = await shareEvidence({
            evidenceUrl: upload.previewUrl,
            supplierName: displayName,
            typeLabel: shareLabel,
            amountText: `$${formatCurrency(displayAmount)}`,
            dateText: displayDateText,
            businessName,
        });
        if (copied) showToast('Imagen copiada — pégala en WhatsApp con Ctrl+V', 'success');
    };

    return createPortal(
        <>
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" role="button" tabIndex={-1} onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()} aria-label="Cerrar" />
            <div className="relative bg-white dark:bg-surface-dark rounded-2xl w-full max-w-md p-5 shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col gap-4">
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">{modalTitle}</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{displayName} · {displayTypeLabel} · ${formatCurrency(displayAmount)} · {displayDateText}</p>
                    </div>
                    <button onClick={onClose} className="size-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-500" aria-label="Cerrar"><span className="material-symbols-outlined">close</span></button>
                </div>

                <div className="relative rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center min-h-[200px] max-h-[60vh]">
                    {upload.previewUrl ? (
                        <button type="button" onClick={handleOpenLightbox} className="w-full h-full flex items-center justify-center cursor-zoom-in group" aria-label="Ampliar evidencia">
                            <img src={upload.previewUrl} alt="Evidencia" className="w-full h-full object-contain max-h-[60vh]" />
                            <span className="absolute bottom-2 right-2 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-sm text-white text-[11px] font-bold opacity-90 group-hover:opacity-100 transition-opacity shadow-sm">
                                <span className="material-symbols-outlined text-[15px]">zoom_in</span>
                                Ampliar
                            </span>
                        </button>
                    ) : (
                        <div className="py-12 flex flex-col items-center gap-2 text-gray-400">
                            <span className="material-symbols-outlined text-4xl">image</span>
                            <span className="text-xs">Sin evidencia</span>
                        </div>
                    )}
                </div>

                <div className="flex gap-2">
                    <button type="button" onClick={upload.triggerGallery} disabled={working || upload.uploading} className="flex-1 h-10 flex items-center justify-center gap-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-xs hover:bg-gray-200 disabled:opacity-50">
                        <span className="material-symbols-outlined text-[18px]">{upload.previewUrl ? 'sync' : 'add_photo_alternate'}</span>
                        {upload.previewUrl ? 'Reemplazar' : 'Adjuntar'}
                    </button>
                    {upload.previewUrl && (
                        <button type="button" onClick={handleDelete} disabled={working || upload.uploading} className="h-10 px-3 flex items-center justify-center bg-red-50 dark:bg-red-900/20 text-red-500 rounded-xl hover:bg-red-100 disabled:opacity-50" aria-label="Eliminar evidencia">
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                    )}
                </div>

                {upload.previewUrl && (
                    <button type="button" onClick={handleShare} disabled={working || upload.uploading} className="w-full h-11 flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold rounded-xl shadow-sm active:scale-[0.98] transition-all disabled:opacity-50">
                        <span className="material-symbols-outlined">share</span>
                        Compartir por WhatsApp
                    </button>
                )}

                {upload.showCropper && upload.cropperImageSrc && (
                    <DocumentCropper
                        imageSrc={upload.cropperImageSrc}
                        onConfirm={(blob) => upload.onCropComplete(blob, false)}
                        onCancel={upload.onCropCancel}
                        title="Ajusta el recorte"
                        subtitle="Alinea las esquinas con el comprobante"
                    />
                )}
                {upload.showInAppCamera && (
                    <InAppCamera onCapture={upload.onCameraCapture} onClose={upload.onCameraClose} />
                )}
            </div>
        </div>

        {lightboxOpen && upload.previewUrl && (
            <div
                className="fixed inset-0 z-[130] bg-black/90 backdrop-blur-md flex flex-col animate-[fadeIn_0.2s_ease-out] select-none"
                onWheel={handleWheel}
            >
                {/* Header superior con datos y controles */}
                <div className="flex items-center justify-between px-4 py-3 bg-black/40 border-b border-white/10 text-white shrink-0 z-20">
                    <div className="min-w-0 pr-2">
                        <p className="text-xs font-semibold truncate text-white/90">
                            {displayName} · {displayTypeLabel} · ${formatCurrency(displayAmount)}
                        </p>
                        <p className="text-[10px] text-white/60">{displayDateText}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <button
                            type="button"
                            onClick={handleZoomOut}
                            disabled={zoom <= 1}
                            className="size-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all disabled:opacity-30 disabled:pointer-events-none"
                            aria-label="Alejar"
                            title="Alejar (-)"
                        >
                            <span className="material-symbols-outlined text-[18px]">zoom_out</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleResetZoom}
                            className="h-8 px-2 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold tabular-nums text-white transition-colors"
                            title="Restablecer tamaño (0)"
                            aria-label="Restablecer tamaño"
                        >
                            {Math.round(zoom * 100)}%
                        </button>
                        <button
                            type="button"
                            onClick={handleZoomIn}
                            disabled={zoom >= 4}
                            className="size-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all disabled:opacity-30 disabled:pointer-events-none"
                            aria-label="Acercar"
                            title="Acercar (+)"
                        >
                            <span className="material-symbols-outlined text-[18px]">zoom_in</span>
                        </button>
                        {zoom > 1 && (
                            <button
                                type="button"
                                onClick={handleResetZoom}
                                className="size-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white flex items-center justify-center transition-all"
                                aria-label="Restablecer encuadre"
                                title="Ajustar a pantalla"
                            >
                                <span className="material-symbols-outlined text-[18px]">crop_free</span>
                            </button>
                        )}
                        <div className="w-[1px] h-4 bg-white/20 mx-1" />
                        <button
                            type="button"
                            onClick={handleCloseLightbox}
                            className="size-8 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 text-white flex items-center justify-center transition-all"
                            aria-label="Cerrar visor"
                            title="Cerrar (Esc)"
                        >
                            <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                    </div>
                </div>

                {/* Área de visualización interactiva (Pan & Zoom) */}
                <div
                    className="flex-1 w-full h-full relative overflow-hidden flex items-center justify-center p-4"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) handleCloseLightbox();
                    }}
                >
                    <div
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                        onDoubleClick={handleDoubleClick}
                        style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            transition: isDragging ? 'none' : 'transform 180ms ease-out',
                            transformOrigin: 'center center',
                        }}
                        className={`inline-flex items-center justify-center max-w-full max-h-full touch-none select-none ${
                            zoom <= 1 ? 'cursor-zoom-in' : isDragging ? 'cursor-grabbing' : 'cursor-grab'
                        }`}
                    >
                        <img
                            src={upload.previewUrl}
                            alt="Evidencia ampliada"
                            draggable={false}
                            className="max-h-[82vh] max-w-[90vw] w-auto h-auto object-contain rounded-xl shadow-2xl pointer-events-none"
                        />
                    </div>

                    {/* Tip flotante inferior discreto */}
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white/70 text-[11px] font-medium pointer-events-none shadow-lg">
                        {zoom > 1 ? 'Arrastra para mover · Doble clic para ajustar' : 'Rueda o doble clic para acercar'}
                    </div>
                </div>
            </div>
        )}
        </>,
        document.body
    );
};
