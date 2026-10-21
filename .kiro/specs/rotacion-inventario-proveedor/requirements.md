# Requirements Document

## Introduction

Esta funcionalidad, **Rotación de Inventario por Proveedor**, permite al tendero configurar los umbrales de rotación de inventario (días óptimos, alerta crítica) a nivel de proveedor, con la capacidad de que un mismo producto tenga múltiples proveedores, cada uno con su propia configuración de rotación. En Colombia, los preventistas/proveedores visitan el negocio periódicamente; el tendero necesita seleccionar rápidamente qué proveedor llegó, ver la salud del stock de todos sus productos y decidir cuánto pedir.

El diagnóstico de salud se calcula exclusivamente con los umbrales del proveedor (o valores por defecto). La configuración por categoría (`categories.optimal_min/max/alert_days`) queda deprecada y no se usa para el diagnóstico.

Cuando un producto tiene lotes activos de múltiples proveedores, el diagnóstico se muestra desglosado por proveedor. Cuando tiene lotes de un solo proveedor, se muestra de forma consolidada (comportamiento actual).

## Glossary

- **Sistema**: La aplicación BistroPOS (frontend PWA + backend Supabase)
- **Tendero**: Usuario principal del POS, dueño o encargado de la tienda
- **Proveedor**: Persona o empresa que surte mercancía al negocio. Registrado en la tabla `suppliers`
- **Diagnóstico_de_Salud**: Cálculo que determina cuántos días durará el stock actual de un producto basándose en la velocidad de ventas de los últimos 28 días
- **Umbrales_de_Rotación**: Conjunto de 3 valores configurables (`optimal_min`, `optimal_max`, `alert_days`) que definen los rangos de salud del stock
- **Supplier_Product_Config**: Tabla intermedia que almacena la configuración de rotación por combinación (supplier_id, product_id)
- **Proveedor_Default**: Proveedor asignado manualmente a un producto mediante `products.default_supplier_id`
- **Proveedor_Histórico**: Proveedor asociado a un producto por tener lotes en `inventory_lots.supplier_name`
- **Vinculación_Manual**: Asociación producto-proveedor creada desde el SupplierSettingsModal mediante el buscador de productos
- **ProductsScreen**: Pantalla principal del catálogo de productos (`screens/ProductsScreen.tsx`)
- **SimpleProductScreen**: Pantalla de creación/edición de producto (`screens/SimpleProductScreen.tsx`)
- **SupplierSettingsModal**: Modal para configurar los Umbrales_de_Rotación de un proveedor específico y vincular productos manualmente
- **Lotes_Activos**: Registros en `inventory_lots` cuyo `remaining_quantity > 0`
- **Desglose_por_Proveedor**: Visualización del diagnóstico de salud separada por cada proveedor que tiene lotes activos de un producto

## Requirements

### Requisito 1: Asignación de proveedor default a productos

**Historia de Usuario:** Como tendero, quiero asignar un proveedor principal a cada producto desde la pantalla de creación/edición, para que el sistema sepa de quién depende cada producto sin necesidad de haber registrado una compra previa.

#### Criterios de Aceptación

1.1. WHEN el Tendero abre SimpleProductScreen para crear o editar un producto, THE Sistema SHALL mostrar un campo dropdown de selección de proveedor, posicionado después del campo de categoría y antes del campo de código de barras.

1.2. THE Sistema SHALL poblar el dropdown con todos los proveedores activos del negocio (tabla `suppliers` filtrada por `business_id` y `is_active = true`), ordenados alfabéticamente por nombre.

1.3. WHEN el Tendero selecciona un proveedor del dropdown, THE Sistema SHALL almacenar el `id` del proveedor seleccionado en `products.default_supplier_id`.

1.4. WHEN el Tendero guarda el producto sin seleccionar proveedor, THE Sistema SHALL almacenar `null` en `products.default_supplier_id` sin mostrar error ni advertencia bloqueante.

1.5. WHEN el Tendero edita un producto que ya tiene `default_supplier_id`, THE Sistema SHALL preseleccionar ese proveedor en el dropdown.

### Requisito 2: Configuración de umbrales de rotación por proveedor

**Historia de Usuario:** Como tendero, quiero configurar los días óptimos de inventario y la alerta crítica para cada proveedor, y vincular productos manualmente desde el mismo modal, para ajustar el diagnóstico de salud según la frecuencia de visita de cada proveedor.

#### Criterios de Aceptación

2.1. WHEN el Tendero presiona el botón "Configurar Rotación" con un proveedor seleccionado en ProductsScreen, THE Sistema SHALL abrir SupplierSettingsModal con los umbrales actuales del proveedor seleccionado.

2.2. THE SupplierSettingsModal SHALL mostrar tres campos editables: `optimal_min` (días mínimo del rango óptimo), `optimal_max` (días máximo del rango óptimo) y `alert_days` (días de alerta crítica).

2.3. THE SupplierSettingsModal SHALL incluir una sección "Agregar productos" con un campo buscador que permita buscar productos por nombre o código de barras y vincularlos al proveedor.

2.4. WHEN el Tendero busca un producto en el buscador del SupplierSettingsModal y lo selecciona, THE Sistema SHALL crear un registro en Supplier_Product_Config asociando el producto al proveedor.

2.5. WHEN el Tendero guarda la configuración de umbrales en SupplierSettingsModal, THE Sistema SHALL persistir los valores de `optimal_min`, `optimal_max` y `alert_days` en la tabla `suppliers` para el proveedor seleccionado.

2.6. IF el Tendero ingresa un valor de `optimal_min` mayor que `optimal_max`, THEN THE Sistema SHALL mostrar un mensaje de error inline y no persistir los cambios hasta que se corrija.

2.7. IF el Tendero ingresa un valor de `alert_days` menor que 1, THEN THE Sistema SHALL mostrar un mensaje de error inline indicando que el mínimo es 1 día.

### Requisito 3: Selector prominente de proveedor en ProductsScreen

**Historia de Usuario:** Como tendero, quiero seleccionar rápidamente el proveedor que llegó a mi negocio desde una interfaz visible y accesible, para ver inmediatamente el estado de todos sus productos sin buscar entre menús ocultos.

#### Criterios de Aceptación

3.1. WHEN el Tendero abre ProductsScreen en el tab "Productos" (retail), THE Sistema SHALL mostrar un selector de proveedor con alta visibilidad (tarjetas o botones grandes), posicionado en la zona de filtros principales, separado del buscador de texto.

3.2. WHEN el Tendero selecciona un proveedor en el selector, THE Sistema SHALL filtrar la lista mostrando únicamente los productos asociados a ese proveedor (por `default_supplier_id`, por presencia en `inventory_lots`, o por Vinculación_Manual en Supplier_Product_Config).

3.3. WHEN hay un proveedor seleccionado y el Tendero deselecciona el proveedor, THE Sistema SHALL volver a mostrar todos los productos del tab activo sin filtro de proveedor.

3.4. WHILE un proveedor está seleccionado, THE Sistema SHALL mostrar claramente cuál proveedor está activo (nombre destacado, indicador visual de selección).

3.5. WHEN el Tendero cambia de tab (a Insumos, Servicios o Promociones), THE Sistema SHALL resetear la selección de proveedor a "ninguno".

### Requisito 4: Diagnóstico de salud desglosado por proveedor

**Historia de Usuario:** Como tendero, quiero que cuando un producto tiene stock de múltiples proveedores el diagnóstico se muestre desglosado por cada proveedor con sus propios umbrales, para tomar decisiones de compra precisas según la frecuencia de visita de cada uno.

#### Criterios de Aceptación

4.1. WHEN un producto tiene Lotes_Activos de más de un proveedor (agrupados por `inventory_lots.supplier_name`), THE Sistema SHALL mostrar el Diagnóstico_de_Salud desglosado por proveedor, presentando una línea por cada proveedor con su stock y su estado de salud independiente.

4.2. WHEN un producto tiene Lotes_Activos de un único proveedor, THE Sistema SHALL mostrar el Diagnóstico_de_Salud consolidado (una sola línea, comportamiento actual) usando los umbrales de ese proveedor.

4.3. THE Sistema SHALL calcular el Diagnóstico_de_Salud de cada línea de proveedor usando los Umbrales_de_Rotación específicos de ese proveedor (almacenados en `suppliers.optimal_min/max/alert_days`).

4.4. WHEN un proveedor no tiene Umbrales_de_Rotación configurados (valores `null` en `suppliers`), THE Sistema SHALL usar los valores por defecto: `optimal_min=7`, `optimal_max=12`, `alert_days=3`.

4.5. WHILE un proveedor está seleccionado en el selector de ProductsScreen, THE Sistema SHALL recalcular el diagnóstico de todos los productos visibles usando los umbrales del proveedor seleccionado, mostrando el resultado inmediatamente sin requerir recarga de la pantalla.

4.6. WHILE no hay proveedor seleccionado en ProductsScreen, THE Sistema SHALL aplicar la lógica de desglose descrita en 4.1 y 4.2 para cada producto individual.

### Requisito 5: Asociación producto-proveedor con fuentes múltiples

**Historia de Usuario:** Como tendero, quiero que el sistema identifique los productos de un proveedor por asignación manual, historial de compras y vinculación explícita desde el modal, para no perder visibilidad de productos sin importar cómo se creó la relación.

#### Criterios de Aceptación

5.1. WHEN el Sistema determina si un producto pertenece a un proveedor, THE Sistema SHALL considerar TRES fuentes: (1) `products.default_supplier_id`, (2) presencia del nombre del proveedor en `inventory_lots.supplier_name` con `remaining_quantity > 0`, y (3) registro en Supplier_Product_Config.

5.2. WHEN un producto tiene `default_supplier_id` igual al proveedor seleccionado, THE Sistema SHALL incluirlo en el filtro independientemente de las otras fuentes.

5.3. WHEN un producto tiene Lotes_Activos en `inventory_lots` cuyo `supplier_name` coincide (case-insensitive, sin espacios laterales) con el nombre del proveedor seleccionado, THE Sistema SHALL incluirlo en el filtro independientemente de las otras fuentes.

5.4. WHEN un producto tiene un registro en Supplier_Product_Config vinculado al proveedor seleccionado, THE Sistema SHALL incluirlo en el filtro independientemente de las otras fuentes.

5.5. THE Sistema SHALL normalizar los nombres de proveedores a minúsculas y sin espacios laterales (trim) al comparar `suppliers.name` con `inventory_lots.supplier_name`.

### Requisito 6: Migración de base de datos

**Historia de Usuario:** Como desarrollador, quiero que la base de datos soporte la nueva estructura de datos requerida, para que los productos puedan vincularse a proveedores con configuración de rotación independiente por combinación.

#### Criterios de Aceptación

6.1. THE Sistema SHALL agregar la columna `default_supplier_id` (tipo UUID, nullable, FK a `suppliers.id` con ON DELETE SET NULL) a la tabla `products`.

6.2. THE Sistema SHALL crear un índice en `products.default_supplier_id` para optimizar las consultas de filtrado por proveedor.

6.3. THE Sistema SHALL agregar las columnas `optimal_min` (integer, nullable), `optimal_max` (integer, nullable) y `alert_days` (integer, nullable) a la tabla `suppliers`.

6.4. THE Sistema SHALL crear la tabla `supplier_product_config` con las columnas: `id` (UUID, PK), `supplier_id` (UUID, FK a `suppliers.id`, NOT NULL, ON DELETE CASCADE), `product_id` (UUID, FK a `products.id`, NOT NULL, ON DELETE CASCADE), `created_at` (timestamptz, default now()).

6.5. THE Sistema SHALL crear un índice único compuesto en `supplier_product_config(supplier_id, product_id)` para evitar duplicados y optimizar consultas.

6.6. WHEN un proveedor es eliminado de la tabla `suppliers`, THE Sistema SHALL establecer `products.default_supplier_id` en `null` para los productos que lo referenciaban (ON DELETE SET NULL) y eliminar los registros correspondientes en `supplier_product_config` (ON DELETE CASCADE).

6.7. WHEN un producto es eliminado de la tabla `products`, THE Sistema SHALL eliminar los registros correspondientes en `supplier_product_config` (ON DELETE CASCADE).

### Requisito 7: Eliminación de dependencia de categoría para diagnóstico

**Historia de Usuario:** Como tendero, quiero que el diagnóstico de salud dependa exclusivamente de los umbrales del proveedor (o valores por defecto), para tener un modelo de configuración simple y consistente basado en mis proveedores reales.

#### Criterios de Aceptación

7.1. THE Sistema SHALL calcular el Diagnóstico_de_Salud usando exclusivamente los Umbrales_de_Rotación del proveedor correspondiente, sin consultar `categories.optimal_min`, `categories.optimal_max` ni `categories.alert_days`.

7.2. WHEN un proveedor no tiene umbrales configurados (valores `null`), THE Sistema SHALL usar los valores por defecto (`optimal_min=7`, `optimal_max=12`, `alert_days=3`) sin recurrir a la categoría como fallback.

7.3. THE Sistema SHALL preservar los datos existentes en `categories.optimal_min`, `categories.optimal_max` y `categories.alert_days` sin eliminarlos de la base de datos, pero no los utilizará en ningún cálculo de diagnóstico.

7.4. WHEN el Tendero accede a ProductsScreen sin proveedor seleccionado y un producto no tiene proveedor asociado por ninguna fuente, THE Sistema SHALL calcular el Diagnóstico_de_Salud con los valores por defecto (`optimal_min=7`, `optimal_max=12`, `alert_days=3`).
