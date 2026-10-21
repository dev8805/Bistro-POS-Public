# Plan: Corrección de advertencias react-doctor por fases

## Contexto
react-doctor reportó 1645 issues en 131 archivos (score 57→58 tras corregir los 3 errores críticos).
Las 6 advertencias más frecuentes se organizan en 4 fases ordenadas de menor a mayor riesgo y complejidad.
Criterios de orden: (1) impacto en score, (2) mecánico vs. caso por caso, (3) riesgo de regresión.

---

## Fase 1 — Cambios mecánicos globales (bajo riesgo) ✅ COMPLETADA
**Objetivo:** Eliminar ruido visual sin tocar lógica. Puro find-replace con regex.

### 1A — `font-bold` → `font-semibold` en headings (×228) ✅
### 1B — `w-N h-N` → `size-N` donde N es igual (×264 + decimales) ✅

Score: 58 → 60

---

## Fase 2 — Estabilidad de keys en listas (×69) ✅ COMPLETADA
**Objetivo:** Eliminar bugs potenciales al reordenar/filtrar listas.

### Estrategia por contexto:
- Si el item tiene `.id` → usar `key={item.id}`
- Si el item tiene `.name` o `.slug` → usar `key={item.name}`
- Si es una lista estática → `key={\`item-${index}\`}` con prefijo descriptivo
- Nunca usar `key={index}` en listas dinámicas

Score acumulado: ~60

---

## Fase 3 — Accesibilidad: labels y overlays (×292 combinados)
**Objetivo:** Cumplir estándares básicos de a11y.

### 3A — Backdrop overlays con `onClick` sin keyboard (×54 de 66 casos)
Los 54 casos son `<div className="inset-0 bg-black/..." onClick={onClose}>`.
**Fix mecánico:** agregar a cada overlay:
```tsx
role="button"
tabIndex={-1}
onKeyDown={(e) => e.key === 'Escape' && onClose()}
aria-label="Cerrar"
```
Archivos: todos los modales del proyecto (distribuidos en ~30 archivos).

### 3B — 12 divs interactivos con `onClick` sin teclado
Estos son divs que actúan como botones (seleccionar cliente, toggle ingrediente, etc.).
**Fix:** convertir a `<button type="button">` donde sea posible, o agregar `role="button" tabIndex={0} onKeyDown`.

Casos clave:
- `components/ProductModal.tsx` línea 90 — toggle ingrediente
- `screens/ClientsScreen.tsx` líneas 522, 619 — seleccionar cliente
- `screens/DebtsScreen.tsx` (9x) — selección de deuda

### 3C — Labels sin `htmlFor` (×156)
Cada label debe tener `htmlFor` que coincida con el `id` del input asociado.
**Proceso:** ir archivo por archivo, agregar `id` al input y `htmlFor` al label.

Top archivos (caso por caso):
- `screens/DebtsScreen.tsx` (17x)
- `components/expense/ExpenseRegister.tsx` (17x)
- `components/expense/InventoryPurchase.tsx` (16x)
- `screens/SimpleProductScreen.tsx` (11x)
- `screens/ClientsScreen.tsx` (10x)
- `screens/PaymentScreen.tsx` (10x)
- `components/PaymentSidebar.tsx` (8x)
- `components/expense/WasteRegister.tsx` (8x)

**Verificación Fase 3:**
- [ ] Navegar modales con Tab — foco debe moverse entre controles
- [ ] Presionar Escape debe cerrar overlays
- [ ] `npx react-doctor@latest --score`

---

## Fase 4 — Refactor arquitectónico: useState → useReducer (×42)
**Objetivo:** Mejorar mantenibilidad en componentes con estado complejo.

**4A — Sidebar.tsx (12 useState)** ← empezar aquí
- `touchReducer` para estados de gesto: `touchStartX, touchStartY, translateX, isDragging, isClosing`

**4B — PaymentSidebar.tsx (26 useState)**
- Agrupar por dominio: `paymentState`, `creditState`, `clientState`, `uiState`

**4C — DebtsScreen.tsx (32 useState)**
- Solo agrupar los relacionados: `debtFormState`, `supplierFormState`, `paymentFormState`

**NO refactorizar:** MenuScreen (28 useState, riesgo alto).

**Verificación Fase 4:**
- [ ] Flujo completo de venta en PaymentSidebar
- [ ] Apertura/cierre del Sidebar en móvil con swipe
- [ ] Registrar una deuda y hacer un pago parcial en DebtsScreen
- [ ] `npx react-doctor@latest --score`

---

## Estimado de mejora de score por fase

| Fase | Problema | Instancias | Score esperado |
|------|----------|-----------|---------------|
| Base inicial | — | — | 57 |
| Fase 0 | Errores críticos (eval, etc.) | 3 | 58 |
| Fase 1 | font-bold + size shorthand | 492 | 60 ✅ |
| Fase 2 | key stability | 69 | ~60-61 ✅ |
| Fase 3 | a11y labels + overlays | 292 | ~66-70 |
| Fase 4 | useReducer | 42 | ~72-75 |

## Archivos críticos a no romper
- `components/PaymentSidebar.tsx` — lógica de cobro principal
- `screens/MenuScreen.tsx` — flujo de venta completo
- `components/expense/ExpenseRegister.tsx` — registro de gastos
- `components/expense/InventoryPurchase.tsx` — compra de inventario
