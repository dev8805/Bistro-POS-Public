import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export type ConfirmVariant = 'danger' | 'warning' | 'info';

export interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    loadingText?: string;
    variant?: ConfirmVariant;
    onConfirm?: () => Promise<void>;
}

interface ConfirmDialogState extends ConfirmOptions {
    isOpen: boolean;
    isLoading: boolean;
}

interface ConfirmDialogContextType {
    dialogState: ConfirmDialogState;
    confirmAction: (options: ConfirmOptions) => Promise<boolean>;
    handleConfirm: () => void;
    handleCancel: () => void;
}

const defaultState: ConfirmDialogState = {
    isOpen: false,
    isLoading: false,
    title: '',
    message: '',
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
    variant: 'danger',
};

const ConfirmDialogContext = createContext<ConfirmDialogContextType | null>(null);

export const useConfirmDialog = () => {
    const ctx = useContext(ConfirmDialogContext);
    if (!ctx) {
        return {
            dialogState: defaultState,
            confirmAction: async (options: ConfirmOptions) => {
                if (typeof window !== 'undefined' && window.confirm) {
                    return window.confirm(options.message || options.title);
                }
                return true;
            },
            handleConfirm: () => {},
            handleCancel: () => {},
        };
    }
    return ctx;
};

export const ConfirmDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [dialogState, setDialogState] = useState<ConfirmDialogState>(defaultState);
    const resolveRef = useRef<((value: boolean) => void) | null>(null);

    const confirmAction = useCallback((options: ConfirmOptions): Promise<boolean> => {
        return new Promise<boolean>((resolve) => {
            resolveRef.current = resolve;
            setDialogState({
                isOpen: true,
                isLoading: false,
                title: options.title,
                message: options.message,
                confirmText: options.confirmText || 'Confirmar',
                cancelText: options.cancelText || 'Cancelar',
                loadingText: options.loadingText,
                variant: options.variant || 'danger',
                onConfirm: options.onConfirm,
            });
        });
    }, []);

    const handleConfirm = useCallback(async () => {
        if (dialogState.onConfirm) {
            setDialogState((prev) => ({ ...prev, isLoading: true }));
            try {
                await dialogState.onConfirm();
            } finally {
                resolveRef.current?.(true);
                resolveRef.current = null;
                setDialogState(defaultState);
            }
        } else {
            resolveRef.current?.(true);
            resolveRef.current = null;
            setDialogState(defaultState);
        }
    }, [dialogState.onConfirm]);

    const handleCancel = useCallback(() => {
        resolveRef.current?.(false);
        resolveRef.current = null;
        setDialogState(defaultState);
    }, []);

    return (
        <ConfirmDialogContext.Provider value={{ dialogState, confirmAction, handleConfirm, handleCancel }}>
            {children}
        </ConfirmDialogContext.Provider>
    );
};
