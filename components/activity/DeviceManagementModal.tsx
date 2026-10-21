import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useDeviceAliases } from '../../hooks/useDeviceAliases';
import { BusinessDevice } from '../../lib/deviceAliasStore';
import { getDeviceTypeIcon, getDeviceTypeLabel } from '../../lib/deviceInfo';
import { formatDateTimeInTz } from '../../lib/timezone';

interface DeviceManagementModalProps {
    isOpen: boolean;
    timezone: string;
    onClose: () => void;
}

const timeSince = (iso: string): string => {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (mins < 1) return 'recién';
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs} h`;
    const days = Math.floor(hrs / 24);
    return `hace ${days} d`;
};

interface DeviceRowProps {
    device: BusinessDevice;
    timezone: string;
    onSave: (alias: string | null) => void;
}

const DeviceRow = ({ device, timezone, onSave }: DeviceRowProps) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(device.alias || '');

    const handleSave = () => {
        const trimmed = draft.trim();
        onSave(trimmed || null);
        setEditing(false);
    };

    const handleCancel = () => {
        setDraft(device.alias || '');
        setEditing(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') handleCancel();
    };

    return (
        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#0B1120] flex items-start gap-3">
            <div className="size-9 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                <span className="material-symbols-outlined text-[18px]">{getDeviceTypeIcon(device.device_type)}</span>
            </div>

            <div className="flex-1 min-w-0">
                {/* Alias / nombre visible */}
                {editing ? (
                    <div className="flex items-center gap-1.5">
                        <input
                            type="text"
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ej: PC Mostrador"
                            autoFocus
                            maxLength={40}
                            aria-label="Alias del dispositivo"
                            className="flex-1 h-8 px-2 rounded-md border border-amber-400 bg-white dark:bg-[#151e32] text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-400/30"
                        />
                        <button
                            onClick={handleSave}
                            aria-label="Guardar alias"
                            className="size-8 rounded-md bg-amber-400 hover:bg-amber-500 text-emerald-950 flex items-center justify-center transition-colors"
                        >
                            <span className="material-symbols-outlined text-[18px]">check</span>
                        </button>
                        <button
                            onClick={handleCancel}
                            aria-label="Cancelar"
                            className="size-8 rounded-md hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 flex items-center justify-center"
                        >
                            <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <span className={device.alias ? 'text-sm font-semibold text-slate-900 dark:text-white' : 'text-sm font-medium italic text-slate-500'}>
                            {device.alias || device.default_label}
                        </span>
                        <button
                            onClick={() => setEditing(true)}
                            aria-label={device.alias ? 'Renombrar dispositivo' : 'Asignar alias'}
                            className="text-slate-400 hover:text-amber-500 transition-colors"
                        >
                            <span className="material-symbols-outlined text-[16px]">edit</span>
                        </button>
                        {!device.alias && (
                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 dark:bg-slate-700/50">
                                Sin alias
                            </span>
                        )}
                    </div>
                )}

                {/* Detalle técnico */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    {device.alias && (
                        <>
                            <span>Sistema: <span className="font-medium text-slate-600 dark:text-slate-300">{device.default_label}</span></span>
                            <span className="text-slate-300 dark:text-slate-600">·</span>
                        </>
                    )}
                    <span>{getDeviceTypeLabel(device.device_type)}</span>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span title={formatDateTimeInTz(device.last_seen_at, timezone)}>
                        Última actividad: {timeSince(device.last_seen_at)}
                    </span>
                </div>
            </div>
        </div>
    );
};

export const DeviceManagementModal = ({ isOpen, timezone, onClose }: DeviceManagementModalProps) => {
    const { devices, setAlias } = useDeviceAliases();

    const sorted = useMemo(
        () => [...devices].sort((a, b) =>
            new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime()
        ),
        [devices]
    );

    if (!isOpen) return null;
    if (typeof document === 'undefined') return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Dispositivos del negocio"
        >
            <div
                className="w-full max-w-lg bg-white dark:bg-[#151e32] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-[scaleIn_0.2s_ease-out] max-h-[85vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="min-w-0">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">Dispositivos del negocio</h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Asigna nombres reconocibles a los dispositivos que se conectan al POS
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Cerrar"
                        className="size-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 shrink-0"
                    >
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>

                <div className="px-5 py-4 overflow-y-auto custom-scrollbar bg-slate-50/50 dark:bg-transparent space-y-2">
                    {sorted.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <span className="material-symbols-outlined text-5xl text-slate-300 mb-2">devices</span>
                            <p className="text-sm font-medium text-slate-500">Aún no se han conectado dispositivos</p>
                        </div>
                    ) : (
                        sorted.map(d => (
                            <DeviceRow
                                key={d.device_id}
                                device={d}
                                timezone={timezone}
                                onSave={(alias) => setAlias(d.device_id, alias)}
                            />
                        ))
                    )}
                </div>

                <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-transparent">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        <span className="material-symbols-outlined text-[13px] align-text-bottom mr-1">info</span>
                        El sistema detecta cada dispositivo por su navegador (ej. <span className="font-medium">Chrome en Windows</span>).
                        Asígnale un alias para reconocerlo más fácil en presencia y eventos.
                    </p>
                </div>
            </div>
        </div>,
        document.body
    );
};
