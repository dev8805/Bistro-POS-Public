import React from 'react';
import { ScanStepShell } from './ScanStepShell';
import type { ScanProgress } from '../../lib/invoiceScan/types';

/**
 * Indicador de progreso mientras la edge function procesa la imagen (Req 2.6).
 *
 * Componente presentacional: el texto del paso en curso llega por prop
 * (`stepText`) y se anuncia en la región `aria-live` del shell. No conoce la
 * llamada de red ni el temporizador de 45 segundos.
 *
 * Requisitos: 2.6 (indicador con el texto del paso en curso), 16.6.
 */

const NO_OP = (): void => { };

export interface ScanProcessingStepProps {
    /** Texto del paso en curso, por ejemplo "Leyendo las líneas de la factura...". */
    stepText: string;
    onClose: () => void;
    canGoBack?: boolean;
    onBack?: () => void;
    progress?: ScanProgress | null;
}

export const ScanProcessingStep: React.FC<ScanProcessingStepProps> = ({
    stepText,
    onClose,
    canGoBack = false,
    onBack = NO_OP,
    progress = null,
}) => (
    <ScanStepShell
        step="processing"
        title="La IA está leyendo la factura"
        subtitle="Tarda unos segundos. No cierres la pantalla."
        progress={progress}
        canGoBack={canGoBack}
        onBack={onBack}
        onClose={onClose}
        liveMessage={stepText}
    >
        <div className="flex flex-col items-center gap-4 py-8">
            {/* Anillo girando alrededor del sparkle: el glifo dice "IA" y el
                movimiento dice "trabajando", sin halos ni puntos que reboten. */}
            <span className="relative flex size-16 items-center justify-center" aria-hidden="true">
                <span className="absolute inset-0 animate-spin rounded-full border-4 border-amber-100 border-t-amber-400" />
                <span
                    className="material-symbols-outlined text-[26px] text-amber-500"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                >
                    auto_awesome
                </span>
            </span>

            <p className="text-center text-sm font-black tracking-tight text-slate-900">{stepText}</p>

            <p className="max-w-xs text-center text-xs font-semibold leading-snug text-slate-500">
                Cuando termine vas a revisar lo que leyó, y puedes corregir cualquier dato antes de guardar.
            </p>

            <p className="max-w-xs text-center text-xs font-semibold leading-snug text-slate-400">
                La foto ya quedó guardada como evidencia del registro.
            </p>
        </div>
    </ScanStepShell>
);

export default ScanProcessingStep;
