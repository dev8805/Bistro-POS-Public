import React, { useState, useRef, useEffect } from 'react';
import { useBusinessSettings } from '../../context/BusinessSettingsContext';
import { useConfirmDialog } from '../../context/ConfirmDialogContext';
import { useToast } from '../../context/ToastContext';

interface EmployeeRoleDropdownProps {
    selectedRole: string;
    onSelectRole: (role: string) => void;
    error?: boolean;
    label?: string;
    showLabel?: boolean;
    required?: boolean;
    placeholder?: string;
}

export const EmployeeRoleDropdown: React.FC<EmployeeRoleDropdownProps> = ({
    selectedRole,
    onSelectRole,
    error = false,
    label = 'CARGO / FUNCIÓN',
    showLabel = true,
    required = true,
    placeholder = 'Elegir',
}) => {
    const { employeeRoles = [], updateEmployeeRoles } = useBusinessSettings();
    const { confirmAction } = useConfirmDialog();
    const { showToast } = useToast();

    // Filtrar para asegurar que 'Otro' nunca esté en la lista
    const activeRoles = employeeRoles.filter(r => r && r.trim().toLowerCase() !== 'otro');

    const [isOpen, setIsOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');

    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [editingValue, setEditingValue] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const dropdownRef = useRef<HTMLDivElement>(null);
    const newRoleInputRef = useRef<HTMLInputElement>(null);

    // Cerrar al hacer clic fuera
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setIsCreating(false);
                setEditingIndex(null);
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
        setIsOpen(prev => !prev);
        setIsCreating(false);
        setEditingIndex(null);
    };

    const handleSelect = (role: string) => {
        onSelectRole(role);
        setIsOpen(false);
    };

    const handleStartCreate = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setIsCreating(true);
        setIsOpen(false);
        setEditingIndex(null);
        setNewRoleName('');
        setTimeout(() => newRoleInputRef.current?.focus(), 60);
    };

    const handleSaveNewRole = async () => {
        const trimmed = newRoleName.trim();
        if (!trimmed) return;

        if (trimmed.toLowerCase() === 'otro') {
            showToast('El cargo "Otro" no está permitido', 'warning');
            return;
        }

        const exists = activeRoles.some(r => r.toLowerCase() === trimmed.toLowerCase());
        if (exists) {
            showToast('Ese cargo o función ya existe en la lista', 'warning');
            return;
        }

        setIsSaving(true);
        try {
            const nextList = [...activeRoles, trimmed];
            await updateEmployeeRoles(nextList);
            onSelectRole(trimmed);
            setNewRoleName('');
            setIsCreating(false);
            setIsOpen(false);
            showToast(`Cargo "${trimmed}" guardado en la base de datos`, 'success');
        } catch {
            showToast('Error al guardar cargo en la base de datos', 'error');
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

        const oldName = activeRoles[idx];
        if (oldName === trimmed) {
            setEditingIndex(null);
            return;
        }

        if (trimmed.toLowerCase() === 'otro') {
            showToast('El cargo "Otro" no está permitido', 'warning');
            return;
        }

        const exists = activeRoles.some((r, i) => i !== idx && r.toLowerCase() === trimmed.toLowerCase());
        if (exists) {
            showToast('Ese cargo ya existe en la lista', 'warning');
            return;
        }

        setIsSaving(true);
        try {
            const nextList = [...activeRoles];
            nextList[idx] = trimmed;
            await updateEmployeeRoles(nextList);

            if (selectedRole === oldName) {
                onSelectRole(trimmed);
            }
            setEditingIndex(null);
            showToast('Cargo actualizado', 'success');
        } catch {
            showToast('Error al actualizar cargo', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteRole = async (idx: number, roleName: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (activeRoles.length <= 1) {
            showToast('Debes mantener al menos un cargo en la lista', 'warning');
            return;
        }

        const confirmed = await confirmAction({
            title: '¿Eliminar cargo / función?',
            message: `¿Deseas eliminar "${roleName}" de la lista de cargos?`,
            confirmText: 'Eliminar',
            variant: 'danger'
        });

        if (!confirmed) return;

        setIsSaving(true);
        try {
            const nextList = activeRoles.filter((_, i) => i !== idx);
            await updateEmployeeRoles(nextList);

            if (selectedRole === roleName) {
                onSelectRole('');
            }
            showToast(`Cargo "${roleName}" eliminado`, 'success');
        } catch {
            showToast('Error al eliminar cargo', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div ref={dropdownRef} className="relative w-full">
            {/* Encabezado: "CARGO / FUNCIÓN *" a la izquierda y "Crear" a la derecha */}
            {showLabel && (
                <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                        {label} {required && <span className="text-red-500">*</span>}
                    </label>
                    <button
                        type="button"
                        onClick={handleStartCreate}
                        className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-sm">add_circle</span>
                        <span>Crear</span>
                    </button>
                </div>
            )}

            {/* Formulario rápido para crear nuevo cargo (afuera del dropdown, al pie de "Crear" y encima de "Elegir") */}
            {isCreating && (
                <div className="mb-2 p-2.5 bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl space-y-2 animate-fadeIn shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-400 tracking-wider">
                            Nuevo Cargo / Función
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
                            ref={newRoleInputRef}
                            type="text"
                            value={newRoleName}
                            onChange={e => setNewRoleName(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveNewRole();
                                if (e.key === 'Escape') setIsCreating(false);
                            }}
                            placeholder="Ej: Pastelero, Bartender..."
                            className="flex-1 min-w-0 h-9 px-3 bg-white dark:bg-gray-900 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs font-bold text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
                            autoFocus
                        />
                        <button
                            type="button"
                            onClick={handleSaveNewRole}
                            disabled={isSaving || !newRoleName.trim()}
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
                tabIndex={0}
                aria-label="Seleccionar cargo o función"
                className={`w-full h-11 px-4 rounded-2xl border flex items-center justify-between text-left transition-all ${
                    error
                        ? 'border-red-500 bg-red-50/50 dark:bg-red-950/20 text-red-900 dark:text-red-300'
                        : isOpen
                        ? 'border-emerald-500 bg-white dark:bg-gray-800 shadow-sm'
                        : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
            >
                <div className="flex items-center gap-2.5 min-w-0">
                    <span className="material-symbols-outlined text-gray-400 text-lg shrink-0">
                        badge
                    </span>
                    <span className={`text-xs truncate tracking-wide ${
                        selectedRole
                            ? 'font-bold text-gray-900 dark:text-white'
                            : 'font-normal text-gray-400 dark:text-gray-500'
                    }`}>
                        {selectedRole || placeholder}
                    </span>
                </div>
                <span
                    className="material-symbols-outlined text-gray-400 text-lg shrink-0 transition-transform duration-200"
                    style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                    expand_more
                </span>
            </button>

            {/* Menú flotante del Dropdown */}
            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-50 p-2 space-y-1 animate-fadeIn">
                    {/* Listado de cargos existentes */}
                    <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-1 pr-0.5">
                        {activeRoles.map((role, idx) => {
                            const isSelected = selectedRole.toLowerCase() === role.toLowerCase();
                            const isEditing = editingIndex === idx;

                            if (isEditing) {
                                return (
                                    <div
                                        key={role + idx}
                                        className="p-1.5 rounded-xl bg-gray-50 dark:bg-gray-700/60 flex items-center gap-1.5"
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <input
                                            type="text"
                                            value={editingValue}
                                            onChange={e => setEditingValue(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') handleSaveEdit(idx, e as any);
                                                if (e.key === 'Escape') setEditingIndex(null);
                                            }}
                                            className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-emerald-500 bg-white dark:bg-gray-800 text-xs font-bold text-gray-900 dark:text-white outline-none"
                                            autoFocus
                                        />
                                        <button
                                            type="button"
                                            onClick={e => handleSaveEdit(idx, e)}
                                            disabled={isSaving || !editingValue.trim()}
                                            className="size-8 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center transition-colors shrink-0 cursor-pointer"
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
                                            className="size-8 rounded-lg text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                                            title="Cancelar"
                                        >
                                            <span className="material-symbols-outlined text-base">close</span>
                                        </button>
                                    </div>
                                );
                            }

                            return (
                                <div
                                    key={role + idx}
                                    onClick={() => handleSelect(role)}
                                    className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition-all ${
                                        isSelected
                                            ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold'
                                            : 'hover:bg-gray-100 dark:hover:bg-gray-700/60 text-gray-700 dark:text-gray-200 font-medium'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className={`material-symbols-outlined text-base ${
                                            isSelected ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'
                                        }`}>
                                            {isSelected ? 'check_circle' : 'work_outline'}
                                        </span>
                                        <span className="truncate">{role}</span>
                                    </div>

                                    {/* Acciones de edición rápida en hover */}
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            type="button"
                                            onClick={e => handleStartEdit(idx, role, e)}
                                            className="size-6 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center justify-center transition-colors"
                                            title="Editar nombre"
                                        >
                                            <span className="material-symbols-outlined text-xs">edit</span>
                                        </button>
                                        {activeRoles.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={e => handleDeleteRole(idx, role, e)}
                                                className="size-6 rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 text-gray-400 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center transition-colors"
                                                title="Eliminar cargo"
                                            >
                                                <span className="material-symbols-outlined text-xs">delete</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
