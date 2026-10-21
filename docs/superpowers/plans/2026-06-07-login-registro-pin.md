# Login, Registro y PIN de 4 dígitos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar login y registro en dos caminos explícitos, permitir entrar con teléfono + PIN de 4 dígitos (además de SMS y Google), dar PIN por defecto `1234` a empleados y cuentas existentes, y permitir cambiar el PIN propio.

**Architecture:** El PIN es la contraseña nativa de Supabase Auth sobre el correo sintético `${telefono}@bistro.temp`. El login por contraseña usa `signInWithPassword`. Un RPC `user_exists_by_phone` decide cuándo redirigir a "Crear cuenta". La edge function `firebase-phone-auth` gana un `mode` para no crear cuentas durante el login.

**Tech Stack:** React 19 + TypeScript, Supabase (Auth + Postgres + Edge Functions Deno), Firebase Phone Auth. Sin framework de tests → verificación con `npx tsc --noEmit` y pruebas manuales en `npm run dev`.

**Spec:** `docs/superpowers/specs/2026-06-07-login-registro-pin-design.md`

**Convención de commits:** El usuario hace los commits él mismo. Cada tarea termina en un punto commiteable; al cerrar una tarea, avísale para que commitee — no commitees por él.

**Convención de verificación de tipos:** `npx tsc --noEmit` arroja errores preexistentes ajenos a esta feature. Tras cada cambio, comparar la lista de errores con la línea base y confirmar que no aparecen errores nuevos en los archivos tocados.

---

## Archivos afectados

- **Supabase (MCP):** RPC `public.user_exists_by_phone` + migración de datos PIN `1234` (sin archivo local; vía `apply_migration` / `execute_sql`). Cambio manual de política de contraseña en Dashboard.
- **Edge function:** `firebase-phone-auth` (desplegar vía MCP `deploy_edge_function`). Fuente local de referencia: `supabase/functions/firebase-phone-auth/index.ts` (puede estar desincronizada).
- `context/AuthContext.tsx` — nuevos métodos `userExistsByPhone`, `signInWithPin`; `verifyOTP` gana `mode`.
- `screens/LoginScreen.tsx` — rediseño (teléfono + PIN, link a SMS, redirección a crear cuenta).
- `screens/RegisterScreen.tsx` — paso nuevo "definir PIN".
- `screens/EmployeesScreen.tsx` — password `1234` + aviso en el formulario.
- `screens/ProfileScreen.tsx` — sección "Cambiar PIN".

---

## Task 1: Supabase — RPC de existencia y migración de PIN por defecto

**Archivos:**
- Migración (MCP `apply_migration`, nombre `add_user_exists_by_phone`)
- SQL puntual (MCP `execute_sql`) para inspección y migración de datos

- [ ] **Step 1: Inspeccionar el estado real antes de tocar nada**

Vía MCP `execute_sql` sobre el proyecto `hjjmwipqquynjopkswvu`:

```sql
-- Cuántas cuentas no tienen contraseña (se les pondrá 1234)
SELECT count(*) AS sin_password
FROM auth.users
WHERE encrypted_password IS NULL OR encrypted_password = '';

-- Confirmar que pgcrypto está disponible (debe devolver al menos 1 fila)
SELECT extname FROM pg_extension WHERE extname = 'pgcrypto';
```

Esperado: un conteo de cuentas sin password y la extensión `pgcrypto` presente. Si `pgcrypto` no aparece, ejecutar `CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;` antes de continuar.

- [ ] **Step 2: Crear el RPC `user_exists_by_phone`**

Vía MCP `apply_migration` (name: `add_user_exists_by_phone`):

```sql
CREATE OR REPLACE FUNCTION public.user_exists_by_phone(p_phone text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE regexp_replace(coalesce(phone, ''), '\D', '', 'g')
        = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
      AND regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') <> ''
  );
$$;

REVOKE ALL ON FUNCTION public.user_exists_by_phone(text) FROM public;
GRANT EXECUTE ON FUNCTION public.user_exists_by_phone(text) TO anon, authenticated;
```

La normalización `regexp_replace(..., '\D', '', 'g')` quita todo lo no-numérico para que `+573001234567`, `573001234567` y `3001234567` (si así estuviera guardado) se comparen por sus dígitos. Nota: si en `profiles` los números están sin código de país y en login siempre llegan con `+57`, los dígitos no coincidirán; verificar en el Step siguiente.

- [ ] **Step 3: Verificar el RPC con datos reales**

Vía MCP `execute_sql`:

```sql
-- Tomar un teléfono real existente y probar ambas formas
SELECT phone FROM public.profiles WHERE phone IS NOT NULL LIMIT 1;
-- Sustituir <PHONE> abajo por el valor devuelto, con y sin +57:
SELECT public.user_exists_by_phone('<PHONE>')      AS con_formato_guardado,
       public.user_exists_by_phone('+57<solo_digitos_locales>') AS con_mas57,
       public.user_exists_by_phone('+570000000000') AS inexistente;
```

Esperado: `true` para el número existente (en el formato en que llega desde el login), `false` para el inexistente. Si el formato guardado en `profiles` difiere del que envía el login, ajustar la normalización del Step 2 antes de seguir.

- [ ] **Step 4: Migrar cuentas existentes a PIN `1234`**

Vía MCP `execute_sql` (sólo cuentas sin contraseña; no pisa las definidas):

```sql
UPDATE auth.users
SET encrypted_password = extensions.crypt('1234', extensions.gen_salt('bf'))
WHERE encrypted_password IS NULL OR encrypted_password = '';
```

Esperado: filas afectadas = el conteo `sin_password` del Step 1. El UPDATE directo no pasa por la validación de mínimo de la API, así que funciona aunque la política aún no se haya bajado.

- [ ] **Step 5: Bajar el mínimo de contraseña a 4 (MANUAL)**

En el Dashboard de Supabase → Authentication → Policies (Password) → fijar **Minimum password length = 4**. No se puede por MCP. Sin esto, `updateUser({ password: '1234' })` y `signUp`/`updatePassword` con 4 dígitos fallarán con "Password should be at least 6 characters".

Verificación rápida tras el cambio: en la app (Task 7) intentar fijar un PIN de 4 dígitos; si guarda, la política quedó aplicada.

- [ ] **Step 6: Commit**

No hay archivos locales que commitear en esta tarea (todo vive en Supabase). Anotar en el PR/descripción que se aplicó la migración `add_user_exists_by_phone`, el UPDATE de datos y el cambio manual de política. Avisar al usuario.

---

## Task 2: Edge function `firebase-phone-auth` — parámetro `mode`

**Archivos:**
- Desplegar vía MCP `deploy_edge_function` (slug `firebase-phone-auth`). Reflejar el cambio también en `supabase/functions/firebase-phone-auth/index.ts` para mantener el repo.

- [ ] **Step 1: Leer la versión desplegada actual**

Vía MCP `get_edge_function` (slug `firebase-phone-auth`) para partir del código real desplegado (la versión local puede estar desincronizada).

- [ ] **Step 2: Añadir `mode` y `pin` al handler**

En el cuerpo, cambiar la lectura del body. Reemplazar:

```ts
    const { firebaseToken } = await req.json();
    if (!firebaseToken) {
```

por:

```ts
    const { firebaseToken, mode = 'register', pin } = await req.json();
    if (!firebaseToken) {
```

Dentro del bloque `if (!user) {` (cuando no se encontró usuario por teléfono ni por perfil), antes de `console.log('Creating new user for phone:'...)`, insertar el corte para modo login:

```ts
    if (!user && mode === 'login') {
      return new Response(JSON.stringify({ error: 'user_not_found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
```

Y en la llamada `supabaseAdmin.auth.admin.createUser({ ... })`, añadir el password para que el PIN quede fijado al crear la cuenta. Reemplazar:

```ts
      const { data: newUserData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: tempEmail,
        email_confirm: true,
        phone: rawPhone,
        phone_confirm: true,
        user_metadata: {
          phone: rawPhone,
        },
      });
```

por:

```ts
      const { data: newUserData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: tempEmail,
        email_confirm: true,
        phone: rawPhone,
        phone_confirm: true,
        password: pin || undefined,
        user_metadata: {
          phone: rawPhone,
        },
      });
```

El resto (generación del magic link) queda igual. Nota: en el registro el teléfono se valida como inexistente antes (Task 5), así que aquí siempre cae en creación; el `pin` se aplica en `createUser`.

- [ ] **Step 3: Desplegar**

Vía MCP `deploy_edge_function` con el código completo actualizado (slug `firebase-phone-auth`, `verify_jwt: false`).

- [ ] **Step 4: Verificar**

Vía MCP `execute_sql` o una llamada de prueba: invocar la función con `mode: 'login'` y un `firebaseToken` cuyo teléfono no exista no es práctico sin token real. Verificación funcional diferida a Task 4 (login con número inexistente debe redirigir a crear cuenta sin crear usuario). Confirmar en logs (`get_logs` function) que no se crean usuarios en intentos de login.

- [ ] **Step 5: Commit**

Avisar al usuario para que commitee `supabase/functions/firebase-phone-auth/index.ts`.

---

## Task 3: AuthContext — `userExistsByPhone`, `signInWithPin`, `verifyOTP(mode)`, registro en dos fases

**Nota de diseño:** El registro mantiene el PIN como último paso. Por eso se separa la verificación en dos métodos: `confirmFirebaseOtp` (solo confirma el código con Firebase, sin crear sesión Supabase) y `finishPhoneRegistration(pin)` (crea la cuenta con el PIN vía edge function y abre la sesión). Esto evita que `App.tsx` desmonte el `RegisterScreen` al crearse la sesión antes de fijar el PIN. El login por SMS sigue usando `verifyOTP(mode:'login')` en un solo paso.


**Archivos:**
- Modify: `context/AuthContext.tsx`

- [ ] **Step 1: Helper de correo sintético**

Cerca del tope del archivo (después de las constantes `*_CACHE_KEY`), añadir:

```ts
const tempEmailFromPhone = (phone: string): string =>
  `${phone.replace(/\D/g, '')}@bistro.temp`;
```

- [ ] **Step 2: Añadir métodos al tipo del contexto**

En `interface AuthContextType`, junto a `signInWithPhone`/`verifyOTP`, añadir:

```ts
  userExistsByPhone: (phone: string) => Promise<boolean>;
  signInWithPin: (phone: string, pin: string) => Promise<{ error: AuthError | null }>;
  confirmFirebaseOtp: (token: string) => Promise<{ error: AuthError | null }>;
  finishPhoneRegistration: (pin: string) => Promise<{ error: AuthError | null }>;
```

Y cambiar la firma de `verifyOTP`:

```ts
  verifyOTP: (phone: string, token: string, mode?: 'login' | 'register') => Promise<{ error: AuthError | null }>;
```

- [ ] **Step 3: Implementar `userExistsByPhone` y `signInWithPin`**

Antes de `const resetPassword =`, añadir:

```ts
  const userExistsByPhone = async (phone: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('user_exists_by_phone', { p_phone: phone });
      if (error) {
        console.error('[AuthContext] user_exists_by_phone error:', error);
        return false;
      }
      return data === true;
    } catch (e) {
      console.error('[AuthContext] user_exists_by_phone exception:', e);
      return false;
    }
  };

  const signInWithPin = async (phone: string, pin: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: tempEmailFromPhone(phone),
      password: pin,
    });
    return { error };
  };

  // Registro fase 1: confirma el OTP con Firebase SIN crear sesión Supabase todavía.
  const confirmFirebaseOtp = async (token: string) => {
    try {
      if (!confirmationResultRef.current) {
        return { error: { message: 'No hay verificación pendiente. Solicita un nuevo código.' } as any };
      }
      await confirmationResultRef.current.confirm(token);
      confirmationResultRef.current = null;
      return { error: null };
    } catch (err: any) {
      return { error: { message: err.message || 'Código incorrecto' } as any };
    }
  };

  // Registro fase 2: crea la cuenta con el PIN (vía edge function) y abre la sesión Supabase.
  const finishPhoneRegistration = async (pin: string) => {
    try {
      const fbUser = firebaseAuth.currentUser;
      if (!fbUser) {
        return { error: { message: 'La verificación expiró. Vuelve a empezar.' } as any };
      }
      const firebaseToken = await fbUser.getIdToken();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/firebase-phone-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firebaseToken, mode: 'register', pin }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        return { error: { message: data.error || 'Error creando la cuenta' } as any };
      }
      if (data.hashed_token) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: data.hashed_token,
          type: 'magiclink',
        });
        if (verifyError) return { error: verifyError };
      }
      return { error: null };
    } catch (err: any) {
      return { error: { message: err.message || 'Error creando la cuenta' } as any };
    }
  };
```

- [ ] **Step 4: Pasar `mode` a la edge function en `verifyOTP`**

Cambiar la firma y el body del fetch. Reemplazar:

```ts
  const verifyOTP = async (_phone: string, token: string) => {
```

por:

```ts
  const verifyOTP = async (_phone: string, token: string, mode: 'login' | 'register' = 'register') => {
```

Y en el cuerpo, reemplazar:

```ts
        body: JSON.stringify({ firebaseToken }),
```

por:

```ts
        body: JSON.stringify({ firebaseToken, mode }),
```

- [ ] **Step 5: Exponer los métodos en el value del provider**

En el objeto pasado a `AuthContext.Provider value={{ ... }}`, añadir `userExistsByPhone, signInWithPin, confirmFirebaseOtp, finishPhoneRegistration,` junto a `signInWithPhone, verifyOTP,`.

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Esperado: sin errores NUEVOS en `context/AuthContext.tsx`.

- [ ] **Step 7: Commit**

Avisar al usuario.

---

## Task 4: LoginScreen — teléfono + PIN, SMS opcional, redirección a crear cuenta

**Archivos:**
- Modify: `screens/LoginScreen.tsx`
- Patrón de estilos a reutilizar: el input de teléfono actual (`LoginScreen.tsx:221-228`) y el bloque OTP existente.

Diseño aprobado: pantalla inicial con teléfono + PIN + botón "Iniciar sesión"; links "¿Olvidaste tu PIN? / Entrar con código SMS"; Google; "Crear cuenta". Errores: PIN incorrecto (existe) → ofrecer SMS; teléfono inexistente → botón a registro.

- [ ] **Step 1: Estado y navegación con teléfono prellenado**

Asegurar que `LoginScreen` reciba/permita prellenar el teléfono al venir desde registro y viceversa. Como `onNavigate` sólo pasa `Screen`, usar un campo compartido simple: guardar el teléfono tecleado en `sessionStorage` con clave `bistro_auth_phone` antes de navegar, y al montar `LoginScreen`/`RegisterScreen` leerlo para prellenar. Añadir al inicio del componente:

```ts
  useEffect(() => {
    const saved = sessionStorage.getItem('bistro_auth_phone');
    if (saved) setPhone(saved);
  }, []);
```

- [ ] **Step 2: Nuevo estado para PIN y modo**

Junto a los `useState` existentes, añadir:

```ts
  const [pin, setPin] = useState('');
  const [authMode, setAuthMode] = useState<'pin' | 'sms'>('pin');
  const [notFound, setNotFound] = useState(false);
```

Traer del contexto: `const { signInWithPhone, verifyOTP, signInWithGoogle, signInWithPin, userExistsByPhone } = useAuth();`

- [ ] **Step 3: Handler de login con PIN**

Reemplazar `handlePhoneSubmit` por un handler que, en modo PIN, intente la contraseña y maneje los tres desenlaces:

```ts
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
```

- [ ] **Step 4: Handler de "Entrar con SMS" (revisa existencia primero)**

```ts
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
    else { setAuthMode('sms'); setPhoneStep('enter_otp'); }
    setLoading(false);
  };
```

- [ ] **Step 5: OTP en modo login**

En `handleOtpSubmit`, cambiar la llamada para pasar el modo login:

```ts
    const { error } = await verifyOTP(formattedPhone, finalCode, 'login');
```

(El resto de `handleOtpSubmit` queda igual; `formattedPhone` ya se calcula ahí.)

- [ ] **Step 6: UI del paso teléfono + PIN**

Dentro del bloque `phoneStep === 'enter_phone'`, después del input de teléfono existente, añadir el campo PIN y cambiar el form a `onSubmit={handlePinLogin}`. Campo PIN (reutiliza el estilo del input de teléfono):

```tsx
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
```

Cambiar el texto del botón principal a "Iniciar sesión". Debajo del botón, añadir el link a SMS:

```tsx
                  <button
                    type="button"
                    onClick={handleSmsRequest}
                    disabled={loading}
                    className="w-full py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  >
                    Entrar con código SMS
                  </button>
```

- [ ] **Step 7: UI del banner "no existe → crear cuenta"**

En el mismo bloque, cuando `notFound` sea true, mostrar (en vez del error rojo) un aviso informativo + botón:

```tsx
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
```

Cuando hay error de PIN incorrecto, además del mensaje, mostrar un botón "Entrar con código SMS" que llame a `handleSmsRequest` (reutilizar el del Step 6 ya cubre el caso).

- [ ] **Step 8: Guardar teléfono al ir a registro desde el link inferior**

En el link "Regístrate aquí" (`LoginScreen.tsx:356`), antes de `onNavigate(Screen.REGISTER)`, añadir `sessionStorage.setItem('bistro_auth_phone', phone);`.

- [ ] **Step 9: Verificar tipos y pruebas manuales**

Run: `npx tsc --noEmit` → sin errores nuevos en `screens/LoginScreen.tsx`.

Pruebas en `npm run dev`:
1. Teléfono existente + PIN correcto → entra.
2. Teléfono existente + PIN incorrecto → "PIN incorrecto" + opción SMS.
3. Teléfono inexistente + cualquier PIN → banner "No existe" + botón Crear cuenta (prellena el número).
4. "Entrar con código SMS" con número existente → llega OTP y entra; con número inexistente → banner crear cuenta (sin enviar SMS).

- [ ] **Step 10: Commit**

Avisar al usuario.

---

## Task 5: RegisterScreen — paso "definir PIN"

**Archivos:**
- Modify: `screens/RegisterScreen.tsx`

Diseño aprobado: teléfono → SMS (mode register) → OTP → **paso PIN (con confirmación)** → entra. Si el teléfono ya existe, banner "Ya tienes cuenta → Iniciar sesión".

- [ ] **Step 1: Estado del paso PIN**

Cambiar el tipo de paso y añadir estado:

```ts
type PhoneStep = 'enter_phone' | 'enter_otp' | 'set_pin';
```

```ts
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [alreadyExists, setAlreadyExists] = useState(false);
```

Traer del contexto: `const { signInWithPhone, confirmFirebaseOtp, finishPhoneRegistration, signInWithGoogle, userExistsByPhone } = useAuth();` (ya no se usa `verifyOTP` ni `updatePassword` aquí).

Prellenado de teléfono (igual que login):

```ts
  useEffect(() => {
    const saved = sessionStorage.getItem('bistro_auth_phone');
    if (saved) setPhone(saved);
  }, []);
```

- [ ] **Step 2: En `handlePhoneSubmit`, bloquear si el teléfono ya existe**

Tras formatear el teléfono y antes de `signInWithPhone`, añadir:

```ts
    const exists = await userExistsByPhone(formattedPhone);
    if (exists) {
      setAlreadyExists(true);
      setLoading(false);
      return;
    }
```

- [ ] **Step 3: El OTP solo confirma con Firebase y avanza al paso PIN**

La sesión Supabase NO se crea aún (eso pasa al guardar el PIN). En `handleOtpSubmit`, reemplazar el manejo de éxito para usar `confirmFirebaseOtp`:

```ts
    const { error } = await confirmFirebaseOtp(finalCode);

    if (error) {
      setError(getErrorMessage(error.message));
      setOtpCode(['', '', '', '', '', '']);
      otpInputRefs.current[0]?.focus();
    } else {
      setPhoneStep('set_pin');
    }
```

(El `formattedPhone` que `handleOtpSubmit` calculaba para `verifyOTP` ya no se usa; puede quedar o eliminarse.)

- [ ] **Step 4: Handler para guardar el PIN (crea la cuenta + sesión)**

```ts
  const handleSetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pin.length !== 4) { setError('El PIN debe tener 4 dígitos'); return; }
    if (pin !== pinConfirm) { setError('Los PIN no coinciden'); return; }
    setLoading(true);
    const { error } = await finishPhoneRegistration(pin);
    setLoading(false);
    if (error) {
      setError('No se pudo crear la cuenta. Intenta de nuevo.');
      return;
    }
    sessionStorage.removeItem('bistro_auth_phone');
    // Al crearse la sesión, App.tsx redirige según suscripción/permisos.
  };
```

- [ ] **Step 5: UI del paso `set_pin`**

Añadir un bloque nuevo después del bloque `phoneStep === 'enter_otp'`:

```tsx
            {phoneStep === 'set_pin' && (
              <form onSubmit={handleSetPin} className="space-y-4">
                <div className="text-center mb-1">
                  <div className="size-14 bg-primary-light dark:bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-3">
                    <span className="material-symbols-outlined text-primary-active dark:text-primary text-2xl">lock</span>
                  </div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Crea tu PIN</h2>
                  <p className="text-gray-500 dark:text-gray-400 text-sm">Lo usarás para entrar rápido</p>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/30 rounded-xl flex items-center gap-2">
                    <span className="material-symbols-outlined text-red-500 dark:text-red-400 text-[20px]">error</span>
                    <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
                  </div>
                )}

                <input
                  type="password" inputMode="numeric" maxLength={4}
                  value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="PIN (4 dígitos)"
                  className="w-full h-11 px-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-center tracking-[0.5em] focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none"
                  autoFocus
                />
                <input
                  type="password" inputMode="numeric" maxLength={4}
                  value={pinConfirm} onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ''))}
                  placeholder="Confirma tu PIN"
                  className="w-full h-11 px-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-center tracking-[0.5em] focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none"
                />
                <button
                  type="submit" disabled={loading}
                  className="w-full h-11 bg-primary hover:bg-primary-hover text-gray-900 rounded-xl font-bold text-sm shadow-md shadow-primary/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? 'Guardando...' : 'Crear cuenta y entrar'}
                </button>
              </form>
            )}
```

- [ ] **Step 6: UI del banner "ya existe"**

Dentro del bloque `enter_phone`, cuando `alreadyExists`:

```tsx
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
```

En el link inferior "Inicia sesión" (`RegisterScreen.tsx:382`), añadir `sessionStorage.setItem('bistro_auth_phone', phone);` antes de navegar.

- [ ] **Step 7: Verificar tipos y pruebas manuales**

Run: `npx tsc --noEmit` → sin errores nuevos en `screens/RegisterScreen.tsx`.

Pruebas en `npm run dev`:
1. Número nuevo → SMS → OTP → paso PIN → PIN+confirmación → entra. Cerrar sesión y entrar con teléfono+ese PIN → funciona.
2. PIN y confirmación distintos → "Los PIN no coinciden".
3. Número ya registrado en el paso teléfono → banner "Ya tienes cuenta" → Iniciar sesión (prellena el número).

- [ ] **Step 8: Commit**

Avisar al usuario.

---

## Task 6: EmployeesScreen — PIN por defecto `1234` + aviso

**Archivos:**
- Modify: `screens/EmployeesScreen.tsx`

- [ ] **Step 1: Cambiar la contraseña aleatoria por `1234`**

En `EmployeesScreen.tsx:244`, reemplazar:

```ts
                password: Math.random().toString(36).slice(-8) + 'Aa1!',
```

por:

```ts
                password: '1234',
```

- [ ] **Step 2: Aviso en el formulario (solo al crear)**

Dentro del formulario, después del campo de teléfono (alrededor de `EmployeesScreen.tsx:927`) y solo cuando NO se está editando, añadir:

```tsx
                                        {!editingEmployeeId && (
                                          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30 rounded-xl flex items-start gap-2">
                                            <span className="material-symbols-outlined text-blue-500 dark:text-blue-400 text-[20px]">info</span>
                                            <p className="text-blue-700 dark:text-blue-300 text-xs">
                                              El PIN por defecto será <strong>1234</strong>. El empleado podrá cambiarlo desde su perfil.
                                            </p>
                                          </div>
                                        )}
```

Ajustar la indentación al contexto real del JSX del formulario.

- [ ] **Step 3: Verificar tipos y prueba manual**

Run: `npx tsc --noEmit` → sin errores nuevos.

Prueba en `npm run dev`: crear un empleado; ver el aviso del PIN `1234`. Luego cerrar sesión e iniciar con el teléfono del empleado + `1234` → entra. Verificar que el aviso NO aparece al editar un empleado existente.

- [ ] **Step 4: Commit**

Avisar al usuario.

---

## Task 7: ProfileScreen — Cambiar PIN

**Archivos:**
- Modify: `screens/ProfileScreen.tsx`

- [ ] **Step 1: Estado del cambio de PIN**

Junto a los `useState` del componente, añadir:

```ts
  const [showPinForm, setShowPinForm] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [newPinConfirm, setNewPinConfirm] = useState('');
  const [savingPin, setSavingPin] = useState(false);
```

Traer `updatePassword` del contexto: en la desestructuración de `useAuth()` (`ProfileScreen.tsx:16`) añadir `updatePassword`.

- [ ] **Step 2: Handler**

Añadir dentro del componente:

```ts
  const handleSavePin = async () => {
    if (newPin.length !== 4) { setMessage({ type: 'error', text: 'El PIN debe tener 4 dígitos' }); return; }
    if (newPin !== newPinConfirm) { setMessage({ type: 'error', text: 'Los PIN no coinciden' }); return; }
    setSavingPin(true);
    const { error } = await updatePassword(newPin);
    setSavingPin(false);
    if (error) { setMessage({ type: 'error', text: 'No se pudo cambiar el PIN' }); return; }
    setMessage({ type: 'success', text: 'PIN actualizado' });
    setShowPinForm(false);
    setNewPin(''); setNewPinConfirm('');
  };
```

- [ ] **Step 3: UI "Cambiar PIN"**

Ubicar una sección de acciones del perfil (por ejemplo cerca del botón de cerrar sesión o de la fila de correo) y añadir el disparador + formulario colapsable:

```tsx
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-4">
          <button
            type="button"
            onClick={() => setShowPinForm(v => !v)}
            className="w-full flex items-center justify-between text-left"
          >
            <span className="flex items-center gap-2 text-gray-800 dark:text-gray-100 font-medium">
              <span className="material-symbols-outlined text-gray-500">lock</span>
              Cambiar PIN
            </span>
            <span className="material-symbols-outlined text-gray-400">{showPinForm ? 'expand_less' : 'chevron_right'}</span>
          </button>

          {showPinForm && (
            <div className="mt-4 space-y-3">
              <input
                type="password" inputMode="numeric" maxLength={4}
                value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Nuevo PIN (4 dígitos)"
                className="w-full h-11 px-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-center tracking-[0.5em] focus:ring-2 focus:ring-primary/50 outline-none"
              />
              <input
                type="password" inputMode="numeric" maxLength={4}
                value={newPinConfirm} onChange={(e) => setNewPinConfirm(e.target.value.replace(/\D/g, ''))}
                placeholder="Confirma el nuevo PIN"
                className="w-full h-11 px-4 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white text-center tracking-[0.5em] focus:ring-2 focus:ring-primary/50 outline-none"
              />
              <button
                type="button" onClick={handleSavePin} disabled={savingPin}
                className="w-full h-11 bg-primary hover:bg-primary-hover text-gray-900 rounded-xl font-bold text-sm disabled:opacity-50"
              >
                {savingPin ? 'Guardando...' : 'Guardar PIN'}
              </button>
            </div>
          )}
        </div>
```

Ajustar el contenedor/posición a la maquetación real de `ProfileScreen` (móvil y escritorio).

- [ ] **Step 4: Verificar tipos y prueba manual**

Run: `npx tsc --noEmit` → sin errores nuevos.

Pruebas en `npm run dev`:
1. Como dueño: cambiar PIN → cerrar sesión → entrar con teléfono+nuevo PIN → funciona.
2. Como empleado (entrando con `1234`): cambiar PIN → re-login con el nuevo PIN.
3. PIN de 4 dígitos guarda sin el error de "mínimo 6 caracteres" (confirma que el Step 5 de Task 1 quedó aplicado).

- [ ] **Step 5: Commit**

Avisar al usuario.

---

## Cierre

- [ ] **Actualizar la doc del módulo**: reflejar los nuevos flujos en `docs/caracteristicas/autenticacion_acceso.md` (login por PIN, redirección a registro, paso PIN en registro, PIN `1234` por defecto, cambio de PIN). Quitar de "Lo que NO puede hacer" la línea de que no hay login email/contraseña en la UI.
- [ ] **Regresión rápida**: Google sigue entrando; SMS de empleado sigue funcionando; cuenta vieja entra con `1234`.
```
