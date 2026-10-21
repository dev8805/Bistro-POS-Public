/**
 * Helper para inyectar movimientos de caja falsos en el caché localStorage
 * cuando operaciones offline afectan el balance (ventas, gastos, abonos, etc.)
 */

export interface LocalCashMovement {
    id: string;
    shift_id: string;
    created_by: string;
    type: 'cash_in' | 'cash_out' | 'sale' | 'expense' | 'purchase' | 'refund';
    amount: number;
    description: string;
    payment_method?: string;
    created_at: string;
}

/**
 * Inyecta un movimiento falso en el cache localStorage de movimientos del turno activo.
 * Si no se proporciona shift_id, lo resuelve desde el cache del turno activo.
 */
export const pushOfflineCashMovement = (
    businessId: string,
    movement: Omit<LocalCashMovement, 'id' | 'created_at' | 'shift_id'> & { shift_id?: string }
) => {
    try {
        // Resolver shift_id
        let shiftId = movement.shift_id;
        if (!shiftId) {
            const shiftCached = localStorage.getItem(`bistro_active_shift_${businessId}`);
            if (shiftCached) {
                const shift = JSON.parse(shiftCached);
                shiftId = shift?.id;
            }
        }
        if (!shiftId) return; // Sin turno activo, no aplica

        const key = `bistro_active_movements_${businessId}`;
        const cached = localStorage.getItem(key);
        const existing: LocalCashMovement[] = cached ? JSON.parse(cached) : [];

        const newMovement: LocalCashMovement = {
            ...movement,
            shift_id: shiftId,
            id: `offline_mov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            created_at: new Date().toISOString(),
            description: `${movement.description} (Offline)`,
        };

        localStorage.setItem(key, JSON.stringify([newMovement, ...existing]));
        window.dispatchEvent(new CustomEvent('offline-cash-updated', { detail: { businessId } }));
    } catch {
        // Si falla el localStorage, ignorar silenciosamente
    }
};
