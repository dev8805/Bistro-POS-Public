import ReactDOM from 'react-dom/client';
import React from 'react';
import { ReceiptData } from '../types';
import { formatCurrency } from './formatters';

const isMobileDevice = (): boolean => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

const isSecureContext = (): boolean => {
    return window.isSecureContext ||
        window.location.protocol === 'https:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1';
};

const generateReceiptImage = async (data: ReceiptData): Promise<Blob> => {
    const [{ default: html2canvas }, { ReceiptHTML }] = await Promise.all([
        import('html2canvas'),
        import('../components/ReceiptHTML'),
    ]);

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.zIndex = '-1';
    document.body.appendChild(container);

    const root = ReactDOM.createRoot(container);
    root.render(React.createElement(ReceiptHTML, { data }));

    await new Promise(resolve => setTimeout(resolve, 200));

    const receiptElement = container.querySelector('#receipt-to-capture') as HTMLElement;

    if (!receiptElement) {
        root.unmount();
        document.body.removeChild(container);
        throw new Error('Receipt element not found');
    }

    const canvas = await html2canvas(receiptElement, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
    });

    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (b) => b ? resolve(b) : reject(new Error('Failed to create blob')),
            'image/png',
            1.0
        );
    });

    root.unmount();
    document.body.removeChild(container);

    return blob;
};

export const shareReceiptToWhatsApp = async (data: ReceiptData): Promise<void> => {
    try {
        // MOBILE: Share as PDF via Web Share API
        if (isMobileDevice()) {
            const [{ pdf }, { ReceiptPDF }] = await Promise.all([
                import('@react-pdf/renderer'),
                import('../components/ReceiptPDF'),
            ]);
            const pdfBlob = await pdf(React.createElement(ReceiptPDF, { data })).toBlob();
            const pdfFile = new File(
                [pdfBlob],
                `recibo_${data.orderNumber || Date.now()}.pdf`,
                { type: 'application/pdf' }
            );

            if (navigator.share && isSecureContext()) {
                try {
                    await navigator.share({
                        files: [pdfFile],
                        title: 'Comprobante de venta',
                    });
                    return;
                } catch (shareError) {
                    if ((shareError as Error).name === 'AbortError') return;
                    console.warn('Web Share failed:', shareError);
                }
            }

            // Fallback: download PDF
            const url = URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `recibo_${data.orderNumber || Date.now()}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            return;
        }

        // DESKTOP: Copy image to clipboard
        const blob = await generateReceiptImage(data);
        try {
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
            ]);
        } catch (clipboardError) {
            console.warn('Clipboard failed, downloading instead:', clipboardError);
            downloadImage(blob);
        }
    } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        console.error('Error sharing receipt:', error);
        throw error;
    }
};

export const shareThermalReceiptPDF = async (data: ReceiptData, paperWidth: '58mm' | '80mm' = '80mm'): Promise<void> => {
    try {
        const [{ pdf }, { ReceiptThermalPDF }] = await Promise.all([
            import('@react-pdf/renderer'),
            import('../components/ReceiptThermalPDF'),
        ]);
        const doc = React.createElement(ReceiptThermalPDF, { data, paperWidth });
        const pdfBlob = await pdf(doc).toBlob();
        const fileName = `ticket_${data.orderNumber || Date.now()}.pdf`;
        const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

        const canShareFiles = isMobileDevice()
            && isSecureContext()
            && typeof navigator.share === 'function'
            && typeof navigator.canShare === 'function'
            && navigator.canShare({ files: [pdfFile] });

        if (canShareFiles) {
            try {
                await navigator.share({ files: [pdfFile], title: 'Ticket de venta' });
                return;
            } catch (shareError) {
                if ((shareError as Error).name === 'AbortError') return;
                console.warn('Web Share failed, falling back to download:', shareError);
            }
        }

        const url = URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        console.error('Error sharing thermal receipt:', error);
        throw error;
    }
};

export const downloadReceiptImage = async (data: ReceiptData): Promise<void> => {
    try {
        const blob = await generateReceiptImage(data);
        downloadImage(blob);
    } catch (error) {
        console.error('Error downloading receipt:', error);
        throw error;
    }
};

const downloadImage = (blob: Blob): void => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `comprobante_${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export const printReceipt = async (data: ReceiptData): Promise<void> => {
    try {
        const { ReceiptHTML } = await import('../components/ReceiptHTML');

        // Create a temporary container for the receipt
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '0';
        document.body.appendChild(container);

        const root = ReactDOM.createRoot(container);
        root.render(React.createElement(ReceiptHTML, { data }));

        await new Promise(resolve => setTimeout(resolve, 200));

        const receiptElement = container.querySelector('#receipt-to-capture') as HTMLElement;

        if (!receiptElement) {
            root.unmount();
            document.body.removeChild(container);
            throw new Error('Receipt element not found');
        }

        // Create a new window for printing
        const printWindow = window.open('', '_blank', 'width=400,height=600');

        if (!printWindow) {
            root.unmount();
            document.body.removeChild(container);
            throw new Error('Could not open print window');
        }

        // Write the receipt HTML to the print window
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Comprobante de Venta</title>
                <style>
                    body {
                        margin: 0;
                        padding: 20px;
                        font-family: system-ui, -apple-system, sans-serif;
                    }
                    @media print {
                        body { margin: 0; padding: 10px; }
                    }
                </style>
            </head>
            <body>
                ${receiptElement.outerHTML}
            </body>
            </html>
        `);

        printWindow.document.close();

        // Wait for content to load, then print
        printWindow.onload = () => {
            printWindow.focus();
            printWindow.print();
            printWindow.close();
        };

        // Fallback if onload doesn't fire
        setTimeout(() => {
            try {
                printWindow.focus();
                printWindow.print();
                printWindow.close();
            } catch (e) {
                // Window might already be closed
            }
        }, 500);

        // Clean up
        root.unmount();
        document.body.removeChild(container);
    } catch (error) {
        console.error('Error printing receipt:', error);
        throw error;
    }
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64 = reader.result as string;
            resolve(base64.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export const sendReceiptByEmailDirect = async (
    data: ReceiptData,
    recipientEmail: string
): Promise<boolean> => {
    try {
        const [{ pdf }, { ReceiptPDF }] = await Promise.all([
            import('@react-pdf/renderer'),
            import('../components/ReceiptPDF'),
        ]);
        const pdfBlob = await pdf(React.createElement(ReceiptPDF, { data })).toBlob();
        const pdfBase64 = await blobToBase64(pdfBlob);

        const response = await fetch(
            `${SUPABASE_URL}/functions/v1/send-receipt-email`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    to: recipientEmail,
                    businessName: data.businessName,
                    businessPhone: data.businessPhone,
                    total: data.total,
                    date: data.date,
                    orderNumber: data.orderNumber,
                    pdfBase64: pdfBase64,
                }),
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Email send error:', errorData);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error sending receipt by email:', error);
        return false;
    }
};

export const shareReceiptByEmail = async (data: ReceiptData): Promise<void> => {
    try {
        const blob = await generateReceiptImage(data);
        downloadImage(blob);

        const subject = encodeURIComponent(`Comprobante de venta - ${data.businessName}`);
        const body = encodeURIComponent(
            `Hola,\n\nAdjunto el comprobante de tu compra en ${data.businessName}.\n\n` +
            `Total: $${data.total.toFixed(2)}\n` +
            `Fecha: ${data.date}\n\n` +
            `Por favor adjunta la imagen descargada a este correo.\n\n` +
            `¡Gracias por tu preferencia!`
        );

        setTimeout(() => {
            window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`, '_blank');
        }, 300);
    } catch (error) {
        console.error('Error sharing receipt by email:', error);
        throw error;
    }
};

export const copyReceiptToClipboard = async (data: ReceiptData): Promise<void> => {
    const blob = await generateReceiptImage(data);
    try {
        await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
        ]);
    } catch {
        downloadImage(blob);
        throw new Error('clipboard_fallback');
    }
};

export const shareReceiptPDF = shareReceiptToWhatsApp;
export const downloadReceiptPDF = printReceipt;

export const downloadReceiptAsPDF = async (data: ReceiptData): Promise<void> => {
    const [{ pdf }, { ReceiptPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('../components/ReceiptPDF'),
    ]);
    const pdfBlob = await pdf(React.createElement(ReceiptPDF, { data })).toBlob();
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `recibo_${data.orderNumber || Date.now()}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export const printThermalReceipt = async (
    data: ReceiptData,
    paperWidth: '58mm' | '80mm' = '80mm'
): Promise<void> => {
    const { getPrinterStatus, printReceiptDirect } = await import('./thermalPrinterService');

    if (getPrinterStatus() === 'connected') {
        const success = await printReceiptDirect(data, paperWidth);
        if (success) return;
    }

    await printThermalReceiptFallback(data, paperWidth);
};

const printThermalReceiptFallback = async (
    data: ReceiptData,
    paperWidth: '58mm' | '80mm' = '80mm'
): Promise<void> => {
    try {
        const { ReceiptThermal } = await import('../components/ReceiptThermal');

        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '0';
        document.body.appendChild(container);

        const root = ReactDOM.createRoot(container);
        root.render(React.createElement(ReceiptThermal, { data, paperWidth }));

        await new Promise(resolve => setTimeout(resolve, 200));

        const receiptElement = container.querySelector('#thermal-receipt') as HTMLElement;
        if (!receiptElement) {
            root.unmount();
            document.body.removeChild(container);
            throw new Error('Thermal receipt element not found');
        }

        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (!printWindow) {
            root.unmount();
            document.body.removeChild(container);
            throw new Error('Could not open print window');
        }

        const printableWidth = paperWidth === '80mm' ? '72mm' : '48mm';

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Ticket</title>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        margin: 0;
                        padding: 2mm;
                        width: ${printableWidth};
                        -webkit-font-smoothing: none;
                        -moz-osx-font-smoothing: unset;
                        text-rendering: geometricPrecision;
                    }
                    pre {
                        -webkit-font-smoothing: none !important;
                    }
                    @media print {
                        @page {
                            size: ${paperWidth} auto;
                            margin: 0;
                        }
                        body {
                            margin: 0;
                            padding: 2mm;
                            width: ${printableWidth};
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                    }
                </style>
            </head>
            <body>
                ${receiptElement.outerHTML}
            </body>
            </html>
        `);

        printWindow.document.close();

        printWindow.onload = () => {
            printWindow.focus();
            printWindow.print();
            printWindow.close();
        };

        setTimeout(() => {
            try {
                printWindow.focus();
                printWindow.print();
                printWindow.close();
            } catch (e) { }
        }, 500);

        root.unmount();
        document.body.removeChild(container);
    } catch (error) {
        console.error('Error printing thermal receipt:', error);
        throw error;
    }
};
