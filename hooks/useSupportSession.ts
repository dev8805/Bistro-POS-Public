import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { invokeEdgeFunction } from '../utils/invokeEdgeFunction';

export interface SupportMessage {
  id: string;
  session_id: string;
  role: 'client' | 'developer' | 'system';
  content: string;
  attachment_url: string | null;
  attachment_type: 'image' | 'video' | 'document' | 'audio' | null;
  created_at: string;
  /** true mientras el mensaje es local y aún no se confirmó en la BD (evita que
   *  el reload de escalate lo borre). No tiene efecto visual. */
  _optimistic?: boolean;
  /** 'failed' cuando el envío no se pudo entregar (muestra "No se pudo enviar"). */
  _status?: 'failed';
}

export interface SupportSession {
  id: string;
  status: 'active' | 'queued' | 'closed';
  telegram_thread_id: number | null;
  closed_at?: string | null;
  created_at?: string;
  out_of_hours_message?: string | null;
  dev_available?: boolean;
}

export interface ClosedSessionBundle {
  session: SupportSession;
  messages: SupportMessage[];
}

interface EscalateInput {
  original_question: string;
  bot_answer?: string;
  best_score?: number;
  user_screen?: string;
  extra_detail?: string;
  attachments?: File[];
}

async function uploadAttachmentAsClientMessage(sessionId: string, file: File): Promise<void> {
  const messageId = crypto.randomUUID();
  const ext = file.name.split('.').pop() ?? 'bin';
  const path = `${sessionId}/${messageId}.${ext}`;
  const { error: upErr } = await supabase.storage.from('support-attachments').upload(path, file, { upsert: false });
  if (upErr) throw new Error(upErr.message);
  const { data: signed } = await supabase.storage.from('support-attachments').createSignedUrl(path, 60 * 60 * 24);
  let attachment_type: SupportMessage['attachment_type'] = 'document';
  if (file.type.startsWith('image/')) attachment_type = 'image';
  else if (file.type.startsWith('video/')) attachment_type = 'video';
  else if (file.type.startsWith('audio/')) attachment_type = 'audio';
  const { error: insErr } = await supabase.from('support_messages').insert({
    id: messageId,
    session_id: sessionId,
    role: 'client',
    content: '',
    attachment_url: signed?.signedUrl ?? null,
    attachment_type,
  });
  if (insErr) throw new Error(insErr.message);
  supabase.functions.invoke('support-send-to-telegram', { body: { message_id: messageId } }).catch(err => {
    console.error('No se pudo reenviar adjunto a Telegram:', err);
  });
}

interface UseSupportSessionOptions {
  onDevMessage?: (msg: SupportMessage) => void;
}

export const useSupportSession = (options?: UseSupportSessionOptions) => {
  const { user } = useAuth();
  const [session, setSession] = useState<SupportSession | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [previousClosedSessions, setPreviousClosedSessions] = useState<ClosedSessionBundle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Ref para que el callback siempre vea la última versión sin reabrir el canal
  const onDevMessageRef = useRef(options?.onDevMessage);
  useEffect(() => { onDevMessageRef.current = options?.onDevMessage; }, [options?.onDevMessage]);

  const loadActiveSession = useCallback(async () => {
    if (!user) return;
    // Cargamos las últimas 10 sesiones del usuario (cualquier estado). El cron
    // de support-cleanup-expired borra las cerradas >24h, así que aquí sólo
    // veremos las que todavía están vigentes.
    const { data: sessions } = await supabase
      .from('support_sessions')
      .select('id, status, telegram_thread_id, closed_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!sessions || sessions.length === 0) {
      setSession(null);
      setMessages([]);
      setPreviousClosedSessions([]);
      return;
    }

    const ids = sessions.map(s => s.id);
    const { data: allMsgs } = await supabase
      .from('support_messages')
      .select('*')
      .in('session_id', ids)
      .order('created_at', { ascending: true });

    const grouped: Record<string, SupportMessage[]> = {};
    (allMsgs ?? []).forEach(m => {
      const msg = m as SupportMessage;
      if (!grouped[msg.session_id]) grouped[msg.session_id] = [];
      grouped[msg.session_id].push(msg);
    });

    const [current, ...rest] = sessions;
    setSession(current as SupportSession);
    setMessages(grouped[current.id] ?? []);
    setPreviousClosedSessions(
      rest
        .filter(s => s.status === 'closed')
        .map(s => ({ session: s as SupportSession, messages: grouped[s.id] ?? [] }))
    );
  }, [user]);

  useEffect(() => { loadActiveSession(); }, [loadActiveSession]);

  useEffect(() => {
    if (!session?.id) {
      channelRef.current?.unsubscribe();
      channelRef.current = null;
      return;
    }
    const ch = supabase
      .channel(`support-${session.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `session_id=eq.${session.id}` }, (payload) => {
        const newMsg = payload.new as SupportMessage;
        setMessages(prev => {
          const existingIdx = prev.findIndex(m => m.id === newMsg.id);
          if (existingIdx !== -1) {
            // Reemplaza el mensaje optimista con el real de la BD (trae la URL firmada definitiva)
            const updated = [...prev];
            updated[existingIdx] = newMsg;
            return updated;
          }
          if (newMsg.role === 'developer') onDevMessageRef.current?.(newMsg);
          return [...prev, newMsg];
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_sessions', filter: `id=eq.${session.id}` }, (payload) => {
        const updated = payload.new as SupportSession;
        setSession(prev => prev ? { ...prev, ...updated } : updated);
      })
      .subscribe();
    channelRef.current = ch;
    return () => { ch.unsubscribe(); };
  }, [session?.id]);

  const escalate = useCallback(async (input: EscalateInput) => {
    setLoading(true);
    setError(null);
    try {
      const { attachments, ...escalatePayload } = input;
      // Solo reusamos session_id si la sesión sigue activa o en cola.
      // Si está cerrada, queremos abrir una nueva conversación.
      const reusableSessionId = session && session.status !== 'closed' ? session.id : undefined;
      const isOpeningNewSessionOverClosed = !reusableSessionId && session && session.status === 'closed';

      // IMPORTANTE: esta limpieza va ANTES del await de red. Si se hiciera
      // después, el usuario vería los mensajes de la sesión cerrada mezclados
      // con el mensaje optimista nuevo durante todo el tiempo de la llamada
      // (1-2s), porque el array de `messages` no se tocaba hasta la respuesta.
      if (isOpeningNewSessionOverClosed) {
        // Movemos la sesión cerrada al stack de historial previo.
        setPreviousClosedSessions(prev => [{ session: session!, messages: messages.filter(m => !m._optimistic) }, ...prev]);
        // Limpiamos el array ya mismo, conservando solo el mensaje optimista
        // de ESTA escalación (session_id '__pending__') si ya se agregó.
        setMessages(prev => prev.filter(m => m._optimistic && m.session_id === '__pending__'));
      }

      const { data, error } = await invokeEdgeFunction('support-escalate', {
        session_id: reusableSessionId, ...escalatePayload
      });
      if (error) throw new Error(error);
      const newSession: SupportSession = {
        id: data.session_id,
        status: data.status,
        telegram_thread_id: null,
        out_of_hours_message: data.out_of_hours_message,
        dev_available: data.dev_available,
      };
      setSession(newSession);

      if (attachments && attachments.length > 0) {
        for (const original of attachments) {
          try {
            await uploadAttachmentAsClientMessage(data.session_id, original);
          } catch (uploadErr) {
            console.error(`Falló subir adjunto ${original.name}:`, uploadErr);
          }
        }
      }

      const { data: msgs } = await supabase
        .from('support_messages')
        .select('*')
        .eq('session_id', data.session_id)
        .order('created_at', { ascending: true });
      // Preservamos SOLO los mensajes optimistas locales (_optimistic) que creó
      // el widget para ESTA escalación (session_id = '__pending__'). Los mensajes
      // de sesiones previas ya fueron movidos a previousClosedSessions.
      setMessages(prev => {
        const dbMsgs = (msgs ?? []) as SupportMessage[];
        const pendingOptimistic = prev.filter(m =>
          m._optimistic && m.session_id === '__pending__' && !dbMsgs.some(d => d.id === m.id)
        );
        return [...dbMsgs, ...pendingOptimistic];
      });
      return newSession;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [session, messages]);

  // `reuseId`: si se pasa, en vez de crear un nuevo bubble optimista, confirma
  // el bubble ya mostrado por el widget (mismo id). Evita el mensaje duplicado
  // en la escalación (uno "Enviando..." + uno confirmado).
  const sendClientMessage = useCallback(async (content: string, file?: File, sessionId?: string, reuseId?: string) => {
    const sid = sessionId ?? session?.id;
    if (!sid) throw new Error('No hay sesión activa');
    setError(null);

    const messageId = reuseId ?? crypto.randomUUID();

    let attachment_type: SupportMessage['attachment_type'] = null;
    if (file) {
      if (file.type.startsWith('image/')) attachment_type = 'image';
      else if (file.type.startsWith('video/')) attachment_type = 'video';
      else if (file.type.startsWith('audio/')) attachment_type = 'audio';
      else attachment_type = 'document';
    }

    // Blob URL temporal para previsualizar el adjunto de forma inmediata
    const blobUrl = file ? URL.createObjectURL(file) : null;

    if (reuseId) {
      // Reutilizamos el bubble optimista existente (ya se ve "enviado"): solo
      // aseguramos el session_id y adjunto. Sin estado visual "Enviando".
      setMessages(prev => prev.map(m => m.id === reuseId
        ? { ...m, content, attachment_type, attachment_url: blobUrl ?? m.attachment_url, session_id: sid, _optimistic: true }
        : m));
    } else {
      // Actualización optimista: el mensaje aparece en la UI antes de que la BD confirme
      setMessages(prev => [...prev, {
        id: messageId,
        session_id: sid,
        role: 'client',
        content,
        attachment_url: blobUrl,
        attachment_type,
        created_at: new Date().toISOString(),
      }]);
    }

    let attachment_url: string | null = null;

    try {
      if (file) {
        const ext = file.name.split('.').pop() ?? 'bin';
        const path = `${sid}/${messageId}.${ext}`;
        const { error: upErr } = await supabase.storage.from('support-attachments').upload(path, file, { upsert: false });
        if (upErr) throw new Error(upErr.message);
        const { data: signed } = await supabase.storage.from('support-attachments').createSignedUrl(path, 60 * 60 * 24);
        attachment_url = signed?.signedUrl ?? null;
        // Swap: reemplaza la blob URL temporal con la URL firmada permanente
        setMessages(prev => prev.map(m => m.id === messageId ? { ...m, attachment_url } : m));
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      }

      const { error: insErr } = await supabase.from('support_messages').insert({
        id: messageId,
        session_id: sid,
        role: 'client',
        content,
        attachment_url,
        attachment_type,
      });
      if (insErr) throw new Error(insErr.message);

      // Éxito: si reutilizamos un bubble optimista, lo marcamos como confirmado
      // (quita _optimistic y cualquier estado de error previo).
      if (reuseId) {
        setMessages(prev => prev.map(m => m.id === reuseId ? { ...m, _optimistic: undefined, _status: undefined } : m));
      }

      // Reenviar a Telegram (no bloqueante)
      supabase.functions.invoke('support-send-to-telegram', { body: { message_id: messageId } }).catch(err => {
        console.error('No se pudo reenviar a Telegram:', err);
      });
    } catch (e) {
      if (reuseId) {
        // Mantenemos el bubble y lo marcamos como fallido para permitir reintento.
        setMessages(prev => prev.map(m => m.id === reuseId ? { ...m, _status: 'failed' } : m));
      } else {
        // Rollback: quita el mensaje optimista si falló la operación
        setMessages(prev => prev.filter(m => m.id !== messageId));
      }
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      throw e;
    }
  }, [session]);

  const closeSession = useCallback(async () => {
    if (!session) return;
    const closedAt = new Date().toISOString();
    await supabase.from('support_sessions').update({ status: 'closed', closed_at: closedAt }).eq('id', session.id);
    // Mantenemos el state local — el historial queda visible hasta que el
    // cron support-cleanup-expired lo purgue a las 24h.
    setSession(prev => prev ? { ...prev, status: 'closed', closed_at: closedAt } : prev);

    // Notificar a Telegram para que cierre el topic (no bloqueante).
    supabase.functions.invoke('support-send-to-telegram', {
      body: { action: 'close', session_id: session.id }
    }).catch(err => console.error('No se pudo cerrar topic en Telegram:', err));
  }, [session]);

  // --- Helpers para mensajes optimistas (usados por el widget en escalación) ---

  /** Agrega un mensaje optimista al array local (antes de confirmar en BD) */
  const addOptimisticMessage = useCallback((msg: SupportMessage) => {
    setMessages(prev => [...prev, msg]);
  }, []);

  /** Marca un mensaje local como fallido por su ID */
  const markMessageFailed = useCallback((messageId: string) => {
    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, _status: 'failed' } : m));
  }, []);

  /** Elimina un mensaje local por su ID (para reintentos) */
  const removeMessage = useCallback((messageId: string) => {
    setMessages(prev => prev.filter(m => m.id !== messageId));
  }, []);

  return {
    session,
    messages,
    previousClosedSessions,
    loading,
    error,
    escalate,
    sendClientMessage,
    closeSession,
    reload: loadActiveSession,
    addOptimisticMessage,
    markMessageFailed,
    removeMessage,
  };
};
