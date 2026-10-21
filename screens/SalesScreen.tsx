import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Screen, ReceiptData } from '../types';
import { formatQty } from '../lib/formatters';
import { ScreenLoader } from '../components/ScreenLoader';
import { useOrders, Order } from '../hooks/useOrders';
import { useSalesHistory } from '../hooks/useSalesHistory';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { supabase } from '../lib/supabase';
import { buildEmployeeReport, EmployeeReportData } from '../lib/buildEmployeeReport';
import { EmployeeReportActionsModal } from '../components/modals/EmployeeReportActionsModal';
import { RefundSaleModal } from '../components/modals/RefundSaleModal';
import { sendReceiptByEmailDirect, shareThermalReceiptPDF, printThermalReceipt, downloadReceiptAsPDF } from '../lib/shareReceiptPDF';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { getPrinterStatus, onPrinterStatusChange, reconnectPrinter, printKitchenCommandDirect } from '../lib/thermalPrinterService';
import { useToast } from '../context/ToastContext';
import { EmailReceiptModal } from '../components/EmailReceiptModal';
import { EditOrderItemModal } from '../components/modals/EditOrderItemModal';
import PrinterSettingsPanel from '../components/PrinterSettingsPanel';
import { isSameDayInTz, yesterdayInTz, formatTimeInTz, formatDateInTz, formatDateTimeInTz, startOfDayInTz, endOfDayInTz, subtractDaysInTz, startOfMonthInTz, startOfLastMonthInTz, endOfLastMonthInTz } from '../lib/timezone';
import { CustomDateRangePicker } from '../components/dashboard/CustomDateRangePicker';
import { useSalesTotals } from '../hooks/useSalesTotals';

type PeriodOption = 'today' | 'yesterday' | '7days' | '30days' | 'this_month' | 'last_month' | 'custom' | 'all';

const PERIOD_LABELS: Record<PeriodOption, string> = {
    all: 'Elegir',
    today: 'Hoy',
    yesterday: 'Ayer',
    '7days': 'Últimos 7 días',
    '30days': 'Últimos 30 días',
    this_month: 'Este mes',
    last_month: 'Mes anterior',
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

interface SalesScreenProps {
    onNavigate: (screen: Screen) => void;
}

const paymentMethodDisplayMap: Record<string, string> = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    nequi: 'Nequi',
    daviplata: 'Daviplata',
    transfer: 'Transferencia',
    credit: 'Crédito Local',
    other: 'Otro',
    mixed: 'Mixto',
};

export const SalesScreen: React.FC<SalesScreenProps> = ({ onNavigate }) => {
    // useOrders sigue siendo la fuente de mutaciones (anular, editar ítem, etc.).
    // La lista visible viene de useSalesHistory (paginada en BD).
    const { voidOrder, voidOrderItem, updateOrderItem } = useOrders();
    const { profile } = useAuth();
    const { hasPermission } = usePermissions();

    // Rol: admin/dueño ve TODAS las ventas y puede anular; cajero ve solo las suyas
    const canSeeAllSales = hasPermission('admin_reports');
    const canVoid = hasPermission('pos_cancel');
    const canRefund = hasPermission('pos_refund');
    const { businessName, timezone, businessNit, businessPhone, businessAddress, receiptBusinessName, receiptPhone, receiptAddress, receiptPaperWidth, isCatalogModeEnabled } = useBusinessSettings();
    const { showToast } = useToast();
    const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [period, setPeriod] = useState<PeriodOption>('today');
    const [isPeriodOpen, setIsPeriodOpen] = useState(false);
    const [isCustomOpen, setIsCustomOpen] = useState(false);
    const [draftStart, setDraftStart] = useState(() => toInputDate(new Date()));
    const [draftEnd, setDraftEnd] = useState(() => toInputDate(new Date()));
    const [appliedStart, setAppliedStart] = useState(() => toInputDate(new Date()));
    const [appliedEnd, setAppliedEnd] = useState(() => toInputDate(new Date()));

    // Filtro por cajero (solo admin lo ve). null = "Todos".
    const [selectedWaiterId, setSelectedWaiterId] = useState<string | null>(null);
    const [isWaiterOpen, setIsWaiterOpen] = useState(false);
    const [employees, setEmployees] = useState<Array<{ id: string; full_name: string; is_active: boolean }>>([]);
    const [isExportingReport, setIsExportingReport] = useState(false);
    const [reportData, setReportData] = useState<EmployeeReportData | null>(null);
    const [showReportModal, setShowReportModal] = useState(false);

    const [isSharing, setIsSharing] = useState(false);
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emailReceiptData, setEmailReceiptData] = useState<ReceiptData | null>(null);
    const [isPrinting, setIsPrinting] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [isPrintingCommand, setIsPrintingCommand] = useState(false);
    const [printerConnected, setPrinterConnected] = useState(getPrinterStatus() === 'connected');
    // Panel de conexión de impresora (se abre al imprimir sin impresora conectada)
    const [showPrinterPanel, setShowPrinterPanel] = useState(false);
    // El modo (catálogo/escáner) es config del negocio (Supabase): solo en modo
    // catálogo tiene sentido imprimir comandas de cocina.
    const isCatalogMode = isCatalogModeEnabled;
    const [editingItem, setEditingItem] = useState<{ id: string; productName: string; quantity: number; unitPrice: number } | null>(null);

    // Anulación (soft void): target puede ser la venta completa o un ítem
    const [voidTarget, setVoidTarget] = useState<
        | { type: 'sale'; id: string; label: string }
        | { type: 'item'; orderId: string; itemId: string; label: string }
        | null
    >(null);
    const [voidReasonOption, setVoidReasonOption] = useState('');
    const [voidReasonCustom, setVoidReasonCustom] = useState('');
    const [isVoiding, setIsVoiding] = useState(false);

    // Frontera Anulación / Devolución (Opción A):
    // - Venta de turno ABIERTO  -> se corrige con Anular.
    // - Venta de turno CERRADO   -> se revierte con Devolución.
    const [showRefundModal, setShowRefundModal] = useState(false);
    const [userHasOpenShift, setUserHasOpenShift] = useState(false);

    // ¿El usuario tiene un turno abierto? (requisito para registrar la devolución)
    useEffect(() => {
        if (!profile?.id || !navigator.onLine) return;
        let cancelled = false;
        (async () => {
            const { data } = await supabase
                .from('cash_shifts')
                .select('id')
                .eq('opened_by', profile.id)
                .eq('status', 'open')
                .limit(1)
                .maybeSingle();
            if (!cancelled) setUserHasOpenShift(!!data);
        })();
        return () => { cancelled = true; };
    }, [profile?.id]);

    const subviewPushedRef = useRef(false);

    useEffect(() => {
        const isMobile = window.innerWidth < 768;
        if (!isMobile) return;

        if (selectedSaleId && !subviewPushedRef.current) {
            window.history.pushState({ subview: 'sale-detail' }, '');
            subviewPushedRef.current = true;
        }
        if (!selectedSaleId) {
            subviewPushedRef.current = false;
        }
    }, [selectedSaleId]);

    useEffect(() => {
        const isMobile = window.innerWidth < 768;
        if (!isMobile) return;

        const handlePopState = (e: PopStateEvent) => {
            if (subviewPushedRef.current) {
                subviewPushedRef.current = false;
                (window as any).__subviewHandledBack = true;
                setSelectedSaleId(null);
            }
        };
        window.addEventListener('popstate', handlePopState, true);
        return () => window.removeEventListener('popstate', handlePopState, true);
    }, []);

    // Performance: Progressive Loading Limits
    useEffect(() => {
        const unsub = onPrinterStatusChange(s => setPrinterConnected(s === 'connected'));
        reconnectPrinter();
        return unsub;
    }, []);

    // Debounce de la búsqueda para no disparar consultas en cada tecla
    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
        return () => clearTimeout(t);
    }, [searchQuery]);

    // Cargar lista de empleados del negocio (solo si el usuario es admin).
    // Incluye activos e inactivos; los borrados (is_deleted) se excluyen.
    useEffect(() => {
        if (!canSeeAllSales || !profile?.business_id || !navigator.onLine) return;
        let cancelled = false;
        (async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, full_name, is_active')
                .eq('business_id', profile.business_id)
                .eq('is_deleted', false)
                .order('full_name', { ascending: true });
            if (!cancelled && !error && data) {
                setEmployees(data as any);
            }
        })();
        return () => { cancelled = true; };
    }, [canSeeAllSales, profile?.business_id]);

    // Calcular rango de fechas en ISO según el período seleccionado.
    // Memoizado por strings primitivos para que el hook no se re-dispare por
    // referencias de Date.
    const { dateStartIso, dateEndIso } = useMemo(() => {
        if (period === 'all') return { dateStartIso: null, dateEndIso: null };

        const now = new Date();
        let start: Date;
        let end: Date;

        if (period === 'custom') {
            start = startOfDayInTz(new Date(appliedStart + 'T12:00:00'), timezone);
            end = endOfDayInTz(new Date(appliedEnd + 'T12:00:00'), timezone);
        } else {
            start = startOfDayInTz(now, timezone);
            end = endOfDayInTz(now, timezone);
            switch (period) {
                case 'today': break;
                case 'yesterday':
                    start = startOfDayInTz(subtractDaysInTz(now, 1, timezone), timezone);
                    end = endOfDayInTz(subtractDaysInTz(now, 1, timezone), timezone);
                    break;
                case '7days':
                    start = startOfDayInTz(subtractDaysInTz(now, 6, timezone), timezone);
                    break;
                case '30days':
                    start = startOfDayInTz(subtractDaysInTz(now, 29, timezone), timezone);
                    break;
                case 'this_month':
                    start = startOfMonthInTz(now, timezone);
                    break;
                case 'last_month':
                    start = startOfLastMonthInTz(now, timezone);
                    end = endOfLastMonthInTz(now, timezone);
                    break;
            }
        }
        return { dateStartIso: start.toISOString(), dateEndIso: end.toISOString() };
    }, [period, appliedStart, appliedEnd, timezone]);

    // Generar el PDF de "Reporte de empleado" con los filtros actuales.
    // Solo se invoca cuando admin tiene seleccionado un cajero y un período
    // distinto a "Todos" (la lógica del botón también lo deshabilita en otros casos).
    const handleExportReport = async () => {
        if (!profile?.business_id || !selectedWaiterId || !dateStartIso || !dateEndIso) return;
        const employee = employees.find(e => e.id === selectedWaiterId);
        if (!employee) {
            showToast('Empleado no encontrado', 'error');
            return;
        }
        setIsExportingReport(true);
        try {
            const periodLabel = period === 'custom'
                ? formatDateRange(appliedStart, appliedEnd)
                : PERIOD_LABELS[period];
            const reportData = await buildEmployeeReport({
                businessId: profile.business_id,
                businessName: businessName || 'Mi Negocio',
                businessNit: businessNit || undefined,
                waiterId: employee.id,
                waiterName: employee.full_name,
                waiterIsActive: employee.is_active,
                dateStartIso,
                dateEndIso,
                timezone,
                periodLabel,
            });
            setReportData(reportData);
            setShowReportModal(true);
        } catch (err: any) {
            console.error('Error al generar reporte de empleado:', err);
            showToast(err.message || 'Error al generar el reporte', 'error');
        } finally {
            setIsExportingReport(false);
        }
    };

    // Lista paginada del historial (los filtros viajan a la BD).
    const {
        orders,
        loading,
        loadingMore,
        hasMore,
        loadMore,
        reload,
        fetchOrderById,
    } = useSalesHistory({
        dateStartIso,
        dateEndIso,
        waiterId: canSeeAllSales ? selectedWaiterId : null,
        search: debouncedSearch,
        scopeToCurrentUser: !canSeeAllSales,
    });

    // Totales agregados del período (barra de KPIs por método de pago)
    const { totals, loading: totalsLoading, reload: reloadTotals } = useSalesTotals({
        dateStartIso,
        dateEndIso,
        waiterId: canSeeAllSales ? selectedWaiterId : null,
        scopeToCurrentUser: !canSeeAllSales,
    });

    // Deep-link desde el visor de eventos (botón "Ver venta"): ?sale=<order_id>.
    // Carga esa venta puntual aunque no esté en la página actual y la abre.
    const [deepLinkSale, setDeepLinkSale] = useState<Order | null>(null);
    // Se captura el ?sale de forma síncrona al montar (y se limpia la URL). El
    // fetch real se difiere a un efecto que espera a que `business_id` esté
    // disponible: si se hiciera en el mount, el perfil podría no estar cargado
    // todavía y `fetchOrderById` devolvería null.
    const [pendingSaleId, setPendingSaleId] = useState<string | null>(() => {
        if (typeof window === 'undefined') return null;
        const p = new URLSearchParams(window.location.search);
        const s = p.get('sale');
        if (s) {
            p.delete('sale');
            const qs = p.toString();
            window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs ? '?' + qs : ''}${window.location.hash}`);
        }
        return s;
    });
    useEffect(() => {
        if (!pendingSaleId || !profile?.business_id) return;
        let cancelled = false;
        (async () => {
            const order = await fetchOrderById(pendingSaleId);
            if (cancelled) return;
            if (order) {
                setDeepLinkSale(order);
                setSelectedSaleId(order.id);
            } else {
                showToast('No se encontró la venta', 'warning');
            }
            setPendingSaleId(null);
        })();
        return () => { cancelled = true; };
    }, [pendingSaleId, profile?.business_id, fetchOrderById, showToast]);

    // Solo mostramos el ScreenLoader la primera vez que entra el usuario.
    // Cargas subsiguientes (cambio de filtro) usan un spinner pequeño en la
    // lista para no parpadear toda la pantalla.
    const [firstLoadDone, setFirstLoadDone] = useState(false);
    useEffect(() => {
        if (!loading) setFirstLoadDone(true);
    }, [loading]);

    // Al cambiar cualquier filtro, deseleccionar la venta actual.
    // No queremos auto-seleccionar nunca: ni al entrar, ni al cambiar filtros.
    useEffect(() => {
        setSelectedSaleId(null);
    }, [period, appliedStart, appliedEnd, debouncedSearch, selectedWaiterId]);

    const selectedSale = orders.find(s => s.id === selectedSaleId)
        ?? (deepLinkSale && deepLinkSale.id === selectedSaleId ? deepLinkSale : undefined);
    const selectedSaleIsClosed = selectedSale?.shift_status === 'closed' || selectedSale?.shift_status === 'reconciled';

    // Scroll infinito real: cuando el usuario llega cerca del fondo, pedir
    // la siguiente página al servidor.
    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, clientHeight, scrollHeight } = e.currentTarget;
        if (scrollHeight - scrollTop <= clientHeight + 100) {
            loadMore();
        }
    }, [loadMore]);

    const handleVoidItem = (orderId: string, itemId: string, productName: string) => {
        setVoidReasonOption('');
        setVoidReasonCustom('');
        setVoidTarget({ type: 'item', orderId, itemId, label: productName });
    };

    const handleVoidSale = () => {
        if (!selectedSale) return;
        setVoidReasonOption('');
        setVoidReasonCustom('');
        setVoidTarget({
            type: 'sale',
            id: selectedSale.id,
            label: `#${selectedSale.display_number || selectedSale.order_number}`
        });
    };

    const VOID_REASONS = [
        'Error del cajero',
        'Producto equivocado',
        'Cliente se arrepintió',
        'Venta duplicada',
        'Venta de prueba',
        'Otro',
    ];

    const handleConfirmVoid = async () => {
        if (!voidTarget) return;
        if (!navigator.onLine) {
            showToast('Necesitas conexión a internet para anular', 'warning');
            return;
        }
        const reason = voidReasonOption === 'Otro' ? voidReasonCustom.trim() : voidReasonOption;
        if (!reason) {
            showToast('Debes indicar un motivo de anulación', 'warning');
            return;
        }

        setIsVoiding(true);
        try {
            if (voidTarget.type === 'sale') {
                await voidOrder(voidTarget.id, reason);
                window.dispatchEvent(new CustomEvent('sale-deleted'));
                showToast('Venta anulada correctamente', 'success');
                setSelectedSaleId(null);
            } else {
                const result = await voidOrderItem(voidTarget.itemId, reason);
                window.dispatchEvent(new CustomEvent('sale-deleted'));
                showToast('Ítem anulado correctamente', 'success');
                if (result?.order_voided) {
                    setSelectedSaleId(null);
                }
            }
            await reload();
            reloadTotals();
            setVoidTarget(null);
        } catch (error: any) {
            console.error('Error al anular:', error);
            showToast(error.message || 'Error al anular', 'error');
        } finally {
            setIsVoiding(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'decimal',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    };

    const getRoundedTotal = (amount: number) => {
        return Math.round(Math.max(0, amount) / 50) * 50;
    };

    // La BD puede contener el total matemático exacto (sin redondear a 50) debido
    // a los triggers de PostgreSQL. Aplicamos getRoundedTotal para asegurar que todas
    // las órdenes reflejen el valor efectivamente cobrado a múltiplos de $50.
    const getSaleNetTotal = (sale: Order): number => {
        const raw = sale.total != null
            ? Number(sale.total)
            : Math.max(0, (Number(sale.subtotal) || 0) - (Number(sale.discount) || 0));
        return getRoundedTotal(raw);
    };

    const getSaleTotalDiscount = (sale: Order): number => {
        return sale.discount || 0;
    };

    // Fechas optimizadas: calculamos now y yesterday una sola vez fuera para reusarlo
    const nowStatic = useMemo(() => new Date(), []);
    const yesterdayStatic = useMemo(() => yesterdayInTz(timezone), [timezone]);

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);

        if (isSameDayInTz(date, nowStatic, timezone)) {
            return formatTimeInTz(dateString, timezone);
        } else if (isSameDayInTz(date, yesterdayStatic, timezone)) {
            return 'Ayer ' + formatTimeInTz(dateString, timezone);
        } else {
            return formatDateInTz(dateString, timezone);
        }
    };

    // Etiqueta del método de pago para la lista. En pagos divididos une los
    // métodos reales (ej. "Efectivo + Transferencia") en vez de mostrar "Otro".
    const getPaymentLabel = (sale: Order): string => {
        if (sale.split_payments && sale.split_payments.length > 0) {
            return sale.split_payments
                .map(sp => paymentMethodDisplayMap[sp.method] || sp.method)
                .join(' + ');
        }
        return paymentMethodDisplayMap[sale.payment_method] || sale.payment_method;
    };

    const getOrderTypeInfo = (order: Order) => {
        if (order.order_type === 'delivery') {
            return { icon: 'delivery_dining', label: 'Domicilio', color: 'text-blue-500 bg-blue-50' };
        } else if (order.order_type === 'takeaway') {
            return { icon: 'shopping_bag', label: 'Llevar', color: 'text-rose-500 bg-rose-50' };
        } else if (order.order_type === 'dine_in') {
            return { icon: 'table_restaurant', label: 'Mesa', color: 'text-purple-500 bg-purple-50' };
        }
        return { icon: 'flash_on', label: 'Orden Rápida', color: 'text-amber-500 bg-amber-50' };
    };

    const buildReceiptData = (sale: Order): ReceiptData => {
        // `orders.discount` ya incluye el descuento por línea, y `orders.total`
        // ya es el neto. Confiamos en la BD para no duplicar el descuento.
        const totalDiscount = sale.discount || 0;
        const unroundedTotal = Math.max(0, sale.subtotal - totalDiscount);
        const roundedTotal = getRoundedTotal(unroundedTotal);
        const adjustment = roundedTotal - unroundedTotal;
        return ({
        businessName: receiptBusinessName || businessName || 'Mi Negocio',
        businessPhone: receiptPhone || businessPhone || undefined,
        businessAddress: receiptAddress || businessAddress || undefined,
        businessNit: businessNit || undefined,
        items: (sale.items || []).map((item: any) => ({
            name: item.product_name,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            unit: item.sale_unit || 'Unidad',
            total: item.total_price,
            discount: item.discount || undefined,
            discountPercent: item.discount_percent || undefined,
        })),
        subtotal: sale.subtotal,
        totalDiscount,
        roundingAdjustment: adjustment !== 0 ? adjustment : undefined,
        total: roundedTotal,
        paymentMethod: sale.payment_method,
        amountPaid: sale.amount_paid,
        change: sale.change_amount,
        splitPayments: sale.split_payments,
        customerName: sale.customer_name || 'Consumidor Final',
        sellerName: sale.waiter_name || undefined,
        customerDocument: sale.client?.id_number || sale.client_id_number,
        customerPhone: sale.client?.phone || undefined,
        date: formatDateTimeInTz(sale.created_at, timezone),
        orderNumber: sale.order_number,
        orderId: sale.id,
        displayNumber: sale.display_number || undefined,
        creditAbono: sale.initial_abono,
        creditAbonoMethod: sale.initial_abono_method
    });
    };

    const handleWhatsAppShare = () => {
        if (!selectedSale) return;
        const data = buildReceiptData(selectedSale);
        if (!data.orderNumber || !data.orderId) {
            showToast('No se pudo generar el enlace del recibo', 'warning');
            return;
        }

        let phoneParam = '';
        if (data.customerPhone) {
            const rawPhone = data.customerPhone.replace(/\D/g, '');
            const phone = rawPhone.startsWith('57') ? rawPhone : `57${rawPhone}`;
            phoneParam = `phone=${phone}&`;
        }

        const hash = data.orderId.substring(0, 6).toLowerCase();
        const receiptUrl = `${window.location.origin}/t/${data.orderNumber}-${hash}`;

        const cleanCustomerName = data.customerName === 'Consumidor Final' ? 'cliente' : (data.customerName || 'cliente');
        let message = `Hola ${cleanCustomerName}, gracias por tu compra en *${data.businessName}*. 🧾\n\n`;
        message += `Puedes ver y descargar tu factura aquí:\n${receiptUrl}`;

        const encodedMsg = encodeURIComponent(message);
        const nativeUrl = `whatsapp://send?${phoneParam}text=${encodedMsg}`;
        const webUrl = `https://web.whatsapp.com/send?${phoneParam}text=${encodedMsg}`;

        let appOpened = false;
        const handleBlur = () => { appOpened = true; };
        window.addEventListener('blur', handleBlur);

        window.location.href = nativeUrl;

        setTimeout(() => {
            window.removeEventListener('blur', handleBlur);
            if (!appOpened) {
                const width = 800;
                const height = 600;
                const left = (window.innerWidth - width) / 2;
                const top = (window.innerHeight - height) / 2;
                window.open(webUrl, 'WhatsApp', `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`);
            }
        }, 1500);
    };

    const handleEmailClick = () => {
        if (!selectedSale) return;
        setEmailReceiptData(buildReceiptData(selectedSale));
        setShowEmailModal(true);
    };

    const handleSendEmail = async (email: string): Promise<boolean> => {
        if (!emailReceiptData) return false;
        if (!navigator.onLine) {
            showToast('Necesitas conexión a internet para enviar el recibo por correo', 'warning');
            return false;
        }
        return await sendReceiptByEmailDirect(emailReceiptData, email);
    };

    const handlePrintThermal = async () => {
        if (!selectedSale || isPrinting) return;
        // Sin impresora conectada: abrir el panel para elegir y conectar (igual que en Ajustes)
        if (!printerConnected) {
            setShowPrinterPanel(true);
            return;
        }
        setIsPrinting(true);
        try {
            await printThermalReceipt(buildReceiptData(selectedSale), receiptPaperWidth);
        } catch (error) {
            console.error('Error printing thermal receipt:', error);
            showToast('Error al imprimir ticket', 'error');
        } finally {
            setIsPrinting(false);
        }
    };

    const handleShareThermal = async () => {
        if (!selectedSale || isSharing) return;
        setIsSharing(true);
        try {
            await shareThermalReceiptPDF(buildReceiptData(selectedSale), receiptPaperWidth);
        } catch (error) {
            console.error('Error sharing thermal receipt:', error);
            showToast('Error al compartir ticket', 'error');
        } finally {
            setIsSharing(false);
        }
    };

    const handleDownloadPDF = async () => {
        if (!selectedSale || isDownloading) return;
        setIsDownloading(true);
        try {
            await downloadReceiptAsPDF(buildReceiptData(selectedSale));
            showToast('PDF descargado', 'success');
        } catch (error) {
            console.error('Error downloading PDF:', error);
            showToast('Error al descargar PDF', 'error');
        } finally {
            setIsDownloading(false);
        }
    };

    const handlePrintCommand = async () => {
        if (!selectedSale || isPrintingCommand) return;
        // Sin impresora conectada: abrir el panel para elegir y conectar (igual que en Ajustes)
        if (!printerConnected) {
            setShowPrinterPanel(true);
            return;
        }
        setIsPrintingCommand(true);
        try {
            const commandData = {
                orderNumber: selectedSale.order_number,
                displayNumber: selectedSale.display_number || undefined,
                customerName: selectedSale.customer_name || undefined,
                items: (selectedSale.items || []).map((item: any) => ({
                    name: item.product_name,
                    quantity: item.quantity,
                    unit: item.sale_unit || 'Unidad',
                    notes: item.notes,
                    cookingTerm: item.cooking_term,
                    removedIngredients: item.removed_ingredients,
                })),
                date: formatDateTimeInTz(selectedSale.created_at, timezone),
                sellerName: selectedSale.waiter_name || undefined,
            };
            const success = await printKitchenCommandDirect(commandData, receiptPaperWidth);
            if (success) {
                showToast('Comanda impresa', 'success');
            } else {
                showToast('No se pudo imprimir la comanda', 'error');
            }
        } catch (error) {
            console.error('Error printing kitchen command:', error);
            showToast('No se pudo imprimir la comanda', 'error');
        } finally {
            setIsPrintingCommand(false);
        }
    };

    if (!firstLoadDone && loading) return <ScreenLoader />;

    return (
        <>
            <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0B1120] text-slate-800 dark:text-slate-200 font-display selection:bg-indigo-500/30 animate-fadeIn">
                {/* Top Navigation Bar - Adaptive */}
                <header className="bg-white dark:bg-[#151e32] border-b border-slate-200 dark:border-slate-800 shrink-0 z-20 relative shadow-sm">
                    <div className="h-14 px-3 sm:px-4 flex items-center gap-2 sm:gap-3">
                    {/* Search Input — visible solo desde 430px+ (en el header) */}
                    <div className="relative flex-1 min-w-0 max-w-xs sm:max-w-sm lg:max-w-md hidden min-[430px]:block">
                        <input
                            type="text"
                            placeholder="Buscar cliente, orden..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-8 sm:pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 text-xs sm:text-sm font-medium transition-all outline-none placeholder:text-slate-400"
                        />
                        <div className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 text-slate-400">
                            <span className="material-symbols-outlined text-[16px] sm:text-[18px]">search</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 relative shrink-0">
                        {/* Waiter Selector — solo admin */}
                        {canSeeAllSales && (
                            <div className="relative">
                                <button
                                    onClick={() => { setIsWaiterOpen(!isWaiterOpen); setIsPeriodOpen(false); setIsCustomOpen(false); }}
                                    className={`inline-flex items-center px-3 py-1.5 border shadow-sm text-xs lg:text-sm font-semibold rounded-lg transition-colors ${selectedWaiterId ? 'border-indigo-400 dark:border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 bg-white dark:bg-[#151e32] hover:bg-slate-50 dark:hover:bg-[#1A1A1A]'}`}
                                    aria-label="Filtrar por vendedor"
                                >
                                    <span className="material-symbols-outlined text-[16px] mr-1.5 text-slate-500">person</span>
                                    <span className="truncate max-w-[120px] sm:max-w-[160px]">
                                        {selectedWaiterId
                                            ? (employees.find(e => e.id === selectedWaiterId)?.full_name || 'Vendedor')
                                            : 'Elegir empleado'}
                                    </span>
                                    <span className="material-symbols-outlined text-[14px] ml-1.5 text-slate-400">expand_more</span>
                                </button>
                                {isWaiterOpen && (
                                    <>
                                        <div className="fixed inset-0 z-30" onClick={() => setIsWaiterOpen(false)} />
                                        <div className="absolute left-0 min-[430px]:left-auto min-[430px]:right-0 mt-2 w-56 max-h-80 overflow-y-auto bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-40 py-1 animate-[fadeIn_0.1s_ease-out]">
                                            <button
                                                onClick={() => { setSelectedWaiterId(null); setIsWaiterOpen(false); }}
                                                className={`w-full text-left px-4 py-2 text-xs transition-colors ${selectedWaiterId === null ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 font-medium'}`}
                                            >
                                                Sin filtro
                                            </button>
                                            {employees.length === 0 && (
                                                <div className="px-4 py-2 text-[11px] text-slate-400">Sin empleados</div>
                                            )}
                                            {employees.map((emp) => (
                                                <button
                                                    key={emp.id}
                                                    onClick={() => { setSelectedWaiterId(emp.id); setIsWaiterOpen(false); }}
                                                    className={`w-full text-left px-4 py-2 text-xs transition-colors flex items-center justify-between gap-2 ${selectedWaiterId === emp.id ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 font-medium'}`}
                                                >
                                                    <span className="truncate">{emp.full_name}</span>
                                                    {!emp.is_active && (
                                                        <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold shrink-0">inactivo</span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Period Selector */}
                        <div className="relative">
                            <button
                                onClick={() => setIsPeriodOpen(!isPeriodOpen)}
                                className="inline-flex items-center px-3 py-1.5 border border-slate-200 dark:border-slate-700 shadow-sm text-xs lg:text-sm font-semibold rounded-lg text-slate-700 dark:text-slate-200 bg-white dark:bg-[#151e32] hover:bg-slate-50 dark:hover:bg-[#1A1A1A] transition-colors"
                            >
                                <span className="material-symbols-outlined text-[16px] mr-1.5 text-slate-500">calendar_month</span>
                                {period === 'custom' ? formatDateRange(appliedStart, appliedEnd) : PERIOD_LABELS[period]}
                                <span className="material-symbols-outlined text-[14px] ml-1.5 text-slate-400">expand_more</span>
                            </button>
                            {isPeriodOpen && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setIsPeriodOpen(false)} />
                                    <div className="absolute left-0 min-[430px]:left-auto min-[430px]:right-0 mt-2 w-48 bg-white dark:bg-[#1A1A1A] border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl z-40 py-1 animate-[fadeIn_0.1s_ease-out]">
                                        {(Object.keys(PERIOD_LABELS) as PeriodOption[]).filter(k => k !== 'custom').map((key) => (
                                            <button
                                                key={key}
                                                onClick={() => { setPeriod(key); setIsPeriodOpen(false); }}
                                                className={`w-full text-left px-4 py-2 text-xs transition-colors ${period === key ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 font-medium'}`}
                                            >
                                                {PERIOD_LABELS[key]}
                                            </button>
                                        ))}
                                        <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                                        <button
                                            onClick={() => { setIsPeriodOpen(false); setIsCustomOpen(true); }}
                                            className={`w-full text-left px-4 py-2 text-xs transition-colors ${period === 'custom' ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 font-medium'}`}
                                        >
                                            Personalizado
                                        </button>
                                    </div>
                                </>
                            )}
                            {isCustomOpen && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setIsCustomOpen(false)} />
                                    <div className="absolute left-0 min-[430px]:left-auto min-[430px]:right-0 mt-2 z-40 transform origin-top-left min-[430px]:origin-top-right">
                                        <CustomDateRangePicker
                                            initialStart={appliedStart}
                                            initialEnd={appliedEnd}
                                            onApply={(start, end) => {
                                                setAppliedStart(start);
                                                setAppliedEnd(end);
                                                setDraftStart(start);
                                                setDraftEnd(end);
                                                setPeriod('custom');
                                                setIsCustomOpen(false);
                                            }}
                                            onCancel={() => setIsCustomOpen(false)}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Botón generar reporte de empleado.
                            Visible solo si admin + cajero seleccionado + período definido (no 'all'). */}
                        {canSeeAllSales && selectedWaiterId && period !== 'all' && (
                            <button
                                onClick={handleExportReport}
                                disabled={isExportingReport}
                                aria-label="Generar reporte del empleado"
                                tabIndex={0}
                                className={`inline-flex items-center px-3 py-1.5 border border-emerald-300 dark:border-emerald-700 shadow-sm text-xs font-semibold rounded-lg text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors ${isExportingReport ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                                <span className={`material-symbols-outlined text-[16px] mr-1.5 ${isExportingReport ? 'animate-spin' : ''}`}>
                                    {isExportingReport ? 'sync' : 'description'}
                                </span>
                                <span className="hidden sm:inline">{isExportingReport ? 'Generando...' : 'Reporte'}</span>
                            </button>
                        )}
                    </div>
                    </div>

                    {/* Header fila 2: Totales por método de pago — tablet y desktop */}
                    {dateStartIso && dateEndIso && (
                        <div className="hidden sm:grid grid-cols-7 border-t border-slate-100 dark:border-slate-800/50 bg-slate-50/40 dark:bg-transparent">
                            {[
                                { label: 'Efectivo', value: totals.cash },
                                { label: 'Tarjeta', value: totals.card },
                                { label: 'En línea', value: totals.online },
                                { label: 'Crédito', value: totals.credit },
                                { label: 'Otros', value: totals.other },
                                { label: 'Devoluciones', value: totals.refunds },
                                { label: 'Total ventas', value: totals.total, highlight: true },
                            ].map((item) => (
                                <div key={item.label} className={`flex flex-col items-center justify-center py-2 px-1 ${item.highlight ? 'bg-slate-100/60 dark:bg-slate-800/40' : ''}`}>
                                    <span className="text-[10px] md:text-[11px] font-medium text-slate-500 dark:text-slate-400 text-center leading-tight">{item.label}</span>
                                    <span className="text-[13px] md:text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-200 mt-0.5">{formatCurrency(item.value)}</span>
                                </div>
                            ))}
                        </div>
                    )}

                </header>

                <div className="flex flex-1 overflow-hidden">
                    {/* Left Panel: Sales List - Adaptive Width */}
                    <div className={`
                    w-full md:w-[280px] lg:w-[340px] xl:w-[400px] bg-white dark:bg-[#151e32] flex flex-col border-r border-slate-200 dark:border-slate-800 z-10 transition-all duration-300
                    ${selectedSaleId ? 'hidden md:flex' : 'flex'}
                `}>
                        {/* Metrics & Search Header — solo <640px (en ≥640px totales y buscador viven en el header superior) */}
                        <div className="sm:hidden px-3 pt-3 pb-2 border-b border-slate-100 dark:border-white/5 space-y-3 bg-slate-50/50 dark:bg-transparent">
                            {/* Barra de totales por método de pago — solo móvil pequeño (en tablet/desktop va en el header) */}
                            {dateStartIso && dateEndIso && (
                                <div className="sm:hidden overflow-x-auto -mx-3 sm:-mx-4 px-3 sm:px-4 scrollbar-hide">
                                    <div className="flex items-stretch gap-2 min-w-max pb-1">
                                        {[
                                            { label: 'Efectivo', value: totals.cash },
                                            { label: 'Tarjeta', value: totals.card },
                                            { label: 'En línea', value: totals.online },
                                            { label: 'Crédito', value: totals.credit },
                                            { label: 'Otros', value: totals.other },
                                            { label: 'Devol.', value: totals.refunds },
                                            { label: 'Total', value: totals.total },
                                        ].map((item) => (
                                            <div
                                                key={item.label}
                                                className={`flex flex-col items-center justify-center px-3 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-[#0B1120] min-w-[72px] ${item.label === 'Total' ? 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50' : ''}`}
                                            >
                                                <span className="text-[9px] font-medium text-slate-400">{item.label}</span>
                                                <span className="text-xs font-semibold tabular-nums leading-tight text-slate-800 dark:text-slate-200 mt-0.5">
                                                    {formatCurrency(item.value)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    {totalsLoading && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-black/30 rounded-xl">
                                            <span className="material-symbols-outlined animate-spin text-slate-400 text-sm">sync</span>
                                        </div>
                                    )}
                                </div>
                            )}
                            {/* Search Input — solo visible en <430px (en pantallas mayores va en el header) */}
                            <div className="relative group min-[430px]:hidden">
                                <input
                                    type="text"
                                    placeholder="Buscar cliente, orden..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/10 text-sm font-medium transition-all outline-none placeholder:text-slate-400"
                                />
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                    <span className="material-symbols-outlined text-[18px]">search</span>
                                </div>
                            </div>
                        </div>

                        {/* Scrollable List */}
                        <div
                            className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2 bg-slate-50 dark:bg-black/20"
                            onScroll={handleScroll}
                        >
                            {orders.length === 0 && !loading ? (
                                <div className="flex flex-col items-center justify-center h-64 text-center p-4">
                                    <div className="size-10 bg-white dark:bg-white/5 rounded-full flex items-center justify-center mb-3 text-slate-300">
                                        <span className="material-symbols-outlined text-xl">receipt_long</span>
                                    </div>
                                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Sin Ordenes</h3>
                                </div>
                            ) : (
                                <>
                                {loading && (
                                    <div className="flex items-center justify-center py-6">
                                        <span className="material-symbols-outlined animate-spin text-slate-400 text-base">sync</span>
                                    </div>
                                )}
                                {!loading && orders.map((sale) => {
                                    const active = selectedSaleId === sale.id;
                                    const type = getOrderTypeInfo(sale);
                                    const isVoided = sale.status === 'voided';
                                    const voidedItemsCount = (sale.items || []).filter((i: any) => i.status === 'canceled').length;
                                    const hasRefunds = (sale.refunds?.length || 0) > 0;
                                    return (
                                        <button
                                            key={sale.id}
                                            onClick={() => setSelectedSaleId(sale.id)}
                                            className={`
                                            w-full text-left p-2.5 md:p-2 lg:p-3 rounded-xl border transition-all duration-200 group relative
                                            ${active
                                                    ? 'bg-white dark:bg-[#1A1A1A] border-indigo-500/50 shadow-md ring-1 ring-indigo-500/10'
                                                    : 'bg-white dark:bg-[#151515] border-transparent hover:border-slate-200 dark:hover:border-white/10 hover:shadow-sm'
                                                }
                                        `}
                                        >
                                            <div className="flex justify-between items-start mb-1.5">
                                                <div className="flex flex-col gap-0.5 overflow-hidden">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={`text-[10px] font-black tracking-wider uppercase ${active ? 'text-indigo-600' : 'text-slate-500'}`}>
                                                            #{sale.display_number || sale.order_number}
                                                        </span>
                                                        {isVoided && (
                                                            <span className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300 leading-none">
                                                                Anulada
                                                            </span>
                                                        )}
                                                        <span className="text-[10px] font-medium text-slate-400 md:basis-full md:mt-0.5 lg:basis-auto lg:mt-0">
                                                            {formatDate(sale.created_at)}
                                                        </span>
                                                    </div>
                                                    <h3 className={`font-semibold text-[13px] md:text-xs lg:text-sm truncate pr-2 ${isVoided ? 'line-through text-slate-400 dark:text-slate-500' : active ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                                                        {(sale.customer_name && sale.customer_name !== 'Consumidor Final') ? sale.customer_name : 'Consumidor Final'}
                                                    </h3>
                                                </div>
                                                <span className={`font-black text-sm md:text-[13px] lg:text-base whitespace-nowrap ${isVoided ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                                                    ${formatCurrency(getSaleNetTotal(sale))}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1.5 mt-1">
                                                <span className={`
                                                text-[10px] sm:text-[11px] font-bold capitalize px-2 py-0.5 rounded-md leading-none tracking-wide
                                                ${(() => {
                                                        const m = sale.payment_method.toLowerCase();
                                                        if (m.includes('cash') || m.includes('efectivo')) return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300';
                                                        if (m.includes('card') || m.includes('tarjeta') || m.includes('credit') || m.includes('debit')) return 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300';
                                                        if (m.includes('transfer') || m.includes('nequi') || m.includes('daviplata')) return 'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300';
                                                        return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
                                                    })()}
                                            `}>
                                                    {getPaymentLabel(sale)}
                                                </span>
                                            </div>

                                            {isVoided && sale.void_reason && (
                                                <p className="text-[10px] text-red-500 mt-1 truncate">
                                                    Motivo: {sale.void_reason}
                                                </p>
                                            )}
                                            {!isVoided && voidedItemsCount > 0 && (
                                                <p className="text-[10px] font-semibold text-red-500 mt-1 flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[12px]">block</span>
                                                    {voidedItemsCount} producto{voidedItemsCount > 1 ? 's' : ''} anulado{voidedItemsCount > 1 ? 's' : ''}
                                                </p>
                                            )}
                                            {hasRefunds && (
                                                <p className="text-[10px] font-semibold text-orange-600 mt-1 flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[12px]">undo</span>
                                                    Con devolución
                                                </p>
                                            )}
                                        </button>
                                    );
                                })}
                                {!loading && loadingMore && (
                                    <div className="flex items-center justify-center py-3 gap-2">
                                        <span className="material-symbols-outlined animate-spin text-slate-400 text-base">sync</span>
                                        <span className="text-[11px] text-slate-500">Cargando más ventas...</span>
                                    </div>
                                )}
                                {!loading && !hasMore && orders.length > 0 && (
                                    <div className="text-center text-[11px] text-slate-400 py-3">
                                        No hay más ventas
                                    </div>
                                )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Right Panel: Receipt Detail - Mobile Focus */}
                    <div className={`
                    flex-1 bg-slate-100/50 dark:bg-[#0B1120] flex flex-col relative z-0
                    ${selectedSaleId ? 'fixed inset-0 z-50 md:static' : 'hidden md:flex'}
                `}>
                        {selectedSale ? (
                            <div className="flex flex-col h-full md:p-4 bg-white dark:bg-[#0B1120] md:bg-transparent w-full max-w-[100vw] overflow-x-hidden">
                                <div className="flex-1 w-full max-w-full bg-white dark:bg-[#151e32] md:rounded-2xl md:shadow-xl md:border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-fadeIn">

                                    {/* Header: Title & Actions */}
                                    <div className="border-b border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-[#151e32]">
                                        {/* Desktop: una sola fila — info izquierda, acciones derecha */}
                                        <div className="hidden md:flex items-center justify-between gap-4 px-6 py-3">
                                            <div className="flex flex-col min-w-0">
                                                <h2 className="text-base font-black text-slate-900 dark:text-white tracking-tight leading-snug truncate">
                                                    Cliente: <span className="text-slate-700 dark:text-slate-300 font-bold">{selectedSale.customer_name || 'Consumidor Final'}</span>
                                                </h2>
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-bold mt-1">
                                                    <span className="bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 shrink-0">
                                                        #{selectedSale.display_number || selectedSale.order_number}
                                                    </span>
                                                    {selectedSale.status === 'voided' && (
                                                        <span className="bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300 px-1.5 py-0.5 rounded shrink-0 uppercase tracking-wide">
                                                            Anulada
                                                        </span>
                                                    )}
                                                    <div className={`size-1.5 rounded-full shrink-0 ${selectedSale.status === 'completed' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                                    <span className="text-slate-400 font-medium shrink-0">
                                                        {formatDateInTz(selectedSale.created_at, timezone, { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                    </span>
                                                </div>
                                                {selectedSale.waiter_name && (
                                                    <span className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1 mt-1">
                                                        <span className="material-symbols-outlined text-[14px]">person</span>
                                                        {selectedSale.waiter_name}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <button
                                                    onClick={handlePrintThermal}
                                                    disabled={isPrinting}
                                                    aria-label="Imprimir ticket"
                                                    tabIndex={0}
                                                    className={`flex relative size-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-500 hover:text-blue-600 transition-colors ${isPrinting ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                >
                                                    <span className={`material-symbols-outlined text-xl ${isPrinting ? 'animate-spin' : ''}`}>
                                                        {isPrinting ? 'sync' : 'print'}
                                                    </span>
                                                    {printerConnected && !isPrinting && (
                                                        <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-green-500 border border-white dark:border-[#151e32]"></span>
                                                    )}
                                                </button>
                                                {isCatalogMode && (
                                                    <button
                                                        onClick={handlePrintCommand}
                                                        disabled={isPrintingCommand}
                                                        aria-label="Imprimir comanda"
                                                        tabIndex={0}
                                                        className={`flex relative size-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-500 hover:text-orange-500 transition-colors ${isPrintingCommand ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                    >
                                                        <span className={`material-symbols-outlined text-xl ${isPrintingCommand ? 'animate-spin' : ''}`}>
                                                            {isPrintingCommand ? 'sync' : 'restaurant'}
                                                        </span>
                                                        {printerConnected && !isPrintingCommand && (
                                                            <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-green-500 border border-white dark:border-[#151e32]"></span>
                                                        )}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={handleWhatsAppShare}
                                                    className="flex size-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-500 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                                                    aria-label="Compartir por WhatsApp"
                                                    tabIndex={0}
                                                >
                                                    <svg className="size-5 transition-colors" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                                                </button>
                                                <button
                                                    onClick={handleEmailClick}
                                                    className="size-9 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-500 hover:text-indigo-600 transition-colors"
                                                    aria-label="Enviar por correo"
                                                    tabIndex={0}
                                                >
                                                    <span className="material-symbols-outlined text-xl">email</span>
                                                </button>
                                                <button
                                                    onClick={handleShareThermal}
                                                    disabled={isSharing}
                                                    aria-label="Compartir ticket"
                                                    tabIndex={0}
                                                    className={`flex size-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-500 hover:text-green-600 transition-colors ${isSharing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                >
                                                    <span className={`material-symbols-outlined text-xl ${isSharing ? 'animate-spin' : ''}`}>
                                                        {isSharing ? 'sync' : 'share'}
                                                    </span>
                                                </button>
                                                <button
                                                    onClick={handleDownloadPDF}
                                                    disabled={isDownloading}
                                                    aria-label="Descargar PDF"
                                                    tabIndex={0}
                                                    className={`flex size-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-500 hover:text-purple-600 transition-colors ${isDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                >
                                                    <span className={`material-symbols-outlined text-xl ${isDownloading ? 'animate-spin' : ''}`}>
                                                        {isDownloading ? 'sync' : 'file_download'}
                                                    </span>
                                                </button>
                                                {canVoid && selectedSale.status !== 'voided' && !selectedSaleIsClosed && (
                                                    <button
                                                        onClick={handleVoidSale}
                                                        aria-label="Anular venta"
                                                        className="size-9 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-red-500 hover:bg-red-50 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-xl">block</span>
                                                    </button>
                                                )}
                                                {canRefund && selectedSale.status !== 'voided' && selectedSaleIsClosed && (
                                                    <button
                                                        onClick={() => setShowRefundModal(true)}
                                                        aria-label="Devolución de venta"
                                                        className="size-9 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-xl">undo</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Móvil/Tablet: layout original (dos filas) */}
                                        <div className="md:hidden">
                                            {/* Row 1: Back + Client Info */}
                                            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 pt-3 pb-2">
                                                <button
                                                    onClick={() => setSelectedSaleId(null)}
                                                    className="size-8 flex-shrink-0 flex items-center justify-center rounded-full bg-slate-100 dark:bg-white/10 text-slate-600"
                                                >
                                                    <span className="material-symbols-outlined text-lg">arrow_back</span>
                                                </button>
                                                <div className="flex flex-col flex-1 min-w-0">
                                                    <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white tracking-tight leading-snug truncate">
                                                        <span className="hidden sm:inline">Cliente: </span><span className="text-slate-700 dark:text-slate-300 font-bold">{selectedSale.customer_name || 'Consumidor Final'}</span>
                                                    </h2>
                                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[10px] sm:text-xs font-bold mt-1">
                                                        <span className="bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300 shrink-0">
                                                            #{selectedSale.display_number || selectedSale.order_number}
                                                        </span>
                                                        {selectedSale.status === 'voided' && (
                                                            <span className="bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300 px-1.5 py-0.5 rounded shrink-0 uppercase tracking-wide">
                                                                Anulada
                                                            </span>
                                                        )}
                                                        <div className={`size-1.5 rounded-full shrink-0 ${selectedSale.status === 'completed' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                                        <span className="text-slate-400 font-medium shrink-0">
                                                            {formatDateInTz(selectedSale.created_at, timezone, { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                        </span>
                                                        {selectedSale.waiter_name && (
                                                            <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1 whitespace-nowrap">
                                                                <span className="material-symbols-outlined text-[14px]">person</span>
                                                                <span className="truncate max-w-[120px] sm:max-w-none">{selectedSale.waiter_name}</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Row 2: Action Buttons - Centered */}
                                            <div className="flex items-center justify-center gap-2 px-3 sm:px-4 md:px-6 pb-3">
                                                <button
                                                    onClick={handlePrintThermal}
                                                    disabled={isPrinting}
                                                    aria-label="Imprimir ticket"
                                                    tabIndex={0}
                                                    className={`flex relative size-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-500 hover:text-blue-600 transition-colors ${isPrinting ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                >
                                                    <span className={`material-symbols-outlined text-xl ${isPrinting ? 'animate-spin' : ''}`}>
                                                        {isPrinting ? 'sync' : 'print'}
                                                    </span>
                                                    {printerConnected && !isPrinting && (
                                                        <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-green-500 border border-white dark:border-[#151e32]"></span>
                                                    )}
                                                </button>
                                                {isCatalogMode && (
                                                    <button
                                                        onClick={handlePrintCommand}
                                                        disabled={isPrintingCommand}
                                                        aria-label="Imprimir comanda"
                                                        tabIndex={0}
                                                        className={`flex relative size-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-500 hover:text-orange-500 transition-colors ${isPrintingCommand ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                    >
                                                        <span className={`material-symbols-outlined text-xl ${isPrintingCommand ? 'animate-spin' : ''}`}>
                                                            {isPrintingCommand ? 'sync' : 'restaurant'}
                                                        </span>
                                                        {printerConnected && !isPrintingCommand && (
                                                            <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-green-500 border border-white dark:border-[#151e32]"></span>
                                                        )}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={handleWhatsAppShare}
                                                    className="flex size-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-500 hover:text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                                                    aria-label="Compartir por WhatsApp"
                                                    tabIndex={0}
                                                >
                                                    <svg className="size-5 transition-colors" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                                                </button>
                                                <button
                                                    onClick={handleEmailClick}
                                                    className="size-9 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-500 hover:text-indigo-600 transition-colors"
                                                    aria-label="Enviar por correo"
                                                    tabIndex={0}
                                                >
                                                    <span className="material-symbols-outlined text-xl">email</span>
                                                </button>
                                                <button
                                                    onClick={handleShareThermal}
                                                    disabled={isSharing}
                                                    aria-label="Compartir ticket"
                                                    tabIndex={0}
                                                    className={`flex size-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-500 hover:text-green-600 transition-colors ${isSharing ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                >
                                                    <span className={`material-symbols-outlined text-xl ${isSharing ? 'animate-spin' : ''}`}>
                                                        {isSharing ? 'sync' : 'share'}
                                                    </span>
                                                </button>
                                                <button
                                                    onClick={handleDownloadPDF}
                                                    disabled={isDownloading}
                                                    aria-label="Descargar PDF"
                                                    tabIndex={0}
                                                    className={`flex size-9 items-center justify-center rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-slate-500 hover:text-purple-600 transition-colors ${isDownloading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                >
                                                    <span className={`material-symbols-outlined text-xl ${isDownloading ? 'animate-spin' : ''}`}>
                                                        {isDownloading ? 'sync' : 'file_download'}
                                                    </span>
                                                </button>
                                                {canVoid && selectedSale.status !== 'voided' && !selectedSaleIsClosed && (
                                                    <button
                                                        onClick={handleVoidSale}
                                                        aria-label="Anular venta"
                                                        className="size-9 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-red-500 hover:bg-red-50 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-xl">block</span>
                                                    </button>
                                                )}
                                                {canRefund && selectedSale.status !== 'voided' && selectedSaleIsClosed && (
                                                    <button
                                                        onClick={() => setShowRefundModal(true)}
                                                        aria-label="Devolución de venta"
                                                        className="size-9 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200 dark:bg-slate-800 dark:border-slate-700 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-xl">undo</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Banner de motivo si está anulada */}
                                        {selectedSale.status === 'voided' && selectedSale.void_reason && (
                                            <div className="mx-3 sm:mx-4 md:mx-6 my-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/15 border border-red-100 dark:border-red-900/30">
                                                <p className="text-[11px] sm:text-xs text-red-600 dark:text-red-300">
                                                    <span className="font-bold">Motivo de anulación:</span> {selectedSale.void_reason}
                                                </p>
                                            </div>
                                        )}

                                        {/* Devoluciones de esta venta */}
                                        {(selectedSale.refunds?.length || 0) > 0 && (
                                            <div className="mx-3 sm:mx-4 md:mx-6 my-2 px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-900/15 border border-orange-100 dark:border-orange-900/30">
                                                <p className="text-[11px] sm:text-xs font-bold text-orange-700 dark:text-orange-300 flex items-center gap-1 mb-1">
                                                    <span className="material-symbols-outlined text-[14px]">undo</span>
                                                    Devoluciones de esta venta
                                                </p>
                                                <div className="space-y-1.5">
                                                    {(selectedSale.refunds || []).map((r) => (
                                                        <div key={r.id} className="text-[11px] text-orange-700 dark:text-orange-300">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="font-medium">
                                                                    {formatDateInTz(r.created_at, timezone, { day: '2-digit', month: '2-digit', year: 'numeric' })} · {r.reason}
                                                                </span>
                                                                <span className="font-bold shrink-0">-${formatCurrency(r.total_amount)}</span>
                                                            </div>
                                                            {(r.items || []).length > 0 && (
                                                                <p className="text-[10px] text-orange-600/80 dark:text-orange-400/80 mt-0.5">
                                                                    {(r.items || []).map(it => `${it.product_name} x${formatQty(it.quantity)}`).join(' · ')}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Main Content: Product List */}
                                    <div className="flex-1 w-full overflow-y-auto overflow-x-hidden custom-scrollbar bg-white dark:bg-[#151e32] p-0">
                                        {/* Items Table Header - Optimized for Mobile */}
                                        <div className="sticky top-0 z-10 bg-slate-50/90 dark:bg-[#1A2638] backdrop-blur-sm border-y border-slate-100 dark:border-slate-800 pl-3 pr-4 sm:px-4 md:px-6 py-2.5 flex text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-500 w-full">
                                            <div className="flex-1 px-1 sm:px-2 min-w-0">Producto</div>
                                            <div className="w-10 sm:w-12 text-center shrink-0">Cant.</div>
                                            <div className="w-16 sm:w-20 text-right shrink-0">V.Unid</div>
                                            <div className="w-16 sm:w-20 text-right shrink-0">V.prod</div>
                                            <div className="w-8 shrink-0"></div>
                                        </div>

                                        {/* Items List */}
                                        <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                            {(selectedSale.items || []).map((item) => {
                                                const isItemVoided = (item as any).status === 'canceled';
                                                const saleVoided = selectedSale.status === 'voided';
                                                const canEditItem = canVoid && !saleVoided && !isItemVoided && !selectedSaleIsClosed;
                                                return (
                                                <div key={item.id}>
                                                    <div
                                                        onClick={() => { if (canEditItem) setEditingItem({
                                                            id: item.id,
                                                            productName: item.product_name,
                                                            quantity: item.quantity,
                                                            unitPrice: item.unit_price
                                                        }); }}
                                                        className={`flex items-center pl-3 pr-4 sm:px-4 md:px-6 py-2.5 sm:py-3 transition-colors group w-full ${canEditItem ? 'hover:bg-slate-50 dark:hover:bg-white/5 active:bg-slate-100 dark:active:bg-white/10 cursor-pointer' : ''}`}
                                                    >
                                                        <div className="flex-1 px-1 sm:px-2 min-w-0">
                                                            <p className={`font-medium text-[13px] sm:text-sm leading-snug break-words whitespace-normal ${isItemVoided ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>{item.product_name}{isItemVoided ? ' (anulado)' : ''}</p>
                                                            {isItemVoided && (item as any).void_reason && (
                                                                <p className="text-[10px] text-red-500 mt-0.5 leading-tight no-underline">Motivo: {(item as any).void_reason}</p>
                                                            )}
                                                        </div>
                                                        <div className="w-10 sm:w-12 text-center shrink-0">
                                                            <span className="font-bold text-slate-900 dark:text-white text-[13px] sm:text-sm">{formatQty(item.quantity)}</span>
                                                        </div>
                                                        <div className="w-16 sm:w-20 text-right text-[12px] sm:text-sm font-medium text-slate-500 dark:text-slate-400 overflow-hidden text-ellipsis whitespace-nowrap shrink-0">
                                                            ${formatCurrency(item.unit_price)}
                                                        </div>
                                                        <div className="w-16 sm:w-20 text-right text-[13px] sm:text-sm font-bold text-slate-900 dark:text-slate-200 shrink-0 truncate">
                                                            ${formatCurrency(item.total_price)}
                                                        </div>
                                                        <div className="w-8 flex items-center justify-end shrink-0">
                                                            {canVoid && !saleVoided && !isItemVoided && !selectedSaleIsClosed && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleVoidItem(selectedSale.id, item.id, item.product_name); }}
                                                                    className="text-slate-300 hover:text-red-500 transition-colors p-1"
                                                                    aria-label="Anular ítem"
                                                                >
                                                                    <span className="material-symbols-outlined text-[16px] sm:text-lg">block</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {((item.discount || 0) > 0 || (item.discount_percent || 0) > 0) && (
                                                        <div className="flex items-center pl-3 pr-4 sm:px-4 md:px-6 pb-2 -mt-2 w-full">
                                                            <div className="flex-1 px-1 sm:px-2 min-w-0">
                                                                <span className="text-[10px] sm:text-[11px] font-medium text-red-500 truncate block">
                                                                    Dcto{item.discount_percent ? ` ${item.discount_percent}%` : ''}
                                                                </span>
                                                            </div>
                                                            <div className="w-10 sm:w-12 text-center shrink-0" />
                                                            <div className="w-16 sm:w-20 text-right shrink-0" />
                                                            <div className="w-16 sm:w-20 text-right text-[10px] sm:text-[11px] font-bold text-red-500 shrink-0 truncate">
                                                                -${formatCurrency(item.discount || (item.discount_percent! * item.unit_price * item.quantity / 100))}
                                                            </div>
                                                            <div className="w-8 shrink-0" />
                                                        </div>
                                                    )}
                                                </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Footer Summary - Compact */}
                                    {(() => {
                                        const totalDiscount = getSaleTotalDiscount(selectedSale);
                                        const netTotal = getSaleNetTotal(selectedSale);
                                        const unrounded = Math.max(0, selectedSale.subtotal - totalDiscount);
                                        const adjustment = netTotal - unrounded;
                                        const showBreakdown = totalDiscount > 0 || adjustment !== 0;
                                        return (
                                    <div className="bg-slate-50 w-full dark:bg-[#0B1120]/50 border-t border-slate-200 dark:border-slate-800 p-3 md:p-4 safe-area-bottom">
                                        <div className="flex flex-col gap-1.5">
                                            {showBreakdown && (
                                                <div className="flex justify-between text-sm text-slate-500">
                                                    <span>Subtotal</span>
                                                    <span className="font-medium text-slate-900 dark:text-white">${formatCurrency(selectedSale.subtotal)}</span>
                                                </div>
                                            )}

                                            {totalDiscount > 0 && (
                                                <div className="flex justify-between text-sm text-slate-500">
                                                    <span>Descuento</span>
                                                    <span className="font-medium text-red-500">-${formatCurrency(totalDiscount)}</span>
                                                </div>
                                            )}

                                            {adjustment !== 0 && (
                                                <div className="flex justify-between text-sm text-slate-500">
                                                    <span>Ajuste</span>
                                                    <span className="font-medium text-slate-700 dark:text-slate-300">{adjustment > 0 ? '+' : '-'}${formatCurrency(Math.abs(adjustment))}</span>
                                                </div>
                                            )}

                                            <div className={`flex items-center justify-between ${showBreakdown ? 'border-t border-slate-200 dark:border-slate-700 pt-2' : ''}`}>
                                                <div className="flex flex-col">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Pagado</span>
                                                    {selectedSale.split_payments && selectedSale.split_payments.length > 0 ? (
                                                        <div className="flex flex-col">
                                                            {selectedSale.split_payments.map((sp, i) => (
                                                                <div key={`sp-${i}`} className="flex items-center gap-1.5">
                                                                    <span className="material-symbols-outlined text-emerald-500 text-[13px]">check_circle</span>
                                                                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">{sp.method}: ${formatCurrency(sp.amount)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="material-symbols-outlined text-emerald-500 text-[15px]">check_circle</span>
                                                            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">{paymentMethodDisplayMap[selectedSale.payment_method] || selectedSale.payment_method}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-none">
                                                    ${formatCurrency(netTotal)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                        );
                                    })()}

                                </div>
                            </div>
                        ) : (
                            /* Empty State */
                            <div className="flex flex-col items-center justify-center h-full text-center p-8 opacity-40">
                                <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">receipt_long</span>
                                <p className="text-sm font-medium text-slate-500">Selecciona una venta de la lista</p>
                            </div>
                        )}
                    </div>
                </div>
            </div >

            <EmailReceiptModal
                isOpen={showEmailModal}
                onClose={() => setShowEmailModal(false)}
                onSend={handleSendEmail}
            />

            <PrinterSettingsPanel
                isOpen={showPrinterPanel}
                onClose={() => setShowPrinterPanel(false)}
            />

            <EmployeeReportActionsModal
                isOpen={showReportModal}
                data={reportData}
                onClose={() => setShowReportModal(false)}
                onViewEvents={(employeeId) => {
                    // Vínculo cruzado: abrir el visor de eventos pre-filtrado por este empleado.
                    try {
                        const params = new URLSearchParams();
                        params.set('user', employeeId);
                        params.set('preset', '30days');
                        window.history.replaceState(window.history.state, '', `${window.location.pathname}?${params.toString()}`);
                    } catch { /* no-op */ }
                    setShowReportModal(false);
                    onNavigate(Screen.ACTIVITY);
                }}
            />

            {selectedSale && (
                <RefundSaleModal
                    isOpen={showRefundModal}
                    onClose={() => setShowRefundModal(false)}
                    hasOpenShift={userHasOpenShift}
                    presetOrder={{
                        id: selectedSale.id,
                        order_number: selectedSale.order_number,
                        display_number: selectedSale.display_number ?? null,
                        customer_name: selectedSale.customer_name ?? null,
                        total: getSaleNetTotal(selectedSale),
                        created_at: selectedSale.created_at,
                        payment_method: selectedSale.payment_method,
                    }}
                    onDone={() => { reload(); }}
                />
            )}

            {editingItem && (
                <EditOrderItemModal
                    isOpen={true}
                    item={editingItem}
                    onClose={() => setEditingItem(null)}
                    onConfirm={async (updates) => {
                        await updateOrderItem(editingItem.id, updates);
                        await reload();
                        setEditingItem(null);
                        showToast('Ítem actualizado correctamente', 'success');
                    }}
                />
            )}

            {/* Modal de anulación (soft void) */}
            {voidTarget && (
                <div
                    className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4 animate-fadeIn"
                    onClick={() => !isVoiding && setVoidTarget(null)}
                    role="dialog"
                    aria-label="Anular"
                >
                    <div
                        className="bg-white dark:bg-[#151e32] w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                            <h3 className="text-base font-bold text-slate-900 dark:text-white">
                                {voidTarget.type === 'sale' ? `Anular venta ${voidTarget.label}` : `Anular ítem: ${voidTarget.label}`}
                            </h3>
                            <button
                                onClick={() => !isVoiding && setVoidTarget(null)}
                                aria-label="Cerrar"
                                className="size-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500"
                            >
                                <span className="material-symbols-outlined text-xl">close</span>
                            </button>
                        </div>

                        <div className="px-5 py-4 space-y-3">
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {voidTarget.type === 'sale'
                                    ? 'La venta NO se borra: queda marcada como anulada. Se revierte el stock, los movimientos de caja y las deudas asociadas.'
                                    : 'El ítem NO se borra: queda marcado como anulado y se devuelve su stock. El total de la venta se recalcula.'}
                            </p>

                            <div>
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">Motivo de anulación *</label>
                                <div className="space-y-1.5">
                                    {VOID_REASONS.map(reason => (
                                        <button
                                            key={reason}
                                            onClick={() => setVoidReasonOption(reason)}
                                            className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${voidReasonOption === reason ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-semibold' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'}`}
                                        >
                                            {reason}
                                        </button>
                                    ))}
                                </div>
                                {voidReasonOption === 'Otro' && (
                                    <input
                                        type="text"
                                        autoFocus
                                        value={voidReasonCustom}
                                        onChange={e => setVoidReasonCustom(e.target.value)}
                                        placeholder="Escribe el motivo..."
                                        className="mt-2 w-full px-3 py-2.5 rounded-lg bg-white dark:bg-[#0B1120] border border-slate-200 dark:border-slate-700 focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 text-sm outline-none"
                                    />
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 dark:border-slate-800">
                            <button
                                onClick={() => setVoidTarget(null)}
                                disabled={isVoiding}
                                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmVoid}
                                disabled={isVoiding || !voidReasonOption || (voidReasonOption === 'Otro' && !voidReasonCustom.trim())}
                                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                            >
                                {isVoiding && <span className="material-symbols-outlined text-base animate-spin">sync</span>}
                                {voidTarget.type === 'sale' ? 'Anular venta' : 'Anular ítem'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
