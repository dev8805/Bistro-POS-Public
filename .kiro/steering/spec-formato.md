# Formato obligatorio de archivos Spec (Kiro Spec Format)

Reglas que debe respetar TODO archivo dentro de `.kiro/specs/<nombre-spec>/` para pasar la validación del linter "Kiro Spec Format". Los identificadores de sección van en INGLÉS (son IDs técnicos que reconoce el validador). El contenido descriptivo va en ESPAÑOL (regla `spec-idioma`).

## requirements.md

### Título obligatorio (exacto)

```markdown
# Requirements Document
```

NO agregar sufijo al título (no poner `# Requirements Document: Nombre del feature`). El nombre del feature va dentro de `## Introduction` en el primer párrafo, resaltado en negrita:

```markdown
# Requirements Document

## Introduction

Esta funcionalidad, **Nombre del Feature**, permite que…
```

### Secciones obligatorias

- `## Introduction` (requerida)
- `## Requirements` (requerida)
- `## Glossary` (recomendada)

### Estructura de cada requisito (bajo `## Requirements`)

Los sub-títulos de requisitos y criterios SÍ se escriben en español:

```markdown
### Requisito 1

**Historia de Usuario:** Como [rol], quiero [acción], para [beneficio].

#### Criterios de Aceptación

1.1. WHEN [evento], THE Sistema SHALL [comportamiento].
1.2. …
```

## design.md

### Título (libre en español)

```markdown
# Documento de Diseño: Nombre del Feature
```

### Secciones obligatorias (IDs en inglés)

- `## Overview` (requerida)
- `## Architecture` (requerida)
- `## Components and Interfaces` (requerida — nombre COMPLETO, no solo `## Components`)
- `## Data Models` (requerida)
- `## Error Handling` (recomendada)
- `## Correctness Properties` (recomendada)
- `## Testing Strategy` (recomendada)

### Propiedades de correctitud

Bajo `## Correctness Properties` cada propiedad usa este formato:

```markdown
### Property 1: Título descriptivo

*Para cualquier* [contexto], [comportamiento esperado].

**Validates: Requirements X.Y**
```

## tasks.md

### Título obligatorio (exacto)

```markdown
# Implementation Plan: Nombre del Feature
```

DEBE empezar con `Implementation Plan:`. Después de los dos puntos puede ir el nombre del feature en español.

### Secciones obligatorias (IDs en inglés)

- `## Overview` (recomendada)
- `## Task Dependency Graph` (requerida — ver estructura abajo)
- `## Tasks` (recomendada)
- `## Notes` (recomendada)

### Task Dependency Graph — DOS componentes obligatorios

La sección `## Task Dependency Graph` debe incluir **ambos**:

1. **Diagrama ASCII** con las flechas de dependencia (para lectura humana).
2. **Bloque JSON con `waves`** (para la máquina). Sin el JSON, el validador falla con `tasks/missing-dag-json`.

Ejemplo:

````markdown
## Task Dependency Graph

```
Task 1 (base)
   │
   ├─→ Task 2 (depende de 1)
   │       └─→ Task 3 (depende de 2)
   └─→ Tasks 4.x * (opcionales, dependen solo de 1)
```

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1.1"],
      "description": "Crear módulo base"
    },
    {
      "wave": 2,
      "tasks": ["2.1", "4.1", "4.2"],
      "description": "Tareas paralelas que dependen solo de Task 1"
    },
    {
      "wave": 3,
      "tasks": ["3.1"],
      "description": "Depende de Task 2"
    }
  ]
}
```
````

Reglas del JSON:
- Cada wave agrupa tareas que se pueden ejecutar en paralelo.
- Los IDs de tareas coinciden con los IDs de la sección `## Tasks` (ej: `"1.1"`, `"3.2"`).
- La descripción va en español.

### Estructura de una tarea (bajo `## Tasks`)

```markdown
- [ ] N. Título de la tarea principal
  - [ ] N.1 Descripción de la sub-tarea
    - Detalle 1
    - Detalle 2
    - _Requirements: X.Y, X.Z_

  - [ ]* N.2 Sub-tarea opcional (property test o similar)
    - **Property X: Título**
    - **Validates: Requirements X.Y**
```

El sufijo `*` en `- [ ]*` marca tareas opcionales.

## Checklist rápido antes de cerrar un spec

- [ ] `requirements.md` empieza con `# Requirements Document` exacto
- [ ] `requirements.md` tiene `## Introduction`, `## Requirements` (y `## Glossary`)
- [ ] `design.md` tiene `## Overview`, `## Architecture`, `## Components and Interfaces`, `## Data Models`
- [ ] `design.md` incluye `## Error Handling`, `## Correctness Properties`, `## Testing Strategy`
- [ ] `tasks.md` empieza con `# Implementation Plan: …`
- [ ] `tasks.md` tiene `## Task Dependency Graph` CON diagrama ASCII Y bloque JSON de waves
- [ ] `tasks.md` tiene `## Tasks`, `## Overview` y `## Notes`
