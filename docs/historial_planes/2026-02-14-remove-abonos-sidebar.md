
# Remove Abonos from Sidebar Plan de Implementación

**Objetivo:** Eliminar la sección "Abonos" del sidebar en la vista de escritorio y asegurar que no aparezca en la vista móvil.
**Arquitectura:** Modificación directa del componente `Sidebar.tsx` para eliminar el botón y la lógica asociada.
**Tech Stack:** React, TypeScript.
---

### Tarea 1: Eliminar Abonos en Sidebar.tsx

**Archivos:**
- Modify: `components/Sidebar.tsx`

**Paso 1: Eliminar variables de estado**
Eliminar las siguientes líneas:
```typescript
const [showAbonosMenu, setShowAbonosMenu] = useState(false);
const abonosMenuRef = useRef<HTMLDivElement>(null);
```

**Paso 2: Eliminar bloque JSX**
Eliminar el bloque que renderiza el botón "Abonos" y su menú desplegable.
Busca el comentario `{/* Botón Abonos - acceso rápido */}` y elimina todo el bloque condicional siguiente.

**Paso 3: Verificar**
- Revisar que no queden referencias a `showAbonosMenu` o `abonosMenuRef`.
- Asegurar que la compilación sea exitosa (no puedo ejecutar, pero el análisis estático debe pasar).
