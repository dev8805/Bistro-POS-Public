# Auditoría de Design System y Propuesta de Tokens — Bistro POS

> **Alcance.** Solo lo que se **renderiza** en el frontend vivo (React + Vite). Se excluyen pantallas/componentes desconectados, deprecados u ocultos (ver sección final). No se auditaron `/dist`, `/node_modules`, `/android`, `/supabase/functions`, los PDF de impresión (`@react-pdf`) ni los bocetos `/mockups`, `/rediseño home`, `/rediseño pos`.
> **Método.** Cada hallazgo cita archivo y línea (o pantalla). Las suposiciones van marcadas como **SUPOSICIÓN**. Los ratios de contraste WCAG se calcularon con la fórmula oficial (luminancia relativa), no estimados.
> **Fecha.** Auditoría basada en el estado actual del repositorio.

---

## 0. Cómo leer este documento

Un **design system** es el conjunto de decisiones visuales (colores, tamaños, formas) escritas una sola vez y reutilizadas en todas partes. Los **tokens** son esos valores guardados con un nombre (ej. `color.action.primary` en vez de `#fbbf24` suelto). Hoy Bistro tiene un *inicio* de sistema (una config de Tailwind con nombres), pero la mayor parte de la app ignora esos nombres y escribe los valores "a mano", lo que genera decenas de variantes casi iguales.

El documento tiene 9 secciones de entrega (resumen, tablas, fichas, inconsistencias, tokens JSON/CSS/Tailwind, plan de migración y preguntas), precedidas del inventario completo (Fase 1).

---

# 1. Resumen ejecutivo

Bistro POS usa **React 19 + TypeScript + Vite 6**, con **Tailwind CSS cargado por CDN** y la configuración de tema escrita *inline* dentro de `index.html` (no hay `tailwind.config.js` ni archivo central de tokens). Existe una base de tema decente (paleta ámbar "Warm Bistro", tipografía, sombras `card`), pero **está poco adoptada**: la mayoría de pantallas escribe colores, radios y sombras directamente ("hardcode"), creando mucha deuda visual.

**Los 5 problemas principales:**

1. **Un solo valor hardcodeado 191 veces.** El color de texto sobre ámbar `#102218` aparece literal 191 veces en vez de usar el token `text-text-onPrimary` (ej. `components/ProductCard.tsx:85`, `components/OfflineIndicator.tsx:31`). Cambiar la marca obliga a tocar 191 sitios.
2. **Caos de superficies oscuras.** El modo oscuro oficial define 2 colores (`#102218`, `#1c2e24`), pero el código usa ≥8 variantes casi idénticas: `#151e32` (×40), `#0B1120` (×22), `#0d1c14`, `#1A2638`, `#0c1912`, `#0c0f16`, `#1d3a2a`. Ningún criterio claro.
3. **Tres sistemas de diseño paralelos.** La config Tailwind, los componentes con clases Tailwind, y componentes 100% CSS-in-JS con paleta propia (`ConfirmDialog.tsx`, `Toast.tsx`) que no respetan ningún token. Hay **dos sistemas de Toast** distintos conviviendo.
4. **Contraste insuficiente en colores de estado.** Texto blanco sobre `success/warning/info` **falla WCAG AA** (success 2.54:1, warning 2.15:1). Solo funcionan si se usa texto oscuro.
5. **La config de tema está parcialmente muerta.** La sombra custom `shadow-card` solo se usa 6 veces (vs. 405 de `shadow-sm`), hay alias "legacy" duplicados en los colores, y `prefers-reduced-motion` no existe pese a ~20 animaciones.

---

# FASE 1 — INVENTARIO DE LO QUE EXISTE

## 1. Stack y base técnica

| Aspecto | Qué hay | Dónde |
|---|---|---|
| Framework | React 19 + TypeScript, montado con `ReactDOM.createRoot` en `<React.StrictMode>` | `index.tsx:18-23` |
| Build | Vite 6 (PWA + Capacitor Android) | `package.json`, steering |
| Sistema de estilos | **Tailwind CSS vía CDN** (`cdn.tailwindcss.com?plugins=forms,typography,container-queries`) | `index.html` (script del `<head>`) |
| Configuración de tema | **Inline** dentro de `index.html` (`tailwind.config = {...}`). NO existe `tailwind.config.js` ni archivo de tokens central | `index.html` (bloque `<script>`) |
| CSS global | Reset, scrollbars, ~20 animaciones keyframes, reglas de foco | `index.css` |
| Gestor de temas | `darkMode: "class"` declarado | `index.html` config |
| Router | **Router casero por estado** (`currentScreen === Screen.X &&`), NO React Router | `App.tsx` (enum en `types.ts:5-40`) |
| Librería de UI externa | Ninguna (no MUI, no Chakra, no shadcn, no Bootstrap). "Design system" propio en `components/ui/` con **solo 3 archivos** | `components/ui/{AppButton,DocumentScanner,ProductThumb}.tsx` |
| Íconos | Material Symbols Outlined (Google Fonts), 1526 usos | `index.html` (`<link>`), conteo en `components/`+`screens/` |

**Modo claro/oscuro.** `darkMode: "class"` está configurado y hay **cientos** de variantes `dark:` en el código (ej. `components/ProductCard.tsx:36`, `components/Sidebar.tsx` en casi todos sus botones). Sin embargo, **no se encontró ningún punto que aplique/alterne la clase `.dark` en `<html>`** desde la app (no hay toggle de tema ni detección de `prefers-color-scheme` conectada a un setter de clase).

> **SUPOSICIÓN:** el modo oscuro es *latente* — el código lo soporta en estilos pero el usuario final no lo activa en producción. Verificar si existe un setter de la clase `dark` fuera del alcance leído. Esto significa que **la mitad del CSS (`dark:*`) puede estar sin uso real**, lo que infla el peso visual y el mantenimiento.

**Variables CSS / tokens existentes.** No hay `:root { --token }` de diseño. Los únicos "tokens" son los nombres de la config Tailwind inline (`primary`, `surface`, `text`, `status`, etc.). Se usan **de forma desigual**: conviven con miles de valores hardcodeados (ver secciones 2 y 11). Hay además variables CSS *puntuales* de layout, no de diseño: `--grace-banner-h` (`App.tsx:3406`, `components/Sidebar.tsx`).

**Alias legacy duplicados.** La config define los colores dos veces: la forma anidada (`background.light`) y la forma plana "legacy" (`"background-light"`), con un comentario `// Compatibilidad legacy (mientras se refactoriza)` (`index.html`, bloque `colors`). Ambos conviven en el código.

---

## 2. Color

### 2.1 Paleta oficial (config Tailwind inline — `index.html`)

| Rol | Token | HEX | Equivalente Tailwind |
|---|---|---|---|
| Primario (marca) | `primary.DEFAULT` | `#fbbf24` | amber-400 |
| Primario hover | `primary.hover` | `#f59e0b` | amber-500 |
| Primario active | `primary.active` | `#d97706` | amber-600 |
| Primario claro (fondo) | `primary.light` | `#fffbeb` | amber-50 |
| Texto sobre ámbar | `primary.text` | `#78350f` | amber-900 |
| Fondo claro | `background.light` | `#f8fafc` | slate-50 |
| Fondo oscuro | `background.dark` | `#102218` | green-950 (identidad Bistro) |
| Superficie clara | `surface.light` | `#ffffff` | white |
| Superficie oscura | `surface.dark` | `#1c2e24` | green-900 |
| Texto principal | `text.main` | `#0f172a` | slate-900 |
| Texto secundario | `text.secondary` | `#64748b` | slate-500 |
| Texto sobre primario | `text.onPrimary` | `#102218` | (verde Bistro) |
| Éxito | `status.success` | `#10b981` | emerald-500 |
| Advertencia | `status.warning` | `#f59e0b` | amber-500 |
| Error | `status.error` | `#ef4444` | red-500 |
| Información | `status.info` | `#3b82f6` | blue-500 |

> **Secundario y acento:** NO existe un token "secondary" ni "accent" propio. El steering menciona "Secondary: Emerald Dark #102218", pero en la config eso es `text.onPrimary`/`background.dark`, no un color secundario de marca. **Falta un color secundario definido** (lo que normalmente haría falta en un sistema completo).

### 2.2 Colores "sueltos" (hardcodeados) — los más frecuentes

Conteo real sobre `components/*.tsx` + `screens/*.tsx` (excluyendo tests), patrón `#rrggbb`:

| HEX | Frecuencia | Qué es / debería ser | Ejemplo |
|---|---|---|---|
| `#102218` | **191** | = `text.onPrimary`. Debería ser `text-text-onPrimary` | `components/ProductCard.tsx:85`, `OfflineIndicator.tsx:31` |
| `#151e32` | 40 | Superficie oscura inventada (azulada) | `components/ScreenLoader.tsx:4`, `screens/TablesScreen.tsx:198` |
| `#0f172a` | 23 | = `text.main` | varios |
| `#0B1120` | 22 | Fondo oscuro inventado (muy oscuro azul) | varios screens |
| `#0d1c14` | 18 | Superficie oscura verde inventada | varios |
| `#dc2626` | 17 | red-600 (hover de error) hardcode | varios |
| `#1A1A1A` | 16 | Casi-negro inventado | varios |
| `#009459` | 14 | Verde "éxito" inventado (≠ `#10b981`) | varios |
| `#ffffff` | 12 | = `surface.light` | varios |
| `#2563eb` | 12 | blue-600 hardcode | varios |
| `#64748b` | 12 | = `text.secondary` | varios |
| `#fbbf24` | 11 | = `primary` (¡el token escrito a mano!) | varios |
| `#f59e0b` | 10 | = `primary.hover` / `status.warning` | varios |
| `#16a34a` | 10 | green-600 "éxito" inventado | varios |
| `#111814` | 4 | Casi-negro de títulos de `ProductCard` | `components/ProductCard.tsx:62,124` |

### 2.3 Grupos de valores casi iguales (para unificar)

**Verdes de "éxito" / marca (5+ variantes):** `#10b981` (token oficial), `#009459` (×14), `#16a34a` (×10), `#007a49` (×5), `#25D366` (×5, verde WhatsApp), `#4dcba1` (`screens/ClientsScreen.tsx:280`). → Unificar a `status.success` salvo el verde WhatsApp (que es branding externo legítimo).

**Superficies/fondos oscuros (8+ variantes):** `#102218`, `#1c2e24` (oficiales) + `#151e32`, `#0B1120`, `#0d1c14`, `#1A2638`, `#1a2e23`, `#0c1912`, `#0c0f16`, `#0a0a0a`, `#1d3a2a`. → Reducir a 2-3 niveles (fondo / superficie / superficie elevada).

**Off-whites claros (5 variantes casi iguales):** `#f8fafc` (token), `#f6f8f7` (el del `<body style>` en `index.html`), `#f0f4f3`, `#f8fafb`, `#f8faf9`. → Unificar a un solo `background.light`.

**Ámbares de botón:** `#fbbf24`, `#f59e0b`, `#F39C12` (×4), `#D68910` (×5), `#fff100` (×2, amarillo puro). → Consolidar en la escala `primary.*`.

### 2.4 Gradientes, overlays y transparencias

- **Gradiente "IA"**: `from-[#4285F4] via-[#9B72CB] to-[#D96570]` (colores de Google Gemini) — `components/EvidenceUploader.tsx:134`. Branding externo, aceptable.
- **Overlays modales**: `bg-black/40`, `bg-black/50`, `bg-black/60` (tres opacidades distintas para lo mismo) + `backdrop-blur-sm` / `backdrop-blur-[3px]` / `blur(2px)` inline. Ej. `App.tsx:3754,3801,3824`, `screens/SubscriptionManagementScreen.tsx:914,961`.
- **Toast oscuro**: `rgba(30,30,30,0.95)` inline — `components/Toast.tsx:21`.

### 2.5 Colores de estado interactivo (hover/active/focus/disabled/selected)

- **hover**: definido en `primary.hover` pero también hardcode (`hover:bg-red-600`, `hover:bg-emerald-950` en `OfflineIndicator.tsx:113`).
- **active**: `active:scale-[0.98]` / `active:scale-95` / `active:scale-[0.97]` (tres escalas para el mismo gesto) — `AppButton.tsx:20`, `MobileNavBar.tsx:58`, `ProductCard.tsx:36`.
- **focus**: `focus:outline-none` en todos los botones + anillos `focus:ring-*` dispersos. En inputs, `outline:none !important` global (ver 10).
- **disabled**: `disabled:opacity-70` (AppButton) vs `disabled:opacity-50` / `disabled:opacity-30` (ProductCard) — tres niveles.
- **selected/active (nav)**: `bg-amber-400 text-slate-950` (MobileNavBar) vs `bg-gray-100 text-gray-900` (Sidebar) — dos lenguajes de "activo".

### 2.6 Contraste WCAG (calculado, fórmula oficial)

| Par texto / fondo | Ratio | AA normal (4.5) | AA grande (3.0) | Veredicto |
|---|---|---|---|---|
| `text.main #0f172a` / `bg.light #f8fafc` | **17.06:1** | ✅ | ✅ | Excelente (AAA) |
| `text.onPrimary #102218` / `primary #fbbf24` | **9.95:1** | ✅ | ✅ | Excelente — patrón correcto del botón ámbar |
| `onPrimary #102218` / `primary-hover #f59e0b` | **7.74:1** | ✅ | ✅ | Bien |
| `text.secondary #64748b` / `surface #ffffff` | **4.76:1** | ✅ (justo) | ✅ | Pasa, pero sin margen |
| `text.secondary #64748b` / `bg.light #f8fafc` | **4.55:1** | ✅ (al límite) | ✅ | Pasa por los pelos |
| `white` / `surface.dark #1c2e24` | **14.33:1** | ✅ | ✅ | Excelente (dark) |
| `white` / `error #ef4444` | **3.76:1** | ❌ | ✅ | **Falla** texto normal; solo sirve en grande/bold |
| `white` / `info #3b82f6` | **3.68:1** | ❌ | ✅ | **Falla** texto normal |
| `white` / `success #10b981` | **2.54:1** | ❌ | ❌ | **FALLA** total |
| `white` / `warning #f59e0b` | **2.15:1** | ❌ | ❌ | **FALLA** total |
| `white` / `primary #fbbf24` | **1.67:1** | ❌ | ❌ | **FALLA** total (por eso el código usa texto oscuro) |
| `gray-300 #d1d5db` placeholder / `white` | 1.47:1 | — | — | Solo decorativo (ícono vacío) |

**Conclusión de contraste:** la pareja de marca (texto oscuro sobre ámbar) es excelente. Los **colores de estado solo son seguros con texto oscuro**; cualquier uso de texto blanco sobre success/warning/primary es ilegible. `AppToast.tsx` lo resuelve bien usando fondos `*-900/95` con texto `*-100` (alto contraste), pero botones y badges con `bg-emerald-400 text-white` sueltos fallan.

---

## 3. Tipografía

### 3.1 Familias y carga

| Familia | Token | Uso | Cómo se carga |
|---|---|---|---|
| **Plus Jakarta Sans** | `font-display` | Títulos **y cuerpo** (el `<body>` usa `font-display`) | Vía `@fontsource/plus-jakarta-sans` importado en `index.tsx:3-8` (pesos 300–800). **NO** por `<link>` de Google Fonts |
| **Noto Sans** | `font-body` | Declarado pero casi no se usa (el body quedó en display) | `<link>` Google Fonts en `index.html` (pesos 400;500;700) |
| **JetBrains Mono** | — | Monospace (código / tabulares) | `<link>` Google Fonts (400;500). No tiene token `font-mono` en la config |
| Material Symbols Outlined | — | Íconos | `<link>` Google Fonts, `FILL@0..1` |

**Hallazgo clave (corrección):** la fuente **Plus Jakarta Sans SÍ se carga**, pero por `@fontsource` (self-hosted vía bundle), no por `<link>`. El `index.css` la pone como `font-family` del `html,body` (`index.css`), y la config la mapea a `font-display`. Es coherente, aunque **mezcla dos mecanismos de carga de fuentes** (Google Fonts `<link>` para Noto/JetBrains/Material + `@fontsource` para Plus Jakarta), lo que es frágil.

> **Riesgo de pesos:** la config declara `font-display` con Plus Jakarta y el código usa `font-extrabold` (800, 43 veces) y `font-black` (900, **407 veces**). `@fontsource` carga hasta 800; **el peso 900 (`font-black`) no se importa** → el navegador lo *simula* (fake bold), lo que degrada la nitidez. Noto Sans solo carga 400/500/700, así que si algún texto cae en Noto con 800/900 también se simula.

### 3.2 Escala de tamaños (config inline)

| Token | rem | px | line-height | Uso típico |
|---|---|---|---|---|
| `text-2xs` | 0.625 | 10 | 12px | Badges "PRO", labels diminutos (`MobileNavBar.tsx:81`) |
| `text-caption` | 0.75 | 12 | 16px | Descripciones secundarias |
| `text-sm` | 0.875 | 14 | 20px | Cuerpo por defecto, botones |
| `text-base` | 1.0 | 16 | 24px | Cuerpo/inputs |
| `text-lg` | 1.125 | 18 | 28px | Subtítulos |
| `text-xl` | 1.25 | 20 | 28px | Títulos de sección |
| `text-2xl` | 1.5 | 24 | 32px | Encabezados de pantalla |

**No hay** tokens `display`, `h1`–`h6`, `overline`, `label`, ni escala por encima de 24px: los títulos grandes usan arbitrarios (`text-5xl`, `text-3xl` en `screens/SubscriptionPlansScreen.tsx:614`) o tamaños pixel sueltos. Hay **muchísimos tamaños arbitrarios** `text-[11px]`, `text-[13px]`, `text-[14px]`, `text-[21px]`, `text-[10px]` (ej. `EmployeesScreen.tsx:902`, `MobileNavBar.tsx:70,81`) — rompen la escala.

### 3.3 Pesos, line-height, letter-spacing, transformaciones

- **Pesos usados (7):** `font-normal` (15), `font-medium` (526), `font-semibold` (608), `font-bold` (**1496**), `font-extrabold` (43), `font-black` (407). Tipografía muy "gorda" en general.
- **letter-spacing:** `tracking-tight` (muy común), `tracking-widest`/`tracking-[0.14em]` en overlines (ej. `components/EvidenceUploader.tsx:134`, `screens/TablesScreen.tsx:259`).
- **transformaciones:** `uppercase` en labels de sección y badges.
- **line-height:** mezcla de `leading-tight`, `leading-snug`, `leading-none` + los definidos por `fontSize`.

### 3.4 Enlaces, listas, citas, truncado

- **Enlaces:** no hay estilo de `<a>` tokenizado; se simulan con botones + `underline decoration-[#102218]/40` (`OfflineIndicator.tsx:107`).
- **Truncado:** `truncate` y `line-clamp-2` muy usados (ej. `ProductCard.tsx:62`, `Sidebar.tsx`).
- **Markdown:** `react-markdown` se renderiza en el chat RAG (`components/rag/ChatMessage.tsx`). Plugin `typography` de Tailwind está cargado (clases `prose`), uso puntual.
- **Citas/listas:** sin estilos propios tokenizados.

---

## 4. Espaciado y layout

### 4.1 Escala de espaciado
Se usa la **escala por defecto de Tailwind** (`p-1`…`p-6`, `gap-2`, `gap-3`, etc.) — no hay escala custom de spacing. Valores más repetidos: `gap-2`, `gap-3`, `px-3`, `px-4`, `py-2`, `py-3`, `p-4`. Aparecen **espaciados arbitrarios** sueltos: `p-[11px]`, `p-[13px]`, `size-[25px]`, `w-[29px]`, `min-w-[20px]` (todos en `components/ProductCard.tsx:36-166`), que rompen la escala de 4px.

### 4.2 Grid, contenedores, anchos
- No hay sistema de grid/columnas global; cada pantalla arma su layout con flex/grid Tailwind.
- Anchos fijos recurrentes: sidebar `w-64` (expandido) / `w-16` (colapsado) — `components/Sidebar.tsx` (`<aside>`); drawer móvil `w-80`; paneles laterales `w-[420px]` (pago/éxito) — `App.tsx:3803`; toast desktop `w-[360px]` — `AppToast.tsx:106`; modales `max-w-md` / `max-w-[420px]`.

### 4.3 Breakpoints (config inline)

| Nombre | Valor | Uso |
|---|---|---|
| `xs` | 400px | Ajustes finos de nav/texto (`MobileNavBar.tsx:76` usa además `min-[380px]:`) |
| `sm` | 640px | Tablet pequeña |
| `md` | 768px | **Frontera móvil/desktop** (sidebar aparece, MobileNavBar desaparece) |
| `lg` | 1024px | Desktop pleno (overlays de pago cambian a panel lateral) |
| `xl` | 1280px | — |
| `2xl` | 1536px | — |

Además hay breakpoints **arbitrarios** fuera de la escala: `min-[380px]:`, `min-[431px]:` (`Sidebar.tsx`), lo que fragmenta la responsividad.

### 4.4 Estructura de página
- **Desktop:** `Sidebar` fijo a la izquierda (`z-[60]`) + área de contenido. Botón flotante para reabrir el sidebar (`App.tsx:3405`).
- **Móvil:** `MobileNavBar` inferior flotante (`z-50`) + drawer lateral (`Sidebar` como overlay, `z-[60]`) + header móvil (`pt-mobile-header` = 56px).
- **Footer:** no hay footer de app global; los PDF/recibos tienen el suyo.
- **Paneles laterales (sheets):** pago, éxito, caja y ajustes entran como paneles deslizantes a la derecha.

---

## 5. Bordes, formas y profundidad

### 5.1 Bordes
- Colores de borde: `border-gray-100/200/700/800`, `border-border-light`/`border-border-dark` (tokens que **no existen** en la config — ver inconsistencias), `border-slate-200`, `border-amber-500`. Grosores: `border` (1px), `border-2`, `border-[1.5px]` (`DocumentCropper.tsx:234`), `border-l-4` (acentos de toast).

### 5.2 Border-radius (conteo real)

| Clase | Frecuencia | px (config) |
|---|---|---|
| `rounded-xl` | 816 | 0.75rem = 12px |
| `rounded-full` | 700 | 9999px |
| `rounded-lg` | 653 | 0.5rem = 8px |
| `rounded-2xl` | 385 | 1rem = 16px |
| `rounded-md` | 72 | (default Tailwind 6px) |
| `rounded-3xl` | 36 | (24px) |
| `rounded` (DEFAULT) | — | 0.25rem = 4px |

**Radios arbitrarios** (rompen la escala): `rounded-[20px]` (×4), `rounded-[14px]` (×3), `rounded-[8px]` (×3), `rounded-[12px]`, `rounded-[21px]`, `rounded-[15px]`, `rounded-[6px]` (todos en `ProductCard.tsx`), `rounded-[10px]`/`16px` inline en `ConfirmDialog.tsx:54,96`.

### 5.3 Sombras / elevación (conteo real)

| Clase | Frecuencia | Nota |
|---|---|---|
| `shadow-sm` | 405 | Elevación base de facto |
| `shadow-2xl` | 147 | Modales/overlays |
| `shadow-lg` | 114 | Cards/botones primarios |
| `shadow-md` | 80 | Hover |
| `shadow-xl` | 75 | — |
| `shadow-primary` | 58 | Glow ámbar (`shadow-lg shadow-primary/20` en AppButton) |
| `shadow-card` / `shadow-card-hover` | **6** | **Tokens custom casi muertos** |
| sombras inline | varias | `shadow-[0_10px_30px_...]` (MobileNavBar), `boxShadow` inline en Toast/ConfirmDialog |

→ Los dos tokens de sombra diseñados a propósito (`card`, `card-hover`) prácticamente no se usan; todos recurren a las sombras genéricas de Tailwind. La escala de elevación es **implícita y caótica**.

### 5.4 Divisores, outlines, focus ring
- **Divisores:** `border-t`/`border-b` + `divide-*` sueltos; también `<div className="h-px bg-gray-100">` como separador manual (`Sidebar.tsx`).
- **Outlines/focus ring:** inputs con `outline:none !important` global (`index.css`); foco por `focus:ring-*` (ej. `focus:ring-emerald-500`). Patrón `:focus-visible` conservado en CSS global para teclado.

### 5.5 Opacidad y efectos
- Opacidades sueltas: `/20`, `/30`, `/40`, `/50`, `/60`, `/70`, `/80`, `/90`, `/95`.
- Blur: `backdrop-blur-sm`, `backdrop-blur-xl` (MobileNavBar), `backdrop-blur-[3px]`, `backdrop-filter: blur(2px)` inline (`App.tsx:3824`), `blur-3xl` (glows decorativos en SubscriptionPlans).

### 5.6 Z-index (capas, caótico)

| Valor | Dónde |
|---|---|
| `z-10`, `z-20`, `z-30`, `z-40` | contenido, headers sticky, menús |
| `z-50` | MobileNavBar, overlays de pago/éxito (`App.tsx:3801`) |
| `z-[55]` | backdrop tablet del sidebar (`Sidebar.tsx`) |
| `z-[60]` | Sidebar, drawer, OfflineIndicator |
| `z-[100]` | splash loader (`App.tsx:4028`) |
| `9999` (inline) | `Toast.tsx:27` |
| `z-[99999]` | `AppToast.tsx:88,105`, `ConfirmDialog.tsx:38` |

→ **Siete+ niveles sin convención**, con dos sistemas de notificación compitiendo en `99999`. No hay escala de z-index tokenizada.

---

## 6. Movimiento

### 6.1 Animaciones definidas
- **Config inline (`index.html`):** `slideInRight` (0.4s cubic-bezier), `fadeIn` (0.2s ease-out), `slideUp` (0.3s), `slideInUpSubtle` (0.4s cubic-bezier).
- **`index.css` (keyframes CSS):** `slideInLeft`, `fadeIn`, `slideDown`, `slideInRight` (¡**duplicado** con otra duración: 0.25s vs 0.4s de la config!), `slideInUp`, `slideInUpSubtle` (también duplicado, 0.4s pero con 15px vs 10px de la config), `modalIn`, `barRise`, `cardEntry`, `donutDraw`, `shimmer` (skeleton), y 4 del recorte de documentos (`cropperBackdropFade`, `cropperFocusZoom`, `cropperHeaderSlide`, `cropperDockSlide`).
- **Inline (CSS-in-JS):** `confirmFadeIn`/`confirmScaleIn`/`confirmSpin` (`ConfirmDialog.tsx`), `fadeInUp` (`Toast.tsx`), `toastSlideIn`/`toastDown` (`AppToast.tsx`).

**Easings:** se repite `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out expresivo) como estándar de facto, pero conviven `ease-out`, `ease-in-out`, `linear`, `cubic-bezier(0.32,0.72,0,1)` (Sidebar touch).

### 6.2 Loaders
- **Spinner de pantalla:** `ScreenLoader.tsx` (anillo doble con `animate-spin` ámbar). También `AppLoader.tsx`.
- **Spinner en botón:** SVG `animate-spin` dentro de `AppButton` y de `ConfirmDialog`.
- **Skeleton:** `.skeleton-shimmer` (shimmer gradiente) — usado p.ej. en el skeleton del Sidebar.
- **Progress:** ícono `progress_activity` giratorio (Material Symbols) en varios botones.

### 6.3 Microinteracciones
- `active:scale-*` en botones (tres escalas distintas, ver 2.5), `hover:scale-105`/`110` en íconos/imágenes, `transition-all`/`transition-colors`/`transition-transform` por doquier, `group-hover:*`.
- "Fly to cart" (animación de producto volando al carrito): `components/FlyToCartLayer.tsx`.

### 6.4 `prefers-reduced-motion`
**NO existe soporte.** La búsqueda solo encontró la cadena en un checklist de diseño (`design_output.txt`), no en `index.css` ni en los componentes. Con ~25 animaciones activas, esto es un **fallo de accesibilidad** para usuarios con sensibilidad al movimiento.

---

## 7. Iconografía e imágenes

- **Librería de íconos:** Material Symbols Outlined (Google Fonts), **1526 usos**. Estilo *outline* por defecto; relleno puntual con `style={{ fontVariationSettings: "'FILL' 1" }}` (ej. `OfflineIndicator.tsx:34`, `EvidenceUploader.tsx:134`). Tamaños muy variados por `text-[Npx]`: 11, 13, 14, 16, 18, 20, 21, 22, 24, 32, 40px — **sin escala de íconos tokenizada**.
- **Logo / favicons:** PNGs en `/public` referenciados en `index.html` (`192px_fondoBlanco.png`, `512px_transparente.png`, `180px_fondoBlanco.png`). Variantes: fondo blanco vs transparente. `theme-color #ffffff`.
- **Avatares:** iniciales sobre `bg-primary` cuando no hay foto; foto como `background-image` en un `div` redondo (`Sidebar.tsx`). No hay componente `Avatar` ni `AvatarGroup` reutilizable salvo `PresenceStack`/`PresenceList` en actividad.
- **Imágenes de producto:** `ProductCard` usa `object-cover` (móvil) vs `object-contain` (desktop) — **inconsistente**; placeholder = ícono `restaurant` gris sobre `bg-gray-100`. `loading="lazy"`, `crossOrigin="anonymous"`. Aspect ratio: `aspect-square` (desktop) vs alto fijo `h-[105px]` (móvil).
- **Tratamiento:** overlay de precio `bg-black/80 backdrop-blur-md` sobre la imagen (desktop) — `ProductCard.tsx:131`.
- **Cropper/cámara:** `ImageCropper`, `DocumentCropper`, `InAppCamera` para captura de fotos/facturas.

---

## 8. Inventario de componentes

> **Qué es "reutilizable" vs "duplicado":** reutilizable = un solo archivo que varias pantallas importan. Duplicado = el mismo patrón visual re-escrito a mano en cada sitio (ej. los botones ámbar que repiten `bg-primary ... text-[#102218]` en vez de usar `AppButton`).

### 8.1 Acciones

**`AppButton`** — `components/ui/AppButton.tsx`
Botón base del sistema (el único componente de botón "oficial").
- **Variantes:** `primary` (ámbar + texto `onPrimary` + glow), `secondary` (gris), `danger` (rojo), `outline`, `ghost`.
- **Tamaños:** NO tiene prop de tamaño (sm/md/lg) — el tamaño se improvisa por `className`. **Falta escala de tamaños.**
- **Estados:** default, hover (por variante), active (`active:scale-[0.98]`), disabled (`opacity-70`), loading (spinner SVG). No tiene estado `focus` visible propio (`focus:outline-none`).
- **Reutilizable** pero **poco adoptado**: la mayoría de pantallas escribe botones ámbar a mano (ej. `EmployeesScreen.tsx:799,889,1075` repiten `bg-primary hover:bg-primary-hover text-[#102218]`). → **Botón duplicado de facto decenas de veces.**

**Icon buttons (botones de ícono):** NO hay componente dedicado. Se arman inline con `<button><span class="material-symbols-outlined">...</span></button>` por todas partes (ej. `ProductCard.tsx:71,86`, `Sidebar.tsx` close). Patrón repetido sin tokenizar.

**`PrinterSplitButton`** — `components/PrinterSplitButton.tsx`
*Split button*: botón principal + flecha que abre opciones (imprimir / elegir impresora). Específico de impresión. Reutilizable.

- **Enlaces:** No existe componente `Link`. Se simulan con `underline` sobre botones. **No existe.**
- **FAB (floating action button):** El botón flotante para reabrir el sidebar (`App.tsx:3405`) es lo más parecido, pero no es un FAB genérico. **No existe como componente.**
- **Button group / Toggle group:** los *tabs* de `EmployeesScreen` (payroll/employees/roles, `EmployeesScreen.tsx:901-918`) y `GlobalSellTabs` cumplen esa función, pero no hay un `ButtonGroup`/`SegmentedControl` reutilizable. **No existe genérico.**
- **Switch / Toggle:** se dibujan a mano (checkboxes custom con `bg-primary border-primary` en `EmployeesScreen.tsx:1315`). **No existe componente `Switch`.**

### 8.2 Formularios

- **Text input / textarea / select:** NO hay componente `Input` tokenizado. Se usan `<input>`/`<textarea>`/`<select>` nativos con clases Tailwind repetidas pantalla por pantalla + el plugin `@tailwindcss/forms`. El foco se maneja global en `index.css` (ring, `outline:none !important`). **Alta duplicación.**
- **`PhoneInput`** — `components/PhoneInput.tsx`: input de teléfono (prefijo país Colombia). Reutilizable.
- **`Numpad`** — `components/Numpad.tsx`: teclado numérico tipo calculadora (bottom sheet con drag-to-close) para montos. Hardcodea `#102218` y usa paleta `zinc` en dark (≠ paleta Bistro verde). Botón submit `bg-primary`.
- **`InventoryNumpad`** — `components/InventoryNumpad.tsx`: variante del numpad para conteo de inventario. **Duplica la lógica/estilo de `Numpad`.**
- **`PriceInputModal` / `QuantityInputModal`** — modales de entrada de precio/cantidad (envuelven numpad). Reutilizables.
- **File upload:** `EvidenceUploader` (subir evidencias), captura por cámara (`InAppCamera`). No hay un `FileUpload` genérico de dropzone.
- **Checkbox / radio:** dibujados a mano (cuadros con ícono `check`), no componente.
- **Combobox / autocomplete:** `SupplierPicker`, `CategorySelector` cumplen funciones de selección con búsqueda, pero cada uno es ad-hoc.
- **Slider:** **No existe.**
- **Date picker:** `components/dashboard/CustomDateRangePicker.tsx` (rango de fechas del dashboard). Específico, no genérico.
- **OTP:** el flujo SMS OTP existe en `LoginScreen`/`RegisterScreen` pero **no hay componente `OTPInput` dedicado** (inputs sueltos). → normalmente haría falta uno.
- **Búsqueda:** inputs de búsqueda inline (ej. menú POS con `focus-menu-search`). No componente `SearchInput`.
- **Labels / help text / error messages:** sin componentes; textos sueltos. Validación manual por pantalla.

### 8.3 Navegación

- **`Sidebar`** — `components/Sidebar.tsx`: navegación principal desktop (fijo, colapsable `w-64`/`w-16`) + drawer móvil con gestos touch. Incluye secciones (Gestión/Equipo), submenús de ajustes, perfil. Muy grande (~900 líneas). Reutilizable (fuente única).
- **`MobileNavBar`** — `components/MobileNavBar.tsx`: *bottom navigation* flotante móvil (Inicio/Vender/Turno/Ayuda) con badge y punto de estado de turno. Activo = `bg-amber-400 text-slate-950`. Reutilizable.
- **`GlobalSellTabs`** — `components/GlobalSellTabs.tsx`: pestañas de venta (mesas / orden rápida / mesa activa).
- **Tabs:** no hay `Tabs` genérico; cada pantalla implementa sus pestañas (ver `EmployeesScreen`).
- **Dropdown / menú de perfil / ajustes:** dentro de `Sidebar` (menús desplegables ad-hoc). No `DropdownMenu` genérico.
- **Context menu:** `components/expense/ExpenseActionsMenu.tsx` (menú de acciones). Ad-hoc.
- **Breadcrumbs:** **No existe** (coherente con router casero, pero útil en pantallas profundas).
- **Paginación:** **No existe** componente; listas usan scroll infinito/virtual o cargan todo.
- **Stepper:** el flujo de escaneo de facturas (`components/invoiceScan/Scan*Step.tsx`, `ScanStepShell.tsx`) es un wizard por pasos, pero **no hay un `Stepper` visual reutilizable**.
- **Drawer:** el drawer del `Sidebar` móvil. No genérico.

### 8.4 Contenedores

- **`ProductCard`** — `components/ProductCard.tsx`: tarjeta de producto del POS, con variantes `mobile` y `desktop`. Imagen + nombre + precio + controles +/−. Hardcodea radios (`rounded-[12px]`, `rounded-[21px]`, `rounded-[15px]`, `rounded-[8px]`), colores (`#111814`, `#102218`), tamaños pixel. Memorizado (`React.memo`). Reutilizable pero muy "a mano".
- **`CustomPlanCard`** — `components/CustomPlanCard.tsx`: tarjeta de plan de suscripción personalizado (con selector de periodicidad).
- **Card genérica:** **No existe** un componente `Card` base; cada "card" es un `<div>` con `bg-white rounded-xl shadow-sm border` repetido (patrón visto en casi todas las pantallas).
- **Modal / Dialog:** NO hay un `Modal` base único. Hay un `ConfirmDialog` (confirmaciones, **100% CSS-in-JS** con paleta propia `#1f2937`/`#6b7280`/`#e5e7eb`, radios y animaciones propias — `ConfirmDialog.tsx`) y **~30 modales independientes** (`ProductModal`, `ProductEditModal`, `DiscountModal`, `ExpenseModal`, `CreateClientModal`, `EmployeeModal`, etc.), cada uno con su propio overlay (`bg-black/40|50|60`), radios y `z-index`. → **Fuerte duplicación de patrón modal.**
- **Accordion:** secciones colapsables del Sidebar (`isOperacionesOpen`, etc.) y de ajustes; no hay `Accordion` genérico.
- **Popover:** se simula con menús posicionados (Sidebar, SubscriptionPlans `z-10`). No genérico.
- **`InfoTooltip`** — `components/InfoTooltip.tsx`: tooltip de ayuda (botón "?" → burbuja oscura `bg-gray-900` con flecha, reposicionamiento según viewport). Reutilizable.
- **Sheet (bottom sheet):** `components/expense/CategoryPickerSheet.tsx`, `ObservationSheet.tsx`, `ScanProductPickerSheet.tsx`, y el patrón del `Numpad`. Varios, sin base común.
- **Divider:** `<div className="h-px bg-gray-100">` manual. No componente.
- **Banners:**
  - **`GracePeriodBanner`** — `components/GracePeriodBanner.tsx`: banner fijo superior (`z-[70]`) de suscripción en gracia; estados normal (ámbar) / urgente (rojo); mide su altura y la expone en `--grace-banner-h`. Modal de planes en `z-[80]`.
  - **`TablesReadOnlyBanner`**, **`InventoryCriticalAlert`** — banners/alertas contextuales. Cada uno con su propio color.

### 8.5 Feedback

- **Toast (DOS sistemas):**
  - **`AppToast`** — `components/AppToast.tsx`: sistema **actual/bueno** (ToastContext). Variantes success/error/warning/info con fondo `*-900/95` + borde izquierdo `*-400` + texto `*-100` (alto contraste), ícono, botón cerrar accesible, `role="alert"`. Responsive (top-center móvil / top-right desktop). `z-[99999]`.
  - **`Toast`** — `components/Toast.tsx`: sistema **legacy/duplicado**, 100% inline-style, fondo `rgba(30,30,30,0.95)`, `z-index: 9999`, keyframe propio `fadeInUp`. → **Duplicado a eliminar.**
- **Alert / banner de alerta:** `InventoryCriticalAlert`, `TablesReadOnlyBanner`, `GracePeriodBanner` (ver 8.4). No hay `Alert` genérico (success/warning/error/info) reutilizable.
- **Badge / chip / tag:** dibujados a mano. Badge de rol en `Sidebar.tsx` (`getRoleBadgeColor`: purple/blue/emerald/orange por rol), badge "PRO", badge de contador rojo en MobileNavBar. **No hay componente `Badge`/`Chip`.**
- **Progress bar:** barras de progreso ad-hoc (dashboard, aging de clientes). No componente genérico.
- **Spinner:** `ScreenLoader` (anillo doble ámbar), `AppLoader`, spinner SVG en `AppButton`/`ConfirmDialog`, splash en `App.tsx:4028` (fondo `#f6f8f7`). → Varios spinners distintos.
- **Skeleton:** `.skeleton-shimmer` (CSS global) usado inline (Sidebar). No componente `Skeleton` parametrizable.
- **Empty state:** se arman inline (ícono + texto) por pantalla. **No hay componente `EmptyState`.**
- **Error state / `ErrorBoundary`** — `components/ErrorBoundary.tsx`: captura errores de render. Reutilizable (envoltura).
- **404 / 500:** **No existen** páginas de error dedicadas (coherente con router casero, pero sin fallback de "ruta no encontrada" visible). `TrialExpiredScreen` y `CustomPlanBlockedScreen` cubren bloqueos de negocio, no errores HTTP.

### 8.6 Datos

- **Tabla:** no hay `Table` genérico; tablas HTML ad-hoc (Empleados, Suscripción historial). PDFs usan tablas de `@react-pdf` (fuera de alcance).
- **Lista / fila:** `CartItemRow` (ítem del carrito POS), `EventRow` (actividad), listas de clientes/deudas ad-hoc.
- **Grid de items:** grids de `ProductCard` en POS (`SellScreen`/`MenuScreen`).
- **Stat cards (tarjetas de estadística):** en `DashboardScreen` (KPIs). Ad-hoc, no componente reutilizable.
- **Charts:** `components/SalesChart.tsx` (gráfico de ventas) + visualizaciones del dashboard; animaciones `barRise`/`donutDraw`. 
- **Timeline:** **No existe** componente genérico (la actividad es lista, no timeline visual).
- **Avatar:** iniciales/foto a mano (Sidebar). **`PresenceStack` / `PresenceList`** (`components/activity/`) hacen *avatar group* de presencia. No hay `Avatar` base.

### 8.7 Contenido

- **Headings / párrafos:** sin componentes; `<h1..h3>`/`<p>` con clases Tailwind sueltas.
- **Code blocks / markdown:** `react-markdown` en `components/rag/ChatMessage.tsx` (respuestas del asistente IA). Plugin `prose` disponible.
- **Hero:** `LandingScreen` tendría un hero, pero **está desconectado** (ver sección final). En la app viva no hay hero.
- **Footer:** no hay footer de aplicación.
- **`RagSourceCard`** — tarjeta de fuente citada por el asistente IA.

### 8.8 Específicos del producto (POS)

| Componente | Archivo | Qué es |
|---|---|---|
| `CartItemRow` | `components/CartItemRow.tsx` | Fila de ítem en el carrito de venta |
| `PaymentSidebar` | `components/PaymentSidebar.tsx` | Panel lateral de cobro (métodos de pago) |
| `SuccessSidebar` | `components/SuccessSidebar.tsx` | Panel de venta exitosa |
| `OpenTicketsBar` | `components/OpenTicketsBar.tsx` | Barra de tickets/mesas abiertas |
| `ComandaLabelModal` / `ComandaTargetGrid` / `SendCommandaModal` | `components/` | Comandas de cocina / etiquetas |
| `BarcodeScanner` / `BarcodeInputModal` / `MobileScannerItemModal` | `components/` | Lector de códigos de barras (cámara/pistola USB) |
| `InAppCamera` / `DocumentCropper` / `ImageCropper` | `components/` | Captura y recorte de imágenes/facturas |
| `ReceiptHTML` / `ReceiptPreviewCard` / `ReceiptThermal` | `components/` | Previsualización de recibos (ESC/POS térmico) |
| `PrinterConnectionCard` / `PrinterSettingsPanel` / `PrinterSplitButton` | `components/` | Gestión de impresora QZ Tray |
| `RagChatWidget` / `SupportChatWidget` / `ChatMessage` | `components/rag/` | Asistente IA (RAG) y soporte Telegram |
| `OfflineIndicator` | `components/OfflineIndicator.tsx` | Barra de estado offline / sincronización |
| `FlyToCartLayer` | `components/FlyToCartLayer.tsx` | Animación de producto volando al carrito |
| `Scan*Step` (12+ archivos) | `components/invoiceScan/` | Wizard de escaneo de facturas con IA |
| `DashboardScreen` widgets | `screens/`, `components/dashboard/` | KPIs, gráficos, rangos de fecha |

---

## 9. Pantallas y flujos (solo las conectadas)

El "ruta" aquí es el valor del enum `Screen` (`types.ts:5-40`) que las monta en `App.tsx` vía `currentScreen === Screen.X &&`.

### 9.1 Pantallas montadas en el router casero

| Pantalla (archivo) | `Screen` | Montaje en App.tsx | Rol/uso |
|---|---|---|---|
| `LoginScreen` / `RegisterScreen` / `ForgotPasswordScreen` | LOGIN / REGISTER / FORGOT_PASSWORD | `App.tsx:3115-3118` | Autenticación (SMS OTP + Google OAuth) |
| `HomeScreen` | HOME | `App.tsx:3579` | Inicio móvil (hub) |
| `SellScreen` | SELL | `App.tsx:3466` | POS principal (se mantiene montado durante pago/éxito) |
| `MenuScreen` | MENU / QUICK_ORDER | `App.tsx:3698` | Catálogo/menú de venta |
| `PaymentScreen` | PAYMENT | `App.tsx:3740` | Cobro/checkout |
| `SuccessScreen` | SUCCESS | `App.tsx:3800` | Venta exitosa |
| `PhotoOrderScreen` | PHOTO_ORDER | `App.tsx:3656` | Venta por foto/escáner |
| `DashboardScreen` | DASHBOARD | `App.tsx:3435` | KPIs y gráficos |
| `SalesScreen` | SALES | `App.tsx:3582` | Historial de ventas |
| `ActivityScreen` | ACTIVITY | `App.tsx:3588` | Visor de eventos / presencia |
| `ClientsScreen` | CLIENTS | `App.tsx:3517` | Clientes / cuentas por cobrar |
| `DebtsScreen` | DEBTS | `App.tsx:3572` | Deudas del negocio |
| `EmployeesScreen` | EMPLOYEES | `App.tsx:3511` | Personal, roles, permisos, nómina |
| `ProductsScreen` | PRODUCTS | `App.tsx:3523` | Catálogo de productos |
| `InventoryScreen` | INVENTORY | `App.tsx:3535` | Inventario (gated por plan `canUsePhysicalInventory`) |
| `SimpleProductScreen` | CREATE_PRODUCT_SIMPLE | `App.tsx:3596` | Crear producto simple |
| `ProcessedProductScreen` | CREATE_PRODUCT_PROCESSED | `App.tsx:3602` | Crear producto procesado |
| `ServiceProductScreen` | CREATE_PRODUCT_SERVICE | `App.tsx:3608` | Crear producto/servicio |
| `CreatePromotionScreen` | CREATE_PROMOTION | `App.tsx:3614` | Crear promoción |
| `EditPromotionScreen` | EDIT_PROMOTION | `App.tsx:3620` | Editar promoción |
| `InvoiceCreateScreen` | CREATE_FROM_INVOICE | `App.tsx:3632` | Crear productos desde factura |
| `ProfileScreen` | PROFILE | `App.tsx:3638` | Perfil de usuario |
| `SubscriptionPlansScreen` | SUBSCRIPTION_PLANS | `App.tsx:3644` | Planes (acceso restringido, ver nota) |
| `SubscriptionManagementScreen` | SUBSCRIPTION_MANAGEMENT | `App.tsx:3650` | Gestión de suscripción |
| `TrainingScreen` | TRAINING | `App.tsx:3684` | Capacitación (nota: entrada de menú desactivada, ver abajo) |
| `RagChatScreen` | RAG_CHAT | `App.tsx:3690` | Asistente IA |
| `ContingencyDocScreen` | CONTINGENCY_DOC | `App.tsx:3678` | Documentos contables (nota: entrada de menú oculta) |
| `CashRegisterScreen` | CASH_REGISTER | `App.tsx:3837` | **Panel lateral** (no pantalla completa) de apertura/cierre de turno |

### 9.2 Pantallas montadas como "guardas" o rutas públicas (fuera del router por estado)

| Pantalla | Dónde | Cuándo se ve |
|---|---|---|
| `CustomPlanBlockedScreen` | `App.tsx:3196` | Suscripción vencida + plan personalizado (admin) |
| `TrialExpiredScreen` | import `App.tsx:89` | Fin de prueba (fallback de bloqueo) |
| `PublicReceiptScreen` | `App.tsx:4046,4053` | URL pública `/t/...` (recibo compartido) |
| `PublicClientHistoryScreen` | `App.tsx:4058,4065` | URL pública `/ch/...` (historial cliente) |

### 9.3 Estados especiales por pantalla
- **Cargando:** `Suspense` + `ScreenLoader`/`LoadingFallback` en casi todas las pantallas lazy. Skeletons en Sidebar/listas.
- **Vacía:** empty states inline (no estandarizados).
- **Error:** `ErrorBoundary` global.
- **Sin permisos:** `usePermissions` + `ProtectedRoute` (`components/ProtectedRoute.tsx`) ocultan pantallas; Inventario muestra badge "PRO" + `UpgradeProModal` si falta plan.
- **Sin conexión (offline):** `OfflineIndicator` (barra superior móvil) + modo offline con cola de sync (Event Sourcing).

### 9.4 Flujos clave
- **Login/registro:** LOGIN → (OTP SMS / Google) → SELL o SUBSCRIPTION_PLANS (si recién registrado).
- **Venta/checkout:** SELL/MENU → carrito → PAYMENT (métodos de pago) → SUCCESS (recibo/impresión). `SellScreen` se mantiene montado detrás para evitar recarga de imágenes.
- **Caja:** `CASH_REGISTER` abre un panel lateral (no navegación) para abrir/cerrar turno; obligatorio tener turno abierto para vender.
- **Onboarding:** post-registro redirige a planes (`just_registered`); no hay tour guiado estándar visible (hay `TutorialDevManager` solo-dev).
- **Configuración:** paneles dentro del Sidebar (`SettingsSidebarPanel`, `PrinterSettingsPanel`, `SalesModeSettingsPanel`).

---

## 10. Accesibilidad y UX

- **Contraste:** ver sección 2.6. Marca OK; colores de estado solo seguros con texto oscuro; `text.secondary` pasa AA al límite.
- **Tamaño mínimo de toque (44px):** **inconsistente.** Varios controles quedan por debajo: botones +/− de `ProductCard` son `size-[25px]` (25px) y `w-[29px] h-[29px]` (29px) — por debajo del mínimo recomendado de 44px (`ProductCard.tsx:71,86,142,160`). El `?` de `InfoTooltip` es `size-4` (16px). Los botones del `Numpad` sí cumplen (`h-14` = 56px) y la `MobileNavBar` también.
- **Foco visible:** `index.css` fuerza `outline: none !important` en **inputs** (todos los estados), compensado con `focus:ring-*` + `:focus-visible` conservado para teclado. En **botones** se usa `focus:outline-none` casi universal; el foco de teclado depende de rings puntuales → **riesgo de foco invisible en botones sin ring**.
- **Navegación por teclado:** `ConfirmDialog`/`Numpad` manejan `Escape`/`Enter`; `Sidebar` cierra menús por click-outside. Elementos clickables no nativos a veces tienen `tabIndex`/`onKeyDown` (bien en `AppToast`, `InfoTooltip`), pero muchos `<div onClick>` carecen de equivalente de teclado.
- **ARIA:** uso correcto en `AppToast` (`role="alert"`, `aria-live`), `ConfirmDialog` (`role="dialog"`, `aria-modal`, `aria-labelledby`), `GracePeriodBanner` (`role="alert"`), `OfflineIndicator` (`role="status"`), botones con `aria-label`. Cobertura razonable pero no uniforme.
- **Alt en imágenes:** `ProductCard` usa `alt={product.name}` ✅. Íconos Material tienen `aria-hidden`/`aria-label` según caso.
- **Jerarquía de encabezados:** no estandarizada (uso libre de `<h2>/<h3>` + tamaños pixel), riesgo de saltos de nivel.
- **Tono de voz / textos:** español, cercano y claro ("¿Qué puedes hacer?", "Primero abre un turno de caja"). Botones cortos ("Pagar", "Renovar ahora", "Aplicar"). Mensajes de error por toast, descriptivos. Emojis en algunos títulos (`🎉`, `⚠️`) — informal, coherente con el público.
- **`prefers-reduced-motion`:** ausente (ver 6.4) → **fallo de accesibilidad.**

---

## 11. Inconsistencias y deuda visual (priorizada)

### 🔴 Impacto ALTO
1. **`#102218` hardcodeado 191 veces** en vez de `text-text-onPrimary` / token de marca. Un cambio de marca es inviable sin reemplazo masivo. *(evidencia: conteo sección 2.2)*
2. **≥8 superficies oscuras casi iguales** (`#151e32`, `#0B1120`, `#0d1c14`, `#1A2638`, `#0c1912`, `#0c0f16`, `#1d3a2a`…) sin criterio. El modo oscuro se ve distinto según la pantalla. *(2.3)*
3. **Dos sistemas de Toast** (`AppToast` Tailwind vs `Toast` CSS-in-JS) compitiendo en `z-index` ~9999/99999. *(8.5)*
4. **`ConfirmDialog` 100% CSS-in-JS con paleta propia** (`#1f2937`, `#6b7280`, `#e5e7eb`, `#f9fafb`) y animaciones propias → no respeta ningún token. *(8.4, ConfirmDialog.tsx)*
5. **Colores de estado fallan contraste** con texto blanco (success 2.54:1, warning 2.15:1, primary 1.67:1). *(2.6)*
6. **Botón ámbar duplicado a mano** en decenas de pantallas en vez de usar `AppButton`. *(8.1)*

### 🟡 Impacto MEDIO
7. **Z-index sin escala** (7+ niveles arbitrarios: 10/20/30/40/50/55/60/70/80/100/9999/99999). *(5.6)*
8. **Radios arbitrarios** fuera de la escala (`rounded-[8px|12px|14px|15px|20px|21px]`) conviviendo con `rounded-lg/xl/2xl`. *(5.2)*
9. **Tokens de sombra muertos** (`shadow-card`/`card-hover` solo 6 usos vs 405 `shadow-sm`); elevación improvisada. *(5.3)*
10. **5 off-whites casi iguales** (`#f8fafc`, `#f6f8f7`, `#f0f4f3`, `#f8fafb`, `#f8faf9`) + el `<body style="background-color:#f6f8f7">` suelto. *(2.3, index.html)*
11. **Verdes de éxito múltiples** (`#009459`, `#16a34a`, `#007a49`, `#10b981`). *(2.3)*
12. **Tokens de borde inexistentes usados** (`border-border-light`/`border-border-dark`, `text-primary-text`): se referencian clases que **no están definidas** en la config → caen en nada o en el color por defecto. *(AppButton.tsx:27, Sidebar.tsx varios)*
13. **Animaciones duplicadas** entre `index.html` config y `index.css` (`slideInRight`, `slideInUpSubtle`) con duraciones/valores distintos. *(6.1)*
14. **Opacidad de disabled y escala de active inconsistentes** (opacity 30/50/70; scale .90/.95/.97/.98). *(2.5)*
15. **Tamaños de texto/ícono pixel sueltos** (`text-[11px]`, `text-[13px]`, íconos 11–40px) rompen la escala tipográfica. *(3.2, 7)*

### 🟢 Impacto BAJO
16. **Dos mecanismos de carga de fuentes** (`<link>` Google Fonts + `@fontsource`). *(3.1)*
17. **`font-black` (900) usado 407 veces sin cargar el peso 900** → fake-bold. *(3.1)*
18. **Alias legacy duplicados** en la config de colores (nombres planos + anidados). *(1, index.html)*
19. **`object-cover` vs `object-contain`** en imágenes de producto según variante. *(7)*
20. **Breakpoints arbitrarios** `min-[380px]`, `min-[431px]` fuera de la escala. *(4.3)*

---

## Pantallas / componentes desconectados u ocultos (excluidos del inventario principal)

| Elemento | Archivo | Por qué se excluye |
|---|---|---|
| `LandingScreen` | `screens/LandingScreen.tsx` | **Código muerto:** se hace `React.lazy` (`App.tsx:18`) pero **nunca se renderiza** (`<LandingScreen` no aparece en ningún JSX). |
| `BulkUploadScreen` (importación Excel) | `screens/BulkUploadScreen.tsx` | **Oculta temporalmente** según doc de producto. Montaje condicional existe (`App.tsx:3626`) pero sin entrada de menú viva. |
| `ContingencyDocScreen` | `screens/ContingencyDocScreen.tsx` | Montada (CONTINGENCY_DOC) pero su **entrada de menú está detrás de `{false && ...}`** (`Sidebar.tsx`), por lo que es inalcanzable por UI normal. |
| Opción "Capacitación" (`TrainingScreen`) | `Sidebar.tsx` | La pantalla se monta (TRAINING) pero el ítem de menú tiene `access: false` (`Sidebar.tsx`), inalcanzable por navegación estándar. **SUPOSICIÓN:** en desarrollo. |
| `Screen.TABLES` standalone | `App.tsx:3442` | **DEPRECATED**: redirige a `Screen.SELL` (comentario explícito). No es una pantalla con UI propia viva. |
| `Screen.MENU` standalone | `App.tsx:1425` | Redirige a `SELL` en móvil para preservar header. |
| PDFs de impresión (`ReceiptPDF`, `ReceiptThermalPDF`, `DashboardPDFReport`, `EmployeeReportPDF`, `TransactionHistoryPDF`, `ShiftReportThermalPDF`, `PayrollReceiptPDF`, `TopProductsPDF`) | `components/*PDF.tsx` | Usan `@react-pdf` (fuera de alcance: son documentos, no UI de pantalla). Se mencionan por completitud. |
| `TutorialDevManager`, `DeveloperAvailabilityPanel` | `components/` | Herramientas solo-dev (gated por `VITE_DEVELOPER_EMAIL`). |
| `/mockups`, `/rediseño home`, `/rediseño pos` | carpetas raíz | **SUPOSICIÓN:** bocetos/propuestas previas de rediseño, no frontend vivo. No auditados. |
| Modo oscuro (`dark:*`) | global | **SUPOSICIÓN:** latente — soportado en estilos pero sin toggle que aplique la clase `.dark` encontrado. Documentado como existente pero posiblemente inactivo en producción. |

---

# FASE 2 — PROPUESTA DE TOKENS

> **Criterio:** la mayoría de tokens **mantienen** la identidad actual (ámbar Warm Bistro + verde oscuro). Las **mejoras** se marcan con 🟢 y una razón. Nada rompe la marca; se consolida lo disperso.

## Niveles del sistema

1. **Primitivos** — valores crudos con nombre neutro (`color.amber.400 = #fbbf24`). No se usan directo en componentes.
2. **Semánticos (alias)** — por intención (`color.action.primary`, `color.text.muted`). Es lo que usan las pantallas.
3. **De componente** — ajustes finos (`button.primary.bg`, `card.radius`). Solo cuando un componente necesita desviarse.

### Decisiones de consolidación (resumen)
- **Superficies oscuras:** se reducen a 3 (`bg.dark`, `surface.dark`, `surface.dark.elevated`) a partir de los oficiales `#102218`/`#1c2e24`. Todas las variantes inventadas (`#151e32`, `#0B1120`, etc.) migran a estas. 🟢 *coherencia del modo oscuro.*
- **Off-whites:** uno solo (`#f8fafc`). El `#f6f8f7` del `<body>` y los `#f0f4f3/#f8fafb/#f8faf9` se unifican. 🟢
- **Verdes de éxito:** uno solo (`#10b981`), salvo el verde de marca WhatsApp que queda como primitivo aparte (`#25d366`). 🟢
- **Estados con contraste seguro:** se añade `*.contrast` oscuro para texto sobre colores de estado. 🟢 *arregla el fallo WCAG.*
- **Elevación:** 4 niveles de sombra tokenizados (reviven `card`/`card-hover` + modal). 🟢
- **Z-index:** escala de 7 pasos nombrada. 🟢

---

## 2. Tablas de tokens (resumen)

### Color — semánticos (lo que usarán las pantallas)

| Token | Valor | Mantiene / Mejora |
|---|---|---|
| `color.bg.canvas` | `#f8fafc` | Mantiene (unifica off-whites) 🟢 |
| `color.bg.surface` | `#ffffff` | Mantiene |
| `color.bg.surface.sunken` | `#f1f5f9` | 🟢 nuevo (fondos hundidos) |
| `color.text.default` | `#0f172a` | Mantiene |
| `color.text.muted` | `#64748b` | Mantiene |
| `color.text.disabled` | `#94a3b8` | 🟢 define el deshabilitado (hoy improvisado) |
| `color.text.inverse` | `#ffffff` | Mantiene |
| `color.text.onPrimary` | `#102218` | Mantiene (reemplaza los 191 hardcodes) |
| `color.border.default` | `#e2e8f0` | Mantiene (slate-200) |
| `color.action.primary` | `#fbbf24` | Mantiene |
| `color.action.primary.hover` | `#f59e0b` | Mantiene |
| `color.action.primary.active` | `#d97706` | Mantiene |
| `color.feedback.success` | `#10b981` | Mantiene (unifica verdes) 🟢 |
| `color.feedback.warning` | `#f59e0b` | Mantiene |
| `color.feedback.error` | `#ef4444` | Mantiene |
| `color.feedback.info` | `#3b82f6` | Mantiene |
| `color.feedback.*.contrast` | `#0f172a` (sobre success/warning), `#ffffff` (sobre error/info en texto grande) | 🟢 arregla contraste |

### Radios

| Token | Valor | Mantiene/Mejora |
|---|---|---|
| `radius.sm` | 6px | Mantiene |
| `radius.md` | 8px (`lg` actual) | Mantiene |
| `radius.lg` | 12px (`xl` actual) | Mantiene (absorbe `rounded-[12px]`) 🟢 |
| `radius.xl` | 16px (`2xl` actual) | Mantiene (absorbe `rounded-[14px/15px]`) 🟢 |
| `radius.2xl` | 20px | 🟢 (absorbe `rounded-[20px/21px]`) |
| `radius.full` | 9999px | Mantiene |

### Sombras / elevación

| Token | Valor | Mantiene/Mejora |
|---|---|---|
| `shadow.sm` | `0 1px 2px rgba(0,0,0,0.05)` | Mantiene (base de facto) |
| `shadow.card` | `0 2px 8px -2px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.02)` | Mantiene (revive token) 🟢 |
| `shadow.card.hover` | `0 8px 16px -4px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.04)` | Mantiene 🟢 |
| `shadow.modal` | `0 20px 60px rgba(0,0,0,0.3)` | 🟢 (toma el de ConfirmDialog) |

### Z-index

| Token | Valor | Uso |
|---|---|---|
| `z.base` | 0 | contenido |
| `z.sticky` | 20 | headers sticky |
| `z.dropdown` | 30 | menús |
| `z.drawer` | 60 | sidebar/drawer |
| `z.banner` | 70 | GracePeriodBanner |
| `z.modal` | 80 | modales/dialogs |
| `z.toast` | 90 | notificaciones |
| `z.splash` | 100 | loader inicial |

🟢 reemplaza los `9999`/`99999` por `z.toast`.

---

## 5. Tokens en JSON (formato W3C Design Tokens)

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "amber":  { "50": { "$value": "#fffbeb", "$type": "color" }, "400": { "$value": "#fbbf24", "$type": "color" }, "500": { "$value": "#f59e0b", "$type": "color" }, "600": { "$value": "#d97706", "$type": "color" }, "900": { "$value": "#78350f", "$type": "color" } },
    "slate":  { "50": { "$value": "#f8fafc", "$type": "color" }, "100": { "$value": "#f1f5f9", "$type": "color" }, "200": { "$value": "#e2e8f0", "$type": "color" }, "400": { "$value": "#94a3b8", "$type": "color" }, "500": { "$value": "#64748b", "$type": "color" }, "900": { "$value": "#0f172a", "$type": "color" } },
    "green":  { "900": { "$value": "#1c2e24", "$type": "color" }, "950": { "$value": "#102218", "$type": "color" } },
    "emerald":{ "500": { "$value": "#10b981", "$type": "color" } },
    "red":    { "500": { "$value": "#ef4444", "$type": "color" }, "600": { "$value": "#dc2626", "$type": "color" } },
    "blue":   { "500": { "$value": "#3b82f6", "$type": "color" } },
    "white":  { "$value": "#ffffff", "$type": "color" },

    "bg":     { "canvas": { "$value": "{color.slate.50}", "$type": "color" }, "surface": { "$value": "{color.white}", "$type": "color" }, "sunken": { "$value": "{color.slate.100}", "$type": "color" }, "dark": { "$value": "{color.green.950}", "$type": "color" }, "surfaceDark": { "$value": "{color.green.900}", "$type": "color" } },
    "text":   { "default": { "$value": "{color.slate.900}", "$type": "color" }, "muted": { "$value": "{color.slate.500}", "$type": "color" }, "disabled": { "$value": "{color.slate.400}", "$type": "color" }, "inverse": { "$value": "{color.white}", "$type": "color" }, "onPrimary": { "$value": "{color.green.950}", "$type": "color" } },
    "border": { "default": { "$value": "{color.slate.200}", "$type": "color" } },
    "action": { "primary": { "$value": "{color.amber.400}", "$type": "color" }, "primaryHover": { "$value": "{color.amber.500}", "$type": "color" }, "primaryActive": { "$value": "{color.amber.600}", "$type": "color" } },
    "feedback": { "success": { "$value": "{color.emerald.500}", "$type": "color" }, "warning": { "$value": "{color.amber.500}", "$type": "color" }, "error": { "$value": "{color.red.500}", "$type": "color" }, "info": { "$value": "{color.blue.500}", "$type": "color" }, "onFill": { "$value": "{color.slate.900}", "$type": "color" } }
  },
  "font": {
    "family": { "display": { "$value": "Plus Jakarta Sans, sans-serif", "$type": "fontFamily" }, "body": { "$value": "Noto Sans, sans-serif", "$type": "fontFamily" }, "mono": { "$value": "JetBrains Mono, monospace", "$type": "fontFamily" } },
    "weight": { "regular": { "$value": 400, "$type": "fontWeight" }, "medium": { "$value": 500, "$type": "fontWeight" }, "semibold": { "$value": 600, "$type": "fontWeight" }, "bold": { "$value": 700, "$type": "fontWeight" }, "extrabold": { "$value": 800, "$type": "fontWeight" } },
    "size": { "2xs": { "$value": "10px", "$type": "dimension" }, "caption": { "$value": "12px", "$type": "dimension" }, "sm": { "$value": "14px", "$type": "dimension" }, "base": { "$value": "16px", "$type": "dimension" }, "lg": { "$value": "18px", "$type": "dimension" }, "xl": { "$value": "20px", "$type": "dimension" }, "2xl": { "$value": "24px", "$type": "dimension" } },
    "lineHeight": { "tight": { "$value": "1.25", "$type": "number" }, "normal": { "$value": "1.5", "$type": "number" } },
    "letterSpacing": { "tight": { "$value": "-0.01em", "$type": "dimension" }, "wide": { "$value": "0.14em", "$type": "dimension" } }
  },
  "space": {
    "1": { "$value": "4px", "$type": "dimension" }, "2": { "$value": "8px", "$type": "dimension" }, "3": { "$value": "12px", "$type": "dimension" }, "4": { "$value": "16px", "$type": "dimension" }, "5": { "$value": "20px", "$type": "dimension" }, "6": { "$value": "24px", "$type": "dimension" }
  },
  "radius": {
    "sm": { "$value": "6px", "$type": "dimension" }, "md": { "$value": "8px", "$type": "dimension" }, "lg": { "$value": "12px", "$type": "dimension" }, "xl": { "$value": "16px", "$type": "dimension" }, "2xl": { "$value": "20px", "$type": "dimension" }, "full": { "$value": "9999px", "$type": "dimension" }
  },
  "shadow": {
    "sm":   { "$value": "0 1px 2px rgba(0,0,0,0.05)", "$type": "shadow" },
    "card": { "$value": "0 2px 8px -2px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.02)", "$type": "shadow" },
    "cardHover": { "$value": "0 8px 16px -4px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.04)", "$type": "shadow" },
    "modal": { "$value": "0 20px 60px rgba(0,0,0,0.3)", "$type": "shadow" }
  },
  "opacity": { "disabled": { "$value": "0.5", "$type": "number" }, "muted": { "$value": "0.7", "$type": "number" } },
  "zIndex": { "sticky": { "$value": 20, "$type": "number" }, "dropdown": { "$value": 30, "$type": "number" }, "drawer": { "$value": 60, "$type": "number" }, "banner": { "$value": 70, "$type": "number" }, "modal": { "$value": 80, "$type": "number" }, "toast": { "$value": 90, "$type": "number" }, "splash": { "$value": 100, "$type": "number" } },
  "breakpoint": { "xs": { "$value": "400px", "$type": "dimension" }, "sm": { "$value": "640px", "$type": "dimension" }, "md": { "$value": "768px", "$type": "dimension" }, "lg": { "$value": "1024px", "$type": "dimension" }, "xl": { "$value": "1280px", "$type": "dimension" }, "2xl": { "$value": "1536px", "$type": "dimension" } },
  "duration": { "fast": { "$value": "150ms", "$type": "duration" }, "base": { "$value": "200ms", "$type": "duration" }, "slow": { "$value": "400ms", "$type": "duration" } },
  "easing": { "standard": { "$value": "cubic-bezier(0.16, 1, 0.3, 1)", "$type": "cubicBezier" }, "out": { "$value": "ease-out", "$type": "cubicBezier" } },
  "component": {
    "button":{ "primary": { "bg": { "$value": "{color.action.primary}", "$type": "color" }, "text": { "$value": "{color.text.onPrimary}", "$type": "color" } } },
    "input": { "borderFocus": { "$value": "{color.action.primary}", "$type": "color" } },
    "card":  { "radius": { "$value": "{radius.lg}", "$type": "dimension" }, "shadow": { "$value": "{shadow.card}", "$type": "shadow" } }
  }
}
```

---

## 6. Tokens como variables CSS (`:root` + tema oscuro)

```css
:root {
  /* Color — superficies y texto */
  --color-bg-canvas: #f8fafc;
  --color-bg-surface: #ffffff;
  --color-bg-sunken: #f1f5f9;
  --color-text-default: #0f172a;
  --color-text-muted: #64748b;
  --color-text-disabled: #94a3b8;
  --color-text-inverse: #ffffff;
  --color-text-on-primary: #102218;
  --color-border-default: #e2e8f0;

  /* Acción (marca) */
  --color-action-primary: #fbbf24;
  --color-action-primary-hover: #f59e0b;
  --color-action-primary-active: #d97706;

  /* Feedback */
  --color-feedback-success: #10b981;
  --color-feedback-warning: #f59e0b;
  --color-feedback-error: #ef4444;
  --color-feedback-info: #3b82f6;
  --color-feedback-on-fill: #0f172a; /* texto oscuro sobre colores de estado (contraste seguro) */

  /* Tipografía */
  --font-display: "Plus Jakarta Sans", sans-serif;
  --font-body: "Noto Sans", sans-serif;
  --font-mono: "JetBrains Mono", monospace;

  /* Radios */
  --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px; --radius-xl: 16px; --radius-2xl: 20px; --radius-full: 9999px;

  /* Sombras */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-card: 0 2px 8px -2px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.02);
  --shadow-card-hover: 0 8px 16px -4px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.04);
  --shadow-modal: 0 20px 60px rgba(0,0,0,0.3);

  /* Z-index */
  --z-sticky: 20; --z-dropdown: 30; --z-drawer: 60; --z-banner: 70; --z-modal: 80; --z-toast: 90; --z-splash: 100;

  /* Movimiento */
  --duration-fast: 150ms; --duration-base: 200ms; --duration-slow: 400ms;
  --easing-standard: cubic-bezier(0.16, 1, 0.3, 1);
}

/* Tema oscuro — identidad "Bistro green". Solo cambian superficies/texto; la marca ámbar y los feedback se mantienen. */
.dark {
  --color-bg-canvas: #102218;        /* green-950 */
  --color-bg-surface: #1c2e24;       /* green-900 */
  --color-bg-sunken: #0d1c14;        /* un solo nivel hundido (reemplaza #0B1120/#151e32/etc.) */
  --color-text-default: #f1f5f9;
  --color-text-muted: #94a3b8;
  --color-border-default: #334b40;   /* el del scrollbar dark */
}

/* Accesibilidad: respetar reducción de movimiento (hoy ausente) */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 7. Configuración equivalente para Tailwind (`tailwind.config.js` consolidado)

> Reemplaza la config inline de `index.html`. Pensada para **build local** (PostCSS), que elimina el CDN. Mantiene los nombres actuales (`primary`, `surface`, `text`, `status`) para no romper el código existente, y añade los faltantes (`border`, `primary.text`) que hoy se usan pero no existen.

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./index.tsx", "./App.tsx", "./{screens,components,hooks,lib,context}/**/*.{ts,tsx}"],
  theme: {
    screens: { xs: "400px", sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px" },
    extend: {
      colors: {
        primary: {
          DEFAULT: "#fbbf24", hover: "#f59e0b", active: "#d97706",
          light: "#fffbeb", text: "#78350f",
        },
        background: { light: "#f8fafc", dark: "#102218" },
        surface:    { light: "#ffffff", dark: "#1c2e24", sunken: "#f1f5f9", "dark-sunken": "#0d1c14" },
        text: { main: "#0f172a", secondary: "#64748b", disabled: "#94a3b8", onPrimary: "#102218" },
        // Antes NO existían y se usaban en el código → ahora definidos:
        border: { light: "#e2e8f0", dark: "#334b40" },
        status: {
          success: "#10b981", warning: "#f59e0b", error: "#ef4444", info: "#3b82f6",
          "on-fill": "#0f172a", // texto oscuro sobre colores de estado (contraste AA)
        },
        // (Se ELIMINAN los alias legacy planos background-light/surface-light/etc.)
      },
      fontFamily: {
        display: ["Plus Jakarta Sans", "sans-serif"],
        body: ["Noto Sans", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"], // antes no tenía token
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.75rem" }],
        caption: ["0.75rem", { lineHeight: "1rem" }],
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.125rem", { lineHeight: "1.75rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.5rem", { lineHeight: "2rem" }],
      },
      borderRadius: {
        DEFAULT: "0.25rem", sm: "0.375rem", md: "0.5rem",
        lg: "0.75rem", xl: "1rem", "2xl": "1.25rem", full: "9999px",
      },
      boxShadow: {
        card: "0 2px 8px -2px rgba(0,0,0,0.05), 0 2px 4px -2px rgba(0,0,0,0.02)",
        "card-hover": "0 8px 16px -4px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.04)",
        modal: "0 20px 60px rgba(0,0,0,0.3)",
      },
      zIndex: {
        sticky: "20", dropdown: "30", drawer: "60",
        banner: "70", modal: "80", toast: "90", splash: "100",
      },
      transitionTimingFunction: { standard: "cubic-bezier(0.16, 1, 0.3, 1)" },
      transitionDuration: { fast: "150", base: "200", slow: "400" },
      keyframes: {
        slideInRight: { "0%": { transform: "translateX(100%)" }, "100%": { transform: "translateX(0)" } },
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { transform: "translateY(100%)" }, "100%": { transform: "translateY(0)" } },
        slideInUpSubtle: { "0%": { opacity: "0", transform: "translateY(10px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        slideInRight: "slideInRight 0.4s cubic-bezier(0.16,1,0.3,1)",
        fadeIn: "fadeIn 0.2s ease-out",
        slideUp: "slideUp 0.3s ease-out",
        slideInUpSubtle: "slideInUpSubtle 0.4s cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [require("@tailwindcss/forms"), require("@tailwindcss/typography"), require("@tailwindcss/container-queries")],
};
```

---

## 8. Plan de migración (pasos ordenados)

Cada paso deja la app funcionando (no es un "big bang"). Verificar con `npm run build` tras cada bloque.

**Paso 1 — Salir del CDN de Tailwind → build local.**
Instalar `tailwindcss postcss autoprefixer` como devDeps, crear `tailwind.config.js` (sección 7) y `postcss.config.js`, añadir directivas `@tailwind base/components/utilities` al `index.css`, y **quitar** del `index.html` el `<script src="cdn.tailwindcss.com">` y el bloque `tailwind.config` inline. *Razón: el CDN no permite purgar CSS, no cachea bien y no es apto para producción.*

**Paso 2 — Definir los tokens que ya se usan pero no existen.**
Agregar `border.light/dark`, `primary.text`, `surface.sunken`, `text.disabled`, `status.on-fill` (ya incluidos en el config del paso 1). Esto arregla de inmediato las clases `border-border-light`/`text-primary-text` que hoy caen en nada.

**Paso 3 — Cargar bien Plus Jakarta Sans.**
Ya se importa por `@fontsource` en `index.tsx` (300–800). Decidir UNA vía: o quedarse con `@fontsource` (recomendado, self-hosted) y quitar la dependencia de Google Fonts para esta familia, o añadir el `<link>`. Además, **dejar de usar `font-black` (900)** o importar `@fontsource/plus-jakarta-sans/latin-900` para que no haya fake-bold.

**Paso 4 — Unificar grises/off-whites (automatizable).**
Buscar y reemplazar `#f6f8f7`, `#f0f4f3`, `#f8fafb`, `#f8faf9` → `bg-background-light`. Quitar el `style="background-color:#f6f8f7"` del `<body>` en `index.html`.

**Paso 5 — Reemplazar `#102218` hardcodeado (191 casos).**
Reemplazo guiado: `text-[#102218]` → `text-text-onPrimary`; `bg-[#102218]` → `bg-background-dark`. Revisar visualmente las pantallas de venta y empleados (donde más se concentra).

**Paso 6 — Consolidar superficies oscuras.**
Mapear `#151e32`/`#0B1120`/`#0d1c14`/`#1A2638`/`#0c1912`/`#0c0f16`/`#1d3a2a` → `surface-dark` o `surface-dark-sunken` según sean superficie o fondo hundido.

**Paso 7 — Unificar verdes de éxito.**
`#009459`/`#16a34a`/`#007a49` → `status-success`. Dejar `#25D366` solo donde sea branding WhatsApp explícito.

**Paso 8 — Eliminar el Toast duplicado.**
Migrar los usos de `components/Toast.tsx` a `AppToast`/`ToastContext` y borrar `Toast.tsx`.

**Paso 9 — Tokenizar `ConfirmDialog`.**
Reescribir `ConfirmDialog` con clases Tailwind (reutilizando `shadow-modal`, `rounded-xl`, `status.*`) en vez de CSS-in-JS, para que respete el tema y el modo oscuro.

**Paso 10 — Normalizar z-index, radios arbitrarios y escala de active/disabled.**
`z-[9999]`/`z-[99999]` → `z-toast`; `rounded-[20px/21px]` → `rounded-2xl`, `rounded-[12px]` → `rounded-lg`; unificar `active:scale-[0.98]` y `disabled:opacity-50`.

**Paso 11 — Accesibilidad.**
Añadir el bloque `@media (prefers-reduced-motion)` (sección 6). Subir los controles +/− de `ProductCard` a ≥44px de área táctil. Garantizar `focus-visible` ring en botones.

**Paso 12 — Crear primitivos reutilizables faltantes.**
`Card`, `Modal` (base única), `Badge`, `EmptyState`, `Input` tokenizados en `components/ui/`, y migrar incrementalmente. Esto reduce la duplicación detectada en la sección 8.

---

## 9. Preguntas para decisiones de diseño

1. **Modo oscuro:** ¿debe estar activo para el usuario final (toggle o automático por `prefers-color-scheme`), o es solo latente? De la respuesta depende si mantenemos y pulimos todo el CSS `dark:*` o lo retiramos para aligerar.
2. **Color secundario de marca:** hoy no existe un "secundario" real (solo el ámbar + verde oscuro). ¿Quieres introducir uno (p. ej. el verde esmeralda como acento), o la marca es monocromática ámbar?
3. **Público objetivo (POS para tiendas/minimercados en Colombia):** ¿priorizamos **densidad** (más info por pantalla, ideal para cajeros rápidos) o **amplitud/toque** (botones grandes, menos por pantalla)? Afecta tamaños, espaciado y mínimos de 44px.
4. **Tono tipográfico:** la app hoy usa pesos muy altos (bold/black por doquier). ¿Mantenemos ese look "fuerte" o lo suavizamos a semibold para una lectura más limpia?
5. **Referencias visuales:** ¿hay apps o marcas que te gusten como norte (Square, Loyverse, Shopify POS, etc.)? Las carpetas `/rediseño home` y `/rediseño pos` ¿son la dirección deseada?
6. **Nombre y alcance de la marca "Warm Bistro":** ¿el ámbar es definitivo o está sujeto a cambio? (Si puede cambiar, el paso 5 del plan es aún más urgente.)
7. **Emojis en UI** (🎉, ⚠️ en títulos): ¿se mantienen como parte del tono cercano o se reemplazan por íconos Material para consistencia?

---

### Nota de método y cumplimiento

Todos los conteos (191×`#102218`, frecuencias de radios/sombras/pesos) provienen de barridos reales sobre `components/*.tsx` + `screens/*.tsx` (excluyendo `*.test.tsx`). Los ratios WCAG se calcularon con la fórmula oficial de luminancia relativa. Las citas de archivo:línea corresponden al estado actual del repo; si el código cambia, reverificar. Lo no comprobable (activación del modo oscuro, intención de las carpetas de rediseño) quedó marcado como **SUPOSICIÓN**.

