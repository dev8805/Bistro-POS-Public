/**
 * Wompi Payment Integration Configuration (Production)
 * 
 * This file centralizes all Wompi-related constants to avoid hardcoded values
 * and ensure consistency across the application.
 */

// Production Public Key
export const WOMPI_PUBLIC_KEY = "pub_prod_SBOikcfiz2DnChtvAPpSchII3DYeHNIY";

// Wompi Widget Script URL
export const WOMPI_WIDGET_URL = "https://checkout.wompi.co/widget.js";

// Supabase Configuration
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://hjjmwipqquynjopkswvu.supabase.co";

/**
 * Load Wompi Widget Script
 * Returns a promise that resolves when the script is loaded
 */
export const loadWompiWidget = (): Promise<void> => {
    return new Promise((resolve, reject) => {
        // Check if already loaded
        if (document.getElementById('wompi-widget-script')) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.id = 'wompi-widget-script';
        script.src = WOMPI_WIDGET_URL;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Error cargando el widget de Wompi'));
        document.head.appendChild(script);
    });
};

// Wompi Widget Types
export interface WompiConfig {
    currency: string;
    amountInCents: number;
    reference: string;
    publicKey: string;
    signature: { integrity: string };
    redirectUrl?: string;
    customerData?: {
        email: string;
        fullName: string;
        phoneNumber?: string;
        phoneNumberPrefix?: string;
    };
}

export interface WompiWidget {
    open: (callback: (result: WompiResult) => void) => void;
}

export interface WompiResult {
    transaction: {
        id: string;
        status: 'APPROVED' | 'DECLINED' | 'VOIDED' | 'ERROR' | 'PENDING';
        statusMessage?: string;
        reference: string;
        amountInCents: number;
        paymentMethodType: string;
    };
}

declare global {
    interface Window {
        WidgetCheckout: new (config: WompiConfig) => WompiWidget;
    }
}
