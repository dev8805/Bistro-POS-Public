# Cómo crear recetas (productos preparados) en Bistro

> Guía para: Administradores y propietarios  
> Módulo: **Productos** → `[ + Crear ]` → `[ Crear Receta ]`  
> Tiempo estimado: 3–6 minutos por receta

---

## ¿Para qué sirve?

Una **receta** (o producto preparado) es algo que tu negocio **arma a partir de insumos**: una empanada, un jugo natural, un combo, un plato del día. Esta guía te muestra cómo **crear una receta**, **armar un producto con ingredientes**, **registrar un preparado** o **definir un combo**.

A diferencia de un producto normal, la receta no se compra ya hecha: se prepara. Por eso su **costo** y su **disponibilidad** dependen de los insumos que tengas.

> 💡 Si solo compras algo y lo revendes igual (sin prepararlo), usa **Crear Producto** normal, no una receta.

---

## Antes de empezar

Si vas a calcular el costo por ingredientes, **primero crea los insumos**. Un insumo es un producto que creas con el tipo **Ingrediente** (se usa por dentro, no se vende solo).

Decide cómo quieres manejar el costo de la receta:

| Modo de costo | Cuándo usarlo |
|---|---|
| **Ingredientes** | Quieres que Bistro calcule el costo y **descuente los insumos** al vender |
| **Manual** | Solo quieres poner un costo fijo, sin controlar insumos |

También ten listo el **precio de venta** de la receta.

> 🔒 Al **crear**, el tipo se elige en el selector de arriba (viene en **Receta** si entraste por "Crear Receta"). Al **editar** sí puedes cambiar el tipo, pero si dejas de ser Receta **se borran los ingredientes** de la receta.

---

## Paso a paso

Crear una receta tiene ocho pasos: abrir el formulario, revisar el tipo y ponerle nombre y categoría, elegir el modo de costo, agregar los ingredientes (o escribir el costo manual), poner precio e imagen, y guardar. Al final verás cómo aparece en el catálogo.

---

### Paso 1 — Abrir el formulario (Crear → Crear Receta)

Puedes empezar desde **Productos** o desde **Ventas**. Toca el botón `[ + Crear ]` y elige `[ Crear Receta ]`.

```
  + Crear ▾
  ┌──────────────────────────────┐
  │ 📦 Crear Producto            │
  │ 🍳 Crear Receta          ◄── │
  │ 🛠️ Crear Servicio           │
  │ 🏷️ Crear Promoción          │
  └──────────────────────────────┘
```

Se abre un panel lateral a la derecha. En **celular** ocupa toda la pantalla.

---

### Paso 2 — Revisar el tipo, poner nombre y categoría

Como entraste por **Crear Receta**, el selector de arriba ya viene en **Receta**. Solo escribe el nombre y elige la categoría.

```
Tipo de producto *
┌──────────────────────────────┐
│ Receta                    ▾ │
└──────────────────────────────┘
Nombre del producto *
[ Empanada de carne              ]
Categoría *
[ Comidas                     ▾ ]
```

El mismo selector de tipo tiene otras opciones. Si eliges una, te lleva al formulario correspondiente:

```
Tipo de producto ▾
  ├─ Producto para venta → form de producto
  ├─ Ingrediente         → form de ingrediente
  ├─ Receta          (✔) ← estás aquí
  └─ Servicios           → form de servicio
```

> 💡 Una receta también puede usarse como **ingrediente de otra receta**. No necesitas un tipo especial: cualquier receta aparece en la lista de ingredientes al armar otra.

---

### Paso 3 — Elegir cómo se calcula el costo

Junto al campo **Costo** hay un selector con dos modos. Por defecto viene en **Manual**; cámbialo a **Ingredientes** si quieres que Bistro calcule el costo y descuente insumos.

```
Costo          [ Manual | Ingredientes ]
┌──────────────────────────────────────┐
│ $  0                                 │
└──────────────────────────────────────┘
```

```
¿Cómo quieres el costo?
  ├─ Por Ingredientes → suma insumos
  │                     + descuenta stock
  └─ Manual           → tú escribes el costo
                        (sin insumos)
```

---

### Paso 4 — Agregar los ingredientes (modo Ingredientes)

Con el modo **Ingredientes** activo aparece la tabla de la receta. Busca el insumo, escribe la cantidad, elige la unidad y toca **Añadir**.

```
🍳 Ingredientes de la Receta      0 ITEMS
┌────────────────────────────────────────┐
│ INSUMO      CANT./UNIDAD      ACCIÓN   │
│        No hay ingredientes agregados   │
├────────────────────────────────────────┤
│ [ Buscar ingrediente...            ]   │
│ [ 100 ]  [ Gramos    ▾ ]   [ Añadir ]  │
└────────────────────────────────────────┘
```

Repite por cada insumo. Cada uno se agrega como una fila en la tabla.

> 💡 Si el insumo no aparece al buscar, créalo primero como producto tipo **Ingrediente**. Al escribir, elige el insumo de la lista de sugerencias: si el nombre no coincide exacto, no se agrega.

---

### Paso 5 — El costo se calcula solo

Cada vez que agregas un insumo, Bistro suma su costo (convirtiendo la unidad si hace falta) y actualiza el **Costo** total de la receta.

```
Receta: Empanada de carne
  Carne molida   50 g  →  $400
  Masa            1 ud →  $300
  ──────────────────────────────
  Costo total           = $700
```

> 💡 Si un insumo está guardado en **Kilogramos** y lo usas en **Gramos**, Bistro convierte solo. Lo mismo con litros/mililitros y libras.

---

### Paso 6 — Costo manual (alternativa)

Si dejaste el modo **Manual** (el de por defecto), la tabla de ingredientes no aparece y escribes el costo a mano.

```
Costo          [ Manual | Ingredientes ]
┌──────────────────────────────────────┐
│ $  700                               │
└──────────────────────────────────────┘
```

> ⚠️ En modo **Manual** la receta **no descuenta insumos** al vender y **no** calcula "Producible". Úsalo solo si no quieres controlar el inventario de esa receta.

---

### Paso 7 — Precio de venta, imagen y apodos

Pon el **Precio de venta**. Opcionalmente agrega una foto y apodos para encontrar la receta rápido al vender.

```
Precio Venta
[ $ 2.000                        ]

Foto:  [ 📷 Cámara ]  [ 📁 Galería ]

🏷️ Apodos:   ( empanada ✕ )
```

> 💡 Los apodos sirven para buscar la receta por una palabra corta en el momento de la venta.

---

### Paso 8 — Guardar la receta

Cuando el **nombre**, la **categoría** y el **costo** estén listos, toca el botón ámbar de la derecha.

```
┌──────────────┐  ┌───────────────────┐
│   Cancelar   │  │   Crear Receta    │
└──────────────┘  └───────────────────┘
     blanco               ámbar
```

> ✏️ Al editar una receta existente, el botón dice `[ Actualizar Receta ]`.

---

### Cómo se ve la receta en el catálogo (Producible)

La receta aparece en el tab **Productos** con el badge **Receta**. En lugar de "Stock" muestra **Producible**: cuántas unidades puedes preparar con los insumos que tienes ahora.

```
Empanada de carne          [ Receta ]
  Producible:  8 uds
  Costo $700      Precio $2.000
```

```
Producible = lo que alcanza el insumo
             más escaso
  Carne (400 g) / 50 g  = 8
  Masa  (20 ud) / 1 ud  = 20
  ──────────────────────────────
  Producible = 8  (manda el menor)
```

> En modo **Manual** (sin insumos) muestra "—" en Producible.

---

## Errores comunes

| Situación | Qué hacer |
|---|---|
| No encuentro el insumo al buscar | Créalo primero como producto tipo **Ingrediente** |
| "Agrega al menos un ingrediente o usa costo manual" | Estás en modo **Ingredientes** sin insumos — agrégalos o cambia a **Manual** |
| "Ingresa un costo válido" | En modo **Manual** el costo debe ser mayor a $0 |
| Vendí la receta y el inventario no bajó | La receta está en modo **Manual**; usa modo **Ingredientes** para descontar insumos |
| Producible muestra "—" | La receta usa costo **Manual** (sin insumos), por eso no se calcula |
| Producible muestra **0** | No tienes stock de alguno de los insumos de la receta |
| "Ingrediente no encontrado en inventario" | Escribiste un insumo que no existe; elígelo de la lista o créalo como **Ingrediente** |

---

## Preguntas frecuentes

Esta sección resuelve las dudas más comunes sobre recetas: en qué se diferencian de un producto normal, si hay que crear los insumos antes, por qué a veces no descuenta inventario, qué significa "Producible" y cómo cambiar entre costo por ingredientes y costo manual.

---

### FAQ — ¿Qué diferencia hay entre una receta y un producto normal?

Un **producto normal** lo compras ya hecho y lo revendes igual: tiene su propio stock que sube con compras y baja con ventas.

Una **receta** la preparas tú a partir de insumos. No tiene stock propio: su disponibilidad ("Producible") depende de cuántos insumos tengas, y al venderla se descuentan esos insumos.

```
Producto normal:  compras → stock → vendes
Receta:           insumos → preparas → vendes
                  (al vender bajan los insumos)
```

---

### FAQ — ¿Tengo que crear los insumos antes de la receta?

Sí, si vas a usar el modo **Ingredientes**. Cada ingrediente de la receta es un producto que ya debe existir, normalmente creado con el tipo **Ingrediente**.

Si usas el modo **Manual**, no necesitas insumos: solo escribes el costo. Pero entonces la receta no controla inventario.

> 💡 Crea el insumo desde **Crear Producto** y elige **Ingrediente** en el selector de tipo.

---

### FAQ — ¿Por qué mi receta no descuenta inventario al vender?

Porque está configurada con **costo Manual**. En ese modo la receta no tiene insumos guardados, así que no hay nada que descontar.

```
¿La receta descuenta insumos?
  ├─ Modo Ingredientes → SÍ descuenta
  └─ Modo Manual       → NO descuenta
```

Para que descuente, edita la receta, cambia el costo a **Ingredientes** y agrega los insumos.

---

### FAQ — ¿Qué significa "Producible" en el catálogo?

Es **cuántas unidades de la receta puedes preparar** con los insumos que tienes en este momento. Bistro mira cada insumo y se queda con el que menos alcanza.

```
Jugo de naranja (necesita 3 naranjas)
  Naranjas en stock: 12
  Producible = 12 / 3 = 4 jugos
```

Si te falta stock de algún insumo, Producible baja a **0**. Si la receta usa costo Manual (sin insumos), muestra "—".

---

### FAQ — ¿Puedo cambiar entre costo por ingredientes y costo manual?

Sí. Dentro del formulario, junto al campo **Costo**, toca `[ Ingredientes ]` o `[ Manual ]` en cualquier momento.

Al pasar a **Manual**, la lista de ingredientes se borra de esa receta. Al volver a **Ingredientes**, agrégalos de nuevo. Recuerda que solo el modo Ingredientes descuenta inventario al vender.

---

### FAQ — ¿La receta tiene stock propio como un producto normal?

No. Una receta **no maneja stock propio** y no aparece en el conteo de inventario como producto. Lo que se controla es el stock de sus **insumos**.

Por eso en el catálogo, en lugar de "Stock", la receta muestra **Producible**, y no se le hace el diagnóstico de "Salud del Stock" que sí tienen los productos normales.

> 🔒 Si necesitas controlar existencias propias de algo preparado, créalo como **Ingrediente** (producto que sí tiene stock) en vez de receta.
