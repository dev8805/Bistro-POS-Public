import React from 'react';
import { PayrollReceiptData } from '../hooks/useEmployeesDirectory';

const isMobileDevice = (): boolean => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

const isSecureContext = (): boolean => {
    return window.isSecureContext ||
        window.location.protocol === 'https:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';
};

/**
 * Descarga o comparte el comprobante de nómina / turno / vale en PDF
 */
export const downloadPayrollReceiptPDF = async (data: PayrollReceiptData): Promise<void> => {
    try {
        const [{ pdf }, { PayrollReceiptPDF }] = await Promise.all([
            import('@react-pdf/renderer'),
            import('../components/PayrollReceiptPDF'),
        ]);

        const pdfBlob = await pdf(React.createElement(PayrollReceiptPDF, { data })).toBlob();
        const fileName = `comprobante_${data.payrollConcept}_${data.employeeName.replace(/\s+/g, '_')}_${data.date}.pdf`;

        // Si es móvil y soporta Web Share API, abre el menú nativo para compartir (ej. WhatsApp)
        if (isMobileDevice() && navigator.share && isSecureContext()) {
            try {
                const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });
                await navigator.share({
                    files: [pdfFile],
                    title: `Comprobante de ${data.payrollConcept === 'advance' ? 'anticipo' : 'pago'}: ${data.employeeName}`,
                });
                return;
            } catch (shareError) {
                if ((shareError as Error).name === 'AbortError') return;
                console.warn('Web Share fallback:', shareError);
            }
        }

        // Descarga directa en navegador
        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('Error generando PDF de comprobante:', err);
        throw err;
    }
};

/**
 * Imprime el comprobante en la impresora térmica configurada (80mm o 58mm)
 */
export const printPayrollReceiptThermal = async (
    data: PayrollReceiptData,
    paperWidth: '58mm' | '80mm' = '80mm'
): Promise<boolean> => {
    try {
        const { printPayrollReceiptDirect } = await import('./thermalPrinterService');
        return await printPayrollReceiptDirect(data, paperWidth);
    } catch (err) {
        console.error('Error al imprimir comprobante en impresora térmica:', err);
        return false;
    }
};
