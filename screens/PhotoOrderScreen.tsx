import React, { useState, useRef, useMemo, useEffect, lazy, Suspense } from 'react';
import { Product, CartItem } from '../types';
import { usePhotoOrder, MatchedItem, RawOCRItem } from '../hooks/usePhotoOrder';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { MobileScannerItemModal } from '../components/MobileScannerItemModal';
import { DocumentCropper } from '../components/DocumentCropper';
import { PriceInputModal } from '../components/PriceInputModal';
import { expandProductsForPOS } from '../lib/catalogExpansion';

const BarcodeScanner = lazy(() => import('../components/BarcodeScanner').then(m => ({ default: m.BarcodeScanner })));

const isWeightUnit = (unit?: string) => !!unit && unit !== 'Unidad' && unit !== 'Und' && unit !== 'Serv';

const UNIT_LABELS: Record<string, string> = {
    'Kilogramos': 'Kg', 'Libras': 'Lb', 'Gramos': 'g', 'Onzas': 'Oz',
    'Litros': 'Lt', 'Mililitros': 'mL', 'Galones': 'Gal',
    'Metros': 'm', 'Centímetros': 'cm', 'Pulgadas': 'in',
    'Arrobas': '@', 'Toneladas': 'Ton',
};
const getUnitLabel = (unit?: string) => (unit && UNIT_LABELS[unit]) || unit || 'Und';

const abbreviateUnit = (unit?: string): string => {
    if (!unit) return 'ud';
    const u = unit.toLowerCase().trim();
    if (u.includes('libra')) return 'lb';
    if (u.includes('kilo')) return 'kg';
    if (u.includes('gramo')) return 'g';
    if (u.includes('litro')) return 'lt';
    if (u.includes('onza')) return 'oz';
    if (u.includes('unidad')) return 'ud';
    if (u.includes('metro')) return 'm';
    if (u.includes('paquete')) return 'paq';
    if (u.includes('docena')) return 'doc';
    return u.length > 3 ? u.slice(0, 3) : u;
};

const formatQty = (qty: number): string => {
    const rounded = Math.round(qty * 100) / 100;
    return rounded.toString().replace('.', ',');
};

const formatPrice = (price: number): string => {
    return Math.round(price).toLocaleString('es-CO');
};

interface PhotoOrderScreenProps {
    products: Product[];
    onAddItems: (items: { product: Product; quantity: number; discount?: number; discountPercent?: number }[]) => Promise<void> | void;
    onClose: () => void;
    hideHeader?: boolean;
}

type ViewState = 'capture' | 'results';

export const PhotoOrderScreen: React.FC<PhotoOrderScreenProps> = ({
    products,
    onAddItems,
    onClose,
    hideHeader = false
}) => {
    const { profile } = useAuth();
    const posProducts = useMemo(() => expandProductsForPOS(products), [products]);
    const { isProcessing, error, processImage, matchProducts, setError } = usePhotoOrder();
    const [viewState, setViewState] = useState<ViewState>('capture');
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [matched, setMatched] = useState<MatchedItem[]>([]);
    const [unmatched, setUnmatched] = useState<RawOCRItem[]>([]);
    const [unmatchedAssignments, setUnmatchedAssignments] = useState<Record<number, Product | null>>({});
    const [searchQueries, setSearchQueries] = useState<Record<number, string>>({});
    const [savedNicknames, setSavedNicknames] = useState<Set<number>>(new Set());
    const [savingNickname, setSavingNickname] = useState<number | null>(null);
    const [showUnmatchedWarning, setShowUnmatchedWarning] = useState(false);
    const { showToast } = useToast();

    const [scannerItemEditor, setScannerItemEditor] = useState<{ type: 'matched' | 'unmatched', index: number, item: CartItem } | null>(null);
    const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const [expandedMatchedIndex, setExpandedMatchedIndex] = useState<number | null>(null);
    const [expandedUnmatchedIndex, setExpandedUnmatchedIndex] = useState<number | null>(null);
    const [unmatchedCollapsed, setUnmatchedCollapsed] = useState(false);

    // Estado para agregar productos manualmente (búsqueda + barcode scanner)
    const [manualSearch, setManualSearch] = useState('');
    const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
    const [priceInputProduct, setPriceInputProduct] = useState<Product | null>(null);
    const [showConfirmReset, setShowConfirmReset] = useState(false);
    const manualSearchRef = useRef<HTMLInputElement>(null);

    const [showPCWebcam, setShowPCWebcam] = useState(false);
    const [pcStream, setPcStream] = useState<MediaStream | null>(null);
    const [isCapturingWebcam, setIsCapturingWebcam] = useState(false);
    const pcVideoRef = useRef<HTMLVideoElement>(null);

    const cameraInputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const matchedRef = useRef(matched);
    const unmatchedRef = useRef(unmatched);
    matchedRef.current = matched;
    unmatchedRef.current = unmatched;

    useEffect(() => {
        if (pcVideoRef.current && pcStream) {
            pcVideoRef.current.srcObject = pcStream;
        }
    }, [pcStream, showPCWebcam]);

    useEffect(() => {
        return () => {
            if (pcStream) {
                pcStream.getTracks().forEach(t => t.stop());
            }
        };
    }, [pcStream]);

    const blobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result as string;
                reader.onload = null;
                reader.onerror = null;
                resolve(dataUrl.split(',')[1]);
            };
            reader.onerror = () => {
                reader.onload = null;
                reader.onerror = null;
                reject(new Error('No se pudo leer el archivo'));
            };
            reader.readAsDataURL(blob);
        });
    };

    const compressImage = async (file: File, maxDim = 1024, quality = 0.6): Promise<{ base64: string; mimeType: string }> => {
        const isHeic = file.type === 'image/heic' || file.type === 'image/heif' ||
            file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');

        if (isHeic) {
            const base64 = await blobToBase64(file);
            return { base64, mimeType: 'image/heic' };
        }

        const bitmap = await createImageBitmap(file);
        let w = bitmap.width;
        let h = bitmap.height;

        if (w > maxDim || h > maxDim) {
            const scale = maxDim / Math.max(w, h);
            w = Math.round(w * scale);
            h = Math.round(h * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { bitmap.close(); throw new Error('Canvas no soportado'); }
        ctx.drawImage(bitmap, 0, 0, w, h);
        bitmap.close();

        const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
                (b) => b ? resolve(b) : reject(new Error('No se pudo comprimir')),
                'image/jpeg',
                quality
            );
        });

        canvas.width = 0;
        canvas.height = 0;

        const base64 = await blobToBase64(blob);
        return { base64, mimeType: 'image/jpeg' };
    };

    React.useEffect(() => {
        const handlePaste = (e: ClipboardEvent) => {
            if (e.clipboardData && e.clipboardData.items) {
                const items = e.clipboardData.items;
                for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                        const file = items[i].getAsFile();
                        if (file) {
                            e.preventDefault();
                            showCropPreview(file);
                            return;
                        }
                    }
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, []);

    // Patrón "mostrar primero, procesar después" (estilo Google Lens):
    // createObjectURL NO decodifica la imagen, solo crea un puntero al archivo,
    // así que es instantáneo. El navegador decodifica la foto en su propio hilo
    // y la pinta progresivamente, sin bloquear el hilo principal ni el render del
    // cropper. Todo el trabajo pesado (reducir tamaño) se difiere al momento de
    // confirmar el recorte, cuando el cropper ya está visible.
    const showCropPreview = (file: File) => {
        // Montaje SÍNCRONO: el cropper oscuro aparece en el mismo frame en que
        // se elige la foto, antes de tocar/decodificar la imagen.
        const url = URL.createObjectURL(file);
        setCropImageSrc(url);
    };

    const handleCropConfirm = (croppedBlob: Blob) => {
        // Reemplazar la imagen del cropper por la RECORTADA, para que durante el
        // análisis se vea exactamente lo que la IA procesa (no la parte sobrante).
        // El cropper se queda montado en modo "analizando" (sin salto a otra pantalla).
        const croppedUrl = URL.createObjectURL(croppedBlob);
        if (cropImageSrc) {
            URL.revokeObjectURL(cropImageSrc);
        }
        setCropImageSrc(croppedUrl);
        setIsAnalyzing(true);
        const file = new File([croppedBlob], 'cropped-scan.jpg', { type: croppedBlob.type || 'image/jpeg' });
        handleImageSelected(file);
    };

    const closeCropper = () => {
        if (cropImageSrc) {
            URL.revokeObjectURL(cropImageSrc);
        }
        setCropImageSrc(null);
        setIsAnalyzing(false);
    };

    const handleCropCancel = () => {
        // En modo analizando no se puede cancelar (no hay botón); esto solo aplica
        // al recorte. Igual reseteamos todo por consistencia.
        closeCropper();
    };

    const handlePasteFromClipboard = async () => {
        try {
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
                const imageType = item.types.find(type => type.startsWith('image/'));
                if (imageType) {
                    const blob = await item.getType(imageType);
                    const file = new File([blob], 'pasted-image.png', { type: imageType });
                    showCropPreview(file);
                    return;
                }
            }
            showToast('No se encontró ninguna imagen en el portapapeles', 'info');
        } catch (err) {
            console.error('Failed to paste:', err);
            showToast('No se pudo acceder al portapapeles', 'error');
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                showCropPreview(file);
            } else {
                showToast('Por favor selecciona una imagen válida', 'warning');
            }
        }
    };

    const handleImageSelected = async (file: File) => {
        setError(null);
        if (imagePreview) {
            URL.revokeObjectURL(imagePreview);
        }
        const previewUrl = URL.createObjectURL(file);
        setImagePreview(previewUrl);
        // El estado de "analizando" vive dentro del cropper (isAnalyzing), que ya
        // está montado. No cambiamos a una pantalla de processing separada.

        try {
            const { base64, mimeType } = await compressImage(file);
            const catalogSummary = posProducts.map(p => ({
                id: p.id,
                name: p.name,
                unit: p.unit,
                nicknames: p.nicknames || []
            }));
            const rawItems = await processImage(base64, mimeType, catalogSummary);

            if (rawItems.length === 0) {
                closeCropper();
                setViewState('capture');
                return;
            }

            if (posProducts.length === 0) {
                setError('Los productos aún no se han cargado. Espera un momento e intenta de nuevo.');
                closeCropper();
                setViewState('capture');
                return;
            }

            const currentTotal = matchedRef.current.length + unmatchedRef.current.length;
            const result = matchProducts(rawItems, posProducts, currentTotal);
            setMatched(prev => [...prev, ...result.matched]);
            setUnmatched(prev => [...prev, ...result.unmatched]);
            // IA lista: cerramos el cropper y pasamos directo a resultados.
            closeCropper();
            setViewState('results');
        } catch (err: any) {
            console.error('[PhotoOrder] Error processing image:', err);
            setError(err.message || 'Error inesperado al procesar la imagen.');
            closeCropper();
            setViewState('capture');
        }
    };

    const isMobileDevice = (): boolean => {
        if (typeof window === 'undefined') return false;
        return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
            (navigator.maxTouchPoints > 1 && 'ontouchstart' in window);
    };

    const handleClosePCWebcam = () => {
        if (pcStream) {
            pcStream.getTracks().forEach(t => t.stop());
            setPcStream(null);
        }
        setShowPCWebcam(false);
        setIsCapturingWebcam(false);
    };

    const handleCapturePCWebcam = () => {
        if (!pcVideoRef.current) return;
        const video = pcVideoRef.current;
        if (!video.videoWidth || !video.videoHeight) return;

        setIsCapturingWebcam(true);
        try {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                setIsCapturingWebcam(false);
                return;
            }

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(blob => {
                if (!blob) {
                    setIsCapturingWebcam(false);
                    return;
                }
                const file = new File([blob], 'webcam-capture.jpg', { type: 'image/jpeg' });
                showCropPreview(file);
                handleClosePCWebcam();
            }, 'image/jpeg', 0.95);
        } catch (err) {
            console.error('[PhotoOrder] Error capturando webcam:', err);
            setIsCapturingWebcam(false);
        }
    };

    const handleOpenCamera = async () => {
        if (isMobileDevice()) {
            cameraInputRef.current?.click();
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            });
            setPcStream(stream);
            setShowPCWebcam(true);
        } catch (err) {
            console.warn('[PhotoOrder] No se pudo abrir la webcam en PC:', err);
            showToast('No se detectó cámara web. Selecciona un archivo.', 'info');
            fileInputRef.current?.click();
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        const capturedFile = new File([file], file.name, { type: file.type, lastModified: file.lastModified });
        e.target.value = '';
        showCropPreview(capturedFile);
    };

    const handleToggleItem = (index: number) => {
        setMatched(prev => prev.map((item, i) =>
            i === index ? { ...item, selected: !item.selected } : item
        ));
    };

    const handleRemoveMatched = (index: number) => {
        setMatched(prev => prev.filter((_, i) => i !== index));
    };

    const handleQuantityChange = (index: number, delta: number) => {
        setMatched(prev => prev.map((item, i) => {
            if (i !== index) return item;
            const newQty = Math.max(0.5, Math.round((item.quantity + delta) * 100) / 100);
            return { ...item, quantity: newQty };
        }));
    };

    const handleUnmatchedQuantityChange = (index: number, delta: number) => {
        setUnmatched(prev => prev.map((item, i) => {
            if (i !== index) return item;
            const newQty = Math.max(0.5, Math.round((item.quantity + delta) * 100) / 100);
            return { ...item, quantity: newQty };
        }));
    };

    const handleSetCustomQuantity = (newQty: number, discountVal: number, isPct: boolean) => {
        if (!scannerItemEditor) return;
        const { type, index } = scannerItemEditor;
        const finalQty = Math.max(0.5, newQty);
        const discount = !isPct && discountVal > 0 ? discountVal : undefined;
        const discountPercent = isPct && discountVal > 0 ? discountVal : undefined;

        if (type === 'matched') {
            setMatched(prev => prev.map((item, i) => {
                if (i !== index) return item;
                return { ...item, quantity: finalQty, discount, discountPercent };
            }));
        } else {
            setUnmatched(prev => prev.map((item, i) => {
                if (i !== index) return item;
                return { ...item, quantity: finalQty, discount, discountPercent };
            }));
        }
        setScannerItemEditor(null);
    };

    const handleAssignProduct = (unmatchedIndex: number, product: Product) => {
        setUnmatchedAssignments(prev => ({ ...prev, [unmatchedIndex]: product }));
        setSearchQueries(prev => ({ ...prev, [unmatchedIndex]: '' }));
        setExpandedUnmatchedIndex(unmatchedIndex);
    };

    const handleSaveNickname = async (uIndex: number, product: Product, ocrName: string) => {
        const trimmed = ocrName.trim();
        if (!trimmed) return;
        const currentNicknames: string[] = product.nicknames || [];
        if (currentNicknames.map(n => n.toLowerCase()).includes(trimmed.toLowerCase())) {
            showToast(`"${trimmed}" ya es apodo de este producto`, 'warning');
            return;
        }
        setSavingNickname(uIndex);
        try {
            const targetProductId = (product as any).is_secondary && (product as any).parent_product_id
                ? (product as any).parent_product_id
                : product.id;

            const { data: existing } = await supabase
                .from('products')
                .select('id, name')
                .eq('business_id', profile?.business_id)
                .contains('nicknames', [trimmed])
                .neq('id', targetProductId)
                .limit(1);
            if (existing && existing.length > 0) {
                showToast(`El apodo "${trimmed}" ya existe en "${existing[0].name}"`, 'warning');
                return;
            }

            if ((product as any).is_secondary && (product as any).parent_product_id) {
                // Es una presentación de venta: actualizar sale_presentations del producto padre
                const { data: parentProd, error: fetchErr } = await supabase
                    .from('products')
                    .select('sale_presentations')
                    .eq('id', targetProductId)
                    .single();

                if (fetchErr) throw fetchErr;

                const presList: any[] = parentProd?.sale_presentations || [];
                const presKey = product.id.split('__pres_')[1];
                const updatedList = presList.map(pres => {
                    const matchesPres = pres.id === presKey || pres.unit_name === (product as any).presentation_unit;
                    if (matchesPres) {
                        const existingNicks: string[] = pres.nicknames || [];
                        if (!existingNicks.map(n => n.toLowerCase()).includes(trimmed.toLowerCase())) {
                            return { ...pres, nicknames: [...existingNicks, trimmed] };
                        }
                    }
                    return pres;
                });

                const { error: updateErr } = await supabase
                    .from('products')
                    .update({ sale_presentations: updatedList })
                    .eq('id', targetProductId);

                if (updateErr) throw updateErr;
            } else {
                // Es un producto base tradicional
                const { error } = await supabase
                    .from('products')
                    .update({ nicknames: [...currentNicknames, trimmed] })
                    .eq('id', product.id);
                if (error) throw error;
            }

            // Notificar al sistema para refrescar inventario/catálogo
            window.dispatchEvent(new CustomEvent('inventory-updated'));
            setSavedNicknames(prev => new Set(prev).add(uIndex));
            showToast(`Apodo "${trimmed}" guardado en ${product.name}`, 'success');
        } catch (err: any) {
            showToast(`Error al guardar apodo: ${err.message}`, 'error');
        } finally {
            setSavingNickname(null);
        }
    };

    const handleRemoveUnmatched = (index: number) => {
        setUnmatched(prev => prev.filter((_, i) => i !== index));
        setUnmatchedAssignments(prev => {
            const copy = { ...prev };
            delete copy[index];
            return copy;
        });
    };

    // ── Agregar producto manualmente (búsqueda o barcode) ──
    const addProductToList = (product: Product, quantity: number = 1) => {
        const nextScanOrder = Math.max(
            ...matched.map(m => m.scanOrder),
            ...unmatched.map(u => u.scanOrder),
            0
        ) + 1;
        setMatched(prev => [...prev, {
            product,
            quantity,
            ocrName: product.name,
            confidence: 'exact' as const,
            selected: true,
            scanOrder: nextScanOrder,
            isManual: true,
        }]);
        setManualSearch('');
    };

    const handleAddManualProduct = (product: Product) => {
        if (isWeightUnit(product.unit)) {
            setPriceInputProduct(product);
            setManualSearch('');
        } else {
            addProductToList(product);
        }
    };

    const handleBarcodeScan = (barcode: string) => {
        let found = posProducts.find(p => p.barcode === barcode);
        if (!found) {
            const clean = barcode.replace(/^0+/, '');
            found = posProducts.find(p => p.barcode && p.barcode.replace(/^0+/, '') === clean);
        }
        if (found) {
            setShowBarcodeScanner(false);
            if (isWeightUnit(found.unit)) {
                setPriceInputProduct(found);
            } else {
                addProductToList(found);
            }
        } else {
            showToast('Producto no encontrado en catálogo', 'error');
        }
    };

    const manualSearchResults = useMemo(() => {
        const q = manualSearch.trim().toLowerCase();
        if (!q) return [];
        return posProducts.filter(p =>
            p.name.toLowerCase().includes(q) ||
            (p.nicknames || []).some((n: string) => n.toLowerCase().includes(q)) ||
            (p.barcode && p.barcode.includes(q))
        ).slice(0, 5);
    }, [posProducts, manualSearch]);

    const handleAddToCart = () => {
        if (isProcessingPayment) return;
        // Verificar si hay productos no reconocidos sin asignar
        const unassignedItems = unmatched.filter((_, index) => !unmatchedAssignments[index]);
        if (unassignedItems.length > 0) {
            setShowUnmatchedWarning(true);
            return;
        }
        proceedToPayment();
    };

    const proceedToPayment = async () => {
        if (isProcessingPayment) return;
        setShowUnmatchedWarning(false);
        const items: { product: Product; quantity: number; discount?: number; discountPercent?: number }[] = [];

        matched.forEach(item => {
            if (item.selected) {
                items.push({
                    product: item.product,
                    quantity: item.quantity,
                    discount: item.discount,
                    discountPercent: item.discountPercent,
                });
            }
        });

        unmatched.forEach((item, index) => {
            const assigned = unmatchedAssignments[index];
            if (assigned) {
                items.push({
                    product: assigned,
                    quantity: item.quantity,
                    discount: item.discount,
                    discountPercent: item.discountPercent,
                });
            }
        });

        if (items.length > 0) {
            setIsProcessingPayment(true);
            try {
                sessionStorage.setItem('bistro_payment_nav_start', String(performance.now()));
                // Dar tiempo al navegador para pintar el spinner y actualizar el botón antes de la transición
                await new Promise(resolve => setTimeout(resolve, 80));
                await onAddItems(items);
            } catch (err) {
                console.error('[PhotoOrder] Error procesando pago:', err);
            } finally {
                // Mantener el spinner visible durante el montaje y animación de la pantalla de pago (500ms)
                setTimeout(() => {
                    setIsProcessingPayment(false);
                }, 500);
            }
        }
    };

    const handleScanAnother = () => {
        if (imagePreview) {
            URL.revokeObjectURL(imagePreview);
        }
        setImagePreview(null);
        setViewState('capture');
    };

    const handleReset = () => {
        setMatched([]);
        setUnmatched([]);
        setUnmatchedAssignments({});
        setSearchQueries({});
        if (imagePreview) {
            URL.revokeObjectURL(imagePreview);
        }
        setImagePreview(null);
        setViewState('capture');
        setError(null);
        setIsProcessingPayment(false);
    };

    const totalItems = matched.filter(m => m.selected).length +
        Object.values(unmatchedAssignments).filter(Boolean).length;

    const totalPrice = useMemo(() => {
        let grossSub = 0;
        let discTotal = 0;

        matched.filter(m => m.selected).forEach(item => {
            const itemTotal = Math.round(item.product.price * item.quantity);
            let itemDiscount = 0;
            if (item.discount) {
                itemDiscount = item.discount;
            } else if (item.discountPercent) {
                itemDiscount = (itemTotal * item.discountPercent) / 100;
            }
            grossSub += itemTotal;
            discTotal += itemDiscount;
        });

        unmatched.forEach((uItem, index) => {
            const assignedProduct = unmatchedAssignments[index];
            if (assignedProduct) {
                const itemTotal = Math.round(assignedProduct.price * uItem.quantity);
                let itemDiscount = 0;
                if (uItem.discount) {
                    itemDiscount = uItem.discount;
                } else if (uItem.discountPercent) {
                    itemDiscount = (itemTotal * uItem.discountPercent) / 100;
                }
                grossSub += itemTotal;
                discTotal += itemDiscount;
            }
        });

        // Ajuste al peso legal (redondeo a múltiplo de $50 más cercano, idéntico a cartTotal en App.tsx / PaymentScreen)
        return Math.round(Math.max(0, grossSub - discTotal) / 50) * 50;
    }, [matched, unmatched, unmatchedAssignments]);

    const getCandidateProducts = (rawQuery: string) => {
        let clean = (rawQuery || '').trim().toLowerCase();
        // Quitar cantidad inicial como "2 ", "2x ", "2 und ", etc.
        clean = clean.replace(/^\d+([.,]\d+)?\s*(x|und|unidades|de)?\s*/i, '').trim();
        if (!clean || clean.length < 2) return [];
        const stopwords = new Set(['de', 'el', 'la', 'los', 'las', 'un', 'una', 'con', 'sin', 'por', 'del', 'al', 'en', 'para', 'y']);
        const tokens = clean.split(/\s+/).filter(w => w.length >= 2 && !stopwords.has(w));

        if (tokens.length === 0) return [];

        return posProducts.filter(p => {
            const pName = p.name.toLowerCase();
            const nicks = (p.nicknames || []).map((n: string) => n.toLowerCase());

            if (pName.includes(clean) || nicks.some(n => n.includes(clean))) return true;
            return tokens.every(t => pName.includes(t) || nicks.some(n => n.includes(t)));
        });
    };

    const filteredProducts = (query: string) => {
        if (!query.trim()) return [];
        const q = query.toLowerCase();
        return posProducts.filter(p =>
            p.name.toLowerCase().includes(q) ||
            (p.nicknames || []).some((n: string) => n.toLowerCase().includes(q))
        ).slice(0, 5);
    };

    return (
        <div className="flex-1 h-full flex flex-col bg-[#f8fafc] dark:bg-[#0B1120] text-slate-800 dark:text-slate-200 font-display overflow-hidden">
            <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
            />
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
            />
            {/* Header - hidden when rendered as tab inside SellScreen */}
            {!hideHeader && (
                <div className="flex items-center h-14 px-3 sm:px-4 bg-white dark:bg-[#0f172a] border-b border-slate-200 dark:border-slate-800 shrink-0 gap-2 relative z-40">
                    <button
                        onClick={onClose}
                        className="size-10 shrink-0 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        aria-label="Cerrar"
                        tabIndex={0}
                    >
                        <span className="material-symbols-outlined text-[22px]">arrow_back</span>
                    </button>

                    {viewState !== 'results' ? null : (
                        <>
                            {/* Buscador de productos integrado en el Header */}
                            <div className="relative flex-1 min-w-0">
                                <span className="material-symbols-outlined text-[18px] text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2">search</span>
                                <input
                                    ref={manualSearchRef}
                                    type="text"
                                    placeholder="Agregar producto..."
                                    value={manualSearch}
                                    onChange={(e) => setManualSearch(e.target.value)}
                                    className="w-full h-9 pl-8 pr-7 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-amber-400 focus:border-transparent outline-none transition-all"
                                />
                                {manualSearch && (
                                    <button
                                        onClick={() => setManualSearch('')}
                                        className="absolute right-1.5 top-1/2 -translate-y-1/2 size-5 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600"
                                        aria-label="Limpiar búsqueda"
                                        tabIndex={0}
                                    >
                                        <span className="material-symbols-outlined text-[14px]">close</span>
                                    </button>
                                )}
                            </div>

                            {/* Botón escáner de código de barras */}
                            <button
                                onClick={() => setShowBarcodeScanner(true)}
                                className="size-9 shrink-0 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-750 active:scale-95 transition-all"
                                aria-label="Escanear código de barras"
                                title="Escanear código de barras"
                                tabIndex={0}
                            >
                                <span className="material-symbols-outlined text-[19px] text-slate-600 dark:text-slate-300">barcode_scanner</span>
                            </button>

                            {/* Botón Limpiar todo (icono compacto) */}
                            <button
                                onClick={() => setShowConfirmReset(true)}
                                className="size-9 shrink-0 rounded-lg flex items-center justify-center text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 active:scale-95 transition-all"
                                aria-label="Limpiar todo"
                                title="Limpiar lista escaneada"
                                tabIndex={0}
                            >
                                <span className="material-symbols-outlined text-[20px]">delete_sweep</span>
                            </button>

                            {/* Dropdown de sugerencias de ancho amplio flotante desde el Header */}
                            {manualSearchResults.length > 0 && (
                                <div className="absolute top-full left-3 right-3 mt-1 bg-white dark:bg-slate-800 border-2 border-amber-300 dark:border-amber-600 rounded-2xl shadow-2xl z-50 overflow-hidden max-h-64 overflow-y-auto">
                                    {manualSearchResults.map(product => (
                                        <button
                                            key={product.id}
                                            onClick={() => handleAddManualProduct(product)}
                                            className="w-full text-left px-3.5 py-3 hover:bg-amber-50/50 dark:hover:bg-slate-750 flex items-start gap-2.5 transition-colors border-b border-slate-100 dark:border-slate-700/50 last:border-0"
                                            tabIndex={0}
                                        >
                                            <span className="material-symbols-outlined text-[20px] text-amber-500 mt-0.5 shrink-0">add_circle</span>
                                            <div className="flex-1 min-w-0">
                                                <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 line-clamp-2 leading-snug">
                                                    {product.name}
                                                </span>
                                                {product.unit && (
                                                    <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                                                        {product.unit}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-sm font-bold text-slate-900 dark:text-white shrink-0 ml-2 mt-0.5">
                                                ${formatPrice(product.price)}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {manualSearch.trim() && manualSearchResults.length === 0 && (
                                <div className="absolute top-full left-3 right-3 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 p-3 text-center">
                                    <p className="text-xs sm:text-sm text-slate-400">Sin resultados</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto min-h-0">
                {/* CAPTURE STATE - FULL HEIGHT MOBILE MODERN LAYOUT */}
                {viewState === 'capture' && (
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`min-h-full flex flex-col items-center justify-center max-w-md mx-auto w-full px-5 py-4 sm:py-6 transition-all duration-200 ${
                            isDragging ? 'bg-amber-50/20 dark:bg-amber-950/20 ring-4 ring-amber-400/20 ring-inset' : ''
                        }`}
                    >
                        {/* Bloque Unificado: Ilustración + Textos + Botones (centrado entre header y navbar) */}
                        <div className="w-full flex flex-col items-center text-center my-auto">
                            {/* Ilustración de la lista de ventas */}
                            <div className="relative mb-5 flex items-center justify-center">
                                {/* Halo ambiental suave */}
                                <div className="absolute -inset-4 bg-amber-400/20 dark:bg-amber-400/10 rounded-full blur-2xl pointer-events-none" />

                                {/* Marco del escáner con esquinas de retícula */}
                                <div className="relative p-3 rounded-2xl bg-amber-50/50 dark:bg-slate-800/60 border border-amber-200/60 dark:border-slate-700/60 shadow-sm">
                                    {/* Esquinas / Brackets del visor de escaneo */}
                                    <div className="absolute top-1.5 left-1.5 size-3.5 border-t-2 border-l-2 border-amber-500 rounded-tl pointer-events-none z-20" />
                                    <div className="absolute top-1.5 right-1.5 size-3.5 border-t-2 border-r-2 border-amber-500 rounded-tr pointer-events-none z-20" />
                                    <div className="absolute bottom-1.5 left-1.5 size-3.5 border-b-2 border-l-2 border-amber-500 rounded-bl pointer-events-none z-20" />
                                    <div className="absolute bottom-1.5 right-1.5 size-3.5 border-b-2 border-r-2 border-amber-500 rounded-br pointer-events-none z-20" />

                                    {/* Hoja de la Lista de Venta */}
                                    <div className="relative w-36 sm:w-40 h-44 sm:h-48 bg-white dark:bg-slate-800 rounded-xl p-3.5 border border-slate-200/90 dark:border-slate-700 shadow-inner flex flex-col justify-between overflow-hidden">
                                        {/* Cabecera de la lista */}
                                        <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-700/60">
                                            <span className="material-symbols-outlined text-amber-500 text-[16px]">receipt_long</span>
                                            <div className="h-2 w-14 bg-slate-200 dark:bg-slate-600 rounded-full" />
                                            <div className="h-1.5 w-4 bg-amber-400/70 rounded-full ml-auto" />
                                        </div>

                                        {/* Renglones de productos simulados */}
                                        <div className="space-y-2.5 py-1">
                                            <div className="flex items-center gap-2">
                                                <span className="size-1.5 rounded-full bg-emerald-500/80 shrink-0" />
                                                <div className="h-1.5 w-16 bg-slate-200 dark:bg-slate-700 rounded-full" />
                                                <div className="h-1.5 w-5 bg-slate-300 dark:bg-slate-600 rounded-full ml-auto" />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="size-1.5 rounded-full bg-amber-500/80 shrink-0" />
                                                <div className="h-1.5 w-20 bg-slate-200 dark:bg-slate-700 rounded-full" />
                                                <div className="h-1.5 w-6 bg-slate-300 dark:bg-slate-600 rounded-full ml-auto" />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="size-1.5 rounded-full bg-sky-500/80 shrink-0" />
                                                <div className="h-1.5 w-12 bg-slate-200 dark:bg-slate-700 rounded-full" />
                                                <div className="h-1.5 w-4 bg-slate-300 dark:bg-slate-600 rounded-full ml-auto" />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="size-1.5 rounded-full bg-purple-500/80 shrink-0" />
                                                <div className="h-1.5 w-14 bg-slate-200 dark:bg-slate-700 rounded-full" />
                                                <div className="h-1.5 w-5 bg-slate-300 dark:bg-slate-600 rounded-full ml-auto" />
                                            </div>
                                        </div>

                                        {/* Total al pie de la lista */}
                                        <div className="pt-2 border-t border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-between">
                                            <div className="h-2 w-8 bg-slate-300 dark:bg-slate-600 rounded-full" />
                                            <div className="h-2.5 w-10 bg-amber-500/90 dark:bg-amber-400 rounded-full" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Badge IA */}
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-500/10 border border-amber-200/60 dark:border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-semibold mb-2">
                                <span className="material-symbols-outlined text-[15px]">auto_awesome</span>
                                <span>Reconocimiento IA</span>
                            </div>

                            {/* Título y subtítulo */}
                            <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight mb-1.5">
                                Escanear Lista de Ventas
                            </h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed mb-6">
                                Convierte tus notas y listas en órdenes al instante
                            </p>

                            {/* Mensaje de error si ocurre */}
                            {error && (
                                <div className="w-full mb-4 bg-red-50 dark:bg-red-900/15 border border-red-200 dark:border-red-800/40 rounded-2xl p-3.5 text-xs sm:text-sm text-red-600 dark:text-red-400 flex items-center gap-2.5 text-left">
                                    <span className="material-symbols-outlined text-[20px] shrink-0">error</span>
                                    <span className="flex-1">{error}</span>
                                </div>
                            )}

                            {/* Vista previa temporal si aplica */}
                            {imagePreview && (
                                <div className="w-full mb-4 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 max-h-48 bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
                                    <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" crossOrigin="anonymous"/>
                                </div>
                            )}

                            {/* Botones Agrandados Uno Sobre el Otro (directamente bajo el texto) */}
                            <div className="w-full flex flex-col gap-3">
                                <button
                                    onClick={handleOpenCamera}
                                    className="w-full h-14 rounded-2xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-base flex items-center justify-center gap-3 shadow-lg shadow-amber-400/25 active:scale-[0.98] transition-all"
                                    aria-label="Tomar foto con la cámara"
                                    tabIndex={0}
                                >
                                    <span className="material-symbols-outlined text-[24px]">photo_camera</span>
                                    <span>Tomar Foto</span>
                                </button>

                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full h-14 rounded-2xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-base flex items-center justify-center gap-3 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 active:scale-[0.98] transition-all shadow-sm"
                                    aria-label="Abrir galería"
                                    tabIndex={0}
                                >
                                    <span className="material-symbols-outlined text-[24px] text-slate-500 dark:text-slate-400">photo_library</span>
                                    <span>Galería</span>
                                </button>
                            </div>

                            {/* Enlace a productos si ya hay lista previa */}
                            {matched.length > 0 && (
                                <button
                                    onClick={() => setViewState('results')}
                                    className="mt-4 inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                                    tabIndex={0}
                                >
                                    <span>Ver {matched.length} productos escaneados</span>
                                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* RESULTS STATE */}
                {viewState === 'results' && (
                    <div className="p-4 pb-4 space-y-4 animate-slideInUpSubtle">
                        {/* Lista unificada ordenada por scanOrder */}
                        {(matched.length > 0 || unmatched.length > 0) && (
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="size-7 rounded-full bg-emerald-100 dark:bg-emerald-900/20 flex items-center justify-center">
                                            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[16px]">check</span>
                                        </span>
                                        <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
                                            Productos ({matched.length + unmatched.length})
                                        </h3>
                                    </div>
                                    {unmatched.filter((_, i) => !unmatchedAssignments[i]).length > 0 && (
                                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 font-semibold">
                                            {unmatched.filter((_, i) => !unmatchedAssignments[i]).length} sin reconocer
                                        </span>
                                    )}
                                </div>

                                <div className="space-y-1">
                                    {[...matched.map((item, index) => ({ type: 'matched' as const, item, index })),
                                    ...unmatched.map((item, index) => ({ type: 'unmatched' as const, item, index }))]
                                        .sort((a, b) => {
                                            const aManual = a.type === 'matched' && (a.item as MatchedItem).isManual ? 1 : 0;
                                            const bManual = b.type === 'matched' && (b.item as MatchedItem).isManual ? 1 : 0;
                                            if (aManual !== bManual) return bManual - aManual;
                                            if (aManual && bManual) return b.item.scanOrder - a.item.scanOrder;
                                            return a.item.scanOrder - b.item.scanOrder;
                                        })
                                        .map((entry, entryIndex) => {
                                            const cardAnimStyle = { animationDelay: `${Math.min(entryIndex * 35, 350)}ms` };
                                            if (entry.type === 'matched') {
                                                const item = entry.item as MatchedItem;
                                                const index = entry.index;
                                                const isExpanded = expandedMatchedIndex === index;
                                                const borderClass = item.isManual
                                                    ? 'border-2 border-emerald-500 dark:border-emerald-500 shadow-sm shadow-emerald-500/10'
                                                    : 'border-slate-200 dark:border-slate-700';
                                                return (
                                                    <div
                                                        key={`matched-${item.product.id}-${index}`}
                                                        className={`bg-white dark:bg-slate-800/80 rounded-lg border transition-all animate-cardEntry ${borderClass}`}
                                                        style={cardAnimStyle}
                                                    >
                                                        {/* Fila compacta */}
                                                        <button
                                                            onClick={() => setExpandedMatchedIndex(isExpanded ? null : index)}
                                                            className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                                                        >
                                                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300 w-10 shrink-0 text-center">
                                                                {formatQty(item.quantity)}<span className="text-[10px] font-medium text-slate-400 ml-0.5">{abbreviateUnit(item.product.unit)}</span>
                                                            </span>
                                                            <span className={`font-semibold text-[14px] text-slate-800 dark:text-slate-200 min-w-0 flex-1 leading-snug ${isExpanded ? '' : 'line-clamp-2'}`}>
                                                                {item.product.name}
                                                            </span>
                                                            {(() => {
                                                                const grossPrice = Math.round(item.product.price * item.quantity);
                                                                const discountAmt = item.discountPercent
                                                                    ? (grossPrice * item.discountPercent) / 100
                                                                    : (item.discount || 0);
                                                                const netPrice = Math.max(0, grossPrice - discountAmt);
                                                                const hasDiscount = discountAmt > 0;

                                                                return (
                                                                    <div className="flex flex-col items-end shrink-0">
                                                                        <span className="font-bold text-[14px] text-slate-700 dark:text-slate-200">
                                                                            ${formatPrice(netPrice)}
                                                                        </span>
                                                                        {hasDiscount && (
                                                                            <div className="flex items-center gap-1 -mt-0.5">
                                                                                <span className="text-[10px] text-slate-400 line-through">
                                                                                    ${formatPrice(grossPrice)}
                                                                                </span>
                                                                                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1 rounded">
                                                                                    {item.discountPercent ? `-${item.discountPercent}%` : `-$${formatPrice(discountAmt)}`}
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                            <span className={`material-symbols-outlined text-[18px] text-slate-400 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                                                expand_more
                                                            </span>
                                                        </button>

                                                        {/* Panel expandido */}
                                                        {isExpanded && (
                                                            <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-700/50 space-y-2">
                                                                <div className="flex items-center gap-2">
                                                                    <button
                                                                        onClick={() => handleRemoveMatched(index)}
                                                                        className="size-6 rounded-md border-2 border-red-300 dark:border-red-700 flex items-center justify-center shrink-0 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                                        aria-label="Eliminar producto"
                                                                        tabIndex={0}
                                                                    >
                                                                        <span className="material-symbols-outlined text-red-500 text-[14px]">delete</span>
                                                                    </button>
                                                                    <span className="text-xs text-red-500 font-medium">Eliminar</span>

                                                                    <div className="flex items-center gap-0.5 ml-auto shrink-0 bg-slate-50 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-100 dark:border-slate-700/50">
                                                                        <button
                                                                            onClick={() => handleQuantityChange(index, -1)}
                                                                            className="size-6 rounded-md bg-white dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-red-500 shadow-sm border border-slate-200 dark:border-slate-600 active:scale-95 transition-all"
                                                                            tabIndex={0}
                                                                        >
                                                                            <span className="material-symbols-outlined text-[14px]">remove</span>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setScannerItemEditor({
                                                                                type: 'matched',
                                                                                index,
                                                                                item: {
                                                                                    ...item.product,
                                                                                    quantity: item.quantity,
                                                                                    discount: item.discount,
                                                                                    discountPercent: item.discountPercent,
                                                                                    cartItemId: `matched-${index}`
                                                                                } as CartItem
                                                                            })}
                                                                            className="w-auto min-w-[2.5rem] px-1 py-1 text-center font-bold text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded active:scale-95 transition-all"
                                                                        >
                                                                            {formatQty(item.quantity)}<span className="text-[10px] font-medium text-slate-400 ml-0.5">{abbreviateUnit(item.product.unit)}</span>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleQuantityChange(index, 1)}
                                                                            className="size-6 rounded-md bg-white dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-emerald-600 shadow-sm border border-slate-200 dark:border-slate-600 active:scale-95 transition-all"
                                                                            tabIndex={0}
                                                                        >
                                                                            <span className="material-symbols-outlined text-[14px]">add</span>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                                                                        Escaneado: "{item.ocrName}"
                                                                    </span>
                                                                    {item.confidence === 'exact' && (
                                                                        <span className="text-[10px] px-1 py-px bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded font-semibold shrink-0">
                                                                            Exacto
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            }

                                            const uItem = entry.item as RawOCRItem;
                                            const uIndex = entry.index;

                                            const assignedProduct = unmatchedAssignments[uIndex];
                                            const isUnmatchedExpanded = expandedUnmatchedIndex === uIndex;

                                            // Si ya tiene producto asignado → fila compacta como los matched
                                            if (assignedProduct) {
                                                return (
                                                    <div
                                                        key={`unmatched-${uIndex}`}
                                                        className="bg-white dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700 animate-cardEntry"
                                                        style={cardAnimStyle}
                                                    >
                                                        {/* Fila compacta */}
                                                        <button
                                                            onClick={() => setExpandedUnmatchedIndex(isUnmatchedExpanded ? null : uIndex)}
                                                            className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                                                        >
                                                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300 w-10 shrink-0 text-center">
                                                                {formatQty(uItem.quantity)}<span className="text-[10px] font-medium text-slate-400 ml-0.5">{abbreviateUnit(assignedProduct.unit)}</span>
                                                            </span>
                                                            <span className={`font-semibold text-[14px] text-slate-800 dark:text-slate-200 min-w-0 flex-1 leading-snug ${isUnmatchedExpanded ? '' : 'line-clamp-2'}`}>
                                                                {assignedProduct.name}
                                                            </span>
                                                            {(() => {
                                                                const grossPrice = Math.round(assignedProduct.price * uItem.quantity);
                                                                const discountAmt = uItem.discountPercent
                                                                    ? (grossPrice * uItem.discountPercent) / 100
                                                                    : (uItem.discount || 0);
                                                                const netPrice = Math.max(0, grossPrice - discountAmt);
                                                                const hasDiscount = discountAmt > 0;

                                                                return (
                                                                    <div className="flex flex-col items-end shrink-0">
                                                                        <span className="font-bold text-[14px] text-slate-700 dark:text-slate-200">
                                                                            ${formatPrice(netPrice)}
                                                                        </span>
                                                                        {hasDiscount && (
                                                                            <div className="flex items-center gap-1 -mt-0.5">
                                                                                <span className="text-[10px] text-slate-400 line-through">
                                                                                    ${formatPrice(grossPrice)}
                                                                                </span>
                                                                                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-1 rounded">
                                                                                    {uItem.discountPercent ? `-${uItem.discountPercent}%` : `-$${formatPrice(discountAmt)}`}
                                                                                </span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })()}
                                                            <span className={`material-symbols-outlined text-[18px] text-slate-400 shrink-0 transition-transform ${isUnmatchedExpanded ? 'rotate-180' : ''}`}>
                                                                expand_more
                                                            </span>
                                                        </button>

                                                        {/* Panel expandido */}
                                                        {isUnmatchedExpanded && (
                                                            <div className="px-3 pb-3 pt-1 border-t border-slate-100 dark:border-slate-700/50 space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-1.5">
                                                                        <button
                                                                            onClick={() => handleRemoveUnmatched(uIndex)}
                                                                            className="size-6 rounded-md border-2 border-red-300 dark:border-red-700 flex items-center justify-center shrink-0 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                                            aria-label="Eliminar producto"
                                                                            tabIndex={0}
                                                                        >
                                                                            <span className="material-symbols-outlined text-red-500 text-[14px]">delete</span>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => {
                                                                                setUnmatchedAssignments(prev => ({ ...prev, [uIndex]: null }));
                                                                                setSavedNicknames(prev => { const s = new Set(prev); s.delete(uIndex); return s; });
                                                                            }}
                                                                            className="text-xs font-medium text-slate-400 hover:text-amber-600 transition-colors ml-1"
                                                                        >
                                                                            Cambiar
                                                                        </button>
                                                                    </div>

                                                                    <div className="flex items-center gap-0.5 shrink-0 bg-slate-50 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-100 dark:border-slate-700/50">
                                                                        <button
                                                                            onClick={() => handleUnmatchedQuantityChange(uIndex, -1)}
                                                                            className="size-6 rounded-md bg-white dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-red-500 shadow-sm border border-slate-200 dark:border-slate-600 active:scale-95 transition-all"
                                                                            tabIndex={0}
                                                                        >
                                                                            <span className="material-symbols-outlined text-[14px]">remove</span>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => setScannerItemEditor({
                                                                                type: 'unmatched',
                                                                                index: uIndex,
                                                                                item: {
                                                                                    ...assignedProduct,
                                                                                    quantity: uItem.quantity,
                                                                                    discount: uItem.discount,
                                                                                    discountPercent: uItem.discountPercent,
                                                                                    cartItemId: `unmatched-${uIndex}`
                                                                                } as CartItem
                                                                            })}
                                                                            className="w-auto min-w-[2.5rem] px-1 py-1 text-center font-bold text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded active:scale-95 transition-all"
                                                                        >
                                                                            {formatQty(uItem.quantity)}<span className="text-[10px] font-medium text-slate-400 ml-0.5">{abbreviateUnit(assignedProduct.unit)}</span>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleUnmatchedQuantityChange(uIndex, 1)}
                                                                            className="size-6 rounded-md bg-white dark:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-emerald-600 shadow-sm border border-slate-200 dark:border-slate-600 active:scale-95 transition-all"
                                                                            tabIndex={0}
                                                                        >
                                                                            <span className="material-symbols-outlined text-[14px]">add</span>
                                                                        </button>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                                                                        Escaneado: "{uItem.rawText || uItem.name}"
                                                                    </span>
                                                                </div>
                                                                {savedNicknames.has(uIndex) ? (
                                                                    <div className="w-full flex items-center justify-center gap-1.5 text-[12px] text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200/50 dark:border-emerald-800/30 rounded-lg px-3 py-2">
                                                                        <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                                                        Apodo guardado
                                                                    </div>
                                                                ) : (() => {
                                                                    const isGeneric = (uItem.candidateIds && uItem.candidateIds.length > 1) || getCandidateProducts(uItem.rawText || uItem.name).length > 1 || (uItem.rawText || uItem.name).trim().length <= 2;
                                                                    if (isGeneric) return null;
                                                                    return (
                                                                        <button
                                                                            onClick={() => handleSaveNickname(uIndex, assignedProduct, uItem.name)}
                                                                            disabled={savingNickname === uIndex}
                                                                            className="w-full flex items-center justify-center gap-2 text-[12px] font-semibold text-slate-600 dark:text-slate-300 bg-transparent hover:bg-amber-50/50 dark:hover:bg-amber-500/5 border border-amber-300 dark:border-amber-500/30 rounded-lg px-3 py-2 active:scale-[0.98] transition-all disabled:opacity-50"
                                                                        >
                                                                            {savingNickname === uIndex ? 'Guardando...' : `Guardar "${uItem.name}" como apodo`}
                                                                        </button>
                                                                    );
                                                                })()}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            }

                                            // Sin producto asignado → expandido con buscador
                                            return (
                                                <div
                                                    key={`unmatched-${uIndex}`}
                                                    className="bg-white dark:bg-slate-800/80 rounded-lg border border-amber-200 dark:border-amber-800/40 p-3 animate-cardEntry"
                                                    style={cardAnimStyle}
                                                >
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-bold text-amber-600 dark:text-amber-400 w-10 shrink-0 text-center">
                                                                {formatQty(uItem.quantity)}
                                                            </span>
                                                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300 min-w-0 flex-1 line-clamp-2 leading-snug">
                                                                "{uItem.rawText || uItem.name}"
                                                            </span>
                                                        </div>
                                                        <button
                                                            onClick={() => handleRemoveUnmatched(uIndex)}
                                                            className="size-7 rounded-lg flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/10 text-slate-400 hover:text-red-500 transition-colors"
                                                            aria-label="Descartar"
                                                            tabIndex={0}
                                                        >
                                                            <span className="material-symbols-outlined text-[18px]">close</span>
                                                        </button>
                                                    </div>

                                                    {/* Sugerencias rápidas si hay productos candidatos */}
                                                    {(() => {
                                                        const aiCandidates = (uItem.candidateIds || [])
                                                            .map(id => posProducts.find(p => p.id === id))
                                                            .filter(Boolean) as Product[];

                                                        const fallbackCandidates = getCandidateProducts(uItem.rawText || uItem.name);

                                                        const candidatesMap = new Map<string, Product>();
                                                        aiCandidates.forEach(p => candidatesMap.set(p.id, p));
                                                        fallbackCandidates.forEach(p => {
                                                            if (!candidatesMap.has(p.id)) candidatesMap.set(p.id, p);
                                                        });

                                                        const candidates = Array.from(candidatesMap.values());
                                                        if (candidates.length === 0) return null;
                                                        return (
                                                            <div className="mb-2.5">
                                                                <div className="flex items-center gap-1 mb-1.5">
                                                                    <span className="material-symbols-outlined text-[14px] text-amber-500">lightbulb</span>
                                                                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                                                        {candidates.length > 1 ? '¿Cuál de estos productos es?' : 'Sugerencia rápida:'}
                                                                    </span>
                                                                </div>
                                                                <div className="flex flex-col gap-1.5">
                                                                    {candidates.slice(0, 4).map(candidate => (
                                                                        <button
                                                                            key={candidate.id}
                                                                            type="button"
                                                                            onClick={() => handleAssignProduct(uIndex, candidate)}
                                                                            className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800/50 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors shadow-sm text-left active:scale-[0.99]"
                                                                        >
                                                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                                                {candidate.image && (
                                                                                    <img src={candidate.image} alt="" className="size-5 rounded object-cover shrink-0" crossOrigin="anonymous" />
                                                                                )}
                                                                                <span className="truncate flex-1 font-medium">{candidate.name}</span>
                                                                            </div>
                                                                            <span className="text-xs text-amber-700 dark:text-amber-400 font-bold shrink-0 ml-2">
                                                                                ${formatPrice(candidate.price)}
                                                                            </span>
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}

                                                    <div className="relative">
                                                        <input
                                                            type="text"
                                                            placeholder="Buscar producto..."
                                                            value={searchQueries[uIndex] || ''}
                                                            onChange={(e) => setSearchQueries(prev => ({ ...prev, [uIndex]: e.target.value }))}
                                                            className="w-full h-9 pl-9 pr-3 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-amber-400 focus:border-transparent outline-none"
                                                        />
                                                        <span className="material-symbols-outlined text-[18px] text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2">search</span>

                                                        {searchQueries[uIndex]?.trim() && (
                                                            <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-slate-800 border-2 border-amber-300 dark:border-amber-600 rounded-xl shadow-[0_-4px_20px_rgba(0,0,0,0.15)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.4)] z-10 overflow-hidden max-h-40 overflow-y-auto">
                                                                {filteredProducts(searchQueries[uIndex]).map(product => (
                                                                    <button
                                                                        key={product.id}
                                                                        onClick={() => handleAssignProduct(uIndex, product)}
                                                                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-750 flex items-center gap-2 transition-colors"
                                                                    >
                                                                        {product.image && (
                                                                            <img src={product.image} alt="" className="size-7 rounded object-cover" crossOrigin="anonymous"/>
                                                                        )}
                                                                        <span className="font-semibold truncate">{product.name}</span>
                                                                        <span className="ml-auto text-xs text-slate-400">${product.price.toLocaleString()}</span>
                                                                    </button>
                                                                ))}
                                                                {filteredProducts(searchQueries[uIndex]).length === 0 && (
                                                                    <p className="px-3 py-2 text-sm text-slate-400">Sin resultados</p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>
                        )}

                        {matched.length === 0 && unmatched.length === 0 && (
                            <div className="text-center py-12">
                                <span className="material-symbols-outlined text-[48px] text-slate-300 dark:text-slate-600">inventory_2</span>
                                <p className="mt-3 text-slate-400 dark:text-slate-500">No hay productos escaneados</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Bottom Action Bar - Results */}
            {viewState === 'results' && (matched.length > 0 || Object.values(unmatchedAssignments).some(Boolean)) && (
                <div className="shrink-0 bg-white dark:bg-[#0f172a] border-t border-slate-200 dark:border-slate-800 px-4 py-3 z-20 safe-area-inset-bottom shadow-[0_-4px_16px_rgba(0,0,0,0.05)]">
                    <div className="max-w-2xl mx-auto space-y-2.5">
                        {/* Resumen Total y Cantidad siempre a la vista */}
                        <div className="flex items-center justify-between px-1">
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                                {totalItems} {totalItems === 1 ? 'producto' : 'productos'}
                            </span>
                            <div className="flex items-baseline gap-1.5">
                                <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Total:</span>
                                <span className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                                    ${formatPrice(totalPrice)}
                                </span>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={handleScanAnother}
                                disabled={isProcessingPayment}
                                className="hidden h-12 px-5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-sm items-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                                aria-label="Escanear otra lista"
                                tabIndex={0}
                            >
                                <span className="material-symbols-outlined text-[20px]">add_a_photo</span>
                                <span className="hidden sm:inline">Escanear Otra</span>
                            </button>

                            <button
                                onClick={handleAddToCart}
                                disabled={isProcessingPayment || totalItems === 0 || unmatched.some((_, i) => !unmatchedAssignments[i])}
                                className="flex-1 h-12 rounded-xl bg-amber-400 hover:bg-amber-500 text-[#102218] font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-400/20 hover:shadow-xl hover:shadow-amber-400/30 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                                aria-label="Procesar pago"
                                tabIndex={0}
                            >
                                {isProcessingPayment ? (
                                    <>
                                        <div className="size-5 border-2 border-[#102218] border-t-transparent rounded-full animate-spin" />
                                        <span>Procesando pago...</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-[20px]">payments</span>
                                        <span>Procesar Pago ({totalItems})</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {scannerItemEditor && (
                <MobileScannerItemModal
                    item={scannerItemEditor.item}
                    onSave={handleSetCustomQuantity}
                    onClose={() => setScannerItemEditor(null)}
                />
            )}

            {showUnmatchedWarning && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-5 space-y-4">
                        <div className="flex items-center gap-3">
                            <span className="size-10 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[22px]">warning</span>
                            </span>
                            <div>
                                <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">Productos sin reconocer</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    {unmatched.filter((_, i) => !unmatchedAssignments[i]).length} producto{unmatched.filter((_, i) => !unmatchedAssignments[i]).length > 1 ? 's' : ''} no se incluirá{unmatched.filter((_, i) => !unmatchedAssignments[i]).length > 1 ? 'n' : ''} en la venta:
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                            {unmatched
                                .filter((_, i) => !unmatchedAssignments[i])
                                .map((item, i) => (
                                    <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700/40">
                                        "{item.name}"
                                    </span>
                                ))
                            }
                        </div>

                        <div className="flex gap-3 pt-1">
                            <button
                                onClick={() => setShowUnmatchedWarning(false)}
                                disabled={isProcessingPayment}
                                className="flex-1 h-11 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={proceedToPayment}
                                disabled={isProcessingPayment}
                                className="flex-1 h-11 rounded-xl bg-amber-400 hover:bg-amber-500 text-[#102218] font-bold text-sm shadow-md active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isProcessingPayment ? (
                                    <div className="size-4 border-2 border-[#102218] border-t-transparent rounded-full animate-spin" />
                                ) : null}
                                <span>Continuar</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de confirmación para Limpiar todo */}
            {showConfirmReset && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-scaleUp border border-slate-200/80 dark:border-slate-700/80">
                        <div className="flex items-center gap-3">
                            <span className="size-11 rounded-2xl bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-2xl">delete_sweep</span>
                            </span>
                            <div>
                                <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">¿Limpiar toda la lista?</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                    Se descartarán los productos escaneados y agregados.
                                </p>
                            </div>
                        </div>

                        <p className="text-sm text-slate-600 dark:text-slate-300">
                            Esta acción eliminará todos los elementos de la lista actual y te regresará a la pantalla de captura.
                        </p>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => setShowConfirmReset(false)}
                                className="flex-1 h-11 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-600 active:scale-95 transition-all"
                                tabIndex={0}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    setShowConfirmReset(false);
                                    handleReset();
                                }}
                                className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-md shadow-red-600/20 active:scale-95 transition-all flex items-center justify-center gap-1.5"
                                tabIndex={0}
                            >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                                Sí, limpiar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {cropImageSrc && (
                <DocumentCropper
                    imageSrc={cropImageSrc}
                    onConfirm={handleCropConfirm}
                    onCancel={handleCropCancel}
                    confirmLabel="Analizar"
                    confirmIcon="auto_awesome"
                    analyzing={isAnalyzing}
                    light
                />
            )}

            {showBarcodeScanner && (
                <Suspense fallback={null}>
                    <BarcodeScanner
                        onScan={handleBarcodeScan}
                        onClose={() => setShowBarcodeScanner(false)}
                        variant="modal"
                    />
                </Suspense>
            )}

            {priceInputProduct && (
                <PriceInputModal
                    product={priceInputProduct}
                    unitLabel={getUnitLabel(priceInputProduct.unit)}
                    onConfirm={(qty, _adjustedPrice) => {
                        addProductToList(priceInputProduct, qty);
                        setPriceInputProduct(null);
                    }}
                    onClose={() => setPriceInputProduct(null)}
                />
            )}

            {/* Modal de Cámara Web para PC */}
            {showPCWebcam && (
                <div className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-3xl overflow-hidden shadow-2xl flex flex-col animate-scaleUp">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <span className="size-8 rounded-lg bg-amber-400/20 text-amber-400 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[20px]">videocam</span>
                                </span>
                                <h3 className="text-white font-bold text-base">Cámara Web</h3>
                            </div>
                            <button
                                onClick={handleClosePCWebcam}
                                className="size-9 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-colors"
                                aria-label="Cerrar cámara"
                                tabIndex={0}
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>

                        <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
                            <video
                                ref={pcVideoRef}
                                autoPlay
                                playsInline
                                muted
                                className="w-full h-full object-cover"
                            />
                        </div>

                        <div className="p-4 bg-slate-900/90 flex items-center justify-center gap-4 shrink-0 border-t border-slate-800">
                            <button
                                onClick={handleClosePCWebcam}
                                className="px-5 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-sm transition-colors"
                                tabIndex={0}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCapturePCWebcam}
                                disabled={isCapturingWebcam}
                                className="h-12 px-6 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 font-bold text-sm flex items-center gap-2 shadow-lg shadow-amber-400/25 active:scale-95 transition-all disabled:opacity-50"
                                aria-label="Capturar comanda"
                                tabIndex={0}
                            >
                                {isCapturingWebcam ? (
                                    <>
                                        <div className="size-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                                        <span>Capturando...</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-[20px]">photo_camera</span>
                                        <span>Capturar Foto</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
