# Soporte Humano — Escalación vía Telegram

> **Módulo:** Sistema de escalación desde el chat IA al desarrollador
> **Widget:** `components/rag/RagChatWidget.tsx` (feedback Sí/No + handoff)
> **Hook:** `hooks/useSupportSession.ts` (sesión + realtime + multimedia)
> **Backend:** 5 edge functions de Supabase + Telegram Bot API (Forum Topics) + Web Push + pg_cron
> **Estado:** ✅ Operativo — Última actualización 2026-06-06

### Cambios recientes (6 junio 2026)
- **ID público de negocio (`businesses.public_id`) para identificación en soporte**: cada negocio tiene ahora un identificador legible de 5 cifras (`10000`, `10001`, …) en vez de solo el UUID. Sirve para que el cliente lo dicte y para que el dev **busque/filtre** en Telegram todas las conversaciones de un mismo negocio. Se llama `public_id` (no `code`) para que sea auto-explicativo y no se confunda con el PK interno `id` (uuid) ni con `promo_codes.code`. La columna tiene un `COMMENT` descriptivo visible en Supabase y en la introspección del esquema.
  - **Generación (migraciones `business_short_code` + `business_code_rename_to_public_id`)**: secuencia `business_code_seq` (índice incremental) + función `format_business_code(n)` que deriva el código mostrado con crecimiento controlado: **Fase 1** `10000–99999` (5 cifras, 90.000 códigos) → **Fase 2** `A00000–Z99999` (letra + 5 cifras, 2.6M) → **Fase 3** letra + 6 cifras. La columna `businesses.public_id` es `NOT NULL UNIQUE` con `DEFAULT format_business_code(nextval('business_code_seq'))`; los negocios existentes se rellenaron por orden de creación.
  - **Telegram (`support-escalate` v22)**: el ID va en el **título del topic** (`Nombre · Negocio · #10000`, estable porque el topic es permanente por usuario) y se repite en el header del mensaje (`🏢 Negocio: … · #10000`) para poder buscarlo por texto.
  - **Frontend**: `BusinessSettingsContext` expone `businessCode` (mapeado desde la columna `public_id`); el `RagChatWidget` muestra un chip "ID de tu negocio · #10000" (copiable) en la vista de soporte y `ProfileScreen` lo muestra como fila de solo lectura (copiable) visible para todos los roles.

### Cambios recientes (1 junio 2026 — sesión noche)
- **Fix real del aislamiento de push en dispositivos compartidos (RPC `SECURITY DEFINER`)**: cuando varios usuarios comparten un dispositivo, el endpoint de Web Push es **físico del dispositivo** (uno solo, `endpoint UNIQUE`) y quedaba mapeado en BD al primer usuario que lo registró. Sus notificaciones le llegaban al usuario equivocado (p. ej. la respuesta del dev al **admin** disparaba la notificación PWA en el teléfono de un **empleado** del mismo negocio).
  - **Por qué no bastaba RLS (verificado empíricamente):** un primer intento añadió una política `UPDATE` (`using (true)`) para que el `upsert(onConflict:'endpoint')` del hook reasignara el endpoint. **No funcionó.** En PostgreSQL un `INSERT … ON CONFLICT DO UPDATE` exige que la fila en conflicto sea **visible vía la política `SELECT`**; como `SELECT` es own-only (`user_id = auth.uid()`), el usuario nuevo no puede ver la fila del dueño anterior → el `DO UPDATE` se rechaza con `42501: new row violates row-level security policy (USING expression)`. Hacer `SELECT` permisivo NO es opción: dejaría a cualquiera leer endpoints y claves de cifrado ajenas.
  - **Fix:** migración `push_subscription_claim_release_rpc`. Se **elimina** la política `push_subscriptions_update_claim` y se crean dos funciones `SECURITY DEFINER` (bypass RLS controlado):
    - `claim_push_subscription(p_endpoint, p_p256dh, p_auth, p_user_agent)`: hace el upsert reasignando el endpoint a `auth.uid()`. Solo puede asignarlo al propio usuario (no se puede falsificar el dueño). El hook lo llama en cada login.
    - `release_push_subscription(p_endpoint)`: borra el endpoint en logout sin importar el dueño registrado (la fila es física del dispositivo). Lo llaman `usePushSubscription` (logout) y `AuthContext.signOut()`.
  - **Cambios de código:** `hooks/usePushSubscription.ts` usa `supabase.rpc('claim_push_subscription', …)` en vez del `upsert` directo; el logout (hook + `AuthContext.signOut`) usa `supabase.rpc('release_push_subscription', …)` en vez del `delete` directo.
  - **Ciclo de vida correcto:** login → `claim` reasigna el endpoint a `auth.uid()` | cambio de usuario → siguiente `claim` lo reclama | logout → `release` borra el endpoint.

### Cambios recientes (1 junio 2026 — sesión tarde)
- **Fix: notificaciones llegan tras cerrar sesión**: el DELETE de `push_subscriptions` requiere `auth.uid()` por RLS. El hook `usePushSubscription` ejecutaba el DELETE en un `useEffect`, que corre *después* del paint y *después* de que `supabase.auth.signOut()` ya revocó la sesión. `auth.uid()` devolvía null → el DELETE fallaba silenciosamente → el endpoint quedaba en BD → el dispositivo seguía recibiendo notificaciones del usuario anterior incluso tras logout.
  - **Fix:** la limpieza del endpoint se hace directamente en `AuthContext.signOut()`, **antes** de llamar a `supabase.auth.signOut()`, cuando la sesión todavía es válida y el DELETE pasa el RLS normalmente. Archivo: `context/AuthContext.tsx`.

### Cambios recientes (1 junio 2026 — sesión mañana)
- **`usePushSubscription` movido a `App.tsx`**: antes vivía dentro de `RagChatWidget`, que solo monta al abrir el chat. Ahora se ejecuta al iniciar sesión, independientemente de si el usuario abre el widget.
- **`triedRef` reemplazado por `registeredUserIdRef`**: el hook rastrea el `user.id` registrado y dispara el re-registro al cambiar de usuario (antes el `triedRef` bool lo bloqueaba). Necesario pero no suficiente para el aislamiento en dispositivos compartidos — ver el fix de la política RLS en *sesión noche* arriba.

### Cambios recientes (31 mayo 2026)
- **Deep-link de notificación push → abre el chat automáticamente**: al tocar la notificación push el usuario ya no queda en la pantalla que tenía abierta — el widget de soporte se abre directamente.
  - **App ya abierta (foreground/background):** el Service Worker (`push-sw.js`) envía `postMessage({ type: 'OPEN_SUPPORT_CHAT' })` a la ventana existente y la enfoca. `App.tsx` escucha ese mensaje en un `useEffect` de montaje y ejecuta `setRagChatMounted(true) + setRagChatOpen(true) + setRagChatMinimized(false)`.
  - **App cerrada:** el SW abre una nueva ventana en `/?action=open_chat`. Un segundo `useEffect` en `App.tsx` lee ese parámetro al montar, abre el chat y limpia la URL con `history.replaceState`.
  - Antes: el `notificationclick` navegaba a `targetUrl` (hardcodeado `'/'`) dentro de la ventana ya abierta, lo que recargaba la página sin abrir el chat.

### Cambios recientes (29 mayo 2026)
- **Fix stale closure — RLS `support_messages` INSERT**: cuando el usuario tenía una sesión previa `closed` y escalaba de nuevo, `sendClientMessage` usaba el `session_id` de la sesión cerrada (capturado en el cierre de `useCallback`) y el RLS lo rechazaba con `new row violates row-level security policy`. Fix: `sendClientMessage` en `useSupportSession.ts` acepta ahora un tercer parámetro opcional `sessionId?: string`; `handleSend` en el widget captura el retorno de `support.escalate()` (`newSession`) y pasa `newSession.id` explícitamente a cada llamada de `sendClientMessage` para el primer envío (escalación + mensaje). Llamadas al flujo `inSupportMode` normal no necesitan el override — siguen usando el `session` del hook.
- **Orden texto-adjunto en el chat de soporte**: los mensajes que tienen texto + adjunto ahora renderizan el **texto arriba** y el adjunto abajo (antes era adjunto arriba, texto abajo). Más natural (igual que WhatsApp/Telegram). Cambio solo en el render de `renderSupportMessage` en `RagChatWidget.tsx`.
- **Telegram — sin header repetido en adjuntos sin texto**: `support-send-to-telegram` (v15) ya no incluye el `senderTag` (`<b>Nombre</b> · Rol · Negocio`) en adjuntos enviados sin texto. Si `msg.content` está vacío, el archivo llega limpio sin caption. Si tiene texto, la caption sigue siendo `senderTag + texto`. Evita el ruido en Telegram cuando el usuario envía varios archivos de una sola vez.

### Cambios recientes (23 mayo 2026 — sesión nocturna)
- **Aviso pre-envío fuera de horario**: en el form de "Hablar con el dev", cuando el dev está fuera de horario aparece un cuadro ámbar con: `Horario: L-S, 9 a. m. – 8:08 p. m. (hora Colombia)` + `Próxima disponibilidad: lunes 25 may a las 9 a. m.` + `💡 Igual le llegará tu consulta — a veces responde fuera de horario.` Setea expectativa sin bloquear el envío.
- **Hook `useDeveloperAvailability`**: nuevo hook que lee `developer_availability` (ahora con RLS pública para authenticated) y calcula client-side `isAvailableNow`, `nextAvailableLabel` (próxima ventana en español natural) y `scheduleLabel` (resumen del horario).
- **Modo bot override durante espera**: dentro de la card de soporte aparece un tip "💡 Mientras esperas, puedes seguir consultando al bot · [Hablar con el bot →]". Al activarlo, la sesión de soporte queda viva en BD pero el widget muestra el chat del bot fresco. Un banner verde arriba ("Tu consulta con el dev sigue en cola · Ver") permite volver. El override se desactiva automáticamente cuando el dev responde por Realtime.
- **Copy sin falsa expectativa**: header subtitle ahora dice **"Consulta enviada"** (antes "Esperando al dev") y badge inferior **"📨 Consulta enviada"** (antes "⏳ En espera del dev"). Solo pasa a **"Conectado con el dev"** cuando el dev escribe el primer mensaje real.
- **Bloqueo de segundo escalado durante espera**: el botón 👎/Hablar con el dev se oculta mientras haya sesión activa (incluso en modo bot override). Anti-spam por diseño — `renderFeedback` chequea `inSupportMode` no `effectiveSupportMode`.
- **Cap del `bot_answer` a 2000 chars** en el header HTML enviado a Telegram (`support-escalate` v13). El RAG puede generar respuestas >4096 chars con bloques de código que rebasaban el límite de `sendMessage` de Telegram.
- **Cleanup automático de sesión fantasma**: si `support-escalate` falla después de insertar la sesión pero antes de asignar `telegram_thread_id`, el `catch` la cierra automáticamente para no dejar UI confusa en el widget.
- **`tryReopenTopic` tolerante**: cualquier error al reabrir un topic (no solo `not found`/`TOPIC_DELETED`) ahora cae al flow de "crear topic nuevo" + resetea `profile.telegram_thread_id`. Antes el match de string exacta fallaba con variantes inesperadas de Telegram.

### Cambios recientes (23 mayo 2026 — sesión vespertina)
- **El handoff ya NO depende del horario del dev**: antes, si el cliente escalaba fuera del horario configurado, la sesión quedaba `queued` y NO se creaba el topic en Telegram (al dev no le llegaba nada). Ahora se elimina el estado `queued` del flujo nuevo: la sesión siempre se crea como `active`, el topic se crea/reabre y el dev recibe el mensaje en Telegram **siempre**. El horario solo cambia el mensaje system que ve el cliente para gestionar su expectativa.
- **Etiqueta visual en Telegram cuando es fuera de horario**: el header inicial incluye `⚠️ Consulta recibida fuera de tu horario — el cliente ya sabe que tardarás.` para que el dev decida si responder ya o esperar.
- **Notificación al cliente cuando el dev responde** (3 capas):
  - **App abierta (foreground)**: sonido "soft pop" (`public/sounds/dev-message.mp3`, ~15KB) + toast existente.
  - **PWA instalada cerrada/background**: Web Push nativa del SO vía `send-support-push` edge function (Workbox SW + VAPID).
  - **Navegador normal (no PWA)**: dot rojo pulsante arriba a la derecha del icono `smart_toy` ("Asistente IA" en sidebar desktop y botón "IA" del mobile bottom nav). Se limpia al abrir el widget.
- **Eliminada la palabra "escalación" de la UI**: copy reemplazado por "handoff a soporte humano" / "Mensaje enviado al desarrollador" / "Tu disponibilidad para responder".

### Cambios recientes (23 mayo 2026 — sesión matutina)
- **Un Forum Topic permanente por usuario**: antes cada escalación creaba un topic nuevo (`Manuel · #D193`, `Manuel · #068C`, etc.) llenando el grupo de duplicados. Ahora el `telegram_thread_id` se persiste en `profiles` y se reutiliza/reabre en escalaciones posteriores. El nombre del topic pasa a ser `{full_name} · {business_name}` (sin `#shortId`); el shortId de la sesión actual se incluye en el header del mensaje inicial (`#XXXX`) para diferenciar consultas dentro del mismo topic.
- **Webhook tolera múltiples sesiones por thread_id**: `telegram-webhook` ahora prioriza la sesión `active`/`queued` más reciente al enrutar mensajes del dev (antes usaba `.maybeSingle()`, que rompía si había más de una sesión con el mismo thread_id). Si todas están cerradas, hace fallback a la última sesión para no perder el `/close`.
- **`/close` cierra topic pero no borra el thread_id del perfil**: la próxima vez que el usuario escala, `reopenForumTopic` lo reactiva y se envía un nuevo header de consulta. Telegram conserva todo el historial visible en el topic.

### Cambios recientes (22 mayo 2026)
- **Cleanup automático a las 24h**: cron `pg_cron` + edge function `support-cleanup-expired` borran sesiones cerradas + sus archivos. TTL de signed URLs bajado de 30 días a 24h.
- **Conversación cerrada visible como historial**: card gris colapsable arriba del chat con contador "Se borra en Xh Ym" (tick cada minuto). Reemplazó el comportamiento anterior que ocultaba todo al cerrar.
- **Orden vertical**: cerrada arriba, chat IA al medio, sesión activa con dev cerca del input.
- **Lightbox in-app** para adjuntos (imagen/video/documento) — replicando la calidad del visor nativo del navegador. Sin abrir nuevas pestañas.
- **Render limpio de adjuntos**: imágenes y videos van standalone (sin burbuja amber/verde envolvente). Burbuja solo cuando hay texto.
- **Detección de imágenes enviadas como archivo**: si el dev envía la imagen como "archivo" en Telegram (en vez de "foto"), llega sin compresión y se muestra inline con calidad original.
- **Responsive desde 768px** (antes 1024): el widget usa el layout desktop ya en tablet, alineado con el sidebar de Bistro.
- **Botón cerrar del lightbox respeta safe-area-inset** para notches en móviles modernos.

---

## ¿Qué hace este módulo?

Cuando el chat IA (RAG) no resuelve una duda del usuario, este sistema permite **escalar la conversación al desarrollador** dentro del mismo widget, **sin sacar al cliente de la app**. La conversación se vuelve bidireccional:

- El cliente escribe desde el widget → llega al desarrollador en Telegram
- El desarrollador responde desde Telegram → aparece en el widget como "Soporte humano"
- Soporta texto, imágenes, videos, audios y documentos (hasta 2 GB por archivo)

**Casos de uso:**
- Cliente da 👎 a una respuesta del bot y quiere contactar a un humano
- Bug o funcionalidad que el bot no puede explicar
- Cliente con dudas sobre la configuración de su negocio en Bistro

---

## Arquitectura

```text
Browser (React/Bistro)
  │
  ├── UI:    components/rag/RagChatWidget.tsx       ← feedback 👍/👎 + handoff
  │          components/DeveloperAvailabilityPanel.tsx ← solo visible para el dev
  │
  └── Hook:  hooks/useSupportSession.ts
                  → invoke('support-escalate')         (cliente solicita ayuda)
                  → INSERT support_messages            (envía texto/adjunto)
                  → invoke('support-send-to-telegram') (reenvía al topic)
                  → Realtime subscribe support_messages (recibe respuestas)

Supabase
  ├── Storage: bucket "support-attachments" (privado, RLS por session)
  ├── DB:
  │     - developer_availability (singleton — config del dev)
  │     - support_sessions       (una fila por escalación)
  │     - support_messages       (mensajes texto + adjuntos)
  ├── Edge Functions:
  │     support-escalate          → Crea session + topic en Telegram + mensaje inicial
  │     support-send-to-telegram  → Reenvía mensaje del cliente al topic correspondiente
  │     telegram-webhook          → Recibe replies del dev, sube adjuntos a Storage, inserta en support_messages
  │     support-cleanup-expired   → Borra sesiones cerradas hace >24h + sus archivos (cron diario 04:00 AM)
  └── pg_cron:
        support-cleanup-expired-hourly → invoca support-cleanup-expired diariamente a las 04:00 AM

Telegram
  └── Grupo "Bistro Soporte" (supergroup con Topics activados)
       ├── Bot AlejoAyuda_bot (admin con permiso "Manage Topics")
       └── Un Topic permanente por usuario → "Nombre · Negocio"
            (todas las escalaciones del mismo cliente caen en el mismo topic;
             se reabre con reopenForumTopic si /close lo había archivado)
```

---

## Flujo end-to-end

1. **Cliente** hace una pregunta al bot RAG → recibe respuesta + sources
2. Bajo cada respuesta del bot aparecen dos botones tenues: **👍 Sí me ayudó / 👎 No me ayudó**
3. Si el cliente da **👎**, se abre un mini-form inline en el widget con:
   - Textarea opcional "Cuéntame más sobre el problema"
   - Preview no editable de lo que se enviará (pregunta, respuesta del bot, nombre, negocio, pantalla actual)
   - Botón "Hablar con el dev"
4. Al confirmar → `useSupportSession.escalate()` invoca la edge function `support-escalate`
5. `support-escalate`:
   - Decodifica el JWT del usuario (extrae `sub` y `email`)
   - Lee `profiles` + `businesses` para snapshot del cliente
   - Lee `developer_availability` y compara con hora actual en `America/Bogota`
   - **Si dev disponible:**
     - Lee `profiles.telegram_thread_id`:
       - Si existe → llama `reopenForumTopic` para reabrir el topic permanente (por si fue cerrado con `/close` antes). Si Telegram responde que no existe (fue borrado manualmente), se cae al fallback de crear uno nuevo.
       - Si no existe → llama `createForumTopic` con nombre `"{full_name} · {business_name}"` y persiste el `message_thread_id` en `profiles.telegram_thread_id` para futuras escalaciones.
     - Envía mensaje inicial al topic con contexto HTML completo (header `#{sessionShortId}` para distinguir esta consulta dentro del historial del topic, nombre, rol, negocio, teléfono, email, pantalla, pregunta original, respuesta del bot con score, detalle extra)
     - Guarda `telegram_thread_id` en `support_sessions` (varias sesiones del mismo usuario comparten el mismo thread_id, apuntando al mismo topic en Telegram)
     - Inserta mensaje del sistema: "✅ Te conectaré con el desarrollador"
   - **Si dev fuera de horario:**
     - Marca `status = 'queued'`
     - Inserta mensaje del sistema con el `out_of_hours_message` configurado
     - No crea topic todavía (se creará cuando vuelva a estar disponible)
6. El widget cambia a **modo soporte** (header verde "Conectado con el dev")
7. El cliente escribe texto / adjunta archivos:
   - Si hay archivo, primero se sube a `support-attachments/{session_id}/{message_id}.{ext}` y se genera signed URL (30 días)
   - Se inserta fila en `support_messages` con `role='client'`, `attachment_url` y `attachment_type` si aplica
   - Frontend invoca `support-send-to-telegram` con el `message_id` → la edge function descarga el archivo de Storage y lo envía al topic vía `sendMessage` / `sendPhoto` / `sendVideo` / `sendAudio` / `sendDocument`
   - El mensaje en Telegram lleva header HTML: `<b>Nombre</b> · <i>Rol</i> · Negocio`
8. El **desarrollador** entra al topic en Telegram y responde directamente (texto, foto, video, voz, doc)
9. Telegram envía el update al webhook → `telegram-webhook`:
   - Valida el `?secret=` de la URL
   - Confirma que `message.chat.id == TELEGRAM_SUPPORT_GROUP_ID`
   - Busca la session por `message_thread_id` priorizando `status IN ('active','queued')` ordenada por `created_at DESC LIMIT 1` (varias sesiones del mismo usuario comparten thread_id desde el cambio a "un topic por usuario"). Si todas están cerradas, hace fallback a la más reciente para no perder un `/close` tardío.
   - Si hay adjunto: descarga del CDN de Telegram (`api.telegram.org/file/bot<TOKEN>/<path>`), sube a Storage, genera signed URL
   - Inserta fila en `support_messages` con `role='developer'`. Si la sesión enrutada está `closed` y el mensaje no es `/close`, se ignora para no contaminar el historial post-cierre.
   - Si la session estaba `queued`, cambia a `active`
   - Comando `/close` cierra la sesión y archiva el topic (pero `profiles.telegram_thread_id` queda intacto, listo para reabrirse)
10. El widget recibe el INSERT por **Supabase Realtime** y renderiza el mensaje con badge verde "Soporte humano". Adjuntos se muestran inline (`<img>`, `<video controls>`, `<audio controls>`, link a documento).
11. Cualquiera puede cerrar la sesión:
    - Cliente: botón "Terminar conversación" en el widget
    - Dev: `/close` en el topic

---

## Esquema de BD

### `profiles` (sólo la columna añadida por este módulo)

| Columna | Tipo | Propósito |
|---|---|---|
| `telegram_thread_id` | bigint | `message_thread_id` permanente del Forum Topic del usuario en el grupo de Telegram. Se setea la primera vez que el usuario escala y se reutiliza/reabre en escalaciones posteriores. NULL = aún no ha escalado nunca. |

### `push_subscriptions`

| Columna | Tipo | Propósito |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid (FK auth.users) | Cliente al que pertenece esta suscripción |
| `endpoint` | text UNIQUE | Endpoint del push service del navegador (Chrome, Firefox, etc.) |
| `p256dh`, `auth` | text | Claves de cifrado de la suscripción |
| `user_agent` | text | UA del navegador al momento del subscribe (debug) |
| `last_used_at` | timestamptz | Timestamp del último push exitoso |

**RLS:** el usuario solo ve/inserta/borra las propias (`user_id = auth.uid()`); **no hay** policy de `UPDATE`. La **reasignación** del endpoint a otro usuario (dispositivo compartido) se hace vía la función `claim_push_subscription` (`SECURITY DEFINER`, bypass RLS controlado), porque un `ON CONFLICT DO UPDATE` requiere visibilidad `SELECT` de la fila ajena y `SELECT` es own-only. El borrado en logout usa `release_push_subscription` (también `SECURITY DEFINER`). Las edge functions usan service role.

### `developer_availability` (singleton)

| Columna | Tipo | Propósito |
|---|---|---|
| `developer_email` | text unique | Email del dev (matchea con `VITE_DEVELOPER_EMAIL`) |
| `timezone` | text | Default `America/Bogota` |
| `days_available` | jsonb | Array `["mon","tue",...]` |
| `hour_start`, `hour_end` | time | Horario laboral |
| `out_of_hours_message` | text | Texto mostrado al cliente fuera de horario |

### `support_sessions`

| Columna | Tipo | Propósito |
|---|---|---|
| `business_id` | uuid | FK businesses |
| `business_name` | text | **Snapshot** (sobrevive si renombran el negocio). El **ID público** del negocio (`businesses.public_id`) se lee en vivo en `support-escalate` y va al topic/header de Telegram; no se snapshotea aquí. |
| `user_id` | uuid | FK profiles |
| `user_full_name`, `user_role`, `user_phone`, `user_email` | text | **Snapshots** del cliente |
| `status` | text | `active` / `queued` / `closed` |
| `original_question`, `bot_last_answer`, `best_score` | — | Contexto del bot al momento de escalar |
| `user_screen` | text | Pantalla activa del cliente (ej. `SELL`) |
| `extra_detail` | text | Texto opcional del cliente |
| `telegram_thread_id` | bigint | `message_thread_id` del topic de Telegram. **Importante:** varias sesiones del mismo usuario comparten el mismo thread_id (un topic permanente por usuario). El webhook desambigua por `status` y `created_at`. |

### `support_messages`

| Columna | Tipo | Propósito |
|---|---|---|
| `session_id` | uuid | FK support_sessions |
| `role` | text | `client` / `developer` / `system` |
| `content` | text | Texto del mensaje |
| `attachment_url` | text | Signed URL del archivo (TTL 30 días) |
| `attachment_type` | text | `image` / `video` / `document` / `audio` |
| `telegram_message_id` | bigint | ID del mensaje en Telegram (correlación) |

### RLS

- **`is_developer()`** — función helper (SECURITY DEFINER, grant solo a `authenticated`) que retorna `true` si el JWT del usuario matchea `developer_email` en `developer_availability`.
- **support_sessions / support_messages**: `SELECT/UPDATE/INSERT` permitido si `user_id = auth.uid()` o `is_developer()`.
- **support-attachments (Storage)**: lectura/escritura permitida solo si el primer segmento del path (`{session_id}`) corresponde a una sesión propia o el caller es el dev.

### Realtime

Las tablas `support_messages` y `support_sessions` están registradas en la publicación `supabase_realtime`. El widget se suscribe con filtro `session_id=eq.{id}` para recibir INSERTs y UPDATEs en vivo.

---

## Edge Functions

### `support-escalate` (verify_jwt: true)

- **Input:** `{ session_id?, original_question, bot_answer?, best_score?, user_screen?, extra_detail? }`
- **Auth:** decodifica el JWT manualmente (`sub` → user_id, `email` → email). NO usa `auth.getUser()` con un cliente secundario porque demostró ser frágil — confiamos en que el Edge Runtime ya validó el JWT antes de invocar la función.
- **Output:** `{ session_id, status, dev_available, out_of_hours_message? }`

### `telegram-webhook` (verify_jwt: false)

- **Input:** payload estándar de Telegram (`update.message` o `update.edited_message`)
- **Auth:** parámetro `?secret=` debe matchear `TELEGRAM_WEBHOOK_SECRET`
- **Lógica clave:**
  - Solo procesa mensajes del `chat.id == TELEGRAM_SUPPORT_GROUP_ID`
  - Busca session por `message_thread_id`
  - Comando `/close` → cierra session + `closeForumTopic`
  - Adjuntos: usa `getFile` → descarga del CDN → sube a Storage → genera signed URL (TTL 24h)
  - **Preserva `mime_type` real** al subir a Storage (antes hardcodeaba `image/jpeg`)
  - **Detecta imágenes/videos/audios enviados como archivo** (`message.document` con `mime_type: image/*` etc.) y los trata como su tipo real — clave para preservar calidad porque Telegram NO comprime archivos enviados como "documento"
  - Soporta `message.audio` además de `message.voice`
- **IMPORTANTE:** la response siempre es `200 OK` (incluso en errores) para evitar que Telegram reintente.

### `support-send-to-telegram` (verify_jwt: true)

- **Input:** `{ message_id }`
- **Lógica:** carga el mensaje + session, verifica que `session.user_id == jwt.sub`, descarga el adjunto de Storage si existe, y envía al topic con `sendMessage` / `sendPhoto` / `sendVideo` / `sendAudio` / `sendDocument` según `attachment_type`. Cada mensaje lleva header HTML con `<b>{full_name}</b> · <i>{role}</i> · {business_name}`.

### `send-support-push` (verify_jwt: false)

- **Trigger:** invocada por `telegram-webhook` después de insertar un mensaje del dev. Auth por `?secret=` query param contra `SUPPORT_PUSH_SECRET`.
- **Input:** `{ user_id, title, body, url?, tag? }`
- **Lógica:**
  1. Carga todas las filas de `push_subscriptions` para el `user_id`.
  2. Para cada una envía Web Push con `web-push@3.6.7` (VAPID). Payload es JSON con `{ title, body, url, tag, timestamp }`.
  3. Si el endpoint retorna 404/410 → la suscripción expiró, se borra de BD.
  4. Actualiza `last_used_at` en las que entregaron OK (best-effort).
- **Output:** `{ ok, sent, total, results }`

### `support-cleanup-expired` (verify_jwt: false)

- **Input:** ninguno (validación por `?secret=` query param contra `SUPPORT_CLEANUP_SECRET`)
- **Trigger:** invocada por `pg_cron` diariamente (a las 04:00 AM) vía `pg_net.http_post`
- **Lógica:**
  1. Busca todas las `support_sessions` con `status='closed' AND closed_at < NOW() - INTERVAL '24 hours'`
  2. Para cada una: lista archivos en Storage bajo `{session_id}/` y los borra con `storage.remove()`
  3. Borra la fila de `support_sessions` → trigger CASCADE elimina también las filas de `support_messages` asociadas
- **Output:** `{ deleted_sessions, deleted_files, errors? }`
- **Por qué 24h:** la signed URL de los adjuntos también tiene TTL 24h → al borrarse el archivo, la URL ya no funcionaría de todos modos. El cliente tiene 24h para revisar el historial de la conversación cerrada antes de que se purgue.

---

## Setup inicial (UNA SOLA VEZ)

### 1. Crear el bot en Telegram

1. Abrir Telegram → buscar **@BotFather**
2. Enviar `/newbot` → elegir nombre y username (debe terminar en `_bot`)
3. **Guardar el token** que BotFather devuelve
4. Enviar `/setprivacy` → seleccionar el bot → **Disable** (para que lea TODOS los mensajes del topic, no solo los que lo mencionen)

### 2. Crear el Grupo con Forum Topics

1. Telegram → Nuevo Grupo → "Bistro Soporte" → añadir solo al bot (y los devs si crecen)
2. Editar grupo → activar **Topics** (Telegram lo convierte en supergrupo automáticamente)
3. **Añadir el bot como miembro** (no basta con tenerlo invitado al crear)
4. Promoverlo a **Administrador** con el permiso `can_manage_topics` ("Gestionar temas") activado

### 3. Obtener el `chat_id` del grupo

Opción A — del URL: cuando entras al grupo en Telegram Web, la URL es `web.telegram.org/a/#-1003834190490` → ese número con el `-` es el chat_id.

Opción B — vía API:
```bash
curl "https://api.telegram.org/bot<TOKEN>/getUpdates"
# Buscar "chat":{"id":-1001XXXXXXXX,...}
```

### 4. Provisionar secrets en Supabase

Dashboard → Project Settings → Edge Functions → Secrets → añadir:

| Name | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token del paso 1 |
| `TELEGRAM_SUPPORT_GROUP_ID` | chat_id del paso 3 (con el `-` adelante) |
| `TELEGRAM_WEBHOOK_SECRET` | Random hex (ej. `openssl rand -hex 32`) |
| `SUPPORT_CLEANUP_SECRET` | Random hex que protege la edge function `support-cleanup-expired` invocada por el cron horario |

### 5. Registrar el webhook

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<PROJECT>.supabase.co/functions/v1/telegram-webhook?secret=<TELEGRAM_WEBHOOK_SECRET>"
```

Verificar con:
```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```

### 6. Frontend — variable de entorno

En `.env`:
```
VITE_DEVELOPER_EMAIL=tu-email@dominio.com
```

Este email es el que aparece en `profile.email` cuando el dev se loguea en la app. Sirve solo para mostrar la tarjeta amber "Soporte humano (Dev)" en Settings y permitir editar `developer_availability` desde la UI.

### 7. Configurar disponibilidad en la app

1. Entrar a Bistro con la cuenta cuyo email matchee `VITE_DEVELOPER_EMAIL`
2. **Ajustes** (sidebar) → tarjeta amber **"Soporte humano (Dev)"** al final
3. Marcar días disponibles, horario de inicio/fin y el mensaje fuera de horario
4. **Guardar**

### Tip de calidad para envíos del dev

Cuando respondas al cliente desde Telegram y necesites enviar una imagen / video con buena calidad, envíalos **como archivo** (no como foto):
- **Móvil:** mantén presionado el botón Enviar → "Enviar como archivo" / "Send as file"
- **Desktop:** al adjuntar, marca la opción "Send as file" antes de enviar

Esto evita la compresión automática de Telegram (~1280px máximo). El webhook detecta `mime_type: image/*` o `video/*` y muestra el archivo inline en el widget como si fuera una foto/video normal, pero con calidad original.

---

## Componente UI: `DeveloperAvailabilityPanel`

- Se renderiza dentro de `SettingsSidebarPanel.tsx` (al final del scroll container)
- Condicionado: `profile.email.toLowerCase() === import.meta.env.VITE_DEVELOPER_EMAIL.toLowerCase()` — invisible para cualquier otro usuario
- Upsert directo sobre `developer_availability` con `onConflict: 'developer_email'`
- Días representados como toggles L-D, horarios con `<input type="time">`, textarea para `out_of_hours_message`

---

## Comportamiento del widget según el estado de la sesión

| Estado | Header | Input placeholder | Mensajes que se muestran |
|---|---|---|---|
| Sin session | "Asistente IA · BISTRO POS" (icon `smart_toy`) | "Haz tu pregunta..." | RAG + feedback 👍/👎 |
| `queued` | "Soporte Bistro · ESPERANDO AL DEV" (icon `support_agent`) | "Escribe al desarrollador..." | RAG + system msg "fuera de horario" + bloque verde activo abajo del chat |
| `active` | "Soporte Bistro · CONECTADO CON EL DEV" (icon `support_agent` verde) | "Escribe al desarrollador..." | RAG + system msg + mensajes del dev (bloque verde) cerca del input |
| `closed` | Vuelve a "Asistente IA · BISTRO POS" | "Haz tu pregunta..." | **Bloque gris colapsable ARRIBA** con historial + chat IA debajo + aviso "Se borra en Xh Ym" |

### Orden vertical del contenido
1. **Conversación cerrada** (card gris colapsada por defecto, arriba del todo)
2. **Mensajes del chat IA** (zona principal, en el medio)
3. **Sesión activa con el dev** (card verde, justo encima del input — cerca de donde escribes)

### Restauración de sesión

El widget restaura la sesión más reciente al montar — `useSupportSession.loadActiveSession()` busca `support_sessions WHERE user_id=auth.uid()` ordenado por `created_at DESC LIMIT 1` (sin filtrar por status). Esto permite ver **el historial de la última conversación cerrada** hasta que el cron la purgue a las 24h. Si el cliente cierra el navegador y vuelve, su conversación (activa o cerrada reciente) sigue ahí.

### Card de conversación cerrada

Cuando la sesión queda `closed`, el bloque se transforma en una **card gris colapsable** que aparece arriba de todo:

- **Colapsada (default):** muestra solo `[✓] Conversación con soporte cerrada · 22 may, 10:09 · 6 mensajes`
- **Expandida:** muestra todos los mensajes históricos + un aviso al final tipo:
  ```
  🕒 Se borra en 22h 39m · se borra el 23 may, 10:09 a. m.
  ```
- El contador del tiempo restante **se actualiza cada minuto** vía `setInterval(60_000)`
- No hay botón para borrar manualmente — el cleanup lo hace el cron horario

---

## Lightbox de adjuntos (modal in-app)

Cuando el cliente o el dev hacen click en un adjunto (imagen/video/documento), **NO se abre nueva pestaña** — se abre un modal fullscreen dentro de la app. Estado controlado por `viewingAttachment` en el widget.

### UX del modal

- **Fondo:** `bg-black` opaco (sin `backdrop-blur` para no degradar la calidad del compositing)
- **Botón cerrar:** `fixed top: max(env(safe-area-inset-top), 12px)` — respeta notch de iPhone/Android, siempre visible sobre la imagen
- **Cerrar con Esc** (handler global solo activo cuando `viewingAttachment !== null`)
- **Tap en cualquier parte cierra** para imagen (la imagen no tiene `stopPropagation`). Para video sí tiene `stopPropagation` porque el cliente necesita usar los controles sin que se cierre.

### Calidad de imagen — replicando el visor nativo

Para que las imágenes se vean **idénticas a abrir el link directo en una pestaña nueva**:

- **NO usar `w-screen h-screen object-contain`** — fuerza al navegador a escalar a un tamaño impuesto, degradando calidad.
- **SÍ usar `maxWidth: '100vw', maxHeight: '100vh', width: 'auto', height: 'auto'`** — la imagen se renderiza a su tamaño natural y solo se reduce si excede el viewport, usando el algoritmo nativo del navegador (igual que el visor nativo).
- **`decoding="sync"`** — fuerza decodificación síncrona (sin modos progresivos de baja calidad durante la carga)
- **`loading="eager"`** — sin lazy loading
- **`fetchPriority="high"`** — prioridad de descarga alta

### Por qué a veces las imágenes se ven peor en el chat

Telegram comprime automáticamente las imágenes enviadas como **foto** (`sendPhoto`/`message.photo`) a una resolución máxima de ~1280px en el lado largo. La compresión es notable.

**Para preservar calidad original**, el dev debe enviar la imagen como **archivo** desde Telegram:
- Mobile: mantener presionado el botón Enviar → "Enviar como archivo"
- Desktop: al adjuntar elegir "Send as file"

El webhook detecta `message.document` con `mime_type: image/*` y la trata como imagen inline (no como documento descargable). Resultado: la imagen llega al cliente con calidad original.

---

## Render de mensajes en el widget

Los mensajes de la sesión de soporte usan un layout diferente al chat IA para que los adjuntos se vean limpios y no encerrados en una burbuja amber/verde:

| Tipo de mensaje | Render |
|---|---|
| **Solo texto** | Burbuja amber (cliente) o verde clara (dev) con `rounded-2xl px-4 py-2.5` |
| **Solo imagen / video** | Card standalone con `rounded-2xl overflow-hidden shadow-sm` — sin burbuja envolvente. Click → abre lightbox. |
| **Solo audio** | Card delgada con `audio controls` inline (no abre lightbox) |
| **Solo documento** | Chip clickeable con icono `description` y texto "Documento adjunto" — abre lightbox con botón Descargar |
| **Adjunto + texto** | Card del adjunto arriba, burbuja con el texto debajo (gap-1.5 entre ambos) |

El video en el chat se muestra como thumbnail con un play icon grande superpuesto sobre un overlay `bg-black/30`. Reproducir el video requiere abrir el lightbox.

Max width de cada mensaje: `75%` del ancho del contenedor (antes 85%). Los adjuntos multimedia se ven mejor con un poco más de aire alrededor.

---

## Responsive

El widget detecta el breakpoint con `isDesktop = window.innerWidth >= 768` (cambió de 1024 a 768). Esto se alinea con el comportamiento del Sidebar de Bistro (`md:flex w-64` → visible desde 768px).

| Breakpoint | Comportamiento |
|---|---|
| **< 768 px (móvil)** | Modal flotante centrado: `top: 7%, left: 4%, right: 4%, height: 78vh, rounded-3xl` con backdrop oscuro |
| **≥ 768 px (tablet+)** | Panel fijo lateral pegado al sidebar: `left: 272px, top: 16px, bottom: 16px, width: min(580px, calc(100vw - 288px))` |

El offset `left: 272px` = `256px` (ancho del sidebar) + `16px` (padding). El width usa `min(580px, ...)` para que en pantallas grandes no se estire infinitamente.

### Lightbox responsive

El modal del lightbox funciona igual en todas las pantallas — la imagen se renderiza con `maxWidth: 100vw, maxHeight: 100vh, width: auto, height: auto`. El botón cerrar usa `env(safe-area-inset-*)` para respetar notches en móviles modernos.

---

## Troubleshooting (errores resueltos)

| Síntoma | Causa | Solución |
|---|---|---|
| `Request header field x-client-info is not allowed by Access-Control-Allow-Headers` | El cliente `supabase-js` añade `x-client-info` al invocar functions; el CORS no lo permitía | Añadir `x-client-info, apikey, content-type` a `Access-Control-Allow-Headers` |
| `POST /support-escalate → 401` con execution_time alto | `auth.getUser()` con cliente secundario falla en algunos entornos (token cache, edge cold start) | Decodificar el JWT manualmente extrayendo `sub` y `email` (seguro porque `verify_jwt: true` ya validó la firma) |
| `permission denied for function is_developer` al insertar en `support_messages` | Revoqué `EXECUTE` de la función para resolver advisory de seguridad, pero las policies RLS la llaman desde el rol `authenticated` | `GRANT EXECUTE ON FUNCTION is_developer() TO authenticated` (mantener revocado para `anon`) |
| `createForumTopic → 400 not enough rights to create a topic` | El bot está en el grupo pero sin el permiso `can_manage_topics` | Editar bot en Administrators → activar "Manage Topics" |
| Bot creado pero `can_read_all_group_messages: false` | Privacy mode activado por defecto | `@BotFather /setprivacy → Disable` |
| `getUpdates` retorna `[]` pero `sendMessage` funciona | El webhook ya está registrado — `getUpdates` no devuelve nada porque Telegram entrega vía webhook | Es esperado. Usar `getWebhookInfo` para verificar. |
| Imágenes del dev se ven borrosas en el chat del cliente | Telegram comprime fotos a ~1280px max | El dev debe enviar las imágenes como **archivo** (no como foto). El webhook ya detecta `message.document` con `mime_type: image/*` y las trata como imagen |
| Botón X del lightbox no visible sobre la imagen | Botón con `bg-white/15` casi transparente sobre fondo claro | Cambiado a `bg-black/70` + border blanco translúcido + `shadow` para garantizar contraste |
| Imagen del lightbox se ve peor que abrir la URL directa | `w-screen h-screen object-contain` forzaba escalado a viewport con interpolación rápida | Cambiar a `maxWidth/maxHeight: 100vw/vh, width/height: auto` — replica el visor nativo del navegador (sin upscale, downscale proporcional) |
| Cron `support-cleanup-expired-hourly` corre pero retorna 401 | Falta el secret `SUPPORT_CLEANUP_SECRET` en Supabase Edge Functions Secrets | Añadirlo en Dashboard → Project Settings → Edge Functions → Secrets |
| `new row violates row-level security policy for table "support_messages"` al enviar el primer mensaje tras escalación | Stale closure en `sendClientMessage`: el `useCallback` capturaba el `session` anterior (cerrado). El RLS rechaza INSERTs con `session_id` de sesión `closed`. | `sendClientMessage` acepta ahora `sessionId?: string` como tercer parámetro. `handleSend` pasa `newSession.id` (retorno de `escalate()`) explícitamente — ver fix en `hooks/useSupportSession.ts` y `components/rag/RagChatWidget.tsx` |
| La notificación push del admin también le suena a un empleado del mismo negocio (dispositivo compartido) | El endpoint físico del dispositivo quedaba mapeado al primer usuario. No se podía reasignar con `upsert(onConflict:'endpoint')`: `ON CONFLICT DO UPDATE` exige visibilidad `SELECT` de la fila ajena, y `SELECT` es own-only (error `42501 … USING expression`) | Funciones `SECURITY DEFINER` `claim_push_subscription` / `release_push_subscription` (migración `push_subscription_claim_release_rpc`); el hook y `AuthContext.signOut` las llaman vía `supabase.rpc(...)`. Una policy `UPDATE` sola NO basta |

---

## Modelo de privacidad y retención

- El contexto enviado al topic (pregunta original, respuesta del bot, datos del cliente) puede contener información sensible del negocio.
- **El grupo es privado** — solo el dev y bots autorizados están dentro. Telegram cifra los mensajes en tránsito.
- Los adjuntos se almacenan en Storage **privado** con signed URLs (**TTL 24h**). Las políticas RLS impiden que un cliente vea sesiones de otros clientes.
- La tabla `support_sessions` mantiene **snapshots** de `business_name`, `user_full_name`, `user_role` — si el dueño rebautiza el negocio, las sesiones (no purgadas) conservan el nombre original.

### Auto-limpieza a las 24h

Las sesiones cerradas se borran automáticamente **24h después de su `closed_at`**:
- Filas en `support_sessions` y `support_messages` (CASCADE)
- Archivos en el bucket `support-attachments` bajo `{session_id}/`

**Lo que NO se borra:** el topic en el grupo de Telegram queda archivado para tu referencia histórica (Telegram lo conserva indefinidamente sin costo). Si necesitas releer una conversación >24h después, búscala en Telegram.

**Cliente vs dev:**
- Cliente tiene 24h post-cierre para revisar la conversación en el widget (colapsada por defecto)
- Después de 24h: ya no aparece en el widget (porque BD la purgó)
- Si el cliente abre el widget post-purga: solo ve el chat IA fresh, sin historial

---

## Migración futura: múltiples devs

El schema ya soporta varias filas en `developer_availability` (`developer_email` único). Para escalar:
- Cambiar `is_developer()` para que retorne `true` si el JWT matchea **cualquier** email en la tabla
- Añadir columna `assigned_dev_email` en `support_sessions` y lógica round-robin en `support-escalate`
- Configurar un Grupo de Telegram por dev (o múltiples `chat_id` en `developer_availability`)

---

## Archivos relevantes

**Frontend**
- `components/rag/RagChatWidget.tsx` — UI completa (chat IA + feedback + handoff). Reproduce sonido al recibir mensaje del dev y reporta al padre cuándo el widget está visible/oculto para el contador unread.
- `components/DeveloperAvailabilityPanel.tsx` — formulario de horarios del dev
- `components/SettingsSidebarPanel.tsx` — integra `DeveloperAvailabilityPanel` al final
- `components/Sidebar.tsx` — recibe `ragUnreadCount` y pinta dot rojo arriba a la derecha del icono `smart_toy` en "Asistente IA"
- `hooks/useSupportSession.ts` — sesión + realtime + send + handoff + close. Acepta `onDevMessage` callback que se dispara al recibir INSERT con `role='developer'`.
- `hooks/usePushSubscription.ts` — suscribe a Web Push si la app está corriendo como PWA instalada. Llamado desde `App.tsx` (no desde el widget). Reclama el endpoint para el usuario activo en cada login vía `supabase.rpc('claim_push_subscription', …)`; en logout lo libera vía `supabase.rpc('release_push_subscription', …)` para aislar notificaciones en dispositivos compartidos.
- `hooks/useDeveloperAvailability.ts` — lee `developer_availability` y expone `isAvailableNow`, `nextAvailableLabel` (en español natural, ej. "lunes 25 may a las 9 a. m.") y `scheduleLabel` (resumen tipo "L-S, 9 a. m. – 8:08 p. m."). Usado por el widget para el aviso pre-envío.
- `hooks/useRagChat.ts` — chat IA original (sin cambios estructurales)
- `App.tsx` — pasa `currentScreen` al widget, mantiene `ragUnreadCount` global y lo pasa al Sidebar + botón "IA" del mobile bottom nav. Escucha `postMessage({ type: 'OPEN_SUPPORT_CHAT' })` del SW para abrir el widget desde una notificación. También lee `?action=open_chat` al montar para el caso en que la app estaba cerrada.
- `public/sounds/dev-message.mp3` — sonido soft pop reproducido cuando llega mensaje del dev (foreground)
- `public/push-sw.js` — listener `push` + `notificationclick`. Al hacer click: si la app está abierta envía `postMessage({ type: 'OPEN_SUPPORT_CHAT' })` y enfoca la ventana; si está cerrada abre `/?action=open_chat`.
- `vite.config.ts` — configura `importScripts: ['/push-sw.js']` en VitePWA

**Backend (Supabase)**
- `supabase/functions/support-escalate/index.ts` (v9) — sin lógica `queued`, siempre crea topic
- `supabase/functions/telegram-webhook/index.ts` (v7) — dispara `send-support-push` tras INSERT del dev
- `supabase/functions/support-send-to-telegram/index.ts`
- `supabase/functions/support-cleanup-expired/index.ts`
- `supabase/functions/send-support-push/index.ts` (v1) — Web Push delivery
- Migraciones: `support_escalation_system`, `support_remove_trigger`, `is_developer_revoke_public_execute`, `is_developer_grant_authenticated`, `support_cleanup_cron`, `support_one_topic_per_user`, `support_push_subscriptions`, `developer_availability_public_read`, `push_subscriptions_update_policy` (descartada), `push_subscription_claim_release_rpc`

**Configuración**
- `.env` → `VITE_DEVELOPER_EMAIL`, `VITE_VAPID_PUBLIC_KEY`
- Supabase Edge Secrets → `TELEGRAM_BOT_TOKEN`, `TELEGRAM_SUPPORT_GROUP_ID`, `TELEGRAM_WEBHOOK_SECRET`, `SUPPORT_CLEANUP_SECRET`, `SUPPORT_PUSH_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
