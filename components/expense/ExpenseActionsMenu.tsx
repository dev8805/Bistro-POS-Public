import React from 'react';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../context/AuthContext';
import { HIDDEN_PRICES_BUSINESS_ID } from '../../lib/specialBusinesses';

/**
 * ExpenseActionsMenu — menú compartido de acciones de egresos manuales.
 *
 * Renderiza las opciones manuales: Compra de inventario, Gastos y Merma.
 */

/** Acción elegida en el menú. */
export type ExpenseMenuAction = 'foto_factura' | 'inventory' | 'expense' | 'waste';

export type ExpenseActionsVariant = 'dropdown' | 'sheet';

interface ManualOption {
    action: Exclude<ExpenseMenuAction, 'foto_factura'>;
    label: string;
}

/** Las tres opciones manuales. */
const MANUAL_OPTIONS: readonly ManualOption[] = [
    { action: 'inventory', label: 'Compra de inventario' },
    { action: 'expense', label: 'Gastos' },
    { action: 'waste', label: 'Merma' },
] as const;

const isActivationKey = (key: string): boolean =>
    key === 'Enter' || key === ' ' || key === 'Spacebar';

export interface ExpenseActionsMenuProps {
    variant: ExpenseActionsVariant;
    /** Se invoca con la acción elegida. Ver la nota de API en el encabezado. */
    onSelect: (action: ExpenseMenuAction) => void;
    /** Clase opcional para el contenedor (posicionamiento lo aporta la pantalla). */
    className?: string;
}

export const ExpenseActionsMenu: React.FC<ExpenseActionsMenuProps> = ({
    variant,
    onSelect,
    className,
}) => {
    const { hasPermission } = usePermissions();
    const { profile } = useAuth();

    if (!hasPermission('inv_purchase')) return null;

    const isNegocio10001 = profile?.business_id === HIDDEN_PRICES_BUSINESS_ID;
    const options = isNegocio10001
        ? MANUAL_OPTIONS.filter(option => option.action !== 'inventory')
        : MANUAL_OPTIONS;

    const isSheet = variant === 'sheet';

    const handleSelect = (action: ExpenseMenuAction) => {
        onSelect(action);
    };

    const handleKeyDown = (
        e: React.KeyboardEvent<HTMLButtonElement>,
        action: ExpenseMenuAction,
    ) => {
        if (!isActivationKey(e.key)) return;
        e.preventDefault();
        handleSelect(action);
    };

    const containerClass = `flex flex-col ${isSheet ? 'gap-2' : 'gap-1'}${className ? ` ${className}` : ''}`;

    return (
        <div className={containerClass} role="menu" aria-label="Acciones de egresos">
            {options.map(option => (
                <button
                    key={option.action}
                    type="button"
                    role="menuitem"
                    onClick={() => handleSelect(option.action)}
                    onKeyDown={e => handleKeyDown(e, option.action)}
                    aria-label={option.label}
                    className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl text-left font-bold text-slate-700 transition-colors hover:bg-slate-100 active:scale-[0.99] select-none ${
                        isSheet ? 'bg-slate-50 px-4 py-3.5 text-base' : 'px-3 py-2.5 text-sm'
                    }`}
                >
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {isSheet && (
                        <span className="material-symbols-outlined shrink-0 text-slate-400" aria-hidden="true">
                            chevron_right
                        </span>
                    )}
                </button>
            ))}
        </div>
    );
};

export default ExpenseActionsMenu;
