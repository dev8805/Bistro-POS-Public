# Implementation Plan: Soporte para Trial Vencido

## Overview

El plan implementa la pantalla de bloqueo por trial vencido con un **chat de soporte dedicado y reducido**, en vez de reutilizar el `RagChatWidget` completo (con sus pestañas CHAT/SOPORTE/BASE, chat IA, base de conocimiento, feedback y tutoriales) que no luce profesional en este contexto.

El núcleo es un componente nuevo, `components/rag/SupportChatWidget.tsx`, que es un **duplicado simplificado** del `RagChatWidget`: conserva solo la parte de la conversación de soporte con el desarrollador (chip ID negocio, lista de mensajes, input con adjuntar + dictado + enviar, barra de estado "Consulta enviada / Conectado con soporte" y "Terminar conversación", lightbox de adjuntos y sonido de mensaje del dev). Reutiliza los hooks existentes (`useSupportSession`, `useDictation`, `useToast`, `useAuth`, `useBusinessSettings`) sin modificarlos. Como en la pantalla de trial vencido no hay pregunta previa a un bot, el widget hace **auto-escalado** una sola vez al abrirse (vía `useEffect` + `ref` de guarda), creando la sesión de soporte con `original_question` = "Solicitud de soporte: mi prueba gratuita terminó" y `user_screen` = "Trial vencido".

Luego se ajusta `components/TrialExpiredScreen.tsx` para montar el nuevo `SupportChatWidget` (con props reducidas `{ isOpen, onClose, isOnline }`) en la variante de administrador, conservando el estado `chatOpen` y sus handlers, y sin cambios en la variante de empleado. Los tests (unitarios y de propiedades) cierran el ciclo mockeando `useSupportSession` para asertar el gating por rol, el montaje del widget, el auto-escalado y la ausencia de pestañas/IA/base.

Cada tarea construye sobre la anterior y termina cableando el componente en el árbol de la app, sin dejar código huérfano. No se modifican `RagChatWidget`, el asistente IA, `useSupportSession` ni las edge functions.

## Task Dependency Graph

```
Task 1.1 (crear SupportChatWidget dedicado + auto-escalado)
   │
   ├─→ Task 2.1 (TrialExpiredScreen monta SupportChatWidget)
   │       │
   │       ├─→ Task 3.1 * (unit tests, mock useSupportSession)
   │       │
   │       └─→ Tasks 3.2 / 3.3 / 3.4 * (property tests)
   │
   └─→ (los tests dependen del componente + su montaje en TrialExpiredScreen)
```

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1.1"],
      "description": "Crear el componente dedicado SupportChatWidget con auto-escalado al abrir"
    },
    {
      "wave": 2,
      "tasks": ["2.1"],
      "description": "Actualizar TrialExpiredScreen para montar SupportChatWidget con props reducidas"
    },
    {
      "wave": 3,
      "tasks": ["3.1", "3.2", "3.3", "3.4"],
      "description": "Tests unitarios y de propiedades (mock de useSupportSession), dependen del componente y su montaje"
    }
  ]
}
```

## Tasks

- [ ] 1. Crear el componente dedicado SupportChatWidget
  - [ ] 1.1 Crear `components/rag/SupportChatWidget.tsx`
    - Componente funcional con props reducidas: `interface SupportChatWidgetProps { isOpen: boolean; onClose: () => void; isOnline: boolean; }`
    - Reutilizar los hooks existentes SIN modificarlos: `useSupportSession`, `useDictation`, `useToast`, `useAuth`, `useBusinessSettings`
    - Portar del `RagChatWidget` únicamente la parte de soporte:
      - `supportContent`: chip con "ID de tu negocio" (copiable), lista de mensajes de la conversación, input con acciones de adjuntar + dictado + enviar, barra de estado con etiquetas "Consulta enviada" / "Conectado con soporte" y acción "Terminar conversación"
      - `renderSupportMessage` (renderizado de cada burbuja de mensaje del cliente/dev)
      - `attachmentLightbox` (visor de adjuntos ampliados)
      - `playDevMessageSound` (sonido al recibir respuesta del dev)
    - Descartar por completo: chat con IA, base de conocimiento, barra de pestañas CHAT/SOPORTE/BASE, feedback 👍/👎, tutoriales, `adminModals`
    - Auto-escalado al abrir, una sola vez: `useEffect` guardado por un `ref` booleano (p. ej. `hasEscalatedRef`) que, cuando `isOpen` es `true` y aún no se escaló, llama `escalate({ original_question: "Solicitud de soporte: mi prueba gratuita terminó", user_screen: "Trial vencido" })`
    - Header simple: título "Soporte Bistro" + botón de cerrar (llama `onClose`)
    - Layout responsive con Tailwind (paleta Warm Bistro): desktop como panel `fixed` + backdrop; mobile como full-screen con slide-in; SIN barra de pestañas
    - Accesibilidad: usar `<button>` nativos con `aria-label` descriptivo, `tabIndex={0}` en interactivos no nativos y `onKeyDown` donde haya `onClick` no nativo
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 7.1, 7.2, 7.3, 7.4_

- [ ] 2. Cablear el widget dedicado en la pantalla de trial vencido
  - [ ] 2.1 Actualizar `components/TrialExpiredScreen.tsx`
    - Reemplazar el import de `RagChatWidget` por `SupportChatWidget` (`./rag/SupportChatWidget`)
    - Reemplazar el montaje del widget por `<SupportChatWidget isOpen={chatOpen} onClose={handleCloseChat} isOnline={isOnline} />`
    - Quitar las props que ya no aplican al pasar al widget dedicado: `onToggleMinimize`, `onConversationChange`, `currentScreen`, `isMinimized` (y el estado `chatMinimized` y su handler si solo servían al `RagChatWidget`)
    - Conservar el estado `chatOpen` y los handlers de abrir/cerrar (`handleOpenChat` / `handleCloseChat`)
    - Variante empleado: sin cambios (mensaje + "Cerrar sesión", sin botón de soporte, sin montar widget)
    - _Requirements: 1.1, 1.3, 2.1, 2.8, 5.4, 5.5, 6.3_

- [ ] 3. Tests del componente
  - [ ]* 3.1 Escribir unit tests de la integración TrialExpiredScreen + SupportChatWidget
    - Mockear `useSupportSession` (p. ej. `vi.mock`) exponiendo un `escalate` espía y estado controlado, para aislar la UI
    - Render admin (`isAdmin=true`): aparece el botón "Hablar con soporte"; al hacer click se monta el `SupportChatWidget`
    - Auto-escalado: al montar/abrir el widget, `escalate` se invoca exactamente una vez con `{ original_question: "Solicitud de soporte: mi prueba gratuita terminó", user_screen: "Trial vencido" }`
    - Render empleado (`isAdmin=false`): el `SupportChatWidget` NO se monta y no aparece el botón de soporte
    - Ausencia de UI del asistente: verificar que dentro del `SupportChatWidget` NO se renderizan pestañas (CHAT/SOPORTE/BASE), ni chat IA, ni base de conocimiento
    - _Requirements: 1.3, 2.1, 2.3, 2.4, 3.1, 3.2, 3.3, 5.4, 5.5_

  - [ ]* 3.2 Escribir property test de gating por rol
    - Generar `isAdmin` aleatorio y verificar que el botón "Hablar con soporte" y el montaje del `SupportChatWidget` coinciden exactamente con `isAdmin`
    - **Property 1: El botón y el widget dependen del rol**
    - **Validates: Requirements 1.1, 1.3, 4.1, 4.2, 4.4, 4.5**

  - [ ]* 3.3 Escribir property test de no-montaje del widget para el empleado
    - Con `isAdmin=false`, generar secuencias aleatorias de interacciones y verificar que el `SupportChatWidget` nunca se monta ni hay ruta de escalada
    - **Property 2: El empleado nunca monta el widget de soporte**
    - **Validates: Requirements 4.4, 4.5**

  - [ ]* 3.4 Escribir property test de auto-escalado único
    - Con `isAdmin=true`, generar secuencias aleatorias de abrir/cerrar/reabrir y verificar que `escalate` se invoca a lo sumo una vez con el payload esperado (el `ref` de guarda evita sesiones duplicadas)
    - **Property 3: El widget solo es visible tras abrir soporte**
    - **Validates: Requirements 2.1, 3.1, 3.2, 3.3**

- [ ] 4. Checkpoint - Verificar build y tests
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Las tareas marcadas con `*` son opcionales (unit tests y property tests) y pueden omitirse para un MVP más rápido.
- **`SupportChatWidget` es un duplicado independiente:** el `RagChatWidget` y el asistente IA NO se modifican. El nuevo componente vive en `components/rag/SupportChatWidget.tsx` y solo porta la parte de soporte.
- **No se tocan** `useSupportSession` ni las edge functions (`support-escalate`, Telegram, etc.): el nuevo widget reutiliza el hook existente tal cual y toda la comunicación bidireccional ya vive en esa cadena.
- El **auto-escalado** usa un `ref` de guarda para invocar `escalate` una sola vez por apertura y evitar crear sesiones de soporte duplicadas si `isOpen` cambia o el componente re-renderiza.
- La variante de empleado de `TrialExpiredScreen` no cambia: sigue mostrando el mensaje para avisar al administrador y el botón "Cerrar sesión", sin botón de soporte ni montaje del widget.
- Cada tarea referencia criterios de aceptación específicos para trazabilidad; los property tests referencian explícitamente su propiedad de diseño.
