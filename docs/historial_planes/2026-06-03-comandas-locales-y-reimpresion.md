# Comandas: Impresión Local, Modificaciones y Reimpresión — 2026-06-03

## Resumen

Conjunto de mejoras al sistema de comandas de cocina. El objetivo fue permitir imprimir comandas en el mismo dispositivo/impresora que emite los tickets, mostrar las modificaciones de los productos, poder reimprimir, y condicionar toda la funcionalidad al modo Catálogo.

Restricciones respetadas en todos los cambios: **no se tocó el sistema de Presence** (`kitchenCommandService.ts`, `useKitchenPrinter.ts`) ni la **impresión del ticket de venta** (`printReceiptDirect`).

---

## Cambios Implementados

### 1. Imprimir comanda en el mismo dispositivo (impresión local)

**Problema:** Un usuario con impresora conectada no podía imprimir la comanda en su propio dispositivo. El sistema solo permitía enviar la comanda a *otro* dispositivo de cocina vía Supabase Realtime (el filtro `useAvailablePrinters` excluye al propio usuario).

**Solución:** Botón "Imprimir Comanda aquí" en `SuccessScreen` y `SuccessSidebar` que llama directamente a `printKitchenCommandDirect()` sobre la impresora USB local, sin pasar por Realtime. Aparece cuando hay impresora conectada (`printerConnected`).

**Archivos:** `screens/SuccessScreen.tsx`, `components/SuccessSidebar.tsx`

---

### 2. Mostrar modificaciones de productos en la comanda + separador por producto

**Problema:** La comanda imprimía el producto pero no sus modificaciones (opciones tipo "SIN CREMA", ingredientes removidos, notas), aunque `printKitchenCommandDirect` ya sabía formatearlas. Además, los productos no tenían separación visual.

**Causa raíz:** `ReceiptItem` no incluía `notes`/`cookingTerm`/`removedIngredients`, y los handlers de comanda los enviaban como `undefined`.

**Solución:**
- Se agregaron los campos opcionales `notes`, `cookingTerm`, `removedIngredients` a `ReceiptItem` (`types.ts`).
- Se copian desde el carrito en los 3 puntos de `App.tsx` donde se arma `receiptItems`.
- Los 4 handlers de comanda (`SuccessScreen` y `SuccessSidebar`) usan los valores reales.
- En `printKitchenCommandDirect` se agregó un separador `dashed` entre cada producto (no tras el último).

El **ticket de venta** no lee esos campos, por lo que no se vio afectado.

**Archivos:** `types.ts`, `App.tsx`, `screens/SuccessScreen.tsx`, `components/SuccessSidebar.tsx`, `lib/thermalPrinterService.ts`

---

### 3. Reimpresión de comandas + icono en el historial

**Solución:**
- En `SuccessScreen`/`SuccessSidebar`, el botón de comanda local ya no se bloquea tras imprimir: cambia a "Reimprimir Comanda" con check verde pero sigue clickeable. Los botones de envío remoto también permiten reenviar.
- En `SalesScreen` (historial) se agregó un icono naranja (`restaurant`) junto a los demás iconos de acción que reimprime la comanda de la venta seleccionada con `printKitchenCommandDirect()`. Los ítems traen `notes`, `cooking_term`, `removed_ingredients` y `sale_unit` desde la BD.

**Archivos:** `screens/SuccessScreen.tsx`, `components/SuccessSidebar.tsx`, `screens/SalesScreen.tsx`

---

### 4. Condicionar comandas al modo Catálogo

**Problema:** La comanda solo tiene sentido en modo Catálogo, no en modo Escáner/EAN.

**Solución:**
- `SuccessScreen` recibe `isCatalogMode={!isEanMode}` desde `App.tsx`; `SuccessSidebar` lo recibe desde `MenuScreen.tsx`. Toda la sección de comanda se condiciona a `isCatalogMode`.
- `SalesScreen` lee `localStorage.getItem('bistro_sale_mode')` al montar para mostrar u ocultar el icono de comanda.

**Archivos:** `screens/SuccessScreen.tsx`, `components/SuccessSidebar.tsx`, `screens/MenuScreen.tsx`, `screens/SalesScreen.tsx`, `App.tsx`

---

### 5. Fix: el modo Catálogo no se detectaba en móvil

**Problema:** En móvil, el toggle Escáner/Catálogo solo cambiaba un estado local `isScannerMode` en `MenuScreen`, sin tocar el `isEanMode` global. Por eso `SuccessScreen` móvil nunca veía el modo Catálogo y no mostraba la comanda.

**Solución:** Se sincronizó `isScannerMode` con `isEanMode` — se inicializa desde él, un `useEffect` lo realinea, y los botones del dropdown móvil llaman a `onEanModeChange`. Las ramas de lógica que dependen de `isEanMode` en desktop están protegidas por `window.innerWidth >= 1024`, así que el comportamiento visible en móvil no cambia.

**Archivos:** `screens/MenuScreen.tsx`

---

### 6. Persistir el modo de venta (Opción C + localStorage)

**Solución:** El estado global `isEanMode` ahora se inicializa desde `localStorage` (`bistro_sale_mode`: `'ean'` | `'catalog'`, default `'ean'`) y se persiste en cada cambio mediante un `useEffect`. Es una preferencia por dispositivo, persistente entre sesiones, sin tablas nuevas ni dependencia de red. `SalesScreen` lee esta misma clave para decidir si muestra el icono de comanda.

**Archivos:** `App.tsx`, `screens/SalesScreen.tsx`

---

## Documentación Actualizada

- `docs/caracteristicas/comandas_cocina.md` — reescrita para reflejar impresión local + remota, modificaciones, separadores, reimpresión, detección de modo y persistencia.
- `docs/caracteristicas/historial_ventas.md` — nuevo icono de reimpresión de comanda.
- `docs/caracteristicas/modo_catalogo_pos.md` — persistencia en `localStorage` y sincronización móvil/desktop del toggle.

---

## Verificación

- `npx tsc --noEmit`: sin errores nuevos introducidos (los 11 errores preexistentes en otros archivos no relacionados se mantienen igual).
- `getDiagnostics` limpio en todos los archivos modificados.
