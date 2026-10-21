---
name: crear-guia-usuario
description: Crea y actualiza guías de usuario para Bistro POS en español, optimizadas para
  recuperación RAG con formato enriquecido. Úsese cuando el usuario quiera crear una guía de
  módulo, actualizar una guía existente para mejorar las respuestas del chatbot, o documentar
  un flujo para cajeros y administradores. Disparadores: "crear guía", "actualizar guía",
  "guía de usuario", "mejorar guía", "documentar flujo", "guía para el RAG", "cómo usar",
  "manual de usuario".
---

# Crear / Actualizar Guía de Usuario Bistro (RAG-ready)

## 🚨 REGLAS DE ORO — leer antes que nada

Toda guía de Bistro debe cumplir DOS reglas maestras en paralelo: la **estructural**
(cómo se parte en tarjetas para el RAG) y la **visual** (cómo se muestra el contenido).

---

### 🧱 REGLA DE ORO 1 — Estructura por tarjetas (chunking)

**El indexador parte la guía en tarjetas siguiendo SOLO los headings H1/H2/H3 y un
límite de ~1200 caracteres por sección.** Una guía mal estructurada genera tarjetas
mezcladas, partidas en medio de un mockup, o directamente no recuperables.

Las 7 reglas estructurales obligatorias:

1. **Solo H1, H2 y H3 generan tarjetas.** Los `####` y más profundos se entierran
   en la sección padre y NO son recuperables como tarjeta independiente.
2. **Cada paso del flujo es su propio `### H3`** con título descriptivo
   (`### Paso 3 — Conectar la impresora`, no `### Paso 3`).
3. **Cada sección ≤ 1200 caracteres.** Si un paso es muy grande, partilo en
   sub-pasos H3 para evitar que el chunker corte en medio de un mockup ASCII.
4. **Cada `## Sección` y `## Paso a paso` necesita un párrafo introductorio**
   (≥ 30 chars). Sin texto entre el `##` y el primer `###`, el parser la descarta.
5. **FAQ atomizadas: una `### FAQ — ¿Pregunta?` por pregunta.** No agrupar todas
   las preguntas en un solo bloque — cada una debe ser su propia tarjeta.
6. **Headings descriptivos.** Repetí palabras clave en el heading: el breadcrumb
   `H1 > H2 > H3` se antepone al embedding del chunk.
7. **Pasos balanceados.** Apuntá a 4-8 pasos parecidos en tamaño, no uno gigante
   y varios enanos.

📖 **Referencia maestra de estructura:** [resources/estructura-tarjetas-rag.md](resources/estructura-tarjetas-rag.md)

---

### 🎨 REGLA DE ORO 2 — Representación visual (mockups + diagramas)

**Toda guía DEBE usar representación visual en bloques de código (` ``` `) para
DOS propósitos complementarios — no excluyentes:**

#### A) 🖼️ Mockups de UI — replicar la pantalla
Cuando el paso describe **interacción con la interfaz**: botones, dropdowns, campos, formularios, modales, selectores, listas, chips, paneles, estados (conectado/vacío/error).

#### B) 📊 Diagramas de lógica — explicar el comportamiento
Cuando el paso o la sección explica **cómo funciona algo conceptualmente**: flujos en el tiempo, cálculos, decisiones SÍ/NO, comparaciones antes/después, ciclos de vida, relaciones causa-efecto.

**Las dos categorías conviven en la misma guía.** Una guía típica de Bistro tiene tanto mockups de UI (cuando el operador toca botones) como diagramas de lógica (cuando el sistema toma decisiones automáticas por dentro). Ejemplo: la guía de lotes tiene mockups del **Historial de Compras** + un diagrama FIFO mostrando cómo se descuentan los lotes.

Si la guía describe interacción con la interfaz **sin mockups**, o explica lógica de negocio **con párrafos densos de prosa cuando un diagrama lo aclararía**, la guía está incompleta — sin importar qué tan bien redactada esté.

Para modo **actualizar**, la Etapa 1.5 (Auditoría) es **BLOQUEANTE** — no se redacta nada sin antes detectar y reportar los gaps estructurales Y visuales.

---

## Cuándo usar esta skill

- Usuario quiere crear una guía de cómo usar un módulo de Bistro
- Usuario quiere actualizar una guía existente para mejorar las respuestas del chatbot
- Usuario quiere mejorar el formato de una guía (mockups, negritas, pasos numerados, sinónimos)
- Usuario menciona: "guía", "manual", "crear guía", "actualizar guía", "mejorar para el RAG", "agregar componentes visuales", "replicar UI en la guía"

Esta skill reemplaza funcionalmente a `doc-coauthoring` con reglas de formato más precisas.
Ver [resources/reglas-formato-rag.md](resources/reglas-formato-rag.md) para la referencia
completa de símbolos, elementos de formato y patrones de mockup.

---

## Flujo de trabajo

### Etapa 0 — Detectar modo y precargar contexto (automática, sin preguntar)

1. Detectar si la guía ya existe en `docs/guias_usuario/`:
   - Existe → modo **actualizar**: leer la guía actual y ejecutar **AUDITORÍA VISUAL OBLIGATORIA** (ver Etapa 1.5)
   - No existe → modo **crear**: usar el template completo de 6 secciones

2. Identificar el archivo técnico del módulo en `docs/caracteristicas/` usando esta tabla:

| Módulo | Archivo técnico |
|--------|----------------|
| Ventas (desktop) | `flujo_ventas_desktop.md` |
| Ventas (móvil) | `flujo_ventas_movil_tablet.md` |
| Venta por peso | `venta_por_peso_medida.md` |
| Compra de inventario | `flujo_compra_inventario.md` |
| Conteo de inventario | `conteo_inventario.md` |
| Mermas | `flujo_registro_mermas.md` |
| Gastos | `flujo_registro_gasto.md` |
| Catálogo / Productos | `catalogo_productos.md` |
| Crear productos | `flujo_creacion_productos.md` |
| Promociones | `flujo_creacion_promociones.md` |
| Clientes / Cuentas por cobrar | `clientes_cuentas_cobrar.md` |
| Deudas del negocio | `deudas_negocio.md` |
| Historial de ventas | `historial_ventas.md` |
| Dashboard | `dashboard.md` |
| Personal / Empleados | `gestion_personal.md` |
| Asistente IA | `asistente_ia_rag.md` |
| Modo offline | `modo_offline.md` |

3. Leer el archivo técnico completo con `Read`.

4. Determinar el nombre del archivo de salida: `docs/guias_usuario/como_[accion].md`

No preguntar al usuario por contexto que ya está en el doc técnico.

---

### Etapa 1 — Confirmar alcance (1 ronda, máx. 3 preguntas)

1. ¿Qué rol usa este flujo? (cajero, administrador, todos)
2. ¿Hay casos especiales importantes que el doc técnico no mencione?
3. ¿Qué errores reportan más los operadores con este flujo?

Si el usuario no sabe una respuesta, continuar con lo que hay en el doc técnico.

---

### Etapa 1.5 — AUDITORÍA OBLIGATORIA (paso bloqueante)

**Este paso es BLOQUEANTE. No se puede pasar a Etapa 2 sin completarlo.**

Sirve tanto para **crear** (auditar el plan antes de redactar) como para **actualizar** (detectar gaps en una guía existente). Cubre TRES dimensiones: estructura de tarjetas, mockups UI y diagramas de lógica.

#### 🧱 Auditoría estructural (la primera que se ejecuta)

Antes de auditar lo visual, verificar la estructura — porque si las secciones están
mal armadas, el RAG no va a poder recuperar bien aunque los mockups sean perfectos.

**Recorrer la guía y marcar como GAP ESTRUCTURAL:**

1. **`####` o headings más profundos** → buscar `^####` en el archivo. Por cada
   uno, decidir: ¿es contenido sustancial? Promover a `###`. ¿Es decorativo?
   Cambiar a negrita o eliminar.

2. **`## Sección` sin párrafo introductorio** → especialmente `## Paso a paso` y
   `## Preguntas frecuentes`. Si el heading va seguido directo de un `###` sin
   texto en medio, marcar como GAP. La sección se descarta del índice.

3. **Secciones que superan ~1200 caracteres** → contar líneas markdown (~30 líneas
   ≈ 1200 chars). Si un `### Paso N` tiene más de 30 líneas y contiene mockups,
   marcar como GAP — el chunker va a cortar en medio del ASCII.

4. **FAQ no atomizadas** → si `## Preguntas frecuentes` es una pila de
   `**¿Pregunta?**` + respuesta sin H3 separadores, marcar como GAP: cada
   pregunta debe ser su propio `### FAQ — ¿?`.

5. **Headings genéricos** → buscar `### Detalles`, `### Más info`, `### Paso N`
   solo con número. Renombrar con palabras clave de la sección.

6. **Pasos del flujo NO encabezados con `###`** → si los pasos están como
   `**Paso 1:**` o lista numerada `1.`, marcar como GAP: deben ser `### Paso N`.

7. **Pasos muy desbalanceados** → ej. un paso de 100 líneas y otros de 5. Marcar
   para redistribución.

Ver detalle en [resources/estructura-tarjetas-rag.md](resources/estructura-tarjetas-rag.md).

#### 🎨 Auditoría visual (después de la estructural)

Cubre los gaps de mockups UI y diagramas de lógica.

#### Procedimiento para modo UPDATE

1. Leer la guía existente con `Read` completo.
2. **Ejecutar la auditoría estructural** del bloque anterior, marcando GAPs
   estructurales (`[STRUCT]`).
3. **Recorrer línea por línea TODAS las secciones** — incluyendo `## ¿Para qué sirve?`, `## Antes de empezar`, `## Paso a paso`, `## Errores comunes` y `## Preguntas frecuentes`. Los gaps de lógica suelen concentrarse en FAQ y Errores, no solo en Paso a paso. Marcar dos tipos de disparadores:

   **🖼️ Disparadores para mockup UI:**

   Verbos de interacción: `toca` · `pulsa` · `presiona` · `selecciona` · `elige` · `escribe` · `marca` · `haz clic` · `abre` · `cierra` · `arrastra` · `escanea` · `desliza`

   Sustantivos de componentes: `botón` · `campo` · `panel` · `modal` · `selector` · `dropdown` · `desplegable` · `pestaña` · `tab` · `checkbox` · `switch` · `toggle` · `chip` · `etiqueta` · `tarjeta` · `card` · `lista` · `formulario` · `buscador` · `barra` · `ícono` · `menú`

   Estados de UI: `estado vacío` · `cargando` · `error` · `éxito` · `conectado` · `desconectado` · `guardado` · `pendiente`

   **📊 Disparadores para diagrama de lógica:**

   Secuencias en el tiempo: `primero` · `después` · `luego` · `FIFO` · `LIFO` · `cronológico` · `historial` · `antes/después`

   Cálculos y aritmética: `se calcula` · `se suma` · `se resta` · `promedio` · `total` · `cantidad final` · `stock resultante` · `−4 + 10` · `×` · `multiplica` · `entran al inventario` · cualquier ejemplo con números o multiplicaciones

   Decisiones y condiciones: `si X entonces` · `cuando` · `excepto si` · `bloqueado` · `permitido` · `depende de` · `puede / no puede` · `¿Por qué no puedo...?` · `¿Qué pasa si...?` · `el sistema bloquea` · `no se puede` · `solo si`

   **⚠️ Disparadores especiales en FAQ y Errores comunes** — estas secciones casi siempre contienen lógica condicional sin diagrama. Buscar explícitamente:
   - Preguntas que empiezan con `¿Por qué` o `¿Qué pasa si` → árbol de decisión
   - Filas de la tabla "Errores comunes" con condición implícita (`si X → Y`) → árbol de decisión o diagrama antes/después
   - Cualquier secuencia cronológica explicada en prosa dentro de una respuesta → timeline

   Comparaciones y transformaciones: `antes vs después` · `con X / sin X` · `caso A vs caso B` · `el sistema convierte`

   Relaciones y ciclos: `lote nuevo → agotado` · `genera` · `dispara` · `crea` · `consume` · `ciclo de vida` · `estado pasa a`

3. Para CADA disparador encontrado, verificar:
   - ¿Hay un bloque de código ` ``` ` adyacente (arriba o abajo, máx. 5 líneas) con el mockup o diagrama correspondiente?
   - Si **NO** → marcarlo como **GAP VISUAL** en una lista, clasificándolo como `[UI]` o `[LÓGICA]`.

4. **Reportar al usuario** la lista completa de gaps detectados antes de hacer cualquier edición:
   ```
   Detecté X gaps en la guía:

   🧱 Estructura (corregir primero — afecta cómo se parte en tarjetas):
   1. Línea N: "#### Validación previa" → promover a "### Paso 1 — Verificar..."
   2. Línea N: "## Paso a paso" sin párrafo introductorio → descartado por el parser
   3. Línea N: "### Paso 2" tiene ~3500 chars con mockups → partir en 3 sub-pasos
   4. Línea N: "## Preguntas frecuentes" agrupa 6 FAQ en un solo bloque → atomizar a ### FAQ

   🖼️ Mockups UI faltantes:
   5. Línea N: "Toca el botón Conectar" → falta mockup del botón
   6. Línea N: "Selecciona el ancho 80mm o 58mm" → falta mockup del selector

   📊 Diagramas de lógica faltantes:
   7. Línea N: "Descuenta primero el lote más antiguo (FIFO)" → falta timeline
   8. Línea N: "Si stock era -4 y se compraron 10..." → falta bloque de cálculo
   9. Línea N: "No puedo eliminar una compra del historial" → falta árbol de decisión

   ¿Aplico todos? (sí / elige cuáles)
   ```

5. **Orden de aplicación obligatorio:** primero estructura, después mockups, después diagramas. Aplicar con `Edit` quirúrgico — uno por uno, conservando el texto explicativo.

#### Procedimiento para modo CREATE

Antes de redactar:

1. **Planificar la estructura de tarjetas** (ver `resources/estructura-tarjetas-rag.md`):
   - ¿Cuántos pasos tiene el flujo? Listalos como `### Paso N — Acción descriptiva`.
   - ¿Algún paso va a tener más de 30 líneas? Partilo en sub-pasos desde el inicio.
   - ¿Cuántas FAQ vas a incluir? Cada una será `### FAQ — ¿Pregunta?`.
   - Confirmar que `## Paso a paso` y `## Preguntas frecuentes` tendrán párrafo introductorio.

2. Listar los **componentes UI** que aparecerán en cada paso → patrón de mockup (ver `resources/reglas-formato-rag.md` sección "Mockups visuales de UI").

3. Listar las **explicaciones de lógica** que aparecerán (cálculos, decisiones, flujos) → patrón de diagrama (ver `resources/reglas-formato-rag.md` sección "Diagramas de lógica").

#### Heurística de calidad

**Estructurales:**

- ✅ Solo H1, H2 y H3 en todo el archivo — ningún `####`.
- ✅ Cada paso del flujo es un `### H3` con título descriptivo (`### Paso 3 — Conectar la impresora`).
- ✅ Cada `## Sección` y `### Paso` ≤ 1200 caracteres (~30 líneas markdown).
- ✅ `## Paso a paso` y `## Preguntas frecuentes` tienen párrafo introductorio (≥ 30 chars).
- ✅ Cada FAQ es su propio `### FAQ — ¿Pregunta?` — no agrupadas en un solo bloque.
- ✅ Pasos balanceados en tamaño (entre 10 y 30 líneas cada uno).
- ❌ Un `####` con contenido sustancial = **GAP [STRUCT]**.
- ❌ Un `### Paso N` enorme con mockups que supera 1200 chars = **GAP [STRUCT]**.
- ❌ Una pila de `**¿FAQ?**` sin H3 individuales = **GAP [STRUCT]**.

**Visuales:**

- ✅ Mínimo **1 visual (UI o lógica) por cada paso o concepto** del flujo, salvo pasos puramente informativos.
- ✅ Si el paso menciona **múltiples componentes UI** (ej. un formulario), un solo mockup grande puede cubrirlos todos.
- ✅ Si una sección explica **una operación numérica o decisional**, debe haber un diagrama de lógica adyacente — no basta con la prosa.
- ✅ **Las FAQ y Errores comunes cuentan igual que Paso a paso** — si una pregunta frecuente explica lógica condicional ("¿por qué no puedo eliminar?"), necesita un árbol de decisión. Si una fila de errores implica una condición, necesita un diagrama.
- ❌ Un paso que diga "toca **Conectar**" sin mockup adyacente = **GAP [UI]**.
- ❌ Una explicación tipo "el sistema descuenta primero del lote más antiguo" sin timeline o diagrama = **GAP [LÓGICA]**.
- ❌ Un ejemplo con números (`stock −4 + compra 10 = 6`) en prosa, sin bloque de cálculo = **GAP [LÓGICA]**.
- ❌ Una FAQ que explica una decisión del sistema ("si X no puedo hacer Y") en texto plano, sin árbol de decisión = **GAP [LÓGICA]**.

---

### Etapa 2 — Redactar sección por sección con formato enriquecido

Construir una sección a la vez. Para cada sección:
1. Anunciar qué sección se va a redactar
2. Mostrar el borrador aplicando las reglas de formato
3. Pedir cambios sin editar directamente
4. Aplicar cambios con edición quirúrgica
5. Confirmar y pasar a la siguiente

**Orden:** ¿Para qué sirve? → Antes de empezar → Paso a paso → Errores comunes → Preguntas frecuentes

**Reglas de formato obligatorias al redactar (ver detalle completo en `resources/reglas-formato-rag.md`):**

- 🎨 **REPRESENTACIÓN VISUAL (REGLA DE ORO — DOS CATEGORÍAS):**
  - **🖼️ Mockup UI:** cada vez que un paso describa interacción con un componente de la interfaz (selector, dropdown, botón, campo, formulario, modal, lista, card, chip), **replicarlo con mockup ASCII en un bloque de código** ```. Ver `resources/reglas-formato-rag.md` sección "Mockups visuales de UI".
  - **📊 Diagrama de lógica:** cada vez que la guía explique cómo funciona algo por dentro (flujos en el tiempo, cálculos, decisiones SÍ/NO, comparaciones antes/después, ciclos de vida, relaciones causa-efecto), **representarlo con diagrama ASCII** en bloque de código. Ver `resources/reglas-formato-rag.md` sección "Diagramas de lógica".
  - **Una sola guía puede y debe tener ambos.** No describir con palabras lo que se puede mostrar visualmente.
- 🔍 **Antes de redactar un paso de UI**, abrir el archivo de pantalla correspondiente en `screens/` o `components/` y mirar la UI real — el mockup debe replicar elementos, etiquetas, prefijos/sufijos, íconos y disposición.
- 🧠 **Antes de redactar una explicación de lógica**, leer el doc técnico en `docs/caracteristicas/` para entender el comportamiento real del sistema, y elegir el patrón de diagrama que mejor lo represente (timeline, cálculo, árbol de decisión, antes/después, ciclo de vida).
- Nombres de botones y pantallas en prosa → siempre en `**negrita**` con capitalización exacta. Si aparecen como botón en el mockup, usar `` `[ Nombre ]` `` inline.
- Pasos de flujo → siempre en lista numerada `1.` `2.` `3.` o subsecciones `### 1️⃣ Paso`.
- Requisitos y opciones → lista de viñetas `-`
- Rutas de navegación → `` `[ 📦 Módulo ]` `` → `` `[ Sección ]` `` → `` `[ Acción ]` ``
- Consejos y advertencias → blockquote `>` con emoji (`> 💡` tip, `> ⚠️` aviso, `> 🔒` bloqueo, `> 🤖` IA)
- Cada sección ≤ 1200 caracteres (límite de chunk de Pinecone)
- Sección "¿Para qué sirve?" → incluir sinónimos de la acción principal
- Sin jerga técnica: no escribir "query", "hook", "tabla de BD", "RPC", "componente"
- **Líneas de mockup ≤ 50 caracteres de ancho** para evitar scroll horizontal en el chat (~560px). Texto explicativo va FUERA del bloque.

Al terminar todas las secciones, verificar:
- Consistencia de nombres de botones en todo el documento
- Ninguna sección asume que el lector leyó otra sección
- No hay jerga técnica

---

### Etapa 3 — Sugerencias de multimedia (opcional)

Solo si el flujo tiene pasos visuales claros que un texto no puede transmitir bien,
agregar la sección `## Recursos multimedia` al final del documento.

Esta sección es una tabla de sugerencias — no bloquea la guía ni es requisito.
La guía es efectiva por sí sola con solo texto.

Ver `resources/reglas-formato-rag.md` sección "Multimedia opcional" para los tipos
disponibles y cómo subirlos al sistema.

---

### Etapa 4 — Prueba de lector (sub-agente)

Lanzar un sub-agente con solo el contenido de la guía terminada (sin contexto de esta
conversación) y pedirle que responda como operador de tienda que nunca usó Bistro:

- "¿Cómo hago [acción principal del módulo]?"
- "¿Qué pasa si [error común del módulo]?"
- "¿Necesito [prerequisito] para poder hacer esto?"

Reportar qué respondió bien y qué no encontró. Corregir los puntos ciegos identificados.

---

## Output

- **Carpeta:** `docs/guias_usuario/`
- **Nombre de archivo:** `como_[accion_en_infinitivo].md`
  - Ejemplos: `como_hacer_una_venta.md`, `como_crear_productos.md`
- **Formato:** Markdown estándar — el archivo `.md` se sube tal cual al RAG (sin convertirlo a PDF). El indexador lee el markdown directamente, preservando headers, negritas, listas y tablas en los chunks de Pinecone.

---

## Recursos de este skill

- [🧱 Estructura de tarjetas para RAG (referencia maestra)](resources/estructura-tarjetas-rag.md)
- [📐 Template de 6 secciones](resources/template-guia.md)
- [🎨 Reglas de formato y símbolos para RAG](resources/reglas-formato-rag.md)
- [✅ Checklist de calidad](resources/checklist-calidad.md)
