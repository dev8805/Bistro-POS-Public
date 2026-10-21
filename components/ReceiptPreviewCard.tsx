import React from 'react';
import { ReceiptThermal } from './ReceiptThermal';
import { ReceiptData } from '../types';

interface ReceiptPreviewCardProps {
    businessName: string;
    businessNit: string;
    businessPhone: string;
    businessAddress: string;
    paperWidth: '58mm' | '80mm';
}

const MOCK_ITEMS = [
    { name: 'Arroz con pollo', quantity: 2, unitPrice: 12000, total: 24000, unit: 'Unidad' },
    { name: 'Gaseosa 350ml', quantity: 3, unitPrice: 3500, total: 10500, unit: 'Unidad' },
    { name: 'Queso campesino', quantity: 0.5, unitPrice: 18000, total: 9000, unit: 'Kilogramos' },
];

const buildMockReceiptData = (props: ReceiptPreviewCardProps): ReceiptData => ({
    businessName: props.businessName || 'Mi Negocio',
    businessNit: props.businessNit || undefined,
    businessPhone: props.businessPhone || undefined,
    businessAddress: props.businessAddress || undefined,
    items: MOCK_ITEMS,
    subtotal: 43500,
    totalDiscount: 0,
    total: 43500,
    paymentMethod: 'Efectivo',
    amountPaid: 50000,
    change: 6500,
    customerName: 'Juan Perez',
    customerDocument: '11234567854',
    date: new Date().toLocaleDateString('es-CO', {
        day: '2-digit', month: 'short',
        hour: '2-digit', minute: '2-digit', hour12: false,
    }).replace(',', ','),
    sellerName: 'Carlos M.',
    displayNumber: '0042',
});

const ReceiptPreviewCard: React.FC<ReceiptPreviewCardProps> = (props) => {
    const receiptData = buildMockReceiptData(props);

    return (
        <div className="flex flex-col items-center">
            {/* Ticket simulado con sombra de papel */}
            <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden w-fit max-w-full">

                {/* Borde superior simulando corte de papel */}
                <div className="h-3 bg-gradient-to-b from-gray-100 to-white" />

                {/* Contenido del ticket — forzamos font-size uniforme para legibilidad en preview */}
                <div className="px-3 pb-4 [&_pre]:!text-[11px]">
                    <ReceiptThermal data={receiptData} paperWidth={props.paperWidth} />
                </div>

                {/* Borde inferior simulando corte dentado */}
                <div
                    className="h-4 bg-white"
                    style={{
                        backgroundImage: 'radial-gradient(circle, #e5e7eb 2px, transparent 2px)',
                        backgroundSize: '12px 8px',
                        backgroundPosition: '0 -4px',
                    }}
                />
            </div>

            {/* Label debajo */}
            <p className="mt-3 text-[11px] text-gray-400 font-medium text-center">
                Vista previa con datos de ejemplo
            </p>
        </div>
    );
};

export default ReceiptPreviewCard;
