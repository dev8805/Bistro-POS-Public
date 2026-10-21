# Bistro POS

Sistema de punto de venta para negocios minoristas en Colombia. PWA + Android híbrida orientada a tiendas y minimercados.

## Stack

- **Frontend**: React 19, TypeScript 5.8, Tailwind CSS 3, Vite 6
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions con Deno)
- **Auth**: Firebase (SMS OTP + Google OAuth) vinculado a Supabase via edge function `firebase-phone-auth`
- **IA**: Google Gemini Vision (escaneo de facturas `scan-invoice`, fotolistas `PhotoOrderScreen`)
- **Offline**: IndexedDB (`idb`) con Event Sourcing + cola de sincronización
- **Build**: Vite PWA + Capacitor Android
- **Impresión**: QZ Tray (WebSocket local + ESC/POS firmado) para térmicas 58mm/80mm, @react-pdf para PDFs

## Archivos clave

- `App.tsx` — router principal, layout global, detección desktop/móvil
- `screens/` — pantallas por módulo (MenuScreen, PaymentScreen, DashboardScreen, etc.)
- `components/` — componentes reutilizables; `components/ui/` para base
- `hooks/` — custom hooks (`useCashRegister`, `useOfflineSync`, `useProducts`, `usePermissions`, etc.)
- `lib/` — utilidades (timezone colombiana, export PDF/Excel, offline queue)
- `context/` — AuthContext, BusinessSettingsContext, ToastContext
- `supabase/functions/` — edge functions Deno
- `workers/` — Web Workers

## Módulos documentados

Cada módulo tiene su documentación en `docs/caracteristicas/`:

| Archivo | Módulo |
|---------|--------|
| `flujo_ventas_desktop.md` | MenuScreen (EAN, pistola USB, atajos) |
| `flujo_ventas_movil_tablet.md` | SellScreen (scanner, cámara, fotolistas) |
| `venta_por_peso_medida.md` | PriceInputModal (Kg, Lb, L, etc.) |
| `flujo_compra_inventario.md` | InventoryPurchase (escaneo factura IA) |
| `conteo_inventario.md` | InventoryScreen (ajustes, mermas) |
| `reporte_cierre_turno.md` | CashRegisterScreen (REPORTE DIARIO, métodos de pago, líneas del reporte) |
| `flujo_registro_mermas.md` | WasteRegister |
| `flujo_registro_gasto.md` | ExpenseRegister |
| `catalogo_productos.md` | ProductsScreen (diagnóstico de stock) |
| `flujo_creacion_productos.md` | SimpleProductScreen, ServiceProductScreen |
| `flujo_creacion_promociones.md` | PromoProductScreen (reglas, descuentos) |
| `flujo_importacion_excel.md` | Importación masiva (oculta temporalmente en UI) |
| `clientes_cuentas_cobrar.md` | ClientsScreen (aging, abonos) |
| `deudas_negocio.md` | DebtsScreen (cuentas por pagar) |
| `historial_ventas.md` | SalesHistoryScreen (listado, filtros, detalle) |
| `dashboard.md` | DashboardScreen (KPIs, gráficos) |
| `gestion_personal.md` | EmployeesScreen (roles, permisos) |
| `autenticacion_acceso.md` | LoginScreen, RegisterScreen |
| `perfil_usuario.md` | ProfileScreen (datos personales, foto) |
| `suscripciones_pagos.md` | SubscriptionScreen (planes, facturación) |
| `ajustes_facturacion.md` | SettingsScreen (datos negocio, impresora) |
| `impresion_termica_qz.md` | Impresión térmica con QZ Tray (firmado, instalador, presence) |
| `asistente_ia_rag.md` | RagChatScreen (chat IA con documentos) |
| `soporte_humano_telegram.md` | Escalación del chat IA al desarrollador vía Telegram Forum Topics |
| `modo_offline.md` | Arquitectura offline completa |
| `escaneo_facturas_ia.md` | Lógica Gemini + frontend |
| `lector_codigos_barras.md` | Pistola USB, fixes doble escaneo |
| `analitica_conversacional.md` | Edge Function `ai-chat` — analítica en lenguaje natural (sin frontend aún) |

## Design System

Ver [`docs/arquitectura/design_system.md`](./docs/arquitectura/design_system.md). Paleta "Warm Bistro":
- Primary: `amber-400` (#fbbf24) / hover: `amber-500`
- Secondary: Emerald Dark `#102218`
- Fondo: `slate-50`

## Variables de entorno

```
VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
VITE_GEMINI_API_KEY          ← Gemini Vision (facturas, fotolistas)
VITE_GOOGLE_CLIENT_ID        ← Google OAuth
VITE_FIREBASE_*              ← Firebase Auth (SMS OTP)
VITE_GOUPC_API_KEY           ← Lookup EAN → Go-UPC API
VITE_GOOGLE_CSE_*            ← Custom Search Engine
VITE_DEVELOPER_EMAIL         ← Habilita la sección "Soporte humano (Dev)" en Settings
VITE_VAPID_PUBLIC_KEY        ← Clave pública VAPID para Web Push (PWA instalada)
```

**Secrets en Supabase Edge Functions** (Dashboard → Project Settings → Edge Functions → Secrets):
```
TELEGRAM_BOT_TOKEN           ← Bot @AlejoAyuda_bot (soporte humano)
TELEGRAM_SUPPORT_GROUP_ID    ← chat_id del grupo "Bistro Soporte" (-100...)
TELEGRAM_WEBHOOK_SECRET      ← Para validar el webhook entrante de Telegram
SUPPORT_CLEANUP_SECRET       ← Para validar el cron job que limpia sesiones >24h
SUPPORT_PUSH_SECRET          ← Para validar la invocación interna telegram-webhook → send-support-push
VAPID_PUBLIC_KEY             ← Clave pública VAPID (debe coincidir con VITE_VAPID_PUBLIC_KEY)
VAPID_PRIVATE_KEY            ← Clave privada VAPID — solo backend
VAPID_SUBJECT                ← mailto:dev@dominio (requerido por la spec Web Push)
RESEND_API_KEY               ← Envío de emails (recibos, recordatorios)
```

## Comandos

```bash
npm run dev      # servidor local (abre navegador automáticamente)
npm run build    # build producción → /dist (deploy en Firebase Hosting)
npm run preview  # previsualizar build
```

## Entorno de desarrollo

Para probar en cualquier dispositivo (desktop, móvil, tablet) se usa un **Cloudflare Tunnel** con URL fija:

- **URL pública:** `https://dev.posbistro.online` → `localhost:3000`
- **Túnel:** nombre `dev`, instalado como servicio de Windows (se inicia automáticamente con el PC)
- **Cuenta Cloudflare:** Milenadelpilar79@gmail.com → Zero Trust → Networks → Connectors
- Solo se necesita tener `npm run dev` corriendo; el túnel no requiere atención

**Por qué existe:** Firebase Auth (Google OAuth + Phone/reCAPTCHA) exige que el origen esté en la lista de "Authorized Domains". Las IPs locales como `192.168.1.22` no se pueden agregar a Firebase. El dominio `dev.posbistro.online` ya está agregado en Firebase Console → Authentication → Configuración → Dominios autorizados.

### Auth configurada para dev.posbistro.online

Los tres servicios ya están configurados para aceptar `dev.posbistro.online`:

| Servicio | Qué se configuró |
|---------|-----------------|
| **Google Cloud Console** → OAuth 2.0 Client | Authorized JavaScript Origins: `https://dev.posbistro.online` / Authorized Redirect URIs: `https://dev.posbistro.online/__/auth/handler` |
| **Firebase Console** → Authentication → Dominios autorizados | `dev.posbistro.online` (tipo Custom) |
| **Supabase** → Authentication → URL Configuration → Redirect URLs | `https://dev.posbistro.online/` y `https://dev.posbistro.online/**` |

Si en el futuro se migra a otra URL de dev, deben actualizarse los tres lugares.

## Reglas de trabajo

- Español nativo en todas las respuestas
- Tono didáctico: explicar el contexto, no solo el código
- Implementar cambios asertivos — no pedir permiso para avanzar
- Respuestas breves y directas; no escribir muros de texto
- No citar código erróneo en el chat
- No abusar de comentarios en el código
- No sobreescribir código funcional ni crear problemas nuevos
- Scope estricto: solo cambiar lo directamente relacionado con el problema
- Al escribir componentes nuevos: versión más simple posible, fácil de depurar
- Si el error persiste en el segundo intento: dar un paso atrás y revisar el codebase completo
- Revisar `docs/caracteristicas/` antes de tocar cualquier módulo documentado
- **Supabase:** NUNCA asumir el estado de la BD, funciones o migraciones a partir de los archivos locales en `supabase/`. Siempre verificar con MCP (`list_tables`, `list_edge_functions`, `list_migrations`) antes de cualquier análisis o cambio relacionado con Supabase. Los archivos locales están desincronizados.
- **Identificación de negocios:** Cuando el usuario mencione un número de negocio (ej. "negocio 10000", "negocio 10002" o cualquier otro número), se refiere SIEMPRE a la columna `public_id` de la tabla `businesses` en Supabase (no al UUID `id`).
- **Git:** NUNCA hacer push (`git push`) a ningún repositorio remoto sin la autorización previa y explícita del usuario. Los commits locales están permitidos cuando se soliciten, pero hacer push está terminantemente prohibido sin autorización.
- Usar `early returns`, nombres descriptivos con prefijo `handle`, Tailwind para estilos
- Accesibilidad: `tabindex`, `aria-label`, `onKeyDown` en elementos interactivos