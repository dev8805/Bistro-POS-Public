import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Category } from '../hooks/useProducts';
import { useToast } from '../context/ToastContext';

interface CategorySettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    category: Category | null;
    onSuccess: () => void;
}

export const CategorySettingsModal: React.FC<CategorySettingsModalProps> = ({
    isOpen,
    onClose,
    category,
    onSuccess
}) => {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    
    const [optimalMin, setOptimalMin] = useState<number | ''>(7);
    const [optimalMax, setOptimalMax] = useState<number | ''>(12);
    const [alertDays, setAlertDays] = useState<number | ''>(3);

    useEffect(() => {
        if (isOpen && category) {
            setOptimalMin(category.optimal_min ?? 7);
            setOptimalMax(category.optimal_max ?? 12);
            setAlertDays(category.alert_days ?? 3);
        }
    }, [isOpen, category]);

    if (!isOpen || !category) return null;

    const handleSave = async () => {
        const minVal = Number(optimalMin);
        const maxVal = Number(optimalMax);
        const alertVal = Number(alertDays);

        if (minVal > maxVal) {
            showToast('El comienzo del rango óptimo no puede ser mayor que el final', 'error');
            return;
        }
        if (alertVal >= minVal) {
            showToast('Los días de alerta crítica deberían ser menores al rango óptimo', 'warning');
        }

        setLoading(true);
        try {
            const { error } = await supabase
                .from('categories')
                .update({
                    optimal_min: minVal,
                    optimal_max: maxVal,
                    alert_days: alertVal
                })
                .eq('id', category.id);

            if (error) throw error;
            
            showToast('Configuración guardada exitosamente', 'success');
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Error actualizando categoría:', error);
            showToast('Error al guardar: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
            <div 
                className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-[slideUp_0.2s_ease-out]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-surface-light dark:bg-surface-dark">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">settings</span>
                        Configurar Rotación
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        Categoría: <span className="font-bold text-gray-900 dark:text-white ml-1">{category.name}</span>
                    </p>

                    {/* Rango Optimo */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                            <span className="material-symbols-outlined text-lg">check_circle</span>
                            Rango de Inventario Óptimo (Días)
                        </h3>
                        <div className="flex gap-4 items-center">
                            <div className="flex-1">
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Desde (Mínimo)</label>
                                <input 
                                    type="number" 
                                    min="1"
                                    value={optimalMin} 
                                    onChange={(e) => setOptimalMin(e.target.value === '' ? '' : Number(e.target.value))}
                                    onWheel={(e) => e.currentTarget.blur()}
                                    className="w-full h-10 px-3 bg-white dark:bg-gray-800 border border-emerald-200 dark:border-emerald-800 rounded-lg text-center font-bold text-gray-900 dark:text-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                                />
                            </div>
                            <span className="text-gray-400 pt-5">-</span>
                            <div className="flex-1">
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Hasta (Máximo)</label>
                                <input 
                                    type="number" 
                                    min="1"
                                    value={optimalMax} 
                                    onChange={(e) => setOptimalMax(e.target.value === '' ? '' : Number(e.target.value))}
                                    onWheel={(e) => e.currentTarget.blur()}
                                    className="w-full h-10 px-3 bg-white dark:bg-gray-800 border border-emerald-200 dark:border-emerald-800 rounded-lg text-center font-bold text-gray-900 dark:text-white focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                                />
                            </div>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed italic">
                            * Por debajo de {optimalMin || 0} días se sugerirá <b>Reordenar</b> y por encima de {optimalMax || 0} días será <b>Rotación Lenta</b>.
                        </p>
                    </div>

                    <hr className="border-gray-100 dark:border-gray-800" />

                    {/* Alerta Crítica */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                            <span className="material-symbols-outlined text-lg">error</span>
                            Alerta Crítica (Avisarme al límite)
                        </h3>
                        <div className="flex gap-4 items-center justify-between">
                            <label className="text-sm text-gray-600 dark:text-gray-300">Días restantes:</label>
                            <input 
                                type="number" 
                                min="1"
                                value={alertDays} 
                                onChange={(e) => setAlertDays(e.target.value === '' ? '' : Number(e.target.value))}
                                onWheel={(e) => e.currentTarget.blur()}
                                className="w-24 h-10 px-3 bg-white dark:bg-gray-800 border border-rose-200 dark:border-rose-800 rounded-lg text-center font-bold text-rose-600 dark:text-rose-400 focus:ring-1 focus:ring-rose-500 focus:border-rose-500 outline-none"
                            />
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed italic">
                            * Te notificaremos con urgencia si un producto de esta categoría va a durar <b>{alertDays || 0} días o menos</b>.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3 z-10 relative">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        disabled={loading}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        className="px-6 py-2 text-sm font-bold text-[#102218] bg-primary hover:bg-primary-hover rounded-xl flex items-center gap-2 shadow-sm transition-all active:scale-95 border border-primary"
                        disabled={loading}
                    >
                        {loading && <div className="size-4 border-2 border-[#102218]/30 border-t-[#102218] rounded-full animate-spin"></div>}
                        <span>{loading ? 'Guardando...' : 'Guardar Configuración'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
