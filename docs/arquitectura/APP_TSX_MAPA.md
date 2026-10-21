# 🗺️ Mapa del App.tsx — BistroPOS

> **¿Por qué existe este documento?**
> `App.tsx` tiene **3 741 líneas** y es el cerebro de toda la aplicación.
> Este mapa te permite ir directo a la sección que necesitas sin tener que leerlo todo.

---

## ¿Qué hace App.tsx en términos simples?

Piénsalo como **el director de una orquesta**:
- Decide **qué pantalla mostrar** en cada momento.
- Guarda en memoria el **carrito de compras** y los **productos**.
- Le dice a cada pantalla **cómo comunicarse entre sí**.
- Procesa el **pago** cuando se completa una venta.
- Escucha cambios en tiempo real desde la base de datos (Supabase).
- Controla los gates iniciales (auth → perfil → suscripción → catálogo listo).

---

## 📍 Mapa de Secciones por Línea

| Sección | Líneas | ¿Qué hace? |
|---|---|---|
| **Imports** | 1–94 | Importa todas las pantallas, componentes y herramientas. Muchas pantallas se cargan con `React.lazy` |
| **`function AppContent()` — inicio** | 96 | Componente principal (bajo AuthProvider) |
| **Auth + retry de perfil** | 98–150 | Si el perfil no carga tras el login, reintenta con backoff exponencial hasta 10 veces |
| **Estado del turno de caja (indicador)** | 158–197 | Consulta ligera + eventos `shift-opened`/`shift-closed` para pintar el chip en MobileNavBar sin montar `useCashRegister` |
| **Detección de pantalla inicial (móvil vs desktop)** | 216–248 | Móvil arranca en HOME, desktop en SELL, salvo hash `#login`/`#register` |
| **Sincronización con historial del navegador (popstate)** | 258–298 | Botón "atrás" físico del celular |
| **Estado del carrito + hidratación** | 310–420 | `cart`, `activeTable`, `deliveryClient`, persistencia en localStorage. Reglas para no fugar items entre Orden Rápida y Mesas |
| **Sistema de modales/toasts** | 420–475 | Estados de todos los modales globales (`ProductModal`, `SimpleNoteModal`, `DeliveryClientModal`, etc.) |
| **Estado del chat de soporte (RAG)** | 475–500 | Montaje del widget, badge de no leídos |
| **Gate `appReady` + `InitialLoaderOverlay`** | 508–575 | Latch de una sola vez que revela Sidebar + contenido juntos cuando el catálogo está listo. Ver [`carga_inicial.md`](./carga_inicial.md) |
| **Fetch inicial productos + realtime `products-sync`** | 500–580 | Suscripción única a `products` y `categories`. Gate por permiso `canViewProducts` |
| **Listener `inventory-updated`** | 582–597 | Actualización optimista de stock desde `ExpenseModal` |
| **Listener `sale-completed`** | 599–645 | Baja de stock local tras vender (promos incluidas) |
| **Listener `wastage-stock-updated`** | 647–666 | Baja de stock local tras merma |
| **Listener `favorite-toggled`** | 668–700 | Toggle optimista de productos favoritos |
| **`fetchProducts`** | 733–830 | Trae catálogo POS desde Supabase (con fallback offline a IndexedDB) |
| **Efectos de sincronía y suscripciones adicionales** | 830–1073 | Presence, orders, notificaciones push, kitchen printer |
| **`handleConfirmOrder`** | 1074–1112 | Confirma orden de mesa (marca items como `preparing`) |
| **`handleToggleMobileMenu`** | 1113–1137 | Abre el menú "Más" (cierra caja si estaba abierta) |
| **`handleNavigate`** | 1138–1285 | Función principal de navegación entre pantallas + navigation lock |
| **`handleStartNewSale` / `handleClearCart`** | 1286–1345 | Inicia venta nueva o limpia el carrito |
| **`handleTableSelect`** | 1346–1490 | Selecciona mesa + carga la orden asociada con overlay de carga |
| **`handleRetryTableOrder`** | 1491–1497 | Reintento tras fallo al cargar la orden de una mesa |
| **`handleNewQuickOrder` / `handleClientSelect`** | 1498–1525 | Inicia orden rápida o asigna cliente de delivery |
| **`handleProductSelect` / `handleEditProduct` / `handleOpenSimpleNote`** | 1526–1550 | Manejo de selección y edición de productos del catálogo |
| **`handleAddWithSimpleNote`** | 1546–1550 | Atajo para agregar producto solo con nota |
| **`handleProductUpdate`** | 1551–1604 | Actualiza un producto tras editarlo desde el modal |
| **`handleAdminEditProduct`** | 1605–1635 | Ruteo a `Simple`/`Processed`/`Service`/`Promotion` según tipo |
| **🔑 `handleAddToOrder`** | 1636–2038 | Función más compleja: agrega un producto al carrito (3 modos: mesa, edición, local) |
| **`handleQuickAdd`** | 2039–2047 | Agrega desde tarjeta con etiquetas resueltas por modal (Escáner) |
| **`handleQuickAddIndividual`** | 2048–2195 | Alta directa creando **fila nueva** por cada tap (Modo Catálogo) |
| **`handleQuickAddWithQuantity`** | 2196–2203 | Alta con cantidad prefijada (Peso/medida) |
| **`removeFromCart`** | 2204–2238 | Eliminar del carrito (con guard optimista para mesas) |
| **`updateQuantity`** | 2239–2335 | Cambiar cantidad (con redondeo a 2 decimales) |
| **`updateCartItem`** | 2336–2349 | Actualiza descuentos / notas de un ítem |
| **🔑 `handleProcessPayment`** | 2350–2876 | Procesa el pago (online, offline, mesa, domicilio, split payments, crédito, abono inicial) |
| **`cartTotal` (`useMemo`)** | 2877–2893 | Calcula subtotal, descuento y total del carrito |
| **Animaciones de vuelo** | 2894–2905 | `handleAddAnimation` / `handleAnimationEnd` para el efecto de producto que vuela al carrito |
| **Guards de autenticación** | 2907–2972 | 3 gates: `loading` → `AppLoader`; sin login → pantallas públicas; sin perfil → retry; sin suscripción → `SubscriptionPlansScreen`. Ver [`carga_inicial.md`](./carga_inicial.md) |
| **`handleSellScreenTabSwitch`** | 3031–3066 | Cambio de tab en `SellScreen` (orden_rapida / mesa_activa) |
| **`handlePhotoOrderAdd`** | 3067–3080 | Agrega items desde `PhotoOrderScreen` (fotolistas OCR) |
| **JSX principal (`return (...)`)** | 3081–3654 | Layout global: Sidebar, contenido, modales, `MobileNavBar`, chat widget, banners, overlays |
| **`InitialLoaderOverlay` (componente separado)** | 3657–3701 | Cubre toda la app con logo hasta que auth + perfil + suscripción + catálogo estén listos. Se desvanece con fade-out |
| **`function App()` (root)** | 3702–3740 | Componente raíz con todos los providers (`AuthProvider`, `BusinessSettingsProvider`, `ToastProvider`, `ConfirmDialogProvider`). Detecta rutas públicas `/t/` (recibo público) y `/ch/` (historial cliente) para saltarse el auth |
| **`export default App`** | 3741 | |

---

## 🧩 Plan de División (cuando estés listo)

Estas son las partes que se pueden extraer sin romper nada:

### 1. `hooks/useAppNavigation.ts`
**Lo que contiene:** `handleNavigate`, la lógica del historial del navegador y el estado `currentScreen`.

**Beneficio:** Cada vez que haya un bug de navegación, vas directo aquí.

---

### 2. `hooks/useCart.ts`
**Lo que contiene:** El estado `cart`, `handleAddToOrder`, `handleQuickAddIndividual`, `removeFromCart`, `updateQuantity`, `updateCartItem`, `handleClearCart`, `cartTotal`.

**Beneficio:** Todo lo del carrito en un solo lugar. Es la parte más compleja del archivo (más de 500 líneas concentradas entre `handleAddToOrder` y los quick-adds).

---

### 3. `hooks/useAppProducts.ts`
**Lo que contiene:** `fetchProducts`, `loadProductsFromCache`, el efecto de tiempo real de productos, categorías y la hidratación del carrito.

> Nota: Renombrado como `useAppProducts` para no confundir con el hook de administración `useProducts`.

**Beneficio:** Si hay un bug con los productos que no cargan o el stock, buscas aquí.

---

### 4. `hooks/usePayment.ts`
**Lo que contiene:** `handleProcessPayment` completo (online + offline + split payments + crédito + abono inicial).

**Beneficio:** La función de pago tiene ~527 líneas. Extraída, es más fácil de depurar y probar.

---

### 5. `components/AppModals.tsx`
**Lo que contiene:** El JSX de `ProductModal`, `ProductEditModal`, `ProductOptionsModal`, `SimpleNoteModal`, `DeliveryClientModal`, `SendCommandaModal`, `MultiEjeNoticeModal`, `ForcedReloadModal`, `TableOrderLoadingOverlay`, y sus estados asociados.

**Beneficio:** Los modales no tienen lógica de negocio compleja; solo abrir/cerrar.

---

### 6. `components/AppLayout.tsx`
**Lo que contiene:** El JSX del layout principal (Sidebar, Main Content, MobileNavBar, GlobalSellTabs, banners como `GracePeriodBanner`, `InventoryCriticalAlert`, `OfflineIndicator`).

**Beneficio:** Los cambios de UI/CSS van aquí, sin tocar la lógica de negocio.

---

## ⚠️ Reglas para no romper nada al dividir

1. **No dividir sin verificar visualmente.** Después de cada extracción, revisar que la pantalla funcione igual.
2. **Empezar por los hooks**, no por el JSX. Los hooks son más seguros de extraer.
3. **Orden sugerido:** `usePayment` → `useCart` → `useAppProducts` → `useAppNavigation` → `AppModals` → `AppLayout`.
4. `handleAddToOrder` depende de `activeTableId`, `editingOrderId`, `cart`, `addItemToOrder`, `addItemToOrderById`. Deben pasarse como parámetros al hook.

---

## 📌 Cosas que NO deben cambiar al reorganizar

- La estructura de providers en `App()` (`AuthProvider`, `BusinessSettingsProvider`, `ToastProvider`, `ConfirmDialogProvider`).
- El sistema de `Screen.SELL` montado pero oculto (evita el parpadeo de imágenes al navegar).
- El `isLocalStockUpdateRef` (bloquea la doble resta de stock al vender).
- El eager import de `HomeScreen` en la línea 16 (`import { HomeScreen } from './screens/HomeScreen';`, **no** `React.lazy`). Si se convierte en lazy, reaparece el doble spinner en móvil.
- El `LandingScreen` sí es `React.lazy` (línea 17) porque solo se muestra a usuarios no autenticados en desktop.
- El componente `InitialLoaderOverlay` está definido **fuera** de `AppContent`, no adentro. Debe permanecer así para que su ciclo de vida sea independiente de los re-renders internos.
- Las rutas públicas `/t/` (recibo) y `/ch/` (historial cliente) se detectan en `function App()` **antes** del `AuthProvider` para renderizar sin login.

---

*Última actualización: 2026-07-12 — reindexación completa de rangos de línea tras crecimiento del archivo (2 702 → 3 741 líneas).*
