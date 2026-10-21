---
name: diagnosing-bugs
description: Ciclo riguroso y científico de diagnóstico para resolver bugs difíciles, comportamientos rotos, excepciones y regresiones de rendimiento. Úsese cuando el usuario reporte que algo está roto, falla, lanza error, o diga "diagnostica", "depura esto", "debug", "hay un bug", "no funciona". Prohíbe adivinar o parchar código a ciegas antes de tener una reproducción aislada.
---

# Diagnóstico de Bugs — Bistro POS

Disciplina científica para resolver fallos complejos, excepciones y regresiones de rendimiento. **Está terminantemente prohibido saltarse fases sin justificación explícita.**

Al investigar el código de Bistro, revisa `CONTEXT.md` para entender el modelo de negocio y consulta los ADRs en `docs/adr/` en el área relacionada antes de asumir comportamientos.

---

## Regla de Protección: Ocultar Secretos (Redact)
Cualquier comando, salida de terminal o archivo capturado debe ocultar credenciales sensibles (claves de Supabase, tokens de Wompi, contraseñas, etc.): escribe `<REDACTED>` en su lugar.

---

## Fase 1: Construir el Ciclo de Retroalimentación (Feedback Loop)

> **ESTA ES LA HABILIDAD.** Todo lo demás es mecánico. Si tienes una señal rápida y determinista que dé **ROJO** (falla) ante este bug y **VERDE** (éxito) al solucionarlo, encontrarás la causa. Si no la tienes, mirar el código durante horas y adivinar no te salvará.

Dedica un esfuerzo desproporcionado aquí. **Sé tenaz y creativo.**

### Formas de construir el ciclo en Bistro (en este orden de preferencia):
1. **Test unitario o de integración con Vitest:** (`npx vitest run path/al/test.ts`). Es la vía más rápida (milisegundos) para lógica de caja, inventarios, cálculos o hooks.
2. **Script de navegador con Playwright:** Para flujos de interfaz gráfica (clics en pantalla de ventas, cobro, selección de productos o modales).
3. **Petición HTTP / Curl:** Para probar Edge Functions de Supabase (`scan-invoice`, `rag-chat`, etc.) contra el servidor local o remoto.
4. **Harness de prueba temporal:** Un pequeño script aislado en `scratch/` que invoque la función sospechosa con los argumentos problemáticos.
5. **Fixture de datos capturados:** Guardar el objeto/venta/factura JSON exacta que causó el error y pasarla directamente por el flujo en aislamiento.

### Criterio de culminación de la Fase 1:
La Fase 1 termina únicamente cuando puedes nombrar **un comando concreto** que ya ejecutaste y que:
- [ ] Da **ROJO** demostrando el síntoma exacto del usuario (no "corrió sin error", sino que atrapó el fallo específico).
- [ ] Es **determinista** (da el mismo resultado en cada ejecución).
- [ ] Es **rápido** (tarda segundos, no minutos).
- [ ] Es **ejecutable por el agente** de forma desatendida.

> ⚠️ **Freno obligatorio:** Si te descubres leyendo código para formular teorías antes de que exista este comando que dé rojo, **DETENTE**. Saltar directo a formular hipótesis sin reproducción es exactamente el fallo que esta skill prohíbe.

---

## Fase 2: Reproducir y Minimizar

Ejecuta el ciclo y confirma que dé rojo.

1. **Confirmar el síntoma:** Verifica que la falla sea exactamente lo que reportó el usuario y no un error secundario cercano.
2. **Minimizar el caso:** Una vez en rojo, reduce el escenario al **mínimo indispensable que siga fallando**.
   - Elimina props innecesarias, datos extra del mock, pasos previos o configuraciones accesorias, **uno por uno**.
   - Vuelve a ejecutar el comando tras cada recorte.
   - Cada elemento restante debe ser imprescindible: si quitas algo y el error desaparece, ese elemento era parte de la causa.

---

## Fase 3: Formular de 3 a 5 Hipótesis Falsables

Genera entre **3 y 5 hipótesis clasificadas por probabilidad** ANTES de tocar código o probar soluciones. Generar una sola hipótesis hace que el agente se ancle en su primera idea (que frecuentemente es incorrecta).

Cada hipótesis debe ser **falsable** y declarar su predicción:
> **Formato:** *"Si [X] es la causa, entonces cambiar [Y] hará que el error desaparezca / cambiar [Z] lo empeorará."*

Muestra la lista de hipótesis al usuario antes de proceder si está activo en el chat.

---

## Fase 4: Instrumentar con Etiquetas Únicas

Cada sonda o log debe probar una predicción específica de la Fase 3.
- **Modifica una sola variable a la vez.**
- Si agregas `console.log`, utiliza **obligatoriamente un prefijo único rastreable**:
  ```typescript
  console.log('[DEBUG-b7f2] Entrada a calculateSaleTotals:', { subtotal, tax });
  ```
  Esto garantiza que la limpieza posterior sea un simple `grep` sin dejar código basura.
- Nunca hagas "log de todo a ver qué pasa".
- **Para regresiones de rendimiento:** No uses logs; establece una medición de tiempo base (`performance.now()`), mide antes y después de aislar.

---

## Fase 5: Solución y Test de Regresión

1. Si no existía un test formal, convierte el reproductor minimizado de la Fase 2 en un test de Vitest.
2. Confirma que el test falle (ROJO).
3. **Aplica la corrección más simple y asertiva posible:**
   - Cumple las reglas de Bistro: no cambies nada que no esté estrictamente relacionado con el bug.
   - No crees nuevas complejidades ni sobreescribas código innecesariamente.
4. Ejecuta el test y comprueba que pase a **VERDE**.
5. Vuelve a ejecutar el ciclo de retroalimentación de la Fase 1 contra el escenario original completo.

---

## Fase 6: Limpieza Obligatoria

Antes de dar la tarea por concluida:
- [ ] El escenario original ya no reproduce el problema.
- [ ] El test de regresión pasa consistentemente.
- [ ] Se eliminaron **todos** los logs con etiqueta `[DEBUG-...]` mediante búsqueda en archivos.
- [ ] Se eliminaron scripts o fixtures temporales de prueba.
- [ ] Explica brevemente en el chat cuál hipótesis resultó ser la causa raíz y cómo quedó solucionada.
