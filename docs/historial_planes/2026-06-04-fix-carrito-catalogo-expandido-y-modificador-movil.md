# Fix: Carrito en modo catálogo — Items expandidos por defecto + Modificador en móvil

Fecha: 2026-06-04

## Problema 1: Botón "Modificador" no aparecía en móvil

En el `PaymentScreen` (carrito en móvil), el componente `CartItemRow` se renderizaba **sin la prop `onEditProduct`**, por lo que el botón "Modificador" no se mostraba. Aunque `PaymentScreen` recibía `onEditProduct` desde `App.tsx`, no lo pasaba a los items individuales.

### Solución

Se pasó `onEditProduct={onEditProduct ? () => onEditProduct(item as any) : undefined}` al `CartItemRow` dentro de `PaymentScreen.tsx`.

---

## Problema 2: Items no permanecían expandidos en modo catálogo

Se implementó `defaultExpanded` para que en modo catálogo los items del carrito aparezcan con las opciones visibles (cantidad, Modificador, Descuento). Sin embargo, al agregar un producto, los items aparecían expandidos brevemente y luego se colapsaban automáticamente.

### Causa raíz

En `CartItemRow` existía un `useEffect` que sincronizaba `forceExpanded` al estado local:

```tsx
useEffect(() => {
    setLocalExpanded(forceExpanded);
}, [forceExpanded]);
```

Como `forceExpanded` es `false` por defecto, este efecto se ejecutaba en el primer render y **sobreescribía** el valor de `defaultExpanded` que se había pasado a `useState(defaultExpanded)`. Secuencia: `useState(true)` → render → `useEffect` ejecuta `setLocalExpanded(false)` → re-render colapsado.

### Solución

Se modificó el `useEffect` para que solo actúe cuando `forceExpanded` es `true`:

```tsx
useEffect(() => {
    if (forceExpanded) {
        setLocalExpanded(true);
    }
}, [forceExpanded]);
```

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `components/CartItemRow.tsx` | Nueva prop `defaultExpanded`; fix del `useEffect` que reseteaba el estado |
| `screens/PaymentScreen.tsx` | Se pasa `onEditProduct` y `defaultExpanded={isCatalogMode}` a `CartItemRow`; nueva prop `isCatalogMode` en la interfaz |
| `screens/MenuScreen.tsx` | Se pasa `defaultExpanded={!isEanMode}` a `CartItemRow` |
| `App.tsx` | Se pasa `isCatalogMode={!isEanMode}` al `PaymentScreen` |

## Comportamiento final

- **Modo catálogo (móvil y desktop):** Items del carrito aparecen expandidos por defecto con acceso directo a Modificador, cantidad y Descuento.
- **Modo EAN/Escáner:** Items colapsados como antes (el usuario expande manualmente si necesita).
- El usuario puede colapsar manualmente cualquier item expandido.
