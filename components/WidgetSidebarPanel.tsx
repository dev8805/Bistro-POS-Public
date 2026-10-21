import React, { useState, useEffect, useRef } from 'react';

// Widget definition type
export interface WidgetDefinition {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string; // Tailwind color class (e.g., 'blue', 'purple', 'orange')
}

// Available widgets catalog
export const AVAILABLE_WIDGETS: WidgetDefinition[] = [
    {
        id: 'orders_today',
        name: 'Pedidos del Periodo',
        description: 'Número total de pedidos completados en el periodo seleccionado.',
        icon: 'assignment',
        color: 'blue',
    },
    {
        id: 'products_sold',
        name: 'Productos Vendidos',
        description: 'Total de productos vendidos en el periodo.',
        icon: 'package_2',
        color: 'orange',
    },
    {
        id: 'total_income',
        name: 'Ingresos Totales',
        description: 'Suma total de ingresos del periodo.',
        icon: 'payments',
        color: 'green',
    },
    {
        id: 'total_sales',
        name: 'Ventas Totales',
        description: 'Gráfico de ventas con comparativa.',
        icon: 'show_chart',
        color: 'blue',
    },
    {
        id: 'payment_methods',
        name: 'Métodos de Pago',
        description: 'Distribución de ventas por método de pago.',
        icon: 'credit_card',
        color: 'emerald',
    },
    {
        id: 'top_products',
        name: 'Productos Más Vendidos',
        description: 'Ranking de productos con mayor venta.',
        icon: 'star',
        color: 'amber',
    },
    {
        id: 'hourly_activity',
        name: 'Actividad por Hora',
        description: 'Distribución de actividad durante el día.',
        icon: 'schedule',
        color: 'indigo',
    },

    {
        id: 'waste_data',
        name: 'Mermas',
        description: 'Pérdidas por mermas del periodo.',
        icon: 'delete_sweep',
        color: 'orange',
    },
    {
        id: 'inventory_value',
        name: 'Valor del Inventario',
        description: 'Dinero invertido en inventario a costo y precio de venta.',
        icon: 'inventory_2',
        color: 'indigo',
    },
    {
        id: 'financial_diagnostic',
        name: 'Diagnóstico Financiero',
        description: 'Ganancia vs pérdida, P&L simplificado, alertas y métricas clave.',
        icon: 'monitoring',
        color: 'teal',
    },
    {
        id: 'break_even',
        name: 'Punto de Equilibrio',
        description: 'Cuánto necesitas vender para cubrir todos tus gastos.',
        icon: 'flag',
        color: 'amber',
    },
    {
        id: 'business_debts',
        name: 'Deudas Pendientes',
        description: 'Deudas activas del negocio con proveedores u otros acreedores.',
        icon: 'account_balance_wallet',
        color: 'rose',
    },

];

interface WidgetSidebarPanelProps {
    isOpen: boolean;
    onClose: () => void;
    activeWidgets: string[];
    onAddWidget: (widgetId: string) => void;
    onRemoveWidget: (widgetId: string) => void;
}

export const WidgetSidebarPanel: React.FC<WidgetSidebarPanelProps> = ({
    isOpen,
    onClose,
    activeWidgets,
    onAddWidget,
    onRemoveWidget,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const panelRef = useRef<HTMLDivElement>(null);

    // Filter widgets based on search
    const filteredWidgets = AVAILABLE_WIDGETS.filter(
        (widget) =>
            widget.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            widget.description.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Close on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    // Get color classes for each widget color
    const getColorClasses = (color: string, isAdded: boolean) => {
        const colors: Record<string, { bg: string; text: string; hover: string; hoverBg: string }> = {
            blue: {
                bg: 'bg-blue-100',
                text: 'text-blue-600',
                hover: 'hover:border-blue-200 hover:bg-blue-50/30',
                hoverBg: 'group-hover:bg-blue-600 group-hover:text-white',
            },
            purple: {
                bg: 'bg-purple-100',
                text: 'text-purple-600',
                hover: 'hover:border-purple-200 hover:bg-purple-50/30',
                hoverBg: 'group-hover:bg-purple-600 group-hover:text-white',
            },
            orange: {
                bg: 'bg-orange-100',
                text: 'text-orange-600',
                hover: 'hover:border-orange-200 hover:bg-orange-50/30',
                hoverBg: 'group-hover:bg-orange-600 group-hover:text-white',
            },
            emerald: {
                bg: 'bg-emerald-100',
                text: 'text-emerald-600',
                hover: 'hover:border-emerald-200 hover:bg-emerald-50/30',
                hoverBg: 'group-hover:bg-emerald-600 group-hover:text-white',
            },
            rose: {
                bg: 'bg-rose-100',
                text: 'text-rose-600',
                hover: 'hover:border-rose-200 hover:bg-rose-50/30',
                hoverBg: 'group-hover:bg-rose-600 group-hover:text-white',
            },
            green: {
                bg: 'bg-green-100',
                text: 'text-green-600',
                hover: 'hover:border-green-200 hover:bg-green-50/30',
                hoverBg: 'group-hover:bg-green-600 group-hover:text-white',
            },
            amber: {
                bg: 'bg-amber-100',
                text: 'text-amber-600',
                hover: 'hover:border-amber-200 hover:bg-amber-50/30',
                hoverBg: 'group-hover:bg-amber-600 group-hover:text-white',
            },
            indigo: {
                bg: 'bg-indigo-100',
                text: 'text-indigo-600',
                hover: 'hover:border-indigo-200 hover:bg-indigo-50/30',
                hoverBg: 'group-hover:bg-indigo-600 group-hover:text-white',
            },
            teal: {
                bg: 'bg-teal-100',
                text: 'text-teal-600',
                hover: 'hover:border-teal-200 hover:bg-teal-50/30',
                hoverBg: 'group-hover:bg-teal-600 group-hover:text-white',
            },
        };
        return colors[color] || colors.blue;
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Overlay */}
            <div
                className="fixed inset-0 md:left-[var(--sidebar-w,15rem)] bg-gray-900/40 backdrop-blur-[2px] z-40 transition-opacity animate-[fadeIn_0.15s_ease-out]"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Sidebar Panel */}
            <div
                ref={panelRef}
                className="fixed inset-y-0 right-0 z-[70] w-full max-w-md bg-white dark:bg-gray-900 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col h-full border-l border-gray-100 dark:border-gray-800 animate-[slideInRight_0.25s_ease-out]"
                style={{
                    animation: 'slideInRight 0.25s ease-out',
                }}
            >
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Añadir Nuevo Widget</h2>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors focus:outline-none"
                    >
                        <span className="material-symbols-outlined text-2xl">close</span>
                    </button>
                </div>

                {/* Search */}
                <div className="px-6 py-4">
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span className="material-symbols-outlined text-gray-400">search</span>
                        </div>
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl leading-5 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:bg-white dark:focus:bg-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all sm:text-sm"
                            placeholder="Buscar widgets..."
                        />
                    </div>
                    <p className="mt-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        Widgets Disponibles ({filteredWidgets.length})
                    </p>
                </div>

                {/* Widget List */}
                <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3">
                    {filteredWidgets.map((widget) => {
                        const isAdded = activeWidgets.includes(widget.id);
                        const colorClasses = getColorClasses(widget.color, isAdded);

                        return (
                            <div
                                key={widget.id}
                                className={`group flex items-center justify-between p-4 rounded-xl border transition-all duration-200 ${isAdded
                                    ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-900/20'
                                    : `border-gray-100 dark:border-gray-800 ${colorClasses.hover} cursor-pointer`
                                    }`}
                            >
                                <div className="flex items-start gap-4">
                                    <div
                                        className={`flex-shrink-0 size-10 rounded-lg flex items-center justify-center transition-colors ${isAdded
                                            ? 'bg-emerald-500 text-white'
                                            : `${colorClasses.bg} ${colorClasses.text} ${colorClasses.hoverBg}`
                                            }`}
                                    >
                                        <span className="material-symbols-outlined">{widget.icon}</span>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{widget.name}</h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-snug">
                                            {widget.description}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => (isAdded ? onRemoveWidget(widget.id) : onAddWidget(widget.id))}
                                    className={`size-8 flex items-center justify-center rounded-full transition-colors ${isAdded
                                        ? 'text-red-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30'
                                        : `text-gray-400 hover:bg-${widget.color}-100 hover:text-${widget.color}-600`
                                        }`}
                                    title={isAdded ? 'Quitar widget' : 'Añadir widget'}
                                >
                                    <span className="material-symbols-outlined">
                                        {isAdded ? 'remove' : 'add'}
                                    </span>
                                </button>
                            </div>
                        );
                    })}

                    {filteredWidgets.length === 0 && (
                        <div className="text-center py-8">
                            <span className="material-symbols-outlined text-4xl text-gray-300 dark:text-gray-600">
                                search_off
                            </span>
                            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                                No se encontraron widgets que coincidan con "{searchQuery}"
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer with count */}
                <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        <span className="font-semibold text-gray-900 dark:text-white">{activeWidgets.length}</span> widgets activos
                    </p>
                </div>
            </div>

            {/* Keyframes for animation */}
            <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
        </>
    );
};
