# Ocultar correo temporal `@bistro.temp`, vincular correo real y branding de emails de Auth — 2026-06-04

## Resumen

Las cuentas creadas por teléfono reciben un correo sintético interno con formato
`{telefono}@bistro.temp` (lo exige Supabase Auth, que requiere un email único por usuario).
Ese correo se mostraba en la UI (perfil, sidebar, suscripción), lo cual no es deseable.

El trabajo de esta sesión cubrió tres frentes:

1. **Ocultar** el correo `@bistro.temp` en toda la interfaz, sin borrarlo de la base de datos
   (sigue siendo necesario para el login por teléfono).
2. **Permitir vincular un correo real** desde el perfil con un botón "Agregar correo", y exigir
   un correo real antes de pagar una suscripción.
3. **Personalizar los correos de Auth** (remitente y plantilla) para que lleguen con la marca
   Bistro y no mencionen Supabase.

Restricción respetada: **no se eliminó** el correo temporal de `auth.users`. La función
`firebase-phone-auth` lo necesita para generar el `magiclink` en cada inicio de sesión por
teléfono. Borrarlo rompería el login.

---

## Contexto técnico (investigación)

- El correo temporal se genera en `supabase/functions/firebase-phone-auth/index.ts` y
  `supabase/functions/create-employee` con formato `{telefono}@bistro.temp`.
- El `profile.email` que se muestra en la UI **no** viene de la tabla `profiles` (que no tiene
  columna email), sino de `session.user.email` en `AuthContext.fetchProfile`.
- El RPC `_clean_temp_email` (que la función intenta llamar para borrar el email) y el RPC
  `_update_user_email` (usado por la Edge Function `update-email`) **no existen** en la base de
  datos, por lo que esas limpiezas fallaban silenciosamente. El enfoque elegido no depende de
  ellos: se oculta en la UI.
- La config de Auth tiene `double_confirm_changes = true`: al vincular un correo, Supabase envía
  un mensaje de confirmación y el cambio se aplica solo cuando el usuario hace clic.

---

## Cambios Implementados

### 1. Helper central para detectar el correo temporal

Nuevo en `lib/formatters.ts`:
- `isPlaceholderEmail(email)` — `true` si el correo termina en `@bistro.temp`.
- `getRealEmail(email)` — devuelve el correo real o cadena vacía si es placeholder.
- `isValidEmail(email)` — validación básica de formato.

Es el punto único de verdad para que toda la UI decida si mostrar el correo o tratarlo como
"sin correo".

**Archivos:** `lib/formatters.ts`

---

### 2. Perfil: ocultar temp email + flujo de vincular correo con 3 estados

- El campo de correo tiene **3 estados inline**:
  1. **Sin correo:** input con placeholder "Escribe tu correo para vincularlo" + hint contextual.
     El botón de submit cambia a **"Verificar"** cuando hay un correo nuevo escrito.
  2. **Correo confirmado (al recargar):** badge verde con ícono ✓ y el correo, más un link
     **"Cambiar"** que vuelve al input.
  3. **Verificación enviada:** overlay de pantalla completa (`z-[9999]`, `fixed inset-0`) que
     bloquea toda la app. Sin botones, solo texto indicando abrir el correo y confirmar. La
     pestaña queda inutilizable para forzar al usuario a usar la pestaña nueva que Supabase abre
     al confirmar el enlace (evita confusión por dos pestañas con estados distintos).
- La cabecera del perfil muestra el correo real o nada (ya no hay botón "Agregar correo" ahí).
- `formData.email`, `hasChanges` y `handleSubmit` se comparan contra `getRealEmail(...)` para no
  detectar el placeholder como un correo válido.

**Archivos:** `screens/ProfileScreen.tsx`

---

### 3. Sidebar (escritorio): ocultar temp email en la cabecera

La cabecera del sidebar de escritorio mostraba el `user?.email` como respaldo cuando la cuenta
no tiene nombre, lo que dejaba ver el `@bistro.temp`. Ahora el orden de respaldo es:
`nombre completo → getRealEmail(correo) → teléfono → 'Mi Cuenta'`.

**Archivos:** `components/Sidebar.tsx`

---

### 4. Menú lateral móvil (HomeScreen): ocultar temp email

- El menú lateral muestra `getRealEmail(profile?.email) || profile?.phone || ''`.
- La inicial del avatar (`avatarLetter`) usa `getRealEmail(...)` para no tomar un dígito del
  correo temporal cuando no hay nombre.

**Archivos:** `screens/HomeScreen.tsx`

---

### 5. Suscripción: ocultar temp email

Las dos tarjetas de usuario de la pantalla de gestión de suscripción ocultan el correo temporal
usando `getRealEmail(...)`.

**Archivos:** `screens/SubscriptionManagementScreen.tsx`

---

### 6. Pago: exigir correo real antes de cobrar

En `SubscriptionPlansScreen`, antes de abrir el widget de Wompi se verifica que exista un correo
real. Si la cuenta solo tiene el `@bistro.temp`, se muestra un modal **"Necesitamos tu correo"**
que lo pide, lo guarda (`supabase.auth.updateUser` + `refreshProfile`) y reanuda el cobro
pasando el correo explícitamente (`emailOverride`) para evitar el closure con el perfil viejo.
Así nunca se envía un `@bistro.temp` a la pasarela de pago.

**Archivos:** `screens/SubscriptionPlansScreen.tsx`

---

### 7. Branding de los correos de Auth (remitente + plantilla)

- Se preparó una plantilla HTML con la marca Bistro (ámbar `#fbbf24`, logo "BistroPOS", botón de
  confirmar y enlace alternativo, sin mención de Supabase) para el correo de "Change Email
  Address" (`email_change`).
- Configuración de remitente vía **SMTP propio (Resend)**: el dominio `posbistro.online` ya está
  verificado en Resend, así que no requiere DNS nuevo. Direcciones como `ventas@` o `no-reply@`
  son solo "From" del mismo dominio, no subdominios. El SMTP de Auth usa
  `no-reply@posbistro.online` con sender name `Bistro POS`.

> Las plantillas y el SMTP de Auth **no se despliegan por código** en proyectos hosted ni por el
> MCP de Supabase (sus herramientas no cubren la config de Auth): se pegan/configuran en el
> Dashboard (Authentication → Emails). El HTML y los pasos quedaron versionados en
> `supabase/templates/`.

**Archivos:** `supabase/templates/email_change.html` (nuevo), `supabase/templates/README.md` (nuevo)

---

## Configuración manual requerida (Dashboard de Supabase)

1. **SMTP** → Authentication → Emails → SMTP Settings → Enable Custom SMTP:
   - Host: `smtp.resend.com` · Port: `465` · Username: `resend` · Password: API key de Resend (`re_...`)
   - Sender email: `no-reply@posbistro.online` · Sender name: `Bistro POS`
2. **Plantilla** → Authentication → Emails → Templates → Change Email Address → pegar
   `supabase/templates/email_change.html` y Subject `Confirma tu correo - Bistro POS`.

---

## Documentación Actualizada

- `docs/caracteristicas/perfil_usuario.md` — botón "Agregar correo", ocultamiento del temp email,
  campo de correo disponible para empleados al vincular.
- `docs/caracteristicas/autenticacion_acceso.md` — origen del correo `@bistro.temp`, su
  ocultamiento en la UI, vinculación de correo real y branding de emails de Auth vía Resend.

---

## Pendientes / Notas

- **Cuenta de prueba con cambio a medias**: durante la sesión se detectó un usuario con
  `email_change` pendiente hacia `alejokandu64@gmail.com` (enviado pero no confirmado, porque el
  SMTP por defecto solo entregaba a miembros del equipo). Con el SMTP propio ya se entrega a
  cualquier destinatario.
- **Plantilla de Magic Link**: el correo interno del login por teléfono sigue con el diseño
  genérico de Supabase. Queda pendiente (opcional) unificarla con la marca Bistro.

---

## Verificación

- `getDiagnostics` limpio en todos los archivos editados
  (`ProfileScreen`, `HomeScreen`, `SubscriptionManagementScreen`, `SubscriptionPlansScreen`,
  `Sidebar`, `formatters`).
- `npx tsc --noEmit`: los 11 errores reportados son **preexistentes** y en archivos no tocados
  (generación de PDF `@react-pdf/renderer` y diálogos de `TablesScreen`). Ninguno proviene de
  estos cambios.
- Estado en Supabase verificado por MCP: el correo `@bistro.temp` persiste en `auth.users`
  (necesario para login), y los RPCs `_clean_temp_email` / `_update_user_email` no existen.
