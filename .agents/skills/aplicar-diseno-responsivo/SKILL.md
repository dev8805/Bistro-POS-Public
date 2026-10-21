---
name: aplicar-diseno-responsivo
description: Instruye sobre las mejores prácticas para diseño responsivo en Desktop, Tablet y Móvil. Úsese para adaptar componentes y pantallas a diferentes dispositivos garantizando legibilidad y funcionalidad profesional.
---

# Guía de Diseño Responsivo y Mejores Prácticas

Esta skill proporciona directrices detalladas para crear interfaces profesionales que se adapten fluidamente a dispositivos de escritorio, tabletas y móviles.

## Cuándo usar esta skill
- Al diseñar o refactorizar pantallas para soportar múltiples dispositivos.
- Cuando el usuario solicite que una vista sea "mobile-friendly" o responsiva.
- Para corregir problemas de visualización en pantallas pequeñas o grandes.
- Al definir estilos globales, tipografía y sistemas de grillas.

## Regla de Oro
**SIEMPRE revisa el botón, componente o pantalla existente en el proyecto antes de aplicar cambios.** Analiza su estructura actual para decidir la mejor estrategia de adaptación sin romper la funcionalidad.

## 1. Breakpoints y Anchos de Pantalla

Utiliza estos puntos de ruptura estándar para garantizar compatibilidad con la mayoría de los dispositivos modernos:

*   **Móvil (Portrait):** < 640px (Estándar recomendado: 360px - 480px para diseño base)
*   **Tablet (Portrait) / Móvil (Landscape):** 640px - 1023px
*   **Desktop / Laptop:** 1024px - 1439px
*   **Large Desktop:** ≥ 1440px

**Estrategia:** Diseña priorizando "Mobile First" (estilos base para móvil) y usa `min-width` media queries para pantallas más grandes.

## 2. Tipografía y Textos

La legibilidad es clave. Ajusta los tamaños para compensar la distancia de visualización.

| Elemento | Móvil (Base) | Tablet | Desktop | Notas |
| :--- | :--- | :--- | :--- | :--- |
| **H1 (Título Principal)** | 24px - 28px | 32px - 36px | 40px - 48px | Line-height apretado (1.2) |
| **H2 (Subtítulos)** | 20px - 24px | 26px - 28px | 32px - 36px | |
| **H3 (Secciones)** | 18px - 20px | 22px - 24px | 24px - 28px | |
| **P (Cuerpo de texto)** | 16px | 16px - 17px | 16px - 18px | Nunca menos de 16px en inputs para evitar zoom en iOS. |
| **Small / Caption** | 12px - 14px | 13px - 14px | 14px | |

**Mejores Prácticas:**
- Usa unidades relativas (`rem`) para fuentes y espaciados siempre que sea posible.
- **Desktop:** Aprovecha el espacio para fuentes más finas y con más aire.
- **Móvil:** Maximiza la legibilidad con fuentes ligeramente más gruesas si el fondo es complejo.

## 3. Elementos Interactivos (Botones y Enlaces)

En pantallas táctiles, el área de toque es crítica. En desktop, el estado `hover` es vital.

*   **Móvil / Tablet:**
    *   **Altura mínima:** 44px - 48px (Área táctil segura).
    *   **Ancho:** Frecuentemente `width: 100%` para fácil alcance con el pulgar.
    *   **Ubicación:** Elementos clave en la zona inferior ("Thumb Zone").
*   **Desktop:**
    *   **Altura:** 36px - 48px (Dependiendo de la jerarquía).
    *   **Ancho:** `auto` o ajustado al contenido.
    *   **Estados:** Implementar siempre estilos de `:hover` y `:focus` visualmente claros.

## 4. Tarjetas (Cards) y Contenedores

Las tarjetas deben adaptarse al espacio disponible sin perder estructura.

*   **Móvil:**
    *   **Layout:** 1 columna (Stack vertical).
    *   **Márgenes:** Reducidos (16px a los lados).
    *   **Interactividad:** Toda la tarjeta debería ser cliqueable si es el enlace principal.
*   **Tablet:**
    *   **Layout:** Grid de 2 o 3 columnas.
    *   **Espaciado:** Gap moderado (16px - 24px).
*   **Desktop:**
    *   **Layout:** Grid de 3, 4 o más columnas según densidad de datos.
    *   **Efectos:** Sombras suaves y efectos de elevación al hover.

## 5. Menús y Navegación

*   **Móvil:**
    *   Usa **Menú Hamburguesa**, **Bottom Navigation Bar** o **Tabs deslizzables**.
    *   Oculta opciones secundarias en "Más".
    *   Sticky header/footer para acciones primarias.
*   **Tablet:**
    *   Similar al móvil o Sidebar colapsado (iconos visibles).
*   **Desktop:**
    *   Sidebar lateral fijo o Top Navigation Bar expandido.
    *   Muestra todas las categorías principales directamente.

## 6. Formularios

*   **Móvil:**
    *   Etiquetas (Labels) encima de los inputs (Top-aligned) para maximizar ancho.
    *   Inputs con altura generosa (48px+).
    *   Teclados específicos: Usa `type="email"`, `type="tel"`, `inputmode="numeric"`.
*   **Desktop:**
    *   Etiquetas alineadas a la izquierda o arriba según diseño.
    *   Layouts multi-columna (ej. Nombre y Apellido en la misma fila).
    *   Uso sensato del tab-index.

## 7. Distribución y Layout (Consejos de Distribución)

El espacio en pantalla define la densidad de información.

### Desktop (Alta Densidad)
*   **Estrategia Dashboard:** Aprovecha el ancho para paneles laterales, tablas detalladas y widgets auxiliares.
*   **Tablas:** Muestra múltiples columnas. Permite ordenamiento y filtrado visible.
*   **Modales:** Pueden ser centrados y amplios.

### Tablet (Densidad Media)
*   **Híbrido:** Colapsa paneles laterales en iconos.
*   **Grid:** Pasa de lista vertical a grids de 2 columnas para aprovechar el ancho sin estirar excesivamente el contenido.

### Móvil (Foco Único)
*   **Linealidad:** Flujo de lectura vertical estricto. Una cosa a la vez.
*   **Ocultamiento Progresivo:** Muestra solo lo esencial (ej. en una lista de pedidos: ID, Estado, Total). Detalles en vista expandida o modal (sheet inferior).
*   **Tablas:** Transforma filas de tablas en tarjetas individuales (Card View) para evitar scroll horizontal excesivo.

## Lista de Verificación de Implementación

1.  [ ] **Identificar contexto:** ¿Qué hace el componente? ¿Es crítico?
2.  [ ] **Mobile First:** Definir estructura base (block, width 100%).
3.  [ ] **Media Queries:** Añadir `md:` y `lg:` (en Tailwind) para expandir layout.
4.  [ ] **Touch Targets:** Verificar alturas mínimas en botones móviles (44px+).
5.  [ ] **Tamaño de Texto:** Ajustar escalas tipográficas.
6.  [ ] **Prueba de contenido:** ¿Qué pasa si el título es muy largo? (Truncate vs Wrap).
7.  [ ] **Validación:** Comprobar en simulador de navegador (Chrome DevTools).
