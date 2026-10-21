# Sistema de Notificaciones (Toasts)

Este documento describe la arquitectura del sistema de notificaciones de Bistro, la regla editorial que define qué mensajes ve el usuario vs el desarrollador, y el catálogo de mensajes relacionados con el modo offline.

---

## Infraestructura

El sistema de toasts está centralizado en `context/ToastContext.tsx`. Todos los componentes acceden a él a través del hook:

```typescript
import { useToast } from '../context/ToastContext';
const { showToast } = useToast();

// Firma completa
showToast(message: string, type?: ToastType, duration?: number)
// type: 'success' | 'error' | 'warning' | 'info'  (default: 'success')
// duration: milisegundos  (default: 3500ms)
```

El componente visual que renderiza los toasts es `components/AppToast.tsx`. Usa Tailwind CSS con layout responsive: en móvil aparece como barra superior centrada, en desktop como panel lateral derecho. Los toasts se auto-dismiss y también se pueden cerrar al tocar.

### Layout responsive

| Breakpoint | Posición | Animación | Ancho |
|---|---|---|---|
| Móvil (`< md`) | `fixed top-0 left-0 right-0`, con `px-3 pt-3` | Desliza desde arriba (`toastDown`) | Ancho completo − 24px de margen |
| Desktop (`≥ md`) | `fixed top-5 right-5` | Desliza desde la derecha (`toastSlideIn`) | 360px fijo |

En móvil el toast ocupa todo el ancho disponible con padding lateral de 12px, garantizando que el texto nunca se corta ni se sale de pantalla en dispositivos estrechos (360px). Los iconos usan `material-symbols-outlined` (consistente con el resto de la app).

### Tipos y colores

| Tipo | Tailwind classes | Ícono | Uso correcto |
|------|-----------------|-------|--------------|
| `success` | `bg-emerald-900/95 border-emerald-400` | `check_circle` | Operación completada correctamente |
| `error` | `bg-red-900/95 border-red-400` | `cancel` | Operación fallida — el usuario debe saberlo |
| `warning` | `bg-amber-900/95 border-amber-400` | `warning` | Restricción o limitación (ej: modo offline) |
| `info` | `bg-blue-900/95 border-blue-400` | `info` | Información contextual sin urgencia |

---

## Regla editorial: usuario vs desarrollador

**Todo mensaje que aparece en un toast es para el usuario.** Los desarrolladores leen los errores en la consola del navegador.

| Nivel | Canal | Quién lo ve |
|-------|-------|-------------|
| Mensaje de operación | `showToast(...)` | Usuario |
| Detalle técnico del error | `console.error(error)` | Desarrollador (DevTools) |

### Lo que NO debe llegar al usuario en un toast

- Mensajes de error de PostgreSQL: `"UNIQUE constraint failed"`, `"permission denied"`, `"violates foreign key constraint"`
- Mensajes de red internos: `"Failed to fetch"`, `"network timeout"`, `"ERR_CONNECTION_REFUSED"`
- Mensajes de parsing: `"JSON.parse: unexpected token at line 1"`
- Errores de JavaScript: `"Cannot read property 'map' of undefined"`, `"undefined is not a function"`
- Códigos de error de Stripe: `"stripe_invalid_card"`, `"card_declined"`
- Códigos HTTP crudos: `"422"`, `"500"`, `"PGRST301"`

### Patrón correcto

```typescript
// ✅ Bien: mensaje genérico al usuario + detalle en consola
try {
  await supabase.from('clients').insert(data);
  showToast('Cliente creado correctamente');
} catch (error) {
  console.error('Error creando cliente:', error);
  showToast('No se pudo crear el cliente. Intenta de nuevo.', 'error');
}

// ❌ Mal: error técnico visible al usuario
} catch (error) {
  showToast(`Error al crear el cliente: ${error.message}`, 'error');
}
```

---

## Pantallas bloqueadas en modo offline

Cuando no hay conexión, las siguientes pantallas muestran una pantalla de bloqueo completa (early return) en lugar de su contenido normal. El patrón es idéntico en todos los casos: ícono `wifi_off` ámbar + título + descripción específica.

| Pantalla | Archivo | Mensaje al usuario |
|----------|---------|-------------------|
| Dashboard | `screens/DashboardScreen.tsx` | "Las estadísticas y el reporte de ventas requieren internet para cargar los datos del período." |
| Catálogo de Productos | `screens/ProductsScreen.tsx` | "El catálogo de productos requiere internet para cargar datos actualizados y mostrar el diagnóstico de stock." |
| Crear/Editar Producto | `screens/SimpleProductScreen.tsx` | "Para crear/editar productos necesitas internet." |
| Crear/Editar Servicio | `screens/ServiceProductScreen.tsx` | "Para crear/editar servicios necesitas internet." |
| Personal | `screens/EmployeesScreen.tsx` | "La gestión de personal requiere internet para cargar empleados y roles." |
| Conteo de Stock | `screens/InventoryScreen.tsx` | "El conteo de stock requiere internet para cargar el inventario actualizado." |
| Cuentas por Pagar | `screens/DebtsScreen.tsx` | "El registro de cuentas por pagar requiere internet para cargar deudas y proveedores." |
| Asistente IA | `screens/RagChatScreen.tsx` | "El Asistente IA necesita internet para responder preguntas y consultar la base de conocimiento." |

### Patrón de implementación

La mayoría de pantallas usa solo `!isOnline`:

```tsx
// Antes del return principal, antes de cualquier JSX
if (!isOnline) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center h-full bg-background-light dark:bg-background-dark p-8 text-center gap-5">
            <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[32px]"
                      style={{ fontVariationSettings: "'FILL' 1" }}>wifi_off</span>
            </div>
            <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Sin conexión</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-xs">
                    [Descripción específica de por qué necesita internet]
                </p>
            </div>
        </div>
    );
}
```

`isOnline` llega como prop desde `App.tsx`, donde se determina mediante ping real a Supabase (más fiable que `navigator.onLine`). Todos los screens reciben `isOnline?: boolean` con default `true`.

### Variante con doble guard (`DebtsScreen`, `RagChatScreen`)

Estas dos pantallas usan `!isOnline || !navigator.onLine`:

```tsx
if (!isOnline || !navigator.onLine) {
    return <offline block>;
}
```

**Por qué:** `useOfflineSync` inicializa `isOnline = true` y hace el primer ping a los 3 segundos. Con el debounce de 2 s, `isOnline` tarda hasta 8 segundos en ser `false` al cargar la app sin internet. Durante esa ventana:

- `useDebts` detecta offline vía `navigator.onLine` → carga datos del **caché de localStorage** → `DebtsScreen` renderizaba con datos reales sin mostrar el bloqueo.
- `useRagDocuments` intenta fetch a Supabase, falla silenciosamente → `RagChatScreen` renderizaba con la interfaz vacía.

Agregar `!navigator.onLine` como condición adicional detecta el estado offline inmediatamente, sin esperar el ping. Las demás pantallas no necesitan este guard porque sus hooks no tienen caché local ni datos que mostrar offline.

---

## Catálogo de mensajes offline

Estos son los mensajes exactos que el sistema muestra en relación con el modo offline. Están definidos en `App.tsx` y `components/OfflineIndicator.tsx`.

### Indicador visual (barra superior en móvil)

| Estado | Texto | Icono |
|--------|-------|-------|
| Sin internet | `"Sin conexión"` | `wifi_off` ámbar |
| Sincronizando con internet recuperado | `"Sincronizando..."` | `sync` girando |
| Sincronización completada | `"Sincronización exitosa (N)"` | `cloud_done` verde |
| Con errores de sync | `"Sincronización exitosa (N) · M error"` | `cloud_done` verde + texto rojo |

El botón "¿Qué puedes hacer?" abre el modal `OfflineFeaturesModal` que lista las operaciones disponibles sin internet.

### Toasts de operaciones offline

| Situación | Mensaje | Tipo |
|-----------|---------|------|
| Venta guardada sin internet (flujo directo) | `"Venta guardada offline ☁️ Se sincronizará cuando vuelva internet"` | `success` |
| Venta guardada sin internet (fallback por error de red) | `"Venta guardada offline ☁️ Se sincronizará cuando vuelva internet"` | `success` |
| Venta con mesa sin internet | *(no hay mensaje específico — falla con error genérico)* | `error` |
| Asistente IA sin internet | `"El Asistente IA necesita conexión a internet para responder"` | `warning` |
| Error de venta no recuperable | `"Error al procesar la venta: "` + `error.message` | `error` ⚠️ técnico |

> **Nota:** El último caso es la única excepción documentada donde `error.message` llega al usuario, como deuda técnica pendiente de resolver (ver sección siguiente).

---

## Deuda técnica: mensajes técnicos expuestos al usuario

El siguiente patrón existe en más de 32 archivos del proyecto. Está registrado aquí como inventario de deuda técnica — no es el comportamiento deseado.

```typescript
// Patrón a eliminar
showToast(`Error al crear el producto: ${error.message}`, 'error');
```

### Archivos con mayor impacto

| Archivo | Líneas |
|---------|--------|
| `screens/DebtsScreen.tsx` | 257, 293, 307, 326, 351, 397, 426, 461 |
| `screens/EmployeesScreen.tsx` | 268, 311, 344 |
| `components/expense/InventoryPurchase.tsx` | 334, 431, 462 |
| `screens/ClientsScreen.tsx` | 353 |
| `screens/SimpleProductScreen.tsx` | 356 |
| `screens/SubscriptionManagementScreen.tsx` | 230 |
| `screens/RagChatScreen.tsx` | 64, 76, 87 (via `setUploadError`) |
| `App.tsx` | 2018 |

### Cómo resolverlo cuando se toca un archivo

Reemplazar el patrón problemático por mensajes genéricos y mover el detalle a `console.error`:

```typescript
// Antes
showToast(`Error al guardar: ${error.message}`, 'error');

// Después
console.error('Error guardando [contexto]:', error);
showToast('No se pudo guardar. Intenta de nuevo.', 'error');
```

### ErrorBoundary

`components/ErrorBoundary.tsx` líneas 55 y 115 muestran `{this.state.error?.message}` en el fallback UI de pantalla completa. Este texto puede contener mensajes técnicos de JS. Al refactorizar el ErrorBoundary, reemplazar por texto fijo: `"Algo salió mal. Intenta recargar la página."`.

---

## Componentes relacionados

| Componente | Propósito |
|------------|-----------|
| `context/ToastContext.tsx` | Proveedor central del sistema de toasts |
| `components/AppToast.tsx` | Renderizado visual de toasts |
| `components/Toast.tsx` | Versión alternativa de toast (uso reducido) |
| `components/OfflineIndicator.tsx` | Barra/chip de estado de conexión |
| `components/OfflineFeaturesModal.tsx` | Modal educativo de funcionalidades offline |
| `components/ErrorBoundary.tsx` | Captura de errores de React con fallback UI |
