import React from 'react';

interface OfflineFeaturesModalProps {
    onClose: () => void;
}

export const OfflineFeaturesModal: React.FC<OfflineFeaturesModalProps> = ({ onClose }) => {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fadeIn p-3 sm:p-4">
            <style>
                {`
                .subtle-scrollbar::-webkit-scrollbar {
                    width: 3px;
                }
                .subtle-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .subtle-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(0, 0, 0, 0.15);
                    border-radius: 10px;
                }
                .dark .subtle-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.15);
                }
                .subtle-scrollbar {
                    scrollbar-width: thin;
                    scrollbar-color: rgba(0, 0, 0, 0.15) transparent;
                }
                .dark .subtle-scrollbar {
                    scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
                }
                `}
            </style>
            <div 
                className="bg-[#fcfcfc] dark:bg-[#1a1a1a] w-full max-w-[340px] rounded-[20px] sm:rounded-[24px] p-4 sm:p-5 shadow-2xl relative flex flex-col max-h-[90vh] overflow-y-auto subtle-scrollbar"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-base sm:text-lg font-extrabold text-center text-[#102218] dark:text-white mb-3 sm:mb-4 leading-tight tracking-tight">
                    Funcionalidades sin internet
                </h2>

                <div className="space-y-2 sm:space-y-2.5">
                    {/* Ventas */}
                    <div className="bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/10 rounded-xl sm:rounded-2xl p-3 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="size-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                                <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[16px] sm:text-[18px]">
                                    point_of_sale
                                </span>
                            </div>
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-[13px] sm:text-[14px]">Ventas y Clientes</h3>
                        </div>
                        <ul className="space-y-1 text-[12px] sm:text-[13px] font-medium text-gray-600 dark:text-gray-400 ml-1">
                            <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-gray-400"></span>Realizar ventas</li>
                            <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-gray-400"></span>Imprimir tickets de venta</li>
                            <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-gray-400"></span>Crear clientes nuevos</li>
                            <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-gray-400"></span>Abonos de clientes</li>
                        </ul>
                    </div>

                    {/* Gastos e Inventario */}
                    <div className="bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/10 rounded-xl sm:rounded-2xl p-3 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="size-7 sm:w-8 sm:h-8 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
                                <span className="material-symbols-outlined text-orange-600 dark:text-orange-400 text-[16px] sm:text-[18px]">
                                    inventory_2
                                </span>
                            </div>
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-[13px] sm:text-[14px]">Gastos e Inventario</h3>
                        </div>
                        <ul className="space-y-1 text-[12px] sm:text-[13px] font-medium text-gray-600 dark:text-gray-400 ml-1">
                            <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-gray-400"></span>Registrar gastos</li>
                            <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-gray-400"></span>Compra de inventario</li>
                            <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-gray-400"></span>Registrar mermas</li>
                            <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-gray-400"></span>Abonos a proveedores</li>
                        </ul>
                    </div>

                    {/* Movimientos de caja */}
                    <div className="bg-gray-50 dark:bg-black/20 border border-gray-100 dark:border-white/10 rounded-xl sm:rounded-2xl p-3 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="size-7 sm:w-8 sm:h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                                <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-[16px] sm:text-[18px]">
                                    account_balance_wallet
                                </span>
                            </div>
                            <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-[13px] sm:text-[14px]">Movimientos de caja</h3>
                        </div>
                        <ul className="space-y-1 text-[12px] sm:text-[13px] font-medium text-gray-600 dark:text-gray-400 ml-1">
                            <li className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-gray-400"></span>Registrar movimientos</li>
                        </ul>
                    </div>

                    {/* Nota */}
                    <div className="bg-[#f6fae6] dark:bg-lime-950/30 border border-[#e3f0a3] dark:border-lime-900/50 rounded-xl sm:rounded-2xl p-3 shadow-sm">
                        <div className="flex gap-3 items-center">
                            <div className="size-8 sm:w-10 sm:h-10 rounded-full bg-[#c2f241] flex-shrink-0 flex items-center justify-center shadow-sm">
                                <span className="material-symbols-outlined text-[#3d5204] text-[18px] sm:text-[20px] font-bold">
                                    warning
                                </span>
                            </div>
                            <div>
                                <h4 className="font-semibold text-[#102218] dark:text-white text-[13px] sm:text-[14px]">Nota</h4>
                                <p className="text-[11px] sm:text-[12px] text-gray-800 dark:text-gray-200 mt-0.5 font-medium leading-snug">
                                    Todo se sincronizará al recuperar la conexión.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-4 sm:mt-5 flex justify-center">
                    <button
                        onClick={onClose}
                        className="bg-[#00d084] hover:bg-[#00b874] text-white font-bold text-[14px] sm:text-[15px] rounded-xl py-2 sm:py-2.5 px-6 flex items-center justify-center gap-2 shadow-lg transition-transform active:scale-95 w-full max-w-[180px]"
                    >
                        Aceptar
                        <div className="size-6 rounded-full bg-[#102218] flex items-center justify-center">
                            <span className="material-symbols-outlined text-white text-[16px]">
                                chevron_right
                            </span>
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
};
