# Documento de Diseño: Remediación de Seguridad de Bistro POS

## Overview

Este documento diseña la remediación de los 12 hallazgos de seguridad definidos en `requirements.md`. El diseño se rige por **una restricción rectora, por encima de cualquier otra**:

> Los cambios NO deben romper NINGUNA funcionalidad de la app. SOLO deben mejorar la seguridad.

Para honrar esa restricción, cada área de diseño incluye una subsección explícita **"Impacto en funcionalidad y cómo se preserva"** que responde tres preguntas: qué flujos legítimos toca el cambio, por qué esos flujos NO se rompen, y qué prueba de no-regresión lo confirma.

### Principios de diseño

1. **La seguridad real vive en el servidor, no en el cliente.** El cliente (bundle React/PWA/Capacitor) es inspeccionable y editable por el usuario final. Toda decisión de autorización efectiva se toma en PostgreSQL (RLS + funciones) o en edge functions de confianza. Lo que hace el cliente (ocultar botones, leer caché) es solo presentación.

2. **Aditivo antes que restrictivo.** Para los cambios con riesgo de regresión (sobre todo el Requisito 4), primero se agrega el camino server-side nuevo y se verifica que funciona, y SOLO DESPUÉS se cierra el camino inseguro viejo. Nunca se revoca un permiso antes de cubrir el flujo legítimo que dependía de él.

3. **Diferenciar por rol de base de datos.** Los `REVOKE` se aplican a `PUBLIC` y `anon` (nunca a `authenticated` cuando el cliente autenticado usa legítimamente la función). `service_role` ignora los grants y RLS, por lo que los componentes server-side (webhook, `ai-chat`) no se ven afectados por estos cambios.

4. **El modo offline es sagrado.** Ninguna medida puede impedir que un usuario válido venda, abra/cierre caja, abone, compre o registre mermas sin conexión. La validación fuerte se ejecuta en el servidor al sincronizar la cola, no bloqueando la operación local.

5. **Cambios de BD solo vía migraciones verificadas con MCP.** Por regla del workspace, el estado real de tablas, funciones, políticas y grants se verifica con las herramientas MCP (`list_tables`, `list_edge_functions`, `list_migrations`, `execute_sql`) antes de aplicar cada migración. Los archivos locales en `supabase/` están desincronizados y NO son fuente de verdad.

### Estado real del sistema (verificado)

El diseño se apoya en el estado en vivo ya verificado, no en los archivos locales:

- `wompi-webhook` **ya está desplegada** (verify_jwt=false) y ya verifica firma HMAC-SHA256 con `WOMPI_EVENTS_SECRET` y aplica el pago de forma idempotente (índice único `subscription_invoices_unique_wompi_tx`, error 23505 → ya procesado). **Limitación actual:** su lógica `applyApprovedPayment` solo resuelve referencias de plan personalizado y aplica una extensión fija; no reproduce la lógica de periodos del catálogo público ni crea trials.
- `firebase-phone-auth` (v21) **decodifica** el JWT de Firebase pero **NO verifica su firma** (solo valida `exp`, `aud`, `iss`, `sub` sobre un payload sin autenticar) — hallazgo 1.
- `execute_readonly_query` tiene como **único consumidor** a `ai-chat`, que la invoca con `service_role`.
- Las RPC mutantes (`close_cash_shift`, `deduct_stock_for_order`, `increment_stock`, `delete_order_and_restore_stock`, `void_order_and_restore_stock`, `process_sale_refund`) las llama el **cliente autenticado** desde los hooks; `update_client_debt` es una **función trigger** (0 argumentos) y `execute_readonly_query` es solo-`service_role`.
- ACL actual de esas funciones: `PUBLIC + anon + authenticated + service_role` tienen `EXECUTE` (el `=X` inicial es PUBLIC).
- El pago de plan público en `SubscriptionPlansScreen` hoy pasa por `openCustomPlanCheckout` (referencia `custom-…`) y luego el **cliente** escribe la activación en `business_subscriptions` con lógica de periodos propia (primer pago Mensual = `initial_period_months`, Trimestral = 3, Anual = 12). El trial se escribe también desde el cliente (`handleStartTrial`, sin pago).
- El firmado QZ (`lib/qzSigning.ts`) ocurre en el navegador **por diseño, para funcionar offline**; la clave privada RSA está embebida en el bundle.
- `InvoiceReviewPanel.tsx` **ya reemplazó** `new Function()` por un intérprete aritmético recursivo seguro (`ADD/SUB/MULT/DIV`); el hallazgo 12.1 está mayormente resuelto en el código local y resta endurecer el rechazo explícito y agregar pruebas.

## Architecture

### Modelo de confianza por capas

```
┌───────────────────────────────────────────────────────────────┐
│  CLIENTE (bundle React / PWA / Capacitor)  —  NO CONFIABLE       │
│  · Oculta/muestra UI según usePermissions (solo presentación)    │
│  · Cachea perfil y suscripción en localStorage (solo lectura     │
│    de presentación mientras revalida)                            │
│  · Encola operaciones offline (IndexedDB) sin poder de decisión  │
└───────────────┬───────────────────────────────────────────────┘
                │ anon key (pública) + JWT de sesión (authenticated)
                ▼
┌───────────────────────────────────────────────────────────────┐
│  FRONTERA DE AUTORIZACIÓN — SERVIDOR (confiable)                 │
│                                                                  │
│  A) PostgreSQL + RLS + funciones SECURITY DEFINER                │
│     · RLS filtra por business_id = get_user_business_id()        │
│     · Grants EXECUTE mínimos (PUBLIC/anon revocados)             │
│     · auth.uid() / auth.role() como identidad efectiva          │
│                                                                  │
│  B) Edge functions de confianza (Deno)                           │
│     · firebase-phone-auth: verifica FIRMA del JWT (JWKS)        │
│     · wompi-webhook: verifica firma HMAC y activa suscripción   │
│     · create-employee: valida admin del negocio                 │
│     · proxies (gemini/goupc/cse): guardan claves server-side    │
│     · service_role solo aquí, nunca en el cliente               │
└───────────────────────────────────────────────────────────────┘
```

### Dos fronteras que hoy están perforadas

El diseño cierra las dos vías por las que el cliente hoy toma decisiones que deberían ser del servidor:

1. **Autenticación forjable** (Req 1): un token de Firebase sin firma verificada permite suplantar cualquier teléfono. Se cierra verificando la firma contra el JWKS de Google en `firebase-phone-auth`.
2. **Escritura de estado sensible desde el cliente** (Req 4, 5, 10): activación de suscripción, RPC mutantes accesibles por `anon`, y privilegios derivados de datos cacheados. Se cierra moviendo la escritura al servidor y endureciendo RLS/grants.

### Estrategia de migración segura (aplica a todo el spec)

Todo cambio que revoca un permiso o cierra un camino sigue este orden invariable:

```
Paso 1  Agregar el camino server-side nuevo (aditivo, sin quitar nada).
Paso 2  Verificar con MCP que el camino nuevo funciona en vivo.
Paso 3  Recién entonces revocar/cerrar el camino inseguro viejo.
Paso 4  Verificar no-regresión de los flujos legítimos.
```

## Components and Interfaces

El diseño se organiza por requisito, agrupado por prioridad. Cada sub-área describe el cambio y su impacto en funcionalidad.

---

### Área 1 — Verificación de firma del JWT de Firebase (Req 1, Crítico)

**Componente:** `supabase/functions/firebase-phone-auth/index.ts`.

**Diseño:**
- Reemplazar `decodeFirebasePayload` (que solo hace `atob` del payload) por una verificación criptográfica completa contra el JWKS público de Google (`https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`, o el endpoint JWKS equivalente).
- Usar una librería estándar de verificación de JWT para Deno (por ejemplo `jose` vía `esm.sh`), NO implementar verificación de firma a mano.
- Validar en un solo paso firma + claims: `exp` (no expirado), `aud === FIREBASE_PROJECT_ID`, `iss === https://securetoken.google.com/<projectId>`, `sub` presente.
- Cachear las llaves públicas respetando el header `Cache-Control: max-age` de Google y refrescarlas al expirar.
- Obtener `phone_number` únicamente del token ya verificado.
- En firma inválida/expirada: responder error de autenticación (401/400) sin emitir sesión ni magic link.

**Interfaz (sin cambios para el cliente):** el contrato de entrada/salida (`{ firebaseToken, mode, pin }` → `{ success, user_id, hashed_token, is_new_user }`) se mantiene idéntico. El cliente no cambia.

**Impacto en funcionalidad y cómo se preserva:**
- Toca: login/registro por SMS OTP (Firebase) y el enlace Firebase→Supabase.
- No se rompe porque un token **legítimo** emitido por Firebase pasa la verificación de firma (está firmado por Google) exactamente igual que hoy pasaba la decodificación. Solo se rechazan tokens forjados, que hoy pasaban indebidamente.
- Prueba de no-regresión: un login real por teléfono con un dispositivo válido sigue emitiendo sesión; un token con firma alterada es rechazado.

---

### Área 2 — Gestión y rotación de secretos (Req 2, Crítico)

**Componentes:** `.gitignore`, historial de git, panel de Supabase/Firebase/Google, `docs/`.

**Diseño:**
- Añadir `.env` a `.gitignore` (si no está) y dejar de trackearlo (`git rm --cached .env`).
- Purga del historial: documentar el procedimiento (`git filter-repo`/BFG) como tarea operativa; el spec no ejecuta reescritura de historia automáticamente.
- Rotar en los proveedores: `VITE_SUPABASE_ANON_KEY` (rotación de claves del proyecto), claves de Firebase, `VITE_GEMINI_API_KEY`, `VITE_GOUPC_API_KEY`, `VITE_GOOGLE_CSE_API_KEY`.
- Para claves que necesariamente viajan al bundle (Firebase, anon key): restringir por dominio/IP autorizados en la consola del proveedor (orígenes oficiales: `dev.posbistro.online`, dominio de producción de Firebase Hosting, esquema Capacitor Android).
- Documentar en `docs/` qué claves son públicas por diseño (anon key) y cuáles deben dejar de exponerse (las de Gemini/GoUPC/CSE, ver Área 9).

**Impacto en funcionalidad y cómo se preserva:**
- Toca: build (`.env` sigue en disco local, solo deja de versionarse), autenticación y llamadas a APIs.
- No se rompe porque `.gitignore` no borra el `.env` local; el build sigue leyendo las mismas variables. La rotación mantiene el mismo nombre de variable con un valor nuevo: la app sigue funcionando tras actualizar el `.env` y los secrets de Supabase.
- La restricción por dominio no afecta a los orígenes oficiales; solo bloquea usos desde dominios no autorizados.
- Prueba de no-regresión: tras rotar, un build con el `.env` actualizado autentica y opera con normalidad desde los dominios oficiales.

---

### Área 3 — Eliminación de ejecución de SQL arbitrario (Req 3, Crítico)

**Componente:** función `execute_readonly_query`; consumidor `ai-chat`.

**Diseño:**
- `REVOKE EXECUTE ON FUNCTION execute_readonly_query(...) FROM PUBLIC, anon, authenticated;` (incluir `PUBLIC` explícitamente por el grant `=X`).
- `ai-chat` la seguirá invocando con `service_role`, que ignora los grants, por lo que **no se ve afectada**.
- Endurecer la función para blindar el hallazgo 3.4: rechazar consultas que referencien esquemas distintos de `public` (bloquear `auth`, `storage`, `vault`, `pg_catalog`, `information_schema`) y permitir solo sentencias `SELECT`. Esto protege incluso si en el futuro alguien re-otorga el permiso por error.
- Mantener la opción de sustituir por RPC parametrizadas de alcance fijo como endurecimiento futuro (documentado), pero la analítica conversacional necesita SQL dinámico, así que la eliminación total queda fuera de alcance para no romper `ai-chat`.

**Impacto en funcionalidad y cómo se preserva:**
- Toca: analítica conversacional (`ai-chat`).
- No se rompe porque `ai-chat` usa `service_role` (bypass de grants). Revocar a `anon`/`authenticated` cierra el acceso público sin tocar el camino legítimo.
- Prueba de no-regresión: una consulta de analítica vía `ai-chat` sigue devolviendo resultados; un intento directo con la anon key es denegado.

---

### Área 4 — Activación de suscripción server-side vía webhook (Req 4, Crítico) — el cambio más riesgoso

Este es el requisito con mayor riesgo de regresión, por eso se diseña como una **secuencia por pasos, aditiva antes que restrictiva**.

#### Estado actual (dos escrituras del cliente)

```
Pago con tarjeta / widget (plan público, custom o trial)
        │
        ├─ Plan público  → openCustomPlanCheckout (ref "custom-…")
        │                    onApproved → handlePaymentApproved()
        │                        └─ CLIENTE hace UPSERT business_subscriptions
        │                           (Mensual 1er pago = initial_period_months,
        │                            Trimestral +3, Anual +12) + INSERT invoice
        │
        ├─ Plan personalizado → applyCustomPlanPayment()
        │                        └─ CLIENTE hace UPDATE business_subscriptions (+1 mes)
        │
        └─ Trial (sin pago) → handleStartTrial()
                               └─ CLIENTE hace UPSERT status='trial'
```

El hueco (hallazgo 4): la RLS de `business_subscriptions` permite `UPDATE` de `status`/`current_period_end` a cualquier `authenticated` de su negocio, así que un usuario puede activarse sin pagar.

#### Diseño objetivo (una sola autoridad de escritura: el servidor)

```
Pago aprobado por Wompi
        │
        ▼
  wompi-webhook (service_role, firma HMAC verificada)
        │  resuelve business_id + plan_id + periodo correcto
        ▼
  business_subscriptions ← escritura ÚNICA de status/current_period_end
        │
        ▼ (realtime / poll de SOLO LECTURA)
  Cliente observa el cambio y muestra "activo"
```

#### Secuencia de migración segura (orden estricto)

```
Paso A (aditivo) ─ Ampliar el webhook, sin tocar RLS ni cliente
  A.1  Extender applyApprovedPayment para resolver TODAS las referencias:
         · "custom-…"  → plan personalizado (+1 mes, ya existe)
         · plan público → portar la lógica de handlePaymentApproved
                          (1er pago Mensual = initial_period_months,
                           Trimestral +3, Anual +12)
       Para resolver plan+negocio server-side sin ambigüedad se define un
       formato de referencia canónico que embebe los identificadores
       (ver Data Models). El webhook acepta el formato viejo "custom-…" y el
       nuevo durante la transición.
  A.2  Crear edge function start-trial-subscription (service_role) que:
         · valida Authorization y que el llamante es admin del negocio,
         · valida que el negocio no haya usado trial,
         · escribe status='trial' con la duración del plan.
  A.3  Mantener idempotencia (índice único wompi_transaction_id ya existe).

Paso B (verificación) ─ Confirmar con MCP en vivo
  B.1  Pago real de plan público → webhook activa con el periodo correcto.
  B.2  Pago real de plan personalizado → sigue activando (+1 mes).
  B.3  Inicio de trial → start-trial-subscription activa el trial.

Paso C (restrictivo) ─ Recién ahora cerrar el cliente y la RLS
  C.1  Migración de BD: bloquear escritura de columnas sensibles de
       business_subscriptions y subscription_invoices a authenticated;
       permitir solo a service_role (ver Data Models: trigger + policy).
  C.2  Cliente: handlePaymentApproved y applyCustomPlanPayment dejan de
       escribir; solo disparan el checkout y luego ESCUCHAN (realtime +
       poll de solo lectura) hasta ver status activo. handleStartTrial
       llama a start-trial-subscription.

Paso D (no-regresión) ─ Verificar todos los flujos de pago/trial.
```

**Componentes tocados:** `wompi-webhook` (extender), nueva `start-trial-subscription`, `lib/customPlanCheckout.ts` (`applyCustomPlanPayment` → solo lectura/observación), `screens/SubscriptionPlansScreen.tsx` (`handlePaymentApproved`, `handleStartTrial`), `screens/SubscriptionManagementScreen.tsx` y `App.tsx` (mismos helpers), RLS/trigger de `business_subscriptions` y `subscription_invoices`.

**Impacto en funcionalidad y cómo se preserva:**
- Toca: activación/renovación de suscripción (plan público, plan personalizado y trial) en las pantallas de suscripción, el banner de gracia y la pantalla de bloqueo.
- No se rompe porque el camino server-side (webhook + edge de trial) se despliega y verifica **antes** de quitar la escritura del cliente y **antes** de restringir la RLS (Pasos A y B antes del C). No hay ventana sin activación: mientras el cliente aún escribía, el webhook ya cubría los mismos casos de forma idempotente.
- La UI de suscripciones **sigue leyendo** `business_subscriptions` (RLS SELECT intacta) y ya tiene realtime + `pollTransactionStatus`; el cambio de estado llega por el webhook y se refleja igual que hoy.
- Se preserva la lógica de periodos exacta (bonus de primer pago, trimestral, anual) portándola al webhook, evitando la regresión de "el webhook aplicaba +1 mes fijo".
- Se preservan las reglas por negocio (10000 ve el menú; 10001 precios ocultos; planes personalizados por `assigned_business_id`): la migración no toca `subscription_plans` ni la lógica de presentación.
- Prueba de no-regresión: pagos reales de Mensual (1er pago y renovación), Trimestral, Anual y plan personalizado activan con el periodo correcto; el trial se inicia; un intento de `UPDATE status='active'` con la anon/authenticated key es denegado.

---

### Área 5 — Restricción de RPCs mutantes SECURITY DEFINER (Req 5, Crítico)

**Componentes:** funciones `close_cash_shift`, `deduct_stock_for_order`, `increment_stock`, `delete_order_and_restore_stock`, `void_order_and_restore_stock`, `cancel_order_and_restore_stock`, `process_sale_refund`, `update_client_debt`.

**Diseño (estrategia diferenciada por función):**

| Función | Quién la llama | REVOKE a | Mantiene EXECUTE |
|---------|----------------|----------|------------------|
| `close_cash_shift`, `deduct_stock_for_order`, `increment_stock`, `delete_order_and_restore_stock`, `void_order_and_restore_stock`, `cancel_order_and_restore_stock`, `process_sale_refund` | Cliente **autenticado** (hooks) | `PUBLIC`, `anon` | `authenticated`, `service_role` |
| `update_client_debt` (trigger, 0 args) | Triggers de BD | `PUBLIC`, `anon`, `authenticated` | `service_role` (y ejecución interna del trigger) |

- Verificación interna de pertenencia (5.2/5.3): en cada función mutante, validar `auth.uid()` autenticado y que el `business_id` objetivo coincide con `get_user_business_id()`; si no, `RAISE EXCEPTION`. `process_sale_refund` ya valida permiso/turno/cantidades; para las demás se agrega el chequeo de pertenencia donde falte.
- Fijar `search_path` inmutable en la misma migración (une con Req 12.5).
- Documentar el conjunto mínimo de funciones que `anon` sí necesita (las de autenticación pública), marcándolas como públicas por diseño.

**Impacto en funcionalidad y cómo se preserva:**
- Toca: cierre de caja, descuento/incremento de stock, anulación/devolución de ventas, abonos que disparan `update_client_debt`.
- No se rompe porque el cliente llama estas RPC **autenticado**, y `authenticated` conserva `EXECUTE`. `service_role` ignora los grants (webhook/`ai-chat` intactos). `anon` nunca las llamaba legítimamente. `update_client_debt` es trigger: revocar a `authenticated` no afecta su ejecución dentro del trigger.
- El chequeo de pertenencia solo rechaza operaciones cruzadas entre negocios, que nunca ocurren en un flujo legítimo.
- Prueba de no-regresión: venta, cierre de caja, abono, anulación y devolución (online y sincronizados desde offline) siguen funcionando; un intento con anon key es denegado.

---

### Área 6 — Protección del PIN contra fuerza bruta (Req 6, Alto)

**Componentes:** flujo de acceso por PIN (`AuthContext`, pantalla de login), funciones `login_email_for_phone` y `user_exists_by_phone`, config de Supabase Auth.

**Diseño:**
- Longitud mínima de 6 dígitos aplicada **en la creación/cambio de PIN** (registro, cambio de PIN vía `change-pin`), no en el login de PIN existentes.
- Rate limiting por origen (usuario/IP): tras 5 fallos en 10 min, bloqueo de 15 min. Se implementa con una tabla de intentos (`pin_login_attempts`) consultada por una edge function/RPC de acceso, o con el rate limiting nativo de Supabase Auth donde aplique.
- Habilitar `Leaked_Password_Protection` en Supabase Auth.
- Limitar la tasa de `login_email_for_phone` y `user_exists_by_phone` (rate limit por IP) para frenar enumeración.
- Mensajes de error genéricos ("credenciales inválidas") que no distinguen teléfono vs PIN, y mensaje genérico al bloquear por intentos.

**Impacto en funcionalidad y cómo se preserva:**
- Toca: login por PIN y verificación de existencia de teléfono.
- No se rompe porque el mínimo de 6 dígitos aplica solo a PIN nuevos/cambiados; los usuarios actuales siguen ingresando con su PIN vigente (se puede ofrecer actualización, no forzar). El umbral (5 fallos/10 min → 15 min) es holgado para un usuario legítimo. `Leaked_Password_Protection` solo rechaza PIN/contraseñas ya filtrados al momento de fijarlos.
- Prueba de no-regresión: un usuario con credenciales correctas entra sin fricción; 6+ intentos fallidos activan el bloqueo temporal.

---

### Área 7 — Autorización en la creación de empleados (Req 7, Alto)

**Componente:** `supabase/functions/create-employee` (verify_jwt=true).

**Diseño:**
- Leer el `Authorization` header e identificar al llamante (`supabase.auth.getUser(jwt)`).
- Verificar que el llamante tiene el permiso `admin_users` sobre el `business_id` objetivo (consultando su `profile`/rol en BD, no datos del cuerpo).
- Rechazar cualquier `business_id` del cuerpo que no coincida con el negocio del admin autenticado.
- Validar que el `role_id` solicitado pertenece al negocio del admin.
- Aplicar el mismo endurecimiento a `update-employee` y `delete-employee` por coherencia (defensa en profundidad).

**Impacto en funcionalidad y cómo se preserva:**
- Toca: alta/edición/baja de empleados desde Gestión de personal.
- No se rompe porque un admin legítimo del negocio pasa las validaciones exactamente igual que hoy. Solo se rechazan solicitudes de no-admins o hacia otros negocios, que nunca ocurren en el flujo legítimo.
- Prueba de no-regresión: un admin crea/edita/borra empleados de su negocio; un no-admin o un `business_id` ajeno es rechazado.

---

### Área 8 — Privacidad de los buckets de Storage (Req 8, Alto)

**Componentes:** buckets `debt-evidence`, `avatars`, `business-logos`, `product-images`; código que genera URLs de esos buckets.

**Diseño (diferenciado por sensibilidad, clave para no romper imágenes):**
- `debt-evidence` (dato sensible de clientes): bucket **privado**. Sustituir `getPublicUrl` por `createSignedUrl` con expiración en la UI de deudas/evidencias. Políticas de Storage que restringen lectura/escritura a usuarios del negocio dueño.
- `avatars`, `business-logos`, `product-images`: estos se muestran con `<img>` en toda la app (URLs directas), por lo que **NO se vuelven privados** (eso rompería la visualización). En su lugar se **deshabilita el listado público** de objetos (impedir enumeración) manteniendo la lectura por URL directa, y se restringe la **escritura** a usuarios autenticados con pertenencia al negocio.

**Impacto en funcionalidad y cómo se preserva:**
- Toca: visualización de evidencias de deuda, avatares, logos y fotos de producto; subida de imágenes.
- No se rompe porque para `debt-evidence` se migra el acceso a URL firmada (mismo archivo, acceso temporal autorizado) y para los otros tres buckets se conserva la lectura por URL directa que usan los `<img>`; solo se cierra el listado/enumeración y se endurece la escritura.
- Prueba de no-regresión: las evidencias de deuda se ven mediante URL firmada; avatares/logos/fotos de producto siguen mostrándose; subir una imagen desde el negocio dueño sigue funcionando; enumerar objetos del bucket es denegado.

---

### Área 9 — Proxy server-side para APIs y eliminación de claves embebidas (Req 9, Medio)

**Componentes:** llamadas cliente a Gemini/Go-UPC/Google CSE, `ai-chat` (fallback Gemini), `lib/qzSigning.ts`.

**Diseño:**
- Proxys edge para Gemini, Go-UPC y Google CSE que guardan la clave en secrets del servidor y validan que el solicitante es un usuario autenticado del negocio antes de reenviar. El cliente llama al proxy en vez de a la API externa.
- Retirar `VITE_GEMINI_API_KEY`, `VITE_GOUPC_API_KEY`, `VITE_GOOGLE_CSE_API_KEY` del bundle.
- Eliminar la clave Gemini hardcodeada como fallback en todas las edge functions que la tenían (`ai-chat`, `ocr-scan`, `scan-invoice`, `invoice-scan`); obtenerla solo de los secrets.

**Estado implementado — segmentación de claves Gemini (Req 9.3, 9.6, 9.7):**

Ya ejecutado y verificado en vivo con MCP. En lugar de una única `GEMINI_API_KEY` compartida por todas las funciones (que impedía medir el consumo por feature y obligaba a rotar todo junto), cada feature de IA lee un secret propio. Así el consumo se mide por separado en Google y una clave comprometida se rota aislada:

```
Secret                          Edge functions (versión desplegada)
──────────────────────────      ──────────────────────────────────
GEMINI_API_FOTOLISTA            ocr-scan (v32)
GEMINI_API_COMPRA_INVENTARIO    scan-invoice (v33), scan-invoice-unified (v4)
GEMINI_API_GASTO                scan-expense (v8)
GEMINI_API_ASISTENTE            rag-chat (v45), rag-index (v24)
GEMINI_API_COLORES_PROVEEDORES  get-brand-colors (v22)
GEMINI_API_KEY                  ai-chat (sin pantalla conectada; se migrará a su
                                propio secret cuando se le conecte una UI)
```

Complementariamente: se eliminó el fallback `|| "AIza…"` hardcodeado en `ocr-scan`, `scan-invoice`, `ai-chat` e `invoice-scan` (ahora leen solo del entorno), se retiró la variable muerta `VITE_GEMINI_API_KEY` del `.env` (no la usaba ningún código del cliente) y se borró la función muerta `invoice-scan` junto con su hook huérfano `useInvoiceScan`. Las claves viejas (las dos hardcodeadas y la del VITE) fueron rotadas/revocadas por el usuario en Google.

**Decisión de diseño con conflicto explícito — firmado QZ (9.4) vs modo offline:**

⚠️ La clave privada QZ vive en el bundle **precisamente para firmar mensajes offline** (requisito del POS). Mover el firmado a una edge function haría que la impresión **dependa de conexión**, rompiendo la impresión offline — una regresión inaceptable bajo la restricción #1.

Opciones (a decidir con el usuario en tasks):
- **A) Provisioning por equipo (recomendada, preserva offline):** retirar la clave privada del bundle y confiar el certificado una sola vez por dispositivo (instalador QZ o "Allow + Remember"). La impresión funciona offline sin clave privada en el cliente. Tradeoff: requiere provisioning por equipo.
- **B) Firmado server-side solo online + fallback offline:** una edge function firma cuando hay conexión; sin conexión se usa el diálogo de confianza local. Tradeoff: fricción offline (diálogo), impresión no se bloquea.
- **C) No cambiar (statu quo):** aceptar la clave en el bundle como tradeoff conocido (solo autoriza imprimir en el QZ local, no accede a datos). Tradeoff: la clave sigue expuesta.

El diseño **recomienda A** por preservar el offline y sacar la clave del bundle, pero marca la decisión final para el usuario porque cada opción tiene un tradeoff operativo.

**Impacto en funcionalidad y cómo se preserva:**
- Toca: escaneo de facturas (Gemini), lookup EAN (Go-UPC), búsqueda CSE, analítica `ai-chat`, impresión térmica QZ.
- No se rompe (Gemini/GoUPC/CSE) porque son features **online** por naturaleza; el proxy reenvía la misma llamada con la clave en el servidor y valida sesión. Para QZ, la opción elegida preservará explícitamente la impresión offline.
- Prueba de no-regresión: escanear factura, buscar por EAN, búsqueda CSE y analítica siguen funcionando vía proxy; la impresión térmica (según opción elegida) sigue funcionando, incluida la offline.

---

### Área 10 — Autorización reforzada en el servidor (Req 10, Medio)

**Componentes:** políticas RLS por rol, `hooks/usePermissions.ts`.

**Diseño:**
- Aplicar RLS por rol que autorice cada operación sensible en el servidor, con independencia de la UI (complementa Áreas 4 y 5).
- `usePermissions` queda como **presentación**: mostrar/ocultar UI. La autorización efectiva la imponen RLS y las validaciones internas de las RPC.
- Eliminar el fallback permisivo donde `isSuperAdmin = profile?.role === 'Administrador'` (leído del `profile` cacheado) concede todos los permisos: ese privilegio no debe originarse en datos editables del cliente. El rol/permisos efectivos se derivan del `profile` verificado por el servidor (RLS sobre `profiles`), y el servidor deniga aunque la UI hubiera permitido.

**Impacto en funcionalidad y cómo se preserva:**
- Toca: gating de UI por permisos y autorización de operaciones sensibles.
- No se rompe porque el servidor ya conoce el rol real (columna `profiles.role`, protegida por RLS) y autoriza a los admins legítimos. Quitar el fallback basado en caché no reduce las capacidades de un admin real; solo evita que alguien editando `localStorage` se auto-conceda permisos en la UI (y el servidor ya lo denegaría).
- Se conservan las policies de super-admin/dev hardcodeadas a UUID (no se tocan).
- Prueba de no-regresión: un admin real ve y ejecuta lo que siempre pudo; un `localStorage` manipulado no habilita operaciones en el servidor.

---

### Área 11 — Autorización independiente de la caché y sync offline validada (Req 11, Medio)

**Componentes:** `context/AuthContext.tsx` (caché de perfil/suscripción), `lib/offlineQueue.ts`, `hooks/useOfflineSync.ts`.

**Diseño:**
- La caché (`bistro_cached_profile`, `bistro_cached_subscription`) se mantiene **solo como presentación offline**. Al reconectar, revalidar rol, permisos y suscripción contra el servidor y reconciliar discrepancias.
- Al sincronizar la `Cola_Offline`, la identidad efectiva la impone el servidor: cada operación se reproduce bajo la sesión autenticada y pasa por RLS y `auth.uid()`. Si una operación declara `businessId`/`userId` que no coinciden con la identidad autenticada, el servidor la rechaza (RLS + validación interna de las RPC, Área 5).
- No se agrega firma a la cola; la seguridad se apoya en que el servidor ignora los identificadores declarados y usa la identidad real de la sesión.

**Impacto en funcionalidad y cómo se preserva:**
- Toca: modo offline (ventas, apertura/cierre de caja, abonos, compras, mermas) y su sincronización.
- No se rompe porque el usuario legítimo sigue operando offline con su caché y, al reconectar, sus operaciones **sí** corresponden a su identidad/negocio, así que pasan RLS sin problema. Solo se rechazan operaciones cuya identidad declarada no coincide con la sesión (ataque), que nunca ocurre en uso legítimo.
- Prueba de no-regresión: vender, abrir/cerrar caja, abonar, comprar y registrar mermas offline y luego sincronizar deja los datos correctos; una operación con `businessId` ajeno inyectado es rechazada al sincronizar.

---

### Área 12 — Eliminación de código dinámico y endurecimiento de BD (Req 12, Medio)

**Componentes:** `components/expense/InvoiceReviewPanel.tsx` (`evaluateCostFormula`), extensión `pg_net`, funciones SECURITY DEFINER con `search_path` mutable.

**Diseño:**
- `evaluateCostFormula`: el código local **ya** usa un intérprete recursivo seguro (`ADD/SUB/MULT/DIV`) en vez de `new Function()`. El trabajo restante es: (a) confirmar que no queda ningún `new Function`/`eval` en el bundle, (b) endurecer el rechazo explícito de tokens no permitidos (identificadores, llamadas a función, acceso a propiedades) reportando error en vez del fallback silencioso actual (12.3), y (c) agregar pruebas.
- `pg_net`: crear esquema `extensions`, mover `pg_net` allí (`ALTER EXTENSION pg_net SET SCHEMA extensions`), y actualizar las referencias/`search_path` de las funciones que la usan (verificar cuáles con MCP antes).
- Fijar `search_path` explícito e inmutable (`SET search_path = public, extensions` en la definición) en las funciones SECURITY DEFINER que hoy lo tienen mutable (misma migración que Área 5).

**Impacto en funcionalidad y cómo se preserva:**
- Toca: evaluación de fórmulas de costo en revisión de facturas, funciones de BD que usan `pg_net`, funciones SECURITY DEFINER.
- No se rompe porque el evaluador seguro produce los mismos resultados numéricos que hoy para fórmulas válidas; el endurecimiento solo cambia el manejo de fórmulas inválidas (error explícito en vez de fallback silencioso). Mover `pg_net` y fijar `search_path` se hace actualizando las referencias en la misma migración, verificando dependencias con MCP para no dejar funciones apuntando al esquema viejo.
- Prueba de no-regresión: una fórmula de costo válida da el mismo total; una fórmula inválida se rechaza con error; las funciones que usan `pg_net` siguen operando tras el cambio de esquema.

## Data Models

Esta sección describe los cambios de forma de datos e interfaces. Ningún cambio elimina columnas ni datos existentes.

### `business_subscriptions` — autoridad de escritura (Req 4)

- **RLS SELECT:** sin cambios (`business_id = get_user_business_id()`), la UI sigue leyendo.
- **RLS INSERT/UPDATE:** las columnas sensibles `status`, `current_period_end`, `next_billing_date` (y creación de filas activas/trial) solo pueden ser escritas por `service_role`.
- **Mecanismo (least disruptive):** trigger `BEFORE INSERT OR UPDATE` `enforce_subscription_write_authority()` que, si `auth.role() IS DISTINCT FROM 'service_role'` y cambian las columnas protegidas, hace `RAISE EXCEPTION`. Complementado con `WITH CHECK` en la policy de `authenticated` como defensa en profundidad. Se elige el trigger por columnas (no quitar la policy entera) para no romper otras escrituras legítimas del cliente sobre columnas no sensibles.

### `subscription_invoices` — solo el servidor registra pagos (Req 4)

- **RLS SELECT:** el negocio dueño puede leer sus facturas (sin cambios funcionales).
- **RLS INSERT:** restringido a `service_role` (el webhook inserta). Se preserva el índice único parcial `subscription_invoices_unique_wompi_tx` para idempotencia.

### Formato de referencia de pago canónico (Req 4, Paso A.1)

Para que el webhook resuelva negocio + plan + periodo sin ambigüedad:

```
Formato nuevo:  bsub_<businessId>_<planId>_<timestamp>
Formato viejo:  custom-<businessId8>-<timestamp>   (aceptado durante transición)
```

La firma HMAC de integridad (`generate-payment-signature`) sigue calculándose sobre `reference + amount + currency`, sin cambios de contrato.

### Nueva edge function `start-trial-subscription` (Req 4, Paso A.2)

```
Request:  { businessId, planId }  + Authorization: Bearer <jwt>
Efecto:   valida admin del negocio + trial no usado → escribe status='trial'
          con duración del plan (service_role).
Response: { success: boolean, subscription?: {...}, error?: string }
```

### Tabla `pin_login_attempts` (Req 6)

```
pin_login_attempts(
  id            uuid pk,
  identifier    text,        -- usuario o IP normalizado
  attempted_at  timestamptz,
  success       boolean
)
```
Consultada por el flujo de acceso para contar fallos en la ventana (5/10 min → bloqueo 15 min). Índice por `(identifier, attempted_at)`.

### ACL de funciones (Req 3, 5)

Estado objetivo por función (verificar previo con MCP `pg_proc.proacl`):

```
close_cash_shift, deduct_stock_for_order, increment_stock,
delete_order_and_restore_stock, void_order_and_restore_stock,
cancel_order_and_restore_stock, process_sale_refund
   → EXECUTE: authenticated, service_role   (revocado PUBLIC, anon)

update_client_debt, execute_readonly_query
   → EXECUTE: service_role                  (revocado PUBLIC, anon, authenticated)
```

### Storage (Req 8)

```
debt-evidence   : public=false ; acceso por createSignedUrl(expiración) ;
                  RW restringido al negocio dueño.
avatars,
business-logos,
product-images  : lectura por URL directa (sin cambios para <img>) ;
                  listado público deshabilitado ; escritura restringida
                  a usuarios autenticados del negocio.
```

### `Evaluador_Formulas` (Req 12)

```
Tipo de valor:  { value: number; isPct: boolean }
Operadores permitidos: ADD, SUB, MULT, DIV y literales numéricos.
Tokens no permitidos (identificadores, llamadas, acceso a propiedades)
   → error explícito (no fallback silencioso).
```

### Secrets de Gemini por feature (Req 9.3, 9.6, 9.7)

```
GEMINI_API_FOTOLISTA            → ocr-scan
GEMINI_API_COMPRA_INVENTARIO    → scan-invoice, scan-invoice-unified
GEMINI_API_GASTO                → scan-expense
GEMINI_API_ASISTENTE            → rag-chat, rag-index
GEMINI_API_COLORES_PROVEEDORES  → get-brand-colors
GEMINI_API_KEY                  → ai-chat  (sin fallback; sin pantalla aún)

Sin fallback embebido en el código (se lee solo del entorno).
invoice-scan + hook useInvoiceScan → eliminados (código muerto).
VITE_GEMINI_API_KEY → eliminada del .env (variable muerta).
```

### Extensiones y search_path (Req 12)

```
pg_net → movida al esquema `extensions`.
Funciones SECURITY DEFINER → SET search_path = public, extensions  (inmutable).
```

## Correctness Properties

*Una propiedad es una característica o comportamiento que debe cumplirse en todas las ejecuciones válidas del sistema; esencialmente, una afirmación formal sobre lo que el sistema debe hacer. Las propiedades son el puente entre la especificación legible por humanos y las garantías de correctitud verificables por máquina.*

Estas propiedades cubren la **lógica pura** de la remediación (verificación de token, cálculo/idempotencia del webhook, autorización de RPC y proxy, validación de identidad al sincronizar y evaluador de fórmulas). Los cambios puramente de configuración/infraestructura (grants, políticas RLS, config de buckets, rotación de secretos, `search_path`, `pg_net`) se validan con pruebas de integración/no-regresión, no con propiedades (ver Testing Strategy).

### Property 1: Solo tokens de Firebase auténticos, vigentes y con claims válidos producen sesión

*Para cualquier* token presentado a `firebase-phone-auth`, la función emite una sesión únicamente cuando la firma verifica contra el JWKS de Google, el claim `exp` no está vencido y `aud`, `iss` y `sub` son válidos; en cualquier otro caso rechaza sin emitir sesión.

**Validates: Requirements 1.1, 1.2, 1.4, 1.3**

### Property 2: El número de teléfono proviene solo del token verificado

*Para cualquier* solicitud aceptada, el `phone_number` usado para resolver o crear la cuenta es exactamente el del token ya verificado criptográficamente, sin depender de datos del cuerpo de la solicitud.

**Validates: Requirements 1.5**

### Property 3: La validación de consulta bloquea esquemas no públicos

*Para cualquier* consulta recibida por la función de solo-lectura endurecida, si referencia un esquema distinto de `public` (por ejemplo `auth`, `storage`, `vault`), la consulta es rechazada sin ejecutarse.

**Validates: Requirements 3.4**

### Property 4: El webhook calcula el periodo según la regla del plan

*Para cualquier* evento de pago aprobado y estado previo de la suscripción, el `current_period_end` resultante corresponde exactamente a la regla del plan (plan personalizado +1 mes; Mensual = `initial_period_months` en el primer pago y +1 mes en renovación; Trimestral +3 meses; Anual +12 meses), anclado a `MAX(now, current_period_end)`.

**Validates: Requirements 4.1**

### Property 5: El webhook ignora eventos con firma HMAC inválida

*Para cualquier* evento cuyo HMAC-SHA256 no coincide con `WOMPI_EVENTS_SECRET`, el webhook no modifica ninguna suscripción ni registra factura.

**Validates: Requirements 4.2, 4.3**

### Property 6: La aplicación del pago es idempotente

*Para cualquier* evento de pago aprobado, aplicarlo dos o más veces produce el mismo estado de suscripción y una sola factura que aplicarlo una vez (por el índice único sobre `wompi_transaction_id`).

**Validates: Requirements 4.7**

### Property 7: Las RPC mutantes rechazan a quien no pertenece al negocio objetivo

*Para cualquier* par (usuario autenticado, negocio objetivo) en el que el usuario no pertenece a ese negocio, la RPC mutante deniega la ejecución; cuando pertenece, procede.

**Validates: Requirements 5.2, 5.3**

### Property 8: La creación de empleados exige admin del negocio y coherencia de identificadores

*Para cualquier* solicitud a `create-employee`, la creación procede únicamente cuando el llamante tiene `admin_users` sobre el negocio objetivo y tanto el `business_id` como el `role_id` del cuerpo pertenecen a ese negocio; en cualquier otro caso se rechaza sin crear usuario.

**Validates: Requirements 7.2, 7.3, 7.4, 7.5**

### Property 9: El proxy de APIs externas solo reenvía solicitudes autenticadas del negocio

*Para cualquier* solicitud a un proxy (Gemini/Go-UPC/CSE), si no proviene de un usuario autenticado del negocio, el proxy la rechaza sin reenviar la llamada a la API externa.

**Validates: Requirements 9.5**

### Property 10: El servidor deniega operaciones sensibles sin permiso, independientemente de la UI

*Para cualquier* usuario sin el rol o permiso requerido, una operación sensible ejecutada directamente contra la base de datos es denegada, aunque la UI la hubiera permitido.

**Validates: Requirements 10.3**

### Property 11: Al sincronizar, la identidad efectiva es la del servidor

*Para cualquier* operación de la `Cola_Offline`, al sincronizar se aplica bajo la identidad autenticada (`auth.uid()`) y RLS; toda operación cuyo `businessId`/`userId` declarado no coincide con la identidad autenticada es rechazada.

**Validates: Requirements 11.2, 11.3**

### Property 12: El PIN exige longitud mínima al fijarlo

*Para cualquier* intento de crear o cambiar un PIN, el valor se acepta solo si tiene 6 o más dígitos; los de menor longitud se rechazan.

**Validates: Requirements 6.1**

### Property 13: El bloqueo por fuerza bruta responde a la ventana de intentos

*Para cualquier* secuencia de intentos de acceso de un mismo origen, si acumula 5 o más fallos dentro de una ventana de 10 minutos, los nuevos intentos quedan bloqueados durante al menos 15 minutos; con menos de 5 fallos no se bloquea.

**Validates: Requirements 6.2**

### Property 14: El evaluador de fórmulas solo computa aritmética de operadores permitidos

*Para cualquier* fórmula de entrada, el `Evaluador_Formulas` solo produce el resultado de operaciones `ADD/SUB/MULT/DIV` sobre operandos numéricos definidos, sin ejecutar código arbitrario.

**Validates: Requirements 12.1, 12.2**

### Property 15: El evaluador rechaza tokens no permitidos con error explícito

*Para cualquier* fórmula que contenga identificadores no definidos, llamadas a funciones o acceso a propiedades, el `Evaluador_Formulas` reporta un error sin evaluarla.

**Validates: Requirements 12.3**

## Error Handling

- **Autenticación (Req 1):** firma inválida, token expirado o claims inválidos → respuesta de error de autenticación (401/400) sin sesión ni magic link; mensajes genéricos hacia el cliente, detalle solo en logs del servidor.
- **Webhook de pagos (Req 4):** firma HMAC inválida → responder 4xx sin tocar datos; evento duplicado (23505 en `subscription_invoices`) → tratar como ya procesado y responder 200 (idempotencia); referencia no reconocida → registrar y responder sin modificar suscripción; error transitorio de BD → responder 5xx para que Wompi reintente.
- **Trials (Req 4.A.2):** llamante no admin o trial ya usado → 403/409 sin escribir; el cliente muestra mensaje claro sin exponer detalles internos.
- **RPC mutantes (Req 5):** usuario no autenticado o no perteneciente al negocio → `RAISE EXCEPTION` con mensaje genérico; el cliente traduce a un toast comprensible sin filtrar el motivo interno.
- **Creación de empleados (Req 7):** falta/incorrecto `Authorization`, no-admin, o `business_id`/`role_id` incoherentes → 401/403 sin crear usuario.
- **Storage (Req 8):** acceso sin URL firmada válida o escritura sin pertenencia → denegado por la política; la UI regenera la URL firmada al expirar.
- **Rate limiting / bloqueo de PIN (Req 6):** al bloquear, mensaje genérico que no revela si el fallo es del teléfono o del PIN.
- **Proxies (Req 9):** solicitante no autenticado → 401 sin reenviar; error de la API externa → propagar un error controlado sin exponer la clave.
- **Sincronización offline (Req 11):** operación rechazada por identidad/RLS → marcarla como fallida en la cola, notificar y no reintentar en bucle; las operaciones válidas del mismo lote se aplican.
- **Evaluador de fórmulas (Req 12):** fórmula con tokens no permitidos → error explícito; la UI puede caer al total base (`quantity * unitCost`) mostrando aviso, sin ejecutar la fórmula inválida.

## Testing Strategy

### Enfoque dual

- **Pruebas unitarias / de ejemplo:** casos concretos, edge cases y errores (claims inválidos, mensajes genéricos, procedencia del `phone_number`, "no hay resultados", etc.).
- **Pruebas basadas en propiedades (PBT):** las 15 propiedades de la sección anterior, sobre la lógica pura. Se usará una librería estándar de PBT del lenguaje de implementación (por ejemplo `fast-check` para TS/JS o el equivalente en Deno); **no** se implementará PBT desde cero. Cada test de propiedad correrá mínimo **100 iteraciones** y llevará una etiqueta de trazabilidad con el formato **Feature: seguridad-remediacion, Property {número}: {texto}**. Cada propiedad se implementa con un único test de propiedad.

### Dónde NO se usa PBT (config/infraestructura)

Estos criterios se validan con **integración/no-regresión** o **smoke**, no con propiedades, porque son configuración declarativa cuyo comportamiento no varía con la entrada:
- Grants y ACL de funciones (Req 3.1–3.3, 5.1): consultar `pg_proc.proacl` vía MCP y probar invocación con anon/authenticated.
- RLS/trigger de `business_subscriptions` y `subscription_invoices` (Req 4.4, 4.5): intentos de escritura con authenticated → denegado; con service_role → permitido.
- Config de buckets y políticas de Storage (Req 8): privacidad, URL firmada, listado, escritura por pertenencia.
- Rotación y restricción de secretos (Req 2), ausencia de claves en el bundle (Req 9.2, 9.3), `Leaked_Password_Protection` (Req 6.3).
- `pg_net` en esquema `extensions` y `search_path` inmutable (Req 12.4, 12.5): verificar `proconfig` y que las funciones dependientes siguen operando.

### Pruebas de no-regresión obligatorias (restricción #1 del usuario)

Estas pruebas confirman que la seguridad NO rompió funcionalidad legítima. Son la evidencia central del pedido del usuario:

1. **Autenticación:** login/registro por teléfono (SMS OTP Firebase) y login con Google siguen emitiendo sesión.
2. **Ventas y caja offline:** registrar venta, abrir/cerrar caja, abonar a deuda, registrar compra y registrar merma sin conexión, y luego sincronizar, deja los datos correctos.
3. **Analítica conversacional:** una consulta vía `ai-chat` sigue devolviendo resultados (usa `service_role`, no afectada por los revokes).
4. **Suscripción tras pago real:** pagos de plan Mensual (primer pago con bonus y renovación), Trimestral, Anual y plan personalizado activan/extienden con el periodo correcto vía webhook; el inicio de trial funciona vía `start-trial-subscription`.
5. **Empleados:** un admin del negocio crea/edita/borra empleados; un no-admin o un `business_id` ajeno es rechazado.
6. **Storage:** evidencias de deuda visibles por URL firmada; avatares/logos/fotos de producto siguen mostrándose; subir imagen desde el negocio dueño funciona.
7. **Impresión térmica QZ:** según la opción elegida en Área 9, la impresión (incluida la offline) sigue funcionando.
8. **Fórmulas de costo:** una fórmula válida produce el mismo total que antes; una inválida se rechaza con error.
9. **Permisos/roles:** un admin real conserva sus capacidades; manipular el `profile` cacheado en `localStorage` no habilita operaciones en el servidor.

### Verificación de base de datos

Todos los cambios de BD (revokes, RLS, trigger, `search_path`, `pg_net`, funciones) se aplican vía migraciones y se verifican con MCP (`list_migrations`, `execute_sql`, `list_edge_functions`) antes y después, nunca asumiendo el estado desde archivos locales.
