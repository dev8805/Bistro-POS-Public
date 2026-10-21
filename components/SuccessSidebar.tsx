import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { TransactionDetails, ReceiptData } from '../types';
import { formatCurrency } from '../lib/formatters';
import { consolidateReceiptItems } from '../lib/receiptUtils';
import { shareReceiptPDF, downloadReceiptPDF, sendReceiptByEmailDirect, downloadReceiptAsPDF, shareThermalReceiptPDF } from '../lib/shareReceiptPDF';
import { EmailReceiptModal } from './EmailReceiptModal';
import { PrinterSplitButton } from './PrinterSplitButton';
import ComandaTargetGrid, { ComandaTarget } from './ComandaTargetGrid';
import ComandaLabelModal, { ComandaLabelSelection } from './ComandaLabelModal';
import PrinterSettingsPanel from './PrinterSettingsPanel';
import { useToast } from '../context/ToastContext';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { reconnectPrinter, printKitchenCommandDirect, printReceiptDirect, setDefaultPrinter } from '../lib/thermalPrinterService';
import { sendKitchenCommand } from '../lib/kitchenCommandService';
import { useAuth } from '../context/AuthContext';
import { useAvailablePrinters } from '../hooks/useKitchenPrinter';
import { usePrinters } from '../hooks/usePrinters';

interface SuccessSidebarProps {
    transaction: TransactionDetails;
    onStartNewSale: () => void;
    onBackToTables: () => void;
    backLabel?: string;
    receiptData?: ReceiptData | null;
    isCatalogMode?: boolean;
    /** Etiquetas ya elegidas desde el header del carrito. Si están presentes,
        se envían con la comanda sin abrir el modal previo. */
    preselectedComandaLabels?: { locator?: string; table?: string; takeaway?: string };
}

export const SuccessSidebar: React.FC<SuccessSidebarProps> = ({ transaction, onStartNewSale, onBackToTables, backLabel = 'Volver a Mesas', receiptData, isCatalogMode = false, preselectedComandaLabels }) => {
    const isCredit = transaction.type === 'credit';
    const [isSharing, setIsSharing] = useState(false);
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [showShareMenu, setShowShareMenu] = useState(false);
    const { showToast } = useToast();
    const { receiptPaperWidth, isComandaLabelShortcutEnabled } = useBusinessSettings();
    const { profile } = useAuth();
    const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);
    // Impresoras locales registradas + estado por nombre + predeterminada de comanda.
    const { printers, defaultComanda, statusFor } = usePrinters();
    // Tarjeta de comanda en curso (id de impresora local o userId remoto).
    const [busyTargetId, setBusyTargetId] = useState<string | null>(null);
    // Panel lateral de impresora (conectar/registrar). Se abre sobre el panel de
    // éxito y al cerrarlo se vuelve aquí, sin salir de la venta.
    const [showPrinterPanel, setShowPrinterPanel] = useState(false);
    // Modal previo de etiquetado de comanda (Localizador / Mesa / Para llevar).
    // Al tocar una tarjeta del ComandaTargetGrid guardamos el destino elegido y
    // abrimos el modal; el envío real ocurre en handleConfirmLabels.
    const [showLabelModal, setShowLabelModal] = useState(false);
    const [pendingTarget, setPendingTarget] = useState<{ kind: 'local' | 'remote'; id: string; label: string } | null>(null);
    const availablePrinters = useAvailablePrinters();
    // Gate de carga: no mostramos el panel hasta que las señales asíncronas
    // (reconexión de impresora local + presence) se asienten. Se revela una
    // sola vez con el estado final, evitando saltos. Listo = entró una
    // impresora por presence O pasaron 800 ms desde el montaje.
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        // Reconecta las impresoras registradas al montar para que aparezcan
        // como conectadas (su estado lo refleja usePrinters vía statusFor).
        reconnectPrinter();
    }, []);

    useEffect(() => {
        if (availablePrinters.length > 0) {
            setIsReady(true);
            return;
        }
        const timer = setTimeout(() => setIsReady(true), 800);
        return () => clearTimeout(timer);
    }, [availablePrinters.length]);

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    const handleShare = async () => {
        if (!receiptData || isSharing) return;

        setIsSharing(true);
        try {
            await shareReceiptPDF(receiptData);
            if (!isMobile) {
                showToast('Imagen copiada al portapapeles', 'success');
            }
        } catch (error) {
            console.error('Error sharing receipt:', error);
        } finally {
            setIsSharing(false);
        }
    };

    const handleShareThermal = async () => {
        if (!receiptData || isSharing) return;

        setIsSharing(true);
        try {
            await shareThermalReceiptPDF(receiptData, receiptPaperWidth);
            if (!isMobile) {
                showToast('Ticket generado', 'success');
            }
        } catch (error) {
            console.error('Error sharing thermal receipt:', error);
        } finally {
            setIsSharing(false);
        }
    };

    const handlePrint = async () => {
        if (!receiptData) return;

        try {
            await downloadReceiptPDF(receiptData);
        } catch (error) {
            console.error('Error downloading receipt:', error);
        }
    };

    const handlePrintThermalTicket = async (targetPrinter: string) => {
        if (!receiptData) return;
        // Imprime directamente en la impresora elegida (predeterminada TICKET o la
        // seleccionada por la flecha ▼), respetando el destino por rol (Req 7.1, 8.1, 9.1).
        try {
            const ok = await printReceiptDirect(receiptData, receiptPaperWidth, targetPrinter);
            showToast(ok ? 'Ticket impreso' : 'No se pudo imprimir el ticket', ok ? 'success' : 'error');
        } catch (error) {
            console.error('Error printing thermal receipt:', error);
            showToast('No se pudo imprimir el ticket', 'error');
        }
    };

    // Abre el panel lateral de impresora para conectar/registrar (Req 15).
    // Sirve tanto para ticket como para comanda; al cerrar se vuelve a la venta.
    const handleOpenPrinterPanel = () => {
        setShowPrinterPanel(true);
    };

    const handleEmailClick = () => {
        if (!receiptData) return;
        setShowEmailModal(true);
    };

    const handleSendEmail = async (email: string): Promise<boolean> => {
        if (!receiptData) return false;
        return await sendReceiptByEmailDirect(receiptData, email);
    };

    const handleShareText = async () => {
        const lines = [
            `🧾 *${isCredit ? 'Crédito Registrado' : 'Recibo de Venta'}*`,
            `Cliente: ${transaction.customer}`,
            `Total: $${formatCurrency(transaction.amount)}`,
        ];
        if (transaction.note) lines.push(`Nota: ${transaction.note}`);
        if (!isCredit) {
            lines.push(`Método: ${transaction.method}`);
            lines.push(`Fecha: ${transaction.date}`);
            if (transaction.change && transaction.change > 0) {
                lines.push(`Cambio: $${formatCurrency(transaction.change)}`);
            }
        }
        if (receiptData) {
            lines.push('', '📋 *Detalle:*');
            consolidateReceiptItems(receiptData.items).forEach(item => {
                lines.push(`  • ${item.name} x${item.quantity} — $${formatCurrency(item.total)}`);
            });
        }
        const text = lines.join('\n');
        window.location.href = `whatsapp://send?text=${encodeURIComponent(text)}`;
        setShowShareMenu(false);
    };

    const handleShareReceipt = async () => {
        setShowShareMenu(false);
        await handleShare();
    };

    // Arma el payload de comanda a partir del recibo. Idéntico al usado por la
    // impresión local y el envío remoto (DRY). Conserva la estructura original
    // del sidebar (filtro de modificadores + agrupación de add-ons).
    const buildCommandData = () => {
        if (!receiptData) return null;
        return {
            orderNumber: receiptData.orderNumber,
            displayNumber: receiptData.displayNumber,
            customerName: receiptData.customerName,
            items: receiptData.items.filter(it => !it.isModifier).map(item => ({
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                notes: item.notes,
                // Agrupar add-ons como etiquetas del padre (junto a las etiquetas existentes)
                cookingTerm: [item.cookingTerm, ...(item.modifiers || [])].filter(Boolean).join(', '),
                removedIngredients: item.removedIngredients,
            })),
            date: receiptData.date,
            sellerName: receiptData.sellerName,
        };
    };

    // Ejecuta el envío real con la selección ya definida. Se llama desde:
    // 1) handleConfirmLabels (modal previo).
    // 2) handlePrintCommandLocal/handleSendKitchenCommand cuando el cajero ya
    //    eligió etiquetas desde el header del carrito y no hay que abrir modal.
    const executeCommand = async (
        target: { kind: 'local' | 'remote'; id: string; label: string },
        selection: { locator?: string; table?: string; takeaway?: string }
    ) => {
        const baseCommand = buildCommandData();
        if (!baseCommand) return;
        const commandData = {
            ...baseCommand,
            locatorLabel: selection.locator,
            tableLabel: selection.table,
            takeawayLabel: selection.takeaway,
        };

        setBusyTargetId(target.id);
        try {
            if (target.kind === 'local') {
                const ok = await printKitchenCommandDirect(commandData, receiptPaperWidth, target.id);
                if (ok) {
                    setDefaultPrinter('COMANDA', target.id);
                    showToast('Comanda impresa', 'success');
                } else {
                    showToast('No se pudo imprimir la comanda', 'error');
                }
            } else {
                if (!profile?.business_id) {
                    showToast('Error al enviar comanda', 'error');
                    return;
                }
                const success = await sendKitchenCommand(profile.business_id, target.id, commandData);
                showToast(success ? 'Comanda enviada' : 'Error al enviar comanda', success ? 'success' : 'error');
            }
        } catch {
            showToast(target.kind === 'local' ? 'No se pudo imprimir la comanda' : 'Error al enviar comanda', 'error');
        } finally {
            setBusyTargetId(null);
        }
    };

    const hasPreselectedLabels = Boolean(
        preselectedComandaLabels?.locator || preselectedComandaLabels?.table || preselectedComandaLabels?.takeaway
    );

    // Tarjetas del grid: si el cajero YA eligió etiquetas desde el header del
    // carrito, se envía directo (sin modal, para evitar redundancia). Si no,
    // se abre el modal previo como fallback.
    const handlePrintCommandLocal = async (printerName: string) => {
        if (busyTargetId) return;
        if (!isComandaLabelShortcutEnabled) {
            await executeCommand({ kind: 'local', id: printerName, label: printerName }, {});
            return;
        }
        if (hasPreselectedLabels && preselectedComandaLabels) {
            await executeCommand({ kind: 'local', id: printerName, label: printerName }, preselectedComandaLabels);
            return;
        }
        setPendingTarget({ kind: 'local', id: printerName, label: printerName });
        setShowLabelModal(true);
    };

    const handleSendKitchenCommand = async (targetUserId: string) => {
        if (busyTargetId) return;
        const remote = availablePrinters.find(p => p.userId === targetUserId);
        const target = { kind: 'remote' as const, id: targetUserId, label: remote?.userName || 'Cocina' };
        if (!isComandaLabelShortcutEnabled) {
            await executeCommand(target, {});
            return;
        }
        if (hasPreselectedLabels && preselectedComandaLabels) {
            await executeCommand(target, preselectedComandaLabels);
            return;
        }
        setPendingTarget(target);
        setShowLabelModal(true);
    };

    // Confirmación del modal previo: llama a executeCommand con el destino
    // pendiente y cierra el modal.
    const handleConfirmLabels = async (selection: ComandaLabelSelection) => {
        if (!pendingTarget) return;
        await executeCommand(pendingTarget, selection);
        setShowLabelModal(false);
        setPendingTarget(null);
    };

    const handleCloseLabelModal = () => {
        if (busyTargetId) return;
        setShowLabelModal(false);
        setPendingTarget(null);
    };

    // Destinos del grid de comanda: impresoras locales registradas + dispositivos
    // remotos por presence (Req 16.1, 16.2).
    const comandaTargets = useMemo<ComandaTarget[]>(() => {
        const locals: ComandaTarget[] = printers.map(p => ({
            kind: 'local',
            id: p.name,
            label: p.name,
            status: statusFor(p.name),
            isDefault: p.name === defaultComanda,
        }));
        const remotes: ComandaTarget[] = availablePrinters.map(rp => ({
            kind: 'remote',
            id: rp.userId,
            label: rp.userName,
            subLabel: rp.role,
            status: 'connected',
        }));
        return [...locals, ...remotes];
    }, [printers, statusFor, defaultComanda, availablePrinters]);

    return (
        <>
            {/* Overlay desktop: portal a body, cubre todo menos el área del aside (400px der.).
                Se oculta mientras el panel de impresora está abierto, porque ese panel
                ya trae su propio backdrop (evita dos fondos oscuros encimados). */}
            {!showPrinterPanel && typeof document !== 'undefined' && createPortal(
                <div
                    data-success-overlay="true"
                    className="hidden lg:block fixed top-0 bottom-0 left-0 bg-black/50 backdrop-blur-[1px] animate-[fadeIn_0.2s_ease-out]"
                    style={{ zIndex: 70, right: '400px' }}
                    aria-hidden="true"
                />,
                document.body
            )}
            <div className="flex flex-col flex-1 min-h-0 animate-[fadeIn_0.2s_ease-out] bg-surface-light dark:bg-surface-dark h-full justify-start items-center p-4 pt-12 overflow-y-auto">
                {!isReady ? (
                    <div className="w-full flex-1 flex items-center justify-center">
                        <span className="material-symbols-outlined text-4xl text-gray-300 dark:text-gray-600 animate-spin">progress_activity</span>
                    </div>
                ) : (
                <div className="w-full max-w-sm flex flex-col items-center text-center animate-[fadeIn_0.2s_ease-out]">

                    {/* Icon */}
                    <div className={`size-16 rounded-full flex items-center justify-center mb-4 ring-4 ring-offset-2 dark:ring-offset-surface-dark
                        ${isCredit
                            ? 'bg-blue-50 text-blue-600 ring-blue-100 dark:ring-blue-900/30'
                            : 'bg-green-50 text-green-600 ring-green-100 dark:ring-green-900/30'}`}>
                        <span className="material-symbols-outlined text-3xl">
                            {isCredit ? 'verified' : 'check'}
                        </span>
                    </div>

                    <h2 className="text-xl font-black text-text-main dark:text-white mb-1 tracking-tight">
                        {isCredit ? 'Crédito Registrado' : '¡Venta Exitosa!'}
                    </h2>
                    <p className="text-text-secondary text-xs mb-5 font-medium">
                        {transaction.date} • {transaction.customer}
                    </p>

                    {/* Amount */}
                    <div className="mb-4 w-full bg-gray-50 dark:bg-black/20 rounded-2xl p-4 border border-dashed border-gray-200 dark:border-gray-700">
                        <div className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-1">Total</div>
                        <span className="text-3xl font-black text-text-main dark:text-white tracking-tighter block">
                            ${formatCurrency(transaction.amount)}
                        </span>
                        {!isCredit && transaction.change !== undefined && transaction.change > 0 && (
                            <div className="text-sm text-text-secondary mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 font-medium flex justify-between items-center px-2">
                                <span>Cambio</span>
                                <span className="text-green-600 dark:text-green-400 font-bold">${formatCurrency(transaction.change)}</span>
                            </div>
                        )}
                    </div>

                    {/* Credit Note */}
                    {isCredit && transaction.note && (
                        <div className="w-full bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 border border-blue-100 dark:border-blue-800/30 mb-4">
                            <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">Nota</p>
                            <p className="text-sm text-blue-900 dark:text-blue-200 font-medium">{transaction.note}</p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="grid grid-cols-3 gap-2 w-full mb-4">
                        <button
                            onClick={() => {
                                if (!receiptData) return;
                                if (!receiptData.orderNumber || !receiptData.orderId) {
                                    showToast('No se pudo generar el enlace del recibo', 'warning');
                                    return;
                                }
                                
                                let phoneParam = '';
                                if (receiptData.customerPhone) {
                                    const rawPhone = receiptData.customerPhone.replace(/\D/g, '');
                                    const phone = rawPhone.startsWith('57') ? rawPhone : `57${rawPhone}`;
                                    phoneParam = `phone=${phone}&`;
                                }

                                const hash = receiptData.orderId.substring(0, 6).toLowerCase();
                                const receiptUrl = `${window.location.origin}/t/${receiptData.orderNumber}-${hash}`;
                                
                                const cleanCustomerName = receiptData.customerName === 'Consumidor Final' ? 'cliente' : (receiptData.customerName || 'cliente');
                                let message = isCredit 
                                    ? `Hola ${cleanCustomerName}, hemos registrado tu crédito en *${receiptData.businessName}*. ✍️\n\n`
                                    : `Hola ${cleanCustomerName}, gracias por tu compra en *${receiptData.businessName}*. 🧾\n\n`;
                                
                                message += `Puedes ver y descargar tu comprobante aquí:\n${receiptUrl}`;
                                
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
                            }}
                            disabled={!receiptData}
                            className="h-[68px] flex flex-col items-center justify-center p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-green-500/50 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all gap-1.5 group disabled:opacity-50 disabled:cursor-not-allowed"
                            title={!receiptData ? "Generando recibo..." : ""}
                        >
                            <svg className="size-6 text-text-secondary group-hover:text-green-500 transition-colors" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/></svg>
                            <span className="text-[11px] font-bold text-text-main dark:text-white">WhatsApp</span>
                        </button>
                        {isMobile ? (
                            <div className="relative">
                                <button
                                    onClick={() => setShowShareMenu(!showShareMenu)}
                                    disabled={!receiptData || isSharing}
                                    className="w-full h-[68px] flex flex-col items-center justify-center p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-green-500/50 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all gap-1.5 group disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span className="material-symbols-outlined text-2xl text-text-secondary group-hover:text-green-600 transition-colors">share</span>
                                    <span className="text-[11px] font-bold text-text-main dark:text-white">
                                        {isSharing ? 'Espere...' : 'Compartir'}
                                    </span>
                                </button>
                                {showShareMenu && (
                                    <div className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden z-10 animate-[scaleIn_0.15s_ease-out]">
                                        {isCredit && (
                                            <button
                                                onClick={handleShareText}
                                                className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700"
                                            >
                                                <span className="material-symbols-outlined text-base text-green-600">sms</span>
                                                <span className="text-sm font-semibold text-text-main dark:text-white">Texto</span>
                                            </button>
                                        )}
                                        <button
                                            onClick={() => { setShowShareMenu(false); handleShareThermal(); }}
                                            disabled={!receiptData || isSharing}
                                            className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors border-b border-gray-100 dark:border-gray-700 disabled:opacity-50"
                                        >
                                            <span className="material-symbols-outlined text-base text-green-600">receipt_long</span>
                                            <span className="text-sm font-semibold text-text-main dark:text-white">Ticket ({receiptPaperWidth})</span>
                                        </button>
                                        <button
                                            onClick={handleShareReceipt}
                                            disabled={!receiptData || isSharing}
                                            className="w-full flex items-center gap-2.5 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                                        >
                                            <span className="material-symbols-outlined text-base text-green-600">description</span>
                                            <span className="text-sm font-semibold text-text-main dark:text-white">Factura PDF</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <button
                                onClick={async () => {
                                    if (!receiptData || isDownloadingPDF) return;
                                    setIsDownloadingPDF(true);
                                    try {
                                        await downloadReceiptAsPDF(receiptData);
                                        showToast('PDF descargado', 'success');
                                    } catch (error) {
                                        console.error('Error downloading PDF:', error);
                                    } finally {
                                        setIsDownloadingPDF(false);
                                    }
                                }}
                                disabled={!receiptData || isDownloadingPDF}
                                className="h-[68px] flex flex-col items-center justify-center p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-purple-500/50 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all gap-1.5 group disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <span className="material-symbols-outlined text-2xl text-text-secondary group-hover:text-purple-600 transition-colors">picture_as_pdf</span>
                                <span className="text-[11px] font-bold text-text-main dark:text-white">
                                    {isDownloadingPDF ? 'Espere...' : 'PDF'}
                                </span>
                            </button>
                        )}
                        <button
                            onClick={handleEmailClick}
                            disabled={!receiptData}
                            className="col-span-1 h-[68px] flex flex-col items-center justify-center p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-primary/50 hover:bg-primary/5 transition-all gap-1.5 group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <span className="material-symbols-outlined text-2xl text-text-secondary group-hover:text-primary">email</span>
                            <span className="text-[11px] font-bold text-text-main dark:text-white">Correo</span>
                        </button>
                    </div>

                    {/* Enviar comanda a (solo modo Catálogo) — grid unificado de
                        destinos locales (impresoras) y remotos (dispositivos presence).
                        Si no hay destinos, el grid ofrece "Conectar impresora" (Req 16.9). */}
                    {/* Enviar comanda a (solo modo Catálogo) — solo se muestra si hay
                        algún destino. Sin destinos, el único "Conectar impresora" lo
                        ofrece el botón de ticket de abajo (evita botón duplicado). */}
                    {isCatalogMode && comandaTargets.length > 0 && (
                        <div className="w-full mb-2">
                            <ComandaTargetGrid
                                targets={comandaTargets}
                                onPrintLocal={handlePrintCommandLocal}
                                onSendRemote={handleSendKitchenCommand}
                                onRequestConnect={handleOpenPrinterPanel}
                                busyTargetId={busyTargetId}
                            />
                        </div>
                    )}

                    {/* Imprimir Ticket (Botón_Dividido rol TICKET). Al "Conectar
                        impresora" o si la predeterminada no está conectada, abre el
                        panel lateral de impresora (Req 15). */}
                    <div className="relative w-full mb-4">
                        <PrinterSplitButton
                            label="Imprimir Ticket"
                            icon="print"
                            onPrint={handlePrintThermalTicket}
                            onRequestConnect={handleOpenPrinterPanel}
                            disabled={!receiptData}
                        />
                    </div>

                    {/* Nueva Venta */}
                    <button
                        onClick={onStartNewSale}
                        className="w-full h-14 rounded-2xl bg-primary text-[#102218] font-bold text-lg shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:-translate-y-0.5 transition-all active:scale-[0.98] flex items-center justify-center gap-2 group"
                    >
                        <span className="material-symbols-outlined group-hover:rotate-90 transition-transform">add</span>
                        Nueva Venta
                    </button>
                </div>
                )}
            </div>

            <EmailReceiptModal
                isOpen={showEmailModal}
                onClose={() => setShowEmailModal(false)}
                onSend={handleSendEmail}
            />

            <PrinterSettingsPanel
                isOpen={showPrinterPanel}
                onClose={() => setShowPrinterPanel(false)}
                coverSidebar
            />

            <ComandaLabelModal
                isOpen={showLabelModal}
                targetLabel={pendingTarget?.label}
                onClose={handleCloseLabelModal}
                onConfirm={handleConfirmLabels}
                isSending={busyTargetId !== null}
            />
        </>
    );
};
