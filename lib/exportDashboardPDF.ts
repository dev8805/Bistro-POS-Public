import React from 'react';
import { DashboardData } from '../hooks/useDashboard';

export const downloadDashboardPDF = async (
    data: DashboardData,
    dateRangeName: string,
    businessName: string,
    totalPending: number = 0,
    action: 'download' | 'share' = 'download'
): Promise<void> => {
    // Dynamic import to keep bundle size small if PDF is not always used
    const [{ pdf }, { DashboardPDFReport }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('../components/DashboardPDFReport'),
    ]);

    const pdfBlob = await pdf(React.createElement(DashboardPDFReport, { data, dateRangeName, businessName, totalPending })).toBlob();
    
    // Sanitize business name and date range
    const safeName = businessName.replace(/[^a-zA-Z0-9-]/g, '_').toLowerCase() || 'reporte';
    const safeDate = dateRangeName.replace(/[^a-zA-Z0-9-]/g, '_').toLowerCase();
    const filename = `reporte_ventas_${safeName}_${safeDate}.pdf`;

    if (action === 'share' && typeof navigator !== 'undefined' && navigator.canShare) {
        const file = new File([pdfBlob], filename, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: 'Reporte de Estadísticas',
                    text: `Reporte de ventas: ${businessName} - ${dateRangeName}`
                });
                return;
            } catch (err) {
                if ((err as Error).name === 'AbortError') return; // User cancelled
                console.error('Error sharing:', err);
                // Fallback will execute if sharing fails with something other than abort
            }
        }
    }

    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};
