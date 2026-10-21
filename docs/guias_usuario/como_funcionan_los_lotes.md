# Cómo funcionan los lotes de inventario en Bistro

> 👤 **Guía para:** Administradores
> 🧩 **Módulo:** **Compra de inventario** / Ventas / **Merma** (todos desde el botón **Gastos** en **Inicio**)
> ⏱️ **Tiempo estimado:** 5 minutos de lectura

---

## ¿Para qué sirve?

Un lote es un grupo de unidades del mismo producto que entraron al negocio en la misma compra, al mismo costo y desde el mismo proveedor. Cada vez que registras una compra, Bistro crea automáticamente un lote por cada producto. Cuando vendes, el sistema descuenta primero las unidades más antiguas (método **FIFO**: primero en entrar, primero en salir).

Esto le permite al sistema saber **cuánto costó exactamente lo que vendiste**, **calcular tu margen de ganancia real**, **avisarte cuando tienes mercancía próxima a vencer**, **entender por qué el costo promedio cambia con cada compra**, **saber por qué a veces no puedes eliminar una compra**, y **rastrear el stock real cuando hubo mermas o ventas en negativo**.

Si escuchas hablar de **"lote"**, **"partida"**, **"tanda"**, **"batch"** o **"remesa de compra"** — todos se refieren a este mismo concepto en Bistro.

---

## Estructura de un lote

Cada lote guarda estos datos cuando se registra una compra:

```
┌─ Lote ──────────────────────────┐
│  Producto: Leche Alquería 1L    │
│  ─────────────────────────────  │
│  Cantidad inicial:    20 Und    │
│  Cantidad disponible: 14 Und    │
│  Costo unitario:      $ 3.200   │
│  Fecha de compra:  2026-05-12   │
│  Proveedor: Lácteos del Valle   │
└─────────────────────────────────┘
```

| Campo | Qué significa |
|-------|---------------|
| **Cantidad inicial** | Las unidades que entraron físicamente. Nunca cambia. |
| **Cantidad disponible** | Las unidades que aún quedan para vender. Baja con cada venta. |
| **Costo unitario** | Lo que pagaste por unidad en esa compra. Determina la ganancia. |
| **Fecha** | Cuándo entró el lote. Define el orden FIFO. |
| **Proveedor** | A quién le compraste ese lote. |

**Ciclo de vida de un lote:**

```
Compra registrada
      │
      ▼
┌──────────────────┐
│    CREADO        │ ← disponible = inicial
└────────┬─────────┘
         │ ventas / mermas
         ▼
┌──────────────────┐
│    ACTIVO        │ ← aparece en Historial
└────────┬─────────┘
         │ disponible llega a 0
         ▼
┌──────────────────┐
│    AGOTADO       │ ← sale del Historial
└──────────────────┘
```

---

## Antes de empezar

- Los lotes se crean solos — no necesitas activar ninguna función.
- Cada producto en una compra de inventario genera su propio lote independiente.
- El historial de lotes activos se consulta desde **Inicio** → **Gastos** → **Compra de inventario** → pestaña **Historial**.

En la pantalla de **Inicio**, sección **Finanzas**, toca **Gastos**:

```
FINANZAS
┌───────────────┐ ┌───────────────┐
│ Gastos   ◄── │ │ Abonos        │
│ Compra·merma │ │ Cliente·prov. │
└───────────────┘ └───────────────┘
┌───────────────┐ ┌───────────────┐
│ Por Cobrar    │ │ Por Pagar     │
└───────────────┘ └───────────────┘
```

Se abre el selector de tipo de gasto:

```
┌─ Gastos ──────────────────────────┐
│  ────                             │
│  Compra de inventario  >     ◄──  │
│  Otros gastos          >          │
│  Merma                 >          │
└───────────────────────────────────┘
```

---

## Paso a paso

Bistro gestiona los lotes automáticamente en tres momentos: cuando registras una compra, cuando haces una venta y cuando registras una merma.

### Paso 1 — Registrar una compra y crear un lote

1. En la pantalla de **Inicio**, toca el botón **Gastos** y elige **Compra de inventario**.

2. Agrega los productos al carrito por búsqueda manual, escáner de barras o factura con IA. Cada producto aparece como una fila con su cantidad y costo:

   ```
   🛒 Productos en la compra (2)

   ┌────────────────────────────────┐
   │ Leche Alquería 1L              │
   │ Cant: 20 Und  Costo: $3.200    │
   │                          ✏️ 🗑️│
   └────────────────────────────────┘
   ┌────────────────────────────────┐
   │ Pan tajado Bimbo               │
   │ Cant: 12 Und  Costo: $4.500    │
   │                          ✏️ 🗑️│
   └────────────────────────────────┘
   ```

3. Indica el costo por unidad de cada producto. Es el dato que define el costo del lote.

4. Toca el botón **Registrar X Productos** (el número es la cantidad de productos en el carrito):

   ```
   ╔══════════════════════════════════╗
   ║     Registrar 2 Productos        ║ ← ámbar
   ╚══════════════════════════════════╝
   ```

   El sistema crea **un lote por cada producto** con: cantidad inicial, cantidad disponible, costo unitario, fecha de compra y proveedor. El stock del producto sube automáticamente.

> 💡 Dos compras del mismo producto en fechas distintas crean dos lotes independientes, aunque vengan del mismo proveedor. El sistema los distingue por fecha para aplicar FIFO correctamente.

### Paso 2 — Cómo se crean lotes cuando el stock era negativo

Si el stock estaba negativo al momento de la compra (porque se vendió sin tener unidades en sistema), la cantidad disponible del lote será **menor** que la cantidad comprada:

```
Antes de comprar  →  Stock: -4 Und
Compras               +10 Und
────────────────────  ─────────────
Stock final            6 Und

Lote creado:
  Cantidad inicial:    10  ← lo físico
  Cantidad disponible:  6  ← lo vendible
```

Si el stock negativo era mayor que la compra (ej. -15 con compra de 10), el lote queda con cantidad disponible **0** y no aparecerá en el historial activo — todas esas unidades ya se "pre-consumieron".

### Paso 3 — Ventas: cómo el sistema consume lotes (FIFO)

El proceso es automático — no requiere ninguna acción del vendedor.

El sistema siempre descuenta del lote más antiguo primero y avanza en esta dirección:

```
TIEMPO ──────────────────────────►
┌──────────────┐   ┌──────────────┐
│  Lote #1     │   │  Lote #2     │
│  12-may-2026 │──►│  18-may-2026 │
│ consume 1°   │   │ consume 2°   │
└──────────────┘   └──────────────┘
```

**Ejemplo FIFO** — vendes 8 unidades de Leche con 2 lotes activos:

```
LOTE MÁS VIEJO        LOTE NUEVO
Lote #1247            Lote #1289
12-may-2026           18-may-2026
─────────────         ─────────────
Disp:   6 Und         Disp:  10 Und
Costo:  $3.200        Costo: $3.400
     │
     ▼ consume primero el más viejo
6 Und de #1247 a $3.200  (se agota)
2 Und de #1289 a $3.400
─────────────────────────────────
Costo total de la venta:
  (6 × $3.200) + (2 × $3.400)
   $19.200    +   $6.800
   = $26.000
```

Después de la venta, el Lote #1247 queda en **0 disponibles** (desaparece del historial activo) y el Lote #1289 queda en **8 disponibles**.

> 💡 Si compraste el mismo producto dos veces a precios distintos, el margen de ganancia de cada venta puede variar. El sistema siempre usa el costo del lote que realmente consumió, no un promedio.

### Paso 4 — Registrar una merma

1. En la pantalla de **Inicio**, toca el botón **Gastos** y elige **Merma**.

2. Selecciona el producto afectado y la cantidad perdida en el formulario:

   ```
   ┌─ Registrar Merma ──────── ✕ ──┐
   │                               │
   │  Producto                     │
   │  ┌─────────────────────────┐  │
   │  │ Leche Alquería 1L    ▾  │  │
   │  └─────────────────────────┘  │
   │                               │
   │  Cantidad perdida             │
   │  ┌─────────────────────────┐  │
   │  │ 2                       │  │
   │  └─────────────────────────┘  │
   │                               │
   │  Motivo (opcional)            │
   │  ┌─────────────────────────┐  │
   │  │ Producto vencido        │  │
   │  └─────────────────────────┘  │
   │                               │
   │  [ Cancelar ]   [ Guardar ]   │
   └───────────────────────────────┘
   ```

3. Toca **Guardar**. El sistema aplica FIFO igual que en una venta: descuenta del lote más antiguo primero. El stock del producto y la suma de lotes activos siempre quedan sincronizados:

```
Antes de la merma:
  Stock producto:    14 Und
  Suma lotes activ.: 14 Und  ✓ coinciden

Después de merma de 2 Und (FIFO):
  Stock producto:    12 Und  ← baja
  Suma lotes activ.: 12 Und  ← también baja ✓
  (lote más viejo: descontó 2 Und)
```

> ⚠️ **Límite:** no puedes registrar una merma por más unidades de las que hay en stock. Si la cantidad supera el disponible, el sistema bloquea el guardado.

> 💡 **Unidades que entraron por ajuste de inventario:** su lote se crea con costo $0. La merma baja el stock correctamente, y si el FIFO consume ese lote, el valor de la pérdida será $0 — el costo con el que entraron esas unidades.

---

## Errores comunes

Aquí están las situaciones más frecuentes y cómo resolverlas.

| Situación | Qué hacer |
|-----------|-----------|
| No puedo eliminar una compra del historial | Ya se vendieron o mermaron unidades de ese lote. Edita la cantidad/costo desde **Historial** en lugar de eliminar. |
| El costo promedio del producto bajó sin razón | Es normal: el promedio pondera solo los lotes activos con costo mayor a $0. Baja cuando compras el mismo producto más barato o cuando se agotan los lotes más caros. Los lotes de ajuste (costo $0) no cuentan en ese promedio. |
| El historial de compras no muestra una compra que hice | Las compras cuyos lotes están agotados no aparecen en el historial. Ya se consumieron por ventas o mermas. |
| El stock dice que hay unidades pero no puedo vender | Puede haber unidades sin lote de compra (ajustes $0). Haz un conteo en **Inventario** y verifica el stock real. |
| No me deja registrar una merma aunque hay producto físico | El sistema bloquea si la cantidad supera el stock registrado. Primero haz un ajuste de inventario para sincronizar. |

---

## Preguntas frecuentes

Estas son las dudas más comunes sobre cómo funcionan los lotes en Bistro.

### FAQ — ¿Dónde veo cuántas unidades quedan de una compra específica?

En la pantalla de **Inicio**, toca **Gastos** → **Compra de inventario** → pestaña **Historial**. Cada compra muestra cuántas unidades del lote siguen disponibles. Las compras completamente vendidas desaparecen porque su lote ya está agotado.

```
Compra de inventario
  Nueva Compra  | [ Historial ]
                  ━━━━━━━━━━━
                  activa

┌─ 18-may-2026 · Lácteos Valle ────┐
│  Leche Alquería 1L               │
│  Compradas: 10  Disponibles: 8   │
│  Costo unit: $3.400       ✏️ 🗑️ │
└──────────────────────────────────┘
┌─ 12-may-2026 · Lácteos Valle ────┐
│  Leche Alquería 1L               │
│  Compradas: 20  Disponibles: 14  │
│  Costo unit: $3.200       ✏️ 🗑️ │
└──────────────────────────────────┘
```

### FAQ — ¿Qué pasa si compré el mismo producto varias veces a distintos precios?

El sistema crea un lote separado por cada compra. Al vender, descuenta primero del lote más antiguo (FIFO). El costo promedio en **Catálogo** es el promedio ponderado de todos los lotes activos con costo mayor a $0:

```
Lote A: 10 Und × $3.200 = $32.000
Lote B:  5 Und × $3.600 = $18.000
─────────────────────────────────
Total: 15 Und, valor: $50.000
Costo promedio: $50.000 ÷ 15 = $3.333
```

### FAQ — ¿Las mermas consumen lotes?

Sí. Las mermas aplican FIFO igual que las ventas: descuentan del lote más antiguo primero. Si eliminas una merma desde el historial, el sistema devuelve las unidades a los lotes que habían sido afectados.

```
Merma de 3 Und (FIFO):
  Lote más viejo tiene 2 Und → se agota
  Diferencia (1 Und) → siguiente lote
  Stock producto baja 3 Und ✓
  Suma lotes activos baja 3 Und ✓
```

Matiz: las unidades que entraron por un ajuste de inventario tienen un lote con costo $0. Si la merma consume ese lote por FIFO, el stock baja igual, pero el valor de esa pérdida será $0.

### FAQ — ¿Por qué no puedo eliminar una compra si cometí un error?

Si ya se vendieron unidades de ese lote, el sistema bloquea la eliminación para no descuadrar el historial de ganancias. Puedes editar la cantidad y el costo desde el mismo **Historial**.

```
¿Se vendieron o mermaron unidades del lote?
  │
  ├── Sí ──► ❌ Eliminación bloqueada
  │               Edita cantidad/costo
  │               desde Historial
  │
  └── No ──► ✅ Se puede eliminar
```

### FAQ — ¿Qué pasa si vendí unidades de un producto que no tenía stock registrado?

Si el stock quedó en negativo y luego registras una compra, el lote refleja solo las unidades realmente disponibles:

```
¿El stock negativo supera la compra?
  │
  ├── No → disponible = compra − |negativo|
  │         lote activo en Historial
  │         Ej: compra 10, stock −4 → disp. 6
  │
  └── Sí → disponible = 0
             lote NO aparece en Historial
             Ej: compra 10, stock −15 → disp. 0
```

La cantidad inicial del lote siempre muestra lo que físicamente entró. Solo la cantidad disponible refleja lo que realmente queda por vender.

### FAQ — ¿Qué pasa si en el conteo encuentro más unidades de las que dice el sistema?

Bistro registra el sobrante como un lote nuevo con costo $0. Ese lote **no** afecta el costo promedio que ves en **Catálogo**, porque el promedio solo pondera lotes con costo mayor a $0:

```
Costo promedio en Catálogo
  = solo lotes con costo > $0
Lote de ajuste (costo $0)
  → excluido del promedio ✓

Pero en una venta o merma que
consuma ese lote (FIFO), esas
unidades se costean en $0
  → margen inflado ⚠️

Recomendado: registrar una compra
con el costo real en vez del ajuste,
para que el margen sea correcto
```

---

## Recursos multimedia *(opcional)*

> Esta sección es una sugerencia para enriquecer el Asistente IA.
> La guía funciona sin ella — solo agregar si hay media disponible o planeada.

| Tipo | Nombre sugerido en la app | Qué mostraría |
|------|--------------------------|---------------|
| GIF | "Bistro — Registrar compra y ver lote en historial" | Flujo de compra → historial mostrando el lote creado con unidades disponibles |
| Imagen | "Bistro — Historial de Compras — lote activo vs agotado" | Pantalla de historial comparando un lote con unidades disponibles y uno ya consumido |
