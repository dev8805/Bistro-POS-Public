# Diseñarlo Dos Veces (Design It Twice)

> *"Tu primera idea rara vez es la mejor."* — John Ousterhout

Cuando tengas que crear un nuevo hook, componente central o flujo de datos en Bistro POS, no te lances a programar la primera estructura que se te ocurra. Aplica el proceso de **Diseñarlo Dos Veces**.

---

## Proceso Paso a Paso

### 1. Enmarcar el problema y las restricciones
Antes de escribir código real, define brevemente:
- ¿Qué restricciones debe cumplir? (Ej: "debe funcionar sin conexión", "no debe bloquear el render de ventas").
- ¿Qué dependencias necesita? (Supabase, IndexedDB, contexto de autenticación).
- ¿Quién lo va a consumir? (Solo `SellScreen` o múltiples pantallas).

### 2. Proponer Dos Alternativas Radicalmente Distintas

Formula dos contratos de interfaz diferentes:

- **Opción A (Enfoque Minimalista / Opaco):**
  - La interfaz expone lo mínimo absoluto.
  - El módulo asume casi todas las decisiones por dentro.
  - *Ventaja:* Facilísimo de usar, cero configuración.
  - *Trade-off:* Menos flexibilidad si una pantalla necesita un caso especial.

- **Opción B (Enfoque Componible / Explícito):**
  - La interfaz permite inyectar opciones o callbacks para eventos específicos.
  - *Ventaja:* Mayor adaptabilidad a casos límite.
  - *Trade-off:* La interfaz exige aprender más parámetros.

### 3. Evaluar con los 4 Principios
Compara las dos opciones usando:
1. **Profundidad:** ¿Cuál esconde más complejidad molesta detrás de menos props/parámetros?
2. **Prueba de eliminación:** Si borras el módulo, ¿cuál de las dos alternativas deja el resto de la app más limpia?
3. **Facilidad de testeo con Vitest:** ¿Cuál es más fácil de probar sin hacer mocks imposibles?

### 4. Elegir y Proceder
Presenta las dos opciones al usuario con tu recomendación explicada de manera didáctica. Una vez elegida la interfaz, implementa la versión menos compleja y más fácil de depurar.
