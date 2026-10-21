# Selección de varias impresoras (default por rol: ticket / comanda)

**Fecha:** 2026-06-17
**Spec:** `.kiro/specs/multi-impresora-seleccion/` (requirements + design + tasks)
**Doc de módulo:** `docs/caracteristicas/impresion_termica_qz.md`
**Guía de usuario:** `docs/guias_usuario/como_configurar_impresora.md`

## Contexto / problema raíz

El servicio de impresión (`lib/thermalPrinterService.ts`) manejaba **una sola
impresora** (`selectedPrinterName` + clave `localStorage` `bistro_thermal_printer`).
No se podía, por ejemplo, imprimir el **ticket** en la impresora del mostrador
(USB) y enviar la **comanda** a una impresora de **cocina conectada por red/LAN**.

Objetivo: registrar **varias impresoras** (las que el equipo ya ve vía QZ Tray,
sin configurar IP en la app — la de red se instala en Windows como puerto TCP/IP
y aparece sola en la lista) y elegir, de forma **independiente por rol**, cuál
imprime **tickets** (`TICKET`) y cuál imprime **comandas** (`COMANDA`).

> Nota física: la impresora de cocina por LAN se conecta al router; en Windows se
> agrega como impresora de **puerto TCP/IP estándar** (puerto 9100) con IP fija.
> Así QZ la lista igual que una USB. La app NO abre sockets a la IP por sí misma;
> QZ sigue siendo el puente (el navegador no puede hablar TCP crudo).

---

## Cambios aplicados

### 1. Módulo de lógica pura — `lib/printerRegistry.ts` (nuevo)

Lógica sin efectos (testeable) + acceso acotado a `localStorage`:

- Tipos: `RolImpresion` (`'TICKET' | 'COMANDA'`), `EstadoConexion`
  (`'disconnected' | 'connecting' | 'connected' | 'unknown'`),
  `ImpresoraRegistrada`, `ConfiguracionImpresoras`.
- Funciones puras: `addPrinter` (dedup por nombre), `removePrinter` (limpia
  predeterminadas que la referencian), `setDefault`, `getDefaultForRole`,
  `validateConfig` (invalida predeterminadas colgantes), `migrateLegacy`,
  `aggregateStatus` (prioridad `connected` > `connecting` > `disconnected` >
  `unknown`), `parseStoredList` (parseo seguro, nunca lanza).
- Persistencia: `loadPrinterConfig` (lee + migra + valida), `savePrinterList`,
  `saveDefault` (devuelven `false` ante fallo, sin tocar la cola de sync offline).

Claves nuevas de `localStorage`: `bistro_printers_list`, `bistro_default_ticket`,
`bistro_default_comanda`. **Migración no destructiva** desde la clave heredada
`bistro_thermal_printer` (se migra a la lista y se asigna como default de ambos
roles; la clave heredada **no se borra**, para rollback seguro).

### 2. Refactor del servicio — `lib/thermalPrinterService.ts`

- Estado de módulo: de `selectedPrinterName`/`currentStatus` únicos a
  `config: ConfiguracionImpresoras` + `printerStatuses: Map<string, EstadoConexion>`.
- `sendToQzPrinter(data, printerName)` recibe el destino por parámetro (sin tocar
  encoding/ESC-POS/firmado).
- `resolveTarget(role, override?)` resuelve la impresora: override o default del rol.
- Funciones de impresión con 3er parámetro **opcional** `targetPrinter`:
  `printReceiptDirect` y `printShiftReportDirect` → `TICKET`;
  `printKitchenCommandDirect` → `COMANDA`. Si no hay destino → no imprime, `false`.
- `getPrinterStatus()` **agregado**: `connected` si al menos una impresora lo está
  (preserva el presence de comandas). `reconnectPrinter` prioriza la impresora de
  rol `COMANDA` (para anunciar el dispositivo en presence cuanto antes).
- API nueva: `getRegisteredPrinters`, `registerPrinter`, `unregisterPrinter`,
  `getDefaultPrinter`, `setDefaultPrinter`, `getPrinterStatusFor`, `onConfigChange`.
- Compatibilidad: las firmas previas siguen funcionando (parámetros nuevos opcionales).

### 3. Hook — `hooks/usePrinters.ts` (nuevo)

Expone a la UI: `printers`, `defaultTicket`, `defaultComanda`, `statusTicket`,
`statusComanda`, `statusFor`, `globalStatus`, y acciones (`listQzPrinters`,
`addPrinter`, `removePrinter`, `setDefault`, `getDefault`). Suscripción a
`onConfigChange` + `onPrinterStatusChange` con cleanup; estado derivado con `useMemo`.

### 4. UI

- `components/PrinterSplitButton.tsx` (nuevo) — **solo TICKET**: botón con acción
  principal (imprime en la default) + flecha ▼ que despliega la lista para elegir
  otra; la elegida se fija como nueva default ("se pega"). Sin default la primera
  vez, obliga a elegir. Lista vacía → "Conectar impresora".
- `components/ComandaTargetGrid.tsx` (nuevo) — **solo COMANDA**: grid "Enviar
  comanda a" (máx 3 por fila) que unifica impresoras locales registradas +
  dispositivos remotos por presence. Tocar local imprime y fija default de comanda;
  tocar remoto envía por presence (el receptor imprime en **su** default de comanda).
- `components/PrinterConnectionCard.tsx` (modificado) — gestión de la lista en
  Ajustes: agregar desde QZ (con dedup, sin alta por IP), eliminar con confirmación,
  asignar default por rol con toggles independientes.
- `screens/SuccessScreen.tsx` y `components/SuccessSidebar.tsx` (modificados) —
  integran el split button de ticket y el grid de comanda; conservan intacto el
  flujo remoto (presence) y el armado de `commandData`.
- `screens/CashRegisterScreen.tsx` (modificado) — el reporte de cierre usa la
  default de `TICKET`; si no hay, despliega la lista y exige elegir.

### 5. Ajustes finales de UI (post-implementación)

- El menú del split button de ticket abre **hacia arriba** (`bottom-full`) por
  falta de espacio abajo.
- Encabezado del menú "Elegir impresora" más notorio (emerald, bold) y borde más
  marcado (`border-2` + sombra) para diferenciarlo del fondo.
- Botón "Imprimir Ticket" con estilo **limpio neutro** (superficie blanca + borde
  sutil) en vez de verde sólido, con **punto de estado** (verde = impresora
  conectada).
- `SuccessScreen`: encabezado superior más compacto (ícono `size-16`, paddings y
  márgenes reducidos) para dar **simetría** con la parte inferior.
- Ícono de eliminar impresora: emoji 🗑️ reemplazado por `material-symbols` `delete`.

### Alcance preservado (sin cambios)

- `lib/kitchenCommandService.ts` (presence/realtime): **no se modificó**.
- Firmado RSA (`lib/qzSigning.ts`), encoding ESC/POS y transliteración ASCII: intactos.
- No se agregó alta de impresoras por LAN/IP dentro de la app.
- No se toca la cola de sincronización offline (solo `localStorage`).

---

## Pruebas

- Entorno de tests nuevo: Vitest + Testing Library + fast-check.
- 26 tests en verde: property test de persistencia (round-trip), unit tests de
  migración y errores de `localStorage`, integración del servicio con QZ (mock,
  enrutamiento por rol + estado agregado + reconnect priorizando COMANDA) y
  aislamiento de la cola de sync.
- `npm run build`: OK.

> Pendiente opcional: faltan property tests 1–4 y 6–13 del núcleo (se implementó
> el 5 + unit tests de migración) y unit tests de UI (split button, grid, panel,
> coexistencia local/remoto, reporte). El build y la cobertura actual validan el
> comportamiento.

---

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `lib/printerRegistry.ts` | **Nuevo.** Lógica pura + persistencia de lista y defaults por rol |
| `lib/thermalPrinterService.ts` | Refactor a varias impresoras, estado por impresora, enrutamiento por rol, API de gestión |
| `hooks/usePrinters.ts` | **Nuevo.** Estado y acciones de impresoras para la UI |
| `components/PrinterSplitButton.tsx` | **Nuevo.** Split button de ticket (con flecha ▼) |
| `components/ComandaTargetGrid.tsx` | **Nuevo.** Grid "Enviar comanda a" (máx 3/fila) |
| `components/PrinterConnectionCard.tsx` | Gestión de lista en Ajustes (agregar/eliminar/default por rol) |
| `screens/SuccessScreen.tsx` | Split button ticket + grid comanda + simetría del encabezado |
| `components/SuccessSidebar.tsx` | Split button ticket + grid comanda |
| `screens/CashRegisterScreen.tsx` | Reporte de cierre → default de TICKET |
| `docs/caracteristicas/impresion_termica_qz.md` | Doc del módulo actualizada |
| `docs/guias_usuario/como_configurar_impresora.md` | Guía de usuario actualizada |
| `lib/printerRegistry.test.ts` + `*.migration.test.ts` + `thermalPrinterService.integration.test.ts` + `*.syncIsolation.test.ts` | Tests |


---

## Ajustes UX adicionales (segunda iteración)

Tras probar el flujo en la pantalla de éxito surgieron mejoras de presentación
y de comportamiento al conectar/reconectar impresoras. Cambios aplicados:

### 1. "Conectar impresora" abre el panel lateral, no una mini-lista inline

Antes, al tocar **"Conectar impresora"** desde el botón de ticket o el grid de
comanda, se desplegaba una mini-lista flotante encima del botón con las
impresoras de QZ. Ahora abre directamente el **`PrinterSettingsPanel`** (el
mismo panel que usa el `Sidebar` para gestionar impresoras): ancho de papel +
lista registrada + agregar/eliminar/asignar predeterminada por rol. Al cerrarlo
(X o tocar el fondo) se vuelve a la pantalla de éxito sin perder la venta.

### 2. La impresora desconectada también abre el panel para reconectar

Si la `Impresora_Predeterminada_Ticket` está registrada pero su `EstadoConexion`
es distinto de `connected` (no se reconectó sola), el botón principal del
`PrinterSplitButton` muestra **"Conectar impresora"** y al tocarlo abre el
panel para reconectar (antes quedaba como botón muerto "Impresora no
disponible"). Lo mismo aplica a las tarjetas locales del `ComandaTargetGrid`:
una local desconectada al tocarla abre el panel para reconectar y muestra el
texto "reconectar" (en lugar de quedar deshabilitada como "no disponible").

### 3. `PrinterSettingsPanel` se monta vía portal a `document.body`

El panel se renderizaba dentro del aside contenedor del `SuccessSidebar` (con
`z-[61] relative`), creando un contexto de apilamiento que "atrapaba" su
backdrop y producía un sombreado visual extra al lado del drawer. Ahora el
panel completo se monta con `createPortal(panel, document.body)`, así su
backdrop y drawer se apilan limpios a nivel raíz desde cualquier punto de la
app. Beneficia globalmente al componente.

### 4. Prop nueva `coverSidebar` en `PrinterSettingsPanel`

El backdrop del panel usa `md:left-64` para no oscurecer la franja del
`Sidebar` izquierdo cuando se abre desde él. Pero al abrirlo desde la pantalla
de éxito (donde el `Sidebar` también está presente como menú lateral), esa
franja quedaba "transparente" y mostraba el menú expandido detrás. Solución:

- Por defecto (`coverSidebar=false`): backdrop con `md:left-64`, respeta el
  `Sidebar` (uso desde el propio `Sidebar`).
- `coverSidebar` (true): backdrop a pantalla completa (`fixed inset-0`),
  cubriendo también el `Sidebar`. Lo usan `SuccessScreen` y `SuccessSidebar`.

### 5. Sin botón duplicado de "Conectar impresora" cuando no hay destinos

Cuando no hay ninguna impresora registrada ni dispositivo remoto disponible,
el grid "Enviar comanda a" del `ComandaTargetGrid` mostraba un botón
"Conectar impresora", y a su vez el `PrinterSplitButton` mostraba el suyo →
quedaban **dos** botones iguales apilados. Ahora el grid de comanda se oculta
cuando `comandaTargets.length === 0`, dejando un único "Conectar impresora"
(el del botón de ticket). Al conectar la primera impresora, el grid reaparece
con sus destinos.

### 6. Limpieza de imports y estado

`SuccessScreen` y `SuccessSidebar` ya no necesitan `listPrinters`,
`connectPrinter`, `probePrinterReachable`, ni los estados/handlers del flujo
inline (`showPrinterList`, `printersToConnect`, `isConnectingPrinter`,
`connectRole`, `handleConnectPrinterClick`, `handleSelectPrinter`,
`handleRequestConnectTicket`, `handleRequestConnectComanda`). Toda la conexión
vive ahora en el panel.

### Archivos modificados en esta iteración

| Archivo | Cambio |
|---|---|
| `components/PrinterSettingsPanel.tsx` | Portal a `document.body` + prop `coverSidebar` |
| `components/PrinterSplitButton.tsx` | "Conectar impresora" si la default no está conectada |
| `components/ComandaTargetGrid.tsx` | Tarjeta local desconectada → abre panel ("reconectar") |
| `screens/SuccessScreen.tsx` | Reemplaza inline por panel; oculta grid sin destinos; `coverSidebar` |
| `components/SuccessSidebar.tsx` | Mismos cambios; panel oculta el overlay propio del aside cuando está abierto; `coverSidebar` |
