import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useIsMobile } from '../../hooks/useIsMobile';

/**
 * Ícono "info" junto a la etiqueta "Inactivo". Al pulsarlo despliega un popover
 * que explica, en lenguaje sencillo, por qué un empleado puede aparecer inactivo
 * aunque siga con sesión iniciada (no se registró actividad suya en unos minutos).
 *
 * El popover se renderiza con un portal a `document.body` y se posiciona en
 * coordenadas fijas respecto al ícono, para que NO lo recorte el panel con scroll
 * que contiene la lista de empleados.
 */
const CAUSES: Array<{ icon: string; text: React.ReactNode }> = [
    { icon: 'layers', text: <>Tiene la app en <strong>segundo plano</strong> (cambió de pestaña o programa)</> },
    { icon: 'lock', text: <>Bloqueó o cerró su <strong>dispositivo</strong></> },
    { icon: 'bedtime', text: <>Su dispositivo entró en <strong>suspensión</strong></> },
    { icon: 'wifi_off', text: <>Perdió la <strong>conexión a internet</strong></> },
];

const POPOVER_WIDTH = 256; // w-64

const InactiveCausesInfo = () => {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const isMobile = useIsMobile();
    const btnRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);

    const computePosition = useCallback(() => {
        const btn = btnRef.current;
        if (!btn) return;
        const r = btn.getBoundingClientRect();
        // Ancla el borde derecho del popover al borde derecho del ícono.
        let left = r.right - POPOVER_WIDTH;
        if (left < 8) left = 8;
        const maxLeft = window.innerWidth - POPOVER_WIDTH - 8;
        if (left > maxLeft) left = maxLeft;
        const top = r.bottom + 6;
        setPos({ top, left });
    }, []);

    const handleToggle = (e: React.MouseEvent | React.KeyboardEvent) => {
        e.stopPropagation();
        if (!open && !isMobile) computePosition();
        setOpen(v => !v);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle(e);
        }
    };

    // Cierre por click-fuera, Escape, scroll o resize (popover de desktop).
    useEffect(() => {
        if (!open || isMobile) return;
        const handleClickOutside = (e: MouseEvent) => {
            const t = e.target as Node;
            if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
            setOpen(false);
        };
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        const handleDismiss = () => setOpen(false);
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEsc);
        window.addEventListener('scroll', handleDismiss, true);
        window.addEventListener('resize', handleDismiss);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEsc);
            window.removeEventListener('scroll', handleDismiss, true);
            window.removeEventListener('resize', handleDismiss);
        };
    }, [open, isMobile]);

    // Cierre por Escape (modal de móvil).
    useEffect(() => {
        if (!open || !isMobile) return;
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [open, isMobile]);

    const panelInner = (
        <>
            <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">¿Por qué aparece inactivo?</h4>
                <button
                    onClick={() => setOpen(false)}
                    aria-label="Cerrar"
                    className="size-5 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 -mr-1 -mt-1 shrink-0"
                >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
            </div>

            <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-snug mb-2">
                No registramos actividad suya en los últimos minutos. Puede deberse a:
            </p>

            <ul className="space-y-1.5 text-[11px] text-slate-700 dark:text-slate-200 leading-snug">
                {CAUSES.map((c, i) => (
                    <li key={i} className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-[14px] text-slate-400 dark:text-slate-500 shrink-0 mt-px">{c.icon}</span>
                        <span>{c.text}</span>
                    </li>
                ))}
            </ul>

            <p className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                Sigue con <strong>sesión iniciada</strong>. Cuando vuelva a usar la app aparecerá como <strong>Activo</strong>.
            </p>
        </>
    );

    return (
        <>
            <button
                ref={btnRef}
                onClick={handleToggle}
                onKeyDown={handleKeyDown}
                aria-label="Por qué aparece inactivo"
                aria-expanded={open}
                tabIndex={0}
                className="size-4 flex items-center justify-center rounded-full text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            >
                <span className="material-symbols-outlined text-[14px]">info</span>
            </button>

            {/* Móvil: modal centrado para que se vea completo */}
            {open && isMobile && createPortal(
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                    onClick={() => setOpen(false)}
                >
                    <div aria-hidden="true" className="absolute inset-0 bg-black/40" />
                    <div
                        role="dialog"
                        aria-label="Por qué aparece inactivo"
                        className="relative w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151e32] shadow-xl p-4 animate-[fadeIn_0.15s_ease-out] text-left"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {panelInner}
                    </div>
                </div>,
                document.body
            )}

            {/* Desktop: popover anclado al ícono */}
            {open && !isMobile && pos && createPortal(
                <div
                    ref={popRef}
                    role="dialog"
                    aria-label="Por qué aparece inactivo"
                    style={{ position: 'fixed', top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
                    className="z-[100] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151e32] shadow-xl p-3 animate-[fadeIn_0.15s_ease-out] text-left"
                    onClick={(e) => e.stopPropagation()}
                >
                    {panelInner}
                </div>,
                document.body
            )}
        </>
    );
};

export default InactiveCausesInfo;
