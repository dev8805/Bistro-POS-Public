import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { SUPABASE_URL } from '../src/config/wompi';

interface TimeRemaining {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    total: number;
}

export const SubscriptionCountdown: React.FC = () => {
    const { subscriptionEndDate, checkSubscription } = useAuth();
    const [timeRemaining, setTimeRemaining] = useState<TimeRemaining | null>(null);
    const [isExpired, setIsExpired] = useState(false);
    const [isCharging, setIsCharging] = useState(false);

    // Trigger automatic charge when trial expires
    const triggerAutoCharge = useCallback(async () => {
        if (isCharging) return;
        setIsCharging(true);

        console.log('[Countdown] Triggering auto-charge for expired trial');

        try {
            const response = await fetch(`${SUPABASE_URL}/functions/v1/charge-trial-subscription`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            const result = await response.json();
            console.log('[Countdown] Auto-charge result:', result);

            // Wait a moment then check subscription status
            setTimeout(() => {
                checkSubscription();
                setIsCharging(false);
            }, 2000);

        } catch (error) {
            console.error('[Countdown] Auto-charge error:', error);
            setIsCharging(false);
        }
    }, [isCharging, checkSubscription]);

    useEffect(() => {
        if (!subscriptionEndDate) {
            setTimeRemaining(null);
            return;
        }

        const calculateTimeRemaining = (): TimeRemaining => {
            const now = new Date();
            const total = subscriptionEndDate.getTime() - now.getTime();

            if (total <= 0) {
                return { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 };
            }

            const seconds = Math.floor((total / 1000) % 60);
            const minutes = Math.floor((total / 1000 / 60) % 60);
            const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
            const days = Math.floor(total / (1000 * 60 * 60 * 24));

            return { days, hours, minutes, seconds, total };
        };

        // Initial calculation
        const initialTime = calculateTimeRemaining();
        setTimeRemaining(initialTime);
        setIsExpired(initialTime.total <= 0);

        // Update every second
        const interval = setInterval(() => {
            const time = calculateTimeRemaining();
            setTimeRemaining(time);

            if (time.total <= 0 && !isExpired) {
                setIsExpired(true);
                // Trigger automatic charge for card-required plans
                triggerAutoCharge();
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [subscriptionEndDate, isExpired, triggerAutoCharge]);


    if (!subscriptionEndDate || !timeRemaining) {
        return null;
    }

    // No mostrar contador para suscripciones con más de 365 días (acceso ilimitado)
    const MS_IN_YEAR = 365 * 24 * 60 * 60 * 1000;
    if (timeRemaining.total > MS_IN_YEAR) {
        return null;
    }

    // Format time for display
    const formatTime = (value: number): string => value.toString().padStart(2, '0');

    // Determine urgency level for styling
    const isUrgent = timeRemaining.total <= 5 * 60 * 1000; // Less than 5 minutes
    const isWarning = timeRemaining.total <= 30 * 60 * 1000; // Less than 30 minutes

    if (isExpired) {
        return (
            <div className="fixed top-4 right-4 z-[100] bg-red-500/95 backdrop-blur-sm text-white px-4 py-3 rounded-lg shadow-lg border border-red-400 flex items-center gap-3 animate-pulse">
                <span className="material-symbols-outlined text-xl">error</span>
                <div>
                    <p className="font-bold text-sm">Suscripción Expirada</p>
                    <p className="text-xs opacity-90">Renueva para continuar</p>
                </div>
            </div>
        );
    }

    return (
        <div className={`fixed top-4 right-4 z-[100] backdrop-blur-sm px-4 py-3 rounded-lg shadow-lg border flex items-center gap-3 transition-all ${isUrgent
            ? 'bg-red-500/90 border-red-400 text-white animate-pulse'
            : isWarning
                ? 'bg-yellow-500/90 border-yellow-400 text-slate-900'
                : 'bg-slate-800/90 border-slate-700 text-white'
            }`}>
            <span className={`material-symbols-outlined text-xl ${isUrgent ? 'animate-bounce' : ''}`}>
                {isUrgent ? 'warning' : 'timer'}
            </span>
            <div>
                <p className={`text-xs ${isUrgent ? 'text-white/90' : isWarning ? 'text-slate-700' : 'text-slate-400'}`}>
                    Tiempo restante
                </p>
                <div className="flex items-center gap-1 font-mono font-bold text-lg">
                    {timeRemaining.days > 0 && (
                        <>
                            <span>{timeRemaining.days}d</span>
                            <span className="opacity-50">:</span>
                        </>
                    )}
                    <span>{formatTime(timeRemaining.hours)}</span>
                    <span className="opacity-50 animate-pulse">:</span>
                    <span>{formatTime(timeRemaining.minutes)}</span>
                    <span className="opacity-50 animate-pulse">:</span>
                    <span>{formatTime(timeRemaining.seconds)}</span>
                </div>
            </div>
        </div>
    );
};

export default SubscriptionCountdown;
