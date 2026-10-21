/**
 * deviceInfo
 *
 * Utilidades para identificar el dispositivo del cliente (web/PWA/Capacitor).
 *
 * Lo que SÍ se puede obtener del navegador (sin invasividad ni fingerprinting):
 *  - Sistema operativo (Windows, macOS, Android, iOS, Linux) desde `navigator.userAgent`.
 *  - Tipo de dispositivo (desktop/tablet/mobile) derivado del userAgent.
 *  - Navegador (Chrome, Safari, Firefox, Edge, Samsung Internet).
 *  - Si la app corre en Capacitor (Android nativo).
 *
 * Lo que NO se puede obtener (privacidad de la plataforma web):
 *  - Nombre del equipo del usuario (ej. "MacBook de Carlos") — el OS no lo expone.
 *  - Hostname, número de serie, marca/modelo exactos.
 *
 * Por eso el "label visible" se compone así:
 *   1. Si el admin renombró el dispositivo en `business_devices` → usa el alias.
 *   2. Si no → usa el `defaultLabel` derivado del userAgent (ej. "Chrome en Windows").
 */

const DEVICE_ID_STORAGE_KEY = 'bistro_device_id';

export type DeviceType = 'desktop' | 'tablet' | 'mobile';

export interface DeviceInfo {
    /** UUID persistente por navegador, generado la primera vez. */
    deviceId: string;
    /** Etiqueta visible cuando no hay alias en BD. Ej: "Chrome en Windows". */
    defaultLabel: string;
    type: DeviceType;
    os: string;
    browser: string;
    /** True si la app corre dentro de Capacitor (Android nativo de Bistro). */
    isCapacitor: boolean;
}

const generateUuid = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

/** Devuelve el `device_id` persistente del navegador actual; lo crea si no existe. */
export const getOrCreateDeviceId = (): string => {
    try {
        let id = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
        if (!id) {
            id = generateUuid();
            localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
        }
        return id;
    } catch {
        // Modo privado o storage bloqueado: id no persistente.
        return generateUuid();
    }
};

interface ParsedUA {
    os: string;
    browser: string;
    type: DeviceType;
}

const parseUserAgent = (ua: string): ParsedUA => {
    const isAndroid = /Android/i.test(ua);
    const isIOSPhone = /iPhone|iPod/i.test(ua);
    const isIPad = /iPad/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua));
    const isIOS = isIOSPhone || isIPad;
    const isMac = /Macintosh|Mac OS X/i.test(ua) && !isIOS;
    const isWindows = /Windows/i.test(ua);
    const isLinux = /Linux/i.test(ua) && !isAndroid;

    let os = 'desconocido';
    if (isAndroid) os = 'Android';
    else if (isIPad) os = 'iPadOS';
    else if (isIOSPhone) os = 'iOS';
    else if (isMac) os = 'macOS';
    else if (isWindows) os = 'Windows';
    else if (isLinux) os = 'Linux';

    let browser = 'Navegador';
    if (/Edg\//i.test(ua)) browser = 'Edge';
    else if (/SamsungBrowser/i.test(ua)) browser = 'Samsung Internet';
    else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
    else if (/Chrome\//i.test(ua) && !/Edg/.test(ua)) browser = 'Chrome';
    else if (/Firefox/i.test(ua)) browser = 'Firefox';
    else if (/Safari/i.test(ua) && !/Chrome|Chromium/i.test(ua)) browser = 'Safari';

    let type: DeviceType = 'desktop';
    if (isIPad || (isAndroid && !/Mobile/i.test(ua))) type = 'tablet';
    else if (isIOSPhone || isAndroid || /Mobile/i.test(ua)) type = 'mobile';

    return { os, browser, type };
};

/** Deriva la etiqueta por defecto a partir de un userAgent (ej. "Chrome en Windows"). */
export const deriveDefaultLabelFromUA = (userAgent: string): string => {
    const { os, browser } = parseUserAgent(userAgent);
    return `${browser} en ${os}`;
};

/** Deriva el tipo de dispositivo (desktop/tablet/mobile) desde un userAgent. */
export const deriveDeviceTypeFromUA = (userAgent: string): DeviceType => {
    return parseUserAgent(userAgent).type;
};

const isCapacitorEnv = (): boolean => {
    try {
        return !!(window as any).Capacitor?.isNativePlatform?.();
    } catch {
        return false;
    }
};

/** Información completa del dispositivo actual (este navegador/PWA/app). */
export const getDeviceInfo = (): DeviceInfo => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const { os, browser, type } = parseUserAgent(ua);
    const capacitor = isCapacitorEnv();
    const defaultLabel = capacitor ? `App Bistro · ${os}` : `${browser} en ${os}`;
    return {
        deviceId: getOrCreateDeviceId(),
        defaultLabel,
        type,
        os,
        browser,
        isCapacitor: capacitor,
    };
};

export const getDeviceTypeIcon = (type: DeviceType): string => {
    switch (type) {
        case 'desktop': return 'computer';
        case 'tablet': return 'tablet';
        case 'mobile': return 'smartphone';
    }
};

export const getDeviceTypeLabel = (type: DeviceType): string => {
    switch (type) {
        case 'desktop': return 'Escritorio';
        case 'tablet': return 'Tablet';
        case 'mobile': return 'Móvil';
    }
};
