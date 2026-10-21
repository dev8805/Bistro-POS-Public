# Documento de Diseño: Semantic Cache para RAG Chat

## Overview

Este documento describe la arquitectura y diseño de una capa de caché semántico para la edge function `rag-chat`. El caché almacena pares pregunta-respuesta con embeddings vectoriales en PostgreSQL (pgvector) y los sirve cuando una nueva query es semánticamente equivalente a una previamente respondida.

**Objetivo:** Reducir costos de API (Gemini + Pinecone) entre 20-50% sirviendo respuestas cacheadas vía SSE con latencia mínima.

**Decisiones clave:**
- Caché compartido multi-tenant (las respuestas son sobre funcionalidad de la app, no datos por negocio).
- Embeddings de 3072 dimensiones (`gemini-embedding-2`) sin índice vectorial (sequential scan suficiente para <1000 filas).
- TTL de 3 días con limpieza diaria vía `pg_cron`.
- Invalidación selectiva por `source_doc` al reindexar + truncate completo en `rag-clear`.
- El lookup de caché usa el embedding de la **query cruda** del usuario (NO el embedding HyDE), porque HyDE genera variaciones cada vez que se ejecuta y arruinaría la consistencia del match.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         rag-chat Edge Function                       │
│                                                                     │
│  ┌──────────┐    ┌───────────────────┐    ┌────────────────────┐   │
│  │ 1. Embed │───►│ 2. match_rag_cache│───►│ HIT? → SSE cached  │   │
│  │ raw query│    │    (RPC pgvector)  │    │       response      │   │
│  └──────────┘    └───────────────────┘    └────────────────────┘   │
│       │                    │ MISS                                    │
│       │                    ▼                                        │
│       │          ┌────────────────────────────────────────┐        │
│       │          │ 3. RAG Pipeline completo                │        │
│       │          │    HyDE → embed → Pinecone → Gemini SSE│        │
│       │          └──────────────────┬─────────────────────┘        │
│       │                             │ éxito + is_about_bistro       │
│       │                             ▼                               │
│       │          ┌────────────────────────────────────────┐        │
│       │          │ 4. INSERT en rag_cache                  │        │
│       │          │    (query, embedding, answer, source_doc│        │
│       │          │     suggestions, is_about_bistro)       │        │
│       │          └────────────────────────────────────────┘        │
│       │                                                             │
└───────┼─────────────────────────────────────────────────────────────┘
        │
        │  Embedding generado en paso 1 se REUTILIZA:
        │  - Para el lookup de caché (paso 2)
        │  - NO se usa para Pinecone (Pinecone usa el embedding HyDE)
        │
┌───────┼─────────────────────────────────────────────────────────────┐
│       │              Supabase PostgreSQL + pgvector                   │
│       ▼                                                             │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │ rag_cache                                                │       │
│  │ ─────────                                                │       │
│  │ id (uuid PK)                                             │       │
│  │ query_text (text)                                        │       │
│  │ query_embedding (vector(3072))                           │       │
│  │ answer (text)                                            │       │
│  │ suggestions (jsonb)                                      │       │
│  │ is_about_bistro (boolean)                                │       │
│  │ source_doc (text)              ← topSources[0] / discovery[0]   │
│  │ created_at (timestamptz)       ← para TTL 3 días         │       │
│  └─────────────────────────────────────────────────────────┘       │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │ match_rag_cache(query_embedding, match_threshold)        │       │
│  │ → retorna fila con mayor similitud coseno (1 - <=>)      │       │
│  │ → filtra created_at > now() - interval '3 days'          │       │
│  │ → retorna NULL si similitud < threshold                  │       │
│  └─────────────────────────────────────────────────────────┘       │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────┐       │
│  │ pg_cron: daily 3:00 UTC                                  │       │
│  │ DELETE FROM rag_cache WHERE created_at < now()-'3d'       │       │
│  └─────────────────────────────────────────────────────────┘       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                   Invalidación del caché                              │
│                                                                     │
│  rag-clear → TRUNCATE rag_cache (reset total)                       │
│                                                                     │
│  rag-index(docSlug) → DELETE FROM rag_cache                         │
│                        WHERE source_doc = docSlug                    │
│                        (invalidación selectiva)                      │
│                                                                     │
│  pg_cron  → DELETE WHERE created_at < now() - '3 days'              │
│             (red de seguridad para fuentes secundarias)              │
└─────────────────────────────────────────────────────────────────────┘
```

### Flujo de decisión del caché

```
Request llega a rag-chat
  │
  ├── 1. Generar embedding de query cruda (gemini-embedding-2, 3072d)
  │
  ├── 2. RPC: match_rag_cache(embedding, 0.95)
  │       └── pgvector: 1 - (query_embedding <=> stored_embedding)
  │           + filtro: created_at > now() - interval '3 days'
  │
  ├── Si similitud ≥ 0.95 → CACHE HIT
  │     ├── Log: [CACHE HIT] sim=0.97 "¿cómo hago una venta..."
  │     ├── SSE: tokenizar answer → data:{"t":"token"}
  │     └── SSE final: data:{"done":true,"answer":"...","bistro":true,
  │                          "suggestions":[...],"cached":true}
  │
  └── Si similitud < 0.95 o sin resultado → CACHE MISS
        ├── Log: [CACHE MISS] "¿cómo hago una venta..."
        ├── Ejecutar pipeline: HyDE → Pinecone → Gemini SSE
        ├── Si éxito + is_about_bistro == true:
        │     └── INSERT rag_cache (query, embedding, answer, ...)
        │         source_doc = topSources[0] || discoveryMatches[0].metadata.source
        └── Si fallo / 0 matches / !is_about_bistro:
              └── No cachear
```

## Components and Interfaces

### 1. Módulo de caché en `rag-chat` (Deno Edge Function)

```typescript
// --- Interfaz del módulo de caché ---

interface CacheEntry {
  id: string;
  query_text: string;
  answer: string;
  suggestions: string[];
  is_about_bistro: boolean;
  source_doc: string | null;
  similarity: number;  // solo en lectura (calculado por match_rag_cache)
}

interface CacheModule {
  /**
   * Busca en el caché una respuesta semánticamente similar.
   * Genera el embedding de la query cruda y llama a match_rag_cache.
   * @returns CacheEntry si hit, null si miss
   */
  lookup(rawQuery: string, threshold?: number): Promise<CacheEntry | null>;

  /**
   * Almacena una nueva entrada en el caché tras un cache miss exitoso.
   * Solo se invoca si is_about_bistro === true y hay matches en Pinecone.
   */
  store(params: {
    queryText: string;
    queryEmbedding: number[];  // 3072 dims, ya generado en lookup()
    answer: string;
    suggestions: string[];
    isAboutBistro: boolean;
    sourceDoc: string;
  }): Promise<void>;
}
```

**Decisión de diseño — embedding reutilizado:** El embedding de la query cruda se genera UNA sola vez en `lookup()`. Si hay cache miss, ese mismo embedding se pasa a `store()` para insertarlo sin recalcular. Este embedding NO se usa para Pinecone (que necesita el embedding HyDE).

### 2. Función RPC: `match_rag_cache`

```sql
CREATE OR REPLACE FUNCTION match_rag_cache(
  query_embedding vector(3072),
  match_threshold float DEFAULT 0.95
)
RETURNS TABLE (
  id uuid,
  query_text text,
  answer text,
  suggestions jsonb,
  is_about_bistro boolean,
  source_doc text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rc.id,
    rc.query_text,
    rc.answer,
    rc.suggestions,
    rc.is_about_bistro,
    rc.source_doc,
    (1 - (rc.query_embedding <=> query_embedding)) AS similarity
  FROM rag_cache rc
  WHERE rc.created_at > now() - interval '3 days'
  ORDER BY rc.query_embedding <=> query_embedding
  LIMIT 1;
END;
$$ ;
-- La función retorna 0 filas si la similitud del mejor match < threshold.
-- El filtro de threshold se aplica en la edge function (no en SQL) para
-- poder loguear la similitud obtenida incluso en misses cercanos.
```

**Decisión de diseño — threshold en la edge function:** La función SQL retorna siempre el mejor match (si existe alguno no expirado). La edge function compara `result.similarity >= threshold` y decide si es HIT o MISS. Esto permite loguear la similitud de misses "cercanos" para ajustar el umbral en el futuro.

### 3. Extracción de `source_doc`

```typescript
/**
 * Determina el documento fuente principal de la respuesta.
 * Se ejecuta después del paso de expansión en el pipeline RAG.
 *
 * Prioridad:
 * 1. topSources[0] — si hubo expansión (el doc principal expandido)
 * 2. discoveryMatches[0].metadata.source — si no hubo expansión (fallback)
 */
const extractSourceDoc = (
  topSources: string[] | undefined,
  discoveryMatches: PineconeMatch[]
): string => {
  if (topSources && topSources.length > 0) {
    return topSources[0]; // ej: "como_hacer_una_venta.md"
  }
  if (discoveryMatches.length > 0 && discoveryMatches[0].metadata?.source) {
    return discoveryMatches[0].metadata.source as string;
  }
  return 'unknown';
};
```

El valor almacenado coincide exactamente con el campo `source` en los metadatos de Pinecone (ej: `"como_hacer_una_venta.md"`, `"manual.pdf"`). Esto permite que `rag-index` haga la invalidación selectiva usando el mismo identificador.

### 4. Integración en `rag-index` (invalidación selectiva)

```typescript
// Al final de la indexación exitosa de un documento:
const { error } = await supabaseAdmin
  .from('rag_cache')
  .delete()
  .eq('source_doc', documentSource); // ej: "como_hacer_una_venta.md"

if (error) {
  console.warn('[CACHE INVALIDATION] Error:', error.message);
  // No falla la indexación — la invalidación es best-effort
}
```

### 5. Integración en `rag-clear` (truncate completo)

```typescript
// Junto con la limpieza de Pinecone y rag_documents:
const { error } = await supabaseAdmin
  .from('rag_cache')
  .delete()
  .neq('id', '00000000-0000-0000-0000-000000000000'); // DELETE all rows

// Alternativa si se tiene acceso directo a SQL:
// TRUNCATE rag_cache;
```

### 6. SSE de respuesta cacheada

```typescript
// Cuando hay cache hit, simular el mismo protocolo SSE:
const streamCachedResponse = (
  entry: CacheEntry,
  controller: ReadableStreamDefaultController<Uint8Array>
) => {
  const encoder = new TextEncoder();
  const words = entry.answer.split(' ');

  // Emitir tokens (agrupados de ~3 palabras para eficiencia)
  for (let i = 0; i < words.length; i += 3) {
    const chunk = words.slice(i, i + 3).join(' ') + ' ';
    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: chunk })}\n\n`));
  }

  // Evento final con campo cached:true
  const finalEvent = {
    done: true,
    answer: entry.answer,
    bistro: entry.is_about_bistro,
    suggestions: entry.suggestions,
    cached: true
  };
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(finalEvent)}\n\n`));
  controller.close();
};
```

**Decisión de diseño — tokenización instantánea:** No se introduce delay artificial entre tokens cacheados. La respuesta se envía lo más rápido posible. El frontend ya maneja la llegada rápida de tokens porque usa `getReader()` en loop.

## Data Models

### Tabla `rag_cache`

| Columna | Tipo | Constraints | Descripción |
|---------|------|-------------|-------------|
| `id` | `uuid` | PK, default `gen_random_uuid()` | Identificador único |
| `query_text` | `text` | NOT NULL | Texto original de la query del usuario |
| `query_embedding` | `vector(3072)` | NOT NULL | Embedding de la query cruda (gemini-embedding-2) |
| `answer` | `text` | NOT NULL | Respuesta generada por Gemini (ya limpia de marcadores) |
| `suggestions` | `jsonb` | NOT NULL, default `'[]'` | Array de sugerencias contextuales |
| `is_about_bistro` | `boolean` | NOT NULL, default `true` | Flag de relevancia temática |
| `source_doc` | `text` | NULL | Documento fuente principal (`topSources[0]` o discovery fallback) |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | Timestamp de creación (para TTL) |

**Notas:**
- Sin índice vectorial (HNSW/IVFFlat). pgvector no soporta índices para vectores >2000 dims. El sequential scan es aceptable para <1000 filas.
- Sin RLS. La tabla se accede exclusivamente desde edge functions con service role key.
- `source_doc` es nullable para el caso edge de que no haya expansión NI discovery matches (muy raro).

### SQL de creación

```sql
-- Migración: crear tabla rag_cache
CREATE TABLE IF NOT EXISTS rag_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text text NOT NULL,
  query_embedding vector(3072) NOT NULL,
  answer text NOT NULL,
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_about_bistro boolean NOT NULL DEFAULT true,
  source_doc text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índice simple en source_doc para invalidación selectiva eficiente
CREATE INDEX IF NOT EXISTS idx_rag_cache_source_doc
  ON rag_cache (source_doc);

-- Índice en created_at para la limpieza por TTL
CREATE INDEX IF NOT EXISTS idx_rag_cache_created_at
  ON rag_cache (created_at);

-- Función RPC
CREATE OR REPLACE FUNCTION match_rag_cache(
  query_embedding vector(3072),
  match_threshold float DEFAULT 0.95
)
RETURNS TABLE (
  id uuid,
  query_text text,
  answer text,
  suggestions jsonb,
  is_about_bistro boolean,
  source_doc text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    rc.id,
    rc.query_text,
    rc.answer,
    rc.suggestions,
    rc.is_about_bistro,
    rc.source_doc,
    (1 - (rc.query_embedding <=> match_rag_cache.query_embedding))::float AS similarity
  FROM rag_cache rc
  WHERE rc.created_at > now() - interval '3 days'
  ORDER BY rc.query_embedding <=> match_rag_cache.query_embedding
  LIMIT 1;
END;
$$;

-- Tarea pg_cron: limpieza diaria a las 3:00 UTC
SELECT cron.schedule(
  'cleanup-rag-cache',
  '0 3 * * *',
  $$DELETE FROM rag_cache WHERE created_at < now() - interval '3 days'$$
);
```

### Diagrama de relaciones

```
rag_cache                          Pinecone (bistro-knowledge)
─────────                          ─────────────────────────────
source_doc  ─── misma clave ───►  metadata.source
                                   (ej: "como_hacer_una_venta.md")

rag_documents                      Supabase Storage
─────────────                      ─────────────────
name ──────────────────────────►  bucket: rag-documents
```

No hay foreign key entre `rag_cache.source_doc` y ninguna otra tabla. El valor es un string libre que coincide por convención con `metadata.source` en Pinecone.

## Correctness Properties

*Una propiedad es una característica o comportamiento que debe cumplirse en todas las ejecuciones válidas del sistema — esencialmente, una declaración formal sobre lo que el sistema debe hacer. Las propiedades sirven como puente entre especificaciones legibles por humanos y garantías de correctitud verificables por máquina.*

### Property 1: Clasificación correcta de Cache Hit/Miss

*Para cualquier* embedding de query y un conjunto de entradas en `rag_cache` no expiradas, si la similitud coseno máxima entre la query y alguna entrada es ≥ `match_threshold`, el sistema clasifica como Cache_Hit; si es < `match_threshold` o no hay entradas, clasifica como Cache_Miss. Nunca un hit con similitud < threshold ni un miss con similitud ≥ threshold.

**Validates: Requirements 1.2, 1.3**

### Property 2: Round-trip de almacenamiento y recuperación

*Para cualquier* respuesta almacenada en el caché (con query_text, answer, suggestions, is_about_bistro, source_doc), al buscar con el mismo embedding de la query original y threshold ≤ a la similitud consigo mismo (1.0), el sistema retorna una entrada con campos idénticos a los almacenados originalmente.

**Validates: Requirements 2.2, 3.1**

### Property 3: Resultados no cacheables no contaminan el caché

*Para cualquier* resultado del pipeline RAG donde `is_about_bistro === false` O donde Pinecone retornó 0 matches O donde el pipeline falló, la cantidad de filas en `rag_cache` no cambia después de procesar esa query.

**Validates: Requirements 3.2, 3.3**

### Property 4: Extracción correcta de source_doc

*Para cualquier* resultado del pipeline RAG con expansión exitosa, el campo `source_doc` almacenado en el caché es exactamente igual a `topSources[0]`. *Para cualquier* resultado sin expansión (fallback a discovery), `source_doc` es igual a `discoveryMatches[0].metadata.source`.

**Validates: Requirements 3.5**

### Property 5: Invalidación selectiva preserva entradas no relacionadas

*Para cualquier* operación de reindexación de un documento con identificador `D`, solo las entradas de `rag_cache` donde `source_doc === D` son eliminadas. Todas las entradas donde `source_doc !== D` permanecen intactas (misma cantidad, mismos IDs).

**Validates: Requirements 5.2**

### Property 6: Filtro TTL excluye entradas expiradas

*Para cualquier* entrada en `rag_cache` cuyo `created_at` sea anterior a `now() - 3 días`, la función `match_rag_cache` nunca la retorna como resultado, independientemente de su similitud coseno con la query.

**Validates: Requirements 6.4**

## Error Handling

| Escenario | Comportamiento | Impacto |
|-----------|---------------|---------|
| Fallo al generar embedding de query | Skip caché, ejecutar pipeline RAG normal | Sin caché pero sin degradación funcional |
| Fallo en `match_rag_cache` (error SQL) | Log error, tratar como MISS, continuar con pipeline | Transparente al usuario |
| Fallo al insertar en `rag_cache` (store) | Log warning, no reintentar | La respuesta ya fue enviada al usuario vía SSE |
| Embedding con dimensiones incorrectas | Validar que sea 3072 antes de llamar a match | Error temprano con mensaje descriptivo |
| `pg_cron` falla en limpieza | Entradas expiradas se sirven hasta la próxima ejecución exitosa | La función `match_rag_cache` ya filtra por `created_at` como doble barrera |
| Fallo en invalidación selectiva (rag-index) | Log warning, no fallar la indexación | El TTL de 3 días eventualmente limpiará la entrada |
| Fallo en truncate (rag-clear) | Log error, continuar con limpieza de Pinecone | El caché queda desincronizado temporalmente |

**Principio general:** El caché es una optimización — nunca debe bloquear ni degradar el flujo principal. Todo error en el módulo de caché se loguea y se trata como "cache miss", permitiendo al pipeline RAG ejecutarse normalmente.

## Testing Strategy

### Tests unitarios (example-based)

| Test | Qué verifica |
|------|-------------|
| `lookup()` retorna null cuando no hay entradas | Comportamiento base del módulo |
| `lookup()` retorna entry cuando similarity ≥ threshold | Happy path de cache hit |
| `lookup()` retorna null cuando similarity < threshold | Cache miss correcto |
| `store()` no inserta cuando `is_about_bistro === false` | Guard de calidad del caché |
| `store()` no inserta cuando `pineconeMatches === 0` | Guard contra respuestas vacías |
| `extractSourceDoc()` con topSources present | Prioridad 1 |
| `extractSourceDoc()` sin topSources, con discovery | Fallback correcto |
| `extractSourceDoc()` sin ambos | Retorna 'unknown' |
| `streamCachedResponse()` emite formato SSE correcto | Validación del protocolo |
| Evento final incluye `cached: true` | Distinguibilidad de respuestas cacheadas |
| Invalidación selectiva borra solo entradas del doc | Requisito 5.2 |
| Truncate en rag-clear borra todo | Requisito 5.1 |
| Log `[CACHE HIT]` contiene similitud y extracto query | Observabilidad (7.1) |
| Log `[CACHE MISS]` contiene extracto query | Observabilidad (7.2) |

### Tests de propiedades (property-based)

Librería: **fast-check** (TypeScript/Deno compatible)

| Propiedad | Generadores | Iteraciones |
|-----------|-------------|-------------|
| Property 1: Clasificación hit/miss | Embeddings aleatorios (vectores normalizados 3072d), threshold variable | 100 |
| Property 2: Round-trip store/retrieve | Queries aleatorias, answers aleatorios, suggestions arrays | 100 |
| Property 3: No contaminación | Resultados con is_about_bistro=false o pineconeMatches=0 | 100 |
| Property 4: source_doc extraction | Arrays topSources y discoveryMatches generados | 100 |
| Property 5: Invalidación selectiva | Conjuntos de entries con source_doc variados, un docSlug target | 100 |
| Property 6: Filtro TTL | Entries con created_at variando entre 0 y 7 días atrás | 100 |

**Tag format:** `Feature: semantic-cache-rag, Property N: <descripción>`

### Tests de integración

| Test | Entorno |
|------|---------|
| `match_rag_cache` retorna resultado correcto con datos reales | Supabase local (pgvector) |
| pg_cron schedule se registra correctamente | Supabase local |
| rag-index invalida entradas del doc reindexado | Edge function + DB |
| rag-clear trunca rag_cache | Edge function + DB |
| Flujo completo: miss → store → hit | Edge function + Gemini (embedding real) |

### Notas sobre el entorno de test

- Los property tests del módulo de caché se pueden ejecutar con mocks de Supabase client y embeddings sintéticos (vectores aleatorios normalizados).
- Los tests de integración requieren una instancia de Supabase con pgvector habilitado.
- La función `match_rag_cache` se puede testear directamente con SQL contra la base de datos de test.
