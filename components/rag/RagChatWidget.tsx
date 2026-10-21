import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useRagChat, RagMessage } from '../../hooks/useRagChat';
import { useRagDocuments } from '../../hooks/useRagDocuments';
import { useSupportSession, SupportMessage, SupportSession } from '../../hooks/useSupportSession';
import { useDeveloperAvailability } from '../../hooks/useDeveloperAvailability';
import { ChatMessage } from './ChatMessage';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useBusinessSettings } from '../../context/BusinessSettingsContext';
import { useDictation } from '../../hooks/useDictation';
import { TUTORIALS, getDevOverlay, addDevOverlayEntry, TutorialConfig } from './tutorials';
import { TutorialDevManager } from './TutorialDevManager';


interface Props {
  isOpen: boolean;
  isMinimized: boolean;
  onClose: () => void;
  onToggleMinimize: () => void;
  onConversationChange: (hasConversation: boolean) => void;
  isOnline: boolean;
  currentScreen?: string;
  onDevMessageWhileHidden?: () => void;
  onWidgetVisible?: () => void;
  isSidebarOpen?: boolean;
  isSidebarCollapsed?: boolean;
}

type View = 'chat' | 'docs' | 'support';

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

export const RagChatWidget: React.FC<Props> = ({
  isOpen,
  isMinimized,
  onClose,
  onToggleMinimize,
  onConversationChange,
  isOnline,
  currentScreen,
  onDevMessageWhileHidden,
  onWidgetVisible,
  isSidebarOpen = true,
  isSidebarCollapsed = false,
}) => {
  const { showToast } = useToast();
  const { profile } = useAuth();
  const { businessCode } = useBusinessSettings();
  const { messages, loading, sendMessage, showTutorial, clearChat: clearChatRaw } = useRagChat();
  const isAdmin = import.meta.env.DEV;

  // Refs para que los callbacks de realtime siempre vean el estado actual de visibilidad
  // del widget sin reabrir suscripciones.
  const widgetVisibleRef = useRef(false);
  widgetVisibleRef.current = isOpen && !isMinimized;

  const onDevHiddenRef = useRef(onDevMessageWhileHidden);
  onDevHiddenRef.current = onDevMessageWhileHidden;

  const support = useSupportSession({
    onDevMessage: useCallback(() => {
      playDevMessageSound();
      if (!widgetVisibleRef.current) onDevHiddenRef.current?.();
    }, []),
  });

  // Disponibilidad del dev: usada para mostrar warning en el form de escalación
  // cuando está fuera de horario, indicando próxima ventana de respuesta.
  const devAvail = useDeveloperAvailability();

  const {
    documents, indexing, indexError, uploading, clearing,
    uploadDocument, addVideoUrl, addGifUrl,
    indexDocument, clearAllDocuments, deleteDocument, fetchDocuments
  } = useRagDocuments();

  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768);
  const [input, setInput] = useState('');
  const [view, setView] = useState<View>('chat');

  // Voice dictation
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

  // Feedback / handoff a soporte humano
  const [feedbackByIndex, setFeedbackByIndex] = useState<Record<number, 'yes' | 'no'>>({});
  const [escalateForIndex, setEscalateForIndex] = useState<number | null>(null);
  const [pendingEscalateIdx, setPendingEscalateIdx] = useState<number | null>(null);
  const [escalatingInFlight, setEscalatingInFlight] = useState(false);
  const [showSupportHint, setShowSupportHint] = useState(false);
  const [pendingSupportAttachments, setPendingSupportAttachments] = useState<{ file: File; preview: string | null }[]>([]);
  const [extraDetail, setExtraDetail] = useState('');
  const [escalateFiles, setEscalateFiles] = useState<File[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [closedExpanded, setClosedExpanded] = useState<Record<string, boolean>>({});

  // Estado del menú "Lista de tutoriales" en el header y del panel dev-only.
  // `devOverlayVersion` se incrementa cuando el panel dev agrega una entrada al
  // overlay para forzar el recompute de `tutorialList` (Req 7.5).
  const [showTutorialMenu, setShowTutorialMenu] = useState(false);
  const [showDevManager, setShowDevManager] = useState(false);
  const [devOverlayVersion, setDevOverlayVersion] = useState(0);
  const tutorialMenuRef = useRef<HTMLDivElement>(null);
  const [viewingAttachment, setViewingAttachment] = useState<{ url: string; type: 'image' | 'video' | 'document'; filename?: string } | null>(null);

  // Admin (sólo dev)
  const [showClearModal, setShowClearModal] = useState(false);
  const [showAddVideo, setShowAddVideo] = useState(false);
  const [showAddGif, setShowAddGif] = useState(false);
  const [videoForm, setVideoForm] = useState({ name: '', url: '' });
  const [gifForm, setGifForm] = useState({ name: '', url: '' });
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Wrapper de clearChat: limpia el chat IA + resetea el feedback local del widget
  // para que los índices viejos no contaminen la nueva conversación.
  const clearChat = useCallback(() => {
    clearChatRaw();
    setFeedbackByIndex({});
    setEscalateForIndex(null);
    setPendingEscalateIdx(null);
    setShowSupportHint(false);
    setPendingSupportAttachments(prev => { prev.forEach(a => { if (a.preview) URL.revokeObjectURL(a.preview); }); return []; });
    setExtraDetail('');
    setEscalateFiles([]);
  }, [clearChatRaw]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastAssistantMsgRef = useRef<HTMLDivElement>(null);
  const wasLoadingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supportFileInputRef = useRef<HTMLInputElement>(null);
  const supportInputRef = useRef<HTMLTextAreaElement>(null);
  const extraDetailRef = useRef<HTMLTextAreaElement>(null);
  const mobileContainerRef = useRef<HTMLDivElement>(null);

  // Auto-resize textarea when input changes (e.g. from typing or dictation)
  useEffect(() => {
    for (const ref of [textareaRef, supportInputRef]) {
      if (ref.current) {
        ref.current.style.height = 'auto';
        ref.current.style.height = `${Math.min(ref.current.scrollHeight, 120)}px`;
      }
    }
  }, [input]);

  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Bloquear el scroll del body de forma estricta cuando el widget está abierto
  // usando 'position: fixed'. Esto evita de raíz que el navegador (ej. Chrome en Android)
  // haga un auto-scroll y empuje la cabecera del chat fuera de la pantalla al abrir el teclado.
  useEffect(() => {
    const visible = isOpen && !isMinimized;
    if (visible) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }
  }, [isOpen, isMinimized]);

  // Usar Visual Viewport API para forzar que el chat móvil encaje exactamente
  // en la porción de pantalla visible. Esto asegura que el header nunca se oculte
  // al abrir el teclado.
  useEffect(() => {
    if (!isOpen || isMinimized || !window.visualViewport) return;

    const vv = window.visualViewport;
    
    const handleViewportChange = () => {
      if (mobileContainerRef.current) {
        mobileContainerRef.current.style.height = `${vv.height}px`;
        mobileContainerRef.current.style.top = `${vv.offsetTop}px`;
      }
      // Asegurarse de que Chrome no intente hacer scroll del layout viewport
      window.scrollTo(0, 0);
    };

    vv.addEventListener('resize', handleViewportChange);
    vv.addEventListener('scroll', handleViewportChange);
    
    // Llamada inicial para ajuste
    setTimeout(handleViewportChange, 10);

    return () => {
      vv.removeEventListener('resize', handleViewportChange);
      vv.removeEventListener('scroll', handleViewportChange);
      if (mobileContainerRef.current) {
        mobileContainerRef.current.style.height = '';
        mobileContainerRef.current.style.top = '';
      }
    };
  }, [isOpen, isMinimized]);

  useEffect(() => {
    onConversationChange(
      messages.some(m => m.role === 'user') ||
      (!!support.session && support.session.status !== 'closed')
    );
  }, [messages, support.session, onConversationChange]);

  // Cuando el widget pasa a ser visible para el usuario, avisamos al padre
  // para que limpie el contador de mensajes no leídos del dev.
  useEffect(() => {
    if (isOpen && !isMinimized) onWidgetVisible?.();
  }, [isOpen, isMinimized, onWidgetVisible]);

  const prevUserMsgCountRef = useRef(0);
  const prevSupportMsgCountRef = useRef(0);
  
  // Hacer scroll automático solo cuando el usuario envía un mensaje nuevo,
  // cuando llega un nuevo mensaje de soporte, o cuando se abre el chat.
  // Se omite el auto-scroll durante la respuesta de la IA.
  useEffect(() => {
    if (isOpen && !isMinimized && (view === 'chat' || view === 'support')) {
      const userMsgCount = messages.filter(m => m.role === 'user').length;
      const supportMsgCount = support.messages.length;
      
      const isNewUserMsg = userMsgCount > prevUserMsgCountRef.current;
      const isNewSupportMsg = supportMsgCount > prevSupportMsgCountRef.current;

      if (isNewUserMsg || isNewSupportMsg) {
        // Si el último mensaje de usuario es un tutorial recién abierto, la
        // guía puede ser muy larga y hacer scroll al final deja al lector al
        // pie del contenido. Nos posicionamos en la burbuja de usuario del
        // tutorial (el título) para que empiece a leer desde arriba.
        let lastUserIdx = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'user') { lastUserIdx = i; break; }
        }
        const lastUserMsg = lastUserIdx >= 0 ? messages[lastUserIdx] : null;
        const isNewTutorial = isNewUserMsg && lastUserMsg?.kind === 'tutorial';

        if (isNewTutorial) {
          const el = document.getElementById(`rag-msg-container-${lastUserIdx}`);
          el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }

      prevUserMsgCountRef.current = userMsgCount;
      prevSupportMsgCountRef.current = supportMsgCount;
    }
  }, [messages, support.messages, isOpen, isMinimized, view]);

  // Hacer scroll inmediato al abrir el widget si hay conversación activa.
  // Si no hay mensajes (pantalla de bienvenida con sugerencias), el scroll
  // queda arriba para que las primeras opciones sean visibles.
  useEffect(() => {
    if (isOpen && !isMinimized && view === 'chat' && messages.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }, 50);
    }
  }, [isOpen, isMinimized, view]);

  const inSupportMode = !!support.session && support.session.status !== 'closed';
  const devHasResponded = inSupportMode && support.messages.some(m => m.role === 'developer');
  const effectiveSupportMode = inSupportMode && view === 'support';
  // Hay al menos un mensaje del cliente que no se pudo entregar (permite que la
  // vista de soporte siga visible para mostrar el error + botón "Reintentar").
  const hasFailedSupportMessage = support.messages.some(m => m._status === 'failed');
  // La vista de soporte debe permanecer activa mientras haya sesión, una
  // escalación pendiente, una escalación en vuelo (mensaje optimista enviado
  // pero la sesión aún no se creó), o un mensaje fallido pendiente de reintento.
  // Sin esto, el primer mensaje hace que el cuerpo caiga a chatContent y "salte"
  // de vuelta al chat IA.
  const supportViewActive = inSupportMode || pendingEscalateIdx !== null || escalatingInFlight || hasFailedSupportMessage;

  // Cuando el dev responde POR PRIMERA VEZ en la sesión, ir a soporte automáticamente.
  // Una vez redirigido, el usuario puede navegar libremente entre tabs.
  const hasAutoRedirectedToSupportRef = useRef(false);
  useEffect(() => {
    if (!inSupportMode) { hasAutoRedirectedToSupportRef.current = false; return; }
    if (devHasResponded && !hasAutoRedirectedToSupportRef.current) {
      hasAutoRedirectedToSupportRef.current = true;
      setView('support');
    }
  }, [devHasResponded, inSupportMode]);

  // Si el usuario navega fuera de soporte antes de enviar, cancelar la escalación pendiente
  useEffect(() => {
    if (view !== 'support' && pendingEscalateIdx !== null) {
      setPendingEscalateIdx(null);
      setShowSupportHint(false);
    }
  }, [view, pendingEscalateIdx]);

  // Si la vista de soporte deja de estar activa (sesión cerrada, sin escalación
  // pendiente/en vuelo ni mensajes fallidos), volver al chat IA.
  useEffect(() => {
    if (!supportViewActive && view === 'support') setView('chat');
  }, [supportViewActive, view]);
  const hasClosedSupportHistory = !!support.session && support.session.status === 'closed';
  const hasAnyClosedHistory = hasClosedSupportHistory || support.previousClosedSessions.length > 0;
  const closedSessionsList = [
    ...(hasClosedSupportHistory && support.session ? [{ session: support.session, messages: support.messages }] : []),
    ...support.previousClosedSessions,
  ];

  // Cuando una sesión transiciona a 'closed', limpiamos el badge "Marcado como no
  // resuelto" del chat IA y cerramos la vista de historial si estaba abierta.
  const prevSessionStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const currentStatus = support.session?.status ?? null;
    if (prevSessionStatusRef.current && prevSessionStatusRef.current !== 'closed' && currentStatus === 'closed') {
      setFeedbackByIndex({});
      clearChat();
    }
    prevSessionStatusRef.current = currentStatus;
  }, [support.session?.status, clearChat]);

  useEffect(() => {
    if (view === 'support' && showHistory) setShowHistory(false);
  }, [view, showHistory]);

  // Si ya no hay historial vigente, salimos de la vista.
  useEffect(() => {
    if (showHistory && closedSessionsList.length === 0) setShowHistory(false);
  }, [showHistory, closedSessionsList.length]);

  // Cerrar lightbox con ESC
  useEffect(() => {
    if (!viewingAttachment) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setViewingAttachment(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [viewingAttachment]);

  // Tick cada minuto para actualizar el contador "se borra en Xh Ym"
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    if (!hasAnyClosedHistory) return;
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [hasAnyClosedHistory]);

  const formatClosedAt = useCallback((closedAt?: string | null) => {
    if (!closedAt) return null;
    try {
      const d = new Date(closedAt);
      return d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });
    } catch { return null; }
  }, []);

  const formatExpiresAt = useCallback((closedAt?: string | null) => {
    if (!closedAt) return null;
    try {
      const d = new Date(new Date(closedAt).getTime() + 60 * 60 * 1000);
      return d.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' });
    } catch { return null; }
  }, []);

  const formatExpiresIn = useCallback((closedAt?: string | null) => {
    if (!closedAt) return null;
    const closedMs = new Date(closedAt).getTime();
    const expiryMs = closedMs + 60 * 60 * 1000;
    const diffMin = Math.floor((expiryMs - nowTick) / 60_000);
    if (diffMin <= 0) return 'pendiente de borrado';
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    if (h >= 1) return `Se borra en ${h}h ${m}m`;
    return `Se borra en ${m}m`;
  }, [nowTick]);

  // Encuentra la pregunta del usuario que precedió a la respuesta del bot
  const getPriorUserQuestion = useCallback((assistantIdx: number) => {
    for (let i = assistantIdx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return messages[i].content;
    }
    return '';
  }, [messages]);

  // Guarda el contexto de la última escalación para poder reintentarla si falla.
  const retryEscalateRef = useRef<{
    optimisticId: string;
    optimisticBlobUrl: string | null;
    text: string;
    files: File[];
    escalateInput: { original_question: string; bot_answer?: string; best_score?: number; user_screen?: string };
  } | null>(null);

  // Ejecuta la escalación completa (crear sesión + enviar mensaje/adjuntos).
  // El mensaje optimista ya debe estar en el chat con id = optimisticId.
  // En éxito: reemplaza el optimista por el mensaje confirmado.
  // En fallo: marca el optimista como 'failed' y guarda el contexto para reintentar.
  const performEscalation = useCallback(async (opts: {
    optimisticId: string;
    optimisticBlobUrl: string | null;
    text: string;
    files: File[];
    escalateInput: { original_question: string; bot_answer?: string; best_score?: number; user_screen?: string };
  }) => {
    const { optimisticId, optimisticBlobUrl, text, files, escalateInput } = opts;
    setEscalatingInFlight(true);
    try {
      const newSession = await support.escalate(escalateInput);
      // Reutilizamos el mismo bubble optimista (reuseId) para NO duplicar el
      // mensaje: pasa de "Enviando..." a confirmado en su lugar.
      await support.sendClientMessage(text, files[0], newSession.id, optimisticId);
      // La blob URL del bubble ya fue reemplazada por sendClientMessage (si había
      // adjunto); revocamos la original para no filtrar memoria.
      if (optimisticBlobUrl) URL.revokeObjectURL(optimisticBlobUrl);
      // Adjuntos extra van como mensajes independientes.
      for (let i = 1; i < files.length; i++) {
        await support.sendClientMessage('', files[i], newSession.id);
      }
      showToast('Mensaje enviado al desarrollador', 'success');
      retryEscalateRef.current = null;
    } catch (e: any) {
      support.markMessageFailed(optimisticId);
      retryEscalateRef.current = { optimisticId, optimisticBlobUrl, text, files, escalateInput };
    } finally {
      setEscalatingInFlight(false);
    }
  }, [support, showToast]);

  const handleSend = useCallback(async () => {
    const isInSupportFlow = view === 'support' && (inSupportMode || pendingEscalateIdx !== null);
    if (loading) return;
    if (!input.trim() && !(isInSupportFlow && pendingSupportAttachments.length > 0)) return;
    if (!isOnline || !navigator.onLine) {
      showToast('El Asistente IA necesita conexión a internet', 'warning');
      return;
    }
    const q = input;
    setInput('');

    if (view === 'support' && pendingEscalateIdx !== null) {
      const assistantMsg = messages[pendingEscalateIdx];
      const bestScore = assistantMsg?.sources?.length
        ? Math.max(...assistantMsg.sources.map(s => s.score))
        : undefined;
      const files = pendingSupportAttachments.map(a => a.file);
      const firstFile = files[0];
      const escalateInput = {
        original_question: getPriorUserQuestion(pendingEscalateIdx),
        bot_answer: assistantMsg?.content,
        best_score: bestScore,
        user_screen: currentScreen,
      };

      // Blob URL propia del bubble optimista (independiente del preview del input,
      // que revocamos a continuación). Así el bubble no se rompe si el envío falla.
      const isMediaFile = !!firstFile && (firstFile.type.startsWith('image/') || firstFile.type.startsWith('video/'));
      const optimisticBlobUrl = isMediaFile ? URL.createObjectURL(firstFile) : null;
      const attachmentType = firstFile
        ? (firstFile.type.startsWith('image/') ? 'image' : firstFile.type.startsWith('video/') ? 'video' : 'document')
        : null;

      // Mensaje optimista: aparece instantáneamente en el chat, ya con aspecto
      // de "enviado" (sin indicador "Enviando"). _optimistic evita que el reload
      // de escalate lo borre.
      const optimisticId = crypto.randomUUID();
      support.addOptimisticMessage({
        id: optimisticId,
        session_id: '__pending__',
        role: 'client',
        content: q,
        attachment_url: optimisticBlobUrl,
        attachment_type: attachmentType,
        created_at: new Date().toISOString(),
        _optimistic: true,
      });

      // Limpiamos thumbnails + estado inmediatamente para limpiar el input.
      // NO limpiamos pendingEscalateIdx aquí: performEscalation ya activa
      // escalatingInFlight, que mantiene la vista de soporte. Lo limpiamos al
      // final para no reabrir el formulario de escalación durante el envío.
      setPendingSupportAttachments(prev => { prev.forEach(a => { if (a.preview) URL.revokeObjectURL(a.preview); }); return []; });
      setShowSupportHint(false);
      setPendingEscalateIdx(null);

      await performEscalation({ optimisticId, optimisticBlobUrl, text: q, files, escalateInput });
      return;
    }

    if (view === 'support' && inSupportMode) {
      setShowSupportHint(false);
      const attachments = pendingSupportAttachments;
      setPendingSupportAttachments(prev => { prev.forEach(a => { if (a.preview) URL.revokeObjectURL(a.preview); }); return []; });
      try {
        await support.sendClientMessage(q, attachments[0]?.file);
        for (let i = 1; i < attachments.length; i++) {
          await support.sendClientMessage('', attachments[i].file);
        }
      } catch (e: any) {
        showToast(`No se pudo enviar: ${e.message}`, 'error');
      }
      return;
    }
    await sendMessage(q);
  }, [input, loading, sendMessage, showToast, isOnline, view, inSupportMode, pendingEscalateIdx, pendingSupportAttachments, messages, support, getPriorUserQuestion, currentScreen, performEscalation]);

  const handleRetryFailedMessage = useCallback(async (failedMsgId: string) => {
    if (escalatingInFlight) return;
    if (!isOnline || !navigator.onLine) {
      showToast('El Asistente IA necesita conexión a internet', 'warning');
      return;
    }
    const ctx = retryEscalateRef.current;

    // Sin contexto de escalación guardado: fallback a re-inyectar el texto al input.
    if (!ctx || ctx.optimisticId !== failedMsgId) {
      const failedMsg = support.messages.find(m => m.id === failedMsgId);
      support.removeMessage(failedMsgId);
      if (failedMsg) setInput(failedMsg.content || '');
      setView('support');
      return;
    }

    setView('support');

    // Quitamos el bubble fallido y creamos uno nuevo (se ve enviado al instante).
    support.removeMessage(failedMsgId);
    if (ctx.optimisticBlobUrl) URL.revokeObjectURL(ctx.optimisticBlobUrl);

    const firstFile = ctx.files[0];
    const isMediaFile = !!firstFile && (firstFile.type.startsWith('image/') || firstFile.type.startsWith('video/'));
    const newBlobUrl = isMediaFile ? URL.createObjectURL(firstFile) : null;
    const attachmentType = firstFile
      ? (firstFile.type.startsWith('image/') ? 'image' : firstFile.type.startsWith('video/') ? 'video' : 'document')
      : null;
    const newId = crypto.randomUUID();
    support.addOptimisticMessage({
      id: newId,
      session_id: '__pending__',
      role: 'client',
      content: ctx.text,
      attachment_url: newBlobUrl,
      attachment_type: attachmentType,
      created_at: new Date().toISOString(),
      _optimistic: true,
    });

    await performEscalation({
      optimisticId: newId,
      optimisticBlobUrl: newBlobUrl,
      text: ctx.text,
      files: ctx.files,
      escalateInput: ctx.escalateInput,
    });
  }, [support, escalatingInFlight, isOnline, showToast, performEscalation]);

  const handleSuggestionClick = useCallback(async (text: string) => {
    if (loading || view === 'support') return;
    if (!isOnline || !navigator.onLine) {
      showToast('El Asistente IA necesita conexión a internet', 'warning');
      return;
    }
    await sendMessage(text);
  }, [loading, view, isOnline, sendMessage, showToast]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleNoFeedback = useCallback((i: number) => {
    setFeedbackByIndex(prev => ({ ...prev, [i]: 'no' }));
    setEscalateForIndex(i);
    setTimeout(() => {
      const el = document.getElementById(`rag-msg-container-${i}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 80);
  }, []);

  const handleConfirmEscalate = useCallback((idx: number) => {
    const assistantMsg = messages[idx];
    if (!assistantMsg || assistantMsg.role !== 'assistant') return;
    setPendingEscalateIdx(idx);
    setShowSupportHint(true);
    setView('support');
    setEscalateForIndex(null);
    setExtraDetail('');
    setEscalateFiles([]);
  }, [messages]);

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

  // === Admin handlers (sin cambios) ===
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    try { await uploadDocument(file); }
    catch (err: any) { setUploadError(err.message); }
    e.target.value = '';
  }, [uploadDocument]);

  const handleAddVideo = useCallback(async () => {
    if (!videoForm.name || !videoForm.url) return;
    try {
      await addVideoUrl(videoForm.name, videoForm.url);
      setVideoForm({ name: '', url: '' });
      setShowAddVideo(false);
    } catch (err: any) { setUploadError(err.message); }
  }, [videoForm, addVideoUrl]);

  const handleAddGif = useCallback(async () => {
    if (!gifForm.name || !gifForm.url) return;
    try {
      await addGifUrl(gifForm.name, gifForm.url);
      setGifForm({ name: '', url: '' });
      setShowAddGif(false);
    } catch (err: any) { setUploadError(err.message); }
  }, [gifForm, addGifUrl]);

  const handleClearConfirm = useCallback(async () => {
    await clearAllDocuments();
    setShowClearModal(false);
  }, [clearAllDocuments]);

  // === Tutoriales (Requisitos 1, 4, 7) ===
  // Lista mostrada: en DEV se fusiona `TUTORIALS` con el overlay de localStorage;
  // en producción la rama DEV es `false` y el bundler la elimina, por lo que
  // `getDevOverlay` ni siquiera se invoca (Req 7.5, 7.7).
  const tutorialList = useMemo<TutorialConfig[]>(
    () => (import.meta.env.DEV ? [...TUTORIALS, ...getDevOverlay()] : TUTORIALS),
    // devOverlayVersion es el trigger para recomputar cuando el panel dev
    // agrega una entrada; incluir tutorialList original no aporta porque el
    // arreglo es una constante importada.
    [devOverlayVersion]
  );

  // ¿Hay al menos un tutorial abierto en el chat? (Req 4.1/4.2)
  const hasOpenTutorial = useMemo(
    () => messages.some(m => m.kind === 'tutorial'),
    [messages]
  );

  // Id del tutorial actualmente abierto = último mensaje `user` con `kind === 'tutorial'`,
  // mapeado a `id` buscando en `tutorialList` por título (Req 4.3).
  const currentTutorialId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.kind === 'tutorial' && m.role === 'user') {
        return tutorialList.find(t => t.title === m.content)?.id ?? null;
      }
    }
    return null;
  }, [messages, tutorialList]);

  // Handlers de la lista de tutoriales (accesibles con teclado).
  const handleTutorialClick = useCallback((tutorial: TutorialConfig) => {
    // Ignoramos clicks si la IA está respondiendo o el usuario está en otra
    // pestaña. Los tutoriales son 100% locales: sí funcionan sin internet.
    if (loading || view !== 'chat') return;
    showTutorial({ title: tutorial.title, content: tutorial.content });
  }, [loading, view, showTutorial]);

  const handleTutorialKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, tutorial: TutorialConfig) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleTutorialClick(tutorial);
      }
    },
    [handleTutorialClick]
  );

  const handleTutorialMenuSelect = useCallback((tutorial: TutorialConfig) => {
    showTutorial({ title: tutorial.title, content: tutorial.content });
    setShowTutorialMenu(false);
  }, [showTutorial]);

  const handleTutorialMenuKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, tutorial: TutorialConfig) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleTutorialMenuSelect(tutorial);
      }
    },
    [handleTutorialMenuSelect]
  );

  const handleToggleTutorialMenu = useCallback(() => {
    setShowTutorialMenu(v => !v);
  }, []);

  const handleToggleDevManager = useCallback(() => {
    setShowDevManager(v => !v);
  }, []);

  // Cerrar el menú del header con Escape o clic fuera (Req 4.5). Sigue el mismo
  // patrón que el lightbox: listeners globales registrados solo mientras el
  // menú está abierto, con cleanup al cerrar. No toca `messages` ni el
  // tutorial actualmente abierto.
  useEffect(() => {
    if (!showTutorialMenu) return;
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowTutorialMenu(false);
    };
    const handleGlobalMouseDown = (e: MouseEvent) => {
      if (tutorialMenuRef.current && !tutorialMenuRef.current.contains(e.target as Node)) {
        setShowTutorialMenu(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    window.addEventListener('mousedown', handleGlobalMouseDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener('mousedown', handleGlobalMouseDown);
    };
  }, [showTutorialMenu]);

  // Cuando se abre otro tutorial cambia la vista actual: cerramos el menú.
  useEffect(() => {
    setShowTutorialMenu(false);
  }, [currentTutorialId]);

  const pendingDocs = documents.filter(d => d.status === 'pending');

  let lastAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') { lastAssistantIdx = i; break; }
  }

  // === RENDER ===
  const renderFeedback = (i: number, msg: RagMessage) => {
    if (msg.role !== 'assistant' || i === 0) return null;
    // No mostrar feedback en burbujas de tutorial (contenido curado local:
    // no tiene sentido preguntar "¿esto resolvió tu duda?" ni escalar).
    if (msg.kind === 'tutorial') return null;
    // No mostrar feedback mientras la IA está generando o el mensaje está vacío
    if (loading || !msg.content?.trim()) return null;
    // Mientras haya una sesión activa o pendiente NO permitimos 2do escalado.
    if (inSupportMode || pendingEscalateIdx !== null) return null;
    // Si el bot clasificó la pregunta como ajena a Bistro, no ofrecemos
    // feedback ni escalación al desarrollador.
    if (msg.is_about_bistro === false) return null;
    const fb = feedbackByIndex[i];
    if (escalateForIndex === i) {
      return (
        <div className="mt-2 ml-1 space-y-2">
          {devAvail.availability && !devAvail.isAvailableNow && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 p-2.5 space-y-1.5">
              <div className="flex items-start gap-1.5">
                <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[16px] shrink-0">schedule</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] md:text-[12px] font-bold text-amber-800 dark:text-amber-300 leading-tight">
                    Estás fuera del horario de soporte
                  </p>
                  <p className="text-[10px] md:text-[11px] text-text-secondary leading-snug mt-0.5">
                    Horario: <b>{devAvail.scheduleLabel}</b>
                  </p>
                  {devAvail.nextAvailableLabel && (
                    <p className="text-[10px] md:text-[11px] text-text-secondary leading-snug">
                      Próxima disponibilidad: <b>{devAvail.nextAvailableLabel}</b>
                    </p>
                  )}
                </div>
              </div>
              <p className="text-[10px] md:text-[11px] text-text-secondary leading-snug pl-[22px]">
                💡 Igual le llegará tu consulta — a veces responde fuera de horario.
              </p>
            </div>
          )}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => handleConfirmEscalate(i)}
              disabled={support.loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white text-[12px] font-bold transition-all active:scale-95 shadow-sm"
              aria-label="Contactar con soporte"
              tabIndex={0}
            >
              <span className="material-symbols-outlined text-[15px]" style={{ fontVariationSettings: "'FILL' 1" }}>support_agent</span>
              {support.loading ? 'Conectando...' : 'Contactar con soporte'}
            </button>
            <button
              onClick={() => { setEscalateForIndex(null); setExtraDetail(''); setEscalateFiles([]); }}
              className="text-[11px] font-medium text-text-secondary hover:text-text-main transition"
              aria-label="Cancelar"
              tabIndex={0}
            >
              Cancelar
            </button>
          </div>
        </div>
      );
    }
    if (fb) {
      return (
        <p className="mt-1 ml-1 text-[10px] text-text-secondary">
          {fb === 'yes' ? '✓ Gracias por confirmar' : '✓ Marcado como no resuelto'}
        </p>
      );
    }
    return (
      <div className="mt-1 ml-1 flex items-center gap-2 text-[11px] text-text-secondary">
        <span>¿Esto resolvió tu duda?</span>
        <button
          onClick={() => setFeedbackByIndex(prev => ({ ...prev, [i]: 'yes' }))}
          className="px-2 py-0.5 rounded-full bg-background-light dark:bg-gray-800 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-600 border border-border-light dark:border-border-dark transition"
          aria-label="Sí me ayudó"
        >👍 Sí</button>
        <button
          onClick={() => handleNoFeedback(i)}
          className="px-2 py-0.5 rounded-full bg-background-light dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 border border-border-light dark:border-border-dark transition"
          aria-label="No me ayudó"
        >👎 No</button>
      </div>
    );
  };

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

  const renderClosedSessionCard = (s: SupportSession, msgs: SupportMessage[]) => {
    if (msgs.length === 0) return null;
    const expanded = !!closedExpanded[s.id];
    const closedAt = formatClosedAt(s.closed_at);
    const expiresAt = formatExpiresAt(s.closed_at);
    const expiresIn = formatExpiresIn(s.closed_at);
    return (
      <div key={s.id} className="rounded-2xl border border-border-light dark:border-border-dark bg-background-light/50 dark:bg-gray-800/30 overflow-hidden">
        <button
          onClick={() => setClosedExpanded(prev => ({ ...prev, [s.id]: !prev[s.id] }))}
          className="w-full flex items-center gap-2.5 px-3.5 py-3 md:px-4 md:py-3.5 hover:bg-background-light dark:hover:bg-gray-800/60 transition text-left"
        >
          <div className="size-7 md:size-8 rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[16px] md:text-[18px] text-text-secondary">check_circle</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] md:text-[13.5px] font-bold text-text-main dark:text-gray-200 leading-tight">Conversación con soporte cerrada</p>
            {closedAt && (
              <p className="text-[10px] md:text-[11.5px] text-text-secondary leading-tight mt-0.5">{closedAt} · {msgs.length} mensaje{msgs.length !== 1 ? 's' : ''}</p>
            )}
          </div>
          <span className={`material-symbols-outlined text-[18px] md:text-[20px] text-text-secondary transition-transform ${expanded ? 'rotate-180' : ''}`}>
            expand_more
          </span>
        </button>
        {expanded && (
          <div className="p-3.5 md:p-4 pt-1 space-y-3 md:space-y-4 border-t border-border-light dark:border-border-dark">
            {msgs.map(renderSupportMessage)}
            {expiresAt && (
              <div className="flex items-center justify-center gap-1.5 pt-2 mt-1 border-t border-border-light dark:border-border-dark">
                <span className="material-symbols-outlined text-[14px] md:text-[16px] text-text-secondary">schedule</span>
                <span className="text-[10px] md:text-[11.5px] text-text-secondary leading-tight text-center">
                  {expiresIn} · se borra el {expiresAt}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const historyContent = (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-light dark:border-border-dark shrink-0">
        <button
          onClick={() => setShowHistory(false)}
          className="size-7 md:size-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-main hover:bg-background-light dark:hover:bg-gray-700 transition-colors"
          title="Volver al chat"
          aria-label="Volver al chat"
          tabIndex={0}
        >
          <span className="material-symbols-outlined text-[18px] md:text-[20px]">arrow_back</span>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] md:text-[14.5px] font-bold text-text-main dark:text-white leading-tight">Conversaciones cerradas</p>
          <p className="text-[10px] md:text-[12px] text-text-secondary leading-tight">{closedSessionsList.length} disponible{closedSessionsList.length !== 1 ? 's' : ''} · se borran a la hora</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 custom-scrollbar">
        {closedSessionsList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-8">
            <span className="material-symbols-outlined text-[36px] text-text-secondary">inbox</span>
            <p className="text-[12px] md:text-[14.5px] text-text-secondary">No hay conversaciones cerradas vigentes</p>
          </div>
        ) : (
          closedSessionsList.map(({ session: s, messages: msgs }) => renderClosedSessionCard(s, msgs))
        )}
      </div>
    </div>
  );

  const STARTER_SUGGESTIONS = [
    { icon: '🖨️', text: '¿Cómo configuro mi impresora?' },
    { icon: '💰', text: '¿Cómo hago un cierre de caja?' },
    { icon: '📦', text: '¿Cómo creo un producto nuevo?' },
    { icon: '🏷️', text: '¿Cómo aplico descuentos?' },
  ];

  const chatContent = (
    <>
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5 custom-scrollbar">
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-start min-h-full text-center px-2 pt-4 animate-slideInUpSubtle">
            <h3 className="text-[13px] md:text-[14px] font-semibold text-text-main dark:text-white mb-0.5">Asistente Bistro</h3>
            <p className="text-[11px] md:text-[12px] text-text-secondary leading-snug max-w-[280px] mb-3">
              Pregúntame sobre el uso de tu punto de venta o selecciona un tutorial.
            </p>

            <div className="w-full max-w-xs md:max-w-lg">
              {tutorialList.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {tutorialList.map((tutorial) => (
                      <button
                        key={tutorial.id}
                        type="button"
                        onClick={() => handleTutorialClick(tutorial)}
                        onKeyDown={(e) => handleTutorialKeyDown(e, tutorial)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border-light dark:border-border-dark bg-background-light dark:bg-gray-800/50 hover:border-amber-300 dark:hover:border-amber-700 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-all text-left group active:scale-[0.98] min-h-[48px]"
                        aria-label={`Abrir tutorial: ${tutorial.title}`}
                        tabIndex={0}
                      >
                        <span className="text-[13px] md:text-[13px] leading-tight text-text-main dark:text-gray-200 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors flex-1">{tutorial.title}</span>
                        <span className="material-symbols-outlined text-[14px] text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity shrink-0">arrow_forward</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-wider text-text-secondary mb-1.5">Prueba con</p>
                  {STARTER_SUGGESTIONS.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSuggestionClick(s.text)}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-border-light dark:border-border-dark bg-background-light dark:bg-gray-800/50 hover:border-amber-300 dark:hover:border-amber-700 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-all text-left group active:scale-[0.98]"
                      aria-label={`Preguntar: ${s.text}`}
                    >
                      <span className="text-[13px] md:text-[14px] text-text-main dark:text-gray-200 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">{s.text}</span>
                      <span className="material-symbols-outlined text-[14px] text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity ml-auto">arrow_forward</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>
        )}
        {messages.map((msg, i) => {
          // No renderizar burbuja del assistant vacía mientras la IA carga
          const isEmptyAssistant = msg.role === 'assistant' && !msg.content?.trim();
          if (isEmptyAssistant && loading) return null;

          return (
          <div key={`rag-${i}`} id={`rag-msg-container-${i}`} ref={i === lastAssistantIdx ? lastAssistantMsgRef : undefined} className="animate-slideInUpSubtle space-y-1.5">
            <div className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
                msg.role === 'user'
                  ? 'max-w-[85%] bg-[#102218] dark:bg-[#0d1c14] text-white rounded-tr-sm font-medium'
                  : 'w-full bg-background-light dark:bg-gray-800 text-text-main dark:text-gray-100 rounded-tl-sm'
              }`}>
                {msg.role === 'assistant' ? <ChatMessage content={msg.content} /> : <span>{msg.content}</span>}
              </div>
            </div>
            {renderFeedback(i, msg)}
            {i === lastAssistantIdx && !loading && view === 'chat' && escalateForIndex !== i &&
              msg.suggestions && msg.suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2 ml-1">
                {msg.suggestions.map((s, si) => (
                  <button
                    key={si}
                    onClick={() => handleSuggestionClick(s)}
                    tabIndex={0}
                    aria-label={`Preguntar: ${s}`}
                    className="text-[11px] md:text-[12px] px-2.5 py-1.5 rounded-full border border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition text-left leading-snug"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )})}
        {loading && !(messages.at(-1)?.role === 'assistant' && messages.at(-1)?.content) && (
          <div className="flex justify-start">
            <div className="bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
              <span className="size-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="size-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="size-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="px-3 pb-3 pt-1.5 shrink-0">
        <div className={`relative flex flex-col bg-background-light dark:bg-gray-800 rounded-3xl border transition-all p-2 shadow-sm ${
          isRecording 
            ? 'border-amber-400 dark:border-amber-500/50 shadow-[0_0_15px_rgba(251,191,36,0.15)] ring-1 ring-amber-400/30' 
            : 'border-border-light dark:border-border-dark focus-within:border-amber-400 dark:focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-400/10'
        }`}>
          <textarea
            ref={textareaRef}
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
            rows={1}
            placeholder={isRecording ? "Escuchando..." : "Pregunta algo..."}
            className="w-full bg-transparent border-0 focus:ring-0 focus:outline-none resize-none text-[15px] p-2 px-3 text-text-main dark:text-gray-100 placeholder-text-secondary outline-none max-h-[120px] custom-scrollbar leading-relaxed"
            aria-label="Campo de pregunta"
          />
          
          <div className="flex items-center justify-between mt-1 px-1 pb-1">
            {/* Left Actions */}
            <div className="flex items-center gap-1.5">
              {isRecording ? (
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    stopDictation();
                    textareaRef.current?.focus();
                  }}
                  className="size-8 flex items-center justify-center rounded-full hover:bg-amber-100 dark:hover:bg-gray-700 text-amber-600 dark:text-amber-400 transition-all active:scale-95 ml-1"
                  title="Pausar dictado"
                  aria-label="Pausar dictado"
                >
                  <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>stop</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 ml-1">
                  <div className="size-6 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-amber-500 text-[14px]">smart_toy</span>
                  </div>
                  <span className="text-[11px] font-bold text-text-secondary">IA Bistro</span>
                </div>
              )}
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-1.5">
              {isSupported && !isRecording && (
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    handleStartDictation();
                    textareaRef.current?.focus();
                  }}
                  disabled={loading && !effectiveSupportMode}
                  className="size-9 flex items-center justify-center rounded-full transition-all active:scale-95 bg-surface-light dark:bg-gray-700/60 text-text-secondary hover:text-amber-500 hover:bg-gray-200 dark:hover:bg-gray-600"
                  title="Dictar por voz"
                  aria-label="Dictar por voz"
                >
                  <span className="material-symbols-outlined text-[20px]">mic</span>
                </button>
              )}
              {isRecording ? (
                <div className="relative flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full bg-amber-500 opacity-30 animate-ping" style={{ animationDuration: '2.5s' }}></div>
                  <div className="absolute inset-[-4px] rounded-full border border-amber-500/20 animate-pulse"></div>
                  
                  <button
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => {
                      textareaRef.current?.blur();
                      stopDictation();
                      if (input.trim()) {
                        handleSend();
                      }
                    }}
                    disabled={loading}
                    className="relative z-10 size-9 flex items-center justify-center bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200 dark:disabled:bg-gray-700/50 disabled:text-gray-400 text-amber-950 rounded-full transition-all active:scale-95 shadow-sm"
                    title="Confirmar y enviar"
                    aria-label="Confirmar y enviar"
                  >
                    <span className="material-symbols-outlined text-[20px]">check</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  className="size-9 flex items-center justify-center bg-amber-400 hover:bg-amber-500 disabled:bg-gray-200 dark:disabled:bg-gray-700/50 disabled:text-gray-400 dark:disabled:text-gray-500 disabled:cursor-not-allowed text-amber-950 rounded-full transition-all active:scale-95"
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
        {showSupportHint && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/60 dark:bg-amber-900/15 border border-amber-200/60 dark:border-amber-800/40">
            <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[17px] shrink-0 mt-0.5">info</span>
            <p className="text-[12px] text-text-secondary leading-snug">
              Escribe tu consulta para conectarte con el equipo de soporte. Puedes adjuntar <b>imágenes</b>, <b>videos</b> o <b>documentos</b> directamente en el chat.
            </p>
          </div>
        )}
        {pendingEscalateIdx !== null
          ? null
          : support.messages.length === 0 && !showSupportHint
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
            onClick={support.closeSession}
            className="text-[10px] font-medium text-text-secondary hover:text-red-500 transition"
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
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
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

  const docsContent = (
    <>
      <div className="px-4 py-3 border-b border-border-light dark:border-border-dark shrink-0 flex items-center justify-between bg-background-light/50 dark:bg-gray-800/30">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-amber-500 text-[18px]">folder_open</span>
          <span className="text-[12px] font-bold tracking-tight text-text-main dark:text-white">Base de Conocimiento</span>
          <span className="text-[10px] font-bold bg-surface-light dark:bg-gray-700 text-text-secondary px-2 py-0.5 rounded-full">{documents.length}</span>
        </div>
        <button
          onClick={fetchDocuments}
          className="size-7 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-main hover:bg-surface-light dark:hover:bg-gray-700 transition-colors"
          title="Refrescar"
          aria-label="Refrescar lista"
        >
          <span className="material-symbols-outlined text-[16px]">refresh</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar relative">
        {uploading && (
          <div className="absolute inset-0 bg-surface-light/80 dark:bg-surface-dark/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-2">
            <div className="size-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-amber-500 text-[20px] animate-spin">sync</span>
            </div>
            <p className="text-[13px] font-bold text-text-main dark:text-white">Subiendo documento...</p>
          </div>
        )}

        {documents.length === 0 && !uploading && (
          <div className="flex flex-col items-center justify-center h-full text-center opacity-60 py-10">
            <span className="material-symbols-outlined text-[40px] mb-2 text-text-secondary">docs_add_on</span>
            <p className="text-[12px] text-text-secondary">No hay documentos indexados.<br/>Sube uno para comenzar.</p>
          </div>
        )}

        {documents.map(doc => (
          <div key={doc.id} className="flex items-center gap-2.5 p-2.5 bg-background-light dark:bg-gray-800/50 border border-border-light dark:border-border-dark rounded-lg group transition-colors hover:border-amber-300 dark:hover:border-amber-700">
            <span className={`material-symbols-outlined text-[20px] flex-shrink-0 ${
              doc.source_type === 'pdf' ? 'text-rose-500' :
              doc.source_type === 'video' ? 'text-blue-500' :
              doc.source_type === 'gif' ? 'text-purple-500' :
              doc.source_type === 'markdown' ? 'text-emerald-600' : 'text-text-secondary'
            }`}>
              {doc.source_type === 'pdf' ? 'picture_as_pdf'
                : doc.source_type === 'video' ? 'play_circle'
                : doc.source_type === 'markdown' ? 'description'
                : 'gif'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-text-main dark:text-gray-200 truncate">{doc.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`size-1.5 rounded-full ${
                  doc.status === 'indexed' ? 'bg-emerald-500' :
                  doc.status === 'error' ? 'bg-red-500' : 'bg-amber-400 animate-pulse'
                }`}></span>
                <span className="text-[9px] uppercase font-bold tracking-wider text-text-secondary">
                  {doc.status === 'indexed' ? 'Indexado' : doc.status === 'error' ? 'Error' : 'Pendiente'}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {doc.status === 'pending' && (
                <button
                  onClick={() => indexDocument(doc.id)}
                  disabled={indexing === doc.id}
                  className="size-6 rounded-md flex items-center justify-center bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 transition-colors disabled:opacity-50"
                  title="Indexar ahora"
                  aria-label="Indexar ahora"
                >
                  <span className={`material-symbols-outlined text-[14px] ${indexing === doc.id ? 'animate-spin' : ''}`}>
                    {indexing === doc.id ? 'sync' : 'bolt'}
                  </span>
                </button>
              )}
              {(doc.status === 'indexed' || doc.status === 'error') && (
                <button
                  onClick={() => indexDocument(doc.id)}
                  disabled={indexing === doc.id}
                  className="size-6 rounded-md flex items-center justify-center bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 transition-colors disabled:opacity-50"
                  title="Re-indexar"
                  aria-label="Re-indexar"
                >
                  <span className={`material-symbols-outlined text-[14px] ${indexing === doc.id ? 'animate-spin' : ''}`}>
                    {indexing === doc.id ? 'sync' : 'refresh'}
                  </span>
                </button>
              )}
              <button
                onClick={() => deleteDocument(doc)}
                className="size-6 rounded-md flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 transition-colors"
                title="Eliminar"
                aria-label="Eliminar"
              >
                <span className="material-symbols-outlined text-[14px]">delete</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-border-light dark:border-border-dark space-y-2 shrink-0 bg-surface-light dark:bg-surface-dark">
        {(uploadError || indexError) && (
          <p className="text-[11px] text-red-500 font-medium bg-red-50 dark:bg-red-900/20 p-2 rounded-lg break-words">
            {uploadError || indexError}
          </p>
        )}

        {pendingDocs.length > 0 && (
          <button
            onClick={() => pendingDocs.forEach(d => indexDocument(d.id))}
            className="w-full flex items-center justify-center gap-1.5 py-2 bg-amber-400 hover:bg-amber-500 text-amber-900 text-[12px] font-bold rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">bolt</span>
            Indexar pendientes ({pendingDocs.length})
          </button>
        )}

        <div className="grid grid-cols-3 gap-1.5">
          <input ref={fileInputRef} type="file" accept=".pdf,.md,.txt,.png,.jpg,.jpeg,.webp" className="hidden" onChange={handleFileChange} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-0.5 py-2.5 border border-border-light dark:border-border-dark hover:border-rose-400 dark:hover:border-rose-500 text-text-secondary hover:text-rose-500 bg-background-light dark:bg-gray-800/50 rounded-lg transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">upload_file</span>
            <span className="text-[9px] font-bold uppercase">PDF / MD</span>
          </button>
          <button
            onClick={() => setShowAddVideo(true)}
            className="flex flex-col items-center justify-center gap-0.5 py-2.5 border border-border-light dark:border-border-dark hover:border-blue-400 dark:hover:border-blue-500 text-text-secondary hover:text-blue-500 bg-background-light dark:bg-gray-800/50 rounded-lg transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">videocam</span>
            <span className="text-[9px] font-bold uppercase">Video</span>
          </button>
          <button
            onClick={() => setShowAddGif(true)}
            className="flex flex-col items-center justify-center gap-0.5 py-2.5 border border-border-light dark:border-border-dark hover:border-purple-400 dark:hover:border-purple-500 text-text-secondary hover:text-purple-500 bg-background-light dark:bg-gray-800/50 rounded-lg transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">gif_box</span>
            <span className="text-[9px] font-bold uppercase">GIF</span>
          </button>
        </div>

        <button
          onClick={() => setShowClearModal(true)}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-[11px] font-semibold rounded-lg transition-colors"
        >
          <span className="material-symbols-outlined text-[14px]">delete_sweep</span>
          Vaciar base de conocimiento
        </button>
      </div>
    </>
  );



  const attachmentLightbox = viewingAttachment && (
    <div
      className="fixed inset-0 z-[300] bg-black flex items-center justify-center animate-[fadeIn_0.15s_ease-out]"
      onClick={() => setViewingAttachment(null)}
    >
      <button
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
            onClick={() => setViewingAttachment(null)}
            className="text-[12px] font-semibold text-text-secondary hover:text-text-main transition"
          >Cerrar</button>
        </div>
      )}
    </div>
  );

  const adminModals = isAdmin && (
    <>
      {showClearModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-surface-light dark:bg-surface-dark rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-border-light dark:border-border-dark">
            <div className="flex flex-col items-center text-center gap-3 mb-5">
              <div className="size-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center text-red-500">
                <span className="material-symbols-outlined text-[28px]">warning</span>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-text-main dark:text-white mb-1">¿Vaciar Base?</h3>
                <p className="text-[12px] text-text-secondary leading-relaxed">
                  Se eliminarán todos los documentos, videos y vectores indexados. Acción irreversible.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowClearModal(false)} className="flex-1 py-2.5 bg-background-light dark:bg-gray-800 rounded-lg text-[13px] font-bold text-text-main dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
              <button onClick={handleClearConfirm} disabled={clearing} className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-[13px] font-bold transition-all active:scale-95 disabled:opacity-50">{clearing ? 'Vaciando...' : 'Vaciar'}</button>
            </div>
          </div>
        </div>
      )}

      {showAddVideo && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-surface-light dark:bg-surface-dark rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-border-light dark:border-border-dark">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="size-9 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center text-blue-500">
                <span className="material-symbols-outlined text-[20px]">videocam</span>
              </div>
              <h3 className="text-base font-semibold text-text-main dark:text-white">Agregar Video</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 ml-1">Título</label>
                <input type="text" placeholder="Ej. Cómo configurar impresoras" value={videoForm.name} onChange={e => setVideoForm(v => ({ ...v, name: e.target.value }))} className="w-full border-2 border-border-light dark:border-gray-700 rounded-lg px-3 py-2.5 text-[13px] bg-background-light dark:bg-gray-800/50 text-text-main dark:text-gray-100 placeholder-gray-400 outline-none focus:border-blue-400 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 ml-1">URL (YouTube / Drive)</label>
                <input type="url" placeholder="https://youtube.com/..." value={videoForm.url} onChange={e => setVideoForm(v => ({ ...v, url: e.target.value }))} className="w-full border-2 border-border-light dark:border-gray-700 rounded-lg px-3 py-2.5 text-[13px] bg-background-light dark:bg-gray-800/50 text-text-main dark:text-gray-100 placeholder-gray-400 outline-none focus:border-blue-400 transition-colors" />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowAddVideo(false)} className="flex-1 py-2.5 bg-background-light dark:bg-gray-800 rounded-lg text-[13px] font-bold text-text-main dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
              <button onClick={handleAddVideo} disabled={!videoForm.name || !videoForm.url} className="flex-1 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-[13px] font-bold transition-all active:scale-95 disabled:opacity-50">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {showAddGif && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-surface-light dark:bg-surface-dark rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-border-light dark:border-border-dark">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="size-9 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center text-purple-500">
                <span className="material-symbols-outlined text-[20px]">gif_box</span>
              </div>
              <h3 className="text-base font-semibold text-text-main dark:text-white">Agregar Imagen / GIF</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 ml-1">Descripción corta</label>
                <input type="text" placeholder="Ej. Flujo de caja cerrado" value={gifForm.name} onChange={e => setGifForm(v => ({ ...v, name: e.target.value }))} className="w-full border-2 border-border-light dark:border-gray-700 rounded-lg px-3 py-2.5 text-[13px] bg-background-light dark:bg-gray-800/50 text-text-main dark:text-gray-100 placeholder-gray-400 outline-none focus:border-purple-400 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 ml-1">URL Pública</label>
                <input type="url" placeholder="https://.../imagen.gif" value={gifForm.url} onChange={e => setGifForm(v => ({ ...v, url: e.target.value }))} className="w-full border-2 border-border-light dark:border-gray-700 rounded-lg px-3 py-2.5 text-[13px] bg-background-light dark:bg-gray-800/50 text-text-main dark:text-gray-100 placeholder-gray-400 outline-none focus:border-purple-400 transition-colors" />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowAddGif(false)} className="flex-1 py-2.5 bg-background-light dark:bg-gray-800 rounded-lg text-[13px] font-bold text-text-main dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
              <button onClick={handleAddGif} disabled={!gifForm.name || !gifForm.url} className="flex-1 py-2.5 bg-purple-500 hover:bg-purple-600 text-white rounded-lg text-[13px] font-bold transition-all active:scale-95 disabled:opacity-50">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  const offlineContent = (
    <div className="flex-1 flex flex-col items-center justify-center h-full p-8 text-center gap-5">
      <div className="size-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
        <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[32px]" style={{ fontVariationSettings: "'FILL' 1" }}>wifi_off</span>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Sin conexión</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-xs">
          El Asistente IA requiere internet para responder preguntas.
        </p>
      </div>
    </div>
  );

  const activeContent = !isOnline
    ? offlineContent
    : view === 'docs' && isAdmin
    ? docsContent
    : view === 'support' && supportViewActive
    ? supportContent
    : (showHistory ? historyContent : chatContent);

  const historyButton = (view === 'chat' && closedSessionsList.length > 0 && !showHistory) ? (
    <button
      onClick={() => setShowHistory(true)}
      className="size-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-main hover:bg-background-light dark:hover:bg-gray-700 transition-colors relative"
      title="Conversaciones cerradas"
      aria-label="Ver conversaciones cerradas"
      tabIndex={0}
    >
      <span className="material-symbols-outlined text-[17px]">history</span>
      <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-1 rounded-full bg-amber-400 text-amber-950 text-[9px] font-bold flex items-center justify-center">
        {closedSessionsList.length}
      </span>
    </button>
  ) : null;

  // Control "Lista de tutoriales" en el header. Solo visible cuando hay al
  // menos un tutorial abierto en la vista de chat (Req 4.1, 4.2). El dropdown
  // muestra los tutoriales distintos al actual (Req 4.3) y su cierre no cambia
  // `messages` (Req 4.5).
  const tutorialMenuOptions = tutorialList.filter(t => t.id !== currentTutorialId);
  const tutorialMenuButton = (hasOpenTutorial && view === 'chat' && !showHistory) ? (
    <div className="relative" ref={tutorialMenuRef}>
      <button
        type="button"
        onClick={handleToggleTutorialMenu}
        className="h-8 flex items-center gap-1 px-2.5 rounded-lg text-[13px] font-medium text-text-secondary hover:text-text-main hover:bg-background-light dark:hover:bg-gray-700 transition-colors"
        title="Lista de tutoriales"
        aria-label="Lista de tutoriales"
        aria-haspopup="menu"
        aria-expanded={showTutorialMenu}
        tabIndex={0}
      >
        <span>Tutoriales</span>
        <span
          className={`material-symbols-outlined text-[18px] transition-transform ${showTutorialMenu ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>
      {showTutorialMenu && (
        <div
          role="menu"
          className="absolute left-0 md:left-auto md:right-0 top-full mt-2 z-[120] w-[264px] max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 border border-border-light dark:border-border-dark rounded-xl shadow-xl p-1.5 max-h-[min(340px,60vh)] overflow-y-auto custom-scrollbar"
        >
          {tutorialMenuOptions.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-center text-text-secondary">Sin más tutoriales disponibles.</p>
          ) : (
            tutorialMenuOptions.map(tutorial => (
              <button
                key={tutorial.id}
                type="button"
                role="menuitem"
                onClick={() => handleTutorialMenuSelect(tutorial)}
                onKeyDown={(e) => handleTutorialMenuKeyDown(e, tutorial)}
                className="group w-full flex items-center gap-2.5 min-h-[40px] px-2.5 py-2 rounded-lg text-left text-[13px] text-text-main dark:text-gray-100 hover:bg-amber-50 dark:hover:bg-gray-700/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 transition-colors"
                aria-label={`Abrir tutorial: ${tutorial.title}`}
                tabIndex={0}
              >
                <span className="material-symbols-outlined text-[18px] text-text-secondary group-hover:text-amber-600 transition-colors shrink-0">menu_book</span>
                <span className="flex-1 leading-snug">{tutorial.title}</span>
                <span className="material-symbols-outlined text-[16px] text-transparent group-hover:text-amber-600 transition-colors shrink-0">chevron_right</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  ) : null;

  // Botón "Gestionar tutoriales" — dev-only (Req 7.1, 7.2). Se escribe de
  // forma que el bundler pueda eliminarlo en producción (rama `false` sobre
  // literal `import.meta.env.DEV`).
  const devManagerButton = (import.meta.env.DEV && view === 'chat' && !showHistory) ? (
    <button
      type="button"
      onClick={handleToggleDevManager}
      className="size-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-main hover:bg-background-light dark:hover:bg-gray-700 transition-colors"
      title="Gestionar tutoriales (dev)"
      aria-label="Gestionar tutoriales"
      tabIndex={0}
    >
      <span className="material-symbols-outlined text-[17px]">edit_note</span>
    </button>
  ) : null;

  const supportTabButton = inSupportMode && view !== 'support' ? (
    <button
      onClick={() => setView('support')}
      className="size-8 flex items-center justify-center rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors relative"
      title="Ir a soporte"
      aria-label="Ver conversación con soporte"
      tabIndex={0}
    >
      <span className="material-symbols-outlined text-[17px]">support_agent</span>
      <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
    </button>
  ) : null;

  const headerTitle = view === 'support'
    ? '💬 Soporte Bistro'
    : view === 'docs' ? 'Base de Conocimiento' : 'Asistente IA';
  const headerSubtitle = view === 'support'
    ? (devHasResponded ? 'Conectado con soporte' : inSupportMode ? 'Consulta enviada' : 'Soporte humano')
    : view === 'docs' ? 'Base de conocimiento' : 'Bistro POS';

  // DESKTOP
  if (isDesktop) {
    const visible = isOpen && !isMinimized;
    // Calcular left dinámico según estado del sidebar
    const sidebarWidth = !isSidebarOpen ? 0 : isSidebarCollapsed ? 64 : 256;
    const panelLeft = sidebarWidth + 16;
    const panelWidth = `min(580px, calc(100vw - ${sidebarWidth + 32}px))`;

    return (
      <>
        <div
          className={`fixed top-0 bottom-0 right-0 bg-black/25 backdrop-blur-[3px] z-[54] transition-opacity duration-300 ${visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          style={{ left: `${sidebarWidth}px` }}
          onClick={onClose}
        />
        <div
          className={`fixed z-[110] flex flex-col bg-surface-light dark:bg-surface-dark border border-border-light dark:border-border-dark rounded-2xl overflow-hidden transition-all duration-300 ease-out ${
            visible ? 'opacity-100 translate-x-0 pointer-events-auto' : 'opacity-0 -translate-x-4 pointer-events-none'
          }`}
          style={{ left: `${panelLeft}px`, top: '16px', bottom: '16px', width: panelWidth }}
        >
          <div className="flex items-center gap-3 px-4 h-[54px] border-b border-border-light dark:border-border-dark shrink-0">

            <div className="flex-1 flex items-center min-w-0 gap-2">
              <div className="flex items-center bg-gray-100 dark:bg-gray-800/80 border border-gray-200/30 dark:border-gray-700/30 p-0.5 rounded-full gap-0.5 shadow-inner">
                {/* Pestaña: Asistente IA */}
                <button
                  onClick={() => { setView('chat'); setShowHistory(false); }}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                    view === 'chat' && !showHistory
                      ? 'bg-white dark:bg-gray-700 text-text-main dark:text-white shadow-sm'
                      : 'text-text-secondary hover:text-text-main dark:hover:text-white hover:bg-white/50 dark:hover:bg-gray-700/50'
                  }`}
                  aria-label="Asistente IA"
                >
                  <span className="material-symbols-outlined text-[14px]">smart_toy</span>
                  <span>Chat</span>
                </button>

                {/* Pestaña: Soporte */}
                {supportViewActive && (
                  <button
                    onClick={() => setView('support')}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                      view === 'support'
                        ? 'bg-white dark:bg-gray-700 text-text-main dark:text-white shadow-sm'
                        : 'text-text-secondary hover:text-text-main dark:hover:text-white hover:bg-white/50 dark:hover:bg-gray-700/50'
                    }`}
                    aria-label="Soporte humano"
                  >
                    <span className="material-symbols-outlined text-[14px]">support_agent</span>
                    <span>Soporte</span>
                    {view !== 'support' && (
                      <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    )}
                  </button>
                )}

                {/* Pestaña: Base de Conocimiento (Admin) */}
                {isAdmin && (
                  <button
                    onClick={() => setView(v => v === 'chat' ? 'docs' : 'chat')}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                      view === 'docs'
                        ? 'bg-white dark:bg-gray-700 text-text-main dark:text-white shadow-sm'
                        : 'text-text-secondary hover:text-text-main dark:hover:text-white hover:bg-white/50 dark:hover:bg-gray-700/50'
                    }`}
                    aria-label="Base de conocimiento"
                  >
                    <span className="material-symbols-outlined text-[14px]">folder_open</span>
                    <span>Base</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              {historyButton}
              {tutorialMenuButton}
              {devManagerButton}
              {view === 'chat' && !showHistory && (
                <button
                  onClick={clearChat}
                  className="size-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-main hover:bg-background-light dark:hover:bg-gray-700 transition-colors"
                  title="Nueva conversación"
                >
                  <span className="material-symbols-outlined text-[17px]">refresh</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="size-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="Cerrar"
              >
                <span className="material-symbols-outlined text-[17px]">close</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col flex-1 min-h-0">{activeContent}</div>
        </div>

        {adminModals}
        {attachmentLightbox}
        {import.meta.env.DEV && (
          <TutorialDevManager
            open={showDevManager}
            onClose={handleToggleDevManager}
            onPreview={showTutorial}
            onAdd={(entry) => { addDevOverlayEntry(entry); setDevOverlayVersion(v => v + 1); }}
          />
        )}
      </>
    );
  }

  // MOBILE
  const mobileVisible = isOpen && !isMinimized;

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-[56] transition-opacity duration-300 ${
          mobileVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      <div
        ref={mobileContainerRef}
        className={`fixed z-[57] w-full max-w-md top-0 bottom-0 right-0 bg-surface-light dark:bg-surface-dark flex flex-col overflow-hidden shadow-2xl transition-transform duration-300 ease-in-out ${
          mobileVisible ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-2.5 bg-surface-light/95 dark:bg-surface-dark/95 backdrop-blur-md z-10 border-b border-border-light/40 dark:border-border-dark/40 shrink-0">
          {/* A LA IZQUIERDA: Botón X para cerrar y Nueva Conversación */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={onClose}
              className="size-8 flex items-center justify-center rounded-full text-text-secondary hover:text-text-main hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Cerrar chat"
              aria-label="Cerrar chat"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
            
            {view === 'chat' && !showHistory && (
              <button
                onClick={clearChat}
                className="size-8 flex items-center justify-center rounded-full text-text-secondary hover:text-text-main hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Nueva conversación"
                aria-label="Nueva conversación"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
              </button>
            )}

            {tutorialMenuButton}
            {devManagerButton}
          </div>

          {/* EN EL CENTRO: Opciones agrupadas en una píldora estilo Perplexity */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-800/80 border border-gray-200/30 dark:border-gray-700/30 p-0.5 rounded-full gap-0.5 shadow-inner">
            {/* Pestaña: Asistente IA */}
            <button
              onClick={() => { setView('chat'); setShowHistory(false); }}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 ${
                view === 'chat' && !showHistory
                  ? 'bg-white dark:bg-gray-700 text-text-main dark:text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-main dark:hover:text-white hover:bg-white/50 dark:hover:bg-gray-700/50'
              }`}
              aria-label="Asistente IA"
            >
              <span className="material-symbols-outlined text-[13px]">smart_toy</span>
              <span>Chat</span>
            </button>

            {/* Pestaña: Soporte (sesión activa o pendiente) */}
            {supportViewActive && (
              <button
                onClick={() => setView('support')}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 ${
                  view === 'support'
                    ? 'bg-white dark:bg-gray-700 text-text-main dark:text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-main dark:hover:text-white hover:bg-white/50 dark:hover:bg-gray-700/50'
                }`}
                aria-label="Soporte humano"
              >
                <span className="material-symbols-outlined text-[13px]">support_agent</span>
                <span>Soporte</span>
                {view !== 'support' && (
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                )}
              </button>
            )}


            {/* Opción: Historial */}
            {closedSessionsList.length > 0 && view === 'chat' && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 ${
                  showHistory
                    ? 'bg-white dark:bg-gray-700 text-text-main dark:text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-main dark:hover:text-white hover:bg-white/50 dark:hover:bg-gray-700/50'
                }`}
                title="Ver historial de chats"
                aria-label="Ver historial de chats"
              >
                <span className="material-symbols-outlined text-[13px]">history</span>
                <span>Historial</span>
              </button>
            )}

            {/* Opción: Base de Conocimiento (Admin) */}
            {isAdmin && (
              <button
                onClick={() => setView(v => v === 'chat' ? 'docs' : 'chat')}
                className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1 ${
                  view === 'docs'
                    ? 'bg-white dark:bg-gray-700 text-text-main dark:text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-main dark:hover:text-white hover:bg-white/50 dark:hover:bg-gray-700/50'
                }`}
                title="Base de conocimiento"
                aria-label="Base de conocimiento"
              >
                <span className="material-symbols-outlined text-[13px]">folder_open</span>
                <span>Base</span>
              </button>
            )}
          </div>

        </div>
        <div className="flex flex-col flex-1 min-h-0 bg-background-light dark:bg-background-dark">{activeContent}</div>
      </div>

      {adminModals}
      {attachmentLightbox}
      {import.meta.env.DEV && (
        <TutorialDevManager
          open={showDevManager}
          onClose={handleToggleDevManager}
          onPreview={showTutorial}
          onAdd={(entry) => { addDevOverlayEntry(entry); setDevOverlayVersion(v => v + 1); }}
        />
      )}
    </>
  );
};
