# Plan de Implementación: Migración a Gemini 3.8 Flash con Optimización de Tokens de Costo

**Fecha:** 2026-10-11  
**Módulos afectados:**  
- `supabase/functions/ocr-scan/index.ts` (Backend Edge Function)  
**Objetivo:** Migrar el escaneo de listas de compras al modelo insignia de nueva generación **`gemini-3.8-flash`**, alcanzando inteligencia visual Pro para caligrafía compleja y desambiguación, manteniendo el costo por escaneo en **~$0.0040 USD** (idéntico o menor a Flash-Lite) y una latencia estimada de **~2.5 a 3.5 segundos**.

---

## 1. Contexto y Diagnóstico

### Situación Actual
1. **Gemini 2.5 Flash:** Se encuentra en fase de retiro oficial por parte de Google (fecha de baja: **20 de octubre de 2026**), por lo que no es viable como solución a largo plazo.
2. **Gemini 3.1 Flash-Lite:**
   - En `minimal` (0 tokens de pensamiento): Rápido, pero su capacidad visual base es limitada ante caligrafía apresurada o ambigüedades.
   - En `low`: Para compensar su tamaño reducido, generó **3,092 tokens de pensamiento**, elevando el tiempo a **10.2 segundos** y el costo a **$0.00867 USD**.
3. **Gemini 3.8 Flash:**
   - Es el modelo oficial de producción de la serie 3 de Google (sucesor de 3.5 y 3.7 Flash).
   - Posee comprensión visual y de lenguaje a nivel Pro en una sola pasada.
   - Tarifa oficial: $0.75 / 1M entrada, $3.75 / 1M salida.

---

## 2. Estrategia de Neutralización de Costos

Para que `gemini-3.8-flash` cueste lo mismo o menos que `gemini-3.1-flash-lite`, implementamos dos técnicas de compresión de tokens en el Edge Function:

```
[Frontend envía Catálogo + Foto]
              │
              ▼
   [ocr-scan (Edge Function)]
   1. Mapea productos a índices numéricos: [#0], [#1], [#2]...
   2. Envía prompt compacto a Gemini 3.8 Flash (~3,200 tokens de entrada)
              │
              ▼
    [Gemini 3.8 Flash]
    Responde con índices breves: {"product_index": 0, "candidate_indexes": [1, 2]}
    (~450 tokens de salida en vez de 1,700 tokens de UUIDs)
              │
              ▼
   [ocr-scan traduce índices a UUIDs reales]
   Restituye los UUIDs originales antes de responder.
              │
              ▼
[Frontend recibe el mismo formato JSON sin cambios de código]
```

### Proyección Matemática del Costo:

| Componente | Antes (Sin comprimir) | Con Estrategia de Índices | Cálculo con Gemini 3.8 Flash |
| :--- | :--- | :--- | :--- |
| **Tokens de entrada** | ~5,940 tokens | **~3,200 tokens** | 3,200 tok × $0.75 / 1M = **$0.00240 USD** |
| **Tokens de salida** | ~1,700 tokens (UUIDs) | **~450 tokens** (Índices) | 450 tok × $3.75 / 1M = **$0.00169 USD** |
| **Tokens de pensamiento** | 3,092 tokens (en Lite) | **~0 a 100 tokens** | ~100 tok × $3.75 / 1M = **$0.00037 USD** |
| **COSTO TOTAL POR FOTO** | $0.00867 USD | **~$0.00446 USD** | **-49% del costo actual en `low`** |

---

## 3. Fases de Implementación

### Fase 1: Mapeo Bidireccional de Índices Numéricos en Backend
- **Archivo:** `supabase/functions/ocr-scan/index.ts`
- **Acción:**
  - Construir un mapa en memoria: `catalog.map((item, idx) => ({ ...item, idx }))`.
  - En el prompt de Gemini, presentar cada producto como:
    ```text
    - [#0] "CHICO" (Unidad: Unidad) | Apodos: [chico]
    - [#1] "Cerveza Poker" (Unidad: Lata) | Apodos: [poker]
    ```
  - En la respuesta solicitada a Gemini, pedir:
    ```json
    {"items": [{"name": "nombre literal", "quantity": 1, "product_index": 0, "candidate_indexes": []}]}
    ```
  - En el backend, tras recibir la respuesta, traducir automáticamente:
    ```typescript
    product_id = item.product_index !== null ? catalog[item.product_index]?.id : null;
    candidate_ids = (item.candidate_indexes || []).map(idx => catalog[idx]?.id).filter(Boolean);
    ```
- **Beneficio:** Se reemplazan miles de caracteres de UUIDs hexadecimales por dígitos simples de 1 token. El contrato hacia el cliente frontend se mantiene 100% idéntico.

### Fase 2: Condensación del Catálogo y Reglas de Entrada
- **Archivo:** `supabase/functions/ocr-scan/index.ts`
- **Acción:**
  - Compactar las reglas de texto del prompt para eliminar redundancias verbales conservando intactas las directivas de desambiguación, columnas y números decimales.
  - Reducción esperada de ~5,900 tokens de entrada a **~3,200 tokens**.

### Fase 3: Conmutación del Modelo a `gemini-3.8-flash`
- **Archivo:** `supabase/functions/ocr-scan/index.ts`
- **Acción:**
  - Actualizar el endpoint URL a:
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`
  - Configurar `thinking_level: "low"` en `thinkingConfig`.
  - Al ser un modelo superior, resolverá la interpretación fonética sin necesidad de generar miles de tokens de deliberación.

### Fase 4: Despliegue en Supabase y Validación de Métricas
- **Acción:**
  - Desplegar la nueva versión de la Edge Function en Supabase.
  - Realizar escaneo real con una comanda manuscrita.
  - Verificar en los logs de Supabase:
    1. Tiempo total inferior a 3.5 segundos.
    2. Costo registrado dentro de la meta de ~$0.0040 - $0.0045 USD.
    3. Precisión perfecta en los 22 renglones de la lista.

---

## 4. Matriz Comparativa de Modelos

| Métrica | 3.1 Flash-Lite (en `low`) | 3.8 Flash (con Índices Compactos) | Beneficio |
| :--- | :--- | :--- | :--- |
| **Tiempo de respuesta** | **10.2 segundos** | **~2.5 a 3.5 segundos** | **~7 segundos más rápido** |
| **Tokens de salida** | ~1,700 tokens | **~450 tokens** | -73% de carga útil |
| **Costo por escaneo (22 items)** | **$0.00867 USD** | **~$0.00446 USD** | **50% más económico** |
| **Capacidad visual / caligrafía** | Básica (requiere pensar mucho) | Pro (nativa de última generación) | Mucha mayor certeza |
| **Soporte futuro** | Modelo Lite complementario | **Modelo insignia activo Gemini 3** | 100% vigente |

---

## 5. Criterios de Aceptación
1. El frontend no sufre ninguna modificación de código (compatibilidad transparente).
2. Los productos del catálogo se emparejan con la misma o mayor exactitud.
3. El costo por escaneo registrado en los logs no supera los $0.0050 USD.
4. El tiempo de respuesta de la Edge Function es inferior a 4 segundos.
