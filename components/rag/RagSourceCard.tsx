import React, { useRef, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import * as pdfjsLib from 'pdfjs-dist';
import type { RagSource } from '../../hooks/useRagChat';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

interface Props {
  source: RagSource;
  isOpen: boolean;
  onToggle: () => void;
  index: number;
}

export const RagSourceCard: React.FC<Props> = ({ source, isOpen, onToggle, index }) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const hasZoomablePreview =
    (source.source_type === 'pdf' && !!source.signed_url) ||
    (source.source_type === 'image' && !!source.signed_url) ||
    (source.source_type === 'gif' && !!source.gif_url);

  return (
    <>
      <div className={`border rounded-2xl overflow-hidden transition-all duration-300 ${
        isOpen
          ? 'border-amber-400 dark:border-amber-500 shadow-md bg-surface-light dark:bg-surface-dark'
          : 'border-border-light dark:border-border-dark hover:border-gray-300 dark:hover:border-gray-600 bg-surface-light dark:bg-surface-dark shadow-sm'
      }`}>
        <button
          onClick={onToggle}
          className="w-full flex items-start gap-3 p-4 text-left hover:bg-background-light dark:hover:bg-gray-800/50 transition-colors"
          aria-expanded={isOpen}
          aria-label={`Fuente: ${source.source}`}
        >
          <div className="flex-1 min-w-0 pt-0.5">
            <p className="text-[13px] font-bold text-text-main dark:text-white truncate" title={source.source}>
              {source.source}
            </p>
            <div className="flex items-center flex-wrap gap-2 mt-1.5">
              <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
                source.source_type === 'pdf'   ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400 border-rose-200 dark:border-rose-900/50' :
                source.source_type === 'video' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200 dark:border-blue-900/50' :
                source.source_type === 'gif'   ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400 border-purple-200 dark:border-purple-900/50' :
                'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700'
              }`}>
                {source.source_type}
              </span>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-text-secondary">
                <span className="text-amber-600 dark:text-amber-400">Fuente {index + 1}</span>
                {source.page && (
                  <>
                    <span className="size-1 rounded-full bg-gray-300 dark:bg-gray-600"></span>
                    <span>Pág. {source.page}</span>
                  </>
                )}
              </div>
            </div>

          </div>

          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <div className="flex items-center justify-center size-8 rounded-full bg-emerald-50 dark:bg-emerald-900/20">
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">{source.score}%</span>
            </div>
            <span className={`material-symbols-outlined text-[20px] text-text-secondary transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
              keyboard_arrow_down
            </span>
          </div>
        </button>

        {isOpen && (
          <div className="border-t border-border-light dark:border-border-dark bg-background-light dark:bg-background-dark/30 animate-[fadeIn_0.3s_ease-out]">


            <div
              className={`p-4 flex justify-center bg-gray-50 dark:bg-[#0a0a0a] ${hasZoomablePreview ? 'cursor-zoom-in' : ''}`}
              onClick={() => { if (hasZoomablePreview) setLightboxOpen(true); }}
            >
              {source.source_type === 'pdf' && source.signed_url && (
                <div className="w-full max-w-full rounded-lg overflow-hidden shadow-sm border border-gray-200 dark:border-gray-800">
                  <PdfPageRenderer url={source.signed_url} page={source.page} />
                </div>
              )}
              {source.source_type === 'video' && source.video_url && (
                <div
                  className="w-full max-w-full rounded-lg overflow-hidden shadow-sm border border-gray-200 dark:border-gray-800"
                  onClick={e => e.stopPropagation()}
                >
                  <VideoRenderer url={source.video_url} timestamp={source.timestamp_start ?? 0} thumbnail={source.thumbnail_url} />
                </div>
              )}
              {source.source_type === 'gif' && source.gif_url && (
                <img src={source.gif_url} alt={source.source} className="w-full rounded-lg object-contain max-h-64 shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900" />
              )}
              {source.source_type === 'image' && source.signed_url && (
                <img src={source.signed_url} alt={source.source} className="w-full rounded-lg object-contain max-h-64 shadow-sm border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900" />
              )}
              {!source.signed_url && !source.video_url && !source.gif_url && (
                <div className="py-8 flex flex-col items-center justify-center text-text-secondary opacity-50">
                  <span className="material-symbols-outlined text-[32px] mb-2">broken_image</span>
                  <span className="text-xs font-medium">Previsualización no disponible</span>
                </div>
              )}
            </div>

            {hasZoomablePreview && (
              <div className="flex justify-center py-1.5 bg-gray-50 dark:bg-[#0a0a0a] border-t border-border-light dark:border-border-dark">
                <span className="text-[10px] text-text-secondary flex items-center gap-1 opacity-60">
                  <span className="material-symbols-outlined text-[13px]">zoom_in</span>
                  Clic para ampliar
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {lightboxOpen && ReactDOM.createPortal(
        <div className="fixed inset-0 bg-black z-[9999] flex flex-col animate-[fadeIn_0.2s_ease-out]">
          {/* Barra superior */}
          <div className="flex items-center justify-between px-4 py-3 bg-black flex-shrink-0 border-b border-white/10">
            <p className="text-white/60 text-sm truncate max-w-[80%]">
              {source.source}{source.page ? ` · Pág. ${source.page}` : ''}
            </p>
            <button
              className="size-9 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors ml-4 flex-shrink-0"
              onClick={() => setLightboxOpen(false)}
              aria-label="Cerrar"
            >
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>
          </div>

          {/* Contenido — ocupa toda la pantalla restante, scrolleable */}
          <div className="flex-1 overflow-auto bg-black">
            {source.source_type === 'pdf' && source.signed_url && (
              <PdfPageRenderer url={source.signed_url} page={source.page} scale={3.0} />
            )}
            {source.source_type === 'image' && source.signed_url && (
              <img src={source.signed_url} alt={source.source} className="w-full h-auto" />
            )}
            {source.source_type === 'gif' && source.gif_url && (
              <img src={source.gif_url} alt={source.source} className="w-full h-auto" />
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

// --- PDF Page Renderer ---
const PdfPageRenderer: React.FC<{ url: string; page: number; scale?: number }> = ({ url, page, scale = 1.2 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderState, setRenderState] = useState<'loading' | 'done' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    const renderPage = async () => {
      try {
        setRenderState('loading');
        const pdf = await pdfjsLib.getDocument({ url, withCredentials: false }).promise;
        const pg = await pdf.getPage(page);
        const viewport = pg.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        await pg.render({ canvasContext: ctx, viewport } as any).promise;
        if (!cancelled) setRenderState('done');
      } catch (err) {
        console.error('[PdfPageRenderer] Error cargando página:', err);
        if (!cancelled) setRenderState('error');
      }
    };
    renderPage();
    return () => { cancelled = true; };
  }, [url, page, scale]);

  return (
    <div className="relative w-full bg-white dark:bg-gray-900 flex items-center justify-center min-h-[200px]">
      {renderState === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-sm z-10">
          <span className="material-symbols-outlined animate-spin text-rose-500 text-[24px]">refresh</span>
          <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Cargando PDF...</span>
        </div>
      )}
      {renderState === 'error' && (
        <div className="flex flex-col items-center justify-center text-red-500 p-6">
          <span className="material-symbols-outlined text-[32px] mb-2">error</span>
          <p className="text-xs font-medium">No se pudo cargar la página {page}</p>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={`w-full h-auto transition-opacity duration-500 ${renderState === 'done' ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
};

// --- Video Renderer ---
const VideoRenderer: React.FC<{ url: string; timestamp: number; thumbnail: string | null }> = ({ url, timestamp, thumbnail }) => {
  const [playing, setPlaying] = useState(false);
  const embedUrl = getEmbedUrl(url, timestamp);

  if (!playing) {
    return (
      <button type="button" className="relative w-full aspect-video bg-black overflow-hidden group" onClick={() => setPlaying(true)} aria-label="Reproducir video">
        {thumbnail ? (
          <img src={thumbnail} alt="thumbnail" className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-500" />
        ) : (
          <div className="w-full h-full bg-gray-900 flex items-center justify-center">
            <span className="material-symbols-outlined text-gray-700 text-[48px]">ondemand_video</span>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-colors duration-300">
          <div className="size-16 bg-blue-500 rounded-full flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-300 backdrop-blur-md">
            <span className="material-symbols-outlined text-white text-[32px] ml-1">play_arrow</span>
          </div>
        </div>
        {timestamp > 0 && (
          <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/80 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg border border-white/10 shadow-lg">
            <span className="material-symbols-outlined text-[16px] text-blue-400">schedule</span>
            <span className="text-xs font-bold font-mono">Desde {formatTime(timestamp)}</span>
          </div>
        )}
      </button>
    );
  }

  return (
    <div className="w-full aspect-video bg-black">
      <iframe
        src={embedUrl}
        className="w-full h-full border-0"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        title="Video fuente RAG"
      />
    </div>
  );
};

function getEmbedUrl(url: string, timestamp: number): string {
  const youtubeMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?/]+)/);
  if (youtubeMatch) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}?autoplay=1&start=${Math.floor(timestamp)}&rel=0&modestbranding=1`;
  }
  return url;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
