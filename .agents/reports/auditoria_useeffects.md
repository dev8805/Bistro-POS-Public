# Auditoría de useEffects - Bistro POS
Fecha: 2026-01-26

## Resumen
Se auditaron todos los useEffects con dependencias vacías `[]` en los hooks del proyecto.

## Resultados

### ✅ Correctos (No requieren cambios)

| Archivo | Línea | Razón |
|---------|-------|-------|
| `useKitchenOrders.ts` | 265-274 | Timer con `setOrders` (estable de useState), intencionalmente no depende de nada externo |
| `useKitchenOrders.ts` | 277-282 | Tiene dependencias correctas `[businessId, fetchOrders, fetchCompletedToday]` |
| `useKitchenOrders.ts` | 285-344 | Tiene dependencias correctas `[businessId, fetchOrders, fetchCompletedToday]` |
| `useSales.ts` | 425-429 | Tiene dependencias correctas `[businessId, fetchOrders]` |
| `useDelivery.ts` | 647-651 | Tiene dependencias correctas `[businessId, fetchActiveDeliveries]` |

### ⚠️ Patrones Optimizables (No son bugs)

| Archivo | Línea | Descripción |
|---------|-------|-------------|
| `useDelivery.ts` | 654-792 | `silentRefetch` definido dentro del useEffect - funciona pero redefine la función cada vez. Podría moverse afuera con useCallback |

### 📝 Conclusión

La mayoría de los useEffects están correctamente configurados. El equipo siguió buenas prácticas en general:

1. **Fetch inicial**: Siempre depende de `businessId` y funciones memoizadas
2. **Realtime subscriptions**: Correctamente limpian con `return () => ...`
3. **Timers**: Usan `[]` intencionalmente para ejecutarse una sola vez

No se encontraron bugs críticos de closures stale.
