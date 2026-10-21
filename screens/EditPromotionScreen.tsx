import React, { useState, useMemo, useEffect } from 'react';
import { Screen } from '../types';
import { useProducts, Product } from '../hooks/useProducts';
import { usePromotions, Promotion } from '../hooks/usePromotions';
import { useImageUpload } from '../hooks/useImageUpload';
import { ImageCropper } from '../components/ImageCropper';
import { InAppCamera } from '../components/InAppCamera';
import { useToast } from '../context/ToastContext';
import { formatCurrency } from '../lib/formatters';
import { AppButton } from '../components/ui/AppButton';

interface SelectedProduct {
    product: Product;
    promoPrice: string;
}

interface EditPromotionScreenProps {
    onNavigate: (screen: Screen) => void;
    promotion: Promotion;
}

export const EditPromotionScreen: React.FC<EditPromotionScreenProps> = ({ onNavigate, promotion }) => {
    const { products: allProducts, loading: productsLoading } = useProducts();
    const { updatePromotion } = usePromotions();
    const { showToast } = useToast();

    const {
        imageUrl,
        uploading: uploadingImage,
        handleImageSelect,
        handlePaste,
        handlePasteClick,
        previewUrl,
        statusText,
        showCropper,
        cropperImageSrc,
        onCropComplete,
        onCropCancel,
        deleteImage,
        markAsSaved,
        triggerCamera,
        triggerGallery,
        showInAppCamera,
        onCameraCapture,
        onCameraClose
    } = useImageUpload(promotion.image_url || null);

    const [promoName, setPromoName] = useState(promotion.name);
    const [description, setDescription] = useState(promotion.description || '');
    const [selectedProducts, setSelectedProducts] = useState<SelectedProduct[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [showProductPicker, setShowProductPicker] = useState(false);
    const [saving, setSaving] = useState(false);
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
        if (allProducts.length > 0 && promotion.items && !initialized) {
            const mapped: SelectedProduct[] = promotion.items
                .map(item => {
                    const product = allProducts.find(p => p.id === item.product_id);
                    if (!product) return null;
                    return {
                        product,
                        promoPrice: formatNumber(item.promo_price.toString()),
                    };
                })
                .filter(Boolean) as SelectedProduct[];
            setSelectedProducts(mapped);
            setInitialized(true);
        }
    }, [allProducts, promotion.items, initialized]);

    useEffect(() => {
        const pasteListener = (e: ClipboardEvent) => handlePaste(e);
        window.addEventListener('paste', pasteListener);
        return () => window.removeEventListener('paste', pasteListener);
    }, [handlePaste]);

    const activeProducts = useMemo(() =>
        allProducts.filter(p => p.is_active),
        [allProducts]
    );

    const filteredPickerProducts = useMemo(() => {
        const selectedIds = new Set(selectedProducts.map(sp => sp.product.id));
        return activeProducts.filter(p =>
            !selectedIds.has(p.id) &&
            p.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [activeProducts, selectedProducts, searchQuery]);

    const totalPrice = useMemo(() =>
        selectedProducts.reduce((sum, sp) => {
            const price = parseFloat(sp.promoPrice.replace(/\./g, '')) || 0;
            return sum + price;
        }, 0),
        [selectedProducts]
    );

    const totalCost = useMemo(() =>
        selectedProducts.reduce((sum, sp) => sum + (sp.product.cost || 0), 0),
        [selectedProducts]
    );

    const formatNumber = (value: string) => {
        if (!value) return '';
        const rawValue = value.replace(/\D/g, '');
        return rawValue.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    };

    const parseNumber = (value: string) => parseFloat(value.replace(/\./g, '')) || 0;

    const handleAddProduct = (product: Product) => {
        setSelectedProducts(prev => [...prev, {
            product,
            promoPrice: formatNumber(product.price.toString()),
        }]);
        setSearchQuery('');
        setShowProductPicker(false);
    };

    const handleRemoveProduct = (productId: string) => {
        setSelectedProducts(prev => prev.filter(sp => sp.product.id !== productId));
    };

    const handlePriceChange = (productId: string, value: string) => {
        setSelectedProducts(prev => prev.map(sp =>
            sp.product.id === productId ? { ...sp, promoPrice: formatNumber(value) } : sp
        ));
    };

    const handleBack = () => onNavigate(Screen.PRODUCTS);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!promoName.trim()) {
            showToast('Ingrese un nombre para la promoción', 'warning');
            return;
        }
        if (selectedProducts.length < 2) {
            showToast('Seleccione al menos 2 productos', 'warning');
            return;
        }

        setSaving(true);
        try {
            const items = selectedProducts.map(sp => ({
                product_id: sp.product.id,
                promo_price: parseNumber(sp.promoPrice),
            }));

            await updatePromotion(promotion.id, promoName.trim(), description.trim(), imageUrl, items);
            markAsSaved();
            showToast('Promoción actualizada', 'success');
            onNavigate(Screen.PRODUCTS);
        } catch (error: any) {
            console.error('Error updating promotion:', error);
            const isPerm = error?.code === '42501' || /row-level security|permission denied/i.test(error?.message || '');
            showToast(isPerm ? 'No tienes permiso para crear o editar promociones.' : 'No se pudo actualizar la promoción. Intenta de nuevo.', isPerm ? 'warning' : 'error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex justify-end">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]" role="button" tabIndex={-1} onClick={handleBack} onKeyDown={(e) => e.key === 'Escape' && handleBack()} aria-label="Cerrar"></div>
            <div className="relative w-full max-w-md h-full bg-background-light dark:bg-background-dark shadow-2xl flex flex-col animate-[slideInRight_0.3s_ease-out] border-l border-gray-200 dark:border-gray-800">
            <header className="h-16 shrink-0 bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-800 px-6 flex items-center justify-between z-10">
                <div className="flex items-center gap-4">
                    <h1 className="text-xl font-semibold text-text-main dark:text-white tracking-tight flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-2xl">loyalty</span>
                        Editar Promoción
                    </h1>
                </div>
                <button
                    type="button"
                    onClick={handleBack}
                    className="p-2 rounded-xl text-text-secondary hover:text-text-main hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-center"
                >
                    <span className="material-symbols-outlined">close</span>
                </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 lg:p-6 pb-4 custom-scrollbar bg-gray-50 dark:bg-background-dark">
                <form className="flex flex-col gap-6 content-start" onSubmit={handleSave}>

                    {/* COLUMNA IZQUIERDA */}
                    <div className="flex flex-col gap-6 space-y-6">

                        {/* Info básica */}
                        <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-4 sm:p-6">
                            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-lg text-primary">edit</span>
                                Información de la Promoción
                            </h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                        Nombre <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        className="w-full h-11 px-4 text-base bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary transition-colors dark:text-white outline-none"
                                        type="text"
                                        value={promoName}
                                        onChange={(e) => setPromoName(e.target.value)}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                        Descripción (opcional)
                                    </label>
                                    <input
                                        className="w-full h-11 px-4 text-base bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary transition-colors dark:text-white outline-none"
                                        type="text"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Selector de productos */}
                        <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-4 sm:p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-lg text-primary">shopping_basket</span>
                                    Productos ({selectedProducts.length})
                                </h2>
                                <button
                                    type="button"
                                    onClick={() => setShowProductPicker(true)}
                                    className="h-9 px-3 bg-primary hover:bg-primary-hover text-[#102218] rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                                    aria-label="Agregar producto a la promoción"
                                    tabIndex={0}
                                >
                                    <span className="material-symbols-outlined text-lg">add</span>
                                    Agregar
                                </button>
                            </div>

                            {selectedProducts.length === 0 ? (
                                <div className="py-10 text-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                                    <span className="material-symbols-outlined text-5xl text-gray-300 dark:text-gray-600 mb-2 block">add_shopping_cart</span>
                                    <p className="text-sm text-gray-400 dark:text-gray-500">Agrega al menos 2 productos</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {selectedProducts.map((sp) => {
                                        const originalPrice = sp.product.price || 0;
                                        const currentPromoPrice = parseNumber(sp.promoPrice);
                                        const discount = originalPrice > 0 ? Math.round(((originalPrice - currentPromoPrice) / originalPrice) * 100) : 0;

                                        return (
                                            <div key={sp.product.id} className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-gray-100 dark:border-gray-700 group hover:border-primary/30 transition-colors">
                                                {/* Fila 1: Nombre + X */}
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                        {/* Imagen solo desktop */}
                                                        <div className="hidden lg:flex size-10 rounded-lg bg-white dark:bg-gray-700 items-center justify-center shrink-0 border border-gray-200 dark:border-gray-600 overflow-hidden">
                                                            {sp.product.image_url ? (
                                                                <img src={sp.product.image_url} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="material-symbols-outlined text-gray-400 text-lg">image</span>
                                                            )}
                                                        </div>
                                                        <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{sp.product.name}</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveProduct(sp.product.id)}
                                                        className="size-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                                                        aria-label={`Eliminar ${sp.product.name}`}
                                                        tabIndex={0}
                                                    >
                                                        <span className="material-symbols-outlined text-lg">close</span>
                                                    </button>
                                                </div>
                                                {/* Fila 2: Detalles + Precio */}
                                                <div className="flex items-center justify-between gap-2 mt-1.5">
                                                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                                                        <span className="text-[10px] text-gray-400 uppercase font-medium whitespace-nowrap">
                                                            Costo: ${formatCurrency(sp.product.cost || 0)}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400 uppercase font-medium whitespace-nowrap">
                                                            Orig: ${formatCurrency(originalPrice)}
                                                        </span>
                                                        {discount > 0 && (
                                                            <span className="text-[10px] font-bold text-status-success bg-emerald-50 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded">
                                                                -{discount}%
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="relative shrink-0">
                                                        <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-gray-400 text-xs">$</span>
                                                        <input
                                                            type="text"
                                                            className="w-24 h-8 pl-5 pr-2 text-sm font-bold text-right bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-primary focus:border-primary dark:text-white outline-none"
                                                            value={sp.promoPrice}
                                                            onChange={(e) => handlePriceChange(sp.product.id, e.target.value)}
                                                            aria-label={`Precio promo de ${sp.product.name}`}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* COLUMNA DERECHA */}
                    <div className="flex flex-col gap-6">

                        {/* Imagen */}
                        <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-4 sm:p-6 group hover:border-primary/50 transition-colors relative">
                            <div className="flex items-center justify-between mb-4">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Foto de la promoción
                                </label>
                                <div className="flex md:hidden items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={handlePasteClick}
                                        className="flex items-center gap-1.5 text-primary hover:text-primary-hover text-sm font-medium px-2 py-1 rounded hover:bg-primary/5 transition-colors"
                                        disabled={uploadingImage}
                                    >
                                        <span className="material-symbols-outlined text-lg">content_paste</span>
                                        Pegar
                                    </button>
                                    {previewUrl && !uploadingImage && (
                                        <button
                                            type="button"
                                            onClick={deleteImage}
                                            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                            aria-label="Eliminar imagen"
                                            tabIndex={0}
                                        >
                                            <span className="material-symbols-outlined text-xl">delete</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-3 sm:gap-5">
                                <div className="size-16 sm:w-20 sm:h-20 shrink-0 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center overflow-hidden relative">
                                    {previewUrl ? (
                                        <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="material-symbols-outlined text-gray-400 group-hover:text-primary text-3xl transition-colors">cloud_upload</span>
                                    )}
                                    {uploadingImage && (
                                        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1">
                                            <div className="size-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            {statusText && <span className="text-white text-[10px] font-medium">{statusText}</span>}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <p className="text-base font-medium text-gray-800 dark:text-gray-200 mb-2">
                                        {previewUrl ? 'Cambiar imagen' : 'Agregar imagen'}
                                    </p>
                                    {/* Mobile: Camera + Gallery */}
                                    <div className="flex gap-2 md:hidden">
                                        <button
                                            type="button"
                                            onClick={triggerCamera}
                                            disabled={uploadingImage}
                                            className="flex-1 h-9 flex items-center justify-center gap-1.5 bg-primary text-[#102218] rounded-lg font-medium text-xs sm:text-sm cursor-pointer active:scale-95 transition-transform shadow-sm whitespace-nowrap px-1"
                                        >
                                            <span className="material-symbols-outlined text-lg">photo_camera</span>
                                            Cámara
                                        </button>
                                        <button
                                            type="button"
                                            onClick={triggerGallery}
                                            disabled={uploadingImage}
                                            className="flex-1 h-9 flex items-center justify-center gap-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-medium text-xs sm:text-sm cursor-pointer active:scale-95 transition-transform shadow-sm whitespace-nowrap px-1"
                                        >
                                            <span className="material-symbols-outlined text-lg">photo_library</span>
                                            Galería
                                        </button>
                                    </div>
                                    {/* Desktop: Upload + Paste */}
                                    <div className="hidden md:flex gap-2">
                                        <label className="h-8 px-3 flex items-center justify-center gap-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg font-medium text-xs cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                                            <span className="material-symbols-outlined text-base">upload_file</span>
                                            Subir
                                            <input
                                                type="file"
                                                className="hidden"
                                                accept="image/*"
                                                onChange={handleImageSelect}
                                                disabled={uploadingImage}
                                            />
                                        </label>
                                        <button
                                            type="button"
                                            onClick={handlePasteClick}
                                            className="h-8 px-3 flex items-center justify-center gap-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg font-medium text-xs hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                            disabled={uploadingImage}
                                        >
                                            <span className="material-symbols-outlined text-base">content_paste</span>
                                            Pegar
                                        </button>
                                    </div>
                                </div>
                            </div>
                            {previewUrl && !uploadingImage && (
                                <button
                                    type="button"
                                    onClick={deleteImage}
                                    className="hidden md:flex absolute top-3 right-3 size-8 items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-colors z-20"
                                    aria-label="Eliminar imagen"
                                >
                                    <span className="material-symbols-outlined text-lg">delete</span>
                                </button>
                            )}
                        </div>

                        {/* Resumen */}
                        <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-4 sm:p-6">
                            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-lg text-primary">receipt_long</span>
                                Resumen
                            </h2>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500 dark:text-gray-400">Costo total</span>
                                    <span className="font-bold text-gray-700 dark:text-gray-300">${formatCurrency(totalCost)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500 dark:text-gray-400">Precio original combinado</span>
                                    <span className="font-bold text-gray-700 dark:text-gray-300">
                                        ${formatCurrency(selectedProducts.reduce((sum, sp) => sum + (sp.product.price || 0), 0))}
                                    </span>
                                </div>
                                <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-base font-bold text-gray-900 dark:text-white">Precio Promoción</span>
                                        <span className="text-2xl font-black text-primary tracking-tight">${formatCurrency(totalPrice)}</span>
                                    </div>
                                    {totalPrice > 0 && totalCost > 0 && (
                                        <div className="flex justify-between items-center mt-1">
                                            <span className="text-xs text-gray-400">Margen</span>
                                            <span className={`text-xs font-bold ${totalPrice - totalCost > 0 ? 'text-status-success' : 'text-status-error'}`}>
                                                ${formatCurrency(totalPrice - totalCost)} ({totalPrice > 0 ? Math.round(((totalPrice - totalCost) / totalPrice) * 100) : 0}%)
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Botones */}
                        <div className="pt-2 grid grid-cols-2 gap-4 mt-auto">
                            <button
                                onClick={handleBack}
                                className="h-11 px-4 py-2 text-base font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                type="button"
                            >
                                Cancelar
                            </button>
                            <AppButton
                                isLoading={saving || uploadingImage}
                                className="h-11 px-4 py-2 text-base font-medium text-[#102218] bg-primary rounded-lg hover:bg-primary-hover shadow-sm transition-colors"
                                type="submit"
                                disabled={selectedProducts.length < 2 || !promoName.trim()}
                            >
                                Guardar Cambios
                            </AppButton>
                        </div>
                    </div>
                </form>
            </div>

            {/* Product Picker Modal */}
            {showProductPicker && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="button" tabIndex={-1} onClick={() => setShowProductPicker(false)} onKeyDown={(e) => e.key === 'Escape' && setShowProductPicker(false)} aria-label="Cerrar">
                    <div
                        className="bg-white dark:bg-surface-dark w-full sm:w-[480px] sm:max-h-[70vh] max-h-[80vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-[fadeIn_0.15s_ease-out]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Seleccionar Producto</h3>
                                <button
                                    onClick={() => setShowProductPicker(false)}
                                    className="size-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                    aria-label="Cerrar selector de productos"
                                    tabIndex={0}
                                >
                                    <span className="material-symbols-outlined text-gray-500">close</span>
                                </button>
                            </div>
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
                                <input
                                    type="text"
                                    placeholder="Buscar producto..."
                                    className="w-full h-10 pl-10 pr-4 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-sm dark:text-white focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    autoFocus
                                />
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            {productsLoading ? (
                                <div className="p-8 text-center text-gray-400">Cargando...</div>
                            ) : filteredPickerProducts.length === 0 ? (
                                <div className="p-8 text-center text-gray-400">
                                    <span className="material-symbols-outlined text-3xl mb-2 block opacity-50">search_off</span>
                                    <p className="text-sm">No se encontraron productos</p>
                                </div>
                            ) : (
                                filteredPickerProducts.map(product => (
                                    <button
                                        key={product.id}
                                        type="button"
                                        onClick={() => handleAddProduct(product)}
                                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                                        aria-label={`Agregar ${product.name}`}
                                        tabIndex={0}
                                    >
                                        <div className="size-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0 overflow-hidden border border-gray-200 dark:border-gray-600">
                                            {product.image_url ? (
                                                <img src={product.image_url} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="material-symbols-outlined text-gray-400 text-lg">image</span>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{product.name}</p>
                                            <p className="text-xs text-gray-400">${formatCurrency(product.price)} · Costo: ${formatCurrency(product.cost || 0)}</p>
                                        </div>
                                        <span className="material-symbols-outlined text-primary text-xl">add_circle</span>
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showCropper && cropperImageSrc && (
                <ImageCropper
                    imageSrc={cropperImageSrc}
                    onCropComplete={onCropComplete}
                    onCancel={onCropCancel}
                    aspectRatio={1}
                />
            )}
            {showInAppCamera && (
                <InAppCamera onCapture={onCameraCapture} onClose={onCameraClose} />
            )}
        </div>
        </div>
    );
};
