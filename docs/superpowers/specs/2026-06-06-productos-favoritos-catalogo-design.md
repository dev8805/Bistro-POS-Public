# Diseño: Productos favoritos con estrella en modo Catálogo

**Fecha:** 2026-06-06
**Módulo:** Modo Catálogo POS (`screens/MenuScreen.tsx`), `hooks/useProducts.ts`
**Doc relacionada:** `docs/caracteristicas/modo_catalogo_pos.md`

## Objetivo

Permitir marcar productos como **favoritos** con una estrella en las tarjetas del modo
Catálogo, y exponer un filtro virtual **"Favoritos"** en la barra de categorías para
acceder rápido a ellos.

## Decisiones de diseño (acordadas con el usuario)

| Decisión | Elección |
|----------|----------|
| Modelo de datos | **Marca aparte**: columna `is_favorite` en `products`. El producto conserva su `category_id` real. |
| Alcance | **Por negocio**: un solo estado compartido por todos los usuarios del negocio. |
| Vistas con estrella | **Desktop y móvil/tablet** (los dos grids del modo catálogo). |
| Chip "Favoritos" | **Virtual**, no es una fila en `categories`. Aparece **solo si hay ≥1 favorito**. |
| Posición del chip | **Después de "Todos"** (segunda posición). |
| Offline | **Requiere conexión**: update directo con UI optimista; si falla, revierte. |
| Color | **Profesional, no amarillo**: estrella emerald oscuro relleno / gris contorno. Sin textos ni íconos amarillos. |

## Arquitectura

### 1. Backend (Supabase, proyecto `pos2` / `hjjmwipqquynjopkswvu`)

Una migración:

```sql
ALTER TABLE products
  ADD COLUMN is_favorite boolean NOT NULL DEFAULT false;

CREATE INDEX idx_products_is_favorite
  ON products (business_id)
  WHERE is_favorite = true;
```

No se inserta ninguna fila en `categories`. "Favoritos" es un filtro virtual del frontend.

### 2. Capa de datos — `hooks/useProducts.ts`

- Mapear `is_favorite` (de Supabase) al objeto `Product` en `fetchProducts`.
- Incluir `is_favorite` en la cache local (localStorage) para que la UI optimista persista
  entre recargas mientras llega el fetch.
- Nueva función `toggleFavorite(productId: string, value: boolean)`:
  1. Actualiza el estado local de inmediato (UI optimista) y la cache.
  2. `UPDATE products SET is_favorite = value WHERE id = productId`.
  3. Si falla: revierte el estado local y muestra toast `"No se pudo guardar el favorito"`.
- Exponer `toggleFavorite` en el retorno del hook.

### 3. Tipos — `types.ts`

Agregar a la interfaz `Product`:

```ts
is_favorite?: boolean;
```

### 4. UI — Estrella en las tarjetas — `screens/MenuScreen.tsx`

Las tarjetas del modo catálogo están escritas **inline** en MenuScreen (no usan el
componente `components/ProductCard.tsx`, que es código muerto y NO se toca):

- Grid móvil/tablet: bloque `displayedProducts.map` ~línea 1418.
- Grid desktop: bloque `displayedProducts.map` ~línea 1580.

En ambos, dentro del contenedor de la imagen (que es `relative`), agregar un botón
estrella en la esquina **superior izquierda** (la derecha ya tiene el badge de precio):

- Ícono Material Symbols `star`.
- Favorito → relleno emerald oscuro (`text-[#102218]` / `text-emerald-700`, con
  `font-variation-settings` fill 1 o clase de relleno).
- No favorito → contorno gris (`text-gray-300 dark:text-gray-600`), fill 0.
- Fondo sutil semitransparente (`bg-white/80 backdrop-blur-sm`) para legibilidad sobre
  cualquier imagen.
- `onClick`: `e.stopPropagation()` + `e.preventDefault()` (para NO agregar el producto al
  carrito ni perder foco del buscador) → `toggleFavorite(product.id, !product.is_favorite)`.
- `aria-label` dinámico: "Marcar como favorito" / "Quitar de favoritos".

### 5. UI — Chip virtual "Favoritos" — `screens/MenuScreen.tsx`

- Constante `FAVORITES_ID = 'favorites'`.
- Bandera derivada `hasFavorites = useMemo(() => products.some(p => p.is_favorite), [products])`.
- En las barras de chips del modo catálogo (móvil ~1378 y desktop ~1530), insertar el chip
  **"Favoritos"** justo **después** del chip "Todos", **solo si** `hasFavorites`:
  - Ícono `star` + texto "Favoritos".
  - Estilo activo igual a los demás chips activos pero **sin amarillo**: usar emerald
    oscuro / gris según el design system. Confirmar tono en la fase visual del plan.
- `filteredProducts` (~línea 372): cuando `activeCategory === FAVORITES_ID`, filtrar por
  `p.is_favorite` en lugar de `category_id`.
- Si el usuario está parado en "Favoritos" y desmarca el último favorito, el chip
  desaparece; resetear `activeCategory` a `'all'` en ese caso para no quedar en una vista
  vacía sin chip seleccionado.

## Fuera de alcance (no se toca)

- `components/ProductCard.tsx` — código muerto (importado pero no renderizado).
- Modo Escáner/EAN.
- Offline / event-sourcing (decisión: requiere conexión).
- `ProductsScreen` (catálogo de gestión) — la estrella vive solo en el POS por ahora.

## Criterios de éxito

1. Click en la estrella marca/desmarca y persiste en Supabase (verificable recargando).
2. La estrella no agrega el producto al carrito ni roba el foco del buscador.
3. El chip "Favoritos" aparece tras "Todos" solo cuando hay ≥1 favorito, y filtra correctamente.
4. Funciona en desktop y móvil/tablet.
5. Sin colores amarillos en la estrella, el chip ni sus textos.
6. Sin conexión, el toggle revierte y avisa.
