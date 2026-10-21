# Requirements Document

## Introduction

Esta funcionalidad, **Notificación de Actualización de Versión**, rediseña el mecanismo con el que la PWA Bistro POS avisa al usuario de que existe una versión nueva desplegada y le ayuda a recargarla.

El comportamiento actual (basado en el disparador `needRefresh` del Service Worker con `registerType: 'prompt'`) presenta dos fallas en producción: al presionar "Actualizar" la notificación reaparece en un bucle infinito y no desaparece; y cuando el usuario recarga por su cuenta (F5, Ctrl+R) la notificación no se retira porque el Service Worker en espera nunca se activa con una recarga normal. A esto se suma que la recarga trae un `index.html` cacheado por el navegador (no hay cabeceras `Cache-Control` en `firebase.json`), lo que provoca que se vuelva a detectar la "versión nueva" y se reinicie el bucle.

El nuevo modelo desacopla la detección de actualización del Service Worker. La detección pasa a basarse en un identificador de build (`buildId`) publicado en un archivo `version.json` servido siempre fresco, comparado contra el `buildId` horneado en el bundle en tiempo de compilación (estilo Supabase). El Service Worker se conserva únicamente para soporte offline y Web Push, y pasa a auto-actualizarse en segundo plano. La notificación se convierte en una simple ayuda para recargar: aparece cuando hay una versión nueva y desaparece de forma definitiva tras cualquier recarga, sin bucles.

Se mantienen dos garantías críticas del sistema actual: el guard de la cola offline (no recargar mientras haya transacciones pendientes, fallidas o una sincronización activa) y el "modo silencioso" para pantallas previas al inicio de sesión.

## Glossary

- **Sistema**: La PWA Bistro POS ejecutándose en el navegador del usuario (cliente).
- **buildId**: Identificador único de una compilación de la aplicación. Se genera en el build como el hash corto del commit de git (`git rev-parse --short HEAD`), con respaldo a una marca de tiempo si git no está disponible.
- **`__BUILD_ID__`**: Constante horneada en el bundle en tiempo de compilación que contiene el `buildId` de la versión que el usuario tiene cargada actualmente.
- **`version.json`**: Archivo estático publicado en la raíz del sitio (`/version.json`) que contiene el `buildId` de la versión desplegada en el servidor. Se sirve sin caché para reflejar siempre el estado real del despliegue.
- **Verificación de Versión**: Proceso del cliente que descarga `version.json` y compara su `buildId` contra `__BUILD_ID__` para determinar si hay una versión nueva.
- **Estado de Actualización Detectada**: Estado del cliente que indica que se encontró una versión nueva. Es persistente durante la sesión de la página ("latch"): una vez activado, permanece activo hasta que la página se recarga.
- **Cola Offline**: Conjunto de transacciones registradas localmente (IndexedDB) pendientes de sincronizar con el servidor.
- **Cola Limpia**: Condición en la que no hay transacciones pendientes ni fallidas y no hay una sincronización activa (`pendingCount == 0`, `failedCount == 0`, `isSyncing == false`).
- **Modo Silencioso**: Modo de operación en pantallas previas al inicio de sesión donde, con conexión disponible, la versión nueva se aplica automáticamente sin mostrar la notificación.
- **Notificación de Actualización**: Elemento de interfaz que informa al usuario de la versión nueva y ofrece la acción de recargar.
- **Service Worker**: Worker registrado por Workbox/`vite-plugin-pwa` responsable del soporte offline y la recepción de Web Push.

## Requirements

### Requisito 1

**Historia de Usuario:** Como responsable del despliegue, quiero que cada compilación publique un identificador de build único, para que el cliente pueda detectar de forma confiable cuándo hay una versión nueva.

#### Criterios de Aceptación

1.1. WHEN se ejecuta el build de producción, THE Sistema SHALL generar un archivo `version.json` en la raíz de la salida del build que contenga el `buildId` de esa compilación.
1.2. WHEN se ejecuta el build de producción, THE Sistema SHALL hornear el mismo `buildId` en el bundle como la constante `__BUILD_ID__`.
1.3. WHEN el build obtiene el hash corto del commit de git correctamente, THE Sistema SHALL usar ese hash como `buildId`.
1.4. IF la obtención del hash de git falla durante el build, THEN THE Sistema SHALL usar una marca de tiempo de la compilación como `buildId`.
1.5. WHEN se generan `version.json` y `__BUILD_ID__` en la misma compilación, THE Sistema SHALL asignarles el mismo valor de `buildId`.

### Requisito 2

**Historia de Usuario:** Como usuario del POS, quiero que la aplicación detecte automáticamente cuándo hay una versión nueva desplegada, para enterarme sin tener que revisar manualmente.

#### Criterios de Aceptación

2.1. WHEN la aplicación se carga, THE Sistema SHALL realizar una Verificación de Versión.
2.2. WHILE la aplicación permanece abierta, THE Sistema SHALL realizar una Verificación de Versión de forma periódica en intervalos de 60 segundos.
2.3. WHEN la pestaña de la aplicación recupera el foco, THE Sistema SHALL realizar una Verificación de Versión.
2.4. WHEN el Sistema realiza una Verificación de Versión, THE Sistema SHALL solicitar `version.json` de forma que no se sirva desde caché.
2.5. WHEN una Verificación de Versión obtiene un `buildId` del servidor distinto de `__BUILD_ID__`, THE Sistema SHALL activar el Estado de Actualización Detectada.
2.6. WHILE el `buildId` del servidor es igual a `__BUILD_ID__`, THE Sistema SHALL mantener inactivo el Estado de Actualización Detectada.
2.7. WHEN el Estado de Actualización Detectada ya está activo, THE Sistema SHALL mantenerlo activo en las Verificaciones de Versión posteriores dentro de la misma sesión de página.
2.8. IF una Verificación de Versión falla por un error de red, THEN THE Sistema SHALL conservar el estado actual sin activar el Estado de Actualización Detectada.

### Requisito 3

**Historia de Usuario:** Como usuario del POS, quiero ver un aviso claro cuando haya una versión nueva, para poder recargar y obtener los últimos cambios cuando me convenga.

#### Criterios de Aceptación

3.1. WHILE el Estado de Actualización Detectada está activo y la Cola Offline está limpia y hay conexión, THE Sistema SHALL mostrar la Notificación de Actualización.
3.2. WHEN el usuario activa la acción de recargar de la Notificación de Actualización, THE Sistema SHALL aplicar la versión nueva recargando la página.
3.3. WHEN el usuario activa la acción de descartar de la Notificación de Actualización, THE Sistema SHALL ocultar la Notificación de Actualización durante el resto de la sesión de página actual.
3.4. WHILE el usuario descartó la Notificación de Actualización durante la sesión de página actual, THE Sistema SHALL mantenerla oculta el resto de esa sesión aunque una Verificación de Versión detecte un `buildId` del servidor distinto.
3.5. WHEN la página se recarga, THE Sistema SHALL restablecer el estado de descarte de la Notificación de Actualización.
3.6. WHILE el Estado de Actualización Detectada está activo, THE Notificación de Actualización SHALL ofrecer una acción de recargar y una acción de descartar.
3.7. THE Notificación de Actualización SHALL ser navegable por teclado y exponer etiquetas accesibles para sus acciones.

### Requisito 4

**Historia de Usuario:** Como cajero con ventas sin sincronizar, quiero que la aplicación no me deje recargar mientras haya datos pendientes, para no perder transacciones de la cola offline.

#### Criterios de Aceptación

4.1. WHILE la Cola Offline no está limpia, THE Sistema SHALL impedir la ejecución de la acción de recargar de la Notificación de Actualización.
4.2. WHILE la Cola Offline no está limpia y el Estado de Actualización Detectada está activo, THE Sistema SHALL mostrar el mensaje de estado "Sincronizando datos…" en la Notificación de Actualización.
4.3. WHILE no hay conexión, THE Sistema SHALL impedir la ejecución de la acción de recargar de la Notificación de Actualización.
4.4. WHEN la Cola Offline pasa a estar limpia y hay conexión mientras el Estado de Actualización Detectada está activo, THE Sistema SHALL habilitar la acción de recargar de la Notificación de Actualización.

### Requisito 5

**Historia de Usuario:** Como usuario, quiero que la notificación desaparezca de forma definitiva cuando recargo la página por cualquier medio, para no ver un aviso repetido en bucle.

#### Criterios de Aceptación

5.1. WHEN la página se recarga por cualquier medio y el `buildId` del servidor coincide con `__BUILD_ID__` de la página recargada, THE Sistema SHALL mantener inactivo el Estado de Actualización Detectada.
5.2. WHEN la página se recarga y obtiene la versión desplegada, THE Sistema SHALL reflejar los cambios de esa versión.
5.3. WHILE el usuario permanece en una versión cuyo `buildId` coincide con el del servidor, THE Sistema SHALL mantener oculta la Notificación de Actualización.

### Requisito 6

**Historia de Usuario:** Como usuario en pantallas previas al inicio de sesión, quiero recibir la versión nueva automáticamente sin avisos, para empezar siempre con la versión más reciente.

#### Criterios de Aceptación

6.1. WHILE el Modo Silencioso está activo y hay conexión, THE Sistema SHALL ocultar la Notificación de Actualización.
6.2. WHEN el Estado de Actualización Detectada se activa durante el Modo Silencioso y hay conexión, THE Sistema SHALL aplicar la versión nueva recargando la página.
6.3. WHILE el Modo Silencioso está activo y no hay conexión, THE Sistema SHALL posponer la aplicación de la versión nueva.
6.4. WHEN la conexión se restablece mientras el Modo Silencioso está activo y hay una versión nueva pospuesta, THE Sistema SHALL aplicar la versión nueva recargando la página.

### Requisito 7

**Historia de Usuario:** Como operador del sistema, quiero que el navegador nunca sirva un `index.html`, `version.json` ni Service Worker cacheado, para que la detección de versión sea confiable y no se reinicie el bucle.

#### Criterios de Aceptación

7.1. THE Sistema SHALL declarar cabeceras de control de caché de no almacenamiento (`no-cache`/`no-store`) para `index.html`.
7.2. THE Sistema SHALL declarar cabeceras de control de caché de no almacenamiento (`no-cache`/`no-store`) para `version.json`.
7.3. THE Sistema SHALL declarar cabeceras de control de caché de no almacenamiento (`no-cache`/`no-store`) para el archivo del Service Worker (`sw.js`).
7.4. THE Sistema SHALL declarar cabeceras de caché inmutable de larga duración para los recursos con hash en `/assets/**`.

### Requisito 8

**Historia de Usuario:** Como usuario offline, quiero que el soporte sin conexión y las notificaciones push sigan funcionando, para no perder capacidades al cambiar el mecanismo de actualización.

#### Criterios de Aceptación

8.1. THE Sistema SHALL conservar el Service Worker registrado para el soporte offline y la recepción de Web Push.
8.2. WHEN hay una versión nueva del Service Worker disponible, THE Sistema SHALL actualizar el Service Worker automáticamente en segundo plano.
8.3. THE Service Worker SHALL abstenerse de controlar la visibilidad de la Notificación de Actualización.
