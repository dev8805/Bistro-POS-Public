# 📊 Reporte Verificado: Manejo de Fechas y Zonas Horarias
Fecha: 2026-02-16 | Verificado contra código y base de datos

---

## Resumen

Se analizó el reporte anterior y se verificó cada punto contra el código fuente y datos reales en Supabase. **El reporte original tenía imprecisiones importantes.** A continuación se presenta la verdad verificada.

---

## Verificación Punto por Punto

### ❌ Punto 1 (era "Crítico"): Inserción de Mermas — **FALSO**

El reporte decía que `useExpenses.ts:155` inserta mermas con `todayDateStringInTz()` (string truncado).

**Realidad:** El `ExpenseModal.tsx:236` envía `date: new Date().toISOString()` como parte del objeto `data`. En `useExpenses.ts:155`:
```
date: data.date || todayDateStringInTz()
```
Como `data.date` **siempre tiene valor** (un ISO timestamp completo), el fallback `todayDateStringInTz()` **nunca se ejecuta** en el flujo normal.

**Prueba en DB:** La merma más reciente tiene:
- `date`: `2026-02-17 04:01:54.736+00` (timestamp completo ✅)
- `date_bogota`: `2026-02-16 23:01:54.736` (correctamente mapeado al día local ✅)

**Veredicto:** La inserción de mermas es **correcta**. No hay bug aquí.

> ⚠️ **Pero:** Si alguien llamara a `createExpense()` sin pasar `date` (por ejemplo un futuro formulario), **sí caería en el fallback problemático**. Es buena práctica cambiar el fallback a `new Date().toISOString()` como medida preventiva.

---

### ⚠️ Punto 2 (era "Importante"): Filtro de Gastos en Dashboard — **PARCIALMENTE CIERTO, pero no es bug**

El reporte decía que filtrar `expenses.expense_date` con `toDateStringInTz()` es problemático.

**Realidad:** 
- `expense_date` es tipo `DATE` (no `TIMESTAMP WITH TIME ZONE`).
- Comparar `DATE >= '2026-02-16'` funciona perfectamente en PostgreSQL.
- `toDateStringInTz(dateRange.start)` genera el string correcto para la zona del negocio.
- La inserción también usa `todayDateStringInTz()` para gastos, lo cual es **correcto** porque guarda el día local del negocio en un campo `DATE`.

**Veredicto:** Funciona correctamente. No es un bug. La lógica es consistente: campo `DATE` ↔ filtro con string de fecha en zona del negocio.

---

### 🟡 Punto 3: Cálculo de "7 días" con `new Date()` — **VERDADERO, pero impacto bajo**

```typescript
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
```

**Realidad:** Sí usa el reloj del navegador. Si el dueño viaja a otra zona horaria, el rango se desplaza.

**Impacto real:** En un rango de 7 días (168 horas), un desfase de 5-14 horas representa ~3-8% del rango. No es crítico pero sí es inconsistente con el resto del código que usa `subtractDaysInTz()`.

**Veredicto:** Mejora recomendada, no bug crítico. `getDateRange()` en `DashboardScreen.tsx` ya usa `subtractDaysInTz(now, 6, tz)` para el período de "7 días" del selector. Esta consulta interna (query #15) debería hacer lo mismo por consistencia.

---

## ✅ Lo que SÍ funciona bien

| Componente | Estado | Notas |
|---|---|---|
| **Inserción de órdenes** | ✅ | Usa `new Date().toISOString()` |
| **Inserción de mermas** | ✅ | Modal envía ISO timestamp |
| **Inserción de gastos** | ✅ | Usa `todayDateStringInTz()` para campo `DATE` (correcto) |
| **Filtro de órdenes (Dashboard)** | ✅ | Usa `startISO`/`endISO` |
| **Filtro de mermas (Dashboard)** | ✅ | Corregido recientemente a `startISO`/`endISO` |
| **Filtro de gastos (Dashboard)** | ✅ | Usa `toDateStringInTz()` para campo `DATE` (correcto) |
| **Visualización de fechas** | ✅ | `SalesScreen`, `DashboardScreen` usan `timezone.ts` |
| **Inicio/fin de día** | ✅ | `startOfDayInTz`/`endOfDayInTz` calculan UTC correctamente |
| **Caja registradora** | ✅ | Filtra por `shift_id`, no por fecha |
| **Inventario** | ✅ | `purchase_date` usa `new Date().toISOString()` |

---

## 🔧 Mejoras Recomendadas (no son bugs, son hardening)

### 1. Fallback preventivo en `useExpenses.ts`
Cambiar el fallback de mermas para que **si algún día** se llama sin `data.date`, use un timestamp completo:
- **Archivo:** `hooks/useExpenses.ts:155`
- **Actual:** `date: data.date || todayDateStringInTz()`
- **Sugerido:** `date: data.date || new Date().toISOString()`

### 2. Consistencia en query #15 de Dashboard
- **Archivo:** `hooks/useDashboard.ts:327-328`
- **Actual:** `new Date()` + `setDate(-7)` (zona del navegador)
- **Sugerido:** Usar `subtractDaysInTz(nowInTz(), 7, timezone)` como ya hace `getDateRange()`

### 3. Tipo de columna `wastage.date`
La columna es `TIMESTAMP WITH TIME ZONE` pero su nombre sugiere que solo guarda una fecha. Funciona bien actualmente, pero a largo plazo podría causar confusión. No requiere acción inmediata.

---

## Conclusión

La aplicación maneja las zonas horarias **correctamente** en su estado actual. La librería `timezone.ts` está bien diseñada y se usa consistentemente donde importa. El único bug real que existía (filtro de mermas con string de fecha) **ya fue corregido** en la sesión anterior. Las mejoras listadas son preventivas, no correctivas.
