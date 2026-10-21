import React from 'react';

interface UpgradeProModalProps {
    isOpen: boolean;
    onClose: () => void;
    featureName: string;
    featureDescription?: string;
    onUpgrade?: () => void;
}

export const UpgradeProModal: React.FC<UpgradeProModalProps> = ({
    isOpen,
    onClose,
    featureName,
    featureDescription,
    onUpgrade,
}) => {
    if (!isOpen) return null;

    const handleUpgradeClick = () => {
        onClose();
        if (onUpgrade) {
            onUpgrade();
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
            role="dialog"
            aria-modal="true"
            aria-label={`Actualizar a Plan Pro para ${featureName}`}
        >
            <div className="bg-white dark:bg-slate-900 border border-amber-300/60 dark:border-amber-500/40 rounded-3xl max-w-md w-full p-6 shadow-2xl relative overflow-hidden">
                {/* Decorative background glow */}
                <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-400/20 rounded-full blur-2xl pointer-events-none" />
                <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                    aria-label="Cerrar"
                >
                    <span className="material-symbols-outlined text-lg">close</span>
                </button>

                <div className="text-center pt-2">
                    {/* Crown Icon */}
                    <div className="size-14 mx-auto mb-4 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-300 text-stone-900 flex items-center justify-center shadow-lg shadow-amber-500/20">
                        <span className="material-symbols-outlined text-3xl font-bold">crown</span>
                    </div>

                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300/60 mb-2">
                        <span className="material-symbols-outlined text-[14px]">star</span>
                        Función de Plan Pro
                    </span>

                    <h3 className="text-xl font-extrabold text-gray-900 dark:text-white mt-1 mb-2">
                        {featureName}
                    </h3>

                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
                        {featureDescription || 'Esta herramienta está diseñada para negocios que necesitan control avanzado de mesas, comandas, recetas, auditoría de estantes o personal ilimitado.'}
                    </p>

                    <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 mb-6 text-center">
                        <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                            Actualiza al <span className="font-extrabold">Plan Pro</span> desde solo <span className="font-extrabold">$58.333 COP/mes</span>
                        </p>
                    </div>

                    <div className="flex flex-col gap-2.5">
                        {onUpgrade && (
                            <button
                                onClick={handleUpgradeClick}
                                className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-stone-900 font-extrabold text-sm rounded-xl shadow-md shadow-amber-500/20 hover:shadow-lg transition-all flex items-center justify-center gap-2"
                            >
                                <span className="material-symbols-outlined text-lg">rocket_launch</span>
                                <span>Ver Planes y Actualizar</span>
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="w-full py-2.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium text-xs transition-colors"
                        >
                            Continuar en Plan Estándar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
