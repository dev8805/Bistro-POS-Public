# Robustez offline: detección de conectividad real + caja offline completa

**Fecha:** 2026-06-16

## Contexto / problema raíz

En desktop con **adaptadores de red virtuales** (Hyper-V, WSL, Docker, el túnel
`cloudflared` del entorno de desarrollo, etc.), `navigator.onLine` puede quedar
en `true` aunque no haya internet real ([Chromium #231912](https://bugs.chromium.org/p/chromium/issues/detail?id=231912);
ver también MDN: un valor `true` **no garantiza** acceso a internet, solo `false`
es fiable).

Buena parte de la app usaba `navigator.onLine` como **fuente de verdad** para
decidir el camino offline (caer al caché, encolar operaciones, mostrar el
indicador). Cuando `navigator.onLine` "mentía" (decía `true` sin internet),
esos flujos intentaban ir online, fallaban con `TypeError: Failed to fetch` y
**no caían al caché ni encolaban**. Síntomas reportados:

- El indicador de "sin conexión" no aparecía al desconectar WiFi+LAN físicamente.
- La caja no cargaba offline (banner "TypeError: Failed to fetch", sin cajas para
  abrir turno).
- No se podía procesar pago offline (no detectaba el turno abierto en caché).
- Las categorías de gasto no se mostraban offline.
- La compra de inventario manual offline no se reflejaba en los movimientos.

---

## Cambios aplicados

### 1. Helper compartido de conectividad — `lib/connectivity.ts` (nuevo)

Fuente única para detectar conectividad real, alineada con la doc de Chrome/MDN:

- `checkRealInternet()`: si `navigator.onLine === false` → offline inmediato
  (fiable). Si es `true`, confirma con una **sonda `fetch HEAD`** a Supabase
  (`mode: 'no-cors'`, timeout adaptativo 3s/5s con `AbortController`). El
  `no-cors` evita falsos positivos por CORS (solo un fallo de red real rechaza).
- `isRealOffline()`: negación de lo anterior. Para decidir el camino offline
  **antes** de escribir.
- `isNetworkError(err)`: heurística síncrona para clasificar un error como de red
  (`!navigator.onLine` o `TypeError`/"Failed to fetch"). Para los `catch` de
  lectura que caen al caché.

### 2. Detección de conectividad híbrida — `hooks/useOfflineSync.ts`

Se restauró la **sonda real** (capa 1 que describe `modo_offline.md`), que se
había reemplazado por solo `navigator.onLine` en un commit previo. Ahora
`checkRealInternet` es async (HEAD `no-cors`) y `verifyConnection`/polling usan
`await`. Esto hace que el indicador de "sin conexión" vuelva a aparecer cuando se
cae internet de verdad (no solo al apagar el WiFi).

### 3. Indicador offline en desktop (modo Catálogo) — `screens/SellScreen.tsx`

En desktop el aviso de conexión vivía **solo** en el header de `SellScreen`, que
se oculta en modo Catálogo con el sidebar colapsado (vista a pantalla completa).
Se agregó un **chip flotante** (esquina inferior izquierda, `left-20` para no
tapar el riel ni las categorías/buscador) que aparece solo cuando el header está
oculto y hay estado offline / pendientes / errores. Reutiliza la lógica del chip
existente y abre el modal "¿Qué puedes hacer?".

### 4. Caja offline — `hooks/useCashRegister.ts`

- **Lecturas** (`fetchRegisters`, `fetchActiveShift`, `fetchOccupiedRegisters`,
  `fetchShifts`, `fetchMovements`): caen al caché con `isNetworkError(err)` en
  vez de depender solo de `!navigator.onLine`. Ya no aparece el banner de error
  offline y las cajas se cargan del caché.
- **`openShift`**: la lógica offline se extrajo a `openShiftOffline()` y se
  ejecuta tanto si `navigator.onLine` es `false` como si el INSERT online falla
  por red. Además, el turno offline ahora **adjunta el objeto `register`** (desde
  el caché en memoria) y el `opened_by_profile`, para que la UI muestre el
  **nombre de la caja** y el cajero, no el id.
- **`closeShift`**: misma estrategia (`closeShiftOffline()` + fallback ante error
  de red). El camino offline emite `shift-closed` para refrescar el indicador de
  turno.
- **`addCashIn` / `addCashOut`**: encolan offline si `navigator.onLine` es `false`
  **o** si el INSERT online falla por red.
- **`addRefund`**: ahora es **solo online** (las devoluciones requieren validación
  inmediata en servidor). Se eliminó su camino offline.

### 5. Procesar pago offline — `App.tsx`

El cálculo de `isShiftOpen` (condición para "Procesar pago") consultaba Supabase
y, ante fallo de red con `navigator.onLine` mintiendo, devolvía "sin turno". Ahora
la consulta va dentro de `try/catch` y, ante error de red, **cae al estado del
turno en caché** (`bistro_active_shift_*`). Así se puede vender con un turno
abierto offline.

### 6. Reporte de cierre offline — `screens/CashRegisterScreen.tsx`

Al cerrar turno offline ahora se abre la **vista de detalle** con las opciones de
reporte (antes solo volvía al dashboard):

- Se captura el turno + movimientos locales **antes** de cerrar y se arma un turno
  "cerrado" sintético. El arqueo (`expected_cash`/`difference`) se calcula del
  efectivo de los movimientos locales.
- Se reconstruyen los agregados (`sales_by_method`, `total_sales`,
  `total_cash_in`, `total_expenses`, `total_cash_out`, `total_refunds`) desde los
  movimientos locales, para que el **detalle del frontend** muestre lo mismo que
  la tirilla impresa.
- `getReportData` usa los movimientos locales para turnos offline (id `offline_*`).
- **Imprimir** (QZ Tray local) y **PDF** (`@react-pdf`) funcionan offline; el
  botón **Correo se oculta** en turnos offline.
- Se replicó el flujo de **selección de impresora** de `SuccessSidebar`: si no hay
  impresora conectada, el botón "Conectar" lista las impresoras disponibles para
  elegir una.

> Limitación conocida: las ventas a **crédito** no generan movimiento de caja
> offline, por lo que esa línea del desglose puede salir en $0 hasta sincronizar.

### 7. Categorías de gasto / motivos de merma — `hooks/useExpenses.ts`

`fetchCategories` y `fetchReasons` caen al caché con `isNetworkError(err)`. Offline
el selector "Elegir categoría" muestra las categorías cacheadas en vez de
"Sin coincidencias".

### 8. Compuertas de escritura offline → sonda real

Flujos que encolaban offline y fallaban en silencio cuando `navigator.onLine`
mentía, ahora deciden con `await isRealOffline()`:

- `hooks/useExpenses.ts` → `createExpense` (gastos; merma sigue excluida).
- `hooks/useClients.ts` → `createClient` y `addPayment` (abono de cliente).
- `hooks/useDebts.ts` → `addCreditorPayment` (abono a proveedor).
- `components/expense/InventoryPurchase.tsx` → `handleSave` (compra de inventario).

### 9. Lecturas de deudas — `hooks/useDebts.ts`

`fetchDebts` ahora cae al caché (`bistro_debts_cache_*`) en el `catch` ante error
de red (antes solo logueaba).

### 10. Limpieza de código muerto

Se eliminó el tipo `manual_refund` y su sincronizador (`syncManualRefund` + `case`
en el orquestador) en `lib/offlineQueue.ts` y `hooks/useOfflineSync.ts`, ya que
las devoluciones pasaron a ser solo-online.

---

## Archivos afectados

| Archivo | Cambio |
|---|---|
| `lib/connectivity.ts` | **Nuevo.** Helpers `checkRealInternet`, `isRealOffline`, `isNetworkError` |
| `hooks/useOfflineSync.ts` | Sonda real de conectividad; eliminado `syncManualRefund` |
| `lib/offlineQueue.ts` | Eliminado tipo `manual_refund` |
| `screens/SellScreen.tsx` | Chip flotante offline para desktop catálogo |
| `hooks/useCashRegister.ts` | Fallback a caché por error de red; abrir/cerrar/movimientos offline; refund online-only |
| `App.tsx` | `isShiftOpen` cae al caché ante error de red |
| `screens/CashRegisterScreen.tsx` | Reporte de cierre offline + selección de impresora |
| `hooks/useExpenses.ts` | Categorías/motivos al caché; `createExpense` con `isRealOffline` |
| `hooks/useClients.ts` | `createClient` / `addPayment` con `isRealOffline` |
| `hooks/useDebts.ts` | `addCreditorPayment` con `isRealOffline`; `fetchDebts` al caché |
| `components/expense/InventoryPurchase.tsx` | `handleSave` con `isRealOffline` |

---

## ⏳ Pendiente para más adelante

### Indicador: los pendientes se marcan como errores al recargar offline

**Escenario:** con movimientos en cola offline, al **recargar la página sin
internet** los pendientes desaparecen de la notificación y aparecen como
"errores" (ej. "3 errores · Descartar"). Al volver el internet, en lugar de
"Sincronizando" muestra la cuenta de errores.

**Causa raíz (en `hooks/useOfflineSync.ts`):**

1. `isOnlineRef` arranca en `true` y la sonda de conectividad es asíncrona (+2s de
   debounce para offline). Al montar, `syncAll` se dispara (auto-sync) **antes** de
   confirmar que no hay internet, y su guarda (`!isOnlineRef.current`) no bloquea.
2. Cada sincronizador (`syncX`), en su `catch`, marca el movimiento como `'failed'`
   ante **cualquier** error, incluido el de red. Los pendientes pasan de
   `pending` → `failed`.

El indicador cuenta `pendingCount` (status `pending`) y `failedCount` (status
`failed`); por eso "desaparecen" los pendientes y aparece el conteo de errores. Y
como el chip "Sincronizando" depende de `isOnline && pendingCount > 0`, al volver
el internet muestra los errores en vez de "Sincronizando".

**Solución propuesta (aislada a `useOfflineSync.ts`, no toca UI ni cola):**

1. **No intentar sincronizar sin internet real:** agregar
   `await checkRealInternet()` al inicio de `syncAll` (reutilizando
   `lib/connectivity.ts`). Si no hay internet real, retorna sin tocar nada → los
   pendientes siguen como `pending`.
2. **Que un error de red NO marque `failed`:** un fallo de red es transitorio y
   reintentable; el movimiento debe quedarse en `pending`. Centralizar en el loop
   de `syncAll`: si un handler falla y se confirma pérdida de conexión, revertir
   ese movimiento a `pending` y detener el ciclo (reintento posterior), sin
   contarlo como error. Los errores reales del servidor (validación, etc.) sí se
   marcan `failed` como hasta ahora.

**Resultado esperado:**

```
Recargar offline  → pendientes siguen visibles ("N pendientes")
Vuelve internet   → "Sincronizando..." → se sincronizan
Error real de BD  → "X errores · Descartar"  (solo en este caso)
```
