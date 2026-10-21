
import React, { useState } from 'react';
import { Screen, ProductType } from '../types';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { capitalizeWords } from '../lib/formatters';
import { useImageUpload } from '../hooks/useImageUpload';
import { CategorySelector } from '../components/CategorySelector';
import { ImageCropper } from '../components/ImageCropper';
import { InAppCamera } from '../components/InAppCamera';
import { Product as AdminProduct } from '../hooks/useProducts';
import { AppButton } from '../components/ui/AppButton';
import { useToast } from '../context/ToastContext';

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

interface ServiceProductScreenProps {
    onNavigate: (screen: Screen) => void;
    productToEdit?: AdminProduct | null;
    originScreen?: Screen;
    isOnline?: boolean;
}

export const ServiceProductScreen: React.FC<ServiceProductScreenProps> = ({ onNavigate, productToEdit, originScreen, isOnline = true }) => {
    const { profile } = useAuth();
    const { showToast } = useToast();
    const [showSuccessModal, setShowSuccessModal] = useState(false);
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
        resetImage,
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
    const [productName, setProductName] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [nicknames, setNicknames] = useState<string[]>([]);
    const [nicknameInput, setNicknameInput] = useState('');

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

    const convertUsageToInventoryQty = (usageQty: number, usageUnit: string, invUnit: string): number => {
        const u = usageUnit.toLowerCase().trim();
        const i = invUnit.toLowerCase().trim();

        if (u === i) return usageQty;

        // Normalization helpers
        const isKg = (unit: string) => ['kilogramos', 'kg', 'kilos'].includes(unit);
        const isLb = (unit: string) => ['libras', 'lb', 'lbs'].includes(unit);
        const isG = (unit: string) => ['gramos', 'gr', 'g'].includes(unit);
        const isL = (unit: string) => ['litros', 'l', 'lt'].includes(unit);
        const isMl = (unit: string) => ['mililitros', 'ml'].includes(unit);
        const isArroba = (unit: string) => ['arrobas', '@', 'arroba'].includes(unit);

        // Inventory: Kilogramos
        if (isKg(i)) {
            if (isG(u)) return usageQty / 1000;
            if (isLb(u)) return usageQty / 2.20462;
            if (isArroba(u)) return usageQty * 11.3398;
        }

        // Inventory: Libras
        if (isLb(i)) {
            if (isG(u)) return usageQty / 453.592;
            if (isKg(u)) return usageQty * 2.20462;
            if (isArroba(u)) return usageQty * 25;
        }

        // Inventory: Gramos
        if (isG(i)) {
            if (isKg(u)) return usageQty * 1000;
            if (isLb(u)) return usageQty * 453.592;
        }

        // Inventory: Litros
        if (isL(i)) {
            if (isMl(u)) return usageQty / 1000;
        }

        // Inventory: Mililitros
        if (isMl(i)) {
            if (isL(u)) return usageQty * 1000;
        }

        // Inventory: Arrobas
        if (isArroba(i)) {
            if (isLb(u)) return usageQty / 25;
            if (isKg(u)) return usageQty / 11.3398;
        }

        console.warn(`No conversion found for ${u} to ${i}`);
        return usageQty;
    };

    // Global Paste Listener
    React.useEffect(() => {
        const pasteListener = (e: ClipboardEvent) => {
            handlePaste(e);
        };
        window.addEventListener('paste', pasteListener);
        return () => window.removeEventListener('paste', pasteListener);
    }, [handlePaste]);

    const formatNumber = (value: string) => {
        if (!value) return '';
        const rawValue = value.replace(/\D/g, '');
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
        if (value === ProductType.SIMPLE) onNavigate(Screen.CREATE_PRODUCT_SIMPLE);
    };


    // Ingredient Data Fetching
    React.useEffect(() => {
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
    React.useEffect(() => {
        const loadRecipe = async () => {
            if (productToEdit) {
                setProductName(productToEdit.name);
                setCategoryId(productToEdit.category_id || '');
                setPrice(formatNumber(productToEdit.price.toString()));
                setCost(productToEdit.cost ? formatNumber(productToEdit.cost.toString()) : '');
                setNicknames(productToEdit.nicknames || []);

                // Fetch existing ingredients for this service
                if (availableIngredients.length > 0) {
                    const { data: existingIngs, error } = await supabase
                        .from('product_ingredients')
                        .select('*')
                        .eq('product_id', productToEdit.id);

                    if (existingIngs) {
                        const items: RecipeItem[] = existingIngs.map(ing => {
                            const baseIng = availableIngredients.find(ai => ai.id === ing.ingredient_id);
                            if (!baseIng) return null;

                            return {
                                id: `ing-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                                ingredientId: ing.ingredient_id,
                                name: baseIng.name,
                                quantity: ing.quantity,
                                unit: ing.unit || baseIng.unit,
                                calculatedCost: convertUsageToInventoryQty(ing.quantity, ing.unit || baseIng.unit, baseIng.unit) * baseIng.cost_per_unit,
                                imageUrl: baseIng.image_url
                            };
                        }).filter(Boolean) as RecipeItem[];

                        setRecipeItems(items);
                    }
                }
            }
        };
        loadRecipe();
    }, [productToEdit, availableIngredients]);

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

        const equivalentQty = convertUsageToInventoryQty(qty, unitIng, ingredient.unit);
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

    const handleBack = () => {
        onNavigate(originScreen ?? Screen.PRODUCTS);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!productName || !price || !profile?.business_id) {
            showToast('Por favor complete los campos obligatorios (*)', 'warning');
            return;
        }

        setLoading(true);
        try {
            const productData = {
                business_id: profile.business_id,
                name: productName,
                category_id: categoryId || null,
                type: ProductType.SERVICE,
                is_active: true,
                stock: null, // Services don't mean stock usually
                cost: parseNumber(cost) || 0,
                price: parseNumber(price),
                unit: 'Serv',
                description: 'Servicio',
                image_url: imageUrl,
                nicknames: nicknames,
            };

            let error;
            if (productToEdit) {
                // Update
                const { error: updateError } = await supabase
                    .from('products')
                    .update(productData)
                    .eq('id', productToEdit.id);
                error = updateError;
            } else {
                // Insert
                const { data, error: insertError } = await supabase
                    .from('products')
                    .insert([productData])
                    .select()
                    .single();
                error = insertError;
                // If inserting, get the new ID
                if (!error && data) {
                    // We need the ID to insert ingredients
                    // But wait, user might have used handleSave for edit too.
                    // Let's refactor slightly to ensure we have ID.
                    // data.id is available here.
                    const newProductId = data.id;

                    // Handle Ingredients
                    const ingredientsData = recipeItems.map(item => ({
                        product_id: newProductId,
                        ingredient_id: item.ingredientId,
                        quantity: item.quantity,
                        unit: item.unit
                    }));

                    if (ingredientsData.length > 0) {
                        const { error: ingError } = await supabase
                            .from('product_ingredients')
                            .insert(ingredientsData);
                        if (ingError) throw ingError;
                    }
                }
            }

            if (productToEdit) {
                // Handle Ingredients for Edit: Delete all old ones first, then insert new
                await supabase
                    .from('product_ingredients')
                    .delete()
                    .eq('product_id', productToEdit.id);

                const ingredientsData = recipeItems.map(item => ({
                    product_id: productToEdit.id,
                    ingredient_id: item.ingredientId,
                    quantity: item.quantity,
                    unit: item.unit
                }));

                if (ingredientsData.length > 0) {
                    const { error: ingError } = await supabase
                        .from('product_ingredients')
                        .insert(ingredientsData);
                    if (ingError) throw ingError;
                }
            }

            if (error) throw error;

            // Mark as saved so cleanup doesn't delete the image
            markAsSaved();
            window.dispatchEvent(new CustomEvent('inventory-updated'));
            showToast(productToEdit ? 'Servicio actualizado exitosamente' : 'Servicio creado exitosamente', 'success');
            if (productToEdit) {
                onNavigate(originScreen ?? Screen.PRODUCTS);
            } else {
                setShowSuccessModal(true);
            }
        } catch (error: any) {
            console.error('Error creating service:', error);
            const isPerm = error?.code === '42501' || /row-level security|permission denied/i.test(error?.message || '');
            showToast(isPerm ? 'No tienes permiso para crear o editar productos.' : 'No se pudo guardar el servicio. Intenta de nuevo.', isPerm ? 'warning' : 'error');
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
                                Para {productToEdit ? 'editar' : 'crear'} servicios necesitas internet. Los cambios se guardan directamente en la nube.
                            </p>
                        </div>
                        <button
                            onClick={handleBack}
                            className="px-6 py-2.5 bg-amber-400 hover:bg-amber-500 text-[#102218] font-bold rounded-xl transition-colors"
                        >
                            Volver
                        </button>
                    </div>
                )}
                {/* Header */}
                <header className="h-16 shrink-0 bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-800 px-6 flex items-center justify-between z-10">
                    <div className="flex items-center gap-4">
                        <h1 className="text-xl font-semibold text-text-main dark:text-white tracking-tight flex items-center gap-2">
                            {productToEdit ? 'Editar Servicio' : 'Crear Servicio'}
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

                <div id="service-product-scroll" className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-gray-50 dark:bg-background-dark">
                    <form className="flex flex-col gap-6 content-start" onSubmit={handleSave}>
                        <div className="flex flex-col gap-6">
                            <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
                                <div className="flex flex-col gap-4">
                                    <div className="w-full">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                            Tipo de producto <span className="text-red-500">*</span>
                                        </label>
                                        <div className="relative">
                                            {!productToEdit ? (
                                                <>
                                                    <select
                                                        className="w-full h-11 pl-4 pr-10 text-base bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 transition-colors appearance-none bg-none cursor-pointer text-text-main dark:text-white outline-none"
                                                        onChange={handleTypeChange}
                                                        defaultValue={ProductType.SERVICE}
                                                    >
                                                        <option value={ProductType.SIMPLE}>Producto</option>
                                                        <option value={ProductType.SERVICE}>Servicios</option>
                                                    </select>
                                                    <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
                                                        <span className="material-symbols-outlined text-xl">expand_more</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <input
                                                    className="w-full h-11 px-4 text-base bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-text-secondary dark:text-gray-400 outline-none cursor-not-allowed"
                                                    value="Servicios"
                                                    readOnly
                                                />
                                            )}
                                        </div>
                                    </div>

                                    <div className="w-full">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                            Nombre del servicio <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            className="w-full h-11 px-4 text-base bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-text-main dark:text-white outline-none"
                                            type="text"
                                            placeholder="Ej: Corte de Cabello"
                                            value={productName}
                                            onChange={(e) => setProductName(e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1))}
                                        />
                                    </div>

                                    <div className="w-full">
                                        <CategorySelector
                                            value={categoryId}
                                            onChange={setCategoryId}
                                            placeholder="Selecciona categoría"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="w-full">
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                                Precio <span className="text-red-500">*</span>
                                            </label>
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                                    <span className="text-sm">$</span>
                                                </div>
                                                <input
                                                    className="w-full h-11 pl-7 pr-4 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-text-main dark:text-white outline-none font-bold"
                                                    type="text"
                                                    inputMode="decimal"
                                                    placeholder="0"
                                                    value={price}
                                                    onChange={(e) => setPrice(formatNumber(e.target.value))}
                                                />
                                            </div>
                                        </div>

                                        <div className="w-full">
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                                Costo
                                            </label>
                                            <div className="relative">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                                    <span className="text-sm">$</span>
                                                </div>
                                                <input
                                                    className="w-full h-11 pl-7 pr-4 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 transition-colors text-text-main dark:text-white outline-none font-bold"
                                                    type="text"
                                                    inputMode="decimal"
                                                    placeholder="0"
                                                    value={cost}
                                                    onChange={(e) => setCost(formatNumber(e.target.value))}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>



                            {/* Tabla de Ingredientes del Servicio — oculta temporalmente */}
                            {false && <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col">
                                <div className="p-4 flex flex-col gap-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                            Ingredientes del Servicio
                                        </h3>
                                        <span className="inline-block text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-300 px-3 py-1 rounded-full font-bold uppercase tracking-wider">
                                            {recipeItems.length} items
                                        </span>
                                    </div>

                                    <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 overflow-hidden">
                                        {/* Header de Tabla */}
                                        <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800 text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-widest border-b border-gray-100 dark:border-gray-700 items-center">
                                            <div className="col-span-5">Ingrediente</div>
                                            <div className="col-span-4 text-center">Cant. / Unidad</div>
                                            <div className="col-span-3 text-right">Acción</div>
                                        </div>

                                        {/* Cuerpo de Tabla */}
                                        <div className="divide-y divide-gray-100 dark:divide-gray-800">
                                            {recipeItems.length > 0 ? recipeItems.map((item) => {
                                                const { icon, color } = getIngredientIcon(item.name);
                                                return (
                                                    <div key={item.id} className="grid grid-cols-12 gap-2 px-4 py-4 items-center hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                                                        <div className="col-span-5 flex items-center gap-3">
                                                            <div className={`flex size-10 rounded-full items-center justify-center shrink-0 overflow-hidden ${color}`}>
                                                                {item.imageUrl ? (
                                                                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover"  crossOrigin="anonymous"/>
                                                                ) : (
                                                                    <span className="material-symbols-outlined text-xl">{icon}</span>
                                                                )}
                                                            </div>
                                                            <span className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">{item.name}</span>
                                                        </div>

                                                        <div className="col-span-4 text-center text-sm font-medium text-gray-700 dark:text-gray-300">
                                                            {item.quantity} <span className="text-xs text-gray-500">{getAbbreviation(item.unit)}</span>
                                                        </div>

                                                        <div className="col-span-3 flex justify-end">
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
                                                <div className="p-8 text-center text-gray-400 text-sm">No hay insumos agregados</div>
                                            )}
                                        </div>

                                        {/* Pie de Tabla: Inputs */}
                                        <div className="p-4 bg-gray-50/50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-700">
                                            <div className="grid grid-cols-12 gap-3 items-end">
                                                <div className="col-span-12 relative">
                                                    <input
                                                        className="w-full h-11 px-4 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-text-main dark:text-white outline-none focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm"
                                                        placeholder="Buscar insumo..."
                                                        value={searchIng}
                                                        onChange={(e) => {
                                                            setSearchIng(e.target.value);
                                                            setShowSuggestions(true);
                                                        }}
                                                        onFocus={() => setShowSuggestions(true)}
                                                    />
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
                                                    {showSuggestions && searchIng && filteredIngredients.length === 0 && (
                                                        <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-[100] px-4 py-3 text-sm text-gray-400">
                                                            No se encontraron insumos
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="col-span-4">
                                                    <input
                                                        className="w-full h-11 text-sm font-bold border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 text-center text-text-main dark:text-white outline-none focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm"
                                                        placeholder="0"
                                                        type="number"
                                                        inputMode="decimal"
                                                        value={qtyIng}
                                                        onChange={(e) => setQtyIng(e.target.value)}
                                                        onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                    />
                                                </div>
                                                <div className="col-span-4">
                                                    <select
                                                        className="w-full h-11 px-3 text-xs border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-900 appearance-none bg-none cursor-pointer text-text-main dark:text-white outline-none focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 shadow-sm"
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
                                                <div className="col-span-4">
                                                    <button
                                                        className="w-full h-11 flex items-center justify-center rounded-xl bg-primary text-[#102218] hover:bg-primary-hover font-bold shadow-sm transition-all active:scale-95"
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
                            </div>}
                        </div>

                        {/* COLUMNA DERECHA: Imagen y Acciones */}
                        <div className="flex flex-col gap-6">

                            <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-4 group hover:border-primary/50 transition-colors relative">
                                <div className="flex items-center justify-between mb-4">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Foto del servicio
                                    </label>
                                </div>

                                <div className="flex items-center gap-5 mt-2 relative">
                                    {/* Caja de Imagen */}
                                    <div className="size-28 shrink-0 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center group-hover:bg-blue-50 dark:group-hover:bg-blue-900/10 transition-colors overflow-hidden relative">
                                        {previewUrl ? (
                                            <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="material-symbols-outlined text-gray-400 group-hover:text-primary text-4xl transition-colors">cloud_upload</span>
                                        )}
                                        {uploadingImage && (
                                            <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1">
                                                <div className="size-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                {statusText && <span className="text-white text-[10px] font-medium text-center px-1">{statusText}</span>}
                                            </div>
                                        )}

                                        {/* Botón Eliminar Imagen (solo visible si hay url, sobrepuesto en el borde sup-der del recuadro) */}
                                        {previewUrl && !uploadingImage && (
                                            <button
                                                type="button"
                                                onClick={deleteImage}
                                                className="absolute top-1 right-1 size-6 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-colors z-20"
                                                title="Eliminar imagen"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">delete</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* Controles apilados lado derecho */}
                                    <div className="flex-1 flex flex-col gap-2.5">
                                        {/* Cámara */}
                                        <button
                                            type="button"
                                            onClick={triggerCamera}
                                            disabled={uploadingImage}
                                            className="h-9 w-full flex items-center justify-center gap-2 bg-primary text-[#102218] rounded-xl font-bold text-xs cursor-pointer active:scale-95 transition-transform shadow-sm"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                                            <span>Cámara</span>
                                        </button>

                                        {/* Subir */}
                                        <label className="h-9 w-full flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-xs cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all shadow-sm">
                                            <span className="material-symbols-outlined text-[18px]">upload_file</span>
                                            <span>Subir foto</span>
                                            <input
                                                type="file"
                                                className="hidden"
                                                accept="image/*"
                                                onChange={handleImageSelect}
                                                disabled={uploadingImage}
                                            />
                                        </label>

                                        {/* Pegar (disponible también en móvil y tablet) */}
                                        <button
                                            type="button"
                                            onClick={handlePasteClick}
                                            className="flex h-9 w-full items-center justify-center gap-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-xs hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all shadow-sm"
                                            disabled={uploadingImage}
                                            title="Pegar imagen del portapapeles"
                                            aria-label="Pegar imagen del portapapeles"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">content_paste</span>
                                            <span>Pegar imagen</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-4 flex flex-col relative overflow-hidden">

                                <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300 mb-3 relative z-10">
                                    Apodos del servicio
                                </h3>
                                <div className="relative mb-4 relative z-10">
                                    <input
                                        className="w-full h-10 pl-3 pr-20 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white outline-none shadow-sm"
                                        placeholder="Ej: Corte, Tintura..."
                                        type="text"
                                        value={nicknameInput}
                                        onChange={(e) => setNicknameInput(e.target.value)}
                                        onKeyDown={async (e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                const trimmed = nicknameInput.trim();
                                                if (!trimmed || nicknames.includes(trimmed)) return;
                                                const { data } = await supabase
                                                    .from('products')
                                                    .select('id, name')
                                                    .eq('business_id', profile!.business_id)
                                                    .contains('nicknames', [trimmed])
                                                    .neq('id', productToEdit?.id ?? '00000000-0000-0000-0000-000000000000')
                                                    .limit(1);
                                                if (data && data.length > 0) {
                                                    showToast(`El apodo "${trimmed}" ya existe en "${data[0].name}"`, 'warning');
                                                    return;
                                                }
                                                setNicknames([...nicknames, trimmed]);
                                                setNicknameInput('');
                                            }
                                        }}
                                    />
                                    {nicknameInput.trim() && (
                                        <button
                                            className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer"
                                            type="button"
                                            onClick={async () => {
                                                const trimmed = nicknameInput.trim();
                                                if (!trimmed || nicknames.includes(trimmed)) return;
                                                const { data } = await supabase
                                                    .from('products')
                                                    .select('id, name')
                                                    .eq('business_id', profile!.business_id)
                                                    .contains('nicknames', [trimmed])
                                                    .neq('id', productToEdit?.id ?? '00000000-0000-0000-0000-000000000000')
                                                    .limit(1);
                                                if (data && data.length > 0) {
                                                    showToast(`El apodo "${trimmed}" ya existe en "${data[0].name}"`, 'warning');
                                                    return;
                                                }
                                                setNicknames([...nicknames, trimmed]);
                                                setNicknameInput('');
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

                            <div className="pt-6 grid grid-cols-2 gap-4 mt-auto">
                                <button onClick={handleBack} className="h-11 px-4 py-2 text-base font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" type="button">Cancelar</button>
                                <AppButton
                                    isLoading={loading || uploadingImage}
                                    className="h-11 px-4 py-2 text-base font-medium text-[#102218] bg-primary rounded-lg hover:bg-primary-hover shadow-sm transition-colors"
                                    type="submit"
                                >
                                    {productToEdit ? 'Actualizar Servicio' : 'Crear Servicio'}
                                </AppButton>
                            </div>
                        </div>
                    </form>
                </div >

                {/* Image Cropper Modal */}
                {
                    showCropper && cropperImageSrc && (
                        <ImageCropper
                            imageSrc={cropperImageSrc}
                            onCropComplete={onCropComplete}
                            onCancel={onCropCancel}
                            aspectRatio={1}
                        />
                    )
                }
                {showInAppCamera && (
                    <InAppCamera onCapture={onCameraCapture} onClose={onCameraClose} />
                )}

                {/* Modal post-creación */}
                {showSuccessModal && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
                        <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-2xl p-6 mx-4 w-full max-w-xs flex flex-col items-center gap-4 animate-[fadeIn_0.2s_ease-out]">
                            <div className="size-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                <span className="material-symbols-outlined text-emerald-500 text-3xl">check_circle</span>
                            </div>
                            <div className="text-center">
                                <p className="text-base font-bold text-gray-900 dark:text-white">
                                    {productToEdit ? '¡Servicio actualizado!' : '¡Servicio creado!'}
                                </p>
                                {!productToEdit && (
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">¿Qué deseas hacer ahora?</p>
                                )}
                            </div>
                            <div className="flex flex-col gap-2 w-full">
                                {!productToEdit && (
                                    <button
                                        onClick={() => {
                                            setShowSuccessModal(false);
                                            // Reset fields
                                            setProductName('');
                                            setCategoryId('');
                                            setPrice('');
                                            setCost('');
                                            setNicknames([]);
                                            setNicknameInput('');
                                            setRecipeItems([]);
                                            // resetImage (no deleteImage): la imagen ya quedó
                                            // asociada al servicio guardado.
                                            resetImage();
                                            document.getElementById('service-product-scroll')?.scrollTo(0, 0);
                                        }}
                                        className="w-full h-11 flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-[#102218] font-bold rounded-xl transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-lg">add_circle</span>
                                        Crear otro
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        setShowSuccessModal(false);
                                        onNavigate(originScreen ?? Screen.PRODUCTS);
                                    }}
                                    className="w-full h-11 flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-bold rounded-xl transition-colors"
                                >
                                    <span className="material-symbols-outlined text-lg">arrow_back</span>
                                    Salir
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
