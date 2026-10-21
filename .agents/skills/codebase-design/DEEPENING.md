# Profundización de Módulos (Deepening)

La profundización es el proceso de tomar varios módulos o hooks pequeños y superficiales que causan "salto de archivos" y acoplamiento excesivo, y fusionarlos en un **módulo profundo con una interfaz limpia**.

---

## Las 4 Categorías de Dependencias en Bistro POS

Para saber cómo profundizar un módulo sin complicar las pruebas, clasifica sus dependencias:

### 1. En Proceso (In-process)
- Cálculos matemáticos, transformaciones de datos, validaciones de esquemas con Zod, formateadores de moneda o fecha.
- **Estrategia:** Fusión directa. No crees interfaces ni adaptadores. Pruébalos directamente a través de la función o hook principal.

### 2. Sustituibles Localmente (Local-substitutable)
- Estado en memoria, almacenamiento temporal (`localStorage`, `sessionStorage`, `IndexedDB` en memoria).
- **Estrategia:** Pueden sustituirse fácilmente en pruebas con Vitest usando implementaciones simuladas o in-memory.

### 3. Remotas Propias (Remote but owned)
- Tablas y Edge Functions de Supabase.
- **Estrategia (Puertos y Adaptadores):** Define una interfaz simple en el hook (el "puerto"). En producción, el adaptador llama a Supabase Client (`@supabase/supabase-js`). En tests de Vitest, un adaptador simulado en memoria devuelve datos predefinidos.

### 4. Externas Verdaderas (True-external)
- Pasarelas de pago (Wompi, Stripe), servicios de impresión térmica por WebSocket (QZ Tray), APIs fiscales.
- **Estrategia:** Aísla el SDK externo detrás de un único adaptador concreto. Tu código de Bistro nunca debe llamar directamente al SDK externo desde múltiples componentes.
