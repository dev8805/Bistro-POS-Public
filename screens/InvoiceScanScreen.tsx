import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useConfirmDialog } from '../context/ConfirmDialogContext';
import { usePermissions } from '../hooks/usePermissions';
import { useProducts } from '../hooks/useProducts';
import { useSuppliers } from '../hooks/useSuppliers';
import { useCashRegister } from '../hooks/useCashRegister';
import { useExpenses } from '../hooks/useExpenses';
import { useImageUpload } from '../hooks/useImageUpload';
import { useBusinessPaymentMethods } from '../lib/paymentMethods';
import { useInvoiceScanDraft } from '../hooks/useInvoiceScanDraft';
import { matchSupplierHeader } from '../lib/invoiceScan/supplierMatch';
import { buildExpensePayload, type ExpensePayloadIssue } from '../lib/invoiceScan/buildExpensePayload';
import { parseLatinNumber, toPesos } from '../lib/invoiceScan/numbers';
import { todayDateStringInTz } from '../lib/timezone';
import type { FinalizeResult, NewProductDraft } from '../lib/invoiceScan/types';

import { ScanStepShell, SCAN_PRIMARY_ACTION_CLASSES, SCAN_SECONDARY_ACTION_CLASSES } from '../components/invoiceScan/ScanStepShell';
import { ScanDestinationStep } from '../components/invoiceScan/ScanDestinationStep';
import { ScanCaptureStep } from '../components/invoiceScan/ScanCaptureStep';
import { ScanCropStep } from '../components/invoiceScan/ScanCropStep';
import { ScanProcessingStep } from '../components/invoiceScan/ScanProcessingStep';
import { ScanErrorStep } from '../components/invoiceScan/ScanErrorStep';
import { ScanSupplierStep } from '../components/invoiceScan/ScanSupplierStep';
import { ScanLineResolverStep, type ScanEquivalencePrompt } from '../components/invoiceScan/ScanLineResolverStep';
import { ScanReviewStep, type ScanReviewLineView } from '../components/invoiceScan/ScanReviewStep';
import { ScanPaymentStep, type ScanPaymentMethodOption } from '../components/invoiceScan/ScanPaymentStep';
import { ScanExpenseFieldsStep } from '../components/invoiceScan/ScanExpenseFieldsStep';
import type { ScanQuickCategory, ScanQuickSupplierData, QuickFormPartialDraft } from '../components/invoiceScan/ScanQuickProductForm';

/**
 * `InvoiceScanScreen` — host del Escaneo_Unificado (tarea 5.8).
 *
 * Es el ÚNICO lugar que conecta los datos del Negocio_Activo (hooks de negocio)
 * con el hook propietario del borrador (`useInvoiceScanDraft`) y los componentes
 * de paso. No contiene lógica de registro: el hook y los motores RPC ya la
 * tienen. Aquí solo se cablea: catálogo, proveedores, categorías, turno, saldos,
 * evidencia y confirmación de descarte, y se renderiza el paso activo dentro de
 * `ScanStepShell` (Req 16.1, 16.3, 16.4).
 *
 * ## Permiso (Req 14.2, 14.3)
 *
 * El flujo exige `inv_purchase`. Sin el permiso se muestra el aviso de permiso
 * faltante vigente del proyecto (el mismo de `ExpenseModal`) y no se monta el
 * flujo de escaneo. Con el permiso, todas las acciones están disponibles: no hay
 * variante recortada según otros permisos.
 *
 * ## Cierre y descarte (Req 12.5, 16.5)
 *
 * El control de cerrar de cada paso llama a `requestClose()`, que el hook
 * conecta con el `ConfirmDialog` global inyectado en `confirmDiscard`. Al éxito
 * (o al confirmar el descarte) el hook llama al `onClose` inyectado, que es la
 * prop de origen de esta pantalla: así se regresa a la pantalla desde la que se
 * abrió "Foto a factura".
 *
 * ## Nota sobre la transición al paso de pago
 *
 * La máquina de estados del hook (tareas 4.1-4.4) no expone una transición
 * `review → payment` ni `expenseFields → payment`: llega a `review`/
 * `expenseFields` y de ahí la única acción de red es `finalize()`. El paso de
 * pago se muestra, entonces, como una fase de navegación local del host
 * (`paymentOpen`) sobre esos dos pasos, sin duplicar lógica de negocio: el
 * borrador y la Finalizacion_Registro siguen viviendo en el hook. Al confirmar
 * el pago se invoca `finalize()`, que mueve el `step` del hook a `submitting`.
 */

interface InvoiceScanScreenProps {
    /** Regresa a la pantalla de origen desde la que se abrió "Foto a factura". */
    onClose: () => void;
    /** Destino predefinido para entrar directo a captura ('inventory' o 'expense'). */
    initialDestination?: 'inventory' | 'expense';
}

/** Códigos de validación que pertenecen al paso de pago (compartidos por ambas rutas). */
const PAYMENT_ISSUE_CODES: ExpensePayloadIssue[] = [
    'missing_due_date',
    'negative_paid_amount',
    'negative_method_amount',
    'overpayment',
    'unanswered_cash_question',
];

/** Códigos de validación que pertenecen a los campos del gasto. */
const EXPENSE_FIELD_ISSUE_CODES: ExpensePayloadIssue[] = [
    'missing_business_id',
    'missing_idempotency_key',
    'missing_expense_fields',
    'invalid_amount',
    'missing_category',
    'missing_expense_date',
    'future_expense_date',
    'missing_supplier',
];

/** Listas vacías estables para no crear identidades nuevas por render. */
const EMPTY_ISSUES: ExpensePayloadIssue[] = [];
const EMPTY_REVIEW: ScanReviewLineView[] = [];

const SUBMITTING_MESSAGE = 'Guardando el registro. No cierres la pantalla.';

const InvoiceScanScreen: React.FC<InvoiceScanScreenProps> = ({ onClose, initialDestination }) => {
    const { profile } = useAuth();
    const { showToast } = useToast();
    const { confirmAction } = useConfirmDialog();
    const { hasPermission } = usePermissions();

    const { products, categories, refetchCategories } = useProducts();
    const { suppliers } = useSuppliers();
    const { activeShift, balances } = useCashRegister();
    const { categories: expenseCategories, addCategory } = useExpenses();
    const paymentMethods = useBusinessPaymentMethods();
    const evidence = useImageUpload(null, 'debt-evidence');

    const businessId = profile?.business_id ?? '';
    const userId = profile?.id ?? '';
    const canRegister = hasPermission('inv_purchase');

    // Fase local del paso de pago (ver nota en el encabezado del archivo).
    const [paymentOpen, setPaymentOpen] = useState(false);
    // Estado de la cámara del paso de captura: `InAppCamera` toma la pantalla.
    const [cameraOpen, setCameraOpen] = useState(false);
    // Último costo real de cada producto registrado en compras previas (inventory_lots)
    const [lastCosts, setLastCosts] = useState<Record<string, number>>({});

    useEffect(() => {
        if (!businessId) return;
        let isMounted = true;
        try {
            const table = supabase?.from?.('inventory_lots');
            if (table && typeof table.select === 'function') {
                table
                    .select('product_id, unit_cost, purchase_date, created_at')
                    .eq('business_id', businessId)
                    .order('created_at', { ascending: false })
                    .then(
                        ({ data }: { data: Array<{ product_id: string; unit_cost: number }> | null }) => {
                            if (!data || !isMounted) return;
                            const map: Record<string, number> = {};
                            for (const lot of data) {
                                if (lot.product_id && map[lot.product_id] === undefined && Number(lot.unit_cost) > 0) {
                                    map[lot.product_id] = Number(lot.unit_cost);
                                }
                            }
                            setLastCosts(map);
                        },
                        () => {},
                    );
            }
        } catch {
            // No interrumpe si la base o mock no está disponible
        }
        return () => {
            isMounted = false;
        };
    }, [businessId]);

    const scan = useInvoiceScanDraft({
        onClose,
        initialDestination,
        confirmDiscard: confirmAction,
        products,
        suppliers,
        categories: expenseCategories,
        businessId,
        userId,
        activeShiftId: activeShift?.id ?? null,
        uploadEvidence: evidence.uploadFileDirect,
        markEvidenceSaved: evidence.markAsSaved,
        engineVersion: 'v2',
    });

    const {
        step,
        draft,
        progress,
        captureError,
        scanErrorMessage,
        submitErrorMessage,
        canRetryWithoutEvidence,
        nicknameOwner,
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
        canGoBack,
        engineVersion,
        setEngineVersion,
    } = scan;

    const destination = draft.destination;
    const today = todayDateStringInTz();

    // ----- datos derivados del Negocio_Activo -----

    /** Categorías de producto para la Creacion_Rapida_Producto (Req 17.14). */
    const quickCategories = useMemo<ScanQuickCategory[]>(
        () => categories.map(c => ({ id: c.id, name: c.name })),
        [categories],
    );

    /** Info del proveedor para mostrar en el formulario rápido. */
    const supplierDataForQuickForm = useMemo((): ScanQuickSupplierData => {
        if (!draft.supplier) return null;
        if (draft.supplier.kind === 'existing') return { kind: 'existing', id: draft.supplier.id, name: draft.supplier.name };
        if (draft.supplier.kind === 'new') return { kind: 'new', name: draft.supplier.name, nit: draft.supplier.nit, phone: draft.supplier.phone };
        return null;
    }, [draft.supplier]);

    /** Emparejamiento del proveedor del encabezado contra los proveedores del negocio. */
    const supplierMatch = useMemo(
        () => matchSupplierHeader(draft.header, suppliers),
        [draft.header, suppliers],
    );

    /** Métodos de pago del negocio con su saldo en caja, para el paso de pago (Req 17.14). */
    const paymentOptions = useMemo<ScanPaymentMethodOption[]>(
        () => paymentMethods.map(m => ({
            id: m.id,
            label: m.label,
            mappedId: m.mappedId,
            balance: (balances && balances[m.mappedId]) || 0,
        })),
        [paymentMethods, balances],
    );

    /** Líneas resueltas para el Panel_Revision, con lo vigente del catálogo o último lote (Req 10.1, 10.3). */
    const reviewViews = useMemo<ScanReviewLineView[]>(() => {
        const views: ScanReviewLineView[] = [];
        draft.lines.forEach((line, index) => {
            const decision = line.decision;
            if (decision.kind === 'linked') {
                const product = products.find(p => p.id === decision.productId);
                const latestCost = product ? (lastCosts[product.id] ?? product.cost) : null;
                views.push({
                    index,
                    line,
                    productName: product ? product.name : line.ocrName,
                    productImage: product ? (product.image || product.image_url || null) : null,
                    saleUnit: product ? product.unit : '',
                    catalogCost: latestCost,
                    catalogPrice: product ? product.price : null,
                });
            } else if (decision.kind === 'created') {
                views.push({
                    index,
                    line,
                    productName: decision.newProduct.name,
                    productImage: null,
                    saleUnit: decision.newProduct.unit,
                    catalogCost: null,
                    catalogPrice: null,
                });
            }
        });
        return views;
    }, [draft.lines, products, lastCosts]);

    /** Total de la compra: suma de los totales de las líneas visibles. */
    const purchaseTotal = useMemo(
        () => reviewViews.reduce((acc, view) => acc + (view.line.lineTotal ?? 0), 0),
        [reviewViews],
    );

    /** Valor del gasto, ya normalizado a pesos. */
    const expenseTotal = useMemo(
        () => toPesos(parseLatinNumber(draft.expense?.amount ?? '')),
        [draft.expense],
    );

    const paymentTotal = destination === 'inventory' ? purchaseTotal : expenseTotal;

    /**
     * Resultado de armar el payload del gasto. Se reusa `buildExpensePayload`
     * para no duplicar las validaciones: de aquí salen tanto los avisos de los
     * campos del gasto como los del pago (Req 11.5).
     */
    const expenseIssues = useMemo<ExpensePayloadIssue[]>(() => {
        if (destination !== 'expense') return EMPTY_ISSUES;
        const result = buildExpensePayload(
            {
                idempotencyKey: draft.idempotencyKey,
                evidenceUrl: draft.evidenceUrl,
                supplier: draft.supplier,
                expense: draft.expense,
                payment: draft.payment,
            },
            { source: 'scan', businessId, today },
        );
        return result.kind === 'incomplete' ? result.issues : EMPTY_ISSUES;
    }, [destination, draft.idempotencyKey, draft.evidenceUrl, draft.supplier, draft.expense, draft.payment, businessId, today]);

    const expenseFieldIssues = useMemo(
        () => expenseIssues.filter(i => EXPENSE_FIELD_ISSUE_CODES.includes(i)),
        [expenseIssues],
    );

    /**
     * Avisos del paso de pago. En la Ruta_Gasto salen del propio
     * `buildExpensePayload`; en la Ruta_Inventario se derivan reusando el mismo
     * builder con un gasto sintético del total de la compra, de modo que solo
     * afloran los códigos de pago (sin reimplementar la validación).
     */
    const paymentIssues = useMemo<ExpensePayloadIssue[]>(() => {
        if (destination === 'expense') {
            return expenseIssues.filter(i => PAYMENT_ISSUE_CODES.includes(i));
        }
        if (destination === 'inventory') {
            const result = buildExpensePayload(
                {
                    idempotencyKey: draft.idempotencyKey,
                    evidenceUrl: null,
                    supplier: draft.supplier ?? { kind: 'existing', id: 'placeholder', name: 'placeholder' },
                    expense: {
                        amount: String(Math.max(1, purchaseTotal)),
                        description: '',
                        category: 'PLACEHOLDER',
                        date: today,
                    },
                    payment: draft.payment,
                },
                { source: 'scan', businessId: businessId || 'placeholder', today },
            );
            return result.kind === 'incomplete'
                ? result.issues.filter(i => PAYMENT_ISSUE_CODES.includes(i))
                : EMPTY_ISSUES;
        }
        return EMPTY_ISSUES;
    }, [destination, expenseIssues, draft.idempotencyKey, draft.supplier, draft.payment, purchaseTotal, businessId, today]);

    /**
     * Pregunta de equivalencia de la línea actual: no nula cuando la línea
     * vinculada/creada trae una Unidad_OCR desconocida y aún sin Factor_Conversion
     * (Req 9.3, 9.4). El caso de unidad ya lo calculó el hook.
     */
    const currentLine = draft.lines[draft.currentLineIndex];
    const equivalence = useMemo<ScanEquivalencePrompt | null>(() => {
        if (step !== 'lineResolver' || !currentLine) return null;
        const decision = currentLine.decision;
        if (decision.kind !== 'linked' && decision.kind !== 'created') return null;
        if (currentLine.unitCase !== 'unknown') return null;
        if (typeof currentLine.conversionFactor === 'number' && currentLine.conversionFactor > 0) return null;

        let productName = '';
        let saleUnit = '';
        if (decision.kind === 'linked') {
            const product = products.find(p => p.id === decision.productId);
            productName = product ? product.name : currentLine.ocrName;
            saleUnit = product ? product.unit : '';
        } else {
            productName = decision.newProduct.name;
            saleUnit = decision.newProduct.unit;
        }

        return {
            ocrUnit: currentLine.ocrUnit,
            saleUnit,
            productName,
            ocrQuantity: currentLine.ocrQuantity,
            ocrLineTotal: Math.max(0, currentLine.netTotal - currentLine.globalDiscountShare),
        };
    }, [step, currentLine, products]);

    // ----- handlers -----

    const handleSelectFile = useCallback((file: File, options?: { skipCrop?: boolean }) => {
        setCameraOpen(false);
        void attachImage(file, options);
    }, [attachImage]);

    const handleOpenCamera = useCallback(() => setCameraOpen(true), []);
    const handleCloseCamera = useCallback(() => setCameraOpen(false), []);

    const handleRescan = useCallback(() => {
        if (destination) chooseDestination(destination);
    }, [destination, chooseDestination]);

    const handleCreateProduct = useCallback((newProduct: NewProductDraft) => {
        resolveLine({ kind: 'create', newProduct });
    }, [resolveLine]);

    const handleLinkExisting = useCallback((productId: string) => {
        resolveLine({ kind: 'link', productId, addNickname: false });
    }, [resolveLine]);

    const handleLink = useCallback((productId: string, addNickname: boolean) => {
        resolveLine({ kind: 'link', productId, addNickname });
    }, [resolveLine]);

    const handleSkipLine = useCallback(() => {
        resolveLine({ kind: 'skip' });
    }, [resolveLine]);

    const handleSupplierNameChange = useCallback((name: string) => {
        const nit = draft.supplier?.kind === 'new' ? draft.supplier.nit : '';
        const phone = draft.supplier?.kind === 'new' ? draft.supplier.phone : '';
        confirmSupplier({ kind: 'new', name, nit, phone });
    }, [confirmSupplier, draft.supplier]);

    const handleClearSupplier = useCallback(() => {
        confirmSupplier(null);
    }, [confirmSupplier]);

    const handleSelectSupplier = useCallback((s: { id: string; name: string }) => {
        confirmSupplier({ kind: 'existing', id: s.id, name: s.name });
    }, [confirmSupplier]);

    const handleCreateCategory = useCallback((name: string) => addCategory(name), [addCategory]);

    const handleOpenPayment = useCallback(() => setPaymentOpen(true), []);
    const handleClosePayment = useCallback(() => setPaymentOpen(false), []);

    /** Abre el formulario completo (SimpleProductScreen) con datos prellenados. Por ahora deshabilitado. */
    const handleOpenFullForm = useCallback((_partialDraft: QuickFormPartialDraft) => {
        showToast('El formulario completo estará disponible próximamente. Usa "Crear y continuar".', 'info');
    }, [showToast]);

    const handleFinalizeOutcome = useCallback((result: FinalizeResult) => {
        if (result.status === 'registered') {
            showToast(
                destination === 'inventory' ? 'Compra registrada con éxito' : 'Gasto registrado con éxito',
                'success',
            );
        } else if (result.status === 'queued') {
            showToast(
                'Sin conexión: el registro se guardó y se sincronizará cuando vuelva el internet. La foto de la factura no se adjuntará.',
                'info',
            );
        } else if (result.status === 'failed') {
            showToast(
                result.message || (destination === 'inventory' ? 'No se pudo registrar la compra' : 'No se pudo registrar el gasto'),
                'error',
            );
        }
    }, [destination, showToast]);

    /** Confirma el pago: dispara la Finalizacion_Registro y avisa el resultado. */
    const handlePaymentConfirm = useCallback(async () => {
        const result = await finalize();
        handleFinalizeOutcome(result);
    }, [finalize, handleFinalizeOutcome]);

    const handleRetrySubmit = useCallback(async () => {
        const result = await retrySubmit();
        handleFinalizeOutcome(result);
    }, [retrySubmit, handleFinalizeOutcome]);

    const handleSubmitWithoutEvidence = useCallback(async () => {
        const result = await submitWithoutEvidence();
        handleFinalizeOutcome(result);
    }, [submitWithoutEvidence, handleFinalizeOutcome]);

    // ----- permiso (Req 14.2): sin `inv_purchase` no se monta el flujo -----

    if (!canRegister) {
        return (
            <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-slate-50 p-8 text-center">
                <div className="flex size-16 items-center justify-center rounded-full bg-amber-50">
                    <span className="material-symbols-outlined text-[32px] text-amber-500" aria-hidden="true">lock</span>
                </div>
                <h2 className="text-lg font-black text-slate-900">No tienes permiso para registrar compras y gastos</h2>
                <p className="max-w-xs text-sm font-semibold text-slate-500">
                    Pídele a un administrador que active el permiso "Registrar Gastos" para tu usuario.
                </p>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Cerrar el escaneo"
                    className={SCAN_SECONDARY_ACTION_CLASSES}
                >
                    Entendido
                </button>
            </div>
        );
    }

    // ----- paso de pago (fase local sobre `review` / `expenseFields`) -----

    if (paymentOpen && (step === 'review' || step === 'expenseFields')) {
        return (
            <ScanStepShell
                step="payment"
                title="¿Cómo se paga?"
                subtitle={destination === 'inventory' ? 'Elige el pago de la compra.' : 'Elige el pago del gasto.'}
                canGoBack
                onBack={handleClosePayment}
                onClose={requestClose}
            >
                <ScanPaymentStep
                    payment={draft.payment}
                    total={paymentTotal}
                    methods={paymentOptions}
                    hasActiveShift={Boolean(activeShift)}
                    restrictCashToShift={false}
                    issues={paymentIssues}
                    onChange={setPayment}
                    onConfirm={handlePaymentConfirm}
                    confirmLabel={destination === 'inventory' ? 'Registrar compra' : 'Registrar gasto'}
                />
            </ScanStepShell>
        );
    }

    // ----- render del paso activo -----

    switch (step) {
        case 'destination':
            return (
                <ScanDestinationStep
                    onSelectDestination={chooseDestination}
                    onClose={requestClose}
                    canGoBack={canGoBack}
                    onBack={goBack}
                    progress={progress}
                />
            );

        case 'capture':
            return (
                <ScanCaptureStep
                    destination={destination ?? 'inventory'}
                    cameraOpen={cameraOpen}
                    onOpenCamera={handleOpenCamera}
                    onCloseCamera={handleCloseCamera}
                    onSelectFile={handleSelectFile}
                    errorMessage={captureError ?? undefined}
                    canGoBack={canGoBack || Boolean(initialDestination)}
                    onBack={canGoBack ? goBack : requestClose}
                    onClose={requestClose}
                    progress={progress}
                    engineVersion={engineVersion}
                    onChangeEngineVersion={setEngineVersion}
                />
            );

        case 'crop':
            return (
                <ScanCropStep
                    imageSrc={draft.image?.previewUrl ?? ''}
                    onConfirm={confirmCrop}
                    onRetake={goBack}
                />
            );

        case 'processing':
            return (
                <ScanProcessingStep
                    stepText={destination === 'expense' ? 'Leyendo el comprobante...' : 'Leyendo las líneas de la factura...'}
                    onClose={requestClose}
                    canGoBack={canGoBack}
                    onBack={goBack}
                    progress={progress}
                />
            );

        case 'scanError':
            return (
                <ScanErrorStep
                    message={scanErrorMessage ?? 'No pudimos leer el documento.'}
                    onRetry={retryScan}
                    onContinueManual={continueManual}
                    onClose={requestClose}
                    canGoBack={canGoBack}
                    onBack={goBack}
                    progress={progress}
                />
            );

        // El escaneo fallido → "Continuar manual" deja el flujo en `manualEntry`
        // con la imagen adjunta y los campos vacíos: se resuelve eligiendo o
        // escribiendo el proveedor, igual que el paso `supplier`.
        case 'manualEntry':
        case 'supplier':
            return (
                <ScanSupplierStep
                    match={supplierMatch}
                    suppliers={suppliers}
                    progress={progress}
                    canGoBack={canGoBack}
                    onBack={goBack}
                    onClose={requestClose}
                    onConfirm={confirmSupplier}
                />
            );

        case 'lineResolver':
            if (!currentLine || !progress) return null;
            return (
                <ScanLineResolverStep
                    line={currentLine}
                    progress={progress}
                    categories={quickCategories}
                    onCategoriesChange={() => {
                        refetchCategories();
                    }}
                    products={products}
                    nicknameOwner={nicknameOwner}
                    equivalence={equivalence}
                    canGoBack={canGoBack}
                    supplierData={supplierDataForQuickForm}
                    onOpenFullForm={handleOpenFullForm}
                    onCreate={handleCreateProduct}
                    onLinkExisting={handleLinkExisting}
                    onLink={handleLink}
                    onSkip={handleSkipLine}
                    onConfirmEquivalence={setLineEquivalence}
                    onPreviousLine={goToPreviousLine}
                    onBack={goBack}
                    onClose={requestClose}
                />
            );

        case 'review': {
            const hasSupplier = Boolean(draft.supplier?.name);
            const reviewTitle = hasSupplier ? draft.supplier!.name : 'Revisa la compra';
            const reviewSubtitle = hasSupplier
                ? (draft.header.nit || (draft.supplier?.kind === 'new' && draft.supplier.nit)
                    ? `NIT: ${draft.header.nit || (draft.supplier?.kind === 'new' && draft.supplier.nit)}`
                    : 'Proveedor confirmado')
                : 'Ajusta cantidades, costos y precios antes de pagar.';

            return (
                <ScanStepShell
                    step="review"
                    title={reviewTitle}
                    subtitle={reviewSubtitle}
                    canGoBack={canGoBack}
                    onBack={goBack}
                    onClose={requestClose}
                >
                    <ScanReviewStep
                        lines={reviewViews}
                        onUpdateLine={updateReviewLine}
                        onRemoveLine={removeReviewLine}
                        onConfirm={handleOpenPayment}
                        onRescan={handleRescan}
                        onClose={requestClose}
                    />
                </ScanStepShell>
            );
        }

        case 'emptyPurchase':
            return (
                <ScanStepShell
                    step="emptyPurchase"
                    title="Compra sin productos"
                    canGoBack={canGoBack}
                    onBack={goBack}
                    onClose={requestClose}
                >
                    <ScanReviewStep
                        lines={EMPTY_REVIEW}
                        onUpdateLine={updateReviewLine}
                        onRemoveLine={removeReviewLine}
                        onConfirm={handleOpenPayment}
                        onRescan={handleRescan}
                        onClose={requestClose}
                    />
                </ScanStepShell>
            );

        case 'expenseFields':
            return (
                <ScanStepShell
                    step="expenseFields"
                    title="Datos del gasto"
                    subtitle="Revisa y completa antes de continuar al pago."
                    canGoBack={canGoBack}
                    onBack={goBack}
                    onClose={requestClose}
                >
                    <ScanExpenseFieldsStep
                        expense={draft.expense ?? { amount: '', description: '', category: null, date: today }}
                        supplier={draft.supplier}
                        suppliers={suppliers}
                        categories={expenseCategories}
                        issues={expenseFieldIssues}
                        onChange={setExpenseFields}
                        onSupplierNameChange={handleSupplierNameChange}
                        onClearSupplier={handleClearSupplier}
                        onSelectSupplier={handleSelectSupplier}
                        onCreateCategory={handleCreateCategory}
                        onConfirm={handleOpenPayment}
                        today={today}
                    />
                </ScanStepShell>
            );

        case 'submitting':
            return (
                <ScanStepShell
                    step="submitting"
                    title="Guardando el registro"
                    subtitle="Tarda unos segundos. No cierres la pantalla."
                    canGoBack={false}
                    onBack={goBack}
                    onClose={requestClose}
                    liveMessage={SUBMITTING_MESSAGE}
                >
                    <div className="flex flex-col items-center gap-4 py-8">
                        <div
                            aria-hidden="true"
                            className="size-12 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500"
                        />
                        <p className="text-center text-sm font-black tracking-tight text-slate-900">{SUBMITTING_MESSAGE}</p>
                    </div>
                </ScanStepShell>
            );

        case 'submitError':
            return (
                <ScanStepShell
                    step="submitError"
                    title="No pudimos guardar el registro"
                    subtitle="El borrador sigue completo: puedes reintentar."
                    canGoBack={false}
                    onBack={goBack}
                    onClose={requestClose}
                    errorMessage={submitErrorMessage ?? undefined}
                    footer={
                        <div className="flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={handleRetrySubmit}
                                aria-label="Reintentar el registro"
                                className={SCAN_PRIMARY_ACTION_CLASSES}
                            >
                                Reintentar
                            </button>
                            {canRetryWithoutEvidence && (
                                <button
                                    type="button"
                                    onClick={handleSubmitWithoutEvidence}
                                    aria-label="Guardar sin la foto de la factura"
                                    className={SCAN_SECONDARY_ACTION_CLASSES}
                                >
                                    Guardar sin la foto
                                </button>
                            )}
                        </div>
                    }
                >
                    <p className="text-sm font-semibold leading-relaxed text-slate-600">
                        {submitErrorMessage ?? 'Ocurrió un problema al guardar. Reintenta el registro.'}
                    </p>
                </ScanStepShell>
            );

        case 'done':
            return (
                <ScanStepShell
                    step="done"
                    title="Registro guardado"
                    canGoBack={false}
                    onBack={goBack}
                    onClose={onClose}
                >
                    <div className="flex flex-col items-center gap-3 py-8 text-center">
                        <span className="material-symbols-outlined text-5xl text-emerald-500" aria-hidden="true">check_circle</span>
                        <p className="text-sm font-black text-slate-900">El registro quedó guardado.</p>
                    </div>
                </ScanStepShell>
            );

        default:
            return null;
    }
};

export default InvoiceScanScreen;
