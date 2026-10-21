# Design Document

## Overview

Modelo de presencia **on-demand**: el estado *online* (quién está conectado) se mantiene con el join del canal (barato, una vez por sesión), y el *refresco de actividad* (activo/inactivo) solo ocurre **mientras un observador tiene abierta la pantalla de Actividad**.

Mecanismo central: el **Observador** (pantalla de Actividad) emite una **señal de observación** (broadcast) periódica; los **Emisores**, al recibirla, re-publican su presencia (`track`) durante una ventana corta. Sin señal → sin re-publicaciones.

Idea en una frase: **nadie gasta presencia refrescando su actividad si no hay un administrador mirándola.**

Mapa de requisitos: Req 1 (online siempre), Req 2 (refresco solo bajo observación), Req 3 (señal del observador), Req 4 (precisión activo/inactivo), Req 5 (cero gasto sin observador), Req 6 (transiciones/reconexión), Req 7 (no-regresión).

## Architecture

### Antes (Opción B actual)

```
Cada Emisor (global, siempre):
  join + track inicial (online)
  heartbeat cada 2 min mientras activo+visible  ← gasto CONTINUO aunque nadie mire
```

### Después (on-demand)

```
Cada Emisor (global, siempre):
  join + track inicial (online)                 ← barato, 1 vez
  actividad real → marca last_activity_at LOCAL (sin publicar)
  recibe 'presence-watch' → track() (refresco)  ← SOLO cuando hay observador

Observador (solo con Pantalla_Actividad abierta):
  envía 'presence-watch' ahora + cada 60s        ← mientras observa
  al cerrar la pantalla → deja de enviar
```

## Components and Interfaces

### 1. `lib/presenceManager.ts` — núcleo del modelo

Constantes:
- `WATCH_PING_MS = 60_000` (cada cuánto el observador re-emite la señal).
- `WATCH_TTL_MS = 90_000` (cuánto dura la Ventana_Observacion tras la última señal; > ping para tolerar latencia).

Estado nuevo:
- `watchedUntil: number` (epoch ms hasta el cual el Emisor se considera observado).
- `watchPingTimer` (intervalo del Observador).

API nueva / cambios:
- `markActivity(partial?: Partial<PresencePayload>)`: actualiza `selfPayload.last_activity_at = now` (y `cash_shift_id` si viene) **en memoria, sin publicar**. Reemplaza el rol de `touch()` para la actividad ordinaria.
- En `start()`, además de los handlers `sync/join/leave`, suscribir un handler de broadcast:
  ```
  .on('broadcast', { event: 'presence-watch' }, () => {
      watchedUntil = Date.now() + WATCH_TTL_MS;
      if (navigator.onLine && selfPayload && !document.hidden) channel.track(selfPayload);
  })
  ```
  Es decir: al recibir la señal, el Emisor renueva su ventana y publica su presencia actual (con su `last_activity_at` real).
- `setObserving(observing: boolean)`: lo usa el Observador.
  - `true`: envía un broadcast `presence-watch` inmediato y arma `watchPingTimer` cada `WATCH_PING_MS`.
  - `false`: limpia `watchPingTimer` (deja de pedir refrescos).
- `isBeingWatched(): boolean`: `Date.now() < watchedUntil` (lo consulta el Emisor para decidir si publica en transiciones/heartbeat opcional).
- `touch()` se conserva **solo para transiciones significativas** (caja) y `retrack()` para reconexión — publican de inmediato (son infrecuentes).
- `stop()` limpia también `watchPingTimer` y `watchedUntil`.

> Nota: el `track()` inicial en `start()` se mantiene para que el Emisor aparezca con su info (online) apenas entra, sin esperar a un observador.

### 2. `hooks/usePresenceBroadcast.ts` — Emisor

- Mantiene el `start()` inicial (online).
- Listeners de input (`mousemove`, `keydown`, `touchstart`) → llaman a `presenceManager.markActivity({ cash_shift_id })` (solo memoria, sin red). Se puede dejar sin throttle pesado porque ya no publica.
- **Elimina el heartbeat de 2 min**: el refresco ahora lo dispara la señal del observador dentro de `presenceManager`.
- `visibilitychange`: al ocultarse no se publica (el handler de broadcast ya verifica `document.hidden`); al volver al frente, `markActivity()` para reflejar actividad reciente.
- `online`: `presenceManager.retrack()` (reconexión, Req 6.2).
- Cambio de `cashShiftId`: `presenceManager.touch({ cash_shift_id })` (transición, Req 6.1).

### 3. `hooks/useEmployeePresence.ts` — Observador

- En un `useEffect`, al montar (la pantalla de Actividad está abierta): `presenceManager.setObserving(true)`; al desmontar: `presenceManager.setObserving(false)`.
- El resto (leer `getUsers()`, cruzar con `profiles.is_signed_in`, clasificar activo/inactivo) se conserva igual (Req 7).

## Data Models

Sin cambios de esquema ni migraciones. Se reutiliza el `PresencePayload` existente. La Senal_Observacion es un broadcast efímero (`event: 'presence-watch'`, sin payload relevante) sobre el `Canal_Presencia`.

## Error Handling

| Situación | Comportamiento |
|-----------|----------------|
| Observador abre Actividad pero algún Emisor aún no había publicado actividad | La primera Senal_Observacion dispara `track()` en todos → el Observador ve el estado real en ~1s |
| Pestaña del Emisor oculta al llegar la señal | El handler verifica `document.hidden` y no publica (Req 4.4) |
| Se cae la conexión del Observador | Deja de emitir señales → los Emisores salen de su Ventana_Observacion solos (TTL) |
| Reconexión del Canal_Presencia (CHANNEL_ERROR→SUBSCRIBED) | `start()`/`retrack()` re-publican el online; si hay observador, la próxima señal refresca actividad |
| Dos observadores a la vez | Ambos emiten señales; los Emisores solo renuevan `watchedUntil` (idempotente) |

## Testing Strategy

Pruebas manuales con 2 dispositivos (A = empleado/Emisor, B = admin/Observador), usando los logs `📡[PRESENCE][empleados]`:

1. **Cero gasto sin observador (Req 5):** A abierto, B sin abrir Actividad → en A NO debe aparecer ningún `track()`/refresco recurrente tras el join inicial (ni moviendo el mouse).
2. **Refresco bajo observación (Req 2, 3):** B abre Actividad → en A empiezan a aparecer refrescos (~cada 60s) mientras B siga en la pantalla.
3. **Corte al cerrar (Req 2.3):** B sale de Actividad → en A los refrescos se detienen tras la Ventana_Observacion.
4. **Precisión activo/inactivo (Req 4):** con B observando, mover el mouse en A → B lo ve activo; dejar A quieto 3 min → B lo ve inactivo.
5. **Online siempre (Req 1):** B abre Actividad y ve a A como conectado aunque A no haya refrescado (lista desde `is_signed_in` + join).
6. **Transiciones (Req 6):** abrir/cerrar caja en A se refleja; recuperar red re-publica.
7. **Build:** `npm run build` sin errores.
8. **Consumo (objetivo):** en Reports → Realtime → Presence Events, comparar con la app abierta y Actividad cerrada (debe quedar plano tras el arranque) vs Actividad abierta.

## Correctness Properties

### Property 1: Online independiente del observador
El Estado_Online de un Emisor (su pertenencia al Canal_Presencia) no depende de que exista un Observador; se establece en el join inicial y se mantiene mientras la app esté abierta y con conexión.
**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Refresco solo bajo observación
Un Emisor ejecuta Refresco_Actividad si y solo si está dentro de una Ventana_Observacion (recibió una Senal_Observacion dentro de WATCH_TTL_MS) y su pestaña está visible.
**Validates: Requirements 2.1, 2.2, 2.3, 4.4**

### Property 3: Cero recurrencia sin observador
Si ningún Observador emite Senal_Observacion, el Canal_Presencia no recibe ningún Refresco_Actividad; solo eventos de join/leave y transiciones significativas.
**Validates: Requirements 5.1, 5.2**

### Property 4: Actividad real
El valor de `last_activity_at` publicado en un Refresco_Actividad refleja la última interacción real del usuario (Actividad_Local), no el instante del refresco.
**Validates: Requirements 4.1, 4.2, 4.3**

### Property 5: No-regresión de Actividad
La lista de empleados conectados se deriva de `profiles.is_signed_in` y se enriquece con presencia; el comportamiento observable de la pantalla de Actividad no cambia respecto al estado previo.
**Validates: Requirements 7.1, 7.2, 7.3**
