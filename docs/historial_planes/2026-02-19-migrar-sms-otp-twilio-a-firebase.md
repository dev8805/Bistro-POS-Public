# Migrar SMS OTP de Twilio a Firebase Phone Auth — Plan de Implementación

**Objetivo:** Reemplazar Twilio (modo free, limitado a 1 número) por Firebase Phone Authentication para que cualquier usuario pueda iniciar sesión con su número de teléfono, gratis hasta 10,000 verificaciones/mes.

**Arquitectura:** Actualmente el login por teléfono usa `supabase.auth.signInWithOtp({ phone })` que depende del proveedor SMS configurado en Supabase (Twilio). La migración cambiará a un flujo donde Firebase envía el SMS y verifica el código, y luego usamos el token de Firebase para autenticar con Supabase via `signInWithIdToken` (mismo patrón que ya usamos con Google Sign-In).

**Tech Stack:** Firebase Auth (Phone), Supabase Auth (third-party Firebase), React, TypeScript, Vite

---

## 📊 Análisis del Estado Actual

### Archivos afectados:
| Archivo | Rol actual | Cambio necesario |
|---------|------------|-----------------|
| `context/AuthContext.tsx` | `signInWithPhone` usa `supabase.auth.signInWithOtp`, `verifyOTP` usa `supabase.auth.verifyOtp` | Reemplazar con Firebase `signInWithPhoneNumber` + `confirmationResult.confirm()`, luego `signInWithIdToken` a Supabase |
| `screens/LoginScreen.tsx` | UI de login por teléfono con input de teléfono y OTP de 6 dígitos | Agregar contenedor para reCAPTCHA invisible, mínimos cambios en UI |
| `index.html` | Carga scripts de Google Identity Services | Agregar script de Firebase Auth |
| `.env` | Variables de Supabase y Google | Agregar `VITE_FIREBASE_*` variables |
| `lib/firebase.ts` | **No existe** | Crear: inicialización de Firebase App + Auth |
| `supabase/config.toml` | Twilio configurado (deshabilitado) | Sin cambios (es config local) |

### Configuración remota de Supabase necesaria:
- Habilitar **Firebase como third-party provider** en el dashboard de Supabase > Authentication > Providers > Firebase
- El `project_id` de Firebase debe coincidir

---

## Flujo Técnico (Antes vs Después)

### Antes (Twilio via Supabase):
```
Usuario ingresa teléfono → Supabase envía SMS via Twilio → Usuario ingresa OTP → Supabase verifica OTP → Sesión creada
```

### Después (Firebase Phone Auth):
```
Usuario ingresa teléfono → Firebase envía SMS (gratis) → Usuario ingresa OTP → Firebase verifica OTP → Firebase devuelve ID Token → Se envía a Supabase con signInWithIdToken → Sesión creada
```

---

## Tareas de Implementación

### Tarea 1: Crear proyecto Firebase y obtener credenciales

**Paso 1: Crear proyecto en Firebase Console**
- Ir a https://console.firebase.google.com/
- Crear proyecto o usar el existente (si ya tienes uno por Google Sign-In)
- En Authentication > Sign-in method > habilitar "Phone"

**Paso 2: Registrar app web**
- En Firebase Console > Project settings > General > "Add app" > Web
- Copiar las credenciales: `apiKey`, `authDomain`, `projectId`, `appId`

**Paso 3: Obtener el Project ID de Firebase**
- Lo necesitarás para configurar Supabase

**Verificar:** Tienes las 4 credenciales de Firebase anotadas.

---

### Tarea 2: Configurar Firebase como Third-Party Provider en Supabase

**Paso 1: Ir al dashboard de Supabase**
- URL: https://supabase.com/dashboard/project/hjjmwipqquynjopkswvu/auth/providers
- Buscar la sección "Third-Party Auth" o "Firebase"
- Habilitar Firebase e ingresar el `project_id` de Firebase

**Verificar:** En Supabase Dashboard > Auth > Providers, Firebase aparece habilitado.

---

### Tarea 3: Agregar variables de entorno

**Archivos:**
- Modify: `.env`

**Paso 1: Agregar variables de Firebase al .env**
```env
VITE_FIREBASE_API_KEY=tu_api_key_aqui
VITE_FIREBASE_AUTH_DOMAIN=tu_proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=tu_proyecto_id
VITE_FIREBASE_APP_ID=tu_app_id
```

**Verificar:** Las variables existen en `.env` junto a las existentes.

---

### Tarea 4: Instalar Firebase SDK

**Paso 1: Instalar dependencia**
```bash
npm install firebase
```

**Verificar:** `firebase` aparece en `dependencies` de `package.json`.

---

### Tarea 5: Crear archivo de inicialización de Firebase

**Archivos:**
- Create: `lib/firebase.ts`

**Paso 1: Implementación**
```typescript
import { initializeApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);

export { RecaptchaVerifier, signInWithPhoneNumber };
export type { ConfirmationResult };
```

**Verificar:** El archivo importa correctamente sin errores de TypeScript.

---

### Tarea 6: Modificar AuthContext.tsx — Reemplazar signInWithPhone y verifyOTP

**Archivos:**
- Modify: `context/AuthContext.tsx`

**Paso 1: Agregar imports de Firebase**
Agregar al inicio del archivo:
```typescript
import { firebaseAuth, RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from '../lib/firebase';
```

**Paso 2: Agregar ref para ConfirmationResult**
Dentro de `AuthProvider`, agregar:
```typescript
const confirmationResultRef = React.useRef<ConfirmationResult | null>(null);
```

**Paso 3: Agregar función para inicializar reCAPTCHA**
```typescript
const setupRecaptcha = () => {
  if (!(window as any).recaptchaVerifier) {
    (window as any).recaptchaVerifier = new RecaptchaVerifier(firebaseAuth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {},
    });
  }
  return (window as any).recaptchaVerifier;
};
```

**Paso 4: Reemplazar signInWithPhone**
Cambiar la función actual:
```typescript
// ANTES:
const signInWithPhone = async (phone: string) => {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  return { error };
};

// DESPUÉS:
const signInWithPhone = async (phone: string) => {
  try {
    const appVerifier = setupRecaptcha();
    const result = await signInWithPhoneNumber(firebaseAuth, phone, appVerifier);
    confirmationResultRef.current = result;
    return { error: null };
  } catch (err: any) {
    // Reset reCAPTCHA en caso de error
    (window as any).recaptchaVerifier = null;
    return { error: { message: err.message || 'Error enviando SMS' } as any };
  }
};
```

**Paso 5: Reemplazar verifyOTP**
Cambiar la función actual:
```typescript
// ANTES:
const verifyOTP = async (phone: string, token: string) => {
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  return { error };
};

// DESPUÉS:
const verifyOTP = async (_phone: string, token: string) => {
  try {
    if (!confirmationResultRef.current) {
      return { error: { message: 'No hay verificación pendiente. Solicita un nuevo código.' } as any };
    }

    const credential = await confirmationResultRef.current.confirm(token);
    const idToken = await credential.user.getIdToken();

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'firebase' as any,
      token: idToken,
    });

    confirmationResultRef.current = null;
    return { error };
  } catch (err: any) {
    return { error: { message: err.message || 'Código incorrecto' } as any };
  }
};
```

**Verificar:** No hay errores de TypeScript. La interfaz `AuthContextType` no cambia (mismas firmas de función).

---

### Tarea 7: Agregar contenedor reCAPTCHA en LoginScreen.tsx

**Archivos:**
- Modify: `screens/LoginScreen.tsx`

**Paso 1: Agregar div invisible para reCAPTCHA**
Agregar justo antes del cierre del componente (antes del último `</div>`):
```tsx
<div id="recaptcha-container"></div>
```

Este div es invisible (Firebase lo usa internamente para el reCAPTCHA invisible).

**Verificar:** El div existe en el DOM cuando se renderiza LoginScreen.

---

### Tarea 8: Verificar que el trigger de Supabase crea perfiles para usuarios de Firebase

**Contexto:** Cuando un usuario se autentica por primera vez via Firebase Phone, Supabase crea el usuario automáticamente via `signInWithIdToken`. Sin embargo, necesitamos verificar que el trigger `handle_new_user()` en la base de datos también cree el perfil correspondiente.

**Paso 1: Revisar el trigger existente**
El trigger actual (`002_triggers_and_functions.sql`) ya maneja la creación de perfiles cuando se crea un usuario nuevo. Dado que `signInWithIdToken` crea el usuario en `auth.users`, el trigger debería dispararse automáticamente.

**Paso 2: Verificar que el trigger gestione usuarios sin email**
Los usuarios de Phone Auth pueden no tener email. Verificar que el trigger no falle si `new.email` es null.

**Verificar:** Crear una cuenta de prueba con teléfono y confirmar que aparece en la tabla `profiles`.

---

### Tarea 9: Testing Manual

**Paso 1: Probar flujo completo**
1. Abrir la app en `localhost`
2. Ir a Login > Teléfono
3. Ingresar un número real (ej: tu propio número con +57)
4. Verificar que llega el SMS en menos de 30 segundos
5. Ingresar el código de 6 dígitos
6. Verificar que se crea la sesión y se redirige al dashboard
7. Verificar que el perfil se creó en la tabla `profiles`

**Paso 2: Probar errores**
- Número inválido → debe mostrar error
- Código incorrecto → debe mostrar "Código incorrecto"
- Código expirado → debe mostrar "El código ha expirado"

**Verificar:** Los 7 pasos del flujo completo funcionan sin errores.

---

## ⚠️ Consideraciones Importantes

1. **Firebase Phone Auth es GRATIS hasta 10,000 verificaciones/mes.** Después cobra ~$0.01-0.06 por SMS según el país.
2. **No necesitas comprar ningún número de teléfono.** Firebase usa sus propios números rotativos.
3. **El reCAPTCHA invisible** es obligatorio en web para evitar abuso. No requiere interacción del usuario en la mayoría de los casos.
4. **Usuarios existentes que se registraron con email** no se ven afectados. Este cambio solo modifica el flujo de login por teléfono.
5. **El patrón es el mismo que Google Sign-In:** Firebase autentica → devuelve token → Supabase lo acepta via `signInWithIdToken`.

## Orden de Ejecución
```
Tarea 1 (Firebase Console)     → Manual, ~10 min
Tarea 2 (Supabase Dashboard)   → Manual, ~5 min
Tarea 3 (.env)                 → ~1 min
Tarea 4 (npm install)          → ~1 min
Tarea 5 (lib/firebase.ts)      → ~2 min
Tarea 6 (AuthContext.tsx)       → ~5 min
Tarea 7 (LoginScreen.tsx)      → ~1 min
Tarea 8 (Verificar trigger)    → ~5 min
Tarea 9 (Testing)              → ~10 min
─────────────────────────────────
Total estimado:                  ~40 min
```

## Rollback Plan
Si algo falla, revertir es simple:
1. En `AuthContext.tsx`, restaurar las funciones `signInWithPhone` y `verifyOTP` originales (las que usan `supabase.auth.signInWithOtp` y `supabase.auth.verifyOtp`)
2. Eliminar `lib/firebase.ts`
3. Quitar el div `recaptcha-container` de `LoginScreen.tsx`
4. Desinstalar firebase: `npm uninstall firebase`
