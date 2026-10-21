# Envío Profesional de Comprobantes por Email - Plan de Implementación

**Objetivo:** Permitir que el usuario envíe comprobantes de venta por email escribiendo solo el correo del destinatario, sin descargar ni adjuntar manualmente.

**Arquitectura:** Supabase Edge Function + Resend API + Modal de captura de email  
**Tech Stack:** React, TypeScript, Supabase Edge Functions, Resend, html2canvas

---

## Resumen Ejecutivo

| Aspecto | Detalle |
|---------|---------|
| **Complejidad** | Media-Alta |
| **Tiempo estimado** | 4-6 horas |
| **Costo mensual** | ~$0 (Resend free tier: 3,000 emails/mes) |
| **Requisitos** | Cuenta Resend, dominio verificado (opcional) |

---

## Arquitectura Propuesta

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Frontend      │     │  Supabase Edge   │     │   Resend    │
│  (React App)    │────▶│    Function      │────▶│    API      │
│                 │     │                  │     │             │
│ 1. Genera imagen│     │ 2. Recibe imagen │     │ 3. Envía    │
│ 2. Modal email  │     │    + destinatario│     │    email    │
│ 3. Envía a Edge │     │ 3. Envía a Resend│     │             │
└─────────────────┘     └──────────────────┘     └─────────────┘
```

---

## Opciones de Implementación

### Opción A: Resend API (Recomendada)
- **Pros:** Free tier generoso (3,000/mes), API simple, excelente deliverability
- **Contras:** Requiere verificar dominio para emails personalizados
- **Costo:** $0 hasta 3,000 emails/mes, luego $20/mes

### Opción B: SendGrid
- **Pros:** 100 emails/día gratis, muy establecido
- **Contras:** Proceso de verificación más estricto
- **Costo:** $0 hasta 100/día

### Opción C: SMTP del negocio (Gmail/Outlook)
- **Pros:** Sin costo adicional, usa el correo del negocio
- **Contras:** Límites de envío, configuración OAuth compleja
- **Costo:** $0

**Recomendación:** Opción A (Resend) por simplicidad y límites generosos.

---

## Componentes a Crear/Modificar

### Nuevos Archivos
| Archivo | Descripción |
|---------|-------------|
| `supabase/functions/send-receipt-email/index.ts` | Edge Function para enviar correo |
| `components/EmailReceiptModal.tsx` | Modal para capturar email del destinatario |

### Archivos a Modificar
| Archivo | Cambio |
|---------|--------|
| `lib/shareReceiptPDF.ts` | Nueva función `sendReceiptByEmail()` |
| `screens/SuccessScreen.tsx` | Integrar modal de email |
| `components/SuccessSidebar.tsx` | Integrar modal de email |
| `types.ts` | Agregar tipo `EmailReceiptRequest` |

---

## Tareas de Implementación

### Tarea 1: Configurar Resend

**Paso 1:** Crear cuenta en [resend.com](https://resend.com)

**Paso 2:** Obtener API Key desde Dashboard > API Keys

**Paso 3:** (Opcional) Verificar dominio para usar email personalizado del negocio

**Paso 4:** Guardar secret en Supabase
```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxx
```

---

### Tarea 2: Crear Edge Function

**Archivos:**
- Create: `supabase/functions/send-receipt-email/index.ts`

**Código:**
```typescript
import { Resend } from 'npm:resend@4.0.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

interface EmailRequest {
  to: string;
  businessName: string;
  total: number;
  date: string;
  imageBase64: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  try {
    const { to, businessName, total, date, imageBase64 }: EmailRequest = await req.json();

    const { error } = await resend.emails.send({
      from: `${businessName} <comprobantes@tudominio.com>`,
      to: [to],
      subject: `Comprobante de compra - ${businessName}`,
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">¡Gracias por tu compra!</h2>
          <p>Adjunto encontrarás tu comprobante de compra en <strong>${businessName}</strong>.</p>
          <p><strong>Total:</strong> $${total.toFixed(2)}<br>
          <strong>Fecha:</strong> ${date}</p>
          <p style="color: #666; font-size: 14px;">Este es un correo automático. Si tienes preguntas, contacta directamente al negocio.</p>
        </div>
      `,
      attachments: [
        {
          filename: `comprobante_${Date.now()}.png`,
          content: imageBase64,
        },
      ],
    });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
```

**Desplegar:**
```bash
supabase functions deploy send-receipt-email --no-verify-jwt
```

---

### Tarea 3: Crear Modal de Email

**Archivos:**
- Create: `components/EmailReceiptModal.tsx`

**Diseño:**
- Input para email del destinatario
- Botón "Enviar"
- Estado de carga
- Validación de email
- Mensaje de éxito/error

---

### Tarea 4: Actualizar shareReceiptPDF.ts

**Archivos:**
- Modify: `lib/shareReceiptPDF.ts`

**Nueva función:**
```typescript
export const sendReceiptByEmail = async (
  data: ReceiptData, 
  recipientEmail: string
): Promise<boolean> => {
  const blob = await generateReceiptImage(data);
  const base64 = await blobToBase64(blob);
  
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/send-receipt-email`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: recipientEmail,
        businessName: data.businessName,
        total: data.total,
        date: data.date,
        imageBase64: base64,
      }),
    }
  );
  
  return response.ok;
};
```

---

### Tarea 5: Integrar en SuccessScreen y SuccessSidebar

**Cambios:**
1. Importar `EmailReceiptModal`
2. Estado `showEmailModal: boolean`
3. Al hacer clic en "Correo", abrir modal
4. Modal llama a `sendReceiptByEmail()`

---

## Flujo de Usuario Final

1. Usuario completa venta → Pantalla de éxito
2. Clic en botón "Correo"
3. Se abre modal → Escribe email del cliente
4. Clic en "Enviar"
5. Sistema genera imagen del comprobante
6. Envía a Edge Function → Resend → Bandeja del cliente
7. Modal muestra "¡Enviado!" y se cierra

---

## Consideraciones de Seguridad

| Aspecto | Solución |
|---------|----------|
| Rate limiting | Limitar a 10 emails/minuto por business_id |
| Validación de email | Validar formato antes de enviar |
| CORS | Configurar solo para dominios autorizados |
| Protección de API | Usar `verify_jwt: true` si se requiere autenticación |

---

## Costos Estimados

| Servicio | Free Tier | Costo Excedente |
|----------|-----------|-----------------|
| Resend | 3,000 emails/mes | $20/mes (100k emails) |
| Supabase Edge Functions | 500,000 invocaciones/mes | Incluido en plan |

Para un negocio típico (50 ventas/día = 1,500/mes), el free tier de Resend es suficiente.

---

## Próximos Pasos

1. ✅ Decidir si proceder con la implementación
2. 🔲 Crear cuenta en Resend
3. 🔲 Configurar API Key en Supabase secrets
4. 🔲 Implementar Edge Function
5. 🔲 Crear modal de email
6. 🔲 Integrar en pantallas de éxito
7. 🔲 Probar flujo completo

---

**¿Deseas que proceda con la implementación?**
