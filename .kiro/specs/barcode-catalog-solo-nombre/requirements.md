# Requirements Document

## Introduction

Hoy la tabla `public.barcode_catalog` funciona como caché maestro compartido entre negocios: cuando un negocio escanea un código de barras conocido, el sistema devuelve nombre, marca, cantidad e imagen provenientes de otro negocio o de Go-UPC. Este comportamiento fuerza a que la URL de imagen (`image_url`) sea consumida y a veces copiada por el negocio consumidor. El problema: cuando el negocio dueño del archivo lo borra del bucket `product-images/{business_id}/…`, cualquier otro negocio que tenga esa URL en su catálogo o en sus propios productos queda con imágenes rotas. Ya se reprodujo con un producto real (Rexona) que retornaba HTTP 400 en `dev.posbistro.online` y solo aparentaba funcionar en producción por caché del Service Worker.

Esta feature elimina el uso compartido de imágenes entre negocios sin migrar datos ni cambiar el schema. El catálogo pasa a compartir únicamente información textual (nombre y opcionalmente marca/cantidad). Cada negocio sube su propia foto en su carpeta del bucket; el catálogo nunca vuelve a exponer URLs de imagen al frontend consumidor, ni al descubrir el barcode por Supabase ni al consultar Go-UPC. La columna `image_url` de `barcode_catalog` queda presente por compatibilidad pero deja de leerse y deja de escribirse con valores útiles.

## Glossary

- **Sistema**: El sistema Bistro POS en su conjunto (frontend React + Supabase + edge functions).
- **Catálogo de barcodes**: Tabla `public.barcode_catalog` (columnas `barcode`, `product_name`, `brand`, `quantity`, `image_url`, `source`, `updated_at`), compartida por todos los negocios.
- **Bucket de imágenes**: Bucket Supabase Storage `product-images`, público, con carpeta por negocio (`product-images/{business_id}/…`).
- **Frontend**: El código React que ejecuta el navegador del usuario, en particular `screens/SimpleProductScreen.tsx`.
- **Módulo de lookup**: El módulo `lib/barcodeLookup.ts`, que expone `lookupBarcode` y `saveProductToBarcodeCatalog`.
- **Edge Function de lookup**: La edge function `barcode-lookup` en `supabase/functions/barcode-lookup/`, usada como proxy para Go-UPC.
- **Go-UPC**: Proveedor externo (`go-upc.com`) que devuelve datos de producto por código de barras.
- **Modal de producto**: La pantalla `SimpleProductScreen` en modo creación o edición de producto.
- **Origen del registro (`source`)**: Campo de `barcode_catalog` con valores `'ean-db'` (nombre autogenerado desde Go-UPC) o `'user'` (nombre editado o creado por un usuario del Sistema).
- **Imagen propia del negocio**: Archivo dentro de `product-images/{business_id}/…` subido y controlado por ese negocio a través del flujo existente de `useImageUpload`.

## Requirements

### Requirement 1: El catálogo no expone imágenes al frontend

**User Story:** Como usuario que escanea un código de barras conocido por otro negocio, quiero que el Sistema no me devuelva la imagen de ese negocio, para no depender de un archivo que puede desaparecer.

#### Acceptance Criteria

1. WHEN el Frontend invoca `lookupBarcode(barcode)` y el barcode existe en el Catálogo de barcodes, THE Módulo de lookup SHALL devolver un resultado cuyo campo de imagen sea `null` con independencia del valor almacenado en `barcode_catalog.image_url`.
2. WHEN el Frontend invoca `lookupBarcode(barcode)` y el barcode se resuelve por Go-UPC, THE Módulo de lookup SHALL devolver un resultado cuyo campo de imagen sea `null` con independencia del valor devuelto por Go-UPC.
3. THE Frontend SHALL NOT ejecutar `downloadAndCompressExternalImage` como consecuencia del resultado de `lookupBarcode`.

### Requirement 2: Prellenado del modal cuando el barcode existe en el catálogo

**User Story:** Como usuario que escanea un código de barras ya cacheado, quiero que el modal de creación de producto me prellenle el nombre, para no reescribirlo, pero quiero subir mi propia foto.

#### Acceptance Criteria

1. WHEN el usuario escanea un barcode en el Modal de producto en modo creación, el barcode existe en el Catálogo de barcodes, y el campo nombre del formulario está vacío, THE Frontend SHALL asignar al campo nombre el `productName` devuelto por `lookupBarcode`.
2. WHEN el usuario escanea un barcode en el Modal de producto en modo creación y el barcode existe en el Catálogo de barcodes, THE Frontend SHALL mantener el campo de imagen vacío hasta que el usuario suba una imagen manualmente.
3. WHEN el usuario escanea un barcode en el Modal de producto en modo creación y el campo nombre del formulario ya tiene contenido, THE Frontend SHALL preservar el valor existente sin sobrescribirlo.
4. WHEN el usuario escanea un barcode en el Modal de producto y `lookupBarcode` devuelve un resultado, THE Frontend SHALL mostrar un toast informativo con el nombre encontrado.

### Requirement 3: Consulta a Go-UPC descarta la imagen externa

**User Story:** Como equipo de Bistro POS, quiero que al descubrir un producto nuevo vía Go-UPC solo se conserve el nombre, para no introducir URLs externas que puedan romperse.

#### Acceptance Criteria

1. WHEN `lookupBarcode` no encuentra el barcode en el Catálogo de barcodes y la consulta a Go-UPC devuelve un producto con nombre, THE Módulo de lookup SHALL almacenar en el Catálogo de barcodes una fila con `product_name` derivado del nombre de Go-UPC, `source='ean-db'` y `image_url = null`.
2. THE Módulo de lookup SHALL NOT descargar, procesar ni referenciar la URL de imagen que Go-UPC exponga en su respuesta.
3. THE Sistema SHALL NOT invocar la Edge Function de lookup con la acción de descarga de imágenes externas como consecuencia del flujo de `lookupBarcode`.

### Requirement 4: Escaneo sin match en catálogo ni en Go-UPC

**User Story:** Como usuario que escanea un código que nadie conoce, quiero seguir viendo el flujo actual (formulario vacío, sin toast de error), para completar el producto manualmente.

#### Acceptance Criteria

1. WHEN el usuario escanea un barcode en el Modal de producto, el barcode no existe en el Catálogo de barcodes y Go-UPC no devuelve resultado, THE Frontend SHALL dejar el campo nombre y el campo de imagen del formulario sin modificar.
2. WHEN `lookupBarcode` devuelve `null`, THE Frontend SHALL NOT mostrar un toast de error ni bloquear el guardado del producto.

### Requirement 5: Guardado del producto actualiza el catálogo solo con nombre

**User Story:** Como equipo de Bistro POS, quiero que cuando un usuario crea un producto con código de barras, el catálogo global se actualice con el nombre que él eligió, sin subir ninguna referencia a su imagen.

#### Acceptance Criteria

1. WHEN el usuario crea un producto nuevo (no edición) marcado como "para la venta", con `barcode` no vacío y `product_name` no vacío, THE Frontend SHALL invocar `saveProductToBarcodeCatalog(barcode, product_name)` una vez que el `INSERT` en `public.products` termine con éxito.
2. WHEN `saveProductToBarcodeCatalog` se ejecuta, THE Módulo de lookup SHALL hacer `upsert` en el Catálogo de barcodes con `product_name` provisto, `source='user'`, `brand=null`, `quantity=null`, `image_url=null` y `updated_at = ahora`.
3. IF el producto que se está guardando no tiene barcode, THEN THE Frontend SHALL NOT invocar `saveProductToBarcodeCatalog`.
4. IF el producto que se está guardando no tiene `product_name` no vacío, THEN THE Frontend SHALL NOT invocar `saveProductToBarcodeCatalog`.
5. IF el producto se está editando (no creando), THEN THE Frontend SHALL NOT invocar `saveProductToBarcodeCatalog`.
6. IF el producto no está marcado como "para la venta", THEN THE Frontend SHALL NOT invocar `saveProductToBarcodeCatalog`.

### Requirement 6: Transición de origen `ean-db` a `user`

**User Story:** Como equipo de Bistro POS, quiero que cuando un usuario guarda un producto y confirma o edita su nombre, ese aporte reemplace el nombre autogenerado por Go-UPC en el catálogo, para que la calidad del catálogo mejore con aportes reales.

#### Acceptance Criteria

1. WHEN `saveProductToBarcodeCatalog(barcode, product_name)` se ejecuta y el barcode ya existe en el Catálogo de barcodes con `source='ean-db'`, THE Módulo de lookup SHALL actualizar esa fila a `source='user'` con el `product_name` provisto, `brand=null`, `quantity=null`, `image_url=null` y `updated_at = ahora`.
2. WHEN `saveProductToBarcodeCatalog(barcode, product_name)` se ejecuta y el barcode ya existe en el Catálogo de barcodes con `source='user'`, THE Módulo de lookup SHALL actualizar el `product_name` y `updated_at` de esa fila conservando `source='user'` e `image_url=null`.
3. WHEN `saveProductToBarcodeCatalog` se invoca dos o más veces consecutivas con los mismos argumentos, THE Módulo de lookup SHALL producir el mismo estado final en el Catálogo de barcodes que si se hubiera invocado una sola vez (idempotencia).

### Requirement 7: Compatibilidad con datos históricos del catálogo

**User Story:** Como equipo de Bistro POS, quiero que las filas históricas del catálogo con `image_url` no vacío sigan funcionando sin romper el flujo, para no requerir migración de datos.

#### Acceptance Criteria

1. WHEN `lookupBarcode` encuentra una fila en el Catálogo de barcodes cuyo `image_url` ya contiene una URL (previa a esta feature), THE Módulo de lookup SHALL ignorar ese valor y devolver imagen `null` conforme al Requisito 1.
2. THE Sistema SHALL NOT ejecutar migraciones de datos que modifiquen o eliminen filas existentes de `barcode_catalog` como consecuencia de esta feature.
3. THE Sistema SHALL NOT ejecutar migraciones de schema que alteren la definición de `barcode_catalog` (`ALTER TABLE`, `DROP COLUMN`, etc.) como consecuencia de esta feature.
4. WHEN un `upsert` se ejecuta sobre una fila cuyo `image_url` histórico es no vacío, THE Módulo de lookup SHALL escribir `image_url=null` sobre esa fila.

### Requirement 8: Comportamiento fuera de línea

**User Story:** Como usuario que escanea un código de barras sin conexión, quiero que el flujo actual siga funcionando (fallback local sin imagen), para completar mi trabajo cuando vuelva la conexión.

#### Acceptance Criteria

1. WHILE el Frontend detecta modo offline, THE Frontend SHALL NOT invocar `lookupBarcode` contra Supabase; el comportamiento del formulario respecto a la imagen SHALL ser idéntico al Requisito 4 (campo imagen sin modificar).
2. WHILE el Frontend detecta modo offline, THE Frontend SHALL mantener bloqueado el guardado de productos según la política vigente en `SimpleProductScreen`, y por lo tanto SHALL NOT invocar `saveProductToBarcodeCatalog`.
3. WHEN la conexión regresa y el usuario completa el guardado del producto, THE Sistema SHALL aplicar el Requisito 5 en el orden establecido (guardar producto y luego actualizar catálogo con solo nombre).

### Requirement 9: Eliminación de producto sin efecto en otros negocios

**User Story:** Como negocio dueño de una imagen, quiero poder borrar mi producto o su imagen del bucket sin que otros negocios vean imágenes rotas, para no cargar con la responsabilidad del catálogo global.

#### Acceptance Criteria

1. WHEN un negocio elimina su producto o el archivo de imagen correspondiente en `product-images/{business_id}/…`, THE Sistema SHALL dejar intactas las filas de otros negocios en `public.products` y las filas del Catálogo de barcodes.
2. WHEN otro negocio consulta `lookupBarcode` con un barcode cuyo negocio origen ya borró su imagen, THE Módulo de lookup SHALL devolver el resultado textual conforme al Requisito 1 sin exponer una URL de imagen rota.

### Requirement 10: Subida de imágenes por negocio conserva el flujo actual

**User Story:** Como usuario que quiere una foto para mi producto, quiero seguir subiéndola desde el modal con los mismos controles de hoy, para no aprender una interfaz nueva.

#### Acceptance Criteria

1. WHEN el usuario adjunta o captura una imagen en el Modal de producto, THE Frontend SHALL subir el archivo a `product-images/{business_id}/…` a través del hook existente `useImageUpload`, sin cambios respecto al flujo actual.
2. WHEN el usuario guarda el producto con una imagen adjunta, THE Sistema SHALL almacenar la URL pública del archivo en `public.products.image_url`, sin propagar esa URL al Catálogo de barcodes.
3. THE Frontend SHALL exponer los mismos controles de foto (adjuntar, capturar, eliminar, recomprimir) que existen hoy, sin depender del resultado de `lookupBarcode`.

## Fuera de alcance

Los siguientes puntos se descartaron explícitamente por decisión del usuario y NO se abordarán en esta feature:

- Migración de las 25 filas actuales de `barcode_catalog` que tienen `image_url` con URLs de Go-UPC (`UPDATE ... SET image_url = NULL` masivo).
- Cambios de schema en `barcode_catalog` (`DROP COLUMN image_url`, renombrar columnas, etc.).
- Compartir imágenes entre negocios por cualquier vía (carpeta compartida `product-images/barcode_catalog/`, edge function de copia, sistema de referencia contada, content-addressable storage, etc.).
- Eliminación de la función `downloadAndCompressExternalImage` en `hooks/useImageUpload.ts` (permanece en el hook por si otro consumidor la necesita en el futuro; se valida si sigue teniendo usos en la fase de diseño).
- Eliminación de la action `fetch_image` de la Edge Function de lookup (queda como código muerto potencial; se evalúa en diseño si se puede simplificar, pero no es obligatorio).
