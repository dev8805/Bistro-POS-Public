# Borde/outline negro al enfocar o al hacer clic (focus outline)

Guía de diagnóstico y solución para el **borde oscuro** (a veces un **parpadeo**) que
aparece alrededor de inputs, botones o contenedores al hacer clic, al cambiar de
vista, o al hacer clic fuera de un campo. Documentado tras resolverlo varias veces
en `CashRegisterScreen` (junio 2026). Si lo vuelves a ver en otra pantalla, sigue
esta guía.

## Qué es

Es el **focus outline por defecto del navegador** (User-Agent stylesheet). Chrome lo
dibuja cuando un elemento recibe foco. Suele verse como un contorno oscuro
(`gray-500 #6b7280`, `gray-900 #111827` o `slate-900 #0f172a`) de 2–3px que sigue el
`border-radius`.

La forma **correcta y accesible** de controlarlo es el pseudo-selector
[`:focus-visible`](https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible):
el navegador muestra el anillo solo cuando detecta navegación por **teclado** (Tab),
y lo oculta en clics de mouse/touch o foco programático.

## Síntomas vistos y su causa

| Síntoma | Causa raíz | Elemento |
|---|---|---|
| Borde negro fijo en un `<input>` al enfocarlo | Falta regla que quite el outline en inputs | input |
| Borde negro **al hacer clic fuera** del input (un frame y se va) | El input pierde foco (`blur`); por un frame Chrome pinta su outline por defecto. `transition-all` lo **anima desvaneciéndose** → parpadeo | input con `autoFocus` |
| Borde negro al hacer clic en backdrop o flecha | `<button>`/`<div>` no cubiertos por la regla de inputs; reciben outline UA | button/div |
| Borde gris que **aparece y se quita** en un botón al cambiar de vista | El foco salta al botón recién montado y el outline UA se **anima desvaneciendo** por `transition-all` | button |

> Punto clave: cuando el borde es un **parpadeo**, casi siempre es el outline del
> navegador **animándose** por `transition-all` (que incluye `outline-color`) mientras
> el elemento pierde el foco. No es un estado estable.

## Soluciones (en orden de preferencia)

### 1. Inputs/textarea/select — regla global en `index.css`
Los campos de formulario **nunca** muestran outline (su foco se indica con `focus:ring-*`).
La regla cubre **todos los estados**, incluido el frame de blur:

```css
input, input:focus, input:focus-visible,
textarea, textarea:focus, textarea:focus-visible,
select, select:focus, select:focus-visible {
    outline: none !important;
    outline-offset: 0 !important;
}
```

> Cubrir solo `:focus`/`:focus-visible` **no basta**: el parpadeo ocurre en el frame
> de `blur`, donde esos selectores ya no aplican. Por eso la regla incluye el selector
> base (`input`, `textarea`, `select`).

### 2. Botones, enlaces y contenedores clickables — regla global accesible
Quita el outline cuando el foco **no** viene del teclado, conservándolo para teclado:

```css
:focus:not(:focus-visible) {
    outline: none !important;
}
```

### 3. Evitar `transition-all` en elementos enfocables
`transition-all` incluye `outline` y `box-shadow`, así que **anima** la aparición/
desaparición del outline → parpadeo. Usa transiciones específicas:

```tsx
// ❌ MAL — anima el outline al perder foco
className="... transition-all ..."

// ✅ BIEN — solo anima color/fondo/borde
className="... transition-colors ..."
// o en línea:
style={{ transitionProperty: 'color, background-color, border-color' }}
```

### 4. Garantía inline (defensa adicional)
Si un elemento puntual sigue mostrando el borde, fuerza el outline con estilo inline
(máxima prioridad) — siempre que el foco se indique de otra forma (ring) por a11y:

```tsx
style={{ outline: 'none' }}
```

### 5. Backdrops que cierran un panel
Dale `tabIndex={-1}` + `role="button"` + `aria-label`. Así al hacer clic captura el
foco con modalidad mouse (no `:focus-visible`) y retira el foco del input de forma
limpia, sin dejar el borde. (Patrón usado en `SimpleProductScreen` y en el backdrop
de la caja en `App.tsx`.)

## Accesibilidad (no romper el teclado)

- **Nunca** quites el outline sin dejar un indicador para teclado. Los inputs ya usan
  `focus:ring-*` (box-shadow); los botones pueden usar `focus-visible:ring-2`.
- El patrón `:focus:not(:focus-visible)` **preserva** el anillo para usuarios de
  teclado (WCAG 2.4.7 *Focus Visible*).

## Cómo diagnosticar (si reaparece)

Pega temporalmente este `useEffect` en la pantalla afectada para ver qué elemento
pinta el outline y en qué momento (no olvides quitarlo después):

```tsx
useEffect(() => {
  const sample = (label: string, el: HTMLElement | null) => {
    if (!el?.matches) return;
    const cs = getComputedStyle(el);
    const visible = cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px'
      && !cs.outlineColor.includes('rgba(0, 0, 0, 0)');
    if (visible) console.log(`[OUTLINE ${label}]`, el.tagName, el.className.slice(0, 40),
      cs.outlineStyle, cs.outlineWidth, cs.outlineColor);
  };
  const onIn = (e: FocusEvent) => {
    const el = e.target as HTMLElement;
    sample('focusin', el);
    requestAnimationFrame(() => sample('raf', el)); // captura el frame del parpadeo
  };
  const onOut = (e: FocusEvent) => requestAnimationFrame(() => sample('blur-raf', e.target as HTMLElement));
  document.addEventListener('focusin', onIn, true);
  document.addEventListener('focusout', onOut, true);
  return () => {
    document.removeEventListener('focusin', onIn, true);
    document.removeEventListener('focusout', onOut, true);
  };
}, []);
```

- Si `outlineStyle: 'solid'` con color oscuro en `blur-raf` o `raf` → es el parpadeo
  por `transition-all`. Solución: #3.
- Si es un `<input>` → revisa la regla #1 en `index.css`.
- Si es `<button>`/`<div>` → reglas #2/#4, o `tabIndex={-1}` para backdrops (#5).

## Archivos donde ya está aplicado

| Archivo | Qué |
|---|---|
| `index.css` | Reglas globales #1 (inputs en todos los estados) y #2 (`:focus:not(:focus-visible)`) |
| `screens/CashRegisterScreen.tsx` | Botón "Atrás" con `transition-colors` + `outline:none` inline (#3, #4) |
| `App.tsx` | Backdrop de la caja con `tabIndex={-1}` + `role="button"` (#5) |
