import React, { useState, useRef, useEffect } from 'react';

/**
 * Badge "Sin conexión" interactivo. Al pulsarlo, despliega un popover con
 * las posibles causas en lenguaje sencillo. Esto ayuda al admin a entender
 * que "Sin conexión" no es un diagnóstico exacto: es una categoría que
 * cubre varias situaciones que técnicamente se ven igual desde fuera.
 */
const OfflineCausesBadge = () => {
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Cierra al hacer click fuera o presionar Escape
    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEsc);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEsc);
        };
    }, [open]);

    const handleToggle = (e: React.MouseEvent | React.KeyboardEvent) => {
        e.stopPropagation();
        setOpen(v => !v);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle(e);
        }
    };

    return (
        <div ref={wrapperRef} className="relative inline-block">
            <button
                onClick={handleToggle}
                onKeyDown={handleKeyDown}
                aria-label="Ver posibles causas de la falta de conexión"
                aria-expanded={open}
                tabIndex={0}
                className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors cursor-pointer"
            >
                <span className="material-symbols-outlined text-[12px]">cloud_off</span>
                Sin conexión
                <span className="material-symbols-outlined text-[12px] opacity-70">info</span>
            </button>

            {open && (
                <div
                    role="dialog"
                    aria-label="Posibles causas de la falta de conexión"
                    className="absolute left-0 top-full mt-2 z-50 w-72 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151e32] shadow-xl p-3 animate-[fadeIn_0.15s_ease-out]"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-start justify-between gap-2 mb-2">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                            Posibles causas
                        </h4>
                        <button
                            onClick={() => setOpen(false)}
                            aria-label="Cerrar"
                            className="size-5 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 -mr-1 -mt-1"
                        >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                    </div>

                    <ul className="space-y-1.5 text-[11px] text-slate-700 dark:text-slate-200 leading-snug">
                        <li className="flex items-start gap-2">
                            <span className="material-symbols-outlined text-[14px] text-amber-500 shrink-0 mt-px">wifi_off</span>
                            <span>Se le fue el <strong>internet</strong></span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="material-symbols-outlined text-[14px] text-amber-500 shrink-0 mt-px">tab_close</span>
                            <span>Cerró el <strong>navegador o la pestaña</strong> sin salir de la app</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="material-symbols-outlined text-[14px] text-amber-500 shrink-0 mt-px">lock</span>
                            <span>Bloqueó o cerró su <strong>dispositivo</strong></span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="material-symbols-outlined text-[14px] text-amber-500 shrink-0 mt-px">layers</span>
                            <span>Tiene la app en <strong>segundo plano</strong> (cambió a otra pestaña o programa)</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="material-symbols-outlined text-[14px] text-amber-500 shrink-0 mt-px">bedtime</span>
                            <span>Su dispositivo se <strong>durmió</strong></span>
                        </li>
                    </ul>

                    <p className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
                        El sistema no puede saber con certeza cuál es la causa, pero el empleado <strong>sigue con sesión iniciada</strong>.
                    </p>
                </div>
            )}
        </div>
    );
};

export default OfflineCausesBadge;
