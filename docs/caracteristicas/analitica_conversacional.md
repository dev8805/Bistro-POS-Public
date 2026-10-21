# Analítica Conversacional — AI Chat

> **Módulo:** Sin pantalla asignada actualmente
> **Backend:** Supabase Edge Function `ai-chat`
> **Estado:** ⚠️ Desplegado pero sin frontend conectado — listo para integrar
> **Relacionado:** [dashboard.md](dashboard.md), [asistente_ia_rag.md](asistente_ia_rag.md)

---

## ¿Qué hace este módulo?

`ai-chat` es un asistente de **analítica de negocio en lenguaje natural**. El usuario hace una pregunta en español sobre sus datos (ventas, gastos, inventario, clientes) y el sistema:

1. Convierte la pregunta en SQL usando Gemini
2. Ejecuta esa consulta de solo lectura contra la base de datos del negocio
3. Devuelve la respuesta formateada en lenguaje natural

Es distinto al RAG (`rag-chat`): el RAG responde preguntas sobre *cómo usar la app* buscando en documentos. Este módulo responde preguntas sobre *los datos reales del negocio* consultando la BD.

**Ejemplos de preguntas:**
- "¿Cuánto vendí hoy?"
- "¿Cuál es mi producto más rentable?"
- "¿Quién me debe más?"
- "¿Cuál fue el método de pago más usado esta semana?"
- "¿Qué productos están por debajo del stock mínimo?"

---

## Arquitectura

```text
Browser (React/Bistro)
  │
  └── (sin componente frontend todavía)
      ↓ invocación directa pendiente
      supabase.functions.invoke('ai-chat', { body: { question, businessId, userId, timezone, conversationHistory } })

Supabase Edge Function: ai-chat
  ├── Recibe la pregunta en español
  ├── Llama a Gemini → genera SQL SELECT seguro
  ├── Valida el SQL (solo SELECT, sin keywords destructivas)
  ├── Ejecuta via RPC `execute_readonly_query`
  ├── Llama a Gemini de nuevo → formatea resultado en lenguaje natural
  └── Guarda en tabla `ai_chat_history` (si hay userId)
```

---

## Flujo interno

### 1. Generación de SQL
- Prompt incluye: esquema completo de la BD + diccionario de conceptos de negocio + historial de conversación (últimos 6 mensajes)
- Modelo: `gemini-2.5-flash` (principal y fallback)
- Temperatura: `0.0` para máxima precisión
- Si el SQL generado falla al ejecutarse, reintenta con el modelo fallback

### 2. Validación de seguridad (`isSafeSQL`)
- Solo acepta consultas que empiecen con `SELECT`
- Bloquea: `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `TRUNCATE`, `GRANT`, `REVOKE`, `EXECUTE`

### 3. Ejecución
- Usa `supabaseAdmin.rpc('execute_readonly_query', { sql_query })` — función PostgreSQL de solo lectura
- Siempre filtra por `business_id` del negocio activo

### 4. Formateo de respuesta
- Temperatura: `0.1`
- Montos en formato colombiano: `$1.234.567`
- Sin emojis, sin jerga técnica, sin SQL visible al usuario

---

## Parámetros de entrada

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `question` | string | ✅ | Pregunta en español |
| `businessId` | string | ✅ | UUID del negocio |
| `userId` | string | — | UUID del usuario (para guardar historial) |
| `timezone` | string | — | TZ del negocio (default: `America/Bogota`) |
| `conversationHistory` | array | — | Mensajes previos `[{ role, content, sql? }]` |

---

## Tablas que conoce

El prompt hardcodeado incluye el esquema de:
`orders`, `order_items`, `products`, `categories`, `clients`, `client_transactions`, `expenses`, `fixed_expenses`, `cash_shifts`, `cash_movements`, `inventory_lots`, `lot_allocations`, `tables`, `profiles`, `rooms`

---

## Límites

- **100 consultas diarias** por negocio (`DAILY_LIMIT = 100`)
- Se trackea en la función `get_ai_chat_count_today(p_business_id)`
- Se resetea a medianoche

---

## Constantes clave

```typescript
// supabase/functions/ai-chat/index.ts
const GEMINI_MODEL    = "gemini-2.5-flash";
const GEMINI_FALLBACK = "gemini-2.5-flash";  // mismo modelo, doble intento
const DAILY_LIMIT     = 100;
```

---

## Estado de integración

| Capa | Estado |
|------|--------|
| Edge Function `ai-chat` | ✅ Desplegada en Supabase |
| Tabla `ai_chat_history` | ✅ Existe en la BD |
| RPC `execute_readonly_query` | ✅ Existe en la BD |
| RPC `get_ai_chat_count_today` | ✅ Existe en la BD |
| Componente frontend | ❌ No implementado |
| Navegación / pantalla | ❌ No existe |

La función está 100% lista del lado del backend. Para activarla solo falta crear el componente o pantalla que la invoque.

---

## Historial de cambios

| Fecha | Cambio |
|-------|--------|
| 2026-06-01 | Documentación inicial. Función existía sin doc. Modelo confirmado: `gemini-2.5-flash`. Sin frontend conectado. |
