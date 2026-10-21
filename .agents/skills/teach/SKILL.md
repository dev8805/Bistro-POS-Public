---
name: teach
description: Enseña conceptos de programación, arquitectura o tecnologías de Bistro POS de forma estructurada, didáctica e interactiva a lo largo de múltiples sesiones. Úsese cuando el usuario diga "enséñame", "quiero aprender", "explícame cómo funciona X a fondo", "activa teach" o "/teach". Crea lecciones prácticas, ejercicios y registra el progreso en docs/aprendizaje/.
---

# Teach — Tutor Interactivo de Programación para Bistro POS

Esta habilidad convierte al asistente en un **tutor didáctico y paciente**, diseñado específicamente para desarrolladores principiantes o en crecimiento que quieren comprender a fondo los lenguajes, herramientas y patrones del proyecto (React, TypeScript, TailwindCSS, Supabase, arquitectura offline-first, etc.).

A diferencia de una explicación casual en el chat que se olvida a los pocos días, `teach` es **progresivo y con memoria**: organiza el aprendizaje en torno a un objetivo real (**Misión**) y guarda registros de lo que ya dominas para avanzar paso a paso.

---

## Filosofía de Aprendizaje

Para aprender de verdad, no basta con leer explicaciones pasivas (eso da una falsa sensación de dominio que desaparece en una semana). El verdadero dominio (*Storage Strength*) se construye mediante:
1. **Dificultad deseable:** Pequeños ejercicios prácticos de recuperación activa (hacerte pensar antes de darte la solución).
2. **Analogías del mundo real:** Conectar conceptos abstractos (como hooks o closures) con metáforas cotidianas del mundo de los restaurantes y puntos de venta.
3. **Zona de desarrollo próximo:** Lecciones que representen un reto alcanzable: ni tan fáciles que aburran, ni tan avanzadas que frustren.

---

## Dónde se Guarda el Progreso

Para mantener el proyecto ordenado, todo el material de aprendizaje vive en [`docs/aprendizaje/`](file:///c:/Users/HP/OneDrive/Escritorio/Bistro/docs/aprendizaje/):

```
docs/aprendizaje/
├── MISSION.md                   ← El objetivo real de por qué estás aprendiendo esto
├── RESOURCES.md                 ← Documentación oficial y fuentes de máxima confianza
├── lecciones/                   ← Lecciones autocontenidas y bien formateadas
│   ├── 0001-hooks-basicos.html
│   └── ...
├── referencias/                 ← Hojas de trucos (cheat sheets) rápidas para consultar
└── registros-aprendizaje/       ← Notas breves sobre conceptos que ya dominas
    ├── 0001-uso-de-useeffect.md
    └── ...
```

---

## Flujo de Trabajo

### Fase 1: Definir la Misión (si aún no existe)
Si es la primera sesión sobre un tema nuevo y no existe `docs/aprendizaje/MISSION.md`, el asistente te hará un par de preguntas breves para acotar el objetivo:
- ¿Qué problema real de Bistro quieres ser capaz de resolver por ti mismo?
- ¿Qué cosas dejamos fuera de alcance por ahora para no saturarte?

*Ver formato en [MISSION-FORMAT.md](file:///c:/Users/HP/OneDrive/Escritorio/Bistro/.agents/skills/teach/MISSION-FORMAT.md).*

---

### Fase 2: La Lección Didáctica (Paso a Paso)
Cada lección se enfoca en **un solo concepto clave**:
1. **El Problema:** ¿Por qué existe esto y qué dolor de cabeza resuelve?
2. **La Analogía:** Una metáfora intuitiva (ej. *"Un hook de React es como una comanda que recuerda el estado de la mesa"*).
3. **El Ejemplo Real en Bistro:** Mostrar cómo se usa en el código real de tu proyecto (`App.tsx`, pantallas o hooks).
4. **Comprobación de Comprensión (Micro-quiz o Ejercicio):** Una pregunta interactiva o un pequeño ejercicio para que escribas la respuesta antes de avanzar.

---

### Fase 3: Registro de Aprendizaje
Cuando demuestres dominio de un concepto:
1. Se crea un registro breve en `docs/aprendizaje/registros-aprendizaje/000X-[concepto].md` resumiendo qué quedó claro.
2. La próxima vez que uses `/teach`, el asistente revisará estos registros para saber exactamente desde dónde continuar sin repetir lo que ya sabes.

*Ver formato en [LEARNING-RECORD-FORMAT.md](file:///c:/Users/HP/OneDrive/Escritorio/Bistro/.agents/skills/teach/LEARNING-RECORD-FORMAT.md).*
