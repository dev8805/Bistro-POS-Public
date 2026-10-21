---
inclusion: always
---

# Convenciones de Código y Comunicación

## Idioma y tono

- Español nativo en todas las respuestas
- Tono didáctico: explicar el contexto brevemente, no solo el código
- Soy principiante, quiero entender qué se hace y por qué
- Breve y directo. No escribir muros de texto
- Si se solicita una explicación, simplificar conceptos complejos para aplicarlos en la práctica

## Comunicación visual (ASCII)

- Reglas detalladas de previsualización en `previsualizar-cambios.md`
- Cuando el usuario diga "explícame lo que entiendes que quiero" o similar, responder con un diagrama ASCII que represente visualmente la intención
- Cuando el usuario tenga una duda o pida que se le explique un concepto, flujo, error o comportamiento, el agente DEBE usar diagramas ASCII para ilustrar la explicación. No muros de texto.
- Priorizar: flechas, cajas, líneas de tiempo, árboles. El texto acompaña al diagrama, no lo reemplaza.

## Análisis de impacto (obligatorio)

Antes de implementar cualquier cambio, evaluar si la instrucción del usuario tiene consecuencias que él no mencionó. Si detectas que el cambio:

- Afecta otras pantallas, componentes o hooks que el usuario no nombró
- Rompe un flujo existente (ventas, offline, permisos, etc.)
- Requiere cambios en más lugares de los que el usuario asume
- Tiene múltiples formas de resolverse con trade-offs diferentes

Entonces: **informar brevemente qué se ve afectado, dar opciones claras, y dejar que el usuario elija**. No implementar a ciegas.

Formato:
```
⚠️ Esto también toca:
- [componente/hook/flujo afectado] — por qué

Opciones:
A) [opción] — pros/contras
B) [opción] — pros/contras

¿Cuál prefieres?
```

Si el cambio es aislado y no toca nada más, implementar directamente sin preguntar.

## Reglas de comportamiento

- Implementar cambios asertivos — no pedir permiso para avanzar (excepto cuando el análisis de impacto detecta colisiones)
- No citar código erróneo en el chat
- No abusar de comentarios en el código
- No sobreescribir código funcional ni crear problemas nuevos
- Scope estricto: solo cambiar lo directamente relacionado con el problema
- Al escribir componentes nuevos: versión más simple posible, fácil de depurar
- Si el error persiste en el segundo intento: dar un paso atrás y revisar el codebase completo
- Si el usuario pide un cambio de rumbo importante: enlistar objetivos originales, implicaciones, recursos afectados e implementaciones necesarias

## Reglas de código

- Usar `early returns` para mejorar legibilidad
- Nombres descriptivos con prefijo `handle` para funciones de eventos (handleClick, handleKeyDown)
- Tailwind CSS para estilos — nunca CSS plano ni tags `<style>`
- Usar `const` en vez de `function` para declarar funciones: `const toggle = () => {}`
- Definir tipos TypeScript siempre que sea posible
- No crear hooks genéricos que no se usen de inmediato (YAGNI)
- No modificar `App.tsx` sin revisar el mapa del archivo primero

## Accesibilidad

- `tabindex="0"` en elementos interactivos no nativos
- `aria-label` descriptivo
- `onKeyDown` en todo elemento con onClick
- Soporte de navegación por teclado

## Feature nueva que involucra +2 archivos

Si el usuario pide una feature nueva que implica más de 2 archivos, sugerir usar el modo **Spec** antes de implementar directamente. Explicar brevemente por qué conviene planificar primero.

## Commits

La sugerencia de mensajes de commit se maneja EXCLUSIVAMENTE mediante el hook `/commit` (`.kiro/hooks/suggest-commit.json`). No sugerir commits en el chat de forma espontánea — el usuario los pide con `/commit` cuando los necesita.
