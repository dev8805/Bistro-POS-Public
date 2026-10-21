import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface BusinessSettings {
    kitchen_enabled: boolean;
    is_tables_enabled: boolean;
    catalog_mode_enabled: boolean;
    comanda_label_shortcut_enabled: boolean;
    pound_in_grams: number;
    code: string | null;
    name: string;
    phone: string | null;
    address: string | null;
    payment_methods: string[];
    payment_method_categories: Record<string, string>;
    timezone: string;
    nit: string | null;
    receipt_paper_width: '58mm' | '80mm';
    receipt_business_name: string | null;
    receipt_phone: string | null;
    receipt_address: string | null;
    logo_url: string | null;
    owner_id: string | null;
    payroll_concepts: string[];
    employee_roles: string[];
}

interface BusinessSettingsContextValue {
    isKitchenEnabled: boolean;
    setKitchenEnabled: (enabled: boolean) => Promise<void>;
    isTablesEnabled: boolean;
    setTablesEnabled: (enabled: boolean) => Promise<void>;
    isCatalogModeEnabled: boolean;
    setCatalogModeEnabled: (enabled: boolean) => Promise<void>;
    isComandaLabelShortcutEnabled: boolean;
    setComandaLabelShortcutEnabled: (enabled: boolean) => Promise<void>;
    poundInGrams: number;
    setPoundInGrams: (value: number) => Promise<void>;
    loading: boolean;
    refetch: () => Promise<void>;
    businessCode: string | null;
    businessName: string;
    businessPhone: string | null;
    businessAddress: string | null;
    paymentMethods: string[];
    updatePaymentMethods: (methods: string[]) => Promise<void>;
    paymentMethodCategories: Record<string, string>;
    updatePaymentMethodCategories: (categories: Record<string, string>) => Promise<void>;
    timezone: string;
    businessNit: string | null;
    updateNit: (nit: string) => Promise<void>;
    receiptPaperWidth: '58mm' | '80mm';
    updateReceiptPaperWidth: (width: '58mm' | '80mm') => Promise<void>;
    receiptBusinessName: string | null;
    receiptPhone: string | null;
    receiptAddress: string | null;
    updateReceiptInfo: (info: { receipt_business_name?: string; receipt_phone?: string; receipt_address?: string }) => Promise<void>;
    updateReceiptSettings: (data: { nit: string; receipt_business_name: string; receipt_phone: string; receipt_address: string }) => Promise<void>;
    logoUrl: string | null;
    updateLogoUrl: (url: string | null) => Promise<void>;
    payrollConcepts: string[];
    updatePayrollConcepts: (concepts: string[]) => Promise<void>;
    employeeRoles: string[];
    updateEmployeeRoles: (roles: string[]) => Promise<void>;
    // Solo el dueño del negocio (businesses.owner_id) puede editar los datos del
    // negocio en la BD (RLS). Sirve para mostrar la facturación en solo lectura al resto.
    isOwner: boolean;
}

const CACHE_KEY = 'bistro_business_settings';

const getCachedSettings = (): BusinessSettings => {
    const defaultSettings: BusinessSettings = {
        kitchen_enabled: true,
        is_tables_enabled: true,
        catalog_mode_enabled: false,
        comanda_label_shortcut_enabled: true,
        pound_in_grams: 500,
        code: null,
        name: '',
        phone: null,
        address: null,
        payment_methods: ['Efectivo', 'Tarjeta', 'Nequi', 'Daviplata', 'Transferencia', 'Otro'],
        payment_method_categories: {},
        timezone: 'America/Bogota',
        nit: null,
        receipt_paper_width: '80mm',
        receipt_business_name: null,
        receipt_phone: null,
        receipt_address: null,
        logo_url: null,
        owner_id: null,
        payroll_concepts: ['Sueldo', 'Vale', 'Turno', 'Horas Extra'],
        employee_roles: [
            'Mesero',
            'Cocinero',
            'Lavaplatos',
            'Ayudante de cocina',
            'Cajero',
            'Barman',
            'Servicios generales',
            'Domiciliario',
            'Administrador'
        ],
    };

    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            return { ...defaultSettings, ...parsed }; // Merge to ensure defaults aren't missed
        }
    } catch { }

    return defaultSettings;
};

const BusinessSettingsContext = createContext<BusinessSettingsContextValue | null>(null);

export const BusinessSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { profile } = useAuth();
    const [settings, setSettings] = useState<BusinessSettings>(getCachedSettings());
    const [loading, setLoading] = useState(true);

    const businessId = profile?.business_id;

    const fetchSettings = useCallback(async () => {
        if (!businessId) {
            setLoading(false);
            return;
        }

        try {
            const { data, error } = await supabase
                .from('businesses')
                .select('kitchen_enabled, is_tables_enabled, catalog_mode_enabled, comanda_label_shortcut_enabled, pound_in_grams, public_id, name, phone, address, payment_methods, payment_method_categories, timezone, nit, receipt_paper_width, receipt_business_name, receipt_phone, receipt_address, logo_url, owner_id, payroll_concepts, employee_roles')
                .eq('id', businessId)
                .single();

            if (error) throw error;

            const methods = data?.payment_methods ?? ['Efectivo', 'Tarjeta', 'Nequi', 'Daviplata', 'Transferencia', 'Otro'];

            const newSettings = {
                kitchen_enabled: data?.kitchen_enabled ?? true,
                is_tables_enabled: data?.is_tables_enabled ?? true,
                catalog_mode_enabled: data?.catalog_mode_enabled ?? false,
                comanda_label_shortcut_enabled: data?.comanda_label_shortcut_enabled ?? true,
                pound_in_grams: data?.pound_in_grams ?? 500,
                code: data?.public_id ?? null,
                name: data?.name ?? '',
                phone: data?.phone ?? null,
                address: data?.address ?? null,
                payment_methods: methods,
                payment_method_categories: data?.payment_method_categories ?? {},
                timezone: data?.timezone ?? 'America/Bogota',
                nit: data?.nit ?? null,
                receipt_paper_width: data?.receipt_paper_width ?? '80mm',
                receipt_business_name: data?.receipt_business_name ?? null,
                receipt_phone: data?.receipt_phone ?? null,
                receipt_address: data?.receipt_address ?? null,
                logo_url: data?.logo_url ?? null,
                owner_id: data?.owner_id ?? null,
                payroll_concepts: data?.payroll_concepts ?? ['Sueldo', 'Vale', 'Turno', 'Horas Extra'],
                employee_roles: data?.employee_roles ?? [
                    'Mesero',
                    'Cocinero',
                    'Lavaplatos',
                    'Ayudante de cocina',
                    'Cajero',
                    'Barman',
                    'Servicios generales',
                    'Domiciliario',
                    'Administrador'
                ],
            };

            setSettings(newSettings);

            try { localStorage.setItem(CACHE_KEY, JSON.stringify(newSettings)); } catch { }
        } catch (err) {
            console.error('Error fetching business settings:', err);
        } finally {
            setLoading(false);
        }
    }, [businessId]);

    const setKitchenEnabled = useCallback(async (enabled: boolean) => {
        if (!businessId) return;
        try {
            const { error } = await supabase
                .from('businesses')
                .update({ kitchen_enabled: enabled })
                .eq('id', businessId);
            if (error) throw error;
            setSettings(prev => ({ ...prev, kitchen_enabled: enabled }));
        } catch (err) {
            console.error('Error updating kitchen setting:', err);
            throw err;
        }
    }, [businessId]);

    const setTablesEnabled = useCallback(async (enabled: boolean) => {
        if (!businessId) return;
        try {
            const { error } = await supabase
                .from('businesses')
                .update({ is_tables_enabled: enabled })
                .eq('id', businessId);
            if (error) throw error;
            setSettings(prev => ({ ...prev, is_tables_enabled: enabled }));
        } catch (err) {
            console.error('Error updating tables setting:', err);
            throw err;
        }
    }, [businessId]);

    const setCatalogModeEnabled = useCallback(async (enabled: boolean) => {
        if (!businessId) return;
        try {
            const { error } = await supabase
                .from('businesses')
                .update({ catalog_mode_enabled: enabled })
                .eq('id', businessId);
            if (error) throw error;
            setSettings(prev => ({ ...prev, catalog_mode_enabled: enabled }));
        } catch (err) {
            console.error('Error updating catalog mode setting:', err);
            throw err;
        }
    }, [businessId]);

    const setComandaLabelShortcutEnabled = useCallback(async (enabled: boolean) => {
        if (!businessId) return;
        try {
            const { error } = await supabase
                .from('businesses')
                .update({ comanda_label_shortcut_enabled: enabled })
                .eq('id', businessId);
            if (error) throw error;
            setSettings(prev => ({ ...prev, comanda_label_shortcut_enabled: enabled }));
        } catch (err) {
            console.error('Error updating comanda label shortcut setting:', err);
            throw err;
        }
    }, [businessId]);

    const setPoundInGrams = useCallback(async (value: number) => {
        if (!businessId) return;
        try {
            const { error } = await supabase
                .from('businesses')
                .update({ pound_in_grams: value })
                .eq('id', businessId);
            if (error) throw error;
            setSettings(prev => ({ ...prev, pound_in_grams: value }));
        } catch (err) {
            console.error('Error updating pound setting:', err);
            throw err;
        }
    }, [businessId]);

    const updatePaymentMethods = useCallback(async (methods: string[]) => {
        if (!businessId) return;

        setSettings(prev => {
            const next = { ...prev, payment_methods: methods };
            try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { }
            return next;
        });

        try {
            const { error, data } = await supabase
                .from('businesses')
                .update({ payment_methods: methods })
                .eq('id', businessId)
                .select('id'); // Pedimos SELECT para verificar si el update pasó RLS

            if (error) {
                throw error;
            }

            if (!data || data.length === 0) {
                throw new Error("Sin permisos para actualizar el negocio o no encontrado (RLS restrictivo).");
            }
        } catch (err) {
            console.error('Error updating payment methods:', err);
            // Hacer rollback manual si hubo un error (no tenemos el previous absoluto sino del estado actual refetch)
            setSettings(prev => {
                const arr = [...prev.payment_methods]; // Un pequeño hack: en un rollback forzamos recarga
                return prev;
            });
            // Mejor forzar refetch
            fetchSettings();
        }
    }, [businessId, fetchSettings]);

    const updatePaymentMethodCategories = useCallback(async (categories: Record<string, string>) => {
        if (!businessId) return;
        setSettings(prev => {
            const next = { ...prev, payment_method_categories: categories };
            try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { }
            return next;
        });
        try {
            const { error } = await supabase
                .from('businesses')
                .update({ payment_method_categories: categories })
                .eq('id', businessId);
            if (error) throw error;
        } catch (err) {
            console.error('Error updating payment method categories:', err);
            fetchSettings();
        }
    }, [businessId, fetchSettings]);

    const updateNit = useCallback(async (nit: string) => {
        if (!businessId) return;
        try {
            const { error } = await supabase
                .from('businesses')
                .update({ nit: nit || null })
                .eq('id', businessId);
            if (error) throw error;
            setSettings(prev => ({ ...prev, nit: nit || null }));
        } catch (err) {
            console.error('Error updating NIT:', err);
            throw err;
        }
    }, [businessId]);

    const updateReceiptPaperWidth = useCallback(async (width: '58mm' | '80mm') => {
        if (!businessId) return;
        try {
            const { error } = await supabase
                .from('businesses')
                .update({ receipt_paper_width: width })
                .eq('id', businessId);
            if (error) throw error;
            setSettings(prev => ({ ...prev, receipt_paper_width: width }));
        } catch (err) {
            console.error('Error updating receipt paper width:', err);
            throw err;
        }
    }, [businessId]);

    const updateReceiptInfo = useCallback(async (info: { receipt_business_name?: string; receipt_phone?: string; receipt_address?: string }) => {
        if (!businessId) return;
        const update: Record<string, string | null> = {};
        if (info.receipt_business_name !== undefined) update.receipt_business_name = info.receipt_business_name || null;
        if (info.receipt_phone !== undefined) update.receipt_phone = info.receipt_phone || null;
        if (info.receipt_address !== undefined) update.receipt_address = info.receipt_address || null;
        try {
            const { error } = await supabase
                .from('businesses')
                .update(update)
                .eq('id', businessId);
            if (error) throw error;
            setSettings(prev => ({ ...prev, ...update }));
        } catch (err) {
            console.error('Error updating receipt info:', err);
            throw err;
        }
    }, [businessId]);

    const updateReceiptSettings = useCallback(async (data: { nit: string; receipt_business_name: string; receipt_phone: string; receipt_address: string }) => {
        if (!businessId) return;
        const update = {
            nit: data.nit || null,
            receipt_business_name: data.receipt_business_name || null,
            receipt_phone: data.receipt_phone || null,
            receipt_address: data.receipt_address || null,
        };
        try {
            const { error } = await supabase
                .from('businesses')
                .update(update)
                .eq('id', businessId);
            if (error) throw error;
            setSettings(prev => ({ ...prev, ...update }));
        } catch (err) {
            console.error('Error updating receipt settings:', err);
            throw err;
        }
    }, [businessId]);

    const updateLogoUrl = useCallback(async (url: string | null) => {
        if (!businessId) return;
        try {
            const { error } = await supabase
                .from('businesses')
                .update({ logo_url: url })
                .eq('id', businessId);
            if (error) throw error;
            setSettings(prev => ({ ...prev, logo_url: url }));
        } catch (err) {
            console.error('Error updating logo:', err);
            throw err;
        }
    }, [businessId]);

    const updatePayrollConcepts = useCallback(async (concepts: string[]) => {
        if (!businessId) return;
        try {
            const { error } = await supabase
                .from('businesses')
                .update({ payroll_concepts: concepts })
                .eq('id', businessId);
            if (error) throw error;
            setSettings(prev => {
                const next = { ...prev, payroll_concepts: concepts };
                try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { }
                return next;
            });
        } catch (err) {
            console.error('Error updating payroll concepts:', err);
            throw err;
        }
    }, [businessId]);

    const updateEmployeeRoles = useCallback(async (roles: string[]) => {
        if (!businessId) return;
        try {
            const { error } = await supabase
                .from('businesses')
                .update({ employee_roles: roles })
                .eq('id', businessId);
            if (error) throw error;
            setSettings(prev => {
                const next = { ...prev, employee_roles: roles };
                try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch { }
                return next;
            });
        } catch (err) {
            console.error('Error updating employee roles:', err);
            throw err;
        }
    }, [businessId]);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const value: BusinessSettingsContextValue = {
        isKitchenEnabled: settings.kitchen_enabled,
        setKitchenEnabled,
        isTablesEnabled: settings.is_tables_enabled,
        setTablesEnabled,
        isCatalogModeEnabled: settings.catalog_mode_enabled,
        setCatalogModeEnabled,
        isComandaLabelShortcutEnabled: settings.comanda_label_shortcut_enabled,
        setComandaLabelShortcutEnabled,
        poundInGrams: settings.pound_in_grams,
        setPoundInGrams,
        loading,
        refetch: fetchSettings,
        businessCode: settings.code,
        businessName: settings.name,
        businessPhone: settings.phone,
        businessAddress: settings.address,
        paymentMethods: settings.payment_methods,
        updatePaymentMethods,
        paymentMethodCategories: settings.payment_method_categories,
        updatePaymentMethodCategories,
        timezone: settings.timezone,
        businessNit: settings.nit,
        updateNit,
        receiptPaperWidth: settings.receipt_paper_width,
        updateReceiptPaperWidth,
        receiptBusinessName: settings.receipt_business_name,
        receiptPhone: settings.receipt_phone,
        receiptAddress: settings.receipt_address,
        updateReceiptInfo,
        updateReceiptSettings,
        logoUrl: settings.logo_url,
        updateLogoUrl,
        payrollConcepts: settings.payroll_concepts,
        updatePayrollConcepts,
        employeeRoles: settings.employee_roles,
        updateEmployeeRoles,
        isOwner: !!settings.owner_id && profile?.id === settings.owner_id,
    };

    return (
        <BusinessSettingsContext.Provider value={value}>
            {children}
        </BusinessSettingsContext.Provider>
    );
};

export const useBusinessSettings = () => {
    const context = useContext(BusinessSettingsContext);
    if (!context) {
        throw new Error('useBusinessSettings must be used within a BusinessSettingsProvider');
    }
    return context;
};
