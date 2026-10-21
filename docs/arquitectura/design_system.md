# Bistro POS Design System

## 1. Identidad Visual: "Warm Bistro"
La identidad visual de la aplicación se unifica bajo el color núcleo **Amber (#fbbf24)**, evocando calidez y energía.

### 🎨 Paleta Semántica

| Token Semántico | Valor Hex / Tailwind | Uso Principal | Texto sobre Fondo |
|---|---|---|---|
| **brand-primary** | `#fbbf24` (amber-400) | Botones principales, Acciones clave, Highlights | `#102218` (Oscuro) |
| **brand-hover** | `#f59e0b` (amber-500) | Estado hover de botones primarios | `#102218` (Oscuro) |
| **brand-light** | `#fffbeb` (amber-50) | Fondos suaves, tintes de selección | `#b45309` (amber-700) |
| **brand-secondary**| `#102218` (Emerald Dark)| Fondos oscuros, Sidebar, Contraste fuerte | `#fbbf24` (Amber) |
| **bg-app** | `#f8fafc` (slate-50) | Fondo general de la aplicación | `#0f172a` (slate-900) |
| **surface** | `#ffffff` (white) | Tarjetas, Paneles, Modales | `#0f172a` (slate-900) |

---

## 2. Configuración (Tailwind)

Ubicación: `index.html` (o `tailwind.config.js` en proyectos externos).

```javascript
/* Configuración Actual */
colors: {
  // Marca Principal (Ámbar)
  primary: {
    DEFAULT: "#fbbf24", // amber-400
    hover: "#f59e0b",   // amber-500
    active: "#d97706",  // amber-600
    light: "#fffbeb",   // amber-50
    text: "#78350f",    // amber-900
  },
  
  // Marca Secundaria / Superficies Oscuras
  layout: {
    dark: "#102218",    // Fondo sidebar/login oscuro
    light: "#f8fafc",   // Fondo app limpio
  },

  // Semánticos de Estado
  status: {
    success: "#10b981", // emerald-500
    warning: "#f59e0b", // amber-500
    error: "#ef4444",   // red-500
    info: "#3b82f6",    // blue-500
  },

  // Pagos
  payment: {
    cash: '#10b981', // emerald-500
    card: '#2563eb', // blue-600
    nequi: '#ec4899', // pink-500
    daviplata: '#ef4444', // red-500
    transfer: '#06b6d4', // cyan-500
  }
}
```

---

## 3. Tokens de Tipografía y Espaciado

```javascript
// extend.fontSize
'2xs': ['0.625rem', { lineHeight: '0.75rem' }], // 10px - Etiquetas pequeñas, badges
'caption': ['0.75rem', { lineHeight: '1rem' }],  // 12px - Textos secundarios (xs standard)
'body': ['0.875rem', { lineHeight: '1.25rem' }], // 14px - Texto base (sm standard)
```

---

## 4. Tipografía — Sistema extendido v2 (HomeScreen)

Aplicado exclusivamente en `screens/HomeScreen.tsx`. El resto de la app conserva DM Sans + Outfit.

| Familia | Uso | Import |
|---|---|---|
| **Plus Jakarta Sans** | Títulos, headers, labels de sección | Google Fonts |
| **Noto Sans** | Cuerpo, metadata, subtítulos | Google Fonts |
| **JetBrains Mono** | Cifras monetarias, SKUs, contadores | Google Fonts |

### Escala de tokens

| Token | Tamaño | Line-height | Weight | Uso |
|---|---|---|---|---|
| `display-xl` | 32px / 2rem | 1.1 | 800 | Hero, pantallas de éxito |
| `display-lg` | 24px / 1.5rem | 1.2 | 700 | Títulos de pantalla |
| `title` | 20px / 1.25rem | 1.3 | 700 | Headers de modal, secciones |
| `subtitle` | 16px / 1rem | 1.4 | 600 | Labels de grupo, encabezados de tarjeta |
| `body` | 14px / .875rem | 1.5 | 400 | Texto corrido (default) |
| `caption` | 12px / .75rem | 1.5 | 500 | Metadata, ayuda, footer de tarjeta |
| `overline` | 11px / .69rem | 1.2 | 700 | Etiquetas en mayúsculas (+0.09em tracking) |
| `micro` | 10px / .625rem | 1.2 | 600 | Badges, contadores |

### Reglas
- Mínimo móvil: **14px**. `caption` y menor solo para metadata, nunca para acciones.
- Pesos: `400` cuerpo · `500` énfasis · `600` subtítulos · `700` títulos · `800` hero.
- Color: `text-main` `#0f172a` títulos · `text-secondary` `#64748b` apoyo · `text-muted` `#94a3b8` overline.
- Tracking: `-0.01em` en display · `0` en body · `+0.09em` en overline mayúsculas.
- Números monetarios: `font-variant-numeric: tabular-nums` (clase `.hm-mono`).

### Clases CSS en HomeScreen
```css
.hm-display { font-family: 'Plus Jakarta Sans', sans-serif; }
.hm-body    { font-family: 'Noto Sans', sans-serif; }
.hm-mono    { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
```

---

## 5. Archivos Clave
*   `screens/LoginScreen.tsx`: Implementa la identidad visual pública.
*   `screens/DashboardScreen.tsx`: Implementa el uso de tokens semánticos en widgets.
*   `screens/ProductsScreen.tsx`: Estandariza etiquetas de estado y tipos de producto.
*   `screens/HomeScreen.tsx`: Pantalla de inicio móvil — tipografía v2, KPIs, accesos rápidos.

---

## 6. Bottom Sheets en móvil (patrón estándar)

**Regla:** todo bottom sheet en móvil (los actuales y los nuevos) debe poder **cerrarse arrastrándolo hacia abajo desde cualquier parte del panel**, no solo desde el agarradero. Esta es la interacción por defecto; no hace falta pedirla.

### Implementación de referencia
- `screens/HomeScreen.tsx` — sheets de Gastos y Abonos (caso base, sin scroll interno).
- `components/ProductOptionsModal.tsx` — sheet de carpetas/etiquetas (caso con lista scrolleable interna).

### Anatomía del gesto
1. **`onTouchStart`** sobre todo el panel: guarda el `clientY` inicial en un `ref`.
2. **`touchmove` como listener nativo con `{ passive: false }`** (vía `useEffect` + `addEventListener`, **no** el `onTouchMove` de React): permite `e.preventDefault()` para arrastrar el panel en vez de disparar scroll/pull-to-refresh del navegador. Solo arrastra si `delta > 5`.
3. **`onTouchEnd`** sobre el panel: si el desplazamiento supera **80px** se cierra con animación hacia abajo (`translateY(100%)`); si no, regresa a `translateY(0)`.
4. **Transform en vivo** vía estado (`translateY(${offset}px)`), con `transition-transform` aplicada solo cuando **no** se está arrastrando, y la animación de entrada (`slideInUp`) solo cuando `offset === 0`.
5. El **backdrop** se desvanece proporcionalmente al arrastre (`opacity: 1 - offset / 400`).

### Detalle obligatorio si el sheet tiene lista scrolleable
El arrastre-para-cerrar solo debe activarse cuando la lista interna está **arriba del todo** (`list.scrollTop <= 0`). Si no, se deja hacer scroll nativo; el cierre solo arranca al seguir tirando hacia abajo desde el tope. Esto evita que scroll y cierre peleen. Usar `touchAction: 'pan-y'` en el panel (no `'none'`, que mataría el scroll).

### Ajuste de sensibilidad (sheets con lista scrolleable)

Para que el scroll de la lista interna no dispare el cierre por accidente, además de la regla anterior:

1. **Capturar el estado del scroll al inicio del gesto, no en vivo.** En `onTouchStart` se guarda en un `ref` si la lista estaba arriba del todo (`startedAtTop = list.scrollTop <= 0`). El arrastre-para-cerrar **solo se permite si `startedAtTop` es `true`**.
   - Motivo: si se evalúa `scrollTop <= 0` en cada `touchmove`, un gesto que empezó como scroll hacia arriba se convierte en cierre en el instante en que la lista llega al tope a mitad del movimiento. Esto se siente "muy sensible" y cierra el sheet sin querer.
   - Con `startedAtTop`: si el gesto empezó scrolleando (no en el tope), todo el gesto es scroll y nunca cierra. Para cerrar hay que **iniciar** el arrastre ya estando arriba del todo.
2. **Umbral mínimo de arrastre: `delta > 8`** (en vez de `5`). Evita que un micro-movimiento o el rebote del scroll active el arrastre del panel.

```js
// onTouchStart
swipeStartY.current = e.touches[0].clientY;
const list = listRef.current;
startedAtTopRef.current = !list || list.scrollTop <= 0;

// touchmove nativo (passive:false)
const delta = e.touches[0].clientY - swipeStartY.current;
if (delta > 8 && startedAtTopRef.current) {
    e.preventDefault();
    // ...iniciar/continuar arrastre
}
```

### Implementación de referencia (con este ajuste)
- `components/TableSelectorControl.tsx` — bottom sheet del selector de mesas (lista scrolleable + `startedAtTop` + umbral 8px).
