import React, { useState, useEffect, useRef } from 'react';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { DeveloperAvailabilityPanel } from './DeveloperAvailabilityPanel';
import PrinterConnectionCard from './PrinterConnectionCard';
import ReceiptPreviewCard from './ReceiptPreviewCard';

interface SettingsSidebarPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

// Clases de Diseño Altamente Optimizadas y Coherentes con el Design System
const fieldBase = "w-full px-4 py-3 rounded-xl border-[1.5px] bg-white dark:bg-gray-900 text-[14px] font-medium text-[#0f172a] dark:text-white placeholder:text-[#94a3b8] placeholder:font-normal outline-none focus:outline-none focus:ring-4 focus:ring-primary/10 focus:border-primary transition-colors duration-200";
const fieldIdle = "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600";
const fieldError = "border-[#ef4444] focus:ring-red-500/10 focus:border-red-500";
const fieldReadOnly = "border-gray-200 dark:border-gray-700 bg-slate-100 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 cursor-not-allowed";
const labelCls = "block text-[12px] font-bold text-[#0f172a] dark:text-gray-200 uppercase tracking-wider mb-1.5";
const helperCls = "mt-1.5 text-[11px] font-medium text-[#64748b] dark:text-gray-400 min-h-[16px]";
const monoNum = "[font-family:'JetBrains_Mono',monospace] [font-variant-numeric:tabular-nums]";

export const SettingsSidebarPanel: React.FC<SettingsSidebarPanelProps> = ({ isOpen, onClose }) => {
    const {
        businessName, businessNit, receiptPaperWidth,
        updateReceiptPaperWidth,
        receiptBusinessName, receiptPhone, receiptAddress,
        updateReceiptSettings,
        isOwner
    } = useBusinessSettings();

    const panelRef = useRef<HTMLDivElement>(null);

    const [formData, setFormData] = useState({
        receipt_business_name: '',
        nit: '',
        receipt_phone: '',
        receipt_address: '',
    });

    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);
    const [paperSaved, setPaperSaved] = useState(false);
    // Tarjeta "Datos Comerciales" colapsable; arranca cerrada por defecto.
    const [isComercialesOpen, setIsComercialesOpen] = useState(false);
    // Modal de preview para tablet/móvil
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

    const nitError = formData.nit && !/^[\d.\-\s]+$/.test(formData.nit)
        ? 'Solo se permiten números, puntos, espacios y guiones'
        : null;

    const hasChanges = (
        formData.receipt_business_name !== (receiptBusinessName || '') ||
        formData.nit !== (businessNit || '') ||
        formData.receipt_phone !== (receiptPhone || '') ||
        formData.receipt_address !== (receiptAddress || '')
    );

    useEffect(() => {
        if (isOpen) {
            setFormData({
                receipt_business_name: receiptBusinessName || '',
                nit: businessNit || '',
                receipt_phone: receiptPhone || '',
                receipt_address: receiptAddress || '',
            });
            setSaveMessage(null);
        }
    }, [isOpen, receiptBusinessName, businessNit, receiptPhone, receiptAddress]);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    // Cada vez que el panel se abre, la tarjeta de datos comerciales arranca colapsada.
    useEffect(() => {
        if (isOpen) setIsComercialesOpen(false);
    }, [isOpen]);

    const handleSave = async () => {
        if (nitError) return;
        setIsSaving(true);
        setSaveMessage(null);
        try {
            await updateReceiptSettings({
                nit: formData.nit,
                receipt_business_name: formData.receipt_business_name,
                receipt_phone: formData.receipt_phone,
                receipt_address: formData.receipt_address,
            });
            
            setSaveMessage('Guardado correctamente');
            setTimeout(() => setSaveMessage(null), 2500);
        } catch (err) {
            console.error('Error saving receipt settings:', err);
            setSaveMessage('Error al guardar');
        } finally {
            setIsSaving(false);
        }
    };

    const handlePaperWidthChange = async (width: '58mm' | '80mm') => {
        await updateReceiptPaperWidth(width);
        setPaperSaved(true);
        setTimeout(() => setPaperSaved(false), 2000);
    };

    if (!isOpen) return null;

    const previewProps = {
        businessName: formData.receipt_business_name || businessName || 'Mi Negocio',
        businessNit: formData.nit,
        businessPhone: formData.receipt_phone,
        businessAddress: formData.receipt_address,
        paperWidth: receiptPaperWidth,
    };

    return (
        <>
            {/* Preview Desktop: flotante a la izquierda del panel, oculto en <lg */}
            <div className="hidden lg:flex fixed inset-y-0 right-[480px] z-[90] w-[380px] items-center justify-center pointer-events-none animate-[fadeIn_0.3s_ease-out]">
                <div className="pointer-events-auto max-h-[90vh] overflow-y-auto custom-scrollbar p-4">
                    <ReceiptPreviewCard {...previewProps} />
                </div>
            </div>

            {/* Panel Lateral Drawer (el backdrop es compartido y vive en Sidebar) */}
            <div
                ref={panelRef}
                className="fixed inset-y-0 right-0 z-[90] w-full sm:max-w-[480px] bg-white dark:bg-[#102218] shadow-2xl flex flex-col h-full border-l border-gray-100 dark:border-gray-800/80 animate-[slideInRight_0.28s_cubic-bezier(0.16,1,0.3,1)] overflow-hidden"
            >
                {/* Cabecera Premium */}
                <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800/60 flex items-center justify-between bg-white dark:bg-[#102218] shrink-0">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white [font-family:'Plus_Jakarta_Sans',sans-serif] tracking-tight">
                      Ajustes de Facturación
                    </h2>
                    <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mt-0.5">
                      Tickets e impresión de su establecimiento
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

                {/* Contenido Scrollable con diseño de Tarjetas */}
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 custom-scrollbar bg-slate-50/50 dark:bg-[#0c1912]">

                    {/* TARJETA 1: DATOS COMERCIALES (colapsable) */}
                    <div className="bg-white dark:bg-[#102218] border border-gray-100 dark:border-gray-800/60 rounded-2xl p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] space-y-4">
                        <div className={`flex items-center justify-between gap-2 ${isComercialesOpen ? 'pb-1 border-b border-gray-100 dark:border-gray-800/60' : ''}`}>
                            <button
                                type="button"
                                onClick={() => setIsComercialesOpen(v => !v)}
                                aria-expanded={isComercialesOpen}
                                aria-label="Mostrar u ocultar datos comerciales"
                                tabIndex={0}
                                className="flex items-center gap-2 text-left"
                            >
                                <h3 className="text-sm font-bold text-[#0f172a] dark:text-gray-200 uppercase tracking-wider">Datos Comerciales</h3>
                                <span className={`material-symbols-outlined text-[20px] text-gray-400 transition-transform duration-200 ${isComercialesOpen ? 'rotate-180' : ''}`}>expand_more</span>
                            </button>

                            {/* Link "Ver ticket" solo en tablet/móvil */}
                            <button
                                type="button"
                                onClick={() => setIsPreviewModalOpen(true)}
                                className="lg:hidden text-[12px] font-semibold text-[#0f172a] dark:text-gray-200 underline underline-offset-2 decoration-gray-400 hover:decoration-gray-700 dark:decoration-gray-500 dark:hover:decoration-gray-300 transition-colors shrink-0"
                                aria-label="Ver vista previa del ticket"
                                tabIndex={0}
                            >
                                Ver ticket
                            </button>
                        </div>

                        {isComercialesOpen && (<>
                        {!isOwner && (
                            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl">
                                <span className="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400 shrink-0">lock</span>
                                <p className="text-[12px] font-medium text-amber-700 dark:text-amber-300">
                                    Solo el dueño del negocio puede editar estos datos. Aquí los ves en modo lectura.
                                </p>
                            </div>
                        )}

                        {/* Nombre del Negocio */}
                        <div>
                            <label className={labelCls}>
                                Nombre en Facturas
                            </label>
                            <input
                                type="text"
                                value={formData.receipt_business_name}
                                onChange={(e) => setFormData(prev => ({ ...prev, receipt_business_name: e.target.value }))}
                                placeholder={businessName || 'Ej: Mi Restaurante SAS'}
                                disabled={!isOwner}
                                className={`${fieldBase} ${!isOwner ? fieldReadOnly : fieldIdle}`}
                            />
                            <p className={helperCls}>Si se deja vacío, se usará el nombre general del sistema</p>
                        </div>

                        {/* NIT / RUT */}
                        <div>
                            <label className={labelCls}>
                                NIT / Identificación
                            </label>
                            <input
                                type="text"
                                value={formData.nit}
                                onChange={(e) => setFormData(prev => ({ ...prev, nit: e.target.value }))}
                                placeholder="Ej: 901.234.567-8"
                                disabled={!isOwner}
                                className={`${fieldBase} ${monoNum} ${!isOwner ? fieldReadOnly : (nitError ? fieldError : fieldIdle)}`}
                            />
                            {nitError ? (
                                <div className="flex items-center gap-1 mt-1.5 text-red-500 font-semibold text-[11px] animate-fadeIn">
                                    <span className="material-symbols-outlined text-[14px]">error</span>
                                    <span>{nitError}</span>
                                </div>
                            ) : (
                                <p className={helperCls}>Identificación tributaria del establecimiento</p>
                            )}
                        </div>

                        {/* Teléfono */}
                        <div>
                            <label className={labelCls}>
                                Teléfono de Contacto
                            </label>
                            <input
                                type="tel"
                                inputMode="tel"
                                value={formData.receipt_phone}
                                onChange={(e) => setFormData(prev => ({ ...prev, receipt_phone: e.target.value }))}
                                placeholder="Ej: +57 300 123 4567"
                                disabled={!isOwner}
                                className={`${fieldBase} ${monoNum} ${!isOwner ? fieldReadOnly : fieldIdle}`}
                            />
                            <p className={helperCls}>Número para la cabecera o pie de página del ticket</p>
                        </div>

                        {/* Dirección */}
                        <div>
                            <label className={labelCls}>
                                Dirección Física
                            </label>
                            <input
                                type="text"
                                value={formData.receipt_address}
                                onChange={(e) => setFormData(prev => ({ ...prev, receipt_address: e.target.value }))}
                                placeholder="Ej: Calle 85 # 11-53, Local 1"
                                disabled={!isOwner}
                                className={`${fieldBase} ${!isOwner ? fieldReadOnly : fieldIdle}`}
                            />
                            <p className={helperCls}>Dirección para la cabecera de facturas</p>
                        </div>

                        {/* Guardar (dentro de la tarjeta) — solo el dueño puede editar */}
                        {isOwner && (
                            <div className="flex items-center justify-end gap-3 pt-1">
                                {saveMessage && (
                                    <span className={`text-[12px] font-bold py-1 px-2.5 rounded-lg animate-fadeIn ${
                                        saveMessage.includes('Error')
                                            ? 'bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400'
                                            : 'bg-green-50 text-green-600 dark:bg-green-950/20 dark:text-green-400'
                                     }`}>
                                        {saveMessage}
                                    </span>
                                )}
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving || !hasChanges || !!nitError}
                                    className={`min-w-[140px] py-3 px-6 text-[13.5px] font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 active:scale-[0.98] ${
                                        !hasChanges
                                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800/60 dark:text-gray-500'
                                            : 'bg-amber-400 hover:bg-amber-500 text-[#102218] font-extrabold shadow-md shadow-amber-400/10'
                                    }`}
                                >
                                    {isSaving ? (
                                        <>
                                            <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                            <span>Guardando...</span>
                                        </>
                                    ) : !hasChanges ? (
                                        <span>Guardado</span>
                                    ) : (
                                        <span>Guardar</span>
                                    )}
                                </button>
                            </div>
                        )}
                        </>)}
                    </div>

                    {/* TARJETA 2: IMPRESORA Y CONECTIVIDAD */}
                    <div className="bg-white dark:bg-[#102218] border border-gray-100 dark:border-gray-800/60 rounded-2xl p-5 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] space-y-4">
                        <div className="pb-1 border-b border-gray-100 dark:border-gray-800/60">
                            <h3 className="text-sm font-bold text-[#0f172a] dark:text-gray-200 uppercase tracking-wider">Impresora Térmica</h3>
                        </div>

                        {/* Ancho del papel con Segmented Control premium */}
                        <div className="space-y-2">
                            <label className={labelCls}>
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

                        {/* Conexión a la impresora — componente reutilizable */}
                        <PrinterConnectionCard />

                        <DeveloperAvailabilityPanel />
                    </div>
                </div>

                {/* Pie eliminado: el botón "Cancelar" no aportaba función (la X del encabezado cierra). */}
            </div>

            {/* Inyección de Keyframes de Animación localizados */}
            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { transform: translateY(24px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>

            {/* Modal Preview para tablet/móvil */}
            {isPreviewModalOpen && (
                <div className="lg:hidden fixed inset-0 z-[100] flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
                    {/* Backdrop del modal */}
                    <div
                        className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
                        onClick={() => setIsPreviewModalOpen(false)}
                        aria-hidden="true"
                    />
                    {/* Contenido del modal */}
                    <div className="relative bg-slate-50 dark:bg-[#0c1912] rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto p-5 w-full max-w-[360px] animate-[slideUp_0.25s_cubic-bezier(0.16,1,0.3,1)]">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Vista Previa del Ticket</h3>
                            <button
                                onClick={() => setIsPreviewModalOpen(false)}
                                className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                                aria-label="Cerrar vista previa"
                                tabIndex={0}
                            >
                                <span className="material-symbols-outlined text-xl">close</span>
                            </button>
                        </div>
                        <ReceiptPreviewCard {...previewProps} />
                    </div>
                </div>
            )}
        </>
    );
};
