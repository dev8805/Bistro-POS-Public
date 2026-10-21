# Fix: Recarga innecesaria de productos al dar "Procesar Pago" en Desktop

**Objetivo:** Eliminar el flash/recarga visual del grid de productos al navegar a la pantalla de pago en desktop.
**Arquitectura:** El problema es una doble-instancia de MenuScreen que causa desmontaje/remontaje innecesario.
**Tech Stack:** React, TypeScript

---

## Diagnóstico

### Flujo actual (con bug):

1. Usuario está en `Screen.SELL` → SellScreen renderiza MenuScreen internamente (línea 225-256 de SellScreen.tsx)
2. Usuario hace click en "Procesar Pago" → `handleNavigate(Screen.PAYMENT)`
3. `currentScreen` cambia de `SELL` a `PAYMENT`
4. **SellScreen se DESMONTA** (condición `currentScreen === Screen.SELL` en App.tsx:1788 deja de ser true)
5. **El MenuScreen que estaba dentro de SellScreen se DESMONTA** junto con él
6. **Un NUEVO MenuScreen se MONTA** por la condición de App.tsx:1903 (`PAYMENT` está incluida)
7. Este nuevo MenuScreen ejecuta `useProducts()` internamente (hook en MenuScreen.tsx:93)
8. El hook dispara una nueva consulta a Supabase → los productos se recargan → flash visual

### Causa raíz:
Existen **DOS instancias** de MenuScreen en la app:
- **Instancia A:** Dentro de SellScreen (línea 226 de SellScreen.tsx) — vive solo cuando `currentScreen === Screen.SELL`
- **Instancia B:** Directamente en App.tsx (línea 1905) — vive cuando `currentScreen` es MENU, QUICK_ORDER, PAYMENT o SUCCESS

Al pasar de SELL → PAYMENT, la **Instancia A se destruye** y la **Instancia B se crea**, causando:
1. Re-ejecución del hook `useProducts()` (nueva query a DB)
2. Re-renderizado completo del grid de productos
3. Reset de estado interno (categoría seleccionada, scroll, búsqueda)

### Nota importante:
MenuScreen siempre ejecuta `useProducts()` (línea 93) aunque reciba `products` por props. Aunque usa los props cuando están disponibles (`isUsingPropsProducts`), el hook igual se ejecuta y carga categorías.

---

## Solución

### Tarea 1: Mantener la Instancia B viva durante SELL

**Archivos:**
- Modify: `App.tsx:1903`

**Paso 1: Incluir Screen.SELL en la condición de renderizado de MenuScreen (Instancia B)**

Actualmente:
```tsx
{(currentScreen === Screen.MENU || currentScreen === Screen.QUICK_ORDER || currentScreen === Screen.PAYMENT || currentScreen === Screen.SUCCESS) && (
```

Cambiar a:
```tsx
{(currentScreen === Screen.SELL || currentScreen === Screen.MENU || currentScreen === Screen.QUICK_ORDER || currentScreen === Screen.PAYMENT || currentScreen === Screen.SUCCESS) && (
```

Y ocultar visualmente cuando estamos en SELL:
```tsx
<div className={`flex-1 h-full min-w-0 overflow-hidden ${currentScreen === Screen.SELL || currentScreen === Screen.PAYMENT || currentScreen === Screen.SUCCESS ? 'hidden md:flex' : 'flex'}`}>
```

**PROBLEMA:** Esto crea una Instancia B duplicada con la Instancia A (dentro de SellScreen), mostrando DOS MenuScreens simultáneamente en desktop.

### Tarea 1 (Revisada): Ocultar la Instancia A de SellScreen en desktop y usar solo Instancia B

Esto es invasivo y puede romper funcionalidad. **DESCARTADO.**

### Tarea 1 (Final): Evitar que el hook useProducts() haga fetch cuando los productos vienen por props

**Archivos:**
- Modify: `screens/MenuScreen.tsx:93`

**Paso 1:** Cuando MenuScreen recibe productos por props (Instancia B, que siempre recibe `products`), el hook `useProducts()` no debería hacer fetch de productos, solo de categorías.

**Paso 2:** Revisar si useProducts se puede optimizar para no re-fetchar cuando ya hay datos.

---

### SOLUCIÓN ELEGIDA: Evitar desmontaje de MenuScreen al ir a PAYMENT

La forma más limpia es que cuando el usuario está en `Screen.SELL` y navega a `Screen.PAYMENT`, en vez de desmontar SellScreen y montar un nuevo MenuScreen, el MenuScreen de la Instancia B ya esté montado y solo se oculte/muestre.

**Enfoque final:** Incluir `Screen.SELL` en la condición de Instancia B pero ocultarla con `hidden` cuando SellScreen ya la muestra. Luego cuando cambie a `PAYMENT`, SellScreen se desmonta pero Instancia B ya está viva y no necesita remontarse.

**Archivos:**
- Modify: `App.tsx:1903-1904`

**Cambio exacto:**
```tsx
// ANTES:
{(currentScreen === Screen.MENU || currentScreen === Screen.QUICK_ORDER || currentScreen === Screen.PAYMENT || currentScreen === Screen.SUCCESS) && (
  <div className={`flex-1 h-full min-w-0 overflow-hidden ${currentScreen === Screen.PAYMENT || currentScreen === Screen.SUCCESS ? 'hidden md:flex' : 'flex'}`}>

// DESPUÉS:  
{(currentScreen === Screen.SELL || currentScreen === Screen.MENU || currentScreen === Screen.QUICK_ORDER || currentScreen === Screen.PAYMENT || currentScreen === Screen.SUCCESS) && (
  <div className={`flex-1 h-full min-w-0 overflow-hidden ${currentScreen === Screen.SELL || currentScreen === Screen.PAYMENT || currentScreen === Screen.SUCCESS ? 'hidden md:flex' : 'flex'}`}>
```

**RIESGO:** Instancia B se muestra en desktop cuando `currentScreen === Screen.SELL`, simultáneamente con la Instancia A que vive dentro de SellScreen. ¡Dos MenuScreens visibles!

Para evitar esto, `hidden md:flex` lo ocultaría, pero SellScreen usa `hidden md:flex` en desktop... Necesitamos `hidden` completo cuando SELL está activo.

**Cambio refinado:**
```tsx
<div className={`flex-1 h-full min-w-0 overflow-hidden ${currentScreen === Screen.SELL ? 'hidden' : (currentScreen === Screen.PAYMENT || currentScreen === Screen.SUCCESS ? 'hidden md:flex' : 'flex')}`}>
```

Cuando `SELL`: Instancia B está montada pero `hidden` (NO se ve, NO se desmonta).
Cuando `PAYMENT`: Instancia B se muestra (`hidden md:flex`) — ya estaba montada, no hay remontaje.
Cuando `MENU`/`QUICK_ORDER`: Instancia B se muestra normalmente (`flex`).

**Verificación:** La Instancia A dentro de SellScreen sigue funcionando normalmente en SELL. Al cambiar a PAYMENT, SellScreen se desmonta (Instancia A muere) pero Instancia B ya estaba viva con los datos cargados → NO hay recarga.
