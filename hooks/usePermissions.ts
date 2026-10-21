import { useAuth } from '../context/AuthContext';
import { Screen } from '../types';

export const usePermissions = () => {
    const { profile } = useAuth();

    const isSuperAdmin = profile?.role === 'Administrador';
    const perms = profile?.permissions || {};
    const hasPermsLoaded = Object.keys(perms).length > 0;

    const hasPermission = (permissionId: string): boolean => {
        if (hasPermsLoaded) {
            return perms[permissionId] === true;
        }
        // Fallback si el perfil aún no tiene permisos cargados
        if (isSuperAdmin) return true;
        // Permisos básicos para roles sin configuración granular
        if (permissionId === 'pos_view') {
            return profile?.role === 'Cajero' || profile?.role === 'Mesero';
        }
        return false;
    };

    // ¿Puede finalizar/cobrar ventas? (separado de tomar pedidos / enviar comandas)
    // pos_sell explícito tiene prioridad. Si no está definido, hereda de pos_view
    // para no romper configuraciones existentes (quien podía vender, sigue pudiendo).
    const canFinalizeSale = (): boolean => {
        if (isSuperAdmin) return true;
        if (hasPermsLoaded) {
            if (typeof perms.pos_sell === 'boolean') return perms.pos_sell;
            return perms.pos_view === true;
        }
        // Fallback sin permisos granulares cargados: comportamiento clásico
        return profile?.role === 'Cajero' || profile?.role === 'Mesero';
    };

    // ¿Puede ABRIR un turno de caja? (separado de cerrar/arqueo, que usa pos_close)
    // Abrir es de bajo riesgo: como vender ahora exige turno, quien puede vender
    // debe poder abrirlo. pos_open explícito tiene prioridad; si no está definido,
    // hereda de pos_view para no bloquear a cajeros existentes.
    const canOpenShift = (): boolean => {
        if (isSuperAdmin) return true;
        if (hasPermsLoaded) {
            if (typeof perms.pos_open === 'boolean') return perms.pos_open;
            return perms.pos_view === true;
        }
        return profile?.role === 'Cajero' || profile?.role === 'Mesero';
    };

    // ¿Necesita datos de productos? (catálogo de venta o gestión de inventario).
    // Se usa para gatear la suscripción realtime a `products`: un dispositivo cuyo
    // usuario no trabaja con productos no se suscribe ni cuenta como receptor.
    const canViewProducts = (): boolean => {
        if (isSuperAdmin) return true;
        return hasPermission('pos_view') || hasPermission('inv_view') || hasPermission('inv_create');
    };

    const canAccessScreen = (screen: Screen): boolean => {
        // Pantallas de autenticación siempre accesibles
        if (screen === Screen.LOGIN || screen === Screen.REGISTER || screen === Screen.PROFILE) {
            return true;
        }

        // Si aún no se han cargado permisos, caer al check de rol
        if (!hasPermsLoaded) {
            // Comportamiento clásico de rol como fallback
            const adminScreens = [
                Screen.DASHBOARD, Screen.EMPLOYEES, Screen.SALES,
                Screen.INVENTORY, Screen.DEBTS, Screen.SUBSCRIPTION_PLANS,
                Screen.SUBSCRIPTION_MANAGEMENT, Screen.CONTINGENCY_DOC
            ];
            if (adminScreens.includes(screen)) return isSuperAdmin;
            return true;
        }

        switch (screen) {
            case Screen.DASHBOARD:
                return hasPermission('admin_reports');
            case Screen.EMPLOYEES:
                return hasPermission('admin_users');
            case Screen.ACTIVITY:
                return hasPermission('admin_users') || hasPermission('admin_settings');
            case Screen.SALES:
                return hasPermission('admin_reports') || hasPermission('pos_view');
            case Screen.CASH_REGISTER:
                // Acceso al sidebar de caja: puede entrar quien cierra (arqueo) o
                // quien solo abre turno. Dentro, cada acción valida su propio permiso.
                return hasPermission('pos_close') || canOpenShift();
            case Screen.PRODUCTS:
                return hasPermission('inv_view') || hasPermission('inv_create');
            case Screen.INVENTORY:
                return hasPermission('inv_view') || hasPermission('inv_stock');
            case Screen.DEBTS:
                // Cuentas por Pagar: permiso propio (debts_view). Si no está fijado,
                // hereda del comportamiento clásico (reportes o cierre de caja).
                if (typeof perms['debts_view'] === 'boolean') return perms['debts_view'];
                return hasPermission('admin_reports') || hasPermission('pos_close');
            case Screen.SUBSCRIPTION_PLANS:
            case Screen.SUBSCRIPTION_MANAGEMENT:
                return isSuperAdmin;
            case Screen.CONTINGENCY_DOC:
                return hasPermission('admin_settings') || hasPermission('admin_reports');
            case Screen.SELL:
            case Screen.TABLES:
            case Screen.QUICK_ORDER:
            case Screen.PAYMENT:
            case Screen.MENU:
                return hasPermission('pos_view');
            case Screen.PHOTO_ORDER:
                // Escanear fotolista: es una herramienta de venta (genera una venta
                // directa). Requiere permiso de finalizar ventas (pos_sell).
                return canFinalizeSale();
            case Screen.CLIENTS:
                // Cuentas por Cobrar: permiso propio (clients_view). Si no está fijado,
                // hereda del comportamiento clásico (acceso a POS o a inventario).
                if (typeof perms['clients_view'] === 'boolean') return perms['clients_view'];
                return hasPermission('pos_view') || hasPermission('inv_view');
            default:
                return true;
        }
    };

    return {
        hasPermission,
        canAccessScreen,
        canFinalizeSale,
        canOpenShift,
        canViewProducts,
        isSuperAdmin,
    };
};
