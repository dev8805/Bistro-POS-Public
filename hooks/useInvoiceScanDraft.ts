/**
 * Hook propietario del Escaneo_Unificado: dueño del Borrador_Escaneo, de la
 * máquina de estados del flujo y del ciclo de vida del borrador.
 *
 * Spec `escaneo-factura-unificado`, tareas 4.1 y 4.2. Este archivo se completa
 * por partes: la resolución de proveedor y de líneas llega en la tarea 4.3 y la
 * Finalizacion_Registro en la 4.4. Los métodos de esas tareas ya están
 * declarados y tipados como stubs explícitos que nombran la tarea que los
 * implementa.
 *
 * ## Reglas que este archivo sostiene
 *
 * - **El borrador vive solo en memoria** (Req 12.1, 12.6): `useState` y nada
 *   más. Ni IndexedDB, ni `localStorage`, ni `sessionStorage`. Cerrar la
 *   pestaña pierde el borrador, y eso es deliberado: no hay recuperación de un
 *   borrador interrumpido en una sesión posterior.
 * - **Una sola `idempotencyKey` por flujo.** Se genera al abrir (inicializador
 *   perezoso de `useState`) y no cambia entre renders, así el reintento de la
 *   Finalizacion_Registro reusa la misma clave y el motor puede reconocer el
 *   duplicado (Req 12.9). El descarte del borrador sí genera una clave nueva:
 *   es un flujo distinto.
 * - **Retroceso declarado por paso** (`PREVIOUS_STEP` + `previousStepOf`): cada
 *   paso dice cuál es su paso previo, y `canGoBack` es exactamente "existe paso
 *   previo". No hay pila de historial: el retroceso es determinista y no
 *   depende del camino que trajo al Usuario hasta el paso (Req 1.5, 6.8).
 * - **Salida con decisiones tomadas** (Req 12.5): `requestClose()` cierra
 *   directo cuando el borrador está limpio y pide confirmación cuando no.
 *
 * ## Cómo se conecta la confirmación de descarte con el `ConfirmDialog`
 *
 * El proyecto tiene un único `ConfirmDialog` global (montado en `App.tsx`) que
 * se gobierna con `confirmAction()` de `ConfirmDialogContext`, una función que
 * devuelve `Promise<boolean>`. Para no acoplar el hook a ese contexto (que
 * obligaría a envolver cada prueba en el provider), la pantalla **inyecta** esa
 * función en `options.confirmDiscard`:
 *
 * ```ts
 * const { confirmAction } = useConfirmDialog();
 * const scan = useInvoiceScanDraft({ onClose, confirmDiscard: confirmAction });
 * ```
 *
 * Si no se inyecta nada, el hook expone la solicitud en `discardPrompt` y la UI
 * decide cómo renderizarla, con `acceptDiscard()` y `dismissDiscard()` como
 * respuesta. Ese es también el camino que usan las pruebas.
 *
 * ## Criterio del `progress`
 *
 * `progress` cuenta **todas** las Linea_Factura del borrador, no solo las
 * pendientes: el Req 6.4 pide la forma "línea actual de total de líneas", y un
 * total calculado sobre las pendientes se encogería a cada decisión, de modo
 * que el Usuario vería "1 de 3", "1 de 2", "1 de 1" mientras avanza. Solo se
 * expone en el paso `lineResolver`, que es donde el Resolutor_Producto lo
 * muestra.
 *
 * ## Captura y escaneo (tarea 4.2)
 *
 * - **El hook no hace fetch del catálogo.** El Negocio_Activo entra por
 *   `options.products` y `options.suppliers`, que la pantalla toma de
 *   `useProducts` y `useSuppliers` (Req 17.1, 17.2): así el aislamiento por
 *   negocio lo garantiza quien ya filtra por `business_id`, y el hook queda
 *   probable sin red. Se leen por `ref`, de modo que un cambio de catálogo no
 *   recrea los callbacks ni reinicia un escaneo en curso.
 * - **Una sola imagen por documento** (Req 2.5): `confirmCrop` comprime a 1600
 *   píxeles, guarda esos bytes como Evidencia en el borrador y envía a la IA el
 *   base64 leído **de ese mismo blob**.
 * - **45 segundos de ventana** (Req 2.7): el corte lo aplican a la vez el
 *   `timeoutMs` de `invokeEdgeFunction` y un `AbortController` propio. El
 *   `AbortController` cumple además la función de descartar respuestas
 *   obsoletas: si el Usuario reintenta, descarta el borrador o cierra la
 *   pantalla, la respuesta que llegue tarde no aterriza sobre el estado nuevo.
 * - **Ningún fallo pierde la imagen** (Req 2.7, 2.8): error, timeout, JSON
 *   malformado y `items: []` llevan al paso `scanError` con la Evidencia
 *   intacta; `retryScan()` reusa esa imagen y `continueManual()` la conserva
 *   adjunta mientras vacía lo demás.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConfirmOptions } from '../context/ConfirmDialogContext';
import {
    isRealCalendarDate,
    matchCategory,
    norm,
    resolveAmountField,
    resolveExpenseDate,
    truncateDescription,
    type ScanExpenseResult,
} from '../components/expense/scanExpense.logic';
import { base64ToBlob, blobToBase64, compressImage } from '../lib/imageUtils';
import { isRealOffline } from '../lib/connectivity';
import { buildExpensePayload, type ExpensePayload } from '../lib/invoiceScan/buildExpensePayload';
import { buildPurchasePayload } from '../lib/invoiceScan/buildPurchasePayload';
import { assignSupplierBrandColor } from '../utils/supplierBrandColor';
import { matchProductLine } from '../lib/invoiceScan/productMatch';
import { normalizeScanResponse } from '../lib/invoiceScan/scanResponse';
import { calculateLineCostV2 } from '../lib/invoiceScan/lineCostCalculator';
import { matchSupplierHeader, toSupplierDraft } from '../lib/invoiceScan/supplierMatch';
import {
    applyUnitConversion,
    detectUnitCase,
    normalizeUnit,
    type ProductWithPurchaseUnits,
} from '../lib/invoiceScan/unitMatch';
import type {
    FinalizeFailureCode,
    FinalizeResult,
    LineDecision,
    PaymentDraft,
    RegisterErrorCode,
    RegisterPurchasePayload,
    RegisterResult,
    ReviewPatch,
    ScanDestination,
    ScanDraft,
    ScanExpenseDraft,
    ScanHeader,
    ScanImage,
    ScanLine,
    ScanLineDecision,
    ScanProgress,
    ScanStep,
    SupplierDecision,
    UseInvoiceScanDraft,
} from '../lib/invoiceScan/types';
import { offlineQueue } from '../lib/offlineQueue';
import { pushOfflineCashMovement } from '../lib/offlineCashCache';
import { supabase } from '../lib/supabase';
import { todayDateStringInTz } from '../lib/timezone';
import { invokeEdgeFunction } from '../utils/invokeEdgeFunction';
import type { Product } from './useProducts';
import type { Supplier } from './useSuppliers';

// ---------------------------------------------------------------------------
// Opciones y API del hook
// ---------------------------------------------------------------------------

/**
 * Puente con el `ConfirmDialog` del proyecto. La firma es idéntica a
 * `confirmAction` de `ConfirmDialogContext`, así que la pantalla la pasa tal
 * cual, sin adaptadores.
 */
export type ConfirmDiscardFn = (options: ConfirmOptions) => Promise<boolean>;

/**
 * Sube la Evidencia y devuelve su URL pública, o `null` si la subida falla.
 *
 * La firma coincide con `uploadFileDirect` de `useImageUpload`, así que la
 * pantalla (tarea 5.8) inyecta directamente:
 *
 * ```ts
 * const evidence = useImageUpload(null, 'debt-evidence'); // ruta business_id/archivo
 * const scan = useInvoiceScanDraft({ uploadEvidence: evidence.uploadFileDirect, ... });
 * ```
 *
 * Se inyecta en lugar de llamar `useImageUpload` dentro del hook porque ese hook
 * depende de `AuthContext` y `ToastContext`, y `useInvoiceScanDraft` se mantiene
 * probable sin providers (como en las tareas 4.1-4.3). Sin inyección, la
 * Finalizacion_Registro online no puede adjuntar la foto y la trata como una
 * subida fallida.
 */
export type UploadEvidenceFn = (file: File) => Promise<string | null>;

/**
 * Invoca el motor RPC (`register_purchase` / `register_expense`) UNA vez y
 * devuelve su respuesta ya parseada. Debe lanzar ante un fallo de transporte o
 * de base de datos (sin respuesta `{ok:...}`): la Finalizacion_Registro traduce
 * ese throw a `network_error`. El default llama a `supabase.rpc(fn, { p_payload })`.
 */
export type RegisterRpcFn = (
    fnName: 'register_purchase' | 'register_expense',
    payload: unknown,
) => Promise<RegisterResult>;

/** Encola la intención offline. El default es `offlineQueue.add`. */
export type EnqueueOfflineFn = (
    type: 'inventory_purchase' | 'expense',
    payload: unknown,
    businessId: string,
    userId: string,
) => Promise<unknown>;

/** Refleja el egreso en la caja offline. El default es `pushOfflineCashMovement`. */
export type RecordOfflineCashFn = typeof pushOfflineCashMovement;

/** Detección de red real. El default es `isRealOffline`. */
export type CheckOfflineFn = () => Promise<boolean>;

/** Motor RPC por defecto: una sola llamada a `supabase.rpc` con el payload envuelto. */
const defaultCallRegister: RegisterRpcFn = async (fnName, payload) => {
    const { data, error } = await supabase.rpc(fnName, { p_payload: payload });
    // Un fallo de transporte/DB no trae la forma `{ok:...}`: se propaga para que
    // la Finalizacion_Registro lo trate como error de red (conserva el borrador).
    if (error) throw error;
    return data as RegisterResult;
};

export interface UseInvoiceScanDraftOptions {
    /** Se llama al cerrar el flujo, para regresar a la pantalla de origen (Req 1.5, 16.5). */
    onClose?: () => void;
    /** Confirmación de descarte. Si se omite, se expone en `discardPrompt`. */
    confirmDiscard?: ConfirmDiscardFn;
    /**
     * Catálogo del Negocio_Activo, tal como lo entrega `useProducts`. Lo usa la
     * pre-resolución de líneas con `matchProductLine` (Req 6.1, 6.2, 17.2). El
     * hook nunca lo consulta por su cuenta: sin catálogo, ninguna línea se
     * pre-resuelve y todas quedan pendientes de la decisión del Usuario.
     */
    products?: Product[];
    /**
     * Proveedores del Negocio_Activo, tal como los entrega `useSuppliers`. Se
     * usan para resolver el Encabezado_Documento (Req 5.1-5.4, 17.1) y son la
     * lista que viaja a la Funcion_Escaneo_Gasto (Req 11.1, 17.6).
     */
    suppliers?: Supplier[];
    /**
     * Categorías de gasto del Negocio_Activo, tal como las entrega `useExpenses`.
     * Se usan solo para sugerir la categoría al escanear un gasto: `matchCategory`
     * empareja la sugerencia de la IA contra estas y prellena el selector (Req
     * 11.3, 17.5). Si se omite, ninguna línea se sugiere y el Usuario elige a mano.
     */
    categories?: string[];

    // --- Finalizacion_Registro (tarea 4.4) ---

    /**
     * Negocio_Activo. Viaja en `business_id` del payload para que el motor
     * detecte una sesión cruzada (Req 17.10) y acompaña el encolado offline. El
     * negocio real de cada fila lo deriva el motor de la sesión (Req 17.8). Sin
     * este dato la Finalizacion_Registro no puede armar un payload válido.
     */
    businessId?: string;
    /** Usuario de la sesión, necesario para `offlineQueue.add`. */
    userId?: string;
    /**
     * Turno activo, para el movimiento de caja del camino offline. Si se omite,
     * se usa el `shift_id` del pago y, en su defecto, el turno cacheado.
     */
    activeShiftId?: string | null;
    /** Sube la Evidencia al bucket `debt-evidence` y devuelve la URL (Req 12.3). */
    uploadEvidence?: UploadEvidenceFn;
    /**
     * Marca la Evidencia ya subida como persistida en el registro. Es
     * `evidence.markAsSaved` de `useImageUpload`. Sin esto, la foto se sube y se
     * referencia en el registro, pero la limpieza de huérfanos de `useImageUpload`
     * la borra del bucket al desmontar la pantalla y el movimiento queda con una
     * URL rota. Se llama tras el éxito de la RPC, antes de cerrar la pantalla.
     */
    markEvidenceSaved?: () => void;
    /** Motor RPC. Se inyecta en pruebas; el default llama a `supabase.rpc`. */
    callRegister?: RegisterRpcFn;
    /** Detección de red real. El default es `isRealOffline` (Req 13.4). */
    checkOffline?: CheckOfflineFn;
    /** Encolado offline. El default es `offlineQueue.add` (Req 13.3). */
    enqueueOffline?: EnqueueOfflineFn;
    /** Movimiento de caja offline. El default es `pushOfflineCashMovement`. */
    recordOfflineCashMovement?: RecordOfflineCashFn;
    /** Versión del motor de escaneo IA. Por defecto 'v2'. */
    engineVersion?: 'v1' | 'v2';
    /** Destino predefinido ('inventory' o 'expense') para iniciar directamente en la captura. */
    initialDestination?: ScanDestination;
}

/** Opciones de una invocación de `finalize`. */
export interface FinalizeOptions {
    /**
     * Omite la subida de la Evidencia y registra con `evidence_url = null`. Es lo
     * que hace la acción "Guardar sin la foto" tras un fallo de subida (ver la
     * tabla de Error Handling del diseño).
     */
    skipEvidence?: boolean;
}

/**
 * API del hook: la interfaz del diseño (`UseInvoiceScanDraft`) más lo que la
 * superficie de UI necesita para el retroceso, la confirmación de descarte y
 * los campos de la Ruta_Gasto.
 */
export interface InvoiceScanDraftApi extends UseInvoiceScanDraft {
    /** Retrocede al paso previo declarado; en `lineResolver` va a la línea anterior. */
    goBack: () => void;
    /** Actualización simple de los campos del gasto, hermana de `setPayment`. */
    setExpenseFields: (patch: Partial<ScanExpenseDraft>) => void;
    /**
     * Motivo por el que se rechazó el archivo elegido (tamaño o tipo, Req 2.3) o
     * por el que falló la compresión. El paso de captura lo muestra sin dejar de
     * ofrecer cámara y galería.
     */
    captureError: string | null;
    /** Mensaje del fallo del escaneo que muestra el paso `scanError` (Req 2.7). */
    scanErrorMessage: string | null;
    /**
     * Fallo de la Finalizacion_Registro que muestra el paso `submitError`
     * (Req 12.8): el `code` (mapeado del motor o de la subida/red) y su mensaje
     * al Usuario. `null` mientras no haya fallado la finalización.
     */
    submitError: { code: FinalizeFailureCode; message: string } | null;
    /** Atajo del mensaje de `submitError`, o `null`. Lo muestra el paso `submitError`. */
    submitErrorMessage: string | null;
    /**
     * `true` solo cuando el fallo fue al subir la Evidencia: habilita en la UI la
     * acción "Guardar sin la foto" además de "Reintentar" (tabla de Error Handling).
     */
    canRetryWithoutEvidence: boolean;
    /**
     * Reintenta la Finalizacion_Registro tras un `submitError` (Req 12.9). Reusa
     * la MISMA `idempotencyKey` porque el borrador se conservó intacto, así el
     * motor reconoce el duplicado. La pantalla la cablea al botón "Reintentar"
     * del paso `submitError`.
     */
    retrySubmit: () => Promise<FinalizeResult>;
    /**
     * Reintenta el registro descartando la foto (`evidence_url = null`). La
     * pantalla la cablea al botón "Guardar sin la foto" del fallo de subida de
     * Evidencia. La imagen ya subida que quedó huérfana no se borra (Req 12.10).
     */
    submitWithoutEvidence: () => Promise<FinalizeResult>;
    /** Solicitud de confirmación de descarte pendiente, o `null` si no hay. */
    discardPrompt: ConfirmOptions | null;
    /** Confirma el descarte pendiente: limpia el borrador y cierra el flujo. */
    acceptDiscard: () => void;
    /** Cancela el descarte pendiente y deja el borrador intacto. */
    dismissDiscard: () => void;
    /** Descarta el borrador y vuelve al Selector_Destino, sin pedir confirmación. */
    reset: () => void;
    /**
     * Producto del Negocio_Activo que YA usa el Nombre_OCR de la línea actual
     * como Apodo, o `null` si el apodo no existe en el catálogo. Lo consume el
     * Resolutor_Producto para mostrar los avisos de los tres casos de apodo:
     * apodo nuevo, apodo del mismo producto (Req 8.5) y apodo de otro producto
     * del negocio (Req 8.6). Solo tiene valor en el paso `lineResolver`.
     */
    nicknameOwner: ScanNicknameOwnerInfo | null;
    /** Versión del motor de escaneo seleccionada ('v1' o 'v2'). */
    engineVersion: 'v1' | 'v2';
    setEngineVersion: React.Dispatch<React.SetStateAction<'v1' | 'v2'>>;
}

// ---------------------------------------------------------------------------
// Máquina de estados: paso previo de cada estado
// ---------------------------------------------------------------------------

/**
 * Paso previo declarado de cada estado del diagrama. `null` significa "este
 * paso no tiene retroceso":
 *
 * - `destination`: es el primer paso; la salida es cerrar el flujo (Req 1.5).
 * - `processing` y `submitting`: hay una operación en vuelo.
 * - `scanError` y `submitError`: traen sus propias acciones ("Reintentar",
 *   "Continuar manual"), que son la forma de salir del error.
 * - `supplier`: volver obligaría a repetir la captura y una segunda llamada a
 *   la IA por el mismo documento; el diagrama de estados no declara esa
 *   transición.
 * - `emptyPurchase`: ofrece "volver a escanear" o "cerrar" (Req 6.10).
 * - `done`: el registro ya se aplicó.
 *
 * `payment` depende del destino y se resuelve en `previousStepOf`.
 */
const PREVIOUS_STEP: Record<ScanStep, ScanStep | null> = {
    destination: null,
    capture: 'destination',
    crop: 'capture',
    processing: null,
    scanError: null,
    manualEntry: 'scanError',
    supplier: null,
    lineResolver: 'supplier',
    emptyPurchase: null,
    review: 'lineResolver',
    expenseFields: 'supplier',
    payment: null,
    submitting: null,
    submitError: null,
    done: null,
};

/**
 * Paso previo de `step`. El caso `payment` depende del destino. En `review`,
 * si todas las líneas fueron emparejadas automáticamente (sin intervención manual
 * en el resolutor), el retroceso regresa directamente a `supplier`.
 */
export const previousStepOf = (
    step: ScanStep,
    destination: ScanDestination | null,
    hasManualLines: boolean = true,
): ScanStep | null => {
    if (step === 'payment') return destination === 'expense' ? 'expenseFields' : 'review';
    if (step === 'review' && destination === 'inventory' && !hasManualLines) return 'supplier';
    return PREVIOUS_STEP[step];
};

// ---------------------------------------------------------------------------
// Construcción del borrador
// ---------------------------------------------------------------------------

/**
 * Clave de idempotencia del registro. `crypto.randomUUID` es la fuente normal;
 * el respaldo cubre los contextos no seguros (donde `randomUUID` no existe) y
 * conserva la forma UUID v4, que es lo que exige la columna `key uuid` de
 * `register_idempotency`.
 */
export const createIdempotencyKey = (): string => {
    const webCrypto = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
    if (webCrypto && typeof webCrypto.randomUUID === 'function') return webCrypto.randomUUID();

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
        const random = Math.floor(Math.random() * 16);
        const value = char === 'x' ? random : (random & 0x3) | 0x8;
        return value.toString(16);
    });
};

/** Encabezado_Documento vacío: la forma neutra antes del escaneo. */
const createEmptyHeader = (): ScanHeader => ({
    supplierName: null,
    nit: null,
    phone: null,
    invoiceNumber: null,
    date: null,
    supplierId: null,
});

/** Pago neutro: Contado, sin métodos y sin respuesta a la pregunta de caja. */
const createPaymentDraft = (shiftId: string | null = null): PaymentDraft => ({
    isCredit: false,
    dueDate: null,
    paidAmount: 0,
    deductFromCash: null,
    shiftId,
    methods: [],
    creditInitialMethodId: null,
});

/** Campos del gasto vacíos, con la fecha de hoy en la zona horaria del negocio. */
const createExpenseDraft = (): ScanExpenseDraft => ({
    amount: '',
    description: '',
    category: null,
    date: todayDateStringInTz(),
});

/** Borrador_Escaneo recién abierto, con su `idempotencyKey` ya fijada. */
const createDraft = (idempotencyKey: string, shiftId: string | null = null): ScanDraft => ({
    destination: null,
    image: null,
    evidenceUrl: null,
    idempotencyKey,

    header: createEmptyHeader(),
    globalDiscount: 0,

    supplier: null,

    lines: [],
    currentLineIndex: 0,

    expense: null,

    payment: createPaymentDraft(shiftId),
});

// ---------------------------------------------------------------------------
// Estado sucio y confirmación de descarte
// ---------------------------------------------------------------------------

/**
 * ¿El borrador tiene decisiones del Usuario que se perderían al cerrar?
 *
 * Cuenta como decisión: la imagen capturada, el proveedor confirmado, una línea
 * con decisión tomada y los campos del gasto escritos. **No** cuenta elegir el
 * destino (no cuesta nada repetirlo) ni la fecha del gasto (nace con la de hoy,
 * el Usuario no la escribió).
 *
 * Se exporta como función pura para poder verificar las cuatro fuentes sin
 * conducir el flujo completo.
 */
export const isDraftDirty = (draft: ScanDraft): boolean => {
    if (draft.image) return true;
    if (draft.supplier) return true;
    if (draft.lines.some(line => line.decision.kind !== 'pending')) return true;

    const expense = draft.expense;
    if (!expense) return false;
    return expense.amount.trim() !== '' || expense.description.trim() !== '' || expense.category !== null;
};

/** Texto de la confirmación de descarte (Req 12.5). */
const DISCARD_PROMPT: ConfirmOptions = {
    title: '¿Descartar el escaneo?',
    message: 'Se perderán las decisiones que ya tomaste en esta factura: la foto, el proveedor y los productos que resolviste.',
    confirmText: 'Descartar',
    cancelText: 'Seguir aquí',
    variant: 'danger',
};

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

/** Libera la URL de previsualización de la imagen para no filtrar memoria. */
const releasePreviewUrl = (previewUrl: string): void => {
    if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(previewUrl);
    }
};

/**
 * URL de previsualización del blob, o cadena vacía donde `createObjectURL` no
 * existe (jsdom en las pruebas). Una cadena vacía es falsy, así que ni el
 * cropper ni la limpieza intentan usarla.
 */
const createPreviewUrl = (blob: Blob): string => {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return '';
    return URL.createObjectURL(blob);
};

// ---------------------------------------------------------------------------
// Captura de la imagen: límites, validación y compresión
// ---------------------------------------------------------------------------

/** Límite de tamaño del archivo de entrada (Req 2.3). 50 MB exactos se aceptan. */
export const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

/** Lado mayor de la imagen que se envía a la edge function (Req 2.4). */
export const SCAN_MAX_DIMENSION = 1600;

/** Ventana máxima de espera de la edge function (Req 2.7). */
export const SCAN_TIMEOUT_MS = 45_000;

/** Edge function de cada ruta. */
const INVOICE_SCAN_FUNCTION = 'scan-invoice-unified';
const EXPENSE_SCAN_FUNCTION = 'scan-expense';

const NOT_AN_IMAGE_MESSAGE = 'Ese archivo no es una imagen. Toma una foto del documento o elige una imagen de tu galería.';
const COMPRESSION_FAILED_MESSAGE = 'No pudimos procesar la imagen. Toma otra foto.';
const SCAN_TIMEOUT_MESSAGE = 'El escaneo tardó más de 45 segundos. Reintenta o continúa manual.';
const INVOICE_FAILED_MESSAGE = 'No pudimos leer la factura. Reintenta con una foto más clara o continúa manual.';
const EMPTY_INVOICE_MESSAGE = 'No reconocimos ninguna línea de la factura. Reintenta con una foto más clara o continúa manual.';
const EXPENSE_FAILED_MESSAGE = 'No pudimos leer el comprobante. Reintenta con una foto más clara o continúa manual.';

/**
 * Mensajes al Usuario de cada código de fallo de la Finalizacion_Registro,
 * tomados de la tabla de Error Handling del diseño. Los nueve primeros son los
 * `code` que devuelve el motor; los dos últimos son fallos que no vienen del
 * motor (subida de Evidencia y red). Para `insufficient_cash_balance` el motor
 * ya incluye el disponible en su propio `message`, así que ese se prefiere.
 */
const FINALIZE_ERROR_MESSAGES: Record<FinalizeFailureCode, string> = {
    no_business: 'Tu sesión no tiene un negocio asignado.',
    business_mismatch: 'No autorizado para esta operación.',
    forbidden: 'No tienes permiso para registrar compras y gastos.',
    invalid_payload: 'Los datos del registro están incompletos.',
    supplier_not_found: 'El proveedor ya no existe.',
    product_not_found: 'Un producto de la factura ya no existe en tu catálogo.',
    shift_invalid: 'El turno de caja ya no está abierto.',
    insufficient_cash_balance: 'Saldo insuficiente en efectivo.',
    overpayment: 'La suma de los pagos supera el total.',
    evidence_upload_failed: 'No pudimos guardar la foto de la factura. Reintenta o guarda sin la foto.',
    network_error: 'No pudimos conectar para guardar el registro. Reintenta.',
};

/**
 * Extensiones de imagen que se aceptan cuando el MIME llega vacío. La galería
 * de Android entrega HEIC/HEIF sin `type`, y `compressImage` sí sabe tratarlos.
 */
const IMAGE_EXTENSION_PATTERN = /\.(jpe?g|png|webp|heic|heif|gif|bmp|avif)$/i;

const isImageFile = (file: File): boolean => {
    if (typeof file.type === 'string' && file.type.startsWith('image/')) return true;
    return IMAGE_EXTENSION_PATTERN.test(file.name || '');
};

/** Tamaño en megabytes con un decimal, para nombrar el archivo rechazado. */
const formatMegabytes = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1);

/**
 * Valida el archivo elegido en el paso de captura (Req 2.3). Devuelve el motivo
 * del rechazo, o `null` cuando el archivo sirve. 50 MB exactos se aceptan; el
 * rechazo empieza en un byte más.
 */
export const validateImageFile = (file: File | null | undefined): string | null => {
    if (!file) return NOT_AN_IMAGE_MESSAGE;
    if (!isImageFile(file)) return NOT_AN_IMAGE_MESSAGE;
    if (file.size > MAX_IMAGE_BYTES) {
        return `La imagen pesa ${formatMegabytes(file.size)} MB y el límite es 50 MB. Toma la foto de nuevo o elige una más liviana.`;
    }
    return null;
};

/**
 * `compressImage` trabaja sobre `File` porque mira `file.name` para detectar
 * HEIC, y el recorte de esquinas entrega un `Blob`. Esta envoltura le pone
 * nombre conservando el tipo real.
 */
const toCropFile = (blob: Blob): File => {
    if (blob instanceof File) return blob;
    const type = blob.type || 'image/jpeg';
    const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], `factura-${Date.now()}.${extension}`, { type });
};

/** Texto recortado del encabezado, o `null` cuando llega vacío. */
const headerText = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
};

// ---------------------------------------------------------------------------
// Resolución de proveedor, líneas y equivalencias (tarea 4.3)
// ---------------------------------------------------------------------------

/**
 * Producto del Negocio_Activo que YA usa un Nombre_OCR como Apodo. Se expone en
 * la API del hook para que el Resolutor_Producto muestre los avisos de los tres
 * casos de apodo (Req 8.5, 8.6). Es estructuralmente compatible con el
 * `ScanNicknameOwner` que consume `ScanProductPickerSheet`.
 */
export interface ScanNicknameOwnerInfo {
    productId: string;
    productName: string;
}

/**
 * Forma neutra del producto cuando el id vinculado no aparece en el catálogo del
 * Negocio_Activo. Con unidad vacía y sin unidades de compra, `detectUnitCase`
 * clasifica como `none` (línea sin unidad) o `unknown` (unidad presente), nunca
 * como `sale` ni `known`: sin producto no se puede afirmar una equivalencia.
 */
const FALLBACK_PRODUCT: ProductWithPurchaseUnits = { unit: '', product_purchase_units: [] };

/**
 * Costo_Neto_Linea efectivo: el neto que devolvió la IA menos la parte
 * proporcional del Descuento_Global de esa línea (Req 3.5). Es el valor que la
 * conversión de unidad conserva como total de la línea.
 */
const effectiveNetTotal = (line: ScanLine): number =>
    Math.max(0, line.netTotal - line.globalDiscountShare);

/** Limpia la conversión de una línea (los campos derivados vuelven a su neutro). */
const clearLineConversion = (line: ScanLine): ScanLine => ({
    ...line,
    unitCase: null,
    conversionFactor: null,
    createPurchaseUnit: false,
    quantity: null,
    lineTotal: null,
});

/**
 * Deja una línea marcada como omitida (Req 6.7, 6.12): una línea omitida no
 * aporta cantidad, costo ni unidad de compra al registro.
 */
const skipLine = (line: ScanLine): ScanLine => ({
    ...clearLineConversion(line),
    decision: { kind: 'skipped' },
});

/**
 * Reabre la decisión de una línea (vuelve a `pending`) para que el Usuario la
 * cambie desde el Resolutor_Producto (Req 6.8).
 */
const reopenLine = (line: ScanLine): ScanLine => ({
    ...clearLineConversion(line),
    decision: { kind: 'pending' },
});

/**
 * Calcula el caso de unidad de una línea ya vinculada o creada contra su
 * producto y aplica la conversión cuando no hace falta preguntar nada:
 *
 * - `none`/`sale`/`known` → conversión aplicada, línea lista (Req 9.1, 9.2, 9.18).
 * - `unknown` → queda a la espera del Factor_Conversion (Req 9.3, 9.4); la
 *   conversión y `createPurchaseUnit` se resuelven en `setLineEquivalence`.
 */
const detectAndConvertLine = (line: ScanLine, product: ProductWithPurchaseUnits): ScanLine => {
    const { unitCase, conversionFactor } = detectUnitCase(
        line.ocrUnit,
        product,
        line.ocrName,
        line.aiConversionFactor,
        line.unitNeedsClarification,
    );

    if (unitCase === 'unknown') {
        return { ...clearLineConversion(line), unitCase };
    }

    const factor = conversionFactor ?? 1;
    const conversion = applyUnitConversion(line.ocrQuantity, effectiveNetTotal(line), factor);
    const isNewPurchaseUnit =
        factor > 1 &&
        line.ocrUnit.trim() !== '' &&
        normalizeUnit(line.ocrUnit) !== normalizeUnit(product.unit) &&
        !(product.product_purchase_units ?? []).some(
            pu => normalizeUnit(pu.unit_name) === normalizeUnit(line.ocrUnit),
        );

    return {
        ...line,
        unitCase,
        conversionFactor: factor,
        createPurchaseUnit: isNewPurchaseUnit,
        quantity: conversion.quantity,
        lineTotal: conversion.lineTotal,
    };
};

/**
 * ¿La línea sigue necesitando intervención en el Resolutor_Producto?
 *
 * Requieren intervención una línea pendiente y una línea vinculada/creada cuya
 * Unidad_OCR es desconocida y aún no tiene un Factor_Conversion válido. Una
 * línea omitida, o vinculada/creada con la unidad ya resuelta, está lista.
 */
const lineNeedsResolution = (line: ScanLine): boolean => {
    switch (line.decision.kind) {
        case 'pending':
            return true;
        case 'skipped':
            return false;
        default: // 'linked' | 'created'
            if (line.unitCase === null) return true;
            if (line.unitCase !== 'unknown') return false;
            return !(typeof line.conversionFactor === 'number' && line.conversionFactor > 0);
    }
};

/**
 * Índice de la siguiente línea que requiere resolución, en orden circular a
 * partir de `start`. Devuelve `-1` cuando no queda ninguna pendiente. La
 * búsqueda circular cubre el caso de una línea reabierta con `goToPreviousLine`.
 */
const findNextUnresolvedLine = (lines: ScanLine[], start: number): number => {
    const total = lines.length;
    for (let offset = 0; offset < total; offset++) {
        const index = (start + offset) % total;
        if (lineNeedsResolution(lines[index])) return index;
    }
    return -1;
};

/** ¿Todas las Linea_Factura quedaron omitidas? (Req 6.10) */
const allLinesSkipped = (lines: ScanLine[]): boolean =>
    lines.length > 0 && lines.every(line => line.decision.kind === 'skipped');

/**
 * ¿La línea requiere resolución manual en el Resolutor_Producto?
 * Las líneas auto-reconocidas con unidad definida nunca deben pasar por el resolutor.
 */
export const isLineManual = (line: ScanLine): boolean =>
    !line.isAutoMatched || line.unitCase === 'unknown';

/**
 * Busca hacia atrás la última línea que requiera resolución manual.
 */
const findPreviousManualLineIndex = (lines: ScanLine[], fromIndex: number): number => {
    for (let i = fromIndex; i >= 0; i--) {
        if (isLineManual(lines[i])) return i;
    }
    return -1;
};

/**
 * Producto del Negocio_Activo cuyo arreglo `nicknames` ya contiene el Nombre_OCR
 * (comparación normalizada con `norm`), o `null` si ningún producto lo usa. Es
 * la base de los tres casos de apodo (Req 8.3, 8.5, 8.6): sin dueño la propuesta
 * es nueva; con dueño la línea se vincula sin agregar el apodo.
 */
const findNicknameOwner = (ocrName: string, products: Product[]): ScanNicknameOwnerInfo | null => {
    const target = norm(ocrName);
    if (!target) return null;
    const owner = products.find(product =>
        (product.nicknames ?? []).some(nickname => norm(nickname) === target),
    );
    return owner ? { productId: owner.id, productName: owner.name } : null;
};

/**
 * ¿La decisión de proveedor sirve para confirmar? Un proveedor existente exige
 * id; uno nuevo exige al menos el nombre. Sin proveedor válido el paso no avanza
 * y la Finalizacion_Registro queda bloqueada (Req 5.8).
 */
const isSupplierDecisionValid = (decision: SupplierDecision | null | undefined): boolean => {
    if (!decision) return false;
    if (decision.kind === 'existing') return decision.id.trim() !== '';
    return decision.name.trim() !== '';
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Listas vacías estables: evitan una identidad nueva por render. */
const NO_PRODUCTS: Product[] = [];
const NO_SUPPLIERS: Supplier[] = [];
const NO_CATEGORIES: string[] = [];

export const useInvoiceScanDraft = (options: UseInvoiceScanDraftOptions = {}): InvoiceScanDraftApi => {
    const {
        onClose,
        confirmDiscard,
        products = NO_PRODUCTS,
        suppliers = NO_SUPPLIERS,
        categories = NO_CATEGORIES,
        businessId = '',
        userId = '',
        activeShiftId = null,
        uploadEvidence,
        markEvidenceSaved,
        callRegister = defaultCallRegister,
        checkOffline = isRealOffline,
        enqueueOffline = offlineQueue.add.bind(offlineQueue),
        recordOfflineCashMovement = pushOfflineCashMovement,
    } = options;

    const [step, setStep] = useState<ScanStep>(() => (options.initialDestination ? 'capture' : 'destination'));
    // Inicializador perezoso: la `idempotencyKey` se genera una sola vez al
    // abrir el flujo, no en cada render.
    const [draft, setDraft] = useState<ScanDraft>(() => {
        const d = createDraft(createIdempotencyKey(), activeShiftId);
        if (options.initialDestination) {
            d.destination = options.initialDestination;
        }
        return d;
    });
    const [discardPrompt, setDiscardPrompt] = useState<ConfirmOptions | null>(null);
    const [captureError, setCaptureError] = useState<string | null>(null);
    const [scanErrorMessage, setScanErrorMessage] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<{ code: FinalizeFailureCode; message: string } | null>(null);
    const [engineVersion, setEngineVersion] = useState<'v1' | 'v2'>(options.engineVersion ?? 'v1');

    // Si el turno activo cambia o se detecta tarde, mantenerlo sincronizado en el pago del borrador.
    useEffect(() => {
        if (!activeShiftId) return;
        setDraft(prev => {
            if (prev.payment.shiftId === activeShiftId) return prev;
            return {
                ...prev,
                payment: {
                    ...prev.payment,
                    shiftId: activeShiftId,
                },
            };
        });
    }, [activeShiftId]);

    // Espejos en ref: los flujos asíncronos (compresión, escaneo y finalización)
    // leen el estado y las dependencias vigentes sin volverse dependencias de sus
    // propios callbacks.
    const draftRef = useRef<ScanDraft>(draft);
    draftRef.current = draft;
    const productsRef = useRef<Product[]>(products);
    productsRef.current = products;
    const suppliersRef = useRef<Supplier[]>(suppliers);
    suppliersRef.current = suppliers;
    const categoriesRef = useRef<string[]>(categories);
    categoriesRef.current = categories;

    // La Finalizacion_Registro es asíncrona y sus dependencias (negocio, usuario,
    // turno y colaboradores inyectados) pueden cambiar entre renders. Leerlas por
    // ref mantiene `finalize` con identidad estable y siempre con el valor vigente.
    const finalizeDepsRef = useRef({
        businessId, userId, activeShiftId, onClose,
        uploadEvidence, markEvidenceSaved, callRegister, checkOffline, enqueueOffline, recordOfflineCashMovement,
    });
    finalizeDepsRef.current = {
        businessId, userId, activeShiftId, onClose,
        uploadEvidence, markEvidenceSaved, callRegister, checkOffline, enqueueOffline, recordOfflineCashMovement,
    };

    // Escaneo en vuelo. Abortarlo cumple dos papeles: cortar a los 45 segundos
    // (Req 2.7) y descartar una respuesta que llegue cuando el borrador ya
    // cambió (reintento, descarte o cierre de la pantalla).
    const scanAbortRef = useRef<AbortController | null>(null);

    // Ciclo de vida de la URL de previsualización: la limpieza corre cuando la
    // imagen se reemplaza, cuando el borrador se descarta y al desmontar.
    const previewUrl = draft.image?.previewUrl;
    useEffect(() => {
        if (!previewUrl) return;
        return () => releasePreviewUrl(previewUrl);
    }, [previewUrl]);

    // Al desmontar, ninguna respuesta pendiente debe intentar tocar el estado.
    useEffect(() => () => scanAbortRef.current?.abort(), []);

    const isDirty = useMemo(() => isDraftDirty(draft), [draft]);

    const progress = useMemo<ScanProgress | null>(() => {
        if (step !== 'lineResolver') return null;
        const manualIndices: number[] = [];
        draft.lines.forEach((line, i) => {
            if (isLineManual(line)) manualIndices.push(i);
        });
        const total = manualIndices.length;
        if (total === 0) return null;
        const currentPos = manualIndices.indexOf(draft.currentLineIndex);
        const current = currentPos >= 0 ? currentPos + 1 : 1;
        return { current, total };
    }, [step, draft.lines, draft.currentLineIndex]);

    const hasManualLines = useMemo(() => {
        if (draft.destination !== 'inventory') return false;
        return draft.lines.some(isLineManual);
    }, [draft.destination, draft.lines]);

    const previousStep = useMemo(() => {
        if (options.initialDestination && step === 'capture') return null;
        return previousStepOf(step, draft.destination, hasManualLines);
    }, [step, draft.destination, hasManualLines, options.initialDestination]);

    // Dueño del Apodo de la línea actual, para los avisos de los tres casos de
    // apodo del Resolutor_Producto (Req 8.5, 8.6). Solo se calcula en el paso de
    // resolución de líneas; en cualquier otro paso no hay línea "actual".
    const nicknameOwner = useMemo<ScanNicknameOwnerInfo | null>(() => {
        if (step !== 'lineResolver') return null;
        const line = draft.lines[draft.currentLineIndex];
        if (!line) return null;
        return findNicknameOwner(line.ocrName, products);
    }, [step, draft.lines, draft.currentLineIndex, products]);

    // ----- ciclo de vida del borrador -----

    /** Descarta el borrador completo y vuelve al Selector_Destino (o a la captura si hay initialDestination) con clave nueva. */
    const reset = useCallback(() => {
        // Un escaneo en vuelo no debe aterrizar sobre el borrador nuevo.
        scanAbortRef.current?.abort();
        const d = createDraft(createIdempotencyKey(), finalizeDepsRef.current.activeShiftId);
        if (options.initialDestination) {
            d.destination = options.initialDestination;
        }
        setDraft(d);
        setStep(options.initialDestination ? 'capture' : 'destination');
        setDiscardPrompt(null);
        setCaptureError(null);
        setScanErrorMessage(null);
        setSubmitError(null);
    }, [options.initialDestination]);

    const discardAndClose = useCallback(() => {
        reset();
        onClose?.();
    }, [reset, onClose]);

    const requestClose = useCallback(() => {
        if (!isDirty) {
            discardAndClose();
            return;
        }

        if (!confirmDiscard) {
            setDiscardPrompt(DISCARD_PROMPT);
            return;
        }

        void confirmDiscard(DISCARD_PROMPT).then(confirmed => {
            if (confirmed) discardAndClose();
        });
    }, [isDirty, confirmDiscard, discardAndClose]);

    const acceptDiscard = useCallback(() => {
        discardAndClose();
    }, [discardAndClose]);

    const dismissDiscard = useCallback(() => {
        setDiscardPrompt(null);
    }, []);

    // ----- Selector_Destino -----

    /**
     * Fija la ruta del registro y pasa a la captura (Req 1.3, 1.4). Cambiar de
     * destino limpia lo que dependía del anterior (encabezado, proveedor,
     * líneas, gasto y pago) y conserva la imagen: es el mismo documento.
     */
    const chooseDestination = useCallback((destination: ScanDestination) => {
        setCaptureError(null);
        setDraft(prev => (prev.destination === destination ? prev : {
            ...prev,
            destination,
            header: createEmptyHeader(),
            globalDiscount: 0,
            supplier: null,
            lines: [],
            currentLineIndex: 0,
            expense: null,
            payment: createPaymentDraft(finalizeDepsRef.current.activeShiftId),
        }));
        setStep('capture');
    }, []);

    // ----- actualizaciones simples del borrador -----

    const setPayment = useCallback((payment: PaymentDraft) => {
        const resolvedPayment: PaymentDraft = {
            ...payment,
            shiftId: payment.shiftId ?? finalizeDepsRef.current.activeShiftId ?? null,
        };
        setDraft(prev => ({ ...prev, payment: resolvedPayment }));
    }, []);

    const setExpenseFields = useCallback((patch: Partial<ScanExpenseDraft>) => {
        setDraft(prev => ({
            ...prev,
            expense: { ...(prev.expense || createExpenseDraft()), ...patch },
        }));
    }, []);

    // ----- captura, recorte y escaneo (tarea 4.2) -----

    /**
     * Lleva el flujo al paso de error conservando la imagen del borrador
     * (Req 2.7). Es el único camino de salida de un escaneo que no sirvió, sea
     * por error de la función, por timeout, por JSON malformado o por venir sin
     * líneas.
     */
    const failScan = useCallback((message: string): void => {
        setScanErrorMessage(message);
        setStep('scanError');
    }, []);

    /**
     * Aplica las líneas resueltas y decide el paso siguiente del flujo:
     *
     * - Todas omitidas          → `emptyPurchase` (Req 6.10).
     * - Sin líneas pendientes    → `review` (Panel_Revision, Req 6.9).
     * - Queda alguna pendiente   → `lineResolver` en esa línea.
     */
    const settleLineResolver = useCallback((base: ScanDraft, lines: ScanLine[], searchStart: number): void => {
        if (allLinesSkipped(lines)) {
            setDraft({ ...base, lines });
            setStep('emptyPurchase');
            return;
        }
        const next = findNextUnresolvedLine(lines, searchStart);
        if (next === -1) {
            setDraft({ ...base, lines });
            setStep('review');
            return;
        }
        setDraft({ ...base, lines, currentLineIndex: next });
        setStep('lineResolver');
    }, []);

    /**
     * Aplica un resultado válido de la Ruta_Inventario: normaliza la respuesta,
     * resuelve el proveedor del encabezado y pre-resuelve las líneas que ya
     * coinciden con el catálogo del Negocio_Activo.
     *
     * Si el proveedor ya existe en el negocio, se omiten pasos intermedios y se
     * avanza directamente (a revisión si no hay pendientes, o al resolutor si alguna
     * línea requiere intervención).
     */
    const applyInvoiceScan = useCallback((raw: unknown): void => {
        const scan = normalizeScanResponse(raw);

        // JSON malformado, degradación de la función o documento sin líneas:
        // los tres son el mismo escaneo fallido para el Usuario (Req 2.7, 2.8).
        if (scan.error) {
            console.warn('[useInvoiceScanDraft] la función devolvió un error de escaneo:', scan.error);
            failScan(INVOICE_FAILED_MESSAGE);
            return;
        }
        if (scan.lines.length === 0) {
            failScan(EMPTY_INVOICE_MESSAGE);
            return;
        }

        const catalog = productsRef.current;
        const lines: ScanLine[] = scan.lines.map(line => {
            // 0. Si la IA reconoció el producto directamente con alta certeza
            if (line.aiProductId) {
                const aiMatchedProduct = catalog.find(p => p.id === line.aiProductId && p.type === 'simple');
                if (aiMatchedProduct) {
                    const decision: ScanLineDecision = {
                        kind: 'linked',
                        productId: aiMatchedProduct.id,
                        addNickname: false,
                    };
                    return { ...line, decision, isAutoMatched: true };
                }
            }

            // 1. Cascada de coincidencia local (código de barras, apodos, nombres, tokens)
            const match = matchProductLine(line.ocrName, catalog, line.barcode);
            if (!match) return line;
            const decision: ScanLineDecision = {
                kind: 'linked',
                productId: match.product.id,
                addNickname: false,
            };
            return { ...line, decision, isAutoMatched: true };
        });

        const matchedSupplier = toSupplierDraft(matchSupplierHeader(scan.header, suppliersRef.current));

        // Cuando el proveedor ya fue reconocido, no es necesario mostrar el aviso de continuar con él.
        // Convertimos las unidades de las líneas vinculadas y avanzamos directamente.
        if (matchedSupplier?.kind === 'existing') {
            const convertedLines = lines.map(line => {
                const decision = line.decision;
                if (decision.kind !== 'linked' || line.unitCase !== null) return line;
                const productId = decision.productId;
                const product = catalog.find(p => p.id === productId) ?? FALLBACK_PRODUCT;
                return detectAndConvertLine(line, product);
            });

            setScanErrorMessage(null);
            settleLineResolver(
                {
                    ...draftRef.current,
                    header: scan.header,
                    globalDiscount: scan.globalDiscount,
                    supplier: matchedSupplier,
                },
                convertedLines,
                0,
            );
            return;
        }

        // La primera línea que ve el Resolutor_Producto es la primera pendiente:
        // las pre-resueltas no vuelven a preguntar nada.
        const firstPending = lines.findIndex(line => line.decision.kind === 'pending');

        setDraft(prev => ({
            ...prev,
            header: scan.header,
            globalDiscount: scan.globalDiscount,
            supplier: matchedSupplier,
            lines,
            currentLineIndex: firstPending >= 0 ? firstPending : 0,
        }));
        setScanErrorMessage(null);
        setStep('supplier');
    }, [failScan, settleLineResolver]);

    /**
     * Aplica un resultado válido de la Ruta_Gasto con las reglas vigentes del
     * escaneo de gasto (Req 11.2): `resolveAmountField` para el valor,
     * `truncateDescription` para la descripción, `resolveExpenseDate` para la
     * fecha y `matchSupplierHeader`, que no es otra cosa que la envoltura de
     * `matchSupplier` de `scanExpense.logic`, así que la coincidencia de
     * proveedor mantiene exactamente las reglas de hoy (Req 11.7).
     *
     * La categoría se PRE-SELECCIONA con la sugerencia de la IA: `matchCategory`
     * empareja el texto que devuelve `scan-expense` contra las categorías reales
     * del negocio y, si coincide, prellena el selector. Si la IA no sugirió nada
     * o la sugerencia no existe en el negocio, queda `null` y el Usuario elige a
     * mano (Req 11.3). El proveedor se confirma antes que los campos, según la
     * máquina de estados, así que el paso siguiente es `supplier`.
     */
    const applyExpenseScan = useCallback((raw: unknown): void => {
        const result = (raw ?? {}) as Partial<ScanExpenseResult>;

        const rawDate = headerText(result.date);
        const header: ScanHeader = {
            supplierName: headerText(result.supplierName),
            nit: headerText(result.nit),
            phone: null,
            invoiceNumber: null,
            date: rawDate && isRealCalendarDate(rawDate) ? rawDate : null,
            supplierId: null,
        };

        setDraft(prev => ({
            ...prev,
            header,
            supplier: toSupplierDraft(matchSupplierHeader(header, suppliersRef.current)),
            expense: {
                ...(prev.expense || createExpenseDraft()),
                amount: resolveAmountField(result.amount),
                description: truncateDescription(result.description),
                category: matchCategory(result.category, categoriesRef.current),
                date: resolveExpenseDate(rawDate ?? undefined, todayDateStringInTz()),
            },
        }));
        setScanErrorMessage(null);
        setStep('supplier');
    }, []);

    /**
     * Envía la Evidencia a la edge function de la ruta activa y aplica el
     * resultado. El cuerpo de `scan-invoice-unified` lleva **solo** la imagen
     * (Req 17.6); el de `scan-expense` lleva además la lista de proveedores del
     * Negocio_Activo, igual que hoy (Req 11.1).
     */
    const runScan = useCallback(async (image: ScanImage): Promise<void> => {
        const destination = draftRef.current.destination;
        if (!destination) return;

        scanAbortRef.current?.abort();
        const controller = new AbortController();
        scanAbortRef.current = controller;

        let timedOut = false;
        const timeoutId = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, SCAN_TIMEOUT_MS);

        const failedMessage = destination === 'inventory' ? INVOICE_FAILED_MESSAGE : EXPENSE_FAILED_MESSAGE;

        try {
            // Req 2.5: los bytes que viajan a la IA se leen del mismo blob que
            // quedó guardado como Evidencia.
            const imageBase64 = await blobToBase64(image.blob);
            const mimeType = image.blob.type || 'image/jpeg';

            const suppliersPayload = suppliersRef.current.map(s => ({
                id: s.id,
                name: s.name,
                nit: s.nit || '',
                phone: s.phone || '',
            }));

            const catalogPayload = productsRef.current
                .filter(p => p.type === 'simple')
                .map(p => ({
                    id: p.id,
                    name: p.name,
                    nicknames: p.nicknames || [],
                    barcode: p.barcode || '',
                    unit: p.unit || '',
                    purchaseUnits: (p.product_purchase_units || [])
                        .filter(pu => pu.unit_name && Number(pu.conversion_factor) > 0)
                        .map(pu => ({
                            unit: pu.unit_name,
                            factor: Number(pu.conversion_factor),
                        })),
                }));

            let scanData: unknown = null;
            let scanError: string | null = null;

            if (destination === 'inventory') {
                if (engineVersion === 'v2') {
                    // Flujo v2 Económico: Visión pura + Embeddings + Costo neto por línea
                    const visionRes = await invokeEdgeFunction<{
                        header: any;
                        items: any[];
                    }>(
                        'scan-invoice-v2',
                        { imageBase64, mimeType },
                        { timeoutMs: SCAN_TIMEOUT_MS },
                    );

                    if (visionRes.error || !visionRes.data) {
                        scanError = visionRes.error || failedMessage;
                    } else {
                        const rawItems = Array.isArray(visionRes.data.items) ? visionRes.data.items : [];
                        // Desconectado para pruebas: el emparejamiento lo realiza el buscador local del frontend
                        const matchResults: any[] = [];

                        const adaptedItems = rawItems.map((item, idx) => {
                            const match = matchResults[idx] || {};
                            const aiFactor = typeof item.conversion_factor === 'number' && item.conversion_factor > 0
                                ? item.conversion_factor
                                : undefined;
                            const costCalc = calculateLineCostV2(item, aiFactor);
                            return {
                                description: item.description,
                                quantity: costCalc.ocrQuantity,
                                unitValue: costCalc.unitCost,
                                lineSubtotal: costCalc.subtotal,
                                lineTax: costCalc.tax,
                                lineDiscount: costCalc.discount,
                                lineNetTotal: costCalc.netTotal,
                                barcode: (item.barcode && /^\d{8,14}$/.test(String(item.barcode).trim())) ? String(item.barcode).trim() : '',
                                ocr_unit: item.ocr_unit || '',
                                conversion_factor: costCalc.conversionFactor,
                                ai_conversion_factor: costCalc.conversionFactor,
                                reasoning: item.reasoning || '',
                                ai_product_id: match.matchedProductId || null,
                                candidate_ids: Array.isArray(match.candidates) ? match.candidates.map((c: any) => c.productId) : [],
                            };
                        });

                        scanData = {
                            header: {
                                supplierName: visionRes.data.header?.supplierName || '',
                                nit: visionRes.data.header?.nit || '',
                                phone: visionRes.data.header?.phone || '',
                                invoiceNumber: visionRes.data.header?.invoiceNumber || '',
                                date: visionRes.data.header?.date || '',
                            },
                            document: {
                                globalDiscount: 0,
                                documentTotal: adaptedItems.reduce((acc, it) => acc + (it.lineNetTotal || 0), 0),
                            },
                            items: adaptedItems,
                        };
                    }
                } else {
                    const v1Res = await invokeEdgeFunction<unknown>(
                        INVOICE_SCAN_FUNCTION,
                        {
                            imageBase64,
                            mimeType,
                            suppliers: suppliersPayload,
                            catalog: catalogPayload,
                        },
                        { timeoutMs: SCAN_TIMEOUT_MS },
                    );
                    scanData = v1Res.data;
                    scanError = v1Res.error;
                }
            } else {
                const expRes = await invokeEdgeFunction<unknown>(
                    EXPENSE_SCAN_FUNCTION,
                    {
                        imageBase64,
                        mimeType,
                        suppliers: suppliersRef.current.map(s => ({ name: s.name, nit: s.nit || '' })),
                    },
                    { timeoutMs: SCAN_TIMEOUT_MS },
                );
                scanData = expRes.data;
                scanError = expRes.error;
            }

            if (controller.signal.aborted) {
                // Vencido a los 45 s: es un escaneo fallido. Abortado por otra
                // razón (reintento, descarte, cierre): la respuesta se descarta
                // en silencio para no pisar el estado nuevo.
                if (timedOut) failScan(SCAN_TIMEOUT_MESSAGE);
                return;
            }

            if (scanError || !scanData) {
                failScan(scanError || failedMessage);
                return;
            }

            if (destination === 'inventory') applyInvoiceScan(scanData);
            else applyExpenseScan(scanData);
        } catch (err) {
            console.error('[useInvoiceScanDraft] escaneo fallido:', err);
            if (controller.signal.aborted && !timedOut) return;
            failScan(timedOut ? SCAN_TIMEOUT_MESSAGE : failedMessage);
        } finally {
            clearTimeout(timeoutId);
            if (scanAbortRef.current === controller) scanAbortRef.current = null;
        }
    }, [failScan, applyInvoiceScan, applyExpenseScan, engineVersion, businessId]);

    /**
     * Recibe el archivo de la cámara o de la galería y pasa al recorte (Req 2.2).
     *
     * Un archivo rechazado por tamaño o por tipo **no** avanza de paso: el paso
     * de captura sigue mostrando las dos fuentes y el motivo queda en
     * `captureError` (Req 2.3). No lanza: el rechazo es un resultado esperado
     * del flujo, no una excepción.
     */
    /**
     * Confirma el recorte: comprime a 1600 píxeles (Req 2.4), guarda esos bytes
     * como Evidencia del registro y los envía a la edge function (Req 2.5).
     *
     * `compressImage` devuelve base64, así que la Evidencia se reconstruye con
     * `base64ToBlob` a partir de ese mismo base64: hay una sola imagen
     * comprimida, y es la que se guarda y la que se envía.
     */
    const confirmCrop = useCallback(async (blob: Blob): Promise<void> => {
        setCaptureError(null);

        let evidence: ScanImage;
        try {
            const { base64, mimeType } = await compressImage(toCropFile(blob), SCAN_MAX_DIMENSION);
            const compressed = base64ToBlob(base64, mimeType);
            evidence = { blob: compressed, previewUrl: createPreviewUrl(compressed) };
        } catch (err) {
            console.error('[useInvoiceScanDraft] compresión fallida:', err);
            setDraft(prev => ({ ...prev, image: null }));
            setCaptureError(COMPRESSION_FAILED_MESSAGE);
            setStep('capture');
            return;
        }

        setScanErrorMessage(null);
        setDraft(prev => ({ ...prev, image: evidence }));
        setStep('processing');
        await runScan(evidence);
    }, [runScan]);

    /**
     * Adjunta la imagen elegida o convertida desde PDF.
     * Si `options.skipCrop` está activo (ej. PDFs digitales), salta el paso
     * de recorte y pasa directamente a procesamiento.
     */
    const attachImage = useCallback(async (file: File, options?: { skipCrop?: boolean }): Promise<void> => {
        const rejection = validateImageFile(file);
        if (rejection) {
            setCaptureError(rejection);
            return;
        }

        setCaptureError(null);
        if (options?.skipCrop) {
            await confirmCrop(file);
            return;
        }

        setDraft(prev => ({
            ...prev,
            image: { blob: file, previewUrl: createPreviewUrl(file) },
        }));
        setStep('crop');
    }, [confirmCrop]);

    /** Reintenta el escaneo con la misma imagen ya capturada (Req 2.7). */
    const retryScan = useCallback(async (): Promise<void> => {
        const image = draftRef.current.image;
        if (!image) {
            // Sin imagen no hay nada que reintentar: se vuelve a la captura.
            setScanErrorMessage(null);
            setStep('capture');
            return;
        }

        setScanErrorMessage(null);
        setStep('processing');
        await runScan(image);
    }, [runScan]);

    /**
     * Continúa con captura manual dentro de la misma superficie: la imagen sigue
     * adjunta como Evidencia y los demás campos quedan vacíos (Req 2.8).
     */
    const continueManual = useCallback((): void => {
        scanAbortRef.current?.abort();
        setScanErrorMessage(null);
        setDraft(prev => ({
            ...prev,
            header: createEmptyHeader(),
            globalDiscount: 0,
            supplier: null,
            lines: [],
            currentLineIndex: 0,
            expense: prev.destination === 'expense' ? createExpenseDraft() : null,
            payment: createPaymentDraft(finalizeDepsRef.current.activeShiftId),
        }));
        setStep('manualEntry');
    }, []);

    // ----- proveedor, líneas y equivalencias (tarea 4.3) -----

    /**
     * Aplica las líneas resueltas y decide el paso siguiente del flujo:
     *
     * - Todas omitidas          → `emptyPurchase` (Req 6.10).
     * - Sin líneas pendientes    → `review` (Panel_Revision, Req 6.9).
     * - Queda alguna pendiente   → `lineResolver` en esa línea.
     *
     * Es el único punto que mueve `currentLineIndex` hacia adelante y que decide
     * la salida del Resolutor_Producto, para que `confirmSupplier`, `resolveLine`
     * y `setLineEquivalence` compartan exactamente el mismo criterio de avance.
     */
    // (settleLineResolver se declaró más arriba para ser usado por applyInvoiceScan)

    /**
     * Guarda el proveedor confirmado y avanza según la ruta (Req 5.6, 5.8):
     * a `expenseFields` en la Ruta_Gasto y al Resolutor_Producto en la
     * Ruta_Inventario. Sin proveedor válido no avanza.
     *
     * Al entrar al Resolutor_Producto se calcula el caso de unidad de las líneas
     * que el escaneo ya dejó vinculadas al catálogo (auto-match, con `unitCase`
     * nulo): las que resuelven a venta, unidad conocida o sin unidad quedan
     * listas; las de Unidad_OCR desconocida quedan a la espera del factor. Así
     * ninguna línea auto-vinculada se salta la conversión de unidad.
     */
    const confirmSupplier = useCallback((supplier: SupplierDecision | null): void => {
        const base = draftRef.current;

        if (base.destination === 'expense') {
            if (supplier === null) {
                setDraft({ ...base, supplier: null });
                return;
            }
            if (!isSupplierDecisionValid(supplier)) return;
            setDraft({ ...base, supplier });
            setStep('expenseFields');
            return;
        }

        if (!supplier || !isSupplierDecisionValid(supplier)) return;

        const catalog = productsRef.current;
        const lines = base.lines.map(line => {
            const decision = line.decision;
            if (decision.kind !== 'linked' || line.unitCase !== null) return line;
            const productId = decision.productId;
            const product = catalog.find(p => p.id === productId) ?? FALLBACK_PRODUCT;
            return detectAndConvertLine(line, product);
        });

        settleLineResolver({ ...base, supplier }, lines, 0);
    }, [settleLineResolver]);

    /**
     * Resuelve la línea actual del Resolutor_Producto (Req 6.2, 6.7):
     *
     * - `skip`   → la línea queda omitida y el flujo avanza.
     * - `link`   → se vincula al producto y se calcula su caso de unidad. El
     *   Nombre_OCR se propone como Apodo solo si no es apodo de ningún producto
     *   del negocio: si ya es apodo del mismo o de otro producto no se agrega
     *   (Req 8.5, 8.6).
     * - `create` → se guarda el producto nuevo (con su Unidad_Venta) y se calcula
     *   su caso de unidad frente a la Unidad_OCR.
     *
     * Cuando el caso es venta, unidad conocida o sin unidad, la conversión queda
     * aplicada y el flujo avanza; cuando es una Unidad_OCR desconocida, la línea
     * se queda a la espera del Factor_Conversion y el paso no avanza (el host
     * muestra la pregunta de equivalencia).
     */
    const resolveLine = useCallback((decision: LineDecision): void => {
        const base = draftRef.current;
        const index = base.currentLineIndex;
        const current = base.lines[index];
        if (!current) return;

        let resolved: ScanLine;
        if (decision.kind === 'skip') {
            resolved = skipLine(current);
        } else if (decision.kind === 'link') {
            const alreadyOwned = findNicknameOwner(current.ocrName, productsRef.current) !== null;
            const addNickname = decision.addNickname && !alreadyOwned;
            const product = productsRef.current.find(p => p.id === decision.productId) ?? FALLBACK_PRODUCT;
            resolved = detectAndConvertLine(
                { ...current, decision: { kind: 'linked', productId: decision.productId, addNickname } },
                product,
            );
        } else {
            const { newProduct } = decision;
            const pu = newProduct.purchaseUnit;
            const lineWithUnit = pu && !current.ocrUnit.trim() ? { ...current, ocrUnit: pu.unit_name } : current;
            const initialPurchaseUnits = pu
                ? [{ unit_name: pu.unit_name, conversion_factor: pu.conversion_factor }]
                : [];
            resolved = detectAndConvertLine(
                { ...lineWithUnit, decision: { kind: 'created', newProduct } },
                { unit: newProduct.unit, product_purchase_units: initialPurchaseUnits },
            );
            if (pu && pu.conversion_factor > 1 && !resolved.createPurchaseUnit) {
                const conversion = applyUnitConversion(current.ocrQuantity, effectiveNetTotal(current), pu.conversion_factor);
                resolved = {
                    ...resolved,
                    createPurchaseUnit: true,
                    conversionFactor: pu.conversion_factor,
                    ocrUnit: resolved.ocrUnit || pu.unit_name,
                    quantity: conversion.quantity,
                    lineTotal: conversion.lineTotal,
                };
            }
        }

        const lines = base.lines.map((line, i) => (i === index ? resolved : line));

        // Unidad desconocida sin factor: la línea espera la equivalencia. El paso
        // sigue en esta misma línea; no se avanza hasta `setLineEquivalence`.
        if (lineNeedsResolution(resolved)) {
            setDraft({ ...base, lines });
            return;
        }

        settleLineResolver(base, lines, index + 1);
    }, [settleLineResolver]);

    /**
     * Confirma el Factor_Conversion de la línea actual con Unidad_OCR desconocida
     * (Req 9.7, 9.11, 9.12): rechaza los valores menores o iguales a cero sin
     * cambiar el estado (Req 9.9), aplica la conversión conservando el total de
     * la línea, marca la línea para crear una fila nueva en `product_purchase_units`
     * y avanza a la siguiente línea pendiente.
     */
    const setLineEquivalence = useCallback((factor: number): void => {
        if (!(factor > 0)) return;

        const base = draftRef.current;
        const index = base.currentLineIndex;
        const current = base.lines[index];
        if (!current) return;
        if (current.decision.kind !== 'linked' && current.decision.kind !== 'created') return;

        const conversion = applyUnitConversion(current.ocrQuantity, effectiveNetTotal(current), factor);
        const resolved: ScanLine = {
            ...current,
            unitCase: 'unknown',
            conversionFactor: factor,
            createPurchaseUnit: true,
            quantity: conversion.quantity,
            lineTotal: conversion.lineTotal,
        };
        const lines = base.lines.map((line, i) => (i === index ? resolved : line));

        settleLineResolver(base, lines, index + 1);
    }, [settleLineResolver]);

    /**
     * Retrocede a la línea anterior y reabre su decisión para cambiarla, sin
     * salir del Resolutor_Producto (Req 6.8). En la primera línea no hace nada.
     */
    const goToPreviousLine = useCallback((): void => {
        const base = draftRef.current;
        const targetIndex = findPreviousManualLineIndex(base.lines, base.currentLineIndex - 1);
        if (targetIndex < 0) return;

        const lines = base.lines.map((line, i) => (i === targetIndex ? reopenLine(line) : line));
        setDraft({ ...base, lines, currentLineIndex: targetIndex });
        setStep('lineResolver');
    }, []);

    /**
     * Edita la cantidad, el costo (vía `lineTotal`) o el precio de venta de una
     * línea desde el Panel_Revision (Req 10.2, 10.3, 10.4). Solo toca los campos
     * presentes en el patch.
     */
    const updateReviewLine = useCallback((index: number, patch: ReviewPatch): void => {
        setDraft(prev => {
            const line = prev.lines[index];
            if (!line) return prev;
            const updated: ScanLine = { ...line };
            if (patch.quantity !== undefined) updated.quantity = patch.quantity;
            if (patch.lineTotal !== undefined) updated.lineTotal = patch.lineTotal;
            if (patch.newPrice !== undefined) updated.newPrice = patch.newPrice;
            return { ...prev, lines: prev.lines.map((l, i) => (i === index ? updated : l)) };
        });
    }, []);

    /**
     * Quita una línea del Panel_Revision (Req 10.2): equivale a omitirla. Si tras
     * quitarla no queda ninguna línea visible, informa la compra sin productos
     * (Req 6.10).
     */
    const removeReviewLine = useCallback((index: number): void => {
        const base = draftRef.current;
        if (!base.lines[index]) return;

        const lines = base.lines.map((line, i) => (i === index ? skipLine(line) : line));
        const hasVisibleLines = lines.some(line => line.decision.kind !== 'skipped');
        setDraft({ ...base, lines });
        if (!hasVisibleLines) setStep('emptyPurchase');
    }, []);

    // ----- Finalizacion_Registro (tarea 4.4) -----

    /**
     * Deja el flujo en `submitError` conservando el borrador (Req 12.8) y
     * devuelve el resultado fallido con el mensaje mapeado. El mensaje del motor
     * (por ejemplo el saldo disponible de `insufficient_cash_balance`) tiene
     * prioridad sobre el texto genérico de la tabla.
     */
    const failSubmit = useCallback(
        (code: FinalizeFailureCode, motorMessage?: string | null): FinalizeResult => {
            const message = (motorMessage && motorMessage.trim()) || FINALIZE_ERROR_MESSAGES[code];
            setSubmitError({ code, message });
            setStep('submitError');
            return { status: 'failed', code, message };
        },
        [],
    );

    /**
     * Refleja en la caja offline el egreso del registro que se acaba de encolar,
     * con el mismo criterio del Flujo_Manual_Compra: solo Contado, con descuento
     * de caja y turno activo, por la parte pagada en efectivo. El crédito no
     * mueve caja al momento de encolar (el abono se concilia al sincronizar).
     */
    const applyOfflineCashMovement = useCallback(
        (
            record: RecordOfflineCashFn,
            business: string,
            user: string,
            shiftId: string | null,
            payment: RegisterPurchasePayload['payment'],
            movementType: 'purchase' | 'expense',
            creditorName: string,
            note?: string | null,
        ): void => {
            if (payment.is_credit || !payment.deduct_from_cash) return;
            const shift = shiftId || payment.shift_id;
            if (!shift) return;

            const cashAmount = payment.methods
                .filter(m => m.mapped_id === 'cash')
                .reduce((total, m) => total + (Number.isFinite(m.amount) ? m.amount : 0), 0);
            if (cashAmount <= 0) return;

            record(business, {
                shift_id: shift,
                created_by: user,
                type: movementType,
                amount: cashAmount,
                description:
                    movementType === 'purchase'
                        ? `Compra inventario: ${creditorName}`
                        : `Gasto: ${creditorName}${note ? ' · ' + note : ''}`,
                payment_method: 'cash',
            });
        },
        [],
    );

    /**
     * Cierra un registro exitoso o encolado: descarta el borrador (queda un
     * borrador nuevo con clave nueva), deja el paso terminal en `done` y regresa
     * a la pantalla de origen (Req 10.8, 16.5). Se separa de `reset()` porque
     * este termina en `done`, no en el Selector_Destino.
     */
    const finishRegistration = useCallback((): void => {
        scanAbortRef.current?.abort();
        setDraft(createDraft(createIdempotencyKey(), finalizeDepsRef.current.activeShiftId));
        setSubmitError(null);
        setCaptureError(null);
        setScanErrorMessage(null);
        setDiscardPrompt(null);
        setStep('done');
        finalizeDepsRef.current.onClose?.();
    }, []);

    /**
     * Finalizacion_Registro (Req 10.7, 11.6, 12.3, 12.4, 12.7-12.10, 13.3, 13.4).
     *
     * Secuencia:
     *  1. Arma el payload de la ruta activa **sin tocar la red**. Un gasto
     *     incompleto o una compra sin proveedor/líneas devuelve `invalid_payload`.
     *  2. Pasa a `submitting`.
     *  3. Sin conexión (`checkOffline`): encola la intención con la foto en
     *     `null`, refleja la caja offline, descarta el borrador, regresa a origen
     *     y devuelve `{status:'queued'}`. No sube Evidencia ni llama a la RPC.
     *  4. Con conexión: sube la Evidencia primero (salvo `skipEvidence`). Si la
     *     subida falla, va a `submitError` (`evidence_upload_failed`) sin llamar a
     *     la RPC; la UI ofrece "Reintentar" y "Guardar sin la foto".
     *  5. Llama al motor UNA vez. Éxito ⇒ `done` + regreso a origen. `ok:false` o
     *     error de red ⇒ `submitError` con el borrador intacto y la MISMA
     *     `idempotencyKey` lista para reintentar.
     */
    const finalize = useCallback(async (opts: FinalizeOptions = {}): Promise<FinalizeResult> => {
        const base = draftRef.current;
        const deps = finalizeDepsRef.current;
        const destination = base.destination;

        // 1. Payload primero, sin red. Cualquier problema de armado es
        //    `invalid_payload` y no dispara ninguna escritura.
        if (!destination) return failSubmit('invalid_payload');
        if (!deps.businessId) return failSubmit('invalid_payload');

        // Asegurar que el turno activo acompañe el pago si no venía en el borrador
        const effectiveShiftId = base.payment.shiftId ?? deps.activeShiftId ?? null;
        const normalizedBase: ScanDraft = {
            ...base,
            payment: {
                ...base.payment,
                shiftId: effectiveShiftId,
            },
        };

        let purchasePayload: RegisterPurchasePayload | null = null;
        let expensePayload: ExpensePayload | null = null;

        if (destination === 'inventory') {
            try {
                purchasePayload = buildPurchasePayload(normalizedBase, {
                    source: 'scan',
                    businessId: deps.businessId,
                    evidenceUrl: null, // se rellena tras subir la Evidencia
                });
            } catch (err) {
                console.warn('[useInvoiceScanDraft] payload de compra inválido:', err);
                return failSubmit('invalid_payload');
            }
        } else {
            const built = buildExpensePayload(normalizedBase, {
                source: 'scan',
                businessId: deps.businessId,
                receiptUrl: null,
            });
            if (built.kind === 'incomplete') {
                console.warn('[useInvoiceScanDraft] payload de gasto incompleto:', built.issues);
                return failSubmit('invalid_payload');
            }
            expensePayload = built.payload;
        }

        // 2. En vuelo.
        setSubmitError(null);
        setStep('submitting');

        const isPurchase = destination === 'inventory';
        const queueType: 'inventory_purchase' | 'expense' = isPurchase ? 'inventory_purchase' : 'expense';
        const fnName: 'register_purchase' | 'register_expense' = isPurchase ? 'register_purchase' : 'register_expense';
        const payment = (isPurchase ? purchasePayload! : expensePayload!).payment;
        const creditorName =
            base.supplier?.kind === 'existing'
                ? base.supplier.name
                : base.supplier?.kind === 'new'
                    ? base.supplier.name
                    : 'Proveedor';

        // 3. Camino sin conexión (Req 13.3, 13.4): encolar la intención con la
        //    Evidencia en null y salir. No se sube la foto ni se llama a la RPC.
        let offline = false;
        try {
            offline = await deps.checkOffline();
        } catch {
            offline = false; // ante la duda, se intenta el camino online.
        }

        if (offline) {
            if (!deps.userId) return failSubmit('invalid_payload');

            const queuePayload = isPurchase
                ? { ...purchasePayload!, evidence_url: null }
                : { ...expensePayload!, receipt_url: null };

            try {
                await deps.enqueueOffline(queueType, { rpc_payload: queuePayload }, deps.businessId, deps.userId);
            } catch (err) {
                console.error('[useInvoiceScanDraft] no se pudo encolar el registro offline:', err);
                return failSubmit('network_error');
            }

            applyOfflineCashMovement(
                deps.recordOfflineCashMovement,
                deps.businessId,
                deps.userId,
                deps.activeShiftId,
                payment,
                isPurchase ? 'purchase' : 'expense',
                creditorName,
                isPurchase ? undefined : base.expense?.description,
            );

            // La foto no viaja sin conexión (Req 13.4): la pantalla avisa al ver
            // `queued`. El borrador se descarta y se regresa a la pantalla de origen.
            finishRegistration();
            return { status: 'queued' };
        }

        // 4. Con conexión: subir la Evidencia primero (Req 12.3), salvo que se
        //    pida guardar sin la foto tras un fallo de subida.
        let evidenceUrl: string | null = null;
        if (!opts.skipEvidence && base.image) {
            try {
                evidenceUrl = deps.uploadEvidence ? await deps.uploadEvidence(toCropFile(base.image.blob)) : null;
            } catch (err) {
                console.error('[useInvoiceScanDraft] subida de Evidencia fallida:', err);
                evidenceUrl = null;
            }
            if (!evidenceUrl) {
                // No se invoca la RPC (Req 12.10 no aplica: aún no hay imagen
                // huérfana). La UI ofrece "Reintentar" y "Guardar sin la foto".
                return failSubmit('evidence_upload_failed');
            }
        }

        // 5. Payload con la URL ya lista + una sola llamada al motor.
        let payload: RegisterPurchasePayload | ExpensePayload;
        if (isPurchase) {
            payload = { ...purchasePayload!, evidence_url: evidenceUrl };
        } else {
            payload = { ...expensePayload!, receipt_url: evidenceUrl };
        }

        let result: RegisterResult;
        try {
            result = await deps.callRegister(fnName, payload);
        } catch (err) {
            // Error de transporte o de base de datos: la transacción no dejó
            // rastro. Se conserva el borrador y el reintento reusa la misma clave.
            console.error('[useInvoiceScanDraft] la RPC del registro falló:', err);
            return failSubmit('network_error');
        }

        if (!result || result.ok !== true) {
            const failure = result as { code?: RegisterErrorCode; message?: string } | null;
            const code: FinalizeFailureCode = failure?.code ?? 'invalid_payload';
            return failSubmit(code, failure?.message);
        }

        // Si el proveedor registrado era nuevo, asignarle color de marca con IA en segundo plano
        if (base.supplier?.kind === 'new' && (result as any)?.supplier_id) {
            const supplierId = (result as any).supplier_id;
            const supplierName = base.supplier.name;
            const existingColors = (suppliersRef.current || []).map(s => s.color).filter(Boolean) as string[];
            void assignSupplierBrandColor(supplierId, supplierName, existingColors);
        }

        // Éxito: la imagen ya quedó referenciada en el registro, así que se marca
        // como guardada para que la limpieza de huérfanos de `useImageUpload` no la
        // borre del bucket al desmontar la pantalla. Debe ir antes de
        // `finishRegistration`, que cierra la pantalla de forma síncrona.
        deps.markEvidenceSaved?.();
        // Descartar el borrador y regresar a la pantalla de origen (Req 10.8, 16.5).
        finishRegistration();
        return { status: 'registered', result };
    }, [failSubmit, applyOfflineCashMovement, finishRegistration]);

    /** Reintenta la finalización tras un `submitError`, reusando la misma clave (Req 12.9). */
    const retrySubmit = useCallback((): Promise<FinalizeResult> => finalize(), [finalize]);

    /** Reintenta descartando la foto: "Guardar sin la foto" del fallo de subida. */
    const submitWithoutEvidence = useCallback(
        (): Promise<FinalizeResult> => finalize({ skipEvidence: true }),
        [finalize],
    );

    // ----- retroceso -----

    /**
     * Retrocede un paso. En el Resolutor_Producto el retroceso es por línea
     * (Req 6.8): con líneas ya recorridas delega en `goToPreviousLine`, que
     * reabre la decisión de la línea anterior (tarea 4.3); en la primera línea
     * vuelve al paso de proveedor.
     */
    const goBack = useCallback(() => {
        if (step === 'lineResolver') {
            const previousManual = findPreviousManualLineIndex(draft.lines, draft.currentLineIndex - 1);
            if (previousManual >= 0) {
                goToPreviousLine();
                return;
            }
            if (previousStep) {
                setStep(previousStep);
            }
            return;
        }
        if (!previousStep) return;
        if (step === 'review' && previousStep === 'lineResolver') {
            const lastManualIndex = draft.lines.reduce(
                (acc, l, i) => (isLineManual(l) ? i : acc),
                -1,
            );
            if (lastManualIndex >= 0) {
                setDraft(prev => ({ ...prev, currentLineIndex: lastManualIndex }));
            }
        }
        setStep(previousStep);
    }, [step, draft.currentLineIndex, draft.lines, previousStep, goToPreviousLine]);

    return {
        step,
        draft,
        progress,
        isDirty,
        canGoBack: previousStep !== null,

        chooseDestination,
        attachImage,
        confirmCrop,
        retryScan,
        continueManual,

        confirmSupplier,
        resolveLine,
        setLineEquivalence,
        goToPreviousLine,

        updateReviewLine,
        removeReviewLine,

        setPayment,
        setExpenseFields,
        finalize,
        retrySubmit,
        submitWithoutEvidence,
        requestClose,

        goBack,
        captureError,
        scanErrorMessage,
        submitError,
        submitErrorMessage: submitError?.message ?? null,
        canRetryWithoutEvidence: submitError?.code === 'evidence_upload_failed',
        discardPrompt,
        acceptDiscard,
        dismissDiscard,
        reset,
        nicknameOwner,
        engineVersion,
        setEngineVersion,
    };
};
