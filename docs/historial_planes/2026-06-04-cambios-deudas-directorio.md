# Cambios Deudas — Pestaña Directorio de Proveedores — 4 Junio 2026

Resumen del cambio realizado en `screens/DebtsScreen.tsx` para agregar la vista de Directorio de Proveedores como pestaña activa en la UI.

---

## Problema

Cuando un proveedor saldaba completamente su deuda (`remaining === 0`), desaparecía de la pantalla de Deudas porque el filtro de la pestaña "Cuentas por Pagar" excluye proveedores sin saldo pendiente. Esto hacía imposible acceder al historial de movimientos de ese proveedor desde la interfaz.

---

## Solución

Se activó la pestaña **"Directorio Proveedores"** que estaba parcialmente preparada en el código (el estado `activeTab` y la lógica de `filteredGroups` ya existían) pero no tenía UI renderizada.

---

## Cambios Realizados

### 1. Tabs en el Header

Se agregó un selector tipo pill/toggle en el header de la pantalla con dos opciones:

| Tab | Texto Desktop | Texto Móvil | Comportamiento |
|---|---|---|---|
| `payable` | Cuentas por Pagar | Por Pagar | Muestra KPIs + Análisis + Facturas Pendientes (contenido original) |
| `directory` | Directorio Proveedores | Directorio | Muestra grid de todos los proveedores |

**Implementación visual:**
- Contenedor con `bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5`
- Botón activo: `bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm`
- Botón inactivo: `text-gray-500 dark:text-gray-400`

### 2. Contenido Condicional

El contenido existente (KPIs, Análisis de Cartera, Detalle Operativo) se envolvió en `{activeTab === 'payable' && (<>...</>)}` para que solo se renderice en esa pestaña.

### 3. Vista del Directorio (`activeTab === 'directory'`)

Nueva sección que incluye:

- **Header** con título, descripción y botón "Nueva Deuda"
- **Buscador** que reutiliza el estado `searchQuery` existente
- **Grid de tarjetas** responsivo (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`)

**Cada tarjeta muestra:**
- Avatar circular con la inicial del proveedor (usando `group.color || '#6b7280'`)
- Nombre del proveedor con indicador rojo si tiene deuda activa
- NIT y teléfono (si están registrados)
- Estado: monto pendiente (rojo) o "Al día" (verde)
- Cantidad total de movimientos
- Chevron derecho como affordance de navegación

**Al hacer clic** en una tarjeta → `setSelectedCreditor(group)` → abre el mismo panel lateral de detalle existente con historial completo.

### 4. Estado vacío

Si no hay proveedores (o la búsqueda no encuentra resultados):
- Icono `store`
- Texto: "No hay proveedores registrados"
- Subtexto explicativo

---

## Lógica de Filtrado (sin cambios)

La lógica de `filteredGroups` ya existente funciona correctamente para ambas pestañas:

```tsx
const filteredGroups = creditorGroups.filter(g => {
    // Solo filtra por remaining cuando es la pestaña payable
    if (activeTab === 'payable' && g.remaining <= 0) return false;

    // Búsqueda aplica en ambas pestañas
    if (searchQuery.trim()) {
        // ... filtro por nombre, NIT, teléfono
    }
    return true;
});
```

En la pestaña "directory" no se aplica el filtro de `remaining <= 0`, por lo que **todos los proveedores aparecen** independientemente de su estado de deuda.

---

## Archivos Modificados

| Archivo | Cambios |
|---|---|
| `screens/DebtsScreen.tsx` | Tabs en header, contenido condicional por tab, vista de directorio con grid de tarjetas |
| `docs/caracteristicas/deudas_negocio.md` | Actualizada sección "Directorio de Proveedores" con la nueva UI |
| `docs/guias_usuario/como_gestionar_deudas_negocio.md` | Actualizado Paso 8 con la nueva presentación en tarjetas |

---

## Notas

- El panel lateral de detalle del proveedor funciona exactamente igual desde ambas pestañas (misma lógica de `selectedCreditor`).
- El historial de movimientos de un proveedor sin deuda activa sigue siendo accesible — los registros de compras y abonos pasados se mantienen en `business_debts`.
- No se crearon nuevos estados ni hooks — se reutiliza toda la infraestructura existente.
