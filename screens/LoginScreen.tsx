import React, { useState, useRef, useEffect } from 'react';
import { Screen } from '../types';
import { useAuth } from '../context/AuthContext';

interface LoginScreenProps {
  onNavigate: (screen: Screen) => void;
}

type PhoneStep = 'enter_phone' | 'enter_otp';
type AuthMethod = 'choose' | 'pin' | 'sms';

export const LoginScreen: React.FC<LoginScreenProps> = ({ onNavigate }) => {
  const { signInWithPhone, verifyOTP, signInWithGoogle, signInWithPin, userExistsByPhone } = useAuth();

  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('enter_phone');
  const [authMethod, setAuthMethod] = useState<AuthMethod>('choose');
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [googleLoading, setGoogleLoading] = useState(false);

  // Controla la aparición suave: el contenido se muestra cuando los assets
  // (fuente, íconos y la imagen del mockup en desktop) ya están listos.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem('bistro_auth_phone');
    if (saved) setPhone(saved);
  }, []);

  // Espera a que el navegador tenga fuentes e íconos listos antes de revelar.
  // La imagen del mockup (solo desktop) se maneja con su propio onLoad.
  useEffect(() => {
    let cancelled = false;
    const reveal = () => { if (!cancelled) setReady(true); };

    const fontsReady = (document as Document & { fonts?: FontFaceSet }).fonts?.ready
      ?? Promise.resolve();

    fontsReady.then(reveal);

    // Respaldo: si algo tarda demasiado, revelar igual para no bloquear al usuario.
    const fallback = window.setTimeout(reveal, 1200);

    return () => { cancelled = true; window.clearTimeout(fallback); };
  }, []);

  const handleMockupLoad = () => setReady(true);

  const formatPhone = (raw: string) => {
    let p = raw.replace(/\s/g, '');
    if (!p.startsWith('+')) p = '+57' + p;
    return p;
  };

  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotFound(false);
    if (!phone) { setError('Ingresa tu número de teléfono'); return; }
    if (pin.length !== 4) { setError('El PIN debe tener 4 dígitos'); return; }
    setLoading(true);
    const formatted = formatPhone(phone);
    const { error } = await signInWithPin(formatted, pin);
    if (error) {
      const exists = await userExistsByPhone(formatted);
      if (!exists) {
        setNotFound(true);
      } else {
        setError('PIN incorrecto. ¿Prefieres entrar por SMS?');
      }
    }
    setLoading(false);
  };

  const handleSmsRequest = async () => {
    setError(null);
    setNotFound(false);
    if (!phone) { setError('Ingresa tu número de teléfono'); return; }
    setLoading(true);
    const formatted = formatPhone(phone);
    const exists = await userExistsByPhone(formatted);
    if (!exists) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const { error } = await signInWithPhone(formatted);
    if (error) setError(getPhoneErrorMessage(error.message));
    else setPhoneStep('enter_otp');
    setLoading(false);
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) {
      value = value.slice(-1);
    }

    const newOtp = [...otpCode];
    newOtp[index] = value;
    setOtpCode(newOtp);

    if (value && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    if (newOtp.every(digit => digit !== '') && value) {
      handleOtpSubmit(newOtp.join(''));
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpSubmit = async (code?: string) => {
    setError(null);
    setLoading(true);

    const finalCode = code || otpCode.join('');

    if (finalCode.length !== 6) {
      setError('Por favor ingresa el código de 6 dígitos');
      setLoading(false);
      return;
    }

    let formattedPhone = phone.replace(/\s/g, '');
    if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+57' + formattedPhone;
    }

    const { error } = await verifyOTP(formattedPhone, finalCode, 'login');

    if (error) {
      setError(getPhoneErrorMessage(error.message));
      setOtpCode(['', '', '', '', '', '']);
      otpInputRefs.current[0]?.focus();
    }

    setLoading(false);
  };

  const getPhoneErrorMessage = (message: string): string => {
    if (message.includes('Phone provider is not enabled')) {
      return 'El proveedor de SMS no está configurado. Contacta al administrador.';
    }
    if (message.includes('Invalid phone')) {
      return 'Número de teléfono inválido';
    }
    if (message.includes('Token has expired')) {
      return 'El código ha expirado. Solicita uno nuevo.';
    }
    if (message.includes('Invalid OTP') || message.includes('invalid')) {
      return 'Código incorrecto. Intenta de nuevo.';
    }
    if (message.includes('unverified') || message.includes('sms_send_failed') || message.includes('Error sending')) {
      return 'No se pudo enviar el SMS. Intenta de nuevo más tarde.';
    }
    return 'Error al verificar. Intenta de nuevo.';
  };

  const handleBackToPhone = () => {
    setPhoneStep('enter_phone');
    setOtpCode(['', '', '', '', '', '']);
    setError(null);
  };

  const handleChooseMethod = (method: AuthMethod) => {
    setError(null);
    setNotFound(false);
    setPin('');
    setAuthMethod(method);
  };

  const handleBackToChoose = () => {
    setAuthMethod('choose');
    setError(null);
    setNotFound(false);
    setPin('');
  };

  useEffect(() => {
    if (phoneStep === 'enter_otp') {
      setTimeout(() => otpInputRefs.current[0]?.focus(), 100);
    }
  }, [phoneStep]);

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 0) return;
    e.preventDefault();
    const newOtp = [...otpCode];
    for (let i = 0; i < 6; i++) {
      newOtp[i] = pasted[i] || '';
    }
    setOtpCode(newOtp);
    const focusIndex = Math.min(pasted.length, 5);
    otpInputRefs.current[focusIndex]?.focus();
    if (pasted.length === 6) {
      handleOtpSubmit(pasted);
    }
  };

  return (
    <div
      className={`min-h-screen w-full flex bg-[#f0f4f3] dark:bg-[#0d1c14] transition-opacity duration-500 ease-out ${ready ? 'opacity-100' : 'opacity-0'}`}
    >
      {/* Left Panel - Branding (Desktop only) */}
      <div className="hidden lg:flex lg:flex-col lg:w-1/2 xl:w-3/5 relative overflow-hidden bg-gradient-to-br from-[#f8fafc] via-[#f0fdf4] to-[#f8fafc]">
        {/* Decoraciones de fondo muy sutiles */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[80px] translate-y-1/3 -translate-x-1/4" />

        {/* Text Section (Top) */}
        <div className="relative z-20 pt-16 px-8 lg:px-12 xl:px-20 shrink-0 flex flex-col items-center text-center w-full">
          <h1 className="text-4xl xl:text-5xl font-extrabold text-gray-900 mb-4 tracking-tight">
            Tu negocio <span className="text-primary">te espera</span>
          </h1>
          <p className="text-base text-gray-600 max-w-md leading-relaxed mx-auto">
            Ingresa a tu cuenta y continúa gestionando tus ventas, inventario y reportes desde cualquier lugar con total fluidez.
          </p>
        </div>

        {/* Mockup Image Section */}
        <div className="relative z-10 flex-1 w-full flex items-center justify-center px-8 xl:px-16 pb-8 overflow-hidden">
          <img
            src="/mockup-pos.png"
            alt="BistroPOS Interface"
            onLoad={handleMockupLoad}
            onError={handleMockupLoad}
            className="w-full max-w-4xl object-contain drop-shadow-2xl hover:scale-[1.02] transition-transform duration-500"
            style={{ maxHeight: '90%' }}
          />
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-sm">
          {/* Mobile Logo */}
          <div className="lg:hidden flex flex-col items-center mb-6">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Bistro<span className="text-primary dark:text-primary">POS</span>
            </h1>
          </div>

          {/* Card */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 sm:p-8 shadow-xl shadow-gray-200/50 dark:shadow-none">

            {/* ===== VISTA: SELECCIÓN DE MÉTODO (por defecto) ===== */}
            {phoneStep === 'enter_phone' && authMethod === 'choose' && (
              <>
                <div className="mb-6 flex flex-col items-center text-center">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Bienvenido de nuevo</h2>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => handleChooseMethod('pin')}
                    aria-label="Ingresar con PIN"
                    className="w-full h-12 flex items-center gap-3 px-4 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-primary/50 transition-all text-left"
                  >
                    <span className="size-9 shrink-0 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[20px] text-gray-600 dark:text-gray-300">pin</span>
                    </span>
                    <span className="flex-1 text-sm font-semibold text-gray-800 dark:text-gray-100">Ingresar con PIN</span>
                    <span className="material-symbols-outlined text-[20px] text-gray-300 dark:text-gray-600">chevron_right</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleChooseMethod('sms')}
                    aria-label="Ingresar con código SMS"
                    className="w-full h-12 flex items-center gap-3 px-4 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-primary/50 transition-all text-left"
                  >
                    <span className="size-9 shrink-0 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[20px] text-gray-600 dark:text-gray-300">sms</span>
                    </span>
                    <span className="flex-1 text-sm font-semibold text-gray-800 dark:text-gray-100">Ingresar con SMS</span>
                    <span className="material-symbols-outlined text-[20px] text-gray-300 dark:text-gray-600">chevron_right</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => { setGoogleLoading(true); await signInWithGoogle(); setGoogleLoading(false); }}
                    disabled={googleLoading}
                    aria-label="Ingresar con Google"
                    className="w-full h-12 flex items-center gap-3 px-4 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-primary/50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="size-9 shrink-0 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                      {googleLoading ? (
                        <span className="material-symbols-outlined animate-spin text-[20px] text-gray-500">progress_activity</span>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="text-gray-600 dark:text-gray-300" fill="currentColor">
                          <path d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 1 1 0-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0 0 12.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z" />
                        </svg>
                      )}
                    </span>
                    <span className="flex-1 text-sm font-semibold text-gray-800 dark:text-gray-100">
                      {googleLoading ? 'Iniciando sesión...' : 'Ingresar con Google'}
                    </span>
                    {!googleLoading && <span className="material-symbols-outlined text-[20px] text-gray-300 dark:text-gray-600">chevron_right</span>}
                  </button>
                </div>
              </>
            )}

            {/* ===== VISTA: FORMULARIO PIN / SMS ===== */}
            {phoneStep === 'enter_phone' && authMethod !== 'choose' && (
              <>
                <div className="mb-6">
                  <button
                    type="button"
                    onClick={handleBackToChoose}
                    className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors mb-4"
                  >
                    <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                    Volver
                  </button>
                  <div className="flex flex-col items-center text-center">
                    <div className="size-12 bg-primary-light dark:bg-primary/20 rounded-2xl flex items-center justify-center mb-3">
                      <span className="material-symbols-outlined text-primary-active dark:text-primary text-2xl">{authMethod === 'pin' ? 'pin' : 'sms'}</span>
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">
                      {authMethod === 'pin' ? 'Ingresa con tu PIN' : 'Ingresa con SMS'}
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                      {authMethod === 'pin' ? 'Escribe tu número y PIN de 4 dígitos' : 'Te enviaremos un código a tu teléfono'}
                    </p>
                  </div>
                </div>

                {notFound && (
                  <div className="mb-5 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 rounded-xl">
                    <p className="text-blue-700 dark:text-blue-300 text-sm mb-2">No existe una cuenta con este número.</p>
                    <button
                      type="button"
                      onClick={() => { sessionStorage.setItem('bistro_auth_phone', phone); onNavigate(Screen.REGISTER); }}
                      className="w-full h-10 bg-primary hover:bg-primary-hover text-gray-900 rounded-xl font-bold text-sm"
                    >
                      Crear cuenta
                    </button>
                  </div>
                )}

                {error && (
                  <div className="mb-5 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-xl flex items-center gap-2">
                    <span className="material-symbols-outlined text-red-500 dark:text-red-400 text-[20px]">error</span>
                    <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
                  </div>
                )}

                <form onSubmit={authMethod === 'pin' ? handlePinLogin : (e) => { e.preventDefault(); handleSmsRequest(); }} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Número de teléfono
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 pointer-events-none">
                        <span className="material-symbols-outlined text-[20px]">phone</span>
                      </span>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        autoFocus
                        className="w-full h-11 pl-10 pr-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                        placeholder="300 123 4567"
                        autoComplete="tel"
                      />
                    </div>
                  </div>

                  {authMethod === 'pin' && (
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">PIN (4 dígitos)</label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400 pointer-events-none">
                          <span className="material-symbols-outlined text-[20px]">lock</span>
                        </span>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          value={pin}
                          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                          className="w-full h-11 pl-10 pr-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white tracking-[0.5em] text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                          placeholder="••••"
                          autoComplete="current-password"
                        />
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 bg-primary hover:bg-primary-hover text-gray-900 rounded-xl font-bold text-sm shadow-md shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                        {authMethod === 'pin' ? 'Entrando...' : 'Enviando código...'}
                      </>
                    ) : authMethod === 'pin' ? (
                      <>
                        <span className="material-symbols-outlined text-[18px]">login</span>
                        Iniciar sesión
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[18px]">send</span>
                        Enviar código SMS
                      </>
                    )}
                  </button>
                </form>
              </>
            )}

            {/* OTP Verification Step */}
            {phoneStep === 'enter_otp' && (
              <div className="space-y-4">
                <div className="text-center mb-3">
                  <div className="size-14 bg-primary-light dark:bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-3">
                    <span className="material-symbols-outlined text-primary-active dark:text-primary text-2xl">sms</span>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    Ingresa el código de 6 dígitos enviado a
                  </p>
                  <p className="text-gray-900 dark:text-white font-semibold">{phone}</p>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-xl flex items-center gap-2">
                    <span className="material-symbols-outlined text-red-500 dark:text-red-400 text-[20px]">error</span>
                    <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
                  </div>
                )}

                <div className="flex justify-center gap-2">
                  {otpCode.map((digit, index) => (
                    <input
                      key={`digit-${index}`}
                      ref={(el) => { otpInputRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      onPaste={handleOtpPaste}
                      autoFocus={index === 0}
                      className="w-10 h-12 text-center text-lg font-bold rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleOtpSubmit()}
                  disabled={loading || otpCode.some(d => !d)}
                  className="w-full h-11 bg-primary hover:bg-primary-hover text-gray-900 rounded-xl font-bold text-sm shadow-md shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                      Verificando...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[18px]">verified</span>
                      Confirmar Código
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleBackToPhone}
                  className="w-full py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                  Cambiar número
                </button>
              </div>
            )}

            {/* Register CTA */}
            {phoneStep === 'enter_phone' && authMethod === 'choose' && (
              <>
                <div className="border-t border-gray-100 dark:border-gray-800 my-6" />
                <div className="text-center">
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">¿Aún no tienes una cuenta?</p>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); sessionStorage.setItem('bistro_auth_phone', phone); onNavigate(Screen.REGISTER); }}
                    className="w-full h-11 flex items-center justify-center gap-2 border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-100 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-600 transition-all"
                  >
                    <span className="material-symbols-outlined text-[18px]">person_add</span>
                    Crear cuenta nueva
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <p className="mt-6 text-center text-gray-400 dark:text-gray-500 text-xs">
            © {new Date().getFullYear()} BistroPOS. Todos los derechos reservados.
          </p>
        </div>
      </div>
      <div id="recaptcha-container"></div>
    </div>
  );
};
