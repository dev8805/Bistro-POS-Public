# Sistema de Códigos Promocionales - Plan de Implementación

**Objetivo:** Crear un sistema de códigos promocionales que permita activar suscripciones de 3 meses por $29,000 COP, con dos flujos de generación: admin manual y self-service con pago Wompi.

**Arquitectura:** Tabla `promo_codes` en Supabase que almacena códigos con tipo (admin/self-service), estado, expiración. Edge Function para validar y redimir códigos. Integración con Wompi existente para el flujo self-service. Los códigos se aplican durante el registro o desde la pantalla de suscripción.

**Tech Stack:** Supabase (tabla + RLS + Edge Function), React/TypeScript (frontend), Wompi (pagos self-service)

---

## ✅ Checklist de Progreso

- [x] **Tarea 1:** Migración DB `promo_codes` (tabla + RLS)
- [x] **Tarea 2:** Edge Function `manage-promo-codes` (generate, create-pending, activate, validate, redeem, list)
- [x] **Tarea 3:** Componente `PromoCodeGenerator` (panel admin en ProfileScreen)
- [x] **Tarea 4:** Campo de código promo colapsable en RegisterScreen + pasa código via localStorage
- [x] **Tarea 5:** Input código + validación + redención en `SubscriptionPlansScreen`
- [x] **Tarea 6:** Lógica expiración integrada en Edge Function (validate + redeem)
- [x] **Tarea 7:** Integración completa: RegisterScreen → localStorage → SubscriptionPlansScreen pre-llena código

---

## Resumen del Sistema — 2 Caminos de Suscripción

### 🟢 Camino 1: Código Admin (venta en calle)
- Admin genera código desde perfil → cliente paga $29,000 en efectivo
- Aplica código → **3 meses de suscripción** (no Wompi)
- Después → **$29,000/mes de por vida**

### 🟡 Camino 2: Trial gratuito (15 días)
- Negocio se registra → toma prueba gratis de 15 días (todo desbloqueado)
- Al terminar → paga **$29,000 por 2 meses** (primer cobro via Wompi)
- Después → **$29,000/mes de por vida**

### Tabla Comparativa

| Característica | Admin (vendedor) | Trial 15 días |
|---|---|---|
| Pago inicial | $29,000 efectivo | Gratis |
| Período inicial | 3 meses | 15 días |
| Primer cobro post-trial | N/A | $29,000 (2 meses) |
| Cobro recurrente | $29,000/mes | $29,000/mes |
| Formato código | `BISTRO-XXXX-XXXX` | N/A |

---

## Tarea 1: Migración de Base de Datos - Tabla `promo_codes`

**Archivos:**
- Create: `supabase/migrations/20260212_promo_codes.sql` (se aplica vía MCP)

**Paso 1: Crear la tabla promo_codes**

```sql
-- Tabla de códigos promocionales
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  type text NOT NULL CHECK (type IN ('admin', 'self_service')),
  
  -- Beneficio
  duration_months integer NOT NULL DEFAULT 3,
  price_cop numeric(12,2) NOT NULL DEFAULT 29000,
  
  -- Estado
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'pending_payment')),
  
  -- Expiración (NULL = sin expiración para admin codes)
  expires_at timestamptz,
  
  -- Pago Wompi (solo para self_service)
  wompi_transaction_id text,
  wompi_status text,
  buyer_email text,
  buyer_name text,
  
  -- Redención
  redeemed_by uuid REFERENCES auth.users(id),
  redeemed_business_id uuid REFERENCES public.businesses(id),
  redeemed_at timestamptz,
  
  -- Metadata
  created_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Trigger para updated_at
CREATE TRIGGER on_promo_codes_updated
  BEFORE UPDATE ON public.promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

-- Los admin pueden ver/crear todos los códigos
CREATE POLICY "Admin can manage promo codes"
  ON public.promo_codes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
      AND p.role = 'Administrador'
      AND p.business_id IS NOT NULL
    )
  );

-- Cualquier persona autenticada puede leer un código específico (para validarlo)
CREATE POLICY "Anyone can read single promo code"
  ON public.promo_codes
  FOR SELECT
  USING (true);

-- Cualquier persona autenticada puede redimir un código (update para marcar como usado)
CREATE POLICY "Authenticated users can redeem codes"
  ON public.promo_codes
  FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Los códigos self-service se pueden crear sin autenticación (después del pago)
CREATE POLICY "Insert self service codes"
  ON public.promo_codes
  FOR INSERT
  WITH CHECK (type = 'self_service');
```

**Paso 2: Verificar migración exitosa**
- Confirmar que la tabla existe y las policies están activas

---

## Tarea 2: Edge Function - `manage-promo-codes`

**Archivos:**
- Create: Edge Function `manage-promo-codes` (se despliega vía MCP)

**Funcionalidades:**
1. `POST /generate` — Admin genera códigos manualmente (status=active)
2. `POST /create-pending` — Self-service: genera código con status=pending_payment ANTES del pago
3. `POST /activate` — Después del pago Wompi exitoso, activa el código (status=active, expires_at=NOW()+24h)
4. `POST /validate` — Valida un código (no lo redime, solo verifica)
5. `POST /redeem` — Redime un código y activa suscripción de 3 meses

```typescript
// Pseudocódigo de la Edge Function
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  
  // CORS headers
  if (req.method === 'OPTIONS') return corsResponse();
  
  const body = await req.json();
  
  switch (action) {
    case 'generate':
      // Solo admin autenticados
      // Genera código formato BISTRO-XXXX-XXXX
      // Sin expiración, status='active'
      // Guarda en promo_codes con type='admin'
      break;
      
    case 'create-pending':
      // No requiere auth (usuario aún no se ha registrado)
      // Genera código formato PROMO-XXXX-XXXX
      // Status: 'pending_payment' (NO se puede usar aún)
      // Sin expiración todavía (se agrega al activar)
      // Guarda buyer_email y buyer_name
      // Retorna { code, id } para asociar con el pago Wompi
      break;
      
    case 'activate':
      // Recibe code + wompi_transaction_id
      // Verifica que la transacción Wompi es APPROVED
      // Actualiza el código:
      //   status: 'pending_payment' → 'active'
      //   expires_at: NOW() + 24 horas
      //   wompi_transaction_id, wompi_status
      // Retorna el código activado
      break;
      
    case 'validate':
      // Busca código en la tabla
      // Verifica status = 'active'
      // Verifica que no esté expirado (expires_at > NOW())
      // Retorna { valid: true/false, duration_months, reason }
      break;
      
    case 'redeem':
      // Requiere auth
      // Valida el código
      // Marca código como 'used'
      // Crea/actualiza business_subscription con:
      //   status: 'active'
      //   current_period_start: NOW()
      //   current_period_end: NOW() + duration_months meses
      //   next_billing_date: NOW() + duration_months meses
      // Retorna éxito
      break;
  }
});
```

**Generador de códigos:**
```typescript
const generateCode = (prefix: string): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin I,O,0,1 para evitar confusión
  const segment = () => Array.from({length: 4}, () => 
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
  return `${prefix}-${segment()}-${segment()}`;
};
```

---

## Tarea 3: Frontend - Panel Admin para Generar Códigos

**Archivos:**
- Create: `components/PromoCodeGenerator.tsx`
- Modify: `screens/ProfileScreen.tsx` (agregar acceso al generador)

**Descripción:**
- Componente modal/sección que se muestra en la pantalla de perfil del admin
- Botón "Generar Código Promocional"
- Al hacer clic, llama a la Edge Function con action=generate
- Muestra el código generado con opción de copiarlo al portapapeles
- Lista de códigos generados con su estado (activo/usado/expirado)

**UI Simplificada:**
```
┌──────────────────────────────────────┐
│  🎫 Códigos Promocionales           │
│                                      │
│  [Generar Nuevo Código]              │
│                                      │
│  Código generado: BISTRO-A3K7-M9P2  │
│  [📋 Copiar]  [📱 Compartir]        │
│                                      │
│  ── Historial ──                     │
│  BISTRO-A3K7-M9P2  ✅ Activo        │
│  BISTRO-F2H8-X4L6  🔴 Usado         │
│  BISTRO-B5D9-R7W3  ✅ Activo        │
└──────────────────────────────────────┘
```

---

## Tarea 4: Frontend - Opción Self-Service en Registro

**Archivos:**
- Modify: `screens/RegisterScreen.tsx`
- Create: `components/PromoCodePurchase.tsx`

**Descripción:**
- En la página de registro, agregar una sección colapsable/tab:
  "¿Tienes un código promocional?" con input para ingresar código
- Y debajo un botón: "Obtener código promocional - $29,000 COP (3 meses)"
- Al hacer clic en "Obtener código":
  1. Se llama a la Edge Function con action=create-pending → genera código con status=pending_payment
  2. Se abre el widget de Wompi con $29,000 COP (usando el code como referencia)
  3. Si el pago es APPROVED → se llama a action=activate → código pasa a status=active con 24h de validez
  4. Se muestra el código activado al usuario con opción de copiarlo
  5. Si el pago falla/se cancela → el código queda en pending_payment (inutilizable)

**Flujo del usuario:**
```
1. Usuario llega a RegisterScreen
2. Ve sección "¿Tienes un código?" → ingresa código existente
   O
   Hace clic en "Obtener código":
     a. Se genera código (pending_payment, no usable aún)
     b. Se abre Wompi para pagar $29,000 COP
     c. Pago exitoso → código se activa (24h de validez)
     d. Se muestra: "Tu código: PROMO-A3K7-M9P2 (válido por 24h)"
3. Completa registro normal + ingresa código
4. Al registrarse, se llama a la Edge Function con action=redeem
5. Se activa suscripción de 3 meses automáticamente
```

---

## Tarea 5: Frontend - Validación de Código en flujo de Suscripción

**Archivos:**
- Modify: `screens/SubscriptionPlansScreen.tsx`

**Descripción:**
- Agregar campo "Tengo un código promocional" en la pantalla de planes
- Si el usuario ingresa un código válido, se omite el pago
- Se llama a la Edge Function con action=redeem
- Se activa la suscripción de 3 meses

**UI:**
```
┌──────────────────────────────────────┐
│  ── O usa un código promocional ──   │
│                                      │
│  [________código________] [Aplicar]  │
│                                      │
│  ✅ Código válido: 3 meses gratis    │
│  [Activar Suscripción]               │
└──────────────────────────────────────┘
```

---

## Tarea 6: Cron/Cleanup - Expiración de Códigos Self-Service

**Archivos:**
- Modify: Edge Function `process-subscriptions` (agregar lógica de limpieza)
  O
- Create: Función SQL programada

**Descripción:**
- Los códigos self-service con `expires_at < NOW()` y `status = 'active'` se marcan como `expired`
- Esto se puede hacer:
  - Con un cron de Supabase (pg_cron)
  - O validando en tiempo real al momento del redeem (más simple)
  - **Recomendación:** Validar en tiempo real en la Edge Function (no requiere cron)

**Validación en la Edge Function:**
```sql
-- Al validar, simplemente chequear:
SELECT * FROM promo_codes 
WHERE code = $1 
  AND status = 'active' 
  AND (expires_at IS NULL OR expires_at > NOW());
```

---

## Tarea 7: Modificar AuthContext para soportar códigos

**Archivos:**
- Modify: `context/AuthContext.tsx`
- Modify: `screens/RegisterScreen.tsx`

**Descripción:**
- Agregar parámetro opcional `promoCode` al flujo de signUp
- Después del registro exitoso, si hay código, llamar a la Edge Function con action=redeem
- Esto activa la suscripción sin necesidad de ir a SubscriptionPlansScreen

---

## Orden de Implementación

| # | Tarea | Dependencia | Tiempo Est. |
|---|---|---|---|
| 1 | Migración DB `promo_codes` | Ninguna | 5 min |
| 2 | Edge Function `manage-promo-codes` | Tarea 1 | 20 min |
| 3 | Componente `PromoCodeGenerator` (Admin) | Tarea 2 | 15 min |
| 4 | `PromoCodePurchase` + Modificar `RegisterScreen` | Tarea 2 | 20 min |
| 5 | Input código en `SubscriptionPlansScreen` | Tarea 2 | 10 min |
| 6 | Lógica expiración (en Edge Function) | Tarea 2 | 5 min |
| 7 | Integrar código en flujo de registro | Tareas 4,5 | 10 min |

**Total estimado:** ~1.5 horas

---

## Consideraciones de Seguridad

1. **Solo admins generan códigos admin** — Verificado por JWT + rol en Edge Function
2. **Códigos self-service requieren pago verificado** — Se genera como pending_payment, solo se activa al confirmar pago Wompi
3. **Códigos son de un solo uso** — Status pasa de 'active' a 'used' al redimir
4. **Códigos pending_payment son inutilizables** — No pueden validarse ni redimirse hasta que se active el pago
4. **Expiración de 24h para self-service** — expires_at se valida en cada operación
5. **Formato resistente a confusión** — Sin caracteres ambiguos (I/1, O/0)
6. **RLS activo** — Cada política está scoped correctamente

---

## Notas Adicionales

- El precio de $29,000 COP está hardcodeado como el precio del plan Mensual actual, así que es consistente
- La duración de 3 meses es un buen incentivo para el cliente
- El formato del código (ej: `BISTRO-A3K7-M9P2`) es fácil de dictar por teléfono o compartir por WhatsApp
- Los códigos admin no expiran para que los puedas generar con anticipación antes de salir a vender
