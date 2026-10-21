# Cambios UI Facturas (SalesScreen) — 4 Junio 2026

Resumen de cambios realizados en la pantalla de historial de ventas/facturas (`screens/SalesScreen.tsx`).

---

## Cambio: Header del detalle de venta reorganizado en dos filas

**Archivo:** `screens/SalesScreen.tsx`

### Antes
- El header del detalle de venta era una sola fila con la info del cliente a la izquierda y los botones de acción a la derecha.
- En móvil, varios botones estaban ocultos con clases responsive (`hidden lg:flex`, `hidden min-[431px]:flex`, `flex lg:hidden`).
- El botón de WhatsApp y Descargar PDF solo aparecían en desktop.
- El botón de Compartir (share) solo aparecía en móvil.
- Los botones de Imprimir y Comanda no aparecían en pantallas < 431px.
- El espacio era insuficiente para mostrar info del cliente + todos los botones en una línea.

### Después
- El header se divide en **dos filas dentro del mismo contenedor** `border-b`:
  - **Fila 1 (información):** Botón volver ← (solo móvil `lg:hidden`) + nombre del cliente + metadata (número de orden, fecha, estado, vendedor).
  - **Fila 2 (acciones):** Todos los botones de acción centrados horizontalmente con `justify-center gap-2`.
- **Todos los botones son visibles en cualquier tamaño de pantalla** — no hay clases `hidden` responsive.
- Se eliminó el dropdown "Más opciones" (⋮) que existió brevemente como solución intermedia.

### Botones en la fila de acciones (orden de izquierda a derecha)
| Botón | Ícono | Color hover | Condición |
|---|---|---|---|
| Imprimir ticket | `print` | Azul | Siempre visible. Punto verde si impresora conectada |
| Imprimir comanda | `restaurant` | Naranja | Solo si `isCatalogMode` (localStorage) |
| WhatsApp | SVG WhatsApp | Verde | Siempre visible |
| Email | `email` | Índigo | Siempre visible |
| Compartir | `share` | Verde | Siempre visible |
| Descargar PDF | `file_download` | Púrpura | Siempre visible |
| Eliminar | `delete` | Rojo | Siempre visible |

### Layout CSS
```tsx
{/* Row 1: Info */}
<div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 pt-3 pb-2">
  {/* ← back button (lg:hidden) + client info */}
</div>

{/* Row 2: Action buttons */}
<div className="flex items-center justify-center gap-2 px-3 sm:px-4 md:px-6 pb-3">
  {/* All action buttons */}
</div>
```

### Motivación
- En móvil los botones quedaban apretados o se ocultaban, obligando al usuario a no tener acceso a funciones importantes (WhatsApp, PDF, etc.).
- La solución de dropdown requería un toque extra para acceder a las acciones — fricción innecesaria dado que el espacio vertical no es escaso en el header.
- La fila dedicada de acciones centrada se ve simétrica tanto en móvil (375px) como en desktop y no depende de menús ocultos.

---

## Estado eliminado

Se removió el estado `isMoreMenuOpen` y su useEffect de limpieza que se habían agregado para el dropdown intermedio. Ya no son necesarios.

---

## Impacto en otros archivos

- `components/modals/EditOrderItemModal.tsx`: Rediseño completo (ver sección abajo).
- `components/AppToast.tsx`: Refactorizado para layout responsive (ver sección abajo).

---

## Cambio: EditOrderItemModal — Bottom sheet profesional con swipe-to-dismiss

**Archivo:** `components/modals/EditOrderItemModal.tsx`

### Antes
- Modal con `z-50` (mismo que MobileNavBar), lo que hacía que la navbar tapara los botones inferiores.
- Sin soporte de swipe-down para cerrar.
- Estilo con botón amarillo apagado, bordes simples.

### Después
- `z-[60]` para estar por encima de la MobileNavBar (`z-50`).
- **Swipe-to-dismiss** desde el drag handle (barrita superior). Usa `touch-none` + `e.preventDefault()` en el handle para evitar que el navegador active pull-to-refresh.
- Si se arrastra >80px hacia abajo, se cierra con animación. Si no, vuelve a su posición.
- `maxHeight: 85vh` con scroll interno para pantallas pequeñas.
- Padding-bottom con `safe-area-inset-bottom` en móvil para no tapar los botones con la navbar.
- Animación de cierre (`closing` state) con translateY en móvil y scale+opacity en desktop.
- `document.body.style.overflow = 'hidden'` al abrir para evitar scroll del fondo.
- Diseño renovado: bordes `rounded-2xl`, gradiente sutil en el card del producto actual, botón Guardar con fondo indigo + sombra, feedback táctil `active:scale-[0.98]`, labels con tracking más amplio.

### Fila de producto clickeable
- Toda la fila del ítem en la lista de productos del detalle de venta es ahora clickeable para abrir el modal de edición.
- Se eliminó el botón ✏️ de editar (redundante con el click en la fila).
- El botón × de eliminar usa `e.stopPropagation()` para no disparar la edición.
- La columna de acciones pasó de `w-16` (edit + delete) a `w-8` (solo delete).

---

## Cambio: AppToast responsive para móviles estrechos

**Archivo:** `components/AppToast.tsx`

### Antes
- Layout con inline styles: `position: fixed, top: 20px, right: 20px, maxWidth: 380px`.
- En un Samsung S23 (~360px ancho), el toast se desbordaba a la derecha y el texto se cortaba.
- Iconos emoji (✓, ✕, ⚠, ℹ).
- Animación única slide-in desde la derecha.

### Después
- Refactorizado a Tailwind CSS con layout responsive dual:
  - **Móvil** (`md:hidden`): `fixed top-0 left-0 right-0 px-3 pt-3` — ancho completo con padding 12px, sin riesgo de overflow.
  - **Desktop** (`hidden md:flex`): `fixed top-5 right-5 w-[360px]` — comportamiento anterior preservado.
- Animaciones separadas: `toastDown` (de arriba hacia abajo) en móvil, `toastSlideIn` (de derecha a izquierda) en desktop.
- Iconos `material-symbols-outlined` en vez de emoji, consistente con el diseño del resto de la app.
- Cada toast muestra un ícono × de cierre visible para mayor discoverability.
- `pointer-events-none` en el contenedor con `pointer-events-auto` en cada toast individual.

---

## Documentación actualizada

- `docs/caracteristicas/historial_ventas.md`: Sección "Ver detalle de una venta" con layout de dos filas y fila clickeable.
- `docs/caracteristicas/sistema_notificaciones.md`: Sección de layout responsive actualizada con la nueva estructura.
