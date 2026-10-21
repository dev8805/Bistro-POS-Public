interface ShareEvidenceArgs {
    evidenceUrl: string;
    supplierName: string;
    typeLabel?: string;
    amountText: string;
    dateText: string;
    businessName?: string;
}

// Descarga la evidencia (WebP) y la redibuja en un canvas, para poder reexportarla
// a un formato familiar (JPG/PNG). Usa un blob object-url (mismo origen) para no
// "tintar" el canvas y poder llamar toBlob sin problemas de CORS.
const loadEvidenceCanvas = async (url: string): Promise<HTMLCanvasElement | null> => {
    try {
        const res = await fetch(url);
        const srcBlob = await res.blob();
        const objUrl = URL.createObjectURL(srcBlob);
        try {
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const im = new Image();
                im.onload = () => resolve(im);
                im.onerror = reject;
                im.src = objUrl;
            });
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            // Fondo blanco (los comprobantes no tienen transparencia; evita negro en JPG)
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
            return canvas;
        } finally {
            URL.revokeObjectURL(objUrl);
        }
    } catch {
        return null;
    }
};

const canvasToBlob = (canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob | null> =>
    new Promise(resolve => canvas.toBlob(resolve, mime, quality));

// Abre WhatsApp: intenta primero la app nativa (whatsapp://) y, si no se abre
// (no hay blur de la ventana), cae a WhatsApp Web. Mismo patrón que SuccessSidebar.
const openWhatsAppWithFallback = (text: string): void => {
    const encoded = encodeURIComponent(text);
    const nativeUrl = `whatsapp://send?text=${encoded}`;
    const webUrl = `https://web.whatsapp.com/send?text=${encoded}`;

    let appOpened = false;
    const handleBlur = () => { appOpened = true; };
    window.addEventListener('blur', handleBlur);

    window.location.href = nativeUrl;

    setTimeout(() => {
        window.removeEventListener('blur', handleBlur);
        if (!appOpened) {
            const width = 800;
            const height = 600;
            const left = (window.innerWidth - width) / 2;
            const top = (window.innerHeight - height) / 2;
            window.open(webUrl, 'WhatsApp', `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`);
        }
    }, 1500);
};

// Devuelve true si la imagen quedó copiada al portapapeles (caso desktop),
// para que la UI pueda avisar "pega con Ctrl+V".
export const shareEvidence = async (args: ShareEvidenceArgs): Promise<boolean> => {
    const { evidenceUrl, supplierName, typeLabel, amountText, dateText, businessName } = args;
    const typePart = typeLabel?.trim() ? `${typeLabel.trim()} ` : '';
    const caption = `Comprobante · ${supplierName} | ${typePart}${amountText} | ${dateText}${businessName ? ` — ${businessName}` : ''}`;

    const canvas = await loadEvidenceCanvas(evidenceUrl);

    // 1) Web Share API con la imagen reexportada a JPG: WhatsApp la muestra como FOTO
    //    (un .webp se compartiría como documento). Funciona en móvil y desktop Chromium.
    if (canvas && navigator.share) {
        const jpgBlob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
        if (jpgBlob) {
            const file = new File([jpgBlob], 'evidencia.jpg', { type: 'image/jpeg' });
            if ((navigator as any).canShare?.({ files: [file] })) {
                try {
                    await navigator.share({ files: [file], text: caption });
                    return false;
                } catch (e) {
                    if ((e as Error).name === 'AbortError') return false;
                    // otro error → caemos al fallback de portapapeles
                }
            }
        }
    }

    // 2) Fallback: copiar la imagen como PNG al portapapeles (formato más compatible que WebP)
    //    y abrir WhatsApp (app → web) con SOLO el caption. El usuario pega con Ctrl+V.
    let copiedToClipboard = false;
    try {
        if (canvas) {
            const pngBlob = await canvasToBlob(canvas, 'image/png');
            if (pngBlob) {
                await navigator.clipboard.write([new (window as any).ClipboardItem({ 'image/png': pngBlob })]);
                copiedToClipboard = true;
            }
        }
    } catch { /* clipboard puede no estar disponible */ }

    openWhatsAppWithFallback(caption);
    return copiedToClipboard;
};
