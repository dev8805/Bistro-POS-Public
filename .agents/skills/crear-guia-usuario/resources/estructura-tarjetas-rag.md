# Estructura de Headings para Recuperación RAG por Tarjetas

> 📌 **Este archivo es la referencia maestra de estructura.** Si chocás con algo de
> formato (mockups, símbolos, tablas), mirá `reglas-formato-rag.md`. Si necesitás un
> esqueleto en blanco, mirá `template-guia.md`. Pero la jerarquía y el tamaño de las
> secciones —lo que decide cómo se parte el documento en tarjetas— está acá.

---

## Cómo funciona el corte en tarjetas (chunking)

Cuando una guía `.md` se sube al RAG, el indexador NO la guarda entera. La corta en
fragmentos llamados **chunks** (o "tarjetas") siguiendo dos pasos:

### Paso 1 — Cortar por headings (jerarquía)

El parser de markdown busca **únicamente H1, H2 y H3**. Cada heading abre una nueva
sección. El cuerpo de cada heading se convierte en una tarjeta candidata.

```
# H1 — Título del documento        → 1 sección
## H2 — Sección principal           → 1 sección
### H3 — Sub-sección                → 1 sección
#### H4 — IGNORADO por el parser    → queda dentro de la sección padre
##### H5 — IGNORADO                  → idem
```

**Consecuencia crítica:** todo lo que pongas bajo un `####` no es recuperable como
tarjeta independiente. Si querés que un fragmento aparezca en el RAG cuando alguien
pregunta por él, **NUNCA uses `####` para abrirlo** — promovelo a `###`.

### Paso 2 — Cortar secciones grandes por tamaño

Si una sección (H1, H2 o H3) supera **~1200 caracteres**, el sistema la corta de
nuevo en sub-chunks de 1200 chars con overlap de 250. Acá viene el problema: el
corte puede caer **en el medio de un mockup ASCII** o **partir una lista numerada
por la mitad**, dejando información rota en tarjetas separadas.

**Consecuencia crítica:** mantené cada `### Paso N` y cada `## Sección` por debajo
de 1200 chars. Si un paso es muy grande, partilo en sub-pasos H3.

### Paso 3 — Filtro de tamaño mínimo

Si el cuerpo de una sección (después del heading) tiene **menos de 30 caracteres**,
el parser la **descarta**. No genera tarjeta.

**Consecuencia crítica:** un `## Paso a paso` sin párrafo introductorio entre el
heading y el primer `### Paso 1` se descarta. Si querés que esa sección sea
recuperable (para preguntas tipo "¿cuáles son los pasos?"), agregale un párrafo
de resumen.

### Paso 4 — Breadcrumb

Cada tarjeta se etiqueta con un breadcrumb que concatena la jerarquía:

```
Cómo configurar la impresora > Paso a paso > Paso 4 — Completar los datos comerciales
```

Ese breadcrumb se antepone al texto del chunk antes de embeddear, así que **los
headings deben ser descriptivos, no genéricos**. Un H3 que diga "Detalles" pierde
toda la pista semántica; "Paso 3 — Conectar la impresora" la conserva.

---

## Las 7 reglas de estructura

### Regla 1 — Solo H1, H2 y H3 generan tarjetas

```
✅ # H1 — Cómo configurar la impresora
✅ ## H2 — Antes de empezar
✅ ### H3 — Paso 1 — Verificar conexión
❌ #### H4 — Cualquier cosa importante (queda enterrado)
```

Si tenés contenido sustancial bajo un `####`, promovelo:

```diff
- #### 🔍 Validación previa: Verificar conexión
+ ### Paso 1 — Verificar que la impresora está conectada al PC
```

### Regla 2 — Cada paso del flujo es su propio `### H3`

Bajo `## Paso a paso`, cada paso debe ser un H3 separado. **NO** uses negrita o
lista numerada como sustituto de heading.

```
✅ ### Paso 1 — Verificar conexión
✅ ### Paso 2 — Instalar el controlador USB
✅ ### Paso 3 — Abrir el panel de Ajustes

❌ **Paso 1: Verificar conexión**       (no genera tarjeta)
❌ 1. Verificar conexión                 (no genera tarjeta)
```

Cada H3 = una tarjeta = un fragmento que el chat puede recuperar con precisión.

### Regla 3 — Tamaño de cada `### H3` ≤ 1200 caracteres

Si un paso explica muchas cosas (formulario con 4 campos + mockups + validaciones +
guardado), te va a quedar grande. Partilo:

```diff
- ### Paso 2 — Configurar los datos del ticket
- (todo: navegación + 4 campos + validaciones + guardar — 3500 chars)

+ ### Paso 2 — Abrir el panel de Ajustes
+ (navegación al panel — ~700 chars)
+
+ ### Paso 3 — Completar los datos comerciales
+ (4 campos con sus mockups — ~1000 chars)
+
+ ### Paso 4 — Guardar los cambios
+ (botón y validación de guardado — ~600 chars)
```

**Regla del pulgar:** si una sección ocupa más de ~30 líneas de markdown, partila.

### Regla 4 — `## Paso a paso` necesita un párrafo introductorio

El heading solo no basta. El parser descarta secciones con cuerpo < 30 chars.

```
❌ Mal:
## Paso a paso

### Paso 1 — ...
```

```
✅ Bien:
## Paso a paso

Para [acción principal] hay que hacer [N] cosas en orden: [resumen breve
del flujo, mencionando los pasos clave]. Empezamos verificando [X] y
terminamos imprimiendo una venta de prueba.

### Paso 1 — ...
```

Ese párrafo se vuelve una tarjeta recuperable que responde preguntas tipo
"¿cuáles son los pasos?" o "¿qué necesito hacer para configurar X?".

### Regla 5 — FAQ atomizadas en `### H3` individuales

Tradicionalmente las FAQ se escriben como una pila de `**¿Pregunta?**` + respuesta.
Eso genera **UNA SOLA TARJETA** con todas las preguntas mezcladas. Si el chat
recupera esa tarjeta para una pregunta puntual, el LLM tiene que filtrar las otras
5 respuestas irrelevantes.

```
❌ Mal (todas las FAQ en una sola tarjeta):
## Preguntas frecuentes

**¿Puedo tener un nombre diferente en los tickets?**
Sí, el campo Nombre en facturas es independiente...

**¿Los tickets anteriores cambian si actualizo el NIT?**
Sí, los datos se leen al momento de reimprimir...

**¿Puedo conectar dos impresoras al mismo tiempo?**
No, Bistro gestiona una impresora a la vez...
```

```
✅ Bien (cada FAQ es su propia tarjeta con breadcrumb único):
## Preguntas frecuentes

[Párrafo introductorio breve sobre qué tipo de dudas cubre esta sección]

### FAQ — ¿Puedo tener un nombre diferente en los tickets?

Sí, el campo **Nombre en facturas** es independiente...

### FAQ — ¿Los tickets anteriores cambian si actualizo el NIT?

Sí, los datos se leen al momento de reimprimir...

### FAQ — ¿Puedo conectar dos impresoras al mismo tiempo?

No, Bistro gestiona una impresora a la vez...
```

Cada FAQ atomizada se recupera con precisión cuando alguien pregunta exactamente
eso. El breadcrumb queda como "...> Preguntas frecuentes > FAQ — ¿Puedo...?".

### Regla 6 — Headings descriptivos, no genéricos

El heading **es parte del embedding** porque queda en el breadcrumb. Headings
genéricos pierden señal semántica.

```
❌ Genérico:
### Detalles
### Más información
### Notas
### Paso 1

✅ Descriptivo:
### Paso 1 — Verificar que la impresora está conectada al PC
### Paso 4 — Completar los datos comerciales del ticket
### FAQ — ¿Los tickets anteriores cambian si actualizo el NIT?
### Errores comunes — Diagnóstico cuando la impresora no aparece
```

Repetí palabras clave de la sección en el heading. Si el chat tiene que recuperar
un fragmento sobre "datos del ticket", el embedding del heading "Paso 4 — Completar
los datos comerciales del ticket" pesa mucho más que "Paso 4".

### Regla 7 — Pasos balanceados en tamaño

Si tenés un `### Paso 1` de 100 líneas y un `### Paso 2` de 5 líneas, los chunks
quedan desbalanceados. El chunk grande "ahoga" al chico en relevancia para
preguntas amplias. Apuntá a que cada paso tenga un peso semántico parecido.

```
❌ Desbalanceado:
### Paso 1 — Instalar Zadig (60 líneas)
### Paso 2 — Configurar datos (100 líneas)   ← gigante
### Paso 3 — Conectar (5 líneas)             ← enano
### Paso 4 — Verificar (8 líneas)            ← enano

✅ Balanceado (mismo contenido, mejor distribuido):
### Paso 1 — Verificar conexión (10 líneas)
### Paso 2 — Instalar Zadig (40 líneas)
### Paso 3 — Abrir Ajustes (15 líneas)
### Paso 4 — Completar datos (25 líneas)
### Paso 5 — Guardar (10 líneas)
### Paso 6 — Conectar impresora (15 líneas)
### Paso 7 — Verificar imprimiendo (15 líneas)
```

---

## Estructura canónica de una guía bien chunkeable

```markdown
# Cómo [acción] en Bistro

> 👤 Guía para: [rol]
> 🧩 Módulo: [nombre]
> ⏱️ Tiempo estimado: [X minutos]

---

## ¿Para qué sirve?

[2-3 líneas con sinónimos de la acción principal]

---

## Antes de empezar

- [Requisito 1]
- [Requisito 2]
- [Requisito 3]

[Opcional: diagrama de decisión "¿qué necesitás según el caso?"]

---

## Paso a paso

[Párrafo introductorio: resumen del flujo, ~3-4 líneas explicando qué se
va a hacer en orden. NO dejar este H2 sin texto — sería descartado.]

---

### Paso 1 — [Acción descriptiva del primer paso]

[Contenido del paso. ≤ 1200 chars. Incluye mockup UI o diagrama de lógica
según corresponda.]

---

### Paso 2 — [Acción descriptiva]

[Contenido. ≤ 1200 chars.]

---

### Paso 3 — [Acción descriptiva]

[Contenido. ≤ 1200 chars.]

---

(... más pasos si hace falta — preferí 7 pasos chicos a 3 pasos enormes ...)

---

## Errores comunes

| Situación | Qué hacer |
|-----------|-----------|
| [Error 1] | [Solución 1] |
| ...       | ...       |

[Opcional: diagramas de decisión "diagnóstico cuando X falla"]

---

## Preguntas frecuentes

[Párrafo introductorio breve sobre qué tipo de dudas cubre esta sección.
Imprescindible para que la sección no se descarte.]

---

### FAQ — ¿[Pregunta 1]?

[Respuesta autocontenida. Incluye diagrama si aplica.]

---

### FAQ — ¿[Pregunta 2]?

[Respuesta autocontenida.]

---

### FAQ — ¿[Pregunta 3]?

[Respuesta autocontenida.]

(... una H3 por pregunta, no todas juntas ...)
```

---

## Cómo auditar la estructura de una guía existente

Cuando recibís una guía para actualizar, antes de tocar nada, hacé este recorrido:

### Check 1 — ¿Hay `####` o headings más profundos?

```bash
# Buscar headings de nivel 4+
grep -n "^####" docs/guias_usuario/[archivo].md
```

Si hay, decidí para cada uno:
- ¿Es contenido sustancial que merece ser su propia tarjeta? → **Promover a `###`**
- ¿Es una pista visual menor (label de un mockup, separador interno)? → Cambiar a **negrita** o eliminar

### Check 2 — ¿Cada `## Sección` tiene cuerpo > 30 chars?

Especialmente `## Paso a paso` y `## Preguntas frecuentes`. Si solo están seguidas
de un `###` sin texto en medio, el parser las descarta.

### Check 3 — ¿Algún `### Paso` o `## Sección` supera 1200 chars?

Contá líneas: ~30 líneas markdown ≈ 1200 chars. Si una sección las supera y tiene
mockups ASCII, **partila en sub-pasos H3** para evitar que el chunker corte en
medio de un mockup.

### Check 4 — ¿Las FAQ están atomizadas?

Si la sección `## Preguntas frecuentes` es una pila de `**¿Pregunta?**` + respuesta
sin H3 separadores, convertí cada pregunta en su propio `### FAQ — ¿Pregunta?`.

### Check 5 — ¿Los headings son descriptivos?

`### Paso 3` no aporta nada al embedding. `### Paso 3 — Abrir el panel de Ajustes
de Facturación` sí. Renombrá los headings genéricos.

### Check 6 — ¿Los pasos están balanceados?

Si ves un paso gigante y varios enanos, redistribuí: parte el grande, fusiona los
chicos o redistribuilos según lo que tenga sentido para el flujo.

---

## Errores típicos que rompen el chunking

| Anti-patrón | Por qué falla | Cómo arreglarlo |
|-------------|---------------|-----------------|
| Sub-paso importante bajo `####` | El parser ignora H4+ | Promover a `###` |
| `## Paso a paso` sin texto introductorio | Cuerpo < 30 chars → descartado | Agregar párrafo de resumen del flujo |
| Un solo `### Paso 2` enorme (3000+ chars) con mockups dentro | Chunker corta en medio del ASCII | Partir en sub-pasos H3 más chicos |
| FAQ todas en un solo bloque con `**¿?**` | Una sola tarjeta con todas las preguntas mezcladas | Atomizar: un `### FAQ — ¿?` por pregunta |
| Headings genéricos (`### Detalles`, `### Más info`) | Breadcrumb sin señal semántica | Renombrar con palabras clave de la sección |
| Pasos súper desbalanceados (uno de 100 líneas, otro de 5) | Chunk grande domina a los chicos en relevancia | Redistribuir contenido |
| `## Preguntas frecuentes` sin párrafo intro | Descartado por filtro de tamaño mínimo | Agregar 1-2 líneas introductorias |

---

## Resumen ejecutivo

1. **Solo H1, H2, H3 son tarjetas.** Los `####` desaparecen del índice.
2. **Cada paso = `### H3` propio.** Negrita y listas numeradas no generan tarjetas.
3. **Máx. 1200 chars por sección.** Si te pasás, partila en sub-pasos.
4. **Mín. 30 chars en el cuerpo.** Sin párrafo intro, la sección se descarta.
5. **FAQ atomizadas en `### H3` individuales.** Una pregunta = una tarjeta.
6. **Headings descriptivos.** Repetí palabras clave en el heading.
7. **Pasos balanceados.** Apuntá a 4-8 pasos parecidos en tamaño.
