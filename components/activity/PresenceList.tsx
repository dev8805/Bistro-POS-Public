import React from 'react';
import { PresenceEntry } from '../../hooks/useEmployeePresence';
import { PresenceStatus } from '../../lib/activityMockData';
import { formatTimeInTz } from '../../lib/timezone';
import { getDeviceTypeIcon } from '../../lib/deviceInfo';
import OfflineCausesBadge from './OfflineCausesBadge';
import InactiveCausesInfo from './InactiveCausesInfo';

interface PresenceListProps {
    users: PresenceEntry[];
    loading: boolean;
    timezone: string;
}

const STATUS_META: Record<PresenceStatus, { label: string; dot: string; text: string }> = {
    activo: { label: 'Activo', dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
    inactivo: { label: 'Inactivo', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
    desconectado: { label: 'Desconectado', dot: 'bg-slate-400', text: 'text-slate-500 dark:text-slate-400' },
};

const initialsOf = (name: string): string =>
    name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

const timeSince = (iso: string | null): string => {
    if (!iso) return '—';
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (mins < 1) return 'recién';
    if (mins < 60) return `hace ${mins} min`;
    const hrs = Math.floor(mins / 60);
    return `hace ${hrs} h`;
};

const PresenceList = ({ users, loading, timezone }: PresenceListProps) => {
    if (loading) {
        return (
            <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-[72px] rounded-xl skeleton-shimmer" style={{ animationDelay: `${i * 60}ms` }} />
                ))}
            </div>
        );
    }

    if (users.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-56 text-center">
                <span className="material-symbols-outlined text-5xl text-slate-300 mb-2">group_off</span>
                <p className="text-sm font-medium text-slate-500">Sin empleados conectados</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {users.map(u => {
                const meta = STATUS_META[u.status];
                const deviceLabel = u.device_label || 'Dispositivo desconocido';
                const deviceIcon = u.device_type ? getDeviceTypeIcon(u.device_type) : 'help';
                const isDisconnected = u.status === 'desconectado';
                const isOfflineButSignedIn = u.is_signed_in && !u.is_in_presence;

                return (
                    <div
                        key={u.user_id}
                        className={`p-3 rounded-xl border bg-white dark:bg-[#151e32] flex items-center gap-3 ${
                            isDisconnected
                                ? 'border-slate-200 dark:border-slate-700/40 opacity-60'
                                : 'border-slate-200 dark:border-slate-700/60'
                        }`}
                    >
                        {/* Avatar con punto de estado */}
                        <div className="relative shrink-0">
                            <div className="size-10 rounded-full bg-amber-400 text-emerald-950 font-bold text-sm flex items-center justify-center">
                                {initialsOf(u.user_name)}
                            </div>
                            <span className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-white dark:border-[#151e32] ${meta.dot}`} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{u.user_name}</h3>
                            <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{u.user_role}</span>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                                {!isDisconnected && (
                                    <span
                                        className="inline-flex items-center gap-1 min-w-0"
                                        title={deviceLabel}
                                    >
                                        <span className="material-symbols-outlined text-[13px] shrink-0">{deviceIcon}</span>
                                        <span className="font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap truncate">
                                            {deviceLabel}
                                        </span>
                                    </span>
                                )}
                                {isOfflineButSignedIn && <OfflineCausesBadge />}
                                {u.cash_shift_id && !isDisconnected && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                        <span className="material-symbols-outlined text-[12px]">point_of_sale</span>
                                        Caja abierta
                                    </span>
                                )}
                                {isDisconnected && (
                                    <span className="italic">Sesión cerrada</span>
                                )}
                            </div>
                        </div>

                        {/* Estado + tiempo */}
                        <div className="text-right shrink-0">
                            <div className="flex items-center justify-end gap-1">
                                <p className={`text-xs font-bold ${meta.text}`}>{meta.label}</p>
                                {u.status === 'inactivo' && <InactiveCausesInfo />}
                            </div>
                            {!isDisconnected && u.login_at && (
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">desde {formatTimeInTz(u.login_at, timezone)}</p>
                            )}
                            {!isDisconnected && (
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                    {u.status === 'activo' ? 'activo ahora' : `actividad ${timeSince(u.last_activity_at)}`}
                                </p>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default PresenceList;
