// TutorialDevManager: panel de gestión de tutoriales visible SOLO en desarrollo.
//
// Todos los sitios que montan este componente ya lo gatean con
// `import.meta.env.DEV`, por lo que en producción el bundler puede eliminar
// tanto el render como los imports que hace el widget. El archivo en sí NO se
// auto-elimina si alguien lo importa sin gate: por eso evita imports pesados
// y se apoya en helpers ligeros de `./tutorials` que ya viven en el bundle.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DevTutorialEntry, buildTutorialSnippet } from './tutorials';

export interface TutorialDevManagerProps {
  open: boolean;
  onClose: () => void;
  onPreview: (entry: { title: string; content: string }) => void;
  onAdd: (entry: DevTutorialEntry) => void;
}

interface DiscoveredGuide {
  sourceFile: string; // nombre del archivo (ej. "como_crear_productos.md")
  content: string; // markdown completo (puede quedar vacío si el archivo está vacío)
}

// Slug simple para derivar un `id` a partir del título del desarrollador (o del
// nombre de archivo si el título viene vacío al copiar): minúsculas, sin acentos,
// separadores → guión, colapsando y recortando extremos.
const slugify = (raw: string): string => {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

export const TutorialDevManager: React.FC<TutorialDevManagerProps> = ({
  open,
  onClose,
  onPreview,
  onAdd,
}) => {
  // Autodescubrimiento (Req 7.3): resolvemos el mapa {ruta → markdown} en build.
  // Se calcula una sola vez con `useMemo` (arreglo estable) para no rehacer el
  // trabajo en cada render, aunque el glob es eager y el costo es despreciable.
  const guides = useMemo<DiscoveredGuide[]>(() => {
    const map = import.meta.glob('../../docs/guias_usuario/*.md', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>;

    return Object.entries(map)
      .map(([path, content]) => {
        const sourceFile = path.split('/').pop() ?? path;
        return { sourceFile, content };
      })
      .sort((a, b) => a.sourceFile.localeCompare(b.sourceFile));
  }, []);

  // Estado local del panel.
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [fallbackSnippet, setFallbackSnippet] = useState<{ sourceFile: string; snippet: string } | null>(null);
  const [errorByFile, setErrorByFile] = useState<Record<string, string>>({});
  const [addedFile, setAddedFile] = useState<string | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Limpieza de timeouts al desmontar para evitar fugas y set-state fuera de tiempo.
  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
    };
  }, []);

  // Cerrar con Escape y clic fuera, solo mientras el panel está abierto.
  // Sigue el mismo patrón que el lightbox del widget (listeners globales +
  // cleanup en el return).
  useEffect(() => {
    if (!open) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleGlobalMouseDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('mousedown', handleGlobalMouseDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener('mousedown', handleGlobalMouseDown);
    };
  }, [open, onClose]);

  const handleTitleChange = useCallback((sourceFile: string, value: string) => {
    setTitles(prev => ({ ...prev, [sourceFile]: value }));
    // Al escribir, borramos cualquier error de validación previo.
    setErrorByFile(prev => {
      if (!prev[sourceFile]) return prev;
      const next = { ...prev };
      delete next[sourceFile];
      return next;
    });
  }, []);

  const requireTitle = useCallback(
    (sourceFile: string): string | null => {
      const title = (titles[sourceFile] ?? '').trim();
      if (!title) {
        setErrorByFile(prev => ({ ...prev, [sourceFile]: 'Escribe un título para el tutorial.' }));
        return null;
      }
      return title;
    },
    [titles]
  );

  const handlePreview = useCallback(
    (sourceFile: string, content: string) => {
      if (!content.trim()) return;
      const title = requireTitle(sourceFile);
      if (!title) return;
      onPreview({ title, content });
      // Cerramos el panel para que el usuario vea el resultado en el chat.
      onClose();
    },
    [onPreview, onClose, requireTitle]
  );

  const handleAdd = useCallback(
    (sourceFile: string, content: string) => {
      if (!content.trim()) return;
      const title = requireTitle(sourceFile);
      if (!title) return;
      const id = slugify(title) || slugify(sourceFile.replace(/\.md$/i, '')) || sourceFile;
      const entry: DevTutorialEntry = { id, title, sourceFile };
      onAdd(entry);

      // Feedback breve: marcar como "Agregado" durante 2s.
      setAddedFile(sourceFile);
      if (addedTimeoutRef.current) clearTimeout(addedTimeoutRef.current);
      addedTimeoutRef.current = setTimeout(() => setAddedFile(null), 2000);
    },
    [onAdd, requireTitle]
  );

  const handleCopySnippet = useCallback(
    async (sourceFile: string) => {
      // Para copiar no exigimos título: si el input está vacío, derivamos uno
      // legible desde el nombre del archivo para que el snippet sea utilizable.
      const rawTitle = (titles[sourceFile] ?? '').trim();
      const fallbackTitle = sourceFile
        .replace(/\.md$/i, '')
        .replace(/[_-]+/g, ' ')
        .trim();
      const title = rawTitle || fallbackTitle;
      const id = slugify(title) || slugify(sourceFile.replace(/\.md$/i, '')) || sourceFile;

      const snippet = buildTutorialSnippet({ id, title, sourceFile });

      try {
        if (!navigator.clipboard) throw new Error('clipboard-unavailable');
        await navigator.clipboard.writeText(snippet);
        setCopiedFile(sourceFile);
        if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
        copiedTimeoutRef.current = setTimeout(() => setCopiedFile(null), 2000);
      } catch {
        // Fallback: exponer el snippet en un <textarea> para copiar manualmente.
        setFallbackSnippet({ sourceFile, snippet });
      }
    },
    [titles]
  );

  const handleDismissFallback = useCallback(() => {
    setFallbackSnippet(null);
  }, []);

  const handlePanelMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Detenemos la propagación para que el listener global de mousedown no
    // interprete el clic interno como "fuera del panel".
    e.stopPropagation();
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[210] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Gestionar tutoriales"
        onMouseDown={handlePanelMouseDown}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] flex flex-col bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Encabezado */}
        <div className="flex items-start gap-3 px-4 py-3 border-b border-border-light dark:border-border-dark shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-[14px] md:text-[15px] font-bold text-text-main dark:text-white leading-tight">
              Gestionar tutoriales (desarrollo)
            </h2>
            <p className="text-[11px] md:text-[12px] text-text-secondary leading-snug mt-0.5">
              Herramienta local: no afecta a producción. Copia el snippet para agregar el tutorial de forma permanente.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
            aria-label="Cerrar"
            title="Cerrar"
            tabIndex={0}
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Lista de guías */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 custom-scrollbar">
          {guides.length === 0 ? (
            <p className="text-[12px] text-text-secondary text-center py-6">
              No se detectaron archivos .md en docs/guias_usuario/.
            </p>
          ) : (
            guides.map(({ sourceFile, content }) => {
              const isEmpty = !content.trim();
              const title = titles[sourceFile] ?? '';
              const errorMsg = errorByFile[sourceFile];
              const wasCopied = copiedFile === sourceFile;
              const wasAdded = addedFile === sourceFile;
              const showFallback = fallbackSnippet?.sourceFile === sourceFile;

              return (
                <div
                  key={sourceFile}
                  className="rounded-xl border border-border-light dark:border-border-dark bg-background-light dark:bg-gray-800/40 p-3 space-y-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[16px] shrink-0">description</span>
                    <p className="text-[12px] md:text-[13px] font-mono text-text-main dark:text-gray-100 truncate flex-1">
                      {sourceFile}
                    </p>
                  </div>

                  {isEmpty && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg px-2 py-1.5">
                      Esta guía no tiene contenido.
                    </p>
                  )}

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-text-secondary mb-1 ml-0.5">
                      Título del tutorial
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => handleTitleChange(sourceFile, e.target.value)}
                      placeholder="Título del tutorial"
                      className="w-full border border-border-light dark:border-gray-700 rounded-lg px-3 py-2 text-[13px] bg-white dark:bg-gray-800/70 text-text-main dark:text-gray-100 placeholder-gray-400 outline-none focus:border-amber-400 dark:focus:border-amber-500 focus:ring-2 focus:ring-amber-400/20 transition-colors"
                      aria-label={`Título del tutorial para ${sourceFile}`}
                    />
                    {errorMsg && (
                      <p className="mt-1 text-[11px] text-red-500 font-medium" role="alert">
                        {errorMsg}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handlePreview(sourceFile, content)}
                      disabled={isEmpty}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-400 hover:bg-amber-500 disabled:bg-gray-200 dark:disabled:bg-gray-700/50 disabled:text-gray-400 disabled:cursor-not-allowed text-amber-950 text-[11px] font-bold transition-all active:scale-95"
                      aria-label={`Previsualizar ${sourceFile}`}
                      tabIndex={0}
                    >
                      <span className="material-symbols-outlined text-[14px]">visibility</span>
                      Previsualizar
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAdd(sourceFile, content)}
                      disabled={isEmpty || wasAdded}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 dark:disabled:bg-gray-700/50 disabled:text-gray-400 disabled:cursor-not-allowed text-white text-[11px] font-bold transition-all active:scale-95"
                      aria-label={`Agregar ${sourceFile} a la sesión`}
                      tabIndex={0}
                    >
                      <span className="material-symbols-outlined text-[14px]">add</span>
                      Agregar a la sesión
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopySnippet(sourceFile)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-border-light dark:border-border-dark bg-white dark:bg-gray-800 text-text-main dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 text-[11px] font-bold transition-all active:scale-95"
                      aria-label={`Copiar snippet de configuración para ${sourceFile}`}
                      tabIndex={0}
                    >
                      <span className="material-symbols-outlined text-[14px]">content_copy</span>
                      Copiar config
                    </button>

                    {wasCopied && (
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400" role="status">
                        Copiado ✓
                      </span>
                    )}
                    {wasAdded && (
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400" role="status">
                        Agregado ✓
                      </span>
                    )}
                  </div>

                  {showFallback && fallbackSnippet && (
                    <div className="mt-2 space-y-1.5">
                      <p className="text-[11px] text-text-secondary">
                        Tu navegador bloqueó el portapapeles. Copia manualmente el snippet de abajo:
                      </p>
                      <textarea
                        readOnly
                        value={fallbackSnippet.snippet}
                        onFocus={(e) => e.currentTarget.select()}
                        className="w-full h-24 text-[11px] font-mono bg-white dark:bg-gray-900 border border-border-light dark:border-border-dark rounded-lg p-2 text-text-main dark:text-gray-100 resize-none focus:outline-none focus:border-amber-400"
                        aria-label={`Snippet de configuración para ${sourceFile}`}
                      />
                      <button
                        type="button"
                        onClick={handleDismissFallback}
                        className="text-[11px] font-semibold text-text-secondary hover:text-text-main transition"
                        aria-label="Cerrar snippet"
                        tabIndex={0}
                      >
                        Cerrar
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
