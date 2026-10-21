import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { invokeEdgeFunction } from '../utils/invokeEdgeFunction';

export interface RagDocument {
  id: string;
  name: string;
  size_kb: number | null;
  source_type: 'pdf' | 'video' | 'gif' | 'image' | 'markdown';
  storage_path: string | null;
  external_url: string | null;
  thumbnail_url: string | null;
  uploaded_at: string;
  indexed_at: string | null;
  page_count: number | null;
  status: 'pending' | 'indexed' | 'error';
}

export const useRagDocuments = () => {
  const [documents, setDocuments] = useState<RagDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [indexing, setIndexing] = useState<string | null>(null);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const fetchDocuments = useCallback(async () => {
    const { data, error } = await supabase
      .from('rag_documents')
      .select('*')
      .order('uploaded_at', { ascending: false });
    if (error) console.error('[RAG] fetchDocuments error:', error);
    setDocuments(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDocuments();
    const channel = supabase
      .channel('rag_docs_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rag_documents' }, () => {
        fetchDocuments();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchDocuments]);

  const indexDocument = useCallback(async (docId: string) => {
    setIndexing(docId);
    setIndexError(null);
    try {
      // rag-index tarda ~80s (2 llamadas Gemini + sleeps por chunk). El timeout
      // por defecto de invokeEdgeFunction es 30s, lo que hacía que el cliente
      // mostrara "error" aunque el servidor terminara bien e indexara el doc.
      const { data, error } = await invokeEdgeFunction('rag-index', { docId }, { timeoutMs: 180000 });
      if (error) {
        console.error('[RAG] indexDocument error:', error);
        setIndexError(error);
        throw new Error(error);
      }
      console.log('[RAG] indexDocument success:', data);
    } finally {
      setIndexing(null);
    }
  }, []);

  const uploadDocument = useCallback(async (file: File) => {
    const storagePath = `${Date.now()}_${file.name}`;
    setUploading(true);
    try {
      console.log('[RAG] Uploading to storage:', storagePath);
      const { error: uploadErr } = await supabase.storage
        .from('rag-documents')
        .upload(storagePath, file, { upsert: false });

      if (uploadErr) {
        console.error('[RAG] Storage upload error:', uploadErr);
        throw new Error(`Error al subir archivo: ${uploadErr.message}`);
      }

      const lowerName = file.name.toLowerCase();
      const isMarkdown = lowerName.endsWith('.md') || lowerName.endsWith('.txt');
      const sourceType: RagDocument['source_type'] = isMarkdown
        ? 'markdown'
        : file.type.includes('pdf') ? 'pdf' : 'image';

      console.log('[RAG] Inserting into rag_documents...');
      const { data: doc, error: insertErr } = await supabase
        .from('rag_documents')
        .insert({
          name: file.name,
          size_kb: Math.round(file.size / 1024),
          source_type: sourceType,
          storage_path: storagePath,
          status: 'pending',
        })
        .select()
        .single();

      if (insertErr) {
        console.error('[RAG] DB insert error:', insertErr);
        throw new Error(`Error al registrar documento: ${insertErr.message}`);
      }

      // Refresh inmediato sin depender del realtime
      await fetchDocuments();

      console.log('[RAG] Document registered, auto-indexing...');
      indexDocument(doc.id).catch(err => console.error('[RAG] Auto-index failed:', err));

      return doc;
    } finally {
      setUploading(false);
    }
  }, [indexDocument, fetchDocuments]);

  const addVideoUrl = useCallback(async (name: string, url: string, thumbnailUrl?: string) => {
    const { data: doc, error } = await supabase
      .from('rag_documents')
      .insert({
        name,
        source_type: 'video',
        external_url: url,
        thumbnail_url: thumbnailUrl ?? `https://img.youtube.com/vi/${extractYoutubeId(url)}/hqdefault.jpg`,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    indexDocument(doc.id).catch(err => console.error('[RAG] Auto-index video failed:', err));
    return doc;
  }, [indexDocument]);

  const addGifUrl = useCallback(async (name: string, url: string) => {
    const { data: doc, error } = await supabase
      .from('rag_documents')
      .insert({
        name,
        source_type: 'gif',
        external_url: url,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    indexDocument(doc.id).catch(err => console.error('[RAG] Auto-index gif failed:', err));
    return doc;
  }, [indexDocument]);

  const clearAllDocuments = useCallback(async () => {
    setClearing(true);
    try {
      const { error } = await invokeEdgeFunction('rag-clear', {});
      if (error) throw new Error(error);
    } finally {
      setClearing(false);
    }
  }, []);

  const deleteDocument = useCallback(async (doc: RagDocument) => {
    const { error } = await invokeEdgeFunction('rag-delete', { docId: doc.id });
    if (error) throw new Error(error);
  }, []);

  return {
    documents,
    loading,
    uploading,
    indexing,
    indexError,
    clearing,
    fetchDocuments,
    uploadDocument,
    addVideoUrl,
    addGifUrl,
    indexDocument,
    clearAllDocuments,
    deleteDocument,
  };
};

function extractYoutubeId(url: string): string {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?/]+)/);
  return match?.[1] ?? '';
}
