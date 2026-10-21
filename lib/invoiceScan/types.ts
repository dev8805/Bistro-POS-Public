/**
 * Tipos del Escaneo_Unificado: Borrador_Escaneo, payloads de los motores RPC,
 * máquina de estados y respuesta cruda de la edge function.
 *
 * Módulo puro de tipos: no importa React, hooks ni el cliente de Supabase.
 */

// ---------------------------------------------------------------------------
// Destino, origen y máquina de estados
// ---------------------------------------------------------------------------

/** Destino que el Usuario elige en el Selector_Destino. */
export type ScanDestination = 'inventory' | 'expense';

/** Origen del payload que recibe el motor RPC. */
export type ScanSource = 'scan' | 'manual';

/** Los 15 pasos de la máquina de estados del Escaneo_Unificado. */
export type ScanStep =
    | 'destination'
    | 'capture'
    | 'crop'
    | 'processing'
    | 'scanError'
    | 'manualEntry'
    | 'supplier'
    | 'lineResolver'
    | 'emptyPurchase'
    | 'review'
    | 'expenseFields'
    | 'payment'
    | 'submitting'
    | 'submitError'
    | 'done';

/** Progreso del Resolutor_Producto: "línea i de n". */
export interface ScanProgress {
    current: number;
    total: number;
}

// ---------------------------------------------------------------------------
// Respuesta cruda de la edge function `scan-invoice-unified`
// ---------------------------------------------------------------------------

/**
 * Valor numérico tal como puede llegar de la IA: número, texto en
 * Formato_Numerico_Latino ("8.100", "0,44") o ausente.
 */
export type RawNumeric = number | string | null | undefined;

/** Encabezado_Documento tal como llega, con todos los campos opcionales. */
export interface RawScanHeader {
    supplierName?: string | null;
    nit?: string | null;
    /** Teléfono del proveedor detectado por la IA. */
    phone?: string | null;
    invoiceNumber?: string | null;
    date?: string | null;
    /** ID del proveedor detectado por la IA si coincidió con la lista del negocio. */
    supplier_id?: string | null;
}

/** Datos a nivel de documento: Descuento_Global y total informativo. */
export interface RawScanDocument {
    globalDiscount?: RawNumeric;
    documentTotal?: RawNumeric;
}

/** Linea_Factura tal como llega de la IA, antes de normalizar. */
export interface RawScanItem {
    description?: string | null;
    quantity?: RawNumeric;
    ocr_unit?: string | null;
    unitValue?: RawNumeric;
    lineSubtotal?: RawNumeric;
    lineTax?: RawNumeric;
    lineDiscount?: RawNumeric;
    lineNetTotal?: RawNumeric;
    /** Codigo_Barras_Linea detectado por la IA. */
    barcode?: string | null;
    /** ID del producto en el catálogo si la IA lo reconoció directamente. */
    product_id?: string | null;
    /** Arreglo de IDs de productos sugeridos si el texto es ambiguo o genérico. */
    candidate_ids?: string[] | null;
    /** Razonamiento paso a paso de la IA para esta línea. */
    reasoning?: string | null;
    /** Factor de conversión deducido por la IA. */
    conversion_factor?: RawNumeric;
    /** Cantidad en unidades de venta de Bistro deducida por la IA. */
    inventory_quantity?: RawNumeric;
    /** Indica si la IA requiere aclaración de unidad por falta de información. */
    unit_needs_clarification?: boolean | null;
}

/**
 * Cuerpo completo de la respuesta de la edge function. Todo es opcional:
 * la degradación responde `200` con `items: []` y un `error` de texto.
 */
export interface RawScanResponse {
    header?: RawScanHeader | null;
    document?: RawScanDocument | null;
    items?: RawScanItem[] | null;
    error?: string | null;
}

// ---------------------------------------------------------------------------
// Borrador_Escaneo (solo memoria)
// ---------------------------------------------------------------------------

/** Encabezado_Documento ya normalizado dentro del borrador. */
export interface ScanHeader {
    supplierName: string | null;
    nit: string | null;
    /** Teléfono del proveedor. null si no detectado. */
    phone: string | null;
    invoiceNumber: string | null;
    /** "YYYY-MM-DD" */
    date: string | null;
    /** ID del proveedor reconocido por la IA si hubo coincidencia previa. */
    supplierId?: string | null;
}

/** Imagen capturada: sirve como Evidencia y como entrada de la IA. */
export interface ScanImage {
    blob: Blob;
    previewUrl: string;
}

/** Proveedor resuelto en el borrador: existente del negocio o nuevo. */
export type ScanSupplierDraft =
    | { kind: 'existing'; id: string; name: string }
    | { kind: 'new'; name: string; nit: string; phone: string };

/** Lo que el Resolutor_Proveedor entrega al hook. */
export type SupplierDecision = ScanSupplierDraft;

/** Producto que la Creacion_Rapida_Producto arma para una línea. */
export interface NewProductDraft {
    name: string;
    categoryId: string;
    unit: string;
    cost: number;
    price: number;
    isForSale: boolean;
    /** Código de barras del producto (vacío si no se ingresó). */
    barcode: string;
    /** Unidad de compra inicial a registrar para este producto (ej. Caja x 24). */
    purchaseUnit?: { unit_name: string; conversion_factor: number };
}

/** Caso de unidad detectado por `detectUnitCase`. */
export type ScanUnitCase = 'sale' | 'known' | 'unknown' | 'none';

/** Decisión ya guardada en la línea. */
export type ScanLineDecision =
    | { kind: 'pending' }
    | { kind: 'linked'; productId: string; addNickname: boolean }
    | { kind: 'created'; newProduct: NewProductDraft }
    | { kind: 'skipped' };

/** Decisión que el Resolutor_Producto entrega al hook. */
export type LineDecision =
    | { kind: 'link'; productId: string; addNickname: boolean }
    | { kind: 'create'; newProduct: NewProductDraft }
    | { kind: 'skip' };

/** Linea_Factura del borrador, con su decisión y su conversión de unidad. */
export interface ScanLine {
    /** Identificador local, no persiste. */
    id: string;
    ocrName: string;
    /** Unidad_OCR con el mismo texto que devolvió la edge function (9.15). */
    ocrUnit: string;
    ocrQuantity: number;
    /** Costo_Neto_Linea de la IA, con impuestos incluidos. */
    netTotal: number;
    /** Parte proporcional del Descuento_Global asignada a la línea (3.5). */
    globalDiscountShare: number;
    /** Cantidad ilegible ⇒ true, con cantidad 1 (3.12). */
    needsReview: boolean;

    decision: ScanLineDecision;

    unitCase: ScanUnitCase | null;
    /** 1 en `sale`/`none`; el guardado en `known`; el pedido al Usuario en `unknown`. */
    conversionFactor: number | null;
    /** true solo en el caso `unknown` (9.12). */
    createPurchaseUnit: boolean;

    /** Cantidad en Unidad_Venta, tras la conversión. */
    quantity: number | null;
    /** Pesos: `netTotal − globalDiscountShare`. */
    lineTotal: number | null;
    /** Precio de venta editado en el Panel_Revision. */
    newPrice: number | null;

    /** Codigo_Barras_Linea extraído por la edge function. Cadena vacía si no hay. */
    barcode: string;

    /** ID del producto emparejado directamente por la IA (si hubo coincidencia de alta certeza). */
    aiProductId?: string | null;

    /** Candidatos sugeridos por la IA si la línea fue ambigua. */
    candidateIds?: string[];

    /** Indica si la línea fue emparejada automáticamente por la IA o el catálogo local sin intervención manual. */
    isAutoMatched?: boolean;

    /** Razonamiento de la IA sobre esta línea y su conversión de unidades. */
    reasoning?: string | null;

    /** Factor de conversión deducido por la IA para llevar la cantidad a la unidad de venta. */
    aiConversionFactor?: number | null;

    /** Cantidad calculada por la IA que entrará al inventario según la unidad de venta. */
    aiInventoryQuantity?: number | null;

    /** true si la IA detectó que la unidad de compra es ambigua o carece de información para deducirla. */
    unitNeedsClarification?: boolean;
}

/** Campos del gasto en el borrador (solo Ruta_Gasto). */
export interface ScanExpenseDraft {
    amount: string;
    description: string;
    category: string | null;
    /** "YYYY-MM-DD" */
    date: string;
}

/** Método de pago elegido en el borrador. */
export interface PaymentMethodDraft {
    methodId: string;
    mappedId: string;
    amount: number;
}

/** Modo de pago del registro: Contado o Crédito. */
export interface PaymentDraft {
    isCredit: boolean;
    /** Obligatoria en Crédito. */
    dueDate: string | null;
    /** Abono inicial en Crédito. */
    paidAmount: number;
    /** null = el Usuario no respondió; con turno activo bloquea la finalización. */
    deductFromCash: boolean | null;
    shiftId: string | null;
    methods: PaymentMethodDraft[];
    creditInitialMethodId: string | null;
}

/** Borrador_Escaneo completo: vive únicamente en memoria (12.1). */
export interface ScanDraft {
    destination: ScanDestination | null;
    image: ScanImage | null;
    /** Se llena en la Finalizacion_Registro, tras subir la Evidencia. */
    evidenceUrl: string | null;
    /** `crypto.randomUUID()` generado al abrir el flujo. */
    idempotencyKey: string;

    header: ScanHeader;
    /** Descuento_Global en pesos, ya normalizado. */
    globalDiscount: number;

    supplier: ScanSupplierDraft | null;

    lines: ScanLine[];
    currentLineIndex: number;

    expense: ScanExpenseDraft | null;

    payment: PaymentDraft;
}

/** Edición puntual de una línea desde el Panel_Revision. */
export interface ReviewPatch {
    quantity?: number;
    lineTotal?: number;
    newPrice?: number | null;
}

// ---------------------------------------------------------------------------
// Payloads de los motores RPC
// ---------------------------------------------------------------------------

/** Versión del payload. Permite evolucionar sin recrear la función. */
export type PayloadVersion = 1;

/** Proveedor del payload: existente validado por negocio, o nuevo. */
export type PayloadSupplier =
    | { id: string }
    | { new: { name: string; nit: string | null; phone: string | null } };

/** Producto de la línea: existente validado por negocio, o nuevo. */
export type PayloadProduct =
    | { id: string }
    | {
        new: {
            name: string;
            category_id: string;
            unit: string;
            cost: number;
            price: number;
            is_for_sale: boolean;
            barcode: string | null;
        };
    };

/** Unidad_Compra a crear (solo cuando la unidad normalizada no existe). */
export interface PayloadPurchaseUnit {
    unit_name: string;
    conversion_factor: number;
}

/** Método de pago del payload, con el id ya mapeado. */
export interface PayloadPaymentMethod {
    mapped_id: string;
    amount: number;
}

/** Bloque de pago compartido por los dos motores. */
export interface PayloadPayment {
    is_credit: boolean;
    due_date: string | null;
    paid_amount: number;
    deduct_from_cash: boolean;
    shift_id: string | null;
    methods: PayloadPaymentMethod[];
    credit_initial_method: string | null;
}

/** Línea del payload de compra: cantidad en Unidad_Venta y total en pesos. */
export interface PayloadPurchaseLine {
    product: PayloadProduct;
    quantity: number;
    line_total: number;
    ocr_name: string;
    add_nickname: boolean;
    purchase_unit: PayloadPurchaseUnit | null;
    new_price: number | null;
}

/** Payload de `register_purchase`. */
export interface RegisterPurchasePayload {
    v: PayloadVersion;
    idempotency_key: string;
    /** Solo para la validación de pertenencia del motor (17.10). */
    business_id: string;
    source: ScanSource;
    purchase_date: string;
    evidence_url: string | null;
    invoice_number: string | null;
    supplier: PayloadSupplier;
    payment: PayloadPayment;
    lines: PayloadPurchaseLine[];
}

/** Payload de `register_expense`. */
export interface RegisterExpensePayload {
    v: PayloadVersion;
    idempotency_key: string;
    business_id: string;
    source: ScanSource;
    /** "YYYY-MM-DD", no posterior a hoy en America/Bogota. */
    expense_date: string;
    receipt_url: string | null;
    amount: number;
    description: string;
    /** Nombre de la categoría; el motor la crea en el negocio si no existe. */
    category: string;
    supplier: PayloadSupplier | null;
    payment: PayloadPayment;
}

// ---------------------------------------------------------------------------
// Respuesta de los motores RPC
// ---------------------------------------------------------------------------

/** Los nueve códigos de error que devuelven los motores. */
export type RegisterErrorCode =
    | 'no_business'
    | 'business_mismatch'
    | 'forbidden'
    | 'invalid_payload'
    | 'supplier_not_found'
    | 'product_not_found'
    | 'shift_invalid'
    | 'insufficient_cash_balance'
    | 'overpayment';

/** Respuesta de éxito de `register_purchase` / `register_expense`. */
export interface RegisterSuccess {
    ok: true;
    already_processed: boolean;
    supplier_id: string | null;
    created_product_ids: string[];
    lot_ids: string[];
    debt_ids: string[];
    cash_movement_ids: string[];
    expense_id: string | null;
    totals: { lines: number; amount: number };
}

/** Respuesta de error: implica cero escrituras (12.7). */
export interface RegisterFailure {
    ok: false;
    code: RegisterErrorCode;
    message: string;
}

export type RegisterResult = RegisterSuccess | RegisterFailure;

/** Fallos que no vienen del motor pero que la Finalizacion_Registro reporta. */
export type FinalizeFailureCode =
    | RegisterErrorCode
    | 'network_error'
    | 'evidence_upload_failed';

/** Resultado de `finalize()`: registrado, encolado sin conexión o fallido. */
export type FinalizeResult =
    | { status: 'registered'; result: RegisterSuccess }
    | { status: 'queued' }
    | { status: 'failed'; code: FinalizeFailureCode; message: string };

// ---------------------------------------------------------------------------
// Interfaz del hook propietario
// ---------------------------------------------------------------------------

export interface UseInvoiceScanDraft {
    step: ScanStep;
    /** Borrador_Escaneo (solo memoria). */
    draft: ScanDraft;
    progress: ScanProgress | null;
    isDirty: boolean;
    canGoBack: boolean;

    chooseDestination: (d: ScanDestination) => void;
    /** Valida el límite de 50 MB y el tipo de archivo. Puede saltar el recorte con skipCrop. */
    attachImage: (file: File, options?: { skipCrop?: boolean }) => Promise<void>;
    /** Comprime, guarda la Evidencia y escanea. */
    confirmCrop: (blob: Blob) => Promise<void>;
    retryScan: () => Promise<void>;
    continueManual: () => void;

    confirmSupplier: (s: SupplierDecision | null) => void;
    resolveLine: (d: LineDecision) => void;
    setLineEquivalence: (factor: number) => void;
    goToPreviousLine: () => void;

    updateReviewLine: (i: number, patch: ReviewPatch) => void;
    removeReviewLine: (i: number) => void;

    setPayment: (p: PaymentDraft) => void;
    /** Sube la Evidencia y hace una sola llamada RPC. */
    finalize: () => Promise<FinalizeResult>;
    /** Confirma el descarte si `isDirty`. */
    requestClose: () => void;
}
