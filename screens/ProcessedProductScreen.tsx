import React, { useState, useEffect } from 'react';
import { Screen, ProductType } from '../types';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { capitalizeWords } from '../lib/formatters';
import { CategorySelector } from '../components/CategorySelector';
import { useImageUpload } from '../hooks/useImageUpload';
import { ImageCropper } from '../components/ImageCropper';
import { InAppCamera } from '../components/InAppCamera';
import { Product as AdminProduct } from '../hooks/useProducts';
import { useToast } from '../context/ToastContext';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { AppButton } from '../components/ui/AppButton';
import { convertUsageToInventoryQty } from '../lib/recipeMath';
import TypeChangeWarningModal from '../components/TypeChangeWarningModal';
import { executeTypeChange, getProductTypeKey, type ProductTypeKey } from '../lib/productTypeChange';

interface Ingredient {
    id: string;
    name: string;
    cost_per_unit: number;
    unit: string;
    image_url?: string;
}

interface RecipeItem {
    id: string; // temporary id for UI list
    ingredientId: string;
    name: string;
    quantity: number;
    unit: string;
    calculatedCost: number;
    imageUrl?: string;
}

interface ProcessedProductScreenProps {
    onNavigate: (screen: Screen) => void;
    productToEdit?: AdminProduct | null;
    originScreen?: Screen;
    isOnline?: boolean;
}

export const ProcessedProductScreen: React.FC<ProcessedProductScreenProps> = ({ onNavigate, productToEdit, originScreen, isOnline = true }) => {
    const { profile } = useAuth();
    const { showToast } = useToast();
    const { poundInGrams } = useBusinessSettings();
    const [loading, setLoading] = useState(false);
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
    } = useImageUpload(productToEdit?.image_url || null);

    // Form States
    const [price, setPrice] = useState('');
    const [cost, setCost] = useState('');
    const [costMode, setCostMode] = useState<'calculated' | 'manual'>('manual');
    const [isForSale, setIsForSale] = useState(true);
    const [unit, setUnit] = useState('Unidad');
    const [productName, setProductName] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [nicknames, setNicknames] = useState<string[]>([]);
    const [nicknameInput, setNicknameInput] = useState('');

    // Cambio de tipo en modo edición
    const [pendingTypeChange, setPendingTypeChange] = useState<ProductTypeKey | null>(null);
    const [showTypeChangeModal, setShowTypeChangeModal] = useState(false);
    const [attemptedType, setAttemptedType] = useState<ProductTypeKey | null>(null);

    const currentType: ProductTypeKey = productToEdit
        ? getProductTypeKey(productToEdit.type, productToEdit.is_for_sale ?? true)
        : 'processed';

    // Tipo mostrado en el select: preferir el pendiente si existe, sino el actual
    const displayedType: ProductTypeKey = pendingTypeChange ?? currentType;

    // Cuando el usuario elige salir de Receta a Simple/Insumo, ocultamos los campos
    // específicos de receta (ingredientes, cost mode, precio) y mostramos un banner.
    const isLeavingRecipe = pendingTypeChange === 'sale' || pendingTypeChange === 'insumo';

    // Global Paste Listener
    React.useEffect(() => {
        const pasteListener = (e: ClipboardEvent) => {
            handlePaste(e);
        };
        window.addEventListener('paste', pasteListener);
        return () => window.removeEventListener('paste', pasteListener);
    }, [handlePaste]);

    // Recipe States
    const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([]);
    const [availableIngredients, setAvailableIngredients] = useState<Ingredient[]>([]);

    const [searchIng, setSearchIng] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [qtyIng, setQtyIng] = useState('');
    const [unitIng, setUnitIng] = useState('Unidad');

    // Filtered ingredients for autocomplete
    const filteredIngredients = availableIngredients.filter(ing =>
        ing.name.toLowerCase().includes(searchIng.toLowerCase())
    ).slice(0, 3); // Limit to 3 results for mobile

    // Helpers
    const formatNumber = (value: string | number) => {
        if (!value) return '';
        const valStr = typeof value === 'number' ? value.toFixed(0) : value;
        const rawValue = valStr.replace(/\D/g, '');
        return rawValue.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    };

    const parseNumber = (value: string) => {
        return parseFloat(value.replace(/\./g, '')) || 0;
    };

    const getAbbreviation = (unit: string) => {
        const u = unit.toLowerCase();
        if (u.includes('gramos') || u === 'g') return 'g';
        if (u.includes('kilogramos') || u === 'kg') return 'kg';
        if (u.includes('libras') || u === 'lb') return 'lb';
        if (u.includes('litros') || u === 'l') return 'L';
        if (u.includes('mililitros') || u === 'ml') return 'ml';
        if (u.includes('unidad') || u === 'und') return 'ud';
        return unit;
    };

    const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        // Un Insumo es un producto simple no vendible (type='simple' + is_for_sale=false):
        // se crea en el formulario simple. La bandera le indica que abra en modo Insumo.
        if (value === 'insumo') {
            sessionStorage.setItem('bistro_create_product_as_insumo', 'true');
            onNavigate(Screen.CREATE_PRODUCT_SIMPLE);
            return;
        }
        if (value === ProductType.SIMPLE) {
            sessionStorage.removeItem('bistro_create_product_as_insumo');
            onNavigate(Screen.CREATE_PRODUCT_SIMPLE);
        }
        if (value === ProductType.SERVICE) onNavigate(Screen.CREATE_PRODUCT_SERVICE);
    };

    const handleEditTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newType = e.target.value as ProductTypeKey;
        // Volvió al tipo original teniendo un cambio pendiente → cancelar el pendiente
        if (newType === currentType) {
            if (pendingTypeChange) setPendingTypeChange(null);
            return;
        }
        setAttemptedType(newType);
        setShowTypeChangeModal(true);
    };

    const handleConfirmTypeChange = () => {
        if (attemptedType) {
            setPendingTypeChange(attemptedType);
        }
        setShowTypeChangeModal(false);
        setAttemptedType(null);
    };

    const handleCancelTypeChange = () => {
        setShowTypeChangeModal(false);
        setAttemptedType(null);
        // pendingTypeChange NO se toca — el select vuelve al displayedType actual
    };

    useEffect(() => {
        if (profile?.business_id) {
            fetchIngredients();
        }
    }, [profile?.business_id]);

    const fetchIngredients = async () => {
        // Fetch products that can be ingredients (Simple or Processed)
        // Services cannot be ingredients.
        let query = supabase
            .from('products')
            .select('*')
            .in('type', [ProductType.SIMPLE, ProductType.PROCESSED])
            .order('name');

        if (productToEdit?.id) {
            query = query.neq('id', productToEdit.id); // Avoid self-reference if editing
        }

        const { data, error } = await query;

        if (data) {
            const mappedIngredients: Ingredient[] = data.map((p: any) => ({
                id: p.id,
                name: p.name,
                cost_per_unit: p.cost || 0, // Use product cost
                unit: p.unit || 'Unidad',
                image_url: p.image_url
            }));
            setAvailableIngredients(mappedIngredients);
        }
    };

    // Populate form if editing
    useEffect(() => {
        const loadRecipe = async () => {
            if (productToEdit && availableIngredients.length > 0) {
                setProductName(productToEdit.name);
                setCategoryId(productToEdit.category_id || '');
                setPrice(formatNumber(productToEdit.price.toString()));
                setIsForSale(productToEdit.is_for_sale ?? (productToEdit.price > 0));
                setNicknames(productToEdit.nicknames || []);
                // Note: cost is calculated from recipe, so we don't set it directly from productToEdit.cost
                // unless we want to, but recipe source of truth is ingredients.

                // Fetch existing ingredients for this product
                const { data: existingIngs, error } = await supabase
                    .from('product_ingredients')
                    .select('*')
                    .eq('product_id', productToEdit.id);

                if (existingIngs && existingIngs.length > 0) {
                    const items: RecipeItem[] = existingIngs.map(ing => {
                        const baseIng = availableIngredients.find(ai => ai.id === ing.ingredient_id);
                        if (!baseIng) return null;

                        return {
                            id: `ing-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // Fallback for non-HTTPS
                            ingredientId: ing.ingredient_id,
                            name: baseIng.name,
                            quantity: ing.quantity,
                            unit: ing.unit || baseIng.unit,
                            calculatedCost: convertUsageToInventoryQty(ing.quantity, ing.unit || baseIng.unit, baseIng.unit, poundInGrams) * baseIng.cost_per_unit,
                            imageUrl: baseIng.image_url
                        };
                    }).filter(Boolean) as RecipeItem[];

                    setCostMode('calculated');
                    setRecipeItems(items);
                } else {
                    // Sin ingredientes guardados → costo manual
                    setCostMode('manual');
                    setCost(formatNumber(productToEdit.cost?.toString() || '0'));
                }
            }
        };

        loadRecipe();
    }, [productToEdit, availableIngredients]);

    useEffect(() => {
        if (costMode === 'manual') return; // En modo manual el usuario escribe el costo
        const totalRecipeCost = recipeItems.reduce((sum, item) => sum + item.calculatedCost, 0);
        setCost(formatNumber(totalRecipeCost));
    }, [recipeItems, costMode]);

    // Icon Mapping Logic
    const getIngredientIcon = (name: string) => {
        const lowerName = name.toLowerCase();
        if (lowerName.includes('pan')) return { icon: 'bakery_dining', color: 'bg-orange-50 text-orange-400 dark:bg-orange-900/20' };
        if (lowerName.includes('carne') || lowerName.includes('tocineta')) return { icon: 'lunch_dining', color: 'bg-red-50 text-red-400 dark:bg-red-900/20' };
        if (lowerName.includes('queso')) return { icon: 'layers', color: 'bg-yellow-50 text-yellow-500 dark:bg-yellow-900/20' };
        if (lowerName.includes('lechuga') || lowerName.includes('tomate') || lowerName.includes('pepini')) return { icon: 'potted_plant', color: 'bg-green-50 text-green-500 dark:bg-green-900/20' };
        return { icon: 'restaurant', color: 'bg-gray-50 text-gray-400 dark:bg-gray-800' };
    };

    const getUnitBadgeClass = (unit: string) => {
        const u = unit.toLowerCase();
        if (u === 'unidad') return 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300';
        if (['gramos', 'kilogramos', 'libras', 'g', 'kg', 'lb'].includes(u)) return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300';
        return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
    };



    const handleAddIngredient = () => {
        const ingredient = availableIngredients.find(i => i.name.toLowerCase() === searchIng.toLowerCase());
        if (!ingredient) { showToast("Ingrediente no encontrado en inventario. Asegúrese que exista.", 'error'); return; }
        const qty = parseFloat(qtyIng);
        if (!qty || qty <= 0) { showToast("Ingresa una cantidad válida.", 'warning'); return; }

        const equivalentQty = convertUsageToInventoryQty(qty, unitIng, ingredient.unit, poundInGrams);
        const lineCost = equivalentQty * ingredient.cost_per_unit;

        const newItem: RecipeItem = {
            id: Date.now().toString(),
            ingredientId: ingredient.id,
            name: ingredient.name,
            quantity: qty,
            unit: unitIng,
            calculatedCost: lineCost,
            imageUrl: ingredient.image_url
        };

        setRecipeItems([...recipeItems, newItem]);
        setSearchIng('');
        setQtyIng('');
        setUnitIng('Unidad');
    };

    const handleRemoveIngredient = (id: string) => {
        setRecipeItems(recipeItems.filter(i => i.id !== id));
    };

    const handleBack = () => onNavigate(originScreen ?? Screen.PRODUCTS);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!navigator.onLine) {
            showToast('Necesitas conexión a internet para guardar productos', 'warning');
            return;
        }

        // Cambio de tipo pendiente: aplicar antes del guardado normal.
        // Desde Receta el destino puede ser 'sale' o 'insumo' (Simple), en ambos casos
        // navegamos al editor de producto simple para que el usuario complete stock,
        // unidad, precio, apodos, etc. Volver a Receta desde Receta no aplica (no hay caso).
        if (productToEdit && pendingTypeChange && pendingTypeChange !== currentType) {
            setLoading(true);
            try {
                const result = await executeTypeChange(productToEdit.id, currentType, pendingTypeChange);
                if (!result.success) {
                    showToast(result.error || 'No se pudo cambiar el tipo del producto', 'error');
                    setLoading(false);
                    return;
                }

                // Destino Simple (sale/insumo): saltar guardado normal y abrir el editor simple
                if (pendingTypeChange === 'sale' || pendingTypeChange === 'insumo') {
                    markAsSaved();
                    showToast('Tipo de producto actualizado. Configurá el stock y otros datos.', 'success');
                    setPendingTypeChange(null);
                    setLoading(false);
                    onNavigate(Screen.CREATE_PRODUCT_SIMPLE);
                    return;
                }
            } catch (err: unknown) {
                console.error('[handleSave] Error en executeTypeChange:', err);
                showToast('No se pudo cambiar el tipo del producto', 'error');
                setLoading(false);
                return;
            }
        }

        if (!productName || !categoryId || !profile?.business_id) {
            showToast('Por favor complete los campos obligatorios', 'warning');
            return;
        }

        if (costMode === 'calculated' && recipeItems.length === 0) {
            showToast('Agrega al menos un ingrediente o usa costo manual', 'warning');
            return;
        }

        if (costMode === 'manual' && parseNumber(cost) <= 0) {
            showToast('Ingresa un costo válido', 'warning');
            return;
        }

        setLoading(true);
        try {
            // Las recetas no manejan stock propio: su disponibilidad se deriva de los insumos.
            const productData: Record<string, any> = {
                business_id: profile.business_id,
                name: productName,
                category_id: categoryId,
                type: ProductType.PROCESSED,
                is_active: true,
                is_for_sale: isForSale,
                cost: parseNumber(cost),
                price: isForSale ? parseNumber(price) : 0,
                unit: unit || 'Und',
                // NOTA: ver SimpleProductScreen — 'Insumo preparado' se conserva como valor
                // histórico en BD aunque la UI ahora diga "Ingrediente". No cambiar sin un
                // UPDATE que alinee los registros existentes.
                description: isForSale ? 'Producto con receta' : 'Insumo preparado',
                image_url: imageUrl,
                nicknames: nicknames,
            };

            if (!productToEdit) {
                productData.stock = null;
            }

            let productId = productToEdit?.id;
            let error;

            if (productToEdit) {
                // Update Product
                const { error: updateError } = await supabase
                    .from('products')
                    .update(productData)
                    .eq('id', productId);
                error = updateError;
            } else {
                // Insert Product
                const { data, error: insertError } = await supabase
                    .from('products')
                    .insert([productData])
                    .select()
                    .single();
                error = insertError;
                productId = data?.id;
            }

            if (error) throw error;

            if (productId) {
                // Borrar receta previa (si la había) antes de reescribir
                if (productToEdit) {
                    await supabase
                        .from('product_ingredients')
                        .delete()
                        .eq('product_id', productId);
                }

                // Solo en modo calculado se guardan ingredientes (que además descuentan stock al vender)
                if (costMode === 'calculated' && recipeItems.length > 0) {
                    const ingredientsData = recipeItems.map(item => ({
                        product_id: productId,
                        ingredient_id: item.ingredientId,
                        quantity: item.quantity,
                        unit: item.unit // Save the unit so the DB trigger can convert it later
                    }));

                    const { error: ingError } = await supabase
                        .from('product_ingredients')
                        .insert(ingredientsData);

                    if (ingError) throw ingError;
                }

                // En modo manual el costo lo fija el usuario: lo reescribimos al final para que
                // el trigger de recálculo (disparado al borrar ingredientes) no lo deje en 0.
                if (costMode === 'manual') {
                    await supabase
                        .from('products')
                        .update({ cost: parseNumber(cost) })
                        .eq('id', productId);
                }
            }

            // Mark as saved so cleanup doesn't delete the image
            markAsSaved();
            window.dispatchEvent(new CustomEvent('inventory-updated'));
            showToast(productToEdit ? 'Receta actualizada exitosamente' : 'Producto y receta creados exitosamente', 'success');
            onNavigate(originScreen ?? Screen.PRODUCTS);

        } catch (error: any) {
            console.error('Error saving:', error);
            const isPerm = error?.code === '42501' || /row-level security|permission denied/i.test(error?.message || '');
            showToast(isPerm ? 'No tienes permiso para crear o editar productos.' : 'No se pudo guardar. Intenta de nuevo.', isPerm ? 'warning' : 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 md:left-[var(--sidebar-w,15rem)] z-[100] flex justify-end">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]" role="button" tabIndex={-1} onClick={handleBack} onKeyDown={(e) => e.key === 'Escape' && handleBack()} aria-label="Cerrar"></div>
            <div className="relative w-full max-w-md h-full bg-background-light dark:bg-background-dark shadow-2xl flex flex-col animate-[slideInRight_0.3s_ease-out] border-l border-gray-200 dark:border-gray-800">
                {/* Bloqueo offline */}
                {!isOnline && (
                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-background-light dark:bg-background-dark p-8 text-center gap-5">
                        <div className="size-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                            <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>wifi_off</span>
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Sin conexión</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                                Para {productToEdit ? 'editar' : 'crear'} recetas necesitas internet. Los cambios se guardan directamente en la nube.
                            </p>
                        </div>
                        <button onClick={handleBack} className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-[#102218] font-bold rounded-xl transition-colors">
                            Volver
                        </button>
                    </div>
                )}
                {/* Header */}
                <header className="h-16 shrink-0 bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-800 px-6 flex items-center justify-between z-10">
                    <div className="flex items-center gap-4">
                        <h1 className="text-xl font-semibold text-text-main dark:text-white tracking-tight flex items-center gap-2">
                            {productToEdit ? 'Editar Receta' : 'Crear Receta'}
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

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-gray-50 dark:bg-background-dark">
                    <form className="flex flex-col gap-6" onSubmit={handleSave}>
                        {/* Datos Básicos */}
                        <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                            <div className="p-4 sm:p-6">
                            <div className="grid grid-cols-12 gap-6">
                                <div className="col-span-12">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tipo de producto <span className="text-red-500">*</span></label>
                                    <div className="relative">
                                        {!productToEdit ? (
                                            <>
                                                <select
                                                    className="w-full h-11 pl-4 pr-9 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg appearance-none cursor-pointer text-text-main dark:text-white outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors bg-none"
                                                    value={ProductType.PROCESSED}
                                                    onChange={handleTypeChange}
                                                >
                                                    <option value={ProductType.SIMPLE}>Producto</option>
                                                    <option value="insumo">Ingrediente</option>
                                                    <option value={ProductType.PROCESSED}>Receta</option>
                                                    <option value={ProductType.SERVICE}>Servicios</option>
                                                </select>
                                                <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
                                                    <span className="material-symbols-outlined text-xl">expand_more</span>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <select
                                                    className="w-full h-11 pl-4 pr-9 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg appearance-none cursor-pointer text-text-main dark:text-white outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-colors bg-none"
                                                    onChange={handleEditTypeChange}
                                                    value={displayedType}
                                                    aria-label="Cambiar tipo de producto"
                                                >
                                                    <option value="sale">Producto</option>
                                                    <option value="insumo">Ingrediente</option>
                                                    <option value="processed">Receta</option>
                                                </select>
                                                <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
                                                    <span className="material-symbols-outlined text-xl">expand_more</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    {pendingTypeChange && (
                                        <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[14px]">info</span>
                                            Cambio pendiente. Se aplicará al guardar.
                                        </p>
                                    )}
                                    {isLeavingRecipe && (
                                        <div className="mt-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50">
                                            <div className="flex items-start gap-3">
                                                <span
                                                    className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[24px] shrink-0 mt-0.5"
                                                    aria-hidden
                                                >
                                                    inventory_2
                                                </span>
                                                <div className="flex flex-col gap-1.5 min-w-0">
                                                    <p className="text-sm font-bold text-amber-900 dark:text-amber-200 leading-tight">
                                                        Este producto dejará de ser una Receta
                                                    </p>
                                                    <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                                                        Se eliminarán los ingredientes de la receta. Se conservarán:
                                                        <span className="font-bold"> Nombre</span>,
                                                        <span className="font-bold"> Imagen</span> y
                                                        <span className="font-bold"> Categoría</span>.
                                                    </p>
                                                    <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                                                        Al guardar, se abrirá el editor de {pendingTypeChange === 'sale' ? 'producto para venta' : 'ingrediente'} donde deberás asignar el stock manualmente.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {/* El toggle "Para Venta / Solo Insumo" se retiró del formulario de receta:
                                    el tipo ya se elige en el selector de arriba. `isForSale` se conserva
                                    en el estado (lo respeta el guardado y el campo Precio) para no alterar
                                    recetas existentes que fueron guardadas como insumo preparado. */}
                                <div className="col-span-12">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Nombre del producto <span className="text-red-500">*</span></label>
                                    <input className="w-full h-11 px-4 text-base bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-text-main dark:text-white focus:ring-1 focus:ring-primary focus:border-primary outline-none" type="text" value={productName} onChange={(e) => setProductName(capitalizeWords(e.target.value))} />
                                </div>

                                {/* Foto del producto: vive dentro del grid, con la misma caja
                                    (border-gray-300 + rounded-lg) que los inputs para que quede
                                    alineada con el resto del formulario. */}
                                <div className="col-span-12">
                                    <div className="flex items-center justify-between mb-1.5 gap-2">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Foto del producto
                                        </label>
                                        <button
                                            type="button"
                                            onClick={handlePasteClick}
                                            disabled={uploadingImage}
                                            className="md:hidden flex items-center gap-1 text-primary hover:text-primary-hover text-xs font-medium px-2 py-1 rounded hover:bg-primary/5 transition-colors shrink-0"
                                        >
                                            <span className="material-symbols-outlined text-base">content_paste</span>
                                            Pegar
                                        </button>
                                    </div>
                                    <div className="group relative flex items-center gap-3 sm:gap-4 p-3 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-primary/50 transition-colors">
                                        <div className="size-16 shrink-0 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center relative overflow-hidden">
                                            {previewUrl ? (
                                                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="material-symbols-outlined text-gray-400 group-hover:text-primary text-3xl transition-colors">cloud_upload</span>
                                            )}
                                            {uploadingImage && (
                                                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1">
                                                    <div className="size-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                    {statusText && <span className="text-white text-[10px] font-medium text-center px-1">{statusText}</span>}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2 truncate">
                                                {previewUrl ? 'Cambiar imagen' : 'Agregar imagen'}
                                            </p>
                                            {/* Móvil: cámara y galería */}
                                            <div className="flex gap-2 md:hidden">
                                                <button
                                                    type="button"
                                                    onClick={triggerCamera}
                                                    disabled={uploadingImage}
                                                    className="flex-1 h-9 flex items-center justify-center gap-1.5 bg-primary text-[#102218] rounded-lg font-medium text-xs cursor-pointer active:scale-95 transition-transform shadow-sm whitespace-nowrap px-1"
                                                >
                                                    <span className="material-symbols-outlined text-lg">photo_camera</span>
                                                    Cámara
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={triggerGallery}
                                                    disabled={uploadingImage}
                                                    className="flex-1 h-9 flex items-center justify-center gap-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg font-medium text-xs cursor-pointer active:scale-95 transition-transform shadow-sm whitespace-nowrap px-1"
                                                >
                                                    <span className="material-symbols-outlined text-lg">photo_library</span>
                                                    Galería
                                                </button>
                                            </div>
                                            {/* Desktop: subir y pegar */}
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
                                                    title="Pegar imagen del portapapeles"
                                                >
                                                    <span className="material-symbols-outlined text-base">content_paste</span>
                                                    Pegar
                                                </button>
                                            </div>
                                        </div>
                                        {previewUrl && !uploadingImage && (
                                            <button
                                                type="button"
                                                onClick={deleteImage}
                                                className="absolute top-2 right-2 size-7 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-colors z-20"
                                                title="Eliminar imagen"
                                                aria-label="Eliminar imagen"
                                            >
                                                <span className="material-symbols-outlined text-base">delete</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="col-span-12">
                                    <CategorySelector
                                        value={categoryId}
                                        onChange={setCategoryId}
                                        error={!categoryId && Boolean(productName)}
                                    />
                                </div>

                                {!isLeavingRecipe && (
                                <>
                                <div className="col-span-6">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Unidad de Venta</label>
                                    <input className="w-full h-11 px-4 text-base bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-text-main dark:text-white outline-none" value="Unidad" readOnly />
                                </div>
                                <div className="col-span-6">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Precio Venta</label>
                                    <input className="w-full h-11 px-4 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-text-main dark:text-white focus:ring-1 focus:ring-primary focus:border-primary outline-none disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed" type="text" placeholder="0" value={price} onChange={(e) => setPrice(formatNumber(e.target.value))} disabled={!isForSale} />
                                </div>
                                </>
                                )}
                            </div>
                            </div>
                        </div>

                        {/* Costo: tarjeta propia, separada del formulario de datos (mismo
                            tratamiento que la tarjeta de Apodos). Cubre los dos modos: en
                            calculado la lista de ingredientes queda anidada como sub-sección. */}
                        {!isLeavingRecipe && (
                        <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                            <div className="px-4 sm:px-6 pt-4 sm:pt-6 pb-4">
                                <div className="flex items-center justify-between mb-3 gap-2">
                                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2 min-w-0">
                                        <span className="material-symbols-outlined text-emerald-600 text-xl filled shrink-0">payments</span>
                                        <span className="truncate">{costMode === 'calculated' ? 'Costo (Calculado)' : 'Costo (Manual)'}</span>
                                    </h3>
                                    <div className="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => { setCostMode('manual'); setRecipeItems([]); }}
                                            className={`px-2.5 h-6 text-[11px] font-bold transition-colors ${costMode === 'manual' ? 'bg-primary text-[#102218]' : 'bg-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                                        >
                                            Manual
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setCostMode('calculated')}
                                            className={`px-2.5 h-6 text-[11px] font-bold transition-colors border-l border-gray-300 dark:border-gray-600 ${costMode === 'calculated' ? 'bg-primary text-[#102218]' : 'bg-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                                        >
                                            Ingredientes
                                        </button>
                                    </div>
                                </div>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 text-sm">$</span>
                                    <input
                                        className={`w-full h-11 pl-7 pr-4 text-sm border border-gray-300 dark:border-gray-600 rounded-lg font-bold text-gray-900 dark:text-white outline-none ${costMode === 'calculated' ? 'bg-gray-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-900 focus:ring-1 focus:ring-primary focus:border-primary'}`}
                                        type="text"
                                        placeholder="0"
                                        readOnly={costMode === 'calculated'}
                                        value={cost}
                                        onChange={(e) => { if (costMode === 'manual') setCost(formatNumber(e.target.value)); }}
                                    />
                                </div>
                            </div>

                        {/* Ingredientes: sub-sección del costo calculado */}
                        {costMode === 'calculated' && (
                        <div className="border-t border-gray-200 dark:border-gray-700">
                                <div className="px-4 sm:px-6 pt-3 pb-2 flex items-center justify-between gap-2">
                                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2 min-w-0">
                                        <span className="material-symbols-outlined text-orange-500 text-xl filled shrink-0">skillet</span>
                                        <span className="truncate">Ingredientes de la Receta</span>
                                    </h3>
                                    <span className="hidden sm:inline-block shrink-0 text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300 px-3 py-1 rounded-full font-bold uppercase tracking-wider">
                                        {recipeItems.length} items
                                    </span>
                                </div>

                                <div className="bg-white dark:bg-gray-900">
                                    {/* Header de Tabla */}
                                    <div className="grid grid-cols-12 gap-2 px-4 sm:px-6 py-2 bg-gray-50 dark:bg-gray-800 text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-widest border-y border-gray-100 dark:border-gray-700 items-center">
                                        <div className="col-span-7">Ingrediente</div>
                                        <div className="col-span-3 text-center">Cant.</div>
                                        <div className="col-span-2"><span className="sr-only">Acción</span></div>
                                    </div>

                                    {/* Cuerpo de Tabla */}
                                    <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                        {recipeItems.length > 0 ? recipeItems.map((item) => {
                                            const { icon, color } = getIngredientIcon(item.name);
                                            return (
                                                <div key={item.id} className="grid grid-cols-12 gap-2 px-4 sm:px-6 py-2.5 items-center hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                                                    <div className="col-span-7 flex items-center gap-3 min-w-0">
                                                        <div className={`flex size-10 rounded-full items-center justify-center shrink-0 overflow-hidden ${color}`}>
                                                            {item.imageUrl ? (
                                                                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover"  crossOrigin="anonymous"/>
                                                            ) : (
                                                                <span className="material-symbols-outlined text-xl">{icon}</span>
                                                            )}
                                                        </div>
                                                        {/* Hasta 2 líneas: con leading-tight el bloque de texto no supera
                                                            la altura del avatar, así que la fila no crece. */}
                                                        <span className="text-sm font-bold text-gray-800 dark:text-gray-100 leading-tight line-clamp-2 break-words" title={item.name}>{item.name}</span>
                                                    </div>

                                                    <div className="col-span-3 text-center text-sm font-medium text-gray-700 dark:text-gray-300">
                                                        {item.quantity} <span className="text-xs text-gray-500">{getAbbreviation(item.unit)}</span>
                                                    </div>

                                                    <div className="col-span-2 flex justify-end">
                                                        <button
                                                            onClick={() => handleRemoveIngredient(item.id)}
                                                            className="size-8 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                                            type="button"
                                                        >
                                                            <span className="material-symbols-outlined text-xl">delete</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        }) : (
                                            <div className="py-6 text-center text-gray-400 text-sm">No hay ingredientes agregados</div>
                                        )}
                                    </div>

                                    {/* Pie de Tabla: Inputs */}
                                    <div className="px-4 sm:px-6 py-3 bg-gray-50/50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-700 rounded-b-xl">
                                        <div className="flex flex-col gap-2">
                                            <div className="relative">
                                                <input
                                                    className="w-full h-11 px-4 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-text-main dark:text-white outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                                    placeholder="Buscar ingrediente..."
                                                    value={searchIng}
                                                    onChange={(e) => {
                                                        setSearchIng(e.target.value);
                                                        setShowSuggestions(true);
                                                    }}
                                                    onFocus={() => setShowSuggestions(true)}
                                                />
                                                {/* Autocomplete Dropdown - opens upward */}
                                                {showSuggestions && searchIng && filteredIngredients.length > 0 && (
                                                    <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-[100] max-h-48 overflow-y-auto">
                                                        {filteredIngredients.map(ing => (
                                                            <button
                                                                key={ing.id}
                                                                type="button"
                                                                className="w-full px-4 py-3 text-left text-sm text-gray-800 dark:text-gray-200 hover:bg-primary/10 dark:hover:bg-primary/20 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-b-0"
                                                                onClick={() => {
                                                                    setSearchIng(ing.name);
                                                                    setShowSuggestions(false);
                                                                }}
                                                            >
                                                                {ing.name}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                {/* No results message - opens upward */}
                                                {showSuggestions && searchIng && filteredIngredients.length === 0 && (
                                                    <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-[100] px-4 py-3 text-sm text-gray-400">
                                                        No se encontraron ingredientes
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex gap-2 items-end">
                                                <div className="w-20 shrink-0">
                                                    <input
                                                        className="w-full h-11 text-sm font-bold border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-center text-text-main dark:text-white outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                                        placeholder="0"
                                                        type="number"
                                                        value={qtyIng}
                                                        onChange={(e) => setQtyIng(e.target.value)}
                                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <select
                                                        className="w-full h-11 px-3 text-xs border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 appearance-none bg-none cursor-pointer text-text-main dark:text-white outline-none focus:ring-1 focus:ring-primary focus:border-primary"
                                                        value={unitIng}
                                                        onChange={(e) => setUnitIng(e.target.value)}
                                                    >
                                                        <optgroup label="Peso">
                                                            <option value="Gramos">Gramos (g)</option>
                                                            <option value="Kilogramos">Kilogramos (kg)</option>
                                                            <option value="Libras">Libras (lb)</option>
                                                        </optgroup>
                                                        <optgroup label="Volumen">
                                                            <option value="Mililitros">Mililitros (ml)</option>
                                                            <option value="Litros">Litros (L)</option>
                                                        </optgroup>
                                                        <optgroup label="Unidad">
                                                            <option value="Unidad">Unidad</option>
                                                        </optgroup>
                                                    </select>
                                                </div>
                                                <button
                                                    className="h-11 px-5 flex items-center justify-center rounded-xl bg-primary text-[#102218] hover:bg-primary-hover font-bold shadow-lg shadow-primary/20 transition-all active:scale-95 shrink-0"
                                                    type="button"
                                                    onClick={handleAddIngredient}
                                                >
                                                    Añadir
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                        </div>
                        )}

                        {!isLeavingRecipe && (
                        <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 sm:p-6 flex flex-col relative overflow-hidden">

                            <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300 mb-3 relative z-10">
                                Apodos (Referencias)
                            </h3>
                            <div className="relative mb-4 relative z-10">
                                <input
                                    className="w-full h-10 pl-3 pr-20 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-text-main dark:text-white outline-none focus:ring-1 focus:ring-primary focus:border-primary shadow-sm"
                                    placeholder="Ej: Hamburguesa, Combo..."
                                    type="text"
                                    value={nicknameInput}
                                    onChange={(e) => setNicknameInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            const trimmed = nicknameInput.trim();
                                            if (trimmed && !nicknames.includes(trimmed)) {
                                                setNicknames([...nicknames, trimmed]);
                                                setNicknameInput('');
                                            }
                                        }
                                    }}
                                />
                                {nicknameInput.trim() && (
                                    <button
                                        className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer"
                                        type="button"
                                        onClick={() => {
                                            const trimmed = nicknameInput.trim();
                                            if (trimmed && !nicknames.includes(trimmed)) {
                                                setNicknames([...nicknames, trimmed]);
                                                setNicknameInput('');
                                            }
                                        }}
                                        aria-label="Agregar apodo"
                                        tabIndex={0}
                                    >
                                        Agregar
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2 relative z-10">
                                {nicknames.map((nick, idx) => (
                                    <span
                                        key={nick}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded-full text-xs font-medium border border-yellow-200 dark:border-yellow-800"
                                    >
                                        {nick}
                                        <button
                                            type="button"
                                            onClick={() => setNicknames(nicknames.filter((_, i) => i !== idx))}
                                            className="ml-1 text-yellow-600 hover:text-red-500 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-sm">close</span>
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>
                        )}

                        <div className="grid grid-cols-2 gap-4 mb-8">
                            <button onClick={handleBack} className="h-11 px-4 py-2 text-base font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" type="button">Cancelar</button>
                            <AppButton
                                className="h-11 w-full bg-primary hover:bg-primary-hover text-[#102218] font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2"
                                type="submit"
                                isLoading={loading || uploadingImage}
                            >
                                {isLeavingRecipe
                                    ? 'Continuar al editor de producto'
                                    : (productToEdit ? 'Actualizar Receta' : 'Crear Receta')}
                            </AppButton>
                        </div>
                    </form>
                </div>

                {/* Image Cropper Modal */}
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

            <TypeChangeWarningModal
                isOpen={showTypeChangeModal}
                fromType={currentType}
                toType={attemptedType ?? currentType}
                onConfirm={handleConfirmTypeChange}
                onCancel={handleCancelTypeChange}
            />
            </div>
        </div>
    );
};
