import { useState, useEffect, useRef } from 'react';

/** Intervalo de sondeo periódico de `version.json` (60s). */
export const POLL_INTERVAL_MS = 60_000;

interface UseVersionCheckResult {
  /** true de forma persistente (latch) cuando el servidor tiene un buildId distinto. */
  updateAvailable: boolean;
  /** Último buildId observado del servidor (objetivo de la actualización). null si aún no se obtuvo. */
  latestBuildId: string | null;
}

interface VersionManifest {
  buildId: string;
}

/**
 * Detecta si hay una versión nueva desplegada comparando el `buildId` de
 * `/version.json` (servido sin caché) contra la constante `__BUILD_ID__`
 * horneada en el bundle. El estado es monotónico (latch): una vez detectada
 * la versión nueva, permanece activo hasta que la página se recarga.
 */
export const useVersionCheck = (): UseVersionCheckResult => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  // Último buildId visto del servidor: sirve como objetivo de la actualización
  // para el flush del SW en el componente. Se setea aunque coincida con el actual.
  const [latestBuildId, setLatestBuildId] = useState<string | null>(null);
  // Ref espejo del latch para evitar re-fetch innecesario una vez activado (Req 2.7).
  const updateAvailableRef = useRef(false);

  useEffect(() => {
    const checkVersion = async () => {
      // Latch ya activo: no hace falta seguir verificando (Req 2.7).
      if (updateAvailableRef.current) return;
      // Guard: sin conexión no se hace fetch (evita falsos negativos, Req 2.8).
      if (!navigator.onLine) return;

      try {
        const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return; // respuesta no ok: conservar estado (Req 2.8)

        const { buildId } = (await res.json()) as VersionManifest;
        if (!buildId) return; // JSON sin buildId: conservar estado (Req 2.8)

        // Guardar SIEMPRE el buildId observado (coincida o no). Al hacerlo antes
        // del latch, cuando se active updateAvailable el componente ya tendrá el
        // buildId objetivo para el flush del SW, aunque luego no volvamos a fetch.
        setLatestBuildId(buildId);

        if (buildId !== __BUILD_ID__) {
          updateAvailableRef.current = true;
          setUpdateAvailable(true); // latch, nunca vuelve a false (Req 2.5/2.7)
        }
      } catch {
        // Error de red / JSON inválido: no modificar el estado (Req 2.8).
      }
    };

    const handleFocus = () => {
      void checkVersion();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void checkVersion();
    };
    const handleOnline = () => {
      void checkVersion();
    };

    // Verificación inicial al montar (Req 2.1).
    void checkVersion();

    // Sondeo periódico cada 60s (Req 2.2).
    const id = setInterval(() => {
      void checkVersion();
    }, POLL_INTERVAL_MS);

    // Verificar al recuperar foco / visibilidad / reconexión (Req 2.3).
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      clearInterval(id);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  return { updateAvailable, latestBuildId };
};
