# Ajustes de Facturación (SettingsSidebarPanel)

Componente: `components/SettingsSidebarPanel.tsx`  
Componente reutilizable de conexión: `components/PrinterConnectionCard.tsx`  
Panel de impresora para roles operativos: `components/PrinterSettingsPanel.tsx`  
Panel de modos (Activar/Desactivar): `components/SalesModeSettingsPanel.tsx`  
Hook principal: `hooks/useBusinessSettings.ts`  
Hook auxiliar: `hooks/useImageUpload.ts`  
Acceso: Requiere permiso `admin_settings` → botón "Ajustes" en Sidebar (desktop) o Inicio → Gestión → Configuración (móvil)

Panel lateral que centraliza los datos que se imprimen en **tickets físicos** (impresora térmica) y en **facturas PDF**. También incluye la configuración de la impresora térmica USB.

---

## Acceso en móvil (cambio 2026-08)

En móvil, ya no se accede desde el drawer lateral ("Más"). El flujo es:

1. Pantalla de **Inicio** → sección **Gestión** → botón **Configuración**
2. Se abre un **action sheet** (bottom sheet) con dos opciones:
   - **Facturación e Impresión** → abre `SettingsSidebarPanel`
   - **Activar/Desactivar** → abre `SalesModeSettingsPanel`
3. Los paneles se montan directamente en `HomeScreen.tsx` como overlays `fixed` con `isOpen`/`onClose`.

> El botón "Configuración" solo aparece si el usuario tiene permiso `admin_settings`.

---

## Submenú de Ajustes en el Sidebar (desktop)

El botón "Ajustes" del Sidebar ahora despliega un **submenú** con dos opciones:

| Opción | Panel que abre | Descripción |
|---|---|---|
| **Facturación e Impresión** | `SettingsSidebarPanel` | Datos comerciales (colapsable), ancho de papel, conexión de impresora |
| **Activar/Desactivar** | `SalesModeSettingsPanel` | Toggle del Modo Catálogo (config del negocio) |

### Comportamiento de los paneles
- Comparten un **backdrop único** (montado mientras cualquiera esté abierto) para evitar parpadeo al cambiar.
- Al abrir uno, el otro se cierra automáticamente (mutuamente excluyentes).
- Ambos entran con animación **slide desde la derecha** (`slideInRight`).
- El submenú de escritorio **permanece abierto** mientras un panel está activo (no se colapsa al hacer clic en el panel).
- El offset izquierdo del backdrop usa la variable CSS `--sidebar-w` para alinearse con el ancho real del sidebar (colapsado/expandido).

### Sección "Datos Comerciales" (colapsable)
- La tarjeta de datos comerciales (Nombre, NIT, Teléfono, Dirección) **arranca colapsada** al abrir el panel.
- Un clic en el encabezado la expande/colapsa (acordeón).
- El botón **Guardar** vive **dentro** de la tarjeta (no en un pie de panel).
- El pie del panel fue eliminado (la X del header cierra).

---

## Acceso a la impresora por rol

La **conexión de la impresora** es una tarea operativa **por dispositivo** (la impresora seleccionada se guarda en `localStorage`, no en el negocio), por lo que debe estar disponible para cualquier rol que atienda una caja, no solo para el administrador. Por eso existen dos puntos de entrada:

| Rol | Acceso | Qué ve |
|---|---|---|
| **Con `admin_settings`** (administrador) | Sidebar → "Ajustes" → "Facturación e Impresión" (`SettingsSidebarPanel`) | Panel completo: datos comerciales (colapsable), ancho de papel, conexión de impresora |
| **Sin `admin_settings`** (cajero, mesero…) | Sidebar → "Impresora" (`PrinterSettingsPanel`) | Panel reducido: solo ancho de papel y conexión de impresora |

> [!NOTE]
> El botón "Impresora" del Sidebar **solo aparece para roles sin `admin_settings`** (escritorio expandido/colapsado y menú móvil). Para el administrador sería redundante, ya que la conexión vive dentro de "Facturación e Impresión". El bloque de conexión es el mismo en ambos paneles (componente compartido `PrinterConnectionCard`), por lo que no se duplica lógica.

> [!NOTE]
> El panel `PrinterSettingsPanel` también se abre **bajo demanda** desde el Historial de Ventas: al presionar imprimir ticket/comanda sin impresora conectada, se abre este panel para elegir y conectar. Ver [`historial_ventas.md`](./historial_ventas.md).

> [!WARNING]
> **El ancho de papel se guarda a nivel negocio** (tabla `businesses`, campo `receipt_paper_width`), no por dispositivo. Si un cajero lo cambia desde el panel "Impresora", el cambio **aplica a todas las estaciones** del negocio. Se dejó así de forma intencional. Si se necesitara que fuera por dispositivo, habría que persistirlo en `localStorage` (cambio pendiente, no implementado).

---

## Campos Configurables

| Campo | Dónde aparece | Notas |
|---|---|---|
| **Logo del Negocio** | Facturas PDF y tickets (si la impresora soporta imágenes) | Almacenado en Supabase Storage, bucket `business-logos`. **Oculto temporalmente en la UI** — pendiente de mejora (aspecto 1:1 vs. logos rectangulares) |
| **Nombre en Facturas** | Encabezado del ticket y PDF | Si se deja vacío, usa `businessName` (nombre del negocio del sistema) |
| **NIT / RUT del Negocio** | Encabezado del ticket y PDF | Solo acepta dígitos, puntos y guiones. Muestra error en UI si el formato es inválido |
| **Teléfono de Contacto** | Pie del ticket y PDF | Texto libre, sin validación |
| **Dirección** | Pie del ticket y PDF | Texto libre, sin validación |

Todos los campos se guardan en la tabla `businesses` del negocio activo.

---

## Logo del Negocio

> [!NOTE]
> **La sección de logo está oculta temporalmente en la UI** (`SettingsSidebarPanel`). El campo `logo_url` sigue existiendo en la base de datos y se sigue usando en tickets PDF y comprobantes de email. La UI para cargarlo se retirará hasta mejorar el manejo de logos rectangulares (el cropper actual fuerza aspecto 1:1).

El logo aún puede cargarse directamente en la base de datos o vía herramientas de administración. El hook `useImageUpload` y el componente `ImageCropper` siguen presentes en el código.

### Flujo del logo (cuando esté habilitado)

1. El usuario selecciona o pega una imagen.
2. Se abre `ImageCropper` con relación de aspecto **1:1** (cuadrado forzado).
3. Tras confirmar el recorte, la imagen se sube a Supabase Storage (`business-logos/{business_id}`).
4. La URL pública se guarda en el campo `logo_url` de la tabla `businesses`.
5. Al generar un ticket PDF o imprimir, se usa esa URL para mostrar el logo.

---

## Nombre en Facturas vs. Nombre del Negocio del Sistema

Existe una distinción entre dos campos:

| Campo | Tabla | Uso |
|---|---|---|
| `businessName` (`businesses.name`) | `businesses` | Nombre operativo del negocio, usado en toda la app |
| `receiptBusinessName` (`businesses.receipt_business_name`) | `businesses` | Nombre que aparece en tickets y PDFs |

El `receipt_business_name` es opcional. Si está vacío, el ticket usa `businessName` como fallback. Esto permite tener un nombre interno del negocio diferente al nombre comercial que aparece en las facturas (ej: nombre interno "Mi Tienda SAS", nombre en ticket "Minimercado La Esquina").

---

## Sección: Impresora Térmica

Esta sección es **independiente** de los datos de facturación — no se guarda con el botón "Guardar Cambios", sino que opera en tiempo real. El bloque de conexión está extraído en el componente reutilizable `PrinterConnectionCard`, usado tanto por `SettingsSidebarPanel` (admin) como por `PrinterSettingsPanel` (roles operativos).

### Ancho del Papel

Dos opciones: **80mm** (estándar, seleccionado por defecto) y **58mm** (compacto). Cambia inmediatamente al hacer clic, sin requerir "Guardar". Se almacena en `useBusinessSettings` como `receiptPaperWidth` y afecta el layout del ticket al imprimir. Disponible en ambos paneles (admin y operativo). Ver la advertencia de alcance a nivel negocio en [Acceso a la impresora por rol](#acceso-a-la-impresora-por-rol).

### Conexión a la impresora (QZ Tray)

Permite conectar una impresora térmica reconocida por el sistema operativo, a través de **QZ Tray** (app de escritorio que la app contacta por WebSocket local). Ver detalle técnico en [`impresion_termica_qz.md`](./impresion_termica_qz.md).

| Estado | Color del indicador | Texto |
|---|---|---|
| Desconectada | Gris | "Desconectada" |
| Conectando | Amarillo parpadeante | "Conectando..." |
| Conectada | Verde parpadeante | "Conectada" |

- **Conectar**: lista las impresoras del sistema vía QZ y conecta (si hay varias, muestra un selector).
- **Desconectar**: libera la impresora seleccionada.
- Al montar el panel, intenta **reconectar automáticamente** la última impresora guardada (`reconnectPrinter()`).

> [!NOTE]
> **Lista de impresoras en flujo normal**: cuando hay varias impresoras, el selector se renderiza **inline** (debajo del botón Conectar), no como menú flotante. Esto garantiza que la lista siempre se vea completa y que el panel haga scroll si es necesario, evitando que quede recortada. Incluye un botón "Cancelar" para cerrarla.

> [!WARNING]
> Requiere **QZ Tray instalado** en el equipo. A diferencia del enfoque anterior (WebUSB + Zadig), QZ funciona en cualquier navegador y no necesita drivers WinUSB por impresora. Para imprimir **sin diálogos**, el equipo debe tener el certificado de Bistro confiado (`override.crt`); ver el instalador en `qz-setup/`.

> [!NOTE]
> La conexión de la impresora **no se guarda con el botón "Guardar Cambios"**. El botón de guardar solo aplica a los campos de datos (nombre, NIT, teléfono, dirección, logo). El ancho del papel también guarda inmediatamente sin necesitar el botón.

---

## Lógica de "Guardar Cambios"

El botón "Guardar Cambios" está **desactivado** cuando no hay cambios pendientes (aparece como "Guardado" con ícono de check) o cuando el NIT tiene formato inválido. Se activa automáticamente al detectar diferencias entre el estado inicial y el estado actual del formulario:

```
hasChanges = (
  formData.receipt_business_name !== receiptBusinessName ||
  formData.nit !== businessNit ||
  formData.receipt_phone !== receiptPhone ||
  formData.receipt_address !== receiptAddress ||
  imageUrl !== logoUrl
)
```

Al guardar, ejecuta:
1. `updateReceiptSettings({ nit, receipt_business_name, receipt_phone, receipt_address })` — un único `UPDATE` en Supabase con todos los campos de texto
2. Si el logo cambió → `updateLogoUrl(imageUrl)` (separado porque requiere operación en Storage primero)

El paso 1 es atómico: si falla, ningún campo queda guardado a medias. El logo sigue siendo una llamada aparte por necesidad técnica.

---

## Dónde se Usan estos Datos

| Módulo | Dato utilizado |
|---|---|
| **Tickets de venta** (impresión térmica / PDF) | Nombre, NIT, teléfono, dirección, logo |
| **Comprobante de email** (Edge Function `send-receipt-email`) | Nombre del negocio, logo |
| **Recordatorio de deuda a clientes** | Nombre del negocio |
| **Historial de ventas / PDF de transacciones** | Nombre, NIT, logo |
| **Dashboard** | `businessName` (no el `receipt_business_name`) |

Ver también: [`historial_ventas.md`](./historial_ventas.md) para el contexto del PDF exportado.

---

## Documentos Contables (oculto temporalmente)

> [!NOTE]
> **La opción "Documentos Contables" está oculta en la UI** — tanto en el menú de ajustes del sidebar desktop como en el panel móvil (`Sidebar.tsx`). El acceso a `Screen.CONTINGENCY_DOC` existe en el código y los permisos (`canAccessScreen`) siguen intactos; solo se ocultó el botón con `{false && canAccessScreen(Screen.CONTINGENCY_DOC) && ...}`.

La pantalla `ContingencyDocScreen` y su lógica (control de documentos de contingencia y correlativos) permanecen en el codebase. No eliminar ni tocar hasta definir si la funcionalidad se recupera o se descarta.

---

## Vista Previa del Ticket

Componente: `components/ReceiptPreviewCard.tsx`  
Renderizador reutilizado: `components/ReceiptThermal.tsx`

Permite al usuario ver cómo quedará el ticket impreso **antes de imprimir**, usando los datos comerciales del formulario en tiempo real y productos de ejemplo.

### Comportamiento por viewport

| Viewport | Comportamiento |
|---|---|
| **Desktop (≥1024px)** | El preview se muestra **permanentemente** a la izquierda del panel de ajustes, centrado verticalmente. Se actualiza en vivo mientras el usuario escribe nombre, NIT, teléfono o dirección, y al cambiar el ancho del papel. |
| **Tablet/Móvil (<1024px)** | Aparece un link **"Ver ticket"** (texto negro, subrayado, sin icono) en la fila del encabezado "Datos Comerciales". Al pulsarlo se abre un modal centrado con la vista previa. |

### Datos mostrados en el preview

- **Encabezado**: Nombre en facturas (o nombre del negocio como fallback), NIT, dirección, teléfono — tomados del estado local del formulario (reflejan lo que el usuario está editando, no lo guardado en BD).
- **Cuerpo**: 3 productos ficticios con cantidades variadas (unidad y peso), subtotal, total, método de pago, cambio.
- **Pie**: Cajero de ejemplo, número de orden ficticio, fecha/hora actual.
- **Ancho**: Respeta el selector de ancho de papel activo (58mm / 80mm).

### Posicionamiento Desktop

```
┌──────────┬────── backdrop ──────────────────────────────────────┬──────────────────┐
│ Sidebar  │          ┌──────────────┐                            │  Panel Ajustes   │
│          │          │  Preview del │                            │  (480px max)     │
│          │          │  ticket      │  ← centrado verticalmente  │                  │
│          │          │  (380px)     │                            │                  │
│          │          └──────────────┘                            │                  │
└──────────┴──────────────────────────────────────────────────────┴──────────────────┘
```

El preview desktop usa `fixed inset-y-0 right-[480px] z-[90] w-[380px]` con `pointer-events-none` en el contenedor y `pointer-events-auto` en el contenido scrollable.

### Modal Móvil/Tablet

- z-index: `z-[100]` (por encima del panel y su backdrop).
- Backdrop propio con `backdrop-blur-sm`.
- Cierra con clic en backdrop o botón X.
- Animación `slideUp` de entrada.
- Max width: 360px, max height: 85vh con scroll.

### Componente `ReceiptPreviewCard`

Props:
```typescript
interface ReceiptPreviewCardProps {
    businessName: string;
    businessNit: string;
    businessPhone: string;
    businessAddress: string;
    paperWidth: '58mm' | '80mm';
}
```

Internamente construye un objeto `ReceiptData` mock y lo pasa a `ReceiptThermal`. El ticket se muestra dentro de un contenedor con sombra y bordes que simulan papel cortado.

---

## Lo que NO puede hacer

- **No permite elegir fuente o tamaño del texto en el ticket** — el layout del recibo está fijo en el código de impresión.
- **No permite cambiar el logo desde la UI** — la sección de logo está oculta temporalmente. Pendiente de mejora para soportar logos rectangulares.
- **No permite múltiples impresoras** — solo se gestiona una impresora a la vez.
- **Requiere QZ Tray instalado** — la impresión depende de la app de escritorio QZ Tray en el equipo. La impresora seleccionada se guarda por nombre en `localStorage` y se reconecta automáticamente al volver a abrir la app.

---

## Inconsistencias y Notas

> [!NOTE]
> **El ancho del papel guarda inmediatamente, los datos de la empresa requieren botón**: mezclar comportamientos de guardado inmediato (ancho de papel) con guardado explícito (campos de texto) en el mismo panel genera una experiencia inconsistente. Para mitigarlo, al cambiar el ancho aparece un indicador "✓ Guardado" por 2 segundos junto al selector.

> [!NOTE]
> **El logo se recorta a 1:1 pero los tickets pueden tener espacio rectangular**: pendiente de mejora. Por eso la UI del logo está oculta hasta resolverlo.

---

## Coexistencia con sidebar y Asistente IA

`SettingsSidebarPanel` usa `fixed inset-y-0 right-0` para el panel (no tapa el sidebar). Su backdrop usa `md:left-60` para dejar visible el sidebar en desktop.

| Elemento | z-index |
|---|---|
| Backdrop (overlay oscuro) | z-[80] con `md:left-60` |
| Panel deslizante | z-[90] |
| Chat Asistente IA | z-[110] — siempre al frente |
