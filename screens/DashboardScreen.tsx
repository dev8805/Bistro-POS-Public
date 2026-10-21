import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useDashboard, DateRange } from '../hooks/useDashboard';
import { InfoTooltip } from '../components/InfoTooltip';
import { SalesChart, formatShortDate } from '../components/SalesChart';
import { downloadDashboardPDF } from '../lib/exportDashboardPDF';
import { CustomDateRangePicker } from '../components/dashboard/CustomDateRangePicker';
import { ScreenLoader } from '../components/ScreenLoader';

import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { useAuth } from '../context/AuthContext';
import { HIDDEN_PRICES_BUSINESS_ID } from '../lib/specialBusinesses';
import {
    startOfDayInTz,
    endOfDayInTz,
    subtractDaysInTz,
    startOfMonthInTz,
    startOfLastMonthInTz,
    endOfLastMonthInTz,
    toDateStringInTz,
} from '../lib/timezone';



type PeriodOption = 'today' | '7days' | '30days' | 'this_month' | 'last_month' | 'custom';

const PERIOD_LABELS: Record<PeriodOption, string> = {
    today: 'Hoy',
    '7days': 'Últimos 7 días',
    '30days': 'Últimos 30 días',
    this_month: 'Este mes',
    last_month: 'Mes anterior',
    custom: 'Personalizar',
};

const getDateRange = (period: PeriodOption, tz: string): DateRange => {
    const now = new Date();
    const startOfDay = startOfDayInTz(now, tz);
    const eod = endOfDayInTz(now, tz);

    switch (period) {
        case 'today':
            return { start: startOfDay, end: eod };
        case '7days':
            return { start: subtractDaysInTz(now, 6, tz), end: eod };
        case '30days':
            return { start: subtractDaysInTz(now, 29, tz), end: eod };
        case 'this_month':
            return { start: startOfMonthInTz(now, tz), end: eod };
        case 'last_month':
            return { start: startOfLastMonthInTz(now, tz), end: endOfLastMonthInTz(now, tz) };
        default:
            return { start: startOfDay, end: eod };
    }
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

const formatSingleDate = (dateStr: string): string => {
    if (!dateStr || !dateStr.includes('-')) return dateStr;
    const [y, m, d] = dateStr.split('-');
    return `${parseInt(d, 10)}/${parseInt(m, 10)}/${y}`;
};

const formatCurrency = (value: number): string => {
    return '$' + value.toLocaleString('es-CO', { maximumFractionDigits: 0 });
};

const formatCurrencyCompact = (value: number): string => {
    if (value >= 1000000) {
        return '$' + (value / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    } else if (value >= 1000) {
        return '$' + (value / 1000).toFixed(0) + 'K';
    }
    return '$' + value.toLocaleString('es-CO', { maximumFractionDigits: 0 });
};

const PAYMENT_COLORS: Record<string, string> = {
    cash: '#10b981',
    card: '#2563eb',
    nequi: '#9333ea',
    daviplata: '#f97316',
    transfer: '#06b6d4',
    credit: '#ef4444',
    other: '#9ca3af',
};

const KPICard: React.FC<{
    title: string;
    value: string;
    subValue?: string;
    change?: number;
    positive?: boolean;
    valueColor?: string;
    tooltip?: string;
}> = ({ title, value, subValue, change, positive, valueColor = 'text-gray-900 dark:text-white', tooltip }) => (
    <div className="bg-surface-light dark:bg-surface-dark rounded-xl sm:rounded-2xl p-3.5 sm:p-4 shadow-card hover:translate-y-[-2px] hover:shadow-lg transition-all duration-200 border border-gray-100 dark:border-gray-700/50 min-w-0 flex flex-col justify-between h-full gap-1 sm:gap-1.5">
        <div className="flex items-start justify-between gap-1.5 w-full">
            <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-semibold text-gray-600 dark:text-gray-300 leading-tight">
                    {title}
                    {tooltip && <span className="inline-block align-middle ml-1"><InfoTooltip text={tooltip} /></span>}
                </p>
            </div>
            {change !== undefined && (
                <div className={`shrink-0 flex items-center text-[10px] xs:text-[11px] font-bold px-1.5 py-0.5 rounded-md tracking-wide ${positive ? 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400' : 'text-rose-700 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                    <span>{positive ? '+' : ''}{change}%</span>
                </div>
            )}
        </div>
        <div className="min-w-0 mt-auto pt-1">
            <h3 className={`text-xl xs:text-2xl sm:text-3xl lg:text-[1.7rem] font-extrabold tracking-tight leading-none break-words ${valueColor}`} title={value}>
                {value}
            </h3>
            {subValue && (
                <p className="text-[11px] sm:text-xs font-medium text-gray-500 dark:text-gray-400 mt-1.5 leading-tight break-words" title={subValue}>
                    {subValue}
                </p>
            )}
        </div>
    </div>
);

export const DashboardScreen: React.FC<{ isOnline?: boolean }> = ({ isOnline = true }) => {

    const { profile } = useAuth();
    const isNegocio10001 = profile?.business_id === HIDDEN_PRICES_BUSINESS_ID;

    const [expandedPL, setExpandedPL] = useState<Record<string, boolean>>({});
    const [period, setPeriod] = useState<PeriodOption>('today');
    const [isPeriodOpen, setIsPeriodOpen] = useState(false);
    const [isCustomOpen, setIsCustomOpen] = useState(false);
    const [draftStart, setDraftStart] = useState(() => toInputDate(new Date()));
    const [draftEnd, setDraftEnd] = useState(() => toInputDate(new Date()));
    const [appliedStart, setAppliedStart] = useState(() => toInputDate(new Date()));
    const [appliedEnd, setAppliedEnd] = useState(() => toInputDate(new Date()));
    const [topTab, setTopTab] = useState<'profit' | 'income'>(isNegocio10001 ? 'income' : 'profit');
    const [expenseCatModal, setExpenseCatModal] = useState<string | null>(null);

    const handleApplyCustom = () => {
        setAppliedStart(draftStart);
        setAppliedEnd(draftEnd);
        setPeriod('custom');
        setIsPeriodOpen(false);
    };

    const { timezone, businessName, receiptPaperWidth } = useBusinessSettings();
    const [isExporting, setIsExporting] = useState(false);

    const handleExportPDF = async (action: 'download' | 'share' = 'download') => {
        setIsExporting(true);
        try {
            const exactDateRangeName = formatDateRange(toInputDate(dateRange.start), toInputDate(dateRange.end));
            await downloadDashboardPDF(data, exactDateRangeName, businessName, 0, action);
        } catch (error) {
            console.error('Error exporting PDF:', error);
        } finally {
            setIsExporting(false);
        }
    };

    const dateRange = useMemo(() => {
        if (period === 'custom') {
            const start = startOfDayInTz(new Date(appliedStart + 'T12:00:00'), timezone);
            const end = endOfDayInTz(new Date(appliedEnd + 'T12:00:00'), timezone);
            return { start, end };
        }
        return getDateRange(period, timezone);
    }, [period, timezone, appliedStart, appliedEnd]);
    const { data, loading, calcChange } = useDashboard(dateRange);

    // Impresión QZ Tray — Top productos (solo negocio 10001)
    // Fallback: si QZ no está conectada, abre una pestaña con window.print()
    const [isPrintingTop, setIsPrintingTop] = useState(false);
    const handlePrintTopProducts = useCallback(async () => {
        if (!isNegocio10001 || data.topProducts.length === 0) return;
        setIsPrintingTop(true);
        try {
            const sorted = [...data.topProducts]
                .sort((a, b) => topTab === 'profit' ? b.profit - a.profit : b.income - a.income);

            const { getPrinterStatus: getStatus, getRegisteredPrinters } = await import('../lib/thermalPrinterService');
            const qzConnected = getStatus() === 'connected' && getRegisteredPrinters().length > 0;

            if (qzConnected) {
                // --- Impresión térmica QZ ---
                const { default: ReceiptPrinterEncoder } = await import('@point-of-sale/receipt-printer-encoder');
                const qzModule = await import('qz-tray');
                const qz = qzModule.default;

                // Quita tildes/diacríticos para compatibilidad ESC/POS
                const strip = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

                const target = getRegisteredPrinters()[0].name;
                const is58 = receiptPaperWidth === '58mm';
                const columns = is58 ? 32 : 48;
                const encoder = new ReceiptPrinterEncoder({ columns });

                encoder.align('center');
                encoder.bold(true);
                encoder.line(strip('TOP PRODUCTOS VENDIDOS'));
                encoder.bold(false);
                encoder.line(strip(topTab === 'income' ? '(por Ingreso)' : '(por Ganancia)'));
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

                let total = 0;
                sorted.forEach((p) => {
                    const val = topTab === 'profit' ? p.profit : p.income;
                    total += val;
                    const valStr = `$${val.toLocaleString('es-CO')}`;
                    const qtyStr = String(Math.round(p.sold));
                    const name = strip(p.name).length > nameW ? strip(p.name).substring(0, nameW - 1) + '.' : strip(p.name);
                    encoder.table(
                        [{ width: nameW, align: 'left' }, { width: qtyW, align: 'right' }, { width: valW, align: 'right' }],
                        [[name, qtyStr, valStr]]
                    );
                });

                encoder.line('='.repeat(columns));
                encoder.bold(true);
                encoder.table(
                    [{ width: columns - valW, align: 'left' }, { width: valW, align: 'right' }],
                    [['TOTAL', `$${total.toLocaleString('es-CO')}`]]
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
            } else {
                // --- Fallback: imprimir desde el navegador ---
                let total = 0;
                const rows = sorted.map((p, i) => {
                    const val = topTab === 'profit' ? p.profit : p.income;
                    total += val;
                    return `<tr>
                        <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center">${i + 1}</td>
                        <td style="padding:4px 8px;border-bottom:1px solid #eee">${p.name}</td>
                        <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:center">${Math.round(p.sold)}</td>
                        <td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">$${val.toLocaleString('es-CO')}</td>
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
<p class="sub">${topTab === 'income' ? 'Por Ingreso' : 'Por Ganancia'}</p>
<table>
<thead><tr><th>#</th><th>Producto</th><th>Qty</th><th>${topTab === 'income' ? 'Ingreso' : 'Ganancia'}</th></tr></thead>
<tbody>${rows}
<tr class="total-row"><td></td><td colspan="2">TOTAL</td><td style="text-align:right">$${total.toLocaleString('es-CO')}</td></tr>
</tbody></table>
<script>window.onload=()=>{window.print();}</script>
</body></html>`;

                const printWindow = window.open('', '_blank');
                if (printWindow) {
                    printWindow.document.write(html);
                    printWindow.document.close();
                }
            }
        } catch (err) {
            console.error('[Dashboard] Error imprimiendo top productos:', err);
            alert('Error al imprimir.');
        } finally {
            setIsPrintingTop(false);
        }
    }, [isNegocio10001, data.topProducts, topTab, receiptPaperWidth]);

    // Descarga el Top Productos como PDF directo
    const handleDownloadTopPDF = useCallback(async () => {
        if (data.topProducts.length === 0) return;
        try {
            const [{ pdf }, { default: TopProductsPDF }] = await Promise.all([
                import('@react-pdf/renderer'),
                import('../components/TopProductsPDF'),
            ]);

            const pdfBlob = await (pdf as any)(
                React.createElement(TopProductsPDF, {
                    products: data.topProducts,
                    mode: topTab,
                    businessName: businessName || 'Mi Negocio',
                })
            ).toBlob();

            const fileName = `top_productos_${new Date().toISOString().slice(0, 10)}.pdf`;
            const url = URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (err) {
            console.error('[Dashboard] Error generando PDF:', err);
        }
    }, [data.topProducts, topTab, businessName]);

    // Distingue la primera carga (mostrar ScreenLoader full-screen) de los cambios
    // de período posteriores (mantener el overlay para no desmontar el header).
    const isLoadingAll = loading;
    const [hasInitialLoad, setHasInitialLoad] = useState(false);
    useEffect(() => {
        if (!isLoadingAll && !hasInitialLoad) setHasInitialLoad(true);
    }, [isLoadingAll, hasInitialLoad]);
    const ordersChange = calcChange(data.ordersCount, data.prevOrdersCount);
    const productsSoldChange = calcChange(data.productsSold, data.prevProductsSold);
    const incomeChange = calcChange(data.totalIncome, data.prevTotalIncome);

    const getShortTitle = (title: string): string => {
        const shortTitles: Record<string, string> = {
            'Pedidos del Periodo': 'Pedidos',
            'Productos Vendidos': 'Productos',
            'Ingresos Totales': 'Ingresos',
        };
        return shortTitles[title] || title;
    };

    // Cálculo de cambios para nuevos KPIs
    const prevAverageTicket = data.prevOrdersCount > 0 ? data.prevTotalIncome / data.prevOrdersCount : 0;
    const avgTicketChange = calcChange(data.averageTicket, prevAverageTicket);

    // Métricas analíticas avanzadas para el gráfico de ventas
    const salesMetrics = useMemo(() => {
        if (!data.dailySales || data.dailySales.length === 0) {
            return { peakDay: null, avgDaily: 0 };
        }
        let peak = data.dailySales[0];
        for (const day of data.dailySales) {
            if (day.total > peak.total) {
                peak = day;
            }
        }
        const avgDaily = data.dailySales.length > 0 ? data.totalIncome / data.dailySales.length : 0;
        return {
            peakDay: peak && peak.total > 0 ? peak : null,
            avgDaily,
        };
    }, [data.dailySales, data.totalIncome]);

    // Métricas analíticas avanzadas para actividad por hora (Hora pico, pedidos, horas activas)
    const hourlyMetrics = useMemo(() => {
        if (!data.hourlyActivity || data.hourlyActivity.length === 0) {
            return { peakHour: null, activeHoursCount: 0, totalOrders: 0 };
        }
        let peakIdx = 0;
        let maxIncome = 0;
        let activeHours = 0;
        let totalOrders = 0;

        data.hourlyActivity.forEach((h, idx) => {
            totalOrders += h.count;
            if (h.income > 0 || h.count > 0) activeHours++;
            if (h.income > maxIncome) {
                maxIncome = h.income;
                peakIdx = idx;
            }
        });

        const peakItem = data.hourlyActivity[peakIdx];
        const hasPeak = maxIncome > 0;
        const ampm = peakIdx >= 12 ? 'pm' : 'am';
        const hour12 = peakIdx > 12 ? peakIdx - 12 : (peakIdx === 0 ? 12 : peakIdx);
        const peakLabel = `${hour12}:00 ${ampm}`;

        return {
            peakHour: hasPeak ? { ...peakItem, hourIndex: peakIdx, label: peakLabel } : null,
            activeHoursCount: activeHours,
            totalOrders,
        };
    }, [data.hourlyActivity]);

    // Detección de período de 1 día (Hoy o rango personalizado de 1 sola fecha)
    const isSingleDay = useMemo(() => {
        if (period === 'today') return true;
        if (period === 'custom') return appliedStart === appliedEnd;
        return false;
    }, [period, appliedStart, appliedEnd]);

    // Etiqueta legible con la fecha específica seleccionada (ej: "6 sep 2026")
    const selectedSingleDateLabel = useMemo(() => {
        if (!isSingleDay) return '';
        const dateStr = period === 'today'
            ? toDateStringInTz(new Date(), timezone)
            : appliedStart;
        return formatSingleDate(dateStr);
    }, [isSingleDay, period, timezone, appliedStart]);

    // Interacción táctil para explorar las 24 horas en móvil
    const [touchHourIndex, setTouchHourIndex] = useState<number | null>(null);
    const handleHourlyTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
        const touch = e.touches[0];
        const el = e.currentTarget;
        const rect = el.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        const idx = Math.min(23, Math.floor(pct * 24));
        setTouchHourIndex(idx);
    }, []);
    const handleHourlyTouchEnd = useCallback(() => {
        setTouchHourIndex(null);
    }, []);

    // Datos del gráfico principal: si es 1 solo día grafica las 24 horas continuas; si son varios días grafica las fechas
    const chartSalesData = useMemo(() => {
        if (isSingleDay) {
            return data.hourlyActivity.map((h, i) => {
                const ampm = i >= 12 ? 'pm' : 'am';
                const hour12 = i > 12 ? i - 12 : (i === 0 ? 12 : i);
                return {
                    date: `${hour12}${ampm}`,
                    total: h.income,
                    dayIndex: i,
                };
            });
        }
        return data.dailySales;
    }, [isSingleDay, data.hourlyActivity, data.dailySales]);

    // Ventas para rangos de varios días:
    // Si el rango es de hasta 7 días (ej. "Últimos 7 días"): muestra los días en orden cronológico terminando en el día final (hoy).
    // Si el rango es mayor a 7 días (ej. 30 días, 3 meses): muestra la distribución acumulada por día de la semana (Lunes a Domingo).
    const weekdaySales = useMemo(() => {
        if (!data.dailySales) {
            return { days: [], maxVal: 1, bestDay: null, totalSum: 0, isChronological: false };
        }

        const DAY_NAMES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const DAY_NAMES_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

        // Calculamos la duración en días del rango seleccionado
        const diffMs = dateRange.end.getTime() - dateRange.start.getTime();
        const diffDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
        const isChronological = period === '7days' || diffDays <= 7;

        let totalSum = 0;

        if (isChronological) {
            // Mapeo rápido de fecha YYYY-MM-DD -> total de ventas
            const salesByDate: Record<string, number> = {};
            data.dailySales.forEach((d) => {
                if (d.date) salesByDate[d.date] = d.total;
                totalSum += d.total;
            });

            // Generamos la secuencia cronológica exacta de los días del rango (máx 7 días)
            const days: {
                dayName: string;
                fullName: string;
                dateStr: string;
                formattedDate: string;
                key: string | number;
                total: number;
                count: number;
                isToday: boolean;
            }[] = [];

            const numDays = Math.min(diffDays, 7);
            const todayStr = toDateStringInTz(new Date(), timezone);

            for (let i = numDays - 1; i >= 0; i--) {
                const targetDate = subtractDaysInTz(dateRange.end, i, timezone);
                const dateStr = toDateStringInTz(targetDate, timezone);
                const [y, m, d] = dateStr.split('-');
                const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
                const dayIdx = dt.getDay();
                const total = salesByDate[dateStr] || 0;

                days.push({
                    dayName: DAY_NAMES_SHORT[dayIdx],
                    fullName: DAY_NAMES_FULL[dayIdx],
                    dateStr,
                    formattedDate: `${parseInt(d, 10)} ${MONTHS_SHORT[parseInt(m, 10) - 1]}`,
                    key: dateStr,
                    total,
                    count: 1,
                    isToday: dateStr === todayStr,
                });
            }

            const maxVal = Math.max(...days.map((d) => d.total), 1);
            let bestDay = days[0];
            days.forEach((d) => {
                if (d.total > (bestDay?.total || 0)) bestDay = d;
            });

            return {
                days,
                maxVal,
                bestDay: bestDay && bestDay.total > 0 ? bestDay : null,
                totalSum,
                isChronological: true,
            };
        }

        // Caso de períodos largos (> 7 días): distribución acumulada Lunes a Domingo
        const days = [
            { dayName: 'Lun', fullName: 'Lunes', key: 1, total: 0, count: 0, formattedDate: '', isToday: false, dateStr: '' },
            { dayName: 'Mar', fullName: 'Martes', key: 2, total: 0, count: 0, formattedDate: '', isToday: false, dateStr: '' },
            { dayName: 'Mié', fullName: 'Miércoles', key: 3, total: 0, count: 0, formattedDate: '', isToday: false, dateStr: '' },
            { dayName: 'Jue', fullName: 'Jueves', key: 4, total: 0, count: 0, formattedDate: '', isToday: false, dateStr: '' },
            { dayName: 'Vie', fullName: 'Viernes', key: 5, total: 0, count: 0, formattedDate: '', isToday: false, dateStr: '' },
            { dayName: 'Sáb', fullName: 'Sábado', key: 6, total: 0, count: 0, formattedDate: '', isToday: false, dateStr: '' },
            { dayName: 'Dom', fullName: 'Domingo', key: 0, total: 0, count: 0, formattedDate: '', isToday: false, dateStr: '' },
        ];

        data.dailySales.forEach((d) => {
            if (!d.date || !d.date.includes('-')) return;
            const [y, m, day] = d.date.split('-');
            const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(day, 10));
            const dayIdx = dt.getDay();
            const target = days.find((item) => item.key === dayIdx);
            if (target) {
                target.total += d.total;
                target.count += 1;
                totalSum += d.total;
            }
        });

        const maxVal = Math.max(...days.map((d) => d.total), 1);
        let bestDay = days[0];
        days.forEach((d) => {
            if (d.total > (bestDay?.total || 0)) bestDay = d;
        });

        return {
            days,
            maxVal,
            bestDay: bestDay && bestDay.total > 0 ? bestDay : null,
            totalSum,
            isChronological: false,
        };
    }, [data.dailySales, dateRange, period, timezone]);

    // Desglose por franjas horarias operativas para cuando el período es de 1 solo día
    const dayShifts = useMemo(() => {
        if (!data.hourlyActivity) return { shifts: [], bestShift: null };

        const shiftList = [
            { label: 'Mañana', range: '6am - 12pm', icon: 'wb_sunny', hours: [6, 7, 8, 9, 10, 11], total: 0, orders: 0, color: 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' },
            { label: 'Tarde', range: '12pm - 6pm', icon: 'light_mode', hours: [12, 13, 14, 15, 16, 17], total: 0, orders: 0, color: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' },
            { label: 'Noche', range: '6pm - 12am', icon: 'nightlight', hours: [18, 19, 20, 21, 22, 23], total: 0, orders: 0, color: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' },
            { label: 'Madrugada', range: '12am - 6am', icon: 'bedtime', hours: [0, 1, 2, 3, 4, 5], total: 0, orders: 0, color: 'text-gray-400 bg-gray-50 dark:bg-gray-700/20' },
        ];

        shiftList.forEach((s) => {
            s.hours.forEach((h) => {
                if (data.hourlyActivity[h]) {
                    s.total += data.hourlyActivity[h].income;
                    s.orders += data.hourlyActivity[h].count;
                }
            });
        });

        const activeShifts = shiftList.filter((s) => s.total > 0 || s.label !== 'Madrugada');
        let best = activeShifts[0];
        activeShifts.forEach((s) => {
            if (s.total > best.total) best = s;
        });

        return {
            shifts: activeShifts,
            bestShift: best && best.total > 0 ? best : null,
        };
    }, [data.hourlyActivity]);
    
    // El gráfico ahora basa su altura en el ingreso, no solo los pedidos
    const maxHourly = Math.max(...data.hourlyActivity.map(h => h.income), 1);

    if (!isOnline) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center h-full bg-background-light dark:bg-background-dark p-8 text-center gap-5">
                <div className="size-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>wifi_off</span>
                </div>
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Sin conexión</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-xs">
                        Las estadísticas y el reporte de ventas requieren internet para cargar los datos del período.
                    </p>
                </div>
            </div>
        );
    }

    if (!hasInitialLoad) return <ScreenLoader />;

    return (
        <div className="relative h-full w-full animate-fadeIn">
            {isLoadingAll && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/40 dark:bg-black/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
                    <div className="size-12 border-4 border-gray-200/50 dark:border-gray-700/50 border-t-[#fbbf24] rounded-full animate-spin"></div>
                </div>
            )}
            <div className={`h-full overflow-y-auto bg-background-light dark:bg-background-dark p-3 xs:p-4 sm:p-6 md:p-8 transition-all duration-300 ${isLoadingAll ? 'opacity-30 pointer-events-none overflow-hidden' : ''}`}>
                <div className="max-w-[1440px] mx-auto space-y-3 xs:space-y-4 sm:space-y-6">
                    {/* Header */}
                <header className="hidden sm:flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
                    <div className="flex items-center gap-3">
                        {/* Period Selector */}
                        <div className="relative">
                            <button
                                onClick={() => setIsPeriodOpen(!isPeriodOpen)}
                                className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[18px] mr-2 text-gray-500">calendar_month</span>
                                {period === 'custom' ? formatDateRange(appliedStart, appliedEnd) : PERIOD_LABELS[period]}
                                <span className="material-symbols-outlined text-[16px] ml-2 text-gray-400">expand_more</span>
                            </button>
                            {isPeriodOpen && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setIsPeriodOpen(false)} />
                                    <div className="absolute left-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-40 py-1 animate-[fadeIn_0.1s_ease-out]">
                                        {(Object.keys(PERIOD_LABELS) as PeriodOption[]).filter(k => k !== 'custom').map((key) => (
                                            <button
                                                key={key}
                                                onClick={() => { setPeriod(key); setIsPeriodOpen(false); }}
                                                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${period === key ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                                            >
                                                {PERIOD_LABELS[key]}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="relative">
                            <button
                                onClick={() => { setIsCustomOpen(!isCustomOpen); setIsPeriodOpen(false); }}
                                className={`inline-flex items-center px-3 py-2 border shadow-sm text-sm font-medium rounded-lg transition-colors ${period === 'custom' ? 'border-blue-400 dark:border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                            >
                                <span className="material-symbols-outlined text-[18px] mr-1.5">date_range</span>
                                Personalizado
                            </button>
                            {isCustomOpen && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setIsCustomOpen(false)} />
                                    <div className="absolute left-0 mt-2 z-40 transform origin-top-left">
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
                    </div>
                    {/* HIDDEN: botones "Descargar reporte" y "Compartir" — ocultos temporalmente en la UI */}
                </header>

                {/* Mobile Header */}
                <div className="sm:hidden flex items-center justify-between gap-1.5 xs:gap-2 mb-4">
                    <div className="relative flex-1 min-w-0">
                        <button
                            onClick={() => setIsPeriodOpen(!isPeriodOpen)}
                            className="inline-flex items-center px-2.5 xs:px-3 py-2.5 border border-gray-300 dark:border-gray-600 shadow-sm text-[11px] xs:text-xs font-semibold rounded-xl text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 w-full justify-between min-h-[44px] transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                            <div className="flex items-center min-w-0 overflow-hidden pr-1">
                                <span className="material-symbols-outlined text-[16px] xs:text-[18px] mr-1 xs:mr-1.5 shrink-0 text-gray-500">calendar_month</span>
                                <span className="truncate whitespace-nowrap">
                                    {period === 'custom' ? formatDateRange(appliedStart, appliedEnd) : PERIOD_LABELS[period]}
                                </span>
                            </div>
                            <span className="material-symbols-outlined text-[16px] xs:text-[18px] shrink-0 text-gray-400">expand_more</span>
                        </button>
                        {isPeriodOpen && (
                            <>
                                <div className="fixed inset-0 z-30" onClick={() => setIsPeriodOpen(false)} />
                                <div className="absolute left-0 mt-2 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl z-40 py-2">
                                    {(Object.keys(PERIOD_LABELS) as PeriodOption[]).filter(k => k !== 'custom').map((key) => (
                                        <button
                                            key={key}
                                            onClick={() => { setPeriod(key); setIsPeriodOpen(false); }}
                                            className={`w-full text-left px-4 xs:px-5 py-2.5 xs:py-3 text-xs xs:text-sm transition-colors ${period === key ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 font-bold' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium'}`}
                                        >
                                            {PERIOD_LABELS[key]}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                    <div className="relative shrink-0">
                        <button
                            onClick={() => { setIsCustomOpen(!isCustomOpen); setIsPeriodOpen(false); }}
                            className={`inline-flex items-center justify-center px-2.5 xs:px-3 py-2.5 border shadow-sm text-xs xs:text-sm font-semibold rounded-xl transition-colors min-h-[44px] ${period === 'custom' ? 'border-blue-400 dark:border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                        >
                            <span className="material-symbols-outlined text-[16px] xs:text-[18px] shrink-0">date_range</span>
                            <span className="hidden min-[360px]:inline ml-1">Personalizado</span>
                        </button>
                        {isCustomOpen && (
                            <>
                                <div className="fixed inset-0 z-30" onClick={() => setIsCustomOpen(false)} />
                                <div className="absolute right-0 mt-2 z-40 transform origin-top-right">
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
                </div>

                {/* HIDDEN: botones móviles "Descargar reporte" y "Compartir" — ocultos temporalmente en la UI */}




                {/* KPI Cards */}
                {/* TODO: mostrar ventas fiadas del período debajo de la card de Ventas Netas.
                    Dato disponible: data.paymentMethods.find(pm => pm.method === 'credit')?.amount
                    (ya filtrado por el rango de fechas seleccionado, no es la deuda acumulada total) */}
                <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 xs:gap-4 sm:gap-6">
                    <KPICard
                        title="Ventas Netas"
                        value={formatCurrency(data.totalIncome)}
                        subValue={`${data.ordersCount} pedidos completados`}
                        change={incomeChange.change}
                        positive={incomeChange.positive}
                        tooltip="Dinero total que ha entrado a caja en este periodo."
                    />
                    <KPICard
                        title="Utilidad Real"
                        value={formatCurrency(data.operatingProfit)}
                        subValue={`Margen operativo: ${data.operatingMarginPercent.toFixed(1)}%`}
                        valueColor={data.operatingProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}
                        tooltip="Lo que realmente ganaste después de pagar mercancía, gastos fijos, mermas, etc."
                    />
                    <KPICard
                        title="Ticket"
                        value={formatCurrency(data.averageTicket)}
                        subValue="Promedio compra por cliente"
                        change={avgTicketChange.change}
                        positive={avgTicketChange.positive}
                        tooltip="Valor promedio de cada venta. Si sube, tus clientes están gastando más."
                    />
                    <KPICard
                        title="Costo de Mercancía"
                        value={formatCurrency(data.cogs)}
                        subValue={`Equivale a un ${data.totalIncome > 0 ? ((data.cogs / data.totalIncome) * 100).toFixed(1) : 0}% de ingresos`}
                        valueColor={data.totalIncome > 0 && (data.cogs / data.totalIncome) * 100 > 40 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}
                        tooltip="Total invertido en la mercancía que ya lograste vender en este periodo. Ideal que el % se mantenga < 40%."
                    />
                </section>

                {/* Expense Distribution Pie Chart */}
                {(() => {
                    const EXPENSE_COLORS = [
                        '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
                        '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#a855f7',
                    ];

                    // Agrupar gastos por categoría (normalizado: case-insensitive, sin espacios extra)
                    const categoryMap: Record<string, { total: number; label: string }> = {};
                    data.otherExpensesList.forEach(e => {
                        if (e.amount > 0) {
                            const raw = e.description || 'Otro gasto';
                            const key = raw.toLowerCase().trim();
                            if (!categoryMap[key]) categoryMap[key] = { total: 0, label: raw };
                            categoryMap[key].total += e.amount;
                        }
                    });

                    const slices: { label: string; value: number; color: string }[] = [];
                    if (data.wasteTotal > 0) slices.push({ label: 'MERMAS', value: data.wasteTotal, color: '#ef4444' });
                    Object.values(categoryMap).forEach(({ label, total }, i) => {
                        slices.push({ label, value: total, color: EXPENSE_COLORS[i % EXPENSE_COLORS.length] });
                    });

                    const total = slices.reduce((s, x) => s + x.value, 0);
                    if (total === 0 || slices.length === 0) return null;

                    // SVG pie chart math
                    const cx = 80, cy = 80, r = 68, gap = 0.03;
                    let cumAngle = -Math.PI / 2;
                    const paths = slices.map((slice) => {
                        const angle = (slice.value / total) * (2 * Math.PI);
                        const startAngle = cumAngle + gap / 2;
                        const endAngle = cumAngle + angle - gap / 2;
                        cumAngle += angle;
                        const x1 = cx + r * Math.cos(startAngle);
                        const y1 = cy + r * Math.sin(startAngle);
                        const x2 = cx + r * Math.cos(endAngle);
                        const y2 = cy + r * Math.sin(endAngle);
                        const largeArc = angle > Math.PI ? 1 : 0;
                        const d = angle >= 2 * Math.PI - 0.001
                            ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.001} ${cy - r} Z`
                            : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
                        return { ...slice, d, pct: ((slice.value / total) * 100).toFixed(1) };
                    });

                    return (
                        <section className="bg-white dark:bg-gray-800 rounded-2xl p-4 sm:p-6 shadow-card border border-gray-100 dark:border-gray-700/50">
                            <div className="flex items-center gap-2 mb-4 sm:mb-5">
                                <span className="material-symbols-outlined text-[20px] text-rose-500">donut_large</span>
                                <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">Gastos Operativos</h2>
                                <InfoTooltip text="Desglose de tus egresos operativos: mermas y gastos por categoría. Haz clic en una categoría para ver el detalle." />
                                <div className="ml-auto inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/40">
                                    <span className="text-[11px] sm:text-xs font-semibold text-rose-700/70 dark:text-rose-400/80">Total:</span>
                                    <span className="text-xs sm:text-sm font-extrabold text-rose-700 dark:text-rose-300">
                                        {formatCurrency(total)}
                                    </span>
                                </div>
                            </div>

                            <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-8">
                                {/* SVG Pie: visible solo en pantallas grandes (>=1024px) para optimizar espacio en móvil y tablet */}
                                <div className="hidden lg:block relative shrink-0">
                                    <svg width={160} height={160} viewBox="0 0 160 160">
                                        <circle cx={cx} cy={cy} r={r + 2} fill="none" stroke="transparent" />
                                        {paths.map((p, i) => (
                                            <path
                                                key={p.label}
                                                d={p.d}
                                                fill={p.color}
                                                onClick={() => setExpenseCatModal(p.label)}
                                                className="transition-opacity duration-150 hover:opacity-75 cursor-pointer"
                                                opacity={0.92}
                                            >
                                                <title>{p.label}: {formatCurrency(p.value)} ({p.pct}%)</title>
                                            </path>
                                        ))}
                                        {/* Donut hole */}
                                        <circle cx={cx} cy={cy} r={38} fill="white" className="dark:fill-gray-800" />
                                        <text x={cx} y={cy - 6} textAnchor="middle" className="fill-gray-900 dark:fill-white" fontSize={10} fontWeight={700}>
                                            {slices.length}
                                        </text>
                                        <text x={cx} y={cy + 8} textAnchor="middle" className="fill-gray-400" fontSize={8} fontWeight={500}>
                                            {slices.length === 1 ? 'categoría' : 'categorías'}
                                        </text>
                                    </svg>
                                </div>

                                {/* Legend */}
                                <div className="flex-1 w-full grid grid-cols-1 xs:grid-cols-2 gap-x-6 gap-y-2 min-w-0">
                                    {paths.map((p, i) => (
                                        <button
                                            key={p.label}
                                            onClick={() => setExpenseCatModal(p.label)}
                                            className="flex items-center gap-2 min-w-0 text-left group rounded-lg p-1 -mx-1 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                                        >
                                            <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-baseline justify-between gap-1">
                                                    <span className="text-[11px] sm:text-xs font-semibold text-gray-700 dark:text-gray-200 truncate group-hover:underline">{p.label}</span>
                                                    <span className="text-[10px] font-bold text-gray-400 shrink-0">{p.pct}%</span>
                                                </div>
                                                <div className="w-full bg-gray-100 dark:bg-gray-700/50 h-1 rounded-full mt-0.5 overflow-hidden">
                                                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${p.pct}%`, backgroundColor: p.color }} />
                                                </div>
                                                <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium">{formatCurrency(p.value)}</span>
                                            </div>
                                            <span className="material-symbols-outlined text-[14px] text-gray-300 group-hover:text-gray-500 dark:group-hover:text-gray-300 shrink-0 transition-colors">chevron_right</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </section>
                    );
                })()}

                {/* Analytics Grid: Sales Chart, Payment Methods, Day Rhythm / Weekly, Top Products */}
                <section className="grid grid-cols-1 lg:grid-cols-6 gap-3 xs:gap-4 sm:gap-6 items-stretch">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 sm:p-6 shadow-card lg:col-span-4 flex flex-col justify-between min-w-0 border border-gray-100 dark:border-gray-700/50 hover:shadow-lg transition-all duration-200">
                        {/* Header superior: Título de un día o métricas de Día Récord y Promedio Diario en períodos de varios días */}
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                            {isSingleDay ? (
                                <>
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[22px] text-blue-600 dark:text-blue-400">
                                            trending_up
                                        </span>
                                        <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                                            Evolución de Ventas ({selectedSingleDateLabel})
                                        </h2>
                                    </div>
                                    <span className="text-xs font-semibold text-gray-400 bg-gray-50 dark:bg-gray-700/40 px-2.5 py-1 rounded-lg border border-gray-100 dark:border-gray-700/50">
                                        24 Horas
                                    </span>
                                </>
                            ) : (
                                <>
                                    {/* Métricas de Día Récord y Promedio Diario en la fila superior */}
                                    <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                                        {/* Día Récord */}
                                        <div className="flex items-center gap-2">
                                            <div className="size-7 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-500">
                                                <span className="material-symbols-outlined text-[16px]">hotel_class</span>
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block leading-none">
                                                    Día Récord
                                                </span>
                                                <div className="flex items-baseline gap-1 mt-0.5">
                                                    <span className="text-sm sm:text-base font-extrabold text-gray-900 dark:text-white whitespace-nowrap">
                                                        {salesMetrics.peakDay ? formatCurrency(salesMetrics.peakDay.total) : '—'}
                                                    </span>
                                                    {salesMetrics.peakDay && (
                                                        <span className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
                                                            ({formatShortDate(salesMetrics.peakDay.date)})
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="hidden xs:block h-6 w-px bg-gray-200 dark:bg-gray-700/60" />

                                        {/* Promedio Diario */}
                                        <div className="flex items-center gap-2">
                                            <div className="size-7 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500">
                                                <span className="material-symbols-outlined text-[16px]">stacked_line_chart</span>
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-1">
                                                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider block leading-none">
                                                        Promedio Diario
                                                    </span>
                                                    <InfoTooltip text="Venta promedio por día operado: divide el ingreso total del período únicamente entre los días con ventas registradas." />
                                                </div>
                                                <div className="mt-0.5">
                                                    <span className="text-sm sm:text-base font-extrabold text-gray-900 dark:text-white whitespace-nowrap">
                                                        {salesMetrics.avgDaily > 0 ? formatCurrency(Math.round(salesMetrics.avgDaily)) : '—'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Leyenda comparativa Actual vs Anterior */}
                                    {data.prevDailySales.length > 0 && (
                                        <div className="flex items-center gap-2.5 text-xs bg-gray-50 dark:bg-gray-700/40 px-2.5 py-1 rounded-lg border border-gray-100 dark:border-gray-700/50 shrink-0">
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-3.5 h-1 bg-blue-600 rounded-full" />
                                                <span className="text-gray-700 dark:text-gray-300 font-semibold text-[11px]">Actual</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-3.5 border-t-2 border-dashed border-gray-400 dark:border-gray-400" />
                                                <span className="text-gray-400 dark:text-gray-400 font-medium text-[11px]">Anterior</span>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Visualización Gráfica: Actividad por Hora (si es 1 día) o SalesChart (si es rango) */}
                        <div className="flex-1 flex flex-col justify-center min-h-[220px] sm:min-h-[260px]">
                            {isSingleDay ? (
                                data.hourlyActivity.length === 0 || (data.totalIncome === 0 && data.ordersCount === 0) ? (
                                    <div className="flex items-center justify-center h-48 sm:h-64">
                                        <p className="text-xs text-gray-400 font-medium">Sin ventas registradas en esta fecha</p>
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col justify-end pt-2">
                                        <div
                                            className="w-full h-40 xs:h-48 sm:h-56 flex items-end justify-between gap-[2px] sm:gap-[3px] px-1 relative select-none touch-none"
                                            onTouchStart={handleHourlyTouchMove}
                                            onTouchMove={handleHourlyTouchMove}
                                            onTouchEnd={handleHourlyTouchEnd}
                                            onMouseLeave={handleHourlyTouchEnd}
                                        >
                                            {data.hourlyActivity.map((item, index) => {
                                                const hour = index;
                                                const ampm = hour >= 12 ? 'pm' : 'am';
                                                const hour12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
                                                const isPeak = hourlyMetrics.peakHour?.hourIndex === index && item.income > 0;
                                                const avgOrderInHour = item.count > 0 ? Math.round(item.income / item.count) : 0;
                                                const isTouched = touchHourIndex === index;

                                                return (
                                                    <div
                                                        key={`hour-${index}`}
                                                        className="group relative w-full flex flex-col justify-end items-center h-full cursor-pointer"
                                                    >
                                                        {/* Hover & Touch highlight column */}
                                                        <div className={`absolute inset-0 ${isTouched ? 'bg-blue-100/60 dark:bg-blue-900/30 opacity-100' : 'bg-blue-50/50 dark:bg-blue-900/10 opacity-0 group-hover:opacity-100'} transition-opacity rounded-sm pointer-events-none`} />

                                                        {/* Tooltip interactivo flotante */}
                                                        <div className={`absolute bottom-full mb-2 ${isTouched ? 'opacity-100 scale-100 z-40' : 'opacity-0 group-hover:opacity-100 scale-95 group-hover:scale-100 z-30'} transition-all whitespace-nowrap pointer-events-none duration-150`}>
                                                            <div className="bg-gray-900/95 dark:bg-gray-800/95 backdrop-blur-sm border border-gray-700 text-white text-[10px] xs:text-xs font-bold py-1.5 px-2.5 rounded-xl shadow-xl flex flex-col items-center">
                                                                <span className="text-gray-300 dark:text-gray-400 font-medium text-[9px] xs:text-[10px] mb-0.5">
                                                                    {hour12}:00 {ampm} {isPeak ? '⚡ PICO' : ''}
                                                                </span>
                                                                <span className="text-sm font-extrabold text-blue-400">{formatCurrency(item.income)}</span>
                                                                <span className="text-[10px] text-gray-300 mt-0.5">{item.count} {item.count === 1 ? 'pedido' : 'pedidos'}</span>
                                                                {avgOrderInHour > 0 && (
                                                                    <span className="text-[9px] text-gray-400 mt-0.5 border-t border-gray-700/60 pt-0.5 w-full text-center">Ticket: {formatCurrency(avgOrderInHour)}</span>
                                                                )}
                                                            </div>
                                                            <div className="size-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-gray-900 dark:border-t-white mx-auto"></div>
                                                        </div>

                                                        {/* Indicador de hora pico */}
                                                        {isPeak && (
                                                            <div className="mb-1 text-amber-500 animate-pulse">
                                                                <span className="material-symbols-outlined text-[12px] block">bolt</span>
                                                            </div>
                                                        )}

                                                        {/* Barra horaria */}
                                                        <div
                                                            className={`w-full rounded-t-sm transition-all duration-300 relative z-0 ${
                                                                isPeak
                                                                    ? 'bg-gradient-to-t from-amber-500 to-amber-300 group-hover:to-amber-200 shadow-xs'
                                                                    : item.income > 0
                                                                    ? 'bg-gradient-to-t from-blue-600 to-blue-400 dark:from-blue-700 dark:to-blue-400 group-hover:to-blue-300 dark:group-hover:to-blue-300'
                                                                    : 'bg-transparent'
                                                            }`}
                                                            style={{ height: `${maxHourly > 0 ? (item.income / maxHourly) * 100 : 0}%`, minHeight: item.income > 0 ? '5px' : '0px' }}
                                                        />
                                                        {item.income === 0 && item.count === 0 && <div className="w-full h-0.5 bg-gray-100 dark:bg-gray-800 rounded-t-sm mt-auto" />}
                                                        {item.income === 0 && item.count > 0 && <div className="w-full h-1 bg-gray-300 dark:bg-gray-600 rounded-t-sm mt-auto" title="Solo pedidos gratis o con 100% descuento" />}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="flex justify-between text-[10px] sm:text-xs text-gray-400 mt-2.5 px-1 font-medium">
                                            <span>12am</span>
                                            <span>6am</span>
                                            <span>12pm</span>
                                            <span>6pm</span>
                                            <span>11pm</span>
                                        </div>
                                    </div>
                                )
                            ) : (
                                data.dailySales.length === 0 ? (
                                    <div className="flex items-center justify-center h-48 sm:h-64">
                                        <p className="text-xs text-gray-400 font-medium">Sin ventas registradas en este periodo</p>
                                    </div>
                                ) : (
                                    <SalesChart dailySales={data.dailySales} prevDailySales={data.prevDailySales} />
                                )
                            )}
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 sm:p-6 shadow-card flex flex-col justify-between h-full border border-gray-100 dark:border-gray-700/50 hover:shadow-lg transition-all duration-200 lg:col-span-2 order-last lg:order-none">
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[20px] text-emerald-500">payments</span>
                                    <h2 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white">Métodos de Pago</h2>
                                </div>
                                <span className="text-xs font-semibold text-gray-400">
                                    {data.paymentMethods.length} {data.paymentMethods.length === 1 ? 'método' : 'métodos'}
                                </span>
                            </div>
                            <div className="w-full space-y-2.5 overflow-y-auto max-h-[280px] sm:max-h-[320px] pr-1">
                                {data.paymentMethods.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                                        <span className="material-symbols-outlined text-3xl mb-2 opacity-50">receipt_long</span>
                                        <p className="text-xs text-center font-medium">Sin datos para este periodo</p>
                                    </div>
                                )}
                                {data.paymentMethods.map((pm) => (
                                    <div key={pm.method} className="group relative bg-gray-50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-700/50 p-3 rounded-xl hover:border-blue-100 dark:hover:border-blue-900/30 hover:shadow-xs transition-all duration-200">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="flex items-center gap-2">
                                                <span className="size-2.5 rounded-full shadow-xs" style={{ backgroundColor: PAYMENT_COLORS[pm.method] || '#9ca3af' }} />
                                                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{pm.label}</span>
                                            </div>
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                                    {pm.percent.toFixed(1)}%
                                                </span>
                                                <span className="text-sm font-bold text-gray-900 dark:text-white">
                                                    {formatCurrency(pm.amount)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="w-full bg-gray-200/60 dark:bg-gray-700/60 h-1.5 rounded-full overflow-hidden flex">
                                            <div
                                                className="h-full rounded-full transition-all duration-500 ease-out"
                                                style={{
                                                    width: `${pm.percent}%`,
                                                    backgroundColor: PAYMENT_COLORS[pm.method] || '#9ca3af'
                                                }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/40 text-center">
                            Distribución neta por canales de recaudo
                        </p>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 sm:p-6 shadow-card flex flex-col justify-between h-full border border-gray-100 dark:border-gray-700/50 hover:shadow-lg transition-all duration-200 lg:col-span-3">
                        {isSingleDay ? (
                            /* WIDGET PARA 1 SOLO DÍA: RITMO OPERATIVO / TURNOS */
                            <>
                                <div>
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[20px] text-indigo-500">pace</span>
                                            <h2 className="text-sm xs:text-base sm:text-lg font-bold text-gray-900 dark:text-white">Ritmo del Día</h2>
                                            <InfoTooltip text="Desglose de tus ingresos y pedidos dividido en bloques de atención: Mañana, Tarde y Noche." />
                                        </div>
                                    </div>

                                    {/* Resumen analítico de la jornada */}
                                    <div className="grid grid-cols-2 divide-x divide-gray-200 dark:divide-gray-700/50 p-2.5 bg-gray-50/80 dark:bg-gray-700/20 rounded-xl border border-gray-100 dark:border-gray-700/40 mb-4 text-center">
                                        <div>
                                            <p className="text-[10px] sm:text-xs text-gray-400 font-medium">Horas Activas</p>
                                            <p className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate">
                                                {hourlyMetrics.activeHoursCount} de 24h
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] sm:text-xs text-gray-400 font-medium">Ticket Medio</p>
                                            <p className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">
                                                {data.ordersCount > 0 ? formatCurrencyCompact(Math.round(data.averageTicket)) : '—'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Desglose por franjas horarias */}
                                <div className="flex-1 flex flex-col justify-center space-y-3 py-1">
                                    {dayShifts.shifts.length === 0 || data.totalIncome === 0 ? (
                                        <div className="flex items-center justify-center py-10">
                                            <p className="text-xs text-gray-400 font-medium">Aún no hay actividad operativa en este día</p>
                                        </div>
                                    ) : (
                                        dayShifts.shifts.map((shift) => {
                                            const pct = data.totalIncome > 0 ? Math.round((shift.total / data.totalIncome) * 100) : 0;
                                            const isBest = dayShifts.bestShift?.label === shift.label && shift.total > 0;
                                            return (
                                                <div key={shift.label} className="p-2.5 rounded-xl bg-gray-50/70 dark:bg-gray-700/20 border border-gray-100 dark:border-gray-700/40">
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`p-1 rounded-lg ${shift.color}`}>
                                                                <span className="material-symbols-outlined text-[16px] block">{shift.icon}</span>
                                                            </div>
                                                            <div>
                                                                <span className="text-xs font-bold text-gray-800 dark:text-gray-200">{shift.label}</span>
                                                                <span className="text-[10px] text-gray-400 ml-1.5 font-medium">({shift.range})</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-baseline gap-2">
                                                            <span className="text-[10px] font-bold text-gray-400">{pct}%</span>
                                                            <span className="text-xs sm:text-sm font-extrabold text-gray-900 dark:text-white">
                                                                {formatCurrency(shift.total)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    {/* Barra de progreso */}
                                                    <div className="w-full bg-gray-200/70 dark:bg-gray-700 h-2 rounded-full overflow-hidden mb-1.5">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-500 ${
                                                                isBest
                                                                    ? 'bg-gradient-to-r from-amber-500 to-amber-400'
                                                                    : 'bg-gradient-to-r from-indigo-500 to-blue-500'
                                                            }`}
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                    <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
                                                        <span className="font-medium">{shift.orders} {shift.orders === 1 ? 'pedido' : 'pedidos'}</span>
                                                        {shift.orders > 0 ? (
                                                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                                                                Ticket: <span className="font-extrabold text-blue-600 dark:text-blue-400">{formatCurrency(Math.round(shift.total / shift.orders))}</span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-[11px] text-gray-400">Ticket: —</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>

                                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-3 pt-2 border-t border-gray-100 dark:border-gray-700/40 text-center">
                                    Desempeño por franjas de atención durante la jornada
                                </p>
                            </>
                        ) : (
                            /* WIDGET PARA RANGO DE VARIOS DÍAS: VENTAS POR DÍA */
                            <>
                                <div>
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[20px] text-indigo-500">calendar_view_week</span>
                                            <h2 className="text-sm xs:text-base sm:text-lg font-bold text-gray-900 dark:text-white">Ventas Acumuladas por Día</h2>
                                            <InfoTooltip text={
                                                weekdaySales.isChronological
                                                    ? 'Desempeño diario en orden cronológico hasta el último día del período.'
                                                    : 'Acumulado histórico de ingresos según el día de la semana (Lunes a Domingo) durante este período.'
                                            } />
                                        </div>
                                    </div>

                                    {/* Resumen analítico semanal */}
                                    <div className="grid grid-cols-3 gap-2 p-2.5 bg-gray-50/80 dark:bg-gray-700/20 rounded-xl border border-gray-100 dark:border-gray-700/40 mb-4 text-center">
                                        <div>
                                            <p className="text-[10px] sm:text-xs text-gray-400 font-medium">Día Récord</p>
                                            <p className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate">
                                                {weekdaySales.bestDay ? weekdaySales.bestDay.fullName : '—'}
                                            </p>
                                        </div>
                                        <div className="border-x border-gray-200 dark:border-gray-700/50">
                                            <p className="text-[10px] sm:text-xs text-gray-400 font-medium">Venta Récord</p>
                                            <p className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">
                                                {weekdaySales.bestDay ? formatCurrencyCompact(weekdaySales.bestDay.total) : '—'}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] sm:text-xs text-gray-400 font-medium">Total Acumulado</p>
                                            <p className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white">
                                                {formatCurrencyCompact(weekdaySales.totalSum)}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Gráfico de barras */}
                                <div className="flex-1 flex flex-col justify-end pt-2">
                                    <div className="w-full h-36 xs:h-44 sm:h-52 flex items-end justify-between gap-1.5 sm:gap-3 px-1 relative">
                                        {weekdaySales.days.map((item) => {
                                            const isBest = weekdaySales.bestDay?.key === item.key && item.total > 0;
                                            const pct = weekdaySales.totalSum > 0 ? Math.round((item.total / weekdaySales.totalSum) * 100) : 0;
                                            const barHeight = weekdaySales.maxVal > 0 ? (item.total / weekdaySales.maxVal) * 100 : 0;

                                            return (
                                                <div
                                                    key={item.key || item.dayName}
                                                    className="group relative w-full flex flex-col justify-end items-center h-full cursor-pointer"
                                                >
                                                    {/* Hover highlight column */}
                                                    <div className="absolute inset-0 bg-indigo-50/50 dark:bg-indigo-900/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-sm pointer-events-none" />

                                                    {/* Tooltip moderno interactivo */}
                                                    <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-all whitespace-nowrap z-30 pointer-events-none scale-95 group-hover:scale-100 duration-150">
                                                        <div className="bg-gray-900/95 dark:bg-gray-800/95 backdrop-blur-sm border border-gray-700 text-white text-[10px] xs:text-xs font-bold py-1.5 px-2.5 rounded-xl shadow-xl flex flex-col items-center">
                                                            <span className="text-gray-300 dark:text-gray-400 font-medium text-[9px] xs:text-[10px] mb-0.5">
                                                                {item.fullName}{item.formattedDate ? ` (${item.formattedDate})` : ''} {isBest ? '⭐ DÍA RÉCORD' : ''}{item.isToday ? ' (HOY)' : ''}
                                                            </span>
                                                            <span className="text-sm font-extrabold text-blue-400">{formatCurrency(item.total)}</span>
                                                            <span className="text-[10px] text-gray-300 mt-0.5">{pct}% del periodo{item.count > 1 ? ` (${item.count} días)` : ''}</span>
                                                        </div>
                                                        <div className="size-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[4px] border-t-gray-900 dark:border-t-white mx-auto"></div>
                                                    </div>

                                                    {/* Indicador sobre la barra de día récord */}
                                                    {isBest && (
                                                        <div className="mb-1 text-amber-500 animate-pulse">
                                                            <span className="material-symbols-outlined text-[13px] block">star</span>
                                                        </div>
                                                    )}

                                                    {/* Barra */}
                                                    <div
                                                        className={`w-full rounded-t-md transition-all duration-300 relative z-0 ${
                                                            isBest
                                                                ? 'bg-gradient-to-t from-amber-500 to-amber-300 group-hover:to-amber-200 shadow-xs'
                                                                : item.total > 0
                                                                ? 'bg-gradient-to-t from-indigo-600 to-blue-400 dark:from-indigo-600 dark:to-blue-400 group-hover:to-blue-300 dark:group-hover:to-blue-300'
                                                                : 'bg-transparent'
                                                        }`}
                                                        style={{ height: `${barHeight}%`, minHeight: item.total > 0 ? '6px' : '0px' }}
                                                    />
                                                    {item.total === 0 && <div className="w-full h-0.5 bg-gray-100 dark:bg-gray-800 rounded-t-sm mt-auto" />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="flex justify-between text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-2 px-1 font-semibold">
                                        {weekdaySales.days.map((d) => (
                                            <span key={d.key || d.dayName} className={weekdaySales.bestDay?.key === d.key ? 'text-amber-600 dark:text-amber-400 font-bold' : ''}>
                                                {d.dayName}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <p className="text-xs sm:text-[13px] font-semibold text-gray-600 dark:text-gray-300 mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700/50 text-center">
                                    {weekdaySales.isChronological
                                        ? 'Ventas diarias en orden cronológico en el período seleccionado'
                                        : 'Distribución acumulada de lunes a domingo en el período seleccionado'}
                                </p>
                            </>
                        )}
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 sm:p-6 shadow-card flex flex-col justify-between h-full border border-gray-100 dark:border-gray-700/50 hover:shadow-lg transition-all duration-200 lg:col-span-3">
                        <div>
                            <div className="flex flex-col gap-2 mb-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[20px] text-amber-500">social_leaderboard</span>
                                        <h2 className="text-sm xs:text-base sm:text-lg font-bold text-gray-900 dark:text-white">Top Productos</h2>
                                        {isNegocio10001 && (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={handlePrintTopProducts}
                                                    disabled={isPrintingTop || data.topProducts.length === 0}
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                    aria-label="Imprimir top productos"
                                                    title="Imprimir"
                                                    tabIndex={0}
                                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handlePrintTopProducts(); }}
                                                >
                                                    <span className="material-symbols-outlined text-xl">{isPrintingTop ? 'hourglass_top' : 'print'}</span>
                                                </button>
                                                <button
                                                    onClick={handleDownloadTopPDF}
                                                    disabled={data.topProducts.length === 0}
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                    aria-label="Descargar PDF"
                                                    title="Descargar PDF"
                                                    tabIndex={0}
                                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleDownloadTopPDF(); }}
                                                >
                                                    <span className="material-symbols-outlined text-xl">picture_as_pdf</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-[10px] xs:text-xs">
                                        {isNegocio10001 ? (
                                            <>
                                                <button
                                                    onClick={() => setTopTab('income')}
                                                    className={`px-3 py-1.5 font-bold transition-colors ${topTab === 'income' ? 'bg-blue-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                                                >
                                                    Ingreso
                                                </button>
                                                <button
                                                    onClick={() => setTopTab('profit')}
                                                    className={`px-3 py-1.5 font-bold transition-colors border-l border-gray-200 dark:border-gray-700 ${topTab === 'profit' ? 'bg-emerald-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                                                >
                                                    Ganancia
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => setTopTab('profit')}
                                                    className={`px-3 py-1.5 font-bold transition-colors ${topTab === 'profit' ? 'bg-emerald-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                                                >
                                                    Ganancia
                                                </button>
                                                <button
                                                    onClick={() => setTopTab('income')}
                                                    className={`px-3 py-1.5 font-bold transition-colors border-l border-gray-200 dark:border-gray-700 ${topTab === 'income' ? 'bg-blue-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                                                >
                                                    Ingreso
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-2.5 rounded-lg border border-gray-100 dark:border-gray-700/50">
                                    {topTab === 'profit'
                                        ? '💰 Muestra el dinero libre que te queda de cada producto vendido tras descontar costo de compra.'
                                        : '🏦 Muestra los productos que más ventas brutas generan en el periodo.'}
                                </p>
                            </div>
                            {data.topProducts.length === 0 ? (
                                <p className="text-xs text-gray-400 py-8 text-center font-medium">Sin ventas en este periodo</p>
                            ) : (() => {
                                const sorted = [...data.topProducts]
                                    .sort((a, b) => topTab === 'profit' ? b.profit - a.profit : b.income - a.income)
                                    .slice(0, isNegocio10001 ? 50 : 10);
                                return (
                                    <div className="overflow-x-auto -mx-3 xs:-mx-4 sm:mx-0 px-3 xs:px-4 sm:px-0">
                                        <div className="overflow-y-auto max-h-[300px] sm:max-h-[340px] pr-1">
                                            <table className="w-full text-left text-[10px] xs:text-xs sm:text-sm text-gray-600 dark:text-gray-400 min-w-[340px]">
                                                <thead>
                                                    <tr className="border-b border-gray-100 dark:border-gray-700">
                                                        <th className="hidden sm:table-cell pb-2 font-medium text-gray-400 w-6">#</th>
                                                        <th className="pb-2 font-medium text-gray-400">Producto</th>
                                                        <th className="pb-2 font-medium text-gray-400 text-center">Qty</th>
                                                        <th className="pb-2 font-medium text-gray-400 text-right">{topTab === 'profit' ? 'Ganancia' : 'Ingreso'}</th>
                                                        <th className="pb-2 font-medium text-gray-400 text-right">Margen</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                                                    {sorted.map((product, index) => {
                                                        const val = topTab === 'profit' ? product.profit : product.income;
                                                        const margin = product.cost > 0 && product.unitPrice > 0
                                                            ? ((product.unitPrice - product.cost) / product.unitPrice) * 100
                                                            : null;
                                                        const marginColor = margin === null ? 'text-gray-400'
                                                            : margin >= 40 ? 'text-emerald-600 dark:text-emerald-400'
                                                            : margin >= 25 ? 'text-amber-600 dark:text-amber-400'
                                                            : 'text-rose-600 dark:text-rose-400';
                                                        return (
                                                            <tr key={product.name} className="group hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                                                                <td className="hidden sm:table-cell py-2.5 w-6">
                                                                    <span className="text-[10px] xs:text-xs font-bold text-gray-300 dark:text-gray-600">{index + 1}</span>
                                                                </td>
                                                                <td className="py-2.5">
                                                                    <div className="flex items-center gap-2 xs:gap-3">
                                                                        {product.image ? (
                                                                            <img alt={product.name} className="hidden sm:block size-7 xs:w-8 xs:h-8 rounded-lg object-cover shrink-0 border border-gray-100 dark:border-gray-700" src={product.image} />
                                                                        ) : (
                                                                            <div className="hidden sm:flex size-7 xs:w-8 xs:h-8 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 items-center justify-center shrink-0">
                                                                                <span className="material-symbols-outlined text-gray-400 text-[14px]">package_2</span>
                                                                            </div>
                                                                        )}
                                                                        <span className="text-xs xs:text-sm font-medium text-gray-900 dark:text-white truncate max-w-[130px] xs:max-w-[160px] sm:max-w-[180px]">{product.name}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="py-2.5 text-center text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">
                                                                    {Number(product.sold.toFixed(0))}
                                                                </td>
                                                                <td className="py-2.5 text-right whitespace-nowrap">
                                                                    <span className="font-bold text-gray-900 dark:text-white px-2 py-1 rounded bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">{formatCurrency(val)}</span>
                                                                </td>
                                                                <td className="py-2.5 text-right pl-2 w-12 sm:w-16">
                                                                    <span className={`font-bold ${marginColor}`}>
                                                                        {margin !== null ? `${margin.toFixed(0)}%` : '—'}
                                                                    </span>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </section>









            </div>



        </div>

        {/* Modal: Desglose de categoría de gastos */}
        {expenseCatModal !== null && (() => {
            const isWaste = expenseCatModal === 'MERMAS';
            const fmtWasteDate = (raw: string): string => {
                if (!raw) return '';
                try {
                    if (!raw.includes('T') && raw.includes('-')) {
                        const [y, m, d] = raw.split('-');
                        const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
                        return `${parseInt(d, 10)} ${meses[parseInt(m, 10) - 1]} ${y}`;
                    }
                    const d = new Date(raw);
                    const datePart = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: timezone }).format(d).replace(/ de /g, ' ');
                    const timePart = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone }).format(d);
                    return `${datePart} · ${timePart}`;
                } catch { return raw; }
            };
            const isPayroll = expenseCatModal.toUpperCase().trim() === 'SUELDOS' || expenseCatModal.toUpperCase().trim() === 'SUELDO';
            const modalItems = isWaste
                ? data.wasteItems.map(w => ({
                    label: w.product_name || w.description || 'Sin descripción',
                    sub: w.reason || w.description || '',
                    supplier: null as string | null,
                    amount: w.amount,
                    date: fmtWasteDate(w.date),
                }))
                : data.otherExpensesList
                    .filter(e => (e.description || 'Otro gasto').toLowerCase().trim() === expenseCatModal.toLowerCase().trim())
                    .map(e => ({
                        label: e.note || 'Sin descripción',
                        sub: '',
                        supplier: (!isPayroll && e.supplier) ? e.supplier : null,
                        amount: e.amount,
                        date: fmtWasteDate(e.date),
                    }));
            const modalTotal = modalItems.reduce((s, x) => s + x.amount, 0);
            const accentColor = isWaste ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400';
            return (
                <div
                    className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
                    onClick={() => setExpenseCatModal(null)}
                >
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
                    <div
                        className="relative bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[80vh] flex flex-col animate-[fadeIn_0.2s_ease-out]"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 p-4 sm:p-5 border-b border-gray-100 dark:border-gray-700 shrink-0">
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Desglose</p>
                                <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">{expenseCatModal}</h3>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="text-[10px] text-gray-400 font-medium">Total</p>
                                <p className={`text-lg font-extrabold ${accentColor}`}>{formatCurrency(modalTotal)}</p>
                            </div>
                            <button onClick={() => setExpenseCatModal(null)} className="ml-2 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                <span className="material-symbols-outlined text-[20px]">close</span>
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-2">
                            {modalItems.length === 0 ? (
                                <p className="text-sm text-gray-400 text-center py-6">Sin registros en este periodo</p>
                            ) : modalItems.map((item, idx) => (
                                <div key={`item-${idx}`} className="flex items-start justify-between gap-3 py-2.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{item.label || '—'}</p>
                                        {item.supplier && (
                                            <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400 mt-0.5 truncate flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[13px] shrink-0">storefront</span>
                                                <span>{item.supplier}</span>
                                            </p>
                                        )}
                                        {item.sub && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{item.sub}</p>}
                                        {item.date && <p className="text-[11px] text-gray-400 mt-0.5">{item.date}</p>}
                                    </div>
                                    <span className={`text-sm font-bold shrink-0 ${accentColor}`}>{formatCurrency(item.amount)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            );
        })()}
        </div>

    );
};
