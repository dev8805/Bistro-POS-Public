import React, { useState, useRef, useEffect } from 'react';
import { Screen } from '../types';
import { useAuth } from '../context/AuthContext';

interface RegisterScreenProps {
  onNavigate: (screen: Screen) => void;
}

type PhoneStep = 'enter_phone' | 'enter_otp';

export const RegisterScreen: React.FC<RegisterScreenProps> = ({ onNavigate }) => {
  const { signInWithPhone, verifyOTP, signInWithGoogle, userExistsByPhone } = useAuth();

  const [phone, setPhone] = useState('');
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('enter_phone');
  const [otpCode, setOtpCode] = useState(['', '', '', '', '', '']);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [alreadyExists, setAlreadyExists] = useState(false);

  useEffect(() => {
    const saved = sessionStorage.getItem('bistro_auth_phone');
    if (saved) setPhone(saved);
  }, []);



  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAlreadyExists(false);
    setLoading(true);

    if (!phone) {
      setError('Por favor ingresa tu número de teléfono');
      setLoading(false);
      return;
    }

    let formattedPhone = phone.replace(/\s/g, '');
    if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+57' + formattedPhone;
    }

    const exists = await userExistsByPhone(formattedPhone);
    if (exists) {
      setAlreadyExists(true);
      setLoading(false);
      return;
    }

    const { error } = await signInWithPhone(formattedPhone);

    if (error) {
      setError(getErrorMessage(error.message));
    } else {
      setPhoneStep('enter_otp');
    }

    setLoading(false);
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);

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

    const { error } = await verifyOTP(formattedPhone, finalCode, 'register');

    if (error) {
      setError(getErrorMessage(error.message));
      setOtpCode(['', '', '', '', '', '']);
      otpInputRefs.current[0]?.focus();
    } else {
      sessionStorage.removeItem('bistro_auth_phone');
    }

    setLoading(false);
  };

  const getErrorMessage = (message: string): string => {
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
    <div className="min-h-screen w-full flex bg-slate-50 dark:bg-[#0d1c14]">
      {/* Left Panel - Branding (Desktop only) */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative overflow-hidden bg-gradient-to-br from-orange-50 via-white to-amber-50">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-3xl -translate-y-1/3 -translate-x-1/4" />
        <div className="absolute bottom-0 right-0 w-[350px] h-[350px] bg-primary/20 rounded-full blur-3xl translate-y-1/3 translate-x-1/4" />

        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20 w-full">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-amber-800 rounded-full text-xs font-semibold mb-5 w-fit">
            <span className="material-symbols-outlined text-sm">verified</span>
            7 días gratis · Sin tarjeta de crédito
          </div>

          <h1 className="text-3xl xl:text-4xl font-semibold text-gray-900 mb-2 leading-tight">
            Empieza a vender <span className="text-amber-500">hoy</span>
          </h1>
          <p className="text-sm text-gray-500 max-w-sm leading-relaxed mb-8">
            Crea tu cuenta y configura tu punto de venta en menos de 5 minutos.
          </p>

          {/* Stepper vertical dinámico (Desktop) */}
          <div className="py-2">
            {[
              { step: 1, label: 'Tu número' },
              { step: 2, label: 'Verificación' },
              { step: 3, label: 'PIN de acceso' },
            ].map((s, index, arr) => {
              const currentStepNumber = phoneStep === 'enter_phone' ? 1 : phoneStep === 'enter_otp' ? 2 : 3;
              const isCompleted = currentStepNumber > s.step;
              const isActive = currentStepNumber === s.step;
              const isLast = index === arr.length - 1;

              return (
                <div key={s.step} className="flex flex-col">
                  <div className="flex items-center gap-4">
                    <div
                      className={`size-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300 ${
                        isCompleted
                          ? 'bg-amber-400 text-gray-950 shadow-sm'
                          : isActive
                          ? 'bg-white border-2 border-amber-400 text-amber-950 shadow-sm ring-4 ring-amber-100'
                          : 'bg-white/60 border border-gray-200 text-gray-400'
                      }`}
                    >
                      {isCompleted ? (
                        <span className="material-symbols-outlined text-lg font-bold">check</span>
                      ) : (
                        s.step
                      )}
                    </div>
                    <span
                      className={`text-base transition-colors duration-200 ${
                        isActive
                          ? 'font-bold text-gray-900'
                          : isCompleted
                          ? 'font-medium text-gray-700'
                          : 'font-normal text-gray-400'
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>

                  {!isLast && (
                    <div
                      className={`w-0.5 h-7 ml-[19px] my-1 transition-colors duration-300 ${
                        isCompleted ? 'bg-amber-400' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="w-full max-w-sm border-t border-amber-200/60 my-6" />

          {/* Beneficios de Bistro */}
          <div className="space-y-3 max-w-md">
            <h3 className="text-sm font-bold text-gray-800 mb-3">
              Al registrarte en Bistro podrás:
            </h3>
            {[
              'Registrar ventas y cobrar en segundos.',
              'Controlar tu inventario y existencias al instante.',
              'Consultar reportes de ventas y ganancias en tiempo real.',
            ].map((benefit) => (
              <div key={benefit} className="flex items-start gap-2.5">
                <div className="size-5 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-800 flex-shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-xs font-bold">check</span>
                </div>
                <p className="text-sm text-gray-600 font-medium leading-relaxed">
                  {benefit}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Register Form */}
      <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-sm">
          {/* Mobile & Tablet Header */}
          <div className="lg:hidden flex flex-col items-center mb-6">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2.5">
              Bistro<span className="text-primary dark:text-primary">POS</span>
            </h1>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/50 rounded-full text-xs font-semibold shadow-sm">
              <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[15px]">verified</span>
              <span>7 días gratis · Sin tarjeta de crédito</span>
            </div>
          </div>

          {/* Card */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 sm:p-8 shadow-xl shadow-gray-200/50 dark:shadow-none">
            {phoneStep === 'enter_phone' && (
              <>
                <div className="mb-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Regístrate para comenzar</h2>
                </div>

                {error && (
                  <div className="mb-5 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-xl flex items-center gap-2">
                    <span className="material-symbols-outlined text-red-500 dark:text-red-400 text-[20px]">error</span>
                    <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
                  </div>
                )}

                {alreadyExists && (
                  <div className="mb-5 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 rounded-xl">
                    <p className="text-blue-700 dark:text-blue-300 text-sm mb-2">Ya tienes una cuenta con este número.</p>
                    <button
                      type="button"
                      onClick={() => { sessionStorage.setItem('bistro_auth_phone', phone); onNavigate(Screen.LOGIN); }}
                      className="w-full h-10 bg-primary hover:bg-primary-hover text-gray-900 rounded-xl font-bold text-sm"
                    >
                      Iniciar sesión
                    </button>
                  </div>
                )}

                <form onSubmit={handlePhoneSubmit} className="space-y-4">
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
                        className="w-full h-11 pl-10 pr-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none transition-all"
                        placeholder="300 123 4567"
                        autoComplete="tel"
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Te enviaremos un código de verificación</p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 bg-primary hover:bg-primary-hover text-gray-900 rounded-xl font-bold text-sm shadow-md shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                        Enviando código...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[18px]">send</span>
                        Enviar Código
                      </>
                    )}
                  </button>
                </form>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-white dark:bg-gray-900 px-3 text-sm text-gray-400">o regístrate con</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={async () => { setGoogleLoading(true); await signInWithGoogle(); setGoogleLoading(false); }}
                  disabled={googleLoading}
                  aria-label="Registrarse con Google"
                  className="w-full h-[44px] flex items-center justify-center gap-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {googleLoading ? (
                    <span className="material-symbols-outlined animate-spin text-[20px] text-gray-500">progress_activity</span>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                  )}
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {googleLoading ? 'Registrando...' : 'Continuar con Google'}
                  </span>
                </button>
              </>
            )}

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


            {/* Login Link */}
            <p className="mt-6 text-center text-gray-500 dark:text-gray-400 text-sm">
              ¿Ya tienes una cuenta?{' '}
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); sessionStorage.setItem('bistro_auth_phone', phone); onNavigate(Screen.LOGIN); }}
                className="text-amber-700 dark:text-amber-500 hover:text-amber-800 dark:hover:text-amber-400 font-bold hover:underline decoration-2 underline-offset-2 transition-all"
              >
                Inicia sesión
              </button>
            </p>
          </div>

          <p className="mt-6 text-center text-gray-400 dark:text-gray-500 text-xs">
            © {new Date().getFullYear()} BistroPOS. Todos los derechos reservados.
          </p>
        </div>
      </div>
      <div id="recaptcha-container"></div>
    </div>
  );
};
