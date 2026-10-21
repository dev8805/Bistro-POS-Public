export const formatCurrency = (value: number): string => {
    return value.toLocaleString('es-CO', { maximumFractionDigits: 0 });
};

export const capitalizeWords = (str: string): string => {
    return str
        .toLowerCase()
        .split(' ')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};

export const formatQty = (n: number): string => {
    const rounded = Math.round(n * 100) / 100;
    return rounded.toString().replace('.', ',');
};

/**
 * Correos sintéticos que Bistro genera internamente para cuentas creadas por
 * teléfono (formato `{telefono}@bistro.temp`). Son necesarios para Supabase Auth
 * pero NUNCA deben mostrarse en la interfaz ni tratarse como un correo real.
 */
export const isPlaceholderEmail = (email?: string | null): boolean => {
    if (!email) return false;
    return /@bistro\.temp$/i.test(email.trim());
};

/**
 * Devuelve el correo real del usuario o una cadena vacía si solo tiene el
 * correo temporal interno. Usar en toda la UI para decidir si mostrar el correo
 * o el botón "Agregar correo".
 */
export const getRealEmail = (email?: string | null): string => {
    if (!email || isPlaceholderEmail(email)) return '';
    return email.trim();
};

export const isValidEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
};
