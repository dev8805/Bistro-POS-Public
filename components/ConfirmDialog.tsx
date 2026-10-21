import React, { useEffect, useRef } from 'react';
import { useConfirmDialog } from '../context/ConfirmDialogContext';

const variantColors = {
    danger: { btn: '#ef4444', btnHover: '#dc2626', icon: '🗑️' },
    warning: { btn: '#f59e0b', btnHover: '#d97706', icon: '⚠️' },
    info: { btn: '#3b82f6', btnHover: '#2563eb', icon: 'ℹ️' },
};

export const ConfirmDialog: React.FC = () => {
    const { dialogState, handleConfirm, handleCancel } = useConfirmDialog();
    const cancelRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (dialogState.isOpen) {
            cancelRef.current?.focus();
        }
    }, [dialogState.isOpen]);

    useEffect(() => {
        if (!dialogState.isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleCancel();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [dialogState.isOpen, handleCancel]);

    if (!dialogState.isOpen) return null;

    const colors = variantColors[dialogState.variant || 'danger'];

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 99999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0,0,0,0.5)',
                animation: 'confirmFadeIn 0.2s ease-out',
            }}
            onClick={handleCancel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
        >
            <div
                style={{
                    backgroundColor: '#fff',
                    borderRadius: '16px',
                    padding: '28px',
                    maxWidth: '420px',
                    width: '90%',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                    animation: 'confirmScaleIn 0.2s ease-out',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ textAlign: 'center', marginBottom: '16px', fontSize: '32px' }}>
                    {colors.icon}
                </div>
                <h3
                    id="confirm-dialog-title"
                    style={{
                        margin: '0 0 8px',
                        fontSize: '18px',
                        fontWeight: 700,
                        textAlign: 'center',
                        color: '#1f2937',
                    }}
                >
                    {dialogState.title}
                </h3>
                <p
                    style={{
                        margin: '0 0 24px',
                        fontSize: '14px',
                        textAlign: 'center',
                        color: '#6b7280',
                        lineHeight: 1.5,
                    }}
                >
                    {dialogState.message}
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button
                        ref={cancelRef}
                        onClick={dialogState.isLoading ? undefined : handleCancel}
                        disabled={dialogState.isLoading}
                        aria-label="Cancelar"
                        tabIndex={0}
                        style={{
                            flex: 1,
                            padding: '10px 20px',
                            borderRadius: '10px',
                            border: '1px solid #e5e7eb',
                            backgroundColor: '#f9fafb',
                            color: dialogState.isLoading ? '#9ca3af' : '#374151',
                            fontSize: '14px',
                            fontWeight: 600,
                            cursor: dialogState.isLoading ? 'not-allowed' : 'pointer',
                            opacity: dialogState.isLoading ? 0.7 : 1,
                            transition: 'background-color 0.15s',
                        }}
                        onMouseEnter={(e) => { if (!dialogState.isLoading) e.currentTarget.style.backgroundColor = '#f3f4f6'; }}
                        onMouseLeave={(e) => { if (!dialogState.isLoading) e.currentTarget.style.backgroundColor = '#f9fafb'; }}
                    >
                        {dialogState.cancelText}
                    </button>
                    <button
                        onClick={dialogState.isLoading ? undefined : handleConfirm}
                        disabled={dialogState.isLoading}
                        aria-label="Confirmar acción"
                        tabIndex={0}
                        style={{
                            flex: 1,
                            padding: '10px 20px',
                            borderRadius: '10px',
                            border: 'none',
                            backgroundColor: dialogState.isLoading ? '#9ca3af' : colors.btn,
                            color: '#fff',
                            fontSize: '14px',
                            fontWeight: 600,
                            cursor: dialogState.isLoading ? 'not-allowed' : 'pointer',
                            opacity: dialogState.isLoading ? 0.7 : 1,
                            transition: 'background-color 0.15s',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                        onMouseEnter={(e) => { if (!dialogState.isLoading) e.currentTarget.style.backgroundColor = colors.btnHover; }}
                        onMouseLeave={(e) => { if (!dialogState.isLoading) e.currentTarget.style.backgroundColor = colors.btn; }}
                    >
                        {dialogState.isLoading && (
                            <svg style={{ animation: 'confirmSpin 1s linear infinite', height: '16px', width: '16px', color: '#fff' }} fill="none" viewBox="0 0 24 24">
                                <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        )}
                        {dialogState.isLoading ? (dialogState.loadingText || 'Procesando...') : dialogState.confirmText}
                    </button>
                </div>
            </div>
            <style>{`
        @keyframes confirmFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes confirmScaleIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes confirmSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
};
