import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBusinessSettings } from '../hooks/useBusinessSettings';
import {
    joinPrinterPresence,
    subscribeToKitchenCommands,
    subscribeToPrinterPresence,
    PrinterPresence,
} from '../lib/kitchenCommandService';
import {
    KitchenCommandData,
    printKitchenCommandDirect,
    getPrinterStatus,
    onPrinterStatusChange,
    reconnectPrinter,
} from '../lib/thermalPrinterService';

/**
 * Hook for devices with printers. Announces presence and auto-prints commands.
 */
export function useKitchenPrinter() {
    const { profile } = useAuth();
    const { receiptPaperWidth, isKitchenEnabled } = useBusinessSettings();
    const [lastCommand, setLastCommand] = useState<KitchenCommandData | null>(null);
    const [commandCount, setCommandCount] = useState(0);
    const presenceRef = useRef<ReturnType<typeof joinPrinterPresence> | null>(null);
    const commandUnsubRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (!isKitchenEnabled) return;
        const businessId = profile?.business_id;
        const userId = profile?.id;
        if (!businessId || !userId) return;

        const printerConnected = getPrinterStatus() === 'connected';
        console.log('🖨️[useKitchenPrinter] businessId:', businessId, '| userId:', userId, '| printerConnected:', printerConnected);

        // Only join presence and listen if printer is connected
        if (printerConnected) {
            // Announce this device has a printer
            presenceRef.current = joinPrinterPresence(businessId, {
                userId,
                userName: profile.full_name || 'Sin nombre',
                role: profile.role || 'Cajero',
                printerConnected: true,
                onlineAt: new Date().toISOString(),
            });

            // Listen for commands targeted to this user
            commandUnsubRef.current = subscribeToKitchenCommands(businessId, userId, async (command) => {
                setLastCommand(command);
                setCommandCount(prev => prev + 1);
                await printKitchenCommandDirect(command, receiptPaperWidth);
            });
        }

        // Listen for printer status changes to update presence
        const unsubStatus = onPrinterStatusChange((status) => {
            if (status === 'connected' && !presenceRef.current) {
                presenceRef.current = joinPrinterPresence(businessId, {
                    userId,
                    userName: profile.full_name || 'Sin nombre',
                    role: profile.role || 'Cajero',
                    printerConnected: true,
                    onlineAt: new Date().toISOString(),
                });

                commandUnsubRef.current = subscribeToKitchenCommands(businessId, userId, async (command) => {
                    setLastCommand(command);
                    setCommandCount(prev => prev + 1);
                    await printKitchenCommandDirect(command, receiptPaperWidth);
                });
            } else if (status === 'disconnected' && presenceRef.current) {
                presenceRef.current.unsubscribe();
                presenceRef.current = null;
                commandUnsubRef.current?.();
                commandUnsubRef.current = null;
            }
        });

        // Si este equipo ya tenía una impresora guardada pero aún no está
        // conectada (recién cargó la app), reconectamos en segundo plano para
        // que se anuncie en presence sin necesidad de abrir una pantalla
        // concreta. El listener de arriba se encargará de unirse al presence.
        if (!printerConnected) {
            reconnectPrinter().catch(() => { /* sin impresora guardada o QZ no disponible */ });
        }

        return () => {
            unsubStatus();
            presenceRef.current?.unsubscribe();
            presenceRef.current = null;
            commandUnsubRef.current?.();
            commandUnsubRef.current = null;
        };
    }, [profile?.business_id, profile?.id, profile?.full_name, profile?.role, receiptPaperWidth, isKitchenEnabled]);

    return { lastCommand, commandCount };
}

/**
 * Hook for the cashier. Watches which users have printers online.
 */
export function useAvailablePrinters() {
    const { profile } = useAuth();
    const [printers, setPrinters] = useState<PrinterPresence[]>([]);
    const subRef = useRef<ReturnType<typeof subscribeToPrinterPresence> | null>(null);

    useEffect(() => {
        const businessId = profile?.business_id;
        if (!businessId) return;

        console.log('👀[useAvailablePrinters] Suscribiendo presencia | businessId:', businessId, '| selfUserId:', profile?.id);

        subRef.current = subscribeToPrinterPresence(businessId, (onlinePrinters) => {
            // Exclude self
            const others = onlinePrinters.filter(p => p.userId !== profile?.id);
            console.log('👀[useAvailablePrinters] onSync recibidas:', onlinePrinters.length, '| tras excluir self:', others.length, JSON.stringify(others));
            setPrinters(others);
        });

        return () => {
            subRef.current?.unsubscribe();
            subRef.current = null;
        };
    }, [profile?.business_id, profile?.id]);

    return printers;
}
