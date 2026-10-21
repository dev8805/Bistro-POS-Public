import React from 'react';

interface CreatedProduct {
    id: string;
    name: string;
}

interface InvoiceCreateDoneStepProps {
    createdProducts: CreatedProduct[];
    onGoBack: () => void;
}

export const InvoiceCreateDoneStep: React.FC<InvoiceCreateDoneStepProps> = ({
    createdProducts,
    onGoBack,
}) => {
    const count = createdProducts.length;

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-gray-950">
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center gap-5">
                {count > 0 ? (
                    <>
                        <div className="size-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                            <span className="material-symbols-outlined text-[32px] text-emerald-600 dark:text-emerald-400" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        </div>
                        <div>
                            <p className="text-xl font-black text-slate-900 dark:text-white">
                                {count} producto{count > 1 ? 's' : ''} creado{count > 1 ? 's' : ''}
                            </p>
                            <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
                                Ya están en tu catálogo listos para vender.
                            </p>
                        </div>
                        <div className="w-full max-w-xs space-y-1 mt-2">
                            {createdProducts.map(p => (
                                <div key={p.id} className="flex items-center gap-2 rounded-xl bg-white dark:bg-gray-900 border border-emerald-200 dark:border-emerald-800 px-3 py-2">
                                    <span className="material-symbols-outlined text-sm text-emerald-500">check</span>
                                    <span className="text-sm font-semibold text-slate-700 dark:text-gray-300 truncate">{p.name}</span>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="size-16 rounded-full bg-slate-100 dark:bg-gray-800 flex items-center justify-center">
                            <span className="material-symbols-outlined text-[32px] text-slate-400">info</span>
                        </div>
                        <div>
                            <p className="text-lg font-black text-slate-900 dark:text-white">No se crearon productos</p>
                            <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
                                Todos los productos fueron omitidos o ya existían.
                            </p>
                        </div>
                    </>
                )}
            </div>

            <div className="shrink-0 px-5 pb-5 pt-3 border-t border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                <button
                    type="button"
                    onClick={onGoBack}
                    className="w-full h-12 bg-amber-400 hover:bg-amber-500 text-[#102218] font-black text-sm rounded-2xl transition-colors active:scale-[0.98]"
                    aria-label="Volver al catálogo"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onGoBack(); }}
                >
                    Volver al catálogo
                </button>
            </div>
        </div>
    );
};
