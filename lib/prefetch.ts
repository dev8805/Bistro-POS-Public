/**
 * Prefetch utilities for code-splitting optimization
 * 
 * Permite precargar chunks de pantallas antes de que el usuario navegue,
 * mejorando la percepción de velocidad.
 */

// Map de pantallas a sus funciones de import
const screenImports = {
    employees: () => import('../screens/EmployeesScreen'),
    clients: () => import('../screens/ClientsScreen'),
    products: () => import('../screens/ProductsScreen'),
    sales: () => import('../screens/SalesScreen'),
    profile: () => import('../screens/ProfileScreen'),
    cashRegister: () => import('../screens/CashRegisterScreen'),
    dashboard: () => import('../screens/DashboardScreen'),
    inventory: () => import('../screens/InventoryScreen'),
    subscriptionPlans: () => import('../screens/SubscriptionPlansScreen'),
    subscriptionManagement: () => import('../screens/SubscriptionManagementScreen'),
    debts: () => import('../screens/DebtsScreen'),
    contingencyDoc: () => import('../screens/ContingencyDocScreen'),
    simpleProduct: () => import('../screens/SimpleProductScreen'),
    serviceProduct: () => import('../screens/ServiceProductScreen'),
} as const;

type ScreenKey = keyof typeof screenImports;

// Cache para evitar prefetch duplicados
const prefetchedScreens = new Set<ScreenKey>();

/**
 * Prefetch un screen específico
 * Descarga el chunk en background sin bloquear la UI
 */
export const prefetchScreen = (screen: ScreenKey): void => {
    if (prefetchedScreens.has(screen)) return;

    prefetchedScreens.add(screen);

    // Usar requestIdleCallback para no bloquear interacciones
    const prefetch = () => {
        screenImports[screen]().catch(() => {
            // Silently fail - el screen se cargará cuando se necesite
            prefetchedScreens.delete(screen);
        });
    };

    if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(prefetch, { timeout: 2000 });
    } else {
        setTimeout(prefetch, 100);
    }
};

/**
 * Prefetch múltiples screens
 */
export const prefetchScreens = (screens: ScreenKey[]): void => {
    screens.forEach(prefetchScreen);
};

/**
 * Prefetch las pantallas más usadas después de login
 * Llamar esto después de que el usuario inicie sesión
 */
export const prefetchCommonScreens = (): void => {
    // Delay inicial para no competir con la carga del dashboard
    setTimeout(() => {
        prefetchScreens(['dashboard', 'sales', 'products', 'clients', 'simpleProduct', 'serviceProduct']);
    }, 3000);
};

/**
 * Hook-friendly wrapper para prefetch on hover
 */
export const createHoverPrefetch = (screen: ScreenKey) => {
    let timeout: ReturnType<typeof setTimeout>;

    return {
        onMouseEnter: () => {
            timeout = setTimeout(() => prefetchScreen(screen), 150);
        },
        onMouseLeave: () => {
            clearTimeout(timeout);
        },
    };
};
