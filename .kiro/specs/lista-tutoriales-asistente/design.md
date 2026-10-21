# Documento de Diseño: Lista de Tutoriales del Asistente

## Overview

Esta funcionalidad agrega al asistente IA (`components/rag`) una **lista curada de tutoriales**. Al seleccionar un tutorial, el chat muestra la guía markdown completa y literal de forma instantánea, **sin invocar a Gemini ni a la edge function `rag-chat`**, sin consumir tokens y de forma determinista. El chat libre con Gemini se conserva intacto.

El contenido proviene de los archivos `.md` existentes en `docs/guias_usuario/`, empaquetados en tiempo de build mediante importación `?raw` de Vite. El desarrollador define y amplía la lista en **un único archivo de configuración** nuevo (`components/rag/tutorials.ts`). El backend (Supabase, edge functions, Pinecone) **no se toca**.

### Herramienta de gestión de tutoriales (solo desarrollo)

Además, se añade un **panel de gestión de tutoriales visible únicamente en modo desarrollo** (`import.meta.env.DEV`). El modelo elegido es el **flujo A**: el panel ayuda al desarrollador a armar y previsualizar tutoriales, y genera un snippet listo para pegar en `tutorials.ts`. El navegador **nunca escribe archivos**; producción **siempre** lee solo `tutorials.ts` (curado y determinista).

Flujo A:

1. **Autodescubrir**: el panel detecta todos los `.md` de `docs/guias_usuario/` con `import.meta.glob('../../docs/guias_usuario/*.md', { query: '?raw', import: 'default', eager: true })`, sin que el desarrollador escriba imports a mano.
2. **Previsualizar / agregar en dev**: por cada guía el desarrollador define un título, la previsualiza en el chat (usa `showTutorial`, mismo comportamiento del Req 2) y la agrega a la lista de la sesión, persistida **solo en localStorage**.
3. **Copiar snippet para producción**: genera y copia al portapapeles el snippet (`import ... ?raw` + entrada `{ id, title, content }`, **sin `icon`**) para pegarlo manualmente en `tutorials.ts`.

En desarrollo, la lista mostrada = `TUTORIALS` de `tutorials.ts` **+** overlay de localStorage. En producción, la lista = **solo** `TUTORIALS` de `tutorials.ts`. Todo el control y su panel quedan gateados por `import.meta.env.DEV`, por lo que el bundler los elimina del build de producción (tree-shaking).

### Hallazgos de la lectura del código real

Estos hallazgos condicionan el diseño (se leyó el código, no se asumió):

- **`hooks/useRagChat.ts`**: el estado de UI `messages` (`RagMessage[]`) es **independiente** del historial que se envía a Gemini. El historial vive en `historyRef` (un `useRef<Array<{role, content}>>`), y **solo** se muta dentro de `sendMessage`, después del streaming. Consecuencia clave: un método `showTutorial` que solo llame a `setMessages` **nunca** contaminará el historial de Gemini. Esto satisface el Requisito 3.3 sin lógica adicional de exclusión.
- **`components/rag/ChatMessage.tsx`**: ya renderiza markdown con `react-markdown` + `remark-gfm`, e interpreta `> 📸 Imagen:`, `> 🎬 Video:` (vía `BlockquoteMedia` / URLs de Cloudinary) y mockups ASCII en bloques ```` ``` ```` (vía `PreComponent`). Reutilizarlo tal cual satisface el Requisito 2.4 sin cambios.
- **`components/rag/RagChatWidget.tsx`**: el estado inicial (cuando `messages.length === 0 && !loading`) renderiza `STARTER_SUGGESTIONS` bajo el título "Prueba con". El header (desktop y móvil) usa una píldora de pestañas Chat / Soporte / Base y botones de reset (`clearChat`) y cerrar. El modo offline se controla con `activeContent = !isOnline ? offlineContent : ...`. El renglón `msg.role === 'assistant' ? <ChatMessage .../> : <span>` decide cómo se pinta cada burbuja.
- **`components/rag/RagSourceCard.tsx`**: solo relevante para respuestas de Gemini (fuentes RAG). Los tutoriales no generan fuentes, así que no interviene.
- **Vite (`vite.config.ts`)**: la raíz del proyecto es el workspace y **no** hay restricción `server.fs.allow`, por lo que `import ... from '../../docs/guias_usuario/x.md?raw'` funciona tanto en dev como en build. El tipo del sufijo `?raw` lo aporta `vite/client`. Alternativa documentada más abajo por si TS no lo resuelve.

## Architecture

### Diagrama de flujo

```
Estado inicial (messages.length === 0)
        │
        ▼
  Lista de tutoriales  ──── click ────►  showTutorial(t)
  (TUTORIALS de config)                        │
        │                                      ▼
        │                        setMessages([user(title), assistant(content, kind:'tutorial')])
        │                        (NO toca historyRef → NO llama a rag-chat/Gemini)
        │                                      │
        ▼                                      ▼
  (config vacía → estado           Chat con guía visible + input activo
   inicial normal, sin lista)              │
                                           ├── header muestra control de texto "Tutoriales ▾"
                                           │        (sin ícono; dropdown con los tutoriales ≠ actual)
                                           │
                                           └── usuario escribe pregunta libre
                                                    ▼
                                              sendMessage(q)  ──► rag-chat/Gemini
                                              (history = solo turnos de sendMessage)
```

### Separación de responsabilidades

| Capa | Archivo | Responsabilidad |
|------|---------|-----------------|
| Configuración/datos | `components/rag/tutorials.ts` (nuevo) | Declara `TUTORIALS: TutorialConfig[]`, importa el markdown `?raw`, valida IDs duplicados. |
| Estado del chat | `hooks/useRagChat.ts` (editar) | Nuevo `showTutorial(tutorial)` que inserta las 2 burbujas sin tocar `historyRef`. Nuevo campo `kind` en `RagMessage`. |
| Presentación | `components/rag/RagChatWidget.tsx` (editar) | Render de la lista en estado inicial; `handleTutorialClick`; control "Lista de tutoriales" en header; seguimiento del tutorial actual. |
| Render de contenido | `components/rag/ChatMessage.tsx` (sin cambios) | Renderiza el markdown de la guía (multimedia + mockups). |
| Gestión dev-only | `components/rag/TutorialDevManager.tsx` (nuevo) | Solo se monta si `import.meta.env.DEV`. Autodescubre las guías, previsualiza vía `showTutorial`, agrega al overlay de localStorage y genera el snippet para producción. |
| Overlay dev | helper en `components/rag/tutorials.ts` (dev) | Lee/escribe el overlay de tutoriales en localStorage y construye el snippet de configuración (`buildTutorialSnippet`). |

### Flujo del panel dev-only (Req 7)

```
import.meta.env.DEV === true
        │  (en producción todo este bloque se elimina por tree-shaking)
        ▼
  Botón "Gestionar tutoriales" en header  ──► abre TutorialDevManager
        │
        ▼
  import.meta.glob('../../docs/guias_usuario/*.md', { query:'?raw', eager:true })
        │  (mapa { ruta → contenido markdown })
        ▼
  Por cada guía detectada:
     ├── definir título
     ├── Previsualizar ──► showTutorial({ title, content })   (Req 7.4 == Req 2)
     ├── Agregar       ──► overlay localStorage (Req 7.5)
     └── Copiar config ──► buildTutorialSnippet(entry) → portapapeles (Req 7.6)

  Lista mostrada en dev  = TUTORIALS + overlay(localStorage)
  Lista mostrada en prod = TUTORIALS  (localStorage ignorado, Req 7.7)
```

### Decisión: la lista reemplaza a `STARTER_SUGGESTIONS`

En el estado inicial, la **lista de tutoriales ocupa el lugar** de las sugerencias fijas actuales (`STARTER_SUGGESTIONS`), bajo un encabezado "Tutoriales". Justificación: ambas ocupan el mismo espacio y cumplen el mismo rol (accesos rápidos). La lista curada es más útil porque entrega contenido completo e instantáneo en vez de disparar una consulta a Gemini. Si la config está vacía (Req 1.4), se conserva `STARTER_SUGGESTIONS` como respaldo, evitando un estado inicial vacío.

## Components and Interfaces

### 1. `components/rag/tutorials.ts` (nuevo)

```ts
// Importación cruda del markdown de las guías (empaquetado por Vite en build).
import comoCrearProductos from '../../docs/guias_usuario/como_crear_productos.md?raw';
import comoHacerVenta from '../../docs/guias_usuario/como_hacer_una_venta.md?raw';
import comoConfigurarImpresora from '../../docs/guias_usuario/como_configurar_impresora.md?raw';
// ...el desarrollador agrega más imports aquí.

export interface TutorialConfig {
  id: string;        // identificador único y estable
  title: string;     // título visible en la lista y en la burbuja de usuario
  content: string;   // markdown completo de la guía (import ?raw)
}

export const TUTORIALS: TutorialConfig[] = [
  { id: 'crear-productos', title: 'Cómo crear productos', content: comoCrearProductos },
  { id: 'hacer-venta', title: 'Cómo hacer una venta', content: comoHacerVenta },
  { id: 'configurar-impresora', title: 'Cómo configurar la impresora', content: comoConfigurarImpresora },
];

// Detección de IDs duplicados como error de configuración (Req 5.4).
// Se ejecuta una vez al cargar el módulo; en dev lanza para que el error sea visible.
const seenIds = new Set<string>();
for (const t of TUTORIALS) {
  if (seenIds.has(t.id)) {
    const msg = `[tutorials] ID de tutorial duplicado: "${t.id}"`;
    if (import.meta.env.DEV) throw new Error(msg);
    else console.error(msg);
  }
  seenIds.add(t.id);
}
```

- Agregar un tutorial = agregar un `import` y una entrada al arreglo (Req 5.2). Sin cambios de UI.
- El orden del arreglo es el orden de render (Req 1.3).

**Declaración de tipos `?raw` (si TS la requiere):** si el compilador no reconoce `*.md?raw`, se añade a `vite-env.d.ts` (o un `types/raw.d.ts`):

```ts
declare module '*.md?raw' {
  const content: string;
  export default content;
}
```

**Alternativa si `?raw` desde `docs/` fallara** (documentada, no preferida): copiar/mover las guías a `src/` o `public/` y ajustar los imports, o usar `import.meta.glob('../../docs/guias_usuario/*.md', { query: '?raw', import: 'default', eager: true })` para cargar todas de una vez. Se prefiere el import explícito por ser el más simple y legible.

### 2. `hooks/useRagChat.ts` (editar)

Cambios mínimos:

```ts
export interface RagMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: RagSource[];
  is_about_bistro?: boolean;
  suggestions?: string[];
  kind?: 'tutorial';   // NUEVO: marca burbujas de tutorial (no llaman a Gemini)
}

// Dentro de useRagChat:
const showTutorial = useCallback((tutorial: { title: string; content: string }) => {
  setMessages(prev => [
    ...prev,
    { role: 'user', content: tutorial.title, kind: 'tutorial' },
    { role: 'assistant', content: tutorial.content, kind: 'tutorial' },
  ]);
  // No se toca historyRef: el contenido del tutorial queda excluido del
  // historial que sendMessage envía a Gemini (Req 3.3).
}, []);

// ...
return { messages, sources, loading, error, sendMessage, showTutorial, clearChat };
```

- **Exclusión del historial (Req 3.3):** `historyRef.current` solo se muta dentro de `sendMessage`. Como `showTutorial` no lo toca, ninguna guía llega jamás al `body.history` de la petición a `rag-chat`. Es exclusión por construcción, no por filtrado.
- **Sin llamada a red (Req 2.2):** `showTutorial` es una operación puramente local (`setMessages`); no hace `fetch`.
- `clearChat` ya resetea `messages` y `historyRef`, por lo que el reset (Req 6.1) vuelve al estado inicial con la lista, sin cambios adicionales en el hook.

### 3. `components/rag/RagChatWidget.tsx` (editar)

Nuevo estado y derivaciones:

```ts
const { messages, loading, sendMessage, showTutorial, clearChat: clearChatRaw } = useRagChat();

// Tutorial actualmente abierto = id del último mensaje de tutorial (derivado, sin estado extra).
const currentTutorialId = useMemo(() => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.kind === 'tutorial' && m.role === 'user') {
      return TUTORIALS.find(t => t.title === m.content)?.id ?? null;
    }
  }
  return null;
}, [messages]);

const hasOpenTutorial = messages.some(m => m.kind === 'tutorial'); // Req 4.1/4.2
const [showTutorialMenu, setShowTutorialMenu] = useState(false);
```

Handlers (prefijo `handle`, accesibles por teclado):

```ts
const handleTutorialClick = useCallback((t: TutorialConfig) => {
  if (loading || view !== 'chat') return;
  showTutorial(t);
}, [loading, view, showTutorial]);

const handleTutorialMenuSelect = useCallback((t: TutorialConfig) => {
  showTutorial(t);            // Req 4.4 (mismo comportamiento que Req 2)
  setShowTutorialMenu(false);
}, [showTutorial]);

const handleToggleTutorialMenu = useCallback(() => setShowTutorialMenu(v => !v), []);
```

- **Estado inicial (Req 1.1–1.3):** dentro del bloque `messages.length === 0 && !loading`, si `TUTORIALS.length > 0` se renderiza la lista (solo `title`, sin ícono, en orden del arreglo) con `<button>` accesibles (`aria-label`, `tabIndex={0}`, `onClick`, `onKeyDown`). Si `TUTORIALS.length === 0` (Req 1.4) se cae al render actual de `STARTER_SUGGESTIONS`, sin errores.
- **Control "Tutoriales" en el header (Req 4.1–4.5):** botón de **texto** con la etiqueta "Tutoriales" seguida de una flecha hacia abajo (chevron, ej. ícono `ChevronDown` de lucide como afordancia de desplegable), **sin ícono decorativo a la izquierda**. Visible **solo** cuando `hasOpenTutorial` (por tanto oculto en estado inicial, Req 4.2). Al activarlo abre un dropdown con `TUTORIALS.filter(t => t.id !== currentTutorialId)` (Req 4.3). Seleccionar → `handleTutorialMenuSelect` (Req 4.4). Cerrar sin elegir (clic fuera / Escape / re-toggle) no cambia el tutorial abierto (Req 4.5). El botón se coloca junto a `historyButton`/reset en la barra de header (desktop y móvil). Nota: el chevron es una afordancia visual de "lista desplegable", no un ícono de contenido; el requisito de "sin ícono" se refiere a no usar un ícono en lugar del texto de la etiqueta.
- **Sin regresiones (Req 6):** pestaña BASE, `clearChat` (reset → estado inicial con lista), modo offline (`offlineContent`) y sugerencias de Gemini (`msg.suggestions`) se dejan intactos. Las burbujas de tutorial se pintan con el mismo `<ChatMessage content={msg.content} />` del assistant, y la de usuario con `<span>`; no requieren rama nueva salvo, opcionalmente, ocultar el bloque de feedback "¿Esto resolvió tu duda?" en mensajes con `kind === 'tutorial'` (mejora menor, no obligatoria).

**Accesibilidad del dropdown:** cierre con `Escape` y clic fuera vía listener con cleanup en `useEffect` (patrón ya usado en el widget para el lightbox). Cada opción es `<button>` con `aria-label`, navegable por teclado.

**Botón "Gestionar tutoriales" (dev-only):** en el header, gateado por `import.meta.env.DEV`, se renderiza un botón que abre el `TutorialDevManager`. Se escribe de forma que el bundler pueda eliminarlo en producción:

```tsx
{import.meta.env.DEV && (
  <button type="button" aria-label="Gestionar tutoriales" onClick={handleToggleDevManager} onKeyDown={handleDevManagerKeyDown}>
    Gestionar tutoriales
  </button>
)}
```

En dev, la lista de tutoriales usada por el estado inicial y el dropdown se deriva de una fusión: `const tutorialList = import.meta.env.DEV ? [...TUTORIALS, ...getDevOverlay()] : TUTORIALS;` (Req 7.5, 7.7). En producción la rama `import.meta.env.DEV` es `false`, por lo que `getDevOverlay` ni siquiera se invoca.

### 4. `components/rag/TutorialDevManager.tsx` (nuevo, dev-only)

Componente montado únicamente cuando `import.meta.env.DEV`. Props tipadas, sin objetos inline como props:

```ts
interface TutorialDevManagerProps {
  open: boolean;
  onClose: () => void;
  onPreview: (entry: { title: string; content: string }) => void; // usa showTutorial (Req 7.4)
  onAdd: (entry: DevTutorialEntry) => void;                        // persiste overlay (Req 7.5)
}
```

Comportamiento:

- **Autodescubrimiento (Req 7.3):** al montar, resuelve el mapa de guías con
  `const guides = import.meta.glob('../../docs/guias_usuario/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;`
  y lista cada archivo (nombre derivado de la ruta) con su contenido disponible.
- **Título por guía:** input controlado (`title`) con handler `handleTitleChange`; requerido antes de previsualizar/agregar.
- **Previsualizar (Req 7.4):** `handlePreview` llama `onPreview({ title, content })`, que en el widget invoca `showTutorial` (mismo comportamiento del Req 2). No toca red ni historial.
- **Agregar (Req 7.5):** `handleAdd` valida título no vacío y llama `onAdd({ id, title, sourceFile })`, persistiendo el overlay en localStorage. La lista de la sesión se actualiza sin afectar producción.
- **Copiar config (Req 7.6):** `handleCopySnippet` construye el snippet con `buildTutorialSnippet(entry)` y lo copia con `navigator.clipboard.writeText`. Si el portapapeles no está disponible, muestra el snippet en un `<textarea>` de solo lectura para copiar a mano (ver Error Handling).
- **Accesibilidad:** panel con `role="dialog"`, cierre con `Escape` y botón Cerrar; todos los controles son elementos nativos (`<button>`, `<input>`) con `aria-label` y navegación por teclado.

### 5. Helpers de overlay y snippet en `tutorials.ts`

```ts
export interface DevTutorialEntry {
  id: string;          // slug derivado del sourceFile o del título
  title: string;       // título definido por el desarrollador
  sourceFile: string;  // nombre del archivo .md en docs/guias_usuario/
}

const DEV_TUTORIALS_STORAGE_KEY = 'bistro:dev-tutorials';

// Solo se usan en modo desarrollo; no se referencian en la ruta de producción.
export const getDevOverlay = (): TutorialConfig[] => { /* lee localStorage + import.meta.glob para el content */ };
export const addDevOverlayEntry = (entry: DevTutorialEntry): void => { /* escribe en localStorage */ };

// Construye el snippet para pegar en tutorials.ts (SIN campo icon).
export const buildTutorialSnippet = (entry: { id: string; title: string; sourceFile: string }): string => {
  const varName = /* camelCase derivado del sourceFile */;
  return [
    `import ${varName} from '../../docs/guias_usuario/${entry.sourceFile}?raw';`,
    ``,
    `{ id: '${entry.id}', title: '${entry.title}', content: ${varName} },`,
  ].join('\n');
};
```

- `getDevOverlay` combina los `DevTutorialEntry` de localStorage con el `content` obtenido de `import.meta.glob` (el `content` en dev **no** se guarda en localStorage, se resuelve del glob por `sourceFile`). Esto evita duplicar contenido pesado en storage y garantiza que el markdown mostrado sea el real.
- `buildTutorialSnippet` produce exactamente la línea `import` y la entrada `{ id, title, content }` sin `icon` (Req 7.6).

## Data Models

### `TutorialConfig`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `string` | Identificador único y estable del tutorial. Duplicados = error de config (Req 5.4). |
| `title` | `string` | Título visible; también es el texto de la burbuja de usuario al abrir el tutorial. |
| `content` | `string` | Markdown completo y literal de la guía (`import '...md?raw'`). |

### Extensión de `RagMessage`

Se añade el campo opcional `kind?: 'tutorial'`. Los mensajes existentes (Gemini) no lo llevan, por lo que su render y el historial no cambian. Los mensajes de tutorial lo llevan para: (a) permitir distinguirlos en el render si hiciera falta, y (b) derivar `hasOpenTutorial` y `currentTutorialId`.

### `DevTutorialEntry` (solo desarrollo)

Modelo del overlay persistido en localStorage por el panel de gestión. Se fusiona con `TUTORIALS` únicamente en modo desarrollo (Req 7.5, 7.7).

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `string` | Slug único de la entrada, derivado del `sourceFile` o del título. |
| `title` | `string` | Título definido por el desarrollador en el panel. |
| `sourceFile` | `string` | Nombre del archivo `.md` en `docs/guias_usuario/`; se usa para resolver el `content` desde `import.meta.glob`. |

- **Clave de storage:** `bistro:dev-tutorials`, cuyo valor es un `DevTutorialEntry[]` serializado en JSON.
- **Contenido en dev:** el `content` **no** se guarda en localStorage; se resuelve desde `import.meta.glob('../../docs/guias_usuario/*.md', { query: '?raw', import: 'default', eager: true })` usando `sourceFile`. Así el overlay guarda solo metadatos ligeros y muestra siempre el markdown real.
- **Aislamiento de producción:** en producción, la rama `import.meta.env.DEV` es `false`, por lo que ni `getDevOverlay` ni la clave de storage se leen (Req 7.7).

### Fuente del contenido

Los `content` se resuelven en build desde `docs/guias_usuario/*.md` (Req 5.3) vía `?raw`. No hay lectura en runtime ni acceso a red para mostrar un tutorial.

## Error Handling

| Escenario | Manejo | Requisito |
|-----------|--------|-----------|
| Config de tutoriales vacía (`TUTORIALS.length === 0`) | El estado inicial no renderiza la lista y cae a `STARTER_SUGGESTIONS`; sin errores. | 1.4 |
| IDs duplicados en la config | Se detecta al cargar el módulo: en DEV lanza `Error` (visible para el desarrollador), en producción registra `console.error` y continúa con la primera aparición. | 5.4 |
| Contenido de guía no cargable (`content` vacío o `undefined`) | `showTutorial` inserta una burbuja de asistente con un mensaje de error en español ("No se pudo cargar esta guía. Intenta con otro tutorial.") en lugar del contenido; el asistente sigue operativo. | 2.5 |
| Dispositivo sin conexión | No afecta a los tutorials (son locales), pero se conserva el `offlineContent` actual para el chat libre. Los tutoriales no requieren red. | 6.2 |

Nota sobre 2.5: como el contenido se empaqueta en build, un fallo de carga es improbable en runtime; la guarda protege contra una entrada de config mal referenciada (import que resuelve a vacío).

### Panel de gestión (dev-only)

| Escenario | Manejo | Requisito |
|-----------|--------|-----------|
| localStorage no disponible (modo privado / bloqueado) | `getDevOverlay`/`addDevOverlayEntry` capturan la excepción, registran `console.warn` y operan con overlay vacío en memoria; el panel sigue permitiendo previsualizar y copiar snippet. | 7.5 |
| Título vacío al agregar/previsualizar | `handleAdd`/`handlePreview` retornan temprano y muestran un aviso en español ("Escribe un título para el tutorial."); no se persiste nada. | 7.5, 7.4 |
| Guía sin contenido (archivo vacío en el glob) | El panel deshabilita "Previsualizar"/"Agregar" para esa guía y muestra "Esta guía no tiene contenido."; no se genera snippet. | 7.3 |
| Portapapeles no disponible (`navigator.clipboard` ausente o denegado) | `handleCopySnippet` cae a mostrar el snippet en un `<textarea>` de solo lectura seleccionable para copiar manualmente. | 7.6 |

Nota dev-only: como todo el panel y sus helpers están gateados por `import.meta.env.DEV`, estos escenarios solo existen en desarrollo; en producción el código se elimina del build (Req 7.2).

## Correctness Properties

*Una propiedad es una característica o comportamiento que debe cumplirse en todas las ejecuciones válidas del sistema; es una afirmación formal sobre lo que el sistema debe hacer, y sirve de puente entre la especificación legible por humanos y las garantías verificables por máquina.*

### Property 1: Abrir un tutorial nunca invoca a rag-chat/Gemini

*Para cualquier* tutorial de la configuración, invocar `showTutorial` no debe producir ninguna petición de red a la edge function `rag-chat` ni modificar el estado `loading`.

**Validates: Requirements 2.2**

### Property 2: El contenido del tutorial se excluye del historial enviado a Gemini

*Para cualquier* secuencia de aperturas de tutoriales seguida del envío de una pregunta libre, el `history` enviado a `rag-chat` no debe contener el `content` de ninguna guía de tutorial abierta.

**Validates: Requirements 3.3**

### Property 3: El orden de la lista respeta la configuración

*Para cualquier* configuración `TUTORIALS` con IDs únicos, el orden de los tutoriales renderizados en el estado inicial debe ser idéntico al orden de declaración en el arreglo.

**Validates: Requirements 1.3**

### Property 4: El control del header aparece solo con un tutorial abierto

*Para cualquier* estado de la conversación, el control "Lista de tutoriales" del header debe ser visible si y solo si existe al menos un mensaje con `kind === 'tutorial'`.

**Validates: Requirements 4.1, 4.2**

### Property 5: El contenido mostrado es literal e íntegro

*Para cualquier* tutorial de la configuración, la burbuja de asistente insertada por `showTutorial` debe tener un `content` exactamente igual al `content` de la configuración (sin recortes ni modificaciones).

**Validates: Requirements 2.1**

### Property 6: El dropdown excluye el tutorial actual

*Para cualquier* tutorial actualmente abierto, el conjunto de opciones del control "Lista de tutoriales" debe ser exactamente el conjunto de tutoriales de la configuración excepto el actualmente abierto.

**Validates: Requirements 4.3**

### Property 7: Abrir un tutorial inserta título de usuario seguido de guía de asistente

*Para cualquier* tutorial, `showTutorial` debe anexar exactamente dos mensajes en orden: primero uno con `role === 'user'` y `content === title`, luego uno con `role === 'assistant'` y el contenido de la guía.

**Validates: Requirements 2.3**

### Property 8: El control de gestión nunca aparece en producción

*Para cualquier* ejecución de la aplicación en producción (`import.meta.env.DEV === false`), el control "Gestionar tutoriales" y el panel `TutorialDevManager` no deben renderizarse ni incluirse en el bundle.

**Validates: Requirements 7.1, 7.2**

### Property 9: El overlay de localStorage nunca se lee en producción

*Para cualquier* estado de localStorage, la lista de tutoriales resuelta en producción debe ser exactamente `TUTORIALS` de la configuración, sin ninguna entrada proveniente del overlay de localStorage.

**Validates: Requirements 7.7**

### Property 10: El snippet generado corresponde exactamente a la entrada seleccionada

*Para cualquier* entrada de tutorial `{ id, title, sourceFile }`, el snippet devuelto por `buildTutorialSnippet` debe contener el `import ?raw` del `sourceFile` y una entrada `{ id, title, content }` con esos mismos `id` y `title` y sin campo `icon`.

**Validates: Requirements 7.6**

## Testing Strategy

El núcleo probable con propiedades es la lógica pura de `showTutorial`, la validación de config y las derivaciones (`hasOpenTutorial`, `currentTutorialId`, filtrado del dropdown). El render visual y la interacción del widget se cubren con pruebas de ejemplo, no con PBT.

### Pruebas basadas en propiedades (mínimo 100 iteraciones)

- Librería sugerida: **fast-check** + **Vitest** (proyecto Vite/TS). No implementar PBT desde cero.
- Cada test se etiqueta con un comentario: `// Feature: lista-tutoriales-asistente, Property N: <texto>`.
- Generadores: arreglos aleatorios de `TutorialConfig` con IDs únicos (y variantes con duplicados para casos de error), títulos/contenidos arbitrarios.
- Propiedades cubiertas con PBT: 2, 3, 5, 6, 7. Se prueban sobre la lógica del hook/derivaciones usando un mock del `fetch` para verificar que `showTutorial` no lo invoca (Property 1) y que el `history` no contiene contenido de guías (Property 2).
- **Property 10 (`buildTutorialSnippet`)**: generar entradas `{ id, title, sourceFile }` aleatorias y verificar que el snippet incluye el import del `sourceFile`, los mismos `id`/`title` y no contiene la palabra `icon`.

### Pruebas del panel de gestión (dev-only)

- **Gate DEV/prod (Property 8, 9 / Req 7.1, 7.2, 7.7)**: con `import.meta.env.DEV` simulado en `true` y `false`, verificar que el botón/panel se renderiza solo en dev y que la lista resuelta en "producción" ignora el overlay de localStorage.
- **Fusión TUTORIALS + overlay solo en dev (Req 7.5)**: con overlay poblado en localStorage, la lista en dev = `TUTORIALS` + overlay; en prod = solo `TUTORIALS`.
- **`getDevOverlay` sin localStorage**: cuando localStorage lanza, retorna overlay vacío sin romper (Req 7.5).
- **Previsualizar (Req 7.4)**: `onPreview` invoca `showTutorial` con el mismo comportamiento del Req 2 (dos burbujas, sin red).
- **Copiar snippet (Req 7.6)**: con `navigator.clipboard` disponible copia el snippet; sin él, expone el `<textarea>` de fallback.
- **Título vacío**: previsualizar/agregar con título vacío no persiste ni previsualiza y muestra el aviso.

### Pruebas unitarias / de ejemplo

- `showTutorial` con `content` vacío → inserta burbuja de error en español y no rompe (Req 2.5).
- Config vacía → estado inicial usa `STARTER_SUGGESTIONS`, sin lista ni errores (Req 1.4).
- Config con ID duplicado → en DEV lanza, en prod registra error (Req 5.4).
- Visibilidad del control del header en estado inicial (oculto) vs con tutorial abierto (visible) (Property 4 / Req 4.1, 4.2).
- Cerrar el dropdown sin seleccionar conserva el tutorial abierto (Req 4.5).
- Tras abrir un tutorial, enviar una pregunta libre sigue llamando a `sendMessage` con normalidad (Req 3.1, 3.2).

### Regresión

- Pestaña BASE, reset, modo offline y sugerencias de Gemini siguen funcionando (Req 6.1–6.4): pruebas de ejemplo sobre el render del widget con estados representativos.
