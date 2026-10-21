# Plan de Configuración de Impresión

**Objetivo:** Trasladar la configuración de impresión de tickets desde `ProfileScreen` a un panel lateral global de ajustes accesible desde el `Sidebar`, e incorporar nuevos campos (teléfono, dirección, nombre de negocio para facturas) para los encabezados de tickets térmicos y PDF que funcionen independientemente del perfil del negocio.
**Arquitectura:** Se creará un nuevo componente modal tipo panel lateral (inspirado en `WidgetSidebarPanel`) llamado `SettingsSidebarPanel` (o similar) que se invocará desde `Sidebar`. Se extenderá el contexto `BusinessSettingsContext` para manejar la actualización de estos nuevos campos independientes.
**Tech Stack:** React, TailwindCSS, Supabase.

---

### Tarea 1: Actualizar Base de Datos y Contexto

**Consideraciones y Preguntas Pendientes:**
- Las facturas requerirán sus propios datos desconectados de los generales. Se asume la creación de nuevas columnas específicas en la tabla `businesses` de Supabase:
  - `receipt_business_name` (Texto)
  - `receipt_phone` (Texto)
  - `receipt_address` (Texto)

**Archivos afectados:**
- Modify: Base de datos Supabase (Dashboard / SQL Editor) - Migración sugerida
- Modify: `context/BusinessSettingsContext.tsx`
- Modify: `hooks/useBusinessSettings.ts` (si es necesario)
- Modify: `types.ts` / Interfaces correspondientes

**Paso 1:** Ejecutar SQL en Supabase para crear las nuevas columnas (`receipt_business_name`, `receipt_phone`, `receipt_address`) en la tabla `businesses`.
**Paso 2:** Añadir estos campos al estado en `BusinessSettingsContext` y obtenerlos en el fetch principal de Supabase.
**Paso 3:** Exponer un método de actualización de datos de factura (ej. `updateReceiptSettings({ name, phone, address })`) al Context provider.

### Tarea 2: Crear el Panel Lateral de Configuración

**Archivos afectados:**
- Create: `components/SettingsSidebarPanel.tsx`

**Paso 1:** Replicar la estructura visual de `WidgetSidebarPanel.tsx` pero adaptada a ajustes de factura e impresora.
**Paso 2:** Añadir el formulario con los inputs para:
- Nombre del Negocio (A mostrar en facturas)
- NIT/RUT
- Teléfono de Contacto (Para facturas)
- Dirección (Para facturas)
- Ancho de Papel (80mm vs 58mm)
- Impresora Térmica WebUSB (estado, conectar, desconectar).

### Tarea 3: Modificar `Sidebar.tsx` para lanzar el panel

**Archivos afectados:**
- Modify: `components/Sidebar.tsx`

**Paso 1:** Importar `SettingsSidebarPanel`
**Paso 2:** Añadir el estado `isSettingsPanelOpen`
**Paso 3:** Para usuarios "Administrador", añadir el botón pertinente (ej. "Configuración / Ajustes de Impresión") que abra este panel. Si es Desktop en la parte inferior, y si es Móvil, agregarlo al sub-menú de configuración existente o donde sea más intuitivo, enlazando el click al estado `isSettingsPanelOpen = true`.

### Tarea 4: Limpiar `ProfileScreen.tsx`

**Archivos afectados:**
- Modify: `screens/ProfileScreen.tsx`

**Paso 1:** Eliminar por completo la tarjeta que dice "Impresión de Tickets" (configuración de ancho de papel, conexión USB, y NIT).
**Paso 2:** Mantener solo los campos relevantes de "Mi Perfil" e información principal de sesión.
**Paso 3:** Ajustar las clases de Tailwind y responsividad para que la pantalla no quede descuadrada.

### Tarea 5: Asegurar la inyección de datos a facturas

**Archivos afectados:**
- Modify: `lib/shareReceiptPDF.ts` y generadores de datos (`PaymentSidebar`, `SuccessSidebar.tsx`, `CashRegisterScreen.tsx`, `SalesScreen.tsx`).
- Modify: `components/ReceiptThermalPDF.tsx`
- Modify: `lib/thermalPrinterService.ts`

**Paso 1:** Modificar los flujos para que, al ensamblar la data `ReceiptData`, las propiedades `businessName`, `businessPhone`, `businessAddress` usen estrictamente `receipt_business_name` (con fallback de emergencia a `businessName`), `receipt_phone` y `receipt_address` inyectadas desde el `BusinessSettingsContext`.
**Paso 2:** Verificar espaciados de altura dinámica en PDF térmica, probando los saltos de línea con direcciones largas.
