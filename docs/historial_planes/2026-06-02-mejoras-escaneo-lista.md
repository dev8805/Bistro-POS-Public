# Mejoras al Flujo de Escaneo de Lista — 2026-06-02

## Resumen

Serie de mejoras a `PhotoOrderScreen` y flujos relacionados para optimizar la experiencia de escaneo de listas en móvil.

---

## Cambios Implementados

### 1. Fix: Nicknames no se sincronizaban en tiempo real

**Problema:** Al guardar un apodo desde la pantalla de escaneo, el siguiente escaneo no lo reconocía porque el array `products` en `App.tsx` no se actualizaba con el nuevo nickname.

**Causa raíz:** El realtime handler de UPDATE en `App.tsx` solo sincronizaba `stock`, `price`, `name` e `image`, ignorando `nicknames`.

**Solución:** Se agregó `nicknames: (newRecord as any).nicknames || p.nicknames` al handler de realtime UPDATE.

**Archivos:** `App.tsx` (realtime subscription)

---

### 2. Navegación post-venta: volver al escáner

**Problema:** Después de finalizar una venta originada desde el escáner, "Nueva Venta" llevaba a la pantalla de Vender en vez del escáner.

**Solución:**
- Nuevo valor `'scanner'` en el tipo `saleOrigin` (propagado a `MenuScreen`, `PaymentScreen`, `SuccessScreen`, `PaymentSidebar`).
- `handlePhotoOrderAdd` establece `setSaleOrigin('scanner')`.
- `handleStartNewSale` detecta `saleOrigin === 'scanner'` y navega a `Screen.PHOTO_ORDER`.

**Archivos:** `App.tsx`, `types.ts` (SellTab ya existía), `MenuScreen.tsx`, `PaymentScreen.tsx`, `SuccessScreen.tsx`, `PaymentSidebar.tsx`

---

### 3. Recorte de imagen antes del escaneo

**Problema:** Al tomar una foto, el OCR procesaba toda la imagen incluyendo áreas irrelevantes.

**Solución:** Se agregó un paso intermedio de recorte usando el componente `ImageCropper` existente con:
- `showRemoveBg={false}` — oculta la funcionalidad de eliminar fondo.
- `restrictPosition={true}` — nuevo prop que fuerza `minZoom=1` y evita que la imagen se salga del área visible.
- Aspect ratio dinámico calculado de las dimensiones reales de la imagen.

**Archivos:** `PhotoOrderScreen.tsx`, `ImageCropper.tsx` (nuevos props: `showRemoveBg`, `restrictPosition`)

---

### 4. Vista compacta de resultados

**Problema:** Cada producto ocupaba demasiado espacio vertical en la lista de resultados, requiriendo mucho scroll.

**Solución:** Rediseño a filas compactas colapsables:
- **Matched (colapsado):** `cantidad | nombre | precio | ↓` en una sola línea.
- **Matched (expandido):** checkbox, controles +/-, texto "Escaneado: ...", badge de confianza.
- **Unmatched sin asignar:** expandido por defecto con buscador.
- **Unmatched asignado:** fila compacta como matched, expandible para cambiar/eliminar/guardar apodo.
- Botón para ocultar/mostrar todos los no reconocidos como grupo.

**Archivos:** `PhotoOrderScreen.tsx`

---

### 5. Formato visual de cantidades y precios

- **Cantidades:** Máximo 1 decimal visual (`1.3` en vez de `1.345`). Helper `formatQty()`.
- **Precios:** Sin decimales, truncados al entero (`$3,362` en vez de `$3,362.5`). Helper `formatPrice()`.
- Los cálculos internos no cambian.

**Archivos:** `PhotoOrderScreen.tsx`

---

### 6. Dropdown de sugerencias diferenciado

**Problema:** La lista de sugerencias de productos se confundía visualmente con la lista de fondo.

**Solución:** Borde `border-2 border-amber-300` y sombra `shadow-[0_-4px_20px_rgba(0,0,0,0.15)]` para distinguirlo claramente.

**Archivos:** `PhotoOrderScreen.tsx`

---

### 7. Botón "Procesar Pago" + advertencia de no reconocidos

- Renombrado de "Agregar al Carrito" → "Procesar Pago (N)".
- Si hay productos sin asignar, muestra modal con nombres en badges y opciones "Cancelar" / "Continuar".

**Archivos:** `PhotoOrderScreen.tsx`

---

### 8. Navegación "atrás" desde PaymentScreen al escáner

**Problema:** La flecha atrás en PaymentScreen llevaba a "Vender" en vez de la lista escaneada.

**Solución:** `backScreen` ahora es `Screen.PHOTO_ORDER` cuando `saleOrigin === 'scanner'`.

**Archivos:** `PaymentScreen.tsx`

---

### 9. Persistencia del estado durante el pago

**Problema:** Al navegar de PhotoOrderScreen a PaymentScreen, el componente se desmontaba perdiendo toda la lista escaneada.

**Solución:**
- `PhotoOrderScreen` se mantiene montado (hidden) mientras `saleOrigin === 'scanner'` y la pantalla es PAYMENT o SUCCESS.
- Al finalizar la venta, `handleStartNewSale` incrementa `photoOrderKey` forzando un remontaje limpio.

**Archivos:** `App.tsx`

---

### 10. Término "OCR" reemplazado

- Todas las referencias a "OCR" en la UI fueron reemplazadas por "Escaneado" (término menos técnico para el usuario final).

**Archivos:** `PhotoOrderScreen.tsx`

---

## Archivos Modificados (resumen)

| Archivo | Tipo de cambio |
|---|---|
| `App.tsx` | Realtime nicknames, saleOrigin 'scanner', photoOrderKey, persistencia de montaje |
| `screens/PhotoOrderScreen.tsx` | Crop, vista compacta, formateo, modal warning, navegación |
| `screens/PaymentScreen.tsx` | backScreen para scanner |
| `screens/MenuScreen.tsx` | Tipo saleOrigin |
| `screens/SuccessScreen.tsx` | Tipo saleOrigin |
| `components/PaymentSidebar.tsx` | Tipo saleOrigin |
| `components/ImageCropper.tsx` | Props `showRemoveBg`, `restrictPosition` |
