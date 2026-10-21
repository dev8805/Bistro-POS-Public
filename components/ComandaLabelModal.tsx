import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useComandaLabels, ComandaLabelKind, ComandaLabel } from '../hooks/useComandaLabels';
import { useComandaLabelsVisibility, ComandaLabelsVisibility } from '../hooks/useComandaLabelsVisibility';

// ============================================================
// ComandaLabelModal
// ------------------------------------------------------------
// Modal previo a enviar la comanda desde SuccessScreen/SuccessSidebar
// (solo en modo Catálogo). Permite etiquetar la comanda con:
//   - Localizador (una etiqueta)
//   - Mesa (una etiqueta) — independiente del sistema public.tables del POS
//   - Tipo de pedido (una etiqueta: Para llevar, Domicilio, etc.)
// Las 3 son combinables entre sí (Loc + Mesa + Tipo de pedido).
// El listado de cada pestaña se persiste por negocio (Supabase).
// La visibilidad de cada pestaña también se persiste por negocio (tabla
// comanda_labels_visibility, sin filtro por rol).
// ============================================================

export type TabKey = ComandaLabelKind;

export interface ComandaLabelSelection {
    locator?: string;   // valor visible de la etiqueta elegida (ej. "3")
    table?: string;     // valor visible de la etiqueta elegida (ej. "5")
    takeaway?: string;  // valor visible de la etiqueta elegida (ej. "Domicilio")
}

interface ComandaLabelModalProps {
    isOpen: boolean;
    /** Nombre visible del destino elegido (impresora local o usuario remoto).
        Solo se muestra cuando el modal se abre desde el flujo de envío
        (SuccessScreen/SuccessSidebar). Desde el header del carrito queda vacío. */
    targetLabel?: string;
    /** Selección previa (usada al abrir el modal desde el header del carrito
        para editar etiquetas ya elegidas). Si se pasa, precarga los valores. */
    initialSelection?: ComandaLabelSelection;
    onClose: () => void;
    /** El caller ya sabe qué tarjeta (local/remota) disparó el modal. */
    onConfirm: (selection: ComandaLabelSelection) => void;
    /** Indicador visual mientras el caller envía la comanda. */
    isSending?: boolean;
    /** Texto del botón principal. Default: "Enviar comanda". Desde el header
        del carrito se usa "Guardar" porque no se envía nada todavía. */
    confirmLabel?: string;
    /** Ícono del botón principal (Material Symbols). Default: "send". */
    confirmIcon?: string;
}

interface TabDef {
    key: TabKey;
    label: string;
    icon: string;
    /** Etiqueta corta para el panel de visibilidad. */
    shortLabel: string;
}

const TABS: TabDef[] = [
    { key: 'locator', label: 'Localizador', icon: 'pin_drop', shortLabel: 'Localizador' },
    { key: 'table', label: 'Mesas', icon: 'table_restaurant', shortLabel: 'Mesas' },
    { key: 'takeaway', label: 'Tipo de pedido', icon: 'takeout_dining', shortLabel: 'Tipo de pedido' },
];

const ComandaLabelModal = ({
    isOpen,
    targetLabel,
    initialSelection,
    onClose,
    onConfirm,
    isSending = false,
    confirmLabel = 'Enviar comanda',
    confirmIcon = 'send',
}: ComandaLabelModalProps) => {
    const { locators, tables, takeaways, loading, error, refresh, addLabel, removeLabel, renameLabel } = useComandaLabels();
    const { visibility, refresh: refreshVisibility, toggle: toggleVisibility } = useComandaLabelsVisibility();

    // Pestañas visibles según preferencia del negocio.
    const visibleTabs = useMemo(
        () => TABS.filter(t => visibility[t.key as keyof ComandaLabelsVisibility]),
        [visibility]
    );

    const [activeTab, setActiveTab] = useState<TabKey>('locator');
    const [selectedLocator, setSelectedLocator] = useState<string | undefined>(undefined);
    const [selectedTable, setSelectedTable] = useState<string | undefined>(undefined);
    const [selectedTakeaway, setSelectedTakeaway] = useState<string | undefined>(undefined);
    const [isEditMode, setIsEditMode] = useState(false);
    const [newValue, setNewValue] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);
    const [showVisibilityPanel, setShowVisibilityPanel] = useState(false);
    const newInputRef = useRef<HTMLInputElement>(null);
    const visibilityPanelRef = useRef<HTMLDivElement>(null);

    // Reset + carga cuando abrimos. Si viene initialSelection (desde el header
    // del carrito), precargamos los valores para permitir editar la selección.
    useEffect(() => {
        if (!isOpen) return;
        setSelectedLocator(initialSelection?.locator);
        setSelectedTable(initialSelection?.table);
        setSelectedTakeaway(initialSelection?.takeaway);
        setIsEditMode(false);
        setNewValue('');
        setShowVisibilityPanel(false);
        void refresh();
        void refreshVisibility();
    }, [isOpen, initialSelection, refresh, refreshVisibility]);

    // Si la pestaña activa deja de estar visible (usuario la ocultó), saltamos
    // a la primera visible.
    useEffect(() => {
        if (visibleTabs.length === 0) return;
        if (!visibleTabs.some(t => t.key === activeTab)) {
            setActiveTab(visibleTabs[0].key);
        }
    }, [visibleTabs, activeTab]);

    // Cerrar panel de visibilidad al clickear afuera.
    useEffect(() => {
        if (!showVisibilityPanel) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (visibilityPanelRef.current && !visibilityPanelRef.current.contains(e.target as Node)) {
                setShowVisibilityPanel(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showVisibilityPanel]);

    // Al entrar en modo edición, enfoca el input "Nuevo…" tras un tick.
    useEffect(() => {
        if (!isEditMode) return;
        const t = setTimeout(() => newInputRef.current?.focus(), 80);
        return () => clearTimeout(t);
    }, [isEditMode, activeTab]);

    const currentList: ComandaLabel[] =
        activeTab === 'locator' ? locators :
        activeTab === 'table' ? tables :
        takeaways;

    const currentSelection: string | undefined =
        activeTab === 'locator' ? selectedLocator :
        activeTab === 'table' ? selectedTable :
        selectedTakeaway;

    const selectionSummary = useMemo(() => {
        const parts: string[] = [];
        if (selectedLocator) parts.push(`Loc ${selectedLocator}`);
        if (selectedTable) parts.push(`Mesa ${selectedTable}`);
        if (selectedTakeaway) parts.push(selectedTakeaway);
        return parts.length > 0 ? parts.join(' · ') : 'Ninguna';
    }, [selectedLocator, selectedTable, selectedTakeaway]);

    const handleSelectPill = (kind: TabKey, value: string) => {
        if (isEditMode) return;
        if (kind === 'locator') {
            setSelectedLocator(prev => prev === value ? undefined : value);
        } else if (kind === 'table') {
            setSelectedTable(prev => prev === value ? undefined : value);
        } else {
            setSelectedTakeaway(prev => prev === value ? undefined : value);
        }
    };

    const handleAdd = async () => {
        const clean = newValue.trim();
        if (!clean) return;
        try {
            await addLabel(activeTab, clean);
            setNewValue('');
            newInputRef.current?.focus();
        } catch {
            // el hook ya expone error en state
        }
    };

    const handleRename = async (id: string, next: string) => {
        setBusyId(id);
        try {
            await renameLabel(id, next);
        } catch {
            // ignore, el hook rollea
        } finally {
            setBusyId(null);
        }
    };

    const handleRemove = async (id: string, value: string, kind: TabKey) => {
        setBusyId(id);
        try {
            await removeLabel(id);
            // Si la etiqueta eliminada estaba seleccionada, la desmarcamos.
            if (kind === 'locator' && selectedLocator === value) setSelectedLocator(undefined);
            if (kind === 'table' && selectedTable === value) setSelectedTable(undefined);
            if (kind === 'takeaway' && selectedTakeaway === value) setSelectedTakeaway(undefined);
        } catch {
            // ignore
        } finally {
            setBusyId(null);
        }
    };

    const handleConfirm = () => {
        onConfirm({
            locator: selectedLocator,
            table: selectedTable,
            takeaway: selectedTakeaway,
        });
    };

    const handleKeyDownRoot = (event: React.KeyboardEvent) => {
        if (event.key === 'Escape') onClose();
    };

    if (!isOpen) return null;
    if (typeof document === 'undefined') return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
            onClick={onClose}
            onKeyDown={handleKeyDownRoot}
            role="dialog"
            aria-modal="true"
            aria-labelledby="comanda-label-modal-title"
        >
            <div
                className="w-full max-w-md mx-4 bg-white dark:bg-surface-dark rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden animate-[scaleIn_0.2s_ease-out] flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-gray-200 dark:border-gray-800">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                                <span className="material-symbols-outlined text-xl text-text-main dark:text-white">receipt_long</span>
                            </div>
                            <div>
                                <h3 id="comanda-label-modal-title" className="text-lg font-bold text-text-main dark:text-white leading-tight">
                                    Etiquetar comanda
                                </h3>
                                {targetLabel && (
                                    <p className="text-xs text-text-secondary font-medium mt-0.5">
                                        Destino: <span className="font-semibold text-text-main dark:text-white">{targetLabel}</span>
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-1 relative">
                            {/* Tuerca: mostrar/ocultar pestañas */}
                            <button
                                type="button"
                                onClick={() => setShowVisibilityPanel(v => !v)}
                                className={`size-8 rounded-full flex items-center justify-center transition-colors ${
                                    showVisibilityPanel
                                        ? 'bg-gray-100 dark:bg-gray-800 text-text-main dark:text-white'
                                        : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-text-secondary'
                                }`}
                                aria-label="Configurar pestañas"
                                aria-expanded={showVisibilityPanel}
                            >
                                <span className="material-symbols-outlined text-xl">settings</span>
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                className="size-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center transition-colors"
                                aria-label="Cerrar"
                            >
                                <span className="material-symbols-outlined text-xl text-text-secondary">close</span>
                            </button>

                            {showVisibilityPanel && (
                                <div
                                    ref={visibilityPanelRef}
                                    className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-surface-dark rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-2 z-10 animate-[scaleIn_0.15s_ease-out] origin-top-right"
                                >
                                    <div className="px-2 py-1.5 text-xs font-bold text-text-secondary uppercase tracking-wider">
                                        Mostrar pestañas
                                    </div>
                                    {TABS.map(tab => {
                                        const key = tab.key as keyof ComandaLabelsVisibility;
                                        const isVisible = visibility[key];
                                        const handleToggle = () => void toggleVisibility(key);
                                        return (
                                            <button
                                                key={tab.key}
                                                type="button"
                                                onClick={handleToggle}
                                                className="w-full flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="material-symbols-outlined text-base text-text-secondary">{tab.icon}</span>
                                                    <span className="text-sm font-semibold text-text-main dark:text-white truncate">
                                                        {tab.shortLabel}
                                                    </span>
                                                </div>
                                                <VisibilitySwitch on={isVisible} />
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Tabs visibles */}
                {visibleTabs.length > 0 && (
                    <div className="flex border-b border-gray-200 dark:border-gray-800 px-2">
                        {visibleTabs.map(tab => {
                            const isActive = activeTab === tab.key;
                            const hasSelection =
                                (tab.key === 'locator' && Boolean(selectedLocator))
                                || (tab.key === 'table' && Boolean(selectedTable))
                                || (tab.key === 'takeaway' && Boolean(selectedTakeaway));
                            const handleTab = () => {
                                setActiveTab(tab.key);
                                setIsEditMode(false);
                                setNewValue('');
                            };
                            return (
                                <button
                                    key={tab.key}
                                    type="button"
                                    onClick={handleTab}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTab(); } }}
                                    tabIndex={0}
                                    aria-label={tab.label}
                                    aria-selected={isActive}
                                    role="tab"
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-bold transition-colors relative ${
                                        isActive
                                            ? 'text-text-main dark:text-white'
                                            : 'text-text-secondary hover:text-text-main dark:hover:text-white'
                                    } ${hasSelection ? 'bg-primary/20 dark:bg-primary/15' : ''}`}
                                >
                                    <span className="material-symbols-outlined text-base">{tab.icon}</span>
                                    <span>{tab.label}</span>
                                    {hasSelection && (
                                        <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                                    )}
                                    {isActive && (
                                        <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-t-full" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5">
                    {error && (
                        <div className="mb-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg p-2">
                            {error}
                        </div>
                    )}

                    {visibleTabs.length === 0 ? (
                        <div className="py-8 text-center text-sm text-text-secondary">
                            No hay pestañas activas. Activá al menos una en <span className="material-symbols-outlined text-sm align-middle">settings</span>.
                        </div>
                    ) : (
                        <>
                            {/* Toolbar */}
                            <div className="flex items-center justify-end mb-3">
                                <button
                                    type="button"
                                    onClick={() => setIsEditMode(v => !v)}
                                    className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                                        isEditMode
                                            ? 'bg-primary text-[#102218] hover:bg-primary-hover'
                                            : 'text-text-main dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                                    }`}
                                >
                                    {isEditMode ? 'Listo' : 'Editar lista'}
                                </button>
                            </div>

                            {/* Grid de píldoras */}
                            {isEditMode ? (
                                <EditablePillGrid
                                    items={currentList}
                                    busyId={busyId}
                                    onRename={handleRename}
                                    onRemove={(id, value) => handleRemove(id, value, activeTab)}
                                />
                            ) : (
                                <SelectablePillGrid
                                    items={currentList}
                                    selectedValue={currentSelection}
                                    onSelect={(value) => handleSelectPill(activeTab, value)}
                                    isTakeawayLike={activeTab === 'takeaway'}
                                />
                            )}

                            {/* Input para agregar (solo en edit mode) */}
                            {isEditMode && (
                                <div className="mt-3 flex items-center gap-2">
                                    <input
                                        ref={newInputRef}
                                        type="text"
                                        value={newValue}
                                        onChange={(e) => setNewValue(e.target.value.slice(0, 20))}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                void handleAdd();
                                            }
                                        }}
                                        placeholder={
                                            activeTab === 'locator' ? 'Nuevo localizador…'
                                            : activeTab === 'table' ? 'Nueva mesa…'
                                            : 'Nuevo tipo de pedido…'
                                        }
                                        className="flex-1 h-10 px-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-background-dark text-sm text-text-main dark:text-white placeholder:text-text-secondary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                                        maxLength={20}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => void handleAdd()}
                                        disabled={!newValue.trim()}
                                        className="size-10 rounded-xl bg-primary text-[#102218] flex items-center justify-center hover:bg-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                        aria-label="Agregar"
                                    >
                                        <span className="material-symbols-outlined text-xl">add</span>
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-gray-200 dark:border-gray-800 p-4 bg-gray-50 dark:bg-black/20">
                    <div className="flex items-center justify-between mb-3 text-xs">
                        <span className="font-bold text-text-secondary uppercase tracking-wider">Selección</span>
                        <span className="font-semibold text-text-main dark:text-white truncate ml-2">
                            {selectionSummary}
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSending}
                            className="flex-1 h-11 rounded-xl border border-gray-200 dark:border-gray-700 text-text-main dark:text-white font-bold text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleConfirm}
                            disabled={isSending}
                            className="flex-[2] h-11 rounded-xl bg-primary text-[#102218] font-bold text-sm hover:bg-primary-hover transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {isSending ? (
                                <>
                                    <span className="material-symbols-outlined text-lg animate-spin">progress_activity</span>
                                    Enviando…
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-lg">{confirmIcon}</span>
                                    {confirmLabel}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

// -------- subcomponentes ------------------------------------

interface SelectablePillGridProps {
    items: ComandaLabel[];
    selectedValue?: string;
    onSelect: (value: string) => void;
    /** Cuando true, muestra 2 columnas en vez de 5 (labels de texto suelen ser más largas). */
    isTakeawayLike?: boolean;
}

const SelectablePillGrid = ({ items, selectedValue, onSelect, isTakeawayLike }: SelectablePillGridProps) => {
    if (items.length === 0) {
        return (
            <div className="py-8 text-center text-sm text-text-secondary">
                No hay etiquetas. Toca <span className="font-bold text-text-main dark:text-white">Editar lista</span> para agregar.
            </div>
        );
    }
    const gridCols = isTakeawayLike ? 'grid-cols-2' : 'grid-cols-5';
    return (
        <div className={`grid ${gridCols} gap-2`}>
            {items.map(item => {
                const isSelected = selectedValue === item.value;
                const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(item.value);
                    }
                };
                return (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelect(item.value)}
                        onKeyDown={handleKeyDown}
                        tabIndex={0}
                        aria-label={`Seleccionar ${item.value}`}
                        aria-pressed={isSelected}
                        className={`h-14 px-2 rounded-xl border-2 font-bold text-sm transition-all truncate ${
                            isSelected
                                ? 'border-primary bg-primary text-[#102218] shadow-md scale-[1.02]'
                                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-background-dark text-text-main dark:text-white hover:border-primary/50 hover:bg-primary/5'
                        }`}
                    >
                        {item.value}
                    </button>
                );
            })}
        </div>
    );
};

interface EditablePillGridProps {
    items: ComandaLabel[];
    busyId: string | null;
    onRename: (id: string, newValue: string) => Promise<void>;
    onRemove: (id: string, value: string) => Promise<void>;
}

const EditablePillGrid = ({ items, busyId, onRename, onRemove }: EditablePillGridProps) => {
    if (items.length === 0) {
        return (
            <div className="py-8 text-center text-sm text-text-secondary">
                Sin etiquetas. Agrega la primera abajo.
            </div>
        );
    }
    return (
        <div className="grid grid-cols-2 gap-2">
            {items.map(item => (
                <EditablePill
                    key={item.id}
                    item={item}
                    isBusy={busyId === item.id}
                    onRename={onRename}
                    onRemove={() => void onRemove(item.id, item.value)}
                />
            ))}
        </div>
    );
};

interface EditablePillProps {
    item: ComandaLabel;
    isBusy: boolean;
    onRename: (id: string, newValue: string) => Promise<void>;
    onRemove: () => void;
}

const EditablePill = ({ item, isBusy, onRename, onRemove }: EditablePillProps) => {
    const [draft, setDraft] = useState(item.value);

    // Sincroniza si el valor cambia por rollback o refresh externo.
    useEffect(() => { setDraft(item.value); }, [item.value]);

    const handleBlur = () => {
        const clean = draft.trim();
        if (clean && clean !== item.value) {
            void onRename(item.id, clean);
        } else {
            setDraft(item.value);
        }
    };

    return (
        <div className={`flex items-center gap-1 h-11 pl-2 pr-1 rounded-xl border ${
            isBusy ? 'border-gray-200 dark:border-gray-700 opacity-60' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-background-dark'
        }`}>
            <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 20))}
                onBlur={handleBlur}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
                    if (e.key === 'Escape') { setDraft(item.value); (e.target as HTMLInputElement).blur(); }
                }}
                disabled={isBusy}
                className="flex-1 min-w-0 bg-transparent text-sm font-bold text-text-main dark:text-white focus:outline-none"
                maxLength={20}
                aria-label={`Renombrar ${item.value}`}
            />
            <button
                type="button"
                onClick={onRemove}
                disabled={isBusy}
                className="size-8 rounded-lg text-text-secondary hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center transition-colors disabled:opacity-50"
                aria-label={`Eliminar ${item.value}`}
            >
                <span className="material-symbols-outlined text-lg">close</span>
            </button>
        </div>
    );
};

// Switch visual para el panel de visibilidad (no clickeable por sí solo — el
// click lo maneja el <button> contenedor).
const VisibilitySwitch = ({ on }: { on: boolean }) => (
    <div
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
            on ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
        }`}
        aria-hidden="true"
    >
        <div
            className={`absolute top-0.5 size-4 bg-white rounded-full shadow-sm transition-all ${
                on ? 'left-[18px]' : 'left-0.5'
            }`}
        />
    </div>
);

export default ComandaLabelModal;
