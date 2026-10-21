# Google Sign-In con ID Token (Sin dominio Supabase)

**Objetivo:** Permitir que los usuarios inicien sesión con Google SIN mostrar el dominio de Supabase.
**Método:** Google Identity Services (GIS) + `signInWithIdToken` (GRATIS, no requiere Plan Pro)
**Tech Stack:** Google Identity Services (script GSI), Supabase Auth, React + Vite (SPA)

---

## ¿Cómo funciona?

### Antes (signInWithOAuth — mostraba dominio Supabase):
```
Usuario → Click Google → Redirige a Supabase → Supabase redirige a Google
→ Google muestra "hjjmwipqquynjopkswvu.supabase.co" 😬
```

### Ahora (signInWithIdToken — sin dominio Supabase):
```
Usuario → Click Google → Google muestra popup nativo con nombre "BistroPOS" ✅
→ Google devuelve ID Token → Se envía a Supabase con signInWithIdToken
→ Supabase crea/autentica usuario → App funcional
```

---

## Estado

### ✅ Implementado en código:
1. **`index.html`**: Script de Google Identity Services (`accounts.google.com/gsi/client`)
2. **`.env`**: Variable `VITE_GOOGLE_CLIENT_ID` (placeholder — FALTA poner el Client ID real)
3. **`AuthContext.tsx`**: Función `signInWithGoogle` cambiada de `signInWithOAuth` a `signInWithIdToken` usando Google Identity Services
4. **`LoginScreen.tsx`**: Sin cambios necesarios (ya usa `handleGoogleSignIn`)
5. **`RegisterScreen.tsx`**: Sin cambios necesarios (ya usa `handleGoogleSignIn`)
6. **Trigger `handle_new_user()`**: Compatible (no requiere cambios)

### ❌ Falta configurar (manual):
1. **Google Cloud Console**: Crear credenciales OAuth y obtener Client ID
2. **`.env`**: Reemplazar `TU_GOOGLE_CLIENT_ID_AQUI` con el Client ID real
3. **Supabase Dashboard**: Habilitar el proveedor Google con el Client ID

---

## Pasos Manuales Pendientes

### Paso 1: Crear credenciales en Google Cloud Console

1. Ir a [Google Cloud Console](https://console.cloud.google.com/)
2. Crear proyecto o usar uno existente
3. Ir a **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth Client ID**
5. Tipo: **Web application**
6. Nombre: "BistroPOS Web"
7. **Authorized JavaScript origins:**
   - `http://localhost:5173`
   - Tu dominio de producción cuando lo tengas
8. **Authorized redirect URIs:** (puede dejarse vacío para GSI con popup)
9. Copiar el **Client ID** (formato: `xxxx.apps.googleusercontent.com`)

### Paso 2: Configurar pantalla de consentimiento OAuth
1. Ir a **OAuth consent screen** (o **Google Auth Platform > Branding**)
2. Nombre de app: "BistroPOS"
3. Email de soporte: tu email
4. User type: **External**
5. Agregar scopes: `openid`, `email`, `profile`

### Paso 3: Pegar el Client ID en `.env`
```
VITE_GOOGLE_CLIENT_ID=123456789-xxxxx.apps.googleusercontent.com
```

### Paso 4: Configurar Supabase Dashboard
1. Ir a [Supabase Dashboard → Auth → Providers → Google](https://supabase.com/dashboard/project/hjjmwipqquynjopkswvu/auth/providers)
2. Habilitar Google provider
3. Pegar el **Client ID** (el Secret es opcional para este flujo, pero se recomienda ponerlo)
4. Guardar

### Paso 5: Probar
1. `npm run dev`
2. Ir a Login → Click "Continuar con Google"
3. Debería aparecer un popup nativo de Google (sin mencionar Supabase)
4. Seleccionar cuenta → Login exitoso

---

## Archivos Modificados

| Archivo | Cambio |
|---|---|
| `index.html` | Agregado script de Google Identity Services |
| `.env` | Agregada variable `VITE_GOOGLE_CLIENT_ID` |
| `context/AuthContext.tsx` | `signInWithGoogle` ahora usa `signInWithIdToken` via Google Identity Services |
