# Autenticación y Acceso (LoginScreen / RegisterScreen)

Componentes: `screens/LoginScreen.tsx`, `screens/RegisterScreen.tsx`  
Contexto central: `context/AuthContext.tsx`  
Librería de auth: Firebase Auth + Supabase Auth  
Edge Functions involucradas: `firebase-phone-auth` (login/registro), `change-pin` (cambio de PIN)

Módulo de entrada al sistema. Gestiona quién puede acceder a BistroPOS, cómo se autentica, y qué sucede después del login (resolución de perfil, suscripción, permisos).

---

## Métodos de Acceso Disponibles

| Método | Disponible en Login | Disponible en Registro |
|---|---|---|
| **Teléfono + PIN (4 dígitos)** | ✅ | ✅ (se define al final del registro) |
| **Teléfono + OTP por SMS** | ✅ | ✅ |
| **Google (OAuth)** | ✅ | ✅ |

> El PIN es la **contraseña nativa de Supabase Auth**. El login por PIN usa `signInWithPassword({ email, password })`, donde el `email` se resuelve a partir del teléfono con el RPC `login_email_for_phone` (puede ser el correo real de Google o el sintético `@bistro.temp`). Empleados nuevos nacen con PIN `1234` (ver `create-employee` y [`gestion_personal.md`](./gestion_personal.md)); las cuentas existentes al momento del cambio se resetearon a `1234`.

> [!IMPORTANT]
> **Fijar un PIN de 4 dígitos no pasa por la API normal de Auth.** Supabase exige un mínimo de **6 caracteres** y ya no permite bajarlo a 4 desde el Dashboard (ni el cliente ni la API admin lo aceptan). Por eso el PIN se escribe siempre **directo en `auth.users.encrypted_password`** con `extensions.crypt(pin, gen_salt('bf'))`, saltándose esa política: el registro lo hace al crear el usuario, el reset masivo a `1234` lo hizo por migración, y el **cambio de PIN** lo hace el RPC `_set_user_pin` (ver abajo). `signInWithPassword` valida contra ese hash sin importar la longitud.

### Dos caminos explícitos (login vs registro)

- **Login** (`LoginScreen`): pide teléfono + PIN. Si el PIN falla, consulta el RPC `public.user_exists_by_phone`: si el número **no existe**, ofrece "Crear cuenta" (navega al registro con el teléfono prellenado vía `sessionStorage['bistro_auth_phone']`); si existe, muestra "PIN incorrecto" y ofrece entrar por SMS. El botón "Entrar con código SMS" verifica existencia antes de enviar el OTP (`mode:'login'`, que **no crea** cuentas).
- **Registro** (`RegisterScreen`): teléfono → SMS → OTP → **definir PIN** → entra. Si el número ya existe, muestra "Ya tienes una cuenta" y lleva al login. La cuenta + sesión se crean al guardar el PIN (registro en dos fases), no al verificar el OTP.

> El registro usa dos fases en `AuthContext`: `confirmFirebaseOtp(token)` (solo confirma el OTP con Firebase, sin crear sesión Supabase) y `finishPhoneRegistration(pin)` (llama a `firebase-phone-auth` con `mode:'register'` y el `pin`, que fija la contraseña al crear el usuario, y luego abre la sesión). Esto evita que `App.tsx` desmonte el `RegisterScreen` antes de fijar el PIN. El **cambio de PIN** se hace desde `ProfileScreen` con `updatePassword`, que llama a la edge function `change-pin` → RPC `_set_user_pin` (cada usuario el suyo; ver [`perfil_usuario.md`](./perfil_usuario.md)).

### RPCs de teléfono y matching de formatos

Los teléfonos están guardados en **formatos inconsistentes** entre `auth.users.phone` y `profiles.phone` (unos con `+57`, otros como `57…`, otros como local de 10 dígitos `3XXXXXXXXX`). Para que login/registro funcionen sin importar el formato, dos RPCs (`SECURITY DEFINER`, otorgados a `anon`) hacen el match comparando **solo dígitos** y, como respaldo, los **últimos 10 dígitos** (helper `public._phone_digits`):

| RPC | Para qué |
|---|---|
| `user_exists_by_phone(p_phone) → boolean` | ¿Existe una cuenta con ese teléfono? Decide la redirección login↔registro. |
| `login_email_for_phone(p_phone) → text` | Devuelve el correo de login (real o `@bistro.temp`) de la cuenta, para que `signInWithPin` pueda usar `signInWithPassword`. |

> [!NOTE]
> `login_email_for_phone` devuelve el correo asociado a un teléfono a `anon` (es necesario antes de tener sesión para entrar por PIN). Es un leak menor teléfono→correo, aceptado para el alcance del POS. No asumir el correo `@bistro.temp`: una cuenta que entró por Google tiene correo real y el login por PIN debe usar ese.

---

## Flujo: Login con Teléfono

```
[Usuario ingresa número]
       ↓
[Login/RegisterScreen] formatea número → agrega +57 si no tiene código
       ↓
[AuthContext.signInWithPhone] → setupRecaptcha (Firebase invisible reCAPTCHA)
       ↓
[Firebase] → signInWithPhoneNumber → envía SMS con OTP de 6 dígitos
       ↓
[Usuario ingresa OTP] (6 inputs individuales, auto-avance, soporte paste)
       ↓
[AuthContext.verifyOTP] → Firebase confirma el OTP
       ↓
[Edge Function: firebase-phone-auth] → recibe Firebase ID Token
   → busca/crea usuario en Supabase Auth
   → retorna hashed_token
       ↓
[supabase.auth.verifyOtp(token_hash, 'magiclink')] → crea sesión Supabase
       ↓
[AuthContext.fetchProfile] → carga perfil desde tabla `profiles`
       ↓
[App.tsx] → verifica suscripción activa
   → sin suscripción activa: redirige a SubscriptionPlansScreen
   → con suscripción activa: redirige a la pantalla principal según permisos
```

### Detalles importantes del flujo OTP

- Los 6 inputs avanzan automáticamente al ingresar cada dígito.
- Si el usuario pega el código completo en cualquier input, se distribuye en todos los campos y se envía automáticamente. Esto aplica tanto en **LoginScreen** como en **RegisterScreen**.
- Si el OTP falla, los 6 campos se limpian y el foco vuelve al primero.
- El OTP **se envía automáticamente** al completar el 6to dígito, sin necesidad de presionar "Confirmar".

---

## Flujo: Login con Google

```
[Usuario hace clic en "Continuar con Google"]
       ↓
[AuthContext.signInWithGoogle] → Firebase signInWithPopup (GoogleAuthProvider)
       ↓
[Firebase] → devuelve Google ID Token
       ↓
[supabase.auth.signInWithIdToken] → crea sesión Supabase con el token
       ↓
[AuthContext.fetchProfile] → carga perfil
       ↓
[App.tsx] → verifica suscripción activa → redirige según permisos
```

Si el usuario cierra el popup de Google sin completar el login, el error `auth/popup-closed-by-user` se silencia silenciosamente (retorna `{ error: null }`). No hay feedback al usuario.

---

## Flujo: Registro de Nuevo Negocio

`RegisterScreen` es visualmente casi idéntica a `LoginScreen`. Usa los mismos métodos (`signInWithPhone`, `signInWithGoogle`) y el mismo flujo OTP.

**La diferencia clave está en el backend**, no en la pantalla:

Cuando un número de teléfono **no existe** en Supabase, la Edge Function `firebase-phone-auth` lo crea como usuario nuevo. Al crearlo, un **trigger de base de datos** (`handle_new_user()`) se ejecuta automáticamente y:

1. Crea un registro en la tabla `businesses` con el nombre del negocio (genérico `'Mi Negocio'` si no viene en los metadatos).
2. Llama a `seed_default_roles(business_id)` → crea los roles predeterminados del negocio (Administrador, Mesero, etc.).
3. Crea una sala por defecto: `INSERT INTO rooms ... VALUES ('Sala principal', ...)`.
4. Crea un registro en `business_subscriptions` con `status = 'trial'` y 20 días de acceso — **condicionalmente**: solo si existe al menos un plan con `is_active = true` en la tabla `subscription_plans`. Si no hay planes activos, el negocio queda sin suscripción y sin error visible.
5. Crea un registro en `profiles` vinculado al nuevo negocio con rol `'Administrador'`.

> [!WARNING]
> Si la tabla `subscription_plans` no tiene filas con `is_active = true`, el paso 4 se omite silenciosamente. El nuevo negocio queda sin suscripción y no podrá usar la app hasta que se le asigne una manualmente.

> [!NOTE]
> El `RegisterScreen` no tiene campos para nombre del negocio ni datos adicionales. El negocio se crea con un nombre genérico (o desde los metadatos de Google si aplica). El usuario debe configurar el nombre del negocio desde los ajustes de la app después de entrar. Esto puede resultar confuso: el usuario se registra sin ingresar el nombre de su negocio.

---

## Correo Temporal `@bistro.temp`

Supabase Auth exige un email único por usuario. Como las cuentas creadas por teléfono no tienen correo, la Edge Function `firebase-phone-auth` (y `create-employee` al agregar empleados) genera un **correo sintético interno** con formato `{telefono}@bistro.temp` y lo guarda en `auth.users.email`.

Este correo es **necesario y permanente**: en cada login por teléfono, la función lo usa para generar el `magiclink` que crea la sesión de Supabase. **No se debe borrar** — hacerlo rompe el login.

> [!IMPORTANT]
> **El temp email nunca se muestra en la UI**: se filtra con el helper `getRealEmail()` de `lib/formatters.ts`, que devuelve cadena vacía si el correo termina en `@bistro.temp`. Esto aplica en el perfil, el menú lateral móvil (`HomeScreen`), la cabecera del sidebar de escritorio (`Sidebar`) y las tarjetas de suscripción (`SubscriptionManagementScreen`). Cuando no hay correo real, la UI muestra el teléfono o el botón "Agregar correo".

### Vincular un correo real

Desde el perfil, el usuario puede vincular un correo real con el botón **"Agregar correo"** (ver [`perfil_usuario.md`](./perfil_usuario.md)). El cambio pasa por `supabase.auth.updateUser({ email })`, que con la config actual (`double_confirm_changes = true`) envía un correo de confirmación; el cambio se aplica al hacer clic en el enlace.

Además, antes de pagar una suscripción, `SubscriptionPlansScreen` exige un correo real: si la cuenta solo tiene el `@bistro.temp`, muestra un modal que lo pide y lo guarda antes de abrir el widget de pago, para no enviar un correo falso a la pasarela.

> [!NOTE]
> Los RPCs `_clean_temp_email` y `_update_user_email` (referenciados por `firebase-phone-auth` y por la Edge Function `update-email`) **no existen** en la base de datos, por lo que esas limpiezas/actualizaciones directas fallan silenciosamente. El sistema no depende de ellos: simplemente oculta el temp email en la UI.

### Branding de los correos de Auth

Los correos de autenticación (confirmación de cambio de correo, magic link, etc.) se envían con la marca Bistro mediante **SMTP propio con Resend**, no con el SMTP por defecto de Supabase (que sale de `supabase.io` y solo entrega a miembros del equipo).

- **Remitente**: `Bistro POS <no-reply@posbistro.online>`. El dominio `posbistro.online` ya está verificado en Resend (es el mismo que usan los recibos de venta desde `ventas@posbistro.online`), así que cualquier dirección `@posbistro.online` funciona sin DNS adicional.
- **Plantillas**: versionadas en `supabase/templates/` (ej. `email_change.html` con el diseño ámbar de Bistro).
- **Configuración**: el SMTP y las plantillas de Auth se configuran en el Dashboard (Authentication → Emails); **no** se despliegan por código ni por el MCP de Supabase. Ver `supabase/templates/README.md` para los pasos.

---

## Resolución de Perfil Post-Login (`AuthContext.fetchProfile`)

Después de cualquier login exitoso, el sistema carga el perfil del usuario con:

```sql
SELECT id, business_id, full_name, phone, role, role_id, avatar_url,
       custom_permissions, is_active, offline_prefix,
       businesses:business_id(name),
       roles:role_id(permissions)
FROM profiles WHERE id = $userId
```

Con los datos recibidos calcula los **permisos efectivos**:
```
permisos_efectivos = { ...role.permissions, ...custom_permissions }
```

Los `custom_permissions` sobreescriben a los del rol. Este objeto es el que determina qué puede ver y hacer el usuario en toda la app. Ver [`gestion_personal.md`](./gestion_personal.md) para el detalle del sistema de permisos.

### Retry con Backoff Exponencial

Si el perfil no se encuentra (puede pasar en usuarios recién creados donde el trigger aún no terminó), el sistema reintenta hasta **5 veces** con espera exponencial:

| Intento | Espera |
|---|---|
| 1 | 500ms |
| 2 | 1s |
| 3 | 2s |
| 4 | 4s |
| 5 | 8s |

---

## Modo Offline (Lie-Fi)

El AuthContext implementa una estrategia de resiliencia offline sofisticada:

1. **Caché en localStorage**: el perfil y la suscripción se guardan en `localStorage` tras cada login exitoso.
2. **Lie-Fi detection**: si `navigator.onLine = true` pero la red falla (ping a Supabase falla en 3s), se considera offline.
3. **SIGNED_OUT offline**: si Firebase cierra sesión pero no hay conexión real, el sistema **ignora** el logout y usa el perfil cacheado, manteniendo al usuario dentro de la app.
4. **Período de gracia de suscripción**: si la suscripción venció pero tiene menos de 48 horas de vencida, el caché local sigue reportándola como activa.

---

## Verificación de Suscripción

Después de cargar el perfil, `checkSubscription` consulta `business_subscriptions`:

| Estado | Acceso |
|---|---|
| `active` o `trial` + fecha no vencida | ✅ Acceso completo |
| `active` o `trial` + vencida hace < 48h | ✅ Período de gracia |
| `past_due` + vencida hace < 48h | ✅ Período de gracia (transitorio, edge function marcó vencido) |
| `active` / `trial` / `past_due` + vencida > 48h | ❌ Sin acceso → redirige a SubscriptionPlansScreen |
| `canceled` (cancelación explícita) | ❌ Sin acceso (sin gracia) |
| Sin registro en `business_subscriptions` | ❌ Sin acceso → redirige a SubscriptionPlansScreen |

Si es un **trial nuevo** (creado hace menos de 2 minutos y no se ha mostrado antes), activa `isNewTrial = true` para mostrar una pantalla de bienvenida al trial.

---

## Detección de Cuenta Desactivada

El AuthContext implementa un sistema **dual** para detectar cuando un administrador desactiva a un empleado:

1. **Realtime**: canal de Supabase escucha cambios en `profiles` del usuario activo.
   - Si `is_active` cambia a `false` → cierra sesión inmediatamente.
   - Si hay **cualquier otro cambio** en el perfil (rol, permisos, nombre) → llama `refreshProfile()` automáticamente. Esto significa que los cambios de permisos se propagan en tiempo real sin que el empleado tenga que cerrar sesión.
2. **Polling cada 30 segundos**: fallback en caso de que el canal Realtime no esté disponible. Si detecta `is_active = false`, cierra sesión.

Cuando la cuenta se desactiva, `supabase.auth.signOut()` se ejecuta automáticamente aunque el usuario no lo solicite. Ver [`gestion_personal.md`](./gestion_personal.md) para cómo se desactiva un empleado.

---

## Pantallas afectadas por el perfil cargado

| Pantalla | Permiso requerido |
|---|---|
| **Menú / POS / Pago / Mesas / Orden Rápida** | `pos_view` |
| **Dashboard** | `admin_reports` |
| **Inventario** | `inv_view` o `inv_stock` |
| **Productos** | `inv_view` o `inv_create` |
| **Empleados** | `admin_users` |
| **Historial de Ventas** | `admin_reports` |
| **Deudas / Proveedores** | `admin_reports` o `pos_close` |
| **Clientes** | `pos_view` o `inv_view` |
| **Caja** | `pos_close` |
| **Contingencia / Doc** | `admin_settings` o `admin_reports` |
| **Suscripciones** | Solo rol `Administrador` |
| **Configuración** | `admin_settings` |

---

## Lo que NO puede hacer

- **No tiene recuperación de contraseña para usuarios de teléfono** — no hay un "Olvidé mi PIN" para usuarios que entran por SMS. Si el número cambia o el SIM se pierde, no hay flujo de recuperación.
- **No valida la identidad del negocio en el registro** — cualquiera con un número de teléfono puede crear un negocio nuevo. No hay verificación de identidad, NIT o datos fiscales.
- **No hay recuperación de PIN olvidado por contraseña** — si un usuario olvida su PIN, la vía de recuperación es entrar por SMS y cambiarlo desde el perfil. No hay flujo de "olvidé mi PIN" ni reseteo del PIN de empleados por el dueño.
- **No hay cierre de sesión forzado por inactividad** — si el usuario deja la app abierta, la sesión persiste indefinidamente (hasta que Firebase expire el token, tipicamente 1 hora, que se refresca automáticamente).

---

## Rate Limiting de Firebase Phone Auth

Firebase impone límites al envío de SMS para prevenir abuso:

- **50 SMS/minuto por IP**
- **500 SMS/hora por IP**

En desarrollo, si se hacen múltiples intentos de prueba seguidos, Firebase retorna `auth/too-many-requests` y bloquea la IP por un tiempo no documentado (aproximadamente 30–60 minutos). El error se manifiesta como "Error al verificar. Intenta de nuevo." en pantalla.

**Solución para desarrollo:** configurar números de teléfono ficticios en Firebase Console → Authentication → Sign-in method → Phone → "Números de teléfono para la prueba". Estos números no consumen cuota ni esperan SMS real. Los configurados actualmente:

| Número | Código fijo |
|--------|-------------|
| `+57 310 3015864` | `123456` |
| `+57 310 2304801` | `123456` |
| `+1 310-301-5866` | `123456` |

---

## Inconsistencias y Notas

> [!WARNING]
> **El OTP de Firebase no es el mismo que el OTP de Supabase**: el flujo pasa por Firebase primero (que gestiona el SMS y la verificación del código), y luego convierte el token de Firebase en una sesión de Supabase vía Edge Function. Este puente es una arquitectura personalizada. Si la Edge Function `firebase-phone-auth` está caída o mal configurada, **ningún usuario puede entrar por teléfono**, aunque Firebase funcione perfectamente.

> [!WARNING]
> **El número de teléfono siempre se prefixa con `+57`**: tanto en `LoginScreen` como en `RegisterScreen` y `EmployeesScreen`, el código de país está hardcodeado. Un negocio fuera de Colombia o con clientes/empleados internacionales no puede usar el flujo de SMS correctamente. Ver también [`gestion_personal.md`](./gestion_personal.md).

> [!NOTE]
> **`RegisterScreen` y `LoginScreen` ya NO son idénticas**: el login pide teléfono + PIN (con SMS como alternativa) y el registro añade el paso de definir PIN. La separación entre login y registro es explícita: se decide por el RPC `user_exists_by_phone` y cada pantalla redirige a la otra cuando corresponde. El registro sigue sin pedir el nombre del negocio (se crea con nombre genérico y se configura luego en ajustes).

> [!NOTE]
> **El `offline_prefix` se asigna automáticamente en el primer login**: cada empleado recibe una letra del abecedario (A–Z) que se usa para prefixar los IDs generados offline. Si ya se usaron las 26 letras (más de 26 empleados activos), el nuevo empleado queda sin `offline_prefix` y no puede generar órdenes offline correctamente. Adicionalmente, el sistema guarda en `localStorage` la clave `bistro_active_employees_count` con el conteo de empleados activos del negocio, que se usa para decisiones offline.

> [!NOTE]
> **El período de gracia de suscripción de 48h existe en dos lugares**: en `getCachedSubscription` (cálculo desde caché) y en `checkSubscription` (cálculo desde BD). Si estos dos cálculos divergen por algún bug, el usuario podría tener acceso en el caché pero no online, o viceversa.

> [!NOTE]
> **Detección de desactivación y actualización de perfil en tiempo real**: `AuthContext` mantiene una suscripción WebSocket (`profile-status-${userId}`) escuchando eventos `UPDATE` en la tabla `profiles`. Si un administrador desactiva una cuenta (`is_active: false`), la app cierra la sesión inmediatamente (`signOut`). Si se actualizan permisos o roles, refresca el perfil sin recargar la página. Se eliminó el antiguo polling periódico de 30 segundos, reduciendo drásticamente las consultas a la base de datos y el consumo de Egress.

