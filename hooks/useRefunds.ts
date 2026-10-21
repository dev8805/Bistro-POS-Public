import { useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * useRefunds — Devolución de venta (refund).
 *
 * Online-only: una devolución necesita consultar la venta original y validar
 * cantidades en el servidor, por eso NO se encola sin conexión (a diferencia
 * del addRefund genérico de caja). La RPC `process_sale_refund` es transaccional
 * y valida permiso (`pos_refund`), turno abierto y cantidades pendientes.
 */

export interface RefundItemInput {
    order_item_id: string;
    quantity: number;
    restock: boolean;
}

export interface ProcessRefundResult {
    success: boolean;
    total?: number;
    refund_id?: string;
    message?: string;
}

export const useRefunds = () => {
    const processSaleRefund = useCallback(async (
        orderId: string,
        items: RefundItemInput[],
        method: string,
        reason: string
    ): Promise<ProcessRefundResult> => {
        if (!navigator.onLine) {
            return { success: false, message: 'Las devoluciones requieren conexión a internet' };
        }

        try {
            const { data, error } = await supabase.rpc('process_sale_refund', {
                p_order_id: orderId,
                p_items: items,
                p_method: method,
                p_reason: reason,
            });

            if (error) throw error;

            if (data && data.success === false) {
                return { success: false, message: data.message };
            }

            // Refrescar caja y ventas en el resto de la app
            window.dispatchEvent(new CustomEvent('cash-movement-changed'));
            window.dispatchEvent(new CustomEvent('sale-deleted'));

            return { success: true, total: data?.total, refund_id: data?.refund_id };
        } catch (err: any) {
            console.error('Error processing sale refund:', err);
            return { success: false, message: err.message || 'Error al procesar la devolución' };
        }
    }, []);

    return { processSaleRefund };
};
