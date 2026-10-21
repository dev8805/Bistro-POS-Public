import React from 'react';
import { DocumentCropper } from '../DocumentCropper';

/**
 * Paso de recorte de esquinas antes de procesar la imagen (Req 2.2).
 *
 * Único paso de la captura que NO usa `ScanStepShell`: `DocumentCropper` ocupa
 * la pantalla completa (`fixed inset-0 z-[9999]`) y trae su propio encabezado y
 * su pie con "Todo" y "Usar recorte". Envolverlo en el shell dejaría dos
 * encabezados y dos regiones de foco compitiendo sobre la misma superficie.
 *
 * Componente presentacional: recibe la imagen y los dos callbacks. Tanto el
 * botón "Volver a tomar" como el cancelar del recortador regresan al paso de
 * captura, tal como describe la máquina de estados (`crop → capture`).
 *
 * Requisitos: 2.2 (recorte antes de procesar), 2.5 (una sola captura), 16.6.
 */

const isActivationKey = (key: string): boolean => key === 'Enter' || key === ' ' || key === 'Spacebar';

export interface ScanCropStepProps {
    /** URL de la imagen capturada (cámara o galería). */
    imageSrc: string;
    /** Recorte confirmado: el mismo blob se usa como Evidencia y como entrada de la IA. */
    onConfirm: (blob: Blob) => void;
    /** Descarta la imagen y regresa al paso de captura. */
    onRetake: () => void;
}

export const ScanCropStep: React.FC<ScanCropStepProps> = ({ imageSrc, onConfirm, onRetake }) => {
    const handleRetakeKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        onRetake();
    };

    return (
        <DocumentCropper
            imageSrc={imageSrc}
            onConfirm={onConfirm}
            onCancel={onRetake}
            title="Ajusta el recorte"
            subtitle="Alinea las esquinas con la factura"
            headerRightAction={
                <button
                    type="button"
                    onClick={onRetake}
                    onKeyDown={handleRetakeKeyDown}
                    aria-label="Volver a tomar la foto"
                    title="Volver a tomar la foto"
                    className="size-10 flex items-center justify-center rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-white/90 active:scale-90 transition-all shadow-sm"
                >
                    <span className="material-symbols-outlined text-[20px]" aria-hidden="true">replay</span>
                </button>
            }
        />
    );
};

export default ScanCropStep;
