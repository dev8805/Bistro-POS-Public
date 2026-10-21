# Impresión Térmica con QZ Tray

Servicios: `lib/thermalPrinterService.ts` (conexión/envío QZ), `lib/printerRegistry.ts` (lógica pura de lista y predeterminadas), `lib/qzSigning.ts`
Hooks: `hooks/useKitchenPrinter.ts` (presence remoto), `hooks/usePrinters.ts` (lista, predeterminadas y estado para la UI)
UI: `components/PrinterConnectionCard.tsx` (gestión de la lista), `components/PrinterSplitButton.tsx` (ticket), `components/ComandaTargetGrid.tsx` (comanda), `components/SettingsSidebarPanel.tsx`, `screens/SuccessScreen.tsx`, `components/SuccessSidebar.tsx`, `screens/CashRegisterScreen.tsx`, `screens/TrainingScreen.tsx`
Instalador del cliente: `qz-setup/`
Tecnología: [QZ Tray](https://qz.io) (WebSocket local) + ESC/POS + firmado RSA-2048 (Web Crypto)

Sistema de impresión térmica de Bistro POS. Reemplaza el enfoque anterior de **WebUSB/WebSerial + Zadig**. Ahora la app se comunica con la app de escritorio **QZ Tray** (instalada en el equipo del usuario) por WebSocket local, y QZ envía los comandos ESC/POS crudos a la impresora.

> [!IMPORTANT]
> La migración a QZ resuelve dos problemas del enfoque anterior con Zadig: (1) en Windows ya **no hace falta instalar drivers WinUSB por impresora**, y (2) QZ funciona con cualquier impresora reconocida por el sistema operativo. A cambio, el usuario debe instalar QZ Tray una vez por equipo.

> [!IMPORTANT]
> Desde la feature **multi-impresora-seleccion**, el sistema ya **no maneja una sola impresora**: gestiona una **lista de impresoras registradas** con una **impresora predeterminada independiente por rol** — `TICKET` (ticket de venta y reporte de cierre) y `COMANDA` (comanda de cocina). Ver la sección [Modelo de varias impresoras](#modelo-de-varias-impresoras-registradas). Las secciones de firmado RSA, `override.crt`, instalador, transliteración ASCII, líneas ASCII y consolidación de filas siguen vigentes sin cambios.

---

## Por qué QZ y no WebUSB

| Aspecto | WebUSB + Zadig (anterior) | QZ Tray (actual) |
|---|---|---|
| Driver en Windows | Requiere instalar WinUSB con Zadig por cada impresora | No requiere (usa el driver normal del SO) |
| Navegadores | Solo Chrome/Edge/Opera (WebUSB) | Cualquiera (la app habla por WebSocket a `localhost`) |
| Software extra | Ninguno | QZ Tray instalado en el equipo |
| Selección de impresora | Diálogo USB del navegador | Lista de impresoras del SO vía QZ |
| Diálogos en cada impresión | No (tras emparejar) | No — **solo si el certificado está firmado y confiado** |

---

## Arquitectura

```
┌──────────────────┐   WebSocket wss://localhost:8181   ┌────────────┐   ESC/POS   ┌───────────┐
│  Bistro POS (web)│ ─────────────────────────────────→ │  QZ Tray   │ ──────────→ │ Impresora │
│  thermalPrinter  │   mensajes firmados (RSA-2048)      │ (escritorio)│   crudo     │  térmica  │
│  Service.ts      │ ←───────────────────────────────── │            │             └───────────┘
└──────────────────┘     lista de impresoras del SO      └────────────┘
```

- La app **firma cada mensaje** con la clave privada embebida (`lib/qzSigning.ts`).
- QZ valida la firma contra el certificado confiado (`override.crt`) y, si coincide, imprime **sin mostrar diálogos**.
- El encoding ESC/POS se genera con `@point-of-sale/receipt-printer-encoder` y se envía en hex a `qz.print()`.

---

## Modelo de varias impresoras registradas

El sistema separa dos responsabilidades que antes estaban mezcladas en el servicio:

1. **Lógica pura de configuración** — lista, predeterminadas por rol, migración, validación, persistencia y agregación de estado. Vive en el módulo nuevo `lib/printerRegistry.ts`, **sin dependencias de QZ Tray ni del DOM** (testeable con property-based testing).
2. **Conexión y envío físico** vía QZ Tray — permanece en `lib/thermalPrinterService.ts`, pero ahora consulta al registro para resolver a qué impresora enviar y mantiene un **mapa de estado por impresora** en lugar de un único `currentStatus`.

```
┌──────────────────────────────┐         ┌──────────────────────────────┐
│  lib/thermalPrinterService   │         │   lib/printerRegistry.ts      │
│  (efectos: QZ Tray / DOM)    │ ──usa──▶ │   (LÓGICA PURA, sin efectos)  │
│  - connectPrinter            │         │  - addPrinter / removePrinter │
│  - sendToQzPrinter(data,name)│         │  - setDefault / getDefaultForRole │
│  - estado por impresora (Map)│         │  - validateConfig / migrateLegacy │
│  - getPrinterStatus (agrega) │         │  - aggregateStatus / parseStoredList │
└──────────────────────────────┘         │  - loadPrinterConfig / savePrinterList │
                                          │  - saveDefault                │
                                          └──────────────────────────────┘
```

### `lib/printerRegistry.ts` (módulo de lógica pura)

Tipos del dominio:

```typescript
type RolImpresion = 'TICKET' | 'COMANDA';
type EstadoConexion = 'disconnected' | 'connecting' | 'connected' | 'unknown';

interface ImpresoraRegistrada {
    name: string;       // identificador único (nombre que reporta QZ Tray)
    addedAt: string;    // ISO timestamp del alta
}

interface ConfiguracionImpresoras {
    printers: ImpresoraRegistrada[];
    defaultTicket: string | null;   // name de una impresora de la lista, o null
    defaultComanda: string | null;  // name de una impresora de la lista, o null
}
```

Funciones puras (no mutan la entrada; devuelven nueva config):

| Función | Qué hace |
|---|---|
| `addPrinter(config, name, addedAt?)` | Añade evitando duplicados por nombre. Devuelve `{ config, alreadyExisted }` |
| `removePrinter(config, name)` | Quita la impresora y pone a `null` las predeterminadas que la referencian |
| `setDefault(config, role, name)` | Asigna la predeterminada de un rol **sin tocar el otro rol** |
| `getDefaultForRole(config, role)` | Devuelve la predeterminada del rol, o `null` |
| `validateConfig(config)` | Invalida (a `null`) predeterminadas que no referencian una impresora existente |
| `migrateLegacy(legacyValue, currentList)` | Construye la config migrando desde la clave heredada cuando aplica |
| `aggregateStatus(statuses[])` | Agrega varios estados a uno solo |
| `parseStoredList(raw)` | Parsea la lista almacenada de forma segura; ante datos corruptos devuelve `[]` sin lanzar |

Persistencia (efecto acotado sobre `localStorage`):

| Función | Qué hace |
|---|---|
| `loadPrinterConfig()` | Lee y normaliza toda la config aplicando migración + validación. Devuelve `{ config, migrationError }`. Nunca lanza ni interrumpe el arranque |
| `savePrinterList(printers)` | Persiste la lista. Devuelve `false` si el guardado falla |
| `saveDefault(role, name)` | Persiste la predeterminada de un rol (o la borra si `name === null`). Devuelve `false` si falla |

**Reglas de `aggregateStatus`** (orden de prioridad): si alguna impresora está `connected` → `connected`; si no y alguna está `connecting` → `connecting`; si no y alguna está `disconnected` → `disconnected`; si todas están `unknown` (o la lista está vacía) → `unknown`. Esto preserva el presence de comandas (solo necesita distinguir `connected` del resto) y deja `unknown` cuando aún no hay reporte.

### Claves de `localStorage` y migración no destructiva

| Clave | Contenido | Ejemplo |
|-------|-----------|---------|
| `bistro_printers_list` | JSON de `ImpresoraRegistrada[]` | `[{"name":"POS-80C","addedAt":"2026-01-01T10:00:00Z"}]` |
| `bistro_default_ticket` | `string` (name) o ausente | `"POS-80C"` |
| `bistro_default_comanda` | `string` (name) o ausente | `"EPSON Cocina LAN"` |
| `bistro_thermal_printer` *(heredada)* | `string` (name) | `"POS-80C"` |

La migración desde la **clave heredada** (`bistro_thermal_printer`, del modelo de impresora única anterior) es **automática, idempotente y no destructiva**, ejecutada por `loadPrinterConfig` en el arranque:

1. Si ya existe `bistro_printers_list` válida y no vacía → se usa tal cual; la clave heredada se **ignora**.
2. Si la lista nueva está vacía/ausente y existe `bistro_thermal_printer` con valor válido → se crea la lista con **esa única impresora** y se la asigna como **`defaultTicket` y `defaultComanda`** (default de ambos roles).
3. Si no hay clave heredada ni datos nuevos → arranque con lista vacía y sin predeterminadas.
4. Si la clave heredada es inválida/vacía → lista vacía, se **conserva el valor original** y se señala `migrationError`.

> [!IMPORTANT]
> La `bistro_thermal_printer` **no se borra** durante la migración. Esto permite un rollback seguro a la versión anterior si fuera necesario.

> [!NOTE]
> `printerRegistry.ts` usa **exclusivamente `localStorage`**: ninguna operación de impresora toca la cola de sincronización offline (IndexedDB / Event Sourcing). El conteo de eventos pendientes es idéntico antes y después de cualquier operación de impresora.

### Predeterminada por ROL

El enrutamiento del documento depende de su rol, resuelto por `resolveTarget(role, override?)` dentro del servicio (`override ?? getDefaultForRole(config, role)`):

| Función de impresión | Rol | Predeterminada usada |
|---|---|---|
| `printReceiptDirect` | `TICKET` | `defaultTicket` |
| `printShiftReportDirect` | `TICKET` | `defaultTicket` |
| `printKitchenCommandDirect` | `COMANDA` | `defaultComanda` |

Las tres funciones aceptan ahora un **3er parámetro opcional `targetPrinter`** que sobreescribe la predeterminada del rol (lo usa la flecha ▼ del split button de ticket y el toque de una tarjeta local del grid de comanda). Si el destino resuelto es `null` (sin predeterminada y sin override), la función **no imprime** y retorna `false` (la UI muestra el error o despliega la lista).

`sendToQzPrinter(data, printerName)` recibe ahora el **destino por parámetro** (antes salía de una variable global única), lo que habilita la impresión por rol y por override:

```typescript
// ANTES: sendToQzPrinter(data)             → usaba selectedPrinterName global
// AHORA: sendToQzPrinter(data, printerName) → destino explícito
```

### Estado por impresora (Map) y presence

El servicio mantiene `printerStatuses: Map<string, EstadoConexion>` (estado por nombre de impresora; default `unknown` hasta el primer reporte de QZ). `getPrinterStatus()` proyecta ese mapa con `aggregateStatus` a un único `PrinterStatus`, devolviendo **`connected` si al menos una impresora lo está**. Así se preserva la API existente y el presence de comandas.

`reconnectPrinter()` reconecta todas las impresoras registradas, pero **prioriza la impresora del rol `COMANDA`** para que el dispositivo de cocina se anuncie cuanto antes en el presence.

Nueva API pública del servicio para la gestión de la lista:

```typescript
getRegisteredPrinters(): ImpresoraRegistrada[]
registerPrinter(name): { ok: boolean; alreadyExisted: boolean }   // dedup + persiste
unregisterPrinter(name): boolean                                   // false si falla la persistencia
getDefaultPrinter(role): string | null
setDefaultPrinter(role, name): boolean                             // false si falla la persistencia
getPrinterStatusFor(name): EstadoConexion                          // estado de una impresora puntual
onConfigChange(listener): () => void                               // notifica cambios de config (cleanup en el return)
```

### Hook `hooks/usePrinters.ts`

Expone a la UI la lista, las predeterminadas, el estado por rol y las acciones, encapsulando toda la suscripción al servicio (ningún componente hace fetching ni mantiene estado disperso). Se suscribe a `onConfigChange` y `onPrinterStatusChange` y deriva `statusTicket`/`statusComanda` con `useMemo` (no con `useEffect`).

```typescript
interface UsePrintersResult {
    printers: ImpresoraRegistrada[];
    defaultTicket: string | null;
    defaultComanda: string | null;
    statusTicket: EstadoConexion;   // estado de la predeterminada TICKET
    statusComanda: EstadoConexion;  // estado de la predeterminada COMANDA
    statusFor: (name) => EstadoConexion;   // estado de cualquier impresora (lo usa el grid)
    globalStatus: PrinterStatus;    // resultado de getPrinterStatus()
    listQzPrinters: () => Promise<string[]>;
    addPrinter: (name) => Promise<{ ok; alreadyExisted }>;
    removePrinter: (name) => Promise<boolean>;
    setDefault: (role, name) => boolean;
    getDefault: (role) => string | null;
}
```

Lo consumen cuatro superficies: `PrinterConnectionCard`, `SuccessScreen`, `SuccessSidebar` y (parcialmente) `CashRegisterScreen`.

### UI según el rol

> **Nota de color:** ningún texto de estos componentes usa amarillo/ámbar (`text-amber-*`). Los resaltes (predeterminada, hover, destino activo) usan neutro (`text-gray-*`/`text-slate-*`) o `emerald`/`green` del design system. El punto de estado puede usar `bg-green-500`.

**Ticket → `components/PrinterSplitButton.tsx`** (botón dividido, **solo rol TICKET**). Reutilizado por `SuccessScreen` y `SuccessSidebar`. La acción principal imprime en la `defaultTicket`; la flecha ▼ despliega la lista para elegir otra impresora, que se fija como nueva `defaultTicket` (se "pega") y luego imprime en ella. Con lista vacía muestra "Conectar impresora"; sin predeterminada abre el menú y obliga a elegir; las impresoras con estado distinto de `connected` aparecen deshabilitadas.

```
┌────────────────────────────────────────┬──────┐
│  🖨  Imprimir Ticket                     │  ▼   │
│      (acción principal → default TICKET) │      │
└────────────────────────────────────────┴──────┘
```

> **Presentación (ajustes finales):** el botón de ticket usa un estilo neutro limpio (superficie blanca + borde sutil, sin verde sólido) con un **punto de estado** a la derecha (verde si la `defaultTicket` está conectada, gris si no). El menú de la flecha ▼ se abre **hacia arriba** (`bottom-full`) por el poco espacio inferior en la pantalla de éxito, con encabezado "Elegir impresora" resaltado (emerald/bold) y borde marcado. En `SuccessScreen` el encabezado superior (ícono/título/total) se compactó para dar simetría con la parte inferior. El ícono de eliminar impresora usa `material-symbols` `delete` (no emoji).

**Comanda → `components/ComandaTargetGrid.tsx`** (grid "Enviar comanda a", **solo rol COMANDA**, máximo 3 tarjetas por fila). El rol `COMANDA` **ya no usa** botón dividido ni flecha ▼. Reutilizado por `SuccessScreen` y `SuccessSidebar`. Unifica **dos tipos de destino** en una sola superficie tocable (Opción 1):

- **Tarjeta local** (`kind: 'local'`): impresora registrada. Al tocarla → `printKitchenCommandDirect(data, paperWidth, name)` y se fija esa impresora como `defaultComanda`. Una local con estado ≠ `connected` se muestra no disponible y no imprime.
- **Tarjeta remota** (`kind: 'remote'`): dispositivo de cocina disponible vía presence. Al tocarla → `sendKitchenCommand(business, userId, data)`; el dispositivo **receptor imprime en su propia `defaultComanda`** (el emisor no elige la impresora física del receptor).

```
  Enviar comanda a
  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
  │ 🖨 POS-80C   │ │ 🖨 EPSON     │ │ 📡 Cocina 2  │
  │  ✓ Predet.   │ │              │ │   (remoto)   │
  │  ● conectada │ │ ● conectada  │ │ ● disponible │
  └──────────────┘ └──────────────┘ └──────────────┘
```

El padre construye `targets` combinando `usePrinters()` (impresoras locales + estado por nombre) con `useAvailablePrinters()` (dispositivos remotos por presence, **sin cambios**).

**Gestión de la lista → `components/PrinterConnectionCard.tsx`** (modificado). Pasa de gestionar una conexión única a gestionar la lista completa:

- "Agregar impresora" abre la lista de QZ Tray y registra + conecta la elegida (con dedup, sin alta manual por IP).
- 🗑 pide confirmación (vía `useConfirmDialog`) identificando la impresora antes de eliminarla.
- Toggles "Predet. Ticket" / "Predet. Comanda" llaman `setDefault(role, name)`; son **independientes** entre sí.

### Reporte de cierre (`screens/CashRegisterScreen.tsx`)

`handlePrintShiftReport` usa la **`defaultTicket`** (rol `TICKET`). Si no hay predeterminada pero la lista tiene impresoras, despliega la lista para elegir una, la fija como `defaultTicket` e imprime en ella. Si la lista está vacía, indica registrar una impresora en Ajustes y **no imprime**.

### Flujo "Conectar impresora" desde la pantalla de éxito (`PrinterSettingsPanel`)

Cuando en la pantalla de éxito (`SuccessScreen` / `SuccessSidebar`) la lista de impresoras está vacía o la `defaultTicket` no está conectada, el botón principal del `PrinterSplitButton` muestra **"Conectar impresora"** y al tocarlo abre el panel lateral **`PrinterSettingsPanel`** (el mismo que usa el `Sidebar`). Lo mismo aplica al `ComandaTargetGrid`: si una tarjeta local está desconectada, al tocarla abre el panel para reconectar; si no hay ningún destino (locales ni remotos), el grid se oculta y la única opción de "Conectar impresora" la ofrece el botón de ticket (evita botón duplicado).

Detalles técnicos del panel:

- **Portal a `document.body`:** el panel completo se monta vía `createPortal` para que su backdrop y drawer queden fuera de cualquier contexto de apilamiento de su contenedor (ej. el `<aside>` del `SuccessSidebar` con `z-[61] relative`). Sin esto, el backdrop quedaba "atrapado" y se veía un sombreado extra.
- **Prop `coverSidebar`:** controla si el backdrop respeta el `Sidebar` izquierdo (`md:left-64`, valor por defecto, uso desde el propio `Sidebar`) o lo cubre por completo (`fixed inset-0`, uso desde las pantallas de éxito para que no se vea el menú detrás).
- **Cierre:** X o tocar el fondo cierran el panel y devuelven a la pantalla de éxito sin perder la venta. Al conectar/registrar dentro del panel, las pantallas se actualizan solas (vía `usePrinters`).

Consecuencia: las pantallas de éxito ya no tienen flujo inline propio (`listPrinters`/`connectPrinter`/mini-lista flotante). Toda la conexión vive en el panel reutilizable.



El flujo remoto (`lib/kitchenCommandService.ts` + presence/realtime de Supabase, `useAvailablePrinters`) **no se modificó**. Coexiste con la impresión local: el grid de comanda solo cambia la *presentación* (de una lista vertical a tarjetas), pero el payload de presence y el envío remoto son idénticos. Lo único que se ajustó respecto al presence es de qué condición depende `getPrinterStatus()` (ahora estado agregado).

---

## Firmado y supresión de diálogos

Sin firma, QZ muestra en **cada impresión** el diálogo *"Untrusted website / Action Required"*. Para suprimirlo hacen falta **dos piezas** (ambas son necesarias; una sola no basta):

### 1. Firmar los mensajes en la app (`lib/qzSigning.ts`)

- Contiene el **certificado público** y la **clave privada** RSA-2048 (PKCS#8) de "Bistro POS".
- Firma cada mensaje con `RSASSA-PKCS1-v1_5 + SHA-512` usando **Web Crypto** del navegador.
- El firmado ocurre **en el cliente**, por lo que **funciona offline** (requisito del POS).
- `setupQzSecurity(qz)` registra `setCertificatePromise` y `setSignaturePromise`. Se llama una vez al cargar `thermalPrinterService.ts`.

> [!NOTE]
> La clave privada va embebida en el frontend. Es el tradeoff conocido del firmado client-side de QZ y es aceptable para un POS local: la clave solo sirve para firmar mensajes hacia el QZ del propio equipo. La clave/certificado maestros se generaron con OpenSSL y la copia original vive en `.qz-signing/` (ignorada por git).

### 2. Confiar en el certificado en cada equipo (`override.crt`)

El firmado solo es suficiente si QZ **confía** en el certificado. Como es autofirmado (no encadena con la raíz de QZ), QZ lo marca como desconocido y **bloquea** la opción "Allow + Remember". La solución es instalar el certificado como raíz confiable:

- Copiar `qz-setup/override.crt` a `C:\Program Files\QZ Tray\override.crt` y reiniciar QZ.
- Con eso, QZ confía en mensajes firmados por esa clave y **no muestra ningún diálogo**, ni el primero.

El certificado de `override.crt` y el certificado de `qzSigning.ts` **deben ser el mismo par de llaves**. Si no coinciden, el diálogo persiste (síntoma: el diálogo muestra "Bistro POS" pero "Allow" se deshabilita al marcar "Remember").

---

## Instalador del cliente (`qz-setup/`)

Carpeta con todo lo necesario para dejar un equipo listo. Se distribuye como ZIP (`Configurador-Impresora-Bistro.zip`).

| Archivo | Función |
|---|---|
| `override.crt` | Certificado público de Bistro (debe ir siempre junto al `.bat`) |
| `Configurar-Impresora-Bistro.bat` | Instalador de **un clic**: se auto-eleva a admin, cierra QZ, respalda el `override.crt` anterior, copia el de Bistro y reinicia QZ |
| `LEEME.txt` | Instrucciones de 3 pasos para el usuario final |
| `instalar-certificado.ps1` | Variante en PowerShell del mismo proceso (uso técnico / depuración) |

Flujo del usuario final: **instalar QZ Tray** (sitio oficial) → **doble clic al `.bat`** y "Sí" al aviso → **elegir impresora** en Ajustes de Bistro.

> [!NOTE]
> El ZIP se aloja en Supabase Storage (bucket `Recursos`) y se descarga desde la pantalla de **Capacitación** (`TrainingScreen.tsx`), tarjeta "Conectar Impresora", que también enlaza la descarga oficial de QZ Tray.

---

## API del servicio (`thermalPrinterService.ts`)

```typescript
// ---- Listado / conexión ----
listPrinters(): Promise<string[]>            // impresoras del SO vía QZ
connectPrinter(printerName?): Promise<bool>  // conecta + registra + escucha estado
reconnectPrinter(): Promise<bool>            // reconecta las registradas (prioriza COMANDA para el presence)
disconnectPrinter(): Promise<void>
probePrinterReachable(timeoutMs?, name?): Promise<bool|null>  // verificación física puntual

// ---- Estado (agregado para preservar el presence) ----
getPrinterStatus(): 'disconnected' | 'connecting' | 'connected' | 'unknown'  // 'connected' si alguna lo está
getPrinterStatusFor(name): EstadoConexion    // estado de una impresora puntual
onPrinterStatusChange(listener): () => void

// ---- Gestión de la lista de impresoras ----
getRegisteredPrinters(): ImpresoraRegistrada[]
registerPrinter(name): { ok: bool; alreadyExisted: bool }   // dedup + persiste
unregisterPrinter(name): bool                               // false si falla la persistencia
getDefaultPrinter(role): string | null
setDefaultPrinter(role, name): bool                         // false si falla la persistencia
onConfigChange(listener): () => void                        // cambios de lista/predeterminadas

// ---- Impresión (3er parámetro opcional targetPrinter para sobreescribir el rol) ----
printReceiptDirect(data, paperWidth?, targetPrinter?): Promise<bool>        // rol TICKET
printShiftReportDirect(data, paperWidth?, targetPrinter?): Promise<bool>    // rol TICKET
printKitchenCommandDirect(data, paperWidth?, targetPrinter?): Promise<bool> // rol COMANDA
```

- La lista de impresoras y las predeterminadas por rol se guardan en `localStorage` (`bistro_printers_list`, `bistro_default_ticket`, `bistro_default_comanda`). La clave heredada `bistro_thermal_printer` se migra automáticamente al arranque (ver [Modelo de varias impresoras](#modelo-de-varias-impresoras-registradas)).
- El destino de impresión se resuelve por rol con `resolveTarget(role, override?)` y se pasa a `sendToQzPrinter(data, printerName)`. Si no hay destino (`null`), la función no imprime y retorna `false`.
- `getPrinterStatus()` ahora devuelve el **estado agregado** de todas las impresoras vigiladas (`connected` si al menos una lo está).
- `isWebSerialSupported` / `isWebUSBSupported` se mantienen como alias que devuelven `true` (compatibilidad con la UI existente; QZ funciona en cualquier navegador).

### Consolidación de filas en el ticket de venta

En modo Catálogo, cada "+" en una tarjeta crea una fila individual en el carrito (ver [`modo_catalogo_pos.md`](./modo_catalogo_pos.md)). Para que el **ticket de venta** no muestre N filas repetidas del mismo producto, `printReceiptDirect` consolida los items con el helper `consolidateReceiptItems` (`lib/receiptUtils.ts`).

Reglas de consolidación:
- Solo aplica a productos **por unidad** (`unit` vacío, `'Unidad'` o `'Und'`). Los productos por **peso/medida** (Libras, Kilogramos, etc.) nunca se fusionan.
- Agrupa por nombre + precio unitario + descuento, **ignorando las modificaciones** (el ticket de venta no las imprime y no afectan el precio).
- El `total` se **suma** por fila (no se recalcula como precio × cantidad) para preservar el redondeo y que el total del ticket cuadre con lo cobrado.

El mismo helper se usa en `ReceiptThermalPDF` (PDF del ticket) y en el texto del comprobante por WhatsApp (`SuccessSidebar`). Las **comandas de cocina** (`printKitchenCommandDirect`) NO consolidan: muestran cada fila individual con sus modificaciones.

### Robustez de la conexión WebSocket

- **Conexión única en vuelo:** `ensureQzConnected` reutiliza una sola promesa de conexión para evitar que varias pantallas que llaman `reconnectPrinter()` a la vez colisionen al abrir el WebSocket.
- **Detección de cierre:** `qz.websocket.setClosedCallbacks(...)` pone **todas las impresoras** en `disconnected` si QZ se cierra (conservando la lista y predeterminadas en memoria), para que el presence de comandas (realtime) se actualice correctamente.
- **Detección de desconexión física (USB):** el WebSocket app↔QZ puede seguir vivo aunque se desenchufe el cable. Para reflejar la presencia física real se escuchan los eventos de estado del spooler con `qz.printers.startListening(nombre)` + `setPrinterCallbacks(...)` (QZ 2.1+) **para cada impresora registrada**. Estados `OFFLINE`/`NOT_AVAILABLE` ponen esa impresora en `disconnected` en el `Map` de estado (sin borrarla de la lista, para reanudar sola al reconectar); `OK` y estados de impresión normales la devuelven a `connected`. El estado global se recalcula con `aggregateStatus`, lo que apaga los botones de imprimir/comanda y retira el equipo del presence si ninguna queda conectada, y evita encolar tickets fantasma. El listener se (re)inicia en cada `connectPrinter`/`reconnectPrinter`.
- **Verificación puntual antes de imprimir:** `probePrinterReachable()` consulta el estado real (`qz.printers.getStatus()`) y resuelve `true`/`false`/`null`. Se usa tras una (re)conexión manual —p. ej. el botón "Conectar impresora" del `SuccessSidebar`— donde el evento de estado aún no llegó, para no colar un ticket fantasma. **Limitación:** Windows puede tardar unos segundos en reportar `OFFLINE` tras desenchufar, según el driver.

### Líneas separadoras en ASCII (compatibilidad de code page)

Las líneas divisorias del ticket y la comanda se generan con caracteres **ASCII** (`'-'.repeat(columns)` y `'='.repeat(columns)`), **no** con `encoder.rule()`.

**Por qué:** el método `rule()` de `@point-of-sale/receipt-printer-encoder` dibuja las líneas con caracteres de dibujo de cajas (`─` = byte `0xC4`, `═` = byte `0xCD`) y fuerza el code page `cp437` vía el comando `ESC t`. Las impresoras con firmware chino tienen GBK como code page por defecto e **ignoran** ese `ESC t`, por lo que interpretan esos bytes altos como caracteres de doble byte:

| Línea | Byte enviado (CP437) | GBK lo imprime como |
|---|---|---|
| `═══` (`rule` double) | `0xCD 0xCD …` | 屯 屯 屯 |
| `───` (`rule` dashed) | `0xC4 0xC4 …` | 哪 哪 哪 |

El texto normal nunca se rompe porque es ASCII (`< 0x80`), idéntico en todos los code pages. Solo se rompían las líneas. La solución es usar `-` (`0x2D`) y `=` (`0x3D`): bytes ASCII que **toda** impresora interpreta igual sin depender del `ESC t`. Las líneas conservan el ancho exacto del papel (`columns`: 32 en 58mm, 48 en 80mm), así que el aspecto no cambia.

> [!IMPORTANT]
> No reintroducir `encoder.rule()` para los separadores: regresaría el problema en impresoras con code page no latino.

### Transliteración a ASCII (tildes y ñ)

Todo el texto que va a la térmica se transliterar a ASCII antes de imprimir: `Ó→O`, `é→e`, `ñ→n`, `ü→u`. Lo hace el helper `stripDiacritics` (`text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')`), aplicado de forma centralizada en `createSanitizedEncoder`, que crea el encoder y envuelve sus métodos `line`, `text` y `table` para limpiar cualquier string —literal o dinámico— sin que se escape ninguno.

**Por qué:** es el mismo problema de code page que las líneas separadoras, en dos capas:

| Capa | Síntoma | Causa |
|---|---|---|
| Software | `PATACÓN` → `PATAC?N` | El encoder queda fijo en **CP437** (default; nunca se llama `codepage('auto')`). CP437 no tiene las vocales acentuadas mayúsculas (Á Í Ó Ú), así que la librería las reemplaza por `?` (byte `0x3F`) antes de enviar. |
| Hardware | `Método` → `M倀odo` | El encoder envía el byte `0x82` (`é` en CP437) + `ESC t 0`. Las impresoras de firmware chino **ignoran `ESC t`** y quedan en **GBK**: ahí leen `0x82 0x74` (`é`+`t`) como **un solo carácter chino de doble byte**, comiéndose la `t` siguiente. |

Las soluciones que dependen del code page (`codepage('auto')` o fijar `cp850`/`cp1252`) **no sirven en este hardware** porque la impresora ignora `ESC t`. Enviar solo bytes ASCII (`< 0x80`) es lo único 100% fiable: esos bytes se imprimen igual en CP437, GBK o cualquier tabla.

**No afecta la velocidad de impresión:** la transliteración ocurre en JS antes de enviar, produce el mismo número de bytes/caracteres y no agrega comandos de control (a diferencia de `codepage('auto')`, que insertaría bytes `ESC t` extra).

**Alcance:** solo afecta el texto impreso en la térmica. La pantalla, los PDF (`@react-pdf`) y el comprobante por WhatsApp siguen mostrando tildes y ñ con UTF-8 normal.

> [!NOTE]
> Tradeoff conocido: `ñ→n` puede cambiar el significado (`año`→`ano`). Es el precio de la fiabilidad en impresoras que ignoran el code page. Si en el futuro se estandariza un modelo que sí respete `ESC t`, se podría evaluar `codepage('auto')` en su lugar.

> [!IMPORTANT]
> No imprimir texto crudo sin pasar por `createSanitizedEncoder`. Si se crea un encoder nuevo directamente con `new ReceiptPrinterEncoder(...)`, regresarían los `?` y glifos chinos.

---

## Relación con el presence de comandas

El sistema de comandas a cocina (ver [`comandas_cocina.md`](./comandas_cocina.md)) depende del estado de la impresora: un dispositivo solo se anuncia como "online con impresora" cuando `getPrinterStatus() === 'connected'`.

Para que esto siga funcionando con el modelo de varias impresoras, `getPrinterStatus()` devuelve el **estado agregado** (`connected` si **al menos una** impresora registrada lo está). `useKitchenPrinter` (montado global en `App.tsx`) llama a `reconnectPrinter()` al iniciar, que reconecta las impresoras registradas **priorizando la del rol `COMANDA`** para anunciar el equipo de cocina cuanto antes, sin necesidad de abrir una pantalla concreta.

> [!IMPORTANT]
> El equipo con impresora debe haber **registrado y conectado al menos una vez** (para que quede en `bistro_printers_list` de ese navegador). Después, la reconexión y el anuncio en presence son automáticos al abrir la app.

---

## Archivos involucrados

| Archivo | Rol |
|---|---|
| `lib/thermalPrinterService.ts` | Conexión QZ, firmado (vía `qzSigning`), listado/gestión de la lista de impresoras, estado por impresora (`Map`) y agregación, enrutamiento por rol (`resolveTarget`), `sendToQzPrinter(data, name)`, encoding ESC/POS de tickets y comandas, transliteración ASCII (`stripDiacritics`/`createSanitizedEncoder`) |
| `lib/printerRegistry.ts` | **Lógica pura** de lista, predeterminadas por rol, migración (`migrateLegacy`), validación (`validateConfig`), agregación de estado (`aggregateStatus`), parseo seguro (`parseStoredList`) y persistencia en `localStorage` (`loadPrinterConfig`/`savePrinterList`/`saveDefault`). Sin QZ ni DOM |
| `lib/receiptUtils.ts` | `consolidateReceiptItems`: consolida filas del mismo producto para el ticket de venta |
| `lib/qzSigning.ts` | Certificado + clave privada y firmado de mensajes con Web Crypto |
| `lib/kitchenCommandService.ts` | Presence/realtime de comandas remotas (Supabase). **No se modificó**; coexiste con la impresión local |
| `hooks/useKitchenPrinter.ts` | Auto-reconexión al iniciar + presence de comandas (`useAvailablePrinters`) |
| `hooks/usePrinters.ts` | Hook de UI: lista, predeterminadas, estado por rol/impresora y acciones (suscrito a `onConfigChange`/`onPrinterStatusChange`) |
| `components/PrinterConnectionCard.tsx` | Gestión de la lista: agregar (desde QZ), eliminar (con confirmación), asignar predeterminada por rol |
| `components/PrinterSplitButton.tsx` | Botón dividido del rol **TICKET** (acción principal + flecha ▼). Usado por `SuccessScreen`/`SuccessSidebar` |
| `components/ComandaTargetGrid.tsx` | Grid "Enviar comanda a" del rol **COMANDA** (impresoras locales + dispositivos remotos, máx 3 por fila). Usado por `SuccessScreen`/`SuccessSidebar` |
| `screens/SuccessScreen.tsx`, `components/SuccessSidebar.tsx` | Ticket (split button) + comanda (grid) tras la venta |
| `screens/CashRegisterScreen.tsx` | Reporte de cierre → rol TICKET (`defaultTicket`; si no hay, exige elegir) |
| `components/SettingsSidebarPanel.tsx` | Panel de Ajustes que aloja la gestión de impresoras y el ancho de papel |
| `components/PrinterSettingsPanel.tsx` | Panel lateral solo de impresora (sin permisos), reutilizado desde el `Sidebar` y desde las pantallas de éxito (`coverSidebar` para cubrir el menú izquierdo) |
| `screens/TrainingScreen.tsx` | Tarjeta "Conectar Impresora" con descargas (QZ + configurador) |
| `qz-setup/` | Instalador del certificado para el cliente |
| `.qz-signing/` | Copia maestra del par de llaves (ignorada por git) |
