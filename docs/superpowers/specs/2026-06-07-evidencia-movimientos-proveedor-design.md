# Evidencia fotográfica en movimientos de proveedor + compartir por WhatsApp

**Fecha:** 2026-06-07
**Módulos afectados:** `ExpenseModal` y subcomponentes (`InventoryPurchase`, `ExpenseRegister`), `DebtsScreen`, `QuickTransactionModal`, hooks `useDebts`/`useExpenses`.

---

## 1. Objetivo

Permitir adjuntar **una imagen de evidencia** (factura, remisión, comprobante de pago) a cada movimiento de proveedor —compras de inventario, gastos y abonos, tanto a crédito como de contado— para evitar inconvenientes con el proveedor. Las evidencias se guardan por negocio, comprimidas, y son consultables y **compartibles por WhatsApp** desde el historial de movimientos del proveedor.

---

## 2. Decisiones cerradas (de la fase de brainstorming)

| Tema | Decisión |
|---|---|
| Transacciones con evidencia | Compra inventario (crédito/contado), gasto (crédito/contado), abono a proveedor |
| Cantidad de imágenes | **Una sola** por movimiento |
| Contenido al compartir | La imagen de evidencia + un texto (caption) con los datos del movimiento |
| Privacidad del bucket | **Público** (igual que `product-images`) |
| Acciones en el historial | Ver, **agregar**, **reemplazar** y **borrar** la evidencia |
| Ubicación del botón WhatsApp | Dentro del **visor** de la evidencia |
| Proveedor | **Obligatorio en todos los flujos** (crédito y contado). Se elimina el "Proveedor de Contado" automático |
| Gasto de contado | Genera **también** una fila de movimiento del proveedor (badge "Contado"), además de su registro en `expenses` |

---

## 3. Modelo de datos

### 3.1 `business_debts` — nueva columna
```sql
alter table business_debts add column evidence_url text;
```
Es el almacén unificado de "movimientos de proveedor": cubre compras crédito/contado (filas ya existentes) y abonos (filas con `total_amount = 0`). La evidencia vive aquí.

### 3.2 `expenses` — reutilizar columna existente
La tabla `expenses` **ya tiene** `receipt_url text` (sin uso actual). Un gasto guardará la misma URL ahí (espejo) para futura consulta desde Gastos → Historial; pero la fuente de verdad para ver/compartir en movimientos del proveedor es `business_debts.evidence_url`.

### 3.3 Storage
Bucket nuevo **público** `debt-evidence`, con la misma estructura por negocio que `product-images`: ruta `${business_id}/${timestamp}-${rand}.webp`. Políticas RLS espejo de las de `product-images` (lectura pública; insert/update/delete para usuarios autenticados de su propio `business_id`).

---

## 4. Compresión y subida (reuso)

Se reutiliza **`useImageUpload`** con `bucketName = 'debt-evidence'`. Ya provee: recorte (`ImageCropper`), cámara in-app (`InAppCamera`), galería, compresión a WebP máx. 800px, ruta por negocio y limpieza de huérfanos (`markAsSaved`/cleanup en unmount). Es el mismo flujo de `SimpleProductScreen`.

**Patrón de integración (enfoque A aprobado):** el componente de formulario (padre) **posee** la instancia `useImageUpload('debt-evidence')` para poder llamar `markAsSaved()` tras el `INSERT`/`UPDATE` exitoso. Le pasa los props a un componente **presentacional** `<EvidenceUploader>`.

---

## 5. Componentes nuevos

### 5.1 `components/EvidenceUploader.tsx` (presentacional)
Mini-componente reutilizable: miniatura + botones Cámara/Galería (y Pegar en desktop) + spinner de estado + acciones Cambiar/Borrar cuando ya hay imagen. Renderiza internamente `ImageCropper` e `InAppCamera` usando los props del hook que recibe del padre, para no ensuciar cada formulario.

**Props (subconjunto del resultado de `useImageUpload`):**
`previewUrl, uploading, statusText, showCropper, cropperImageSrc, onCropComplete, onCropCancel, showInAppCamera, onCameraCapture, onCameraClose, triggerCamera, triggerGallery, handlePasteClick, deleteImage`, más `label?` y `compact?` (variante reducida para el modal de abono).

### 5.2 `components/EvidenceViewer.tsx`
Modal de pantalla completa que muestra la imagen del movimiento y su contexto (proveedor, tipo, monto, fecha). Acciones: **Reemplazar**, **Borrar**, **Compartir por WhatsApp**. Reemplazar/Borrar/Agregar usan `useImageUpload('debt-evidence')` + `updateDebtEvidence`.

**Props:** `debt` (movimiento), `supplierName`, `businessName`, `onClose`, `onEvidenceChange(debtId, url|null)`.

### 5.3 `lib/shareEvidence.ts`
Util que comparte la imagen de evidencia. Clona el patrón de [`lib/shareTransactionHistory.ts`](../../../lib/shareTransactionHistory.ts):
- Descarga la imagen pública a un `Blob`/`File`.
- **Móvil:** `navigator.share({ files:[file], text: caption })`.
- **Desktop:** copia la imagen al portapapeles y abre `whatsapp://` (fallback: descarga).
- **Caption:** `Comprobante · {proveedor} | {tipoLabel} ${monto} | {fecha} — {nombreNegocio}`.

---

## 6. Cambios en hooks

### 6.1 `useDebts.ts`
- Tipo `BusinessDebt`: agregar `evidence_url?: string | null`.
- `createDebt`: aceptar `evidence_url?` e incluirlo en el `insert`.
- `addCreditorPayment`: aceptar `evidenceUrl?` y guardarlo en la fila de abono que se inserta (y en el `fakePaymentRecord` de la rama offline).
- Nuevo `updateDebtEvidence(debtId, url | null)`: `update({ evidence_url })` en `business_debts` + `fetchDebts()`. Para agregar/reemplazar/borrar desde el visor.

### 6.2 `useExpenses.ts`
- En `addExpense`, agregar `receipt_url: data.receipt_url || null` al `expenseData` del `insert` en `expenses`.

---

## 7. Cableado por flujo

### 7.1 `InventoryPurchase.tsx`
- **Proveedor obligatorio** también en contado: quitar el default "Proveedor de Contado"; bloquear guardado si no hay proveedor.
- Instanciar `useImageUpload('debt-evidence')`; renderizar `<EvidenceUploader>` antes del botón de confirmar.
- En `handleSave`: pasar `evidence_url: imageUrl` a **cada** `createDebt` de la compra (crédito y contado comparten la misma factura → misma URL en todas las filas del lote). Llamar `markAsSaved()` tras éxito.
- Rama offline: incluir `evidenceUrl` en el payload encolado (se aplica al sincronizar; ver §9).

### 7.2 `ExpenseRegister.tsx`
- **Proveedor obligatorio** en crédito y contado.
- Instanciar `useImageUpload('debt-evidence')`; renderizar `<EvidenceUploader>`.
- `handleSave`:
  - **Crédito:** `createDebt({... evidence_url: imageUrl})` (ya existe la rama; añadir el campo).
  - **Contado:** crear **nueva** fila `business_debts` (`type:'supplier'`, `creditor_name`, `description:'Gasto de contado: {CAT} - {desc}'`, `total_amount = paid_amount = monto`, `status:'paid'`, `evidence_url`). Esto la hace aparecer como movimiento "Contado" del proveedor.
  - Siempre: pasar `receipt_url: imageUrl` en el payload de `onSave` (→ `expenses`).
  - `markAsSaved()` tras éxito.

### 7.3 `DebtsScreen.tsx`
- **Modal "Registrar Abono":** instanciar `useImageUpload('debt-evidence')` + `<EvidenceUploader compact>`. `handleAddPayment` pasa `evidenceUrl` a `addCreditorPayment`; `markAsSaved()` tras éxito.
- **Filas del historial de movimientos:** si `debt.evidence_url` → miniatura clicable (abre `EvidenceViewer`); si no → botón `📎+` "Adjuntar" que abre un flujo de subida y llama `updateDebtEvidence`.
- Montar `<EvidenceViewer>` cuando se selecciona un movimiento; su `onEvidenceChange` refresca vía `updateDebtEvidence`.

### 7.4 `QuickTransactionModal.tsx` (abono móvil)
- Mismo patrón que el modal de abono de `DebtsScreen`: `<EvidenceUploader compact>` + `evidenceUrl` hacia `addCreditorPayment`.

---

## 8. Detección de tipo en el historial (sin cambios de lógica)

La fila ya deduce el badge:
- `isPaymentRecord = total_amount === 0 && paid_amount > 0` → **Abono**.
- `isCashPurchase = status === 'paid' && paid_amount >= total_amount && total_amount > 0` → **Contado**.
- resto → **Crédito**.

El gasto de contado entra como **Contado** (total = paid, status paid). No infla `totalPending` (saldo 0), por lo que no hay doble conteo en el Dashboard.

---

## 9. Offline

- Compras/gastos: el `evidenceUrl` (URL pública ya subida) viaja en el payload de `offlineQueue`; al sincronizar se escribe en `business_debts.evidence_url` / `expenses.receipt_url`. La subida de la imagen en sí requiere conexión (igual que hoy `useImageUpload` exige red para subir); si está offline al adjuntar, se omite la evidencia con aviso.
- Abono offline: incluir `evidenceUrl` en el `fakePaymentRecord` y en el payload de `supplier_payment`.

---

## 10. Fuera de alcance (YAGNI)

- Múltiples imágenes por movimiento.
- OCR/escaneo de la evidencia (es solo archivo adjunto).
- Visor/edición de evidencia desde la pestaña Gastos → Historial (se guarda `receipt_url`, pero el visor vive en movimientos del proveedor).
- Generar una tarjeta-comprobante compuesta: se comparte la imagen tal cual + caption.

---

## 11. Criterios de aceptación

1. Al registrar compra/gasto (crédito o contado) puedo adjuntar 1 foto que se comprime y sube a `debt-evidence/${business_id}/`.
2. No puedo guardar ningún flujo sin proveedor.
3. Al abonar (DebtsScreen y modal móvil) puedo adjuntar evidencia y queda en la fila del abono.
4. En el historial del proveedor, los movimientos con evidencia muestran miniatura; sin evidencia muestran "Adjuntar".
5. El visor permite ver, reemplazar, borrar y compartir por WhatsApp (imagen + caption).
6. El gasto de contado aparece como movimiento "Contado" del proveedor con su evidencia.
7. Si descarto el formulario sin guardar, la imagen subida se limpia (huérfanos).
