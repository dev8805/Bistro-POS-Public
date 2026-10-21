# Perfil de Usuario (ProfileScreen)

Componente: `screens/ProfileScreen.tsx`  
Hooks: `context/AuthContext`, `hooks/useBusinessSettings`, `hooks/useImageUpload`  
RPC de BD: `delete_business_account`  

**Acceso:**

| Dispositivo | Ruta |
|---|---|
| **Móvil** | Pulsar avatar/inicial en el header de HomeScreen → opción **"Mi Perfil"** en el bottom sheet |
| **Desktop** | Menú lateral → dropdown del negocio (parte superior) → **"Mi Perfil"** |

Pantalla de configuración personal del usuario. Permite editar datos del perfil individual y, si el usuario es el **dueño del negocio** (`owner_id`), también puede editar el nombre del negocio y eliminar toda la cuenta.

> [!IMPORTANT]
> **Requiere conexión a internet para guardar**: la pantalla se puede abrir offline (el perfil se carga del contexto local), pero al intentar guardar sin red, el sistema muestra el error "Necesitas conexión a internet para guardar cambios en tu perfil." y cancela la operación sin llamar a Supabase.

---

## Funciones Disponibles

### Editar Nombre Completo
Campo disponible para **todos los usuarios** (administradores y empleados).  
Se guarda en `profiles.full_name`. El nombre aparece en el avatar (iniciales) y en el encabezado del perfil.

### Editar Teléfono
Campo opcional disponible para **todos los usuarios**.  
Se guarda en `profiles.phone`. Es el teléfono de contacto del usuario, diferente al del negocio.

### Editar / Agregar Correo Electrónico
El campo de correo tiene **3 estados visuales** según la situación de la cuenta:

| Estado | Qué se ve |
|---|---|
| **Sin correo vinculado** (o el usuario pulsó "Cambiar") | Input con placeholder "Escribe tu correo para vincularlo" + hint contextual. El botón de submit dice **"Verificar"** cuando hay un correo nuevo escrito. |
| **Correo confirmado** | Badge verde con ícono ✓ y el correo vinculado. A su lado, un link **"Cambiar"** que vuelve al estado de input. |
| **Verificación enviada** | **Overlay de pantalla completa** (`z-[9999]`, `fixed inset-0`) que bloquea toda la app. Muestra: icono de correo, el correo destino, y el texto "Abre tu correo, confirma el enlace y usa la pestaña nueva que se abrirá. Puedes cerrar esta pestaña." Sin botones — la pestaña queda muerta para forzar al usuario a usar la pestaña nueva que se abre al confirmar el enlace. |

**Razón del overlay bloqueante:** Al confirmar la verificación, Supabase abre una pestaña/ventana nueva con la sesión actualizada (correo vinculado). Si la pestaña original siguiera funcional, el usuario tendría dos pestañas con estados distintos (una con correo nuevo y otra con el antiguo), lo cual es confuso. El overlay elimina esta posibilidad.

> [!NOTE]
> **Correo temporal `@bistro.temp` oculto**: las cuentas creadas por teléfono tienen un correo sintético interno con formato `{telefono}@bistro.temp` (lo exige Supabase Auth). Ese correo **nunca se muestra** en la UI. Se filtra con el helper `getRealEmail()` de `lib/formatters.ts`, que devuelve cadena vacía si el correo es un placeholder. Cuando no hay correo real, se muestra el input para vincular uno.

El campo de correo está disponible para **todos los usuarios** (no solo el dueño). Al guardar con un correo nuevo, `supabase.auth.updateUser({ email })` envía un correo de confirmación. Con la config actual (`double_confirm_changes = true`), el cambio se aplica solo cuando el usuario hace clic en el enlace del email.

### Cambiar PIN
Tarjeta colapsable **"Cambiar PIN"** disponible para **todos los usuarios** (dueño y empleados), cada uno el suyo. Pide el nuevo PIN de 4 dígitos y su confirmación, y llama a `updatePassword`. El PIN es la contraseña con la que se entra por teléfono+PIN (ver [`autenticacion_acceso.md`](./autenticacion_acceso.md)). No pide el PIN actual.

> [!IMPORTANT]
> **No usa `supabase.auth.updateUser({ password })`.** Supabase Auth exige un mínimo de **6 caracteres** (tanto en el cliente como en la API admin), y ese mínimo ya **no se puede bajar a 4** desde el Dashboard. Como el PIN es de 4 dígitos, esa vía siempre fallaba con `422 weak_password` / "Password should be at least 6 characters". Por eso `updatePassword` ahora llama a la **edge function `change-pin`** (`verify_jwt`), que valida la sesión del usuario y ejecuta el RPC `_set_user_pin` (`SECURITY DEFINER`). Ese RPC escribe el hash bcrypt del PIN **directo en `auth.users.encrypted_password`** (vía `extensions.crypt` + `gen_salt('bf')`), saltándose la política de longitud — el mismo mecanismo con que se resetearon los PIN a `1234`. El PIN se guarda tal cual, así que el login por teléfono+PIN no cambia. Cada usuario solo puede cambiar **su propio** PIN (el RPC recibe el `user.id` derivado del JWT y solo `service_role` puede ejecutarlo).

### Editar Nombre del Negocio
Solo visible para usuarios con rol **Administrador**.  
Se guarda en `businesses.name`. Es el nombre operativo del sistema (diferente al `receipt_business_name` del panel de facturación). Ver [`ajustes_facturacion.md`](./ajustes_facturacion.md) para la distinción.

### Cambiar Avatar
Disponible para **todos los usuarios** mediante un menú contextual sobre el avatar.  
Opciones del menú:

| Opción | Comportamiento |
|---|---|
| **Subir foto** | Selector de archivo del dispositivo |
| **Tomar foto** | Abre la cámara integrada (`InAppCamera`) |
| **Pegar foto** | Lee imagen del portapapeles |
| **Eliminar foto** | Aparece solo si hay avatar. Borra la imagen. |

Todas las fotos pasan por `ImageCropper` con **aspecto 1:1** antes de subirse al bucket `avatars/{user_id}` de Supabase Storage.

---

## Flujo de Guardado (`handleSubmit`)

Las actualizaciones se hacen en hasta **3 llamadas secuenciales**:

```
1. UPDATE profiles SET full_name, phone, avatar_url WHERE id = $userId
2. Si rol = Administrador y tiene business_id y formData.business_name definido:
   UPDATE businesses SET name = $businessName WHERE id = $businessId
3. Si email cambió:
   supabase.auth.updateUser({ email: $newEmail })  → dispara email de confirmación
```

Tras guardar, se llama `refreshProfile()` para reflejar los cambios en el contexto global.

> [!NOTE]
> **El botón "Guardar Cambios" se desactiva cuando no hay cambios**: el formulario compara el estado actual con los datos originales (`hasChanges`) y deshabilita el botón si nada cambió. La comparación incluye: nombre completo, teléfono, email, nombre del negocio y avatar. Esto significa que si el usuario solo abre el formulario y no edita nada, no puede guardar.

---

## Detección de "Perfil Incompleto"

Al registrarse, el trigger de BD (`handle_new_user`) crea el negocio con el nombre por defecto `'Mi Negocio'`. El sistema detecta esto con:

```ts
isProfileIncomplete = profile.role === 'Administrador'
  && (businessName === 'Mi Negocio' || businessName?.endsWith("'s Business"))
```

Se incluye el patrón `'s Business` como fallback por compatibilidad con registros anteriores. Si se detecta, muestra un aviso amarillo de bienvenida y hace `autoFocus` en el campo del nombre del negocio para que el usuario lo complete de inmediato.

---

## Zona de Peligro: Eliminar Cuenta

Visible **solo para el dueño del negocio** (`isBusinessOwner`).

### Flujo de eliminación

1. El usuario hace clic en "Eliminar cuenta".
2. Aparece un modal con la lista de lo que se perderá.
3. El usuario debe escribir `ELIMINAR` exactamente (mayúsculas) para habilitar el botón.
4. Al confirmar, se ejecuta secuencialmente:

```
1. Limpiar Storage: product-images/{bizId}/*
2. Limpiar Storage: business-logos/{bizId}/*
3. Por cada empleado: limpiar avatars/{empId}/*
4. supabase.rpc('delete_business_account', { target_business_id })
5. signOut()
```

La RPC `delete_business_account` hace la eliminación en cascada de todos los registros en la BD.

### Qué NO elimina el flujo (archivos)

El `cleanBucket` lista **hasta 1000 archivos** por carpeta (`limit: 1000`). Si un negocio tiene más de 1000 imágenes de productos, los archivos adicionales quedan huérfanos en Storage sin ser eliminados. No hay paginación.

---

## Campos Visibles por Rol

| Campo | Administrador propietario | Administrador no propietario | Empleado (Cajero/etc.) |
|---|---|---|---|
| Nombre del Negocio | ✅ | ✅ | ❌ |
| Nombre Completo | ✅ | ✅ | ✅ |
| Email | ✅ | Vía "Agregar correo" | Vía "Agregar correo" |
| Teléfono | ✅ | ✅ | ✅ |
| Avatar | ✅ | ✅ | ✅ |
| Eliminar Cuenta | ✅ | ❌ | ❌ |

La condición `isBusinessOwner` se determina consultando `businesses.owner_id` vs `user.id` en cada montaje de la pantalla. El campo de correo siempre se muestra para el dueño; para el resto aparece al pulsar **"Agregar correo"** (solo cuando no tienen un correo real).

---

## Lo que NO puede hacer

- **No pide el PIN actual al cambiarlo** — la tarjeta "Cambiar PIN" solo pide el nuevo PIN y su confirmación; no valida el PIN vigente antes de reemplazarlo (la edge function `change-pin` no lo requiere).
- **No permite cambiar de rol** — el rol del usuario es inmutable desde esta pantalla. Solo un administrador puede cambiarlo desde [`gestion_personal.md`](./gestion_personal.md).
- **No muestra historial de sesiones activas** — no hay forma de ver o cerrar otras sesiones abiertas del mismo usuario.
- **No permite cambiar el teléfono de login** — si el usuario inició sesión con SMS, el número de teléfono de autenticación (Firebase) es diferente al teléfono de contacto (`profiles.phone`). Cambiar el teléfono en el perfil **no cambia el número con el que hace login**.

---

## Inconsistencias y Notas

> [!WARNING]
> **Las 3 llamadas de guardado no son transaccionales**: si `UPDATE profiles` guarda bien pero `UPDATE businesses` falla, el nombre completo quedará actualizado pero el nombre del negocio no. Tampoco hay rollback. El error sí indica con precisión qué paso falló (ej: "Datos personales guardados, pero falló el nombre del negocio: ...").

> [!NOTE]
> **Mejora pendiente — `cleanBucket` sin paginación**: la función usa `list({ limit: 1000 })` sin paginación. En la práctica no es un problema ya que cada producto soporta una sola imagen, pero si en el futuro se permiten múltiples imágenes por ítem y un negocio supera las 1000 imágenes, los archivos adicionales quedarán huérfanos en Storage al eliminar la cuenta.

> [!NOTE]
> **El `isProfileIncomplete` solo funciona para administradores**: un empleado cuyo perfil también tenga nombre vacío o incompleto no verá ningún aviso ni `autoFocus`. La detección está ligada al nombre por defecto `'Mi Negocio'` (y al patrón `'s Business` por compatibilidad), no cubre otros casos de perfil incompleto.

> [!NOTE]
> **El campo "Negocio" en el perfil y el campo "Nombre en Facturas" en ajustes de facturación son distintos**: el campo del perfil edita `businesses.name` (nombre interno del sistema). El campo de facturación edita `businesses.receipt_business_name` (nombre en tickets). Editar uno no afecta al otro. Sin embargo, si `receipt_business_name` está vacío, el ticket usa `businesses.name` como fallback. Ver [`ajustes_facturacion.md`](./ajustes_facturacion.md).

> [!NOTE]
> **El botón "Cancelar" navega a `Screen.DASHBOARD`**: si el usuario cancela desde el perfil, va al Dashboard. No navega a la pantalla de origen, pero Dashboard es el home general de la app.

> [!NOTE]
> **El indicador de presencia (punto verde) en el avatar es decorativo**: el punto verde en la esquina inferior del avatar (`bg-emerald-500`) no refleja el estado real de conexión del usuario. Es estático. Ver [`autenticacion_acceso.md`](./autenticacion_acceso.md) para el manejo real de sesiones.

> [!NOTE]
> **Sincronización en tiempo real (WebSockets)**: Los cambios en los datos del perfil (`profiles`) o la desactivación de la cuenta (`is_active: false`) se propagan a la aplicación mediante el canal WebSocket de Supabase (`profile-status-${userId}`). Esto permite que si un administrador modifica el rol, permisos o desactiva la cuenta, el cambio se refleje al instante sin depender de consultas periódicas por sondeo (*polling*).

