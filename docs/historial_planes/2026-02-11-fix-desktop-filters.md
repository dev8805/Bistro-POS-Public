# Fix Desktop Checkbox Visibility

**Objetivo:** Corregir el bug donde el checkbox de "Ver solo diferencias" se oculta en Desktop. La causa probable es que la inserción del bloque de resumen hace que el contenedor flex (`justify-between`) empuje o colapse los elementos finales, o que el contenedor de filtros no esté manejando bien su ancho.
**Arquitectura:** Ajustar las clases del contenedor padre y la distribución flex para asegurar que el resumen y los filtros convivan correctamente.
**Tech Stack:** React, TailwindCSS.

### Tarea 1: Asegurar visibilidad del checkbox

**Archivos:**
- Modify: `screens/InventoryScreen.tsx`

**Paso 1: Diagnóstico y Solución**
El contenedor principal es:
`flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 shrink-0`

Al insertar `renderSummaryContent(true)` en el medio:
1. Tabs
2. Summary (si `itemsWithDiff > 0`)
3. Filters

El bloque `Filters` tiene:
`flex items-center gap-2 lg:gap-3 shrink-0`
Dentro tiene un `input` con `w-full`.

Si el espacio es limitado, el `input` (que está en un `flex-1`) debería encogerse, pero si el Summary ocupa mucho espacio, podría estar causando problemas.

Sin embargo, el problema reportado es "se oculta el check". El check es el último elemento del bloque Filters.

Posible causa: Overflow. El contenedor padre no tiene overflow hidden.
Otra causa: `lg:hidden` accidental en el label del checkbox?
Revisando el código:
```tsx
<label className="flex items-center justify-center w-10 h-10 ... transition-all shrink-0 relative" title="Ver solo diferencias">
```
No tiene `lg:hidden`.

Hipótesis: El contenedor `renderSummaryContent(true)` puede tener márgenes (`mx-4`) que empujan demasiado contenido. O quizas al ser 3 elementos en un `justify-between`, el de en medio (Summary) se "come" el espacio si no se controla bien.

Solución:
1. Agrupar el Summary junto con los Tabs o separarlo claramente.
2. Hacer el input de búsqueda de ancho variable pero no greedy en exceso si hay poco espacio.
3. Asegurar que el contenedor principal tenga `flex-wrap` si es necesario o ajustar anchos.

Pero el usuario quiere que esté en la fila.
Vamos a ajustar el contenedor de filtros para que no sea empujado fuera.
El `Summary` tiene `px-6 mx-4`.

Voy a cambiar la estructura para que sea:
[ Left Group: Tabs + Summary ] [ Right: Filters ]
Esto asegura que el Summary esté pegado a los tabs y los filtros queden a la derecha, evitando el comportamiento tripartito de `justify-between` que puede ser impredecible con anchos variables.

**Cambio propuesto:**
Agrupar Tabs y Summary en un `div` flex.
```tsx
<div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 shrink-0">
    {/* Left Group */}
    <div className="flex items-center gap-4 flex-1 min-w-0">
         {/* Tabs */}
         <div className="...">...</div>
         {/* Summary */}
         {summary.itemsWithDiff > 0 && renderSummaryContent(true)}
    </div>

    {/* Filters (Right Group) */}
    <div className="flex items-center gap-2 lg:gap-3 shrink-0 lg:flex-none">
       ...
    </div>
</div>
```
Nota: `renderSummaryContent` tiene `mx-4`. Si lo agrupo, debo ajustar los márgenes.

**Paso 2: Implementación**
- Modificar el JSX para agrupar Tabs y Summary.
- Ajustar clases de `renderSummaryContent` para reducir márgenes y borders innecesarios si está pegado a los tabs.
- Quitar `mx-4` y usar `border-l` solamente para separar de los tabs.

Código del helper `renderSummaryContent`:
```tsx
    const renderSummaryContent = (isDesktop: boolean) => (
        <div className={`${isDesktop
            ? 'hidden lg:flex items-center gap-6 px-4 border-l border-gray-200 dark:border-gray-700 h-8' // Quitamos mx-4 y border-x derecho, solo border-l
            : ...
```

Estructura:
```tsx
<div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 shrink-0">
    <div className="flex items-center gap-4 overflow-x-auto no-scrollbar max-w-full lg:max-w-none">
        {/* Tabs */}
        {/* Summary */}
    </div>
    {/* Filters */}
</div>
```

Esto debería arreglar cualquier problema de layout que esté ocultando el checkbox al empujar el contenedor de filtros.
