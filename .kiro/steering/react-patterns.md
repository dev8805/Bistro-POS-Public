---
inclusion: fileMatch
fileMatchPattern: ["**/*.tsx", "**/*.ts"]
---

# Patrones React — BistroPOS

## Antes de crear algo nuevo

1. Verificar con búsqueda si ya existe un hook o componente similar
2. No duplicar lógica — reutilizar hooks existentes
3. Revisar `hooks/` y `components/` antes de inventar

## Estructura de un componente nuevo

```tsx
import { useState } from 'react';

interface NombreProps {
  // Props tipadas
}

const NombreComponente = ({ prop1, prop2 }: NombreProps) => {
  // Early returns para estados edge
  if (!data) return null;

  // Handlers con prefijo handle
  const handleClick = () => { /* ... */ };

  return (
    <div className="..." aria-label="..." tabIndex={0} onKeyDown={handleClick}>
      {/* UI */}
    </div>
  );
};

export default NombreComponente;
```

## Anti-patterns a evitar

- NO crear objetos/arrays inline como props: `style={{}}` o `data={[1,2,3]}`
- NO recrear funciones en cada render pasadas como props a hijos
- NO usar `useEffect` para derivar estado — usar `useMemo`
- NO dejar listeners/timers sin cleanup en useEffect
- NO hacer fetching directo en componentes — usar hooks dedicados

## Memoización — Solo cuando hay evidencia

- `React.memo()` solo en componentes que reciben props estables pero se re-renderizan
- `useMemo()` solo para cálculos costosos (no para todo)
- `useCallback()` solo para funciones pasadas a hijos memoizados
