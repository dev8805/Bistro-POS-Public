import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Screen, ProductType, SalePresentation } from '../types';
import { CategorySelector } from '../components/CategorySelector';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { capitalizeWords } from '../lib/formatters';
import { useImageUpload } from '../hooks/useImageUpload';
import { ImageCropper } from '../components/ImageCropper';
import { InAppCamera } from '../components/InAppCamera';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { Product as AdminProduct } from '../hooks/useProducts';
import { useToast } from '../context/ToastContext';
import { AppButton } from '../components/ui/AppButton';
import { lookupBarcode, saveProductToBarcodeCatalog } from '../lib/barcodeLookup';
import TypeChangeWarningModal from '../components/TypeChangeWarningModal';
import { executeTypeChange, getProductTypeKey, type ProductTypeKey } from '../lib/productTypeChange';
import { useSuppliers } from '../hooks/useSuppliers';

interface SimpleProductScreenProps {
    onNavigate: (screen: Screen) => void;
    productToEdit?: AdminProduct | null;
    originScreen?: Screen;
    isOnline?: boolean;
}

interface PurchaseUnitEntry {
    id?: string;
    unit_name: string;
    conversion_factor: string;
    isCustom: boolean;
}

interface PurchaseUnitSelectorProps {
    value: string;
    onChange: (newValue: string) => void;
    customOptions?: string[];
}

const PurchaseUnitSelector: React.FC<PurchaseUnitSelectorProps> = ({ value, onChange, customOptions = [] }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const triggerRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);

    const defaultOptions = [
        'Bulto', 'Saco', 'Caja', 'Paca', 'Canasta', 'Paquete', 'Bolsa', 'Atado',
        'Kilogramos', 'Libras', 'Display', 'Tira', 'Bandeja', 'Botella', 'Galón',
        'Balde / Tobo', 'Unidad'
    ];

    // Unir las opciones default con las personalizadas del negocio (sin duplicados)
    const allOptions = [...defaultOptions, ...customOptions.filter(c => !defaultOptions.includes(c))];

    React.useEffect(() => {
        if (!isOpen) return;

        const handleClose = (e: MouseEvent) => {
            if (triggerRef.current?.contains(e.target as Node) || dropdownRef.current?.contains(e.target as Node)) return;
            setIsOpen(false);
        };

        const updatePosition = () => {
            if (triggerRef.current) {
                setTriggerRect(triggerRef.current.getBoundingClientRect());
            }
        };

        const handleScroll = (e: Event) => {
            // Ignorar scroll interno del dropdown (lista de opciones) — solo reposicionar en scroll externo
            if (dropdownRef.current?.contains(e.target as Node)) return;
            updatePosition();
        };

        // Forzar re-render cuando cambia el visual viewport (apertura/cierre de teclado en móvil)
        // para reanclar el dropdown justo encima del teclado.
        const handleViewportChange = () => updatePosition();

        document.addEventListener('mousedown', handleClose);
        document.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', updatePosition);
        window.visualViewport?.addEventListener('resize', handleViewportChange);
        window.visualViewport?.addEventListener('scroll', handleViewportChange);

        // Foco con preventScroll para que el navegador no haga su propio scroll mientras nosotros reposicionamos
        const focusTimer = setTimeout(() => {
            inputRef.current?.focus({ preventScroll: true });
        }, 60);

        return () => {
            clearTimeout(focusTimer);
            document.removeEventListener('mousedown', handleClose);
            document.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', updatePosition);
            window.visualViewport?.removeEventListener('resize', handleViewportChange);
            window.visualViewport?.removeEventListener('scroll', handleViewportChange);
        };
    }, [isOpen]);

    React.useEffect(() => {
        if (!isOpen) setSearchQuery('');
    }, [isOpen]);

    const handleToggle = () => {
        if (!isOpen && triggerRef.current) {
            setTriggerRect(triggerRef.current.getBoundingClientRect());
        }
        setIsOpen(v => !v);
    };

    const handleSelectOption = (option: string) => {
        onChange(option);
        setIsOpen(false);
    };

    const filteredOptions = allOptions.filter(opt => opt.toLowerCase().includes(searchQuery.toLowerCase()));
    const exactMatch = allOptions.some(opt => opt.toLowerCase() === searchQuery.trim().toLowerCase());
    const showCreateOption = searchQuery.trim().length > 0 && !exactMatch;

    const getDropdownStyle = (): React.CSSProperties => {
        if (!triggerRect) return {};

        const vv = window.visualViewport;
        const layoutH = window.innerHeight;
        const visualH = vv?.height ?? layoutH;
        // Detectamos teclado abierto cuando el visual viewport es notablemente más pequeño que el layout viewport
        const keyboardOpen = layoutH - visualH > 150;
        const isMobile = window.innerWidth < 768;

        if (isMobile && keyboardOpen) {
            // Anclamos el dropdown justo encima del teclado: el buscador (que está abajo)
            // queda siempre visible y la lista crece hacia arriba.
            const keyboardTopY = (vv?.offsetTop ?? 0) + visualH;
            const anchorY = keyboardTopY - 8;
            return {
                position: 'fixed',
                left: triggerRect.left,
                width: triggerRect.width,
                top: anchorY,
                transform: 'translateY(-100%)',
                maxHeight: Math.min(320, anchorY - 16),
                zIndex: 9999,
            };
        }

        // Desktop / sin teclado: dropdown encima del trigger
        const spaceAbove = triggerRect.top - 8;
        return {
            position: 'fixed',
            left: triggerRect.left,
            width: triggerRect.width,
            top: triggerRect.top - 4,
            transform: 'translateY(-100%)',
            maxHeight: Math.min(260, Math.max(140, spaceAbove)),
            zIndex: 9999,
        };
    };

    return (
        <div className="relative w-full">
            <button
                ref={triggerRef}
                type="button"
                onClick={handleToggle}
                className="w-full h-10 px-3 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm flex items-center justify-between outline-none text-left focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                aria-label="Seleccionar o crear unidad de compra"
            >
                <span className={value ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-400 dark:text-gray-500 font-normal'}>
                    {value || 'Elegir unidad...'}
                </span>
                <span className="material-symbols-outlined text-gray-500 transition-transform duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }}>
                    expand_more
                </span>
            </button>

            {isOpen && triggerRect && (
                <div
                    ref={dropdownRef}
                    style={getDropdownStyle()}
                    className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl flex flex-col overflow-hidden animate-[fadeIn_0.15s_ease-out]"
                >
                    <ul className="overflow-y-auto flex-1 divide-y divide-gray-50 dark:divide-gray-800 custom-scrollbar" role="listbox">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((opt) => (
                                <li
                                    key={opt}
                                    role="option"
                                    aria-selected={opt === value}
                                    tabIndex={0}
                                    onClick={() => handleSelectOption(opt)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSelectOption(opt)}
                                    className={`px-3 py-2.5 text-sm text-gray-800 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors flex items-center justify-between ${opt === value ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold' : ''}`}
                                >
                                    <span>{opt}</span>
                                    {opt === value && (
                                        <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-sm">check</span>
                                    )}
                                </li>
                            ))
                        ) : (
                            <li className="px-3 py-4 text-xs text-gray-400 dark:text-gray-500 text-center italic">
                                Ninguna unidad coincide
                            </li>
                        )}
                    </ul>

                    <div className="p-2 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex gap-2 items-center shrink-0">
                        <div className="relative flex-1">
                            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-base">search</span>
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="Buscar o escribir nueva..."
                                className="w-full h-9 pl-8 pr-3 text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-gray-900 dark:text-white"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (showCreateOption) handleSelectOption(searchQuery.trim());
                                        else if (filteredOptions.length > 0) handleSelectOption(filteredOptions[0]);
                                    }
                                }}
                            />
                        </div>
                        {showCreateOption && (
                            <button
                                type="button"
                                onClick={() => handleSelectOption(searchQuery.trim())}
                                className="h-9 px-3 bg-blue-500 hover:bg-blue-600 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 shrink-0 active:scale-95 transition-all shadow-sm"
                            >
                                <span className="material-symbols-outlined text-sm">add_circle</span>
                                <span>Crear</span>
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export const SimpleProductScreen: React.FC<SimpleProductScreenProps> = ({ onNavigate, productToEdit, originScreen, isOnline = true }) => {
    const { profile } = useAuth();
    const { showToast } = useToast();
    const { suppliers: allSuppliers, createSupplier } = useSuppliers();
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
        onCameraClose,
    } = useImageUpload(productToEdit?.image_url || null);

    const [salesUnit, setSalesUnit] = useState('');
    const [isForSale, setIsForSale] = useState(true);
    const [productName, setProductName] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [supplierId, setSupplierId] = useState('');
    const [barcode, setBarcode] = useState('');
    const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
    const [lookingUpBarcode, setLookingUpBarcode] = useState(false);
    const [duplicateProduct, setDuplicateProduct] = useState<{ name: string } | null>(null);
    const lastLookedUpRef = useRef('');
    const scannerTimestampsRef = useRef<number[]>([]);
    const scannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [nicknames, setNicknames] = useState<string[]>([]);
    const [nicknameInput, setNicknameInput] = useState('');
    const [purchaseUnits, setPurchaseUnits] = useState<PurchaseUnitEntry[]>([]);
    const [showPurchaseUnitModal, setShowPurchaseUnitModal] = useState(false);
    const [editingUnitIdx, setEditingUnitIdx] = useState<number | null>(null);
    const [modalUnit, setModalUnit] = useState<{ unit_name: string; conversion_factor: string }>({ unit_name: '', conversion_factor: '' });
    const [businessCustomUnits, setBusinessCustomUnits] = useState<string[]>([]);

    // Presentaciones de venta (Múltiples presentaciones con stock unificado)
    const [salePresentations, setSalePresentations] = useState<SalePresentation[]>([]);
    const [showSalePresentationModal, setShowSalePresentationModal] = useState(false);
    const [editingPresentationIdx, setEditingPresentationIdx] = useState<number | null>(null);
    const [modalPresentation, setModalPresentation] = useState<{
        id?: string;
        unit_name: string;
        conversion_factor: string;
        price: string;
        barcode: string;
        image_url: string;
        nicknames?: string[];
    }>({
        unit_name: '',
        conversion_factor: '',
        price: '',
        barcode: '',
        image_url: '',
        nicknames: []
    });
    const [presentationNicknameInput, setPresentationNicknameInput] = useState('');
    const [uploadingPresentationImage, setUploadingPresentationImage] = useState(false);
    const [showPresentationScanner, setShowPresentationScanner] = useState(false);

    const handleAddPresentationNickname = async () => {
        const trimmed = presentationNicknameInput.trim();
        if (!trimmed) return;
        const currentNicks = modalPresentation.nicknames || [];
        if (currentNicks.map(n => n.toLowerCase()).includes(trimmed.toLowerCase())) {
            setPresentationNicknameInput('');
            return;
        }
        if (profile?.business_id) {
            const { data } = await supabase
                .from('products')
                .select('id, name')
                .eq('business_id', profile.business_id)
                .contains('nicknames', [trimmed])
                .neq('id', productToEdit?.id ?? '00000000-0000-0000-0000-000000000000')
                .limit(1);
            if (data && data.length > 0) {
                showToast(`El apodo "${trimmed}" ya existe en "${data[0].name}"`, 'warning');
                return;
            }
        }
        setModalPresentation(prev => ({
            ...prev,
            nicknames: [...(prev.nicknames || []), trimmed]
        }));
        setPresentationNicknameInput('');
    };

    const handleRemovePresentationNickname = (index: number) => {
        setModalPresentation(prev => ({
            ...prev,
            nicknames: (prev.nicknames || []).filter((_, i) => i !== index)
        }));
    };

    const compressAndUploadPresentationImage = async (file: File): Promise<string> => {
        if (!profile?.business_id) throw new Error('No business id');
        let blobToUpload: Blob = file;
        let contentType = file.type || 'image/jpeg';
        let ext = 'jpg';

        try {
            const bitmap = await createImageBitmap(file);
            let w = bitmap.width;
            let h = bitmap.height;
            const maxDim = 1000;
            if (w > maxDim || h > maxDim) {
                const scale = maxDim / Math.max(w, h);
                w = Math.round(w * scale);
                h = Math.round(h * scale);
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(bitmap, 0, 0, w, h);
                const webpBlob = await new Promise<Blob | null>(resolve =>
                    canvas.toBlob(resolve, 'image/webp', 0.82)
                );
                canvas.width = 0;
                canvas.height = 0;
                if (webpBlob) {
                    blobToUpload = webpBlob;
                    contentType = 'image/webp';
                    ext = 'webp';
                }
            }
            bitmap.close();
        } catch {
            // Fallback a archivo original
        }

        const fileName = `${profile.business_id}/${Date.now()}_pres_${Math.random().toString(36).substring(7)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
            .from('product-images')
            .upload(fileName, blobToUpload, {
                contentType,
                cacheControl: '31536000'
            });

        if (uploadErr) throw uploadErr;

        const { data } = supabase.storage.from('product-images').getPublicUrl(fileName);
        if (!data?.publicUrl) throw new Error('No se pudo obtener URL pública');
        return data.publicUrl;
    };

    const handlePresentationImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !profile?.business_id) return;
        try {
            setUploadingPresentationImage(true);
            const publicUrl = await compressAndUploadPresentationImage(file);
            setModalPresentation(prev => ({ ...prev, image_url: publicUrl }));
            showToast('Imagen subida exitosamente', 'success');
        } catch (err: any) {
            console.error('Error subiendo imagen de presentación:', err);
            showToast('Error al subir la imagen', 'error');
        } finally {
            setUploadingPresentationImage(false);
            e.target.value = '';
        }
    };

    const handlePresentationPasteClick = async () => {
        if (!profile?.business_id) return;
        if (typeof navigator === 'undefined' || !navigator.clipboard?.read) {
            showToast('Usa Ctrl+V o "Subir foto" en este navegador', 'info');
            return;
        }
        try {
            setUploadingPresentationImage(true);
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const imageType = item.types.find(type => type.startsWith('image/'));
                if (imageType) {
                    const blob = await item.getType(imageType);
                    const file = new File([blob], `paste_${Date.now()}.png`, { type: imageType });
                    const publicUrl = await compressAndUploadPresentationImage(file);
                    setModalPresentation(prev => ({ ...prev, image_url: publicUrl }));
                    showToast('Imagen pegada exitosamente', 'success');
                    return;
                }
            }
            showToast('No se encontró ninguna imagen en el portapapeles', 'info');
        } catch (err: any) {
            console.error('Error al pegar imagen de presentación:', err);
            showToast('Permiso denegado para el portapapeles o no hay imagen', 'warning');
        } finally {
            setUploadingPresentationImage(false);
        }
    };

    // Invoice Create Mode (creación desde factura)
    const [invoiceCreateMode, setInvoiceCreateMode] = useState(false);
    const [invoiceCreateInfo, setInvoiceCreateInfo] = useState<{ currentIndex: number; totalNew: number } | null>(null);

    // Cambio de tipo en modo edición
    const [pendingTypeChange, setPendingTypeChange] = useState<ProductTypeKey | null>(null);
    const [showTypeChangeModal, setShowTypeChangeModal] = useState(false);
    const [attemptedType, setAttemptedType] = useState<ProductTypeKey | null>(null);

    // Modal crear proveedor
    const [showNewSupplierModal, setShowNewSupplierModal] = useState(false);
    const [newSupplierName, setNewSupplierName] = useState('');
    const [newSupplierNit, setNewSupplierNit] = useState('');
    const [newSupplierPhone, setNewSupplierPhone] = useState('');
    const [newSupplierAddress, setNewSupplierAddress] = useState('');
    const [creatingSupplier, setCreatingSupplier] = useState(false);

    const currentType: ProductTypeKey = productToEdit
        ? getProductTypeKey(productToEdit.type, productToEdit.is_for_sale ?? true)
        : (isForSale ? 'sale' : 'insumo');

    // Tipo mostrado en el select: preferir el pendiente si existe, sino el actual
    const displayedType: ProductTypeKey = pendingTypeChange ?? currentType;

    // Vista efectiva: usa el tipo pendiente si existe, sino el tipo actual
    const isViewingForSale = displayedType === 'sale';
    const isViewingRecipe = displayedType === 'processed';

    // El ejemplo del nombre se adapta al tipo: un ingrediente no se vende, así que
    // "Coca Cola" confunde. Se usa un ejemplo de cocina.
    const namePlaceholder = displayedType === 'insumo' ? 'Ej: Tomate' : 'Ej: Coca Cola';

    // Global Paste Listener
    React.useEffect(() => {
        const pasteListener = async (e: ClipboardEvent) => {
            if (showSalePresentationModal) {
                if (e.clipboardData && e.clipboardData.items) {
                    const items = e.clipboardData.items;
                    for (let i = 0; i < items.length; i++) {
                        if (items[i].type.indexOf('image') !== -1) {
                            const file = items[i].getAsFile();
                            if (file && profile?.business_id) {
                                e.preventDefault();
                                try {
                                    setUploadingPresentationImage(true);
                                    const publicUrl = await compressAndUploadPresentationImage(file);
                                    setModalPresentation(prev => ({ ...prev, image_url: publicUrl }));
                                    showToast('Imagen pegada exitosamente', 'success');
                                } catch (err) {
                                    console.error('Error al subir imagen pegada:', err);
                                    showToast('Error al subir la imagen pegada', 'error');
                                } finally {
                                    setUploadingPresentationImage(false);
                                }
                                return;
                            }
                        }
                    }
                }
                return;
            }
            handlePaste(e);
        };
        window.addEventListener('paste', pasteListener);
        return () => window.removeEventListener('paste', pasteListener);
    }, [handlePaste, showSalePresentationModal, profile?.business_id]);

    // Intención de crear un Insumo llegada desde otro formulario (ej. selector de "Crear Receta").
    // La bandera se consume una sola vez para no afectar la próxima creación.
    React.useEffect(() => {
        if (productToEdit) return;
        if (sessionStorage.getItem('bistro_create_product_as_insumo') === 'true') {
            sessionStorage.removeItem('bistro_create_product_as_insumo');
            setIsForSale(false);
        }
    }, [productToEdit]);

    // Leer prefill de Invoice Create Mode desde sessionStorage
    React.useEffect(() => {
        if (productToEdit) return;
        try {
            const raw = sessionStorage.getItem('bistro_invoice_create_prefill');
            if (!raw) return;
            sessionStorage.removeItem('bistro_invoice_create_prefill');

            const prefill = JSON.parse(raw);
            if (!prefill || prefill.fromInvoiceCreate !== true) return;

            setInvoiceCreateMode(true);
            setInvoiceCreateInfo({ currentIndex: prefill.currentIndex, totalNew: prefill.totalNew });

            // Prefill fields
            if (prefill.name) setProductName(prefill.name);
            if (prefill.cost > 0) setCost(formatNumber(prefill.cost.toString()));
            if (prefill.barcode) setBarcode(prefill.barcode);
            if (prefill.supplierId) setSupplierId(prefill.supplierId);
            // Unidad de venta sugerida por la IA (si la envió)
            if (prefill.suggestedUnit) setSalesUnit(prefill.suggestedUnit);
            // Categoría sugerida: buscar la que coincida por nombre
            if (prefill.suggestedCategory && profile?.business_id) {
                supabase
                    .from('categories')
                    .select('id, name')
                    .eq('business_id', profile.business_id)
                    .eq('is_active', true)
                    .then(({ data }) => {
                        if (!data) return;
                        const matched = data.find(
                            c => c.name.toLowerCase().includes(prefill.suggestedCategory.toLowerCase())
                        );
                        if (matched) setCategoryId(matched.id);
                    });
            }
        } catch { /* ignore corrupt sessionStorage */ }
    }, [productToEdit]);

    // Populate form if editing
    React.useEffect(() => {
        if (productToEdit) {
            setProductName(productToEdit.name);
            setCategoryId(productToEdit.category_id || '');
            setStock(formatStockNumber(productToEdit.stock?.toString() || '0'));
            setPrice(formatNumber(productToEdit.price.toString()));
            setCost(formatNumber(productToEdit.cost.toString()));
            setSalesUnit(productToEdit.unit);
            setIsForSale(productToEdit.is_for_sale ?? true);
            setNicknames(productToEdit.nicknames || []);
            setBarcode(productToEdit.barcode || '');
            setSupplierId((productToEdit as any).default_supplier_id || '');

            // Cargar unidades de compra
            const loadPurchaseUnits = async () => {
                const { data, error } = await supabase
                    .from('product_purchase_units')
                    .select('id, unit_name, conversion_factor')
                    .eq('product_id', productToEdit.id);

                if (!error && data) {
                    const knownUnits = ['Caja', 'Paca', 'Unidad', 'Paquete', 'Bulto', 'Galón'];
                    const mapped: PurchaseUnitEntry[] = data.map(d => ({
                        id: d.id,
                        unit_name: d.unit_name,
                        conversion_factor: d.conversion_factor.toString(),
                        isCustom: !knownUnits.includes(d.unit_name)
                    }));

                    if (mapped.length === 0 && (productToEdit as any).purchase_unit) {
                        const legacyName = (productToEdit as any).purchase_unit;
                        mapped.push({
                            unit_name: legacyName,
                            conversion_factor: ((productToEdit as any).conversion_factor?.toString() || '1'),
                            isCustom: !knownUnits.includes(legacyName)
                        });
                    }
                    setPurchaseUnits(mapped);
                }
            };
            loadPurchaseUnits();

            if (productToEdit.sale_presentations && Array.isArray(productToEdit.sale_presentations)) {
                setSalePresentations(productToEdit.sale_presentations);
            }
        }
    }, [productToEdit]);

    // Cargar unidades de compra personalizadas del negocio
    React.useEffect(() => {
        if (!profile?.business_id) return;
        const loadCustomUnits = async () => {
            const { data } = await supabase
                .from('product_purchase_units')
                .select('unit_name, product_id!inner(business_id)')
                .eq('product_id.business_id', profile.business_id);

            if (data) {
                const unique = [...new Set(data.map((d: any) => d.unit_name))];
                setBusinessCustomUnits(unique);
            }
        };
        loadCustomUnits();
    }, [profile?.business_id]);

    // Numeric States
    const [stock, setStock] = useState('');
    const [price, setPrice] = useState('');
    const [cost, setCost] = useState('');

    const formatNumber = (value: string) => {
        if (!value) return '';
        const rawValue = value.replace(/\D/g, '');
        return rawValue.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    };

    const formatStockNumber = (value: string) => {
        if (!value) return '';
        const cleaned = value.replace(/[^0-9.,]/g, '').replace(',', '.');
        const parts = cleaned.split('.');
        if (parts.length > 2) return parts[0] + '.' + parts.slice(1).join('');
        return cleaned;
    };

    const parseStockNumber = (value: string) => {
        return parseFloat(value) || 0;
    };

    const parseNumber = (value: string) => {
        return parseFloat(value.replace(/\./g, '')) || 0;
    };

    const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value;
        if (value === 'service') {
            onNavigate(Screen.CREATE_PRODUCT_SERVICE);
            return;
        }
        // La Receta vive en su propio editor (ingredientes, modo de costo), así que
        // se navega allá. Se limpia la bandera de Insumo para no arrastrar la
        // intención de "crear como ingrediente" al formulario de receta.
        if (value === 'processed') {
            sessionStorage.removeItem('bistro_create_product_as_insumo');
            onNavigate(Screen.CREATE_PRODUCT_PROCESSED);
            return;
        }
        setIsForSale(value === 'sale');
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

    const handleUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedUnit = e.target.value;
        setSalesUnit(selectedUnit);
    };

    const getAbbreviation = (unit: string) => {
        switch (unit) {
            case 'Libras': return 'Lb';
            case 'Kilogramos': return 'Kg';
            case 'Gramos': return 'g';
            case 'Onzas': return 'oz';
            case 'Arrobas': return '@';
            case 'Toneladas': return 't';
            case 'Litros': return 'L';
            case 'Mililitros': return 'ml';
            case 'Galones': return 'gal';
            case 'Metros': return 'm';
            case 'Centímetros': return 'cm';
            case 'Pulgadas': return 'in';
            case 'Unidad': return 'Und';
            default: return unit;
        }
    };

    const toSingular = (unit: string) => {
        const map: Record<string, string> = {
            'Kilogramos': 'kilo', 'Libras': 'libra', 'Gramos': 'gramo',
            'Onzas': 'onza', 'Arrobas': 'arroba', 'Toneladas': 'tonelada',
            'Litros': 'litro', 'Mililitros': 'mililitro', 'Galones': 'galón',
            'Metros': 'metro', 'Centímetros': 'centímetro', 'Pulgadas': 'pulgada',
            'Unidad': 'unidad',
        };
        return map[unit] || unit.toLowerCase();
    };

    const salesUnitAbbr = salesUnit ? getAbbreviation(salesUnit) : '';
    const salesUnitSingular = salesUnit ? toSingular(salesUnit) : '';
    const salesUnitPlural = (!salesUnit || salesUnit === 'Unidad') ? 'Unidades' : salesUnit;

    const unitExamples = useMemo(() => {
        switch (salesUnit) {
            case 'Libras':
                return {
                    bannerExamples: 'arroba, bulto, media libra, etc.',
                    presentationNamePlaceholder: 'Ej: Arroba (25 lb), Bulto, Media Libra...',
                    presentationFactorPlaceholder: 'Ej: 25',
                    purchaseFactorPlaceholder: 'Ej: 100',
                };
            case 'Kilogramos':
                return {
                    bannerExamples: 'bulto, arroba, medio kilo, etc.',
                    presentationNamePlaceholder: 'Ej: Bulto (50 kg), Saco, Arroba (12.5 kg)...',
                    presentationFactorPlaceholder: 'Ej: 50',
                    purchaseFactorPlaceholder: 'Ej: 50',
                };
            case 'Gramos':
                return {
                    bannerExamples: 'libra (500g), kilo (1000g), porción, etc.',
                    presentationNamePlaceholder: 'Ej: Libra (500g), Kilo (1000g), Porción...',
                    presentationFactorPlaceholder: 'Ej: 500',
                    purchaseFactorPlaceholder: 'Ej: 1000',
                };
            case 'Onzas':
                return {
                    bannerExamples: 'libra (16 oz), vaso (12 oz), porción, etc.',
                    presentationNamePlaceholder: 'Ej: Libra (16 oz), Vaso (12 oz), Copa...',
                    presentationFactorPlaceholder: 'Ej: 16',
                    purchaseFactorPlaceholder: 'Ej: 32',
                };
            case 'Arrobas':
                return {
                    bannerExamples: 'bulto (4@), carga (10@), etc.',
                    presentationNamePlaceholder: 'Ej: Bulto (4@), Carga (10@)...',
                    presentationFactorPlaceholder: 'Ej: 4',
                    purchaseFactorPlaceholder: 'Ej: 4',
                };
            case 'Litros':
                return {
                    bannerExamples: 'garrafa, galón, botella, caja, etc.',
                    presentationNamePlaceholder: 'Ej: Garrafa, Galón, Botella, Caja...',
                    presentationFactorPlaceholder: 'Ej: 5',
                    purchaseFactorPlaceholder: 'Ej: 20',
                };
            case 'Mililitros':
                return {
                    bannerExamples: 'botella (750ml), lata (350ml), vaso, etc.',
                    presentationNamePlaceholder: 'Ej: Botella (750ml), Lata (350ml), Vaso...',
                    presentationFactorPlaceholder: 'Ej: 750',
                    purchaseFactorPlaceholder: 'Ej: 1000',
                };
            case 'Galones':
                return {
                    bannerExamples: 'paila (5 gal), caneca, tambor, etc.',
                    presentationNamePlaceholder: 'Ej: Paila (5 gal), Caneca, Tambor...',
                    presentationFactorPlaceholder: 'Ej: 5',
                    purchaseFactorPlaceholder: 'Ej: 55',
                };
            case 'Metros':
                return {
                    bannerExamples: 'rollo, bobina, paquete, etc.',
                    presentationNamePlaceholder: 'Ej: Rollo, Bobina, Paquete...',
                    presentationFactorPlaceholder: 'Ej: 50',
                    purchaseFactorPlaceholder: 'Ej: 100',
                };
            case 'Unidad':
            default:
                return {
                    bannerExamples: 'cubeta, paquete, display, cajetilla, etc.',
                    presentationNamePlaceholder: 'Ej: Cubeta, Paquete, Cajetilla, Six Pack...',
                    presentationFactorPlaceholder: 'Ej: 30',
                    purchaseFactorPlaceholder: 'Ej: 24',
                };
        }
    }, [salesUnit]);

    const checkBarcodeExists = useCallback(async (code: string): Promise<boolean> => {
        if (!profile?.business_id) return false;
        const { data } = await supabase
            .from('products')
            .select('id, name')
            .eq('business_id', profile.business_id)
            .eq('barcode', code)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

        // Si estamos editando, ignorar el propio producto
        if (data && productToEdit && data.id === productToEdit.id) return false;

        if (data) {
            setDuplicateProduct({ name: data.name });
            setBarcode('');
            lastLookedUpRef.current = '';
            return true;
        }
        return false;
    }, [profile?.business_id, productToEdit]);

    const handleBarcodeLookup = useCallback(async (code: string) => {
        const trimmed = code.trim();
        if (trimmed.length < 4 || trimmed === lastLookedUpRef.current) return;
        lastLookedUpRef.current = trimmed;

        setLookingUpBarcode(true);
        try {
            const isDuplicate = await checkBarcodeExists(trimmed);
            if (isDuplicate) return;

            const result = await lookupBarcode(trimmed);
            if (result) {
                if (!productName) {
                    setProductName(result.productName);
                }
                showToast(`Producto encontrado: ${result.productName}`, 'success');
            }
        } catch (err) {
            console.error('[barcodeLookup] Error:', err);
        } finally {
            setLookingUpBarcode(false);
        }
    }, [productName, showToast, checkBarcodeExists]);

    const handleBarcodeScan = useCallback((scannedCode: string) => {
        setBarcode(scannedCode);
        setShowBarcodeScanner(false);
        handleBarcodeLookup(scannedCode);
    }, [handleBarcodeLookup]);

    const [lookingUpPresentationBarcode, setLookingUpPresentationBarcode] = useState(false);
    const lastLookedUpPresentationRef = useRef('');
    const presentationScannerTimestampsRef = useRef<number[]>([]);
    const presentationScannerTimerRef = useRef<NodeJS.Timeout | null>(null);

    const checkPresentationBarcodeExists = useCallback(async (code: string): Promise<boolean> => {
        if (!code) return false;
        const clean = code.trim();
        if (barcode && barcode.trim() === clean) {
            showToast('Este código de barras ya pertenece a la unidad base de este producto', 'warning');
            return true;
        }

        const duplicateInLocal = salePresentations.some((p, idx) => {
            if (editingPresentationIdx !== null && idx === editingPresentationIdx) return false;
            return p.barcode && p.barcode.trim() === clean;
        });
        if (duplicateInLocal) {
            showToast('Este código de barras ya está asignado a otra presentación', 'warning');
            return true;
        }

        if (!profile?.business_id) return false;
        const { data } = await supabase
            .from('products')
            .select('id, name')
            .eq('business_id', profile.business_id)
            .eq('barcode', clean)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

        if (data && (!productToEdit || data.id !== productToEdit.id)) {
            setDuplicateProduct({ name: data.name });
            setModalPresentation(prev => ({ ...prev, barcode: '' }));
            lastLookedUpPresentationRef.current = '';
            return true;
        }

        return false;
    }, [barcode, salePresentations, editingPresentationIdx, profile?.business_id, productToEdit, showToast]);

    const handlePresentationBarcodeLookup = useCallback(async (code: string) => {
        const trimmed = code.trim();
        if (trimmed.length < 4 || trimmed === lastLookedUpPresentationRef.current) return;
        lastLookedUpPresentationRef.current = trimmed;

        setLookingUpPresentationBarcode(true);
        try {
            const isDuplicate = await checkPresentationBarcodeExists(trimmed);
            if (isDuplicate) return;

            const result = await lookupBarcode(trimmed);
            if (result) {
                setModalPresentation(prev => ({
                    ...prev,
                    unit_name: result.productName || prev.unit_name
                }));
                showToast(`Producto encontrado: ${result.productName}`, 'success');
            }
        } catch (err) {
            console.error('[barcodeLookup presentation] Error:', err);
        } finally {
            setLookingUpPresentationBarcode(false);
        }
    }, [checkPresentationBarcodeExists, showToast]);

    const handleBack = () => {
        if (invoiceCreateMode) {
            try {
                sessionStorage.setItem('bistro_invoice_create_result', JSON.stringify({ action: 'cancelled' }));
            } catch { /* ignore */ }
            onNavigate(Screen.CREATE_FROM_INVOICE);
            return;
        }
        onNavigate(originScreen ?? Screen.PRODUCTS);
    };

    const handleInvoiceSkip = () => {
        try {
            sessionStorage.setItem('bistro_invoice_create_result', JSON.stringify({ action: 'skipped' }));
        } catch { /* ignore */ }
        onNavigate(Screen.CREATE_FROM_INVOICE);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!navigator.onLine) {
            showToast('Necesitas conexión a internet para guardar productos', 'warning');
            return;
        }

        // Valor efectivo para el resto del guardado. Si hubo cambio de tipo sale↔insumo,
        // se actualiza para que el update posterior use el nuevo valor (el state React aún no
        // refleja el setIsForSale hasta el próximo render).
        let effectiveIsForSale = isForSale;

        // Cambio de tipo pendiente: aplicar antes del guardado normal
        if (productToEdit && pendingTypeChange && pendingTypeChange !== currentType) {
            setLoading(true);
            try {
                const result = await executeTypeChange(productToEdit.id, currentType, pendingTypeChange);
                if (!result.success) {
                    showToast(result.error || 'No se pudo cambiar el tipo del producto', 'error');
                    setLoading(false);
                    return;
                }

                // Si el destino es Receta, saltamos el guardado normal y vamos al editor de recetas
                if (pendingTypeChange === 'processed') {
                    markAsSaved();
                    showToast('Tipo de producto actualizado. Configurá la receta.', 'success');
                    setPendingTypeChange(null);
                    setLoading(false);
                    onNavigate(Screen.CREATE_PRODUCT_PROCESSED);
                    return;
                }

                // sale ↔ insumo: actualizar estado local y dejar que el guardado normal continúe
                // para persistir los otros cambios que el usuario haya hecho al formulario.
                effectiveIsForSale = pendingTypeChange === 'sale';
                setIsForSale(effectiveIsForSale);
                setPendingTypeChange(null);
                showToast('Tipo de producto actualizado', 'success');
            } catch (err: unknown) {
                console.error('[handleSave] Error en executeTypeChange:', err);
                showToast('No se pudo cambiar el tipo del producto', 'error');
                setLoading(false);
                return;
            }
        }

        if (!productName || !cost || !categoryId || !salesUnit || !profile?.business_id) {
            showToast('Por favor complete los campos obligatorios (*)', 'warning');
            return;
        }

        if (parseNumber(cost) <= 0) {
            showToast('El costo debe ser mayor a 0', 'warning');
            return;
        }

        if (!productToEdit && parseStockNumber(stock) < 0) {
            showToast('El stock inicial no puede ser negativo', 'warning');
            return;
        }

        setLoading(true);
        try {
            const productData: Record<string, any> = {
                business_id: profile.business_id,
                name: productName,
                category_id: categoryId || null,
                type: ProductType.SIMPLE,
                is_active: true,
                is_for_sale: effectiveIsForSale,
                cost: parseNumber(cost),
                price: effectiveIsForSale ? parseNumber(price) : 0,
                unit: salesUnit || 'Und',
                // NOTA: en la UI este tipo se llama "Ingrediente", pero el texto guardado en
                // `description` se mantiene como 'Insumo' a propósito. Es un valor histórico ya
                // presente en la BD de negocios activos; cambiarlo aquí dejaría los productos
                // viejos con un texto distinto a los nuevos. Si algún día se unifica, hay que
                // correr un UPDATE sobre products.description junto con este cambio.
                description: effectiveIsForSale ? 'Producto para venta' : 'Insumo',
                image_url: imageUrl,
                nicknames: effectiveIsForSale ? nicknames : [],
                purchase_unit: null,
                conversion_factor: 1,
                barcode: effectiveIsForSale ? (barcode.trim() || null) : null,
                default_supplier_id: supplierId || null,
                sale_presentations: effectiveIsForSale ? salePresentations : [],
            };

            if (!productToEdit) {
                productData.stock = parseStockNumber(stock);
            }

            let error;
            let finalProductId = productToEdit?.id;
            if (productToEdit) {
                // Update existing product
                const { error: updateError } = await supabase
                    .from('products')
                    .update(productData)
                    .eq('id', productToEdit.id);
                error = updateError;
            } else {
                // Create new product
                const { data, error: insertError } = await supabase
                    .from('products')
                    .insert([productData])
                    .select()
                    .single();
                error = insertError;

                if (data) {
                    finalProductId = data.id;
                }

                // Create initial lot if stock > 0
                if (!error && data && productData.stock > 0) {
                    await supabase
                        .from('inventory_lots')
                        .insert([{
                            business_id: profile.business_id,
                            product_id: data.id,
                            initial_quantity: productData.stock,
                            remaining_quantity: productData.stock,
                            unit_cost: productData.cost, // use the configured base cost
                            notes: 'Stock inicial de creación manual'
                        }]);
                }
            }

            // Sync purchase units (únicamente las configuradas explícitamente por el usuario)
            if (!error && finalProductId) {
                const idsToKeep = purchaseUnits.filter(u => u.id).map(u => u.id);
                if (idsToKeep.length > 0) {
                    await supabase.from('product_purchase_units')
                        .delete()
                        .eq('product_id', finalProductId)
                        .not('id', 'in', `(${idsToKeep.join(',')})`);
                } else {
                    await supabase.from('product_purchase_units')
                        .delete()
                        .eq('product_id', finalProductId);
                }

                const newUnits = purchaseUnits.filter(u => !u.id).map(u => ({
                    product_id: finalProductId,
                    unit_name: u.unit_name || 'Otra',
                    conversion_factor: parseFloat(u.conversion_factor) || 1
                }));
                const existingUnits = purchaseUnits.filter(u => u.id).map(u => ({
                    id: u.id,
                    product_id: finalProductId,
                    unit_name: u.unit_name || 'Otra',
                    conversion_factor: parseFloat(u.conversion_factor) || 1
                }));

                if (newUnits.length > 0) await supabase.from('product_purchase_units').insert(newUnits);
                if (existingUnits.length > 0) await supabase.from('product_purchase_units').upsert(existingUnits);
            }

            if (error) throw error;

            // Guardar en catálogo global de barcodes solo al CREAR (no al editar)
            // y solo si el producto tiene código, imagen y nombre. Sin los tres,
            // no aporta valor al catálogo y no se guarda.
            if (!productToEdit && effectiveIsForSale && barcode.trim() && productName.trim()) {
                await saveProductToBarcodeCatalog(barcode.trim(), productName.trim());
            }

            // Mark as saved so cleanup doesn't delete the image
            markAsSaved();

            // Invoice Create Mode: escribir resultado y volver al orquestador
            if (invoiceCreateMode) {
                try {
                    sessionStorage.setItem('bistro_invoice_create_result', JSON.stringify({
                        action: 'saved',
                        productId: finalProductId,
                        name: productName.trim(),
                    }));
                } catch { /* ignore */ }
                onNavigate(Screen.CREATE_FROM_INVOICE);
                return;
            }

            // Notificar a App.tsx y demás componentes para refrescar el catálogo de inmediato
            window.dispatchEvent(new CustomEvent('inventory-updated'));

            showToast(productToEdit ? 'Producto actualizado exitosamente' : 'Producto creado exitosamente', 'success');
            if (productToEdit) {
                onNavigate(originScreen ?? Screen.PRODUCTS);
            } else {
                setShowSuccessModal(true);
            }
        } catch (error: any) {
            console.error('Error creating product:', error);
            const isPerm = error?.code === '42501' || /row-level security|permission denied/i.test(error?.message || '');
            showToast(isPerm ? 'No tienes permiso para crear o editar productos.' : 'No se pudo guardar el producto. Intenta de nuevo.', isPerm ? 'warning' : 'error');
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
                                Para {productToEdit ? 'editar' : 'crear'} productos necesitas internet. Los cambios se guardan directamente en la nube.
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
                            {productToEdit ? 'Editar Producto' : 'Crear Producto'}
                        </h1>
                        {invoiceCreateMode && invoiceCreateInfo && (
                            <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
                                Producto {invoiceCreateInfo.currentIndex + 1} de {invoiceCreateInfo.totalNew}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={handleBack}
                        className="p-2 rounded-xl text-text-secondary hover:text-text-main hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center justify-center"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </header>

                <div id="simple-product-scroll" className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-gray-50 dark:bg-background-dark">
                    <form className="flex flex-col gap-6 h-full" onSubmit={handleSave}>
                        {/* Formulario Principal */}
                        <div className="flex flex-col bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 divide-y divide-gray-200 dark:divide-gray-800 relative z-10">

                            {/* Card 1: Tipo y EAN */}
                            <div className="p-5 flex flex-col gap-4">
                                {/* Tipo de producto */}
                                <div className="w-full">
                                    <label htmlFor="product-type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 line-clamp-1">Tipo de producto <span className="text-red-500">*</span></label>
                                    <div className="relative">
                                        {!productToEdit ? (
                                            <>
                                                <select
                                                    id="product-type"
                                                    className="w-full h-11 pl-4 pr-10 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 transition-colors appearance-none bg-none cursor-pointer dark:text-white outline-none"
                                                    onChange={handleTypeChange}
                                                    value={isForSale ? 'sale' : 'insumo'}
                                                >
                                                    <option value="sale">Producto</option>
                                                    <option value="insumo">Ingrediente</option>
                                                    <option value="processed">Receta</option>
                                                    <option value="service">Servicios</option>
                                                </select>
                                                <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
                                                    <span className="material-symbols-outlined text-xl">expand_more</span>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <select
                                                    id="product-type"
                                                    className="w-full h-11 pl-4 pr-10 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 transition-colors appearance-none bg-none cursor-pointer dark:text-white outline-none"
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
                                                {pendingTypeChange && (
                                                    <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-[14px]">info</span>
                                                        Cambio pendiente. Se aplicará al guardar.
                                                    </p>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    {isViewingRecipe && (
                                        <div className="mt-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50">
                                            <div className="flex items-start gap-3">
                                                <span
                                                    className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[24px] shrink-0 mt-0.5"
                                                    aria-hidden
                                                >
                                                    skillet
                                                </span>
                                                <div className="flex flex-col gap-1.5 min-w-0">
                                                    <p className="text-sm font-bold text-amber-900 dark:text-amber-200 leading-tight">
                                                        Este producto pasará a ser una Receta
                                                    </p>
                                                    <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                                                        Las recetas se configuran en un editor distinto (ingredientes, modo de costo).
                                                        Se conservarán: <span className="font-bold">Nombre</span>,
                                                        <span className="font-bold"> Imagen</span> y
                                                        <span className="font-bold"> Categoría</span>.
                                                    </p>
                                                    <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                                                        Al guardar, se abrirá el editor de recetas.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Código de barras — solo para productos de venta */}
                                {isViewingForSale && (
                                <div className="w-full">
                                    <label htmlFor="product-barcode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                        Código EAN / UPC
                                    </label>
                                    <div className="relative flex w-full">
                                        <input
                                            id="product-barcode"
                                            className="w-full h-11 pl-4 pr-20 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 transition-colors dark:text-white outline-none"
                                            type="text"
                                            placeholder="Ej: 7702011234567"
                                            value={barcode}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setBarcode(val);

                                                // Detección de pistola de escáner por velocidad
                                                const now = Date.now();
                                                scannerTimestampsRef.current.push(now);
                                                // Mantener solo los últimos N timestamps
                                                if (scannerTimestampsRef.current.length > 4) {
                                                    scannerTimestampsRef.current.shift();
                                                }

                                                // Cancelar timer previo
                                                if (scannerTimerRef.current) clearTimeout(scannerTimerRef.current);

                                                // Esperar a que deje de llegar input y evaluar velocidad
                                                scannerTimerRef.current = setTimeout(() => {
                                                    const stamps = scannerTimestampsRef.current;
                                                    if (stamps.length >= 4 && val.trim().length >= 6) {
                                                        const elapsed = stamps[stamps.length - 1] - stamps[0];
                                                        const avgPerChar = elapsed / (stamps.length - 1);
                                                        // Si promedio < 50ms por char = pistola
                                                        if (avgPerChar < 50) {
                                                            scannerTimestampsRef.current = [];
                                                            handleBarcodeLookup(val);
                                                        }
                                                    }
                                                }, 120);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    scannerTimestampsRef.current = [];
                                                    handleBarcodeLookup(barcode);
                                                }
                                            }}
                                        />
                                        {lookingUpBarcode ? (
                                            <div className="absolute right-11 top-1/2 -translate-y-1/2">
                                                <div className="size-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                            </div>
                                        ) : barcode.trim().length >= 4 ? (
                                            <button
                                                type="button"
                                                onClick={() => handleBarcodeLookup(barcode)}
                                                className="absolute right-11 top-1/2 -translate-y-1/2 size-8 flex items-center justify-center rounded-md text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 active:scale-95 transition-all"
                                                aria-label="Buscar código EAN"
                                                tabIndex={0}
                                            >
                                                <span className="material-symbols-outlined text-[20px]">search</span>
                                            </button>
                                        ) : null}
                                        <button
                                            type="button"
                                            onClick={() => setShowBarcodeScanner(true)}
                                            className="absolute right-1.5 top-1/2 -translate-y-1/2 size-8 flex items-center justify-center rounded-lg bg-[#fbbf24] hover:bg-[#f59e0b] text-black shadow-sm active:scale-95 transition-all"
                                            aria-label="Escanear código de barras"
                                            tabIndex={0}
                                        >
                                            <span className="material-symbols-outlined text-[20px] font-bold">barcode_scanner</span>
                                        </button>
                                    </div>
                                </div>
                                )}

                                {/* Nombre del producto (Movidio aquí) */}
                                <div className="w-full">
                                    <label htmlFor="product-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Nombre del producto <span className="text-red-500">*</span></label>
                                    <input id="product-name" className="w-full h-11 px-4 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 transition-colors dark:text-white outline-none" type="text" placeholder={namePlaceholder} value={productName} onChange={(e) => setProductName(e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1))} />
                                </div>
                            </div>

                            {/* Card 2: Imagen */}
                            <div className="p-5 group transition-colors relative">
                                <div className="flex items-center justify-between mb-4">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Imagen del producto
                                    </label>
                                </div>
                                <div className="flex items-center gap-5 mt-2">
                                    <div className="size-28 shrink-0 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center group-hover:bg-blue-50 dark:group-hover:bg-blue-900/10 transition-colors overflow-hidden relative">
                                        {previewUrl ? (
                                            <img
                                                src={previewUrl}
                                                alt="Preview"
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <span className="material-symbols-outlined text-gray-400 group-hover:text-primary text-4xl transition-colors">cloud_upload</span>
                                        )}
                                        {uploadingImage && (
                                            <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1">
                                                <div className="size-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                                {statusText && <span className="text-white text-[10px] font-medium text-center px-1">{statusText}</span>}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 flex flex-col gap-2.5">
                                        <button type="button" onClick={triggerCamera} disabled={uploadingImage} className="md:hidden h-9 w-full flex items-center justify-center gap-2 bg-primary text-[#102218] rounded-xl font-bold text-xs active:scale-95 transition-transform shadow-sm">
                                            <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                                            <span>Cámara</span>
                                        </button>
                                        <label className="h-9 w-full flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-xs cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all shadow-sm">
                                            <span className="material-symbols-outlined text-[18px]">upload_file</span>
                                            <span>Subir foto</span>
                                            <input type="file" className="hidden" accept="image/*" onChange={handleImageSelect} disabled={uploadingImage} />
                                        </label>
                                        <button type="button" onClick={handlePasteClick} className="flex h-9 w-full items-center justify-center gap-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-xs hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all shadow-sm" disabled={uploadingImage} title="Pegar imagen del portapapeles" aria-label="Pegar imagen del portapapeles">
                                            <span className="material-symbols-outlined text-[18px]">content_paste</span>
                                            <span>Pegar imagen</span>
                                        </button>
                                    </div>
                                </div>
                                {previewUrl && !uploadingImage && (
                                    <button type="button" onClick={deleteImage} className="absolute top-2 right-2 size-7 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-colors z-20">
                                        <span className="material-symbols-outlined text-[16px]">close</span>
                                    </button>
                                )}
                            </div>

                            {/* Card 3: Datos Principales */}
                            <div className="p-5 flex flex-col gap-4">
                                <div className="w-full">
                                    <CategorySelector value={categoryId} onChange={setCategoryId} required={true} />
                                </div>
                                {/* Proveedor default */}
                                <div className="w-full relative" ref={(node) => {
                                    if (!node) return;
                                    const handleOutsideClick = (e: MouseEvent) => {
                                        if (!node.contains(e.target as Node)) {
                                            node.querySelector<HTMLDivElement>('[data-supplier-dropdown]')?.classList.add('hidden');
                                        }
                                    };
                                    if (!node.dataset.listenerAttached) {
                                        node.dataset.listenerAttached = 'true';
                                        document.addEventListener('mousedown', handleOutsideClick);
                                    }
                                }}>
                                    <label htmlFor="product-supplier" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Proveedor</label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    const dropdown = document.querySelector<HTMLDivElement>('[data-supplier-dropdown]')!;
                                                    const isOpen = !dropdown.classList.contains('hidden');
                                                    if (isOpen) {
                                                        dropdown.classList.add('hidden');
                                                    } else {
                                                        dropdown.classList.remove('hidden');
                                                        const wrapper = e.currentTarget.closest('[data-listener-attached]') || e.currentTarget.closest('.relative');
                                                        wrapper?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                                        if (window.innerWidth >= 768) {
                                                            setTimeout(() => dropdown.querySelector<HTMLInputElement>('input')?.focus(), 50);
                                                        }
                                                    }
                                                }}
                                                className={`w-full h-11 pl-4 pr-10 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 cursor-pointer outline-none text-left ${supplierId ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-600 dark:text-gray-400'}`}
                                                aria-label="Seleccionar proveedor default"
                                            >
                                                <span className="truncate block">{supplierId ? (allSuppliers.find(s => s.id === supplierId)?.name || 'Sin proveedor') : 'Sin proveedor'}</span>
                                            </button>
                                            <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
                                                <span className="material-symbols-outlined text-lg">expand_more</span>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowNewSupplierModal(true)}
                                            className="h-11 px-3 flex items-center justify-center gap-1 rounded-lg bg-primary hover:bg-primary-hover text-[#102218] font-bold transition-colors shrink-0 text-sm"
                                            title="Crear proveedor"
                                            aria-label="Crear nuevo proveedor"
                                        >
                                            <span className="material-symbols-outlined text-lg">add</span>
                                            <span>Crear</span>
                                        </button>
                                    </div>
                                    <div data-supplier-dropdown className="hidden absolute top-full left-0 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
                                        <div className="p-2 border-b border-gray-100 dark:border-gray-700">
                                            <div className="relative">
                                                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-[16px]">search</span>
                                                <input
                                                    type="text"
                                                    placeholder="Buscar proveedor..."
                                                    className="w-full h-8 pl-8 pr-3 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-gray-900 dark:text-white placeholder:text-gray-400"
                                                    onChange={(e) => {
                                                        const query = e.target.value.toLowerCase();
                                                        const buttons = e.target.closest('[data-supplier-dropdown]')?.querySelectorAll<HTMLButtonElement>('[data-supplier-option]');
                                                        buttons?.forEach(btn => {
                                                            const name = btn.dataset.supplierName || '';
                                                            btn.style.display = name.includes(query) ? '' : 'none';
                                                        });
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div className="max-h-[60vh] overflow-y-auto">
                                            <button
                                                type="button"
                                                data-supplier-option
                                                data-supplier-name="sin proveedor"
                                                onClick={() => {
                                                    setSupplierId('');
                                                    const dropdown = document.querySelector<HTMLDivElement>('[data-supplier-dropdown]');
                                                    dropdown?.classList.add('hidden');
                                                    const input = dropdown?.querySelector<HTMLInputElement>('input');
                                                    if (input) { input.value = ''; input.dispatchEvent(new Event('change')); }
                                                }}
                                                className={`w-full px-3 py-2.5 text-left text-xs font-medium hover:bg-amber-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors ${!supplierId ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300' : 'text-gray-700 dark:text-gray-200'}`}
                                            >
                                                <span className="flex-1 leading-snug">Sin proveedor</span>
                                                {!supplierId && <span className="material-symbols-outlined text-amber-500 text-[14px] ml-auto shrink-0">check</span>}
                                            </button>
                                            {allSuppliers.filter(s => (s as any).is_active !== false).map(s => (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    data-supplier-option
                                                    data-supplier-name={s.name.toLowerCase()}
                                                    onClick={() => {
                                                        setSupplierId(s.id);
                                                        const dropdown = document.querySelector<HTMLDivElement>('[data-supplier-dropdown]');
                                                        dropdown?.classList.add('hidden');
                                                        const input = dropdown?.querySelector<HTMLInputElement>('input');
                                                        if (input) { input.value = ''; input.dispatchEvent(new Event('change')); }
                                                    }}
                                                    className={`w-full px-3 py-2.5 text-left text-xs font-medium hover:bg-amber-50 dark:hover:bg-gray-700 flex items-center gap-2 transition-colors ${s.id === supplierId ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300' : 'text-gray-700 dark:text-gray-200'}`}
                                                >
                                                    <span className="line-clamp-2 flex-1 leading-snug">{s.name}</span>
                                                    {s.id === supplierId && <span className="material-symbols-outlined text-amber-500 text-[14px] ml-auto shrink-0">check</span>}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                {!isViewingRecipe && (
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="flex flex-col">
                                        <label htmlFor="product-sales-unit" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 text-ellipsis overflow-hidden whitespace-nowrap">{isViewingForSale ? 'Unidad de venta' : 'Unidad de inventario'} <span className="text-red-500">*</span></label>
                                        <div className="relative mt-auto">
                                            <select id="product-sales-unit" className={`w-full h-11 pl-4 pr-10 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 appearance-none bg-none cursor-pointer outline-none ${salesUnit ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-600 dark:text-gray-400'}`} onChange={handleUnitChange} value={salesUnit}>
                                                <option value="" disabled>Elegir...</option>
                                                <option value="Unidad">Unidad</option>
                                                <option value="Kilogramos">Kilogramos (kg)</option>
                                                <option value="Libras">Libras (lb)</option>
                                                <option value="Gramos">Gramos (g)</option>
                                                <option value="Onzas">Onzas (oz)</option>
                                                <option value="Arrobas">Arrobas (@)</option>
                                                <option value="Litros">Litros (L)</option>
                                                <option value="Mililitros">Mililitros (ml)</option>
                                                <option value="Galones">Galones (gal)</option>
                                                <option value="Metros">Metros (m)</option>
                                            </select>
                                            <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500"><span className="material-symbols-outlined text-lg">expand_more</span></div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col">
                                        <label htmlFor="product-stock" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 min-w-0">
                                            <span className="truncate">{productToEdit ? 'Stock actual' : 'Stock inicial'}</span>
                                            {salesUnitAbbr && <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">{salesUnitAbbr}</span>}
                                        </label>
                                        <div className="relative mt-auto">
                                            <input id="product-stock" className={`w-full h-11 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:text-white outline-none ${productToEdit ? 'bg-gray-100 dark:bg-gray-800 text-text-secondary cursor-not-allowed' : 'bg-white dark:bg-gray-900 focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 font-medium'}`} type="text" inputMode="decimal" placeholder="0" value={stock} onChange={(e) => setStock(formatStockNumber(e.target.value))} readOnly={!!productToEdit} />
                                        </div>
                                    </div>
                                    {isViewingForSale && (
                                    <div className="flex flex-col">
                                        <label htmlFor="product-price" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 min-w-0">
                                            <span className="truncate">Precio venta</span>
                                            {salesUnitAbbr && <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">/{salesUnitAbbr}</span>}
                                        </label>
                                        <div className="relative mt-auto">
                                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 text-sm">$</span>
                                            <input id="product-price" className="w-full h-11 pl-7 pr-3 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white outline-none font-bold" placeholder="0" type="text" inputMode="decimal" value={price} onChange={(e) => setPrice(formatNumber(e.target.value))} />
                                        </div>
                                    </div>
                                    )}
                                    <div className="flex flex-col">
                                        <label htmlFor="product-cost" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 min-w-0">
                                            <span className="truncate">Costo <span className="text-red-500">*</span></span>
                                            {salesUnitAbbr && <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">/{salesUnitAbbr}</span>}
                                        </label>
                                        <div className="relative mt-auto">
                                            <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 text-sm">$</span>
                                            <input id="product-cost" className="w-full h-11 pl-7 pr-3 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white outline-none font-bold" placeholder="0" type="text" inputMode="decimal" value={cost} onChange={(e) => setCost(formatNumber(e.target.value))} />
                                        </div>
                                    </div>
                                </div>
                                )}
                            </div>

                            {/* Card: Apodos (Referencias) — solo para productos de venta */}
                            {isViewingForSale && (
                            <div className="p-5 flex flex-col relative overflow-hidden">
                                <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300 mb-3 relative z-10">
                                    Apodos (Referencias)
                                </h3>

                                <div className="relative mb-4 relative z-10 w-full">
                                    <input
                                        className="w-full h-10 pl-3 pr-20 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 dark:text-white outline-none shadow-sm"
                                        placeholder="Ej: Coca..."
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

                                <div className="flex flex-wrap gap-2 relative z-10 font-medium">
                                    {nicknames.map((nick, idx) => (
                                        <span
                                            key={nick}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded-full text-xs font-medium border border-yellow-200 dark:border-yellow-800 shadow-sm"
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

                            {/* Card: Presentaciones de Venta — solo para productos de venta */}
                            {isViewingForSale && (
                            <div id="sale-presentations-section" className="p-5 flex flex-col gap-4 relative overflow-hidden">
                                <h3 className="text-gray-700 dark:text-gray-300 mb-2 flex items-center justify-between z-10 w-full relative">
                                    <div className="flex items-center gap-2 overflow-hidden pr-2">
                                        <span className="hidden sm:block material-symbols-outlined text-amber-500 text-xl filled shrink-0">layers</span>
                                        <span className="truncate text-sm sm:text-sm font-semibold sm:font-medium">Presentaciones de Venta</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                             setEditingPresentationIdx(null);
                                             lastLookedUpPresentationRef.current = '';
                                             setModalPresentation({
                                                 unit_name: '',
                                                 conversion_factor: '',
                                                 price: '',
                                                 barcode: '',
                                                 image_url: '',
                                                 nicknames: []
                                             });
                                             setPresentationNicknameInput('');
                                             setShowSalePresentationModal(true);
                                        }}
                                        className="text-xs sm:text-sm font-bold sm:font-medium text-gray-900 border-b border-gray-900 pb-[1px] hover:text-gray-600 hover:border-gray-600 dark:text-white dark:border-white dark:hover:text-gray-300 dark:hover:border-gray-300 transition-colors flex items-center gap-0.5 sm:gap-1 shrink-0 whitespace-nowrap"
                                    >
                                        <span className="material-symbols-outlined text-[14px] sm:text-[16px]">add</span>
                                        Añadir Presentación
                                    </button>
                                </h3>

                                {salePresentations.length === 0 ? (
                                    <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 text-center py-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl relative z-10 border border-dashed border-gray-200 dark:border-gray-700">
                                        Venta simple ({salesUnit || 'Unidad'}). Si vendes por {unitExamples.bannerExamples}, añade las presentaciones aquí.
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2 relative z-10">
                                        {salePresentations.map((pres, idx) => (
                                            <div
                                                key={pres.id || `pres-${idx}`}
                                                className="flex items-center justify-between gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors group animate-[fadeIn_0.2s_ease-out]"
                                            >
                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                    {pres.image_url ? (
                                                        <img src={pres.image_url} alt={pres.unit_name} className="size-11 rounded-lg object-cover border border-gray-200 dark:border-gray-700 shrink-0" />
                                                    ) : (
                                                        <div className="size-11 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-center justify-center shrink-0">
                                                            <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-xl">package_2</span>
                                                        </div>
                                                    )}
                                                    <div className="flex flex-col justify-center min-w-0 flex-1">
                                                        <span className="font-semibold text-sm text-gray-800 dark:text-gray-200 leading-snug break-words">{pres.unit_name}</span>
                                                        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                            <span>Contiene {pres.conversion_factor} {salesUnitPlural}</span>
                                                            <span className="text-gray-300 dark:text-gray-600">•</span>
                                                            <span className="font-bold text-emerald-600 dark:text-emerald-400">${formatNumber(pres.price.toString())}</span>
                                                            {pres.nicknames && pres.nicknames.length > 0 && (
                                                                <>
                                                                    <span className="text-gray-300 dark:text-gray-600">•</span>
                                                                    <span className="text-amber-600 dark:text-amber-400 font-medium">{pres.nicknames.length} apodo{pres.nicknames.length > 1 ? 's' : ''}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setEditingPresentationIdx(idx);
                                                            lastLookedUpPresentationRef.current = pres.barcode || '';
                                                            setModalPresentation({
                                                                id: pres.id,
                                                                unit_name: pres.unit_name,
                                                                conversion_factor: pres.conversion_factor.toString(),
                                                                price: formatNumber(pres.price.toString()),
                                                                barcode: pres.barcode || '',
                                                                image_url: pres.image_url || '',
                                                                nicknames: pres.nicknames ? [...pres.nicknames] : []
                                                            });
                                                            setPresentationNicknameInput('');
                                                            setShowSalePresentationModal(true);
                                                        }}
                                                        className="text-gray-400 hover:text-blue-600 p-2 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all flex items-center justify-center"
                                                        aria-label="Editar Presentación"
                                                    >
                                                        <span className="material-symbols-outlined text-[20px]">edit</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const arr = [...salePresentations];
                                                            arr.splice(idx, 1);
                                                            setSalePresentations(arr);
                                                        }}
                                                        className="text-gray-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-all flex items-center justify-center"
                                                        aria-label="Eliminar Presentación"
                                                    >
                                                        <span className="material-symbols-outlined text-[20px]">delete</span>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            )}

                            {/* Card 5: Unidades de Compra — se oculta si el tipo pendiente es Receta */}
                            {!isViewingRecipe && (
                            <div id="purchase-units-section" className="p-5 flex flex-col gap-4 relative overflow-hidden">
                                <h3 className="text-gray-700 dark:text-gray-300 mb-2 flex items-center justify-between z-10 w-full relative">
                                    <div className="flex items-center gap-2 overflow-hidden pr-2">
                                        <span className="hidden sm:block material-symbols-outlined text-emerald-600 text-xl filled shrink-0">inventory_2</span>
                                        <span className="truncate text-sm sm:text-sm font-semibold sm:font-medium">Unidades de Compra</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditingUnitIdx(null);
                                            setModalUnit({ unit_name: '', conversion_factor: '' });
                                            setShowPurchaseUnitModal(true);
                                        }}
                                        className="text-xs sm:text-sm font-bold sm:font-medium text-gray-900 border-b border-gray-900 pb-[1px] hover:text-gray-600 hover:border-gray-600 dark:text-white dark:border-white dark:hover:text-gray-300 dark:hover:border-gray-300 transition-colors flex items-center gap-0.5 sm:gap-1 shrink-0 whitespace-nowrap"
                                    >
                                        <span className="material-symbols-outlined text-[14px] sm:text-[16px]">add</span>
                                        Añadir Unidad
                                    </button>
                                </h3>

                                {purchaseUnits.length === 0 ? (
                                    <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl relative z-10 border border-dashed border-gray-200 dark:border-gray-700">
                                        No hay unidades extra de compra configuradas.
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2 relative z-10">
                                        {purchaseUnits.map((unit, idx) => (
                                                <div
                                                    key={unit.id ?? `unit-${idx}`}
                                                    className="flex items-center justify-between px-3 py-2.5 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors group animate-[fadeIn_0.2s_ease-out]"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex flex-col">
                                                            <span className="font-medium text-sm text-gray-800 dark:text-gray-200">{unit.unit_name || '...'}</span>
                                                            <span className="text-xs text-gray-400 dark:text-gray-500">{unit.conversion_factor || '0'} {salesUnitPlural} por {unit.unit_name?.toLowerCase() || 'unidad'}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setEditingUnitIdx(idx);
                                                                setModalUnit({ unit_name: unit.unit_name, conversion_factor: unit.conversion_factor });
                                                                setShowPurchaseUnitModal(true);
                                                            }}
                                                            className="text-gray-400 hover:text-blue-600 p-2 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all flex items-center justify-center"
                                                            aria-label="Editar Unidad"
                                                        >
                                                            <span className="material-symbols-outlined text-[20px]">edit</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const arr = [...purchaseUnits];
                                                                arr.splice(idx, 1);
                                                                setPurchaseUnits(arr);
                                                            }}
                                                            className="text-gray-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/20 transition-all flex items-center justify-center"
                                                            aria-label="Eliminar Unidad"
                                                        >
                                                            <span className="material-symbols-outlined text-[20px]">delete</span>
                                                        </button>
                                                    </div>
                                                </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            )}

                        </div>

                        <div className="mt-4 mb-8 flex flex-col gap-2">
                            <div className="grid grid-cols-2 gap-4">
                                <button onClick={handleBack} className="h-11 px-4 py-2 text-base font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" type="button">Cancelar</button>
                                <AppButton
                                    isLoading={loading || uploadingImage}
                                    className="h-11 px-4 py-2 text-base font-medium text-[#102218] bg-primary rounded-lg hover:bg-primary-hover shadow-sm transition-colors"
                                    type="submit"
                                >
                                    {invoiceCreateMode && invoiceCreateInfo
                                        ? (invoiceCreateInfo.currentIndex < invoiceCreateInfo.totalNew - 1
                                            ? 'Guardar y siguiente →'
                                            : 'Guardar y finalizar')
                                        : (productToEdit
                                            ? (isViewingRecipe ? 'Continuar al editor de recetas' : 'Actualizar Producto')
                                            : 'Crear Producto')
                                    }
                                </AppButton>
                            </div>
                            {invoiceCreateMode && (
                                <button
                                    type="button"
                                    onClick={handleInvoiceSkip}
                                    className="w-full h-11 text-sm font-bold text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl transition-colors"
                                >
                                    Omitir este producto
                                </button>
                            )}
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
                )
                }


                {showInAppCamera && (
                    <InAppCamera onCapture={onCameraCapture} onClose={onCameraClose} />
                )}

                {showBarcodeScanner && (
                    <BarcodeScanner
                        onScan={handleBarcodeScan}
                        onClose={() => setShowBarcodeScanner(false)}
                    />
                )}

                <TypeChangeWarningModal
                    isOpen={showTypeChangeModal}
                    fromType={currentType}
                    toType={attemptedType ?? currentType}
                    onConfirm={handleConfirmTypeChange}
                    onCancel={handleCancelTypeChange}
                />

                {/* Modal Unidad de Compra */}
                {showPurchaseUnitModal && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]" onClick={() => setShowPurchaseUnitModal(false)}>
                        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 mx-4 w-full max-w-sm flex flex-col gap-5 animate-[fadeIn_0.2s_ease-out]" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-between">
                                <h3 className="text-base font-bold text-gray-900 dark:text-white">
                                    {editingUnitIdx !== null ? 'Editar Unidad' : 'Nueva Unidad de Compra'}
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setShowPurchaseUnitModal(false)}
                                    className="size-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                    aria-label="Cerrar"
                                >
                                    <span className="material-symbols-outlined text-xl">close</span>
                                </button>
                            </div>

                            <div className="flex flex-col gap-4">
                                <div className="flex flex-col">
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                                        Modo de Compra
                                    </label>
                                    <PurchaseUnitSelector
                                        value={modalUnit.unit_name}
                                        onChange={(newValue) => setModalUnit(prev => ({ ...prev, unit_name: newValue }))}
                                        customOptions={businessCustomUnits}
                                    />
                                </div>
                                <div className="flex flex-col">
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[16px] text-gray-400 dark:text-gray-500">help</span>
                                        ¿Cuántas {salesUnitPlural} vienen en un/a {modalUnit.unit_name || '...'}?
                                    </label>
                                    <input
                                        className="w-full h-11 px-3 text-sm font-bold bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-gray-900 dark:text-white"
                                        type="text"
                                        inputMode="decimal"
                                        placeholder={unitExamples.purchaseFactorPlaceholder}
                                        value={modalUnit.conversion_factor}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                                            setModalUnit(prev => ({ ...prev, conversion_factor: val }));
                                        }}
                                        autoFocus={window.innerWidth >= 768}
                                    />
                                </div>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowPurchaseUnitModal(false)}
                                    className="flex-1 h-11 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    disabled={!modalUnit.unit_name || !modalUnit.conversion_factor || parseFloat(modalUnit.conversion_factor) <= 0}
                                    onClick={() => {
                                        const entry: PurchaseUnitEntry = {
                                            unit_name: modalUnit.unit_name,
                                            conversion_factor: modalUnit.conversion_factor,
                                            isCustom: !['Bulto', 'Saco', 'Caja', 'Paca', 'Canasta', 'Paquete', 'Bolsa', 'Atado', 'Kilogramos', 'Libras', 'Display', 'Tira', 'Bandeja', 'Botella', 'Galón', 'Balde / Tobo', 'Unidad'].includes(modalUnit.unit_name),
                                        };
                                        const arr = [...purchaseUnits];
                                        if (editingUnitIdx !== null) {
                                            entry.id = arr[editingUnitIdx].id;
                                            arr[editingUnitIdx] = entry;
                                        } else {
                                            arr.unshift(entry);
                                        }
                                        setPurchaseUnits(arr);
                                        // Agregar al listado local de unidades personalizadas para que esté disponible inmediatamente
                                        if (!businessCustomUnits.includes(modalUnit.unit_name)) {
                                            setBusinessCustomUnits(prev => [...prev, modalUnit.unit_name]);
                                        }
                                        setShowPurchaseUnitModal(false);
                                    }}
                                    className="flex-1 h-11 text-sm font-bold text-[#102218] bg-[#fbbf24] hover:bg-[#f59e0b] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors shadow-sm flex items-center justify-center gap-1.5"
                                >
                                    <span className="material-symbols-outlined text-[18px]">check</span>
                                    Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Modal Presentación de Venta */}
                {showSalePresentationModal && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out] p-4">
                        <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-2xl p-5 w-full max-w-sm flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
                            <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-amber-500 text-xl">layers</span>
                                    <h4 className="font-bold text-base text-gray-900 dark:text-white">
                                        {editingPresentationIdx !== null ? 'Editar Presentación' : 'Añadir Presentación'}
                                    </h4>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowSalePresentationModal(false)}
                                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                                >
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            <div className="flex flex-col gap-3">
                                {/* 1. Código de barras (EAN / UPC) — Primero */}
                                <div className="flex flex-col">
                                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                        Código de barras (EAN / UPC)
                                    </label>
                                    <div className="relative flex w-full">
                                        <input
                                            className="w-full h-10 pl-3 pr-20 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500 transition-colors text-gray-900 dark:text-white outline-none"
                                            type="text"
                                            placeholder="Ej: 7702011234567"
                                            value={modalPresentation.barcode}
                                            autoFocus={!modalPresentation.barcode}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setModalPresentation(prev => ({ ...prev, barcode: val }));

                                                // Detección de pistola de escáner por velocidad
                                                const now = Date.now();
                                                presentationScannerTimestampsRef.current.push(now);
                                                if (presentationScannerTimestampsRef.current.length > 4) {
                                                    presentationScannerTimestampsRef.current.shift();
                                                }
                                                if (presentationScannerTimerRef.current) clearTimeout(presentationScannerTimerRef.current);
                                                presentationScannerTimerRef.current = setTimeout(() => {
                                                    const stamps = presentationScannerTimestampsRef.current;
                                                    if (stamps.length >= 4 && val.trim().length >= 6) {
                                                        const elapsed = stamps[stamps.length - 1] - stamps[0];
                                                        const avgPerChar = elapsed / (stamps.length - 1);
                                                        if (avgPerChar < 50) {
                                                            presentationScannerTimestampsRef.current = [];
                                                            handlePresentationBarcodeLookup(val);
                                                        }
                                                    }
                                                }, 120);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    presentationScannerTimestampsRef.current = [];
                                                    handlePresentationBarcodeLookup(modalPresentation.barcode);
                                                }
                                            }}
                                        />
                                        {lookingUpPresentationBarcode ? (
                                            <div className="absolute right-11 top-1/2 -translate-y-1/2">
                                                <div className="size-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                            </div>
                                        ) : modalPresentation.barcode && modalPresentation.barcode.trim().length >= 4 ? (
                                            <button
                                                type="button"
                                                onClick={() => handlePresentationBarcodeLookup(modalPresentation.barcode)}
                                                className="absolute right-11 top-1/2 -translate-y-1/2 size-8 flex items-center justify-center rounded-md text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 active:scale-95 transition-all"
                                                aria-label="Buscar código EAN de la presentación"
                                                tabIndex={0}
                                            >
                                                <span className="material-symbols-outlined text-[20px]">search</span>
                                            </button>
                                        ) : null}
                                        <button
                                            type="button"
                                            onClick={() => setShowPresentationScanner(true)}
                                            className="absolute right-1.5 top-1/2 -translate-y-1/2 size-8 flex items-center justify-center rounded-md bg-[#fbbf24] hover:bg-[#f59e0b] text-black shadow-sm active:scale-95 transition-all"
                                            aria-label="Escanear código de barras de la presentación"
                                            tabIndex={0}
                                        >
                                            <span className="material-symbols-outlined text-[18px]">barcode_scanner</span>
                                        </button>
                                    </div>
                                </div>

                                {/* 2. Nombre de la presentación */}
                                <div className="flex flex-col">
                                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                        Nombre de la presentación <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        className="w-full h-10 px-3 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
                                        type="text"
                                        placeholder={unitExamples.presentationNamePlaceholder}
                                        value={modalPresentation.unit_name}
                                        onChange={(e) => setModalPresentation(prev => ({ ...prev, unit_name: e.target.value }))}
                                    />
                                </div>

                                {/* 3. Factor de conversión */}
                                <div className="flex flex-col">
                                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                        ¿Cuántas {salesUnitPlural} contiene? <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        className="w-full h-10 px-3 text-sm font-bold bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
                                        type="text"
                                        inputMode="decimal"
                                        placeholder=""
                                        value={modalPresentation.conversion_factor}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
                                            setModalPresentation(prev => ({ ...prev, conversion_factor: val }));
                                        }}
                                    />
                                </div>

                                {/* 4. Precio de venta */}
                                <div className="flex flex-col">
                                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                        Precio de venta de esta presentación <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 text-sm">$</span>
                                        <input
                                            className="w-full h-10 pl-7 pr-3 text-sm font-bold bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
                                            type="text"
                                            inputMode="decimal"
                                            placeholder="0"
                                            value={modalPresentation.price}
                                            onChange={(e) => setModalPresentation(prev => ({ ...prev, price: formatNumber(e.target.value) }))}
                                        />
                                    </div>
                                </div>

                                {/* 5. Apodos de la presentación (Opcional) */}
                                <div className="flex flex-col">
                                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                        Apodos de la presentación (Opcional)
                                    </label>
                                    <div className="relative flex w-full">
                                        <input
                                            className="w-full h-10 pl-3 pr-20 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-blue-500 outline-none text-gray-900 dark:text-white"
                                            type="text"
                                            placeholder="Ej: Media, Cajetilla 10..."
                                            value={presentationNicknameInput}
                                            onChange={(e) => setPresentationNicknameInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    handleAddPresentationNickname();
                                                }
                                            }}
                                        />
                                        {presentationNicknameInput.trim() && (
                                            <button
                                                className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer"
                                                type="button"
                                                onClick={handleAddPresentationNickname}
                                            >
                                                Agregar
                                            </button>
                                        )}
                                    </div>
                                    {modalPresentation.nicknames && modalPresentation.nicknames.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {modalPresentation.nicknames.map((nick, idx) => (
                                                <span
                                                    key={nick}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 rounded-full text-xs font-medium border border-yellow-200 dark:border-yellow-800 shadow-sm"
                                                >
                                                    {nick}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemovePresentationNickname(idx)}
                                                        className="ml-0.5 text-yellow-600 hover:text-red-500 transition-colors"
                                                        aria-label={`Eliminar apodo ${nick}`}
                                                    >
                                                        <span className="material-symbols-outlined text-[13px]">close</span>
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col">
                                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                        Foto de la presentación (Opcional)
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <div className="size-16 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 flex items-center justify-center overflow-hidden relative shrink-0">
                                            {modalPresentation.image_url ? (
                                                <img src={modalPresentation.image_url} alt="Presentación" className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="material-symbols-outlined text-gray-400 text-2xl">photo_camera</span>
                                            )}
                                            {uploadingPresentationImage && (
                                                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1">
                                                    <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                </div>
                                            )}
                                            {modalPresentation.image_url && !uploadingPresentationImage && (
                                                <button
                                                    type="button"
                                                    onClick={() => setModalPresentation(prev => ({ ...prev, image_url: '' }))}
                                                    className="absolute top-1 right-1 size-5 flex items-center justify-center bg-red-500 hover:bg-red-600 text-white rounded-full shadow-md transition-colors z-20"
                                                    title="Quitar foto"
                                                    aria-label="Quitar foto de la presentación"
                                                >
                                                    <span className="material-symbols-outlined text-[12px]">close</span>
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1.5 flex-1">
                                            <label className="h-8 px-3 flex items-center justify-center gap-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg font-semibold text-xs cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all shadow-sm">
                                                <span className="material-symbols-outlined text-[16px]">upload_file</span>
                                                <span>Subir foto</span>
                                                <input type="file" className="hidden" accept="image/*" onChange={handlePresentationImageSelect} disabled={uploadingPresentationImage} />
                                            </label>
                                            <button
                                                type="button"
                                                onClick={handlePresentationPasteClick}
                                                disabled={uploadingPresentationImage}
                                                className="h-8 px-3 flex items-center justify-center gap-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg font-semibold text-xs hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all shadow-sm"
                                                title="Pegar imagen del portapapeles"
                                                aria-label="Pegar imagen del portapapeles"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">content_paste</span>
                                                <span>Pegar imagen</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                                <button
                                    type="button"
                                    onClick={() => setShowSalePresentationModal(false)}
                                    className="flex-1 h-10 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    disabled={!modalPresentation.unit_name.trim() || !modalPresentation.conversion_factor || parseFloat(modalPresentation.conversion_factor) <= 0 || !modalPresentation.price}
                                    onClick={() => {
                                        const newPres: SalePresentation = {
                                            id: modalPresentation.id || `pres_${Date.now()}_${Math.random().toString(36).substring(7)}`,
                                            unit_name: modalPresentation.unit_name.trim(),
                                            conversion_factor: parseFloat(modalPresentation.conversion_factor),
                                            price: parseNumber(modalPresentation.price),
                                            barcode: modalPresentation.barcode.trim() || undefined,
                                            image_url: modalPresentation.image_url.trim() || undefined,
                                            nicknames: (modalPresentation.nicknames || []).filter(Boolean)
                                        };
                                        const arr = [...salePresentations];
                                        if (editingPresentationIdx !== null) {
                                            arr[editingPresentationIdx] = newPres;
                                        } else {
                                            arr.push(newPres);
                                        }
                                        setSalePresentations(arr);
                                        setShowSalePresentationModal(false);
                                    }}
                                    className="flex-1 h-10 text-sm font-bold text-[#102218] bg-[#fbbf24] hover:bg-[#f59e0b] disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors shadow-sm flex items-center justify-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-[18px]">check</span>
                                    Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Scanner para presentación */}
                {showPresentationScanner && (
                    <BarcodeScanner
                        onScan={(code) => {
                            setModalPresentation(prev => ({ ...prev, barcode: code }));
                            setShowPresentationScanner(false);
                            handlePresentationBarcodeLookup(code);
                        }}
                        onClose={() => setShowPresentationScanner(false)}
                    />
                )}
            </div>

            {/* Modal código de barras duplicado */}
            {duplicateProduct && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
                    <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-2xl p-6 mx-4 w-full max-w-xs flex flex-col items-center gap-4 animate-[fadeIn_0.2s_ease-out]">
                        <div className="size-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                            <span className="material-symbols-outlined text-amber-500 text-3xl">warning</span>
                        </div>
                        <div className="text-center">
                            <p className="text-base font-bold text-gray-900 dark:text-white">
                                Este producto ya existe
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                                El código de barras ya está asignado a:
                            </p>
                            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300 mt-1">
                                {duplicateProduct.name}
                            </p>
                        </div>
                        <button
                            onClick={() => setDuplicateProduct(null)}
                            className="w-full h-11 flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-[#102218] font-bold rounded-xl transition-colors"
                            aria-label="Cerrar modal de producto duplicado"
                            tabIndex={0}
                        >
                            Entendido
                        </button>
                    </div>
                </div>
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
                                {productToEdit ? '¡Producto actualizado!' : '¡Producto creado!'}
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
                                        // Reset fields manually
                                        setProductName('');
                                        setCategoryId('');
                                        setSupplierId('');
                                        setBarcode('');
                                        setStock('');
                                        setPrice('');
                                        setCost('');
                                        setNicknames([]);
                                        setNicknameInput('');
                                        setPurchaseUnits([]);
                                        setSalePresentations([]);
                                        // resetImage (no deleteImage): la imagen ya quedó
                                        // asociada al producto guardado. Borrarla del bucket
                                        // dejaría su image_url apuntando a un archivo inexistente.
                                        resetImage();
                                        // Scroll to top
                                        document.getElementById('simple-product-scroll')?.scrollTo(0, 0);
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

            {/* Modal: Crear nuevo proveedor */}
            {showNewSupplierModal && (
                <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center md:p-4 animate-[fadeIn_0.2s_ease-out]">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" role="button" tabIndex={-1} onClick={() => setShowNewSupplierModal(false)} onKeyDown={(e) => e.key === 'Escape' && setShowNewSupplierModal(false)} aria-label="Cerrar" />
                    <div className="relative bg-white dark:bg-surface-dark md:rounded-2xl rounded-t-3xl w-full max-w-md p-6 shadow-2xl border border-gray-200 dark:border-gray-700 animate-[slideUp_0.3s_ease-out] md:animate-none">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <span className="material-symbols-outlined text-primary text-xl">person_add</span>
                            </div>
                            <div>
                                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Nuevo Proveedor</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Completa los datos</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-[0.12em]">Nombre *</label>
                                <input
                                    type="text"
                                    value={newSupplierName}
                                    onChange={e => setNewSupplierName(e.target.value)}
                                    className="w-full h-11 px-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                    placeholder="Ej: Distribuidora ABC"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-[0.12em]">NIT / Cédula</label>
                                <input
                                    type="text"
                                    value={newSupplierNit}
                                    onChange={e => setNewSupplierNit(e.target.value)}
                                    className="w-full h-11 px-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                    placeholder=""
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-[0.12em]">Teléfono</label>
                                <input
                                    type="tel"
                                    value={newSupplierPhone}
                                    onChange={e => setNewSupplierPhone(e.target.value)}
                                    className="w-full h-11 px-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                    placeholder="3101234567"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-[0.12em]">Dirección</label>
                                <input
                                    type="text"
                                    value={newSupplierAddress}
                                    onChange={e => setNewSupplierAddress(e.target.value)}
                                    className="w-full h-11 px-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                    placeholder=""
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-5">
                            <button
                                type="button"
                                onClick={() => { setShowNewSupplierModal(false); setNewSupplierName(''); setNewSupplierNit(''); setNewSupplierPhone(''); setNewSupplierAddress(''); }}
                                className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    if (!newSupplierName.trim() || creatingSupplier) return;
                                    setCreatingSupplier(true);
                                    try {
                                        const created = await createSupplier({
                                            name: newSupplierName,
                                            nit: newSupplierNit,
                                            phone: newSupplierPhone,
                                            address: newSupplierAddress,
                                        });
                                        setSupplierId(created.id);
                                        setShowNewSupplierModal(false);
                                        setNewSupplierName('');
                                        setNewSupplierNit('');
                                        setNewSupplierPhone('');
                                        setNewSupplierAddress('');
                                        showToast('Proveedor creado', 'success');
                                    } catch (err: any) {
                                        showToast(err.message || 'Error al crear proveedor', 'error');
                                    } finally {
                                        setCreatingSupplier(false);
                                    }
                                }}
                                disabled={!newSupplierName.trim() || creatingSupplier}
                                className="flex-1 py-3 bg-[#009459] hover:bg-[#007a49] text-white font-bold rounded-xl shadow-md shadow-[#009459]/20 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                            >
                                {creatingSupplier ? 'Creando...' : 'Crear Proveedor'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
