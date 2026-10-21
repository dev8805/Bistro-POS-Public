# Foto Lista de Compras (OCR) — Plan de Implementación

**Objetivo:** Permitir tomar o cargar fotos de listas de compras escritas a mano, extraer texto con Google Gemini Vision, comparar con los nicknames/nombres de productos, y generar una orden unificada.

**Arquitectura:** Frontend captura/carga imagen → convierte a base64 → llama a Edge Function en Supabase → Edge Function envía a Gemini API (vision + parsing) → devuelve items parseados → frontend hace matching local contra productos (por `nicknames[]` y `name`) → usuario revisa/confirma → items se agregan al carrito.

**Tech Stack:** React + TypeScript, Supabase Edge Functions (Deno), Google Gemini API (`gemini-3-flash-preview`), HTML5 Camera API.

---

## Pre-requisito: Limpieza de Mistral

La Edge Function `ocr-scan` actualmente usa Mistral. Se va a **reemplazar** con Gemini.

### Tarea 0: Eliminar Edge Function `ocr-scan` (Mistral)

**Archivos:**
- Delete contenido de: `supabase/functions/ocr-scan/` (se sobreescribirá)

**Paso 1:** Redesplegar la función `ocr-scan` con Gemini (Tarea 2). No es necesario borrar la función, solo redesplegar con el nuevo código.

---

## Tarea 1: Agregar variable de entorno para Gemini API Key

**Archivos:**
- Modify: `.env` (agregar `VITE_GEMINI_API_KEY`)
- Nota: La API key de Gemini también debe configurarse como secret en Supabase para la Edge Function.

**Paso 1: Agregar variable al .env local**
```
VITE_GEMINI_API_KEY=AIzaSyD0LvTT9IV8vTFKF1uqmrspfdI7oYO2u0M
```

**Paso 2: Configurar secret en Supabase**
```bash
npx supabase secrets set GEMINI_API_KEY=AIzaSyD0LvTT9IV8vTFKF1uqmrspfdI7oYO2u0M --project-ref hjjmwipqquynjopkswvu
```

---

## Tarea 2: Redesplegar Edge Function `ocr-scan` con Google Gemini

**Archivos:**
- Overwrite: `supabase/functions/ocr-scan/index.ts`

**Arquitectura de la función:**
1. Recibe `{ imageBase64, mimeType }` via POST
2. Llama a `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
3. Usa **un solo llamado** (vision + parsing en un prompt): envía la imagen inline y pide extraer items como JSON
4. Retorna `{ items: [{ name: string, quantity: number }] }`

**Prompt de Gemini:**
```
Analiza esta imagen de una lista de compras escrita a mano o impresa. 
Extrae TODOS los productos y sus cantidades.

REGLAS:
1. La lista puede tener columnas: CANTIDAD y PRODUCTO
2. Si no hay número, la cantidad es 1
3. Los nombres pueden estar abreviados o tener errores ortográficos - extráelos TAL CUAL aparecen
4. Ignora encabezados, borrones o texto no relacionado con productos

Responde ÚNICAMENTE con JSON válido (sin markdown, sin explicaciones):
{"items": [{"name": "nombre del producto", "quantity": 1}]}
```

**Ventaja sobre Mistral:** Gemini Vision procesa la imagen directamente (1 sola llamada API vs 2 de Mistral OCR + Chat). Más rápido y simple.

---

## Tarea 3: Crear hook `usePhotoOrder`

**Archivos:**
- Create: `hooks/usePhotoOrder.ts`

**Responsabilidades:**
1. `captureAndProcess(imageBase64, mimeType)` → llama Edge Function → retorna items crudos
2. `matchProducts(rawItems, products)` → algoritmo de matching que compara cada item extraído contra:
   - `product.nicknames[]` (coincidencia exacta case-insensitive)
   - `product.name` (coincidencia parcial/fuzzy)
   - Resultado: `{ matched: MatchedItem[], unmatched: string[] }`
3. Estado interno: `isProcessing`, `error`, `rawItems`, `matchedItems`

**Interfaz de tipos:**
```typescript
interface RawOCRItem {
  name: string;
  quantity: number;
}

interface MatchedItem {
  ocrName: string;        // texto original del OCR
  product: Product;       // producto encontrado en la BD
  quantity: number;       // cantidad extraída
  confidence: 'exact' | 'partial'; // tipo de match
}

interface PhotoOrderResult {
  matched: MatchedItem[];
  unmatched: RawOCRItem[];  // items que no encontraron match
}
```

**Algoritmo de matching (prioridad):**
1. **Coincidencia exacta por nickname**: `product.nicknames.some(n => n.toLowerCase() === ocrName.toLowerCase())`
2. **Nickname contiene OCR o viceversa**: `includes()` bidireccional
3. **Nombre del producto contiene OCR**: `product.name.toLowerCase().includes(ocrName.toLowerCase())`
4. Si no hay match → va a `unmatched[]`

---

## Tarea 4: Crear pantalla `PhotoOrderScreen.tsx`

**Archivos:**
- Create: `screens/PhotoOrderScreen.tsx`

**UI - 3 estados principales:**

### Estado 1: Captura (pantalla inicial)
- Botón grande "Tomar Foto" (abre cámara via `<input type="file" capture="environment">`)
- Botón grande "Cargar Imagen" (abre galería via `<input type="file" accept="image/*">`)
- Icono de cámara grande centrado
- Texto explicativo: "Fotografía una lista de compras escrita a mano para agregarla automáticamente a una orden"

### Estado 2: Procesando
- Preview de la imagen capturada
- Spinner/animación de carga
- Texto: "Analizando lista de compras..."

### Estado 3: Resultados (revisión)
- **Sección "Productos Encontrados"** (verde): lista de items matched con qty, precio, total
  - Cada item tiene botón - y + para ajustar cantidad
  - Checkbox para incluir/excluir
- **Sección "No Reconocidos"** (amarillo): items sin match
  - Cada item tiene un selector manual para asignar un producto del catálogo
  - O botón para descartarlos
- **Botón "Agregar al Carrito"**: agrega todos los items seleccionados al carrito actual
- **Botón "Escanear Otra"**: volver a Estado 1 (acumular items de múltiples fotos)
- **Botón "Cancelar"**: cerrar pantalla

**Props:**
```typescript
interface PhotoOrderScreenProps {
  products: Product[];
  onAddItems: (items: { product: Product; quantity: number }[]) => void;
  onClose: () => void;
}
```

---

## Tarea 5: Integrar en la navegación

**Archivos:**
- Modify: `types.ts` — agregar `PHOTO_ORDER` al enum `Screen`
- Modify: `components/MobileNavBar.tsx` — agregar botón de cámara
- Modify: `screens/SellScreen.tsx` — agregar botón de cámara en header desktop
- Modify: `App.tsx` — renderizar `PhotoOrderScreen` + routing + `handlePhotoOrderAdd`

### 5.1 types.ts
```typescript
// Agregar al enum Screen:
PHOTO_ORDER = 'PHOTO_ORDER'
```

### 5.2 MobileNavBar.tsx
Agregar un botón con ícono de cámara entre "Orden" y el último botón:
```tsx
<button
    onClick={() => onNavigate(Screen.PHOTO_ORDER)}
    className="flex-none flex items-center justify-center w-11 h-11 rounded-full bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
    aria-label="Escanear lista de compras"
    tabIndex={0}
>
    <span className="material-symbols-outlined text-[22px]">photo_camera</span>
</button>
```

**Props nuevas:** ya recibe `onNavigate`, no necesita nuevas props.

### 5.3 SellScreen.tsx (header desktop)
Agregar botón de cámara en el header desktop, al lado de las tabs existentes:
```tsx
<button
    onClick={() => onNavigate(Screen.PHOTO_ORDER)}
    className="h-10 px-4 flex items-center gap-2 font-bold text-sm rounded-xl transition-colors border bg-blue-50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-900/30 hover:bg-blue-100"
    aria-label="Escanear lista de compras"
    tabIndex={0}
>
    <span className="material-symbols-outlined text-[20px]">photo_camera</span>
    <span>Escanear</span>
</button>
```

### 5.4 App.tsx
- Importar `PhotoOrderScreen`
- En el switch de renderizado, agregar case para `Screen.PHOTO_ORDER`
- Crear `handlePhotoOrderAdd` que recibe items y los agrega al carrito usando el spread del carrito existente (modo local/quick order)
- La pantalla se abrirá como overlay fullscreen (similar a `SuccessScreen`)

```tsx
// En el renderizado:
{currentScreen === Screen.PHOTO_ORDER && (
  <PhotoOrderScreen
    products={products}
    onAddItems={handlePhotoOrderAdd}
    onClose={() => handleNavigate(Screen.SELL)}
  />
)}
```

```typescript
const handlePhotoOrderAdd = (items: { product: Product; quantity: number }[]) => {
  // Agregar cada item al carrito como si fuera un quick add
  items.forEach(({ product, quantity }) => {
    handleAddToOrder(product, quantity, [], '', '');
  });
  // Navegar a la pantalla de orden para que vea el carrito
  handleSellScreenTabSwitch('orden_rapida');
  setCurrentScreen(Screen.QUICK_ORDER);
  showToast(`${items.length} productos agregados al carrito`);
};
```

---

## Tarea 6: Testing manual

**Verificaciones:**
1. ✅ Tomar foto desde móvil → se procesa → muestra resultados
2. ✅ Cargar foto desde galería → se procesa → muestra resultados
3. ✅ Matching por nickname funciona (probar con productos que tienen apodos configurados)
4. ✅ Matching por nombre funciona
5. ✅ Items no reconocidos se pueden asignar manualmente
6. ✅ "Agregar al Carrito" agrega correctamente al carrito
7. ✅ "Escanear Otra" permite acumular items de múltiples fotos
8. ✅ Botón de cámara visible en footer mobile y header desktop
9. ✅ No afecta ninguna funcionalidad existente (ventas, mesas, gastos, etc.)

---

## Resumen de Archivos

| Acción | Archivo | Descripción |
|--------|---------|-------------|
| Modify | `.env` | Agregar `VITE_GEMINI_API_KEY` |
| Overwrite | `supabase/functions/ocr-scan/index.ts` | Reescribir con Gemini |
| Create | `hooks/usePhotoOrder.ts` | Hook con lógica OCR + matching |
| Create | `screens/PhotoOrderScreen.tsx` | UI de captura, procesamiento y revisión |
| Modify | `types.ts` | Agregar `PHOTO_ORDER` al Screen enum |
| Modify | `components/MobileNavBar.tsx` | Botón cámara en footer mobile |
| Modify | `screens/SellScreen.tsx` | Botón cámara en header desktop |
| Modify | `App.tsx` | Routing + `handlePhotoOrderAdd` |

---

## Decisiones de Diseño

1. **¿Por qué Edge Function y no llamar Gemini directo desde el frontend?**
   - Seguridad: la API key de Gemini no se expone al cliente
   - La función ya existe (`ocr-scan`), solo la reemplazamos

2. **¿Por qué matching local en vez de en la Edge Function?**
   - Los productos ya están cargados en memoria en el frontend (`products[]`)
   - Evita pasar la lista completa de productos a la Edge Function
   - Matching local es instantáneo

3. **¿Por qué un solo llamado a Gemini?**
   - `gemini-2.0-flash` es multimodal (vision + texto)
   - Un solo request extrae texto Y parsea a JSON
   - vs Mistral que necesitaba 2 llamadas (OCR + Chat)

4. **¿Por qué no crear un `SellTab` nuevo tipo `foto_orden`?**
   - La funcionalidad de foto no es un "tab" persistente como mesas u orden
   - Es una acción puntual: abrir → escanear → agregar → cerrar
   - Funciona mejor como pantalla independiente (`Screen.PHOTO_ORDER`)
