---
inclusion: manual
---

# Optimizar Rendimiento — BistroPOS

Guía para aplicar mejoras de rendimiento medibles sin romper funcionalidad.

## Flujo: Medir → Identificar → Optimizar → Validar

### Paso 1: Diagnóstico

```bash
npm run build 2>&1 | tail -20   # Ver bundle size
```

Revisar:
- [ ] package.json (dependencias pesadas)
- [ ] Componentes con re-renders excesivos
- [ ] Llamadas API redundantes
- [ ] Assets (imágenes/fuentes) sin optimizar
- [ ] Oportunidades de code splitting

### Paso 2: Optimizaciones por categoría

**Memoización (solo con evidencia):**
- `React.memo()` en componentes pesados con props estables
- `useMemo()` para cálculos derivados costosos
- `useCallback()` para funciones pasadas a hijos memoizados

**Code Splitting:**
- Pantallas que no se ven al inicio → `React.lazy()` + `Suspense`
- Modales pesados → lazy load
- Librerías de ruta específica → dynamic import

**Red/API:**
- Deduplicar llamadas al mismo endpoint
- Caché local para datos poco variables
- Abort controllers en useEffect
- Prefetch de datos probables

**Assets:**
- Imágenes → WebP/AVIF, `loading="lazy"`
- Fuentes → `font-display: swap`, precargar críticas

**Listas largas (+50 items):**
- Virtualización con react-window o react-virtuoso
- Paginación server-side

### Paso 3: Validación

- [ ] La app funciona igual que antes
- [ ] No hay errores nuevos en consola
- [ ] Se midió la mejora concretamente
- [ ] No se tocó lógica de negocio

## Regla de seguridad

Un cambio a la vez. No aplicar todas las optimizaciones juntas. Validar cada una por separado.
