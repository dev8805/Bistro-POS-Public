/**
 * lib/printerRegistry.ts
 *
 * Módulo de lógica pura para la gestión de varias impresoras registradas y la
 * impresora predeterminada por rol (TICKET / COMANDA). No depende de QZ_Tray ni
 * del DOM. Esta primera entrega define únicamente los tipos, el modelo de
 * configuración y las claves de Almacenamiento_Local; las funciones puras y de
 * acceso a `localStorage` se implementan en tareas posteriores (2.2, 3.1, 4.1).
 */

// ---- Tipos del dominio ----

/** Clasificación del documento a imprimir. */
export type RolImpresion = 'TICKET' | 'COMANDA';

/** Estado físico/lógico de una impresora reportado por el Servicio_Impresión. */
export type EstadoConexion = 'disconnected' | 'connecting' | 'connected' | 'unknown';

/** Impresora que el usuario agregó explícitamente a la lista persistente. */
export interface ImpresoraRegistrada {
    name: string;       // identificador único (nombre que reporta QZ_Tray)
    addedAt: string;    // ISO timestamp del alta
}

/** Configuración completa de impresoras: lista + predeterminadas por rol. */
export interface ConfiguracionImpresoras {
    printers: ImpresoraRegistrada[];
    defaultTicket: string | null;   // name de una impresora de la lista, o null
    defaultComanda: string | null;  // name de una impresora de la lista, o null
}

// ---- Claves de Almacenamiento_Local ----

export const STORAGE_KEY_LIST = 'bistro_printers_list';
export const STORAGE_KEY_DEFAULT_TICKET = 'bistro_default_ticket';
export const STORAGE_KEY_DEFAULT_COMANDA = 'bistro_default_comanda';
export const LEGACY_STORAGE_KEY = 'bistro_thermal_printer';

// ---- Lógica pura de lista y predeterminadas (sin efectos) ----

/**
 * Añade una impresora a la lista evitando duplicados por nombre.
 *
 * Es PURA: no muta el `config` de entrada; devuelve una nueva
 * `ConfiguracionImpresoras`. Si ya existe una impresora con ese nombre, no la
 * duplica y devuelve `alreadyExisted: true` conservando la config sin cambios.
 *
 * @param config configuración actual (no se muta)
 * @param name nombre de la impresora (identificador único reportado por QZ_Tray)
 * @param addedAt ISO timestamp del alta; por defecto el momento actual
 */
export const addPrinter = (
    config: ConfiguracionImpresoras,
    name: string,
    addedAt?: string,
): { config: ConfiguracionImpresoras; alreadyExisted: boolean } => {
    const alreadyExisted = config.printers.some((printer) => printer.name === name);

    if (alreadyExisted) {
        return { config, alreadyExisted: true };
    }

    const nueva: ImpresoraRegistrada = {
        name,
        addedAt: addedAt ?? new Date().toISOString(),
    };

    return {
        config: {
            ...config,
            printers: [...config.printers, nueva],
        },
        alreadyExisted: false,
    };
};

/**
 * Quita una impresora de la lista por nombre y limpia (pone a `null`) las
 * predeterminadas que la referencian.
 *
 * Es PURA: no muta el `config` de entrada; devuelve una nueva
 * `ConfiguracionImpresoras`.
 *
 * @param config configuración actual (no se muta)
 * @param name nombre de la impresora a eliminar
 */
export const removePrinter = (
    config: ConfiguracionImpresoras,
    name: string,
): ConfiguracionImpresoras => {
    return {
        printers: config.printers.filter((printer) => printer.name !== name),
        defaultTicket: config.defaultTicket === name ? null : config.defaultTicket,
        defaultComanda: config.defaultComanda === name ? null : config.defaultComanda,
    };
};

/**
 * Asigna la impresora predeterminada del rol indicado sin tocar el otro rol.
 * `name` puede ser `null` para dejar el rol sin asignar.
 *
 * Es PURA: no muta el `config` de entrada; devuelve una nueva
 * `ConfiguracionImpresoras`.
 *
 * @param config configuración actual (no se muta)
 * @param role rol cuya predeterminada se asigna (`TICKET` o `COMANDA`)
 * @param name nombre de la impresora a fijar como predeterminada, o `null`
 */
export const setDefault = (
    config: ConfiguracionImpresoras,
    role: RolImpresion,
    name: string | null,
): ConfiguracionImpresoras => {
    if (role === 'TICKET') {
        return { ...config, defaultTicket: name };
    }

    return { ...config, defaultComanda: name };
};

/**
 * Devuelve el `name` de la impresora predeterminada del rol indicado, o `null`
 * si ese rol no tiene impresora asignada.
 *
 * @param config configuración actual
 * @param role rol a consultar (`TICKET` o `COMANDA`)
 */
export const getDefaultForRole = (
    config: ConfiguracionImpresoras,
    role: RolImpresion,
): string | null => {
    return role === 'TICKET' ? config.defaultTicket : config.defaultComanda;
};

// ---- Validación, parseo, migración y agregación de estado (sin efectos) ----

/**
 * Normaliza una configuración invalidando (poniendo a `null`) las
 * predeterminadas que NO referencian una impresora existente en
 * `config.printers`. Conserva las predeterminadas que sí apuntan a una
 * impresora de la lista.
 *
 * Es PURA: no muta el `config` de entrada; devuelve una nueva
 * `ConfiguracionImpresoras`. Cubre el Req 3.7 (invalidar predeterminadas
 * colgantes tras cargar datos guardados).
 *
 * @param config configuración a validar (no se muta)
 */
export const validateConfig = (config: ConfiguracionImpresoras): ConfiguracionImpresoras => {
    const existe = (name: string | null): boolean =>
        name !== null && config.printers.some((printer) => printer.name === name);

    return {
        printers: config.printers,
        defaultTicket: existe(config.defaultTicket) ? config.defaultTicket : null,
        defaultComanda: existe(config.defaultComanda) ? config.defaultComanda : null,
    };
};

/**
 * Comprueba que un valor desconocido tenga la forma de `ImpresoraRegistrada`
 * válida: `name` string no vacío y `addedAt` string.
 */
const esImpresoraValida = (value: unknown): value is ImpresoraRegistrada => {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidata = value as Record<string, unknown>;

    return (
        typeof candidata.name === 'string' &&
        candidata.name.length > 0 &&
        typeof candidata.addedAt === 'string'
    );
};

/**
 * Parsea de forma segura la lista almacenada (JSON) de impresoras registradas.
 *
 * Ante cualquier entrada problemática (—`null`, JSON inválido, valor que no es
 * un array, o elementos con forma incorrecta—) devuelve `[]` SIN LANZAR.
 * Solo conserva los elementos que son una `ImpresoraRegistrada` válida.
 * Cubre el Req 3.6 (datos ausentes/corruptos → lista vacía sin interrumpir).
 *
 * Es PURA: no tiene efectos secundarios.
 *
 * @param raw cadena cruda leída de Almacenamiento_Local, o `null`
 */
export const parseStoredList = (raw: string | null): ImpresoraRegistrada[] => {
    if (raw === null) {
        return [];
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return [];
    }

    if (!Array.isArray(parsed)) {
        return [];
    }

    return parsed.filter(esImpresoraValida);
};

/**
 * Construye la configuración aplicando la migración desde la
 * Clave_Impresora_Heredada cuando corresponde.
 *
 * Reglas (Req 4.1, 4.2, 4.3, 4.4):
 * - Si `currentList` está vacía y `legacyValue` es válido (string no vacío),
 *   devuelve una lista con UNA impresora (ese nombre) y la asigna como
 *   `defaultTicket` y `defaultComanda` (migración de la impresora previa).
 * - Si `currentList` NO está vacía, ignora el valor heredado y devuelve la
 *   configuración con esa lista y predeterminadas en `null` (los defaults
 *   reales se cargan/validan por separado en `loadPrinterConfig`).
 * - Si `legacyValue` es inválido o vacío y `currentList` está vacía, devuelve
 *   una configuración vacía sin predeterminadas.
 *
 * Es PURA: no tiene efectos secundarios.
 *
 * @param legacyValue valor de la Clave_Impresora_Heredada, o `null`
 * @param currentList lista actual de impresoras registradas (ya parseada)
 */
export const migrateLegacy = (
    legacyValue: string | null,
    currentList: ImpresoraRegistrada[],
): ConfiguracionImpresoras => {
    // La lista actual tiene prioridad: si ya hay impresoras, se ignora el heredado.
    if (currentList.length > 0) {
        return {
            printers: currentList,
            defaultTicket: null,
            defaultComanda: null,
        };
    }

    const legacyName = typeof legacyValue === 'string' ? legacyValue.trim() : '';

    // Lista vacía + heredado válido → migrar como única impresora y default de ambos roles.
    if (legacyName.length > 0) {
        return {
            printers: [{ name: legacyName, addedAt: new Date().toISOString() }],
            defaultTicket: legacyName,
            defaultComanda: legacyName,
        };
    }

    // Lista vacía + heredado inválido/ausente → configuración vacía.
    return {
        printers: [],
        defaultTicket: null,
        defaultComanda: null,
    };
};

/**
 * Agrega el Estado_Conexión de varias impresoras a un único estado global.
 *
 * Orden de prioridad (Req 13.1, 13.2): si alguna está `connected` →
 * `connected`; si no y alguna está `connecting` → `connecting`; si no y alguna
 * está `disconnected` → `disconnected`; si todas están `unknown` o la lista
 * está vacía → `unknown`.
 *
 * Es PURA: no tiene efectos secundarios.
 *
 * @param statuses lista de estados de las impresoras vigiladas
 */
export const aggregateStatus = (statuses: EstadoConexion[]): EstadoConexion => {
    if (statuses.includes('connected')) {
        return 'connected';
    }
    if (statuses.includes('connecting')) {
        return 'connecting';
    }
    if (statuses.includes('disconnected')) {
        return 'disconnected';
    }
    return 'unknown';
};

// ---- Acceso a Almacenamiento_Local (efecto acotado) ----

/**
 * Lee de forma segura una clave de `localStorage`. Ante cualquier fallo
 * (almacenamiento no disponible, acceso bloqueado) devuelve `null` SIN LANZAR,
 * de modo que la carga de configuración nunca interrumpe el arranque (Req 3.6).
 */
const safeGetItem = (key: string): string | null => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

/**
 * Lee y normaliza toda la configuración de impresoras desde Almacenamiento_Local.
 *
 * Flujo (Req 3.3, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.5):
 * 1. Lee y parsea la lista nueva (`STORAGE_KEY_LIST`) de forma segura.
 * 2. Lee la Clave_Impresora_Heredada y aplica `migrateLegacy`:
 *    - lista vacía + heredado válido → migra esa impresora como default de ambos roles.
 *    - lista no vacía → conserva la lista (los defaults guardados se aplican abajo).
 * 3. Si la lista proviene de datos nuevos, aplica las predeterminadas guardadas
 *    por rol (claves independientes).
 * 4. `validateConfig` invalida predeterminadas que ya no referencian impresoras
 *    existentes.
 *
 * Marca `migrationError: true` solo cuando la lista nueva está vacía y existe un
 * valor heredado presente pero inválido/vacío (Req 4.5). Si el valor heredado
 * está ausente (`null`), no es un error (Req 4.3).
 *
 * Esta función NUNCA lanza ni interrumpe el arranque. No toca IndexedDB ni la
 * cola de sincronización offline (Req 14.1).
 */
export const loadPrinterConfig = (): { config: ConfiguracionImpresoras; migrationError: boolean } => {
    const rawList = safeGetItem(STORAGE_KEY_LIST);
    const parsedList = parseStoredList(rawList);
    const legacyValue = safeGetItem(LEGACY_STORAGE_KEY);

    // Base: migra desde el heredado solo si la lista nueva está vacía.
    const base = migrateLegacy(legacyValue, parsedList);

    // Error de migración: lista vacía + heredado presente pero inválido/vacío.
    const migrationError =
        parsedList.length === 0 &&
        legacyValue !== null &&
        legacyValue.trim().length === 0;

    // Datos nuevos: aplica las predeterminadas guardadas por rol (independientes).
    let config = base;
    if (parsedList.length > 0) {
        config = {
            printers: base.printers,
            defaultTicket: safeGetItem(STORAGE_KEY_DEFAULT_TICKET),
            defaultComanda: safeGetItem(STORAGE_KEY_DEFAULT_COMANDA),
        };
    }

    // Invalida predeterminadas colgantes (Req 3.7).
    return { config: validateConfig(config), migrationError };
};

/**
 * Persiste la Lista_Impresoras_Registradas completa en Almacenamiento_Local.
 *
 * Devuelve `false` si la escritura falla (almacenamiento no disponible o cuota
 * excedida), de modo que el llamador pueda conservar la config en memoria y
 * avisar al usuario (Req 3.5). No toca la cola de sincronización offline
 * (Req 14.1, 14.4).
 *
 * @param printers lista de impresoras registradas a persistir
 */
export const savePrinterList = (printers: ImpresoraRegistrada[]): boolean => {
    try {
        localStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(printers));
        return true;
    } catch {
        return false;
    }
};

/**
 * Persiste la predeterminada de un Rol_Impresión en Almacenamiento_Local, de
 * forma independiente por rol (Req 3.2). Si `name` es `null`, elimina la clave
 * (rol sin asignar).
 *
 * Devuelve `false` si la escritura falla, para que el llamador conserve la
 * config en memoria y avise al usuario (Req 3.5). No toca la cola de
 * sincronización offline (Req 14.1, 14.4).
 *
 * @param role rol cuya predeterminada se persiste (`TICKET` o `COMANDA`)
 * @param name nombre de la impresora, o `null` para dejar el rol sin asignar
 */
export const saveDefault = (role: RolImpresion, name: string | null): boolean => {
    const key = role === 'TICKET' ? STORAGE_KEY_DEFAULT_TICKET : STORAGE_KEY_DEFAULT_COMANDA;

    try {
        if (name === null) {
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, name);
        }
        return true;
    } catch {
        return false;
    }
};
