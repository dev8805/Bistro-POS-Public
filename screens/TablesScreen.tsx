import React, { useState, useEffect } from 'react';
import { Screen } from '../types';
import { useTables, Table } from '../hooks/useTables';
import { useExpenses } from '../hooks/useExpenses';
import { ExpenseModal } from '../components/ExpenseModal';
import { RoomModal } from '../components/RoomModal';
import { useToast } from '../context/ToastContext';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { useTablesWriteGate } from '../hooks/useTablesWriteGate';
import TablesReadOnlyBanner from '../components/TablesReadOnlyBanner';

interface TablesScreenProps {
    onNavigate: (screen: Screen) => void;
    onTableSelect: (table: Table) => void | Promise<void>;
    onToggleMenu?: () => void;
    onQuickOrder?: () => void;
    /** Id de la mesa cuya orden se está cargando (spinner inline en su card). */
    loadingTableId?: string | null;
}

export const TablesScreen: React.FC<TablesScreenProps> = ({ onNavigate, onTableSelect, onToggleMenu, onQuickOrder, loadingTableId }) => {
    const {
        tables: dbTables,
        rooms: dbRooms,
        loading,
        createRoom,
        updateRoom,
        deleteRoom,
        createTable,
        deleteTable,
    } = useTables();

    const { createExpense } = useExpenses();
    const { showToast } = useToast();
    const { confirmAction } = useConfirmDialog();
    // Gate de escritura de mesas (modelo Usuario Eje): en solo lectura se ocultan
    // y bloquean crear/eliminar mesas y salas (Req 4.4, 5.4, 16.1).
    const tablesGate = useTablesWriteGate();
    const tablesReadOnly = tablesGate.readOnly;

    const [filter, setFilter] = useState<'all' | 'available' | 'occupied'>('all');
    const [activeRoom, setActiveRoom] = useState<string | null>(null);
    const [isRoomDropdownOpen, setIsRoomDropdownOpen] = useState(false);
    const [addMode, setAddMode] = useState<'table' | 'chair'>('table');
    const [showConfigMenu, setShowConfigMenu] = useState(false);

    // Modals & Menus
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const [expenseModalType, setExpenseModalType] = useState<'inventory' | 'expense' | 'waste'>('inventory');
    const [showExpenseMenu, setShowExpenseMenu] = useState(false);
    const [showRoomModal, setShowRoomModal] = useState(false);
    const [roomModalMode, setRoomModalMode] = useState<'create' | 'edit'>('create');
    const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
    const [editingRoomName, setEditingRoomName] = useState('');
    const [showAddMenu, setShowAddMenu] = useState(false);

    // Initial Active Room
    useEffect(() => {
        if (dbRooms.length > 0 && !activeRoom) {
            setActiveRoom(dbRooms[0].id);
        }
    }, [dbRooms, activeRoom]);

    // --- Handlers ---

    const handleCreateRoomClick = () => {
        setRoomModalMode('create');
        setEditingRoomName('');
        setEditingRoomId(null);
        setShowRoomModal(true);
        setShowConfigMenu(false);
    };

    const handleEditRoomClick = (roomId: string, currentName: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setRoomModalMode('edit');
        setEditingRoomId(roomId);
        setEditingRoomName(currentName);
        setShowRoomModal(true);
        setShowConfigMenu(false);
    };

    const handleRoomModalSave = async (name: string) => {
        if (tablesReadOnly || !tablesGate.verifyCanWriteNow()) {
            showToast(tablesGate.readOnlyMessage ?? 'Mesas en solo lectura sin conexión', 'warning');
            return;
        }
        try {
            if (roomModalMode === 'create') {
                const newRoom = await createRoom(name);
                if (newRoom) setActiveRoom(newRoom.id);
            } else if (roomModalMode === 'edit' && editingRoomId) {
                await updateRoom(editingRoomId, { name });
            }
        } catch (error) {
            console.error('Error saving room:', error);
            showToast('Error al guardar la sala', 'error');
        }
    };

    const handleDeleteRoom = async (roomId: string, roomName: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setShowConfigMenu(false);
        if (tablesReadOnly) {
            showToast(tablesGate.readOnlyMessage ?? 'Mesas en solo lectura sin conexión', 'warning');
            return;
        }

        setTimeout(async () => {
            const confirmed = await confirmAction({
                title: `¿Eliminar sala "${roomName}" y sus mesas?`,
                confirmText: 'Eliminar',
                variant: 'danger'
            });
            if (confirmed) {
                if (dbRooms.length <= 1) {
                    showToast('No puedes eliminar todas las salas.', 'warning');
                    return;
                }
                try {
                    await deleteRoom(roomId);
                    if (activeRoom === roomId) {
                        const remaining = dbRooms.filter(r => r.id !== roomId);
                        if (remaining.length > 0) setActiveRoom(remaining[0].id);
                    }
                } catch (error) {
                    console.error('Error deleting room:', error);
                    showToast('Error al eliminar sala', 'error');
                }
            }
        }, 10);
    };

    const handleAddTableOrChair = async (type: 'table' | 'chair') => {
        if (!activeRoom) return;
        if (tablesReadOnly || !tablesGate.verifyCanWriteNow()) {
            showToast(tablesGate.readOnlyMessage ?? 'Mesas en solo lectura sin conexión', 'warning');
            return;
        }

        const prefix = type === 'table' ? 'T-' : 'S-';
        const tablesInCurrentRoom = dbTables.filter(t => t.room_id === activeRoom);
        const existingLabels = tablesInCurrentRoom
            .filter(t => t.label.startsWith(prefix))
            .map(t => parseInt(t.label.replace(prefix, '')))
            .filter(n => !isNaN(n));

        const nextNum = existingLabels.length > 0 ? Math.max(...existingLabels) + 1 : 1;
        const label = `${prefix}${nextNum < 10 ? '0' + nextNum : nextNum}`;

        try {
            await createTable(label, activeRoom, type === 'table' ? 4 : 1);
            setShowAddMenu(false);
        } catch (error) {
            console.error(`Error creating ${type}:`, error);
        }
    };

    const handleDeleteTable = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (tablesReadOnly) {
            showToast(tablesGate.readOnlyMessage ?? 'Mesas en solo lectura sin conexión', 'warning');
            return;
        }
        const confirmed = await confirmAction({
            title: '¿Eliminar esta mesa?',
            confirmText: 'Eliminar',
            variant: 'danger'
        });
        if (confirmed) {
            try {
                await deleteTable(id);
            } catch (error) {
                console.error('Error deleting table:', error);
            }
        }
    };

    const openExpenseModal = (type: 'inventory' | 'expense' | 'waste') => {
        setExpenseModalType(type);
        setShowExpenseModal(true);
        setShowExpenseMenu(false);
    };

    // Filtering
    const tablesInRoom = dbTables.filter(t => t.room_id === activeRoom);
    const filteredTables = tablesInRoom.filter(table => {
        if (filter === 'all') return true;
        return table.status === filter;
    });

    const activeRoomName = dbRooms.find(r => r.id === activeRoom)?.name || 'Salas';

    return (
        <div className="flex flex-col h-full bg-[#f8fafc] dark:bg-[#0B1120] text-slate-800 dark:text-slate-200 font-display">

            {/* Header - Room selector & actions */}
            <header className="h-16 px-4 md:px-6 bg-white dark:bg-[#151e32] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 shadow-sm z-20 sticky top-0">
                <div className="flex items-center gap-3 md:gap-4 flex-1">
                    {/* Menu Toggle */}


                    {/* Room Selector (Desktop: Tabs, Mobile: Dropdown trigger) */}
                    <div className="hidden md:flex items-center gap-2 overflow-x-auto no-scrollbar">
                        {dbRooms.map(room => (
                            <button
                                key={room.id}
                                onClick={() => setActiveRoom(room.id)}
                                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap border ${activeRoom === room.id
                                    ? 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-900 dark:text-white'
                                    : 'border-transparent text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-300'
                                    }`}
                            >
                                {room.name}
                            </button>
                        ))}
                        <button
                            onClick={() => setShowConfigMenu(!showConfigMenu)}
                            className="size-9 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-primary hover:border-primary transition-colors"
                        >
                            <span className="material-symbols-outlined text-[20px]">settings</span>
                        </button>
                    </div>

                    {/* Mobile Room Title / Dropdown Trigger */}
                    <button type="button" className="md:hidden flex items-center gap-2" onClick={() => setShowConfigMenu(!showConfigMenu)}>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Sala Actual</span>
                            <div className="flex items-center gap-1 font-bold text-slate-900 dark:text-white">
                                <span>{activeRoomName}</span>
                                <span className="material-symbols-outlined text-sm">expand_more</span>
                            </div>
                        </div>
                    </button>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-3">

                    {/* Add Table Button (oculto en solo lectura) */}
                    {!tablesReadOnly && (
                    <button
                        onClick={() => handleAddTableOrChair('table')}
                        className="h-10 px-4 flex items-center gap-2 bg-primary text-[#102218] font-bold text-sm rounded-xl hover:bg-primary-hover shadow-lg shadow-primary/20 transition-all active:scale-95"
                    >
                        <span className="material-symbols-outlined text-[20px]">add</span>
                        <span className="hidden md:inline">Nueva Mesa</span>
                    </button>
                    )}
                </div>

                {/* Config / Room Management Menu (Dropdown) */}
                {showConfigMenu && (
                    <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowConfigMenu(false)}></div>
                        <div className="absolute top-16 left-4 md:left-20 w-72 bg-white dark:bg-[#1A2638] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl shadow-slate-300/50 dark:shadow-black/50 z-40 overflow-hidden animate-fadeIn flex flex-col max-h-[80vh]">
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700">
                                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Administrar Salas</h3>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                                {dbRooms.map(room => (
                                    <div key={room.id}
                                        onClick={() => { setActiveRoom(room.id); setShowConfigMenu(false); }}
                                        className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-colors group ${activeRoom === room.id ? 'bg-primary/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                                        <div className="flex items-center gap-3">
                                            <div className={`size-1.5 rounded-full ${activeRoom === room.id ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'}`}></div>
                                            <span className={`text-sm font-bold ${activeRoom === room.id ? 'text-primary' : 'text-slate-600 dark:text-slate-300'}`}>{room.name}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            {!tablesReadOnly && (
                                            <button onClick={(e) => handleEditRoomClick(room.id, room.name, e)} className="p-1.5 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"><span className="material-symbols-outlined text-[16px]">edit</span></button>
                                            )}
                                            {!tablesReadOnly && (
                                            <button onClick={(e) => handleDeleteRoom(room.id, room.name, e)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><span className="material-symbols-outlined text-[16px]">delete</span></button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="p-2 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30">
                                {!tablesReadOnly && (
                                <button
                                    onClick={handleCreateRoomClick}
                                    className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 font-bold text-xs hover:border-primary hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-[18px]">add_circle</span>
                                    CREAR NUEVA SALA
                                </button>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 lg:p-8">
                <div className="max-w-[1400px] mx-auto space-y-6">

                    {/* Banner de solo lectura: distingue observador offline de eje
                        sin conexión (Req 5.2, 5.3, 16.2, 16.3). */}
                    {tablesReadOnly && tablesGate.readOnlyMessage && (
                        <TablesReadOnlyBanner
                            reason={tablesGate.readOnlyReason}
                            message={tablesGate.readOnlyMessage}
                        />
                    )}

                    {/* Filters Stripe */}
                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                        {[
                            { id: 'all', label: 'Todas', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200', icon: 'apps' },
                            { id: 'available', label: 'Disponibles', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300', icon: 'check_circle' },
                            { id: 'occupied', label: 'Ocupadas', color: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300', icon: 'person' },

                        ].map(item => {
                            const isActive = filter === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => setFilter(item.id as any)}
                                    className={`
                                        h-9 px-4 rounded-lg flex items-center gap-2 text-xs font-bold transition-all border whitespace-nowrap
                                        ${isActive
                                            ? `${item.color} border-transparent`
                                            : 'bg-white dark:bg-[#151e32] text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                        }
                                    `}
                                >
                                    {isActive && <span className="material-symbols-outlined text-[16px]">{item.icon}</span>}
                                    {item.label}
                                </button>
                            )
                        })}
                    </div>

                    {/* Tables Grid */}
                    {/* Tables Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-3 md:gap-4 pb-20">
                        {loading ? (
                            <div className="col-span-full h-64 flex flex-col items-center justify-center text-slate-400 gap-3">
                                <div className="size-10 border-4 border-slate-200 border-t-primary rounded-full animate-spin"></div>
                                <span className="font-bold text-sm">Cargando mesas...</span>
                            </div>
                        ) : filteredTables.length === 0 ? (
                            <div className="col-span-full h-64 flex flex-col items-center justify-center text-slate-300 dark:text-slate-600">
                                <span className="material-symbols-outlined text-6xl mb-2">table_restaurant</span>
                                <span className="font-bold text-sm">Sin resultados en esta sala</span>
                            </div>
                        ) : (
                            filteredTables.map(table => {
                                const isAvailable = table.status === 'available';
                                const isOccupied = table.status === 'occupied';
                                const isReserved = table.status === 'reserved';
                                const isLoading = loadingTableId === table.id;
                                const labelCode = table.label.replace(/^(T|S)-/, '');
                                const isChair = table.seats === 1 && table.label.startsWith('S-');

                                return (
                                    <div
                                        key={table.id}
                                        onClick={() => onTableSelect(table)}
                                        aria-busy={isLoading}
                                        className={`
                                            group relative cursor-pointer transition-all duration-300 border-2 shadow-sm
                                            
                                            /* Mobile: Horizontal Compact */
                                            flex flex-row items-center justify-between p-3 rounded-xl min-h-[80px] gap-3
                                            
                                            /* Desktop: Vertical Spacious */
                                            md:flex-col md:justify-center md:p-3 md:rounded-2xl md:min-h-[120px] md:gap-1

                                            /* Colors */
                                            ${isAvailable
                                                ? 'bg-white dark:bg-[#151e32] border-slate-100 dark:border-slate-800 hover:border-emerald-200 dark:hover:border-emerald-900/50 hover:shadow-xl hover:shadow-emerald-500/10 hover:-translate-y-1'
                                                : ''}
                                            ${isOccupied
                                                ? 'bg-gradient-to-r md:bg-gradient-to-br from-rose-50 to-white dark:from-rose-900/20 dark:to-transparent border-rose-100 dark:border-rose-900/50 shadow-rose-200/50 dark:shadow-rose-900/20'
                                                : ''}
                                            ${isReserved
                                                ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900/30'
                                                : ''}
                                        `}
                                    >
                                        {/* Status Icon Badge */}
                                        <div className={`
                                            flex items-center justify-center rounded-full shrink-0
                                            
                                            /* Mobile: Small & Left aligned with Text */
                                            size-8 md:w-9 md:h-9 md:mb-1
                                            
                                            ${isAvailable ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:bg-emerald-100 group-hover:text-emerald-600 transition-colors' : ''}
                                            ${isOccupied ? 'bg-rose-100 dark:bg-rose-900/50 text-rose-600 animate-pulse-slow' : ''}
                                            ${isReserved ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600' : ''}
                                        `}>
                                            {isLoading ? (
                                                <span className="size-4 md:size-5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" aria-label="Cargando orden" />
                                            ) : (
                                                <span className="material-symbols-outlined text-[18px] md:text-[20px]">
                                                    {isChair ? 'chair' : (isOccupied ? 'person' : 'table_restaurant')}
                                                </span>
                                            )}
                                        </div>

                                        {/* Table Number */}
                                        <div className="flex-1 flex flex-col md:items-center">
                                            <span className={`
                                                font-black tracking-tighter leading-none
                                                text-2xl md:text-4xl
                                                
                                                ${isAvailable ? 'text-slate-300 dark:text-slate-700 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors' : ''}
                                                ${isOccupied ? 'text-rose-600 dark:text-rose-400' : ''}
                                                ${isReserved ? 'text-blue-500 dark:text-blue-400' : ''}
                                            `}>
                                                {labelCode}
                                            </span>
                                            {/* Mobile Label (Subtext under number) */}
                                            {isOccupied && <span className="md:hidden text-[9px] font-bold text-rose-400 uppercase tracking-wider">Ocupada</span>}
                                            {isReserved && <span className="md:hidden text-[9px] font-bold text-blue-400 uppercase tracking-wider">Reservada</span>}
                                        </div>

                                        {/* Info / Status (Right side on mobile, Bottom on desktop) */}
                                        <div className="flex flex-col items-end md:items-center">

                                            {/* Available: Show text only on Desktop */}
                                            {isAvailable && (
                                                <span className="hidden md:block text-[10px] font-bold uppercase tracking-widest text-slate-400 group-hover:text-emerald-500 transition-colors">Disponible</span>
                                            )}

                                            {/* Occupied: Show Status */}
                                            {isOccupied && (
                                                <span className="hidden md:block text-[10px] font-bold uppercase tracking-widest text-rose-400">Ocupada</span>
                                            )}

                                            {/* Reserved: Show Time */}
                                            {isReserved && (
                                                <>
                                                    <span className="hidden md:block text-[10px] font-bold uppercase tracking-widest text-blue-400 mb-1">Reservada</span>
                                                    <span className="text-xs font-bold text-blue-600 dark:text-blue-300">{table.time}</span>
                                                </>
                                            )}
                                        </div>

                                        {/* Action: Delete (Only on hover, desktop) */}
                                        {isAvailable && !tablesReadOnly && (
                                            <button
                                                onClick={(e) => handleDeleteTable(e, table.id)}
                                                className="absolute top-1 right-1 md:top-2 md:right-2 size-6 md:w-7 md:h-7 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100"
                                                title="Eliminar Mesa"
                                            >
                                                <span className="material-symbols-outlined text-[14px] md:text-[16px]">close</span>
                                            </button>
                                        )}
                                    </div>
                                )
                            })
                        )}


                    </div>
                </div>
            </main>

            {/* Modals */}
            {showExpenseModal && (
                <ExpenseModal
                    onClose={() => setShowExpenseModal(false)}
                    onSave={async (data) => {
                        try {
                            if (data.type !== 'inventory') await createExpense(data);
                            if (data.type !== 'expense') setShowExpenseModal(false);
                        } catch (error) {
                            console.error('Error saving expense:', error);
                            showToast('Error al registrar', 'error');
                        }
                    }}
                    initialType={expenseModalType}
                />
            )}

            <RoomModal
                isOpen={showRoomModal}
                onClose={() => setShowRoomModal(false)}
                onSave={handleRoomModalSave}
                initialName={editingRoomName}
                mode={roomModalMode}
            />
        </div>
    );
};
