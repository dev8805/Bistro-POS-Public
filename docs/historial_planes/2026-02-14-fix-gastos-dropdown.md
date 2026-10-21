# [UI Fix] Corrección de Posicionamiento del Menú "Gastos"

**Objetivo:** Corregir la alineación del menú desplegable "Gastos" en la versión desktop para que aparezca directamente debajo del botón correspondiente, mejorando la estética y experiencia de usuario.
**Arquitectura:** Se refactorizará la estructura del JSX en `SellScreen.tsx` para agrupar el botón y el menú en un contenedor con posicionamiento relativo. Esto permitirá que el menú (absoluto) se posicione con respecto a este contenedor específico en lugar del header completo.
**Tech Stack:** React, Tailwind CSS.

---

### Tarea 1: Verificación Inicial y Reproducción Mental
**Archivos:**
- Modify: `screens/SellScreen.tsx`

**Paso 1: Análisis del Problema (Ya realizado)**
- **Estado Actual:** El dropdown está al final del contenedor flex `div` (Línea 199) y usa `left-1/2 -translate-x-1/2`. Al ser hijo directo del header (que tiene `relative` en línea 144), se centra en la pantalla/header, no en el botón.
- **Solución Propuesta:** Encapsular el botón "Gastos" y el dropdown en un `div` con `class="relative"`.

### Tarea 2: Refactorización de Componentes en SellScreen.tsx

**Archivos:**
- Modify: `screens/SellScreen.tsx`

**Paso 1: Implementación de la corrección**
Cambiar la estructura actual:
```tsx
// Antes
<button onClick={() => handleTabClick('gastos')} ... >...</button>
<button ...>Mesas</button>
...
{showExpenseDropdown && <div ...>...</div>}
```

A la nueva estructura:
```tsx
// Después
<div className="relative">
    <button onClick={() => handleTabClick('gastos')} ... >...</button>
    {showExpenseDropdown && (
        <>
            <div className="fixed inset-0 z-40" onClick={() => setShowExpenseDropdown(false)}></div>
            <div className="absolute top-full left-0 mt-2 w-48 ... shadow-xl ...">
                 {/* ... contenido del dropdown ... */}
            </div>
        </>
    )}
</div>
<button ...>Mesas</button>
```

**Detalles de cambios CSS:**
1.  **Wrapper:** `relative`
2.  **Dropdown:**
    - Eliminar: `top-12`, `left-1/2`, `-translate-x-1/2`
    - Agregar: `top-full`, `left-0`, `mt-2` (para un pequeño margen)
    - Mantener: `absolute`, `z-50`, `w-48`, `bg-white`, etc.

**Paso 2: Modificación de Código**
Aplicar los cambios en `screens/SellScreen.tsx`.

### Tarea 3: Verificación Manual

**Paso 1: Revisión de código**
Asegurar que el `div` wrapper no rompa el layout flex del padre (el padre tiene `flex items-center gap-2`). El nuevo `div` será un hijo flex, así que respetará el gap.

**Paso 2: Validación Visual (Mental)**
- El botón "Gastos" estará dentro del `div relative`.
- El dropdown `absolute` buscará el `relative` más cercano -> el nuevo `div`.
- `top-full` lo pondrá justo debajo del botón.
- `left-0` lo alineará a la izquierda del botón.

---
**Nota Importante:** No se requiere crear nuevos archivos, solo modificar `SellScreen.tsx` de manera quirúrgica para no afectar la lógica de `handleTabClick` ni los otros botones.
