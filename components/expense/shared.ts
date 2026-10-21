import { Product } from '../../hooks/useProducts';

export type RecordType = 'inventory' | 'expense' | 'waste';
export type InventoryMode = 'upload' | 'manual';

export interface PaymentEntry {
    method: string;
    amount: string;
}

export interface InventoryItem {
    product: Product;
    quantity: string;
    measureUnit: string;
    unitCost: string;
    newSalePrice?: number | null;
    extraFields?: Record<string, string | number>;
}

export interface ExpenseSubComponentProps {
    onClose: () => void;
    onSave: (data: any) => Promise<any>;
}

export const formatWithThousands = (value: string): string => {
    const clean = value.replace(/[^0-9]/g, '');
    if (!clean) return '';
    return clean.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

export const parseCleanNumber = (formatted: string): string => {
    return formatted.replace(/[^0-9]/g, '');
};

export const getLocalDateValue = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

export const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const formatExpenseDateLabel = (dateStr: string): string => {
    const [, m, d] = dateStr.split('-');
    const today = getLocalDateValue();
    if (dateStr === today) return 'Hoy';
    return `${parseInt(d)} ${MONTHS_ES[parseInt(m) - 1]}`;
};
