# Documento de Diseño: Soporte para Trial Vencido

## Overview

Esta funcionalidad muestra una pantalla de bloqueo específica cuando la suscripción de un negocio está en estado de **trial vencido** (`subscription?.status === 'trial'` dentro del bloque `hasActiveSubscription === false` de `App.tsx`). La pantalla diferencia la experiencia según el rol:

- **Administrador** (permiso `admin_settings`): ve un mensaje explicativo, un botón "Hablar con soporte" y la opción de cerrar sesión. Al pulsar el botón se abre el **chat de soporte dedicado y bidireccional** embebido en la misma pantalla, montando el componente nuevo `SupportChatWidget`.
- **Empleado** (sin `admin_settings`): ve un mensaje que lo invita a pedirle al administrador que renueve y la opción de cerrar sesión, sin acceso al chat de soporte y **sin montar** el `SupportChatWidget`.

**Cambio de rumbo (componente dedicado).** El diseño anterior montaba el `RagChatWidget` completo, que expone las pestañas CHAT/SOPORTE/BASE del asistente IA y no luce profesional en el contexto de un bloqueo por trial vencido. Ese enfoque **queda descartado**. Ahora `TrialExpiredScreen` monta un componente nuevo, dedicado y reducido: `components/rag/SupportChatWidget.tsx`. Es un **duplicado simplificado** del `RagChatWidget` que muestra ÚNICAMENTE la conversación de soporte con el desarrollador: sin pestañas, sin chat IA, sin base de conocimiento, sin feedback 👍/👎 y sin tutoriales.

Como en la pantalla de trial vencido no existe una pregunta previa al bot, el `SupportChatWidget` **auto-escala al abrirse** (una sola vez), creando la sesión de soporte con una pregunta original predefinida (`original_question: "Solicitud de soporte: mi prueba gratuita terminó"`) y el contexto de pantalla (`user_screen: "Trial vencido"`). Así el administrador entra directo a la conversación con el desarrollador.

El `SupportChatWidget` **reutiliza sin modificarlo** el hook `useSupportSession`, que ya encapsula la escalada (`support-escalate`), el envío de mensajes/adjuntos y la recepción de respuestas del desarrollador por Supabase Realtime. No se modifican `RagChatWidget`, `useSupportSession`, las edge functions, ni los planes públicos/personalizados vencidos.

```
┌──────────────────────────────────────────────────────────────┐
│ App.tsx · bloque hasActiveSubscription === false               │
│                                                                │
│   if (hasCustomPlan && customPlan) { ... }   ← SIN CAMBIOS     │
│                                                                │
│   if (subscription?.status === 'trial')      ← YA EXISTE       │
│      return <TrialExpiredScreen                                │
│               isAdmin={canPayCustom}                           │
│               onLogout={signOut}                               │
│               isOnline={isOnline} />          ← ya pasa isOnline│
│                                                                │
│   return <SubscriptionPlansScreen … />        ← SIN CAMBIOS    │
└──────────────────────────────────────────────────────────────┘
```

## Architecture

### Por qué un componente dedicado en vez del `RagChatWidget`

El `RagChatWidget` es un widget de ~2000 líneas que combina tres vistas (`chat`, `docs`, `support`) tras una barra de pestañas, además de feedback, tutoriales, panel admin y la base de conocimiento. En un bloqueo por trial vencido nada de eso aplica: el administrador solo necesita escribirle al desarrollador. Montar el widget completo:

- Expone pestañas y funcionalidad de IA irrelevantes para el contexto.
- Obliga a orquestar `view === 'support'`, auto-redirección y feedback que no se usan.
- No luce profesional como pantalla de contacto de soporte.

**Decisión:** crear `SupportChatWidget`, un componente independiente que **porta** solo la porción de soporte del `RagChatWidget` (el JSX de `supportContent`, `renderSupportMessage`, el lightbox de adjuntos y el sonido del dev) y **reutiliza el mismo hook** `useSupportSession`. El `RagChatWidget` original no se toca (Req 7.1, 7.4).

### Dónde se monta el widget

Igual que en el diseño previo, en `App.tsx` la rama de trial hace un `return` temprano y nunca llega al `return` principal donde vive el `RagChatWidget` de la app. Por eso el chat de soporte debe montarse **dentro de `TrialExpiredScreen`**, que sí se renderiza en ese return temprano.

```
App.tsx (AppContent)
│
├─ return TEMPRANO por trial vencido
│     if (subscription?.status === 'trial')
│        return <TrialExpiredScreen … />        ◄── aquí termina el render
│                 └─ (admin) monta <SupportChatWidget/>
│
└─ return PRINCIPAL de la app
      <RagChatWidget … />                       ◄── widget "normal" (no se usa aquí)
```

### Qué porta el `SupportChatWidget` del `RagChatWidget`

Copiado/portado tal cual (sin lógica de IA):

| Elemento portado | Origen en `RagChatWidget` |
|------------------|---------------------------|
| Hook `useSupportSession({ onDevMessage })` | expone `session`, `messages`, `escalate`, `sendClientMessage`, `closeSession`, `addOptimisticMessage`, `markMessageFailed`, `removeMessage`, `loading`, `error`, `previousClosedSessions`. El Realtime del dev vive dentro del hook. |
| `useDictation` (dictado por voz) | opcional; se porta el patrón `baseInputRef` + `handleStartDictation`. |
| `useToast`, `useAuth` (`profile`), `useBusinessSettings` (`businessCode`) | contextos existentes. |
| JSX de `supportContent` | chip "ID de tu negocio" copiable, lista de mensajes, barra de estado + "Terminar conversación", input con adjuntar (`handleSupportAttach`), thumbnails, botón enviar/dictado. |
| `renderSupportMessage` | render de burbujas cliente/dev (imagen/video/audio/documento). |
| `attachmentLightbox` (`viewingAttachment`) | visor de adjuntos a pantalla completa. |
| `playDevMessageSound` | sonido "pop" al llegar mensaje del dev. |
| Layout desktop/móvil | panel `fixed` con backdrop (desktop) y full-screen slide-in (móvil), **sin la barra de pestañas**. |

### Qué descarta el `SupportChatWidget` (no se porta)

`useRagChat`, `useRagDocuments`, `chatContent`, `docsContent`, feedback 👍/👎 (`renderFeedback`), tutoriales (`TUTORIALS`, `TutorialDevManager`, menús), pestañas CHAT/SOPORTE/BASE, `historyContent`, modales admin y `STARTER_SUGGESTIONS`.

### Auto-escalado (una sola vez)

Al montarse con `isOpen === true` y sin sesión activa, el widget dispara **exactamente una vez** el escalado. Se usa un `useRef` como guardia para no duplicar la llamada en re-renders:

```
isOpen ── false ──► (no monta contenido, no escala)
   │
   └─ true ─► useEffect:
        if (!escalatedRef.current && !session activa && !loading) {
          escalatedRef.current = true;
          escalate({ original_question: "Solicitud de soporte: mi prueba gratuita terminó",
                     user_screen: "Trial vencido" })
            .catch(() => { escalatedRef.current = false; /* permite reintento manual */ });
        }
```

Tras escalar, el input envía mensajes con `support.sendClientMessage` (mismo patrón que el `inSupportMode` del original).

### Integración con `TrialExpiredScreen`

`TrialExpiredScreen` (variante admin) importa y monta `<SupportChatWidget isOpen={chatOpen} onClose={handleCloseChat} isOnline={isOnline} />` y **ya no monta el `RagChatWidget`**. La variante empleado sigue igual (mensaje + cerrar sesión, sin widget). `App.tsx` no requiere cambios adicionales: ya pasa `isOnline` a `TrialExpiredScreen`.

## Components and Interfaces

### Componente nuevo: `components/rag/SupportChatWidget.tsx`

Componente funcional autocontenido. Props reducidas respecto al `RagChatWidget`:

```tsx
interface SupportChatWidgetProps {
  /** Controla la visibilidad del panel y dispara el auto-escalado al abrir. */
  isOpen: boolean;
  /** Cierra el panel (vuelve a la variante admin de TrialExpiredScreen). */
  onClose: () => void;
  /** Estado de conexión; bloquea el envío cuando no hay internet. */
  isOnline: boolean;
}

const SupportChatWidget = ({ isOpen, onClose, isOnline }: SupportChatWidgetProps) => {
  const { showToast } = useToast();
  const { profile } = useAuth();
  const { businessCode } = useBusinessSettings();

  const support = useSupportSession({
    onDevMessage: useCallback(() => { playDevMessageSound(); }, []),
  });

  const [input, setInput] = useState('');
  const [pendingSupportAttachments, setPendingSupportAttachments] =
    useState<{ file: File; preview: string | null }[]>([]);
  const [viewingAttachment, setViewingAttachment] =
    useState<{ url: string; type: 'image' | 'video' | 'document'; filename?: string } | null>(null);
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768);

  const escalatedRef = useRef(false);

  // Auto-escalado exactamente una vez al abrir.
  useEffect(() => {
    if (!isOpen) return;
    if (escalatedRef.current) return;
    const hasActiveSession = !!support.session && support.session.status !== 'closed';
    if (hasActiveSession || support.loading) return;
    escalatedRef.current = true;
    support.escalate({
      original_question: 'Solicitud de soporte: mi prueba gratuita terminó',
      user_screen: 'Trial vencido',
    }).catch(() => { escalatedRef.current = false; /* permite reintento */ });
  }, [isOpen, support.session, support.loading, support.escalate]);

  // ... handlers portados: handleSend, handleSupportAttach, handleCopyBusinessCode,
  //     dictado (handleStartDictation), renderSupportMessage, attachmentLightbox ...

  if (!isOpen) return null;

  // Layout: panel fixed + backdrop (desktop) / full-screen slide-in (móvil),
  // SIN barra de pestañas. Header: support_agent + "Soporte Bistro" + subtítulo
  // de estado + botón cerrar (X).
};

export default SupportChatWidget;
```

#### Responsabilidades

| Elemento | Comportamiento |
|----------|----------------|
| Auto-escalado | Al abrir sin sesión activa, invoca `support.escalate(...)` una sola vez (guardado por `escalatedRef`). |
| Header | Ícono `support_agent` + título "Soporte Bistro" + subtítulo de estado + botón cerrar (X → `onClose`). Sin barra de pestañas. |
| Chip ID negocio | Muestra `#{businessCode}` con botón copiar (`handleCopyBusinessCode`). |
| Lista de mensajes | Renderiza `support.messages` con `renderSupportMessage` (burbujas cliente/dev, imagen/video/audio/documento). |
| Barra de estado | "Consulta enviada" (sin respuesta del dev) / "Conectado con soporte" (`devHasResponded`) + botón "Terminar conversación" (`support.closeSession`). |
| Input | Texto + adjuntar (`handleSupportAttach`) + thumbnails + enviar/dictado. Envía con `support.sendClientMessage`. Se bloquea si `!isOnline`. |
| Lightbox | Visor de adjuntos a pantalla completa (`viewingAttachment`), cerrable con ESC. |
| Sonido dev | `playDevMessageSound` al recibir un mensaje del desarrollador. |

#### Estados derivados portados

```ts
const inSupportMode = !!support.session && support.session.status !== 'closed';
const devHasResponded = inSupportMode && support.messages.some(m => m.role === 'developer');
```

#### Accesibilidad

- Botón cerrar, botón copiar ID, botón "Terminar conversación" y botón enviar son `<button>` nativos con `aria-label` descriptivo.
- El input soporta `Enter` para enviar (`Shift+Enter` = salto de línea) vía `handleKeyDown`.
- El lightbox cierra con `Escape`.

### Componente modificado: `components/TrialExpiredScreen.tsx`

Cambia el montaje del chat: en la variante admin monta `SupportChatWidget` en lugar de `RagChatWidget`. La variante empleado no cambia (no monta ningún widget).

```tsx
import { useState } from 'react';
import SupportChatWidget from './rag/SupportChatWidget';

interface TrialExpiredScreenProps {
  isAdmin: boolean;      // hasPermission('admin_settings')
  onLogout: () => void;  // signOut del AuthContext
  isOnline: boolean;     // de useOfflineSync(); requerido por SupportChatWidget
}

const TrialExpiredScreen = ({ isAdmin, onLogout, isOnline }: TrialExpiredScreenProps) => {
  const [chatOpen, setChatOpen] = useState(false);

  const handleOpenSupport = () => setChatOpen(true);
  const handleCloseChat = () => setChatOpen(false);

  // Variante empleado: sin botón de soporte, sin widget.
  if (!isAdmin) {
    return (
      /* mensaje "pídele al administrador que renueve" + botón Cerrar sesión.
         NO se monta SupportChatWidget. */
    );
  }

  // Variante admin: mensaje + botón "Hablar con soporte" + widget montado.
  return (
    <>
      {/* mensaje "Tu prueba gratuita terminó" + botón "Hablar con soporte"
          (onClick={handleOpenSupport}) + botón Cerrar sesión (onLogout) */}

      <SupportChatWidget
        isOpen={chatOpen}
        onClose={handleCloseChat}
        isOnline={isOnline}
      />
    </>
  );
};

export default TrialExpiredScreen;
```

| Elemento | Comportamiento |
|----------|----------------|
| Variante empleado (`!isAdmin`) | Mensaje pidiendo avisar al administrador + botón "Cerrar sesión". **NO** renderiza "Hablar con soporte". **NO** monta el `SupportChatWidget`. |
| Variante admin (`isAdmin`) | Mensaje "Tu prueba gratuita terminó" + botón "Hablar con soporte" + "Cerrar sesión", y monta el `SupportChatWidget` (cerrado por defecto). |
| Botón "Hablar con soporte" | `onClick` → `setChatOpen(true)`. Abre el widget (que auto-escala). |
| Botón "Cerrar sesión" | Llama `onLogout` en ambas variantes. |
| Cierre del widget | `onClose` → `setChatOpen(false)`; reaparece la variante admin con el botón. |

### Componentes reutilizados sin cambios

- **`useSupportSession`**: se consume tal cual; no se modifica (Req 7.3).
- **`RagChatWidget`, asistente IA, base de conocimiento**: no se tocan (Req 7.1, 7.2).
- **`App.tsx`**: sin cambios adicionales; ya pasa `isOnline` a `TrialExpiredScreen`.

## Data Models

### `SupportChatWidgetProps`

```ts
interface SupportChatWidgetProps {
  isOpen: boolean;      // controla visibilidad y dispara auto-escalado
  onClose: () => void;  // cierra el panel
  isOnline: boolean;    // bloquea envío sin conexión
}
```

### Estado interno del `SupportChatWidget`

```ts
const [input, setInput] = useState('');                                  // texto del input
const [pendingSupportAttachments, setPendingSupportAttachments] =        // adjuntos en cola
  useState<{ file: File; preview: string | null }[]>([]);
const [viewingAttachment, setViewingAttachment] = useState<…|null>(null); // lightbox
const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 768);
const escalatedRef = useRef(false);                                       // guardia auto-escalado
```

Modelo de auto-escalado (guardado por `escalatedRef`):

```
                 isOpen=true, sin sesión activa, escalatedRef=false
   sin sesión ───────────────────────────────────────────► escalando
        ▲                                                        │
        │  escalate falla → escalatedRef=false (reintento)       │ escalate OK
        │                                                        ▼
        └──────────────────────────── sesión activa (escalatedRef=true, input operativo)
```

### `SupportMessage` / `SupportSession` (del hook, sin cambios)

Definidos en `hooks/useSupportSession.ts`. El widget consume sus campos para renderizar:

```ts
interface SupportMessage {
  id: string;
  session_id: string;
  role: 'client' | 'developer' | 'system';
  content: string;
  attachment_url: string | null;
  attachment_type: 'image' | 'video' | 'document' | 'audio' | null;
  created_at: string;
  _optimistic?: boolean;
  _status?: 'failed';
}

interface SupportSession {
  id: string;
  status: 'active' | 'queued' | 'closed';
  // … resto de campos sin uso directo en el widget
}
```

### `EscalateInput` usado por el auto-escalado

```ts
{
  original_question: 'Solicitud de soporte: mi prueba gratuita terminó',
  user_screen: 'Trial vencido',
}
```

## Error Handling

| Escenario | Manejo |
|-----------|--------|
| Auto-escalado falla (`escalate` rechaza) | `escalatedRef` se resetea a `false` para permitir un reintento (al reabrir o por reintento manual). `support.error` queda disponible para mostrar un aviso. Se puede mostrar un toast de error. |
| Envío de mensaje/adjunto falla | Se reutiliza el patrón del hook: el mensaje queda marcado `_status: 'failed'` con botón "Reintentar" (`markMessageFailed` / `removeMessage`). |
| Sin conexión (`isOnline === false`) | El envío se bloquea y se muestra un toast ("El soporte necesita conexión a internet"). El auto-escalado no se dispara hasta recuperar conexión (o falla y se resetea la guardia). |
| Empleado intenta acceder a soporte | El widget nunca se monta para empleados y el botón "Hablar con soporte" no se renderiza; no hay ruta de escalada desde la variante de empleado. |
| `subscription` es `null` o `status` distinto de `'trial'` | La rama de `App.tsx` no se activa; el flujo sigue a `SubscriptionPlansScreen` / plan personalizado (comportamiento existente). |
| Adjuntos con `URL.createObjectURL` | Se revocan (`URL.revokeObjectURL`) al quitar el thumbnail o al desmontar, evitando fugas de memoria (patrón portado del original). |

## Correctness Properties

*Una propiedad es una característica o comportamiento que debe cumplirse en todas las ejecuciones válidas del sistema; es una afirmación formal sobre lo que el sistema debe hacer. Las propiedades son el puente entre las especificaciones legibles por humanos y las garantías de correctitud verificables por máquina.*

### Property 1: El widget solo renderiza contenido de soporte

*Para cualquier* estado interno alcanzable del `SupportChatWidget` (sesión nula, activa, en cola o cerrada, y cualquier combinación de mensajes de cliente y desarrollador), el componente renderiza únicamente la conversación de soporte y nunca renderiza la barra de pestañas CHAT/SOPORTE/BASE, el chat con la IA, la base de conocimiento, las acciones de feedback 👍/👎 ni los tutoriales.

**Validates: Requirements 2.2, 2.3, 2.4, 2.5**

### Property 2: El widget auto-escala exactamente una vez al abrir

*Para cualquier* secuencia de re-renders y cambios de props que mantengan `isOpen === true` sin sesión de soporte activa previa, el `SupportChatWidget` invoca `useSupportSession.escalate` exactamente una vez, con `original_question === "Solicitud de soporte: mi prueba gratuita terminó"` y `user_screen === "Trial vencido"`.

**Validates: Requirements 3.1, 3.2, 3.3**

### Property 3: Los mensajes del desarrollador se muestran reactivamente

*Para cualquier* lista de mensajes expuesta por `useSupportSession` que contenga mensajes con `role === 'developer'`, el `SupportChatWidget` renderiza cada uno de esos mensajes como una burbuja de soporte, sin requerir una recarga de la pantalla.

**Validates: Requirements 4.2, 4.3**

### Property 4: El empleado nunca monta el widget de soporte

*Para cualquier* secuencia de interacciones posibles del usuario sobre `TrialExpiredScreen` cuando `isAdmin` es `false`, el `SupportChatWidget` no se monta en ningún momento y no existe ruta de escalada a soporte.

**Validates: Requirements 5.4, 5.5**

## Testing Strategy

### Enfoque dual

- **Unit tests (ejemplos):** verifican contenido renderizado concreto, payload del auto-escalado, estados de la barra, chip de ID y wiring del envío.
- **Property tests:** verifican las propiedades universales de "solo soporte", auto-escalado único, render reactivo de mensajes del dev y gating por rol.

### Unit tests (ejemplos)

`useSupportSession` se mockea (doble que expone `session`, `messages`, `escalate`, `sendClientMessage`, `closeSession`, `loading`, `error`) para aislar la lógica del `SupportChatWidget`. Para los tests de `TrialExpiredScreen`, el `SupportChatWidget` se mockea (doble que registra si se monta y con qué props).

| Caso | Verificación |
|------|--------------|
| Header del widget | Aparece "Soporte Bistro" y el botón cerrar con `aria-label` (Req 2.6). |
| Payload de auto-escalado | Al abrir, `escalate` recibe `original_question="Solicitud de soporte: mi prueba gratuita terminó"` y `user_screen="Trial vencido"` (Req 3.2, 3.3). |
| Conversación lista tras escalar | Con sesión activa (mock), el input queda operativo y la barra de estado se muestra (Req 3.4). |
| Chip ID negocio | Con `businessCode`, se muestra `#{businessCode}` y el click copia al portapapeles (Req 4.4). |
| Barra de estado sin respuesta del dev | Muestra "Consulta enviada" (Req 4.5). |
| Barra de estado con respuesta del dev | Con un mensaje `role='developer'`, muestra "Conectado con soporte" (Req 4.5). |
| Botón "Terminar conversación" | Se renderiza y su click invoca `closeSession` (Req 4.6). |
| Envío al dev | Al enviar texto/adjunto, se invoca `sendClientMessage` con el contenido (Req 4.1 — verificación de wiring). |
| `TrialExpiredScreen` admin | Aparece "Hablar con soporte"; al pulsarlo, el mock del `SupportChatWidget` se monta con `isOpen=true` (Req 2.1, 2.8). |
| `TrialExpiredScreen` empleado | No aparece "Hablar con soporte"; el mock del `SupportChatWidget` no se monta (Req 5.4, 5.5). |

### Property tests

Configuración: mínimo 100 iteraciones por propiedad. Cada test referencia su propiedad de diseño.

- **Feature: soporte-trial-vencido, Property 1:** con `useSupportSession` mockeado, generar estados aleatorios (sesión nula/activa/en cola/cerrada + N mensajes con roles mezclados) y verificar en cada render que NO existen selectores de pestañas CHAT/SOPORTE/BASE, chat IA, base de conocimiento, feedback ni tutoriales, y que SÍ existe el área de conversación de soporte.
- **Feature: soporte-trial-vencido, Property 2:** montar con `isOpen=true` y `escalate` mockeado; generar secuencias aleatorias de re-renders y cambios de props (sin cerrar/reabrir) y verificar que `escalate` se llamó exactamente una vez con el payload esperado.
- **Feature: soporte-trial-vencido, Property 3:** generar listas aleatorias de `SupportMessage` que incluyan mensajes `role='developer'`; verificar que cada mensaje del desarrollador aparece como burbuja de soporte tras actualizar `messages` (sin re-montar el componente).
- **Feature: soporte-trial-vencido, Property 4:** con `isAdmin=false`, generar secuencias aleatorias de interacciones (clicks en cualquier elemento visible, pulsaciones de teclado) y verificar que el mock del `SupportChatWidget` nunca se monta.

### Cobertura por integración y no-regresión (fuera de PBT)

- **Entrega al dev (Req 4.1) y recepción por Realtime (Req 4.2, 4.3):** el transporte real (`support-escalate`, Telegram, Supabase Realtime) vive dentro de `useSupportSession`, que no se modifica. Se cubre con tests de integración de 1-2 ejemplos usando el hook real contra un entorno de prueba, más los tests de wiring de arriba.
- **Preservación de `RagChatWidget` / IA / hook (Req 7.1, 7.2, 7.3, 7.4):** revisión de alcance; el `SupportChatWidget` es un archivo nuevo e independiente, no importa `useRagChat`/`useRagDocuments`, y no edita el `RagChatWidget` ni `useSupportSession`.
- **Preservación de planes (Req 8.1, 8.2) y autocontención (Req 8.3):** revisión de alcance; `App.tsx` no cambia y toda la lógica de montaje del widget vive en `TrialExpiredScreen.tsx` y `SupportChatWidget.tsx`.
