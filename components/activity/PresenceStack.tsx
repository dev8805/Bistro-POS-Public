import React, { useState, useEffect, useRef, useCallback } from 'react';
import { PresenceEntry } from '../../hooks/useEmployeePresence';
import { useIsMobile } from '../../hooks/useIsMobile';
import PresenceList from './PresenceList';

interface PresenceStackProps {
    users: PresenceEntry[];
    onlineCount: number;
    loading: boolean;
    isObserverOffline: boolean;
    timezone: string;
}

const MAX_AVATARS = 4;

const initialsOf = (name: string): string =>
    name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

/**
 * Stack de avatares de empleados conectados, ubicado en el header del Visor de eventos.
 * Al pulsarlo despliega el detalle: popover anclado en desktop, bottom sheet en móvil
 * (con cierre por arrastre según el design system). Reutiliza `PresenceList` para el
 * contenido, de modo que la información mostrada es idéntica a la pestaña anterior.
 */
const PresenceStack = ({ users, onlineCount, loading, isObserverOffline, timezone }: PresenceStackProps) => {
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
    const listScrollRef = useRef<HTMLDivElement>(null);

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

    // touchmove nativo con passive:false para poder preventDefault (bloquea pull-to-refresh).
    // Solo arrastra si la lista interna está arriba del todo, para no pelear con el scroll.
    useEffect(() => {
        if (!open || !isMobile) return;
        const el = panelRef.current;
        if (!el) return;
        const handler = (e: TouchEvent) => {
            if (swipeStartY.current === null) return;
            const sc = listScrollRef.current;
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

    const handleToggle = () => setOpen(o => !o);

    const visible = users.slice(0, MAX_AVATARS);
    const overflow = users.length - visible.length;

    const triggerLabel = isObserverOffline ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <span className="material-symbols-outlined text-[14px]">cloud_off</span>
            Sin conexión
        </span>
    ) : (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            {onlineCount} en línea
        </span>
    );

    return (
        <div ref={wrapperRef} className="relative inline-block">
            {/* Trigger: contador + stack de avatares */}
            <button
                onClick={handleToggle}
                aria-label="Ver empleados conectados"
                aria-expanded={open}
                tabIndex={0}
                className="inline-flex items-center gap-2 rounded-full pl-2.5 pr-1.5 py-1 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
                {triggerLabel}
                {users.length > 0 && (
                    <span className="flex -space-x-2">
                        {visible.map(u => (
                            <span key={u.user_id} className="relative">
                                <span className="size-7 rounded-full bg-amber-400 text-emerald-950 text-[11px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-[#151e32]">
                                    {initialsOf(u.user_name)}
                                </span>
                                <span className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-white dark:border-[#151e32] ${u.status === 'activo' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            </span>
                        ))}
                        {overflow > 0 && (
                            <span className="size-7 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-200 text-[10px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-[#151e32]">
                                +{overflow}
                            </span>
                        )}
                    </span>
                )}
            </button>

            {/* Detalle — Popover (desktop) */}
            {open && !isMobile && (
                <div
                    role="dialog"
                    aria-label="Empleados conectados"
                    className="absolute right-0 top-full mt-2 z-50 w-[26rem] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#151e32] shadow-xl animate-[fadeIn_0.15s_ease-out]"
                >
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 dark:border-slate-800">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">Empleados conectados</h4>
                        <button
                            onClick={() => setOpen(false)}
                            aria-label="Cerrar"
                            className="size-6 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
                        >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-2">
                        <PresenceList users={users} loading={loading} timezone={timezone} />
                    </div>
                </div>
            )}

            {/* Detalle — Bottom sheet (móvil) */}
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
                            <h4 className="text-base font-bold text-slate-900 dark:text-white">Empleados conectados</h4>
                            {!isObserverOffline && (
                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                                    {onlineCount} en línea
                                </span>
                            )}
                        </div>
                        <div
                            ref={listScrollRef}
                            className="max-h-[70vh] overflow-y-auto custom-scrollbar px-4"
                            style={{ paddingBottom: 'calc(60px + env(safe-area-inset-bottom, 0px) + 1rem)' }}
                        >
                            <PresenceList users={users} loading={loading} timezone={timezone} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PresenceStack;
