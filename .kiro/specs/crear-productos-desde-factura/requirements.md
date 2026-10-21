# Requirements Document

## Introduction

Esta funcionalidad, **Crear Productos desde Factura**, permite que un tendero cargue rápidamente su catálogo de productos a partir de facturas de proveedores escaneadas con IA. A diferencia del flujo de escaneo unificado (que registra compra, lote, pago y deuda), este flujo se enfoca exclusivamente en **crear productos nuevos** en el catálogo sin generar ningún movimiento financiero ni de inventario avanzado.

El caso de uso principal es el de un tendero que está empezando con el sistema y quiere poblar su catálogo usando las facturas que ya tiene a mano, aprovechando la extracción automática de nombre, barcode, costo y proveedor.

## Glossary

- **Sistema**: La aplicación BistroPOS (PWA/Android).
- **Catálogo**: La tabla `products` con todos los productos del negocio.
- **Factura**: Documento físico de compra a proveedor, fotografiado o subido desde galería.
- **Línea_Factura**: Cada ítem extraído por la IA de una factura (nombre, cantidad, costo unitario, barcode opcional).
- **Producto_Existente**: Un producto que ya existe en el Catálogo, identificado por match de barcode exacto o nombre normalizado.
- **Producto_Nuevo**: Una Línea_Factura que no tiene coincidencia con ningún Producto_Existente.
- **Proveedor**: Entidad en la tabla `suppliers` con nombre, NIT y teléfono.
- **SimpleProductScreen**: Pantalla existente de creación/edición de productos simples.
- **InvoiceCreateScreen**: Nueva pantalla orquestadora del flujo completo.
- **Prefill**: Datos prellenados que se pasan a SimpleProductScreen vía `sessionStorage` para precargar campos.
- **Normalización_Nombre**: Proceso de convertir un nombre a minúsculas, sin acentos, sin espacios extra (trim), para comparación.
- **scan-invoice-unified**: Edge function existente de Supabase que procesa la imagen de factura con Gemini Vision y retorna líneas extraídas.

## Requirements

### Requisito 1: Punto de acceso al flujo

**Historia de Usuario:** Como tendero, quiero acceder al flujo de creación desde factura desde el menú de creación de productos, para descubrirlo fácilmente cuando quiero agregar productos al catálogo.

#### Criterios de Aceptación

1.1. WHEN el usuario abre el menú desplegable "Crear" en ProductsScreen, THE Sistema SHALL mostrar una opción "Desde factura" como primera opción del menú, con ícono de cámara y descripción "Escanea y crea varios productos".

1.2. WHEN el usuario selecciona la opción "Desde factura", THE Sistema SHALL navegar a InvoiceCreateScreen registrando un nuevo valor `CREATE_FROM_INVOICE` en el enum Screen.

1.3. WHILE el dispositivo está offline, THE Sistema SHALL deshabilitar la opción "Desde factura" y mostrar un toast indicando que se requiere conexión.

1.4. WHEN el usuario no tiene el permiso `inv_create`, THE Sistema SHALL ocultar todo el menú de creación (comportamiento existente que se preserva).

### Requisito 2: Captura y procesamiento de imagen

**Historia de Usuario:** Como tendero, quiero fotografiar o subir una factura y que la IA extraiga los productos, para no tener que escribir cada uno manualmente.

#### Criterios de Aceptación

2.1. WHEN el usuario inicia InvoiceCreateScreen, THE Sistema SHALL mostrar ScanCaptureStep permitiendo tomar foto con cámara o seleccionar imagen de galería.

2.2. WHEN el usuario captura o selecciona una imagen, THE Sistema SHALL mostrar ScanCropStep para recortar las esquinas del documento.

2.3. WHEN el usuario confirma el recorte, THE Sistema SHALL enviar la imagen recortada a la edge function `scan-invoice-unified` y mostrar ScanProcessingStep con indicador de progreso.

2.4. WHEN la edge function retorna exitosamente, THE Sistema SHALL parsear la respuesta con `normalizeScanResponse` extrayendo las Líneas_Factura con nombre, cantidad, costo unitario y barcode.

2.5. IF la edge function retorna un error o timeout, THEN THE Sistema SHALL mostrar ScanErrorStep con opción de reintentar el procesamiento o cancelar el flujo.

### Requisito 3: Resolución de proveedor

**Historia de Usuario:** Como tendero, quiero que el sistema detecte automáticamente el proveedor de la factura, para asignarlo a los productos que cree.

#### Criterios de Aceptación

3.1. WHEN la IA extrae datos de encabezado (nombre proveedor, NIT, teléfono), THE Sistema SHALL mostrar ScanSupplierStep con el proveedor detectado y opciones para confirmar uno existente o crear uno nuevo.

3.2. WHEN el usuario confirma un proveedor existente, THE Sistema SHALL almacenar el `supplier_id` para asignarlo a los productos creados.

3.3. WHEN el usuario crea un proveedor nuevo (con nombre, NIT opcional, teléfono opcional), THE Sistema SHALL insertar el registro en `suppliers` y almacenar el `supplier_id` resultante antes de avanzar al siguiente paso.

3.4. IF la IA no detecta datos de proveedor en el encabezado, THEN THE Sistema SHALL permitir al usuario omitir el paso de proveedor y continuar sin asignar proveedor a los productos.

### Requisito 4: Detección de productos existentes

**Historia de Usuario:** Como tendero, quiero que el sistema identifique qué productos de la factura ya tengo en mi catálogo, para no crear duplicados.

#### Criterios de Aceptación

4.1. WHEN las Líneas_Factura están disponibles, THE Sistema SHALL comparar cada línea contra el Catálogo usando match por barcode exacto (si la línea tiene barcode) O match por Normalización_Nombre.

4.2. WHEN una Línea_Factura coincide con un Producto_Existente, THE Sistema SHALL marcarla como "ya existe" y excluirla de la lista de productos a crear.

4.3. WHEN no hay coincidencia, THE Sistema SHALL marcar la Línea_Factura como Producto_Nuevo disponible para creación.

4.4. WHEN la detección termina, THE Sistema SHALL mostrar InvoiceCreateSummaryStep con el conteo de productos nuevos vs existentes y la lista categorizada.

### Requisito 5: Resumen y confirmación

**Historia de Usuario:** Como tendero, quiero ver un resumen de qué se va a crear antes de empezar, para confirmar que todo está correcto.

#### Criterios de Aceptación

5.1. WHEN se muestra InvoiceCreateSummaryStep, THE Sistema SHALL listar las Líneas_Factura separadas en dos grupos: "Productos nuevos (N)" y "Ya existen (M)", mostrando nombre y barcode de cada una.

5.2. WHEN hay al menos un Producto_Nuevo, THE Sistema SHALL mostrar un botón "Crear N productos" para iniciar la creación secuencial.

5.3. WHEN todos los productos de la factura ya existen en el Catálogo, THE Sistema SHALL mostrar un mensaje informativo "Todos los productos ya están en tu catálogo" con botón para volver al catálogo.

5.4. WHEN el usuario presiona "Crear N productos", THE Sistema SHALL iniciar el flujo de creación uno por uno comenzando por el primer Producto_Nuevo.

### Requisito 6: Creación secuencial de productos

**Historia de Usuario:** Como tendero, quiero crear cada producto nuevo uno por uno con formulario completo, para poder ajustar categoría, precio y otros detalles antes de guardarlo.

#### Criterios de Aceptación

6.1. WHEN el Sistema inicia la creación del siguiente Producto_Nuevo, THE Sistema SHALL escribir en `sessionStorage` (clave `bistro_invoice_create_prefill`) un objeto Prefill con: nombre, costo, barcode, supplierId, currentIndex y totalNew.

6.2. WHEN SimpleProductScreen monta y detecta `fromInvoiceCreate === true` en el Prefill, THE Sistema SHALL precargar los campos: nombre (de factura), costo (de factura), barcode (si disponible), proveedor (del paso 3), y dejar la unidad de venta vacía con placeholder "Elegir...".

6.3. WHILE el usuario está en SimpleProductScreen con Prefill activo y quedan más productos por crear, THE Sistema SHALL mostrar el botón de guardar con texto "Guardar y siguiente →".

6.4. WHILE el usuario está en SimpleProductScreen con Prefill activo y es el último producto, THE Sistema SHALL mostrar el botón de guardar con texto "Guardar y finalizar".

6.5. WHEN el usuario está en SimpleProductScreen con Prefill activo, THE Sistema SHALL mostrar un botón "Omitir este producto" que permite saltar al siguiente sin crear.

6.6. WHEN el usuario guarda un producto exitosamente, THE Sistema SHALL insertar el registro en `products` con stock inicial (default 0, editable), asignar `default_supplier_id` con el proveedor del paso 3, y navegar al siguiente Producto_Nuevo.

6.7. THE Sistema SHALL NO crear registros en `inventory_lots`, `business_debts` ni `cash_movements` durante este flujo.

6.8. WHEN el usuario omite un producto, THE Sistema SHALL avanzar al siguiente Producto_Nuevo sin crear ningún registro.

### Requisito 7: Pantalla de resultado final

**Historia de Usuario:** Como tendero, quiero ver un resumen de cuántos productos se crearon al finalizar, para confirmar que todo se completó correctamente.

#### Criterios de Aceptación

7.1. WHEN se han procesado todos los Productos_Nuevos (creados u omitidos), THE Sistema SHALL mostrar InvoiceCreateDoneStep con el mensaje "N productos creados" y la lista de nombres de los productos efectivamente creados.

7.2. WHEN no se creó ningún producto (todos omitidos), THE Sistema SHALL mostrar el mensaje "No se crearon productos" con tono informativo.

7.3. WHEN se muestra InvoiceCreateDoneStep, THE Sistema SHALL ofrecer un botón "Volver al catálogo" que navega a ProductsScreen.

### Requisito 8: Navegación y cancelación

**Historia de Usuario:** Como tendero, quiero poder cancelar el flujo en cualquier momento sin perder los productos ya creados, para tener control del proceso.

#### Criterios de Aceptación

8.1. WHEN el usuario presiona el botón de retroceso durante los pasos de captura, crop o procesamiento, THE Sistema SHALL cancelar el flujo y volver a ProductsScreen sin efectos secundarios.

8.2. WHEN el usuario presiona el botón de retroceso durante el resumen, THE Sistema SHALL cancelar el flujo y volver a ProductsScreen.

8.3. WHEN el usuario cierra o cancela SimpleProductScreen durante la creación secuencial, THE Sistema SHALL tratar ese producto como omitido y avanzar al siguiente.

8.4. WHEN el usuario cancela desde la creación secuencial y ya se crearon productos previamente, THE Sistema SHALL navegar a InvoiceCreateDoneStep mostrando los productos que sí se crearon.
