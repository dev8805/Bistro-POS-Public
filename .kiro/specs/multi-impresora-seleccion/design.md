# Documento de Diseño

## Overview

Esta feature amplía el `Servicio_Impresión` (`lib/thermalPrinterService.ts`) para que deje de manejar **una sola impresora** y pase a gestionar una **lista de impresoras registradas** con una **impresora predeterminada independiente por rol**: `TICKET` (ticket de venta y reporte de cierre) y `COMANDA` (comanda de cocina).

El reto central es que el servicio actual es un **módulo singleton con estado en variables de módulo** (`selectedPrinterName`, `currentStatus`, `statusListeners`) del que dependen seis archivos. Cambiar su modelo de datos sin romper la API pública (`printReceiptDirect`, `printKitchenCommandDirect`, `printShiftReportDirect`, `getPrinterStatus`, `onPrinterStatusChange`, `reconnectPrinter`, `connectPrinter`, `listPrinters`, `probePrinterReachable`) es la restricción principal.

La estrategia de diseño separa dos responsabilidades que hoy están mezcladas:

1. **Lógica pura de configuración** (lista, predeterminadas, migración, validación, persistencia y agregación de estado). Se extrae a un módulo nuevo y testeable `lib/printerRegistry.ts`, sin dependencias de QZ_Tray ni del DOM.
2. **Conexión y envío físico** vía QZ_Tray, que permanece en `lib/thermalPrinterService.ts` pero ahora consulta al registro para resolver a qué impresora enviar y mantiene un **mapa de estado por impresora** en lugar de un único `currentStatus`.

En la capa de UI se introducen **dos** controles distintos según el rol, más un hook `usePrinters` que expone lista, predeterminadas y estado a las pantallas sin hacer fetching directo en componentes:

- **Ticket** → componente reutilizable `PrinterSplitButton` (botón dividido: acción principal "Imprimir Ticket" + flecha ▼ para elegir impresora). Usado por `SuccessScreen` y `SuccessSidebar`. **El split button es exclusivo del rol `TICKET`.**
- **Comanda** → componente reutilizable `ComandaTargetGrid` (grid titulado "Enviar comanda a", con tarjetas de destino, máximo 3 por fila). El rol `COMANDA` **ya no usa** botón dividido ni flecha ▼. Usado por `SuccessScreen` y `SuccessSidebar`.

> **Nota de color (UI):** ningún texto de estos componentes usa amarillo/ámbar (`text-amber-*`). Los resaltes de texto (predeterminada, hover de ítems, destino activo) usan colores neutros (`text-gray-*`, `text-slate-*`) o `emerald`/`green` del design system. Los fondos de botón primario existentes en el código pueden permanecer, pero el **texto** nunca es amarillo.

### Principios que guían el diseño

- **Compatibilidad hacia atrás total**: las firmas públicas existentes siguen funcionando; los nuevos parámetros son opcionales.
- **Lógica pura aislada**: toda la lógica de negocio (migración, dedup, invalidación de predeterminadas, agregación de estado) vive en funciones puras sin efectos secundarios, lo que la hace verificable con property-based testing.
- **`localStorage` exclusivamente**: ninguna operación toca la cola de sincronización offline (IndexedDB / Event Sourcing).
- **El flujo remoto de comandas (`Envío_Comanda_Remoto`) no se modifica**: solo se ajusta de qué condición depende `getPrinterStatus()` para preservar el presence.

### Decisiones de diseño y su justificación

| Decisión | Justificación | Requerimientos |
|----------|---------------|----------------|
| Extraer `lib/printerRegistry.ts` puro | Aísla la lógica testeable de QZ_Tray; permite PBT real sin mocks de WebSocket | 1, 2, 3, 4, 9 |
| Mapa `Record<string, EstadoConexion>` por impresora | Permite estado por rol y agregación para `getPrinterStatus()` | 12, 13 |
| `sendToQzPrinter(data, printerName)` recibe destino por parámetro | Elimina la dependencia de la variable global única; habilita impresión por rol | 7, 9 |
| Parámetro opcional `targetPrinter` en las funciones de impresión | Mantiene compatibilidad y permite override desde la flecha ▼ | 5, 8, 9 |
| Hook `usePrinters` | Evita fetching/estado disperso en cada pantalla; reutilizado por 4 pantallas | 5, 6, 7, 12, 16 |
| Componente `PrinterSplitButton` único **solo para ticket** | Evita duplicar el split button de ticket entre `SuccessScreen` y `SuccessSidebar` | 5, 6, 8 |
| Componente `ComandaTargetGrid` (grid "Enviar comanda a", máx 3/fila) **solo para comanda** | Unifica destinos locales (impresoras) y remotos (dispositivos presence) en una sola superficie tocable, sin menús; reutilizado por `SuccessScreen` y `SuccessSidebar` | 7.2, 16 |
| Grid unifica destino local + remoto (Opción 1) | El emisor toca un destino; presence sigue a nivel de dispositivo (no se elige la impresora física del receptor); `kitchenCommandService.ts` y el payload de presence **no cambian** | 11, 13, 16 |
| Sin texto amarillo en la UI de impresión | Decisión de UI confirmada: textos en neutro/emerald, nunca `text-amber-*` | 5, 16 |

## Architecture

### Diagrama de capas

```
┌──────────────────────────────────────────────────────────────────┐
│                         CAPA DE UI (React)                          │
│                                                                    │
│  SettingsSidebarPanel ── PrinterConnectionCard (gestión lista)     │
│  SuccessScreen ─────────┐                                          │
│  SuccessSidebar ────────┼── PrinterSplitButton  (SOLO ticket ▼)    │
│  CashRegisterScreen ────┘   ComandaTargetGrid   (SOLO comanda,     │
│   (reporte de cierre → rol TICKET)              grid máx 3/fila)   │
│                              │                                     │
│                              ▼                                     │
│                    hook usePrinters()                              │
│        (lista, predeterminadas, estado por rol, acciones)          │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
        ┌──────────────────────┴───────────────────────┐
        ▼                                               ▼
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  lib/thermalPrinterService   │         │   lib/printerRegistry.ts      │
│  (efectos: QZ Tray / DOM)    │ ───────▶│   (LÓGICA PURA, sin efectos)  │
│                              │  usa    │                               │
│  - connectPrinter            │         │  - loadPrinterConfig          │
│  - sendToQzPrinter(data,name)│         │  - savePrinterList            │
│  - estado por impresora      │         │  - saveDefault                │
│  - getPrinterStatus (agrega) │         │  - addPrinter / removePrinter │
│  - printReceiptDirect (TICKET)         │  - getDefaultForRole          │
│  - printKitchenCommandDirect │         │  - validateConfig             │
│       (COMANDA)              │         │  - migrateLegacy              │
│  - printShiftReportDirect    │         │  - aggregateStatus            │
│       (TICKET)               │         │                               │
└──────────────┬───────────────┘         └───────────────┬──────────────┘
               │                                          │
               ▼                                          ▼
        ┌─────────────┐                          ┌─────────────────┐
        │   QZ_Tray    │                          │  Almacenamiento  │
        │  (WebSocket) │                          │  Local (claves)  │
        └─────────────┘                          └─────────────────┘

  Flujo remoto (NO se modifica):
  useKitchenPrinter ──▶ kitchenCommandService (presence/realtime Supabase)
        │
        └─ depende de getPrinterStatus() === 'connected'
```

### Flujo de arranque y migración

```
App inicia
   │
   ▼
loadPrinterConfig()  ◀── lib/printerRegistry.ts (pura)
   │
   ├─ ¿Hay lista nueva válida (bistro_printers_list)?
   │      SÍ ─▶ cargar lista + defaults; validar que cada default
   │           referencie una impresora existente (si no, → null)   [Req 3.3, 3.7]
   │
   │      NO ─▶ ¿Existe Clave_Impresora_Heredada (bistro_thermal_printer)?
   │               SÍ y válida ─▶ migrar: lista = [impresora],
   │                              defaultTicket = defaultComanda = impresora  [Req 4.1, 4.2]
   │               SÍ pero inválida ─▶ lista vacía, sin defaults,
   │                                   conservar clave heredada, señalar error  [Req 4.5]
   │               NO ─▶ lista vacía, sin defaults  [Req 4.3]
   │
   └─ ¿JSON corrupto / formato inválido?
          ─▶ lista vacía, sin defaults, no interrumpir arranque  [Req 3.6]
```

### Flujo del Botón_Dividido de ticket (acción principal)

```
Usuario pulsa acción principal de TICKET
   │
   ▼
¿Lista_Impresoras_Registradas vacía?
   SÍ ─▶ mostrar "Conectar impresora" (flujo Req 15) ── no imprime
   NO ─▶ ¿Existe Impresora_Predeterminada_Ticket?
            NO ─▶ desplegar lista, bloquear impresión hasta elegir   [Req 6.1]
            SÍ ─▶ ¿Estado de esa impresora === 'connected'?
                     NO ─▶ deshabilitar / mostrar no disponible      [Req 12.4]
                     SÍ ─▶ imprimir en la predeterminada de ticket   [Req 7.1]
```

### Flujo de la flecha desplegable (▼) de ticket

```
Usuario abre ▼ ─▶ muestra Lista_Impresoras_Registradas
                  (marca visualmente la predeterminada actual)       [Req 5.3]
   │
   ▼
Usuario elige impresora X
   │
   ├─ guardar X como nueva Impresora_Predeterminada_Ticket (persist.) [Req 8.2]
   └─ imprimir ticket en X                                            [Req 8.1]
        └─ si falla guardado o impresión ─▶ conservar predeterminada anterior + error  [Req 8.4, 8.5]
```

### Flujo del grid "Enviar comanda a" (rol COMANDA)

El rol `COMANDA` no usa botón dividido ni flecha ▼. Usa un grid de tarjetas que unifica **dos tipos de destino** (Opción 1 confirmada): impresoras locales registradas y conectadas, y dispositivos remotos disponibles vía presence.

```
Pantalla de éxito (modo comanda)
   │
   ▼
¿Hay algún destino? (impresora local registrada  ó  dispositivo remoto presence)
   NO ─▶ grid ofrece "Conectar impresora" (flujo Req 15) ── no muestra destinos  [Req 16.9]
   SÍ ─▶ renderizar grid "Enviar comanda a" (máx 3 tarjetas por fila)            [Req 16.1, 16.3]
            │
            ├─ Tarjeta de IMPRESORA LOCAL
            │     ├─ si Estado_Conexión != 'connected' ─▶ tarjeta "no disponible"  [Req 16.8]
            │     └─ al tocar (connected):
            │           ├─ printKitchenCommandDirect(data, paperWidth, ESA impresora)  [Req 16.4, 7.2]
            │           └─ fijar ESA impresora como nueva defaultComanda (persist.)    [Req 16.7]
            │
            └─ Tarjeta de DISPOSITIVO REMOTO (presence)
                  └─ al tocar:
                        └─ sendKitchenCommand(business, targetUserId, data)            [Req 16.5]
                              └─ el dispositivo receptor imprime en SU propia
                                 defaultComanda (el emisor NO elige su impresora)       [Req 16.6]
```

## Components and Interfaces

### 1. `lib/printerRegistry.ts` (módulo nuevo, lógica pura)

Centraliza toda la lógica de configuración sin tocar QZ_Tray. Cada función es pura o tiene un único efecto acotado sobre `localStorage` (lectura/escritura), lo que la hace verificable.

```typescript
export type RolImpresion = 'TICKET' | 'COMANDA';
export type EstadoConexion = 'disconnected' | 'connecting' | 'connected' | 'unknown';

export interface ImpresoraRegistrada {
    name: string;       // identificador único (nombre que reporta QZ_Tray)
    addedAt: string;    // ISO timestamp del alta
}

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

// ---- Lógica pura (sin efectos) ----

/** Añade una impresora evitando duplicados por nombre. Devuelve nueva config. */
export const addPrinter = (
    config: ConfiguracionImpresoras,
    name: string,
    addedAt?: string,
): { config: ConfiguracionImpresoras; alreadyExisted: boolean };

/** Quita una impresora y limpia las predeterminadas que la referencian. */
export const removePrinter = (
    config: ConfiguracionImpresoras,
    name: string,
): ConfiguracionImpresoras;

/** Asigna la predeterminada de un rol sin tocar el otro rol. */
export const setDefault = (
    config: ConfiguracionImpresoras,
    role: RolImpresion,
    name: string | null,
): ConfiguracionImpresoras;

/** Devuelve la predeterminada del rol, o null. */
export const getDefaultForRole = (
    config: ConfiguracionImpresoras,
    role: RolImpresion,
): string | null;

/** Normaliza una config: invalida defaults que no referencian impresoras existentes. */
export const validateConfig = (config: ConfiguracionImpresoras): ConfiguracionImpresoras;

/** Construye la config migrando desde la clave heredada cuando aplica. */
export const migrateLegacy = (
    legacyValue: string | null,
    currentList: ImpresoraRegistrada[],
): ConfiguracionImpresoras;

/** Agrega el estado de varias impresoras a un único estado global. */
export const aggregateStatus = (
    statuses: EstadoConexion[],
): EstadoConexion;

/** Parsea de forma segura la lista almacenada; ante datos corruptos devuelve []. */
export const parseStoredList = (raw: string | null): ImpresoraRegistrada[];

// ---- Acceso a Almacenamiento_Local (efecto acotado) ----

/** Lee y normaliza toda la configuración aplicando migración y validación. */
export const loadPrinterConfig = (): { config: ConfiguracionImpresoras; migrationError: boolean };

/** Persiste la lista. Devuelve false si el guardado falla. */
export const savePrinterList = (printers: ImpresoraRegistrada[]): boolean;

/** Persiste la predeterminada de un rol. Devuelve false si falla. */
export const saveDefault = (role: RolImpresion, name: string | null): boolean;
```

**Reglas de `aggregateStatus`** (orden de prioridad): si alguna impresora está `connected` → `connected`; si no y alguna está `connecting` → `connecting`; si no y alguna está `disconnected` → `disconnected`; si todas están `unknown` (o la lista está vacía) → `unknown`. Esto satisface el Req 13.1/13.2 (el presence solo necesita distinguir `connected` del resto) y el Req 12.2 (`unknown` cuando no hay reporte).

### 2. `lib/thermalPrinterService.ts` (refactor, mantiene efectos QZ)

Cambios sobre el estado de módulo:

```typescript
// ANTES:  let selectedPrinterName: string | null = null;
//         let currentStatus: PrinterStatus = 'disconnected';

// DESPUÉS:
let config: ConfiguracionImpresoras = { printers: [], defaultTicket: null, defaultComanda: null };
const printerStatuses: Map<string, EstadoConexion> = new Map(); // por nombre de impresora
const statusListeners: Set<StatusListener> = new Set();
```

API pública nueva o modificada (las existentes conservan su firma; los parámetros añadidos son opcionales):

```typescript
// ---- Gestión de la lista (nuevas) ----
export const getRegisteredPrinters = (): ImpresoraRegistrada[];
export const registerPrinter = (name: string): { ok: boolean; alreadyExisted: boolean };
export const unregisterPrinter = (name: string): boolean;     // false si falla la persistencia
export const getDefaultPrinter = (role: RolImpresion): string | null;
export const setDefaultPrinter = (role: RolImpresion, name: string): boolean;
export const getPrinterStatusFor = (name: string): EstadoConexion;
export const onConfigChange = (listener: (c: ConfiguracionImpresoras) => void): (() => void);

// ---- Compatibles (firma extendida con parámetro opcional) ----
export const printReceiptDirect = (
    data: ReceiptData,
    paperWidth?: '58mm' | '80mm',
    targetPrinter?: string,        // NUEVO opcional; si se omite usa default TICKET
): Promise<boolean>;

export const printKitchenCommandDirect = (
    data: KitchenCommandData,
    paperWidth?: '58mm' | '80mm',
    targetPrinter?: string,        // NUEVO opcional; si se omite usa default COMANDA
): Promise<boolean>;

export const printShiftReportDirect = (
    data: ShiftReportData,
    paperWidth?: '58mm' | '80mm',
    targetPrinter?: string,        // NUEVO opcional; si se omite usa default TICKET
): Promise<boolean>;

// ---- Sin cambio de firma, comportamiento ajustado ----
export const listPrinters = (): Promise<string[]>;            // igual: lista de QZ
export const connectPrinter = (printerName?: string): Promise<boolean>; // conecta + registra + escucha estado
export const reconnectPrinter = (): Promise<boolean>;         // reconecta impresoras registradas (prioriza COMANDA para presence)
export const disconnectPrinter = (): Promise<void>;
export const getPrinterStatus = (): PrinterStatus;            // AGREGADO: 'connected' si alguna conectada
export const onPrinterStatusChange = (l: StatusListener): (() => void);
export const probePrinterReachable = (timeoutMs?: number, name?: string): Promise<boolean | null>;
```

**`sendToQzPrinter` recibe el destino por parámetro** (el cambio clave que elimina la global única):

```typescript
// ANTES: const sendToQzPrinter = async (data: Uint8Array): Promise<boolean>
//        usaba qz.configs.create(selectedPrinterName, ...)

// DESPUÉS:
const sendToQzPrinter = async (data: Uint8Array, printerName: string): Promise<boolean> => {
    if (!printerName) return false;
    const qzOk = await ensureQzConnected();
    if (!qzOk) return false;
    const cfg = qz.configs.create(printerName, { encoding: 'ISO-8859-1' });
    // ... resto idéntico (hex + qz.print). NO cambia encoding ni ESC/POS.
};
```

**Resolución del destino por rol** dentro de cada función de impresión:

```typescript
const resolveTarget = (role: RolImpresion, override?: string): string | null =>
    override ?? getDefaultForRole(config, role);
// printReceiptDirect    → resolveTarget('TICKET', targetPrinter)
// printShiftReportDirect → resolveTarget('TICKET', targetPrinter)
// printKitchenCommandDirect → resolveTarget('COMANDA', targetPrinter)
// si resuelve null → no imprime, retorna false (la UI muestra el error / la lista)
```

**Estado por impresora y escucha**: `startStatusListener` itera sobre `config.printers` llamando `qz.printers.startListening(name)` para cada una; `handlePrinterStatusEvent` actualiza `printerStatuses.set(event.printerName, ...)` y luego emite `aggregateStatus([...printerStatuses.values()])` a los `statusListeners`. El `setClosedCallbacks` de QZ pone todas las impresoras en `disconnected` (Req 12.5) conservando `config` intacta.

### 3. Hook `hooks/usePrinters.ts` (nuevo)

Expone el estado y las acciones a la UI siguiendo react-patterns (sin fetching en componentes, sin `useEffect` para derivar estado, con cleanup de listeners). Se justifica por YAGNI porque lo consumen **cuatro** superficies (`PrinterConnectionCard`, `SuccessScreen`, `SuccessSidebar`, `CashRegisterScreen`).

```typescript
interface UsePrintersResult {
    printers: ImpresoraRegistrada[];
    defaultTicket: string | null;
    defaultComanda: string | null;
    statusTicket: EstadoConexion;     // estado de la predeterminada TICKET
    statusComanda: EstadoConexion;    // estado de la predeterminada COMANDA
    statusFor: (name: string) => EstadoConexion;  // estado de cualquier impresora (lo usa ComandaTargetGrid)
    globalStatus: PrinterStatus;      // resultado de getPrinterStatus()
    listQzPrinters: () => Promise<string[]>;
    addPrinter: (name: string) => Promise<{ ok: boolean; alreadyExisted: boolean }>;
    removePrinter: (name: string) => Promise<boolean>;
    setDefault: (role: RolImpresion, name: string) => boolean;
    getDefault: (role: RolImpresion) => string | null;
}

export const usePrinters = (): UsePrintersResult;
```

Internamente se suscribe a `onConfigChange` y `onPrinterStatusChange`, y deriva `statusTicket`/`statusComanda` con `useMemo` a partir de `printerStatuses` (no con `useEffect`).

### 4. Componente `components/PrinterSplitButton.tsx` (nuevo, reutilizable) — SOLO TICKET

Un único componente para el rol `TICKET`, reutilizado por `SuccessScreen` y `SuccessSidebar`. **Ya no se usa para comanda** (la comanda usa `ComandaTargetGrid`, ver sección 4b).

```typescript
interface PrinterSplitButtonProps {
    label: string;                      // "Imprimir Ticket" (rol fijo TICKET)
    icon: string;                       // material symbol
    onPrint: (targetPrinter: string) => Promise<void>;  // imprime en la impresora resuelta
    onRequestConnect: () => void;       // dispara flujo Req 15 (lista vacía)
    disabled?: boolean;
}
```

> El rol es implícitamente `TICKET`; el componente resuelve siempre `defaultTicket` y fija la elegida como `defaultTicket`.

**Diagrama ASCII del Botón_Dividido de ticket (estado normal, con predeterminada):**

```
┌────────────────────────────────────────┬──────┐
│  🖨  Imprimir Ticket                     │  ▼   │
│      (acción principal → default TICKET) │      │
└────────────────────────────────────────┴──────┘
      acción principal (Req 7.1)            flecha (Req 5.5)
```

**Diagrama ASCII con la flecha (▼) desplegada:**

```
┌────────────────────────────────────────┬──────┐
│  🖨  Imprimir Ticket                     │  ▲   │
└────────────────────────────────────────┴──────┘
┌───────────────────────────────────────────────┐
│  Elegir impresora:                             │
│  ┌───────────────────────────────────────────┐ │
│  │ 🖨  POS-80C Mostrador        ✓ Predet.    │ │  ◀ marca predeterminada (Req 5.3)
│  ├───────────────────────────────────────────┤ │
│  │ 🖨  EPSON Cocina LAN                       │ │
│  ├───────────────────────────────────────────┤ │
│  │ 🖨  Caja 2          ● no disponible        │ │  ◀ estado ≠ connected (Req 12.4)
│  └───────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

**Diagrama ASCII con lista vacía (Req 5.6 / 15.1):**

```
┌───────────────────────────────────────────────┐
│  🔌  Conectar impresora                         │   ◀ en vez de imprimir
└───────────────────────────────────────────────┘
```

Accesibilidad (code-conventions): la flecha es un `<button>` con `aria-label="Elegir impresora"`, `tabIndex={0}` y `onKeyDown` (Enter/Espacio abren el menú; Escape lo cierra; el menú es navegable con flechas). Cada ítem de la lista es un `<button>` con `aria-label` y soporte de teclado.

**Color (sin amarillo en textos):** el resalte de la impresora predeterminada (`✓ Predet.`) y el hover de los ítems usan colores neutros o `emerald`/`green` (p. ej. `text-emerald-600`, `text-gray-700`, hover `hover:bg-gray-50`/`hover:text-emerald-700`), **nunca** `text-amber-*`. Se reemplazan explícitamente los antiguos `hover:text-amber-700`, `hover:bg-amber-50`, `hover:border-amber-200` de las listas de impresoras por equivalentes neutros/emerald. El fondo del botón primario existente puede conservarse, pero su texto no es amarillo.

### 4b. Componente `components/ComandaTargetGrid.tsx` (nuevo, reutilizable) — SOLO COMANDA

Grid titulado "Enviar comanda a" que reemplaza, para el rol `COMANDA`, al botón dividido. Reutilizado por `SuccessScreen` y `SuccessSidebar`. Renderiza las tarjetas en un grid de **máximo 3 columnas** (Tailwind `grid grid-cols-3 gap-2`; en pantallas muy estrechas puede degradar a `grid-cols-2`, manteniendo el tope de 3). La 4ª tarjeta pasa a la siguiente fila de forma natural por el grid (Req 16.3).

Unifica **dos tipos de destino** (Opción 1):
- `local`: `Impresora_Registrada` (se imprime con `printKitchenCommandDirect(data, paperWidth, name)` y se fija como `defaultComanda`).
- `remote`: dispositivo de cocina disponible vía presence (se envía con `sendKitchenCommand(business, userId, data)`; el receptor imprime en su propia `defaultComanda`).

```typescript
type ComandaTargetKind = 'local' | 'remote';

interface ComandaTarget {
    kind: ComandaTargetKind;
    id: string;                 // local: printerName · remote: targetUserId
    label: string;              // nombre visible (impresora o dispositivo)
    subLabel?: string;          // p. ej. rol del dispositivo remoto
    status: EstadoConexion;     // local: estado real; remote: 'connected' (está en presence)
    isDefault?: boolean;        // local: es la defaultComanda actual
}

interface ComandaTargetGridProps {
    targets: ComandaTarget[];               // destinos locales + remotos ya unificados
    onPrintLocal: (printerName: string) => Promise<void>;   // toca tarjeta local
    onSendRemote: (targetUserId: string) => Promise<void>;  // toca tarjeta remota
    onRequestConnect: () => void;           // sin destinos → flujo Req 15
    busyTargetId?: string | null;           // muestra spinner en la tarjeta en curso
}
```

El padre (`SuccessScreen`/`SuccessSidebar`) construye `targets` combinando `usePrinters()` (impresoras locales registradas + su estado por nombre) con `useAvailablePrinters()` (dispositivos remotos por presence, **sin cambios**). Una tarjeta `local` con `status !== 'connected'` se renderiza como no disponible y no dispara impresión (Req 16.8).

**Diagrama ASCII del grid "Enviar comanda a" (máx 3 por fila):**

```
  Enviar comanda a
  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
  │ 🖨 POS-80C   │ │ 🖨 EPSON     │ │ 📡 Cocina 2  │   ◀ fila 1 (3 tarjetas)
  │   Mostrador  │ │   Cocina LAN │ │   (remoto)   │
  │  ✓ Predet.   │ │              │ │   COCINA     │
  │  ● connected │ │ ● connected  │ │ ● disponible │
  └──────────────┘ └──────────────┘ └──────────────┘
  ┌──────────────┐
  │ 🖨 Caja 2    │                                       ◀ 4ª tarjeta → fila 2
  │ ● no disp.   │   (status ≠ connected → deshabilitada)
  └──────────────┘

  local  → al tocar: imprime aquí + fija defaultComanda   [Req 16.4, 16.7]
  remoto → al tocar: envía al dispositivo (presence)       [Req 16.5, 16.6]
```

**Diagrama ASCII sin destinos (Req 16.9 / 15.1):**

```
  Enviar comanda a
  ┌───────────────────────────────────────────────┐
  │  🔌  Conectar impresora                         │   ◀ en vez de mostrar destinos
  └───────────────────────────────────────────────┘
```

Accesibilidad (code-conventions): cada tarjeta es un `<button>` con `aria-label` descriptivo (p. ej. `"Imprimir comanda en POS-80C Mostrador"` / `"Enviar comanda a Cocina 2"`), `tabIndex={0}` y `onKeyDown` (Enter/Espacio activan). Las tarjetas no disponibles llevan `disabled` y `aria-disabled`.

**Color (sin amarillo en textos):** el título "Enviar comanda a", la marca `✓ Predet.`, el hover y el indicador de destino activo usan neutros o `emerald`/`green` (los indicadores de estado pueden usar el punto `bg-green-500` ya existente). **No** se usa `text-amber-*` en ningún texto del grid.

### 5. `components/PrinterConnectionCard.tsx` (modificado)

Pasa de gestionar una conexión única a gestionar la `Lista_Impresoras_Registradas`:

```
┌─────────────────────────────────────────────────────┐
│  IMPRESORAS REGISTRADAS                               │
│  ┌─────────────────────────────────────────────────┐ │
│  │ 🖨 POS-80C Mostrador     ● conectada    🗑       │ │
│  │    [Predet. Ticket ✓] [Predet. Comanda]          │ │  ◀ asignar default por rol
│  ├─────────────────────────────────────────────────┤ │
│  │ 🖨 EPSON Cocina LAN      ● conectada    🗑       │ │
│  │    [Predet. Ticket]    [Predet. Comanda ✓]       │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  [ + Agregar impresora ]                              │  ◀ lista las de QZ (Req 1)
└─────────────────────────────────────────────────────┘
```

- "Agregar impresora" abre la lista de QZ_Tray (igual que hoy) y registra la elegida en la lista acumulativa (Req 1.4), con dedup (Req 1.6) y sin alta manual por IP (Req 1.7).
- El icono 🗑 pide confirmación mediante `useConfirmDialog` (ya usado en el proyecto) identificando la impresora (Req 2.1) antes de eliminar (Req 2.2).
- Los toggles "Predet. Ticket"/"Predet. Comanda" llaman `setDefault(role, name)`; son independientes (Req 3.2, 9.3).
- **Color (sin amarillo en textos):** los hover de la lista de impresoras que hoy usan `hover:bg-amber-50`, `hover:text-amber-700`, `hover:border-amber-200` se reemplazan por equivalentes neutros/emerald (`hover:bg-gray-50`/`hover:text-emerald-700`/`hover:border-emerald-200`). El botón "Conectar" puede conservar su fondo, pero sin texto amarillo.

### 6. `screens/SuccessScreen.tsx` y `components/SuccessSidebar.tsx` (modificados)

Ambas pantallas comparten el mismo patrón de dos superficies separadas por rol:

- **Ticket (rol `TICKET`):** se reemplaza el botón único actual "Imprimir Ticket"/"Conectar impresora" por un `PrinterSplitButton`. Su `onPrint` llama `printThermalReceipt`/`printReceiptDirect(data, paperWidth, target)`; su `onRequestConnect` dispara el flujo Req 15 (lista vacía).
- **Comanda (rol `COMANDA`):** se reemplazan el botón "Imprimir Comanda aquí" y el bloque suelto "Enviar Comanda" por **un único** `ComandaTargetGrid` titulado "Enviar comanda a". El padre construye `targets` unificando:
  - **Destinos locales:** `Impresora_Registrada` de `usePrinters()` con su `EstadoConexion`. `onPrintLocal(name)` → `printKitchenCommandDirect(commandData, paperWidth, name)` y fija `name` como `defaultComanda` (Req 16.4, 16.7).
  - **Destinos remotos:** los `availablePrinters` de `useAvailablePrinters()` (presence), **sin cambios**. `onSendRemote(userId)` → `sendKitchenCommand(business_id, userId, commandData)` (Req 16.5). El receptor imprime en su propia `defaultComanda` (Req 16.6).

El armado de `commandData` (mapeo de `receiptData.items`, agrupación de add-ons, etc.) se conserva **idéntico** al actual en ambas pantallas. El presence (`useAvailablePrinters`, `kitchenCommandService.ts`, el payload) **no se modifica**: solo cambia su presentación, pasando de una lista vertical a tarjetas del grid (Opción 1, Req 11, 13).

**Decisión de alcance — esto también afecta:**
- `SuccessScreen.tsx` / `SuccessSidebar.tsx`: el bloque "Imprimir Comanda aquí" (estado `isPrintingCommand`/`localCommandPrinted`) y el bloque "Enviar Comanda" (estado `isSendingCommand`/`commandSent`) se fusionan dentro del `ComandaTargetGrid`. La lógica de los handlers (`handlePrintCommandLocal`, `handleSendKitchenCommand`) se conserva y se conecta a los callbacks del grid.
- El flujo de "Conectar impresora" inline (`showPrinterList`, `handleConnectPrinterClick`, `handleSelectPrinter`) se reutiliza tanto para el split button de ticket como para el grid de comanda cuando no hay destinos (Req 15, Req 16.9).

### 7. `screens/CashRegisterScreen.tsx` (modificado)

`handlePrintShiftReport` deja de depender de un `connectPrinter()` genérico: usa la `Impresora_Predeterminada_Ticket`. Si no hay predeterminada pero la lista tiene impresoras, despliega la lista para elegir y la fija como default TICKET (Req 10.2, patrón Req 6). Si la lista está vacía, indica registrar en Ajustes y no imprime (Req 10.3).

## Data Models

### Modelo de configuración persistida

```typescript
interface ImpresoraRegistrada {
    name: string;       // único; nombre exacto reportado por QZ_Tray
    addedAt: string;    // ISO 8601
}

interface ConfiguracionImpresoras {
    printers: ImpresoraRegistrada[];
    defaultTicket: string | null;   // referencia a printers[].name o null
    defaultComanda: string | null;  // referencia a printers[].name o null
}
```

### Representación en Almacenamiento_Local

| Clave | Contenido | Ejemplo |
|-------|-----------|---------|
| `bistro_printers_list` | JSON de `ImpresoraRegistrada[]` | `[{"name":"POS-80C","addedAt":"2026-01-01T10:00:00Z"}]` |
| `bistro_default_ticket` | `string` (name) o ausente | `"POS-80C"` |
| `bistro_default_comanda` | `string` (name) o ausente | `"EPSON Cocina LAN"` |
| `bistro_thermal_printer` *(heredada)* | `string` (name) | `"POS-80C"` |

**Invariantes del modelo:**

- `INV-1`: `defaultTicket`, si no es `null`, referencia un `name` presente en `printers`.
- `INV-2`: `defaultComanda`, si no es `null`, referencia un `name` presente en `printers`.
- `INV-3`: no hay dos entradas en `printers` con el mismo `name`.
- `INV-4`: `defaultTicket` y `defaultComanda` son independientes (cambiar uno no altera el otro).

### Estado en memoria (no persistido)

```typescript
// Estado de conexión por impresora; default 'unknown' hasta el primer reporte de QZ.
type MapaEstado = Map<string /* printer name */, EstadoConexion>;
```

`getPrinterStatus()` proyecta `MapaEstado` mediante `aggregateStatus` a `PrinterStatus` para preservar la API existente y el presence.

## Correctness Properties

*Una propiedad es una característica o comportamiento que debe cumplirse en todas las ejecuciones válidas del sistema: una afirmación formal sobre lo que el software debe hacer. Las propiedades son el puente entre la especificación legible por humanos y las garantías de correctitud verificables por máquina.*

El núcleo de lógica pura de esta feature (`lib/printerRegistry.ts`: lista, predeterminadas, migración, validación, dedup y agregación de estado) es ideal para property-based testing: son funciones puras con un espacio de entradas amplio (configuraciones, nombres, estados). La capa de UI (split button de ticket, **grid "Enviar comanda a"**, panel de ajustes, plazos, indicaciones visuales) y la integración con QZ_Tray y el presence remoto se cubren con tests de ejemplo/integración, no con PBT.

Tras la reflexión de propiedades, las siguientes son las propiedades únicas (sin redundancia). Las familias de criterios sobre enrutamiento por rol, independencia de predeterminadas y agregación de estado se consolidaron. El nuevo Requerimiento 16 (grid de comanda) no introduce propiedades nuevas no redundantes: "fijar `defaultComanda` al tocar una tarjeta local" (16.7) ya está cubierto por la Propiedad 10, y el enrutamiento de la comanda a la impresora tocada (16.4) y a la `defaultComanda` del receptor (16.6) por la Propiedad 11. Los criterios puramente de UI del grid (presencia, composición local+remoto, 3 por fila, no-disponible, "Conectar impresora") se validan con tests de ejemplo.

### Property 1: Agregar una impresora nueva la incorpora a la lista

*Para toda* `ConfiguracionImpresoras` y todo nombre que no exista aún en la lista, `addPrinter(config, name)` devuelve una configuración cuya lista contiene ese nombre exactamente una vez y cuya longitud es la original más uno, con `alreadyExisted === false`.

**Validates: Requirements 1.4**

### Property 2: Agregar un nombre existente es idempotente (dedup)

*Para toda* `ConfiguracionImpresoras` y todo nombre ya presente en la lista, `addPrinter(config, name)` no incrementa la longitud de la lista, conserva una sola entrada con ese nombre y devuelve `alreadyExisted === true`. Además, `addPrinter` aplicado dos veces produce la misma lista que aplicado una vez.

**Validates: Requirements 1.6**

### Property 3: Eliminar una impresora la quita de la lista

*Para toda* `ConfiguracionImpresoras` y todo nombre, `removePrinter(config, name)` devuelve una configuración cuya lista no contiene ese nombre.

**Validates: Requirements 2.2**

### Property 4: Eliminar limpia las predeterminadas que la referencian

*Para toda* `ConfiguracionImpresoras` y todo nombre, tras `removePrinter(config, name)`: si `defaultTicket` era ese nombre, el resultado tiene `defaultTicket === null`; si `defaultComanda` era ese nombre, el resultado tiene `defaultComanda === null`; y cualquier predeterminada que apuntaba a un nombre distinto permanece sin cambios.

**Validates: Requirements 2.4**

### Property 5: La persistencia es un round-trip

*Para toda* `Lista_Impresoras_Registradas` válida y todo par de predeterminadas, guardar con `savePrinterList` + `saveDefault` y luego `loadPrinterConfig` produce una configuración equivalente a la guardada (misma lista y mismas predeterminadas).

**Validates: Requirements 3.1, 3.3**

### Property 6: Las predeterminadas por rol son independientes

*Para toda* `ConfiguracionImpresoras`, todo `RolImpresion` y todo nombre presente en la lista, `setDefault(config, role, name)` cambia únicamente la predeterminada de `role` y deja la predeterminada del otro rol exactamente igual que antes.

**Validates: Requirements 3.2, 9.3**

### Property 7: El parser de la lista almacenada es robusto

*Para toda* cadena de texto arbitraria (incluida JSON inválido, valores no-array u objetos con forma incorrecta), `parseStoredList` nunca lanza una excepción y devuelve una lista vacía cuando la entrada no es un arreglo válido de `ImpresoraRegistrada`.

**Validates: Requirements 3.6**

### Property 8: `validateConfig` garantiza predeterminadas válidas

*Para toda* `ConfiguracionImpresoras` arbitraria (incluyendo predeterminadas que referencian nombres ausentes de la lista), `validateConfig(config)` devuelve una configuración en la que cada predeterminada es `null` o referencia un nombre que existe en la lista; las predeterminadas que ya referenciaban una impresora existente se conservan.

**Validates: Requirements 3.7**

### Property 9: Migración de la impresora heredada

*Para todo* valor heredado válido (cadena no vacía) cuando la lista actual está vacía, `migrateLegacy(legacy, [])` produce una configuración cuya lista contiene exactamente una entrada con ese nombre y cuyas `defaultTicket` y `defaultComanda` son ambas ese nombre. *Para toda* lista actual no vacía, `migrateLegacy(legacy, lista)` ignora el valor heredado y devuelve la lista de entrada sin cambios.

**Validates: Requirements 4.1, 4.2, 4.4**

### Property 10: Fijar una predeterminada es persistente y consultable

*Para toda* `ConfiguracionImpresoras`, todo `RolImpresion` y todo nombre presente en la lista, tras `setDefault(config, role, name)` se cumple que `getDefaultForRole(resultado, role) === name`. En particular, fijar la `defaultComanda` al tocar una tarjeta local del grid (`setDefault(config, 'COMANDA', name)`) deja esa impresora como predeterminada de comanda.

**Validates: Requirements 8.2, 16.7**

### Property 11: Enrutamiento por rol a la predeterminada correcta

*Para toda* `ConfiguracionImpresoras` con predeterminada definida para un `RolImpresion`, la resolución de destino de ese rol (`resolveTarget(role)` / `getDefaultForRole(config, role)`) devuelve exactamente la impresora predeterminada de ese rol. En consecuencia, `printReceiptDirect` y `printShiftReportDirect` enrutan a `defaultTicket`; `printKitchenCommandDirect` sin override enruta a `defaultComanda` (incluido el dispositivo receptor de una comanda remota, Req 16.6); y con override de destino (impresora tocada en el grid) enruta a esa impresora (Req 16.4).

**Validates: Requirements 7.1, 7.2, 9.1, 9.2, 10.1, 16.4, 16.6**

### Property 12: Sin predeterminada no se envía a imprimir

*Para toda* `ConfiguracionImpresoras` sin predeterminada para un `RolImpresion` y sin override de destino, la función de impresión de ese rol resuelve un destino `null`, retorna `false` y no invoca el envío a QZ_Tray (`sendToQzPrinter`).

**Validates: Requirements 7.3, 9.5**

### Property 13: Agregación de estado preserva el presence

*Para toda* lista de `EstadoConexion`, `aggregateStatus(estados) === 'connected'` si y solo si al menos un elemento es `'connected'`. Cuando la lista está vacía o todos los elementos son `'unknown'`, el resultado es `'unknown'` (distinto de `'connected'`).

**Validates: Requirements 13.1, 13.2**

## Error Handling

El manejo de errores sigue el principio de **fallar de forma segura y conservadora**: ante cualquier fallo, no se pierde la configuración vigente, no se imprime en una impresora equivocada y la cola de sincronización offline jamás se toca.

| Escenario | Manejo | Requerimientos |
|-----------|--------|----------------|
| QZ_Tray no disponible al listar | `listPrinters` devuelve `[]`; la UI indica "QZ Tray no disponible" y conserva la lista registrada intacta | 1.2, 15.3 |
| QZ responde sin impresoras | La UI indica "no hay impresoras disponibles para agregar" | 1.3 |
| Fallo de `localStorage.setItem` al guardar lista/eliminar | La función de persistencia devuelve `false`; el servicio conserva la `config` en memoria de la sesión y la UI muestra error "no se pudieron guardar los cambios"; **no se escribe en la cola de sync** | 2.6, 3.5, 14.4 |
| Fallo al guardar predeterminada (primera elección o cambio por ▼) | Se cancela la impresión, no se marca la nueva predeterminada, se conserva la anterior y se muestra error | 6.6, 8.5 |
| Datos guardados corruptos/ausentes/ inválidos en el arranque | `loadPrinterConfig` cae a lista vacía y sin predeterminadas mediante `parseStoredList` (que nunca lanza); el arranque continúa | 3.6 |
| Predeterminada guardada referencia impresora inexistente | `validateConfig` invalida esa predeterminada a `null` | 3.7 |
| Migración heredada inválida/vacía | `migrateLegacy` produce config vacía; **se conserva intacta** la `Clave_Impresora_Heredada` y se señala el error de migración | 4.5 |
| Usuario cancela la lista/flujo "Conectar" sin elegir | Se cancela la impresión pendiente, no se guarda predeterminada ni se registra impresora, el documento no se envía | 6.5, 15.7 |
| No conecta QZ en el plazo / impresora no responde al imprimir | La función de impresión retorna `false`; la UI muestra error "impresora no disponible" y el documento no se marca como impreso | 7.4, 8.4, 9.6 |
| Impresora elegida por ▼ no disponible | Se cancela la impresión, se muestra error y se conserva la predeterminada anterior (la nueva solo se confirma tras impresión exitosa) | 8.4 |
| Reporte de cierre: envío falla | Se muestra error "el reporte no se imprimió"; los datos del cierre de caja ya registrado no se alteran (no se toca esa lógica) | 10.4 |
| `Envío_Comanda_Remoto` falla | Se permite/ejecuta la impresión local, se muestra error del remoto, la venta no cambia | 11.4 |
| Impresión local de comanda falla | Se completa el envío remoto, se muestra error local, la venta no cambia | 11.5 |
| WebSocket QZ cerrado | Todas las impresoras pasan a `disconnected`; `config` (lista y predeterminadas) permanece intacta | 12.5 |
| Reconexión COMANDA falla tras 3 intentos | `getPrinterStatus()` queda distinto de `connected`, se registra el error; el arranque de la app no se interrumpe | 13.4 |

## Testing Strategy

### Enfoque dual

- **Property-based tests**: validan las propiedades universales del módulo puro `lib/printerRegistry.ts` (Propiedades 1–13). Es donde la variación de entradas (configuraciones, nombres, estados, cadenas arbitrarias) revela casos límite.
- **Unit tests (ejemplos / edge cases)**: validan interacciones de UI del `PrinterSplitButton` (ticket), del `ComandaTargetGrid` (comanda) y de `PrinterConnectionCard` (estructura, accesibilidad, render condicional), flujos concretos (primera elección de ticket, cancelación, lista vacía, grid sin destinos) y casos de error de `localStorage`.
- **Integration tests (1–3 ejemplos)**: validan la integración con QZ_Tray (listado, conexión, eventos de estado, timeouts) y la coexistencia con el `Envío_Comanda_Remoto`. No se ejecutan con 100 iteraciones porque su comportamiento no varía significativamente con la entrada y el costo es alto.

### Librería de PBT

- Se usará **fast-check** (estándar de facto para property-based testing en TypeScript/JS), integrado con el runner de tests del proyecto. No se implementará PBT desde cero.
- Cada test de propiedad corre un **mínimo de 100 iteraciones** (`fc.assert(fc.property(...), { numRuns: 100 })`).
- Cada test de propiedad lleva un comentario que referencia la propiedad del diseño con el formato:
  `// Feature: multi-impresora-seleccion, Property {número}: {texto de la propiedad}`
- Cada propiedad de correctitud se implementa con **un único** test de propiedad.

### Generadores (arbitraries) sugeridos

- `arbPrinterName`: cadenas no vacías (incluyendo caracteres especiales y nombres tipo `EPSON TM-T20 (LAN)`).
- `arbImpresoraRegistrada`: `{ name: arbPrinterName, addedAt: ISO }`.
- `arbConfig`: lista de `ImpresoraRegistrada` con nombres posiblemente repetidos (para probar dedup) + predeterminadas que pueden o no estar en la lista (para probar `validateConfig`).
- `arbEstado`: `fc.constantFrom('disconnected','connecting','connected','unknown')`; listas de estados para `aggregateStatus`.
- `arbRol`: `fc.constantFrom('TICKET','COMANDA')`.
- `arbCadenaArbitraria`: `fc.string()` y JSON malformado para la robustez del parser (Propiedad 7).

### Tests de ejemplo / integración clave (no PBT)

- Migración base sin datos: `migrateLegacy(null, [])` → config vacía (Req 4.3).
- Migración heredada inválida conserva la clave original (Req 4.5).
- `PrinterSplitButton` (ticket): estructura, flecha siempre presente, marca de predeterminada, navegación por teclado (Enter/Espacio/Escape/flechas) y `aria-label` (Req 5.1–5.5). Verificar que **ningún texto** usa clases `text-amber-*` (resalte de predeterminada y hover en neutro/emerald).
- `ComandaTargetGrid` (comanda): el grid se muestra bajo el título "Enviar comanda a" con ≥1 destino (Req 16.1); compone tarjetas locales + remotas (Req 16.2); usa grid de máximo 3 columnas y la 4ª tarjeta pasa de fila (Req 16.3); tocar tarjeta local llama `onPrintLocal(name)` (→ `printKitchenCommandDirect` + fija `defaultComanda`) (Req 16.4, 16.7); tocar tarjeta remota llama `onSendRemote(userId)` (→ `sendKitchenCommand`) (Req 16.5); tarjeta local con estado ≠ `connected` queda no disponible (Req 16.8); sin destinos muestra "Conectar impresora" (Req 16.9, 15.1). Accesibilidad (`<button>`, `aria-label`, `onKeyDown`) y verificación de que **ningún texto** del grid usa `text-amber-*`.
- Lista/grid vacíos → "Conectar impresora" en lugar de imprimir (Req 5.6, 6.4, 15.1, 16.9).
- Flujo de primera elección de ticket y de cambio por ▼ con persistencia (Req 6.1–6.3, 8.1–8.3).
- Errores de `localStorage` (setItem lanza) en alta, baja y cambio de predeterminada (Req 2.6, 3.5, 6.6, 8.5, 14.4).
- Coexistencia local/remoto: tabla `{localOk,localFail} × {remoteOk,remoteFail}` (Req 11.1–11.5).
- Aislamiento de la cola de sync: spy que verifica cero llamadas a la cola en operaciones de impresora (Req 14.1–14.3).
- Integración QZ: listado, conexión, evento de estado físico, timeout, `getPrinterStatus()` agregado (Req 1.1, 7.4, 9.6, 12.3, 13.3, 13.4).
- `reconnectPrinter` prioriza la predeterminada COMANDA para el presence (Req 13.3).

## Compatibilidad y Migración

### Compatibilidad de la API pública

Todos los consumidores actuales siguen funcionando sin cambios de firma:

| Consumidor | Función usada | Comportamiento tras el refactor |
|-----------|---------------|----------------------------------|
| `lib/shareReceiptPDF.ts` | `getPrinterStatus`, `printReceiptDirect` | `printReceiptDirect` enruta a `defaultTicket`; `getPrinterStatus` agrega el estado de todas las impresoras |
| `hooks/useKitchenPrinter.ts` | `getPrinterStatus`, `onPrinterStatusChange`, `reconnectPrinter`, `printKitchenCommandDirect` | `getPrinterStatus()` sigue devolviendo `'connected'` si alguna impresora lo está; `reconnectPrinter` reconecta registradas priorizando COMANDA; el auto-print de comandas enruta a `defaultComanda` |
| `screens/CashRegisterScreen.tsx` | `printShiftReportDirect`, `connectPrinter`, `probePrinterReachable` | `printShiftReportDirect` enruta a `defaultTicket`; si no hay, exige elección |
| `screens/SuccessScreen.tsx`, `components/SuccessSidebar.tsx` | varias | Ticket se migra a `PrinterSplitButton`; comanda se migra a `ComandaTargetGrid` (destinos locales + remotos). El presence remoto (`useAvailablePrinters`, payload, `kitchenCommandService`) no cambia: solo se re-presenta como tarjetas del grid |
| `components/PrinterConnectionCard.tsx` | conexión | Pasa a gestionar la lista completa |

Los nuevos parámetros (`targetPrinter`) son **opcionales**: si se omiten, el servicio resuelve por rol, preservando el comportamiento de las llamadas existentes.

### Migración de datos (`Clave_Impresora_Heredada` → modelo nuevo)

La migración es **automática, idempotente y no destructiva**, ejecutada por `loadPrinterConfig` en el arranque:

1. Si ya existe `bistro_printers_list` válida y no vacía → se usa tal cual (la migración no dispara). **La clave heredada se ignora** (Req 4.4).
2. Si la lista nueva está vacía/ausente y existe `bistro_thermal_printer` con un valor válido → se crea la lista con esa única impresora y se asigna como `defaultTicket` y `defaultComanda` (Req 4.1, 4.2).
3. Si no hay clave heredada ni datos nuevos → arranque con lista vacía y sin predeterminadas (Req 4.3).
4. Si la clave heredada es inválida/vacía → lista vacía, **se conserva el valor original de la clave heredada** y se señala el error (Req 4.5).
5. La `Clave_Impresora_Heredada` **no se borra** durante la migración, lo que permite un rollback seguro a la versión anterior si fuera necesario.

### No-interferencia con la cola de sync offline

`lib/printerRegistry.ts` solo usa `localStorage` (claves `bistro_printers_list`, `bistro_default_ticket`, `bistro_default_comanda`). No importa ni invoca el módulo de cola offline (IndexedDB / Event Sourcing). Esta separación garantiza por construcción que el conteo de eventos pendientes de la cola sea idéntico antes y después de cualquier operación de impresora (Req 14).

### Alcance preservado (sin cambios)

- `lib/kitchenCommandService.ts` (presence/realtime Supabase): **no se modifica**.
- Firmado RSA (`lib/qzSigning.ts`), encoding ESC/POS y transliteración ASCII (`stripDiacritics`, `createSanitizedEncoder`): **no se modifican**.
- No se agrega alta de impresoras por LAN/IP en la app.
