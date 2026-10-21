import { useState, useRef, useEffect, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Table, Room, useTables } from '../hooks/useTables';
import { useToast } from '../context/ToastContext';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { usePermissions } from '../hooks/usePermissions';

interface OpenTicketsBarProps {
    /** Modo actual de la venta */
    isQuickOrder: boolean;
    /** ID de la mesa activa (si !isQuickOrder) */
    activeTableId?: string;
    /** Al elegir una mesa del listado */
    onSelectTable: (table: Table) => void;
    /** Al pulsar "Orden Rápida" para alternar */
    onSelectQuickOrder: () => void;
    /** Id de la mesa cuya orden se está cargando (spinner inline en chip/dropdown). */
    loadingTableId?: string | null;
    /** Clases adicionales para visibilidad/posicionamiento (ej. hidden md:flex lg:hidden) */
    className?: string;
}

/**
 * Barra persistente de tickets abiertos (Open Tickets) para tablet.
 *
 * Patrón estilo Square/Toast: muestra como pestañas la "Orden Rápida" y las
 * mesas con items (o la activa si está vacía). Mesas vacías no activas se
 * acceden desde el botón "Ver todas ▼". Botón [+] crea la siguiente mesa.
 *
 * Solo se muestra si hay mesas configuradas o se pueden crear; gateado desde
 * el padre con `className` para que no aparezca cuando `is_tables_enabled = false`.
 */
const OpenTicketsBar = ({
    isQuickOrder,
    activeTableId,
    onSelectTable,
    onSelectQuickOrder,
    loadingTableId,
    className = '',
}: OpenTicketsBarProps) => {
    const { tables, rooms, createTable, updateTable, deleteTable, createRoom, deleteRoom, loading } = useTables();
    const { showToast } = useToast();
    const { confirmAction } = useConfirmDialog();
    const { canFinalizeSale } = usePermissions();
    // Orden Rápida (venta directa) no aplica a quien no puede finalizar ventas (ej. mesero).
    const canQuickOrder = canFinalizeSale();

    const [showAllOpen, setShowAllOpen] = useState(false);
    const allMenuRef = useRef<HTMLDivElement>(null);
    const allMenuPopRef = useRef<HTMLDivElement>(null);
    const [allMenuRect, setAllMenuRect] = useState<DOMRect | null>(null);

    // Overflow responsivo: medimos el contenedor y recortamos chips que no caben.
    const barRef = useRef<HTMLDivElement>(null);
    const chipRowRef = useRef<HTMLDivElement>(null);
    const [visibleCount, setVisibleCount] = useState(99);
    // Evita que el click en el ConfirmDialog (modal externo) cierre el dropdown.
    const suppressCloseRef = useRef(false);
    // Crear mesas en ráfaga sin duplicar número: reservamos el siguiente número
    // POR SALA de forma síncrona (el estado `tables` llega tarde en taps).
    // Cada sala mantiene su propia secuencia (MESA 1, 2, 3…).
    const tablesRef = useRef(tables);
    tablesRef.current = tables;
    const nextNumByRoomRef = useRef<Map<string, number>>(new Map());

    // Estado de edición/creación dentro del dropdown
    const [roomFilter, setRoomFilter] = useState<string | null>(null);
    const [editingTableId, setEditingTableId] = useState<string | null>(null);
    const [draftName, setDraftName] = useState('');
    const [creatingRoom, setCreatingRoom] = useState(false);
    const [savingDraft, setSavingDraft] = useState(false);
    const activeRooms = useMemo(() => rooms.filter(r => r.is_active !== false), [rooms]);
    const hasMultipleRooms = activeRooms.length > 1;

    // Chips prioritarios: mesas ocupadas (con orden activa) + la mesa activa, en orden numérico estable.
    const chipsTables = useMemo(() => {
        const chips = tables.filter(t => {
            const hasOrder = t.status === 'occupied' || !!t.current_order_id;
            const isActive = activeTableId === t.id && !isQuickOrder;
            return hasOrder || isActive;
        });
        chips.sort((a, b) => {
            const numA = parseInt(a.label.replace(/\D/g, ''), 10) || 0;
            const numB = parseInt(b.label.replace(/\D/g, ''), 10) || 0;
            return numA - numB;
        });
        return chips;
    }, [tables, activeTableId, isQuickOrder]);

    const chipsKey = chipsTables.map(t => t.id).join(',');

    // Cuántos chips caben en el ancho; el resto pasa al dropdown "Ver todas".
    const visibleChips = chipsTables.slice(0, visibleCount);
    const visibleChipIds = new Set(visibleChips.map(t => t.id));

    // Mesas que NO son chip visible (overflow + sin items), SIN filtro de sala.
    // Define si "Ver todas" debe mostrarse (independiente de la sala elegida).
    const nonChipTables = tables.filter(t => !visibleChipIds.has(t.id));

    // Si la mesa activa NO está visible como chip pero existe en tables, está
    // "rescatada" dentro del dropdown. Sirve para resaltar "Ver todas" y la fila.
    const activeTableObj = !isQuickOrder && activeTableId
        ? tables.find(t => t.id === activeTableId)
        : undefined;
    const activeInDropdown = !!activeTableObj && !visibleChipIds.has(activeTableObj.id);
    const activeChipLabel = activeTableObj
        ? activeTableObj.label.replace(/^T-|^S-/, 'MESA ').replace(/^MESA MESA /, 'MESA ')
        : '';

    // Lista que se muestra dentro del dropdown: nonChipTables filtradas por sala.
    const effectiveRoomFilter = hasMultipleRooms ? roomFilter : null;
    const principalRoomId = activeRooms[0]?.id;
    const dropdownTables = nonChipTables
        .filter(t => {
            if (!effectiveRoomFilter) return true;
            // La sala principal también agrupa las mesas sin sala asignada (room_id null).
            if (effectiveRoomFilter === principalRoomId) return t.room_id === principalRoomId || !t.room_id;
            return t.room_id === effectiveRoomFilter;
        })
        .sort((a, b) => (parseInt(a.label.replace(/\D/g, ''), 10) || 0) - (parseInt(b.label.replace(/\D/g, ''), 10) || 0));

    // Recalcular cuántos chips caben:
    // 1) Al cambiar el conjunto de chips → mostrar todos y dejar que el efecto recorte.
    useLayoutEffect(() => {
        setVisibleCount(chipsTables.length);
    }, [chipsKey]);

    // 2) Si la fila de chips desborda, quitar uno (se va al dropdown). Itera por
    //    renders hasta que quepa.
    useLayoutEffect(() => {
        const row = chipRowRef.current;
        if (!row) return;
        if (row.scrollWidth > row.clientWidth + 1 && visibleCount > 0) {
            setVisibleCount(c => Math.max(0, c - 1));
        }
    });

    // 3) Al cambiar el ancho del contenedor → reset a todos y recortar de nuevo.
    useEffect(() => {
        const bar = barRef.current;
        if (!bar) return;
        const ro = new ResizeObserver(() => setVisibleCount(chipsTables.length));
        ro.observe(bar);
        return () => ro.disconnect();
    }, [chipsKey]);

    // Medir la posición del trigger "Ver todas" para anclar el dropdown via portal.
    // Re-mide en scroll/resize mientras está abierto.
    useLayoutEffect(() => {
        if (!showAllOpen) {
            setAllMenuRect(null);
            return;
        }
        const measure = () => {
            if (allMenuRef.current) setAllMenuRect(allMenuRef.current.getBoundingClientRect());
        };
        measure();
        window.addEventListener('scroll', measure, true);
        window.addEventListener('resize', measure);
        return () => {
            window.removeEventListener('scroll', measure, true);
            window.removeEventListener('resize', measure);
        };
    }, [showAllOpen]);

    // Cerrar el menú "Ver todas" al hacer click fuera.
    useEffect(() => {
        if (!showAllOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (suppressCloseRef.current) return;
            const t = e.target as Node;
            if (allMenuRef.current?.contains(t) || allMenuPopRef.current?.contains(t)) return;
            setShowAllOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showAllOpen]);

    // Al abrir con varias salas y sin sala elegida, seleccionar la primera por
    // defecto (ya no existe el pill "Todas").
    useEffect(() => {
        if (showAllOpen && hasMultipleRooms && roomFilter === null) {
            setRoomFilter(activeRooms[0]?.id ?? null);
        }
    }, [showAllOpen, hasMultipleRooms, roomFilter, activeRooms]);

    // Al cerrar el dropdown, resetear cualquier edición pendiente para no
    // arrastrar estado a la próxima apertura.
    useEffect(() => {
        if (!showAllOpen) {
            setEditingTableId(null);
            setCreatingRoom(false);
            setDraftName('');
            nextNumByRoomRef.current.clear();
        }
    }, [showAllOpen]);

    // Crear mesa desde el dropdown "Ver todas" sin cerrarlo ni seleccionarla.
    // Numeración INDEPENDIENTE por sala (cada una arranca desde MESA 1).
    // La reserva es síncrona por sala para soportar clics en ráfaga.
    const handleCreateInList = async () => {
        const targetRoom = roomFilter || principalRoomId;
        if (!targetRoom) return;
        // La sala principal agrupa mesas sin room_id (misma política que el listado).
        const isPrincipal = targetRoom === principalRoomId;
        const maxInRoom = tablesRef.current
            .filter(t => isPrincipal ? (t.room_id === targetRoom || !t.room_id) : t.room_id === targetRoom)
            .map(t => parseInt(t.label.replace(/\D/g, ''), 10))
            .filter(n => !isNaN(n))
            .reduce((m, n) => Math.max(m, n), 0);
        const reserved = nextNumByRoomRef.current.get(targetRoom) ?? 0;
        const num = Math.max(maxInRoom, reserved) + 1;
        nextNumByRoomRef.current.set(targetRoom, num); // reserva inmediata (antes de cualquier await)
        try {
            await createTable(`MESA ${num}`, targetRoom);
        } catch {
            showToast('No se pudo crear la mesa', 'error');
        }
    };

    const handleStartEditTable = (t: Table) => {
        setEditingTableId(t.id);
        setDraftName(t.label);
        setCreatingRoom(false);
    };

    const handleSaveEditTable = async () => {
        const newLabel = draftName.trim().toUpperCase();
        if (!newLabel || !editingTableId || savingDraft) return;
        setSavingDraft(true);
        try {
            await updateTable(editingTableId, { label: newLabel });
            setEditingTableId(null);
            setDraftName('');
        } catch {
            showToast('No se pudo renombrar la mesa', 'error');
        } finally {
            setSavingDraft(false);
        }
    };

    const handleDeleteTable = async (t: Table) => {
        if (t.status === 'occupied') {
            showToast('No puedes eliminar una mesa ocupada', 'error');
            return;
        }
        suppressCloseRef.current = true;
        try {
            const ok = await confirmAction({
                title: `Eliminar ${t.label}`,
                message: '¿Seguro que deseas eliminar esta mesa? Esta acción no se puede deshacer.',
                confirmText: 'Eliminar',
                variant: 'danger',
            });
            if (!ok) return;
            await deleteTable(t.id);
        } catch {
            showToast('No se pudo eliminar la mesa', 'error');
        } finally {
            setTimeout(() => { suppressCloseRef.current = false; }, 50);
        }
    };

    const handleStartCreateRoom = () => {
        setCreatingRoom(true);
        setEditingTableId(null);
        setDraftName('');
    };

    const handleSaveCreateRoom = async () => {
        const name = draftName.trim();
        if (!name || savingDraft) return;
        setSavingDraft(true);
        try {
            await createRoom(name);
            setCreatingRoom(false);
            setDraftName('');
        } catch {
            showToast('No se pudo crear la sala', 'error');
        } finally {
            setSavingDraft(false);
        }
    };

    // Eliminar una sala (excepto la principal). Sus mesas se reasignan a la
    // principal para no perderlas.
    const handleDeleteRoom = async (room: Room) => {
        const principal = activeRooms[0];
        if (!principal || room.id === principal.id) return;
        const roomTables = tables.filter(t => t.room_id === room.id);
        suppressCloseRef.current = true;
        try {
            const ok = await confirmAction({
                title: `Eliminar ${room.name}`,
                message: roomTables.length > 0
                    ? `Esta sala tiene ${roomTables.length} mesa(s). Se moverán a "${principal.name}" y luego se eliminará la sala.`
                    : '¿Seguro que deseas eliminar esta sala?',
                confirmText: 'Eliminar',
                variant: 'danger',
            });
            if (!ok) return;
            for (const t of roomTables) {
                await updateTable(t.id, { room_id: principal.id });
            }
            await deleteRoom(room.id);
            if (roomFilter === room.id) setRoomFilter(principal.id);
        } catch {
            showToast('No se pudo eliminar la sala', 'error');
        } finally {
            setTimeout(() => { suppressCloseRef.current = false; }, 50);
        }
    };

    const cancelDraft = () => {
        setEditingTableId(null);
        setCreatingRoom(false);
        setDraftName('');
    };

    // Color del indicador de estado, derivado solo de `status` (sin montos).
    const statusColor = (t: Table) => {
        if (t.status === 'occupied') return 'bg-amber-500';
        if (t.status === 'reserved') return 'bg-slate-400';
        if (t.status === 'available') return 'bg-emerald-500';
        return 'bg-slate-300'; // estado nulo/desconocido → indicador indeterminado
    };

    // Estado en texto para accesibilidad (aria-label), no depende solo del color.
    const statusLabelOf = (t: Table) => {
        if (t.status === 'occupied') return 'ocupada';
        if (t.status === 'reserved') return 'reservada';
        if (t.status === 'available') return 'libre';
        return 'estado desconocido';
    };

    if (loading && tables.length === 0) {
        // No render hasta que useTables resuelva; evita parpadeo.
        return null;
    }

    return (
        <div
            ref={barRef}
            className={`flex items-center gap-1.5 px-3 py-1.5 bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-800 ${className}`}
            role="tablist"
            aria-label="Tickets abiertos"
        >
          {/* Fila de chips acotada: lo que no quepa se mueve al dropdown. */}
          <div ref={chipRowRef} className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
            {/* Chip Orden Rápida (oculto si el usuario no puede vender, ej. mesero) */}
            {canQuickOrder && (
            <button
                onClick={onSelectQuickOrder}
                role="tab"
                aria-selected={isQuickOrder}
                className={`shrink-0 flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold uppercase tracking-wide transition-all active:scale-95 border ${
                    isQuickOrder
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50'
                        : 'bg-white dark:bg-gray-800 text-slate-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
            >
                <span className="size-1.5 rounded-full bg-purple-500" />
                <span>Orden Rápida</span>
            </button>
            )}

            {/* Chips de mesas ocupadas o activa (solo los que caben) */}
            {visibleChips.map(t => {
                const isActive = activeTableId === t.id && !isQuickOrder;
                const isLoading = loadingTableId === t.id;
                const label = t.label.replace(/^T-|^S-/, 'MESA ').replace(/^MESA MESA /, 'MESA ');
                return (
                    <button
                        key={t.id}
                        onClick={() => onSelectTable(t)}
                        role="tab"
                        aria-selected={isActive}
                        aria-busy={isLoading}
                        aria-label={`${label}, ${statusLabelOf(t)}${isLoading ? ', cargando orden' : ''}`}
                        className={`shrink-0 flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold uppercase tracking-wide transition-all active:scale-95 border ${
                            isActive
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50'
                                : 'bg-white dark:bg-gray-800 text-slate-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                    >
                        {isLoading ? (
                            <span className="size-3 rounded-full border-[1.5px] border-amber-400 border-t-transparent animate-spin" aria-hidden />
                        ) : (
                            <span className={`size-1.5 rounded-full ${statusColor(t)}`} />
                        )}
                        <span>{label}</span>
                    </button>
                );
            })}
          </div>

            {/* Ver todas: overflow de chips + mesas sin items */}
            {nonChipTables.length > 0 && (
                <div className="relative shrink-0" ref={allMenuRef}>
                    <button
                        onClick={() => setShowAllOpen(v => !v)}
                        aria-haspopup="listbox"
                        aria-expanded={showAllOpen}
                        className={`flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-semibold uppercase tracking-wide transition-all active:scale-95 border ${
                            activeInDropdown
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-1 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800/50'
                                : 'bg-white dark:bg-gray-800 text-slate-500 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                        }`}
                    >
                        {activeInDropdown && (
                            loadingTableId === activeTableObj!.id ? (
                                <span className="size-3 rounded-full border-[1.5px] border-amber-400 border-t-transparent animate-spin" aria-hidden />
                            ) : (
                                <span className={`size-1.5 rounded-full ${statusColor(activeTableObj!)}`} />
                            )
                        )}
                        {activeInDropdown ? activeChipLabel : 'Elegir mesa'}
                        <span className={`material-symbols-outlined text-[14px] transition-transform ${showAllOpen ? 'rotate-180' : ''}`}>expand_more</span>
                    </button>
                    {showAllOpen && allMenuRect && createPortal(
                        <div
                            ref={allMenuPopRef}
                            style={{
                                position: 'fixed',
                                top: allMenuRect.bottom + 6,
                                right: Math.max(8, window.innerWidth - allMenuRect.right),
                                zIndex: 80,
                            }}
                            className="w-max min-w-[180px] max-w-[80vw] max-h-[60vh] flex flex-col bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl animate-[fadeIn_0.15s_ease-out]"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-end px-3 py-2 border-b border-gray-100 dark:border-gray-800 shrink-0">
                                <button
                                    onClick={handleCreateInList}
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[14px]">add</span>
                                    Mesa
                                </button>
                            </div>

                            {/* Chips de salas (solo si hay más de una) */}
                            {hasMultipleRooms && (
                                <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto custom-scrollbar border-b border-gray-100 dark:border-gray-800 shrink-0">
                                    {activeRooms.map((room, idx) => {
                                        const isPrincipal = idx === 0;
                                        const selected = roomFilter === room.id;
                                        return (
                                            <div
                                                key={room.id}
                                                className={`shrink-0 flex items-center gap-1 pl-2.5 ${isPrincipal ? 'pr-2.5' : 'pr-1'} py-1 rounded-full text-[11px] font-semibold transition-colors ${
                                                    selected
                                                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400'
                                                        : 'bg-slate-100 dark:bg-gray-800 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-gray-700'
                                                }`}
                                            >
                                                <button onClick={() => setRoomFilter(room.id)} className="outline-none">
                                                    {room.name}
                                                </button>
                                                {!isPrincipal && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteRoom(room); }}
                                                        aria-label={`Eliminar ${room.name}`}
                                                        title="Eliminar sala"
                                                        className="size-4 flex items-center justify-center rounded-full text-slate-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/30 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-[13px]">close</span>
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Lista de mesas */}
                            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-1">
                                {dropdownTables.length === 0 ? (
                                    <p className="text-center text-xs text-slate-400 italic py-4">
                                        {hasMultipleRooms ? 'No hay mesas en esta sala.' : 'No hay mesas adicionales.'}
                                    </p>
                                ) : (
                                    dropdownTables.map(t => {
                                        const isEditing = editingTableId === t.id;
                                        const isActive = activeTableId === t.id && !isQuickOrder;
                                        const isLoading = loadingTableId === t.id;
                                        const label = t.label.replace(/^T-|^S-/, 'MESA ').replace(/^MESA MESA /, 'MESA ');
                                        const statusLabel = t.status === 'available' ? 'Libre' : t.status === 'reserved' ? 'Reservada' : 'Ocupada';
                                        const statusText = t.status === 'available'
                                            ? 'text-emerald-600 dark:text-emerald-400'
                                            : t.status === 'reserved'
                                                ? 'text-slate-500'
                                                : 'text-amber-600';

                                        if (isEditing) {
                                            return (
                                                <div key={t.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/10">
                                                    <input
                                                        autoFocus
                                                        type="text"
                                                        value={draftName}
                                                        onChange={e => setDraftName(e.target.value.toUpperCase())}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') handleSaveEditTable();
                                                            if (e.key === 'Escape') cancelDraft();
                                                        }}
                                                        placeholder="MESA N"
                                                        className="flex-1 h-8 rounded-lg border border-amber-300 dark:border-amber-700/50 bg-white dark:bg-gray-800 px-2 text-sm font-semibold text-text-main dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                                                    />
                                                    <button
                                                        onClick={cancelDraft}
                                                        className="size-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors"
                                                        title="Cancelar"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">close</span>
                                                    </button>
                                                    <button
                                                        onClick={handleSaveEditTable}
                                                        disabled={savingDraft || !draftName.trim()}
                                                        className="size-7 flex items-center justify-center rounded-lg text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50"
                                                        title="Guardar"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">check</span>
                                                    </button>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div
                                                key={t.id}
                                                onClick={() => { setShowAllOpen(false); onSelectTable(t); }}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        setShowAllOpen(false);
                                                        onSelectTable(t);
                                                    }
                                                }}
                                                className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                                                    isActive
                                                        ? 'bg-emerald-50 ring-1 ring-emerald-200 dark:bg-emerald-900/20 dark:ring-emerald-800/50'
                                                        : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                                                }`}
                                                aria-busy={isLoading}
                                            >
                                                {isLoading ? (
                                                    <span className="size-3 rounded-full border-[1.5px] border-amber-400 border-t-transparent animate-spin shrink-0" aria-hidden />
                                                ) : (
                                                    <span className={`size-1.5 rounded-full shrink-0 ${statusColor(t)}`} />
                                                )}
                                                <span className="font-semibold text-sm text-text-main dark:text-gray-200 truncate min-w-[70px]">{label}</span>
                                                <span className={`text-[11px] font-medium ${statusText} min-w-[40px]`}>{statusLabel}</span>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleStartEditTable(t); }}
                                                    className="size-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-gray-700 hover:text-slate-700 transition-colors opacity-60 group-hover:opacity-100 ml-1"
                                                    title="Renombrar"
                                                >
                                                    <span className="material-symbols-outlined text-[15px]">edit</span>
                                                </button>
                                                {(() => {
                                                    const isOccupied = t.status === 'occupied' || !!t.current_order_id;
                                                    return (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); if (!isOccupied) handleDeleteTable(t); }}
                                                            disabled={isOccupied}
                                                            className={`size-7 flex items-center justify-center rounded-lg transition-colors ${
                                                                isOccupied
                                                                    ? 'text-slate-300 dark:text-gray-600 opacity-40 cursor-not-allowed'
                                                                    : 'text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 opacity-60 group-hover:opacity-100'
                                                            }`}
                                                            title={isOccupied ? 'No se puede eliminar una mesa ocupada' : 'Eliminar'}
                                                        >
                                                            <span className="material-symbols-outlined text-[15px]">delete</span>
                                                        </button>
                                                    );
                                                })()}
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Footer: crear sala */}
                            <div className="border-t border-gray-100 dark:border-gray-800 p-2 shrink-0">
                                {creatingRoom ? (
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            autoFocus
                                            type="text"
                                            value={draftName}
                                            onChange={e => setDraftName(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') handleSaveCreateRoom();
                                                if (e.key === 'Escape') cancelDraft();
                                            }}
                                            placeholder="Ej: Terraza"
                                            className="flex-1 h-8 rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-white dark:bg-gray-800 px-2 text-sm text-text-main dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                                        />
                                        <button
                                            onClick={cancelDraft}
                                            className="size-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors"
                                            title="Cancelar"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">close</span>
                                        </button>
                                        <button
                                            onClick={handleSaveCreateRoom}
                                            disabled={savingDraft || !draftName.trim()}
                                            className="size-8 flex items-center justify-center rounded-lg text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50"
                                            title="Guardar"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">check</span>
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleStartCreateRoom}
                                        className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-gray-300 bg-slate-50 dark:bg-gray-800 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">add</span>
                                        Sala
                                    </button>
                                )}
                            </div>
                        </div>,
                        document.body
                    )}
                </div>
            )}
        </div>
    );
};

export default OpenTicketsBar;
