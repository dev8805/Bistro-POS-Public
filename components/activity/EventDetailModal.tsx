import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AuditEvent } from '../../lib/activityMockData';
import { supabase } from '../../lib/supabase';
import { formatDateTimeInTz } from '../../lib/timezone';
import { CATEGORY_LABELS, SEVERITY_BADGE, SEVERITY_LABELS, labelForAction } from './labels';
import { formatCurrency, formatQty } from '../../lib/formatters';

interface EventDetailModalProps {
    event: AuditEvent | null;
    timezone: string;
    onClose: () => void;
    onViewSale?: (saleId: string) => void;
    onViewReport?: (userId: string) => void;
    onViewShiftReport?: (shiftId: string) => void;
    onFilterByEmployee?: (userId: string) => void;
}

// Campos de metadata que NO mostramos como fila genérica (se muestran aparte o son ruido).
// `sale_id`/`order_item_id`/`cash_shift_id` son UUIDs internos. `order_number`/
// `display_number` y `register_name` son redundantes con el título.
// `sale_id` se sigue usando para el botón "Ver venta" (se lee directo de metadata).
const HIDDEN_META_KEYS = new Set(['actor_status', 'device_id', 'user_agent', 'sale_id', 'order_item_id', 'order_number', 'display_number', 'cash_shift_id', 'register_name', 'note']);

const prettyKey = (k: string): string => {
    const map: Record<string, string> = {
        sale_id: 'Venta',
        order_number: 'N° orden',
        amount: 'Monto',
        reason: 'Motivo',
        products: 'Productos',
        device_label: 'Dispositivo',
        device_id: 'ID dispositivo',
        user_agent: 'Navegador',
        auth_provider: 'Método de acceso',
        masked_identifier: 'Identificador',
        product_id: 'ID producto',
        product_name: 'Producto',
        type: 'Tipo',
        price: 'Precio',
        price_before: 'Precio anterior',
        price_after: 'Precio nuevo',
        origin: 'Origen',
        quantity: 'Cantidad',
        cash_shift_id: 'Turno de caja',
        shift_number: 'Turno',
        opening_balance: 'Base inicial',
        count: 'Productos',
        total_loss: 'Pérdida total',
        declared_cash: 'Efectivo declarado',
        expected_cash: 'Efectivo esperado',
        difference: 'Diferencia',
        expense_id: 'ID gasto',
        category: 'Categoría',
        payment_method: 'Método de pago',
        sale_refund_id: 'ID devolución',
        items: 'Ítems',
        promotion_id: 'ID promoción',
        name: 'Nombre',
        total_price: 'Precio total',
        is_active: 'Activa',
        target_user_id: 'Usuario ID',
        target_user_name: 'Nombre del usuario',
        target_user_role: 'Rol del empleado',
        target_role_id: 'Rol objetivo',
        before: 'Antes',
        after: 'Después',
    };
    return map[k] || k;
};

const renderValue = (v: any): string => {
    if (v === null || v === undefined) return '—';
    if (typeof v === 'object') return JSON.stringify(v);
    if (typeof v === 'boolean') return v ? 'Sí' : 'No';
    return String(v);
};

// Claves cuyo valor es un monto en pesos: se muestran con $ y separador de miles.
const MONEY_KEYS = new Set([
    'amount', 'total_price', 'price', 'price_before', 'price_after', 'unit_price',
    'opening_balance', 'declared_cash', 'expected_cash', 'difference', 'total_loss',
]);

// Etiquetas en español para los métodos de pago (valor crudo en BD: cash, card...).
const PAYMENT_METHOD_LABELS: Record<string, string> = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    nequi: 'Nequi',
    daviplata: 'Daviplata',
    transfer: 'Transferencia',
    credit: 'Crédito',
    other: 'Otro',
    mixed: 'Mixto',
};

// Etiquetas en español para los tipos de producto (valor crudo: simple, processed, service).
const PRODUCT_TYPE_LABELS: Record<string, string> = {
    simple: 'Retail',
    processed: 'Receta',
    service: 'Servicio',
};

// Etiquetas en español para el método de acceso (auth_provider). Incluye los valores
// reales que fija el cliente y los crudos de Supabase como respaldo.
const AUTH_METHOD_LABELS: Record<string, string> = {
    pin: 'Teléfono y PIN',
    firebase_otp: 'Código SMS',
    google_oauth: 'Google',
    email_password: 'Correo y contraseña',
    // Respaldo para eventos viejos o sesiones restauradas (provider crudo de Supabase).
    email: 'Teléfono y PIN',
    phone: 'Código SMS',
    google: 'Google',
};

// Nombre en español de cada permiso (debe coincidir con PERMISSION_GROUPS de EmployeesScreen).
const PERMISSION_LABELS: Record<string, string> = {
    pos_view: 'Acceso al POS',
    pos_sell: 'Finalizar Ventas',
    pos_open: 'Abrir Turno',
    pos_discount: 'Aplicar Descuentos',
    pos_cancel: 'Anular Facturas',
    pos_refund: 'Devoluciones',
    pos_close: 'Cierre de Caja',
    inv_view: 'Ver Productos',
    inv_create: 'Crear/Editar Productos',
    inv_stock: 'Ajustar Stock',
    inv_purchase: 'Registrar Gastos',
    clients_view: 'Cuentas por Cobrar',
    debts_view: 'Cuentas por Pagar',
    admin_users: 'Gestionar Empleados',
    admin_reports: 'Ver Reportes',
    admin_settings: 'Configuración',
};

type PermChange = { key: string; label: string; kind: 'activated' | 'deactivated' | 'reset'; resetAction?: 'activated' | 'deactivated' };

// Compara los mapas de permisos "antes" y "después" y devuelve solo lo que cambió.
// Semántica del override: clave en true = concedido, false = denegado, ausente = predeterminado.
// En los casos "reset" (la clave desaparece), deducimos qué se hizo a partir del valor previo:
//   antes false (denegado) → se quitó la denegación = se ACTIVÓ (el rol ya lo concede)
//   antes true  (concedido) → se quitó la concesión = se DESACTIVÓ (el rol ya lo niega)
const diffPermissions = (before: unknown, after: unknown): PermChange[] => {
    const b = (before && typeof before === 'object') ? before as Record<string, boolean> : {};
    const a = (after && typeof after === 'object') ? after as Record<string, boolean> : {};
    const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
    const changes: PermChange[] = [];
    for (const key of keys) {
        const bv = b[key];
        const av = a[key];
        if (bv === av) continue;
        const label = PERMISSION_LABELS[key] || key;
        if (av === undefined) {
            // Volvió al valor del rol. bv siempre está definido aquí (true o false).
            changes.push({ key, label, kind: 'reset', resetAction: bv === false ? 'activated' : 'deactivated' });
        } else if (av === true) {
            changes.push({ key, label, kind: 'activated' });
        } else {
            changes.push({ key, label, kind: 'deactivated' });
        }
    }
    return changes;
};

// Nombre en español de los campos de negocio / impresora (claves crudas en la BD).
const BUSINESS_FIELD_LABELS: Record<string, string> = {
    name: 'Nombre del negocio',
    nit: 'NIT',
    address: 'Dirección',
    phone: 'Teléfono',
    receipt_business_name: 'Nombre en factura',
    receipt_phone: 'Teléfono en factura',
    receipt_address: 'Dirección en factura',
    receipt_paper_width: 'Ancho de papel',
};

type FieldChange = { key: string; label: string; before: string; after: string };

// Muestra valores vacíos (null, undefined, '') como un placeholder legible.
const formatFieldVal = (v: unknown): string => {
    if (v === null || v === undefined || v === '') return '(vacío)';
    return String(v);
};

// Compara los objetos before/after de eventos de negocio/impresora (solo traen los
// campos que cambiaron) y devuelve una lista legible "campo: antes → después".
const diffFields = (before: unknown, after: unknown): FieldChange[] => {
    const b = (before && typeof before === 'object') ? before as Record<string, unknown> : {};
    const a = (after && typeof after === 'object') ? after as Record<string, unknown> : {};
    const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
    return keys.map(key => ({
        key,
        label: BUSINESS_FIELD_LABELS[key] || key,
        before: formatFieldVal(b[key]),
        after: formatFieldVal(a[key]),
    }));
};

const renderMetaValue = (k: string, v: any): string => {
    if (MONEY_KEYS.has(k) && typeof v === 'number') return '$' + formatCurrency(v);
    if (k === 'payment_method' && typeof v === 'string') return PAYMENT_METHOD_LABELS[v] || v;
    if (k === 'type' && typeof v === 'string') return PRODUCT_TYPE_LABELS[v] || v;
    if (k === 'auth_provider' && typeof v === 'string') return AUTH_METHOD_LABELS[v] || v;
    return renderValue(v);
};

const EventDetailModal = ({ event, timezone, onClose, onViewSale, onViewReport, onViewShiftReport, onFilterByEmployee }: EventDetailModalProps) => {
    const [showProducts, setShowProducts] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [showProduct, setShowProduct] = useState(false);
    const [productData, setProductData] = useState<{ name: string; price: number; stock: number | null; type: string; is_active: boolean; unit: string } | null>(null);
    const [productLoading, setProductLoading] = useState(false);

    // Id del producto (solo en eventos de categoría producto) para el botón "Ver producto".
    const productIdForFetch = event?.category === 'product'
        ? (event?.metadata?.product_id as string | undefined)
        : undefined;

    // Cierra los sub-modales al cambiar de evento (o al cerrar).
    useEffect(() => {
        setShowProducts(false);
        setShowDetails(false);
        setShowProduct(false);
        setProductData(null);
    }, [event?.id]);

    // Carga los datos actuales del producto al abrir "Ver producto".
    useEffect(() => {
        if (!showProduct || !productIdForFetch) return;
        let cancelled = false;
        setProductLoading(true);
        supabase
            .from('products')
            .select('name, price, stock, type, is_active, unit')
            .eq('id', productIdForFetch)
            .maybeSingle()
            .then(({ data }) => {
                if (cancelled) return;
                setProductData(data as any);
                setProductLoading(false);
            });
        return () => { cancelled = true; };
    }, [showProduct, productIdForFetch]);

    if (!event) return null;
    if (typeof document === 'undefined') return null;

    const saleId = event.metadata?.sale_id as string | undefined;
    // Cierre de caja: el reporte del turno se abre en la pantalla de Caja.
    const shiftId = event.action === 'cash.shift.closed' ? (event.metadata?.cash_shift_id as string | undefined) : undefined;
    // Botón "Detalles": muestra la observación (metadata.note) en un sub-modal.
    // No aplica a ventas, cierre de caja, inventario, productos (que tienen sus
    // propios botones) ni a eventos con desglose propio.
    const showDetailsBtn = event.category !== 'sale'
        && event.category !== 'inventory'
        && event.category !== 'product'
        && event.category !== 'user'
        && event.category !== 'permission'
        && event.category !== 'business_config'
        && event.category !== 'printer'
        && event.category !== 'auth'
        && event.action !== 'cash.shift.closed'
        && !Array.isArray(event.metadata?.items);
    // Botón "Ver producto": en eventos de producto, muestra el estado actual del producto.
    const showProductBtn = event.category === 'product' && !!productIdForFetch;
    const note = (event.metadata?.note as string | undefined) || null;
    // El label del dispositivo viene de la metadata del propio evento
    // (`device_label`), no de business_devices (gestión de alias desactivada).
    const deviceLabel = (event.metadata?.device_label as string | undefined) || null;
    // Desglose de productos del ajuste de inventario (array). Se muestra como lista
    // estructurada, no inline. La devolución usa `items` como string, así que solo
    // tratamos como lista cuando es un array.
    const itemsList = Array.isArray(event.metadata?.items)
        ? (event.metadata!.items as Array<{ name?: string; quantity?: number; value?: number; unit?: string }>)
        : null;
    const metaEntries = Object.entries(event.metadata || {})
        .filter(([k, v]) => !HIDDEN_META_KEYS.has(k) && k !== 'device_label' && !(k === 'items' && Array.isArray(v))
            && !((event.category === 'permission' || event.category === 'business_config' || event.category === 'printer') && (k === 'before' || k === 'after')));

    // Opción A: en eventos de permisos, mostrar un resumen legible de lo que cambió
    // en vez del JSON crudo de before/after.
    const permChanges = event.category === 'permission'
        ? diffPermissions(event.metadata?.before, event.metadata?.after)
        : [];

    // Negocio / impresora: lista legible "campo: antes → después" en vez de JSON crudo.
    const isFieldDiffCategory = event.category === 'business_config' || event.category === 'printer';
    const fieldChanges = isFieldDiffCategory
        ? diffFields(event.metadata?.before, event.metadata?.after)
        : [];

    return (
        <>
        {createPortal(
        <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Detalle del evento"
        >
            <div
                className="w-full max-w-md bg-white dark:bg-[#151e32] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-[scaleIn_0.2s_ease-out] max-h-[85vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${SEVERITY_BADGE[event.severity]}`}>
                                {SEVERITY_LABELS[event.severity]}
                            </span>
                            <span className="text-[11px] text-slate-400">{CATEGORY_LABELS[event.category]}</span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1 leading-snug">{event.description}</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                            {event.user_name || 'Sistema'} · {formatDateTimeInTz(event.created_at, timezone)}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Cerrar"
                        className="size-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 shrink-0"
                    >
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                </div>

                {/* Metadata */}
                <div className="px-5 py-4 overflow-y-auto custom-scrollbar">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Detalle técnico</p>
                    <dl className="space-y-1.5">
                        <div className="flex items-start justify-between gap-3 text-xs">
                            <dt className="text-slate-500 dark:text-slate-400 shrink-0">Acción</dt>
                            <dd className="text-slate-700 dark:text-slate-200 text-right break-words">{labelForAction(event.action)}</dd>
                        </div>
                        {deviceLabel && (
                            <div className="flex items-start justify-between gap-3 text-xs">
                                <dt className="text-slate-500 dark:text-slate-400 shrink-0">Dispositivo</dt>
                                <dd className="text-right">
                                    <div className="font-medium text-slate-700 dark:text-slate-200">{deviceLabel}</div>
                                </dd>
                            </div>
                        )}
                        {metaEntries.map(([k, v]) => (
                            <div key={k} className="flex items-start justify-between gap-3 text-xs">
                                <dt className="text-slate-500 dark:text-slate-400 shrink-0">{prettyKey(k)}</dt>
                                <dd className="font-medium text-slate-700 dark:text-slate-200 text-right break-all">{renderMetaValue(k, v)}</dd>
                            </div>
                        ))}
                    </dl>

                    {event.category === 'permission' && (
                        <div className="mt-4">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Permisos modificados</p>
                            {permChanges.length === 0 ? (
                                <p className="text-xs text-slate-500 dark:text-slate-400">Sin cambios detectables.</p>
                            ) : (
                                <ul className="space-y-1.5">
                                    {permChanges.map((c) => {
                                        // Para el ícono y color de la acción usamos la dirección efectiva:
                                        // en "reset" viene de resetAction; en el resto, del propio kind.
                                        const dir = c.kind === 'reset' ? c.resetAction : c.kind;
                                        const dirColor = dir === 'activated' ? 'text-emerald-600' : 'text-red-600';
                                        const dirIcon = dir === 'activated' ? 'add_circle' : 'do_not_disturb_on';
                                        const dirLabel = dir === 'activated' ? 'Activado' : 'Desactivado';
                                        return (
                                            <li key={c.key} className="flex items-center justify-between gap-3 text-xs">
                                                <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                                                    <span className={`material-symbols-outlined text-[16px] ${dirColor}`}>{dirIcon}</span>
                                                    {c.label}
                                                </span>
                                                <span className="flex items-center gap-1.5 shrink-0">
                                                    <span className={`font-semibold ${dirColor}`}>{dirLabel}</span>
                                                    {c.kind === 'reset' && (
                                                        <>
                                                            <span className="text-slate-300 dark:text-slate-600">·</span>
                                                            <span className="font-medium text-slate-500">Predeterminado</span>
                                                        </>
                                                    )}
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </div>
                    )}

                    {isFieldDiffCategory && (
                        <div className="mt-4">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Datos modificados</p>
                            {fieldChanges.length === 0 ? (
                                <p className="text-xs text-slate-500 dark:text-slate-400">Sin cambios detectables.</p>
                            ) : (
                                <ul className="space-y-2.5">
                                    {fieldChanges.map((c) => (
                                        <li key={c.key} className="text-xs">
                                            <p className="text-slate-500 dark:text-slate-400 mb-0.5">{c.label}</p>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="line-through text-slate-400 break-all">{c.before}</span>
                                                <span className="material-symbols-outlined text-[14px] text-slate-400">arrow_forward</span>
                                                <span className="font-semibold text-slate-700 dark:text-slate-200 break-all">{c.after}</span>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </div>

                {/* Acciones de vinculación cruzada */}
                <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
                    {itemsList && itemsList.length > 0 && (
                        <button
                            onClick={() => setShowProducts(true)}
                            className="w-full h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                        >
                            <span className="material-symbols-outlined text-[18px]">list_alt</span>
                            Ver productos
                        </button>
                    )}
                    {saleId && onViewSale && (
                        <button
                            onClick={() => onViewSale(saleId)}
                            className="w-full h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                        >
                            <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                            Ver venta
                        </button>
                    )}
                    {shiftId && onViewShiftReport && (
                        <button
                            onClick={() => onViewShiftReport(shiftId)}
                            className="w-full h-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                        >
                            <span className="material-symbols-outlined text-[18px]">summarize</span>
                            Ver reporte
                        </button>
                    )}
                    {(showDetailsBtn || showProductBtn || (event.user_id && onFilterByEmployee)) && (
                        <div className={`grid gap-2 ${(showDetailsBtn || showProductBtn) && event.user_id && onFilterByEmployee ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            {showProductBtn && (
                                <button
                                    onClick={() => setShowProduct(true)}
                                    className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[16px]">inventory_2</span>
                                    Ver producto
                                </button>
                            )}
                            {showDetailsBtn && (
                                <button
                                    onClick={() => setShowDetails(true)}
                                    className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[16px]">notes</span>
                                    Detalles
                                </button>
                            )}
                            {event.user_id && onFilterByEmployee && (
                                <button
                                    onClick={() => onFilterByEmployee(event.user_id!)}
                                    className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[16px]">filter_alt</span>
                                    Filtrar empleado
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
        )}

        {/* Sub-modal: lista de productos del ajuste de inventario */}
        {showProducts && itemsList && createPortal(
            <div
                className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn"
                onClick={() => setShowProducts(false)}
                role="dialog"
                aria-modal="true"
                aria-label="Productos ajustados"
            >
                <div
                    className="w-full max-w-sm bg-white dark:bg-[#151e32] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-[scaleIn_0.2s_ease-out] max-h-[80vh] flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Productos ajustados ({itemsList.length})</h3>
                        <button
                            onClick={() => setShowProducts(false)}
                            aria-label="Cerrar"
                            className="size-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500"
                        >
                            <span className="material-symbols-outlined text-xl">close</span>
                        </button>
                    </div>
                    <div className="px-5 py-3 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-800/60">
                        {itemsList.map((it, i) => (
                            <div key={i} className="flex items-center justify-between gap-3 text-xs py-2.5">
                                <span className="text-slate-700 dark:text-slate-200 truncate">{it.name || '—'}</span>
                                <span className="shrink-0 text-right whitespace-nowrap">
                                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                                        -{formatQty(Number(it.quantity) || 0)}{it.unit ? ` ${it.unit}` : ''}
                                    </span>
                                    {typeof it.value === 'number' && (
                                        <span className="text-slate-400"> · ${formatCurrency(it.value)}</span>
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>,
            document.body
        )}

        {/* Sub-modal: observación / detalles del evento (ej. gastos) */}
        {showDetails && createPortal(
            <div
                className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn"
                onClick={() => setShowDetails(false)}
                role="dialog"
                aria-modal="true"
                aria-label="Detalles del evento"
            >
                <div
                    className="w-full max-w-sm bg-white dark:bg-[#151e32] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-[scaleIn_0.2s_ease-out] max-h-[80vh] flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Detalles</h3>
                        <button
                            onClick={() => setShowDetails(false)}
                            aria-label="Cerrar"
                            className="size-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500"
                        >
                            <span className="material-symbols-outlined text-xl">close</span>
                        </button>
                    </div>
                    <div className="px-5 py-4 overflow-y-auto custom-scrollbar">
                        {note ? (
                            <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">{note}</p>
                        ) : (
                            <p className="text-sm italic text-slate-400 text-center py-2">Sin detalles</p>
                        )}
                    </div>
                </div>
            </div>,
            document.body
        )}

        {/* Sub-modal: estado actual del producto */}
        {showProduct && createPortal(
            <div
                className="fixed inset-0 z-[95] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn"
                onClick={() => setShowProduct(false)}
                role="dialog"
                aria-modal="true"
                aria-label="Producto"
            >
                <div
                    className="w-full max-w-sm bg-white dark:bg-[#151e32] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-[scaleIn_0.2s_ease-out]"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">Producto</h3>
                        <button
                            onClick={() => setShowProduct(false)}
                            aria-label="Cerrar"
                            className="size-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500"
                        >
                            <span className="material-symbols-outlined text-xl">close</span>
                        </button>
                    </div>
                    <div className="px-5 py-4">
                        {productLoading ? (
                            <p className="text-sm text-slate-400 text-center py-2">Cargando...</p>
                        ) : !productData ? (
                            <p className="text-sm italic text-slate-400 text-center py-2">Este producto ya no existe</p>
                        ) : (
                            <dl className="space-y-2 text-xs">
                                <div className="flex items-start justify-between gap-3">
                                    <dt className="text-slate-500 dark:text-slate-400">Nombre</dt>
                                    <dd className="font-medium text-slate-700 dark:text-slate-200 text-right">{productData.name}</dd>
                                </div>
                                <div className="flex items-start justify-between gap-3">
                                    <dt className="text-slate-500 dark:text-slate-400">Tipo</dt>
                                    <dd className="font-medium text-slate-700 dark:text-slate-200 text-right">{PRODUCT_TYPE_LABELS[productData.type] || productData.type}</dd>
                                </div>
                                <div className="flex items-start justify-between gap-3">
                                    <dt className="text-slate-500 dark:text-slate-400">Precio actual</dt>
                                    <dd className="font-medium text-slate-700 dark:text-slate-200 text-right">${formatCurrency(productData.price)}</dd>
                                </div>
                                {productData.stock !== null && (
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="text-slate-500 dark:text-slate-400">Stock</dt>
                                        <dd className="font-medium text-slate-700 dark:text-slate-200 text-right">{formatQty(productData.stock)} {productData.unit}</dd>
                                    </div>
                                )}
                                <div className="flex items-start justify-between gap-3">
                                    <dt className="text-slate-500 dark:text-slate-400">Estado</dt>
                                    <dd className={`font-semibold text-right ${productData.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                                        {productData.is_active ? 'Activo' : 'Inactivo'}
                                    </dd>
                                </div>
                            </dl>
                        )}
                    </div>
                </div>
            </div>,
            document.body
        )}
        </>
    );
};

export default EventDetailModal;
