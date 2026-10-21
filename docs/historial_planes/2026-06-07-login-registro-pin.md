# Login y registro con PIN de 4 dígitos (dos caminos explícitos) — 2026-06-07

## Resumen

Se separó el inicio de sesión y la creación de cuenta en **dos caminos explícitos** y se agregó
el **login por teléfono + PIN de 4 dígitos** (la "contraseña" nativa de Supabase Auth), además
del SMS y Google que ya existían.

Antes, `LoginScreen` y `RegisterScreen` eran casi idénticas (teléfono → SMS → OTP) y la cuenta se
**creaba sola** si el número no existía: no había separación real entre entrar y registrarse, ni
contraseña usable.

Cambios principales:

1. **Login** con teléfono + PIN. Si el teléfono no existe → redirige a "Crear cuenta" (ya no se
   crea sola). Si el PIN falla pero la cuenta existe → ofrece SMS. El SMS de login usa `mode:'login'`
   que **no crea** cuentas.
2. **Registro** con paso final "definir PIN". La cuenta + sesión se crean al guardar el PIN
   (registro en dos fases) para que el paso de PIN no se desmonte al iniciarse la sesión.
3. **Empleados** nacen con PIN por defecto `1234` (antes: contraseña aleatoria desconocida) y el
   formulario lo avisa. Entran con teléfono+`1234` o por SMS.
4. **Cambiar PIN** desde el perfil (dueño y empleados, cada uno el suyo).
5. **Cuentas existentes** reseteadas a PIN `1234` (los números ya estaban verificados).

Decisiones tomadas con el usuario: PIN = contraseña nativa (mínimo bajado a 4), el dueño también
puede entrar por SMS, el dueño elige su PIN al registrarse, cada quien cambia solo su propio PIN
(sin reseteo del dueño a empleados).

---

## Contexto técnico (investigación)

- El login por teléfono va por **Firebase OTP → magic link → sesión Supabase** (edge function
  `firebase-phone-auth`). No usaba contraseña.
- Las cuentas usan correo sintético `{telefono}@bistro.temp`, pero algunas tienen **correo real**
  (las que entraron por Google), por lo que no se puede asumir el temp email para el login por PIN.
- Los teléfonos están guardados en **formatos inconsistentes** entre `auth.users.phone` y
  `profiles.phone` (con `+57`, como `57…`, o local de 10 dígitos). Hay que matchear por dígitos.
- `App.tsx` solo muestra `LoginScreen`/`RegisterScreen` cuando **no hay sesión** (`!user && !profile`):
  por eso el paso de PIN del registro no puede ir después de crear la sesión.

---

## Cambios Implementados

### 1. Base de datos / Supabase (vía MCP)

- **RPC `user_exists_by_phone(p_phone) → boolean`** y **`login_email_for_phone(p_phone) → text`**
  (`SECURITY DEFINER`, `GRANT` a `anon, authenticated`). Match por dígitos y, como respaldo, por
  los últimos 10 dígitos (helper `public._phone_digits`). El segundo resuelve el correo de login
  (real o temporal) para `signInWithPin`.
- **Migración de datos:** las 10 cuentas existentes reseteadas a PIN `1234`
  (`UPDATE auth.users SET encrypted_password = extensions.crypt('1234', extensions.gen_salt('bf'))`).
- **Manual en Dashboard:** Authentication → Policies → **Minimum password length = 4** (necesario
  para fijar/cambiar PIN de 4 dígitos desde la app).

SQL versionado en `docs/migrations/2026-06-07-login-pin.sql`.

### 2. Edge Function `firebase-phone-auth`

- Nuevos parámetros `mode: 'login' | 'register'` (default `register`) y `pin`.
  - `login`: si el usuario no existe responde `{ error: 'user_not_found' }` y **no crea**.
  - `register`: crea como antes, y si llega `pin` lo fija como contraseña en `createUser`.

**Archivos:** `supabase/functions/firebase-phone-auth/index.ts` (desplegado v20)

### 3. `AuthContext`

- `userExistsByPhone(phone)`, `signInWithPin(phone, pin)` (resuelve el correo vía
  `login_email_for_phone` y luego `signInWithPassword`), y registro en dos fases:
  `confirmFirebaseOtp(token)` + `finishPhoneRegistration(pin)`. `verifyOTP` ahora acepta `mode`.

**Archivos:** `context/AuthContext.tsx`

### 4. `LoginScreen`

- Teléfono + PIN + "Iniciar sesión"; "Entrar con código SMS"; Google; "Crear cuenta".
- Banner "No existe una cuenta" → botón a registro (teléfono prellenado vía
  `sessionStorage['bistro_auth_phone']`). PIN incorrecto (cuenta existe) → ofrece SMS.

**Archivos:** `screens/LoginScreen.tsx`

### 5. `RegisterScreen`

- Paso nuevo `set_pin` como último paso (con confirmación). Banner "Ya tienes una cuenta" → login.

**Archivos:** `screens/RegisterScreen.tsx`

### 6. `EmployeesScreen`

- `create-employee` recibe `password: '1234'` (antes aleatoria). Aviso en el formulario (solo al crear).

**Archivos:** `screens/EmployeesScreen.tsx`

### 7. `ProfileScreen`

- Tarjeta colapsable "Cambiar PIN" (nuevo PIN + confirmación → `updatePassword`).

**Archivos:** `screens/ProfileScreen.tsx`

---

## Configuración manual requerida (Dashboard de Supabase)

1. **Authentication → Policies → Minimum password length = 4.** Sin esto, cambiar/fijar PIN de 4
   dígitos desde la app falla con "Password should be at least 6 characters". (El login con un PIN
   ya existente funciona igual, porque `signInWithPassword` no valida longitud.)

---

## Documentación Actualizada

- `docs/caracteristicas/autenticacion_acceso.md` — métodos de acceso, dos caminos login/registro,
  registro en dos fases, RPCs de teléfono y matching de formatos.
- `docs/caracteristicas/gestion_personal.md` — PIN por defecto `1234` del empleado y aviso.
- `docs/caracteristicas/perfil_usuario.md` — sección "Cambiar PIN".
- `docs/migrations/2026-06-07-login-pin.sql` — SQL de los RPCs y reset de PIN.
- Spec y plan de la sesión: `docs/superpowers/specs/2026-06-07-login-registro-pin-design.md`,
  `docs/superpowers/plans/2026-06-07-login-registro-pin.md`.

---

## Bug corregido en la prueba (dev)

Al probar en `dev.posbistro.online`, el login por PIN daba `400` y "No existe":

- **Correo equivocado:** `signInWithPin` asumía el temp email, pero la cuenta de prueba tenía
  correo real de Google. Se cambió a resolver el correo con `login_email_for_phone`.
- **Match de teléfono:** el RPC comparaba todos los dígitos y fallaba cuando el teléfono estaba
  guardado como local de 10 dígitos (`3103015865`) frente al login con `+57…`. Se agregó el match
  por los últimos 10 dígitos.

---

## Verificación

- `npx tsc --noEmit`: 0 errores nuevos en los archivos tocados; el total sigue en 13 preexistentes.
- RPCs verificados por MCP con datos reales (con `+57`, sin `+`, local de 10 dígitos e inexistente).
- Las 10 cuentas verifican contra `1234` (`crypt`), 0 sin contraseña.

---

## Pendientes / Notas

- **Despliegue de la parte visual:** el backend (edge function + RPCs + reset de PINs) ya está en
  producción; la web pública conserva las pantallas viejas (que siguen funcionando) hasta hacer
  `npm run build` + deploy. La prueba se hace por el túnel `dev.posbistro.online`.
- `login_email_for_phone` expone teléfono→correo a `anon` (leak menor, aceptado).
- Prefijo `+57` hardcodeado y nombre del negocio en el registro: sin cambios.
