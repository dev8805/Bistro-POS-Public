# Checklist de Calidad — Guía de Usuario Bistro

Verificar este checklist antes de marcar una guía como terminada.

---

## 🧱 Estructura de tarjetas (OBLIGATORIO — afecta cómo se parte la guía para el RAG)

- [ ] **H1 único** en todo el documento (el título principal)
- [ ] **H2 para cada sección principal** (¿Para qué sirve?, Antes de empezar, Paso a paso, Errores comunes, Preguntas frecuentes)
- [ ] **Ningún `####` o más profundo** en todo el archivo (el parser los entierra)
- [ ] **Cada paso del flujo es un `### H3` propio** con título descriptivo (`### Paso 3 — Conectar la impresora`, no `### Paso 3` ni `**Paso 3:**`)
- [ ] **Cada `## Sección` y `### Paso` ≤ 1200 caracteres** (~30 líneas markdown). Secciones más grandes deben partirse en sub-pasos H3
- [ ] **`## Paso a paso` tiene párrafo introductorio** (≥ 30 chars) entre el heading y el primer `### Paso 1`
- [ ] **`## Preguntas frecuentes` tiene párrafo introductorio** antes del primer `### FAQ`
- [ ] **Cada FAQ es un `### FAQ — ¿Pregunta?` individual** — NO agrupadas como pila de `**¿?**` en un solo bloque
- [ ] **Headings descriptivos con palabras clave** de la sección — no genéricos (`### Detalles`, `### Más info` ❌)
- [ ] **Pasos balanceados en tamaño** — entre 10 y 30 líneas cada uno. Sin pasos de 100 líneas y otros de 5
- [ ] Todas las secciones son autocontenidas — se entienden sin haber leído las otras

## Formato de texto

- [ ] Todos los nombres de botones y pantallas de la app están en **negrita** con la capitalización exacta de la UI
- [ ] Los pasos de flujo usan lista numerada (1. 2. 3.) — no párrafos corridos
- [ ] Los requisitos y opciones sin orden usan lista de viñetas (-)
- [ ] Las rutas de navegación usan flecha → con botones inline (`[ Módulo ]` → `[ Sección ]`)
- [ ] Los consejos y advertencias usan blockquote (>) con emoji (`> 💡`, `> ⚠️`, `> 🔒`, `> 🤖`)
- [ ] Los nombres de UI son consistentes en todo el documento (no "Finalizar venta" en un paso y "FINALIZAR VENTA" en otro)

## 🖼️ Mockups visuales de UI (OBLIGATORIO)

- [ ] **Cada paso que describe interacción con un componente UI tiene un mockup ASCII en bloque de código** (selector, dropdown, botón, campo, formulario, modal, lista, card, chip)
- [ ] Los **selectores/dropdowns** se muestran cerrados (`[ Opción ▾ ]`) **y desplegados** (lista con `✓` en la opción seleccionada) cuando son relevantes
- [ ] Los **campos de texto** muestran prefijo/sufijo si los tienen en la app real (`$` izquierda, `/Und` derecha)
- [ ] Los **botones** importantes están entre corchetes `[ Texto ]` o en cajas `╔═╗`
- [ ] Los **modales** se replican completos con título, contenido y botones de acción
- [ ] Los **estados vacíos** vs **estados con datos** se muestran como mockups separados cuando aplica
- [ ] Las **líneas de los mockups no exceden ~50 caracteres** de ancho (para evitar scroll horizontal en el chat de ~560px)
- [ ] El **texto explicativo va FUERA del bloque de código**, no dentro
- [ ] Los caracteres de caja (`┌ ┐ └ ┘ ─ │ ╔ ╗ ═ ║`) están alineados correctamente
- [ ] Se revisó el archivo de pantalla en `screens/` o `components/` antes de redactar el mockup para replicar la UI real (íconos, etiquetas, colores indicativos)

## 📊 Diagramas de lógica (OBLIGATORIO cuando aplica)

- [ ] **Cada explicación de cómo funciona el sistema por dentro tiene un diagrama ASCII** — no se queda en prosa
- [ ] Los **flujos en el tiempo** (FIFO, cronologías, fases) usan **timeline horizontal** con cajas y flecha de tiempo
- [ ] Los **cálculos numéricos** (stock + compra, restas, promedios) usan **bloque de cálculo** con alineación de columnas y línea separadora `───`
- [ ] Las **decisiones SÍ/NO o condicionales** usan **árbol de decisión** con ramas `├──` `└──` y resultado en cada hoja
- [ ] Los **cambios de estado** tras una acción usan diagrama **antes / después** comparativo
- [ ] Los **ciclos de vida** de entidades (lote, compra, sesión) usan diagrama secuencial con flechas verticales `▼`
- [ ] Las **relaciones causa → efecto** usan flechas horizontales `──►` y ramificaciones con `├─►` `└─►`
- [ ] La guía mezcla mockups UI **y** diagramas de lógica donde corresponda — no se queda solo en uno de los dos
- [ ] Los diagramas también respetan el límite de **~50 caracteres** por línea

## Vocabulario y recuperación semántica

- [ ] La sección "¿Para qué sirve?" incluye al menos 2-3 sinónimos de la acción principal
- [ ] El vocabulario del documento coincide con cómo los operadores preguntarían en el chat
- [ ] Sin jerga técnica: no aparece "hook", "tabla", "RPC", "query", "componente", "base de datos"
- [ ] Los términos técnicos están sustituidos: "el sistema" en vez de "la base de datos", "guarda" en vez de "inserta"

## Preguntas frecuentes

- [ ] Mínimo 3 preguntas, máximo 6
- [ ] Cada pregunta es realista — algo que un operador de tienda realmente preguntaría
- [ ] Cada respuesta es completa y autocontenida (no dice "como se mencionó antes")

## Errores comunes

- [ ] Máximo 6 filas en la tabla
- [ ] Cada situación describe exactamente lo que el operador vería en pantalla
- [ ] Cada solución es una acción concreta en 1 línea

## Prueba de lector (sub-agente)

- [ ] Sub-agente respondió correctamente: "¿Cómo hago [acción principal]?"
- [ ] Sub-agente respondió correctamente: "¿Qué pasa si [error común]?"
- [ ] Sub-agente respondió correctamente: "¿Necesito [requisito] para esto?"

## Aprobación

- [ ] Usuario revisó la guía completa y aprobó
- [ ] Archivo guardado en `docs/guias_usuario/como_[accion].md`

---

## Sección multimedia (solo si aplica)

- [ ] La sección `## Recursos multimedia` está al final del documento
- [ ] Cada media tiene nombre descriptivo en formato "Bistro — acción — contexto"
- [ ] La tabla indica el tipo (GIF / Video / Imagen) y cómo subirlo a la app
- [ ] La sección tiene el aviso de que es opcional

---

## Referencia rápida — Lo que NO debe aparecer en ninguna guía

| Prohibido | Alternativa |
|-----------|-------------|
| "base de datos" | "el sistema" |
| "registrar en la tabla" | "guardar en el sistema" |
| "hook useProducts" | no mencionarlo |
| "RPC", "query", "foreign key" | no mencionarlo |
| "componente React" | no mencionarlo |
| "null", "undefined" | "vacío", "sin valor" |
| "como se explicó antes" | repetir la información necesaria |
| Archivos `.tsx`, `.ts`, `.md` | no mencionarlos |
| "ver sección anterior" | incluir el contexto en esa sección |
