import { useAuth } from '../context/AuthContext';
import { useCustomPlan } from './useCustomPlan';

export interface PlanFeatures {
    /** true si el negocio tiene acceso a las características de Plan Pro */
    isPro: boolean;
    /** true si el negocio está en su periodo de prueba de 7 días */
    isTrial: boolean;
    /** true si el negocio tiene un Plan Estándar activo */
    isStandard: boolean;
    /** Nombre del plan actual */
    planName: string;
    /** Acceso a mapa de salones, mesas y división de cuentas */
    canUseTables: boolean;
    /** Acceso a envío de comandas e impresión en cocina/barra */
    canUseKitchen: boolean;
    /** Acceso a adjuntar y subir evidencia fotográfica de facturas en la nube */
    canUploadEvidence: boolean;
    /** Acceso a creación de recetas, insumos y mermas de cocina */
    canUseRecipes: boolean;
    /** Acceso a creación de combos y promociones automáticas */
    canUsePromotions: boolean;
    /** Acceso a la pantalla de auditoría y conteo físico de stock en estantes */
    canUsePhysicalInventory: boolean;
    /** Cantidad máxima de empleados permitidos (3 en Estándar, Infinity en Pro) */
    maxEmployees: number;
}

/**
 * Hook centralizado para verificar qué funcionalidades tiene contratadas el negocio.
 * 
 * Reglas de negocio:
 * 1. Prueba de 7 días (Trial): Acceso completo a todas las funciones (Plan Pro).
 * 2. Planes Personalizados: Acceso ilimitado (Plan Pro).
 * 3. Plan Pro: Acceso ilimitado.
 * 4. Plan Estándar: Funciones base (ventas mostrador, caja, escaneo IA ventas/facturas, catálogo).
 */
export const usePlanFeatures = (): PlanFeatures => {
    const { subscription } = useAuth();
    const { hasCustomPlan } = useCustomPlan();

    const planName = (subscription?.plan?.name || '').trim();
    const planNameLower = planName.toLowerCase();
    const isTrial = subscription?.status === 'trial';

    // Se considera Plan Estándar únicamente si NO está en prueba, NO tiene plan personalizado
    // y el nombre de su plan contiene 'estándar' o 'estandar'.
    const isStandard = !isTrial && !hasCustomPlan && (
        planNameLower.includes('estándar') || planNameLower.includes('estandar')
    );

    const isPro = !isStandard;

    return {
        isPro,
        isTrial,
        isStandard,
        planName,
        canUseTables: isPro,
        canUseKitchen: isPro,
        canUploadEvidence: isPro,
        canUseRecipes: isPro,
        canUsePromotions: isPro,
        canUsePhysicalInventory: isPro,
        maxEmployees: isPro ? Infinity : 3,
    };
};
