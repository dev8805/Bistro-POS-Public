import React, { useCallback, useState } from 'react';
import { Screen } from '../types';
import { useInvoiceCreate } from '../hooks/useInvoiceCreate';
import { useSuppliers } from '../hooks/useSuppliers';
import { ScanCaptureStep } from '../components/invoiceScan/ScanCaptureStep';
import { ScanCropStep } from '../components/invoiceScan/ScanCropStep';
import { ScanProcessingStep } from '../components/invoiceScan/ScanProcessingStep';
import { ScanErrorStep } from '../components/invoiceScan/ScanErrorStep';
import { ScanSupplierStep } from '../components/invoiceScan/ScanSupplierStep';
import { InvoiceCreateSummaryStep } from '../components/invoiceCreate/InvoiceCreateSummaryStep';
import { InvoiceCreateDoneStep } from '../components/invoiceCreate/InvoiceCreateDoneStep';

interface InvoiceCreateScreenProps {
    onNavigate: (screen: Screen) => void;
    isOnline?: boolean;
}

export const InvoiceCreateScreen: React.FC<InvoiceCreateScreenProps> = ({ onNavigate }) => {
    const { suppliers } = useSuppliers();
    const [cameraOpen, setCameraOpen] = useState(false);

    const {
        step,
        supplierMatch,
        detection,
        createdProducts,
        currentNewIndex,
        errorMessage,
        imagePreview,
        handleImageSelected,
        handleCropConfirm,
        handleSupplierConfirm,
        handleStartCreating,
        handleRetry,
        handleCancel,
    } = useInvoiceCreate();

    const handleClose = useCallback(() => {
        onNavigate(Screen.PRODUCTS);
    }, [onNavigate]);

    const handleSelectFile = useCallback((file: File, options?: { skipCrop?: boolean }) => {
        setCameraOpen(false);
        handleImageSelected(file, options);
    }, [handleImageSelected]);

    // When step is 'creating', navigate to SimpleProductScreen.
    // The hook already wrote the prefill to sessionStorage.
    // Guard: only navigate if a prefill is actually ready (avoids re-navigating on flow restore)
    React.useEffect(() => {
        if (step === 'creating') {
            const hasPrefill = sessionStorage.getItem('bistro_invoice_create_prefill');
            if (hasPrefill) {
                onNavigate(Screen.CREATE_PRODUCT_SIMPLE);
            }
        }
    }, [step, currentNewIndex]); // eslint-disable-line react-hooks/exhaustive-deps

    switch (step) {
        case 'capture':
            return (
                <ScanCaptureStep
                    destination="inventory"
                    cameraOpen={cameraOpen}
                    onOpenCamera={() => setCameraOpen(true)}
                    onCloseCamera={() => setCameraOpen(false)}
                    onSelectFile={handleSelectFile}
                    canGoBack
                    onBack={handleClose}
                    onClose={handleClose}
                    progress={null}
                />
            );

        case 'crop':
            return (
                <ScanCropStep
                    imageSrc={imagePreview ?? ''}
                    onConfirm={handleCropConfirm}
                    onRetake={handleClose}
                />
            );

        case 'processing':
            return (
                <ScanProcessingStep
                    stepText="Leyendo la factura..."
                    onClose={handleClose}
                    canGoBack={false}
                    onBack={handleClose}
                    progress={null}
                />
            );

        case 'error':
            return (
                <ScanErrorStep
                    message={errorMessage ?? 'No pudimos leer la factura.'}
                    onRetry={handleRetry}
                    onContinueManual={handleClose}
                    onClose={handleClose}
                    canGoBack
                    onBack={handleClose}
                    progress={null}
                />
            );

        case 'supplier':
            if (!supplierMatch) return null;
            return (
                <ScanSupplierStep
                    match={supplierMatch}
                    suppliers={suppliers}
                    progress={null}
                    canGoBack
                    onBack={handleClose}
                    onClose={handleClose}
                    onConfirm={handleSupplierConfirm}
                />
            );

        case 'summary':
            if (!detection) return null;
            return (
                <InvoiceCreateSummaryStep
                    detection={detection}
                    onStartCreating={handleStartCreating}
                    onCancel={handleClose}
                />
            );

        case 'creating':
            // This state navigates to SimpleProductScreen via useEffect above.
            // Show a brief spinner while navigation happens.
            return (
                <div className="flex-1 flex items-center justify-center h-full bg-slate-50 dark:bg-gray-950">
                    <div className="size-10 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500" />
                </div>
            );

        case 'done':
            return (
                <InvoiceCreateDoneStep
                    createdProducts={createdProducts}
                    onGoBack={handleClose}
                />
            );

        default:
            return null;
    }
};

export default InvoiceCreateScreen;
