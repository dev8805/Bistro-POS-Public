# Limpiar Historial de Caja - Plan de Implementación

**Objetivo:** Permitir al usuario eliminar el historial de turnos cerrados de la caja para mantener el listado limpio.
**Arquitectura:** Se agregará una función en el hook `useCashRegister` que elimine los registros de la tabla `cash_shifts` (solo los cerrados) en Supabase. Se expondrá esta función en la UI del historial.
**Tech Stack:** React, TypeScript, Supabase.

---

### Tarea 1: Implementar función `clearShiftHistory` en hook

**Archivos:**
- Modify: `hooks/useCashRegister.ts`

**Paso 1: Agregar función `clearShiftHistory`**
Se agregará una función que elimine los turnos con estado 'closed' o distintos a 'open'.

```typescript
    // Clear shift history (only closed shifts)
    const clearShiftHistory = useCallback(async (): Promise<boolean> => {
        if (!businessId) return false;

        try {
            setLoading(true);
            
            // Delete closed shifts
            // Note: This assumes cash_movements has ON DELETE CASCADE with cash_shifts
            const { error } = await supabase
                .from('cash_shifts')
                .delete()
                .eq('business_id', businessId)
                .neq('status', 'open'); // Don't delete active shift

            if (error) throw error;

            await fetchShifts();
            return true;
        } catch (err: any) {
            console.error('Error clearing history:', err);
            setError(err.message);
            return false;
        } finally {
            setLoading(false);
        }
    }, [businessId, fetchShifts]);
```

**Paso 2: Exponer función en el retorno**
Agregar `clearShiftHistory` al objeto retornado por el hook.

### Tarea 2: Agregar botón en `CashRegisterScreen`

**Archivos:**
- Modify: `screens/CashRegisterScreen.tsx`

**Paso 1: Agregar botón de limpieza en `renderHistoryView`**
Ubicar un botón en el encabezado de la sección de historial.

```tsx
// En renderHistoryView
<div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
    <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
        <span className="material-symbols-outlined text-gray-400">history</span>
        Historial de Turnos
    </h3>
    {shifts.length > 0 && (
        <button
            onClick={handleClearHistory}
            className="text-xs text-red-500 hover:text-red-700 font-bold flex items-center gap-1 transition-colors px-2 py-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
        >
            <span className="material-symbols-outlined text-sm">delete</span>
            Limpiar Historial
        </button>
    )}
</div>
```

**Paso 2: Implementar handler `handleClearHistory`**
Agregar la lógica de confirmación y llamada a la función.

```typescript
    const { clearShiftHistory } = useCashRegister(); // Asegurar destructuración

    const handleClearHistory = async () => {
        if (window.confirm('¿Estás seguro de que deseas borrar todo el historial de turnos cerrados? Esta acción no se puede deshacer.')) {
            const success = await clearShiftHistory();
            if (success) {
                showToast('Historial eliminado correctamente', 'success');
            } else {
                showToast('Error al eliminar historial', 'error');
            }
        }
    };
```

