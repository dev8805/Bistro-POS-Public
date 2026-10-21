import React from 'react';
import { AuditEvent } from '../../lib/activityMockData';
import { formatDateTimeInTz, formatTimeInTz, isSameDayInTz } from '../../lib/timezone';
import { CATEGORY_LABELS, CATEGORY_ICONS, SEVERITY_BADGE, SEVERITY_DOT, SEVERITY_LABELS } from './labels';

interface EventRowProps {
    event: AuditEvent;
    timezone: string;
    /** Si se omite, la fila NO es interactiva (no abre el detalle). */
    onClick?: () => void;
}

const EventRow = ({ event, timezone, onClick }: EventRowProps) => {
    const clickable = !!onClick;
    // "Cuenta eliminada" solo si había un actor (con nombre) cuya cuenta se borró.
    // Si no hay actor ni nombre, es una acción del sistema/server (no un borrado).
    const isDeletedAccount = event.user_id === null && !!event.user_name;
    const isArchivedAccount = event.metadata?.actor_status === 'archived';

    const now = new Date();
    const created = new Date(event.created_at);
    const when = isSameDayInTz(created, now, timezone)
        ? formatTimeInTz(event.created_at, timezone)
        : formatDateTimeInTz(event.created_at, timezone);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!onClick) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
        }
    };

    const inner = (
        <>
            {/* Icono de categoría */}
            <div className="size-9 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                <span className="material-symbols-outlined text-[18px]">{CATEGORY_ICONS[event.category]}</span>
            </div>

            {/* Contenido */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug break-words">
                        {event.description}
                    </p>
                    <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${SEVERITY_BADGE[event.severity]}`}>
                        {SEVERITY_LABELS[event.severity]}
                    </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                        <span className={`size-1.5 rounded-full ${SEVERITY_DOT[event.severity]}`} />
                        {CATEGORY_LABELS[event.category]}
                    </span>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span className="font-medium text-slate-600 dark:text-slate-300 truncate max-w-[160px]">
                        {event.user_name || 'Sistema'}
                    </span>
                    {isDeletedAccount && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                            Cuenta eliminada
                        </span>
                    )}
                    {isArchivedAccount && (
                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                            Cuenta archivada
                        </span>
                    )}
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span className="whitespace-nowrap">{when}</span>
                </div>
            </div>

            {/* Flecha: siempre ocupa el mismo espacio para que los badges de
                severidad queden alineados en la misma columna; visible solo si
                la fila es interactiva. */}
            <span
                className={`material-symbols-outlined text-[18px] shrink-0 self-center ${clickable ? 'text-slate-300 dark:text-slate-600' : 'invisible'}`}
                aria-hidden="true"
            >
                chevron_right
            </span>
        </>
    );

    if (!clickable) {
        return (
            <div className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#151e32] flex items-start gap-3 cursor-default">
                {inner}
            </div>
        );
    }

    return (
        <button
            onClick={onClick}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            aria-label={`Ver detalle: ${event.description}`}
            className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#151e32] hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm transition-all flex items-start gap-3"
        >
            {inner}
        </button>
    );
};

export default EventRow;
