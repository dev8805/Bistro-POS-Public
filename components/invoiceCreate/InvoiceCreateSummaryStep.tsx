import React from 'react';
import type { DetectionResult } from '../../lib/invoiceCreate/detectExisting';

interface InvoiceCreateSummaryStepProps {
    detection: DetectionResult;
    onStartCreating: () => void;
    onCancel: () => void;
}

export const InvoiceCreateSummaryStep: React.FC<InvoiceCreateSummaryStepProps> = ({
    detection,
    onStartCreating,
    onCancel,
}) => {
    const { newLines, existingLines } = detection;
    const hasNew = newLines.length > 0;

    return (
        <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-gray-950">
            {/* Header */}
            <header className="shrink-0 px-5 pt-5 pb-3 flex items-center gap-3">
                <button
                    type="button"
                    onClick={onCancel}
                    className="size-9 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-gray-800 transition-colors"
                    aria-label="Volver"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onCancel(); }}
                >
                    <span className="material-symbols-outlined text-xl text-slate-600 dark:text-gray-300">arrow_back</span>
                </button>
                <h1 className="text-lg font-black text-slate-900 dark:text-white">Productos detectados</h1>
            </header>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-5">
                {/* Info card */}
                <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-4">
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                        Se encontraron {newLines.length + existingLines.length} productos en la factura
                    </p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-gray-400">
                        {hasNew
                            ? `${newLines.length} nuevos por crear · ${existingLines.length} ya existen en tu catálogo`
                            : 'Todos ya están en tu catálogo'}
                    </p>
                </div>

                {/* New products list */}
                {hasNew && (
                    <div className="space-y-2">
                        <p className="text-[11px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            Productos nuevos ({newLines.length})
                        </p>
                        <div className="space-y-1">
                            {newLines.map(line => (
                                <div key={line.id} className="flex items-center gap-2 rounded-xl bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-800 px-3 py-2.5">
                                    <span className="material-symbols-outlined text-base text-emerald-500">add_circle</span>
                                    <span className="flex-1 text-sm font-semibold text-slate-800 dark:text-gray-200 truncate">{line.ocrName}</span>
                                    {line.barcode && (
                                        <span className="text-[10px] font-mono text-slate-400 shrink-0">{line.barcode}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Existing products list */}
                {existingLines.length > 0 && (
                    <div className="space-y-2">
                        <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-gray-500">
                            Ya existen ({existingLines.length})
                        </p>
                        <div className="space-y-1">
                            {existingLines.map(({ line, matchedProduct }) => (
                                <div key={line.id} className="flex items-center gap-2 rounded-xl bg-white dark:bg-gray-900 border border-slate-100 dark:border-gray-800 px-3 py-2.5 opacity-60">
                                    <span className="material-symbols-outlined text-base text-slate-400">check</span>
                                    <span className="flex-1 text-sm font-medium text-slate-500 dark:text-gray-400 truncate">{matchedProduct.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* All exist message */}
                {!hasNew && (
                    <div className="flex flex-col items-center gap-3 py-6 text-center">
                        <span className="material-symbols-outlined text-4xl text-emerald-500">inventory_2</span>
                        <p className="text-sm font-bold text-slate-700 dark:text-gray-300">¡Todo al día!</p>
                        <p className="text-xs text-slate-500 dark:text-gray-400 max-w-xs">Todos los productos de esta factura ya están en tu catálogo.</p>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="shrink-0 px-5 pb-5 pt-3 space-y-2 border-t border-slate-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                {hasNew ? (
                    <button
                        type="button"
                        onClick={onStartCreating}
                        className="w-full h-12 bg-amber-400 hover:bg-amber-500 text-[#102218] font-black text-sm rounded-2xl transition-colors active:scale-[0.98]"
                        aria-label={`Crear ${newLines.length} productos nuevos`}
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onStartCreating(); }}
                    >
                        {`Crear ${newLines.length} producto${newLines.length > 1 ? 's' : ''} \u2192`}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={onCancel}
                        className="w-full h-12 bg-amber-400 hover:bg-amber-500 text-[#102218] font-black text-sm rounded-2xl transition-colors active:scale-[0.98]"
                        aria-label="Volver al catálogo"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onCancel(); }}
                    >
                        Volver al catálogo
                    </button>
                )}
            </div>
        </div>
    );
};
