# 📊 Reporte de Análisis: Pantalla de Cocina (KitchenScreen)
Fecha: 2026-01-26

## Resumen Ejecutivo
- **Total problemas encontrados:** 5
- **🔴 Críticos:** 1 | **🟡 Importantes:** 3 | **🟢 Mejoras:** 1

---

## 🔴 Problemas Críticos

### 1. Waterfall de Requests N+1 (PROBLEMA PRINCIPAL)
- **Ubicación:** `hooks/useKitchenOrders.ts:83-159`
- **Descripción:** Por cada orden, se hacen 4 queries SEPARADAS en serie:
  1. Query para tabla (`tables`)
  2. Query para sala (`rooms`)
  3. Query para cliente (`clients`)
  4. Query para mesero (`profiles`)
  5. Query para items (`order_items`)

- **Impacto:**
  - Si hay 5 órdenes: **25+ queries** (5 órdenes × 5 queries cada una)
  - Cada query espera al anterior (waterfall)
  - En conexiones lentas esto puede tardar 5-10 segundos
  
- **Código problemático:**
```typescript
// Línea 83-159: Para CADA orden se hace:
confirmedOrders.map(async (order) => {
    const { data: tableData } = await supabase.from('tables')...  // Query 1
    const { data: roomData } = await supabase.from('rooms')...   // Query 2
    const { data: clientData } = await supabase.from('clients')...  // Query 3
    const { data: waiterData } = await supabase.from('profiles')...  // Query 4
    const { data: itemsData } = await supabase.from('order_items')...  // Query 5
});
```

- **Solución Recomendada:**
  Hacer JOIN en una sola query Supabase:
```typescript
const { data } = await supabase
    .from('orders')
    .select(`
        id, order_number, order_type, created_at, last_confirmed_at,
        table:tables(label, room:rooms(name)),
        client:clients(name),
        waiter:profiles!waiter_id(full_name),
        items:order_items(id, product_name, quantity, notes, cooking_term, removed_ingredients, status)
    `)
    .eq('business_id', businessId)
    .in('status', ['pending', 'preparing']);
```
**Resultado:** 1 query en lugar de N×5

---

## 🟡 Problemas Importantes

### 2. Timer de 1 segundo recalcula TODO el array
- **Ubicación:** `hooks/useKitchenOrders.ts:265-274`
- **Descripción:** Cada segundo, `setOrders` crea un nuevo array con todos los objetos recalculados.
```typescript
useEffect(() => {
    const interval = setInterval(() => {
        setOrders(prev => prev.map(order => ({
            ...order,
            elapsed_seconds: calculateElapsed(order.created_at)
        })));
    }, 1000);
}, []);
```
- **Impacto:**
  - Cada segundo se crean N objetos nuevos
  - Fuerza re-render de TODOS los tickets aunque no cambiaron
  
- **Solución Recomendada:**
  Mover el cálculo de `elapsed_seconds` a un componente hijo con su propio timer:
```typescript
// En renderTicket, usar un componente separado:
<ElapsedTimer createdAt={order.created_at} />

// ElapsedTimer.tsx
const ElapsedTimer = memo(({ createdAt }) => {
    const [elapsed, setElapsed] = useState(calculateElapsed(createdAt));
    useEffect(() => {
        const interval = setInterval(() => setElapsed(calculateElapsed(createdAt)), 1000);
        return () => clearInterval(interval);
    }, [createdAt]);
    return <span>{formatTime(elapsed)}</span>;
});
```

### 3. Funciones inline recreadas cada render
- **Ubicación:** `screens/KitchenScreen.tsx:74-108, 110-174`
- **Descripción:** `renderItem` y `renderTicket` son funciones definidas dentro del componente y se recrean cada render.
- **Impacto:**
  - Cada vez que cambia `fontSize` o `viewMode`, todas las funciones se recrean
  - Impide que React.memo funcione efectivamente
  
- **Solución:**
  Convertir a componentes externos memorizados (`TicketCard`, `TicketItem`)

### 4. Sin paginación ni virtualización
- **Ubicación:** `screens/KitchenScreen.tsx:255-257`
- **Descripción:** Si hay 50 órdenes, se renderizan todas a la vez.
- **Impacto:**
  - DOM pesado con muchos nodos
  - Scroll lento en dispositivos móviles
  
- **Solución:**
  - Para cocina probablemente no es necesario virtualización (pocas órdenes activas)
  - Pero considerar limitar a las 20 más antiguas y agregar "Ver más"

---

## 🟢 Oportunidades de Mejora

### 5. Componente TicketCard sin memoización
- **Ubicación:** `screens/KitchenScreen.tsx:110-174`
- **Descripción:** El ticket individual podría beneficiarse de React.memo para evitar re-renders cuando cambia solo un ticket.
- **Impacto:** Menor, pero mejora fluidez con muchas órdenes.

---

## Estado del Análisis ✅

- [x] Estructura de archivos revisada
- [x] Queries de Supabase analizadas
- [x] Re-renders innecesarios detectados
- [x] Waterfall de requests identificado (PRINCIPAL)
- [x] Timers y efectos revisados
- [x] Reporte generado

---

## Plan de Implementación (Priorizado)

### ✅ Fase 1: Optimizar Query (Mayor Impacto) - COMPLETADO
1. ✅ Reescrito `fetchOrders` en `useKitchenOrders.ts` para usar JOINs
2. ✅ Eliminados los 5 queries individuales por orden
3. **Resultado:** 1 query en lugar de N×5
4. **Archivo modificado:** `hooks/useKitchenOrders.ts` líneas 47-127

### Fase 2: Optimizar Timer 🟡
1. Crear componente `ElapsedTimer` separado
2. Mover el setInterval al componente individual
3. **Tiempo estimado:** 20 minutos
4. **Resultado esperado:** Menos re-renders, mejor fluidez

### Fase 3: Memoizar Componentes 🟡
1. Extraer `TicketCard` y `TicketItem` como componentes separados
2. Aplicar React.memo
3. **Tiempo estimado:** 25 minutos
4. **Resultado esperado:** Re-renders solo cuando cambia la orden específica

---

## Métricas Actuales

| Métrica | Valor Actual | Esperado Post-Optimización |
|---------|--------------|---------------------------|
| Queries por carga | N × 5 + 2 | 2 |
| Re-renders/segundo | N (todos) | 1 (solo timer) |
| Tiempo carga (5 órdenes) | ~3-5s | <500ms |

---

## Próximos Pasos Recomendados

1. ✅ **Implementar Fase 1** - Optimizar query con JOINs (mayor impacto)
2. ⏳ Fase 2 - Después de validar mejora de carga
3. ⏳ Fase 3 - Refinamiento de fluidez
