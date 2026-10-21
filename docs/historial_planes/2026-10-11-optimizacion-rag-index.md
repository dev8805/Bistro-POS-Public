# Plan de Implementación: Optimización de Indexación RAG (`rag-index`)

**Fecha:** 2026-10-11  
**Módulo:** `supabase/functions/rag-index/index.ts`  
**Objetivo:** Reducir el consumo de cuota de la API de Gemini de **80 llamadas a 1 sola llamada** por documento Markdown, disminuyendo el tiempo de indexación de ~80 segundos a menos de 3 segundos sin alterar la calidad de búsqueda del Asistente IA.

---

## 1. Contexto y Diagnóstico

Actualmente, al indexar o actualizar una guía de usuario en Markdown (como [`como_hacer_una_venta.md`](file:///c:/Users/HP/OneDrive/Escritorio/Bistro/docs/guias_usuario/como_hacer_una_venta.md)):
1. El documento se divide en 40 fragmentos (*chunks*).
2. **Llamada 1 redundante:** Por cada fragmento, se invoca a `gemini-3.1-flash-lite` para redactar 2-3 oraciones de contexto, a pesar de que el fragmento ya cuenta con el encabezado jerárquico de títulos (*breadcrumb*). Esto genera **40 llamadas innecesarias**.
3. **Llamada 2 ineficiente:** Los 40 fragmentos se vectorizan con `gemini-embedding-2` de forma secuencial uno por uno, con pausas forzadas de 1.5 segundos entre cada uno. Esto genera otras **40 llamadas individuales**.

---

## 2. Mapa de Cambios

### Archivos Afectados:
- [`supabase/functions/rag-index/index.ts`](file:///c:/Users/HP/OneDrive/Escritorio/Bistro/supabase/functions/rag-index/index.ts): Función principal de backend encargada del parseo, vectorización y subida a Pinecone.
- [`docs/caracteristicas/asistente_ia_rag.md`](file:///c:/Users/HP/OneDrive/Escritorio/Bistro/docs/caracteristicas/asistente_ia_rag.md): Documentación técnica del subsistema RAG.

---

## 3. Fases de Implementación

### Fase 1: Desactivar Contextual Retrieval exclusivamente en Markdown
- **Archivo:** `supabase/functions/rag-index/index.ts`
- **Acción:**
  - En la rama `if (doc.source_type === 'markdown')` (líneas 334–358), remover la invocación a `generateChunkContext`.
  - Asignar directamente `embedText = rawChunk` (el cual ya incluye el prefijo `[${section.breadcrumb}]\n`).
  - Mantener `generateChunkContext` activo únicamente en la rama `if (doc.source_type === 'pdf')`, donde el texto extraído carece de estructura semántica.
- **Resultado:** Las 40 llamadas de chat LLM para Markdown pasan a **0 llamadas**.

### Fase 2: Vectorización por Lotes (*Batch Embeddings*)
- **Archivo:** `supabase/functions/rag-index/index.ts`
- **Acción:**
  - Crear una función auxiliar `batchEmbedWithRetry(texts: string[], retries = 5)`.
  - Aprovechar la capacidad nativa del SDK `@google/genai` pasando la lista completa de textos en la propiedad `contents: texts` con `taskType: 'RETRIEVAL_DOCUMENT'`.
  - Definir un tamaño de lote seguro (`BATCH_SIZE = 50`) para respetar los límites de carga útil de Google.
  - Asignar los vectores devueltos con correspondencia 1:1 (`embeddings[i].values` emparejado con `batch[i]`).
- **Resultado:** Las 40 llamadas de embedding individuales pasan a **1 sola llamada HTTP** en Google Cloud para documentos de hasta 50 fragmentos.

### Fase 3: Optimización del Upsert a Pinecone
- **Archivo:** `supabase/functions/rag-index/index.ts`
- **Acción:**
  - Actualizar el tamaño de lote de subida a Pinecone para procesar los vectores en grupos de 50 (Pinecone soporta hasta 100–250 vectores por petición).
  - Eliminar los retardos artificiales innecesarios de 1.5 segundos (`sleep(RATE_DELAY_MS)`) entre llamadas unitarias.
- **Resultado:** Tiempo total de ejecución de la Edge Function reducido de ~80 segundos a ~2–3 segundos.

### Fase 4: Registro y Documentación
- **Archivo:** `docs/caracteristicas/asistente_ia_rag.md`
- **Acción:**
  - Actualizar la sección de `rag-index` documentando que el procesamiento Markdown utiliza breadcrumbs directos sin llamada LLM intermedia y embeddings agrupados en batch.
  - Registrar la entrada correspondiente en la tabla de historial de cambios del documento.

---

## 4. Matriz de Impacto

| Métrica | Antes | Después | Beneficio |
| :--- | :--- | :--- | :--- |
| **Llamadas Gemini por guía Markdown (40 chunks)** | 80 llamadas | **1 llamada** | **-98.7% de llamadas** |
| **Llamadas si se reindexan las 20 guías** | 1,096 llamadas | **~20 llamadas** | Evita saturar cuotas de Google |
| **Tiempo de indexación por documento** | ~80 segundos | **~2 a 3 segundos** | Casi instantáneo |
| **Riesgo de Timeout en el cliente frontend** | Alto (requería 180s de timeout) | Nulo (< 5 segundos) | Mayor estabilidad |
| **Calidad de búsqueda y respuestas en el Chat** | 100% | **100% idéntica** | Vectores e información matemática intactos |

---

## 5. Criterios de Aceptación y Pruebas
1. Subir o reindexar una guía Markdown (`como_hacer_una_venta.md`) desde la pestaña **Base** del widget.
2. Comprobar en los logs de la Edge Function que se genera un único lote de embeddings.
3. Verificar en la consola de Google que el contador solo suma 1 llamada en lugar de 80.
4. Realizar preguntas de prueba en el chat (ej. *"¿Cómo hago una venta rápida o con fotoventa?"*) y confirmar que recupera los fragmentos correctos y responde con la misma precisión.
