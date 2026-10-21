import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { AuditCategory } from '../../lib/activityMockData';
import { CATEGORY_LABELS, CATEGORY_ICONS, SEVERITY_DOT } from './labels';

/** Descripción simple de qué registra cada categoría (orden de aparición en el filtro). */
const CATEGORY_DESCRIPTIONS: Partial<Record<AuditCategory, string>> = {
    auth: 'Inicios y cierres de sesión, intentos fallidos y cambios de PIN.',
    sale: 'Anulaciones de ventas, anulación de productos y devoluciones.',
    cash: 'Aperturas y cierres de turno de caja.',
    inventory: 'Mermas, ajustes de inventario y sus reversiones.',
    expense: 'Gastos registrados y eliminados.',
    product: 'Productos creados, eliminados y cambios de precio.',
    promotion: 'Promociones creadas y eliminadas.',
    user: 'Empleados creados, eliminados y cambios de rol.',
    permission: 'Cambios en los permisos de los empleados.',
    business_config: 'Cambios en los datos y la configuración del negocio.',
};

const SEVERITY_INFO: Array<{ key: keyof typeof SEVERITY_DOT; label: string; desc: string }> = [
    { key: 'info', label: 'Info', desc: 'Actividad normal del día a día.' },
    { key: 'warning', label: 'Atención', desc: 'Acciones que conviene revisar, como anulaciones o eliminaciones.' },
    { key: 'critical', label: 'Crítico', desc: 'Acciones sensibles o de alto impacto.' },
];

const ORDERED_CATEGORIES = Object.keys(CATEGORY_DESCRIPTIONS) as AuditCategory[];

/** Contenido explicativo para el bottom sheet móvil (1 columna compacta). */
const InfoContentMobile = () => (
    <div className="space-y-4">
        <section>
            <h5 className="text-sm font-bold text-slate-900 dark:text-white mb-1">¿Qué es el visor de eventos?</h5>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Es el registro de las acciones importantes de tu negocio: muestra quién hizo qué y cuándo.
                Usa los filtros de fecha, empleado, categoría y severidad para encontrar lo que buscas.
            </p>
        </section>

        <section>
            <h5 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Categorías</h5>
            <ul className="space-y-2">
                {ORDERED_CATEGORIES.map(cat => (
                    <li key={cat} className="flex items-start gap-2.5">
                        <span className="material-symbols-outlined text-[18px] text-slate-400 dark:text-slate-500 shrink-0 mt-px">
                            {CATEGORY_ICONS[cat]}
                        </span>
                        <span className="text-xs leading-snug">
                            <span className="font-semibold text-slate-800 dark:text-slate-100">{CATEGORY_LABELS[cat]}</span>
                            <span className="text-slate-600 dark:text-slate-300"> — {CATEGORY_DESCRIPTIONS[cat]}</span>
                        </span>
                    </li>
                ))}
            </ul>
        </section>

        <section>
            <h5 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Severidad</h5>
            <ul className="space-y-2">
                {SEVERITY_INFO.map(s => (
                    <li key={s.key} className="flex items-start gap-2.5">
                        <span className={`size-2.5 rounded-full shrink-0 mt-1 ${SEVERITY_DOT[s.key]}`} />
                        <span className="text-xs leading-snug">
                            <span className="font-semibold text-slate-800 dark:text-slate-100">{s.label}</span>
                            <span className="text-slate-600 dark:text-slate-300"> — {s.desc}</span>
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    </div>
);

/** Contenido explicativo para el modal de desktop (2 columnas, más espacioso). */
const InfoContentDesktop = () => (
    <div className="space-y-6">
        <section>
            <h5 className="text-base font-bold text-slate-900 dark:text-white mb-1.5">¿Qué es el visor de eventos?</h5>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                Es el registro de las acciones importantes de tu negocio: muestra quién hizo qué y cuándo.
                Usa los filtros de fecha, empleado, categoría y severidad para encontrar lo que buscas.
            </p>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-[1.35fr_1fr] gap-x-8 gap-y-6">
            <section>
                <h5 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">Categorías</h5>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2.5">
                    {ORDERED_CATEGORIES.map(cat => (
                        <li key={cat} className="flex items-start gap-2.5">
                            <span className="material-symbols-outlined text-[19px] text-slate-400 dark:text-slate-500 shrink-0 mt-px">
                                {CATEGORY_ICONS[cat]}
                            </span>
                            <span className="text-sm leading-snug">
                                <span className="font-semibold text-slate-800 dark:text-slate-100">{CATEGORY_LABELS[cat]}</span>
                                <span className="block text-xs text-slate-600 dark:text-slate-300 mt-0.5">{CATEGORY_DESCRIPTIONS[cat]}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            </section>

            <section>
                <h5 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">Severidad</h5>
                <ul className="space-y-3">
                    {SEVERITY_INFO.map(s => (
                        <li key={s.key} className="flex items-start gap-2.5">
                            <span className={`size-2.5 rounded-full shrink-0 mt-1.5 ${SEVERITY_DOT[s.key]}`} />
                            <span className="text-sm leading-snug">
                                <span className="font-semibold text-slate-800 dark:text-slate-100">{s.label}</span>
                                <span className="block text-xs text-slate-600 dark:text-slate-300 mt-0.5">{s.desc}</span>
                            </span>
                        </li>
                    ))}
                </ul>
            </section>
        </div>
    </div>
);

/**
 * Botón "info" en el header del Visor de eventos. Explica de forma sencilla cómo
 * funciona el visor, qué registra cada categoría y qué significan las severidades.
 * Popover anclado en desktop, bottom sheet con cierre por arrastre en móvil
 * (mismo patrón que `PresenceStack`, según el design system).
 */
const EventViewerInfo = () => {
    const [open, setOpen] = useState(false);
    const isMobile = useIsMobile();
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Cierre por click-fuera / Escape (solo popover de desktop).
    useEffect(() => {
        if (!open || isMobile) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
        };
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEsc);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEsc);
        };
    }, [open, isMobile]);

    // --- Bottom sheet: arrastre para cerrar (patrón del design system) ---
    const [swipeOffset, setSwipeOffset] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const swipeStartY = useRef<number | null>(null);
    const isDraggingRef = useRef(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const resetDrag = useCallback(() => {
        setSwipeOffset(0);
        setIsDragging(false);
        isDraggingRef.current = false;
        swipeStartY.current = null;
    }, []);

    const closeSheet = useCallback(() => {
        setIsClosing(true);
        setTimeout(() => {
            setOpen(false);
            setIsClosing(false);
            resetDrag();
        }, 250);
    }, [resetDrag]);

    useEffect(() => {
        if (!open || !isMobile) return;
        const el = panelRef.current;
        if (!el) return;
        const handler = (e: TouchEvent) => {
            if (swipeStartY.current === null) return;
            const sc = scrollRef.current;
            if (sc && sc.scrollTop > 0) return;
            const delta = e.touches[0].clientY - swipeStartY.current;
            if (delta > 5) {
                e.preventDefault();
                if (!isDraggingRef.current) {
                    isDraggingRef.current = true;
                    setIsDragging(true);
                }
                setSwipeOffset(delta);
            }
        };
        el.addEventListener('touchmove', handler, { passive: false });
        return () => el.removeEventListener('touchmove', handler);
    }, [open, isMobile]);

    const handleTouchStart = (e: React.TouchEvent) => {
        swipeStartY.current = e.touches[0].clientY;
    };
    const handleTouchEnd = () => {
        if (swipeOffset > 80) closeSheet();
        else resetDrag();
    };

    return (
        <>
            <button
                onClick={() => setOpen(o => !o)}
                aria-label="Cómo funciona el visor de eventos"
                aria-expanded={open}
                tabIndex={0}
                className="size-7 flex items-center justify-center rounded-full text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:text-blue-300 dark:hover:bg-blue-900/20 transition-colors"
            >
                <span className="material-symbols-outlined text-[20px]">info</span>
            </button>

            {/* Modal centrado (desktop) — respeta el sidebar lateral en md+ */}
            {open && !isMobile && (
                <div
                    className="fixed inset-0 md:left-[var(--sidebar-w,16rem)] z-50 flex items-center justify-center p-4 sm:p-6"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Cómo funciona el visor de eventos"
                >
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-[fadeIn_0.15s_ease-out]"
                        onClick={() => setOpen(false)}
                    />
                    <div
                        ref={wrapperRef}
                        className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151e32] shadow-2xl animate-[fadeIn_0.18s_ease-out]"
                    >
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                            <h4 className="text-base font-bold text-slate-900 dark:text-white">Sobre el visor de eventos</h4>
                            <button
                                onClick={() => setOpen(false)}
                                aria-label="Cerrar"
                                className="size-8 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>
                        <div className="overflow-y-auto custom-scrollbar px-6 py-5">
                            <InfoContentDesktop />
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom sheet (móvil) */}
            {open && isMobile && (
                <div className="fixed inset-0 z-50 flex flex-col justify-end">
                    <div
                        aria-hidden="true"
                        className="absolute inset-0 bg-black/40"
                        style={{ opacity: 1 - swipeOffset / 400 }}
                        onClick={closeSheet}
                    />
                    <div
                        ref={panelRef}
                        className={`relative bg-white dark:bg-[#151e32] w-full rounded-t-2xl pb-safe ${!isDragging && !isClosing ? 'transition-transform duration-250 ease-out' : ''} ${!isClosing && swipeOffset === 0 && !isDragging ? 'animate-[slideInUp_0.22s_cubic-bezier(0.32,0.72,0,1)]' : ''}`}
                        style={{ transform: `translateY(${isClosing ? '100%' : swipeOffset + 'px'})`, touchAction: 'pan-y' }}
                        onTouchStart={handleTouchStart}
                        onTouchEnd={handleTouchEnd}
                    >
                        <div className="flex justify-center pt-2.5 pb-1">
                            <span className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
                        </div>
                        <div className="flex items-center justify-between px-4 pb-2">
                            <h4 className="text-base font-bold text-slate-900 dark:text-white">Sobre el visor de eventos</h4>
                            <button
                                onClick={closeSheet}
                                aria-label="Cerrar"
                                className="size-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
                            >
                                <span className="material-symbols-outlined text-[18px]">close</span>
                            </button>
                        </div>
                        <div
                            ref={scrollRef}
                            className="max-h-[70vh] overflow-y-auto custom-scrollbar px-4"
                            style={{ paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px) + 1rem)' }}
                        >
                            <InfoContentMobile />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default EventViewerInfo;
