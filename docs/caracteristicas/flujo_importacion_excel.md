# Importación Masiva de Productos desde Excel

Librería: `lib/excelParser.ts`  
Hook: `hooks/useBulkUpload.ts`  
Acceso: Panel de Productos → "Importar desde Excel"

Permite crear múltiples productos de una sola vez subiendo un archivo `.xlsx`. El flujo tiene **3 pasos** lineales: Upload → Preview → Result.

---

## Plantilla Excel

Antes de importar, el usuario descarga la plantilla oficial desde la misma pantalla. Se genera dinámicamente con `generateTemplate()` usando la librería **ExcelJS**.

### Columnas de la plantilla

| Columna | Encabezado en Excel | Obligatorio | Notas |
|---|---|---|---|
| Nombre | `Nombre` | ✅ Sí | Texto libre. Primera letra se capitaliza. |
| Categoría | `Categoría` | ✅ Sí | Si no existe, se crea automáticamente al importar. |
| Tipo | `Tipo` | ❌ No | `producto` o `servicio`. Defecto: `producto`. Dropdown en Excel. |
| Precio venta | `Precio_venta` | ❌ No | Defecto: `0`. |
| Costo | `Costo` | ✅ Para productos | No obligatorio para servicios (`tipo = servicio`). |
| Stock inicial | `Stock_inicial` | ❌ No | Vacío = `null` (sin stock). |
| Unidad venta | `Unidad_venta` | ❌ No | Defecto: `Unidad`. Dropdown con unidades válidas. |
| Código de barras | `Codigo de barras` | ❌ No | EAN/UPC del producto. |

### Hojas incluidas en la plantilla
- **Productos**: hoja principal de datos con dropdowns de validación para Tipo y Unidad.
- **Instrucciones**: descripción de cada campo.
- **Categorías** *(solo si el negocio ya tiene categorías)*: lista de las categorías existentes como referencia.

La plantilla soporta hasta **500 filas** de datos con validación inline.

---

## Unidades Válidas

El Excel valida la columna `Unidad_venta` contra esta lista:

```
Unidad, Kilogramos, Libras, Gramos, Onzas, Arrobas, Litros, Mililitros, Galones, Metros
```

Si el archivo trae una unidad fuera de esta lista, la fila se marca como error: `Unidad "X" no válida. Ver hoja "Unidades".`

---

## Normalización de Encabezados (`COLUMN_MAP`)

El parser acepta variantes de los nombres de columna (con o sin tildes, con espacio o guión bajo). Ejemplos:

| Excel puede tener... | Se mapea a |
|---|---|
| `nombre` | `name` |
| `categoría` / `categoria` | `category` |
| `precio_venta` / `precio venta` / `precio` | `price` |
| `stock_inicial` / `stock inicial` / `stock` | `stock` |
| `barcode` / `codigo_barras` / `código de barras` | `barcode` |

Solo se procesa la **primera hoja** del workbook.

---

## Paso 1 — Upload y Parsing

Al subir el archivo, `handleParseFile()` ejecuta en paralelo:
1. `fetchExistingData()` — carga categorías y nombres de productos activos del negocio desde Supabase.
2. `parseExcelFile(file)` — lee el Excel y construye el array de `ParsedProductRow`.

**Detección de duplicados:** tras el parsing, se filtran las filas cuyo nombre (normalizado: sin tildes, lowercase, sin espacios extra) ya exista en `products` del negocio. Estas filas se descartan completamente — no aparecen en la preview. El conteo de eliminadas se muestra en el resumen.

La normalización usa:
```ts
s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
```

---

## Paso 2 — Preview

Muestra la tabla de filas parseadas. Cada fila tiene:
- Número de fila (referencia al Excel original, desde fila 2).
- Datos interpretados: nombre, categoría, tipo, precio, costo, stock, unidad, barcode.
- Lista de errores de validación (si los hay).
- Toggle `includeInImport` — permite al usuario excluir filas válidas que no quiere importar.

**Filas con errores no se pueden importar** (filtradas en `handleImport`). Aparecen en la preview pero marcadas como inválidas.

---

## Paso 3 — Importación (`handleImport`)

Solo procesa filas con `errors.length === 0` Y `includeInImport === true`.

### Secuencia de operaciones

**A. Categorías nuevas:**
Para cada categoría del Excel que no exista en la DB, hace un `INSERT` individual en `categories`. Construye un `Map` de `nombre_normalizado → id` para usar en los productos.

> [!IMPORTANT]
> Las categorías se crean **una por una** en loop, no en batch. Si hay muchas categorías nuevas, esto puede ser lento.

**B. Productos (batch):**
`INSERT` masivo en `products` con todos los productos de una sola vez:
```ts
supabase.from('products').insert(productsToInsert).select('id, stock, cost')
```

Valores fijos que se asignan a todos los productos importados:
- `is_active: true`
- `is_for_sale: true`
- `nicknames: []`
- `description`: `'Servicio'` o `'Producto para venta'` según tipo.
- `image_url`: no se importa — queda `null`.

**C. Lotes iniciales:**
Por cada producto insertado con `stock > 0`, crea un registro en `inventory_lots`:
```ts
{ initial_quantity: stock, remaining_quantity: stock, unit_cost: cost, notes: 'Stock inicial desde importación excel' }
```
Esto es equivalente a lo que hace [`flujo_creacion_productos.md`](./flujo_creacion_productos.md) al crear un producto individualmente.

### Resultado final

| Métrica | Fuente |
|---|---|
| `created` | `insertedData.length` (productos insertados con éxito) |
| `skipped` | Filas con `includeInImport: false` (excluidas manualmente) |
| `errors` | `rowsToImport.length` si hubo `insertError`, 0 si no |
| `newCategories` | Nombres de categorías creadas durante la importación |

---

## Tablas de Supabase Involucradas

| Tabla | Operación | Cuándo |
|---|---|---|
| `categories` | SELECT | Al cargar la preview (fetchExistingData) |
| `categories` | INSERT | Por cada categoría nueva en el Excel |
| `products` | SELECT | Para detección de duplicados |
| `products` | INSERT batch | Al confirmar la importación |
| `inventory_lots` | INSERT batch | Por cada producto con stock > 0 |

---

## Inconsistencias Detectadas

> [!WARNING]
> **El conteo de `errors` en el resultado es binario**: si `insertError` existe, se reportan TODOS los productos del batch como fallidos (`errors = rowsToImport.length`). Supabase hace el insert en batch — si un producto falla, el insert completo puede fallar dependiendo de las políticas RLS/constraints. No hay rollback ni reintento por fila.

> [!NOTE]
> **`existingProductNames` puede estar vacío en el primer parse**: `handleParseFile` llama a `fetchExistingData()` pero luego verifica `existingProductNames.length > 0` para decidir si hace una segunda query. Dado que `fetchExistingData` es asíncrono y el estado se actualiza de forma asíncrona, `existingProductNames` puede estar vacío en el primer ciclo, forzando una segunda query dentro del mismo `handleParseFile`. El resultado es correcto pero hay una query duplicada potencial.

> [!NOTE]
> **Sin soporte para imágenes**: el flujo de importación no importa imágenes. Los productos quedan sin imagen y deben editarse individualmente para agregarla.

> [!NOTE]
> **Sin soporte para apodos ni unidades de compra**: los campos `nicknames` siempre quedan vacíos y `product_purchase_units` no se crea. Si se necesitan, deben configurarse editando cada producto post-importación.
