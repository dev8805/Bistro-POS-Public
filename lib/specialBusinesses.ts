/**
 * IDs de negocios con reglas especiales.
 *
 * Estos UUIDs corresponden a filas fijas en la tabla `businesses` y se usan
 * como excepciones puntuales en la UI. NO cambian entre entornos.
 *
 * Convención: comparar `profile?.business_id` contra estas constantes.
 */

/** public_id 10000 - Tienda de la Esquina. Negocio de pruebas del dueño de la app. */
export const TEST_BUSINESS_ID = '1e64bb14-27fc-4f76-8470-29e17253423f';

/** public_id 10001 - Mi Negocio. Precios ocultos y sin bloqueo por suscripción vencida. */
export const HIDDEN_PRICES_BUSINESS_ID = '9ab00944-b41b-47bd-b595-9aaea024d777';

/**
 * ¿Este usuario ve la opción "Suscripciones" en el sidebar/perfil?
 *
 * Regla:
 * - Solo admins (permiso `admin_settings`) pueden verla.
 * - El negocio de pruebas 10000 la ve siempre (legado).
 * - Cualquier otro negocio la ve SI tiene un plan personalizado asignado.
 * - Empleados sin `admin_settings` (Cajero, Mesero) nunca la ven, independientemente
 *   del negocio.
 */
export const canSeeSubscriptionMenu = (
    businessId: string | null | undefined,
    hasCustomPlan: boolean,
    hasAdminSettings: boolean,
): boolean => {
    if (!businessId || !hasAdminSettings) return false;
    if (businessId === TEST_BUSINESS_ID) return true;
    return hasCustomPlan;
};

/**
 * ¿Se muestra el Asistente IA (chat RAG) para este negocio?
 *
 * Actualmente disponible para todos los negocios (dev y producción).
 *
 * Se mantiene como función (en vez de eliminar la condición) para poder
 * volver a restringirlo por negocio sin tocar cada punto de la UI: bastaría
 * con devolver, por ejemplo, `import.meta.env.DEV || businessId === TEST_BUSINESS_ID`.
 */
export const canSeeAiAssistant = (_businessId: string | null | undefined): boolean => {
    return true;
};
