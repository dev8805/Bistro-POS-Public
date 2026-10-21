import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useBusinessSettings } from '../../context/BusinessSettingsContext';
import { useConfirmDialog } from '../../context/ConfirmDialogContext';
import { useToast } from '../../context/ToastContext';
import { useIsMobile } from '../../hooks/useIsMobile';

interface PayrollConceptDropdownProps {
    selectedConcept: string;
    onSelectConcept: (concept: string) => void;
    error?: boolean;
    label?: string;
    showLabel?: boolean;
    required?: boolean;
    placeholder?: string;
}

export const PayrollConceptDropdown: React.FC<PayrollConceptDropdownProps> = ({
    selectedConcept,
    onSelectConcept,
    error = false,
    label = 'CONCEPTO DEL PAGO',
    showLabel = true,
    required = true,
    placeholder = 'Elegir',
}) => {
    const { payrollConcepts = ['Sueldo', 'Vale', 'Turno', 'Horas Extra'], updatePayrollConcepts } = useBusinessSettings();
    const { confirmAction } = useConfirmDialog();
    const { showToast } = useToast();
    const isMobile = useIsMobile();

    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [newConceptName, setNewConceptName] = useState('');

    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editingValue, setEditingValue] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const newConceptInputRef = useRef<HTMLInputElement>(null);

    // Filtrar conceptos según el término de búsqueda
    const filteredConcepts = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        if (!query) return payrollConcepts;
        return payrollConcepts.filter(c => c.toLowerCase().includes(query));
    }, [payrollConcepts, searchTerm]);

    // Cerrar al hacer clic fuera
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setIsCreating(false);
                setEditingIndex(null);
                setSearchTerm('');
            }
        };
        if (isOpen || isCreating) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, isCreating]);

    const handleToggleOpen = () => {
        setIsOpen(prev => {
            const next = !prev;
            if (next) {
                setSearchTerm('');
                setIsCreating(false);
                setEditingIndex(null);
                setTimeout(() => {
                    dropdownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    const isTouchOrMobile = isMobile || (typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0) && window.innerWidth < 1024);
                    if (!isTouchOrMobile) {
                        searchInputRef.current?.focus();
                    }
                }, 60);
            }
            return next;
        });
    };

    const handleSelect = (concept: string) => {
        onSelectConcept(concept);
        setIsOpen(false);
        setSearchTerm('');
    };

    const handleStartCreate = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setIsCreating(true);
        setIsOpen(false);
        setEditingIndex(null);
        setNewConceptName('');
        setTimeout(() => {
            newConceptInputRef.current?.focus();
        }, 60);
    };

    const handleSaveNewConcept = async () => {
        const trimmed = newConceptName.trim();
        if (!trimmed) return;

        const exists = payrollConcepts.some(c => c.toLowerCase() === trimmed.toLowerCase());
        if (exists) {
            showToast('Ese concepto ya existe en la lista', 'warning');
            return;
        }

        setIsSaving(true);
        try {
            const nextList = [...payrollConcepts, trimmed];
            await updatePayrollConcepts(nextList);
            onSelectConcept(trimmed);
            setNewConceptName('');
            setIsCreating(false);
            setIsOpen(false);
            showToast(`Concepto "${trimmed}" agregado`, 'success');
        } catch {
            showToast('Error al guardar concepto', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleStartEdit = (idx: number, currentName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setIsCreating(false);
        setEditingIndex(idx);
        setEditingValue(currentName);
    };

    const handleSaveEdit = async (idx: number, e: React.MouseEvent) => {
        e.stopPropagation();
        const trimmed = editingValue.trim();
        if (!trimmed) return;

        const oldName = payrollConcepts[idx];
        if (oldName === trimmed) {
            setEditingIndex(null);
            return;
        }

        const exists = payrollConcepts.some((c, i) => i !== idx && c.toLowerCase() === trimmed.toLowerCase());
        if (exists) {
            showToast('Ese concepto ya existe en la lista', 'warning');
            return;
        }

        setIsSaving(true);
        try {
            const nextList = [...payrollConcepts];
            nextList[idx] = trimmed;
            await updatePayrollConcepts(nextList);

            if (selectedConcept === oldName) {
                onSelectConcept(trimmed);
            }
            setEditingIndex(null);
            showToast('Concepto actualizado', 'success');
        } catch {
            showToast('Error al actualizar concepto', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteConcept = async (idx: number, conceptName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (payrollConcepts.length <= 1) {
            showToast('Debes mantener al menos un concepto en la lista', 'warning');
            return;
        }

        const confirmed = await confirmAction({
            title: '¿Eliminar concepto?',
            message: `¿Deseas eliminar "${conceptName}" de la lista de conceptos de nómina?`,
            confirmText: 'Eliminar',
            variant: 'danger'
        });

        if (!confirmed) return;

        setIsSaving(true);
        try {
            const nextList = payrollConcepts.filter((_, i) => i !== idx);
            await updatePayrollConcepts(nextList);

            if (selectedConcept === conceptName) {
                onSelectConcept(nextList[0] || '');
            }
            showToast(`Concepto "${conceptName}" eliminado`, 'success');
        } catch {
            showToast('Error al eliminar concepto', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div ref={dropdownRef} className="relative w-full">
            {/* Encabezado en la misma línea: "CONCEPTO DEL PAGO *" a la izquierda y "+ Nuevo" a la derecha */}
            {showLabel && (
                <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-[0.12em]">
                        {label} {required && <span className="text-status-error text-red-500">*</span>}
                    </label>
                    <button
                        type="button"
                        onClick={handleStartCreate}
                        className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                    >
                        <span className="material-symbols-outlined text-sm">add_circle</span>
                        <span>Crear</span>
                    </button>
                </div>
            )}

            {/* Formulario rápido para crear nuevo concepto (afuera del dropdown, al pie de "Crear" y encima de "Elegir") */}
            {isCreating && (
                <div className="mb-2 p-2.5 bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl space-y-2 animate-fadeIn shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-400 tracking-wider">
                            Nuevo concepto
                        </span>
                        <button
                            type="button"
                            onClick={() => setIsCreating(false)}
                            className="size-6 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-emerald-100/60 dark:hover:bg-emerald-900/60 flex items-center justify-center transition-colors cursor-pointer"
                            aria-label="Cancelar creación"
                        >
                            <span className="material-symbols-outlined text-base">close</span>
                        </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <input
                            ref={newConceptInputRef}
                            type="text"
                            value={newConceptName}
                            onChange={e => setNewConceptName(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveNewConcept();
                                if (e.key === 'Escape') setIsCreating(false);
                            }}
                            placeholder="Ej: Bono, Propina, Viáticos..."
                            className="flex-1 min-w-0 h-9 px-3 bg-white dark:bg-gray-900 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs font-bold text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500 uppercase"
                            autoFocus
                        />
                        <button
                            type="button"
                            onClick={handleSaveNewConcept}
                            disabled={isSaving || !newConceptName.trim()}
                            className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-sm">check</span>
                            <span>Guardar</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Botón trigger del dropdown */}
            <button
                type="button"
                onClick={handleToggleOpen}
                className={`w-full h-12 px-4 rounded-2xl border flex items-center justify-between text-left transition-all ${
                    error
                        ? 'border-red-500 bg-red-50/50 dark:bg-red-950/20 text-red-900 dark:text-red-300'
                        : isOpen
                        ? 'border-emerald-500 bg-white dark:bg-gray-800 shadow-sm'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-black/20 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
            >
                <div className="flex items-center gap-2.5 min-w-0">
                    <span className="material-symbols-outlined text-gray-400 text-xl shrink-0">
                        category
                    </span>
                    <span className={`text-xs truncate tracking-wider ${
                        selectedConcept
                            ? 'font-black uppercase text-gray-900 dark:text-white'
                            : 'font-bold normal-case text-gray-400 dark:text-gray-500'
                    }`}>
                        {selectedConcept || placeholder}
                    </span>
                </div>
                <span className="material-symbols-outlined text-gray-400 text-xl shrink-0 transition-transform duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                    expand_more
                </span>
            </button>

            {/* Menú flotante del Dropdown */}
            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-50 p-2.5 space-y-2 animate-fadeIn">
                    {/* Buscador de conceptos */}
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg pointer-events-none">
                            search
                        </span>
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Buscar concepto..."
                            className="w-full h-10 pl-9 pr-8 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:border-emerald-500 rounded-xl outline-none text-xs font-bold text-gray-800 dark:text-white transition-all placeholder:text-gray-400"
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 size-5 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                aria-label="Limpiar búsqueda"
                            >
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                        )}
                    </div>

                    {/* Listado de conceptos existentes */}
                    <div className="max-h-[50vh] sm:max-h-[380px] overflow-y-auto custom-scrollbar space-y-1 pr-0.5">
                        {filteredConcepts.length === 0 ? (
                            <div className="py-6 text-center space-y-2">
                                <span className="material-symbols-outlined text-3xl text-gray-300 dark:text-gray-600">search_off</span>
                                <p className="text-xs text-gray-400 font-bold">No se encontró &quot;{searchTerm}&quot;</p>
                                {!isCreating && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsCreating(true);
                                            setIsOpen(false);
                                            setNewConceptName(searchTerm);
                                            setTimeout(() => newConceptInputRef.current?.focus(), 60);
                                        }}
                                        className="text-xs font-black text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                                    >
                                        <span className="material-symbols-outlined text-sm">add_circle</span>
                                        <span>Crear como nuevo concepto</span>
                                    </button>
                                )}
                            </div>
                        ) : (
                            filteredConcepts.map(concept => {
                                const originalIdx = payrollConcepts.findIndex(c => c === concept);
                                const isSelected = selectedConcept.toLowerCase() === concept.toLowerCase();
                                const isEditing = editingIndex === originalIdx;

                                if (isEditing) {
                                    return (
                                        <div
                                            key={concept + originalIdx}
                                            className="p-1.5 rounded-xl bg-gray-50 dark:bg-gray-700/60 flex items-center gap-1.5"
                                            onClick={e => e.stopPropagation()}
                                        >
                                            <input
                                                type="text"
                                                value={editingValue}
                                                onChange={e => setEditingValue(e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') handleSaveEdit(originalIdx, e as any);
                                                    if (e.key === 'Escape') setEditingIndex(null);
                                                }}
                                                className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-emerald-500 bg-white dark:bg-gray-800 text-xs font-bold text-gray-900 dark:text-white outline-none"
                                                autoFocus
                                            />
                                            <button
                                                type="button"
                                                onClick={e => handleSaveEdit(originalIdx, e)}
                                                disabled={isSaving || !editingValue.trim()}
                                                className="size-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition-colors shrink-0"
                                                title="Guardar nombre"
                                            >
                                                <span className="material-symbols-outlined text-base">check</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    setEditingIndex(null);
                                                }}
                                                className="size-8 rounded-lg text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center transition-colors shrink-0"
                                                title="Cancelar"
                                            >
                                                <span className="material-symbols-outlined text-base">close</span>
                                            </button>
                                        </div>
                                    );
                                }

                                return (
                                    <div
                                        key={concept + originalIdx}
                                        onClick={() => handleSelect(concept)}
                                        className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 cursor-pointer transition-colors group ${
                                            isSelected
                                                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 font-black'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-200 font-bold'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={`material-symbols-outlined text-sm ${isSelected ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
                                                {isSelected ? 'check_circle' : 'radio_button_unchecked'}
                                            </span>
                                            <span className="text-xs uppercase tracking-wider truncate">
                                                {concept}
                                            </span>
                                        </div>

                                        {/* Botones de acción: Editar y Eliminar */}
                                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 shrink-0">
                                            <button
                                                type="button"
                                                onClick={e => handleStartEdit(originalIdx, concept, e)}
                                                className="size-7 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center justify-center transition-colors"
                                                title="Editar nombre del concepto"
                                            >
                                                <span className="material-symbols-outlined text-sm">edit</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={e => handleDeleteConcept(originalIdx, concept, e)}
                                                className="size-7 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center justify-center transition-colors"
                                                title="Eliminar concepto"
                                            >
                                                <span className="material-symbols-outlined text-sm">delete</span>
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
