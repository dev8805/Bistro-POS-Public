import { useEffect, useRef } from 'react';
import { getTypeChangeWarnings, type ProductTypeKey } from '../lib/productTypeChange';

interface TypeChangeWarningModalProps {
    isOpen: boolean;
    fromType: ProductTypeKey;
    toType: ProductTypeKey;
    onConfirm: () => void;
    onCancel: () => void;
}

const TYPE_LABELS: Record<ProductTypeKey, string> = {
    sale: 'Producto para venta',
    insumo: 'Ingrediente',
    processed: 'Receta',
};

const TypeChangeWarningModal = ({
    isOpen,
    fromType,
    toType,
    onConfirm,
    onCancel,
}: TypeChangeWarningModalProps) => {
    const cancelButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!isOpen) return;
        const id = window.setTimeout(() => {
            cancelButtonRef.current?.focus();
        }, 50);
        return () => window.clearTimeout(id);
    }, [isOpen]);

    if (!isOpen) return null;
    if (fromType === toType) return null;

    const warnings = getTypeChangeWarnings(fromType, toType);
    const fromLabel = TYPE_LABELS[fromType];
    const toLabel = TYPE_LABELS[toType];

    const handleBackdropKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape') onCancel();
    };

    return (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                role="button"
                tabIndex={-1}
                onClick={onCancel}
                onKeyDown={handleBackdropKeyDown}
                aria-label="Cerrar aviso de cambio de tipo"
            />

            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="type-change-title"
                aria-describedby="type-change-desc"
                className="relative w-full max-w-md bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-[scaleIn_0.2s_ease-out]"
            >
                <div className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="size-11 shrink-0 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                        <span
                            className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[24px]"
                            aria-hidden
                        >
                            warning
                        </span>
                    </div>
                    <h2
                        id="type-change-title"
                        className="text-base font-bold text-text-main dark:text-white leading-tight"
                    >
                        Cambiar tipo de producto
                    </h2>
                </div>

                <div className="p-4 space-y-3">
                    <p
                        id="type-change-desc"
                        className="text-sm text-text-main dark:text-gray-200 leading-relaxed"
                    >
                        Vas a cambiar de{' '}
                        <span className="font-bold">{fromLabel}</span> a{' '}
                        <span className="font-bold">{toLabel}</span>.
                    </p>

                    {warnings.length > 0 && (
                        <ul className="list-disc list-outside pl-5 space-y-1.5 text-sm text-text-secondary dark:text-gray-300 leading-relaxed">
                            {warnings.map((warning) => (
                                <li key={warning}>{warning}</li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="p-4 pt-0 flex gap-3">
                    <button
                        ref={cancelButtonRef}
                        onClick={onCancel}
                        className="flex-1 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-text-main dark:text-white font-bold text-sm transition-colors"
                        aria-label="Cancelar cambio de tipo"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 h-12 rounded-xl bg-primary hover:bg-primary-hover text-[#102218] font-bold text-sm shadow-lg shadow-primary/20 transition-all"
                        aria-label="Confirmar cambio de tipo"
                    >
                        Entiendo, cambiar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TypeChangeWarningModal;
