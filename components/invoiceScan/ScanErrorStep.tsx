import React from 'react';
import { ScanStepShell, SCAN_PRIMARY_ACTION_CLASSES, SCAN_SECONDARY_ACTION_CLASSES } from './ScanStepShell';
import type { ScanProgress } from '../../lib/invoiceScan/types';

/**
 * Paso de error del escaneo: timeout de 45 segundos, error HTTP, JSON inválido o
 * respuesta sin líneas. Ofrece exactamente dos acciones y la imagen capturada
 * sigue en el borrador (Req 2.7, 2.8).
 *
 * Componente presentacional: el mensaje llega por prop y los dos callbacks los
 * cablea `screens/InvoiceScanScreen.tsx`.
 *
 * Requisitos: 2.7 ("Reintentar" y "Continuar manual"), 2.8, 16.6.
 */

const NO_OP = (): void => { };

const isActivationKey = (key: string): boolean => key === 'Enter' || key === ' ' || key === 'Spacebar';

export interface ScanErrorStepProps {
    /** Mensaje del fallo, ya redactado por el hook. */
    message: string;
    onRetry: () => void;
    onContinueManual: () => void;
    onClose: () => void;
    canGoBack?: boolean;
    onBack?: () => void;
    progress?: ScanProgress | null;
}

export const ScanErrorStep: React.FC<ScanErrorStepProps> = ({
    message,
    onRetry,
    onContinueManual,
    onClose,
    canGoBack = false,
    onBack = NO_OP,
    progress = null,
}) => {
    const handleRetryKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        onRetry();
    };

    const handleContinueManualKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        onContinueManual();
    };

    return (
        <ScanStepShell
            step="scanError"
            title="No pudimos leer la factura"
            subtitle="La foto sigue guardada: elige cómo continuar."
            progress={progress}
            canGoBack={canGoBack}
            onBack={onBack}
            onClose={onClose}
            errorMessage={message}
            footer={
                <div className="flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={onRetry}
                        onKeyDown={handleRetryKeyDown}
                        aria-label="Reintentar la lectura de la factura"
                        className={SCAN_PRIMARY_ACTION_CLASSES}
                    >
                        <span className="material-symbols-outlined text-lg" aria-hidden="true">refresh</span>
                        Reintentar
                    </button>
                    <button
                        type="button"
                        onClick={onContinueManual}
                        onKeyDown={handleContinueManualKeyDown}
                        aria-label="Continuar manual y escribir los datos"
                        className={SCAN_SECONDARY_ACTION_CLASSES}
                    >
                        <span className="material-symbols-outlined text-lg" aria-hidden="true">edit_note</span>
                        Continuar manual
                    </button>
                </div>
            }
        >
            <ul className="space-y-3">
                <li className="flex items-start gap-2 rounded-2xl bg-white px-4 py-3">
                    <span className="material-symbols-outlined text-lg text-amber-600" aria-hidden="true">refresh</span>
                    <p className="text-xs font-semibold leading-snug text-slate-600">
                        <span className="font-black text-slate-900">Reintentar</span> vuelve a enviar la misma foto, sin
                        tomarla de nuevo.
                    </p>
                </li>
                <li className="flex items-start gap-2 rounded-2xl bg-white px-4 py-3">
                    <span className="material-symbols-outlined text-lg text-emerald-700" aria-hidden="true">edit_note</span>
                    <p className="text-xs font-semibold leading-snug text-slate-600">
                        <span className="font-black text-slate-900">Continuar manual</span> abre el registro con la foto
                        ya adjunta y los datos en blanco para escribirlos.
                    </p>
                </li>
            </ul>
        </ScanStepShell>
    );
};

export default ScanErrorStep;
