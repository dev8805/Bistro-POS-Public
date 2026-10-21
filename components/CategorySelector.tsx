import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirmDialog } from '../context/ConfirmDialogContext';

export interface CategoryItem {
    id: string;
    name: string;
    color?: string;
}

export interface CategorySelectorProps {
    value: string; // category_id
    onChange: (categoryId: string) => void;
    error?: boolean;
    placeholder?: string;
    required?: boolean;
    initialCategories?: CategoryItem[];
    onCategoriesChange?: (categories: CategoryItem[]) => void;
    labelClassName?: string;
    label?: string;
    hideLabel?: boolean;
    ariaLabel?: string;
    id?: string;
    containerClassName?: string;
    triggerClassName?: string;
    createButtonClassName?: string;
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({
    value,
    onChange,
    error,
    placeholder,
    required,
    initialCategories,
    onCategoriesChange,
    labelClassName,
    label,
    hideLabel = false,
    ariaLabel,
    id,
    containerClassName,
    triggerClassName,
    createButtonClassName,
}) => {
    const { profile } = useAuth();
    const { showToast } = useToast();
    const { confirmAction } = useConfirmDialog();
    const [categories, setCategories] = useState<CategoryItem[]>(initialCategories || []);
    const [isCreating, setIsCreating] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [loading, setLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const editInputRef = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const filteredCategories = useMemo(() => {
        if (!searchQuery.trim()) return categories;
        return categories.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [categories, searchQuery]);

    useEffect(() => {
        if (initialCategories && initialCategories.length > 0) {
            setCategories(prev => {
                if (prev.length === 0) return initialCategories;
                const prevIds = new Set(prev.map(c => c.id));
                const newItems = initialCategories.filter(c => !prevIds.has(c.id));
                if (newItems.length > 0) {
                    return [...prev, ...newItems].sort((a, b) => a.name.localeCompare(b.name));
                }
                return prev;
            });
        }
    }, [initialCategories]);

    useEffect(() => {
        if (profile?.business_id) {
            fetchCategories();
        }
    }, [profile?.business_id]);

    useEffect(() => {
        if (isCreating && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isCreating]);

    // Click outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const fetchCategories = async () => {
        if (!profile?.business_id) return;
        try {
            const { data, error } = await supabase
                .from('categories')
                .select('id, name, color')
                .eq('business_id', profile.business_id)
                .eq('is_active', true)
                .order('name');

            if (data && data.length > 0) {
                setCategories(data);
                onCategoriesChange?.(data);
            }
        } catch (err) {
            console.error('Error fetching categories:', err);
        }
    };

    const handleCreateCategory = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!newCategoryName.trim()) return;

        setLoading(true);
        try {
            let createdCat: CategoryItem | null = null;
            if (profile?.business_id) {
                const { data, error } = await supabase
                    .from('categories')
                    .insert([{
                        business_id: profile.business_id,
                        name: newCategoryName.trim(),
                        color: '#6B7280',
                        is_active: true
                    }])
                    .select()
                    .single();

                if (error) throw error;
                createdCat = data;
            } else {
                // Fallback si no hay business_id en sesión activa / mock
                createdCat = {
                    id: `cat-${Date.now()}`,
                    name: newCategoryName.trim(),
                    color: '#6B7280'
                };
            }

            if (createdCat) {
                const nextCats = [...categories, createdCat].sort((a, b) => a.name.localeCompare(b.name));
                setCategories(nextCats);
                onCategoriesChange?.(nextCats);
                onChange(createdCat.id);
                setIsCreating(false);
                setNewCategoryName('');
                showToast('Categoría creada exitosamente', 'success');
            }
        } catch (err) {
            console.error('Error creating category:', err);
            showToast('Error al crear categoría', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteCategory = async (e: React.MouseEvent, category: CategoryItem) => {
        e.stopPropagation();

        const confirmed = await confirmAction({
            title: `¿Eliminar la categoría "${category.name}"?`,
            message: 'Esta acción no se puede deshacer y podría afectar productos existentes.',
            confirmText: 'Eliminar',
            variant: 'danger'
        });

        if (confirmed) {
            try {
                if (profile?.business_id) {
                    const { error } = await supabase
                        .from('categories')
                        .delete()
                        .eq('id', category.id);

                    if (error) {
                        if (error.code === '23503') {
                            showToast('No se puede eliminar: Hay productos asociados a esta categoría', 'error');
                            return;
                        }
                        throw error;
                    }
                }

                showToast('Categoría eliminada', 'success');
                const nextCats = categories.filter(c => c.id !== category.id);
                setCategories(nextCats);
                onCategoriesChange?.(nextCats);

                if (value === category.id) {
                    onChange('');
                }
            } catch (err) {
                console.error('Error deleting category:', err);
                showToast('Error al eliminar categoría', 'error');
            }
        }
    };

    const handleStartEdit = (e: React.MouseEvent, cat: CategoryItem) => {
        e.stopPropagation();
        setEditingCategoryId(cat.id);
        setEditingName(cat.name);
        setTimeout(() => editInputRef.current?.focus(), 50);
    };

    const handleSaveEdit = async () => {
        if (!editingCategoryId || !editingName.trim()) {
            setEditingCategoryId(null);
            return;
        }
        const trimmed = editingName.trim();
        try {
            if (profile?.business_id) {
                const { error } = await supabase
                    .from('categories')
                    .update({ name: trimmed })
                    .eq('id', editingCategoryId);
                if (error) throw error;
            }
            const nextCats = categories.map(c => c.id === editingCategoryId ? { ...c, name: trimmed } : c);
            setCategories(nextCats);
            onCategoriesChange?.(nextCats);
            showToast('Categoría actualizada', 'success');
        } catch (err) {
            console.error('Error updating category:', err);
            showToast('Error al actualizar categoría', 'error');
        } finally {
            setEditingCategoryId(null);
        }
    };

    const selectedCategory = categories.find(c => c.id === value);

    return (
        <div className={containerClassName || "space-y-2 relative"} ref={dropdownRef}>
            {!hideLabel && (
                <label
                    htmlFor={id || undefined}
                    className={labelClassName || "block text-sm font-medium text-gray-700 dark:text-gray-300"}
                >
                    {label || 'Categoría'} {required && <span className="text-red-500">*</span>}
                </label>
            )}

            {!isCreating ? (
                <>
                <div className="flex gap-2">
                    <div className="relative flex-1 min-w-0">
                        {/* Custom Dropdown Trigger */}
                        <div
                            role="button"
                            aria-label="Abrir selector de categorías"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    const willOpen = !isOpen;
                                    setIsOpen(willOpen);
                                    if (willOpen) {
                                        setSearchQuery('');
                                        setTimeout(() => {
                                            searchInputRef.current?.focus();
                                        }, 50);
                                    }
                                }
                            }}
                            onClick={() => {
                                const willOpen = !isOpen;
                                setIsOpen(willOpen);
                                if (willOpen) {
                                    setSearchQuery('');
                                    setTimeout(() => {
                                        dropdownRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        if (window.innerWidth >= 768) {
                                            searchInputRef.current?.focus();
                                        }
                                    }, 50);
                                }
                            }}
                            className={triggerClassName || `w-full h-11 pl-4 pr-10 flex items-center text-sm sm:text-base bg-white dark:bg-gray-900 border ${error ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} rounded-lg focus:ring-1 focus:ring-primary focus:border-primary transition-colors cursor-pointer dark:text-white select-none relative`}
                        >
                            <span className={`truncate ${!selectedCategory ? 'text-gray-500 dark:text-gray-400' : ''}`}>
                                {selectedCategory ? selectedCategory.name : (placeholder || 'Seleccionar...')}
                            </span>
                            <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none text-gray-500">
                                <span className="material-symbols-outlined text-xl">expand_more</span>
                            </div>
                        </div>
                    </div>

                    {/* Botón de crear nueva categoría */}
                    <button
                        type="button"
                        onClick={() => {
                            setIsCreating(true);
                            setIsOpen(false);
                        }}
                        className={createButtonClassName || "h-11 px-3 flex items-center justify-center gap-1 rounded-lg bg-primary hover:bg-primary-hover text-[#102218] font-bold transition-colors shrink-0 text-sm"}
                        title="Crear categoría"
                    >
                        <span className="material-symbols-outlined text-lg">add</span>
                        <span>Crear</span>
                    </button>
                </div>

                {/* Custom Dropdown Menu — full width, outside flex */}
                {isOpen && (
                    <div className="absolute z-50 left-0 w-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden animate-[fadeIn_0.1s_ease-out]">
                        <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[16px]">search</span>
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Buscar categoría..."
                                    className="w-full h-8 pl-8 pr-3 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 dark:text-white placeholder:text-gray-400"
                                />
                            </div>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto">
                            {filteredCategories.length === 0 ? (
                                <div className="p-3 text-sm text-gray-500 text-center italic">
                                    {categories.length === 0 ? 'No hay categorías disponibles' : 'No encontrado'}
                                </div>
                            ) : (
                                filteredCategories.map(cat => (
                                    <div
                                        key={cat.id}
                                        onClick={() => {
                                            if (editingCategoryId !== cat.id) {
                                                onChange(cat.id);
                                                setIsOpen(false);
                                                setSearchQuery('');
                                            }
                                        }}
                                        className={`flex items-center justify-between px-3 py-2.5 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-0 ${value === cat.id ? 'bg-primary/5 text-primary font-medium' : 'text-gray-700 dark:text-gray-200'}`}
                                    >
                                        {editingCategoryId === cat.id ? (
                                            <input
                                                ref={editInputRef}
                                                className="flex-1 mr-2 h-8 px-2 text-sm bg-white dark:bg-gray-800 border border-primary rounded outline-none"
                                                value={editingName}
                                                onChange={(e) => setEditingName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleSaveEdit();
                                                    if (e.key === 'Escape') setEditingCategoryId(null);
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        ) : (
                                            <span className="flex-1 mr-2">{cat.name}</span>
                                        )}
                                        <div className="flex items-center gap-0.5 flex-shrink-0">
                                            {editingCategoryId === cat.id ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); handleSaveEdit(); }}
                                                        className="p-1 rounded-md text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all"
                                                        title="Confirmar"
                                                    >
                                                        <span className="material-symbols-outlined text-base">check</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); setEditingCategoryId(null); }}
                                                        className="p-1 rounded-md text-gray-400 hover:text-red-500 transition-all"
                                                        title="Cancelar"
                                                    >
                                                        <span className="material-symbols-outlined text-base">close</span>
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleStartEdit(e, cat)}
                                                        className="p-1 rounded-md text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                                                        title="Editar categoría"
                                                    >
                                                        <span className="material-symbols-outlined text-base">edit</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleDeleteCategory(e, cat)}
                                                        className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                                        title="Eliminar categoría"
                                                    >
                                                        <span className="material-symbols-outlined text-base">delete</span>
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
                </>
            ) : (
                <div className="animate-[fadeIn_0.2s_ease-out]">
                    <div className="flex gap-2 items-center">
                        <input
                            ref={inputRef}
                            type="text"
                            className="min-w-0 flex-1 h-11 px-3 text-sm bg-white dark:bg-gray-900 border border-primary ring-1 ring-primary/20 rounded-lg dark:text-white outline-none"
                            placeholder="Nueva categoría..."
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleCreateCategory();
                                }
                                if (e.key === 'Escape') {
                                    setIsCreating(false);
                                    setNewCategoryName('');
                                }
                            }}
                        />
                        <button
                            type="button"
                            onClick={(e) => handleCreateCategory(e)}
                            disabled={loading || !newCategoryName.trim()}
                            className="h-11 px-3 bg-primary hover:bg-primary-hover text-[#102218] rounded-lg text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                        >
                            {loading ? '...' : 'Guardar'}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setIsCreating(false);
                                setNewCategoryName('');
                            }}
                            className="h-11 w-9 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 transition-colors shrink-0"
                        >
                            <span className="material-symbols-outlined text-xl">close</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Select accesible oculto para formularios y accesibilidad / pruebas */}
            <select
                id={id}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                aria-label={ariaLabel || label || 'Categoría'}
                tabIndex={-1}
                className="sr-only"
            >
                <option value="">{placeholder || 'Elige una categoría'}</option>
                {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                        {c.name}
                    </option>
                ))}
            </select>
        </div>
    );
};
