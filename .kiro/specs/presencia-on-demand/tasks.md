# Implementation Plan

## Overview

Implementación del modelo de presencia on-demand: el refresco de actividad solo ocurre mientras un observador tiene abierta la pantalla de Actividad. Toca `lib/presenceManager.ts` (núcleo), `hooks/usePresenceBroadcast.ts` (emisor) y `hooks/useEmployeePresence.ts` (observador). Sin migraciones.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1"] },
    { "wave": 2, "tasks": ["2", "3"] },
    { "wave": 3, "tasks": ["4"] }
  ]
}
```

```
1 (presenceManager: señal + markActivity + gate)
├─> 2 (usePresenceBroadcast: emisor sin heartbeat)
└─> 3 (useEmployeePresence: setObserving)
        └─> 4 (verificación)

- 1 primero: define la API (markActivity, setObserving, isBeingWatched, handler de broadcast).
- 2 y 3 dependen de 1 y pueden ir en paralelo.
- 4 (verificación) al final.
```

## Tasks

- [x] 1. `presenceManager`: señal de observación, actividad local y gate de refresco
- [x] 1.1 Agregar `markActivity(partial?)`
  - Actualiza `selfPayload.last_activity_at = now` (y `cash_shift_id` si viene) en memoria, sin publicar.
  - _Requirements: 4.1_
- [x] 1.2 Suscribir el handler de broadcast `presence-watch`
  - En `start()`, agregar `.on('broadcast', { event: 'presence-watch' }, ...)` que: renueva `watchedUntil = now + WATCH_TTL_MS` y, si `navigator.onLine && selfPayload && !document.hidden`, ejecuta `channel.track(selfPayload)`.
  - Definir `WATCH_PING_MS = 60_000` y `WATCH_TTL_MS = 90_000`.
  - _Requirements: 2.2, 3.3, 4.2, 4.4_
- [x] 1.3 Agregar `setObserving(observing)` e `isBeingWatched()`
  - `setObserving(true)`: envía un broadcast `presence-watch` inmediato y arma un intervalo cada `WATCH_PING_MS`. `false`: limpia el intervalo.
  - `isBeingWatched()`: `Date.now() < watchedUntil`.
  - `stop()` también limpia el intervalo y `watchedUntil`.
  - _Requirements: 3.1, 3.2, 2.1, 2.3_
- [x] 1.4 Conservar `touch()`/`retrack()` solo para transiciones/reconexión
  - `touch()` y `retrack()` siguen publicando de inmediato (caja, recuperar red). Conservar el `track()` inicial de `start()` (online).
  - _Requirements: 1.1, 6.1, 6.2_

- [x] 2. `usePresenceBroadcast`: emisor sin heartbeat continuo
  - Conservar el `start()` inicial (online).
  - Listeners de `mousemove`/`keydown`/`touchstart` → `presenceManager.markActivity({ cash_shift_id })` (solo memoria, sin red).
  - **Eliminar** el `setInterval` de heartbeat de 2 min (el refresco lo dispara la señal del observador).
  - `visibilitychange`: al volver al frente, `markActivity()`; `online`: `presenceManager.retrack()`.
  - Cambio de `cashShiftId`: `presenceManager.touch({ cash_shift_id })`.
  - _Requirements: 2.1, 4.1, 6.1, 6.2_

- [x] 3. `useEmployeePresence`: activar observación con la pantalla
  - En un `useEffect`, al montar: `presenceManager.setObserving(true)`; al desmontar: `presenceManager.setObserving(false)`.
  - Conservar la lógica existente (lista desde `is_signed_in` + enriquecimiento con `getUsers()` + clasificación activo/inactivo).
  - _Requirements: 3.1, 3.2, 7.1, 7.2_

- [ ] 4. Verificación y no-regresión
- [x] 4.1 Build y revisión de tipos
  - `npm run build` sin errores.
  - _Requirements: 7.3_
- [ ] 4.2 Pruebas manuales con 2 dispositivos (logs `📡[PRESENCE][empleados]`)
  - Sin observador (Actividad cerrada en B): A no muestra refrescos recurrentes tras el join inicial, ni moviendo el mouse.
  - B abre Actividad: A empieza a refrescar (~60s); B ve activo/inactivo correcto; A quieto 3 min → inactivo.
  - B cierra Actividad: A deja de refrescar tras la ventana.
  - Online: B ve a A conectado aunque A no haya refrescado.
  - Transiciones: abrir/cerrar caja y recuperar red se reflejan.
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 4.3, 4.4, 5.1, 6.1, 6.2_
- [ ] 4.3 Medir consumo en Supabase
  - Reports → Realtime → Presence Events: con Actividad cerrada debe quedar plano tras el arranque; con Actividad abierta sube de forma acotada.
  - _Requirements: 5.1, 5.2_

## Notes

- El `track()` inicial en `start()` se mantiene a propósito: garantiza el Estado_Online y que el Emisor aparezca con su info apenas entra, sin esperar a un observador.
- Riesgo: si se elimina el heartbeat pero no se conecta bien la señal, los Emisores aparecerían siempre "inactivos" bajo observación. Lo cubre la prueba 4.2.
- No hay migraciones ni cambios de esquema. Los logs de diagnóstico de presencia se mantienen hasta validar; se quitan al documentar.
