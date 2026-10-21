import { supabase } from '../lib/supabase';

/**
 * Mensajes de error amigables por tipo de fallo genérico.
 */
const GENERIC_ERRORS: Record<string, string> = {
  TIMEOUT: 'La operación tardó demasiado. Intenta de nuevo en unos segundos.',
  NETWORK: 'Sin conexión a internet. Verifica tu red e intenta de nuevo.',
  AUTH: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  SERVER: 'Hubo un problema en el servidor. Intenta más tarde.',
  NOT_FOUND: 'Servicio no disponible temporalmente.',
  UNKNOWN: 'Algo salió mal. Intenta de nuevo.',
};

/**
 * Mensajes de error amigables por edge function + contexto.
 */
const FUNCTION_ERRORS: Record<string, string> = {
  'create-employee': 'No se pudo crear el empleado. Intenta de nuevo.',
  'update-employee': 'No se pudo actualizar el empleado. Intenta de nuevo.',
  'delete-employee': 'No se pudo cambiar el estado del empleado. Intenta de nuevo.',
  'scan-invoice': 'No se pudo procesar la imagen. Intenta con una foto más clara.',
  'scan-expense': 'No se pudo leer el comprobante. Intenta con una foto más clara.',
  'ocr-scan': 'No se pudo procesar la imagen. Intenta con una foto más clara.',
  'deepgram-token': 'No se pudo activar el dictado. Verifica tu conexión e intenta de nuevo.',
  'support-escalate': 'No se pudo contactar soporte. Intenta de nuevo en unos minutos.',
  'rag-index': 'No se pudo procesar el documento. Intenta de nuevo.',
  'rag-clear': 'No se pudieron eliminar los documentos. Intenta de nuevo.',
  'rag-delete': 'No se pudo eliminar el documento. Intenta de nuevo.',
  'get-brand-colors': '', // silencioso
  'support-send-to-telegram': '', // silencioso
};

interface InvokeOptions {
  /** Timeout en ms. Default: 30000 */
  timeoutMs?: number;
  /** Mensaje amigable personalizado (sobreescribe el mapeo) */
  friendlyMessage?: string;
}

interface InvokeResult<T> {
  data: T | null;
  /** Mensaje de error amigable para mostrar al usuario. null si fue exitoso. */
  error: string | null;
}

/**
 * Clasifica un error técnico en una categoría genérica.
 */
function classifyError(err: any): string {
  const msg = (err?.message || '').toLowerCase();
  const status = err?.status || err?.statusCode || err?.context?.status;

  if (msg === 'timeout' || msg.includes('timeout') || msg.includes('aborted')) {
    return 'TIMEOUT';
  }
  if (
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('failed to send') ||
    msg.includes('net::') ||
    msg.includes('load failed')
  ) {
    return 'NETWORK';
  }
  if (status === 401 || status === 403 || msg.includes('jwt') || msg.includes('unauthorized')) {
    return 'AUTH';
  }
  if (status === 404 || msg.includes('not found')) {
    return 'NOT_FOUND';
  }
  if (status >= 500 || msg.includes('internal server') || msg.includes('server error')) {
    return 'SERVER';
  }
  return 'UNKNOWN';
}

/**
 * Determina si el error viene de procesamiento de IA (Gemini, etc.)
 */
function isAIError(err: any): boolean {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('gemini') || msg.includes('openai') || msg.includes('ai') || msg.includes('model');
}

/**
 * Wrapper centralizado para invocar Edge Functions de Supabase
 * con manejo de errores amigable para el usuario.
 */
export async function invokeEdgeFunction<T = any>(
  functionName: string,
  body: Record<string, any>,
  options?: InvokeOptions
): Promise<InvokeResult<T>> {
  const timeoutMs = options?.timeoutMs || 30000;

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
    );
    const invoke = supabase.functions.invoke(functionName, { body });
    const { data, error } = await Promise.race([invoke, timeout]);

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    return { data: data as T, error: null };
  } catch (err: any) {
    console.error(`[EdgeFunction:${functionName}]`, err?.message || err);

    // Si se proporcionó un mensaje personalizado, usarlo
    if (options?.friendlyMessage) {
      return { data: null, error: options.friendlyMessage };
    }

    // Para funciones de scan/imagen con error de IA
    const scanFunctions = ['scan-invoice', 'scan-expense', 'ocr-scan'];
    if (scanFunctions.includes(functionName) && isAIError(err)) {
      return { data: null, error: 'La IA no pudo leer la factura. Intenta con mejor iluminación.' };
    }

    // Timeout específico para funciones de scan
    if (scanFunctions.includes(functionName) && classifyError(err) === 'TIMEOUT') {
      return { data: null, error: 'El procesamiento tardó demasiado. Intenta con una imagen más pequeña.' };
    }

    // Mensaje específico por función
    const functionMsg = FUNCTION_ERRORS[functionName];
    if (functionMsg !== undefined && functionMsg !== '') {
      // Si es un error genérico clasificable (auth, red), priorizar ese
      const category = classifyError(err);
      if (category === 'AUTH' || category === 'NETWORK') {
        return { data: null, error: GENERIC_ERRORS[category] };
      }
      return { data: null, error: functionMsg };
    }

    // Fallback a error genérico
    const category = classifyError(err);
    return { data: null, error: GENERIC_ERRORS[category] };
  }
}
