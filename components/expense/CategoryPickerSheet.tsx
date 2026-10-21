import React, { useState, useMemo } from 'react';

interface CategoryPickerSheetProps {
    categories: string[];
    selected: string;
    onSelect: (category: string) => void;
    onCreate: (name: string) => Promise<void> | void;
    onClose: () => void;
}

export const CategoryPickerSheet: React.FC<CategoryPickerSheetProps> = ({
    categories,
    selected,
    onSelect,
    onCreate,
    onClose,
}) => {
    const [search, setSearch] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [newValue, setNewValue] = useState('');
    const [saving, setSaving] = useState(false);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return categories;
        return categories.filter(c => c.toLowerCase().includes(q));
    }, [categories, search]);

    const handleSelect = (category: string) => {
        onSelect(category);
        onClose();
    };

    const handleCreate = async () => {
        const name = newValue.trim();
        if (!name || saving) return;
        setSaving(true);
        try {
            await onCreate(name);
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="absolute inset-0 z-[90] flex flex-col bg-surface-light dark:bg-surface-dark animate-[fadeIn_0.15s_ease-out]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-[max(16px,env(safe-area-inset-top))] pb-3 border-b border-border-light dark:border-border-dark shrink-0">
                <h2 className="text-sm font-black uppercase tracking-[0.12em] text-text-main dark:text-white">
                    Elegir categoría
                </h2>
                <button
                    type="button"
                    onClick={onClose}
                    className="size-9 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-300 active:scale-90 transition-all"
                    aria-label="Cerrar"
                >
                    <span className="material-symbols-outlined text-2xl">close</span>
                </button>
            </div>

            {/* Buscador */}
            <div className="px-5 py-3 shrink-0">
                <div className="relative">
                    <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-[20px]">search</span>
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar categoría..."
                        className="w-full h-12 pl-11 pr-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 focus:border-status-error rounded-2xl outline-none transition-all text-sm font-bold text-gray-700 dark:text-gray-200"
                    />
                </div>
            </div>

            {/* Lista (aprovecha todo el alto) */}
            <div className="flex-1 overflow-y-auto px-5 pb-3">
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                        <span className="material-symbols-outlined text-3xl text-gray-300">search_off</span>
                        <p className="text-sm text-gray-400 font-bold">Sin coincidencias</p>
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {filtered.map(item => {
                            const isSelected = selected === item;
                            return (
                                <button
                                    key={item}
                                    type="button"
                                    onClick={() => handleSelect(item)}
                                    className={`w-full flex items-center justify-between gap-2 px-4 py-3.5 rounded-2xl border text-left transition-all active:scale-[0.99] ${isSelected
                                            ? 'border-status-error bg-status-error/5 text-status-error'
                                            : 'border-gray-200 dark:border-gray-700 text-text-main dark:text-white hover:border-gray-300 dark:hover:border-gray-600'
                                        }`}
                                >
                                    <span className="text-xs sm:text-sm font-bold uppercase tracking-wider truncate">{item}</span>
                                    {isSelected && <span className="material-symbols-outlined text-[20px] shrink-0">check_circle</span>}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Crear categoría */}
            <div className="px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] border-t border-border-light dark:border-border-dark shrink-0">
                {isCreating ? (
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={newValue}
                            onChange={e => setNewValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setIsCreating(false); setNewValue(''); } }}
                            placeholder="Nueva categoría..."
                            className="flex-1 min-w-0 h-12 px-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 focus:border-status-error rounded-2xl outline-none transition-all text-sm font-bold text-gray-800 dark:text-white uppercase"
                            autoFocus
                        />
                        <button
                            type="button"
                            onClick={handleCreate}
                            disabled={!newValue.trim() || saving}
                            className="h-12 px-5 bg-status-error hover:bg-red-600 disabled:opacity-40 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-colors active:scale-95 shrink-0"
                        >
                            {saving ? '...' : 'Guardar'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setIsCreating(false); setNewValue(''); }}
                            className="size-12 flex items-center justify-center bg-gray-100 dark:bg-gray-800 text-gray-500 rounded-2xl active:scale-95 transition-all shrink-0"
                        >
                            <span className="material-symbols-outlined text-[20px]">close</span>
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setIsCreating(true)}
                        className="w-full h-12 flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-2xl font-bold text-sm active:scale-[0.99] transition-all"
                    >
                        <span className="material-symbols-outlined text-[20px]">add_circle</span>
                        Crear nueva categoría
                    </button>
                )}
            </div>
        </div>
    );
};
