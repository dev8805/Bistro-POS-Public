# Análisis y Propuesta de Columnas para Servicios

**Objetivo:** Enriquecer la pestaña de "Servicios" en `ProductsScreen.tsx` con métricas clave para negocios del sector servicios (reparaciones, belleza, consultoría), basándose en KPIs reales de rentabilidad y eficiencia operativa.
**Arquitectura:** Extender el modelo de datos de servicios para incluir métricas operativas y renderizarlas condicionalmente en la tabla cuando `activeTab === 'services'`.
**Tech Stack:** React, TypeScript, TailwindCSS
---

## 🔍 Investigación de Negocios Reales (SaaS POS)

En los negocios basados en servicios, el control no está en el stock físico, sino en el **tiempo** y el **rendimiento de la mano de obra**. Los sistemas profesionales de punto de venta y gestión de servicios rastrean métricas específicas. Las columnas de más alto valor para los dueños son:

1. **Duración (Tiempo Estimado):** El tiempo es el "inventario" de un negocio de servicios. Conocer la duración permite agendar, medir ocupación y evitar cuellos de botella.
2. **Rentabilidad por Hora (Labor Efficiency):** Un servicio que cuesta $100 y toma 3 horas ($33/hr) es menos rentable que uno de $50 que toma 30 minutos ($100/hr). Es el KPI definitivo para comparar servicios.
3. **Costo de Ejecución (Mano de Obra vs Materiales):** Desglosar cuánto cuesta brindar el servicio, incluyendo comisiones o pago al técnico, más insumos utilizados.
4. **Frecuencia de Retorno (Rebooking / Recurrencia):** Muchos de estos negocios dependen de clientes recurrentes (ej. mantenimientos de vehículos, cortes de cabello).

---

## 🛠️ Plan de Implementación

### Tarea 1: Extender la Interfaz de Datos

**Archivos:**
- Modify: `screens/ProductsScreen.tsx:11-23`

**Paso 1: Escribir test que falla / Definir tipos**
Primero definimos en los tipos que un servicio puede tener atributos de horas.

**Paso 3: Implementación mínima**
```typescript
interface ProductData {
    // ... existentes
    duration?: number; // Duración en minutos
    labor_cost?: number; // Costo por mano de obra/comisión
}
```

### Tarea 2: Agregar Headers para Servicios

**Archivos:**
- Modify: `screens/ProductsScreen.tsx` (sección de `<thead>` línea ~572)

**Paso 3: Implementación mínima**
Agregaremos las siguientes cabeceras sólo cuando `activeTab === 'services'`:

```tsx
{activeTab === 'services' && (
   <>
      <th className="w-[12%] px-4 py-3 text-left whitespace-nowrap">Duración</th>
      <th className="w-[15%] px-4 py-3 group relative cursor-help whitespace-nowrap text-left">
          <div className="flex items-center gap-1">
              Ingreso/Hora
              <span className="material-symbols-outlined text-[14px] text-gray-400">help</span>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-48 p-2 bg-gray-800 text-white text-[10px] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 normal-case font-normal text-center pointer-events-none">
              (Precio - Costo) dividido por el tiempo que toma el servicio. Clave para evaluar rentabilidad real.
          </div>
      </th>
   </>
)}
```

### Tarea 3: Modificar Cuerpo de la Tabla (Table Body)

**Archivos:**
- Modify: `screens/ProductsScreen.tsx` (sección del map de `filteredProducts`, en los `<td>`)

**Paso 3: Implementación mínima**
```tsx
{activeTab === 'services' && (
  <>
    {/* Columna Duración */}
    <td className="px-4 py-3 text-left">
       <div className="flex items-center gap-1.5">
           <span className="material-symbols-outlined text-[16px] text-gray-400">schedule</span>
           <span className="font-bold text-sm text-gray-900 dark:text-white">
               {product.duration ? `${product.duration} min` : 'N/A'}
           </span>
       </div>
    </td>

    {/* Columna Ingreso/Hora */}
    <td className="px-4 py-3 text-left">
       {(() => {
           if (!product.duration) return <span className="text-gray-400 text-xs">-</span>;
           const profit = (product.price ?? 0) - (product.cost ?? 0);
           const profitPerHour = profit / (product.duration / 60);
           return (
               <div className="flex flex-col">
                   <span className="text-sm font-bold text-status-success dark:text-status-success">
                       ${formatCurrency(profitPerHour)}<span className="text-xs text-gray-400 font-medium">/hr</span>
                   </span>
               </div>
           );
       })()}
    </td>
  </>
)}
```

### Tarea 4: Verificar alineación y anchos de columna

**Archivos:**
- Modify: `screens/ProductsScreen.tsx` (Ajustar anchos en la fila invisible `<tr>` y cabeceras)

**Paso 3: Implementación mínima**
Asegurar que la suma de porcentajes cuando `activeTab === 'services'` sea 100%. Por ejemplo:
- Ítem de Venta: 30%
- Duración: 12%
- Ingreso/Hora: 15%
- Precio: 11%
- Costo Unit: 10%
- Margen: 10%
- Acciones: 12%

*(El plan exacto para la refactorización de los anchos toma en consideración los arrays definidos)*.

### Próximos Pasos Recomendados:
1. Confirmar con el usuario si `duration` ya existe en la base de datos de Supabase o requiere una migración.
2. Autorizar la implementación basada en este plan.
