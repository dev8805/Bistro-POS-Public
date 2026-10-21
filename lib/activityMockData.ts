/**
 * activityMockData
 *
 * Datos de prueba para la feature "actividad de empleados" (Fase 1, frontend).
 * Permite desarrollar y validar toda la UI (presencia + visor de eventos) sin
 * depender de la base de datos real ni afectar producción.
 *
 * En Fase 3 los hooks `useEmployeePresence` y `useAuditEvents` cambiarán de este
 * mock a consultas reales de Supabase. Los tipos aquí declarados reflejan el
 * esquema real de la tabla `audit_events` para que el cambio sea mínimo.
 */

export type AuditCategory =
    | 'auth'
    | 'sale'
    | 'cash'
    | 'inventory'
    | 'expense'
    | 'product'
    | 'promotion'
    | 'user'
    | 'permission'
    | 'business_config'
    | 'printer';

export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditEvent {
    id: string;
    business_id: string;
    user_id: string | null;
    user_name: string | null;
    user_role: string | null;
    category: AuditCategory;
    action: string;
    severity: AuditSeverity;
    description: string;
    metadata: Record<string, any>;
    created_at: string; // ISO 8601
}

export type PresenceStatus = 'activo' | 'inactivo' | 'desconectado';

export interface PresenceUser {
    user_id: string;
    user_name: string;
    user_role: string;
    device_id: string;            // resuelto a label vía useDeviceAliases.resolveLabel()
    /**
     * Sesión iniciada (espejo de profiles.is_signed_in en producción).
     * Si false → estado siempre 'desconectado'.
     */
    is_signed_in: boolean;
    /**
     * Si el cliente del empleado tiene WebSocket vivo en el canal Realtime.
     * En producción se deriva de presenceState(); en mock es explícito.
     */
    is_in_presence: boolean;
    login_at: string | null;      // ISO; null si is_signed_in=false
    last_activity_at: string | null; // ISO de última interacción humana
    cash_shift_id: string | null;
}

const MOCK_BUSINESS_ID = 'mock-business-0001';

// Helpers de tiempo relativos a "ahora" para que los estados/orden sean realistas.
const minutesAgo = (m: number): string => new Date(Date.now() - m * 60_000).toISOString();
const hoursAgo = (h: number): string => new Date(Date.now() - h * 3_600_000).toISOString();
const daysAgo = (d: number): string => new Date(Date.now() - d * 86_400_000).toISOString();

/**
 * Lista de empleados conectados (mock). Los timestamps se calculan en cada
 * llamada relativos a "ahora" para que el cálculo de estado sea consistente.
 *
 * Los `device_id` aquí coinciden con los seeded en `deviceAliasStore` para
 * que la UI muestre alias reales ("PC Mostrador", "Laptop Oficina") cuando
 * existen, y default labels ("Samsung Internet en Android") cuando no.
 *
 * Casos de prueba que cubre la lista (modelo de tres fuentes — Opción B):
 *  - Carlos: signed_in + en canal + actividad reciente → 🟢 Activo
 *  - Laura:  signed_in + en canal + actividad reciente → 🟢 Activo
 *  - María:  signed_in + en canal + sin actividad >3 min → 🟡 Inactivo
 *  - Ana:    signed_in PERO sin canal (perdió internet) → 🟡 Inactivo
 *  - Pedro:  NO signed_in (cerró sesión) → ⚪ Desconectado
 */
export const getMockPresence = (): PresenceUser[] => [
    {
        user_id: 'u-carlos',
        user_name: 'Carlos Méndez',
        user_role: 'Cajero',
        device_id: 'dev-carlos-01',
        is_signed_in: true,
        is_in_presence: true,
        login_at: hoursAgo(3),
        last_activity_at: minutesAgo(1),     // ≤3 min → activo
        cash_shift_id: 'shift-04',
    },
    {
        user_id: 'u-laura',
        user_name: 'Laura Patiño',
        user_role: 'Administrador',
        device_id: 'dev-laura-01',
        is_signed_in: true,
        is_in_presence: true,
        login_at: hoursAgo(1),
        last_activity_at: minutesAgo(2),     // ≤3 min → activo
        cash_shift_id: null,
    },
    {
        user_id: 'u-maria',
        user_name: 'María Gómez',
        user_role: 'Cajero',
        device_id: 'dev-maria-01',
        is_signed_in: true,
        is_in_presence: true,
        login_at: hoursAgo(5),
        last_activity_at: minutesAgo(12),    // >3 min → inactivo (sin actividad reciente)
        cash_shift_id: 'shift-02',
    },
    {
        user_id: 'u-ana',
        user_name: 'Ana Torres',
        user_role: 'Cajero',
        device_id: 'dev-pedro-01',           // reusa label "Safari en iOS"
        is_signed_in: true,
        is_in_presence: false,               // perdió internet → fuera del canal pero sigue logueada
        login_at: hoursAgo(2),
        last_activity_at: minutesAgo(8),
        cash_shift_id: null,
    },
    {
        user_id: 'u-pedro',
        user_name: 'Pedro Ruiz',
        user_role: 'Mesero',
        device_id: 'dev-pedro-01',
        is_signed_in: false,                  // cerró sesión → desconectado
        is_in_presence: false,
        login_at: null,
        last_activity_at: null,
        cash_shift_id: null,
    },
];

/**
 * Eventos de auditoría (mock) cubriendo todas las categorías y severidades.
 * Ordenados de más reciente a más antiguo se hace en el hook; aquí van mezclados.
 */
export const getMockAuditEvents = (): AuditEvent[] => [
    {
        id: 'ev-001',
        business_id: MOCK_BUSINESS_ID,
        user_id: 'u-carlos',
        user_name: 'Carlos Méndez',
        user_role: 'Cajero',
        category: 'sale',
        action: 'sale.voided',
        severity: 'warning',
        description: 'Anuló la venta #1247 por $52.000',
        metadata: {
            sale_id: 'order-1247',
            order_number: 1247,
            amount: 52000,
            reason: 'Cliente se arrepintió',
            device_id: 'dev-carlos-01',
        },
        created_at: minutesAgo(8),
    },
    {
        id: 'ev-002',
        business_id: MOCK_BUSINESS_ID,
        user_id: null,
        user_name: 'jose.r***@gmail.com',
        user_role: null,
        category: 'auth',
        action: 'login.failed',
        severity: 'warning',
        description: 'Intento de inicio de sesión fallido (3er intento)',
        metadata: {
            reason: 'PIN incorrecto',
            masked_identifier: '+57 *** *** 1234',
            // Dispositivo desconocido: no está en business_devices.
            // Se muestra el default derivado del UA.
            user_agent: 'Mozilla/5.0 (Linux; Android 13)',
            device_label: 'Chrome en Android (no registrado)',
        },
        created_at: minutesAgo(15),
    },
    {
        id: 'ev-003',
        business_id: MOCK_BUSINESS_ID,
        user_id: 'u-laura',
        user_name: 'Laura Patiño',
        user_role: 'Administrador',
        category: 'auth',
        action: 'login.success',
        severity: 'info',
        description: 'Inició sesión',
        metadata: {
            auth_provider: 'google_oauth',
            device_id: 'dev-laura-01',
        },
        created_at: minutesAgo(62),
    },
    {
        id: 'ev-004',
        business_id: MOCK_BUSINESS_ID,
        user_id: 'u-maria',
        user_name: 'María Gómez',
        user_role: 'Cajero',
        category: 'product',
        action: 'product.price.changed',
        severity: 'warning',
        description: 'Cambió el precio de "Coca-Cola 400ml" de $3.000 a $2.500',
        metadata: {
            product_id: 'prod-coca',
            product_name: 'Coca-Cola 400ml',
            price_before: 3000,
            price_after: 2500,
            origin: 'manual',
            device_id: 'dev-maria-01',
        },
        created_at: hoursAgo(2),
    },
    {
        id: 'ev-005',
        business_id: MOCK_BUSINESS_ID,
        user_id: 'u-carlos',
        user_name: 'Carlos Méndez',
        user_role: 'Cajero',
        category: 'inventory',
        action: 'inventory.merma',
        severity: 'warning',
        description: 'Registró merma de 3 unidades de "Pan Tajado"',
        metadata: {
            product_id: 'prod-pan',
            product_name: 'Pan Tajado',
            quantity: 3,
            amount: 6000,
            reason: 'Producto vencido',
            device_id: 'dev-carlos-01',
        },
        created_at: hoursAgo(3),
    },
    {
        id: 'ev-006',
        business_id: MOCK_BUSINESS_ID,
        user_id: 'u-carlos',
        user_name: 'Carlos Méndez',
        user_role: 'Cajero',
        category: 'cash',
        action: 'cash.shift.opened',
        severity: 'info',
        description: 'Abrió la caja #04 con base de $50.000',
        metadata: {
            cash_shift_id: 'shift-04',
            opening_balance: 50000,
            device_id: 'dev-carlos-01',
        },
        created_at: hoursAgo(3),
    },
    {
        id: 'ev-007',
        business_id: MOCK_BUSINESS_ID,
        user_id: 'u-maria',
        user_name: 'María Gómez',
        user_role: 'Cajero',
        category: 'cash',
        action: 'cash.shift.closed',
        severity: 'warning',
        description: 'Cerró la caja #02 con faltante de $8.000',
        metadata: {
            cash_shift_id: 'shift-02',
            declared_cash: 142000,
            expected_cash: 150000,
            difference: -8000,
            device_id: 'dev-maria-01',
        },
        created_at: hoursAgo(6),
    },
    {
        id: 'ev-008',
        business_id: MOCK_BUSINESS_ID,
        user_id: 'u-laura',
        user_name: 'Laura Patiño',
        user_role: 'Administrador',
        category: 'permission',
        action: 'permissions.changed',
        severity: 'critical',
        description: 'Cambió los permisos del rol "Cajero"',
        metadata: {
            target_role_id: 'role-cajero',
            before: { pos_cancel: false },
            after: { pos_cancel: true },
            device_id: 'dev-laura-01',
        },
        created_at: hoursAgo(7),
    },
    {
        id: 'ev-009',
        business_id: MOCK_BUSINESS_ID,
        user_id: 'u-laura',
        user_name: 'Laura Patiño',
        user_role: 'Administrador',
        category: 'user',
        action: 'user.role_changed',
        severity: 'critical',
        description: 'Cambió el rol de "Pedro Ruiz" de Mesero a Cajero',
        metadata: {
            target_user_id: 'u-pedro',
            target_user_name: 'Pedro Ruiz',
            before: 'Mesero',
            after: 'Cajero',
            device_id: 'dev-laura-01',
        },
        created_at: hoursAgo(9),
    },
    {
        id: 'ev-010',
        business_id: MOCK_BUSINESS_ID,
        user_id: 'u-laura',
        user_name: 'Laura Patiño',
        user_role: 'Administrador',
        category: 'business_config',
        action: 'business.changed',
        severity: 'warning',
        description: 'Modificó los datos de facturación del negocio',
        metadata: {
            before: { receipt_phone: '3001112233' },
            after: { receipt_phone: '3009998877' },
            device_id: 'dev-laura-01',
        },
        created_at: hoursAgo(20),
    },
    {
        id: 'ev-011',
        business_id: MOCK_BUSINESS_ID,
        user_id: 'u-carlos',
        user_name: 'Carlos Méndez',
        user_role: 'Cajero',
        category: 'sale',
        action: 'sale.refunded',
        severity: 'warning',
        description: 'Registró devolución de la venta #1180 por $15.000',
        metadata: {
            sale_refund_id: 'refund-09',
            sale_id: 'order-1180',
            amount: 15000,
            reason: 'Producto defectuoso',
            items: 'Yogurt Griego x1',
            device_id: 'dev-carlos-01',
        },
        created_at: daysAgo(1),
    },
    {
        id: 'ev-012',
        business_id: MOCK_BUSINESS_ID,
        user_id: 'u-laura',
        user_name: 'Laura Patiño',
        user_role: 'Administrador',
        category: 'product',
        action: 'product.deleted',
        severity: 'critical',
        description: 'Eliminó el producto "Galletas Surtidas"',
        metadata: {
            product_id: 'prod-gall',
            product_name: 'Galletas Surtidas',
            device_id: 'dev-laura-01',
        },
        created_at: daysAgo(1),
    },
    {
        id: 'ev-013',
        business_id: MOCK_BUSINESS_ID,
        user_id: 'u-carlos',
        user_name: 'Carlos Méndez',
        user_role: 'Cajero',
        category: 'expense',
        action: 'expense.created',
        severity: 'info',
        description: 'Registró un gasto de $25.000 (Transporte)',
        metadata: {
            expense_id: 'exp-33',
            amount: 25000,
            category: 'TRANSPORTE',
            payment_method: 'cash',
            device_id: 'dev-carlos-01',
        },
        created_at: daysAgo(2),
    },
    {
        id: 'ev-014',
        business_id: MOCK_BUSINESS_ID,
        user_id: 'u-laura',
        user_name: 'Laura Patiño',
        user_role: 'Administrador',
        category: 'promotion',
        action: 'promotion.created',
        severity: 'warning',
        description: 'Creó la promoción "Combo Desayuno"',
        metadata: {
            promotion_id: 'promo-01',
            name: 'Combo Desayuno',
            total_price: 12000,
            is_active: true,
            device_id: 'dev-laura-01',
        },
        created_at: daysAgo(2),
    },
    {
        id: 'ev-015',
        business_id: MOCK_BUSINESS_ID,
        user_id: null,
        user_name: 'Ana Torres',
        user_role: 'Cajero',
        category: 'user',
        action: 'user.archived',
        severity: 'critical',
        description: 'Archivó al empleado "Ana Torres"',
        metadata: {
            target_user_id: 'u-ana',
            target_user_name: 'Ana Torres',
            actor_status: 'deleted',
            device_id: 'dev-laura-01',
        },
        created_at: daysAgo(3),
    },
    {
        id: 'ev-016',
        business_id: MOCK_BUSINESS_ID,
        user_id: 'u-carlos',
        user_name: 'Carlos Méndez',
        user_role: 'Cajero',
        category: 'printer',
        action: 'printer.changed',
        severity: 'info',
        description: 'Cambió la impresora predeterminada',
        metadata: {
            before: { receipt_paper_width: '58mm' },
            after: { receipt_paper_width: '80mm' },
            device_id: 'dev-carlos-01',
        },
        created_at: daysAgo(4),
    },
];

export const MOCK_PRESENCE_BUSINESS_ID = MOCK_BUSINESS_ID;
