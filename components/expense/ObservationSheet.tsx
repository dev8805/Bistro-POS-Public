import React, { useState } from 'react';

interface ObservationSheetProps {
    initialValue: string;
    onSave: (value: string) => void;
    onClose: () => void;
}

export const ObservationSheet: React.FC<ObservationSheetProps> = ({ initialValue, onSave, onClose }) => {
    const [value, setValue] = useState(initialValue);

    const handleDone = () => {
        onSave(value);
        onClose();
    };

    return (
        <div className="absolute inset-0 z-[90] flex flex-col bg-surface-light dark:bg-surface-dark animate-[fadeIn_0.15s_ease-out]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-[max(16px,env(safe-area-inset-top))] pb-3 border-b border-border-light dark:border-border-dark shrink-0">
                <h2 className="text-sm font-black uppercase tracking-[0.12em] text-text-main dark:text-white">
                    Observación
                </h2>
                <button
                    type="button"
                    onClick={onClose}
                    className="size-9 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-300 active:scale-90 transition-all"
                    aria-label="Cerrar"
                >
                    <span className="material-symbols-outlined text-2xl">close</span>
                </button>
            </div>

            {/* Textarea grande */}
            <div className="flex-1 min-h-0 px-5 py-4">
                <textarea
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    placeholder="Describe el gasto con detalle..."
                    className="w-full h-full resize-none px-5 py-4 bg-white dark:bg-black/20 border border-gray-200 dark:border-gray-700 rounded-2xl focus:outline-none focus:border-red-500 transition-all font-bold text-sm text-gray-800 dark:text-white placeholder:text-gray-400 shadow-sm"
                    autoFocus
                />
            </div>

            {/* Footer */}
            <div className="px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] border-t border-border-light dark:border-border-dark shrink-0">
                <button
                    type="button"
                    onClick={handleDone}
                    className="w-full h-12 flex items-center justify-center gap-2 bg-status-error hover:bg-red-600 text-white rounded-2xl font-black text-sm active:scale-[0.99] transition-all"
                >
                    <span className="material-symbols-outlined text-[20px]">check</span>
                    Listo
                </button>
            </div>
        </div>
    );
};
