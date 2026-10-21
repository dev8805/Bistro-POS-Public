/**
 * Marca de "pago en curso" para disparar el toast de agradecimiento cuando el
 * usuario vuelve a Bistro tras un pago con redirect (PSE, Botón Bancolombia).
 *
 * Escenario que resuelve:
 * - Con tarjeta / Nequi / QR el widget de Wompi se cierra inline, el callback
 *   `onApproved` corre y muestra el toast directamente.
 * - Con métodos que redirigen fuera del sitio (PSE, Botón Bancolombia) el
 *   navegador sale de la app; al volver, el callback JS ya no existe y el
 *   toast se perdería. Este flag persiste en sessionStorage para que
 *   `usePostPaymentToast()` lo detecte al montar y dispare el aviso.
 *
 * El flag caduca a los 30 minutos para evitar toasts fantasma si el pago quedó
 * abandonado o si el usuario cierra la sesión y otro empleado entra después.
 */

const FLAG_KEY = 'bistro:pendingPaymentToast';
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutos

export interface PaymentFlag {
    reference: string;
    businessId: string;
    ts: number;
}

export const markPaymentInProgress = (reference: string, businessId: string): void => {
    try {
        sessionStorage.setItem(
            FLAG_KEY,
            JSON.stringify({ reference, businessId, ts: Date.now() })
        );
    } catch {
        // sessionStorage puede fallar en modo privado; el toast solo se pierde en el redirect.
    }
};

export const clearPaymentFlag = (): void => {
    try {
        sessionStorage.removeItem(FLAG_KEY);
    } catch {
        // no-op
    }
};

export const readPaymentFlag = (): PaymentFlag | null => {
    try {
        const raw = sessionStorage.getItem(FLAG_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<PaymentFlag>;
        if (
            typeof parsed?.reference !== 'string' ||
            typeof parsed?.businessId !== 'string' ||
            typeof parsed?.ts !== 'number'
        ) {
            clearPaymentFlag();
            return null;
        }
        if (Date.now() - parsed.ts > MAX_AGE_MS) {
            clearPaymentFlag();
            return null;
        }
        return parsed as PaymentFlag;
    } catch {
        return null;
    }
};
