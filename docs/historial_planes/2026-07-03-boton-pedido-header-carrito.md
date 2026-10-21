# Botón "Pedido" en el header del carrito

Fecha: 2026-07-03
Alcance: `MenuScreen.tsx` (desktop) + `PaymentScreen.tsx` (móvil/tablet) + integración con el flujo existente de `ComandaLabelModal`.

## Problema

El `ComandaLabelModal` solo se dispara al final de la venta, en `SuccessScreen`/`SuccessSidebar`, al tocar una tarjeta del `ComandaTargetGrid`. Esto obliga al cajero a etiquetar la comanda **después** de cobrar, lo cual:
- Interrumpe el flujo de envío (aparece un modal justo cuando quiere imprimir).
- No permite adelantar la información mientras se arma la orden (por ejemplo, ya sabe que el cliente pidió "Domicilio" desde antes).

## Solución

Un botón **"Pedido"** que aparece en el header del carrito, al lado del badge "Orden Rápida"/"Mesa X". Al tocarlo, abre el `ComandaLabelModal` para etiquetar la comanda cuando le convenga al cajero.

### Comportamiento

- **Sin selección**: el botón muestra `🍽️ Pedido`.
- **Con selección**: muestra el resumen truncado, ej. `🍽️ Loc 3 · Mesa 5 · Domicilio`. Fondo amarillo tenue (`bg-primary/15`).
- Al confirmar en el modal, la selección persiste en `App.tsx` durante toda la venta.
- Al llegar a Success con etiquetas ya elegidas, tocar una tarjeta del `ComandaTargetGrid` envía la comanda directo (sin volver a abrir el modal). Si no hay etiquetas del header, el modal aparece en Success como fallback (comportamiento previo).

### Limpieza del estado

Se limpia al:
- **Iniciar nueva venta** (`handleStartNewSale`): las etiquetas son del pedido anterior.
- **Vaciar el carrito** (`handleClearCart`): se descarta la selección junto con el resto.

**No se limpia** al pasar por `handleProcessPayment` porque `SuccessScreen`/`SuccessSidebar` la necesitan para enviar la comanda con las etiquetas. El limpieza al `handleStartNewSale` cubre el ciclo completo.

### Visibilidad

Solo aparece si:
1. `isCatalogMode === true` (fuera del Modo Catálogo la comanda no aplica).
2. `businesses.comanda_label_shortcut_enabled === true` (preferencia del negocio, ver siguiente sección).

### Preferencia del negocio en Ajustes

Se agrega un segundo toggle en el panel `SalesModeSettingsPanel` (Sidebar → Ajustes → "Activar/Desactivar"), bajo el toggle del Modo Catálogo:

> **Botón "Pedido" en el carrito**  
> Activado: el cajero puede etiquetar la comanda desde el header del carrito.  
> Desactivado: las etiquetas solo se piden al enviar la comanda en la pantalla de éxito.

- El toggle está atenuado y no clickeable si el Modo Catálogo está desactivado (dependencia).
- Solo el dueño del negocio puede modificarlo (RLS de `businesses` mantiene el `owner_id = auth.uid()`).
- Por defecto está en `true` para no romper la UX de negocios existentes.

## Cambios técnicos

### Base de datos

Migración `20260703_add_comanda_label_shortcut_enabled.sql`:
- `alter table public.businesses add column comanda_label_shortcut_enabled boolean not null default true`.

### Frontend nuevo

- **`components/ComandaLabelHeaderButton.tsx`**: píldora reutilizable que renderiza el botón en el header del carrito. Recibe `selection`, `onChange`, `enabled`, `isCatalogMode` y `compact`. Encapsula el estado local del modal.

### Frontend modificado

- **`context/BusinessSettingsContext.tsx`**: agrega `isComandaLabelShortcutEnabled` + `setComandaLabelShortcutEnabled` con propagación por realtime.
- **`components/SalesModeSettingsPanel.tsx`**: nuevo toggle bajo el del Modo Catálogo, con dependencia visual (`disabled` cuando no está el modo activo).
- **`components/ComandaLabelModal.tsx`**: nueva prop opcional `initialSelection` para precargar valores cuando se abre desde el header del carrito (edición).
- **`screens/MenuScreen.tsx`**: importa `ComandaLabelHeaderButton` y lo renderiza al lado del `TableSelectorControl`. Nuevas props `comandaLabelSelection` + `onComandaLabelSelectionChange`. Pasa `preselectedComandaLabels` al `<SuccessSidebar>`.
- **`screens/PaymentScreen.tsx`** (`renderMobileSummary`): renderiza el botón en variante `compact` al lado del badge de Orden Rápida.
- **`screens/SellScreen.tsx`**: propaga las nuevas props a los dos `<MenuScreen>` internos (orden_rapida y mesa_activa).
- **`screens/SuccessScreen.tsx`** y **`components/SuccessSidebar.tsx`**: nueva prop `preselectedComandaLabels`. Refactor `executeCommand` para reutilizar la lógica entre "envío directo con etiquetas del header" y "envío desde modal". Si hay preselección, se salta el modal.
- **`App.tsx`**:
  - Nuevo state `comandaLabelSelection`.
  - Pasa la selección + setter a `MenuScreen`, `PaymentScreen`, `SellScreen`, `SuccessScreen`.
  - Limpia el state en `handleStartNewSale` y `handleClearCart`.

## Decisiones clave (respuestas del usuario)

- **1** (flujo condicional): B → si el cajero ya usó el botón del header, no se abre el modal en Success. Si no lo usó, se abre como fallback.
- **2** (modo): A → solo aparece en Modo Catálogo.
- **3** (estilo del botón): B → píldora con resumen. Nombre "Pedido" para el estado vacío.
- **4** (limpieza): D → al nueva venta + vaciar carrito. No al procesar pago (se necesita en Success).
- **5** (ubicación del toggle): A → dentro del panel "Activar/Desactivar" del sidebar.
- **6** (persistencia): A → columna nueva `businesses.comanda_label_shortcut_enabled`.

## Archivos tocados

- `supabase/migrations/20260703_add_comanda_label_shortcut_enabled.sql` (nuevo, aplicado en remoto)
- `components/ComandaLabelHeaderButton.tsx` (nuevo)
- `components/ComandaLabelModal.tsx` (soporte `initialSelection`)
- `components/SalesModeSettingsPanel.tsx` (segundo toggle)
- `context/BusinessSettingsContext.tsx` (`isComandaLabelShortcutEnabled`)
- `screens/MenuScreen.tsx` (botón en el header)
- `screens/PaymentScreen.tsx` (botón compact en el header móvil)
- `screens/SellScreen.tsx` (propagación de props)
- `screens/SuccessScreen.tsx` (salto de modal + refactor `executeCommand`)
- `components/SuccessSidebar.tsx` (salto de modal + refactor `executeCommand`)
- `App.tsx` (estado elevado + limpieza)
- `docs/caracteristicas/comandas_cocina.md` (secciones de "Dos puntos de acceso")
