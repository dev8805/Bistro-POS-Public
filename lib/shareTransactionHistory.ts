import ReactDOM from 'react-dom/client';
import React from 'react';
import { TransactionHistoryHTML } from '../components/TransactionHistoryHTML';

interface Transaction {
    id: string;
    type: 'debt' | 'payment';
    amount: number;
    note?: string | null;
    created_at: string;
    order_items?: { product_name: string; quantity: number; unit_price: number }[];
}

const ITEMS_PER_PAGE = 20;

const isMobileDevice = (): boolean =>
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const chunkArray = <T,>(arr: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
};

const generateHistoryImage = async (
    clientName: string,
    currentDebt: number,
    transactions: Transaction[],
    pageIndex: number,
    totalPages: number,
): Promise<Blob> => {
    const { default: html2canvas } = await import('html2canvas');

    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.zIndex = '-1';
    document.body.appendChild(container);

    const root = ReactDOM.createRoot(container);
    root.render(
        React.createElement(TransactionHistoryHTML, {
            clientName,
            currentDebt,
            transactions,
            pageIndex,
            totalPages,
        }),
    );

    await new Promise(resolve => setTimeout(resolve, 200));

    const el = container.querySelector('#history-to-capture') as HTMLElement;
    if (!el) {
        root.unmount();
        document.body.removeChild(container);
        throw new Error('History element not found');
    }

    const canvas = await html2canvas(el, {
        backgroundColor: '#ffffff',
        scale: 3,
        useCORS: true,
        logging: false,
    });

    const TARGET_WIDTH = 1400;
    const ratio = TARGET_WIDTH / canvas.width;
    const targetHeight = Math.round(canvas.height * ratio);
    const resizedCanvas = document.createElement('canvas');
    resizedCanvas.width = TARGET_WIDTH;
    resizedCanvas.height = targetHeight;
    const ctx = resizedCanvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, TARGET_WIDTH, targetHeight);

    const blob = await new Promise<Blob>((resolve, reject) => {
        resizedCanvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('Failed to create blob'))),
            'image/png',
            1.0,
        );
    });

    root.unmount();
    document.body.removeChild(container);
    return blob;
};

const downloadBlob = (blob: Blob, filename: string): void => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

export const downloadTransactionHistory = async (
    clientName: string,
    currentDebt: number,
    transactions: Transaction[],
): Promise<void> => {
    const sorted = [...transactions].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const pages = chunkArray(sorted, ITEMS_PER_PAGE);
    const totalPages = pages.length || 1;

    if (totalPages === 0) return;

    for (let i = 0; i < totalPages; i++) {
        const blob = await generateHistoryImage(clientName, currentDebt, pages[i], i, totalPages);
        const suffix = totalPages > 1 ? `_${i + 1}` : '';
        downloadBlob(blob, `historial_${clientName.replace(/\s+/g, '_')}${suffix}.png`);
    }
};

export const shareTransactionHistory = async (
    clientName: string,
    currentDebt: number,
    transactions: Transaction[],
): Promise<void> => {
    const sorted = [...transactions].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const pages = chunkArray(sorted, ITEMS_PER_PAGE);
    const totalPages = pages.length || 1;

    if (totalPages === 0) return;

    const blobs: Blob[] = [];
    for (let i = 0; i < totalPages; i++) {
        blobs.push(await generateHistoryImage(clientName, currentDebt, pages[i], i, totalPages));
    }

    const files = blobs.map((blob, i) => {
        const suffix = totalPages > 1 ? `_${i + 1}` : '';
        return new File([blob], `historial_${clientName.replace(/\s+/g, '_')}${suffix}.png`, { type: 'image/png' });
    });

    if (isMobileDevice() && navigator.share) {
        try {
            await navigator.share({ files, title: `Historial de ${clientName}` });
            return;
        } catch (e) {
            if ((e as Error).name === 'AbortError') return;
        }
    }

    if (isMobileDevice()) {
        for (const blob of blobs) {
            downloadBlob(blob, `historial_${clientName.replace(/\s+/g, '_')}.png`);
        }
        setTimeout(() => { window.location.href = 'whatsapp://'; }, 500);
        return;
    }

    try {
        await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blobs[0] }),
        ]);
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = 'whatsapp://send?text=Imagen%20copiada%20-%20pega%20con%20Ctrl%2BV';
        document.body.appendChild(iframe);
        setTimeout(() => document.body.removeChild(iframe), 2000);
    } catch {
        for (const blob of blobs) {
            downloadBlob(blob, `historial_${clientName.replace(/\s+/g, '_')}.png`);
        }
    }
};

export const downloadTransactionHistoryPDF = async (
    clientName: string,
    currentDebt: number,
    transactions: Transaction[],
    businessName?: string,
): Promise<void> => {
    const [{ pdf }, { TransactionHistoryPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('../components/TransactionHistoryPDF'),
    ]);
    const pdfBlob = await pdf(React.createElement(TransactionHistoryPDF, { clientName, currentDebt, transactions, businessName })).toBlob();
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `historial_${clientName.replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

const isMobile = (): boolean => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export const shareTransactionHistoryPDF = async (
    clientName: string,
    currentDebt: number,
    transactions: Transaction[],
    businessName?: string,
    phone?: string,
): Promise<void> => {
    const [{ pdf }, { TransactionHistoryPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('../components/TransactionHistoryPDF'),
    ]);
    const pdfBlob = await pdf(React.createElement(TransactionHistoryPDF, { clientName, currentDebt, transactions, businessName })).toBlob();
    const fileName = `historial_${clientName.replace(/\s+/g, '_')}.pdf`;
    const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

    // Móvil: Web Share API → el SO muestra el selector (WhatsApp, Drive, etc.)
    if (isMobile() && navigator.share) {
        try {
            await navigator.share({ files: [pdfFile], title: `Historial de ${clientName}` });
            return;
        } catch (e) {
            if ((e as Error).name === 'AbortError') return;
        }
    }

    // Desktop: descargar PDF y abrir WhatsApp con el chat del cliente pre-seleccionado
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    const rawPhone = (phone || '').replace(/\D/g, '');
    const phoneFormatted = rawPhone ? (rawPhone.startsWith('57') ? rawPhone : `57${rawPhone}`) : '';
    const message = encodeURIComponent(`Hola ${clientName}, te compartimos el historial de tu cuenta en *${businessName || 'Bistro POS'}*. Adjunto el PDF.`);
    const phoneParam = phoneFormatted ? `phone=${phoneFormatted}&` : '';
    const nativeUrl = `whatsapp://send?${phoneParam}text=${message}`;
    const webUrl = `https://web.whatsapp.com/send?${phoneParam}text=${message}`;

    let appOpened = false;
    const handleBlur = () => { appOpened = true; };
    window.addEventListener('blur', handleBlur);
    window.location.href = nativeUrl;

    setTimeout(() => {
        window.removeEventListener('blur', handleBlur);
        if (!appOpened) {
            const width = 800;
            const height = 600;
            const left = (window.innerWidth - width) / 2;
            const top = (window.innerHeight - height) / 2;
            window.open(webUrl, 'WhatsApp', `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`);
        }
    }, 1500);
};

export const copyTransactionHistory = async (
    clientName: string,
    currentDebt: number,
    transactions: Transaction[],
): Promise<void> => {
    const sorted = [...transactions].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const pages = chunkArray(sorted, ITEMS_PER_PAGE);
    const totalPages = pages.length || 1;
    if (totalPages === 0) return;

    const blob = await generateHistoryImage(clientName, currentDebt, pages[0], 0, totalPages);
    try {
        await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
        ]);
    } catch {
        downloadBlob(blob, `historial_${clientName.replace(/\s+/g, '_')}.png`);
        throw new Error('clipboard_fallback');
    }
};
