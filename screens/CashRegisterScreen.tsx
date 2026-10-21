import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Screen } from '../types';
import { useCashRegister, DENOMINATIONS, CashShift, CashMovement } from '../hooks/useCashRegister';
import { useToast } from '../context/ToastContext';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { useAuth } from '../context/AuthContext';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { usePermissions } from '../hooks/usePermissions';
import { useIsMobile } from '../hooks/useIsMobile';
import { ScreenLoader } from '../components/ScreenLoader';
import { formatTimeInTz, formatDateInTz } from '../lib/timezone';
import { buildShiftReportData, downloadShiftReportPDF, sendShiftReportByEmail, ReportMovement } from '../lib/shiftReport';
import type { ShiftReportData } from '../types';
import { supabase } from '../lib/supabase';
import { HIDDEN_PRICES_BUSINESS_ID, TEST_BUSINESS_ID } from '../lib/specialBusinesses';
import { connectPrinter, probePrinterReachable, printShiftReportDirect, getDefaultPrinter, setDefaultPrinter, getRegisteredPrinters, getPrinterStatusFor } from '../lib/thermalPrinterService';
import { EmailReceiptModal } from '../components/EmailReceiptModal';
import { useBusinessPaymentMethods, ReportLine } from '../lib/paymentMethods';
import { RefundSaleModal } from '../components/modals/RefundSaleModal';
import { CustomDateRangePicker } from '../components/dashboard/CustomDateRangePicker';

export type HistoryFilter = '10' | '30' | 'today' | 'week' | 'month' | 'custom';

export const PERIOD_LABELS: Record<HistoryFilter, string> = {
    '10': 'Últimos 10 turnos',
    '30': 'Últimos 30 turnos',
    today: 'Hoy',
    week: 'Últimos 7 días',
    month: 'Este mes',
    custom: 'Personalizado',
};

const toInputDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const formatDateRange = (startStr: string, endStr: string): string => {
    const [sy, sm, sd] = startStr.split('-');
    const [ey, em, ed] = endStr.split('-');
    const sMonth = MONTHS_SHORT[parseInt(sm) - 1];
    const eMonth = MONTHS_SHORT[parseInt(em) - 1];
    if (sy === ey && sm === em) return `${parseInt(sd)} – ${parseInt(ed)} ${eMonth} ${ey}`;
    if (sy === ey) return `${parseInt(sd)} ${sMonth} – ${parseInt(ed)} ${eMonth} ${ey}`;
    return `${parseInt(sd)} ${sMonth} ${sy} – ${parseInt(ed)} ${eMonth} ${ey}`;
};

const PAYMENT_METHOD_LABELS: Record<string, { label: string; icon: string; color: string }> = {
    cash: { label: 'Efectivo', icon: 'payments', color: 'text-green-600 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' },
    nequi: { label: 'Nequi', icon: 'phone_android', color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800' },
    daviplata: { label: 'Daviplata', icon: 'phone_android', color: 'text-red-600 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' },
    card: { label: 'Tarjeta', icon: 'credit_card', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800' },
    transfer: { label: 'Transferencia', icon: 'account_balance', color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800' },
    other: { label: 'Otro', icon: 'more_horiz', color: 'text-gray-600 bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-700' },
};

interface CashRegisterScreenProps {
    onNavigate: (screen: Screen) => void;
    onClose?: () => void;
}

type ViewMode = 'dashboard' | 'close' | 'history' | 'detail' | 'current_movements';

export const CashRegisterScreen: React.FC<CashRegisterScreenProps> = ({ onNavigate, onClose }) => {
    const { showToast } = useToast();
    const { confirmAction } = useConfirmDialog();
    const { timezone, receiptPaperWidth, businessName, businessNit, businessAddress, businessPhone, paymentMethodCategories } = useBusinessSettings();
    const businessPaymentMethods = useBusinessPaymentMethods();
    const {
        registers,
        activeShift,
        shifts,
        shiftsLoading,
        movements,
        hasMoreMovements,
        loadingMoreMovements,
        occupiedRegisters,
        loading,
        movementsLoading,
        error,
        fetchShifts,
        fetchMoreMovements,
        openShift,
        closeShift,
        addCashIn,
        addCashOut,
        addRefund,
        expectedCash,
        balances,
        getDifference,
        createRegister,
        ensureDefaultRegister,
        updateRegister,
        deleteRegister,
        clearShiftHistory,
        refetch,
    } = useCashRegister();

    const { canOpenShift, hasPermission, isSuperAdmin } = usePermissions();
    const { profile } = useAuth();
    const isAdmin = isSuperAdmin;
    // Personalización negocio 10001: botón "Productos" en el turno cerrado que
    // imprime el top de productos vendidos del turno (por ingreso). Ver
    // docs/personalizados/negocio-10001/personalizaciones.md
    const isNegocio10001 = profile?.business_id === HIDDEN_PRICES_BUSINESS_ID || profile?.business_id === TEST_BUSINESS_ID;
    // En móvil no autoenfocamos los inputs de monto (base inicial / efectivo
    // declarado) para no abrir el teclado del teléfono automáticamente.
    const isMobile = useIsMobile();
    const canClose = hasPermission('pos_close');
    const canRefund = hasPermission('pos_refund');
    const userCanOpen = canOpenShift();

    // View state
    const [viewMode, setViewMode] = useState<ViewMode>('dashboard');

    // Filtros del historial de turnos
    const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('10');
    const [isPeriodOpen, setIsPeriodOpen] = useState(false);
    const [isCustomOpen, setIsCustomOpen] = useState(false);
    const [appliedStart, setAppliedStart] = useState<string>(() => toInputDate(new Date()));
    const [appliedEnd, setAppliedEnd] = useState<string>(() => toInputDate(new Date()));

    // Cajero (sin admin_reports) solo ve SUS turnos cerrados; admin ve todos.
    const canSeeAllShifts = hasPermission('admin_reports');
    const closedShifts = useMemo(
        () => shifts.filter(s =>
            s.status !== 'open' && (canSeeAllShifts || s.opened_by === profile?.id)
        ),
        [shifts, canSeeAllShifts, profile?.id]
    );

    // ----- Anulaciones por turno -----
    // Se atan al turno por ventana de tiempo + cajero: una venta/ítem anulado
    // pertenece al turno cuyo opened_by == vendedor y cuyo rango contiene su created_at.
    const [voidedSalesRaw, setVoidedSalesRaw] = useState<any[]>([]);
    const [voidedItemsRaw, setVoidedItemsRaw] = useState<any[]>([]);
    const [refundsRaw, setRefundsRaw] = useState<any[]>([]);
    // Órdenes con descuento del negocio (para el indicador del listado). Se cruzan
    // con cada turno por ventana de tiempo (misma que total_sales) en el useMemo.
    const [discountOrdersRaw, setDiscountOrdersRaw] = useState<{ discount: number; created_at: string }[]>([]);

    // Trae anulaciones y devoluciones del negocio acotadas a los turnos visibles (optimización egress)
    const fetchVoidsAndRefunds = useCallback(async (oldestDate?: string) => {
        const bid = profile?.business_id;
        if (!bid || !navigator.onLine) return;

        let salesQuery = supabase
            .from('orders')
            .select('id, order_number, display_number, total, waiter_id, created_at, voided_at, void_reason')
            .eq('business_id', bid)
            .eq('status', 'voided');

        let itemsQuery = supabase
            .from('order_items')
            .select('id, product_name, quantity, total_price, voided_at, void_reason, order:orders!inner(order_number, display_number, business_id, waiter_id, created_at, status)')
            .eq('status', 'canceled')
            .not('voided_at', 'is', null)
            .eq('order.business_id', bid)
            .neq('order.status', 'voided');

        let refundsQuery = supabase
            .from('sale_refunds')
            .select('id, shift_id, total_amount, reason, created_at, order:orders(order_number, display_number), items:sale_refund_items(product_name, quantity)')
            .eq('business_id', bid);

        let discountsQuery = supabase
            .from('orders')
            .select('discount, created_at')
            .eq('business_id', bid)
            .eq('status', 'completed')
            .gt('discount', 0);

        if (oldestDate) {
            salesQuery = salesQuery.gte('created_at', oldestDate);
            itemsQuery = itemsQuery.gte('created_at', oldestDate);
            refundsQuery = refundsQuery.gte('created_at', oldestDate);
            discountsQuery = discountsQuery.gte('created_at', oldestDate);
        }

        const [salesRes, itemsRes, refundsRes, discountsRes] = await Promise.all([
            salesQuery,
            itemsQuery,
            refundsQuery,
            discountsQuery,
        ]);

        if (!salesRes.error) setVoidedSalesRaw(salesRes.data || []);
        if (!itemsRes.error) setVoidedItemsRaw(itemsRes.data || []);
        if (!refundsRes.error) setRefundsRaw(refundsRes.data || []);
        if (!discountsRes.error) {
            setDiscountOrdersRaw((discountsRes.data || []).map((o: any) => ({
                discount: Number(o.discount) || 0,
                created_at: o.created_at,
            })));
        }
    }, [profile?.business_id]);

    const lastFetchedHistoryFilterKeyRef = useRef<string | null>(null);
    const lastFetchedVoidsDateRef = useRef<string | null>(null);

    useEffect(() => {
        const handleShiftClosed = () => {
            lastFetchedHistoryFilterKeyRef.current = null;
            lastFetchedVoidsDateRef.current = null;
        };
        window.addEventListener('shift-closed', handleShiftClosed);
        return () => window.removeEventListener('shift-closed', handleShiftClosed);
    }, []);

    // Carga diferida (lazy): solo consulta turnos cerrados cuando el usuario entra al Historial
    useEffect(() => {
        if (viewMode !== 'history') return;

        const filterKey = `${historyFilter}_${appliedStart}_${appliedEnd}`;
        // Si ya tenemos los turnos de este filtro en memoria (ej. volviendo del detalle con "Atrás"),
        // no volver a consultar Supabase ni mostrar el spinner de carga
        if (lastFetchedHistoryFilterKeyRef.current === filterKey && shifts.length > 0) {
            return;
        }
        lastFetchedHistoryFilterKeyRef.current = filterKey;

        let limit = 10;
        let startDate: string | undefined;
        let endDate: string | undefined;
        const now = new Date();

        if (historyFilter === '10') {
            limit = 10;
        } else if (historyFilter === '30') {
            limit = 30;
        } else if (historyFilter === 'today') {
            limit = 50;
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            startDate = startOfDay.toISOString();
        } else if (historyFilter === 'week') {
            limit = 50;
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - 7);
            startDate = startOfWeek.toISOString();
        } else if (historyFilter === 'month') {
            limit = 100;
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            startDate = startOfMonth.toISOString();
        } else if (historyFilter === 'custom') {
            limit = 100;
            if (appliedStart) {
                startDate = new Date(`${appliedStart}T00:00:00`).toISOString();
            }
            if (appliedEnd) {
                endDate = new Date(`${appliedEnd}T23:59:59.999`).toISOString();
            }
        }

        fetchShifts(limit, startDate, endDate);
    }, [viewMode, historyFilter, appliedStart, appliedEnd, fetchShifts, shifts.length]);

    // Carga diferida de anulaciones/descuentos acotados a la fecha del turno más antiguo visible
    useEffect(() => {
        if (viewMode !== 'history' || closedShifts.length === 0) return;
        const oldestShift = closedShifts[closedShifts.length - 1];
        if (oldestShift?.opened_at) {
            if (lastFetchedVoidsDateRef.current === oldestShift.opened_at) return;
            lastFetchedVoidsDateRef.current = oldestShift.opened_at;
            fetchVoidsAndRefunds(oldestShift.opened_at);
        }
    }, [viewMode, closedShifts, fetchVoidsAndRefunds]);

    // Refresco puntual: solo si estamos en la vista de historial
    useEffect(() => {
        const handleVoidOrRefund = () => {
            if (viewMode === 'history' && closedShifts.length > 0) {
                const oldestShift = closedShifts[closedShifts.length - 1];
                fetchVoidsAndRefunds(oldestShift?.opened_at);
            }
        };
        window.addEventListener('sale-deleted', handleVoidOrRefund);
        return () => window.removeEventListener('sale-deleted', handleVoidOrRefund);
    }, [fetchVoidsAndRefunds, viewMode, closedShifts]);

    const refundsByShift = useMemo(() => {
        const map: Record<string, { id: string; label: string; amount: number; reason: string; items: string }[]> = {};
        for (const r of refundsRaw) {
            if (!r.shift_id) continue;
            const ord = (r as any).order;
            const itemsTxt = ((r as any).items || []).map((it: any) => `${it.product_name} x${it.quantity}`).join(' · ');
            (map[r.shift_id] ||= []).push({
                id: r.id,
                label: `Venta #${ord?.display_number || ord?.order_number || '—'}`,
                amount: Number(r.total_amount) || 0,
                reason: r.reason,
                items: itemsTxt,
            });
        }
        return map;
    }, [refundsRaw]);

    const voidsByShift = useMemo(() => {
        const map: Record<string, { kind: 'sale' | 'item'; label: string; amount: number; reason: string | null }[]> = {};
        const findShift = (waiterId: string | null, createdAt: string) => {
            const t = new Date(createdAt).getTime();
            return closedShifts.find(s =>
                s.opened_by === waiterId &&
                new Date(s.opened_at).getTime() <= t &&
                (s.closed_at ? t <= new Date(s.closed_at).getTime() : true)
            );
        };
        for (const o of voidedSalesRaw) {
            const sh = findShift(o.waiter_id, o.created_at);
            if (!sh) continue;
            (map[sh.id] ||= []).push({
                kind: 'sale',
                label: `Venta #${o.display_number || o.order_number}`,
                amount: Number(o.total) || 0,
                reason: o.void_reason,
            });
        }
        for (const it of voidedItemsRaw) {
            const ord = (it as any).order;
            const sh = findShift(ord?.waiter_id, ord?.created_at);
            if (!sh) continue;
            (map[sh.id] ||= []).push({
                kind: 'item',
                label: `${it.product_name} (de #${ord?.display_number || ord?.order_number})`,
                amount: Number(it.total_price) || 0,
                reason: it.void_reason,
            });
        }
        return map;
    }, [voidedSalesRaw, voidedItemsRaw, closedShifts]);

    // Descuentos por turno para el listado. Usa la MISMA ventana que total_sales
    // (negocio + tiempo del turno, sin filtrar por cajero), así el número del
    // listado coincide con el del detalle. Solo los turnos con descuento > 0
    // entran al mapa (los demás no muestran nada).
    const discountsByShift = useMemo(() => {
        const map: Record<string, { count: number; total: number }> = {};
        for (const shift of closedShifts) {
            const start = new Date(shift.opened_at).getTime();
            const end = shift.closed_at ? new Date(shift.closed_at).getTime() : Infinity;
            let count = 0;
            let total = 0;
            for (const o of discountOrdersRaw) {
                const t = new Date(o.created_at).getTime();
                if (t >= start && t < end) {
                    count++;
                    total += o.discount || 0;
                }
            }
            if (total > 0) map[shift.id] = { count, total };
        }
        return map;
    }, [discountOrdersRaw, closedShifts]);

    const availableRegisters = registers.filter(r => !occupiedRegisters[r.id]);

    // ¿Hay más de una caja en total? Define si mostramos el dropdown "Elegir caja"
    // (2+ cajas) o vamos directo a la Base Inicial con la única caja disponible.
    const hasMultipleRegisters = registers.length > 1;

    const isInitialLoadDone = useRef(false);

    useEffect(() => {
        if (!loading && !movementsLoading) {
            isInitialLoadDone.current = true;
        }
    }, [loading, movementsLoading]);


    // Auto-crear "Caja Principal" si el negocio no tiene ninguna caja activa.
    // Solo aplica a negocios sin caja (creados tras el backfill inicial) y solo
    // para quien puede abrir turno. Se ejecuta una vez por montaje.
    const ensuredRegisterRef = useRef(false);
    useEffect(() => {
        if (ensuredRegisterRef.current) return;
        if (loading || activeShift) return;
        if (!userCanOpen) return;
        if (registers.length === 0 && navigator.onLine) {
            ensuredRegisterRef.current = true;
            ensureDefaultRegister();
        }
    }, [loading, activeShift, registers.length, userCanOpen, ensureDefaultRegister]);

    const [selectedShift, setSelectedShift] = useState<CashShift | null>(null);
    // Turno cuyo detalle se está cargando (re-fetch completo desde el historial).
    const [loadingShiftId, setLoadingShiftId] = useState<string | null>(null);

    // Descuentos del turno seleccionado, calculados al vuelo desde `orders`.
    // Solo alimentan la UI del detalle (línea "Descuentos" + modal "Ver").
    // NO tocan el reporte impreso/PDF/correo (esos van por buildShiftReportData).
    // Cada entry es un descuento suelto: por producto (product_name != null) o
    // a la orden completa (product_name = null).
    const [shiftDiscounts, setShiftDiscounts] = useState<{ order_number: number; product_name: string | null; amount: number }[]>([]);
    const [showShiftDiscountsModal, setShowShiftDiscountsModal] = useState(false);
    const shiftDiscountsTotal = useMemo(
        () => shiftDiscounts.reduce((acc, d) => acc + (d.amount || 0), 0),
        [shiftDiscounts],
    );
    const [shiftRoundingAdjustment, setShiftRoundingAdjustment] = useState(0);

    // Abre el detalle de un turno del historial. La lista trae columnas recortadas
    // (optimización egress), así que aquí re-consultamos el turno COMPLETO por id:
    // el detalle y el REPORTE DIARIO (buildShiftReportData) necesitan todos los
    // campos (sales_by_method, declared_by_method, totales, closed_by_profile…).
    const handleOpenShiftDetail = async (shift: CashShift) => {
        if (loadingShiftId) return;
        // Turno offline (snapshot ya completo en memoria): abrir directo.
        if (String(shift.id).startsWith('offline_')) {
            offlineReportMovementsRef.current = [];
            setSelectedShift(shift);
            setViewMode('detail');
            return;
        }
        setLoadingShiftId(shift.id);
        try {
            const { data } = await supabase
                .from('cash_shifts')
                .select(`*, register:cash_registers(name), opened_by_profile:profiles!cash_shifts_opened_by_fkey(full_name), closed_by_profile:profiles!cash_shifts_closed_by_fkey(full_name)`)
                .eq('id', shift.id)
                .maybeSingle();
            if (data) {
                offlineReportMovementsRef.current = [];
                setSelectedShift(data as CashShift);
                setViewMode('detail');
            } else {
                showToast('No se pudo abrir el turno', 'warning');
            }
        } catch {
            showToast('No se pudo abrir el turno', 'warning');
        } finally {
            setLoadingShiftId(null);
        }
    };

    // Deep-link desde el visor de eventos (cierre de caja → "Ver reporte"):
    // ?shift=<cash_shift_id>. Abre el detalle del turno cerrado correspondiente.
    const [pendingShiftId] = useState<string | null>(() => {
        if (typeof window === 'undefined') return null;
        const p = new URLSearchParams(window.location.search);
        const s = p.get('shift');
        if (s) {
            p.delete('shift');
            const qs = p.toString();
            window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? '?' + qs : ''}${window.location.hash}`);
        }
        return s;
    });
    useEffect(() => {
        if (!pendingShiftId) return;
        let cancelled = false;
        (async () => {
            try {
                const { data } = await supabase
                    .from('cash_shifts')
                    .select(`*, register:cash_registers(name), opened_by_profile:profiles!cash_shifts_opened_by_fkey(full_name), closed_by_profile:profiles!cash_shifts_closed_by_fkey(full_name)`)
                    .eq('id', pendingShiftId)
                    .maybeSingle();
                if (cancelled) return;
                if (data && data.status !== 'open') {
                    setSelectedShift(data as CashShift);
                    setViewMode('detail');
                } else {
                    showToast('No se encontró el turno', 'warning');
                }
            } catch {
                if (!cancelled) showToast('No se pudo abrir el turno', 'warning');
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingShiftId]);

    // Opening shift form
    const [openingBalance, setOpeningBalance] = useState('');
    const [selectedRegisterId, setSelectedRegisterId] = useState('');
    // Dropdown "Elegir caja": solo aplica cuando hay 2+ cajas en total. Con una
    // sola caja no se muestra dropdown (se elige sola). Se cierra al hacer clic afuera.
    const [registerDropdownOpen, setRegisterDropdownOpen] = useState(false);
    const registerDropdownRef = useRef<HTMLDivElement>(null);

    // Caja actualmente elegida en el dropdown (solo cuando hay 2+). Con una sola
    // caja, la selección es implícita (availableRegisters[0]) y no se usa este valor.
    const selectedRegister = useMemo(
        () => registers.find(r => r.id === selectedRegisterId) || null,
        [registers, selectedRegisterId],
    );

    // Cierra el dropdown "Elegir caja" al hacer clic fuera de él.
    useEffect(() => {
        if (!registerDropdownOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (registerDropdownRef.current && !registerDropdownRef.current.contains(e.target as Node)) {
                setRegisterDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [registerDropdownOpen]);

    // Closing shift form
    const [countMode, setCountMode] = useState<'total' | 'denominations'>('total');
    const [declaredCash, setDeclaredCash] = useState('');
    const [denominationCounts, setDenominationCounts] = useState<Record<number, number>>({});
    const [closeNotes, setCloseNotes] = useState('');
    // Declarado por método (opcional): tarjeta / pagos en línea / otros
    const [declaredCard, setDeclaredCard] = useState('');
    const [declaredOnline, setDeclaredOnline] = useState('');
    const [declaredOther, setDeclaredOther] = useState('');
    // Transición de cierre: evita el parpadeo de "abrir turno" al confirmar el cierre
    const [isClosing, setIsClosing] = useState(false);

    // Movement form
    const [showMovementModal, setShowMovementModal] = useState<'cash_in' | 'cash_out' | 'refund' | null>(null);
    const [showRefundSaleModal, setShowRefundSaleModal] = useState(false);
    const [movementAmount, setMovementAmount] = useState('');
    const [movementLoading, setMovementLoading] = useState(false);
    const [movementDescription, setMovementDescription] = useState('');
    const [movementMethod, setMovementMethod] = useState('cash');

    // New register form
    const [showNewRegisterModal, setShowNewRegisterModal] = useState(false);
    const [newRegisterName, setNewRegisterName] = useState('');

    // Edit register state
    const [editingRegisterId, setEditingRegisterId] = useState<string | null>(null);
    const [editRegisterName, setEditRegisterName] = useState('');

    // Formatting helpers
    const formatNumber = (value: string) => {
        const rawValue = value.replace(/\D/g, '');
        return rawValue.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    };

    const parseNumber = (value: string) => {
        return parseFloat(value.replace(/\./g, '')) || 0;
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    };

    const formatTime = (dateString: string) => {
        return formatTimeInTz(dateString, timezone);
    };

    const formatDate = (dateString: string) => {
        return formatDateInTz(dateString, timezone, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });
    };

    // ===== Reporte de cierre de turno (REPORTE DIARIO) =====
    const [isPrintingReport, setIsPrintingReport] = useState(false);
    const [isDownloadingReport, setIsDownloadingReport] = useState(false);
    const [showReportEmailModal, setShowReportEmailModal] = useState(false);
    // Selección de impresora de ticket desde el reporte (Req 10.2 / patrón Req 6):
    // si no hay Impresora_Predeterminada_Ticket, se despliega la lista de impresoras
    // registradas para que el cajero elija una; esa elección se fija como predeterminada.
    const [showReportPrinterList, setShowReportPrinterList] = useState(false);
    const [reportPrintersToConnect, setReportPrintersToConnect] = useState<string[]>([]);
    const [isConnectingReportPrinter, setIsConnectingReportPrinter] = useState(false);
    // Negocio 10001: impresión del top de productos del turno. Reutiliza la lista
    // de selección de impresora del reporte; esta ref recuerda qué acción disparar
    // cuando el cajero elige una impresora ('report' = reporte diario, 'top' = productos).
    const [isPrintingTop, setIsPrintingTop] = useState(false);
    const pendingPrintActionRef = useRef<'report' | 'top'>('report');

    // Al abrir el cierre, precargar "Otros valores recibidos" con lo que la app ya
    // registró en el turno por cada método. El cajero puede editarlos; si no, queda el valor de la app.
    useEffect(() => {
        if (viewMode !== 'close') return;
        const prefill = (n: number) => formatNumber(String(Math.max(0, Math.round(n || 0))));
        setDeclaredCard(prefill(balances.card));
        setDeclaredOnline(prefill((balances.nequi || 0) + (balances.daviplata || 0) + (balances.transfer || 0)));
        setDeclaredOther(prefill(balances.other));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode]);

    // Movimientos capturados localmente al cerrar un turno offline (la BD aún no
    // los tiene). Permiten imprimir/descargar el REPORTE DIARIO sin internet.
    const offlineReportMovementsRef = useRef<ReportMovement[]>([]);

    // Al abrir el detalle de un turno, trae las órdenes con descuento de la misma
    // ventana que usa close_cash_shift para total_sales (business_id + tiempo),
    // así "Descuentos" cuadra con "Total Ventas". Turnos offline o sin closed_at
    // no se consultan (se muestra vacío).
    useEffect(() => {
        if (viewMode !== 'detail' || !selectedShift) {
            setShiftDiscounts([]);
            setShowShiftDiscountsModal(false);
            setShiftRoundingAdjustment(0);
            return;
        }
        const shift = selectedShift;
        const isOfflineShift = typeof shift.id === 'string' && shift.id.startsWith('offline_');
        if (isOfflineShift || !shift.opened_at) {
            setShiftDiscounts([]);
            setShiftRoundingAdjustment(0);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                let q = supabase
                    .from('orders')
                    .select('order_number, subtotal, discount, total, items:order_items(product_name, discount, discount_percent, unit_price, quantity)')
                    .eq('business_id', shift.business_id)
                    .eq('status', 'completed')
                    .gte('created_at', shift.opened_at);
                if (shift.closed_at) q = q.lt('created_at', shift.closed_at);
                const { data, error } = await q.order('order_number', { ascending: true });
                if (error) throw error;
                if (!cancelled) {
                    const entries: { order_number: number; product_name: string | null; amount: number }[] = [];
                    let totalRounding = 0;

                    for (const o of (data || [])) {
                        const orderNumber = Number(o.order_number) || 0;
                        const orderDiscount = Number(o.discount) || 0;
                        const orderSubtotal = Number(o.subtotal) || 0;
                        const unrounded = orderSubtotal - orderDiscount;
                        const adjusted = Math.round(Math.max(0, unrounded) / 50) * 50;
                        totalRounding += (adjusted - unrounded);

                        if (orderDiscount > 0) {
                            const items = (o as any).items || [];
                            let perItemTotal = 0;
                            for (const it of items) {
                                const line = Number(it.discount) || (
                                    it.discount_percent
                                        ? (Number(it.unit_price) || 0) * (Number(it.quantity) || 0) * (Number(it.discount_percent) || 0) / 100
                                        : 0
                                );
                                if (line > 0) {
                                    entries.push({
                                        order_number: orderNumber,
                                        product_name: it.product_name || null,
                                        amount: line,
                                    });
                                    perItemTotal += line;
                                }
                            }
                            const orderLevelDiscount = orderDiscount - perItemTotal;
                            if (orderLevelDiscount > 0.5) {
                                entries.push({
                                    order_number: orderNumber,
                                    product_name: null,
                                    amount: orderLevelDiscount,
                                });
                            }
                        }
                    }
                    setShiftDiscounts(entries);
                    setShiftRoundingAdjustment(Math.round(totalRounding));
                }
            } catch (e) {
                console.error('Error cargando descuentos del turno:', e);
                if (!cancelled) {
                    setShiftDiscounts([]);
                    setShiftRoundingAdjustment(0);
                }
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewMode, selectedShift?.id]);

    // Trae los movimientos del turno seleccionado y arma los datos del REPORTE DIARIO.
    // La sección de efectivo se calcula desde estos movimientos para que cuadre.
    const getReportData = async (): Promise<ShiftReportData | null> => {
        if (!selectedShift) return null;
        let movements: ReportMovement[] = [];
        const isOfflineShift = typeof selectedShift.id === 'string' && selectedShift.id.startsWith('offline_');
        if (isOfflineShift) {
            // Turno cerrado offline: usar los movimientos locales capturados al cerrar.
            movements = offlineReportMovementsRef.current;
        } else {
            try {
                const { data, error } = await supabase
                    .from('cash_movements')
                    .select('type, payment_method, amount, description, created_at')
                    .eq('shift_id', selectedShift.id)
                    .order('created_at', { ascending: true });
                if (error) throw error;
                movements = data || [];
            } catch (e) {
                console.error('Error cargando movimientos del turno:', e);
                // navigator.onLine pudo mentir: si hay snapshot local, usarlo.
                if (offlineReportMovementsRef.current.length) movements = offlineReportMovementsRef.current;
            }
        }
        return buildShiftReportData(
            selectedShift,
            movements,
            { businessName, businessNit, businessAddress, businessPhone },
            (iso) => `${formatDate(iso)} ${formatTime(iso)}`,
            paymentMethodCategories as Record<string, ReportLine>,
        );
    };

    // Ejecuta la impresión del REPORTE DIARIO. Si se pasa `targetPrinter`, imprime
    // en esa impresora; si se omite, el Servicio_Impresión enruta a la
    // Impresora_Predeterminada_Ticket internamente (Req 10.1).
    const runPrintShiftReport = async (targetPrinter?: string): Promise<boolean> => {
        if (!selectedShift) return false;
        setIsPrintingReport(true);
        try {
            const reportData = await getReportData();
            if (!reportData) return false;
            // Req 10.4: el envío puede fallar; el reporte nunca altera los datos del
            // cierre ya registrado (estos handlers no tocan el turno cerrado).
            const ok = await printShiftReportDirect(reportData, receiptPaperWidth, targetPrinter);
            showToast(ok ? 'Reporte enviado a la impresora' : 'No se pudo imprimir el reporte', ok ? 'success' : 'error');
            return ok;
        } catch (e) {
            console.error('Error imprimiendo reporte:', e);
            showToast('No se pudo imprimir el reporte', 'error');
            return false;
        } finally {
            setIsPrintingReport(false);
        }
    };

    // Enruta el REPORTE DIARIO a la Impresora_Predeterminada_Ticket (Req 10):
    // - Con predeterminada → imprime directo (Req 10.1).
    // - Sin predeterminada pero con impresoras registradas → despliega la lista y
    //   exige una elección antes de imprimir (Req 10.2, patrón Req 6).
    // - Sin impresoras registradas → pide registrar una en Ajustes y no imprime (Req 10.3).
    const handlePrintShiftReport = async () => {
        if (!selectedShift || isPrintingReport || isConnectingReportPrinter) return;

        if (getDefaultPrinter('TICKET')) {
            await runPrintShiftReport();
            return;
        }

        const registered = getRegisteredPrinters();
        if (registered.length === 0) {
            showToast('Registra una impresora en Ajustes para imprimir el reporte', 'warning');
            return;
        }

        pendingPrintActionRef.current = 'report';
        setReportPrintersToConnect(registered.map(p => p.name));
        setShowReportPrinterList(true);
    };

    // Negocio 10001: imprime el TOP DE PRODUCTOS del turno (por ingreso). Consulta
    // las órdenes completadas dentro de la ventana de tiempo del turno (misma que
    // total_sales: business_id + tiempo, sin filtrar por cajero) y agrega por
    // product_name sumando cantidad e ingreso (total_price).
    const runPrintTopProducts = async (targetPrinter?: string): Promise<boolean> => {
        if (!selectedShift || !selectedShift.opened_at) return false;
        setIsPrintingTop(true);
        try {
            // Traer órdenes con sus ítems, descuentos y totales dentro de la ventana del turno
            let q = supabase
                .from('orders')
                .select('order_number, subtotal, total, discount, items:order_items(product_name, quantity, total_price, unit_price, discount, discount_percent)')
                .eq('business_id', selectedShift.business_id)
                .eq('status', 'completed')
                .gte('created_at', selectedShift.opened_at);
            if (selectedShift.closed_at) q = q.lt('created_at', selectedShift.closed_at);
            const { data, error } = await q;
            if (error) throw error;

            interface ProductDiscountEntry {
                orderNumber: number;
                amount: number;
            }
            interface ProductAggregated {
                name: string;
                sold: number;
                income: number;
                discounts: ProductDiscountEntry[];
            }

            const productMap: Record<string, ProductAggregated> = {};
            const globalDiscounts: ProductDiscountEntry[] = [];
            let totalDiscountsFromOrders = 0;
            let totalRoundingFromOrders = 0;

            for (const o of (data || [])) {
                const orderNumber = Number(o.order_number) || 0;
                const orderDiscount = Number(o.discount) || 0;
                const orderSubtotal = Number(o.subtotal) || 0;
                const unroundedOrder = orderSubtotal - orderDiscount;
                const adjustedOrder = Math.round(Math.max(0, unroundedOrder) / 50) * 50;
                totalRoundingFromOrders += (adjustedOrder - unroundedOrder);
                totalDiscountsFromOrders += orderDiscount;

                const items = (o as any).items || [];
                let perItemTotalDiscount = 0;

                for (const it of items) {
                    const key = it.product_name || 'Sin nombre';
                    if (!productMap[key]) productMap[key] = { name: key, sold: 0, income: 0, discounts: [] };
                    productMap[key].sold += Number(it.quantity || 0);
                    productMap[key].income += Number(it.total_price || 0);

                    const lineDiscount = Number(it.discount) || (
                        it.discount_percent
                            ? (Number(it.unit_price) || 0) * (Number(it.quantity) || 0) * (Number(it.discount_percent) || 0) / 100
                            : 0
                    );

                    if (lineDiscount > 0.5) {
                        productMap[key].discounts.push({
                            orderNumber,
                            amount: lineDiscount,
                        });
                        perItemTotalDiscount += lineDiscount;
                    }
                }

                // Descuento global a nivel de orden no imputado a una línea específica
                const orderLevelDiscount = orderDiscount - perItemTotalDiscount;
                if (orderLevelDiscount > 0.5) {
                    globalDiscounts.push({
                        orderNumber,
                        amount: orderLevelDiscount,
                    });
                }
            }

            const sorted = Object.values(productMap)
                .filter(p => p.income > 0)
                .sort((a, b) => b.income - a.income);

            if (sorted.length === 0) {
                showToast('No hay productos vendidos en este turno', 'warning');
                return false;
            }

            const totalGross = sorted.reduce((sum, p) => sum + p.income, 0);
            const totalDiscounts = totalDiscountsFromOrders;
            const roundingAdjustment = Math.round(totalRoundingFromOrders);
            const hasDiscounts = totalDiscounts > 0.5;
            const hasAdjustment = Math.abs(roundingAdjustment) >= 0.5;
            const hasDiscountsOrAdjustment = hasDiscounts || hasAdjustment;
            const totalSales = totalGross - totalDiscounts + roundingAdjustment;

            const { getPrinterStatus, getRegisteredPrinters: getPrinters } = await import('../lib/thermalPrinterService');
            const qzConnected = getPrinterStatus() === 'connected' && getPrinters().length > 0;

            if (qzConnected) {
                // --- Impresión térmica QZ (ESC/POS) ---
                const { default: ReceiptPrinterEncoder } = await import('@point-of-sale/receipt-printer-encoder');
                const qzModule = await import('qz-tray');
                const qz = qzModule.default;

                // Quita tildes/diacríticos para compatibilidad ESC/POS
                const strip = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

                const target = targetPrinter || getPrinters()[0].name;
                const is58 = receiptPaperWidth === '58mm';
                const columns = is58 ? 32 : 48;
                const encoder = new ReceiptPrinterEncoder({ columns });

                encoder.align('center');
                encoder.bold(true);
                encoder.line(strip('TOP PRODUCTOS VENDIDOS'));
                encoder.bold(false);
                encoder.line(strip(`Turno #${selectedShift.shift_number ?? ''}`.trim()));
                encoder.line('='.repeat(columns));
                encoder.align('left');

                const valW = is58 ? 10 : 12;
                const qtyW = is58 ? 4 : 5;
                const nameW = columns - qtyW - valW;

                encoder.bold(true);
                encoder.table(
                    [{ width: nameW, align: 'left' }, { width: qtyW, align: 'right' }, { width: valW, align: 'right' }],
                    [[strip('Producto'), 'Qty', 'Valor']]
                );
                encoder.bold(false);
                encoder.line('-'.repeat(columns));

                sorted.forEach((p) => {
                    const valStr = `$${p.income.toLocaleString('es-CO')}`;
                    const qtyStr = String(Math.round(p.sold));
                    const stripped = strip(p.name);
                    const name = stripped.length > nameW ? stripped.substring(0, nameW - 1) + '.' : stripped;
                    encoder.table(
                        [{ width: nameW, align: 'left' }, { width: qtyW, align: 'right' }, { width: valW, align: 'right' }],
                        [[name, qtyStr, valStr]]
                    );

                    if (p.discounts.length > 0) {
                        for (const d of p.discounts) {
                            const dStr = `-$${Math.round(d.amount).toLocaleString('es-CO')}`;
                            const ordStr = d.orderNumber ? `(#${d.orderNumber})` : '';
                            const label = strip(`  > Dcto ${ordStr}`.trimEnd());
                            encoder.table(
                                [{ width: columns - valW, align: 'left' }, { width: valW, align: 'right' }],
                                [[label, dStr]]
                            );
                        }
                    }
                });

                if (globalDiscounts.length > 0) {
                    encoder.line('-'.repeat(columns));
                    for (const gd of globalDiscounts) {
                        const gdStr = `-$${Math.round(gd.amount).toLocaleString('es-CO')}`;
                        const ordStr = gd.orderNumber ? `(#${gd.orderNumber})` : '';
                        encoder.line(strip(`> Dcto global ${ordStr}: ${gdStr}`.trimEnd()));
                    }
                }

                if (hasDiscountsOrAdjustment) {
                    encoder.line('-'.repeat(columns));
                    encoder.table(
                        [{ width: columns - valW, align: 'left' }, { width: valW, align: 'right' }],
                        [['SUBTOTAL', `$${totalGross.toLocaleString('es-CO')}`]]
                    );
                    if (hasDiscounts) {
                        encoder.table(
                            [{ width: columns - valW, align: 'left' }, { width: valW, align: 'right' }],
                            [['DESCUENTOS', `-$${Math.round(totalDiscounts).toLocaleString('es-CO')}`]]
                        );
                    }
                    if (hasAdjustment) {
                        const sign = roundingAdjustment >= 0 ? '+' : '-';
                        encoder.table(
                            [{ width: columns - valW, align: 'left' }, { width: valW, align: 'right' }],
                            [['AJUSTE AL PESO', `${sign}$${Math.abs(roundingAdjustment).toLocaleString('es-CO')}`]]
                        );
                    }
                }

                encoder.line('='.repeat(columns));
                encoder.bold(true);
                encoder.table(
                    [{ width: columns - valW, align: 'left' }, { width: valW, align: 'right' }],
                    [['TOTAL VENTAS', `$${totalSales.toLocaleString('es-CO')}`]]
                );
                encoder.bold(false);
                encoder.newline();
                encoder.newline();
                encoder.newline();
                encoder.newline();
                encoder.newline();
                encoder.cut();

                const result = encoder.encode();
                const hexData = Array.from(result as Uint8Array).map((b: number) => b.toString(16).padStart(2, '0')).join('');
                const cfg = (qz as any).configs.create(target, { encoding: 'ISO-8859-1' });
                await (qz as any).print(cfg, [{ type: 'raw', format: 'command', flavor: 'hex', data: hexData }]);
                showToast('Productos enviados a la impresora', 'success');
            } else {
                // --- Fallback: imprimir desde el navegador ---
                const rows = sorted.map((p, i) => {
                    const discountRowsHtml = p.discounts.map((d, idx) => {
                        const dStr = `-$${Math.round(d.amount).toLocaleString('es-CO')}`;
                        const ordStr = d.orderNumber ? `(#${d.orderNumber})` : '';
                        const isLast = idx === p.discounts.length - 1;
                        return `<tr style="color:#dc2626;font-size:11px;${isLast ? 'border-bottom:1px solid #eee;' : ''}">
                            <td></td>
                            <td colspan="2" style="padding:1px 8px 3px 14px">&gt; Dcto ${ordStr}</td>
                            <td style="padding:1px 8px 3px 8px;text-align:right">${dStr}</td>
                        </tr>`;
                    }).join('');

                    const hasDctos = p.discounts.length > 0;
                    return `<tr>
                        <td style="padding:4px 8px;${hasDctos ? '' : 'border-bottom:1px solid #eee;'}text-align:center;vertical-align:top">${i + 1}</td>
                        <td style="padding:4px 8px;${hasDctos ? '' : 'border-bottom:1px solid #eee;'}">
                            <div>${p.name}</div>
                        </td>
                        <td style="padding:4px 8px;${hasDctos ? '' : 'border-bottom:1px solid #eee;'}text-align:center;vertical-align:top">${Math.round(p.sold)}</td>
                        <td style="padding:4px 8px;${hasDctos ? '' : 'border-bottom:1px solid #eee;'}text-align:right;vertical-align:top">$${p.income.toLocaleString('es-CO')}</td>
                    </tr>
                    ${discountRowsHtml}`;
                }).join('');

                const globalDiscountsHtml = globalDiscounts.map(gd => {
                    const gdStr = `-$${Math.round(gd.amount).toLocaleString('es-CO')}`;
                    const ordStr = gd.orderNumber ? `(#${gd.orderNumber})` : '';
                    return `<tr>
                        <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center">-</td>
                        <td colspan="2" style="padding:4px 8px;border-bottom:1px solid #eee;color:#dc2626;font-size:12px">Dcto global ${ordStr}</td>
                        <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right;color:#dc2626;font-size:12px">${gdStr}</td>
                    </tr>`;
                }).join('');

                const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Top Productos</title>
<style>
body{font-family:Arial,sans-serif;padding:20px;max-width:600px;margin:0 auto}
h2{text-align:center;margin-bottom:4px}
p.sub{text-align:center;color:#666;margin-top:0}
table{width:100%;border-collapse:collapse;font-size:13px}
th{background:#f5f5f5;padding:6px 8px;text-align:left;border-bottom:2px solid #ddd}
th:first-child,td:first-child{text-align:center;width:30px}
th:last-child,td:last-child{text-align:right}
th:nth-child(3),td:nth-child(3){text-align:center}
.total-row td{font-weight:bold;border-top:2px solid #333;padding-top:8px}
@media print{body{padding:0}}
</style></head><body>
<h2>Top Productos Vendidos</h2>
<p class="sub">Turno #${selectedShift.shift_number ?? ''}</p>
<table>
<thead><tr><th>#</th><th>Producto</th><th>Qty</th><th>Ingreso</th></tr></thead>
<tbody>${rows}
${globalDiscountsHtml}
${hasDiscountsOrAdjustment ? `
<tr style="border-top:1px solid #ccc;font-weight:600">
    <td></td>
    <td colspan="2" style="padding:4px 8px;text-align:left">SUBTOTAL</td>
    <td style="padding:4px 8px;text-align:right">$${totalGross.toLocaleString('es-CO')}</td>
</tr>
${hasDiscounts ? `
<tr style="color:#dc2626;font-weight:600">
    <td></td>
    <td colspan="2" style="padding:4px 8px;text-align:left">DESCUENTOS</td>
    <td style="padding:4px 8px;text-align:right">-$${Math.round(totalDiscounts).toLocaleString('es-CO')}</td>
</tr>` : ''}
${hasAdjustment ? `
<tr style="color:#4b5563;font-size:12px">
    <td></td>
    <td colspan="2" style="padding:4px 8px;text-align:left">AJUSTE AL PESO</td>
    <td style="padding:4px 8px;text-align:right">${roundingAdjustment >= 0 ? '+' : '-'}$${Math.abs(roundingAdjustment).toLocaleString('es-CO')}</td>
</tr>` : ''}
` : ''}
<tr class="total-row"><td></td><td colspan="2" style="padding:6px 8px;text-align:left">TOTAL VENTAS</td><td style="text-align:right">$${totalSales.toLocaleString('es-CO')}</td></tr>
</tbody></table>
<script>window.onload=()=>{window.print();}</script>
</body></html>`;

                const printWindow = window.open('', '_blank');
                if (printWindow) {
                    printWindow.document.write(html);
                    printWindow.document.close();
                }
            }
            return true;
        } catch (err) {
            console.error('Error imprimiendo top productos del turno:', err);
            showToast('No se pudo imprimir los productos', 'error');
            return false;
        } finally {
            setIsPrintingTop(false);
        }
    };

    // Enruta la impresión del TOP DE PRODUCTOS a la Impresora_Predeterminada_Ticket,
    // reutilizando el mismo flujo de selección que el reporte diario.
    const handlePrintTopProducts = async () => {
        if (!selectedShift || isPrintingTop || isConnectingReportPrinter) return;
        // Turno offline: no hay datos en BD para consultar los productos.
        if (String(selectedShift.id).startsWith('offline_')) {
            showToast('Los productos del turno no están disponibles sin conexión', 'warning');
            return;
        }

        if (getDefaultPrinter('TICKET')) {
            await runPrintTopProducts();
            return;
        }

        const registered = getRegisteredPrinters();
        if (registered.length === 0) {
            showToast('Registra una impresora en Ajustes para imprimir', 'warning');
            return;
        }

        pendingPrintActionRef.current = 'top';
        setReportPrintersToConnect(registered.map(p => p.name));
        setShowReportPrinterList(true);
    };

    // Primera elección de impresora de ticket desde el reporte (Req 10.2 / patrón Req 6):
    // conecta la elegida si hace falta, la fija como Impresora_Predeterminada_Ticket
    // e imprime el reporte en ella.
    const handleSelectReportPrinter = async (printerName: string) => {
        if (isConnectingReportPrinter || isPrintingReport) return;
        setIsConnectingReportPrinter(true);
        try {
            if (getPrinterStatusFor(printerName) !== 'connected') {
                const connected = await connectPrinter(printerName);
                if (!connected) { showToast('No se pudo conectar a la impresora', 'error'); return; }
                // Windows mantiene la impresora "instalada" aunque el cable esté fuera:
                // verificamos disponibilidad física antes de darla por lista.
                const reachable = await probePrinterReachable(undefined, printerName);
                if (reachable === false) { showToast('Impresora desconectada. Revisa el cable USB', 'warning'); return; }
            }
            // Req 6.6: si el guardado de la predeterminada falla, no se imprime.
            if (!setDefaultPrinter('TICKET', printerName)) {
                showToast('No se pudo guardar la impresora elegida', 'error');
                return;
            }
            setShowReportPrinterList(false);
        } finally {
            setIsConnectingReportPrinter(false);
        }
        if (pendingPrintActionRef.current === 'top') {
            await runPrintTopProducts(printerName);
        } else {
            await runPrintShiftReport(printerName);
        }
    };

    const handleDownloadShiftReport = async () => {
        if (!selectedShift || isDownloadingReport) return;
        setIsDownloadingReport(true);
        try {
            const reportData = await getReportData();
            if (!reportData) return;
            await downloadShiftReportPDF(reportData, receiptPaperWidth);
            showToast('PDF generado', 'success');
        } catch (e) {
            console.error('Error generando PDF del reporte:', e);
            showToast('No se pudo generar el PDF', 'error');
        } finally {
            setIsDownloadingReport(false);
        }
    };

    const handleSendShiftReportEmail = async (email: string): Promise<boolean> => {
        const reportData = await getReportData();
        if (!reportData) return false;
        return await sendShiftReportByEmail(reportData, email, receiptPaperWidth);
    };

    // Calculate total from denomination counts
    const denominationTotal = useMemo(() => {
        return Object.entries(denominationCounts).reduce((sum, [value, count]) => {
            // Las monedas se guardan con clave `valor + 0.5` para no colisionar con
            // el billete del mismo valor; truncamos ese offset al multiplicar.
            return sum + (Math.floor(parseFloat(value)) * Number(count));
        }, 0);
    }, [denominationCounts]);

    const effectiveDeclaredCash = countMode === 'total' ? parseNumber(declaredCash) : denominationTotal;
    const difference = getDifference(effectiveDeclaredCash);

    const balancesWithValue = useMemo(() =>
        Object.entries(balances)
            .filter(([, value]) => value !== 0)
            .sort((a, b) => (b[1] as number) - (a[1] as number)),
        [balances]);

    // Handle contextual back navigation inside Modal/Sidebar
    const handleBackPress = () => {
        if (viewMode === 'close' || viewMode === 'current_movements') {
            setViewMode('dashboard');
            return;
        }
        if (viewMode === 'detail') {
            const wasOffline = !!selectedShift && String(selectedShift.id).startsWith('offline_');
            setSelectedShift(null);
            setViewMode(wasOffline ? 'dashboard' : 'history');
            return;
        }
        if (viewMode === 'history') {
            setViewMode('dashboard');
            return;
        }
        if (onClose) onClose();
    };

    // Handle open shift
    const handleOpenShift = async () => {
        if (openingBalance.trim() === '') {
            showToast('Por favor ingresa un monto inicial (mínimo 0)', 'warning');
            return;
        }

        // Con 2+ cajas es obligatorio elegir una en el dropdown antes de abrir.
        if (hasMultipleRegisters && !selectedRegisterId) {
            showToast('Elige una caja para abrir el turno', 'warning');
            return;
        }

        const balance = parseNumber(openingBalance);
        let registerId = selectedRegisterId || availableRegisters[0]?.id;

        // Sin caja disponible: intentar crear "Caja Principal" automáticamente
        if (!registerId) {
            const created = await ensureDefaultRegister();
            registerId = created?.id;
        }

        if (!registerId) {
            showToast('No hay caja disponible. Crea una nueva.', 'error');
            return;
        }

        if (occupiedRegisters[registerId]) {
            showToast(`Esta caja está en uso por ${occupiedRegisters[registerId]}`, 'warning');
            return;
        }

        if (balance < 0) {
            showToast('El balance inicial no puede ser negativo', 'warning');
            return;
        }

        const result = await openShift(registerId, balance);
        if (result) {
            setOpeningBalance('');
            setSelectedRegisterId('');
        }
    };

    // Handle close shift
    const handleCloseShift = async () => {
        if (countMode === 'total' && declaredCash.trim() === '') {
            showToast('Por favor ingresa el monto en caja (mínimo 0)', 'warning');
            return;
        }

        if (effectiveDeclaredCash < 0) {
            showToast('El monto declarado no puede ser negativo', 'warning');
            return;
        }

        // Declarado por método (solo se incluyen los que el cajero diligenció)
        const declaredByMethod: Record<string, number> = {};
        const card = parseNumber(declaredCard);
        const online = parseNumber(declaredOnline);
        const other = parseNumber(declaredOther);
        if (card > 0) declaredByMethod.card = card;
        if (online > 0) declaredByMethod.transfer = online;
        if (other > 0) declaredByMethod.other = other;

        const closedShiftId = activeShift?.id;
        const shiftSnapshot = activeShift;
        const movementsSnapshot = movements;
        setIsClosing(true); // muestra loader y oculta la vista de apertura durante la transición
        const success = await closeShift(effectiveDeclaredCash, closeNotes || undefined, declaredByMethod);
        if (success) {
            setDeclaredCash('');
            setDenominationCounts({});
            setCloseNotes('');
            setDeclaredCard('');
            setDeclaredOnline('');
            setDeclaredOther('');
            setCountMode('total');

            // 1) ONLINE: traer el turno real cerrado desde BD (totales del servidor).
            if (closedShiftId && !String(closedShiftId).startsWith('offline_') && navigator.onLine) {
                try {
                    const { data } = await supabase
                        .from('cash_shifts')
                        .select(`*, register:cash_registers(name), opened_by_profile:profiles!cash_shifts_opened_by_fkey(full_name), closed_by_profile:profiles!cash_shifts_closed_by_fkey(full_name)`)
                        .eq('id', closedShiftId)
                        .maybeSingle();
                    if (data && data.status !== 'open') {
                        // Set selectedShift + viewMode + apaga el loader en el mismo paso → sin parpadeo
                        offlineReportMovementsRef.current = [];
                        setSelectedShift(data as CashShift);
                        setViewMode('detail');
                        setIsClosing(false);
                        return;
                    }
                } catch (e) {
                    console.error('No se pudo abrir el detalle del turno cerrado:', e);
                    // cae al fallback offline de abajo
                }
            }

            // 2) OFFLINE: armar el turno cerrado con datos locales (el cierre quedó
            // en cola; la BD aún no lo tiene). Así se puede imprimir/descargar el
            // REPORTE DIARIO sin internet. El arqueo (expected/diferencia) se calcula
            // del efectivo de los movimientos locales.
            if (shiftSnapshot) {
                const reportMovements: ReportMovement[] = (movementsSnapshot || []).map(m => ({
                    type: m.type,
                    payment_method: m.payment_method ?? null,
                    amount: m.amount,
                    description: m.description,
                    created_at: m.created_at,
                }));
                offlineReportMovementsRef.current = reportMovements;

                // Reconstruir los agregados del turno desde los movimientos locales,
                // para que el detalle del frontend (Desglose de ventas, Movimientos)
                // muestre los mismos datos que el reporte impreso.
                const salesByMethod: Record<string, number> = {};
                let aggSales = 0, aggCashIn = 0, aggExpenses = 0, aggCashOut = 0, aggRefunds = 0;
                for (const m of reportMovements) {
                    const amt = Number(m.amount) || 0;
                    const pm = (m.payment_method || 'cash').toLowerCase();
                    switch (m.type) {
                        case 'sale': salesByMethod[pm] = (salesByMethod[pm] || 0) + amt; aggSales += amt; break;
                        case 'cash_in': aggCashIn += amt; break;
                        case 'expense': aggExpenses += amt; break;
                        case 'cash_out': aggCashOut += amt; break;
                        case 'purchase': aggCashOut += amt; break;
                        case 'refund': aggRefunds += amt; break;
                    }
                }

                const preview = buildShiftReportData(
                    shiftSnapshot,
                    reportMovements,
                    { businessName, businessNit, businessAddress, businessPhone },
                    (iso) => `${formatDate(iso)} ${formatTime(iso)}`,
                    paymentMethodCategories as Record<string, ReportLine>,
                );
                const expected = preview.totalCash;

                const offlineClosedShift: CashShift = {
                    ...shiftSnapshot,
                    status: 'closed',
                    closed_at: new Date().toISOString(),
                    declared_cash: effectiveDeclaredCash,
                    declared_by_method: declaredByMethod,
                    expected_cash: expected,
                    difference: effectiveDeclaredCash - expected,
                    closed_by_profile: shiftSnapshot.opened_by_profile,
                    sales_by_method: salesByMethod,
                    total_sales: aggSales,
                    total_cash_in: aggCashIn,
                    total_expenses: aggExpenses,
                    total_cash_out: aggCashOut,
                    total_refunds: aggRefunds,
                };
                setSelectedShift(offlineClosedShift);
                setViewMode('detail');
                setIsClosing(false);
                return;
            }

            // Fallback final: volver al dashboard
            setViewMode('dashboard');
        }
        setIsClosing(false);
    };

    // Handle add movement (entrada / salida / devolución)
    const handleAddMovement = async () => {
        const amount = parseNumber(movementAmount);
        if (amount <= 0) {
            showToast('El monto debe ser mayor a 0', 'warning');
            return;
        }

        setMovementLoading(true);
        let success = false;
        if (showMovementModal === 'cash_in') {
            success = await addCashIn(amount, movementDescription || 'Entrada de efectivo');
        } else if (showMovementModal === 'cash_out') {
            success = await addCashOut(amount, movementDescription || 'Salida de dinero', movementMethod);
        } else if (showMovementModal === 'refund') {
            success = await addRefund(amount, movementDescription || 'Devolución de dinero', movementMethod);
        }
        setMovementLoading(false);

        if (success) {
            setShowMovementModal(null);
            setMovementAmount('');
            setMovementDescription('');
            setMovementMethod('cash');
        }
    };

    // Handle create register
    const handleCreateRegister = async () => {
        if (!isAdmin) {
            showToast('Solo los administradores pueden crear cajas', 'error');
            return;
        }
        if (!newRegisterName.trim()) return;

        await createRegister(newRegisterName.trim());
        setShowNewRegisterModal(false);
        setNewRegisterName('');
    };

    const handleStartEdit = (reg: { id: string; name: string }) => {
        if (!isAdmin) return;
        setEditingRegisterId(reg.id);
        setEditRegisterName(reg.name);
    };

    const handleSaveEdit = async () => {
        if (!isAdmin || !editingRegisterId || !editRegisterName.trim()) return;
        const success = await updateRegister(editingRegisterId, editRegisterName.trim());
        if (success) {
            showToast('Nombre actualizado', 'success');
            setEditingRegisterId(null);
            setEditRegisterName('');
        }
    };

    const handleDeleteRegister = async (registerId: string, registerName: string) => {
        if (!isAdmin) {
            showToast('Solo los administradores pueden eliminar cajas', 'error');
            return;
        }
        if (occupiedRegisters[registerId]) {
            showToast('No puedes eliminar una caja en uso', 'warning');
            return;
        }
        const confirmed = await confirmAction({
            title: `¿Eliminar "${registerName}"?`,
            message: 'La caja será desactivada permanentemente.',
            confirmText: 'Eliminar',
            variant: 'danger'
        });
        if (!confirmed) return;
        const success = await deleteRegister(registerId);
        if (success) {
            showToast('Caja eliminada', 'success');
        } else {
            showToast('Error al eliminar caja', 'error');
        }
    };

    // Handle clear history
    const handleClearHistory = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const confirmed = await confirmAction({
            title: '¿Limpiar el historial de turnos?',
            message: 'Se quitarán de la lista los turnos ya cerrados junto con su arqueo de caja. Tus ventas y devoluciones NO se borran: siguen disponibles en Facturas. Si necesitas guardar el reporte de algún turno, descárgalo antes de continuar. Esta acción no se puede deshacer.',
            confirmText: 'Sí, limpiar',
            variant: 'danger'
        });
        if (!confirmed) return;

        const success = await clearShiftHistory();
        if (success) {
            showToast('Historial eliminado correctamente', 'success');
        } else {
            showToast('No se pudo limpiar el historial. Intenta de nuevo.', 'error');
        }
    };

    // Movement type labels and icons
    const getMovementInfo = (type: CashMovement['type']) => {
        switch (type) {
            case 'opening':
                return { label: 'Apertura', icon: 'lock_open', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' };
            case 'cash_in':
                return { label: 'Entrada', icon: 'add_circle', color: 'text-green-600 bg-green-50 dark:bg-green-900/20' };
            case 'cash_out':
                return { label: 'Salida', icon: 'remove_circle', color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20' };
            case 'sale':
                return { label: 'Venta', icon: 'point_of_sale', color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' };
            case 'expense':
                return { label: 'Gasto', icon: 'receipt_long', color: 'text-red-600 bg-red-50 dark:bg-red-900/20' };
            case 'refund':
                return { label: 'Devolución', icon: 'undo', color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20' };
            case 'purchase':
                return { label: 'Compra', icon: 'inventory_2', color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' };
            default:
                return { label: type, icon: 'paid', color: 'text-gray-600 bg-gray-50' };
        }
    };

    // Render no shift view (opening form)
    const allOccupied = availableRegisters.length === 0 && Object.keys(occupiedRegisters).length > 0;

    // Pinta una fila de caja dentro del dropdown "Elegir caja". Cubre 3 estados:
    // - editando: input inline con guardar/cancelar
    // - ocupada: deshabilitada, muestra "En uso por X" (no seleccionable)
    // - disponible: seleccionable (marca la caja y cierra el dropdown), con editar/eliminar
    const renderRegisterRow = (reg: { id: string; name: string }) => {
        const occupiedBy = occupiedRegisters[reg.id];
        const isSelected = selectedRegisterId === reg.id;
        const isEditing = editingRegisterId === reg.id;
        // La primera caja del negocio no se puede eliminar (regla existente).
        const canDelete = reg.id !== registers[0]?.id;

        if (isEditing && isAdmin) {
            return (
                <div key={reg.id} className="p-2" onClick={(e) => e.stopPropagation()}>
                    <input
                        type="text"
                        value={editRegisterName}
                        onChange={(e) => setEditRegisterName(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-primary"
                        autoFocus
                        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') handleSaveEdit(); }}
                    />
                    <div className="flex gap-2 mt-2">
                        <button
                            onClick={handleSaveEdit}
                            className="flex-1 h-9 bg-primary hover:bg-primary-hover text-[#102218] text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-colors"
                            aria-label="Guardar"
                        >
                            <span className="material-symbols-outlined text-base">check</span>
                            Guardar
                        </button>
                        <button
                            onClick={() => setEditingRegisterId(null)}
                            className="flex-1 h-9 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-colors"
                            aria-label="Cancelar"
                        >
                            <span className="material-symbols-outlined text-base">close</span>
                            Cancelar
                        </button>
                    </div>
                </div>
            );
        }

        const handleSelectRow = () => {
            if (occupiedBy) return; // ocupada: no seleccionable
            setSelectedRegisterId(reg.id);
            setRegisterDropdownOpen(false);
        };

        return (
            <div
                key={reg.id}
                onClick={handleSelectRow}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all ${occupiedBy
                    ? 'border-transparent bg-amber-50 dark:bg-amber-900/10 cursor-not-allowed'
                    : isSelected
                        ? 'border-primary bg-primary/5 dark:bg-primary/10 cursor-pointer'
                        : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-700/50 cursor-pointer'
                    }`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={!!occupiedBy}
                tabIndex={occupiedBy ? -1 : 0}
                onKeyDown={(e) => { if (!occupiedBy && e.key === 'Enter') handleSelectRow(); }}
            >
                {occupiedBy ? (
                    <span className="material-symbols-outlined text-amber-500 text-lg shrink-0">lock</span>
                ) : (
                    <div className={`size-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-primary' : 'border-gray-400 dark:border-gray-500'}`}>
                        {isSelected && <div className="size-2.5 rounded-full bg-primary" />}
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{reg.name}</p>
                    {occupiedBy && <p className="text-xs text-gray-900 dark:text-gray-100 truncate">En uso por <span className="font-bold">{occupiedBy}</span></p>}
                </div>
                {isAdmin && (
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => handleStartEdit(reg)} className="size-9 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-primary rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" aria-label="Editar nombre">
                            <span className="material-symbols-outlined text-[20px]">edit</span>
                        </button>
                        {canDelete && !occupiedBy && (
                            <button onClick={() => handleDeleteRegister(reg.id, reg.name)} className="size-9 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" aria-label="Eliminar caja">
                                <span className="material-symbols-outlined text-[20px]">delete</span>
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const renderOpeningView = () => (
        <div className="flex-1 overflow-y-auto flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {!userCanOpen ? (
                    <div className="bg-surface-light dark:bg-surface-dark rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6 text-center">
                        <div className="size-14 mx-auto mb-4 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                            <span className="material-symbols-outlined text-amber-500 text-[28px]">lock</span>
                        </div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1.5">No tienes permiso para abrir turno</h2>
                        <p className="text-gray-500 dark:text-gray-400 text-sm">
                            Pídele a un administrador o a un cajero con permiso que abra el turno para empezar a vender.
                        </p>
                    </div>
                ) : (
                <div className="bg-surface-light dark:bg-surface-dark rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 p-6">
                    <div className="text-center mb-6">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1.5">Abrir Turno de Caja</h2>
                        <p className="text-gray-600 dark:text-gray-300 text-sm">
                            {allOccupied
                                ? (isAdmin
                                    ? 'Todas las cajas están en uso. Crea una nueva para continuar.'
                                    : 'Todas las cajas están en uso. Solicita a un administrador que habilite o cree una caja.')
                                : 'Ingresa el monto inicial con el que empiezas el día'}
                        </p>
                    </div>

                    {/* All occupied: opción A → dropdown con todas las cajas
                        deshabilitadas + botón crear. Solo aplica cuando NO se
                        puede elegir ninguna caja disponible. */}
                    {allOccupied ? (
                        <div className="space-y-4">
                            {/* Dropdown informativo: todas las cajas ocupadas */}
                            <div className="relative" ref={registerDropdownRef}>
                                <button
                                    type="button"
                                    onClick={() => setRegisterDropdownOpen(o => !o)}
                                    className="w-full h-12 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between gap-2 text-left transition-all hover:border-gray-300 dark:hover:border-gray-600"
                                    aria-haspopup="listbox"
                                    aria-expanded={registerDropdownOpen}
                                >
                                    <span className="text-sm font-bold text-gray-700 dark:text-gray-200 truncate">Todas las cajas están en uso</span>
                                    <span className={`material-symbols-outlined text-gray-600 dark:text-gray-300 transition-transform shrink-0 ${registerDropdownOpen ? 'rotate-180' : ''}`}>expand_more</span>
                                </button>
                                {registerDropdownOpen && (
                                    <div className="absolute z-20 mt-2 w-full max-h-72 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl p-1.5 space-y-1" role="listbox">
                                        {registers.map(reg => renderRegisterRow(reg))}
                                    </div>
                                )}
                            </div>
                            {isAdmin && (
                                <button
                                    onClick={() => setShowNewRegisterModal(true)}
                                    className="w-full h-14 bg-primary hover:bg-primary-hover text-[#102218] font-bold rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined">add</span>
                                    Crear Nueva Caja
                                </button>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Selección de caja: dropdown solo si hay 2+ cajas.
                                Con una sola caja se omite (se elige sola). */}
                            {hasMultipleRegisters && (
                                <div className="relative mb-6" ref={registerDropdownRef}>
                                    <button
                                        type="button"
                                        onClick={() => setRegisterDropdownOpen(o => !o)}
                                        className="w-full h-12 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center justify-between gap-2 text-left transition-all hover:border-gray-300 dark:hover:border-gray-600"
                                        aria-haspopup="listbox"
                                        aria-expanded={registerDropdownOpen}
                                    >
                                        <span className={`text-sm font-bold truncate ${selectedRegister ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-200'}`}>
                                            {selectedRegister ? selectedRegister.name : 'Elegir caja...'}
                                        </span>
                                        <span className={`material-symbols-outlined text-gray-600 dark:text-gray-300 transition-transform shrink-0 ${registerDropdownOpen ? 'rotate-180' : ''}`}>expand_more</span>
                                    </button>
                                    {registerDropdownOpen && (
                                        <div className="absolute z-20 mt-2 w-full max-h-72 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl p-1.5 space-y-1" role="listbox">
                                            {registers.map(reg => renderRegisterRow(reg))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Opening balance input. Con 2+ cajas solo aparece
                                tras elegir una; con una sola caja aparece directo. */}
                            {(!hasMultipleRegisters || selectedRegisterId) && (
                            <div className="mb-6">
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Base Inicial</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-gray-400 font-bold text-lg">$</span>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={openingBalance}
                                        onChange={(e) => setOpeningBalance(formatNumber(e.target.value))}
                                        placeholder="0"
                                        className="w-full h-12 pl-10 pr-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xl font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-slate-200 dark:focus:ring-slate-800 focus:border-slate-400 dark:focus:border-slate-500 outline-none text-center transition-all"
                                        autoFocus={!isMobile}
                                    />
                                </div>
                                <p className="text-xs text-gray-400 mt-1.5 text-center">
                                    Cuenta el efectivo en la caja y registra el total
                                </p>
                            </div>
                            )}

                            <button
                                onClick={handleOpenShift}
                                disabled={loading || (hasMultipleRegisters && !selectedRegisterId)}
                                className="w-full h-12 bg-primary hover:bg-primary-hover text-[#102218] font-bold rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {loading ? (
                                    <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-[20px]">lock_open</span>
                                        <span className="text-[15px]">Abrir Turno</span>
                                    </>
                                )}
                            </button>

                            {/* Create new register */}
                            {isAdmin && (
                                <button
                                    onClick={() => setShowNewRegisterModal(true)}
                                    className="w-full mt-4 py-3 text-sm text-gray-500 hover:text-primary transition-colors flex items-center justify-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-sm">add</span>
                                    Crear otra caja
                                </button>
                            )}
                        </>
                    )}
                </div>
                )}
            </div>
        </div>
    );

    // Render active shift dashboard
    const renderDashboardView = () => (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 bg-gray-50 dark:bg-black/20">
            <div className="space-y-5">
                {/* Balance Cards by Payment Method */}
                <div className="grid grid-cols-2 xs:grid-cols-3 gap-2 sm:gap-3">
                    {balancesWithValue.map(([method, value]) => {
                        const info = PAYMENT_METHOD_LABELS[method] || { ...PAYMENT_METHOD_LABELS.other, label: method.charAt(0).toUpperCase() + method.slice(1) };
                        const numValue = value as number;
                        const currencyStr = formatCurrency(numValue);
                        return (
                            <div
                                key={method}
                                className="group rounded-xl p-2.5 sm:p-3 bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-800 shadow-sm transition-all flex flex-col justify-center min-h-[76px] hover:shadow-md hover:border-gray-300 dark:hover:border-gray-700 hover:-translate-y-0.5"
                            >
                                <div className="flex items-center gap-1.5 mb-1">
                                    <div className={`size-5 rounded-md flex items-center justify-center shrink-0 border ${info.color}`}>
                                        <span className="material-symbols-outlined text-[12px]">{info.icon}</span>
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider truncate" title={info.label}>{info.label}</span>
                                </div>
                                <p
                                    className={`font-black text-gray-900 dark:text-white leading-none ${numValue < 0 ? '!text-red-500' : ''} ${currencyStr.length > 12 ? 'text-[13px] sm:text-sm' :
                                        currencyStr.length > 10 ? 'text-[14px] sm:text-base' :
                                            'text-[16px] sm:text-lg'
                                        }`}
                                >
                                    {currencyStr}
                                </p>
                            </div>
                        );
                    })}
                </div>

                {/* Quick Actions (Entrada / Salida / Devolución) */}
                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <button
                        onClick={() => { setMovementMethod('cash'); setShowMovementModal('cash_in'); }}
                        className="bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 px-1 py-3 sm:p-4 hover:border-green-500 dark:hover:border-green-500 hover:shadow-md transition-all group flex flex-col items-center justify-center text-center gap-1.5 min-h-[84px] sm:min-h-[96px]"
                    >
                        <div className="size-9 sm:size-11 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400 shrink-0 group-hover:scale-110 transition-transform">
                            <span className="material-symbols-outlined text-[18px] sm:text-[22px]">add</span>
                        </div>
                        <div className="flex flex-col items-center leading-tight w-full px-0.5">
                            <span className="text-[8px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-wider">Registrar</span>
                            <span className="text-[12px] sm:text-sm font-black text-gray-900 dark:text-white leading-tight break-words">Entrada</span>
                        </div>
                    </button>
                    <button
                        onClick={() => { setMovementMethod('cash'); setShowMovementModal('cash_out'); }}
                        className="bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 px-1 py-3 sm:p-4 hover:border-red-500 dark:hover:border-red-500 hover:shadow-md transition-all group flex flex-col items-center justify-center text-center gap-1.5 min-h-[84px] sm:min-h-[96px]"
                    >
                        <div className="size-9 sm:size-11 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0 group-hover:scale-110 transition-transform">
                            <span className="material-symbols-outlined text-[18px] sm:text-[22px]">remove</span>
                        </div>
                        <div className="flex flex-col items-center leading-tight w-full px-0.5">
                            <span className="text-[8px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-wider">Registrar</span>
                            <span className="text-[12px] sm:text-sm font-black text-gray-900 dark:text-white leading-tight break-words">Salida</span>
                        </div>
                    </button>
                    <button
                        onClick={() => setShowRefundSaleModal(true)}
                        disabled={!canRefund}
                        className="bg-white dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 px-1 py-3 sm:p-4 hover:border-purple-500 dark:hover:border-purple-500 hover:shadow-md transition-all group flex flex-col items-center justify-center text-center gap-1.5 min-h-[84px] sm:min-h-[96px] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-gray-200"
                    >
                        <div className="size-9 sm:size-11 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0 group-hover:scale-110 transition-transform">
                            <span className="material-symbols-outlined text-[18px] sm:text-[22px]">undo</span>
                        </div>
                        <div className="flex flex-col items-center leading-tight w-full px-0.5">
                            <span className="text-[8px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-wider">Registrar</span>
                            <span className="text-[11px] sm:text-sm font-black text-gray-900 dark:text-white leading-tight break-words">Devolución</span>
                        </div>
                    </button>
                </div>

                {/* Recent Movements */}
                <div className="bg-surface-light dark:bg-surface-dark rounded-xl shadow-sm border border-gray-200 dark:border-gray-800">
                    <div className="p-3 sm:p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white flex items-center gap-2">
                                <span className="material-symbols-outlined text-[18px] sm:text-[24px] text-gray-400">history</span>
                                Mov. del Turno
                            </h3>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-[10px] sm:text-xs text-gray-400 font-medium whitespace-nowrap">{movements.length} mov<span className="hidden sm:inline">imiento</span>s</span>
                            {movements.length > 0 && (
                                <button
                                    onClick={() => setViewMode('current_movements')}
                                    className="px-2 py-1 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-[10px] sm:text-xs font-bold text-gray-600 dark:text-gray-300 transition-colors flex items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-[14px]">open_in_full</span>
                                    Ampliar
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-96 overflow-y-auto">
                        {movements.map((movement) => {
                            const info = getMovementInfo(movement.type);
                            const isIncome = ['opening', 'cash_in', 'sale'].includes(movement.type);
                            const method = movement.payment_method || 'cash';
                            const paymentInfo = PAYMENT_METHOD_LABELS[method] || { ...PAYMENT_METHOD_LABELS.other, label: method.charAt(0).toUpperCase() + method.slice(1) };

                            return (
                                <div key={movement.id} className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                                    <div className={`size-8 sm:size-10 shrink-0 rounded-full flex items-center justify-center align-start ${info.color}`}>
                                        <span className="material-symbols-outlined text-[16px] sm:text-[20px]">{info.icon}</span>
                                    </div>
                                    <div className="flex-1 min-w-0 pr-1 sm:pr-2 flex flex-col justify-center">
                                        <p className="font-bold text-gray-900 dark:text-white text-[11px] sm:text-sm leading-snug break-words line-clamp-2">
                                            {movement.description?.replace(/^Abono:/, 'Abono de:') || info.label}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <p className="text-[10px] sm:text-xs text-gray-500 shrink-0">{formatTime(movement.created_at)}</p>
                                            {movement.type !== 'opening' && method && (
                                                <span className={`px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-bold uppercase border whitespace-nowrap leading-none ${paymentInfo.color}`}>
                                                    {paymentInfo.label}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <span className={`font-black text-sm sm:text-base whitespace-nowrap shrink-0 ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                                        {isIncome ? '+' : '-'}{formatCurrency(movement.amount)}
                                    </span>
                                </div>
                            );
                        })}
                        {hasMoreMovements && (
                            <div className="p-3 text-center border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-black/10">
                                <button
                                    onClick={fetchMoreMovements}
                                    disabled={loadingMoreMovements}
                                    className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs font-bold text-gray-700 dark:text-gray-300 rounded-lg transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    {loadingMoreMovements ? (
                                        <>
                                            <span className="material-symbols-outlined text-[14px] animate-spin">progress_activity</span>
                                            Cargando...
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-[14px]">expand_more</span>
                                            Cargar 20 movimientos más
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                        {movements.length === 0 && (
                            <div className="px-4 py-12 text-center text-gray-400">
                                <span className="material-symbols-outlined text-3xl mb-2 opacity-50">receipt_long</span>
                                <p className="text-sm">No hay movimientos registrados</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );

    // Render Expanded Current Movements Fullscreen
    const renderCurrentMovementsView = () => (
        <div
            onScroll={(e) => {
                const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
                if (scrollHeight - scrollTop - clientHeight < 80 && hasMoreMovements && !loadingMoreMovements) {
                    fetchMoreMovements();
                }
            }}
            className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50 dark:bg-black/20 flex flex-col h-full animate-[fadeIn_0.2s_ease-out]"
        >
            <div className="bg-surface-light dark:bg-surface-dark shadow-sm border-b border-gray-200 dark:border-gray-800 p-3 flex items-center gap-3 sticky top-0 z-20">
                <button
                    onClick={() => setViewMode('dashboard')}
                    className="p-1.5 rounded-xl hover:bg-gray-100 dark:bg-gray-800 text-gray-500 font-bold transition-colors flex items-center"
                >
                    <span className="material-symbols-outlined">arrow_back</span>
                </button>
                <div className="flex-1">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Movimientos del Turno</h2>
                    <p className="text-xs text-gray-500">{movements.length} movimientos cargados</p>
                </div>
            </div>

            <div className="flex-1 p-0 sm:p-4 w-full mx-auto max-w-4xl">
                <div className="bg-white dark:bg-surface-dark sm:rounded-xl shadow-sm border-t sm:border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                    {movements.map((movement) => {
                        const info = getMovementInfo(movement.type);
                        const isIncome = ['opening', 'cash_in', 'sale'].includes(movement.type);
                        const method = movement.payment_method || 'cash';
                        const paymentInfo = PAYMENT_METHOD_LABELS[method] || { ...PAYMENT_METHOD_LABELS.other, label: method.charAt(0).toUpperCase() + method.slice(1) };

                        return (
                            <div key={movement.id} className="px-4 py-3 sm:py-3.5 flex items-center gap-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                                <div className={`size-9 sm:size-10 shrink-0 rounded-full flex items-center justify-center align-start ${info.color}`}>
                                    <span className="material-symbols-outlined text-[18px] sm:text-[20px]">{info.icon}</span>
                                </div>
                                <div className="flex-1 min-w-0 pr-2 flex flex-col justify-center">
                                    <p className="font-bold text-gray-900 dark:text-white text-[13px] sm:text-sm leading-snug break-words">
                                        {movement.description?.replace(/^Abono:/, 'Abono de:') || info.label}
                                    </p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <p className="text-[11px] sm:text-xs text-gray-500 shrink-0">{formatTime(movement.created_at)}</p>
                                        {movement.type !== 'opening' && method && (
                                            <span className={`px-1.5 py-0.5 rounded text-[9px] sm:text-[9px] font-bold uppercase border whitespace-nowrap leading-none ${paymentInfo.color}`}>
                                                {paymentInfo.label}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <span className={`font-black text-[15px] sm:text-base whitespace-nowrap shrink-0 ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                                    {isIncome ? '+' : '-'}{formatCurrency(movement.amount)}
                                </span>
                            </div>
                        );
                    })}
                </div>
                {loadingMoreMovements && (
                    <div className="py-4 text-center flex justify-center items-center gap-2 text-xs font-semibold text-gray-500">
                        <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                        Cargando 20 movimientos más...
                    </div>
                )}
                {hasMoreMovements && !loadingMoreMovements && (
                    <div className="p-4 text-center">
                        <button
                            onClick={fetchMoreMovements}
                            className="px-4 py-2 bg-white dark:bg-surface-dark border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs font-bold text-gray-700 dark:text-gray-300 rounded-lg shadow-sm transition-all inline-flex items-center gap-1.5"
                        >
                            <span className="material-symbols-outlined text-[16px]">expand_more</span>
                            Cargar más movimientos
                        </button>
                    </div>
                )}
            </div>
        </div>
    );

    // Render close shift view (arqueo)
    const renderCloseView = () => (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 bg-gray-50 dark:bg-black/20">
            <div className="max-w-lg mx-auto space-y-4">
                {/* Summary Stats — cards compactos */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white dark:bg-surface-dark rounded-xl p-4 border border-gray-200 dark:border-gray-800 shadow-sm">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">Base Inicial</p>
                        <p className="text-lg font-black text-gray-900 dark:text-white">{formatCurrency(activeShift?.opening_balance || 0)}</p>
                    </div>
                    <div className="bg-white dark:bg-surface-dark rounded-xl p-4 border border-indigo-200 dark:border-indigo-800/50 shadow-sm">
                        <p className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wide mb-1">Esperado en Caja</p>
                        <p className="text-lg font-black text-indigo-600 dark:text-indigo-400">{formatCurrency(expectedCash)}</p>
                    </div>
                </div>

                {/* Card principal del arqueo */}
                <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
                    {/* Count Mode Toggle */}
                    <div className="p-4 sm:p-5 space-y-5">
                        <div className="flex items-center gap-1.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
                            <button
                                onClick={() => setCountMode('total')}
                                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${countMode === 'total'
                                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                Total Directo
                            </button>
                            <button
                                onClick={() => setCountMode('denominations')}
                                className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${countMode === 'denominations'
                                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                Por Denominación
                            </button>
                        </div>

                        {/* Total Direct Input */}
                        {countMode === 'total' && (
                            <div>
                                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Efectivo contado</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-gray-400 font-bold text-xl">$</span>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={declaredCash}
                                        onChange={(e) => setDeclaredCash(formatNumber(e.target.value))}
                                        placeholder="0"
                                        className="w-full h-14 pl-10 pr-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-2xl font-black text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800 focus:border-indigo-400 dark:focus:border-indigo-500 outline-none text-center transition-all"
                                        autoFocus={!isMobile}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Denomination Count */}
                        {countMode === 'denominations' && (
                            <div className="space-y-4">
                                <div>
                                    <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2.5">Billetes</h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        {DENOMINATIONS.bills.map((denom) => (
                                            <div key={denom.value} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-2.5 py-2 border border-gray-100 dark:border-gray-700/50">
                                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap shrink-0">{denom.label}</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    inputMode="numeric"
                                                    value={denominationCounts[denom.value] || ''}
                                                    onChange={(e) => setDenominationCounts(prev => ({
                                                        ...prev,
                                                        [denom.value]: parseInt(e.target.value) || 0
                                                    }))}
                                                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                    className="flex-1 min-w-0 h-9 px-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-center font-bold text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800 focus:border-indigo-400 outline-none transition-all appearance-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    placeholder="0"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2.5">Monedas</h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        {DENOMINATIONS.coins.map((denom) => (
                                            <div key={`coin-${denom.value}`} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-2.5 py-2 border border-gray-100 dark:border-gray-700/50">
                                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap shrink-0">{denom.label}</span>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    inputMode="numeric"
                                                    value={denominationCounts[denom.value + 0.5] || ''}
                                                    onChange={(e) => setDenominationCounts(prev => ({
                                                        ...prev,
                                                        [denom.value + 0.5]: parseInt(e.target.value) || 0
                                                    }))}
                                                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                                                    className="flex-1 min-w-0 h-9 px-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 text-center font-bold text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-800 focus:border-indigo-400 outline-none transition-all appearance-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    placeholder="0"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="p-3.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800/40 flex items-center justify-between">
                                    <p className="text-xs font-bold text-indigo-500 dark:text-indigo-400 uppercase">Total Contado</p>
                                    <p className="text-xl font-black text-indigo-600 dark:text-indigo-400">{formatCurrency(denominationTotal)}</p>
                                </div>
                            </div>
                        )}

                        {/* Difference Display */}
                        {effectiveDeclaredCash > 0 && (
                            <div className={`p-4 rounded-xl ${difference === 0
                                ? 'bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/50'
                                : difference > 0
                                    ? 'bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/50'
                                    : 'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50'
                                }`}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[11px] font-bold uppercase tracking-wide mb-0.5" style={{
                                            color: difference === 0 ? '#16a34a' : difference > 0 ? '#2563eb' : '#dc2626'
                                        }}>
                                            {difference === 0 ? '✓ Cuadra Perfecto' : difference > 0 ? '↑ Sobrante' : '↓ Faltante'}
                                        </p>
                                        <p className="text-xl font-black" style={{
                                            color: difference === 0 ? '#16a34a' : difference > 0 ? '#2563eb' : '#dc2626'
                                        }}>
                                            {difference === 0 ? formatCurrency(0) : (difference > 0 ? '+' : '') + formatCurrency(difference)}
                                        </p>
                                    </div>
                                    <span className="material-symbols-outlined text-3xl opacity-15" style={{
                                        color: difference === 0 ? '#16a34a' : difference > 0 ? '#2563eb' : '#dc2626'
                                    }}>
                                        {difference === 0 ? 'check_circle' : difference > 0 ? 'trending_up' : 'trending_down'}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Otros valores recibidos */}
                <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="material-symbols-outlined text-[16px] text-gray-400">account_balance_wallet</span>
                        <p className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Otros valores recibidos</p>
                    </div>
                    <p className="text-[11px] text-gray-400 mb-3">Valores registrados automáticamente durante el turno. No afecta la diferencia del efectivo.</p>
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { label: 'Tarjetas', value: declaredCard },
                            { label: 'En línea', value: declaredOnline },
                            { label: 'Otros', value: declaredOther },
                        ].map((f) => (
                            <div key={f.label}>
                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 text-center">{f.label}</label>
                                <div
                                    className="w-full h-10 px-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-sm font-bold text-gray-900 dark:text-white flex items-center justify-center select-none"
                                >
                                    {f.value || '0'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Notes */}
                <div className="bg-white dark:bg-surface-dark rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm p-4 sm:p-5">
                    <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-2">Notas (opcional)</label>
                    <textarea
                        value={closeNotes}
                        onChange={(e) => setCloseNotes(e.target.value)}
                        placeholder="Observaciones sobre el arqueo..."
                        rows={2}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-900 dark:text-white text-sm resize-none focus:ring-1 focus:ring-indigo-200 dark:focus:ring-indigo-800 focus:border-indigo-400 outline-none transition-all"
                    />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-1 pb-4">
                    <button
                        onClick={() => setViewMode('dashboard')}
                        className="flex-1 py-3.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleCloseShift}
                        disabled={loading || effectiveDeclaredCash < 0}
                        className="flex-[1.4] py-3.5 px-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-lg shadow-red-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-[20px]">check_circle</span>
                                <span className="text-[15px]">Confirmar Cierre</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );

    // Render history view
    const renderHistoryView = () => (
        <div className="flex-1 flex flex-col min-h-0 bg-gray-50 dark:bg-black/20">
            <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-gray-100 dark:divide-gray-800 bg-surface-light dark:bg-surface-dark">
                {closedShifts.map((shift) => {
                    const shiftVoids = voidsByShift[shift.id] || [];
                    const voidTotal = shiftVoids.reduce((s, e) => s + e.amount, 0);
                    const shiftRefunds = refundsByShift[shift.id] || [];
                    const refundTotal = shiftRefunds.reduce((s, e) => s + e.amount, 0);
                    const shiftDiscount = discountsByShift[shift.id];
                    return (
                    <div
                        key={shift.id}
                        onClick={() => handleOpenShiftDetail(shift)}
                        className="px-4 py-4 hover:bg-gray-100 dark:hover:bg-gray-800/60 active:bg-gray-200 dark:active:bg-gray-800 cursor-pointer transition-all group hover:shadow-[inset_3px_0_0_0_theme(colors.indigo.500)] dark:hover:shadow-[inset_3px_0_0_0_theme(colors.indigo.400)]"
                    >
                        <div className="flex items-center gap-4">
                            <div className={`size-10 rounded-full flex items-center justify-center transition-transform group-hover:scale-105 ${shift.difference === 0 || shift.difference === null
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                                : (shift.difference || 0) > 0
                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'
                                    : 'bg-red-100 dark:bg-red-900/30 text-red-600'
                                }`}>
                                <span className="material-symbols-outlined">
                                    {shift.difference === 0 || shift.difference === null ? 'check' : (shift.difference || 0) > 0 ? 'arrow_upward' : 'arrow_downward'}
                                </span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-gray-900 dark:text-white text-sm">
                                    {shift.register?.name || 'Caja'}
                                    {shift.shift_number !== undefined && shift.shift_number !== null && (
                                        <span className="font-bold text-gray-600 dark:text-gray-300"> · #{shift.shift_number}</span>
                                    )}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {formatDate(shift.opened_at)} • {shift.opened_by_profile?.full_name}
                                </p>
                                {shiftDiscount && (
                                    <p className="text-[11px] font-bold text-purple-600 dark:text-purple-400 mt-0.5 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[13px]">sell</span>
                                        {shiftDiscount.count} descuento{shiftDiscount.count > 1 ? 's' : ''} · -{formatCurrency(shiftDiscount.total)}
                                    </p>
                                )}
                                {shiftVoids.length > 0 && (
                                    <p className="text-[11px] font-bold text-red-500 mt-0.5 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[13px]">block</span>
                                        {shiftVoids.length} anulación{shiftVoids.length > 1 ? 'es' : ''} · {formatCurrency(voidTotal)}
                                    </p>
                                )}
                                {shiftRefunds.length > 0 && (
                                    <p className="text-[11px] font-bold text-amber-600 dark:text-amber-500 mt-0.5 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[13px]">undo</span>
                                        {shiftRefunds.length} devolución{shiftRefunds.length > 1 ? 'es' : ''} · {formatCurrency(refundTotal)}
                                    </p>
                                )}
                            </div>
                            <div className="text-right">
                                <p className="font-bold text-gray-900 dark:text-white text-sm">
                                    {formatCurrency(shift.total_sales)}
                                </p>
                                <p className={`text-xs font-medium ${shift.difference === 0 || shift.difference === null
                                    ? 'text-green-600'
                                    : (shift.difference || 0) > 0
                                        ? 'text-blue-600'
                                        : 'text-red-600'
                                    }`}>
                                    {shift.difference === 0 || shift.difference === null
                                        ? 'Cuadra'
                                        : (shift.difference || 0) > 0
                                            ? `+${formatCurrency(shift.difference || 0)}`
                                            : formatCurrency(shift.difference || 0)}
                                </p>
                            </div>
                            <span className={`material-symbols-outlined text-gray-300 group-hover:text-gray-700 dark:group-hover:text-gray-200 transition-all ${loadingShiftId === shift.id ? 'animate-spin' : 'group-hover:translate-x-0.5'}`}>
                                {loadingShiftId === shift.id ? 'progress_activity' : 'chevron_right'}
                            </span>
                        </div>
                    </div>
                    );
                })}
                {shiftsLoading && closedShifts.length === 0 && (
                    <div className="px-4 py-16 text-center text-gray-400">
                        <span className="material-symbols-outlined text-3xl mb-2 animate-spin text-indigo-500">progress_activity</span>
                        <p className="text-sm font-medium">Cargando turnos...</p>
                    </div>
                )}
                {!shiftsLoading && closedShifts.length === 0 && (
                    <div className="px-4 py-12 text-center text-gray-400">
                        <span className="material-symbols-outlined text-3xl mb-2 opacity-50">folder_open</span>
                        <p className="text-sm">No hay turnos cerrados en este período</p>
                    </div>
                )}
            </div>
        </div>
    );

    // Render shift detail view
    const renderDetailView = () => {
        if (!selectedShift) return null;

        const isOk = selectedShift.difference === 0 || selectedShift.difference === null;
        const isOver = (selectedShift.difference || 0) > 0;

        return (
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-surface-light dark:bg-surface-dark">
                {/* Header del detalle: fondo con degradado + acento lateral según estado */}
                <div className={`relative px-5 py-4 border-b overflow-hidden ${
                    isOk
                        ? 'bg-gradient-to-br from-emerald-50 via-emerald-50/40 to-transparent dark:from-emerald-900/25 dark:via-emerald-900/10 dark:to-transparent border-emerald-100 dark:border-emerald-900/40'
                        : isOver
                            ? 'bg-gradient-to-br from-blue-50 via-blue-50/40 to-transparent dark:from-blue-900/25 dark:via-blue-900/10 dark:to-transparent border-blue-100 dark:border-blue-900/40'
                            : 'bg-gradient-to-br from-red-50 via-red-50/40 to-transparent dark:from-red-900/25 dark:via-red-900/10 dark:to-transparent border-red-100 dark:border-red-900/40'
                }`}>
                    <span
                        className={`absolute left-0 top-0 bottom-0 w-1 ${
                            isOk ? 'bg-emerald-500' : isOver ? 'bg-blue-500' : 'bg-red-500'
                        }`}
                        aria-hidden="true"
                    />
                    {/* Ícono decorativo de estado, sutil al fondo */}
                    <span className={`material-symbols-outlined absolute -right-3 -top-3 text-[110px] leading-none pointer-events-none select-none opacity-[0.06] ${
                        isOk ? 'text-emerald-600' : isOver ? 'text-blue-600' : 'text-red-600'
                    }`} aria-hidden="true">
                        {isOk ? 'check_circle' : isOver ? 'trending_up' : 'trending_down'}
                    </span>
                    <div className="relative flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">
                                    {selectedShift.register?.name}
                                </h2>
                                {selectedShift.shift_number !== undefined && (
                                    <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                                        · Turno #{selectedShift.shift_number}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[14px]">person</span>
                                {selectedShift.opened_by_profile?.full_name}
                            </p>
                        </div>
                        <div className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm ${
                            isOk
                                ? 'bg-emerald-500 text-white dark:bg-emerald-500/90'
                                : isOver
                                    ? 'bg-blue-500 text-white dark:bg-blue-500/90'
                                    : 'bg-red-500 text-white dark:bg-red-500/90'
                            }`}>
                            {isOk ? '✓ Cuadra' : isOver ? '↑ Sobrante' : '↓ Faltante'}
                        </div>
                    </div>
                </div>

                        {/* 1. Resumen de Ventas */}
                        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                            <p className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-widest mb-3">1. Desglose de Ventas</p>
                            <div className="grid grid-cols-2 gap-2">
                                {selectedShift.sales_by_method && Object.keys(selectedShift.sales_by_method).length > 0 ? (
                                    // Desglose dinámico: soporta cualquier método de pago
                                    Object.entries(selectedShift.sales_by_method).map(([method, amount]) => {
                                        const labels: Record<string, string> = {
                                            cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia',
                                            nequi: 'Nequi', daviplata: 'Daviplata', credit: 'Crédito', other: 'Otro',
                                        };
                                        const label = labels[method] || method.charAt(0).toUpperCase() + method.slice(1);
                                        return (
                                            <div key={method} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5">
                                                <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-medium">{label}</p>
                                                <p className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency((amount as number) || 0)}</p>
                                            </div>
                                        );
                                    })
                                ) : (
                                    // Fallback para turnos anteriores a esta actualización
                                    <>
                                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5">
                                            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-medium">Efectivo</p>
                                            <p className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(selectedShift.total_cash_sales)}</p>
                                        </div>
                                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5">
                                            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-medium">Tarjeta</p>
                                            <p className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(selectedShift.total_card_sales)}</p>
                                        </div>
                                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5">
                                            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-medium">Transferencia</p>
                                            <p className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(selectedShift.total_transfer_sales)}</p>
                                        </div>
                                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5">
                                            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-medium">Crédito</p>
                                            <p className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(selectedShift.total_credit_sales)}</p>
                                        </div>
                                    </>
                                )}
                                {shiftDiscountsTotal > 0 && (
                                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5 col-span-2 flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-medium">Descuentos</p>
                                            <button
                                                type="button"
                                                onClick={() => setShowShiftDiscountsModal(true)}
                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowShiftDiscountsModal(true); } }}
                                                className="text-[10px] font-bold text-amber-600 dark:text-amber-400 underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-300"
                                                aria-label="Ver descuentos por orden del turno"
                                                tabIndex={0}
                                            >
                                                Ver
                                            </button>
                                        </div>
                                        <p className="text-sm font-bold text-red-500">-{formatCurrency(shiftDiscountsTotal)}</p>
                                    </div>
                                )}
                                {shiftRoundingAdjustment !== 0 && (
                                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5 col-span-2 flex justify-between items-center">
                                        <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-medium">Ajuste al peso</p>
                                        <p className="text-sm font-bold text-gray-600 dark:text-gray-300">
                                            {shiftRoundingAdjustment >= 0 ? '+' : '-'}{formatCurrency(Math.abs(shiftRoundingAdjustment))}
                                        </p>
                                    </div>
                                )}
                                <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-2.5 col-span-2 flex justify-between items-center">
                                    <p className="text-xs text-gray-600 dark:text-gray-300 uppercase font-bold">Total Ventas</p>
                                    <p className="text-lg font-black text-gray-900 dark:text-white">{formatCurrency((Number(selectedShift.total_sales) || 0) + shiftRoundingAdjustment)}</p>
                                </div>
                                {(shiftDiscountsTotal > 0 || shiftRoundingAdjustment !== 0) && (
                                    <p className="col-span-2 flex items-center gap-1 px-0.5 text-[10px] text-gray-400 dark:text-gray-500">
                                        <span className="material-symbols-outlined text-[13px]">info</span>
                                        El total de ventas ya incluye {shiftDiscountsTotal > 0 && shiftRoundingAdjustment !== 0 ? 'descuentos y ajuste al peso' : shiftDiscountsTotal > 0 ? 'los descuentos' : 'el ajuste al peso'}.
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* 2. Movimientos Manuales */}
                        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                            <p className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-widest mb-3">2. Movimientos de Caja</p>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5 border-l-2 border-green-500">
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase truncate font-medium">Entradas</p>
                                    <p className="text-sm font-bold text-green-600">{formatCurrency(selectedShift.total_cash_in || 0)}</p>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5 border-l-2 border-red-500">
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase truncate font-medium">Gastos</p>
                                    <p className="text-sm font-bold text-red-600">{formatCurrency(selectedShift.total_expenses || 0)}</p>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5 border-l-2 border-red-500">
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase truncate font-medium">Retiros</p>
                                    <p className="text-sm font-bold text-red-600">{formatCurrency(selectedShift.total_cash_out || 0)}</p>
                                </div>
                                {(selectedShift.total_refunds || 0) > 0 && (
                                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5 border-l-2 border-orange-500">
                                        <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase truncate font-medium">Devoluciones</p>
                                        <p className="text-sm font-bold text-orange-600">{formatCurrency(selectedShift.total_refunds || 0)}</p>
                                    </div>
                                )}
                                {(selectedShift.total_other_withdrawals || 0) > 0 && (
                                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5 border-l-2 border-red-400">
                                        <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase truncate font-medium">Retiros no efectivo</p>
                                        <p className="text-sm font-bold text-red-500">{formatCurrency(selectedShift.total_other_withdrawals || 0)}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 3. Arqueo de Efectivo */}
                        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                            <p className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-widest mb-3">3. Arqueo de Efectivo</p>
                            <div className="flex flex-col gap-2 mb-3">
                                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5">
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-medium">Base + Modificaciones</p>
                                    <p className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(selectedShift.expected_cash)}</p>
                                </div>
                                <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2.5 ring-1 ring-gray-200 dark:ring-gray-700">
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-medium">Plata Declarada en Cajón</p>
                                    <p className="text-sm font-bold text-gray-900 dark:text-white">{formatCurrency(selectedShift.declared_cash || 0)}</p>
                                </div>
                            </div>

                            {/* Difference */}
                            <div className={`p-3 rounded-lg flex items-center justify-between ${selectedShift.difference === 0 || selectedShift.difference === null
                                ? 'bg-green-50 dark:bg-green-900/10'
                                : (selectedShift.difference || 0) > 0
                                    ? 'bg-blue-50 dark:bg-blue-900/10'
                                    : 'bg-red-50 dark:bg-red-900/10'
                                }`}>
                                <p className="text-[10px] sm:text-xs font-bold uppercase" style={{
                                    color: selectedShift.difference === 0 || selectedShift.difference === null ? '#16a34a' : (selectedShift.difference || 0) > 0 ? '#2563eb' : '#dc2626'
                                }}>Diferencia Total</p>
                                <p className="text-lg sm:text-xl font-black" style={{
                                    color: selectedShift.difference === 0 || selectedShift.difference === null ? '#16a34a' : (selectedShift.difference || 0) > 0 ? '#2563eb' : '#dc2626'
                                }}>
                                    {selectedShift.difference === 0 || selectedShift.difference === null
                                        ? formatCurrency(0)
                                        : ((selectedShift.difference || 0) > 0 ? '+' : '') + formatCurrency(selectedShift.difference || 0)}
                                </p>
                            </div>
                        </div>

                        {/* Anulaciones del turno */}
                        {(voidsByShift[selectedShift.id] || []).length > 0 && (
                            <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                                <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-3 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[14px]">block</span>
                                    Anulaciones del turno
                                </p>
                                <div className="flex flex-col gap-2">
                                    {(voidsByShift[selectedShift.id] || []).map((v, i) => (
                                        <div key={i} className="bg-red-50 dark:bg-red-900/10 rounded-lg p-2.5 border-l-2 border-red-400">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">
                                                    {v.kind === 'item' ? 'Ítem: ' : ''}{v.label}
                                                </p>
                                                <p className="text-sm font-bold text-red-600 shrink-0">{formatCurrency(v.amount)}</p>
                                            </div>
                                            {v.reason && (
                                                <p className="text-[11px] text-gray-500 mt-0.5">Motivo: {v.reason}</p>
                                            )}
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between bg-red-100/60 dark:bg-red-900/20 rounded-lg p-2.5">
                                        <p className="text-[11px] font-bold text-red-600 uppercase">Total anulado</p>
                                        <p className="text-sm font-black text-red-600">
                                            {formatCurrency((voidsByShift[selectedShift.id] || []).reduce((s, e) => s + e.amount, 0))}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Devoluciones del turno (solo pantalla; lo impreso no se toca) */}
                        {(refundsByShift[selectedShift.id] || []).length > 0 && (
                            <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                                <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest mb-3 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[14px]">undo</span>
                                    Devoluciones del turno
                                </p>
                                <div className="flex flex-col gap-2">
                                    {(refundsByShift[selectedShift.id] || []).map((r) => (
                                        <div key={r.id} className="bg-orange-50 dark:bg-orange-900/10 rounded-lg p-2.5 border-l-2 border-orange-400">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">{r.label}</p>
                                                <p className="text-sm font-bold text-orange-600 shrink-0">{formatCurrency(r.amount)}</p>
                                            </div>
                                            <p className="text-[11px] text-gray-500 mt-0.5">Motivo: {r.reason}</p>
                                            {r.items && <p className="text-[10px] text-gray-400 mt-0.5">{r.items}</p>}
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between bg-orange-100/60 dark:bg-orange-900/20 rounded-lg p-2.5">
                                        <p className="text-[11px] font-bold text-orange-600 uppercase">Total devuelto</p>
                                        <p className="text-sm font-black text-orange-600">
                                            {formatCurrency((refundsByShift[selectedShift.id] || []).reduce((s, e) => s + e.amount, 0))}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Notes */}
                        {selectedShift.notes && (
                            <div className="mx-4 mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-xl border border-yellow-200 dark:border-yellow-800">
                                <p className="text-[10px] sm:text-xs font-bold text-yellow-700 dark:text-yellow-400 uppercase mb-1">Notas</p>
                                <p className="text-xs sm:text-sm text-yellow-800 dark:text-yellow-200">{selectedShift.notes}</p>
                            </div>
                        )}

                        {/* Footer */}
                        <div className="px-4 pb-4 pt-2">
                            <div className="flex flex-col text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 gap-1.5">
                                <span className="truncate"><b>Apertura:</b> {formatDate(selectedShift.opened_at)} a las {formatTime(selectedShift.opened_at)} - {selectedShift.opened_by_profile?.full_name}</span>
                                <span className="truncate"><b>Cierre:</b> {selectedShift.closed_at ? `${formatDate(selectedShift.closed_at)} a las ${formatTime(selectedShift.closed_at)}` : 'Pendiente'} - {selectedShift.closed_by_profile?.full_name || 'N/A'}</span>
                            </div>
                        </div>
            </div>
        );
    };

    // Solo mostramos el loader full-screen en la carga inicial. Tras esto,
    // refrescos (refetch tras movimientos, cambio de turno, etc.) no remontan
    // el loader — el contenido se actualiza inline manteniendo la UX fluida.
    if (!isInitialLoadDone.current && (loading || movementsLoading)) return <ScreenLoader />;

    // Botones de acción del detalle de turno (Imprimir / PDF / Correo [+ Productos]).
    // `layout='inline'`: compactos, para acompañar a "Atrás" cuando hay 3 botones (negocios normales).
    // `layout='row'`: a ancho completo (flex-1), en fila propia cuando hay 4 botones (negocio 10001),
    // para que no queden apretados contra "Atrás" en el panel angosto de caja.
    const renderShiftDetailActions = (layout: 'inline' | 'row') => {
        if (!selectedShift) return null;
        // En ambos layouts los botones reparten el ancho por igual (flex-1) para
        // que no queden apretados en pantallas angostas (ej. Galaxy S23). El icono
        // se mantiene shrink-0 y el texto se trunca si el botón queda muy chico.
        const btnBase = 'flex-1 min-w-0 h-9 flex items-center justify-center gap-1 px-1.5 rounded-lg border transition-all';
        return (
            <div className={`flex items-stretch gap-1.5 ${layout === 'inline' ? 'flex-1 min-w-0' : ''}`}>
                <button
                    onClick={handlePrintShiftReport}
                    disabled={isPrintingReport || isConnectingReportPrinter}
                    className={`${btnBase} border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:border-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50`}
                    aria-label="Imprimir reporte"
                    title="Imprimir reporte"
                >
                    <span className="material-symbols-outlined text-[18px] shrink-0">{isPrintingReport ? 'progress_activity' : 'print'}</span>
                    <span className="text-xs font-medium truncate">Imprimir</span>
                </button>
                <button
                    onClick={handleDownloadShiftReport}
                    disabled={isDownloadingReport}
                    className={`${btnBase} border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50`}
                    aria-label="Descargar PDF del reporte"
                    title="Descargar PDF"
                >
                    <span className="material-symbols-outlined text-[18px] shrink-0">{isDownloadingReport ? 'progress_activity' : 'download'}</span>
                    <span className="text-xs font-medium truncate">PDF</span>
                </button>
                {!String(selectedShift.id).startsWith('offline_') && (
                    <button
                        onClick={() => setShowReportEmailModal(true)}
                        className={`${btnBase} border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300`}
                        aria-label="Enviar reporte por correo"
                        title="Enviar por correo"
                    >
                        <span className="material-symbols-outlined text-[18px] shrink-0">email</span>
                        <span className="text-xs font-medium truncate">Correo</span>
                    </button>
                )}
                {/* Negocio 10001: imprimir top de productos vendidos del turno (por ingreso) */}
                {isNegocio10001 && (
                    <button
                        onClick={handlePrintTopProducts}
                        disabled={isPrintingTop || isConnectingReportPrinter}
                        className={`${btnBase} border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-400 hover:text-amber-700 dark:hover:text-amber-300 disabled:opacity-50`}
                        aria-label="Imprimir productos vendidos del turno"
                        title="Imprimir productos vendidos"
                    >
                        <span className="material-symbols-outlined text-[18px] shrink-0">{isPrintingTop ? 'progress_activity' : 'print'}</span>
                        <span className="text-xs font-medium truncate">Productos</span>
                    </button>
                )}
            </div>
        );
    };

    // Popup de selección de impresora (compartido por reporte y productos).
    const renderPrinterPickerPopup = (align: 'right-0' | 'right-4') => (
        showReportPrinterList && reportPrintersToConnect.length > 0 ? (
            <>
                <div className="fixed inset-0 z-40" onClick={() => setShowReportPrinterList(false)} aria-hidden="true" />
                <div className={`absolute top-full ${align} mt-1 z-50 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl space-y-1.5 animate-[scaleIn_0.15s_ease-out] min-w-[200px]`}>
                    <p className="text-[11px] font-bold text-gray-600 dark:text-gray-300 mb-2">Selecciona tu impresora:</p>
                    {reportPrintersToConnect.map((p) => (
                        <button
                            key={p}
                            type="button"
                            onClick={() => handleSelectReportPrinter(p)}
                            disabled={isConnectingReportPrinter}
                            className="w-full text-left py-2 px-3 rounded-lg text-[12px] font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/60 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors border border-transparent hover:border-emerald-200 dark:hover:border-emerald-900/40 disabled:opacity-50"
                        >
                            🖨️ {p}
                        </button>
                    ))}
                </div>
            </>
        ) : null
    );

    return (
        <div className="flex-1 flex flex-col h-full bg-background-light dark:bg-background-dark overflow-hidden animate-fadeIn">
            {/* Header Unificado */}
            {viewMode !== 'current_movements' && !isClosing && (
                <header className="shrink-0 bg-surface-light dark:bg-surface-dark border-b border-gray-200 dark:border-gray-800 z-10 flex flex-col">
                    {/* Título, Caja y Arqueo */}
                    <div className="flex items-center justify-between gap-3 px-4 py-3 min-h-[60px]">
                        <div className="flex items-center gap-2 min-w-0">
                            {onClose && (viewMode === 'history' || viewMode === 'detail') ? (
                                <button
                                    onClick={handleBackPress}
                                    className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 active:bg-gray-100 dark:active:bg-gray-800 transition-colors outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-gray-600 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-900 flex items-center gap-1.5 shrink-0"
                                    style={{ outline: 'none', transitionProperty: 'color, background-color, border-color' }}
                                >
                                    <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                                    {/* <430px: ocultar el texto para dar espacio a los botones de acción */}
                                    <span className="font-semibold text-sm hidden min-[430px]:inline">Atrás</span>
                                </button>
                            ) : (
                                onClose && (
                                    <button
                                        onClick={handleBackPress}
                                        className="size-9 -ml-1 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none shrink-0"
                                        style={{ outline: 'none' }}
                                        aria-label="Cerrar"
                                    >
                                        <span className="material-symbols-outlined text-[20px] leading-none">arrow_back</span>
                                    </button>
                                )
                            )}
                        </div>

                        {/* Botón Arqueo, Historial o Acciones de detalle */}
                        <div className="relative flex items-center justify-end gap-1.5">
                            {viewMode === 'history' && (
                                <div className="relative flex items-center gap-1.5">
                                    {shiftsLoading && (
                                        <span className="material-symbols-outlined text-[15px] animate-spin text-indigo-500 shrink-0" title="Cargando turnos...">progress_activity</span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setIsPeriodOpen(!isPeriodOpen)}
                                        className="inline-flex items-center px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 shadow-sm text-xs font-semibold rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-[#151e32] hover:bg-gray-50 dark:hover:bg-[#1A1A1A] transition-colors shrink-0"
                                    >
                                        <span className="material-symbols-outlined text-[16px] mr-1 text-gray-500 dark:text-gray-400 shrink-0">calendar_month</span>
                                        <span className="truncate max-w-[120px] sm:max-w-[170px]">
                                            {historyFilter === 'custom' ? formatDateRange(appliedStart, appliedEnd) : PERIOD_LABELS[historyFilter]}
                                        </span>
                                        <span className="material-symbols-outlined text-[14px] ml-1 text-gray-400 shrink-0">expand_more</span>
                                    </button>

                                    {isPeriodOpen && (
                                        <>
                                            <div className="fixed inset-0 z-30" onClick={() => setIsPeriodOpen(false)} />
                                            <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl z-40 py-1 animate-[fadeIn_0.1s_ease-out]">
                                                {(Object.keys(PERIOD_LABELS) as HistoryFilter[]).filter(k => k !== 'custom').map((key) => (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        onClick={() => { setHistoryFilter(key); setIsPeriodOpen(false); }}
                                                        className={`w-full text-left px-4 py-2 text-xs transition-colors ${historyFilter === key ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 font-medium'}`}
                                                    >
                                                        {PERIOD_LABELS[key]}
                                                    </button>
                                                ))}
                                                <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
                                                <button
                                                    type="button"
                                                    onClick={() => { setIsPeriodOpen(false); setIsCustomOpen(true); }}
                                                    className={`w-full text-left px-4 py-2 text-xs transition-colors ${historyFilter === 'custom' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 font-medium'}`}
                                                >
                                                    Personalizado
                                                </button>
                                            </div>
                                        </>
                                    )}

                                    {isCustomOpen && (
                                        <>
                                            <div className="fixed inset-0 z-30" onClick={() => setIsCustomOpen(false)} />
                                            <div className="fixed inset-x-2 top-20 sm:absolute sm:inset-auto sm:right-0 sm:top-full mt-2 z-50 flex justify-center sm:block">
                                                <CustomDateRangePicker
                                                    initialStart={appliedStart}
                                                    initialEnd={appliedEnd}
                                                    singleMonth={true}
                                                    onApply={(start, end) => {
                                                        setAppliedStart(start);
                                                        setAppliedEnd(end);
                                                        setHistoryFilter('custom');
                                                        setIsCustomOpen(false);
                                                    }}
                                                    onCancel={() => setIsCustomOpen(false)}
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {!activeShift && viewMode !== 'history' && viewMode !== 'detail' && (
                                <button
                                    onClick={() => setViewMode('history')}
                                    className="px-3 py-1.5 text-xs font-bold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-1.5"
                                >
                                    <span className="material-symbols-outlined text-[16px]">history</span>
                                    <span className="hidden sm:inline">Historial Turnos</span>
                                    <span className="sm:hidden">Historial</span>
                                </button>
                            )}

                            {activeShift && canClose && viewMode === 'dashboard' && (
                                <button
                                    onClick={() => setViewMode('close')}
                                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm shadow-red-600/20 flex items-center gap-1.5"
                                >
                                    <span className="material-symbols-outlined text-[16px]">lock</span>
                                    <span className="hidden sm:inline">Cerrar Turno</span>
                                    <span className="sm:hidden">Cerrar</span>
                                </button>
                            )}
                        </div>

                        {/* Negocios normales (3 botones): acciones del detalle en la MISMA
                            fila que "Atrás". El grupo toma el ancho sobrante (flex-1) y sus
                            botones se reparten por igual, para no apretarse en pantallas
                            angostas (ej. Galaxy S23). */}
                        {viewMode === 'detail' && selectedShift && !isNegocio10001 && (
                            <div className="relative flex-1 min-w-0">
                                {renderPrinterPickerPopup('right-0')}
                                {renderShiftDetailActions('inline')}
                            </div>
                        )}
                    </div>

                    {/* Negocio 10001 (4 botones): acciones del detalle en fila propia a
                        ancho completo, para que se distribuyan simétricamente sin
                        apretarse contra "Atrás" dentro del panel angosto de caja. */}
                    {viewMode === 'detail' && selectedShift && isNegocio10001 && (
                        <div className="relative px-4 pb-3">
                            {renderPrinterPickerPopup('right-4')}
                            {renderShiftDetailActions('row')}
                        </div>
                    )}

                    {/* Tab Navigation */}
                    {activeShift && viewMode !== 'history' && viewMode !== 'detail' && (
                        <div className="px-4 pb-3">
                            <div className="flex items-center w-full max-w-sm gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                                <button
                                    onClick={() => setViewMode('dashboard')}
                                    className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${viewMode === 'dashboard' || viewMode === 'close'
                                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                        }`}
                                >
                                    Turno Actual
                                </button>
                                <button
                                    onClick={() => setViewMode('history')}
                                    className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all ${'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                                >
                                    Historial
                                </button>
                            </div>
                        </div>
                    )}
                </header>
            )}

            {/* Error Banner */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 px-6 py-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-red-600">error</span>
                    <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
                    <button onClick={refetch} className="ml-auto text-sm font-medium text-red-600 hover:underline">
                        Reintentar
                    </button>
                </div>
            )}

            {isClosing && (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-gray-50 dark:bg-black/20">
                    <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
                    <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Cerrando turno...</p>
                </div>
            )}
            {!isClosing && !activeShift && viewMode !== 'history' && viewMode !== 'detail' && viewMode !== 'current_movements' && renderOpeningView()}
            {!isClosing && activeShift && viewMode === 'dashboard' && renderDashboardView()}
            {activeShift && viewMode === 'current_movements' && renderCurrentMovementsView()}
            {activeShift && !isClosing && viewMode === 'close' && renderCloseView()}
            {viewMode === 'history' && renderHistoryView()}
            {viewMode === 'detail' && renderDetailView()}

            {/* Enviar reporte de cierre por correo */}
            <EmailReceiptModal
                isOpen={showReportEmailModal}
                onClose={() => setShowReportEmailModal(false)}
                onSend={handleSendShiftReportEmail}
            />

            {/* Devolución de venta */}
            <RefundSaleModal
                isOpen={showRefundSaleModal}
                onClose={() => setShowRefundSaleModal(false)}
                hasOpenShift={!!activeShift}
                onDone={() => { refetch(); }}
            />

            {/* Modal: Descuentos del turno (detalle por orden) */}
            {showShiftDiscountsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" role="button" tabIndex={-1} onClick={() => setShowShiftDiscountsModal(false)} onKeyDown={(e) => e.key === 'Escape' && setShowShiftDiscountsModal(false)} aria-label="Cerrar"></div>
                    <div className="relative bg-white dark:bg-surface-dark rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-800">
                            <h3 className="text-base font-bold text-gray-900 dark:text-white">Descuentos del turno</h3>
                            <button
                                type="button"
                                onClick={() => setShowShiftDiscountsModal(false)}
                                className="size-8 flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                                aria-label="Cerrar"
                            >
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>
                        <div className="max-h-[50vh] overflow-y-auto p-4 flex flex-col gap-1.5">
                            {shiftDiscounts.length === 0 ? (
                                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No hubo descuentos en este turno.</p>
                            ) : (
                                shiftDiscounts.map((d, i) => (
                                    <div key={`${d.order_number}-${d.product_name || 'global'}-${i}`} className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
                                        <span className="text-sm text-gray-700 dark:text-gray-300 min-w-0 truncate">
                                            <span className="font-medium">Orden #{d.order_number}</span>
                                            {d.product_name && (
                                                <span className="text-gray-500 dark:text-gray-400"> · {d.product_name}</span>
                                            )}
                                        </span>
                                        <span className="text-sm font-bold text-red-500 shrink-0">-{formatCurrency(d.amount)}</span>
                                    </div>
                                ))
                            )}
                        </div>
                        <div className="flex items-center justify-between p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                            <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase">Total descuentos</span>
                            <span className="text-base font-black text-red-500">-{formatCurrency(shiftDiscountsTotal)}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Movement Modal */}
            {showMovementModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" role="button" tabIndex={-1} onClick={() => setShowMovementModal(null)} onKeyDown={(e) => e.key === 'Escape' && setShowMovementModal(null)} aria-label="Cerrar"></div>
                    <div className="relative bg-white dark:bg-surface-dark rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-gray-200 dark:border-gray-700">
                        {(() => {
                            const isIn = showMovementModal === 'cash_in';
                            const isRefund = showMovementModal === 'refund';
                            const title = isIn ? 'Entrada de Efectivo' : isRefund ? 'Devolución de Dinero' : 'Salida de Dinero';
                            const icon = isIn ? 'add_circle' : isRefund ? 'undo' : 'remove_circle';
                            const iconBg = isIn ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                                : isRefund ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600'
                                : 'bg-orange-100 dark:bg-orange-900/30 text-orange-600';
                            const btnColor = isIn ? 'bg-green-600 hover:bg-green-700 shadow-green-600/20'
                                : isRefund ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/20'
                                : 'bg-orange-600 hover:bg-orange-700 shadow-orange-600/20';
                            const placeholder = isIn ? 'Ej: Cambio de billetes' : isRefund ? 'Ej: Devolución producto' : 'Ej: Pago proveedor';
                            return (
                        <>
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-3">
                                <div className={`size-10 rounded-full flex items-center justify-center ${iconBg}`}>
                                    <span className="material-symbols-outlined">{icon}</span>
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
                            </div>
                            <button
                                onClick={() => setShowMovementModal(null)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Monto</label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-gray-400 font-bold">$</span>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={movementAmount}
                                        onChange={(e) => setMovementAmount(formatNumber(e.target.value))}
                                        placeholder="0"
                                        className="w-full h-14 pl-8 pr-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xl font-bold text-gray-900 dark:text-white text-center focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                                        autoFocus
                                    />
                                </div>
                            </div>

                            {/* Método (solo para Salida y Devolución) */}
                            {!isIn && (
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Método</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {businessPaymentMethods.map((m) => {
                                            const info = PAYMENT_METHOD_LABELS[m.mappedId];
                                            const active = movementMethod === m.mappedId;
                                            return (
                                                <button
                                                    key={m.id}
                                                    onClick={() => setMovementMethod(m.mappedId)}
                                                    className={`flex items-center justify-center gap-1 py-2 px-1 rounded-lg border text-xs font-semibold transition-all ${active
                                                        ? 'border-primary bg-primary/10 text-gray-900 dark:text-white'
                                                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">{info?.icon || 'payments'}</span>
                                                    <span className="truncate">{m.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {movementMethod !== 'cash' && (
                                        <p className="mt-2 text-[11px] text-gray-400">
                                            {isRefund ? 'Esta devolución no sale del efectivo del cajón.' : 'Este retiro no sale del efectivo del cajón (queda como "retiro diferente a efectivo").'}
                                        </p>
                                    )}
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Descripción</label>
                                <input
                                    type="text"
                                    value={movementDescription}
                                    onChange={(e) => setMovementDescription(e.target.value)}
                                    placeholder={placeholder}
                                    className="w-full h-12 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setShowMovementModal(null)}
                                    className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleAddMovement}
                                    disabled={parseNumber(movementAmount) <= 0 || movementLoading}
                                    className={`flex-1 py-3 text-white font-bold rounded-xl shadow-md transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${btnColor}`}
                                >
                                    {movementLoading ? (
                                        <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span>
                                    ) : 'Confirmar'}
                                </button>
                            </div>
                        </div>
                        </>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* New Register Modal */}
            {showNewRegisterModal && isAdmin && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" role="button" tabIndex={-1} onClick={() => setShowNewRegisterModal(false)} onKeyDown={(e) => e.key === 'Escape' && setShowNewRegisterModal(false)} aria-label="Cerrar"></div>
                    <div className="relative bg-white dark:bg-surface-dark rounded-2xl w-full max-w-sm p-6 shadow-2xl border border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Crear Nueva Caja</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Nombre de la Caja</label>
                                <input
                                    type="text"
                                    value={newRegisterName}
                                    onChange={(e) => setNewRegisterName(e.target.value)}
                                    placeholder="Ej: Caja 2, Bar, Terraza..."
                                    className="w-full h-12 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none"
                                    autoFocus
                                />
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowNewRegisterModal(false)}
                                    className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCreateRegister}
                                    disabled={!newRegisterName.trim()}
                                    className="flex-1 py-3 bg-primary hover:bg-primary-hover text-[#102218] font-bold rounded-xl disabled:opacity-50"
                                >
                                    Crear Caja
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
