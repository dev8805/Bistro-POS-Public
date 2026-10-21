# Carga inicial de la app — AppLoader

## El problema que resuelve

Al recargar la página, la app pasa por tres fases asíncronas antes de poder mostrar contenido:

1. **Auth** — Supabase verifica la sesión activa (`getSession`)
2. **Perfil** — se busca el perfil del usuario en la tabla `profiles`
3. **Suscripción** — se consulta `business_subscriptions` para saber si el acceso está activo

Sin un loader unificado, cada fase mostraba su propio spinner (verde, blanco, etc.), produciendo un efecto de múltiples cargas encadenadas visualmente roto.

---

## Solución: AppLoader unificado

**Archivo:** `components/AppLoader.tsx`

Componente minimalista de pantalla completa (`fixed inset-0 z-50`) con el logo de Bistro y un spinner fino amber. Cubre todo el viewport mientras la app inicializa.

```
Logo Bistro (192px_fondoBlanco.png)
      ↕ 24px
Spinner fino amber (ring 2px, border-t-amber-400, animate-spin)
```

---

## Flujo de guards en App.tsx

Los guards están en `AppContent` (líneas ~2070–2188) y devuelven `<AppLoader />` en cada fase pendiente:

```
Recarga de página
      ↓
[loading=true]  →  <AppLoader />   ← auth verificando sesión
      ↓
[loading=false, profile cargado]
      ↓
[isCheckingSubscription=true]  →  <AppLoader />   ← suscripción verificando
      ↓
[hasActiveSubscription=false]  →  SubscriptionPlansScreen
      ↓
[Todo OK]  →  App principal con animate-fadeIn
```

**Resultado:** El usuario ve un único spinner (con logo) desde el inicio hasta que todo está listo, y el contenido aparece con un fade suave de 200ms.

---

## ProtectedRoute

`components/ProtectedRoute.tsx` también usa `<AppLoader />` en su guard de `loading`. Esto cubre los casos donde `ProtectedRoute` se renderiza antes de que `AppContent` haya procesado sus propios guards.

---

## HomeScreen en móvil: eager loading

`HomeScreen` es un componente lazy (`React.lazy`). En móvil, la app siempre inicia en `Screen.HOME`. Si el chunk no está descargado cuando los guards terminan, el `Suspense` mostraría un segundo `<AppLoader />` (produciendo el efecto de "doble spinner").

**Fix aplicado en `App.tsx` (línea ~15):**

```tsx
// El import se dispara inmediatamente al parsear App.tsx (antes del auth)
const _homeScreenChunk = import('./screens/HomeScreen');
const HomeScreen = React.lazy(() => _homeScreenChunk.then(m => ({ default: m.HomeScreen })));
```

Al disparar el import al nivel de módulo, el chunk de `HomeScreen` se descarga en paralelo con el auth y la suscripción (~1-1.5s de margen). Cuando los guards terminan, el chunk ya está cacheado y el `Suspense` resuelve instantáneamente.

**Regla:** No convertir esta línea a un lazy import normal (`React.lazy(() => import(...))`) sin este patrón — restauraría el doble spinner.

---

## Gate de catálogo: revelar Sidebar + contenido juntos (`appReady`)

### El problema

Los guards anteriores (auth, perfil, suscripción) liberan la app apenas el **usuario** está listo, pero **no esperan los datos del negocio**. En desktop la pantalla inicial es `Screen.SELL`, así que al recargar el usuario veía:

1. El `Sidebar` y el header de tabs de `SellScreen` aparecían de inmediato.
2. Dentro de `MenuScreen` se mostraban **skeletons** mientras cargaban productos y categorías.
3. En **modo catálogo**, las categorías y las tarjetas entraban "de golpe" al terminar la carga.

Es decir: la app se armaba a pedazos a la vista del usuario.

### La solución

Un segundo gate, posterior a los guards de usuario, que mantiene **todo el árbol montado pero invisible** hasta que el catálogo esté listo, y luego revela **Sidebar + contenido a la vez** con un fade-in.

**Bandera `appReady`** en `AppContent` (latch de una sola vez — una vez visible, nunca se vuelve a ocultar al navegar):

```tsx
const [appReady, setAppReady] = useState(false);
const handleSellContentReady = useCallback(() => setAppReady(true), []);
```

**Cómo se libera:**

| Caso | Cuándo se revela |
|---|---|
| Pantalla inicial **no** es `SELL` (móvil arranca en `HOME`, navegación normal) | De inmediato — no hay catálogo que esperar |
| Pantalla inicial es `SELL` | Cuando `MenuScreen` dispara `onReady` (productos **y** categorías cargados) |
| Fallback de seguridad | A los **3 s** pase lo que pase (ej. offline sin productos en caché) |

**Render gateado:**

```tsx
return (
  <>
    {!appReady && <AppLoader />}
    <div className={`... transition-opacity duration-300 ${appReady ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      {/* Sidebar + contenido, montados por detrás para que sus hooks carguen */}
    </div>
  </>
);
```

Mantener el árbol **montado** (no condicionar con `&&`) es clave: así `MenuScreen` y su hook `useProducts` cargan categorías por detrás y pueden disparar `onReady`. Si se desmontara, el gate nunca se liberaría (deadlock).

### Cadena de la señal `onReady`

`MenuScreen` reutiliza su propio estado `loading` interno (el mismo que controla los skeletons) para avisar hacia arriba:

```
MenuScreen (useEffect: if (!loading) onReady())
        ↓ prop onReady
SellScreen (prop onContentReady)
        ↓ prop onContentReady
App.tsx (handleSellContentReady → setAppReady(true))
```

`MenuScreen.loading = productsLoading || (hookData.loading && categories.length === 0)` — por eso el gate espera **tanto** productos como categorías, eliminando la aparición brusca del modo catálogo.

> **Nota:** la pestaña *Mesas* (`TablesScreen`) no está disponible en la UI actual, así que `SELL` siempre muestra `MenuScreen`. Si se reactivara, habría que cubrir ese sub-caso (que `TablesScreen` también reporte readiness o liberar solo con `productsLoading`).

---

## Archivos involucrados

| Archivo | Rol |
|---|---|
| `components/AppLoader.tsx` | Componente visual del loader |
| `App.tsx` líneas ~2070–2090 | Guards principales (auth, perfil, suscripción) |
| `components/ProtectedRoute.tsx` | Guard de auth en rutas protegidas |
| `App.tsx` línea ~15 | Eager load del chunk de HomeScreen |
| `App.tsx` (`appReady`, gate de render) | Gate de catálogo: revela Sidebar + contenido juntos |
| `screens/SellScreen.tsx` (`onContentReady`) | Reenvía la señal de readiness desde MenuScreen a App |
| `screens/MenuScreen.tsx` (`onReady`) | Dispara readiness cuando productos + categorías cargan |

---

*Creado: 2026-05-20*
*Actualizado: 2026-06-04 — gate de catálogo (`appReady`) para revelar Sidebar + contenido juntos*
