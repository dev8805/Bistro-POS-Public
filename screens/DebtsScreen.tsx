import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Screen } from '../types';
import { useDebts, BusinessDebt } from '../hooks/useDebts';
import { useSuppliers } from '../hooks/useSuppliers';
import { useImageUpload } from '../hooks/useImageUpload';
import { EvidenceUploader } from '../components/EvidenceUploader';
import { EvidenceViewer } from '../components/EvidenceViewer';
import { formatCurrency } from '../lib/formatters';
import { useToast } from '../context/ToastContext';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { useCashRegister } from '../hooks/useCashRegister';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { ScreenLoader } from '../components/ScreenLoader';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface DebtsScreenProps {
    onNavigate: (screen: Screen) => void;
    isOnline?: boolean;
}

interface CreditorGroup {
    id?: string;
    color?: string;
    name: string;
    type: 'supplier' | 'other';
    debts: BusinessDebt[];
    totalAmount: number;
    totalPaid: number;
    remaining: number;
    progress: number;
}

const parseSplitDetails = (debt: BusinessDebt) => {
    if (debt.payment_details && Array.isArray(debt.payment_details) && debt.payment_details.length > 0) {
        return debt.payment_details.map((item: any) => ({
            method: item.method || item.mapped_id || item.name || 'Efectivo',
            amount: Number(item.amount) || 0,
        }));
    }
    if (debt.description) {
        const match = debt.description.match(/\[Pago dividido:\s*([^\]]+)\]/i);
        if (match && match[1]) {
            const parts = match[1].split(',').map(p => p.trim());
            const parsed: Array<{ method: string; amount: number }> = [];
            for (const part of parts) {
                const sub = part.split(':');
                if (sub.length === 2) {
                    const method = sub[0].trim();
                    const amtStr = sub[1].replace(/[^0-9]/g, '');
                    const amount = Number(amtStr) || 0;
                    parsed.push({ method, amount });
                }
            }
            if (parsed.length > 0) return parsed;
        }
    }
    return null;
};

const normalizeMethodName = (name?: string | null): string => {
    if (!name || typeof name !== 'string') return 'Efectivo';
    const ml = name.toLowerCase().trim();
    if (ml === 'cash' || ml === 'efectivo') return 'Efectivo';
    if (ml === 'card' || ml === 'tarjeta') return 'Tarjeta';
    if (ml === 'nequi') return 'Nequi';
    if (ml === 'daviplata') return 'Daviplata';
    if (ml === 'transfer' || ml === 'transferencia') return 'Transferencia';
    return name.charAt(0).toUpperCase() + name.slice(1);
};

const formatPaymentMethod = (debt: BusinessDebt) => {
    let method = debt.payment_method;

    if (!method && debt.description?.includes('[Pago dividido:')) {
        method = 'Dividido';
    }

    if (!method) {
        const isPaymentRecord = debt.total_amount === 0 && debt.paid_amount > 0;
        const isCashPurchase = !isPaymentRecord && debt.status === 'paid' && debt.paid_amount >= debt.total_amount;
        if (isPaymentRecord || isCashPurchase) {
            method = 'Efectivo';
        }
    }

    if (!method) return null;

    const mLower = String(method).toLowerCase().trim();
    let label = method;

    if (mLower === 'dividido') {
        const splitDetails = parseSplitDetails(debt);
        if (splitDetails && splitDetails.length > 0) {
            const methodNames = splitDetails.map(d => normalizeMethodName(d.method));
            const uniqueMethods = Array.from(new Set(methodNames.filter(Boolean)));
            label = uniqueMethods.length > 0 ? uniqueMethods.join(' + ') : 'Dividido';
        } else {
            label = 'Dividido';
        }
    } else {
        label = normalizeMethodName(method);
    }

    return { label, raw: method };
};

export const DebtsScreen: React.FC<DebtsScreenProps> = ({ onNavigate, isOnline = true }) => {
    const { profile } = useAuth();
    const businessId = profile?.business_id;
    const { showToast } = useToast();
    const { confirmAction } = useConfirmDialog();
    const { debts, activeDebts, totalPending, loading, createDebt, addCreditorPayment, clearCreditorDebts, deleteCreditor, renameCreditor, deletePurchaseRecord, deletePaymentRecord, updatePurchaseRecord, updateDebtEvidence } = useDebts();
    const { suppliers, updateSupplier, createSupplier, deleteSupplier, fetchSuppliers } = useSuppliers();
    const { activeShift, recordPurchase, reverseCashMovement } = useCashRegister();
    const { paymentMethods } = useBusinessSettings();

    const [activeTab, setActiveTab] = useState<'payable' | 'directory'>('directory');
    const [showNewDebtModal, setShowNewDebtModal] = useState(false);
    const [selectedCreditor, setSelectedCreditor] = useState<CreditorGroup | null>(null);

    const MOVEMENTS_PAGE_SIZE = 10;
    const [creditorMovements, setCreditorMovements] = useState<BusinessDebt[]>([]);
    const [movementsLoading, setMovementsLoading] = useState(false);
    const [movementsLoadingMore, setMovementsLoadingMore] = useState(false);
    const [hasMoreMovements, setHasMoreMovements] = useState(false);
    const [totalMovementsCount, setTotalMovementsCount] = useState<number>(0);
    const isFetchingMovementsRef = useRef(false);

    const handleCloseCreditorDetail = () => {
        if (agingBucketOrigin) {
            setSelectedAgingBucket(agingBucketOrigin);
            setAgingBucketOrigin(null);
        }
        setSelectedCreditor(null);
        setCreditorMovements([]);
        setTotalMovementsCount(0);
        setHasMoreMovements(false);
    };

    const fetchInitialMovements = useCallback(async (creditorName: string) => {
        if (!businessId || !creditorName) return;
        setMovementsLoading(true);
        try {
            const { count } = await supabase
                .from('business_debts')
                .select('*', { count: 'exact', head: true })
                .eq('business_id', businessId)
                .eq('creditor_name', creditorName)
                .or('total_amount.gt.0,paid_amount.gt.0');

            const total = count ?? 0;
            setTotalMovementsCount(total);

            const { data, error } = await supabase
                .from('business_debts')
                .select('*, created_by_profile:profiles!business_debts_created_by_fkey(full_name)')
                .eq('business_id', businessId)
                .eq('creditor_name', creditorName)
                .or('total_amount.gt.0,paid_amount.gt.0')
                .order('created_at', { ascending: false })
                .range(0, MOVEMENTS_PAGE_SIZE - 1);

            if (error) throw error;
            const items = (data || []).map((row: any) => {
                const { created_by_profile, ...rest } = row;
                return { ...rest, created_by_name: created_by_profile?.full_name ?? null };
            });
            setCreditorMovements(items);
            setHasMoreMovements(items.length === MOVEMENTS_PAGE_SIZE && total > items.length);
        } catch (err) {
            console.error('Error fetching creditor movements:', err);
        } finally {
            setMovementsLoading(false);
        }
    }, [businessId]);

    const fetchMoreMovements = useCallback(async () => {
        if (!businessId || !selectedCreditor || movementsLoading || isFetchingMovementsRef.current || !hasMoreMovements) return;
        isFetchingMovementsRef.current = true;
        setMovementsLoadingMore(true);
        try {
            const from = creditorMovements.length;
            const to = from + MOVEMENTS_PAGE_SIZE - 1;

            const { data, error } = await supabase
                .from('business_debts')
                .select('*, created_by_profile:profiles!business_debts_created_by_fkey(full_name)')
                .eq('business_id', businessId)
                .eq('creditor_name', selectedCreditor.name)
                .or('total_amount.gt.0,paid_amount.gt.0')
                .order('created_at', { ascending: false })
                .range(from, to);

            if (error) throw error;
            const items = (data || []).map((row: any) => {
                const { created_by_profile, ...rest } = row;
                return { ...rest, created_by_name: created_by_profile?.full_name ?? null };
            });
            setCreditorMovements(prev => [...prev, ...items]);
            setHasMoreMovements(items.length === MOVEMENTS_PAGE_SIZE && totalMovementsCount > from + items.length);
        } catch (err) {
            console.error('Error fetching more creditor movements:', err);
        } finally {
            isFetchingMovementsRef.current = false;
            setMovementsLoadingMore(false);
        }
    }, [businessId, selectedCreditor, creditorMovements.length, movementsLoading, hasMoreMovements, totalMovementsCount]);

    const handleMovementsScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop <= clientHeight + 100 && hasMoreMovements && !movementsLoading && !movementsLoadingMore) {
            fetchMoreMovements();
        }
    }, [hasMoreMovements, movementsLoading, movementsLoadingMore, fetchMoreMovements]);

    useEffect(() => {
        if (selectedCreditor?.name) {
            fetchInitialMovements(selectedCreditor.name);
        } else {
            setCreditorMovements([]);
            setTotalMovementsCount(0);
            setHasMoreMovements(false);
        }
    }, [selectedCreditor?.name, debts, fetchInitialMovements]);

    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    // Tooltip State for Donut Chart
    const [hoveredSupplier, setHoveredSupplier] = useState<{ name: string, remaining: number, pct: number, color: string } | null>(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    // Aging bucket panel state
    const [selectedAgingBucket, setSelectedAgingBucket] = useState<'alDia' | 'unAMetreinta' | 'treintaYSesenta' | 'masDeSesenta' | null>(null);
    const [agingBucketOrigin, setAgingBucketOrigin] = useState<'alDia' | 'unAMetreinta' | 'treintaYSesenta' | 'masDeSesenta' | null>(null);
    const [sheetDragY, setSheetDragY] = useState(0);
    const sheetDragStartY = useRef<number | null>(null);
    const sheetRef = useRef<HTMLDivElement>(null);
    const sheetDragYRef = useRef(0);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editName, setEditName] = useState('');
    const [editNit, setEditNit] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editAddress, setEditAddress] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'overdue' | 'pending' | 'upcoming'>('all');
    const [editPurchaseDebt, setEditPurchaseDebt] = useState<BusinessDebt | null>(null);
    const [editPurchaseQty, setEditPurchaseQty] = useState('');
    const [editPurchaseCost, setEditPurchaseCost] = useState('');
    const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('Efectivo');
    const [paymentNotes, setPaymentNotes] = useState('');

    const [viewerDebt, setViewerDebt] = useState<any | null>(null);
    const paymentEvidence = useImageUpload(null, 'debt-evidence');

    // Movimiento seleccionado para ver su detalle en un modal.
    const [detailMovement, setDetailMovement] = useState<BusinessDebt | null>(null);

    // Trigger de animación de gráficos: parte en false y pasa a true en el siguiente
    // frame, garantizando que el browser pinte el estado inicial (barras a 0%) antes
    // de que arranque la transición CSS hacia los valores reales.
    const [chartsReady, setChartsReady] = useState(false);
    useEffect(() => {
        if (loading) return;
        const id = requestAnimationFrame(() => {
            requestAnimationFrame(() => setChartsReady(true));
        });
        return () => cancelAnimationFrame(id);
    }, [loading]);

    const subviewPushedRef = useRef(false);

    useEffect(() => {
        const isMobile = window.innerWidth < 768;
        if (!isMobile) return;

        if (selectedCreditor && !subviewPushedRef.current) {
            window.history.pushState({ subview: 'creditor-detail' }, '');
            subviewPushedRef.current = true;
        }
        if (!selectedCreditor) {
            subviewPushedRef.current = false;
        }
    }, [selectedCreditor]);

    useEffect(() => {
        const isMobile = window.innerWidth < 768;
        if (!isMobile) return;

        const handlePopState = (e: PopStateEvent) => {
            if (subviewPushedRef.current) {
                subviewPushedRef.current = false;
                (window as any).__subviewHandledBack = true;
                handleCloseCreditorDetail();
            }
        };
        window.addEventListener('popstate', handlePopState, true);
        return () => window.removeEventListener('popstate', handlePopState, true);
    }, []);

    // Enhanced Supplier Selection State
    const [showSupplierList, setShowSupplierList] = useState(false);
    const [showNewSupplierForm, setShowNewSupplierForm] = useState(false);
    const [creditorNameInput, setCreditorNameInput] = useState('');
    const [newSupplierName, setNewSupplierName] = useState('');
    const [newSupplierNit, setNewSupplierNit] = useState('');
    const [newSupplierPhone, setNewSupplierPhone] = useState('');
    const [newSupplierAddress, setNewSupplierAddress] = useState('');

    // Filter suppliers for dropdown
    const filteredSuppliers = useMemo(() => {
        if (!creditorNameInput.trim()) return [];
        const lower = creditorNameInput.toLowerCase();
        return suppliers.filter(s => s.name.toLowerCase().includes(lower));
    }, [suppliers, creditorNameInput]);

    const formatNumber = (value: string) => {
        const rawValue = value.replace(/\D/g, '');
        return rawValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    };

    const parseNumber = (value: string) => parseFloat(value.replace(/\./g, '')) || 0;
    const formatCurrencyK = (v: number) => v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v.toFixed(0)}`;

    // 1. Merge Suppliers with Debts
    const creditorGroups = useMemo(() => {
        const groups: Record<string, CreditorGroup> = {};

        // A. Add existing debts
        debts.forEach(d => {
            const key = d.creditor_name;
            if (!groups[key]) {
                const s = (d.supplier_id ? suppliers.find(sup => sup.id === d.supplier_id) : null)
                    || suppliers.find(sup => sup.name.trim().toLowerCase() === key.trim().toLowerCase());
                groups[key] = {
                    id: s?.id,
                    color: s?.color,
                    name: key,
                    type: d.type,
                    debts: [],
                    totalAmount: 0,
                    totalPaid: 0,
                    remaining: 0,
                    progress: 0,
                };
            }
            groups[key].debts.push(d);
            groups[key].totalAmount += d.total_amount;
            if (d.total_amount === 0 && d.paid_amount > 0) {
                groups[key].totalPaid += d.paid_amount;
            }
        });

        // B. Add suppliers without debts (only for Directory view)
        suppliers.forEach(s => {
            if (!groups[s.name]) {
                groups[s.name] = {
                    id: s.id,
                    color: s.color,
                    name: s.name,
                    type: 'supplier',
                    debts: [],
                    totalAmount: 0,
                    totalPaid: 0,
                    remaining: 0,
                    progress: 0,
                };
            }
        });

        // Calculate progress
        Object.values(groups).forEach(g => {
            const creditDebts = g.debts.filter(d => d.total_amount > 0 && !(d.status === 'paid' && d.paid_amount >= d.total_amount && d.description?.startsWith('Compra de contado')));
            const creditTotal = creditDebts.reduce((sum, d) => sum + d.total_amount, 0);
            g.remaining = creditDebts.reduce((sum, d) => sum + (d.total_amount - d.paid_amount), 0);
            g.progress = creditTotal > 0 ? (g.totalPaid / creditTotal) * 100 : 0;
        });

        return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
    }, [debts, suppliers]);

    useEffect(() => {
        if (!selectedCreditor || showPaymentModal) return;
        const updated = creditorGroups.find(g => g.name === selectedCreditor.name);
        if (updated) {
            setSelectedCreditor({ ...updated });
        } else {
            setSelectedCreditor(null);
        }
    }, [creditorGroups, showPaymentModal]);

    useEffect(() => {
        const el = sheetRef.current;
        if (!el || !selectedAgingBucket) return;
        const onTouchStart = (e: TouchEvent) => { sheetDragStartY.current = e.touches[0].clientY; sheetDragYRef.current = 0; };
        const onTouchMove = (e: TouchEvent) => {
            if (sheetDragStartY.current === null) return;
            const dy = e.touches[0].clientY - sheetDragStartY.current;
            if (dy > 0) { e.preventDefault(); sheetDragYRef.current = dy; setSheetDragY(dy); }
        };
        const onTouchEnd = () => {
            if (sheetDragYRef.current > 80) setSelectedAgingBucket(null);
            setSheetDragY(0); sheetDragYRef.current = 0; sheetDragStartY.current = null;
        };
        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', onTouchEnd, { passive: true });
        return () => {
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', onTouchEnd);
        };
    }, [selectedAgingBucket]);

    const DONUT_PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    useEffect(() => {
        const top5 = [...creditorGroups]
            .filter(g => g.remaining > 0)
            .sort((a, b) => b.remaining - a.remaining)
            .slice(0, 5);
        top5.forEach((p, i) => {
            if (!p.color && p.id) {
                updateSupplier(p.id, { color: DONUT_PALETTE[i] }).catch(() => {});
            }
        });
    }, [creditorGroups]);

    const filteredGroups = creditorGroups.filter(g => {
        // Tab Filter
        if (activeTab === 'payable' && g.remaining <= 0) return false;

        // Search Filter
        if (searchQuery.trim()) {
            const searchLower = searchQuery.toLowerCase();
            const supplierData = suppliers.find(s => s.name === g.name);
            return (
                g.name.toLowerCase().includes(searchLower) ||
                supplierData?.nit?.includes(searchLower) ||
                supplierData?.phone?.includes(searchLower)
            );
        }
        return true;
    });

    const totalPaid = debts.filter(d => d.total_amount > 0).reduce((sum, d) => sum + d.paid_amount, 0);

    const handleCreateDebt = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (actionLoading) return;
        setActionLoading(true);
        const formData = new FormData(e.currentTarget);
        const creditor_name = creditorNameInput;
        const description = formData.get('description') as string;
        const total_amount = parseNumber(formData.get('total_amount') as string);
        const type = 'supplier'; // default to supplier since type selector is removed
        const due_date = formData.get('due_date') as string;

        if (!creditor_name || total_amount <= 0) {
            showToast('Completa los campos requeridos', 'error');
            setActionLoading(false);
            return;
        }

        try {
            if (type === 'supplier') {
                const existingSupplier = suppliers.find(s =>
                    s.name.toLowerCase() === creditor_name.trim().toLowerCase()
                );
                if (!existingSupplier) {
                    try {
                        await createSupplier({ name: creditor_name.trim() });
                    } catch (supplierErr) {
                        console.error('Error auto-creating supplier:', supplierErr);
                    }
                }
            }

            await createDebt({
                type,
                creditor_name,
                description: description || undefined,
                total_amount,
                due_date: due_date || undefined,
            });
            setShowNewDebtModal(false);
            showToast('Deuda registrada', 'success');
        } catch (err: any) {
            showToast(err.message || 'Error al crear deuda', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleAddPayment = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedCreditor || actionLoading) return;
        setActionLoading(true);

        const amount = parseNumber(paymentAmount);
        if (amount <= 0) {
            showToast('Ingresa un monto válido', 'error');
            setActionLoading(false);
            return;
        }

        try {
            await addCreditorPayment(selectedCreditor.name, amount, paymentMethod || undefined, paymentNotes || undefined, activeShift?.id || undefined, paymentEvidence.imageUrl);

            if (navigator.onLine && activeShift) {
                const map: Record<string, string> = {
                    'efectivo': 'cash', 'cash': 'cash',
                    'tarjeta': 'card', 'card': 'card',
                    'nequi': 'nequi',
                    'daviplata': 'daviplata',
                    'transferencia': 'transfer', 'transfer': 'transfer',
                    'otro': 'other', 'other': 'other',
                };
                const cleanMethod = (paymentMethod || '').toLowerCase().trim();
                const mappedMethod = map[cleanMethod] || (cleanMethod || 'cash');
                if (mappedMethod === 'cash') {
                    await recordPurchase(amount, `Abono proveedor: ${selectedCreditor.name}${paymentNotes ? ' · ' + paymentNotes : ''}`, 'cash');
                }
            }

            paymentEvidence.markAsSaved();
            paymentEvidence.resetImage();
            setShowPaymentModal(false);
            setPaymentAmount('');
            setPaymentMethod('');
            setPaymentNotes('');
            showToast('Abono registrado', 'success');
        } catch (err: any) {
            showToast(err.message || 'Error al registrar abono', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleClearCreditor = async () => {
        if (!selectedCreditor || actionLoading) return;
        setActionLoading(true);
        try {
            await clearCreditorDebts(selectedCreditor.name);
            setShowClearConfirm(false);
            showToast('Movimientos limpiados', 'success');
        } catch (err: any) {
            showToast(err.message || 'Error al limpiar', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteCreditor = async (creditorName: string) => {
        if (actionLoading) return;
        setActionLoading(true);
        try {
            await deleteCreditor(creditorName);
            const supplierMatch = suppliers.find(s => s.name === creditorName);
            if (supplierMatch) {
                await deleteSupplier(supplierMatch.id);
            }
            setShowDeleteConfirm(null);
            setSelectedCreditor(null);
            showToast('Proveedor eliminado', 'success');
        } catch (err: any) {
            showToast(err.message || 'Error al eliminar', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleRenameCreditor = async () => {
        if (!selectedCreditor || !editName.trim() || actionLoading) return;
        setActionLoading(true);
        try {
            if (editName.trim() !== selectedCreditor.name) {
                await renameCreditor(selectedCreditor.name, editName.trim());
            }
            const supplierMatch = suppliers.find(s => s.name === selectedCreditor.name || s.name === editName.trim());
            if (supplierMatch) {
                await updateSupplier(supplierMatch.id, {
                    name: editName.trim(),
                    nit: editNit,
                    phone: editPhone,
                    address: editAddress,
                });
                if (editName.trim() !== selectedCreditor.name) {
                    await supabase.from('inventory_lots')
                        .update({ supplier_name: editName.trim() })
                        .eq('supplier_id', supplierMatch.id);
                }
            }
            setShowEditModal(false);
            showToast('Proveedor actualizado', 'success');
        } catch (err: any) {
            showToast(err.message || 'Error al actualizar', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeletePurchase = async (debt: BusinessDebt) => {
        if (actionLoading) return;

        if (!debt.inventory_lot_id) {
            showToast('Este registro no tiene lote vinculado', 'error');
            return;
        }

        const confirmed = await confirmAction({
            title: '¿Eliminar esta compra?',
            message: 'Se revertirá el inventario y el registro financiero.',
            confirmText: 'Eliminar',
            variant: 'danger',
        });
        if (!confirmed) return;

        setActionLoading(true);
        try {
            const result = await deletePurchaseRecord(debt.id);
            if (result.blocked) {
                const msg = result.reason === 'stock_negative'
                    ? 'No puedes borrar esta compra porque el stock de este producto está en 0 o en negativo. Eliminarlo descuadraría aún más el inventario.\n\nPrimero registra más inventario o ajusta el stock antes de intentar eliminar.'
                    : `No puedes borrar esta compra porque ya vendiste ${result.sold} unidades de este registro. Borrarla descuadraría el análisis de ganancias del Dashboard.\n\nUsa el botón de editar ✏️ para corregir la cantidad o el costo.`;
                setBlockedMessage(msg);
            } else {
                const isCashPurchase = debt.status === 'paid' && debt.paid_amount >= debt.total_amount && debt.total_amount > 0;
                if (isCashPurchase && activeShift) {
                    await reverseCashMovement(
                        debt.total_amount,
                        `Reversa compra: ${debt.description || debt.creditor_name}`,
                        'in',
                        undefined,
                        undefined,
                        debt.inventory_lot_id
                    );
                }
                window.dispatchEvent(new CustomEvent('purchase-reversed'));
                showToast('Compra revertida correctamente', 'success');
            }
        } catch (err: any) {
            showToast(err.message || 'Error al eliminar', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeletePayment = async (debt: BusinessDebt) => {
        if (actionLoading) return;
        const confirmed = await confirmAction({
            title: '¿Eliminar este abono?',
            message: 'Se eliminará el registro del abono. Si la caja está abierta, el monto será reintegrado.',
            confirmText: 'Eliminar',
            variant: 'danger',
        });
        if (!confirmed) return;

        setActionLoading(true);
        try {
            await deletePaymentRecord(debt.id);
            if (activeShift && debt.paid_amount > 0) {
                await reverseCashMovement(
                    debt.paid_amount,
                    `Reversa abono: ${debt.creditor_name}`,
                    'in'
                );
                window.dispatchEvent(new CustomEvent('payment-reversed'));
            }
            showToast('Abono eliminado', 'success');
        } catch (err: any) {
            showToast(err.message || 'Error al eliminar abono', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleOpenEditPurchase = (debt: BusinessDebt) => {
        const desc = debt.description || '';
        const qtyMatch = desc.match(/\((\d+)\s/);
        setEditPurchaseDebt(debt);
        setEditPurchaseQty(qtyMatch ? qtyMatch[1] : '');
        setEditPurchaseCost(debt.total_amount.toString());
    };

    const handleSaveEditPurchase = async () => {
        if (!editPurchaseDebt || actionLoading) return;
        setActionLoading(true);

        try {
            const newQty = parseInt(editPurchaseQty) || undefined;
            const newCostTotal = parseFloat(editPurchaseCost) || undefined;
            const newUnitCost = (newQty && newCostTotal) ? newCostTotal / newQty : undefined;

            const result = await updatePurchaseRecord(editPurchaseDebt.id, {
                newQuantity: newQty,
                newUnitCost,
            });

            if (!result.success) {
                showToast(result.message || 'No se pudo actualizar', 'error');
            } else {
                showToast('Compra actualizada', 'success');
                setEditPurchaseDebt(null);
            }
        } catch (err: any) {
            showToast(err.message || 'Error al editar', 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleOpenPaymentFromTable = (debt: BusinessDebt, e: React.MouseEvent) => {
        e.stopPropagation();
        const group = creditorGroups.find(g => g.name === debt.creditor_name);
        if (group) {
            setSelectedCreditor(group);
            setPaymentAmount('');
            setPaymentMethod('Efectivo');
            setPaymentNotes('');
            setShowPaymentModal(true);
        }
    };

    // Helper to safely parse YYYY-MM-DD as local midnight
    const parseLocal = (dateStr: string) => new Date(dateStr + 'T00:00:00');

    const today = new Date(new Date().setHours(0, 0, 0, 0));

    // New Calculations for Dashboard
    const totalVencida = activeDebts
        .filter(d => d.due_date && parseLocal(d.due_date) < today)
        .reduce((sum, d) => sum + (d.total_amount - d.paid_amount), 0);
    const porcentajeMora = totalPending > 0 ? (totalVencida / totalPending) * 100 : 0;

    const selectedCreditorOverdue = useMemo(() => {
        if (!selectedCreditor) return 0;
        return selectedCreditor.debts
            .filter(d => d.status === 'active' && d.total_amount > d.paid_amount && d.due_date && parseLocal(d.due_date) < today)
            .reduce((sum, d) => sum + (d.total_amount - d.paid_amount), 0);
    }, [selectedCreditor, today]);

    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(today.getDate() + 7);

    const upcomingDebts = activeDebts.filter(d => {
        if (!d.due_date) return false;
        const due = parseLocal(d.due_date);
        return due >= today && due <= sevenDaysFromNow;
    });

    upcomingDebts.sort((a, b) => parseLocal(a.due_date!).getTime() - parseLocal(b.due_date!).getTime());

    const totalVence7Dias = upcomingDebts.reduce((sum, d) => sum + (d.total_amount - d.paid_amount), 0);

    let upcomingSubtitle = "Al día: Sin vencimientos próximos";
    if (upcomingDebts.length > 0) {
        const closestDue = parseLocal(upcomingDebts[0].due_date!);
        const diffTime = closestDue.getTime() - today.getTime();
        const daysToFirst = Math.round(diffTime / (1000 * 60 * 60 * 24));

        let dueText = daysToFirst === 0 ? 'vence hoy' : (daysToFirst === 1 ? 'vence mañana' : `próxima en ${daysToFirst} días`);
        upcomingSubtitle = `${upcomingDebts.length} factura${upcomingDebts.length > 1 ? 's' : ''} (${dueText})`;
    }

    // Aging Report
    const agingReport = { alDia: 0, unAMetreinta: 0, treintaYSesenta: 0, masDeSesenta: 0 };
    activeDebts.forEach(d => {
        if (!d.due_date) {
            agingReport.alDia += (d.total_amount - d.paid_amount);
            return;
        }
        const due = parseLocal(d.due_date);
        const diffTime = today.getTime() - due.getTime();
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 0) agingReport.alDia += (d.total_amount - d.paid_amount);
        else if (diffDays <= 30) agingReport.unAMetreinta += (d.total_amount - d.paid_amount);
        else if (diffDays <= 60) agingReport.treintaYSesenta += (d.total_amount - d.paid_amount);
        else agingReport.masDeSesenta += (d.total_amount - d.paid_amount);
    });
    const maxAging = Math.max(agingReport.alDia, agingReport.unAMetreinta, agingReport.treintaYSesenta, agingReport.masDeSesenta, 1);

    const getCreditorsForBucket = (bucket: 'alDia' | 'unAMetreinta' | 'treintaYSesenta' | 'masDeSesenta') => {
        const grouped: Record<string, { name: string; remaining: number }> = {};
        activeDebts.forEach(d => {
            const remaining = d.total_amount - d.paid_amount;
            if (remaining <= 0) return;
            let b: typeof bucket;
            if (!d.due_date) {
                b = 'alDia';
            } else {
                const due = parseLocal(d.due_date);
                const diffDays = Math.round((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays <= 0) b = 'alDia';
                else if (diffDays <= 30) b = 'unAMetreinta';
                else if (diffDays <= 60) b = 'treintaYSesenta';
                else b = 'masDeSesenta';
            }
            if (b !== bucket) return;
            if (!grouped[d.creditor_name]) grouped[d.creditor_name] = { name: d.creditor_name, remaining: 0 };
            grouped[d.creditor_name].remaining += remaining;
        });
        return Object.values(grouped).sort((a, b) => b.remaining - a.remaining);
    };

    const agingSheetCreditors = selectedAgingBucket ? getCreditorsForBucket(selectedAgingBucket) : [];
    const agingSheetInfo = selectedAgingBucket ? ({
        alDia:           { title: 'Al Día (No Vencido)', color: '#4dcba1', textCls: 'text-emerald-600 dark:text-emerald-400' },
        unAMetreinta:    { title: 'Vencidos 1–30 días',  color: '#f4cc2d', textCls: 'text-amber-600 dark:text-amber-400' },
        treintaYSesenta: { title: 'Vencidos 31–60 días', color: '#f03a5f', textCls: 'text-rose-600 dark:text-rose-400' },
        masDeSesenta:    { title: 'Vencidos +60 días',   color: '#e84c3d', textCls: 'text-red-600 dark:text-red-400' },
    } as const)[selectedAgingBucket] : null;

    // Top Proveedores (Concentración)
    const sortedAllCreditors = [...creditorGroups]
        .filter(g => g.remaining > 0)
        .sort((a, b) => b.remaining - a.remaining);

    const topProveedores = sortedAllCreditors.slice(0, 5);
    const othersRemaining = sortedAllCreditors.slice(5).reduce((sum, g) => sum + g.remaining, 0);

    // Add "Otros" if there are more than 5
    const chartData = [...topProveedores.map((p, i) => ({
        ...p,
        color: p.color || ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][i],
        pct: (p.remaining / totalPending) * 100
    }))];

    if (othersRemaining > 0) {
        chartData.push({
            id: 'others',
            name: 'Otros',
            remaining: othersRemaining,
            color: '#94a3b8',
            pct: (othersRemaining / totalPending) * 100,
            type: 'other',
            debts: [],
            totalAmount: othersRemaining,
            totalPaid: 0,
            progress: 0
        } as any);
    }

    const sortedActiveDebts = [...activeDebts].sort((a, b) => {
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return parseLocal(a.due_date).getTime() - parseLocal(b.due_date).getTime();
    });

    // Filtered by Search and Status
    const filteredActiveDebts = sortedActiveDebts.filter(d => {
        const matchesSearch = d.creditor_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (d.description?.toLowerCase().includes(searchQuery.toLowerCase()));

        if (!matchesSearch) return false;

        if (statusFilter === 'all') return true;

        let isOverdue = false;
        let isUpcoming = false;
        if (d.due_date) {
            const today = new Date(new Date().setHours(0, 0, 0, 0));
            const due = parseLocal(d.due_date);
            isOverdue = due < today;
            if (!isOverdue) {
                const diffTime = due.getTime() - today.getTime();
                const daysDiff = Math.round(diffTime / (1000 * 60 * 60 * 24));
                isUpcoming = daysDiff <= 7;
            }
        }

        if (statusFilter === 'overdue') return isOverdue;
        if (statusFilter === 'pending') return !isOverdue;
        if (statusFilter === 'upcoming') return isUpcoming;
        return true;
    });


    if (!isOnline || !navigator.onLine) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center h-full bg-background-light dark:bg-background-dark p-8 text-center gap-5">
                <div className="size-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>wifi_off</span>
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Sin conexión</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-xs">
                        El registro de cuentas por pagar requiere internet para cargar deudas y proveedores.
                    </p>
                </div>
            </div>
        );
    }

    if (loading) return <ScreenLoader />;

    return (
        <div className="flex-1 flex flex-col h-full bg-background-light dark:bg-background-dark overflow-hidden animate-fadeIn">
            <header className="shrink-0 bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-800 px-4 md:px-6 py-2.5 md:py-0 md:h-14 flex items-center justify-start z-10">
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                    <button
                        onClick={() => setActiveTab('directory')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'directory' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                    >
                        <span className="hidden sm:inline">Directorio Proveedores</span>
                        <span className="sm:hidden">Directorio</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('payable')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'payable' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                    >
                        <span className="hidden sm:inline">Cuentas por Pagar</span>
                        <span className="sm:hidden">Por Pagar</span>
                    </button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-0 lg:p-6 xl:p-8 bg-gray-50 dark:bg-black/20">
                <div className="max-w-6xl mx-auto space-y-6 lg:space-y-8 p-4 lg:p-0">

                    {activeTab === 'payable' && (<>
                    {/* Resumen Financiero (KPIs) */}
                    <div>
                        <div className="mb-4">
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">Resumen Financiero (KPIs)</h2>
                            <p className="text-xs text-gray-500">Propósito: Proveer un vistazo rápido de la salud de tus deudas.</p>
                        </div>

                        <div className="flex gap-2 overflow-x-auto lg:grid lg:grid-cols-3 lg:gap-4 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
                            {/* KPI 1: TOTAL POR PAGAR */}
                            <div className="min-w-[115px] shrink-0 lg:min-w-0 bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-2.5 lg:p-5 relative overflow-hidden flex flex-col justify-center">
                                <div className="flex justify-between items-start mb-1 lg:mb-2">
                                    <h3 className="text-[9px] lg:text-xs font-semibold text-gray-500 uppercase tracking-wider leading-tight">
                                        <span className="lg:hidden">Por Pagar</span>
                                        <span className="hidden lg:block">Total por Pagar</span>
                                    </h3>
                                    <span className="hidden lg:block text-xl leading-none">💰</span>
                                </div>
                                <p className="text-sm lg:text-[28px] font-black text-gray-900 dark:text-white leading-tight mb-0.5 lg:mb-1">${formatCurrency(totalPending)}</p>
                                <p className="hidden lg:block text-xs text-gray-400">Saldo vivo total a proveedores</p>
                            </div>

                            {/* KPI 2: DEUDA VENCIDA */}
                            <div className="min-w-[115px] shrink-0 lg:min-w-0 bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-red-200 dark:border-red-900/30 p-2.5 lg:p-5 relative overflow-hidden flex flex-col justify-center">
                                <div className="flex justify-between items-start mb-1 lg:mb-2">
                                    <h3 className="text-[9px] lg:text-xs font-semibold text-red-500 uppercase tracking-wider leading-tight">Vencida</h3>
                                    <span className="hidden lg:block text-red-500 material-symbols-outlined text-xl leading-none">warning</span>
                                </div>
                                <p className="text-sm lg:text-[28px] font-black text-red-600 dark:text-red-400 leading-tight mb-0.5 lg:mb-1">${formatCurrency(totalVencida)}</p>
                                <p className="hidden lg:block text-xs text-red-500">{porcentajeMora.toFixed(1)}% del total está en mora</p>
                            </div>

                            {/* KPI 3: VENCE EN 7 DÍAS */}
                            <div className="min-w-[115px] shrink-0 lg:min-w-0 bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-amber-200 dark:border-amber-900/30 p-2.5 lg:p-5 relative overflow-hidden flex flex-col justify-center">
                                <div className="flex justify-between items-start mb-1 lg:mb-2">
                                    <h3 className="text-[9px] lg:text-xs font-semibold text-amber-600 uppercase tracking-wider leading-tight">
                                        <span className="lg:hidden">Vence 7d</span>
                                        <span className="hidden lg:block">Próximos Vencim. (7d)</span>
                                    </h3>
                                    <span className="hidden lg:block text-amber-500 material-symbols-outlined text-xl leading-none">event_upcoming</span>
                                </div>
                                <p className="text-sm lg:text-[28px] font-black text-amber-600 dark:text-amber-500 leading-tight mb-0.5 lg:mb-1">${formatCurrency(totalVence7Dias)}</p>
                                <p className="hidden lg:block text-xs text-amber-600">{upcomingSubtitle}</p>
                            </div>
                        </div>
                    </div>

                    {/* Análisis de Cartera y Proveedores */}
                    <div className="bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 p-5 lg:p-8">
                        <div className="mb-6 lg:mb-8 border-b border-gray-100 dark:border-gray-800 pb-4">
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">Análisis de Cartera y Proveedores</h2>
                            <p className="text-xs text-gray-500">Propósito: Entender la estructura de la deuda para prever necesidades de efectivo en las próximas semanas.</p>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">
                            {/* Bar Chart */}
                            <div className="flex flex-col h-full">
                                <h3 className="text-center text-sm font-semibold text-gray-700 dark:text-gray-300 mb-8">Antigüedad de Saldos</h3>
                                <div className="relative flex-1 min-h-[220px] flex items-end justify-around gap-2 px-6 ml-6">
                                    {/* Y Axis Grid Lines */}
                                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-7 text-gray-300 dark:text-gray-700">
                                        {[4, 3, 2, 1, 0].map(v => (
                                            <div key={v} className="w-full border-b border-gray-100 dark:border-gray-800 relative z-0">
                                                <span className="absolute -left-3 -translate-x-full -translate-y-1/2 text-[10px] text-gray-400 whitespace-nowrap">
                                                    ${v > 0 ? (maxAging * v / 4 / 1000).toFixed(0) + 'k' : '0k'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Bars */}
                                    {[
                                        { label: 'Al Día', value: agingReport.alDia, color: 'bg-[#4dcba1]', bucket: 'alDia' as const },
                                        { label: '1-30 días', value: agingReport.unAMetreinta, color: 'bg-[#f4cc2d]', bucket: 'unAMetreinta' as const },
                                        { label: '31-60 días', value: agingReport.treintaYSesenta, color: 'bg-[#f03a5f]', bucket: 'treintaYSesenta' as const },
                                        { label: '+60 días', value: agingReport.masDeSesenta, color: 'bg-[#e84c3d]', bucket: 'masDeSesenta' as const },
                                    ].map((bar, idx) => (
                                        <div
                                            key={bar.bucket}
                                            className={`w-16 lg:w-20 flex flex-col items-center z-10 relative h-full pb-7 justify-end transition-opacity duration-300 ${selectedAgingBucket && selectedAgingBucket !== bar.bucket ? 'opacity-25' : 'opacity-100'} ${bar.value > 0 ? 'cursor-pointer' : ''}`}
                                            onClick={() => bar.value > 0 && setSelectedAgingBucket(bar.bucket)}
                                            role={bar.value > 0 ? 'button' : undefined}
                                            tabIndex={bar.value > 0 ? 0 : -1}
                                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && bar.value > 0 && setSelectedAgingBucket(bar.bucket)}
                                        >
                                            <div
                                                className="relative w-full flex flex-col justify-end"
                                                style={{
                                                    height: chartsReady && maxAging > 0 ? `${(bar.value / maxAging) * 100}%` : '0%',
                                                    transition: `height 800ms cubic-bezier(0.16, 1, 0.3, 1) ${idx * 110}ms`,
                                                }}
                                            >
                                                {bar.value > 0 && chartsReady && (
                                                    <span
                                                        className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-bold text-gray-600 dark:text-gray-300 whitespace-nowrap pointer-events-none animate-fadeIn"
                                                        style={{ animationDelay: `${idx * 110 + 600}ms`, animationFillMode: 'both' }}
                                                    >
                                                        {formatCurrencyK(bar.value)}
                                                    </span>
                                                )}
                                                <div
                                                    className={`w-full ${bar.color} rounded-t-sm transition-[filter,transform] duration-300 ${selectedAgingBucket === bar.bucket ? 'brightness-110 scale-x-105' : ''}`}
                                                    style={{ height: '100%' }}
                                                />
                                            </div>
                                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex items-center justify-center h-7 text-center w-[120%]">
                                                <span className="text-[9px] font-bold leading-tight text-gray-500 dark:text-gray-400">{bar.label}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[10px] text-center text-gray-400 mt-6 lg:mt-5 px-4 text-balance">Distribución de la deuda según días de vencimiento. Ayuda a priorizar pagos inminentes.</p>
                            </div>

                            {/* Donut Chart */}
                            <div className="flex flex-col h-full">
                                <h3 className="text-center text-sm font-semibold text-gray-700 dark:text-gray-300 mb-8 lg:mb-4">Top Proveedores (Concentración de Deuda)</h3>
                                <div className="flex-1 flex flex-col sm:flex-row items-center justify-center gap-8 lg:gap-10">
                                    <div className="relative size-48 shrink-0">
                                        {totalPending > 0 ? (
                                            <svg
                                                viewBox="0 0 100 100"
                                                className="w-full h-full drop-shadow-sm overflow-visible"
                                                style={{
                                                    transform: chartsReady ? 'rotate(-90deg) scale(1)' : 'rotate(-90deg) scale(0.4)',
                                                    opacity: chartsReady ? 1 : 0,
                                                    transformOrigin: 'center',
                                                    transition: 'transform 900ms cubic-bezier(0.16, 1, 0.3, 1) 150ms, opacity 600ms ease-out 150ms',
                                                }}
                                                onMouseLeave={() => setHoveredSupplier(null)}
                                            >
                                                {(() => {
                                                    const r = 38;
                                                    const circum = 2 * Math.PI * r;
                                                    let currentOffset = 0;
                                                    return chartData.map((p, i) => {
                                                        const pct = (p.remaining / totalPending) * 100;
                                                        const pctLength = (pct / 100) * circum;
                                                        const gap = 1.5;
                                                        const strokeDasharray = `${Math.max(0, pctLength - gap)} ${circum}`;
                                                        const strokeDashoffset = -currentOffset;
                                                        currentOffset += pctLength;

                                                        const isHovered = hoveredSupplier?.name === p.name;
                                                        const isOtherHovered = hoveredSupplier && !isHovered;
                                                        const segmentColor = p.color || ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][i % 5];

                                                        return (
                                                            <circle
                                                                key={p.name}
                                                                cx="50"
                                                                cy="50"
                                                                r={r}
                                                                fill="none"
                                                                stroke={segmentColor}
                                                                strokeWidth="24"
                                                                strokeDasharray={strokeDasharray}
                                                                strokeDashoffset={strokeDashoffset}
                                                                className={`transition-all duration-300 cursor-pointer ${isOtherHovered ? 'opacity-40' : 'opacity-100'} hover:opacity-90`}
                                                                style={{ transformOrigin: '50px 50px', transform: isHovered ? 'scale(1.03)' : 'scale(1)' }}
                                                                onMouseEnter={(e) => {
                                                                    setHoveredSupplier({ name: p.name, remaining: p.remaining, pct, color: segmentColor });
                                                                    setTooltipPos({ x: e.clientX, y: e.clientY });
                                                                }}
                                                                onMouseMove={(e) => {
                                                                    setTooltipPos({ x: e.clientX, y: e.clientY });
                                                                }}
                                                                onTouchStart={(e) => {
                                                                    const touch = e.touches[0];
                                                                    setHoveredSupplier({ name: p.name, remaining: p.remaining, pct, color: segmentColor });
                                                                    setTooltipPos({ x: touch.clientX, y: touch.clientY });
                                                                }}
                                                            />
                                                        );
                                                    });
                                                })()}
                                            </svg>
                                        ) : (
                                            <div className="absolute inset-0 rounded-full border-[20px] border-gray-100 dark:border-gray-800 flex items-center justify-center">
                                                <span className="text-xs text-gray-400 font-bold">Sin deuda</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex flex-col gap-3 w-full sm:w-auto mt-4 sm:mt-0" onMouseLeave={() => setHoveredSupplier(null)}>
                                        {chartData.map((p, i) => {
                                            const isHovered = hoveredSupplier?.name === p.name;
                                            return (
                                                <div
                                                    key={p.name}
                                                    className={`flex items-center gap-3 p-1.5 -mx-1.5 rounded-lg cursor-pointer transition-all duration-200 ${isHovered ? 'bg-gray-100 dark:bg-gray-800 scale-[1.02] shadow-sm' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'}`}
                                                    onMouseEnter={(e) => {
                                                        setHoveredSupplier({ name: p.name, remaining: p.remaining, pct: p.pct, color: p.color });
                                                        setTooltipPos({ x: e.clientX, y: e.clientY });
                                                    }}
                                                    onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                                                >
                                                    <div className="size-3 shrink-0 rounded-[3px] shadow-sm" style={{ backgroundColor: p.color }}></div>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className={`text-[11px] font-bold truncate transition-colors ${isHovered ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                                                            {p.name}
                                                        </span>
                                                        <span className="text-[10px] text-gray-400 font-medium">
                                                            ${formatCurrency(p.remaining)} <span className="opacity-60">({p.pct.toFixed(1)}%)</span>
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {chartData.length === 0 && (
                                            <span className="text-xs text-gray-400 italic">No hay proveedores con deuda.</span>
                                        )}
                                    </div>
                                </div>
                                <p className="text-[10px] text-center text-gray-400 mt-6 lg:mt-3 px-4 text-balance">Los 5 proveedores que concentran el mayor porcentaje de nuestra deuda total actual.</p>
                            </div>
                        </div>
                    </div>

                    {/* Detalle Operativo: Facturas Pendientes */}
                    <div>
                        <div className="mb-4">
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">Detalle Operativo: Facturas Pendientes</h2>
                            <p className="text-xs text-gray-500">Propósito: El área de trabajo diario. Filtra y busca vencimientos específicos.</p>
                        </div>

                        <div className="bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden min-h-[400px]">
                            {/* Toolbar */}
                            <div className="border-b border-gray-200 dark:border-gray-800 p-4 bg-gray-50/50 dark:bg-gray-800/20">
                                <div className="flex flex-col sm:flex-row gap-4 items-center">
                                    <div className="relative flex-1 w-full max-w-sm">
                                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            placeholder="Buscar por Proveedor o descripción..."
                                            className="w-full h-10 pl-9 pr-4 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl text-sm text-gray-800 dark:text-white outline-none focus:border-primary transition-colors"
                                        />
                                    </div>
                                    <div className="flex-1 flex justify-end">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-gray-500 hidden sm:block">Filtrar:</span>
                                            <select
                                                value={statusFilter}
                                                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'overdue' | 'pending' | 'upcoming')}
                                                className="h-10 px-3 pr-8 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl text-sm font-medium text-gray-800 dark:text-gray-200 outline-none focus:border-primary transition-colors appearance-none cursor-pointer w-full sm:w-auto"
                                                style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236b7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E\")", backgroundPosition: "right 0.5rem center", backgroundRepeat: "no-repeat", backgroundSize: "1.2em 1.2em" }}
                                            >
                                                <option value="all">Todos los estados</option>
                                                <option value="overdue">🔴 Vencidas</option>
                                                <option value="pending">🟡 Pendientes</option>
                                                <option value="upcoming">⏳ Próximas a vencer</option>
                                            </select>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowNewDebtModal(true)}
                                        className="h-10 px-5 w-full sm:w-auto shrink-0 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-lg">add</span>
                                        Nueva Deuda
                                    </button>
                                </div>
                            </div>

                            {/* List Desktop */}
                            <div className="hidden lg:grid grid-cols-[2fr_1fr_1fr_1.2fr_1fr_100px] gap-4 px-6 py-4 border-b border-gray-200 dark:border-gray-800 text-[11px] uppercase text-gray-700 dark:text-gray-300 font-bold tracking-wider bg-white dark:bg-surface-dark">
                                <div>Proveedor</div>
                                <div>Emisión</div>
                                <div>Vencimiento</div>
                                <div>Monto</div>
                                <div className="text-center">Estado</div>
                                <div className="text-center">Acción</div>
                            </div>

                            {/* List Items */}
                            <div className="flex-1 overflow-x-hidden p-4 lg:p-0">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-0 lg:flex lg:flex-col lg:divide-y lg:divide-gray-100 dark:lg:divide-gray-800">
                                    {filteredActiveDebts.map(debt => {
                                        const pendingAmount = debt.total_amount - debt.paid_amount;
                                        let isOverdue = false;
                                        let daysOverdue = 0;
                                        let daysRemaining: number | null = null;
                                        if (debt.due_date) {
                                            const today = new Date(new Date().setHours(0, 0, 0, 0));
                                            const due = parseLocal(debt.due_date);
                                            isOverdue = due < today;
                                            if (isOverdue) {
                                                const diffTime = today.getTime() - due.getTime();
                                                daysOverdue = Math.round(diffTime / (1000 * 60 * 60 * 24));
                                            } else {
                                                const diffTime = due.getTime() - today.getTime();
                                                daysRemaining = Math.round(diffTime / (1000 * 60 * 60 * 24));
                                            }
                                        }

                                        return (
                                            <div
                                                key={debt.id}
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => {
                                                    const group = creditorGroups.find(g => g.name === debt.creditor_name);
                                                    if (group) setSelectedCreditor(group);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        const group = creditorGroups.find(g => g.name === debt.creditor_name);
                                                        if (group) setSelectedCreditor(group);
                                                    }
                                                }}
                                                className="bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 shadow-sm lg:shadow-none rounded-xl lg:rounded-none lg:border-0 lg:border-transparent p-4 lg:px-6 lg:py-4 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                            >
                                                {/* Mobile/Tablet Card View */}
                                                <div className="lg:hidden flex flex-col gap-3">
                                                    <div className="flex justify-between items-start">
                                                        <div className="pr-2">
                                                            <p className="font-bold text-gray-900 dark:text-white text-sm line-clamp-1">{debt.creditor_name}</p>
                                                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{debt.description || 'Deuda registrada'}</p>
                                                        </div>
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 ${isOverdue ? 'bg-red-50 text-red-600 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40' : 'bg-gray-50 text-gray-600 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'}`}>
                                                            <span className={`size-2 rounded-full border border-black/40 ${isOverdue ? 'bg-current' : 'bg-[#fff100]'}`}></span>
                                                            {isOverdue ? `Vencida (${daysOverdue} días)` : (daysRemaining !== null ? `Pendiente (${daysRemaining} días)` : 'Pendiente')}
                                                        </span>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-800">
                                                        <div>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Monto</p>
                                                            <p className="font-bold text-gray-900 dark:text-white">${formatCurrency(pendingAmount)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Vencimiento</p>
                                                            <p className={`font-medium ${isOverdue ? 'text-red-500' : 'text-gray-700 dark:text-gray-300'} truncate`}>
                                                                {debt.due_date ? new Date(debt.due_date).toLocaleDateString() : '-'}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={(e) => handleOpenPaymentFromTable(debt, e)}
                                                        className="w-full mt-1 h-10 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 dark:text-blue-400 font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2 border border-blue-100 dark:border-blue-900/30"
                                                    >
                                                        Pagar Factura
                                                    </button>
                                                </div>

                                                {/* Desktop List View */}
                                                <div className="hidden lg:grid grid-cols-[2fr_1fr_1fr_1.2fr_1fr_100px] gap-4 items-center">
                                                    <div className="min-w-0 pr-4">
                                                        <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{debt.creditor_name}</p>
                                                        <p className="text-xs text-gray-500 truncate mt-0.5">{debt.description}</p>
                                                    </div>
                                                    <div className="text-sm text-gray-600 dark:text-gray-300">
                                                        {new Date(debt.created_at).toISOString().split('T')[0]}
                                                    </div>
                                                    <div className={`text-sm ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-600 dark:text-gray-300'}`}>
                                                        {debt.due_date ? new Date(debt.due_date).toISOString().split('T')[0] : '-'}
                                                    </div>
                                                    <div className="font-bold text-sm text-gray-900 dark:text-white">
                                                        ${formatCurrency(pendingAmount)}
                                                    </div>
                                                    <div className="flex justify-center">
                                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${isOverdue ? 'bg-red-50 text-red-600 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40' : 'bg-gray-50 text-gray-600 dark:bg-gray-800 border border-gray-200 dark:border-gray-700'}`}>
                                                            <span className={`size-2 rounded-full border border-black/40 ${isOverdue ? 'bg-current' : 'bg-[#fff100]'}`}></span>
                                                            {isOverdue ? `Vencida (${daysOverdue} días)` : (daysRemaining !== null ? `Pendiente (${daysRemaining} días)` : 'Pendiente')}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-center border-l border-gray-200 dark:border-gray-800">
                                                        <button
                                                            onClick={(e) => handleOpenPaymentFromTable(debt, e)}
                                                            className="h-8 px-4 bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 dark:text-blue-400 rounded-lg text-xs font-bold transition-colors border border-blue-100 dark:border-blue-900/30"
                                                        >
                                                            Pagar
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {filteredActiveDebts.length === 0 && (
                                        <div className="col-span-full py-20 text-center text-gray-400 opacity-60">
                                            <span className="material-symbols-outlined text-4xl mb-3">check_circle</span>
                                            <p className="text-sm font-medium">No hay facturas pendientes</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    </>)}

                    {/* Directory Tab: All Suppliers */}
                    {activeTab === 'directory' && (
                        <div>
                            <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                <div>
                                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">Directorio de Proveedores</h2>
                                    <p className="text-xs text-gray-500">Todos tus proveedores registrados. Selecciona uno para ver su historial de movimientos.</p>
                                </div>
                                <button
                                    onClick={() => { setCreditorNameInput(''); setShowNewDebtModal(true); }}
                                    className="h-10 px-5 shrink-0 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold shadow-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-lg">add</span>
                                    Nueva Deuda
                                </button>
                            </div>

                            {/* Search */}
                            <div className="relative max-w-sm mb-4">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Buscar proveedor..."
                                    className="w-full h-10 pl-9 pr-4 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl text-sm text-gray-800 dark:text-white outline-none focus:border-primary transition-colors"
                                />
                            </div>

                            {/* Supplier Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {filteredGroups.map(group => {
                                    const supplierData = suppliers.find(s => s.name === group.name);
                                    const hasActiveDebt = group.remaining > 0;
                                    const totalMovements = group.debts.filter(d => d.total_amount > 0 || d.paid_amount > 0).length;

                                    return (
                                        <div
                                            key={group.name}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setSelectedCreditor(group)}
                                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelectedCreditor(group)}
                                            className="bg-white dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-gray-800 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/30 hover:border-gray-300 dark:hover:border-gray-700 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary shadow-sm group/card"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div
                                                    className="size-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm text-white"
                                                    style={{ backgroundColor: group.color || '#6b7280' }}
                                                >
                                                    {group.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-sm text-gray-900 dark:text-white truncate">{group.name}</p>
                                                        {hasActiveDebt && (
                                                            <span className="shrink-0 size-2 rounded-full bg-red-500" title="Tiene deuda activa"></span>
                                                        )}
                                                    </div>
                                                    {supplierData?.nit && (
                                                        <p className="text-[10px] text-gray-400 truncate">NIT: {supplierData.nit}</p>
                                                    )}
                                                    {supplierData?.phone && (
                                                        <p className="text-[10px] text-gray-400 truncate">Tel: {supplierData.phone}</p>
                                                    )}
                                                </div>
                                                <span className="material-symbols-outlined text-gray-300 dark:text-gray-600 text-base group-hover/card:text-gray-500 transition-colors shrink-0 mt-1">chevron_right</span>
                                            </div>

                                            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 grid grid-cols-2 gap-2">
                                                <div>
                                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Deuda</p>
                                                    <p className={`text-sm font-bold ${hasActiveDebt ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                                                        {hasActiveDebt ? `$${formatCurrency(group.remaining)}` : 'Al día'}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Movimientos</p>
                                                    <p className="text-sm font-bold text-gray-700 dark:text-gray-300">{totalMovements}</p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                                {filteredGroups.length === 0 && (
                                    <div className="col-span-full py-20 text-center text-gray-400 opacity-60">
                                        <span className="material-symbols-outlined text-4xl mb-3">store</span>
                                        <p className="text-sm font-medium">No hay proveedores registrados</p>
                                        <p className="text-xs mt-1">Los proveedores aparecerán aquí al registrar deudas o crearlos manualmente.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                </div>
            </div>
            {hoveredSupplier && (
                <div
                    className="fixed z-[150] pointer-events-none bg-[#1e293b] text-white rounded-lg px-3 py-2 shadow-2xl animate-[fadeIn_0.15s_ease-out] border border-white/10"
                    style={{ left: tooltipPos.x, top: tooltipPos.y, transform: 'translate(-50%, -120%)' }}
                >
                    {hoveredSupplier ? (
                        <div className="flex flex-col gap-1">
                            <span className="font-bold text-[11px] leading-tight">{hoveredSupplier.name}</span>
                            <div className="flex items-center gap-1.5 opacity-90">
                                <div className="size-2.5 rounded-[2px] border border-white/20" style={{ backgroundColor: hoveredSupplier.color }}></div>
                                <span className="text-[11px] font-medium tracking-wide">
                                    ${formatCurrency(hoveredSupplier.remaining)} <span className="text-gray-400">({hoveredSupplier.pct.toFixed(1)}%)</span>
                                </span>
                            </div>
                        </div>
                    ) : null}
                </div>
            )}

            {/* Aging Bucket Panel */}
            {selectedAgingBucket && agingSheetInfo && (
                <div
                    className="fixed inset-0 md:left-[var(--sidebar-w,15rem)] z-[65]"
                    role="button"
                    tabIndex={-1}
                    onClick={() => setSelectedAgingBucket(null)}
                    onKeyDown={(e) => e.key === 'Escape' && setSelectedAgingBucket(null)}
                >
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
                    <div
                        ref={sheetRef}
                        className="absolute bottom-0 left-0 right-0 rounded-t-2xl max-h-[75vh] animate-[slideUp_0.25s_ease-out] md:bottom-0 md:top-0 md:left-auto md:right-0 md:w-[420px] md:max-h-none md:rounded-none md:rounded-l-2xl md:animate-[slideInRight_0.3s_ease-out] bg-white dark:bg-surface-dark shadow-2xl flex flex-col"
                        style={sheetDragY > 0 ? { transform: `translateY(${sheetDragY}px)`, transition: 'none' } : { transition: 'transform 0.3s ease' }}
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-label={agingSheetInfo.title}
                    >
                        <div className="flex md:hidden justify-center pt-3 pb-1 shrink-0">
                            <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
                        </div>
                        <div className="flex items-center justify-between px-4 pt-3 pb-3 md:pt-4 md:pb-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                            <div className="flex items-center gap-2.5">
                                <div className="size-3 rounded-full shrink-0" style={{ backgroundColor: agingSheetInfo.color }} />
                                <div>
                                    <h3 className="font-bold text-gray-900 dark:text-white text-sm">{agingSheetInfo.title}</h3>
                                    <p className="text-[11px] text-gray-400">
                                        {agingSheetCreditors.length} proveedor{agingSheetCreditors.length !== 1 ? 'es' : ''} · {formatCurrencyK(agingSheetCreditors.reduce((s, c) => s + c.remaining, 0))}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedAgingBucket(null)}
                                className="size-8 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                aria-label="Cerrar"
                            >
                                <span className="material-symbols-outlined text-xl">close</span>
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            {agingSheetCreditors.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-gray-400 gap-2">
                                    <span className="material-symbols-outlined text-3xl">check_circle</span>
                                    <p className="text-sm font-medium">Sin proveedores en este rango</p>
                                </div>
                            ) : agingSheetCreditors.map(creditor => {
                                const group = creditorGroups.find(g => g.name === creditor.name);
                                return (
                                    <div
                                        key={creditor.name}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => group && (setAgingBucketOrigin(selectedAgingBucket), setSelectedAgingBucket(null), setSelectedCreditor(group))}
                                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && group && (setAgingBucketOrigin(selectedAgingBucket), setSelectedAgingBucket(null), setSelectedCreditor(group))}
                                        className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-800 transition-colors ${group ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40' : ''}`}
                                    >
                                        <div className="size-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0 font-bold text-sm text-gray-600 dark:text-gray-300">
                                            {creditor.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{creditor.name}</p>
                                            <p className={`text-xs font-bold ${agingSheetInfo.textCls}`}>
                                                ${formatCurrency(creditor.remaining)}
                                            </p>
                                        </div>
                                        {group && <span className="material-symbols-outlined text-base text-gray-400 shrink-0">chevron_right</span>}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Creditor Detail Modal */}
            {selectedCreditor && !showPaymentModal && !showClearConfirm && (
                <div className="fixed inset-0 md:left-[var(--sidebar-w,15rem)] z-[56] flex items-stretch justify-end animate-[fadeIn_0.2s_ease-out]">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" role="button" tabIndex={-1} onClick={handleCloseCreditorDetail} onKeyDown={(e) => e.key === 'Escape' && handleCloseCreditorDetail()} aria-label="Cerrar" />
                    <div className="relative bg-surface-light dark:bg-surface-dark w-full min-[480px]:max-w-md md:max-w-lg h-full flex flex-col shadow-2xl border-0 min-[480px]:border-l border-gray-200 dark:border-gray-700 overflow-hidden animate-[slideInRight_0.3s_cubic-bezier(0.16,1,0.3,1)]">
                        {/* Header */}
                        <div className="px-4 py-2 md:px-5 md:py-3 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-white dark:bg-surface-dark shrink-0">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <button
                                    onClick={handleCloseCreditorDetail}
                                    className="min-[480px]:hidden size-8 text-gray-600 dark:text-gray-300 flex items-center justify-center shrink-0 -ml-1"
                                    aria-label="Volver"
                                >
                                    <span className="material-symbols-outlined text-xl">arrow_back</span>
                                </button>
                                <div className="flex-1 min-w-0">
                                    <h2 className="text-base md:text-lg font-semibold text-gray-900 dark:text-white truncate">{selectedCreditor.name}</h2>
                                    <p className="text-[10px] text-gray-500">{selectedCreditor.debts.filter(d => d.total_amount > 0).length} compra{selectedCreditor.debts.filter(d => d.total_amount > 0).length !== 1 ? 's' : ''}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => {
                                        const s = suppliers.find(s => s.name === selectedCreditor.name);
                                        setEditName(selectedCreditor.name);
                                        setEditNit(s?.nit || '');
                                        setEditPhone(s?.phone || '');
                                        setEditAddress(s?.address || '');
                                        setShowEditModal(true);
                                    }}
                                    className="h-8 md:h-9 px-3 text-gray-500 hover:text-blue-500 transition-colors bg-gray-50 dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center text-[11px] font-bold"
                                    aria-label="Editar proveedor"
                                >
                                    Editar
                                </button>
                                <button
                                    onClick={() => setShowDeleteConfirm(selectedCreditor.name)}
                                    className="size-8 md:size-9 text-gray-400 hover:text-red-500 transition-colors bg-gray-50 dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center"
                                    aria-label="Eliminar proveedor"
                                >
                                    <span className="material-symbols-outlined text-base">delete</span>
                                </button>
                                <button
                                    onClick={handleCloseCreditorDetail}
                                    className="hidden min-[480px]:flex size-9 text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 transition-colors bg-gray-50 dark:bg-gray-800 rounded-full border border-gray-200 dark:border-gray-700 items-center justify-center"
                                >
                                    <span className="material-symbols-outlined text-xl">close</span>
                                </button>
                            </div>
                        </div>

                        {/* Supplier Details */}
                        {(() => {
                            const supplierData = suppliers.find(s => s.name === selectedCreditor.name);
                            if (!supplierData || (!supplierData.nit && !supplierData.phone && !supplierData.address)) return null;
                            return (
                                <div className="px-4 md:px-6 py-2 flex flex-wrap gap-x-5 gap-y-1 border-b border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-black/10 shrink-0">
                                    {supplierData.nit && (
                                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                            <span className="material-symbols-outlined text-sm text-gray-400">badge</span>
                                            <span className="font-bold">NIT:</span> {supplierData.nit}
                                        </div>
                                    )}
                                    {supplierData.phone && (
                                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                            <span className="material-symbols-outlined text-sm text-gray-400">phone</span>
                                            {supplierData.phone}
                                        </div>
                                    )}
                                    {supplierData.address && (
                                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                                            <span className="material-symbols-outlined text-sm text-gray-400">location_on</span>
                                            {supplierData.address}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Balance */}
                        <div className="px-4 py-2 md:px-5 md:py-3 grid grid-cols-2 gap-2 bg-gray-50/50 dark:bg-black/20 shrink-0">
                            <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 px-3 py-2 rounded-xl flex flex-col justify-between">
                                <p className="text-[9px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wide">Deuda Actual</p>
                                <p className="text-xl md:text-2xl font-black text-red-700 dark:text-red-400">${formatCurrency(selectedCreditor.remaining)}</p>
                            </div>
                            <div className={`border px-3 py-2 rounded-xl flex flex-col justify-between ${
                                selectedCreditorOverdue > 0
                                    ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30'
                                    : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700'
                            }`}>
                                <div className="flex items-center justify-between gap-1">
                                    <p className={`text-[9px] font-bold uppercase tracking-wide ${
                                        selectedCreditorOverdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'
                                    }`}>
                                        Vencido
                                    </p>
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded leading-none ${
                                        selectedCreditorOverdue > 0
                                            ? 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40'
                                            : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
                                    }`}>
                                        {selectedCreditorOverdue > 0 ? 'En mora' : 'Al día'}
                                    </span>
                                </div>
                                <p className={`text-xl md:text-2xl font-black ${
                                    selectedCreditorOverdue > 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                                }`}>
                                    ${formatCurrency(selectedCreditorOverdue)}
                                </p>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="px-4 md:px-5 flex gap-2 py-2 shrink-0">
                            <button
                                onClick={() => {
                                    setCreditorNameInput(selectedCreditor?.name || '');
                                    setShowNewDebtModal(true);
                                }}
                                className="group flex-1 h-10 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl transition-all flex items-center justify-center gap-2"
                            >
                                <span className="material-symbols-outlined text-base">add</span>
                                <span className="text-xs font-black text-gray-800 dark:text-gray-100">Deuda</span>
                            </button>
                            <button
                                onClick={() => {
                                    setPaymentAmount('');
                                    setPaymentMethod('Efectivo');
                                    setPaymentNotes('');
                                    setShowPaymentModal(true);
                                }}
                                className="group flex-1 h-10 bg-[#009459] hover:bg-[#007a49] text-white rounded-xl transition-all flex items-center justify-center gap-2 shadow-md shadow-[#009459]/20 border border-transparent"
                            >
                                <span className="material-symbols-outlined text-base">add</span>
                                <span className="text-xs font-black">Abono</span>
                            </button>
                        </div>

                        {/* Movements List */}
                        <div 
                            className="px-4 py-2 md:px-5 md:py-3 flex-1 overflow-y-auto custom-scrollbar"
                            onScroll={handleMovementsScroll}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                    <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-1.5 text-[10px] uppercase tracking-wider">
                                        <span className="material-symbols-outlined text-gray-400 text-sm">history</span>
                                        Movimientos {totalMovementsCount > 0 && `(${totalMovementsCount})`}
                                    </h3>
                                    {totalMovementsCount > 0 && (
                                        <span className="text-[10px] text-gray-400 font-medium">
                                            · Mostrando {creditorMovements.length} de {totalMovementsCount}
                                        </span>
                                    )}
                                </div>
                                {totalMovementsCount > 0 && (
                                    <button
                                        onClick={() => setShowClearConfirm(true)}
                                        className="text-[10px] text-red-500 hover:text-red-600 font-bold transition-colors"
                                    >
                                        Limpiar
                                    </button>
                                )}
                            </div>

                            {movementsLoading ? (
                                <div className="py-12 flex flex-col items-center justify-center gap-2 text-gray-400 text-xs">
                                    <span className="material-symbols-outlined text-xl animate-spin">progress_activity</span>
                                    <span>Cargando movimientos...</span>
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    {creditorMovements.map(debt => {
                                        const isPaymentRecord = debt.total_amount === 0 && debt.paid_amount > 0;
                                        const isCashPurchase = !isPaymentRecord && debt.status === 'paid' && debt.paid_amount >= debt.total_amount;
                                        const desc = debt.description || '';
                                        const cleanDesc = desc.replace(/\s*\[Pago dividido:[^\]]*\]/i, '').trim();
                                        const productMatch = desc.match(/^Compra (?:a crédito|de contado): (.+) \((\d+\s.+?)\)$/);
                                        const productName = productMatch ? productMatch[1] : null;
                                        const productQty = productMatch ? productMatch[2] : null;
                                        const paymentInfo = formatPaymentMethod(debt);

                                        return (
                                            <div
                                                key={debt.id}
                                                role="button"
                                                tabIndex={0}
                                                aria-haspopup="dialog"
                                                aria-label="Ver detalle del movimiento"
                                                onClick={() => setDetailMovement(debt)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        setDetailMovement(debt);
                                                    } else if (e.key === ' ' || e.key === 'Spacebar') {
                                                        e.preventDefault();
                                                        setDetailMovement(debt);
                                                    }
                                                }}
                                                className="flex items-stretch rounded-lg border overflow-hidden cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                                            >
                                                <div className="flex-1 min-w-0 flex items-center gap-2 md:gap-2.5 px-2.5 py-2 md:px-3 md:py-2.5">
                                                    <div className={`size-7 md:size-8 rounded-full flex items-center justify-center shrink-0 ${isPaymentRecord
                                                        ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                                        : isCashPurchase
                                                            ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                                                            : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                                        }`}>
                                                        <span className="material-symbols-outlined text-sm md:text-base">
                                                            {isPaymentRecord ? 'payments' : isCashPurchase ? 'paid' : 'shopping_cart'}
                                                        </span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-1.5">
                                                            <div className="flex items-center gap-1 flex-wrap min-w-0">
                                                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider shrink-0 ${isPaymentRecord
                                                                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                                                                    : isCashPurchase
                                                                        ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                                                                        : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                                                                    }`}>
                                                                    {isPaymentRecord ? 'Abono' : isCashPurchase ? 'Contado' : 'Crédito'}
                                                                </span>
                                                                {paymentInfo && (
                                                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider shrink-0 ${
                                                                        paymentInfo.label.includes('+') || paymentInfo.label === 'Dividido' ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' :
                                                                        paymentInfo.label === 'Nequi' ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' :
                                                                        paymentInfo.label === 'Daviplata' ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' :
                                                                        paymentInfo.label === 'Tarjeta' ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' :
                                                                        paymentInfo.label === 'Transferencia' ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' :
                                                                        'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                                                    }`}>
                                                                        {paymentInfo.label}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className={`font-bold text-xs md:text-sm shrink-0 ${isPaymentRecord
                                                                ? 'text-blue-600 dark:text-blue-400'
                                                                : isCashPurchase
                                                                    ? 'text-green-600 dark:text-green-400'
                                                                    : 'text-red-600 dark:text-red-400'
                                                                }`}>
                                                                {isPaymentRecord ? '+' : isCashPurchase ? '' : '-'}${formatCurrency(isPaymentRecord ? debt.paid_amount : debt.total_amount)}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs md:text-sm font-bold text-gray-900 dark:text-white truncate mt-0.5">
                                                            {isPaymentRecord
                                                                ? (cleanDesc.replace(/^Abono:\s*/, '').trim() || 'Pago registrado')
                                                                : productName || cleanDesc || 'Compra registrada'}
                                                        </p>
                                                        <div className="flex items-center mt-0.5">
                                                            <span className="text-[10px] md:text-[11px] text-gray-500 dark:text-gray-400 flex-1">
                                                                {new Date(debt.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                                {!isPaymentRecord && productQty && ` · ${productQty}`}
                                                            </span>
                                                            {!debt.evidence_url && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setViewerDebt(debt); }}
                                                                    className="size-6 flex items-center justify-center text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors mr-1"
                                                                    aria-label="Adjuntar evidencia"
                                                                >
                                                                    <span className="material-symbols-outlined text-sm">attach_file</span>
                                                                </button>
                                                            )}
                                                            {isPaymentRecord && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleDeletePayment(debt); }}
                                                                    className="size-6 flex items-center justify-center text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                                                    aria-label="Eliminar abono"
                                                                >
                                                                    <span className="material-symbols-outlined text-sm">delete</span>
                                                                </button>
                                                            )}
                                                            {!isPaymentRecord && debt.inventory_lot_id && (
                                                                <div className="flex gap-1">
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleOpenEditPurchase(debt); }}
                                                                        className="size-6 flex items-center justify-center text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                                                                        aria-label="Editar compra"
                                                                    >
                                                                        <span className="material-symbols-outlined text-sm">edit</span>
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleDeletePurchase(debt); }}
                                                                        className="size-6 flex items-center justify-center text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                                                        aria-label="Eliminar compra"
                                                                    >
                                                                        <span className="material-symbols-outlined text-sm">delete</span>
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <span
                                                        className="material-symbols-outlined text-base shrink-0 text-gray-400"
                                                        aria-hidden="true"
                                                    >
                                                        chevron_right
                                                    </span>
                                                </div>
                                                {debt.evidence_url && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setViewerDebt(debt); }}
                                                        className="self-stretch w-14 md:w-16 shrink-0 overflow-hidden border-l border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-400"
                                                        aria-label="Ver evidencia"
                                                    >
                                                        <img src={debt.evidence_url} alt="Evidencia" className="w-full h-full object-cover" />
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {movementsLoadingMore && (
                                        <div className="py-2.5 flex items-center justify-center gap-2 text-gray-400 text-xs font-medium">
                                            <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                                            <span>Cargando más movimientos...</span>
                                        </div>
                                    )}
                                    {hasMoreMovements && !movementsLoadingMore && (
                                        <div className="py-2 text-center">
                                            <button
                                                type="button"
                                                onClick={fetchMoreMovements}
                                                className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 text-xs font-bold text-gray-600 dark:text-gray-300 rounded-lg transition-all inline-flex items-center gap-1"
                                            >
                                                <span className="material-symbols-outlined text-sm">expand_more</span>
                                                Cargar más ({totalMovementsCount - creditorMovements.length} restantes)
                                            </button>
                                        </div>
                                    )}
                                    {!movementsLoading && creditorMovements.length === 0 && (
                                        <div className="text-center py-4 opacity-50">
                                            <p className="text-gray-400 text-xs">No hay movimientos registrados.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div >
            )}

            {/* New Debt Modal */}
            {
                showNewDebtModal && (
                    <div className="fixed inset-0 md:left-[var(--sidebar-w,15rem)] z-[60] flex items-end md:items-center justify-center md:p-4 animate-[fadeIn_0.2s_ease-out]">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" role="button" tabIndex={-1} onClick={() => setShowNewDebtModal(false)} onKeyDown={(e) => e.key === 'Escape' && setShowNewDebtModal(false)} aria-label="Cerrar" />
                        <div className="relative bg-white dark:bg-surface-dark md:rounded-2xl rounded-t-3xl w-full max-w-sm p-6 shadow-2xl border border-gray-200 dark:border-gray-700 animate-[slideUp_0.3s_ease-out] md:animate-none">
                            <div className="flex justify-between items-start mb-6">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Nueva Deuda</h3>
                                <button onClick={() => setShowNewDebtModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            <form onSubmit={handleCreateDebt} className="space-y-4">
                                <div>
                                    <label htmlFor="debt-creditor-name" className="block text-xs font-bold text-gray-500 uppercase mb-1">Proveedor / Acreedor <span className="text-red-500">*</span></label>
                                    <div className="relative flex gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                id="debt-creditor-name"
                                                type="text"
                                                value={creditorNameInput}
                                                onChange={e => {
                                                    setCreditorNameInput(e.target.value);
                                                    setShowSupplierList(true);
                                                }}
                                                onFocus={() => setShowSupplierList(true)}
                                                onBlur={() => setTimeout(() => setShowSupplierList(false), 200)} // Delay to allow click
                                                required
                                                className="w-full h-11 px-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-text-main dark:text-white text-sm focus:ring-2 focus:ring-primary focus:border-primary transition-colors outline-none"
                                                placeholder="Buscar o escribir nuevo..."
                                                autoFocus
                                            />
                                            {/* Dropdown Suggestions */}
                                            {showSupplierList && creditorNameInput && (
                                                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 max-h-48 overflow-auto">
                                                    {filteredSuppliers.map(supplier => (
                                                        <button
                                                            key={supplier.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setCreditorNameInput(supplier.name);
                                                                setShowSupplierList(false);
                                                            }}
                                                            className="w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 text-sm flex flex-col"
                                                        >
                                                            <span className="font-bold text-gray-800 dark:text-white">{supplier.name}</span>
                                                            {supplier.nit && <span className="text-[10px] text-gray-400">NIT: {supplier.nit}</span>}
                                                        </button>
                                                    ))}
                                                    {filteredSuppliers.length === 0 && (
                                                        <div className="px-4 py-3 text-center text-xs text-gray-400">
                                                            No se encontraron resultados
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setNewSupplierName(creditorNameInput);
                                                setNewSupplierNit('');
                                                setNewSupplierPhone('');
                                                setNewSupplierAddress('');
                                                setShowNewSupplierForm(true);
                                            }}
                                            className="h-11 px-4 flex items-center justify-center border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl transition-colors shrink-0 text-sm shadow-sm"
                                            title="Crear nuevo proveedor"
                                        >
                                            Crear
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="debt-description" className="block text-xs font-bold text-gray-500 uppercase mb-1">Descripción</label>
                                    <input
                                        id="debt-description"
                                        name="description"
                                        type="text"
                                        className="w-full h-11 px-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-text-main dark:text-white text-sm focus:ring-2 focus:ring-primary focus:border-primary transition-colors outline-none"
                                        placeholder="Ej: Compra de insumos"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="debt-total-amount" className="block text-xs font-bold text-gray-500 uppercase mb-1">Monto Total <span className="text-red-500">*</span></label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 font-bold">$</span>
                                        <input
                                            id="debt-total-amount"
                                            name="total_amount"
                                            type="text"
                                            inputMode="numeric"
                                            required
                                            className="w-full h-12 pl-7 pr-4 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-text-main dark:text-white text-lg font-bold focus:ring-2 focus:ring-primary focus:border-primary transition-colors outline-none"
                                            placeholder="0"
                                            onChange={(e) => { e.target.value = formatNumber(e.target.value); }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="debt-due-date" className="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha Límite</label>
                                    <input
                                        id="debt-due-date"
                                        name="due_date"
                                        type="date"
                                        className="w-full h-11 px-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-text-main dark:text-white text-sm focus:ring-2 focus:ring-primary focus:border-primary transition-colors outline-none"
                                    />
                                </div>
                                <div className="pt-4">
                                    <button
                                        type="submit"
                                        disabled={actionLoading}
                                        className="w-full h-12 bg-[#009459] hover:bg-[#007a49] text-white font-bold rounded-xl shadow-md shadow-[#009459]/20 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
                                    >
                                        {actionLoading ? <><svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Registrando...</> : 'Registrar Deuda'}
                                    </button>
                                </div>
                            </form >
                        </div >
                    </div >
                )
            }

            {/* Payment Modal */}
            {
                showPaymentModal && selectedCreditor && (
                    <div className="fixed inset-0 md:left-[var(--sidebar-w,15rem)] z-[60] flex items-end md:items-center justify-center md:p-4 animate-[fadeIn_0.2s_ease-out]">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" role="button" tabIndex={-1} onClick={() => setShowPaymentModal(false)} onKeyDown={(e) => e.key === 'Escape' && setShowPaymentModal(false)} aria-label="Cerrar" />
                        <div className="relative bg-white dark:bg-surface-dark md:rounded-2xl rounded-t-3xl w-full max-w-sm p-6 shadow-2xl border border-gray-200 dark:border-gray-700 animate-[slideUp_0.3s_ease-out] md:animate-none">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Registrar Abono</h3>
                            <p className="text-sm text-gray-500 mb-1">
                                Para: <span className="font-bold text-text-main dark:text-white">{selectedCreditor.name}</span>
                            </p>
                            <p className="text-xs text-gray-400 mb-6">
                                Pendiente: <span className="font-bold text-red-500">${formatCurrency(selectedCreditor.remaining)}</span>
                            </p>
                            <form onSubmit={handleAddPayment} className="space-y-4">
                                {!activeShift && (
                                    <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                                        <svg className="size-4 text-amber-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                                        <p className="text-xs text-amber-700 dark:text-amber-300">Sin turno activo — el abono quedará en la deuda pero <strong>no generará egreso de caja</strong>. Abre un turno antes de abonar para mantener el cuadre.</p>
                                    </div>
                                )}
                                <div>
                                    <label htmlFor="payment-amount" className="block text-xs font-bold text-gray-500 uppercase mb-1">Monto</label>
                                    <div className="relative">
                                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 font-bold">$</span>
                                        <input
                                            id="payment-amount"
                                            type="text"
                                            autoFocus
                                            required
                                            value={paymentAmount}
                                            onChange={(e) => setPaymentAmount(formatNumber(e.target.value))}
                                            className="w-full h-12 pl-7 pr-4 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-text-main dark:text-white text-lg font-bold focus:ring-2 focus:ring-primary focus:border-primary transition-colors outline-none"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label htmlFor="payment-notes" className="block text-xs font-bold text-gray-500 uppercase mb-1">Descripción</label>
                                    <input
                                        id="payment-notes"
                                        type="text"
                                        value={paymentNotes}
                                        onChange={(e) => setPaymentNotes(e.target.value)}
                                        className="w-full h-11 px-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-text-main dark:text-white text-sm focus:ring-2 focus:ring-primary focus:border-primary transition-colors outline-none"
                                        placeholder="Ej: Pago en efectivo"
                                    />
                                </div>
                                {activeShift && (
                                    <div className="pt-2">
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2 tracking-[0.12em]">Medio de Pago</label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {paymentMethods.map(m => (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    onClick={() => setPaymentMethod(m)}
                                                    className={`py-2 px-1 rounded-xl border text-[10px] font-bold transition-all truncate ${paymentMethod === m
                                                        ? 'border-[#009459] bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                                                        : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'
                                                        }`}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <EvidenceUploader compact
                                    previewUrl={paymentEvidence.previewUrl}
                                    uploading={paymentEvidence.uploading}
                                    statusText={paymentEvidence.statusText}
                                    showCropper={paymentEvidence.showCropper}
                                    cropperImageSrc={paymentEvidence.cropperImageSrc}
                                    onCropComplete={paymentEvidence.onCropComplete}
                                    onCropCancel={paymentEvidence.onCropCancel}
                                    showInAppCamera={paymentEvidence.showInAppCamera}
                                    onCameraCapture={paymentEvidence.onCameraCapture}
                                    onCameraClose={paymentEvidence.onCameraClose}
                                    triggerCamera={paymentEvidence.triggerCamera}
                                    triggerGallery={paymentEvidence.triggerGallery}
                                    deleteImage={paymentEvidence.deleteImage}
                                />
                                <div className="flex gap-3 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setShowPaymentModal(false)}
                                        className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={actionLoading || (activeShift ? !paymentMethod : false) || parseNumber(paymentAmount) <= 0}
                                        className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-md shadow-green-600/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        {actionLoading ? <><svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Guardando...</> : 'Confirmar'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* Clear Confirmation */}
            {
                showClearConfirm && selectedCreditor && (
                    <div className="fixed inset-0 md:left-[var(--sidebar-w,15rem)] z-[70] flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" role="button" tabIndex={-1} onClick={() => setShowClearConfirm(false)} onKeyDown={(e) => e.key === 'Escape' && setShowClearConfirm(false)} aria-label="Cerrar" />
                        <div className="relative bg-white dark:bg-surface-dark rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-gray-200 dark:border-gray-700">
                            <div className="text-center">
                                <div className="size-14 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                                    <span className="material-symbols-outlined text-3xl text-red-600 dark:text-red-400">delete_forever</span>
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">¿Limpiar historial?</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                                    Se eliminarán todos los movimientos de <span className="font-bold text-gray-700 dark:text-gray-200">{selectedCreditor.name}</span> y la deuda se reiniciará a $0. Esta acción no se puede deshacer.
                                </p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowClearConfirm(false)}
                                        className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleClearCreditor}
                                        disabled={actionLoading}
                                        className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md shadow-red-600/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                                    >
                                        {actionLoading ? <><svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Limpiando...</> : 'Limpiar'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Delete Creditor Confirm */}
            {
                showDeleteConfirm && (
                    <div className="fixed inset-0 md:left-[var(--sidebar-w,15rem)] z-[80] flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" role="button" tabIndex={-1} onClick={() => setShowDeleteConfirm(null)} onKeyDown={(e) => e.key === 'Escape' && setShowDeleteConfirm(null)} aria-label="Cerrar" />
                        <div className="relative bg-white dark:bg-surface-dark rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-gray-200 dark:border-gray-700">
                            <div className="text-center">
                                <div className="size-14 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                                    <span className="material-symbols-outlined text-3xl text-red-600 dark:text-red-400">delete</span>
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">¿Eliminar proveedor?</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                                    Se eliminará <span className="font-bold text-gray-700 dark:text-gray-200">{showDeleteConfirm}</span> y todas sus deudas asociadas. Esta acción no se puede deshacer.
                                </p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setShowDeleteConfirm(null)}
                                        className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={() => handleDeleteCreditor(showDeleteConfirm)}
                                        disabled={actionLoading}
                                        className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-md shadow-red-600/20 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                                    >
                                        {actionLoading ? <><svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Eliminando...</> : 'Eliminar'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Edit Creditor Modal */}
            {
                showEditModal && selectedCreditor && (
                    <div className="fixed inset-0 md:left-[var(--sidebar-w,15rem)] z-[80] flex items-end md:items-center justify-center md:p-4 animate-[fadeIn_0.2s_ease-out]">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" role="button" tabIndex={-1} onClick={() => setShowEditModal(false)} onKeyDown={(e) => e.key === 'Escape' && setShowEditModal(false)} aria-label="Cerrar" />
                        <div className="relative bg-white dark:bg-surface-dark md:rounded-2xl rounded-t-3xl w-full max-w-md p-6 shadow-2xl border border-gray-200 dark:border-gray-700 animate-[slideUp_0.3s_ease-out] md:animate-none">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Editar Proveedor</h3>
                            <div className="space-y-3">
                                <div>
                                    <label htmlFor="edit-supplier-name" className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-[0.12em]">Nombre *</label>
                                    <input
                                        id="edit-supplier-name"
                                        type="text"
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        placeholder="Nombre del proveedor"
                                        className="w-full h-11 px-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-800 dark:text-white outline-none focus:border-primary transition-colors"
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label htmlFor="edit-supplier-nit" className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-[0.12em]">NIT / Cédula</label>
                                    <input
                                        id="edit-supplier-nit"
                                        type="text"
                                        value={editNit}
                                        onChange={e => setEditNit(e.target.value)}
                                        placeholder="Opcional"
                                        className="w-full h-11 px-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-800 dark:text-white outline-none focus:border-primary transition-colors"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="edit-supplier-phone" className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-[0.12em]">Teléfono</label>
                                    <input
                                        id="edit-supplier-phone"
                                        type="tel"
                                        value={editPhone}
                                        onChange={e => setEditPhone(e.target.value)}
                                        placeholder="Opcional"
                                        className="w-full h-11 px-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-800 dark:text-white outline-none focus:border-primary transition-colors"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="edit-supplier-address" className="block text-[10px] font-black text-gray-400 mb-1.5 uppercase tracking-[0.12em]">Dirección</label>
                                    <input
                                        id="edit-supplier-address"
                                        type="text"
                                        value={editAddress}
                                        onChange={e => setEditAddress(e.target.value)}
                                        placeholder="Opcional"
                                        className="w-full h-11 px-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-800 dark:text-white outline-none focus:border-primary transition-colors"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-3 mt-5">
                                <button
                                    onClick={() => setShowEditModal(false)}
                                    className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleRenameCreditor}
                                    disabled={!editName.trim() || actionLoading}
                                    className="flex-1 py-3 bg-[#009459] hover:bg-[#007a49] text-white font-bold rounded-xl shadow-md shadow-[#009459]/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {actionLoading ? <><svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Guardando...</> : 'Guardar'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* New Supplier Modal (as requested) */}
            {
                showNewSupplierForm && (
                    <div className="fixed inset-0 md:left-[var(--sidebar-w,15rem)] z-[70] flex items-end md:items-center justify-center md:p-4 animate-[fadeIn_0.2s_ease-out]">
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" role="button" tabIndex={-1} onClick={() => setShowNewSupplierForm(false)} onKeyDown={(e) => e.key === 'Escape' && setShowNewSupplierForm(false)} aria-label="Cerrar" />
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
                                    <label htmlFor="new-supplier-name" className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-[0.12em]">Nombre *</label>
                                    <input
                                        id="new-supplier-name"
                                        type="text"
                                        value={newSupplierName}
                                        onChange={e => setNewSupplierName(e.target.value)}
                                        className="w-full h-11 px-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                        placeholder="Ej: Distribuidora ABC"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="new-supplier-nit" className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-[0.12em]">NIT / Cédula</label>
                                    <input
                                        id="new-supplier-nit"
                                        type="text"
                                        value={newSupplierNit}
                                        onChange={e => setNewSupplierNit(e.target.value)}
                                        className="w-full h-11 px-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                        placeholder=""
                                    />
                                </div>
                                <div>
                                    <label htmlFor="new-supplier-phone" className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-[0.12em]">Teléfono</label>
                                    <input
                                        id="new-supplier-phone"
                                        type="tel"
                                        value={newSupplierPhone}
                                        onChange={e => setNewSupplierPhone(e.target.value)}
                                        className="w-full h-11 px-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-sm font-bold text-gray-900 dark:text-white outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                                        placeholder=""
                                    />
                                </div>
                                <div>
                                    <label htmlFor="new-supplier-address" className="block text-[10px] font-black text-gray-500 mb-1.5 uppercase tracking-[0.12em]">Dirección</label>
                                    <input
                                        id="new-supplier-address"
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
                                    onClick={() => setShowNewSupplierForm(false)}
                                    className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={async () => {
                                        if (!newSupplierName.trim() || actionLoading) return;
                                        setActionLoading(true);
                                        try {
                                            await createSupplier({
                                                name: newSupplierName,
                                                nit: newSupplierNit,
                                                phone: newSupplierPhone,
                                                address: newSupplierAddress,
                                            });
                                            setCreditorNameInput(newSupplierName.trim());
                                            setShowNewSupplierForm(false);
                                            showToast('Proveedor creado correctamente', 'success');
                                        } catch (err: any) {
                                            console.error('Error creating supplier:', err);
                                            showToast(err.message || 'Error al crear proveedor', 'error');
                                        } finally {
                                            setActionLoading(false);
                                        }
                                    }}
                                    disabled={!newSupplierName.trim() || actionLoading}
                                    className="flex-1 py-3 bg-[#009459] hover:bg-[#007a49] text-white font-bold rounded-xl shadow-md shadow-[#009459]/20 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                                >
                                    {actionLoading ? <><svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Creando...</> : 'Crear Proveedor'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
            {
                editPurchaseDebt && (
                    <div className="fixed inset-0 md:left-[var(--sidebar-w,15rem)] z-50 flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" role="button" tabIndex={-1} onClick={() => setEditPurchaseDebt(null)} onKeyDown={(e) => e.key === 'Escape' && setEditPurchaseDebt(null)} aria-label="Cerrar" />
                        <div className="relative w-full max-w-sm bg-surface-light dark:bg-surface-dark rounded-3xl shadow-2xl overflow-hidden">
                            <div className="p-6">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="size-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">edit</span>
                                    </div>
                                    <h3 className="text-lg font-semibold text-text-main dark:text-white">Editar Compra</h3>
                                </div>

                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 font-medium">
                                    {editPurchaseDebt.description}
                                </p>

                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="edit-purchase-qty" className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Cantidad</label>
                                        <input
                                            id="edit-purchase-qty"
                                            type="number"
                                            value={editPurchaseQty}
                                            onChange={e => setEditPurchaseQty(e.target.value)}
                                            onWheel={e => (e.target as HTMLInputElement).blur()}
                                            className="w-full h-11 px-4 bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700 rounded-xl text-center text-lg font-bold text-text-main dark:text-white outline-none focus:border-blue-500"
                                            min="0"
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor="edit-purchase-cost" className="block text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Costo Total</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                                            <input
                                                id="edit-purchase-cost"
                                                type="number"
                                                value={editPurchaseCost}
                                                onChange={e => setEditPurchaseCost(e.target.value)}
                                                onWheel={e => (e.target as HTMLInputElement).blur()}
                                                className="w-full h-11 pl-7 pr-4 bg-gray-50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700 rounded-xl text-center text-lg font-bold text-text-main dark:text-white outline-none focus:border-blue-500"
                                                min="0"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-3 mt-6">
                                    <button
                                        onClick={() => setEditPurchaseDebt(null)}
                                        className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleSaveEditPurchase}
                                        disabled={actionLoading}
                                        className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                                    >
                                        {actionLoading ? 'Guardando...' : 'Guardar'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Movement Detail Modal */}
            {detailMovement && (() => {
                const isPaymentRecord = detailMovement.total_amount === 0 && detailMovement.paid_amount > 0;
                const isCashPurchase = !isPaymentRecord && detailMovement.status === 'paid' && detailMovement.paid_amount >= detailMovement.total_amount;
                const desc = detailMovement.description || '';
                const cleanDesc = desc.replace(/\s*\[Pago dividido:[^\]]*\]/i, '').trim();
                const employeeName = (detailMovement as any).created_by_name as string | null | undefined;
                const paymentInfo = formatPaymentMethod(detailMovement);
                const splitDetails = parseSplitDetails(detailMovement);

                return (
                    <div className="fixed inset-0 md:left-[var(--sidebar-w,15rem)] z-[70] flex items-end md:items-center justify-center md:p-4 animate-[fadeIn_0.2s_ease-out]">
                        <div
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                            role="button"
                            tabIndex={-1}
                            onClick={() => setDetailMovement(null)}
                            onKeyDown={(e) => e.key === 'Escape' && setDetailMovement(null)}
                            aria-label="Cerrar"
                        />
                        <div
                            role="dialog"
                            aria-modal="true"
                            aria-label="Detalle del movimiento"
                            className="relative bg-white dark:bg-surface-dark md:rounded-2xl rounded-t-3xl w-full max-w-sm p-6 shadow-2xl border border-gray-200 dark:border-gray-700 animate-[slideUp_0.3s_ease-out] md:animate-none"
                        >
                            {/* Header: badge + amount + close */}
                            <div className="flex items-start justify-between gap-3 mb-4">
                                <div className="flex flex-col gap-2 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider self-start ${isPaymentRecord
                                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400'
                                            : isCashPurchase
                                                ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                                                : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                                            }`}>
                                            {isPaymentRecord ? 'Abono' : isCashPurchase ? 'Contado' : 'Crédito'}
                                        </span>
                                        {paymentInfo && (
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${
                                                paymentInfo.label.includes('+') || paymentInfo.label === 'Dividido' ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' :
                                                paymentInfo.label === 'Nequi' ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' :
                                                paymentInfo.label === 'Daviplata' ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' :
                                                paymentInfo.label === 'Tarjeta' ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' :
                                                paymentInfo.label === 'Transferencia' ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' :
                                                'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                            }`}>
                                                {paymentInfo.label}
                                            </span>
                                        )}
                                    </div>
                                    <span className={`text-2xl font-black ${isPaymentRecord
                                        ? 'text-blue-600 dark:text-blue-400'
                                        : isCashPurchase
                                            ? 'text-green-600 dark:text-green-400'
                                            : 'text-red-600 dark:text-red-400'
                                        }`}>
                                        {isPaymentRecord ? '+' : isCashPurchase ? '' : '-'}${formatCurrency(isPaymentRecord ? detailMovement.paid_amount : detailMovement.total_amount)}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setDetailMovement(null)}
                                    className="size-9 shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full flex items-center justify-center transition-colors"
                                    aria-label="Cerrar"
                                >
                                    <span className="material-symbols-outlined text-xl">close</span>
                                </button>
                            </div>

                            {/* Fechas */}
                            <div className="space-y-1.5 mb-4 p-3 bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-gray-100 dark:border-gray-800">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm text-gray-400">schedule</span>
                                        Fecha de ingreso:
                                    </span>
                                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                                        {new Date(detailMovement.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })} {new Date(detailMovement.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                                {detailMovement.document_date && (
                                    <div className="flex items-center justify-between text-xs pt-1.5 border-t border-gray-200/50 dark:border-gray-700/50">
                                        <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-sm text-gray-400">receipt_long</span>
                                            Fecha de factura:
                                        </span>
                                        <span className="font-semibold text-gray-800 dark:text-gray-200">
                                            {new Date(detailMovement.document_date + 'T12:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Método de pago y desglose dividido */}
                            {paymentInfo && (
                                <div className="mb-4">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1.5">Método de pago</p>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                                            {paymentInfo.label}
                                        </span>
                                    </div>
                                    {splitDetails && splitDetails.length > 0 && (
                                        <div className="mt-2 space-y-1.5 bg-gray-50 dark:bg-gray-800/50 p-2.5 rounded-lg border border-gray-100 dark:border-gray-700">
                                            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Desglose:</p>
                                            {splitDetails.map((item, idx) => (
                                                <div key={idx} className="flex items-center justify-between text-xs text-gray-700 dark:text-gray-300">
                                                    <span>{normalizeMethodName(item.method)}</span>
                                                    <span className="font-bold">${formatCurrency(item.amount)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Descripción */}
                            <div className="mb-4">
                                <p className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1.5">Descripción</p>
                                <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words">
                                    {cleanDesc ? cleanDesc : 'Sin descripción'}
                                </p>
                            </div>

                            {/* Empleado */}
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-800">
                                <span className="material-symbols-outlined text-sm text-gray-400">person</span>
                                {employeeName ? `Registrado por: ${employeeName}` : 'Empleado no registrado'}
                            </div>

                            {/* Cerrar */}
                            <button
                                onClick={() => setDetailMovement(null)}
                                className="mt-5 w-full py-3 bg-amber-400 hover:bg-amber-500 text-gray-900 font-bold rounded-xl transition-colors"
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                );
            })()}

            {viewerDebt && selectedCreditor && (
                <EvidenceViewer
                    debt={viewerDebt}
                    supplierName={selectedCreditor.name}
                    onClose={() => setViewerDebt(null)}
                    onEvidenceChange={async (debtId, url) => {
                        await updateDebtEvidence(debtId, url);
                        setViewerDebt((prev: any) => prev ? { ...prev, evidence_url: url } : prev);
                    }}
                />
            )}

            {
                blockedMessage && (
                    <div className="fixed inset-0 md:left-[var(--sidebar-w,15rem)] z-50 flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" role="button" tabIndex={-1} onClick={() => setBlockedMessage(null)} onKeyDown={(e) => e.key === 'Escape' && setBlockedMessage(null)} aria-label="Cerrar" />
                        <div className="relative w-full max-w-sm bg-surface-light dark:bg-surface-dark rounded-3xl shadow-2xl overflow-hidden">
                            <div className="p-6 text-center">
                                <div className="size-14 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mx-auto mb-4">
                                    <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-3xl">warning</span>
                                </div>
                                <h3 className="text-lg font-semibold text-text-main dark:text-white mb-3">Eliminación bloqueada</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line leading-relaxed">
                                    {blockedMessage}
                                </p>
                                <button
                                    onClick={() => setBlockedMessage(null)}
                                    className="mt-5 w-full py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                >
                                    Entendido
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};
