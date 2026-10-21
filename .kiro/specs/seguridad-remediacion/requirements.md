# Requirements Document

## Introduction

Esta funcionalidad, **Remediación de Seguridad de Bistro POS**, agrupa el conjunto de correcciones de seguridad derivadas de una auditoría del proyecto real (verificada contra el código fuente y contra el estado en vivo de Supabase). El objetivo es cerrar 12 hallazgos que hoy permiten suplantación de cuentas, lectura de datos sensibles con la clave pública, activación de suscripciones sin pago, escalado de privilegios y fuga de secretos.

Bistro POS es un punto de venta para negocios minoristas en Colombia, distribuido como PWA + aplicación híbrida Android (Capacitor), con soporte offline obligatorio en flujos de ventas, apertura/cierre de caja, abonos a deudas, compras y mermas. Por lo tanto, ninguna medida de seguridad de este documento debe romper el modo offline legítimo de un usuario válido: la validación fuerte se ejecuta en el servidor al sincronizar, no bloqueando la operación local.

Los requisitos están priorizados en tres niveles según su explotabilidad actual:

- **Crítico** (explotable ya, sin condiciones especiales): Requisitos 1 a 5.
- **Alto** (remediar en el corto plazo): Requisitos 6 a 8.
- **Medio** (endurecimiento y reducción de superficie de ataque): Requisitos 9 a 12.

Este documento cubre únicamente la fase de requisitos. No introduce cambios de código.

## Glossary

- **Sistema**: Backend de Bistro POS considerado como una unidad (base de datos PostgreSQL de Supabase, edge functions Deno y cliente React/PWA).
- **Base_de_Datos**: Instancia PostgreSQL gestionada por Supabase, con políticas de seguridad a nivel de fila (RLS) y funciones almacenadas.
- **Cliente**: Aplicación React que se entrega como bundle al navegador o al contenedor Capacitor Android. Todo lo que llega al bundle es inspeccionable por el usuario final.
- **Edge_Function_Auth**: Edge function `supabase/functions/firebase-phone-auth`, encargada de recibir un token de Firebase y emitir una sesión de Supabase.
- **Edge_Function_CreateEmployee**: Edge function `supabase/functions/create-employee`, que crea usuarios empleados usando el rol `service_role`.
- **Webhook_Pagos**: Componente server-side (edge function) que recibe y valida los eventos de pago del proveedor Wompi y actualiza las suscripciones.
- **Evaluador_Formulas**: Componente que evalúa las fórmulas de costo de facturas en `components/expense/InvoiceReviewPanel.tsx`.
- **RLS** (Row Level Security): Mecanismo de PostgreSQL que restringe qué filas puede leer o escribir cada rol según políticas declarativas. Es la barrera de autorización real del servidor.
- **SECURITY DEFINER**: Atributo de una función SQL que la hace ejecutar con los privilegios de su dueño (normalmente elevado) en lugar de los del llamante. Requiere validar internamente la identidad y pertenencia del llamante.
- **service_role**: Rol de Supabase con privilegios administrativos que ignora RLS. Solo debe usarse en componentes server-side de confianza, nunca desde el cliente.
- **anon key** (clave anónima): Clave pública que identifica al rol `anon`. Es pública por diseño; la protección real de los datos depende de RLS y de restringir qué funciones puede ejecutar `anon`.
- **JWT / firma**: Un JSON Web Token está compuesto por encabezado, claims y una firma criptográfica. Validar los claims sin verificar la firma no autentica al emisor: un token puede forjarse.
- **JWKS** (JSON Web Key Set): Conjunto de llaves públicas publicado por el emisor (Google, para Firebase) contra el cual se verifica la firma de un JWT.
- **webhook**: Notificación HTTP server-to-server que un proveedor externo (Wompi) envía para informar el resultado de un evento (por ejemplo, un pago). Debe verificarse su firma para confiar en el contenido.
- **magic link**: Mecanismo de Supabase Auth para generar una sesión/enlace de acceso desde el servidor (vía admin). La `Edge_Function_Auth` lo usa para emitir la sesión tras validar el token de Firebase.
- **Leaked_Password_Protection**: Opción de Supabase Auth que rechaza contraseñas/PIN conocidos por estar filtrados en brechas públicas.
- **URL_Firmada**: Enlace temporal con expiración que autoriza el acceso a un objeto de un bucket privado de Storage sin exponerlo públicamente.
- **Cola_Offline**: Cola de eventos local (`lib/offlineQueue.ts`) que almacena operaciones realizadas sin conexión para sincronizarlas después.

## Requirements

### Requisito 1: Verificación de firma del JWT de Firebase (Crítico)

**Historia de Usuario:** Como responsable de seguridad, quiero que la `Edge_Function_Auth` verifique criptográficamente la firma del token de Firebase antes de emitir una sesión, para impedir que un atacante forje un token con cualquier `phone_number` y suplante cualquier cuenta.

#### Criterios de Aceptación

1.1. WHEN la `Edge_Function_Auth` recibe un token de Firebase, THE `Edge_Function_Auth` SHALL verificar la firma criptográfica del token contra el JWKS vigente de Google antes de emitir cualquier sesión.
1.2. IF la firma del token no es válida o no puede verificarse contra el JWKS de Google, THEN THE `Edge_Function_Auth` SHALL rechazar la solicitud con un error de autenticación y sin emitir sesión.
1.3. WHEN la `Edge_Function_Auth` verifica un token, THE `Edge_Function_Auth` SHALL validar los claims `exp`, `aud`, `iss` y `sub` además de la firma.
1.4. IF el claim `exp` indica que el token está expirado, THEN THE `Edge_Function_Auth` SHALL rechazar la solicitud sin emitir sesión.
1.5. THE `Edge_Function_Auth` SHALL obtener el `phone_number` exclusivamente de los claims del token ya verificado criptográficamente.
1.6. THE `Edge_Function_Auth` SHALL refrescar las llaves públicas de Google respetando su expiración, de modo que la verificación use llaves vigentes.

### Requisito 2: Gestión y rotación de secretos (Crítico)

**Historia de Usuario:** Como responsable de seguridad, quiero que los secretos de producción dejen de estar versionados en el repositorio y sean rotados y restringidos, para impedir que las claves ya filtradas en el historial de git sean usadas por terceros.

#### Criterios de Aceptación

2.1. THE `Sistema` SHALL excluir el archivo `.env` del control de versiones mediante `.gitignore`.
2.2. THE `Sistema` SHALL eliminar el archivo `.env` y sus secretos del historial de git del repositorio.
2.3. THE `Sistema` SHALL reemplazar por claves nuevas todas las claves expuestas en el historial, incluyendo como mínimo `VITE_SUPABASE_ANON_KEY`, `VITE_GEMINI_API_KEY`, `VITE_GOUPC_API_KEY`, `VITE_GOOGLE_CSE_API_KEY` y las claves de Firebase.
2.4. WHERE una clave permanece necesariamente en el bundle `Cliente` (por ejemplo, claves de Firebase o la `anon key`), THE `Sistema` SHALL restringir su uso por dominio autorizado y/o IP, de modo que solo funcione desde los orígenes oficiales de la aplicación.
2.5. THE `Sistema` SHALL documentar de forma explícita qué claves son públicas por diseño (como `VITE_SUPABASE_ANON_KEY`) y cuáles deben dejar de exponerse en el `Cliente`.

### Requisito 3: Eliminación de ejecución de SQL arbitrario (Crítico)

**Historia de Usuario:** Como responsable de seguridad, quiero eliminar la capacidad de ejecutar SQL arbitrario a través de la función `execute_readonly_query`, para impedir que la `anon key` pública lea tablas sensibles (incluida `auth.users`) saltándose RLS.

#### Criterios de Aceptación

3.1. THE `Base_de_Datos` SHALL revocar el permiso `EXECUTE` sobre la función `execute_readonly_query` a los roles `anon` y `authenticated`.
3.2. THE `Sistema` SHALL sustituir la ejecución de SQL arbitrario provisto por el cliente por consultas parametrizadas de alcance fijo, o eliminar por completo la función `execute_readonly_query`.
3.3. IF un cliente con rol `anon` o `authenticated` intenta invocar `execute_readonly_query`, THEN THE `Base_de_Datos` SHALL denegar la ejecución.
3.4. THE `Base_de_Datos` SHALL impedir la lectura de tablas del esquema `auth` (incluida `auth.users`) a través de cualquier función expuesta a los roles `anon` o `authenticated`.

### Requisito 4: Activación de suscripción server-side vía webhook (Crítico)

**Historia de Usuario:** Como responsable de seguridad, quiero que la activación y extensión de suscripciones ocurra únicamente en el servidor tras validar un pago real, para impedir que un usuario autenticado se ponga la suscripción activa sin pagar.

#### Criterios de Aceptación

4.1. THE `Sistema` SHALL activar o extender un registro de `business_subscriptions` únicamente en respuesta a un evento de pago validado por el `Webhook_Pagos`.
4.2. WHEN el `Webhook_Pagos` recibe un evento de pago, THE `Webhook_Pagos` SHALL validar la firma y autenticidad del evento del proveedor Wompi antes de aplicar cualquier cambio a la suscripción.
4.3. IF la firma del evento de pago no es válida, THEN THE `Webhook_Pagos` SHALL rechazar el evento sin modificar ninguna suscripción.
4.4. THE `Base_de_Datos` SHALL restringir las políticas RLS de `business_subscriptions` a solo lectura para los usuarios autenticados, permitiendo la escritura de `status` y `current_period_end` únicamente al rol `service_role`.
4.5. IF un usuario autenticado intenta modificar directamente `status` o `current_period_end` de `business_subscriptions`, THEN THE `Base_de_Datos` SHALL denegar la escritura.
4.6. THE `Sistema` SHALL retirar del `Cliente` (`lib/customPlanCheckout.ts` y `SubscriptionPlansScreen.tsx`) la escritura directa del estado de suscripción activa, delegándola al `Webhook_Pagos`.
4.7. THE `Webhook_Pagos` SHALL procesar cada evento de pago de forma idempotente, de modo que un mismo evento aprobado no extienda la vigencia ni registre factura más de una vez.

### Requisito 5: Restricción de RPCs mutantes SECURITY DEFINER (Crítico)

**Historia de Usuario:** Como responsable de seguridad, quiero que las funciones RPC que modifican datos exijan un usuario autenticado y verifiquen su pertenencia al negocio, para impedir que la `anon key` pública ejecute operaciones sensibles.

#### Criterios de Aceptación

5.1. THE `Base_de_Datos` SHALL revocar el permiso `EXECUTE` al rol `anon` en todas las funciones SECURITY DEFINER que no sean genuinamente públicas, incluyendo como mínimo `close_cash_shift`, `cancel_order_and_restore_stock`, `void_order_and_restore_stock`, `delete_order_and_restore_stock`, `process_sale_refund`, `deduct_stock_for_order`, `increment_stock` y `update_client_debt`.
5.2. WHEN una función RPC mutante se ejecuta, THE `Base_de_Datos` SHALL validar dentro de la función que `auth.uid()` corresponde a un usuario autenticado que pertenece al negocio (`business_id`) sobre el que opera.
5.3. IF el usuario que invoca una función RPC mutante no pertenece al negocio objetivo, THEN THE `Base_de_Datos` SHALL denegar la ejecución.
5.4. THE `Base_de_Datos` SHALL mantener disponible al rol `anon` únicamente el conjunto mínimo de funciones que la autenticación pública requiere, documentando cada una como pública por diseño.

### Requisito 6: Protección del PIN de acceso contra fuerza bruta (Alto)

**Historia de Usuario:** Como responsable de seguridad, quiero limitar los intentos de acceso por PIN y ampliar el espacio de claves, para impedir ataques de fuerza bruta y enumeración de cuentas contra el flujo de acceso.

#### Criterios de Aceptación

6.1. THE `Sistema` SHALL requerir que los PIN de acceso tengan una longitud mínima de 6 dígitos.
6.2. WHEN un mismo origen (usuario o IP) acumula 5 o más intentos fallidos de acceso por PIN dentro de una ventana de 10 minutos, THE `Sistema` SHALL bloquear temporalmente los nuevos intentos de ese origen durante al menos 15 minutos.
6.3. THE `Sistema` SHALL habilitar la `Leaked_Password_Protection` de Supabase Auth.
6.4. THE `Sistema` SHALL limitar la tasa de invocación de las funciones `login_email_for_phone` y `user_exists_by_phone` para impedir la enumeración masiva de cuentas.
6.5. IF un intento de acceso por PIN se rechaza por bloqueo por intentos, THEN THE `Sistema` SHALL responder con un mensaje genérico que no revele si el error es del teléfono o del PIN.

### Requisito 7: Autorización en la creación de empleados (Alto)

**Historia de Usuario:** Como dueño del negocio, quiero que la creación de empleados exija que el solicitante sea administrador de mi negocio, para impedir que cualquiera cree usuarios con cualquier rol en cualquier negocio.

#### Criterios de Aceptación

7.1. WHEN la `Edge_Function_CreateEmployee` recibe una solicitud, THE `Edge_Function_CreateEmployee` SHALL validar el encabezado `Authorization` e identificar al usuario que llama a partir de su sesión.
7.2. THE `Edge_Function_CreateEmployee` SHALL verificar que el usuario que llama posee el permiso de administración de usuarios (`admin_users`) sobre el `business_id` objetivo antes de crear el empleado.
7.3. IF el usuario que llama no es administrador del `business_id` objetivo, THEN THE `Edge_Function_CreateEmployee` SHALL rechazar la solicitud sin crear ningún usuario.
7.4. THE `Edge_Function_CreateEmployee` SHALL rechazar cualquier `business_id` recibido en el cuerpo de la solicitud que no coincida con el negocio del administrador autenticado.
7.5. THE `Edge_Function_CreateEmployee` SHALL validar que el `role_id` solicitado pertenece al negocio del administrador autenticado.

### Requisito 8: Privacidad de los buckets de Storage (Alto)

**Historia de Usuario:** Como dueño del negocio, quiero que la evidencia de deudas de clientes sea privada y accesible solo mediante enlaces firmados, para proteger datos sensibles de mis clientes.

#### Criterios de Aceptación

8.1. THE `Sistema` SHALL configurar el bucket `debt-evidence` como privado.
8.2. WHEN un usuario autorizado necesita acceder a un archivo de `debt-evidence`, THE `Sistema` SHALL entregar el acceso mediante una `URL_Firmada` con expiración.
8.3. IF una solicitud intenta listar o descargar objetos de `debt-evidence` sin una `URL_Firmada` válida, THEN THE `Sistema` SHALL denegar el acceso.
8.4. THE `Sistema` SHALL deshabilitar el listado público de objetos en los buckets `avatars`, `business-logos` y `product-images`.
8.5. THE `Sistema` SHALL restringir las operaciones de escritura sobre los buckets a usuarios autenticados con pertenencia al negocio correspondiente.

### Requisito 9: Proxy server-side para APIs y eliminación de claves embebidas (Medio)

**Historia de Usuario:** Como responsable de seguridad, quiero que las claves de APIs externas y de firmado dejen de viajar al `Cliente` y se usen desde el servidor, para impedir su extracción desde el bundle.

#### Criterios de Aceptación

9.1. THE `Sistema` SHALL enrutar las llamadas a Gemini, Go-UPC y Google CSE a través de edge functions proxy que mantengan las claves en el servidor.
9.2. THE `Sistema` SHALL dejar de exponer en el bundle `Cliente` las claves `VITE_GEMINI_API_KEY`, `VITE_GOUPC_API_KEY` y `VITE_GOOGLE_CSE_API_KEY`.
9.3. THE `Sistema` SHALL eliminar la clave Gemini embebida como fallback en todas las edge functions que la tuvieran hardcodeada (`ai-chat`, `ocr-scan`, `scan-invoice`, `invoice-scan`), obteniéndola exclusivamente desde los secrets del servidor.
9.4. THE `Sistema` SHALL retirar la clave privada de firmado QZ de `lib/qzSigning.ts` y ejecutar el firmado ESC/POS en un componente server-side, de modo que la clave privada no viaje al bundle `Cliente`.
9.5. WHEN un proxy server-side recibe una solicitud a una API externa, THE proxy SHALL validar que el solicitante es un usuario autenticado del negocio antes de reenviar la llamada.
9.6. THE `Sistema` SHALL segmentar la clave de Gemini en un secret por pantalla/feature de IA (`GEMINI_API_FOTOLISTA`, `GEMINI_API_COMPRA_INVENTARIO`, `GEMINI_API_GASTO`, `GEMINI_API_ASISTENTE`, `GEMINI_API_COLORES_PROVEEDORES`), de modo que cada edge function lea el secret de su feature, el consumo pueda medirse por separado y una clave comprometida se rote sin afectar a las demás.
9.7. THE `Sistema` SHALL eliminar el código muerto asociado a IA que ya no se invoca (edge function `invoice-scan` y el hook `useInvoiceScan`) y retirar del `.env` la variable muerta `VITE_GEMINI_API_KEY`, para reducir la superficie de exposición de claves.

### Requisito 10: Autorización reforzada en el servidor (Medio)

**Historia de Usuario:** Como responsable de seguridad, quiero que la autorización de operaciones sensibles se aplique en el servidor mediante RLS por rol, para que ocultar botones en la UI no sea la única barrera de seguridad.

#### Criterios de Aceptación

10.1. THE `Base_de_Datos` SHALL aplicar políticas RLS por rol que autoricen cada operación sensible en el servidor, con independencia de los permisos evaluados en la UI.
10.2. THE `Sistema` SHALL usar los permisos de `hooks/usePermissions.ts` únicamente para presentación (mostrar u ocultar UI) y SHALL delegar la autorización efectiva a las políticas del servidor.
10.3. IF un usuario sin el rol o permiso adecuado intenta una operación sensible directamente contra la `Base_de_Datos`, THEN THE `Base_de_Datos` SHALL denegar la operación aunque la UI la hubiera permitido.
10.4. THE `Sistema` SHALL eliminar el fallback permisivo de `isSuperAdmin` derivado del `profile.role` cacheado en `localStorage`, de modo que un privilegio elevado no pueda originarse en datos editables por el cliente.

### Requisito 11: Autorización independiente de la caché y sincronización offline validada (Medio)

**Historia de Usuario:** Como responsable de seguridad, quiero que el acceso y los permisos no se deriven de datos cacheados editables y que la `Cola_Offline` se valide en el servidor al sincronizar, para impedir el escalado de privilegios manipulando `localStorage`, sin romper el modo offline legítimo.

#### Criterios de Aceptación

11.1. WHILE el dispositivo está sin conexión, THE `Sistema` SHALL permitir la operación de los flujos offline legítimos (ventas, apertura/cierre de caja, abonos, compras y mermas) usando la caché local.
11.2. WHEN la conexión se restablece y la `Cola_Offline` se sincroniza, THE `Base_de_Datos` SHALL validar cada operación mediante RLS y la identidad del servidor (`auth.uid()`), rechazando las que no correspondan al usuario o negocio autenticado.
11.3. IF una operación de la `Cola_Offline` declara un `businessId` o `userId` que no coincide con la identidad autenticada en el servidor al sincronizar, THEN THE `Base_de_Datos` SHALL rechazar esa operación.
11.4. THE `Sistema` SHALL determinar la autorización efectiva (rol, permisos y suscripción activa) a partir de datos verificados por el servidor, tratando los valores restaurados de `localStorage` únicamente como caché de presentación mientras se revalida.
11.5. WHEN la conexión se restablece, THE `Sistema` SHALL revalidar contra el servidor el rol, los permisos y el estado de suscripción, y reconciliar cualquier discrepancia con la caché local.
11.6. THE `Sistema` SHALL preservar la funcionalidad offline de manera que las restricciones de seguridad no impidan las operaciones offline legítimas de un usuario válido.

### Requisito 12: Eliminación de código dinámico y endurecimiento de la base de datos (Medio)

**Historia de Usuario:** Como responsable de seguridad, quiero eliminar la ejecución de código dinámico en el `Cliente` y endurecer la configuración de la `Base_de_Datos`, para reducir la superficie de inyección de código y de escalado de privilegios.

#### Criterios de Aceptación

12.1. THE `Sistema` SHALL reemplazar el uso de `new Function()` en `components/expense/InvoiceReviewPanel.tsx` (evaluateCostFormula) por un `Evaluador_Formulas` de expresiones aritméticas seguro que no ejecute código arbitrario.
12.2. WHEN el `Evaluador_Formulas` recibe una fórmula, THE `Evaluador_Formulas` SHALL aceptar únicamente operadores aritméticos y operandos numéricos definidos.
12.3. IF una fórmula contiene tokens no permitidos (identificadores, llamadas a funciones o acceso a propiedades), THEN THE `Evaluador_Formulas` SHALL rechazar la fórmula y reportar un error sin evaluarla.
12.4. THE `Base_de_Datos` SHALL mover la extensión `pg_net` fuera del esquema `public`.
12.5. THE `Base_de_Datos` SHALL fijar un `search_path` explícito e inmutable en las funciones SECURITY DEFINER que actualmente lo tienen mutable.
