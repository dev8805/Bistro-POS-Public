# Lector de Códigos de Barras USB (Pistola Física)

## Contexto

La app Bistro soporta lectores de códigos de barras físicos (pistolas USB). Estos dispositivos se comportan como un teclado: escriben el código muy rápido y al final envían un "Enter". La diferencia clave con un humano escribiendo es la **velocidad**: el lector termina un código de 8–13 dígitos en menos de 100 ms; un humano tarda varios segundos.

---

## Cómo funciona internamente

La app tiene dos mecanismos para detectar escaneos:

1. **Hook global** (`useBarcodeScanner`): escucha todo lo que se teclea en la ventana, sin importar si hay algún buscador activo. Si detecta que la velocidad de escritura es de máquina, busca el producto y lo agrega.
2. **Input de búsqueda**: el buscador visible en pantalla también tiene su propio manejador de teclado. Si el buscador tiene el foco y se presiona Enter con texto dentro, también intenta agregar el producto.

El **doble registro** puede ocurrir por dos razones:
- Los dos mecanismos anteriores procesan el mismo escaneo al mismo tiempo.
- **`MenuScreen` se monta en más de un lugar** del árbol de componentes de la app al mismo tiempo. Cada instancia registra su propio listener del hook global en `window`, y ambas disparan `onQuickAdd` con el mismo código escaneado.

---

## Fixes aplicados

### ✅ Fix 1 — Modo EAN Desktop (≥ 1024px) — `2026-04-29`

**Problema:** Cada escaneo agregaba 2 unidades en lugar de 1.

**Causa:** El hook global y el buscador desktop procesaban el mismo escaneo.

**Solución:** Se desactivó el hook global cuando el modo EAN está activo en desktop. El buscador queda como el único responsable.

```diff
// MenuScreen.tsx
+ const isEanDesktop = isEanMode && windowWidth >= 1024;
- }, !priceInputProduct && !discountItem);
+ }, !priceInputProduct && !discountItem && !isEanDesktop);
```

---

### ✅ Fix 2 — Modo Escáner Móvil (< 768px) — `2026-04-29`

**Problema 1:** Cada escaneo agregaba 2 unidades.

**Causa:** El hook global agregaba el producto; luego el `onKeyDown` del buscador móvil también lo agregaba (ambos ven el mismo Enter).

**Solución:** Se agregó un ref de timestamp (`lastMachineScanRef`). El hook lo actualiza cada vez que detecta un escaneo de máquina. El `onKeyDown` del buscador comprueba si ese timestamp fue hace menos de 300 ms; si sí, lo ignora.

```diff
// MenuScreen.tsx — callback de useBarcodeScanner
+ lastMachineScanRef.current = Date.now();

// MenuScreen.tsx — onKeyDown del input móvil
+ if (Date.now() - lastMachineScanRef.current < 300) return;
```

**Problema 2:** El teclado virtual del celular se abría al escanear.

**Causa:** Después de cada escaneo, el código refocalizaba el buscador automáticamente.

**Solución:** En móvil se hace blur en lugar de refocus. El teclado no se abre.

```diff
// MenuScreen.tsx — callback de useBarcodeScanner
+ if (window.innerWidth < 768) {
+     (document.activeElement as HTMLElement)?.blur();
+ } else {
+     setTimeout(() => refocusSearchInput(), 50);
+ }
```

**Problema 3:** Era necesario tocar el buscador primero para que la pistola funcionara.

**Aclaración:** El hook global ya escucha en toda la ventana (`window.addEventListener('keydown')`), por lo que funciona sin foco. El refocus forzado después de cada escaneo creaba confusión. Al eliminarlo en móvil, el flujo queda limpio.

---

### ✅ Fix 3 — Deduplicación multi-instancia en el hook — `2026-04-29`

**Problema:** En móvil, cada escaneo seguía agregando 2 unidades.

**Causa:** `MenuScreen` se monta en más de un lugar del árbol de componentes simultáneamente (dentro de `SellScreen` y de forma standalone en `App.tsx`). Cada instancia registra su propio listener en `window`. Cuando el escáner envía un código, las dos instancias lo detectan y llaman a `onQuickAdd`.

**Solución:** Variables a nivel de módulo en `useBarcodeScanner.ts` compartidas entre todas las instancias. Antes de llamar a `onMatch`, el hook verifica si el mismo código ya fue disparado en los últimos 50ms. Solo la primera instancia en procesar el código llama a `onMatch`.

```diff
// useBarcodeScanner.ts — variables de módulo
+ let _lastFiredCode = '';
+ let _lastFiredTime = 0;
+ const DEDUP_WINDOW_MS = 50;

// Antes de llamar a onMatch:
+ if (code === _lastFiredCode && Date.now() - _lastFiredTime < DEDUP_WINDOW_MS) {
+     reset(); return;
+ }
+ _lastFiredCode = code;
+ _lastFiredTime = now2;
  onMatchRef.current(product);
```

> **Nota:** La ventana de deduplicación es **50ms** (no 300ms). Los duplicados multi-instancia llegan con < 1ms de diferencia (mismo evento JS), así que 50ms los filtra sin problema. Un segundo escaneo real del mismo producto por parte del cajero tarda mínimo ~200ms, por lo que no se descarta.

---

### ✅ Fix 4 — Escaneo en fondo cuando hay un formulario abierto — `2026-04-29`

**Problema:** Al usar la pistola en `SimpleProductScreen` (ej. para llenar el campo EAN de "Crear Producto"), el hook de `MenuScreen` también detectaba la escritura rápida y agregaba el producto al carrito.

**Solución:** Antes de agregar al carrito, el hook verifica qué elemento tiene el foco:
- Si es un **input o textarea sin marcador especial** → los caracteres van a ese campo; el hook los descarta.
- Si es un **input marcado con `data-barcode-passthrough="true"`** → es el buscador del escáner móvil; el hook sigue funcionando.
- Si **ningún input tiene foco** → el hook agrega al carrito normalmente.

```diff
// useBarcodeScanner.ts — antes de onMatch
+ const active = document.activeElement;
+ const isBlockingInput = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
+ const hasPassthrough = active?.getAttribute('data-barcode-passthrough') === 'true';
+ if (isBlockingInput && !hasPassthrough) { reset(); return; }

// MenuScreen.tsx — buscador del escáner móvil
+ data-barcode-passthrough="true"
```

---

### ✅ Fix 5 — `stopImmediatePropagation` para eliminar doble adición en móvil/tablet — `2026-05-11`

**Problema:** En móvil y tablet, cada escaneo seguía agregando 2 unidades a pesar de los fixes anteriores.

**Causa raíz:** `App.tsx` mantiene dos layouts montados al mismo tiempo en memoria:
- `SellScreen` (visible en móvil/tablet) con su `MenuScreen` interno.
- Un `MenuScreen` standalone (oculto con CSS `hidden`, usado para desktop).

Ambos registran un listener en `window` con `capture: true`. El problema es que **`e.stopPropagation()` no detiene otros listeners registrados en el mismo nodo** (`window`). Para eso existe `e.stopImmediatePropagation()`. Con `stopPropagation`, ambas instancias siempre recibían el Enter y ambas intentaban agregar el producto.

La deduplicación de módulo (Fix 3) cubría este caso en teoría, pero en la práctica la primera instancia en dispararse es la del `MenuScreen` oculto de `App.tsx` (registrado primero en el tiempo), que sí ejecutaba `onMatch` aunque el usuario no lo ve.

**Solución:** Cambiar `e.stopPropagation()` por `e.stopImmediatePropagation()`. La primera instancia que procesa el escaneo silencia a todas las demás listeners en `window` para ese mismo evento.

```diff
// useBarcodeScanner.ts
- e.stopPropagation();
+ e.stopImmediatePropagation();
```

> **Diferencia clave:**
> - `stopPropagation()` → impide que el evento viaje a *otros nodos* del DOM.
> - `stopImmediatePropagation()` → impide que el evento viaje a otros nodos **Y** que otros listeners en el mismo nodo (`window`) lo reciban.

---

### ✅ Fix 6 — `isEanDesktop` reactivo a resize de ventana — `2026-05-11`

**Problema:** Si el usuario redimensionaba la ventana mientras `isEanMode` estaba activo, `isEanDesktop` no se actualizaba hasta el próximo re-render, dejando el hook en un estado incorrecto.

**Causa:** `isEanDesktop` era una constante calculada en cada render con `window.innerWidth`, sin ningún listener de `resize`.

**Solución:** Se convirtió en estado reactivo con un `useEffect` de resize.

```diff
// MenuScreen.tsx
+ const [windowWidth, setWindowWidth] = useState(window.innerWidth);
+ useEffect(() => {
+     const handleResize = () => setWindowWidth(window.innerWidth);
+     window.addEventListener('resize', handleResize);
+     return () => window.removeEventListener('resize', handleResize);
+ }, []);

- const isEanDesktop = isEanMode && typeof window !== 'undefined' && window.innerWidth >= 1024;
+ const isEanDesktop = isEanMode && windowWidth >= 1024;
```

---

### ✅ Fix 7 — Guard de `lastMachineScanRef` en buscador desktop para tablet — `2026-05-11`

**Problema:** En tablet (768–1023px) con `isEanMode` activo, el buscador desktop podía procesar el mismo Enter que el hook ya había manejado.

**Solución:** Se agregó el mismo guard de `lastMachineScanRef` que ya tenía el buscador móvil, ahora también en el `handleSearchKeyDown` del buscador desktop.

```diff
// MenuScreen.tsx — handleSearchKeyDown
  } else if (e.key === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
+     if (Date.now() - lastMachineScanRef.current < 300) return;
      if (sidebarFocus === 'client') {
```

---

### ✅ Fix 8 — Toast cuando el producto no se encuentra — `2026-05-11`

**Problema:** Cuando la pistola escaneaba un código que no existía en el catálogo, no pasaba nada visualmente. El cajero no sabía si la pistola había fallado o si el producto no estaba registrado.

**Causa:** El hook solo hacía `console.warn` al no encontrar el producto. El escáner remoto (ya eliminado) sí mostraba toast, generando inconsistencia.

**Solución:** Se agregó el parámetro `onNotFound` al hook. `MenuScreen` lo usa para mostrar un toast.

```diff
// useBarcodeScanner.ts
  export const useBarcodeScanner = (
      products: any[],
      onMatch: (product: any) => void,
      enabled: boolean = true,
+     onNotFound?: (code: string) => void
  ) => {
  // ...
-     } else { console.warn(...); }
+     } else { onNotFoundRef.current?.(code); }

// MenuScreen.tsx
  useBarcodeScanner(products, (product) => { ... },
      !priceInputProduct && !discountItem && !isEanDesktop,
+     () => showToast('Producto no encontrado', 'error'));
```

---

### ✅ Fix 9 — Eliminación del RemoteScanner — `2026-05-11`

**Contexto:** Existía un mecanismo experimental de "escáner remoto" que usaba Supabase Realtime (`scan_events`) y una pantalla `TestScannerScreen` para enviar códigos desde la cámara del móvil al desktop.

**Problema:** Era código de prueba que nunca llegó a producción y representaba:
- Una suscripción Realtime innecesaria activa en cada sesión.
- Riesgo de doble adición si el canal re-entregaba eventos tras reconexión de WiFi.
- Complejidad muerta que hacía más difícil mantener el módulo.

**Eliminado:**
- `screens/TestScannerScreen.tsx` — pantalla de prueba eliminada.
- `Screen.TEST_SCANNER` — eliminado del enum `Screen` en `types.ts`.
- Suscripción Realtime en `MenuScreen.tsx` — eliminado el `useEffect` con el canal.
- Variables auxiliares: `_processedScanIds`, `productsForScan`, `isEanModeRef`.
- Import de `supabase` en `MenuScreen.tsx` — ya no se usa.
- Rutas hash `#test-scanner` y renderizado condicional en `App.tsx`.

---

### ✅ Fix 11 — Sistema de prioridad inter-instancias — `2026-05-26`

**Problema:** En `InventoryPurchase` (Compra de inventario), al escanear un código con la pistola USB con el cursor fuera del buscador, el código se agregaba al **carrito de ventas** (no al de compra). La instancia de `useBarcodeScanner` de `MenuScreen` (montado siempre en background en `App.tsx`) ganaba la carrera de deduplicación porque se registraba primero en `window`.

**Causa raíz:** La deduplicación a 50ms (Fix 3) impide doble adición, pero no soluciona "quién procesa el escaneo" cuando hay varias instancias activas. El orden de registro decide el ganador, y `MenuScreen` siempre llega primero.

**Solución:** Variable de módulo `_priorityCount` y quinto parámetro `priority: boolean` en `useBarcodeScanner`. Las instancias con `priority=true && enabled` incrementan el contador al montarse y lo decrementan al desmontarse. En `handleKeyDown`, las instancias sin prioridad ceden el escaneo cuando `_priorityCount > 0`.

```diff
// useBarcodeScanner.ts — nuevo estado de módulo
+ let _priorityCount = 0;

// firma del hook
  export const useBarcodeScanner = (
      products: any[],
      onMatch: (product: any) => void,
      enabled: boolean = true,
      onNotFound?: (code: string) => void,
+     priority: boolean = false,
  ) => {
+     useEffect(() => {
+         if (!enabled || !priority) return;
+         _priorityCount++;
+         return () => { _priorityCount--; };
+     }, [enabled, priority]);

// dentro de handleKeyDown, antes de procesar el match
+ if (!priorityRef.current && _priorityCount > 0) {
+     reset();
+     return;
+ }
```

**Uso en InventoryPurchase:**

```diff
- useBarcodeScanner(products, (p) => setBarcodeScanProduct(p), showProductSelector);
+ useBarcodeScanner(
+     products,
+     (product) => { setBarcodeScanProduct(product); setInvProductSearch(''); },
+     showProductSelector,
+     (code) => { setInvProductSearch(''); showToast(`Código ${code} no encontrado`, 'error'); },
+     true, // priority: silencia el hook de MenuScreen
+ );
```

> **Por qué no se usó `data-scanner-priority` en DOM:** una variable de módulo evita queries al DOM en cada keydown y mantiene el guard puramente JS. Además permite que el contador refleje instancias de hook montadas, no solo presencia visual.

---

### ✅ Fix 12 — Passthrough del buscador en Compra de inventario — `2026-05-26`

**Problema:** En `InventoryPurchase`, si el cursor estaba en el input de búsqueda al escanear, el código se escribía como texto en el campo (filtrando productos) en lugar de abrir el `<BarcodeInputModal />`. El usuario veía "75024956" en el buscador y el producto coincidente filtrado debajo, pero no se abría el modal de cantidad/costo.

**Causa:** Fix 4 hace que el hook ignore el escaneo si hay un `<input>` con foco sin `data-barcode-passthrough="true"`. El buscador de InventoryPurchase no tenía ese atributo, así que el hook lo trataba como input bloqueante y los caracteres se quedaban en el campo.

**Solución:** Marcar el input de búsqueda con `data-barcode-passthrough="true"` y limpiar `invProductSearch` en los callbacks `onMatch` y `onNotFound` para borrar los dígitos que la pistola alcanzó a escribir antes del Enter.

```diff
// InventoryPurchase.tsx — input de búsqueda
  <input
      value={invProductSearch}
      onChange={e => setInvProductSearch(e.target.value)}
+     data-barcode-passthrough="true"
      className="..."
      placeholder="Buscar por nombre..."
  />

// callback del hook
  useBarcodeScanner(
      products,
      (product) => {
          setBarcodeScanProduct(product);
+         setInvProductSearch(''); // limpia el texto que la pistola dejó en el buscador
      },
      ...
  );
```

Comportamiento final unificado: independiente de si el cursor está dentro o fuera del buscador, el escaneo abre directamente el modal de cantidad/costo y el buscador queda limpio.

---

### ✅ Fix 13 — Escáner por cámara móvil en Compra de inventario — `2026-05-26`

**Contexto:** Antes solo había pistola USB para barcode en compra de inventario. En móviles sin pistola, el operador tenía que buscar manualmente cada producto por nombre — lento y propenso a errores.

**Solución:** Botón `qr_code_scanner` (oculto en desktop con `md:hidden`) junto al buscador del panel "Seleccionar productos". Activa un wrapper modal `z-[80]` con `<BarcodeScanner variant="embedded" continuousMode>` (que ya existía para PhotoOrder).

```tsx
{showCameraScanner && (
    <div className="fixed inset-0 z-[80] bg-black flex flex-col">
        <header>... [ Listo ] ...</header>
        <BarcodeScanner
            ref={cameraScannerRef}
            variant="embedded"
            continuousMode
            onScan={(code) => {
                if (barcodeScanProduct) return; // evita doble disparo con modal abierto
                const product = products.find(p => p.barcode?.trim() === code.trim());
                if (product) setBarcodeScanProduct(product);
                else {
                    cameraScannerRef.current?.playErrorBeep();
                    showToast(`Código ${code} no encontrado…`, 'error');
                }
            }}
            onClose={() => setShowCameraScanner(false)}
        />
    </div>
)}
```

**Decisiones de UX clave:**
- **Z-index escalonado** (cámara 80 < modal cantidad 100) — el `BarcodeInputModal` aparece encima de la cámara, que sigue corriendo en background. Al confirmar, el modal cierra y la cámara queda lista para el siguiente código.
- **`continuousMode`** — escanea uno tras otro sin reabrir la cámara. Bot "Listo" cierra solo el scanner y devuelve al panel de selección.
- **Guard `if (barcodeScanProduct) return`** — el cooldown del scanner es 1500ms, suficiente para escenarios normales, pero si el usuario tarda más con el modal de cantidad abierto, este guard evita que un nuevo escaneo dispare por encima.
- **`playErrorBeep()`** del ref del scanner — feedback auditivo distinguible cuando el código no existe en el catálogo.

---

### ✅ Fix 10 — Logs de debug ocultos en producción — `2026-05-11`

**Problema:** En producción, la consola del navegador mostraba información interna del escáner (códigos de barras del catálogo, estados del listener) visible para cualquiera con DevTools abierto.

**Solución:** Todos los `console.log/warn` del hook envueltos en `import.meta.env.DEV`. En producción no se imprime nada.

```diff
// useBarcodeScanner.ts
- console.log('[Scanner] 🟢 Listener ACTIVO...');
+ if (import.meta.env.DEV) console.log('[Scanner] 🟢 Listener ACTIVO...');
```

---

## Catálogo Global `barcode_catalog`

La tabla `barcode_catalog` es el caché maestro de códigos de barras. Es **global** (no por negocio): un código registrado por cualquier usuario queda disponible para toda la plataforma.

### Estructura

| Columna | Tipo | Notas |
|---|---|---|
| `barcode` | text (UNIQUE) | Código EAN/UPC. Clave del upsert. |
| `product_name` | text | Nombre del producto. |
| `brand` | text \| null | Marca (solo de fuentes externas). |
| `quantity` | text \| null | Contenido/peso en el empaque (solo fuentes externas). |
| `image_url` | text \| null | URL pública de imagen (Storage o externa). |
| `source` | text | `'ean-db'` — API Go-UPC / `'user'` — creado manualmente en Bistro. |

### Fuentes de datos

| Source | Origen | Cuándo se guarda |
|---|---|---|
| `'ean-db'` | API Go-UPC (via edge function `barcode-lookup`) | Al hacer lookup y Go-UPC devuelve resultado |
| `'user'` | Usuario creando/editando un producto en `SimpleProductScreen` | Al guardar exitosamente si el producto tiene barcode |

### Flujo de lookup (`lib/barcodeLookup.ts`)

```
lookupBarcode(código)
  → Paso 1: SELECT en barcode_catalog (Supabase)
      ✅ Encontrado → retorna resultado (sin llamada externa)
      ❌ No encontrado → continúa
  → Paso 2: POST a edge function barcode-lookup → Go-UPC API
      ✅ Encontrado → upsert en barcode_catalog (source: 'ean-db') → retorna resultado
      ❌ No encontrado → retorna null
```

Si retorna `null`, el formulario no autocompleta nada. El usuario puede llenar el nombre e imagen manualmente. Al **crear** el producto (no al editar), `handleSave` llama a `saveProductToBarcodeCatalog()` y ese código queda registrado con `source: 'user'` — pero solo si el producto tiene los tres datos: código, imagen y nombre. Si falta cualquiera, no se guarda en el catálogo.

### Seguridad (RLS)

| Política | Rol | Operación |
|---|---|---|
| `barcode_catalog_select_all` | `anon` + `authenticated` | SELECT — lookup público |
| `barcode_catalog_insert_authenticated` | `authenticated` | INSERT — solo usuarios con sesión |
| `barcode_catalog_update_authenticated` | `authenticated` | UPDATE — solo usuarios con sesión |

> [!NOTE]
> La tabla era pública (RLS desactivado) hasta `2026-05-17`. Se activó RLS en esa fecha para prevenir escrituras anónimas.

---

## Estado final por modo

| Modo / Situación | Doble adición | Teclado virtual | Sin foco requerido | Formulario abierto |
|---|---|---|---|---|
| EAN Desktop ≥1024px | ✅ Fix 1 | N/A (desktop) | ✅ Funciona | ✅ Hook inactivo |
| Escáner Móvil <768px | ✅ Fix 2 + 3 + 5 | ✅ No se abre | ✅ Funciona | ✅ Fix 4 |
| Escáner Tablet 768–1023px | ✅ Fix 5 + 7 | N/A | ✅ Funciona | ✅ Fix 4 |
| EAN Tablet 768–1023px | ✅ Fix 5 + 7 | N/A | ✅ Funciona | ✅ Fix 4 |
| Formulario / sidebar | N/A | N/A | N/A | ✅ Fix 4 |
| Producto no encontrado | N/A | N/A | N/A | ✅ Toast Fix 8 |
| Compra de inventario + pistola USB | N/A | N/A | ✅ Fix 11 + 12 | ✅ Funciona |
| Compra de inventario + cámara móvil | N/A | N/A | ✅ Fix 13 | ✅ Funciona |

---

## Archivos modificados

| Archivo | Cambios |
|---|---|
| `hooks/useBarcodeScanner.ts` | Fix 3 (dedup 50ms), Fix 4 (passthrough), Fix 5 (stopImmediatePropagation), Fix 8 (onNotFound), Fix 10 (logs DEV), Fix 11 (priority param + `_priorityCount`) |
| `screens/MenuScreen.tsx` | Fix 1 (EAN desktop), Fix 2 (teclado virtual + lastMachineScanRef), Fix 6 (windowWidth reactivo), Fix 7 (guard tablet), Fix 8 (toast onNotFound), Fix 9 (RemoteScanner eliminado) |
| `components/expense/InventoryPurchase.tsx` | Fix 11 (priority=true en hook), Fix 12 (`data-barcode-passthrough` + limpieza), Fix 13 (botón cámara + BarcodeScanner embebido) |
| `App.tsx` | Fix 9 (TestScannerScreen y rutas eliminadas) |
| `types.ts` | Fix 9 (Screen.TEST_SCANNER eliminado) |
| `screens/TestScannerScreen.tsx` | **Eliminado** |

---

## Detección humano vs. máquina

El umbral actual en `useBarcodeScanner.ts`:

```ts
const SCANNER_THRESHOLD_MS = 50;  // Si el promedio entre teclas < 50ms → máquina
const MIN_BARCODE_LENGTH = 4;      // Mínimo 4 caracteres para considerar un escaneo
```

Un humano tarda típicamente 200–500 ms entre tecla y tecla. Un escáner tarda 5–20 ms. El margen es amplio y no da falsos positivos en condiciones normales.

---

## Lista de verificación

```
[ ] Fix 1 — EAN Desktop ≥1024px: cada escaneo agrega exactamente 1 unidad
[ ] Fix 2 — Escáner Móvil: no se abre teclado virtual al escanear
[ ] Fix 3 — Con dos instancias de MenuScreen activas: cada escaneo agrega exactamente 1 unidad
[ ] Fix 4 — Escanear con CreateProductModal abierto: no agrega al carrito
[ ] Fix 5 — Móvil/tablet: escanear el mismo producto no agrega 2 unidades
[ ] Fix 6 — Redimensionar ventana de ≥1024px a <1024px con isEanMode: escáner sigue funcionando
[ ] Fix 7 — Tablet 768–1023px con isEanMode: cada escaneo agrega exactamente 1 unidad
[ ] Fix 8 — Escanear código no existente: aparece toast "Producto no encontrado"
[ ] Fix 9 — No existe TestScannerScreen ni suscripción a scan_events
[ ] Fix 10 — En producción (build): consola vacía al escanear
[ ] Mismo producto escaneado DOS veces seguidas rápido: el carrito muestra cantidad 2
```
