/**
 * useOrders - Hook especializado para gestión de órdenes
 * 
 * Wrapper sobre useSales que expone funciones de alto nivel
 * para crear, listar y gestionar órdenes completas.
 * 
 * Uso: SalesScreen, reportes, dashboard
 */

import { useSales, Order, OrderItem, CreateOrderData } from './useSales';

// Re-exportar tipos para conveniencia
export type { Order, OrderItem, CreateOrderData };

export const useOrders = () => {
    const {
        orders,
        loading,
        error,
        createOrder,
        deleteOrder,
        voidOrder,
        deleteOrderItem,
        voidOrderItem,
        updateOrderItem,
        confirmOrder,
        refetch: fetchOrders
    } = useSales();

    return {
        // Estado
        orders,
        loading,
        error,

        // Operaciones
        createOrder,
        deleteOrder,
        voidOrder,
        deleteOrderItem,
        voidOrderItem,
        updateOrderItem,
        confirmOrder,
        fetchOrders
    };
};
