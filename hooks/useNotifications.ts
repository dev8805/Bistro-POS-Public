import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export interface NotificationSetting {
    id: string;
    role_name: string;
    notify_on_confirm: boolean;
}

export function useNotifications() {
    const { profile } = useAuth();
    const [settings, setSettings] = useState<NotificationSetting[]>([]);
    const [loading, setLoading] = useState(true);

    const businessId = profile?.business_id;
    const userRole = profile?.role;

    // Fetch settings
    const fetchSettings = useCallback(async () => {
        if (!businessId) return;

        try {
            const { data, error } = await supabase
                .from('table_notification_settings')
                .select('*')
                .eq('business_id', businessId);

            if (error) {
                // If table doesn't exist yet, we might get an error, just ignore for now or log
                console.warn('Could not fetch notification settings (table might not exist yet):', error.message);
                return;
            }
            setSettings(data || []);
        } catch (err) {
            console.error('Error fetching settings:', err);
        } finally {
            setLoading(false);
        }
    }, [businessId]);

    // Update setting
    const updateSetting = async (roleName: string, enabled: boolean) => {
        if (!businessId) return;

        try {
            const { error } = await supabase
                .from('table_notification_settings')
                .upsert({
                    business_id: businessId,
                    role_name: roleName,
                    notify_on_confirm: enabled
                }, { onConflict: 'business_id,role_name' });

            if (error) throw error;

            // Optimistic update
            setSettings(prev => {
                const existing = prev.find(s => s.role_name === roleName);
                if (existing) {
                    return prev.map(s => s.role_name === roleName ? { ...s, notify_on_confirm: enabled } : s);
                }
                return [...prev, {
                    id: 'temp-' + Date.now(),
                    role_name: roleName,
                    notify_on_confirm: enabled,
                    business_id: businessId
                } as NotificationSetting];
            });

        } catch (err) {
            console.error('Error updating notification setting:', err);
            throw err;
        }
    };

    // Check if I should receive notification
    const shouldNotify = useCallback(() => {
        if (!userRole) return false;

        // Default heuristics if no settings found (optional)
        // if (settings.length === 0) return userRole === 'Cocinero' || userRole === 'Cajero';

        const setting = settings.find(s => s.role_name === userRole);
        return setting?.notify_on_confirm ?? false;
    }, [settings, userRole]);

    useEffect(() => {
        if (businessId) {
            fetchSettings();
        }
    }, [businessId, fetchSettings]);

    return {
        settings,
        updateSetting,
        shouldNotify,
        loading
    };
}
