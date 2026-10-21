# Bistro POS

Sistema de punto de venta para negocios minoristas en Colombia (tiendas, minimercados, cafeterías). PWA + Android híbrida con soporte offline completo, impresión térmica local y flujos asistidos por IA.

- 🏠 Entorno de desarrollo: `https://dev.posbistro.online` → `localhost:3000` (Cloudflare Tunnel).
- 🎨 Stack: React 19 · TypeScript 5.8 · Tailwind CSS 3 · Vite 6 · Supabase · Firebase Auth · QZ Tray.

## Comandos

```bash
npm install       # instalar dependencias
npm run dev       # servidor local (abre navegador)
npm run build     # build de producción → /dist
npm run preview   # servir el build local
npm run test      # vitest (single run)
```

## Variables de entorno

Ver `.env` local y la lista completa en [`docs/README.md`](./docs/README.md) → sección _Reglas del proyecto_. Las principales:

```
VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
VITE_GEMINI_API_KEY          # Gemini Vision (facturas, fotolistas, RAG)
VITE_GOOGLE_CLIENT_ID        # Google OAuth
VITE_FIREBASE_*              # Firebase Auth (SMS OTP + Google)
VITE_GOUPC_API_KEY           # lookup EAN → Go-UPC
VITE_VAPID_PUBLIC_KEY        # Web Push (soporte humano)
VITE_DEVELOPER_EMAIL         # habilita panel "Soporte humano (Dev)"
```

## Estructura de alto nivel

```
Bistro/
├── App.tsx                   ← router principal, layout global
├── screens/                  ← una pantalla por módulo (Menu, Payment, Dashboard, …)
├── components/               ← UI reutilizable (base + composiciones)
├── hooks/                    ← hooks de negocio (useSales, useCashRegister, useOfflineSync, …)
├── context/                  ← Auth, BusinessSettings, Toast, ConfirmDialog
├── lib/                      ← utilidades (timezone, offline queue, thermal printer, …)
├── supabase/                 ← edge functions + migraciones
├── docs/                     ← 📖 documentación viva (empieza en docs/README.md)
├── CLAUDE.md                 ← overview técnico para asistentes/agentes
└── .kiro/steering/           ← reglas del proyecto (idioma, patrones, permisos, tech stack)
```

## Documentación

**Todo empieza en [`docs/README.md`](./docs/README.md)**: es el índice maestro con navegación por dominio (arquitectura, características, guías de usuario, historia).

Referencias rápidas:

- 🏛️ Arquitectura y decisiones técnicas → [`docs/arquitectura/`](./docs/arquitectura/)
- 🧩 Comportamiento real por módulo → [`docs/caracteristicas/`](./docs/caracteristicas/)
- 📖 Guías de usuario (dueño/cajero/mesero) → [`docs/guias_usuario/`](./docs/guias_usuario/)
- 🎨 Design system → [`docs/arquitectura/design_system.md`](./docs/arquitectura/design_system.md)
- 🗂️ Estado de la documentación → [`docs/auditoria_documentacion.md`](./docs/auditoria_documentacion.md)

## Reglas de trabajo

- Español nativo en toda comunicación (código puede tener nombres técnicos en inglés).
- Consultar `docs/caracteristicas/` antes de tocar cualquier módulo documentado.
- **Supabase**: nunca asumir el estado de la BD, funciones o migraciones a partir de los archivos locales. Verificar siempre con MCP (`list_tables`, `list_edge_functions`, `list_migrations`).
- Reglas completas en `.kiro/steering/` (se cargan automáticamente).

## Deploy

- **Firebase Hosting** (producción): `main` → `posbistro.online`.
- **Cloudflare Pages** (previews) según [`docs/arquitectura/flujo_entornos_github_supabase.md`](./docs/arquitectura/flujo_entornos_github_supabase.md).
- Edge Functions se despliegan con `npx supabase functions deploy` contra el proyecto correspondiente.

## Licencia

Propietario. Uso interno de Bistro POS.
