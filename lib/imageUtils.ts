export const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            reader.onload = null;
            reader.onerror = null;
            resolve(dataUrl.split(',')[1]);
        };
        reader.onerror = () => {
            reader.onload = null;
            reader.onerror = null;
            reject(new Error('No se pudo leer el archivo'));
        };
        reader.readAsDataURL(blob);
    });
};

export const compressImage = async (
    file: File,
    maxDim = 1024,
    quality = 0.6
): Promise<{ base64: string; mimeType: string }> => {
    const isHeic =
        file.type === 'image/heic' ||
        file.type === 'image/heif' ||
        file.name.toLowerCase().endsWith('.heic') ||
        file.name.toLowerCase().endsWith('.heif');

    if (isHeic) {
        const base64 = await blobToBase64(file);
        return { base64, mimeType: 'image/heic' };
    }

    const bitmap = await createImageBitmap(file);
    let w = bitmap.width;
    let h = bitmap.height;

    if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); throw new Error('Canvas no soportado'); }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (b) => b ? resolve(b) : reject(new Error('No se pudo comprimir')),
            'image/jpeg',
            quality
        );
    });

    canvas.width = 0;
    canvas.height = 0;

    const base64 = await blobToBase64(blob);
    return { base64, mimeType: 'image/jpeg' };
};

/**
 * Reconstruye un Blob a partir de un base64. Es el inverso de `blobToBase64`.
 *
 * Existe porque `compressImage` devuelve la imagen comprimida como base64 y no
 * como Blob: con esta función esos mismos bytes se pueden conservar como Blob
 * para guardarlos (evidencia) y, a la vez, enviarlos a una edge function, sin
 * comprimir dos veces ni terminar con dos imágenes distintas.
 */
export const base64ToBlob = (base64: string, mimeType: string): Blob => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType });
};
