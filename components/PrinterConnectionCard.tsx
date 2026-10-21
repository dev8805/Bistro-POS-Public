import { useEffect, useRef, useState } from 'react';
import { connectPrinter, reconnectPrinter, isWebSerialSupported } from '../lib/thermalPrinterService';
import { usePrinters } from '../hooks/usePrinters';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { useToast } from '../context/ToastContext';
import type { EstadoConexion } from '../lib/printerRegistry';

const labelCls = "block text-[12px] font-bold text-[#0f172a] dark:text-gray-200 uppercase tracking-wider mb-1.5";

// Texto y color del indicador de estado por impresora (sin amarillo).
const statusMeta = (status: EstadoConexion): { dot: string; text: string } => {
    if (status === 'connected') return { dot: 'bg-emerald-500 shadow-[0_0_8px_#10b981]', text: 'conectada' };
    if (status === 'connecting') return { dot: 'bg-gray-400 animate-pulse', text: 'conectando…' };
    if (status === 'disconnected') return { dot: 'bg-gray-400', text: 'desconectada' };
    return { dot: 'bg-gray-300 dark:bg-gray-600', text: 'sin reporte' };
};

/**
 * Gestión de la Lista_Impresoras_Registradas (QZ Tray).
 * Reutilizable: lo usan el panel de Ajustes (admin) y el panel de Impresora,
 * ya que registrar/elegir impresoras es una tarea operativa por dispositivo.
 */
const PrinterConnectionCard = () => {
    const { printers, defaultTicket, defaultComanda, statusFor, removePrinter, setDefault, listQzPrinters } = usePrinters();
    const { confirmAction } = useConfirmDialog();
    const { showToast } = useToast();

    const [isWorking, setIsWorking] = useState(false);
    const [availablePrinters, setAvailablePrinters] = useState<string[]>([]);
    const [showPrinterList, setShowPrinterList] = useState(false);
    const [addMessage, setAddMessage] = useState<string | null>(null);
    const webSerialAvailable = isWebSerialSupported();

    // Ref para hacer autoscroll a la lista de impresoras al desplegarla.
    const printerListRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Reconecta las impresoras registradas al montar para reflejar su estado.
        reconnectPrinter();
    }, []);

    // Al desplegar la lista de impresoras, hacer scroll para que quede visible.
    useEffect(() => {
        if (showPrinterList && availablePrinters.length > 0) {
            // Esperar al render del bloque antes de hacer scroll.
            requestAnimationFrame(() => {
                printerListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }
    }, [showPrinterList, availablePrinters.length]);

    // Abre la lista de QZ para agregar una impresora (sin alta manual por IP).
    const handleAddClick = async () => {
        setAddMessage(null);
        setIsWorking(true);
        try {
            const qzPrinters = await listQzPrinters();
            if (qzPrinters.length === 0) {
                setShowPrinterList(false);
                setAvailablePrinters([]);
                setAddMessage('QZ Tray no disponible o sin impresoras instaladas. Verifica que QZ Tray esté abierto y tenga impresoras.');
                return;
            }
            setAvailablePrinters(qzPrinters);
            setShowPrinterList(true);
        } catch (err) {
            console.error('[Printer] Error listando impresoras de QZ:', err);
            setShowPrinterList(false);
            setAvailablePrinters([]);
            setAddMessage('QZ Tray no disponible. Verifica que esté instalado y corriendo.');
        } finally {
            setIsWorking(false);
        }
    };

    // Registra + conecta físicamente la impresora elegida de la lista de QZ.
    const handleSelectPrinter = async (name: string) => {
        setIsWorking(true);
        try {
            const ok = await connectPrinter(name);
            if (ok) {
                showToast(`Impresora "${name}" agregada`, 'success');
            } else {
                showToast(`No se pudo conectar con "${name}"`, 'error');
            }
        } catch (err) {
            console.error('[Printer] Error al conectar impresora:', err);
            showToast('Error al conectar la impresora', 'error');
        } finally {
            setShowPrinterList(false);
            setAvailablePrinters([]);
            setIsWorking(false);
        }
    };

    const handleCancelList = () => {
        setShowPrinterList(false);
        setAvailablePrinters([]);
    };

    // Asigna la predeterminada de un rol (independiente del otro rol).
    const handleSetDefault = (role: 'TICKET' | 'COMANDA', name: string) => {
        const ok = setDefault(role, name);
        if (!ok) {
            showToast('No se pudo guardar la impresora predeterminada', 'error');
        }
    };

    // Pide confirmación identificando la impresora antes de eliminarla.
    const handleRemove = async (name: string) => {
        const confirmed = await confirmAction({
            title: 'Eliminar impresora',
            message: `¿Quitar la impresora "${name}" de la lista registrada?`,
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            variant: 'danger',
        });
        if (!confirmed) return; // cancelar conserva la impresora sin cambios

        const ok = await removePrinter(name);
        if (ok) {
            showToast(`Impresora "${name}" eliminada`, 'success');
        } else {
            showToast('No se pudo guardar la eliminación de la impresora', 'error');
        }
    };

    if (!webSerialAvailable) {
        return (
            <div className="space-y-2 pt-2">
                <label className={labelCls}>Impresoras Registradas</label>
                <div className="p-3 bg-slate-50 dark:bg-gray-900/40 border border-gray-200/70 dark:border-gray-800 rounded-xl flex items-start gap-2.5">
                    <div className="space-y-1">
                        <span className="text-[12px] font-bold text-gray-800 dark:text-gray-200">QZ Tray No Detectado</span>
                        <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                            Instala QZ Tray desde qz.io/download para conectar la impresora directamente. Funciona con cualquier navegador.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3 pt-2">
            <label className={labelCls}>Impresoras Registradas</label>

            {/* Lista_Impresoras_Registradas */}
            {printers.length === 0 ? (
                <p className="text-[12px] font-medium text-gray-500 dark:text-gray-400 py-2 px-3 bg-slate-50 dark:bg-gray-900/40 border border-gray-200/70 dark:border-gray-800 rounded-xl">
                    No hay impresoras registradas. Agrega una para empezar a imprimir.
                </p>
            ) : (
                <div className="rounded-xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
                    {printers.map((p) => {
                        const meta = statusMeta(statusFor(p.name));
                        const isTicket = defaultTicket === p.name;
                        const isComanda = defaultComanda === p.name;
                        return (
                            <div key={p.name} className="p-3 space-y-2.5 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                                <div className="flex items-center gap-2.5">
                                    <span className="text-[14px]">🖨️</span>
                                    <span className="flex-1 text-[13px] font-semibold text-gray-800 dark:text-gray-100 truncate">{p.name}</span>
                                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                                        <span className={`size-2.5 rounded-full ${meta.dot}`} />
                                        {meta.text}
                                    </span>
                                    <button
                                        type="button"
                                        aria-label={`Eliminar impresora ${p.name}`}
                                        onClick={() => handleRemove(p.name)}
                                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors active:scale-95"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">delete</span>
                                    </button>
                                </div>

                                {/* Toggles independientes de predeterminada por rol */}
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        aria-label={`Definir ${p.name} como predeterminada de ticket`}
                                        aria-pressed={isTicket}
                                        onClick={() => handleSetDefault('TICKET', p.name)}
                                        className={`flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold border transition-colors ${
                                            isTicket
                                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-400'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-emerald-700 hover:border-emerald-200 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-300'
                                        }`}
                                    >
                                        {isTicket ? 'Predet. Ticket ✓' : 'Predet. Ticket'}
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`Definir ${p.name} como predeterminada de comanda`}
                                        aria-pressed={isComanda}
                                        onClick={() => handleSetDefault('COMANDA', p.name)}
                                        className={`flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold border transition-colors ${
                                            isComanda
                                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-400'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-emerald-700 hover:border-emerald-200 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-300'
                                        }`}
                                    >
                                        {isComanda ? 'Predet. Comanda ✓' : 'Predet. Comanda'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Selección de impresoras de QZ para agregar */}
            {showPrinterList && availablePrinters.length > 0 && (
                <div ref={printerListRef} className="p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl space-y-1.5 animate-[fadeIn_0.15s_ease-out]">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[11px] font-bold text-gray-600 dark:text-gray-300">Selecciona la impresora a agregar:</p>
                        <button
                            type="button"
                            onClick={handleCancelList}
                            className="text-[11px] font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                        >
                            Cancelar
                        </button>
                    </div>
                    {availablePrinters.map((name) => (
                        <button
                            key={name}
                            type="button"
                            disabled={isWorking}
                            aria-label={`Agregar impresora ${name}`}
                            onClick={() => handleSelectPrinter(name)}
                            className="w-full text-left py-2 px-3 rounded-lg text-[12px] font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800/40 hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors border border-transparent hover:border-emerald-200 dark:hover:border-emerald-900/40 disabled:opacity-50"
                        >
                            🖨️ {name}
                        </button>
                    ))}
                </div>
            )}

            {/* Mensaje de QZ no disponible / sin impresoras */}
            {addMessage && (
                <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400 py-2 px-3 bg-slate-50 dark:bg-gray-900/40 border border-gray-200/70 dark:border-gray-800 rounded-xl">
                    {addMessage}
                </p>
            )}

            {/* Botón Agregar impresora */}
            {!showPrinterList && (
                <button
                    type="button"
                    disabled={isWorking}
                    onClick={handleAddClick}
                    className="w-full py-2.5 px-4 rounded-xl font-bold text-[12px] flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white transition-all duration-200 active:scale-95 disabled:opacity-50"
                >
                    {isWorking ? 'Buscando impresoras…' : '+ Agregar impresora'}
                </button>
            )}

            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                Requiere QZ Tray instalado y abierto. Descárgalo en qz.io/download
            </p>
        </div>
    );
};

export default PrinterConnectionCard;
