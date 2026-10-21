# Tipo de pedido como lista editable + visibilidad de pestañas por negocio

Fecha: 2026-07-02
Alcance: `ComandaLabelModal` — tercera pestaña editable + panel de visibilidad.

## Problema

La pestaña "Para llevar" era un toggle boolean sin lista propia. Cocina solo veía `** PARA LLEVAR **` en la comanda. Para negocios con distintos tipos de pedido (para llevar, domicilio, pickup, etc.) no había forma de diferenciar.

Además, no todos los negocios usan las 3 pestañas: los mostradores rápidos usan solo Localizador; un restaurante formal usa solo Mesas + Tipo de pedido. Sin una forma de ocultar pestañas, la UI mostraba opciones irrelevantes.

## Solución

### 1. "Tipo de pedido" como lista editable

- La pestaña se renombra **"Para llevar" → "Tipo de pedido"**.
- Deja de ser toggle: ahora es grid de píldoras seleccionables (mismo componente que Locator/Mesa) con modo "Editar lista" para agregar, renombrar y eliminar valores.
- Se comparte con el resto de pestañas la lógica del hook `useComandaLabels`.
- Selección única dentro de la pestaña, combinable con las otras dos (Loc 3 + Mesa 5 + Domicilio se pueden marcar juntos).

### 2. Panel de visibilidad de pestañas

- Nuevo ícono de tuerca (`settings`) en el header del modal, al lado del `×`.
- Al tocarlo abre un popover con 3 switches: Localizador, Mesas, Tipo de pedido.
- La preferencia se persiste en Supabase (compartida por negocio, no por dispositivo).
- Cualquier miembro del negocio puede modificarla (sin filtro por rol) — es preferencia de UI, no data sensible.
- Restricción: al menos una pestaña siempre queda visible (no se pueden ocultar las 3).

### 3. Impresión

El ticket ESC/POS ahora imprime el valor elegido (con asteriscos para conservar prominencia visual):

```
LOCALIZADOR: 2          Orden: 1661
MESA: 4                 Hora: 07:26 p. m.
** Domicilio **         Cajero: Alejandro
```

## Cambios técnicos

### Base de datos

- Migración `20260702_comanda_labels_takeaway_and_visibility.sql`:
  - Amplía CHECK: `kind IN ('locator','table','takeaway')`.
  - Nueva tabla `public.comanda_labels_visibility` (business_id PK, 3 booleans, timestamps).
  - RLS abierto a cualquier miembro del negocio (SELECT/INSERT/UPDATE sin filtro por rol).
  - Backfill: se inserta `takeaway` = `Para llevar` y `Domicilio` para los 3 negocios existentes (10000, 10001, 10002).

### Frontend nuevo

- **`hooks/useComandaLabelsVisibility.ts`**: CRUD contra `comanda_labels_visibility` + caché localStorage + restricción "al menos una visible".

### Frontend modificado

- **`hooks/useComandaLabels.ts`**:
  - `ComandaLabelKind` amplía a `'locator' | 'table' | 'takeaway'`.
  - Retorna `takeaways: ComandaLabel[]`.
  - `seedDefaults` incluye ahora `Para llevar` y `Domicilio` en `takeaway`.
  - `CACHE_VERSION` bump a `v3` para invalidar cachés viejos.
- **`components/ComandaLabelModal.tsx`**:
  - Renombre "Para llevar" → "Tipo de pedido".
  - Pestaña Tipo de pedido ahora usa el mismo grid + modo edición que Localizador/Mesa.
  - Nuevo estado `selectedTakeaway: string | undefined` (antes era `isTakeaway: boolean`).
  - `ComandaLabelSelection.takeaway` pasa de `boolean` a `string | undefined`.
  - Ícono de tuerca con popover de visibilidad (usa `useComandaLabelsVisibility`).
  - Filtra `visibleTabs` según la preferencia del negocio.
  - Si la pestaña activa se oculta, salta a la primera visible.
- **`lib/thermalPrinterService.ts`**:
  - `KitchenCommandData.takeaway: boolean` → `takeawayLabel: string`.
  - Header ESC/POS: imprime `** {takeawayLabel} **` (con asteriscos, para conservar la prominencia visual del antiguo `** PARA LLEVAR **`).
- **`screens/SuccessScreen.tsx`** y **`components/SuccessSidebar.tsx`**:
  - En `handleConfirmLabels`, pasan `takeawayLabel: selection.takeaway` en el `commandData`.

## Decisiones clave (respuestas del usuario)

- **Nombre**: "Tipo de pedido" (opción C: no "Entrega" ni "Para llevar").
- **Defaults sembrados**: `Para llevar` y `Domicilio` (opción B, 2 valores).
- **Formato de impresión**: `** valor **` con asteriscos (opción A).
- **Backfill**: los 3 negocios (opción A).
- **Combinación**: combinables entre pestañas (opción A, no excluyentes).
- **Persistencia de visibilidad**: Supabase por negocio, sin filtro por rol.

## Archivos tocados

- `supabase/migrations/20260702_comanda_labels_takeaway_and_visibility.sql` (nuevo, aplicado en remoto)
- `hooks/useComandaLabelsVisibility.ts` (nuevo)
- `hooks/useComandaLabels.ts` (agrega `takeaway`)
- `components/ComandaLabelModal.tsx` (tercera pestaña editable + tuerca)
- `lib/thermalPrinterService.ts` (interfaz + render)
- `screens/SuccessScreen.tsx` (pasa `takeawayLabel`)
- `components/SuccessSidebar.tsx` (pasa `takeawayLabel`)
- `docs/caracteristicas/comandas_cocina.md` (documentación actualizada)
