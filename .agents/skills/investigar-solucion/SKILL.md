---
name: investigar-solucion
description: Analiza requerimientos y problemas para definir estrategias de solución sin escribir código. Identifica componentes afectados, agrupa tareas y crea fases de implementación.
---

# Investigar y Definir Solución Técnica — BistroPOS

## Cuándo usar esta skill
- Cuando el usuario pide investigar un problema sin implementar código inmediatamente.
- Cuando se necesita entender el impacto de un cambio en múltiples componentes.
- Para crear un plan de acción estructurado antes de la implementación.
- **IMPORTANTE:** Nunca usar esta skill para generar código final. Solo análisis y estrategia.

---

## Checklist de Investigación (específico de Bistro)

Antes de proponer cualquier solución, verificar en este orden:

**1. Revisar documentación existente**
- [ ] ¿Hay un doc en `docs/caracteristicas/` que describa esta feature?
- [ ] ¿El problema fue resuelto antes? Revisar `docs/historial_planes/`
- [ ] ¿Toca `App.tsx`? → Leer `docs/arquitectura/APP_TSX_MAPA.md` primero

**2. Identificar el alcance**
- [ ] ¿Afecta el flujo de ventas? (`App.tsx` → `SellScreen` → `MenuScreen`)
- [ ] ¿Afecta modo offline? (`useOfflineSync.ts`, `idb`, `IndexedDB`)
- [ ] ¿Requiere cambios en Supabase? (tablas, RLS, funciones SQL)
- [ ] ¿Toca la impresora o PDF? (`@point-of-sale/*`, `@react-pdf/renderer`)

**3. Identificar archivos reales con `grep_search`**
- Buscar el componente o hook relacionado antes de asumir dónde vive la lógica
- Confirmar nombres de funciones, estados y props reales

---

## Flujo de trabajo

### 1. Investigación Profunda
- Usa `grep_search` y `view_file` para entender el estado actual.
- Identifica todos los archivos, componentes y pantallas involucrados.
- Rastrea el flujo de datos y dependencias afectadas.

### 2. Análisis y Agrupación
- Agrupa requerimientos por dominio funcional (ventas, inventario, pagos, auth, etc.).
- Clasifica tareas por prioridad y dependencia.

### 3. Definición de Estrategia
- Describe *lógicamente* qué cambios son necesarios en cada componente.
- **NO escribas bloques de código** ni soluciones línea por línea.
- Céntrate en: qué componentes interactúan, qué estados cambian, qué flujos se modifican.

### 4. Generación del Entregable
Crea un artefacto Markdown con esta estructura:

```markdown
# Análisis de Solución: [Título]

## 1. Contexto y Alcance
Descripción del problema. Referencia al doc en `docs/caracteristicas/` si aplica.

## 2. Mapa de Impacto
- `src/screens/NombreScreen.tsx`: [qué cambia y por qué]
- `src/hooks/useNombre.ts`: [qué cambia y por qué]
- Supabase: [si requiere migración o cambio de política]

## 3. Consideraciones Críticas
- **Offline:** [¿Cómo se comporta sin internet?]
- **Flujo de ventas:** [¿Puede interrumpir una venta activa?]
- **RLS:** [¿El usuario tiene permisos correctos?]

## 4. Fases de Implementación
- **Fase 1:** Preparación (migraciones, hooks base)
- **Fase 2:** Implementación core
- **Fase 3:** UI y refinamiento

## 5. Checklist de Ejecución
- [ ] Tarea detallada 1
- [ ] Tarea detallada 2
```

---

## Instrucciones Clave
- **Prohibido Código:** Describe la lógica en lenguaje natural o pseudocódigo si es necesario.
- **Visión Holística:** Considera offline, performance y flujo de ventas en todo análisis.
- **Verificar antes de proponer:** No asumas que un componente "debe existir". Confírmalo con `grep_search`.

## Recursos
- Features → `docs/caracteristicas/`
- Arquitectura → `docs/arquitectura/APP_TSX_MAPA.md`
- Flujo Git/DB → `docs/arquitectura/flujo_entornos_github_supabase.md`
