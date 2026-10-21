---
name: generar-guion-guidde
description: Genera títulos, descripciones y guiones para tutoriales del editor
  GUIDDE local, analizando el project.json del tutorial (pasos, capturas de
  screenshots, imágenes subidas a media, elementos anotados en overlays y
  narración existente) y cruzando con las guías de usuario en
  docs/guias_usuario/ para mantener estilo consistente con Bistro. Se activa
  cuando el usuario pide "hazme el guion del proyecto X", "mejora la narración
  del paso Y", "genera título/descripción/guion del tutorial Z", "regenera
  todos los guiones del tutorial [título]", "necesito los títulos del tutorial
  crear producto" o frases similares que mencionen GUIDDE, guion, narración,
  título o descripción de un tutorial local.
---

# Generar guion GUIDDE

Skill para producir contenido de texto (títulos, descripciones y guiones de
narración) para tutoriales creados con el editor local **GUIDDE COPIA** que vive
en `C:\Users\HP\OneDrive\Escritorio\GUIDDE COPIA\`. El usuario ya grabó los
pasos manualmente; esta skill solo genera el texto que se pega en el editor.

---

## 🎯 Qué produce

Uno o varios **bloques de texto plano** listos para copiar y pegar en el editor
de GUIDDE (input de título, descripción o narración de cada paso).

La salida siempre va dentro de un bloque de código markdown, así Kiro renderiza
el botón de copiar automáticamente.

Nunca escribe archivos ni modifica el `project.json` — solo devuelve el texto
en el chat.

---

## 📥 Cómo se invoca

Ejemplos de frases del usuario que activan esta skill:

| Frase del usuario | Interpretación |
|-------------------|----------------|
| `hazme el guion del paso 5 del proyecto crear producto retail` | Guion, paso 5, crear de cero |
| `mejora la narración del paso 3` | Guion, paso 3, mejorar la existente |
| `genera todos los títulos del tutorial crear producto retail` | Título, todos los pasos, crear de cero |
| `dame la descripción del paso 7` | Descripción, paso 7, crear de cero |
| `regenera los guiones del tutorial [título]` | Guion, todos, crear de cero |
| `mejora todos los títulos del proyecto X` | Título, todos, mejorar los existentes |

**Estructura semántica de la orden:**

```
[verbo]   +   [qué]           +   [alcance]        +   [proyecto]
─────────    ────────────         ─────────────         ──────────
hazme        el guion            del paso 5             del proyecto X
genera       el título           de todos los pasos     del tutorial Y
mejora       la narración        de los pasos 3 al 8    del proyecto Z
dame         la descripción      del paso final
regenera     los guiones
```

- **verbo → comportamiento**
  - `hazme` / `genera` / `dame` / `crea` → **crear de cero**
  - `mejora` / `arregla` / `limpia` / `refina` → **mejorar la existente**
  - `regenera` → **crear de cero, reemplazando**

- **qué → tipo de salida** (título, descripción, guion / narración)

- **alcance → cuántos pasos** (uno específico, un rango, todos)

- **proyecto → título literal** del tutorial en GUIDDE
  Ejemplos: `crear producto retail`, `hacer una venta`, `configurar impresora`

Si el usuario omite alguno, la skill pregunta ANTES de generar. No adivinar el
proyecto ni el alcance.

---

## 🗺️ Flujo del skill

### Paso 1 — Detectar el proyecto por título

Los proyectos GUIDDE viven en:

```
C:\Users\HP\OneDrive\Escritorio\GUIDDE COPIA\data\projects\
├── proj_[id1]\project.json
├── proj_[id2]\project.json
└── ...
```

Cada `project.json` tiene un campo `title`. Para localizar el proyecto:

```powershell
Get-ChildItem "C:\Users\HP\OneDrive\Escritorio\GUIDDE COPIA\data\projects" -Directory |
  ForEach-Object {
    $json = Join-Path $_.FullName "project.json"
    if (Test-Path $json) {
      $p = Get-Content -Raw $json -Encoding UTF8 | ConvertFrom-Json
      [pscustomobject]@{ Path = $json; Title = $p.title }
    }
  }
```

Matching:
- Case-insensitive
- Ignorar acentos y tildes al comparar (`crear producto` ≈ `Crear Producto`)
- Si hay varios matches parciales, listar los candidatos y preguntar cuál

Si el usuario da un ID (`proj_mry4wfi1_1fl3s`), usarlo directo sin buscar por
título.

### Paso 2 — Leer project.json en UTF-8

**Regla crítica de encoding.** El `project.json` está en UTF-8 pero PowerShell
por defecto lo lee como Windows-1252, lo que produce mojibake (`Ã­` en vez de
`í`, `Ã¡` en vez de `á`). Siempre leer así:

```powershell
Get-Content -Raw <path> -Encoding UTF8 | ConvertFrom-Json
```

Si al leer aparecen caracteres tipo `Ã` o `Â`, es que el JSON tiene mojibake
guardado. La skill debe **normalizarlo antes de usarlo como referencia**:
tomar cada narración como pista semántica, no como texto literal.

### Paso 3 — Identificar qué pasos analizar

El campo `steps` es un array ordenado. Cada paso tiene:

- `id` → identificador único (para citar en la salida)
- `order` → número humano del paso (1, 2, 3…)
- `kind` → `cover` / `button` / `manual` / `note` / `video`
- `title` → título actual
- `narration` → guion actual (a veces con mojibake y comas mal puestas)
- `screenshot` → ruta a la captura principal (si existe)
- `elements[]` → array de anotaciones sobre la captura (rectángulos, flechas,
  textos, imágenes insertadas)
- `overlay` → PNG renderizado con todas las anotaciones aplicadas
- `audio` → wav del TTS actual (irrelevante para esta skill)

**Alcance a interpretar:**

- `paso 5` → un solo paso, matching por `order` o `id`
- `pasos 3 al 8` → rango, incluir ambos extremos
- `todos los pasos` → todo el array `steps`
- `paso final` → el último del array
- `portada` / `cover` → el paso con `kind: "cover"`

### Paso 4 — Extraer contexto visual de cada paso

Para saber qué muestra realmente el paso, mirar en este orden:

**A. `elements[]` — Fuente principal de lo que se resalta**

Cada elemento puede ser:
- `type: "rect"` con `spot: true` → algo que se destaca en la UI (botón, campo)
- `type: "arrow"` / `type: "carrow"` → flecha señalando algo
- `type: "text"` → texto sobreimpreso que ya explica algo en pantalla
- `type: "image"` → imagen subida a la biblioteca (path `media/m_*.png`)
- `type: "ellipse"` → círculo destacando un elemento

Los `elements` de tipo `text` con `bg` oscuro (`#111827`) son overlays
explicativos de la app — leer su `text` para saber qué explica el paso más
allá de la narración. Ese texto **es la fuente más literal de lo que quiere
comunicar el paso** y suele estar bien escrito.

**B. Capturas y media (contexto visual)**

Cuando el skill necesite entender qué se ve en pantalla:

- `screenshot` presente → abrir esa ruta (dentro de la carpeta del proyecto)
- `screenshot` nulo pero `elements[]` tiene `type: "image"` con
  `src: "media/..."` → abrir esos archivos (son las capturas que el usuario
  subió manualmente desde la biblioteca del editor)
- `overlay` → PNG con anotaciones ya aplicadas, útil como referencia final de
  cómo se ve el paso al espectador

**C. Narración existente**

Sirve como pista semántica del intento original del usuario, pero:
- Puede tener mojibake — no copiarla literal
- Puede tener comas mal puestas (`presiona, ENTER,`) — corregir al reusarla
- Puede tener errores factuales — validar contra las capturas antes de reusar

### Paso 5 — Cruzar con `docs/guias_usuario/`

Antes de generar el texto, identificar la guía de usuario que corresponde al
módulo del tutorial:

| Título del tutorial (típico) | Guía correspondiente |
|-----------------------------|----------------------|
| Crear producto retail / Crear productos | `como_crear_productos.md` |
| Hacer una venta / Vender | `como_hacer_una_venta.md` |
| Configurar impresora | `como_configurar_impresora.md` |
| Anular / devolver venta | `como_anular_o_devolver_una_venta.md` |
| Gestionar empleados | `como_gestionar_empleados.md` |
| Gestionar inventario | `como_gestionar_inventario.md` |
| Compras con IA | `como_registrar_compra_inventario_con_ia.md` |
| Clientes a crédito | `como_manejar_clientes_credito.md` |
| Deudas del negocio | `como_gestionar_deudas_negocio.md` |
| Modo offline | `como_usar_el_modo_offline.md` |
| Dashboard | `como_ver_el_dashboard.md` |
| Perfil | `como_editar_perfil.md` |

Leer la guía completa y usar como fuente de:
- Nombres literales de botones, campos y secciones de Bistro
- Reglas y advertencias del módulo (para no inventar comportamientos)
- Terminología correcta (ej. "unidad de venta", no "tipo de venta")
- Tono didáctico (adaptable a conversacional)

Si el tutorial no coincide con ninguna guía existente, avisarlo al usuario y
proceder solo con la info del `project.json`.

### Paso 6 — Generar la salida según el tipo pedido

Ver reglas específicas de cada tipo en la sección **Reglas por tipo de salida**
más abajo.

---

## 🎨 Estilo global (aplica a los 3 tipos)

**Voz y persona:**
- Tuteo colombiano natural (`toca`, `elige`, `escribe`, `busca`)
- Segunda persona directa, sin distancia (`vas a ver`, `tenés que` — NO usar
  `usted` ni `nosotros` salvo en oraciones motivadoras muy puntuales)
- Conversacional pero claro, como un tutor explicando a alguien al lado

**Vocabulario:**
- Nombres de botones y pantallas **tal cual salen en la app** (respetar
  mayúsculas y espacios: `Punto de Venta`, `Crear Producto`, `EAN / UPC`)
- Verbos variados entre frases consecutivas (no repetir `toca...toca...toca`)
- Verbos válidos: `toca`, `pulsa`, `elige`, `abre`, `busca`, `escribe`,
  `escanea`, `confirma`, `guarda`, `activa`
- Cero tecnicismos (`endpoint`, `query`, `hook`, `render` → traducir o eliminar)
- Cero diminutivos (`botoncito`, `campito`, `menucito`)
- Cero emojis en la salida final (los emojis de las guías son solo para
  documentación escrita, no para narración TTS)

**Puntuación (crítico para TTS):**
- Frases cortas terminadas en punto. Mejor 2 frases claras que una larga con 4
  comas
- Comas para pausas naturales, no cada 3 palabras
- Sin `..." Punto` mal escapado
- Sin comillas alrededor de palabras normales (nunca `pulsa "Crear"` — es
  `pulsa Crear`). Los nombres de la UI no se entrecomillan
- Sin markdown (negritas, cursivas, listas) — es texto plano para TTS
- Sin emojis, sin caracteres raros
- Preferir dos puntos para introducir ejemplos: `dos opciones: subir foto o
  pegar imagen`

**Longitud recomendada (para TTS ~150 palabras/min):**

| Tipo | Longitud | Segundos hablados aprox. |
|------|----------|--------------------------|
| Título | 3-8 palabras, sin punto final | — |
| Descripción | 1-2 frases, 15-30 palabras | 6-12 s |
| Guion / narración | 2-5 frases, 30-90 palabras | 12-36 s |

**Longitud especial:**
- Portada (`kind: "cover"`) → guion de 15-25 palabras (introducción corta)
- Paso `note` con mucha información → hasta 120 palabras si el tema lo requiere
  (unidades de compra, unidades de venta, tipos de producto)

---

## 🧩 Reglas por tipo de salida

### 🏷️ Título

- Breve, en imperativo o descriptivo
- 3-8 palabras
- Sin punto final
- Refleja **la acción del paso**, no el contexto
- Capitalización tipo oración (`Ingresar código de barras`, no
  `Ingresar Código De Barras`)

Ejemplos según `kind`:

```
Cover     → Crear productos en Bistro
Button    → Abrir menú Crear
Manual    → Ingresar código de barras
Manual    → Autocompletado con base de datos
Note      → Elegir unidad de venta
Video     → Subir foto desde el celular
```

### 📝 Descripción

- 1-2 frases
- Explica **qué se logra en este paso**, no cómo
- No repite el título literalmente
- Puede mencionar el resultado o la utilidad
- 15-30 palabras

Ejemplo:

```
Título:      Ingresar código de barras
Descripción: Bistro busca el código en su base de datos y trae el nombre del
             producto automáticamente. Si no lo encuentra, escribes el nombre
             tú.
```

### 🎙️ Guion / narración

- 2-5 frases
- Voz activa, orden lógico: acción → resultado → aclaración
- Puede empezar con verbo (`Toca…`, `Escanea…`, `Elige…`) o con contexto corto
  (`Ahora vamos con la categoría.`)
- Menciona el nombre exacto de botones/campos que se verán en pantalla
- Cierra con lo que espera el siguiente paso cuando ayuda a la transición
- 30-90 palabras en pasos normales; hasta 120 en pasos densos (unidad de venta,
  unidades de compra, tipos de producto)

Ejemplo para el paso 4 del tutorial "Crear producto retail":

```
El primer campo del formulario es el código de barras. Puedes escribirlo a
mano y presionar Enter para que Bistro lo busque en su base de datos. Si estás
en celular, toca el ícono del escáner y usa la cámara del dispositivo para
leerlo. Con eso Bistro carga el nombre del producto automáticamente cuando lo
encuentra.
```

**Comportamiento "mejorar" vs "crear de cero":**

- **Mejorar** → tomar la narración actual como esqueleto, respetar el orden
  de las ideas, arreglar encoding (mojibake), pulir puntuación, eliminar
  redundancias, corregir errores gramaticales. NO cambiar el sentido.
- **Crear de cero** → ignorar la narración actual y armarla desde:
  1. Título del paso
  2. `elements[]` de texto (dicen literal qué se explica)
  3. Capturas / media (validación visual)
  4. Guía de usuario correspondiente (estilo y datos técnicos)

---

## 📤 Formato de salida (para pegar en GUIDDE)

Toda la salida va **dentro de un bloque de código markdown** para que Kiro
muestre el botón de copiar. El contenido dentro del bloque es texto plano puro
(sin markdown, sin comillas, sin emojis).

### Un solo paso

Devolver el bloque puro sin encabezado. Así el usuario copia todo el bloque
tal cual y lo pega en el campo correspondiente del editor.

Ejemplo — usuario pidió el guion del paso 4:

    ```text
    El primer campo del formulario es el código de barras. Puedes escribirlo a
    mano y presionar Enter para que Bistro lo busque en su base de datos. Si
    estás en celular, toca el ícono del escáner y usa la cámara del dispositivo
    para leerlo. Con eso Bistro carga el nombre del producto cuando lo
    encuentra.
    ```

### Varios pasos o el tutorial completo

Un bloque por paso, con encabezado corto **fuera del bloque** para que el
usuario ubique qué es cada uno, pero el bloque interno queda limpio y
copiable.

Ejemplo — usuario pidió todos los títulos:

```
Paso 1 (cover):
```

    ```text
    Crear productos en Bistro
    ```

```
Paso 2 (button):
```

    ```text
    Abrir menú Crear
    ```

```
Paso 3 (note - móvil):
```

    ```text
    Acceso desde móvil o tablet
    ```

*(...y así hasta el último paso)*

### Combos (título + descripción + guion del mismo paso)

Separar cada tipo con un mini-encabezado fuera del bloque:

```
Paso 4 — Título:
```

    ```text
    Ingresar código de barras
    ```

```
Paso 4 — Descripción:
```

    ```text
    Bistro busca el código y trae el nombre del producto automáticamente...
    ```

```
Paso 4 — Guion:
```

    ```text
    El primer campo del formulario es el código de barras...
    ```

---

## ⚠️ Reglas de oro (no romper)

1. **Nunca escribir archivos ni modificar el project.json.** La skill solo
   devuelve texto en el chat.
2. **Nunca inventar acciones o campos que no aparezcan en las capturas,
   elements ni guías.** Si algo no está claro, preguntar al usuario o marcar
   con `[VERIFICAR: ...]` dentro del bloque.
3. **Siempre leer el JSON con `-Encoding UTF8`.** El mojibake es real y
   contamina la salida si se ignora.
4. **Los nombres de la app van tal cual aparecen en pantalla.** Si la captura
   dice `Crear Categoría`, en el guion va `Crear Categoría`. Ni `crear
   categorías` ni `botón de categorías`.
5. **Cero markdown en el contenido del bloque.** Nada de `**`, `_`, `>`,
   listas ni encabezados. Es texto plano para copiar y pegar en un input.
6. **Cero emojis en la salida.** Solo texto que se pueda leer en voz alta con
   naturalidad por un TTS.
7. **Si el usuario dice "mejora", respetar la estructura de la narración
   original.** No cambiar el orden ni el sentido. Solo pulir.
8. **Si el usuario dice "crea" o "regenera", ignorar la narración original.**
   Trabajar desde `elements[]` + capturas + guía de usuario.
9. **Nunca leer texto de un paso que no sea el pedido, salvo para dar
   contexto de continuidad.** Si el usuario pide solo el paso 5, la respuesta
   contiene solo el paso 5.
10. **Un bloque de código por unidad de contenido** (un título = un bloque,
    un guion = un bloque). No mezclar dos tipos en el mismo bloque.

---

## 🧪 Ejemplos de invocación completos

### Ejemplo 1 — Guion de un paso, crear de cero

**Usuario:** "hazme el guion del paso 8 del proyecto crear producto retail"

**Skill hace:**
1. Localiza `proj_mry4wfi1_1fl3s` por title `Crear producto retail`
2. Lee project.json en UTF-8
3. Filtra `steps` por `order = 8` → paso "Crear y elegir categoría"
4. Extrae elements → hay un rect resaltando el dropdown Categoría y el botón
   `+ Crear Categoría`
5. Lee `docs/guias_usuario/como_crear_productos.md` → sección "Paso 4 - Elegir
   la categoría del producto"
6. Genera guion conversacional en un bloque de texto

**Skill responde:**

```
Paso 8 — Guion:
```

    ```text
    Ahora la categoría. Este campo es obligatorio y sirve para agrupar el
    producto en tu catálogo. Si ya tienes categorías creadas, elige una del
    listado. Si necesitas una nueva, pulsa Crear Categoría y escribe el
    nombre. También puedes editar cualquier categoría existente tocando el
    ícono del lápiz.
    ```

### Ejemplo 2 — Mejorar narración de un paso

**Usuario:** "mejora la narración del paso 4"

**Skill hace:**
1. Detecta que falta el proyecto → pregunta cuál
2. Usuario responde: "crear producto retail"
3. Lee el paso 4 → narración actual: `"Se abre el formulario de Crear
   Producto. Lo primero es el cÃ³digo de barras. Puedes escribirlo manualmente
   en el campo y presionar, "ENTER", para que BÃ­stro..."`
4. Detecta mojibake y comas mal puestas alrededor de `"ENTER"`
5. Respeta estructura, corrige encoding, pule puntuación

**Skill responde:**

    ```text
    Se abre el formulario de Crear Producto. Lo primero es el código de barras.
    Puedes escribirlo manualmente y presionar Enter para que Bistro lo busque
    en su base de datos. Si estás en celular, pulsa el ícono del escáner para
    leer el código con la cámara de tu dispositivo.
    ```

### Ejemplo 3 — Todos los títulos de un tutorial

**Usuario:** "dame todos los títulos del tutorial crear producto retail, quiero
regenerarlos"

**Skill hace:**
1. Localiza el proyecto
2. Recorre los 16 pasos
3. Genera un título por cada uno respetando el `kind` y el contenido real
4. Devuelve un bloque por paso con mini-encabezado

**Skill responde** (extracto):

```
Paso 1 (cover):
```

    ```text
    Crear productos en Bistro
    ```

```
Paso 2 (button):
```

    ```text
    Abrir menú Crear
    ```

```
Paso 3 (note - móvil):
```

    ```text
    Acceso desde móvil o tablet
    ```

*(...continúa hasta el paso 16)*

---

## 🚦 Cuándo preguntar y cuándo avanzar

**Preguntar antes de generar cuando:**
- Falta el título del proyecto
- El título del proyecto no coincide con ningún project.json
- Hay múltiples proyectos con títulos similares
- No queda claro si es título, descripción o guion
- No queda claro el alcance (un paso, un rango, todos)

**Avanzar sin preguntar cuando:**
- El proyecto es único y el título es inequívoco
- El tipo y alcance son explícitos
- El comportamiento (crear/mejorar) es explícito
- Falta solo un dato menor que se puede inferir con seguridad (ej. el usuario
  dijo `paso final` → último del array)

---

## 📚 Referencias internas

- Estructura del `project.json` GUIDDE: campos `steps`, `elements`, `library`,
  `overlay`, `narration`, `voice`. Ver ejemplos reales en
  `C:\Users\HP\OneDrive\Escritorio\GUIDDE COPIA\data\projects\`.
- Guías de usuario Bistro: `docs/guias_usuario/*.md` — fuente de estilo,
  terminología y datos técnicos.
- Skills relacionadas:
  - `crear-guia-usuario` — para crear docs de referencia (no tutoriales GUIDDE)
  - `crear-video-tutorial` — para videos con voz TTS + Playwright (flujo
    distinto, no GUIDDE)
