# Formato de Registro de Aprendizaje (Learning Record)

Los registros de aprendizaje viven en `docs/aprendizaje/registros-aprendizaje/0001-[concepto-clave].md` con numeración incremental.

Son el equivalente a los ADRs en arquitectura: notas breves (1 a 3 párrafos) que documentan qué concepto quedó sólidamente aprendido, para que las siguientes sesiones sepan exactamente de dónde partir.

---

## Plantilla

```markdown
# [Número]: [Título claro del concepto dominado]

**Fecha:** AAAA-MM-DD  
**Estado:** Activo  

### Lo que se aprendió
[1 o 2 oraciones explicando el concepto en tus propias palabras o con la regla clave].

### Evidencia / Ejercicio resuelto
[Breve mención del ejercicio o pregunta que demostró el dominio del tema].

### Implicaciones para las siguientes sesiones
[Qué nuevo tema o reto queda desbloqueado a partir de este conocimiento].
```

---

## Ejemplo Real

```markdown
# 0001: La diferencia entre Estado Local y Context en React

**Fecha:** 2026-09-26  
**Estado:** Activo  

### Lo que se aprendió
`useState` es para datos privados de un solo componente (ej. si un modal está abierto o cerrado). `useContext` es para datos que toda la app necesita consultar o actualizar (ej. el turno de caja activo o el usuario logueado).

### Evidencia / Ejercicio resuelto
El usuario identificó correctamente por qué el carrito de compras debía ir en Contexto mientras que el input de búsqueda de productos debía ser estado local.

### Implicaciones para las siguientes sesiones
Ya podemos avanzar a diseñar hooks personalizados (`useCart`) sin tener que re-explicar el ciclo de vida del estado.
```
