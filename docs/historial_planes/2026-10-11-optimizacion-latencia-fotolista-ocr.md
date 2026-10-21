# Plan de Implementación: Optimización de Latencia en Escaneo IA (Fotoventa)

**Fecha:** 2026-10-11  
**Módulos afectados:**  
- `supabase/functions/ocr-scan/index.ts` (Backend Edge Function)  
- `hooks/usePhotoOrder.ts` (Hook de procesamiento y normalización)  
- `screens/PhotoOrderScreen.tsx` (Pantalla de captura y UI)  
**Objetivo:** Reducir el tiempo de respuesta del escaneo de la lista de compras con IA de **~6.5 a 7.0 segundos** actuales a un rango de **~2.5 a 3.5 segundos** (reducción del ~55% de latencia), manteniendo la precisión de extracción y emparejamiento con el catálogo.

---

## 1. Contexto y Diagnóstico con Datos Reales

Tras auditar el código y los registros de ejecución en tiempo real de Supabase (`function_edge_logs` / `ocr-scan`), se constató el desglose real del tiempo de escaneo:

| Etapa | Duración actual | Causa identificada |
| :--- | :--- | :--- |
| **1. Dispositivo (Frontend)** | ~0.4s | Compresión Canvas a JPEG (1024px) y generación de base64. Desempeño óptimo. |
| **2. Petición Preflight (CORS)** | ~0.9s | Petición `OPTIONS` obligatoria del navegador previa al `POST` por falta de cabecera de caché (`Access-Control-Max-Age`). |
| **3. Procesamiento en Gemini (Edge Function)** | **~5.2s** | **Cuello de botella principal:**<br>1. *Thinking Tokens:* Configurado en `thinking_level: "low"`, generando entre 100 y 1,458 tokens de razonamiento interno antes de emitir texto.<br>2. *Tokens de salida excesivos (~1,130 tokens):* Gemini redacta frases de justificación (`reasoning`), textos repetidos y UUIDs largos por cada ítem. Las IAs generan palabra por palabra; 1,130 tokens tardan ~3 a 4 segundos sólo en emitirse. |
| **Total medido en usuario** | **~6.5s a 7.0s** | |

---

## 2. Mapa de Cambios

### Archivos Afectados:
1. [`supabase/functions/ocr-scan/index.ts`](file:///c:/Users/HP/OneDrive/Escritorio/Bistro/supabase/functions/ocr-scan/index.ts)  
   - Configuración de cabeceras CORS con caché `Access-Control-Max-Age`.
   - Ajuste de `thinking_level` a `"minimal"` para Gemini 3.1 Flash-Lite.
   - Eliminación del campo `reasoning` y reducción de payload en el JSON de salida.
2. [`hooks/usePhotoOrder.ts`](file:///c:/Users/HP/OneDrive/Escritorio/Bistro/hooks/usePhotoOrder.ts)  
   - Asegurar compatibilidad regresiva con o sin el campo `reasoning`.
3. [`docs/guias_usuario/como_hacer_una_venta.md`](file:///c:/Users/HP/OneDrive/Escritorio/Bistro/docs/guias_usuario/como_hacer_una_venta.md)  
   - Documentación actualizada de los tiempos de respuesta optimizados de la función.

---

## 3. Fases de Implementación

### Fase 1: Optimización de Cabeceras CORS en Backend `[COMPLETADA - Desplegada v64]`
- **Archivo:** `supabase/functions/ocr-scan/index.ts`
- **Acción:**
  - Agregar `"Access-Control-Max-Age": "86400"` a `corsHeaders`.
- **Efecto:** El navegador guarda en caché la autorización de red durante 24 horas. Evita la petición `OPTIONS` intermedia en escaneos subsiguientes, ahorrando ~0.4 a 0.8s en la sesión.

### Fase 2: Reducción de Tokens de Pensamiento (*Thinking Mode*) `[COMPLETADA - Desplegada v62]`
- **Archivo:** `supabase/functions/ocr-scan/index.ts`
- **Acción:**
  - Cambiar en `generationConfig`:
    ```json
    "thinkingConfig": {
      "thinking_level": "minimal"
    }
    ```
- **Efecto:** Gemini 3.1 Flash-Lite pasa de generar hasta 1,400 tokens de deliberación interna a casi cero tokens de pensamiento, empezando a transmitir el JSON estructurado de forma casi inmediata. Ahorro estimado: **~0.8 a 1.2 segundos**.

### Fase 3: Adelgazamiento del Esquema de Salida JSON (*Output Tokens*) `[COMPLETADA - Desplegada v63]`
- **Archivo:** `supabase/functions/ocr-scan/index.ts`
- **Acción:**
  - Eliminar la instrucción de generar explicaciones `"reasoning"` por cada producto. (En la UI del POS el usuario nunca ve este texto; solo se usaba para un log local de consola).
  - Dejar el esquema conciso:
    ```json
    {"items": [{"name": "nombre literal", "quantity": 1, "product_id": "id_o_null", "raw_text": "texto literal", "candidate_ids": []}]}
    ```
- **Efecto:** Los tokens de salida de Gemini se reducen de ~1,130 tokens a ~200-300 tokens por respuesta. Como la velocidad de generación es de ~100-150 tok/s, esto ahorra directamente **~1.5 a 2.0 segundos**.

### Fase 4: Blindaje y Compatibilidad en el Hook del Frontend
- **Archivo:** `hooks/usePhotoOrder.ts`
- **Acción:**
  - Asegurar que `reasoning: item.reasoning || ''` no rompa si el backend no lo envía.
  - Verificar que el algoritmo de coincidencia de catálogo (`matchProducts`) siga operando con la misma exactitud, resolviendo apodos, desambiguaciones y unidades divisibles.

---

## 4. Matriz de Impacto Estimada

| Métrica | Antes | Después (Proyectado) | Mejora |
| :--- | :--- | :--- | :--- |
| **Tokens de Pensamiento (Thinking)** | 100 – 1,458 tokens | **~0 – 50 tokens** | Reducción del ~95% |
| **Tokens de Salida (Output)** | ~1,130 tokens | **~220 – 300 tokens** | Reducción del ~75% |
| **Tiempo de Inferencia Gemini** | ~5.2 segundos | **~1.8 a 2.3 segundos** | **-3.0 segundos** |
| **Petición Preflight OPTIONS** | ~0.9s en cada escaneo | **0s (en escaneos repetidos)** | **-0.5s a 0.8s** |
| **Tiempo Total Percibido por el Usuario** | **6.5 – 7.0 segundos** | **2.5 – 3.5 segundos** | **~55% más rápido** |
| **Costo por Escaneo (USD)** | ~$0.0033 USD | **~$0.0019 USD** | **-42% en costo por foto** |

---

## 5. Criterios de Aceptación y Pruebas
1. **Prueba de Extracción:** Subir una foto de prueba con notas manuscritas (ej. *"1 Chico", "2 Pokes"*).
2. **Prueba de Rendimiento:** Cronometrar con `performance.now()` en la consola del navegador que el ciclo completo no supere los 3.5 segundos en red estable.
3. **Verificación de Emparejamiento:** Confirmar que productos exactos y ambiguos se identifiquen y preseleccionen en `PhotoOrderScreen.tsx` con la misma exactitud que antes.
4. **Inspección de Logs:** Verificar en los logs de Supabase que los tokens de salida bajaron a <350 y los de pensamiento a <50.
