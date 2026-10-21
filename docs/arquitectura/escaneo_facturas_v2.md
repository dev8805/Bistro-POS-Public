# Arquitectura: Motor de Escaneo de Facturas v2 y Resolución de Líneas

Este documento detalla la arquitectura técnica, las decisiones de diseño y la implementación del flujo de **Escaneo de Facturas v2** en Bistro POS, incluyendo el backend en Supabase, el motor determinista de cálculo, el consumo de tokens y la experiencia de usuario responsiva en móvil y desktop.

---

## 1. Visión General y Objetivos

El objetivo de la versión 2 es garantizar **certeza contable, agilidad operativa y una interfaz limpia** al ingresar compras de inventario desde facturas físicas o digitales.

### Problemas resueltos frente a la v1:
1. **Descuento global prorrateado eliminado:** La v1 distribuía descuentos globales sobre todos los renglones, corrompiendo el costo unitario de productos individuales. En v2, cada línea es financieramente autónoma.
2. **Impuestos y costos deterministas:** Visión OCR no calcula; extrae. Un motor determinista en TypeScript calcula y ratifica los costos netos.
3. **Conversión de empaques a unidades de venta:** Diferenciación entre cantidad facturada (ej: 1 caja) y unidades para stock (ej: 30 botellas), calculando el costo unitario real al detal.
4. **Flujo de resolución respetuoso:** El asistente de resolución de líneas nunca reabre ni desvincula productos ya reconocidos al navegar hacia atrás.
5. **Motor v2 por defecto:** Se eliminó el selector manual de versión en la interfaz para simplificar la toma de decisiones del cajero o administrador, operando directamente con el flujo optimizado.
6. **Diseño responsivo móvil y desktop:** Eliminación de elementos sobrecargados en móviles (imágenes y badges innecesarios) y rediseño en cuadrícula de dos columnas en desktop para evitar formularios estirados horizontalmente.

---

## 2. Diagrama del Pipeline de Datos

```
[Foto de Factura o Captura Ctrl+V]
       │
       ▼
[Edge Function: scan-invoice-v2] ──► Gemini 2.5 Flash (Visión OCR pura)
       │                              - maxOutputTokens: 8192 (soporta facturas de >25 renglones)
       │                              - Extrae: descripción, cantidades, impuestos, descuentos
       │                              - Sanea: códigos de barras (8-14 dígitos)
       │                              - Sugiere: factores de empaque (ej: Caja x 24)
       ▼
[Cliente: useInvoiceScanDraft]
       │
       ├─► [lineCostCalculator.ts] ──► Cálculo determinista por renglón
       │                                - subtotal + impuestos - descuentos = total línea
       │                                - Ratificación dinámica contra total impreso
       │                                - unitCost = total / (cantidad * factor)
       │
       ├─► [Emparejamiento de Productos]
       │     ├─► Opción A (Local): productMatch.ts (Tokens, apodos, código de barras en memoria)
       │     │                     - Token Subset Matching: discrimina volúmenes (250 ml vs 350 ml)
       │     └─► Opción B (Cloud/IA): match-products-v2 (Embeddings pgvector en Supabase)
       │           *(Desconectado temporalmente para validación del emparejador local)*
       │
       ▼
[Flujo UI: ScanLineResolverStep] ──► Resuelve ÚNICAMENTE líneas pendientes / desconocidas
       │                              - Progreso: cuenta solo líneas manuales ("1 de 2")
       │                              - Retroceso: salta productos auto-reconocidos
       ▼
[Panel de Revisión: ScanReviewStep] ──► Confirmación de compra, inventario y caja
```

---

## 3. Módulos Implementados y Estructura de Archivos

### 3.1. Backend y Base de Datos (Supabase)

* **`supabase/functions/scan-invoice-v2/index.ts`**:
  * Edge Function optimizada para Gemini Flash con esquema JSON estricto y tipado.
  * **Límite de salida ampliado a 8192 tokens:** Previene errores de truncamiento (`finishReason: MAX_TOKENS`) en facturas extensas con más de 20 renglones.
  * Extracción limpia de renglones (`items`) con desglose de impuestos (IVA, impoconsumo), descuentos y totales de línea.
  * Validador de código de barras: descarta referencias internas cortas (menos de 8 dígitos) para no ensuciar el catálogo.
* **`supabase/functions/match-products-v2/index.ts`**:
  * Servicio semántico con `text-embedding-004` y búsqueda vectorial (`pgvector`).
  * Incluye el **Guardián de Medidas** en código determinista para impedir que un producto de 350 ml se vincule por error a uno de 1.5 L.
  * Endpoint `sync_catalog`: genera embeddings iniciales de los productos del negocio.
* **`supabase/migrations/20260910130000_create_product_embeddings_v2.sql`**:
  * Tabla `product_embeddings` vinculada al negocio (`business_id`) y al producto (`product_id`).
  * Función RPC `match_products_semantic` para consultas vectoriales por similitud coseno.

### 3.2. Motor Determinista Financiero

* **`lib/invoiceScan/lineCostCalculator.ts`**:
  * Módulo TypeScript puro, sin efectos secundarios ni dependencias de UI o base de datos.
  * Tipos principales: `RawLineItemV2` y `CalculatedLineCostV2`.
  * **Fórmula estricta:**
    $$\text{netTotal} = \text{subtotal} + \text{tax} - \text{discount}$$
  * **Ratificación dinámica:** Si la factura incluye una columna de total de renglón consolidada, se compara contra el cálculo dinámico.
  * **Costo unitario de inventario:**
    $$\text{unitCost} = \frac{\text{netTotal}}{\text{ocrQuantity} \times \text{conversionFactor}}$$

### 3.3. Emparejador Local en Cliente

* **`lib/invoiceScan/productMatch.ts`**:
  * Función `matchProductLine(ocrName, products, barcode)`.
  * Cascada de 5 niveles en memoria del navegador:
    1. Código de barras exacto.
    2. Apodo exacto (normalizado sin tildes ni símbolos).
    3. Apodo parcial.
    4. Nombre exacto.
    5. Coincidencia por conjunto de palabras clave (*tokens*).
  * **Token Subset Matching:** Cada palabra o número significativo (ej: `"quatro"`, `"350"`, `"ml"`) es un token indivisible. Si la factura dice `Quatro 350 ML`, el sistema no se emparejará con `Quatro 250 ML` porque `250` es un token faltante y no compatible. Tampoco emparejará nombres genéricos al azar si no cubren todos los tokens del producto del catálogo.

### 3.4. Orquestación del Estado y UI Responsiva

* **`hooks/useInvoiceScanDraft.ts`**:
  * Adaptación de renglones recibidos con `calculateLineCostV2`.
  * **Motor v2 predeterminado:** `engineVersion: 'v2'` asignado por defecto para garantizar el pipeline económico y determinista.
  * **Protección de productos reconocidos al retroceder:**
    * `isLineManual(line)`: define si una línea requiere intervención (`!line.isAutoMatched || line.unitCase === 'unknown'`).
    * `findPreviousManualLineIndex(lines, fromIndex)`: busca hacia atrás ignorando productos auto-reconocidos.
    * `progress`: cuenta exclusivamente líneas manuales pendientes ("1 de 2").
    * `goToPreviousLine`: jamás altera ni desvincula productos resueltos automáticamente.
    * `goBack`: regresa al paso de proveedor sin reiniciar decisiones automáticas.

* **`components/invoiceScan/ScanStepShell.tsx`**:
  * **Ancho modal dinámico (`STEP_MAX_WIDTH_CLASSES`):**
    * En pasos iniciales de selección (`destination`, `capture`), el contenedor usa `md:max-w-xl lg:max-w-2xl` para evitar que las opciones se vean estiradas o vacías en pantallas desktop (`>= 1024px`).
    * En pasos con mayor densidad de datos (`review`, `crop`), el contenedor se expande a `md:max-w-2xl lg:max-w-4xl`.

* **`components/invoiceScan/ScanDestinationStep.tsx`**:
  * **Cuadrícula de 2 columnas en desktop (`sm:grid-cols-2 gap-4`):**
    * Cada tarjeta cuenta con icono temático (`inventory_2` con acento ámbar para inventario, `receipt_long` con acento azul para gastos).
    * Badges de impacto contable directo (`Entra a stock` vs `Egreso directo`).
    * Affordance táctil y accesible con teclado (`Enter` / `Espacio`).

* **`components/invoiceScan/ScanCaptureStep.tsx`**:
  * **Diseño visual limpio y neutro:**
    * Paleta moderna y sin saturación de amarillo: iconos de Cámara, Galería y Pegar Captura en contenedores neutros (`slate-100 text-slate-700`) con acentos sutiles `indigo` al interactuar.
    * Banner inferior de IA con estilo sutil y limpio (`border-indigo-100`, degradado índigo suave y destello `auto_awesome` en azul índigo).
  * **Textos adaptativos según dispositivo:**
    * Móvil: Muestra `"Galería"` y `"Elige una foto de la factura"`.
    * Desktop: Muestra `"Elegir archivo"` y `"Explora desde tu equipo"`.
  * **Zona de pegado y arrastre (Drag & Drop / `Ctrl + V`):**
    * Detección directa de capturas pegadas del portapapeles o arrastradas sobre la ventana, con atajo visual `Ctrl + V`.
  * Selector v1/v2 ocultado para mantener la experiencia simple y directa.

* **`components/invoiceScan/ScanReviewStep.tsx`**:
  * **Optimización en pantallas móviles (`< 640px`):**
    * Miniaturas de fotos de producto ocultas (`hidden sm:flex`) para maximizar el ancho disponible para nombres y valores contables.
    * Badges azules de empaque ocultos en móvil (`hidden sm:inline-flex`) para evitar ruido visual en listas largas.
    * Descripción del texto escaneado con envoltura de hasta dos líneas (`line-clamp-2 break-words leading-tight`) para evitar nombres truncados ininteligibles.

---

## 4. Costos y Consumo de Tokens (Gemini 2.5 Flash)

| Concepto | Consumo Promedio | Costo Aproximado (USD) | Costo en Pesos Colombianos (COP) |
|---|---|---|---|
| **Tokens de Entrada** (Prompt + Imagen) | ~2.300 tokens | ~$0,0003 USD | ~1,2 COP |
| **Tokens de Salida** (JSON estructurado de 10–30 renglones) | ~1.200 a 4.600 tokens | ~$0,0018 a $0,007 USD | ~7 a 28 COP |
| **Total por Escaneo** | **~3.500 a 7.000 tokens** | **~$0,002 a $0,007 USD** | **~10 a 30 COP** |

*Nota:* Los tokens de salida representan más del 80% del costo total de la llamada, por lo que el prompt se diseñó para evitar razonamientos extensos redundantes por cada ítem y emitir directamente los valores numéricos y nombres extraídos.

---

## 5. Reglas de Negocio Clave

1. **Aislamiento de Renglón:** Ninguna línea transfiere costos ni descuentos a otra.
2. **Prioridad del Factor IA:** Si Gemini detecta con certeza un factor de empaque (`aiConversionFactor = 1`), no se sobreescribe con expresiones regulares de texto (evita errores en nombres como *"Kola Postobon X12"* cuando la factura cobraba por unidad).
3. **No Intrusión en Retroceso:** Un producto auto-emparejado es sagrado durante el asistente de resolución. Solo se puede editar o eliminar explícitamente en el Panel de Revisión final.
4. **Token Exclusivity:** El emparejador local requiere que todos los tokens numéricos y de volumen coincidan exactamente para evitar confusiones entre presentaciones del mismo producto.

---

## 6. Verificación y Pruebas

Toda la lógica cuenta con cobertura de pruebas automatizadas con Vitest:
* `hooks/useInvoiceScanDraft.test.ts`: 74 pruebas de integración del hook (navegación, retroceso, cálculo de líneas, apodos).
* `components/invoiceScan/ScanReviewStep.test.tsx`: 18 pruebas unitarias de renderizado, cálculo de totales y visualización responsiva.
* `components/invoiceScan/ScanCaptureSteps.test.tsx`: 16 pruebas de los pasos de destino, captura (cámara, archivo, Ctrl+V), recorte y error.
* `screens/InvoiceScanScreen.test.tsx`: pruebas de flujo completo y control de permisos de compra.
* `components/invoiceScan/ScanLineResolverStep.test.tsx`: 27 pruebas de interfaz y accesibilidad.
* `lib/invoiceScan/lineCostCalculator.test.ts`: pruebas de fórmulas financieras, impuestos y factores de empaque.

