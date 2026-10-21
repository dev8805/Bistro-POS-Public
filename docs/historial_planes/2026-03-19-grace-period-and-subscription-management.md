# Suscripciones: Periodo de Gracia y Visualización de Planes

**Objetivo:** Implementar 2 días de periodo de gracia tras el vencimiento de una suscripción con recordatorios diarios descartables, y añadir los planes disponibles en la vista de *Facturación y Pagos*.
**Arquitectura:** 
- **Gracia:** Relajar la estricta comprobación de `hasActiveSubscription` en el contexto global, permitiendo acceso si la fecha de fin de ciclo no supera los 2 días (48 hrs) en el pasado.
- **Recordatorio:** Componente global sobrepuesto a la UI principal cuando el ciclo expiró legalmente pero sigue en periodo de gracia. Utiliza `localStorage` para ser descartado temporalmente (1 vez por día).
- **Gestión:** Extender la pantalla de gestión de suscripciones importando e integrando la lista de planes existentes, facilitando el recambio (upsell/cross-sell) visualmente dentro del mismo menú.
**Tech Stack:** React, TailwindCSS, TypeScript (Date API), Supabase.
---

### Tarea 1: Lógica de Gracia en Autenticación

**Archivos:**
- Modify: `context/AuthContext.tsx`

**Paso 1: Expandir el tiempo válido de suscripción**
Añadimos la lógica para permitir 48 hrs extras a `current_period_end` antes de inhabilitar la app.

```typescript
// En checkSubscription() en AuthContext.tsx, donde se calcula "hasActive":
const now = new Date();
const endDate = new Date(data.current_period_end);
const diffHours = (now.getTime() - endDate.getTime()) / (1000 * 60 * 60);

// Es activo si no ha vencido, o si venció por menos (o igual) a 48 horas
const hasActive = diffHours <= 48;

setHasActiveSubscription(hasActive);
setSubscriptionEndDate(data.current_period_end); // No cambiamos la fecha original para las alertas
```

### Tarea 2: Banner Recordatorio de Pago

**Archivos:**
- Create: `components/GracePeriodBanner.tsx`
- Modify: `App.tsx`

**Paso 1: Componente de Alerta Descartable**
Crear el banner fijo (fixed bottom/top) que se oculte al dar click temporalmente por ese día.

```tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export const GracePeriodBanner = () => {
    const { hasActiveSubscription, subscriptionEndDate } = useAuth();
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!hasActiveSubscription || !subscriptionEndDate) return;

        const endDate = new Date(subscriptionEndDate);
        const now = new Date();
        const diffHours = (now.getTime() - endDate.getTime()) / (1000 * 60 * 60);

        // Si ya expiró originalmente pero está dentro de la gracia (0 - 48 hrs)
        if (diffHours > 0 && diffHours <= 48) {
            const lastDismissed = localStorage.getItem('grace_banner_dismissed');
            // Si no se ha descartado hoy mismo, lo mostramos
            if (lastDismissed !== new Date().toDateString()) {
                setVisible(true);
            }
        }
    }, [hasActiveSubscription, subscriptionEndDate]);

    const handleDismiss = () => {
        localStorage.setItem('grace_banner_dismissed', new Date().toDateString());
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <div className="fixed bottom-0 left-0 w-full bg-red-600 text-white p-4 z-50 flex justify-between items-center shadow-lg">
            <div>
                <strong className="block text-md font-bold">¡Atención! Tu suscripción ha vencido.</strong>
                <span className="text-sm">Te queda 1-2 días de gracia. Renueva tu pago para evitar la interrupción del servicio.</span>
            </div>
            <button onClick={handleDismiss} className="px-4 py-2 bg-white text-red-600 font-bold rounded hover:bg-red-50">
                Ocultar por hoy
            </button>
        </div>
    );
};
```

**Paso 2: Montar Globalmente en App.tsx**
```tsx
// En el AppContent() en App.tsx, justo dentro del layout de layoutDashboard o arriba
<GracePeriodBanner />
```

### Tarea 3: Ver Planes dentro de la pantalla "Facturación y Pagos"

**Archivos:**
- Modify: `screens/SubscriptionManagementScreen.tsx`

**Paso 1: Añadir Pestaña Visor de Planes**
Añadir una nueva pestaña que importe y re-utilice los mismos planes (o los levante desde una tabla) para que el negocio vea todo disponible ahí mismo. Añadir un estado de Tab `'plans'`.

```tsx
// En los tabs
{[
    { id: 'overview', label: 'Resumen', icon: 'dashboard' },
    { id: 'plans', label: 'Planes', icon: 'workspace_premium' }, // NUEVO
    { id: 'history', label: 'Historial', icon: 'history' },
// ...

// En la renderización de Pestañas (ej. si es "plans")
{activeTab === 'plans' && (
   <div className="space-y-4">
       <h2 className="text-lg font-bold">Actualiza tu Plan</h2>
       {/* Se renderizan las cards horizontales / verticales tal como se diseñaron */}
       {/* Puede extraerse SubscriptionPlansCards de SubscriptionPlansScreen a un componente reutilizable */}
   </div>
)}

// O alternativamente, que el botón "Cambiar Plan" 
// cambie el foco de la app mediante "onNavigate(Screen.SUBSCRIPTION_PLANS)"
```
