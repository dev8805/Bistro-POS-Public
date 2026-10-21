import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return '';
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function isRunningAsPwa(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return !!(standalone || iosStandalone);
}

interface State {
  supported: boolean;
  enabled: boolean;
  permission: NotificationPermission | 'unsupported';
  error: string | null;
}

/**
 * Suscribe al cliente a Web Push del soporte humano. Solo se activa cuando:
 *  - el navegador soporta SW + Push API + Notifications
 *  - la app está corriendo como PWA instalada (no en pestaña normal)
 *  - el usuario está logueado
 *  - VITE_VAPID_PUBLIC_KEY está configurada
 *
 * Garantiza aislamiento por usuario: si otro usuario inicia sesión en el mismo
 * dispositivo, el endpoint se reasigna en BD al nuevo usuario. Al hacer logout
 * se borra el endpoint de BD para que el dispositivo no reciba notificaciones
 * de sesiones ajenas.
 */
export function usePushSubscription() {
  const { user } = useAuth();
  const [state, setState] = useState<State>({
    supported: false,
    enabled: false,
    permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
    error: null,
  });

  // Rastrea el user.id para el que ya registramos el endpoint en esta sesión
  // de la pestaña. A diferencia del antiguo triedRef (bool), aquí comparamos
  // por ID: si cambia el usuario, el efecto vuelve a correr y reasigna el
  // endpoint en BD al nuevo usuario.
  const registeredUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Logout: eliminar la suscripción de BD para que este dispositivo no siga
    // recibiendo notificaciones del usuario anterior.
    if (!user) {
      if (registeredUserIdRef.current !== null) {
        registeredUserIdRef.current = null;
        setState(s => ({ ...s, enabled: false }));
        (async () => {
          try {
            if (!('serviceWorker' in navigator)) return;
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
              await supabase.rpc('release_push_subscription', { p_endpoint: sub.endpoint });
            }
          } catch { /* best-effort — si falla, la BD limpiará endpoints 410/404 al próximo envío */ }
        })();
      }
      return;
    }

    // Ya registrado para este usuario en esta pestaña — no repetir
    if (registeredUserIdRef.current === user.id) return;

    const browserSupports =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      typeof Notification !== 'undefined';

    if (!browserSupports) {
      setState(s => ({ ...s, supported: false, error: 'Browser sin soporte para Push' }));
      return;
    }

    if (!VAPID_PUBLIC_KEY) {
      setState(s => ({ ...s, supported: true, error: 'VAPID public key no configurada' }));
      return;
    }

    if (!isRunningAsPwa()) {
      setState(s => ({ ...s, supported: true, error: null }));
      return;
    }

    setState(s => ({ ...s, supported: true }));

    // Capturamos el userId para que la async no use un user.id desactualizado
    // si el efecto vuelve a correr antes de que termine.
    const userId = user.id;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;

        let permission = Notification.permission;
        if (permission === 'default') {
          permission = await Notification.requestPermission();
        }
        setState(s => ({ ...s, permission }));
        if (permission !== 'granted') return;

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
        }

        const endpoint = sub.endpoint;
        const p256dh = arrayBufferToBase64Url(sub.getKey('p256dh'));
        const auth = arrayBufferToBase64Url(sub.getKey('auth'));

        // Reclamar el endpoint vía RPC SECURITY DEFINER: si otro usuario tenía
        // este endpoint en BD, lo reasigna al usuario actual. No se puede hacer
        // con un upsert directo porque ON CONFLICT DO UPDATE exige visibilidad
        // SELECT de la fila ajena, y SELECT es own-only por privacidad.
        const { error } = await supabase.rpc('claim_push_subscription', {
          p_endpoint: endpoint,
          p_p256dh: p256dh,
          p_auth: auth,
          p_user_agent: navigator.userAgent.slice(0, 200),
        });

        if (error) {
          setState(s => ({ ...s, error: error.message }));
          return;
        }

        registeredUserIdRef.current = userId;
        setState(s => ({ ...s, enabled: true, error: null }));
      } catch (e) {
        console.error('usePushSubscription error', e);
        setState(s => ({ ...s, error: (e as Error).message }));
      }
    })();
  }, [user]);

  return state;
}
