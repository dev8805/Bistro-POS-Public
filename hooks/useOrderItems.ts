/**
 * useOrderItems - Hook especializado para operaciones de items de órdenes
 * 
 * Wrapper sobre useSales que expone solo las funciones relacionadas
 * con la gestión de items dentro de una orden.
 * 
 * Uso: App.tsx y cualquier componente que maneje items del carrito
 */

import { useSales } from './useSales';

export const useOrderItems = () => {
    const {
        addItemToOrder,
        addItemToOrderById,
        removeOrderItem,
        removeOrderItemById,
        updateOrderItemQuantity,
        updateOrderItemQuantityById,
        syncOrderItems,
        fetchTableOrder
    } = useSales();

    return {
        // Operaciones por Table ID (mesa)
        addItemToOrder,
        removeOrderItem,
        updateOrderItemQuantity,
        fetchTableOrder,

        // Operaciones por Order ID (delivery/takeaway)
        addItemToOrderById,
        removeOrderItemById,
        updateOrderItemQuantityById,
        syncOrderItems
    };
};
