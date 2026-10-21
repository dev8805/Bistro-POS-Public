# Flujo de Trabajo: Entornos de Pruebas y Producción

Este documento define la estrategia para separar el entorno de desarrollo y pruebas del entorno de producción, evitando que los cambios se reflejen automáticamente en el dominio principal de los usuarios sin ser validados previamente.

## Arquitectura del Flujo de Trabajo

### 1. Repositorio en GitHub (Estrategia de 2 Ramas)
En lugar de subir los cambios directamente a la rama `main`, trabajaremos con dos ramas:
- **`main` (Producción)**: Representa la versión estable del proyecto. Solo recibe código que ya ha sido probado. Los despliegues desde esta rama van directamente al dominio oficial.
- **`pruebas` (Desarrollo)**: Tu rama de trabajo diario. Todos los cambios nuevos y correcciones se suben aquí primero. Cloudflare genera automáticamente un link de vista previa cada vez que subes cambios a esta rama.

### 2. Base de Datos en Supabase
Actualmente, tu organización en Supabase está en el plan **Free** (Gratuito). La funcionalidad nativa de "Branching" persistente en Supabase (para tener ramas de base de datos) es una característica de los planes de pago (Pro).
Por lo tanto, la mejor práctica oficial y más segura para el plan gratuito es tener **dos proyectos de Supabase independientes**:
- **Proyecto Producción (`pos2`)**: Contiene los datos reales de tus usuarios (aunque no haya aún, es vital para el futuro).
- **Proyecto de Pruebas (`pos2-pruebas`)**: Una réplica exacta de la estructura de producción, pero con datos ficticios. Aquí puedes modificar tablas, probar nuevas políticas RLS o borrar datos sin riesgo.

### 3. Conexión de Variables de Entorno y URLs en Cloudflare Pages
La gran ventaja de usar Cloudflare Pages es que gestiona los despliegues de prueba automáticamente:
- **Entorno de Producción (`main`)**: Cloudflare asume por defecto que tu rama `main` es el entorno de Producción. Deberás configurar este entorno para que use las credenciales (`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`) del proyecto **`pos2`**.
- **Entornos de Vista Previa / Pruebas (`pruebas`)**: Cualquier otra rama que subas a GitHub (como `pruebas`) será tratada automáticamente como un entorno de "Preview". Cloudflare generará un link seguro y gratuito cada vez que subas cambios (por ejemplo: `https://pruebas.tu-proyecto.pages.dev`). Este entorno se configurará para usar las credenciales del proyecto **`pos2-pruebas`**.

**¿Cómo separar la Base de Datos en Cloudflare?**
1. Ve a tu panel de Cloudflare -> Tu proyecto en Pages -> **Settings (Configuración)** -> **Environment variables (Variables de Entorno)**.
2. Añade la URL y la KEY de tu proyecto **`pos2`** (producción) y marca la casilla que dice **"Production"**.
3. Añade la URL y la KEY de tu proyecto **`pos2-pruebas`** (pruebas) y marca la casilla que dice **"Preview"**.
*(De esta forma Cloudflare sabrá a qué base de datos conectarse dependiendo de qué rama estés viendo).*

**¿Dónde encontrar el link de Pruebas (Preview URL)?**
- **En GitHub:** Al hacer push a la rama `pruebas`, verás un check verde junto a tu código. Al darle clic, Cloudflare te dará un enlace directo ("View Deployment").
- **En Cloudflare:** En la pestaña **"Deployments"** de tu proyecto, verás la lista de subidas; busca la rama `pruebas` y dale clic a su enlace.

---

## ¿Por qué esta es la mejor forma de trabajo?

1. **Seguridad de Datos Absoluta (Aislamiento Total):** Al ser proyectos distintos en Supabase, es imposible que un script de prueba elimine registros de la base de datos en producción. 
2. **Confianza al Desplegar:** Puedes ver exactamente cómo funcionará la aplicación (con base de datos y todo el flujo del frontend) en el entorno de pruebas antes de tocar el botón para subir a producción.
3. **Costo Cero:** Este flujo emula un entorno "Enterprise" sin tener que pagar planes premium de Supabase ni de GitHub. Cloudflare Pages ofrece entornos de "Preview" en sus planes gratuitos, y Supabase permite hasta 2 proyectos gratis por organización.
4. **Mínima Fricción:** Solo 2 ramas. Sin ceremonias innecesarias. Ideal para desarrollador individual.
5. **Escalabilidad:** El día de mañana, si tienes un equipo, solo agregas ramas `feature/*` que se fusionen hacia `pruebas` y listo.

---

## Flujo del Día a Día

Así se ve tu rutina de trabajo con este sistema:

```
1. Programas en tu computadora (apuntando a pos2-pruebas localmente)
2. Guardas los cambios y haces commit desde VS Code (tú decides el mensaje y el momento)
3. Subes a la rama `pruebas` desde la extensión de GitHub Pull Requests
4. Abres el link de Cloudflare Preview y verificas que todo funcione
5. Si todo está bien, abres un Pull Request de `pruebas` hacia `main` desde la extensión
6. Haces merge cuando lo decides
7. Cloudflare despliega automáticamente a producción (tu dominio real)
```

**Regla de oro:** El desarrollador decide cuándo crear ramas, hacer commits y abrir PRs. Todo el flujo de Git se gestiona manualmente desde VS Code a través de la extensión **GitHub Pull Requests**. Ningún agente ni script automatizado debe tomar esas decisiones.

---

## Estado de la Migración ✅ COMPLETADA

### Credenciales del Entorno de Pruebas
| Variable | Valor |
|---|---|
| **Project ID** | `xgdlaeigktfsitziiyek` |
| **Project URL** | `https://xgdlaeigktfsitziiyek.supabase.co` |
| **Anon Key** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.TU_ANON_KEY_DE_PRUEBAS` |

### Resumen de lo replicado en `pos2-pruebas`
| Elemento | Producción | Pruebas | Estado |
|---|---|---|---|
| Tablas | 37 | 36 | ⚠️ (+1 `rag_documents` en prod desde 2026-05-07) |
| Funciones SQL | 45 | 45 | ✅ |
| Triggers | 22 | 23 | ✅ (+1 auto_confirm) |
| Políticas RLS | 96 | 84 | ✅ (sin duplicados) |
| Índices | 111 | 109 | ✅ (sin duplicados) |
| Storage Buckets | 4 | 4 | ✅ |
| Realtime | 5 tablas | 5 tablas | ✅ |
| Cron Jobs | 2 | 2 | ✅ |
| Vault Secrets | 6 | 2 | ⚠️ (ver pendientes) |
| Plan de Suscripción | ✅ | ✅ | ✅ |
| Edge Functions | 26 | 8 | ⚠️ (pruebas tiene versión inicial desactualizada) |

### Lo que se replicó
- **36 tablas** con todas sus columnas, tipos, defaults, constraints (PKs, FKs, checks, unique)
- **45 funciones SQL** (get_user_business_id, is_admin, handle_new_user, deduct_inventory_complete, close_cash_shift, etc.)
- **84 políticas RLS** limpias (producción tiene 12 duplicadas que no se copiaron)
- **109 índices** optimizados (producción tiene 2 duplicados que no se copiaron)
- **4 storage buckets**: product-images, business-logos, avatars, Recursos
- **11 storage policies** para los buckets
- **5 tablas con Realtime**: profiles, products, orders, order_items, scan_events
- **2 cron jobs**: process-subscriptions (cada hora) y process-renewals (diario 1am)
- **Extensiones**: pg_cron, pg_net
- **Vault secrets**: project_url y anon_key del proyecto de pruebas

---

## Tareas Completadas ✅

> Todas las tareas de configuración del entorno de pruebas fueron completadas el **2026-05-04**.

### ✅ 1. Variables de Entorno en Cloudflare Pages
Configuradas en Cloudflare Pages → Settings → Environment Variables:
- **Production** → apunta a `pos2` (proyecto real)
- **Preview** → apunta a `pos2-pruebas` (proyecto de pruebas)

### ✅ 2. Rama `pruebas` creada en GitHub
Creada y publicada el 2026-05-04. Ahora activa localmente.
```
git checkout -b pruebas
git push -u origin pruebas
```
Todos los commits desde VS Code van a esta rama por defecto.

### ✅ 3. `.env` local actualizado
> **Nota (2026-05-04):** El archivo `.env` fue revertido a `pos2` (producción). Se decidió usar el proyecto real para las pruebas locales por el momento. Cuando se active `pos2-pruebas`, se deberá volver a cambiar a:
```
VITE_SUPABASE_URL=https://xgdlaeigktfsitziiyek.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### ✅ 4. Supabase CLI vinculado y Edge Functions desplegadas
Se ejecutaron exitosamente para la configuración inicial del entorno de pruebas:
```bash
npx supabase login
npx supabase link --project-ref xgdlaeigktfsitziiyek
npx supabase functions deploy --project-ref xgdlaeigktfsitziiyek
```
Funciones desplegadas inicialmente (8): `create-employee`, `delete-employee`, `generate-cost-formula`, `generate-payment-signature`, `get-brand-colors`, `scan-invoice`, `send-receipt-email`, `update-employee`.

> **Nota (2026-05-14):** Producción (`pos2`) tiene **26 edge functions** activas. El entorno de pruebas quedó desactualizado en este punto. Ver lista completa de funciones en `.agents/skills/gestionar-supabase/SKILL.md`.

---

## Pendiente (Opcional / Bajo Demanda)

### ⚠️ Vault Secrets de Wompi y Service Role
Solo necesario si vas a probar **pagos con Wompi** o **cron jobs de suscripciones** en el entorno de pruebas. Agregar desde el SQL Editor de `pos2-pruebas`:
```sql
SELECT vault.create_secret('TU_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY');
SELECT vault.create_secret('TU_LLAVE_PRIVADA_WOMPI', 'wompi_private_key');
SELECT vault.create_secret('TU_LLAVE_PUBLICA_WOMPI', 'wompi_public_key');
SELECT vault.create_secret('TU_SECRETO_INTEGRIDAD_WOMPI', 'wompi_integrity_secret');
```
Las llaves de Wompi para sandbox están disponibles en: [dashboard.wompi.co](https://dashboard.wompi.co)
