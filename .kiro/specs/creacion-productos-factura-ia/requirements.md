# Requirements Document

## Introduction

Esta funcionalidad, **Creación de Productos desde Factura IA**, extiende el flujo de escaneo unificado de facturas (spec `escaneo-factura-unificado`) para enriquecer la creación rápida de productos con datos que la IA puede extraer directamente del documento: código de barras por línea, proveedor prellenado y datos enriquecidos del proveedor (teléfono).

Hoy el Requisito 7 del spec de escaneo unificado excluye explícitamente el campo de código de barras de la Creacion_Rapida_Producto. Este spec complementario revierte esa exclusión y agrega: (a) extracción del código de barras EAN desde cada línea de la factura por la edge function; (b) prellenado del proveedor detectado del encabezado en el formulario de creación rápida; (c) escaneo manual de barcode dentro del formulario sin búsqueda en base de datos; (d) extracción del teléfono del proveedor desde el encabezado del documento; y (e) una opción para abrir el formulario completo (`SimpleProductScreen`) con todos los campos prellenados.

Este spec depende de que la columna `products.default_supplier_id` exista (creada por el spec `rotacion-inventario-proveedor`) y de que el flujo de escaneo unificado esté implementado.

## Glossary

- **Sistema**: La aplicación BistroPOS (frontend PWA + backend Supabase)
- **Tendero**: Usuario principal del POS, dueño o encargado de la tienda
- **Creacion_Rapida_Producto**: Formulario reducido dentro del Resolutor_Producto del escaneo unificado que crea un producto simple con campos mínimos
- **Resolutor_Producto**: Componente del escaneo unificado que presenta y resuelve, de una en una, las líneas de factura que requieren decisión del usuario
- **Funcion_Escaneo_Factura**: Edge function de Supabase (`scan-invoice`) que recibe la imagen de la factura y devuelve el encabezado y las líneas de producto
- **Encabezado_Documento**: Datos del emisor extraídos por la Funcion_Escaneo_Factura: nombre del proveedor, NIT, teléfono, número de factura y fecha
- **Linea_Factura**: Cada renglón de producto extraído del documento, con nombre, cantidad, unidad, valores monetarios y código de barras cuando el documento lo incluye
- **Codigo_Barras_Linea**: Código de barras (EAN-13, EAN-8, UPC-A u otro formato numérico) que la Funcion_Escaneo_Factura extrae de una Linea_Factura cuando el documento lo incluye
- **Proveedor_Encabezado**: Proveedor detectado o confirmado a partir del Encabezado_Documento durante el flujo de escaneo unificado
- **Borrador_Escaneo**: Estado completo del escaneo unificado mantenido en memoria del navegador
- **SimpleProductScreen**: Pantalla completa de creación/edición de producto (`screens/SimpleProductScreen.tsx`)
- **Formulario_Completo**: Modo en el que el usuario decide abrir `SimpleProductScreen` con los datos prellenados desde el Borrador_Escaneo para editar el producto con todas las opciones disponibles
- **Escaneo_Unificado**: Flujo completo que arranca en "Foto a factura" y termina con el registro de compra o gasto
- **Negocio_Activo**: Negocio (`business_id`) al que pertenece la sesión autenticada del usuario
- **Finalizacion_Registro**: Acción explícita del usuario que confirma y guarda el registro completo dentro del escaneo unificado

## Requirements

### Requisito 1: Extracción de código de barras por línea en la edge function

**Historia de Usuario:** Como tendero, quiero que la IA extraiga el código de barras de cada producto si la factura lo trae, para no tener que escribirlo manualmente al crear el producto.

#### Criterios de Aceptación

1.1. WHEN la factura incluye un código de barras numérico (EAN-13, EAN-8, UPC-A u otro formato numérico de 8 a 14 dígitos) asociado a una Linea_Factura, THE Funcion_Escaneo_Factura SHALL extraerlo y devolverlo como campo `barcode` de esa Linea_Factura.

1.2. WHEN una Linea_Factura carece de código de barras legible en el documento, THE Funcion_Escaneo_Factura SHALL devolver el campo `barcode` como cadena vacía para esa línea.

1.3. THE Funcion_Escaneo_Factura SHALL extraer únicamente secuencias numéricas de 8 a 14 dígitos como Codigo_Barras_Linea, descartando códigos internos alfanuméricos del proveedor.

1.4. THE Funcion_Escaneo_Factura SHALL incluir las instrucciones de extracción de código de barras en el mismo prompt único que ya extrae nombre, cantidad, unidad, valores monetarios e impuestos.

1.5. WHEN el documento presenta el código de barras en una columna separada (por ejemplo "EAN", "Código", "Barras" o "Referencia"), THE Funcion_Escaneo_Factura SHALL asociar cada código a su línea correspondiente por posición en la tabla del documento.

### Requisito 2: Prellenado del proveedor en Creacion_Rapida_Producto

**Historia de Usuario:** Como tendero, quiero que al crear un producto desde la factura el proveedor ya esté seleccionado, para no tener que buscarlo cuando ya sé de quién es la factura.

#### Criterios de Aceptación

2.1. WHEN el Tendero elige "Crear producto rápido" en el Resolutor_Producto, THE Creacion_Rapida_Producto SHALL mostrar un campo de proveedor prellenado con el Proveedor_Encabezado confirmado durante el flujo de escaneo.

2.2. THE Creacion_Rapida_Producto SHALL posicionar el campo de proveedor después del campo de categoría y antes del campo de código de barras.

2.3. WHEN el Proveedor_Encabezado corresponde a un proveedor existente en `suppliers`, THE Creacion_Rapida_Producto SHALL mostrar el nombre del proveedor como valor prellenado no editable en el campo de proveedor.

2.4. WHEN el Proveedor_Encabezado corresponde a un proveedor nuevo (aún no persistido), THE Creacion_Rapida_Producto SHALL mostrar el nombre detectado como valor prellenado no editable, con una indicación visual de que es un proveedor nuevo que se creará al finalizar el registro.

2.5. WHEN el Tendero acepta la Creacion_Rapida_Producto, THE Escaneo_Unificado SHALL conservar en el Borrador_Escaneo la asociación del producto nuevo con el Proveedor_Encabezado y asignar `products.default_supplier_id` al id del proveedor durante la Finalizacion_Registro.

2.6. WHEN el Proveedor_Encabezado es un proveedor nuevo, THE Escaneo_Unificado SHALL crear primero el proveedor en `suppliers` y luego asignar su id como `default_supplier_id` del producto nuevo, dentro de la misma transacción de la Finalizacion_Registro.

### Requisito 3: Campo de código de barras en Creacion_Rapida_Producto

**Historia de Usuario:** Como tendero, quiero que el formulario de creación rápida incluya el campo de código de barras prellenado con lo que leyó la IA, para que el producto quede completo desde su creación.

#### Criterios de Aceptación

3.1. THE Creacion_Rapida_Producto SHALL incluir un campo de código de barras editable, posicionado después del campo de proveedor.

3.2. WHEN la Linea_Factura tiene un Codigo_Barras_Linea distinto de cadena vacía, THE Creacion_Rapida_Producto SHALL prellenar el campo de código de barras con ese valor.

3.3. WHEN la Linea_Factura tiene Codigo_Barras_Linea como cadena vacía, THE Creacion_Rapida_Producto SHALL mostrar el campo de código de barras vacío y disponible para entrada manual o escaneo.

3.4. THE Creacion_Rapida_Producto SHALL tratar el campo de código de barras como opcional: el Tendero puede dejarlo vacío y crear el producto sin barcode.

3.5. WHEN el Tendero acepta la Creacion_Rapida_Producto con un código de barras no vacío, THE Escaneo_Unificado SHALL conservar el código en el Borrador_Escaneo y asignarlo al campo `products.barcode` durante la Finalizacion_Registro.

3.6. IF el código de barras ingresado ya existe en otro producto del Negocio_Activo, THEN THE Creacion_Rapida_Producto SHALL mostrar una advertencia con el nombre del producto que ya posee ese barcode y permitir al Tendero continuar o corregir el valor.

### Requisito 4: Escaneo manual de barcode sin búsqueda en base de datos

**Historia de Usuario:** Como tendero, quiero poder escanear el código de barras del producto con la cámara o el lector dentro del formulario de creación rápida sin que el sistema busque duplicados automáticamente, porque ya sé que es un producto nuevo y solo quiero guardar el código.

#### Criterios de Aceptación

4.1. THE Creacion_Rapida_Producto SHALL ofrecer un botón de escaneo junto al campo de código de barras que active el lector de barcode (cámara o pistola USB).

4.2. WHEN el lector detecta un código de barras, THE Creacion_Rapida_Producto SHALL escribir el valor detectado en el campo de código de barras sin ejecutar búsqueda en la base de datos.

4.3. THE Creacion_Rapida_Producto SHALL reutilizar el componente de escaneo de barcode existente en el proyecto (el mismo que usa `SimpleProductScreen`) para la interfaz de captura.

4.4. WHEN el lector detecta un código de barras, THE Creacion_Rapida_Producto SHALL abstenerse de invocar la consulta de duplicados, la búsqueda en Go-UPC API y la búsqueda en Google Custom Search que ejecuta `SimpleProductScreen`.

4.5. WHEN el Tendero escribe manualmente un código de barras en el campo, THE Creacion_Rapida_Producto SHALL abstenerse de buscar el código en la base de datos mientras escribe.

4.6. THE Creacion_Rapida_Producto SHALL validar únicamente que el código de barras contenga entre 8 y 14 dígitos numéricos antes de aceptar el valor, o que esté vacío.

### Requisito 5: Opción de abrir formulario completo con datos prellenados

**Historia de Usuario:** Como tendero que quiere más control sobre el producto, quiero poder abrir el formulario completo de creación con todos los datos que ya tengo de la factura prellenados, para agregar imagen, apodos u otros detalles sin perder lo que la IA ya extrajo.

#### Criterios de Aceptación

5.1. THE Creacion_Rapida_Producto SHALL mostrar un enlace o botón "Abrir formulario completo" visible después de los campos del formulario rápido.

5.2. WHEN el Tendero elige "Abrir formulario completo", THE Escaneo_Unificado SHALL navegar a `SimpleProductScreen` en modo creación, pasando todos los datos disponibles como valores prellenados.

5.3. THE Escaneo_Unificado SHALL pasar a `SimpleProductScreen` los siguientes campos prellenados: nombre (desde Nombre_OCR), costo (desde Costo_Neto_Linea por Unidad_Venta), código de barras (desde Codigo_Barras_Linea o valor editado), proveedor (desde Proveedor_Encabezado) y destino venta/insumo (si el Tendero ya lo eligió).

5.4. WHEN `SimpleProductScreen` recibe datos prellenados desde el escaneo, THE SimpleProductScreen SHALL poblar los campos correspondientes con esos valores, permitiendo al Tendero editarlos libremente.

5.5. WHEN el Tendero guarda el producto en `SimpleProductScreen` iniciado desde el escaneo, THE SimpleProductScreen SHALL crear el producto inmediatamente en la base de datos y regresar al Resolutor_Producto con la Linea_Factura vinculada al producto recién creado.

5.6. WHEN el Tendero cancela `SimpleProductScreen` iniciado desde el escaneo, THE Escaneo_Unificado SHALL regresar al Resolutor_Producto con la Linea_Factura en estado pendiente de decisión.

5.7. WHEN `SimpleProductScreen` crea el producto desde el escaneo, THE SimpleProductScreen SHALL asignar `products.default_supplier_id` al id del Proveedor_Encabezado si este ya existe en `suppliers`.

5.8. IF el Proveedor_Encabezado es un proveedor nuevo que aún no existe en `suppliers`, THEN THE Escaneo_Unificado SHALL crear el proveedor en `suppliers` antes de navegar a `SimpleProductScreen` y pasar el id resultante como proveedor prellenado.

### Requisito 6: Extracción de teléfono del proveedor desde el encabezado

**Historia de Usuario:** Como tendero, quiero que la IA extraiga el teléfono del proveedor si aparece en la factura, para tener sus datos de contacto completos sin escribirlos manualmente.

#### Criterios de Aceptación

6.1. THE Funcion_Escaneo_Factura SHALL extraer del Encabezado_Documento el número de teléfono del proveedor cuando esté presente en el documento, y devolverlo como campo `phone` del encabezado.

6.2. WHEN el documento carece de número de teléfono del proveedor, THE Funcion_Escaneo_Factura SHALL devolver el campo `phone` como cadena vacía.

6.3. THE Funcion_Escaneo_Factura SHALL extraer números de teléfono colombianos en formatos comunes: 10 dígitos con o sin prefijo de país (+57), con o sin separadores (espacios, guiones, puntos).

6.4. WHEN el Resolutor_Proveedor detecta un proveedor nuevo y el Encabezado_Documento incluye teléfono, THE Resolutor_Proveedor SHALL mostrar el teléfono detectado en el aviso de proveedor nuevo como campo editable junto al nombre y NIT.

6.5. WHEN el Escaneo_Unificado crea un proveedor nuevo durante la Finalizacion_Registro y el Borrador_Escaneo incluye un teléfono, THE Escaneo_Unificado SHALL almacenar el teléfono en `suppliers.phone`.

6.6. WHEN el Resolutor_Proveedor confirma un proveedor existente y el Encabezado_Documento incluye un teléfono distinto al almacenado en `suppliers.phone`, THE Resolutor_Proveedor SHALL abstenerse de actualizar el teléfono del proveedor existente.
