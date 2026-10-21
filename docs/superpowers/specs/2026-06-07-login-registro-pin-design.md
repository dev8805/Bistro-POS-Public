# Diseño: Login, Registro y PIN de 4 dígitos

**Fecha:** 2026-06-07
**Módulo:** Autenticación y Acceso (`LoginScreen`, `RegisterScreen`, `ProfileScreen`, `AuthContext`)
**Doc relacionada:** `docs/caracteristicas/autenticacion_acceso.md`, `docs/caracteristicas/gestion_personal.md`

## Problema

Hoy `LoginScreen` y `RegisterScreen` son casi idénticas: ambas piden teléfono → SMS → OTP. La edge function `firebase-phone-auth` **crea la cuenta automáticamente** si el teléfono no existe, así que no hay separación real entre "iniciar sesión" y "crear cuenta". No existe login por contraseña expuesto en la UI (aunque `AuthContext.signIn` y `updatePassword` ya están implementados). Los empleados se crean con una contraseña aleatoria de 8 caracteres que nadie conoce.

## Objetivos

1. Dos caminos explícitos: **Iniciar sesión** y **Crear cuenta**.
2. En login, si el teléfono **no existe**, redirigir a "Crear cuenta" (no crear sola la cuenta).
3. **Dueño** crea su PIN al registrarse y entra con: teléfono+PIN, Google, o SMS.
4. **Empleado** nace con PIN por defecto `1234` y entra con: SMS o teléfono+PIN.
5. Cada usuario (dueño y empleado) puede cambiar **su propio** PIN desde su perfil.

## Decisiones tomadas

- **PIN = contraseña nativa de Supabase.** Se baja el mínimo de contraseña a 4 caracteres y se usa `signInWithPassword`. (Alternativa descartada: PIN hasheado en `profiles` validado por edge function.)
- **Dueño también puede entrar por SMS** (respaldo si olvida el PIN), además de teléfono+PIN y Google.
- **El dueño elige su PIN al registrarse** (paso obligatorio tras verificar el SMS).
- **Cada quien cambia solo su propio PIN.** El dueño NO resetea PINs de empleados (si un empleado lo olvida, entra por SMS y lo cambia él mismo).

## Mapeo teléfono → cuenta

El login por contraseña usa el correo sintético existente: teléfono → `${telefonoSinMas}@bistro.temp` → `signInWithPassword({ email, password: pin })`. No se cambia el esquema de correos `@bistro.temp`.

## Cambios

### 1. Base de datos / Supabase

- **Bajar el mínimo de contraseña a 4** en Dashboard → Authentication → Policies. **Manual**, no se puede por MCP. Sin este cambio, fijar un PIN de 4 dígitos falla.
- **Nuevo RPC** `public.user_exists_by_phone(p_phone text) returns boolean`, `SECURITY DEFINER`, `GRANT EXECUTE` a `anon`. Consulta `profiles` por teléfono (normalizando `+`). Se usa en login para decidir si redirigir a "Crear cuenta".
  - Trade-off aceptado: permite enumerar si un número está registrado. Aceptable para el alcance de un POS.
- **Migración una vez: fijar PIN `1234` a las cuentas existentes.** Los números ya están verificados, así que se les asigna el PIN por defecto para que puedan entrar con teléfono+PIN de inmediato.
  - SQL directo sobre `auth.users`: `UPDATE auth.users SET encrypted_password = extensions.crypt('1234', extensions.gen_salt('bf')) WHERE encrypted_password IS NULL;` (requiere `pgcrypto`, ya disponible en Supabase).
  - El UPDATE directo no pasa por la validación de mínimo de la API, así que funciona aunque se ejecute antes de bajar el mínimo. Se aplica solo a cuentas sin contraseña (no pisa contraseñas ya definidas).
  - Verificar primero qué cuentas tienen `encrypted_password IS NULL` con MCP antes de correr el UPDATE.

### 2. Edge functions

- **`firebase-phone-auth`**: añadir parámetro `mode: 'login' | 'register'` (default `register` para compatibilidad).
  - `login`: si el usuario no existe → responde `{ error: 'user_not_found' }`, **no crea**.
  - `register`: crea como hoy.
- **`create-employee`** (frontend `EmployeesScreen.tsx:244`): reemplazar la contraseña aleatoria por `1234` fijo.
  - Además, en el **formulario de crear empleado** mostrar un aviso: "El PIN por defecto será **1234**. El empleado podrá cambiarlo desde su perfil." (visible al crear, no al editar).

### 3. `LoginScreen`

Flujo: ingresar teléfono → entrar por PIN o por SMS → Google.

- **Teléfono + PIN**: `signInWithPassword({ email: \`${telefono}@bistro.temp\`, password: pin })`.
  - Éxito → entra.
  - Falla → `user_exists_by_phone`:
    - No existe → banner "No existe una cuenta con este número" + botón "Crear cuenta" (navega a registro con el teléfono prellenado).
    - Existe → "PIN incorrecto" + botón "Entrar con código SMS".
- **Entrar con código SMS** (dueño y empleado): primero `user_exists_by_phone`; si no existe → "Crear cuenta"; si existe → OTP con `mode:'login'`.
- **Google**: sin cambios.

### 4. `RegisterScreen`

Teléfono → SMS (`mode:'register'`) → verifica OTP (crea la cuenta) → **paso nuevo: definir PIN de 4 dígitos** (con confirmación) → `updatePassword(pin)` → entra.

- Si el teléfono ya existía → banner "Ya tienes una cuenta con este número" + botón "Iniciar sesión".
- Google: sin cambios.

### 5. Cambio de PIN (`ProfileScreen`)

- Nueva opción "Cambiar PIN" → input nuevo PIN (4 dígitos) + confirmación → `updatePassword(pin)`.
- Disponible para dueño y empleado (cada uno el suyo).

## Mockups (ASCII)

Ver mockups aprobados de: login inicial (teléfono + PIN), PIN incorrecto, teléfono inexistente → crear cuenta, OTP por SMS, registro paso teléfono, registro paso PIN, teléfono ya existe, y cambiar PIN en perfil. (Conservados en la conversación de brainstorming.)

## Fuera de alcance

- Prefijo `+57` hardcodeado: no se toca.
- Nombre del negocio en el registro: no se agrega.
- Reseteo de PIN de empleados por el dueño: no se implementa.

## Riesgos / notas

- El PIN de 4 dígitos numéricos es débil por diseño (UX de POS). Aceptado.
- Bajar el mínimo global de contraseña afecta a todas las cuentas.
- `user_exists_by_phone` debe normalizar el teléfono igual que `firebase-phone-auth` (con/sin `+`, con/sin `57`) para evitar falsos negativos.
- Verificar estado real de Supabase con MCP antes de implementar (los archivos locales de `supabase/` están desincronizados).
