# 📊 Reporte de Análisis: Bistro POS
Fecha: 2026-01-25

## Resumen Ejecutivo
- **Total problemas encontrados:** 12
- **🔴 Críticos:** 2 | **🟡 Importantes:** 6 | **🟢 Mejoras:** 4

---

## 🔴 Problemas Críticos

### 1. App.tsx Monolítico (1722 líneas / 66KB)
- **Ubicación:** `App.tsx` (todo el archivo)
- **Descripción:** El archivo principal contiene TODA la lógica de negocio, 30+ funciones handler, estado global, y lógica de navegación en un solo componente.
- **Impacto:** 
  - Re-renders masivos en cada cambio de estado
  - Tiempo de compilación incrementado
  - Difícil de mantener y depurar
  - Cualquier cambio pequeño causa re-render de toda la app
- **Solución Recomendada:**
  1. Extraer lógica de carrito a un custom hook `useCart`
  2. Extraer handlers de delivery a `useDeliveryHandlers`
  3. Crear contexto separado para `CartContext`
  4. Mover handlers a su respectiva pantalla cuando sea posible

### 2. Hook useSales.ts Masivo (1167 líneas / 49KB)
- **Ubicación:** `hooks/useSales.ts`
- **Descripción:** Un solo hook maneja TODA la lógica de ventas, órdenes, items, y operaciones de caja.
- **Impacto:**
  - Difícil de testear unitariamente
  - Cualquier importación de `useSales` carga toda la lógica
  - Memory footprint alto
- **Solución Recomendada:**
  1. Dividir en: `useOrders`, `useOrderItems`, `usePayments`
  2. Usar composición de hooks

---

## 🟡 Problemas Importantes

### 3. Console.log en Producción (150+ ocurrencias)
- **Ubicación:** Múltiples archivos en `hooks/` y `screens/`
- **Descripción:** Hay más de 150 llamadas a `console.log` y 100+ `console.error` en el código.
- **Impacto:**
  - Rendimiento degradado (especialmente en loops)
  - Información sensible expuesta en consola del navegador
  - Memory leaks potenciales por referencia a objetos
- **Solución Recomendada:**
  ```typescript
  // Crear utilidad de logging condicional
  const isDev = import.meta.env.DEV;
  export const logger = {
    log: (...args: any[]) => isDev && console.log(...args),
    error: (...args: any[]) => console.error(...args) // Mantener errores
  };
  ```

### 4. Inline Functions en onClick (240+ ocurrencias)
- **Ubicación:** Todas las pantallas, especialmente `CashRegisterScreen.tsx`, `TablesScreen.tsx`
- **Descripción:** Patrones como `onClick={() => setFilter('all')}` se recrean en cada render.
- **Impacto:**
  - Re-renders innecesarios de componentes hijos
  - Garbage collection constante
- **Solución Recomendada:**
  ```typescript
  // Antes
  <button onClick={() => setFilter('all')}>
  
  // Después
  const handleFilterAll = useCallback(() => setFilter('all'), []);
  <button onClick={handleFilterAll}>
  ```

### 5. Ausencia Total de React.memo
- **Ubicación:** `components/` (todos los componentes)
- **Descripción:** Ningún componente usa `React.memo()` para evitar re-renders innecesarios.
- **Impacto:**
  - Cada cambio de estado en App.tsx re-renderiza TODOS los componentes
  - UX lenta especialmente con listas largas (productos, items)
- **Solución Recomendada:**
  ```typescript
  // Componentes pesados candidatos a memo:
  export const ProductCard = React.memo(function ProductCard({ product, onSelect }) {
    // ...
  });
  ```
  **Prioridad alta:** `MenuScreen` product grid, `CartItem` list, `TableCard`

### 6. useEffect con Dependencias Vacías que Usan Variables Externas
- **Ubicación:** `hooks/useKitchenOrders.ts:199,213,261,273`
- **Descripción:** useEffects con `[]` pero que referencian `businessId` u otras variables.
- **Impacto:**
  - Closures con valores obsoletos
  - Bugs sutiles difíciles de reproducir
- **Solución Recomendada:**
  Auditar cada useEffect con `[]` y agregar dependencias faltantes o explicar por qué se omiten.

### 7. Componentes de Pantalla Muy Grandes
- **Ubicación:**
  - `screens/CashRegisterScreen.tsx` - 993 líneas
  - `screens/MenuScreen.tsx` - 65KB
  - `screens/SubscriptionManagementScreen.tsx` - 55KB
- **Impacto:**
  - Tiempo de carga inicial
  - Dificultad para mantener
  - Re-renders costosos

### 8. Realtime Subscription Desactivada pero Montada
- **Ubicación:** `App.tsx:267-309`
- **Descripción:** El canal de realtime `cart-realtime` se suscribe pero su callback está vacío (comentado). Aún así mantiene la conexión websocket.
- **Impacto:**
  - Conexión websocket innecesaria
  - Recursos de red consumidos sin beneficio
- **Solución Recomendada:**
  Eliminar la suscripción si no se usa, o implementar la lógica correctamente.

---

## 🟢 Oportunidades de Mejora

### 9. Lazy Loading Implementado (Parcialmente) ✅
- **Estado:** Ya implementado para pantallas secundarias
- **Ubicación:** `App.tsx:14-28`
- **Mejora Adicional:** 
  - Agregar lazy loading a `MenuScreen` y `PaymentScreen` (cargadas directamente)
  - Considerar prefetch en hover del sidebar

### 10. Bundle Size Optimization
- **Oportunidad:** 
  - `react-easy-crop` (usado solo para avatar) podría dividirse
  - Verificar tree-shaking de Supabase client
- **Herramienta de diagnóstico:**
  ```bash
  npx vite-bundle-visualizer
  ```

### 11. Typings Incompletos
- **Ubicación:** Varios archivos usan `any`
- **Ejemplo:** `App.tsx:408` - `order.items.map((item: any) =>`
- **Mejora:** Usar tipos estrictos del archivo `types.ts`

### 12. Falta de Error Boundaries Granulares
- **Estado actual:** Solo hay `ErrorBoundary` y `ScreenErrorBoundary` globales
- **Mejora:** Agregar boundaries específicos para:
  - Carga de productos
  - Operaciones de pago
  - Conexión a Supabase

---

## Estado del Análisis ✅

- [x] Estructura de carpetas revisada
- [x] Dependencias analizadas (package.json)
- [x] Console errors/warnings verificados
- [x] Re-renders innecesarios detectados
- [x] Memory leaks potenciales identificados (realtime subscription)
- [x] Conflictos de estado encontrados
- [x] Llamadas API redundantes localizadas (comentadas)
- [ ] Optimizaciones CSS propuestas (pendiente revisión Tailwind)
- [ ] Bundle size evaluado (requiere build)
- [x] Reporte final generado

---

## Próximos Pasos Recomendados

### ✅ COMPLETADO - Eliminar console.logs
Se creó `lib/logger.ts` con logging condicional y se migraron los archivos principales:
- `App.tsx` ✅
- `hooks/useSales.ts` ✅
- `hooks/useDelivery.ts` ✅
- `hooks/useKitchenOrders.ts` ✅
- `screens/PaymentScreen.tsx` ✅
- `context/AuthContext.tsx` ✅

**Archivos pendientes (menor prioridad):**
- `screens/DeliveryScreen.tsx`
- `screens/SalesScreen.tsx`
- `hooks/useDrivers.ts`
- `components/Sidebar.tsx`

### ✅ COMPLETADO - Eliminar suscripción realtime no usada
- **App.tsx líneas 267-309** - Suscripción `cart-realtime` eliminada
- El callback estaba vacío, solo consumía websocket innecesariamente
- Ahorro: ~1 conexión websocket activa por usuario

### ✅ COMPLETADO - Componentes Memorizados Creados
Se crearon componentes optimizados listos para usar:
- `components/ProductCard.tsx` - Tarjeta de producto con `React.memo`
- `components/CartItemRow.tsx` - Item de carrito con `React.memo`
- **Nota:** Por seguridad, no se reemplazó el código inline actual en MenuScreen para evitar regresiones. Los componentes están disponibles para migración gradual.

### Prioridad Alta (Siguiente)
4. **Extraer CartContext** de App.tsx 
   - ⚠️ **Pospuesto:** El carrito está muy acoplado con navegación, mesas, delivery y órdenes (40+ referencias a `setCart`). Extraerlo requiere refactorización profunda con riesgo de regresiones.
### ✅ COMPLETADO - Dividir useSales.ts en hooks más pequeños
Se crearon hooks especializados que encapsulan funcionalidades específicas:
- `hooks/useOrders.ts` - Gestión de órdenes (crear, listar, eliminar, confirmar)
- `hooks/useOrderItems.ts` - Operaciones CRUD de items
- **App.tsx** actualizado para usar los nuevos hooks
- **SalesScreen.tsx** actualizado para usar `useOrders`
- `useSales.ts` se mantiene como hook base (backward compatible)

### ✅ COMPLETADO - Auditar useEffects con dependencias vacías
Ver reporte completo: `.agent/reports/auditoria_useeffects.md`
- **Resultado:** No se encontraron bugs críticos de closures stale
- Los hooks siguen buenas prácticas (dependencias correctas, cleanup functions)
- Solo 1 patrón optimizable menor en `useDelivery.ts`

### ✅ COMPLETADO - Optimización de Bundle Size
- **Antes:** index.js = 700KB (173KB gzip)
- **Después:** index.js = 518KB (125KB gzip) - **26% más pequeño**
- Chunks separados:
  - `vendor-react` (12KB) - React core
  - `vendor-supabase` (172KB) - Supabase SDK  
  - `vendor-cropper` (24KB) - Solo carga en perfil
- Visualizer disponible: `ANALYZE=true npm run build`
- Archivo: `vite.config.ts` actualizado con `manualChunks`

### ✅ COMPLETADO - Prefetch de Pantallas Frecuentes
- Archivo: `lib/prefetch.ts` creado
- Prefetch automático después de login (dashboard, sales, products, clients)
- Usa `requestIdleCallback` para no bloquear UI
- Helper `createHoverPrefetch` disponible para prefetch on hover

### Prioridad Baja (Pendiente)
10. Migrar grids de productos a usar `ProductCard` memorizado

---

## Métricas del Proyecto

| Archivo | Líneas | Tamaño |
|---------|--------|--------|
| App.tsx | 1722 | 66KB |
| useSales.ts | 1167 | 49KB |
| useDelivery.ts | 809 | 32KB |
| CashRegisterScreen.tsx | 993 | 61KB |
| MenuScreen.tsx | ~1500 | 65KB |

**Total archivos analizados:** 113 (tsx/ts/js)
**Hooks:** 14
**Pantallas:** 23
**Componentes:** 22
