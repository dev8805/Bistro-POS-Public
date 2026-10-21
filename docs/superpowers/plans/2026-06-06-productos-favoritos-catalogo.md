# Productos Favoritos en Modo Catálogo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marcar productos como favoritos con una estrella en las tarjetas del modo Catálogo, con un chip virtual "Favoritos" (tras "Todos") que filtra esos productos.

**Architecture:** Columna `is_favorite` en `products` (alcance por negocio). App.tsx es la fuente de verdad del estado `products`; la estrella en MenuScreen despacha un `CustomEvent('favorite-toggled')` que App.tsx escucha para hacer update optimista + persistir en Supabase (mismo patrón ya usado por `inventory-updated` / `sale-completed`). El chip "Favoritos" es un filtro virtual del frontend, no una fila en `categories`.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres), Tailwind CSS, Material Symbols.

**Spec:** `docs/superpowers/specs/2026-06-06-productos-favoritos-catalogo-design.md`

**Nota sobre verificación:** el proyecto no tiene framework de tests (solo `dev`/`build`/`preview`). La verificación de cada tarea es `npm run build` (typecheck de TS) + prueba manual en `https://dev.posbistro.online` con `npm run dev` corriendo.

---

## File Structure

- **Migración Supabase** (vía MCP `apply_migration`): agrega `is_favorite` a `products`.
- `types.ts` — agrega `is_favorite?: boolean` a `Product`.
- `App.tsx` — mapea `is_favorite` en `fetchProducts` y en el realtime UPDATE; nuevo listener del evento `favorite-toggled` con update optimista, persistencia y revert.
- `screens/MenuScreen.tsx` — estrella en las dos tarjetas inline (móvil y desktop), chip virtual "Favoritos" en las dos barras de chips, filtro y reset.

No se toca `components/ProductCard.tsx` (código muerto, no se renderiza).

---

## Task 1: Migración — columna `is_favorite` en `products`

**Files:**
- Migración Supabase (proyecto `pos2`, id `hjjmwipqquynjopkswvu`) vía MCP `apply_migration`.

- [ ] **Step 1: Aplicar la migración**

Usar la herramienta MCP `apply_migration` con `project_id: "hjjmwipqquynjopkswvu"`, `name: "add_is_favorite_to_products"` y este SQL:

```sql
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_is_favorite
  ON products (business_id)
  WHERE is_favorite = true;
```

- [ ] **Step 2: Verificar que la columna existe**

Usar MCP `execute_sql` con `project_id: "hjjmwipqquynjopkswvu"`:

```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='products' AND column_name='is_favorite';
```

Esperado: una fila → `is_favorite | boolean | false | NO`.

- [ ] **Step 3: Commit (solo doc, la migración ya está en el remoto)**

No hay archivo local de migración que commitear (los archivos en `supabase/` están desincronizados, por regla del proyecto). Continuar sin commit en este paso.

---

## Task 2: Tipo `Product` — agregar `is_favorite`

**Files:**
- Modify: `types.ts` (interfaz `Product`, ~línea 65-81)

- [ ] **Step 1: Agregar el campo**

En `types.ts`, dentro de `export interface Product { ... }`, agregar después de `barcode?: string;`:

```ts
  is_favorite?: boolean;
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run build`
Expected: build OK (sin nuevos errores de TS).

- [ ] **Step 3: Commit**

```bash
git add types.ts
git commit -m "feat(favoritos): agregar is_favorite al tipo Product"
```

---

## Task 3: App.tsx — mapear `is_favorite` y manejar el toggle

**Files:**
- Modify: `App.tsx` — mapeo en `fetchProducts` (~línea 659-676), realtime UPDATE (~línea 463-468), nuevo `useEffect` listener.

- [ ] **Step 1: Mapear `is_favorite` al cargar productos**

En `App.tsx`, en `fetchProducts`, dentro de `mappedProducts = data.map((p: any) => ({ ... }))`, agregar el campo (después de `barcode: p.barcode`):

```ts
          barcode: p.barcode,
          is_favorite: p.is_favorite ?? false
```

(El `select('*')` ya trae la columna nueva, no hay que cambiar la query.)

- [ ] **Step 2: Propagar `is_favorite` en el realtime UPDATE**

En el handler de realtime (`channel('products-sync')`), en la rama `if (eventType === 'UPDATE' && newRecord)`, agregar `is_favorite` al merge para que el cambio se vea en otros dispositivos/usuarios del negocio:

```ts
            setProducts(prev => prev.map(p =>
              p.id === (newRecord as any).id
                ? { ...p, stock: (newRecord as any).stock, price: (newRecord as any).price, name: (newRecord as any).name, image: (newRecord as any).image_url || p.image, nicknames: (newRecord as any).nicknames || p.nicknames, is_favorite: (newRecord as any).is_favorite ?? p.is_favorite }
                : p
            ));
```

- [ ] **Step 3: Agregar el listener del evento `favorite-toggled`**

En `App.tsx`, junto a los otros listeners de eventos optimistas (después del `useEffect` de `wastage-stock-updated`, ~línea 564), agregar un nuevo `useEffect`. Hace update optimista, persiste en Supabase, refresca la cache offline, y revierte + avisa si falla:

```ts
  // Toggle de favorito (optimista) disparado desde las tarjetas del catálogo
  useEffect(() => {
    const handleFavoriteToggled = async (event: Event) => {
      const detail = (event as CustomEvent).detail as { productId: string; value: boolean };
      if (!detail?.productId) return;
      const { productId, value } = detail;

      // Update optimista
      let updated: Product[] = [];
      setProducts(prev => {
        updated = prev.map(p => (p.id === productId ? { ...p, is_favorite: value } : p));
        return updated;
      });
      saveSellProducts(updated).catch(() => { });

      const { error } = await supabase
        .from('products')
        .update({ is_favorite: value })
        .eq('id', productId);

      if (error) {
        console.error('[App] Error guardando favorito:', error);
        // Revertir
        setProducts(prev => {
          const reverted = prev.map(p => (p.id === productId ? { ...p, is_favorite: !value } : p));
          saveSellProducts(reverted).catch(() => { });
          return reverted;
        });
        appToast.showToast('No se pudo guardar el favorito', 'error');
      }
    };

    window.addEventListener('favorite-toggled', handleFavoriteToggled as EventListener);
    return () => window.removeEventListener('favorite-toggled', handleFavoriteToggled as EventListener);
  }, []);
```

- [ ] **Step 4: Verificar typecheck**

Run: `npm run build`
Expected: build OK (sin nuevos errores de TS).

- [ ] **Step 5: Commit**

```bash
git add App.tsx
git commit -m "feat(favoritos): mapear is_favorite y manejar toggle optimista en App"
```

---

## Task 4: MenuScreen — filtro virtual "Favoritos"

**Files:**
- Modify: `screens/MenuScreen.tsx` — constante + `hasFavorites` (~tras línea 321), `filteredProducts` (~línea 372), reset al desmarcar el último (nuevo `useEffect`).

- [ ] **Step 1: Agregar la constante `FAVORITES_ID` (a nivel de módulo)**

En `screens/MenuScreen.tsx`, cerca del top del archivo (después de los imports, antes del componente), agregar:

```ts
const FAVORITES_ID = 'favorites';
```

- [ ] **Step 2: Derivar `hasFavorites`**

Justo después del `useMemo` de `visibleCategories` (~línea 321), agregar:

```ts
    const hasFavorites = useMemo(() => products.some(p => (p as any).is_favorite), [products]);
```

- [ ] **Step 3: Incluir favoritos en el filtrado**

En `filteredProducts` (~línea 372), reemplazar la línea de `categoryMatch` para soportar el filtro virtual:

```ts
    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            const productCategoryId = (p as any).category_id || (p as any).category?.id;
            const categoryMatch = activeCategory === FAVORITES_ID
                ? !!(p as any).is_favorite
                : (!activeCategory || activeCategory === 'all' || productCategoryId === activeCategory);
            const searchLower = search.toLowerCase();
            const matchesName = p.name.toLowerCase().includes(searchLower);
            const matchesNickname = (p as any).nicknames?.some((nick: string) => nick.toLowerCase().includes(searchLower)) || false;
            const matchesBarcode = !!p.barcode && p.barcode.toLowerCase().includes(searchLower);
            const matchesSearch = matchesName || matchesNickname || matchesBarcode;
            return categoryMatch && matchesSearch;
        });
    }, [products, activeCategory, search]);
```

- [ ] **Step 4: Resetear a "Todos" si se desmarca el último favorito estando en "Favoritos"**

Después del bloque de `filteredProducts`, agregar:

```ts
    // Si estamos en el filtro Favoritos y ya no quedan favoritos, volver a "Todos"
    useEffect(() => {
        if (activeCategory === FAVORITES_ID && !hasFavorites) {
            setActiveCategory('all');
        }
    }, [activeCategory, hasFavorites]);
```

- [ ] **Step 5: Verificar typecheck**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 6: Commit**

```bash
git add screens/MenuScreen.tsx
git commit -m "feat(favoritos): filtro virtual Favoritos en MenuScreen"
```

---

## Task 5: MenuScreen — estrella en las tarjetas (móvil y desktop)

**Files:**
- Modify: `screens/MenuScreen.tsx` — tarjeta móvil (contenedor de imagen ~línea 1444) y tarjeta desktop (contenedor de imagen ~línea 1608).

La estrella se omite en promociones (id que empieza con `promo_`). Color: emerald cuando es favorito, gris cuando no. Fondo blanco translúcido para legibilidad. `stopPropagation`+`preventDefault` para no agregar el producto al carrito ni perder el foco del buscador.

- [ ] **Step 1: Estrella en la tarjeta MÓVIL**

En el grid móvil (`displayedProducts.map`, ~línea 1418), dentro del `<div className="w-full aspect-square rounded-[12px] ... relative ...">` (~línea 1444), justo después de la apertura de ese div (antes del `{(product.image ...)` ), agregar:

```tsx
                                                    {!String(product.id).startsWith('promo_') && (
                                                        <button
                                                            onPointerDown={(e) => e.preventDefault()}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                e.preventDefault();
                                                                window.dispatchEvent(new CustomEvent('favorite-toggled', { detail: { productId: product.id, value: !(product as any).is_favorite } }));
                                                            }}
                                                            className="absolute top-1.5 left-1.5 z-20 size-6 flex items-center justify-center rounded-full bg-white/80 dark:bg-black/50 backdrop-blur-sm shadow-sm active:scale-90 transition-transform"
                                                            aria-label={(product as any).is_favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                                                        >
                                                            <span
                                                                className={`material-symbols-outlined text-[16px] ${(product as any).is_favorite ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}
                                                                style={{ fontVariationSettings: `'FILL' ${(product as any).is_favorite ? 1 : 0}` }}
                                                            >
                                                                star
                                                            </span>
                                                        </button>
                                                    )}
```

- [ ] **Step 2: Estrella en la tarjeta DESKTOP**

En el grid desktop (`displayedProducts.map`, ~línea 1580), dentro del `<div className="aspect-square w-full max-h-[200px] rounded-[15px] overflow-hidden relative mb-3 ...">` (~línea 1608), justo después de la apertura de ese div, agregar el mismo botón:

```tsx
                                            {!String(product.id).startsWith('promo_') && (
                                                <button
                                                    onPointerDown={(e) => e.preventDefault()}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        e.preventDefault();
                                                        window.dispatchEvent(new CustomEvent('favorite-toggled', { detail: { productId: product.id, value: !(product as any).is_favorite } }));
                                                    }}
                                                    className="absolute top-2 left-2 z-20 size-7 flex items-center justify-center rounded-full bg-white/80 dark:bg-black/50 backdrop-blur-sm shadow-sm active:scale-90 transition-transform"
                                                    aria-label={(product as any).is_favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                                                >
                                                    <span
                                                        className={`material-symbols-outlined text-[18px] ${(product as any).is_favorite ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'}`}
                                                        style={{ fontVariationSettings: `'FILL' ${(product as any).is_favorite ? 1 : 0}` }}
                                                    >
                                                        star
                                                    </span>
                                                </button>
                                            )}
```

- [ ] **Step 3: Verificar typecheck**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 4: Verificación manual**

Con `npm run dev` corriendo, abrir `https://dev.posbistro.online` → Punto de Venta → modo Catálogo. En desktop y en móvil/tablet (DevTools responsive):
- Cada tarjeta (no promos) muestra una estrella arriba-izquierda.
- Click en la estrella la rellena en emerald y NO agrega el producto al carrito.
- Recargar la página: el favorito persiste.

- [ ] **Step 5: Commit**

```bash
git add screens/MenuScreen.tsx
git commit -m "feat(favoritos): estrella para marcar favoritos en tarjetas del catalogo"
```

---

## Task 6: MenuScreen — chip "Favoritos" tras "Todos"

**Files:**
- Modify: `screens/MenuScreen.tsx` — barra de chips desktop (después del botón "Todos", ~línea 1179) y barra de chips móvil (después del botón "Todos", ~línea 1389).

El chip aparece solo si `hasFavorites`, va justo después de "Todos", usa ícono `star` y color emerald cuando está activo (NO amarillo), gris cuando inactivo.

- [ ] **Step 1: Chip "Favoritos" en la barra DESKTOP**

En el bloque desktop, justo **después** del `</button>` del chip "Todos" (~línea 1179) y **antes** de `{visibleCategories.map(cat => (`, insertar:

```tsx
                                        {hasFavorites && (
                                            <button
                                                onPointerDown={(e) => e.preventDefault()}
                                                onClick={() => {
                                                    setActiveCategory(FAVORITES_ID);
                                                    setSearch('');
                                                    refocusSearchInput();
                                                }}
                                                style={{ borderWidth: 0, outline: 'none' }}
                                                className={`flex items-center justify-center gap-1 px-4 py-2 rounded-full text-xs font-semibold transition-all active:scale-95 select-none border-none ring-0 outline-none
                                                ${activeCategory === FAVORITES_ID
                                                        ? 'bg-emerald-700 text-white shadow-sm shadow-emerald-700/20 dark:shadow-none'
                                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                                            >
                                                <span
                                                    className="material-symbols-outlined text-[14px]"
                                                    style={{ fontVariationSettings: "'FILL' 1" }}
                                                >
                                                    star
                                                </span>
                                                Favoritos
                                            </button>
                                        )}
```

- [ ] **Step 2: Chip "Favoritos" en la barra MÓVIL**

En el bloque móvil, justo **después** del `</button>` del chip "Todos" (~línea 1389) y **antes** de `{visibleCategories.map(cat => (`, insertar:

```tsx
                                                    {hasFavorites && (
                                                        <button
                                                            onPointerDown={(e) => e.preventDefault()}
                                                            onClick={() => {
                                                                setActiveCategory(FAVORITES_ID);
                                                                setSearch('');
                                                                refocusSearchInput();
                                                            }}
                                                            style={{ borderWidth: 0, outline: 'none' }}
                                                            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs transition-colors shrink-0 outline-none border-none ring-0
                                                        ${activeCategory === FAVORITES_ID
                                                                    ? 'bg-emerald-700 text-white font-bold shadow-sm shadow-emerald-700/20 dark:shadow-none'
                                                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                                                        >
                                                            <span
                                                                className="material-symbols-outlined text-[14px]"
                                                                style={{ fontVariationSettings: "'FILL' 1" }}
                                                            >
                                                                star
                                                            </span>
                                                            Favoritos
                                                        </button>
                                                    )}
```

- [ ] **Step 3: Verificar typecheck**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 4: Verificación manual (flujo completo)**

Con `npm run dev` + `https://dev.posbistro.online`, modo Catálogo:
- Sin favoritos: NO aparece el chip "Favoritos".
- Marcar una estrella → aparece el chip "Favoritos" justo después de "Todos".
- Click en el chip → el grid muestra solo los favoritos; el chip activo se ve emerald (no amarillo).
- Desmarcar el último favorito estando en "Favoritos" → el chip desaparece y la vista vuelve a "Todos".
- Repetir en móvil/tablet (DevTools responsive).

- [ ] **Step 5: Commit**

```bash
git add screens/MenuScreen.tsx
git commit -m "feat(favoritos): chip virtual Favoritos tras Todos en barra de categorias"
```

---

## Self-Review (cobertura del spec)

- **Columna `is_favorite` + índice** → Task 1. ✅
- **Mapear is_favorite + UI optimista + revert/toast + cache** → Task 3. ✅
- **`is_favorite` en el tipo Product** → Task 2. ✅
- **Estrella en desktop y móvil, no roba foco ni agrega al carrito, no en promos** → Task 5. ✅
- **Chip virtual "Favoritos" tras "Todos", solo si hay favoritos, filtra, sin amarillo** → Tasks 4 y 6. ✅
- **Reset a "Todos" al desmarcar el último** → Task 4 Step 4. ✅
- **Sincronización por negocio (otros usuarios)** → Task 3 Step 2 (realtime). ✅
- **No tocar ProductCard.tsx / modo EAN / offline** → respetado. ✅

Consistencia de nombres: evento `favorite-toggled` (detail `{ productId, value }`), constante `FAVORITES_ID`, campo `is_favorite`, `hasFavorites` — usados igual en todas las tareas. ✅
