# Implementation Plan: Remediación de Seguridad de Bistro POS

## Overview

Este plan convierte el diseño aprobado en tareas de implementación incrementales para un agente de codificación. El orden respeta dos ejes:

1. **Prioridad de explotabilidad:** primero los hallazgos críticos (Req 1-5), luego los altos (Req 6-8) y por último los medios (Req 9-12).
2. **Aditivo antes que restrictivo (restricción rectora del usuario):** para cada cambio con riesgo de regresión (sobre todo Req 4) se agrega primero el camino server-side nuevo, se verifica en vivo con MCP, y SOLO DESPUÉS se cierra el camino inseguro viejo. Cada bloque termina con una verificación de no-regresión.

Todos los cambios de base de datos se aplican mediante migraciones verificadas con MCP (`list_migrations`, `list_edge_functions`, `execute_sql`, `pg_proc.proacl`) antes y después de cada cambio; nunca se asume el estado desde los archivos locales de `supabase/`. Las pruebas de propiedad usan `fast-check` y corren mínimo 100 iteraciones.

## Task Dependency Graph

```
CRÍTICOS (van primero)
                    IMPLEMENTACIÓN ADITIVA (Wave 1)
   1.1 JWT   2.1 .env   3.1 exec_query   4.1 webhook  4.2 trial  4.3 ref   5.1 chequeo RPC
     │          │            │              │  │  │                          │
     ▼          ▼            ▼              ▼  ▼  ▼                          ▼
   TESTS + VERIFICACIÓN EN VIVO + REVOKES (Wave 2)
   1.2-1.4    2.2       3.2-3.3         4.4-4.6   4.7 (Paso B: verificación MCP)   5.2 REVOKE
                                            │                                        │
                                            ▼ (Paso C.1)                             ▼
   RESTRICTIVO Req4 + tests Req5 + INICIO ALTO (Wave 3)
   4.8 trigger/RLS      5.3  5.4      7.1 7.2 7.3   8.1 8.2   9.1 9.2
       │
       ▼ (Paso C.2)
   CIERRE CLIENTE Req4 + tests ALTO + INICIO MEDIO (Wave 4)
   4.9 cliente observa   7.4 7.5  8.3 8.4  9.3   11.1 11.3 11.4  12.1 12.2  13.1 13.2  14.1 14.2 14.3
       │
       ▼ (Paso D)
   NO-REGRESIÓN Req4 + tests MEDIO (Wave 5)
   4.10   11.2 11.5   12.3 12.4   13.3 13.4   14.4 14.5
                │
                ▼
   NO-REGRESIÓN FINAL (Wave 6)
   11.6 (proxys + impresión QZ offline)
```

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1.1", "2.1", "3.1", "4.1", "4.2", "4.3", "5.1"],
      "description": "Implementación aditiva de los críticos: verificación JWT, .gitignore, endurecer execute_readonly_query, extender webhook, crear start-trial, referencia canónica y chequeo interno de pertenencia en RPC. No cierra ningún camino todavía."
    },
    {
      "wave": 2,
      "tasks": ["1.2", "1.3", "1.4", "2.2", "3.2", "3.3", "4.4", "4.5", "4.6", "4.7", "5.2"],
      "description": "Pruebas de los críticos, revokes seguros (execute_readonly_query y RPC mutantes) y Paso B: verificación en vivo con MCP de la activación de suscripción antes de cerrar el cliente."
    },
    {
      "wave": 3,
      "tasks": ["4.8", "5.3", "5.4", "7.1", "7.2", "7.3", "8.1", "8.2", "9.1", "9.2"],
      "description": "Req 4 Paso C.1 (trigger + RLS de suscripción, depende de la verificación en vivo 4.7), pruebas de RPC mutantes e inicio del bloque alto (PIN, empleados, storage)."
    },
    {
      "wave": 4,
      "tasks": ["4.9", "7.4", "7.5", "8.3", "8.4", "9.3", "11.1", "11.3", "11.4", "12.1", "12.2", "13.1", "13.2", "14.1", "14.2", "14.3"],
      "description": "Req 4 Paso C.2 (cliente deja de escribir y observa), pruebas/no-regresión del bloque alto e inicio del bloque medio (proxys, RLS por rol, caché no autoritativa, evaluador de fórmulas y endurecimiento de BD)."
    },
    {
      "wave": 5,
      "tasks": ["4.10", "11.2", "11.5", "11.7", "11.8", "12.3", "12.4", "13.3", "13.4", "14.4", "14.5"],
      "description": "Req 4 Paso D (no-regresión de pagos/trial), migración del cliente a los proxys y quitar VITE_*, segmentación de claves Gemini por pantalla (11.7) y limpieza de código muerto de IA (11.8), y pruebas/no-regresión del bloque medio."
    },
    {
      "wave": 6,
      "tasks": ["11.6"],
      "description": "No-regresión final del bloque medio: proxys de APIs externas e impresión térmica QZ offline (opción A) funcionando de punta a punta."
    }
  ]
}
```

## Tasks

- [x] 1. Verificación de firma del JWT de Firebase (Req 1, Crítico)
  - [x] 1.1 Reemplazar el decodificado por verificación criptográfica con JWKS
    - En `supabase/functions/firebase-phone-auth/index.ts`, sustituir `decodeFirebasePayload` (solo `atob`) por verificación de firma con `jose` importado vía `esm.sh`
    - Verificar la firma contra el JWKS de Google (`securetoken@system.gserviceaccount.com`) y validar en un paso `exp` (no vencido), `aud === FIREBASE_PROJECT_ID`, `iss === https://securetoken.google.com/<projectId>` y `sub` presente
    - Cachear las llaves públicas respetando el `Cache-Control: max-age` de Google y refrescarlas al expirar
    - Obtener `phone_number` exclusivamente del token verificado; en firma inválida/expirada responder 401/400 sin emitir sesión ni magic link
    - Mantener idéntico el contrato de entrada/salida (`{ firebaseToken, mode, pin }` → `{ success, user_id, hashed_token, is_new_user }`)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [ ]* 1.2 Prueba de propiedad de aceptación de tokens
    - **Property 1: Solo tokens de Firebase auténticos, vigentes y con claims válidos producen sesión**
    - Generar con `fast-check` tokens válidos/forjados/expirados y con claims inválidos; verificar que solo los auténticos y vigentes emiten sesión
    - **Feature: seguridad-remediacion, Property 1**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**

  - [ ]* 1.3 Prueba de propiedad de procedencia del teléfono
    - **Property 2: El número de teléfono proviene solo del token verificado**
    - Inyectar `phone_number` distinto en el cuerpo y verificar que se ignora frente al claim verificado
    - **Feature: seguridad-remediacion, Property 2**
    - **Validates: Requirements 1.5**

  - [ ]* 1.4 Prueba de no-regresión de autenticación
    - Test de integración: un token legítimo de Firebase emite sesión; un token con firma alterada es rechazado
    - _Requirements: 1.1, 1.2_

- [x] 2. Gestión y rotación de secretos (Req 2, Crítico)
  - [x] 2.1 Sacar `.env` del control de versiones
    - Añadir `.env` a `.gitignore` si no está; ejecutar `git rm --cached .env` para dejar de trackearlo sin borrar el archivo local
    - _Requirements: 2.1, 2.2_

  - [x] 2.2 Documentar clasificación de claves y procedimiento operativo
    - Crear/actualizar documento en `docs/` que liste qué claves son públicas por diseño (`VITE_SUPABASE_ANON_KEY`) y cuáles deben salir del bundle (`VITE_GEMINI_API_KEY`, `VITE_GOUPC_API_KEY`, `VITE_GOOGLE_CSE_API_KEY`, ver Task 11)
    - Documentar la restricción por dominio/IP de las claves que permanecen en el bundle (Firebase, anon key) para los orígenes oficiales, y dejar registrados como pasos operativos manuales la purga de historial (`git filter-repo`/BFG) y la rotación en los proveedores
    - _Requirements: 2.3, 2.4, 2.5_

- [x] 3. Endurecer `execute_readonly_query` y revocar acceso público (Req 3, Crítico)
  - [x] 3.1 Migración: revocar EXECUTE y bloquear esquemas no públicos
    - Verificar con MCP (`list_edge_functions`, `execute_sql` sobre `pg_proc.proacl`) que el único consumidor es `ai-chat` invocando con `service_role`
    - `REVOKE EXECUTE ON FUNCTION execute_readonly_query(...) FROM PUBLIC, anon, authenticated;`
    - Endurecer la función para rechazar consultas que referencien esquemas distintos de `public` (`auth`, `storage`, `vault`, `pg_catalog`, `information_schema`) y permitir solo `SELECT`
    - Reverificar el ACL resultante con MCP tras aplicar la migración
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 3.2 Prueba de propiedad de bloqueo de esquemas
    - **Property 3: La validación de consulta bloquea esquemas no públicos**
    - Generar consultas que referencien esquemas no `public` y verificar que se rechazan sin ejecutarse
    - **Feature: seguridad-remediacion, Property 3**
    - **Validates: Requirements 3.4**

  - [ ]* 3.3 Prueba de no-regresión de analítica
    - Integración: una consulta vía `ai-chat` (service_role) sigue devolviendo resultados; una invocación directa con la anon key es denegada
    - _Requirements: 3.3_

- [ ] 4. Activación de suscripción server-side vía webhook (Req 4, Crítico)
  - [x] 4.1 Paso A.1 — Extender `wompi-webhook` con la lógica de periodos del catálogo
    - Verificar con MCP el estado desplegado del webhook antes de modificar
    - Portar a `applyApprovedPayment` la lógica de `handlePaymentApproved`: plan personalizado +1 mes; Mensual = `initial_period_months` en el primer pago y +1 mes en renovación; Trimestral +3; Anual +12; siempre anclado a `MAX(now, current_period_end)`
    - Aceptar el formato de referencia canónico nuevo `bsub_<businessId>_<planId>_<timestamp>` y el viejo `custom-<businessId8>-<timestamp>` durante la transición
    - Preservar la idempotencia existente (índice único `subscription_invoices_unique_wompi_tx`, error 23505 → ya procesado)
    - _Requirements: 4.1, 4.7_

  - [x] 4.2 Paso A.2 — Crear edge function `start-trial-subscription`
    - Nueva función (service_role) que valida `Authorization`/admin del negocio y que el negocio no haya usado trial, y escribe `status='trial'` con la duración del plan
    - Contrato: `{ businessId, planId }` + `Authorization: Bearer <jwt>` → `{ success, subscription?, error? }`
    - _Requirements: 4.1_

  - [x] 4.3 Paso A.1 — Emitir la referencia canónica en el checkout del cliente
    - En la generación de referencia (`lib/customPlanCheckout.ts` / checkout de `SubscriptionPlansScreen`) emitir `bsub_<businessId>_<planId>_<timestamp>`
    - Mantener sin cambios el cálculo de la firma HMAC de integridad (`generate-payment-signature` sobre `reference + amount + currency`)
    - _Requirements: 4.1_

  - [ ]* 4.4 Prueba de propiedad de cálculo de periodo
    - **Property 4: El webhook calcula el periodo según la regla del plan**
    - Generar eventos aprobados y estados previos variados; verificar el `current_period_end` resultante por regla de plan anclado a `MAX(now, current_period_end)`
    - **Feature: seguridad-remediacion, Property 4**
    - **Validates: Requirements 4.1**

  - [ ]* 4.5 Prueba de propiedad de firma HMAC inválida
    - **Property 5: El webhook ignora eventos con firma HMAC inválida**
    - Generar eventos con HMAC que no coincide con `WOMPI_EVENTS_SECRET` y verificar que no se modifica suscripción ni factura
    - **Feature: seguridad-remediacion, Property 5**
    - **Validates: Requirements 4.2, 4.3**

  - [ ]* 4.6 Prueba de propiedad de idempotencia
    - **Property 6: La aplicación del pago es idempotente**
    - Aplicar el mismo evento aprobado dos o más veces y verificar el mismo estado y una sola factura
    - **Feature: seguridad-remediacion, Property 6**
    - **Validates: Requirements 4.7**

  - [~] 4.7 Paso B — Verificar la activación en vivo con MCP (gate antes de cerrar el cliente)
    - Con MCP (`execute_sql` / invocación de edge function): confirmar que un pago de plan público activa con el periodo correcto, un pago de plan personalizado extiende +1 mes y el inicio de trial vía `start-trial-subscription` activa el trial
    - No avanzar al Paso C hasta que los tres flujos queden confirmados server-side
    - _Requirements: 4.1_

  - [~] 4.8 Paso C.1 — Migración: autoridad de escritura única del servidor
    - Crear trigger `enforce_subscription_write_authority()` `BEFORE INSERT OR UPDATE` en `business_subscriptions` que hace `RAISE EXCEPTION` si `auth.role() IS DISTINCT FROM 'service_role'` y cambian `status`/`current_period_end`/`next_billing_date`; complementar con `WITH CHECK` en la policy de `authenticated`
    - Restringir el `INSERT` de `subscription_invoices` a `service_role`; mantener el `SELECT` del negocio dueño y el índice único de idempotencia
    - Verificar RLS y trigger resultantes con MCP
    - _Requirements: 4.4, 4.5_

  - [~] 4.9 Paso C.2 — El cliente deja de escribir y pasa a observar
    - En `screens/SubscriptionPlansScreen.tsx`, `screens/SubscriptionManagementScreen.tsx` y `App.tsx`: `handlePaymentApproved` y `applyCustomPlanPayment` (`lib/customPlanCheckout.ts`) dejan de escribir en `business_subscriptions` y solo disparan el checkout, luego ESCUCHAN (realtime + `pollTransactionStatus` de solo lectura) hasta ver el estado activo; `handleStartTrial` llama a `start-trial-subscription`
    - _Requirements: 4.6_

  - [ ]* 4.10 Paso D — No-regresión de pagos y trial
    - Integración: pagos Mensual (primer pago con bonus y renovación), Trimestral, Anual y plan personalizado activan/extienden con el periodo correcto vía webhook; el trial se inicia vía `start-trial-subscription`; un `UPDATE status='active'` con anon/authenticated es denegado
    - _Requirements: 4.4, 4.5, 4.6_

- [x] 5. Restringir RPCs mutantes SECURITY DEFINER (Req 5, Crítico)
  - [x] 5.1 Agregar chequeo interno de pertenencia y fijar `search_path`
    - Verificar con MCP la definición actual de cada función antes de modificar
    - En `close_cash_shift`, `deduct_stock_for_order`, `increment_stock`, `delete_order_and_restore_stock`, `void_order_and_restore_stock`, `cancel_order_and_restore_stock`: validar `auth.uid()` autenticado y `business_id = get_user_business_id()`, con `RAISE EXCEPTION` si no coincide (`process_sale_refund` ya valida permiso/turno/cantidades)
    - Fijar `search_path` explícito e inmutable en la misma migración (une con Req 12.5)
    - _Requirements: 5.2, 5.3_

  - [x] 5.2 Migración: revocar EXECUTE al acceso público
    - `REVOKE EXECUTE` a `PUBLIC` y `anon` en las 7 RPC mutantes (mantener `authenticated`, `service_role`); en `update_client_debt` (trigger) revocar también a `authenticated` (mantener `service_role`)
    - Documentar el conjunto mínimo de funciones que `anon` sí necesita (autenticación pública) como públicas por diseño; verificar el ACL resultante con MCP
    - _Requirements: 5.1, 5.4_

  - [ ]* 5.3 Prueba de propiedad de pertenencia al negocio
    - **Property 7: Las RPC mutantes rechazan a quien no pertenece al negocio objetivo**
    - Generar pares (usuario, negocio) con y sin pertenencia; verificar denegación cuando no pertenece y ejecución cuando pertenece
    - **Feature: seguridad-remediacion, Property 7**
    - **Validates: Requirements 5.2, 5.3**

  - [ ]* 5.4 Prueba de no-regresión de operaciones mutantes
    - Integración: venta, cierre de caja, abono, anulación y devolución (online y sincronizadas desde offline) siguen funcionando con usuario autenticado; un intento con anon key es denegado
    - _Requirements: 5.1, 5.2_

- [~] 6. Checkpoint — Validar el bloque crítico (Req 1-5)
  - Asegurar que todas las pruebas pasan; preguntar al usuario si surgen dudas.

- [ ] 7. Protección del PIN contra fuerza bruta (Req 6, Alto)
  - [~] 7.1 Longitud mínima de 6 dígitos al crear/cambiar PIN
    - Aplicar el mínimo de 6 dígitos en el registro y en el cambio de PIN (`change-pin`), sin tocar el login de PIN existentes
    - _Requirements: 6.1_

  - [~] 7.2 Tabla `pin_login_attempts` y lógica de bloqueo
    - Migración: crear `pin_login_attempts(id uuid pk, identifier text, attempted_at timestamptz, success boolean)` con índice `(identifier, attempted_at)`; verificar creación con MCP
    - Lógica en el flujo de acceso: tras 5 fallos en 10 min bloquear al origen 15 min, con mensaje genérico que no revela si el error es de teléfono o PIN
    - _Requirements: 6.2, 6.5_

  - [~] 7.3 Rate limit de enumeración y protección de contraseñas filtradas
    - Limitar por IP la tasa de `login_email_for_phone` y `user_exists_by_phone`; habilitar `Leaked_Password_Protection` en Supabase Auth
    - _Requirements: 6.3, 6.4_

  - [ ]* 7.4 Prueba de propiedad de longitud mínima del PIN
    - **Property 12: El PIN exige longitud mínima al fijarlo**
    - Generar PIN de longitud variable y verificar aceptación solo con 6+ dígitos
    - **Feature: seguridad-remediacion, Property 12**
    - **Validates: Requirements 6.1**

  - [ ]* 7.5 Prueba de propiedad de bloqueo por ventana de intentos
    - **Property 13: El bloqueo por fuerza bruta responde a la ventana de intentos**
    - Generar secuencias de intentos y verificar bloqueo ≥15 min con 5+ fallos en 10 min y sin bloqueo con menos de 5
    - **Feature: seguridad-remediacion, Property 13**
    - **Validates: Requirements 6.2**

- [ ] 8. Autorización en la gestión de empleados (Req 7, Alto)
  - [~] 8.1 Validar admin y coherencia de identificadores en `create-employee`
    - Leer el `Authorization` header e identificar al llamante con `supabase.auth.getUser(jwt)`
    - Verificar que el llamante tiene `admin_users` sobre el `business_id` objetivo (consultando su perfil/rol en BD, no el cuerpo); rechazar `business_id` del cuerpo que no coincida y validar que el `role_id` pertenece a ese negocio
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [~] 8.2 Extender el endurecimiento a `update-employee` y `delete-employee`
    - Aplicar la misma validación de admin + pertenencia del negocio por coherencia (defensa en profundidad)
    - _Requirements: 7.2, 7.3, 7.4_

  - [ ]* 8.3 Prueba de propiedad de autorización de creación
    - **Property 8: La creación de empleados exige admin del negocio y coherencia de identificadores**
    - Generar solicitudes con distintas combinaciones de rol del llamante y `business_id`/`role_id`; verificar creación solo cuando es admin del negocio y los identificadores pertenecen a ese negocio
    - **Feature: seguridad-remediacion, Property 8**
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.5**

  - [ ]* 8.4 Prueba de no-regresión de empleados
    - Integración: un admin crea/edita/borra empleados de su negocio; un no-admin o un `business_id` ajeno es rechazado
    - _Requirements: 7.1_

- [ ] 9. Privacidad de los buckets de Storage (Req 8, Alto)
  - [~] 9.1 `debt-evidence` privado con URL firmada
    - Configurar el bucket `debt-evidence` como privado; sustituir `getPublicUrl` por `createSignedUrl` con expiración en la UI de deudas/evidencias; políticas de Storage que restringen lectura/escritura al negocio dueño
    - Verificar la configuración del bucket con MCP
    - _Requirements: 8.1, 8.2, 8.3, 8.5_

  - [~] 9.2 Deshabilitar listado y restringir escritura en buckets de imágenes
    - En `avatars`, `business-logos`, `product-images`: mantener la lectura por URL directa (los `<img>` no cambian), deshabilitar el listado público de objetos y restringir la escritura a usuarios autenticados con pertenencia al negocio
    - _Requirements: 8.4, 8.5_

  - [ ]* 9.3 Prueba de no-regresión de Storage
    - Integración: las evidencias de deuda se ven por URL firmada; avatares/logos/fotos de producto siguen mostrándose; subir una imagen desde el negocio dueño funciona; enumerar objetos del bucket es denegado
    - _Requirements: 8.1, 8.4_

- [~] 10. Checkpoint — Validar el bloque alto (Req 6-8)
  - Asegurar que todas las pruebas pasan; preguntar al usuario si surgen dudas.

- [ ] 11. Proxys server-side para APIs y eliminación de claves embebidas (Req 9, Medio)
  - [~] 11.1 Crear edge functions proxy para Gemini, Go-UPC y Google CSE
    - Cada proxy guarda su clave en secrets del servidor y valida que el solicitante es un usuario autenticado del negocio antes de reenviar la llamada a la API externa
    - _Requirements: 9.1, 9.5_

  - [x] 11.3 Eliminar el fallback Gemini hardcodeado en las edge functions
    - Obtener la clave Gemini exclusivamente de los secrets del servidor, sin fallback embebido, en `ai-chat`, `ocr-scan`, `scan-invoice` e `invoice-scan` (las cuatro tenían `|| "AIza…"`); redesplegadas y verificadas con MCP
    - _Requirements: 9.3_

  - [~] 11.4 QZ opción A — provisioning por equipo (preservar impresión offline)
    - Retirar la clave privada RSA de firmado de `lib/qzSigning.ts` y del bundle
    - Confiar el certificado una sola vez por dispositivo (instalador QZ / "Allow + Remember"), de modo que la impresión ESC/POS siga funcionando offline sin clave privada en el cliente
    - _Requirements: 9.4_

  - [~] 11.2 Migrar el cliente a los proxys y quitar `VITE_*` del bundle
    - Cambiar las llamadas del cliente a Gemini/Go-UPC/Google CSE para que pasen por los proxys de 11.1; retirar `VITE_GEMINI_API_KEY`, `VITE_GOUPC_API_KEY` y `VITE_GOOGLE_CSE_API_KEY` del bundle
    - _Requirements: 9.2_

  - [x] 11.7 Segmentar la clave Gemini en un secret por pantalla
    - Crear un secret por feature (`GEMINI_API_FOTOLISTA`, `GEMINI_API_COMPRA_INVENTARIO`, `GEMINI_API_GASTO`, `GEMINI_API_ASISTENTE`, `GEMINI_API_COLORES_PROVEEDORES`) y hacer que cada edge function lea el suyo; redesplegar y verificar en vivo con MCP (ocr-scan v32, scan-invoice v33, scan-invoice-unified v4, scan-expense v8, rag-chat v45, rag-index v24, get-brand-colors v22)
    - `ai-chat` queda en `GEMINI_API_KEY` hasta que se le conecte una pantalla; el usuario rota/revoca las claves viejas en Google
    - _Requirements: 9.3, 9.6_

  - [x] 11.8 Eliminar código muerto de IA y la variable VITE muerta
    - Borrar la edge function `invoice-scan` y el hook huérfano `useInvoiceScan`; retirar `VITE_GEMINI_API_KEY` del `.env`
    - _Requirements: 9.7_

  - [ ]* 11.5 Prueba de propiedad de autorización del proxy
    - **Property 9: El proxy de APIs externas solo reenvía solicitudes autenticadas del negocio**
    - Generar solicitudes autenticadas y no autenticadas; verificar que solo las autenticadas del negocio se reenvían a la API externa
    - **Feature: seguridad-remediacion, Property 9**
    - **Validates: Requirements 9.5**

  - [ ]* 11.6 Prueba de no-regresión de proxys e impresión QZ
    - Integración: escaneo de factura (Gemini), lookup EAN (Go-UPC), búsqueda CSE y analítica siguen funcionando vía proxy; la impresión térmica QZ sigue funcionando, incluida la offline (opción A)
    - _Requirements: 9.1, 9.4_

- [ ] 12. Autorización reforzada en el servidor (Req 10, Medio)
  - [~] 12.1 Aplicar RLS por rol para operaciones sensibles
    - Migración: políticas RLS por rol que autorizan cada operación sensible en el servidor con independencia de la UI (complementa Task 4 y Task 5); verificar con MCP
    - _Requirements: 10.1, 10.3_

  - [~] 12.2 Quitar el fallback permisivo de `isSuperAdmin`
    - Eliminar `isSuperAdmin = profile?.role === 'Administrador'` derivado del `profile` cacheado en `localStorage`; dejar `hooks/usePermissions.ts` como presentación y derivar rol/permisos efectivos del `profile` verificado por el servidor
    - _Requirements: 10.2, 10.4_

  - [ ]* 12.3 Prueba de propiedad de denegación en el servidor
    - **Property 10: El servidor deniega operaciones sensibles sin permiso, independientemente de la UI**
    - Generar usuarios sin el rol/permiso requerido y verificar que la operación directa contra la BD es denegada aunque la UI la hubiera permitido
    - **Feature: seguridad-remediacion, Property 10**
    - **Validates: Requirements 10.3**

  - [ ]* 12.4 Prueba de no-regresión de permisos
    - Integración: un admin real conserva sus capacidades; manipular el `profile` cacheado en `localStorage` no habilita operaciones en el servidor
    - _Requirements: 10.3, 10.4_

- [ ] 13. Caché no autoritativa y sincronización offline validada (Req 11, Medio)
  - [~] 13.1 Tratar la caché como presentación y revalidar al reconectar
    - En `context/AuthContext.tsx`: usar `bistro_cached_profile`/`bistro_cached_subscription` solo como presentación offline; al reconectar, revalidar rol, permisos y suscripción contra el servidor y reconciliar discrepancias
    - _Requirements: 11.1, 11.4, 11.5, 11.6_

  - [~] 13.2 Validar la identidad del servidor al sincronizar la cola
    - En `hooks/useOfflineSync.ts` / `lib/offlineQueue.ts`: reproducir cada operación bajo la sesión autenticada, apoyándose en RLS y `auth.uid()` (Task 5) para que el servidor ignore los `businessId`/`userId` declarados y rechace los que no coinciden
    - _Requirements: 11.2, 11.3_

  - [ ]* 13.3 Prueba de propiedad de identidad al sincronizar
    - **Property 11: Al sincronizar, la identidad efectiva es la del servidor**
    - Generar operaciones de cola con `businessId`/`userId` coincidentes y ajenos; verificar aplicación solo bajo la identidad autenticada y rechazo de las ajenas
    - **Feature: seguridad-remediacion, Property 11**
    - **Validates: Requirements 11.2, 11.3**

  - [ ]* 13.4 Prueba de no-regresión offline
    - Integración: operar offline (ventas, apertura/cierre de caja, abonos, compras y mermas) y luego sincronizar deja los datos correctos; una operación con `businessId` ajeno inyectado es rechazada al sincronizar
    - _Requirements: 11.1, 11.6_

- [ ] 14. Eliminación de código dinámico y endurecimiento de la BD (Req 12, Medio)
  - [~] 14.1 Endurecer `evaluateCostFormula`
    - Confirmar que no queda ningún `new Function`/`eval` en el bundle; en `components/expense/InvoiceReviewPanel.tsx` reforzar el rechazo explícito de tokens no permitidos (identificadores, llamadas a función, acceso a propiedades) reportando error en vez del fallback silencioso
    - _Requirements: 12.1, 12.2, 12.3_

  - [~] 14.2 Mover la extensión `pg_net` fuera de `public`
    - Verificar con MCP qué funciones dependen de `pg_net` antes de cambiar; crear esquema `extensions`, `ALTER EXTENSION pg_net SET SCHEMA extensions` y actualizar las referencias/`search_path` de las funciones dependientes
    - _Requirements: 12.4_

  - [~] 14.3 Fijar `search_path` inmutable en las funciones SECURITY DEFINER restantes
    - `SET search_path = public, extensions` (inmutable) en las funciones SECURITY DEFINER que aún lo tienen mutable y no se cubrieron en Task 5; verificar `proconfig` con MCP
    - _Requirements: 12.5_

  - [ ]* 14.4 Prueba de propiedad del evaluador aritmético
    - **Property 14: El evaluador de fórmulas solo computa aritmética de operadores permitidos**
    - Generar fórmulas válidas (`ADD/SUB/MULT/DIV` sobre numéricos) y verificar que el resultado es solo el de esas operaciones, sin ejecutar código arbitrario
    - **Feature: seguridad-remediacion, Property 14**
    - **Validates: Requirements 12.1, 12.2**

  - [ ]* 14.5 Prueba de propiedad de rechazo de tokens
    - **Property 15: El evaluador rechaza tokens no permitidos con error explícito**
    - Generar fórmulas con identificadores/llamadas/acceso a propiedades y verificar que se reportan como error sin evaluarse
    - **Feature: seguridad-remediacion, Property 15**
    - **Validates: Requirements 12.3**

- [~] 15. Checkpoint final — No-regresión integral
  - Asegurar que todas las pruebas y las verificaciones de no-regresión (autenticación, ventas/caja offline, analítica, suscripción/trial, empleados, storage, impresión QZ offline, fórmulas y permisos) pasan; preguntar al usuario si surgen dudas.

## Notes

- **Restricción rectora (no-regresión):** ningún cambio debe romper funcionalidad existente; solo mejorar seguridad. Aunque las tareas de prueba y de no-regresión están marcadas como opcionales con `*` por convención del formato, para este spec las verificaciones de no-regresión son obligatorias y no deben omitirse.
- **Orden aditivo antes que restrictivo:** las tareas siguen el orden agregar camino nuevo → verificar en vivo → cerrar el camino viejo → probar no-regresión. En Req 4 esto es estricto: el Paso C (4.8, 4.9) solo se ejecuta después de confirmar el Paso B (4.7).
- **Cambios de BD vía MCP:** todas las migraciones (revokes, RLS, trigger, `search_path`, `pg_net`, tablas y funciones) se aplican y se verifican con MCP (`list_migrations`, `execute_sql`, `list_edge_functions`, `pg_proc.proacl`), nunca asumiendo el estado desde los archivos locales de `supabase/`.
- **Pasos operativos manuales del usuario (no de código):** la purga del `.env` del historial de git (`git filter-repo`/BFG) y la rotación de las claves en los proveedores (Supabase, Firebase, Gemini, Go-UPC, Google CSE) son acciones operativas que realiza el usuario; el código solo deja de versionar el `.env`, documenta la clasificación de claves y migra las claves fuera del bundle.
- **Decisión QZ = opción A:** se retira la clave privada del bundle y se confía el certificado una vez por dispositivo (provisioning por equipo), preservando la impresión offline. No se implementan las opciones B ni C.
- Las tareas marcadas con `*` son sub-tareas de prueba; los checkpoints (Tasks 6, 10, 15) validan cada bloque de forma incremental.
- Las pruebas de propiedad usan `fast-check`, corren mínimo 100 iteraciones y llevan la etiqueta `Feature: seguridad-remediacion, Property {número}`.
