# Requirements Document

## Introduction

Esta funcionalidad, **Cambiar Tipo de Producto en Edición**, permite que el usuario cambie el tipo de un producto existente (Producto para venta, Insumo, Receta) desde el formulario de edición. El sistema muestra un modal de advertencia con las consecuencias del cambio antes de proceder, y ejecuta la conversión y limpieza de datos al guardar.

## Glossary

- **Sistema**: La aplicación Bistro POS (frontend React + backend Supabase)
- **Producto Simple de Venta**: Producto con type='simple' e is_for_sale=true. Tiene precio, stock, barcode y apodos.
- **Insumo**: Producto con type='simple' e is_for_sale=false. No se vende directamente; no tiene precio, barcode ni apodos visibles.
- **Receta**: Producto con type='processed'. Calcula su costo a partir de ingredientes (product_ingredients). No tiene stock propio.
- **Modal de Advertencia**: Diálogo que informa al usuario las consecuencias de cambiar el tipo antes de confirmar.
- **Datos Huérfanos**: Datos que pierden sentido tras el cambio de tipo (inventory_lots, product_ingredients, product_purchase_units, barcode, nicknames).
- **Formulario de Edición**: Pantalla SimpleProductScreen o ProcessedProductScreen en modo edición (productToEdit presente).

## Requirements

### Requisito 1

**Historia de Usuario:** Como administrador del negocio, quiero poder cambiar el tipo de un producto existente, para reclasificar productos sin tener que eliminarlos y crearlos de nuevo.

#### Criterios de Aceptación

1.1. WHEN el usuario abre el formulario de edición de un producto, THE Sistema SHALL mostrar un selector desplegable con tres opciones: "Producto para venta", "Insumo" y "Receta", con el tipo actual preseleccionado.

1.2. WHEN el usuario selecciona un tipo diferente al actual en el selector, THE Sistema SHALL mostrar un modal de advertencia con las consecuencias específicas de esa dirección de cambio.

1.3. WHEN el usuario cancela el modal de advertencia, THE Sistema SHALL revertir el selector al tipo original sin modificar ningún dato.

1.4. WHEN el usuario confirma el modal de advertencia, THE Sistema SHALL marcar el cambio de tipo como pendiente y mantener al usuario en el formulario actual hasta que presione Guardar.

1.5. WHEN el usuario presiona Guardar con un cambio de tipo pendiente, THE Sistema SHALL actualizar type e is_for_sale en la base de datos, eliminar datos huérfanos según la dirección del cambio, y redirigir al formulario correcto.

### Requisito 2

**Historia de Usuario:** Como administrador del negocio, quiero ver las consecuencias del cambio de tipo antes de confirmarlo, para tomar una decisión informada sin perder datos accidentalmente.

#### Criterios de Aceptación

2.1. WHEN el cambio es de Producto para venta a Receta, THE Sistema SHALL advertir que se eliminará el stock, los lotes de inventario (inventory_lots), las unidades de compra (product_purchase_units) y el código de barras.

2.2. WHEN el cambio es de Producto para venta a Insumo, THE Sistema SHALL advertir que se ocultarán precio, código de barras y apodos, y que el precio pasará a 0.

2.3. WHEN el cambio es de Receta a Producto para venta, THE Sistema SHALL advertir que se eliminarán los ingredientes de la receta (product_ingredients) y que el stock deberá asignarse manualmente.

2.4. WHEN el cambio es de Receta a Insumo, THE Sistema SHALL advertir que se eliminarán los ingredientes y que el stock deberá asignarse manualmente, además de ocultar precio, barcode y apodos.

2.5. WHEN el cambio es de Insumo a Producto para venta, THE Sistema SHALL advertir que se habilitarán los campos de precio, código de barras y apodos (impacto mínimo).

2.6. WHEN el cambio es de Insumo a Receta, THE Sistema SHALL advertir que se eliminará el stock, los lotes de inventario y las unidades de compra, y que se redirigirá al formulario de receta.

### Requisito 3

**Historia de Usuario:** Como administrador del negocio, quiero que al guardar un cambio de tipo se limpien automáticamente los datos que ya no aplican, para mantener la integridad de la base de datos.

#### Criterios de Aceptación

3.1. WHEN se guarda un cambio a tipo Receta (desde cualquier origen), THE Sistema SHALL establecer stock en null, eliminar registros de inventory_lots del producto, eliminar registros de product_purchase_units del producto, y establecer barcode en null y nicknames en array vacío.

3.2. WHEN se guarda un cambio a tipo Insumo (desde cualquier origen), THE Sistema SHALL establecer price en 0, barcode en null y nicknames en array vacío.

3.3. WHEN se guarda un cambio desde Receta a otro tipo, THE Sistema SHALL eliminar los registros de product_ingredients del producto.

3.4. THE Sistema SHALL conservar las ventas históricas (order_items) sin modificación independientemente del cambio de tipo, dado que almacenan un snapshot del producto al momento de la venta.

### Requisito 4

**Historia de Usuario:** Como administrador del negocio, quiero ser redirigido automáticamente al formulario correcto tras cambiar el tipo, para continuar editando el producto sin confusión.

#### Criterios de Aceptación

4.1. WHEN se guarda un cambio de tipo a Receta, THE Sistema SHALL redirigir al usuario a ProcessedProductScreen con los datos del producto precargados.

4.2. WHEN se guarda un cambio de tipo a Producto para venta o Insumo desde Receta, THE Sistema SHALL redirigir al usuario a SimpleProductScreen con los datos del producto precargados.

4.3. WHEN se guarda un cambio entre Producto para venta e Insumo (ambos type='simple'), THE Sistema SHALL mantener al usuario en SimpleProductScreen actualizando la vista según el nuevo is_for_sale.
