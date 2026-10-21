---
name: implementar-feature-bistro
description: Guía para implementar nuevas funcionalidades en BistroPOS siguiendo las convenciones del proyecto. Úsese cuando el usuario pida una nueva feature, módulo, pantalla o componente. Garantiza que el agente revise la documentación existente, evalúe el impacto en offline y en el flujo de ventas antes de escribir código.
---

# Implementar Feature en BistroPOS

## Checklist pre-implementación (obligatorio)

Antes de escribir una sola línea de código:

- [ ] **¿Existe documentación de esta feature?** Buscar en `docs/caracteristicas/` (índice abajo)
- [ ] **¿Toca `App.tsx`?** Leer `docs/arquitectura/APP_TSX_MAPA.md` antes de proponer cambios
- [ ] **¿Afecta el flujo de ventas?** (`SellScreen` → `MenuScreen` → `handleAddToOrder` → `handleProcessPayment`)
- [ ] **¿Requiere soporte offline?** Si toca ventas, pagos, inventario o caja → sí, es necesario
- [ ] **¿Requiere cambios en Supabase?** → Usar skill `gestionar-supabase`
- [ ] **¿Ya existe un hook o componente similar?** Verificar con `grep_search` antes de crear uno nuevo

---

## Índice de documentación de features

Cada módulo tiene su doc en `docs/caracteristicas/`:

| Feature | Archivo |
|---------|---------|
| Autenticación y acceso (login, OTP, Google) | `autenticacion_acceso.md` |
| Perfil de usuario y permisos | `perfil_usuario.md` |
| Gestión de personal (empleados, roles) | `gestion_personal.md` |
| Catálogo de productos | `catalogo_productos.md` |
| Creación de productos (flujo completo) | `flujo_creacion_productos.md` |
| Importación por Excel | `flujo_importacion_excel.md` |
| Creación de promociones | `flujo_creacion_promociones.md` |
| Ventas desktop (pantalla POS) | `flujo_ventas_desktop.md` |
| Ventas móvil y tablet | `flujo_ventas_movil_tablet.md` |
| Lector de códigos de barras (EAN) | `lector_codigos_barras.md` |
| Venta por peso o medida | `venta_por_peso_medida.md` |
| Historial de ventas | `historial_ventas.md` |
| Clientes y cuentas por cobrar | `clientes_cuentas_cobrar.md` |
| Dashboard y reportes | `dashboard.md` |
| Conteo de inventario | `conteo_inventario.md` |
| Compras y abastecimiento | `flujo_compra_inventario.md` |
| Registro de gastos | `flujo_registro_gasto.md` |
| Registro de mermas | `flujo_registro_mermas.md` |
| Deudas del negocio (proveedores) | `deudas_negocio.md` |
| Escaneo de facturas con IA | `escaneo_facturas_ia.md` |
| Modo offline (arquitectura completa) | `modo_offline.md` |
| Suscripciones y pagos (Wompi) | `suscripciones_pagos.md` |
| Ajustes de facturación | `ajustes_facturacion.md` |

---

## Convenciones del proyecto

```
src/
  screens/      → NombreScreen.tsx        (una por módulo principal)
  hooks/        → useNombre.ts            (lógica de estado reutilizable)
  components/   → NombreComponente.tsx    (UI sin lógica de negocio)
  context/      → NombreContext.tsx       (estado global compartido)
  lib/          → utilidades y helpers
```

### Reglas de implementación
- **Identificación de negocios**: Cuando se mencione un número de negocio (ej. "negocio 10000", "negocio 10002"), se refiere SIEMPRE a la columna `public_id` de la tabla `businesses` en Supabase (no al UUID `id`).
- **No tocar `App.tsx`** sin revisar el mapa. Si hay alternativa en un hook o screen, úsala.
- **Offline primero**: si la feature toca datos de venta o caja, preguntar si necesita soporte offline antes de implementar.
- **RLS desde el inicio**: si se crea una tabla nueva, incluir políticas RLS en la misma migración.
- **No crear hooks genéricos** que no se usen de inmediato (YAGNI).
- **No crear nuevos problemas** al implementar: cambiar solo lo estrictamente relacionado con la feature.

---

## Sistema de permisos (referencia rápida)

Cada pantalla verifica permisos del perfil del usuario:

| Permiso | Pantalla que lo usa |
|---------|-------------------|
| `pos_view` | Menú / POS (ventas) |
| `admin_reports` | Dashboard, clientes, deudas |
| `inv_view` / `inv_create` | Inventario |
| `admin_users` | Empleados |
| `admin_settings` | Configuración |

Ver detalle completo en `docs/caracteristicas/perfil_usuario.md` y `gestion_personal.md`.

---

## Impacto offline — cuándo es obligatorio

Si la feature toca cualquiera de estos flujos, **debe tener soporte offline**:
- Registro de ventas
- Apertura/cierre de caja
- Abono a deudas o clientes
- Registro de compras o gastos
- Registro de mermas

Ver arquitectura completa en `docs/caracteristicas/modo_offline.md`.

---

## Recursos
- Mapa de App.tsx → `docs/arquitectura/APP_TSX_MAPA.md`
- Features → `docs/caracteristicas/`
- Supabase → skill `gestionar-supabase`
