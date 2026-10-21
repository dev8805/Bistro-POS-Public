# Actualización en Producción (PWA) Plan de Implementación

**Objetivo:** Mostrar una notificación de "Actualización disponible" en Producción cuando se suba un nuevo commit a `main`.
**Arquitectura:** Aprovechar el `vite-plugin-pwa` existente para que en lugar de que el Service Worker se actualice sin avisar (`autoUpdate`), genere un estado `needRefresh` que la interfaz capture y muestre proactivamente al usuario con la opción de actualizar (`prompt`).
**Tech Stack:** React, TailwindCSS, `virtual:pwa-register/react`

---

### Tarea 1: Modificar Configuración de PWA

**Archivos:**
- Modify: `vite.config.ts`

**Paso 1: Cambiar el tipo de registro a prompt**
Cambiar la configuración del plugin `VitePWA` para usar `registerType: 'prompt'`.

```typescript
      VitePWA({
        registerType: 'prompt', // Cambiado de 'autoUpdate' a 'prompt'
        includeAssets: [
          '180px_fondoBlanco.png',
          // ...
```


### Tarea 2: Crear el Componente de Notificación de Actualización

**Archivos:**
- Create: `components/UpdateNotification.tsx`

**Paso 1: Implementar UI flotante amigable**
Es un componente sencillo que aparecerá si hay una versión lista en el Service Worker.

```tsx
import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCcw, X } from 'lucide-react';

export function UpdateNotification() {
  // needRefresh es true cuando detecta un cambio de Service Worker
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered:', r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] animate-bounce">
      <div className="bg-primary shadow-xl rounded-full px-6 py-3 border text-white flex items-center gap-4 transition-all">
        <span className="text-sm font-medium">Hay una nueva actualización disponible.</span>
        
        <button 
          onClick={() => updateServiceWorker(true)}
          className="bg-white text-primary rounded-full px-4 py-1.5 text-sm font-bold flex items-center gap-2 hover:bg-gray-100 transition-colors"
        >
          <RefreshCcw className="w-4 h-4" />
          Actualizar ahora
        </button>

        <button 
          onClick={() => setNeedRefresh(false)}
          className="text-white hover:text-gray-200"
          aria-label="Cerrar notificación"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
```


### Tarea 3: Inyectar el Componente en la App Principal

**Archivos:**
- Modify: `App.tsx`

**Paso 1: Renderizar Notification dentro del App Content**
Agregamos `<UpdateNotification />` en el nivel superior, cerca de `<AppToast />` o `<ToastProvider />` para que se renderice globalmente.

```tsx
// Al principio de App.tsx:
import { UpdateNotification } from './components/UpdateNotification';

// Dentro de AppContent(), donde devuelves el JSX:
  return (
    <div className="min-h-screen bg-gray-50 bg-opacity-30 relative overflow-hidden flex font-sans">
      <UpdateNotification />
      {/* ...resto_del_layout... */}
```


### Tarea 4: Proveer Tipado para pwa-register (Opcional pero Recomendable)

**Archivos:**
- Create: `vite-env.d.ts` (si no existe)

**Paso 1: Declaración de módulos PWA para evitar errores de TypeScript**

```typescript
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
/// <reference types="vite-plugin-pwa/info" />
```

---
**Consideraciones Finales:**
- La experiencia para el usuario mejorará drásticamente. En lugar de tener la app abierta mostrando código viejo que podría colisionar con la BD, ahora verán de inmediato que hay un `deploy` y se actualizarán a la última versión.
- No hay que tocar el Backend, todo esto pasa en el nivel navegador/build.
