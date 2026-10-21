import { supabase } from './supabase';
import { KitchenCommandData } from './thermalPrinterService';

export interface PrinterPresence {
    userId: string;
    userName: string;
    role: string;
    printerConnected: boolean;
    onlineAt: string;
}

/**
 * Sends a kitchen command to a specific user's device via broadcast.
 * The target user ID is used as the event name so only that device picks it up.
 */
export const sendKitchenCommand = async (
    businessId: string,
    targetUserId: string,
    command: KitchenCommandData
): Promise<boolean> => {
    try {
        const channel = supabase.channel(`kitchen-commands-${businessId}`);

        // Subscribe briefly to be able to send
        await new Promise<void>((resolve) => {
            channel.subscribe((status) => {
                if (status === 'SUBSCRIBED') resolve();
            });
        });

        await channel.send({
            type: 'broadcast',
            event: `command-for-${targetUserId}`,
            payload: command,
        });

        // Cleanup after sending
        setTimeout(() => supabase.removeChannel(channel), 500);

        console.log('[KitchenCommand] ✅ Comanda enviada a usuario:', targetUserId);
        return true;
    } catch (err) {
        console.error('[KitchenCommand] ❌ Error enviando comanda:', err);
        return false;
    }
};

/**
 * Subscribe to kitchen commands targeted to a specific user.
 * Returns an unsubscribe function.
 */
export const subscribeToKitchenCommands = (
    businessId: string,
    userId: string,
    onCommand: (command: KitchenCommandData) => void
): (() => void) => {
    const channel = supabase
        .channel(`kitchen-commands-${businessId}`)
        .on('broadcast', { event: `command-for-${userId}` }, (payload) => {
            console.log('[KitchenCommand] 📥 Comanda recibida:', payload);
            if (payload.payload) {
                onCommand(payload.payload as KitchenCommandData);
            }
        })
        .subscribe();

    console.log('[KitchenCommand] 👂 Escuchando comandas para usuario:', userId);

    return () => {
        supabase.removeChannel(channel);
    };
};

/**
 * Join the printer presence channel to announce this device has a printer.
 * Other users can see who has printers connected.
 * Returns: { unsubscribe, channel }
 */
export const joinPrinterPresence = (
    businessId: string,
    userInfo: PrinterPresence
) => {
    const topic = `printer-presence-${businessId}`;
    console.log('📡[PRESENCE][join] Creando canal:', topic, '| usuario:', userInfo.userId, userInfo.userName, '| printerConnected:', userInfo.printerConnected);
    const channel = supabase.channel(topic, {
        config: { presence: { key: userInfo.userId } },
    });

    channel.subscribe(async (status) => {
        console.log('📡[PRESENCE][join] subscribe status:', status, '| businessId:', businessId);
        if (status === 'SUBSCRIBED') {
            const res = await channel.track(userInfo);
            console.log('📡[PRESENCE][join] ✅ track() resultado:', res, '| anunciado:', JSON.stringify(userInfo));
        }
    });

    return {
        channel,
        updatePresence: async (update: Partial<PrinterPresence>) => {
            const res = await channel.track({ ...userInfo, ...update });
            console.log('📡[PRESENCE][join] 🔄 updatePresence track:', res, update);
        },
        unsubscribe: () => {
            channel.untrack();
            supabase.removeChannel(channel);
            console.log('📡[PRESENCE][join] 🔌 Desconectado de presence');
        },
    };
};

/**
 * Subscribe to the printer presence channel to see who has printers online.
 * Used by the cashier to see available printer targets.
 * Returns: { unsubscribe, channel }
 */
export const subscribeToPrinterPresence = (
    businessId: string,
    onSync: (printers: PrinterPresence[]) => void
) => {
    const topic = `printer-presence-${businessId}`;
    console.log('📡[PRESENCE][viewer] Suscribiendo a:', topic, '| businessId:', businessId);
    const channel = supabase.channel(topic, {
        config: { presence: { key: 'viewer' } },
    });

    const computeAndEmit = (origin: string) => {
        const state = channel.presenceState<PrinterPresence>();
        console.log(`📡[PRESENCE][viewer] (${origin}) presenceState completo:`, JSON.stringify(state));
        const printers: PrinterPresence[] = [];
        Object.values(state).forEach((presences) => {
            presences.forEach((p: any) => {
                console.log('📡[PRESENCE][viewer] entrada:', p?.userId, p?.userName, '| printerConnected:', p?.printerConnected);
                if (p.printerConnected) {
                    printers.push(p as PrinterPresence);
                }
            });
        });
        console.log(`📡[PRESENCE][viewer] (${origin}) impresoras con printerConnected=true:`, printers.length, JSON.stringify(printers));
        onSync(printers);
    };

    channel
        .on('presence', { event: 'sync' }, () => computeAndEmit('sync'))
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
            console.log('📡[PRESENCE][viewer] ➕ join:', key, JSON.stringify(newPresences));
            computeAndEmit('join');
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
            console.log('📡[PRESENCE][viewer] ➖ leave:', key, JSON.stringify(leftPresences));
            computeAndEmit('leave');
        })
        .subscribe((status) => {
            console.log('📡[PRESENCE][viewer] subscribe status:', status, '| businessId:', businessId);
        });

    return {
        channel,
        unsubscribe: () => {
            console.log('📡[PRESENCE][viewer] 🔌 unsubscribe de:', topic);
            supabase.removeChannel(channel);
        },
    };
};
