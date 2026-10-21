import { useState } from 'react';
import SupportChatWidget from './rag/SupportChatWidget';

interface TrialExpiredScreenProps {
    /** true si el usuario tiene permiso admin_settings (ve botón de soporte + widget). */
    isAdmin: boolean;
    /** Cierra la sesión del usuario. */
    onLogout: () => void;
    /** Estado de conexión; requerido por SupportChatWidget. */
    isOnline: boolean;
}

/**
 * Pantalla de bloqueo que se muestra cuando la suscripción del negocio está en
 * estado de trial vencido (`subscription.status === 'trial'` sin suscripción
 * activa). Diferencia la experiencia según el rol:
 *
 * - Admin (`isAdmin=true`): mensaje explicativo + botón "Hablar con soporte" que
 *   abre el `SupportChatWidget` (chat de soporte dedicado y reducido) montado
 *   dentro de la propia pantalla.
 * - Empleado (`isAdmin=false`): mensaje que pide avisar al administrador. Sin
 *   botón de soporte y sin montar el `SupportChatWidget`.
 */
const TrialExpiredScreen = ({ isAdmin, onLogout, isOnline }: TrialExpiredScreenProps) => {
    const [chatOpen, setChatOpen] = useState(false);

    const handleOpenSupport = () => setChatOpen(true);
    const handleCloseChat = () => setChatOpen(false);

    // Variante empleado: sin botón de soporte, sin montar el SupportChatWidget.
    if (!isAdmin) {
        return (
            <div className="min-h-screen w-full bg-gradient-to-br from-gray-50 via-white to-emerald-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/20 flex flex-col items-center justify-center px-6 py-10 gap-6">
                <div className="text-center max-w-md">
                    <span className="material-symbols-outlined text-5xl text-amber-500">lock_clock</span>
                    <h1 className="mt-3 text-2xl font-bold text-stone-900 dark:text-white">
                        Tu prueba gratuita terminó
                    </h1>
                    <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
                        Pídele al administrador que renueve la suscripción para seguir usando BistroPOS.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={onLogout}
                    aria-label="Cerrar sesión"
                    tabIndex={0}
                    className="text-sm text-stone-500 dark:text-slate-400 underline hover:text-stone-700 dark:hover:text-slate-200"
                >
                    Cerrar sesión
                </button>
            </div>
        );
    }

    // Variante admin: mensaje + botón "Hablar con soporte" + SupportChatWidget montado.
    return (
        <>
            <div className="min-h-screen w-full bg-gradient-to-br from-gray-50 via-white to-emerald-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/20 flex flex-col items-center justify-center px-6 py-10 gap-6">
                <div className="text-center max-w-md">
                    <span className="material-symbols-outlined text-5xl text-amber-500">lock_clock</span>
                    <h1 className="mt-3 text-2xl font-bold text-stone-900 dark:text-white">
                        Tu prueba gratuita terminó
                    </h1>
                    <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
                        Tu periodo de prueba de BistroPOS ya venció. Habla con soporte para renovar tu
                        suscripción y reactivar tu negocio.
                    </p>
                </div>

                <div className="w-full max-w-sm flex flex-col items-center gap-3">
                    <button
                        type="button"
                        onClick={handleOpenSupport}
                        aria-label="Hablar con soporte para renovar la suscripción"
                        tabIndex={0}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-400 hover:bg-amber-500 px-5 py-3 text-sm font-semibold text-emerald-950 transition-colors"
                    >
                        Hablar con soporte
                    </button>
                </div>

                <button
                    type="button"
                    onClick={onLogout}
                    aria-label="Cerrar sesión"
                    tabIndex={0}
                    className="text-sm text-stone-500 dark:text-slate-400 underline hover:text-stone-700 dark:hover:text-slate-200"
                >
                    Cerrar sesión
                </button>
            </div>

            <SupportChatWidget
                isOpen={chatOpen}
                onClose={handleCloseChat}
                isOnline={isOnline}
            />
        </>
    );
};

export default TrialExpiredScreen;
