import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface UploadResult {
    url: string;
    path: string;
}

export const useStorage = () => {
    const { profile } = useAuth();
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Upload a file to Supabase Storage
     * @param file - The file to upload
     * @param bucket - The storage bucket name (default: 'product-images')
     * @param folder - Optional subfolder within the bucket
     * @returns The public URL and path of the uploaded file
     */
    const uploadFile = async (
        file: File,
        bucket: string = 'product-images',
        folder?: string
    ): Promise<UploadResult | null> => {
        if (!profile?.business_id) {
            setError('No business ID available');
            return null;
        }

        setUploading(true);
        setError(null);

        try {
            // Generate unique filename with business_id prefix for organization
            const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
            const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = folder
                ? `${profile.business_id}/${folder}/${uniqueName}`
                : `${profile.business_id}/${uniqueName}`;

            // Upload to Supabase Storage
            const { data, error: uploadError } = await supabase.storage
                .from(bucket)
                .upload(filePath, file, {
                    cacheControl: '31536000',
                    upsert: true,
                });

            if (uploadError) {
                throw uploadError;
            }

            // Get public URL
            const { data: { publicUrl } } = supabase.storage
                .from(bucket)
                .getPublicUrl(data.path);

            return {
                url: publicUrl,
                path: data.path,
            };
        } catch (err: any) {
            console.error('Error uploading file:', err);
            setError(err.message || 'Error uploading file');
            return null;
        } finally {
            setUploading(false);
        }
    };

    /**
     * Upload a product image
     * @param file - The image file
     * @returns The public URL and path
     */
    const uploadProductImage = async (file: File): Promise<UploadResult | null> => {
        // Validate file type
        const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!validTypes.includes(file.type)) {
            setError('Tipo de archivo no válido. Use JPG, PNG, WebP o GIF.');
            return null;
        }

        // Validate file size (max 5MB)
        const maxSize = 5 * 1024 * 1024;
        if (file.size > maxSize) {
            setError('El archivo es muy grande. Máximo 5MB.');
            return null;
        }

        return await uploadFile(file, 'product-images');
    };

    /**
     * Delete a file from Supabase Storage
     * @param path - The file path to delete
     * @param bucket - The storage bucket name
     */
    const deleteFile = async (path: string, bucket: string = 'product-images'): Promise<boolean> => {
        try {
            const { error: deleteError } = await supabase.storage
                .from(bucket)
                .remove([path]);

            if (deleteError) {
                throw deleteError;
            }

            return true;
        } catch (err: any) {
            console.error('Error deleting file:', err);
            setError(err.message || 'Error deleting file');
            return false;
        }
    };

    /**
     * Upload image from base64 data URL
     * @param dataUrl - Base64 data URL (e.g., from canvas or file reader)
     * @param filename - Optional filename
     */
    const uploadFromDataUrl = async (
        dataUrl: string,
        filename?: string
    ): Promise<UploadResult | null> => {
        try {
            // Convert data URL to blob
            const response = await fetch(dataUrl);
            const blob = await response.blob();

            // Create File from blob
            const file = new File(
                [blob],
                filename || `image-${Date.now()}.jpg`,
                { type: blob.type || 'image/jpeg' }
            );

            return await uploadProductImage(file);
        } catch (err: any) {
            console.error('Error uploading from data URL:', err);
            setError(err.message || 'Error uploading image');
            return null;
        }
    };

    return {
        uploadFile,
        uploadProductImage,
        uploadFromDataUrl,
        deleteFile,
        uploading,
        error,
        clearError: () => setError(null),
    };
};
