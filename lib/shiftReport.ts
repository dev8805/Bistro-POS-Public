import React from 'react';
import { ShiftReportData, ShiftReportCashOutflow } from '../types';
import type { CashShift } from '../hooks/useCashRegister';
import { reportLineFor, ReportLine } from './paymentMethods';

const isMobileDevice = (): boolean =>
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

const isSecureContext = (): boolean =>
    window.isSecureContext ||
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1';

const num = (v: unknown): number => (typeof v === 'number' && isFinite(v) ? v : 0);

interface BusinessHeader {
    businessName: string;
    businessNit?: string;
    businessAddress?: string;
    businessPhone?: string;
}

// Movimiento necesario para reconstruir el arqueo y el desglose del turno.
export interface ReportMovement {
    type: string;
    payment_method?: string | null;
    amount: number;
    description?: string | null;
    created_at?: string | null;
}

const isCashMethod = (pm?: string | null): boolean => {
    if (!pm) return true;
    const clean = pm.toLowerCase().trim();
    return clean === 'cash' || clean === 'efectivo';
};

/**
 * Parsea la descripción de un movimiento de salida para extraer el destinatario
 * (proveedor, colaborador o concepto principal) y la observación (si existe).
 *
 * Para gastos/abonos de proveedor: muestra únicamente el nombre del proveedor
 * y omite notas y métodos de pago para mantener el reporte limpio.
 */
export const parseOutflowDescription = (rawDesc?: string | null, type?: string): { title: string; note?: string } => {
    if (!rawDesc || !rawDesc.trim()) {
        const defaultTitle = type === 'purchase' ? 'Compra de inventario' : type === 'expense' ? 'Gasto' : 'Salida de efectivo';
        return { title: defaultTitle };
    }

    // 1. Limpiar cualquier texto de [Pago dividido: ...] de la descripción
    const text = rawDesc.replace(/\s*\[Pago dividido:[^\]]*\]/i, '').trim();

    // 2. Separar concepto principal de notas/observaciones (separadas por " · ", " - " o " — ")
    let titlePart = text;
    let notePart: string | undefined = undefined;

    if (text.includes(' · ')) {
        const parts = text.split(' · ');
        titlePart = parts[0].trim();
        notePart = parts.slice(1).join(' · ').trim();
    } else if (text.includes(' - ')) {
        const parts = text.split(' - ');
        titlePart = parts[0].trim();
        notePart = parts.slice(1).join(' - ').trim();
    } else if (text.includes(' — ')) {
        const parts = text.split(' — ');
        titlePart = parts[0].trim();
        notePart = parts.slice(1).join(' — ').trim();
    }

    // 3. Si es un gasto o abono de proveedor (prefijos reconocidos o tipo 'expense' / 'purchase')
    const supplierPrefixMatch = titlePart.match(/^(?:Gasto proveedor|Abono proveedor|Compra proveedor|Compra inventario|Compra|Proveedor|Gasto):\s*(.+)$/i);
    if (supplierPrefixMatch && supplierPrefixMatch[1].trim()) {
        const supplierName = supplierPrefixMatch[1].trim();
        return {
            title: type === 'purchase' ? `Compra: ${supplierName}` : supplierName,
            note: undefined, // Sin observaciones ni métodos de pago para gastos o compras de proveedor
        };
    }

    if (type === 'purchase') {
        return {
            title: titlePart || 'Compra de inventario',
            note: undefined,
        };
    }

    if (type === 'expense') {
        return {
            title: titlePart || 'Gasto',
            note: undefined, // En gastos siempre mostramos solo proveedor/concepto limpio sin observaciones
        };
    }

    // 4. Demás tipos de salidas (nómina, retiros, retiros de caja)
    if (/^Pago a personal:\s*/i.test(titlePart)) {
        titlePart = titlePart.replace(/^Pago a personal:\s*/i, 'Pago a ').trim();
    }

    return {
        title: titlePart || 'Salida de efectivo',
        note: notePart && notePart.length > 0 ? notePart : undefined,
    };
};

/**
 * Construye los datos del REPORTE DIARIO de un turno.
 *
 * La sección de EFECTIVO (Base, Efectivo, Otros ingresos, Retiro, Total) se
 * calcula desde los `cash_movements` del turno para que cuadre exacto con el
 * `expected_cash`. Gastos y compras en efectivo se absorben en "Retiro de
 * efectivo" (toda salida del cajón). El desglose de VENTAS por método
 * (Tarjetas, Pagos en línea, Otros, Crédito) es informativo y sale de
 * `sales_by_method` (facturación de las órdenes del turno).
 */
export const buildShiftReportData = (
    shift: CashShift,
    movements: ReportMovement[],
    business: BusinessHeader,
    formatDateTime: (iso: string) => string,
    categories?: Record<string, ReportLine>,
): ShiftReportData => {
    // ----- Sección efectivo: desde los movimientos del turno -----
    let cashSales = 0;        // ventas en efectivo que entraron al cajón
    let cashInCash = 0;       // entradas/abonos en efectivo
    let cashOutBucket = 0;    // todo lo que sale del cajón (retiros + gastos + compras + devoluciones en efectivo)
    let refunds = 0;          // devoluciones (cualquier método) — memo
    let otherWithdrawals = 0; // retiros en método distinto a efectivo — memo
    const cashOutflows: ShiftReportCashOutflow[] = [];
    const outflowTypes = ['cash_out', 'expense', 'purchase'];

    for (const m of movements || []) {
        const amt = num(m.amount);
        const cash = isCashMethod(m.payment_method);
        switch (m.type) {
            case 'sale':
                if (cash) cashSales += amt;
                break;
            case 'cash_in':
                if (cash) cashInCash += amt;
                break;
            case 'cash_out':
                if (cash) cashOutBucket += amt; else otherWithdrawals += amt;
                break;
            case 'expense':
            case 'purchase':
                if (cash) cashOutBucket += amt; else otherWithdrawals += amt;
                break;
            case 'refund':
                refunds += amt;
                if (cash) cashOutBucket += amt;
                break;
        }

        if (cash && outflowTypes.includes(m.type) && amt > 0) {
            const { title, note } = parseOutflowDescription(m.description, m.type);
            cashOutflows.push({
                title,
                note,
                amount: amt,
            });
        }
    }

    const openingBalance = num(shift.opening_balance);
    const totalCash = openingBalance + cashSales + cashInCash - cashOutBucket;

    // ----- Desglose de ventas por método: desde sales_by_method (facturación) -----
    // Clasifica cada método (estándar o personalizado) en su línea del reporte
    // usando la fuente única `reportLineFor`. El efectivo de ventas NO se suma
    // aquí: la línea "Efectivo" del reporte es el efectivo real del cajón (arriba).
    const sbm = (shift.sales_by_method || {}) as Record<string, number>;
    const hasSbm = Object.keys(sbm).length > 0;

    let cardSales = 0;
    let onlineSales = 0;
    let otherSales = 0;
    let creditSales = 0;
    let totalSales = 0;

    if (hasSbm) {
        for (const [k, v] of Object.entries(sbm)) {
            const amt = num(v);
            totalSales += amt;
            switch (reportLineFor(k, categories)) {
                case 'tarjeta': cardSales += amt; break;
                case 'linea': onlineSales += amt; break;
                case 'credito': creditSales += amt; break;
                case 'otros': otherSales += amt; break;
                // 'efectivo': es el efectivo del cajón (movimientos), no se duplica aquí
            }
        }
    } else {
        cardSales = num(shift.total_card_sales);
        onlineSales = num(shift.total_transfer_sales);
        creditSales = num(shift.total_credit_sales);
        totalSales = num(shift.total_sales);
    }

    // ----- Declarado por método (arqueo del cierre) -----
    // Las claves del declarado se guardan por línea: card -> Tarjetas,
    // transfer -> Pagos en línea, other -> Otros.
    const dbm = (shift.declared_by_method || {}) as Record<string, number>;
    const declaredCash = num(shift.declared_cash);
    let declaredCard = 0;
    let declaredOnline = 0;
    let declaredOther = 0;
    for (const [k, v] of Object.entries(dbm)) {
        const amt = num(v);
        switch (reportLineFor(k, categories)) {
            case 'tarjeta': declaredCard += amt; break;
            case 'linea': declaredOnline += amt; break;
            default: declaredOther += amt; break;
        }
    }
    const totalDeclared = declaredCash + declaredCard + declaredOnline + declaredOther;

    return {
        businessName: business.businessName,
        businessNit: business.businessNit,
        businessAddress: business.businessAddress,
        businessPhone: business.businessPhone,
        registerName: shift.register?.name || 'Caja',
        shiftNumber: shift.shift_number ?? undefined,
        cashierName: shift.opened_by_profile?.full_name,
        closedByName: shift.closed_by_profile?.full_name,
        openedAt: formatDateTime(shift.opened_at),
        closedAt: shift.closed_at ? formatDateTime(shift.closed_at) : undefined,

        openingBalance,
        cashSales,
        cashIn: cashInCash,
        cashOut: cashOutBucket,
        totalCash,
        cardSales,
        onlineSales,
        otherSales,
        totalSales,

        declaredCash,
        declaredCard,
        declaredOnline,
        declaredOther,

        totalDeclared,
        totalExpected: num(shift.expected_cash),
        difference: num(shift.difference),
        refunds,
        otherWithdrawals,
        creditSales,
        cashOutflows: cashOutflows.length > 0 ? cashOutflows : undefined,
    };
};

const generateShiftReportBlob = async (data: ShiftReportData, paperWidth: '58mm' | '80mm'): Promise<Blob> => {
    const [{ pdf }, { ShiftReportThermalPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('../components/ShiftReportThermalPDF'),
    ]);
    return await pdf(React.createElement(ShiftReportThermalPDF, { data, paperWidth }) as any).toBlob();
};

/** Descarga (o comparte en móvil) el PDF tirilla del cierre de caja. */
export const downloadShiftReportPDF = async (data: ShiftReportData, paperWidth: '58mm' | '80mm' = '80mm'): Promise<void> => {
    const pdfBlob = await generateShiftReportBlob(data, paperWidth);
    const fileName = `cierre_caja_${data.shiftNumber || Date.now()}.pdf`;
    const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

    const canShareFiles = isMobileDevice()
        && isSecureContext()
        && typeof navigator.share === 'function'
        && typeof navigator.canShare === 'function'
        && navigator.canShare({ files: [pdfFile] });

    if (canShareFiles) {
        try {
            await navigator.share({ files: [pdfFile], title: 'Reporte de cierre de caja' });
            return;
        } catch (err) {
            if ((err as Error).name === 'AbortError') return;
        }
    }

    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/** Envía el reporte de cierre por correo con el PDF tirilla adjunto. */
export const sendShiftReportByEmail = async (
    data: ShiftReportData,
    recipientEmail: string,
    paperWidth: '58mm' | '80mm' = '80mm',
): Promise<boolean> => {
    try {
        const pdfBlob = await generateShiftReportBlob(data, paperWidth);
        const pdfBase64 = await blobToBase64(pdfBlob);

        const response = await fetch(`${SUPABASE_URL}/functions/v1/send-receipt-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: recipientEmail,
                emailType: 'shift_report',
                businessName: data.businessName,
                businessPhone: data.businessPhone,
                total: data.totalSales,
                date: data.closedAt || data.openedAt,
                shiftNumber: data.shiftNumber,
                registerName: data.registerName,
                cashierName: data.cashierName,
                pdfBase64,
            }),
        });

        if (!response.ok) {
            console.error('Email send error:', await response.json().catch(() => ({})));
            return false;
        }
        return true;
    } catch (error) {
        console.error('Error sending shift report by email:', error);
        return false;
    }
};
