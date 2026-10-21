# Reglas de Formato para Guías RAG-ready

## Por qué importa el formato en este sistema

El pipeline de RAG de Bistro funciona así:
1. La guía `.md` se sube tal cual al bucket `rag-documents` desde el panel **PDF / MD** del Asistente IA (no hay paso intermedio de conversión a PDF).
2. `rag-index` descarga el archivo, lee el texto markdown directamente y lo divide en chunks de **1200 caracteres** con overlap de 150. El chunking respeta code points completos, así que emojis y caracteres multibyte nunca se parten a la mitad.
3. Cada chunk se vectoriza con `gemini-embedding-2` y se almacena en Pinecone con metadata `source`, `source_type='markdown'`, `storage_path`.
4. Cuando el usuario pregunta, Gemini recupera los chunks más relevantes y genera la respuesta.
5. La respuesta se muestra en el chat con `whitespace-pre-wrap` (texto plano con saltos de línea).

**Conclusión:** El formato de la guía → estructura del chunk → calidad de la respuesta. Como el `.md` llega a Pinecone sin pasar por OCR, los `**`, `##`, listas `1.` y blockquotes `>` quedan **literales** en el chunk — Gemini los usa como señales semánticas al razonar sobre el contenido.

---

## Símbolos y elementos que funcionan bien

### En el chat (lo que el usuario final ve)

⚠️ **Importante:** El chat usa `ReactMarkdown` + `remarkGfm` con `prose` de Tailwind. Renderiza **markdown completo** con estilos limpios. Esto es muy distinto a la versión antigua de texto plano.

Todos estos elementos se renderizan visualmente en el chat:

```
✅ # H1 / ## H2 / ### H3       → títulos con jerarquía de color (slate / indigo / sky)
✅ **negrita**                  → font-semibold, peso visual sin color
✅ Listas numeradas  1. 2. 3.   → renderizadas con sangría y espaciado correcto
✅ Guiones de lista  - item     → renderizadas como bullets
✅ | Tablas GFM |               → renderizadas con header gris claro y filas
✅ > Blockquote                 → fondo sky-50 con borde izquierdo azul (tips/info)
✅ `código inline`              → chip gris con borde — IDEAL para botones [ Crear ]
✅ ```bloque de código```       → fondo slate-900 oscuro — IDEAL para mockups de UI
✅ Emojis 🔍 📷 ⚠️ 💡 🔒 🤖    → nativos, sin transformación
✅ Flecha  →                    → para rutas: Módulo → Sección → Acción
✅ Caracteres de caja  ┌ ┐ │ ─  → forman cajas en monoespaciada dentro de ```bloques```
```

### Lo que sigue siendo texto literal (sin renderizado especial)

```
⚠️ *cursiva*                  → renderiza pero amber-50 italic no es vistoso en chat
⚠️ Mayúsculas IMPORTANTE      → funciona pero prefiere blockquote > ⚠️
```

**Consecuencia práctica:** la guía `.md` debe escribirse con **markdown rico**. Lo que ves
en el archivo fuente es prácticamente lo que el usuario verá en el chat — los `**`, las
tablas, los blockquotes y los bloques de código **sí se renderizan**, no aparecen como
caracteres literales.

---

## Reglas de formato en la guía fuente (.md)

### H1 — Título del documento (uno solo)
```markdown
# Cómo hacer una venta en Bistro
```
Aparece como título grande en el PDF. Gemini lo usa como contexto general del documento.

### H2 — Secciones principales
```markdown
## ¿Para qué sirve?
## Antes de empezar
## Paso a paso
## Errores comunes
## Preguntas frecuentes
## Recursos multimedia
```
Delimitan los chunks naturalmente. Gemini entiende el cambio de tema.

### H3 — Subsecciones (solo si hay variantes)
```markdown
### En computador
### En celular o tablet
### Crear un producto físico
### Crear un servicio
```
Usar solo cuando el mismo flujo varía según dispositivo, rol o tipo de objeto.

### Negritas — para nombres de UI y términos clave
```markdown
Toca el botón **Finalizar Venta**.
Ve a **Punto de Venta** → **Vender**.
El campo **Efectivo recibido** calcula el cambio solo.
Selecciona **Pago Mixto** para dividir entre dos métodos.
```
Regla: si aparece en un botón, menú, pantalla o campo de la app → va en negrita,
con la capitalización exacta de la interfaz.

```
✅  Toca **Finalizar Venta**        (capitalización exacta)
✅  Ve al módulo **Inventario**
✅  El campo **Costo** es obligatorio
❌  Toca "finalizar venta"          (minúsculas — no coincide con la UI)
❌  Ve a inventario                 (sin negrita — Gemini no lo resaltará)
```

### Listas numeradas — pasos secuenciales
Obligatorias para cualquier flujo con orden. Gemini las reproduce tal cual en la respuesta:
```markdown
1. Abre el módulo **Punto de Venta** desde el menú lateral.
2. Busca el producto por nombre o escanea el código de barras con la pistola.
3. En el panel derecho, elige el método de pago: **Efectivo**, **Nequi** o **Daviplata**.
4. Toca **Finalizar Venta** para registrar la transacción.
```

### Listas de viñetas — requisitos y opciones sin orden
```markdown
- El producto debe estar registrado en **Productos**.
- Si la venta es a crédito, el cliente debe existir en **Cuentas por Cobrar**.
- Debes tener un turno de **Caja** abierto si quieres que el efectivo entre a caja.
```

### Rutas de navegación — con flecha →
```markdown
Ve a **Productos** → **Crear +** → **Crear Producto**.
Abre **Cuentas por Cobrar** → selecciona el cliente → toca **Registrar Abono**.
```

### Blockquotes — consejos y advertencias importantes
```markdown
> **Consejo:** Si el cliente paga en efectivo, ingresa el monto recibido para
> que el sistema calcule el cambio automáticamente.

> **Importante:** El tipo de producto (físico o servicio) no se puede cambiar
> después de crearlo. Decide antes de guardar.
```

### Tablas — errores comunes y comparaciones
```markdown
| Situación | Qué hacer |
|-----------|-----------|
| El botón **Guardar** no responde | Verifica que Nombre, Categoría y Costo estén completos. |
| El código no encontró el producto | Escríbelo manualmente — es normal en productos locales. |
| El stock del producto ya no coincide | Ve a **Inventario** y haz un conteo de ajuste. |
```

---

## 🎨 Mockups visuales de UI — REGLA OBLIGATORIA

**Cada vez que la guía describa interacción con un componente de la interfaz (selector, dropdown, campo de búsqueda, botón, formulario, modal, lista, card, chip, toggle), DEBES replicar el componente con un mockup ASCII en un bloque de código.**

No describir con palabras lo que se puede mostrar visualmente. El operador entiende la pantalla 10 veces más rápido viendo el mockup que leyendo "toca el botón de la derecha que dice...".

### Por qué es obligatorio

1. El system prompt del RAG ahora **preserva los bloques de código verbatim** — si el mockup está en la guía, llega tal cual al chat.
2. El chat renderiza ```bloques``` con fondo oscuro tipo terminal y monoespaciada, ideal para arte ASCII.
3. Los caracteres de caja `┌ ┐ └ ┘ ─ │` y los inline code `[ Botón ]` simulan la UI real.

### Set de caracteres y patrones

#### Botones — `[ Texto ]` inline o en bloque

```markdown
Inline (dentro de prosa):
Toca `[ Crear Producto ]` para guardar.

En bloque (botón principal grande):
```
       ╔═══════════════════════╗
       ║  [ Crear Producto ]   ║
       ╚═══════════════════════╝
```

Dos botones lado a lado:
```
┌─────────────────────┐  ┌──────────────────────┐
│      Cancelar       │  │    Crear Producto    │
└─────────────────────┘  └──────────────────────┘
       gris                      ámbar
```
```

#### Dropdown / Selector — `[ Opción ▾ ]`

```markdown
Estado cerrado:
```
Categoría *
┌─────────────────────────────────────┐
│  Lácteos                        ▾  │
└─────────────────────────────────────┘
```

Estado desplegado (con opción seleccionada con ✓):
```
┌─ Categoría ─────────────────┐
│  ✓  Lácteos                 │
│     Bebidas                 │
│     Snacks                  │
│     Limpieza                │
└─────────────────────────────┘
```
```

#### Campo de texto — `[ ____________ ]`

```markdown
Vacío:
```
Nombre del producto *
┌─────────────────────────────────────┐
│                                     │
└─────────────────────────────────────┘
```

Con placeholder o valor:
```
Nombre del producto *
┌─────────────────────────────────────┐
│  Coca Cola Lata 350ml               │
└─────────────────────────────────────┘
```

Con prefijo/sufijo (típico en precio/cantidad):
```
Precio venta            Stock
┌──────────────────┐  ┌──────────────────┐
│ $ 3.500     /Und │  │      100    Und  │
└──────────────────┘  └──────────────────┘
```
```

#### Campo de búsqueda — con ícono 🔍

```markdown
```
🔍 [ Buscar producto...                    ]
```

Combinado con botón de acción:
```
┌──────────────────────────┐ ┌──────┐
│ 🔍 Buscar o nueva...     │ │ + Crear │
└──────────────────────────┘ └──────┘
```
```

#### Lista con ítems y acciones — card con ✏️ 🗑️

```markdown
```
┌────────────────────────────────────────┐
│  Caja                                  │
│  12 Unidades por caja        ✏️   🗑️  │
└────────────────────────────────────────┘
```
```

#### Modal — caja completa con título y botones

```markdown
```
   ┌──────────────────────────────────┐
   │              ✅                  │
   │     ¡Producto creado!            │
   │     ¿Qué deseas hacer ahora?     │
   │                                  │
   │  ┌────────────────────────────┐  │
   │  │   ➕  Crear otro           │  │
   │  └────────────────────────────┘  │
   │  ┌────────────────────────────┐  │
   │  │   ←   Salir                │  │
   │  └────────────────────────────┘  │
   └──────────────────────────────────┘
```
```

#### Chips / Tags — `( texto ✕ )`

```markdown
```
🏷️ Apodos
( leche ✕ )  ( alquería ✕ )  ( entera ✕ )
```
```

#### Estado vacío — caja punteada con mensaje

```markdown
```
┌───────────────────────────────────────────────┐
│  No hay unidades extra de compra configuradas │
└───────────────────────────────────────────────┘
```
```

#### Sección/Card con título y acción a la derecha

```markdown
```
📦  Unidades de Compra              [ + Añadir Unidad ]
─────────────────────────────────────────────────────
   (contenido aquí)
```
```

#### Toggle / Switch

```markdown
```
Modo offline    [ ●━━ ]  ON
Notificaciones  [ ━━○ ]  OFF
```
```

#### Tabs

```markdown
```
[ Productos ]  |  Servicios  |  Promociones
   ━━━━━━━━━
   activo
```
```

### Regla del tamaño — evitar scroll horizontal

El chat tiene **~560px de ancho** en desktop. Los bloques de código que excedan ~50 caracteres de ancho generan scroll horizontal y se ven mal.

```
✅ Líneas ≤ 50 caracteres de ancho
✅ Texto explicativo FUERA del bloque, no dentro
❌ Líneas largas con "← cuántas unidades tienes en bodega" dentro del bloque
```

### Patrón recomendado: mockup + tabla explicativa

```markdown
```
Precio venta            Costo *
┌──────────────────┐  ┌──────────────────┐
│ $ 3.500     /Und │  │ $ 2.800     /Und │
└──────────────────┘  └──────────────────┘
```

| Campo | Comportamiento |
|-------|---------------|
| 💵 **Precio venta** | `$` izquierda, `/{unidad}` derecha. Si va en `$0`, se vende sin precio. |
| 💰 **Costo** *(obligatorio > $0)* | Mismo formato. No acepta `$0`. |
```

### Cuándo NO usar mockup

- Texto puramente conceptual ("¿para qué sirve el módulo?")
- Listas de definiciones o sinónimos
- Preguntas frecuentes donde la respuesta es conceptual

### Cuándo SÍ usar mockup (obligatorio)

- ✅ Cualquier paso del flujo donde el operador interactúe con la UI
- ✅ Selectores con opciones (mostrar el dropdown desplegado)
- ✅ Formularios (mostrar los campos con sus prefijos/sufijos)
- ✅ Botones principales (mostrar con la caja ╔═╗)
- ✅ Modales y diálogos (mostrar la estructura completa)
- ✅ Estados vacíos vs estados con datos
- ✅ Confirmaciones de éxito ("¡Producto creado!")

---

## 📊 Diagramas de lógica — REGLA OBLIGATORIA (complementaria a los mockups UI)

**Cada vez que la guía explique cómo funciona algo conceptualmente (flujos en el tiempo, cálculos, decisiones, comparaciones antes/después, ciclos de vida), DEBES representarlo con un diagrama ASCII en bloque de código.**

Los mockups UI ya cubrieron "qué ve el operador". Los diagramas de lógica cubren "qué hace el sistema por dentro" — la información que es difícil de explicar con prosa cuando hay matemáticas, condiciones o secuencias.

**Importante:** una guía típica de Bistro mezcla ambas categorías. La guía de **lotes**, por ejemplo, tiene mockups del Historial de Compras (UI) **+** diagramas FIFO (lógica). La guía de **crear producto** tiene mockups del formulario (UI) **+** un diagrama del flujo de creación si fuera necesario.

### 5 patrones reutilizables

#### 🕐 Patrón 1: Timeline horizontal

Para secuencias en el tiempo o por orden de creación. Ideal para FIFO, historial cronológico, fases de un proceso.

```
Producto: Coca Cola
                                  ─── tiempo ───►
   ┌─────────┐    ┌─────────┐    ┌─────────┐
   │ LOTE A  │    │ LOTE B  │    │ LOTE C  │
   │ 10 und  │    │ 20 und  │    │ 15 und  │
   │ $1.000  │    │ $1.200  │    │ $1.100  │
   │ Mar 1   │    │ Mar 15  │    │ Apr 2   │
   └─────────┘    └─────────┘    └─────────┘
        ▲
   FIFO descuenta primero el más antiguo.
   Si se agota, continúa con el siguiente.
```

#### 🧮 Patrón 2: Bloque de cálculo

Para operaciones aritméticas con ejemplos concretos. Reemplaza prosa tipo "si el stock era −4 y se compraron 10..."

```
   Stock antes:   −4 und    (se vendió sin tener)
   + Compra:     +10 und
   ─────────────────────
   Stock final:    6 und

Lote creado:
   • Cantidad inicial:    10  ← entró físicamente
   • Cantidad disponible:  6  ← 10 − 4 pre-consumidas
```

#### 🌳 Patrón 3: Árbol de decisión

Para flujos con bifurcación SÍ/NO o condicionales. Reemplaza prosa tipo "puedes hacer X excepto cuando..."

```
   ¿Ya se vendieron unidades del lote?
          │
          ├── SÍ ─►  ❌ Bloqueado
          │          (descuadra el historial de ganancias)
          │          → Edita cantidad y costo en su lugar
          │
          └── NO ─►  ✅ Se puede eliminar libremente
```

Variante con más ramas:

```
   ¿El producto tiene stock?
          │
          ├── > 0  ──► ✅ Se vende normal
          │
          ├── = 0  ──► ⚠️ Se vende pero queda en negativo
          │
          └── < 0  ──► ⚠️ Sigue vendiendo, acumula deuda de stock
```

#### ⚖️ Patrón 4: Antes / Después

Para mostrar el efecto de una acción. Reemplaza prosa tipo "antes era X, después de la merma queda Y..."

```
ANTES de registrar merma de 5 und
   Stock total producto:  30 und
   Lote A:                10 und disponibles
   Lote B:                20 und disponibles

DESPUÉS
   Stock total producto:  25 und  ← bajó 5
   Lote A:                10 und  ← intacto
   Lote B:                20 und  ← intacto

   ⚠️ Suma de lotes (30) ≠ Stock real (25)
   La diferencia son las mermas registradas.
```

#### 🔄 Patrón 5: Ciclo de vida

Para estados secuenciales de una entidad (compra → lote activo → lote agotado, pendiente → indexado, etc.).

```
   📦 Compra registrada
           │
           ▼
   ┌─────────────────────┐
   │  Lote creado        │
   │  Inicial: 10        │
   │  Disponible: 10     │
   │  Costo: $1.000      │
   └─────────────────────┘
           │
           │  Ventas FIFO descuentan "disponible"
           ▼
   ┌─────────────────────┐
   │  Lote agotado       │
   │  Disponible: 0      │
   │  ❌ Sale del        │
   │     historial activo│
   └─────────────────────┘
```

### Combinación causa → efecto (variante del ciclo)

```
   Compra ──────► Crea lote ──────► Sube stock
                     │
                     ├─► Guarda costo unitario
                     ├─► Asocia proveedor
                     └─► Asocia fecha
```

### Cuándo SÍ usar diagrama de lógica (obligatorio)

- ✅ Cualquier operación con números o ejemplos cuantitativos (`stock + compra = total`)
- ✅ Cualquier explicación con "primero / después" o secuencia temporal
- ✅ Cualquier decisión condicional (`si X entonces Y`, `cuándo se permite`, `cuándo se bloquea`)
- ✅ Cualquier comparación de estados (`antes / después`, `con / sin`, `caso A / caso B`)
- ✅ Cualquier mención de FIFO, LIFO, promedio ponderado, descuento automático
- ✅ Ciclos de vida de entidades (lote, compra, venta, sesión, indexación)
- ✅ Relaciones causa-efecto entre acciones del usuario y reacciones del sistema

### Cuándo NO usar diagrama

- Texto puramente conceptual sin números ni decisiones ("este módulo sirve para...")
- Listas de definiciones de términos
- Sinónimos y vocabulario para el RAG

### Reglas de tamaño (igual que mockups UI)

- ✅ Líneas ≤ 50 caracteres para evitar scroll horizontal en el chat (~560px)
- ✅ Texto explicativo va FUERA del bloque, no dentro
- ✅ Caracteres de caja alineados correctamente

---

## Reglas de vocabulario para recuperación semántica

### Sinónimos en "¿Para qué sirve?" (crítico para RAG)

El sistema usa búsqueda semántica. Si el usuario pregunta con palabras distintas a las
del documento, el vector de Pinecone puede no recuperar el chunk correcto.

Solución: incluir variantes del vocabulario en la primera sección del documento:

```markdown
## ¿Para qué sirve?

Este módulo te permite registrar ventas, cobrar a clientes y emitir comprobantes.
Si quieres hacer una venta, cobrar un pedido, registrar lo que vendiste o saber
cómo cobrarle a un cliente, aquí es donde se hace todo.
```

El chatbot ahora responderá correctamente a:
- "¿cómo hago una venta?"
- "¿cómo cobro?"
- "¿cómo registro lo que vendí?"
- "¿dónde cobro a un cliente?"

### Nombres exactos de la UI siempre consistentes

Si en la app el botón dice "Finalizar Venta" (con mayúsculas), así debe estar en TODA la guía.
Inconsistencias confunden a Gemini y al usuario:

```
❌  "Finalizar venta" en un paso, "FINALIZAR VENTA" en otro, "Finalizar" en la FAQ
✅  "Finalizar Venta" en todos los pasos, errores y preguntas frecuentes
```

---

## Regla de longitud de sección — chunking óptimo

El `rag-index` divide el texto en chunks de **1200 caracteres** con overlap de 150.
Si una sección supera los 1200 chars, se parte en el medio de una instrucción.

Para evitarlo:
- Sección "Paso a paso" larga → dividir con H3 por dispositivo o caso
- Sección "Preguntas frecuentes" → máximo 5-6 preguntas, cada respuesta breve
- Sección "Errores comunes" → máximo 6 filas en la tabla

Referencia aproximada: 1200 caracteres = ~180 palabras = ~12 líneas de texto normal.

> **Nota sobre emojis:** El chunker itera por code points, así que un emoji (🔴, 🟢, 🟡)
> cuenta como **un carácter** y nunca se parte a la mitad. Puedes usarlos libremente en
> tablas y listas sin riesgo de invalidar el chunk.

---

## Multimedia opcional — cuándo y cómo sugerir

La guía es efectiva solo con texto bien formateado. El multimedia enriquece pero no es
un requisito para que el chatbot responda bien.

### Árbol de decisión (solo para la sección opcional)

```
¿El paso tiene 3-8 clicks rápidos en la UI y el resultado es visual?
  → Sugerir GIF animado
  → Herramientas para grabar: ScreenToGif (Windows), LICEcap
  → Hosting para URL pública: Giphy, Cloudinary
  → Subir en app: modal "GIF" → nombre + URL pública

¿El flujo dura más de 30 segundos o necesita explicación con voz?
  → Sugerir Video YouTube
  → Agregar timestamp ?t=XX en la URL para ir al segundo exacto
  → Subir en app: modal "Video" → nombre + URL con timestamp

¿Es una pantalla de referencia estática (formulario, panel, error)?
  → Sugerir Screenshot/Imagen (.png o .jpg)
  → Subir en app: botón "PDF / MD" → seleccionar archivo

¿Es explicación conceptual sin acciones en la UI?
  → Solo texto. No necesita media.
```

### Nombre descriptivo para el media (crítico para Gemini Vision)

El nombre en el modal de la app es el `source` que aparece en Pinecone y en el
panel de fuentes del chat. Gemini Vision lo usa como contexto al describir el media.

```
✅  "Bistro — Escanear código de barras — pantalla de ventas desktop"
✅  "Bistro — Finalizar venta con Nequi — panel de cobro móvil"
✅  "Bistro — Formulario crear producto — campos obligatorios marcados"
❌  "gif1"
❌  "screenshot_venta"
❌  "tutorial"
```

---

## Cómo subir la guía terminada al RAG

Una vez aprobada la guía:

1. Abre el **Asistente IA** en modo dev (el ícono de carpeta solo aparece con `import.meta.env.DEV`).
2. Toca el botón **PDF / MD** del panel de Base de Conocimiento.
3. Selecciona el archivo `.md` desde `docs/guias_usuario/`.
4. El sistema lo sube al bucket `rag-documents`, lo registra con `source_type='markdown'` y **auto-indexa** sin pasar por Gemini Vision (mucho más rápido y barato que los PDFs).
5. El indicador del documento pasa de **Pendiente** (ámbar) → **Indexado** (verde) en pocos segundos.

### Si falla el indexado

- **"Bad Gateway" al descargar:** error transitorio del Storage. Toca el ícono de refresh (re-indexar) del documento. Suele funcionar al segundo intento.
- **"Invalid unicode code point":** No debería ocurrir con la versión actual del chunker — si aparece, reporta porque indica un bug.
- **"No se extrajo texto":** el archivo está vacío o tiene menos de 30 caracteres. Verifica el contenido.

### Re-indexar tras editar una guía

Si actualizas el contenido del `.md`, vuelve a subir el archivo (no edites el que ya está). El sistema lo trata como un documento nuevo. Si quieres reemplazar el viejo, elimínalo primero con el ícono de papelera para evitar respuestas duplicadas en el RAG.
