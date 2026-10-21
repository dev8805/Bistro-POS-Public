import { Resend } from 'npm:resend@4.0.0';

const resend = new Resend(Deno.env.get('RESEND_API_KEY'));

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

interface EmailRequest {
    to: string;
    businessName: string;
    businessPhone?: string;
    total: number;
    date: string;
    orderNumber?: number;
    pdfBase64?: string;
    imageBase64?: string;
    // New optional field for debt reminders
    emailType?: 'receipt' | 'debt_reminder';
    clientName?: string;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    try {
        const { to, businessName, businessPhone, total, date, orderNumber, pdfBase64, imageBase64, emailType, clientName }: EmailRequest = await req.json();

        const isDebtReminder = emailType === 'debt_reminder';

        const attachmentContent = pdfBase64 || imageBase64;

        // For receipts, attachment is required. For debt reminders, it's optional.
        if (!to || !businessName) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: to, businessName' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!isDebtReminder && !attachmentContent) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: pdfBase64 or imageBase64' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(to)) {
            return new Response(
                JSON.stringify({ error: 'Invalid email format' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const displayName = clientName || 'cliente';
        const formattedTotal = total.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

        const subject = isDebtReminder
            ? `Recordatorio de saldo pendiente - ${businessName}`
            : `Comprobante de compra${orderNumber ? ` #${orderNumber}` : ''} - ${businessName}`;

        const htmlBody = isDebtReminder
            ? `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9fafb;">
          <div style="background: white; border-radius: 16px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 28px;">
              <div style="display: inline-block; background: #fef2f2; border-radius: 50%; padding: 16px; margin-bottom: 16px;">
                <span style="font-size: 32px;">💳</span>
              </div>
              <h1 style="color: #111827; margin: 0; font-size: 22px; font-weight: 700;">Recordatorio de Pago</h1>
              <p style="color: #6b7280; margin-top: 8px; font-size: 15px;">De parte de <strong>${businessName}</strong></p>
            </div>

            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;">
              <p style="color: #6b7280; margin: 0 0 6px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">Saldo Pendiente</p>
              <p style="color: #dc2626; font-size: 36px; font-weight: 800; margin: 0;">$${formattedTotal}</p>
            </div>

            <p style="color: #374151; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
              Hola <strong>${displayName}</strong>, te recordamos que tienes un saldo pendiente con <strong>${businessName}</strong>.
              Por favor, acércate o comunícate con nosotros para ponernos al día.
            </p>

            ${businessPhone ? `
            <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
              <p style="color: #6b7280; font-size: 13px; margin: 0 0 4px;">Contáctanos:</p>
              <p style="color: #111827; font-size: 15px; font-weight: 600; margin: 0;">${businessPhone}</p>
            </div>
            ` : ''}

            <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
              Este es un aviso automático generado por ${businessName}.
            </p>
          </div>
        </div>
      `
            : `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #333; margin: 0; font-size: 24px;">¡Gracias por tu compra!</h1>
            <p style="color: #666; margin-top: 10px;">Tu comprobante está adjunto a este correo.</p>
          </div>
          
          <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
            <table style="width: 100%; border-collapse: collapse;">
              ${orderNumber ? `
              <tr>
                <td style="padding: 8px 0; color: #666;">Venta #:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #333;">${orderNumber}</td>
              </tr>
              ` : ''}
              <tr>
                <td style="padding: 8px 0; color: #666;">Negocio:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #333;">${businessName}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Total:</td>
                <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #22c55e; font-size: 18px;">$${total.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Fecha:</td>
                <td style="padding: 8px 0; text-align: right; color: #333;">${date}</td>
              </tr>
              ${businessPhone ? `
              <tr>
                <td style="padding: 8px 0; color: #666;">Contacto:</td>
                <td style="padding: 8px 0; text-align: right; color: #333;">${businessPhone}</td>
              </tr>
              ` : ''}
            </table>
          </div>
          
          <p style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
            Este es un correo automático generado por el sistema de punto de venta.<br>
            Si tienes alguna pregunta, contacta directamente al negocio.
          </p>
        </div>
      `;

        const emailPayload: Record<string, unknown> = {
            from: `${businessName} <ventas@posbistro.online>`,
            to: [to],
            subject,
            html: htmlBody,
        };

        if (!isDebtReminder && attachmentContent) {
            emailPayload.attachments = [
                {
                    filename: pdfBase64 ? `comprobante_${Date.now()}.pdf` : `comprobante_${Date.now()}.png`,
                    content: attachmentContent,
                },
            ];
        }

        const { error } = await resend.emails.send(emailPayload as Parameters<typeof resend.emails.send>[0]);

        if (error) {
            console.error('Resend error:', error);
            return new Response(
                JSON.stringify({ error: error.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        return new Response(
            JSON.stringify({ success: true, message: 'Email sent successfully' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        console.error('Function error:', error);
        return new Response(
            JSON.stringify({ error: (error as Error).message || 'Internal server error' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
