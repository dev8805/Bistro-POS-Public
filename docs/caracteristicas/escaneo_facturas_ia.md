# Documentación: Flujo de Escaneo de Facturas con IA y Conversión de Unidades

Este documento explica cómo funciona internamente el proceso de escaneo de facturas, estableciendo límites claros entre lo que hace la Inteligencia Artificial (Gemini) y lo que hace el Sistema (Bistro Pos), junto con ejemplos de los distintos escenarios de conversión de unidades de medida.

---

## 1. Responsabilidades y Límites

Para mantener los cálculos exactos y evitar alucinaciones, el proceso está estrictamente dividido en dos fases:

### FASE 1: Extracción (Lo que hace Gemini)
La responsabilidad única de la Inteligencia Artificial es actuar como un **Copiador Perfecto**. Su trabajo es transcribir los datos de la hoja de papel y convertirlos en texto digital. 
- **NO hace conversiones de unidades:** No sabe qué es una "Caja" o cuántas unidades tiene.
- **NO hace operaciones matemáticas complejas:** Si se le piden fórmulas con descuentos e impuestos, se equivocará. 
- **Extracción de `ocr_unit`:** Su directiva más importante es leer la columna de cantidad (o descripción) y capturar las letras que acompañan el número (ej: *CJ, BULTO, KI, UND*). Si no hay letras, manda vacío.

### FASE 2: Lógica y Conversión (Lo que hace el Sistema Frontend)
El sistema Bistro (la interfaz de React) es el "Cerebro Matemático". Recibe la transcripción bruta de Gemini y aplica las reglas del negocio local.
- Identifica de forma segura a qué producto del catálogo corresponde el texto de la IA.
- Busca si las unidades extraídas por Gemini  (por ejemplo, "CJ") existen en la tabla de unidades de compra configuradas por el usuario.
- Realiza las matemáticas exactas basándose en el Factor de Conversión.

---

## 2. Escenarios Prácticos y Flujo de Trabajo

### Escenario A: Compra en la misma Unidad de Venta
Se compra un producto exactamente como se vende. Por ejemplo, compramos 5 unidades de "Chocorramo".

1. **La Factura Dice:** `5 Unidades Chocorramo - Costo Uni: 2000 - Total: 10000`
2. **Lo que hace Gemini:**
   - Lee el papel sin hacer preguntas.
   - Extrae: `{ Producto: "Chocorramo", Cantidad: 5, Unidad_OCR: "Unidad", Costo: 2000 }`
3. **Lo que hace el Sistema:**
   - Detecta que "Chocorramo" de la IA hace match exacto con el "Chocorramo" de la Base de Datos.
   - Revisa la unidad. Como "Unidad" no es una caja ni un empaque raro (carece de factor multiplicador), no hace conversiones extra.
   - **Resultado en Pantalla:** Ingresan 5 unidades a $2.000, con la tarjeta de color verde claro (Confirmado).

---

### Escenario B: Compra en paquete/caja (Factor de Conversión Automático)
Se vende por Unidad, pero se compra por Caja (CJ). Sabemos que la CJ trae 6 unidades. Dicho factor (CJ = 6) está configurado en el catálogo.

1. **La Factura Dice:** `2 CJ Bonyurt Chocokrispis - Costo: 12000 - Total: 24000`
2. **Lo que hace Gemini:**
   - Literal y textualmente extrae los datos del papel de forma cruda.
   - Extrae: `{ Producto: "Bonyurt Chocokrispis", Cantidad: 2, Unidad_OCR: "CJ", Costo: 12000 }`
   - *Nota: Gemini devuelve `Cantidad: 2` y no `12`. Su trabajo es extraer lo que lee, no calcular.*
3. **Lo que hace el Sistema:**
   - Identifica el producto "Bonyurt Chocokrispis" en la Base de Datos.
   - Toma el `Unidad_OCR` que es "CJ" y busca en la configuración del producto. 
   - **¡Encuentra una coincidencia!** Detecta que "CJ" está configurado con `Factor (6)`.
   - **Aplica Metemáticas Invisibles:**
     - `Cantidad Neta = 2 Cajas x 6 = 12 Unidades Reales`
     - `Costo Neto = $12.000 / 6 = $2.000 por Unidad Real`
   - **Resultado en Pantalla:** Ajusta los números internamente y muestra un mensaje verde que comunica: *"Entran 12 Und a un costo de $2.000 c/u"*.

---

### Escenario C: Compra en Empaque Desconocido (Intervención Manual Inicial)
El proveedor usó una unidad rara en la factura que el negocio no tiene registrada (ej. "ATADO") para un producto que vendemos por "Gramos". 

1. **La Factura Dice:** `1 ATADO Cebolla Larga - Costo: 15000`
2. **Lo que hace Gemini:**
   - Extrae: `{ Producto: "Cebolla Larga", Cantidad: 1, Unidad_OCR: "ATADO", Costo: 15000 }`
3. **Lo que hace el Sistema:**
   - Identifica el producto Cebolla en BD.
   - Toma la unidad "ATADO" e intenta buscarla... ¡Pero falla! (no hay configurado ningún atado en ese producto).
   - **Resultado en Pantalla (Acción Requerida):** No muestra el aviso verde. Avisa que facturaron en "ATADO" y presenta una caja desplegable al usuario para que cruce o enseñe manualmente qué es un "ATADO" para el sistema esa única vez.

---

### Escenario D: Nombre de Producto Radicalmente Distinto (Sin Reconocer)
La factura llama al "Bonyurt Chocokrispis" de forma completamente diferente, por ejemplo: "PACK LACTEO YOG CHOC 150G x 6".

1. **Lo que extrae Gemini:** `{ Producto: "PACK LACTEO YOG CHOC 150G x 6", Cantidad: 1... }`
2. **Lo que hace el Sistema:**
   - Intenta hacer coincidencia (match) de ese texto con tu base de datos de productos. 
   - Como no tiene ninguna similitud ni coincidencia con "Bonyurt", **falla silenciosamente**.
   - **Resultado en Pantalla:** Encapsula el escaneo bajo la etiqueta ámbar **"Sin reconocer"**. 
   - El bloque no puede hacer conversiones ni matemáticas porque *no sabe qué producto es*. 
   - El usuario debe usar la barra **"Buscar producto del catálogo..."**. Apenas el usuario enlaza el ítem "Sin reconocer" de Gemini con el Bonyurt del sistema, se repite automáticamente el ciclo del **Escenario B** (calculará la caja, y soltará el mensaje verde y números arreglados al instante).

---
## Resumen Práctico
- **Proceso de la IA:** Ojos, copiar, y transcribir fielmente. No debe analizar ni mutar números ni pensar en empaques reales.
- **Proceso de Bistro:** Cerebro, reconocimiento, comparativa contra el catálogo y matemáticas de conversión.

---

## 3. Contexto Técnico e Infraestructura

Esta sección lista la arquitectura de bases de datos y los archivos del Frontend involucrados de forma secuencial en el proceso.

### Tablas Involucradas (Supabase)

1. **`suppliers` (Proveedores)**
   - Actúa como la raíz del escaneo. No se puede escanear sin seleccionar un proveedor previo, ya que esto determina qué reglas aplicar.
   - Columna Clave: `invoice_config` *(JSONB)*. Guarda el prompt personalizado y los encabezados especiales (`customPrompt`, `tableColumns`, `headerFields`).
2. **`products` (Catálogo Principal)**
   - Columna Clave: `name` y `nicknames`. Se utilizan para el cruce de coincidencia (*match*) con los nombres leídos por Gemini.
   - Columna Clave: `unit`. Define la unidad de venta y medida base de salida (ej. *Unidad*, *Litro*, *Kilo*).
3. **`product_purchase_units` (Unidades de Compra Alternas)**
   - Alimenta el sistema matemático de Bistro. Alberga las equivalencias para los distintos empaques de compra.
   - Columna Clave: `unit_name`. Ej: `"CJ"`, `"Paca"`, `"Bulto"`. Es lo que la interfaz compara con el `ocr_unit` de Gemini.
   - Columna Clave: `conversion_factor`. El multiplicador para convertir la unidad facturada en la unidad pura de venta (`Unidad` / `Gramos` / etc).

### Componentes de Interfaz y Archivos (Frontend & Edge)

A continuación, los archivos en orden jerárquico que procesan la factura desde la cámara hasta la base de datos:

1. **`DocumentScanner.tsx`**
   - **Propósito:** Activa la cámara del dispositivo móvil, captura la fotografía, procesa la distorsión, preforma el recorte y entrega una imagen digital de alta calidad.
2. **`InventoryPurchase.tsx`**
   - **Propósito:** Cerebro orquestador padre. Contiene las funciones:
     - `handleScanInvoice`: Toma la imagen proveniente del escáner, la comprime en Base64, busca el *config* del proveedor (Supabase) y detona el envío a la nube de Gemini. Trunca a 2 y 3 decimales los números retornados por la IA para prevenir errores lógicos.
     - `matchScannedProducts`: Algoritmo de 4 pasos (nombre/nickname, parcial/exacto) que enlaza lo leído del papel a un producto real en memoria.
3. **`supabase/functions/scan-invoice/index.ts`** *(Edge Function)*
   - **Propósito:** Proxy servidor hacia Google Gemini V2 Flash. 
   - Transforma los requerimientos del frontend en un *System Prompt* y restringe a la IA vía **JSON Schema Obligatorio** para que siempre devuelva el nombre de la unidad (`ocr_unit`), cantidad, costos, fechas y demás configuraciones leídas del JSON de proveedores.
   - **Reintentos automáticos:** Implementa hasta 4 intentos con *exponential backoff* (~1.5s → 3s → 6s → 12s) para errores 429, 503 y 502 de Gemini. Una llamada lenta en producción (hasta ~25s) puede ser un reintento normal, no un timeout del sistema.
   - **Excepción HEIC:** Archivos `.heic`/`.heif` (iPhone) omiten la compresión y se envían en formato nativo. Para el resto, la imagen se redimensiona a 1024px máximo y se comprime a JPEG 60%.
   - **Fallback JSON inválido:** Si Gemini devuelve texto mal formado, la función retorna `{ items: [], error: "No se pudo parsear..." }` en lugar de un error 500. El frontend lo interpreta y muestra un toast de error al usuario.
4. **`InvoiceReviewPanel.tsx`**
   - **Propósito:** Interfaz de usuario final e inteligente (La confirmación y matemáticas visuales). 
   - Renderiza los ítems cruzados en paneles verdes (`Matched`) y los no reconocidos en paneles ámbar (`Unmatched`). 
   - Reacciona en tiempo real a la selección del producto para disparar el cálculo matemático si el `ocr_unit` coincide con el `unit_name` de un `product_purchase_units`. Da luz verde ("Entran 12 Und a $2.000 c/u") y procesa manual fallbacks (*Mini-selector desplegable*).

---

## 4. Constructor Matemático Híbrido (IA + AST)

Para solucionar el recálculo correcto de costos (IVA, descuentos) por cada proveedor, el constructor matemático delega la lógica de negocio al usuario pero la ejecución al sistema.

*   **¿Cómo funciona?** El usuario escribe la instrucción en lenguaje natural indicando cómo obtener el **Costo Total de la línea** (ej: *"toma @V.TOTAL sumale @IVA"*).
*   **La IA convierte, No Calcula:** Al configurar al proveedor esa única vez, el backend le pide a Gemini traducir el texto a una expresión matemática AST abstracta y estructurada en funciones (Ej: `ADD(@V.TOTAL, @IVA)`) y se guarda en BD en `cost_formula`. 
*   **JavaScript resuelve:** Cuando se escanea una factura real, Javascript toma la ecuación, reemplaza las variables extraídas de la foto y calcula el **Costo Total de la Línea**. Partiendo de ese gran total, el propio sistema lo divide automáticamente entre las cantidades correspondientes para obtener unitarios exactos, previniendo así cualquier error manual de división.

---

## 5. El Flujo Completo: Desde la Foto hasta la Base de Datos

Este es el paso a paso transicional por el que viajan los números hasta registrarse en el sistema. Consideraremos el peor escenario: Compra en cajas, con IVA y con Descuento.

**Paso 1: Configuración Previa (Maestro de Proveedor)**
El administrador escribe en la configuración: *"Al @Subtotal restale el @Descuento_Monto"*. Internamente la IA lo transforma a `(@Subtotal - @Descuento_Monto)`. También, en el catálogo, define que el producto Bonyurt se vende por Unidad, pero el proveedor facturará usualmente en "Caja" (`Factor de conversión = 6`).

**Paso 2: Captura y Extracción (Gemini)**
Se toma foto a la factura. Gemini extrae lo crudo:
```json
{
  "Producto": "Bonyurt Fresa",
  "quantity": 2,
  "ocr_unit": "Caja",
  "Subtotal": 14000,
  "Descuento_Monto": 2000
}
```

**Paso 3: Evaluación de la Fórmula (Cálculo del Total)**
El frontend cruza la ecuación guardada con los números extraídos.
- Substitución AST: `(14000 - 2000)`
- **Javascript Calcula:** El Total Bruto Final de la fila equivale a **$12,000**.
- **División Pura (Costo X Empaque):** Automáticamente el frontend toma este Total (`12000`) y lo divide por la cantidad comprada extraída (`2 Cajas`). Resultando en que cada Caja costó formalmente **$6,000**. (El input "Costo X CJ" refleja este número).

**Paso 4: Transformación Física (Conversión de Unidades)**
Javascript cruza el "Caja" detectado con el Catálogo que decreta que Caja = 6.
- Multiplica la `Cantidad Neta (2 Cajas)` x `Factor (6)` = **Cantidad Real Entrante a Inventario: 12 Unidades Reales**.

**Paso 5: Cálculo Final (Costo por Unidad a Guardar)**
Javascript consolida el precio más pequeño posible para el inventario. Toma el **Costo Total Bruto ($12,000)** y lo divide por el total de **Unidades Reales Entrantes (12)**.
- `Costo Final Unitario` = **$1,000** por unidad simple de Bonyurt. (El banner verde confirmará: "Entran 12 Und a un costo de $1,000 c/u").

**Paso 6: Inserción Final en la Base de Datos**
En el momento que el usuario aprueba y guarda la factura ("Comprar"), el sistema (`InventoryPurchase.tsx` a través de `useProducts.ts`) registra oficialmente la compra en la arquitectura de BD (Supabase):
- **Aumento de Stock (`products`):** Se actualiza la cantidad global directamente sumando a la columna `stock` del producto referenciado.
- **Registro de Costo y Lote (`inventory_lots`):** Se inserta un lote para el producto guardando la `initial_quantity` (ej: 12), `remaining_quantity` (ej: 12),  `purchase_date`, proveedor, y el costo unitario neto calculado de **$1,000** (`unit_cost`).
- **Impacto Financiero:** 
  - Si es *A Crédito*, se genera una deuda (`debts`) atada al proveedor y a dicho lote para su control por cuotas.
  - Si es *De Contado*, se debita el dinero directamente originando un gasto (`expenses`) de tipo "Inventario", el cual descuenta saldo real del turno de caja y cuentas de la empresa (Ej. Nequi, Efectivo).
- ¡El ciclo termina garantizando sincronía milimétrica entre la logística física y la contabilidad!
