# Documento de Diseño: Cambiar Tipo de Producto en Edición

## Overview

Habilitar el cambio de tipo de producto en el formulario de edición, reemplazando el `<input readOnly>` actual por un `<select>` interactivo con tres opciones. Al cambiar el tipo, se muestra un modal de advertencia con consecuencias genéricas. La limpieza de datos se ejecuta al guardar.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              SimpleProductScreen.tsx                      │
│  ┌────────────────┐    ┌─────────────────────────────┐  │
│  │ Select de Tipo │───▶│ TypeChangeWarningModal       │  │
│  │ (3 opciones)   │    │ (muestra consecuencias)      │  │
│  └────────────────┘    └──────────┬──────────────────┘  │
│                                   │                      │
│        Confirma ──────────────────┼───▶ pendingType      │
│                                   │     state            │
│  ┌────────────────┐               │                      │
│  │ Botón Guardar  │◀──────────────┘                      │
│  │ (handleSubmit) │                                      │
│  └───────┬────────┘                                      │
│          │                                               │
└──────────┼───────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│   executeTypeChange(productId,       │
│     fromType, toType)                │
│                                      │
│   1. Update products (type,          │
│      is_for_sale, price, barcode,    │
│      nicknames, stock)               │
│   2. Delete orphan tables:           │
│      - inventory_lots                │
│      - product_ingredients           │
│      - product_purchase_units        │
│                                      │
│   Retorna: { success, newType }      │
└──────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│   Redirección:                       │
│   - toType=processed → Processed     │
│   - toType=simple → SimpleProduct    │
└──────────────────────────────────────┘
```

## Components and Interfaces

### 1. TypeChangeWarningModal

Nuevo componente en `components/TypeChangeWarningModal.tsx`.

```typescript
interface TypeChangeWarningModalProps {
  isOpen: boolean;
  fromType: 'sale' | 'insumo' | 'processed';
  toType: 'sale' | 'insumo' | 'processed';
  onConfirm: () => void;
  onCancel: () => void;
}
```

Responsabilidades:
- Renderizar un modal con título, lista de consecuencias y botones Cancelar/Confirmar.
- El contenido del modal se determina con una función pura `getTypeChangeWarnings(fromType, toType)` que retorna un array de strings con las consecuencias.

### 2. getTypeChangeWarnings (función pura)

En `lib/productTypeChange.ts`:

```typescript
type ProductTypeKey = 'sale' | 'insumo' | 'processed';

const getTypeChangeWarnings = (from: ProductTypeKey, to: ProductTypeKey): string[] => {
  const key = `${from}_to_${to}`;
  const warnings: Record<string, string[]> = {
    sale_to_processed: [
      'Se eliminará el stock (pasará a null)',
      'Se eliminarán los lotes de inventario (FIFO)',
      'Se eliminarán las unidades de compra',
      'Se desvinculará el código de barras',
      'Las ventas anteriores NO se pierden',
    ],
    sale_to_insumo: [
      'Se ocultarán precio, código de barras y apodos',
      'El precio pasará a $0',
      'Se conserva stock, costo, categoría e imagen',
    ],
    processed_to_sale: [
      'Se eliminarán los ingredientes de la receta',
      'Deberás asignar stock manualmente',
      'Las ventas anteriores NO se pierden',
    ],
    processed_to_insumo: [
      'Se eliminarán los ingredientes de la receta',
      'Deberás asignar stock manualmente',
      'Se ocultarán precio, código de barras y apodos',
    ],
    insumo_to_sale: [
      'Se habilitarán los campos de precio, código de barras y apodos',
      'El stock se conserva',
      'Impacto mínimo',
    ],
    insumo_to_processed: [
      'Se eliminará el stock (pasará a null)',
      'Se eliminarán los lotes de inventario',
      'Se eliminarán las unidades de compra',
      'Se redirigirá al formulario de receta',
    ],
  };
  return warnings[key] || [];
};
```

### 3. executeTypeChange (función de limpieza)

En `lib/productTypeChange.ts`:

```typescript
interface TypeChangeResult {
  success: boolean;
  error?: string;
}

const executeTypeChange = async (
  productId: string,
  fromType: ProductTypeKey,
  toType: ProductTypeKey
): Promise<TypeChangeResult> => {
  // 1. Determinar campos a actualizar en products
  const productUpdate: Record<string, any> = {};

  if (toType === 'processed') {
    productUpdate.type = 'processed';
    productUpdate.is_for_sale = true;
    productUpdate.stock = null;
    productUpdate.barcode = null;
    productUpdate.nicknames = [];
  } else if (toType === 'insumo') {
    productUpdate.type = 'simple';
    productUpdate.is_for_sale = false;
    productUpdate.price = 0;
    productUpdate.barcode = null;
    productUpdate.nicknames = [];
  } else { // sale
    productUpdate.type = 'simple';
    productUpdate.is_for_sale = true;
  }

  // 2. Update product
  const { error: updateError } = await supabase
    .from('products')
    .update(productUpdate)
    .eq('id', productId);

  if (updateError) return { success: false, error: updateError.message };

  // 3. Limpiar datos huérfanos según dirección
  if (toType === 'processed') {
    // Eliminar lotes e unidades de compra
    await supabase.from('inventory_lots').delete().eq('product_id', productId);
    await supabase.from('product_purchase_units').delete().eq('product_id', productId);
  }

  if (fromType === 'processed') {
    // Eliminar ingredientes de la receta
    await supabase.from('product_ingredients').delete().eq('product_id', productId);
  }

  if (fromType === 'insumo' && toType === 'processed') {
    // Insumo también tiene lotes y unidades de compra que limpiar
    await supabase.from('inventory_lots').delete().eq('product_id', productId);
    await supabase.from('product_purchase_units').delete().eq('product_id', productId);
  }

  return { success: true };
};
```

### 4. Modificaciones a SimpleProductScreen.tsx

Cambios en el formulario de edición:

1. **Reemplazar el `<input readOnly>`** por un `<select>` con las 3 opciones cuando `productToEdit` existe.
2. **Nuevo estado**: `pendingTypeChange: ProductTypeKey | null` — almacena el tipo destino pendiente de confirmar.
3. **Nuevo estado**: `showTypeChangeModal: boolean`.
4. **Modificar `handleTypeChange`**: En modo edición, en lugar de cambiar `isForSale` directamente, abre el modal.
5. **Modificar `handleSubmit`**: Si `pendingTypeChange` está definido, ejecutar `executeTypeChange` antes del update normal y luego redirigir.

### 5. Lógica de redirección post-guardado

```typescript
// Dentro de handleSubmit, después de executeTypeChange exitoso:
if (pendingTypeChange === 'processed') {
  // Redirigir a ProcessedProductScreen con el producto actualizado
  onNavigate(Screen.CREATE_PRODUCT_PROCESSED, { productToEdit: updatedProduct });
} else {
  // Para sale/insumo, refrescar el formulario actual
  onNavigate(originScreen ?? Screen.PRODUCTS);
}
```

## Data Models

No se crean tablas ni columnas nuevas. Se utilizan las existentes:

| Tabla | Acción según cambio |
|-------|-------------------|
| `products` | UPDATE type, is_for_sale, stock, price, barcode, nicknames |
| `inventory_lots` | DELETE cuando destino es 'processed' |
| `product_purchase_units` | DELETE cuando destino es 'processed' |
| `product_ingredients` | DELETE cuando origen es 'processed' |
| `order_items` | NUNCA se modifica |

## Error Handling

- IF la actualización de `products` falla, THEN retornar error sin ejecutar eliminaciones de datos huérfanos.
- IF una eliminación de datos huérfanos falla, THEN mostrar toast de advertencia pero considerar el cambio de tipo como exitoso (los datos huérfanos son "bonus" de limpieza, no bloquean).
- IF el usuario no tiene permisos RLS, THEN mostrar toast "No tienes permiso para modificar este producto".

## Correctness Properties

*Una propiedad es una característica o comportamiento que debe cumplirse en todas las ejecuciones válidas del sistema — esencialmente, una declaración formal sobre lo que el sistema debe hacer.*

### Property 1: Cancelar modal preserva estado original

*Para cualquier* tipo original y tipo destino diferente seleccionado, si el usuario cancela el modal de advertencia, el selector debe volver al tipo original y ningún dato del producto debe modificarse.

**Validates: Requirements 1.3**

### Property 2: Warnings cubren todas las direcciones de cambio

*Para cualquier* par (fromType, toType) donde fromType ≠ toType y ambos pertenecen a {'sale', 'insumo', 'processed'}, la función getTypeChangeWarnings debe retornar un array no vacío de strings.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

### Property 3: Limpieza a Receta elimina stock y datos asociados

*Para cualquier* producto con stock, lotes o unidades de compra que cambie a tipo Receta, después de ejecutar executeTypeChange el producto debe tener stock=null, y sus registros en inventory_lots y product_purchase_units deben estar eliminados.

**Validates: Requirements 3.1**

### Property 4: Limpieza a Insumo establece precio cero y limpia campos de venta

*Para cualquier* producto que cambie a tipo Insumo, después de ejecutar executeTypeChange el producto debe tener price=0, barcode=null y nicknames=[].

**Validates: Requirements 3.2**

### Property 5: Limpieza desde Receta elimina ingredientes

*Para cualquier* producto de tipo Receta con ingredientes asociados que cambie a otro tipo, después de ejecutar executeTypeChange los registros en product_ingredients del producto deben estar eliminados.

**Validates: Requirements 3.3**

### Property 6: Ventas históricas son inmutables ante cambio de tipo

*Para cualquier* producto con ventas históricas (order_items) que sufra un cambio de tipo, los registros en order_items que referencian ese producto deben permanecer sin modificación alguna.

**Validates: Requirements 3.4**

## Testing Strategy

La verificación de esta funcionalidad se apoya en dos capas complementarias: pruebas manuales del flujo de UI y pruebas de propiedades sobre las funciones puras del módulo `lib/productTypeChange.ts`.

**Verificación manual (obligatoria)**: se debe ejecutar el flujo completo para las seis direcciones posibles de cambio (`sale ↔ insumo`, `sale ↔ processed`, `insumo ↔ processed`) sobre productos que tengan lotes, unidades de compra, ingredientes o ventas históricas según corresponda. Para cada dirección se valida: (a) que el modal muestre las consecuencias correctas, (b) que Cancelar restaure el selector al tipo original sin tocar la base de datos, (c) que Confirmar + Guardar aplique la limpieza esperada y respete las ventas históricas en `order_items`, y (d) que la redirección post-guardado apunte a la pantalla correcta (`ProcessedProductScreen` cuando el destino es Receta, `SimpleProductScreen` o pantalla origen en el resto de casos).

**Pruebas de propiedades (opcionales, marcadas con `*` en tasks)**: cubren las funciones puras `getTypeChangeWarnings` y la lógica de construcción del objeto `productUpdate` dentro de `executeTypeChange`. Se valida que para cualquier par `(fromType, toType)` con tipos distintos la función de warnings retorne un array no vacío (Propiedad 2), y que las transformaciones de campos (`price=0` al pasar a Insumo, `stock=null` al pasar a Receta, `barcode=null` y `nicknames=[]` según destino) se apliquen de forma determinística (Propiedades 3 y 4). Las propiedades sobre efectos en Supabase (Propiedades 5 y 6) se validan de forma manual con datos de prueba, ya que dependen de RLS y de la base real.
