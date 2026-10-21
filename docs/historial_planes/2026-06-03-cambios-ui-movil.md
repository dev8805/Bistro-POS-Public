# Cambios UI Móvil — 3 Junio 2026

Resumen de cambios realizados en la interfaz móvil de ventas (`MenuScreen`, `PaymentScreen`, `SuccessScreen`, `App.tsx`).

---

## 1. Header Móvil Unificado con Dropdown de Modo

**Archivo:** `screens/MenuScreen.tsx`

### Antes
- El header móvil tenía **dos variantes completamente separadas** controladas por `isScannerMode`:
  - **Scanner header:** Input de búsqueda siempre expandido + botón de cámara. No tenía forma de cambiar al catálogo.
  - **Header normal:** Título "Productos" + botón "Buscar" + botón toggle escáner.
- El usuario quedaba atrapado en modo escáner sin opción visible para ir al catálogo (bug UX).

### Después
- **Un solo header unificado** para ambos modos con layout consistente:
  - **Izquierda:** Botón "Buscar" colapsable → al presionar expande un input de búsqueda completo.
  - **Derecha:** Dropdown de modo que muestra la opción activa ("Escáner" o "Catálogo") con icono y flecha. Al presionar despliega ambas opciones debajo.
  - **Extremo derecha:** Botón de cámara (icono `photo_camera`) — solo visible en modo Escáner cuando el buscador está colapsado.
- Se eliminó el título "Productos" del header.
- El buscador funciona con el estado correspondiente al modo: `scannerSearch` (escáner) o `search` (catálogo).

### Estados agregados
```tsx
const [isScannerSearchExpanded, setIsScannerSearchExpanded] = useState(false);
const [isMobileModeDropdownOpen, setIsMobileModeDropdownOpen] = useState(false);
const mobileModeDropdownRef = useRef<HTMLDivElement>(null);
```

### Click-outside
El handler existente para cerrar dropdowns ahora también cierra `isMobileModeDropdownOpen`.

---

## 2. Botón de Opciones en Cards Móviles

**Archivo:** `screens/MenuScreen.tsx`

### Problema
Las cards del grid móvil (< 1024px) no mostraban el botón de opciones/ajustes (`more_horiz` o `tune`) que sí aparece en desktop. No era una condición filtrada — simplemente nunca se incluyó en el template inline del grid móvil.

### Solución
Se agregó un botón circular amarillo (24px) posicionado absolute en la esquina inferior-derecha de la imagen del producto:

```tsx
<button
    onClick={(e) => { e.stopPropagation(); onEditProduct(product); }}
    className="absolute bottom-1.5 right-1.5 z-20 size-[24px] rounded-full bg-primary ..."
>
    <span className="material-symbols-outlined text-[14px]">
        {product.hasCustomization ? 'tune' : 'more_horiz'}
    </span>
</button>
```

- Muestra `tune` si el producto tiene personalización (ingredientes, términos de cocción).
- Muestra `more_horiz` (tres puntos) para productos simples.
- Al presionar abre el editor de producto (`onEditProduct`).

---

## 3. Flujo de Pago en Modo Catálogo: Resumen antes de Cobrar

**Archivos:** `screens/PaymentScreen.tsx`, `screens/MenuScreen.tsx`

### Antes
- `PaymentScreen` inicializaba `step = 'payment'` siempre → al presionar el FAB desde catálogo, el usuario iba directo al formulario de cobro sin ver qué tenía en el carrito.

### Después
- `step` se inicializa dinámicamente:
  - Si existe `sessionStorage.bistro_payment_skip_summary` → `'payment'` (flujo escáner, sin cambios).
  - Si no existe → `'summary'` (flujo catálogo, muestra resumen del carrito primero).
- El flag se limpia tras leerse.

### Flujos resultantes

| Modo | FAB/Botón | Flag | Paso inicial |
|---|---|---|---|
| **Catálogo** | FAB circular (sin flag) | ❌ | `summary` → botón "Pagar" → `payment` |
| **Escáner** | Barra "Procesar Pago" (con flag) | ✅ | `payment` directo |
| **Tablet EAN** | Barra inferior (con flag) | ✅ | `payment` directo |

---

## 4. FAB del Carrito — Posición Fija y Exclusivo de Catálogo

**Archivo:** `screens/MenuScreen.tsx`

### Posición
- Cambiado de `absolute bottom-6` a `fixed bottom-[calc(60px+env(safe-area-inset-bottom,0px)+16px)]`.
- Se posiciona encima de la MobileNavBar (60px) respetando el safe area del dispositivo.
- Ya no se corta ni se oculta parcialmente detrás de la navbar.

### Visibilidad en modo escáner
- El botón de carrito que aparecía en el header cuando el buscador estaba expandido (`isKeyboardVisible && totalItems > 0`) ahora **solo se muestra en modo catálogo** (`!isScannerMode && isSearchExpanded`).
- En modo escáner, el usuario usa el botón "Procesar Pago" de la barra inferior del carrito escaneado.

---

## 5. SuccessScreen — Cobertura Completa en Móvil

**Archivo:** `App.tsx`

### Problema
El contenedor de `SuccessScreen` en móvil usaba `flex-1 h-full` sin posicionamiento absoluto/fijo. El MenuScreen/SellScreen seguía visible por detrás en la parte superior (se veía un pedazo de card/header asomándose).

### Solución
Cambiado a `fixed inset-0 z-50`:

```tsx
<div className="lg:hidden fixed inset-0 z-50 flex flex-col md:absolute md:flex-row md:justify-end md:bg-black/50 md:backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
```

Ahora la pantalla de éxito cubre todo el viewport en móvil sin dejar contenido visible por detrás.

---

## Archivos Modificados

| Archivo | Cambios |
|---|---|
| `screens/MenuScreen.tsx` | Header unificado, dropdown de modo, botón opciones en cards, FAB fixed, cart button solo catálogo |
| `screens/PaymentScreen.tsx` | Step dinámico basado en sessionStorage flag |
| `App.tsx` | SuccessScreen container fixed inset-0 |

---

## Notas de Compatibilidad

- El flujo del modo escáner **no fue alterado**: sigue usando su propia barra "Procesar Pago" con el flag `bistro_payment_skip_summary`, y va directo al formulario de cobro.
- Desktop (≥ 1024px) no se ve afectado — su header y sidebar lateral permanecen igual.
- El `ProductCard` componente sigue sin usarse en el JSX de `MenuScreen` (las cards son inline).
