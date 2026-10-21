import React, { useState, lazy, Suspense } from 'react';
import { SellTab } from '../types';
import { useExpenses } from '../hooks/useExpenses';
import { ExpenseModal } from './ExpenseModal';
import { ExpenseActionsMenu, type ExpenseMenuAction } from './expense/ExpenseActionsMenu';
import { ScanLoadingFallback } from './invoiceScan/ScanLoadingFallback';
import { useToast } from '../context/ToastContext';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import { useSuppliers } from '../hooks/useSuppliers';
import { usePermissions } from '../hooks/usePermissions';
import { usePlanFeatures } from '../hooks/usePlanFeatures';
import { UpgradeProModal } from './modals/UpgradeProModal';

// Escaneo_Unificado montado como overlay `fixed inset-0` (mismo patrón que ExpenseModal).
const InvoiceScanScreen = lazy(() => import('../screens/InvoiceScanScreen'));

interface GlobalSellTabsProps {
    activeTab: SellTab;
    onTabClick: (tab: SellTab) => void;
}

export const GlobalSellTabs: React.FC<GlobalSellTabsProps> = ({
    activeTab,
    onTabClick
}) => {
    const [showExpenseModal, setShowExpenseModal] = useState(false);
    const { showToast } = useToast();
    const [expenseModalType, setExpenseModalType] = useState<'inventory' | 'expense' | 'waste'>('expense');
    const [showExpenseDropdown, setShowExpenseDropdown] = useState(false);
    const [showInvoiceScan, setShowInvoiceScan] = useState(false);
    const { canUseTables } = usePlanFeatures();
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);

    const { createExpense } = useExpenses();
    const { isTablesEnabled } = useBusinessSettings();
    const { hasPermission } = usePermissions();
    const canRegisterExpenses = hasPermission('inv_purchase');
    useSuppliers(); // precarga y cachea proveedores para offline

    const openExpenseModal = (type: 'inventory' | 'expense' | 'waste') => {
        setExpenseModalType(type);
        setShowExpenseModal(true);
        setShowExpenseDropdown(false);
    };

    // "Foto a factura" abre el Escaneo_Unificado; las demás conservan su modal.
    const handleExpenseMenuSelect = (action: ExpenseMenuAction) => {
        setShowExpenseDropdown(false);
        if (action === 'foto_factura') {
            setShowInvoiceScan(true);
            return;
        }
        openExpenseModal(action);
    };

    const handleTabClick = (tab: SellTab) => {
        if (tab === 'gastos') {
            setShowExpenseDropdown(!showExpenseDropdown);
        } else if (tab === 'mesas' && !canUseTables) {
            setShowUpgradeModal(true);
            setShowExpenseDropdown(false);
        } else {
            onTabClick(tab);
            setShowExpenseDropdown(false);
        }
    };

    // Determinar qué tab mostrar como activa visualmente
    const visualActiveTab = activeTab === 'mesa_activa' ? 'mesas' : activeTab;

    return (
        <>
            {/* Header Principal con Tabs */}
            <div className="hidden md:flex h-14 px-6 bg-white dark:bg-[#0f172a] border-b border-slate-200 dark:border-slate-800 items-center justify-center shrink-0 z-30 sticky top-0 relative">

                {/* Tabs centrados */}
                <div className="flex items-center gap-2">
                    {/* Gastos Tab */}
                    {canRegisterExpenses && (
                    <button
                        onClick={() => handleTabClick('gastos')}
                        className={`h-10 px-5 flex items-center gap-2 font-bold text-sm rounded-xl transition-colors border ${visualActiveTab === 'gastos'
                            ? 'bg-red-500 text-white border-transparent shadow-lg shadow-red-500/20'
                            : 'bg-red-50 dark:bg-rose-900/10 text-red-600 dark:text-red-400 border-red-100 dark:border-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/20'
                            }`}
                    >
                        <span className="material-symbols-outlined text-[20px]">payments</span>
                        <span>Egresos</span>
                    </button>
                    )}

                    {/* Mesas Tab */}
                    <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isTablesEnabled ? 'max-w-[200px] opacity-100' : 'max-w-0 opacity-0 pointer-events-none'}`}>
                        <button
                            onClick={() => handleTabClick('mesas')}
                            className={`h-10 px-5 flex items-center gap-2 font-bold text-sm rounded-xl transition-colors border whitespace-nowrap ${visualActiveTab === 'mesas'
                                ? 'bg-emerald-500 text-white border-transparent shadow-lg shadow-emerald-500/20'
                                : 'bg-emerald-50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/20'
                                }`}
                        >
                            <span className="material-symbols-outlined text-[20px]">table_restaurant</span>
                            <span>Mesas</span>
                            {!canUseTables && (
                                <span className="px-1.5 py-0.5 text-[9px] font-black bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 rounded border border-amber-300/60">
                                    PRO
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Orden Rápida Tab */}
                    <button
                        onClick={() => handleTabClick('orden_rapida')}
                        className={`h-10 px-5 flex items-center gap-2 font-bold text-sm rounded-xl transition-colors border ${visualActiveTab === 'orden_rapida'
                            ? 'bg-amber-500 text-white border-transparent shadow-lg shadow-amber-500/20'
                            : 'bg-amber-50 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/30 hover:bg-amber-100 dark:hover:bg-amber-900/20'
                            }`}
                    >
                        <span>Orden</span>
                    </button>
                </div>

                {/* Expense Dropdown */}
                {showExpenseDropdown && (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowExpenseDropdown(false)}></div>
                        <div className="absolute top-12 left-1/2 -translate-x-1/2 w-[19rem] bg-white dark:bg-[#1A2638] border border-slate-300 dark:border-slate-600 ring-1 ring-black/5 dark:ring-white/10 rounded-2xl shadow-xl shadow-slate-900/15 dark:shadow-black/60 z-50 overflow-hidden animate-fadeIn p-2">
                            <ExpenseActionsMenu variant="dropdown" onSelect={handleExpenseMenuSelect} />
                        </div>
                    </>
                )}
            </div>

            {/* Modal de Gastos */}
            {showExpenseModal && (
                <ExpenseModal
                    onClose={() => setShowExpenseModal(false)}
                    onSave={async (data) => {
                        try {
                            if (data.type !== 'inventory') await createExpense(data);
                            if (data.type !== 'expense') setShowExpenseModal(false);
                        } catch (error) {
                            console.error('Error saving expense:', error);
                            showToast('Error al registrar', 'error');
                        }
                    }}
                    initialType={expenseModalType}
                />
            )}

            {/* Escaneo_Unificado (Foto a factura) */}
            {showInvoiceScan && (
                <Suspense fallback={<ScanLoadingFallback />}>
                    <InvoiceScanScreen onClose={() => setShowInvoiceScan(false)} />
                </Suspense>
            )}

            <UpgradeProModal
                isOpen={showUpgradeModal}
                onClose={() => setShowUpgradeModal(false)}
                featureName="Mapa de Salones y Mesas"
                featureDescription="Controla pedidos por mesa en tiempo real, divide cuentas por persona y envía comandas directas a cocina o barra."
                onUpgrade={() => {
                    setShowUpgradeModal(false);
                    window.location.hash = '#subscription';
                }}
            />
        </>
    );
};
