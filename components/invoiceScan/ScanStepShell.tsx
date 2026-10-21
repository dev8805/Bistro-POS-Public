import React, { useEffect, useMemo, useRef } from 'react';
import type { ScanProgress, ScanStep } from '../../lib/invoiceScan/types';

/**
 * Chrome común de todos los pasos del Escaneo_Unificado.
 *
 * Componente presentacional puro: no consume `useInvoiceScanDraft` ni conoce la
 * máquina de estados. Recibe el título, el progreso, el contenido, el pie de
 * acciones y los callbacks de atrás y cerrar. Quien lo cablea es
 * `screens/InvoiceScanScreen.tsx`.
 *
 * Requisitos: 1.5 (control para cerrar el flujo), 6.4 (contador "Línea i de n"),
 * 16.6 (UI propia con el diseño de onboarding del escaneo).
 */

/** Rótulo del contador: "Paso i de n" en el flujo, "Línea i de n" en el Resolutor_Producto. */
export type ScanCounterLabel = 'step' | 'line';

/** A dónde se mueve el foco al entrar al paso. */
export type ScanAutoFocusTarget = 'heading' | 'field';

/**
 * Atributo con el que un paso marca el campo que debe recibir el foco cuando
 * pide `autoFocusTarget="field"`. Evita que el shell conozca el interior del paso.
 */
export const SCAN_AUTOFOCUS_ATTRIBUTE = 'data-scan-autofocus';

/** Acción primaria de la paleta Warm Bistro, con objetivo táctil de 44 px. */
export const SCAN_PRIMARY_ACTION_CLASSES =
    'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-amber-400 px-5 text-sm font-black uppercase tracking-wider text-slate-900 transition-colors hover:bg-amber-500 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50';

/** Acción secundaria: misma altura mínima, superficie neutra. */
export const SCAN_SECONDARY_ACTION_CLASSES =
    'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50';

export interface ScanStepShellProps {
    /** Paso activo. Al cambiar, el shell reubica el foco y anuncia el cambio. */
    step: ScanStep;
    title: string;
    subtitle?: string;
    /** Progreso del flujo o del Resolutor_Producto. `null` oculta el contador. */
    progress?: ScanProgress | null;
    counterLabel?: ScanCounterLabel;
    /** `false` deja el botón atrás visible pero deshabilitado. */
    canGoBack: boolean;
    onBack: () => void;
    onClose: () => void;
    /** `'field'` mueve el foco al campo marcado con `data-scan-autofocus`. */
    autoFocusTarget?: ScanAutoFocusTarget;
    /** Texto extra que se anuncia en la región `aria-live` (por ejemplo una conversión). */
    liveMessage?: string;
    /** Mensaje de error del paso. Se muestra en `rose-600` y se anuncia. */
    errorMessage?: string;
    /** Pie de acciones del paso. */
    footer?: React.ReactNode;
    children: React.ReactNode;
}

const HEADING_ID = 'scan-step-shell-title';

const isActivationKey = (key: string): boolean => key === 'Enter' || key === ' ' || key === 'Spacebar';

const STEP_MAX_WIDTH_CLASSES: Partial<Record<ScanStep, string>> = {
    destination: 'md:max-w-xl lg:max-w-2xl',
    capture: 'md:max-w-xl lg:max-w-2xl',
    crop: 'md:max-w-2xl lg:max-w-3xl',
    processing: 'md:max-w-md lg:max-w-lg',
    scanError: 'md:max-w-md lg:max-w-lg',
    review: 'md:max-w-2xl lg:max-w-4xl',
    emptyPurchase: 'md:max-w-md lg:max-w-lg',
    submitError: 'md:max-w-md lg:max-w-lg',
};

export const ScanStepShell: React.FC<ScanStepShellProps> = ({
    step,
    title,
    subtitle,
    progress = null,
    counterLabel = 'step',
    canGoBack,
    onBack,
    onClose,
    autoFocusTarget = 'heading',
    liveMessage,
    errorMessage,
    footer,
    children,
}) => {
    const headingRef = useRef<HTMLHeadingElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const containerMaxWidth = STEP_MAX_WIDTH_CLASSES[step] ?? 'md:max-w-2xl lg:max-w-3xl';

    const counterText = useMemo(() => {
        if (!progress || progress.total <= 0) return null;
        const prefix = counterLabel === 'line' ? 'Línea' : 'Paso';
        return `${prefix} ${progress.current} de ${progress.total}`;
    }, [progress, counterLabel]);

    // Foco al entrar a cada paso: al encabezado, o al campo que el paso marcó.
    useEffect(() => {
        if (autoFocusTarget === 'field') {
            const container = contentRef.current;
            const field =
                container?.querySelector<HTMLElement>(`[${SCAN_AUTOFOCUS_ATTRIBUTE}]`) ??
                container?.querySelector<HTMLElement>('input, select, textarea');
            if (field) {
                field.focus();
                return;
            }
        }
        headingRef.current?.focus();
    }, [step, autoFocusTarget]);

    const handleBack = () => {
        if (!canGoBack) return;
        onBack();
    };

    const handleBackKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        handleBack();
    };

    const handleCloseKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        onClose();
    };

    const announcement = [counterText, title, liveMessage, errorMessage].filter(Boolean).join('. ');

    return (
        <div className="fixed inset-0 z-[80] flex flex-col bg-slate-50 md:items-center md:justify-center md:bg-slate-900/50 md:p-6">
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby={HEADING_ID}
                className={`flex h-full w-full min-h-0 flex-col bg-slate-50 md:h-auto md:max-h-[92vh] ${containerMaxWidth} md:rounded-3xl md:shadow-2xl md:overflow-hidden transition-[max-width] duration-200`}
            >
                {/* Encabezado: atrás · título y contador · cerrar */}
                <header className="flex shrink-0 items-start gap-2 border-b border-slate-200 px-3 pt-[max(12px,env(safe-area-inset-top))] pb-3 md:pt-4">
                    <button
                        type="button"
                        onClick={handleBack}
                        onKeyDown={handleBackKeyDown}
                        disabled={!canGoBack}
                        aria-disabled={!canGoBack}
                        aria-label="Volver al paso anterior"
                        className="flex size-11 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-200 active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                        <span className="material-symbols-outlined text-2xl" aria-hidden="true">arrow_back</span>
                    </button>

                    <div className="min-w-0 flex-1 pt-1 text-center">
                        {counterText && (
                            <p className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-0.5 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-800">
                                {counterText}
                            </p>
                        )}
                        <h1
                            id={HEADING_ID}
                            ref={headingRef}
                            tabIndex={-1}
                            className="mt-1 truncate text-base font-black tracking-tight text-slate-900 focus:outline-none md:text-lg"
                        >
                            {title}
                        </h1>
                        {subtitle && (
                            <p className="mt-0.5 text-xs font-semibold leading-snug text-slate-500">{subtitle}</p>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        onKeyDown={handleCloseKeyDown}
                        aria-label="Cerrar el escaneo"
                        className="flex size-11 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-200 active:scale-90"
                    >
                        <span className="material-symbols-outlined text-2xl" aria-hidden="true">close</span>
                    </button>
                </header>

                {/* Región que anuncia los cambios de paso y los resultados */}
                <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
                    {announcement}
                </div>

                {errorMessage && (
                    <div className="mx-4 mt-3 shrink-0 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                        <p className="text-xs font-bold leading-snug text-rose-600">{errorMessage}</p>
                    </div>
                )}

                <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
                    {children}
                </div>

                {footer && (
                    <footer className="shrink-0 border-t border-slate-200 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))]">
                        {footer}
                    </footer>
                )}
            </section>
        </div>
    );
};

export default ScanStepShell;
