import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface AddToHomeScreenModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const AddToHomeScreenModal: React.FC<AddToHomeScreenModalProps> = ({ isOpen, onClose }) => {
    const [activePlatform, setActivePlatform] = useState<'android' | 'ios'>('android');
    const [hasInstallPrompt, setHasInstallPrompt] = useState<boolean>(false);
    const [installSuccess, setInstallSuccess] = useState<boolean>(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!isOpen) return;

        const isIosDevice = /iphone|ipad|ipod/i.test(navigator.userAgent);
        setActivePlatform(isIosDevice ? 'ios' : 'android');

        // Posicionar la URL en /gastos y cargar el manifest específico de Gastos
        window.history.pushState(null, '', '/gastos');
        document.title = 'Gastos - Bistro';
        const mLink = document.getElementById('pwa-manifest') || document.querySelector('link[rel="manifest"]');
        if (mLink) mLink.setAttribute('href', '/manifest-gastos.json');

        const checkPrompt = () => {
            const prompt = (window as any).__bistroInstallPrompt;
            setHasInstallPrompt(!!prompt);
        };

        checkPrompt();
        window.addEventListener('bistro-install-prompt-ready', checkPrompt);

        return () => {
            window.removeEventListener('bistro-install-prompt-ready', checkPrompt);
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const handleClose = () => {
        if (typeof window !== 'undefined' && window.location.pathname === '/gastos') {
            window.history.replaceState(null, '', '/');
            document.title = 'Bistro POS';
            const mLink = document.getElementById('pwa-manifest') || document.querySelector('link[rel="manifest"]');
            if (mLink) mLink.setAttribute('href', '/manifest.json');
        }
        onClose();
    };

    const handleOverlayClick = () => {
        handleClose();
    };

    const handleModalClick = (e: React.MouseEvent) => {
        e.stopPropagation();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            handleClose();
        }
    };

    const handleInstallClick = async () => {
        const promptEvent = (window as any).__bistroInstallPrompt;
        if (promptEvent) {
            try {
                await promptEvent.prompt();
                const choice = await promptEvent.userChoice;
                if (choice?.outcome === 'accepted') {
                    (window as any).__bistroInstallPrompt = null;
                    setHasInstallPrompt(false);
                    setInstallSuccess(true);
                    setTimeout(() => {
                        handleClose();
                    }, 1800);
                }
            } catch {
                // Fallback a instrucciones nativas
            }
        }
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
            onClick={handleOverlayClick}
            onKeyDown={handleKeyDown}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcut-modal-title"
            tabIndex={-1}
        >
            <div
                className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl animate-[scaleIn_0.2s_ease-out] flex flex-col gap-4 border border-slate-100"
                onClick={handleModalClick}
            >
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="size-11 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 shadow-sm">
                        <span className="material-symbols-outlined text-[24px]">add_to_home_screen</span>
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 id="shortcut-modal-title" className="text-base font-bold text-slate-900 leading-tight">
                            Acceso directo a Gastos
                        </h3>
                        <p className="text-[11px] font-medium text-slate-500">
                            Ruta: posbistro.online/gastos
                        </p>
                    </div>
                </div>

                {/* Platform Selector Tabs */}
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
                    <button
                        type="button"
                        onClick={() => setActivePlatform('android')}
                        className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                            activePlatform === 'android'
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                        aria-label="Ver instrucciones para Android"
                    >
                        <span className="material-symbols-outlined text-[16px] text-emerald-600">android</span>
                        Android / Chrome
                    </button>
                    <button
                        type="button"
                        onClick={() => setActivePlatform('ios')}
                        className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                            activePlatform === 'ios'
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                        aria-label="Ver instrucciones para iPhone o iPad"
                    >
                        <span className="material-symbols-outlined text-[16px] text-sky-600">phone_iphone</span>
                        iPhone / iPad
                    </button>
                </div>

                {/* Contenido según Plataforma */}
                {installSuccess ? (
                    <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-center flex flex-col items-center gap-2">
                        <span className="material-symbols-outlined text-emerald-600 text-[32px]">check_circle</span>
                        <p className="text-sm font-bold text-emerald-900">¡Instalado con éxito!</p>
                        <p className="text-xs text-emerald-700">El acceso directo a Gastos ya está en tu pantalla de inicio.</p>
                    </div>
                ) : activePlatform === 'android' ? (
                    <div className="flex flex-col gap-3">
                        {/* Botón directo de un solo clic si el navegador permite el prompt de instalación */}
                        {hasInstallPrompt ? (
                            <button
                                type="button"
                                onClick={handleInstallClick}
                                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:scale-[0.98] text-white text-sm font-bold shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 transition-all"
                                aria-label="Instalar en pantalla de inicio"
                            >
                                <span className="material-symbols-outlined text-[20px]">download</span>
                                <span>Instalar icono de Gastos al inicio</span>
                            </button>
                        ) : null}

                        {/* Explicación paso a paso para Android */}
                        <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100 text-xs text-slate-700 flex flex-col gap-3">
                            <p className="font-bold text-slate-900 text-[11px] uppercase tracking-wider text-slate-500">
                                {hasInstallPrompt ? 'O desde el icono en tu pantalla:' : 'Para colocar el icono exclusivo de Gastos:'}
                            </p>
                            <div className="flex gap-2.5 items-start">
                                <span className="size-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">
                                    1
                                </span>
                                <p className="leading-snug">
                                    En tu pantalla de inicio, <strong>mantén presionado el icono de Bistro POS</strong>.
                                </p>
                            </div>
                            <div className="flex gap-2.5 items-start">
                                <span className="size-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">
                                    2
                                </span>
                                <p className="leading-snug">
                                    Aparecerá el atajo <strong>"Gastos"</strong> con la <strong>G roja</strong>.
                                </p>
                            </div>
                            <div className="flex gap-2.5 items-start">
                                <span className="size-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">
                                    3
                                </span>
                                <p className="leading-snug">
                                    <strong>Mantén presionado "Gastos" y arrástralo</strong> a tu pantalla de inicio.
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* iOS / Safari */
                    <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100 text-xs text-slate-700 flex flex-col gap-3">
                        <div className="flex gap-2.5 items-start">
                            <span className="size-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">
                                1
                            </span>
                            <p className="leading-snug">
                                En Safari, toca el botón <strong>Compartir</strong> (icono de cuadrado con flecha hacia arriba <span className="font-mono">⎋</span>).
                            </p>
                        </div>
                        <div className="flex gap-2.5 items-start">
                            <span className="size-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">
                                2
                            </span>
                            <p className="leading-snug">
                                Desliza hacia abajo y selecciona <strong>"Agregar al inicio"</strong>.
                            </p>
                        </div>
                        <div className="flex gap-2.5 items-start">
                            <span className="size-5 rounded-full bg-sky-600 text-white flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5">
                                3
                            </span>
                            <p className="leading-snug">
                                Aparecerá automáticamente con el nombre <strong>"Gastos"</strong> y la ruta <strong>/gastos</strong>. Toca <strong>Agregar</strong>.
                            </p>
                        </div>
                    </div>
                )}

                {/* Close Button */}
                <button
                    type="button"
                    onClick={handleClose}
                    className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white text-xs font-bold transition-colors text-center"
                    aria-label="Cerrar ventana de ayuda"
                >
                    Entendido
                </button>
            </div>
        </div>,
        document.body
    );
};
