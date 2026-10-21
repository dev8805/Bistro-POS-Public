# Template: Guía de Usuario Bistro (6 secciones)

Copiar este template para cada guía nueva. Las primeras 5 secciones son obligatorias.
La sección 6 (multimedia) es opcional — solo incluirla si hay media disponible o sugerida.

---

```markdown
# Cómo [acción principal] en Bistro

> Guía para: [Cajeros / Administradores / Todos]
> Módulo: [nombre exacto del módulo en la app]
> Tiempo estimado: [X minutos]

---

## ¿Para qué sirve?

[2–3 líneas máximo. Explicar qué problema resuelve este flujo para el negocio.
IMPORTANTE: incluir sinónimos de la acción principal en esta sección para mejorar
la recuperación semántica del chatbot. Ejemplo: si la guía es sobre "registrar un
gasto", también mencionar "anotar un egreso", "guardar un gasto", "registrar lo que
gasté". Sin jerga técnica — no escribir tablas, hooks, queries ni componentes.]

---

## Antes de empezar

- [Requisito 1 — ej: "Debes tener un turno de **Caja** abierto"]
- [Requisito 2 — ej: "El cliente debe estar registrado en **Cuentas por Cobrar**"]
- [Si no hay requisitos: "No necesitas ninguna configuración previa."]

---

## Paso a paso

[PÁRRAFO INTRODUCTORIO OBLIGATORIO — sin esto, el parser descarta este H2.
Resumir en 2-4 líneas qué se va a hacer en orden. Ejemplo: "Para registrar
una venta hay que hacer cuatro cosas: agregar productos al carrito, elegir
método de pago, ingresar monto recibido, y finalizar la venta."]

[Cada paso debe ser un ### H3 propio con título descriptivo. NO usar
**negrita** ni lista numerada como sustituto de heading.
Cada paso ≤ 1200 caracteres (~30 líneas markdown).
Cada paso que describa interacción con UI DEBE incluir un mockup ASCII.
Ver `reglas-formato-rag.md` para los patrones de mockup.]

---

### Paso 1 — [Nombre descriptivo del primer paso]

[1–2 líneas explicando la acción. Ruta si es necesaria:]

`[ 📦 Módulo ]` → `[ Sección ]` → `[ Acción ]`

[Mockup del componente principal con el que interactúa:]

```
Etiqueta del campo *
┌─────────────────────────────────────┐
│  Valor o placeholder            ▾  │
└─────────────────────────────────────┘
```

---

### Paso 2 — [Nombre descriptivo del segundo paso]

[Si abre un modal, selector desplegado, formulario, etc., replicarlo:]

```
┌─ Título del modal ──────────────────┐
│                                     │
│  Contenido...                       │
│                                     │
│  [ Cancelar ]    [ Confirmar ]      │
└─────────────────────────────────────┘
```

[Tabla complementaria SOLO si hay comportamientos que el mockup no muestra:]

| Campo | Comportamiento |
|-------|---------------|
| [Campo 1] | [Qué hace, validaciones, etc.] |

---

### Paso 3 — [Continuar hasta completar el flujo]

> 💡 **Consejo:** [Tip práctico opcional]
> ⚠️ **Aviso:** [Advertencia importante si aplica]
> 🔒 **Bloqueo:** [Si algo se vuelve no editable después]

[Si un paso te queda > 30 líneas con mockup grande, partilo en sub-pasos:
"### Paso 3 — Abrir el panel" + "### Paso 4 — Completar los datos" +
"### Paso 5 — Guardar los cambios", renumerando los pasos siguientes.
Mejor 7 pasos chicos que 3 pasos enormes.]

---

## Errores comunes

| Situación | Qué hacer |
|-----------|-----------|
| [Descripción del error o situación inesperada] | [Solución concreta en 1 línea] |
| [El botón **Guardar** no responde] | [Verifica que completaste Nombre y Categoría.] |
| [El código no encontró el producto] | [Escríbelo manualmente — es normal en productos locales.] |

[Si hay diagnóstico con bifurcaciones, agregar un árbol de decisión:]

```
¿La impresora no aparece?
  │
  ├── Windows ──► ¿Instalaste el driver?
  │               ├── No → Instalar primero
  │               └── Sí → Revisar cable y encendido
  │
  └── Android ──► Revisar cable y encendido
```

---

## Preguntas frecuentes

[PÁRRAFO INTRODUCTORIO OBLIGATORIO — 1-2 líneas describiendo qué tipo de
dudas cubre esta sección. Sin esto, el parser descarta el H2 padre.]

[Cada FAQ debe ser un ### H3 individual con la pregunta completa en el
título. NO agrupar todas las preguntas como **¿?** sueltos — eso genera
una sola tarjeta con todas las preguntas mezcladas.]

---

### FAQ — ¿[Pregunta realista que haría el operador]?

[Respuesta directa y completa. Sin referencias a otras secciones. El lector
debe entender la respuesta aunque no haya leído el resto de la guía. Incluí
diagrama de decisión si la respuesta tiene condicionales o cálculos.]

---

### FAQ — ¿[Segunda pregunta]?

[Respuesta autocontenida.]

---

### FAQ — ¿[Tercera pregunta]?

[Respuesta autocontenida.]

---

## Recursos multimedia *(opcional)*

> Esta sección es una sugerencia para enriquecer el Asistente IA.
> La guía funciona sin ella — solo agregar si hay media disponible o planeada.

| Tipo | Nombre sugerido en la app | Qué mostraría | Cómo subirlo |
|------|--------------------------|---------------|--------------|
| GIF | "Bistro — [acción] — [contexto]" | [Descripción del flujo animado] | Modal "GIF" en Asistente IA → URL pública (Giphy/Cloudinary) |
| Video | "Bistro — [acción] — [contexto]" | [Descripción del proceso en video] | Modal "Video" → URL YouTube (añadir ?t=XX para ir a un segundo específico) |
| Imagen | "Bistro — [pantalla] — [detalle]" | [Qué pantalla o formulario muestra] | Botón "PDF/IMG" → subir .png o .jpg |
```

---

## Notas para el redactor

### Sobre el chunking de Pinecone

El sistema divide los documentos en **tarjetas (chunks)** siguiendo los headings
H1/H2/H3 y un límite de **1200 caracteres** por sección. Reglas clave:

- **Solo H1, H2 y H3 generan tarjetas.** Los `####` se entierran en la sección padre.
- **Cada paso del flujo es su propio `### H3`** con título descriptivo, no `**Paso 1:**` ni lista numerada.
- **Cada sección ≤ 1200 caracteres (~30 líneas).** Si te pasás, partila en sub-pasos.
- **Cada `## Sección` necesita párrafo introductorio** (≥ 30 chars). Sin él se descarta.
- **FAQ atomizadas:** una `### FAQ — ¿Pregunta?` por pregunta, no agrupadas en bloque.
- **Headings descriptivos:** el breadcrumb H1>H2>H3 se antepone al embedding.

Ver detalle completo en `estructura-tarjetas-rag.md`.

### Sobre los sinónimos en "¿Para qué sirve?"
Esta sección es el primer chunk que Pinecone recupera cuando alguien pregunta algo general.
Si incluye sinónimos, el chatbot la encontrará para más variantes de la pregunta:

**Sin sinónimos (malo para RAG):**
> Este módulo registra los gastos del negocio.

**Con sinónimos (bueno para RAG):**
> Este módulo te permite registrar los gastos del negocio: lo que gastaste en un proveedor,
> servicios básicos, transporte o cualquier egreso. Si quieres anotar un gasto, registrar
> lo que gastaste hoy o guardar un egreso del día, aquí lo haces.

### Sobre los nombres de botones en negrita
Los nombres de botones y pantallas en negrita ayudan a Gemini a reconocerlos como
términos clave en el chunk. En la respuesta del chatbot, esas palabras exactas aparecen
destacadas, y el usuario puede identificar el elemento en pantalla.
