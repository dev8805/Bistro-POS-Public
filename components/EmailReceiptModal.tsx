import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface EmailReceiptModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSend: (email: string) => Promise<boolean>;
    isLoading?: boolean;
}

export const EmailReceiptModal: React.FC<EmailReceiptModalProps> = ({
    isOpen,
    onClose,
    onSend,
    isLoading = false,
}) => {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [sending, setSending] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setEmail('');
            setError('');
            setSuccess(false);
            const t = setTimeout(() => inputRef.current?.focus(), 100);
            return () => clearTimeout(t);
        }
    }, [isOpen]);

    const validateEmail = (email: string): boolean => {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!email.trim()) {
            setError('Por favor ingresa un correo electrónico');
            return;
        }

        if (!validateEmail(email)) {
            setError('Por favor ingresa un correo válido');
            return;
        }

        setSending(true);
        try {
            const result = await onSend(email);
            if (result) {
                setSuccess(true);
                setTimeout(() => {
                    onClose();
                }, 2000);
            } else {
                setError('No se pudo enviar el correo. Intenta de nuevo.');
            }
        } catch {
            setError('Error al enviar. Verifica tu conexión.');
        } finally {
            setSending(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            onClose();
        }
    };

    if (!isOpen) return null;
    if (typeof document === 'undefined') return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
            onClick={onClose}
            onKeyDown={handleKeyDown}
            role="dialog"
            aria-modal="true"
            aria-labelledby="email-modal-title"
        >
            <div
                className="w-full max-w-sm mx-4 bg-white dark:bg-surface-dark rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800 overflow-hidden animate-[scaleIn_0.2s_ease-out]"
                onClick={(e) => e.stopPropagation()}
            >
                {success ? (
                    <div className="p-8 text-center">
                        <div className="size-16 mx-auto mb-4 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                            <span className="material-symbols-outlined text-3xl text-green-600">check_circle</span>
                        </div>
                        <h3 className="text-xl font-semibold text-text-main dark:text-white mb-2">¡Enviado!</h3>
                        <p className="text-text-secondary text-sm">El comprobante fue enviado a {email}</p>
                    </div>
                ) : (
                    <>
                        <div className="p-6 border-b border-gray-200 dark:border-gray-800">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                                        <span className="material-symbols-outlined text-xl text-primary">email</span>
                                    </div>
                                    <h3 id="email-modal-title" className="text-lg font-semibold text-text-main dark:text-white">
                                        Enviar por Correo
                                    </h3>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="size-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center transition-colors"
                                    aria-label="Cerrar"
                                >
                                    <span className="material-symbols-outlined text-xl text-text-secondary">close</span>
                                </button>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6">
                            <div className="mb-4">
                                <label htmlFor="recipient-email" className="block text-sm font-medium text-text-main dark:text-white mb-2">
                                    Correo del destinatario
                                </label>
                                <input
                                    ref={inputRef}
                                    id="recipient-email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => {
                                        setEmail(e.target.value);
                                        setError('');
                                    }}
                                    placeholder="cliente@ejemplo.com"
                                    className={`w-full h-12 px-4 rounded-xl border bg-white dark:bg-background-dark text-text-main dark:text-white placeholder:text-text-secondary transition-all outline-none
                                        ${error
                                            ? 'border-red-500 focus:ring-2 focus:ring-red-500/20'
                                            : 'border-gray-200 dark:border-gray-700 focus:border-primary focus:ring-2 focus:ring-primary/20'
                                        }`}
                                    disabled={sending || isLoading}
                                    autoComplete="email"
                                />
                                {error && (
                                    <p className="mt-2 text-sm text-red-500 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-sm">error</span>
                                        {error}
                                    </p>
                                )}
                            </div>

                            <p className="text-xs text-text-secondary mb-4">
                                El comprobante será enviado como imagen adjunta al correo indicado.
                            </p>

                            <button
                                type="submit"
                                disabled={sending || isLoading || !email.trim()}
                                className="w-full h-12 rounded-xl bg-primary hover:bg-primary-hover text-[#102218] font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                            >
                                {sending ? (
                                    <>
                                        <span className="material-symbols-outlined text-xl animate-spin">sync</span>
                                        Enviando...
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-xl">send</span>
                                        Enviar Comprobante
                                    </>
                                )}
                            </button>
                        </form>
                    </>
                )}
            </div>
        </div>,
        document.body
    );
};
