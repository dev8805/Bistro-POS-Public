import React, { useState } from 'react';
import { Screen } from '../types';
import { useAuth } from '../context/AuthContext';
import { IMAGES } from '../constants';

interface ForgotPasswordScreenProps {
  onNavigate: (screen: Screen) => void;
}

export const ForgotPasswordScreen: React.FC<ForgotPasswordScreenProps> = ({ onNavigate }) => {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email) {
      setError('Por favor ingresa tu correo electrónico');
      return;
    }

    if (!email.includes('@')) {
      setError('Ingresa un correo electrónico válido');
      return;
    }

    setLoading(true);
    const { error } = await resetPassword(email);

    if (error) {
      setError('Error al enviar el correo. Intenta de nuevo.');
    } else {
      setSuccess(true);
    }

    setLoading(false);
  };

  // Success Screen
  if (success) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 p-6">
        <div className="w-full max-w-md">
          <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-10 shadow-2xl text-center">
            <div className="size-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="material-symbols-outlined text-emerald-400 text-4xl">forward_to_inbox</span>
            </div>
            <h2 className="text-2xl font-semibold text-white mb-3">¡Correo enviado!</h2>
            <p className="text-slate-400 mb-8">
              Hemos enviado un enlace de recuperación a{' '}
              <span className="text-emerald-400 font-medium">{email}</span>.
              <br /><br />
              Revisa tu bandeja de entrada y sigue las instrucciones para restablecer tu contraseña.
            </p>
            <div className="space-y-3">
              <button
                onClick={() => onNavigate(Screen.LOGIN)}
                className="w-full h-12 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-900 rounded-xl font-bold text-sm shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">login</span>
                Volver a Iniciar Sesión
              </button>
              <button
                onClick={() => setSuccess(false)}
                className="w-full h-12 bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">refresh</span>
                Enviar de nuevo
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 p-6 relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute top-20 left-20 size-72 bg-emerald-500/10 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-20 right-20 size-96 bg-teal-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }}></div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="size-16 rounded-2xl bg-center bg-no-repeat bg-cover shadow-[0_0_30px_rgba(43,238,124,0.3)] mb-4"
            style={{ backgroundImage: `url('${IMAGES.logo_bg}')` }}
          ></div>
          <h1 className="text-3xl font-black text-white">
            Bistro<span className="text-emerald-400">POS</span>
          </h1>
        </div>

        {/* Card */}
        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 sm:p-10 shadow-2xl">
          {/* Header Icon */}
          <div className="size-16 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="material-symbols-outlined text-amber-400 text-3xl">key</span>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-white mb-2">¿Olvidaste tu contraseña?</h2>
            <p className="text-slate-400">
              No te preocupes. Ingresa tu correo electrónico y te enviaremos un enlace para restablecerla.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3">
              <span className="material-symbols-outlined text-red-400">error</span>
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-300">
                Correo electrónico
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-500 pointer-events-none">
                  <span className="material-symbols-outlined text-xl">mail</span>
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-12 pl-12 pr-4 rounded-xl bg-slate-900/50 border border-slate-600/50 text-white placeholder-slate-500 text-sm focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 outline-none transition-all"
                  placeholder="tu@email.com"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-900 rounded-xl font-bold text-sm shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                  Enviando...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg">send</span>
                  Enviar Enlace de Recuperación
                </>
              )}
            </button>
          </form>

          {/* Back to Login */}
          <div className="mt-8 text-center">
            <button
              onClick={() => onNavigate(Screen.LOGIN)}
              className="text-slate-400 hover:text-slate-300 text-sm font-medium transition-colors flex items-center justify-center gap-2 mx-auto"
            >
              <span className="material-symbols-outlined text-lg">arrow_back</span>
              Volver a Iniciar Sesión
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-slate-600 text-xs">
          © {new Date().getFullYear()} BistroPOS. Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
};
