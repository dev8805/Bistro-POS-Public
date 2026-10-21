import React from 'react';
import { useToast } from '../context/ToastContext';

const iconMap = {
    success: 'check_circle',
    error: 'cancel',
    warning: 'warning',
    info: 'info',
};

const styleMap: Record<string, string> = {
    success: 'bg-emerald-900/95 border-l-4 border-emerald-400 text-emerald-100',
    error:   'bg-red-900/95 border-l-4 border-red-400 text-red-100',
    warning: 'bg-amber-900/95 border-l-4 border-amber-400 text-amber-100',
    info:    'bg-blue-900/95 border-l-4 border-blue-400 text-blue-100',
};

const iconColorMap: Record<string, string> = {
    success: 'text-emerald-400',
    error:   'text-red-400',
    warning: 'text-amber-400',
    info:    'text-blue-400',
};

interface ToastRowProps {
    id: number;
    type: keyof typeof iconMap;
    message: string;
    description?: string;
    onDismiss: (id: number) => void;
    animationClass: string;
}

/**
 * Fila del toast. El cuerpo NO se cierra al hacer click (el usuario puede
 * necesitar leerlo). Solo el botón X con `aria-label="Cerrar notificación"`
 * dispara el dismiss. El toast igual se auto-cierra por timeout desde el
 * `ToastProvider` (duración configurable al llamar `showToast`).
 */
const ToastRow: React.FC<ToastRowProps> = ({ id, type, message, description, onDismiss, animationClass }) => {
    const handleDismiss = (e: React.MouseEvent | React.KeyboardEvent) => {
        e.stopPropagation();
        onDismiss(id);
    };

    return (
        <div
            role="alert"
            aria-live="assertive"
            className={`
                pointer-events-auto flex items-start gap-3 px-4 py-3
                rounded-xl shadow-2xl
                ${animationClass}
                ${styleMap[type]}
            `}
        >
            <span className={`material-symbols-outlined text-xl flex-shrink-0 mt-0.5 ${iconColorMap[type]}`}>
                {iconMap[type]}
            </span>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-snug">{message}</p>
                {description && (
                    <p className="text-xs opacity-80 leading-snug mt-0.5">{description}</p>
                )}
            </div>
            <button
                type="button"
                onClick={handleDismiss}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleDismiss(e)}
                aria-label="Cerrar notificación"
                className="flex-shrink-0 -mr-1 -mt-1 p-1 rounded-md opacity-70 hover:opacity-100 hover:bg-white/10 transition"
            >
                <span className="material-symbols-outlined text-base">close</span>
            </button>
        </div>
    );
};

export const AppToast: React.FC = () => {
    const { toasts, dismissToast } = useToast();

    if (toasts.length === 0) return null;

    return (
        <>
            {/* Mobile: top-center, full width con padding */}
            <div className="md:hidden fixed top-0 left-0 right-0 z-[99999] flex flex-col items-stretch gap-2 px-3 pt-3 pointer-events-none">
                {toasts.map((toast) => (
                    <ToastRow
                        key={toast.id}
                        id={toast.id}
                        type={toast.type}
                        message={toast.message}
                        description={toast.description}
                        onDismiss={dismissToast}
                        animationClass="animate-[toastDown_0.3s_ease-out] w-full"
                    />
                ))}
            </div>

            {/* Desktop: top-right, ancho fijo */}
            <div className="hidden md:flex fixed top-5 right-5 z-[99999] flex-col gap-2 w-[360px] pointer-events-none">
                {toasts.map((toast) => (
                    <ToastRow
                        key={toast.id}
                        id={toast.id}
                        type={toast.type}
                        message={toast.message}
                        description={toast.description}
                        onDismiss={dismissToast}
                        animationClass="animate-[toastSlideIn_0.3s_ease-out]"
                    />
                ))}
            </div>

            <style>{`
                @keyframes toastSlideIn {
                    from { opacity: 0; transform: translateX(40px); }
                    to   { opacity: 1; transform: translateX(0); }
                }
                @keyframes toastDown {
                    from { opacity: 0; transform: translateY(-16px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </>
    );
};
