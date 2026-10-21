import React from 'react';
import { createPortal } from 'react-dom';
import { InventoryPurchase } from './expense/InventoryPurchase';
import { ExpenseRegister } from './expense/ExpenseRegister';
import { WasteRegister } from './expense/WasteRegister';
import { usePermissions } from '../hooks/usePermissions';

type RecordType = 'inventory' | 'expense' | 'waste';

interface ExpenseModalProps {
    onClose: () => void;
    onSave: (data: any) => Promise<any>;
    initialType?: RecordType;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({ onClose, onSave, initialType = 'inventory' }) => {
    const { hasPermission } = usePermissions();
    // Red de seguridad: aunque el botón "Gastos" esté oculto, si por cualquier vía
    // se abre este modal sin permiso, mostramos un aviso claro en vez del formulario.
    const canRegisterExpenses = hasPermission('inv_purchase');

    return createPortal(
        <div className="fixed inset-0 md:left-[var(--sidebar-w,15rem)] z-[100] flex justify-end">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]" role="button" tabIndex={-1} onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()} aria-label="Cerrar"></div>
            <div className="relative w-full max-w-md h-full">
                {!canRegisterExpenses ? (
                    <div className="h-full bg-surface-light dark:bg-surface-dark flex flex-col items-center justify-center text-center p-8 gap-4">
                        <div className="size-16 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                            <span className="material-symbols-outlined text-amber-500 text-[32px]">lock</span>
                        </div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">No tienes permiso para registrar gastos</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
                            Pídele a un administrador que active el permiso "Registrar Gastos" para tu usuario.
                        </p>
                        <button
                            onClick={onClose}
                            className="mt-2 px-5 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        >
                            Entendido
                        </button>
                    </div>
                ) : (
                    <>
                        {initialType === 'inventory' && (
                            <InventoryPurchase onClose={onClose} onSave={onSave} />
                        )}
                        {initialType === 'expense' && (
                            <ExpenseRegister onClose={onClose} onSave={onSave} />
                        )}
                        {initialType === 'waste' && (
                            <WasteRegister onClose={onClose} onSave={onSave} />
                        )}
                    </>
                )}
            </div>
        </div>,
        document.body
    );
};
