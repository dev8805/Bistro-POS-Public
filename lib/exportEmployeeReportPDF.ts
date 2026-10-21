/**
 * exportEmployeeReportPDF
 *
 * Acciones sobre el PDF del Reporte de Empleado:
 * - generateEmployeeReportBlob: genera el Blob del PDF (reutilizable).
 * - downloadEmployeeReportPDF: descarga el archivo.
 * - shareEmployeeReportPDF: comparte vía Web Share API (WhatsApp en móvil).
 * - printEmployeeReportPDF: abre el PDF e invoca el diálogo de impresión.
 * - sendEmployeeReportByEmail: envía el PDF adjunto vía edge function.
 *
 * Usa imports dinámicos para no cargar @react-pdf en el bundle inicial.
 */

import React from 'react';
import { EmployeeReportData } from './buildEmployeeReport';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const buildFilename = (data: EmployeeReportData): string => {
    const safeName = data.employee.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() || 'empleado';
    const safePeriod = data.period.label.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() || 'periodo';
    return `reporte_${safeName}_${safePeriod}.pdf`;
};

export const generateEmployeeReportBlob = async (data: EmployeeReportData): Promise<Blob> => {
    const [{ pdf }, { EmployeeReportPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('../components/EmployeeReportPDF'),
    ]);
    return await pdf(React.createElement(EmployeeReportPDF, { data }) as any).toBlob();
};

export const downloadEmployeeReportPDF = async (data: EmployeeReportData): Promise<void> => {
    const pdfBlob = await generateEmployeeReportBlob(data);
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = buildFilename(data);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

/** Comparte el PDF vía Web Share API (en móvil abre WhatsApp, etc.). */
export const shareEmployeeReportPDF = async (data: EmployeeReportData): Promise<void> => {
    const pdfBlob = await generateEmployeeReportBlob(data);
    const file = new File([pdfBlob], buildFilename(data), { type: 'application/pdf' });

    const canShare = typeof navigator !== 'undefined'
        && typeof (navigator as any).share === 'function'
        && typeof (navigator as any).canShare === 'function'
        && (navigator as any).canShare({ files: [file] });

    if (canShare) {
        try {
            await (navigator as any).share({
                files: [file],
                title: `Reporte de ${data.employee.name}`,
                text: `${data.business.name} · ${data.period.label}`,
            });
            return;
        } catch (err) {
            if ((err as Error).name === 'AbortError') return;
            throw err;
        }
    }

    // Fallback: descargar si no hay Web Share
    await downloadEmployeeReportPDF(data);
};

/** Abre el PDF en una ventana nueva y dispara el diálogo de impresión. */
export const printEmployeeReportPDF = async (data: EmployeeReportData): Promise<void> => {
    const pdfBlob = await generateEmployeeReportBlob(data);
    const url = URL.createObjectURL(pdfBlob);

    const printWindow = window.open(url, '_blank');
    if (!printWindow) {
        // Si el navegador bloquea el popup, descarga como fallback
        const link = document.createElement('a');
        link.href = url;
        link.download = buildFilename(data);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return;
    }

    printWindow.addEventListener('load', () => {
        try {
            printWindow.focus();
            printWindow.print();
        } catch {
            /* el usuario puede imprimir manualmente desde el visor */
        }
    });
    // Liberar la URL después de un tiempo prudente
    setTimeout(() => URL.revokeObjectURL(url), 60000);
};

const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            // Quitar el prefijo "data:application/pdf;base64,"
            resolve(result.split(',')[1] || '');
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

/** Envía el reporte por correo como PDF adjunto vía edge function. */
export const sendEmployeeReportByEmail = async (
    data: EmployeeReportData,
    recipientEmail: string
): Promise<boolean> => {
    try {
        const pdfBlob = await generateEmployeeReportBlob(data);
        const pdfBase64 = await blobToBase64(pdfBlob);

        const response = await fetch(`${SUPABASE_URL}/functions/v1/send-receipt-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: recipientEmail,
                emailType: 'employee_report',
                businessName: data.business.name,
                employeeName: data.employee.name,
                periodLabel: data.period.label,
                total: data.summary.netSales,
                date: data.generatedAt,
                pdfBase64,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Email send error:', errorData);
            return false;
        }
        return true;
    } catch (error) {
        console.error('Error sending employee report by email:', error);
        return false;
    }
};
