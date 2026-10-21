# Comprobante Público (Link compartido por WhatsApp)

Componente: `screens/PublicReceiptScreen.tsx`
RPC backend: `get_public_receipt` (Supabase)
Ruta: `/t/<order_number>-<hash>`

Página web pública (sin login) que muestra el comprobante de una venta. El cliente la abre desde un link que el negocio comparte por WhatsApp. Incluye un botón para descargar el comprobante en PDF (reutiliza `ReceiptThermalPDF`).

---

## Cómo se carga

1. La URL tiene el formato `/t/<order_number>-<hash>`, donde `hash` son los primeros 6 caracteres del `id` de la orden.
2. `PublicReceiptScreen` extrae `order_number` y `hash` y llama al RPC `get_public_receipt(p_order_number, p_hash)`.
3. El RPC valida que `LEFT(o.id::text, 6) = LOWER(p_hash)` y que la orden esté `completed`. Si no coincide, devuelve `NULL` (link inválido/expirado).

> El hash evita que alguien adivine comprobantes iterando números de orden: necesita también los 6 chars del UUID.

---

## Datos que devuelve el RPC

`get_public_receipt` arma un JSON con los datos del negocio, la orden, los totales y el array `items`. Cada item incluye:

| Campo | Origen |
|---|---|
| `product_name`, `quantity`, `unit_price`, `total_price` | `order_items` |
| `discount`, `discount_percent` | `order_items` |
| `sale_unit` | `COALESCE(products.unit, 'Unidad')` |
| `notes`, `cooking_term`, `removed_ingredients` | `order_items` |

> Los campos `notes`, `cooking_term` y `removed_ingredients` se agregaron el 2026-06-04 (migración `supabase/migrations/20260604_update_public_receipt_rpc.sql`) para poder mostrar las modificaciones de cada producto. Fue un cambio aditivo: el resto del RPC quedó igual.

---

## Render de los items

La página replica la misma lógica visual que el ticket de venta, con una diferencia: **sí muestra las modificaciones**.

- **Productos por unidad sin modificaciones**: se consolidan en una sola fila. Ej. 2 aceites iguales → `Aceite (litro) — 2 un × $17.000`.
- **Productos con modificaciones** (notas, término de cocción, ingredientes removidos) o **por peso/medida**: se muestran como filas individuales.
- Las modificaciones aparecen como etiquetas debajo del nombre:
  - Término de cocción → etiqueta naranja (ej. "SIN SAL")
  - Ingredientes removidos → etiquetas rojas (ej. "Sin cebolla")
  - Notas → texto en cursiva teal entre comillas

La consolidación es local al componente (no usa `consolidateReceiptItems` porque los datos vienen con nombres de campo de BD: `product_name`, `sale_unit`, etc.), pero sigue las mismas reglas: agrupa por nombre + precio + descuento, solo para productos por unidad.

---

## Relación con el resto del sistema

- El **ticket de venta impreso** (térmica/PDF) consolida todo y no muestra modificaciones. Ver [`impresion_termica_qz.md`](./impresion_termica_qz.md).
- Las **comandas de cocina** muestran cada fila con sus modificaciones. Ver [`comandas_cocina.md`](./comandas_cocina.md).
- Las filas individuales se originan en el modo Catálogo. Ver [`modo_catalogo_pos.md`](./modo_catalogo_pos.md).

---

## Archivos involucrados

| Archivo | Rol |
|---|---|
| `screens/PublicReceiptScreen.tsx` | Página pública: fetch del RPC, consolidación + render de modificaciones, descarga PDF |
| `components/ReceiptThermalPDF.tsx` | PDF que se descarga desde la página |
| RPC `get_public_receipt` | Devuelve los datos del comprobante (incl. modificaciones) |
| `supabase/migrations/20260604_update_public_receipt_rpc.sql` | Migración que agregó los campos de modificaciones al RPC |
