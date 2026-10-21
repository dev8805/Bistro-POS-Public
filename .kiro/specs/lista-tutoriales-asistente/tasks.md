# Implementation Plan: Lista de Tutoriales del Asistente

## Overview

Este plan implementa la lista curada de tutoriales dentro del asistente IA (`components/rag`) siguiendo estrictamente el diseño aprobado. El orden respeta las dependencias reales entre módulos:

1. **`components/rag/tutorials.ts`** (nuevo): capa de configuración/datos. Interface `TutorialConfig` (sin `icon`), arreglo `TUTORIALS` con imports `?raw`, validación de IDs duplicados, y helpers dev-only (`getDevOverlay`, `addDevOverlayEntry`, `buildTutorialSnippet`) + modelo `DevTutorialEntry` y clave `bistro:dev-tutorials`.
2. **`hooks/useRagChat.ts`** (editar): campo `kind?: 'tutorial'` en `RagMessage` y método `showTutorial` que solo hace `setMessages` (2 burbujas) sin tocar `historyRef` ni hacer `fetch`, con guarda de contenido vacío.
3. **`components/rag/RagChatWidget.tsx`** (editar): lista en estado inicial, `handleTutorialClick`, control "Lista de tutoriales" en header, derivaciones `hasOpenTutorial`/`currentTutorialId`, botón "Gestionar tutoriales" gateado por `import.meta.env.DEV` y fusión de lista en dev.
4. **`components/rag/TutorialDevManager.tsx`** (nuevo, dev-only): autodescubrimiento con `import.meta.glob`, previsualizar, agregar al overlay y copiar snippet, accesible.
5. **Tests** (Vitest + fast-check) para las 10 Correctness Properties y las pruebas de ejemplo/regresión del diseño.

Lenguaje de implementación: **TypeScript/React** (definido en el diseño, sin pseudocódigo).

## Task Dependency Graph

```
Task 1 (tutorials.ts — base, sin deps)
   │
   ├─→ Task 2 (useRagChat.ts: showTutorial) ── depende de 1
   │       │
   │       ├─→ Task 3 (RagChatWidget.tsx) ── depende de 1 y 2
   │       │       │
   │       │       └─→ Task 4 (TutorialDevManager.tsx) ── depende de 1, 2, 3
   │       │
   │       └─→ 2.2* (property tests hook) ── depende de 2
   │
   ├─→ 1.2* (property test snippet) ── depende de 1
   │
   ├─→ 3.2* / 3.3* (property/ejemplo widget) ── dependen de 3
   └─→ 4.2* (tests dev manager) ── dependen de 4
                                   │
                                   └─→ Task 5 (verificación final) ── depende de todo
```

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1.1"],
      "description": "Crear el módulo base de configuración tutorials.ts con TUTORIALS, validación de IDs y helpers dev-only."
    },
    {
      "wave": 2,
      "tasks": ["1.2", "2.1"],
      "description": "Property test del snippet (depende solo de 1) en paralelo con la edición del hook useRagChat (showTutorial)."
    },
    {
      "wave": 3,
      "tasks": ["2.2", "3.1"],
      "description": "Property tests del hook (dependen de 2.1) en paralelo con la edición del widget RagChatWidget (depende de 1.1 y 2.1)."
    },
    {
      "wave": 4,
      "tasks": ["3.2", "3.3", "4.1"],
      "description": "Property/ejemplo del widget (dependen de 3.1) en paralelo con la creación del panel dev TutorialDevManager (depende de 3.1)."
    },
    {
      "wave": 5,
      "tasks": ["4.2"],
      "description": "Tests del panel de gestión dev-only (dependen de 4.1)."
    },
    {
      "wave": 6,
      "tasks": ["5.1"],
      "description": "Verificación final: build y ejecución de la suite de tests."
    }
  ]
}
```

## Tasks

- [x] 1. Crear el módulo de configuración de tutoriales
  - [x] 1.1 Implementar `components/rag/tutorials.ts` con datos, validación y helpers dev-only
    - Definir la interface `TutorialConfig { id: string; title: string; content: string }` (sin campo `icon`).
    - Declarar el arreglo `TUTORIALS: TutorialConfig[]` con imports `?raw` de las guías de `docs/guias_usuario/` (ej. `como_crear_productos.md`), respetando el orden de declaración como orden de render.
    - Añadir la validación de IDs duplicados al cargar el módulo: en `import.meta.env.DEV` lanzar `Error`; en producción registrar `console.error` y continuar con la primera aparición.
    - Definir el modelo `DevTutorialEntry { id: string; title: string; sourceFile: string }` y la constante de clave `bistro:dev-tutorials`.
    - Implementar los helpers dev-only `getDevOverlay()` (lee localStorage + resuelve `content` con `import.meta.glob('../../docs/guias_usuario/*.md', { query: '?raw', import: 'default', eager: true })` por `sourceFile`, capturando errores de localStorage y retornando overlay vacío), `addDevOverlayEntry(entry)` (persiste en localStorage con manejo de excepción y `console.warn`) y `buildTutorialSnippet({ id, title, sourceFile })` (genera la línea `import ... ?raw` + entrada `{ id, title, content }` sin `icon`, con `varName` camelCase derivado del `sourceFile`).
    - Si TS no reconoce `*.md?raw`, añadir la declaración `declare module '*.md?raw'` en `vite-env.d.ts` o `types/raw.d.ts`.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 7.3, 7.5, 7.6, 7.7_

  - [ ]* 1.2 Escribir property test de `buildTutorialSnippet`
    - **Property 10: El snippet generado corresponde exactamente a la entrada seleccionada**
    - Generar entradas `{ id, title, sourceFile }` aleatorias y verificar que el snippet incluye el `import` del `sourceFile`, los mismos `id`/`title`, y no contiene la palabra `icon`.
    - **Validates: Requirements 7.6**

- [ ] 2. Editar el hook `useRagChat` para soportar tutoriales
  - [-] 2.1 Añadir `kind` a `RagMessage` e implementar `showTutorial`
    - Agregar el campo opcional `kind?: 'tutorial'` a la interface `RagMessage`.
    - Implementar `showTutorial(tutorial: { title: string; content: string })` con `useCallback` que solo llame a `setMessages` anexando dos burbujas: `{ role: 'user', content: title, kind: 'tutorial' }` y `{ role: 'assistant', content, kind: 'tutorial' }`, sin tocar `historyRef` ni hacer `fetch`.
    - Añadir la guarda de contenido vacío/`undefined`: insertar una burbuja de asistente con mensaje de error en español ("No se pudo cargar esta guía. Intenta con otro tutorial.") en lugar del contenido.
    - Exponer `showTutorial` en el objeto de retorno del hook junto a `messages`, `sendMessage`, `clearChat`, etc.
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 3.3_

  - [ ]* 2.2 Escribir property tests de `showTutorial` y del historial (con mock de `fetch`)
    - **Property 1: Abrir un tutorial nunca invoca a rag-chat/Gemini** — mockear `fetch` y verificar que `showTutorial` no lo invoca ni cambia `loading`. **Validates: Requirements 2.2**
    - **Property 2: El contenido del tutorial se excluye del historial enviado a Gemini** — tras abrir tutoriales y enviar una pregunta libre, el `history` no contiene el `content` de ninguna guía. **Validates: Requirements 3.3**
    - **Property 5: El contenido mostrado es literal e íntegro** — la burbuja de asistente tiene `content` idéntico al de la configuración. **Validates: Requirements 2.1**
    - **Property 7: Abrir un tutorial inserta título de usuario seguido de guía de asistente** — se anexan exactamente dos mensajes en orden (user=title, assistant=content). **Validates: Requirements 2.3**
    - Incluir también prueba de ejemplo: `content` vacío inserta la burbuja de error en español sin romper (Req 2.5).
    - **Validates: Requirements 2.1, 2.2, 2.3, 3.3**

- [ ] 3. Editar `RagChatWidget` para la lista, el header y el gate dev
  - [~] 3.1 Integrar lista de tutoriales, control de header y botón dev
    - Consumir `showTutorial` del hook y derivar `currentTutorialId` (último mensaje de tutorial con `role === 'user'` mapeado por `title`→`id`) y `hasOpenTutorial` (`messages.some(m => m.kind === 'tutorial')`) con `useMemo`.
    - En el estado inicial (`messages.length === 0 && !loading`): si `tutorialList.length > 0` renderizar la lista (solo `title`, en orden de config) con `<button>` accesibles (`aria-label`, `tabIndex={0}`, `onClick`, `onKeyDown`); si está vacía, caer a `STARTER_SUGGESTIONS` sin errores (Req 1.4).
    - Implementar `handleTutorialClick` (ignora si `loading` o `view !== 'chat'`), `handleTutorialMenuSelect` (llama `showTutorial` y cierra el menú) y `handleToggleTutorialMenu`.
    - Añadir el control "Tutoriales" en el header (desktop y móvil) como botón de **texto** con la etiqueta "Tutoriales" + flecha hacia abajo (chevron), sin ícono decorativo; visible solo cuando `hasOpenTutorial`; el dropdown muestra `TUTORIALS.filter(t => t.id !== currentTutorialId)`; cerrar sin elegir (Escape/clic fuera/re-toggle) no cambia el tutorial abierto; accesible por teclado con listener y cleanup en `useEffect`.
    - Añadir el botón "Gestionar tutoriales" gateado por `import.meta.env.DEV` que abre `TutorialDevManager`, y derivar la lista fusionada `const tutorialList = import.meta.env.DEV ? [...TUTORIALS, ...getDevOverlay()] : TUTORIALS;`.
    - No romper regresiones: pestaña BASE, `clearChat` (reset → estado inicial con lista), `offlineContent` y `msg.suggestions` intactos; las burbujas de tutorial se pintan con el mismo `<ChatMessage />` (assistant) y `<span>` (user).
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 4.5, 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.5, 7.7_

  - [ ]* 3.2 Escribir property tests de orden de lista, visibilidad del header y dropdown
    - **Property 3: El orden de la lista respeta la configuración** — el orden renderizado en estado inicial es idéntico al del arreglo. **Validates: Requirements 1.3**
    - **Property 4: El control del header aparece solo con un tutorial abierto** — visible si y solo si existe un mensaje con `kind === 'tutorial'`. **Validates: Requirements 4.1, 4.2**
    - **Property 6: El dropdown excluye el tutorial actual** — las opciones son exactamente `TUTORIALS` excepto el actualmente abierto. **Validates: Requirements 4.3**
    - **Validates: Requirements 1.3, 4.1, 4.2, 4.3**

  - [ ]* 3.3 Escribir pruebas de ejemplo y regresión del widget
    - Config vacía → estado inicial usa `STARTER_SUGGESTIONS` sin lista ni errores (Req 1.4).
    - Cerrar el dropdown sin seleccionar conserva el tutorial abierto (Req 4.5).
    - Tras abrir un tutorial, enviar una pregunta libre sigue llamando a `sendMessage` con normalidad (Req 3.1, 3.2).
    - Regresión: pestaña BASE, reset, modo offline y sugerencias de Gemini siguen funcionando (Req 6.1–6.4).
    - _Requirements: 1.4, 3.1, 3.2, 4.5, 6.1, 6.2, 6.3, 6.4_

- [ ] 4. Crear el panel de gestión dev-only `TutorialDevManager`
  - [~] 4.1 Implementar `components/rag/TutorialDevManager.tsx`
    - Componente montado solo cuando `import.meta.env.DEV`, con props tipadas `{ open, onClose, onPreview, onAdd }` (sin objetos inline como props).
    - Autodescubrimiento (Req 7.3): resolver `import.meta.glob('../../docs/guias_usuario/*.md', { query: '?raw', import: 'default', eager: true })` y listar cada archivo con su contenido; deshabilitar "Previsualizar"/"Agregar" y mostrar aviso si una guía no tiene contenido.
    - Input de título controlado (`handleTitleChange`), requerido antes de previsualizar/agregar (título vacío → retorno temprano con aviso en español).
    - `handlePreview` → `onPreview({ title, content })` (usa `showTutorial`, mismo comportamiento Req 2, sin red ni historial).
    - `handleAdd` → `onAdd({ id, title, sourceFile })` persistiendo el overlay en localStorage vía `addDevOverlayEntry`.
    - `handleCopySnippet` → `buildTutorialSnippet(entry)` + `navigator.clipboard.writeText`; si el portapapeles no está disponible, exponer el snippet en un `<textarea>` de solo lectura.
    - Accesibilidad: panel con `role="dialog"`, cierre con `Escape` y botón Cerrar; controles nativos con `aria-label` y navegación por teclado.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 4.2 Escribir tests del panel dev-only y del gate DEV/prod
    - **Property 8: El control de gestión nunca aparece en producción** — con `import.meta.env.DEV` en `false`, el botón/panel no se renderiza. **Validates: Requirements 7.1, 7.2**
    - **Property 9: El overlay de localStorage nunca se lee en producción** — la lista resuelta en producción es exactamente `TUTORIALS`, sin entradas del overlay. **Validates: Requirements 7.7**
    - Fusión `TUTORIALS + overlay` solo en dev (Req 7.5); `getDevOverlay` sin localStorage retorna overlay vacío sin romper; previsualizar invoca `showTutorial` (Req 7.4); copiar snippet usa clipboard o fallback a `<textarea>` (Req 7.6); título vacío no persiste ni previsualiza.
    - **Validates: Requirements 7.1, 7.2, 7.4, 7.5, 7.6, 7.7**

- [ ] 5. Checkpoint final de verificación
  - [~] 5.1 Ejecutar build y suite de tests
    - Correr `npm run build` y verificar que compila sin errores (incluyendo el tree-shaking del panel dev en producción).
    - Ejecutar la suite de tests (`vitest --run`) y asegurar que todas las property tests y pruebas de ejemplo pasan.
    - Asegurarse de que todas las pruebas pasan; preguntar al usuario si surgen dudas.
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

## Notes

- Las tareas marcadas con `*` son opcionales (property tests y pruebas de ejemplo/regresión) y pueden omitirse para un MVP más rápido.
- Cada tarea de código referencia los requisitos concretos (1.1–7.7) para trazabilidad; cada property test opcional referencia su Property del diseño (Property 1–10) y sus `Validates`.
- El orden respeta dependencias: `tutorials.ts` (base) → `useRagChat.ts` (`showTutorial`) → `RagChatWidget.tsx` (usa ambos) → `TutorialDevManager.tsx` (usa `showTutorial` + helpers).
- Soporte offline: esta funcionalidad no agrega flujos offline nuevos; solo debe **no romper** el `offlineContent` actual del chat libre (los tutoriales son locales y no requieren red).
- Accesibilidad obligatoria en todos los controles nuevos: `aria-label`, `tabIndex`, `onKeyDown`, cierre con `Escape` y clic fuera.
- El backend (Supabase, edge functions, Pinecone) no se toca en ninguna tarea.
- Property tests con **fast-check** + **Vitest**, mínimo 100 iteraciones, etiquetadas con `// Feature: lista-tutoriales-asistente, Property N: <texto>`.
