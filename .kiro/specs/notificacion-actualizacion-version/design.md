# Documento de Diseño: Notificación de Actualización de Versión

## Overview

Este diseño reemplaza el mecanismo de aviso de versión nueva —hoy acoplado al disparador `needRefresh` del Service Worker con `registerType: 'prompt'`— por un modelo de detección basado en un identificador de build (`buildId`), al estilo Supabase.

El principio central es **desacoplar la detección de actualización del Service Worker**:

```
   BUILD (Vite)                         CLIENTE (navegador)
 ┌───────────────┐                    ┌──────────────────────────┐
 │ resolveBuildId │                   │ useVersionCheck           │
 │  git short hash│                   │  fetch /version.json      │
 │  (fallback ts) │                   │  (no-store, cada 60s +    │
 └──────┬─────────┘                   │   focus + al cargar)      │
        │ mismo valor                 │                           │
        ├──► define __BUILD_ID__ ─────┼──► compara server.buildId │
        │    (horneado en bundle)     │       vs __BUILD_ID__      │
        └──► dist/version.json ───────┼──► si difieren: latch      │
             { buildId }              │       updateAvailable=true │
                                      └───────────┬───────────────┘
                                                  │
                                      ┌───────────▼───────────────┐
                                      │ UpdateNotification         │
                                      │  guard cola offline        │
                                      │  Actualizar → flush+reload │
                                      │  "Ahora no" → dismiss       │
                                      │  silent → auto flush+reload│
                                      └────────────────────────────┘
```

El Service Worker se conserva exclusivamente para soporte offline (IndexedDB + Event Sourcing + cola de sync) y Web Push, y pasa a `registerType: 'autoUpdate'` para actualizarse en segundo plano sin intervenir en la notificación. Las cabeceras `Cache-Control` de Firebase Hosting mantienen `version.json` (y `index.html`/`sw.js`) siempre frescos a nivel HTTP, lo que hace confiable la detección. La aplicación de la actualización, en cambio, exige un flush del Service Worker (desregistrar + vaciar Cache Storage) porque el precache de Workbox sirve el shell antes que la red; ese flush es lo que corta el bucle infinito al recargar (ver Architecture).

Este documento cubre los 8 requisitos de `requirements.md`.

## Architecture

La solución toca cinco piezas, cada una con una responsabilidad única:

| Pieza | Archivo | Responsabilidad | Requisitos |
|-------|---------|-----------------|------------|
| Plugin de build | `vite.config.ts` (plugin inline) | Resolver `buildId`, inyectar `__BUILD_ID__`, escribir `version.json`, servirlo en dev | 1, 2.4, 7 (glob) |
| Hook de detección | `hooks/useVersionCheck.ts` | Fetch periódico de `version.json`, comparación, latch de estado, respeto a `navigator.onLine` | 2, 5 |
| Componente de UI | `components/UpdateNotification.tsx` | Visibilidad, guard de cola offline, dismiss, modo silencioso, accesibilidad | 3, 4, 6 |
| Configuración PWA | `vite.config.ts` (`VitePWA`) | `autoUpdate`, excluir `version.json` del precache, conservar push/offline | 8 |
| Hosting | `firebase.json` | Cabeceras `Cache-Control` | 7 |
| Montaje | `App.tsx` | Conservar los dos montajes (normal + silent pre-login) | 3, 6 |

### Flujo de detección (runtime)

```
al montar ──► verificar()
  cada 60s ──► verificar()      ┌── fetch('/version.json?t='+Date.now(),
  focus    ──► verificar()  ────┤        { cache:'no-store' })
  visible  ──► verificar()      └── error de red ──► conservar estado (Req 2.8)
                                        │
                            server.buildId === __BUILD_ID__ ? 
                              sí ──► no cambia (Req 2.6)
                              no ──► setUpdateAvailable(true)  [latch, Req 2.5/2.7]
```

### Decisiones de diseño y su justificación

- **`version.json` en lugar del evento del SW.** Una recarga normal (F5) no activa un SW en espera, por eso `needRefresh` nunca se retiraba. Un archivo servido fresco comparado contra una constante horneada es determinista y se resuelve con cualquier recarga (Req 5).
- **Latch de `updateAvailable`.** Evita parpadeos si una verificación falla intermitentemente; una vez detectada la versión nueva, el estado se mantiene hasta recargar (Req 2.7).
- **Flush del Service Worker al aplicar la actualización (no basta un `reload()` estándar).** Aunque Firebase sirva `index.html` con `no-store`, el Service Worker de Workbox intercepta la navegación y sirve el shell (`index.html` y su JS) desde el **precache** con estrategia `CacheFirst`, *antes* de consultar la red o la caché HTTP del navegador. Por eso una recarga normal reservía el shell viejo (con el `__BUILD_ID__` anterior) mientras `/version.json` —servido con `NetworkOnly`— ya devuelve el `buildId` nuevo, lo que reactiva la detección y hace reaparecer la notificación en bucle. Para evitarlo, al aplicar la actualización el Sistema **desregistra el Service Worker y vacía Cache Storage** y recién entonces recarga, de modo que la recarga trae el shell nuevo desde la red (Req 3.2). El flush **no toca IndexedDB**, por lo que la cola offline queda intacta. Se incorpora además un **guard anti-loop en modo silencioso** (ver `UpdateNotification`) que evita recargas en cadena mientras el deploy se propaga.
- **`autoUpdate` del SW.** El SW deja de ser la fuente de la notificación y se actualiza solo en segundo plano (Req 8.2/8.3).

## Components and Interfaces

### Plugin de build `buildIdPlugin` (inline en `vite.config.ts`)

```typescript
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

const resolveBuildId = (): string => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return `ts-${Date.now()}`; // fallback si git no está disponible (Req 1.4)
  }
};

const buildIdPlugin = (buildId: string): Plugin => ({
  name: 'bistro-build-id',
  // Dev: servir /version.json en memoria (Req 2.1/2.4 en dev)
  configureServer(server) {
    server.middlewares.use('/version.json', (_req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ buildId }));
    });
  },
  // Build: escribir dist/version.json (Req 1.1)
  closeBundle() {
    const outFile = path.resolve(__dirname, 'dist', 'version.json');
    writeFileSync(outFile, JSON.stringify({ buildId }));
  },
});
```

El `buildId` se resuelve **una sola vez** al inicio de `defineConfig` y se usa tanto en `define: { __BUILD_ID__: JSON.stringify(buildId) }` (Req 1.2) como en el plugin (Req 1.1/1.5), garantizando un único valor por compilación.

### Hook `useVersionCheck` (`hooks/useVersionCheck.ts`)

```typescript
interface UseVersionCheckResult {
  /** true de forma persistente (latch) cuando el servidor tiene un buildId distinto. */
  updateAvailable: boolean;
  /** Último buildId visto del servidor; objetivo del flush. null hasta la primera verificación exitosa. */
  latestBuildId: string | null;
}

const POLL_INTERVAL_MS = 60_000;

export const useVersionCheck = (): UseVersionCheckResult => { /* ... */ };
```

Responsabilidades:
- `checkVersion()`: `fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })`; si `res.ok`, parsea `{ buildId }`, guarda ese valor en `latestBuildId` (`setLatestBuildId(server.buildId)`) y lo compara contra `__BUILD_ID__`; si difiere, hace `setUpdateAvailable(true)` (latch, nunca vuelve a `false`).
- `latestBuildId`: expone el último `buildId` recibido del servidor. Es el **objetivo del flush**: el componente lo pasa a `flushAndReload(latestBuildId)` para registrar en `sessionStorage` a qué build se está intentando actualizar (guard anti-loop).
- En `catch` (error de red) no modifica el estado (Req 2.8).
- Guard `navigator.onLine`: `checkVersion` retorna temprano si no hay red (evita polling inútil y falsos negativos).
- `useEffect` de montaje: verificación inicial + `setInterval(checkVersion, POLL_INTERVAL_MS)` + listeners `focus` y `visibilitychange` (solo actúa si `document.visibilityState === 'visible'`) + `online`.
- **Cleanup**: el `return` del `useEffect` limpia el `clearInterval` y todos los `removeEventListener`.

### Componente `UpdateNotification` (`components/UpdateNotification.tsx`)

Mantiene la misma interfaz de props (no cambia `App.tsx`):

```typescript
interface UpdateNotificationProps {
  isOnline: boolean;
  pendingCount: number;
  failedCount: number;
  isSyncing: boolean;
  silent?: boolean;
}
```

Lógica derivada (con `useMemo`, sin `useEffect` para derivar estado):

```typescript
const { updateAvailable, latestBuildId } = useVersionCheck();
const [dismissed, setDismissed] = useState(false); // Opción A: por sesión de página

const colaLimpia   = pendingCount === 0 && failedCount === 0 && !isSyncing;
const puedeActualizar = isOnline && colaLimpia;                 // guard (Req 4)
const visible = updateAvailable && !dismissed && !silent
                && colaLimpia && isOnline;                       // (Req 3.1)

const handleUpdate  = () => { if (puedeActualizar) flushAndReload(latestBuildId); }; // (Req 3.2)
const handleDismiss = () => setDismissed(true);                  // (Req 3.3/3.4)
```

- **Aplicar la actualización = `flushAndReload(latestBuildId)`.** El botón "Actualizar" ya no llama a `window.location.reload()` directamente, sino a `flushAndReload`, que desregistra el Service Worker, vacía Cache Storage y recién entonces recarga. Sin este flush, el SW reserviría el shell viejo desde su precache y la notificación reaparecería en bucle (ver Architecture).
- **Modo silencioso** (`useEffect` con dependencias `[silent, updateAvailable, isOnline, latestBuildId]`): si `silent && updateAvailable && isOnline` → `flushAndReload(latestBuildId)`. Al reconectar (cambio de `isOnline`) el efecto se re-evalúa y aplica la versión pospuesta (Req 6.4). Retorna `null` (sin UI, Req 6.1).

#### Función `flushAndReload` (module-scope) y guard anti-loop

Definida a nivel de módulo (fuera del componente) porque no depende del estado de React y debe poder invocarse de forma idempotente:

```typescript
const FLUSH_TO_KEY = 'bistro:swFlushTo';   // buildId objetivo del último flush
const FLUSH_AT_KEY = 'bistro:swFlushAt';   // timestamp (ms) del último flush
const FLUSH_COOLDOWN_MS = 30_000;          // ventana anti-loop

const flushAndReload = async (targetBuildId: string | null): Promise<void> => {
  // Guard anti-loop: si ya intentamos actualizar a este mismo buildId hace <30s, no reintentar.
  const lastTo = sessionStorage.getItem(FLUSH_TO_KEY);
  const lastAt = Number(sessionStorage.getItem(FLUSH_AT_KEY) ?? 0);
  const recientes = Date.now() - lastAt < FLUSH_COOLDOWN_MS;
  if (targetBuildId && lastTo === targetBuildId && recientes) return; // evita recargas en cadena

  sessionStorage.setItem(FLUSH_TO_KEY, targetBuildId ?? '');
  sessionStorage.setItem(FLUSH_AT_KEY, String(Date.now()));

  try {
    // 1) Desregistrar todos los Service Workers
    const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
    await Promise.all(regs.map((r) => r.unregister()));
    // 2) Vaciar Cache Storage (precache Workbox + runtime). NO se toca IndexedDB → cola offline intacta.
    const keys = await caches?.keys?.() ?? [];
    await Promise.all(keys.map((k) => caches.delete(k)));
  } finally {
    // 3) Recargar: al no haber SW ni caches, el shell nuevo llega desde la red.
    window.location.reload();
  }
};
```

- **Por qué se reintroduce el flush**: el shell (`index.html` + JS) vive en el precache del SW con `CacheFirst`; desregistrar el SW y borrar Cache Storage es la única forma de forzar que la recarga traiga el bundle nuevo con el `__BUILD_ID__` actualizado.
- **Por qué el guard anti-loop**: tras un flush, el deploy puede estar aún propagándose en el CDN; sin guard, el modo silencioso podría recargar una y otra vez contra el mismo `buildId` objetivo. El cooldown de 30s (claves `bistro:swFlushTo` + `bistro:swFlushAt` en `sessionStorage`) bloquea reintentos automáticos al mismo build dentro de esa ventana.
- **Por qué NO se toca IndexedDB**: la cola offline (transacciones pendientes/fallidas) persiste en IndexedDB; el flush solo elimina el SW y Cache Storage, preservando la cola.
- **Guard de cola sucia**: botón "Actualizar" con `disabled={!puedeActualizar}`; copy "Sincronizando datos…" cuando `!puedeActualizar` (Req 4.2). La notificación se oculta por completo si la cola no está limpia (regla `visible`), pero el copy de bloqueo se conserva para el caso límite en que la cola pasa a sucia con la notificación abierta.
- **Accesibilidad**: botones nativos `<button>`, `aria-label` descriptivo, navegables por teclado (Req 3.7). Se conserva el layout Tailwind del toast actual.
- **Early returns**: `if (silent) return null;` y `if (!visible) return null;`.

### `App.tsx` (ajuste menor)

Se conservan los dos montajes de `UpdateNotification` (principal con contadores reales de la cola, y pre-login con `silent` y contadores en 0). Solo se actualizan los comentarios que hoy mencionan `useRegisterSW`. No se rediseña `App.tsx`.

## Data Models

### `version.json` (artefacto de despliegue)

```json
{ "buildId": "a1b2c3d" }
```

```typescript
interface VersionManifest {
  buildId: string;
}
```

- Servido en `/version.json` (raíz), siempre fresco (`no-store`).
- `buildId`: hash corto de git (`git rev-parse --short HEAD`) o `ts-<epoch>` como fallback.

### Constante horneada `__BUILD_ID__`

Reemplazada en compilación por Vite `define`. Debe declararse como global de tipo en `vite-env.d.ts`:

```typescript
// vite-env.d.ts (añadir)
declare const __BUILD_ID__: string;
```

Ambos artefactos (`version.json.buildId` y `__BUILD_ID__`) derivan del **mismo** valor `buildId` resuelto una única vez por build (Req 1.5).

### Modelo de estado del hook

| Estado | Tipo | Transiciones |
|--------|------|--------------|
| `updateAvailable` | `boolean` | `false → true` cuando `server.buildId !== __BUILD_ID__`; monotónico (latch), nunca vuelve a `false` en la sesión de página |

### Modelo de estado del componente

| Estado | Tipo | Reinicio |
|--------|------|----------|
| `dismissed` | `boolean` | Local al componente; inicia en `false`; se restablece solo al recargar la página (desmontaje total del árbol) (Req 3.5) |

## Error Handling

| Escenario | Manejo | Requisito |
|-----------|--------|-----------|
| `fetch('/version.json')` falla (red/servidor) | `catch` que no modifica el estado; se conserva `updateAvailable` actual. Se registra `console.warn` (eliminado en prod por `drop: ['console']`). | 2.8 |
| Respuesta no `ok` o JSON inválido | Tratada como fallo: no se activa `updateAvailable`. | 2.8 |
| `git` no disponible en el build | `resolveBuildId` captura la excepción de `execSync` y usa `ts-<Date.now()>`. El build no se rompe. | 1.4 |
| Sin conexión (`!navigator.onLine`) | `checkVersion` retorna temprano (no hay fetch inútil ni falso positivo). En modo silencioso, la aplicación se pospone. | 2.8, 6.3 |
| Service Worker no soportado por el navegador | La detección de versión es independiente del SW; `useVersionCheck` funciona igual. El offline/push simplemente no está disponible, sin afectar la notificación. | 8.1, 8.3 |
| Cola offline sucia al intentar recargar | `handleUpdate` retorna temprano (`if (!puedeActualizar) return`) y el botón está `disabled`. | 4.1, 4.3 |
| El SW sirve el shell del precache tras recargar (recarga normal reservía el `__BUILD_ID__` viejo → notificación en bucle) | Al aplicar la actualización se ejecuta `flushAndReload`: desregistra el Service Worker y vacía Cache Storage antes de recargar, forzando que el shell nuevo llegue desde la red. No se toca IndexedDB (cola offline intacta). | 3.2, 5.1 |
| Deploy aún propagándose en el CDN tras el flush (el servidor sigue devolviendo el `buildId` objetivo pero la red entrega el shell viejo) | Guard anti-loop de 30s en modo silencioso: `sessionStorage` (`bistro:swFlushTo` + `bistro:swFlushAt`) evita reintentar `flushAndReload` hacia el mismo `buildId` dentro de la ventana de cooldown, cortando recargas en cadena. | 6.2, 6.4 |

## Correctness Properties

*Una propiedad es una característica o comportamiento que debe cumplirse en todas las ejecuciones válidas de un sistema; esencialmente, un enunciado formal de lo que el sistema debe hacer. Las propiedades sirven de puente entre la especificación legible por humanos y las garantías de correctitud verificables por máquina.*

### Property 1: Consistencia de buildId entre artefactos

*Para cualquier* `buildId` resuelto en una compilación, el valor inyectado en `__BUILD_ID__` y el valor escrito en `version.json` son idénticos.

**Validates: Requirements 1.5**

### Property 2: Detección por diferencia de buildId

*Para cualquier* par de identificadores `(server.buildId, __BUILD_ID__)`, una verificación exitosa activa `updateAvailable` si y solo si son distintos; si son iguales, `updateAvailable` no se activa.

**Validates: Requirements 2.5, 2.6, 5.1, 5.3**

### Property 3: Latch monotónico de updateAvailable

*Para cualquier* secuencia de verificaciones posteriores a una que activó `updateAvailable`, el valor de `updateAvailable` permanece `true` durante el resto de la sesión de página.

**Validates: Requirements 2.7**

### Property 4: Fallo de red conserva el estado

*Para cualquier* estado previo de `updateAvailable`, si una verificación de versión falla por error de red o respuesta inválida, el estado permanece sin cambios.

**Validates: Requirements 2.8**

### Property 5: Guard de la cola offline

*Para cualquier* combinación de `(isOnline, pendingCount, failedCount, isSyncing)`, la acción de recargar está habilitada si y solo si hay conexión y la cola está limpia (`pendingCount == 0 && failedCount == 0 && !isSyncing`).

**Validates: Requirements 4.1, 4.3, 4.4**

### Property 6: Visibilidad de la notificación

*Para cualquier* combinación de estados, la Notificación de Actualización es visible si y solo si `updateAvailable` está activo, la cola está limpia, hay conexión, no se ha descartado y no está en modo silencioso.

**Validates: Requirements 3.1, 5.3, 6.1**

### Property 7: El descarte persiste durante la sesión

*Para cualquier* secuencia de detecciones de versión posteriores a un descarte dentro de la misma sesión de página, la Notificación de Actualización permanece oculta.

**Validates: Requirements 3.4**

### Property 8: Auto-aplicación en modo silencioso

*Para cualquier* estado en modo silencioso, la aplicación de la actualización (flush del Service Worker + recarga) se dispara si y solo si `updateAvailable` está activo y hay conexión; sin conexión, se pospone.

**Validates: Requirements 6.2, 6.3**

## Testing Strategy

Se combina prueba basada en propiedades (para la lógica pura del hook y las funciones derivadas del componente) con pruebas de ejemplo/integración (para efectos secundarios, render y configuración de build/hosting). Framework sugerido: **Vitest** + **@testing-library/react** para el componente, y **fast-check** como librería de property-based testing (no se implementa PBT desde cero). Cada test de propiedad corre un mínimo de **100 iteraciones**.

### Pruebas del hook `useVersionCheck` (mock de `fetch`/`version.json`)

Property-based (fast-check, tag `Feature: notificacion-actualizacion-version, Property N: ...`):
- **Property 2**: generar pares de buildIds; verificar activación ⟺ diferencia.
- **Property 3**: tras activar, generar secuencias de respuestas (iguales/distintas) y confirmar que `updateAvailable` sigue `true`.
- **Property 4**: generar estados previos y forzar rechazo del `fetch`; confirmar estado inalterado.

Ejemplo/edge (Vitest + fake timers):
- Verificación al montar (2.1), polling a los 60s (2.2), en `focus`/`visibilitychange` (2.3).
- `fetch` invocado con `cache: 'no-store'` y query param anti-caché (2.4).
- Cleanup: al desmontar, `clearInterval` y `removeEventListener` llamados (sin fugas de timers/listeners).
- Guard `navigator.onLine`: sin red no se hace fetch.

### Pruebas del componente `UpdateNotification`

Property-based:
- **Property 5**: generar combinaciones de `(isOnline, pendingCount, failedCount, isSyncing)`; confirmar `puedeActualizar ⟺ (online && colaLimpia)`.
- **Property 6**: generar combinaciones de todos los flags; confirmar visibilidad ⟺ condición completa.
- **Property 7**: tras `dismiss`, generar secuencias de detecciones; confirmar que sigue oculta.
- **Property 8**: en `silent`, generar estados; confirmar `flushAndReload ⟺ (updateAvailable && online)` (mock de `flushAndReload`).

Ejemplo (@testing-library/react), estados clave:
- **Sin update**: `updateAvailable=false` → no renderiza (null).
- **Con update, cola limpia, online**: muestra toast con botones "Actualizar" y "Ahora no" (3.6); click en Actualizar → `flushAndReload(latestBuildId)` (mock que verifica unregister del SW + `caches.delete` + `window.location.reload`) (3.2).
- **Cola sucia**: botón deshabilitado + copy "Sincronizando datos…" (4.2).
- **Offline**: botón deshabilitado.
- **Silent**: no renderiza UI; con update+online dispara `flushAndReload`; transición offline→online aplica la versión pospuesta (6.4).
- **Guard anti-loop (silent)**: si `sessionStorage` indica un flush al mismo `latestBuildId` hace <30s, `flushAndReload` retorna sin recargar (no vuelve a llamar a `window.location.reload`).
- **Accesibilidad**: botones navegables por teclado y con `aria-label` (3.7).

### Pruebas del plugin de build (ejemplo/integración)

- `resolveBuildId` con git disponible (mock de `execSync` → hash) usa el hash (1.3).
- `resolveBuildId` con git fallando (mock que lanza) usa `ts-<timestamp>` (1.4).
- `closeBundle` escribe `dist/version.json` con la forma `{ buildId }` (1.1).
- **Property 1**: para cualquier `buildId`, el valor de `define.__BUILD_ID__` coincide con el escrito en `version.json`.

### Verificación de configuración (integración/smoke, NO property-based)

- `firebase.json`: cabeceras `no-store` para `/index.html`, `/version.json`, `/sw.js` e `immutable` para `**/assets/**` (Req 7) — verificación de configuración/manual del deploy.
- `vite.config.ts`: `registerType: 'autoUpdate'`, `importScripts: ['/push-sw.js']` conservado y `version.json` excluido del precache Workbox (glob) o con regla runtime `NetworkOnly` (Req 8).
- Registro del SW y disponibilidad de offline/push (Req 8.1) — smoke test.

## Notas

- No se implementa property-based testing desde cero: se usa fast-check.
- Las secciones de configuración (headers de Firebase, opciones de Workbox) se validan con pruebas de integración/smoke, no con PBT, por ser declarativas.
