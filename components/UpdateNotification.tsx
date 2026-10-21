import { useEffect, useState } from 'react';
import { useVersionCheck } from '../hooks/useVersionCheck';

/**
 * Aplica la actualización sacando al Service Worker del medio ANTES de recargar.
 *
 * POR QUÉ no basta un `window.location.reload()` normal: esta PWA usa Workbox y
 * el SW sirve `index.html` y el JS desde su PRECACHE (CacheFirst) antes de tocar
 * la red o el cache HTTP. Tras una recarga normal el bundle sigue trayendo el
 * `__BUILD_ID__` viejo mientras `/version.json` (NetworkOnly) ya devuelve el
 * nuevo, así que la notificación reaparece en bucle. Las cabeceras `no-store` de
 * Firebase no aplican cuando el SW intercepta la navegación. Por eso, al APLICAR
 * la actualización desregistramos el SW y vaciamos Cache Storage: así la recarga
 * trae el shell nuevo desde la red y el bucle se corta.
 *
 * NO se toca IndexedDB ni localStorage: la cola offline debe quedar intacta.
 */
const flushAndReload = async (targetBuildId?: string | null) => {
  try {
    // Guard anti-loop: registrar a qué buildId intentamos actualizar y cuándo.
    if (targetBuildId) {
      sessionStorage.setItem('bistro:swFlushTo', targetBuildId);
      sessionStorage.setItem('bistro:swFlushAt', String(Date.now()));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    try {
      await fetch('/manifest.json', { cache: 'reload' });
    } catch {
      // no-op
    }
  } catch (e) {
    console.warn('[PWA] flush falló, se recarga igual', e);
  } finally {
    window.location.reload();
  }
};

interface UpdateNotificationProps {
  /** Estado de conectividad del usuario. */
  isOnline: boolean;
  /** Transacciones en cola offline aún sin subir. */
  pendingCount: number;
  /** Transacciones que fallaron el último intento de sync. */
  failedCount: number;
  /** Sync activa en este momento. */
  isSyncing: boolean;
  /**
   * Modo silencioso (pantallas previas al login): NO muestra la notificación.
   * Cuando detecta una versión nueva y hay conexión, la aplica recargando
   * automáticamente. Sin sesión no hay cola offline que proteger, así que es
   * seguro recargar.
   */
  silent?: boolean;
}

/**
 * Ayuda de recarga cuando hay una versión nueva desplegada. La detección la
 * provee `useVersionCheck` (compara `/version.json` contra `__BUILD_ID__`), no
 * el Service Worker. Al aplicar la actualización se usa `flushAndReload`, que
 * desregistra el SW y vacía Cache Storage antes de recargar (ver comentario de
 * esa función): un reload normal no basta porque el SW sirve el shell viejo del
 * precache y la notificación reaparece en bucle. IndexedDB y la cola offline
 * quedan intactos.
 */
export const UpdateNotification = ({
  isOnline,
  pendingCount,
  failedCount,
  isSyncing,
  silent = false,
}: UpdateNotificationProps) => {
  const { updateAvailable, latestBuildId } = useVersionCheck();

  // Descarte por sesión de página (Opción A): se restablece solo al recargar.
  // No reaparece esta sesión aunque llegue otro buildId (Req 3.3/3.4/3.5).
  const [dismissed, setDismissed] = useState(false);

  // Estado derivado (sin useEffect): guard de la cola offline (Req 4).
  const colaLimpia = pendingCount === 0 && failedCount === 0 && !isSyncing;
  const puedeActualizar = isOnline && colaLimpia;
  const visible =
    updateAvailable && !dismissed && !silent && colaLimpia && isOnline; // (Req 3.1)

  // Modo silencioso (pre-login): al detectar versión nueva con conexión,
  // aplicar recargando (con flush del SW) sin mostrar UI. Guardado por isOnline:
  // al reconectar se re-evalúa y aplica la versión pospuesta (Req 6.2/6.3/6.4).
  useEffect(() => {
    if (!(silent && updateAvailable && isOnline)) return;
    // Guard: si ya intentamos actualizar a ESTE mismo buildId hace <30s, no reintentar
    // automáticamente (evita loop de recargas si el CDN aún propaga la versión).
    const flushedTo = sessionStorage.getItem('bistro:swFlushTo');
    const flushedAt = Number(sessionStorage.getItem('bistro:swFlushAt') || '0');
    const reciente = Date.now() - flushedAt < 30_000;
    if (flushedTo && flushedTo === latestBuildId && reciente) return;
    void flushAndReload(latestBuildId);
  }, [silent, updateAvailable, isOnline, latestBuildId]);

  const handleDismiss = () => setDismissed(true); // (Req 3.3/3.4)
  const handleUpdate = () => {
    if (puedeActualizar) void flushAndReload(latestBuildId); // (Req 3.2, guard Req 4.1/4.3)
  };

  if (silent) return null; // (Req 6.1)
  if (!visible) return null;

  return (
    <div className="fixed bottom-24 md:bottom-6 inset-x-4 mx-auto z-[9999] max-w-[360px] animate-slideInUpSubtle">
      <div className="bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-300 p-3 sm:p-4 flex items-start gap-3">

        {/* Ícono */}
        <div className="bg-slate-100 rounded-full size-8 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-slate-500 text-[18px]">info</span>
        </div>

        {/* Contenido principal */}
        <div className="flex-1 min-w-0">
          <h3 className="text-slate-900 font-semibold text-[13px] sm:text-[14px] leading-tight">
            Hay una nueva versión
          </h3>
          <p className="text-slate-500 text-[12px] sm:text-[13px] mt-0.5 leading-snug">
            {puedeActualizar
              ? 'Recarga para ver los últimos cambios.'
              : 'Sincronizando datos… podrás actualizar en un momento.'}
          </p>

          {/* Fila de botones */}
          <div className="flex justify-end items-center gap-2 mt-2.5">
            <button
              onClick={handleDismiss}
              aria-label="Descartar aviso de nueva versión"
              className="text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-[12px] sm:text-[13px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              Ahora no
            </button>
            <button
              onClick={handleUpdate}
              disabled={!puedeActualizar}
              aria-disabled={!puedeActualizar}
              aria-label="Actualizar a la nueva versión"
              title={puedeActualizar ? 'Actualizar ahora' : 'Esperando fin de sincronización'}
              className="bg-[#009459] hover:bg-[#007b4a] text-white text-[12px] sm:text-[13px] font-semibold px-3.5 py-1.5 rounded-lg shadow-sm transition-all hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:bg-slate-300 disabled:hover:bg-slate-300 disabled:cursor-not-allowed disabled:shadow-none"
            >
              Actualizar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
