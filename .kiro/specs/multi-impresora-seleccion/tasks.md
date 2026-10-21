# Implementation Plan: multi-impresora-seleccion

## Overview

Este plan convierte el diseño en una serie de pasos de codificación incrementales y, donde aplica, test-driven. El orden sigue las capas del diseño: primero el módulo puro `lib/printerRegistry.ts` con sus property tests (Propiedades 1–13), luego el refactor de `lib/thermalPrinterService.ts`, después el hook `hooks/usePrinters.ts`, los componentes de UI (`PrinterSplitButton`, `ComandaTargetGrid`, `PrinterConnectionCard`), las pantallas (`SuccessScreen`, `SuccessSidebar`, `CashRegisterScreen`), y finalmente la verificación de build/tests y la actualización de la documentación del módulo.

No se modifican `lib/kitchenCommandService.ts`, el firmado RSA, el encoding ESC/POS ni la transliteración. No se agrega alta de impresoras por IP. Toda la persistencia usa únicamente `localStorage`, sin tocar la cola de sincronización offline.

## Tasks

- [x] 1. Preparar entorno de pruebas (test runner + fast-check)
  - [x] 1.1 Instalar y configurar Vitest, Testing Library y fast-check
    - Agregar como devDependencies: `vitest`, `@vitest/coverage-v8` (opcional), `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom` y `fast-check`
    - Crear configuración de test en `vitest.config.ts` (o ampliar `vite.config.ts`) con entorno `jsdom` y `setupFiles`
    - Crear `test/setup.ts` con `@testing-library/jest-dom` y un mock básico de `localStorage` reutilizable
    - Agregar scripts `"test": "vitest --run"` y `"test:watch": "vitest"` en `package.json`
    - _Requirements: 3.1, 3.6_

- [x] 2. Implementar módulo de lógica pura `lib/printerRegistry.ts`
  - [x] 2.1 Definir tipos, claves de almacenamiento y modelo de configuración
    - Crear `lib/printerRegistry.ts` con los tipos `RolImpresion`, `EstadoConexion`, `ImpresoraRegistrada`, `ConfiguracionImpresoras`
    - Exportar las constantes de clave: `STORAGE_KEY_LIST` (`bistro_printers_list`), `STORAGE_KEY_DEFAULT_TICKET` (`bistro_default_ticket`), `STORAGE_KEY_DEFAULT_COMANDA` (`bistro_default_comanda`), `LEGACY_STORAGE_KEY` (`bistro_thermal_printer`)
    - _Requirements: 3.4, 4.1_

  - [x] 2.2 Implementar funciones puras de lista y predeterminadas
    - Implementar `addPrinter` (dedup por nombre, devuelve `{ config, alreadyExisted }`)
    - Implementar `removePrinter` (quita por nombre y limpia predeterminadas que la referencian)
    - Implementar `setDefault` (cambia solo el rol indicado), `getDefaultForRole`
    - _Requirements: 1.4, 1.6, 2.2, 2.4, 3.2, 9.3_

  - [-]* 2.3 Property test: agregar impresora nueva la incorpora a la lista
    - **Property 1: Agregar una impresora nueva la incorpora a la lista**
    - Comentario de trazabilidad: `// Feature: multi-impresora-seleccion, Property 1: Agregar una impresora nueva la incorpora a la lista`
    - **Validates: Requirements 1.4**
    - _Properties: 1_

  - [-]* 2.4 Property test: agregar nombre existente es idempotente (dedup)
    - **Property 2: Agregar un nombre existente es idempotente (dedup)**
    - **Validates: Requirements 1.6**
    - _Properties: 2_

  - [-]* 2.5 Property test: eliminar una impresora la quita de la lista
    - **Property 3: Eliminar una impresora la quita de la lista**
    - **Validates: Requirements 2.2**
    - _Properties: 3_

  - [-]* 2.6 Property test: eliminar limpia las predeterminadas que la referencian
    - **Property 4: Eliminar limpia las predeterminadas que la referencian**
    - **Validates: Requirements 2.4**
    - _Properties: 4_

  - [-]* 2.7 Property test: las predeterminadas por rol son independientes
    - **Property 6: Las predeterminadas por rol son independientes**
    - **Validates: Requirements 3.2, 9.3**
    - _Properties: 6_

  - [-]* 2.8 Property test: fijar una predeterminada es consultable
    - **Property 10: Fijar una predeterminada es persistente y consultable**
    - **Validates: Requirements 8.2, 16.7**
    - _Properties: 10_

  - [-]* 2.9 Property test: enrutamiento por rol a la predeterminada correcta
    - **Property 11: Enrutamiento por rol a la predeterminada correcta**
    - Validar la resolución de destino vía `getDefaultForRole(config, role)`
    - **Validates: Requirements 7.1, 7.2, 9.1, 9.2, 10.1, 16.4, 16.6**
    - _Properties: 11_

  - [-]* 2.10 Property test: sin predeterminada el destino resuelto es null
    - **Property 12: Sin predeterminada no se envía a imprimir**
    - Validar que `getDefaultForRole` devuelve `null` cuando no hay predeterminada para el rol
    - **Validates: Requirements 7.3, 9.5**
    - _Properties: 12_

- [x] 3. Implementar validación, parseo, migración y agregación de estado
  - [x] 3.1 Implementar `validateConfig`, `parseStoredList`, `migrateLegacy` y `aggregateStatus`
    - `validateConfig`: invalida (a `null`) predeterminadas que no referencian impresoras existentes; conserva las válidas
    - `parseStoredList`: parseo seguro de la lista almacenada; ante datos corruptos o no-array devuelve `[]` sin lanzar
    - `migrateLegacy`: si la lista actual está vacía y el valor heredado es válido, crea lista de una impresora y la asigna a ambos roles; si la lista no está vacía, ignora el heredado
    - `aggregateStatus`: orden de prioridad `connected` > `connecting` > `disconnected` > `unknown` (vacío → `unknown`)
    - _Requirements: 3.6, 3.7, 4.1, 4.2, 4.4, 13.1, 13.2_

  - [-]* 3.2 Property test: el parser de la lista almacenada es robusto
    - **Property 7: El parser de la lista almacenada es robusto**
    - Usar `arbCadenaArbitraria` (`fc.string()` + JSON malformado)
    - **Validates: Requirements 3.6**
    - _Properties: 7_

  - [-]* 3.3 Property test: `validateConfig` garantiza predeterminadas válidas
    - **Property 8: `validateConfig` garantiza predeterminadas válidas**
    - **Validates: Requirements 3.7**
    - _Properties: 8_

  - [-]* 3.4 Property test: migración de la impresora heredada
    - **Property 9: Migración de la impresora heredada**
    - **Validates: Requirements 4.1, 4.2, 4.4**
    - _Properties: 9_

  - [-]* 3.5 Property test: agregación de estado preserva el presence
    - **Property 13: Agregación de estado preserva el presence**
    - Usar `arbEstado` y listas de estados
    - **Validates: Requirements 13.1, 13.2**
    - _Properties: 13_

- [x] 4. Implementar acceso a `localStorage` (efecto acotado) y arbitraries
  - [x] 4.1 Implementar `loadPrinterConfig`, `savePrinterList` y `saveDefault`
    - `loadPrinterConfig`: lee claves, aplica `parseStoredList`, `migrateLegacy` y `validateConfig`; devuelve `{ config, migrationError }`; nunca interrumpe el arranque
    - `savePrinterList` y `saveDefault`: persisten en `localStorage` y devuelven `false` si la escritura falla (try/catch), conservando la config en memoria
    - No tocar IndexedDB ni la cola de sync en ningún punto
    - _Requirements: 3.1, 3.3, 3.5, 4.3, 4.5, 14.1, 14.4_

  - [-]* 4.2 Implementar arbitraries reutilizables de fast-check
    - Crear `test/arbitraries/printerArbitraries.ts` con `arbPrinterName`, `arbImpresoraRegistrada`, `arbConfig` (nombres posiblemente repetidos + predeterminadas dentro/fuera de la lista), `arbEstado`, `arbRol`, `arbCadenaArbitraria`
    - _Requirements: 1.6, 3.7_

  - [x]* 4.3 Property test: la persistencia es un round-trip
    - **Property 5: La persistencia es un round-trip**
    - Usar mock de `localStorage`; guardar con `savePrinterList` + `saveDefault` y recuperar con `loadPrinterConfig`
    - **Validates: Requirements 3.1, 3.3**
    - _Properties: 5_

  - [x]* 4.4 Unit tests de migración y errores de `localStorage`
    - `migrateLegacy(null, [])` → config vacía (Req 4.3); heredado inválido conserva la clave original y marca `migrationError` (Req 4.5)
    - `savePrinterList`/`saveDefault` devuelven `false` cuando `setItem` lanza, sin tocar la cola de sync
    - _Requirements: 4.3, 4.5, 3.5, 14.4_

- [x] 5. Checkpoint - Validar el núcleo puro
  - Ejecutar `npm run test -- printerRegistry` y asegurar que todas las propiedades 1–13 y los unit tests pasan; preguntar al usuario si surgen dudas.

- [x] 6. Refactorizar `lib/thermalPrinterService.ts` para varias impresoras
  - [x] 6.1 Reemplazar estado de módulo y agregar resolución de destino
    - Sustituir `selectedPrinterName`/`currentStatus` por `config: ConfiguracionImpresoras` (cargada con `loadPrinterConfig`) y `printerStatuses: Map<string, EstadoConexion>`
    - Refactorizar `sendToQzPrinter(data, printerName)` para recibir el destino por parámetro (sin cambiar encoding ni ESC/POS)
    - Implementar `resolveTarget(role, override?)` usando `getDefaultForRole`
    - _Requirements: 7.1, 9.1, 9.2_

  - [x] 6.2 Extender funciones de impresión con destino por rol y parámetro opcional
    - `printReceiptDirect(data, paperWidth?, targetPrinter?)` → rol `TICKET`
    - `printShiftReportDirect(data, paperWidth?, targetPrinter?)` → rol `TICKET`
    - `printKitchenCommandDirect(data, paperWidth?, targetPrinter?)` → rol `COMANDA`
    - Si el destino resuelto es `null` → no imprimir, devolver `false`; conservar firmas existentes (parámetros nuevos opcionales)
    - _Requirements: 5.4, 7.1, 7.3, 8.1, 9.1, 9.2, 9.5, 9.6, 10.1, 16.4_

  - [x] 6.3 Implementar API de gestión de lista y predeterminadas
    - Exportar `getRegisteredPrinters`, `registerPrinter`, `unregisterPrinter`, `getDefaultPrinter`, `setDefaultPrinter`, `getPrinterStatusFor`, `onConfigChange`
    - Conectar `registerPrinter`/`unregisterPrinter`/`setDefaultPrinter` con `addPrinter`/`removePrinter`/`setDefault` + persistencia; propagar `false` ante fallo de guardado
    - Emitir cambios de configuración a los listeners de `onConfigChange`
    - _Requirements: 1.4, 1.6, 2.2, 2.4, 2.6, 3.2, 6.2, 6.6, 8.2, 8.5, 16.7_

  - [x] 6.4 Adaptar estado por impresora, escucha y `getPrinterStatus` agregado
    - `startStatusListener` itera `config.printers` y llama `qz.printers.startListening(name)` por cada una
    - `handlePrinterStatusEvent` actualiza `printerStatuses.set(name, ...)` y emite `aggregateStatus([...values])` a los `statusListeners`
    - `getPrinterStatus()` devuelve el agregado (`connected` si alguna lo está) para preservar el presence; `setClosedCallbacks` pone todas en `disconnected` sin alterar `config`
    - Ajustar `reconnectPrinter` para reconectar registradas priorizando la predeterminada `COMANDA`
    - _Requirements: 12.1, 12.2, 12.3, 12.5, 13.1, 13.2, 13.3, 13.4_

  - [x]* 6.5 Tests de integración del servicio con QZ (mock de qz-tray)
    - Listado, conexión, evento de estado físico, timeout de conexión, `getPrinterStatus()` agregado y `reconnectPrinter` priorizando COMANDA
    - Enrutamiento: `printReceiptDirect`→`defaultTicket`, `printKitchenCommandDirect`→`defaultComanda`, override de destino respeta el parámetro
    - Sin predeterminada para el rol → no se invoca `sendToQzPrinter` y se devuelve `false`
    - _Requirements: 1.1, 7.4, 9.6, 12.3, 13.3, 13.4, 7.3, 9.5_

  - [x]* 6.6 Test de aislamiento de la cola de sincronización offline
    - Spy que verifica cero llamadas a la cola de sync durante alta, baja y cambio de predeterminada; conteo de eventos pendientes idéntico antes/después
    - _Requirements: 14.1, 14.2, 14.3_

- [x] 7. Checkpoint - Validar el servicio refactorizado
  - Ejecutar la suite de tests del servicio y asegurar que pasa; preguntar al usuario si surgen dudas.

- [x] 8. Implementar hook `hooks/usePrinters.ts`
  - [x] 8.1 Crear el hook con estado derivado y acciones
    - Crear `hooks/usePrinters.ts` que exponga `printers`, `defaultTicket`, `defaultComanda`, `statusTicket`, `statusComanda`, `statusFor`, `globalStatus`, `listQzPrinters`, `addPrinter`, `removePrinter`, `setDefault`, `getDefault`
    - Suscribirse a `onConfigChange` y `onPrinterStatusChange` con cleanup; derivar `statusTicket`/`statusComanda` con `useMemo` (sin `useEffect` para derivar estado, sin fetching en componentes)
    - _Requirements: 5.2, 6.1, 7.1, 12.1, 12.4, 16.2_

  - [ ]* 8.2 Unit tests del hook
    - Verificar derivación de estado por rol, propagación de cambios de configuración y limpieza de listeners
    - _Requirements: 12.1, 12.4_

- [x] 9. Implementar componente `components/PrinterSplitButton.tsx` (SOLO ticket)
  - [x] 9.1 Crear el split button accesible para el rol TICKET
    - Crear `components/PrinterSplitButton.tsx` con props `label`, `icon`, `onPrint(targetPrinter)`, `onRequestConnect`, `disabled`
    - Acción principal imprime en `defaultTicket`; si no hay predeterminada, despliega la lista y bloquea la impresión hasta elegir; la flecha ▼ siempre disponible
    - Marcar visualmente la predeterminada actual; deshabilitar destinos con estado ≠ `connected`; lista vacía → "Conectar impresora"
    - Al elegir por ▼: fijar como `defaultTicket` y luego imprimir
    - Accesibilidad: `<button>` con `aria-label`, `tabIndex={0}`, `onKeyDown` (Enter/Espacio abren, Escape cierra, flechas navegan)
    - Colores: resalte de predeterminada y hover en neutro/emerald; **ningún texto** usa `text-amber-*`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.4, 8.1, 8.2, 8.3, 12.4_

  - [ ]* 9.2 Unit tests del `PrinterSplitButton`
    - Estructura, flecha siempre presente, marca de predeterminada, navegación por teclado, render de "Conectar impresora" con lista vacía, destino no disponible deshabilitado
    - Verificar que ningún texto usa clases `text-amber-*`
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 12.4_

- [x] 10. Implementar componente `components/ComandaTargetGrid.tsx` (SOLO comanda)
  - [x] 10.1 Crear el grid "Enviar comanda a" accesible
    - Crear `components/ComandaTargetGrid.tsx` con tipos `ComandaTargetKind`, `ComandaTarget` y props `targets`, `onPrintLocal`, `onSendRemote`, `onRequestConnect`, `busyTargetId`
    - Grid de máximo 3 columnas (`grid grid-cols-3 gap-2`, degradando a `grid-cols-2` en pantallas estrechas), la 4ª tarjeta pasa de fila
    - Tarjeta `local`: al tocar (connected) llama `onPrintLocal(name)`; estado ≠ `connected` → no disponible. Tarjeta `remote`: al tocar llama `onSendRemote(userId)`
    - Sin destinos → mostrar "Conectar impresora" en lugar de tarjetas; spinner en la tarjeta de `busyTargetId`
    - Accesibilidad: cada tarjeta es `<button>` con `aria-label` descriptivo, `tabIndex={0}`, `onKeyDown` (Enter/Espacio); tarjetas no disponibles con `disabled`/`aria-disabled`
    - Colores: título, marca `✓ Predet.`, hover y destino activo en neutro/emerald; **ningún texto** usa `text-amber-*`
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.8, 16.9, 15.1_

  - [ ]* 10.2 Unit tests del `ComandaTargetGrid`
    - Render bajo el título "Enviar comanda a" con ≥1 destino; composición local+remoto; máximo 3 por fila; toque local llama `onPrintLocal`; toque remoto llama `onSendRemote`; local no-disponible deshabilitada; sin destinos → "Conectar impresora"
    - Accesibilidad y verificación de que ningún texto usa `text-amber-*`
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.8, 16.9_

- [x] 11. Modificar `components/PrinterConnectionCard.tsx` para gestionar la lista
  - [x] 11.1 Convertir la tarjeta de conexión única en gestión de lista
    - Usar `usePrinters()`; mostrar la `Lista_Impresoras_Registradas` con estado por impresora
    - "Agregar impresora" lista las de QZ y registra la elegida con dedup; sin alta manual por IP; indicar "QZ Tray no disponible" o "no hay impresoras" según el caso
    - Eliminar con confirmación (`useConfirmDialog`) que identifique la impresora; al confirmar, quitar y persistir; manejar fallo de persistencia con mensaje de error
    - Toggles "Predet. Ticket"/"Predet. Comanda" independientes vía `setDefault(role, name)`
    - Reemplazar hovers `amber` por neutros/emerald (`hover:bg-gray-50`, `hover:text-emerald-700`, `hover:border-emerald-200`); sin texto amarillo
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.6, 3.2, 9.3, 12.1_

  - [ ]* 11.2 Unit tests del `PrinterConnectionCard`
    - Render de lista, flujo de agregar/eliminar con confirmación, toggles de predeterminada independientes, estados "QZ no disponible"/"sin impresoras", error de persistencia
    - Verificar que ningún texto usa `text-amber-*`
    - _Requirements: 1.2, 1.3, 1.6, 2.1, 2.3, 2.6, 3.2_

- [x] 12. Integrar UI en `screens/SuccessScreen.tsx` y `components/SuccessSidebar.tsx`
  - [x] 12.1 Integrar `PrinterSplitButton` (ticket) en `SuccessScreen.tsx`
    - Reemplazar el botón único de ticket por `PrinterSplitButton`; `onPrint` → `printReceiptDirect(data, paperWidth, target)`; `onRequestConnect` → flujo inline "Conectar impresora"
    - Reutilizar el flujo inline existente (`showPrinterList`, `handleConnectPrinterClick`, `handleSelectPrinter`) para registrar y asignar `defaultTicket`, continuando la impresión pendiente
    - _Requirements: 5.1, 5.4, 5.6, 6.1, 6.2, 6.3, 6.5, 7.1, 8.1, 15.1, 15.4, 15.5, 15.6, 15.7_

  - [x] 12.2 Integrar `ComandaTargetGrid` (comanda) en `SuccessScreen.tsx`
    - Reemplazar "Imprimir Comanda aquí" y el bloque "Enviar Comanda" por un único `ComandaTargetGrid`
    - Construir `targets` combinando impresoras locales de `usePrinters()` con dispositivos remotos de `useAvailablePrinters()` (presence, sin cambios)
    - `onPrintLocal(name)` → `printKitchenCommandDirect(commandData, paperWidth, name)` + fijar `defaultComanda`; `onSendRemote(userId)` → `sendKitchenCommand(business_id, userId, commandData)`
    - Conservar **idéntico** el armado de `commandData` y la lógica de los handlers existentes; sin destinos → "Conectar impresora"
    - _Requirements: 7.2, 11.1, 11.2, 11.3, 16.1, 16.2, 16.4, 16.5, 16.7, 16.9_

  - [x] 12.3 Replicar la integración en `components/SuccessSidebar.tsx`
    - Aplicar los mismos cambios de ticket (split button) y comanda (grid) que en `SuccessScreen.tsx`, reutilizando el mismo patrón y el flujo inline "Conectar impresora"
    - Conservar el armado de `commandData` idéntico al actual del sidebar
    - _Requirements: 5.1, 5.4, 5.6, 7.1, 7.2, 11.1, 11.2, 15.1, 16.1, 16.2, 16.4, 16.5, 16.7, 16.9_

  - [ ]* 12.4 Tests de coexistencia local/remoto en pantallas de éxito
    - Tabla `{localOk, localFail} × {remoteOk, remoteFail}`: ambos métodos coexisten, el fallo de uno no bloquea al otro y la venta no cambia
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [x] 13. Modificar `screens/CashRegisterScreen.tsx` (reporte de cierre → TICKET)
  - [x] 13.1 Enrutar el reporte de cierre a la predeterminada de ticket
    - `handlePrintShiftReport` usa `defaultTicket` vía `printShiftReportDirect`; si no hay predeterminada pero la lista tiene impresoras, desplegar lista, exigir elección, fijar como `defaultTicket` e imprimir (patrón Req 6)
    - Si la lista está vacía, indicar registrar impresora en Ajustes y no imprimir; manejar fallo de envío conservando los datos del cierre
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 13.2 Unit tests del reporte de cierre
    - Con predeterminada imprime directo; sin predeterminada y con lista exige elección y fija default; lista vacía no imprime; fallo de envío muestra error sin alterar el cierre
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

- [x] 14. Actualizar la documentación del módulo
  - [x] 14.1 Actualizar `docs/caracteristicas/impresion_termica_qz.md`
    - Documentar el nuevo modelo de varias impresoras registradas, las claves de `localStorage`, la predeterminada por rol (TICKET/COMANDA) y la migración desde la clave heredada
    - Documentar el split button de ticket, el grid "Enviar comanda a" (destinos locales + remotos) y la agregación de estado para el presence
    - _Requirements: 1.5, 3.4, 4.1, 5.1, 16.1_

- [x] 15. Checkpoint final - Build y suite de tests
  - [x] 15.1 Ejecutar build y la suite completa de tests
    - Ejecutar `npm run build` y `npm run test -- --run`; corregir errores de compilación o tests que fallen
    - Asegurar que todas las propiedades (1–13) y los tests de ejemplo/integración pasan
    - _Requirements: 3.1, 7.1, 9.1, 9.2, 11.1, 13.1_

## Notes

- Las tareas marcadas con `*` (tests unitarios, de propiedades e integración) son opcionales para un MVP más rápido, pero recomendadas para garantizar la correctitud.
- Cada tarea referencia los requerimientos que cubre y, donde aplica, las propiedades del diseño.
- Las propiedades de correctitud 1–13 se implementan con fast-check, mínimo 100 iteraciones (`{ numRuns: 100 }`), cada una en un único test con comentario de trazabilidad `// Feature: multi-impresora-seleccion, Property {N}: {texto}`.
- Los checkpoints (tareas 5, 7 y 15) aseguran validación incremental.
- No se modifican `lib/kitchenCommandService.ts`, el firmado RSA, el encoding ESC/POS ni la transliteración; no se agrega alta por IP; la persistencia usa solo `localStorage`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1"] },
    { "id": 3, "tasks": ["2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "3.2", "3.3", "3.4", "3.5"] },
    { "id": 4, "tasks": ["4.1", "4.2"] },
    { "id": 5, "tasks": ["4.3", "4.4"] },
    { "id": 6, "tasks": ["6.1"] },
    { "id": 7, "tasks": ["6.2", "6.3", "6.4"] },
    { "id": 8, "tasks": ["6.5", "6.6", "8.1"] },
    { "id": 9, "tasks": ["8.2", "9.1", "10.1", "11.1"] },
    { "id": 10, "tasks": ["9.2", "10.2", "11.2", "13.1", "14.1"] },
    { "id": 11, "tasks": ["12.1", "12.2", "13.2"] },
    { "id": 12, "tasks": ["12.3"] },
    { "id": 13, "tasks": ["12.4"] },
    { "id": 14, "tasks": ["15.1"] }
  ]
}
```
