import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Screen } from '../types';
import { useRagChat } from '../hooks/useRagChat';
import { useRagDocuments } from '../hooks/useRagDocuments';
import { ChatMessage } from '../components/rag/ChatMessage';
import { useToast } from '../context/ToastContext';

interface Props {
  onNavigate: (screen: Screen) => void;
  isOnline?: boolean;
}

export const RagChatScreen: React.FC<Props> = ({ onNavigate, isOnline = true }) => {
  const { showToast } = useToast();
  const { messages, loading, sendMessage, clearChat } = useRagChat();
  const {
    documents, indexing, indexError, uploading, clearing,
    uploadDocument, addVideoUrl, addGifUrl,
    indexDocument, clearAllDocuments, deleteDocument, fetchDocuments
  } = useRagDocuments();

  const [input, setInput] = useState('');
  const [showClearModal, setShowClearModal] = useState(false);
  const [showAddVideo, setShowAddVideo] = useState(false);
  const [showAddGif, setShowAddGif] = useState(false);
  const [videoForm, setVideoForm] = useState({ name: '', url: '' });
  const [gifForm, setGifForm] = useState({ name: '', url: '' });
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [leftOpen, setLeftOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isAdmin = import.meta.env.DEV;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return;
    if (!navigator.onLine) {
      showToast('El Asistente IA necesita conexión a internet para responder', 'warning');
      return;
    }
    const q = input;
    setInput('');
    await sendMessage(q);
  }, [input, loading, sendMessage, showToast]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try {
      await uploadDocument(file);
    } catch (err: any) {
      setUploadError(err.message);
    }
    e.target.value = '';
  }, [uploadDocument]);

  const handleAddVideo = useCallback(async () => {
    if (!videoForm.name || !videoForm.url) return;
    try {
      await addVideoUrl(videoForm.name, videoForm.url);
      setVideoForm({ name: '', url: '' });
      setShowAddVideo(false);
    } catch (err: any) {
      setUploadError(err.message);
    }
  }, [videoForm, addVideoUrl]);

  const handleAddGif = useCallback(async () => {
    if (!gifForm.name || !gifForm.url) return;
    try {
      await addGifUrl(gifForm.name, gifForm.url);
      setGifForm({ name: '', url: '' });
      setShowAddGif(false);
    } catch (err: any) {
      setUploadError(err.message);
    }
  }, [gifForm, addGifUrl]);

  const handleClearConfirm = useCallback(async () => {
    await clearAllDocuments();
    setShowClearModal(false);
  }, [clearAllDocuments]);

  const pendingDocs = documents.filter(d => d.status === 'pending');

  if (!isOnline || !navigator.onLine) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full bg-background-light dark:bg-background-dark p-8 text-center gap-5">
        <div className="size-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
          <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>wifi_off</span>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Sin conexión</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-xs">
            El Asistente IA necesita internet para responder preguntas y consultar la base de conocimiento.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-background-light dark:bg-background-dark font-sans text-text-main dark:text-white">

      {/* Mobile: botón flotante documentos (solo admin/dev) */}
      {isAdmin && (
        <div className="lg:hidden fixed bottom-20 left-4 z-30">
          <button
            onClick={() => setLeftOpen(v => !v)}
            className="size-12 rounded-full bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark text-amber-500 flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95"
            aria-label="Panel de documentos"
          >
            <span className="material-symbols-outlined text-[24px]">folder_open</span>
          </button>
        </div>
      )}

      {/* Drawer overlay mobile */}
      {leftOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-20 transition-opacity"
          onClick={() => setLeftOpen(false)}
        />
      )}

      {/* Panel izquierdo — Solo en dev */}
      {isAdmin && (
        <aside className={`
          fixed lg:relative inset-y-0 left-0 z-30 w-72 flex flex-col
          bg-surface-light dark:bg-surface-dark border-r border-border-light dark:border-border-dark transition-transform duration-300 shadow-xl lg:shadow-none
          ${leftOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0
        `}>
          <div className="flex items-center justify-between p-5 border-b border-border-light dark:border-border-dark">
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <span className="material-symbols-outlined text-[20px]">folder_open</span>
              </div>
              <span className="text-sm font-bold tracking-tight">Base de Conocimiento</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold bg-background-light dark:bg-gray-800 text-text-secondary px-2.5 py-1 rounded-full">{documents.length} docs</span>
              <button
                onClick={fetchDocuments}
                className="size-7 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-main hover:bg-background-light dark:hover:bg-gray-800 transition-colors"
                title="Refrescar lista"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar relative">
            {/* Overlay de carga */}
            {uploading && (
              <div className="absolute inset-0 bg-surface-light/80 dark:bg-surface-dark/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3">
                <div className="size-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <span className="material-symbols-outlined text-amber-500 text-[24px] animate-spin">sync</span>
                </div>
                <p className="text-sm font-bold text-text-main dark:text-white">Subiendo documento...</p>
                <p className="text-xs text-text-secondary">Espera un momento</p>
              </div>
            )}

            {documents.length === 0 && !uploading && (
              <div className="flex flex-col items-center justify-center h-full text-center opacity-60">
                <span className="material-symbols-outlined text-[48px] mb-3 text-text-secondary">docs_add_on</span>
                <p className="text-sm text-text-secondary">No hay documentos indexados.<br/>Sube uno para comenzar.</p>
              </div>
            )}
            {documents.map(doc => (
              <div key={doc.id} className="flex items-center gap-3 p-3 bg-background-light dark:bg-gray-800/50 border border-border-light dark:border-border-dark rounded-xl group transition-colors hover:border-amber-300 dark:hover:border-amber-700">
                <span className={`material-symbols-outlined text-[22px] flex-shrink-0 ${
                  doc.source_type === 'pdf' ? 'text-rose-500' :
                  doc.source_type === 'video' ? 'text-blue-500' :
                  doc.source_type === 'gif' ? 'text-purple-500' : 'text-text-secondary'
                }`}>
                  {doc.source_type === 'pdf' ? 'picture_as_pdf' : doc.source_type === 'video' ? 'play_circle' : 'gif'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-text-main dark:text-gray-200 truncate">{doc.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`size-1.5 rounded-full ${
                      doc.status === 'indexed' ? 'bg-emerald-500' :
                      doc.status === 'error' ? 'bg-red-500' : 'bg-amber-400 animate-pulse'
                    }`}></span>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-text-secondary">
                      {doc.status === 'indexed' ? 'Indexado' : doc.status === 'error' ? 'Error' : 'Pendiente'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {doc.status === 'pending' && (
                    <button
                      onClick={() => indexDocument(doc.id)}
                      disabled={indexing === doc.id}
                      className="size-7 rounded-md flex items-center justify-center bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 transition-colors disabled:opacity-50"
                      title="Indexar ahora"
                    >
                      <span className={`material-symbols-outlined text-[16px] ${indexing === doc.id ? 'animate-spin' : ''}`}>
                        {indexing === doc.id ? 'sync' : 'bolt'}
                      </span>
                    </button>
                  )}
                  {(doc.status === 'indexed' || doc.status === 'error') && (
                    <button
                      onClick={() => indexDocument(doc.id)}
                      disabled={indexing === doc.id}
                      className="size-7 rounded-md flex items-center justify-center bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 transition-colors disabled:opacity-50"
                      title="Re-indexar"
                    >
                      <span className={`material-symbols-outlined text-[16px] ${indexing === doc.id ? 'animate-spin' : ''}`}>
                        {indexing === doc.id ? 'sync' : 'refresh'}
                      </span>
                    </button>
                  )}
                  <button
                    onClick={() => deleteDocument(doc)}
                    className="size-7 rounded-md flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 transition-colors"
                    title="Eliminar"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 pb-24 lg:pb-4 border-t border-border-light dark:border-border-dark space-y-3 bg-surface-light dark:bg-surface-dark">
            {(uploadError || indexError) && (
              <p className="text-xs text-red-500 font-medium bg-red-50 dark:bg-red-900/20 p-2 rounded-lg break-words">
                {uploadError || indexError}
              </p>
            )}

            {pendingDocs.length > 0 && (
              <button
                onClick={() => pendingDocs.forEach(d => indexDocument(d.id))}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-amber-400 hover:bg-amber-500 text-amber-900 text-sm font-bold rounded-xl transition-colors shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">bolt</span>
                Indexar pendientes ({pendingDocs.length})
              </button>
            )}

            <div className="grid grid-cols-3 gap-2">
              <input ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={handleFileChange} />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-1 py-3 border border-border-light dark:border-border-dark hover:border-rose-400 dark:hover:border-rose-500 text-text-secondary hover:text-rose-500 bg-background-light dark:bg-gray-800/50 rounded-xl transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">upload_file</span>
                <span className="text-[10px] font-bold uppercase">PDF / IMG</span>
              </button>
              <button
                onClick={() => setShowAddVideo(true)}
                className="flex flex-col items-center justify-center gap-1 py-3 border border-border-light dark:border-border-dark hover:border-blue-400 dark:hover:border-blue-500 text-text-secondary hover:text-blue-500 bg-background-light dark:bg-gray-800/50 rounded-xl transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">videocam</span>
                <span className="text-[10px] font-bold uppercase">Video</span>
              </button>
              <button
                onClick={() => setShowAddGif(true)}
                className="flex flex-col items-center justify-center gap-1 py-3 border border-border-light dark:border-border-dark hover:border-purple-400 dark:hover:border-purple-500 text-text-secondary hover:text-purple-500 bg-background-light dark:bg-gray-800/50 rounded-xl transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">gif_box</span>
                <span className="text-[10px] font-bold uppercase">GIF</span>
              </button>
            </div>

            <button
              onClick={() => setShowClearModal(true)}
              className="w-full flex items-center justify-center gap-2 py-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-xs font-semibold rounded-lg transition-colors mt-2"
            >
              <span className="material-symbols-outlined text-[16px]">delete_sweep</span>
              Vaciar base de conocimiento
            </button>
          </div>
        </aside>
      )}

      {/* Chat principal */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-background-light dark:bg-background-dark relative">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-surface-light/80 dark:bg-surface-dark/80 backdrop-blur-md border-b border-border-light dark:border-border-dark z-10 sticky top-0">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-lg font-semibold text-text-main dark:text-white leading-tight">Asistente IA</h1>
              <p className="text-[11px] font-medium text-text-secondary uppercase tracking-wide">
                SOPORTE BISTRO POS
              </p>
            </div>
          </div>
          <button
            onClick={clearChat}
            className="flex items-center gap-2 text-sm font-semibold text-text-secondary hover:text-text-main dark:hover:text-white transition-colors px-4 py-2 rounded-xl bg-surface-light dark:bg-gray-800 border border-border-light dark:border-border-dark hover:border-gray-300 dark:hover:border-gray-600 shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            <span className="hidden sm:inline">Nuevo Chat</span>
          </button>
        </div>

        {/* Mensajes */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6 custom-scrollbar scroll-smooth">
          {messages.length === 0 && !loading && (
             <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto opacity-80 mt-10">
               <div className="size-20 bg-amber-100 dark:bg-amber-900/20 rounded-full flex items-center justify-center mb-6">
                 <span className="material-symbols-outlined text-[40px] text-amber-500">forum</span>
               </div>
               <h2 className="text-xl font-semibold mb-2">¿En qué puedo ayudarte?</h2>
               <p className="text-sm text-text-secondary mb-8">Pregúntame cómo hacer una venta, configurar la impresora, registrar un gasto, o cualquier otra duda sobre Bistro POS.</p>
               <div className="grid gap-3 w-full">
                 <button onClick={() => setInput("¿Cómo configuro la impresora de recibos?")} className="text-left px-4 py-3 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark hover:border-amber-400 dark:hover:border-amber-500 text-sm transition-all shadow-sm">🖨️ ¿Cómo configuro la impresora de recibos?</button>
                 <button onClick={() => setInput("¿Cómo aplico un descuento a una venta?")} className="text-left px-4 py-3 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark hover:border-amber-400 dark:hover:border-amber-500 text-sm transition-all shadow-sm">💰 ¿Cómo aplico un descuento a una venta?</button>
                 <button onClick={() => setInput("¿Cómo veo las ventas del día?")} className="text-left px-4 py-3 rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark hover:border-amber-400 dark:hover:border-amber-500 text-sm transition-all shadow-sm">📊 ¿Cómo veo las ventas del día?</button>
               </div>
             </div>
          )}

          {messages.map((msg, i) => (
            <div key={`msg-${i}`} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-5 py-4 text-[15px] leading-relaxed shadow-sm ${
                msg.role === 'user'
                  ? 'bg-amber-400 text-amber-950 rounded-tr-sm font-medium'
                  : 'bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark text-text-main dark:text-gray-100 rounded-tl-sm'
              }`}>
                {msg.role === 'assistant'
                  ? <ChatMessage content={msg.content} />
                  : <span>{msg.content}</span>
                }
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm flex items-center gap-1.5">
                <span className="size-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="size-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="size-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} className="h-4" />
        </div>

        {/* Input */}
        <div className="px-4 md:px-8 pb-6 pt-2 bg-transparent z-10">
          <div className="relative flex items-end bg-surface-light dark:bg-surface-dark rounded-2xl shadow-lg border border-border-light dark:border-border-dark transition-all focus-within:border-amber-400 dark:focus-within:border-amber-500 focus-within:ring-4 focus-within:ring-amber-400/10 dark:focus-within:ring-amber-500/10">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Haz tu pregunta aquí..."
              className="flex-1 bg-transparent border-0 focus:ring-0 focus:outline-none resize-none text-[15px] p-4 pl-5 text-text-main dark:text-gray-100 placeholder-text-secondary outline-none max-h-32 custom-scrollbar leading-relaxed"
              aria-label="Campo de pregunta"
            />
            <div className="p-2 shrink-0">
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="size-10 flex items-center justify-center bg-amber-400 hover:bg-amber-500 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600 disabled:cursor-not-allowed text-amber-950 rounded-xl transition-all transform active:scale-95 shadow-sm"
                aria-label="Enviar pregunta"
              >
                <span className="material-symbols-outlined text-[20px] ml-0.5">send</span>
              </button>
            </div>
          </div>
          <p className="text-center text-[10px] text-text-secondary mt-3 font-medium tracking-wide">
            LA IA PUEDE COMETER ERRORES. VERIFICA LA INFORMACIÓN CON TU EQUIPO.
          </p>
        </div>
      </main>

      {/* Modales */}
      {showClearModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-surface-light dark:bg-surface-dark rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-border-light dark:border-border-dark animate-[slideUp_0.3s_ease-out]">
            <div className="flex flex-col items-center text-center gap-4 mb-6">
              <div className="size-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center text-red-500 mb-2">
                <span className="material-symbols-outlined text-[32px]">warning</span>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-text-main dark:text-white mb-2">¿Vaciar Base?</h3>
                <p className="text-[13px] text-text-secondary leading-relaxed">
                  Se eliminarán todos los documentos, videos y vectores indexados. Esta acción es irreversible y el asistente perderá su conocimiento.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClearModal(false)}
                className="flex-1 py-3 bg-background-light dark:bg-gray-800 rounded-xl text-sm font-bold text-text-main dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleClearConfirm}
                disabled={clearing}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50 shadow-md shadow-red-500/20"
              >
                {clearing ? 'Vaciando...' : 'Vaciar Base'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Agregar Video */}
      {showAddVideo && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-surface-light dark:bg-surface-dark rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-border-light dark:border-border-dark animate-[slideUp_0.3s_ease-out]">
            <div className="flex items-center gap-3 mb-6">
              <div className="size-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-500">
                <span className="material-symbols-outlined text-[24px]">videocam</span>
              </div>
              <h3 className="text-lg font-semibold text-text-main dark:text-white">Agregar Video</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-text-secondary uppercase mb-1.5 ml-1">Título del Video</label>
                <input
                  type="text"
                  placeholder="Ej. Cómo configurar impresoras"
                  value={videoForm.name}
                  onChange={e => setVideoForm(v => ({ ...v, name: e.target.value }))}
                  className="w-full border-2 border-border-light dark:border-gray-700 rounded-xl px-4 py-3 text-sm bg-background-light dark:bg-gray-800/50 text-text-main dark:text-gray-100 placeholder-gray-400 outline-none focus:border-blue-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-text-secondary uppercase mb-1.5 ml-1">URL (YouTube / Drive)</label>
                <input
                  type="url"
                  placeholder="https://youtube.com/..."
                  value={videoForm.url}
                  onChange={e => setVideoForm(v => ({ ...v, url: e.target.value }))}
                  className="w-full border-2 border-border-light dark:border-gray-700 rounded-xl px-4 py-3 text-sm bg-background-light dark:bg-gray-800/50 text-text-main dark:text-gray-100 placeholder-gray-400 outline-none focus:border-blue-400 transition-colors"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setShowAddVideo(false)}
                className="flex-1 py-3 bg-background-light dark:bg-gray-800 rounded-xl text-sm font-bold text-text-main dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddVideo}
                disabled={!videoForm.name || !videoForm.url}
                className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50 shadow-md shadow-blue-500/20"
              >
                Guardar Video
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Agregar GIF */}
      {showAddGif && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-surface-light dark:bg-surface-dark rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-border-light dark:border-border-dark animate-[slideUp_0.3s_ease-out]">
            <div className="flex items-center gap-3 mb-6">
              <div className="size-10 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center text-purple-500">
                <span className="material-symbols-outlined text-[24px]">gif_box</span>
              </div>
              <h3 className="text-lg font-semibold text-text-main dark:text-white">Agregar Imagen / GIF</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-text-secondary uppercase mb-1.5 ml-1">Descripción corta</label>
                <input
                  type="text"
                  placeholder="Ej. Flujo de caja cerrado"
                  value={gifForm.name}
                  onChange={e => setGifForm(v => ({ ...v, name: e.target.value }))}
                  className="w-full border-2 border-border-light dark:border-gray-700 rounded-xl px-4 py-3 text-sm bg-background-light dark:bg-gray-800/50 text-text-main dark:text-gray-100 placeholder-gray-400 outline-none focus:border-purple-400 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-text-secondary uppercase mb-1.5 ml-1">URL Pública</label>
                <input
                  type="url"
                  placeholder="https://.../imagen.gif"
                  value={gifForm.url}
                  onChange={e => setGifForm(v => ({ ...v, url: e.target.value }))}
                  className="w-full border-2 border-border-light dark:border-gray-700 rounded-xl px-4 py-3 text-sm bg-background-light dark:bg-gray-800/50 text-text-main dark:text-gray-100 placeholder-gray-400 outline-none focus:border-purple-400 transition-colors"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-8">
              <button
                onClick={() => setShowAddGif(false)}
                className="flex-1 py-3 bg-background-light dark:bg-gray-800 rounded-xl text-sm font-bold text-text-main dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleAddGif}
                disabled={!gifForm.name || !gifForm.url}
                className="flex-1 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50 shadow-md shadow-purple-500/20"
              >
                Guardar Media
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
