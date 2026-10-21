import { useState, useRef, useEffect, useMemo } from 'react';
import { useTables, Table } from '../hooks/useTables';
import { useToast } from '../context/ToastContext';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { usePermissions } from '../hooks/usePermissions';
import { useTablesWriteGate } from '../hooks/useTablesWriteGate';
import TablesReadOnlyBanner from './TablesReadOnlyBanner';
import { usePlanFeatures } from '../hooks/usePlanFeatures';
import { UpgradeProModal } from './modals/UpgradeProModal';

type Variant = 'popover' | 'sheet';

interface TableSelectorControlProps {
    /** Modo actual de la venta */
    mode: 'quick' | 'table';
    /** ID de la mesa activa (si mode === 'table') */
    activeTableId?: string;
    /** Al elegir una mesa del listado */
    onSelectTable: (table: Table) => void;
    /** Al pulsar "Orden Rápida" para alternar */
    onSelectQuickOrder: () => void;
    /** Id de la mesa cuya orden se está cargando (spinner inline en la fila). */
    loadingTableId?: string | null;
    /** popover (desktop) o sheet (móvil) */
    variant?: Variant;
    /** Si es true, fusiona "Orden Rápida" en el botón principal incluso en popover */
    unified?: boolean;
    className?: string;
}

const statusDot = (status: Table['status']) =>
    status === 'available' ? 'bg-emerald-500' : status === 'reserved' ? 'bg-slate-400' : 'bg-rose-500';

const statusLabel = (status: Table['status']) =>
    status === 'available' ? 'Libre' : status === 'reserved' ? 'Reservada' : 'Ocupada';

const statusTextColor = (status: Table['status']) =>
    status === 'available' ? 'text-emerald-600' : status === 'reserved' ? 'text-slate-500' : 'text-rose-600';

/**
 * Control unificado para alternar entre Orden Rápida y Mesas.
 * Renderiza: [Orden Rápida] [Mesa X ▼] [+]
 * El dropdown lista las mesas con su estado (Libre/Ocupada). Si hay más de
 * una sala, muestra chips para filtrar por sala. El botón + crea mesa o sala.
 */
const TableSelectorControl = ({
    mode,
    activeTableId,
    onSelectTable,
    onSelectQuickOrder,
    loadingTableId,
    variant = 'popover',
    unified = false,
    className = '',
}: TableSelectorControlProps) => {
    const { tables, rooms, loading, createTable, createRoom, updateRoom, updateTable, deleteTable } = useTables();
    const { showToast } = useToast();
    const { confirmAction } = useConfirmDialog();
    const { canFinalizeSale } = usePermissions();
    // Orden Rápida (venta directa) no aplica a quien no puede finalizar ventas (ej. mesero).
    const canQuickOrder = canFinalizeSale();
    // Gate de escritura de mesas (modelo Usuario Eje). Solo lectura => se ocultan
    // y bloquean crear/renombrar/eliminar mesas y salas (Req 4.4, 5.4, 16.1).
    const tablesGate = useTablesWriteGate();
    const tablesReadOnly = tablesGate.readOnly;
    const { canUseTables } = usePlanFeatures();
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    const [isOpen, setIsOpen] = useState(false);
    const [roomFilter, setRoomFilter] = useState<string | null>(null);
    const [createMode, setCreateMode] = useState<null | 'room' | 'editRoom' | 'editTable'>(null);
    const [draftName, setDraftName] = useState('');
    const [editingTableId, setEditingTableId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    // Evita que el click en un modal externo (ConfirmDialog) cierre el dropdown.
    const suppressCloseRef = useRef(false);
    // Reserva síncrona del siguiente número de mesa POR SALA para clics en
    // ráfaga: el estado `tables` llega tarde entre taps, así que memorizamos el
    // último número por sala. Cada sala tiene su propia secuencia (MESA 1, 2, …).
    const tablesRef = useRef(tables);
    tablesRef.current = tables;
    const nextNumByRoomRef = useRef<Map<string, number>>(new Map());

    // Swipe-to-dismiss del bottom sheet (móvil) — patrón del DESIGN_SYSTEM.
    const [swipeOffset, setSwipeOffset] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const swipeStartY = useRef<number | null>(null);
    const swipeOffsetRef = useRef(0);
    const isDraggingRef = useRef(false);
    const startedAtTopRef = useRef(false);
    const sheetPanelRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const activeRooms = useMemo(() => rooms.filter(r => r.is_active !== false), [rooms]);
    const hasMultipleRooms = activeRooms.length > 1;

    const activeTable = useMemo(
        () => tables.find(t => t.id === activeTableId) || null,
        [tables, activeTableId]
    );

    // Mesas filtradas por sala (solo si hay más de una sala) y ordenadas numéricamente.
    const visibleTables = useMemo(() => {
        const base = (!hasMultipleRooms || !roomFilter)
            ? tables
            : tables.filter(t => t.room_id === roomFilter);
        return [...base].sort((a, b) => {
            const na = parseInt((a.label.match(/\d+/) || ['0'])[0], 10);
            const nb = parseInt((b.label.match(/\d+/) || ['0'])[0], 10);
            if (na !== nb) return na - nb;
            return a.label.localeCompare(b.label);
        });
    }, [tables, hasMultipleRooms, roomFilter]);

    // Cerrar popover al hacer click fuera (solo variant popover).
    // Ignora el gesto cuando hay un modal externo abierto (ConfirmDialog al
    // eliminar mesa): su click cae fuera del container pero no debe cerrar.
    useEffect(() => {
        if (variant !== 'popover' || !isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (suppressCloseRef.current) return;
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setCreateMode(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [variant, isOpen]);

    // touchmove nativo (passive:false) para arrastrar el sheet hacia abajo y cerrarlo.
    // Solo arrastra si la lista interna está arriba del todo (evita pelear con el scroll).
    useEffect(() => {
        if (variant !== 'sheet' || !isOpen) return;
        const el = sheetPanelRef.current;
        if (!el) return;
        const handler = (e: TouchEvent) => {
            if (swipeStartY.current === null) return;
            const delta = e.touches[0].clientY - swipeStartY.current;
            // Solo arrastrar si el gesto EMPEZÓ con la lista arriba del todo. Así, si el
            // usuario está scrolleando y la lista llega al tope a mitad del gesto, no se
            // convierte en cierre accidental.
            if (delta > 8 && startedAtTopRef.current) {
                e.preventDefault();
                if (!isDraggingRef.current) {
                    isDraggingRef.current = true;
                    setIsDragging(true);
                }
                swipeOffsetRef.current = delta;
                setSwipeOffset(delta);
            }
        };
        el.addEventListener('touchmove', handler, { passive: false });
        return () => el.removeEventListener('touchmove', handler);
    }, [variant, isOpen, createMode]);

    const closePanel = () => {
        setIsOpen(false);
        setCreateMode(null);
        setDraftName('');
        setEditingTableId(null);
        setSwipeOffset(0);
        swipeOffsetRef.current = 0;
        setIsDragging(false);
        isDraggingRef.current = false;
        nextNumByRoomRef.current.clear();
    };

    const handleSelectTable = (table: Table) => {
        onSelectTable(table);
        closePanel();
    };

    const handleSelectQuick = () => {
        onSelectQuickOrder();
        closePanel();
    };

    // "+ Mesa": crea automáticamente la siguiente "MESA N" en mayúsculas. No cierra el dropdown.
    // Numeración INDEPENDIENTE por sala: cada sala arranca desde MESA 1.
    // Soporta clics en ráfaga con reserva síncrona por sala (nextNumByRoomRef).
    const handleAddTable = async () => {
        if (tablesReadOnly || !tablesGate.verifyCanWriteNow()) {
            showToast(tablesGate.readOnlyMessage ?? 'Mesas en solo lectura sin conexión', 'warning');
            return;
        }
        const targetRoom = roomFilter || activeRooms[0]?.id;
        if (!targetRoom) return;
        // Solo consideramos las mesas de la sala destino para calcular el siguiente número.
        const maxInRoom = tablesRef.current
            .filter(t => t.room_id === targetRoom)
            .map(t => parseInt((t.label.match(/\d+/) || ['0'])[0], 10))
            .filter(n => !isNaN(n))
            .reduce((m, n) => Math.max(m, n), 0);
        const reserved = nextNumByRoomRef.current.get(targetRoom) ?? 0;
        const num = Math.max(maxInRoom, reserved) + 1;
        nextNumByRoomRef.current.set(targetRoom, num); // reserva inmediata (antes de cualquier await)
        try {
            await createTable(`MESA ${num}`, targetRoom);
        } catch {
            // El hook ya loguea el error
        }
    };

    const startEditTable = (table: Table) => {
        if (tablesReadOnly) {
            showToast(tablesGate.readOnlyMessage ?? 'Mesas en solo lectura sin conexión', 'warning');
            return;
        }
        setEditingTableId(table.id);
        setDraftName(table.label);
        setCreateMode('editTable');
    };

    const handleDeleteTable = async (table: Table) => {
        if (tablesReadOnly || !tablesGate.verifyCanWriteNow()) {
            showToast(tablesGate.readOnlyMessage ?? 'Mesas en solo lectura sin conexión', 'warning');
            return;
        }
        if (table.status === 'occupied') {
            showToast('No puedes eliminar una mesa ocupada', 'error');
            return;
        }
        // Bloquea el cierre del dropdown mientras el ConfirmDialog está abierto:
        // el modal renderiza en portal, así que su mousedown cae fuera del container.
        suppressCloseRef.current = true;
        try {
            const ok = await confirmAction({
                title: `Eliminar ${table.label}`,
                message: '¿Seguro que deseas eliminar esta mesa? Esta acción no se puede deshacer.',
                confirmText: 'Eliminar',
                variant: 'danger',
            });
            if (!ok) return;
            await deleteTable(table.id);
        } catch {
            showToast('Error al eliminar la mesa', 'error');
        } finally {
            // Liberar en el siguiente tick para que el mousedown residual del
            // click en el modal no dispare el cierre.
            setTimeout(() => { suppressCloseRef.current = false; }, 50);
        }
    };

    const cancelDraft = () => {
        setCreateMode(null);
        setDraftName('');
        setEditingTableId(null);
    };

    // Guarda sala nueva / edición de sala / edición de mesa. No cierra el dropdown.
    const handleSaveDraft = async () => {
        const raw = draftName.trim();
        if (!raw || saving) return;
        if (tablesReadOnly || !tablesGate.verifyCanWriteNow()) {
            showToast(tablesGate.readOnlyMessage ?? 'Mesas en solo lectura sin conexión', 'warning');
            return;
        }
        setSaving(true);
        try {
            if (createMode === 'room') {
                await createRoom(raw);
            } else if (createMode === 'editRoom' && roomFilter) {
                await updateRoom(roomFilter, { name: raw });
            } else if (createMode === 'editTable' && editingTableId) {
                await updateTable(editingTableId, { label: raw.toUpperCase() });
            }
            cancelDraft();
        } catch {
            // El hook ya loguea el error
        } finally {
            setSaving(false);
        }
    };

    const triggerLabel = mode === 'table' && activeTable
        ? activeTable.label.replace(/^T-|^S-/, 'MESA ')
        : ((variant === 'sheet' || unified) ? (canQuickOrder ? 'Orden Rápida' : 'Elegir mesa') : 'Elegir mesa');

    // ─── Contenido del panel (compartido por popover y sheet) ───
    const panelContent = (
        <div className="flex flex-col gap-2">
            {/* Banner de solo lectura: distingue observador offline de eje sin conexión. */}
            {tablesReadOnly && tablesGate.readOnlyMessage && (
                <TablesReadOnlyBanner
                    reason={tablesGate.readOnlyReason}
                    message={tablesGate.readOnlyMessage}
                    compact
                />
            )}
            {/* Opción "Orden Rápida" dentro del panel (en sheet/móvil o cuando está unificado) */}
            {(variant === 'sheet' || unified) && canQuickOrder && createMode === null && (
                <button
                    onClick={handleSelectQuick}
                    className={`w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-left transition-colors ${mode === 'quick' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                    <span className="material-symbols-outlined text-[20px]">bolt</span>
                    <span className="text-sm font-semibold">Orden Rápida</span>
                </button>
            )}

            {/* Chips de sala (solo si hay más de una) */}
            {hasMultipleRooms && createMode === null && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    <button
                        onClick={() => setRoomFilter(null)}
                        className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${roomFilter === null ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                        Todas
                    </button>
                    {activeRooms.map(room => (
                        <button
                            key={room.id}
                            onClick={() => setRoomFilter(room.id)}
                            className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${roomFilter === room.id ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        >
                            {room.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Formulario inline de creación / edición (sala o edición de mesa) */}
            {createMode !== null ? (
                <div className="flex flex-col gap-2 p-1">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                        {createMode === 'room' ? 'Nueva sala' : createMode === 'editRoom' ? 'Editar sala' : 'Editar mesa'}
                    </p>
                    <input
                        autoFocus
                        type="text"
                        value={draftName}
                        onChange={e => setDraftName(createMode === 'editTable' ? e.target.value.toUpperCase() : e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveDraft(); if (e.key === 'Escape') cancelDraft(); }}
                        placeholder={createMode === 'editTable' ? 'Ej: MESA 5' : 'Ej: Terraza'}
                        className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:border-[#102218] focus:ring-2 focus:ring-[#102218]/20"
                    />
                    <div className="flex items-center gap-2">
                        <button
                            onClick={cancelDraft}
                            className="flex-1 h-9 rounded-xl text-[12px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSaveDraft}
                            disabled={!draftName.trim() || saving}
                            className="flex-1 h-9 rounded-xl text-[12px] font-semibold text-white bg-[#102218] hover:bg-[#1a3527] transition-colors disabled:opacity-50"
                        >
                            {saving ? 'Guardando...' : 'Guardar'}
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {/* Listado de mesas */}
                    <div ref={listRef} className="flex flex-col divide-y divide-slate-200 max-h-[calc(100vh-230px)] overflow-y-auto">
                        {loading ? (
                            <div className="py-6 text-center text-sm text-slate-400">Cargando mesas...</div>
                        ) : visibleTables.length === 0 ? (
                            <div className="py-6 text-center text-sm text-slate-400">No hay mesas creadas</div>
                        ) : (
                            visibleTables.map(table => {
                                const isLoading = loadingTableId === table.id;
                                return (
                                <div
                                    key={table.id}
                                    onClick={() => handleSelectTable(table)}
                                    aria-busy={isLoading}
                                    className={`group w-full flex items-center gap-2 px-3 py-3 transition-colors cursor-pointer ${table.id === activeTableId ? 'bg-emerald-50' : 'hover:bg-slate-100'}`}
                                >
                                    <span className="flex items-center gap-2.5 min-w-0 flex-1">
                                        {isLoading ? (
                                            <span className="size-3.5 rounded-full border-[1.5px] border-amber-400 border-t-transparent animate-spin shrink-0" aria-hidden />
                                        ) : (
                                            <span className={`size-2 rounded-full shrink-0 ${statusDot(table.status)}`} />
                                        )}
                                        <span className="text-sm font-semibold text-slate-800 truncate uppercase">
                                            {table.label.replace(/^T-|^S-/, 'MESA ')}
                                        </span>
                                    </span>
                                    <span className={`text-[11px] font-semibold shrink-0 ${statusTextColor(table.status)}`}>
                                        {isLoading ? 'Cargando…' : statusLabel(table.status)}
                                    </span>
                                    {!tablesReadOnly && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); startEditTable(table); }}
                                        className="size-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 shrink-0 transition-colors"
                                        title="Editar nombre"
                                        aria-label={`Editar ${table.label}`}
                                    >
                                        <span className="material-symbols-outlined text-[16px]">edit</span>
                                    </button>
                                    )}
                                    {!tablesReadOnly && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteTable(table); }}
                                        className="size-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0 transition-colors"
                                        title="Eliminar mesa"
                                        aria-label={`Eliminar ${table.label}`}
                                    >
                                        <span className="material-symbols-outlined text-[16px]">delete</span>
                                    </button>
                                    )}
                                </div>
                                );
                            })
                        )}
                    </div>

                    {/* Acciones de creación (ocultas en solo lectura) */}
                    {!tablesReadOnly && (
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                        <button
                            onClick={handleAddTable}
                            disabled={saving}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl text-[12px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined text-[18px]">add</span>
                            Mesa
                        </button>
                        <button
                            onClick={() => { setCreateMode('room'); setDraftName(''); }}
                            className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-xl text-[12px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                        >
                            <span className="material-symbols-outlined text-[18px]">add</span>
                            Sala
                        </button>
                    </div>
                    )}
                </>
            )}
        </div>
    );

    return (
        <div ref={containerRef} className={`relative flex items-center gap-1.5 ${className}`}>
            {/* Desktop (popover): dos pills lado a lado (si no es unified). Móvil (sheet) o unified: un solo trigger. */}
            {variant === 'popover' && !unified && canQuickOrder && (
                <button
                    onClick={handleSelectQuick}
                    className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide transition-colors ${mode === 'quick' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                >
                    Orden Rápida
                </button>
            )}

            {/* Botón/Trigger Mesas */}
            <button
                onClick={() => {
                    if (!canUseTables) {
                        setShowUpgradeModal(true);
                        return;
                    }
                    setIsOpen(v => !v);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide transition-colors ${mode === 'table' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
                <span className="material-symbols-outlined text-[15px]">{mode === 'table' ? 'table_restaurant' : ((variant === 'sheet' || unified) && canQuickOrder ? 'bolt' : 'table_restaurant')}</span>
                <span className={`truncate text-center ${(variant === 'sheet' || unified) ? 'w-[88px]' : 'max-w-[90px]'}`}>{triggerLabel}</span>
                {!canUseTables ? (
                    <span className="px-1.5 py-0.2 text-[8px] font-black bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 rounded border border-amber-300/60">
                        PRO
                    </span>
                ) : (
                    <span className={`material-symbols-outlined text-[16px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
                )}
            </button>

            {/* ── Popover (desktop) ── */}
            {variant === 'popover' && isOpen && (
                <div className="absolute top-full right-0 mt-2 w-72 bg-slate-50 rounded-2xl border border-slate-200 p-3 z-[90] animate-[fadeIn_0.12s_ease-out]">
                    {panelContent}
                </div>
            )}

            {/* ── Bottom sheet (móvil) ── */}
            {variant === 'sheet' && isOpen && (
                <div className="fixed inset-0 z-[90] flex items-end justify-center" onClick={closePanel}>
                    <div
                        className="absolute inset-0 bg-black/40"
                        style={{ opacity: Math.max(0, 1 - swipeOffset / 400) }}
                    />
                    <div
                        ref={sheetPanelRef}
                        className={`relative bg-white w-full rounded-t-2xl p-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] ${!isDragging ? 'transition-transform duration-200 ease-out' : ''} ${swipeOffset === 0 && !isDragging ? 'animate-[slideInUp_0.22s_cubic-bezier(0.32,0.72,0,1)]' : ''}`}
                        style={{ transform: `translateY(${swipeOffset}px)`, touchAction: 'pan-y' }}
                        onClick={e => e.stopPropagation()}
                        onTouchStart={e => {
                            swipeStartY.current = e.touches[0].clientY;
                            const list = listRef.current;
                            startedAtTopRef.current = !list || list.scrollTop <= 0;
                        }}
                        onTouchEnd={() => {
                            swipeStartY.current = null;
                            if (isDraggingRef.current) {
                                isDraggingRef.current = false;
                                setIsDragging(false);
                                if (swipeOffsetRef.current > 80) {
                                    closePanel();
                                } else {
                                    swipeOffsetRef.current = 0;
                                    setSwipeOffset(0);
                                }
                            }
                        }}
                    >
                        <div className="flex justify-center pb-3">
                            <span className="w-10 h-1 rounded-full bg-slate-200" />
                        </div>
                        {panelContent}
                    </div>
                </div>
            )}

            <UpgradeProModal
                isOpen={showUpgradeModal}
                onClose={() => setShowUpgradeModal(false)}
                featureName="Mapa de Salones y Mesas"
                featureDescription="Controla pedidos por mesa en tiempo real, divide cuentas por persona y envía comandas directas a cocina o barra."
                onUpgrade={() => {
                    setShowUpgradeModal(false);
                    window.location.hash = '#subscription';
                }}
            />
        </div>
    );
};

export default TableSelectorControl;
