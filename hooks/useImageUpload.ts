import React, { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';


type UploadStatus = 'idle' | 'selecting' | 'cropping' | 'removing-bg' | 'compressing' | 'uploading' | 'deleting';

interface UseImageUploadResult {
    imageUrl: string | null;
    uploading: boolean;
    status: UploadStatus;
    statusText: string;
    handleImageSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handlePaste: (e: ClipboardEvent) => void;
    handlePasteClick: () => Promise<void>;
    previewUrl: string | null;
    resetImage: () => void;
    deleteImage: () => Promise<void>;
    showCropper: boolean;
    cropperImageSrc: string | null;
    onCropComplete: (croppedBlob: Blob, removeBg?: boolean) => Promise<void>;
    onCropCancel: () => void;
    markAsSaved: () => void;
    triggerCamera: () => void;
    triggerGallery: () => void;
    showInAppCamera: boolean;
    onCameraCapture: (file: File) => void;
    onCameraClose: () => void;
    downloadAndCompressExternalImage: (url: string) => Promise<void>;
    showDocumentCamera: boolean;
    triggerDocumentCamera: () => void;
    onDocumentCameraClose: () => void;
    uploadFileDirect: (file: File) => Promise<string | null>;
}

const STATUS_TEXT: Record<UploadStatus, string> = {
    idle: '',
    selecting: 'Seleccionando...',
    cropping: 'Ajustando imagen...',
    'removing-bg': 'Eliminando fondo...',
    compressing: 'Comprimiendo...',
    uploading: 'Subiendo...',
    deleting: 'Eliminando...'
};

// Helper to extract file path from Supabase public URL
const extractFilePathFromUrl = (publicUrl: string, bucketName: string): string | null => {
    try {
        const regex = new RegExp(`\/${bucketName}\/(.+)$`);
        const match = publicUrl.match(regex);
        return match ? match[1] : null;
    } catch {
        return null;
    }
};

const ORPHAN_KEY = '__orphaned_uploads';

const saveOrphan = (filePath: string) => {
    try {
        const existing: string[] = JSON.parse(localStorage.getItem(ORPHAN_KEY) || '[]');
        if (!existing.includes(filePath)) existing.push(filePath);
        localStorage.setItem(ORPHAN_KEY, JSON.stringify(existing));
    } catch { }
};

const removeOrphan = (filePath: string) => {
    try {
        const existing: string[] = JSON.parse(localStorage.getItem(ORPHAN_KEY) || '[]');
        localStorage.setItem(ORPHAN_KEY, JSON.stringify(existing.filter(p => p !== filePath)));
    } catch { }
};

const cleanupOrphans = async (bucket: string = 'product-images') => {
    try {
        const orphans: string[] = JSON.parse(localStorage.getItem(ORPHAN_KEY) || '[]');
        if (orphans.length === 0) return;
        localStorage.removeItem(ORPHAN_KEY);
        await supabase.storage.from(bucket).remove(orphans);
    } catch { }
};

export function useImageUpload(initialUrl: string | null = null, bucketName: string = 'product-images', pathPrefix: string | null = null): UseImageUploadResult {
    const { profile } = useAuth();
    const { showToast } = useToast();
    const [imageUrl, setImageUrl] = useState<string | null>(initialUrl);
    const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl);
    const [status, setStatus] = useState<UploadStatus>('idle');

    // If initialUrl changes, update state (useful if data loads later)
    useEffect(() => {
        if (initialUrl) {
            setImageUrl(initialUrl);
            setPreviewUrl(initialUrl);
        }
    }, [initialUrl]);

    // Track the original image URL to delete when replaced
    const originalImageUrlRef = useRef<string | null>(initialUrl);

    const [showCropper, setShowCropper] = useState(false);
    const [cropperImageSrc, setCropperImageSrc] = useState<string | null>(null);
    const [showInAppCamera, setShowInAppCamera] = useState(false);
    // Cámara de documento: una sola toma, sin cropper (para escaneo de facturas)
    const [showDocumentCamera, setShowDocumentCamera] = useState(false);

    // Track if the product was saved (to avoid cleanup on unmount)
    const savedRef = useRef(false);
    // Track the uploaded file path for cleanup
    const uploadedFilePathRef = useRef<string | null>(null);

    const uploading = status !== 'idle';
    const statusText = STATUS_TEXT[status];

    const markAsSaved = useCallback(() => {
        savedRef.current = true;
        if (uploadedFilePathRef.current) {
            removeOrphan(uploadedFilePathRef.current);
        }
        // La imagen ya quedó persistida en la fila del registro: dejamos de trackearla
        // para que una subida posterior (o el cleanup de unmount) no la borre del bucket.
        uploadedFilePathRef.current = null;
        originalImageUrlRef.current = null;
    }, []);

    // Delete image from Supabase storage
    const deleteFromStorage = useCallback(async (filePath: string) => {
        try {
            const { error } = await supabase.storage
                .from(bucketName)
                .remove([filePath]);

            if (error) {
                console.error('Error deleting from storage:', error);
            }
        } catch (error) {
            console.error('Error deleting image:', error);
        }
    }, [bucketName]);

    // Public delete function - deletes current image
    const deleteImage = useCallback(async () => {
        if (!imageUrl) return;

        const filePath = extractFilePathFromUrl(imageUrl, bucketName);
        if (!filePath) return;

        setStatus('deleting');

        await deleteFromStorage(filePath);

        // Clear state
        setImageUrl(null);
        setPreviewUrl(null);
        uploadedFilePathRef.current = null;
        originalImageUrlRef.current = null;
        setStatus('idle');
    }, [imageUrl, deleteFromStorage, bucketName]);

    // Descarga una imagen externa (vía edge function 'barcode-lookup' con action
    // 'fetch_image' para bypassear CORS), la comprime a WebP 800px y la sube al
    // bucket propio del negocio. Tras la feature "barcode-catalog-solo-nombre"
    // (2026) esta función quedó sin consumidores en el codebase; se preserva por
    // política de scope (ver .kiro/specs/barcode-catalog-solo-nombre/design.md).
    const downloadAndCompressExternalImage = useCallback(async (externalUrl: string) => {
        try {
            setStatus('compressing');
            
            // Hacemos fetch a la imagen original a través de nuestra Edge Function para Bypass CORS
            let res;
            try {
                // Configurar url a la edge function
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
                
                res = await fetch(`${supabaseUrl}/functions/v1/barcode-lookup`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${supabaseKey}`
                    },
                    body: JSON.stringify({
                        action: 'fetch_image',
                        imageUrl: externalUrl
                    })
                });
                if (!res.ok) throw new Error('Fetch via edge function falló');
            } catch (e) {
                throw e; // Ir al catch principal
            }
            
            const blob = await res.blob();
            
            const img = new Image();
            img.src = URL.createObjectURL(blob);
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });

            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const maxSize = 800; // Limitar al igual que el sistema de subida
            
            if (width > maxSize || height > maxSize) {
                if (width > height) {
                    height = Math.round((height * maxSize) / width);
                    width = maxSize;
                } else {
                    width = Math.round((width * maxSize) / height);
                    height = maxSize;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Error al obtener contexto del canvas');
            
            // Fondo blanco
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            const compressedBlob = await new Promise<Blob | null>(resolve => 
                canvas.toBlob(resolve, 'image/webp', 0.75) // Comprimir a WebP 75%
            );

            if (!compressedBlob) throw new Error('Compresión fallida');

            setStatus('uploading');
            
            if (uploadedFilePathRef.current) {
                await deleteFromStorage(uploadedFilePathRef.current);
            }
            if (originalImageUrlRef.current) {
                const originalPath = extractFilePathFromUrl(originalImageUrlRef.current, bucketName);
                if (originalPath) await deleteFromStorage(originalPath);
                originalImageUrlRef.current = null;
            }

            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.webp`;
            const filePath = `${profile?.business_id}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from(bucketName)
                .upload(filePath, compressedBlob, {
                    contentType: 'image/webp',
                    cacheControl: '31536000'
                });

            if (uploadError) throw uploadError;

            uploadedFilePathRef.current = filePath;
            saveOrphan(filePath);

            const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);
            setImageUrl(data.publicUrl);
            setPreviewUrl(data.publicUrl);
            setStatus('idle');

        } catch (error) {
            console.error('Error procesando la imagen externa:', error);
            // Fallback: si falla la compresión/S3, usamos la URL externa directo
            setImageUrl(externalUrl);
            setPreviewUrl(externalUrl);
            setStatus('idle');
        }
    }, [bucketName, deleteFromStorage, profile?.business_id]);

    // Reset image (local only, doesn't delete from storage)
    const resetImage = useCallback(() => {
        setImageUrl(null);
        setPreviewUrl(null);
        setShowCropper(false);
        setCropperImageSrc(null);
        setStatus('idle');
        // Arranca un ciclo nuevo (ej. "Crear otro"): reactivamos la limpieza de
        // huérfanos para la próxima imagen que se suba y no se llegue a guardar.
        savedRef.current = false;
    }, []);

    // On mount: cleanup orphaned images from previous sessions (reload/close)
    useEffect(() => {
        cleanupOrphans(bucketName);
    }, [bucketName]);

    // Cleanup on unmount - delete uploaded image if product wasn't saved
    useEffect(() => {
        return () => {
            if (uploadedFilePathRef.current && !savedRef.current) {
                removeOrphan(uploadedFilePathRef.current);
                supabase.storage
                    .from(bucketName)
                    .remove([uploadedFilePathRef.current])
                    .catch(() => { });
            }
        };
    }, [bucketName]);

    // Internal function to process a file (used by select and paste)
    const processFile = useCallback((file: File) => {
        if (!file.type.startsWith('image/')) {
            showToast('Por favor selecciona un archivo de imagen válido.', 'warning');
            return;
        }
        const objectUrl = URL.createObjectURL(file);
        setCropperImageSrc(objectUrl);
        setShowCropper(true);
        setStatus('cropping');
    }, [showToast]);

    // When user selects an image via JSX input (desktop fallback)
    const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        const capturedFile = new File([file], file.name, { type: file.type, lastModified: file.lastModified });
        e.target.value = '';
        processFile(capturedFile);
    }, [processFile]);

    const processFileRef = useRef(processFile);
    processFileRef.current = processFile;

    const triggerGalleryInput = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        document.body.appendChild(input);

        input.addEventListener('change', () => {
            if (input.files && input.files.length > 0) {
                const file = input.files[0];
                processFileRef.current(new File([file], file.name, { type: file.type, lastModified: file.lastModified }));
            }
            if (document.body.contains(input)) document.body.removeChild(input);
        });

        const handleFocus = () => {
            setTimeout(() => {
                if (document.body.contains(input)) document.body.removeChild(input);
                window.removeEventListener('focus', handleFocus);
            }, 1000);
        };
        window.addEventListener('focus', handleFocus);
        input.click();
    }, []);

    const triggerCamera = useCallback(() => {
        setShowInAppCamera(true);
    }, []);

    const onCameraCapture = useCallback((file: File) => {
        setShowInAppCamera(false);
        processFileRef.current(file);
    }, []);

    const onCameraClose = useCallback(() => {
        setShowInAppCamera(false);
    }, []);

    // Cámara de documento: abre captura de una sola toma (vertical, sin cropper)
    const triggerDocumentCamera = useCallback(() => {
        setShowDocumentCamera(true);
    }, []);

    const onDocumentCameraClose = useCallback(() => {
        setShowDocumentCamera(false);
    }, []);

    const triggerGallery = useCallback(() => triggerGalleryInput(), [triggerGalleryInput]);

    // Handle paste event (Ctrl+V)
    const handlePaste = useCallback((e: ClipboardEvent) => {
        // Prevent default paste behavior if we're handling an image
        if (e.clipboardData && e.clipboardData.items) {
            const items = e.clipboardData.items;

            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        e.preventDefault(); // Only prevent default if we found an image
                        processFile(file);
                        return; // Process only the first image found
                    }
                }
            }
        }
    }, [processFile]);

    // Handle paste button click
    const handlePasteClick = useCallback(async () => {
        // Algunos navegadores móviles (Firefox Android, WebViews antiguos) no exponen
        // clipboard.read(). Avisamos con un mensaje claro en vez de un error genérico.
        if (typeof navigator === 'undefined' || !navigator.clipboard?.read) {
            showToast('Este navegador no permite pegar imágenes. Usa Cámara o Subir foto.', 'info');
            return;
        }

        try {
            const clipboardItems = await navigator.clipboard.read();
            for (const item of clipboardItems) {
                // Find image type
                const imageType = item.types.find(type => type.startsWith('image/'));
                if (imageType) {
                    const blob = await item.getType(imageType);
                    const file = new File([blob], "pasted-image.png", { type: imageType });
                    processFile(file);
                    return;
                }
            }
            showToast('No se encontró ninguna imagen en el portapapeles', 'info');
        } catch (err) {
            console.error('Failed to read clipboard contents: ', err);
            showToast('Permiso denegado para leer el portapapeles o navegador no soportado', 'error');
        }
    }, [processFile, showToast]);

    // Called when user confirms the crop.
    // `removeBg` is true when the blob was already processed by ImageCropper.
    const onCropComplete = useCallback(async (croppedBlob: Blob, removeBg: boolean = false) => {
        try {
            setShowCropper(false);
            setStatus('compressing');

            // If there's an existing uploaded image (from this session), delete it
            if (uploadedFilePathRef.current) {
                await deleteFromStorage(uploadedFilePathRef.current);
                uploadedFilePathRef.current = null;
            }

            // If there's an original image from the product being edited, delete it
            if (originalImageUrlRef.current) {
                const originalPath = extractFilePathFromUrl(originalImageUrlRef.current, bucketName);
                if (originalPath) await deleteFromStorage(originalPath);
                originalImageUrlRef.current = null;
            }

            // Create preview
            const previewObjectUrl = URL.createObjectURL(croppedBlob);
            setPreviewUrl(previewObjectUrl);

            // Detect format: blob is PNG when bg was removed (transparent)
            const isPng = removeBg || croppedBlob.type === 'image/png';
            const extension = isPng ? 'png' : 'webp';
            const contentType = isPng ? 'image/png' : 'image/webp';
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`;
            const filePath = `${profile?.business_id}/${fileName}`;

            setStatus('uploading');

            const { error: uploadError } = await supabase.storage
                .from(bucketName)
                .upload(filePath, croppedBlob, { contentType, cacheControl: '31536000' });

            if (uploadError) throw uploadError;

            uploadedFilePathRef.current = filePath;
            saveOrphan(filePath);

            const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);
            setImageUrl(data.publicUrl);
            setStatus('idle');

            if (cropperImageSrc) {
                URL.revokeObjectURL(cropperImageSrc);
                setCropperImageSrc(null);
            }

        } catch (error: any) {
            console.error('Error uploading image:', error.message);
            showToast('Error al subir la imagen. Intente nuevamente.', 'error');
            setPreviewUrl(null);
            setStatus('idle');
        }
    }, [profile?.business_id, cropperImageSrc, deleteFromStorage, showToast, bucketName]);

    // Called when user cancels the crop
    const onCropCancel = useCallback(() => {
        setShowCropper(false);
        setStatus('idle');

        // Clean up cropper image URL
        if (cropperImageSrc) {
            URL.revokeObjectURL(cropperImageSrc);
            setCropperImageSrc(null);
        }
    }, [cropperImageSrc]);

    // Sube un File directamente (sin cropper): comprime a WebP y sube al bucket.
    // Pensado para captura de documento de una sola toma. Devuelve la URL pública.
    const uploadFileDirect = useCallback(async (file: File): Promise<string | null> => {
        try {
            setStatus('compressing');

            // Crear preview inmediato
            const previewObjectUrl = URL.createObjectURL(file);
            setPreviewUrl(previewObjectUrl);

            // Borrar imagen previa de esta sesión si existe
            if (uploadedFilePathRef.current) {
                await deleteFromStorage(uploadedFilePathRef.current);
                uploadedFilePathRef.current = null;
            }
            if (originalImageUrlRef.current) {
                const originalPath = extractFilePathFromUrl(originalImageUrlRef.current, bucketName);
                if (originalPath) await deleteFromStorage(originalPath);
                originalImageUrlRef.current = null;
            }

            // Comprimir a WebP máx. 1600px
            const bitmap = await createImageBitmap(file);
            let w = bitmap.width;
            let h = bitmap.height;
            const maxDim = 1600;
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
            const blob = await new Promise<Blob | null>(resolve =>
                canvas.toBlob(resolve, 'image/webp', 0.8)
            );
            canvas.width = 0;
            canvas.height = 0;
            if (!blob) throw new Error('Compresión fallida');

            setStatus('uploading');
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.webp`;
            const filePath = `${profile?.business_id}/${fileName}`;
            const { error: uploadError } = await supabase.storage
                .from(bucketName)
                .upload(filePath, blob, { contentType: 'image/webp', cacheControl: '31536000' });
            if (uploadError) throw uploadError;

            uploadedFilePathRef.current = filePath;
            saveOrphan(filePath);

            const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);
            setImageUrl(data.publicUrl);
            setStatus('idle');
            return data.publicUrl;
        } catch (error: any) {
            console.error('Error uploading document image:', error?.message || error);
            showToast('Error al subir la imagen. Intente nuevamente.', 'error');
            setPreviewUrl(null);
            setStatus('idle');
            return null;
        }
    }, [profile?.business_id, deleteFromStorage, showToast, bucketName]);

    return {
        imageUrl,
        uploading,
        status,
        statusText,
        handleImageSelect,
        handlePaste,
        handlePasteClick,
        previewUrl,
        resetImage,
        deleteImage,
        showCropper,
        cropperImageSrc,
        onCropComplete,
        onCropCancel,
        markAsSaved,
        triggerCamera,
        triggerGallery,
        showInAppCamera,
        onCameraCapture,
        onCameraClose,
        downloadAndCompressExternalImage,
        // Cámara de documento (una toma, sin cropper) + subida directa
        showDocumentCamera,
        triggerDocumentCamera,
        onDocumentCameraClose,
        uploadFileDirect,
    };
};
