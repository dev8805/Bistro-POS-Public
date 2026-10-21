import { useEffect, useMemo, useState } from 'react';
import { CartItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { useToast } from '../context/ToastContext';
import { useAvailablePrinters } from '../hooks/useKitchenPrinter';
import { getPrinterStatus, printKitchenCommandDirect, KitchenCommandData } from '../lib/thermalPrinterService';
import { sendKitchenCommand } from '../lib/kitchenCommandService';
import { supabase } from '../lib/supabase';
import { isRealOffline } from '../lib/connectivity';
import { getTableOrder, saveTableOrder } from '../lib/offlineTableStore';

const SENT_STATUSES = ['preparing', 'ready', 'served'];

interface SendCommandaModalProps {
    isOpen: boolean;
    onClose: () => void;
    tableId?: string;
    tableName?: string;
    /** Carrito actual de la mesa (incluye items enviados y nuevos) */
    items: CartItem[];
    /** Etiquetas seleccionadas desde el botón "Pedido" del header del carrito
     *  (Localizador / Mesa / Tipo de pedido). Se imprimen en el pie de la comanda. */
    labelSelection?: { locator?: string; table?: string; takeaway?: string };
    /** Se llama tras enviar la comanda con éxito */
    onSent?: () => void;
}

/**
 * Modal para enviar la comanda de los items NUEVOS (status pending) de una mesa.
 * Permite elegir impresora: esta misma (si tiene QZ conectado) o un dispositivo
 * remoto del negocio anunciado vía presence. Tras enviar, marca los items como
 * 'preparing' y confirma la orden (la mesa queda ocupada en tiempo real).
 */
const SendCommandaModal = ({ isOpen, onClose, tableId, tableName, items, labelSelection, onSent }: SendCommandaModalProps) => {
    const { profile } = useAuth();
    const { receiptPaperWidth } = useBusinessSettings();
    const { showToast } = useToast();
    const remotePrinters = useAvailablePrinters();
    const [sending, setSending] = useState(false);
    // Estado_Offline (Req 11): sin conexión solo se ofrece la impresora local (QZ)
    // y se bloquea el envío remoto. Se inicializa con navigator.onLine y se
    // confirma con la sonda real cuando el modal se abre.
    const [isOffline, setIsOffline] = useState<boolean>(() => !navigator.onLine);

    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        void isRealOffline().then(off => {
            if (!cancelled) setIsOffline(off);
        });
        return () => { cancelled = true; };
    }, [isOpen]);

    const localConnected = getPrinterStatus() === 'connected';

    // Items nuevos (no enviados) de nivel superior
    const pendingItems = useMemo(
        () => items.filter(it => !it.parentOrderItemId && !SENT_STATUSES.includes(it.status || 'pending')),
        [items]
    );

    const buildCommand = (): KitchenCommandData => ({
        tableName,
        customerName: undefined,
        items: pendingItems.map(item => {
            const children = items.filter(c => c.parentOrderItemId === item.orderItemId);
            const modifierTags = children.map(c => c.name);
            return {
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                notes: item.notes,
                cookingTerm: [item.cookingTerm, ...modifierTags].filter(Boolean).join(', ') || undefined,
                removedIngredients: item.removedIngredients,
            };
        }),
        date: new Date().toISOString(),
        sellerName: profile?.full_name || undefined,
        // Etiquetas del ComandaLabelModal preseleccionadas desde el header
        // del carrito ("Pedido"). El servicio de impresión las pinta en el
        // pie de la comanda (LOCALIZADOR / MESA / TIPO DE PEDIDO).
        locatorLabel: labelSelection?.locator,
        tableLabel: labelSelection?.table,
        takeawayLabel: labelSelection?.takeaway,
    });

    // Marca los items pending como preparing y confirma la orden → mesa ocupada
    const markOrderConfirmed = async () => {
        if (!tableId) return;

        // OFFLINE (Req 11.2): marcar los items pending → preparing en
        // Cache_Orden_Mesa_IDB, sin escribir en Supabase.
        if (await isRealOffline()) {
            try {
                const cached = await getTableOrder(tableId);
                if (!cached) return;
                cached.items = cached.items.map(ci =>
                    ci.status === 'pending' ? { ...ci, status: 'preparing' } : ci
                );
                cached.dirty = true;
                await saveTableOrder(cached);
            } catch (err) {
                console.error('[SendCommandaModal] Error confirmando orden offline:', err);
            }
            return;
        }

        try {
            const { data: table } = await supabase
                .from('tables')
                .select('current_order_id')
                .eq('id', tableId)
                .single();
            const orderId = table?.current_order_id;
            if (!orderId) return;

            await supabase
                .from('order_items')
                .update({ status: 'preparing' })
                .eq('order_id', orderId)
                .eq('status', 'pending');

            await supabase
                .from('orders')
                .update({ status: 'preparing', last_confirmed_at: new Date().toISOString(), dispatched_at: null })
                .eq('id', orderId);

            await supabase
                .from('tables')
                .update({ status: 'occupied' })
                .eq('id', tableId);
        } catch (err) {
            console.error('[SendCommandaModal] Error confirmando orden:', err);
        }
    };

    const handleSendLocal = async () => {
        if (sending || pendingItems.length === 0) return;
        setSending(true);
        try {
            const ok = await printKitchenCommandDirect(buildCommand(), receiptPaperWidth);
            if (ok) {
                await markOrderConfirmed();
                showToast('Comanda impresa', 'success');
                onSent?.();
                onClose();
            } else {
                showToast('No se pudo imprimir la comanda', 'error');
            }
        } catch {
            showToast('No se pudo imprimir la comanda', 'error');
        } finally {
            setSending(false);
        }
    };

    const handleSendRemote = async (targetUserId: string) => {
        // OFFLINE (Req 11.3): el envío a dispositivos remotos requiere conexión.
        if (isOffline) {
            showToast('El envío a dispositivos remotos requiere conexión', 'error');
            return;
        }
        if (sending || pendingItems.length === 0 || !profile?.business_id) return;
        setSending(true);
        try {
            const ok = await sendKitchenCommand(profile.business_id, targetUserId, buildCommand());
            if (ok) {
                await markOrderConfirmed();
                showToast('Comanda enviada', 'success');
                onSent?.();
                onClose();
            } else {
                showToast('Error al enviar comanda', 'error');
            }
        } catch {
            showToast('Error al enviar comanda', 'error');
        } finally {
            setSending(false);
        }
    };

    if (!isOpen) return null;

    // OFFLINE (Req 11.1, 11.4): solo la impresora local (QZ); destinos remotos ocultos.
    const showRemote = !isOffline;
    const hasTargets = localConnected || (showRemote && remotePrinters.length > 0);

    // 🔎[COMANDA] Traza de la decisión de destinos en Mesas (observador vs eje).
    console.log('🔎[COMANDA] SendCommandaModal render', {
        isOffline,
        localConnected,
        showRemote,
        remotePrinters: remotePrinters.map(p => ({ userId: p.userId, userName: p.userName, printerConnected: p.printerConnected })),
        remoteCount: remotePrinters.length,
        hasTargets,
        pendingItems: pendingItems.length,
        labelSelection,
    });

    return (
        <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center" onClick={onClose}>
            <div className="absolute inset-0 bg-black/50 animate-[fadeIn_0.15s_ease-out]" />
            <div
                className="relative bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl p-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] animate-[slideInUp_0.22s_cubic-bezier(0.32,0.72,0,1)]"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-center pb-2 sm:hidden">
                    <span className="w-10 h-1 rounded-full bg-slate-200" />
                </div>

                <div className="flex items-center justify-between mb-1">
                    <h3 className="text-base font-bold text-slate-900">Enviar comanda</h3>
                    <button onClick={onClose} className="size-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400">
                        <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                </div>
                <p className="text-[12px] text-slate-500 mb-3">
                    {tableName ? `${tableName} · ` : ''}{pendingItems.length} producto{pendingItems.length !== 1 ? 's' : ''} nuevo{pendingItems.length !== 1 ? 's' : ''}
                </p>

                {!hasTargets ? (
                    <div className="py-6 text-center">
                        <span className="material-symbols-outlined text-[36px] text-slate-300">print_disabled</span>
                        {isOffline ? (
                            <>
                                <p className="text-sm text-slate-500 mt-2">No hay impresora local disponible</p>
                                <p className="text-[11px] text-slate-400 mt-1">Sin conexión, la comanda solo puede imprimirse en la impresora de este equipo.</p>
                            </>
                        ) : (
                            <>
                                <p className="text-sm text-slate-500 mt-2">No hay impresoras conectadas</p>
                                <p className="text-[11px] text-slate-400 mt-1">Conecta una impresora o abre la app en un equipo con impresora.</p>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {localConnected && (
                            <button
                                onClick={handleSendLocal}
                                disabled={sending}
                                className="w-full h-12 flex items-center gap-3 px-3 rounded-xl border border-slate-200 hover:border-[#102218] hover:bg-slate-50 transition-all disabled:opacity-50"
                            >
                                <span className="size-9 rounded-xl bg-[#102218] text-white flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-[20px]">print</span>
                                </span>
                                <span className="flex flex-col items-start min-w-0">
                                    <span className="text-sm font-semibold text-slate-800">Esta impresora</span>
                                    <span className="text-[11px] text-slate-400">Imprimir aquí</span>
                                </span>
                            </button>
                        )}

                        {showRemote && remotePrinters.map(printer => (
                            <button
                                key={printer.userId}
                                onClick={() => handleSendRemote(printer.userId)}
                                disabled={sending}
                                className="w-full h-12 flex items-center gap-3 px-3 rounded-xl border border-slate-200 hover:border-[#102218] hover:bg-slate-50 transition-all disabled:opacity-50"
                            >
                                <span className="size-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-[20px]">point_of_sale</span>
                                </span>
                                <span className="flex flex-col items-start min-w-0">
                                    <span className="text-sm font-semibold text-slate-800 truncate">{printer.userName}</span>
                                    <span className="text-[11px] text-slate-400">{printer.role}</span>
                                </span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SendCommandaModal;
