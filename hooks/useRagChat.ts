import { useState, useCallback, useRef } from 'react';
import { stripDevMultimediaSection } from '../components/rag/tutorials';

export interface RagSource {
  source: string;
  source_type: 'pdf' | 'video' | 'gif' | 'image';
  page: number;
  totalPages: number;
  storage_path: string | null;
  signed_url: string | null;
  video_url: string | null;
  timestamp_start: number | null;
  thumbnail_url: string | null;
  gif_url: string | null;
  score: number;
  excerpt: string;
}

export interface RagMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: RagSource[];
  is_about_bistro?: boolean;
  suggestions?: string[];
  // Marca burbujas insertadas por `showTutorial` (contenido literal de guía).
  // Estas burbujas NO se envían al historial de Gemini (Req 3.3).
  kind?: 'tutorial';
}

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/rag-chat`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const useRagChat = () => {
  const [messages, setMessages] = useState<RagMessage[]>([]);
  const [sources, setSources] = useState<RagSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef<Array<{ role: string; content: string }>>([]);

  const sendMessage = useCallback(async (query: string) => {
    if (!query.trim() || loading) return;

    setMessages(prev => [...prev, { role: 'user', content: query }]);
    setLoading(true);
    setError(null);

    // Agregar mensaje vacío del asistente — se llenará token a token
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      console.log('[rag-chat] fetch →', EDGE_URL);
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
          'apikey': ANON_KEY,
        },
        body: JSON.stringify({ query, history: historyRef.current }),
      });

      console.log('[rag-chat] res.status:', res.status, '| content-type:', res.headers.get('content-type'));

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        console.error('[rag-chat] res not ok:', errText);
        throw new Error(errText);
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let lineBuffer = '';
      let cleanAnswer = '';
      let tokenCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) { console.log('[rag-chat] stream done. tokens recibidos:', tokenCount); break; }

        lineBuffer += dec.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;

          let parsed: any;
          try { parsed = JSON.parse(raw); } catch (e) { console.warn('[rag-chat] JSON.parse falló:', raw.slice(0, 100), e); continue; }

          if (parsed.error) {
            console.error('[rag-chat] evento error:', parsed.error);
            throw new Error(parsed.error);
          } else if (parsed.done) {
            console.log('[rag-chat] evento done | bistro:', parsed.bistro, '| suggestions:', parsed.suggestions?.length, '| answer length:', parsed.answer?.length);
            cleanAnswer = parsed.answer ?? '';
            setMessages(prev => prev.map((m, i) =>
              i === prev.length - 1
                ? { ...m, content: cleanAnswer, is_about_bistro: parsed.bistro, suggestions: parsed.suggestions ?? [] }
                : m
            ));
          } else if (parsed.t) {
            tokenCount++;
            if (tokenCount <= 3) console.log('[rag-chat] token #' + tokenCount + ':', JSON.stringify(parsed.t.slice(0, 40)));
            setMessages(prev => prev.map((m, i) =>
              i === prev.length - 1 ? { ...m, content: m.content + parsed.t } : m
            ));
          }
        }
      }

      historyRef.current = [
        ...historyRef.current,
        { role: 'user', content: query },
        { role: 'model', content: cleanAnswer },
      ].slice(-20);

    } catch (err: any) {
      console.error('[rag-chat] catch:', err);
      setMessages(prev => prev.map((m, i) =>
        i === prev.length - 1
          ? { ...m, content: `❌ Error al consultar: ${err.message}` }
          : m
      ));
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  // Muestra un tutorial curado en el chat sin invocar a Gemini/rag-chat.
  // Solo hace `setMessages` (2 burbujas). NO toca `historyRef`, por lo que el
  // contenido de la guía queda excluido del historial que `sendMessage` envía
  // a Gemini (Req 3.3). NO hace `fetch` ni cambia `loading` (Req 2.2).
  const showTutorial = useCallback((tutorial: { title: string; content: string }) => {
    const hasValidContent = !!tutorial.content && tutorial.content.trim() !== '';
    const assistantContent = hasValidContent
      ? stripDevMultimediaSection(tutorial.content)
      : 'No se pudo cargar esta guía. Intenta con otro tutorial.';

    setMessages(prev => [
      ...prev,
      { role: 'user', content: tutorial.title, kind: 'tutorial' },
      { role: 'assistant', content: assistantContent, kind: 'tutorial' },
    ]);
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setSources([]);
    historyRef.current = [];
  }, []);

  return { messages, sources, loading, error, sendMessage, showTutorial, clearChat };
};
