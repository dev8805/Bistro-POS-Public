# Acceso Directo de Gastos en Pantalla de Inicio (PWA)

Documento que describe la arquitectura, funcionamiento técnico y experiencia de usuario de la característica que permite instalar o anclar un icono exclusivo de **"Gastos"** en la pantalla de inicio de teléfonos móviles y tablets.

---

## 1. Propósito y Contexto

En operaciones comerciales rápidas (tiendas, restaurantes, minimarkets), los administradores y operadores necesitan registrar salidas de dinero o pagos a proveedores de inmediato, sin tener que:
1. Abrir la app principal de Bistro POS.
2. Navegar a la pantalla de Inicio.
3. Tocar la tarjeta de Finanzas / Egresos.
4. Seleccionar la opción de Gastos dentro del menú desplegable.

Esta funcionalidad permite instalar un **icono dedicado llamado "Gastos" directamente en el escritorio del teléfono o tablet**, el cual al ser pulsado abre de golpe el formulario de **Registro de Gasto** (`ExpenseRegister`) en milisegundos.

---

## 2. El Desafío Técnico de los Navegadores Móviles

Por políticas de seguridad de Google (Chrome/Android) y Apple (Safari/iOS), ningún sitio web o PWA puede colocar un icono en el escritorio del sistema operativo silenciosamente o mediante una sola línea de código JavaScript arbitraria. Además, en una Single Page Application (SPA), el navegador tiende a instalar la app general (`/`) con el nombre raíz (`Bistro POS`).

Para resolver esto sin requerir que el usuario copie ni pegue enlaces, se implementó una **arquitectura de Sub-App / Multi-Manifest PWA**:

1. **Ruta dedicada (`/gastos`):** Provee una dirección web específica para el módulo de egresos.
2. **Manifiesto PWA independiente (`public/manifest-gastos.json`):** Declara una identidad propia ante el sistema operativo (`id: "bistro-pos-gastos"`) para que Android y Chrome no la confundan con la app general ni la sobreescriban.
3. **Disparador nativo de instalación (`beforeinstallprompt`):** Captura el evento del navegador en `index.html` para permitir la instalación con un solo toque desde la interfaz.
4. **App Shortcuts nativos en Android:** Registrados en el manifiesto principal para permitir arrastrar el atajo directamente desde el icono exterior de Bistro POS.

---

## 3. Arquitectura y Componentes

### 3.1. Manifiestos Dedicados (`manifest-gastos.json` y `manifest-fotoventa.json`)

Tanto **Gastos** como **Foto Venta** cuentan con su propio archivo manifiesto para declarar una identidad única ante el sistema operativo:
* `public/manifest-gastos.json`: `id: "bistro-pos-gastos"`, ruta `/gastos`, icono con la **G** roja (`/gasto-192.png`).
* `public/manifest-fotoventa.json`: `id: "bistro-pos-fotoventa"`, ruta `/foto-venta`, icono con la **E** verde esmeralda (`/foto-venta-192.png`).

### 3.2. Carga Dinámica en `index.html`

`index.html` evalúa en el primer milisegundo la ruta de entrada:
- Si la ruta es `/gastos`, enlaza `/manifest-gastos.json` y asigna `document.title = "Gastos - Bistro"`.
- Si la ruta es `/foto-venta`, enlaza `/manifest-fotoventa.json` y asigna `document.title = "Foto Venta - Bistro"`.
- Escucha y almacena en `window.__bistroInstallPrompt` el evento `beforeinstallprompt` para la instalación PWA.

### 3.3. Enrutamiento y Deep Linking en `App.tsx`, `HomeScreen.tsx` y `SellScreen.tsx`

* **`App.tsx` (`getInitialScreen`):**
  - Si la ruta es `/gastos` o `action=expense`, inicia en `Screen.HOME` y despliega el formulario de gastos.
  - Si la ruta es `/foto-venta` o `action=foto_venta` / `action=photo_order`, inicia de inmediato en `Screen.PHOTO_ORDER` (`PhotoOrderScreen.tsx`).
  - Al cerrar la pantalla o finalizar la venta, limpia la URL a `/` y restaura el manifiesto principal.
* **`HomeScreen.tsx`:**
  - Si detecta `/foto-venta`, navega automáticamente a `Screen.PHOTO_ORDER`.
  - Evita la redirección automática a la pantalla de venta en tablets cuando se entra por cualquiera de estos dos accesos directos.

### 3.4. Creación Nativa del Acceso Directo (App Shortcuts en Pantalla de Inicio)

Los accesos directos se crean de forma nativa a través del launcher de Android / iOS:
1. En la pantalla de inicio del teléfono o tablet, el usuario **mantiene presionado el icono de Bistro POS**.
2. El sistema despliega el menú contextual del launcher mostrando los atajos disponibles:
   - **"Foto Venta"**: Icono con la **E verde** (`/foto-venta-192.png`), abre de inmediato la cámara/escáner de comandas y notas de venta (`PhotoOrderScreen`).
   - **"Gastos"**: Icono con la **G roja** (`/gasto-192.png`), abre de inmediato el formulario de registro de gasto (`ExpenseRegister`).
3. El usuario **mantiene presionado cualquiera de los atajos y lo arrastra** a su pantalla de inicio para dejarlo como un icono directo e independiente.

---

## 4. Requisitos de Entorno (Local vs Producción)

| Entorno | ¿Se puede probar? | Detalle técnico |
| :--- | :---: | :--- |
| **PC (Local)** | ✅ Sí | Navegando a `http://localhost:5173/gastos` o `http://localhost:5173/foto-venta` (o vía `?action=foto_venta`). |
| **Móvil (Local HTTP)** | ❌ No | Los navegadores móviles bloquean `beforeinstallprompt` y la instalación de PWAs en IPs no seguras (`http://192.168.x.x`). |
| **Producción (HTTPS)** | ✅ Sí | Requisito indispensable para que Android registre y actualice el WebAPK con los atajos en el launcher. |

---

## 5. Pruebas y Validación

* **Pruebas Unitarias (`vitest`):**
  - `components/expense/AddToHomeScreenModal.test.tsx`: Valida renderizado, conmutación de pestañas Android/iOS y ciclo de cierre.
  - `components/expense/ExpenseActionsMenu.test.tsx`: Valida accesibilidad de opciones, gating por permisos y nombres accesibles sin regresiones.
* **Compilación de Producción:**
  - Verificada con `npm run build` (Vite v6 + VitePWA v1.2), generando `sw.js` y assets optimizados sin errores de tipado.

---

## 6. Ciclo de Actualización Automática de Atajos (Sin Desinstalar)

Para que al añadir o modificar atajos en el futuro los usuarios no tengan que desinstalar la app:
1. **Identidad Estable (`manifest.json`):** Definido `"id": "/"` permanente para asegurar actualizaciones in-place del WebAPK de Android.
2. **Servicio sin Caché (`firebase.json`):** Cabeceras `Cache-Control: no-cache, no-store, must-revalidate` para `**/manifest*.json`.
3. **Exclusión en Service Worker (`vite.config.ts`):** `globIgnores: ['**/manifest*.json']` y `runtimeCaching` con `NetworkOnly` evitan que Workbox congele el manifiesto en el almacenamiento offline.
4. **Disparador en Notificación de Actualización (`UpdateNotification.tsx`):** Al detectar y aplicar una nueva versión, se ejecuta un `fetch('/manifest.json', { cache: 'reload' })` que despierta la comprobación de actualización de Android/Chrome en segundo plano.
