/**
 * Logger condicional - Solo muestra logs en desarrollo
 * Elimina overhead de console.log en producción
 */

const isLocalhost = 
    typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || 
     window.location.hostname === '127.0.0.1' || 
     window.location.hostname.startsWith('192.168.') ||
     window.location.hostname.startsWith('10.'));

// Se imprimen únicamente si estás en modo desarrollo DE VITE o bajo un dominio de servidor local.
const isDev = Boolean(import.meta.env?.DEV) && isLocalhost;

export const logger = {
    log: (...args: unknown[]) => {
        if (isDev) console.log(...args);
    },

    warn: (...args: unknown[]) => {
        if (isDev) console.warn(...args);
    },

    error: (...args: unknown[]) => {
        // Errores siempre se muestran (útiles para debugging en producción)
        console.error(...args);
    },

    debug: (...args: unknown[]) => {
        if (isDev) console.debug(...args);
    },

    // Para grupos de logs relacionados
    group: (label: string) => {
        if (isDev) console.group(label);
    },

    groupEnd: () => {
        if (isDev) console.groupEnd();
    },

    // Para medir tiempos
    time: (label: string) => {
        if (isDev) console.time(label);
    },

    timeEnd: (label: string) => {
        if (isDev) console.timeEnd(label);
    }
};

// Alias para compatibilidad
export default logger;
