---
name: grill-with-docs
description: Entrevista e interroga implacablemente al usuario sobre una nueva función, idea o cambio arquitectónico antes de programar, detectando contradicciones con el código y registrando el glosario en CONTEXT.md y decisiones en docs/adr/. Úsese cuando el usuario quiera planificar una feature, discutir un diseño, o use frases como "grill me", "interrógame", "pon a prueba mi idea", "grill-with-docs", "vamos a diseñar", "planeemos esta función".
---

# Grill With Docs — Bistro POS

Entrevista estructurada y rigurosa para someter a prueba cualquier plan, funcionalidad o decisión de diseño en Bistro POS antes de escribir una sola línea de código. 

Esta habilidad combina dos objetivos:
1. **Alinear y clarificar la idea** mediante preguntas en rondas estructuradas (Grilling).
2. **Dejar memoria permanente en el proyecto** actualizando el glosario de términos (`CONTEXT.md`) y documentando decisiones clave en registros de arquitectura (`docs/adr/`).

---

## Cuándo activar esta skill

- El usuario propone una nueva funcionalidad o cambio importante y aún no está definido al 100%.
- El usuario usa disparadores como: `"grill me"`, `"grill-with-docs"`, `"interrógame"`, `"pon a prueba mi idea"`, `"vamos a planificar"`, `"quiero diseñar X"`.
- Hay ambigüedad en los términos o riesgo de romper la arquitectura existente (offline, sincronización Supabase, lógica de facturación o inventario).

---

## Flujo de Trabajo

### Fase 0 — Verificación previa en el código (Silenciosa)
Antes de formular preguntas, revisa rápidamente el código y la documentación existente relevante:
1. Inspecciona si el concepto ya existe en `types.ts`, `CLAUDE.md`, o en `docs/caracteristicas/`.
2. Verifica si la idea choca con los invariantes del proyecto:
   - Soporte **Offline-first** (¿requiere internet obligatorio o debe encolarse en IndexedDB?).
   - Negocios identificados por **`public_id`** (nunca asumir UUID `id` en lógica de negocio).
   - Sin efectos colaterales en ventas, turnos de caja o facturas ya emitidas.
3. Anota internamente cualquier contradicción para sacarla a la luz en las preguntas.

---

### Fase 1 — La Entrevista por Rondas (Grilling)

Interroga al usuario modelando las decisiones como un **árbol de diseño**: cada decisión abre ramas secundarias.

#### Reglas de las preguntas:
1. **Pregunta solo la "frontera":** Formula únicamente las preguntas cuyos prerrequisitos ya estén resueltos. No preguntes detalles de implementación de algo cuya existencia no se ha aprobado.
2. **Formato en rondas:** Agrupa las preguntas de la ronda actual (generalmente de 2 a 4 preguntas clave).
3. **Incluye recomendación directa:** Para cada pregunta, ofrece opciones claras y di cuál recomiendas para Bistro POS y por qué.
4. **Detén la ejecución y espera:** No asumas respuestas ni continúes hasta que el usuario responda la ronda.

#### Formato de cada pregunta:
```markdown
❓ **P1 — [Título corto del dilema]**:
[Contexto breve y didáctico de la decisión].
¿Cómo debería manejarse?
a) [Opción A]
b) [Opción B]
c) [Opción C]

➡️ **Recomendación para Bistro**: [Opción recomendada y motivo técnico/de negocio].
```

---

### Fase 2 — Registro de Términos en `CONTEXT.md`

`CONTEXT.md` es el **glosario oficial del negocio** en la raíz del proyecto. Sirve para que la IA y los desarrolladores hablen exactamente el mismo idioma y no inventen sinónimos confusos.

- **Cuándo escribir:** En el momento exacto en que un término quede aclarado y acordado con el usuario (no esperar al final).
- **Qué contiene:** Qué **ES** el término en 1 o 2 oraciones, y qué palabras evitar en `_Evitar_`.
- **Qué NO contiene:** Detalles de código, funciones, rutas de archivos o notas temporales de chat.
- **Creación perezosa (lazy):** Si `CONTEXT.md` no existe en la raíz, créalo al registrar el primer término.

*Ver guía completa de formato en [CONTEXT-FORMAT.md](file:///c:/Users/HP/OneDrive/Escritorio/Bistro/.agents/skills/grill-with-docs/CONTEXT-FORMAT.md).*

---

### Fase 3 — Registro de Decisiones de Arquitectura (ADR)

Un ADR (Architecture Decision Record) es un registro permanente de una decisión técnica importante guardado en `docs/adr/000X-[nombre-descriptivo].md`.

#### Los 3 filtros obligatorios:
Solo se crea un ADR si la decisión cumple **LOS TRES** criterios:
1. **Difícil de revertir:** Cambiar de opinión más adelante costaría días de refactorización o migración de datos.
2. **Sorprendente sin contexto:** Un programador o una IA en el futuro vería el código y se preguntaría *"¿Por qué demonios lo hicieron así?"*.
3. **Resultado de un trade-off real:** Había alternativas viables y se eligió una con pros y contras claros.

Si no cumple los 3 filtros, **no se crea un ADR** (una decisión simple solo se aplica y no genera ruido).

*Ver plantilla y reglas en [ADR-FORMAT.md](file:///c:/Users/HP/OneDrive/Escritorio/Bistro/.agents/skills/grill-with-docs/ADR-FORMAT.md).*

---

### Fase 4 — Cierre y Transición

Cuando todas las preguntas del árbol queden resueltas:
1. Presenta un resumen ejecutivo de lo acordado (alcance claro, términos asentados y decisiones tomadas).
2. Pregunta si se procede con la fase de implementación (usando `implementar-feature-bistro` o el flujo estándar).
