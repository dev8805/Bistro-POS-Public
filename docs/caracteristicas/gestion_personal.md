# Gestión de Personal (EmployeesScreen)

Componente: `screens/EmployeesScreen.tsx`  
Acceso: Menú principal → "Empleados"  
Edge Functions involucradas: `create-employee`, `update-employee`, `delete-employee`

Módulo de administración de usuarios del negocio. Permite crear y gestionar los empleados que tendrán acceso a la aplicación, asignarles roles predefinidos, y ajustar sus permisos individualmente. Solo accesible por usuarios con el permiso `admin_users`.

> [!IMPORTANT]
> **Requiere conexión a internet**: cuando no hay red, el componente muestra una pantalla de bloqueo completa ("Sin conexión") y no permite ninguna operación de lectura ni escritura.

---

## Layout y Header (cambio 2026-06-23)

- El header contiene directamente las **pestañas** ("Empleados" / "Roles y Permisos") en formato segmented control compacto. No hay título "Gestión de Personal".
- En el Sidebar, el ítem se llama **"Empleados"** (antes "Personal").
- El formulario y la lista de empleados están en un grid de 2 columnas (`lg:grid-cols-12`, 5/7), **alineados verticalmente** (sin título "Lista de Empleados" ni contador).
- El layout de **tarjetas** (mobile/tablet) se usa hasta `xl` (1280px); la **tabla** de escritorio aparece desde `xl`.
- El botón "Guardar Empleado" solo se habilita cuando los 3 campos obligatorios (nombre, teléfono, rol) están completos.
- **Límite de empleados según el plan**:
  - **Plan Estándar**: Permite un máximo de **3 empleados activos** simultáneos. Se muestra un banner en la columna izquierda con el contador en tiempo real (`Plan Estándar (X/3 usuarios activos)`). Si se intenta crear un cuarto empleado o guardar excediendo el límite, se bloquea la acción y se abre el `UpgradeProModal` invitando a mejorar a Plan Pro.
  - **Plan Pro, Periodo de Prueba y Planes Personalizados**: Usuarios y empleados **ilimitados**. El banner de límite no se muestra.

---

## Pestañas

| Tab | Identificador | Contenido |
|---|---|---|
| **Personal y Nómina** | `payroll` | Directorio de colaboradores sin cuenta de acceso (`PayrollStaffView`), registro de pagos, vales, comprobantes térmicos e historial |
| **Acceso al POS** | `employees` | Usuarios del negocio que inician sesión con teléfono y PIN en Bistro, roles asignados y permisos personalizados |
| **Roles y Permisos** | `roles` | Editor de roles: crear roles y configurar sus 16 permisos base |

---

## Sistema de Permisos

El sistema usa un modelo de **herencia con overrides**: cada empleado hereda los permisos de su rol asignado, y puede tener ajustes individuales (`custom_permissions`) que sobreescriben los del rol.

### Permisos disponibles

| Grupo | ID | Etiqueta en UI | Descripción |
|---|---|---|---|
| **Punto de Venta** | `pos_view` | Acceso al POS | Puede ingresar al módulo de ventas |
| | `pos_sell` | Finalizar Ventas | Puede cobrar y cerrar ventas (si se desactiva, solo toma pedidos / envía comandas) |
| | `pos_open` | Abrir Turno | Puede abrir un turno de caja para vender |
| | `pos_discount` | Aplicar Descuentos | Puede cambiar precios o dar descuentos |
| | `pos_cancel` | Anular Facturas | Puede anular ventas ya realizadas |
| | `pos_refund` | Devoluciones | Puede registrar devoluciones de ventas anteriores |
| | `pos_close` | Cierre de Caja | Puede realizar el arqueo y cierre |
| **Inventario** | `inv_view` | Ver Productos | Consultar lista y precios de productos |
| | `inv_create` | Crear/Editar Productos | Crear, editar y eliminar el catálogo (productos, recetas, servicios, promociones) |
| | `inv_stock` | Ajustar Stock | Modificar cantidades manualmente |
| | `inv_purchase` | Registrar Gastos | Compra de inventario, gastos y mermas (botón "Gastos") |
| **Finanzas** | `clients_view` | Cuentas por Cobrar | Ver clientes y fiados |
| | `debts_view` | Cuentas por Pagar | Ver deudas a proveedores |
| **Administración** | `admin_users` | Gestionar Empleados | Crear usuarios y asignar roles |
| | `admin_reports` | Ver Reportes | Acceso al Dashboard y reportes |
| | `admin_settings` | Configuración | Editar configuración del negocio |

> [!NOTE]
> Etiqueta recalibrada: `inv_purchase` antes era "Registrar Compras" (solo facturas de proveedores). Ahora cubre **todo el botón "Gastos"** (compra de inventario, otros gastos y mermas), por lo que su etiqueta es "Registrar Gastos". El `id` se mantuvo para no romper los roles ya configurados.

### Qué oculta/bloquea cada permiso en la UI

El gateo es **de frontend** (oculta o deshabilita controles); salvo `pos_cancel`/`pos_refund` (anular/devolver) e `inv_create` (productos), que además tienen validación en el servidor.

| Permiso | Si NO lo tiene… |
|---|---|
| `pos_sell` | Se oculta **Procesar Pago** (cobro). Además se oculta **"Orden Rápida"** (en `OpenTicketsBar` y `TableSelectorControl`; el trigger móvil pasa a "Elegir mesa"), no se puede abrir una categoría sin elegir mesa, y se oculta **"Escanear"** (fotolista, `PHOTO_ORDER`). Es la configuración típica de un **mesero** |
| `inv_create` | En Productos se ocultan el botón **Crear** y los de **Editar/Eliminar** (queda solo lectura). Si llega a guardar igual, el servidor responde "No tienes permiso para crear o editar productos" |
| `inv_view` | Se oculta el botón **Productos** del inicio y la sección **"Stock bajo"** |
| `inv_purchase` | Se oculta el botón **Gastos** en SellScreen, GlobalSellTabs e Inicio. El `ExpenseModal` muestra un aviso de bloqueo como red de seguridad |
| `clients_view` | Se oculta **Cuentas por Cobrar** del menú lateral, la tarjeta "Por Cobrar" del inicio y la opción "Abonos de Clientes" |
| `debts_view` | Se oculta **Cuentas por Pagar** del menú lateral, la tarjeta "Por Pagar" del inicio y la opción "Abonos a Proveedor" |
| `pos_cancel` / `pos_refund` | Se ocultan los botones de Anular / Devolución en Facturas y Caja (ver [`anulacion_devolucion_ventas.md`](./anulacion_devolucion_ventas.md)) |

### Cómo se resuelven los permisos efectivos

```
permisos_efectivos = { ...role.permissions, ...employee.custom_permissions }
```

Los `custom_permissions` solo almacenan las diferencias respecto al rol. Si un empleado no tiene overrides, `custom_permissions` es `null` y usa los del rol directamente.

### Permisos "Automáticos" (herencia visible)

Algunos permisos **no se guardan explícitamente**: cuando no están fijados a mano, su valor se **deriva** de otro permiso. En la pantalla aparecen con la etiqueta **"Automático"** y el texto *"Se activa automáticamente según el rol. Tócalo para fijarlo o cambiarlo."* (antes esta etiqueta decía "heredado").

| Permiso | Hereda de (cuando no está fijado) |
|---|---|
| `pos_sell` (Finalizar Ventas) | `pos_view` |
| `pos_open` (Abrir Turno) | `pos_view` |
| `clients_view` (Cuentas por Cobrar) | `pos_view` **o** `inv_view` |
| `debts_view` (Cuentas por Pagar) | `admin_reports` **o** `pos_close` |

Implementación en `EmployeesScreen.tsx`: el mapa `INHERITED_PERMS` y los helpers `getEffectivePerm` / `isInheritedPerm`. La etiqueta y el texto se centralizan en las constantes `AUTO_BADGE_LABEL` y `AUTO_HELP_TEXT`.

> [!NOTE]
> Gracias a la herencia, agregar estos permisos **no cambia lo que ven los empleados existentes**: por defecto siguen igual (valor "Automático"). El dueño puede tocar el interruptor para **fijarlo** (encendido o apagado) y, por ejemplo, ocultar "Cuentas por Cobrar" a un cajero que hoy la ve. La lógica de acceso real vive en `usePermissions.ts` → `canAccessScreen` (CLIENTS/DEBTS respetan el valor explícito y, si no, heredan).

---

## Tab: Empleados

### Lista de Empleados

Muestra todos los usuarios con `business_id` del negocio y `is_deleted = false`. Para cada empleado se muestra:
- Avatar generado con iniciales (color asignado por índice de la lista)
- Nombre completo, teléfono, rol asignado
- Indicador de estado (Activo / Inactivo)
- Botones: Editar, Permisos, **Pausar/Activar**, Eliminar

### Crear Empleado

1. Nombre completo (requerido)
2. Teléfono (requerido — se usa como identificador de acceso)
3. Rol (requerido)
4. Permisos personalizados opcionales (ajustables antes de guardar)

Al guardar, se llama la Edge Function `create-employee` que:
- Crea el usuario en Supabase Auth
- Genera un **email sintético** con formato `{teléfono_sin_más}@bistro.temp`
- Asigna el **PIN por defecto `1234`** como contraseña (Supabase Auth). El empleado entra con teléfono+`1234` o por SMS, y puede cambiarlo desde su perfil.
- Crea el perfil en la tabla `profiles` con el `business_id` del negocio

El formulario de creación muestra un aviso de que el PIN por defecto será `1234` (solo al crear, no al editar). Ver el flujo de PIN en [`autenticacion_acceso.md`](./autenticacion_acceso.md).

Si se configuraron permisos personalizados antes de crear, se aplican al perfil inmediatamente después de la creación.

> [!NOTE]
> El número de teléfono se normaliza automáticamente agregando el prefijo `+57` (Colombia) si no comienza con `+`. Si el negocio tiene empleados con números internacionales, esta normalización generará emails sintéticos con formato incorrecto.

---

## Tab: Roles y Permisos

### Crear un Rol

1. Nombre del rol (único por negocio)
2. Descripción (opcional)
3. Los permisos se configuran después de crear

El nuevo rol se crea con `permissions: {}` (sin permisos). El administrador debe asignar los permisos manualmente después.

### Editar Permisos de un Rol

Panel de checkboxes por grupo (Punto de Venta / Inventario / Finanzas / Administración). Los cambios se guardan con el botón "Guardar Permisos" y actualizan la columna `permissions` en la tabla `roles`.

> [!IMPORTANT]
> Cambiar los permisos de un rol **afecta inmediatamente a todos los empleados que tienen ese rol**, excepto a los que tienen `custom_permissions` que sobreescriban esos permisos. No hay confirmación ni historial del cambio.

### Roles del Sistema (`is_system_role = true`)

Los roles marcados como del sistema no se pueden eliminar. Cada negocio se siembra con cuatro roles base mediante la función SQL `seed_default_roles(p_business_id)` (Supabase, `SECURITY DEFINER`, idempotente con `ON CONFLICT (business_id, name) DO NOTHING`):

| Rol | Permisos base (resumen) |
|---|---|
| **Administrador** | Acceso total (todos los permisos en `true`) |
| **Cajero** | `pos_view`, `pos_close`, `inv_view` (vende y maneja caja) |
| **Mesero** | `pos_view` únicamente; **`pos_sell: false`, `pos_open: false`, `inv_view: false`, `clients_view: false`** explícitos → solo toma pedidos por mesa y envía comandas, sin cobrar, sin Productos ni Cuentas por Cobrar |
| **Cocinero** | `inv_view` (visualización de comandas; sin `pos_view`) |

> [!IMPORTANT]
> El rol **Mesero** fija `pos_sell`, `inv_view` y `clients_view` en `false` de forma **explícita**. Si quedaran sin fijar, heredarían de `pos_view` (que está en `true`) y el mesero podría cobrar y ver Cuentas por Cobrar. La fuente de verdad de estos defaults es `seed_default_roles` en la BD (pendiente versionar en `supabase/migrations/`).

> [!NOTE]
> **Tampoco se puede eliminar un rol con empleados asignados**: si `employee_count > 0`, el sistema bloquea la eliminación con un toast de error. Primero reasigna los empleados a otro rol.

---

## Flujo: Desactivar vs Eliminar un Empleado

| Acción en UI | Efecto | Reversible |
|---|---|---|
| **Pausar** | `is_active = false`, el empleado pierde acceso inmediatamente y cierra sesión | Sí — con "Activar" |
| **Eliminar** | `is_deleted = true` (soft delete), acceso permanentemente revocado. Sus ventas e historial se conservan | No |

Ambas acciones pasan por la Edge Function `delete-employee` con diferente `action`:
- `'deactivate'` → `is_active = false` en `profiles` + `banned_until = NOW() + 876000h` (~100 años) en `auth.users`
- `'reactivate'` → `is_active = true` en `profiles` + `banned_until = NULL` en `auth.users`
- `'delete'` → soft delete: `is_deleted = true`, libera el email/phone sintético en Auth para reutilización

> [!WARNING]
> La desactivación crea **dos bloqueos independientes**: `is_active = false` en `profiles` y `banned_until` ~año 2126 en `auth.users`. El `AuthContext` bloquea por `is_active = false` al cargar el perfil; Supabase bloquea por `banned_until` al verificar el token. Si alguno de los dos queda inconsistente (por ejemplo, un fallo parcial de la Edge Function), el usuario puede quedar bloqueado sin causa aparente. Para diagnosticar y corregir manualmente vía SQL:
> ```sql
> -- Ver estado actual
> SELECT u.id, u.banned_until, p.is_active
> FROM auth.users u JOIN public.profiles p ON p.id = u.id
> WHERE u.phone = '+57XXXXXXXXXX';
>
> -- Reparar estado inconsistente
> UPDATE auth.users SET banned_until = NULL WHERE phone = '+57XXXXXXXXXX';
> UPDATE public.profiles SET is_active = true WHERE id = '<uuid>';
> ```

**Protección del dueño**: el `owner_id` del negocio (tabla `businesses`) se carga al montar y se verifica antes de cada acción. No se puede desactivar ni eliminar al dueño.

**Protección de auto-baja**: los botones **Pausar/Activar** y **Eliminar** también se ocultan cuando `employee.id === profile.id` (el administrador actual). Un administrador no puede desactivarse ni eliminarse a sí mismo.

---

## Flujo: Permisos Personalizados por Empleado

Desde la lista de empleados → botón "Permisos" → modal de edición individual.

El modal muestra todos los permisos del sistema con el estado actual del empleado (combinación rol + overrides). Al guardar, solo se persisten las diferencias respecto al rol base (delta mínimo).

El botón "Restablecer a rol" limpia todos los `custom_permissions` del empleado, dejándolo con exactamente los permisos del rol.

> Al cambiar el rol de un empleado desde el formulario de edición, sus `custom_permissions` se limpian automáticamente para que los overrides del rol anterior no contaminen el nuevo rol.

---

## Lo que NO puede hacer

- **No gestiona horarios ni turnos de empleados** — para eso existe el módulo de Caja (`useCashRegister`), pero la asignación de horarios como tal no existe.
- **No tiene log de actividad por empleado** — no hay auditoría de "qué hizo cada empleado". No se puede saber qué vendió, cuánto abrió caja, o qué modificó.
- **No resetea el PIN de un empleado desde gestión** — el empleado nace con PIN `1234` y solo él puede cambiarlo desde su perfil. Si lo olvida, su vía de recuperación es entrar por SMS y cambiarlo. El dueño no puede resetearlo desde esta pantalla.
- **No permite configurar permisos sin asignar un rol** — el rol es campo obligatorio. No hay opción de crear un empleado "solo con permisos personalizados" sin un rol base.

---

## Inconsistencias y Notas

> [!NOTE]
> **PIN por defecto `1234`**: al crear un empleado, `EmployeesScreen` envía `password: '1234'` a la Edge Function `create-employee`. El formulario avisa de este PIN al administrador. El empleado puede cambiarlo desde su perfil (`ProfileScreen` → "Cambiar PIN"). Antes de este cambio, la contraseña era aleatoria (`{8chars}Aa1!`) y nadie la conocía.

> [!NOTE]
> **El teléfono siempre se prefixa con `+57`**: si el número ya comienza con `+`, no se agrega el prefijo. Pero si el empleado tiene un número sin `+` y de otro país, se generará `+57XXXXXXXXXX`, que es un número colombiano incorrecto. No hay validación de país.

> [!NOTE]
> **`custom_permissions` se calcula como delta mínimo**: solo se guardan los permisos que difieren del rol. Al cambiar de rol, los overrides anteriores se limpian automáticamente.
