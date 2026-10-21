import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import PrinterConnectionCard from './PrinterConnectionCard';

interface PrinterSettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    /**
     * Si es true, el fondo oscuro cubre TODA la pantalla (incluida la franja del
     * Sidebar izquierdo). Útil al abrir el panel desde pantallas que no son el
     * Sidebar (p. ej. la pantalla de éxito), para que no se vea el menú debajo.
     * Por defecto false: respeta el Sidebar (md:left-[var(--sidebar-w,16rem)]), como al abrir desde él.
     */
    coverSidebar?: boolean;
}

/**
 * Panel lateral mínimo para CONECTAR la impresora térmica.
 * Disponible para todos los roles (no requiere permiso admin_settings),
 * porque conectar la impresora es operativo y por dispositivo.
 * La configuración sensible (datos del negocio, ancho de papel, métodos
 * de pago) sigue viviendo en SettingsSidebarPanel, protegida por permiso.
 */
const PrinterSettingsPanel = ({ isOpen, onClose, coverSidebar = false }: PrinterSettingsPanelProps) => {
    const { receiptPaperWidth, updateReceiptPaperWidth } = useBusinessSettings();
    const [paperSaved, setPaperSaved] = useState(false);

    const handlePaperWidthChange = async (width: '58mm' | '80mm') => {
        await updateReceiptPaperWidth(width);
        setPaperSaved(true);
        setTimeout(() => setPaperSaved(false), 2000);
    };

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const panel = (
        <>
            {/* Fondo oscuro traslúcido. Por defecto respeta el Sidebar (md:left-[var(--sidebar-w,16rem)]);
                con coverSidebar cubre toda la pantalla. */}
            <div
                className={`fixed inset-0 ${coverSidebar ? '' : 'md:left-[var(--sidebar-w,16rem)]'} bg-slate-900/60 backdrop-blur-[4px] z-[80] transition-opacity duration-300 animate-[fadeIn_0.2s_ease-out]`}
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Panel Lateral Drawer */}
            <div
                className="fixed inset-y-0 right-0 z-[90] w-full sm:max-w-[480px] bg-white dark:bg-[#102218] shadow-2xl flex flex-col h-full border-l border-gray-100 dark:border-gray-800/80 animate-[slideInRight_0.28s_cubic-bezier(0.16,1,0.3,1)] overflow-hidden"
            >
                {/* Cabecera */}
                <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800/60 flex items-center justify-between bg-white dark:bg-[#102218] shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white [font-family:'Plus_Jakarta_Sans',sans-serif] tracking-tight">
                            Impresora
                        </h2>
                        <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mt-0.5">
                            Conecta la impresora térmica de esta estación
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800/60 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-all duration-200 hover:rotate-90 shrink-0"
                        aria-label="Cerrar panel"
                        tabIndex={0}
                    >
                        <span className="material-symbols-outlined text-2xl">close</span>
                    </button>
                </div>

                {/* Contenido */}
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 custom-scrollbar bg-slate-50/50 dark:bg-[#0c1912]">
                    <div className="bg-white dark:bg-[#102218] border border-gray-100 dark:border-gray-800/60 rounded-2xl p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] space-y-4">
                        <div className="pb-1 border-b border-gray-100 dark:border-gray-800/60">
                            <h3 className="text-sm font-bold text-[#0f172a] dark:text-gray-200 uppercase tracking-wider">Impresora Térmica</h3>
                        </div>

                        {/* Ancho del papel */}
                        <div className="space-y-2">
                            <label className="block text-[12px] font-bold text-[#0f172a] dark:text-gray-200 uppercase tracking-wider mb-1.5">
                                <span className="flex items-center justify-between w-full">
                                    <span>Ancho del Papel</span>
                                    {paperSaved && (
                                        <span className="text-[11px] font-bold text-green-600 dark:text-green-400 flex items-center gap-0.5 animate-fadeIn">
                                            <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                            Guardado
                                        </span>
                                    )}
                                </span>
                            </label>

                            <div className="flex p-1 bg-slate-100 dark:bg-gray-900 rounded-xl gap-1">
                                <button
                                    type="button"
                                    onClick={() => handlePaperWidthChange('80mm')}
                                    className={`flex-1 py-2.5 rounded-lg font-bold text-[13px] transition-all flex items-center justify-center gap-1.5 ${
                                        receiptPaperWidth === '80mm'
                                            ? 'bg-white dark:bg-gray-800 text-amber-600 dark:text-amber-400 shadow-[0_2px_8px_rgba(0,0,0,0.05)]'
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                    }`}
                                >
                                    <span>80mm (Estándar)</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handlePaperWidthChange('58mm')}
                                    className={`flex-1 py-2.5 rounded-lg font-bold text-[13px] transition-all flex items-center justify-center gap-1.5 ${
                                        receiptPaperWidth === '58mm'
                                            ? 'bg-white dark:bg-gray-800 text-amber-600 dark:text-amber-400 shadow-[0_2px_8px_rgba(0,0,0,0.05)]'
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                    }`}
                                >
                                    <span>58mm (Compacto)</span>
                                </button>
                            </div>
                        </div>

                        <PrinterConnectionCard />
                    </div>
                </div>
            </div>
        </>
    );

    return typeof document !== 'undefined'
        ? createPortal(panel, document.body)
        : panel;
};

export default PrinterSettingsPanel;
