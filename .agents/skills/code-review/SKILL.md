---
name: code-review
description: "Revisión rigurosa de código y cambios (git diff) a lo largo de dos ejes independientes: Estándares (¿cumple las reglas del proyecto y buenas prácticas?) y Especificación (¿hace exactamente lo que se pidió sin cambios de más?). Úsese cuando el usuario pida \"haz code review\", \"revisa este PR\", \"revisa los cambios\", \"audita el diff\", o \"revisar código\"."
---

# Code Review en Dos Ejes — Bistro POS

Esta habilidad realiza una revisión técnica profunda del `git diff` entre un punto de referencia (`main`, un commit, una rama o cambios pendientes de la sesión) y `HEAD`.

La revisión se divide estrictamente en **dos ejes independientes** que nunca deben mezclarse ni promediarse:
1. **Eje de Estándares:** ¿El código está bien construido según las reglas de Bistro y principios limpios?
2. **Eje de Especificación:** ¿El código hace exactamente lo que el usuario/requerimiento pidió?

> **¿Por qué dos ejes separados?**
> Un código puede seguir todas las reglas de TypeScript/Tailwind pero implementar la fórmula de impuestos al revés (**Estándares pasan, Especificación falla**). O puede resolver la venta a la perfección pero meter estilos inline y 100 líneas duplicadas (**Especificación pasa, Estándares fallan**). Separar los ejes impide que uno oculte los fallos del otro.

---

## Flujo de Trabajo

### Paso 1: Fijar el punto de referencia y obtener el Diff
1. Determina el punto de referencia:
   - Si el usuario indica un commit o rama (`main`, `HEAD~1`, etc.), usa:
     ```bash
     git diff <referencia>...HEAD
     ```
   - Si el usuario se refiere al trabajo de la sesión actual sin commit:
     ```bash
     git diff
     ```
2. Comprueba que el diff contenga cambios reales. Si el diff está vacío, infórmalo de inmediato.

---

### Paso 2: Evaluar el Eje de Especificación (Spec)

Compara los cambios contra la solicitud original del usuario, el plan acordado o el documento correspondiente en `docs/caracteristicas/`:

- [ ] **Requisitos faltantes o parciales:** Cosas que se pidieron pero no se implementaron o se dejaron a medias.
- [ ] **Desviación de alcance (*Scope Creep*):** Cambios en archivos, funciones o lógica que **nadie pidió**. En Bistro POS esto es crítico: tocar cosas no relacionadas suele romper ventas, comandas o sincronización offline.
- [ ] **Comportamiento incorrecto:** Lógica implementada que contradice la especificación (ej. restar inventario cuando se canceló una orden en lugar de cuando se pagó).

---

### Paso 3: Evaluar el Eje de Estándares (Standards)

Revisa el diff contra:
1. **Las Reglas del Proyecto en [`.agents/rules/reglas.md`](file:///c:/Users/HP/OneDrive/Escritorio/Bistro/.agents/rules/reglas.md):**
   - Retornos tempranos (*early returns*) para legibilidad.
   - Uso de clases Tailwind (prohibido CSS inline o estilos fuera del design system).
   - Uso de `const` con tipado explícito en lugar de `function`.
   - Nombres de eventos con prefijo `handle` (`handleClick`, `handleSelect`).
   - Accesibilidad básica en elementos interactivos (`tabIndex`, `aria-label`).
   - Respeto a `public_id` para negocios (nunca asumir UUID `id` en consultas).

2. **La Línea Base de *Code Smells* de Martin Fowler:**
   - **Nombre Misterioso (*Mysterious Name*):** Variables o funciones cuyo nombre no dice claramente qué hacen o contienen.
   - **Código Duplicado (*Duplicated Code*):** Lógica repetida en más de un bloque o archivo en lugar de extraerse a un hook o utilidad.
   - **Envidia de Características (*Feature Envy*):** Una función o componente que manipula excesivamente el estado interno de otro en lugar de delegar.
   - **Grupo de Datos (*Data Clumps*):** Tres o cuatro parámetros que siempre viajan juntos y deberían ser un tipo TypeScript.
   - **Obsesión por Primitivos (*Primitive Obsession*):** Usar strings o números genéricos donde se necesita un tipo literal estricto.
   - **Cirugía de Perdigones (*Shotgun Surgery*):** Un cambio pequeño que obligó a editar 8 archivos dispersos (indicio de módulo superficial).
   - **Generalidad Especulativa (*Speculative Generality*):** Props, parámetros o hooks agregados "por si acaso en el futuro". Si no se necesitan hoy, deben eliminarse.
   - **Hombre del Medio (*Middle Man*):** Componentes o funciones que solo reenvían props sin hacer nada más.

---

### Paso 4: Generación del Reporte Final

Presenta los hallazgos de forma directa y didáctica, citando siempre el archivo y la línea:

```markdown
# Reporte de Code Review

## 📋 Eje de Especificación (Spec)
- **Estado general:** [Aprobado / Observaciones / Falla]
- **Hallazgos:**
  - `src/screens/...`: [Descripción de requisito faltante o scope creep].

---

## 🛠️ Eje de Estándares (Standards)
- **Estado general:** [Aprobado / Observaciones / Falla]
- **Hallazgos:**
  - `src/components/...` (Línea X): [Violación de regla o Code Smell detectado y cómo corregirlo].

---

## ⚖️ Veredicto y Siguientes Pasos
- **Total observaciones Spec:** N
- **Total observaciones Estándares:** N
- **Recomendación prioritaria:** [El cambio más importante a realizar antes de cerrar la tarea].
```
