import React, { useEffect, useState } from 'react';
import { useBusinessSettings } from '../hooks/useBusinessSettings';

interface SalesModeSettingsPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

// Whitelist temporal: solo estos negocios (public_id) ven la opción "Mesas".
// Para quitar la restricción y mostrarla a todos, vaciar el array o borrar el condicional.
const TABLES_FEATURE_ALLOWED_CODES = ['10000'];

/**
 * Panel lateral de Ajustes → "Activar/Desactivar".
 * Permite activar o desactivar el Modo Catálogo del negocio (persistido en Supabase,
 * compartido entre todos los dispositivos vía realtime). Solo el dueño puede cambiarlo (RLS).
 */
export const SalesModeSettingsPanel: React.FC<SalesModeSettingsPanelProps> = ({ isOpen, onClose }) => {
    const {
        isCatalogModeEnabled,
        setCatalogModeEnabled,
        isTablesEnabled,
        setTablesEnabled,
        isComandaLabelShortcutEnabled,
        setComandaLabelShortcutEnabled,
        isOwner,
        businessCode,
    } = useBusinessSettings();
    const canSeeTablesToggle = TABLES_FEATURE_ALLOWED_CODES.includes(businessCode ?? '');
    const [isToggling, setIsToggling] = useState(false);
    const [isTogglingTables, setIsTogglingTables] = useState(false);
    const [isTogglingShortcut, setIsTogglingShortcut] = useState(false);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    const handleToggle = async () => {
        if (!isOwner || isToggling) return;
        setIsToggling(true);
        try {
            await setCatalogModeEnabled(!isCatalogModeEnabled);
        } catch (err) {
            console.error('Error toggling catalog mode:', err);
        } finally {
            setIsToggling(false);
        }
    };

    const handleToggleTables = async () => {
        if (!isOwner || isTogglingTables) return;
        setIsTogglingTables(true);
        try {
            await setTablesEnabled(!isTablesEnabled);
        } catch (err) {
            console.error('Error toggling tables:', err);
        } finally {
            setIsTogglingTables(false);
        }
    };

    const handleToggleShortcut = async () => {
        if (!isOwner || isTogglingShortcut) return;
        setIsTogglingShortcut(true);
        try {
            await setComandaLabelShortcutEnabled(!isComandaLabelShortcutEnabled);
        } catch (err) {
            console.error('Error toggling comanda label shortcut:', err);
        } finally {
            setIsTogglingShortcut(false);
        }
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Panel Lateral Drawer (el backdrop es compartido y vive en Sidebar) */}
            <div
                className="fixed inset-y-0 right-0 z-[90] w-full sm:max-w-[480px] bg-white dark:bg-[#102218] shadow-2xl flex flex-col h-full border-l border-gray-100 dark:border-gray-800/80 animate-[slideInRight_0.28s_cubic-bezier(0.16,1,0.3,1)] overflow-hidden"
            >
                {/* Cabecera */}
                <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800/60 flex items-center justify-between bg-white dark:bg-[#102218] shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 dark:text-white [font-family:'Plus_Jakarta_Sans',sans-serif] tracking-tight">
                            Activar/Desactivar
                        </h2>
                        <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mt-0.5">
                            Opciones de visualización del punto de venta
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
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 custom-scrollbar bg-slate-50/50 dark:bg-[#0c1912]">
                    {!isOwner && (
                        <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl">
                            <span className="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400 shrink-0">lock</span>
                            <p className="text-[12px] font-medium text-amber-700 dark:text-amber-300">
                                Solo el dueño del negocio puede cambiar esta opción. Aquí la ves en modo lectura.
                            </p>
                        </div>
                    )}

                    {/* Card completa clickeable: activa/desactiva el modo catálogo */}
                    <div
                        role="switch"
                        aria-checked={isCatalogModeEnabled}
                        aria-disabled={!isOwner || isToggling}
                        aria-label="Activar o desactivar el modo catálogo"
                        tabIndex={isOwner ? 0 : -1}
                        onClick={handleToggle}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggle(); } }}
                        className={`flex items-center justify-between gap-4 p-5 bg-white dark:bg-[#102218] border border-gray-200 dark:border-gray-800/60 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] transition-all ${(!isOwner || isToggling) ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-amber-300 dark:hover:border-amber-700/50 active:scale-[0.99]'}`}
                    >
                        <div className="flex items-start gap-3 min-w-0">
                            <span className="material-symbols-outlined text-[22px] text-amber-500 shrink-0 mt-0.5">grid_view</span>
                            <div className="min-w-0">
                                <p className="text-[14px] font-bold text-[#0f172a] dark:text-gray-100">Modo Catálogo</p>
                                <p className="text-[12px] font-medium text-[#64748b] dark:text-gray-400 mt-0.5">
                                    {isCatalogModeEnabled
                                        ? 'Activado: los productos se muestran como tarjetas visuales.'
                                        : 'Desactivado: se usa el modo Escáner (búsqueda rápida por código).'}
                                </p>
                            </div>
                        </div>

                        <span className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 ${isCatalogModeEnabled ? 'bg-amber-400' : 'bg-gray-300 dark:bg-gray-700'}`}>
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${isCatalogModeEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </span>
                    </div>

                    {/* Card completa clickeable: activa/desactiva las mesas.
                        Visible solo para negocios en TABLES_FEATURE_ALLOWED_CODES. */}
                    {canSeeTablesToggle && (
                        <div
                            role="switch"
                            aria-checked={isTablesEnabled}
                            aria-disabled={!isOwner || isTogglingTables}
                            aria-label="Activar o desactivar las mesas"
                            tabIndex={isOwner ? 0 : -1}
                            onClick={handleToggleTables}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggleTables(); } }}
                            className={`flex items-center justify-between gap-4 p-5 bg-white dark:bg-[#102218] border border-gray-200 dark:border-gray-800/60 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] transition-all ${(!isOwner || isTogglingTables) ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-amber-300 dark:hover:border-amber-700/50 active:scale-[0.99]'}`}
                        >
                            <div className="flex items-start gap-3 min-w-0">
                                <span className="material-symbols-outlined text-[22px] text-amber-500 shrink-0 mt-0.5">table_restaurant</span>
                                <div className="min-w-0">
                                    <p className="text-[14px] font-bold text-[#0f172a] dark:text-gray-100">Mesas</p>
                                    <p className="text-[12px] font-medium text-[#64748b] dark:text-gray-400 mt-0.5">
                                        {isTablesEnabled
                                            ? 'Activado: puedes tomar pedidos por mesa y enviar comandas.'
                                            : 'Desactivado: el punto de venta funciona solo en Orden Rápida.'}
                                    </p>
                                </div>
                            </div>

                            <span className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 ${isTablesEnabled ? 'bg-amber-400' : 'bg-gray-300 dark:bg-gray-700'}`}>
                                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${isTablesEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                            </span>
                        </div>
                    )}

                    {/* Acceso rápido a etiquetas de comanda desde el header del carrito.
                        Solo tiene sentido con el Modo Catálogo activo. Si el negocio no lo
                        usa (ej. tienda de mostrador sin cocina), lo puede apagar. */}
                    <div
                        role="switch"
                        aria-checked={isComandaLabelShortcutEnabled}
                        aria-disabled={!isOwner || isTogglingShortcut || !isCatalogModeEnabled}
                        aria-label="Activar o desactivar el acceso rápido a etiquetas de comanda"
                        tabIndex={isOwner && isCatalogModeEnabled ? 0 : -1}
                        onClick={handleToggleShortcut}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggleShortcut(); } }}
                        className={`flex items-center justify-between gap-4 p-5 bg-white dark:bg-[#102218] border border-gray-200 dark:border-gray-800/60 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] transition-all ${(!isOwner || isTogglingShortcut || !isCatalogModeEnabled) ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-amber-300 dark:hover:border-amber-700/50 active:scale-[0.99]'}`}
                    >
                        <div className="flex items-start gap-3 min-w-0">
                            <span className="material-symbols-outlined text-[22px] text-amber-500 shrink-0 mt-0.5">takeout_dining</span>
                            <div className="min-w-0">
                                <p className="text-[14px] font-bold text-[#0f172a] dark:text-gray-100">Botón "Pedido" en el carrito</p>
                                <p className="text-[12px] font-medium text-[#64748b] dark:text-gray-400 mt-0.5">
                                    {!isCatalogModeEnabled
                                        ? 'Requiere Modo Catálogo activo.'
                                        : isComandaLabelShortcutEnabled
                                            ? 'Activado: el cajero puede etiquetar la comanda desde el carrito o se le recordará en la pantalla de éxito.'
                                            : 'Desactivado: la comanda se envía directamente sin solicitar opciones de pedido.'}
                                </p>
                            </div>
                        </div>

                        <span className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 ${isComandaLabelShortcutEnabled ? 'bg-amber-400' : 'bg-gray-300 dark:bg-gray-700'}`}>
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${isComandaLabelShortcutEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </span>
                    </div>
                </div>
            </div>

            {/* Keyframes locales (coherentes con SettingsSidebarPanel) */}
            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </>
    );
};

export default SalesModeSettingsPanel;
