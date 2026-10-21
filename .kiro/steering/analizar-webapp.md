---
inclusion: manual
---

# Analizar Web App — BistroPOS

Guía para detectar problemas de rendimiento, errores, conflictos y oportunidades de mejora.

## Flujo de análisis

### Fase 1: Aclarar contexto
Identificar detalles que el usuario omitió. Preguntar directamente sobre zonas ciegas antes de analizar.

### Fase 2: Análisis por capas

**Dependencias (package.json):**
- Duplicadas o conflictivas
- Versiones con vulnerabilidades
- Librerías pesadas reemplazables

**Estado (State):**
- useEffect sin dependencias correctas
- Estados que se actualizan en loops
- Context providers anidados sin necesidad
- Props drilling excesivo

**Renderizado:**
- Re-renders sin cambios reales
- Keys dinámicas incorrectas en listas
- Inline functions en props

**Red/API:**
- Llamadas duplicadas al mismo endpoint
- Waterfall de requests (secuenciales que podrían ser paralelos)
- Falta de loading/error states

**Estilos:**
- Clases Tailwind duplicadas o contradictorias
- Animaciones con reflow (width, height, top, left)

### Fase 3: Clasificar problemas

- 🔴 **Críticos**: Errores runtime, memory leaks, loops infinitos
- 🟡 **Importantes**: Re-renders excesivos, API redundantes, animaciones no optimizadas
- 🟢 **Mejoras**: Bundle size, code splitting, lazy loading

### Fase 4: Reporte

```markdown
# 📊 Reporte de Análisis
## Resumen: X problemas (X críticos, X importantes, X mejoras)

### 🔴 Críticos
- Ubicación: `archivo:línea`
- Problema: ...
- Solución: ...

### 🟡 Importantes
[mismo formato]

### 🟢 Mejoras
[mismo formato]
```

## Reglas de seguridad

- Nunca modificar sin validar que funciona antes
- Cambios atómicos
- Preservar comportamiento existente
- Documentar side-effects potenciales
