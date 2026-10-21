# Inventario de Frontend — Parte 3: Componentes compartidos

Este documento describe los componentes de interfaz que se **reutilizan en 2 o más pantallas** de Bistro POS. Para cada uno se explica: qué es, qué variantes tiene, cómo se ve (en términos de las clases Tailwind reales del código), en qué pantallas aparece, y un fragmento de código representativo y corto.

Está pensado para un diseñador que va a redibujar la app sin ver el código: lo importante aquí es **qué variantes hay** y **dónde se usan**, no la lista de colores sueltos (eso ya está en la auditoría de tokens).

> Convención de lectura: donde el texto diga `primary` se refiere al amarillo ámbar de marca (`bg-primary`, aprox. amber-400). `text-[#102218]` es el verde oscuro de marca que se usa como texto sobre el amarillo.

---

## Índice

1. [Botones — `AppButton`](#1-botones--appbutton)
2. [Tarjeta de producto — `ProductCard`](#2-tarjeta-de-producto--productcard)
3. [Miniatura de producto — `ProductThumb`](#3-miniatura-de-producto--productthumb)
4. [Entrada de teléfono — `PhoneInput`](#4-entrada-de-teléfono--phoneinput)
5. [Teclado numérico — `Numpad`](#5-teclado-numérico--numpad)
6. [Diálogo de confirmación — `ConfirmDialog`](#6-diálogo-de-confirmación--confirmdialog)
7. [Notificaciones — `AppToast`](#7-notificaciones--apptoast)
8. [Badges (etiquetas pequeñas)](#8-badges-etiquetas-pequeñas)
9. [Navegación lateral desktop — `Sidebar`](#9-navegación-lateral-desktop--sidebar)
10. [Barra de navegación móvil — `MobileNavBar`](#10-barra-de-navegación-móvil--mobilenavbar)
11. [Pestañas de venta — `GlobalSellTabs`](#11-pestañas-de-venta--globalselltabs)

---

## 1. Botones — `AppButton`

**Archivo:** `components/ui/AppButton.tsx`

Es el botón base reutilizable de la app. Siempre tiene esquinas suaves, texto en negrita (`font-bold`), un pequeño rebote al presionar (`active:scale-[0.98]`) y un spinner de carga centrado cuando está en estado `isLoading` (el texto se vuelve invisible y aparece una rueda girando encima).

Acepta la prop `variant` con 5 valores y una prop `fullWidth` para ocupar todo el ancho.

### Variantes
| Variante | Uso visual | Clases clave |
|----------|-----------|--------------|
| `primary` (por defecto) | Acción principal. Fondo amarillo de marca, texto oscuro, con sombra tenue. | `bg-primary hover:bg-primary-hover text-text-onPrimary shadow-lg shadow-primary/20` |
| `secondary` | Acción secundaria neutra. Fondo gris claro, texto oscuro. | `bg-gray-100 hover:bg-gray-200 text-text-main` |
| `danger` | Acción destructiva (borrar, anular). Fondo rojo, texto blanco. | `bg-status-error hover:bg-red-600 text-white` |
| `outline` | Botón con borde y fondo transparente. | `border-2 border-border-light text-text-secondary hover:bg-background-light` |
| `ghost` | Botón "fantasma", sin borde ni fondo hasta el hover. | `text-text-secondary hover:text-text-main hover:bg-background-light` |

> Nota importante para el diseñador: en la práctica muchas pantallas **pasan su propia `className`** encima de la variante (ej. las pantallas de creación de producto reescriben el botón primario con `h-11 px-4 ... bg-primary text-[#102218] rounded-lg`). Es decir, el tamaño y el radio del botón **no están unificados**: cada pantalla lo ajusta. Esto es una inconsistencia a tener en cuenta.

**Dónde aparece:** pantallas de creación de productos (`CREATE_PRODUCT_SIMPLE`, `CREATE_PRODUCT_SERVICE`, `CREATE_PRODUCT_PROCESSED`), formularios de guardado, y en general como botón de "Guardar / Crear / Actualizar" de los formularios. (SUPOSICIÓN: su uso exacto en cada pantalla no se auditó una por una; se confirmó su importación en las pantallas de producto.)

**Base común (todas las variantes):**
```tsx
const baseStyles = "relative inline-flex items-center justify-center font-bold transition-all transform active:scale-[0.98] focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed disabled:active:scale-100";
```

**Spinner de carga (cuando `isLoading`):**
```tsx
{isLoading && (
    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <svg className="animate-spin size-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
    </span>
)}
```

**Ejemplo real de uso con className sobreescrita (pantalla crear producto):**
```tsx
<AppButton
    isLoading={loading || uploadingImage}
    className="h-11 px-4 py-2 text-base font-medium text-[#102218] bg-primary rounded-lg hover:bg-primary-hover shadow-sm transition-colors"
>
    {productToEdit ? 'Actualizar Producto' : 'Crear Producto'}
</AppButton>
```

> SUPOSICIÓN: no todos los botones de la app usan `AppButton`. Conviven botones `<button>` nativos con clases Tailwind escritas a mano (ej. el botón "Cancelar" junto al `AppButton` de arriba usa `<button className="h-11 px-4 ... bg-white border border-gray-300 rounded-lg">`). Hay dos estilos de botón secundario en paralelo.

---

## 2. Tarjeta de producto — `ProductCard`

**Archivo:** `components/ProductCard.tsx`

Es la tarjeta que representa un producto en la grilla de venta. Muestra imagen, nombre y precio, con controles de cantidad (−, número, +). Está memorizada (`React.memo`) para no re-renderizarse de más.

Recibe una prop `variant` con **dos valores: `mobile` y `desktop`**, que cambian bastante el tamaño y el layout. No hay variantes por "tipo de producto"; la diferencia es solo el dispositivo.

### Variante `desktop`
- Tarjeta blanca con esquinas muy redondeadas (`rounded-[21px]`), sombra marcada (`shadow-lg`), borde gris que al pasar el mouse se tiñe de ámbar (`hover:border-primary/50`).
- Imagen cuadrada arriba (`aspect-square`, `rounded-[15px]`), con zoom suave al hover (`group-hover:scale-110`). Si no hay imagen, muestra un icono de cubiertos (`restaurant`) gris.
- El **precio** flota sobre la esquina inferior derecha de la imagen, en una píldora negra translúcida (`bg-black/80 ... rounded-full text-white text-xs font-bold`). Es el elemento con más contraste de la tarjeta.
- Nombre en 2 líneas máximo (`line-clamp-2`), tamaño `text-[13px]`.
- Al pie, una barra gris (`bg-gray-50 rounded-xl`) con los tres controles: botón `−` (rojo suave, deshabilitado si cantidad es 0), número de cantidad en el centro, botón `+` amarillo (`bg-primary`).
- Si `isPulsing`, la tarjeta se marca con un anillo ámbar (`ring-2 ring-primary`) — feedback al agregar.

### Variante `mobile`
- Tarjeta más compacta, alto fijo (`h-[181px] sm:h-[219px]`), ancho acotado y centrado, esquinas `rounded-[12px]`, sombra sutil (`shadow-sm`).
- Imagen arriba (`h-[105px] sm:h-[135px]`, `rounded-[8px]`).
- Nombre pequeño (`text-[11px] sm:text-[13px]`), precio en ámbar (`text-primary`), y los mismos tres controles pero en versión mini (`size-[25px]`, iconos `text-[14px]`).
- Toda la tarjeta es tocable para agregar (`onClick={onAdd}` en el contenedor).

**Dónde aparece:** pantalla de venta por catálogo (`SELL` / `MENU`) y orden rápida (`QUICK_ORDER`), tanto en desktop como en móvil/tablet. Es el elemento repetido más visible de la app.

**Controles de cantidad (desktop):**
```tsx
<div className="mt-auto bg-gray-50 dark:bg-gray-800 rounded-xl p-1.5 flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
    <button onClick={onRemove}
        className={`w-[29px] h-[29px] rounded-[0.5rem] flex items-center justify-center transition-all ${quantity === 0 ? 'opacity-30 cursor-not-allowed bg-white text-gray-300' : 'bg-red-50 text-red-500 border border-red-100 hover:bg-red-100'}`}
        disabled={quantity === 0} aria-label="Quitar producto">
        <span className="material-symbols-outlined text-[18px]">remove</span>
    </button>
    <span className="text-[15px] font-black tabular-nums min-w-[22px] text-center ...">{quantity}</span>
    <button onClick={onAdd}
        className="w-[29px] h-[29px] rounded-[0.5rem] bg-primary text-[#102218] shadow-sm flex items-center justify-center hover:bg-primary/80 font-bold"
        aria-label="Agregar producto">
        <span className="material-symbols-outlined text-[18px]">add</span>
    </button>
</div>
```

**Píldora de precio sobre la imagen (desktop):**
```tsx
<div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-md px-3 py-1 rounded-full text-white text-xs font-bold shadow-sm z-10">
    ${formatCurrency(product.price)}
</div>
```

**Problema visual evidente:** la tarjeta `mobile` y `desktop` usan radios distintos (`rounded-[12px]` vs `rounded-[21px]`) y tamaños de botón distintos (`size-[25px]` vs `w-[29px] h-[29px]`). Visualmente son el mismo componente pero no comparten escala.

---

## 3. Miniatura de producto — `ProductThumb`

**Archivo:** `components/ui/ProductThumb.tsx`

Componente pequeño y simple: muestra la imagen de un producto dentro de un contenedor cuadrado y, si la imagen no existe o falla al cargar (frecuente en modo offline), muestra un **icono de respaldo** limpio en lugar del icono de "imagen rota" del navegador.

No tiene variantes de estilo propias: el tamaño, el radio y el fondo se le pasan por `className` desde cada pantalla. Props relevantes: `fit` (`cover` o `contain`), `fallbackIcon` (nombre del material symbol de respaldo, por defecto `inventory_2`), `iconClassName`.

**Dónde aparece:** listados donde se muestran productos en formato lista/fila (SUPOSICIÓN: inventario, resultados de escaneo de factura, selección de productos; se confirma que es el patrón de miniatura con fallback, pero no se auditó pantalla por pantalla).

```tsx
<div className={`overflow-hidden flex items-center justify-center ${className}`}>
    {showImg ? (
        <img src={src as string} alt={alt} crossOrigin="anonymous"
            className={`w-full h-full ${fit === 'cover' ? 'object-cover' : 'object-contain'}`}
            onError={() => setErrored(true)} />
    ) : (
        <span className={`material-symbols-outlined ${iconClassName}`}>{fallbackIcon}</span>
    )}
</div>
```

---

## 4. Entrada de teléfono — `PhoneInput`

**Archivo:** `components/PhoneInput.tsx`

Campo para escribir un número de teléfono con **selector de país**. A la izquierda hay un botón con la bandera y el indicativo (ej. 🇨🇴 +57) que abre un desplegable buscable con 15 países de Latinoamérica + España/EE. UU. A la derecha, el campo numérico. El componente arma internamente el número completo normalizado (ej. `573120001234`).

No tiene variantes de color; es un único estilo. Visualmente: altura `h-11`, el botón de país y el input se unen (bordes `rounded-l-xl` + `rounded-r-xl`, el botón sin borde derecho), borde gris (`border-gray-300`), foco en ámbar (`focus:ring-2 focus:ring-primary`).

**Dónde aparece:** autenticación (`LOGIN`, `REGISTER` — login por SMS OTP), y formularios con teléfono como el de clientes. (SUPOSICIÓN sobre clientes: es coherente con el flujo pero no se auditó esa pantalla.)

**Botón selector de país + input:**
```tsx
<button type="button" onClick={() => setOpen(prev => !prev)}
    className="shrink-0 h-11 flex items-center gap-1.5 px-2.5 bg-white border border-r-0 border-gray-300 rounded-l-xl hover:bg-gray-50">
    <span className="text-lg leading-none">{selectedCountry.flag}</span>
    <span className="text-xs font-bold text-gray-500">+{selectedCountry.dial}</span>
    <span className="material-symbols-outlined text-[14px] text-gray-400">{open ? 'expand_less' : 'expand_more'}</span>
</button>

<input type="tel" value={localNumber} onChange={handleLocalChange} placeholder={placeholder}
    className="flex-1 h-11 px-3 bg-white border border-gray-300 rounded-r-xl text-sm font-medium ... focus:ring-2 focus:ring-primary focus:border-primary outline-none" />
```

El desplegable de países tiene buscador propio (`placeholder="Buscar país..."`), altura máxima con scroll (`max-h-48 overflow-y-auto`) y el país seleccionado se resalta con fondo ámbar tenue (`bg-primary/10`).

> SUPOSICIÓN sobre "input de texto base": no existe un componente `TextInput` compartido en `components/ui/`. Los campos de texto normales se escriben como `<input>` nativos con clases Tailwind repetidas en cada pantalla (patrón recurrente: `h-11 px-3 bg-white border border-gray-300 rounded-xl ... focus:ring-2 focus:ring-primary`). Es decir, el estilo de input está estandarizado por convención visual, no por un componente.

---

## 5. Teclado numérico — `Numpad`

**Archivo:** `components/Numpad.tsx`

Teclado numérico tipo "bottom sheet": entra deslizándose desde abajo, se puede arrastrar hacia abajo para cerrar y responde también al teclado físico (números, operadores, Enter = confirmar, Esc = cerrar). Pensado para capturar cantidades, montos y operaciones rápidas.

Layout: panel blanco con esquina superior muy redondeada (`rounded-t-[2rem]`), una "manija" gris arriba para arrastrar, y una grilla de **4 columnas** con 20 teclas. Cada tipo de tecla tiene su propio color.

### Tipos de tecla (variantes de botón dentro del numpad)
| Tipo | Teclas | Estilo |
|------|--------|--------|
| `number` | 0–9 y la coma | Fondo gris muy claro, texto oscuro. `bg-gray-50 text-gray-900` |
| `operator` | ÷ × − + | Fondo gris, texto gris medio. `bg-gray-100 text-gray-700` |
| `clear` | C | Gris, texto tenue. `bg-gray-100 text-gray-500` |
| `icon` | retroceso (backspace) | Gris con icono. `bg-gray-100 text-gray-900` |
| `action` | = | Oscuro de alto contraste. `bg-gray-900 text-white font-black` |
| `submit` | ✓ (confirmar) | Amarillo de marca con sombra. `bg-primary text-[#102218] shadow-lg shadow-primary/20` |

Todas comparten base: `h-14 rounded-2xl flex items-center justify-center text-xl font-bold active:scale-90`.

**Dónde aparece:** flujos de venta y pago donde se teclea cantidad o monto (SUPOSICIÓN: `PAYMENT`, ajuste de cantidad desde `ProductCard`). Existe además una variante hermana `InventoryNumpad.tsx` para la pantalla de inventario (no es el mismo archivo; comparte el patrón de bottom-sheet).

**Clasificador de estilo por tipo de tecla:**
```tsx
case 'number':   return `${base} bg-gray-50 dark:bg-zinc-800/60 text-gray-900 dark:text-white ...`;
case 'operator': return `${base} bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 ...`;
case 'action':   return `${base} bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-black ...`;
case 'submit':   return `${base} bg-primary text-[#102218] shadow-lg shadow-primary/20 active:bg-primary/80`;
```

**Contenedor (bottom sheet):**
```tsx
<div className={`bg-white dark:bg-zinc-900 border-t ... pt-1 pb-6 px-3 shadow-[0_-12px_40px_rgba(0,0,0,0.12)] z-50 rounded-t-[2rem] flex flex-col ${className}`}
    style={{ transform: `translateY(${translateY}px)`, ... }}>
    {/* Manija de arrastre */}
    <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
    ...
    <div className="grid grid-cols-4 gap-2"> {/* teclas */} </div>
</div>
```

---

## 6. Diálogo de confirmación — `ConfirmDialog`

**Archivo:** `components/ConfirmDialog.tsx` (controlado por `context/ConfirmDialogContext.tsx`)

Es el modal de confirmación global de la app. **Hay una sola instancia** montada arriba de todo; cualquier pantalla lo invoca llamando a `confirmAction({ title, message, variant, ... })` y recibe una promesa que resuelve `true`/`false`. Esto significa que el diseño del modal es **único y centralizado**: todas las confirmaciones (borrar, anular, cerrar sin guardar) se ven igual.

> Detalle técnico para el diseñador: este modal **no usa clases Tailwind**, está escrito con estilos en línea (`style={{...}}`). Por eso su apariencia es fija y no cambia con el tema (siempre fondo blanco). Es la excepción al resto de la app.

Layout: overlay negro translúcido (`rgba(0,0,0,0.5)`) que centra una tarjeta blanca de `max-width: 420px`, `border-radius: 16px`, con sombra fuerte. Arriba un emoji grande según la variante, luego el título (18px, negrita), el mensaje (14px, gris) y al pie dos botones lado a lado: **Cancelar** (gris) y **Confirmar** (del color de la variante). El botón confirmar muestra spinner y texto de carga (`loadingText`) mientras procesa.

### Variantes (prop `variant`)
| Variante | Emoji | Color del botón confirmar |
|----------|-------|---------------------------|
| `danger` (por defecto) | 🗑️ | Rojo (`#ef4444`, hover `#dc2626`) |
| `warning` | ⚠️ | Ámbar (`#f59e0b`, hover `#d97706`) |
| `info` | ℹ️ | Azul (`#3b82f6`, hover `#2563eb`) |

**Dónde aparece:** se dispara desde muchísimas pantallas vía `useConfirmDialog()`. Confirmado en: anular/eliminar en tablas, cerrar formularios de factura sin guardar (`InvoiceScanScreen`), gestión de personal (`PayrollStaffView`), gestión de mesas/salas (`TableSelectorControl`, `OpenTicketsBar`), conexión de impresora (`PrinterConnectionCard`), suscripciones (`SubscriptionManagementScreen`), y dropdowns de conceptos/roles de nómina.

**Mapa de variantes (literal):**
```tsx
const variantColors = {
    danger:  { btn: '#ef4444', btnHover: '#dc2626', icon: '🗑️' },
    warning: { btn: '#f59e0b', btnHover: '#d97706', icon: '⚠️' },
    info:    { btn: '#3b82f6', btnHover: '#2563eb', icon: 'ℹ️' },
};
```

**Textos por defecto (si no se pasan):** confirmar = `'Confirmar'`, cancelar = `'Cancelar'`, carga = `'Procesando...'`. Fuente: `ConfirmDialogContext.tsx`.

> Nota: existe un fallback. Si por alguna razón no hay provider, `confirmAction` cae al `window.confirm()` nativo del navegador. En uso normal esto no pasa.

---

## 7. Notificaciones — `AppToast`

**Archivo:** `components/AppToast.tsx` (alimentado por `context/ToastContext.tsx`)

Son los avisos emergentes ("toasts") que confirman acciones o reportan errores. **Instancia única global**: cualquier pantalla llama a `showToast(mensaje, tipo, duración, descripción?)`. Se auto-cierran por tiempo (3.5 s por defecto) y tienen un botón X para cerrarlos antes.

> Importante: el archivo `components/Toast.tsx` existe pero es un toast viejo/aislado con estilos en línea. El toast real y compartido de la app es **`AppToast`** (usa Tailwind, variantes y posicionamiento responsive). SUPOSICIÓN: `Toast.tsx` podría ser código heredado; no se confirmó que esté montado globalmente.

Cada toast es una fila con: icono a la izquierda, mensaje (y una segunda línea opcional de descripción más tenue), y la X a la derecha. Tiene un borde grueso de color a la izquierda (`border-l-4`) que indica el tipo. Fondo oscuro semitransparente del color correspondiente.

**Posicionamiento (es la parte responsive):**
- **Móvil:** arriba, centrado, de borde a borde (`md:hidden fixed top-0 ... px-3 pt-3`), entra bajando (`animate-[toastDown...]`).
- **Desktop:** arriba a la derecha, ancho fijo (`fixed top-5 right-5 w-[360px]`), entra deslizando desde la derecha (`animate-[toastSlideIn...]`).

### Variantes (prop `type`)
| Tipo | Icono | Estilo del fondo/borde | Color del icono |
|------|-------|------------------------|-----------------|
| `success` | `check_circle` | `bg-emerald-900/95 border-l-4 border-emerald-400 text-emerald-100` | `text-emerald-400` |
| `error` | `cancel` | `bg-red-900/95 border-l-4 border-red-400 text-red-100` | `text-red-400` |
| `warning` | `warning` | `bg-amber-900/95 border-l-4 border-amber-400 text-amber-100` | `text-amber-400` |
| `info` (por defecto) | `info` | `bg-blue-900/95 border-l-4 border-blue-400 text-blue-100` | `text-blue-400` |

**Fila del toast (literal):**
```tsx
<div role="alert" aria-live="assertive"
    className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-2xl ${animationClass} ${styleMap[type]}`}>
    <span className={`material-symbols-outlined text-xl flex-shrink-0 mt-0.5 ${iconColorMap[type]}`}>{iconMap[type]}</span>
    <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-snug">{message}</p>
        {description && <p className="text-xs opacity-80 leading-snug mt-0.5">{description}</p>}
    </div>
    <button ... aria-label="Cerrar notificación" className="... p-1 rounded-md opacity-70 hover:opacity-100 hover:bg-white/10">
        <span className="material-symbols-outlined text-base">close</span>
    </button>
</div>
```

**Dónde aparece:** en toda la app, sobre cualquier pantalla (es global). Se usa para "guardado con éxito", "error al registrar", etc.

---

## 8. Badges (etiquetas pequeñas)

No existe un componente `Badge` dedicado; son píldoras pequeñas escritas con clases Tailwind, repetidas con un patrón consistente. Vale la pena documentarlas porque el diseñador las verá en varias pantallas. Hay dos familias claras:

### 8.a. Badge "PRO" (función de pago)
Marca funciones bloqueadas en el plan actual (ej. Inventario físico, Mesas). Píldora ámbar muy pequeña, en mayúsculas y negrita extrema.

Aparece en: `Sidebar` (ítem Inventario), menú móvil del `Sidebar`, y `GlobalSellTabs` (pestaña Mesas).
```tsx
<span className="px-1.5 py-0.5 text-[9px] font-black bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 rounded border border-amber-300/60">
    PRO
</span>
```

### 8.b. Badge de rol de usuario
Color según el rol de la persona. Se arma con un `switch` en `Sidebar.tsx` (`getRoleBadgeColor`). Píldora redonda tenue con texto del color del rol.

| Rol | Color |
|-----|-------|
| Administrador | morado — `bg-purple-100 text-purple-700` |
| Cajero | azul — `bg-blue-100 text-blue-700` |
| Mesero | verde — `bg-emerald-100 text-emerald-700` |
| Cocinero | naranja — `bg-orange-100 text-orange-700` |
| (otro) | gris — `bg-gray-100 text-gray-700` |

```tsx
case 'Administrador': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
case 'Cajero':        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
case 'Mesero':        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
```

### 8.c. Indicadores de punto (dot)
Puntitos de estado, no texto. Se usan como "notificación sin leer" (rojo pulsante) y "turno abierto/cerrado" (verde/gris). Vistos en `MobileNavBar` y `Sidebar` (Asistente IA).
```tsx
<span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-red-500 ring-2 animate-pulse ..." />   {/* no leído */}
<span className="... size-2 rounded-full ... ${isShiftOpen ? 'bg-emerald-500' : 'bg-slate-300'}" />        {/* turno */}
```

> SUPOSICIÓN: no se auditó una tabla reutilizable compartida. En Bistro POS las tablas (historial, facturas, aging de clientes) parecen construirse por pantalla con `<table>`/grillas propias, no con un componente `Table` común. Si el diseñador necesita el detalle de cada tabla, está en las fichas de pantalla (documentos 02 y 03), no aquí.

---

## 9. Navegación lateral desktop — `Sidebar`

**Archivo:** `components/Sidebar.tsx`

Es el menú lateral izquierdo en desktop y el **drawer** (menú deslizante) en móvil. Fuente única de navegación principal. Ancho `w-64` expandido o `w-16` colapsado; fondo claro, borde derecho sutil.

### Estructura desktop (de arriba a abajo)
1. **Cabecera de perfil** (`h-14`): nombre del negocio en negrita + nombre/email del usuario debajo, con una flecha `expand_more` que abre un dropdown (Mi Perfil / Suscripción* / Cerrar Sesión). *Suscripción solo visible para negocios habilitados.
2. **Navegación por secciones colapsables** con títulos en gris mayúscula pequeña (`text-[12px] font-semibold text-gray-400`):
   - **Operaciones:** `Punto de Venta` (icono `payments`), `Historial de ventas` (icono `receipt_long`).
   - **Gestión:** `Productos` (`shopping_bag`), `Inventario` (`inventory`, con badge PRO si aplica), `Estadísticas` (`grid_view`), `Clientes` (`groups`), `Proveedores` (`account_balance_wallet`).
   - **Equipo:** `Empleados` (`badge`), `Actividad` (`monitoring`). (`Capacitación` existe pero está oculta — `access: false`.)
3. **Pie:** `Asistente IA` (`smart_toy`, con punto rojo de no leídos) solo en negocios habilitados; `Impresora` (`print`) o `Configuración` (`settings`) según permisos.

> Las etiquetas y los iconos de arriba son **literales del código**. Nota: el ítem interno se llama `Proveedores` en la UI aunque la pantalla es `Screen.DEBTS`.

### Estado activo de un ítem
Fondo gris claro + texto oscuro + borde tenue; el inactivo es texto gris con hover gris:
```tsx
item.isActive
    ? 'bg-gray-100 text-gray-900 dark:bg-gray-800/80 dark:text-white font-semibold border border-gray-205/20'
    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 hover:text-gray-900'
```

### Variante móvil (drawer)
Al abrir en móvil, ocupa toda la pantalla deslizándose desde la izquierda (`animate-[slideInLeft...]`), con overlay oscuro detrás y **gesto de swipe para cerrar** (arrastrar a la izquierda > 80px). Tiene tres sub-vistas internas: menú principal, submenú de perfil y submenú de configuración.

```tsx
<aside className={`... ${isCollapsed ? 'w-16' : 'w-64'} bg-surface-light dark:bg-surface-dark border-r ... flex flex-col ... hidden md:flex fixed left-0 top-0 h-full transition-[transform,opacity,width,padding] duration-300`}>
```

**Problema visual evidente:** el Sidebar es muy denso (3 secciones colapsables, pie con 2–3 acciones, dropdown de perfil, badges PRO). En pantallas chicas de desktop puede sentirse apretado. Además convive el ítem "Proveedores" cuyo nombre no coincide con su concepto interno (deudas), lo que puede confundir al rediseñar.

---

## 10. Barra de navegación móvil — `MobileNavBar`

**Archivo:** `components/MobileNavBar.tsx`

Barra inferior flotante en móvil (fuente única; `App.tsx` la monta en casi todas las pantallas excepto `HOME`, que tiene su propia instancia). Es una "pastilla" flotante redondeada, con fondo blanco translúcido y desenfoque (`bg-white/90 backdrop-blur-xl`), separada del borde (`inset-x-3`), con sombra elevada.

Tiene **3 o 4 ítems** según permisos:
| Ítem | Icono | Nota |
|------|-------|------|
| Inicio | `home` | — |
| Vender | `point_of_sale` | activo también en orden rápida |
| Turno | `calculate` | con punto verde/gris = turno abierto/cerrado |
| Ayuda | `auto_awesome` | solo negocios con Asistente IA; con punto rojo de no leídos |

El ítem activo se pinta en amarillo de marca con texto oscuro; los demás en gris.
```tsx
item.active
    ? 'bg-amber-400 text-slate-950 font-bold shadow-sm'
    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100/60 font-medium'
```

**Contenedor flotante:**
```tsx
<nav style={{ bottom: 'max(12px, calc(env(safe-area-inset-bottom, 0px) + 8px))' }}
    className="md:hidden fixed inset-x-3 max-w-sm mx-auto z-50 bg-white/90 backdrop-blur-xl border border-slate-200/80 shadow-[...] rounded-2xl p-1.5 flex items-center justify-between gap-1">
```

> Observación de consistencia: aquí el color activo se escribe `bg-amber-400 text-slate-950` (clase cruda), mientras que en otros componentes el amarillo de marca se nombra `bg-primary` / `text-[#102218]`. Es el mismo color conceptual escrito de dos formas.

---

## 11. Pestañas de venta — `GlobalSellTabs`

**Archivo:** `components/GlobalSellTabs.tsx`

Barra de pestañas que aparece **solo en desktop** (`hidden md:flex`) en la parte superior de la zona de venta, centrada. Es la que cambia entre modos de trabajo y abre acciones rápidas. Alto `h-14`, fondo blanco con borde inferior.

Son botones tipo "chip" (píldora `rounded-xl h-10 px-5`, con icono + texto), cada uno con **su propio color temático** y dos estados (inactivo = fondo tenue del color; activo = fondo sólido del color con sombra):

| Pestaña | Etiqueta | Icono | Color | Qué hace |
|---------|----------|-------|-------|----------|
| Egresos | `Egresos` | `payments` | rojo | Abre un dropdown de acciones de gasto (gasto, compra/inventario, merma, "Foto a factura" que abre el escaneo). Solo con permiso `inv_purchase`. |
| Mesas | `Mesas` | `table_restaurant` | verde esmeralda | Activa el modo mesas (con badge PRO si el plan no lo incluye → abre modal de upgrade). Aparece/desaparece animado según `isTablesEnabled`. |
| Orden | `Orden` | (sin icono) | ámbar | Activa el modo orden rápida. |

**Pestaña (estado activo vs inactivo) — ejemplo Egresos:**
```tsx
<button onClick={() => handleTabClick('gastos')}
    className={`h-10 px-5 flex items-center gap-2 font-bold text-sm rounded-xl transition-colors border ${visualActiveTab === 'gastos'
        ? 'bg-red-500 text-white border-transparent shadow-lg shadow-red-500/20'
        : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'}`}>
    <span className="material-symbols-outlined text-[20px]">payments</span>
    <span>Egresos</span>
</button>
```

**Modales/paneles que abre desde aquí:**
- **Dropdown de egresos** (`ExpenseActionsMenu`): panel blanco redondeado (`rounded-2xl shadow-xl`) con las opciones de registro de gasto.
- **`ExpenseModal`**: modal de registro de gasto/compra/merma.
- **`InvoiceScanScreen`** (Escaneo de factura con IA): se abre como overlay a pantalla completa.
- **`UpgradeProModal`**: aviso de función PRO (Mesas) con botón para ir a suscripción.

**Problema visual evidente:** las tres pestañas usan tres colores fuertes distintos (rojo, verde, ámbar) compitiendo entre sí en la misma barra. Es muy "semáforo"; un diseñador probablemente querrá jerarquizarlas.

---

## Resumen rápido para el diseñador

- **Botón base:** `AppButton` con 5 variantes, pero muchas pantallas lo sobreescriben → tamaños/radios no unificados. Convive con `<button>` nativos.
- **Tarjeta de producto:** `ProductCard` con 2 variantes (móvil/desktop) que no comparten escala.
- **Inputs:** `PhoneInput` es el único input "componentizado"; el resto de inputs son `<input>` nativos con un patrón Tailwind repetido (no hay `TextInput` compartido).
- **Teclado:** `Numpad` (bottom sheet) con 6 tipos de tecla; existe `InventoryNumpad` gemelo.
- **Confirmación:** `ConfirmDialog` único y global, con 3 variantes (danger/warning/info) — pero escrito con estilos en línea, no Tailwind (siempre blanco).
- **Toasts:** `AppToast` global, 4 tipos (success/error/warning/info), posición distinta en móvil vs desktop. (`Toast.tsx` es un remanente aparte.)
- **Badges:** no hay componente; patrón "PRO" (ámbar) y badge de rol (color por rol). No hay tabla compartida.
- **Navegación:** `Sidebar` (desktop + drawer móvil), `MobileNavBar` (pastilla inferior), `GlobalSellTabs` (chips de modo de venta, solo desktop). El amarillo de marca se escribe a veces como `bg-primary` y a veces como `bg-amber-400`.

> Todo lo marcado como **SUPOSICIÓN** necesita confirmarse abriendo la app o revisando la pantalla concreta; se señaló cada vez que no se pudo verificar en el código leído para este documento.
