# Carga Masiva de Productos desde Excel — Plan de Implementación

**Objetivo:** Permitir que un dueño de negocio suba un archivo Excel (.xlsx) para crear múltiples productos de golpe, en lugar de uno por uno.
**Arquitectura:** Procesamiento 100% en el frontend (parseo del Excel con una librería JS), validación en memoria, y luego inserción batch a Supabase. Las imágenes se manejan en una V2 posterior.
**Tech Stack:** React + TypeScript, `xlsx` (SheetJS) para parsear Excel, Supabase JS SDK (insert batch + Storage).
**Acceso:** Solo rol "Administrador".

---

## ✅ Decisiones Confirmadas

| # | Pregunta | Decisión |
|---|---|---|
| 1 | Categorías inexistentes | **Crearlas automáticamente** |
| 2 | Imágenes V1 | **Opción A:** Sin imágenes (se agregan después editando) |
| 2b | Imágenes V2 | **Opción D:** Pantalla post-importación para agregar imágenes una por una |
| 3 | Tipos de producto | Solo **`simple`** y **`service`** |
| 4 | Duplicados | **Marcar en preview** y dejar que el usuario decida (saltar o crear) |
| 5 | Plantilla descargable | **Sí**, dinámica (incluye categorías existentes si las hay) |
| 6 | Acceso | Solo **Administrador** |

---

## 📊 Análisis de la App Actual

### Estructura de `products` en Supabase
| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `business_id` | uuid | ✅ | Se inyecta automáticamente desde el perfil |
| `name` | text | ✅ | |
| `category_id` | uuid | ✅ | FK → `categories` |
| `type` | text | ✅ | `'simple'`, `'processed'`, `'service'` |
| `price` | numeric | ✅ | |
| `cost` | numeric | ✅ | |
| `stock` | numeric | ❌ | Default `NULL` |
| `unit` | text | ❌ | Default `'Und'` |
| `image_url` | text | ❌ | URL pública de Supabase Storage |
| `barcode` | text | ❌ | |
| `is_active` | bool | ❌ | Default `true` |
| `is_for_sale` | bool | ❌ | Default `true` |
| `nicknames` | text[] | ❌ | |
| `purchase_unit` | text | ❌ | |
| `conversion_factor` | numeric | ❌ | Default `1` |

### Categorías existentes
- Las categorías son creadas por cada negocio (`categories` con `business_id`).
- En el Excel, el usuario escribe el **nombre** de la categoría → se hace match con el ID existente.
- Si la categoría **no existe**, se crea automáticamente (la tabla ya asigna color e icono por defecto, no hay que configurar nada).

### Sistema de imágenes actual
- Ya existe `useStorage.ts` con bucket `product-images`.
- Ya existe `useImageUpload.ts` con cropper, compresión, etc.
- Las imágenes se guardan en: `{business_id}/{timestamp}-{random}.{ext}`.
- `image_url` almacena la URL pública completa.

---

## 🎯 Flujo V1 (Sin imágenes)

```
[Usuario accede a "Importar productos"] → [Opción: Descargar plantilla]
      ↓
[Sube archivo .xlsx/.csv] → [Parsear en frontend con SheetJS]
      ↓
[Validar filas + detectar duplicados] → [Mostrar preview en tabla]
      ↓
[Duplicados marcados en amarillo: usuario decide saltar o crear]
      ↓
[Resolver categorías: match por nombre o crear nuevas]
      ↓
[Insertar productos en batch a Supabase]
      ↓
[Mostrar resultado: X creados, Y saltados, Z errores]
```

---

## � Plantilla Excel

### Estrategia de plantilla dinámica
La plantilla se genera en el frontend según el estado del negocio:

**Usuario nuevo (sin categorías):**
- Se genera una plantilla con filas de ejemplo genéricas (Bebidas, Abarrotes, etc.)
- Una hoja secundaria "Instrucciones" explica cada columna

**Usuario existente (con categorías):**
- Se genera con las mismas filas de ejemplo
- Una hoja secundaria "Categorías" lista las categorías existentes del negocio como referencia
- El usuario puede usar las existentes o escribir nuevas (se crean automáticamente)

### Columnas de la plantilla

| nombre* | categoría* | tipo | precio_venta | costo* | stock_inicial | unidad_venta | unidad_compra | factor_conversion | código_barras | apodos |
|---|---|---|---|---|---|---|---|---|---|---|
| Coca Cola 350ml | Bebidas | producto | 3500 | 2000 | 24 | Unidad | CAJA | 24 | 7701234567890 | coca, gaseosa |
| Arroz Diana 500g | Abarrotes | producto | 4200 | 3500 | 10 | Unidad | BULTO | 25 | | arroz |
| Corte de cabello | Servicios | servicio | 15000 | 0 | | | | | | corte |

> - Campos con `*` son obligatorios.
> - `tipo`: "producto" (default) o "servicio". Si está vacío, se asume "producto".
> - `precio_venta`: Si no se especifica, se usa 0.
> - `unidad_venta`: Si no se especifica, se usa "Unidad".
> - `apodos`: Separados por coma.

---

## ✅ Checklist de Progreso

- [x] Tarea 1: Instalar dependencia `xlsx`
- [x] Tarea 2: Crear `lib/excelParser.ts`
- [x] Tarea 3: Crear `hooks/useBulkUpload.ts`
- [x] Tarea 4: Crear `screens/BulkUploadScreen.tsx`
- [x] Tarea 5: Integrar en navegación (`types.ts`, `App.tsx`, `ProductsScreen.tsx`)
- [ ] Verificación final: probar flujo completo

---

## 🏗️ Tareas de Implementación (V1)

### Tarea 1: Instalar dependencia `xlsx`
**Comando:**
```bash
npm install xlsx
```

### Tarea 2: Crear utilidad `lib/excelParser.ts`
**Archivo:** `lib/excelParser.ts`

Función pura que recibe un File y retorna datos parseados:
- Leer archivo con SheetJS
- Mapear headers en español a campos internos
- Validar campos requeridos (nombre, categoría, costo)
- Validar tipo (solo "producto" o "servicio")
- Parsear apodos (split por coma)
- Retornar: `{ rows: ParsedRow[], errors: RowError[] }`

### Tarea 3: Crear hook `hooks/useBulkUpload.ts`
**Archivo:** `hooks/useBulkUpload.ts`

Lógica de negocio:
- Recibir rows parseadas
- Consultar categorías existentes del negocio
- Consultar productos existentes (para detectar duplicados por nombre)
- Marcar filas duplicadas
- Crear categorías nuevas automáticamente
- Insertar productos en batch `.insert([...])`
- Generar plantilla dinámica `.xlsx` con SheetJS
- Retornar: `{ parseFile, rows, errors, duplicates, importing, importProducts, downloadTemplate }`

### Tarea 4: Crear pantalla `screens/BulkUploadScreen.tsx`
**Archivo:** `screens/BulkUploadScreen.tsx`

UI con 3 estados:

**Estado 1: Upload**
- Zona de drag-and-drop / seleccionar archivo
- Botón "Descargar plantilla"
- Instrucciones breves

**Estado 2: Preview**
- Tabla con las filas parseadas
- Filas con error → fondo rojo, tooltip con el error
- Filas duplicadas → fondo amarillo, checkbox para incluir/excluir
- Contador: "X listos para importar, Y con errores, Z duplicados"
- Botón "Importar X productos"
- Botón "Cancelar" para volver al Estado 1

**Estado 3: Resultado**
- Resumen: X creados, Y categorías nuevas, Z saltados
- Botón "Ir a Productos"
- (V2: Botón "Agregar imágenes a los productos importados")

### Tarea 5: Integrar en navegación
**Archivos:** `App.tsx`, `types.ts`, `screens/ProductsScreen.tsx`

- Agregar `BULK_UPLOAD` a enum `Screen` en `types.ts`
- Agregar case en `App.tsx` para renderizar `BulkUploadScreen`
- Agregar botón "Importar Excel" en `ProductsScreen.tsx` (solo visible para Administrador)

---

## 🏗️ Tareas V2 (Imágenes post-importación)

### Tarea 6: Pantalla de asignación de imágenes
- Después de importar, mostrar grid con los productos recién creados
- Cada card muestra: nombre, categoría, y zona para subir imagen
- Reutilizar `useImageUpload` existente por cada producto
- Botón "Listo" cuando termine

---

## 📅 Estimación

| Fase | Tareas | Esfuerzo |
|---|---|---|
| V1: Excel sin imágenes | Tareas 1-5 | ~4-6 horas |
| V2: Imágenes post-importación | Tarea 6 | ~2-3 horas |

---

## 🔒 Consideraciones de Seguridad

- Validar que el `business_id` sea siempre el del usuario autenticado
- Limitar tamaño del archivo Excel (máx 500 filas, 2MB)
- Sanitizar todos los strings del Excel antes de insertar
- RLS en Supabase ya protege las inserciones por `business_id`
- Verificar rol "Administrador" antes de mostrar la funcionalidad
