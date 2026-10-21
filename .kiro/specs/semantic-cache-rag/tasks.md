# Implementation Plan: Semantic Cache para RAG Chat

## Overview

Implementar una capa de caché semántico en la edge function `rag-chat` usando PostgreSQL + pgvector (ya habilitado). El caché reduce costos de Gemini + Pinecone sirviendo respuestas previas cuando la similitud coseno supera 0.95. Incluye invalidación selectiva por `source_doc` al reindexar y truncate completo en `rag-clear`.

**Lenguaje:** TypeScript (Deno Edge Functions)
**Deploy:** Supabase MCP (`deploy_edge_function`)

## Tasks

- [x] 1. Crear tabla `rag_cache` y función RPC en PostgreSQL
  - [x] 1.1 Crear tabla `rag_cache` con migración SQL (sin índice vectorial)
    - Ejecutar via `execute_sql` de Supabase MCP
    - Columnas: `id` (uuid PK), `query_text` (text), `query_embedding` (vector(3072)), `answer` (text), `suggestions` (jsonb default '[]'), `is_about_bistro` (boolean default true), `source_doc` (text nullable), `created_at` (timestamptz default now())
    - Crear índice `idx_rag_cache_source_doc` en `source_doc` (para invalidación selectiva)
    - Crear índice `idx_rag_cache_created_at` en `created_at` (para limpieza TTL)
    - NO crear índice vectorial (HNSW/IVFFlat no soportan >2000 dims, sequential scan es suficiente para <1000 filas)
    - La extensión pgvector ya está habilitada (migración previa exitosa)
    - _Requirements: 6.1_

  - [x] 1.2 Crear función RPC `match_rag_cache`
    - Ejecutar via `execute_sql` de Supabase MCP
    - Parámetros: `query_embedding vector(3072)`, `match_threshold float DEFAULT 0.95`
    - Retorna: `id`, `query_text`, `answer`, `suggestions`, `is_about_bistro`, `source_doc`, `similarity`
    - Calcula similitud como `(1 - (query_embedding <=> param))::float`
    - Filtra `created_at > now() - interval '3 days'` (doble barrera TTL)
    - Ordena por distancia coseno ascendente, LIMIT 1
    - El threshold se compara en la edge function (no en SQL) para loguear misses cercanos
    - _Requirements: 6.2, 6.3, 6.4, 1.4, 1.5_

  - [x] 1.3 Configurar tarea pg_cron para limpieza diaria
    - Ejecutar via `execute_sql`: `SELECT cron.schedule('cleanup-rag-cache', '0 3 * * *', $$DELETE FROM rag_cache WHERE created_at < now() - interval '3 days'$$);`
    - Se ejecuta diariamente a las 3:00 UTC
    - TTL de 3 días ajustable modificando solo la tarea cron
    - _Requirements: 4.1, 4.3_

- [x] 2. Implementar módulo de caché en `rag-chat`
  - [x] 2.1 Crear lookup de caché (embedding + RPC)
    - Al inicio del handler (antes de HyDE), generar embedding de la **query cruda** con `gemini-embedding-2` (3072 dims) usando la función `embedQuery` existente
    - Llamar a `match_rag_cache` via `supabase.rpc('match_rag_cache', { query_embedding, match_threshold: 0.95 })`
    - Si `result.similarity >= 0.95` → CACHE HIT: loguear `[CACHE HIT] sim=X.XX "query..."` (primeros 80 chars)
    - Si no hay resultado o `similarity < 0.95` → CACHE MISS: loguear `[CACHE MISS] "query..."` (primeros 80 chars)
    - En error del módulo de caché: loguear warning y continuar como MISS (el caché nunca bloquea el flujo principal)
    - _Requirements: 1.1, 1.2, 1.3, 7.1, 7.2_

  - [x] 2.2 Implementar respuesta SSE para Cache Hit
    - Cuando hay HIT, crear un `ReadableStream` que emita la respuesta cacheada
    - Tokenizar `entry.answer` en grupos de ~3 palabras → `data: {"t":"chunk"}\n\n`
    - Evento final: `data: {"done":true,"answer":"...","bistro":true/false,"suggestions":[...],"cached":true}\n\n`
    - No introducir delay artificial entre tokens (respuesta lo más rápido posible)
    - Usar los mismos headers SSE existentes (`Content-Type: text/event-stream`, etc.)
    - Omitir completamente el RAG pipeline (HyDE, Pinecone, Gemini)
    - _Requirements: 2.1, 2.2, 2.3, 7.3_

  - [x] 2.3 Implementar almacenamiento en caché tras Cache Miss
    - Después de que el pipeline RAG complete exitosamente (SSE terminado):
    - Solo almacenar si `is_about_bistro === true` (no cachear respuestas genéricas)
    - Solo almacenar si hubo matches en Pinecone (`discoveryMatches.length > 0`)
    - INSERT en `rag_cache`: `query_text`, `query_embedding` (reutilizar el generado en lookup), `answer`, `suggestions`, `is_about_bistro`, `source_doc`
    - Extraer `source_doc`: `topSources[0]` (si hubo expansión) || `discoveryMatches[0].metadata.source` (fallback) || `'unknown'`
    - El INSERT es fire-and-forget: si falla, solo loguear warning (la respuesta ya fue enviada)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.4 Reestructurar el flujo del handler para integrar el caché
    - Mover la generación de embedding de query cruda ANTES del bloque HyDE+Pinecone
    - El flujo queda: 1) embed raw query → 2) lookup caché → 3a) si HIT: stream cached → 3b) si MISS: HyDE → Pinecone → Gemini → store
    - El embedding de query cruda y el embedding HyDE son DIFERENTES y ambos se necesitan (raw para caché, HyDE para Pinecone)
    - Mantener el `Promise.all([generateHypotheticalAnswer, getPineconeHost])` existente solo en el path de MISS
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 3. Checkpoint — Verificar que rag-chat funciona con caché
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Integrar invalidación del caché en funciones existentes
  - [x] 4.1 Agregar invalidación selectiva en `rag-index`
    - Al final de la indexación exitosa (después de `status: 'indexed'`), ejecutar:
    - `DELETE FROM rag_cache WHERE source_doc = doc.name` via `supabase.from('rag_cache').delete().eq('source_doc', doc.name)`
    - `doc.name` coincide con `metadata.source` en Pinecone (misma clave usada en `extractSourceDoc`)
    - Si falla: loguear `[CACHE INVALIDATION] Error: ...` pero NO fallar la indexación
    - _Requirements: 5.2_

  - [x] 4.2 Agregar truncate completo en `rag-clear`
    - Junto con la limpieza de Pinecone y `rag_documents`, agregar:
    - `supabase.from('rag_cache').delete().neq('id', '00000000-0000-0000-0000-000000000000')`
    - Loguear `[CACHE] rag_cache vaciado` en éxito
    - Si falla: loguear warning y continuar con el resto de la limpieza
    - _Requirements: 5.1_

- [x] 5. Deploy de las edge functions modificadas
  - [x] 5.1 Deploy `rag-chat` con el módulo de caché integrado
    - Usar `deploy_edge_function` de Supabase MCP
    - Verificar que los secrets existentes siguen funcionando (GEMINI_API_ASISTENTE, PINECONE_API_KEY, etc.)
    - _Requirements: 1.1, 2.1, 3.1_

  - [x] 5.2 Deploy `rag-index` con invalidación selectiva
    - Usar `deploy_edge_function` de Supabase MCP
    - _Requirements: 5.2_

  - [x] 5.3 Deploy `rag-clear` con truncate de rag_cache
    - Usar `deploy_edge_function` de Supabase MCP
    - _Requirements: 5.1_

- [x] 6. Checkpoint final — Verificar flujo completo
  - Ensure all tests pass, ask the user if questions arise.
  - Verificar: MISS → store → HIT en una segunda consulta similar
  - Verificar: logs [CACHE HIT] y [CACHE MISS] visibles en Supabase logs
  - Verificar: campo `cached: true` en evento SSE final de hits

## Notes

- Las tareas marcadas con `*` son opcionales y se pueden omitir para un MVP más rápido.
- La extensión pgvector ya está habilitada — NO intentar crearla de nuevo.
- La migración previa de la tabla falló por intentar crear un índice vectorial HNSW. Esta vez se crea SIN índice vectorial (sequential scan es suficiente para <1000 filas, y pgvector no soporta índices para >2000 dims).
- El embedding de la query cruda se genera UNA vez y se reutiliza para lookup Y para store (no recalcular).
- El threshold se evalúa en TypeScript (no en SQL) para poder loguear similitudes de misses cercanos y ajustar el umbral en el futuro.
- El caché es multi-tenant (compartido entre negocios) porque las respuestas son sobre funcionalidad de la app.
- TTL de 3 días es red de seguridad para fuentes secundarias no rastreadas en `source_doc`.

## Task Dependency Graph

```
Task 1 (SQL base: tabla + RPC + cron)
   │
   ├─→ Task 2 (módulo caché en rag-chat, depende de tabla y RPC)
   │       └─→ Task 3 (checkpoint intermedio)
   │
   ├─→ Task 4 (invalidación en rag-index y rag-clear, depende de tabla)
   │
   └─→ Task 5 (deploy, depende de 2 y 4)
           └─→ Task 6 (checkpoint final)
```

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1.1", "1.2", "1.3"],
      "description": "Crear infraestructura SQL: tabla, función RPC y tarea pg_cron"
    },
    {
      "wave": 2,
      "tasks": ["2.1", "2.2", "2.3", "2.4", "4.1", "4.2"],
      "description": "Implementar módulo de caché en rag-chat e invalidación en rag-index/rag-clear (paralelo)"
    },
    {
      "wave": 3,
      "tasks": ["5.1", "5.2", "5.3"],
      "description": "Deploy de las 3 edge functions modificadas"
    }
  ]
}
```
