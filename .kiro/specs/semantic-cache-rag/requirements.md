# Requirements Document

## Introduction

Esta funcionalidad, **Semantic Cache para RAG Chat**, implementa una capa de caché semántico en la edge function `rag-chat` del asistente IA de Bistro POS. El objetivo es reducir costos de API (Gemini + Pinecone) entre un 20-50% sirviendo respuestas cacheadas cuando un usuario hace una pregunta semánticamente equivalente a una ya respondida previamente.

El caché es **compartido entre todos los negocios** (multi-tenant) porque las respuestas del RAG son sobre funcionalidad de la aplicación, no sobre datos específicos de cada negocio. Se utiliza PostgreSQL con la extensión `pgvector` (ya habilitada en Supabase) para almacenar embeddings de 3072 dimensiones y buscar por similitud coseno.

## Glossary

- **Semantic_Cache**: Tabla `rag_cache` en Supabase PostgreSQL que almacena pares pregunta-respuesta con sus embeddings vectoriales para búsqueda por similitud semántica.
- **Cache_Hit**: Evento en el que la similitud coseno entre el embedding de la query entrante y un registro existente en Semantic_Cache supera el umbral configurado (0.95 por defecto).
- **Cache_Miss**: Evento en el que ningún registro en Semantic_Cache alcanza el umbral de similitud para la query entrante.
- **Similarity_Threshold**: Valor numérico (0.0–1.0) que define el mínimo de similitud coseno requerido para considerar un Cache_Hit. Valor por defecto: 0.95.
- **TTL**: Tiempo de vida de una entrada en caché. Las entradas más antiguas que el TTL (3 días por defecto) se eliminan automáticamente.
- **Source_Doc_Tagging**: Estrategia de invalidación selectiva donde cada entrada de caché almacena el identificador del documento fuente principal (`topSources[0]`) que generó la respuesta. Permite invalidar solo las entradas asociadas a un documento específico cuando este se reindexa, sin vaciar todo el caché.
- **RAG_Pipeline**: Flujo completo de consulta existente: HyDE → embedding → búsqueda en Pinecone → generación con Gemini → respuesta SSE.
- **SSE**: Server-Sent Events, protocolo de streaming usado por `rag-chat` para transmitir la respuesta token a token al cliente.
- **pg_cron**: Extensión de PostgreSQL para programar tareas periódicas dentro de la base de datos.
- **match_rag_cache**: Función RPC de Supabase que recibe un embedding y un umbral, y retorna el registro más similar si supera el umbral.

## Requirements

### Requisito 1: Búsqueda de caché por similitud semántica

**Historia de Usuario:** Como sistema RAG, quiero buscar en el caché semántico antes de ejecutar el pipeline completo, para evitar llamadas costosas a Gemini y Pinecone cuando ya existe una respuesta equivalente.

#### Criterios de Aceptación

1.1. WHEN una query es recibida por `rag-chat`, THE Semantic_Cache SHALL generar el embedding de la query cruda del usuario con `gemini-embedding-2` (3072 dimensiones) y ejecutar `match_rag_cache` con dicho embedding y el Similarity_Threshold configurado.

1.2. WHEN `match_rag_cache` retorna un resultado con similitud ≥ Similarity_Threshold, THE Semantic_Cache SHALL clasificar el evento como Cache_Hit y omitir la ejecución del RAG_Pipeline completo (HyDE, Pinecone y Gemini).

1.3. WHEN `match_rag_cache` no retorna resultados o la similitud es menor al Similarity_Threshold, THE Semantic_Cache SHALL clasificar el evento como Cache_Miss y ejecutar el RAG_Pipeline normalmente.

1.4. THE match_rag_cache SHALL utilizar la distancia coseno (`<=>` operator de pgvector) para calcular la similitud entre el embedding de la query y los embeddings almacenados en `rag_cache`.

1.5. THE match_rag_cache SHALL realizar un sequential scan sobre la tabla `rag_cache` sin requerir un índice HNSW o IVFFlat, dado que pgvector limita estos índices a 2000 dimensiones y el volumen esperado es menor a 1000 filas.

### Requisito 2: Respuesta inmediata en Cache Hit vía SSE

**Historia de Usuario:** Como usuario del asistente IA, quiero recibir la respuesta lo más rápido posible cuando mi pregunta ya fue respondida previamente, para no esperar el procesamiento completo del RAG.

#### Criterios de Aceptación

2.1. WHEN ocurre un Cache_Hit, THE `rag-chat` SHALL transmitir la respuesta cacheada al cliente usando el mismo protocolo SSE existente: eventos `data: {"t":"<token>"}` seguidos de un evento final `data: {"done":true,"answer":"...","bistro":...,"suggestions":[...]}`.

2.2. WHEN ocurre un Cache_Hit, THE `rag-chat` SHALL incluir en el evento final los campos `answer`, `is_about_bistro` y `suggestions` tal como fueron almacenados en la entrada de caché.

2.3. WHEN ocurre un Cache_Hit, THE `rag-chat` SHALL completar la respuesta en un tiempo significativamente menor que el RAG_Pipeline completo, dado que no realiza llamadas a Pinecone ni a Gemini para generación.

### Requisito 3: Almacenamiento en caché tras Cache Miss

**Historia de Usuario:** Como sistema RAG, quiero almacenar las respuestas generadas exitosamente para que futuras preguntas similares se beneficien del caché.

#### Criterios de Aceptación

3.1. WHEN el RAG_Pipeline completa exitosamente una respuesta tras un Cache_Miss, THE Semantic_Cache SHALL insertar un nuevo registro en la tabla `rag_cache` con: el texto de la query, el embedding vectorial (3072 dims), la respuesta generada (`answer`), el flag `is_about_bistro`, el array `suggestions`, y el campo `source_doc`.

3.2. WHEN el RAG_Pipeline falla o no encuentra información relevante (0 matches en Pinecone), THE Semantic_Cache SHALL NO almacenar el resultado en caché.

3.3. WHEN `is_about_bistro` es `false` (pregunta no relacionada con Bistro POS), THE Semantic_Cache SHALL NO almacenar el resultado en caché, para evitar contaminar el caché con respuestas genéricas.

3.4. THE Semantic_Cache SHALL registrar `created_at` con el timestamp UTC del momento de inserción para permitir la expiración por TTL.

3.5. WHEN se almacena una entrada en caché, THE Semantic_Cache SHALL extraer el identificador del documento fuente principal (`topSources[0]`) del paso de expansión RAG y almacenarlo en el campo `source_doc` de la entrada.

### Requisito 4: Expiración automática por TTL

**Historia de Usuario:** Como administrador del sistema, quiero que las entradas de caché expiren automáticamente después de 3 días, para que respuestas que usaron fuentes secundarias no rastreadas en `source_doc` se renueven con frecuencia.

#### Criterios de Aceptación

4.1. THE pg_cron SHALL ejecutar una tarea diaria que elimine todos los registros de `rag_cache` cuyo `created_at` sea anterior a 3 días respecto al momento de ejecución.

4.2. IF la tarea de limpieza de pg_cron falla, THEN THE Semantic_Cache SHALL continuar operando normalmente (las entradas expiradas se servirán hasta la próxima ejecución exitosa de la tarea).

4.3. THE Semantic_Cache SHALL permitir ajustar el TTL (3 días por defecto) modificando la configuración de la tarea pg_cron sin requerir cambios en el código de la edge function.

### Requisito 5: Invalidación del caché

**Historia de Usuario:** Como administrador del sistema, quiero que el caché se invalide selectivamente cuando se reindexan documentos específicos, y completamente cuando se ejecuta un reset manual, para mantener coherencia sin perder entradas de caché aún válidas.

#### Criterios de Aceptación

5.1. WHEN se invoca la edge function `rag-clear` (que vacía Pinecone y `rag_documents`), THE Semantic_Cache SHALL vaciar completamente la tabla `rag_cache`.

5.2. WHEN se completa exitosamente la indexación de un documento vía `rag-index`, THE Semantic_Cache SHALL eliminar solo las entradas de `rag_cache` cuyo campo `source_doc` coincida con el identificador del documento reindexado, preservando las entradas asociadas a otros documentos.

5.3. THE TTL de 3 días SHALL actuar como red de seguridad para entradas que utilizaron chunks de documentos secundarios no rastreados en `source_doc`, garantizando que en un máximo de 3 días cualquier entrada parcialmente obsoleta expire y se regenere.

### Requisito 6: Tabla y función RPC en Supabase

**Historia de Usuario:** Como desarrollador, quiero una tabla y función SQL bien definidas para que la edge function pueda interactuar con el caché de forma eficiente.

#### Criterios de Aceptación

6.1. THE Semantic_Cache SHALL almacenar los datos en una tabla `rag_cache` con las siguientes columnas: `id` (uuid PK), `query_text` (text), `query_embedding` (vector(3072)), `answer` (text), `suggestions` (jsonb), `is_about_bistro` (boolean), `source_doc` (text), `created_at` (timestamptz default now()).

6.2. THE match_rag_cache SHALL ser una función SQL/plpgsql que reciba un parámetro `query_embedding` (vector(3072)) y un parámetro `match_threshold` (float), y retorne la fila con mayor similitud coseno si supera el umbral, o ninguna fila si no hay coincidencia.

6.3. THE match_rag_cache SHALL retornar además la similitud calculada como campo adicional para permitir logging y diagnóstico.

6.4. THE match_rag_cache SHALL filtrar solo registros cuyo `created_at` sea posterior a 3 días atrás, para no servir entradas expiradas entre ejecuciones de pg_cron.

### Requisito 7: Observabilidad del caché

**Historia de Usuario:** Como desarrollador, quiero saber cuántos cache hits y misses ocurren, para evaluar la efectividad del caché y ajustar el umbral si es necesario.

#### Criterios de Aceptación

7.1. WHEN ocurre un Cache_Hit, THE `rag-chat` SHALL registrar en los logs de la edge function: `[CACHE HIT]`, la similitud obtenida y un extracto de la query (primeros 80 caracteres).

7.2. WHEN ocurre un Cache_Miss, THE `rag-chat` SHALL registrar en los logs: `[CACHE MISS]` y un extracto de la query (primeros 80 caracteres).

7.3. WHEN ocurre un Cache_Hit, THE `rag-chat` SHALL incluir un campo `cached: true` en el evento SSE final (`done`) para que el frontend pueda distinguir respuestas cacheadas si se requiere en el futuro.
