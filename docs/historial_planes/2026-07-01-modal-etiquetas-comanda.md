# Modal de etiquetas de comanda (Localizador / Mesa / Para llevar)

Fecha: 2026-07-01
Alcance: Solo modo Catálogo (SuccessScreen móvil + SuccessSidebar desktop).

## Problema

En modo Catálogo, al finalizar una venta el cajero puede enviar la comanda a cocina (impresora local o dispositivo remoto vía presence). Sin embargo, no había forma de indicar en la comanda:

- Qué **localizador** se le entregó al cliente (dispositivos vibradores/numerados que se usan para llamar al cliente cuando su pedido está listo).
- Si el cliente se sentó en alguna **mesa** libre (etiqueta de referencia, sin activar el flujo del sistema de mesas del POS).
- Si el pedido es **para llevar** (take-away/domicilio) para que cocina lo empaque distinto.

Sin esta info, el personal de cocina no sabe a dónde entregar el pedido.

## Solución

**Modal previo** entre pulsar una tarjeta del `ComandaTargetGrid` y el envío real. El modal tiene 3 pestañas combinables entre sí:

1. **Localizador** — grid de píldoras con 10 valores por defecto (`1..10`), editables/eliminables/agregables.
2. **Mesas** — mismo comportamiento que Localizador (10 por defecto, `1..10`).
3. **Para llevar** — toggle simple, sin lista.

Se pueden marcar las 3 al mismo tiempo (ej. Localizador 3 + Mesa 5 + Para llevar). Dentro de cada pestaña la selección es única.

Al confirmar, las etiquetas se imprimen en la parte superior del ticket ESC/POS, en dos columnas junto a la info de orden (para ahorrar papel):

```
                  *** COMANDA ***

LOCALIZADOR: 2          Orden: 1661
MESA: 4                 Hora: 07:26 p. m.
** PARA LLEVAR **       Cajero: Alejandro
================================================
```

## Cambios técnicos

### Base de datos

- **Nueva tabla** `public.comanda_labels` (migración `20260701_create_comanda_labels.sql`):
  - `id uuid pk, business_id uuid fk, kind text ('locator'|'table'), value text (1..20 chars), position int, timestamps`
  - `UNIQUE(business_id, kind, value)` para evitar duplicados y hacer seguros los upsert.
  - RLS: SELECT para miembros del negocio; INSERT/UPDATE/DELETE solo para Administrador y Cajero (patrón `expense_categories`).
  - Trigger `updated_at`.

### Frontend nuevo

- **`hooks/useComandaLabels.ts`** — CRUD + caché localStorage por negocio + seed idempotente. Constante `CACHE_VERSION` para invalidar caché ante cambios de defaults.
- **`components/ComandaLabelModal.tsx`** — modal con 3 pestañas, modo edición con `x`/`+`, indicador visual por pestaña (fondo amarillo tenue) cuando hay selección activa.

### Frontend modificado

- **`lib/thermalPrinterService.ts`**:
  - Nuevos campos opcionales en `KitchenCommandData`: `locatorLabel`, `tableLabel`, `takeaway`.
  - Refactor del header de `printKitchenCommandDirect`:
    - En **80mm con etiquetas del modal**: dos columnas de 24 chars (izquierda etiquetas, derecha info de orden).
    - En **58mm o sin etiquetas del modal**: layout vertical clásico.
    - Truncado con `.` final si un texto excede su columna.
    - Etiquetas del modal **sin bold ni altura x2** (mismo peso visual que los productos). Solo `Orden:` mantiene bold.
- **`screens/SuccessScreen.tsx`** y **`components/SuccessSidebar.tsx`**: intercalan el modal. Al tocar tarjeta local/remota se guarda `pendingTarget` y se abre el modal. El envío real ocurre en `handleConfirmLabels(selection)`.

## Decisiones clave

- **B - Combinables**: las 3 pestañas se pueden marcar simultáneamente, no son excluyentes.
- **B - Supabase**: se creó tabla dedicada en vez de reutilizar JSON en `business_settings` para tener RLS granular, `UNIQUE`, y facilitar consultas futuras.
- **B - Defaults numéricos** (`1..10`) sin prefijo, tras iteración inicial que probó `L1..L10`/`M1..M10`. Se limpiaron los seed viejos y se incrementó `CACHE_VERSION` a `v2`.
- **A - Modo edición** con botón "Editar lista" que convierte cada píldora en input editable con `x` para borrar. Al final aparece input con `+` para agregar.
- **Solo Success** — el `SendCommandaModal` del flujo Mesas queda intacto por decisión explícita del usuario.
- **Bold quitado** de las etiquetas del modal — se ven con el mismo peso que los productos para no dominar visualmente la comanda.
- **Dos columnas solo en 80mm** — en 58mm no cabe cómodamente y se prioriza legibilidad sobre ahorro.

## Alcance excluido (queda para después)

- Gestión de etiquetas desde una pantalla de Ajustes dedicada (por ahora solo se editan desde el propio modal).
- Edición offline de la lista (leer va con caché, escribir requiere red).
- Aplicar el modal también al `SendCommandaModal` del flujo Mesas.

## Archivos tocados

- `supabase/migrations/20260701_create_comanda_labels.sql` (nuevo, aplicado en remoto)
- `hooks/useComandaLabels.ts` (nuevo)
- `components/ComandaLabelModal.tsx` (nuevo)
- `lib/thermalPrinterService.ts` (interfaz + render header)
- `screens/SuccessScreen.tsx` (intercala modal)
- `components/SuccessSidebar.tsx` (intercala modal)
- `docs/caracteristicas/comandas_cocina.md` (sección "Etiquetado previo (modal)" + formato de comanda actualizado)
