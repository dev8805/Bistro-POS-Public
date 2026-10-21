---
inclusion: always
---

# Estructura del Proyecto

## Archivos clave

- `App.tsx` — Router principal, layout global, detección desktop/móvil
- `screens/` — Pantallas por módulo (MenuScreen, PaymentScreen, DashboardScreen, etc.)
- `components/` — Componentes reutilizables; `components/ui/` para base
- `hooks/` — Custom hooks (useCashRegister, useOfflineSync, useProducts, usePermissions, etc.)
- `lib/` — Utilidades (timezone colombiana, export PDF/Excel, offline queue)
- `context/` — AuthContext, BusinessSettingsContext, ToastContext
- `supabase/functions/` — Edge functions Deno
- `workers/` — Web Workers

## Convenciones de archivos

```
src/
  screens/      → NombreScreen.tsx        (una por módulo principal)
  hooks/        → useNombre.ts            (lógica de estado reutilizable)
  components/   → NombreComponente.tsx    (UI sin lógica de negocio)
  context/      → NombreContext.tsx       (estado global compartido)
  lib/          → utilidades y helpers
```

## Sistema de permisos

| Permiso | Pantalla |
|---------|----------|
| `pos_view` | Menú / POS (ventas) |
| `admin_reports` | Dashboard, clientes, deudas |
| `inv_view` / `inv_create` | Inventario |
| `admin_users` | Empleados |
| `admin_settings` | Configuración |

## Soporte offline obligatorio

Si una feature toca estos flujos, DEBE tener soporte offline:
- Registro de ventas
- Apertura/cierre de caja
- Abono a deudas o clientes
- Registro de compras o gastos
- Registro de mermas

Arquitectura completa en `docs/caracteristicas/modo_offline.md`.
