# Requirements Document

## Introduction

Esta funcionalidad, **Escaneo de Factura Unificado**, crea un único punto de entrada para fotografiar un documento (factura o comprobante) y decidir, con una pregunta explícita al usuario, si el resultado se registra como **compra de inventario** o como **gasto**.

Hoy existen dos escaneos independientes y ambos viven *dentro* de su propio formulario: el de compra de inventario (edge function `scan-invoice`, verificada como desplegada en versión 30) exige elegir el proveedor **antes** de tomar la foto y calcula el costo de cada línea con una fórmula matemática configurada por proveedor (`suppliers.invoice_config.costFormula` + `costInstructions`, generada por la edge function `generate-cost-formula` y evaluada en `InvoiceReviewPanel.tsx`); el de gasto (edge function `scan-expense`, versión 5) vive en `ExpenseRegister.tsx` y sube la evidencia al bucket en el momento del escaneo. Desde la versión 5, el prompt de `scan-expense` arma la descripción con dos familias de reglas generales (gasto recurrente/servicio → `Concepto · Mes AAAA`; compra de productos → `Prefijo: lista de ítems`) en lugar de una lista cerrada de tipos, con reglas duras que prohíben descripciones vagas, de modo que ninguna descripción cae en un genérico "Otro". El contrato no cambió: sigue devolviendo `amount`, `description`, `supplierName`, `nit` y `date`.

Esta funcionalidad reemplaza y absorbe el spec previo `escaneo-gasto-ia`: la ruta de gasto conserva el comportamiento que ese spec definió (detección de valor, descripción, proveedor y fecha, con selección manual de categoría), pero deja de tener su propio selector de modo como puerta de entrada y pasa a alimentarse del escaneo unificado.

Los cambios centrales son: (a) un menú de acciones con la opción "Foto a factura" que pregunta el destino antes de procesar; (b) la eliminación de la fórmula de costo y de la configuración de factura por proveedor, sustituidas por un prompt único que interpreta impuestos y descuentos, cuyo resultado entra como costo con impuestos incluidos igual que los costos que ya guarda el catálogo; (c) la detección del proveedor desde el encabezado del documento, con aviso cuando es nuevo; (d) una resolución guiada producto por producto (crear rápido, vincular como apodo u omitir), con equivalencia de unidad de compra obligatoria; y (e) una regla de persistencia diferida y atómica: ninguna escritura ocurre hasta que el usuario finaliza el registro, y esa finalización sucede dentro de una única transacción de base de datos que se revierte por completo si algo falla.

La detección de la unidad de compra es **genérica** para cualquier empaque que traiga el documento (caja, bulto, paca, docena, arroba u otro): el sistema distingue si la unidad leída es la unidad de venta del producto, si corresponde a una unidad de compra ya configurada —caso en el que reutiliza la equivalencia guardada sin preguntar— o si es una unidad desconocida, caso en el que pregunta la equivalencia y la **agrega** como una unidad de compra más del producto, sin tocar las que ya existen. Un mismo producto puede acumular varias unidades de compra a lo largo del tiempo.

Todo el flujo opera **acotado al negocio del usuario autenticado**: búsquedas de proveedor y de producto, apodos, equivalencias, categorías de gasto, evidencia y registros creados pertenecen a ese negocio, y el motor de registro deriva el negocio desde la sesión del lado del servidor.

El flujo es **autocontenido**: la captura, el destino, el proveedor, la resolución de productos, la creación rápida, las equivalencias, la revisión y la selección de pago se resuelven en la propia superficie de UI del escaneo, sin abrir el panel de Compra de Inventario, el modal de Otros Gastos ni las pantallas del catálogo. Para lograrlo se duplica la **UI** de esos pasos con un diseño de onboarding propio, pero **no** la lógica de negocio: se crea un motor de registro compartido (una función RPC transaccional) que aplica las reglas de turno, caja, stock, lote, deuda y movimientos, y tanto el escaneo nuevo como el flujo manual de Compra de Inventario existente lo invocan.

Queda **fuera de alcance** eliminar los escaneos con IA embebidos en los formularios de Compra de Inventario y de Otros Gastos: durante esta iteración ambos caminos coexisten. La migración del flujo manual de compra al motor compartido **sí** está dentro de alcance.

## Glossary

- **Escaneo_Unificado**: Flujo completo que arranca en la opción "Foto a factura" del menú de acciones de gastos y termina cuando el usuario finaliza un registro de compra o de gasto.
- **Menu_Acciones_Gastos**: Menú (dropdown en escritorio, hoja inferior en móvil) que hoy ofrece "Compra de inventario", "Otros gastos" y "Merma", presente en `HomeScreen`, `SellScreen`, `GlobalSellTabs` y `TablesScreen`.
- **Selector_Destino**: Paso del Escaneo_Unificado que pregunta al usuario si el documento corresponde a una compra de inventario o a un gasto.
- **Ruta_Inventario**: Camino del Escaneo_Unificado que termina registrando una compra de inventario (`inventory_lots`, `business_debts`, stock y movimientos de caja).
- **Ruta_Gasto**: Camino del Escaneo_Unificado que termina registrando un gasto (`expenses`, y `business_debts`/`debts` según el modo de pago).
- **Funcion_Escaneo_Factura**: Edge function de Supabase que recibe la imagen y devuelve el encabezado y las líneas de producto del documento de compra de inventario (hoy `scan-invoice`).
- **Funcion_Escaneo_Gasto**: Edge function de Supabase que recibe la imagen de un comprobante de gasto y devuelve `amount`, `description`, `supplierName`, `nit` y `date` (hoy `scan-expense`, versión 5). Su prompt clasifica el gasto en dos familias (recurrente/servicio → `Concepto · Mes AAAA`; compra de productos → `Prefijo: lista`) y tiene reglas duras que prohíben descripciones vagas, de modo que ninguna cae en "Otro". Desde la versión 6 devuelve además un campo `category` con una de las Categorias_Gasto_Por_Defecto sugerida a partir de la misma clasificación de familias (o cadena vacía si no está segura); esa sugerencia pre-selecciona el selector de categoría de la Ruta_Gasto, pero el Usuario siempre puede cambiarla.
- **Categorias_Gasto_Por_Defecto**: Conjunto de 11 categorías de gasto (`ARRIENDO`, `BIENES`, `HONORARIOS`, `IMPUESTOS`, `INSUMOS`, `MANTENIMIENTO`, `MERCANCÍA`, `PUBLICIDAD`, `SALUD Y PARAFISCALES`, `SERVICIOS`, `SUELDOS`) que se siembran en cada Negocio_Activo: por backfill idempotente en los negocios existentes y por el trigger `after_business_insert_seed_expense_categories` en los negocios nuevos. Garantizan que el selector de categoría de la Ruta_Gasto (Requisitos 11.3 y 17.5) nunca esté vacío.
- **Encabezado_Documento**: Datos del emisor y del documento que la Funcion_Escaneo_Factura devuelve: nombre del proveedor, NIT, número de factura y fecha.
- **Linea_Factura**: Cada renglón de producto extraído del documento, con nombre leído, cantidad, unidad leída, valores monetarios y los impuestos y descuentos asociados a ese renglón.
- **Nombre_OCR**: Texto del nombre del producto tal como aparece en el documento.
- **Unidad_OCR**: Unidad de empaque real de la Linea_Factura, deducida por la Funcion_Escaneo_Factura a partir del texto de la descripción del producto (por ejemplo "CJ", "ARROBA", "BULTO", "PACA", "DOCENA", "TIRA") o de un multiplicador de conteo en la descripción. **No** es el código fiscal de la columna de unidad de la factura (que en Colombia suele ser el código DIAN "94" o "UND" y no identifica el empaque). Es cadena vacía cuando la línea corresponde a una unidad suelta sin empaque.
- **Codigo_Unidad_Fiscal**: Valor de la columna de unidad de medida que la factura electrónica reporta para efectos DIAN (habitualmente "94" = Unidad), que no identifica el empaque de compra y que la Funcion_Escaneo_Factura descarta como Unidad_OCR.
- **Cantidad_Facturada**: Número de unidades de empaque efectivamente compradas en la Linea_Factura, tomado de la columna de cantidad del documento ("Cantidad", "Cant" o "Cantidades sueltas"), distinto de las unidades por empaque ("Und. emp." o "Presentación").
- **Unidad_Venta**: Unidad base del producto en el catálogo (`products.unit`), con la que se controla el stock y se vende.
- **Unidad_Compra**: Empaque alterno de compra configurado para un producto en `product_purchase_units`, con `unit_name` y `conversion_factor`. Un mismo producto admite varias Unidad_Compra simultáneas (por ejemplo caja, bulto, paca y docena), cada una en su propia fila de `product_purchase_units`.
- **Factor_Conversion**: Cantidad de Unidad_Venta que contiene una Unidad_Compra (`product_purchase_units.conversion_factor`).
- **Apodo**: Alias de búsqueda de un producto, almacenado en el arreglo `products.nicknames`.
- **Resolutor_Proveedor**: Componente del Escaneo_Unificado que compara el proveedor detectado contra la tabla `suppliers` y gestiona el caso de proveedor nuevo.
- **Resolutor_Producto**: Componente del Escaneo_Unificado que presenta y resuelve, de una en una, las Linea_Factura que requieren decisión del usuario.
- **Creacion_Rapida_Producto**: Formulario reducido, dentro del Resolutor_Producto, que crea un producto simple con los campos mínimos.
- **Panel_Revision**: Pantalla que muestra el resultado consolidado de todas las Linea_Factura resueltas, con cantidades y costos editables, antes de pasar al flujo de pago.
- **Borrador_Escaneo**: Estado completo del Escaneo_Unificado mantenido únicamente en memoria del navegador (proveedor detectado, líneas, decisiones del usuario, imagen capturada y equivalencias pendientes).
- **Finalizacion_Registro**: Acción explícita del usuario que confirma y guarda el registro completo (botón de confirmar la compra en la Ruta_Inventario o de confirmar el gasto en la Ruta_Gasto).
- **Motor_Registro_Compra**: Función RPC transaccional única de Postgres que registra una compra de inventario completa (proveedor nuevo, productos nuevos, apodos, equivalencias de Unidad_Compra, precios de venta, lote, stock, deuda y movimientos de caja) y que invocan tanto el Escaneo_Unificado como el Flujo_Manual_Compra.
- **Motor_Registro_Gasto**: Función RPC transaccional única de Postgres que registra un gasto completo (proveedor nuevo, categoría, fila de gasto, deuda y movimientos de caja) y que invoca la Ruta_Gasto.
- **Flujo_Manual_Compra**: Flujo existente de Compra de Inventario que el Usuario abre desde la opción "Compra de inventario" del Menu_Acciones_Gastos y que registra la compra sin escaneo unificado.
- **Costo_Neto_Linea**: Valor efectivamente pagado por una Linea_Factura, con los impuestos de esa línea sumados, los descuentos de esa línea restados y la parte proporcional del Descuento_Global restada. Es un valor con impuestos incluidos, igual que los costos que ya almacena el catálogo.
- **Descuento_Global**: Descuento que el documento presenta al pie, aplicado al total y no a una línea específica.
- **Fórmula_Costo**: Expresión matemática en formato AST (`ADD`, `SUB`, `MULT`, `DIV`) almacenada hoy en `suppliers.invoice_config.costFormula` y evaluada en el frontend para obtener el total de una línea.
- **Panel_Reglas_Factura**: Panel de configuración por proveedor (`InvoiceConfigPanel`) que permite definir columnas, campos de encabezado e instrucciones de costo, guardados en `suppliers.invoice_config`.
- **Evidencia**: Imagen del documento que se sube al bucket `debt-evidence` y cuya URL queda en `expenses.receipt_url` y en `business_debts.evidence_url`.
- **Modo_Sin_Conexion**: Estado en el que el dispositivo carece de conexión a internet, detectado por la utilidad de conectividad existente.
- **Permiso_Registrar_Gastos**: Permiso `inv_purchase`, que hoy habilita el panel de gastos completo y que en el Escaneo_Unificado habilita todas las acciones del flujo.
- **Usuario**: Persona que opera el POS y registra la compra o el gasto.
- **Negocio_Activo**: Negocio (`business_id`) al que pertenece la sesión autenticada del Usuario y al que quedan acotados todos los datos leídos y escritos por el Escaneo_Unificado.
- **Politica_RLS**: Política de seguridad a nivel de fila de Postgres que restringe las filas visibles y modificables de una tabla al Negocio_Activo.
- **Comparacion_Unidad**: Regla de comparación de nombres de unidad que ignora mayúsculas, acentos, espacios extremos y plurales simples (por ejemplo "caja" y "cajas").
- **Formato_Numerico_Latino**: Formato numérico colombiano en el que el punto separa miles y la coma separa decimales.

## Requirements

### Requisito 1

**Historia de Usuario:** Como tendero, quiero una sola opción "Foto a factura" en el menú de gastos que me pregunte si el documento es compra de inventario o gasto, para no tener que decidir antes de saber qué trae el papel.

#### Criterios de Aceptación

1.1. THE Menu_Acciones_Gastos SHALL mostrar la opción "Foto a factura" como primera opción de la lista, por encima de "Compra de inventario", "Otros gastos" y "Merma", en `HomeScreen`, `SellScreen`, `GlobalSellTabs` y `TablesScreen`.

1.2. WHEN el Usuario selecciona "Foto a factura", THE Selector_Destino SHALL presentar exactamente dos destinos: "Compra de inventario" y "Gasto".

1.3. WHEN el Usuario selecciona el destino "Compra de inventario", THE Escaneo_Unificado SHALL continuar por la Ruta_Inventario.

1.4. WHEN el Usuario selecciona el destino "Gasto", THE Escaneo_Unificado SHALL continuar por la Ruta_Gasto.

1.5. WHILE el Selector_Destino está visible, THE Escaneo_Unificado SHALL ofrecer un control para cerrar el flujo y regresar a la pantalla de origen.

1.6. THE Menu_Acciones_Gastos SHALL conservar las opciones "Compra de inventario", "Otros gastos" y "Merma" con el comportamiento que tienen hoy.

1.7. WHEN el Usuario elige un destino en el Selector_Destino, THE Escaneo_Unificado SHALL conducir el registro completo dentro de su propia superficie de UI, conforme al Requisito 16.

### Requisito 2

**Historia de Usuario:** Como tendero, quiero tomar la foto del documento una sola vez y con buena calidad, para que la IA lea bien y esa misma imagen quede como evidencia.

#### Criterios de Aceptación

2.1. WHEN el Usuario elige un destino en el Selector_Destino, THE Escaneo_Unificado SHALL ofrecer dos fuentes de imagen: cámara del dispositivo y archivo de galería.

2.2. WHEN el Usuario obtiene una imagen desde cualquiera de las dos fuentes, THE Escaneo_Unificado SHALL presentar el recorte de esquinas ajustables antes de procesar la imagen.

2.3. IF el archivo seleccionado excede 50 MB, THEN THE Escaneo_Unificado SHALL rechazar el archivo, informar el límite y mantener visibles las dos fuentes de imagen.

2.4. WHEN el Usuario confirma el recorte, THE Escaneo_Unificado SHALL comprimir la imagen a un ancho o alto máximo de 1600 píxeles antes de enviarla a la edge function correspondiente.

2.5. THE Escaneo_Unificado SHALL usar la misma imagen recortada como Evidencia del registro y como entrada de la edge function, con una sola captura por documento.

2.6. WHILE la edge function procesa la imagen, THE Escaneo_Unificado SHALL mostrar un indicador de progreso con el texto del paso en curso.

2.7. IF la edge function devuelve un error o no responde dentro de 45 segundos, THEN THE Escaneo_Unificado SHALL mostrar un mensaje de error con las acciones "Reintentar" y "Continuar manual", y conservar la imagen capturada.

2.8. WHEN el Usuario elige "Continuar manual" tras un error de escaneo, THE Escaneo_Unificado SHALL continuar dentro de su propia superficie con un formulario de captura manual del destino elegido, con la imagen ya adjunta como Evidencia y los demás campos vacíos.

### Requisito 3

**Historia de Usuario:** Como tendero, quiero que la IA calcule el costo real de cada producto contando impuestos y descuentos, para dejar de configurar fórmulas que no entiendo.

#### Criterios de Aceptación

3.1. THE Funcion_Escaneo_Factura SHALL usar un único prompt para todos los proveedores, con instrucciones para extraer nombre de producto, Cantidad_Facturada, Unidad_OCR, valor unitario, valor total de línea, impuestos de línea y descuentos de línea.

3.2. THE Funcion_Escaneo_Factura SHALL devolver, para cada Linea_Factura, el Costo_Neto_Linea con los impuestos de esa línea sumados y los descuentos de esa línea restados.

3.3. THE Funcion_Escaneo_Factura SHALL devolver todos los valores monetarios y de cantidad como números con punto decimal, convirtiendo previamente el Formato_Numerico_Latino.

3.4. WHEN el documento presenta un Descuento_Global al pie, THE Funcion_Escaneo_Factura SHALL devolverlo como un valor identificado a nivel de documento.

3.5. WHEN el resultado del escaneo incluye un Descuento_Global, THE Escaneo_Unificado SHALL repartirlo entre las Linea_Factura de forma proporcional al Costo_Neto_Linea de cada una.

3.6. WHEN el documento carece de valor unitario para una línea pero presenta valor total y cantidad, THE Funcion_Escaneo_Factura SHALL calcular el valor unitario dividiendo el valor total entre la cantidad.

3.7. THE Funcion_Escaneo_Factura SHALL devolver todas las líneas de producto del documento.

3.8. THE Escaneo_Unificado SHALL registrar como costo de cada producto el Costo_Neto_Linea resultante, expresado por Unidad_Venta, con los impuestos incluidos en ese valor.

3.9. THE Escaneo_Unificado SHALL registrar el Costo_Neto_Linea como un único valor con impuestos incluidos, sin separar la base gravable y sin almacenar el impuesto en un campo aparte.

3.10. THE Escaneo_Unificado SHALL comparar el Costo_Neto_Linea por Unidad_Venta contra el costo vigente del producto en el catálogo de forma directa, porque ambos valores incluyen impuestos.

3.11. THE Escaneo_Unificado SHALL conservar sin cambios los costos y los márgenes históricos de los productos, sin recalcularlos a partir de los impuestos leídos en el documento.

3.12. WHEN una Linea_Factura carece de cantidad legible, THE Escaneo_Unificado SHALL asignar cantidad 1 y marcar esa línea como pendiente de revisión del Usuario.

3.13. THE Funcion_Escaneo_Factura SHALL deducir la Unidad_OCR a partir del texto de la descripción del producto (palabras de empaque como "CAJA", "BULTO", "PACA", "ARROBA", "DOCENA", "TIRA", "PAQUETE", o multiplicadores de conteo como "X 3 UN", "12X4", "*25*"), y SHALL descartar el Codigo_Unidad_Fiscal de la columna de unidad (por ejemplo "94" o "UND") como Unidad_OCR, devolviendo Unidad_OCR como cadena vacía cuando la línea es una unidad suelta sin empaque.

3.14. WHEN el documento presenta a la vez una columna de Cantidad_Facturada y una columna de unidades por empaque ("Und. emp." o "Presentación"), THE Funcion_Escaneo_Factura SHALL tomar la Cantidad_Facturada de la columna de cantidad y SHALL abstenerse de usar las unidades por empaque como cantidad de la Linea_Factura.

### Requisito 4

**Historia de Usuario:** Como tendero, quiero dejar de configurar reglas y fórmulas por proveedor, para que el escaneo funcione igual con cualquier factura.

#### Criterios de Aceptación

4.1. THE Escaneo_Unificado SHALL calcular el costo de cada Linea_Factura sin evaluar ninguna Fórmula_Costo.

4.2. THE Escaneo_Unificado SHALL operar sin ofrecer acceso al Panel_Reglas_Factura.

4.3. WHEN un proveedor almacenado conserva datos previos en `suppliers.invoice_config`, THE Escaneo_Unificado SHALL ignorar esos datos y conservarlos en la base de datos sin modificarlos.

4.4. THE Escaneo_Unificado SHALL producir el mismo resultado de extracción para un mismo documento, con independencia del proveedor al que corresponda.

### Requisito 5

**Historia de Usuario:** Como tendero, quiero que el sistema me diga si el proveedor de la factura ya lo tengo registrado o si es nuevo, para no crear proveedores duplicados.

#### Criterios de Aceptación

5.1. WHEN la edge function devuelve el Encabezado_Documento, THE Resolutor_Proveedor SHALL comparar el NIT detectado, ignorando espacios, puntos y guiones, contra el NIT de los registros de `suppliers`.

5.2. WHEN el NIT detectado coincide con el NIT de un proveedor existente, THE Resolutor_Proveedor SHALL seleccionar ese proveedor y mostrarlo como proveedor confirmado del registro.

5.3. WHEN el NIT detectado carece de coincidencia y el nombre detectado coincide, ignorando mayúsculas, acentos y espacios extremos, con el nombre de un proveedor existente, THE Resolutor_Proveedor SHALL seleccionar ese proveedor y mostrarlo como proveedor confirmado del registro.

5.4. IF el proveedor detectado carece de coincidencia por NIT y por nombre, THEN THE Resolutor_Proveedor SHALL mostrar un aviso de proveedor nuevo con el nombre y el NIT detectados en campos editables.

5.5. WHEN el Resolutor_Proveedor muestra el aviso de proveedor nuevo, THE Resolutor_Proveedor SHALL ofrecer las acciones "Usar este proveedor" y "Buscar un proveedor existente".

5.6. WHEN el Usuario elige "Usar este proveedor", THE Escaneo_Unificado SHALL conservar los datos del proveedor nuevo en el Borrador_Escaneo y crear el registro en `suppliers` durante la Finalizacion_Registro.

5.7. IF la edge function devuelve el Encabezado_Documento sin nombre y sin NIT, THEN THE Resolutor_Proveedor SHALL solicitar al Usuario elegir un proveedor existente o escribir los datos de un proveedor nuevo antes de continuar.

5.8. THE Escaneo_Unificado SHALL exigir un proveedor confirmado antes de permitir la Finalizacion_Registro, tanto en la Ruta_Inventario como en la Ruta_Gasto.

### Requisito 6

**Historia de Usuario:** Como tendero, quiero resolver los productos de la factura uno por uno con instrucciones claras, para no perderme entre varias decisiones al mismo tiempo.

#### Criterios de Aceptación

6.1. WHEN la Ruta_Inventario recibe las Linea_Factura extraídas, THE Resolutor_Producto SHALL buscar cada Nombre_OCR en el catálogo por Apodo exacto, Apodo parcial con resultado único, nombre exacto y nombre parcial con resultado único, en ese orden de prioridad.

6.2. WHEN una Linea_Factura obtiene coincidencia con un producto del catálogo, THE Resolutor_Producto SHALL marcarla como resuelta y continuar con la siguiente línea que requiere decisión.

6.3. WHILE existan Linea_Factura pendientes de decisión, THE Resolutor_Producto SHALL presentar exactamente una línea a la vez.

6.4. WHILE el Resolutor_Producto presenta una línea, THE Resolutor_Producto SHALL mostrar el progreso en la forma "línea actual de total de líneas", el Nombre_OCR, la cantidad, la Unidad_OCR y el Costo_Neto_Linea de esa línea.

6.5. WHILE el Resolutor_Producto presenta una línea pendiente, THE Resolutor_Producto SHALL explicar en una frase qué decisión se pide y qué efecto tiene cada opción.

6.6. WHEN el Resolutor_Producto presenta una Linea_Factura sin coincidencia en el catálogo, THE Resolutor_Producto SHALL ofrecer tres acciones: "Crear producto rápido", "Es un producto que ya tengo" y "Omitir esta línea".

6.7. WHEN el Usuario elige "Omitir esta línea", THE Resolutor_Producto SHALL informar que esa línea queda fuera del inventario y del total de la compra, y continuar con la siguiente línea.

6.8. WHILE el Resolutor_Producto presenta una línea, THE Resolutor_Producto SHALL ofrecer un control para regresar a la línea anterior y cambiar la decisión tomada.

6.9. WHEN el Usuario resuelve la última Linea_Factura, THE Escaneo_Unificado SHALL mostrar el Panel_Revision con todas las líneas resueltas, sus cantidades y sus costos editables.

6.10. WHEN todas las Linea_Factura quedan omitidas, THE Escaneo_Unificado SHALL informar que la compra carece de productos y ofrecer volver a escanear o cerrar el flujo.

6.11. THE Resolutor_Producto SHALL resolver cada decisión dentro de la superficie del Escaneo_Unificado, sin navegar a `SimpleProductScreen` ni a otra pantalla del catálogo.

6.12. WHEN el Usuario elige "Omitir esta línea" en una línea que requiere Factor_Conversion, THE Resolutor_Producto SHALL dejar esa línea fuera del registro y continuar con la siguiente línea.

### Requisito 7

**Historia de Usuario:** Como tendero, quiero crear el producto que falta sin salir del escaneo, para terminar la factura en un solo recorrido.

#### Criterios de Aceptación

7.1. WHEN el Usuario elige "Crear producto rápido", THE Creacion_Rapida_Producto SHALL presentar los campos nombre, categoría, Unidad_Venta, costo, precio de venta y destino del producto ("Para venta" o "Insumo").

7.2. THE Creacion_Rapida_Producto SHALL prellenar el campo nombre con el Nombre_OCR y el campo costo con el Costo_Neto_Linea por Unidad_Venta, ambos editables.

7.3. THE Creacion_Rapida_Producto SHALL exigir nombre, categoría, Unidad_Venta y costo mayor que cero antes de aceptar la creación.

7.4. THE Creacion_Rapida_Producto SHALL tratar el precio de venta como campo opcional.

7.5. WHEN el Usuario elige el destino "Insumo", THE Creacion_Rapida_Producto SHALL crear el producto con `is_for_sale` en falso y precio de venta cero.

7.6. THE Creacion_Rapida_Producto SHALL fijar el stock inicial del producto nuevo en cero y dejar que la compra en curso aporte la cantidad.

7.7. WHEN el Usuario acepta la Creacion_Rapida_Producto, THE Escaneo_Unificado SHALL conservar los datos del producto nuevo en el Borrador_Escaneo y crear el registro en `products` durante la Finalizacion_Registro.

7.8. WHEN el Usuario acepta la Creacion_Rapida_Producto, THE Resolutor_Producto SHALL vincular la Linea_Factura al producto nuevo y continuar con la siguiente línea.

7.9. IF el nombre escrito coincide, ignorando mayúsculas, acentos y espacios extremos, con el nombre de un producto existente del catálogo, THEN THE Creacion_Rapida_Producto SHALL advertirlo y ofrecer vincular la línea a ese producto existente.

7.10. THE Creacion_Rapida_Producto SHALL prescindir de los campos imagen, código de barras y apodos, y dejarlos disponibles en la edición posterior del producto.

7.11. THE Creacion_Rapida_Producto SHALL presentarse como un paso interno del Escaneo_Unificado con su propio diseño de onboarding, sin abrir `SimpleProductScreen` ni ninguna otra pantalla de creación de productos.

### Requisito 8

**Historia de Usuario:** Como tendero, quiero enseñarle al sistema que el nombre raro de la factura corresponde a un producto que ya tengo, para que la próxima vez lo reconozca solo.

#### Criterios de Aceptación

8.1. WHEN el Usuario elige "Es un producto que ya tengo", THE Resolutor_Producto SHALL ofrecer un buscador del catálogo que filtra por nombre y por Apodo.

8.2. WHEN el Usuario selecciona un producto del buscador, THE Resolutor_Producto SHALL vincular la Linea_Factura a ese producto.

8.3. WHEN el Usuario vincula una Linea_Factura a un producto existente, THE Resolutor_Producto SHALL proponer agregar el Nombre_OCR como Apodo de ese producto, con la propuesta activada por defecto.

8.4. WHEN la propuesta de Apodo permanece activada al finalizar el registro, THE Escaneo_Unificado SHALL agregar el Nombre_OCR al arreglo `products.nicknames` del producto vinculado durante la Finalizacion_Registro.

8.5. IF el Nombre_OCR ya existe como Apodo del mismo producto, THEN THE Resolutor_Producto SHALL informarlo y omitir la propuesta de Apodo para esa línea.

8.6. IF el Nombre_OCR ya existe como Apodo de otro producto del negocio, THEN THE Resolutor_Producto SHALL informar en qué producto está ese Apodo y mantener la vinculación de la línea sin agregar el Apodo.

8.7. THE Resolutor_Producto SHALL ofrecer solo productos de tipo simple como destino de la vinculación, incluidos los insumos.

### Requisito 9

**Historia de Usuario:** Como tendero, quiero que el sistema reconozca la unidad de empaque que trae el documento y me pregunte su equivalencia solo cuando no la conoce (por ejemplo caja, bulto, paca o arroba), para que el stock entre correcto y cada equivalencia nueva quede guardada además de las que ya tengo.

#### Criterios de Aceptación

9.1. WHEN una Linea_Factura resuelta trae una Unidad_OCR que coincide con la Unidad_Venta del producto vinculado, THE Escaneo_Unificado SHALL usar la cantidad y el costo leídos sin aplicar conversión.

9.2. WHEN una Linea_Factura resuelta trae una Unidad_OCR que coincide con el `unit_name` de una Unidad_Compra ya configurada para el producto vinculado, THE Escaneo_Unificado SHALL multiplicar la cantidad por el Factor_Conversion guardado, dividir el costo por ese mismo Factor_Conversion e informar la cantidad y el costo resultantes por Unidad_Venta, sin solicitar dato alguno al Usuario.

9.3. WHEN una Linea_Factura resuelta trae una Unidad_OCR distinta de la Unidad_Venta y distinta del `unit_name` de todas las Unidad_Compra configuradas para el producto vinculado, THE Resolutor_Producto SHALL solicitar al Usuario la cantidad de Unidad_Venta que contiene una unidad de esa Unidad_OCR, con una pregunta que nombre la Unidad_OCR leída, la Unidad_Venta del producto y el nombre del producto.

9.4. WHERE el producto vinculado cuenta con una o más Unidad_Compra ya configuradas, WHEN la Unidad_OCR de la Linea_Factura difiere del `unit_name` de todas esas Unidad_Compra y de la Unidad_Venta, THE Resolutor_Producto SHALL solicitar la equivalencia de esa Unidad_OCR con las mismas reglas que aplica a un producto sin ninguna Unidad_Compra configurada.

9.5. THE Escaneo_Unificado SHALL evaluar la coincidencia entre la Unidad_OCR, la Unidad_Venta y el `unit_name` de cada Unidad_Compra mediante la Comparacion_Unidad.

9.6. THE Escaneo_Unificado SHALL aplicar la Comparacion_Unidad de forma idéntica en los tres casos de detección definidos en los criterios 9.1, 9.2 y 9.3.

9.7. WHEN el Resolutor_Producto solicita una equivalencia, THE Resolutor_Producto SHALL exigir un Factor_Conversion mayor que cero antes de permitir avanzar a la siguiente línea.

9.8. WHILE el campo de Factor_Conversion permanece vacío o contiene un valor igual o menor que cero, THE Resolutor_Producto SHALL mantener deshabilitado el control para continuar a la siguiente línea.

9.9. IF el Usuario escribe un Factor_Conversion igual o menor que cero, THEN THE Resolutor_Producto SHALL rechazar el valor e indicar que la equivalencia requiere un número mayor que cero.

9.10. WHERE el Usuario desconoce el Factor_Conversion, THE Resolutor_Producto SHALL ofrecer como única alternativa para avanzar la acción "Omitir esta línea" definida en el Requisito 6.

9.11. WHEN el Usuario escribe un Factor_Conversion mayor que cero, THE Resolutor_Producto SHALL mostrar la cantidad y el costo por Unidad_Venta resultantes antes de continuar.

9.12. WHEN el Usuario confirma un Factor_Conversion para una Unidad_OCR que carece de Unidad_Compra configurada, THE Escaneo_Unificado SHALL conservar la equivalencia en el Borrador_Escaneo y crear una fila nueva en `product_purchase_units` para ese producto durante la Finalizacion_Registro.

9.13. WHEN el Escaneo_Unificado crea una fila nueva en `product_purchase_units`, THE Escaneo_Unificado SHALL conservar intactos el `unit_name` y el `conversion_factor` de las filas existentes de ese mismo producto.

9.14. IF la Unidad_OCR de una Linea_Factura ya existe como `unit_name` de una Unidad_Compra del producto vinculado, THEN THE Escaneo_Unificado SHALL usar el Factor_Conversion existente y abstenerse de crear una fila adicional en `product_purchase_units`.

9.15. THE Escaneo_Unificado SHALL conservar en el Borrador_Escaneo la Unidad_OCR con el mismo texto que devolvió la Funcion_Escaneo_Factura.

9.16. WHEN el Escaneo_Unificado crea una fila nueva en `product_purchase_units`, THE Escaneo_Unificado SHALL guardar en `unit_name` el valor normalizado de la Unidad_OCR que el Usuario vio y confirmó en el Resolutor_Producto.

9.17. THE Escaneo_Unificado SHALL guardar cada Factor_Conversion asociado al producto, con independencia del proveedor del documento.

9.18. WHEN una Linea_Factura resuelta carece de Unidad_OCR, THE Escaneo_Unificado SHALL usar la cantidad y el costo leídos como valores expresados en la Unidad_Venta del producto.

### Requisito 10

**Historia de Usuario:** Como tendero, quiero revisar y corregir el resultado antes de pagar y seguir con los mismos pasos de pago que ya conozco sin salir del escaneo, para no cambiar mi forma de trabajar.

#### Criterios de Aceptación

10.1. THE Panel_Revision SHALL mostrar, por cada Linea_Factura resuelta, el producto vinculado, el Nombre_OCR, la cantidad en Unidad_Venta, el costo por Unidad_Venta y el total de la línea.

10.2. THE Panel_Revision SHALL permitir editar la cantidad y el costo de cada línea, y quitar líneas del registro.

10.3. WHEN el costo por Unidad_Venta de un producto difiere del costo registrado en el catálogo, THE Panel_Revision SHALL mostrar la variación porcentual, el margen resultante frente al precio de venta vigente y un campo editable de precio de venta.

10.4. WHEN el Usuario edita el precio de venta en el Panel_Revision, THE Escaneo_Unificado SHALL conservar el precio nuevo en el Borrador_Escaneo y actualizar `products.price` durante la Finalizacion_Registro.

10.5. WHEN el Usuario confirma el Panel_Revision en la Ruta_Inventario, THE Escaneo_Unificado SHALL presentar, dentro de su propia superficie, los pasos de pago de compra de inventario con el proveedor ya seleccionado, incluidas las opciones Contado y Crédito.

10.6. THE Escaneo_Unificado SHALL conservar sin cambios las reglas vigentes del flujo de pago de compra de inventario: pregunta de descuento de caja con turno activo, validación de saldo suficiente, pago dividido entre métodos, abono inicial y fecha de vencimiento obligatoria en Crédito.

10.7. WHEN el Usuario ejecuta la Finalizacion_Registro en la Ruta_Inventario, THE Escaneo_Unificado SHALL invocar el Motor_Registro_Compra y crear los mismos registros que crea hoy la compra de inventario para esos valores: lote en `inventory_lots`, actualización de stock en `products`, fila en `business_debts` y movimientos de caja cuando corresponde.

10.8. WHEN la Finalizacion_Registro concluye con éxito, THE Escaneo_Unificado SHALL informar el resultado, descartar el Borrador_Escaneo y regresar a la pantalla de origen.

### Requisito 11

**Historia de Usuario:** Como tendero, quiero que al elegir "Gasto" el escaneo funcione como ya funciona hoy, para no reaprender ese flujo.

#### Criterios de Aceptación

11.1. WHEN el Usuario elige el destino "Gasto", THE Ruta_Gasto SHALL enviar la imagen a la Funcion_Escaneo_Gasto junto con la lista de proveedores con nombre y NIT.

11.2. WHEN la Funcion_Escaneo_Gasto devuelve un resultado, THE Ruta_Gasto SHALL prellenar el valor, la descripción, el proveedor y la fecha con las mismas reglas de normalización, coincidencia de proveedor y validación de fecha vigentes hoy.

11.3. WHEN la Ruta_Gasto termina de prellenar los campos, THE Ruta_Gasto SHALL presentar, dentro de la superficie del Escaneo_Unificado, el selector de categoría con la categoría sugerida por la Funcion_Escaneo_Gasto pre-seleccionada cuando coincide con una categoría del Negocio_Activo, permitiendo al Usuario conservarla, elegir otra categoría existente o crear una nueva.

11.4. THE Ruta_Gasto SHALL presentar todos los campos prellenados como editables antes de la Finalizacion_Registro.

11.5. THE Ruta_Gasto SHALL conservar sin cambios las validaciones y el flujo de pago vigentes del registro de gasto: categoría obligatoria, proveedor obligatorio, fecha no posterior al día actual en la zona horaria colombiana, modos Contado y Crédito, pregunta de descuento de caja y validación de saldo.

11.6. WHEN el Usuario ejecuta la Finalizacion_Registro en la Ruta_Gasto, THE Ruta_Gasto SHALL invocar el Motor_Registro_Gasto y crear los mismos registros que crea hoy el gasto para esos valores: fila en `expenses`, fila en `business_debts` o en `debts` según el modo de pago, y movimientos de caja cuando corresponde.

11.7. IF el proveedor detectado en la Ruta_Gasto carece de coincidencia en `suppliers`, THEN THE Resolutor_Proveedor SHALL aplicar el aviso de proveedor nuevo definido en el Requisito 5.

### Requisito 12

**Historia de Usuario:** Como tendero, quiero que nada quede guardado a medias si abandono el escaneo, para no ensuciar mi catálogo ni mis proveedores.

#### Criterios de Aceptación

12.1. WHILE el Escaneo_Unificado permanece antes de la Finalizacion_Registro, THE Escaneo_Unificado SHALL mantener el Borrador_Escaneo únicamente en memoria del navegador.

12.2. WHILE el Escaneo_Unificado permanece antes de la Finalizacion_Registro, THE Escaneo_Unificado SHALL abstenerse de escribir en `products`, `product_purchase_units`, `suppliers`, `inventory_lots`, `business_debts`, `debts`, `expenses` y `cash_movements`.

12.3. WHEN el Usuario ejecuta la Finalizacion_Registro, THE Escaneo_Unificado SHALL subir la Evidencia al bucket `debt-evidence` antes de invocar el Motor_Registro_Compra o el Motor_Registro_Gasto, y pasar la URL resultante a esa invocación.

12.4. WHEN el Usuario ejecuta la Finalizacion_Registro, THE Escaneo_Unificado SHALL aplicar todas las escrituras dentro de una única operación transaccional de base de datos: proveedor nuevo, productos nuevos, apodos, equivalencias de Unidad_Compra, precios de venta y el registro de compra o de gasto.

12.5. IF el Usuario cierra el Escaneo_Unificado antes de la Finalizacion_Registro con decisiones ya tomadas, THEN THE Escaneo_Unificado SHALL solicitar confirmación, advertir que las decisiones se descartan y, al confirmar, descartar el Borrador_Escaneo completo.

12.6. THE Escaneo_Unificado SHALL prescindir de la recuperación de un Borrador_Escaneo interrumpido en una sesión posterior.

12.7. IF cualquier paso de la operación transaccional falla, THEN THE Escaneo_Unificado SHALL revertir la transacción completa y dejar la base de datos sin ningún dato del registro.

12.8. IF la operación transaccional falla, THEN THE Escaneo_Unificado SHALL informar el fallo, conservar el Borrador_Escaneo en memoria y ofrecer la acción "Reintentar".

12.9. WHEN el Usuario elige "Reintentar" tras un fallo, THE Escaneo_Unificado SHALL ejecutar la Finalizacion_Registro desde cero, porque la transacción revertida deja sin estado parcial que recuperar.

12.10. IF la operación transaccional falla después de subir la Evidencia, THEN THE Escaneo_Unificado SHALL dejar la imagen subida sin referencia desde ningún registro de la base de datos.

### Requisito 13

**Historia de Usuario:** Como tendero sin internet, quiero entender por qué no puedo escanear y poder registrar igual, para no quedarme bloqueado.

#### Criterios de Aceptación

13.1. WHILE el dispositivo está en Modo_Sin_Conexion, THE Menu_Acciones_Gastos SHALL mostrar la opción "Foto a factura" en estado deshabilitado.

13.2. WHEN el Usuario intenta usar "Foto a factura" en Modo_Sin_Conexion, THE Menu_Acciones_Gastos SHALL informar que el escaneo requiere conexión a internet y ofrecer las opciones "Compra de inventario" y "Otros gastos" para el registro manual.

13.3. WHILE el dispositivo está en Modo_Sin_Conexion, THE Escaneo_Unificado SHALL conservar el registro manual de compra de inventario y de gasto con el soporte offline vigente.

13.4. IF la conexión se pierde mientras el Escaneo_Unificado está en curso con un Borrador_Escaneo, THEN THE Escaneo_Unificado SHALL conservar el Borrador_Escaneo en memoria, informar la pérdida de conexión y permitir completar la Finalizacion_Registro por el camino offline vigente.

13.5. WHEN el dispositivo recupera la conexión, THE Menu_Acciones_Gastos SHALL habilitar la opción "Foto a factura".

### Requisito 14

**Historia de Usuario:** Como administrador, quiero que el escaneo esté disponible solo para quien registra compras y gastos, para controlar quién puede tocar el inventario.

#### Criterios de Aceptación

14.1. THE Menu_Acciones_Gastos SHALL mostrar la opción "Foto a factura" solo a los usuarios con Permiso_Registrar_Gastos.

14.2. IF el Escaneo_Unificado se abre sin Permiso_Registrar_Gastos, THEN THE Escaneo_Unificado SHALL mostrar el aviso de permiso faltante vigente y omitir el flujo de escaneo.

14.3. WHERE el Usuario cuenta con Permiso_Registrar_Gastos, THE Escaneo_Unificado SHALL habilitar todas las acciones del flujo: crear productos, agregar apodos, guardar equivalencias de Unidad_Compra, crear proveedores y editar el precio de venta.

14.4. THE Escaneo_Unificado SHALL ofrecer un único conjunto de acciones para todos los usuarios con Permiso_Registrar_Gastos, sin variantes reducidas del flujo según otros permisos.

### Requisito 15

**Historia de Usuario:** Como responsable del producto, quiero que el alcance de esta iteración quede explícito, para evitar cambios que no pedí.

#### Criterios de Aceptación

15.1. THE Escaneo_Unificado SHALL convivir con el escaneo con IA embebido en el formulario de Compra de Inventario, que conserva su comportamiento vigente durante esta iteración.

15.2. THE Escaneo_Unificado SHALL convivir con el escaneo con IA embebido en el formulario de Otros Gastos, que conserva su comportamiento vigente durante esta iteración.

15.3. THE Escaneo_Unificado SHALL conservar sin cambios el registro de mermas, el historial de compras, el historial de gastos y la anulación de compras.

15.4. THE Escaneo_Unificado SHALL conservar sin cambios las pantallas de creación y edición de productos `SimpleProductScreen`, `ProcessedProductScreen` y `ServiceProductScreen`.

15.5. THE Escaneo_Unificado SHALL conservar sin cambios el esquema de las tablas `products`, `product_purchase_units`, `suppliers`, `inventory_lots`, `business_debts` y `expenses`.

15.6. THE Flujo_Manual_Compra SHALL quedar dentro del alcance de esta iteración únicamente para migrar su registro al Motor_Registro_Compra.

15.7. THE Escaneo_Unificado SHALL operar sin introducir ninguna tabla nueva compartida entre negocios y sin ninguna consulta que lea o escriba filas de más de un negocio.

### Requisito 16

**Historia de Usuario:** Como tendero, quiero terminar la factura escaneada de principio a fin en la misma pantalla del escaneo, para no saltar a formularios que ya conozco a medias; y como responsable del producto, quiero que ese flujo nuevo y el manual compartan la misma lógica de registro, para que no se comporten distinto.

#### Criterios de Aceptación

16.1. THE Escaneo_Unificado SHALL resolver en su propia superficie de UI todos los pasos del flujo: captura de imagen, Selector_Destino, proveedor, resolución de cada Linea_Factura, Creacion_Rapida_Producto, equivalencias de Unidad_Compra, Panel_Revision, selección de pago y confirmación final.

16.2. THE Escaneo_Unificado SHALL presentar en su propia superficie las opciones de pago Contado y Crédito, la pregunta de descuento de caja, la selección de método de pago, el abono inicial y la fecha de vencimiento.

16.3. THE Escaneo_Unificado SHALL completar el registro sin abrir el panel de Compra de Inventario, el modal de Otros Gastos, la pantalla `SimpleProductScreen` ni ningún selector de proveedor externo al flujo.

16.4. THE Escaneo_Unificado SHALL completar el registro sin devolver al Usuario a un formulario externo para terminar la operación.

16.5. WHEN la Finalizacion_Registro concluye con éxito, THE Escaneo_Unificado SHALL regresar directamente a la pantalla de origen desde la que el Usuario abrió "Foto a factura".

16.6. THE Escaneo_Unificado SHALL presentar su propia UI de los pasos que ya existen en otros formularios (creación de producto, selección o creación de proveedor y pago Contado o Crédito), con el diseño de onboarding propio del escaneo.

16.7. THE Escaneo_Unificado SHALL aplicar las reglas de turno activo, saldo de caja, stock, lote, deuda y movimientos de caja exclusivamente a través del Motor_Registro_Compra en la Ruta_Inventario y del Motor_Registro_Gasto en la Ruta_Gasto, sin duplicar esa lógica de negocio en el frontend.

16.8. THE Flujo_Manual_Compra SHALL registrar sus compras a través del Motor_Registro_Compra.

16.9. WHEN el Flujo_Manual_Compra pasa a usar el Motor_Registro_Compra, THE Flujo_Manual_Compra SHALL conservar sin cambios su UI, sus validaciones y su comportamiento observable para el Usuario.

16.10. WHEN una misma compra con los mismos valores se registra por el Escaneo_Unificado y por el Flujo_Manual_Compra, THE Motor_Registro_Compra SHALL producir el mismo resultado en las tablas `inventory_lots`, `products`, `business_debts` y `cash_movements`.

### Requisito 17

**Historia de Usuario:** Como dueño de negocio, quiero que el escaneo lea y escriba únicamente datos de mi negocio, para que ningún proveedor, producto, apodo, equivalencia o gasto de otro negocio aparezca ni se mezcle con el mío.

#### Criterios de Aceptación

17.1. WHEN el Resolutor_Proveedor compara el NIT o el nombre detectados, THE Resolutor_Proveedor SHALL evaluar únicamente los proveedores del Negocio_Activo.

17.2. WHEN el Resolutor_Producto busca una Linea_Factura por nombre o por Apodo, THE Resolutor_Producto SHALL evaluar únicamente los productos del Negocio_Activo.

17.3. WHEN el Resolutor_Producto verifica si un Nombre_OCR ya existe como Apodo conforme al Requisito 8, THE Resolutor_Producto SHALL evaluar únicamente los productos del Negocio_Activo.

17.4. WHEN el Escaneo_Unificado lee las Unidad_Compra y los Factor_Conversion de un producto, THE Escaneo_Unificado SHALL leer únicamente las filas de `product_purchase_units` que corresponden a productos del Negocio_Activo.

17.5. WHEN la Ruta_Gasto presenta el selector de categoría, THE Ruta_Gasto SHALL ofrecer únicamente las categorías de gasto del Negocio_Activo.

17.6. WHEN el Escaneo_Unificado envía datos a la Funcion_Escaneo_Factura o a la Funcion_Escaneo_Gasto, THE Escaneo_Unificado SHALL incluir exclusivamente información del Negocio_Activo, incluida la lista de proveedores.

17.7. WHEN la Finalizacion_Registro crea un proveedor, un producto, una Unidad_Compra, un lote, una deuda, un gasto o un movimiento de caja, THE Escaneo_Unificado SHALL asociar cada registro creado al Negocio_Activo.

17.8. THE Motor_Registro_Compra SHALL derivar el negocio del registro a partir de la sesión autenticada en el servidor, sin usar ningún identificador de negocio enviado por el frontend.

17.9. THE Motor_Registro_Gasto SHALL derivar el negocio del registro a partir de la sesión autenticada en el servidor, sin usar ningún identificador de negocio enviado por el frontend.

17.10. IF el identificador de negocio recibido en la invocación difiere del Negocio_Activo de la sesión, THEN THE Motor_Registro_Compra SHALL rechazar la operación y abstenerse de escribir en la base de datos.

17.11. IF el identificador de negocio recibido en la invocación difiere del Negocio_Activo de la sesión, THEN THE Motor_Registro_Gasto SHALL rechazar la operación y abstenerse de escribir en la base de datos.

17.12. WHEN el Escaneo_Unificado sube la Evidencia al bucket `debt-evidence`, THE Escaneo_Unificado SHALL usar la ruta del bucket que corresponde al Negocio_Activo.

17.13. THE Escaneo_Unificado SHALL operar con la Politica_RLS de las tablas `products`, `product_purchase_units`, `suppliers`, `inventory_lots`, `business_debts`, `debts`, `expenses` y `cash_movements` activa, y SHALL completar cada lectura y cada escritura a través de esas políticas.

17.14. THE Escaneo_Unificado SHALL mostrar al Usuario únicamente datos del Negocio_Activo en todos los pasos del flujo: proveedor, líneas de producto, resultados de búsqueda, equivalencias, categorías, Panel_Revision y pasos de pago.
