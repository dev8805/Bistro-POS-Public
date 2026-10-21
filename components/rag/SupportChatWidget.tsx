import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useSupportSession, SupportMessage } from '../../hooks/useSupportSession';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useBusinessSettings } from '../../context/BusinessSettingsContext';
import { useDictation } from '../../hooks/useDictation';

interface SupportChatWidgetProps {
  /** Controla la visibilidad del panel y dispara el auto-escalado al abrir. */
  isOpen: boolean;
  /** Cierra el panel (vuelve a la variante admin de TrialExpiredScreen). */
  onClose: () => void;
  /** Estado de conexión; bloquea el envío cuando no hay internet. */
  isOnline: boolean;
}

// Audio singleton para el "pop" del mensaje del dev. Lo cargamos una sola vez
// para evitar latencia y respetar el autoplay policy del navegador (el primer
// click del usuario en la app lo desbloquea).
let devMessageAudio: HTMLAudioElement | null = null;
function playDevMessageSound() {
  try {
    if (!devMessageAudio) {
      devMessageAudio = new Audio('/sounds/dev-message.mp3');
      devMessageAudio.volume = 0.55;
      devMessageAudio.preload = 'auto';
    }
    devMessageAudio.currentTime = 0;
    void devMessageAudio.play().catch(() => { /* autoplay bloqueado, silencioso */ });
  } catch { /* sin sonido en entornos sin Audio */ }
}

/**
 * Chat de soporte dedicado y reducido para la pantalla de trial vencido.
 *
 * Es un duplicado simplificado del `RagChatWidget` que muestra ÚNICAMENTE la
 * conversación de soporte con el desarrollador: sin pestañas CHAT/SOPORTE/BASE,
 * sin chat IA, sin base de conocimiento, sin feedback y sin tutoriales.
 *
 * Como en la pantalla de trial vencido no hay una pregunta previa al bot, el
 * widget hace auto-escalado una sola vez al abrirse (guardado por un ref),
 * creando la sesión de soporte con una pregunta original predefinida.
 */
const SupportChatWidget = ({ isOpen, onClose, isOnline }: SupportChatWidgetProps) => {
  const { showToast } = useToast();
  useAuth(); // asegura el contexto de autenticación (useSupportSession depende de él)
  const { businessCode } = useBusinessSettings();

  const support = useSupportSession({
    onDevMessage: useCallback(() => {
      playDevMessageSound();
    }, []),
  });

  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768);
  const [input, setInput] = useState('');
  const [pendingSupportAttachments, setPendingSupportAttachments] =
    useState<{ file: File; preview: string | null }[]>([]);
  const [viewingAttachment, setViewingAttachment] =
    useState<{ url: string; type: 'image' | 'video' | 'document'; filename?: string } | null>(null);

  const escalatedRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supportInputRef = useRef<HTMLTextAreaElement>(null);
  const supportFileInputRef = useRef<HTMLInputElement>(null);

  // Voice dictation — mismo patrón baseInputRef + handleStartDictation del original.
  const baseInputRef = useRef('');
  const { isRecording, startDictation, stopDictation, isSupported, resetAccumulator, getIsUtteranceActive, setIgnoreCurrentUtterance } = useDictation(
    useCallback((final: string, interim: string) => {
      const space = baseInputRef.current && (final || interim) ? ' ' : '';
      let incomingText = final + interim;

      if (baseInputRef.current && incomingText) {
        const trimmedBase = baseInputRef.current.trimEnd();
        const lastChar = trimmedBase.slice(-1);

        // Si el texto base no termina en puntuación de cierre de oración, forzamos minúscula inicial
        if (lastChar && !/[.!?¿¡\n]/.test(lastChar)) {
          incomingText = incomingText.replace(/^\s*\S/, match => match.toLowerCase());
        }
      }

      setInput(baseInputRef.current + space + incomingText);
    }, [])
  );

  const handleStartDictation = useCallback(() => {
    baseInputRef.current = input;
    startDictation();
  }, [input, startDictation]);

  // Estados derivados portados del original.
  const inSupportMode = !!support.session && support.session.status !== 'closed';
  const devHasResponded = inSupportMode && support.messages.some(m => m.role === 'developer');

  // Auto-escalado exactamente una vez al abrir (guardado por escalatedRef).
  useEffect(() => {
    if (!isOpen || escalatedRef.current) return;
    const hasActive = !!support.session && support.session.status !== 'closed';
    if (hasActive || support.loading) return;
    escalatedRef.current = true;
    support.escalate({ original_question: 'Solicitud de soporte: mi prueba gratuita terminó', user_screen: 'Trial vencido' })
      .catch(() => { escalatedRef.current = false; });
  }, [isOpen, support.session, support.loading, support.escalate]);

  // Listener de resize para alternar entre layout desktop/móvil.
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Auto-resize del textarea al cambiar el input (tipeo o dictado).
  useEffect(() => {
    const ref = supportInputRef.current;
    if (ref) {
      ref.style.height = 'auto';
      ref.style.height = `${Math.min(ref.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Auto-scroll al llegar mensajes nuevos de la conversación de soporte.
  const prevSupportMsgCountRef = useRef(0);
  useEffect(() => {
    if (!isOpen) return;
    if (support.messages.length > prevSupportMsgCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevSupportMsgCountRef.current = support.messages.length;
  }, [support.messages, isOpen]);

  // Cerrar lightbox con ESC.
  useEffect(() => {
    if (!viewingAttachment) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewingAttachment(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [viewingAttachment]);

  const handleSend = useCallback(async () => {
    if (support.loading) return;
    if (!input.trim() && pendingSupportAttachments.length === 0) return;
    if (!isOnline || !navigator.onLine) {
      showToast('El soporte necesita conexión a internet', 'warning');
      return;
    }
    if (!inSupportMode) return;

    const q = input.trim();
    setInput('');
    baseInputRef.current = '';
    const attachments = pendingSupportAttachments;
    setPendingSupportAttachments(prev => { prev.forEach(a => { if (a.preview) URL.revokeObjectURL(a.preview); }); return []; });

    try {
      if (attachments.length === 0) {
        await support.sendClientMessage(q);
      } else {
        // Primer adjunto acompaña al texto; el resto se envían por separado.
        await support.sendClientMessage(q, attachments[0].file);
        for (let i = 1; i < attachments.length; i++) {
          await support.sendClientMessage('', attachments[i].file);
        }
      }
    } catch {
      // El hook marca el mensaje como fallido (_status: 'failed') y ofrece Reintentar.
    }
  }, [input, support, inSupportMode, isOnline, showToast, pendingSupportAttachments]);

  const handleRetryFailedMessage = useCallback((failedMsgId: string) => {
    if (!isOnline || !navigator.onLine) {
      showToast('El soporte necesita conexión a internet', 'warning');
      return;
    }
    const failedMsg = support.messages.find(m => m.id === failedMsgId);
    support.removeMessage(failedMsgId);
    if (failedMsg) setInput(failedMsg.content || '');
  }, [support, isOnline, showToast]);

  const handleSupportAttach = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    const newAttachments = picked.map(file => {
      const needsPreview = file.type.startsWith('image/') || file.type.startsWith('video/');
      return { file, preview: needsPreview ? URL.createObjectURL(file) : null };
    });
    setPendingSupportAttachments(prev => [...prev, ...newAttachments]);
    e.target.value = '';
  }, []);

  const handleCopyBusinessCode = useCallback(() => {
    if (!businessCode) return;
    navigator.clipboard?.writeText(businessCode)
      .then(() => showToast('Código copiado', 'success'))
      .catch(() => { /* clipboard no disponible, silencioso */ });
  }, [businessCode, showToast]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const renderSupportMessage = (msg: SupportMessage) => {
    const isClient = msg.role === 'client';
    const isSystem = msg.role === 'system';

    if (isSystem) {
      return null;
    }

    const hasAttachment = !!msg.attachment_url;
    const hasText = !!msg.content?.trim();
    const isMedia = msg.attachment_type === 'image' || msg.attachment_type === 'video';

    const bubbleBg = isClient
      ? 'bg-amber-400 text-amber-950'
      : 'bg-emerald-50 dark:bg-emerald-900/20 text-text-main dark:text-gray-100';

    return (
      <div key={msg.id} className={`flex w-full ${isClient ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[72%] flex flex-col gap-1 ${isClient ? 'items-end' : 'items-start'}`}>
          {!isClient && (
            <div className="flex items-center gap-1.5 ml-1">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] md:text-[11.5px] uppercase tracking-wider font-bold text-text-secondary">Soporte</span>
            </div>
          )}

          {/* Imagen o video — card integrada con caption abajo */}
          {hasAttachment && isMedia && (
            <div className={`rounded-2xl overflow-hidden shadow-sm ${hasText ? bubbleBg : ''}`}>
              {msg.attachment_type === 'image' && (
                <button
                  type="button"
                  onClick={() => setViewingAttachment({ url: msg.attachment_url!, type: 'image' })}
                  className="block w-full cursor-zoom-in"
                  aria-label="Ampliar imagen"
                >
                  <img
                    src={msg.attachment_url!}
                    alt="adjunto"
                    className="block w-full max-h-44 object-cover hover:opacity-90 transition"
                    onLoad={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  />
                </button>
              )}
              {msg.attachment_type === 'video' && (
                <button
                  type="button"
                  onClick={() => setViewingAttachment({ url: msg.attachment_url!, type: 'video' })}
                  className="block relative w-full text-left"
                  aria-label="Ver video"
                >
                  <video
                    src={msg.attachment_url!}
                    className="block w-full max-h-44 object-cover pointer-events-none"
                    onLoadedData={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition">
                    <span className="material-symbols-outlined text-white text-[36px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
                  </div>
                </button>
              )}
              {hasText && (
                <div className={`px-3 py-2 text-[13px] md:text-[14px] leading-snug ${isClient ? 'font-medium' : ''}`}>
                  {isClient ? msg.content : (
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-0.5 prose-ul:my-0.5 prose-ol:my-0.5 prose-li:my-0">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Solo texto */}
          {hasText && !hasAttachment && (
            <div className={`rounded-2xl px-4 py-2.5 text-[14px] md:text-[15.5px] leading-relaxed ${bubbleBg} ${
              isClient ? 'rounded-tr-sm font-medium' : 'rounded-tl-sm'
            }`}>
              {isClient ? msg.content : (
                <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-1.5 prose-headings:text-[15px]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {/* Audio */}
          {hasAttachment && msg.attachment_type === 'audio' && (
            <div className={`rounded-2xl px-3 py-2.5 ${bubbleBg}`}>
              <audio src={msg.attachment_url!} controls className="w-full max-w-[240px]" />
              {hasText && <p className="mt-1.5 text-[13px] leading-snug">{msg.content}</p>}
            </div>
          )}

          {/* Documento */}
          {hasAttachment && msg.attachment_type === 'document' && (
            <div className="flex flex-col gap-1 w-full">
              <button
                type="button"
                onClick={() => setViewingAttachment({ url: msg.attachment_url!, type: 'document' })}
                className={`flex items-center gap-2 rounded-2xl px-3.5 py-2.5 transition active:scale-[0.98] ${bubbleBg} ${isClient ? 'hover:bg-amber-500' : 'hover:bg-gray-100 dark:hover:bg-gray-700/60'}`}
              >
                <span className="material-symbols-outlined text-[20px] shrink-0">description</span>
                <span className="text-[13px] md:text-[14px] font-medium">Documento adjunto</span>
              </button>
              {hasText && (
                <div className={`rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${bubbleBg} ${isClient ? 'font-medium' : ''}`}>
                  {msg.content}
                </div>
              )}
            </div>
          )}

          {/* Indicador de error: solo si el envío falló */}
          {isClient && msg._status === 'failed' && (
            <div className="flex items-center gap-1.5 mr-1 mt-0.5">
              <span className="material-symbols-outlined text-[13px] text-red-500" style={{ fontVariationSettings: "'FILL' 1" }}>error</span>
              <span className="text-[10px] text-red-500">No se pudo enviar</span>
              <button
                type="button"
                onClick={() => handleRetryFailedMessage(msg.id)}
                className="text-[10px] text-amber-600 hover:text-amber-700 font-bold underline ml-1"
                aria-label="Reintentar envío"
              >
                Reintentar
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const supportContent = (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 custom-scrollbar bg-stone-50/60 dark:bg-gray-900/30">
        {businessCode && (
          <div className="flex items-center justify-center gap-2 -mt-1">
            <span className="text-[11px] text-text-secondary">ID de tu negocio</span>
            <button
              type="button"
              onClick={handleCopyBusinessCode}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background-light dark:bg-gray-800 border border-border-light dark:border-border-dark text-text-main dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition active:scale-95"
              title="Copiar ID del negocio"
              aria-label={`Copiar ID del negocio ${businessCode}`}
            >
              <span className="text-[12px] font-bold font-mono tracking-wide">#{businessCode}</span>
              <span className="material-symbols-outlined text-[14px] text-text-secondary">content_copy</span>
            </button>
          </div>
        )}
        {support.messages.length === 0
          ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-8">
              <span className="material-symbols-outlined text-[36px] text-text-secondary">support_agent</span>
              <p className="text-[13px] text-text-secondary">Tu consulta fue enviada al desarrollador.</p>
              <p className="text-[11px] text-text-secondary">Te notificaremos cuando responda.</p>
            </div>
          ) : (
            support.messages.map(renderSupportMessage)
          )
        }
        <div ref={messagesEndRef} />
      </div>

      {inSupportMode && (
        <div className="px-3 pt-1.5 shrink-0 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className={`size-1.5 rounded-full ${devHasResponded ? 'bg-emerald-500' : 'bg-amber-400 animate-pulse'}`} />
            <span className="text-[10px] font-medium text-text-secondary">
              {devHasResponded ? 'Conectado con soporte' : 'Consulta enviada'}
            </span>
          </div>
          <button
            type="button"
            onClick={support.closeSession}
            className="text-[10px] font-medium text-text-secondary hover:text-red-500 transition"
            aria-label="Terminar conversación"
          >Terminar conversación</button>
        </div>
      )}

      <div className="px-3 pb-3 pt-1.5 shrink-0">
        <div className="relative flex flex-col bg-background-light dark:bg-gray-800 rounded-3xl border border-border-light dark:border-border-dark p-2 shadow-sm gap-1.5 focus-within:border-amber-400 dark:focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-400/10 transition-all">
          <input
            ref={supportFileInputRef}
            type="file"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
            multiple
            className="hidden"
            onChange={handleSupportAttach}
          />

          {/* Thumbnails de archivos adjuntos */}
          {pendingSupportAttachments.length > 0 && (
            <div className="px-1 pt-1 flex gap-2 overflow-x-auto pb-0.5 custom-scrollbar">
              {pendingSupportAttachments.map((a, idx) => (
                <div key={idx} className="relative shrink-0">
                  {a.file.type.startsWith('image/') && a.preview ? (
                    <button
                      type="button"
                      onClick={() => setViewingAttachment({ url: a.preview!, type: 'image' })}
                      className="block cursor-zoom-in"
                      aria-label="Previsualizar imagen"
                    >
                      <img
                        src={a.preview}
                        alt="adjunto"
                        className="h-20 w-20 rounded-2xl object-cover shadow-sm border border-border-light dark:border-border-dark hover:opacity-80 transition"
                      />
                    </button>
                  ) : a.file.type.startsWith('video/') && a.preview ? (
                    <div className="relative rounded-2xl overflow-hidden shadow-sm border border-border-light dark:border-border-dark h-20 w-20">
                      <video src={a.preview} className="h-full w-full object-cover block pointer-events-none" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <span className="material-symbols-outlined text-white text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>play_circle</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-border-light dark:border-border-dark bg-gray-50 dark:bg-gray-800/60 h-20 w-20 shadow-sm px-1">
                      <span className="material-symbols-outlined text-text-secondary text-[22px]">
                        {a.file.type.startsWith('audio/') ? 'audio_file' : 'description'}
                      </span>
                      <span className="text-[9px] text-text-secondary text-center leading-tight line-clamp-2 w-full px-1">{a.file.name}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setPendingSupportAttachments(prev => {
                      if (a.preview) URL.revokeObjectURL(a.preview);
                      return prev.filter((_, i) => i !== idx);
                    })}
                    className="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-gray-700/85 hover:bg-gray-900 text-white flex items-center justify-center transition shadow-sm"
                    aria-label="Quitar archivo"
                  >
                    <span className="material-symbols-outlined text-[12px]">close</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            {isRecording ? (
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  stopDictation();
                  supportInputRef.current?.focus();
                }}
                className="size-8 flex items-center justify-center rounded-full hover:bg-amber-100 dark:hover:bg-gray-700 text-amber-600 dark:text-amber-400 transition-all active:scale-95 shrink-0"
                title="Pausar dictado"
                aria-label="Pausar dictado"
              >
                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>stop</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => supportFileInputRef.current?.click()}
                className="size-8 rounded-full bg-surface-light dark:bg-gray-700/60 flex items-center justify-center text-text-secondary hover:text-amber-500 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors shrink-0"
                title="Adjuntar archivo"
                aria-label="Adjuntar archivo"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
              </button>
            )}

            <textarea
              ref={supportInputRef}
              rows={1}
              value={input}
              onChange={e => {
                const newVal = e.target.value;
                setInput(newVal);
                if (isRecording) {
                  baseInputRef.current = newVal;
                  resetAccumulator();
                  if (getIsUtteranceActive()) {
                    setIgnoreCurrentUtterance(true);
                  }
                }
              }}
              onKeyDown={handleKeyDown}
              onPaste={e => {
                const items = e.clipboardData?.items;
                if (!items) return;
                for (const item of items) {
                  if (item.type.startsWith('image/')) {
                    e.preventDefault();
                    const file = item.getAsFile();
                    if (file) {
                      setPendingSupportAttachments(prev => [...prev, { file, preview: URL.createObjectURL(file) }]);
                    }
                    return;
                  }
                }
              }}
              placeholder={isRecording ? "Escuchando..." : (isDesktop ? "Escribe al desarrollador..." : "Mensaje...")}
              className="flex-1 min-w-0 bg-transparent border-0 focus:ring-0 focus:outline-none resize-none text-[15px] py-2 text-text-main dark:text-gray-100 placeholder-text-secondary outline-none max-h-[120px] custom-scrollbar leading-relaxed"
              aria-label="Mensaje al desarrollador"
            />

            <div className="flex items-center gap-1.5 shrink-0">
              {isSupported && !isRecording && (
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    handleStartDictation();
                    supportInputRef.current?.focus();
                  }}
                  className="size-9 flex items-center justify-center rounded-full transition-all active:scale-95 bg-surface-light dark:bg-gray-700/60 text-text-secondary hover:text-amber-500 hover:bg-gray-200 dark:hover:bg-gray-600 shrink-0"
                  title="Dictar por voz"
                  aria-label="Dictar por voz"
                >
                  <span className="material-symbols-outlined text-[20px]">mic</span>
                </button>
              )}
              {isRecording ? (
                <div className="relative flex items-center justify-center shrink-0">
                  <div className="absolute inset-0 rounded-full bg-amber-400 opacity-30 animate-ping" style={{ animationDuration: '2.5s' }}></div>
                  <div className="absolute inset-[-4px] rounded-full border border-amber-400/20 animate-pulse"></div>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      supportInputRef.current?.blur();
                      stopDictation();
                      if (input.trim() || pendingSupportAttachments.length > 0) handleSend();
                    }}
                    className="relative z-10 size-9 flex items-center justify-center bg-amber-400 hover:bg-amber-500 text-amber-950 rounded-full transition-all active:scale-95 shadow-sm"
                    title="Confirmar y enviar"
                    aria-label="Confirmar y enviar"
                  >
                    <span className="material-symbols-outlined text-[20px]">check</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!input.trim() && pendingSupportAttachments.length === 0}
                  className="size-9 flex items-center justify-center bg-amber-400 hover:bg-amber-500 disabled:bg-gray-200 dark:disabled:bg-gray-700/50 disabled:text-gray-400 dark:disabled:text-gray-500 text-amber-950 rounded-full transition-all active:scale-95 shrink-0"
                  aria-label="Enviar"
                >
                  <span className="material-symbols-outlined text-[20px]">arrow_upward</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );

  const attachmentLightbox = viewingAttachment && (
    <div
      className="fixed inset-0 z-[300] bg-black flex items-center justify-center animate-[fadeIn_0.15s_ease-out]"
      onClick={() => setViewingAttachment(null)}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setViewingAttachment(null); }}
        className="fixed z-[310] size-11 rounded-full bg-black/70 hover:bg-black/85 text-white flex items-center justify-center transition shadow-[0_4px_16px_rgba(0,0,0,0.5)] border border-white/20"
        style={{ top: 'max(env(safe-area-inset-top), 12px)', right: 'max(env(safe-area-inset-right), 12px)' }}
        aria-label="Cerrar"
        title="Cerrar (Esc)"
      >
        <span className="material-symbols-outlined text-[24px]">close</span>
      </button>

      {viewingAttachment.type === 'image' && (
        <img
          src={viewingAttachment.url}
          alt="adjunto en tamaño completo"
          style={{ maxWidth: '100vw', maxHeight: '100vh', width: 'auto', height: 'auto' }}
          decoding="sync"
          loading="eager"
          fetchPriority="high"
        />
      )}

      {viewingAttachment.type === 'video' && (
        <video
          src={viewingAttachment.url}
          controls
          autoPlay
          playsInline
          preload="auto"
          style={{ maxWidth: '100vw', maxHeight: '100vh', width: 'auto', height: 'auto', background: '#000' }}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {viewingAttachment.type === 'document' && (
        <div
          className="bg-surface-light dark:bg-surface-dark rounded-2xl p-8 max-w-md w-[calc(100%-2rem)] mx-4 shadow-2xl flex flex-col items-center gap-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="size-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <span className="material-symbols-outlined text-amber-500 text-[32px]">description</span>
          </div>
          <div className="text-center">
            <h3 className="text-base font-semibold text-text-main dark:text-white mb-1">Documento adjunto</h3>
            <p className="text-[12px] text-text-secondary">Descárgalo para verlo en tu dispositivo.</p>
          </div>
          <a
            href={viewingAttachment.url}
            download
            target="_blank"
            rel="noopener"
            className="w-full py-3 bg-amber-400 hover:bg-amber-500 text-amber-950 rounded-xl text-[13px] font-bold transition active:scale-95 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Descargar
          </a>
          <button
            type="button"
            onClick={() => setViewingAttachment(null)}
            className="text-[12px] font-semibold text-text-secondary hover:text-text-main transition"
          >Cerrar</button>
        </div>
      )}
    </div>
  );

  if (!isOpen) return null;

  const headerSubtitle = devHasResponded ? 'Conectado con soporte' : 'Consulta enviada';

  const header = (isMobile: boolean) => (
    <div className={`flex items-center gap-3 px-4 ${isMobile ? 'py-2.5' : 'h-[54px]'} border-b border-border-light dark:border-border-dark shrink-0`}>
      <div className="size-8 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>support_agent</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] md:text-[14.5px] font-bold text-text-main dark:text-white leading-tight truncate">Soporte Bistro</p>
        <p className="text-[10px] md:text-[11.5px] text-text-secondary leading-tight truncate">{headerSubtitle}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="size-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
        title="Cerrar"
        aria-label="Cerrar soporte"
      >
        <span className="material-symbols-outlined text-[17px]">close</span>
      </button>
    </div>
  );

  // DESKTOP: panel fixed centrado con backdrop.
  if (isDesktop) {
    return (
      <>
        <div
          className="fixed inset-0 bg-black/25 backdrop-blur-[3px] z-[54]"
          onClick={onClose}
        />
        <div
          className="fixed z-[110] flex flex-col bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl overflow-hidden shadow-2xl left-1/2 -translate-x-1/2"
          style={{ top: '16px', bottom: '16px', width: 'min(580px, calc(100vw - 32px))' }}
        >
          {header(false)}
          <div className="flex flex-col flex-1 min-h-0">{supportContent}</div>
        </div>
        {attachmentLightbox}
      </>
    );
  }

  // MOBILE: full-screen slide-in.
  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[56]"
        onClick={onClose}
      />
      <div className="fixed z-[57] w-full max-w-md top-0 bottom-0 right-0 bg-surface-light dark:bg-surface-dark flex flex-col overflow-hidden shadow-2xl animate-[slideInRight_0.3s_ease-in-out]">
        {header(true)}
        <div className="flex flex-col flex-1 min-h-0 bg-background-light dark:bg-background-dark">{supportContent}</div>
      </div>
      {attachmentLightbox}
    </>
  );
};

export default SupportChatWidget;
