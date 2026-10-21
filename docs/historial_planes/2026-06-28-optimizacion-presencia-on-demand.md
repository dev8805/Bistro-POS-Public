# Optimización de Presencia — modelo on-demand — 2026-06-28

Referencia: [`docs/arquitectura/consumo_realtime.md`](../arquitectura/consumo_realtime.md).
Spec: [`.kiro/specs/presencia-on-demand/`](../../.kiro/specs/presencia-on-demand/).

Reduce el gasto continuo de presencia del canal `presence:business-X` (que alimenta la pantalla de Actividad). Antes, cada usuario re-publicaba su presencia de forma periódica (heartbeat) solo por tener la app abierta, aunque **nadie** estuviera mirando la pantalla de Actividad. Se aplicó el modelo "on-demand" que usan las grandes plataformas (LinkedIn/Slack/Discord).

---

## Evolución

1. **Antes:** `track()` en cada `mousemove`/`keydown` (throttle 30s) → cada uno generaba join+leave+sync (3 eventos). Gasto continuo con cualquier movimiento del mouse.
2. **Opción B (paso intermedio):** heartbeat cada 2 min solo si activo+visible. Mejor, pero seguía siendo gasto continuo aunque nadie observara.
3. **On-demand (actual):** el refresco solo ocurre **mientras un observador (pantalla de Actividad) lo pide**.

## Cambios aplicados

### `lib/presenceManager.ts`
- `markActivity()`: actualiza `last_activity_at` en memoria, **sin publicar**.
- Handler de broadcast `presence-watch`: al recibir la señal, renueva la ventana de observación (`WATCH_TTL_MS = 90s`) y hace `track()` solo si está online y visible.
- `setObserving(true/false)`: el observador emite la señal `presence-watch` de inmediato y cada `WATCH_PING_MS = 60s` mientras observa.
- `isBeingWatched()`; `touch()`/`retrack()` quedan solo para transiciones (caja) y reconexión; `stop()` limpia el timer.

### `hooks/usePresenceBroadcast.ts`
- Se eliminó el heartbeat de 2 min. La interacción solo llama `markActivity()` (local). Cambio de caja → `touch()` (omitiendo el primer render). `online` → `retrack()`.

### `hooks/useEmployeePresence.ts`
- `setObserving(true)` al montar la pantalla de Actividad, `false` al desmontar.

---

## Resultado

- **Sin nadie en la pantalla de Actividad:** tras el join inicial, **cero refrescos** de presencia (ni moviendo el mouse).
- **Con un admin en Actividad:** los dispositivos refrescan ~cada 60s mientras observa; activo/inactivo en vivo. Al cerrar, se detiene.
- **Online** (quién está conectado) sigue disponible (join + 1 track inicial).

## Optimización PENDIENTE (decisión consciente)

Hoy, al entrar, cada dispositivo aún hace **un `track` inicial** para aparecer online (≈4 eventos una sola vez por conexión, aunque nadie observe). Se evaluó diferirlo (suscribir sin `track`; anunciar solo bajo observación) para lograr **cero presencia con Actividad cerrada**, pero se dejó **pendiente** porque introduce un retraso de ~1s en el enriquecimiento al abrir Actividad y se desvía del Requisito 1 del spec. Detalle en [`consumo_realtime.md` → Optimizaciones pendientes](../arquitectura/consumo_realtime.md#optimizaciones-pendientes).

## Verificación
- `npm run build`: exitoso (exit 0). `getDiagnostics` limpio.
- Logs de diagnóstico `📡[PRESENCE][empleados]` **removidos** de `presenceManager.ts` tras validar el comportamiento.
- Pendiente de medición en Reports → Realtime → Presence Events (debe quedar plano con Actividad cerrada).
