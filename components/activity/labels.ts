/**
 * Etiquetas y estilos compartidos para el visor de eventos (UI en español).
 */
import { AuditCategory, AuditSeverity } from '../../lib/activityMockData';

export const CATEGORY_LABELS: Record<AuditCategory, string> = {
    auth: 'Autenticación',
    sale: 'Ventas',
    cash: 'Caja',
    inventory: 'Inventario',
    expense: 'Gastos',
    product: 'Productos',
    promotion: 'Promociones',
    user: 'Usuarios',
    permission: 'Permisos',
    business_config: 'Negocio',
    printer: 'Impresora',
};

export const CATEGORY_ICONS: Record<AuditCategory, string> = {
    auth: 'login',
    sale: 'point_of_sale',
    cash: 'payments',
    inventory: 'inventory',
    expense: 'receipt_long',
    product: 'shopping_bag',
    promotion: 'sell',
    user: 'person',
    permission: 'admin_panel_settings',
    business_config: 'store',
    printer: 'print',
};

export const SEVERITY_LABELS: Record<AuditSeverity, string> = {
    info: 'Info',
    warning: 'Atención',
    critical: 'Crítico',
};

/**
 * Etiqueta legible en español para cada `action` técnica.
 * La clave (`action`) NO cambia en la BD: se usa para filtros y lógica. Esto solo
 * controla cómo se MUESTRA en el visor. Si una acción no está mapeada, se muestra
 * el valor crudo como respaldo.
 */
export const ACTION_LABELS: Record<string, string> = {
    // Autenticación
    'login.success': 'Inicio de sesión',
    'login.failed': 'Intento de acceso fallido',
    'logout': 'Cierre de sesión',
    'pin.changed': 'Cambio de PIN',
    // Ventas
    'sale.voided': 'Anulación de venta',
    'sale_item.voided': 'Anulación de producto',
    'sale.refunded': 'Devolución de venta',
    // Caja
    'cash.shift.opened': 'Apertura de caja',
    'cash.shift.closed': 'Cierre de caja',
    // Inventario
    'inventory.merma': 'Registro de merma',
    'inventory.merma.deleted': 'Eliminación de merma',
    'inventory.adjustment': 'Ajuste de inventario',
    'inventory.adjustment.reverted': 'Reversión de ajuste',
    // Gastos
    'expense.created': 'Registro de gasto',
    'expense.deleted': 'Eliminación de gasto',
    // Productos
    'product.created': 'Producto creado',
    'product.price.changed': 'Cambio de precio',
    'product.deleted': 'Producto eliminado',
    // Promociones
    'promotion.created': 'Promoción creada',
    'promotion.deleted': 'Promoción eliminada',
    // Negocio / impresora
    'business.changed': 'Cambio en el negocio',
    'printer.changed': 'Cambio de impresora',
    // Usuarios / permisos
    'user.created': 'Usuario creado',
    'user.archived': 'Usuario eliminado',
    'user.role_changed': 'Cambio de rol',
    'permissions.changed': 'Cambio de permisos',
};

/** Devuelve la etiqueta en español de una acción, o el valor crudo si no existe. */
export const labelForAction = (action: string): string => ACTION_LABELS[action] || action;

/** Clases Tailwind para el badge de severidad. */
export const SEVERITY_BADGE: Record<AuditSeverity, string> = {
    info: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300',
    warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

/** Punto de color para la severidad. */
export const SEVERITY_DOT: Record<AuditSeverity, string> = {
    info: 'bg-slate-400',
    warning: 'bg-amber-500',
    critical: 'bg-red-500',
};

export const CATEGORY_FILTER_OPTIONS: Array<{ value: AuditCategory | 'all'; label: string }> = [
    { value: 'all', label: 'Todas las categorías' },
    // 'printer' se omite a propósito: la auditoría de impresora está desactivada.
    ...(Object.keys(CATEGORY_LABELS) as AuditCategory[])
        .filter(c => c !== 'printer')
        .map(c => ({ value: c, label: CATEGORY_LABELS[c] })),
];

export const SEVERITY_FILTER_OPTIONS: Array<{ value: AuditSeverity | 'all'; label: string }> = [
    { value: 'all', label: 'Toda severidad' },
    { value: 'info', label: 'Info' },
    { value: 'warning', label: 'Atención' },
    { value: 'critical', label: 'Crítico' },
];
