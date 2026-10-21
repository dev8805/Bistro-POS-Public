# Cómo gestionar las deudas del negocio en Bistro

> Guía para: Administradores / Dueños del negocio
> Módulo: **Deudas**
> Tiempo estimado: 10 minutos

---

## ¿Para qué sirve?

**Deudas** es el módulo donde registras y controlas todo lo que tu negocio le debe a proveedores y acreedores: compras al crédito, cuotas pendientes y pagos parciales.

Si quieres registrar una compra fiada a un proveedor, abonar a una deuda, ver cuánto debes y a quién, saber qué vence esta semana, controlar las cuentas por pagar del negocio, o llevar un directorio de tus proveedores, este es el módulo.

> ⚠️ Este módulo requiere **conexión a internet** — sin red se muestra una pantalla "Sin conexión" y no puedes operar.

---

## Antes de empezar

- Solo usuarios con acceso administrativo pueden ver este módulo.
- Las deudas aquí son las que **el negocio le debe a otros** (proveedores, acreedores). Para lo que los clientes te deben a ti, usa el módulo **Clientes y Cuentas por Cobrar**.
- Tener un turno de caja abierto es importante al registrar abonos: si no hay turno activo, el abono no queda registrado en caja.

---

## Paso a paso

El módulo de Deudas tiene dos pestañas principales y te permite registrar, abonar y analizar todas las cuentas por pagar del negocio.

### Paso 1 — Abre el módulo y explora las pestañas

Toca **Deudas** en el menú de la aplicación. El módulo tiene dos pestañas:

```
┌─ Deudas ───────────────────────────┐
│  [ Cuentas por Pagar ]  Directorio │
└────────────────────────────────────┘
```

- **Cuentas por Pagar** — proveedores con saldo pendiente.
- **Directorio** — todos los proveedores, incluso sin deuda activa.

### Paso 2 — Lee los indicadores financieros

En la parte superior hay tres tarjetas siempre visibles:

```
┌─────────────────┐ ┌────────────┐ ┌────────────┐
│ Total por Pagar │ │Deuda Venc. │ │ Próximos   │
│  $850.000       │ │  $120.000  │ │   7 días   │
│                 │ │   14% del  │ │ 2 facturas │
│                 │ │   total    │ │ (vence hoy)│
└─────────────────┘ └────────────┘ └────────────┘
```

| Tarjeta | Qué mide |
|---------|----------|
| **Total por Pagar** | Suma de todos los saldos vivos (deuda − abonos) |
| **Deuda Vencida** | Deudas cuya fecha límite ya pasó |
| **Próximos 7 días** | Deudas que vencen en los próximos 7 días |

### Paso 3 — Analiza el aging (antigüedad de saldos)

El gráfico de barras muestra cuánta deuda cae en cada rango de vencimiento:

```
$800k│    ██
     │    ██
$400k│    ██  ██
     │    ██  ██  ░░
  $0 └─────────────────
       Al   1-30 31-60 +60
       Día  días  días  días
       🟢    🟡   🔴   🔴
```

Toca cualquier barra para ver **qué proveedores** tienen deuda en ese rango:

```
┌─ Vencidos 1–30 días ──────────────┐
│  🏪 Distribuidora ABC   $320.000 →│
│  🏪 Lácteos El Campo    $180.000 →│
└────────────────────────────────────┘
```

Toca `→` en un proveedor para ir directamente a su detalle.

> 💡 Deudas sin "Fecha Límite" se clasifican automáticamente como **Al Día**, lo que puede inflar el verde. Siempre completa ese campo para que el reporte sea confiable.

### Paso 4 — Analiza la concentración por proveedor

A la derecha del aging hay un gráfico de dona con los **5 proveedores con más deuda**:

```
       ╭────────────╮
      ╱│ Top Provee-│╲
     │ │  dores     │ │
      ╲│            │╱
       ╰────────────╯

● ABC        42%  $357.000
● Lácteos    21%  $178.500
● Bebidas    18%  $153.000
● Panadería  12%  $102.000
● Otros       7%   $59.500
```

> 💡 Si hay más de 5 proveedores con deuda, los restantes se agrupan como **"Otros"** sin desglose. Para ver el detalle ve a la lista.

### Paso 5 — Registra una deuda nueva

Toca **Nueva Deuda** (botón rojo, arriba a la derecha):

```
┌─ Nueva Deuda ──────────────────────┐
│ Proveedor / Acreedor *             │
│ ┌──────────────────────────────┐   │
│ │ Buscar o escribir nuevo... ▾ │   │
│ └──────────────────────────────┘   │
│                        [ Crear ]   │
│                                    │
│ Descripción                        │
│ ┌──────────────────────────────┐   │
│ │ Ej: Compra de insumos        │   │
│ └──────────────────────────────┘   │
│                                    │
│ Monto Total *                      │
│ ┌──────────────────────────────┐   │
│ │ $  850.000                   │   │
│ └──────────────────────────────┘   │
│                                    │
│ Fecha Límite                       │
│ ┌──────────────────────────────┐   │
│ │ 15/06/2025                   │   │
│ └──────────────────────────────┘   │
│                                    │
│       [ Registrar Deuda ]          │
└────────────────────────────────────┘
```

Qué pasa al guardar:

```
¿El proveedor ya existe?
  Sí → vincula la deuda al proveedor existente
  No → crea el proveedor automáticamente
        ↓
Se registra la deuda como pendiente
```

> 💡 Al escribir el nombre del proveedor, el campo muestra sugerencias de tus proveedores existentes. También puedes tocar **Crear** para agregar uno nuevo con NIT, teléfono y dirección.

### Paso 6 — Registra un abono a proveedor

Toca el nombre de un proveedor en la lista para abrir su panel de detalle, luego toca **Registrar Abono**:

```
┌─ Registrar Abono ──────────────────┐
│ Para: Distribuidora ABC            │
│ Pendiente: $320.000                │
│                                    │
│ ⚠ Sin turno activo — el abono     │
│   no generará egreso de caja.      │
│   Abre un turno antes de abonar.   │
│                                    │
│ Monto *                            │
│ ┌──────────────────────────────┐   │
│ │ $  100.000                   │   │
│ └──────────────────────────────┘   │
│                                    │
│ Descripción                        │
│ ┌──────────────────────────────┐   │
│ │ Pago quincenal               │   │
│ └──────────────────────────────┘   │
│                                    │
│ Sale de Caja: Medio de Pago        │
│ (solo si hay turno activo)         │
│ [Efectivo][Nequi][Tarjeta]...      │
│                                    │
│ 📎 Evidencia (opcional)            │
│ [ 📷 Cámara ] [ 🖼 Galería ]       │
│                                    │
│    [ Cancelar ]    [ Confirmar ]   │
└────────────────────────────────────┘
```

> 💡 Puedes adjuntar una **foto del comprobante** del pago (opcional) con cámara o galería antes de confirmar. La foto queda guardada en ese abono para consultarla después.

El abono aplica primero a la deuda más antigua. Si tienes varias deudas con el mismo proveedor:

```
Proveedor ABC tiene 2 deudas:
  Deuda A (ene) → $200.000 pendiente
  Deuda B (feb) → $120.000 pendiente

Abono $250.000:
  → Deuda A: $200.000 ✅ queda saldada
  → Deuda B: $50.000  ← resto se aplica aquí
```

Qué pasa con caja al abonar:

```
¿Hay turno activo?
  No → Abono reduce la deuda ✓
        pero NO sale de caja ⚠️
  Sí → Abono reduce la deuda ✓
        + egreso en caja (método elegido) ✓
```

### Paso 7 — Edita o elimina un movimiento del historial

En el panel de detalle del proveedor aparece el historial completo:

```
┌─ Historial: Distribuidora ABC ───────┐
│ 🔴 Crédito  $320.000  (feb 2025) ✏ 🗑│
│ 🟢 Contado  $180.000  (ene 2025) ✏ 🗑│
│ 🔵 Abono   +$100.000  (mar 2025)   🗑│
└──────────────────────────────────────┘
```

Tipos de movimiento:
- 🔴 **Crédito** — compra registrada con deuda pendiente
- 🟢 **Contado** — compra registrada pagada inmediatamente
- 🔵 **Abono** — pago hecho a una deuda existente

**Eliminar una compra (🗑):** el sistema verifica antes de permitirlo:

```
Intentas eliminar una compra
          ↓
¿El stock del producto está en 0 o negativo?
  Sí → 🚫 Bloqueado
         "No puedes borrar esta compra
          porque el stock está en 0..."
  No → ¿Ya vendiste unidades de este lote?
         Sí → 🚫 Bloqueado
               "Ya vendiste X unidades de
                este registro..."
         No → ✅ Se elimina la compra
               y se revierte el inventario
```

### Paso 8 — Adjunta o consulta el comprobante (evidencia)

Cada movimiento del historial (compra o abono) puede llevar una **foto de evidencia** (factura, remisión o comprobante de pago). En el historial se ve así:

```
┌─ Historial ──────────────────┬──────┐
│ 🔴 Crédito $320.000  ✏ 🗑    │[foto]│ ← miniatura
│ 🔵 Abono  +$100.000  📎      │      │ ← clip
└──────────────────────────────┴──────┘
```

- Si el movimiento **ya tiene** foto → aparece una **miniatura** a la derecha. Tócala para abrir el visor.
- Si **no tiene** foto → aparece un ícono de **clip 📎** para adjuntar una.

Al abrir el visor puedes ampliar, reemplazar, borrar o compartir el comprobante:

```
┌─ Evidencia ───────────────── ✕ ─┐
│   [ foto del comprobante ]       │
│   Proveedor · Abono · $100.000   │
│   🔍 Ampliar                     │
│  [Reemplazar][Borrar][WhatsApp]  │
└──────────────────────────────────┘
```

> 💡 **Compartir por WhatsApp** envía la imagen como foto (no como enlace), útil para confirmar un pago con el proveedor.

> ⚠️ Adjuntar evidencia **requiere conexión** — la foto se sube al servidor. Sin red, el movimiento se guarda sin foto.

### Paso 9 — Gestiona el Directorio de proveedores

Toca la pestaña **Directorio** para ver todos tus proveedores, incluso los que ya pagaron toda su deuda. Esto te permite acceder al historial de cualquier proveedor sin importar si tiene saldo pendiente o no.

```
┌─ Directorio de Proveedores ────────────────────────┐
│  [🔍 Buscar proveedor...]                          │
│                                                    │
│  ┌────────────────┐  ┌────────────────┐            │
│  │ 🟢 Distribuidora│  │ 🔴 Lácteos     │            │
│  │    ABC          │  │    El Campo    │            │
│  │ NIT: 900123456  │  │ Tel: 3101234   │            │
│  │                 │  │                │            │
│  │ Deuda: Al día   │  │ Deuda: $320k   │            │
│  │ Movim.: 12      │  │ Movim.: 5      │            │
│  └────────────────┘  └────────────────┘            │
│                                                    │
│  ┌────────────────┐  ┌────────────────┐            │
│  │ 🟢 Bebidas     │  │ 🟢 Panadería   │            │
│  │    Colpack     │  │    Don Luis    │            │
│  │                │  │                │            │
│  │ Deuda: Al día   │  │ Deuda: Al día   │            │
│  │ Movim.: 8      │  │ Movim.: 3      │            │
│  └────────────────┘  └────────────────┘            │
└────────────────────────────────────────────────────┘
```

Cada tarjeta muestra:
- **Avatar** con la inicial del proveedor (en su color asignado)
- **Nombre** del proveedor con un punto rojo 🔴 si tiene deuda activa
- **NIT / Teléfono** si están registrados
- **Estado de deuda**: monto pendiente o "Al día" (verde)
- **Cantidad de movimientos** registrados

Toca cualquier tarjeta para abrir el panel de detalle con:
- Historial completo de compras y abonos
- Botones para editar perfil o eliminar proveedor
- Registrar nuevo abono o deuda

> 💡 Los proveedores que ya saldaron su deuda siguen apareciendo aquí para que siempre puedas consultar su historial de transacciones.

> ⚠️ **Eliminar un proveedor es permanente**: se borran el proveedor y todas las deudas asociadas. No hay forma de recuperarlos.

---

## Errores comunes

Aquí están las situaciones más frecuentes y cómo resolverlas.

| Situación | Qué hacer |
|-----------|-----------|
| Pantalla "Sin conexión" | Conéctate a internet — el módulo no funciona offline |
| El campo **Medio de Pago** no aparece al abonar | No hay turno activo. Abre un turno antes de abonar para que el egreso quede registrado |
| No puedo eliminar una compra (mensaje de stock) | El stock está en 0 o negativo. Registra más inventario antes de intentar eliminar |
| No puedo eliminar una compra (mensaje de unidades) | Ya se vendieron unidades de esa compra. Usa **Editar** para corregir cantidad o costo |
| Se creó un proveedor duplicado | El nombre se escribió diferente (mayúsculas, espacio extra). Edítalo desde Directorio → Editar |
| La barra "Al Día" parece inflada | Hay deudas sin Fecha Límite. Edítalas desde el panel del proveedor y agrega la fecha |

---

## Preguntas frecuentes

Estas son las dudas más comunes al gestionar las deudas del negocio en Bistro.

### FAQ — ¿Qué diferencia hay entre este módulo y Clientes?

Son opuestos:

```
Módulo Deudas
  → Lo que el negocio le debe a proveedores
  → Cuentas por PAGAR

Módulo Clientes
  → Lo que los clientes te deben a ti
  → Cuentas por COBRAR
```

### FAQ — ¿El abono se descuenta automáticamente del saldo?

Sí. Al registrar un abono, el sistema aplica el monto a las deudas del proveedor empezando por la más antigua. Si el abono supera una deuda, el resto se aplica a la siguiente:

```
Deuda A (más antigua) $200.000
Deuda B (siguiente)   $120.000

Abono de $250.000:
  Deuda A → $200.000 ✅ saldada
  Deuda B → $50.000 ← excedente aplicado aquí
  Saldo restante deuda B: $70.000
```

### FAQ — ¿Qué pasa si abono sin turno activo?

El abono reduce la deuda correctamente, pero el dinero **no queda registrado en caja**. Esto puede generar descuadre en el cierre.

```
¿Hay turno activo al abonar?
  No → deuda baja ✓
        caja no registra el egreso ⚠️
        riesgo de descuadre al cierre
  Sí → deuda baja ✓
        caja registra el egreso ✓
        todo cuadrado ✅
```

Siempre abre un turno antes de abonar a un proveedor.

### FAQ — ¿Puedo editar la fecha límite de una deuda ya registrada?

No. El botón ✏ solo aparece en las **compras vinculadas al inventario** y su formulario permite cambiar únicamente la **cantidad** y el **costo total** — no la fecha límite. Las deudas creadas con **Nueva Deuda** no tienen edición individual. Si necesitas corregir la fecha, registra la deuda de nuevo con la fecha correcta.

### FAQ — ¿Qué pasa si renombro un proveedor?

El sistema actualiza el nombre en todas sus deudas para mantener la consistencia. Si la operación falla a mitad, pueden quedar deudas con el nombre viejo y nuevo como dos proveedores separados — en ese caso, edita el duplicado desde **Directorio → Editar**.

### FAQ — ¿Puedo registrar cuotas mensuales de una deuda?

No directamente. Cada deuda tiene un solo monto total y una fecha límite. Para cuotas, registra cada una como una deuda separada con su propia fecha:

```
Deuda total: $600.000 en 3 cuotas
  ↓
Deuda #1: $200.000 → vence 01/jun
Deuda #2: $200.000 → vence 01/jul
Deuda #3: $200.000 → vence 01/ago
```

Cada cuota aparece en el aging de forma independiente.

### FAQ — ¿Puedo adjuntar la factura o el comprobante de pago?

Sí. Tanto las compras como los abonos aceptan una foto de evidencia (opcional). La adjuntas al registrar el abono, o después desde el historial con el ícono de clip 📎. Luego puedes verla, ampliarla, reemplazarla, borrarla o compartirla por WhatsApp desde el historial del proveedor.

```
Movimiento con foto  → miniatura → visor
Movimiento sin foto  → clip 📎 → adjuntar
```

> ⚠️ Adjuntar o cambiar la foto requiere conexión a internet.

---

## Recursos multimedia *(opcional)*

> Esta sección es una sugerencia para enriquecer el Asistente IA.

| Tipo | Nombre sugerido en la app | Qué mostraría |
|------|--------------------------|---------------|
| GIF | "Bistro — Deudas — registrar nueva deuda" | Botón Nueva Deuda → modal → guardar → confirmación |
| GIF | "Bistro — Deudas — registrar abono a proveedor" | Seleccionar proveedor → Registrar Abono → modal → guardar |
| Imagen | "Bistro — Deudas — aging chart con panel de proveedores" | Barra seleccionada → panel lateral con lista de proveedores del tramo |
