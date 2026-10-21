# Reemplazar Diálogos Nativos del Navegador — Plan de Implementación

**Objetivo:** Eliminar todos los `alert()` y `window.confirm()` nativos del navegador y reemplazarlos con modales propios de la app, profesionales y coherentes con el diseño.

**Arquitectura:** Crear un sistema centralizado de notificaciones (toast) y un modal de confirmación reutilizable. Los toasts manejan mensajes de éxito/error/info. El modal de confirmación maneja preguntas sí/no con soporte async/await.

**Tech Stack:** React, TypeScript, TailwindCSS, Context API

---

## 📊 Inventario de Diálogos Nativos Encontrados

### `window.confirm()` — 7 ocurrencias

| # | Archivo | Línea | Mensaje |
|---|---------|-------|---------|
| 1 | `screens/TablesScreen.tsx` | 90 | ¿Eliminar sala "{name}" y sus mesas? |
| 2 | `screens/TablesScreen.tsx` | 132 | ¿Eliminar esta mesa? |
| 3 | `screens/SalesScreen.tsx` | 70 | ¿Eliminar este item de la orden? |
| 4 | `screens/SalesScreen.tsx` | 84 | ¿Estás seguro de ELIMINAR la venta #X? |
| 5 | `screens/ProductsScreen.tsx` | 103 | ¿Estás seguro de eliminar el producto "X"? |
| 6 | `screens/SubscriptionManagementScreen.tsx` | 212 | ¿Eliminar este método de pago? |
| 7 | `screens/EmployeesScreen.tsx` | 222 | ¿Eliminar este empleado? |

### `alert()` — 48 ocurrencias

| # | Archivo | Línea(s) | Tipo |
|---|---------|----------|------|
| 1 | `screens/TablesScreen.tsx` | 81, 92, 103, 454 | Error / Validación |
| 2 | `screens/SubscriptionManagementScreen.tsx` | 140, 144, 194, 200, 208, 240, 263 | Éxito / Error / Validación |
| 3 | `screens/SimpleProductScreen.tsx` | 124, 166, 170 | Validación / Éxito / Error |
| 4 | `screens/ServiceProductScreen.tsx` | 75, 114, 118 | Validación / Éxito / Error |
| 5 | `screens/SellScreen.tsx` | 320 | Error |
| 6 | `screens/SalesScreen.tsx` | 74, 77, 90, 94 | Info / Error / Éxito |
| 7 | `screens/ProductsScreen.tsx` | 111 | Error |
| 8 | `screens/ProcessedProductScreen.tsx` | 256, 258, 288, 359, 364 | Validación / Éxito / Error |
| 9 | `screens/PaymentScreen.tsx` | 320 | Validación |
| 10 | `screens/InventoryScreen.tsx` | 160, 181, 200, 209, 212 | Error / Info / Éxito |
| 11 | `screens/ClientsScreen.tsx` | 100, 125, 681 | Error |
| 12 | `screens/CashRegisterScreen.tsx` | 120, 125, 139, 157 | Validación |
| 13 | `hooks/useImageUpload.ts` | 146, 214 | Validación / Error |
| 14 | `App.tsx` | 1461 | Error |
| 15 | `components/GlobalSellTabs.tsx` | 115 | Error |
| 16 | `components/MobileNavBar.tsx` | 146 | Error |
| 17 | `components/PaymentSidebar.tsx` | 143, 195 | Validación / Error |
| 18 | `components/ImageCropper.tsx` | 85 | Error |
| 19 | `components/CategorySelector.tsx` | 80 | Error |

---

## Tareas de Implementación

### Tarea 1: Crear componente `Toast` y su contexto

**Archivos:**
- Create: `context/ToastContext.tsx`
- Create: `components/Toast.tsx`

**Qué hace:**
Un sistema de notificaciones tipo "toast" que aparece como una barra temporal en la esquina superior derecha (o inferior en móvil). Soporta 4 tipos: `success`, `error`, `warning`, `info`.

**API de uso:**
```tsx
const { showToast } = useToast();
showToast('Producto creado exitosamente', 'success');
showToast('Error al guardar', 'error');
showToast('Complete los campos obligatorios', 'warning');
```

**Paso 1:** Crear `context/ToastContext.tsx`
- Definir tipo `ToastType = 'success' | 'error' | 'warning' | 'info'`
- Definir interfaz `Toast { id, message, type, duration? }`
- Provider maneja array de toasts activos
- `showToast(message, type, duration?)` agrega toast con auto-dismiss (3s default)

**Paso 2:** Crear `components/Toast.tsx`
- Renderiza los toasts activos como cards flotantes con animación de entrada/salida
- Colores: verde (success), rojo (error), amarillo (warning), azul (info)
- Icono por tipo (✓, ✕, ⚠, ℹ)
- Botón de cerrar manual
- Diseño coherente con el tema de la app (bordes redondeados, sombras suaves)

**Paso 3:** Montar en `App.tsx`
- Envolver la app con `<ToastProvider>` y renderizar `<Toast />` globalmente

---

### Tarea 2: Crear componente `ConfirmDialog` y su contexto

**Archivos:**
- Create: `context/ConfirmDialogContext.tsx`
- Create: `components/ConfirmDialog.tsx`

**Qué hace:**
Un modal de confirmación reutilizable que reemplaza `window.confirm()`. Soporta async/await para que el flujo del código se mantenga limpio.

**API de uso:**
```tsx
const { confirmAction } = useConfirmDialog();

const handleDelete = async () => {
  const confirmed = await confirmAction({
    title: 'Eliminar mesa',
    message: '¿Estás seguro de eliminar esta mesa?',
    confirmText: 'Eliminar',
    cancelText: 'Cancelar',
    variant: 'danger' // 'danger' | 'warning' | 'info'
  });
  if (!confirmed) return;
  // ... proceder con la eliminación
};
```

**Paso 1:** Crear `context/ConfirmDialogContext.tsx`
- `confirmAction(options)` retorna `Promise<boolean>`
- Internamente usa `resolve` de una Promise para devolver `true/false` cuando el usuario interactúa
- Maneja estado: `isOpen`, `options`, `resolveRef`

**Paso 2:** Crear `components/ConfirmDialog.tsx`
- Modal centrado con overlay oscuro
- Título, mensaje, y dos botones (Confirmar/Cancelar)
- Variantes de color: danger (rojo), warning (amarillo), info (azul)
- Animación de entrada (scale + fade)
- Cerrar con ESC o click en overlay = cancelar
- Focus automático en botón de cancelar (para evitar eliminaciones accidentales)

**Paso 3:** Montar en `App.tsx`
- Envolver la app con `<ConfirmDialogProvider>` y renderizar `<ConfirmDialog />`

---

### Tarea 3: Reemplazar `window.confirm()` en todos los archivos (7 ocurrencias)

**Archivos a modificar:**
- `screens/TablesScreen.tsx` (líneas 90, 132)
- `screens/SalesScreen.tsx` (líneas 70, 84)
- `screens/ProductsScreen.tsx` (línea 103)
- `screens/SubscriptionManagementScreen.tsx` (línea 212)
- `screens/EmployeesScreen.tsx` (línea 222)

**Patrón de cambio:**
```tsx
// ANTES:
if (window.confirm('¿Eliminar esta mesa?')) { ... }

// DESPUÉS:
const confirmed = await confirmAction({
  title: 'Eliminar mesa',
  message: '¿Eliminar esta mesa?',
  confirmText: 'Eliminar',
  variant: 'danger'
});
if (!confirmed) return;
```

> ⚠️ Asegurar que la función contenedora sea `async` si no lo es ya.

---

### Tarea 4: Reemplazar `alert()` en todos los archivos (48 ocurrencias)

**Clasificación por tipo de reemplazo:**

#### 4a. Alertas de **éxito** → `showToast(msg, 'success')`
- SimpleProductScreen:166, ServiceProductScreen:114, ProcessedProductScreen:359
- SalesScreen:90, SubscriptionManagementScreen:140,194
- InventoryScreen:209

#### 4b. Alertas de **error** → `showToast(msg, 'error')`
- TablesScreen:81,103,454, SellScreen:320, SalesScreen:74,77,94
- ProductsScreen:111, ProcessedProductScreen:364
- SimpleProductScreen:170, ServiceProductScreen:118
- SubscriptionManagementScreen:144,200,240,263
- InventoryScreen:160,181,212, ClientsScreen:100,125,681
- CashRegisterScreen:120, useImageUpload:146,214
- App.tsx:1461, GlobalSellTabs:115, MobileNavBar:146
- PaymentSidebar:195, ImageCropper:85, CategorySelector:80

#### 4c. Alertas de **validación/advertencia** → `showToast(msg, 'warning')`
- SimpleProductScreen:124, ServiceProductScreen:75
- ProcessedProductScreen:256,258,288
- PaymentScreen:320, PaymentSidebar:143
- CashRegisterScreen:125,139,157
- TablesScreen:92, SubscriptionManagementScreen:208
- InventoryScreen:200

---

### Tarea 5: Verificación final

**Paso 1:** Buscar en TODO el código que no quede ningún `alert(`, `window.confirm(`, `window.alert(`, ni `confirm(` suelto.

```bash
grep -rn "alert(" --include="*.tsx" --include="*.ts" .
grep -rn "confirm(" --include="*.tsx" --include="*.ts" .
```

**Paso 2:** Probar manualmente las siguientes acciones:
- [ ] Eliminar una mesa → debe salir modal de confirmación
- [ ] Eliminar una sala → modal de confirmación
- [ ] Eliminar un producto → modal de confirmación
- [ ] Eliminar un item de venta → modal de confirmación
- [ ] Eliminar una venta completa → modal de confirmación
- [ ] Eliminar un empleado → modal de confirmación
- [ ] Eliminar método de pago → modal de confirmación
- [ ] Crear un producto → toast de éxito
- [ ] Error al guardar → toast de error
- [ ] Validación de campos vacíos → toast de warning
- [ ] Verificar toast se auto-cierra después de 3 segundos
- [ ] Verificar modal se cierra con ESC
- [ ] Verificar responsive en móvil y desktop

---

## Orden de Ejecución

1. **Tarea 1** — Toast (contexto + componente)
2. **Tarea 2** — ConfirmDialog (contexto + componente)
3. **Tarea 3** — Reemplazar `confirm()` (7 archivos)
4. **Tarea 4** — Reemplazar `alert()` (19 archivos)
5. **Tarea 5** — Verificación

**Tiempo estimado:** ~45-60 minutos de implementación.

---

## Reglas de Seguridad
- No modificar lógica de negocio, solo la capa de UI de notificaciones
- Cada archivo se modifica individualmente para minimizar riesgo
- El comportamiento funcional debe ser idéntico al actual
