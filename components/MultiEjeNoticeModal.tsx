import React, { useEffect, useRef, useState } from 'react';
import { useEjeStatus } from '../hooks/useEjeStatus';
import { useBusinessSettings } from '../hooks/useBusinessSettings';

/**
 * MultiEjeNoticeModal — aviso operacional de multi-eje (Req 6).
 *
 * El modelo Usuario Eje no incluye lock técnico cuando hay 2+ turnos de caja
 * abiertos (mejora futura declarada). En su lugar se muestra un aviso para que
 * los cajeros se coordinen manualmente y no cobren la misma mesa dos veces.
 *
 * Solo aplica cuando el módulo de mesas está activado en el negocio.
 *
 * Disparadores:
 *   - Req 6.1: al abrir un turno cuando ya existe otro abierto (evento
 *     `shift-opened`, si tras refrescar hay 2+ turnos).
 *   - Req 6.2: al transicionar de online a offline con 2+ turnos en caché
 *     (evento `offline`).
 *
 * El texto sigue exactamente el formato del Req 6.3.
 */
const MultiEjeNoticeModal = () => {
    const { isTablesEnabled } = useBusinessSettings();
    const { multiEje, ejesNombres } = useEjeStatus();
    const [visible, setVisible] = useState(false);
    // Hay un disparador pendiente esperando a que se confirme el estado multi-eje.
    const triggerPendingRef = useRef(false);
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const markTrigger = () => { triggerPendingRef.current = true; };
        window.addEventListener('shift-opened', markTrigger);
        window.addEventListener('offline', markTrigger);
        return () => {
            window.removeEventListener('shift-opened', markTrigger);
            window.removeEventListener('offline', markTrigger);
        };
    }, []);

    // Cuando llega un disparador y el estado confirma 2+ turnos abiertos, mostrar solo si las mesas están activadas.
    useEffect(() => {
        if (!isTablesEnabled) {
            triggerPendingRef.current = false;
            setVisible(false);
            return;
        }
        if (triggerPendingRef.current && multiEje && ejesNombres.length >= 2) {
            triggerPendingRef.current = false;
            setVisible(true);
        }
    }, [isTablesEnabled, multiEje, ejesNombres]);

    // Foco en el botón de cierre al abrir (accesibilidad del modal).
    useEffect(() => {
        if (visible) {
            const id = window.setTimeout(() => {
                dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
            }, 50);
            return () => window.clearTimeout(id);
        }
    }, [visible]);

    if (!isTablesEnabled || !visible) return null;

    const handleClose = () => setVisible(false);
    const nombres = ejesNombres.join(', ');
    const mensaje = `Hay más de un cajero con turno abierto (${nombres}). Mantengan comunicación si se cae internet para no cobrar la misma mesa dos veces.`;

    return (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                role="button"
                tabIndex={-1}
                onClick={handleClose}
                onKeyDown={(e) => e.key === 'Escape' && handleClose()}
                aria-label="Cerrar aviso"
            />

            <div
                ref={dialogRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="multi-eje-title"
                aria-describedby="multi-eje-desc"
                className="relative w-full max-w-sm bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            >
                <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="size-11 shrink-0 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[24px]" aria-hidden>groups</span>
                    </div>
                    <h2 id="multi-eje-title" className="text-base font-bold text-text-main dark:text-white leading-tight">
                        Varios cajeros con turno abierto
                    </h2>
                </div>

                <div className="p-4">
                    <p id="multi-eje-desc" className="text-sm text-text-main dark:text-gray-200 leading-relaxed">
                        {mensaje}
                    </p>
                </div>

                <div className="p-4 pt-0">
                    <button
                        onClick={handleClose}
                        className="w-full h-12 rounded-xl bg-primary hover:bg-primary-hover text-[#102218] font-bold text-base shadow-lg shadow-primary/20 transition-all"
                    >
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MultiEjeNoticeModal;
