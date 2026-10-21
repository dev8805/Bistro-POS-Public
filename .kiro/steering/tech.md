---
inclusion: always
---

# Stack Técnico

## Tecnologías principales

- **Frontend**: React 19, TypeScript 5.8, Tailwind CSS 3, Vite 6
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Edge Functions con Deno)
- **Auth**: Firebase (SMS OTP + Google OAuth) vinculado a Supabase via edge function `firebase-phone-auth`
- **IA**: Google Gemini Vision (escaneo de facturas `scan-invoice`, fotolistas `PhotoOrderScreen`)
- **Offline**: IndexedDB (`idb`) con Event Sourcing + cola de sincronización
- **Build**: Vite PWA + Capacitor Android
- **Impresión**: QZ Tray (WebSocket local + ESC/POS firmado) para térmicas 58mm/80mm, @react-pdf para PDFs

## Comandos

```bash
npm run dev      # servidor local (abre navegador automáticamente)
npm run build    # build producción → /dist (deploy en Firebase Hosting)
npm run preview  # previsualizar build
```

## Variables de entorno

```
VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
VITE_GEMINI_API_KEY          ← Gemini Vision (facturas, fotolistas)
VITE_GOOGLE_CLIENT_ID        ← Google OAuth
VITE_FIREBASE_*              ← Firebase Auth (SMS OTP)
VITE_GOUPC_API_KEY           ← Lookup EAN → Go-UPC API
VITE_GOOGLE_CSE_*            ← Custom Search Engine
VITE_DEVELOPER_EMAIL         ← Habilita sección "Soporte humano (Dev)" en Settings
VITE_VAPID_PUBLIC_KEY        ← Clave pública VAPID para Web Push
```

## Secrets en Supabase Edge Functions

```
TELEGRAM_BOT_TOKEN / TELEGRAM_SUPPORT_GROUP_ID / TELEGRAM_WEBHOOK_SECRET
SUPPORT_CLEANUP_SECRET / SUPPORT_PUSH_SECRET
VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT
RESEND_API_KEY
```

## Entorno de desarrollo

- **URL pública**: `https://dev.posbistro.online` → `localhost:3000` (Cloudflare Tunnel)
- **Túnel**: nombre `dev`, servicio de Windows (se inicia automáticamente)
- Firebase Auth, Google OAuth y Supabase ya están configurados para este dominio

## Design System

Paleta "Warm Bistro":
- Primary: `amber-400` (#fbbf24) / hover: `amber-500`
- Secondary: Emerald Dark `#102218`
- Fondo: `slate-50`

## Supabase — Regla crítica

NUNCA asumir el estado de la BD, funciones o migraciones a partir de los archivos locales en `supabase/`. Los archivos locales están desincronizados. Siempre verificar con MCP (list_tables, list_edge_functions, list_migrations) antes de cualquier análisis o cambio.
