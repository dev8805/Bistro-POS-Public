# Implementation Plan: Notificación de Actualización de Versión

## Overview

Este plan implementa el nuevo mecanismo de detección de versión basado en `buildId` (estilo Supabase), desacoplado del Service Worker. El trabajo se organiza en seis tareas incrementales:

1. **Infraestructura de build** (`vite.config.ts`): resuelve el `buildId`, lo hornea en `__BUILD_ID__` y publica `version.json`. Es la base de la detección.
2. **Config PWA** (`vite.config.ts`): pasa el SW a `autoUpdate` y excluye `version.json` del precache, conservando offline/push.
3. **Cabeceras de hosting** (`firebase.json`): garantiza que `index.html`, `version.json` y `sw.js` lleguen frescos.
4. **Hook de detección** (`hooks/useVersionCheck.ts`): fetch periódico, comparación y latch de `updateAvailable`.
5. **Componente de UI** (`components/UpdateNotification.tsx`): visibilidad, guard de cola offline, dismiss, modo silencioso.
6. **Montaje** (`App.tsx`): conserva los dos montajes y actualiza comentarios.

La detección (Tarea 4) depende de la infraestructura de build (Tarea 1); el componente (Tarea 5) depende del hook (Tarea 4); y `App.tsx` (Tarea 6) depende del componente (Tarea 5). Las Tareas 2 y 3 son independientes y pueden ejecutarse en paralelo con la Tarea 1.

Stack de pruebas: **Vitest** + **@testing-library/react** + **fast-check** (property-based, mínimo 100 iteraciones). No se implementa PBT desde cero.

## Task Dependency Graph

```
Task 1 (base: buildId + version.json + __BUILD_ID__)
   │
   ├─→ Task 4 (hook useVersionCheck, usa __BUILD_ID__ y /version.json)
   │        └─→ Task 5 (UpdateNotification, usa el hook)
   │                 └─→ Task 6 (App.tsx monta el componente)
   │
Task 2 (config PWA autoUpdate)      * independientes de Task 1,
Task 3 (headers firebase.json)      * pueden ir en paralelo
```

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1.1", "2.1", "3.1"],
      "description": "Infraestructura base y config declarativa, sin dependencias entre sí"
    },
    {
      "wave": 2,
      "tasks": ["1.2", "4.1"],
      "description": "Property test del plugin de build e implementación del hook (dependen de Task 1)"
    },
    {
      "wave": 3,
      "tasks": ["4.2", "4.3", "5.1"],
      "description": "Tests del hook y reescritura del componente (dependen del hook)"
    },
    {
      "wave": 4,
      "tasks": ["5.2", "6.1"],
      "description": "Tests del componente y ajuste de App.tsx (dependen del componente)"
    }
  ]
}
```

## Tasks

- [x] 1. Infraestructura de build: resolver `buildId`, hornear `__BUILD_ID__` y publicar `version.json`
  - [x] 1.1 Implementar el plugin de build en `vite.config.ts`
    - Añadir la función `resolveBuildId()` que ejecuta `git rev-parse --short HEAD` con `execSync`; en `catch`, retornar `ts-${Date.now()}` como respaldo
    - Resolver el `buildId` una sola vez al inicio de `defineConfig` y usarlo tanto en `define: { __BUILD_ID__: JSON.stringify(buildId) }` como en el plugin
    - Implementar el plugin inline `buildIdPlugin(buildId)`: en `configureServer`, servir `/version.json` con `Content-Type: application/json` y `Cache-Control: no-store`; en `closeBundle`, escribir `dist/version.json` con `{ buildId }` usando `writeFileSync`
    - Añadir `declare const __BUILD_ID__: string` en `vite-env.d.ts`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.4_

  - [ ]* 1.2 Escribir tests del plugin de build y property test de consistencia
    - Ejemplo: `resolveBuildId` con `execSync` mockeado devolviendo un hash usa ese hash (1.3); con `execSync` que lanza usa `ts-<timestamp>` (1.4)
    - Ejemplo: `closeBundle` escribe `dist/version.json` con la forma `{ buildId }` (1.1)
    - **Property 1: Consistencia de buildId entre artefactos** — para cualquier `buildId`, el valor de `define.__BUILD_ID__` coincide con el escrito en `version.json`
    - **Validates: Requirements 1.5**

- [x] 2. Configuración PWA en `vite.config.ts` (autoUpdate + exclusión de `version.json`)
  - [x] 2.1 Ajustar la configuración de `VitePWA`
    - Cambiar `registerType` de `'prompt'` a `'autoUpdate'`
    - Excluir `version.json` del precache de Workbox mediante `globIgnores` y/o añadir una regla `runtimeCaching` con handler `NetworkOnly` para `/version.json`
    - Conservar `importScripts: ['/push-sw.js']` y toda la configuración de offline y Web Push existente
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 3. Cabeceras de caché en `firebase.json`
  - [x] 3.1 Añadir la sección `headers`
    - Declarar `Cache-Control: no-store` (o `no-cache`) para `/index.html`, `/version.json` y `/sw.js`
    - Declarar `Cache-Control: public, max-age=31536000, immutable` para `**/assets/**`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 4. Hook de detección `hooks/useVersionCheck.ts`
  - [x] 4.1 Implementar el hook `useVersionCheck`
    - Definir `UseVersionCheckResult { updateAvailable: boolean }` y `POLL_INTERVAL_MS = 60_000`
    - `checkVersion()`: `fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })`; si `res.ok`, parsear `{ buildId }` y comparar contra `__BUILD_ID__`; si difiere, `setUpdateAvailable(true)` (latch, nunca vuelve a `false`)
    - En `catch` (error de red / JSON inválido / respuesta no ok) no modificar el estado
    - Guard `navigator.onLine`: `checkVersion` retorna temprano si no hay red
    - `useEffect` de montaje: verificación inicial + `setInterval(checkVersion, POLL_INTERVAL_MS)` + listeners `focus`, `visibilitychange` (solo si `document.visibilityState === 'visible'`) y `online`
    - Cleanup completo en el `return` del `useEffect`: `clearInterval` y `removeEventListener` de todos los listeners
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 5.1, 5.2, 5.3_

  - [ ]* 4.2 Escribir property tests del hook (fast-check, mock de `fetch`)
    - **Property 2: Detección por diferencia de buildId** — generar pares `(server.buildId, __BUILD_ID__)`; activación ⟺ diferencia
    - **Property 3: Latch monotónico de updateAvailable** — tras activar, generar secuencias de respuestas y confirmar que `updateAvailable` sigue `true`
    - **Property 4: Fallo de red conserva el estado** — generar estado previo y forzar rechazo del `fetch`; confirmar estado inalterado
    - **Validates: Requirements 2.5, 2.6, 2.7, 2.8, 5.1, 5.3**

  - [ ]* 4.3 Escribir tests de ejemplo/edge del hook (Vitest + fake timers)
    - Verificación al montar (2.1), polling a los 60s (2.2), en `focus`/`visibilitychange` (2.3)
    - `fetch` invocado con `cache: 'no-store'` y query param anti-caché (2.4)
    - Cleanup: al desmontar, `clearInterval` y `removeEventListener` invocados (sin fugas)
    - Guard `navigator.onLine`: sin red no se hace fetch (2.8)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.8_

- [x] 5. Reescribir el componente `components/UpdateNotification.tsx`
  - [x] 5.1 Reescribir el componente sobre `useVersionCheck`
    - Reemplazar `useRegisterSW` por `useVersionCheck`; conservar la interfaz de props (`isOnline`, `pendingCount`, `failedCount`, `isSyncing`, `silent`)
    - Derivar con `useMemo` (sin `useEffect` para derivar estado): `colaLimpia = pendingCount === 0 && failedCount === 0 && !isSyncing`; `puedeActualizar = isOnline && colaLimpia`; `visible = updateAvailable && !dismissed && !silent && colaLimpia && isOnline`
    - Estado local `dismissed` (Opción A, se restablece solo al recargar); `handleDismiss = () => setDismissed(true)`
    - `handleUpdate = () => { if (puedeActualizar) window.location.reload(); }`
    - Modo silencioso: `useEffect` con deps `[silent, updateAvailable, isOnline]` que hace `window.location.reload()` cuando `silent && updateAvailable && isOnline`; al reconectar aplica la versión pospuesta; retorna `null` sin UI
    - Guard de cola sucia: botón "Actualizar" con `disabled={!puedeActualizar}` y copy "Sincronizando datos…" cuando `!puedeActualizar`
    - Eliminar `flushAndReload` por completo
    - Accesibilidad: botones nativos `<button>` con `aria-label` descriptivo, navegables por teclado; conservar el layout Tailwind del toast actual
    - Early returns: `if (silent) return null;` y `if (!visible) return null;`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.4, 6.1, 6.2, 6.3, 6.4_

  - [ ]* 5.2 Escribir property tests y tests de ejemplo del componente
    - **Property 5: Guard de la cola offline** — generar `(isOnline, pendingCount, failedCount, isSyncing)`; `puedeActualizar ⟺ (online && colaLimpia)` — **Validates: Requirements 4.1, 4.3, 4.4**
    - **Property 6: Visibilidad de la notificación** — generar combinaciones de flags; visibilidad ⟺ condición completa — **Validates: Requirements 3.1, 5.3, 6.1**
    - **Property 7: El descarte persiste durante la sesión** — tras `dismiss`, generar detecciones; sigue oculta — **Validates: Requirements 3.4**
    - **Property 8: Auto-recarga en modo silencioso** — en `silent`, `reload ⟺ (updateAvailable && online)` (mock de `window.location.reload`) — **Validates: Requirements 6.2, 6.3**
    - Ejemplo (@testing-library/react): sin update → null; con update+cola limpia+online → botones "Actualizar"/"Ahora no" y click recarga (3.2, 3.6); cola sucia → botón deshabilitado + copy (4.2); offline → deshabilitado; silent → null y dispara reload; accesibilidad por teclado y `aria-label` (3.7)

- [x] 6. Ajuste de montaje en `App.tsx`
  - [x] 6.1 Conservar los montajes y actualizar comentarios
    - Mantener los dos montajes de `UpdateNotification`: el principal (con contadores reales de la cola) y el pre-login (`silent` con contadores en 0)
    - Actualizar los comentarios que hoy mencionan `useRegisterSW` para reflejar el nuevo mecanismo basado en `useVersionCheck`
    - Revisar el mapa del archivo antes de editar; no rediseñar `App.tsx`
    - _Requirements: 3.1, 6.1_

- [x] 7. Checkpoint final — asegurar que todas las pruebas pasan
  - Ejecutar la suite (Vitest) y confirmar que los property tests y tests de ejemplo pasan; ante dudas, consultar al usuario.

## Notes

- Las sub-tareas marcadas con `*` son opcionales (property tests / tests de ejemplo) y pueden omitirse para un MVP más rápido.
- Cada property test debe correr un mínimo de **100 iteraciones** con fast-check y llevar el tag `Feature: notificacion-actualizacion-version, Property N: ...`.
- Las validaciones de configuración declarativa —cabeceras de `firebase.json` (Req 7) y opciones de Workbox / `registerType` (Req 8)— se verifican con pruebas de **integración/smoke** o revisión manual del deploy, **no** con property-based testing.
- Cada tarea referencia sus requisitos para trazabilidad; los checkpoints permiten validación incremental.
- El soporte offline es obligatorio en este flujo: la Tarea 5 debe conservar el guard de la cola offline y no tocar el Service Worker en la recarga.
