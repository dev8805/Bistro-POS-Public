# Gestión de Secretos — Bistro POS

> Documento operativo del **Requisito 2** del spec `seguridad-remediacion`
> (Gestión y rotación de secretos). Clasifica las variables de entorno del
> proyecto y describe el procedimiento **manual** de rotación, purga de
> historial y restricción por dominio/IP.
>
> **Importante:** en este documento las claves se referencian **solo por el
> nombre de la variable**, nunca por su valor. El archivo `.env` real vive en
> disco para el build local, pero desde la Tarea 2.1 **dejó de versionarse** en
> git (`.env` en `.gitignore` + `git rm --cached .env`).

---

## 1. Clasificación de claves

Bistro POS es una PWA + app híbrida (Capacitor). Todo lo que empieza con
`VITE_` se **inyecta en el bundle del cliente** en tiempo de build, por lo que
es inspeccionable por cualquier usuario final. La clasificación separa las
claves que son **públicas por diseño** (seguras de estar en el bundle) de las
que **no deben viajar al cliente** y se moverán a edge functions proxy en la
**Tarea 11**.

### 1.1 Públicas por diseño (pueden estar en el bundle cliente)

| Variable | Por qué es pública / cómo se protege |
|----------|--------------------------------------|
| `VITE_SUPABASE_URL` | Es solo la URL del proyecto Supabase. No es un secreto; identifica el endpoint. |
| `VITE_SUPABASE_ANON_KEY` | La *anon key* es pública **por diseño** de Supabase. La protección real de los datos no depende de ocultarla, sino de las políticas **RLS** (Row Level Security) que restringen qué filas puede leer/escribir el rol `anon`. Sin RLS correcto, ocultar la clave no sirve; con RLS correcto, exponerla no compromete datos. |
| `VITE_GOOGLE_CLIENT_ID` | El *client ID* de OAuth es público por diseño de Google OAuth. El secreto es el *client secret*, que vive en el servidor, no en el bundle. |
| `VITE_FIREBASE_*` (apiKey, authDomain, projectId, appId, etc.) | La configuración de Firebase Web es **pública por diseño de Firebase**. La `apiKey` de Firebase no autoriza operaciones sensibles: identifica el proyecto. La seguridad se aplica con reglas de Firebase Auth y con **restricción de la clave por dominio** (ver §3.3). |
| `VITE_VAPID_PUBLIC_KEY` | Es la **clave pública** VAPID para Web Push. Por definición es pública; la privada (`VAPID_PRIVATE_KEY`) vive solo en los secrets de Supabase Edge Functions, nunca en el bundle. |

> **Nota:** aunque sean públicas por diseño, las claves de Firebase y la anon
> key deben **restringirse por dominio/IP** a los orígenes oficiales (§3.3)
> para reducir el abuso desde dominios no autorizados.

### 1.2 Deben salir del bundle (se moverán a edge functions proxy — Tarea 11)

Estas son **claves de APIs de pago consumibles por terceros**. Si viajan al
bundle, cualquiera puede extraerlas y consumir cuota facturable a tu cuenta.
La remediación (Tarea 11) las mueve a edge functions proxy que guardan la clave
en los secrets del servidor y validan que el solicitante sea un usuario
autenticado del negocio antes de reenviar la llamada.

| Variable | API | Riesgo si queda en el bundle |
|----------|-----|------------------------------|
| `VITE_GEMINI_API_KEY` | Google Gemini Vision (escaneo de facturas, fotolistas) | API de pago; un tercero puede consumir tu cuota de Gemini. |
| `VITE_GOUPC_API_KEY` | Go-UPC (lookup EAN → producto) | API de pago por consultas; abusable desde el bundle. |
| `VITE_GOOGLE_CSE_API_KEY` | Google Custom Search Engine | API de pago con cuota; extraíble y consumible por terceros. |

> Hasta que la Tarea 11 esté completa, estas claves siguen en el bundle. Por eso
> es **prioritario rotarlas** (§3.1) y, en cuanto exista el proxy, retirarlas
> del bundle y confiar en el proxy server-side.

---

## 2. Estado actual tras la Tarea 2.1

- `.env` **agregado a `.gitignore`** (con `!.env.example` para no ignorar un
  ejemplo si algún día existe).
- `.env` **removido del índice de git** con `git rm --cached .env` (el archivo
  **sigue en disco**; el build local no se rompe).
- Estos cambios quedan **staged**; el commit lo hace el usuario.

> ⚠️ Sacar `.env` del índice **no borra los secretos del historial**. Cualquiera
> con acceso al repo puede recuperar los valores de commits anteriores. Por eso
> son obligatorios los pasos manuales de la §3 (rotación + purga de historial).

---

## 3. Procedimiento operativo MANUAL del usuario

> Los pasos de esta sección **los ejecuta el usuario**, no el código. El spec
> deja de versionar el `.env`, documenta la clasificación y (en la Tarea 11)
> mueve las claves fuera del bundle; **la rotación y la purga de historial son
> responsabilidad operativa del usuario** (ver §4).

### 3.1 Rotar cada clave expuesta en el historial de git

Como los valores estuvieron versionados, hay que **reemplazarlos por claves
nuevas** en la consola de cada proveedor. Tras rotar, actualizá el `.env` local
(y los secrets de Supabase donde aplique) con los valores nuevos; el nombre de
la variable no cambia.

- [ ] **Supabase** (`VITE_SUPABASE_ANON_KEY`): rotar las API keys del proyecto.
      Panel de Supabase → *Project Settings* → *API*. La anon key deriva del
      *JWT secret* del proyecto; regenerar/rotar las claves del proyecto
      invalida las anteriores. Actualizá el `.env` y cualquier consumidor.
- [ ] **Firebase** (`VITE_FIREBASE_*`): rotar/regenerar la *API key* del web app.
      *Google Cloud Console* → *APIs & Services* → *Credentials* (la clave del
      proyecto Firebase). Confirmá el proyecto en `.firebaserc`
      (`sistema-pos-95051`).
- [ ] **Gemini** (`VITE_GEMINI_API_KEY`): rotar en *Google AI Studio*
      (aistudio.google.com → *API keys*) o en *Google Cloud Console* →
      *Credentials* según dónde se generó.
- [ ] **Go-UPC** (`VITE_GOUPC_API_KEY`): rotar en el panel de cuenta de
      go-upc.com → sección de API / API key.
- [ ] **Google CSE** (`VITE_GOOGLE_CSE_API_KEY`): rotar la clave de *Custom
      Search API* en *Google Cloud Console* → *Credentials*. El identificador
      del motor (CSE ID) se gestiona en el *Programmable Search Engine control
      panel*.

> El *client secret* de Google OAuth, el `TELEGRAM_BOT_TOKEN`, `RESEND_API_KEY`,
> `VAPID_PRIVATE_KEY` y demás secrets server-side viven en los **secrets de
> Supabase Edge Functions**, no en el `.env` del bundle. Si alguno pudo quedar
> expuesto, rotarlo también en su consola correspondiente.

### 3.2 Purgar el `.env` del historial de git (paso avanzado / destructivo)

Reescribe la historia del repositorio para borrar `.env` de **todos** los
commits pasados. Elegí **una** herramienta:

```bash
# Opción A — git filter-repo (recomendada)
git filter-repo --path .env --invert-paths

# Opción B — BFG Repo-Cleaner
bfg --delete-files .env
```

> ⚠️ **Destructivo:** reescribe todos los hashes de commit. Requiere
> **force-push coordinado** (`git push --force`) y que todos los colaboradores
> vuelvan a clonar o rebasar. Hacerlo con el repo limpio, avisando a cualquier
> otro colaborador. Aun después de purgar, **las claves ya expuestas siguen
> comprometidas**: la rotación de la §3.1 es la que realmente las invalida.

### 3.3 Restringir por dominio/IP las claves que permanecen en el bundle

Las claves públicas por diseño (Firebase, anon key) deben limitarse a los
**orígenes oficiales** de la app para reducir el abuso desde dominios ajenos.

Orígenes oficiales conocidos:
- `https://dev.posbistro.online` (entorno de desarrollo, vía Cloudflare Tunnel)
- Dominios por defecto de Firebase Hosting del proyecto `sistema-pos-95051`:
  `https://sistema-pos-95051.web.app` y `https://sistema-pos-95051.firebaseapp.com`
- El dominio de producción propio (confirmar el dominio real de producción)
- Esquema de Capacitor Android (app híbrida), si aplica

Pasos:

- [ ] **Firebase — restricción por HTTP referrer:** *Google Cloud Console* →
      *APIs & Services* → *Credentials* → seleccionar la API key → *Application
      restrictions* → *HTTP referrers* → agregar los orígenes oficiales de
      arriba. Complementar con *API restrictions* para limitar a qué APIs sirve
      la clave.
- [ ] **Supabase — allowed origins / URLs:** *Authentication* → *URL
      Configuration* (*Site URL* y *Redirect URLs*) y la configuración de CORS /
      orígenes permitidos, apuntando a los dominios oficiales. La anon key sigue
      protegida por **RLS**; esta restricción reduce superficie de abuso.

---

## 4. Responsabilidad operativa

**La rotación de claves (§3.1) y la purga del historial de git (§3.2) son
responsabilidad operativa del usuario y NO están cubiertas por código.**

El alcance del spec en materia de secretos se limita a:

1. Dejar de versionar el `.env` (Tarea 2.1 — hecho).
2. Documentar la clasificación de claves y el procedimiento manual (este
   documento — Tarea 2.2).
3. Mover las claves de APIs de pago fuera del bundle a edge functions proxy
   (Tarea 11).

Sacar el `.env` del índice **no invalida** los secretos ya filtrados en el
historial. Mientras el usuario no rote las claves en cada proveedor y no purgue
el historial, los valores expuestos siguen siendo válidos y explotables.
