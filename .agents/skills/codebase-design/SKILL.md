---
name: codebase-design
description: Principios y vocabulario para diseñar módulos profundos y arquitecturas limpias en Bistro POS. Úsese cuando el usuario quiera diseñar una nueva abstracción o hook, refactorizar código complejo, decidir dónde colocar los límites de un componente, o comparar alternativas de diseño con "Design It Twice". Disparadores: "diseñar módulo", "refactorizar arquitectura", "extraer hook", "codebase design", "diseña dos alternativas", "simplificar interfaz".
---

# Diseño de Código y Módulos Profundos — Bistro POS

Esta habilidad establece los principios y el vocabulario técnico para diseñar código mantenible, desacoplado y fácil de depurar en Bistro POS, basándose en la filosofía de **Módulos Profundos** (*A Philosophy of Software Design* de John Ousterhout) y **Costuras Limpias** (*Working Effectively with Legacy Code* de Michael Feathers).

El objetivo es maximizar la **potencia para quien usa el módulo** y la **localidad para quien lo mantiene**, evitando la sobre-ingeniería y los módulos pasamanos.

---

## El Vocabulario Esencial

Utiliza estos términos con precisión. Evita sinónimos ambiguos como "servicio", "componente genérico" o "caja negra":

1. **Módulo (Module):** Cualquier unidad de código que tiene una **interfaz** y una **implementación**. Es agnóstico a la escala: puede ser una función pura, un hook personalizado (`useOrderSync`), una pantalla o una capa de datos.
   - *Evitar*: Servicio, componente suelto, bloque.
2. **Interfaz (Interface):** Todo lo que quien llama al módulo necesita saber para usarlo correctamente: la firma TypeScript (props, parámetros, retorno), pero también sus invariantes (ej. "debe llamarse dentro de un Turno de caja activo"), estados de carga y manejo de errores.
   - *Evitar*: Solo firma, API.
3. **Profundidad (Depth):**
   - **Módulo Profundo (Deep Module):** **Mucho comportamiento y potencia oculta detrás de una interfaz pequeña y simple.** (Ejemplo: `useOfflineSale` recibe solo `cart` y `payment` y por dentro resuelve IndexedDB, cálculo de impuestos, lotes y cola de sincronización).
   - **Módulo Superficial (Shallow Module):** La interfaz es casi tan compleja como el código que contiene. Añade capas y saltos de archivo sin aportar valor real.
4. **Costura (Seam):** El lugar exacto donde se puede alterar o interceptar el comportamiento sin tener que editar ese punto de llamada. Es el punto de montaje de la interfaz.
5. **Adaptador (Adapter):** La pieza concreta que satisface la interfaz en una costura (ej. un adaptador de almacenamiento en memoria para tests y un adaptador Dexie/IndexedDB para producción).
6. **Apalancamiento (Leverage):** La relación costo/beneficio: cuánto código, lógica o problemas le ahorra el módulo a quien lo invoca.
7. **Localidad (Locality):** La concentración de un problema: si ocurre un bug o cambia una regla, se arregla en **un solo lugar**, no disperso en 5 pantallas.

---

## Los 4 Principios de Diseño en Bistro POS

### 1. La profundidad es una propiedad de la interfaz, no del código interno
Un hook o módulo profundo puede estar construido internamente con varias funciones auxiliares pequeñas, pero **esas partes nunca deben exponerse a quien lo consume**. Quien usa el módulo solo debe ver una interfaz clara, intuitiva y mínima.

### 2. La prueba de la eliminación (The Deletion Test)
Si estás dudando si un componente o hook vale la pena:
> *Imagina que lo borras por completo.*
> - Si al borrarlo la complejidad simplemente desaparece y el código queda más claro: **era un módulo superficial pasamanos (bórralo).**
> - Si al borrarlo la complejidad se desparrama y tienes que duplicar 20 líneas en 4 pantallas distintas: **el módulo se ha ganado su lugar (es profundo).**

### 3. La interfaz es la superficie de pruebas
Quien consume el módulo y quien escribe el test de Vitest deben usar exactamente la misma costura. Si para probar un hook necesitas acceder a variables internas o trucos privados, el módulo está mal diseñado.

### 4. Una implementación = Costura hipotética; Dos implementaciones = Costura real
No crees abstracciones complejas, fábricas o interfaces configurables si hoy solo tienes una forma concreta de hacer las cosas. Crea la costura cuando realmente existan dos variantes (ej. Modo Online con Supabase vs Modo Offline con IndexedDB). De lo contrario, es solo indirección innecesaria.

---

## Técnicas Complementarias

- **[DESIGN-IT-TWICE.md](file:///c:/Users/HP/OneDrive/Escritorio/Bistro/.agents/skills/codebase-design/DESIGN-IT-TWICE.md):** Al diseñar un módulo clave (como la gestión de mesas, impresión o cuentas por cobrar), formula **dos alternativas de interfaz radicalmente distintas** antes de programar.
- **[DEEPENING.md](file:///c:/Users/HP/OneDrive/Escritorio/Bistro/.agents/skills/codebase-design/DEEPENING.md):** Guía para agrupar módulos superficiales dispersos y convertirlos en un módulo profundo fácil de mantener.
