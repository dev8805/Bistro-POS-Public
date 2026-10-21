import React, { useState, useEffect, useMemo } from 'react';
import { useSuppliers, Supplier } from '../hooks/useSuppliers';
import { useToast } from '../context/ToastContext';

interface SupplierSettingsProduct {
    id: string;
    name: string;
    barcode?: string | null;
}

interface SupplierSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    supplier: Supplier | null;
    onSuccess: () => void;
    products: SupplierSettingsProduct[];
    addLink: (supplierId: string, productId: string) => Promise<void>;
}

export const SupplierSettingsModal: React.FC<SupplierSettingsModalProps> = ({
    isOpen,
    onClose,
    supplier,
    onSuccess,
    products,
    addLink
}) => {
    const { showToast } = useToast();
    const { updateSupplier } = useSuppliers();
    const [loading, setLoading] = useState(false);

    // Threshold fields
    const [optimalMin, setOptimalMin] = useState<number | ''>(7);
    const [optimalMax, setOptimalMax] = useState<number | ''>(12);
    const [alertDays, setAlertDays] = useState<number | ''>(3);

    // Product search
    const [searchQuery, setSearchQuery] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [addingProductId, setAddingProductId] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && supplier) {
            setOptimalMin(supplier.optimal_min ?? 7);
            setOptimalMax(supplier.optimal_max ?? 12);
            setAlertDays(supplier.alert_days ?? 3);
            setSearchQuery('');
            setShowDropdown(false);
        }
    }, [isOpen, supplier]);

    // Validation
    const minVal = Number(optimalMin) || 0;
    const maxVal = Number(optimalMax) || 0;
    const alertVal = Number(alertDays) || 0;

    const errorMinMax = optimalMin !== '' && optimalMax !== '' && minVal > maxVal;
    const errorAlert = alertDays !== '' && alertVal < 1;
    const hasErrors = errorMinMax || errorAlert;

    // Filtered products for search
    const searchResults = useMemo(() => {
        if (!searchQuery.trim()) return [];
        const q = searchQuery.trim().toLowerCase();
        return products
            .filter(p =>
                p.name.toLowerCase().includes(q) ||
                (p.barcode && p.barcode.toLowerCase().includes(q))
            )
            .slice(0, 5);
    }, [searchQuery, products]);

    if (!isOpen || !supplier) return null;

    const handleSave = async () => {
        if (hasErrors) return;

        setLoading(true);
        try {
            await updateSupplier(supplier.id, {
                optimal_min: minVal,
                optimal_max: maxVal,
                alert_days: alertVal
            });
            showToast('Configuración guardada exitosamente', 'success');
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Error actualizando proveedor:', error);
            showToast('Error al guardar: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleAddProduct = async (product: SupplierSettingsProduct) => {
        setAddingProductId(product.id);
        try {
            await addLink(supplier.id, product.id);
            showToast(`"${product.name}" vinculado a ${supplier.name}`, 'success');
            setSearchQuery('');
            setShowDropdown(false);
        } catch (error: any) {
            console.error('Error vinculando producto:', error);
            showToast('Error al vincular: ' + error.message, 'error');
        } finally {
            setAddingProductId(null);
        }
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchQuery(e.target.value);
        setShowDropdown(e.target.value.trim().length > 0);
    };

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            setShowDropdown(false);
            setSearchQuery('');
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
            <div
                className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-[slideUp_0.2s_ease-out] max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-surface-light dark:bg-surface-dark shrink-0">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">settings</span>
                        Configurar Rotación
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 -mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors"
                        aria-label="Cerrar modal"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6 overflow-y-auto flex-1">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        Proveedor: <span className="font-bold text-gray-900 dark:text-white ml-1">{supplier.name}</span>
                    </p>

                    {/* Section 1: Rango Optimo */}
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
                                    aria-label="Días mínimos del rango óptimo"
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
                                    aria-label="Días máximos del rango óptimo"
                                />
                            </div>
                        </div>
                        {errorMinMax && (
                            <p className="text-xs text-red-500 font-medium">
                                El mínimo no puede ser mayor que el máximo.
                            </p>
                        )}
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
                                aria-label="Días de alerta crítica"
                            />
                        </div>
                        {errorAlert && (
                            <p className="text-xs text-red-500 font-medium">
                                El valor mínimo para alerta crítica es 1 día.
                            </p>
                        )}
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed italic">
                            * Te notificaremos con urgencia si un producto de este proveedor va a durar <b>{alertDays || 0} días o menos</b>.
                        </p>
                    </div>

                    <hr className="border-gray-100 dark:border-gray-800" />

                    {/* Section 2: Agregar productos */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                            <span className="material-symbols-outlined text-lg">add_circle</span>
                            Agregar productos
                        </h3>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                            Busca y vincula productos manualmente a este proveedor.
                        </p>
                        <div className="relative">
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={handleSearchChange}
                                    onKeyDown={handleSearchKeyDown}
                                    onFocus={() => searchQuery.trim() && setShowDropdown(true)}
                                    placeholder="Nombre o código de barras..."
                                    className="w-full h-10 pl-10 pr-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-1 focus:ring-amber-400 focus:border-amber-400 outline-none"
                                    aria-label="Buscar producto para vincular"
                                />
                            </div>

                            {/* Dropdown results */}
                            {showDropdown && searchResults.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 overflow-hidden">
                                    {searchResults.map((product) => (
                                        <button
                                            key={product.id}
                                            type="button"
                                            onClick={() => handleAddProduct(product)}
                                            disabled={addingProductId === product.id}
                                            className="w-full px-4 py-2.5 text-left hover:bg-amber-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-between gap-2 disabled:opacity-50"
                                            aria-label={`Vincular ${product.name}`}
                                        >
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                    {product.name}
                                                </p>
                                                {product.barcode && (
                                                    <p className="text-xs text-gray-400 truncate">{product.barcode}</p>
                                                )}
                                            </div>
                                            {addingProductId === product.id ? (
                                                <div className="size-4 border-2 border-gray-300 border-t-amber-500 rounded-full animate-spin shrink-0"></div>
                                            ) : (
                                                <span className="material-symbols-outlined text-amber-500 text-lg shrink-0">add</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {showDropdown && searchQuery.trim() && searchResults.length === 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 p-3">
                                    <p className="text-sm text-gray-500 text-center">No se encontraron productos</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3 shrink-0">
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
                        className="px-6 py-2 text-sm font-bold text-[#102218] bg-primary hover:bg-primary-hover rounded-xl flex items-center gap-2 shadow-sm transition-all active:scale-95 border border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={loading || hasErrors}
                    >
                        {loading && <div className="size-4 border-2 border-[#102218]/30 border-t-[#102218] rounded-full animate-spin"></div>}
                        <span>{loading ? 'Guardando...' : 'Guardar Configuración'}</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
