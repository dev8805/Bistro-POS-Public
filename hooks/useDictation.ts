import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { invokeEdgeFunction } from '../utils/invokeEdgeFunction';

const SAMPLE_RATE = 16000;

const stamp = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
};

export const useDictation = (onResult: (final: string, interim: string) => void) => {
  const [isRecording, setIsRecording] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const accumulatedFinalRef = useRef('');
  const userClosedRef = useRef(false);
  
  const isUtteranceActiveRef = useRef(false);
  const ignoreCurrentUtteranceRef = useRef(false);

  const resetAccumulator = useCallback(() => {
    accumulatedFinalRef.current = '';
  }, []);

  const getIsUtteranceActive = useCallback(() => {
    return isUtteranceActiveRef.current;
  }, []);

  const setIgnoreCurrentUtterance = useCallback((ignore: boolean) => {
    ignoreCurrentUtteranceRef.current = ignore;
  }, []);

  const pushLog = useCallback((line: string) => {
    const formatted = `[${stamp()}] ${line}`;
    console.log('[Dictation]', formatted);
  }, []);

  const stopDictation = useCallback(() => {
    userClosedRef.current = true;
    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch { /* noop */ }
      processorRef.current = null;
    }
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch { /* noop */ }
      sourceRef.current = null;
    }
    if (audioContextRef.current) {
      try { audioContextRef.current.close(); } catch { /* noop */ }
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (socketRef.current) {
      try { socketRef.current.close(1000, 'client_stop'); } catch { /* noop */ }
      socketRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const startDictation = useCallback(async () => {
    if (isRecording) {
      stopDictation();
      return;
    }

    try {
      accumulatedFinalRef.current = '';
      isUtteranceActiveRef.current = false;
      ignoreCurrentUtteranceRef.current = false;
      userClosedRef.current = false;
      setIsRecording(true); // Optimistic UI update
      pushLog('Iniciando dictado…');

      // 1. Iniciar petición de token en paralelo
      const tokenPromise = invokeEdgeFunction<{ access_token: string }>('deepgram-token', {});

      // 2. Micrófono — sin noiseSuppression/echoCancellation (matan la voz en Android)
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: true },
        });
        streamRef.current = stream;
        pushLog('getUserMedia OK. tracks: ' + stream.getAudioTracks().length);
      } catch (mediaErr: any) {
        pushLog('getUserMedia FALLÓ: ' + mediaErr.name + ' — ' + mediaErr.message);
        setIsRecording(false);
        throw mediaErr;
      }

      // 3. Empezar a capturar audio INMEDIATAMENTE en un buffer local
      let earlyBuffer: Int16Array[] = [];
      let chunkCount = 0;

      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioCtx({ sampleRate: SAMPLE_RATE });
        audioContextRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        sourceRef.current = source;

        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e: AudioProcessingEvent) => {
          const float32 = e.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(float32.length);
          for (let i = 0; i < float32.length; i++) {
            const s = Math.max(-1, Math.min(1, float32[i]));
            int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          }
          
          chunkCount++;
          const ws = socketRef.current;
          
          if (ws && ws.readyState === WebSocket.OPEN) {
            if (earlyBuffer.length > 0) {
              pushLog(`Vaciando buffer temprano: ${earlyBuffer.length} chunks`);
              earlyBuffer.forEach(chunk => ws.send(chunk.buffer));
              earlyBuffer = [];
            }
            ws.send(int16.buffer);
          } else {
            // Guardar en buffer mientras esperamos el token y el websocket
            earlyBuffer.push(int16);
          }
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
        pushLog(`AudioContext activo y capturando. Esperando token...`);
      } catch (audioErr: any) {
        pushLog('AudioContext error: ' + audioErr.message);
        stopDictation();
        return;
      }

      // 4. Esperar el token y abrir el WebSocket
      const { data, error } = await tokenPromise;
      if (userClosedRef.current) {
        pushLog('Dictado cancelado por el usuario antes de obtener token');
        return;
      }
      
      if (error || !data?.access_token) {
        stopDictation();
        throw new Error(error || 'No se pudo activar el dictado. Verifica tu conexión e intenta de nuevo.');
      }
      pushLog('Token obtenido OK');

      const wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-2&language=es&encoding=linear16&sample_rate=${SAMPLE_RATE}&smart_format=true&interim_results=true&punctuate=true&vad_events=true`;
      pushLog('Abriendo WebSocket...');
      const ws = new WebSocket(wsUrl, ['bearer', data.access_token]);
      socketRef.current = ws;

      ws.onopen = () => {
        pushLog('WebSocket abierto. Procesador enviará audio directamente.');
      };

      let msgCount = 0;
      ws.onmessage = (event) => {
        if (userClosedRef.current) return; // Evitar mensajes fantasma después de detener
        
        msgCount++;
        let msg: any;
        try { msg = JSON.parse(event.data); } catch { pushLog('No-JSON: ' + String(event.data).substring(0, 80)); return; }

        if (msg.type === 'Results' && msg.channel?.alternatives) {
          const transcript = msg.channel.alternatives[0].transcript;
          const conf = msg.channel.alternatives[0].confidence;
          const dur = msg.duration?.toFixed(2);
          pushLog(`Results #${msgCount} dur=${dur}s final=${msg.is_final} conf=${conf} txt="${transcript}"`);

          if (ignoreCurrentUtteranceRef.current) {
            if (msg.is_final) {
              ignoreCurrentUtteranceRef.current = false;
              isUtteranceActiveRef.current = false;
            }
            return;
          }

          if (transcript) {
            if (msg.is_final) {
              const prefix = accumulatedFinalRef.current ? ' ' : '';
              accumulatedFinalRef.current += prefix + transcript;
              onResult(accumulatedFinalRef.current, '');
            } else {
              onResult(accumulatedFinalRef.current, transcript);
            }
          }
          
          isUtteranceActiveRef.current = !msg.is_final;
        } else if (msg.type === 'Metadata') {
          pushLog('Metadata (request_id=' + (msg.request_id || '?') + ')');
        } else if (msg.type === 'SpeechStarted') {
          pushLog('🎙️ SpeechStarted');
        } else if (msg.type === 'UtteranceEnd') {
          pushLog('UtteranceEnd');
        } else if (msg.type === 'Error' || msg.error) {
          pushLog('Deepgram error: ' + (msg.error || msg.description || JSON.stringify(msg)));
        } else if (msg.type) {
          pushLog('msg tipo: ' + msg.type);
        }
      };

      ws.onerror = () => { pushLog('WebSocket onerror (ver onclose)'); };

      ws.onclose = (ev) => {
        pushLog(`WebSocket cerrado: code=${ev.code} reason="${ev.reason || ''}" clean=${ev.wasClean}`);
        if (!userClosedRef.current && ev.code !== 1000) {
          pushLog('⚠️ cierre inesperado — revisar token o encoding');
        }
        setIsRecording(false);
      };

    } catch (err: any) {
      pushLog('ERROR fatal: ' + err.message);
      setIsRecording(false);
    }
  }, [isRecording, onResult, stopDictation, pushLog]);

  return {
    isRecording,
    startDictation,
    stopDictation,
    isSupported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    resetAccumulator,
    getIsUtteranceActive,
    setIgnoreCurrentUtterance,
  };
};
