/**
 * presenceManager — canal de presencia singleton por negocio (modelo on-demand).
 *
 * Problema que resuelve: Supabase Realtime no permite dos suscripciones al
 * mismo topic en el mismo cliente. Si el emisor (usePresenceBroadcast) y el
 * observador (useEmployeePresence) crean cada uno su propio
 * `supabase.channel('presence:business-X')`, la segunda suscripción falla y el
 * observador nunca recibe el estado. Por eso ambos comparten ESTE canal único.
 *
 * Modelo on-demand: el "online" se establece con el join + un track inicial. El
 * REFRESCO de actividad (activo/inactivo) NO se publica de forma continua: la
 * interacción del usuario solo actualiza `last_activity_at` en memoria
 * (`markActivity`), y la publicación (`track`) la dispara la señal de
 * observación (`presence-watch`) que envía la pantalla de Actividad
 * (`setObserving`). Cuando nadie observa, no hay gasto recurrente de presencia.
 *
 * - `start()` lo usa el emisor: une el canal (una vez) y publica su payload.
 * - `markActivity()` actualiza la actividad propia en memoria (sin publicar).
 * - `touch()` re-publica por transición significativa (caja). `retrack()` por red.
 * - `setObserving()` lo usa el observador para pedir refrescos mientras observa.
 * - `onChange()` + `getUsers()` los usa el observador para leer el estado.
 */

import { supabase } from './supabase';

export interface PresencePayload {
    user_id: string;
    user_name: string;
    user_role: string;
    device_id: string;
    device_label: string;
    device_type: string;
    login_at: string;
    last_activity_at: string;
    cash_shift_id: string | null;
}

let channel: ReturnType<typeof supabase.channel> | null = null;
let topic: string | null = null;
let selfPayload: PresencePayload | null = null;
let state: Record<string, PresencePayload> = {};
const listeners = new Set<() => void>();

// Suscriptores a la señal de recarga tras la sincronización del Eje
// (evento broadcast `eje-sync-completed`). Se reutiliza el canal de presencia
// existente para no crear una suscripción nueva (Req 17.1).
const ejeSyncListeners = new Set<() => void>();

// Modelo on-demand: el refresco de actividad solo ocurre mientras un OBSERVADOR
// (pantalla de Actividad) emite señales. Sin señal → sin re-publicaciones.
const WATCH_PING_MS = 60_000;   // cada cuánto el observador re-emite la señal
const WATCH_TTL_MS = 90_000;    // duración de la ventana de observación tras la última señal
let watchedUntil = 0;           // epoch ms hasta el cual este emisor se considera observado
let watchPingTimer: ReturnType<typeof setInterval> | null = null; // intervalo del observador

const notify = () => listeners.forEach(l => l());

const recompute = () => {
    if (!channel) { state = {}; notify(); return; }
    const raw = channel.presenceState<PresencePayload>();
    const map: Record<string, PresencePayload> = {};
    Object.values(raw).forEach((arr: any[]) => {
        arr.forEach((p: any) => { if (p?.user_id) map[p.user_id] = p as PresencePayload; });
    });
    state = map;
    notify();
};

export const presenceManager = {
    /** Une el canal del negocio (una vez) y publica el payload del usuario actual. */
    start(businessId: string, payload: PresencePayload) {
        const newTopic = `presence:business-${businessId}`;
        selfPayload = payload;

        // Ya unido al mismo topic: solo re-publicar el payload más reciente.
        if (channel && topic === newTopic) {
            if (navigator.onLine) channel.track(selfPayload);
            return;
        }

        // Cambió de negocio o primera vez: limpiar canal anterior.
        if (channel) {
            try { channel.untrack(); supabase.removeChannel(channel); } catch { /* no-op */ }
            channel = null;
        }

        topic = newTopic;
        channel = supabase.channel(newTopic, { config: { presence: { key: payload.user_id } } });
        channel
            .on('presence', { event: 'sync' }, recompute)
            .on('presence', { event: 'join' }, recompute)
            .on('presence', { event: 'leave' }, recompute)
            // Señal de observación: un observador (pantalla de Actividad) pide refrescos.
            // Al recibirla, renovamos la ventana y publicamos nuestra presencia actual
            // (con el last_activity_at REAL). Sin esta señal no re-publicamos nada.
            .on('broadcast', { event: 'presence-watch' }, () => {
                watchedUntil = Date.now() + WATCH_TTL_MS;
                if (navigator.onLine && selfPayload && !document.hidden) {
                    channel!.track(selfPayload);
                }
            })
            // Señal de recarga del Eje (Req 17.1): al terminar de sincronizar sus
            // mesas, el Eje emite `eje-sync-completed`. Los observadores conectados
            // la reciben aquí y disparan el modal de recarga (task 15). El emisor no
            // recibe su propio broadcast, y además el Eje nunca recarga (Req 17.4).
            .on('broadcast', { event: 'eje-sync-completed' }, () => {
                ejeSyncListeners.forEach(l => l());
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED' && navigator.onLine && selfPayload) {
                    await channel!.track(selfPayload);
                }
            });
    },

    /**
     * Actualiza la actividad propia EN MEMORIA, sin publicar. La publicación
     * (refresco) la dispara la señal de observación. Reemplaza a `touch()` para
     * la actividad ordinaria del usuario.
     */
    markActivity(partial?: Partial<PresencePayload>) {
        if (!selfPayload) return;
        selfPayload = { ...selfPayload, ...partial, last_activity_at: new Date().toISOString() };
    },

    /** Re-publica por transición significativa (ej. caja abierta/cerrada). */
    touch(partial: Partial<PresencePayload>) {
        if (!channel || !selfPayload) return;
        selfPayload = { ...selfPayload, ...partial, last_activity_at: new Date().toISOString() };
        if (navigator.onLine) channel.track(selfPayload);
    },

    /** Re-publica el payload actual (ej. al recuperar la red). */
    retrack() {
        if (channel && selfPayload && navigator.onLine) channel.track(selfPayload);
    },

    /**
     * Observador (pantalla de Actividad): activa/desactiva el envío periódico de
     * la señal `presence-watch`. Mientras está activo, los emisores refrescan su
     * presencia; al desactivarlo, dejan de hacerlo (salen de su ventana por TTL).
     */
    setObserving(observing: boolean) {
        if (observing) {
            if (!channel) return;
            const ping = () => {
                if (channel && navigator.onLine) {
                    channel.send({ type: 'broadcast', event: 'presence-watch', payload: {} });
                }
            };
            ping(); // inmediato al abrir Actividad
            if (watchPingTimer) clearInterval(watchPingTimer);
            watchPingTimer = setInterval(ping, WATCH_PING_MS);
        } else {
            if (watchPingTimer) { clearInterval(watchPingTimer); watchPingTimer = null; }
        }
    },

    /** ¿Este emisor está dentro de una ventana de observación? */
    isBeingWatched(): boolean {
        return Date.now() < watchedUntil;
    },

    /**
     * Eje: emite el broadcast `eje-sync-completed` en el canal de presencia
     * existente para avisar a los observadores conectados que ya subió todas sus
     * mesas (Req 17.1). No crea suscripción nueva: reutiliza este canal.
     */
    broadcastEjeSyncCompleted() {
        if (channel && navigator.onLine) {
            channel.send({ type: 'broadcast', event: 'eje-sync-completed', payload: {} });
        }
    },

    /**
     * Observador: se suscribe a la señal de recarga del Eje. Devuelve la función
     * de limpieza para eliminar el listener (sin listeners huérfanos).
     */
    onEjeSyncCompleted(cb: () => void): () => void {
        ejeSyncListeners.add(cb);
        return () => { ejeSyncListeners.delete(cb); };
    },

    onChange(cb: () => void): () => void {
        listeners.add(cb);
        return () => { listeners.delete(cb); };
    },

    getUsers(): Record<string, PresencePayload> {
        return state;
    },

    stop() {
        if (watchPingTimer) { clearInterval(watchPingTimer); watchPingTimer = null; }
        watchedUntil = 0;
        if (channel) {
            try { channel.untrack(); supabase.removeChannel(channel); } catch { /* no-op */ }
        }
        channel = null;
        topic = null;
        selfPayload = null;
        state = {};
        notify();
    },
};
