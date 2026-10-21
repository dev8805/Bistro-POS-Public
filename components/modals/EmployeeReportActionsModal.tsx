import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { EmployeeReportData } from '../../lib/buildEmployeeReport';
import {
    downloadEmployeeReportPDF,
    shareEmployeeReportPDF,
    printEmployeeReportPDF,
    sendEmployeeReportByEmail,
} from '../../lib/exportEmployeeReportPDF';
import { useToast } from '../../context/ToastContext';

interface EmployeeReportActionsModalProps {
    isOpen: boolean;
    data: EmployeeReportData | null;
    onClose: () => void;
    onViewEvents?: (employeeId: string) => void;
}

const isMobileDevice = (): boolean =>
    typeof navigator !== 'undefined' &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

type ActionId = 'print' | 'download' | 'whatsapp' | 'email';

export const EmployeeReportActionsModal: React.FC<EmployeeReportActionsModalProps> = ({
    isOpen,
    data,
    onClose,
    onViewEvents,
}) => {
    const { showToast } = useToast();
    const [busy, setBusy] = useState<ActionId | null>(null);
    const [emailStep, setEmailStep] = useState(false);
    const [email, setEmail] = useState('');
    const [emailError, setEmailError] = useState('');
    const [emailSuccess, setEmailSuccess] = useState(false);
    const [sendingEmail, setSendingEmail] = useState(false);
    const emailInputRef = useRef<HTMLInputElement>(null);

    const showWhatsApp = isMobileDevice();

    useEffect(() => {
        if (isOpen) {
            setEmailStep(false);
            setEmail('');
            setEmailError('');
            setEmailSuccess(false);
            setBusy(null);
        }
    }, [isOpen]);

    useEffect(() => {
        if (emailStep) {
            const t = setTimeout(() => emailInputRef.current?.focus(), 100);
            return () => clearTimeout(t);
        }
    }, [emailStep]);

    if (!isOpen || !data) return null;
    if (typeof document === 'undefined') return null;

    const handlePrint = async () => {
        setBusy('print');
        try {
            await printEmployeeReportPDF(data);
            onClose();
        } catch (err: any) {
            showToast('Error al preparar la impresión', 'error');
        } finally {
            setBusy(null);
        }
    };

    const handleDownload = async () => {
        setBusy('download');
        try {
            await downloadEmployeeReportPDF(data);
            showToast('Reporte descargado', 'success');
            onClose();
        } catch {
            showToast('Error al descargar el reporte', 'error');
        } finally {
            setBusy(null);
        }
    };

    const handleWhatsApp = async () => {
        setBusy('whatsapp');
        try {
            await shareEmployeeReportPDF(data);
            onClose();
        } catch {
            showToast('Error al compartir el reporte', 'error');
        } finally {
            setBusy(null);
        }
    };

    const validateEmail = (value: string): boolean =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

    const handleSendEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        setEmailError('');
        if (!email.trim()) {
            setEmailError('Ingresa un correo electrónico');
            return;
        }
        if (!validateEmail(email)) {
            setEmailError('Ingresa un correo válido');
            return;
        }
        if (!navigator.onLine) {
            setEmailError('Necesitas conexión a internet');
            return;
        }
        setSendingEmail(true);
        try {
            const ok = await sendEmployeeReportByEmail(data, email);
            if (ok) {
                setEmailSuccess(true);
                setTimeout(() => onClose(), 2000);
            } else {
                setEmailError('No se pudo enviar. Intenta de nuevo.');
            }
        } catch {
            setEmailError('Error al enviar. Verifica tu conexión.');
        } finally {
            setSendingEmail(false);
        }
    };

    const actionCard = (
        id: ActionId,
        icon: string,
        label: string,
        onClick: () => void,
        accent: string
    ) => (
        <button
            onClick={onClick}
            disabled={busy !== null}
            aria-label={label}
            tabIndex={0}
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B1120] hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]`}
        >
            <span className={`size-11 rounded-full flex items-center justify-center ${accent}`}>
                <span className={`material-symbols-outlined text-[22px] ${busy === id ? 'animate-spin' : ''}`}>
                    {busy === id ? 'sync' : icon}
                </span>
            </span>
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{label}</span>
        </button>
    );

    return createPortal(
        <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Acciones del reporte"
        >
            <div
                className="w-full max-w-sm bg-white dark:bg-[#151e32] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-[scaleIn_0.2s_ease-out]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 min-w-0">
                        {emailStep && !emailSuccess && (
                            <button
                                onClick={() => setEmailStep(false)}
                                aria-label="Volver"
                                className="size-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 shrink-0"
                            >
                                <span className="material-symbols-outlined text-xl">arrow_back</span>
                            </button>
                        )}
                        <div className="min-w-0">
                            <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                                {emailStep ? 'Enviar por correo' : `Reporte de ${data.employee.name}`}
                            </h3>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{data.period.label}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Cerrar"
                        className="size-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 shrink-0"
                    >
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>

                {/* Body */}
                {emailSuccess ? (
                    <div className="p-8 text-center">
                        <div className="size-16 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                            <span className="material-symbols-outlined text-3xl text-emerald-600">check_circle</span>
                        </div>
                        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">¡Enviado!</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">El reporte fue enviado a {email}</p>
                    </div>
                ) : emailStep ? (
                    <form onSubmit={handleSendEmail} className="p-5">
                        <label htmlFor="report-email" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                            Correo del destinatario
                        </label>
                        <input
                            ref={emailInputRef}
                            id="report-email"
                            type="email"
                            value={email}
                            onChange={(e) => { setEmail(e.target.value); setEmailError(''); }}
                            placeholder="dueño@ejemplo.com"
                            disabled={sendingEmail}
                            autoComplete="email"
                            className={`w-full h-12 px-4 rounded-xl border bg-white dark:bg-[#0B1120] text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition-all ${emailError ? 'border-red-500 focus:ring-2 focus:ring-red-500/20' : 'border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20'}`}
                        />
                        {emailError && (
                            <p className="mt-2 text-sm text-red-500 flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">error</span>
                                {emailError}
                            </p>
                        )}
                        <p className="text-[11px] text-slate-400 mt-3 mb-4">El reporte se enviará como PDF adjunto.</p>
                        <button
                            type="submit"
                            disabled={sendingEmail || !email.trim()}
                            className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                        >
                            {sendingEmail ? (
                                <><span className="material-symbols-outlined text-xl animate-spin">sync</span> Enviando...</>
                            ) : (
                                <><span className="material-symbols-outlined text-xl">send</span> Enviar reporte</>
                            )}
                        </button>
                    </form>
                ) : (
                    <>
                        <div className={`p-5 grid gap-3 ${showWhatsApp ? 'grid-cols-2' : 'grid-cols-3'}`}>
                            {actionCard('print', 'print', 'Imprimir', handlePrint, 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400')}
                            {actionCard('download', 'file_download', 'Descargar', handleDownload, 'bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400')}
                            {showWhatsApp && actionCard('whatsapp', 'share', 'WhatsApp', handleWhatsApp, 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400')}
                            {actionCard('email', 'email', 'Correo', () => setEmailStep(true), 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400')}
                        </div>
                        {onViewEvents && (
                            <div className="px-5 pb-5 -mt-1">
                                <button
                                    onClick={() => { onViewEvents(data.employee.id); onClose(); }}
                                    aria-label="Ver eventos de este empleado"
                                    tabIndex={0}
                                    className="w-full h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[18px]">history</span>
                                    Ver eventos de este empleado
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>,
        document.body
    );
};
