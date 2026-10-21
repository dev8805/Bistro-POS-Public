import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { offlineQueue } from '../../lib/offlineQueue';
import { saveAdminProducts, getAdminProducts } from '../../lib/offlineStorage';
import { pushOfflineCashMovement } from '../../lib/offlineCashCache';
import { isRealOffline } from '../../lib/connectivity';
import { useAuth } from '../../context/AuthContext';
import { useProducts, Product } from '../../hooks/useProducts';
import { useCashRegister } from '../../hooks/useCashRegister';
import { useDebts } from '../../hooks/useDebts';
import { useSuppliers, Supplier } from '../../hooks/useSuppliers';
import { invokeEdgeFunction } from '../../utils/invokeEdgeFunction';
import { formatCurrency } from '../../lib/formatters';
import { useToast } from '../../context/ToastContext';
import { useConfirmDialog } from '../../context/ConfirmDialogContext';
import { useBusinessSettings } from '../../context/BusinessSettingsContext';
import { AppButton } from '../ui/AppButton';
import { formatDateInTz } from '../../lib/timezone';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { BarcodeInputModal } from '../BarcodeInputModal';
import { BarcodeScanner, BarcodeScannerHandle } from '../BarcodeScanner';
import { compressImage } from '../../lib/imageUtils';
import { useImageUpload } from '../../hooks/useImageUpload';
import { EvidenceUploader } from '../EvidenceUploader';
import { InvoiceReviewPanel, ScannedMatchedItem, ScannedUnmatchedItem } from './InvoiceReviewPanel';
import { DocumentScanner } from '../ui/DocumentScanner';
import { InvoiceScanAnimatedIcon } from './InvoiceScanAnimatedIcon';
import { buildPurchasePayload } from '../../lib/invoiceScan/buildPurchasePayload';
import { assignSupplierBrandColor } from '../../utils/supplierBrandColor';
import type { ScanDraft, ScanLine, PaymentMethodDraft, RegisterResult, RegisterFailure } from '../../lib/invoiceScan/types';
import {
    ExpenseSubComponentProps,
    InventoryItem,
    PaymentEntry,
    formatWithThousands,
    parseCleanNumber,
    getLocalDateValue,
    formatExpenseDateLabel,
} from './shared';

/**
 * Mensajes en español para los códigos de error que devuelve el motor
 * `register_purchase` (tabla de Error Handling del diseño). Un `ok:false`
 * implica cero escrituras: se muestra el aviso y el formulario NO se cierra.
 */
const REGISTER_ERROR_MESSAGES: Record<string, string> = {
    no_business: 'Tu sesión no tiene un negocio asignado.',
    business_mismatch: 'No autorizado para esta operación.',
    forbidden: 'No tienes permiso para registrar compras y gastos.',
    invalid_payload: 'Los datos de la compra están incompletos.',
    supplier_not_found: 'El proveedor ya no existe.',
    product_not_found: 'Un producto de la compra ya no existe en tu catálogo.',
    shift_invalid: 'El turno de caja ya no está abierto.',
    insufficient_cash_balance: 'Saldo insuficiente en efectivo.',
    overpayment: 'La suma de los pagos supera el total.',
};

const preloadInvoiceScanScreen = () => {
    void import('../../screens/InvoiceScanScreen');
};

const InvoiceScanScreen = React.lazy(() => import('../../screens/InvoiceScanScreen'));

export const InventoryPurchase: React.FC<ExpenseSubComponentProps> = ({ onClose, onSave }) => {
    const { showToast } = useToast();
    const { confirmAction } = useConfirmDialog();
    const { profile } = useAuth();
    const { paymentMethods, timezone } = useBusinessSettings();
    const { products } = useProducts();
    const { activeShift, reverseCashMovement, balances, addCashIn } = useCashRegister();
    const { debts, deletePurchaseRecord, updatePurchaseRecord } = useDebts();
    const { suppliers, createSupplier } = useSuppliers();
    const evidenceUpload = useImageUpload(null, 'debt-evidence');

    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const dateInputRef = useRef<HTMLInputElement>(null);
    const invoiceScanInputRef = useRef<HTMLInputElement>(null);

    const [inventoryTab, setInventoryTab] = useState<'register' | 'history'>('register');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [expenseDate, setExpenseDate] = useState<string>(getLocalDateValue);
    const [showInvoiceScan, setShowInvoiceScan] = useState(false);
    const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);

    const [deletingPurchaseDebt, setDeletingPurchaseDebt] = useState<typeof debts[0] | null>(null);
    const [shouldRefundCash, setShouldRefundCash] = useState<boolean>(true);
    const [refundAmount, setRefundAmount] = useState<string>('');
    const [isDeletingPurchase, setIsDeletingPurchase] = useState<boolean>(false);

    useEffect(() => {
        preloadInvoiceScanScreen();
        let cancelled = false;
        const reconcile = () => {
            void isRealOffline().then(offline => {
                if (!cancelled) setIsOnline(!offline);
            });
        };
        reconcile();
        window.addEventListener('online', reconcile);
        window.addEventListener('offline', reconcile);
        return () => {
            cancelled = true;
            window.removeEventListener('online', reconcile);
            window.removeEventListener('offline', reconcile);
        };
    }, []);

    const handleOpenInvoiceScan = () => {
        if (!isOnline) {
            showToast('El escaneo con foto necesita conexión a internet.', 'warning');
            return;
        }
        setShowInvoiceScan(true);
    };

    // Inventory cart
    const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
    const [invProductSearch, setInvProductSearch] = useState('');
    const [showProductSelector, setShowProductSelector] = useState(false);
    const [barcodeScanProduct, setBarcodeScanProduct] = useState<Product | null>(null);
    const [showCameraScanner, setShowCameraScanner] = useState(false);
    const cameraScannerRef = useRef<BarcodeScannerHandle>(null);

    // Invoice scanner
    const cameraScanInputRef = useRef<HTMLInputElement>(null);
    const galleryScanInputRef = useRef<HTMLInputElement>(null);
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
    const [invoiceView, setInvoiceView] = useState<'form' | 'scanning' | 'review'>('form');
    const [scannedMatched, setScannedMatched] = useState<ScannedMatchedItem[]>([]);
    const [scannedUnmatched, setScannedUnmatched] = useState<ScannedUnmatchedItem[]>([]);
    const [showImageSourceModal, setShowImageSourceModal] = useState(false);
    const [showDocumentScanner, setShowDocumentScanner] = useState(false);

    // Payment
    const firstPaymentInputRef = useRef<HTMLInputElement>(null);
    const [isCredit, setIsCredit] = useState<boolean | null>(null);
    const [deductFromCashRegister, setDeductFromCashRegister] = useState<boolean | null>(null);
    const [creditorName, setCreditorName] = useState('');
    const [dueDate, setDueDate] = useState<string>('');
    const [showCreditorList, setShowCreditorList] = useState(false);
    const [inventoryPaidAmount, setInventoryPaidAmount] = useState('');
    const [inventoryCreditPaymentMethod, setInventoryCreditPaymentMethod] = useState<string>('');

    // History edit
    const [editingInventoryDebt, setEditingInventoryDebt] = useState<string | null>(null);
    const [editInventoryQty, setEditInventoryQty] = useState('');
    const [editInventoryCost, setEditInventoryCost] = useState('');
    const [inventoryBlockedMessage, setInventoryBlockedMessage] = useState<string | null>(null);

    // New supplier form & bottom sheet
    const [showNewSupplierForm, setShowNewSupplierForm] = useState(false);
    const [isClosingSupplierSheet, setIsClosingSupplierSheet] = useState(false);
    const [supplierSwipeOffset, setSupplierSwipeOffset] = useState(0);
    const [isDraggingSupplier, setIsDraggingSupplier] = useState(false);
    const supplierSwipeStartY = useRef<number | null>(null);
    const supplierSwipeOffsetRef = useRef(0);
    const isDraggingSupplierRef = useRef(false);
    const startedAtTopSupplierRef = useRef(true);
    const supplierPanelRef = useRef<HTMLDivElement>(null);
    const [isCreatingSupplier, setIsCreatingSupplier] = useState(false);
    const [newSupplierName, setNewSupplierName] = useState('');
    const [newSupplierNit, setNewSupplierNit] = useState('');
    const [newSupplierPhone, setNewSupplierPhone] = useState('');
    const [newSupplierAddress, setNewSupplierAddress] = useState('');

    const closeNewSupplierSheet = useCallback(() => {
        setIsClosingSupplierSheet(true);
        setTimeout(() => {
            setShowNewSupplierForm(false);
            setIsClosingSupplierSheet(false);
            setSupplierSwipeOffset(0);
            supplierSwipeOffsetRef.current = 0;
            setIsDraggingSupplier(false);
            isDraggingSupplierRef.current = false;
        }, 250);
    }, []);

    const openNewSupplierSheet = useCallback(() => {
        setIsClosingSupplierSheet(false);
        setSupplierSwipeOffset(0);
        supplierSwipeOffsetRef.current = 0;
        setIsDraggingSupplier(false);
        isDraggingSupplierRef.current = false;
        setNewSupplierName('');
        setNewSupplierNit('');
        setNewSupplierPhone('');
        setNewSupplierAddress('');
        setShowNewSupplierForm(true);
    }, []);

    useEffect(() => {
        if (!showNewSupplierForm || isClosingSupplierSheet) return;
        const el = supplierPanelRef.current;
        if (!el) return;
        const handler = (e: TouchEvent) => {
            if (supplierSwipeStartY.current === null) return;
            const delta = e.touches[0].clientY - supplierSwipeStartY.current;
            if (delta > 8 && startedAtTopSupplierRef.current) {
                e.preventDefault();
                if (!isDraggingSupplierRef.current) {
                    isDraggingSupplierRef.current = true;
                    setIsDraggingSupplier(true);
                }
                supplierSwipeOffsetRef.current = delta;
                setSupplierSwipeOffset(delta);
            }
        };
        el.addEventListener('touchmove', handler, { passive: false });
        return () => el.removeEventListener('touchmove', handler);
    }, [showNewSupplierForm, isClosingSupplierSheet]);

    const businessPaymentMethods = useMemo(() => {
        const stdMap: Record<string, string> = {
            'efectivo': 'cash', 'tarjeta': 'card', 'nequi': 'nequi',
            'daviplata': 'daviplata', 'transferencia': 'transfer', 'otro': 'other',
        };
        return paymentMethods.map(name => {
            const id = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');
            const mappedId = stdMap[id] || id;
            return { id, label: name, mappedId, balance: balances[mappedId] || 0 };
        });
    }, [paymentMethods, balances]);

    const [payments, setPayments] = useState<PaymentEntry[]>([{ method: 'cash', amount: '' }]);

    useEffect(() => {
        if (businessPaymentMethods.length > 0) {
            setPayments([{ method: businessPaymentMethods[0].id, amount: '' }]);
        }
    }, [businessPaymentMethods]);

    const filteredSuppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(creditorName.toLowerCase())
    );

    const [activeLotIds, setActiveLotIds] = useState<Set<string>>(new Set());
    const [lotDataMap, setLotDataMap] = useState<Map<string, { qty: number; productId: string }>>(new Map());
    // Último costo real de cada producto registrado en compras previas (inventory_lots)
    const [lastCosts, setLastCosts] = useState<Record<string, number>>({});

    useEffect(() => {
        const loadActiveLots = async () => {
            const { data } = await supabase
                .from('inventory_lots')
                .select('id, initial_quantity, product_id')
                .gt('remaining_quantity', 0);
            if (data) {
                setActiveLotIds(new Set(data.map(l => l.id)));
                setLotDataMap(new Map(data.map(l => [l.id, { qty: l.initial_quantity, productId: l.product_id }])));
            }
        };
        loadActiveLots();
    }, [debts]);

    useEffect(() => {
        if (!profile?.business_id) return;
        let isMounted = true;
        try {
            const table = supabase?.from?.('inventory_lots');
            if (table && typeof table.select === 'function') {
                table
                    .select('product_id, unit_cost, purchase_date, created_at')
                    .eq('business_id', profile.business_id)
                    .order('created_at', { ascending: false })
                    .then(
                        ({ data }: { data: Array<{ product_id: string; unit_cost: number }> | null }) => {
                            if (!data || !isMounted) return;
                            const map: Record<string, number> = {};
                            for (const lot of data) {
                                if (lot.product_id && map[lot.product_id] === undefined && Number(lot.unit_cost) > 0) {
                                    map[lot.product_id] = Number(lot.unit_cost);
                                }
                            }
                            setLastCosts(map);
                        },
                        () => {},
                    );
            }
        } catch {
            // No interrumpe si la base o mock no está disponible
        }
        return () => { isMounted = false; };
    }, [profile?.business_id, debts]);

    const [visibleInventoryCount, setVisibleInventoryCount] = useState(10);
    const [loadingMoreInventory, setLoadingMoreInventory] = useState(false);

    const allInventoryPurchases = useMemo(() =>
        debts
            .filter(d => d.inventory_lot_id && activeLotIds.has(d.inventory_lot_id))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
        [debts, activeLotIds]
    );

    const inventoryPurchases = useMemo(() =>
        allInventoryPurchases.slice(0, visibleInventoryCount),
        [allInventoryPurchases, visibleInventoryCount]
    );

    const hasMoreInventory = visibleInventoryCount < allInventoryPurchases.length;

    const loadMoreInventory = useCallback(() => {
        if (!hasMoreInventory || loadingMoreInventory) return;
        setLoadingMoreInventory(true);
        setTimeout(() => {
            setVisibleInventoryCount(prev => prev + 10);
            setLoadingMoreInventory(false);
        }, 150);
    }, [hasMoreInventory, loadingMoreInventory]);

    const handleHistoryScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop <= clientHeight + 100 && hasMoreInventory && !loadingMoreInventory) {
            loadMoreInventory();
        }
    }, [hasMoreInventory, loadingMoreInventory, loadMoreInventory]);

    useEffect(() => {
        if (inventoryTab === 'history') {
            setVisibleInventoryCount(10);
            setLoadingMoreInventory(false);
        }
    }, [inventoryTab]);

    const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

    const formatInventoryDate = (dateStr: string): string => {
        if (!dateStr) return '';
        return formatDateInTz(dateStr, timezone, { day: 'numeric', month: 'short', year: 'numeric' }).replace(/ de /gi, ' ').replace(/\./g, '');
    };

    const totalPayments = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    const getItemTotal = (item: InventoryItem): number => {
        const qty = parseFloat(item.quantity) || 0;
        const uc = parseFloat(item.unitCost) || 0;
        return uc * qty;
    };

    const inventoryCartTotal = inventoryItems.reduce((sum, item) => sum + getItemTotal(item), 0);

    // Auto-rellenar monto con el total de la compra al deducir de caja
    useEffect(() => {
        if (deductFromCashRegister && !isCredit && activeShift && payments.length === 1 && inventoryCartTotal > 0) {
            const currentAmt = parseFloat(payments[0].amount) || 0;
            if (currentAmt === 0) {
                setPayments(prev => [{
                    method: prev[0]?.method || businessPaymentMethods[0]?.id || 'cash',
                    amount: String(inventoryCartTotal)
                }]);
            }
        }
    }, [deductFromCashRegister, isCredit, activeShift, inventoryCartTotal, businessPaymentMethods]);

    useBarcodeScanner(
        products,
        (product) => {
            setBarcodeScanProduct(product);
            setInvProductSearch(''); // limpiar lo que la pistola escribió en el buscador
        },
        showProductSelector,
        (code) => {
            setInvProductSearch('');
            showToast(`Código ${code} no encontrado en el catálogo`, 'error');
        },
        true, // priority: silencia el hook de MenuScreen mientras el panel esté abierto
    );

    const matchScannedProducts = (items: { description: string; quantity: number; unitCost: number; ocr_unit?: string | null; extraFields?: Record<string, string | number> }[]) => {
        const matched: ScannedMatchedItem[] = [];
        const unmatched: ScannedUnmatchedItem[] = [];

        // Solo productos simples son comprables (incluye insumos is_for_sale=false; excluye recetas y servicios)
        const matchable = products.filter(p => p.type === 'simple');

        console.log(`[MATCH] Intentando cruzar ${items.length} items con ${matchable.length} productos en catálogo.`);

        for (const item of items) {
            const ocrLower = item.description.toLowerCase().trim();
            if (!ocrLower) {
                console.warn('[MATCH] Item ignorado: descripción vacía.');
                continue;
            }
            let found: Product | null = null;
            let matchReason = '';

            // 1. Exacto por nickname
            for (const p of matchable) {
                if ((p.nicknames || []).some((n: string) => n.toLowerCase().trim() === ocrLower)) {
                    found = p; matchReason = 'nickname exacto'; break;
                }
            }
            // 2. Parcial por nickname
            if (!found) {
                const partial = matchable.filter(p =>
                    (p.nicknames || []).some((n: string) =>
                        n.toLowerCase().includes(ocrLower) || ocrLower.includes(n.toLowerCase())
                    )
                );
                if (partial.length === 1) { found = partial[0]; matchReason = 'nickname parcial'; }
                else if (partial.length > 1) console.warn(`[MATCH] "${item.description}": ${partial.length} coincidencias por nickname parcial, se ignoran.`);
            }
            // 3. Exacto por nombre
            if (!found) {
                const exactName = matchable.find(p => p.name.toLowerCase() === ocrLower);
                if (exactName) { found = exactName; matchReason = 'nombre exacto'; }
            }
            // 4. Parcial por nombre
            if (!found) {
                const partial = matchable.filter(p =>
                    p.name.toLowerCase().includes(ocrLower) || ocrLower.includes(p.name.toLowerCase())
                );
                if (partial.length === 1) { found = partial[0]; matchReason = 'nombre parcial'; }
                else if (partial.length > 1) console.warn(`[MATCH] "${item.description}": ${partial.length} coincidencias por nombre parcial, se ignoran. Productos: ${partial.map(p => p.name).join(', ')}`);
            }

            if (found) {
                console.log(`[MATCH] ✅ "${item.description}" → "${found.name}" (via ${matchReason})`);
                matched.push({ ocrName: item.description, product: found, quantity: item.quantity || 1, unitCost: item.unitCost || 0, selected: true, ocr_unit: item.ocr_unit, extraFields: item.extraFields });
            } else {
                console.warn(`[MATCH] ❌ "${item.description}" → Sin coincidencia en catálogo.`);
                unmatched.push({ ocrName: item.description, quantity: item.quantity || 1, unitCost: item.unitCost || 0, ocr_unit: item.ocr_unit, extraFields: item.extraFields });
            }
        }
        console.log(`[MATCH] Resultado: ${matched.length} reconocidos, ${unmatched.length} sin reconocer.`);
        return { matched, unmatched };
    };

    const handleScanInvoice = async (file: File) => {
        if (file.size > 50 * 1024 * 1024) {
            showToast('El archivo es muy grande (máximo 50MB). Selecciona una foto de la factura.', 'error');
            return;
        }
        setShowImageSourceModal(false);
        setInvoiceView('scanning');
        console.log('[SCAN] ===== INICIO DE ESCANEO =====');
        console.log('[SCAN] Archivo:', file.name, `(${(file.size / 1024).toFixed(1)} KB, ${file.type})`);
        try {
            console.log('[SCAN] Comprimiendo imagen...');
            const { base64, mimeType } = await compressImage(file);
            console.log(`[SCAN] Imagen comprimida. mimeType: ${mimeType}`);

            console.log('[SCAN] Proveedor:', selectedSupplier?.name || 'Sin proveedor');

            // Sin configuración por proveedor: la edge function aplica su prompt
            // por defecto cuando el body no trae `invoiceConfig`.
            console.log('[SCAN] Enviando a Gemini via Edge Function scan-invoice...');
            const { data, error } = await invokeEdgeFunction('scan-invoice', {
                imageBase64: base64, mimeType
            }, { timeoutMs: 45000 });

            if (error) {
                showToast(error, 'error');
                setInvoiceView('form');
                return;
            }

            console.log('[SCAN] ✅ Respuesta de Gemini recibida:');
            console.log('[SCAN] Header:', JSON.stringify(data?.header));
            console.log(`[SCAN] Items raw (${(data?.items || []).length}):`, JSON.stringify(data?.items));

            if (!data?.items || data.items.length === 0) {
                showToast('Gemini no detectó ningún producto en la imagen. Intenta con una foto más clara o bien iluminada.', 'error');
                setInvoiceView('form');
                return;
            }

            const descKey = 'description';
            const qtyKey = 'quantity';
            const costKey = 'unitCost';
            const CORE_KEYS = new Set([descKey, qtyKey, costKey, 'unit_cost', 'ocr_unit']);

            const items: { description: string; quantity: number; unitCost: number; ocr_unit?: string | null; extraFields?: Record<string, string | number> }[] =
                (data?.items || []).map((it: any) => {
                    const allKeys = Object.keys(it);
                    const rawDesc = it[descKey] ?? it['description'] ?? it[allKeys.find(k => typeof it[k] === 'string') || ''];
                    const extractedDescription = String(rawDesc || '');
                    const rawQty = it[qtyKey] ?? it['quantity'];
                    const rawCost = it[costKey] ?? it['unitCost'] ?? it['unit_cost'];

                    const parseLatinNumber = (val: any): number => {
                        if (typeof val === 'number') return val;
                        if (!val) return 0;
                        const str = String(val).trim();
                        const hasDot = str.includes('.');
                        const hasComma = str.includes(',');
                        let clean = str;
                        if (hasComma) {
                            clean = str.replace(/\./g, '').replace(',', '.');
                        } else if (hasDot) {
                            const parts = str.split('.');
                            if (parts.length === 2 && parts[1].length === 3) {
                                clean = str.replace('.', '');
                            }
                        }
                        return parseFloat(clean) || 0;
                    };

                    const quantity = +(parseLatinNumber(rawQty) || 1).toFixed(3);
                    const unitCost = +(parseLatinNumber(rawCost).toFixed(2));
                    const extraFields: Record<string, string | number> = {};
                    allKeys.forEach(k => {
                        if (!CORE_KEYS.has(k) && (typeof it[k] === 'string' || typeof it[k] === 'number')) {
                            extraFields[k] = it[k];
                        }
                    });

                    console.log(`[SCAN] Procesado item: desc="${extractedDescription}", qty=${quantity}, cost=${unitCost}, ocr_unit="${it.ocr_unit}"`);
                    return { description: extractedDescription, quantity, unitCost, ocr_unit: it.ocr_unit || null, extraFields };
                });

            const { matched, unmatched } = matchScannedProducts(items);
            setScannedMatched(matched);
            setScannedUnmatched(unmatched);

            if (matched.length === 0 && unmatched.length > 0) {
                showToast(`Gemini detectó ${unmatched.length} producto(s) pero ninguno existe en tu catálogo. Puedes asignarlos manualmente.`, 'info');
            }

            setInvoiceView('review');
            console.log('[SCAN] ===== ESCANEO COMPLETADO =====');
        } catch (err: any) {
            console.error('[SCAN] ❌ Error general:', err);
            showToast('No se pudo procesar la imagen. Intenta con una foto más clara.', 'error');
            setInvoiceView('form');
        }
    };

    const handleConfirmScannedItems = (items: InventoryItem[]) => {
        setInventoryItems(prev => {
            const merged = [...prev];
            for (const item of items) {
                const idx = merged.findIndex(i => i.product.id === item.product.id);
                if (idx !== -1) {
                    merged[idx] = {
                        ...merged[idx],
                        quantity: String((parseInt(merged[idx].quantity) || 0) + (parseInt(item.quantity) || 0)),
                        unitCost: item.unitCost || merged[idx].unitCost,
                    };
                } else {
                    merged.push(item);
                }
            }
            return merged;
        });
        setInvoiceView('form');
        showToast(`${items.length} ${items.length === 1 ? 'producto agregado' : 'productos agregados'} al carrito`, 'success');
    };

    const handleOpenDatePicker = () => {
        if (dateInputRef.current) {
            try { (dateInputRef.current as any).showPicker(); }
            catch { dateInputRef.current.click(); }
        }
    };

    const handleRemoveInventoryItem = (index: number) => {
        setInventoryItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleUpdateInventoryItem = (index: number, field: keyof InventoryItem, value: string) => {
        setInventoryItems(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

    const addPaymentMethod = () => {
        const usedMethods = payments.map(p => p.method);
        const currentMethods = businessPaymentMethods;
        const availableMethod = currentMethods.find(m => !usedMethods.includes(m.id));
        if (availableMethod) {
            setPayments([...payments, { method: availableMethod.id, amount: '' }]);
        }
    };

    const removePayment = (index: number) => {
        if (payments.length > 1) setPayments(payments.filter((_, i) => i !== index));
    };

    const updatePayment = (index: number, field: 'method' | 'amount', value: string) => {
        const updated = [...payments];
        updated[index] = { ...updated[index], [field]: value };
        setPayments(updated);
    };

    const handleDeleteInventoryPurchase = (debt: typeof debts[0]) => {
        if (!debt.inventory_lot_id) return;
        setDeletingPurchaseDebt(debt);
        const isCashPurchase = debt.status === 'paid' && debt.paid_amount >= debt.total_amount && debt.total_amount > 0;
        setShouldRefundCash(Boolean(activeShift && isCashPurchase));
        setRefundAmount(String(Math.round(debt.total_amount || 0)));
    };

    const handleConfirmDeleteInventoryPurchase = async () => {
        if (!deletingPurchaseDebt) return;
        setIsDeletingPurchase(true);
        try {
            const result = await deletePurchaseRecord(deletingPurchaseDebt.id);
            if (result.blocked) {
                const msg = result.reason === 'stock_negative'
                    ? 'No puedes borrar esta compra porque el stock de este producto está en 0 o en negativo. Eliminarlo descuadraría aún más el inventario.\n\nPrimero registra más inventario o ajusta el stock antes de intentar eliminar.'
                    : `No puedes borrar esta compra porque ya vendiste ${result.sold} unidades de este registro. Borrarla descuadraría el análisis de ganancias del Dashboard.\n\nUsa el botón de editar ✏️ para corregir la cantidad o el costo.`;
                setInventoryBlockedMessage(msg);
                setDeletingPurchaseDebt(null);
                return;
            }

            const refundVal = parseFloat(refundAmount) || 0;
            if (shouldRefundCash && activeShift && refundVal > 0) {
                await addCashIn(
                    refundVal,
                    `Reintegro compra inventario: ${deletingPurchaseDebt.creditor_name || 'Proveedor'}`
                );
            }

            window.dispatchEvent(new CustomEvent('purchase-reversed'));
            showToast(
                shouldRefundCash && refundVal > 0
                    ? 'Compra eliminada y dinero reintegrado a caja'
                    : 'Compra eliminada correctamente',
                'success'
            );
            setDeletingPurchaseDebt(null);
        } catch (err: any) {
            showToast(err.message || 'Error al eliminar', 'error');
        } finally {
            setIsDeletingPurchase(false);
        }
    };

    const handleOpenEditInventory = (debt: typeof debts[0]) => {
        const desc = debt.description || '';
        const qtyMatch = desc.match(/\((\d+)\s/);
        setEditingInventoryDebt(debt.id);
        setEditInventoryQty(qtyMatch ? qtyMatch[1] : '');
        setEditInventoryCost(debt.total_amount.toString());
    };

    const handleSaveEditInventory = async () => {
        if (!editingInventoryDebt) return;
        try {
            const newQty = parseInt(editInventoryQty) || undefined;
            const newCostTotal = parseFloat(editInventoryCost) || undefined;
            const newUnitCost = (newQty && newCostTotal) ? newCostTotal / newQty : undefined;
            const result = await updatePurchaseRecord(editingInventoryDebt, {
                newQuantity: newQty,
                newUnitCost,
            });
            if (!result.success) {
                showToast(result.message || 'No se pudo actualizar', 'error');
            } else {
                showToast('Compra actualizada', 'success');
                setEditingInventoryDebt(null);
            }
        } catch (err: any) {
            showToast(err.message || 'Error al editar', 'error');
        }
    };

    // Adaptador del estado del carrito manual al Borrador_Escaneo que consume
    // `buildPurchasePayload`. Fuente ÚNICA de armado para los caminos online y
    // offline, así el contrato del payload vive en un solo lugar y se garantiza
    // la paridad de registro entre ambos (Req 16.8/16.9/16.10). El
    // `idempotency_key` se genera aquí (al construir/encolar), no al sincronizar,
    // de modo que un reintento de sincronización reusa la misma clave (Req 12.9).
    // Todos los ítems del carrito son productos EXISTENTES en Unidad_Venta: sin
    // conversión de unidad, sin descuento global, sin apodos ni precio nuevo.
    const buildManualPurchaseDraft = (): ScanDraft => {
        // Resolver el proveedor para el motor: preferir el seleccionado; si no,
        // enlazar por nombre con uno ya existente para no duplicarlo; si tampoco
        // existe, se crea dentro de la transacción. El motor siempre necesita uno.
        const typedSupplier = creditorName.trim();
        const matchedSupplier = selectedSupplier
            ?? suppliers.find(s => s.name.trim().toLowerCase() === typedSupplier.toLowerCase())
            ?? null;

        return {
            destination: 'inventory',
            image: null,
            evidenceUrl: evidenceUpload.imageUrl || null,
            idempotencyKey: crypto.randomUUID(),
            header: { supplierName: null, nit: null, phone: null, invoiceNumber: null, date: expenseDate, supplierId: matchedSupplier?.id ?? null },
            globalDiscount: 0,
            supplier: matchedSupplier
                ? { kind: 'existing', id: matchedSupplier.id, name: matchedSupplier.name }
                : { kind: 'new', name: typedSupplier, nit: '', phone: '' },
            lines: inventoryItems.map((item): ScanLine => {
                const qty = parseInt(item.quantity) || 0;
                const total = getItemTotal(item);
                return {
                    id: item.product.id,
                    ocrName: item.product.name,
                    ocrUnit: '',
                    ocrQuantity: qty,
                    netTotal: total,
                    globalDiscountShare: 0,
                    needsReview: false,
                    decision: { kind: 'linked', productId: item.product.id, addNickname: false },
                    unitCase: 'sale',
                    conversionFactor: 1,
                    createPurchaseUnit: false,
                    quantity: qty,
                    lineTotal: total,
                    newPrice: (item.newSalePrice !== undefined && item.newSalePrice !== null && item.newSalePrice > 0 && item.newSalePrice !== item.product.price)
                        ? item.newSalePrice
                        : null,
                    barcode: '',
                };
            }),
            currentLineIndex: 0,
            expense: null,
            payment: {
                isCredit: !!isCredit,
                dueDate: dueDate || null,
                // El abono inicial solo existe en Crédito; el motor lo reparte.
                paidAmount: isCredit ? (parseFloat(inventoryPaidAmount) || 0) : 0,
                deductFromCash: isCredit ? false : deductFromCashRegister === true,
                shiftId: activeShift?.id || null,
                // Métodos solo en Contado; el motor los reparte por línea (no pre-repartir).
                methods: isCredit
                    ? []
                    : payments
                        .filter(p => (parseFloat(p.amount) || 0) > 0)
                        .map((p): PaymentMethodDraft => ({
                            methodId: p.method,
                            mappedId: businessPaymentMethods.find(m => m.id === p.method)?.mappedId || 'cash',
                            amount: parseFloat(p.amount) || 0,
                        })),
                creditInitialMethodId: isCredit
                    ? (businessPaymentMethods.find(m => m.id === (inventoryCreditPaymentMethod || businessPaymentMethods[0]?.id))?.mappedId || 'cash')
                    : null,
            },
        };
    };

    const handleSave = async () => {
        if (isSubmitting) return;

        if (!creditorName.trim() && !selectedSupplier) {
            showToast('Selecciona o crea un proveedor', 'warning');
            return;
        }

        // Sonda de conectividad real: navigator.onLine puede mentir (adaptador
        // virtual / túnel caído) y dejar pasar al camino online, que falla en
        // silencio y no encola la compra ni el movimiento de caja offline.
        if (await isRealOffline()) {
            // Encolar compra offline con stock optimista
            if (!profile?.business_id || !profile?.id) {
                showToast('Sin conexión y sin sesión válida', 'error');
                return;
            }
            if (inventoryItems.length === 0) return;

            setIsSubmitting(true);
            try {
                // Actualizar stock optimista en IDB
                const cached = await getAdminProducts();
                const updated = cached.map(p => {
                    const match = inventoryItems.find(i => i.product.id === p.id);
                    if (!match) return p;
                    return { ...p, stock: (p.stock || 0) + (parseInt(match.quantity) || 0) };
                });
                await saveAdminProducts(updated);

                // Notificar a pantallas como el catálogo para que refresquen desde IDB
                for (const item of inventoryItems) {
                    const updatedProduct = updated.find(p => p.id === item.product.id);
                    window.dispatchEvent(new CustomEvent('inventory-updated', {
                        detail: { productId: item.product.id, newStock: updatedProduct?.stock }
                    }));
                }

                // Encolar la INTENCIÓN, no los pasos: el payload de la RPC ya
                // armado (misma fuente que el camino online) con el mismo
                // `idempotency_key` generado AL ENCOLAR (Req 12.9). Sin conexión
                // no se puede subir la foto, así que va con `evidence_url = null`
                // (Req 13.4); el sincronizador hará una sola llamada a
                // `register_purchase` con este payload.
                const draft = buildManualPurchaseDraft();
                const p_payload = buildPurchasePayload(draft, {
                    source: 'manual',
                    businessId: profile.business_id,
                    evidenceUrl: null,
                });

                await offlineQueue.add(
                    'inventory_purchase',
                    { rpc_payload: p_payload },
                    profile.business_id,
                    profile.id,
                );

                // Reflejar en caja offline si se descuenta de caja (parte en
                // efectivo del contado). Mismo criterio de hoy: solo contado +
                // descuento de caja + turno abierto.
                if (deductFromCashRegister && !isCredit && activeShift) {
                    const cashAmt = payments
                        .filter(p => {
                            const m = businessPaymentMethods.find(bm => bm.id === p.method);
                            return (m?.mappedId || 'cash') === 'cash';
                        })
                        .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
                    if (cashAmt > 0) {
                        pushOfflineCashMovement(profile.business_id, {
                            shift_id: activeShift.id,
                            created_by: profile.id,
                            type: 'purchase',
                            amount: cashAmt,
                            description: `Compra inventario: ${creditorName.trim()}`,
                            payment_method: 'cash',
                        });
                    }
                }

                showToast('Sin conexión: la compra se guardó sin la foto de la factura y se sincronizará al recuperar internet.', 'success');
                evidenceUpload.markAsSaved();
                onClose();
            } catch (err: any) {
                console.error('[handleSave offline] error encolando compra:', err);
                showToast('No se pudo guardar la compra sin conexión. Intenta de nuevo.', 'error');
            } finally {
                setIsSubmitting(false);
            }
            return;
        }

        if (!isCredit && activeShift && deductFromCashRegister) {
            const amountsByMethod: Record<string, number> = {};
            for (const payment of payments) {
                const methodInfo = businessPaymentMethods.find(m => m.id === payment.method);
                if (methodInfo) {
                    const amt = parseFloat(payment.amount) || 0;
                    if (amt > 0) {
                        amountsByMethod[methodInfo.mappedId] = (amountsByMethod[methodInfo.mappedId] || 0) + amt;
                    }
                }
            }
            for (const [mappedId, totalNeeded] of Object.entries(amountsByMethod)) {
                if (mappedId !== 'cash') continue;
                const available = balances[mappedId] || 0;
                if (totalNeeded > available) {
                    const methodLabel = businessPaymentMethods.find(m => m.mappedId === mappedId)?.label || mappedId;
                    showToast(`Saldo insuficiente en ${methodLabel}. Disponible: $${formatCurrency(available)}`, 'error');
                    return;
                }
            }
        }

        setIsSubmitting(true);
        try {
            const businessId = profile?.business_id;
            if (!businessId) {
                showToast('Tu sesión no tiene un negocio asignado.', 'error');
                return;
            }

            // Mismo armado del Borrador_Escaneo que el camino offline (helper
            // compartido): una sola fuente de verdad del payload garantiza la
            // paridad de registro entre ambos flujos (Req 16.8/16.9/16.10).
            const draft = buildManualPurchaseDraft();

            const p_payload = buildPurchasePayload(draft, {
                source: 'manual',
                businessId,
                evidenceUrl: evidenceUpload.imageUrl || null,
            });

            // Una sola llamada transaccional: el motor aplica stock, lote, deuda,
            // abono y movimientos de caja de forma atómica (Req 16.7, 12.4, 12.7).
            const { data, error } = await supabase.rpc('register_purchase', { p_payload });
            const result = data as RegisterResult | null;

            if (error) {
                console.error('[register_purchase] error de red/RPC:', error);
                showToast('No se pudo registrar la compra. Intenta de nuevo.', 'error');
                return; // No cerrar el formulario; el borrador de la UI se conserva.
            }
            if (!result) {
                showToast('No se pudo registrar la compra.', 'error');
                return; // No cerrar el formulario.
            }
            if (!result.ok) {
                // Sin `strictNullChecks` el discriminante `ok` no estrecha el
                // union: el acceso a `.code` se hace sobre la rama de fallo.
                const code = (result as RegisterFailure).code;
                showToast(REGISTER_ERROR_MESSAGES[code] || 'No se pudo registrar la compra.', 'error');
                return; // No cerrar el formulario.
            }

            // Si el proveedor de la compra era nuevo, asignarle color de marca con IA en segundo plano
            if (draft.supplier?.kind === 'new' && (result as any)?.supplier_id) {
                const supplierId = (result as any).supplier_id;
                const supplierName = draft.supplier.name;
                const existingColors = suppliers.map(s => s.color).filter(Boolean) as string[];
                void assignSupplierBrandColor(supplierId, supplierName, existingColors);
            }

            // Reflejar el stock nuevo en las pantallas que escuchan (catálogo, etc.).
            for (const item of inventoryItems) {
                const qty = parseInt(item.quantity) || 0;
                if (qty <= 0) continue;
                window.dispatchEvent(new CustomEvent('inventory-updated', {
                    detail: { productId: item.product.id, newStock: (item.product.stock || 0) + qty }
                }));
            }

            try {
                await onSave({
                    type: 'inventory',
                    mode: 'manual',
                    amount: inventoryCartTotal,
                    description: '',
                    product: inventoryItems.map(i => i.product.name).join(', '),
                    productId: inventoryItems[0]?.product.id,
                    quantity: inventoryItems.reduce((s, i) => s + (parseInt(i.quantity) || 0), 0),
                    measureUnit: 'UNIDADES',
                    payments: payments.filter(p => parseFloat(p.amount) > 0).map(p => ({
                        ...p,
                        mappedId: businessPaymentMethods.find((m: any) => m.id === p.method)?.mappedId || 'cash'
                    })),
                    category: undefined,
                    reason: undefined,
                    payment_method: undefined,
                    isCredit,
                    creditorName: creditorName.trim() || undefined,
                    date: new Date(expenseDate + 'T12:00:00').toISOString()
                });
            } catch (saveErr) {
                console.error('Error registering expense after purchase:', saveErr);
                showToast('Los productos se guardaron, pero hubo un error al registrar el egreso. Revisa el módulo de Gastos.', 'warning');
            }

            setDueDate(''); // Reset due date after successful save
            evidenceUpload.markAsSaved();
            showToast('Compra registrada con éxito', 'success');
            onClose();
        } catch (err: any) {
            console.error('[handleSave online] error inesperado:', err);
            showToast('No se pudo registrar la compra. Intenta de nuevo.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="relative w-full max-w-md h-full bg-surface-light dark:bg-surface-dark shadow-2xl overflow-hidden flex flex-col animate-[slideInRight_0.4s_cubic-bezier(0.16,1,0.3,1)]">
            <div className="flex flex-col h-full">
                {invoiceView === 'form' && (
                    <div className="flex items-center px-8 pt-6 pb-0 border-b border-border-light dark:border-border-dark shrink-0">
                        <button
                            onClick={() => setInventoryTab('register')}
                            className={`flex-1 py-3 flex items-center justify-center gap-2 font-bold text-sm relative transition-all ${inventoryTab === 'register' ? 'text-text-main dark:text-white' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Compra de inventario
                            {inventoryTab === 'register' && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-layout-dark dark:bg-primary rounded-t-full"></div>}
                        </button>
                        <button
                            onClick={() => setInventoryTab('history')}
                            className={`flex-1 py-3 flex items-center justify-center gap-2 font-bold text-sm relative transition-all ${inventoryTab === 'history' ? 'text-text-main dark:text-white' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            Historial
                            {inventoryTab === 'history' && <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-layout-dark dark:bg-primary rounded-t-full"></div>}
                        </button>
                        <button onClick={onClose} className="size-9 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-[#256c44] dark:text-primary transition-all active:scale-90 shrink-0 ml-2">
                            <span className="material-symbols-outlined text-[28px] font-bold">close</span>
                        </button>
                    </div>
                )}

                <div
                    ref={scrollContainerRef}
                    onScroll={inventoryTab === 'history' ? handleHistoryScroll : undefined}
                    className={`flex-1 no-scrollbar bg-surface-light dark:bg-surface-dark custom-scrollbar relative ${inventoryTab === 'history' ? 'overflow-hidden flex flex-col min-h-0' : 'overflow-y-auto'}`}
                >
                    {/* Vista: Escaneando */}
                    {invoiceView === 'scanning' && (
                        <div className="absolute inset-0 z-20 bg-white dark:bg-gray-950 flex flex-col items-center justify-center gap-8 p-8 overflow-hidden">

                            {/* Fondo de partículas / glow */}
                            <div className="absolute inset-0 pointer-events-none">
                                <div className="absolute top-1/4 left-1/4 size-64 bg-indigo-400/10 dark:bg-indigo-500/10 rounded-full blur-[80px] animate-pulse" />
                                <div className="absolute bottom-1/4 right-1/4 size-48 bg-purple-400/10 dark:bg-purple-500/10 rounded-full blur-[60px] animate-pulse" style={{ animationDelay: '1s' }} />
                            </div>

                            {/* Animación principal del escáner */}
                            <div className="relative flex items-center justify-center">
                                {/* Anillos orbitantes */}
                                <div className="absolute size-40 rounded-full border border-indigo-200/60 dark:border-indigo-700/40 animate-[spin_8s_linear_infinite]" />
                                <div className="absolute size-32 rounded-full border border-purple-200/50 dark:border-purple-700/30 animate-[spin_5s_linear_infinite_reverse]" />

                                {/* Marco del documento con línea de escaneo */}
                                <div className="relative size-24 overflow-hidden rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700/50 shadow-lg shadow-indigo-500/10">
                                    {/* SVG del documento */}
                                    <svg viewBox="0 0 96 96" fill="none" className="size-full p-3 text-indigo-500 dark:text-indigo-400">
                                        {/* Hoja */}
                                        <rect x="18" y="8" width="52" height="68" rx="4" stroke="currentColor" strokeWidth="3" fill="none" />
                                        {/* Esquina doblada */}
                                        <path d="M54 8 L70 24 L54 24 Z" fill="currentColor" fillOpacity="0.2" />
                                        <path d="M54 8 L70 24" stroke="currentColor" strokeWidth="2" />
                                        {/* Líneas de texto */}
                                        <line x1="28" y1="38" x2="64" y2="38" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.4" />
                                        <line x1="28" y1="48" x2="64" y2="48" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.4" />
                                        <line x1="28" y1="58" x2="50" y2="58" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.4" />
                                    </svg>

                                    {/* Línea de escaneo que recorre el documento */}
                                    <div
                                        className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent shadow-[0_0_8px_2px_rgba(99,102,241,0.6)]"
                                        style={{
                                            animation: 'scanLineMove 2s ease-in-out infinite',
                                        }}
                                    />
                                    {/* Brillo de la línea */}
                                    <div
                                        className="absolute left-0 right-0 h-8 bg-gradient-to-b from-indigo-400/0 via-indigo-400/10 to-indigo-400/0 pointer-events-none"
                                        style={{
                                            animation: 'scanLineMove 2s ease-in-out infinite',
                                        }}
                                    />
                                </div>

                                {/* Sparkles en las esquinas */}
                                <div className="absolute -top-1 -right-1 size-3 bg-indigo-400 rounded-full animate-ping opacity-75" />
                                <div className="absolute -bottom-1 -left-1 size-2 bg-purple-400 rounded-full animate-ping opacity-75" style={{ animationDelay: '0.5s' }} />
                            </div>

                            {/* Texto y barra de progreso */}
                            <div className="text-center space-y-3 relative z-10">
                                <p className="text-[17px] font-black text-gray-800 dark:text-white tracking-tight">
                                    Analizando factura
                                    <span className="inline-flex gap-0.5 ml-1">
                                        <span className="animate-bounce inline-block" style={{ animationDelay: '0ms' }}>.</span>
                                        <span className="animate-bounce inline-block" style={{ animationDelay: '150ms' }}>.</span>
                                        <span className="animate-bounce inline-block" style={{ animationDelay: '300ms' }}>.</span>
                                    </span>
                                </p>
                                <p className="text-[12px] text-gray-400 dark:text-gray-500 font-medium">Gemini está leyendo y extrayendo los productos</p>
                                {/* Barra de progreso indeterminada */}
                                <div className="w-48 h-1 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mx-auto">
                                    <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]" style={{ backgroundSize: '200% 100%' }} />
                                </div>
                            </div>

                            {/* Estilos de las keyframe animations */}
                            <style>{`
                                @keyframes scanLineMove {
                                    0%   { top: 10%; }
                                    50%  { top: 85%; }
                                    100% { top: 10%; }
                                }
                                @keyframes shimmer {
                                    0%   { background-position: 200% 0; }
                                    100% { background-position: -200% 0; }
                                }
                            `}</style>
                        </div>
                    )}

                    {/* Vista: Revisión de productos escaneados */}
                    {invoiceView === 'review' && (
                        <div className="absolute inset-0 z-20 bg-surface-light dark:bg-surface-dark animate-[slideInRight_0.25s_ease-out]">
                            <InvoiceReviewPanel
                                matched={scannedMatched}
                                unmatched={scannedUnmatched}
                                products={products}
                                supplierName={selectedSupplier?.name || creditorName.trim() || 'Factura'}
                                onConfirm={handleConfirmScannedItems}
                                onRescan={() => setInvoiceView('form')}
                            />
                        </div>
                    )}

                    {inventoryTab === 'register' && (
                        <>
                            <div className="p-8">
                                <div className="space-y-6">
                                    {/* Botón Escanear factura con IA */}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.currentTarget.blur();
                                            handleOpenInvoiceScan();
                                        }}
                                        onMouseEnter={preloadInvoiceScanScreen}
                                        className={`group w-full flex items-center justify-between p-4 rounded-3xl border transition-all active:scale-[0.98] ${
                                            !isOnline
                                                ? 'cursor-not-allowed border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 opacity-60'
                                                : 'border-indigo-100 dark:border-indigo-900/40 bg-gradient-to-br from-indigo-50/70 via-purple-50/30 to-indigo-100/40 dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-indigo-900/20 hover:border-indigo-400 dark:hover:border-indigo-600 hover:shadow-lg hover:shadow-indigo-500/10 active:border-indigo-100 dark:active:border-indigo-900/40'
                                        }`}
                                        aria-label="Escanear factura con IA"
                                        tabIndex={0}
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            <div className="size-12 rounded-2xl bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs">
                                                <InvoiceScanAnimatedIcon size={24} muted={!isOnline} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h4 className={`text-sm font-black uppercase tracking-wider ${!isOnline ? 'text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                                                        Escanear factura
                                                    </h4>
                                                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-white ${
                                                        !isOnline ? 'bg-gray-300 dark:bg-gray-700' : 'bg-gradient-to-r from-[#4285F4] via-[#9B72CB] to-[#D96570]'
                                                    }`}>
                                                        <span className="material-symbols-outlined text-[11px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                                                            auto_awesome
                                                        </span>
                                                        IA
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="size-8 rounded-full bg-white dark:bg-gray-800 group-hover:bg-indigo-600 group-hover:text-white text-gray-400 flex items-center justify-center transition-all shrink-0 ml-2 border border-indigo-100 dark:border-indigo-900/50">
                                            <span className="material-symbols-outlined text-lg group-hover:translate-x-0.5 transition-transform">
                                                arrow_forward
                                            </span>
                                        </div>
                                    </button>

                                    {/* Separador Manualmente */}
                                    <div className="relative flex items-center py-1">
                                        <div className="grow border-t border-gray-200 dark:border-gray-700" />
                                        <span className="shrink-0 px-3 text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">
                                            Manualmente
                                        </span>
                                        <div className="grow border-t border-gray-200 dark:border-gray-700" />
                                    </div>

                                    {/* Fecha de la compra */}
                                    <div className="flex items-center justify-between h-11 px-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[18px] text-gray-400">calendar_month</span>
                                            <span className={`text-sm font-bold ${expenseDate !== getLocalDateValue() ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'}`}>
                                                {formatExpenseDateLabel(expenseDate)}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleOpenDatePicker}
                                            className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                        >
                                            Elegir
                                        </button>
                                        <input
                                            ref={dateInputRef}
                                            type="date"
                                            value={expenseDate}
                                            max={getLocalDateValue()}
                                            onChange={e => setExpenseDate(e.target.value)}
                                            className="absolute opacity-0 size-0 pointer-events-none"
                                            tabIndex={-1}
                                        />
                                    </div>

                                    {/* 1. Tipo de Compra */}
                                    <div>
                                        <label className="block text-[10px] font-black text-gray-600 dark:text-gray-400 mb-3 uppercase tracking-[0.12em]">Tipo de Compra</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                type="button"
                                                onClick={() => setIsCredit(false)}
                                                className={`flex items-center justify-center py-4 rounded-2xl border transition-all active:scale-[0.97] ${isCredit === false ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-500 shadow-lg shadow-emerald-500/10' : 'bg-white dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
                                            >
                                                <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${isCredit === false ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-400'}`}>Contado</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIsCredit(true)}
                                                className={`flex items-center justify-center py-4 rounded-2xl border transition-all active:scale-[0.97] ${isCredit === true ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-500 shadow-lg shadow-blue-500/10' : 'bg-white dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}
                                            >
                                                <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${isCredit === true ? 'text-blue-700 dark:text-blue-300' : 'text-gray-400'}`}>Crédito</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* 2. Proveedor y Fecha (Crédito) */}
                                    {isCredit !== null && (
                                        <div className="space-y-4">
                                            {/* Proveedor */}
                                            <div>
                                                <label htmlFor="inv-purchase-supplier" className="block text-[10px] font-black text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-[0.12em]">
                                                    Proveedor <span className="text-status-error">*</span>
                                                </label>
                                                <div className="flex items-center gap-2">
                                                    <div className="relative flex-1 min-w-0">
                                                        {selectedSupplier ? (
                                                            <div className="w-full min-w-0 h-12 flex items-center justify-between gap-2 px-3 bg-blue-50/70 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700/60 rounded-2xl transition-all shadow-2xs">
                                                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                                                    <span className="material-symbols-outlined text-[18px] text-blue-600 dark:text-blue-400 shrink-0 max-[430px]:hidden" aria-hidden="true">local_shipping</span>
                                                                    <span className="text-[13px] font-bold text-blue-900 dark:text-blue-100 truncate min-w-0" title={selectedSupplier.name}>{selectedSupplier.name}</span>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setSelectedSupplier(null);
                                                                        setCreditorName('');
                                                                        setTimeout(() => setShowCreditorList(true), 0);
                                                                    }}
                                                                    className="size-6 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 active:scale-90 transition-all shrink-0"
                                                                    aria-label="Quitar proveedor"
                                                                    tabIndex={0}
                                                                >
                                                                    <span className="material-symbols-outlined text-[16px]">close</span>
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <input
                                                                    id="inv-purchase-supplier"
                                                                    value={creditorName}
                                                                    onChange={e => {
                                                                        setCreditorName(e.target.value);
                                                                        setSelectedSupplier(null);
                                                                        setShowCreditorList(true);
                                                                    }}
                                                                    onFocus={() => setShowCreditorList(true)}
                                                                    onBlur={() => setTimeout(() => setShowCreditorList(false), 150)}
                                                                    className="w-full h-12 pl-4 pr-12 bg-surface-light dark:bg-gray-800/30 border border-border-light dark:border-border-dark rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-text-main dark:text-white font-bold text-sm"
                                                                    placeholder="Buscar proveedor..."
                                                                />
                                                                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">search</span>
                                                                {showCreditorList && (creditorName.trim() ? filteredSuppliers : suppliers).length > 0 && (
                                                                    <div className="absolute top-full left-0 right-0 max-[430px]:-left-6 max-[430px]:right-auto max-[430px]:w-[calc(100vw-1rem)] mt-2 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.12)] dark:shadow-[0_10px_40px_rgba(0,0,0,0.4)] z-50 max-h-64 overflow-hidden p-1.5 animate-[fadeIn_0.2s_ease-out]">
                                                                        <div className="overflow-y-auto max-h-[240px] custom-scrollbar space-y-0.5">
                                                                            {(creditorName.trim() ? filteredSuppliers : suppliers).slice(0, 8).map((supplier) => (
                                                                                <button
                                                                                    key={supplier.id}
                                                                                    type="button"
                                                                                    onMouseDown={(e) => e.preventDefault()}
                                                                                    onClick={() => { setCreditorName(supplier.name); setSelectedSupplier(supplier); setShowCreditorList(false); }}
                                                                                    className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/20 text-left transition-all group"
                                                                                >
                                                                                    {/* Avatar del proveedor */}
                                                                                    <div
                                                                                        className="size-9 rounded-xl flex items-center justify-center text-sm font-black text-white shadow-sm shrink-0 border border-white/10"
                                                                                        style={{ backgroundColor: supplier.color || '#6366f1' }}
                                                                                    >
                                                                                        {supplier.name.charAt(0).toUpperCase()}
                                                                                    </div>

                                                                                    {/* Info del proveedor */}
                                                                                    <div className="flex-1 min-w-0">
                                                                                        <p className="text-[13px] font-bold text-gray-800 dark:text-gray-100 truncate group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors">
                                                                                            {supplier.name}
                                                                                        </p>
                                                                                        {supplier.nit && (
                                                                                            <div className="flex items-center gap-1 mt-0.5">
                                                                                                <span className="text-[9px] font-black uppercase tracking-widest text-gray-400 bg-gray-50 dark:bg-gray-800 px-1.5 py-0.5 rounded border border-gray-100 dark:border-gray-700">NIT</span>
                                                                                                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">{supplier.nit}</span>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>

                                                                                    {/* Indicador visual */}
                                                                                    <span className="material-symbols-outlined text-[16px] text-blue-500 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">arrow_forward</span>
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={openNewSupplierSheet}
                                                        className="h-12 px-3 max-[430px]:w-12 max-[430px]:px-0 flex items-center justify-center gap-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/50 rounded-2xl transition-colors border border-dashed border-gray-300 dark:border-gray-700 shrink-0"
                                                        aria-label="Crear proveedor"
                                                        tabIndex={0}
                                                    >
                                                        <span className="material-symbols-outlined text-lg">person_add</span>
                                                        <span className="text-[10px] font-black uppercase tracking-wider max-[430px]:hidden">Crear</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Fecha de Pago (Aplica solo para Crédito) */}
                                            {isCredit && (
                                                <div className="animate-[fadeIn_0.2s_ease-out]">
                                                    <label htmlFor="inv-purchase-due-date" className="block text-[10px] font-black text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-[0.12em]">
                                                        Fecha de Pago <span className="text-status-error">*</span>
                                                    </label>
                                                    <div className="relative">
                                                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-[18px] pointer-events-none">event</span>
                                                        <input
                                                            id="inv-purchase-due-date"
                                                            type="date"
                                                            value={dueDate}
                                                            min={getLocalDateValue()}
                                                            onChange={e => setDueDate(e.target.value)}
                                                            className="w-full h-12 pl-11 pr-4 bg-surface-light dark:bg-gray-800/30 border border-border-light dark:border-border-dark rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-text-main dark:text-white font-bold text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* 3. Productos */}
                                    {isCredit !== null && creditorName.trim() && (
                                        <>
                                            <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-[0.12em]">Productos comprados</label>
                                                    {inventoryItems.length > 0 && (
                                                        <button type="button" onClick={() => setInventoryItems([])} className="text-[10px] font-bold text-red-400 hover:text-red-500 transition-colors">Limpiar</button>
                                                    )}
                                                </div>
                                                {/* Controles de Selección y Escaneo (Grid Moderna) */}
                                                <div className="flex flex-col gap-2.5">
                                                    {/* Botón de búsqueda manual */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowProductSelector(true)}
                                                        className="w-full flex items-center gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-2xl hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all group active:scale-[0.98]"
                                                    >
                                                        <div className="size-10 rounded-xl bg-gray-50 dark:bg-gray-700/80 flex items-center justify-center shrink-0 border border-gray-200 dark:border-gray-600 group-hover:bg-gray-100 dark:group-hover:bg-gray-600 transition-colors">
                                                            <span className="material-symbols-outlined text-[20px] text-gray-500 dark:text-gray-400">search</span>
                                                        </div>
                                                        <div className="flex-1 text-left">
                                                            <h3 className="text-sm font-semibold text-gray-800 dark:text-white leading-tight">
                                                                {inventoryItems.length > 0
                                                                    ? `${inventoryItems.length} ${inventoryItems.length === 1 ? 'añadido' : 'añadidos'} al carrito`
                                                                    : 'Buscar en catálogo'}
                                                            </h3>
                                                            <p className="text-[11px] text-gray-400 mt-0.5">Añadir productos manualmente</p>
                                                        </div>
                                                        <span className="material-symbols-outlined text-[20px] text-gray-400 dark:text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-200 transition-colors mr-1">chevron_right</span>
                                                    </button>

                                                    {/* Scanner e IA Modalidades */}
                                                    {selectedSupplier && (
                                                        <div className="flex flex-col gap-2.5">
                                                            <input
                                                                ref={cameraScanInputRef}
                                                                type="file"
                                                                accept="image/*"
                                                                capture="environment"
                                                                className="hidden"
                                                                onChange={e => {
                                                                    if (!e.target.files?.length) return;
                                                                    const f = new File([e.target.files[0]], e.target.files[0].name, { type: e.target.files[0].type });
                                                                    e.target.value = '';
                                                                    handleScanInvoice(f);
                                                                }}
                                                            />
                                                            <input
                                                                ref={galleryScanInputRef}
                                                                type="file"
                                                                accept="image/*"
                                                                className="hidden"
                                                                onChange={e => {
                                                                    if (!e.target.files?.length) return;
                                                                    const f = new File([e.target.files[0]], e.target.files[0].name, { type: e.target.files[0].type });
                                                                    e.target.value = '';
                                                                    handleScanInvoice(f);
                                                                }}
                                                            />

                                                            {/* Escanear factura (oculto temporalmente) */}
                                                        </div>
                                                    )}
                                                </div>

                                                {inventoryItems.length > 0 && (
                                                    <div className="mt-3 space-y-1.5">
                                                        {inventoryItems.map((item) => {
                                                            const total = getItemTotal(item);
                                                            return (
                                                                <div
                                                                    key={item.product.id}
                                                                    onClick={() => setBarcodeScanProduct(item.product)}
                                                                    role="button"
                                                                    tabIndex={0}
                                                                    className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer transition-colors"
                                                                >
                                                                    <div className="size-7 rounded-md bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0">
                                                                        {item.product.image_url ? (
                                                                            <img src={item.product.image_url} alt="" className="size-full object-cover" crossOrigin="anonymous" />
                                                                        ) : (
                                                                            <div className="size-full flex items-center justify-center">
                                                                                <span className="material-symbols-outlined text-gray-300 text-xs">inventory_2</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300 flex-1 truncate">{item.product.name}</span>
                                                                    <span className="text-[10px] text-gray-400">{item.quantity || 0} x ${formatCurrency(parseFloat(item.unitCost || '0'))}</span>
                                                                    <span className="text-xs font-bold text-text-main dark:text-white">${formatCurrency(total)}</span>
                                                                </div>
                                                            );
                                                        })}
                                                        <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-700">
                                                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Total Compra</span>
                                                            <span className="text-lg font-black text-text-main dark:text-white">${formatCurrency(inventoryCartTotal)}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* 4. Abono (solo crédito) */}
                                            {isCredit && inventoryItems.length > 0 && inventoryCartTotal > 0 && (
                                                <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                                                    <label htmlFor="inv-purchase-initial-payment" className="block text-[10px] font-black text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-[0.12em]">Abono (opcional)</label>
                                                    <div className="relative mb-3">
                                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
                                                        <input
                                                            id="inv-purchase-initial-payment"
                                                            type="text"
                                                            inputMode="numeric"
                                                            value={formatWithThousands(inventoryPaidAmount)}
                                                            onChange={e => setInventoryPaidAmount(parseCleanNumber(e.target.value))}
                                                            className="w-full h-11 pl-7 pr-4 bg-surface-light dark:bg-gray-800/30 border border-border-light dark:border-border-dark rounded-2xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-text-main dark:text-white font-bold text-sm"
                                                            placeholder="0"
                                                        />
                                                    </div>
                                                    {(parseFloat(inventoryPaidAmount) || 0) > 0 && activeShift && (
                                                        <div className="mb-3">
                                                            <label className="block text-[8px] font-black text-gray-500 mb-1 uppercase tracking-[0.12em]">Sale de Caja: Medio de Pago</label>
                                                            <div className="grid grid-cols-3 gap-2">
                                                                {(activeShift ? businessPaymentMethods.filter(m => m.mappedId === 'cash') : businessPaymentMethods).map(m => (
                                                                    <button
                                                                        key={m.id}
                                                                        type="button"
                                                                        onClick={() => setInventoryCreditPaymentMethod(m.id)}
                                                                        className={`py-2 px-1 rounded-xl border text-[10px] font-bold transition-all truncate ${inventoryCreditPaymentMethod === m.id
                                                                            ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 scale-[1.02] shadow-sm'
                                                                            : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'
                                                                            }`}
                                                                    >
                                                                        {m.label}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {(parseFloat(inventoryPaidAmount) || 0) > 0 && (
                                                        <div className="flex justify-between items-center mt-2 text-xs">
                                                            <span className="text-gray-400">Saldo pendiente</span>
                                                            <span className="font-bold text-red-500">${formatCurrency(inventoryCartTotal - (parseFloat(inventoryPaidAmount) || 0))}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* 5. Payment section (contado + caja) */}
                                            {!isCredit && activeShift && inventoryItems.length > 0 && (
                                                <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                                                    <div className="mb-4">
                                                        <label className="block text-[10px] font-black text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-[0.12em]">¿El dinero sale de caja?</label>
                                                        <div className="flex bg-gray-100 dark:bg-gray-800 p-1.5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-inner w-fit">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setDeductFromCashRegister(true);
                                                                    setPayments(prev => {
                                                                        const method = prev[0]?.method || businessPaymentMethods[0]?.id || 'cash';
                                                                        return [{ method, amount: inventoryCartTotal > 0 ? String(inventoryCartTotal) : '' }];
                                                                    });
                                                                }}
                                                                className={`px-6 py-2 text-[10px] font-black tracking-widest uppercase rounded-xl transition-all flex items-center justify-center gap-1 ${deductFromCashRegister ? 'bg-white dark:bg-gray-700 text-green-600 dark:text-green-400 shadow-md scale-[1.02]' : 'text-gray-400'}`}
                                                            >
                                                                <span className="material-symbols-outlined text-sm">check</span> Sí
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setDeductFromCashRegister(false)}
                                                                className={`px-6 py-2 text-[10px] font-black tracking-widest uppercase rounded-xl transition-all flex items-center justify-center gap-1 ${deductFromCashRegister === false ? 'bg-white dark:bg-gray-700 text-red-500 shadow-md scale-[1.02]' : 'text-gray-400'}`}
                                                            >
                                                                <span className="material-symbols-outlined text-sm">close</span> No
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {deductFromCashRegister && (
                                                        <>
                                                            <div className="flex items-center justify-between mb-3">
                                                                <label className="block text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-[0.12em]">MÉTODO DE PAGO</label>
                                                                <span className="text-[10px] font-bold text-status-success flex items-center gap-1">
                                                                    <span className="material-symbols-outlined text-[14px]">account_balance_wallet</span>
                                                                    Caja Abierta
                                                                </span>
                                                            </div>
                                                            <div className="space-y-2">
                                                                {payments.map((payment, index) => (
                                                                    <div key={`payment-${index}`} className="flex flex-col gap-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <select
                                                                                value={payment.method}
                                                                                onChange={e => updatePayment(index, 'method', e.target.value)}
                                                                                className="flex-1 h-10 px-3 bg-white dark:bg-gray-800/30 border border-gray-300 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-primary"
                                                                            >
                                                                                {businessPaymentMethods.map(m => (
                                                                                    <option key={m.id} value={m.id}>{m.label}</option>
                                                                                ))}
                                                                            </select>
                                                                            <div className="relative flex-1">
                                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
                                                                                <input
                                                                                    ref={index === 0 ? firstPaymentInputRef : undefined}
                                                                                    type="text"
                                                                                    inputMode="numeric"
                                                                                    value={formatWithThousands(payment.amount)}
                                                                                    onChange={e => updatePayment(index, 'amount', parseCleanNumber(e.target.value))}
                                                                                    onFocus={e => e.target.select()}
                                                                                    placeholder=""
                                                                                    className="w-full h-10 pl-7 pr-3 bg-white dark:bg-gray-800/30 border border-gray-300 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 selection:bg-blue-600 selection:text-white"
                                                                                />
                                                                            </div>
                                                                            {payments.length > 1 && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => removePayment(index)}
                                                                                    className="size-10 flex items-center justify-center text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                                                                                >
                                                                                    <span className="material-symbols-outlined text-xl">delete</span>
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                        {(() => {
                                                                            const methodInfo = businessPaymentMethods.find(m => m.id === payment.method);
                                                                            if (!methodInfo) return null;
                                                                            if (methodInfo.mappedId !== 'cash') {
                                                                                return (
                                                                                    <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 ml-1">
                                                                                        Fondos externos (no descuenta del turno de caja)
                                                                                    </p>
                                                                                );
                                                                            }
                                                                            const parsedAmount = parseFloat(payment.amount) || 0;
                                                                            const isInsufficient = parsedAmount > methodInfo.balance;
                                                                            return (
                                                                                <p className={`text-[10px] font-bold ml-1 ${isInsufficient ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
                                                                                    Disponible en caja: ${formatCurrency(methodInfo.balance)}
                                                                                </p>
                                                                            );
                                                                        })()}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            {payments.length < businessPaymentMethods.length && (
                                                                <button
                                                                    type="button"
                                                                    onClick={addPaymentMethod}
                                                                    className="mt-2 w-full py-2 text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center justify-center gap-1.5 hover:bg-gray-100 dark:hover:bg-gray-800/30 rounded-xl transition-colors border border-dashed border-gray-200 dark:border-gray-700"
                                                                >
                                                                    <span className="material-symbols-outlined text-base">add_circle</span>
                                                                    Agregar método
                                                                </button>
                                                            )}
                                                            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
                                                                <span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">Total Pagado</span>
                                                                <span className="text-lg font-black text-gray-800 dark:text-white">${formatCurrency(totalPayments)}</span>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}

                                            {!isCredit && !activeShift && inventoryItems.length > 0 && (
                                                <p className="text-[9px] text-gray-400 text-center">Sin caja abierta - no afecta movimientos</p>
                                            )}

                                            {inventoryItems.length > 0 && (
                                                <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                                                    <EvidenceUploader
                                                        previewUrl={evidenceUpload.previewUrl}
                                                        uploading={evidenceUpload.uploading}
                                                        statusText={evidenceUpload.statusText}
                                                        showCropper={evidenceUpload.showCropper}
                                                        cropperImageSrc={evidenceUpload.cropperImageSrc}
                                                        onCropComplete={evidenceUpload.onCropComplete}
                                                        onCropCancel={evidenceUpload.onCropCancel}
                                                        showInAppCamera={evidenceUpload.showInAppCamera}
                                                        onCameraCapture={evidenceUpload.onCameraCapture}
                                                        onCameraClose={evidenceUpload.onCameraClose}
                                                        triggerCamera={evidenceUpload.triggerCamera}
                                                        triggerGallery={evidenceUpload.triggerGallery}
                                                        deleteImage={evidenceUpload.deleteImage}
                                                    />
                                                </div>
                                            )}

                                            {inventoryItems.length > 0 && (
                                                <button
                                                    onClick={handleSave}
                                                    type="button"
                                                    disabled={
                                                        inventoryItems.some(i => (parseFloat(i.quantity) || 0) <= 0 || (parseFloat(i.unitCost) || 0) <= 0) ||
                                                        !creditorName.trim() ||
                                                        (isCredit === true && !dueDate) ||
                                                        (isCredit && (parseFloat(inventoryPaidAmount) || 0) > 0 && activeShift && !inventoryCreditPaymentMethod) ||
                                                        (!isCredit && activeShift && deductFromCashRegister === null) ||
                                                        (!isCredit && activeShift && deductFromCashRegister && totalPayments > inventoryCartTotal) ||
                                                        isSubmitting
                                                    }
                                                    className="w-full h-14 font-black flex justify-center items-center text-xs uppercase tracking-[0.2em] rounded-[22px] shadow-xl mt-2 active:scale-[0.98] transition-all bg-gray-900 hover:bg-black text-white dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isSubmitting ? (
                                                        <><svg className="animate-spin -ml-1 mr-3 size-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Registrando...</>
                                                    ) : (
                                                        <>Registrar {inventoryItems.length} {inventoryItems.length === 1 ? 'Producto' : 'Productos'}</>
                                                    )}
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {inventoryTab === 'history' && (
                        <div className="px-8 py-6 flex-1 flex flex-col overflow-hidden min-h-0">
                            {inventoryPurchases.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 gap-3">
                                    <span className="material-symbols-outlined text-4xl text-gray-300">inventory_2</span>
                                    <p className="text-sm text-gray-400 font-bold">Sin compras registradas</p>
                                </div>
                            ) : (
                                <div
                                    onScroll={handleHistoryScroll}
                                    className="flex-1 overflow-y-auto space-y-2 -mx-2 px-2 min-h-0"
                                >
                                    {inventoryPurchases.map(debt => {
                                        const desc = debt.description || '';
                                        let productName = desc || 'Compra';
                                        let productQty: string | null = null;
                                        let ocrUnitBadge: string | null = null;

                                        // Regex flexible: captura nombre y cantidad aunque haya campos extra al final
                                        const productMatch = desc.match(/^Compra (?:a crédito|de contado): (.+?) \(([^)]+)\)/);
                                        const adjustMatch = desc.match(/^(.+) \(([^)]+)\) - Ajuste de inventario/);

                                        if (productMatch) {
                                            productName = productMatch[1].trim();
                                            productQty = productMatch[2];
                                        } else if (adjustMatch) {
                                            productName = adjustMatch[1].trim();
                                            productQty = adjustMatch[2];
                                        }

                                        // Fallback para registros con formato antiguo (sin número en descripción):
                                        // usa productId del lote para encontrar nombre y unidad reales en el catálogo
                                        if (productQty && !/^\d/.test(productQty) && debt.inventory_lot_id) {
                                            const lotData = lotDataMap.get(debt.inventory_lot_id);
                                            if (lotData) {
                                                const catalogProduct = products.find(p => p.id === lotData.productId);
                                                if (catalogProduct) {
                                                    productName = catalogProduct.name;
                                                    productQty = `${lotData.qty} ${catalogProduct.unit}`;
                                                } else {
                                                    productQty = `${lotData.qty} ${productQty}`;
                                                }
                                            }
                                        }

                                        // Extrae original_ocr_unit si existe
                                        const ocrUnitMatch = desc.match(/original_ocr_unit:\s*(\S+)/);
                                        if (ocrUnitMatch) ocrUnitBadge = ocrUnitMatch[1];

                                        const isCashPurchase = debt.status === 'paid' && debt.paid_amount >= debt.total_amount && desc.startsWith('Compra de contado');

                                        return (
                                            <div key={debt.id} className="bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded-xl p-3 transition-all hover:shadow-sm">
                                                {editingInventoryDebt === debt.id ? (
                                                    <div className="space-y-3">
                                                        <div className="flex gap-2">
                                                            <div className="w-20">
                                                                <label htmlFor={`edit-inv-qty-${debt.id}`} className="block text-[9px] font-black text-gray-400 mb-1 uppercase">Cant.</label>
                                                                <input
                                                                    id={`edit-inv-qty-${debt.id}`}
                                                                    type="text"
                                                                    inputMode="numeric"
                                                                    value={editInventoryQty}
                                                                    onChange={e => setEditInventoryQty(e.target.value.replace(/[^0-9]/g, ''))}
                                                                    className="w-full h-9 px-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-black text-center outline-none focus:border-primary"
                                                                />
                                                            </div>
                                                            <div className="flex-1">
                                                                <label htmlFor={`edit-inv-cost-${debt.id}`} className="block text-[9px] font-black text-gray-400 mb-1 uppercase">Costo Total</label>
                                                                <div className="relative">
                                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-sm">$</span>
                                                                    <input
                                                                        id={`edit-inv-cost-${debt.id}`}
                                                                        type="text"
                                                                        inputMode="numeric"
                                                                        value={formatWithThousands(editInventoryCost)}
                                                                        onChange={e => setEditInventoryCost(parseCleanNumber(e.target.value))}
                                                                        className="w-full h-9 pl-7 pr-3 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-black outline-none focus:border-primary"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => setEditingInventoryDebt(null)}
                                                                className="flex-1 h-8 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-xs font-bold"
                                                            >Cancelar</button>
                                                            <button
                                                                onClick={handleSaveEditInventory}
                                                                className="flex-1 h-8 bg-primary text-[#102218] rounded-lg text-xs font-bold"
                                                            >Guardar</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <div className="flex items-start justify-between gap-2 mb-1.5">
                                                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                                                <span className="text-sm font-bold text-text-main dark:text-white">{productName}</span>
                                                                {debt.creditor_name === 'Ajuste de inventario' ? (
                                                                    <span className="text-[9px] px-2 py-0.5 rounded-full font-black uppercase shrink-0 bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                                                        Sobrante
                                                                    </span>
                                                                ) : (
                                                                    <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase shrink-0 ${isCashPurchase
                                                                        ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                                                                        : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                                                                        }`}>
                                                                        {isCashPurchase ? 'Contado' : 'Crédito'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                <button
                                                                    onClick={() => handleOpenEditInventory(debt)}
                                                                    className="size-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-blue-500 transition-colors"
                                                                    aria-label="Editar compra"
                                                                    tabIndex={0}
                                                                >
                                                                    <span className="material-symbols-outlined text-[18px]">edit</span>
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteInventoryPurchase(debt)}
                                                                    className="size-8 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                                                                    aria-label="Eliminar compra"
                                                                    tabIndex={0}
                                                                >
                                                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2.5 flex-wrap mt-1">
                                                            <span className="text-[15px] font-black text-text-main dark:text-white tracking-tight">${formatWithThousands(String(Math.round(debt.total_amount)))}</span>
                                                            {productQty && (
                                                                <span className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-lg text-xs font-bold flex items-center gap-1 border border-gray-200 dark:border-gray-700">
                                                                    {productQty}
                                                                </span>
                                                            )}
                                                            <span className="text-gray-300 dark:text-gray-600">·</span>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold">{formatInventoryDate(debt.created_at)}</p>
                                                            <span className="text-gray-300 dark:text-gray-600">·</span>
                                                            <div className="flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-[14px] text-gray-400">store</span>
                                                                <p className="text-xs text-gray-600 dark:text-gray-400 font-bold truncate max-w-[150px]">{debt.creditor_name}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {loadingMoreInventory && (
                                        <div className="py-3 flex items-center justify-center gap-2 text-gray-400 text-xs font-bold">
                                            <div className="size-4 border-2 border-layout-dark dark:border-primary border-t-transparent rounded-full animate-spin" />
                                            <span>Cargando más compras...</span>
                                        </div>
                                    )}

                                    {hasMoreInventory && !loadingMoreInventory && (
                                        <div className="py-2 text-center">
                                            <button
                                                type="button"
                                                onClick={loadMoreInventory}
                                                className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 text-xs font-bold text-gray-600 dark:text-gray-300 rounded-lg transition-all inline-flex items-center gap-1"
                                            >
                                                <span className="material-symbols-outlined text-sm">expand_more</span>
                                                Cargar 10 más
                                            </button>
                                        </div>
                                    )}

                                    {!hasMoreInventory && allInventoryPurchases.length > 10 && (
                                        <div className="py-3 text-center text-[11px] font-semibold text-gray-400 dark:text-gray-500">
                                            Fin del historial
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Product Selector Fullscreen */}
                {showProductSelector && (
                    <div className="absolute inset-0 z-30 bg-surface-light dark:bg-surface-dark flex flex-col animate-[slideInRight_0.25s_ease-out]">
                        <div className="flex items-center gap-3 px-4 pt-5 pb-3 shrink-0">
                            <button
                                type="button"
                                onClick={() => setShowProductSelector(false)}
                                className="size-9 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center transition-colors"
                                aria-label="Volver"
                                tabIndex={0}
                            >
                                <span className="material-symbols-outlined text-xl text-text-main dark:text-white">arrow_back</span>
                            </button>
                            <h3 className="text-sm font-semibold text-text-main dark:text-white flex-1">Seleccionar productos</h3>
                            {inventoryItems.length > 0 && (
                                <>
                                    <button type="button" onClick={() => setInventoryItems([])} className="text-[10px] font-bold text-red-400 hover:text-red-500 transition-colors">
                                        Limpiar
                                    </button>
                                    <span className="text-xs font-black text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                                        {inventoryItems.length}
                                    </span>
                                </>
                            )}
                        </div>

                        <div className="px-4 pb-3 shrink-0 flex items-center gap-2">
                            <div className="relative flex-1">
                                <input
                                    value={invProductSearch}
                                    onChange={e => setInvProductSearch(e.target.value)}
                                    data-barcode-passthrough="true"
                                    className="w-full h-10 pl-10 pr-4 bg-gray-50 dark:bg-gray-800/30 border border-border-light dark:border-border-dark rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-text-main dark:text-white font-medium text-sm"
                                    placeholder="Buscar por nombre..."
                                />
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
                                {invProductSearch && (
                                    <button type="button" onClick={() => setInvProductSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                        <span className="material-symbols-outlined text-lg">close</span>
                                    </button>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowCameraScanner(true)}
                                className="md:hidden size-10 shrink-0 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 flex items-center justify-center active:scale-95 transition-all shadow-2xs"
                                aria-label="Escanear código de barras"
                                tabIndex={0}
                            >
                                <span className="material-symbols-outlined text-[22px]">barcode_scanner</span>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-4 pb-24">
                            <div className="space-y-2">
                                {products
                                    .filter(p => p.type === 'simple')
                                    .filter(p => !invProductSearch.trim() || p.name.toLowerCase().includes(invProductSearch.toLowerCase()) || p.barcode?.toLowerCase().includes(invProductSearch.toLowerCase()))
                                    .map(product => {
                                        const cartIndex = inventoryItems.findIndex(i => i.product.id === product.id);
                                        const isInCart = cartIndex !== -1;
                                        const cartItem = isInCart ? inventoryItems[cartIndex] : null;
                                        const itemTotal = isInCart ? getItemTotal(cartItem!) : 0;

                                        return (
                                            <div
                                                key={product.id}
                                                onClick={() => setBarcodeScanProduct(product)}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setBarcodeScanProduct(product); }}
                                                className={`w-full rounded-2xl border transition-all p-3 flex items-center gap-3 text-left cursor-pointer active:scale-[0.99] ${
                                                    isInCart
                                                        ? 'border-primary/60 dark:border-primary/50 bg-amber-50/40 dark:bg-amber-950/15 shadow-2xs'
                                                        : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800/40 hover:border-gray-300 dark:hover:border-gray-700'
                                                }`}
                                            >
                                                {/* Imagen del producto */}
                                                <div className="size-12 rounded-xl bg-gray-100 dark:bg-gray-800 overflow-hidden shrink-0 border border-gray-200/70 dark:border-gray-700 flex items-center justify-center">
                                                    {product.image_url ? (
                                                        <img src={product.image_url} alt="" className="size-full object-cover" crossOrigin="anonymous" />
                                                    ) : (
                                                        <span className="material-symbols-outlined text-gray-400 text-2xl">inventory_2</span>
                                                    )}
                                                </div>

                                                {/* Info principal: Nombre, Unidad, Stock, PVP actual */}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate leading-tight">
                                                        {product.name}
                                                    </p>
                                                    <div className="flex items-center flex-wrap gap-1.5 mt-1 text-[11px] text-gray-400 font-medium">
                                                        <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-bold text-gray-600 dark:text-gray-300 text-[10px]">
                                                            {product.unit || 'Und'}
                                                        </span>
                                                        <span>·</span>
                                                        <span>Stock: <strong className="text-gray-700 dark:text-gray-200">{product.stock ?? 0}</strong></span>
                                                        {product.price > 0 && (
                                                            <>
                                                                <span>·</span>
                                                                <span className="text-gray-500 dark:text-gray-400 font-semibold">PVP: ${formatCurrency(product.price)}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Estado en carrito o botón de acción */}
                                                {isInCart ? (
                                                    <div className="shrink-0 text-right flex items-center gap-2">
                                                        <div>
                                                            <span className="block text-xs font-black text-amber-700 dark:text-amber-300">
                                                                {cartItem!.quantity} {product.unit || 'und'}
                                                            </span>
                                                            <span className="block text-[11px] font-bold text-gray-800 dark:text-gray-200">
                                                                ${formatCurrency(itemTotal)}
                                                            </span>
                                                            {cartItem?.newSalePrice && cartItem.newSalePrice !== product.price && (
                                                                <span className="block text-[9px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-tighter">
                                                                    Nuevo PVP: ${formatCurrency(cartItem.newSalePrice)}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="material-symbols-outlined text-gray-400 text-[18px]">edit</span>
                                                    </div>
                                                ) : (
                                                    <div className="shrink-0 text-gray-300 dark:text-gray-600 hover:text-primary transition-colors">
                                                        <span className="material-symbols-outlined text-2xl">add_circle</span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm border-t border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between">
                            <div>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">Total Compra</span>
                                <span className="text-lg font-black text-text-main dark:text-white">${formatCurrency(inventoryCartTotal)}</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowProductSelector(false)}
                                className="h-11 px-6 bg-primary text-[#102218] font-black text-xs uppercase tracking-widest rounded-xl active:scale-[0.97] transition-all shadow-lg shadow-primary/20"
                            >
                                Listo
                            </button>
                        </div>
                    </div>
                )}

                {/* Modal de edición / escáner de producto */}
                {barcodeScanProduct && (() => {
                    const currentCartItem = inventoryItems.find(i => i.product.id === barcodeScanProduct.id);
                    return (
                        <BarcodeInputModal
                            product={barcodeScanProduct}
                            previousCost={lastCosts[barcodeScanProduct.id] ?? barcodeScanProduct.cost}
                            initialQuantity={currentCartItem ? currentCartItem.quantity : '1'}
                            initialCost={currentCartItem ? currentCartItem.unitCost : (lastCosts[barcodeScanProduct.id] ?? barcodeScanProduct.cost)}
                            initialPrice={currentCartItem?.newSalePrice ?? barcodeScanProduct.price}
                            onConfirm={(qty, cost, newPrice) => {
                                const idx = inventoryItems.findIndex(i => i.product.id === barcodeScanProduct.id);
                                if (idx !== -1) {
                                    setInventoryItems(prev => {
                                        const next = [...prev];
                                        next[idx] = {
                                            ...next[idx],
                                            quantity: String(qty),
                                            unitCost: String(cost),
                                            newSalePrice: newPrice !== undefined ? newPrice : next[idx].newSalePrice,
                                        };
                                        return next;
                                    });
                                } else {
                                    setInventoryItems(prev => [{
                                        product: barcodeScanProduct,
                                        quantity: String(qty),
                                        measureUnit: 'UNIDADES',
                                        unitCost: String(cost),
                                        newSalePrice: newPrice ?? null,
                                    }, ...prev]);
                                }
                                setBarcodeScanProduct(null);
                            }}
                            onClose={() => setBarcodeScanProduct(null)}
                        />
                    );
                })()}

                {/* Camera barcode scanner (continuo, móvil) */}
                {showCameraScanner && (
                    <div className="fixed inset-0 z-[80] bg-black flex flex-col">
                        <div className="flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-sm shrink-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="material-symbols-outlined text-white text-xl">barcode_scanner</span>
                                <div className="min-w-0">
                                    <p className="text-white text-sm font-bold leading-tight">Escanear códigos</p>
                                    <p className="text-white/60 text-[10px]">{inventoryItems.length} producto{inventoryItems.length === 1 ? '' : 's'} en carrito</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowCameraScanner(false)}
                                className="h-9 px-4 bg-primary text-[#102218] font-black text-xs uppercase tracking-widest rounded-full active:scale-95 transition-all shadow-lg shadow-primary/20"
                            >
                                Listo
                            </button>
                        </div>
                        <div className="flex-1 relative">
                            <BarcodeScanner
                                ref={cameraScannerRef}
                                variant="embedded"
                                continuousMode
                                onClose={() => setShowCameraScanner(false)}
                                onScan={(code) => {
                                    if (barcodeScanProduct) return;
                                    const product = products.find(p => p.barcode && p.barcode.trim() === code.trim());
                                    if (product) {
                                        setBarcodeScanProduct(product);
                                    } else {
                                        cameraScannerRef.current?.playErrorBeep();
                                        showToast(`Código ${code} no encontrado en el catálogo`, 'error');
                                    }
                                }}
                            />
                        </div>
                        <div className="px-4 py-3 bg-black/60 backdrop-blur-sm shrink-0 text-center">
                            <p className="text-white/70 text-xs">
                                Apunta al código de barras. Cada escaneo te pedirá cantidad y costo.
                            </p>
                        </div>
                    </div>
                )}

                {inventoryBlockedMessage && (
                    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" role="button" tabIndex={-1} onClick={() => setInventoryBlockedMessage(null)} onKeyDown={(e) => e.key === 'Escape' && setInventoryBlockedMessage(null)} aria-label="Cerrar" />
                        <div className="relative bg-white dark:bg-surface-dark rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-gray-200 dark:border-gray-700">
                            <div className="text-center">
                                <div className="size-14 mx-auto rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-4">
                                    <span className="material-symbols-outlined text-3xl text-amber-600 dark:text-amber-400">block</span>
                                </div>
                                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">No se puede eliminar</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 whitespace-pre-line mb-6">{inventoryBlockedMessage}</p>
                                <button
                                    onClick={() => setInventoryBlockedMessage(null)}
                                    className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-sm"
                                >
                                    Entendido
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal Crear Proveedor — Bottom Sheet con swipe (Design System) */}
            {(showNewSupplierForm || isClosingSupplierSheet) && (
                <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center md:p-4 animate-[fadeIn_0.2s_ease-out]">
                    <div
                        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-250 ${isClosingSupplierSheet ? 'opacity-0' : ''}`}
                        style={{ opacity: isClosingSupplierSheet ? 0 : Math.max(0, 1 - supplierSwipeOffset / 400) }}
                        role="button"
                        tabIndex={-1}
                        onClick={closeNewSupplierSheet}
                        onKeyDown={(e) => e.key === 'Escape' && closeNewSupplierSheet()}
                        aria-label="Cerrar"
                    />
                    <div
                        ref={supplierPanelRef}
                        className={`relative bg-white dark:bg-surface-dark md:rounded-2xl rounded-t-3xl w-full max-w-md p-6 pt-3 md:pt-6 shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto ${!isDraggingSupplier ? 'transition-transform duration-250 ease-out' : ''} ${!isClosingSupplierSheet && supplierSwipeOffset === 0 && !isDraggingSupplier ? 'animate-slideUp md:animate-none' : ''}`}
                        style={{
                            transform: `translateY(${isClosingSupplierSheet ? '100%' : supplierSwipeOffset + 'px'})`,
                            touchAction: 'pan-y'
                        }}
                        onClick={e => e.stopPropagation()}
                        onTouchStart={e => {
                            supplierSwipeStartY.current = e.touches[0].clientY;
                            const el = supplierPanelRef.current;
                            startedAtTopSupplierRef.current = !el || el.scrollTop <= 0;
                        }}
                        onTouchEnd={() => {
                            supplierSwipeStartY.current = null;
                            if (isDraggingSupplierRef.current) {
                                isDraggingSupplierRef.current = false;
                                setIsDraggingSupplier(false);
                                if (supplierSwipeOffsetRef.current > 80) {
                                    closeNewSupplierSheet();
                                } else {
                                    supplierSwipeOffsetRef.current = 0;
                                    setSupplierSwipeOffset(0);
                                }
                            }
                        }}
                    >
                        {/* Drag handle visible en móvil */}
                        <div className="flex justify-center pb-2 cursor-grab md:hidden" aria-hidden="true">
                            <div className="w-12 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                        </div>
                        <div className="flex items-center gap-3 mb-5">
                            <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                <span className="material-symbols-outlined text-primary text-xl">person_add</span>
                            </div>
                            <div>
                                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Nuevo Proveedor</h3>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Solo el nombre es obligatorio</p>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="inv-new-supplier-name" className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-[0.12em]">Nombre *</label>
                                <input id="inv-new-supplier-name" type="text" value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)} className="w-full h-11 px-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" placeholder="Ej: Distribuidora ABC" />
                            </div>
                            <div>
                                <label htmlFor="inv-new-supplier-nit" className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-[0.12em]">NIT / Cédula</label>
                                <input id="inv-new-supplier-nit" type="text" value={newSupplierNit} onChange={e => setNewSupplierNit(e.target.value)} className="w-full h-11 px-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" placeholder="" />
                            </div>
                            <div>
                                <label htmlFor="inv-new-supplier-phone" className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-[0.12em]">Teléfono</label>
                                <input id="inv-new-supplier-phone" type="tel" value={newSupplierPhone} onChange={e => setNewSupplierPhone(e.target.value)} className="w-full h-11 px-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" placeholder="" />
                            </div>
                            <div>
                                <label htmlFor="inv-new-supplier-address" className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-[0.12em]">Dirección</label>
                                <input id="inv-new-supplier-address" type="text" value={newSupplierAddress} onChange={e => setNewSupplierAddress(e.target.value)} className="w-full h-11 px-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" placeholder="" />
                            </div>
                        </div>
                        <div className="flex gap-3 mt-5">
                            <button onClick={closeNewSupplierSheet} className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
                            <button
                                onClick={async () => {
                                    if (!newSupplierName.trim() || isCreatingSupplier) return;
                                    setIsCreatingSupplier(true);
                                    try {
                                        await createSupplier({ name: newSupplierName, nit: newSupplierNit, phone: newSupplierPhone, address: newSupplierAddress });
                                        setCreditorName(newSupplierName.trim());
                                        closeNewSupplierSheet();
                                    } catch (err: any) {
                                        console.error('Error creating supplier:', err);
                                        showToast(err.message || 'Error al crear proveedor', 'error');
                                    } finally {
                                        setIsCreatingSupplier(false);
                                    }
                                }}
                                disabled={!newSupplierName.trim() || isCreatingSupplier}
                                className="flex-1 py-3 bg-primary hover:bg-primary-hover text-[#102218] font-bold rounded-xl shadow-md shadow-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isCreatingSupplier ? (
                                    <><svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Creando...</>
                                ) : 'Crear'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de Origen de Imagen (Cámara o Galería) — Bottom Sheet con swipe */}
            {showImageSourceModal && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4 animate-[fadeIn_0.2s_ease-out]">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" role="button" tabIndex={-1} onClick={() => setShowImageSourceModal(false)} onKeyDown={(e) => e.key === 'Escape' && setShowImageSourceModal(false)} aria-label="Cerrar" />
                    <div
                        className="relative bg-white dark:bg-surface-dark rounded-t-3xl sm:rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700 animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)] sm:animate-[scaleIn_0.2s_ease-out]"
                        style={{ touchAction: 'none' }}
                        onTouchStart={(e) => {
                            const sheet = e.currentTarget;
                            const startY = e.touches[0].clientY;
                            sheet.dataset.dragStartY = String(startY);
                            sheet.dataset.dragging = 'false';
                            sheet.style.transition = 'none';
                        }}
                        onTouchMove={(e) => {
                            const sheet = e.currentTarget;
                            const startY = parseFloat(sheet.dataset.dragStartY || '0');
                            const currentY = e.touches[0].clientY;
                            const deltaY = currentY - startY;
                            if (deltaY > 0) {
                                sheet.dataset.dragging = 'true';
                                sheet.style.transform = `translateY(${deltaY}px)`;
                                const backdrop = sheet.previousElementSibling as HTMLElement;
                                if (backdrop) backdrop.style.opacity = String(Math.max(0, 1 - deltaY / 300));
                            }
                        }}
                        onTouchEnd={(e) => {
                            const sheet = e.currentTarget;
                            const startY = parseFloat(sheet.dataset.dragStartY || '0');
                            const endY = e.changedTouches[0].clientY;
                            const deltaY = endY - startY;
                            sheet.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
                            const backdrop = sheet.previousElementSibling as HTMLElement;
                            if (deltaY > 80) {
                                sheet.style.transform = 'translateY(100%)';
                                if (backdrop) backdrop.style.transition = 'opacity 0.3s ease';
                                if (backdrop) backdrop.style.opacity = '0';
                                setTimeout(() => setShowImageSourceModal(false), 280);
                            } else {
                                sheet.style.transform = 'translateY(0)';
                                if (backdrop) { backdrop.style.transition = 'opacity 0.2s ease'; backdrop.style.opacity = '1'; }
                            }
                        }}
                    >
                        {/* Drag handle */}
                        <div className="flex justify-center pt-3 pb-1 cursor-grab sm:hidden">
                            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                        </div>
                        <div className="p-6 pt-3 text-center border-b border-gray-100 dark:border-gray-800">
                            <div className="size-16 mx-auto rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center mb-4 text-indigo-600 dark:text-indigo-400">
                                <span className="material-symbols-outlined text-[32px]">linked_camera</span>
                            </div>
                            <h3 className="text-lg font-black text-gray-900 dark:text-white">Subir Factura</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Selecciona cómo deseas obtener la imagen</p>
                        </div>
                        <div className="p-4 space-y-3">
                            <button
                                onClick={() => {
                                    setShowImageSourceModal(false);
                                    setShowDocumentScanner(true);
                                }}
                                className="w-full h-14 flex items-center gap-4 px-6 rounded-2xl bg-gray-50 dark:bg-gray-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-gray-700 dark:text-gray-200 hover:text-indigo-600 dark:hover:text-indigo-400 border border-gray-200 dark:border-gray-700 transition-colors active:scale-95"
                            >
                                <span className="material-symbols-outlined text-[24px]">photo_camera</span>
                                <span className="font-bold text-sm">Tomar foto ahora</span>
                            </button>
                            <button
                                onClick={() => galleryScanInputRef.current?.click()}
                                className="w-full h-14 flex items-center gap-4 px-6 rounded-2xl bg-gray-50 dark:bg-gray-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-gray-700 dark:text-gray-200 hover:text-indigo-600 dark:hover:text-indigo-400 border border-gray-200 dark:border-gray-700 transition-colors active:scale-95"
                            >
                                <span className="material-symbols-outlined text-[24px]">photo_library</span>
                                <span className="font-bold text-sm">Subir desde galería</span>
                            </button>
                        </div>
                        <div className="p-4 pt-0 pb-6">
                            <button
                                onClick={() => setShowImageSourceModal(false)}
                                className="w-full h-12 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 font-bold text-sm transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showDocumentScanner && (
                <DocumentScanner
                    onCapture={(file) => {
                        setShowDocumentScanner(false);
                        handleScanInvoice(file);
                    }}
                    onCancel={() => setShowDocumentScanner(false)}
                />
            )}

            {/* Modal de Escaneo Unificado con IA directo a Compra de Inventario */}
            {showInvoiceScan && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[120]">
                    <React.Suspense fallback={
                        <div className="fixed inset-0 z-[120] bg-white/80 dark:bg-gray-900/80 backdrop-blur-xs flex items-center justify-center">
                            <div className="size-10 rounded-full border-4 border-indigo-200 dark:border-indigo-900/60 border-t-indigo-600 dark:border-t-indigo-400 animate-spin" />
                        </div>
                    }>
                        <InvoiceScanScreen
                            initialDestination="inventory"
                            onClose={() => setShowInvoiceScan(false)}
                        />
                    </React.Suspense>
                </div>,
                document.body
            )}

            {/* Modal de confirmación para eliminar compra con opción de reintegro a caja */}
            {deletingPurchaseDebt && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
                    <div className="bg-white dark:bg-surface-dark w-full max-w-sm rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col p-5 animate-[scaleIn_0.2s_ease-out]">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="size-10 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-[22px]">delete</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight">
                                    ¿Eliminar esta compra?
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                                    {deletingPurchaseDebt.description || deletingPurchaseDebt.creditor_name}
                                </p>
                            </div>
                        </div>

                        <p className="text-xs text-gray-600 dark:text-gray-300 mb-4 leading-relaxed">
                            Se revertirá el inventario de este producto y se eliminará el registro financiero correspondiente.
                        </p>

                        {activeShift && (
                            <div className="p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-200 dark:border-gray-700/60 mb-4 space-y-2.5">
                                <label className="flex items-center justify-between cursor-pointer">
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-green-600 dark:text-green-400 text-[18px]">add_circle</span>
                                        <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                                            ¿Reintegrar dinero a la caja?
                                        </span>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={shouldRefundCash}
                                        onChange={(e) => setShouldRefundCash(e.target.checked)}
                                        className="size-4.5 rounded text-green-600 focus:ring-green-500 cursor-pointer"
                                    />
                                </label>

                                {shouldRefundCash && (
                                    <div className="pt-2 border-t border-gray-200/60 dark:border-gray-700/60">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                                                Monto a reintegrar (Entrada):
                                            </span>
                                        </div>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold text-xs">$</span>
                                            <input
                                                type="number"
                                                min="0"
                                                step="any"
                                                value={refundAmount}
                                                onChange={(e) => setRefundAmount(e.target.value)}
                                                className="w-full h-9 pl-7 pr-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-xs font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
                                                placeholder="0"
                                            />
                                        </div>
                                        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                                            Aparecerá en caja como: <strong>Reintegro compra inventario</strong>
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setDeletingPurchaseDebt(null)}
                                disabled={isDeletingPurchase}
                                className="flex-1 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-xs font-bold text-gray-700 dark:text-gray-200 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmDeleteInventoryPurchase}
                                disabled={isDeletingPurchase}
                                className="flex-1 h-10 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold text-white shadow-sm transition-colors flex items-center justify-center gap-1.5"
                            >
                                {isDeletingPurchase ? (
                                    <>
                                        <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                                        Eliminando...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-[16px]">delete</span>
                                        Eliminar
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

        </div>
    );
};
