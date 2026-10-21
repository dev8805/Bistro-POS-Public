
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Product, CustomizableOption, ModifierProduct, AddedModifier } from '../types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { formatCurrency } from '../lib/formatters';
import { splitOptions, isFolder, isProductOption } from '../lib/optionFolders';

interface ProductOptionsModalProps {
    product: Product;
    onClose: () => void;
    onAddToOrder: (product: Product, quantity: number, removedIngredients: string[], cookingTerm: string, notes: string, addedModifiers?: AddedModifier[]) => void;
    onSaveConfig: (product: Product, categoryOptions?: CustomizableOption[]) => void;
    onAddAnimation?: (rect: DOMRect, image: string) => void;
    categoryOptions?: CustomizableOption[]; // Etiquetas de la categoría (sueltas + carpetas)
    categoryName?: string; // Name of the product's category
    allProducts?: Product[]; // Catálogo en vivo, para resolver precio/tipo de los productos-modificadores
}

type TabType = 'use' | 'config';
type ConfigSubTab = 'tags' | 'folders' | 'products';

interface ProductSuggestion {
    id: string;
    name: string;
    type: string;
    is_for_sale: boolean;
}

export const ProductOptionsModal: React.FC<ProductOptionsModalProps> = ({
    product,
    onClose,
    onAddToOrder,
    onSaveConfig,
    onAddAnimation,
    categoryOptions: propCategoryOptions = [],
    categoryName = '',
    allProducts = []
}) => {
    const { profile } = useAuth();
    const [activeTab, setActiveTab] = useState<TabType>('use');
    const [configSubTab, setConfigSubTab] = useState<ConfigSubTab>('tags');

    // Detectar si es un CartItem (tiene quantity) para pre-cargar su configuración
    const isCartItem = 'quantity' in product && typeof (product as any).quantity === 'number';
    const cartItem = isCartItem ? (product as any) : null;

    // Detectar si el CartItem ya tiene personalizaciones aplicadas (para ingredientes/opciones)
    const hasExistingCustomizations = cartItem && (
        (cartItem.removedIngredients && cartItem.removedIngredients.length > 0) ||
        cartItem.cookingTerm ||
        cartItem.notes
    );

    // ============ USE TAB STATE ============
    // FIX: Si es un CartItem, SIEMPRE cargar su cantidad y notas actuales
    // Solo usar defaults (quantity=1, notes='') si es un producto del menú (no CartItem)
    const [quantity, setQuantity] = useState(cartItem ? cartItem.quantity : 1);
    const [removedIngredients, setRemovedIngredients] = useState<string[]>(
        hasExistingCustomizations ? (cartItem.removedIngredients || []) : []
    );
    // Separar sueltas/carpetas y quitar las excluidas de este producto (por nombre).
    // Tomar las excluidas del estado vivo (allProducts) si existe; si no, del snapshot.
    const liveProduct = allProducts.find(p => p.id === product.id);
    const excludedOptions = ((liveProduct as any)?.excludedOptions ?? (product as any).excludedOptions) || [];
    // Estado vivo de etiquetas excluidas (editable en Ajustes). Se usa para filtrar
    // tanto Ajustes como Modificar, así excluir oculta la etiqueta al instante.
    const [excludedOpts, setExcludedOpts] = useState<string[]>(excludedOptions);
    const { loose: looseRaw, folders: foldersRaw, products: looseProductsRaw } = useMemo(
        () => splitOptions(propCategoryOptions),
        [propCategoryOptions]
    );
    // Las carpetas excluidas se guardan como `folder:<nombre>` en el mismo array `excludedOptions`,
    // para evitar migración de BD. Helper para chequearlo:
    const isFolderExcluded = (name: string) => excludedOpts.includes(`folder:${name}`);
    const visibleLoose = looseRaw.filter(opt => !excludedOpts.includes(opt));
    const visibleFolders = foldersRaw
        .filter(f => !isFolderExcluded(f.name)) // Carpetas excluidas no aparecen en "Modificar"
        .map(f => ({ name: f.name, options: f.options.filter(opt => !excludedOpts.includes(opt)), products: f.products || [] }))
        .filter(f => f.options.length > 0 || f.products.length > 0);
    // Productos sueltos (add-ons fuera de carpeta). Se excluyen por nombre, igual que las etiquetas.
    const visibleProducts = looseProductsRaw.filter(p => !excludedOpts.includes(p.name));
    // Permitir múltiples opciones/etiquetas seleccionadas
    const [selectedOptions, setSelectedOptions] = useState<string[]>(
        hasExistingCustomizations && cartItem.cookingTerm
            ? cartItem.cookingTerm.split(', ').filter(Boolean)
            : []
    );
    const [notes, setNotes] = useState(cartItem ? (cartItem.notes || '') : '');

    // Productos-modificadores (add-ons) seleccionados al vender. Precarga si es un CartItem.
    const [selectedModifiers, setSelectedModifiers] = useState<AddedModifier[]>(
        (cartItem?.addedModifiers as AddedModifier[]) || []
    );
    // Resolver datos en vivo del catálogo por id (precio/tipo/nombre actualizados).
    const productById = (id: string) => allProducts.find(p => p.id === id);
    const priceOf = (id: string) => productById(id)?.price ?? 0;
    // Búsqueda local (por carpeta) para "Agregar producto" en Ajustes.
    const [folderProductQuery, setFolderProductQuery] = useState<Record<string, string>>({});

    const toggleModifierProduct = (mp: ModifierProduct) => {
        setSelectedModifiers(prev =>
            prev.some(m => m.id === mp.id)
                ? prev.filter(m => m.id !== mp.id)
                : [...prev, { id: mp.id, name: mp.name, price: priceOf(mp.id) }]
        );
    };

    // Carpeta abierta como dropdown flotante en el tab "Modificar" (una a la vez, fuera del modal).
    const [openFolderName, setOpenFolderName] = useState<string | null>(null);
    const [folderAnchor, setFolderAnchor] = useState<DOMRect | null>(null);
    const folderPopoverRef = useRef<HTMLDivElement>(null);
    const openChipRef = useRef<HTMLButtonElement>(null); // chip de la carpeta abierta (para re-medir su ancho)
    const handleToggleFolder = (name: string, e: React.MouseEvent<HTMLButtonElement>) => {
        if (openFolderName === name) { setOpenFolderName(null); return; }
        setFolderAnchor(e.currentTarget.getBoundingClientRect());
        setOpenFolderName(name);
    };

    // Cerrar el dropdown flotante al hacer click afuera, hacer scroll fuera, redimensionar o Escape.
    useEffect(() => {
        if (!openFolderName) return;
        const handleDown = (ev: MouseEvent) => {
            const target = ev.target as Node;
            if (folderPopoverRef.current?.contains(target)) return;
            if ((target as HTMLElement).closest?.('[data-folder-chip]')) return;
            setOpenFolderName(null);
        };
        const handleScroll = (ev: Event) => {
            // En móvil el sheet es fijo; no cerrar por scroll (evita cierres al enfocar el input/teclado).
            if (window.innerWidth < 768) return;
            if (folderPopoverRef.current?.contains(ev.target as Node)) return;
            setOpenFolderName(null);
        };
        // En móvil el teclado dispara 'resize'; solo cerrar en desktop.
        const handleResize = () => { if (window.innerWidth >= 768) setOpenFolderName(null); };
        const handleKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setOpenFolderName(null); };
        document.addEventListener('mousedown', handleDown);
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', handleResize);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleDown);
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', handleResize);
            document.removeEventListener('keydown', handleKey);
        };
    }, [openFolderName]);

    // ============ CONFIG TAB STATE ============
    const [ingredients, setIngredients] = useState<string[]>(product.ingredients || []);
    const [configOptions, setConfigOptions] = useState<CustomizableOption[]>(propCategoryOptions);
    const [newIngredient, setNewIngredient] = useState('');
    // Inputs para agregar etiqueta dentro de cada carpeta (clave = nombre de carpeta).
    const [folderInputs, setFolderInputs] = useState<Record<string, string>>({});
    // Etiqueta suelta que se está moviendo a una carpeta (abre el selector inline).
    const [movingOption, setMovingOption] = useState<string | null>(null);
    const [newFolderName, setNewFolderName] = useState('');
    // Input para crear una etiqueta suelta (fuera de carpetas).
    const [newOptionName, setNewOptionName] = useState('');
    // Buscador para agregar un producto suelto (add-on fuera de carpetas).
    const [newProductQuery, setNewProductQuery] = useState('');

    // Re-medir el chip abierto cuando cambia su ancho (p. ej. al aparecer el badge de cantidad)
    // para que el flyout lateral se reposicione y nunca quede por detrás del chip.
    useLayoutEffect(() => {
        if (!openFolderName || !openChipRef.current) return;
        const r = openChipRef.current.getBoundingClientRect();
        setFolderAnchor(prev =>
            prev && prev.left === r.left && prev.top === r.top && prev.width === r.width && prev.height === r.height
                ? prev
                : r
        );
    }, [openFolderName, selectedOptions, configOptions, excludedOpts, activeTab]);

    // Autocomplete state
    const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);
    // Buscador de producto suelto: el dropdown se renderiza en un portal (fuera del modal).
    const looseSearchRef = useRef<HTMLInputElement>(null);
    const looseSearchPopRef = useRef<HTMLDivElement>(null);
    const [looseSearchRect, setLooseSearchRect] = useState<DOMRect | null>(null);

    // Ref de la lista scrolleable de la sub-pestaña activa (uno solo: solo se monta una a la vez).
    // Se usa para hacer scroll al fondo al agregar un nuevo item, y que quede visible.
    const listScrollRef = useRef<HTMLDivElement>(null);
    const scrollListToBottom = () => {
        requestAnimationFrame(() => {
            const el = listScrollRef.current;
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
        });
    };

    const showCustomization = true; // Personalización siempre activa (toggle eliminado)
    const hasOptions = showCustomization && (visibleLoose.length > 0 || visibleFolders.length > 0 || visibleProducts.length > 0);
    const hasCategoryId = !!(product as any).category_id;

    // Search products for autocomplete
    useEffect(() => {
        const searchProducts = async () => {
            if (newIngredient.trim().length < 2) {
                setSuggestions([]);
                setShowSuggestions(false);
                return;
            }

            setLoadingSuggestions(true);
            try {
                const { data, error } = await supabase
                    .from('products')
                    .select('id, name, type, is_for_sale')
                    .eq('business_id', profile?.business_id)
                    .eq('is_active', true)
                    .ilike('name', `%${newIngredient.trim()}%`)
                    .limit(10);

                if (!error && data) {
                    const filtered = data.filter((p: ProductSuggestion) =>
                        !ingredients.includes(p.name)
                    );
                    setSuggestions(filtered);
                    setShowSuggestions(filtered.length > 0);
                }
            } catch (err) {
                console.error('Error searching products:', err);
            } finally {
                setLoadingSuggestions(false);
            }
        };

        const debounce = setTimeout(searchProducts, 300);
        return () => clearTimeout(debounce);
    }, [newIngredient, profile?.business_id, ingredients]);

    // Close suggestions on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                suggestionsRef.current &&
                !suggestionsRef.current.contains(e.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(e.target as Node)
            ) {
                setShowSuggestions(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Medir la posición del input de "Agregar producto suelto" para anclar el dropdown del portal.
    useLayoutEffect(() => {
        if (activeTab !== 'config' || configSubTab !== 'products' || newProductQuery.trim().length < 1) {
            setLooseSearchRect(null);
            return;
        }
        const measure = () => {
            if (looseSearchRef.current) setLooseSearchRect(looseSearchRef.current.getBoundingClientRect());
        };
        measure();
        window.addEventListener('scroll', measure, true);
        window.addEventListener('resize', measure);
        return () => {
            window.removeEventListener('scroll', measure, true);
            window.removeEventListener('resize', measure);
        };
    }, [activeTab, configSubTab, newProductQuery]);

    // Cerrar el dropdown del buscador al hacer click fuera (input o lista).
    useEffect(() => {
        if (!looseSearchRect) return;
        const handleDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (looseSearchRef.current?.contains(t) || looseSearchPopRef.current?.contains(t)) return;
            setNewProductQuery('');
        };
        document.addEventListener('mousedown', handleDown);
        return () => document.removeEventListener('mousedown', handleDown);
    }, [looseSearchRect]);

    const [isClosing, setIsClosing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Snapshot del último estado "guardado" (inicialmente = props). Se usa como referencia para
    // calcular `dirtyByTab`. Tras guardar exitosamente lo actualizamos al estado actual, así
    // los puntos de "cambios sin guardar" desaparecen y el botón se deshabilita.
    const [savedSnapshot, setSavedSnapshot] = useState<{ options: CustomizableOption[]; excluded: string[] }>({
        options: propCategoryOptions,
        excluded: ((product as any).excludedOptions || []) as string[],
    });

    // Popover de información (en el header, junto al botón cerrar). Se ancla al botón con su rect.
    const [infoOpen, setInfoOpen] = useState(false);
    const [infoAnchor, setInfoAnchor] = useState<DOMRect | null>(null);
    const infoBtnRef = useRef<HTMLButtonElement>(null);
    const infoPopRef = useRef<HTMLDivElement>(null);
    const handleToggleInfo = () => {
        if (infoOpen) { setInfoOpen(false); return; }
        if (infoBtnRef.current) setInfoAnchor(infoBtnRef.current.getBoundingClientRect());
        setInfoOpen(true);
    };
    // Cerrar el popover con ESC.
    useEffect(() => {
        if (!infoOpen) return;
        const handleKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setInfoOpen(false); };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [infoOpen]);

    // ── Bottom sheet móvil de carpetas: arrastrar desde cualquier parte para cerrar ──
    const [sheetOffset, setSheetOffset] = useState(0);
    const [sheetDragging, setSheetDragging] = useState(false);
    const [sheetClosing, setSheetClosing] = useState(false);
    const sheetStartY = useRef<number | null>(null);
    const sheetOffsetRef = useRef(0);
    const sheetDraggingRef = useRef(false);
    const sheetListRef = useRef<HTMLDivElement>(null); // lista scrolleable interna

    // Reset del arrastre cada vez que se abre una carpeta.
    useEffect(() => {
        if (!openFolderName) return;
        setSheetOffset(0); sheetOffsetRef.current = 0;
        setSheetDragging(false); sheetDraggingRef.current = false;
        setSheetClosing(false);
    }, [openFolderName]);

    // Cierre animado del sheet móvil (desliza hacia abajo y luego desmonta).
    const closeSheetMobile = () => {
        setSheetClosing(true);
        setTimeout(() => {
            setOpenFolderName(null);
            setSheetClosing(false);
            setSheetOffset(0);
            sheetOffsetRef.current = 0;
        }, 250);
    };

    // touchmove con passive:false para poder preventDefault y arrastrar todo el sheet.
    // Solo arrastra-para-cerrar si la lista ya está arriba del todo; si no, deja hacer scroll.
    useEffect(() => {
        if (!openFolderName || window.innerWidth >= 768) return;
        const el = folderPopoverRef.current;
        if (!el) return;
        const handler = (e: TouchEvent) => {
            if (sheetStartY.current === null) return;
            const delta = e.touches[0].clientY - sheetStartY.current;
            const list = sheetListRef.current;
            const atTop = !list || list.scrollTop <= 0;
            if (delta > 5 && atTop) {
                e.preventDefault();
                if (!sheetDraggingRef.current) { sheetDraggingRef.current = true; setSheetDragging(true); }
                sheetOffsetRef.current = delta;
                setSheetOffset(delta);
            }
        };
        el.addEventListener('touchmove', handler, { passive: false });
        return () => el.removeEventListener('touchmove', handler);
    }, [openFolderName]);

    // Detección de cambios separada por sub-pestaña (tags / folders / products) y total.
    // Las exclusiones se clasifican en su tipo:
    //  - `folder:<name>` → carpeta
    //  - nombre presente en productos sueltos (iniciales o actuales) → producto
    //  - resto → etiqueta
    const configSplit = useMemo(() => splitOptions(configOptions), [configOptions]);
    const dirtyByTab = useMemo(() => {
        const initial = splitOptions(savedSnapshot.options);
        const initialEx: string[] = savedSnapshot.excluded;

        const productNamesUniverse = new Set([
            ...initial.products.map(p => p.name),
            ...configSplit.products.map(p => p.name),
        ]);

        const classify = (arr: string[]) => {
            const folders: string[] = [];
            const products: string[] = [];
            const tags: string[] = [];
            for (const x of arr) {
                if (x.startsWith('folder:')) folders.push(x);
                else if (productNamesUniverse.has(x)) products.push(x);
                else tags.push(x);
            }
            return { folders, products, tags };
        };

        const ic = classify(initialEx);
        const cc = classify(excludedOpts);

        const arrEq = (a: string[], b: string[]) => {
            if (a.length !== b.length) return false;
            const sa = [...a].sort();
            const sb = [...b].sort();
            return sa.every((v, i) => v === sb[i]);
        };

        const tags =
            JSON.stringify(initial.loose) !== JSON.stringify(configSplit.loose) ||
            !arrEq(ic.tags, cc.tags);

        const folders =
            JSON.stringify(initial.folders) !== JSON.stringify(configSplit.folders) ||
            !arrEq(ic.folders, cc.folders);

        const products =
            JSON.stringify(initial.products) !== JSON.stringify(configSplit.products) ||
            !arrEq(ic.products, cc.products);

        return { tags, folders, products, any: tags || folders || products };
    }, [savedSnapshot, configSplit, excludedOpts]);

    // ============ HANDLERS ============
    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => {
            onClose();
        }, 200); // Wait for animation
    };

    const toggleIngredient = (ingredient: string) => {
        setRemovedIngredients(prev =>
            prev.includes(ingredient)
                ? prev.filter(i => i !== ingredient)
                : [...prev, ingredient]
        );
    };

    // Toggle de opciones múltiples
    const toggleOption = (option: string) => {
        setSelectedOptions(prev =>
            prev.includes(option)
                ? prev.filter(o => o !== option)
                : [...prev, option]
        );
    };

    const handleAdd = () => {
        // Convertir array de opciones a string separado por coma
        const cookingTermString = selectedOptions.join(', ');
        // Re-resolver el precio en vivo por si cambió desde que se abrió el modal.
        const modifiers = selectedModifiers.map(m => ({ id: m.id, name: m.name, price: priceOf(m.id) }));
        onAddToOrder(product, quantity, removedIngredients, cookingTermString, notes, modifiers);
        handleClose();
    };

    const handleSaveConfig = () => {
        setIsSaving(true);
        // Capturamos el estado a guardar AHORA, así no dependemos de cierres con el state actual al final.
        const snapshotOptions = configOptions;
        const snapshotExcluded = excludedOpts;
        setTimeout(() => {
            onSaveConfig({
                ...product,
                hasCustomization: true,
                ingredients,
                customizableOptions: snapshotOptions,
                excludedOptions: snapshotExcluded,
            }, snapshotOptions);
            // Actualizar el snapshot al estado guardado: limpia los puntos de "cambios sin guardar"
            // y deshabilita el botón hasta que el usuario vuelva a editar.
            setSavedSnapshot({ options: snapshotOptions, excluded: snapshotExcluded });
            // No cerrar el modal: el usuario sigue configurando. Solo salir del estado "Guardando".
            setIsSaving(false);
        }, 600);
    };

    const addIngredient = (name?: string) => {
        const ingredientName = name || newIngredient.trim();
        if (ingredientName && !ingredients.includes(ingredientName)) {
            setIngredients([...ingredients, ingredientName]);
            setNewIngredient('');
            setShowSuggestions(false);
            setSuggestions([]);
        }
    };

    const selectSuggestion = (suggestion: ProductSuggestion) => {
        addIngredient(suggestion.name);
        inputRef.current?.focus();
    };

    const removeIngredient = (index: number) => {
        setIngredients(ingredients.filter((_, i) => i !== index));
    };

    // Crear una carpeta vacía.
    const addFolder = () => {
        const name = newFolderName.trim();
        if (!name || configOptions.some(o => isFolder(o) && o.name === name)) return;
        setConfigOptions([...configOptions, { name, options: [] }]);
        setNewFolderName('');
        scrollListToBottom();
    };

    // Crear una etiqueta suelta (fuera de carpetas).
    const addLooseOption = () => {
        const name = newOptionName.trim();
        if (!name) return;
        // Evitar duplicados: ni como suelta ni dentro de una carpeta.
        const exists = configOptions.some(o =>
            (typeof o === 'string' && o === name) ||
            (isFolder(o) && o.options.includes(name))
        );
        if (exists) { setNewOptionName(''); return; }
        setConfigOptions([...configOptions, name]);
        setNewOptionName('');
        scrollListToBottom();
    };

    // Agregar un producto suelto (add-on fuera de carpetas). Guarda solo {id, name}.
    const addLooseProduct = (prod: ModifierProduct) => {
        const exists = configOptions.some(o => isProductOption(o) && o.id === prod.id);
        if (exists) { setNewProductQuery(''); return; }
        setConfigOptions([...configOptions, { id: prod.id, name: prod.name }]);
        setNewProductQuery('');
        scrollListToBottom();
    };

    // Quitar un producto suelto.
    const removeLooseProduct = (productId: string) => {
        setConfigOptions(configOptions.filter(o => !(isProductOption(o) && o.id === productId)));
    };

    // Toggle de exclusión de carpeta entera para este producto. Se guarda como `folder:<nombre>`
    // dentro de `excludedOptions` para no requerir cambios de schema en BD.
    const toggleFolderExclusion = (folderName: string) => {
        const key = `folder:${folderName}`;
        setExcludedOpts(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]);
    };

    // Eliminar una carpeta completa (con sus etiquetas).
    const removeFolder = (name: string) => {
        setConfigOptions(configOptions.filter(o => !(isFolder(o) && o.name === name)));
    };

    // Agregar una etiqueta dentro de una carpeta.
    const addOptionToFolder = (folderName: string) => {
        const value = (folderInputs[folderName] || '').trim();
        if (!value) return;
        setConfigOptions(configOptions.map(o =>
            isFolder(o) && o.name === folderName && !o.options.includes(value)
                ? { ...o, options: [...o.options, value] }
                : o
        ));
        setFolderInputs(prev => ({ ...prev, [folderName]: '' }));
    };

    // Quitar una etiqueta de una carpeta.
    const removeOptionFromFolder = (folderName: string, option: string) => {
        setConfigOptions(configOptions.map(o =>
            isFolder(o) && o.name === folderName
                ? { ...o, options: o.options.filter(opt => opt !== option) }
                : o
        ));
    };

    // Agregar un producto-modificador a una carpeta (Ajustes). Guarda solo {id, name}.
    const addProductToFolder = (folderName: string, prod: ModifierProduct) => {
        setConfigOptions(configOptions.map(o =>
            isFolder(o) && o.name === folderName && !(o.products || []).some(p => p.id === prod.id)
                ? { ...o, products: [...(o.products || []), { id: prod.id, name: prod.name }] }
                : o
        ));
        setFolderProductQuery(prev => ({ ...prev, [folderName]: '' }));
    };

    // Quitar un producto-modificador de una carpeta.
    const removeProductFromFolder = (folderName: string, productId: string) => {
        setConfigOptions(configOptions.map(o =>
            isFolder(o) && o.name === folderName
                ? { ...o, products: (o.products || []).filter(p => p.id !== productId) }
                : o
        ));
    };

    // Eliminar una etiqueta suelta (legacy).
    const removeLooseOption = (option: string) => {
        setConfigOptions(configOptions.filter(o => !(typeof o === 'string' && o === option)));
        setExcludedOpts(prev => prev.filter(x => x !== option));
    };

    // Mover una etiqueta suelta a una carpeta (nueva o existente).
    const moveLooseToFolder = (option: string, folderName: string) => {
        const target = folderName.trim();
        if (!target) return;
        let foundFolder = false;
        const next: CustomizableOption[] = configOptions
            .filter(o => !(typeof o === 'string' && o === option)) // sacar de sueltas
            .map(o => {
                if (isFolder(o) && o.name === target) {
                    foundFolder = true;
                    return o.options.includes(option) ? o : { ...o, options: [...o.options, option] };
                }
                return o;
            });
        if (!foundFolder) next.push({ name: target, options: [option] });
        setConfigOptions(next);
        setMovingOption(null);
    };

    const total = product.price * quantity;
    const folderNames = configSplit.folders.map(f => f.name);
    // Coincidencias del buscador de producto suelto (excluye el propio producto y los ya agregados como sueltos).
    const looseProductQuery = newProductQuery.trim().toLowerCase();
    const looseProductMatches = looseProductQuery.length >= 1
        ? allProducts
            .filter(p => p.id !== product.id
                && p.name.toLowerCase().includes(looseProductQuery)
                && !configSplit.products.some(lp => lp.id === p.id))
            .slice(0, 8)
        : [];

    return (
        <div className={`fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-6 pb-24 md:pb-6 ${isClosing ? 'animate-[fadeOut_0.2s_ease-out] pointer-events-none' : 'animate-[fadeIn_0.2s_ease-out]'}`}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" role="button" tabIndex={-1} onClick={handleClose} onKeyDown={(e) => e.key === 'Escape' && handleClose()} aria-label="Cerrar"></div>

            <div className={`relative w-full max-h-[85vh] md:max-h-[90vh] md:max-w-lg bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl overflow-hidden flex flex-col z-10 ${isClosing ? 'animate-[zoomOut_0.2s_ease-in]' : 'animate-[zoomIn_0.2s_ease-out]'}`}>

                {/* Header */}
                <div className="flex gap-4 p-4 border-b border-gray-100 dark:border-gray-800 relative bg-white dark:bg-surface-dark shrink-0 items-center">
                    {/* Small Image */}
                    <div
                        className="size-16 shrink-0 rounded-xl bg-cover bg-center shadow-md border border-gray-100 dark:border-gray-700"
                        style={{ backgroundImage: `url('${product.image || (product as any).image_url}')` }}
                    ></div>

                    {/* Info */}
                    <div className="flex flex-col justify-center flex-1 min-w-0 pr-28">
                        <h2 className="text-lg font-semibold text-text-main dark:text-white leading-tight truncate">{product.name}</h2>
                        <span className="text-gray-500 dark:text-gray-400 font-bold text-sm inline-block mt-1">${formatCurrency(product.price)}</span>
                    </div>

                    {/* Acciones del header (Info + Cerrar) */}
                    <div className="absolute top-4 right-4 flex items-center gap-2">
                        <button
                            ref={infoBtnRef}
                            onClick={handleToggleInfo}
                            aria-label="Cómo aplican estos ajustes"
                            className={`h-8 px-2.5 inline-flex items-center gap-1 rounded-full border text-xs font-bold transition-all active:scale-95 ${infoOpen
                                ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300'
                                : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                        >
                            <span className="material-symbols-outlined text-[16px]">info</span>
                            Info
                        </button>
                        <button
                            onClick={handleClose}
                            className="size-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800 text-text-main dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-95"
                            aria-label="Cerrar"
                        >
                            <span className="material-symbols-outlined text-[20px]">close</span>
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-surface-dark shrink-0">
                    <button
                        onClick={() => setActiveTab('use')}
                        className={`relative flex-1 py-3.5 text-sm font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-2 ${activeTab === 'use'
                            ? 'text-text-main dark:text-white'
                            : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                            }`}
                    >
                        <span className="material-symbols-outlined text-[18px]">format_list_bulleted</span>
                        Modificar
                        <span className={`absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full transition-all ${activeTab === 'use' ? 'bg-primary scale-x-100' : 'bg-transparent scale-x-0'}`}></span>
                    </button>
                    <button
                        onClick={() => setActiveTab('config')}
                        className={`relative flex-1 py-3.5 text-sm font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-2 ${activeTab === 'config'
                            ? 'text-text-main dark:text-white'
                            : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                            }`}
                    >
                        <span className="material-symbols-outlined text-[18px]">settings</span>
                        Ajustes
                        <span className={`absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full transition-all ${activeTab === 'config' ? 'bg-primary scale-x-100' : 'bg-transparent scale-x-0'}`}></span>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 flex flex-col">

                    {/* ============ USE TAB ============ */}
                    {activeTab === 'use' && (
                        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-5">
                            {showCustomization ? (
                                <>
                                    {/* Options */}
                                    {hasOptions && (
                                        <div className="mb-5">
                                            <div className="flex flex-wrap gap-2">
                                                {/* Carpetas: chip compacto que abre un dropdown flotante (fuera del modal) */}
                                                {visibleFolders.map((folder) => {
                                                    const selectedCount = folder.options.filter(o => selectedOptions.includes(o)).length
                                                        + (folder.products || []).filter(p => selectedModifiers.some(m => m.id === p.id)).length;
                                                    const isOpen = openFolderName === folder.name;
                                                    return (
                                                        <div key={folder.name} className="relative">
                                                            {selectedCount > 0 && (
                                                                <span className="absolute -top-1.5 -left-1.5 z-10 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold leading-none shadow-sm">
                                                                    {selectedCount}
                                                                </span>
                                                            )}
                                                            <button
                                                                data-folder-chip
                                                                ref={isOpen ? openChipRef : null}
                                                                onClick={(e) => handleToggleFolder(folder.name, e)}
                                                                className={`pl-3 pr-2 py-2 rounded-xl border text-sm font-bold transition-all active:scale-95 flex items-center gap-1.5 ${selectedCount > 0 || isOpen
                                                                    ? 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-500/50 dark:bg-orange-500/10 dark:text-orange-400 ring-1 ring-orange-200 dark:ring-orange-900/50 shadow-sm'
                                                                    : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-text-secondary hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                                                                    }`}
                                                            >
                                                                <span className="material-symbols-outlined text-[18px] text-[#F5C242]" style={{ fontVariationSettings: "'FILL' 1" }}>folder</span>
                                                                {folder.name}
                                                                <span className={`material-symbols-outlined text-[18px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
                                                            </button>
                                                        </div>
                                                    );
                                                })}

                                                {/* Separador entre carpetas y etiquetas */}
                                                {visibleFolders.length > 0 && visibleLoose.length > 0 && (
                                                    <div className="w-full border-t border-dashed border-gray-300 dark:border-gray-600 my-1.5" />
                                                )}

                                                {/* Etiquetas sueltas (legacy) */}
                                                {visibleLoose.map((option) => (
                                                    <button
                                                        key={option}
                                                        onClick={() => toggleOption(option)}
                                                        className={`px-4 py-2 rounded-xl border text-sm font-bold transition-all active:scale-95 ${selectedOptions.includes(option)
                                                            ? 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-500/50 dark:bg-orange-500/10 dark:text-orange-400 ring-1 ring-orange-200 dark:ring-orange-900/50 shadow-sm'
                                                            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-text-secondary hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                                                            }`}
                                                    >
                                                        {option}
                                                    </button>
                                                ))}

                                                {/* Separador entre etiquetas/carpetas y productos sueltos */}
                                                {(visibleFolders.length > 0 || visibleLoose.length > 0) && visibleProducts.length > 0 && (
                                                    <div className="w-full border-t border-dashed border-gray-300 dark:border-gray-600 my-1.5" />
                                                )}

                                                {/* Productos sueltos (add-ons fuera de carpeta) */}
                                                {visibleProducts.map((p) => {
                                                    const sel = selectedModifiers.some(m => m.id === p.id);
                                                    return (
                                                        <button
                                                            key={p.id}
                                                            onClick={() => toggleModifierProduct(p)}
                                                            className={`px-4 py-2 rounded-xl border text-sm font-bold transition-all active:scale-95 flex items-center gap-1.5 ${sel
                                                                ? 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-500/50 dark:bg-orange-500/10 dark:text-orange-400 ring-1 ring-orange-200 dark:ring-orange-900/50 shadow-sm'
                                                                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-text-secondary hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
                                                                }`}
                                                        >
                                                            {p.name}
                                                            <span className="text-[11px] font-bold opacity-70">+${formatCurrency(priceOf(p.id))}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Notes */}
                                    <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="material-symbols-outlined text-gray-400 text-[18px]">edit_note</span>
                                            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">NOTAS ADICIONALES</h3>
                                        </div>
                                        <textarea
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            placeholder="Instrucciones especiales..."
                                            rows={notes.length > 50 ? 2 : 1}
                                            className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm text-text-main dark:text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none resize-none transition-all"
                                        ></textarea>
                                    </div>
                                </>
                            ) : (
                                /* No customization - show only notes (compact single row) */
                                <div className="flex items-center gap-4">
                                    <h3 className="text-sm font-semibold text-text-main dark:text-white shrink-0">Observaciones:</h3>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder=""
                                        rows={1}
                                        className="flex-1 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm text-text-main dark:text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none resize-none transition-all"
                                        autoFocus
                                    ></textarea>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ============ CONFIG TAB ============ */}
                    {activeTab === 'config' && (
                        <div className="flex-1 min-h-0 flex flex-col p-5">
                            {hasCategoryId && (
                                <>
                                    {/* Sub-tabs (siempre visibles arriba) */}
                                    <div className="shrink-0 flex p-1 bg-gray-100 dark:bg-gray-800/60 rounded-xl">
                                        {([
                                            { key: 'tags', label: 'Etiquetas' },
                                            { key: 'folders', label: 'Carpetas' },
                                            { key: 'products', label: 'Productos' },
                                        ] as { key: ConfigSubTab; label: string }[]).map(t => {
                                            const active = configSubTab === t.key;
                                            const dirtyDot =
                                                (t.key === 'tags' && dirtyByTab.tags) ||
                                                (t.key === 'folders' && dirtyByTab.folders) ||
                                                (t.key === 'products' && dirtyByTab.products);
                                            return (
                                                <button
                                                    key={t.key}
                                                    onClick={() => setConfigSubTab(t.key)}
                                                    className={`relative flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${active
                                                        ? 'bg-white dark:bg-gray-900 text-text-main dark:text-white shadow-sm'
                                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                                        }`}
                                                >
                                                    {t.label}
                                                    {dirtyDot && (
                                                        <span className="size-1.5 rounded-full bg-orange-500" title="Cambios sin guardar"></span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* ── Sub-pestaña ETIQUETAS ── */}
                                    {configSubTab === 'tags' && (
                                        <>
                                            <div ref={listScrollRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar mt-4 -mx-1 px-1">
                                                {configSplit.loose.length === 0 ? (
                                                    <p className="text-xs text-text-secondary italic px-1 py-2">Aún no hay etiquetas. Crea una abajo.</p>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {configSplit.loose.map((opt) => {
                                                            const isExcluded = excludedOpts.includes(opt);
                                                            return (
                                                                <div key={`loose/${opt}`}>
                                                                    <div className={`flex items-center gap-2 p-2 rounded-lg border ${isExcluded ? 'bg-gray-100 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 opacity-60' : 'bg-gray-50 dark:bg-gray-800/30 border-gray-100 dark:border-gray-800'}`}>
                                                                        <span className={`flex-1 text-sm font-medium ${isExcluded ? 'text-gray-400 line-through' : 'text-text-main dark:text-white'}`}>{opt}</span>
                                                                        <button
                                                                            onClick={() => setMovingOption(movingOption === opt ? null : opt)}
                                                                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-200 transition-colors flex items-center gap-1"
                                                                            title="Mover a una carpeta"
                                                                        >
                                                                            <span className="material-symbols-outlined text-[14px]">create_new_folder</span>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                if (isExcluded) setExcludedOpts(prev => prev.filter(o => o !== opt));
                                                                                else setExcludedOpts(prev => [...prev, opt]);
                                                                            }}
                                                                            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${isExcluded ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200' : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-300'}`}
                                                                            title={isExcluded ? 'Incluir en este producto' : 'Excluir de este producto'}
                                                                        >
                                                                            {isExcluded ? 'Incluir' : 'Excluir'}
                                                                        </button>
                                                                        <button onClick={() => removeLooseOption(opt)} className="text-red-400 hover:text-red-500 p-1">
                                                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                                                        </button>
                                                                    </div>
                                                                    {movingOption === opt && (
                                                                        <div className="flex flex-wrap gap-2 mt-1.5 pl-2">
                                                                            {folderNames.map(fname => (
                                                                                <button
                                                                                    key={fname}
                                                                                    onClick={() => moveLooseToFolder(opt, fname)}
                                                                                    className="px-2.5 py-1 rounded-lg text-xs font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-emerald-400 text-text-main dark:text-white"
                                                                                >
                                                                                    {fname}
                                                                                </button>
                                                                            ))}
                                                                            <div className="flex gap-1">
                                                                                <input
                                                                                    type="text"
                                                                                    value={newFolderName}
                                                                                    onChange={(e) => setNewFolderName(e.target.value)}
                                                                                    placeholder="Nueva carpeta..."
                                                                                    className="w-32 bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 text-xs focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                                                                    onKeyDown={(e) => { if (e.key === 'Enter') { moveLooseToFolder(opt, newFolderName); setNewFolderName(''); } }}
                                                                                />
                                                                                <button onClick={() => { moveLooseToFolder(opt, newFolderName); setNewFolderName(''); }} className="bg-emerald-600 text-white px-2 rounded-lg text-xs font-bold">OK</button>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Crear etiqueta (fijo abajo) */}
                                            <div className="shrink-0 pt-3 flex gap-2 max-w-sm">
                                                <input
                                                    type="text"
                                                    value={newOptionName}
                                                    onChange={(e) => setNewOptionName(e.target.value)}
                                                    placeholder="Nueva etiqueta..."
                                                    className="flex-1 min-w-0 bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                                    onKeyDown={(e) => e.key === 'Enter' && addLooseOption()}
                                                />
                                                <button onClick={addLooseOption} className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-semibold text-sm shrink-0" title="Crear etiqueta">
                                                    Crear
                                                </button>
                                            </div>
                                        </>
                                    )}

                                    {/* ── Sub-pestaña CARPETAS ── */}
                                    {configSubTab === 'folders' && (
                                        <>
                                            <div ref={listScrollRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar mt-4 -mx-1 px-1">
                                                {configSplit.folders.length === 0 ? (
                                                    <p className="text-xs text-text-secondary italic px-1 py-2">Aún no hay carpetas. Crea una abajo.</p>
                                                ) : (
                                                    <div className="flex flex-wrap gap-2">
                                                        {configSplit.folders.map((folder) => {
                                                            const isOpen = openFolderName === folder.name;
                                                            const isExcluded = isFolderExcluded(folder.name);
                                                            return (
                                                                <div key={folder.name} className="flex items-center gap-1">
                                                                    <button
                                                                        data-folder-chip
                                                                        ref={isOpen ? openChipRef : null}
                                                                        onClick={(e) => handleToggleFolder(folder.name, e)}
                                                                        className={`pl-3.5 pr-2 py-2 rounded-xl border text-sm font-semibold transition-all active:scale-95 flex items-center gap-1.5 ${isExcluded
                                                                            ? 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 opacity-60'
                                                                            : isOpen
                                                                                ? 'border-orange-500 bg-orange-50 text-orange-700 dark:border-orange-500/50 dark:bg-orange-500/10 dark:text-orange-400 ring-1 ring-orange-200 dark:ring-orange-900/50 shadow-sm'
                                                                                : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-text-main dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                                                            }`}
                                                                    >
                                                                        <span className={isExcluded ? 'line-through' : ''}>{folder.name}</span>
                                                                        <span className="text-[11px] font-bold opacity-50">{folder.options.length}</span>
                                                                        <span className={`material-symbols-outlined text-[18px] opacity-60 transition-transform ${isOpen ? 'rotate-180' : ''}`}>expand_more</span>
                                                                    </button>
                                                                    <button
                                                                        onClick={() => toggleFolderExclusion(folder.name)}
                                                                        className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${isExcluded
                                                                            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200'
                                                                            : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-300'
                                                                            }`}
                                                                        title={isExcluded ? 'Incluir carpeta en este producto' : 'Excluir carpeta de este producto'}
                                                                    >
                                                                        {isExcluded ? 'Incluir' : 'Excluir'}
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Crear carpeta (fijo abajo) */}
                                            <div className="shrink-0 pt-3 flex gap-2 max-w-sm">
                                                <input
                                                    type="text"
                                                    value={movingOption ? '' : newFolderName}
                                                    onChange={(e) => setNewFolderName(e.target.value)}
                                                    placeholder="Nueva carpeta..."
                                                    disabled={!!movingOption}
                                                    className="flex-1 min-w-0 bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none disabled:opacity-50"
                                                    onKeyDown={(e) => e.key === 'Enter' && addFolder()}
                                                />
                                                <button onClick={addFolder} disabled={!!movingOption} className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 font-semibold text-sm disabled:opacity-50 shrink-0" title="Crear carpeta">
                                                    Crear
                                                </button>
                                            </div>
                                        </>
                                    )}

                                    {/* ── Sub-pestaña PRODUCTOS ── */}
                                    {configSubTab === 'products' && (
                                        <>
                                            <div ref={listScrollRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar mt-4 -mx-1 px-1">
                                                {configSplit.products.length === 0 ? (
                                                    <p className="text-xs text-text-secondary italic px-1 py-2">Aún no hay productos sueltos. Busca uno abajo para agregarlo.</p>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {configSplit.products.map((p) => {
                                                            const isExcluded = excludedOpts.includes(p.name);
                                                            return (
                                                                <div key={p.id} className={`flex items-center gap-2 p-2.5 rounded-lg border ${isExcluded ? 'bg-gray-100 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 opacity-60' : 'bg-emerald-50/40 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/30'}`}>
                                                                    <span className={`flex-1 text-sm font-medium truncate ${isExcluded ? 'text-gray-400 line-through' : 'text-text-main dark:text-white'}`}>{p.name}</span>
                                                                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 shrink-0">${formatCurrency(priceOf(p.id))}</span>
                                                                    <button
                                                                        onClick={() => {
                                                                            if (isExcluded) setExcludedOpts(prev => prev.filter(o => o !== p.name));
                                                                            else setExcludedOpts(prev => [...prev, p.name]);
                                                                        }}
                                                                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${isExcluded ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200' : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-300'}`}
                                                                        title={isExcluded ? 'Incluir en este producto' : 'Excluir de este producto'}
                                                                    >
                                                                        {isExcluded ? 'Incluir' : 'Excluir'}
                                                                    </button>
                                                                    <button onClick={() => removeLooseProduct(p.id)} className="text-red-400 hover:text-red-500 p-1">
                                                                        <span className="material-symbols-outlined text-[18px]">delete</span>
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Buscar producto (fijo abajo) */}
                                            <div className="shrink-0 pt-3 max-w-sm">
                                                <input
                                                    ref={looseSearchRef}
                                                    type="text"
                                                    value={newProductQuery}
                                                    onChange={(e) => setNewProductQuery(e.target.value)}
                                                    placeholder="Buscar producto para agregar..."
                                                    className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                                />
                                            </div>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-white dark:bg-surface-dark border-t border-gray-100 dark:border-gray-800 shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                    {activeTab === 'use' ? (
                        <button
                            onClick={handleAdd}
                            className="w-full h-12 rounded-xl bg-primary hover:bg-primary-hover text-[#102218] font-bold text-base shadow-lg shadow-primary/20 transition-all active:scale-[0.98] flex items-center justify-center"
                        >
                            Agregar a la Orden
                        </button>
                    ) : (
                        <button
                            onClick={handleSaveConfig}
                            disabled={!dirtyByTab.any || isSaving}
                            className={`w-full h-12 rounded-xl font-bold text-base shadow-lg transition-all flex items-center justify-center gap-2
                                ${!dirtyByTab.any || isSaving
                                    ? 'bg-gray-200 text-gray-400 shadow-none cursor-not-allowed dark:bg-gray-800 dark:text-gray-600'
                                    : 'bg-primary hover:bg-primary-hover text-[#102218] shadow-primary/20 active:scale-[0.98]'
                                }
                                ${isSaving ? 'animate-pulse' : ''}
                            `}
                        >
                            {isSaving ? (
                                <>
                                    <span className="material-symbols-outlined text-[20px] animate-spin">refresh</span>
                                    Guardando...
                                </>
                            ) : (
                                'Guardar Configuración'
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Popover de información del header (portal a body, cierra al click afuera o ESC) */}
            {infoOpen && infoAnchor && createPortal(
                <>
                    <div
                        className="fixed inset-0 z-[79]"
                        role="button" tabIndex={-1} aria-label="Cerrar info"
                        onClick={() => setInfoOpen(false)}
                        onKeyDown={(e) => e.key === 'Escape' && setInfoOpen(false)}
                    />
                    {(() => {
                        const width = Math.min(320, window.innerWidth - 24);
                        const right = Math.max(12, window.innerWidth - infoAnchor.right);
                        const top = infoAnchor.bottom + 8;
                        return (
                            <div
                                ref={infoPopRef}
                                style={{ position: 'fixed', top, right, width }}
                                className="z-[80] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl p-4 animate-[fadeIn_0.12s_ease-out]"
                            >
                                <h3 className="text-sm font-bold text-text-main dark:text-white mb-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[18px] text-blue-500">info</span>
                                    Cómo aplican estos ajustes
                                </h3>
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <span className="material-symbols-outlined text-[18px] text-blue-500 shrink-0 mt-0.5">folder_shared</span>
                                        <p className="text-xs text-text-secondary leading-relaxed">
                                            Las <strong className="text-text-main dark:text-white">etiquetas, carpetas y productos que crees o agregues</strong> quedan guardados a nivel de la categoría{categoryName ? <> <strong className="text-text-main dark:text-white">"{categoryName}"</strong></> : null} y aparecen en todos sus productos.
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <span className="material-symbols-outlined text-[18px] text-orange-500 shrink-0 mt-0.5">block</span>
                                        <p className="text-xs text-text-secondary leading-relaxed">
                                            Las <strong className="text-text-main dark:text-white">inclusiones y exclusiones</strong> son por producto: solo afectan a este producto, no a toda la categoría.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                </>,
                document.body
            )}

            {/* Dropdown flotante del buscador de producto suelto (portal a body) */}
            {looseSearchRect && createPortal(
                (() => {
                    const gap = 4;
                    const spaceBelow = window.innerHeight - looseSearchRect.bottom - 16;
                    const spaceAbove = looseSearchRect.top - 16;
                    const placeAbove = spaceBelow < 200 && spaceAbove > spaceBelow;
                    const maxHeight = Math.max(160, (placeAbove ? spaceAbove : spaceBelow));
                    const width = Math.max(looseSearchRect.width, 260);
                    const left = Math.min(looseSearchRect.left, window.innerWidth - width - 8);
                    const style: React.CSSProperties = placeAbove
                        ? { left, bottom: window.innerHeight - looseSearchRect.top + gap, width, maxHeight }
                        : { left, top: looseSearchRect.bottom + gap, width, maxHeight };
                    return (
                        <div
                            ref={looseSearchPopRef}
                            style={style}
                            className="fixed z-[80] overflow-y-auto custom-scrollbar rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl"
                        >
                            {looseProductMatches.length === 0 ? (
                                <p className="text-xs text-gray-400 italic px-3 py-2">Sin coincidencias</p>
                            ) : looseProductMatches.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => addLooseProduct({ id: p.id, name: p.name })}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-50 dark:border-gray-800 last:border-0"
                                >
                                    <span className="flex-1 truncate text-text-main dark:text-white">{p.name}</span>
                                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 shrink-0">${formatCurrency(p.price)}</span>
                                </button>
                            ))}
                        </div>
                    );
                })(),
                document.body
            )}

            {/* Dropdown flotante de carpeta (portal a body, por fuera del modal) */}
            {openFolderName && folderAnchor && createPortal(
                (() => {
                    const isConfig = activeTab === 'config';
                    const folder = (isConfig ? configSplit.folders : visibleFolders).find(f => f.name === openFolderName);
                    if (!folder) return null;

                    const isMobile = window.innerWidth < 768;

                    // ── Encabezado (config: eliminar carpeta · móvil: cerrar) ──
                    const header = (isConfig || isMobile) ? (
                        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 shrink-0">
                            <span className="material-symbols-outlined text-[18px] text-gray-400">folder</span>
                            <span className="flex-1 text-sm font-bold text-text-main dark:text-white truncate">{folder.name}</span>
                            {isConfig && (
                                <button onClick={() => { removeFolder(folder.name); setOpenFolderName(null); }} className="text-red-400 hover:text-red-500 p-1" title="Eliminar carpeta">
                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                </button>
                            )}
                            {isMobile && (
                                <button onClick={closeSheetMobile} className="text-text-secondary hover:text-text-main p-1" title="Cerrar">
                                    <span className="material-symbols-outlined text-[20px]">close</span>
                                </button>
                            )}
                        </div>
                    ) : null;

                    // ── Lista (config: editable · use: checkboxes) ──
                    const list = (
                        <div ref={sheetListRef} className="flex-1 overflow-y-auto custom-scrollbar p-1.5 space-y-1">
                            {isConfig
                                ? folder.options.map((opt) => {
                                    const isExcluded = excludedOpts.includes(opt);
                                    return (
                                        <div key={opt} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${isExcluded ? 'opacity-60' : ''}`}>
                                            <span className={`flex-1 text-sm font-medium ${isExcluded ? 'text-gray-400 line-through' : 'text-text-main dark:text-white'}`}>{opt}</span>
                                            <button
                                                onClick={() => {
                                                    if (isExcluded) setExcludedOpts(prev => prev.filter(o => o !== opt));
                                                    else setExcludedOpts(prev => [...prev, opt]);
                                                }}
                                                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${isExcluded ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200' : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-300'}`}
                                                title={isExcluded ? 'Incluir en este producto' : 'Excluir de este producto'}
                                            >
                                                {isExcluded ? 'Incluir' : 'Excluir'}
                                            </button>
                                            <button onClick={() => removeOptionFromFolder(folder.name, opt)} className="text-red-400 hover:text-red-500 p-1">
                                                <span className="material-symbols-outlined text-[18px]">delete</span>
                                            </button>
                                        </div>
                                    );
                                })
                                : folder.options.map((option) => {
                                    const sel = selectedOptions.includes(option);
                                    return (
                                        <button
                                            key={option}
                                            onClick={() => toggleOption(option)}
                                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-left transition-colors ${sel
                                                ? 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400'
                                                : 'text-text-main dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                                                }`}
                                        >
                                            <span className={`material-symbols-outlined text-[18px] ${sel ? 'text-orange-500' : 'text-gray-300 dark:text-gray-600'}`}>
                                                {sel ? 'check_box' : 'check_box_outline_blank'}
                                            </span>
                                            <span className="flex-1">{option}</span>
                                        </button>
                                    );
                                })}

                            {/* Productos-modificadores de la carpeta */}
                            {isConfig
                                ? (folder.products || []).map((p) => (
                                    <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
                                        <span className="material-symbols-outlined text-[16px] text-emerald-500">sell</span>
                                        <span className="flex-1 text-sm font-medium text-text-main dark:text-white truncate">{p.name}</span>
                                        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 shrink-0">${formatCurrency(priceOf(p.id))}</span>
                                        <button onClick={() => removeProductFromFolder(folder.name, p.id)} className="text-red-400 hover:text-red-500 p-1">
                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                        </button>
                                    </div>
                                ))
                                : (folder.products || []).map((p) => {
                                    const sel = selectedModifiers.some(m => m.id === p.id);
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => toggleModifierProduct(p)}
                                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-left transition-colors ${sel
                                                ? 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400'
                                                : 'text-text-main dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                                                }`}
                                        >
                                            <span className={`material-symbols-outlined text-[18px] ${sel ? 'text-orange-500' : 'text-gray-300 dark:text-gray-600'}`}>
                                                {sel ? 'check_box' : 'check_box_outline_blank'}
                                            </span>
                                            <span className="flex-1">{p.name}</span>
                                            <span className="text-xs font-bold shrink-0">+${formatCurrency(priceOf(p.id))}</span>
                                        </button>
                                    );
                                })}

                            {isConfig && folder.options.length === 0 && (folder.products || []).length === 0 && <p className="text-xs text-text-secondary italic px-2 py-1">Carpeta vacía.</p>}
                        </div>
                    );

                    // ── Agregar etiqueta + Agregar producto (fijo abajo, solo config) ──
                    const productQuery = (folderProductQuery[folder.name] || '').trim().toLowerCase();
                    const productMatches = productQuery.length >= 1
                        ? allProducts
                            .filter(p => p.id !== product.id && p.name.toLowerCase().includes(productQuery) && !(folder.products || []).some(fp => fp.id === p.id))
                            .slice(0, 8)
                        : [];
                    const addBar = isConfig ? (
                        <div className="shrink-0 border-t border-gray-100 dark:border-gray-800">
                            {/* Agregar etiqueta */}
                            <div className="flex gap-2 p-1.5">
                                <input
                                    type="text"
                                    value={folderInputs[folder.name] || ''}
                                    onChange={(e) => setFolderInputs(prev => ({ ...prev, [folder.name]: e.target.value }))}
                                    placeholder="Agregar etiqueta..."
                                    className="flex-1 bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                    onKeyDown={(e) => e.key === 'Enter' && addOptionToFolder(folder.name)}
                                />
                                <button onClick={() => addOptionToFolder(folder.name)} className="bg-gray-200 dark:bg-gray-700 text-text-main dark:text-white px-3 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-bold text-sm">
                                    <span className="material-symbols-outlined">add</span>
                                </button>
                            </div>
                            {/* Agregar producto (busca en el catálogo en vivo) */}
                            <div className="px-1.5 pb-1.5">
                                <input
                                    type="text"
                                    value={folderProductQuery[folder.name] || ''}
                                    onChange={(e) => setFolderProductQuery(prev => ({ ...prev, [folder.name]: e.target.value }))}
                                    placeholder="Agregar producto..."
                                    className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                />
                                {productQuery.length >= 1 && (
                                    <div className="mt-1 max-h-40 overflow-y-auto custom-scrollbar rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                                        {productMatches.length === 0 ? (
                                            <p className="text-xs text-gray-400 italic px-3 py-2">Sin coincidencias</p>
                                        ) : productMatches.map(p => (
                                            <button
                                                key={p.id}
                                                onClick={() => addProductToFolder(folder.name, { id: p.id, name: p.name })}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-50 dark:border-gray-800 last:border-0"
                                            >
                                                <span className="material-symbols-outlined text-[16px] text-emerald-500">add_circle</span>
                                                <span className="flex-1 truncate text-text-main dark:text-white">{p.name}</span>
                                                <span className="text-xs font-bold text-gray-500 dark:text-gray-400">${formatCurrency(p.price)}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : null;

                    // ── Móvil: bottom sheet a casi pantalla completa ──
                    if (isMobile) {
                        return (
                            <>
                                <div
                                    className={`fixed inset-0 z-[79] bg-black/40 ${!sheetDragging ? 'transition-opacity duration-250' : ''} ${sheetOffset === 0 && !sheetClosing ? 'animate-[fadeIn_0.15s_ease-out]' : ''}`}
                                    style={{ opacity: sheetClosing ? 0 : Math.max(0, 1 - sheetOffset / 400) }}
                                    role="button" tabIndex={-1} aria-label="Cerrar"
                                    onClick={closeSheetMobile}
                                />
                                <div
                                    ref={folderPopoverRef}
                                    className={`fixed left-0 right-0 bottom-0 z-[80] bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl flex flex-col max-h-[88vh] ${!sheetDragging ? 'transition-transform duration-250 ease-out' : ''} ${sheetOffset === 0 && !sheetDragging && !sheetClosing ? 'animate-[slideInUp_0.25s_ease-out]' : ''}`}
                                    style={{ transform: `translateY(${sheetClosing ? '100%' : sheetOffset + 'px'})`, touchAction: 'pan-y' }}
                                    onTouchStart={(e) => { sheetStartY.current = e.touches[0].clientY; }}
                                    onTouchEnd={() => {
                                        sheetStartY.current = null;
                                        if (sheetDraggingRef.current) {
                                            sheetDraggingRef.current = false;
                                            setSheetDragging(false);
                                            if (sheetOffsetRef.current > 80) closeSheetMobile();
                                            else { sheetOffsetRef.current = 0; setSheetOffset(0); }
                                        }
                                    }}
                                >
                                    <div className="flex justify-center pt-2 pb-1 shrink-0"><span className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-700" /></div>
                                    {header}
                                    {list}
                                    {addBar}
                                </div>
                            </>
                        );
                    }

                    // ── Desktop: flyout LATERAL al chip, para aprovechar casi toda la altura ──
                    const margin = 12;
                    const width = isConfig ? 260 : 220;
                    // Horizontal: a la derecha del chip; si no cabe, a la izquierda.
                    let left = folderAnchor.right + 8;
                    if (left + width > window.innerWidth - 8) left = folderAnchor.left - width - 8;
                    left = Math.max(8, left);
                    // Vertical: centrar junto al chip usando casi toda la altura disponible.
                    const avail = window.innerHeight - 2 * margin;
                    const rowH = isConfig ? 42 : 40;
                    const extras = isConfig ? 104 : 0; // header + barra "Agregar"
                    const estH = Math.min(avail, folder.options.length * rowH + extras + 12);
                    let top = (folderAnchor.top + folderAnchor.height / 2) - estH / 2;
                    top = Math.max(margin, Math.min(top, window.innerHeight - margin - estH));
                    const maxHeight = window.innerHeight - top - margin;
                    return (
                        <div
                            ref={folderPopoverRef}
                            style={{ position: 'fixed', top, left, width, maxHeight }}
                            className="z-[80] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-[fadeIn_0.12s_ease-out]"
                        >
                            {header}
                            {list}
                            {addBar}
                        </div>
                    );
                })(),
                document.body
            )}
        </div>
    );
};
