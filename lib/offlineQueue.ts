import { saveOfflineTransaction, getPendingTransactions, removeOfflineTransaction, clearPendingTransactions } from './offlineStorage';


export type TransactionType =
    | 'sale'
    | 'delete_sale'
    | 'open_shift'
    | 'close_shift'
    | 'create_client'
    | 'client_payment'
    | 'supplier_payment'
    | 'inventory_purchase'
    | 'expense'
    | 'shrinkage'
    | 'manual_cash_in'
    | 'manual_cash_out'
    // --- Datos maestros de Mesas (modelo Usuario Eje offline) ---
    // Los siguientes tipos encolan cambios sobre mesas y salas mientras
    // el Eje opera sin conexión. Formato del payload esperado por cada tipo:
    //
    // create_table: { offlineId: 'offline_table_...', label, roomId?, seats }
    // update_table: { tableId: uuid|offline_table_*, updates: { label?, room_id?, seats? } }
    // delete_table: { tableId: uuid|offline_table_* }
    // create_room:  { offlineId: 'offline_room_...', name, description?, display_order }
    // update_room:  { roomId, updates }
    // delete_room:  { roomId }
    | 'create_room'
    | 'update_room'
    | 'delete_room'
    | 'create_table'
    | 'update_table'
    | 'delete_table';

export interface OfflineTransaction {
    id: string; // Generado localmente
    type: TransactionType;
    payload: any; // Los datos de la operación
    createdAt: string; // Timestamp crucial para sincronizar respetando el orden
    status: 'pending' | 'syncing' | 'failed';
    retryCount: number;
    businessId: string;
    userId: string;
}

const generateOfflineId = (): string =>
    `offline_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const offlineQueue = {
    async getAll(): Promise<OfflineTransaction[]> {
        return await getPendingTransactions();
    },

    async add(type: TransactionType, payload: any, businessId: string, userId: string): Promise<OfflineTransaction> {
        const tx: OfflineTransaction = {
            id: generateOfflineId(),
            type,
            payload,
            createdAt: new Date().toISOString(),
            status: 'pending',
            retryCount: 0,
            businessId,
            userId,
        };

        await saveOfflineTransaction(tx);
        window.dispatchEvent(new Event('offline-queue-updated'));
        return tx;
    },

    async remove(id: string): Promise<void> {
        await removeOfflineTransaction(id);
        window.dispatchEvent(new Event('offline-queue-updated'));
    },

    async updateStatus(id: string, status: OfflineTransaction['status']): Promise<void> {
        const all = await this.getAll();
        const tx = all.find(t => t.id === id);
        if (tx) {
            tx.status = status;
            if (status === 'failed') tx.retryCount += 1;
            await saveOfflineTransaction(tx);
            window.dispatchEvent(new Event('offline-queue-updated'));
        }
    },

    async getPendingCount(): Promise<number> {
        const all = await this.getAll();
        return all.filter(o => o.status !== 'syncing').length;
    },

    async removeFailed(): Promise<void> {
        const all = await this.getAll();
        for (const tx of all.filter((t: OfflineTransaction) => t.status === 'failed')) {
            await removeOfflineTransaction(tx.id);
        }
        window.dispatchEvent(new Event('offline-queue-updated'));
    },

    async clear(): Promise<void> {
        await clearPendingTransactions();
        window.dispatchEvent(new Event('offline-queue-updated'));
    },
};
