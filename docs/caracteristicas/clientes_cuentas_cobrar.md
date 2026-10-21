# Cuentas por Cobrar / Clientes (ClientsScreen)

Componente: `screens/ClientsScreen.tsx`  
Hook principal: `hooks/useClients.ts`  
Acceso: Menú principal → "Clientes" / "Cuentas por Cobrar"  
Acceso móvil (abonos): HomeScreen → Finanzas → **Abonos** → "Abonos de Clientes" (abre `QuickTransactionModal` directamente)

Módulo de gestión de crédito informal al cliente (fiado). Permite registrar quién debe, cuánto, cuándo vence y hacer seguimiento de abonos. Incluye herramientas de cobranza (WhatsApp, email) y reportes gerenciales de cartera.

---

## ¿Para qué sirve?

En muchos negocios de reventa (tiendas, minimercados, distribuidoras) es común que se le "fíe" mercancía a clientes frecuentes. Esta pantalla centraliza:

1. El **registro del cliente** (nombre, teléfono, email, documento, dirección, límite de crédito).
2. El **registro de deudas** (cuánto se le fió y cuándo vence).
3. El **registro de abonos** (pagos parciales o totales del cliente).
4. El **seguimiento** de qué deudas están al día y cuáles están vencidas.
5. El **cobro activo** vía WhatsApp o email.

---

## Secciones Principales

La pantalla es una sola vista scrolleable con dos secciones apiladas:

| Sección | Contenido |
|---|---|
| **Resumen Gerencial** | KPIs de cartera, gráfico de antigüedad y top 5 deudores |
| **Cartera** (`id="cartera-section"`) | Tabla completa de clientes con deuda, filtrable y buscable |

El botón "Ver Lista Completa" en el Top 5 hace scroll suave hasta la sección Cartera.

---

## Sección: Resumen Gerencial

### KPIs de Cartera

| KPI | Cálculo | Significado |
|---|---|---|
| **Total Por Cobrar** | Suma de `current_debt` de todos los clientes | Capital total inmovilizado en crédito |
| **Vencido > 1 Día** | Suma de deudas con `due_date` anterior a hoy | Dinero en riesgo real de incobrabilidad |
| **Cobrado Este Mes** | Suma de pagos (`type = 'payment'`) en el mes calendario actual | Flujo de caja recuperado de cartera |

### Gráfico de Antigüedad de Saldos (Aging Report)

Barras verticales que distribuyen la deuda vencida en 4 rangos:

| Bucket | Condición | Color |
|---|---|---|
| **Al Día** | `due_date >= hoy` | Verde `#4dcba1` |
| **1-30 Días Venc.** | Vencida entre 1 y 30 días | Amarillo `#fbbf24` |
| **31-60 Días Venc.** | Vencida entre 31 y 60 días | Naranja `#f97316` |
| **+60 Días Venc.** | Vencida hace más de 60 días | Rojo `#e11d48` |

La clasificación se basa en la **fecha de vencimiento de la última deuda activa** del cliente. Si una deuda no tiene `due_date`, se considera vencida desde la fecha de creación de la transacción.

**Comportamiento interactivo:**
- Cada barra muestra su monto total encima (siempre visible, sin tooltip).
- Al tocar o hacer clic en una barra se abre el **Panel de Clientes del Bucket** (ver sección siguiente).
- Las barras no seleccionadas se atenúan (`opacity-25`) para resaltar la activa.
- Barras con valor `$0` no son interactivas.

### Panel de Clientes del Bucket

Al seleccionar una barra del aging chart se abre un panel con la lista de clientes que pertenecen a ese rango, ordenados por deuda descendente.

**Comportamiento por dispositivo:**

| Dispositivo | Presentación | Cierre |
|---|---|---|
| **Móvil (< md)** | Bottom sheet que sube desde el borde inferior (`max-h: 75vh`) | Deslizar hacia abajo > 80 px, tocar el backdrop o botón `×` |
| **Desktop (≥ md)** | Sidebar lateral derecho de 420 px, desliza desde la derecha | Tocar el backdrop, botón `×` o tecla `Escape` |

**Información mostrada por cliente:**
- Avatar con inicial del nombre
- Nombre completo
- Días vencido (o "Al día" si el bucket es `current`)
- Monto de la deuda (en rojo si vencida, verde si al día)
- Botón WhatsApp (solo si el cliente tiene teléfono registrado)
- Botón `→` que cierra el panel y abre el sidebar de detalle del cliente

**Implementación técnica:**
- Estado: `selectedAgingBucket: 'current' | 'days30' | 'days60' | 'overdue' | null`
- El swipe-to-dismiss en móvil usa `addEventListener('touchmove', handler, { passive: false })` directo en el DOM para poder llamar `preventDefault()` y bloquear el pull-to-refresh del navegador (los eventos sintéticos de React no permiten esto).
- El panel comparte el mismo bloque JSX; las clases Tailwind `md:` cambian posición, ancho, bordes y animación según breakpoint.

### Top 5 Deudores Críticos

Lista de los 5 clientes con mayor `current_debt`. Hacer clic en cualquiera abre el panel de detalle del cliente. El botón "Ver Lista Completa" lleva al tab Cartera.

---

## Sección: Cartera

Tabla de todos los clientes ordenados por `current_debt` descendente (los que más deben, primero).

**Filtros disponibles:**
- **Buscar**: por nombre o teléfono.
- **Todos / Solo Vencidos / Al Día**: filtra por estado de vencimiento.

**Columnas:**
- Nombre del cliente
- Fecha de vencimiento (`due_date` de la última deuda)
- Estado (badge "Al día" / "X días venc.")
- Saldo pendiente
- Acciones rápidas: WhatsApp, Email
- "Ver movimientos" → abre el panel de detalle

El footer muestra el total de saldo de la vista filtrada actual.

---

## Cabecera de la Pantalla

Una sola fila con el título "Cuentas por Cobrar" y el botón "Nuevo Cliente" a la derecha. Sin tabs.

---

## Crear un Nuevo Cliente

El botón **"Nuevo Cliente"** vive en la cabecera de la pantalla (esquina superior derecha), visible desde ambas pestañas (Resumen Gerencial y Cartera).

**Campos obligatorios** (marcados con asterisco rojo):
- Nombre Completo
- Número de Identificación
- Teléfono

**Campos opcionales:**
- Email
- Dirección
- Cupo de Crédito

El botón Guardar permanece deshabilitado hasta que los tres campos obligatorios estén completos.

El mismo formulario se reutiliza al editar un cliente desde el panel de detalle (botón "Editar"). Cuando se edita, aparece prellenado con los datos existentes.

---

## Panel de Detalle del Cliente

Al seleccionar un cliente se abre un **sidebar deslizante** (full screen en móvil, 480px en desktop).

### Información mostrada
- Nombre, teléfono, email, documento de identidad, dirección
- **Deuda Actual** (`current_debt`) — en rojo
- **Total Abonado** — suma histórica de todos sus pagos

### Acciones disponibles

| Acción | Qué hace |
|---|---|
| **Registrar Deuda** | Agrega una nueva deuda al cliente con monto, nota y fecha de vencimiento (obligatoria) |
| **Registrar Abono** | Registra un pago del cliente, seleccionando método de pago |
| **Editar** | Abre el formulario de cliente prellenado para modificar datos (nombre, teléfono, email, documento, dirección, límite de crédito) |
| **Eliminar** | Elimina el cliente de la lista (ver advertencia más adelante) |
| **WhatsApp historial (desktop)** | Abre WhatsApp con el chat del cliente y un mensaje que incluye un **enlace público** (`/ch/{token}`) al estado de cuenta del cliente; no adjunta archivos |
| **Compartir historial (móvil)** | Usa la Web Share API para compartir el mismo **enlace público**; si no está disponible, copia el enlace al portapapeles |
| **Email** | Envía un recordatorio de deuda por correo (via Edge Function) |
| **Descargar PDF** | Genera y descarga un PDF con el historial de transacciones del cliente (botón "Descargar", solo desktop) |
| **Eliminar transacción** | Elimina un movimiento individual (deuda o abono) del historial con confirmación |

### Límite de Crédito
El cupo de crédito se configura desde el formulario de creación/edición del cliente. **El sistema valida que la nueva deuda no supere el límite configurado** — si se supera, lanza un error y no registra la deuda. Si el límite es 0 (sin configurar), no aplica validación.

---

## Flujo: Registrar una Deuda

1. Seleccionar cliente → "Registrar Deuda"
2. Ingresar monto, nota (opcional) y **fecha de vencimiento (obligatoria)**
3. Si el cliente tiene un cupo de crédito configurado y la nueva deuda lo superaría, el sistema lanza un error y no guarda
4. Al guardar, se inserta una transacción de `type = 'debt'` en la tabla `client_transactions`
5. El `current_debt` del cliente se actualiza vía trigger de base de datos

---

## Flujo: Registrar un Abono

1. Seleccionar cliente → "Registrar Abono"
2. Ingresar monto, nota (opcional) y método de pago
3. El sistema valida que el monto del abono no supere la deuda actual del cliente — si se supera, lanza error
4. Al guardar:
   - Se inserta una transacción de `type = 'payment'`
   - El `current_debt` se reduce en el monto del abono vía trigger de base de datos
   - **Si hay un turno activo** (`activeShift`), el abono se registra en caja como `addCashIn` con el método de pago seleccionado
   - **Si no hay turno activo**, aparece un banner de advertencia ámbar en el modal informando que el dinero no entrará a la caja

> [!IMPORTANT]
> Los abonos de clientes **sí se integran con la caja**, pero solo si hay turno activo. Si no hay turno, el modal muestra un aviso explícito: *"No hay turno activo. El abono quedará registrado en la deuda del cliente, pero no entrará a la caja."* El operador puede decidir si procede o abre primero un turno.

---

## Flujo: WhatsApp de Cobro

Al hacer clic en el botón WhatsApp:
1. Se construye un mensaje con el nombre del negocio y el saldo pendiente.
2. Se intenta abrir la app nativa (`whatsapp://send?...`).
3. Si la app no está instalada (detectado por `window.blur` que no ocurre), abre WhatsApp Web en un popup.
4. El número se formatea automáticamente agregando el código de país Colombia (`57`) si no lo tiene.

---

## Flujo: Email de Recordatorio

Al hacer clic en Email:
1. Se abre `EmailReceiptModal` para que el usuario ingrese la dirección de correo.
2. Se llama a la Edge Function `send-receipt-email` con `emailType: 'debt_reminder'`.
3. El correo incluye el nombre del negocio, el nombre del cliente y el monto de la deuda.

> [!NOTE]
> La Edge Function necesita estar desplegada y configurada con credenciales de envío de emails. Si falla, el error solo se captura como `return false` sin mostrar un mensaje de error específico al usuario. El usuario no sabe si el correo llegó o no.

---

## Compartir el Historial (enlace público)

El panel de detalle ofrece tres botones, agrupados por dispositivo:

| Botón | Móvil | Desktop |
|---|---|---|
| **WhatsApp** | — | Genera el **enlace público** del historial y abre WhatsApp (app nativa o Web) con el chat del cliente y un mensaje que incluye el enlace |
| **Compartir** (ícono, solo móvil) | Comparte el **enlace público** vía Web Share API; si no está disponible, lo copia al portapapeles | — |
| **Descargar** | Oculto | Descarga el PDF directamente (`downloadTransactionHistoryPDF` en `lib/shareTransactionHistory.ts`) |

### Cómo funciona el enlace público

En lugar de adjuntar un archivo (WhatsApp no permite adjuntar archivos vía URL scheme), se comparte un enlace a una página pública que muestra el estado de cuenta del cliente:

```
https://<dominio>/ch/{token}
```

- **`token`**: los primeros 12 caracteres hexadecimales del UUID del cliente, sin guiones (`selectedClient.id.replace(/-/g, '').substring(0, 12)`). 12 hex = 16¹² ≈ 281 billones de combinaciones → opaco, no adivinable.
- El número de WhatsApp se formatea agregando el código de país Colombia (`57`) si no lo tiene.

### Pantalla pública: `screens/PublicClientHistoryScreen.tsx`

Ruta detectada en `App.tsx` (`window.location.pathname.startsWith('/ch/')`), renderizada **sin autenticación** (fuera de `AuthProvider`), igual que `PublicReceiptScreen` (`/t/`).

| Zona | Contenido |
|---|---|
| **Encabezado** | Franja oscura (`#102218`) con barra ámbar, nombre del negocio y título "ESTADO DE CUENTA". Botón compacto **"Descargar PDF"** (ámbar) en la esquina superior derecha |
| **Tarjeta del cliente** | Avatar con inicial, nombre y saldo pendiente (rojo si >0, verde si =$0) |
| **Tira de KPIs** | 2 tarjetas: Total Crédito (rojo) y Total Abonado (verde) |
| **Lista de movimientos** | Transacciones ordenadas del más reciente al más antiguo. Cada tarjeta tiene franja lateral de color (rojo=deuda, verde=abono), badge de tipo + fecha, monto total del movimiento, nota si existe, y desglose de productos con precio individual por ítem si aplica |

**Formato de cantidad en ítems de venta:**
Las unidades se muestran abreviadas usando el mismo diccionario `UNIT_ABBR` que el ticket térmico:

| Unidad (en BD) | Abreviación mostrada |
|---|---|
| Unidad / Und | `2×` (sin etiqueta) |
| Kilogramos | `Kg` |
| Libras | `Lb` |
| Gramos | `g` |
| Onzas | `Oz` |
| Litros | `Lt` |
| Mililitros | `ml` |
| Galones | `Gal` |
| Metros | `m` |
| Centímetros | `cm` |

### Backend: RPC `get_public_client_history`

Función Postgres `SECURITY DEFINER` (migración `add_get_public_client_history_rpc`) que recibe el `p_token`, localiza el cliente cuyo UUID empieza por ese token y devuelve un JSON con `client_name`, `current_debt`, `business_name` y el array `transactions` (con `order_items`). Tiene `GRANT EXECUTE ... TO anon` para permitir acceso sin sesión.

Cada elemento de `order_items` incluye: `product_name`, `quantity`, `unit_price` y `unit` (obtenido via `LEFT JOIN products` — puede ser `null` si el producto fue eliminado). La migración que agrega `unit` es `add_unit_to_public_client_history`.

### Diseño del PDF (`components/TransactionHistoryPDF.tsx`)

El PDF generado sigue la identidad visual "Warm Bistro" y se estructura en 5 zonas:

| Zona | Contenido |
|---|---|
| **Encabezado** | Franja oscura (`#102218`) con barra ámbar, nombre del negocio en blanco, título "ESTADO DE CUENTA" en ámbar y fecha de generación |
| **Tarjeta del cliente** | Avatar circular (inicial del nombre sobre fondo ámbar), nombre completo y saldo pendiente (rojo si >0, verde si =$0) |
| **Tira de KPIs** | 3 tarjetas: Total Crédito (rojo), Total Abonado (verde), N° Movimientos (gris) |
| **Historial** | Lista de transacciones en orden cronológico inverso; cada fila tiene franja lateral de color (rojo=deuda, verde=abono), badge de tipo, fecha, monto y detalle de productos si aplica |
| **Pie de página** | Borde superior ámbar, nombre del negocio (tomado de `businessName`) y fecha |

**Parámetros relevantes:**
- `businessName` — se obtiene de `useBusinessSettings()` en `ClientsScreen` y se propaga a través de `downloadTransactionHistoryPDF` / `shareTransactionHistoryPDF`
- El PDF se genera con importación dinámica para no bloquear el bundle principal

> [!NOTE]
> **Bug conocido en `@react-pdf/renderer` v4**: `borderRadius: 0` en un estilo causa "Invalid border radius: undefined" durante `resolveBorderShorthand`. La solución es omitir la propiedad (no establecerla a `0`) en los estilos que no necesitan radio de borde.

---

## Lo que NO puede hacer

- **No maneja múltiples deudas independientes** — el estado del cliente es un solo saldo `current_debt`. No hay seguimiento de facturas o deudas individuales; todas las deudas se suman y todos los abonos se restan del total.
- **No envía recordatorios automáticos** — no hay sistema de alertas programadas ni notificaciones push para clientes con deudas próximas a vencer.
- **No genera estados de cuenta contables** — el PDF es un historial de movimientos con KPIs de resumen, no un estado de cuenta con saldo anterior, cargos y saldo final en formato contable (DIAN).
- **No cobra en línea** — solo registra la deuda y facilita la comunicación de cobro. El pago real ocurre fuera del sistema.
- **No tiene historial de eliminaciones** — si se elimina un cliente, sus datos desaparecen de la UI. Ver advertencia abajo.

---

## Inconsistencias y Notas

> [!WARNING]
> **Eliminar un cliente con deuda**: el diálogo de confirmación advierte que *"Se eliminará de la lista pero no se borrarán sus datos"*. Sin embargo, la acción real elimina el registro. Si el cliente tiene `current_debt > 0`, ese dinero desaparece del "Total Por Cobrar" del Resumen Gerencial sin que quede registro contable de la condonación. No hay opción de "archivar" o "desactivar" como alternativa a eliminar.

> [!NOTE]
> **Los abonos sin turno activo no se registran en caja**: la integración con `addCashIn` está condicionada a `navigator.onLine && activeShift`. Si el negocio recibe un abono en efectivo fuera de turno o sin conexión, el dinero físico entra pero no queda en el registro de caja. El modal muestra una advertencia ámbar en este caso para que el operador lo sepa antes de confirmar.

> [!NOTE]
> **La fecha de vencimiento es de la última deuda, no del total**: cuando un cliente tiene múltiples deudas con distintas fechas de vencimiento, el sistema toma solo la `due_date` de la deuda más reciente para determinar el estado (vencido/al día) del cliente. Un cliente podría aparecer "Al Día" si su última deuda no venció, aunque tenga deudas anteriores vencidas sin pagar.

> [!NOTE]
> **El `current_debt` puede quedar desincronizado**: el campo `current_debt` se actualiza programáticamente desde el hook. Si una transacción falla parcialmente (inserta en `client_transactions` pero falla el UPDATE del `current_debt`), el saldo queda inconsistente con el historial. No hay mecanismo de reconciliación automática.

> [!NOTE]
> **El código de país WhatsApp es hardcodeado a Colombia (`57`)**: si el negocio tiene clientes internacionales o de otro país, el link de WhatsApp generará un número inválido. Sería conveniente parametrizarlo desde la configuración del negocio.

> [!NOTE]
> **El "Cobrado Hoy" no está en los KPIs gerenciales**: existe la variable `collectedToday` calculada en el componente pero **no se renderiza en ningún lugar de la UI**. Es código calculado pero sin pantalla. Podría ser útil como KPI adicional en el Resumen Gerencial.

> [!NOTE]
> **Eliminar una transacción individual**: cada movimiento del historial (tanto deudas como abonos) muestra un botón de eliminar con confirmación. Al eliminar un abono con turno activo, se llama a `reverseCashMovement` para revertirlo de la caja. Al eliminar una deuda, solo se elimina el registro — el `current_debt` se recalcula vía trigger de base de datos. No hay opción de "editar" un movimiento, solo eliminar y volver a crear.

---

## Coexistencia con sidebar y Asistente IA

Los overlays de `ClientsScreen` usan `md:left-60` en desktop para dejar el sidebar (240 px) visible cuando hay un panel o modal abierto.

| Overlay | z-index | Notas |
|---|---|---|
| Panel de detalle del cliente | z-[56] | Por encima del backdrop del chat (z-[54]); el chat siempre queda al frente (z-[110]) |
| Modal "Nuevo Cliente" | z-[60] | |
| Modal "Agregar Transacción" | z-[60] | |
| Panel de clientes del bucket (aging) | z-[65] | Bottom sheet en móvil / sidebar derecho en desktop |
| Modal "Limpiar Historial" | z-[70] | |

En mobile (`< md`) los overlays siguen cubriendo la pantalla completa porque el sidebar está oculto.
