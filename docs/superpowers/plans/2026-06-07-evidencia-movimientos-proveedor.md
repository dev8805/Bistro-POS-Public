# Evidencia en movimientos de proveedor + WhatsApp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adjuntar una imagen de evidencia (factura/comprobante) a cada movimiento de proveedor (compras crédito/contado, gastos crédito/contado, abonos), consultable y compartible por WhatsApp desde el historial del proveedor, con proveedor obligatorio en todos los flujos.

**Architecture:** La evidencia vive en `business_debts.evidence_url` (almacén unificado de movimientos) y en `expenses.receipt_url` (espejo). Se reutiliza `useImageUpload('debt-evidence')` (compresión WebP + cropper + cámara + limpieza de huérfanos, igual que SimpleProductScreen). Un componente presentacional `<EvidenceUploader>` se inserta en los formularios; un `<EvidenceViewer>` + util `shareEvidence()` manejan ver/compartir.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + Storage público), Tailwind. Sin framework de tests → verificación con `npx tsc --noEmit` (filtrando errores preexistentes) + prueba manual en `npm run dev`.

**Spec:** [docs/superpowers/specs/2026-06-07-evidencia-movimientos-proveedor-design.md](../specs/2026-06-07-evidencia-movimientos-proveedor-design.md)

**Convención de commits:** el usuario hace los commits él mismo. Cada "Checkpoint" indica un punto lógico para que el usuario commitee; no commitear automáticamente.

**Baseline de typecheck:** antes de empezar, correr `npx tsc --noEmit > tsc-baseline.txt 2>&1` para conocer los errores preexistentes y poder filtrarlos. La regla de verificación en cada tarea es: *no introducir errores nuevos respecto al baseline*.

---

## File Structure

| Archivo | Responsabilidad | Acción |
|---|---|---|
| Migración SQL + bucket | Columna `evidence_url`, bucket `debt-evidence` + RLS | Crear (vía MCP supabase) |
| `hooks/useDebts.ts` | `BusinessDebt.evidence_url`, `createDebt`, `addCreditorPayment`, `updateDebtEvidence` | Modificar |
| `hooks/useExpenses.ts` | Persistir `receipt_url` en `expenses` | Modificar |
| `components/EvidenceUploader.tsx` | UI presentacional de adjuntar (miniatura + cámara/galería + cropper) | Crear |
| `lib/shareEvidence.ts` | Compartir imagen + caption por WhatsApp | Crear |
| `components/EvidenceViewer.tsx` | Visor full + reemplazar/borrar/compartir | Crear |
| `components/expense/InventoryPurchase.tsx` | Proveedor obligatorio + uploader + evidence_url al guardar | Modificar |
| `components/expense/ExpenseRegister.tsx` | Proveedor obligatorio + uploader + fila contado + receipt_url | Modificar |
| `screens/DebtsScreen.tsx` | Uploader en abono + miniatura/adjuntar en filas + montar viewer | Modificar |
| `components/modals/QuickTransactionModal.tsx` | Uploader en abono móvil | Modificar |
| `hooks/useOfflineSync.ts` | Propagar evidence_url al sincronizar (best-effort) | Modificar |

---

## Task 1: Migración de BD + bucket de storage

**Files:**
- Crear migración vía `mcp__supabase__apply_migration` (project_id `hjjmwipqquynjopkswvu`).

- [ ] **Step 1: Aplicar migración de columna**

Usar `mcp__supabase__apply_migration` con name `add_evidence_url_to_business_debts`:

```sql
alter table public.business_debts add column if not exists evidence_url text;
```

- [ ] **Step 2: Crear el bucket público `debt-evidence`**

Vía `mcp__supabase__execute_sql`:

```sql
insert into storage.buckets (id, name, public)
values ('debt-evidence', 'debt-evidence', true)
on conflict (id) do nothing;
```

- [ ] **Step 3: Crear políticas RLS (espejo de product-images)**

Vía `mcp__supabase__apply_migration` name `debt_evidence_storage_policies`:

```sql
create policy "debt-evidence public read"
  on storage.objects for select
  using (bucket_id = 'debt-evidence');

create policy "debt-evidence authenticated insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'debt-evidence');

create policy "debt-evidence authenticated update"
  on storage.objects for update to authenticated
  using (bucket_id = 'debt-evidence');

create policy "debt-evidence authenticated delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'debt-evidence');
```

- [ ] **Step 4: Verificar**

Vía `mcp__supabase__execute_sql`:
```sql
select column_name from information_schema.columns where table_name='business_debts' and column_name='evidence_url';
select id, public from storage.buckets where id='debt-evidence';
```
Esperado: una fila `evidence_url` y el bucket `debt-evidence` con `public=true`.

- [ ] **Checkpoint:** migración aplicada (no requiere commit local).

---

## Task 2: hook `useDebts` — tipo y funciones

**Files:**
- Modify: `hooks/useDebts.ts`

- [ ] **Step 1: Añadir `evidence_url` al tipo `BusinessDebt`**

En la definición de la interfaz `BusinessDebt` (junto a `inventory_lot_id`), añadir:

```typescript
    evidence_url?: string | null;
```

- [ ] **Step 2: `createDebt` acepta y persiste `evidence_url`**

En la firma del objeto `debtData` de `createDebt` añadir el campo:

```typescript
        created_at?: string;
        evidence_url?: string | null;
    }) => {
```

Y en el `.insert({...})`, añadir tras `inventory_lot_id`:

```typescript
                evidence_url: debtData.evidence_url || null,
```

- [ ] **Step 3: `addCreditorPayment` acepta `evidenceUrl`**

Cambiar la firma a:

```typescript
    const addCreditorPayment = useCallback(async (
        creditorName: string,
        amount: number,
        _method?: string,
        notes?: string,
        shiftId?: string,
        evidenceUrl?: string | null,
    ) => {
```

En la rama OFFLINE, en el objeto `fakePaymentRecord`, añadir tras `status: 'paid'`:

```typescript
                evidence_url: evidenceUrl || null,
```

En la rama ONLINE, en el `.insert({...})` del registro de abono (el que tiene `description: notes ? 'Abono: ...' : 'Abono'`), añadir:

```typescript
                evidence_url: evidenceUrl || null,
```

Actualizar el array de dependencias del `useCallback` no es necesario (no usa `evidenceUrl` como dep externa).

- [ ] **Step 4: Nueva función `updateDebtEvidence`**

Añadir junto a las demás funciones del hook:

```typescript
    const updateDebtEvidence = useCallback(async (debtId: string, url: string | null) => {
        if (!businessId) throw new Error('No autenticado');
        const { error } = await supabase
            .from('business_debts')
            .update({ evidence_url: url })
            .eq('id', debtId);
        if (error) throw error;
        await fetchDebts();
    }, [businessId, fetchDebts]);
```

Y exportarla en el `return` del hook (junto a `createDebt`, `addCreditorPayment`):

```typescript
        updateDebtEvidence,
```

- [ ] **Step 5: Verificar typecheck**

Run: `npx tsc --noEmit`
Esperado: sin errores nuevos respecto al baseline.

- [ ] **Checkpoint.**

---

## Task 3: hook `useExpenses` — persistir `receipt_url`

**Files:**
- Modify: `hooks/useExpenses.ts:241-250` (objeto `expenseData`)

- [ ] **Step 1: Añadir `receipt_url` al insert de gasto**

En el objeto `expenseData`, añadir tras `created_at`:

```typescript
                    receipt_url: (data as any).receipt_url || null,
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Esperado: sin errores nuevos.

- [ ] **Checkpoint.**

---

## Task 4: Componente `EvidenceUploader`

**Files:**
- Create: `components/EvidenceUploader.tsx`

- [ ] **Step 1: Crear el componente presentacional**

```tsx
import React from 'react';
import { ImageCropper } from './ImageCropper';
import { InAppCamera } from './InAppCamera';

interface EvidenceUploaderProps {
    previewUrl: string | null;
    uploading: boolean;
    statusText: string;
    showCropper: boolean;
    cropperImageSrc: string | null;
    onCropComplete: (blob: Blob, removeBg?: boolean) => Promise<void>;
    onCropCancel: () => void;
    showInAppCamera: boolean;
    onCameraCapture: (file: File) => void;
    onCameraClose: () => void;
    triggerCamera: () => void;
    triggerGallery: () => void;
    deleteImage: () => void | Promise<void>;
    label?: string;
    compact?: boolean;
}

export const EvidenceUploader: React.FC<EvidenceUploaderProps> = ({
    previewUrl, uploading, statusText, showCropper, cropperImageSrc,
    onCropComplete, onCropCancel, showInAppCamera, onCameraCapture, onCameraClose,
    triggerCamera, triggerGallery, deleteImage, label = 'Evidencia (opcional)', compact = false,
}) => {
    const thumbSize = compact ? 'size-14' : 'size-20';
    return (
        <div className="w-full">
            <label className="block text-[10px] font-black text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-[0.12em]">
                {label}
            </label>
            <div className="flex items-center gap-3">
                <div className={`${thumbSize} shrink-0 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl bg-gray-50 dark:bg-gray-800/50 flex items-center justify-center overflow-hidden relative`}>
                    {previewUrl ? (
                        <img src={previewUrl} alt="Evidencia" className="w-full h-full object-cover" />
                    ) : (
                        <span className="material-symbols-outlined text-gray-400 text-2xl">attach_file</span>
                    )}
                    {uploading && (
                        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1">
                            <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            {statusText && <span className="text-white text-[8px] font-medium text-center px-1">{statusText}</span>}
                        </div>
                    )}
                </div>
                <div className="flex-1 flex flex-col gap-2">
                    {previewUrl && !uploading ? (
                        <div className="flex gap-2">
                            <button type="button" onClick={triggerGallery} className="flex-1 h-9 flex items-center justify-center gap-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-xs hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all">
                                <span className="material-symbols-outlined text-[16px]">sync</span> Cambiar
                            </button>
                            <button type="button" onClick={() => deleteImage()} className="size-9 flex items-center justify-center bg-red-50 dark:bg-red-900/20 text-red-500 rounded-xl hover:bg-red-100 active:scale-95 transition-all">
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <button type="button" onClick={triggerCamera} disabled={uploading} className="flex-1 h-9 flex items-center justify-center gap-1.5 bg-primary text-[#102218] rounded-xl font-bold text-xs active:scale-95 transition-transform shadow-sm disabled:opacity-50">
                                <span className="material-symbols-outlined text-[16px]">photo_camera</span> Cámara
                            </button>
                            <button type="button" onClick={triggerGallery} disabled={uploading} className="flex-1 h-9 flex items-center justify-center gap-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-xs hover:bg-gray-200 dark:hover:bg-gray-700 active:scale-95 transition-all disabled:opacity-50">
                                <span className="material-symbols-outlined text-[16px]">image</span> Galería
                            </button>
                        </div>
                    )}
                    {!compact && <span className="text-[10px] text-gray-400">Factura, remisión o comprobante</span>}
                </div>
            </div>

            {showCropper && cropperImageSrc && (
                <ImageCropper imageSrc={cropperImageSrc} onCropComplete={onCropComplete} onCancel={onCropCancel} aspectRatio={undefined as any} />
            )}
            {showInAppCamera && (
                <InAppCamera onCapture={onCameraCapture} onClose={onCameraClose} />
            )}
        </div>
    );
};
```

> Nota: `aspectRatio` se pasa `undefined` para permitir recorte libre (documentos no son cuadrados). Verificar en Step 2 que `ImageCropper` acepta `aspectRatio` opcional; si es obligatorio numérico, usar `aspectRatio={3 / 4}`.

- [ ] **Step 2: Verificar la firma de `ImageCropper`**

Run: `npx tsc --noEmit`
Si reporta error en `aspectRatio`, abrir `components/ImageCropper.tsx`, ver el tipo del prop y ajustar: si es `number` obligatorio, cambiar a `aspectRatio={3 / 4}` y quitar el `as any`.
Esperado tras ajuste: sin errores nuevos.

- [ ] **Checkpoint.**

---

## Task 5: util `lib/shareEvidence.ts`

**Files:**
- Create: `lib/shareEvidence.ts`

- [ ] **Step 1: Crear la función de compartir**

```typescript
const isMobileDevice = (): boolean => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

interface ShareEvidenceArgs {
    evidenceUrl: string;
    supplierName: string;
    typeLabel: string;     // 'Compra a crédito' | 'Compra de contado' | 'Gasto' | 'Abono'
    amountText: string;    // ej: '$120.000'
    dateText: string;      // ej: '5 jun 2026'
    businessName?: string;
}

const urlToFile = async (url: string): Promise<File> => {
    const res = await fetch(url);
    const blob = await res.blob();
    const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    return new File([blob], `evidencia.${ext}`, { type: blob.type || 'image/jpeg' });
};

export const shareEvidence = async (args: ShareEvidenceArgs): Promise<void> => {
    const { evidenceUrl, supplierName, typeLabel, amountText, dateText, businessName } = args;
    const caption = `Comprobante · ${supplierName} | ${typeLabel} ${amountText} | ${dateText}${businessName ? ` — ${businessName}` : ''}`;

    let file: File | null = null;
    try {
        file = await urlToFile(evidenceUrl);
    } catch {
        file = null;
    }

    // Móvil: Web Share API con el archivo → selector del SO (WhatsApp incluido)
    if (isMobileDevice() && file && navigator.share && (navigator as any).canShare?.({ files: [file] })) {
        try {
            await navigator.share({ files: [file], text: caption });
            return;
        } catch (e) {
            if ((e as Error).name === 'AbortError') return;
        }
    }

    // Móvil sin Web Share de archivos: abrir WhatsApp con el texto (la imagen se adjunta manual)
    if (isMobileDevice()) {
        window.location.href = `whatsapp://send?text=${encodeURIComponent(caption + '\n' + evidenceUrl)}`;
        return;
    }

    // Desktop: copiar imagen al portapapeles y abrir WhatsApp Web; fallback a abrir la imagen
    try {
        if (file) {
            await navigator.clipboard.write([new ClipboardItem({ [file.type]: file })]);
        }
    } catch { /* clipboard puede fallar con webp en algunos navegadores */ }

    const webUrl = `https://web.whatsapp.com/send?text=${encodeURIComponent(caption + '\n' + evidenceUrl)}`;
    window.open(webUrl, 'WhatsApp', 'width=800,height=600,scrollbars=yes,resizable=yes');
};
```

- [ ] **Step 2: Verificar typecheck**

Run: `npx tsc --noEmit`
Esperado: sin errores nuevos. (`ClipboardItem`/`canShare` pueden necesitar `as any` según el lib target; si tsc se queja, envolver con `as any`.)

- [ ] **Checkpoint.**

---

## Task 6: Componente `EvidenceViewer`

**Files:**
- Create: `components/EvidenceViewer.tsx`

- [ ] **Step 1: Crear el visor**

```tsx
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useImageUpload } from '../hooks/useImageUpload';
import { useBusinessSettings } from '../context/BusinessSettingsContext';
import { useToast } from '../context/ToastContext';
import { formatCurrency } from '../lib/formatters';
import { shareEvidence } from '../lib/shareEvidence';
import { ImageCropper } from './ImageCropper';
import { InAppCamera } from './InAppCamera';

interface ViewerDebt {
    id: string;
    evidence_url?: string | null;
    total_amount: number;
    paid_amount: number;
    status?: string;
    created_at: string;
}

interface EvidenceViewerProps {
    debt: ViewerDebt;
    supplierName: string;
    onClose: () => void;
    onEvidenceChange: (debtId: string, url: string | null) => Promise<void>;
}

export const EvidenceViewer: React.FC<EvidenceViewerProps> = ({ debt, supplierName, onClose, onEvidenceChange }) => {
    const { businessName } = useBusinessSettings();
    const { showToast } = useToast();
    const [working, setWorking] = useState(false);
    const upload = useImageUpload(debt.evidence_url || null, 'debt-evidence');

    const isPayment = debt.total_amount === 0 && debt.paid_amount > 0;
    const isCash = !isPayment && debt.status === 'paid' && debt.paid_amount >= debt.total_amount && debt.total_amount > 0;
    const typeLabel = isPayment ? 'Abono' : isCash ? 'Compra de contado' : 'Crédito';
    const amount = isPayment ? debt.paid_amount : debt.total_amount;
    const dateText = new Date(debt.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

    // Cuando la subida termina (imageUrl cambia y difiere del actual), persistir
    React.useEffect(() => {
        const persist = async () => {
            if (upload.imageUrl && upload.imageUrl !== (debt.evidence_url || null) && !upload.uploading) {
                setWorking(true);
                try {
                    await onEvidenceChange(debt.id, upload.imageUrl);
                    upload.markAsSaved();
                    showToast('Evidencia actualizada', 'success');
                } catch { showToast('Error al guardar evidencia', 'error'); }
                finally { setWorking(false); }
            }
        };
        persist();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [upload.imageUrl, upload.uploading]);

    const handleDelete = async () => {
        setWorking(true);
        try {
            await upload.deleteImage();
            await onEvidenceChange(debt.id, null);
            showToast('Evidencia eliminada', 'success');
            onClose();
        } catch { showToast('Error al eliminar', 'error'); }
        finally { setWorking(false); }
    };

    const handleShare = async () => {
        if (!upload.previewUrl) return;
        await shareEvidence({
            evidenceUrl: upload.previewUrl,
            supplierName,
            typeLabel,
            amountText: `$${formatCurrency(amount)}`,
            dateText,
            businessName,
        });
    };

    return createPortal(
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" role="button" tabIndex={-1} onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()} aria-label="Cerrar" />
            <div className="relative bg-white dark:bg-surface-dark rounded-2xl w-full max-w-md p-5 shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col gap-4">
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Evidencia del movimiento</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{supplierName} · {typeLabel} · ${formatCurrency(amount)} · {dateText}</p>
                    </div>
                    <button onClick={onClose} className="size-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-500"><span className="material-symbols-outlined">close</span></button>
                </div>

                <div className="rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center min-h-[200px] max-h-[60vh]">
                    {upload.previewUrl ? (
                        <img src={upload.previewUrl} alt="Evidencia" className="w-full h-full object-contain max-h-[60vh]" />
                    ) : (
                        <div className="py-12 flex flex-col items-center gap-2 text-gray-400">
                            <span className="material-symbols-outlined text-4xl">image</span>
                            <span className="text-xs">Sin evidencia</span>
                        </div>
                    )}
                </div>

                <div className="flex gap-2">
                    <button type="button" onClick={upload.triggerGallery} disabled={working || upload.uploading} className="flex-1 h-10 flex items-center justify-center gap-1.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl font-bold text-xs hover:bg-gray-200 disabled:opacity-50">
                        <span className="material-symbols-outlined text-[18px]">{upload.previewUrl ? 'sync' : 'add_photo_alternate'}</span>
                        {upload.previewUrl ? 'Reemplazar' : 'Adjuntar'}
                    </button>
                    {upload.previewUrl && (
                        <button type="button" onClick={handleDelete} disabled={working || upload.uploading} className="h-10 px-3 flex items-center justify-center bg-red-50 dark:bg-red-900/20 text-red-500 rounded-xl hover:bg-red-100 disabled:opacity-50">
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                    )}
                </div>

                {upload.previewUrl && (
                    <button type="button" onClick={handleShare} disabled={working || upload.uploading} className="w-full h-11 flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold rounded-xl shadow-sm active:scale-[0.98] transition-all disabled:opacity-50">
                        <span className="material-symbols-outlined">share</span>
                        Compartir por WhatsApp
                    </button>
                )}

                {upload.showCropper && upload.cropperImageSrc && (
                    <ImageCropper imageSrc={upload.cropperImageSrc} onCropComplete={upload.onCropComplete} onCancel={upload.onCropCancel} aspectRatio={undefined as any} />
                )}
                {upload.showInAppCamera && (
                    <InAppCamera onCapture={upload.onCameraCapture} onClose={upload.onCameraClose} />
                )}
            </div>
        </div>,
        document.body
    );
};
```

- [ ] **Step 2: Verificar que `useBusinessSettings` expone `businessName`**

Abrir `context/BusinessSettingsContext.tsx` y confirmar el nombre de la propiedad del nombre del negocio. Si se llama distinto (p. ej. `settings.business_name`), ajustar la línea `const { businessName } = useBusinessSettings();`.

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Esperado: sin errores nuevos.

- [ ] **Checkpoint.**

---

## Task 7: `InventoryPurchase` — proveedor obligatorio + uploader + evidence_url

**Files:**
- Modify: `components/expense/InventoryPurchase.tsx`

- [ ] **Step 1: Instanciar el hook de subida**

Tras los hooks existentes en el cuerpo del componente (cerca de `const { suppliers, ... } = useSuppliers();`), añadir:

```typescript
    const evidenceUpload = useImageUpload(null, 'debt-evidence');
```

Y añadir el import al inicio:
```typescript
import { useImageUpload } from '../../hooks/useImageUpload';
import { EvidenceUploader } from '../EvidenceUploader';
```

- [ ] **Step 2: Renderizar el `EvidenceUploader` en la vista de registro**

Dentro del bloque `inventoryTab === 'register'`, justo antes del botón de confirmar compra (al final del `space-y-6`), insertar:

```tsx
                                    <EvidenceUploader
                                        previewUrl={evidenceUpload.previewUrl}
                                        uploading={evidenceUpload.uploading}
                                        statusText={evidenceUpload.statusText}
                                        showCropper={evidenceUpload.showCropper}
                                        cropperImageSrc={evidenceUpload.cropperImageSrc}
                                        onCropComplete={evidenceUpload.onCropComplete}
                                        onCropCancel={evidenceUpload.onCropCancel}
                                        showInAppCamera={evidenceUpload.showInAppCamera}
                                        onCameraCapture={evidenceUpload.onCameraCapture}
                                        onCameraClose={evidenceUpload.onCameraClose}
                                        triggerCamera={evidenceUpload.triggerCamera}
                                        triggerGallery={evidenceUpload.triggerGallery}
                                        deleteImage={evidenceUpload.deleteImage}
                                    />
```

- [ ] **Step 3: Proveedor obligatorio (también contado)**

En `handleSave`, eliminar el fallback `'Proveedor de Contado'`. Añadir validación al inicio de `handleSave` (tras el guard de `isSubmitting`):

```typescript
        if (!creditorName.trim() && !selectedSupplier) {
            showToast('Selecciona o crea un proveedor', 'warning');
            return;
        }
```

Y reemplazar las ocurrencias de `creditorName.trim() || 'Proveedor de Contado'` por `creditorName.trim()`.

- [ ] **Step 4: Pasar `evidence_url` a cada `createDebt`**

En `handleSave`, en las DOS llamadas `createDebt({...})` (la de crédito y la de contado por item), añadir el campo:

```typescript
                                    evidence_url: evidenceUpload.imageUrl,
```

(No añadirlo al `createDebt` del abono inicial "Pago al momento de compra"; ese es un abono, no la compra.)

- [ ] **Step 5: `markAsSaved` tras guardar**

En `handleSave`, justo antes de `onClose();` (rama online exitosa, tras el bloque `onSave`), añadir:

```typescript
            evidenceUpload.markAsSaved();
```

- [ ] **Step 6: Offline best-effort**

En la rama offline (donde se arma el payload de `offlineQueue.add('inventory_purchase', {...})`), añadir al payload:

```typescript
                        evidenceUrl: evidenceUpload.imageUrl || null,
```

Y antes de `onClose()` de esa rama, `evidenceUpload.markAsSaved();`. (Si `imageUrl` es null porque la subida no se completó offline, simplemente no habrá evidencia — comportamiento aceptado en el spec §9.)

- [ ] **Step 7: Verificar typecheck**

Run: `npx tsc --noEmit`
Esperado: sin errores nuevos.

- [ ] **Step 8: Prueba manual**

`npm run dev` → abrir compra de inventario → adjuntar foto (cámara/galería), confirmar que comprime y muestra miniatura → registrar compra de contado y de crédito → confirmar en Supabase que `business_debts.evidence_url` quedó poblado.

- [ ] **Checkpoint.**

---

## Task 8: `ExpenseRegister` — proveedor obligatorio + fila contado + uploader

**Files:**
- Modify: `components/expense/ExpenseRegister.tsx`

- [ ] **Step 1: Imports + hook**

Añadir imports:
```typescript
import { useImageUpload } from '../../hooks/useImageUpload';
import { EvidenceUploader } from '../EvidenceUploader';
```
Y en el cuerpo, tras los hooks existentes:
```typescript
    const evidenceUpload = useImageUpload(null, 'debt-evidence');
```

- [ ] **Step 2: Renderizar uploader**

En la vista `expenseTab === 'register'`, antes del botón "CONFIRMAR REGISTRO" (dentro del contenedor del formulario), insertar el mismo bloque `<EvidenceUploader ... />` del Task 7 Step 2 (mismos props, usando `evidenceUpload`).

- [ ] **Step 3: Proveedor obligatorio en crédito y contado**

Actualizar la condición `disabled` del `AppButton` de confirmar para exigir proveedor siempre:

Reemplazar `(isCredit === true && !creditorName.trim())` por `!creditorName.trim()` en la expresión `disabled`. El label de proveedor ya muestra `*` solo en crédito; cambiar para que siempre lo muestre:

En el `<label htmlFor="expense-creditor-name">`, dejar el asterisco siempre:
```tsx
                                            Proveedor <span className="text-status-error">*</span>
```
Y el placeholder a `'Buscar proveedor...'` siempre.

- [ ] **Step 4: Gasto a crédito — añadir `evidence_url`**

En la rama `if (isCredit)` → `createDebt({...})`, añadir:
```typescript
                            evidence_url: evidenceUpload.imageUrl,
```

- [ ] **Step 5: Gasto de contado — crear fila de movimiento del proveedor**

En `handleSave`, dentro de `try`, **después** del bloque `if (isCredit) {...}` y **antes** de `await onSave({...})`, añadir:

```typescript
            if (!isCredit && expenseAmount > 0 && creditorName.trim()) {
                try {
                    await createDebt({
                        type: 'supplier',
                        creditor_name: creditorName.trim(),
                        description: `Gasto de contado: ${selectedCategory}${description ? ' - ' + description : ''}`.trim(),
                        total_amount: expenseAmount,
                        paid_amount: expenseAmount,
                        status: 'paid',
                        evidence_url: evidenceUpload.imageUrl,
                        created_at: new Date(expenseDate + 'T12:00:00').toISOString(),
                    });
                } catch (err) {
                    console.error('Error creating cash expense movement:', err);
                }
            }
```

- [ ] **Step 6: Pasar `receipt_url` al `onSave`**

En el objeto que se pasa a `await onSave({...})`, añadir:
```typescript
                receipt_url: evidenceUpload.imageUrl,
```

- [ ] **Step 7: `markAsSaved` + reset**

Tras el `await onSave({...})` exitoso (donde se resetean los campos `setAmount('')` etc.), añadir:
```typescript
            evidenceUpload.markAsSaved();
            evidenceUpload.deleteImage();
```
> `deleteImage` aquí limpia el preview local para el siguiente registro; como ya se llamó `markAsSaved`, el archivo subido NO se borra del storage (queda asociado al movimiento). Verificar este orden en Step 8; si `deleteImage` borrara del storage, sustituir por `evidenceUpload.resetImage()`.

- [ ] **Step 8: Revisar interacción markAsSaved/deleteImage**

Abrir `hooks/useImageUpload.ts`: `deleteImage` SÍ borra del storage. Por tanto en Step 7 usar **`resetImage()`** en lugar de `deleteImage()`:
```typescript
            evidenceUpload.markAsSaved();
            evidenceUpload.resetImage();
```
Corregir el código del Step 7 en consecuencia.

- [ ] **Step 9: Verificar typecheck + prueba manual**

Run: `npx tsc --noEmit` (sin errores nuevos).
`npm run dev`: registrar gasto de contado con proveedor + foto → confirmar que aparece como movimiento "Contado" del proveedor en DebtsScreen con su evidencia, y que el gasto sigue en Gastos→Historial.

- [ ] **Checkpoint.**

---

## Task 9: `DebtsScreen` — uploader en abono + filas + viewer

**Files:**
- Modify: `screens/DebtsScreen.tsx`

- [ ] **Step 1: Imports + hooks**

Añadir imports:
```typescript
import { useImageUpload } from '../hooks/useImageUpload';
import { EvidenceUploader } from '../components/EvidenceUploader';
import { EvidenceViewer } from '../components/EvidenceViewer';
```
Extraer `updateDebtEvidence` del hook:
```typescript
    const { /* ...existing..., */ updateDebtEvidence } = useDebts();
```
Añadir estado para el viewer y la instancia de subida del abono:
```typescript
    const [viewerDebt, setViewerDebt] = useState<typeof debts[0] | null>(null);
    const paymentEvidence = useImageUpload(null, 'debt-evidence');
```

- [ ] **Step 2: Uploader en el modal "Registrar Abono"**

Dentro del `<form onSubmit={handleAddPayment}>`, antes de los botones Cancelar/Confirmar, insertar:

```tsx
                                <EvidenceUploader compact
                                    previewUrl={paymentEvidence.previewUrl}
                                    uploading={paymentEvidence.uploading}
                                    statusText={paymentEvidence.statusText}
                                    showCropper={paymentEvidence.showCropper}
                                    cropperImageSrc={paymentEvidence.cropperImageSrc}
                                    onCropComplete={paymentEvidence.onCropComplete}
                                    onCropCancel={paymentEvidence.onCropCancel}
                                    showInAppCamera={paymentEvidence.showInAppCamera}
                                    onCameraCapture={paymentEvidence.onCameraCapture}
                                    onCameraClose={paymentEvidence.onCameraClose}
                                    triggerCamera={paymentEvidence.triggerCamera}
                                    triggerGallery={paymentEvidence.triggerGallery}
                                    deleteImage={paymentEvidence.deleteImage}
                                />
```

- [ ] **Step 3: `handleAddPayment` pasa la evidencia**

Localizar la llamada `await addCreditorPayment(selectedCreditor.name, amount, paymentMethod || undefined, paymentNotes || undefined, activeShift?.id || undefined);` y añadir el 6º argumento:

```typescript
            await addCreditorPayment(selectedCreditor.name, amount, paymentMethod || undefined, paymentNotes || undefined, activeShift?.id || undefined, paymentEvidence.imageUrl);
```

Tras el éxito (donde se cierra el modal / resetea), añadir:
```typescript
            paymentEvidence.markAsSaved();
            paymentEvidence.resetImage();
```

- [ ] **Step 4: Miniatura / botón Adjuntar en las filas de movimiento**

En el render de cada movimiento (bloque que empieza en `const isPaymentRecord = ...`), dentro del `<div className="flex items-center justify-between mt-0.5">` (la fila de fecha+acciones), añadir un control de evidencia antes de los botones de editar/eliminar. Insertar, justo después del `<span>` de la fecha:

```tsx
                                                            {debt.evidence_url ? (
                                                                <button
                                                                    onClick={() => setViewerDebt(debt)}
                                                                    className="size-7 rounded-md overflow-hidden border border-gray-200 dark:border-gray-700 shrink-0 ml-auto mr-1"
                                                                    aria-label="Ver evidencia"
                                                                >
                                                                    <img src={debt.evidence_url} alt="Evidencia" className="w-full h-full object-cover" />
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={() => setViewerDebt(debt)}
                                                                    className="size-6 flex items-center justify-center text-gray-400 hover:text-primary hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors ml-auto mr-1"
                                                                    aria-label="Adjuntar evidencia"
                                                                >
                                                                    <span className="material-symbols-outlined text-sm">attach_file</span>
                                                                </button>
                                                            )}
```

> El visor sirve tanto para ver como para adjuntar/reemplazar (su botón muestra "Adjuntar" si no hay imagen), así que ambos casos abren `setViewerDebt(debt)`.

- [ ] **Step 5: Montar el `EvidenceViewer`**

Cerca del final del componente (junto a los otros modales como `showPaymentModal`), añadir:

```tsx
            {viewerDebt && selectedCreditor && (
                <EvidenceViewer
                    debt={viewerDebt}
                    supplierName={selectedCreditor.name}
                    onClose={() => setViewerDebt(null)}
                    onEvidenceChange={async (debtId, url) => {
                        await updateDebtEvidence(debtId, url);
                        setViewerDebt(prev => prev ? { ...prev, evidence_url: url } : prev);
                    }}
                />
            )}
```

- [ ] **Step 6: Verificar typecheck + prueba manual**

Run: `npx tsc --noEmit` (sin errores nuevos).
`npm run dev`: abonar con evidencia → ver la miniatura en el movimiento de abono → abrir visor → reemplazar, borrar y compartir por WhatsApp → adjuntar evidencia a un movimiento que no tenía.

- [ ] **Checkpoint.**

---

## Task 10: `QuickTransactionModal` — abono móvil con evidencia

**Files:**
- Modify: `components/modals/QuickTransactionModal.tsx`

- [ ] **Step 1: Imports + hook**

Añadir:
```typescript
import { useImageUpload } from '../../hooks/useImageUpload';
import { EvidenceUploader } from '../EvidenceUploader';
```
En el cuerpo:
```typescript
    const evidenceUpload = useImageUpload(null, 'debt-evidence');
```

- [ ] **Step 2: Renderizar uploader (solo para proveedor)**

En el JSX del formulario de abono, dentro del bloque que se muestra (antes del botón "Registrar Abono"), y condicionado a `type === 'supplier'`, insertar el `<EvidenceUploader compact ... />` con los props de `evidenceUpload` (idéntico al Task 9 Step 2).

- [ ] **Step 3: Pasar evidencia en la llamada de abono de proveedor**

Localizar `await addCreditorPayment(selectedEntity.name, val, selectedPaymentMethod || undefined, note, activeShift?.id || undefined);` y añadir 6º argumento `evidenceUpload.imageUrl`. Tras éxito: `evidenceUpload.markAsSaved(); evidenceUpload.resetImage();`.

- [ ] **Step 4: Verificar typecheck + prueba manual**

Run: `npx tsc --noEmit` (sin errores nuevos).
Prueba en móvil/responsive: HomeScreen → Finanzas → Abonos → Abono Proveedor → adjuntar evidencia → confirmar.

- [ ] **Checkpoint.**

---

## Task 11: Sincronización offline (best-effort)

**Files:**
- Modify: `hooks/useOfflineSync.ts`

- [ ] **Step 1: Localizar el handler `inventory_purchase`**

Buscar en `useOfflineSync.ts` el bloque que procesa `inventory_purchase` y crea las deudas al sincronizar. Donde se hace el `insert`/`createDebt` de la deuda, añadir `evidence_url: item.evidenceUrl ?? payload.evidenceUrl ?? null` según la forma del payload (el payload trae `evidenceUrl` a nivel raíz desde Task 7 Step 6).

- [ ] **Step 2: Localizar el handler `supplier_payment`**

En el bloque que procesa `supplier_payment`, donde inserta la fila de abono en `business_debts`, añadir `evidence_url: payload.evidenceUrl ?? null`. (El payload de abono offline incluirá `evidenceUrl` si se añade en `useDebts` rama offline — opcional; si no se añadió, queda null.)

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Esperado: sin errores nuevos.

- [ ] **Checkpoint.**

---

## Task 12: Verificación final

- [ ] **Step 1: Typecheck global**

Run: `npx tsc --noEmit`
Comparar con `tsc-baseline.txt`: no debe haber errores nuevos.

- [ ] **Step 2: Build**

Run: `npm run build`
Esperado: build exitoso.

- [ ] **Step 3: Recorrido manual de criterios de aceptación (spec §11)**

Verificar uno a uno los 7 criterios de aceptación del spec en `npm run dev`.

- [ ] **Step 4: Actualizar documentación**

Actualizar `docs/caracteristicas/deudas_negocio.md`, `flujo_compra_inventario.md` y `flujo_registro_gasto.md` mencionando: evidencia adjunta por movimiento, proveedor obligatorio, compartir por WhatsApp, gasto de contado como movimiento del proveedor.

- [ ] **Checkpoint final.**

---

## Self-Review (cobertura del spec)

- §3.1 columna `evidence_url` → Task 1 ✓
- §3.2 `receipt_url` en expenses → Task 3 + Task 8 Step 6 ✓
- §3.3 bucket público + RLS → Task 1 ✓
- §4 reuso useImageUpload (enfoque A) → Tasks 7-10 ✓
- §5.1 EvidenceUploader → Task 4 ✓
- §5.2 EvidenceViewer → Task 6 ✓
- §5.3 shareEvidence → Task 5 ✓
- §6.1 useDebts (tipo, createDebt, addCreditorPayment, updateDebtEvidence) → Task 2 ✓
- §6.2 useExpenses receipt_url → Task 3 ✓
- §7.1 InventoryPurchase (proveedor obligatorio + evidencia) → Task 7 ✓
- §7.2 ExpenseRegister (obligatorio + fila contado + evidencia) → Task 8 ✓
- §7.3 DebtsScreen (abono + filas + viewer) → Task 9 ✓
- §7.4 QuickTransactionModal → Task 10 ✓
- §8 detección de tipo (sin cambios) → cubierto por filas existentes ✓
- §9 offline best-effort → Task 7 Step 6 + Task 11 ✓
- §11 criterios de aceptación → Task 12 ✓
