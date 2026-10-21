# PhotoOrderScreen — Bugs Móviles Plan de Implementación

**Objetivo:** Corregir 2 bugs en móvil: (1) al tomar foto la pantalla se cierra sola, (2) "Cargar Imagen" muestra "No se pudo cargar la imagen".
**Arquitectura:** Ambos bugs son causados por el ciclo de vida del componente y la gestión de blob URLs en `compressImage`. No se toca la Edge Function ni la lógica de matching.
**Tech Stack:** React, TypeScript, HTML5 File/Camera API

---

## Diagnóstico

### Bug 1: "Se sale de la pantalla" al tomar foto
- **Causa raíz**: Cuando el `<input capture="environment">` abre la cámara nativa en Android/iOS, el navegador pone la app en background. Al regresar, React puede re-renderizar el componente y los `useRef` de los inputs se pierden, o el evento `onChange` no se dispara correctamente porque el input oculto ya no está montado en el DOM.
- **Agravante**: El `e.target.value = ''` en `handleFileChange` se ejecuta inmediatamente después de capturar file, pero en algunos navegadores móviles esto cancela la operación.

### Bug 2: "No se pudo cargar la imagen" al cargar desde galería en móvil
- **Causa raíz**: En `compressImage`, se crea un `URL.createObjectURL(file)` para el `<img>`. Pero ANTES de eso, `handleImageSelected` ya creó OTRO `URL.createObjectURL(file)` para el preview. En móvil, algunos navegadores (especialmente Chrome Android y WebView) no permiten múltiples blob URLs activos simultáneamente para archivos grandes — el segundo blob URL falla silenciosamente y `img.onerror` se dispara.
- **Evidencia**: El screenshot muestra `alt="Preview"` con ícono roto + mensaje "No se pudo cargar la imagen" = `img.onerror` en `compressImage`.

---

## Fase 1: Fix `compressImage` — Eliminar blob URL duplicado

### Tarea 1: Usar un solo blob URL en todo el flujo

**Archivos:**
- Modify: `screens/PhotoOrderScreen.tsx:46-132`

**Paso 1: Refactorizar compressImage para recibir un blob URL existente**

Cambiar `compressImage` para aceptar un `blobUrl` como parámetro en vez de crear uno nuevo internamente. Así el preview y la compresión comparten el mismo blob URL.

```typescript
const compressImage = (blobUrl: string, maxWidth = 1200, quality = 0.75): Promise<{ base64: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;
            if (width > maxWidth) {
                height = Math.round(height * (maxWidth / width));
                width = maxWidth;
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error('Canvas no soportado')); return; }
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            const base64 = dataUrl.split(',')[1];
            resolve({ base64, mimeType: 'image/jpeg' });
        };
        img.onerror = () => {
            reject(new Error('No se pudo cargar la imagen'));
        };
        img.src = blobUrl;
    });
};
```

**Paso 2: Actualizar handleImageSelected para pasar el blob URL**

```typescript
const handleImageSelected = async (file: File) => {
    setError(null);
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    setViewState('processing');

    try {
        const { base64, mimeType } = await compressImage(previewUrl);
        // NO revocar el preview URL aquí — se revoca en handleReset/handleScanAnother

        const rawItems = await processImage(base64, mimeType);
        // ...resto igual
    } catch (err: any) {
        console.error('[PhotoOrder] Error processing image:', err);
        setError(err.message || 'Error inesperado al procesar la imagen.');
        setViewState('capture');
    }
};
```

**Paso 3: Verificar éxito**
- En móvil: "Cargar Imagen" desde galería → debe procesar sin error.
- Preview se muestra correctamente.
- Compresión funciona.

- [ ] Completado

---

## Fase 2: Fix "Se sale de la pantalla" al tomar foto

### Tarea 2: Mover los inputs fuera del condicional de viewState

**Archivos:**
- Modify: `screens/PhotoOrderScreen.tsx:325-339`

**Causa**: Los `<input type="file">` están dentro del bloque `{viewState === 'capture' && (...)}`. Cuando el usuario presiona "Tomar Foto", el estado cambia a `'processing'` y los inputs se desmontan del DOM. Al regresar de la cámara, el input ya no existe → el `onChange` nunca se dispara.

**Paso 1: Mover inputs fuera del renderizado condicional**

Sacar los dos `<input>` ocultos del bloque condicional `viewState === 'capture'` y ponerlos al nivel superior del componente (antes del cierre del div principal).

```tsx
return (
    <div className="flex-1 h-full flex flex-col ...">
        {/* Hidden file inputs - FUERA de cualquier condicional para que persistan */}
        <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
        />
        <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
        />

        {/* Header */}
        {!hideHeader && (...)}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
            {viewState === 'capture' && (
                // Ya NO contiene los <input> ocultos
            )}
            ...
        </div>
    </div>
);
```

**Paso 2: Eliminar los inputs del bloque capture**

Borrar las líneas 325-339 originales (los inputs dentro del bloque capture).

**Paso 3: Verificar éxito**
- En móvil: "Tomar Foto" → abre cámara → tomar foto → regresa a la app → procesa correctamente.
- No se "sale de la pantalla".

- [ ] Completado

---

### Tarea 3: Proteger handleFileChange contra pérdida de referencia

**Archivos:**
- Modify: `screens/PhotoOrderScreen.tsx:134-138`

**Paso 1: Diferir el reset del input value**

En móvil, `e.target.value = ''` inmediato puede interferir con la lectura del archivo. Diferirlo con `setTimeout`.

```typescript
const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageSelected(file);
    // Diferir el reset para que el archivo se lea completamente primero
    setTimeout(() => { e.target.value = ''; }, 500);
};
```

- [ ] Completado

---

## Fase 3: Limpieza de memoria

### Tarea 4: Revocar blob URLs correctamente en cleanup

**Archivos:**
- Modify: `screens/PhotoOrderScreen.tsx` (handleReset, handleScanAnother)

**Paso 1: Revocar el preview URL en handleReset y handleScanAnother**

```typescript
const handleScanAnother = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setViewState('capture');
};

const handleReset = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setMatched([]);
    setUnmatched([]);
    setUnmatchedAssignments({});
    setSearchQueries({});
    setImagePreview(null);
    setViewState('capture');
    setError(null);
};
```

**Paso 2: Agregar cleanup en useEffect para desmontar**

```typescript
React.useEffect(() => {
    return () => {
        if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
}, [imagePreview]);
```

- [ ] Completado

---

## Checklist Final

- [ ] Bug 2 fix: `compressImage` usa blob URL compartido (no crea uno nuevo)
- [ ] Bug 1 fix: `<input>` ocultos movidos fuera del condicional `viewState`
- [ ] Bug 1 fix: `handleFileChange` difiere `e.target.value = ''`
- [ ] Memory: blob URLs se revocan en `handleReset`, `handleScanAnother` y cleanup
- [ ] Desktop: "Cargar Imagen" sigue funcionando ✓
- [ ] Desktop: "Pegar del Portapapeles" sigue funcionando ✓
- [ ] Móvil: "Tomar Foto" no se sale de la pantalla ✓
- [ ] Móvil: "Cargar Imagen" funciona ✓
- [ ] Móvil: "Pegar del Portapapeles" sigue funcionando ✓
