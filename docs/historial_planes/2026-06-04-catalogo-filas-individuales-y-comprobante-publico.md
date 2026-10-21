# Catálogo: filas individuales, ticket consolidado y modificaciones en comprobante público — 2026-06-04

## Resumen

Conjunto de mejoras al modo Catálogo del POS y al comprobante de venta. El objetivo fue:

1. Limpiar visualmente las tarjetas del catálogo (placeholder cuando no hay imagen, ocultar stock, quitar el botón de modificador de la tarjeta).
2. Que cada "+" desde una tarjeta cree una **fila independiente** en el carrito (para poder modificar cada unidad por separado), accediendo al modificador desde el carrito.
3. Que esas filas individuales **no afecten el ticket de venta impreso**: en el ticket se consolidan en una sola fila por producto.
4. Que la **página pública del comprobante** (link compartido por WhatsApp) muestre las modificaciones de cada producto.

Restricción respetada: las **comandas de cocina** siguen mostrando cada fila individual con sus modificaciones (no se tocaron).

---

## Cambios Implementados

### 1. Placeholder de imagen en tarjetas del catálogo

**Problema:** Si un producto no tenía imagen (o la URL fallaba), la tarjeta mostraba el ícono de imagen rota del navegador.

**Solución:** Render condicional. Si no hay imagen o falla (`onError`), se muestra un placeholder limpio con el ícono `restaurant` en gris sobre el fondo de la tarjeta. Aplicado en las 4 vistas: grid mobile y desktop de `MenuScreen`, y variantes mobile/desktop de `ProductCard`.

**Archivos:** `screens/MenuScreen.tsx`, `components/ProductCard.tsx`

---

### 2. Ocultar el stock en las tarjetas del catálogo

**Solución:** Se eliminó el badge de stock (cantidad / "Agotado") de las tarjetas en el grid mobile y desktop de `MenuScreen`, y el indicador `×stock` junto al precio en `ProductCard` (variante mobile).

**Archivos:** `screens/MenuScreen.tsx`, `components/ProductCard.tsx`

---

### 3. Modificador accesible desde el carrito (no desde la tarjeta)

**Problema:** El botón de modificador/opciones estaba en la esquina de la imagen de cada tarjeta.

**Solución:** Se quitó ese botón de las tarjetas. El modificador ahora se accede desde el carrito: al expandir un `CartItemRow` aparece el botón "Modificador" (antes de "Descuento"). Se conectó la prop `onEditProduct` al `CartItemRow` en `MenuScreen` para que el botón funcione sobre el item individual.

**Archivos:** `screens/MenuScreen.tsx`, `components/ProductCard.tsx`, `components/CartItemRow.tsx` (ya tenía el botón)

---

### 4. Cada "+" crea una fila individual en el carrito

**Problema:** Presionar "+" en una tarjeta acumulaba todo en una sola fila con cantidad N. No se podía modificar cada unidad por separado.

**Causa raíz:** `handleAddToOrder` (en `App.tsx`) tiene lógica de *merge*: busca un item con la misma configuración y suma cantidad, tanto en local como en BD (`addItemToOrder`).

**Solución:** Nueva función `handleQuickAddIndividual` en `App.tsx` que **siempre crea una fila nueva** (qty=1), sin merge, en los tres modos (mesa/DB, edición, local). En modo mesa inserta el `order_item` directamente saltando la lógica de fusión; en edición usa `forceSplit: true`. Se pasa como prop `onQuickAddIndividual` a través de `SellScreen` → `MenuScreen`, y `handleMobileQuantityChange` la usa al incrementar.

**Archivos:** `App.tsx`, `screens/SellScreen.tsx`, `screens/MenuScreen.tsx`

---

### 5. Ticket de venta: consolidar filas del mismo producto

**Problema:** Como ahora cada unidad es una fila, el ticket de venta impreso mostraría N filas repetidas del mismo producto.

**Solución:** Nuevo helper `lib/receiptUtils.ts` con `consolidateReceiptItems()`. Reglas:
- Solo consolida productos **por unidad** (`unit` vacío, `'Unidad'` o `'Und'`). Los productos por **peso/medida** (Libras, Kilogramos, etc.) nunca se fusionan.
- Para productos por unidad, agrupa por nombre + precio unitario + descuento, **ignorando las modificaciones** (el ticket no las muestra y no afectan el precio).
- El campo `total` se **suma** por fila (no se recalcula como precio × cantidad) para preservar el redondeo y que el total siga cuadrando con lo cobrado.

Se aplica solo en los puntos del ticket de venta: `printReceiptDirect` (térmica ESC/POS), `ReceiptThermalPDF` (PDF), y el texto del comprobante por WhatsApp en `SuccessSidebar`.

**Ejemplo:** 3 ensaladas con modificaciones distintas a $10.000 → en el ticket aparecen como 1 fila "Ensalada x3 = $30.000". En carrito y comanda siguen como 3 filas individuales.

**Archivos:** `lib/receiptUtils.ts` (nuevo), `lib/thermalPrinterService.ts`, `components/ReceiptThermalPDF.tsx`, `components/SuccessSidebar.tsx`

---

### 6. Página pública del comprobante: mostrar modificaciones + consolidar

**Problema:** La página pública del comprobante (link `/t/<order>-<hash>` compartido por WhatsApp) no mostraba las modificaciones de los productos, y listaba cada fila por separado.

**Solución (backend):** Se actualizó el RPC `get_public_receipt` en Supabase para que el bloque `items` devuelva también `notes`, `cooking_term` y `removed_ingredients`. Cambio **aditivo**: el resto del RPC (filtro de hash, `status='completed'`, join de cliente, `sale_unit` desde producto) quedó idéntico.

**Solución (frontend):** En `PublicReceiptScreen`:
- La interfaz de items acepta los 3 campos nuevos.
- Items por unidad **sin** modificaciones se consolidan (ej. 2 aceites iguales → 1 fila "2 un × $17.000").
- Items **con** modificaciones (o no-unidad) se muestran individualmente, con etiquetas: término de cocción (naranja), "Sin X" (rojo), notas (cursiva teal).

**Archivos:** `screens/PublicReceiptScreen.tsx`, RPC `get_public_receipt` (migración `supabase/migrations/20260604_update_public_receipt_rpc.sql`)

---

### 7. Fix: project-ref de Supabase apuntaba al proyecto equivocado

**Problema:** Las consultas MCP a Supabase daban timeout. El archivo `supabase/.temp/project-ref` contenía `xgdlaeigktfsitziiyek`, pero el proyecto activo del usuario es `hjjmwipqquynjopkswvu` ("pos2").

**Solución:** Se corrigió `supabase/.temp/project-ref` al ID correcto.

**Archivos:** `supabase/.temp/project-ref`

---

## Documentación Actualizada

- `docs/caracteristicas/modo_catalogo_pos.md` — placeholder de imagen, sin stock, modificador desde carrito, filas individuales por "+".
- `docs/caracteristicas/comprobante_publico_whatsapp.md` — nuevo: estructura del RPC y render de la página pública con modificaciones.
- `docs/caracteristicas/impresion_termica_qz.md` — consolidación de filas en el ticket de venta.

---

## Verificación

- `npm run build`: exit code 0 (las advertencias de tamaño de chunk y de import dinámico/estático son preexistentes).
- `getDiagnostics` limpio en todos los archivos modificados.
- RPC `get_public_receipt` verificado con órdenes reales (1470, 8): devuelve los campos de modificaciones correctamente.
