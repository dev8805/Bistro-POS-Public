import React, { useState } from 'react';
import { AuditFilters, DatePreset } from '../../hooks/useAuditEvents';
import { CATEGORY_FILTER_OPTIONS, SEVERITY_FILTER_OPTIONS } from './labels';
import { CustomDateRangePicker } from '../dashboard/CustomDateRangePicker';

interface EventFiltersProps {
    filters: AuditFilters;
    setFilters: (patch: Partial<AuditFilters>) => void;
    employees: Array<{ id: string; name: string }>;
    isLongRange: boolean;
    totalCount: number;
}

const PRESET_LABELS: Record<DatePreset, string> = {
    today: 'Hoy',
    yesterday: 'Ayer',
    '7days': 'Últimos 7 días',
    '30days': 'Últimos 30 días',
    custom: 'Personalizado',
};

const SIMPLE_PRESETS: DatePreset[] = ['today', 'yesterday', '7days', '30days'];

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const toInputDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const formatDateRange = (startStr: string, endStr: string): string => {
    const [sy, sm, sd] = startStr.split('-');
    const [ey, em, ed] = endStr.split('-');
    const sMonth = MONTHS_SHORT[parseInt(sm) - 1];
    const eMonth = MONTHS_SHORT[parseInt(em) - 1];
    if (sy === ey && sm === em) return `${parseInt(sd)} – ${parseInt(ed)} ${eMonth} ${ey}`;
    if (sy === ey) return `${parseInt(sd)} ${sMonth} – ${parseInt(ed)} ${eMonth} ${ey}`;
    return `${parseInt(sd)} ${sMonth} ${sy} – ${parseInt(ed)} ${eMonth} ${ey}`;
};

const selectClass =
    'h-9 pl-2.5 pr-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1120] text-xs font-medium text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500 transition-colors appearance-none cursor-pointer bg-none';

/** Wrapper que añade un chevron a la derecha sin tapar el texto del select. */
const SelectField = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div className={`relative inline-block ${className}`}>
        {children}
        <span
            aria-hidden="true"
            className="material-symbols-outlined text-[16px] text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none"
        >
            expand_more
        </span>
    </div>
);

const EventFilters = ({ filters, setFilters, employees, isLongRange, totalCount }: EventFiltersProps) => {
    const [isPresetOpen, setIsPresetOpen] = useState(false);
    const [isCustomOpen, setIsCustomOpen] = useState(false);

    const today = toInputDate(new Date());
    const dateBtnLabel =
        filters.preset === 'custom' && filters.customStart && filters.customEnd
            ? formatDateRange(filters.customStart, filters.customEnd)
            : PRESET_LABELS[filters.preset];

    const handlePresetClick = (preset: DatePreset) => {
        setIsPresetOpen(false);
        if (preset === 'custom') {
            setIsCustomOpen(true);
        } else {
            setFilters({ preset, customStart: null, customEnd: null });
        }
    };

    const handleCustomApply = (start: string, end: string) => {
        setFilters({ preset: 'custom', customStart: start, customEnd: end });
        setIsCustomOpen(false);
    };

    return (
        <div className="space-y-2.5">
            {/* Búsqueda */}
            <div className="relative">
                <input
                    type="text"
                    value={filters.search}
                    onChange={(e) => setFilters({ search: e.target.value })}
                    placeholder="Buscar por descripción, acción o empleado..."
                    aria-label="Buscar eventos"
                    className="w-full pl-9 pr-3 h-10 rounded-xl bg-white dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 focus:border-indigo-500 text-sm outline-none transition-colors placeholder:text-slate-400"
                />
                <span className="material-symbols-outlined text-[18px] text-slate-400 absolute left-3 top-1/2 -translate-y-1/2">search</span>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2">
                {/* Filtro de fecha — botón dropdown custom (muestra rango cuando es 'custom') */}
                <div className="relative">
                    <button
                        onClick={() => { setIsPresetOpen(o => !o); setIsCustomOpen(false); }}
                        aria-label="Rango de fecha"
                        aria-expanded={isPresetOpen}
                        tabIndex={0}
                        className={`inline-flex items-center px-2.5 py-1.5 h-9 border shadow-sm text-xs font-medium rounded-lg transition-colors ${
                            filters.preset === 'custom'
                                ? 'border-indigo-300 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/20'
                                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-[#0B1120] hover:bg-slate-50 dark:hover:bg-white/5'
                        }`}
                    >
                        <span className="material-symbols-outlined text-[16px] mr-1.5 text-slate-400">calendar_month</span>
                        {dateBtnLabel}
                        <span className="material-symbols-outlined text-[14px] ml-1.5 text-slate-400">expand_more</span>
                    </button>
                    {isPresetOpen && (
                        <>
                            <div className="fixed inset-0 z-30" onClick={() => setIsPresetOpen(false)} />
                            <div className="absolute left-0 mt-2 w-48 bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-40 py-1 animate-[fadeIn_0.1s_ease-out]">
                                {SIMPLE_PRESETS.map(key => (
                                    <button
                                        key={key}
                                        onClick={() => handlePresetClick(key)}
                                        className={`w-full text-left px-4 py-2 text-xs transition-colors ${
                                            filters.preset === key
                                                ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold'
                                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 font-medium'
                                        }`}
                                    >
                                        {PRESET_LABELS[key]}
                                    </button>
                                ))}
                                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                                <button
                                    onClick={() => handlePresetClick('custom')}
                                    className={`w-full text-left px-4 py-2 text-xs transition-colors ${
                                        filters.preset === 'custom'
                                            ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold'
                                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 font-medium'
                                    }`}
                                >
                                    {PRESET_LABELS.custom}
                                </button>
                            </div>
                        </>
                    )}
                    {isCustomOpen && (
                        <>
                            <div className="fixed inset-0 z-30" onClick={() => setIsCustomOpen(false)} />
                            <div className="absolute left-0 mt-2 z-40 transform origin-top-left">
                                <CustomDateRangePicker
                                    initialStart={filters.customStart || today}
                                    initialEnd={filters.customEnd || today}
                                    onApply={handleCustomApply}
                                    onCancel={() => setIsCustomOpen(false)}
                                />
                            </div>
                        </>
                    )}
                </div>

                <SelectField>
                    <select
                        value={filters.userId || ''}
                        onChange={(e) => setFilters({ userId: e.target.value || null })}
                        aria-label="Filtrar por empleado"
                        className={selectClass}
                    >
                        <option value="">Todos los empleados</option>
                        {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                    </select>
                </SelectField>

                <SelectField>
                    <select
                        value={filters.category}
                        onChange={(e) => setFilters({ category: e.target.value as AuditFilters['category'] })}
                        aria-label="Filtrar por categoría"
                        className={selectClass}
                    >
                        {CATEGORY_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </SelectField>

                <SelectField>
                    <select
                        value={filters.severity}
                        onChange={(e) => setFilters({ severity: e.target.value as AuditFilters['severity'] })}
                        aria-label="Filtrar por severidad"
                        className={selectClass}
                    >
                        {SEVERITY_FILTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </SelectField>

                <span className="text-[11px] text-slate-400 ml-auto whitespace-nowrap">
                    {totalCount} evento{totalCount !== 1 ? 's' : ''}
                </span>
            </div>

            {isLongRange && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px]">info</span>
                    Rango mayor a 90 días: la consulta puede tardar más.
                </p>
            )}
        </div>
    );
};

export default EventFilters;
