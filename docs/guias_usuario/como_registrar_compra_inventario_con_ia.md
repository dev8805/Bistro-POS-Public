# Cómo registrar una compra de inventario escaneando la factura con IA en Bistro

> Guía para: Administradores y cajeros (con permiso de compras/gastos)
> Módulo: **Gastos** → **Escanear factura** (IA)
> Tiempo estimado: 2–3 minutos por factura

---

## ¿Para qué sirve?

**Escanear factura** te permite tomar una foto, subir un archivo o pegar una captura de pantalla de la factura de compra para que la inteligencia artificial extraiga los productos, cantidades, empaques y costos automáticamente.

Si necesitas **escanear una factura de proveedor**, **ingresar mercancía con foto**, **cargar una factura de compra**, **subir un comprobante con IA**, **actualizar el stock desde una remisión** o **registrar productos que llegaron al negocio**, este es el flujo indicado. La IA extrae los datos de forma asistida y tú mantienes el control total para revisar, corregir o ajustar precios antes de guardar.

> 💡 La opción "Escanear factura" también te permite registrar un **Gasto** de operación. Esta guía se enfoca en la ruta **Compra de inventario**.

---

## Antes de empezar

- **Conexión a internet activa:** La IA analiza la imagen en la nube. Si no hay internet, la opción aparecerá deshabilitada y deberás usar la **Compra de inventario** manual.
- **Permiso de compras o gastos:** Tu usuario debe tener asignado el permiso de registrar egresos en Bistro.
- **Turno de Caja abierto:** Obligatorio únicamente si la factura se pagó de contado en efectivo saliendo del dinero de la caja del turno.
- **Fotografía nítida y bien iluminada:** Asegúrate de que el encabezado (proveedor, fecha) y las columnas de cantidades y precios sean legibles.
- **Sin configuración previa de plantillas:** No necesitas configurar columnas ni fórmulas por proveedor; el motor v2 extrae los renglones de manera autónoma.
- **Creación en el momento:** Si la factura incluye productos o proveedores que aún no existen en tu catálogo, podrás crearlos directamente durante el escaneo sin salir de la pantalla.

---

## Paso a paso

El escaneo unificado se completa en una secuencia fluida de pasos: eliges el destino, capturas la imagen, confirmas el proveedor, resuelves productos no reconocidos con sus empaques, revisas costos y confirmas el pago. Nada se guarda en el inventario ni en caja hasta que confirmas el paso final.

---

### Paso 1 — Abrir "Escanear factura" desde el menú de Gastos

En la pantalla principal o desde el menú de **Vender**, abre el botón de **Gastos**. Selecciona la primera tarjeta destacada con el distintivo **IA**.

`[ 💰 Gastos ]` → `[ ⚡ Escanear factura (IA) ]`

```
┌─ Acciones de egresos ─────────────┐
│ ┌───────────────────────────────┐ │
│ │ ⚡ Escanear factura      [IA] │ │ ◄── Toca aquí
│ │ La IA lee productos y costos. │ │
│ │ Tú revisas antes de guardar.  │ │
│ └───────────────────────────────┘ │
│ ───────── manualmente ─────────    │
│  Compra de inventario         ›    │
│  Gastos                       ›    │
│  Merma                        ›    │
└────────────────────────────────────┘
```

> ⚠️ Si el dispositivo pierde internet, la tarjeta se tornará gris indicando que el escaneo con foto requiere conexión.

---

### Paso 2 — Elegir el destino: Compra de inventario

El sistema te preguntará qué tipo de documento deseas procesar. En pantallas de escritorio verás una cuadrícula de dos columnas con tarjetas claras e iconos temáticos. Selecciona **Compra de inventario**.

```
┌─ ¿Qué trae este documento? ────────────────────┐
│  Elige el destino antes de tomar la foto.      │
│                                                │
│  ┌──────────────────┐    ┌──────────────────┐  │
│  │ [📦] Stock       │    │ [📄] Directo     │  │
│  │ Compra inventario│    │ Gasto            │  │
│  │ Entra al stock y │    │ Servicios, arriendo│
│  │ descuenta al ven.│    │ o consumo interno│  │
│  │ [Seleccionar →]  │    │ [Seleccionar →]  │  │
│  └──────────────────┘    └──────────────────┘  │
│                                                │
│  ⓘ Si te equivocas, puedes volver antes        │
│    de guardar.                                 │
└────────────────────────────────────────────────┘
```

> 💡 **Diferencia clave:** La **Compra de inventario** alimenta tus existencias y recalcula costos unitarios. El **Gasto** registra una salida de dinero sin alterar el stock de venta.

---

### Paso 3 — Tomar foto, elegir archivo o pegar captura

Elige el método de captura más cómodo según tu dispositivo. En computador dispones de carga directa y atajo rápido:

- **Cámara:** Ideal en tablet o celular para fotografiar la factura física.
- **Elegir archivo (o Galería en móvil):** Para seleccionar un archivo PNG, JPG o WEBP guardado en tu equipo.
- **Pegar captura o arrastrar archivo (`Ctrl + V`):** Puedes tomar una captura de pantalla y presionar `Ctrl + V` o arrastrar el archivo sobre el recuadro.

```
┌─ Toma la foto de la factura ───────────────────┐
│  ┌──────────────────┐    ┌──────────────────┐  │
│  │ 📷 Cámara        │    │ 📁 Elegir archivo│  │
│  │ Toma con tu      │    │ Explora desde tu │  │
│  │ cámara           │    │ equipo o celular │  │
│  └──────────────────┘    └──────────────────┘  │
│                                                │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
│    📋 Pegar captura o arrastrar      [Ctrl+V]  │
│    Pega del portapapeles o suelta la imagen    │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
│                                                │
│  ⓘ Peso máximo: 50 MB (PNG, JPG o WEBP)        │
└────────────────────────────────────────────────┘
```

> 💡 **Consejo:** Para facturas electrónicas en formato PDF, abre el PDF en pantalla, toma una captura de la tabla de ítems y presiona `Ctrl + V` directamente.

---

### Paso 4 — Ajustar el recorte de la factura

El asistente te presentará la imagen capturada para que encuadres únicamente el cuerpo de la factura. Arrastra los bordes o esquinas para descartar fondos oscuros, mesas o elementos distractores, y presiona **Usar recorte**.

```
┌─ Ajusta el recorte ────────────────────────────┐
│   ┌────────────────────────┐                   │
│   ●────────────────────────●                   │
│   │   [ CUERPO FACTURA ]   │ ◄── Arrastra      │
│   ●────────────────────────●     las esquinas  │
│   └────────────────────────┘                   │
│                                                │
│   [ Volver a tomar ]       [ Usar recorte ]    │
└────────────────────────────────────────────────┘
```

La inteligencia artificial procesará los renglones durante unos segundos mediante visión OCR determinista de alta precisión.

---

### Paso 5 — Confirmar el proveedor detectado

La IA extraerá el nombre comercial y NIT impresos en el encabezado y los cotejará con tu lista de proveedores registrados.

```
Detección de proveedor
  │
  ├── Proveedor coincide ──► Se muestra marcado con ✓
  │                          [ Continuar ]
  │
  └── Proveedor nuevo    ──► Permite editar Nombre y NIT
                             [ Usar este proveedor ]
                             [ Buscar uno existente ]
```

Si el proveedor es nuevo, se creará automáticamente en tu base de datos cuando confirmes la compra al final del proceso.

---

### Paso 6 — Resolver productos pendientes (Línea i de n)

Los productos que coinciden de forma exacta o por palabras clave con tu catálogo se enlazan automáticamente. Para los renglones no reconocidos, el asistente te mostrará una interfaz paso a paso:

```
┌─ Resuelve esta línea ──────── Línea 1 de 2 ────┐
│  "GASEOSA QUATRO 350ML RET"                    │
│  Cant: 2 CJ            Costo neto: $48.000     │
│  ────────────────────────────────────────────  │
│  [ ➕ Crear producto rápido ]                  │
│  [ 🔗 Es un producto que ya tengo ]            │
│  [ 🚫 Omitir esta línea ]                      │
│                                                │
│  [ ← Volver a la anterior ]                    │
└────────────────────────────────────────────────┘
```

Opciones disponibles para cada línea:
1. **Crear producto rápido:** Abre un formulario emergente para guardarlo en tu catálogo (nombre, categoría, costo, precio de venta e indicación de si es insumo o producto final).
2. **Es un producto que ya tengo:** Te permite buscarlo en tu catálogo existente. Podrás activar la opción de **guardar como apodo** para que la próxima factura lo reconozca de inmediato.
3. **Omitir esta línea:** Excluye el renglón de la compra sin sumarlo al inventario ni al costo total.

> 🔒 **Navegación segura:** Al presionar **Volver a la anterior**, el asistente únicamente reabre líneas pendientes manuales; jamás desvincula ni altera productos que el sistema ya reconoció de forma automática.

---

### Paso 7 — Indicar equivalencias de empaque

Si la factura cobra por cajas, pacas, docenas o bultos (`CJ`, `PACA`, `BULTO`) y el producto en tu catálogo se vende por unidades (`Und`), el sistema te solicitará el **Factor de conversión**.

```
┌─ Equivalencia de empaque ──────────────────────┐
│  "CJ" de Quatro 350ml = ¿cuántas Und trae?     │
│                                                │
│       ┌──────────────┐                         │
│       │      24      │ unidades por empaque    │
│       └──────────────┘                         │
│                                                │
│  ► Previsualización de inventario:             │
│    Entran 48 Und a $1.000 c/u.                 │
│                                                │
│  [ Omitir línea ]              [ Continuar ]   │
└────────────────────────────────────────────────┘
```

El cálculo se ejecuta de forma determinista:

$$\text{Costo unitario} = \frac{\text{Costo total del renglón}}{\text{Cantidad facturada} \times \text{Factor}}$$

Bistro guardará esta equivalencia en la ficha del producto para no volvértela a preguntar en futuras compras del mismo proveedor.

---

### Paso 8 — Revisar cantidades, costos y margen en el Panel de Revisión

Antes de guardar, verás el resumen consolidado de toda la compra. En pantallas de escritorio dispondrás de una tabla completa; en teléfonos móviles, la lista oculta fotos y badges secundarios para dar prioridad a la lectura del texto y los valores monetarios.

```
┌─ Revisión de compra ───────────────────────────┐
│ Producto        Cant.   Costo Und.     Total   │
│ ────────────────────────────────────────────── │
│ Quatro 350ml    48 Und  $1.000       $48.000   │
│ Agua Manantial  24 Und  $1.200       $28.800   │
│ ────────────────────────────────────────────── │
│ TOTAL COMPRA:                        $76.800   │
│                                                │
│ [ + Agregar ítem manual ]   [ Confirmar compra]│
└────────────────────────────────────────────────┘
```

En este panel puedes:
- Tocar cualquier renglón para corregir cantidad o costo unitario.
- Ver si el costo subió o bajó respecto al catálogo (variación porcentual).
- Ajustar el **Precio de venta** si deseas actualizar el margen de ganancia en mostrador.
- Eliminar líneas no deseadas tocando el icono de papelera.

---

### Paso 9 — Seleccionar método de pago y finalizar

Presiona **Confirmar compra** y define cómo se realizó el desembolso:

```
¿Cómo se pagó la factura?
  │
  ├── Contado ──► ¿Sale de caja?
  │                ├── Sí ──► Selecciona Efectivo, Nequi, etc.
  │                │          (Registra egreso en el turno activo)
  │                └── No ──► Compra pagada con fondos externos
  │
  └── Crédito ──► Ingresa Fecha de Pago obligatoria
                   (Crea cuenta por pagar al proveedor)
```

Al presionar **Registrar compra**, el sistema ejecuta una transacción atómica protegida: se crea el lote, sube el stock en inventario, se crean los productos nuevos y se asienta el egreso contable.

---

## Errores comunes

Revisa las situaciones frecuentes al digitalizar comprobantes y su solución inmediata:

| Situación | Qué hacer |
|-----------|-----------|
| Tarjeta "Escanear factura" deshabilitada en gris | No hay internet. Verifica la red Wi-Fi/datos o registra con **Compra de inventario (manual)**. |
| El motor indica error de lectura o tiempo agotado | La imagen está movida o poco iluminada. Presiona **Reintentar** o pulsa **Continuar manual** para usar la foto adjunta. |
| La factura trae más de 25 renglones y tardó en leer | Normal en facturas extensas; el motor v2 está optimizado para procesar listas largas de productos sin cortar información. |
| El sistema no emparejó un producto que ya tengo | Ocurre si el nombre en factura es muy genérico o abreviado. Selecciona **Es un producto que ya tengo** y guárdalo como apodo. |
| El botón de guardar o confirmar no responde | Revisa el árbol de diagnóstico inferior; usualmente falta responder si el dinero sale de caja o fijar la fecha de crédito. |

Diagnóstico rápido si no puedes finalizar el guardado:

```
¿Por qué no avanza la confirmación?
  │
  ├── ¿Hay proveedor sin confirmar? ──► Ve al paso de proveedor
  ├── ¿Todas las líneas omitidas?   ──► Debe haber mínimo 1 producto
  ├── ¿Crédito sin fecha?          ──► Elige la fecha límite de pago
  └── ¿Contado con caja abierta?   ──► Marca si el dinero sale de caja
```

---

## Preguntas frecuentes

Respuestas directas sobre el funcionamiento del motor de escaneo con IA en Bistro.

---

### FAQ — ¿La IA altera los costos si la factura tiene descuentos o impuestos?

No. A diferencia de sistemas que promedian o prorratean descuentos globales entre todos los productos, el motor v2 de Bistro calcula cada línea de forma autónoma. Los impuestos (IVA, impoconsumo) y descuentos específicos de cada renglón se aplican directamente sobre su propio costo neto, garantizando un valor de inventario contablemente exacto.

---

### FAQ — ¿Cómo distingue el sistema entre tamaños similares como 250 ml y 350 ml?

Mediante la **coincidencia estricta de palabras y medidas**. El sistema analiza cada parte del nombre y las cantidades por separado (por ejemplo: la marca `"Quatro"`, el número `"350"` y la unidad `"ml"`). Si la factura indica 350 ml, descarta automáticamente cualquier producto de 250 ml aunque compartan la misma marca, evitando que se mezclen presentaciones distintas en tu inventario.

---

### FAQ — ¿Qué ocurre si cierro la ventana antes de terminar?

No se guarda ningún dato a medias. Si presionas la `X` o sales del flujo, el sistema te solicitará confirmación para descartar el borrador. Nada ingresará al stock ni a los registros contables hasta que presiones **Registrar compra** en el último paso.

---

### FAQ — ¿Puedo ingresar compras si la factura física no tiene código de barras?

Sí. El escaneo con IA lee texto plano (descripciones alfanuméricas) sin depender de códigos de barras. Además, si prefieres registrar la compra de forma 100% manual sin foto, puedes usar la opción **Compra de inventario (manualmente)** en el mismo menú de Gastos, buscando los artículos directamente por su nombre.

---

### FAQ — ¿Qué pasa si una factura viene en PDF digital en lugar de papel?

Puedes abrir el PDF en tu computador o celular, tomar una captura de pantalla del área de la factura (con la herramienta de recorte de Windows `Win + Shift + S` o captura del móvil) y en la pantalla de captura de Bistro presionar el recuadro **Pegar captura** o presionar `Ctrl + V`. La imagen se procesará de inmediato sin necesidad de imprimirla ni guardarla como archivo.

---

## Recursos multimedia

> Sugerencias de material de apoyo para enriquecer el Asistente IA de Bistro.

| Tipo | Nombre sugerido | Qué mostraría |
|------|----------------|---------------|
| Video | "Bistro — Escaneo de facturas v2 con IA" | Flujo completo desde la captura con Ctrl+V hasta el aumento del stock en inventario |
| GIF | "Bistro — Resolver empaques y equivalencias" | Configuración de caja x 24 botellas y previsualización del costo por unidad |
| Imagen | "Bistro — Panel de revisión desktop vs móvil" | Comparativa visual de la cuadrícula de revisión en escritorio y la vista compacta en celular |
