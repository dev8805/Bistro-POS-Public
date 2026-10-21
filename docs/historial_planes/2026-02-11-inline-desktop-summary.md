# Desktop Inventory Summary Layout Update

**Objetivo:** Mover el resumen de inventario (Items, Unidades, Valor) a la misma fila de los controles (Tabs y Filtros) **solo en versión Desktop**, manteniendo la funcionalidad y limpieza visual.
**Arquitectura:** Refactorizar el renderizado del resumen para inyectarlo en dos ubicaciones controladas por clases de responsividad CSS (`hidden lg:flex` vs `lg:hidden`).
**Tech Stack:** React, TailwindCSS.

### Tarea 1: Reposicionar Resumen en Desktop

**Archivos:**
- Modify: `screens/InventoryScreen.tsx`

**Paso 1: Extraer lógica de renderizado del resumen**
- Crear una constante `SummaryContent` dentro del componente (o un subcomponente memoizado) que contenga el JSX del resumen.
- Esto evita duplicar código lógico visual y facilita el mantenimiento.

**Paso 2: Modificar "Controls Container"**
- Insertar el `SummaryContent` dentro del `div` principal de controles, justo después de los Tabs y antes de los Filters.
- Aplicar clases: `hidden lg:flex items-center gap-4 mx-4 px-4 border-l border-r border-gray-200 dark:border-gray-700 h-10`.
- Esto hará que aparezca en el medio en pantallas grandes.

**Paso 3: Ajustar el resumen existente (Móvil)**
- Al contenedor del resumen actual (el que está debajo de los filtros), agregarle la clase `lg:hidden`.
- Esto asegura que en desktop no se vea duplicado, y en móvil se siga viendo como la barra compacta que hicimos antes.

**Diseño Desktop:**
`[Tab:Productos] [Tab:Ingredientes] | Items: 1  Unidades: 0.44  Valor: $100 | [Filtros...]`

**Código de Renderizado (Simplificado):**
```tsx
const renderSummaryContent = (isDesktop: boolean) => (
    <div className={`${isDesktop 
        ? 'hidden lg:flex items-center gap-6 px-4 border-x border-gray-200 dark:border-gray-700 h-8' 
        : 'bg-white dark:bg-surface-dark rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 lg:hidden shadow-sm'
    }`}>
        {/* Items */}
        <div className="flex items-center gap-2">
           ...
        </div>
        {/* Separators & content */}
        ...
    </div>
);
```

**Nota:** Es mejor renderizar dos bloques distintos con clases `hidden` inversas para evitar problemas de hidratación o layout complejos, o simplemente duplicar el bloque con clases distintas si es pequeño (lo cual es).

**Estrategia rápida:**
1. Crear variable `summaryContent` con el JSX interior.
2. Poner contenedor Desktop en la barra superior.
3. Poner contenedor Móvil abajo (con `lg:hidden`).

**Paso 4: Verificar**
- Desktop: Todo en una línea.
- Móvil: Resumen debajo de filtros.
