# Plantillas de correo (Supabase Auth) — Marca Bistro

Estas plantillas reemplazan el contenido genérico de Supabase por la marca Bistro POS.

- `email_change.html` → plantilla "Change Email Address" (la que se envía al vincular un correo desde el perfil).

## Remitente (SMTP)

El dominio `posbistro.online` ya está verificado en Resend, así que se puede enviar desde
cualquier dirección de ese dominio sin configurar DNS adicional. Para los correos de Auth se usa:

- **Sender email:** `no-reply@posbistro.online`
- **Sender name:** `Bistro POS`

> Nota: `ventas@posbistro.online` (usado en los recibos) y `no-reply@posbistro.online` NO son
> subdominios ni dominios aparte; son direcciones "From" del mismo dominio verificado. No hay
> que registrarlas en Resend. El subdominio `send.posbistro.online` que aparece en los correos
> lo crea Resend automáticamente (SPF / return-path) y no requiere mantenimiento.

## Configurar el SMTP en Supabase

Dashboard del proyecto → **Authentication** → **Emails** → **SMTP Settings** → activar
**Enable Custom SMTP**:

- Host: `smtp.resend.com`
- Port: `465`
- Username: `resend`
- Password: API key de Resend (`re_...`)
- Sender email: `no-reply@posbistro.online`
- Sender name: `Bistro POS`

## Cómo aplicar las plantillas

Las plantillas de Auth **no se despliegan por código** en proyectos hosted; se pegan en el dashboard:

1. Abre el dashboard del proyecto → **Authentication** → **Emails** → pestaña **Templates**.
2. Selecciona **Change Email Address**.
3. Copia el contenido de `email_change.html` y pégalo en el editor HTML.
4. Cambia el **Subject** a: `Confirma tu correo - Bistro POS`
5. Guarda.

## Variables disponibles en esta plantilla

- `{{ .ConfirmationURL }}` — enlace de confirmación.
- `{{ .NewEmail }}` — el correo nuevo que el usuario quiere vincular.
- `{{ .Email }}` — el correo actual.
