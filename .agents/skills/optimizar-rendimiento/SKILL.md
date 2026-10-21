---
name: optimizar-rendimiento
description: Optimiza y mejora el rendimiento de aplicaciones web sin afectar la funcionalidad existente. Úsese cuando el usuario mencione lentitud, optimización, reducir tamaño de bundle, mejorar tiempos de carga, o quiera que la app sea más rápida y eficiente.
---

# Instrucciones: Optimizador de Rendimiento para Web Apps

Eres un experto en optimización de rendimiento web. Tu objetivo es aplicar mejoras medibles que aceleren la app sin romper ningún comportamiento existente.

## Cuándo usar esta skill
- Usuario menciona: "lento", "pesado", "tarda en cargar", "optimizar", "rendimiento"
- Usuario pide: "hacer más rápido", "reducir bundle", "mejorar performance"
- Usuario quiere: menos re-renders, carga más rápida, menor consumo de memoria
- Antes de un deployment a producción
- Después de agregar muchas features nuevas

## Principio Fundamental

> **Medir → Identificar → Optimizar → Validar**
> Nunca optimizar a ciegas. Siempre confirmar que la funcionalidad permanece intacta.

## Flujo de Trabajo

### Fase 1: Diagnóstico Rápido

```markdown
## Checklist de Diagnóstico
- [ ] package.json revisado (dependencias pesadas)
- [ ] Bundle size medido
- [ ] Componentes con re-renders excesivos identificados
- [ ] Llamadas API redundantes detectadas
- [ ] Assets (imágenes/fuentes) evaluados
- [ ] Code splitting oportunidades encontradas
- [ ] Memory leaks verificados
```

Ejecutar inventario del proyecto:
```bash
# Listar archivos del proyecto
find . -name "*.tsx" -o -name "*.ts" -o -name "*.jsx" -o -name "*.js" | grep -v node_modules | head -60
```

### Fase 2: Medir el Estado Actual

#### 2.1 Bundle Size
```bash
# Vite
npx vite-bundle-visualizer
# Webpack
npx webpack-bundle-analyzer stats.json
# Genérico
npm run build 2>&1 | tail -20
```

#### 2.2 Dependencias Pesadas
Buscar en `package.json` librerías conocidas por su peso:
- `moment` → reemplazar con `dayjs` o `date-fns`
- `lodash` → usar imports específicos: `lodash/debounce`
- `@material-ui` completo → importar solo componentes usados
- Cualquier librería >100KB que tenga alternativa ligera

### Fase 3: Optimizaciones por Categoría

#### 🧠 3.1 Memoización y Re-renders (React)

**Buscar estos patrones problemáticos:**

- Componentes que reciben objetos/arrays creados inline como props
- Funciones recreadas en cada render pasadas como props
- Contextos que cambian un valor y re-renderizan todo el árbol

**Soluciones seguras:**

- `React.memo()` en componentes que reciben props estables
- `useMemo()` para cálculos derivados costosos
- `useCallback()` para funciones pasadas como props a hijos memoizados
- Separar contextos grandes en contextos más pequeños y específicos

**Regla:** Solo memoizar donde hay evidencia de re-renders innecesarios. No memoizar todo por defecto.

#### 📦 3.2 Code Splitting y Lazy Loading

- Pantallas/rutas que no se ven al inicio → `React.lazy()` + `Suspense`
- Modales y componentes pesados que se abren bajo demanda → lazy load
- Librerías usadas solo en ciertas rutas → dynamic import

```typescript
// Ejemplo: Lazy load de una pantalla
const ReportsScreen = React.lazy(() => import('./screens/ReportsScreen'));

// Uso con Suspense
<Suspense fallback={<LoadingSpinner />}>
  <ReportsScreen />
</Suspense>
```

#### 📡 3.3 Optimización de Red/API

- **Deduplicación:** Evitar múltiples llamadas al mismo endpoint simultáneamente
- **Caché:** Implementar caché local (React Query, SWR, o Map simple) para datos que no cambian frecuentemente
- **Batching:** Agrupar requests múltiples en uno solo cuando el backend lo soporte
- **Prefetch:** Precargar datos que el usuario probablemente necesitará
- **Abort controllers:** Cancelar requests cuando el componente se desmonta

```typescript
// Ejemplo: Abort controller en useEffect
useEffect(() => {
  const controller = new AbortController();
  fetchData({ signal: controller.signal });
  return () => controller.abort();
}, [dependency]);
```

#### 🖼️ 3.4 Assets e Imágenes

- Imágenes grandes → comprimir o usar formato WebP/AVIF
- Imágenes debajo del fold → `loading="lazy"`
- Iconos SVG inline → extraer a sprite o componente reutilizable
- Fuentes → usar `font-display: swap` y precargar las críticas

#### 🎨 3.5 CSS y Animaciones

- Evitar animaciones sobre `width`, `height`, `top`, `left` (causan reflow)
- Preferir `transform` y `opacity` (solo compositing, GPU-accelerated)
- Reducir selectores CSS demasiado específicos
- Eliminar CSS no utilizado

```css
/* ❌ Causa reflow */
.animate { transition: width 0.3s; }

/* ✅ Solo compositing */
.animate { transition: transform 0.3s; }
```

#### 📋 3.6 Listas Largas

- Listas >50 items → virtualización con `react-window` o `react-virtuoso`
- Paginación del lado servidor para datasets grandes
- Scroll infinito en lugar de cargar todo de golpe

#### 💾 3.7 Estado y Almacenamiento

- Evitar guardar datos derivados en el estado (calcularlos con `useMemo`)
- No duplicar datos del servidor en múltiples estados locales
- Limpiar listeners, timers y subscripciones en el cleanup de `useEffect`

## Reglas de Seguridad (No Romper Nada)

1. **Validar antes y después** — La funcionalidad debe ser idéntica pre y post optimización
2. **Un cambio a la vez** — Aplicar optimizaciones de forma incremental, no todas juntas
3. **No cambiar lógica de negocio** — Solo tocar la capa de rendimiento
4. **Preservar tipos** — No romper interfaces TypeScript existentes
5. **Probar edge cases** — Especialmente con datos vacíos, muchos datos y conexiones lentas
6. **Documentar impacto** — Anotar qué mejoró y cuánto

## Formato de Reporte de Optimización

```markdown
# ⚡ Reporte de Optimización: [Nombre App]
Fecha: [FECHA]

## Métricas Antes/Después
| Métrica          | Antes   | Después | Mejora  |
|------------------|---------|---------|---------|
| Bundle size      | X KB    | X KB    | -X%     |
| Re-renders       | X       | X       | -X%     |
| Tiempo de carga  | X ms    | X ms    | -X%     |

## Optimizaciones Aplicadas
### [Nombre de la optimización]
- **Archivo:** `ruta/archivo.tsx`
- **Qué se hizo:** [Descripción breve]
- **Impacto:** [Mejora medida]
- **Riesgo:** Bajo/Medio (justificar si medio)

## Optimizaciones Pendientes (Opcionales)
1. [Optimización sugerida pero no aplicada, con justificación]

## Validación
- [ ] App funciona igual que antes
- [ ] No hay errores nuevos en consola
- [ ] Navegación entre pantallas fluida
- [ ] Datos se cargan correctamente
- [ ] Estados se actualizan como antes
```

## Checklist Final

Antes de cerrar la optimización:
- [ ] Todas las optimizaciones aplicadas están validadas
- [ ] No se introdujeron errores nuevos
- [ ] El comportamiento de la app es idéntico al original
- [ ] Se documentaron los cambios y sus impactos
- [ ] Se midió la mejora de forma concreta
