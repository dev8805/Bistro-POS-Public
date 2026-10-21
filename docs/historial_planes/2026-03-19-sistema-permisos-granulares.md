# Integración del Sistema de Permisos Granulares - Plan de Implementación

**Objetivo:** Conectar las palancas de permisos configuradas en la pantalla de Empleados con el control de acceso real en la aplicación para que las restricciones de funciones y apartados surtan efecto.
**Arquitectura:** Se creará un hook `usePermissions()` que leerá del `profile.permissions` actual para exponer una función centralizada de verificación. Luego, se reemplazarán las validaciones obsoletas basadas estrictamente en cadenas de texto del rol (`Administrador`, `Cajero`) dentro de `Sidebar.tsx` y `App.tsx` por llamados a este hook, permitiendo a cualquier empleado acceder o ser denegado según sus palancas personalizadas.
**Tech Stack:** React, TypeScript.

---

## Cómo van a quedar los permisos

Actualmente, las palancas que configuras (como "Ver Reportes", "Acceso al POS", "Anular Facturas", "Ajustar Stock") **se guardan perfectamente en tu base de datos**, e incluso la app las descarga al momento de iniciar sesión y las coloca en el perfil del usuario activo (la propiedad secreta `profile.permissions`). 

**El cambio implementado en este plan hará lo siguiente:**
1. En lugar de preguntar "¿Eres Administrador?" para mostrar la barra del Dashboard, la app ahora le preguntará a la lógica: "¿Tienes la llave `admin_reports` en verdadero?".
2. Si un usuario tiene el rol nominal de "Administrador" pero tú le desactivas explícitamente el permiso "Ver Reportes", entonces **su llave `admin_reports` será falsa**, y el botón de Estadísticas en el menú lateral desaparecerá para él, y si intenta acceder mediante un enlace, se le prohibirá.
3. Esto lo aplicaremos uniformemente. Ejemplos de mapeo que implementaremos:
   - **Dashboard (Estadísticas)** → requiere palanca `admin_reports`
   - **Historial de Ventas** → requiere palanca `admin_reports` (o `pos_cancel` para ver anuladas, pero el panel requerirá reportes)
   - **Personal (Empleados)** → requiere palanca `admin_users`
   - **Configuración (Ajustes de local, recibos)** → requiere palanca `admin_settings`
   - **Caja (Apertura/Cierre)** → requiere palanca `pos_close`
   - **Productos e Inventario** → requieren `inv_view`, y para crear/editar `inv_create` y `inv_stock`.

Este plan estructurará el código para que estas reglas cobren vida en el proyecto entero, sin romper nada.

---

### Tarea 1: Crear hook `usePermissions`

**Archivos:**
- Create: `hooks/usePermissions.ts`

**Paso 1: Implementación del hook centralizado**
Crearemos el hook que expone la función lógica.

```typescript
import { useAuth } from '../context/AuthContext';
import { Screen, UserRole } from '../types';

export const usePermissions = () => {
    const { profile } = useAuth();

    // Administrador supremo / Dueño o rol Administrador base como fallback absoluto.
    const isSuperAdmin = profile?.role === 'Administrador';
    const perms = profile?.permissions || {};

    const hasPermission = (permissionId: string): boolean => {
        // En Bistro actual, si el perfil tiene permisos personalizados/rol perms cargados,
        // confiaremos absolutamente en ellos. Si no, hacemos fallback a isSuperAdmin.
        if (Object.keys(perms).length > 0) {
            return perms[permissionId] === true;
        }
        
        // Cierto fallback si la app recién migra
        if (isSuperAdmin) return true;
        
        // Fallback de roles para cosas genéricas si perms está vacío
        if (permissionId === 'pos_view' && profile?.role === 'Cajero') return true;
        if (permissionId === 'pos_view' && profile?.role === 'Mesero') return true;
        return false;
    };

    // Mapeo riguroso Pantalla -> Permiso que debe validarse antes de mostrarla
    const canAccessScreen = (screen: Screen): boolean => {
        switch (screen) {
            case Screen.DASHBOARD:
                return hasPermission('admin_reports');
            case Screen.EMPLOYEES:
                return hasPermission('admin_users');
            case Screen.SALES:
                return hasPermission('admin_reports'); // Ventas es ver métricas / historial global
            case Screen.CASH_REGISTER:
                return hasPermission('pos_close');
            case Screen.PRODUCTS:
                return hasPermission('inv_view') || hasPermission('inv_create');
            case Screen.INVENTORY:
                return hasPermission('inv_view') || hasPermission('inv_stock');
            case Screen.DEBTS:
                return hasPermission('admin_reports') || hasPermission('pos_close');
            case Screen.SUBSCRIPTION_PLANS:
            case Screen.SUBSCRIPTION_MANAGEMENT:
                return isSuperAdmin; // Esto debe reservarse sólo para el rol dueño/admin purista
            case Screen.CONTINGENCY_DOC:
                return hasPermission('admin_settings') || hasPermission('admin_reports');
            case Screen.SELL:
            case Screen.TABLES:
            case Screen.QUICK_ORDER:
            case Screen.PAYMENT:
            case Screen.MENU:
                return hasPermission('pos_view');
            case Screen.CLIENTS:
                return hasPermission('pos_view') || hasPermission('inv_view');
            default:
                return true;
        }
    };

    return { 
        hasPermission, 
        canAccessScreen,
        isSuperAdmin 
    };
};
```

**Paso 2: Commit sugerido**
`git add hooks/usePermissions.ts && git commit -m "feat: implementar hook centralizado para validar permisos y pantallas"`

---

### Tarea 2: Actualizar la Barra Lateral (Sidebar) para respetar los permisos

**Archivos:**
- Modify: `components/Sidebar.tsx:28-40` y varios puntos en el render.

**Paso 1: Remover logica harcodeada antigua**
Eliminar la constante `roleAccess` actualmente ubicada cerca de la línea 27, y eliminar la antigua función `canAccess(screen)`.

**Paso 2: Integrar el nuevo hook**
Importar y desestructurar `usePermissions` en `components/Sidebar.tsx`:

```tsx
// Al principio de los imports
import { usePermissions } from '../hooks/usePermissions';

// Dentro de export const Sidebar: React.FC<SidebarProps> = ({...}) => {
/* ... */
const { profile, user, signOut } = useAuth();
const { canAccessScreen, isSuperAdmin, hasPermission } = usePermissions();
/* ... */
```

**Paso 3: Cambiar validaciones de botones**
A lo largo de todo el componente (tanto el menú móvil interno de las líneas 381-507 como los de escritorio, reemplazar llamadas antiguas basadas en `canAccess(Screen.XXX)` y `userRole === 'Administrador'`) por las de `canAccessScreen()`.

Ejemplo:
```tsx
// Antes
{canAccess(Screen.DASHBOARD) && ( ... )}
// Después
{canAccessScreen(Screen.DASHBOARD) && ( ... )}

// Antes
{userRole === 'Administrador' && (
   <button onClick={() => setActiveMobilePanel('settings')} ...
// Después
{hasPermission('admin_settings') && (
   <button onClick={() => setActiveMobilePanel('settings')} ...
```

**Paso 4: Commit sugerido**
`git commit -am "refactor: Sidebar ahora respeta los permisos granulares vía canAccessScreen"`

---

### Tarea 3: Proteger el acceso dentro de App.tsx (Protección de Rutas)

**Archivos:**
- Modify: `App.tsx`

**Paso 1: Incorporar validación al intentar navegar**
Si un usuario astuto guarda un hipervínculo interno o forzamos por código una navegación a donde no puede, `handleNavigate` debe bloquearlo.

```tsx
// Importar al inicio
import { usePermissions } from './hooks/usePermissions';

// Dentro de AppContent()
const { canAccessScreen } = usePermissions();

// En la función handleNavigate:
const handleNavigate = (screen: Screen) => {
    // 🔒 NAVIGATION LOCK CHECK
    if (navigationLocked) return;

    // 🔒 PERMISSIONS CHECK
    // Si intenta navegar a una pantalla para la cual no tiene permiso
    if (screen !== Screen.PROFILE && screen !== Screen.LOGIN && screen !== Screen.REGISTER) {
        if (!canAccessScreen(screen)) {
            appToast.showToast('No tienes permisos para acceder a esta área', 'error');
            return;
        }
    }
    
    // ...resto del código
```

**Paso 2: Verificar éxito general**
Iniciar sesión con un empleado que no tiene "Ver Reportes". Observar que el engranaje de Configuración y la sección Estadísticas desaparecen de la barra lateral. Intentar forzar el estado al Dashboard y observar la alerta emergente.

**Paso 3: Commit final**
`git commit -am "feat: integrar bloqueo de acceso por permisos en el router de App.ts"`
