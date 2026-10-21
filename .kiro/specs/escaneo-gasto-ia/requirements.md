# Requirements Document

## Introduction

Esta funcionalidad agrega escaneo de facturas/recibos con IA al componente de Registro de Gasto (`components/expense/ExpenseRegister.tsx`) de Bistro POS. El objetivo es permitir que, dentro de la pestaña "Registro" del formulario de gasto, el usuario elija entre dos modos de entrada: (A) escanear un comprobante con la cámara para que la IA reconozca y prellene los campos del gasto, o (B) llenar el formulario manualmente como hoy.

Al escanear, la IA (Gemini Vision vía una nueva edge function `scan-expense`) debe detectar el valor del gasto, el nombre/observación, sugerir una categoría (existente o nueva) y reconocer el proveedor por NIT o por nombre contra la tabla `suppliers`. La misma imagen escaneada se reutiliza como evidencia del gasto, evitando fotografiar dos veces. Todos los campos prellenados son editables antes de confirmar.

La sección de evidencia/escaneo se ubica primero en el orden visual, seguida de los campos detectados editables y, al final, el flujo normal existente (tipo Contado/Crédito, ¿sale de caja?, método de pago, confirmar). La funcionalidad debe coexistir con el flujo manual sin romperlo, conservar todas las validaciones actuales, mantener el comportamiento de caja/turno/crédito y degradar a modo manual cuando no haya conexión a internet.

## Glossary

- **ExpenseRegister**: Componente React (`components/expense/ExpenseRegister.tsx`) que registra egresos que no son compra de inventario, escribiendo en la tabla `expenses` vía `onSave` del padre.
- **Scan_Expense_Function**: Nueva edge function de Supabase (Deno) propuesta como `scan-expense`, que recibe la imagen de un comprobante junto con la lista de categorías existentes y la lista de proveedores (nombre/NIT), y devuelve los campos detectados del gasto.
- **Detected_Fields**: Conjunto de campos que la IA devuelve: monto (`amount`), descripción/observación (`description`), categoría sugerida (`suggestedCategory`), nombre de proveedor (`supplierName`), NIT (`nit`) y fecha (`date`).
- **Suggested_Category**: Categoría propuesta por la IA, que es o bien una de las categorías existentes del negocio o bien una categoría nueva propuesta.
- **Existing_Categories**: Lista de categorías del negocio provista por el hook `useExpenses` (`categories`), persistida en la tabla `expense_categories`.
- **Suppliers_Table**: Tabla `suppliers` de Supabase con campos `name`, `nit`, `phone`, `address`, accedida vía el hook `useSuppliers`.
- **Evidence_Image**: Imagen del comprobante que se sube al bucket `debt-evidence` y cuya URL se guarda en `expenses.receipt_url`.
- **Entry_Mode_Selector**: Control inicial que ofrece dos opciones de entrada: "Escanear con IA" y "Llenar manual".
- **Scan_Mode**: Modo de entrada en el que la IA prellena los campos a partir de una imagen.
- **Manual_Mode**: Modo de entrada en el que el usuario adjunta evidencia opcional y llena los campos a mano (comportamiento actual).
- **Offline_Mode**: Estado en el que el dispositivo no tiene conexión a internet, gestionado por la infraestructura offline existente (offlineQueue).
- **User**: Persona que opera el POS y registra el gasto.
- **Latin_Number_Format**: Formato numérico colombiano donde el punto separa miles y la coma separa decimales.

## Requirements

### Requirement 1: Selección de modo de entrada

**User Story:** Como usuario que registra un gasto, quiero elegir entre escanear con IA o llenar manualmente, para registrar el gasto de la forma más rápida según el caso.

#### Acceptance Criteria

1. WHEN el usuario abre la pestaña "Registro" del ExpenseRegister sin un modo previamente seleccionado, THE ExpenseRegister SHALL mostrar el Entry_Mode_Selector con exactamente dos opciones visibles y habilitadas: "Escanear con IA" y "Llenar manual".
2. WHEN el usuario selecciona "Escanear con IA", THE ExpenseRegister SHALL activar el Scan_Mode.
3. WHEN el Scan_Mode se activa, THE ExpenseRegister SHALL mostrar el control de captura de imagen que permite tomar una foto o seleccionar una imagen existente.
4. WHEN el usuario selecciona "Llenar manual", THE ExpenseRegister SHALL activar el Manual_Mode y mostrar el formulario con los campos editables (valor, observaciones, categoría, proveedor) vacíos y la sección de evidencia marcada como opcional.
5. WHILE el Scan_Mode o el Manual_Mode está activo, THE ExpenseRegister SHALL mostrar un control que permita regresar al Entry_Mode_Selector para cambiar de modo.
6. IF el usuario regresa al Entry_Mode_Selector mientras existen datos ingresados o una imagen capturada no confirmados, THEN THE ExpenseRegister SHALL solicitar confirmación antes de descartar dichos datos y, al confirmar, dejar los campos en su estado vacío inicial.
7. THE ExpenseRegister SHALL conservar las dos pestañas existentes "Registro" e "Historial" sin modificar el comportamiento de la pestaña "Historial".

### Requirement 2: Orden visual del formulario

**User Story:** Como usuario, quiero ver primero la evidencia/escaneo, luego los campos detectados y al final el flujo de pago, para seguir un orden lógico de registro.

#### Acceptance Criteria

1. THE ExpenseRegister SHALL presentar la sección de Evidencia/escaneo como el primer bloque visible (posición superior) del formulario de registro, tanto en Scan_Mode como en Manual_Mode.
2. THE ExpenseRegister SHALL presentar los campos detectados editables (valor, observaciones, categoría, proveedor) inmediatamente debajo de la sección de Evidencia/escaneo y por encima del flujo de pago.
3. THE ExpenseRegister SHALL presentar el flujo de pago (tipo Contado/Crédito, ¿el dinero sale de caja?, método de pago y confirmar) como el último bloque del formulario, debajo de los campos detectados editables.
4. THE ExpenseRegister SHALL conservar sin cambios funcionales los campos y validaciones existentes del flujo de pago: proveedor obligatorio, fecha de pago obligatoria cuando el tipo es Crédito, validación de saldo de caja suficiente, y rechazo de sobrepago.

### Requirement 3: Captura y reutilización de la imagen como evidencia

**User Story:** Como usuario, quiero que la foto que tomo para escanear sirva también como evidencia del gasto, para no fotografiar dos veces.

#### Acceptance Criteria

1. WHEN el usuario selecciona el Scan_Mode, THE ExpenseRegister SHALL permitir capturar una imagen del comprobante en formato JPEG o PNG mediante la cámara, con un tamaño máximo de 10 MB por captura.
2. WHEN el usuario captura una imagen en Scan_Mode, THE ExpenseRegister SHALL usar esa misma imagen como Evidence_Image del gasto.
3. WHEN el usuario confirma un gasto que incluye una Evidence_Image, THE ExpenseRegister SHALL subir la imagen al bucket `debt-evidence` y guardar la URL resultante en `expenses.receipt_url`.
4. IF la subida de la Evidence_Image al bucket `debt-evidence` falla, THEN THE ExpenseRegister SHALL mostrar un mensaje de error indicando que la evidencia no pudo guardarse, conservar la imagen capturada y permitir reintentar la subida sin perder los demás datos del formulario.
5. WHEN el usuario captura o adjunta una Evidence_Image, THE ExpenseRegister SHALL comprimir la imagen a un tamaño máximo de 1 MB antes de enviarla a la Scan_Expense_Function y antes de subirla al bucket `debt-evidence`, usando los helpers de compresión existentes.
6. WHERE el usuario está en Manual_Mode, THE ExpenseRegister SHALL permitir adjuntar una Evidence_Image opcional mediante el flujo de evidencia existente.

### Requirement 4: Reconocimiento del valor y la observación

**User Story:** Como usuario, quiero que la IA detecte el monto del gasto y un nombre descriptivo, para no escribirlos manualmente.

#### Acceptance Criteria

1. WHEN la Scan_Expense_Function recibe una imagen de comprobante, THE Scan_Expense_Function SHALL devolver el monto del gasto en el campo `amount` normalizado a un número según el Latin_Number_Format, dentro del rango de 0.01 a 999,999,999.99.
2. WHEN la Scan_Expense_Function devuelve un monto dentro del rango de 0.01 a 999,999,999.99, THE ExpenseRegister SHALL prellenar el campo "Valor" con dicho monto.
3. WHEN la Scan_Expense_Function devuelve un texto en el campo `description`, THE ExpenseRegister SHALL prellenar el campo "Observaciones" con dicho texto, truncado a un máximo de 500 caracteres.
4. IF la Scan_Expense_Function no detecta el monto, o devuelve un valor no numérico o fuera del rango de 0.01 a 999,999,999.99, THEN THE ExpenseRegister SHALL dejar el campo "Valor" vacío para que el usuario lo complete.
5. THE ExpenseRegister SHALL permitir al usuario editar el campo "Valor" y el campo "Observaciones" prellenados antes de confirmar.

### Requirement 5: Sugerencia de categoría

**User Story:** Como usuario, quiero que la IA elija la categoría más parecida a las existentes o proponga una nueva, para clasificar el gasto correctamente.

#### Acceptance Criteria

1. WHEN el usuario inicia el escaneo, THE ExpenseRegister SHALL enviar las Existing_Categories a la Scan_Expense_Function junto con la imagen.
2. WHEN la Scan_Expense_Function determina que el gasto detectado corresponde a una de las Existing_Categories comparando de forma insensible a mayúsculas/minúsculas y a espacios al inicio y al final, THE Scan_Expense_Function SHALL devolver esa categoría existente, con su texto original, como Suggested_Category.
3. IF ninguna de las Existing_Categories corresponde al gasto detectado según el criterio de comparación, THEN THE Scan_Expense_Function SHALL devolver una categoría nueva propuesta como Suggested_Category.
4. WHEN la Suggested_Category corresponde a una categoría existente, THE ExpenseRegister SHALL seleccionar esa categoría en el campo "Categoría".
5. WHEN la Suggested_Category es una categoría nueva, THE ExpenseRegister SHALL dejar el campo "Categoría" sin selección y ofrecer al usuario crear esa categoría mediante el mecanismo `addCategory` del hook `useExpenses` antes de confirmar el gasto.
6. IF la Scan_Expense_Function no devuelve ninguna Suggested_Category, THEN THE ExpenseRegister SHALL dejar el campo "Categoría" sin selección para que el usuario la elija o la cree.
7. THE ExpenseRegister SHALL permitir al usuario cambiar la categoría seleccionada por cualquier categoría existente o por una nueva antes de confirmar.

### Requirement 6: Reconocimiento del proveedor

**User Story:** Como usuario, quiero que la IA reconozca al proveedor por NIT o nombre, para no buscarlo manualmente.

#### Acceptance Criteria

1. WHEN el usuario inicia el escaneo, THE ExpenseRegister SHALL enviar la lista de proveedores con nombre y NIT a la Scan_Expense_Function junto con la imagen.
2. WHEN la Scan_Expense_Function detecta un NIT o un nombre de proveedor, THE Scan_Expense_Function SHALL devolver dichos valores en los campos `nit` y `supplierName`.
3. WHEN el `nit` devuelto coincide, ignorando espacios y guiones, con el NIT de un registro de la Suppliers_Table, THE ExpenseRegister SHALL seleccionar ese proveedor existente en el campo "Proveedor".
4. WHEN el `nit` devuelto no coincide con ningún registro pero el `supplierName` devuelto coincide, de forma insensible a mayúsculas/minúsculas y a espacios al inicio y al final, con el nombre de un registro de la Suppliers_Table, THE ExpenseRegister SHALL seleccionar ese proveedor existente en el campo "Proveedor".
5. IF la Scan_Expense_Function no detecta proveedor, o el proveedor detectado no coincide con ningún registro de la Suppliers_Table por NIT ni por nombre, THEN THE ExpenseRegister SHALL solicitar al usuario elegir un proveedor existente o crear uno nuevo.
6. WHEN el usuario decide crear un proveedor nuevo a partir de los datos detectados, THE ExpenseRegister SHALL prellenar el modal de creación de proveedor con el `supplierName` y el `nit` detectados usando el mecanismo `createSupplier` del hook `useSuppliers`.
7. THE ExpenseRegister SHALL conservar la obligatoriedad del proveedor según las reglas actuales antes de permitir confirmar el gasto.

### Requirement 7: Reconocimiento de la fecha

**User Story:** Como usuario, quiero que la IA detecte la fecha del comprobante, para registrar el gasto con la fecha correcta.

#### Acceptance Criteria

1. WHEN la Scan_Expense_Function detecta una fecha en el comprobante, THE Scan_Expense_Function SHALL devolverla en el campo `date` como una fecha de calendario con año, mes y día.
2. WHEN la Scan_Expense_Function devuelve una fecha que corresponde a una fecha de calendario real y cuyo valor es igual o anterior a la fecha actual en la zona horaria colombiana, THE ExpenseRegister SHALL prellenar el campo "Fecha" con dicha fecha.
3. IF la fecha detectada es posterior a la fecha actual en la zona horaria colombiana, o no corresponde a una fecha de calendario real, o el campo `date` viene vacío, THEN THE ExpenseRegister SHALL mantener seleccionada la fecha actual de la zona horaria colombiana en el campo "Fecha".
4. THE ExpenseRegister SHALL permitir al usuario editar la fecha del campo "Fecha" antes de confirmar el gasto.

### Requirement 8: Edición de campos prellenados

**User Story:** Como usuario, quiero corregir cualquier dato que la IA detecte, para asegurar que el gasto quede correcto.

#### Acceptance Criteria

1. THE ExpenseRegister SHALL presentar todos los campos prellenados por la IA (valor, observaciones, categoría, proveedor, fecha) como campos editables.
2. WHEN el usuario modifica un campo prellenado, THE ExpenseRegister SHALL usar el valor editado por el usuario, en lugar del valor sugerido por la IA, al guardar el gasto.
3. WHEN el usuario solicita confirmar el gasto, THE ExpenseRegister SHALL aplicar sobre los valores finales las mismas validaciones del flujo manual (valor numérico mayor que cero, proveedor seleccionado, categoría seleccionada y fecha no posterior a la fecha actual en la zona horaria colombiana) antes de permitir el guardado.
4. IF alguno de los valores finales no cumple las validaciones del flujo manual, THEN THE ExpenseRegister SHALL impedir la confirmación del gasto e indicar al usuario el campo que requiere corrección.

### Requirement 9: Estados del proceso de escaneo

**User Story:** Como usuario, quiero saber cuándo la IA está procesando y qué pasó si falla, para entender el estado del escaneo.

#### Acceptance Criteria

1. WHILE la Scan_Expense_Function está procesando la imagen, THE ExpenseRegister SHALL mostrar un indicador de carga.
2. WHEN la Scan_Expense_Function devuelve un resultado exitoso, THE ExpenseRegister SHALL ocultar el indicador de carga y mostrar los campos prellenados.
3. IF la Scan_Expense_Function devuelve un error o no entrega un resultado dentro de un tiempo de espera de 30 segundos, THEN THE ExpenseRegister SHALL mantener el indicador de carga hasta que el procesamiento en curso se detenga por completo, y luego ocultar el indicador de carga y mostrar un mensaje de error que indique que el escaneo no se completó.
4. WHEN el escaneo falla o agota el tiempo de espera de 30 segundos, THE ExpenseRegister SHALL ofrecer al usuario las opciones de reintentar el escaneo o continuar en Manual_Mode.
5. WHEN el escaneo falla o agota el tiempo de espera de 30 segundos, THE ExpenseRegister SHALL conservar la imagen capturada como Evidence_Image para que el usuario continúe en Manual_Mode sin volver a capturar la imagen.

### Requirement 10: Degradación a modo manual sin conexión

**User Story:** Como usuario sin internet, quiero poder seguir registrando el gasto manualmente, para no quedar bloqueado.

#### Acceptance Criteria

1. WHILE el dispositivo está en Offline_Mode, THE ExpenseRegister SHALL mostrar la opción "Escanear con IA" en estado deshabilitado y no seleccionable, y activar automáticamente el Manual_Mode.
2. WHEN el dispositivo está en Offline_Mode y el usuario abre el formulario de registro, THE ExpenseRegister SHALL mostrar un mensaje visible indicando que el escaneo con IA requiere conexión a internet.
3. WHILE el dispositivo está en Offline_Mode, THE ExpenseRegister SHALL conservar el registro de gasto manual mediante el soporte offline existente (offlineQueue).
4. IF la conexión a internet se pierde mientras el Scan_Mode está activo con datos prellenados o una imagen capturada, THEN THE ExpenseRegister SHALL conservar la imagen capturada y los campos ya prellenados y permitir continuar en Manual_Mode.
5. WHEN el dispositivo recupera la conexión a internet, THE ExpenseRegister SHALL rehabilitar la opción "Escanear con IA".

### Requirement 11: Coexistencia con el flujo existente

**User Story:** Como usuario, quiero que el escaneo no rompa el flujo de gastos actual, para seguir registrando como siempre cuando lo prefiera.

#### Acceptance Criteria

1. WHEN el usuario confirma un gasto registrado en Scan_Mode con un conjunto de valores finales, THE ExpenseRegister SHALL crear los mismos registros (`onSave` sobre `expenses`, creación de `debts` en crédito, fila en `business_debts` en contado, movimientos de caja) que crearía el flujo manual para esos mismos valores finales.
2. THE ExpenseRegister SHALL conservar el comportamiento de caja, turno y crédito existente sin cambios.
3. WHEN el usuario confirma un gasto en Scan_Mode, THE ExpenseRegister SHALL incluir la URL de la Evidence_Image en `expenses.receipt_url` y en la `evidence_url` de los registros de deuda asociados, igual que el flujo manual.
4. WHEN un guardado se completa exitosamente, THE ExpenseRegister SHALL restablecer el formulario a su estado vacío inicial y hacer scroll al inicio, independientemente del modo de entrada usado.
5. IF el guardado de un gasto registrado en Scan_Mode falla, THEN THE ExpenseRegister SHALL conservar los datos del formulario y la Evidence_Image, mostrar un mensaje de error y permitir reintentar la confirmación.

### Requirement 12: Contrato de la edge function de escaneo de gasto

**User Story:** Como desarrollador, quiero una edge function dedicada al escaneo de gastos, para devolver un total único y una categoría sugerida que el flujo de inventario no provee.

#### Acceptance Criteria

1. WHEN la Scan_Expense_Function recibe una solicitud, THE Scan_Expense_Function SHALL aceptar la imagen del comprobante, la lista de Existing_Categories y la lista de proveedores (nombre y NIT).
2. WHEN la Scan_Expense_Function procesa una imagen válida, THE Scan_Expense_Function SHALL devolver un objeto con los campos `amount`, `description`, `suggestedCategory`, `supplierName`, `nit` y `date`, donde `date` es una fecha de calendario válida o vacía.
3. THE Scan_Expense_Function SHALL devolver el campo `amount` como un valor numérico único mayor que cero, normalizado según el Latin_Number_Format.
4. IF la imagen recibida no es legible o no corresponde a un comprobante, THEN THE Scan_Expense_Function SHALL devolver una respuesta de error que indique la causa y sin campos prellenados.
5. THE Scan_Expense_Function SHALL ser independiente de la edge function `scan-invoice` de inventario y no alterar su comportamiento.
6. THE Scan_Expense_Function SHALL responder dentro de un tiempo máximo de 30 segundos por solicitud.
7. IF la solicitud no incluye una imagen, THEN THE Scan_Expense_Function SHALL devolver una respuesta de error indicando que la imagen es obligatoria, sin invocar al modelo de IA.
