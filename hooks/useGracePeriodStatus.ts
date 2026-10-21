import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

/**
 * Devuelve el estado del período de gracia post-vencimiento (48h).
 * Se usa en `GracePeriodBanner` para el render y en `App.tsx` para reservar
 * espacio en el layout con un padding-top mientras el banner esté visible.
 *
 * `isInGrace` es true solo cuando la suscripción está vencida pero aún dentro
 * de las 48 horas de gracia (`hasActiveSubscription = true` + endDate <= now).
 */
export const useGracePeriodStatus = () => {
    const { hasActiveSubscription, subscriptionEndDate } = useAuth();
    const [isInGrace, setIsInGrace] = useState(false);
    const [hoursLeft, setHoursLeft] = useState(48);

    useEffect(() => {
        if (!hasActiveSubscription || !subscriptionEndDate) {
            setIsInGrace(false);
            return;
        }

        const endDate = new Date(subscriptionEndDate);
        const now = new Date();
        const hoursOverdue = (now.getTime() - endDate.getTime()) / (1000 * 60 * 60);

        if (hoursOverdue > 0 && hoursOverdue <= 48) {
            setIsInGrace(true);
            setHoursLeft(Math.ceil(Math.max(0, 48 - hoursOverdue)));
        } else {
            setIsInGrace(false);
        }
    }, [hasActiveSubscription, subscriptionEndDate]);

    return {
        isInGrace,
        hoursLeft,
        isUrgent: isInGrace && hoursLeft <= 24,
    };
};
