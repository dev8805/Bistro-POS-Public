# Asistente IA — RAG Multimedia

> **Módulo:** `Screen.RAG_CHAT`
> **Widget:** `components/rag/RagChatWidget.tsx` (flotante, no ocupa la pantalla activa)
> **Pantalla legacy:** `screens/RagChatScreen.tsx` (conservada pero no se navega a ella)
> **Backend:** Supabase Edge Functions (`rag-chat`, `rag-index`, `rag-clear`) + Supabase Storage
> **Estado:** ✅ Operativo — Última actualización 2026-06-02
> **Relacionado:** [soporte_humano_telegram.md](soporte_humano_telegram.md) — escalación al desarrollador cuando el RAG no resuelve.

---

## ¿Qué hace este módulo?

El Asistente IA permite a los usuarios resolver dudas sobre el sistema Bistro POS mediante **RAG (Retrieval-Augmented Generation)**. La IA busca en documentos indexados, cita la fuente exacta y muestra la página referenciada del PDF con previsualización visual.

Cuando el RAG **no resuelve** una duda, el widget muestra feedback 👍/👎 bajo cada respuesta del bot. Al dar 👎, el cliente puede **escalar la conversación al desarrollador vía Telegram** sin salir del widget (handoff bidireccional con multimedia). Detalles en [soporte_humano_telegram.md](soporte_humano_telegram.md).

**Casos de uso:**
- Consultar manuales y guías de Bistro POS.
- Resolver dudas de capacitación sin soporte humano.
- Indexación de documentos PDF, imágenes, videos y GIFs.
- **Escalar al desarrollador** si el RAG no responde adecuadamente.

---

## Arquitectura

```text
Browser (React/Bistro)
  │
  ├── UI:     components/rag/RagChatWidget.tsx  ← widget flotante (nuevo)
  │           components/rag/ChatMessage.tsx
  │           components/rag/RagSourceCard.tsx
  │           screens/RagChatScreen.tsx          ← legacy, no se usa en navegación
  └── Hooks:  hooks/useRagChat.ts       → fetch() directo a "rag-chat" leyendo stream SSE (token a token)
              hooks/useRagDocuments.ts  → llama a Edge Functions "rag-index", "rag-clear"
                                          y escribe en tabla "rag_documents"
              hooks/useDictation.ts     → Streaming PCM linear16 vía WebSocket a Deepgram

Supabase
  ├── Storage: bucket "rag-documents" (privado, solo usuarios autenticados)
  ├── DB:      tabla "rag_documents" (estado de cada documento)
  └── Edge Functions:
        rag-index   → Descarga PDF de Storage, extrae texto con Gemini, vectoriza, sube a Pinecone
        rag-chat    → Recibe query, busca en Pinecone, genera respuesta con Gemini
        rag-clear   → Vacía Pinecone y elimina registros de rag_documents

Externos
  ├── Pinecone   → Base de datos vectorial (índice: bistro-knowledge, 3072 dimensiones)
  ├── Gemini     → Embeddings (gemini-embedding-2, 3072 dims) + Chat/Vision (gemini-2.5-flash)
  └── Deepgram   → Dictado por voz en tiempo real (modelo nova-2)
```

---

## Flujo completo de indexación

```text
Usuario sube un documento desde la UI
  │
  ▼
useRagDocuments.uploadDocument(file)
  ├── Sube el archivo al bucket "rag-documents" en Supabase Storage
  ├── Inserta registro en tabla "rag_documents" con status: 'pending'
  └── Llama automáticamente a indexDocument(docId)

indexDocument(docId)
  └── Invoca Edge Function "rag-index" con { docId }

Edge Function rag-index (por tipo de documento):

── PDF ──────────────────────────────────────────────────────────────
  1. Descarga el PDF desde Supabase Storage
  2. Envía el PDF a Gemini Vision para extraer texto página por página
     → Formato: [PAGINA N] <texto>
  3. Divide cada página en chunks (CHUNK_SIZE=1200, CHUNK_OVERLAP=150)
  4. Por cada chunk aplica Contextual Retrieval:
     a. Llama a Gemini con el texto completo del PDF + el chunk
     b. Gemini genera 2-3 oraciones de contexto ("Este fragmento es de...")
     c. embedText = contexto + "\n\n" + chunk original
  5. Genera embedding de embedText con taskType: RETRIEVAL_DOCUMENT
  6. Almacena en Pinecone: metadata.text = chunk original (sin contexto)

── MARKDOWN ─────────────────────────────────────────────────────────
  1. Descarga el archivo .md desde Supabase Storage
  2. parseMarkdownSections() divide por headings H1-H3 con breadcrumb
     → Cada sección incluye su heading como primera línea
     → Breadcrumb: "H1 > H2 > H3" preserva jerarquía
  3. Por cada sección: chunkTextWithOverlap (CHUNK_SIZE=1200, OVERLAP=250)
  4. Cada chunk se prefija con [breadcrumb] para contexto semántico
  5. Aplica Contextual Retrieval igual que PDF
  6. Genera embedding con taskType: RETRIEVAL_DOCUMENT

── VIDEO ─────────────────────────────────────────────────────────────
  1. Gemini genera descripción educativa del video a partir de la URL
  2. Chunking de la descripción → embedding → Pinecone
  (No aplica Contextual Retrieval — la descripción ya es contextual)

── GIF / IMAGEN ──────────────────────────────────────────────────────
  1. Gemini Vision describe la imagen/GIF
  2. Chunking → embedding → Pinecone

Upsert a Pinecone (todos los tipos):
  → Batches de 4 vectores, RATE_DELAY_MS=1500 entre embeddings
  → cleanMeta() filtra null/undefined antes de cada upsert
  → Verifica upsertRes.ok + upsertedCount > 0

Al finalizar:
  → status → 'indexed', indexed_at = now()
  → Retorna { success: true, chunksIndexed: N }

Si cualquier paso falla:
  → status → 'error'
  → El hook expone indexError con el mensaje real del fallo
```

> ⚠️ **Contextual Retrieval:** Al reindexar con esta técnica, los tiempos de indexación aumentan (~25s extra por documento por las llamadas adicionales a Gemini). Es normal y esperado.

---

## Flujo completo de consulta

```text
Usuario escribe una pregunta y presiona Enter/Send
  │
  ▼
useRagChat.sendMessage(query)
  ├── Agrega de inmediato un mensaje vacío del asistente { role:'assistant', content:'' }
  └── fetch() POST a "rag-chat" con { query, history[] }
      Headers: Authorization Bearer <anon> + apikey <anon>
      (fetch directo, NO supabase.functions.invoke — invoke buferea y no permite leer SSE)

Edge Function rag-chat:
  1. En paralelo:
     a. HyDE: Gemini genera una respuesta hipotética completa (8-12 oraciones)
        a la pregunta, redactada como documentación de usuario. Esto
        acerca el vector de búsqueda al espacio semántico de los chunks.
     b. getPineconeHost(): obtiene el host del índice (cacheado)
  2. Vectoriza la respuesta hipotética con gemini-embedding-2
     → taskType: RETRIEVAL_QUERY (asimétrico vs. RETRIEVAL_DOCUMENT del índice)
  3. Recuperación en 2 etapas (discovery + expansión, ver sección rag-chat)
  4. Si 0 matches → responde JSON "No encontré información relevante"
  5. Ordena matches: por relevancia del primer match del source, luego por página
  6. Construye contexto: [Fuente N | Archivo: X | Sección/Página: Y]\n<texto>
  7. Abre un ReadableStream y llama a Gemini con streamGenerateContent?alt=sse
     → System prompt instruye a Gemini a cerrar con:
       <<BISTRO_TOPIC:yes/no>>
       <<SUGGESTIONS:["pregunta 1","pregunta 2"]>>
     → Por cada token de Gemini emite un evento SSE: data: {"t":"<token>"}
     → Acumula el texto completo en fullText
  8. Al terminar el stream de Gemini, sobre fullText:
     a. extractBistroTopicFlag(): extrae <<BISTRO_TOPIC>> → is_about_bistro
        (fallback por score máximo de Pinecone si el marcador falta)
     b. extractSuggestions(): JSON.parse de <<SUGGESTIONS:[...]>> → máx. 3 strings
  9. Emite el evento final con la respuesta YA LIMPIA (sin marcadores):
     data: {"done":true,"answer":"...","bistro":true,"suggestions":[...]}
  [SOURCES DESHABILITADAS] — ya no se generan signed_url ni objetos source
     (la UI del widget no renderiza fuentes). Ver nota en la sección rag-chat.

useRagChat lee el stream con getReader():
  → Evento {"t":token}  → concatena al content del último mensaje (aparece en vivo)
  → Evento {"done":...} → reemplaza el content acumulado con answer limpio
                          y fija is_about_bistro + suggestions
  → Evento {"error":..} → muestra "❌ Error al consultar: ..."
  → Actualiza historyRef con la respuesta limpia (últimos 20 mensajes)

ChatMessage renderiza la respuesta del asistente:
  ├── Markdown completo con ReactMarkdown + remark-gfm
  ├── Bloques de código ASCII → modal fullscreen (PreComponent)
  └── Blockquotes con 📸/🎬 → <img>/<video> reales (BlockquoteMedia)
      Los documentos markdown embeben URLs de Cloudinary como blockquotes;
      BlockquoteMedia los detecta via hast AST y los renderiza como media.

RagChatWidget renderiza chips de sugerencias (último mensaje del asistente):
  → Solo si msg.suggestions?.length > 0 && !loading && !effectiveSupportMode
  → Chips pill amber clicables; al clicar llaman sendMessage() directamente
  → Desaparecen automáticamente al enviar el siguiente mensaje
```

---

## Edge Functions

### `rag-index` v15 — Indexación de documentos

**Constantes:**
```typescript
EMBED_MODEL          = 'gemini-embedding-2'   // 3072 dims
CHAT_MODEL           = 'gemini-3.1-flash-lite' // extracción PDF / contexto PDF / descripción video
CHUNK_SIZE           = 1200
CHUNK_OVERLAP        = 150
MARKDOWN_CHUNK_OVERLAP = 250                  // mayor overlap para secciones markdown
BATCH_SIZE           = 50                     // lote de embeddings y upsert a Pinecone
RATE_DELAY_MS        = 1500                   // retardo entre lotes si excede BATCH_SIZE
```

**Contextual Retrieval (`generateChunkContext`):**
- **PDFs:** Antes de embeddear cada chunk, llama a Gemini con el documento completo + el chunk y pide 2-3 oraciones de contexto. El embedding se genera sobre `contexto + "\n\n" + chunk`, pero en Pinecone `metadata.text` guarda el chunk original (técnica de Anthropic).
- **Markdown:** Omitido. `parseMarkdownSections()` ya antepone el breadcrumb jerárquico (`[H1 > H2 > H3]`) al inicio de cada chunk, proporcionando el contexto semántico necesario sin requerir llamadas LLM individuales.
- **Batch Embeddings:** `batchEmbedWithRetry()` envía los chunks del lote juntos en una única petición a `models/gemini-embedding-2:batchEmbedContents` con `taskType: 'RETRIEVAL_DOCUMENT'`. Reduce las llamadas de API de N a 1 por documento Markdown.

**`parseMarkdownSections`:** divide archivos `.md` por headings H1-H3 preservando la jerarquía en un breadcrumb `H1 > H2 > H3`. Cada sección incluye su heading como primera línea del texto.

**Regla crítica de metadata:** Pinecone solo acepta `string`, `number`, `boolean` o `array de strings`. **Nunca `null` ni `undefined`.** La función `cleanMeta()` filtra estos valores antes de cada upsert.

**Schema de metadata en Pinecone por tipo:**

```json
// PDF
{
  "text": "fragmento del chunk (sin el contexto generado)",
  "source": "manual.pdf",
  "source_type": "pdf",
  "page": 1,
  "totalPages": 18,
  "storage_path": "1234567890_manual.pdf"
}

// Markdown
{
  "text": "[Sección > Subsección]\ncontenido del chunk",
  "source": "como_configurar_impresora.md",
  "source_type": "markdown",
  "page": 3,
  "totalPages": 9,
  "section": "Sección > Subsección",
  "storage_path": "1234567890_como_configurar_impresora.md"
}

// Video
{
  "text": "descripción generada por Gemini",
  "source": "tutorial-impresora.mp4",
  "source_type": "video",
  "page": 1,
  "totalPages": 1,
  "video_url": "https://...",
  "timestamp_start": 0,
  "thumbnail_url": "https://..."   // solo si existe
}

// GIF / Imagen
{
  "text": "descripción generada por Gemini Vision",
  "source": "flujo-caja.gif",
  "source_type": "gif",
  "page": 1,
  "totalPages": 1,
  "gif_url": "https://..."
}
```

---

### `rag-chat` v41 — Consulta conversacional (streaming SSE)

**Constantes:**
```typescript
TOP_K_DISCOVERY = 15              // Etapa 1: identificar documentos relevantes
MAX_EXPAND_DOCS = 2               // Etapa 2: expandir hasta 2 documentos completos
MIN_EXPAND_SCORE = 0.38           // score mínimo para disparar la expansión
BISTRO_TOPIC_SCORE_FALLBACK = 35  // score mínimo para considerar tema Bistro
maxOutputTokens = 8192            // límite de salida de Gemini (guías largas + marcadores finales)
```

> ⚠️ **No bajar `maxOutputTokens`:** los marcadores `<<BISTRO_TOPIC>>` y `<<SUGGESTIONS>>` se emiten al FINAL de la respuesta. Si el límite trunca una guía larga (paso a paso de 10+ pasos), la respuesta queda incompleta Y los marcadores nunca se emiten → no hay clasificación de tema ni chips de sugerencias. 8192 da margen para las guías más largas del knowledge base.

**Respuesta en streaming (SSE):** desde v41 la respuesta se transmite token a token en lugar de devolverse de golpe. La edge function abre un `ReadableStream` y llama a Gemini con `streamGenerateContent?alt=sse`; por cada token reenvía un evento `data: {"t":"<token>"}` y al final un único evento `data: {"done":true,"answer":"...","bistro":...,"suggestions":[...]}` con la respuesta **ya limpia de marcadores**. El cliente (`useRagChat`) lee el stream con `getReader()` y va llenando el mensaje del asistente en vivo; al recibir `done` reemplaza el texto acumulado por `answer` limpio.

> 💡 **Por qué `fetch` directo y no `supabase.functions.invoke`:** el SDK de Supabase buferea toda la respuesta antes de devolverla, lo que anula el streaming. `useRagChat` usa `fetch()` crudo con cabeceras `Authorization: Bearer <anon>` + `apikey: <anon>` para poder leer el `ReadableStream` incremental.

> ⚠️ **El streaming NO sacrifica calidad:** Pinecone devuelve el contexto completo de una sola vez y `contextText` se arma íntegro **antes** de la primera llamada a Gemini. El streaming solo afecta la ruta de salida (cómo se muestra el texto generado), nunca el contexto de entrada. Gemini siempre razona con el contexto completo.

**Recuperación en 2 etapas (discovery + expansión):**
1. **Discovery** — consulta Pinecone con `topK=15` para identificar qué documentos (`source`) son relevantes.
2. **Expansión** — por cada uno de los top `MAX_EXPAND_DOCS` documentos con score ≥ `MIN_EXPAND_SCORE`, hace una segunda consulta filtrada por `source` (`topK=50`) para recuperar TODOS sus chunks y reconstruir el flujo completo del documento (ordenado por página). Si ningún match supera el umbral, usa los resultados de discovery como fallback.

**HyDE (Hypothetical Document Embedding):** antes de buscar en Pinecone, Gemini genera una respuesta hipotética de 8-12 oraciones a la query del usuario. Se embedea esa respuesta (no la query original) con `taskType: RETRIEVAL_QUERY`. Esto acerca el vector de búsqueda al espacio semántico donde viven los chunks correctos.

**Clasificación de relevancia:** el system prompt instruye a Gemini a cerrar cada respuesta con `<<BISTRO_TOPIC:yes>>` o `<<BISTRO_TOPIC:no>>`. `extractBistroTopicFlag()` lo extrae y determina `is_about_bistro`. Si el marcador falta, usa fallback por score máximo de Pinecone.

**Sugerencias contextuales:** inmediatamente después del marcador `<<BISTRO_TOPIC>>`, el sistema prompt exige que Gemini emita `<<SUGGESTIONS:["p1","p2"]>>` — 2 o 3 preguntas cortas que el contexto recuperado puede responder pero que no aparecieron en la respuesta principal. `extractSuggestions()` hace JSON.parse del array y devuelve máximo 3 strings. Si el marcador falta o el JSON es inválido retorna `[]`. Las sugerencias se devuelven como campo `suggestions` en la respuesta y se muestran como chips clicables en el widget.

> ⚠️ **Consistencia de marcadores:** el historial guardado en `historyRef` almacena la respuesta ya limpiada (sin marcadores). Esto puede causar que Gemini trate los marcadores como opcionales en conversaciones largas y deje de emitir `<<SUGGESTIONS>>`. Solución pendiente: reconstruir los marcadores al guardar en historial.

**Flujo de sources — ⛔ DESHABILITADO (2026-06-02):**
La construcción de fuentes (`getFileUrl()`, la query a `rag_documents` y el loop de objetos `source`) se **eliminó** porque la UI del widget no renderiza fuentes — solo muestra la respuesta, el feedback 👍/👎 y los chips de sugerencias. La edge function ya no genera `signed_url` por cada match (evita N llamadas secuenciales a Storage) y ya no devuelve el array `sources`.

El código quedó comentado en `rag-chat/index.ts` (busca el comentario `SOURCES DESHABILITADAS`) por si se reactiva la previsualización en el futuro. Para restaurarlo: descomentar `getFileUrl()`, la query a `rag_documents` y el loop de construcción de sources, y volver a incluir `sources` en el evento `done`.

Comportamiento original (preservado en comentarios):
- Ordenaba matches por relevancia del primer match del source, luego por página
- Deduplicaba por clave `source::page`
- Para markdown/PDF generaba `signed_url` (1h) del archivo en Storage privado
- Devolvía `score` como porcentaje (0–100), `excerpt` de 220 chars y campos de media

---

### `rag-clear` — Limpieza

Elimina todos los vectores del índice Pinecone y todos los registros de `rag_documents`. Los archivos físicos en Storage se eliminan por separado vía `deleteDocument()` en el hook.

---

## Previsualización de fuentes en la UI

```text
rag-chat devuelve para PDFs:
  signed_url → URL temporal (1 hora) al PDF completo en Supabase Storage
  page       → número de página donde está el fragmento

RagSourceCard → PdfPageRenderer:
  1. Configura worker: new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href
     → IMPORTANTE: pdfjs v5 usa .mjs — el CDN de cdnjs no tiene esta versión
  2. pdfjsLib.getDocument({ url: signed_url, withCredentials: false })
  3. pdf.getPage(page)
  4. pg.render({ canvasContext, viewport }) en <canvas>
  5. Muestra loading/error/done según el estado
```

Las páginas **no se pre-renderizan ni almacenan** — se renderizan on-the-fly en el browser desde el PDF original.

---

## Dictado por Voz (Deepgram)

El chat cuenta con dictado continuo en tiempo real, operado por el hook `useDictation.ts` e integrado en `RagChatWidget`. 

**Flujo de captura y transcripción:**
1. **Autenticación:** Invoca la Edge Function `deepgram-token`, la cual llama a `/v1/auth/grant` de Deepgram para obtener un JWT efímero.
2. **Audio Capture:** Pide permisos de micrófono desactivando el procesamiento nativo del navegador (`noiseSuppression: false`, `echoCancellation: false`). Esto es **crítico** porque el cancelador de ruido de Chrome en móviles Android suele clasificar la voz humana como ruido y la suprime por completo.
3. **Streaming PCM:** En lugar de usar `MediaRecorder` con el formato inestable `webm`, se utiliza la API `AudioContext` nativa acoplada a un `ScriptProcessorNode`. Esto convierte el stream del micrófono a formato **PCM linear16 de 16kHz crudo**, que se envía byte a byte vía WebSocket.
4. **WebSocket Handshake:** Se conecta a `wss://api.deepgram.com/v1/listen` con `encoding=linear16` y protocolo `['bearer', token]`.
5. **Recepción:** Deepgram devuelve resultados parciales (`interim_results=true`). `useDictation` los concatena fluidamente separando entre la parte final confirmada (`is_final=true`) y el borrador en vivo (`interim`).

---

## Widget flotante — comportamiento

El asistente ya no ocupa la pantalla activa. Se abre como widget persistente sobre el contenido.

### Integración en `App.tsx`

```ts
// 3 variables de estado
const [ragChatMounted, setRagChatMounted] = useState(false); // true para siempre tras el primer open
const [ragChatOpen, setRagChatOpen] = useState(false);
const [ragChatMinimized, setRagChatMinimized] = useState(false);
const [ragChatHasConversation, setRagChatHasConversation] = useState(false);

// Intercepción en handleNavigate — nunca llega a setCurrentScreen
if (screen === Screen.RAG_CHAT) {
  if (!ragChatMounted) { montar y abrir }
  else if (ragChatOpen) { togglear minimizado }
  else { reabrir }
  return;
}
```

El widget se monta una sola vez (`ragChatMounted`). Al cerrar o minimizar el componente permanece en el DOM, preservando el estado de `useRagChat` (historial de mensajes).

### Desktop (≥ 1024px) — Panel flotante

- **Posición:** `fixed left-[256px] top-[16px] bottom-[16px]`, separado 16px del sidebar
- **Ancho:** `min(580px, calc(100vw - 280px))` — adapta a la pantalla sin solapar sidebars derechos
- **Z-index:** `z-[110]` — por encima de todos los paneles laterales (ExpenseModal z-70, SettingsSidebarPanel z-90, pantallas de creación z-100)
- **Backdrop:** semitransparente desde `left: 240px`, desaparece al minimizar
- **Animación:** fade + `translateX` al abrir/cerrar
- **Minimizar (`remove`):** oculta el panel completo (no barra de título). La conversación se preserva.
- **Clic en sidebar:** si abierto → minimiza; si minimizado/cerrado → reabre

### Mobile/tablet (< 1024px) — FAB + sheet

- **FAB:** burbuja circular 56×56px amber, arrastrable con Pointer Events, snappea al borde izq/der al soltar
- **Tap en FAB:** abre/cierra el sheet (88vh, `rounded-t-3xl`)
- **Sheet:** backdrop + panel inferior, misma área de chat que desktop

### Indicador en sidebar

Cuando el usuario ha enviado al menos un mensaje (`messages.some(m => m.role === 'user')`):
- Punto amber pulsante (`animate-pulse`) a la derecha del label "Asistente IA"
- Borde `border-amber-300/60` + fondo `bg-amber-50/50` en el botón del sidebar (desktop y mobile)

---

## Componentes del frontend

### `RagChatWidget.tsx` ← principal desde 2026-05-17
- Detecta desktop/mobile con `window.innerWidth >= 1024` + resize listener
- `isMinimized` y `ragChatActive` controlados desde `App.tsx` vía props
- Notifica conversación activa al padre vía `onConversationChange(bool)`
- Reutiliza `useRagChat`, `ChatMessage`, `useToast` sin cambios
- **Chips de sugerencias:** renderizados tras el último mensaje del asistente (`lastAssistantIdx`). `handleSuggestionClick` valida conexión y modo soporte antes de llamar a `sendMessage`. Solo visibles cuando `!loading && !effectiveSupportMode`.
- **Puntos animados (streaming):** los 3 puntos amber de "pensando" solo se muestran durante la espera previa al primer token (`loading && !(últimoMensaje es assistant && tiene content)`). En cuanto llega el primer token del stream, los puntos desaparecen y el texto empieza a fluir en vivo dentro de la burbuja.

### `ChatMessage.tsx`
- **Des-indentación de blockquotes (`clean`):** antes de pasar el texto a ReactMarkdown se normaliza la indentación de los blockquotes generados por el system prompt (`> 🎬 📸 💡 ⚠️ 🔒 🤖`). Cuando Gemini los coloca dentro de un paso numerado los indenta con 4+ espacios, y en Markdown 4 espacios = bloque de código → los videos/imágenes aparecían como links y los tips como caja de código. El regex `^[ \t]+(>\s*(?:🎬|📸|💡|⚠️|🔒|🤖))` los lleva al margen para que se rendericen como media/blockquote real. No toca mockups ASCII (no empiezan con `> <emoji>`).
- `hastText(node)`: extrae texto plano del AST hast, incluyendo nodos `inlineCode` (envueltos en backticks) para que el regex de media pueda localizar URLs dentro de ellos
- `BlockquoteMedia`: componente custom para `blockquote` en ReactMarkdown. Detecta `📸 Imagen: \`URL\`` y `🎬 Video: \`URL\`` en el AST del nodo y los renderiza como `<img>` o `<video>` embebidos. Los blockquotes normales (tips, alertas) pasan sin cambio.
- `PreComponent`: bloques de código ASCII → modal fullscreen con copia al portapapeles

### `RagChatScreen.tsx` ← legacy
- Panel izquierdo (solo en `DEV`): gestión de documentos con upload, indexar, re-indexar y borrar
- Chat central: mensajes usuario/asistente, botón "VER N FUENTES"
- Panel derecho: `RagSourceCard` por cada fuente consultada (se abre en mobile con botón flotante)
- Muestra `indexError` en rojo cuando falla la indexación (mensaje real del error de Pinecone/Gemini)
- **Nota:** La navegación a `Screen.RAG_CHAT` es interceptada en `App.tsx` antes de llegar a esta pantalla. Esta pantalla queda en el código como fallback pero no se renderiza en producción normal.

### `RagSourceCard.tsx`
- Header colapsable: nombre, tipo, página, score %
- Expanded: excerpt en cursiva + preview visual (canvas PDF / iframe video / img GIF)
- `PdfPageRenderer`: renderiza página exacta usando pdfjs-dist v5
- `VideoRenderer`: thumbnail → iframe YouTube con timestamp

### `useRagChat.ts`
- Estado: `messages`, `loading`, `error`, `sources` (legacy, ya no se llena), `historyRef`
- `sendMessage(query)`: agrega el mensaje del usuario + un mensaje vacío del asistente, luego hace `fetch()` directo a `rag-chat` y **lee el stream SSE** con `res.body.getReader()`
- Parseo línea a línea de eventos `data:`:
  - `{"t":token}` → concatena al `content` del último mensaje (texto en vivo)
  - `{"done":true,answer,bistro,suggestions}` → reemplaza el `content` con `answer` limpio y fija `is_about_bistro` + `suggestions`
  - `{"error":msg}` → lanza error → la burbuja muestra "❌ Error al consultar: ..."
- `historyRef` guarda la respuesta limpia (últimos 20 mensajes)
- **No usa `supabase.functions.invoke`** (buferea la respuesta y rompe el streaming)

### `useRagDocuments.ts`
- Estado: `documents`, `uploading`, `indexing` (docId actual), `indexError`, `clearing`
- Realtime subscription a `rag_documents` para actualizar estado sin polling
- `indexDocument()`: extrae el body real del error via `error.context.json()` para mostrar el mensaje exacto de Pinecone

---

## Tabla `rag_documents`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | uuid | PK |
| `name` | text | Nombre original del archivo |
| `size_kb` | int | Tamaño en KB |
| `source_type` | enum | `pdf`, `image`, `video`, `gif` |
| `storage_path` | text | Ruta en el bucket `rag-documents` |
| `external_url` | text | URL externa (para video/gif) |
| `thumbnail_url` | text | Thumbnail de video (YouTube) |
| `uploaded_at` | timestamptz | Fecha de subida |
| `indexed_at` | timestamptz | Fecha de indexación exitosa |
| `page_count` | int | Número de páginas del PDF |
| `status` | enum | `pending`, `indexed`, `error` |

---

## Variables de entorno requeridas (Supabase Secrets)

```env
GEMINI_API_KEY=...
PINECONE_API_KEY=...
PINECONE_INDEX_NAME=bistro-knowledge
SUPABASE_URL=...              (auto-provista por Supabase)
SUPABASE_SERVICE_ROLE_KEY=... (auto-provista por Supabase)
```

---

## Reglas críticas

1. **Mismo modelo de embedding en `rag-index` y `rag-chat`:** `gemini-embedding-2` (3072 dims). Si se cambia en uno, cambiar en el otro Y recrear el índice de Pinecone.

2. **Metadata de Pinecone sin `null`:** Pinecone rechaza `null`/`undefined` con error HTTP 400 código 3. Usar `cleanMeta()` antes de cada upsert.

3. **Worker de pdfjs v5:** Usar `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href`, NO la URL de CDN (no existe `.min.js` para v5).

4. **Bucket privado:** `rag-documents` requiere `createSignedUrl()` (TTL 3600s), nunca `getPublicUrl()`.

---

## Stack de capas (z-index)

Orden global de apilamiento del sistema de overlays:

| Capa | z-index |
|---|---|
| Backdrop chat | z-[54] |
| Panel detalle cliente/proveedor | z-[56] |
| ExpenseModal | z-[70] |
| Backdrop SettingsSidebarPanel | z-[80] |
| Panel SettingsSidebarPanel | z-[90] |
| Pantallas producto/promoción/creación | z-[100] |
| Chat panel (RagChatWidget desktop) | z-[110] |

El chat siempre queda al frente para que el usuario pueda consultarlo sin importar qué panel o modal esté abierto.

---

## Historial de cambios

| Fecha | Cambio |
|-------|--------|
| 2026-10-11 | **Optimización crítica (rag-index):** Eliminadas llamadas redundantes de contexto (`generateChunkContext`) en documentos Markdown (usa el breadcrumb jerárquico nativo). Implementada vectorización por lotes (`batchEmbedWithRetry`) contra `models/gemini-embedding-2:batchEmbedContents` con `BATCH_SIZE = 50`. Reduce el consumo de API en indexación de 80 llamadas a 1 llamada por guía Markdown y el tiempo de ~80s a <3s sin alterar la calidad del retriever. |
| 2026-06-02 | **Fix:** Imágenes y videos de Cloudinary se mostraban como links en vez de embeberse. Causa: al generar guías largas con pasos numerados, Gemini indentaba los blockquotes de multimedia (`> 🎬`/`> 📸`) con 4+ espacios, y en Markdown 4 espacios = bloque de código → `BlockquoteMedia` nunca los procesaba. Fix en `ChatMessage.tsx`: se des-indentan los blockquotes del system prompt (media + tips `💡 ⚠️ 🔒 🤖`) al margen izquierdo antes de pasarlos a ReactMarkdown. No se tocó `ChatMessage` en su lógica de render ni el backend. |
| 2026-06-02 | **Feature:** Respuesta en **streaming SSE** en `rag-chat` (v41-42). La edge function abre un `ReadableStream` y llama a Gemini con `streamGenerateContent?alt=sse`, reenviando cada token como `data: {"t":token}` y un evento final `data: {"done":true,answer,bistro,suggestions}` con la respuesta limpia. `useRagChat` se reescribió para usar `fetch()` directo + `getReader()` en vez de `supabase.functions.invoke` (el SDK buferea y rompe el stream); llena la burbuja del asistente token a token. En `RagChatWidget` los puntos animados solo aparecen durante la espera previa al primer token. El streaming no afecta la calidad: Pinecone entrega el contexto completo antes de la primera llamada a Gemini. |
| 2026-06-02 | **Fix (v42):** Respuestas incompletas + sin sugerencias. Se había bajado `maxOutputTokens` a 3000 al implementar streaming, lo que truncaba las guías paso a paso largas ANTES de que Gemini emitiera los marcadores `<<BISTRO_TOPIC>>` y `<<SUGGESTIONS>>` del final → respuesta cortada y chips vacíos. Revertido a **8192**. Verificado: respuesta completa (~17k chars) con `is_about_bistro=true` y 3 sugerencias. |
| 2026-06-02 | **Refactor:** **Sources deshabilitadas** en `rag-chat`. Se eliminó `getFileUrl()` (generaba N `signed_url` secuenciales a Storage), la query a `rag_documents` y el loop de construcción de `sources`, porque la UI del widget nunca renderizó fuentes (solo respuesta + feedback + sugerencias). El código quedó comentado con la etiqueta `SOURCES DESHABILITADAS` para una posible reactivación futura. Elimina latencia por consulta. |
| 2026-06-01 | **Fix:** API key de Gemini renovada (`GEMINI_API_KEY` en Supabase Secrets) — la anterior había expirado. **Modelo de chat migrado** de `gemini-2.0-flash` (deprecado, devuelve 404) a `gemini-2.5-flash`. **Fix en `callGemini()`:** ahora verifica `data.error` antes de leer `candidates`, lanzando el mensaje real de Gemini en lugar de silenciar el error como "respuesta sin texto". **Fix en `useRagChat.ts`:** `fnError.context.json()` extrae el body real de la respuesta 500 de la edge function; antes el SDK de Supabase solo exponía el genérico "Edge Function returned a non-2xx status code". |
| 2026-05-28 | **Fix:** Estado offline en `RagChatWidget`. Cuando `isOnline === false`, el área de contenido del widget (chat, campo de texto, pestañas) se reemplaza por un bloque "Sin conexión" con ícono `wifi_off` y mensaje explicativo. El header del widget (botones de cerrar, pestañas, nueva conversación) permanece accesible. Antes el widget abría el chat normalmente y solo bloqueaba el envío de mensajes mostrando un toast. |
| 2026-05-26 | **Feature:** Migración completa de Web Speech API a Deepgram WebSocket en `useDictation.ts`. Implementado streaming en formato crudo PCM linear16 (vía `AudioContext` y `ScriptProcessorNode`) descartando `MediaRecorder`/webm debido a inestabilidad en móviles. Desactivado `noiseSuppression` nativo del navegador que causaba confianza cero en Android. |
| 2026-05-25 | **Feature:** Sugerencias contextuales en `rag-chat` (v24). El system prompt obliga a Gemini a emitir `<<SUGGESTIONS:["p1","p2"]>>` al final de cada respuesta — preguntas que el contexto recuperado puede responder pero no aparecieron en la respuesta principal. `extractSuggestions()` parsea el array; `RagChatWidget` los muestra como chips pill amber clicables bajo el último mensaje. `RagMessage` recibe campo `suggestions?: string[]`. **Caveat conocido:** `historyRef` guarda respuestas sin marcadores, lo que puede hacer que Gemini deje de emitir `<<SUGGESTIONS>>` en conversaciones largas (pendiente de corrección). |
| 2026-05-25 | **Feature:** Contextual Retrieval (Anthropic) en `rag-index`. `generateChunkContext()` llama a Gemini por cada chunk al indexar para generar 2-3 oraciones de contexto. El embedding se hace sobre `contexto + chunk`, pero Pinecone guarda el chunk original. Mejora retrieval ~49-67% para queries ambiguas. |
| 2026-05-25 | **Feature:** HyDE (Hypothetical Document Embedding) en `rag-chat`. Antes de buscar en Pinecone, Gemini genera una respuesta hipotética de 8-12 oraciones a la query. El vector de esa respuesta se usa para la búsqueda en lugar del vector de la query original. |
| 2026-05-25 | **Fix:** Task types asimétricos en embeddings: `rag-index` usa `RETRIEVAL_DOCUMENT`, `rag-chat` usa `RETRIEVAL_QUERY`. Antes ambos usaban prefijos de texto manuales (simétrico), lo que no aprovechaba la ventaja asimétrica de Gemini Embedding 2. |
| 2026-05-25 | **Feature:** Soporte de documentos Markdown en `rag-index`. `parseMarkdownSections()` divide por headings H1-H3 con breadcrumb jerárquico. Los chunks se prefijarán con `[sección]` antes de embeddear. |
| 2026-05-25 | **Config:** `TOP_K` en `rag-chat` subido de 8 a 14 para recuperar más contexto por consulta. |
| 2026-05-25 | **Feature:** `BlockquoteMedia` en `ChatMessage.tsx`. Blockquotes con `📸 Imagen: \`URL\`` o `🎬 Video: \`URL\`` se renderizan como `<img>` o `<video>` reales en la respuesta del asistente, usando `hastText()` para extraer la URL desde el AST hast (incluyendo nodos `inlineCode`). |
| 2026-05-25 | **Feature:** Sistema de clasificación de relevancia `<<BISTRO_TOPIC:yes/no>>` en `rag-chat`. El modelo cierra cada respuesta con el marcador; `extractBistroTopicFlag()` lo extrae y determina `is_about_bistro`. Fallback por score máximo de Pinecone si el marcador falta. |
| 2026-05-17 | **Fix:** Z-index del panel subido de z-[55] a z-[110] para quedar visible sobre todos los paneles laterales (ExpenseModal z-70, SettingsSidebarPanel z-90, pantallas de creación z-100). Backdrop del chat permanece en z-[54]. |
| 2026-05-17 | **Feature:** Reemplazada la pantalla completa `RagChatScreen` por widget flotante `RagChatWidget`. Desktop: panel `fixed` junto al sidebar con backdrop y animación. Mobile: FAB arrastrable + sheet. Conversación siempre preservada (componente nunca se desmonta). |
| 2026-05-17 | **Feature:** Clic en "Asistente IA" del sidebar con chat abierto minimiza el panel (oculta completamente). Segundo clic reabre. |
| 2026-05-17 | **Feature:** Indicador visual en sidebar cuando hay conversación activa: punto amber `animate-pulse` + borde/fondo amber sutil en el ítem. Solo se activa cuando el usuario ha enviado al menos un mensaje (el saludo inicial del asistente no cuenta). |
| 2026-05-09 | **Fix crítico:** `rag-chat` usaba `text-embedding-004` (768 dims) para buscar en índice de 3072 dims. Corregido a `gemini-embedding-2`. |
| 2026-05-09 | **Fix:** `rag-chat` usaba `getPublicUrl()` en bucket privado. Cambiado a `createSignedUrl()` (TTL 3600s). |
| 2026-05-09 | **Fix crítico:** `rag-index` enviaba campos `null` en metadata a Pinecone → HTTP 400 `"Metadata value must be a string, number, boolean or list of strings, got 'null'"`. Añadida función `cleanMeta()` que filtra null/undefined antes del upsert. |
| 2026-05-09 | **Fix:** `rag-index` no verificaba el resultado del upsert a Pinecone → documentos quedaban marcados como `'indexed'` con 0 vectores reales. Añadido `if (!upsertRes.ok) throw` y verificación de `upsertedCount > 0`. |
| 2026-05-09 | **Fix:** Worker de pdfjs v5 apuntaba a CDN con extensión `.js` que no existe en v5 (usa `.mjs`). Cambiado a worker local via `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href`. |
| 2026-05-09 | **Feature:** Botón de re-indexar (icono `refresh`) para documentos en estado `indexed` o `error`. Antes solo había botón para `pending`. |
| 2026-05-09 | **Feature:** `useRagDocuments.indexError` expone el mensaje real del error (extraído de `error.context.json()`). Mostrado en rojo en el panel de documentos. |
| 2026-05-09 | Migración del backend Express local (`RAG consulta BISTRO/server.mjs`) a Supabase Edge Functions. |
