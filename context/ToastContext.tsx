import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
    id: number;
    message: string;
    type: ToastType;
    /** Segunda línea opcional en tono más suave, para dar contexto extra. */
    description?: string;
}

interface ToastContextType {
    toasts: ToastItem[];
    showToast: (message: string, type?: ToastType, duration?: number, description?: string) => void;
    dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = (): ToastContextType => {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        return {
            toasts: [],
            showToast: () => {},
            dismissToast: () => {},
        };
    }
    return ctx;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const idRef = useRef(0);

    const dismissToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const showToast = useCallback((message: string, type: ToastType = 'info', duration = 3500, description?: string) => {
        const id = ++idRef.current;
        setToasts(prev => [...prev, { id, message, type, description }]);
        setTimeout(() => dismissToast(id), duration);
    }, [dismissToast]);

    return (
        <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
            {children}
        </ToastContext.Provider>
    );
};
