# Formato de ADR (Architecture Decision Record)

Los ADRs viven en `docs/adr/` y usan numeración secuencial de 4 dígitos: `0001-[nombre-descriptivo].md`, `0002-[nombre-descriptivo].md`, etc.

El directorio `docs/adr/` se crea de manera perezosa (lazy), únicamente cuando se registre la primera decisión que cumpla los requisitos.

---

## Plantilla Minimalista

```markdown
# [Número]: [Título corto y claro de la decisión]

**Estado:** Aceptado  
**Fecha:** AAAA-MM-DD  

### Contexto
[1 o 2 oraciones explicando la situación, el problema o la limitación técnica que teníamos].

### Decisión
[1 o 2 oraciones explicando exactamente qué camino tomamos y la razón principal].

### Consecuencias o Trade-offs
[1 o 2 oraciones mencionando qué ganamos y qué costo o restricción asumimos].
```

---

## Ejemplo Real para Bistro POS

```markdown
# 0001: Uso de IndexedDB con Dexie para la Cola Offline

**Estado:** Aceptado  
**Fecha:** 2026-09-26  

### Contexto
Bistro necesita procesar ventas y emitir tickets en restaurantes incluso si el internet se corta por horas, acumulando decenas de transacciones con detalles de productos y pagos.

### Decisión
Usamos IndexedDB gestionado a través de Dexie en lugar de LocalStorage para almacenar las ventas pendientes y datos de catálogo local.

### Consecuencias o Trade-offs
Ganamos capacidad de almacenamiento (más de 50MB frente a los 5MB de LocalStorage) y operaciones asíncronas no bloqueantes. Asumimos la necesidad de un worker de sincronización con lógica de reintentos hacia Supabase.
```

---

## Cuándo crear un ADR (Los 3 Filtros)

Todos estos tres puntos deben cumplirse simultáneamente:
1. **Difícil de revertir:** Modificarlo después implicaría rehacer tablas o semanas de refactor.
2. **Sorprendente sin contexto:** Alguien nuevo se preguntaría por qué no se hizo de la forma obvia.
3. **Resultado de un trade-off real:** Había al menos dos opciones serias con ventajas y desventajas.

Si la decisión es obvia, temporal o fácil de deshacer, **no crees un ADR**.
