import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
}

const AsciiModal: React.FC<{ code: string; onClose: () => void }> = ({ code, onClose }) => {
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Ignorado
    }
  };

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ animation: 'fadeInOverlay 0.15s ease-out' }}
      onClick={onClose}
    >
      <style>{`
        @keyframes fadeInOverlay { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUpModal { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
      <div
        className="bg-slate-900 border border-slate-700/50 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl flex flex-col shadow-2xl overflow-hidden"
        style={{ animation: 'slideUpModal 0.2s ease-out', maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 shrink-0 bg-slate-950/60">
          <div className="flex items-center gap-2 text-slate-200">
            <span className="material-symbols-outlined text-amber-500 text-[18px]">terminal</span>
            <span className="text-[13px] font-bold">Vista de Mockup</span>
          </div>
          <button
            onClick={onClose}
            className="size-8 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition active:scale-95"
            aria-label="Cerrar"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Contenido */}
        <div className="overflow-auto p-4 sm:p-6 bg-slate-950">
          <pre className="font-mono text-[14px] sm:text-[16px] md:text-[18px] text-slate-100 leading-relaxed whitespace-pre m-0">
            {code}
          </pre>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-800 shrink-0 bg-slate-950/60 flex items-center justify-between">
          <span className="text-[10px] sm:text-[11px] text-slate-500">Toca dos veces para seleccionar todo</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition active:scale-95 font-semibold text-[12px]"
          >
            <span className="material-symbols-outlined text-[14px]">
              {isCopied ? 'check' : 'content_copy'}
            </span>
            {isCopied ? 'Copiado' : 'Copiar'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const PreComponent: React.FC<{ children?: React.ReactNode; [key: string]: any }> = ({ children, ...props }) => {
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [isPreCopied, setIsPreCopied] = useState(false);

  const getCodeText = (): string => {
    try {
      const codeEl = React.Children.toArray(children)[0] as React.ReactElement<{ children?: React.ReactNode }>;
      if (codeEl?.props?.children) return String(codeEl.props.children).trim();
    } catch {
      // Fallback
    }
    return '';
  };

  const codeText = getCodeText();

  const handleExpand = () => { if (codeText) setExpandedCode(codeText); };

  const handleCopy = async () => {
    if (!codeText) return;
    try {
      await navigator.clipboard.writeText(codeText);
      setIsPreCopied(true);
      setTimeout(() => setIsPreCopied(false), 2000);
    } catch {
      // Ignorado
    }
  };

  return (
    <>
      <div className="relative group/pre my-2.5">
        <div
          onClick={handleExpand}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleExpand(); } }}
          tabIndex={0}
          role="button"
          aria-label="Ver mockup a pantalla completa"
          className="w-full text-left cursor-zoom-in rounded-xl border border-slate-200/80 dark:border-slate-800/80 hover:border-amber-400 dark:hover:border-amber-500 transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
        >
          <pre className="m-0 !bg-slate-900 dark:!bg-slate-950 !text-slate-100 !rounded-xl !p-4 !overflow-x-auto !text-[12px] !leading-snug font-mono select-none" {...props}>
            {children}
          </pre>
        </div>

        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 opacity-0 group-hover/pre:opacity-100 transition-opacity duration-200">
          <button
            onClick={(e) => { e.stopPropagation(); handleCopy(); }}
            className="size-7 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/50 flex items-center justify-center transition active:scale-95"
            title="Copiar"
            aria-label="Copiar código"
          >
            <span className="material-symbols-outlined text-[15px]">
              {isPreCopied ? 'check' : 'content_copy'}
            </span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleExpand(); }}
            className="size-7 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/50 flex items-center justify-center transition active:scale-95"
            title="Ampliar"
            aria-label="Ampliar vista"
          >
            <span className="material-symbols-outlined text-[15px]">fullscreen</span>
          </button>
        </div>
      </div>

      {expandedCode && (
        <AsciiModal code={expandedCode} onClose={() => setExpandedCode(null)} />
      )}
    </>
  );
};

const ImageModal: React.FC<{ src: string; alt: string; onClose: () => void }> = ({ src, alt, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
      style={{ animation: 'fadeInOverlay 0.15s ease-out' }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 size-9 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition active:scale-95"
        aria-label="Cerrar"
      >
        <span className="material-symbols-outlined text-[20px]">close</span>
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-[90vh] rounded-xl object-contain shadow-2xl"
        style={{ animation: 'slideUpModal 0.2s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
};

const ClickableImage: React.FC<React.ImgHTMLAttributes<HTMLImageElement>> = ({ src, alt = '', className, ...props }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <img
        src={src}
        alt={alt}
        className={`${className ?? ''} cursor-zoom-in`}
        onClick={() => setOpen(true)}
        {...props}
      />
      {open && <ImageModal src={src!} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
};

const VIDEO_EXT = /\.(mp4|mov|webm|avi|mkv)/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|avif)/i;
// Archivos que deben descargarse directamente en vez de abrirse en una pestaña.
const DOWNLOAD_EXT = /\.(zip|rar|7z|exe|msi|dmg|apk|pdf)(\?|$)/i;

// Enlace de descarga: baja el archivo como blob y lo guarda sin abrir otra
// pestaña del navegador. Cae de vuelta a un enlace normal si el fetch falla
// (p. ej. sin CORS o sin conexión).
const DownloadLink: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children, ...props }) => {
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (isDownloading) return;
    const fileName = href.split('/').pop()?.split('?')[0] || 'descarga';
    setIsDownloading(true);
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error('fetch failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: navegación directa si el blob falla
      window.location.href = href;
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <a href={href} onClick={handleDownload} {...props}>
      {children}
      {isDownloading && <span className="ml-1 text-[11px] opacity-70">(descargando…)</span>}
    </a>
  );
};

// Busca recursivamente en el árbol hast una URL de Cloudinary dentro de un
// elemento <code> o <a>. react-markdown v10 pasa nodos hast (no mdast), por
// lo que inlineCode aparece como { type:'element', tagName:'code' } — no como
// { type:'inlineCode' }. El enfoque anterior con hastText + regex fallaba porque
// nunca encontraba el tipo 'inlineCode' en hast.
function findCloudinaryUrl(node: any): { url: string; kind: 'video' | 'image' } | null {
  if (!node) return null;

  if (node.type === 'element') {
    // <code>`url`</code>  →  texto directo de sus hijos
    if (node.tagName === 'code') {
      const url = (node.children ?? [])
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.value as string)
        .join('');
      if (url.includes('cloudinary.com')) {
        if (VIDEO_EXT.test(url)) return { url, kind: 'video' };
        if (IMAGE_EXT.test(url)) return { url, kind: 'image' };
      }
    }
    // <a href="url">...</a>
    if (node.tagName === 'a') {
      const href: string = node.properties?.href ?? '';
      if (href.includes('cloudinary.com')) {
        if (VIDEO_EXT.test(href)) return { url: href, kind: 'video' };
        if (IMAGE_EXT.test(href)) return { url: href, kind: 'image' };
      }
    }
    // Recurrir en hijos
    for (const child of (node.children ?? [])) {
      const found = findCloudinaryUrl(child);
      if (found) return found;
    }
  }

  return null;
}

// Detecta si un blockquote del markdown contiene una imagen o video de guía
// y lo renderiza como <img> o <video> en lugar de blockquote de texto.
const BlockquoteMedia: React.FC<React.BlockquoteHTMLAttributes<HTMLQuoteElement> & { node?: any }> = ({ children, node }) => {
  const media = findCloudinaryUrl(node);

  if (media?.kind === 'image') {
    return (
      <ClickableImage
        src={media.url}
        alt="imagen guía"
        className="rounded-xl max-h-72 w-full object-contain my-2 border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-900"
      />
    );
  }
  if (media?.kind === 'video') {
    return (
      <video
        src={media.url}
        controls
        className="w-full rounded-xl my-2 max-h-72 border border-slate-200 dark:border-slate-700 shadow-sm"
      />
    );
  }
  return (
    <blockquote className="border-l-4 border-sky-400 bg-sky-50/70 dark:bg-sky-900/10 rounded-r-lg py-1 pl-4 not-italic my-2">
      {children}
    </blockquote>
  );
};

const ChatMessageInner: React.FC<Props> = ({ content }) => {
  const clean = content
    .replace(/\(Fuente\s+\d+[^)]*\)/gi, '')
    // Des-indenta los blockquotes generados por el system prompt (media y tips).
    // Cuando Gemini coloca un  > 🎬 Video / > 📸 Imagen / > 💡 tip  dentro de un
    // paso numerado, lo indenta con 4+ espacios; Markdown entonces lo interpreta
    // como bloque de código y se pierde el render (las imágenes/videos aparecen
    // como links y los tips como caja de código). Llevarlos al margen permite que
    // BlockquoteMedia los capture y los embeba como media/blockquote real.
    .replace(/^[ \t]+(>\s*(?:🎬|📸|💡|⚠️|🔒|🤖))/gmu, '$1')
    .trim();

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none
                    prose-p:my-1 prose-p:leading-relaxed
                    prose-h1:text-slate-800 dark:prose-h1:text-slate-100 prose-h1:font-bold prose-h1:mt-4 prose-h1:mb-2
                    prose-h2:text-slate-600 dark:prose-h2:text-slate-300 prose-h2:font-semibold prose-h2:mt-3 prose-h2:mb-1
                    prose-h3:text-indigo-600 dark:prose-h3:text-indigo-400 prose-h3:font-semibold prose-h3:mt-3 prose-h3:mb-1
                    prose-h4:text-sky-600 dark:prose-h4:text-sky-400 prose-h4:font-medium prose-h4:mt-2 prose-h4:mb-0.5
                    prose-strong:font-semibold
                    prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5
                    prose-table:text-sm prose-th:bg-slate-50 dark:prose-th:bg-gray-800 prose-th:font-semibold prose-th:text-slate-600 dark:prose-th:text-slate-300
                    prose-a:text-indigo-600 dark:prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline
                    [&_:not(pre)>code]:bg-slate-100 dark:[&_:not(pre)>code]:bg-slate-700/60
                    [&_:not(pre)>code]:text-slate-700 dark:[&_:not(pre)>code]:text-slate-200
                    [&_:not(pre)>code]:rounded [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5
                    [&_:not(pre)>code]:font-medium
                    [&_:not(pre)>code]:border [&_:not(pre)>code]:border-slate-200 dark:[&_:not(pre)>code]:border-slate-600
                    [&_:not(pre)>code]:before:content-none [&_:not(pre)>code]:after:content-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: PreComponent,
          blockquote: BlockquoteMedia,
          code: ({ children, className, node, ...props }: any) => {
            // Si tiene className (language-xxx) es code block dentro de <pre>, no interferir
            if (className) return <code className={className} {...props}>{children}</code>;
            // Detectar URLs de Cloudinary en inline code y renderizarlas como media
            const text = String(children).trim();
            if (text.includes('res.cloudinary.com')) {
              if (VIDEO_EXT.test(text)) {
                return <video src={text} controls className="w-full rounded-xl my-2 max-h-72 border border-slate-200 dark:border-slate-700 shadow-sm" />;
              }
              if (IMAGE_EXT.test(text)) {
                return <ClickableImage src={text} alt="imagen guía" className="rounded-xl max-h-72 w-full object-contain my-2 border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-900" />;
              }
            }
            return <code {...props}>{children}</code>;
          },
          a: ({ href, children, ...props }) => {
            if (href?.includes('res.cloudinary.com')) {
              if (VIDEO_EXT.test(href)) {
                return <video src={href} controls className="w-full rounded-xl my-2 max-h-72 border border-slate-200 dark:border-slate-700 shadow-sm" />;
              }
              if (IMAGE_EXT.test(href)) {
                return <ClickableImage src={href} alt={String(children)} className="rounded-xl max-h-72 w-full object-contain my-2 border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-900" />;
              }
            }
            if (href && DOWNLOAD_EXT.test(href)) {
              return <DownloadLink href={href} {...props}>{children}</DownloadLink>;
            }
            return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
          },
        }}
      >
        {clean}
      </ReactMarkdown>
    </div>
  );
};

export const ChatMessage = React.memo(ChatMessageInner);
